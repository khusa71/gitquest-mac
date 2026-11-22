/**
 * progress.json: learning path, completed missions, story position and the current attempt.
 * Loading never throws: a missing, corrupt or wrongly shaped file falls back to defaults
 * field by field. Saving is atomic (temp file + rename).
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LessonProgress } from '../shared/api';
import type { LearningPath } from '../shared/view-model';
import type { TypedCommand } from './model';

export interface StoryPosition {
  /** A mission id, or `root:<levelId>` right after a level's root was built. */
  readonly missionId: string;
  readonly stage: 'entry' | 'after';
}

export interface Attempt {
  readonly missionId: string;
  readonly commandsUsed: number;
  readonly hintsUsed: number;
  /** Commits that existed at mission entry (validators count new commits against them). */
  readonly entryCommits: readonly string[];
  /** Commands typed in this attempt, oldest first, the last MAX_COMMANDS kept (MissionContext.commands). */
  readonly commands: readonly TypedCommand[];
}

export const MAX_COMMANDS = 200;

/** The attempt's history with one more command, capped. */
export function withCommand(commands: readonly TypedCommand[], command: TypedCommand): TypedCommand[] {
  return [...commands, command].slice(-MAX_COMMANDS);
}

export interface Progress {
  readonly version: 1;
  readonly path: LearningPath | null;
  readonly completed: Readonly<Record<string, { readonly stars: 1 | 2 | 3 }>>;
  readonly current: string | null;
  readonly position: StoryPosition | null;
  readonly attempt: Attempt | null;
  /** Per level id: last slide shown and the last answer to each quiz question. */
  readonly lessons: Readonly<Record<string, LessonProgress>>;
}

export function emptyProgress(): Progress {
  return { version: 1, path: null, completed: {}, current: null, position: null, attempt: null, lessons: {} };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isTyped = (value: unknown): value is TypedCommand =>
  isRecord(value) && typeof value.command === 'string' && (value.exitCode === null || Number.isInteger(value.exitCode));

/** Keeps every well-formed field of an unknown value, defaults the rest. */
export function sanitizeProgress(raw: unknown): Progress {
  const base = emptyProgress();
  if (!isRecord(raw) || raw.version !== 1) return base;

  const pathValue = raw.path === 'agents' || raw.path === 'classic' || raw.path === 'self' ? raw.path : null;

  const completed: Record<string, { stars: 1 | 2 | 3 }> = {};
  if (isRecord(raw.completed)) {
    for (const [id, entry] of Object.entries(raw.completed)) {
      const stars = isRecord(entry) ? entry.stars : undefined;
      if (stars === 1 || stars === 2 || stars === 3) completed[id] = { stars };
    }
  }

  const pos = raw.position;
  const position: StoryPosition | null =
    isRecord(pos) && typeof pos.missionId === 'string' && (pos.stage === 'entry' || pos.stage === 'after')
      ? { missionId: pos.missionId, stage: pos.stage }
      : null;

  const att = raw.attempt;
  const attempt: Attempt | null =
    isRecord(att) &&
    typeof att.missionId === 'string' &&
    isCount(att.commandsUsed) &&
    isCount(att.hintsUsed) &&
    Array.isArray(att.entryCommits) &&
    att.entryCommits.every((hash) => typeof hash === 'string')
      ? {
          missionId: att.missionId,
          commandsUsed: att.commandsUsed,
          hintsUsed: att.hintsUsed,
          entryCommits: att.entryCommits as string[],
          // Older progress files have no history: start it empty rather than dropping the attempt.
          commands: Array.isArray(att.commands)
            ? att.commands.filter(isTyped).map((c) => ({ command: c.command, exitCode: c.exitCode })).slice(-MAX_COMMANDS)
            : [],
        }
      : null;

  const lessons: Record<string, LessonProgress> = {};
  if (isRecord(raw.lessons)) {
    for (const [id, entry] of Object.entries(raw.lessons)) {
      if (!isRecord(entry)) continue;
      const quiz: Record<string, string> = {};
      if (isRecord(entry.quiz)) for (const [q, o] of Object.entries(entry.quiz)) if (typeof o === 'string') quiz[q] = o;
      lessons[id] = { slide: isCount(entry.slide) ? entry.slide : 0, read: entry.read === true, quiz };
    }
  }

  return {
    version: 1,
    path: pathValue,
    completed,
    current: typeof raw.current === 'string' ? raw.current : null,
    position,
    attempt,
    lessons,
  };
}

export async function loadProgress(file: string): Promise<Progress> {
  try {
    return sanitizeProgress(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return emptyProgress();
  }
}

export async function saveProgress(file: string, progress: Progress): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(progress, null, 2)}\n`);
  await fs.rename(temp, file);
}

// Scoring --------------------------------------------------------------------

/** 3 stars at or under par, 2 up to par + 2, else 1 (web game rule). */
export function starsFor(used: number, par: number): 1 | 2 | 3 {
  if (used <= par) return 3;
  if (used <= par + 2) return 2;
  return 1;
}

const READ_ONLY = new Set(['status', 'log', 'diff', 'show', 'help']);
const BRANCH_WRITES = /^(-[dDmMcCfu]|--(delete|move|copy|force|set-upstream-to|unset-upstream|edit-description)\b)/;

/** Splits a shell line on && || ; | outside quotes. */
function segments(line: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quote !== null) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ';' || ch === '|' || ch === '&') {
      if ((ch === '|' || ch === '&') && line[i + 1] === ch) i++;
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

function countsOne(segment: string): boolean {
  const words = segment.split(/\s+/);
  while (words.length > 1 && /^[A-Za-z_]\w*=/.test(words[0] as string)) words.shift(); // GIT_SEQUENCE_EDITOR=true git …
  if (words[0] !== 'git') return false;
  const sub = words[1];
  if (sub === undefined || READ_ONLY.has(sub)) return false;
  if (sub === 'branch') {
    const args = words.slice(2);
    return args.some((arg) => !arg.startsWith('-') || BRANCH_WRITES.test(arg));
  }
  return true;
}

/**
 * How many commands of a terminal line count for stars: failed lines and
 * read-only or non-git commands count zero; `a && b` counts each git command.
 */
export function countedCommands(command: string, exitCode: number | null): number {
  if (exitCode !== 0) return 0;
  return segments(command).filter(countsOne).length;
}

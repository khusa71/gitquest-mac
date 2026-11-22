/**
 * Story chains on real git. Each level is its own arc: the level's root, then for each
 * mission its prelude and reference solution. A mission with its own `root` (standalone scenario)
 * starts a new segment of the chain: its root replaces everything before it. Every command gets a
 * fixed date (base + 1 minute per command of its segment), so a canonical rebuild always produces the same hashes.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as realgit from '../realgit';
import type { GitQuestPaths, Person } from '../realgit';
import type { RepoState } from '../shared/repo-types';
import { LEVEL_LIST, ORIGIN_URL, STORY_BASE_DATE, TEAMMATES, levelOf, type Level, type TeammateId } from './content';

export interface ChainPart {
  /** Mission id, or `root:<levelId>` / `root:<missionId>` (standalone mission) for a root part. */
  readonly owner: string;
  readonly kind: 'root' | 'prelude' | 'reference';
  readonly commands: readonly string[];
  readonly teammate?: TeammateId;
  readonly remote?: { readonly push: readonly string[] };
  readonly when?: (state: RepoState) => boolean;
  /** Minute offset of the first command from STORY_BASE_DATE. */
  readonly minute: number;
}

/** Story position right after a level's root was built. */
export function rootPosition(levelId: string): string {
  return `root:${levelId}`;
}

function levelFor(missionId: string): Level {
  const level = levelOf(missionId);
  if (level === undefined) throw new Error(`Unknown mission: ${missionId}`);
  return level;
}

/** A level's whole chain, flat and in order. Minutes restart at every root part. */
export function chainParts(level: Level): ChainPart[] {
  const parts: ChainPart[] = [];
  let minute = 0;
  const push = (part: Omit<ChainPart, 'minute'>) => {
    if (part.kind === 'root') minute = 0;
    parts.push({ ...part, minute });
    minute += part.commands.length;
  };
  push({ owner: rootPosition(level.id), kind: 'root', commands: level.root });
  for (const mission of level.missions) {
    if (mission.root !== undefined) push({ owner: rootPosition(mission.id), kind: 'root', commands: mission.root });
    for (const step of mission.prelude) push({ owner: mission.id, kind: 'prelude', ...step });
    push({ owner: mission.id, kind: 'reference', commands: mission.reference });
  }
  return parts;
}

/**
 * The segment's root (the level's, or the latest standalone mission's at or before this one)
 * + the earlier missions' prelude and reference + this mission's prelude.
 */
export function canonicalEntryParts(missionId: string): ChainPart[] {
  return entryParts(levelFor(missionId), missionId);
}

/** canonicalEntryParts for a given level (pure). */
export function entryParts(level: Level, missionId: string): ChainPart[] {
  const parts = chainParts(level);
  const end = parts.findIndex((part) => part.owner === missionId && part.kind === 'reference');
  let start = end;
  while (start > 0 && parts[start]?.kind !== 'root') start--;
  return parts.slice(start, end);
}

export function preludeParts(missionId: string): ChainPart[] {
  return chainParts(levelFor(missionId)).filter((part) => part.owner === missionId && part.kind === 'prelude');
}

/**
 * Position from which `missionId`'s prelude applies: the previous mission of its level (after), or the
 * level root. Null for a standalone mission (own `root`): it is always rebuilt unless resumed.
 */
export function previousPosition(missionId: string): string | null {
  const level = levelFor(missionId);
  const index = level.missions.findIndex((mission) => mission.id === missionId);
  if (level.missions[index]?.root !== undefined) return null;
  return index === 0 ? rootPosition(level.id) : (level.missions[index - 1] as { id: string }).id;
}

export function rootParts(levelId = 'foundations'): ChainPart[] {
  const level = LEVEL_LIST.find((l) => l.id === levelId);
  if (level === undefined) throw new Error(`Unknown level: ${levelId}`);
  // Only the level's own root: a standalone mission's root (a capstone) is a separate segment.
  return chainParts(level).filter((part) => part.kind === 'root' && part.owner === `root:${level.id}`);
}

export function storyDate(minute: number): string {
  return new Date(STORY_BASE_DATE + minute * 60_000).toISOString().replace('.000Z', 'Z');
}

export interface RunOptions {
  readonly paths: GitQuestPaths;
  readonly env: NodeJS.ProcessEnv;
  readonly player: Person;
  /** Online levels: the player's GitHub login, filled into `{login}` (SANDBOX_URL in the level's root). */
  readonly githubLogin?: string | null;
}

/** `{login}` → the GitHub login; a command needing it without one fails with what to do. */
function withLogin(command: string, login: string | null | undefined): string {
  if (!command.includes('{login}')) return command;
  if (login == null || !/^[A-Za-z0-9-]+$/.test(login)) {
    throw new Error('This level clones your sandbox repo from GitHub: sign in first with gh auth login.');
  }
  return command.replaceAll('{login}', login);
}

/**
 * Runs chain parts against a real repo. Throws on the first failing command.
 * A part with `remote` runs in the teammate's fresh clone of origin, then pushes its refs.
 */
export async function runParts(repoDir: string, parts: readonly ChainPart[], opts: RunOptions): Promise<void> {
  const { paths, env, player } = opts;
  for (const part of parts) {
    if (part.when !== undefined) {
      const remoteDir = (await exists(paths.remote)) ? paths.remote : undefined;
      if (part.when(await realgit.readRepoState(repoDir, { env, ...(remoteDir === undefined ? {} : { remoteDir }) }))) continue;
    }
    const author = part.teammate === undefined ? player : TEAMMATES[part.teammate];
    let dir = repoDir;
    if (part.remote !== undefined) {
      dir = path.join(paths.data, 'teammates', part.teammate ?? 'player');
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(dir), { recursive: true });
      await realgit.runSetupCommands(path.dirname(dir), [`git clone -q ${ORIGIN_URL} ${path.basename(dir)}`], { env });
    }
    for (const [i, command] of part.commands.entries()) {
      await realgit.runSetupCommands(dir, [withLogin(command, opts.githubLogin)], { env, author, date: storyDate(part.minute + i) });
    }
    if (part.remote !== undefined) {
      const date = storyDate(part.minute + Math.max(0, part.commands.length - 1));
      for (const ref of part.remote.push) await realgit.runSetupCommands(dir, [`git push -q origin ${ref}`], { env, author, date });
    }
  }
}

function exists(file: string): Promise<boolean> {
  return fs.stat(file).then(
    () => true,
    () => false,
  );
}

/** Empties `target` (never removing the folder itself) and copies `source`'s contents into it. */
export async function replaceContents(target: string, source: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
  for (const entry of await fs.readdir(target)) {
    await fs.rm(path.join(target, entry), { recursive: true, force: true });
  }
  for (const entry of await fs.readdir(source)) {
    await fs.cp(path.join(source, entry), path.join(target, entry), { recursive: true });
  }
}

/** Empties the bare origin in place and re-initialises it (levels with `remote: true`). */
export async function resetRemote(paths: GitQuestPaths, env: NodeJS.ProcessEnv): Promise<void> {
  await fs.mkdir(paths.remote, { recursive: true });
  for (const entry of await fs.readdir(paths.remote)) {
    await fs.rm(path.join(paths.remote, entry), { recursive: true, force: true });
  }
  const result = await realgit.git(['init', '--bare', '-q', '-b', 'main', paths.remote], { cwd: paths.data, env });
  if (result.code !== 0) throw new Error(`git init --bare failed: ${result.stderr.trim()}`);
}

/**
 * Builds the parts in a temp repo, then copies the result into paths.repo in place and refreshes its index.
 * `resetOrigin`: empty the bare remote first (the level's root pushes to it).
 */
export async function rebuildInPlace(
  paths: GitQuestPaths,
  parts: readonly ChainPart[],
  opts: RunOptions & { readonly resetOrigin?: boolean },
): Promise<void> {
  await fs.mkdir(paths.data, { recursive: true });
  if (opts.resetOrigin === true) await resetRemote(paths, opts.env);
  const temp = await fs.mkdtemp(path.join(paths.data, 'build-'));
  try {
    const repo = path.join(temp, 'nova');
    await fs.mkdir(repo);
    await runParts(repo, parts, opts);
    await replaceContents(paths.repo, repo);
    // Setup may create neighbours of the repo (`git init ../nova-icons` for a submodule source): they
    // land next to the real repo too, so `../x` means the same thing in the build and in ~/GitQuest.
    for (const entry of await fs.readdir(temp)) {
      if (entry === 'nova') continue;
      const target = path.join(path.dirname(paths.repo), entry);
      await fs.rm(target, { recursive: true, force: true });
      await fs.cp(path.join(temp, entry), target, { recursive: true });
    }
    await realgit.settleRepo(paths, opts.env);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}

/** Rebuilds `missionId`'s canonical entry in place (resetting origin for levels that use it). */
export function rebuildEntry(paths: GitQuestPaths, missionId: string, opts: Omit<RunOptions, 'paths'>): Promise<void> {
  return rebuildInPlace(paths, canonicalEntryParts(missionId), {
    ...opts,
    paths,
    resetOrigin: levelFor(missionId).remote === true,
  });
}

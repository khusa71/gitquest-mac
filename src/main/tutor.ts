/**
 * The voice tutor: Claude answers the player's spoken questions about the current mission and repo.
 * The API key is stored encrypted (Electron safeStorage, passed in as encrypt/decrypt) in keyFile.
 * The tutor never runs commands; it may suggest one git command the UI can insert into the terminal.
 */
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { TutorReply } from '../shared/api';
import type { WorkspaceView } from '../shared/view-model';

import { askCli, availableBackends, type CliBackend } from './tutor-cli';

export const TUTOR_MODEL = 'claude-opus-5-5';
/** Question/answer pairs kept per mission. */
const MAX_EXCHANGES = 6;
const TIMEOUT_MS = 20_000;

export const MESSAGES = {
  noKey: 'The tutor needs Claude Code or Codex signed in on this Mac, or a Claude API key in Voice settings.',
  emptyKey: 'Paste your Claude API key first.',
  cannotEncrypt: "Your Mac's keychain isn't available right now, so the key can't be stored safely. It was not saved.",
  rejected: 'That API key was rejected. Check it in Voice settings.',
  forbidden: "That API key isn't allowed to use Claude. Check it in Voice settings.",
  billing: 'Your Anthropic account needs credits or billing set up before the tutor can answer.',
  modelMissing: "That API key can't use the tutor's Claude model.",
  busy: 'The tutor is busy, try again in a moment.',
  slow: 'The tutor took too long to answer, try again in a moment.',
  offline: "Can't reach the tutor. Check your internet connection.",
  refused: "The tutor can't help with that one. Try asking about your repo or the mission.",
  garbled: 'The tutor got muddled. Try asking again.',
  emptyQuestion: 'I didn’t catch a question. Try again.',
} as const;

const SYSTEM_PROMPT = `You are the tutor inside GitQuest, a Mac app where a player learns git by typing real git commands in a real terminal, in a practice repo called Nova, next to live diagrams of their repo. Your reply is shown on screen and also read aloud by a text-to-speech voice, so keep it conversational.

How to answer:
- Be warm, patient and encouraging, like a friendly senior developer sitting next to the player.
- Answer in one to four short, plain sentences. No markdown except inline code, no code blocks, no bullet points, no lists, no headings, no emoji.
- Write every command, flag, file name and ref exactly as it is typed, wrapped in backticks, for example \`git log --oneline --graph --all\` or \`app.ts\`. GitQuest shows them as code and turns them into spoken words for the voice, so never spell them out yourself ("dash dash", "dot").
- Teach the why, not just the what: connect each answer to git's model of the working directory (disk), the index (staging area), commits and HEAD.
- Be Socratic by default. When the player is stuck, first nudge them with a hint or a question that points at the next idea. Only give the exact command when they ask for it directly ("just tell me", "what do I type") or when the conversation shows they have already tried twice.
- You cannot run commands and must never claim you ran, checked or changed anything. The player types every command themselves.
- Ground every answer in their actual repo state below: name their real files, commits, branch and mission. If the state shows the mission is complete, congratulate them briefly and point at what they learned.
- If the question is not about git, the mission or GitQuest, gently steer back to the mission in one sentence.

Each player message starts with a snapshot of their workspace (mission, checks, revealed hints, last command, the three areas per file, recent commits, current branch), followed by "Player:" and what they said. Speech recognition can mishear words; read the question charitably.

Reply fields:
- text: your answer, following the rules above (commands in backticks).
- command: when you are giving the player the exact next command (only when the Socratic rule above allows it), that single git command exactly as it should be typed, for example git add app.ts or git commit -m "docs: v2". It must start with "git" and be one command with no pipes, semicolons or && chains. Otherwise null.`;

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    command: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['text', 'command'],
  additionalProperties: false,
};

/** Compact plain-text snapshot of the workspace for the model. */
export function renderContext(view: WorkspaceView): string {
  const lines: string[] = [`Repo: ${view.repoLabel}${view.gitVersion ? ` (git ${view.gitVersion})` : ''}`];
  const m = view.mission;
  if (m) {
    lines.push(`Mission ${m.number}: ${m.title}`, `Goal: ${m.goal}`, 'Checks:');
    for (const c of m.checks) lines.push(`- [${c.done ? 'done' : 'not yet'}] ${c.label} (proof: ${c.proof})`);
    if (m.blockedReason) lines.push(`Not done yet because: ${m.blockedReason}`);
    lines.push(`Hints revealed: ${m.hints.length} of ${m.hintsTotal}`);
    for (const h of m.hints) lines.push(`- ${h}`);
    lines.push(`Commands used: ${m.commandsUsed} (par ${m.par})`);
    if (m.completed) lines.push(`Mission complete with ${m.completed.stars} stars. Takeaway: ${m.completed.takeaway}`);
  } else {
    lines.push('No mission is active.');
  }
  lines.push(`Last command: ${view.lastCommand ?? 'none yet'}`);
  lines.push(`Current branch: ${view.headBranch ?? 'none (detached HEAD)'}`);
  lines.push('Files (disk / index / HEAD; "-" = not there):');
  if (view.areas.length === 0) lines.push('- no files');
  for (const a of view.areas) lines.push(`- ${a.path}: ${a.disk ?? '-'} / ${a.index ?? '-'} / ${a.head ?? '-'}`);
  lines.push('Recent commits (newest first):');
  if (view.commits.length === 0) lines.push('- no commits yet');
  for (const c of view.commits.slice(0, 8)) {
    const refs = c.refs.length ? ` [${c.refs.join(', ')}]` : '';
    lines.push(`- ${c.short} "${c.message}" by ${c.author}${refs}`);
  }
  return lines.join('\n');
}

/** Readable, speakable message for any error from the SDK. */
export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return MESSAGES.rejected;
  if (e instanceof Anthropic.PermissionDeniedError) return MESSAGES.forbidden;
  if (e instanceof Anthropic.NotFoundError) return MESSAGES.modelMissing;
  if (e instanceof Anthropic.RateLimitError) return MESSAGES.busy;
  if (e instanceof Anthropic.InternalServerError) return MESSAGES.busy; // 500s and 529 overloaded
  if (e instanceof Anthropic.APIConnectionTimeoutError) return MESSAGES.slow;
  if (e instanceof Anthropic.APIConnectionError) return MESSAGES.offline;
  if (e instanceof Anthropic.APIError) return e.status === 402 ? MESSAGES.billing : `The tutor ran into a problem (error ${e.status ?? 'unknown'}). Try again in a moment.`;
  return MESSAGES.garbled;
}

/** A suggested command must be one plain git command; anything else is dropped. */
function cleanCommand(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  const s = c.trim().replace(/^\$\s*/, '');
  return /^git\s+\S/.test(s) && !/[\n;&|<>`]|\$\(/.test(s) ? s : null;
}

export interface TutorOptions {
  /** ~/.gitquest/tutor-key.bin */
  keyFile: string;
  encrypt: (s: string) => Buffer;
  decrypt: (b: Buffer) => string;
  canEncrypt: () => boolean;
  /** Test seam: builds the SDK client for an API key. */
  client?: (apiKey: string) => Anthropic;
  /** ~/.gitquest/tutor.json — which backend the player picked ('auto' when absent). */
  prefsFile?: string;
  /** Test seams for the Claude Code / Codex backends. */
  cliAvailable?: () => Record<CliBackend, string | null>;
  cliAsk?: typeof askCli;
}

export type TutorBackend = CliBackend | 'api';
export type TutorPreference = TutorBackend | 'auto';

export interface TutorBackendInfo {
  /** The backend questions go to right now, null when none is usable. */
  readonly active: TutorBackend | null;
  /** Usable backends on this Mac (CLIs installed, API key saved). */
  readonly available: readonly TutorBackend[];
  readonly preference: TutorPreference;
}

export interface Tutor {
  /** 'ready' when any backend is usable: Claude Code, Codex, or a saved API key. */
  status(): Promise<'ready' | 'needs-key'>;
  backend(): Promise<TutorBackendInfo>;
  /** Persists the player's choice; 'auto' prefers Claude Code, then Codex, then the API key. */
  setBackend(preference: TutorPreference): Promise<TutorBackendInfo>;
  /** Validates the key with Claude, then stores it encrypted. Throws a readable Error. */
  setKey(key: string): Promise<void>;
  clearKey(): Promise<void>;
  /** Throws a readable Error on failure. */
  ask(question: string, view: WorkspaceView): Promise<TutorReply>;
  /** Forgets the conversation. */
  reset(): void;
}

export function createTutor(opts: TutorOptions): Tutor {
  const makeClient = opts.client ?? ((apiKey: string) => new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 }));
  let cached: { key: string; client: Anthropic } | null = null;
  // ponytail: history is plain question/answer text (no thinking blocks, no old snapshots), so trimming
  // the front never trips the preserved-thinking prefix check and the model only sees the current state.
  let history: Anthropic.Beta.BetaMessageParam[] = [];
  let missionId: string | null | undefined;

  async function readKey(): Promise<string | null> {
    try {
      return opts.decrypt(await readFile(opts.keyFile)).trim() || null;
    } catch {
      return null; // missing file or undecryptable (keychain reset) → needs-key
    }
  }

  function clientFor(key: string): Anthropic {
    if (cached?.key !== key) cached = { key, client: makeClient(key) };
    return cached.client;
  }

  function reset(): void {
    history = [];
    missionId = undefined;
  }

  const cliAvailable = opts.cliAvailable ?? availableBackends;
  const cliAsk = opts.cliAsk ?? askCli;

  async function readPreference(): Promise<TutorPreference> {
    if (!opts.prefsFile) return 'auto';
    try {
      const raw = JSON.parse(await readFile(opts.prefsFile, 'utf8')) as { backend?: unknown };
      return raw.backend === 'claude-code' || raw.backend === 'codex' || raw.backend === 'api' ? raw.backend : 'auto';
    } catch {
      return 'auto';
    }
  }

  async function backendInfo(): Promise<TutorBackendInfo & { bins: Record<CliBackend, string | null> }> {
    const bins = cliAvailable();
    const available: TutorBackend[] = [];
    if (bins['claude-code']) available.push('claude-code');
    if (bins.codex) available.push('codex');
    if (await readKey()) available.push('api');
    const preference = await readPreference();
    const active = preference !== 'auto' && available.includes(preference) ? preference : (available[0] ?? null);
    return { active, available, preference, bins };
  }

  return {
    reset,

    async status() {
      return (await backendInfo()).active ? 'ready' : 'needs-key';
    },

    async backend() {
      const { active, available, preference } = await backendInfo();
      return { active, available, preference };
    },

    async setBackend(preference) {
      if (opts.prefsFile) {
        await mkdir(path.dirname(opts.prefsFile), { recursive: true, mode: 0o700 });
        await writeFile(opts.prefsFile, JSON.stringify({ backend: preference }));
      }
      reset();
      const { active, available } = await backendInfo();
      return { active, available, preference };
    },

    async setKey(raw) {
      const key = raw.trim();
      if (!key) throw new Error(MESSAGES.emptyKey);
      if (!opts.canEncrypt()) throw new Error(MESSAGES.cannotEncrypt);
      try {
        // Free call that proves the key works and can see the tutor model; no tokens spent.
        await clientFor(key).models.retrieve(TUTOR_MODEL);
      } catch (e) {
        cached = null;
        throw new Error(friendlyError(e));
      }
      await mkdir(path.dirname(opts.keyFile), { recursive: true, mode: 0o700 });
      await writeFile(opts.keyFile, opts.encrypt(key), { mode: 0o600 });
      await chmod(opts.keyFile, 0o600); // writeFile's mode only applies when it creates the file
    },

    async clearKey() {
      await rm(opts.keyFile, { force: true });
      cached = null;
      reset();
    },

    async ask(question, view) {
      const q = question.trim();
      if (!q) throw new Error(MESSAGES.emptyQuestion);
      const info = await backendInfo();
      if (info.active === null) throw new Error(MESSAGES.noKey);

      const id = view.mission?.id ?? null;
      if (id !== missionId) {
        history = [];
        missionId = id;
      }

      if (info.active !== 'api') {
        const bin = info.bins[info.active];
        if (!bin) throw new Error(MESSAGES.noKey);
        // The CLIs keep no conversation state here, so recent turns ride along in the prompt.
        const past = history
          .map((m) => `${m.role === 'user' ? 'Player' : 'Tutor'}: ${typeof m.content === 'string' ? m.content : ''}`)
          .join('\n');
        const raw = await cliAsk(info.active, bin, {
          system: SYSTEM_PROMPT,
          prompt: `${renderContext(view)}\n\n${past ? `Earlier in this conversation:\n${past}\n\n` : ''}Player: ${q}`,
          schema: REPLY_SCHEMA,
        });
        return remember(q, raw);
      }

      const key = await readKey();
      if (!key) throw new Error(MESSAGES.noKey);

      let res: Anthropic.Beta.BetaMessage;
      try {
        res = await clientFor(key).beta.messages.create({
          model: TUTOR_MODEL,
          max_tokens: 4096,
          // Claude Opus 5.5 always thinks; low effort keeps spoken answers fast.
          output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_SCHEMA } },
          // Server-side fallback if the model declines on policy grounds.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          // Frozen system prompt first so it is served from the prompt cache.
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [...history, { role: 'user', content: `${renderContext(view)}\n\nPlayer: ${q}` }],
        });
      } catch (e) {
        throw new Error(friendlyError(e));
      }
      if (res.stop_reason === 'refusal') throw new Error(MESSAGES.refused);

      let raw = '';
      for (const b of res.content) if (b.type === 'text') raw += b.text;
      return remember(q, raw);
    },
  };

  function remember(q: string, raw: string): TutorReply {
      let parsed: { text?: unknown; command?: unknown };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        throw new Error(MESSAGES.garbled);
      }
      if (typeof parsed.text !== 'string' || !parsed.text.trim()) throw new Error(MESSAGES.garbled);

      history.push({ role: 'user', content: q }, { role: 'assistant', content: parsed.text.trim() });
      history = history.slice(-MAX_EXCHANGES * 2);
      return { text: parsed.text.trim(), command: cleanCommand(parsed.command) };
  }
}

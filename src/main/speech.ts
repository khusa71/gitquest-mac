/**
 * On-device speech recognition via the `gitquest-transcribe` Swift helper (native/speech/Transcribe.swift).
 * The helper prints one JSON line per event; this module spawns it, parses lines and maps errors to English.
 * No Electron imports: the caller passes the binary path.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import type { Transcript, VoiceStatus } from '../shared/api';

type SpeechState = VoiceStatus['speech'];

export type HelperMessage =
  | { readonly type: 'listening' }
  | { readonly type: 'status'; readonly speech: SpeechState }
  | { readonly type: 'transcript'; readonly text: string; readonly final: boolean }
  | { readonly type: 'error'; readonly code: string; readonly message: string; readonly permission?: string };

const STATES: readonly string[] = ['ready', 'needs-permission', 'denied', 'unavailable'];

/** Parses one helper line; anything malformed → null. */
export function parseLine(line: string): HelperMessage | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(line);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  switch (m.type) {
    case 'listening':
      return { type: 'listening' };
    case 'status':
      return typeof m.speech === 'string' && STATES.includes(m.speech) ? { type: 'status', speech: m.speech as SpeechState } : null;
    case 'transcript':
      return typeof m.text === 'string' ? { type: 'transcript', text: m.text, final: m.final === true } : null;
    case 'error':
      return {
        type: 'error',
        code: typeof m.code === 'string' ? m.code : 'other',
        message: typeof m.message === 'string' ? m.message : '',
        ...(typeof m.permission === 'string' ? { permission: m.permission } : {}),
      };
    default:
      return null;
  }
}

/** Returns a chunk handler that calls onLine once per complete, non-blank line (partial lines are buffered). */
export function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) onLine(line);
    }
  };
}

export const MISSING_HELPER = 'Speech recognition isn’t installed — the gitquest-transcribe helper is missing. Run npm run build:speech.';
const UNEXPECTED_EXIT = 'Speech recognition stopped unexpectedly. Try again.';

export function errorMessage(m: { code: string; message: string; permission?: string }): string {
  switch (m.code) {
    case 'denied':
      return m.permission === 'microphone'
        ? 'GitQuest can’t use the microphone. Turn it on in System Settings → Privacy & Security → Microphone.'
        : 'Speech recognition is off for GitQuest. Turn it on in System Settings → Privacy & Security → Speech Recognition.';
    case 'restricted':
      return 'Speech recognition is restricted on this Mac (for example by Screen Time or a device profile).';
    case 'unavailable':
      return 'Speech recognition isn’t available on this Mac right now. Check that English dictation is installed in System Settings → Keyboard → Dictation.';
    case 'audio':
      return `GitQuest couldn’t use the microphone. ${m.message}`.trim();
    default:
      return `Speech recognition failed. ${m.message}`.trim();
  }
}

function stateForError(code: string): SpeechState {
  return code === 'denied' || code === 'restricted' ? 'denied' : 'unavailable';
}

interface Run {
  readonly proc: ChildProcessByStdio<Writable, Readable, null>;
  readonly started: Promise<SpeechState>;
  readonly exited: Promise<void>;
  stopping: boolean;
}

export interface Speech {
  /** Current permission/availability; never prompts. */
  status(): Promise<SpeechState>;
  /** Starts listening (macOS prompts on first use). Resolves 'ready' once listening; otherwise the reason it isn't (onError gets the message). No-op while already running. */
  start(onTranscript: (t: Transcript) => void, onError: (message: string) => void): Promise<SpeechState>;
  /** Ends audio; the final transcript arrives through onTranscript before this resolves. */
  stop(): Promise<void>;
  dispose(): void;
}

export function createSpeech(binaryPath: string): Speech {
  let run: Run | null = null;
  let disposed = false;

  function status(): Promise<SpeechState> {
    if (!existsSync(binaryPath)) return Promise.resolve('unavailable');
    return new Promise((resolve) => {
      let result: SpeechState = 'unavailable';
      const proc = spawn(binaryPath, ['--status'], { stdio: ['ignore', 'pipe', 'ignore'] });
      const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', lineSplitter((line) => {
        const m = parseLine(line);
        if (m?.type === 'status') result = m.speech;
      }));
      const done = () => {
        clearTimeout(timer);
        resolve(result);
      };
      proc.on('error', done);
      proc.on('close', done);
    });
  }

  function start(onTranscript: (t: Transcript) => void, onError: (message: string) => void): Promise<SpeechState> {
    if (disposed) return Promise.resolve('unavailable');
    if (run) return run.started;
    if (!existsSync(binaryPath)) {
      onError(MISSING_HELPER);
      return Promise.resolve('unavailable');
    }

    const proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'ignore'] });
    let resolveStarted!: (s: SpeechState) => void;
    let resolveExited!: () => void;
    const current: Run = {
      proc,
      started: new Promise((r) => (resolveStarted = r)),
      exited: new Promise((r) => (resolveExited = r)),
      stopping: false,
    };
    run = current;

    let lastText = '';
    let finalSent = false;
    let errored = false;

    proc.stdin.on('error', () => {}); // EPIPE if the helper already exited
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', lineSplitter((line) => {
      if (disposed) return;
      const m = parseLine(line);
      if (m?.type === 'listening') resolveStarted('ready');
      else if (m?.type === 'transcript') {
        lastText = m.text;
        if (m.final) finalSent = true;
        if (m.text) onTranscript({ text: m.text, final: m.final }); // ponytail: empty transcripts dropped so "" never reaches the tutor
      } else if (m?.type === 'error') {
        errored = true;
        onError(errorMessage(m));
        resolveStarted(stateForError(m.code));
      }
    }));

    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (run === current) run = null;
      if (!disposed && !errored && !finalSent) {
        // Killed before the helper could print its final line: promote the last partial.
        if (lastText) onTranscript({ text: lastText, final: true });
        if (!current.stopping) onError(UNEXPECTED_EXIT);
      }
      resolveStarted('unavailable'); // no-op if already resolved
      resolveExited();
    };
    proc.on('error', end);
    proc.on('close', end);
    return current.started;
  }

  async function stop(): Promise<void> {
    const current = run;
    if (!current) return;
    current.stopping = true;
    current.proc.stdin.end();
    const term = setTimeout(() => current.proc.kill('SIGTERM'), 1500);
    const kill = setTimeout(() => current.proc.kill('SIGKILL'), 4000);
    await current.exited;
    clearTimeout(term);
    clearTimeout(kill);
  }

  function dispose(): void {
    disposed = true;
    run?.proc.kill('SIGKILL');
  }

  return { status, start, stop, dispose };
}

// Read-aloud with the downloaded natural voice (Kokoro, see src/main/neural-voice.ts) or Web Speech speechSynthesis
// (macOS system voices, offline), and the player's voice prefs.
import type { GitQuestApi, NaturalVoiceChunk, NaturalVoiceId } from '../../shared/api';
import { splitSentences } from '../../shared/sentences';

export interface VoicePrefs {
  /** voiceURI of the chosen voice; '' = pick a natural English one automatically. */
  voice: string;
  /** Kokoro voice used when `voice` is '' and the natural voice is downloaded. */
  natural: NaturalVoiceId;
  rate: number;
  /** Speak new hints and "Not validated yet" reasons. */
  readAloud: boolean;
}

const KEY = 'gq.voicePrefs';
const DEFAULTS: VoicePrefs = { voice: '', natural: 'af_heart', rate: 1, readAloud: false };

function load(): VoicePrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoicePrefs>) };
  } catch {
    return DEFAULTS;
  }
}

// ponytail: module-level prefs, read at speak time; nothing re-renders on change except the settings dialog itself.
export let prefs: VoicePrefs = load();

export function savePrefs(next: VoicePrefs): void {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Prefs still apply for this session.
  }
}

const synth = (): SpeechSynthesis | null => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);

/**
 * macOS ships joke and robot voices (Albert, Bad News, Zarvox, Whisper, the Eloquence set like Grandpa or
 * Rocko…). They must never read a lesson aloud, so they're filtered out everywhere.
 */
const NOVELTY = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Good News|Jester|Junior|Organ|Superstar|Trinoids|Whisper|Zarvox|Fred|Ralph|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;

/** Natural voices, best first. Premium/Enhanced downloads (System Settings → Accessibility → Spoken Content) win. */
const PREFERRED = ['Ava', 'Zoe', 'Evan', 'Nathan', 'Allison', 'Susan', 'Tom', 'Samantha', 'Daniel', 'Serena', 'Karen', 'Moira', 'Tessa', 'Tara', 'Rishi'];

function quality(v: SpeechSynthesisVoice): number {
  // Voices that run on this Mac first: online ones send the text to a server.
  if (!v.localService) return 1000;
  const premium = /premium/i.test(v.name) ? 0 : /enhanced/i.test(v.name) ? 1 : 2;
  const rank = PREFERRED.findIndex((name) => v.name.startsWith(name));
  return premium * 100 + (rank === -1 ? 50 : rank);
}

/** English voices fit for teaching, best first. */
export function englishVoices(): SpeechSynthesisVoice[] {
  return (synth()?.getVoices() ?? [])
    .filter((v) => v.lang.toLowerCase().startsWith('en') && !NOVELTY.test(v.name))
    .sort((a, b) => quality(a) - quality(b));
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  return voices.find((v) => v.voiceURI === prefs.voice) ?? voices[0];
}

/** Voices arrive asynchronously; never speak before they're known, or macOS falls back to a novelty voice. */
function whenVoicesReady(run: () => void): void {
  const s = synth();
  if (!s) return;
  if (s.getVoices().length > 0) return run();
  const ready = () => {
    s.removeEventListener('voiceschanged', ready);
    run();
  };
  s.addEventListener('voiceschanged', ready);
  setTimeout(ready, 1500); // some systems never fire the event; speak with whatever loaded
}

/** Speaks `text`, interrupting anything already being said. `onDone` runs when it ends or is cut off. */
/**
 * Turns on-screen text into words a voice says naturally: `git log --oneline` becomes
 * "git log dash dash oneline", `app.ts` becomes "app dot t s". Only code spans and obvious
 * command fragments are rewritten; prose is left alone.
 */
export function speakable(text: string): string {
  const say = (code: string): string =>
    code
      .replace(/--/g, ' dash dash ')
      .replace(/(^|\s)-(?=\w)/g, '$1dash ')
      .replace(/\.(ts|tsx|js|md|txt|json|yml|yaml|sh|css|env)\b/gi, (_m, ext: string) => ` dot ${ext.length <= 3 ? ext.split('').join(' ') : ext}`)
      .replace(/(\w)\.(\w)/g, '$1 dot $2')
      .replace(/\//g, ' slash ')
      .replace(/~(\d*)/g, (_m, n: string) => ` tilde ${n}`)
      .replace(/\^/g, ' caret ')
      .replace(/@\{/g, ' at ')
      .replace(/[{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return text.replace(/`([^`]+)`/g, (_m, code: string) => say(code));
}

/**
 * What gets spoken, plus where each written word starts in it: `marks[k]` = spoken offset of words `from..to` of
 * `text` (a code span is one spoken piece covering all of its words).
 */
export function plan(text: string): { spoken: string; words: string[]; marks: { at: number; from: number; to: number }[] } {
  const words = text.split(/\s+/).filter(Boolean);
  const marks: { at: number; from: number; to: number }[] = [];
  let spoken = '';
  for (let i = 0; i < words.length; i++) {
    let j = i;
    // An opening backtick without its closing one in the same word: the code span runs to the word that closes it.
    if (((words[i] ?? '').match(/`/g)?.length ?? 0) % 2 === 1) {
      while (j + 1 < words.length && ((words[j + 1] ?? '').match(/`/g)?.length ?? 0) % 2 === 0) j++;
      if (j + 1 < words.length) j++;
    }
    const piece = speakable(words.slice(i, j + 1).join(' '));
    if (piece) {
      if (spoken) spoken += ' ';
      marks.push({ at: spoken.length, from: i, to: j });
      spoken += piece;
    }
    i = j;
  }
  return { spoken, words, marks };
}

/** The mark being spoken at `offset` of the spoken text. */
export function markAt(marks: readonly { at: number; from: number; to: number }[], offset: number): { from: number; to: number } | null {
  let lo = 0, hi = marks.length - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((marks[mid]?.at ?? 0) <= offset) { found = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return marks[found] ?? null;
}

const norm = (w: string): string => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Highlights, on screen, the word being read. Spoken words are matched in order to the words shown under `root`
 * (a few may be spoken but not shown, like "Goal:" or "Hint 2."; those keep the previous highlight).
 */
class Follow {
  private dom: { node: Text; start: number; end: number; norm: string }[] | null = null;
  private map: (number | null)[] = [];
  constructor(private readonly root: () => Element | null, private readonly words: readonly string[]) {}

  private build(): void {
    const root = this.root();
    this.dom = [];
    if (!root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement?.closest('[aria-hidden="true"], button, .sr-only, svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      for (const m of n.data.matchAll(/\S+/g)) {
        const key = norm(m[0]);
        if (key) this.dom.push({ node: n, start: m.index, end: m.index + m[0].length, norm: key });
      }
    }
    let p = 0;
    this.map = this.words.map((w) => {
      const key = norm(w);
      if (!key) return null;
      for (let k = p; k < Math.min(this.dom!.length, p + 12); k++) {
        if (this.dom![k]!.norm === key) {
          p = k + 1;
          return k;
        }
      }
      return null;
    });
  }

  show(from: number, to: number): void {
    if (typeof Highlight === 'undefined' || !CSS.highlights) return;
    if (this.dom === null) this.build();
    const hits = this.map.slice(from, to + 1).filter((k): k is number => k !== null);
    const a = this.dom?.[hits[0] ?? -1], b = this.dom?.[hits[hits.length - 1] ?? -1];
    if (!a || !b || !a.node.isConnected) return;
    const range = new Range();
    range.setStart(a.node, a.start);
    range.setEnd(b.node, b.end);
    CSS.highlights.set('gq-reading', new Highlight(range));
    // Keep the word in view when the text scrolls (nothing moves when it is already visible).
    const r = range.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) a.node.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  static clear(): void {
    if (typeof Highlight !== 'undefined') CSS.highlights?.delete('gq-reading');
  }
}

/** Plays one natural-voice utterance's sentences in order as they arrive; `onDone` after the last, or on stop. */
export class ChunkQueue {
  private next = 0;
  private readonly waiting = new Map<number, NaturalVoiceChunk>();
  private playing = false;
  private stopped = false;

  constructor(
    readonly id: string,
    private readonly play: (wav: Uint8Array, index: number) => Promise<void>,
    private readonly onDone?: () => void,
  ) {}

  push(chunk: NaturalVoiceChunk): void {
    if (chunk.id !== this.id || this.stopped) return;
    this.waiting.set(chunk.index, chunk);
    void this.pump();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.onDone?.();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    for (let c = this.waiting.get(this.next); c && !this.stopped; c = this.waiting.get(this.next)) {
      this.waiting.delete(this.next++);
      if (c.wav.length > 0) await this.play(c.wav, c.index).catch(() => {});
      if (c.last) return this.stop();
    }
    this.playing = false;
  }
}

const natural = () => (window as { gitquest?: GitQuestApi }).gitquest?.voice.natural;
let audio: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let queue: ChunkQueue | null = null;
let turn = 0; // bumped by every speak/stop, so a late reply from an older one is ignored
let listening = false;
let pending: (() => void) | undefined; // onDone of a natural speak still waiting for main

let follow: Follow | null = null;

/** Plays one sentence; `onTime(fraction)` follows playback so the highlight can move through the sentence. */
async function playWav(q: ChunkQueue, wav: Uint8Array, onTime?: (fraction: number) => void): Promise<void> {
  audio ??= new AudioContext();
  const ctx = audio;
  const buffer = await ctx.decodeAudioData(wav.slice().buffer);
  if (queue !== q) return; // stopped while decoding
  await new Promise<void>((resolve) => {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.connect(ctx.destination);
    let frame = 0;
    s.onended = () => {
      cancelAnimationFrame(frame);
      resolve();
    };
    source = s;
    const t0 = ctx.currentTime;
    s.start();
    const tick = (): void => {
      onTime?.(Math.min(1, (ctx.currentTime - t0) / Math.max(0.01, buffer.duration)));
      frame = requestAnimationFrame(tick);
    };
    if (onTime) tick();
  });
}

/**
 * Speaks `text`, interrupting anything already being said. `onDone` runs when it ends or is cut off.
 * Uses the downloaded natural voice when Voice is Automatic (or `engine` is 'natural'), else a macOS voice.
 */
export function speak(text: string, onDone?: () => void, engine?: 'system' | 'natural', root?: () => Element | null): void {
  stopSpeaking();
  const p = plan(text);
  if (root) follow = new Follow(root, p.words);
  const done = (): void => {
    Follow.clear();
    onDone?.();
  };
  const api = natural();
  if (!api || engine === 'system' || (prefs.voice !== '' && engine !== 'natural') || !text.trim()) return speakSystem(p, done);
  const mine = turn;
  pending = done;
  void (async () => {
    try {
      const s = await api.status();
      if (mine !== turn) return;
      if (s.state !== 'ready' && s.state !== 'loading') {
        pending = undefined;
        return engine === 'natural' ? done() : speakSystem(p, done);
      }
      if (!listening) {
        listening = true;
        api.onChunk((c) => queue?.push(c));
      }
      const id = await api.speak(p.spoken, prefs.natural, Math.min(2, Math.max(0.5, prefs.rate)));
      if (mine !== turn) return void api.cancel(id);
      pending = undefined;
      // Where each sentence (= chunk) sits in the spoken text; the highlight walks through it as the audio plays.
      let cursor = 0;
      const spans = splitSentences(p.spoken).map((sentence) => {
        const start = Math.max(cursor, p.spoken.indexOf(sentence, cursor));
        cursor = start + sentence.length;
        return { start, end: cursor };
      });
      const f = follow;
      const q: ChunkQueue = new ChunkQueue(id, (wav, index) => playWav(q, wav, f && spans[index] ? (t) => {
        const span = spans[index]!;
        const mark = markAt(p.marks, span.start + t * (span.end - span.start));
        if (mark) f.show(mark.from, mark.to);
      } : undefined), done);
      queue = q;
    } catch (e) {
      console.error('[gitquest] natural voice', e);
      if (mine !== turn) return;
      pending = undefined;
      speakSystem(p, done);
    }
  })();
}

function speakSystem(p: ReturnType<typeof plan>, onDone?: () => void): void {
  const text = p.spoken;
  const f = follow;
  const s = synth();
  if (!s || !text.trim()) return onDone?.();
  s.cancel();
  whenVoicesReady(() => {
    const voice = pickVoice();
    // No natural English voice at all: stay silent rather than read with a joke voice.
    if (!voice) return onDone?.();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = prefs.rate;
    if (onDone) {
      u.onend = onDone;
      u.onerror = onDone;
    }
    // macOS voices report each word as it starts: highlight exactly that word.
    if (f) u.onboundary = (e) => {
      const mark = e.name === 'word' ? markAt(p.marks, e.charIndex) : null;
      if (mark) f.show(mark.from, mark.to);
    };
    s.speak(u);
  });
}

export function stopSpeaking(): void {
  turn++;
  follow = null;
  Follow.clear();
  const cutOff = pending;
  pending = undefined;
  cutOff?.();
  synth()?.cancel();
  if (queue) {
    void natural()?.cancel(queue.id);
    const q = queue;
    queue = null;
    q.stop();
  }
  try {
    source?.stop();
  } catch {
    // already ended
  }
  source = null;
}

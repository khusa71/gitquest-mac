// Runs in an Electron utilityProcess (see neural-voice.ts): Kokoro is CPU-bound and stalls the event loop for
// 100–200 ms per sentence, which would stutter the terminal if it ran in the main process.
import type { KokoroTTS } from 'kokoro-js';
import type { NaturalVoiceStatus } from '../shared/api';

export type ToWorker =
  | { type: 'load'; cacheDir: string; allowDownload: boolean }
  | { type: 'speak'; id: string; text: string; voice: string; speed: number }
  | { type: 'cancel'; id: string };
export type FromWorker =
  | { type: 'status'; status: NaturalVoiceStatus }
  | { type: 'chunk'; id: string; index: number; last: boolean; wav: Uint8Array };

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

export { splitSentences } from '../shared/sentences';
import { splitSentences } from '../shared/sentences';

// --- utility process side (nothing runs when imported by tests)
const port = process.parentPort;
if (port) {
  let tts: Promise<KokoroTTS> | null = null;
  let current: string | null = null;
  const post = (m: FromWorker) => port.postMessage(m);
  const status = (state: NaturalVoiceStatus['state'], progress: number | null = null, error: string | null = null) =>
    post({ type: 'status', status: { state, progress, error } });

  async function load(cacheDir: string, allowDownload: boolean): Promise<KokoroTTS> {
    const { env } = await import('@huggingface/transformers');
    env.cacheDir = cacheDir;
    // Without the player's consent nothing is fetched: the cache (same <model id>/<file> layout) is read as a local model.
    env.allowRemoteModels = allowDownload;
    env.allowLocalModels = !allowDownload;
    env.localModelPath = cacheDir;
    const { KokoroTTS } = await import('kokoro-js');
    let shown = -1;
    status(allowDownload ? 'downloading' : 'loading', allowDownload ? 0 : null);
    const model = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (p) => {
        // ponytail: the .onnx file is ~99.9% of the bytes; the tiny tokenizer/config files would make the bar jump to 100%.
        if (p.status !== 'progress' || !p.file.endsWith('.onnx') || !p.total) return;
        const pct = Math.floor((p.loaded / p.total) * 100);
        if (pct !== shown) status('downloading', (shown = pct) / 100);
      },
    });
    status('loading');
    await model.generate('Ready.', { voice: 'af_heart' }); // warm-up, so the first real sentence isn't the slowest
    status('ready');
    return model;
  }

  async function speak(id: string, text: string, voice: string, speed: number): Promise<void> {
    current = id;
    const sentences = splitSentences(text);
    let index = 0;
    try {
      const model = await tts!;
      const name = (voice in model.voices ? voice : 'af_heart') as keyof KokoroTTS['voices'];
      for (; index < sentences.length; index++) {
        if (current !== id) return; // cancelled or superseded
        const audio = await model.generate(sentences[index]!, { voice: name, speed });
        if (current !== id) return;
        post({ type: 'chunk', id, index, last: index === sentences.length - 1, wav: new Uint8Array(audio.toWav()) });
      }
      if (sentences.length === 0) post({ type: 'chunk', id, index: 0, last: true, wav: new Uint8Array() });
    } catch (e) {
      console.error('[gitquest] natural voice:', e);
      // An empty last chunk at the next index ends the utterance in the renderer.
      if (current === id) post({ type: 'chunk', id, index, last: true, wav: new Uint8Array() });
    }
  }

  port.on('message', ({ data }: { data: ToWorker }) => {
    if (data.type === 'load') {
      if (tts) return;
      tts = load(data.cacheDir, data.allowDownload);
      tts.catch((e: unknown) => {
        tts = null;
        status('error', null, e instanceof Error ? e.message : String(e));
      });
    } else if (data.type === 'speak') {
      if (tts) void speak(data.id, data.text, data.voice, data.speed);
      else post({ type: 'chunk', id: data.id, index: 0, last: true, wav: new Uint8Array() });
    } else if (current === data.id) current = null;
  });
}

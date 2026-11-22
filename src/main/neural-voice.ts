// The free on-device reading voice: Kokoro-82M through kokoro-js, generated in a utility process, one sentence at a time.
import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NaturalVoiceChunk, NaturalVoiceStatus } from '../shared/api';
import { MODEL_ID, type FromWorker, type ToWorker } from './neural-voice-worker';

interface Options {
  /** ~/.gitquest/models: transformers.js caches the model here. */
  readonly modelsDir: string;
  readonly workerPath: string;
  readonly onStatus: (status: NaturalVoiceStatus) => void;
  readonly onChunk: (chunk: NaturalVoiceChunk) => void;
}

export function createNeuralVoice({ modelsDir, workerPath, onStatus, onChunk }: Options) {
  // Written after the first successful load, so a download cut off halfway never counts as downloaded.
  const marker = join(modelsDir, 'kokoro.ok');
  let child: UtilityProcess | null = null;
  let disposed = false;
  let state: NaturalVoiceStatus = { state: 'not-downloaded', progress: null, error: null };

  const set = (next: NaturalVoiceStatus): NaturalVoiceStatus => {
    state = next;
    if (next.state === 'ready' && !existsSync(marker)) writeFileSync(marker, `${MODEL_ID}\n`);
    onStatus(next);
    return next;
  };
  const post = (m: ToWorker) => child?.postMessage(m);

  /** Lazily starts the worker and asks it to load the model; `allowDownload` only after the player's click. */
  function load(allowDownload: boolean): NaturalVoiceStatus {
    if (!child) {
      child = utilityProcess.fork(workerPath, [], { serviceName: 'GitQuest Voice' });
      child.on('message', (m: FromWorker) => (m.type === 'status' ? set(m.status) : onChunk(m)));
      child.on('exit', (code) => {
        child = null;
        if (!disposed) set({ state: 'error', progress: null, error: `The natural voice stopped unexpectedly (exit ${code}).` });
      });
    }
    post({ type: 'load', cacheDir: modelsDir, allowDownload });
    return set({ state: allowDownload ? 'downloading' : 'loading', progress: allowDownload ? 0 : null, error: null });
  }
  const busy = () => state.state === 'downloading' || state.state === 'loading' || state.state === 'ready';

  return {
    status(): NaturalVoiceStatus {
      if (state.state === 'not-downloaded' && existsSync(marker)) return load(false);
      return state;
    },
    download(): NaturalVoiceStatus {
      if (busy()) return state;
      if (state.state === 'error') rmSync(marker, { force: true }); // retry from scratch: the cache may be what failed
      if (existsSync(marker)) return load(false);
      rmSync(join(modelsDir, MODEL_ID), { recursive: true, force: true }); // drop a half-finished download
      return load(true);
    },
    /** Returns the utterance id; its sentences arrive through onChunk. */
    speak(text: string, voice: string, speed: number): string {
      if (!busy()) {
        if (!existsSync(marker)) throw new Error('The natural voice is not downloaded.');
        load(false);
      }
      const id = randomUUID();
      post({ type: 'speak', id, text, voice, speed });
      return id;
    },
    cancel(id: string): void {
      post({ type: 'cancel', id });
    },
    dispose(): void {
      disposed = true;
      child?.kill();
    },
  };
}

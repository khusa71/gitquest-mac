import { describe, expect, it } from 'vitest';
import type { NaturalVoiceChunk } from '../../shared/api';
import { ChunkQueue } from './read-aloud';

const chunk = (index: number, last = false, id = 'a'): NaturalVoiceChunk => ({ id, index, last, wav: new Uint8Array([index + 1]) });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('ChunkQueue', () => {
  it('plays chunks in index order as they arrive, then calls onDone once', async () => {
    const played: number[] = [];
    let done = 0;
    const q = new ChunkQueue('a', async (wav) => void played.push(wav[0]! - 1), () => done++);
    q.push(chunk(1));
    await tick();
    expect(played).toEqual([]); // waits for 0
    q.push(chunk(0));
    q.push(chunk(9, false, 'other')); // another utterance: ignored
    await tick();
    expect(played).toEqual([0, 1]);
    q.push(chunk(2, true));
    await tick();
    expect(played).toEqual([0, 1, 2]);
    expect(done).toBe(1);
    q.stop();
    expect(done).toBe(1);
  });

  it('skips empty chunks, and stop() ends playback early and calls onDone', async () => {
    const played: number[] = [];
    let done = 0;
    let release!: () => void;
    const q = new ChunkQueue('a', (wav) => {
      played.push(wav[0]!);
      return new Promise<void>((r) => (release = r));
    }, () => done++);
    q.push({ id: 'a', index: 0, last: false, wav: new Uint8Array() });
    q.push(chunk(1));
    q.push(chunk(2, true));
    await tick();
    expect(played).toEqual([2]); // chunk 1 playing
    q.stop();
    release();
    await tick();
    expect(played).toEqual([2]);
    expect(done).toBe(1);
  });
});

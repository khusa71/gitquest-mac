// speech.ts against fake helpers (small node scripts) — no microphone or macOS permissions needed.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Transcript } from '../shared/api';
import { createSpeech, lineSplitter, MISSING_HELPER, parseLine } from './speech';

const dir = mkdtempSync(path.join(os.tmpdir(), 'gq-speech-'));

/** Writes an executable node script; `body` runs with `out(obj)` and `countFile` in scope. */
function fake(name: string, body: string): string {
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `#!${process.execPath}
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
const countFile = ${JSON.stringify(file + '.count')};
require('fs').appendFileSync(countFile, 'x');
${body}
`,
  );
  chmodSync(file, 0o755);
  return file;
}
const spawns = (file: string) => readFileSync(file + '.count', 'utf8').length;

function collect() {
  const transcripts: Transcript[] = [];
  const errors: string[] = [];
  return { transcripts, errors, onT: (t: Transcript) => transcripts.push(t), onE: (m: string) => errors.push(m) };
}

describe('lineSplitter', () => {
  it('buffers partial lines across chunks and skips blanks', () => {
    const lines: string[] = [];
    const feed = lineSplitter((l) => lines.push(l));
    feed('{"type":"list');
    expect(lines).toEqual([]);
    feed('ening"}\n\n{"a":1}\n{"b"');
    expect(lines).toEqual(['{"type":"listening"}', '{"a":1}']);
    feed(':2}\r\n');
    expect(lines).toEqual(['{"type":"listening"}', '{"a":1}', '{"b":2}']);
  });
});

describe('parseLine', () => {
  it('accepts helper messages and rejects junk', () => {
    expect(parseLine('{"type":"listening"}')).toEqual({ type: 'listening' });
    expect(parseLine('{"type":"transcript","text":"git status","final":true}')).toEqual({ type: 'transcript', text: 'git status', final: true });
    expect(parseLine('{"type":"status","speech":"needs-permission"}')).toEqual({ type: 'status', speech: 'needs-permission' });
    expect(parseLine('{"type":"error","code":"denied","message":"x","permission":"microphone"}')).toEqual({
      type: 'error', code: 'denied', message: 'x', permission: 'microphone',
    });
    expect(parseLine('{"type":"status","speech":"bogus"}')).toBeNull();
    expect(parseLine('{"type":"transcript"}')).toBeNull();
    expect(parseLine('not json')).toBeNull();
    expect(parseLine('null')).toBeNull();
    expect(parseLine('{"type":"other"}')).toBeNull();
  });
});

describe('createSpeech', () => {
  it('reports unavailable when the helper is missing', async () => {
    const speech = createSpeech(path.join(dir, 'nope'));
    expect(await speech.status()).toBe('unavailable');
    const c = collect();
    expect(await speech.start(c.onT, c.onE)).toBe('unavailable');
    expect(c.errors).toEqual([MISSING_HELPER]);
  });

  it('reads --status', async () => {
    const bin = fake('status', `if (process.argv.includes('--status')) out({ type: 'status', speech: 'needs-permission' });`);
    expect(await createSpeech(bin).status()).toBe('needs-permission');
  });

  it('listens, streams split partials, and ends with a final on stdin close', async () => {
    const bin = fake('listen', `
      out({ type: 'listening' });
      process.stdout.write('{"type":"transcript","text":"git sta');
      setTimeout(() => process.stdout.write('tus","final":false}\\n'), 20);
      process.stdin.on('data', () => {});
      process.stdin.on('end', () => { out({ type: 'transcript', text: 'git status', final: true }); process.exit(0); });
    `);
    const speech = createSpeech(bin);
    const c = collect();
    const [a, b] = await Promise.all([speech.start(c.onT, c.onE), speech.start(c.onT, c.onE)]);
    expect([a, b]).toEqual(['ready', 'ready']);
    expect(spawns(bin)).toBe(1); // second start was a no-op
    await new Promise((r) => setTimeout(r, 100));
    await speech.stop();
    expect(c.transcripts).toEqual([
      { text: 'git status', final: false },
      { text: 'git status', final: true },
    ]);
    expect(c.errors).toEqual([]);
  });

  it('maps a denied error to readable English and resolves denied', async () => {
    const bin = fake('denied', `out({ type: 'error', code: 'denied', message: 'no', permission: 'speech' }); process.exit(1);`);
    const c = collect();
    expect(await createSpeech(bin).start(c.onT, c.onE)).toBe('denied');
    expect(c.errors).toEqual([
      'Speech recognition is off for GitQuest. Turn it on in System Settings → Privacy & Security → Speech Recognition.',
    ]);
  });

  it('falls back to SIGTERM when the helper ignores stdin, and promotes the last partial if it is killed', async () => {
    const bin = fake('stubborn', `
      out({ type: 'listening' });
      out({ type: 'transcript', text: 'git log', final: false });
      process.stdin.resume();
      setInterval(() => {}, 1000);
      process.on('SIGTERM', () => process.kill(process.pid, 'SIGKILL'));
    `);
    const speech = createSpeech(bin);
    const c = collect();
    expect(await speech.start(c.onT, c.onE)).toBe('ready');
    await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    await speech.stop();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
    expect(c.transcripts.at(-1)).toEqual({ text: 'git log', final: true });
    expect(c.errors).toEqual([]);
  });

  it('reports an unexpected exit, and can start again afterwards', async () => {
    const bin = fake('crash', `out({ type: 'listening' }); setTimeout(() => process.exit(3), 30);`);
    const speech = createSpeech(bin);
    const c = collect();
    expect(await speech.start(c.onT, c.onE)).toBe('ready');
    await new Promise((r) => setTimeout(r, 200));
    expect(c.errors).toHaveLength(1);
    expect(await speech.start(c.onT, c.onE)).toBe('ready');
    expect(spawns(bin)).toBe(2);
    speech.dispose();
  });

  it('dispose kills a running helper silently', async () => {
    const bin = fake('forever', `out({ type: 'listening' }); process.stdin.resume(); setInterval(() => {}, 1000);`);
    const speech = createSpeech(bin);
    const c = collect();
    expect(await speech.start(c.onT, c.onE)).toBe('ready');
    speech.dispose();
    await new Promise((r) => setTimeout(r, 200));
    expect(c.errors).toEqual([]);
    expect(await speech.start(c.onT, c.onE)).toBe('unavailable');
  });
});

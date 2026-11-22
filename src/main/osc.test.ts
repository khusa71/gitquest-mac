import { describe, expect, it } from 'vitest';
import { OscParser } from './osc';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const cmd = (c: string) => `\x1b]777;gq;cmd;${b64(c)}\x07`;
const done = (n: number) => `\x1b]777;gq;done;${n}\x07`;

function feedAll(chunks: string[]) {
  const p = new OscParser();
  let output = '';
  const events = [];
  for (const c of chunks) {
    const r = p.feed(c);
    output += r.output;
    events.push(...r.events);
  }
  return { output, events };
}

describe('OscParser', () => {
  it('passes plain output through', () => {
    expect(feedAll(['hello \x1b[31mred\x1b[0m\r\n'])).toEqual({ output: 'hello \x1b[31mred\x1b[0m\r\n', events: [] });
  });

  it('strips multiple sequences in one chunk and decodes cmd', () => {
    const r = feedAll([`a${cmd('git commit -m "héllo"')}b\r\n${done(0)}$ ${done(1)}`]);
    expect(r.output).toBe('ab\r\n$ ');
    expect(r.events).toEqual([
      { kind: 'cmd', command: 'git commit -m "héllo"' },
      { kind: 'done', exitCode: 0 },
      { kind: 'done', exitCode: 1 },
    ]);
  });

  it('handles a sequence split at every possible position', () => {
    const full = `x${cmd('git status')}y${done(128)}z`;
    for (let i = 0; i <= full.length; i++) {
      for (let j = i; j <= full.length; j++) {
        const r = feedAll([full.slice(0, i), full.slice(i, j), full.slice(j)]);
        expect(r.output).toBe('xyz');
        expect(r.events).toEqual([
          { kind: 'cmd', command: 'git status' },
          { kind: 'done', exitCode: 128 },
        ]);
      }
    }
  });

  it('leaves non-gq OSC sequences untouched, even when split', () => {
    const title = '\x1b]0;you@mac: ~/GitQuest/nova\x07';
    const other777 = '\x1b]777;notify;Title;Body\x07';
    const st = '\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\';
    const full = `${title}${other777}${st}${done(0)}`;
    for (let i = 0; i <= full.length; i++) {
      const r = feedAll([full.slice(0, i), full.slice(i)]);
      expect(r.output).toBe(title + other777 + st);
      expect(r.events).toEqual([{ kind: 'done', exitCode: 0 }]);
    }
  });

  it('holds a trailing partial prefix until it is disambiguated', () => {
    const p = new OscParser();
    expect(p.feed('abc\x1b]77').output).toBe('abc');
    expect(p.feed('7;other\x07').output).toBe('\x1b]777;other\x07');
  });

  it('flushes an absurdly long unterminated gq sequence as output', () => {
    const p = new OscParser();
    const junk = `\x1b]777;gq;cmd;${'A'.repeat(70 * 1024)}`;
    expect(p.feed(junk).output).toBe(junk);
    expect(p.feed('ok').output).toBe('ok');
  });
});

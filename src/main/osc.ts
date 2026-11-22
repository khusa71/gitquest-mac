/**
 * Pure parser for the GitQuest shell-hook protocol (docs/CONTRACTS.md):
 * strips every `ESC ] 777 ; gq ; <kind> ; <payload> BEL` from pty output and reports them as events.
 * Sequences may be split across chunks; everything else (including other OSC sequences) passes through untouched.
 */
export type GqEvent = { readonly kind: 'cmd'; readonly command: string } | { readonly kind: 'done'; readonly exitCode: number | null };

const PREFIX = '\x1b]777;gq;';
const BEL = '\x07';
// ponytail: an unterminated gq sequence longer than this is not ours; flush it as plain output.
const MAX_PENDING = 64 * 1024;

export class OscParser {
  private pending = '';

  feed(chunk: string): { output: string; events: GqEvent[] } {
    let s = this.pending + chunk;
    this.pending = '';
    let output = '';
    const events: GqEvent[] = [];
    for (;;) {
      const start = s.indexOf(PREFIX);
      if (start < 0) {
        const keep = partialPrefixLength(s);
        output += s.slice(0, s.length - keep);
        this.pending = s.slice(s.length - keep);
        break;
      }
      output += s.slice(0, start);
      const end = s.indexOf(BEL, start + PREFIX.length);
      if (end < 0) {
        this.pending = s.slice(start);
        if (this.pending.length > MAX_PENDING) {
          output += this.pending;
          this.pending = '';
        }
        break;
      }
      const event = toEvent(s.slice(start + PREFIX.length, end));
      if (event) events.push(event);
      s = s.slice(end + 1);
    }
    return { output, events };
  }
}

/** Length of the longest suffix of `s` that is a proper prefix of PREFIX (could become a gq sequence). */
function partialPrefixLength(s: string): number {
  for (let k = Math.min(PREFIX.length - 1, s.length); k > 0; k--) {
    if (s.endsWith(PREFIX.slice(0, k))) return k;
  }
  return 0;
}

function toEvent(body: string): GqEvent | null {
  const semi = body.indexOf(';');
  const kind = semi < 0 ? body : body.slice(0, semi);
  const payload = semi < 0 ? '' : body.slice(semi + 1);
  if (kind === 'cmd') return { kind, command: Buffer.from(payload, 'base64').toString('utf8') };
  if (kind === 'done') {
    const n = Number.parseInt(payload, 10);
    return { kind, exitCode: Number.isNaN(n) ? null : n };
  }
  return null; // unknown gq kinds are dropped (still stripped)
}

/** Shared by the natural-voice worker (what it speaks, chunk by chunk) and the renderer (what to highlight). */
const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr)\.$/i;

/**
 * Sentences to speak one by one, so playback starts after the first. Splits after . ! ? followed by whitespace
 * (file names like a.txt stay whole), on line breaks, and long sentences again after , ; : so none gets near
 * Kokoro's ~500-token limit.
 */
export function splitSentences(text: string, max = 300): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    let pending = '';
    for (const part of line.split(/(?<=[.!?]["')\]]?)\s+/)) {
      pending = pending ? `${pending} ${part}` : part;
      if (ABBREVIATION.test(pending)) continue; // "e.g. this" is one sentence
      out.push(...splitLong(pending.trim(), max));
      pending = '';
    }
    if (pending.trim()) out.push(...splitLong(pending.trim(), max));
  }
  return out.filter((s) => /[\p{L}\p{N}]/u.test(s));
}

function splitLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const out: string[] = [];
  let current = '';
  for (const piece of sentence.split(/(?<=[,;:])\s+/)) {
    if (current && current.length + piece.length + 1 > max) {
      out.push(current);
      current = piece;
    } else current = current ? `${current} ${piece}` : piece;
  }
  // ponytail: a single clause longer than `max` with no , ; : is sent whole; Kokoro truncates past ~500 tokens.
  if (current) out.push(current);
  return out;
}

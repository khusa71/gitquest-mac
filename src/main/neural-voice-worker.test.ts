import { describe, expect, it } from 'vitest';
import { splitSentences } from './neural-voice-worker';

describe('splitSentences', () => {
  it('splits after . ! ? and line breaks, keeping file names and abbreviations whole', () => {
    expect(splitSentences('Hint 2. Stage a.txt first! Ready?\nGoal: commit it, e.g. with git commit.')).toEqual([
      'Hint 2.',
      'Stage a.txt first!',
      'Ready?',
      'Goal: commit it, e.g. with git commit.',
    ]);
  });

  it('keeps closing quotes with their sentence and drops empty or punctuation-only pieces', () => {
    expect(splitSentences('He said "done." Then left.\n\n  ...  \n')).toEqual(['He said "done."', 'Then left.']);
    expect(splitSentences('')).toEqual([]);
  });

  it('breaks long sentences after commas, semicolons and colons', () => {
    const long = 'one two three, four five six; seven eight nine: ten eleven twelve.';
    const parts = splitSentences(long, 30);
    expect(parts.join(' ')).toBe(long);
    expect(parts.every((p) => p.length <= 30)).toBe(true);
    expect(parts.length).toBeGreaterThan(1);
  });
});

import { describe, expect, it } from 'vitest';
import { markAt, plan, speakable } from './read-aloud';

describe('speakable', () => {
  it('reads commands in code spans as words and leaves prose alone', () => {
    expect(speakable('Try `git log --oneline --graph --all` to see it.')).toBe('Try git log dash dash oneline dash dash graph dash dash all to see it.');
    expect(speakable('Run `git add app.ts` then `git commit -m "fix"`.')).toBe('Run git add app dot t s then git commit dash m "fix".');
    expect(speakable('Use `git reset --soft HEAD~1` or `origin/main`.')).toBe('Use git reset dash dash soft HEAD tilde 1 or origin slash main.');
    expect(speakable('No code here.')).toBe('No code here.');
  });
});

describe('plan', () => {
  it('maps each spoken piece back to the written words, a code span as one piece', () => {
    const p = plan('Run `git log --oneline` now.');
    expect(p.spoken).toBe('Run git log dash dash oneline now.');
    expect(p.words).toEqual(['Run', '`git', 'log', '--oneline`', 'now.']);
    expect(p.marks).toEqual([{ at: 0, from: 0, to: 0 }, { at: 4, from: 1, to: 3 }, { at: 30, from: 4, to: 4 }]);
    // A boundary inside "dash dash oneline" still points at the code span.
    expect(markAt(p.marks, p.spoken.indexOf('oneline'))).toEqual({ at: 4, from: 1, to: 3 });
    expect(markAt(p.marks, p.spoken.indexOf('now'))).toEqual({ at: 30, from: 4, to: 4 });
  });
});

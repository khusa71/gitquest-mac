import { describe, expect, it } from 'vitest';
import { isQuestion, toCommand } from './spoken';

describe('toCommand', () => {
  it.each([
    // Mission commands, spoken naturally.
    ['git status', 'git status'],
    ['Git status.', 'git status'],
    ['git add a dot txt', 'git add a.txt'],
    ['git add app dot ts', 'git add app.ts'],
    ['git add app dot TS', 'git add app.ts'],
    ['git add App.TS', 'git add app.ts'],
    ['git add notes dot txt', 'git add notes.txt'],
    ['git add notes dot text', 'git add notes.txt'],
    ['git add app dot t s', 'git add app.ts'],
    ['git commit dash m docs colon v2', 'git commit -m "docs: v2"'],
    ['git commit dash m docs colon v two', 'git commit -m "docs: v2"'],
    ['git commit -m "docs: v2"', 'git commit -m "docs: v2"'],
    ['git commit minus m quote docs colon v2 end quote', 'git commit -m "docs: v2"'],
    ['git commit message docs colon v2', 'git commit -m "docs: v2"'],
    ['git commit dash am docs colon readme', 'git commit -am "docs: readme"'],
    ['git commit dash a m docs colon readme', 'git commit -am "docs: readme"'],
    ['git commit dash m a new file', 'git commit -m "a new file"'],
    ['git log dash dash one line', 'git log --oneline'],
    ['git log --oneline', 'git log --oneline'],
    ['git log double dash oneline', 'git log --oneline'],
    ['git diff dash dash staged', 'git diff --staged'],
    ['git diff dash dash stage', 'git diff --staged'],
    ['git restore dash dash staged app dot ts', 'git restore --staged app.ts'],
    ['git reset dash dash soft head tilde one', 'git reset --soft HEAD~1'],
    ['git reset --soft HEAD~1', 'git reset --soft HEAD~1'],
    ['git reset dash dash hard head tilde to', 'git reset --hard HEAD~2'],
    // Mishearings.
    ['get status', 'git status'],
    ['get add app dot ts', 'git add app.ts'],
    ['git commits dash m fix', 'git commit -m "fix"'],
    ['git at notes dot txt', 'git add notes.txt'],
    ['git check out main', 'git checkout main'],
    ['git add read me dot md', 'git add README.md'],
    ['git add readme', 'git add README'],
    // Paths, refs and symbols.
    ['git add dot', 'git add .'],
    ['git add dot gitignore', 'git add .gitignore'],
    ['git add src slash app dot ts', 'git add src/app.ts'],
    ['git show head colon app dot ts', 'git show HEAD:app.ts'],
    ['git show head', 'git show HEAD'],
    ['git checkout head at one', 'git checkout HEAD@{1}'],
    ['git checkout dash dash app dot ts', 'git checkout -- app.ts'],
    ['git checkout dash b feature', 'git checkout -b feature'],
    ['git merge origin slash main', 'git merge origin/main'],
    ['git log dash n three', 'git log -n 3'],
    ['git commit dash m say "hi" and $HOME', 'git commit -m "say hi and \\$home"'],
    // Prefixes.
    ['run git status', 'git status'],
    ['type git add a dot txt', 'git add a.txt'],
    ['please run ls', 'ls'],
    ['type cat app dot ts', 'cat app.ts'],
    ['run cat dot gitignore', 'cat .gitignore'],
    // Not commands.
    ['what does git add do', null],
    ['why is my file not staged?', null],
    ['git is confusing', null],
    ['get me a hint', null],
    ['git', null],
    ['', null],
    ['ls', null],
  ])('%j → %j', (spoken, expected) => {
    expect(toCommand(spoken)).toBe(expected);
  });
});

describe('isQuestion', () => {
  it.each([
    ['what does git add do', true],
    ['why is app.ts still red?', true],
    ['How do I undo that', true],
    ['explain the index', true],
    ['give me a hint', true],
    ['the index confuses me?', true],
    ['git status', false],
    ['git add app dot ts', false],
    ['run ls', false],
  ])('%j → %j', (spoken, expected) => {
    expect(isQuestion(spoken)).toBe(expected);
  });
});

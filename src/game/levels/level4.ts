/**
 * Level 4 — Undo and recovery. Owner: the level 4 content agent. See docs/CONTENT-GUIDE.md.
 * Undo is off in every mission: the player recovers with git itself (restore, reset, revert, stash, reflog).
 * Story file contents differ in their first 18 characters: the diagrams label a file by that prefix.
 */
import {
  allOf,
  check,
  headBranch,
  headCommit,
  headFile,
  indexFile,
  isWorkingTreeClean,
  workingFile,
} from '../validate';

import type { Level, Mission, MissionContext } from '../model';
import { FAKE_SECRET, NOVA_FILES, leakSecret, productionRepo, strayDebugCommit } from '../production';
import type { Commit, RepoState } from '../../shared/repo-types';

// Story file contents ------------------------------------------------------

export const FILES = {
  readme: '# Nova notes app',
  sync1: 'Sync v1: local only.',
  syncBot: 'Sync BOT rewrite: every call blocks the UI.',
  sync2: 'Sync v2: offline cache.',
  syncBad: 'Sync v3 hotfix: poll the server every millisecond.',
  editor1: 'Editor v1: light theme.',
  editor2: 'Editor v2: dark theme.',
  editorRelease: 'Editor 1.0 release: light theme pinned.',
  editorWip: 'Editor WIP: auto theme follows macOS.',
  search1: 'Search v1: exact match.',
  searchWip: 'Search WIP: half-done regex.',
  search2: 'Search v2: fuzzy match.',
  searchBot: 'Search BOT rewrite: regex engine, untested.',
  experiment: 'Experiment BOT: regex engine, 900 lines, no tests.',
  theme: 'Theme CSS: dark palette for the editor.',
  debug: 'Debug log: 4000 lines of sync traces.',
  changelogRelease: 'Changelog 1.0: first public release.',
  changelogWip: 'Changelog WIP: auto theme.',
  cache: 'Cache v1: notes kept offline.',
  export: 'Export v1: notes to Markdown.',
  config: 'Config: reads NOVA_API_KEY from the environment.',
  env: 'NOVA_API_KEY=sk_test_nova_4242',
} as const;

const MSG = {
  typo: 'feat: dakr theme',
  fixed: 'feat: dark theme',
  combined: 'feat: offline sync and fuzzy search',
  bot: 'bot: rewrite search with a regex engine',
  shared: 'perf: sync every millisecond',
  autoTheme: 'feat: auto theme',
  cache: 'feat: offline cache',
  export: 'feat: export notes to Markdown',
  config: 'feat: server config',
} as const;

export const ROOT_COMMANDS: readonly string[] = [
  'git init -b main',
  `edit README.md "${FILES.readme}"`,
  `edit sync.ts "${FILES.sync1}"`,
  `edit editor.ts "${FILES.editor1}"`,
  `edit search.ts "${FILES.search1}"`,
  'git add .',
  'git commit -m "Initial commit"',
  'git remote add origin https://git.nova.example/nova.git',
  'git push -u origin main',
];

// Level helpers ------------------------------------------------------------

function subject(commit: Commit): string {
  return commit.message.split('\n')[0]!.trim();
}

/** The story's commits are found by their subject (hashes change from run to run). */
function commitByMessage(state: RepoState, message: string): Commit | undefined {
  return Object.values(state.commits).find((commit) => subject(commit) === message);
}

function isAncestor(state: RepoState, ancestor: string | undefined, tip: string | undefined): boolean {
  if (ancestor === undefined || tip === undefined) return false;
  const seen = new Set<string>();
  const todo = [tip];
  while (todo.length > 0) {
    const hash = todo.pop()!;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    todo.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
}

function onSomeBranch(state: RepoState, hash: string | undefined): boolean {
  return Object.values(state.branches).some((tip) => isAncestor(state, hash, tip));
}

/** Paths a commit changes compared to its first parent, sorted. */
function changedPaths(state: RepoState, commit: Commit): string[] {
  const before = state.commits[commit.parents[0] ?? '']?.snapshot ?? {};
  const after = commit.snapshot;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => before[p] !== after[p]).sort();
}

/** Commits on HEAD's first-parent line that did not exist at mission entry. */
function newOnHead(state: RepoState, ctx: { entryCommits: ReadonlySet<string> }): Commit[] {
  const out: Commit[] = [];
  let hash = headCommit(state);
  while (hash !== undefined && !ctx.entryCommits.has(hash)) {
    const commit = state.commits[hash];
    if (commit === undefined) break;
    out.push(commit);
    hash = commit.parents[0];
  }
  return out;
}

function headSubject(state: RepoState): string | undefined {
  const commit = state.commits[headCommit(state) ?? ''];
  return commit === undefined ? undefined : subject(commit);
}

function originMain(state: RepoState): string | undefined {
  return state.remotes?.['origin']?.branches['main'];
}

// 4.1 ----------------------------------------------------------------------

const discardEdit: Mission = {
  id: 'discard-edit',
  number: '4.1',
  title: 'Throw that away',
  story:
    'Nova Bot "tidied up" two files overnight. Its editor.ts change is a real improvement, but its sync.ts rewrite blocks the whole UI. Lea asks you to throw the sync.ts change away and keep the editor.',
  goal: 'Discard the uncommitted change to sync.ts and keep the editor.ts change on disk.',
  checks: [
    {
      label: 'sync.ts is back to its committed version',
      proof: 'git diff sync.ts',
      done: (state) => workingFile(state, 'sync.ts') === FILES.sync1,
    },
    {
      label: 'The editor.ts improvement is still on disk',
      proof: 'git diff editor.ts',
      done: (state) => workingFile(state, 'sync.ts') === FILES.sync1 && workingFile(state, 'editor.ts') === FILES.editor2,
    },
  ],
  validate: (state) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(workingFile(state, 'sync.ts') === FILES.sync1, 'sync.ts still has the bot rewrite. Restore it from the index.'),
      check(
        workingFile(state, 'editor.ts') === FILES.editor2,
        'The editor.ts improvement is gone. Only sync.ts had to be thrown away.',
      ),
    ),
  hints: [
    'Git can overwrite a file on disk with the version it already has stored.',
    'git restore copies a file from the index back onto disk. Name only sync.ts, not "."',
    'git restore sync.ts',
  ],
  par: 1,
  takeaway: 'git restore <file> throws away uncommitted edits to that file, and they cannot be recovered afterwards.',
  theory: {
    title: 'Discarding edits on disk',
    body: 'git restore <file> replaces the file on disk with the version in the index. Edits that were never staged or committed are not stored anywhere, so Git cannot bring them back. Name the exact files, because git restore . throws away every change in the folder.',
    lesson: 'git restore <file> discards uncommitted edits for good.',
  },
  danger: 'git restore <file> deletes uncommitted edits permanently. Check git diff first.',
  undo: false,
  outcome: {
    summary:
      'sync.ts is back to its committed version and the editor.ts improvement is still on disk. You threw away exactly one bad change and nothing else.',
    expect: {
      kind: 'terminal',
      command: 'git status -sb',
      output: '## main...origin/main\n M editor.ts',
    },
  },
  prelude: [{ id: 'm4.1-p1', commands: [`edit sync.ts "${FILES.syncBot}"`, `edit editor.ts "${FILES.editor2}"`] }],
  reference: ['git restore sync.ts'],
  alternatives: [['git checkout -- sync.ts']],
};

// 4.2 ----------------------------------------------------------------------

const unstage: Mission = {
  id: 'unstage',
  number: '4.2',
  title: 'Unstage',
  story:
    'You ran git add . to stage the dark theme, and it also swept in a debug log and your half-done search experiment. Samir only wants editor.ts in the next commit.',
  goal: 'Unstage search.ts and debug.log, keep editor.ts staged, and keep all three files on disk as they are.',
  checks: [
    {
      label: 'search.ts is unstaged, the experiment stays on disk',
      proof: 'git diff --staged search.ts',
      done: (state) =>
        indexFile(state, 'search.ts') === FILES.search1 && workingFile(state, 'search.ts') === FILES.searchWip,
    },
    {
      label: 'debug.log is unstaged and still on disk',
      proof: 'git status --short',
      done: (state) => indexFile(state, 'debug.log') === undefined && workingFile(state, 'debug.log') === FILES.debug,
    },
    {
      label: 'editor.ts is still staged',
      proof: 'git diff --staged --stat',
      done: (state) =>
        indexFile(state, 'editor.ts') === FILES.editor2 &&
        indexFile(state, 'search.ts') === FILES.search1 &&
        indexFile(state, 'debug.log') === undefined,
    },
  ],
  validate: (state) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(indexFile(state, 'search.ts') === FILES.search1, 'search.ts is still staged.'),
      check(indexFile(state, 'debug.log') === undefined, 'debug.log is still staged.'),
      check(indexFile(state, 'editor.ts') === FILES.editor2, 'editor.ts must stay staged.'),
      check(workingFile(state, 'search.ts') === FILES.searchWip, 'The search experiment must stay on disk.'),
      check(workingFile(state, 'debug.log') === FILES.debug, 'debug.log must stay on disk.'),
    ),
  hints: [
    'You want to undo git add, not the edits themselves.',
    'git restore --staged copies HEAD back into the index and leaves the disk alone. You can name several files.',
    'git restore --staged search.ts debug.log',
  ],
  par: 1,
  takeaway: 'git restore --staged takes a file out of the next commit without touching your edits on disk.',
  theory: {
    title: 'Undoing git add',
    body: 'git restore --staged <file> resets the index entry to what HEAD has, so the file drops out of the next commit. The file on disk is not touched, so no work is lost. For a brand new file it simply becomes untracked again.',
    lesson: 'git restore --staged undoes git add, safely.',
  },
  undo: false,
  outcome: {
    summary:
      'Only editor.ts is staged; search.ts and debug.log are still on disk, just not in the next commit. Your commits contain only what you meant to put in them.',
    expect: {
      kind: 'terminal',
      command: 'git status -sb',
      output: '## main...origin/main\nM  editor.ts\n M search.ts\n?? debug.log',
    },
  },
  prelude: [{ id: 'm4.2-p1', commands: [`edit search.ts "${FILES.searchWip}"`, `edit debug.log "${FILES.debug}"`, 'git add .'] }],
  reference: ['git restore --staged search.ts debug.log'],
  alternatives: [['git reset search.ts debug.log'], ['git restore --staged search.ts', 'git rm --cached debug.log']],
};

// 4.3 ----------------------------------------------------------------------

const amend: Mission = {
  id: 'amend-last-commit',
  number: '4.3',
  title: 'Fix the last commit',
  story:
    'You just committed the dark theme as "feat: dakr theme", and theme.css is still sitting untracked next to it. Nothing is pushed yet, so Ines suggests fixing the commit itself instead of adding a "fix typo" commit.',
  goal: 'Rewrite the last commit so its message is "feat: dark theme" and it includes theme.css.',
  checks: [
    {
      label: 'The last commit message reads "feat: dark theme"',
      proof: 'git log -1 --format=%s',
      done: (state) => headSubject(state) === MSG.fixed,
    },
    {
      label: 'theme.css is in the last commit',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'theme.css') === FILES.theme,
    },
    {
      label: 'The commit was replaced, not stacked on top',
      proof: 'git log --oneline -3',
      done: (state) => {
        const typo = commitByMessage(state, MSG.typo);
        const head = state.commits[headCommit(state) ?? ''];
        return typo !== undefined && head !== undefined && head.hash !== typo.hash && head.parents[0] === typo.parents[0];
      },
    },
  ],
  validate: (state) => {
    const typo = commitByMessage(state, MSG.typo);
    const head = state.commits[headCommit(state) ?? ''];
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(headSubject(state) === MSG.fixed, 'The last commit message must be exactly "feat: dark theme".'),
      check(headFile(state, 'theme.css') === FILES.theme, 'theme.css is not in the last commit yet.'),
      check(headFile(state, 'editor.ts') === FILES.editor2, 'The last commit must still contain the dark theme in editor.ts.'),
      check(
        headFile(state, 'search.ts') === FILES.search1 && headFile(state, 'debug.log') === undefined,
        'The search experiment and debug.log must stay out of the commit. Stage only theme.css.',
      ),
      check(
        typo !== undefined && head?.parents[0] === typo.parents[0],
        'There is an extra commit on top. Fix the existing commit with git commit --amend instead.',
      ),
    );
  },
  hints: [
    'Git can replace the last commit with a corrected one, as long as nobody has pulled it.',
    'Stage the forgotten file first, then git commit --amend with a new -m message.',
    'git add theme.css, then git commit --amend -m "feat: dark theme".',
  ],
  par: 2,
  takeaway: 'git commit --amend replaces the last commit: new message, new content, new hash.',
  theory: {
    title: 'Amending a commit',
    body: 'git commit --amend builds a new commit from the current index and puts it in place of the last one. Stage any forgotten file first, and pass -m to change the message (or --no-edit to keep it). The old commit gets a new hash, so only amend commits you have not pushed.',
    lesson: 'Amend local commits; never amend what others already pulled.',
  },
  undo: false,
  outcome: {
    summary:
      'The last commit is now called feat: dark theme and includes theme.css, with no extra fix-up commit. Your local history reads as if you got it right the first time.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat --oneline',
      output: '7cb5f3d (HEAD -> main) feat: dark theme\n editor.ts | 2 +-\n theme.css | 1 +\n 2 files changed, 2 insertions(+), 1 deletion(-)',
    },
  },
  prelude: [{ id: 'm4.3-p1', commands: [`edit theme.css "${FILES.theme}"`, `git commit -m "${MSG.typo}"`] }],
  reference: ['git add theme.css', `git commit --amend -m "${MSG.fixed}"`],
  alternatives: [
    [`git commit --amend -m "${MSG.fixed}"`, 'git add theme.css', 'git commit --amend --no-edit'],
    ['git reset --soft HEAD~1', 'git add theme.css', `git commit -m "${MSG.fixed}"`],
  ],
};

// 4.4 ----------------------------------------------------------------------

const onlyChanges = (state: RepoState, commit: Commit, path: string, content: string): boolean => {
  const changed = changedPaths(state, commit);
  return changed.length === 1 && changed[0] === path && commit.snapshot[path] === content;
};

const uncommit: Mission = {
  id: 'reset-soft-split',
  number: '4.4',
  title: 'Uncommit, keep the work',
  story:
    'Your last commit mixes two unrelated changes: the offline sync and the fuzzy search. Yanis wants to be able to revert one without the other, so it should be two commits.',
  goal: 'Replace the combined commit with two commits: one that only changes sync.ts and one that only changes search.ts.',
  checks: [
    {
      label: 'A commit that only changes sync.ts',
      proof: 'git log --stat -2',
      done: (state, ctx) => newOnHead(state, ctx).some((c) => onlyChanges(state, c, 'sync.ts', FILES.sync2)),
    },
    {
      label: 'A commit that only changes search.ts',
      proof: 'git log --stat -2',
      done: (state, ctx) => newOnHead(state, ctx).some((c) => onlyChanges(state, c, 'search.ts', FILES.search2)),
    },
    {
      label: 'The combined commit is no longer on main',
      proof: 'git log --oneline -3',
      done: (state) =>
        !isAncestor(state, commitByMessage(state, MSG.combined)?.hash, headCommit(state)) &&
        headFile(state, 'sync.ts') === FILES.sync2 &&
        headFile(state, 'search.ts') === FILES.search2,
    },
  ],
  validate: (state, ctx) => {
    const combined = commitByMessage(state, MSG.combined);
    const fresh = newOnHead(state, ctx);
    const parentOfOldest = fresh.at(-1)?.parents[0];
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        !isAncestor(state, combined?.hash, headCommit(state)),
        'The combined commit is still on main. Undo it with git reset --soft HEAD~1.',
      ),
      check(
        headFile(state, 'sync.ts') === FILES.sync2 && headFile(state, 'search.ts') === FILES.search2,
        'Both changes must end up committed on main.',
      ),
      check(
        fresh.length === 2 && parentOfOldest === combined?.parents[0],
        'Main must have exactly two new commits where the combined one was.',
      ),
      check(
        fresh.some((c) => onlyChanges(state, c, 'sync.ts', FILES.sync2)) &&
          fresh.some((c) => onlyChanges(state, c, 'search.ts', FILES.search2)),
        'Each new commit must change only one file: sync.ts in one, search.ts in the other.',
      ),
      check(isWorkingTreeClean(state), 'Leave the working directory clean.'),
    );
  },
  hints: [
    'Take the commit back without losing its changes, then commit them again in two steps.',
    'git reset --soft HEAD~1 moves main back one commit and leaves both changes staged. Unstage one, commit, then commit the other.',
    'git reset --soft HEAD~1, git restore --staged search.ts, git commit -m "feat: offline sync", git commit -am "feat: fuzzy search".',
  ],
  par: 4,
  takeaway: 'git reset --soft HEAD~1 undoes a commit but keeps its changes staged, ready to be committed again.',
  theory: {
    title: 'Reset soft and mixed',
    body: 'git reset moves the current branch to another commit. With --soft the changes of the undone commit stay staged; with the default --mixed they stay on disk but unstaged. Either way nothing in your files is lost, so you can commit the work again the way you want.',
    lesson: 'reset --soft: uncommit, keep everything staged.',
  },
  undo: false,
  outcome: {
    summary:
      'The combined commit is replaced by two commits that each change one file, and none of the work is lost. Either change can now be reviewed or reverted on its own.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --stat -2',
      output: 'a1577f1 (HEAD -> main) feat: fuzzy search\n search.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n21b0d02 feat: offline sync\n sync.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)',
    },
  },
  prelude: [
    { id: 'm4.4-p1', when: (state) => workingFile(state, 'debug.log') === undefined, commands: ['rm debug.log'] },
    {
      id: 'm4.4-p2',
      commands: [`edit sync.ts "${FILES.sync2}"`, `edit search.ts "${FILES.search2}"`, `git commit -am "${MSG.combined}"`],
    },
  ],
  reference: [
    'git reset --soft HEAD~1',
    'git restore --staged search.ts',
    'git commit -m "feat: offline sync"',
    'git commit -am "feat: fuzzy search"',
  ],
  alternatives: [
    ['git reset HEAD~1', 'git add sync.ts', 'git commit -m "feat: offline sync"', 'git commit -am "feat: fuzzy search"'],
    ['git reset --soft HEAD~1', 'git commit -m "feat: fuzzy search" search.ts', 'git commit -m "feat: offline sync"'],
  ],
};

// 4.5 ----------------------------------------------------------------------

const dropCommit: Mission = {
  id: 'reset-hard-backup',
  number: '4.5',
  title: 'Drop a bad commit',
  story:
    'Nova Bot committed a 900-line regex rewrite of search straight onto your local main. It is not pushed, and the team does not want it. Lea\'s rule: before any reset --hard, put a branch on what you are about to drop.',
  goal: 'Create a branch named backup on the bot commit, then move main back to the commit before it with a clean working directory.',
  checks: [
    {
      label: 'Branch backup keeps the bot commit',
      proof: 'git log --oneline -1 backup',
      done: (state) => isAncestor(state, commitByMessage(state, MSG.bot)?.hash, state.branches['backup']),
    },
    {
      label: 'main is back on the commit before, with nothing left on disk',
      proof: 'git log --oneline -2 && git status',
      done: (state) =>
        headCommit(state) === commitByMessage(state, MSG.bot)?.parents[0] && isWorkingTreeClean(state),
    },
  ],
  validate: (state) => {
    const bot = commitByMessage(state, MSG.bot);
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must be back on main.'),
      check(state.branches['backup'] !== undefined, 'Create a branch named backup first: it is your safety net.'),
      check(isAncestor(state, bot?.hash, state.branches['backup']), 'backup must point at the bot commit.'),
      check(headCommit(state) === bot?.parents[0], 'main must point at the commit just before the bot commit.'),
      check(isWorkingTreeClean(state), 'The bot files are still on disk. reset --hard also resets the working directory.'),
    );
  },
  hints: [
    'First make the bad commit easy to find again, then move main back.',
    'A branch is a cheap bookmark. Create it where HEAD is now, then reset --hard one commit back.',
    'git branch backup, then git reset --hard HEAD~1.',
  ],
  par: 2,
  takeaway: 'git reset --hard moves the branch and wipes the disk to match; a backup branch first makes it reversible.',
  theory: {
    title: 'Reset hard',
    body: 'git reset --hard <commit> moves the current branch, the index and the files on disk to that commit. Commits you move away from are not deleted at once, but uncommitted work is gone for good. Creating a branch first (git branch backup) keeps an easy way back.',
    lesson: 'Bookmark with git branch before any reset --hard.',
  },
  danger: 'git reset --hard destroys uncommitted work and drops commits from the branch. Create a backup branch first.',
  undo: false,
  outcome: {
    summary:
      'main is back on your last good commit with a clean working tree, and the bot commit is still safe on backup. The bad commit is gone from main, but nothing is truly lost.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph --all -4',
      output: '* ee2cd24 (backup) bot: rewrite search with a regex engine\n* a1577f1 (HEAD -> main) feat: fuzzy search\n* 21b0d02 feat: offline sync\n* 7cb5f3d feat: dark theme',
    },
  },
  prelude: [
    {
      id: 'm4.5-p1',
      teammate: 'bot',
      commands: [
        `edit search.ts "${FILES.searchBot}"`,
        `edit experiment.ts "${FILES.experiment}"`,
        'git add .',
        `git commit -m "${MSG.bot}"`,
      ],
    },
  ],
  reference: ['git branch backup', 'git reset --hard HEAD~1'],
  alternatives: [['git reset --hard HEAD~1', 'git branch backup HEAD@{1}']],
};

// 4.6 ----------------------------------------------------------------------

const revertShared: Mission = {
  id: 'revert-shared',
  number: '4.6',
  title: 'Undo in public',
  story:
    'Lea pushed a "hotfix" that makes sync poll the server every millisecond, and Samir and Ines have already pulled it. You have it on main too. Undo it without rewriting the history they already have, then push.',
  goal: "Undo Lea's commit with a new commit, keep her commit in history, and push main to origin.",
  checks: [
    {
      label: 'sync.ts is back to the version before the hotfix',
      proof: 'git show HEAD:sync.ts',
      done: (state) => headFile(state, 'sync.ts') === FILES.sync2,
    },
    {
      label: "Lea's commit is still in main's history",
      proof: 'git log --oneline -3',
      done: (state) => {
        const shared = commitByMessage(state, MSG.shared)?.hash;
        return shared !== headCommit(state) && isAncestor(state, shared, headCommit(state));
      },
    },
    {
      label: 'origin has the fix',
      proof: 'git log --oneline -1 origin/main',
      done: (state) => originMain(state) === headCommit(state) && headFile(state, 'sync.ts') === FILES.sync2,
    },
  ],
  validate: (state) => {
    const shared = commitByMessage(state, MSG.shared)?.hash;
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        isAncestor(state, shared, headCommit(state)),
        "Lea's commit disappeared from main. Teammates already have it: undo it with git revert, not by rewriting history.",
      ),
      check(headFile(state, 'sync.ts') === FILES.sync2, 'sync.ts must go back to the version before the hotfix.'),
      check(isAncestor(state, shared, originMain(state)), "origin lost Lea's commit. Shared history must only grow."),
      check(originMain(state) === headCommit(state), 'Push main so the team gets the fix.'),
    );
  },
  hints: [
    'On a shared branch, add a commit that undoes the change instead of removing the old one.',
    'git revert creates the opposite commit. --no-edit keeps the default message so no editor opens.',
    'git revert --no-edit HEAD, then git push.',
  ],
  par: 2,
  takeaway: 'git revert undoes a commit by adding its opposite, so shared history only moves forward.',
  theory: {
    title: 'Revert versus reset',
    body: 'git revert <commit> creates a new commit that applies the opposite of that change. History only grows, so teammates can pull it normally. Resetting a pushed commit away forces everyone else to repair their repos, which is why revert is the safe undo on shared branches.',
    lesson: 'Pushed? Revert. Local only? Reset or amend.',
  },
  undo: false,
  outcome: {
    summary:
      'Lea\'s change is undone by a new commit on origin/main, and her commit stays in history. Teammates who already pulled just pull again: nobody\'s history is rewritten.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: 'f2bbd02 (HEAD -> main, origin/main) Revert "perf: sync every millisecond"\nf588ce7 perf: sync every millisecond\na1577f1 feat: fuzzy search',
    },
  },
  prelude: [
    { id: 'm4.6-p1', commands: ['git push origin main'] },
    {
      id: 'm4.6-p2',
      teammate: 'lea',
      remote: { push: ['main'] },
      commands: [`edit sync.ts "${FILES.syncBad}"`, `git commit -am "${MSG.shared}"`],
    },
    { id: 'm4.6-p3', commands: ['git pull --ff-only origin main'] },
  ],
  reference: ['git revert --no-edit HEAD', 'git push'],
  alternatives: [['git revert --no-edit HEAD', 'git push origin main']],
};

// 4.7 ----------------------------------------------------------------------

const releaseFixed = (state: RepoState): boolean => {
  const tip = state.commits[state.branches['release'] ?? '']?.snapshot ?? {};
  return tip['VERSION']?.trim() === '1.0.1' && tip['CHANGELOG.md'] === FILES.changelogRelease;
};

const wipBack = (state: RepoState): boolean =>
  headBranch(state) === 'main' &&
  workingFile(state, 'editor.ts') === FILES.editorWip &&
  workingFile(state, 'CHANGELOG.md') === FILES.changelogWip &&
  headFile(state, 'editor.ts') === FILES.editor2;

const stashSwitch: Mission = {
  id: 'stash-switch',
  number: '4.7',
  title: 'Park it',
  story:
    'You are halfway through an auto theme on main, with a new CHANGELOG.md. Yanis needs VERSION bumped to 1.0.1 on the release branch right now, but git refuses to switch with your unfinished work in the way.',
  goal: 'Commit VERSION 1.0.1 on release, then come back to main with your unfinished work restored and an empty stash list.',
  checks: [
    {
      label: 'VERSION 1.0.1 is committed on release',
      proof: 'git show release:VERSION',
      done: (state) => releaseFixed(state),
    },
    {
      label: 'Back on main with your work, CHANGELOG.md included',
      proof: 'git status --short',
      done: (state) => releaseFixed(state) && wipBack(state),
    },
    {
      label: 'The stash list is empty',
      proof: 'git stash list',
      done: (state, ctx) => releaseFixed(state) && ctx.facts.stashes.length === 0,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        releaseFixed(state),
        'release needs a commit with VERSION set to 1.0.1 (and its own CHANGELOG.md untouched).',
      ),
      check(headBranch(state) === 'main', 'Switch back to main when the release fix is done.'),
      check(
        headFile(state, 'editor.ts') === FILES.editor2,
        'Your unfinished auto theme must not be committed on main.',
      ),
      check(
        workingFile(state, 'editor.ts') === FILES.editorWip,
        'Your editor.ts work is not back on disk. Bring it back from the stash.',
      ),
      check(
        workingFile(state, 'CHANGELOG.md') === FILES.changelogWip,
        'Your new CHANGELOG.md is not back. Untracked files are only stashed with -u.',
      ),
      check(ctx.facts.stashes.length === 0, 'The stash list is not empty. git stash pop applies and drops in one go.'),
    ),
  hints: [
    'Put your unfinished work aside, do the fix, then take the work back.',
    'git stash push -u -m "…" saves edits and untracked files. git stash pop brings them back and empties the stash.',
    'git stash push -u -m "wip: auto theme", git switch release, echo 1.0.1 > VERSION, git commit -am "release: 1.0.1", git switch main, git stash pop.',
  ],
  par: 6,
  takeaway: 'git stash push -u parks unfinished work, including new files, so you can switch branches and pop it back later.',
  theory: {
    title: 'The stash',
    body: 'git stash push saves your uncommitted changes in a stack and resets your files to HEAD. -u also saves untracked files and -m gives the entry a name you can find in git stash list. git stash pop re-applies the newest entry and drops it; git stash apply keeps it.',
    lesson: 'stash push -u to park, stash pop to resume.',
  },
  undo: false,
  outcome: {
    summary:
      'release has the VERSION 1.0.1 commit, and you are back on main with your unfinished theme work restored and nothing left in the stash. An urgent fix never costs you your work in progress.',
    expect: {
      kind: 'terminal',
      command: 'git status -sb',
      output: '## main...origin/main\n M editor.ts\n?? CHANGELOG.md',
    },
  },
  prelude: [
    {
      id: 'm4.7-p1',
      teammate: 'yanis',
      commands: [
        'git switch -c release',
        'edit VERSION "1.0.0"',
        `edit CHANGELOG.md "${FILES.changelogRelease}"`,
        `edit editor.ts "${FILES.editorRelease}"`,
        'git add .',
        'git commit -m "release: 1.0.0"',
        'git switch main',
      ],
    },
    { id: 'm4.7-p2', commands: [`edit editor.ts "${FILES.editorWip}"`, `edit CHANGELOG.md "${FILES.changelogWip}"`] },
  ],
  reference: [
    'git stash push -u -m "wip: auto theme"',
    'git switch release',
    'edit VERSION "1.0.1"',
    'git commit -am "release: 1.0.1"',
    'git switch main',
    'git stash pop',
  ],
  alternatives: [
    [
      'git stash -u',
      'git switch release',
      'edit VERSION "1.0.1"',
      'git commit -am "release: 1.0.1"',
      'git switch main',
      'git stash apply',
      'git stash drop',
    ],
  ],
};

// 4.8 ----------------------------------------------------------------------

const reflogRescue: Mission = {
  id: 'reflog-rescue',
  number: '4.8',
  title: 'The bot ran reset --hard',
  story:
    'You committed the auto theme and the offline cache, then Nova Bot "cleaned up" with git reset --hard HEAD~2. Both commits vanished from git log, but git never forgets where HEAD has been.',
  goal: 'Find the lost commits in the reflog and put a branch named rescue (or main) back on them.',
  checks: [
    {
      label: '"feat: offline cache" is on a branch again',
      proof: 'git log --oneline --all',
      done: (state) => onSomeBranch(state, commitByMessage(state, MSG.cache)?.hash),
    },
    {
      label: '"feat: auto theme" is on a branch again',
      proof: 'git log --oneline --all',
      done: (state) => onSomeBranch(state, commitByMessage(state, MSG.autoTheme)?.hash),
    },
  ],
  validate: (state) =>
    allOf(
      check(
        onSomeBranch(state, commitByMessage(state, MSG.cache)?.hash),
        'The lost commits are not on any branch yet. Find "feat: offline cache" in git reflog, then git branch rescue <hash>.',
      ),
    ),
  hints: [
    'git log only shows what branches reach. Another log records every place HEAD has been.',
    'git reflog lists HEAD\'s moves. The entry just before "reset: moving to HEAD~2" is your lost tip; HEAD@{1} names it.',
    'git reflog, then git branch rescue HEAD@{1}.',
  ],
  par: 2,
  takeaway: 'The reflog remembers every commit HEAD pointed to, so a branch on that hash brings "lost" commits back.',
  theory: {
    title: 'The reflog',
    body: 'Every time HEAD moves (commit, reset, switch), git writes a line to the reflog: git reflog shows them, newest first, as HEAD@{0}, HEAD@{1}… A commit dropped by reset is still in the repo, so git branch rescue <hash> makes it reachable again. The reflog is local only: entries for commits no branch reaches anymore (like these) expire after 30 days (gc.reflogExpireUnreachable), the others after 90.',
    lesson: 'Lost a commit? git reflog, then branch on it.',
  },
  danger: 'Practises recovery after git reset --hard. Uncommitted work is never in the reflog.',
  undo: false,
  outcome: {
    summary:
      'A branch named rescue points at your two lost commits again. Commits that vanish after a hard reset can be recovered as long as the reflog remembers them.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3 rescue',
      output: '9545e83 (rescue) feat: offline cache\nd2ad330 feat: auto theme\nf2bbd02 (HEAD -> main, origin/main) Revert "perf: sync every millisecond"',
    },
  },
  prelude: [
    {
      id: 'm4.8-p1',
      commands: [
        'git add .',
        `git commit -m "${MSG.autoTheme}"`,
        `edit cache.ts "${FILES.cache}"`,
        'git add cache.ts',
        `git commit -m "${MSG.cache}"`,
      ],
    },
    { id: 'm4.8-p2', teammate: 'bot', commands: ['git reset --hard HEAD~2'] },
  ],
  reference: ['git reflog', 'git branch rescue HEAD@{1}'],
  alternatives: [['git reset --hard HEAD@{1}'], ['git branch rescue ORIG_HEAD']],
};

// 4.9 ----------------------------------------------------------------------

const EXPORT_BRANCH = 'feature/export';
const exportBack = (state: RepoState) => {
  const tip = state.branches[EXPORT_BRANCH];
  return tip !== undefined && tip === commitByMessage(state, MSG.export)?.hash;
};

const deletedBranch: Mission = {
  id: 'deleted-branch-rescue',
  number: '4.9',
  title: 'The bot deleted a branch',
  story:
    'You finished Markdown export on feature/export and went back to main. Then Nova Bot "pruned stale branches" with git branch -D feature/export, and the branch was never pushed or merged.',
  goal: 'Bring feature/export back, pointing at your export commit.',
  checks: [
    {
      label: 'feature/export exists again',
      proof: 'git branch',
      done: (state) => state.branches[EXPORT_BRANCH] !== undefined,
    },
    {
      label: 'It points at "feat: export notes to Markdown"',
      proof: 'git log --oneline -1 feature/export',
      done: exportBack,
    },
  ],
  validate: (state) =>
    allOf(
      check(
        state.branches[EXPORT_BRANCH] !== undefined,
        'feature/export does not exist yet. Find its last commit in git reflog and create the branch there.',
      ),
      check(exportBack(state), 'feature/export must point at "feat: export notes to Markdown", the commit you made on it.'),
    ),
  hints: [
    'Deleting a branch only deletes the name. The commit is still in the repo, and HEAD was on it a minute ago.',
    'git reflog shows "checkout: moving from feature/export to main" and, just before it, your export commit. HEAD@{1} names that entry.',
    'git reflog, then git branch feature/export HEAD@{1}.',
  ],
  par: 2,
  takeaway: 'A deleted branch is just a lost name: git reflog finds its last commit and git branch <name> <hash> brings it back.',
  theory: {
    title: 'Recovering a deleted branch',
    body: 'git branch -D removes the branch name and its own reflog, but not its commits, and it even prints the tip: "Deleted branch feature/export (was 1a2b3c4)". If that output is gone, HEAD\'s reflog still lists every commit you had checked out, so git branch <name> <hash> (or HEAD@{n}) recreates it. Commits that no branch or reflog entry reaches are removed by git gc after about two weeks, so recover soon.',
    lesson: 'Branch deleted? git reflog, then git branch <name> <hash>.',
  },
  danger: 'git branch -D deletes a branch even when its commits are merged nowhere.',
  undo: false,
  outcome: {
    summary:
      'feature/export exists again and points at your export commit. Deleting a branch only removes a label: the commits stay findable in the reflog.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2 feature/export',
      output: 'b24dd1c (feature/export) feat: export notes to Markdown\nf2bbd02 (HEAD -> main, origin/main) Revert "perf: sync every millisecond"',
    },
  },
  prelude: [
    {
      id: 'm4.9-p1',
      commands: [
        `git switch -c ${EXPORT_BRANCH}`,
        `edit export.ts "${FILES.export}"`,
        'git add export.ts',
        `git commit -m "${MSG.export}"`,
        'git switch main',
      ],
    },
    { id: 'm4.9-p2', teammate: 'bot', commands: [`git branch -D ${EXPORT_BRANCH}`] },
  ],
  reference: ['git reflog', `git branch ${EXPORT_BRANCH} HEAD@{1}`],
  alternatives: [[`git switch -c ${EXPORT_BRANCH} HEAD@{1}`, 'git switch main'], [`git checkout -b ${EXPORT_BRANCH} HEAD@{1}`]],
};

// 4.10 ---------------------------------------------------------------------

/** Every commit reachable from `tip`. */
function reachable(state: RepoState, tip: string | undefined): Commit[] {
  const out: Commit[] = [];
  const seen = new Set<string>();
  const todo = tip === undefined ? [] : [tip];
  while (todo.length > 0) {
    const hash = todo.pop()!;
    const commit = state.commits[hash];
    if (seen.has(hash) || commit === undefined) continue;
    seen.add(hash);
    out.push(commit);
    todo.push(...commit.parents);
  }
  return out;
}

const ignoresEnvFile = (text: string | undefined) =>
  (text ?? '').split('\n').some((line) => ['.env', '/.env', '*.env', '.env*'].includes(line.trim()));
/** origin has main, and no commit any server branch reaches contains .env. */
const serverEnvFree = (state: RepoState, ctx: MissionContext) => {
  const tips = Object.values(ctx.facts.server?.branches ?? {});
  return tips.length > 0 && tips.every((tip) => state.commits[tip] !== undefined && !reachable(state, tip).some((c) => c.snapshot['.env'] !== undefined));
};
const envIgnored = (state: RepoState, ctx: MissionContext) =>
  ctx.facts.ignored.includes('.env') && ignoresEnvFile(headFile(state, '.gitignore'));
const notesRotation = (state: RepoState, ctx: MissionContext) =>
  newOnHead(state, ctx).some((c) => c.snapshot['config.ts'] === FILES.config && /rotat/i.test(c.message));

const pushedSecret: Mission = {
  id: 'pushed-secret',
  number: '4.10',
  title: 'The key is on the server',
  story:
    'Nova Bot committed the server config together with .env and pushed main a minute ago. The .env holds a real API key, and nobody has pulled yet. Lea has already rotated the key; your job is to get the file out of history on origin.',
  goal: 'Rewrite the bot commit without .env, ignore .env, say in the commit message that the key was rotated, and force-push safely.',
  checks: [
    {
      label: 'No commit on origin contains .env',
      proof: 'git log --oneline origin/main -- .env',
      done: serverEnvFree,
    },
    {
      label: '.env stays on your Mac, ignored by a committed .gitignore',
      proof: 'git check-ignore -v .env',
      done: envIgnored,
    },
    {
      label: 'The rewritten commit says the key was rotated',
      proof: 'git log -1 --format=%B',
      done: notesRotation,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.inProgress === null, 'An operation is still in progress: finish it (--continue) or abort it first.'),
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        !reachable(state, state.branches['main']).some((c) => c.snapshot['.env'] !== undefined),
        '.env is still in a commit on main. Deleting it in a new commit is not enough: take it out of the commit that added it (git rm --cached .env, then git commit --amend).',
      ),
      check(headFile(state, 'config.ts') === FILES.config, "Keep the bot's config.ts: only .env has to go."),
      check(
        workingFile(state, '.env') !== undefined || ctx.facts.ignored.includes('.env'),
        '.env must stay on disk: the app still reads it. Use git rm --cached, not git rm.',
      ),
      check(envIgnored(state, ctx), 'Add .env to .gitignore and commit .gitignore, so nobody (and no agent) commits it again.'),
      check(notesRotation(state, ctx), 'Say in the rewritten commit message that the key was rotated, for example with a second -m.'),
      check(
        originMain(state) === state.branches['main'],
        'origin still has the old commit with .env. Push your rewritten main with git push --force-with-lease.',
      ),
      check(serverEnvFree(state, ctx), 'A branch on origin still reaches a commit with .env.'),
    ),
  hints: [
    'Fix the commit itself, not with a new commit on top, then replace it on the server.',
    'git rm --cached .env keeps the file but drops it from the commit; add .env to .gitignore, stage it, git commit --amend with a message about the rotation, then git push --force-with-lease (main was pushed, so a normal push is rejected).',
    'git rm --cached .env, echo ".env" >> .gitignore, git add .gitignore, git commit --amend -m "feat: server config" -m "Removed .env; the leaked key was rotated.", git push --force-with-lease',
  ],
  par: 5,
  takeaway: 'A pushed secret is fixed in three moves: rotate the key, rewrite the commit without it, and force-push with --force-with-lease.',
  theory: {
    title: 'A secret that was already pushed',
    body: 'Once a key reaches the server, assume it is stolen: rotate it first, because bots scan new pushes within minutes and anyone may have fetched. Then take the file out of the commit that added it (git rm --cached plus git commit --amend for the last commit, an interactive rebase or git filter-repo for older ones), ignore it, and replace the server branch with git push --force-with-lease. On GitHub the old commit can stay reachable by its hash, in forks and in pull request refs, so only support can purge it completely.',
    lesson: 'Pushed a secret? Rotate, rewrite, force-with-lease.',
  },
  danger: 'This rewrites main on the server. Do it only right after the push, before others build on it, and always with --force-with-lease.',
  undo: false,
  outcome: {
    summary:
      'The commit on origin/main no longer contains .env, .env is ignored from now on, and the commit message says the key was rotated. The leaked file is gone from the server\'s history and the config work is kept.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat --oneline',
      output: '7e69a1c (HEAD -> main, origin/main) feat: server config\n .gitignore | 1 +\n config.ts  | 1 +\n 2 files changed, 2 insertions(+)',
    },
  },
  prelude: [
    {
      id: 'm4.10-p1',
      teammate: 'bot',
      commands: [`edit config.ts "${FILES.config}"`, `edit .env "${FILES.env}"`, 'git add config.ts .env', `git commit -m "${MSG.config}"`, 'git push'],
    },
  ],
  reference: [
    'git rm --cached .env',
    'append .gitignore ".env"',
    'git add .gitignore',
    `git commit --amend -m "${MSG.config}" -m "Removed .env from history. The leaked key was rotated."`,
    'git push --force-with-lease',
  ],
  alternatives: [
    [
      'git reset --soft HEAD~1',
      'git restore --staged .env',
      'append .gitignore ".env"',
      'git add .gitignore',
      'git commit -m "feat: server config (key rotated, .env untracked)"',
      'git push --force-with-lease origin main',
    ],
  ],
};

// 4.11 Capstone: a secret in the next push (production repo) -----------------


const ROUTES = 'apps/web/src/routes.ts';
const EDITOR = 'apps/web/src/editor.tsx';
const ANALYTICS = 'apps/web/src/analytics.ts';
const WIP_ROUTES = NOVA_FILES[ROUTES]!.replace(
  "  { path: '/settings', title: 'Settings' },\n",
  "  { path: '/settings', title: 'Settings' },\n  { path: '/export', title: 'Export' },\n",
);
if (WIP_ROUTES === NOVA_FILES[ROUTES]) throw new Error('level4: the routes.ts work in progress did not apply');
/** Last commit of the production history: the team's work that must survive the cleanup. */
const TEAM_TIP = 'docs(changelog): note the editor whitespace fix';

function historyOf(state: RepoState, tip: string | undefined): Commit[] {
  const out: Commit[] = [];
  const seen = new Set<string>();
  const todo = tip === undefined ? [] : [tip];
  while (todo.length > 0) {
    const hash = todo.pop()!;
    const commit = state.commits[hash];
    if (seen.has(hash) || commit === undefined) continue;
    seen.add(hash);
    out.push(commit);
    todo.push(...commit.parents);
  }
  return out;
}

const mainTip = (state: RepoState) => state.commits[state.branches['main'] ?? '']?.snapshot ?? {};
const carriesEnv = (state: RepoState, tip: string | undefined) => historyOf(state, tip).some((c) => c.snapshot['.env'] !== undefined);
const keepsAnalytics = (state: RepoState) => {
  const analytics = mainTip(state)[ANALYTICS];
  return analytics !== undefined && !analytics.includes(FAKE_SECRET);
};
const noDebugLog = (state: RepoState) => !historyOf(state, state.branches['main']).some((c) => c.snapshot['debug.log'] !== undefined);
const editorClean = (state: RepoState) => mainTip(state)[EDITOR] === NOVA_FILES[EDITOR];
const envFree = (state: RepoState) => keepsAnalytics(state) && !carriesEnv(state, state.branches['main']);
const debugFree = (state: RepoState) => keepsAnalytics(state) && noDebugLog(state) && editorClean(state);
const serverClean = (state: RepoState) =>
  Object.values(state.remotes?.['origin']?.branches ?? {}).every((tip) => !carriesEnv(state, tip));
const cleanPushed = (state: RepoState) =>
  envFree(state) && debugFree(state) && serverClean(state) && originMain(state) === state.branches['main'];

const secretBeforePush: Mission = {
  id: 'secret-before-push',
  number: '4.11',
  title: 'A secret in the next push',
  capstone: true,
  story:
    'You paired with Yanis and Ines today: their analytics commit force-added .env with an API key, and a "wip" commit full of debug logging sits on top of it. Neither is pushed yet, and your new /export route in routes.ts is still half done.',
  goal: 'Push main with analytics.ts but without .env or the wip commit anywhere in its history, and keep your routes.ts work in progress.',
  checks: [
    { label: 'No commit on main carries .env', proof: 'git log --oneline main -- .env', done: envFree },
    { label: 'The wip commit and its debug logging are gone from main', proof: 'git log --oneline -3', done: debugFree },
    { label: 'origin/main has analytics.ts and never saw .env', proof: 'git log --oneline origin/main -- .env', done: cleanPushed },
    {
      label: 'Your routes.ts work is back on disk, uncommitted',
      proof: 'git status --short',
      done: (state) => envFree(state) && debugFree(state) && workingFile(state, ROUTES) === WIP_ROUTES && headFile(state, ROUTES) === NOVA_FILES[ROUTES],
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.inProgress === null, 'An operation is still in progress: finish it (--continue) or abort it first.'),
      check(
        !carriesEnv(state, state.branches['main']),
        '.env is still in a commit on main. Deleting it in a new commit is not enough: rewrite the commit that added it (git rm --cached .env, then git commit --amend).',
      ),
      check(keepsAnalytics(state), 'apps/web/src/analytics.ts must stay committed on main (it reads the key, it must not contain it).'),
      check(noDebugLog(state), 'The "wip" commit (debug.log) is still in the history of main: drop it, do not revert it.'),
      check(editorClean(state), 'apps/web/src/editor.tsx on main still has the debug console.log.'),
      check(
        Object.values(state.commits).some((c) => c.message.startsWith(TEAM_TIP) && isAncestor(state, c.hash, state.branches['main'])),
        "Keep the team's history: main must still contain everything that was already on origin.",
      ),
      check(
        serverClean(state),
        'A branch on origin contains .env: rewrite it locally, push with --force-with-lease, and rotate the key, because anyone may have fetched it.',
      ),
      check(originMain(state) === state.branches['main'], 'Push the cleaned main to origin.'),
      check(workingFile(state, ROUTES) === WIP_ROUTES, 'Your unfinished routes.ts work is not on disk. If you stashed it, git stash pop.'),
      check(headFile(state, ROUTES) === NOVA_FILES[ROUTES], 'Keep the routes.ts work uncommitted: it is not finished.'),
    ),
  hints: [
    'Two commits must not leave your Mac, one of them half-good, and your working tree holds work you cannot lose.',
    'Park routes.ts (git stash), drop the wip commit with git reset --hard HEAD~1, then take .env out of the analytics commit with git rm --cached .env and git commit --amend. Push, then git stash pop.',
    'git stash push -m "wip: export route", git reset --hard HEAD~1, git rm --cached .env, git commit --amend --no-edit, git push, git stash pop',
  ],
  par: 6,
  takeaway: 'Before a push you can rewrite freely: stash your work, drop or amend the bad commits, and the secret never reaches the server.',
  theory: {
    title: 'Clean history before it leaves your Mac',
    body: 'Until you push, commits are private: git commit --amend, git reset and an interactive rebase can reshape them, and git stash (or git reset --keep) protects work in progress meanwhile. A secret deleted in a later commit is still in history, so it must leave the commit that added it; once pushed, cleaning needs a force push, and the key must be rotated anyway because anyone may have fetched it.',
    lesson: 'Rewrite before you push; after a leak, rotate the key.',
  },
  danger: 'git reset --hard throws away uncommitted work: stash it first (or use --keep). Rewrite only commits nobody else has pulled.',
  undo: false,
  root: [...productionRepo({ remote: true }), ...leakSecret('yanis'), ...strayDebugCommit('ines'), `edit ${ROUTES} ${JSON.stringify(WIP_ROUTES)}`],
  outcome: {
    summary:
      'origin/main has the analytics feature without .env or the wip commit anywhere in its history, and your half-done routes.ts is still on disk. Cleaning history before it leaves your Mac is far easier than after.',
    expect: {
      kind: 'terminal',
      command: 'git status -sb',
      output: '## main...origin/main\n M apps/web/src/routes.ts',
    },
  },
  prelude: [],
  reference: [
    'git stash push -m "wip: export route"',
    'git reset --hard HEAD~1',
    'git rm --cached .env',
    'git commit --amend --no-edit',
    'git push',
    'git stash pop',
  ],
  alternatives: [
    ['git reset --keep HEAD~1', 'git rm --cached .env', 'git commit --amend -m "feat(web): send usage analytics"', 'git push origin main'],
    [
      'git stash',
      'git reset --soft HEAD~2',
      `git restore --staged .env debug.log ${EDITOR}`,
      `git restore ${EDITOR}`,
      'git commit -m "feat(web): send usage analytics"',
      'git push',
      'git stash pop',
    ],
  ],
};

export const level4: Level = {
  id: 'undo',
  number: 4,
  title: 'Undo and recovery',
  topics: 'restore, amend, reset, revert, stash, reflog',
  planned: 11,
  warning: 'can lose work, practice repo only',
  root: ROOT_COMMANDS,
  remote: true,
  missions: [discardEdit, unstage, amend, uncommit, dropCommit, revertShared, stashSwitch, reflogRescue, deletedBranch, pushedSecret, secretBeforePush],
};

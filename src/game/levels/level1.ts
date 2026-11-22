/**
 * Level 1 — Foundations. Ported from the web game (missions 1.1–1.3); more missions are added here.
 * Story file contents differ in their first 18 characters: the diagrams label a file by that prefix.
 */
import {
  allOf,
  check,
  commitDelta,
  commitList,
  headBranch,
  headCommit,
  headFile,
  headSnapshot,
  indexFile,
  isWorkingTreeClean,
  workingFile,
} from '../validate';

import { NOVA_FILES, productionRepo } from '../production';

import type { Level, Mission, MissionContext } from '../model';
import type { RepoState } from '../../shared/repo-types';

// Story file contents ------------------------------------------------------

export const FILES = {
  a1: 'Sync: local only.',
  a2: 'Sync: local + offline cache.',
  b1: 'Ideas: dark mode, PDF export.',
  b2: 'Ideas: sharing, dark mode, PDF export.',
  bug: 'export function login(req) { return db.find(req.user); }',
  readme1: '# Nova notes app',
  readme2: '# Nova notes app. Start: npm run dev',
  notes: 'Meeting notes: LRU cache, CSV export, login hotfix.',
  app4: 'v4: retry offline sync',
  bugDebug: 'const DEBUG = true; export function login(req) { console.log(req); return db.find(req.user); }',
  env: 'API_KEY=nova-dev-4242',
  build: 'compiled bundle',
  todo: 'Todo: move every task to the issue tracker.',
  app5: 'v5: sync conflicts resolved by timestamp',
  sync3: 'Sync: offline edits queued and replayed.',
} as const;

/** Root of the Nova story: an empty folder becomes the team's first commit. */
export const ROOT_COMMANDS: readonly string[] = [
  'git init -b main',
  `edit a.txt "${FILES.a1}"`,
  `edit b.txt "${FILES.b1}"`,
  'edit app.ts "v1"',
  `edit bug.txt "${FILES.bug}"`,
  'git add .',
  'git commit -m "Initial commit"',
];

// Missions -----------------------------------------------------------------

const threeAreas: Mission = {
  id: 'three-areas',
  number: '1.1',
  title: 'The three areas',
  story:
    'Two files have changed in the Nova project: a.txt and b.txt. The lead only wants to ship the a.txt fix now and keep b.txt for the next release. The whole question is what the commit will actually photograph.',
  goal: 'Commit only a.txt and leave b.txt modified in the working directory.',
  outcome: {
    summary: 'The a.txt fix is saved in history on its own, while the b.txt change waits on disk for the next release. Choosing exactly what goes into a commit is how you ship one fix without dragging half-finished work along.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'a.txt', disk: 'Sync: local + offline cache.', index: 'Sync: local + offline cache.', head: 'Sync: local + offline cache.' },
          { path: 'b.txt', disk: 'Ideas: sharing, dark mode, PDF export.', index: 'Ideas: dark mode, PDF export.', head: 'Ideas: dark mode, PDF export.' },
        ],
        caption: 'a.txt went through the index into the commit; b.txt is still modified on disk only.',
      },
    },
  },
  checks: [
    {
      label: 'Stage a.txt with git add',
      proof: 'git show :a.txt',
      done: (state) => indexFile(state, 'a.txt') === FILES.a2,
    },
    {
      label: 'Commit the updated design note',
      proof: 'git show HEAD:a.txt',
      done: (state) => headFile(state, 'a.txt') === FILES.a2,
    },
    {
      label: 'Keep the b.txt change uncommitted',
      proof: 'git status --short',
      done: (state) =>
        headFile(state, 'a.txt') === FILES.a2 &&
        workingFile(state, 'b.txt') === FILES.b2 &&
        headFile(state, 'b.txt') === FILES.b1,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(commitDelta(state, ctx) >= 1, 'Make a new commit.'),
      check(headFile(state, 'a.txt') === FILES.a2, 'The commit must contain the updated a.txt.'),
      check(headFile(state, 'b.txt') === FILES.b1, 'The commit must keep the old version of b.txt.'),
      check(workingFile(state, 'a.txt') === FILES.a2, 'a.txt must stay up to date in the working directory.'),
      check(workingFile(state, 'b.txt') === FILES.b2, 'b.txt must stay modified in the working directory.'),
    ),
  hints: [
    'A commit photographs the index, not the whole working directory. You have to choose what to stage.',
    'Add only a.txt to the index, then commit: the b.txt change will stay uncommitted on disk.',
    'git add a.txt, then git commit -m "fix: a.txt".',
  ],
  par: 2,
  takeaway:
    'The commit only photographs the index: only staged changes enter the new snapshot, and the b.txt change stays uncommitted.',
  theory: {
    title: 'Disk, index, commit',
    body: 'Git keeps your work in three places: the files on disk, the index (also called the staging area) and the commits in history. git add copies a file from disk into the index. git commit saves exactly what is in the index, nothing more.',
    lesson: 'A commit photographs the index, not your disk.',
  },
  prelude: [
    { id: 'm1.1-p1', commands: [`edit a.txt "${FILES.a2}"`, `edit b.txt "${FILES.b2}"`] },
  ],
  reference: ['git add a.txt', 'git commit -m "fix: a.txt"'],
};

const snapshot: Mission = {
  id: 'snapshot',
  number: '1.2',
  title: 'The snapshot does not move',
  story:
    'The app.ts module of Nova is ready to move to v3, but the index was prepared with v2. The CTO wants to check an intuition: a commit is a frozen snapshot of the index, not a mirror of the file on your disk.',
  goal: 'Commit the index without restaging anything: the commit must keep v2, and v3 must stay on disk.',
  outcome: {
    summary: 'The new commit holds the v2 you staged, and v3 is still on your disk, not committed yet. Knowing that a commit records the index, not your files, stops surprises when you keep editing after staging.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'app.ts', disk: 'v3', index: 'v2', head: 'v2' },
        ],
        caption: 'The commit froze what was staged (v2); the newer v3 waits on disk.',
      },
    },
  },
  checks: [
    {
      label: 'Commit the index without running git add again',
      proof: 'git show HEAD:app.ts',
      done: (state, ctx) => headFile(state, 'app.ts') === 'v2' && commitDelta(state, ctx) === 1,
    },
    {
      label: 'Leave v3 on disk, outside the commit',
      proof: 'git diff app.ts',
      done: (state) => headFile(state, 'app.ts') === 'v2' && workingFile(state, 'app.ts') === 'v3',
    },
  ],
  // ponytail: the exact count stays here because one commit of the index is the lesson.
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      // The classic slip: git add before committing. Say so instead of counting commits.
      check(
        commitDelta(state, ctx) > 0 || indexFile(state, 'app.ts') === 'v2',
        'git add app.ts replaced the staged v2 with v3. Press Undo to put v2 back in the index.',
      ),
      check(commitDelta(state, ctx) === 1, 'Exactly one new commit is expected.'),
      check(headFile(state, 'app.ts') === 'v2', 'The commit must contain v2.'),
      check(workingFile(state, 'app.ts') === 'v3', 'The working directory must still contain v3, uncommitted.'),
    ),
  hints: [
    'The commit photographs the index, even if the file on disk is already newer.',
    'The index already contains v2: git add app.ts would overwrite it with v3.',
    'git commit -m "docs: v2".',
  ],
  par: 1,
  takeaway: 'The commit takes the snapshot of the index, not of the disk. v3 is still there, uncommitted.',
  theory: {
    title: 'A commit is a frozen snapshot',
    body: 'When you commit, Git stores a full snapshot of the index at that moment. Editing a file on disk does not change what you already staged. Only git add updates the index.',
    lesson: 'What you staged is what you commit.',
  },
  prelude: [
    { id: 'm1.2-p1', teammate: 'lea', commands: ['git add b.txt', 'git commit -m "chore: b.txt v2"'] },
    { id: 'm1.2-p2', commands: ['edit app.ts "v2"', 'git add app.ts', 'edit app.ts "v3"'] },
  ],
  reference: ['git commit -m "docs: v2"'],
};

const amTrap: Mission = {
  id: 'am-trap',
  number: '1.3',
  title: 'The -am trap',
  story:
    'A teammate claims that "git commit -am" takes care of everything, with no need to ever stage anything. Check what Git really photographs with that reflex.',
  goal: 'Commit the new version of the README and notes.txt, then leave a clean working directory.',
  outcome: {
    summary: 'Both the README update and the brand-new notes.txt are in history, and nothing is left uncommitted. This is how you avoid the classic "I committed, but my new file is missing".',
    expect: {
      kind: 'terminal',
      command: 'git log -2 --format=%s --name-status',
      output: 'docs: notes\n\nA\tnotes.txt\ndocs: readme\n\nM\tREADME.md',
    },
  },
  checks: [
    {
      label: 'README v2 present in a commit',
      proof: 'git log --oneline -- README.md',
      done: (state) => commitList(state).some((commit) => commit.snapshot['README.md'] === FILES.readme2),
    },
    {
      label: 'notes.txt present in a commit',
      proof: 'git log --oneline -- notes.txt',
      done: (state) => commitList(state).some((commit) => commit.snapshot['notes.txt'] === FILES.notes),
    },
    { label: 'Clean working directory', proof: 'git status', done: (state) => isWorkingTreeClean(state) },
  ],
  validate: (state) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(headFile(state, 'README.md') === FILES.readme2, 'README.md must end up in its new version.'),
      check(headFile(state, 'notes.txt') === FILES.notes, 'notes.txt must end up committed.'),
      check(isWorkingTreeClean(state), 'The working directory must be clean at the end.'),
    ),
  hints: [
    'First run the commit -am your teammate suggested, then inspect the result.',
    'notes.txt has never been tracked: -a cannot stage it. Add it explicitly, then commit.',
    'git commit -am "docs: readme", git add notes.txt, git commit -m "docs: notes".',
  ],
  par: 3,
  takeaway: 'git commit -am stages tracked files, not untracked ones: git add is still needed for a new file.',
  theory: {
    title: 'What -a really stages',
    body: 'git commit -a stages every change to files Git already tracks, then commits. A brand new file is untracked, so -a skips it. New files always go through git add first.',
    lesson: 'git commit -a never adds untracked files.',
  },
  prelude: [
    {
      id: 'm1.3-p1',
      teammate: 'lea',
      when: (state) => headFile(state, 'app.ts') === 'v3',
      commands: ['git add app.ts', 'git commit -m "chore: app.ts v3"'],
    },
    {
      id: 'm1.3-p2',
      teammate: 'samir',
      commands: [`edit README.md "${FILES.readme1}"`, 'git add README.md', 'git commit -m "docs: readme v1"'],
    },
    { id: 'm1.3-p3', commands: [`edit README.md "${FILES.readme2}"`, `edit notes.txt "${FILES.notes}"`] },
  ],
  reference: ['git commit -am "docs: readme"', 'git add notes.txt', 'git commit -m "docs: notes"'],
};

// Missions 1.4–1.9 ------------------------------------------------------

/** A git command the player ran successfully; `re` is tested against the arguments after `git`. */
function ran(ctx: MissionContext, re: RegExp): boolean {
  return ctx.commands.some((typed) => {
    const args = /^git\s+(?:--no-pager\s+)?(.*)$/.exec(typed.command.trim())?.[1];
    return args !== undefined && typed.exitCode === 0 && re.test(args);
  });
}

const readUnstaged = (ctx: MissionContext): boolean =>
  ran(ctx, /^diff\b(?!.*--(staged|cached)\b)(?!.*--(stat|name-only|name-status)\b)/);
const readStaged = (ctx: MissionContext): boolean =>
  ran(ctx, /^diff\b(?=.*--(staged|cached)\b)(?!.*--(stat|name-only|name-status)\b)/) || ran(ctx, /^diff HEAD\b/);

const readingDiffs: Mission = {
  id: 'reading-diffs',
  number: '1.4',
  title: 'Read before you commit',
  story:
    'Samir staged his sync retry in app.ts and went to lunch. bug.txt also changed, but nobody remembers why. Read both diffs before anything lands on main.',
  goal: 'Read the unstaged and the staged diff, commit only the staged fix, then drop the change in bug.txt.',
  outcome: {
    summary: 'Samir\'s staged sync fix is committed exactly as he staged it, and the unexplained change in bug.txt is gone, so nothing you did not read lands on main. Reading both diffs before you commit is the habit that catches stray debug code.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat --format=%s HEAD',
      output: 'fix(sync): retry offline sync\n\n app.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)',
    },
  },
  checks: [
    {
      label: 'Read the unstaged diff',
      proof: 'git diff',
      done: (_state, ctx) => readUnstaged(ctx),
    },
    {
      label: 'Read the staged diff',
      proof: 'git diff --staged',
      done: (_state, ctx) => readStaged(ctx),
    },
    {
      label: 'Commit only the staged app.ts fix',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'app.ts') === FILES.app4 && headFile(state, 'bug.txt') === FILES.bug,
    },
    {
      label: 'Drop the debug line in bug.txt',
      proof: 'git status --short',
      done: (state) => workingFile(state, 'bug.txt') === FILES.bug && indexFile(state, 'bug.txt') === FILES.bug,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(readUnstaged(ctx), 'Read the unstaged change first: git diff shows disk against the index.'),
      check(readStaged(ctx), 'Read what is staged: git diff --staged shows the index against HEAD.'),
      check(
        headFile(state, 'bug.txt') === FILES.bug,
        'The debug line in bug.txt was committed. Press Undo and commit only what is staged.',
      ),
      check(headFile(state, 'app.ts') === FILES.app4, 'Commit the staged app.ts fix.'),
      check(
        workingFile(state, 'bug.txt') === FILES.bug,
        'bug.txt still has the debug line on disk. Throw it away with git restore bug.txt.',
      ),
      check(isWorkingTreeClean(state), 'The working directory must be clean at the end.'),
    ),
  hints: [
    'git diff has two views: what you changed but did not stage, and what you staged.',
    'git diff compares disk with the index; git diff --staged compares the index with HEAD. Commit without -a, then restore bug.txt.',
    'git diff, git diff --staged, git commit -m "fix(sync): retry offline sync", git restore bug.txt.',
  ],
  par: 4,
  takeaway:
    'git diff shows what you have not staged, git diff --staged shows exactly what the next commit will contain.',
  theory: {
    title: 'Reading a diff',
    body: 'A diff shows removed lines with - and added lines with +, grouped in hunks that start with @@. git diff compares your disk with the index, git diff --staged (same as --cached) compares the index with the last commit, and --stat only lists the files and line counts. Reading the staged diff before every commit is the cheapest code review there is.',
    lesson: 'Read git diff --staged before you commit.',
  },
  prelude: [
    {
      id: 'm1.4-p1',
      commands: [`edit app.ts "${FILES.app4}"`, 'git add app.ts', `edit bug.txt "${FILES.bugDebug}"`],
    },
  ],
  reference: ['git diff', 'git diff --staged', 'git commit -m "fix(sync): retry offline sync"', 'git restore bug.txt'],
  alternatives: [
    ['git diff bug.txt', 'git diff --cached', 'git commit -m "fix: sync retry"', 'git checkout -- bug.txt'],
  ],
};

const ignoredPath = (ctx: MissionContext, path: string): boolean =>
  ctx.facts.ignored.some((entry) => entry === path || entry.startsWith(path));
const committedJunk = (state: RepoState): boolean =>
  Object.keys(headSnapshot(state)).some((path) => path === '.env' || path.startsWith('dist/'));

const gitignore: Mission = {
  id: 'gitignore',
  number: '1.5',
  title: 'Things Git should never see',
  story:
    'Running the build left dist/app.js in the project, and Yanis gave you a .env file with the dev API key. Both show up in git status, and one careless git add . would publish the key.',
  goal: 'Commit a .gitignore that ignores dist/ and .env, and leave a clean git status.',
  outcome: {
    summary: 'The build output and the file holding the dev API key no longer show up as untracked, and the rule is committed so every teammate gets it. A careless add of everything can no longer publish a secret or a generated bundle.',
    expect: {
      kind: 'file',
      path: '.gitignore',
      content: 'dist/\n.env',
    },
  },
  checks: [
    {
      label: '.env is ignored',
      proof: 'git check-ignore -v .env',
      done: (_state, ctx) => ignoredPath(ctx, '.env'),
    },
    {
      label: 'The dist/ build folder is ignored',
      proof: 'git status --ignored',
      done: (_state, ctx) => ignoredPath(ctx, 'dist/'),
    },
    {
      label: '.gitignore committed, nothing left untracked',
      proof: 'git log --oneline -- .gitignore',
      done: (state) => headFile(state, '.gitignore') !== undefined && isWorkingTreeClean(state),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(!committedJunk(state), '.env or dist/ ended up in a commit. Press Undo and ignore them before adding.'),
      check(ignoredPath(ctx, '.env'), 'Git still sees .env: add a line .env to .gitignore.'),
      check(ignoredPath(ctx, 'dist/'), 'Git still sees dist/: add a line dist/ to .gitignore.'),
      check(headFile(state, '.gitignore') !== undefined, 'Commit the .gitignore file so the whole team shares it.'),
      check(isWorkingTreeClean(state), 'git status must be clean at the end.'),
    ),
  hints: [
    'Git skips any path that matches a pattern in a file named .gitignore.',
    'One pattern per line: dist/ for the folder, .env for the file. Then commit .gitignore itself.',
    'echo "dist/" > .gitignore, echo ".env" >> .gitignore, git add .gitignore, git commit -m "chore: ignore build output and .env".',
  ],
  par: 4,
  takeaway: '.gitignore keeps build output and secrets out of git status and out of git add.',
  theory: {
    title: 'Ignored files',
    body: 'A .gitignore lists patterns, one per line: dist/ matches a folder, *.log every log file, !keep.log makes an exception. It only affects untracked files, so a file that is already committed stays tracked. Personal patterns that are not the team business go in .git/info/exclude.',
    lesson: 'Ignore build output and secrets before the first git add.',
  },
  prelude: [
    {
      id: 'm1.5-p1',
      commands: [`edit dist/app.js "${FILES.build}"`, `edit .env "${FILES.env}"`],
    },
  ],
  reference: [
    'edit .gitignore "dist/"',
    'append .gitignore ".env"',
    'git add .gitignore',
    'git commit -m "chore: ignore build output and .env"',
  ],
  alternatives: [
    ['edit .gitignore ".env"', 'append .gitignore "/dist"', 'git add .', 'git commit -m "chore: gitignore"'],
  ],
};

const untrackEnv: Mission = {
  id: 'rm-cached',
  number: '1.6',
  title: 'Stop tracking, keep the file',
  story:
    'Before your .gitignore landed, Yanis force-added .env and also committed a TODO.txt that the team has since moved to the issue tracker. The app still needs .env on your disk.',
  goal: 'Delete TODO.txt from the project, stop tracking .env without deleting it, and commit.',
  outcome: {
    summary: 'TODO.txt is gone from the project, and .env is no longer tracked but still on your disk, so the app keeps running. This is how you fix a file that should never have been committed without breaking anyone\'s local setup.',
    expect: {
      kind: 'terminal',
      command: 'git status --short --ignored',
      output: '!! .env\n!! dist/',
    },
  },
  checks: [
    {
      label: 'TODO.txt is gone from the project',
      proof: 'git ls-files TODO.txt',
      done: (state) => headFile(state, 'TODO.txt') === undefined && workingFile(state, 'TODO.txt') === undefined,
    },
    {
      label: '.env is no longer tracked',
      proof: 'git ls-files .env',
      done: (state) => headFile(state, '.env') === undefined && indexFile(state, '.env') === undefined,
    },
    {
      label: '.env is still on disk, ignored',
      proof: 'git status --ignored',
      done: (_state, ctx) => ctx.facts.ignored.includes('.env'),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        ctx.facts.ignored.includes('.env') || indexFile(state, '.env') !== undefined,
        '.env was deleted from your disk. Press Undo and use git rm --cached .env, which keeps the file.',
      ),
      check(headFile(state, '.env') === undefined, 'Commit the removal of .env from the repository.'),
      check(headFile(state, 'TODO.txt') === undefined, 'TODO.txt is still in the last commit: git rm it and commit.'),
      check(workingFile(state, 'TODO.txt') === undefined, 'TODO.txt is still on disk.'),
      check(isWorkingTreeClean(state), 'The working directory must be clean at the end.'),
    ),
  hints: [
    'git rm deletes a file and stages the deletion. One option keeps the file on disk.',
    'git rm TODO.txt removes it everywhere; git rm --cached .env only removes it from the index. Then commit.',
    'git rm TODO.txt, git rm --cached .env, git commit -m "chore: stop tracking .env, drop TODO".',
  ],
  par: 3,
  takeaway: 'git rm deletes a file from disk and index; git rm --cached only stops tracking it.',
  theory: {
    title: 'git rm and git rm --cached',
    body: 'git rm removes a file from the index and from disk, so the next commit deletes it. git rm --cached removes it from the index only: the file stays on your disk and becomes untracked, so pair it with a .gitignore line. A secret that was committed is still in the older commits, so rotate the key; rewriting history is covered later.',
    lesson: 'Untracking is not deleting: --cached keeps your copy.',
  },
  prelude: [
    {
      id: 'm1.6-p1',
      teammate: 'yanis',
      commands: [
        'git add -f .env',
        `edit TODO.txt "${FILES.todo}"`,
        'git add TODO.txt',
        'git commit -m "chore: add env and todo list"',
      ],
    },
  ],
  reference: ['git rm TODO.txt', 'git rm --cached .env', 'git commit -m "chore: stop tracking .env, drop TODO"'],
  alternatives: [['rm TODO.txt', 'git rm --cached .env', 'git commit -am "chore: untrack .env"']],
};

const renameFiles: Mission = {
  id: 'git-mv',
  number: '1.7',
  title: 'Names that say something',
  story:
    'Lea opens the repo and sighs: nobody knows what a.txt and b.txt are. Rename them sync.txt and ideas.txt, keeping their content.',
  goal: 'Rename a.txt to sync.txt and b.txt to ideas.txt, and commit the renames.',
  outcome: {
    summary: 'The two files have names that say what they hold, their content is unchanged, and git records the change as two renames. Clear names save every future reader a guess, and git can still follow each file\'s history across the rename.',
    expect: {
      kind: 'terminal',
      command: 'git show --name-status --format=%s HEAD',
      output: 'docs: rename notes files\n\nR100\tb.txt\tideas.txt\nR100\ta.txt\tsync.txt',
    },
  },
  checks: [
    {
      label: 'a.txt is now sync.txt',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'sync.txt') === FILES.a2 && headFile(state, 'a.txt') === undefined,
    },
    {
      label: 'b.txt is now ideas.txt',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'ideas.txt') === FILES.b2 && headFile(state, 'b.txt') === undefined,
    },
    {
      label: 'Clean working directory',
      proof: 'git status',
      done: (state) => isWorkingTreeClean(state) && headFile(state, 'a.txt') === undefined,
    },
  ],
  validate: (state) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        headFile(state, 'sync.txt') === FILES.a2,
        'The last commit must contain sync.txt with the old a.txt content.',
      ),
      check(
        headFile(state, 'ideas.txt') === FILES.b2,
        'The last commit must contain ideas.txt with the old b.txt content.',
      ),
      check(
        headFile(state, 'a.txt') === undefined && headFile(state, 'b.txt') === undefined,
        'a.txt and b.txt must be gone from the last commit.',
      ),
      check(isWorkingTreeClean(state), 'The working directory must be clean at the end.'),
    ),
  hints: [
    'Git has a command that renames a file and stages the rename in one step.',
    'git mv old new is mv plus git add of both sides. Commit once both files are renamed.',
    'git mv a.txt sync.txt, git mv b.txt ideas.txt, git commit -m "docs: rename notes files".',
  ],
  par: 3,
  takeaway: 'git mv renames on disk and stages the rename; Git records it as a delete plus an add.',
  theory: {
    title: 'Renames are detected, not stored',
    body: 'A commit is a snapshot, so Git does not store "renamed": it sees one path disappear and another appear with the same content, and reports a rename when they are similar enough. git mv is just mv followed by git add on both paths. git log --follow sync.txt keeps following the file across the rename.',
    lesson: 'A rename is a delete plus an add with the same content.',
  },
  prelude: [],
  reference: ['git mv a.txt sync.txt', 'git mv b.txt ideas.txt', 'git commit -m "docs: rename notes files"'],
  alternatives: [['mv a.txt sync.txt', 'mv b.txt ideas.txt', 'git add -A', 'git commit -m "docs: rename"']],
};

const sawLog = (ctx: MissionContext): boolean => ran(ctx, /^(log|lg)\b/);
const sawFileLog = (ctx: MissionContext): boolean => ran(ctx, /^(log|lg)\b.*(^|\s)(\.\/)?app\.ts(\s|$)/);
const sawShow = (ctx: MissionContext): boolean => ran(ctx, /^show\b/);

const inspectHistory: Mission = {
  id: 'inspect-history',
  number: '1.8',
  title: 'Who touched app.ts?',
  story:
    'Ines just pushed a sync fix, and a tester says sync behaves differently since this morning. Before asking anyone, look at the history yourself: recent commits, then only those that changed app.ts, then the newest one in detail.',
  goal: 'List recent commits on one line each, filter the log to app.ts, and open a commit with git show.',
  outcome: {
    summary: 'You know which commits changed app.ts, who made the newest one and what it touched, without asking anyone. That is the first move whenever something broke since this morning.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat HEAD',
      output: 'commit 356a3ccbd59040e87cda5bb03e7f33ff8df65e17\nAuthor: Ines Bouvet <ines@nova.dev>\nDate:   Mon Jan 5 09:52:00 2026 +0000\n\n    fix(sync): resolve conflicts by timestamp\n\n app.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)',
    },
  },
  checks: [
    {
      label: 'List the recent commits',
      proof: 'git log --oneline -n 5',
      done: (_state, ctx) => sawLog(ctx),
    },
    {
      label: 'List only the commits that changed app.ts',
      proof: 'git log --oneline -- app.ts',
      done: (_state, ctx) => sawFileLog(ctx),
    },
    {
      label: 'Open a commit with git show',
      proof: 'git show --stat HEAD',
      done: (_state, ctx) => sawShow(ctx),
    },
  ],
  validate: (_state, ctx) =>
    allOf(
      check(sawLog(ctx), 'Start with the recent history: git log --oneline -n 5.'),
      check(sawFileLog(ctx), 'Filter the log to one file: git log --oneline -- app.ts.'),
      check(sawShow(ctx), 'Open the newest app.ts commit with git show (add --stat for a summary).'),
    ),
  hints: [
    'git log can be shortened, limited, and filtered by path.',
    '--oneline gives one line per commit, -n 5 the last five, and -- app.ts only commits that changed that file. git show <commit> opens one.',
    'git log --oneline -n 5, git log --oneline -- app.ts, git show --stat HEAD.',
  ],
  par: 3,
  takeaway: 'git log -- <path> finds the commits that touched a file, and git show <commit> opens one of them.',
  theory: {
    title: 'Inspecting history',
    body: 'git log --oneline prints the short hash and subject of each commit, and -n 5 keeps the last five. Anything after -- is a path filter, so git log -- app.ts lists only the commits that changed app.ts. git show <commit> prints its message and diff, and --stat swaps the diff for a list of changed files.',
    lesson: 'Short hash from git log, details from git show.',
  },
  prelude: [
    {
      id: 'm1.8-p1',
      teammate: 'ines',
      commands: [
        `edit app.ts "${FILES.app5}"`,
        'git add app.ts',
        'git commit -m "fix(sync): resolve conflicts by timestamp"',
      ],
    },
  ],
  reference: ['git log --oneline -n 5', 'git log --oneline -- app.ts', 'git show --stat HEAD'],
  alternatives: [['git log -3', 'git log app.ts', 'git show HEAD~1']],
};

/** The player's new HEAD commit message, or undefined while HEAD is still an entry commit. */
function newMessage(state: RepoState, ctx: MissionContext): string[] | undefined {
  const hash = headCommit(state);
  if (hash === undefined || ctx.entryCommits.has(hash)) return undefined;
  return state.commits[hash]?.message.trimEnd().split('\n');
}
const goodSubject = (lines: string[] | undefined): boolean =>
  lines !== undefined && lines[0]!.trim() !== '' && lines[0]!.length <= 50;
const hasBody = (lines: string[] | undefined): boolean =>
  lines !== undefined && lines.length >= 3 && lines[1]!.trim() === '' && lines.slice(2).join('').trim() !== '';

const commitMessage: Mission = {
  id: 'commit-message',
  number: '1.9',
  title: 'A message for the next reader',
  story:
    'The team history is full of "fix" and "stuff", and Lea is tired of guessing. Your sync change is staged: commit it with a short subject, a blank line, and a body that says why.',
  goal: 'Commit the staged sync.txt with a subject of 50 characters or less, a blank line, then a body.',
  outcome: {
    summary: 'Your sync change is committed with a short subject that fits in one-line logs and a body that explains why it was needed. Months later, that body is the only place a teammate will find the reason.',
    expect: {
      kind: 'terminal',
      command: 'git log -1 --format=%B',
      output: 'Queue offline edits and replay them\n\nEdits made offline were lost on restart. Keep them in a queue and replay them once the app is back online.',
    },
  },
  checks: [
    {
      label: 'Commit the staged sync.txt change',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'sync.txt') === FILES.sync3,
    },
    {
      label: 'Subject line of 50 characters or less',
      proof: 'git log -1 --format=%s',
      done: (state, ctx) => goodSubject(newMessage(state, ctx)),
    },
    {
      label: 'Blank line, then a body that explains why',
      proof: 'git log -1 --format=%B',
      done: (state, ctx) => hasBody(newMessage(state, ctx)),
    },
  ],
  validate: (state, ctx) => {
    const lines = newMessage(state, ctx);
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(headFile(state, 'sync.txt') === FILES.sync3, 'Commit the staged sync.txt change.'),
      check(
        goodSubject(lines),
        `The subject is ${lines?.[0]?.length ?? 0} characters long. Keep it at 50 or less: git commit --amend can rewrite it.`,
      ),
      check(
        hasBody(lines),
        'Add a body after a blank line: git commit --amend -m "Subject" -m "Why the change was needed."',
      ),
    );
  },
  hints: [
    'A good message has a short summary line, then a blank line, then the why.',
    'Each -m is a paragraph: the first one becomes the subject, the second the body, with a blank line between.',
    'git commit -m "Queue offline edits and replay them" -m "Edits made offline were lost on restart. Keep them in a queue and replay them once the app is back online."',
  ],
  par: 1,
  takeaway: 'Subject of 50 characters or less, blank line, body that explains why: git commit -m "subject" -m "body".',
  theory: {
    title: 'Good commit messages',
    body: 'The first line is the subject: 50 characters or less, imperative ("Add", "Fix"), no final period, because git log --oneline and GitHub show only that. After a blank line, the body explains why the change was needed, which the diff cannot show. Each -m adds a paragraph, and git commit without -m opens your editor for longer messages.',
    lesson: 'The diff says what changed, the message says why.',
  },
  prelude: [
    {
      id: 'm1.9-p1',
      commands: [`edit sync.txt "${FILES.sync3}"`, 'git add sync.txt'],
    },
  ],
  reference: [
    'git commit -m "Queue offline edits and replay them" -m "Edits made offline were lost on restart. Keep them in a queue and replay them once the app is back online."',
  ],
  alternatives: [
    [
      'git commit -m "stuff"',
      'git commit --amend -m "Queue offline edits" -m "Offline edits were lost when the app restarted."',
    ],
  ],
};

// 1.11 Capstone: release prep on the production repo -----------------------

/** Setup `edit` for a multi-line file: escapes backslashes, double quotes and newlines. */
const write = (file: string, text: string): string =>
  `edit ${file} "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** Replaces exactly one occurrence of `find` in a production file; throws at import when it drifts. */
function patched(file: string, find: string, replace: string): string {
  const text = NOVA_FILES[file];
  if (text === undefined || !text.includes(find)) throw new Error(`level1: "${find}" not found in ${file}`);
  return text.replace(find, () => replace);
}

const EDITOR = 'apps/web/src/editor.tsx';
const RELEASE = {
  pkg: patched('package.json', '"version": "1.2.0"', '"version": "1.3.0"'),
  changelog: patched(
    'CHANGELOG.md',
    '## [Unreleased]\n\n### Fixed\n\n- Trailing whitespace is trimmed when a note is saved.',
    '## [Unreleased]\n\n## [1.3.0] - 2025-11-24\n\n### Changed\n\n- Sync compresses payloads larger than 4 KB.\n\n### Fixed\n\n- Trailing whitespace is trimmed when a note is saved.\n- The scroll position is restored after navigation.',
  ),
  editorDebug: patched(EDITOR, '  const save = (value: string) => {\n', "  const save = (value: string) => {\n    console.log('DEBUG save', noteId, value);\n"),
} as const;

/** New commits reachable from HEAD (amended-away commits in the reflog do not count). */
function newHistory(state: RepoState, ctx: MissionContext) {
  const found = [];
  const seen = new Set<string>();
  const queue = [headCommit(state)];
  while (queue.length > 0) {
    const hash = queue.pop();
    if (hash === undefined || seen.has(hash) || ctx.entryCommits.has(hash)) continue;
    seen.add(hash);
    const commit = state.commits[hash];
    if (commit === undefined) continue;
    found.push(commit);
    queue.push(...commit.parents);
  }
  return found;
}

/** The new commit that bumped package.json to 1.3.0. */
const releaseCommit = (state: RepoState, ctx: MissionContext) =>
  newHistory(state, ctx).find(
    (commit) =>
      commit.snapshot['package.json'] === RELEASE.pkg &&
      commit.parents.every((parent) => state.commits[parent]?.snapshot['package.json'] !== RELEASE.pkg),
  );
const releaseCommitted = (state: RepoState): boolean =>
  headFile(state, 'package.json') === RELEASE.pkg && headFile(state, 'CHANGELOG.md') === RELEASE.changelog;
const debugKeptOut = (state: RepoState, ctx: MissionContext): boolean =>
  newHistory(state, ctx).every(
    (commit) =>
      !(commit.snapshot[EDITOR] ?? '').includes('console.log') &&
      Object.keys(commit.snapshot).every((path) => path !== 'debug.log' && !path.startsWith('coverage/')),
  );
const LOG_RULES = new Set(['debug.log', '/debug.log', '*.log', '/*.log', '**/*.log', '**/debug.log']);
const ignoresLogs = (text: string | undefined): boolean =>
  (text ?? '').split('\n').some((line) => LOG_RULES.has(line.trim()));
const releaseMessage = (state: RepoState, ctx: MissionContext): string[] | undefined =>
  releaseCommit(state, ctx)?.message.trimEnd().split('\n');

// 1.10 Half a good file: stage one hunk ------------------------------------

const NOTES_BASE = [
  'export function loadNotes(db) {',
  "  return db.all('notes');",
  '}',
  '',
  'export function saveNote(db, note) {',
  "  return db.put('notes', note);",
  '}',
  '',
  'export function countNotes(db) {',
  "  return db.all('notes').length;",
  '}',
].join('\n');
const NOTES_FIX = NOTES_BASE.replace("  return db.all('notes');", "  return db.all('notes') ?? [];");
const NOTES_BOTH = NOTES_FIX.replace("  return db.all('notes').length;", "  console.log('DEBUG count', db);\n  return db.all('notes').length;");

const fixStaged = (state: RepoState) => indexFile(state, 'notes.ts') === NOTES_FIX;

const stageHunk: Mission = {
  id: 'stage-one-hunk',
  number: '1.10',
  title: 'Half a good file',
  story:
    'Nova Bot fixed the crash in notes.ts when the database is empty, and it also left a console.log in the same file while debugging. Samir wants the fix in the next commit and the debug line kept on your Mac only.',
  goal: 'Stage only the fix hunk of notes.ts (the ?? [] change) and leave the console.log hunk unstaged on disk.',
  outcome: {
    summary: 'The next commit will contain only the empty-database fix, while the debug console.log stays on your disk and out of history. Splitting a file this way lets you keep what an agent or a teammate got right and leave the noise behind.',
    expect: {
      kind: 'terminal',
      command: 'git diff --staged',
      output: 'diff --git a/notes.ts b/notes.ts\nindex 86b3eb3..f967591 100644\n--- a/notes.ts\n+++ b/notes.ts\n@@ -1,5 +1,5 @@\n export function loadNotes(db) {\n-  return db.all(\'notes\');\n+  return db.all(\'notes\') ?? [];\n }\n \n export function saveNote(db, note) {',
    },
  },
  checks: [
    {
      label: 'The ?? [] fix is staged',
      proof: 'git diff --staged notes.ts',
      done: (state) => (indexFile(state, 'notes.ts') ?? '').includes('?? []'),
    },
    {
      label: 'The console.log hunk is not staged and still on disk',
      proof: 'git diff notes.ts',
      done: (state) => fixStaged(state) && workingFile(state, 'notes.ts') === NOTES_BOTH,
    },
  ],
  validate: (state) =>
    allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(
        !(indexFile(state, 'notes.ts') ?? '').includes('console.log'),
        'The console.log line is staged. Unstage it with git restore --staged notes.ts, then stage again with git add -p and answer n to that hunk.',
      ),
      check(fixStaged(state), 'Stage the ?? [] fix: git add -p notes.ts, then y for that hunk.'),
      check(
        workingFile(state, 'notes.ts') === NOTES_BOTH,
        'notes.ts on disk must keep both changes: git add -p only chooses what is staged, it never edits the file.',
      ),
    ),
  hints: [
    'git add can stage part of a file, one hunk (block of changed lines) at a time.',
    'git add -p notes.ts shows each hunk and asks: y stages it, n skips it, s splits it into smaller hunks, q quits. Check the result with git diff --staged.',
    'git add -p notes.ts, answer y to the ?? [] hunk and n to the console.log hunk, then git diff --staged.',
  ],
  par: 3,
  takeaway: 'git add -p stages a file hunk by hunk, so a commit takes the fix and leaves the debug code behind.',
  theory: {
    title: 'Staging part of a file',
    body: 'git add -p (--patch) walks through the changes of a file one hunk at a time: y stages the hunk, n skips it, s splits it, e edits it by hand and q stops. git diff --staged then shows exactly what the next commit will contain, while git diff shows what stays behind. It is the fastest way to commit what an agent got right and keep what it left lying around out of history.',
    lesson: 'git add -p: commit the fix, not the debug line.',
  },
  prelude: [
    { id: 'm1.10-p1', teammate: 'samir', commands: [write('notes.ts', NOTES_BASE), 'git add notes.ts', 'git commit -m "feat: notes storage"'] },
    { id: 'm1.10-p2', teammate: 'bot', commands: [write('notes.ts', NOTES_BOTH)] },
  ],
  // ponytail: the harness cannot answer git add -p prompts; writing the staged version, adding it and
  // writing the full file back leaves the exact index and disk the interactive path leaves.
  reference: [write('notes.ts', NOTES_FIX), 'git add notes.ts', write('notes.ts', NOTES_BOTH)],
  alternatives: [
    [write('notes.ts', NOTES_FIX), 'git add notes.ts', 'git commit -m "fix: empty database returns no notes"', write('notes.ts', NOTES_BOTH)],
  ],
};

const releasePrep: Mission = {
  id: 'release-notes-prep',
  number: '1.11',
  title: 'Release notes prep',
  capstone: true,
  story:
    'Lea tags Nova 1.3.0 this afternoon and asked you to commit the release prep you started: the version bump in package.json and the new CHANGELOG section. Your working tree also holds a console.log you added while chasing a bug, a debug.log and a coverage/ report from your last test run. Only the release prep belongs in history, and nobody on the team should ever see debug.log in git status again.',
  goal: 'Commit the 1.3.0 release prep with a subject and a body, keep every debug change out of history, and make git ignore log files for the whole team.',
  outcome: {
    summary: 'The 1.3.0 release prep is one clean commit with a message Lea can read at tag time, your debug code never reached history, and log files are ignored for the whole team. That is what a reviewer expects to see in a release.',
    expect: {
      kind: 'terminal',
      command: 'git log -2 --stat --format=%s',
      output: 'chore: ignore log files\n\n .gitignore | 1 +\n 1 file changed, 1 insertion(+)\nchore(release): 1.3.0\n\n CHANGELOG.md | 7 +++++++\n package.json | 2 +-\n 2 files changed, 8 insertions(+), 1 deletion(-)',
    },
  },
  checks: [
    {
      label: 'The version bump and the CHANGELOG are committed',
      proof: 'git show --stat HEAD',
      done: (state) => releaseCommitted(state),
    },
    {
      label: 'No debug code or debug files in the new commits',
      proof: 'git log -p -n 3 -- apps/web debug.log',
      done: (state, ctx) => releaseCommitted(state) && debugKeptOut(state, ctx),
    },
    {
      label: 'A committed .gitignore rule covers debug.log',
      proof: 'git check-ignore -v debug.log',
      done: (state) => ignoresLogs(headFile(state, '.gitignore')),
    },
    {
      label: 'The release commit has a short subject, a blank line and a body',
      proof: 'git log --format=%B -n 2',
      done: (state, ctx) => goodSubject(releaseMessage(state, ctx)) && hasBody(releaseMessage(state, ctx)),
    },
  ],
  validate: (state, ctx) => {
    const lines = releaseMessage(state, ctx);
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must stay on main.'),
      check(releaseCommitted(state), 'Commit the release prep: package.json at 1.3.0 and the CHANGELOG with its 1.3.0 section.'),
      check(
        debugKeptOut(state, ctx),
        'A new commit contains debug code (the console.log in editor.tsx, debug.log or coverage/). Rewrite it so only the release prep is committed.',
      ),
      check(
        ignoresLogs(headFile(state, '.gitignore')),
        ignoresLogs(workingFile(state, '.gitignore'))
          ? 'Your .gitignore rule works on your machine only: commit .gitignore so the whole team gets it.'
          : 'debug.log still shows up as untracked. Add a rule like *.log to .gitignore and commit it.',
      ),
      check(
        goodSubject(lines),
        `The release commit subject is ${lines?.[0]?.length ?? 0} characters long: keep it at 50 or less.`,
      ),
      check(
        hasBody(lines),
        'The release commit needs a body after a blank line that says what the release contains: git commit -m "subject" -m "body".',
      ),
    );
  },
  hints: [
    'Look at git status and git diff before staging anything: not every change is release prep.',
    'Stage only package.json and CHANGELOG.md, then commit with two -m paragraphs. coverage/ is already ignored; debug.log is not, so add a rule to .gitignore and commit that too.',
    'git add package.json CHANGELOG.md, git commit -m "chore(release): 1.3.0" -m "Bump the version and move the Unreleased notes under 1.3.0.", append "*.log" to .gitignore, git add .gitignore, git commit -m "chore: ignore log files".',
  ],
  par: 5,
  takeaway: 'Review the working tree, stage only what the commit is about, and turn recurring junk into a committed .gitignore rule.',
  theory: {
    title: 'Clean commits in a busy working tree',
    body: 'A real working tree always mixes the change you mean to ship with experiments, logs and build output, so git status and git diff come before git add, and git add takes paths, not a dot. A release commit is read by everyone who later runs git log on a tag: a short subject and a body saying what changed and why. Junk that will come back every day belongs in .gitignore, committed, so the whole team stops seeing it.',
    lesson: 'Look, stage on purpose, commit with a message, ignore the rest.',
  },
  root: [
    ...productionRepo({ remote: false }),
    write('package.json', RELEASE.pkg),
    write('CHANGELOG.md', RELEASE.changelog),
    write(EDITOR, RELEASE.editorDebug),
    'edit debug.log "save n1 \\"Groceries\\"\\nflush 1 job -> 200"',
    'edit coverage/lcov.info "TN:\\nSF:packages/sync/src/queue.ts\\nend_of_record"',
  ],
  prelude: [],
  reference: [
    'git add package.json CHANGELOG.md',
    'git commit -m "chore(release): 1.3.0" -m "Bump the version and move the Unreleased notes under 1.3.0 so Lea can tag the release."',
    'append .gitignore "*.log"',
    'git add .gitignore',
    'git commit -m "chore: ignore log files"',
  ],
  alternatives: [
    [
      'append .gitignore "debug.log"',
      'git restore apps/web/src/editor.tsx',
      'git add -A',
      'git commit -m "chore(release): 1.3.0" -m "Version bump and CHANGELOG for 1.3.0. Also ignore debug.log."',
    ],
    [
      'git add -A',
      'git commit -m "release"',
      'git reset --soft HEAD~1',
      'git restore --staged apps/web/src/editor.tsx debug.log',
      'append .gitignore "*.log"',
      'git add .gitignore',
      'git commit -m "chore(release): 1.3.0" -m "Bump the version, add the 1.3.0 CHANGELOG section and ignore log files."',
    ],
  ],
};

export const level1: Level = {
  id: 'foundations',
  number: 1,
  title: 'Foundations',
  topics: 'Three areas, commits, diffs, .gitignore, rm and mv, log and show, commit messages',
  planned: 11,
  root: ROOT_COMMANDS,
  missions: [
    threeAreas,
    snapshot,
    amTrap,
    readingDiffs,
    gitignore,
    untrackEnv,
    renameFiles,
    inspectHistory,
    commitMessage,
    stageHunk,
    releasePrep,
  ],
};

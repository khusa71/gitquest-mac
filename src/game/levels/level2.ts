/**
 * Level 2 — Branches and conflicts. Its own story arc: a fresh Nova repo tagged v1.0.
 * Branch → who moves → detached HEAD → fast-forward vs three-way → --no-ff → cleanup → conflict → abort.
 */
import { activeWorktree, allOf, check, headBranch, isWorkingTreeClean, snapshotOf, workingFile } from '../validate';

import { NOVA_FILES, conflictBranch, conflictingChange, productionRepo } from '../production';

import type { Commit, RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';

// Story file contents ------------------------------------------------------

export const L2 = {
  readme: '# Nova notes',
  app: "export const app = 'nova';",
  appDark: "export const app = 'nova'; export const darkMode = true;",
  login: 'export function login(user) { return user; }',
  loginFixed: 'export function login(user) { return user ?? guest(); }',
  help: 'Help: press Ctrl+N for a new notte.',
  helpFixed: 'Help: press Ctrl+N for a new note.',
  plans: 'Plans: Free and Pro.',
  plansLea: 'Plans: Free and Pro, with a yearly discount.',
  plansYanis: 'Plans: Free, Pro at 4 EUR, Team at 9 EUR.',
  theme: 'body { color: #222; background: #fff; }',
  themeDark: 'body { color: #eee; background: #111; }',
  themeLea: 'body { color: #fff; background: #000; }',
  themeSamir: 'body { color: #e6edf3; background: #0d1117; }',
  readmeLea: '# Nova: fast offline notes.',
  readmeSamir: '# Nova: notes for small teams.',
  search: 'export function search(query) { return []; }',
  repro: 'Repro on v1.0: create an empty note, the app crashes.',
  csv: "export function toCsv(notes) { return notes.join(','); }",
} as const;

const ROOT: readonly string[] = [
  'git init -b main',
  `edit README.md "${L2.readme}"`,
  `edit app.ts "${L2.app}"`,
  `edit login.ts "${L2.login}"`,
  `edit help.md "${L2.help}"`,
  `edit plans.md "${L2.plans}"`,
  `edit theme.css "${L2.theme}"`,
  'git add .',
  'git commit -m "Initial commit"',
  'git tag v1.0',
];

// Level helpers ------------------------------------------------------------

function tip(state: RepoState, branch: string): Commit | undefined {
  const hash = state.branches[branch];
  return hash === undefined ? undefined : state.commits[hash];
}

function tipFile(state: RepoState, branch: string, path: string): string | undefined {
  return snapshotOf(state, state.branches[branch])[path];
}

/** True when `ancestor` is reachable from `from` (a commit is its own ancestor). */
function isAncestor(state: RepoState, ancestor: string | undefined, from: string | undefined): boolean {
  if (ancestor === undefined || from === undefined) return false;
  const seen = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    queue.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
}

function onFirstParentLine(state: RepoState, hash: string | undefined, branch: string): boolean {
  for (let at = state.branches[branch]; at !== undefined; at = state.commits[at]?.parents[0]) {
    if (at === hash) return true;
  }
  return false;
}

function merged(state: RepoState, branch: string, into = 'main'): boolean {
  return isAncestor(state, state.branches[branch], state.branches[into]);
}

function mergeInProgress(state: RepoState): boolean {
  return activeWorktree(state)?.merge !== undefined;
}

/** A new commit on main with two parents whose second parent is `branch`'s tip. */
function mergeCommitOf(state: RepoState, ctx: MissionContext, branch: string): Commit | undefined {
  const theirs = state.branches[branch];
  return Object.values(state.commits).find(
    (commit) =>
      !ctx.entryCommits.has(commit.hash) &&
      commit.parents.length === 2 &&
      commit.parents[1] === theirs &&
      isAncestor(state, commit.hash, state.branches.main),
  );
}

const MARKER = /^(<{7}|={7}|>{7})/m;
function resolved(content: string | undefined): boolean {
  return content !== undefined && content.trim() !== '' && !MARKER.test(content);
}

/** The file Git writes when both sides changed the same line (setup syntax: `\n` is a newline). */
function conflictText(ours: string, theirs: string, branch: string): string {
  return `<<<<<<< HEAD\\n${ours}\\n=======\\n${theirs}\\n>>>>>>> ${branch}`;
}

/**
 * Leaves the repo exactly like a `git merge <branch>` that stopped on conflicts: MERGE_HEAD, MERGE_MSG,
 * base/ours/theirs index stages, markers on disk. `branch` must hold one commit since it forked.
 * ponytail: setup throws on a non-zero exit and a conflicting merge exits 1, so the stopped merge is rebuilt
 * from exit-0 commands; swap for `git merge <branch>` if setup steps ever accept an expected failure.
 */
function stoppedMerge(branch: string, files: Readonly<Record<string, string>>): string[] {
  return [
    `git merge --no-ff --no-commit -s ours ${branch}`,
    `git read-tree -m -u ${branch}~1 HEAD ${branch}`,
    ...Object.entries(files).map(([file, content]) => `edit ${file} "${content}"`),
  ];
}

// Missions -----------------------------------------------------------------

const branchLabel: Mission = {
  id: 'branch-is-a-label',
  number: '2.1',
  title: 'A branch is a label',
  story:
    'Ines drafted search.ts for a search feature, but nobody wants an experiment on main yet. Give the idea its own branch and commit it there.',
  goal: 'Create a branch named search, switch to it, and commit search.ts there while main stays where it is.',
  outcome: {
    summary: 'Ines\'s search draft lives on its own branch while main stays exactly where it was. Branches let you try an idea without putting anything unfinished on the line everyone ships from.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main', 'tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['HEAD → search'] },
        ],
        head: 'B',
        caption: 'main still points at the first commit; only search moved.',
      },
    },
  },
  checks: [
    {
      label: 'Create the search branch and switch to it',
      proof: 'git branch',
      done: (state) => headBranch(state) === 'search',
    },
    {
      label: 'Commit search.ts on search',
      proof: 'git show search:search.ts',
      done: (state) => tipFile(state, 'search', 'search.ts') === L2.search,
    },
    {
      label: 'main has not moved',
      proof: 'git log --oneline --all --graph',
      done: (state, ctx) =>
        tipFile(state, 'search', 'search.ts') === L2.search &&
        ctx.entryCommits.has(state.branches.main ?? '') &&
        tipFile(state, 'main', 'search.ts') === undefined,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(state.branches.search !== undefined, 'Create a branch named search.'),
      check(headBranch(state) === 'search', 'Switch to the search branch: HEAD must be attached to it.'),
      check(tipFile(state, 'search', 'search.ts') === L2.search, 'Commit search.ts on the search branch.'),
      check(ctx.entryCommits.has(state.branches.main ?? ''), 'main must not move: commit on search, not on main.'),
      check(tipFile(state, 'main', 'search.ts') === undefined, 'search.ts must not be on main.'),
    ),
  hints: [
    'A new branch is just a new label on the current commit. You also have to move HEAD onto it before committing.',
    'git switch -c creates the branch and switches to it in one step. search.ts is untracked, so add it first.',
    'git switch -c search, git add search.ts, git commit -m "feat: search draft".',
  ],
  par: 3,
  takeaway: 'A branch is a movable label on a commit: creating one copies nothing, and only the branch HEAD is on moves when you commit.',
  theory: {
    title: 'Branches are labels',
    body: 'A branch is a tiny file holding one commit hash, nothing more. git branch search creates the label, git switch search attaches HEAD to it, and git switch -c search does both. The next commit moves the label HEAD is attached to.',
    lesson: 'git switch -c <name> creates a branch and moves HEAD onto it.',
  },
  prelude: [{ id: 'm2.1-p1', commands: [`edit search.ts "${L2.search}"`] }],
  reference: ['git switch -c search', 'git add search.ts', 'git commit -m "feat: search draft"'],
  alternatives: [
    ['git branch search', 'git switch search', 'git add search.ts', 'git commit -m "feat: search draft"'],
    ['git checkout -b search', 'git add search.ts', 'git commit -m "feat: search draft"'],
  ],
};

const whichLabelMoves: Mission = {
  id: 'which-label-moves',
  number: '2.2',
  title: 'Which label moves?',
  story:
    'Lea found the login crash and you already fixed login.ts, but you are still on search. The fix belongs on main; then you go straight back to your search work.',
  goal: 'Commit the login.ts fix on main, then return to search with git switch -.',
  outcome: {
    summary: 'The login fix is on main, your search work is untouched, and you are back on search where you left off. Days are full of these interruptions, and knowing which label moves keeps a fix from landing on the wrong branch.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['HEAD → search'] },
          { id: 'C', message: 'fix: login crash', parents: ['A'], lane: 'main', refs: ['main'] },
        ],
        head: 'B',
        caption: 'The fix moved main only, and HEAD is back on search.',
      },
    },
  },
  checks: [
    {
      label: 'Commit the login fix on main',
      proof: 'git show main:login.ts',
      done: (state) => tipFile(state, 'main', 'login.ts') === L2.loginFixed,
    },
    {
      label: 'search did not move',
      proof: 'git log --oneline --all --graph',
      done: (state, ctx) =>
        tipFile(state, 'main', 'login.ts') === L2.loginFixed && ctx.entryCommits.has(state.branches.search ?? ''),
    },
    {
      label: 'Back on search',
      proof: 'git branch',
      done: (state) => tipFile(state, 'main', 'login.ts') === L2.loginFixed && headBranch(state) === 'search',
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(tipFile(state, 'main', 'login.ts') === L2.loginFixed, 'main must contain the login.ts fix.'),
      check(ctx.entryCommits.has(state.branches.search ?? ''), 'search must not move: the fix goes on main only.'),
      check(headBranch(state) === 'search', 'Switch back to search when the fix is committed.'),
      check(isWorkingTreeClean(state), 'Nothing should stay uncommitted.'),
    ),
  hints: [
    'A commit moves only the branch HEAD is attached to. Go to main before committing.',
    'Your edit to login.ts follows you when you switch, because login.ts is the same on both branches. git switch - jumps back to the previous branch.',
    'git switch main, git commit -am "fix: login crash", git switch -.',
  ],
  par: 3,
  takeaway: 'Only the branch HEAD is attached to moves on commit; git switch - toggles between the last two branches.',
  theory: {
    title: 'Who moves on commit',
    body: 'When you commit, Git writes the new commit and moves the branch HEAD points to. Every other branch stays exactly where it was. Uncommitted changes travel with you when you switch, as long as they do not clash with the other branch.',
    lesson: 'git switch - goes back to the branch you were on before.',
  },
  prelude: [{ id: 'm2.2-p1', commands: [`edit login.ts "${L2.loginFixed}"`] }],
  reference: ['git switch main', 'git commit -am "fix: login crash"', 'git switch -'],
  alternatives: [
    ['git checkout main', 'git add login.ts', 'git commit -m "fix: login crash"', 'git checkout search'],
  ],
};

function reproCommit(state: RepoState, ctx: MissionContext, branch?: string): boolean {
  const v1 = (ctx.facts.tags.find((tag) => tag.name === 'v1.0') ?? { target: undefined }).target;
  const hash = branch === undefined ? undefined : state.branches[branch];
  return Object.values(state.commits).some(
    (commit) =>
      !ctx.entryCommits.has(commit.hash) &&
      commit.parents[0] === v1 &&
      commit.snapshot['repro.md'] === L2.repro &&
      (branch === undefined || commit.hash === hash),
  );
}

const detachedHead: Mission = {
  id: 'detached-head-rescue',
  number: '2.3',
  title: 'Detached HEAD',
  story:
    'Support asks whether the empty-note crash already existed in release v1.0. You wrote repro.md; commit it on top of v1.0 itself, then give that commit a branch so it is not lost.',
  goal: 'Check out v1.0 (detached HEAD), commit repro.md there, and save the commit on a new branch named v1-repro.',
  outcome: {
    summary: 'Your repro commit sits directly on top of release v1.0 and has a branch name, so it cannot get lost. This is how you test or patch an old release, and how you rescue work made on a detached HEAD.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
          { id: 'C', message: 'fix: login crash', parents: ['A'], lane: 'main', refs: ['main'] },
          { id: 'R', message: 'test: repro on v1.0', parents: ['A'], lane: 'v1-repro', refs: ['HEAD → v1-repro'] },
        ],
        head: 'R',
        caption: 'The repro commit grows from v1.0 and is held by its own branch.',
      },
    },
  },
  checks: [
    {
      label: 'Commit repro.md on top of v1.0',
      proof: 'git log --oneline --graph --all',
      done: (state, ctx) => reproCommit(state, ctx),
    },
    {
      label: 'Save it on a branch named v1-repro',
      proof: 'git log --oneline -1 v1-repro',
      done: (state, ctx) => reproCommit(state, ctx, 'v1-repro'),
    },
    {
      label: 'HEAD attached to v1-repro',
      proof: 'git status',
      done: (state) => headBranch(state) === 'v1-repro',
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(reproCommit(state, ctx), 'Make a commit with repro.md whose parent is the v1.0 commit.'),
      check(reproCommit(state, ctx, 'v1-repro'), 'Create the branch v1-repro on that commit.'),
      check(headBranch(state) === 'v1-repro', 'HEAD must be attached to v1-repro, not detached.'),
      check(
        ctx.entryCommits.has(state.branches.main ?? '') && ctx.entryCommits.has(state.branches.search ?? ''),
        'main and search must not move.',
      ),
    ),
  hints: [
    'Checking out a tag or a commit detaches HEAD: you can commit there, but no branch follows those commits.',
    'repro.md is untracked, so it follows you to v1.0. After the commit, git switch -c turns where you stand into a branch.',
    'git switch --detach v1.0, git add repro.md, git commit -m "test: repro on v1.0", git switch -c v1-repro.',
  ],
  par: 4,
  takeaway: 'A commit made on a detached HEAD belongs to no branch until you name it; git switch -c saves it in place.',
  theory: {
    title: 'Detached HEAD',
    body: 'Normally HEAD points at a branch, and the branch points at a commit. Check out a tag or a hash and HEAD points straight at the commit: that is a detached HEAD. Commits made there are reachable only through HEAD, so leaving without a branch strands them.',
    lesson: 'In detached HEAD, run git switch -c <name> before you leave.',
  },
  prelude: [{ id: 'm2.3-p1', commands: [`edit repro.md "${L2.repro}"`] }],
  reference: ['git switch --detach v1.0', 'git add repro.md', 'git commit -m "test: repro on v1.0"', 'git switch -c v1-repro'],
  alternatives: [
    ['git checkout v1.0', 'git add repro.md', 'git commit -m "test: repro on v1.0"', 'git branch v1-repro', 'git switch v1-repro'],
  ],
};

const fastForwardOrNot: Mission = {
  id: 'fast-forward-or-not',
  number: '2.4',
  title: 'Fast-forward or three-way',
  story:
    'Samir finished the CSV export on export, branched from today\'s main. Ines\'s search branch is older: it forked before the login fix. Bring both into main.',
  goal: 'Merge export into main as a fast-forward, then merge search with a merge commit.',
  outcome: {
    summary: 'main now contains both the CSV export and the search feature: one arrived by sliding main forward, the other through a merge commit with two parents. Knowing which merge you will get lets you predict what git does and read the history it leaves.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
          { id: 'C', message: 'fix: login crash', parents: ['A'], lane: 'main' },
          { id: 'E', message: 'feat: CSV export', parents: ['C'], lane: 'main', refs: ['export'] },
          { id: 'M', message: 'Merge branch \'search\'', parents: ['E', 'B'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M',
        caption: 'export: main slid forward onto it. search: a merge commit joins the two lines.',
      },
    },
  },
  checks: [
    {
      label: 'Fast-forward main to export',
      proof: 'git log --first-parent --oneline main',
      done: (state) => onFirstParentLine(state, state.branches.export, 'main'),
    },
    {
      label: 'Merge search with a merge commit',
      proof: 'git merge-base main search',
      done: (state, ctx) => mergeCommitOf(state, ctx, 'search') !== undefined,
    },
    {
      label: 'main has export.ts and search.ts',
      proof: 'git ls-tree --name-only main',
      done: (state) => tipFile(state, 'main', 'export.ts') === L2.csv && tipFile(state, 'main', 'search.ts') === L2.search,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'Merge from main: HEAD must be on main.'),
      check(merged(state, 'export'), 'Merge export into main.'),
      check(
        onFirstParentLine(state, state.branches.export, 'main'),
        'export should have been a fast-forward. Merge it first, while main has not moved: press Undo and try again.',
      ),
      check(merged(state, 'search'), 'Merge search into main.'),
      check(mergeCommitOf(state, ctx, 'search') !== undefined, 'search has diverged from main: its merge needs a merge commit.'),
      check(ctx.entryCommits.has(state.branches.search ?? ''), 'search must not move: merge it into main, not the other way.'),
      check(isWorkingTreeClean(state), 'Finish with a clean working directory.'),
    ),
  hints: [
    'Ask where each branch forked: git merge-base main export, then git merge-base main search.',
    'export forked from main\'s tip, so main can just slide forward. search forked earlier, so Git needs a commit with two parents. --no-edit skips the message editor.',
    'git merge export, git merge --no-edit search.',
  ],
  par: 2,
  takeaway: 'If main is the merge base, merging just moves the label (fast-forward); if both sides moved, Git records a merge commit.',
  theory: {
    title: 'Fast-forward or merge commit',
    body: 'git merge-base main topic prints the commit where the two lines split. If that commit is main itself, nothing happened on main since, so Git slides main forward: a fast-forward. Otherwise Git combines both tips against the merge base and writes a merge commit with two parents.',
    lesson: 'git merge-base A B shows the fork point that decides the kind of merge.',
  },
  prelude: [
    { id: 'm2.4-p1', commands: ['git switch main'] },
    {
      id: 'm2.4-p2',
      teammate: 'samir',
      commands: [
        'git switch -c export',
        `edit export.ts "${L2.csv}"`,
        'git add export.ts',
        'git commit -m "feat: CSV export"',
        'git switch main',
      ],
    },
  ],
  reference: ['git merge export', 'git merge --no-edit search'],
  alternatives: [['git merge --ff-only export', 'git merge -m "Merge branch \'search\'" search']],
};

const noFfMerge: Mission = {
  id: 'no-ff-merge-commit',
  number: '2.5',
  title: 'Keep the feature visible',
  story:
    'Ines\'s dark-mode branch is two commits ahead of main, so Git could fast-forward it. The team rule is that every feature lands as one merge commit, so main\'s first-parent history reads like a list of features.',
  goal: 'Merge dark-mode into main with a real merge commit, even though a fast-forward is possible.',
  outcome: {
    summary: 'dark-mode lands on main as a single merge commit, so main\'s first-parent history reads as a list of features. Teams rely on this to review, find or revert a whole feature as one unit.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'M1', message: 'Merge branch \'search\'', parents: [], lane: 'main' },
          { id: 'D1', message: 'feat: dark colours', parents: ['M1'], lane: 'dark-mode' },
          { id: 'D2', message: 'feat: dark mode toggle', parents: ['D1'], lane: 'dark-mode', refs: ['dark-mode'] },
          { id: 'M2', message: 'Merge branch \'dark-mode\'', parents: ['M1', 'D2'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M2',
        caption: 'main could have slid forward, but it records a merge commit instead.',
      },
    },
  },
  checks: [
    {
      label: 'main ends on a new merge commit',
      proof: 'git log --oneline --graph -5',
      done: (state, ctx) => {
        const main = tip(state, 'main');
        return main !== undefined && !ctx.entryCommits.has(main.hash) && main.parents.length === 2;
      },
    },
    {
      label: 'Its second parent is dark-mode',
      proof: 'git show --no-patch --format=%P main',
      done: (state) => tip(state, 'main')?.parents[1] === state.branches['dark-mode'],
    },
    {
      label: 'dark-mode stays off main\'s first-parent line',
      proof: 'git log --first-parent --oneline main',
      done: (state) => merged(state, 'dark-mode') && !onFirstParentLine(state, state.branches['dark-mode'], 'main'),
    },
  ],
  validate: (state, ctx) => {
    const main = tip(state, 'main');
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must be on main.'),
      check(merged(state, 'dark-mode'), 'Merge dark-mode into main.'),
      check(
        !onFirstParentLine(state, state.branches['dark-mode'], 'main'),
        'main was fast-forwarded onto dark-mode, so there is no merge commit. Press Undo and merge with --no-ff.',
      ),
      check(
        main?.parents.length === 2 && ctx.entryCommits.has(main.parents[0] ?? '') && main.parents[1] === state.branches['dark-mode'],
        'main must end on the merge commit of dark-mode.',
      ),
      check(isWorkingTreeClean(state), 'Finish with a clean working directory.'),
    );
  },
  hints: [
    'By default Git fast-forwards when it can. There is an option to always record a merge commit.',
    'git merge --no-ff creates the merge commit anyway; add --no-edit to keep the default message without opening the editor.',
    'git merge --no-ff --no-edit dark-mode.',
  ],
  par: 1,
  takeaway: '--no-ff always records a merge commit, so a feature stays one visible unit in main\'s history.',
  theory: {
    title: 'Why force a merge commit',
    body: 'A fast-forward leaves no trace that a branch ever existed: its commits just become main\'s commits. git merge --no-ff writes a merge commit whose first parent is the old main and second parent is the feature. git log --first-parent then shows one line per feature.',
    lesson: 'git merge --no-ff <branch> records the merge even when a fast-forward is possible.',
  },
  prelude: [
    {
      id: 'm2.5-p1',
      teammate: 'ines',
      commands: [
        'git switch -c dark-mode',
        `edit theme.css "${L2.themeDark}"`,
        'git commit -am "feat: dark colours"',
        `edit app.ts "${L2.appDark}"`,
        'git commit -am "feat: dark mode toggle"',
        'git switch main',
      ],
    },
  ],
  reference: ['git merge --no-ff --no-edit dark-mode'],
  alternatives: [['git merge --no-ff -m "Merge dark mode" dark-mode']],
};

const STALE = ['search', 'export', 'dark-mode', 'v1-repro'] as const;

const branchCleanup: Mission = {
  id: 'branch-cleanup',
  number: '2.6',
  title: 'Branch cleanup',
  story:
    'Yanis wants a tidy branch list before the release. search, export and dark-mode are merged; v1-repro only held your repro, and support has confirmed the bug, so that commit can go.',
  goal: 'Delete the merged branches with -d, then delete v1-repro deliberately with -D. Only main remains.',
  outcome: {
    summary: 'Only main remains: the merged branches are cleaned up and the throwaway repro branch is deleted on purpose. A short branch list makes it obvious what is still in progress.',
    expect: {
      kind: 'terminal',
      command: 'git branch',
      output: '* main',
    },
  },
  checks: [
    {
      label: 'Delete the merged branches',
      proof: 'git branch --merged main',
      done: (state) => ['search', 'export', 'dark-mode'].every((name) => state.branches[name] === undefined),
    },
    {
      label: 'Force-delete v1-repro',
      proof: 'git branch --no-merged main',
      done: (state) => state.branches['v1-repro'] === undefined,
    },
    {
      label: 'main is untouched',
      proof: 'git log --oneline -1 main',
      done: (state, ctx) =>
        Object.keys(state.branches).join() === 'main' && ctx.entryCommits.has(state.branches.main ?? ''),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.entryCommits.has(state.branches.main ?? ''), 'main must not change: v1-repro is thrown away, not merged.'),
      ...STALE.map((name) => check(state.branches[name] === undefined, `Delete the branch ${name}.`)),
      check(Object.keys(state.branches).join() === 'main', 'Only main should remain.'),
      check(headBranch(state) === 'main', 'HEAD must be on main.'),
    ),
  hints: [
    'git branch --merged lists the branches whose commits are all in main. Those are safe to delete.',
    'git branch -d refuses a branch that is not merged, like v1-repro. -D deletes it anyway: use it when you mean it.',
    'git branch -d search export dark-mode, git branch -D v1-repro.',
  ],
  par: 2,
  takeaway: 'git branch -d only deletes merged branches; -D forces it and the commits become unreachable.',
  theory: {
    title: 'Deleting branches safely',
    body: 'Deleting a branch removes the label, not the commits. git branch -d checks that the commits are already in your current branch and refuses otherwise. git branch -D skips that check, so an unmerged commit is only findable in the reflog afterwards.',
    lesson: 'git branch --merged shows what -d can safely delete.',
  },
  prelude: [],
  reference: ['git branch -d search export dark-mode', 'git branch -D v1-repro'],
  alternatives: [
    ['git branch -d search', 'git branch -d export', 'git branch -d dark-mode', 'git branch -D v1-repro'],
  ],
};

const conflictByHand: Mission = {
  id: 'conflict-by-hand',
  number: '2.7',
  title: 'The torn README',
  story:
    'Samir\'s redesign branch rewrote the README tagline and regenerated theme.css with his design tool, while Lea changed both files on main. Your git merge redesign stopped on both.',
  goal: 'Write the README.md you want to ship, take Samir\'s theme.css whole, and finish the merge.',
  outcome: {
    summary: 'The redesign merge is finished, with a README you wrote yourself and Samir\'s generated theme.css taken whole. Resolving a conflict is a normal part of team work, not an emergency.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'X', message: 'Merge branch \'dark-mode\'', parents: [], lane: 'main' },
          { id: 'L', message: 'docs: tagline, contrast fix', parents: ['X'], lane: 'main' },
          { id: 'S', message: 'design: new tagline, regenerated theme', parents: ['X'], lane: 'redesign', refs: ['redesign'] },
          { id: 'M', message: 'Merge branch \'redesign\'', parents: ['L', 'S'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M',
        caption: 'The conflict is resolved and recorded in one merge commit.',
      },
    },
  },
  checks: [
    {
      label: 'Take theme.css from redesign (theirs)',
      proof: 'git diff redesign -- theme.css',
      done: (state) => workingFile(state, 'theme.css') === L2.themeSamir,
    },
    {
      label: 'Resolve README.md with no markers left',
      proof: 'git diff README.md',
      done: (state) => resolved(workingFile(state, 'README.md')),
    },
    {
      label: 'Finish the merge',
      proof: 'git log --oneline --graph -4',
      done: (state, ctx) => !mergeInProgress(state) && mergeCommitOf(state, ctx, 'redesign') !== undefined,
    },
  ],
  validate: (state, ctx) => {
    const commit = mergeCommitOf(state, ctx, 'redesign');
    return allOf(
      check(headBranch(state) === 'main', 'HEAD must be on main.'),
      check(!mergeInProgress(state), 'The merge is still in progress: git add the resolved files, then git merge --continue.'),
      check(commit !== undefined, 'main must contain the merge commit of redesign.'),
      check(
        resolved(commit?.snapshot['README.md']),
        'The merge commit still has conflict markers in README.md. Press Undo and remove every <<<<<<<, ======= and >>>>>>> line.',
      ),
      check(commit?.snapshot['theme.css'] === L2.themeSamir, 'theme.css is generated: the merge must keep Samir\'s version exactly.'),
      check(isWorkingTreeClean(state), 'Finish with a clean working directory.'),
    );
  },
  hints: [
    'A conflict is Git handing the decision to you. git status lists the files both sides changed.',
    'For README.md, replace the whole <<<<<<< … >>>>>>> block with the text you want: either side or both. For theme.css, git checkout --theirs takes redesign\'s file whole. git add marks each file resolved.',
    'Edit README.md, git checkout --theirs theme.css, git add README.md theme.css, git merge --continue (Ctrl+X in nano keeps the message).',
  ],
  par: 4,
  takeaway: 'Resolve a conflict by writing the final file without markers (or taking a whole side), git add it, then git merge --continue.',
  theory: {
    title: 'Merge conflicts',
    body: 'When both sides changed the same lines, Git writes both versions into the file between <<<<<<< HEAD, ======= and >>>>>>> and stops. You decide the content, git add marks the file resolved, and git merge --continue writes the merge commit. git checkout --ours or --theirs takes one side for a whole file.',
    lesson: 'Markers out, git add, git merge --continue.',
  },
  prelude: [
    {
      id: 'm2.7-p1',
      teammate: 'samir',
      commands: [
        'git switch -c redesign',
        `edit README.md "${L2.readmeSamir}"`,
        `edit theme.css "${L2.themeSamir}"`,
        'git commit -am "design: new tagline, regenerated theme"',
        'git switch main',
      ],
    },
    {
      id: 'm2.7-p2',
      teammate: 'lea',
      commands: [`edit README.md "${L2.readmeLea}"`, `edit theme.css "${L2.themeLea}"`, 'git commit -am "docs: tagline, contrast fix"'],
    },
    {
      id: 'm2.7-p3',
      commands: stoppedMerge('redesign', {
        'README.md': conflictText(L2.readmeLea, L2.readmeSamir, 'redesign'),
        'theme.css': conflictText(L2.themeLea, L2.themeSamir, 'redesign'),
      }),
    },
  ],
  reference: [
    'git checkout --theirs theme.css',
    'edit README.md "# Nova: fast offline notes for small teams."',
    'git add README.md theme.css',
    'git merge --continue',
  ],
  alternatives: [
    ['git checkout --ours README.md', 'git checkout --theirs theme.css', 'git add .', 'git commit --no-edit'],
    ['git checkout redesign -- theme.css', `edit README.md "${L2.readmeSamir}"`, 'git add README.md', 'git commit --no-edit'],
  ],
};

const mergeAbort: Mission = {
  id: 'merge-abort',
  number: '2.8',
  title: 'Back out of a merge',
  story:
    'Yanis started merging his pricing branch and it stopped on plans.md. Lea needs the release built now, with Ines\'s typo fix and without the unfinished pricing.',
  goal: 'Abort the pricing merge, then merge typo-fix into main.',
  outcome: {
    summary: 'The half-done pricing merge is cancelled with nothing lost, and main has Ines\'s typo fix but not the unfinished pricing. Backing out cleanly beats resolving a conflict you are not ready to own.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'R', message: 'Merge branch \'redesign\'', parents: [], lane: 'main' },
          { id: 'P', message: 'feat: new pricing', parents: ['R'], lane: 'pricing', refs: ['pricing'] },
          { id: 'Y', message: 'docs: yearly discount', parents: ['R'], lane: 'main' },
          { id: 'T', message: 'fix: typo in help', parents: ['Y'], lane: 'main', refs: ['HEAD → main', 'typo-fix'] },
        ],
        head: 'T',
        caption: 'The typo fix is on main; pricing still waits on its own branch.',
      },
    },
  },
  checks: [
    {
      label: 'Abort the pricing merge',
      proof: 'git status',
      done: (state) => !mergeInProgress(state) && resolved(workingFile(state, 'plans.md')),
    },
    {
      label: 'Merge typo-fix into main',
      proof: 'git show main:help.md',
      done: (state) => tipFile(state, 'main', 'help.md') === L2.helpFixed,
    },
    {
      label: 'pricing stays out of main',
      proof: 'git branch --no-merged main',
      done: (state) => tipFile(state, 'main', 'help.md') === L2.helpFixed && !merged(state, 'pricing'),
    },
  ],
  validate: (state) =>
    allOf(
      check(!mergeInProgress(state), 'The pricing merge is still in progress: git merge --abort cancels it.'),
      check(headBranch(state) === 'main', 'HEAD must be on main.'),
      check(!merged(state, 'pricing'), 'pricing must not be merged into main yet. Press Undo and abort instead.'),
      check(tipFile(state, 'main', 'plans.md') === L2.plansLea, 'plans.md on main must stay as Lea left it.'),
      check(merged(state, 'typo-fix'), 'Merge typo-fix into main.'),
      check(isWorkingTreeClean(state), 'Finish with a clean working directory.'),
    ),
  hints: [
    'Git will not start another merge while one is stopped. Cancel this one first.',
    'git merge --abort puts the index and the files back as they were before the merge. Then merge typo-fix normally.',
    'git merge --abort, git merge typo-fix.',
  ],
  par: 2,
  takeaway: 'git merge --abort cancels a stopped merge and restores the state from before it started.',
  theory: {
    title: 'Aborting a merge',
    body: 'A stopped merge is not a commitment. git merge --abort resets the index and working files to how they were before git merge, and removes MERGE_HEAD. The branch you tried to merge is untouched, so you can merge it again later.',
    lesson: 'git merge --abort when you are not ready to resolve.',
  },
  prelude: [
    {
      id: 'm2.8-p1',
      teammate: 'yanis',
      commands: ['git switch -c pricing', `edit plans.md "${L2.plansYanis}"`, 'git commit -am "feat: new pricing"', 'git switch main'],
    },
    { id: 'm2.8-p2', teammate: 'lea', commands: [`edit plans.md "${L2.plansLea}"`, 'git commit -am "docs: yearly discount"'] },
    {
      id: 'm2.8-p3',
      teammate: 'ines',
      commands: ['git switch -c typo-fix', `edit help.md "${L2.helpFixed}"`, 'git commit -am "fix: typo in help"', 'git switch main'],
    },
    { id: 'm2.8-p4', commands: stoppedMerge('pricing', { 'plans.md': conflictText(L2.plansLea, L2.plansYanis, 'pricing') }) },
  ],
  reference: ['git merge --abort', 'git merge typo-fix'],
  alternatives: [['git reset --merge', 'git merge typo-fix']],
};

// 2.9 Capstone: integrate the open features on the production repo ---------

const ROUTES = 'apps/web/src/routes.ts';
const ROUTE_LINES = {
  preferences: "  { path: '/settings', title: 'Preferences' },",
  share: "  { path: '/s/:token', title: 'Shared note' },",
} as const;
/** Lea's rename on main plus Ines's share route: what routes.ts holds once both sides are kept. */
const ROUTES_BOTH = (NOVA_FILES[ROUTES] ?? '').replace(
  "  { path: '/settings', title: 'Settings' },\n",
  `${ROUTE_LINES.preferences}\n${ROUTE_LINES.share}\n`,
);
/** Every other line of routes.ts must survive the resolution. */
const ROUTES_KEPT = (NOVA_FILES[ROUTES] ?? '').split('\n').filter((line) => !line.includes("'/settings'"));
/** Tip subjects of the two open feature branches (branches get deleted, so find them by subject). */
const FEATURES = {
  'feature/offline-cache': 'test(sync): cover cache eviction',
  'feature/share-links': 'feat(web): add a copy share link button',
} as const;
type Feature = keyof typeof FEATURES;

/** Setup `edit` for a multi-line file: escapes backslashes, double quotes and newlines. */
const write = (file: string, text: string): string =>
  `edit ${file} "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

const featureMerged = (state: RepoState, feature: Feature): boolean => {
  const tipCommit = Object.values(state.commits).find((commit) => commit.message.split('\n')[0] === FEATURES[feature]);
  return isAncestor(state, tipCommit?.hash, state.branches.main);
};
const routesKeepBoth = (state: RepoState): boolean => {
  const text = tipFile(state, 'main', ROUTES);
  if (!resolved(text)) return false;
  const lines = text!.split('\n').map((line) => line.trim());
  return [ROUTE_LINES.preferences, ROUTE_LINES.share, ...ROUTES_KEPT].every((line) => lines.includes(line.trim()));
};
const featureGone = (state: RepoState, feature: Feature): boolean =>
  state.branches[feature] === undefined && featureMerged(state, feature);

const integrateFeatures: Mission = {
  id: 'integrate-open-features',
  number: '2.9',
  title: 'Integrate the open features',
  capstone: true,
  story:
    'Both open pull requests on the Nova monorepo were approved: Samir\'s feature/offline-cache and Ines\'s feature/share-links. Lea renamed Settings to Preferences on main this morning, in the same spot of routes.ts where Ines added her share route. Ship both features on main with their history intact, and leave no stale branches behind.',
  goal: 'Merge both open feature branches into main with merge commits, keep the Preferences rename and the share link route, and delete the merged branches.',
  outcome: {
    summary: 'Both approved features are on main as merge commits, routes.ts keeps Lea\'s rename and Ines\'s share route, and no merged branch is left behind. That is a normal integration day on a team where main never stops moving.',
    expect: {
      kind: 'terminal',
      command: 'git log --first-parent --format=%s -3',
      output: 'Merge branch \'feature/share-links\'\nMerge branch \'feature/offline-cache\'\nfeat(web): rename Settings to Preferences',
    },
  },
  checks: [
    {
      label: 'feature/offline-cache is merged into main',
      proof: 'git log --oneline --graph -n 12 main',
      done: (state) => featureMerged(state, 'feature/offline-cache'),
    },
    {
      label: 'feature/share-links is merged, and routes.ts keeps Preferences and the share route',
      proof: `git show main:${ROUTES}`,
      done: (state) => featureMerged(state, 'feature/share-links') && routesKeepBoth(state),
    },
    {
      label: 'The merged feature branches are deleted',
      proof: 'git branch',
      done: (state) => featureGone(state, 'feature/offline-cache') && featureGone(state, 'feature/share-links'),
    },
  ],
  validate: (state) =>
    allOf(
      check(!mergeInProgress(state), 'A merge is still in progress: fix the conflicted file, git add it, then git commit.'),
      check(headBranch(state) === 'main', 'Finish on main.'),
      check(
        featureMerged(state, 'feature/offline-cache'),
        'feature/offline-cache is not in main yet. Merge it (git merge keeps Samir\'s reviewed commits as they are; a rebase or squash would not).',
      ),
      check(
        featureMerged(state, 'feature/share-links'),
        'feature/share-links is not in main yet. Merge it with git merge; it will stop on routes.ts.',
      ),
      check(
        resolved(tipFile(state, 'main', ROUTES)),
        'routes.ts on main still has conflict markers (<<<<<<<, =======, >>>>>>>).',
      ),
      check(
        routesKeepBoth(state),
        'routes.ts must keep Lea\'s Preferences route and Ines\'s /s/:token route, plus every other route.',
      ),
      check(state.branches['release/1.2'] !== undefined, 'release/1.2 is still needed for hotfixes: only delete the merged feature branches.'),
      check(
        state.branches['feature/offline-cache'] === undefined && state.branches['feature/share-links'] === undefined,
        'Delete the merged feature branches with git branch -d.',
      ),
      check(isWorkingTreeClean(state), 'Finish with a clean working directory.'),
    ),
  hints: [
    'One merge is quiet, the other stops on a conflict. Finish both, then clean up.',
    'Merge feature/offline-cache first. When feature/share-links stops on routes.ts, keep both lines: the Preferences title from main and the /s/:token route from the branch, then git add and git commit. git branch -d only deletes merged branches.',
    `git merge feature/offline-cache, git merge feature/share-links, edit routes.ts to keep "${ROUTE_LINES.preferences.trim()}" and "${ROUTE_LINES.share.trim()}" without markers, git add ${ROUTES}, git commit --no-edit, git branch -d feature/offline-cache feature/share-links.`,
  ],
  par: 6,
  takeaway: 'Integrating a team\'s work is merge, resolve by keeping both intents, commit, then delete what is merged.',
  theory: {
    title: 'Integrating on a shared main',
    body: 'On a real team main keeps moving while feature branches wait for review, so most merges are three-way and some stop on a conflict. A good resolution keeps what both sides meant, here Lea\'s rename and Ines\'s new route, and git merge keeps the reviewed commits with their hashes, which a rebase or a squash would not. git branch -d refuses to delete unmerged work, so it doubles as a final check before cleanup.',
    lesson: 'Merge, keep both intents, then git branch -d.',
  },
  root: [
    ...productionRepo({ remote: false }),
    ...conflictingChange(ROUTES),
    // ponytail: only Lea's rename matters here; Ines's competing rename branch would just be noise.
    `git branch -q -D ${conflictBranch(ROUTES)}`,
  ],
  prelude: [],
  reference: [
    'git merge --no-edit feature/offline-cache',
    'git! merge --no-edit feature/share-links',
    write(ROUTES, ROUTES_BOTH),
    `git add ${ROUTES}`,
    'git commit --no-edit',
    'git branch -d feature/offline-cache feature/share-links',
  ],
  alternatives: [
    [
      'git! merge --no-ff feature/share-links',
      write(ROUTES, ROUTES_BOTH.replace(`${ROUTE_LINES.preferences}\n${ROUTE_LINES.share}`, `${ROUTE_LINES.share}\n${ROUTE_LINES.preferences}`)),
      'git add .',
      'git merge --continue',
      'git merge --no-ff -m "Merge feature/offline-cache" feature/offline-cache',
      'git branch -d feature/share-links',
      'git branch -d feature/offline-cache',
    ],
  ],
};

export const level2: Level = {
  id: 'branches',
  number: 2,
  title: 'Branches and conflicts',
  topics: 'switch, detached HEAD, fast-forward vs merge commit, conflicts, abort',
  planned: 9,
  root: ROOT,
  missions: [branchLabel, whichLabelMoves, detachedHead, fastForwardOrNot, noFfMerge, branchCleanup, conflictByHand, mergeAbort, integrateFeatures],
};

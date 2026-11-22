/**
 * Level 9 — Agent workflows. Nova Bot (`teammate: 'bot'`) is a scripted, deterministic AI coding agent:
 * its "runs" are prelude steps. Story file contents differ in their first 18 characters (diagram labels).
 */
import { allOf, check, commitList, headBranch, headFile, isWorkingTreeClean, snapshotOf, workingFile } from '../validate';

import type { RepoState } from '../../shared/repo-types';
import type { Level, Mission } from '../model';
import { FAKE_SECRET, NOVA_FILES, as, leakSecret, productionRepo, strayDebugCommit } from '../production';

// Story file contents ------------------------------------------------------

export const AGENT_FILES = {
  app: 'App: notes list screen.',
  appBot: 'App reformatted by Nova Bot (out of scope).',
  appJunk: 'App half-refactored by Nova Bot.',
  appBroken: 'App broken mid-edit by Nova Bot.',
  notes: 'Notes: list.',
  notesSorted: 'Notes: list, sorted A to Z.',
  store: 'Store: notes, renamed by Nova Bot.',
  test: 'Test: lists notes.',
  sortTest: 'Sort test: notes come A to Z.',
  agents: 'AGENTS.md: one branch per task. Never commit .env. Never delete tests.',
  lock: 'Lockfile: 12 packages.',
  lockBot: 'Lockfile churn: 340 packages re-resolved.',
  gitignore: 'node_modules/',
  csv: 'Export: notes to CSV.',
  csvTest: 'CSV test: one row per note.',
  quickApp: 'App rewritten from scratch by Nova Bot.',
  search: 'Search: notes by title.',
  searchFix: 'Search fixed: notes by title, any case.',
  searchTest: 'Search test: ignores case.',
  env: 'NOVA_API_KEY=sk-live-4242',
  scratch: 'Bot scratch: TODO try again.',
  tagsBug: 'Tags: shown Z to A (bug).',
  tagsFixed: 'Tags fixed: shown A to Z.',
  theme: 'Theme: dark mode.',
  sort: 'Sort: none yet.',
  sortTitle: 'Sort agent A: by title.',
  sortDate: 'Sort agent B: by date.',
  sortBoth: 'Sort: by title, then by date.',
  sortTitleTest: 'Title sort test: A to Z.',
  sortDateTest: 'Date sort test: newest first.',
  localSettings: '{ "permissions": { "allow": ["Bash(*)"] } }',
} as const;

const F = AGENT_FILES;

const ROOT: readonly string[] = [
  'git init -b main',
  `edit app.ts "${F.app}"`,
  `edit notes.ts "${F.notes}"`,
  `edit tests/notes.test.ts "${F.test}"`,
  `edit AGENTS.md "${F.agents}"`,
  `edit package-lock.json "${F.lock}"`,
  `edit .gitignore "${F.gitignore}"`,
  'git add .',
  'git commit -m "Initial commit"',
];

// Level helpers --------------------------------------------------------------

const MSG = {
  csv: 'feat: export notes to CSV',
  quick: 'feat: CSV export (quick version)',
  refactor1: 'refactor: move notes to store',
  fix1: 'fix: search ignores case',
  fix2: 'test: search ignores case',
} as const;

function byMessage(state: RepoState, message: string): string | undefined {
  return commitList(state).find((commit) => commit.message === message)?.hash;
}

/** True when `ancestor` is `tip` or reachable from it through parents. */
function contains(state: RepoState, tip: string | undefined, ancestor: string | undefined): boolean {
  if (tip === undefined || ancestor === undefined) return false;
  const seen = new Set<string>();
  const queue = [tip];
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    queue.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
}

const mainHas = (state: RepoState, message: string) => contains(state, state.branches.main, byMessage(state, message));

function branchFile(state: RepoState, branch: string, path: string): string | undefined {
  return snapshotOf(state, state.branches[branch])[path];
}

function ignoresEnv(gitignore: string | undefined): boolean {
  return (gitignore ?? '').split('\n').some((line) => ['.env', '/.env', '*.env', '.env*'].includes(line.trim()));
}

const onMain = (state: RepoState) => check(headBranch(state) === 'main', 'Finish with HEAD on main.');

// Missions -----------------------------------------------------------------

const branchPerTask: Mission = {
  id: 'agent-branch-per-task',
  number: '9.1',
  title: 'One task, one branch',
  story:
    'Lea asked Nova Bot for a CSV export. The bot tried twice: agent/csv-export and agent/csv-quick. Only one of them should reach main.',
  goal: 'Compare both agent branches with main, then merge only the one that does just the CSV task.',
  checks: [
    {
      label: 'Merge agent/csv-export into main',
      proof: 'git log --oneline main',
      done: (state) => mainHas(state, MSG.csv),
    },
    {
      label: 'Keep agent/csv-quick out of main',
      proof: 'git branch --no-merged main',
      done: (state) => mainHas(state, MSG.csv) && !mainHas(state, MSG.quick),
    },
  ],
  validate: (state) =>
    allOf(
      onMain(state),
      check(
        !mainHas(state, MSG.quick),
        'agent/csv-quick reached main: it rewrites app.ts and deletes notes.ts. Press Undo and merge the other branch.',
      ),
      check(mainHas(state, MSG.csv), 'Merge agent/csv-export into main.'),
      check(headFile(state, 'export.ts') === F.csv, 'main must contain export.ts from agent/csv-export.'),
      check(headFile(state, 'notes.ts') === F.notes, 'notes.ts must still be on main.'),
    ),
  hints: [
    'Before merging an agent branch, look at everything it changed compared with main.',
    'git diff main...<branch> --stat lists the files a branch changed since it left main. One branch touches far more than the task.',
    'git diff main...agent/csv-export --stat, git diff main...agent/csv-quick --stat, then git merge agent/csv-export.',
  ],
  par: 3,
  takeaway: 'Give each agent task its own branch and read its diff against main before anything merges.',
  theory: {
    title: 'Branch per task',
    body: 'Let an agent work on its own branch, such as agent/csv-export, so nothing it does lands on main unreviewed. git diff main...agent/x --stat compares the branch with the point where it left main, so you see only the agent\'s work. Write the house rules (branch names, files it must not touch) in a committed CLAUDE.md or AGENTS.md: agents read those files before they start.',
    lesson: 'One task, one branch, one review before merge.',
  },
  outcome: {
    summary:
      'main gains the focused CSV export while the branch that rewrote half the app stays unmerged. Reading an agent branch against main before merging is how you keep its extra changes out.',
    expect: { kind: 'terminal', command: 'git branch --no-merged main', output: '  agent/csv-quick' },
  },
  prelude: [
    {
      id: 'm9.1-p1',
      teammate: 'bot',
      commands: [
        'git switch -c agent/csv-export',
        `edit export.ts "${F.csv}"`,
        `edit tests/export.test.ts "${F.csvTest}"`,
        'git add export.ts tests/export.test.ts',
        `git commit -m "${MSG.csv}"`,
        'git switch -c agent/csv-quick main',
        `edit export.ts "${F.csv}"`,
        `edit app.ts "${F.quickApp}"`,
        'git rm -q notes.ts',
        'git add .',
        `git commit -m "${MSG.quick}"`,
        'git switch main',
      ],
    },
  ],
  reference: [
    'git diff main...agent/csv-export --stat',
    'git diff main...agent/csv-quick --stat',
    'git merge agent/csv-export',
  ],
  alternatives: [['git merge --no-ff --no-edit agent/csv-export']],
};

const redFlags: Mission = {
  id: 'agent-red-flags',
  number: '9.2',
  title: 'Red flags in the diff',
  story:
    'Nova Bot finished note search on agent/search. Its diff adds search.ts, but it also deletes tests/notes.test.ts and commits a .env file with a live API key.',
  goal: 'Bring the search feature into main with the test restored and .env untracked and ignored.',
  checks: [
    {
      label: 'Bring search.ts into main',
      proof: 'git show main:search.ts',
      done: (state) => headFile(state, 'search.ts') === F.search,
    },
    {
      label: 'Restore tests/notes.test.ts from main',
      proof: 'git show HEAD:tests/notes.test.ts',
      done: (state) => headFile(state, 'search.ts') === F.search && headFile(state, 'tests/notes.test.ts') === F.test,
    },
    {
      label: 'Stop tracking .env and ignore it',
      proof: 'git check-ignore -v .env',
      done: (state) =>
        headFile(state, 'search.ts') === F.search &&
        headFile(state, '.env') === undefined &&
        ignoresEnv(headFile(state, '.gitignore')),
    },
  ],
  validate: (state) =>
    allOf(
      onMain(state),
      check(headFile(state, 'search.ts') === F.search, 'main must contain search.ts from agent/search.'),
      check(headFile(state, 'tests/notes.test.ts') === F.test, 'tests/notes.test.ts must be back on main, as it was.'),
      check(headFile(state, '.env') === undefined, '.env is still tracked: remove it from the index with git rm --cached .env.'),
      check(ignoresEnv(headFile(state, '.gitignore')), 'Add .env to .gitignore and commit it.'),
      check(isWorkingTreeClean(state), 'Commit or discard what is left in the working directory.'),
    ),
  hints: [
    'Fix the agent branch first, then merge it. Two files in its diff should never have changed.',
    'Restore the test file from main, untrack .env without deleting it, add .env to .gitignore, commit on agent/search, then merge.',
    'git switch agent/search, git restore --source=main --staged --worktree tests/notes.test.ts, git rm --cached .env, add ".env" to .gitignore, git add .gitignore, git commit -m "fix: restore tests, untrack .env", git switch main, git merge agent/search.',
  ],
  par: 8,
  takeaway: 'Deleted tests and committed secrets are the first things to look for in an agent diff, and both are fixed with git before merging.',
  theory: {
    title: 'Red flags in an agent diff',
    body: 'Read an agent diff for what it should not contain: deleted or weakened tests, secrets such as .env, files outside the task, lockfile churn and reformat-only changes. git restore --source=main puts a file back as main has it, and git rm --cached stops tracking a file while keeping it on disk. A key that reached a commit stays in history, so rotate it as well.',
    lesson: 'Never merge an agent diff you have not read.',
  },
  outcome: {
    summary:
      'Search is on main, the deleted test is back, and .env sits on disk ignored instead of committed. Agents happily delete tests and commit keys, so you catch both before the merge.',
    expect: { kind: 'terminal', command: 'git check-ignore -v .env', output: '.gitignore:2:.env\t.env' },
  },
  prelude: [
    {
      id: 'm9.2-p1',
      teammate: 'bot',
      commands: [
        'git switch -c agent/search',
        `edit search.ts "${F.search}"`,
        'git rm -q tests/notes.test.ts',
        `edit .env "${F.env}"`,
        'git add .',
        'git commit -m "feat: search notes"',
        'git switch main',
      ],
    },
  ],
  reference: [
    'git switch agent/search',
    'git restore --source=main --staged --worktree tests/notes.test.ts',
    'git rm --cached .env',
    'append .gitignore ".env"',
    'git add .gitignore',
    'git commit -m "fix: restore tests, untrack .env"',
    'git switch main',
    'git merge agent/search',
  ],
  alternatives: [
    [
      'git merge agent/search',
      'git checkout ORIG_HEAD -- tests/notes.test.ts',
      'git rm --cached .env',
      'append .gitignore ".env"',
      'git commit -am "fix: restore tests, untrack .env"',
    ],
  ],
};

const keepTheGood: Mission = {
  id: 'agent-keep-the-good',
  number: '9.3',
  title: 'Keep the good, drop the bad',
  story:
    'You asked Nova Bot to sort notes A to Z. It left four uncommitted changes: the sort in notes.ts, a new sort test, a reformatted app.ts and a churned package-lock.json.',
  goal: 'Commit only the sort change and its test, and throw away the bot\'s edits to app.ts and package-lock.json.',
  checks: [
    {
      label: 'Commit notes.ts and tests/sort.test.ts',
      proof: 'git show --stat HEAD',
      done: (state) => headFile(state, 'notes.ts') === F.notesSorted && headFile(state, 'tests/sort.test.ts') === F.sortTest,
    },
    {
      label: 'Discard the app.ts and lockfile edits',
      proof: 'git diff HEAD -- app.ts package-lock.json',
      done: (state) =>
        workingFile(state, 'app.ts') === F.app &&
        workingFile(state, 'package-lock.json') === F.lock &&
        headFile(state, 'app.ts') === F.app &&
        headFile(state, 'package-lock.json') === F.lock,
    },
    { label: 'Clean working directory', proof: 'git status', done: (state) => isWorkingTreeClean(state) },
  ],
  validate: (state) =>
    allOf(
      onMain(state),
      check(headFile(state, 'app.ts') === F.app, 'The reformatted app.ts was committed. Press Undo and leave it out.'),
      check(headFile(state, 'package-lock.json') === F.lock, 'The lockfile churn was committed. Press Undo and leave it out.'),
      check(headFile(state, 'notes.ts') === F.notesSorted, 'Commit the sort change in notes.ts.'),
      check(headFile(state, 'tests/sort.test.ts') === F.sortTest, 'Commit the new tests/sort.test.ts too.'),
      check(isWorkingTreeClean(state), 'Discard the bot\'s edits to app.ts and package-lock.json.'),
    ),
  hints: [
    'Two of the four changes belong to the task. Commit those, throw the others away.',
    'git restore <file> puts a tracked file back as the last commit has it. Stage only the files you keep.',
    'git restore app.ts package-lock.json, git add notes.ts tests/sort.test.ts, git commit -m "feat: sort notes A to Z".',
  ],
  par: 3,
  takeaway: 'Stage only what belongs to the task and git restore the rest of an agent\'s edits.',
  theory: {
    title: 'Partial keep',
    body: 'Agents often do the task plus a little extra. Stage only the files that belong to the task, and git restore the others back to the last commit. When good and bad edits share one file, git add -p lets you pick hunk by hunk. Keep shared agent settings like .claude/settings.json committed and personal ones like settings.local.json or .env ignored.',
    lesson: 'You choose what enters the commit, not the agent.',
  },
  outcome: {
    summary:
      'One commit holds just the sort change and its test; the reformatted app.ts and the lockfile churn are gone. You decide what an agent run contributes, file by file.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat --oneline HEAD',
      output: `f2506e8 feat: sort notes A to Z
 notes.ts           | 2 +-
 tests/sort.test.ts | 1 +
 2 files changed, 2 insertions(+), 1 deletion(-)`,
    },
  },
  prelude: [
    {
      id: 'm9.3-p1',
      teammate: 'bot',
      commands: [
        `edit notes.ts "${F.notesSorted}"`,
        `edit tests/sort.test.ts "${F.sortTest}"`,
        `edit app.ts "${F.appBot}"`,
        `edit package-lock.json "${F.lockBot}"`,
      ],
    },
  ],
  reference: [
    'git restore app.ts package-lock.json',
    'git add notes.ts tests/sort.test.ts',
    'git commit -m "feat: sort notes A to Z"',
  ],
  alternatives: [
    ['git add notes.ts tests/sort.test.ts', 'git commit -m "feat: sort notes A to Z"', 'git checkout -- app.ts package-lock.json'],
  ],
};

/** The checkpoint of 9.4 = the commit the bot's run started from. */
const checkpointOf = (state: RepoState) => state.commits[byMessage(state, MSG.refactor1) ?? '']?.parents[0];

const checkpoint: Mission = {
  id: 'agent-checkpoint',
  number: '9.4',
  title: 'Back to the checkpoint',
  story:
    'Before letting Nova Bot refactor on main, you made a checkpoint branch. The run went badly: two junk commits, a broken app.ts on disk and a stray scratch.ts.',
  goal: 'Put main and the working directory back exactly at the checkpoint.',
  checks: [
    {
      label: 'Move main back to the checkpoint',
      proof: 'git log --oneline -1 main',
      done: (state) => state.branches.main !== undefined && state.branches.main === checkpointOf(state),
    },
    {
      label: 'Undo the bot\'s edits on disk',
      proof: 'git diff',
      done: (state) => state.branches.main === checkpointOf(state) && workingFile(state, 'app.ts') === F.app,
    },
    {
      label: 'Delete the untracked scratch.ts',
      proof: 'git status --short',
      done: (state) => workingFile(state, 'scratch.ts') === undefined,
    },
  ],
  validate: (state) =>
    allOf(
      onMain(state),
      check(state.branches.main === checkpointOf(state), 'main must point at the checkpoint commit, before the bot\'s two commits.'),
      check(workingFile(state, 'scratch.ts') === undefined, 'scratch.ts is still on disk: remove untracked files with git clean.'),
      check(isWorkingTreeClean(state), 'The working directory still has the bot\'s edits.'),
    ),
  hints: [
    'The checkpoint branch still points where things were fine. Move main back there and clear the disk.',
    'git reset --hard moves the branch and resets tracked files. git clean removes untracked files.',
    'git reset --hard checkpoint, then git clean -f.',
  ],
  par: 2,
  takeaway: 'A checkpoint before an agent run turns a bad run into two commands: reset --hard and clean.',
  theory: {
    title: 'Checkpoints',
    body: 'Before an agent runs, commit your work and mark the spot with git branch checkpoint (or a tag). An agent\'s own rewind only covers the edits it tracked, while git covers everything. git reset --hard checkpoint brings back the commit and the tracked files, and git clean -f deletes the untracked leftovers.',
    lesson: 'Commit and checkpoint before every agent run.',
  },
  danger: 'git reset --hard and git clean -f delete uncommitted work for good. Check git status first.',
  outcome: {
    summary:
      'main is back on the checkpoint commit and the working tree is clean, as if the bad run never happened. A checkpoint makes letting an agent loose cheap to undo.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2',
      output: `161d57b feat: sort notes A to Z
2e3b6ba fix: restore tests, untrack .env`,
    },
  },
  prelude: [
    { id: 'm9.4-p1', commands: ['git branch checkpoint'] },
    {
      id: 'm9.4-p2',
      teammate: 'bot',
      commands: [
        'git mv notes.ts store.ts',
        `edit store.ts "${F.store}"`,
        `git commit -qam "${MSG.refactor1}"`,
        `edit app.ts "${F.appJunk}"`,
        'git commit -qam "refactor: rewire app"',
        `edit app.ts "${F.appBroken}"`,
        `edit scratch.ts "${F.scratch}"`,
      ],
    },
  ],
  reference: ['git reset --hard checkpoint', 'git clean -f'],
  alternatives: [['git reset --hard HEAD~2', 'git clean -fd']],
};

const AGENT_BRANCH_SWITCH = /^checkout: moving from .+ to agent\/(tags|theme)$/;

const worktreePerAgent: Mission = {
  id: 'agent-worktrees',
  number: '9.5',
  title: 'One worktree per agent',
  story:
    'Two Nova Bot runs finished in parallel: agent/tags and agent/theme. Lea spotted that the tag list is sorted Z to A on agent/tags. Keep main checked out here and open each agent branch in its own folder.',
  goal: 'Fix tags.ts on agent/tags from a worktree, merge both agent branches into main, then remove the worktrees.',
  checks: [
    {
      label: 'Commit the tag fix on agent/tags',
      proof: 'git show agent/tags:tags.ts',
      done: (state) => branchFile(state, 'agent/tags', 'tags.ts') === F.tagsFixed,
    },
    {
      label: 'Merge agent/tags and agent/theme into main',
      proof: 'git log --oneline --graph main',
      done: (state) =>
        branchFile(state, 'main', 'tags.ts') === F.tagsFixed && branchFile(state, 'main', 'theme.ts') === F.theme,
    },
    {
      label: 'Remove the agent worktrees',
      proof: 'git worktree list',
      done: (state) =>
        branchFile(state, 'main', 'theme.ts') === F.theme && Object.keys(state.worktrees).length === 1,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        !ctx.facts.reflog.some((entry) => AGENT_BRANCH_SWITCH.test(entry.action)),
        'This folder switched to an agent branch. Restart the mission and open agent/tags with git worktree add instead.',
      ),
      onMain(state),
      check(branchFile(state, 'agent/tags', 'tags.ts') === F.tagsFixed, 'Fix tags.ts to "Tags fixed: shown A to Z." and commit it on agent/tags.'),
      check(headFile(state, 'tags.ts') === F.tagsFixed, 'Merge agent/tags into main.'),
      check(headFile(state, 'theme.ts') === F.theme, 'Merge agent/theme into main.'),
      check(Object.keys(state.worktrees).length === 1, 'Remove the extra worktrees with git worktree remove.'),
      check(isWorkingTreeClean(state), 'Commit or discard what is left in the working directory.'),
    ),
  hints: [
    'Each agent branch gets its own folder next to this one, and main never leaves this folder.',
    'git worktree add ../nova-tags agent/tags checks the branch out in ../nova-tags. Fix and commit there, merge from here, then git worktree remove.',
    'git worktree add ../nova-tags agent/tags, git worktree add ../nova-theme agent/theme, write "Tags fixed: shown A to Z." to ../nova-tags/tags.ts, git -C ../nova-tags commit -am "fix: sort tags A to Z", git merge --no-edit agent/tags, git merge --no-edit agent/theme, git worktree remove ../nova-tags, git worktree remove ../nova-theme.',
  ],
  par: 8,
  takeaway: 'A worktree per agent gives each run its own folder and branch, so parallel agents never overwrite each other.',
  theory: {
    title: 'Worktrees for parallel agents',
    body: 'Two agents in one folder edit the same files and switch branches under each other. git worktree add ../nova-tags agent/tags gives a branch its own folder that shares the same history, so each agent (and you) works undisturbed. Untracked files like .env are not copied into a new worktree, and git worktree remove cleans up when the task is merged.',
    lesson: 'One agent, one branch, one worktree.',
  },
  outcome: {
    summary:
      'Both agent branches are merged, the tag fix included, and only this folder remains as a worktree. Separate worktrees let parallel agents work without ever switching branches under each other.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -6',
      output: `*   0d8fe04 Merge branch 'agent/theme'
|\\
| * a6dd059 feat: dark theme
* | 051f7af fix: sort tags A to Z
* | 96acc64 feat: tag list
|/
* 161d57b feat: sort notes A to Z
* 2e3b6ba fix: restore tests, untrack .env`,
    },
  },
  prelude: [
    {
      id: 'm9.5-p1',
      teammate: 'bot',
      commands: [
        'git worktree add -q -b agent/tags ../bot-tags',
        `edit ../bot-tags/tags.ts "${F.tagsBug}"`,
        'git -C ../bot-tags add tags.ts',
        'git -C ../bot-tags commit -qm "feat: tag list"',
        'git worktree remove ../bot-tags',
        'git worktree add -q -b agent/theme ../bot-theme main',
        `edit ../bot-theme/theme.ts "${F.theme}"`,
        'git -C ../bot-theme add theme.ts',
        'git -C ../bot-theme commit -qm "feat: dark theme"',
        'git worktree remove ../bot-theme',
      ],
    },
  ],
  reference: [
    'git worktree add ../nova-tags agent/tags',
    'git worktree add ../nova-theme agent/theme',
    `edit ../nova-tags/tags.ts "${F.tagsFixed}"`,
    'git -C ../nova-tags commit -am "fix: sort tags A to Z"',
    'git merge --no-edit agent/tags',
    'git merge --no-edit agent/theme',
    'git worktree remove ../nova-tags',
    'git worktree remove ../nova-theme',
  ],
  alternatives: [
    [
      'git worktree add ../nova-tags agent/tags',
      `edit ../nova-tags/tags.ts "${F.tagsFixed}"`,
      'git -C ../nova-tags commit -am "fix: sort tags A to Z"',
      'git worktree remove ../nova-tags',
      'git merge --no-edit agent/tags agent/theme',
    ],
  ],
};

/** The commit main pointed at before the bot's two commits of 9.6. */
const beforeBotOf = (state: RepoState) => state.commits[byMessage(state, MSG.fix1) ?? '']?.parents[0];

const committedToMain: Mission = {
  id: 'agent-committed-to-main',
  number: '9.6',
  title: 'The bot committed to main',
  story:
    'Nova Bot fixed case-insensitive search, but it committed both commits straight onto main instead of an agent branch. The work is good; it just has to go through review.',
  goal: 'Move the bot\'s two commits to a new branch agent/fix and put main back where it was before them.',
  checks: [
    {
      label: 'agent/fix holds the bot\'s commits',
      proof: 'git log --oneline main..agent/fix',
      done: (state) => {
        const tip = state.branches['agent/fix'];
        return tip !== undefined && state.commits[tip]?.message === MSG.fix2 && contains(state, tip, byMessage(state, MSG.fix1));
      },
    },
    {
      label: 'main is back before the bot\'s commits',
      proof: 'git log --oneline -1 main',
      done: (state) => state.branches.main !== undefined && state.branches.main === beforeBotOf(state),
    },
  ],
  validate: (state) =>
    allOf(
      check(
        state.branches['agent/fix'] !== undefined && state.commits[state.branches['agent/fix']]?.message === MSG.fix2,
        'Create agent/fix at the bot\'s last commit before moving main, or its commits will only live in the reflog.',
      ),
      onMain(state),
      check(state.branches.main === beforeBotOf(state), 'main must point at the commit just before the bot\'s two commits.'),
      check(isWorkingTreeClean(state), 'The working directory must be clean.'),
    ),
  hints: [
    'First give the bot\'s commits a branch so nothing is lost, then move main back.',
    'git branch agent/fix marks the current commit. Then reset main two commits back.',
    'git branch agent/fix, then git reset --hard HEAD~2.',
  ],
  par: 2,
  takeaway: 'Branch first, then reset: the agent\'s commits move to agent/fix and main goes back to before them.',
  theory: {
    title: 'Guardrails for agents',
    body: 'If an agent commits to main, git branch agent/fix keeps its work and git reset --hard HEAD~2 moves main back. To prevent it, deny risky git commands (push --force, reset --hard, push to main) in the agent\'s permission settings and protect main on GitHub so every change needs a pull request. Give agents tokens that can push branches but not bypass protection.',
    lesson: 'Branch before you reset, and let protection stop agents at main.',
  },
  danger: 'git reset --hard moves main and discards uncommitted changes. Create agent/fix first so the commits stay reachable.',
  outcome: {
    summary:
      'The bot\'s two commits live on agent/fix, ready for a pull request, and main is back where it was. Agent work goes through review even when the agent skips the branch.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline main..agent/fix',
      output: `5f9a3fe test: search ignores case
c852f95 fix: search ignores case`,
    },
  },
  prelude: [
    {
      id: 'm9.6-p1',
      teammate: 'bot',
      commands: [
        `edit search.ts "${F.searchFix}"`,
        `git commit -qam "${MSG.fix1}"`,
        `edit tests/search.test.ts "${F.searchTest}"`,
        'git add tests/search.test.ts',
        `git commit -qm "${MSG.fix2}"`,
      ],
    },
  ],
  reference: ['git branch agent/fix', 'git reset --hard HEAD~2'],
  alternatives: [['git switch -c agent/fix', 'git branch -f main HEAD~2', 'git switch main']],
};

// 9.7 House rules for agents ---------------------------------------------------

const SETTINGS = '.claude/settings.json';
const LOCAL_SETTINGS = '.claude/settings.local.json';

const rulesWritten = (state: RepoState) =>
  (headFile(state, 'CLAUDE.md') ?? '').includes('@AGENTS.md') &&
  (headFile(state, 'AGENTS.md') ?? '').includes('agent/') &&
  (headFile(state, 'AGENTS.md') ?? '').includes('--no-verify');

/** The committed settings parse and deny some form of git push --force. */
function deniesForcePush(text: string | undefined): boolean {
  try {
    const deny: unknown = (JSON.parse(text ?? '') as { permissions?: { deny?: unknown } }).permissions?.deny;
    return Array.isArray(deny) && deny.some((rule) => typeof rule === 'string' && rule.includes('push --force'));
  } catch {
    return false;
  }
}

const personalIgnored = (state: RepoState, ctx: { facts: { ignored: readonly string[] } }) =>
  headFile(state, LOCAL_SETTINGS) === undefined &&
  ctx.facts.ignored.some((path) => path === LOCAL_SETTINGS || path === '.claude/') &&
  ctx.facts.ignored.includes('.env');

const houseRules: Mission = {
  id: 'agent-house-rules',
  number: '9.7',
  title: 'House rules',
  story:
    'Every agent the team runs should read the same rules: AGENTS.md is the shared file, and Claude Code reads CLAUDE.md, which can import it. Your personal .claude/settings.local.json (it allows every shell command) must never be committed, while the team\'s .claude/settings.json should be.',
  goal: 'Commit CLAUDE.md importing AGENTS.md, rules in AGENTS.md about agent/ branches and --no-verify, and a .claude/settings.json that denies git push --force; ignore .claude/settings.local.json.',
  checks: [
    {
      label: 'CLAUDE.md imports AGENTS.md, which names agent/ branches and bans --no-verify',
      proof: 'git show HEAD:CLAUDE.md HEAD:AGENTS.md',
      done: rulesWritten,
    },
    {
      label: '.claude/settings.json is committed and denies git push --force',
      proof: 'git show HEAD:.claude/settings.json',
      done: (state) => deniesForcePush(headFile(state, SETTINGS)),
    },
    {
      label: '.claude/settings.local.json and .env are ignored, not committed',
      proof: 'git check-ignore -v .claude/settings.local.json .env',
      done: personalIgnored,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      onMain(state),
      check(
        (headFile(state, 'CLAUDE.md') ?? '').includes('@AGENTS.md'),
        'Commit a CLAUDE.md that contains the line @AGENTS.md, so Claude Code loads the shared rules.',
      ),
      check(rulesWritten(state), 'AGENTS.md must mention agent/ branches and forbid --no-verify. Add the rule and commit it.'),
      check(
        deniesForcePush(headFile(state, SETTINGS)),
        `${SETTINGS} must be committed, be valid JSON and list a rule with "push --force" under permissions.deny.`,
      ),
      check(headFile(state, LOCAL_SETTINGS) === undefined, `${LOCAL_SETTINGS} is personal: it must not be committed.`),
      check(personalIgnored(state, ctx), `Add ${LOCAL_SETTINGS} to .gitignore (next to .env) and commit .gitignore.`),
      check(isWorkingTreeClean(state), 'Commit everything else: the working tree must be clean.'),
    ),
  hints: [
    'Shared rules and shared settings are committed; personal settings are ignored.',
    'CLAUDE.md can be one line, @AGENTS.md. Write .claude/settings.json with nano: {"permissions": {"deny": ["Bash(git push --force:*)"]}}. Add .claude/settings.local.json to .gitignore, then stage the four files and commit.',
    "echo 'Branches: agent/<task>. Never git commit --no-verify.' >> AGENTS.md, echo '@AGENTS.md' > CLAUDE.md, echo '{\"permissions\": {\"deny\": [\"Bash(git push --force:*)\"]}}' > .claude/settings.json, echo .claude/settings.local.json >> .gitignore, git add AGENTS.md CLAUDE.md .claude/settings.json .gitignore, git commit -m \"chore: house rules for agents\"",
  ],
  par: 6,
  takeaway: 'Commit the rules agents read (AGENTS.md, CLAUDE.md, .claude/settings.json) and ignore the personal ones (.claude/settings.local.json, .env).',
  theory: {
    title: 'Repo setup for agents',
    body: 'AGENTS.md is the cross-tool rules file (Codex, Cursor, Copilot and others read it), and Claude Code reads CLAUDE.md, where a line @AGENTS.md imports the shared file. .claude/settings.json holds team permissions such as deny rules for git push --force or git reset --hard and is committed, while .claude/settings.local.json is your personal override and stays out of git like .env. Deny rules match by prefix, so variants like git push -f need their own rule, and a server-side branch protection is still the real guardrail.',
    lesson: 'Rules and team settings in git; personal settings and secrets ignored.',
  },
  outcome: {
    summary:
      'The rules every agent reads and the team\'s permission settings are committed, while your personal settings and .env stay ignored. Each new agent session then starts with the same guardrails.',
    expect: {
      kind: 'terminal',
      command: 'git show --stat --oneline HEAD',
      output: `992dec7 chore: house rules for agents
 .claude/settings.json | 1 +
 .gitignore            | 1 +
 AGENTS.md             | 1 +
 CLAUDE.md             | 1 +
 4 files changed, 4 insertions(+)`,
    },
  },
  prelude: [{ id: 'm9.7-p1', commands: ['mkdir .claude', `edit ${LOCAL_SETTINGS} ${JSON.stringify(F.localSettings)}`] }],
  reference: [
    'append AGENTS.md "Branches: agent/<task>. Never git commit --no-verify. Never git push --force."',
    'edit CLAUDE.md "@AGENTS.md"',
    `edit ${SETTINGS} ${JSON.stringify(JSON.stringify({ permissions: { deny: ['Bash(git push --force:*)', 'Bash(git reset --hard:*)'] } }))}`,
    `append .gitignore "${LOCAL_SETTINGS}"`,
    `git add AGENTS.md CLAUDE.md ${SETTINGS} .gitignore`,
    'git commit -m "chore: house rules for agents"',
  ],
  alternatives: [
    [
      'append AGENTS.md "Agents work on agent/* branches and never use --no-verify."',
      'edit CLAUDE.md "# Claude Code\\n@AGENTS.md"',
      `edit ${SETTINGS} ${JSON.stringify(JSON.stringify({ permissions: { deny: ['Bash(git push --force:*)'] } }, null, 2))}`,
      'append .gitignore ".claude/*.local.json"',
      'git add -A',
      'git commit -m "docs: agent rules and shared settings"',
    ],
  ],
};

// 9.8 Two agents, one file ---------------------------------------------------------

const sortResolved = (text: string | undefined) =>
  text !== undefined && !/^(<<<<<<<|=======|>>>>>>>)/m.test(text) && text.includes('title') && text.includes('date');
const bothSortsIn = (state: RepoState) =>
  contains(state, state.branches.main, state.branches['agent/sort-title']) &&
  contains(state, state.branches.main, state.branches['agent/sort-date']);

const twoAgentsOneFile: Mission = {
  id: 'two-agents-one-file',
  number: '9.8',
  title: 'Two agents, one file',
  story:
    'You ran two Nova Bot sessions in parallel worktrees: one added sorting by title on agent/sort-title, the other sorting by date on agent/sort-date. Both rewrote the same line of sort.ts, and Lea wants both features on main.',
  goal: 'Merge both agent branches into main and resolve sort.ts so it sorts by title, then by date.',
  checks: [
    {
      label: 'Both agent branches are merged into main',
      proof: 'git branch --merged main',
      done: bothSortsIn,
    },
    {
      label: 'sort.ts keeps both features, without conflict markers',
      proof: 'git show main:sort.ts',
      done: (state) => bothSortsIn(state) && sortResolved(branchFile(state, 'main', 'sort.ts')),
    },
    {
      label: 'Both tests are on main',
      proof: 'git ls-tree -r --name-only main tests',
      done: (state) =>
        branchFile(state, 'main', 'tests/sort-title.test.ts') === F.sortTitleTest &&
        branchFile(state, 'main', 'tests/sort-date.test.ts') === F.sortDateTest,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        ctx.facts.inProgress === null,
        `A ${ctx.facts.inProgress ?? 'git'} is still in progress: resolve sort.ts, git add it, then finish with git commit (or --continue).`,
      ),
      onMain(state),
      check(contains(state, state.branches.main, state.branches['agent/sort-title']), 'Merge agent/sort-title into main.'),
      check(contains(state, state.branches.main, state.branches['agent/sort-date']), 'Merge agent/sort-date into main too.'),
      check(
        sortResolved(branchFile(state, 'main', 'sort.ts')),
        'sort.ts on main must mention both title and date and have no <<<<<<< ======= >>>>>>> markers left.',
      ),
      check(
        branchFile(state, 'main', 'tests/sort-title.test.ts') === F.sortTitleTest &&
          branchFile(state, 'main', 'tests/sort-date.test.ts') === F.sortDateTest,
        'Keep both agents\' tests.',
      ),
      check(isWorkingTreeClean(state), 'The working tree must be clean.'),
    ),
  hints: [
    'Merge one branch, then the other: the second merge is where the two agents meet.',
    'The first merge goes through. The second stops on sort.ts: write one line that sorts by title, then by date, delete the markers, git add sort.ts, git commit.',
    'git merge agent/sort-title, git merge agent/sort-date, write "Sort: by title, then by date." to sort.ts, git add sort.ts, git commit --no-edit',
  ],
  par: 5,
  takeaway: 'Parallel agents on the same file always end in a conflict: merge one, then resolve the second by hand so both changes survive.',
  theory: {
    title: 'Parallel agents, same file',
    body: 'Worktrees keep two agents from overwriting each other while they work, but they do not stop them from editing the same lines, so the conflict shows up when you merge the second branch. Resolve it like any conflict, keeping what both agents meant, or rebase the second branch onto main first so its author (or agent) resolves it there. Splitting tasks by file, or merging the first branch before starting the second agent, avoids most of these.',
    lesson: 'Two agents, one file: merge the first, resolve the second.',
  },
  outcome: {
    summary:
      'Both sort features are merged into main and sort.ts sorts by title, then by date. Parallel agents meet in a conflict, and you are the one who keeps what both meant.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -4',
      output: `*   382c558 Merge branch 'agent/sort-date'
|\\
| * 5d25b39 feat: sort notes by date
* | c67fc7a feat: sort notes by title
|/
* f75440e chore: sort placeholder`,
    },
  },
  prelude: [
    {
      id: 'm9.8-p1',
      commands: [`edit sort.ts "${F.sort}"`, 'git add sort.ts', 'git commit -m "chore: sort placeholder"'],
    },
    {
      id: 'm9.8-p2',
      teammate: 'bot',
      commands: [
        'git worktree add -q -b agent/sort-title ../bot-title',
        `edit ../bot-title/sort.ts "${F.sortTitle}"`,
        `edit ../bot-title/tests/sort-title.test.ts "${F.sortTitleTest}"`,
        'git -C ../bot-title add .',
        'git -C ../bot-title commit -qm "feat: sort notes by title"',
        'git worktree remove ../bot-title',
        'git worktree add -q -b agent/sort-date ../bot-date main',
        `edit ../bot-date/sort.ts "${F.sortDate}"`,
        `edit ../bot-date/tests/sort-date.test.ts "${F.sortDateTest}"`,
        'git -C ../bot-date add .',
        'git -C ../bot-date commit -qm "feat: sort notes by date"',
        'git worktree remove ../bot-date',
      ],
    },
  ],
  reference: [
    'git merge agent/sort-title',
    'git! merge agent/sort-date',
    `edit sort.ts "${F.sortBoth}"`,
    'git add sort.ts',
    'git commit --no-edit',
  ],
  alternatives: [
    [
      'git merge agent/sort-title',
      'git switch agent/sort-date',
      'git! rebase main',
      `edit sort.ts "${F.sortBoth}"`,
      'git add sort.ts',
      'GIT_EDITOR=true git rebase --continue',
      'git switch main',
      'git merge agent/sort-date',
    ],
  ],
};

// 9.9 Capstone: clean up after the agent (standalone, on the Nova production repo) ---

/** Double-quoted setup argument (`\n` = newline for edit). */
const q = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

const SEARCH_TS = 'apps/web/src/search.ts';
const HIGHLIGHT = "  return text.split(query).join(`<mark>${query}</mark>`);";
/** Good commit 1: highlight matches in any case. */
const SEARCH_ANY_CASE = NOVA_FILES[SEARCH_TS]!.replace(HIGHLIGHT, "  return text.replace(new RegExp(query, 'gi'), (match) => `<mark>${match}</mark>`);");
/** Good commit 2: escape regex characters in the query (what search-improvements must end with). */
const SEARCH_CLEAN = SEARCH_ANY_CASE.replace(
  'export function highlight(',
  "const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n\nexport function highlight(",
).replace('new RegExp(query, ', 'new RegExp(escapeRegExp(query), ');
const LOCKFILE = '{\n  "name": "nova",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": {\n    "node_modules/react": { "version": "18.3.1", "resolved": "https://registry.npmjs.org/react/-/react-18.3.1.tgz" },\n    "node_modules/vite": { "version": "5.4.10", "resolved": "https://registry.npmjs.org/vite/-/vite-5.4.10.tgz" }\n  }\n}';

const botCommit = (subject: string) => `${as('bot')} git commit -q -a -m ${q(subject)}`;

/** Nova Bot's branch: 6 commits off main, two of them worth keeping (~5 and ~2). */
const AGENT_RUN: readonly string[] = [
  'git checkout -q -b agent/search-rewrite',
  `edit ${SEARCH_TS} ${q(SEARCH_ANY_CASE)}`,
  botCommit('feat(web): highlight search matches in any case'),
  'git rm -q packages/sync/test/queue.test.ts',
  botCommit('test(sync): remove the flaky queue test'),
  ...leakSecret('bot'),
  `edit ${SEARCH_TS} ${q(SEARCH_CLEAN)}`,
  botCommit('fix(web): escape regex characters in search queries'),
  `edit package-lock.json ${q(LOCKFILE)}`,
  'git add package-lock.json',
  botCommit('chore(deps): regenerate package-lock.json'),
  ...strayDebugCommit('bot'),
  'git checkout -q main',
];

function reachableFrom(state: RepoState, tips: readonly (string | undefined)[]): Set<string> {
  const seen = new Set<string>();
  const queue = tips.filter((hash): hash is string => hash !== undefined);
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (seen.has(hash)) continue;
    seen.add(hash);
    queue.push(...(state.commits[hash]?.parents ?? []));
  }
  return seen;
}

/** Exactly main's files plus the search improvement: tests kept, no lockfile churn, no debug, no .env. */
function cleanTree(state: RepoState, branch: string): boolean {
  const tree = snapshotOf(state, state.branches[branch]);
  const paths = new Set([...Object.keys(tree), ...Object.keys(NOVA_FILES)]);
  return [...paths].every((path) => tree[path] === (path === SEARCH_TS ? SEARCH_CLEAN : NOVA_FILES[path]));
}

const hasClean = (state: RepoState) => state.branches['search-improvements'] !== undefined;

const leaks = (state: RepoState): boolean =>
  [...reachableFrom(state, [state.branches['search-improvements'], state.branches.main])].some((hash) => {
    const tree = state.commits[hash]?.snapshot ?? {};
    return tree['.env'] !== undefined || Object.values(tree).some((text) => text.includes(FAKE_SECRET));
  });

const mergedIntoMain = (state: RepoState) =>
  hasClean(state) && contains(state, state.branches.main, state.branches['search-improvements']) && cleanTree(state, 'main');

const cleanUpAfterTheAgent: Mission = {
  id: 'clean-up-after-the-agent',
  number: '9.9',
  title: 'Capstone: clean up after the agent',
  capstone: true,
  story:
    'Nova Bot spent the night on agent/search-rewrite and left six commits: a real search improvement in two steps, plus a deleted test, a committed .env with a test key, lockfile churn and a "wip" debug commit. Lea wants the improvement on main today and nothing else from that branch, least of all the key.',
  goal: 'Create search-improvements from main with only the two good search commits, keep tests and lockfile intact, make sure no reachable commit holds the secret, and merge it into main.',
  checks: [
    {
      label: 'search-improvements has the full search improvement',
      proof: 'git show search-improvements:apps/web/src/search.ts',
      done: (state) => hasClean(state) && snapshotOf(state, state.branches['search-improvements'])[SEARCH_TS] === SEARCH_CLEAN,
    },
    {
      label: 'Nothing else came along: tests, lockfile and editor match main',
      proof: 'git diff --stat main...search-improvements',
      done: (state) => hasClean(state) && cleanTree(state, 'search-improvements'),
    },
    {
      label: 'No commit reachable from search-improvements or main holds the key',
      proof: 'git log -S sk_test_ --oneline main search-improvements',
      done: (state) => hasClean(state) && !leaks(state),
    },
    {
      label: 'search-improvements is merged into main',
      proof: 'git log --oneline --graph -5 main',
      done: mergedIntoMain,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.inProgress === null, `A ${ctx.facts.inProgress ?? 'git'} is still in progress. Finish it (--continue) or cancel it (--abort).`),
      check(hasClean(state), 'Create the branch search-improvements from main.'),
      check(
        !leaks(state),
        'A commit with .env and the sk_test_ key is reachable from search-improvements or main. Rebuild the branch from main without the "send usage analytics" commit.',
      ),
      check(
        snapshotOf(state, state.branches['search-improvements'])[SEARCH_TS] === SEARCH_CLEAN,
        'search-improvements is missing part of the search improvement. It came in two commits: case-insensitive matching and regex escaping.',
      ),
      check(
        cleanTree(state, 'search-improvements'),
        'search-improvements carries more than the search change (a deleted test, package-lock.json, debug.log or a console.log). Keep only the two search commits.',
      ),
      check(
        contains(state, state.branches.main, state.branches['search-improvements']),
        'Merge search-improvements into main.',
      ),
      check(cleanTree(state, 'main'), 'main must end with the search improvement and nothing else from the bot.'),
      onMain(state),
    ),
  hints: [
    'Do not fix the bot\'s branch: start fresh from main and take only what you reviewed and trust.',
    'git log --stat main..agent/search-rewrite shows which commits touch only apps/web/src/search.ts. Cherry-pick those two (oldest first) onto a new branch from main, then merge it.',
    'git switch -c search-improvements main, git cherry-pick agent/search-rewrite~5 agent/search-rewrite~2, git switch main, git merge search-improvements.',
  ],
  par: 4,
  takeaway: 'Treat an agent\'s branch as a pile of proposals: review every commit, cherry-pick the good ones onto a clean branch, and never merge a branch that ever held a secret.',
  danger:
    'agent/search-rewrite still holds the key. Never push it; delete it with git branch -D once you are done, and rotate the key anyway: anything that was committed may already have left the machine.',
  theory: {
    title: 'Agents in production',
    body: 'Give an agent its own branch (or worktree) per task, review its commits with git log --stat and git show, and merge only what you would accept from a human. Cherry-picking onto a branch cut from main leaves the junk behind, while merging or reverting would keep the secret reachable in history. A leaked key is compromised the moment it is committed: clean the history and rotate it.',
    lesson: 'Review per commit, cherry-pick the good, never let a secret become reachable.',
  },
  outcome: {
    summary:
      'main gains the two good search commits and nothing else from the night run: tests and lockfile untouched, and the key never reachable. That is how an agent\'s branch becomes reviewed, shippable history.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3 main',
      output: `1c91e98 fix(web): escape regex characters in search queries
60b8c03 feat(web): highlight search matches in any case
ed31945 docs(changelog): note the editor whitespace fix`,
    },
  },
  root: [...productionRepo({ remote: false }), ...AGENT_RUN],
  prelude: [],
  reference: [
    'git switch -c search-improvements main',
    'git cherry-pick agent/search-rewrite~5 agent/search-rewrite~2',
    'git switch main',
    'git merge search-improvements',
  ],
  alternatives: [
    [
      'git log --stat --oneline main..agent/search-rewrite',
      'git branch search-improvements',
      'git switch search-improvements',
      'git checkout agent/search-rewrite~2 -- apps/web/src/search.ts',
      'git commit -m "feat(web): case-insensitive, regex-safe search highlighting"',
      'git switch main',
      'git merge --no-ff search-improvements -m "Merge branch \'search-improvements\'"',
      'git branch -D agent/search-rewrite',
    ],
  ],
};

export const level9: Level = {
  id: 'agents',
  number: 9,
  title: 'Agent workflows',
  topics: 'Branch per task, worktrees, reviewing agent diffs',
  planned: 9,
  root: ROOT,
  missions: [
    branchPerTask,
    redFlags,
    keepTheGood,
    checkpoint,
    worktreePerAgent,
    committedToMain,
    houseRules,
    twoAgentsOneFile,
    cleanUpAfterTheAgent,
  ],
};

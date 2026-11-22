// Browser-only stand-in for window.gitquest so the renderer can be developed and screenshotted without Electron.
// Query flags: ?setup (first run), ?nogit (git missing), ?screen=levels (no active mission),
// ?done (mission 1.2 already solved), ?blocked (notice + 2 hints), ?graph (extra branch + lost commit to exercise the history layout),
// ?untracked (notes.txt only on disk). Voice: ?nokey (tutor needs a key), ?nospeech (no recognizer), ?denied (permission off),
// ?tutor (two spoken questions arrive at startup, so the Tutor tab fills), ?say=<words> (what the next listen() "hears").
// Lessons: ?lesson=foundations opens the mock lesson, ?lessonread marks it read with the quiz taken, ?slide=N resumes at slide N (0-based).
// GitHub (Level 11): ?nogh (gh missing), ?ghout (gh signed out), ?sandbox (the sandbox repo already exists), ?online (the open
// mission is the Level 11 one), ?ghfail (its last read from GitHub failed). Mission kinds: ?capstone (hidden checks), ?danger (danger
// warning, Undo off). ?apierror makes Undo fail (app-level error banner).
// Target card: ?expect=terminal|file|diagram picks the sample "What you should see" (terminal by default), ?nooutcome hides it.
// Topic panels: ?panels=config|remote|stash|worktrees|workflow|history (default history + three areas); ?wferror makes the
// workflow YAML invalid; ?bigrepo fills the three areas with ~25 production-like files.
import type { GitHubStatus, GitQuestApi, Lesson, LessonProgress, Transcript, TutorReply, VoiceStatus } from '../../shared/api';
import type { AreaFile, CommitView, LevelSummary, MissionOutcome, MissionView, PanelData, PanelKind, SetupStatus, WorkspaceView } from '../../shared/view-model';

const HOME = '/Users/you';
const f = (path: string, version: string, changed = false) => ({ path, version, changed });

const BASE_COMMITS: CommitView[] = [
  { hash: 'b31c4e0a9d', short: 'b31c4e0', message: 'chore: b.txt v2', author: 'Lea', parents: ['27087a91c2'], lane: 'main', refs: ['HEAD → main'], isHead: true, reachable: true, snapshot: [f('a.txt', 'v2'), f('b.txt', 'v2', true), f('app.ts', 'v1')] },
  { hash: '27087a91c2', short: '27087a9', message: 'fix: a.txt', author: 'you', parents: ['26087904ee'], lane: 'main', refs: [], isHead: false, reachable: true, snapshot: [f('a.txt', 'v2', true), f('b.txt', 'v1'), f('app.ts', 'v1')] },
  { hash: '26087904ee', short: '2608790', message: 'initial notes', author: 'Nova', parents: [], lane: 'main', refs: [], isHead: false, reachable: true, snapshot: [f('a.txt', 'v1', true), f('b.txt', 'v1', true), f('app.ts', 'v1', true)] },
];

const GRAPH_EXTRA: CommitView[] = [
  { hash: '5d02b19aaa', short: '5d02b19', message: 'feat: export rows as CSV', author: 'Samir', parents: ['2e7b801aaa'], lane: 'feature', refs: ['feature'], isHead: false, reachable: true, snapshot: [f('a.txt', 'v2'), f('b.txt', 'v2'), f('export.ts', 'csv v2', true)] },
  { hash: '2e7b801aaa', short: '2e7b801', message: 'feat: CSV header row', author: 'Samir', parents: ['b31c4e0a9d'], lane: 'feature', refs: [], isHead: false, reachable: true, snapshot: [f('a.txt', 'v2'), f('b.txt', 'v2'), f('export.ts', 'csv v1', true)] },
  { hash: '9c11d07aaa', short: '9c11d07', message: 'wip: lost idea', author: 'you', parents: ['27087a91c2'], lane: null, refs: [], isHead: false, reachable: false, snapshot: [f('a.txt', 'v2'), f('b.txt', 'draft', true), f('app.ts', 'v1')] },
];

const MISSION_TITLES: Record<string, [string, string]> = {
  '1-1': ['1.1', 'The three areas'],
  '1-2': ['1.2', 'The snapshot does not move'],
  '1-3': ['1.3', 'The commit -am trap'],
  '11-1': ['11.1', 'Open your first pull request'],
};

function mission(id: string, q: URLSearchParams): MissionView {
  const [number, title] = MISSION_TITLES[id] ?? ['1.2', 'The snapshot does not move'];
  const capstone = q.has('capstone');
  return {
    undoAllowed: !q.has('danger'),
    danger: q.has('danger') ? 'git reset --hard throws away uncommitted work for good. This is a practice repo, so nothing real is lost.' : null,
    level: id.startsWith('11-') ? { id: 'level-11', number: 11, title: 'GitHub for real' } : { id: 'foundations', number: 1, title: 'Foundations' },
    capstone,
    outcome: q.has('nooutcome') ? null : {
      summary: 'Your next commit records exactly what you staged (app.ts v2) while v3 keeps waiting on disk, so you can ship a reviewed version without losing newer work.',
      ...(capstone ? {} : { expect: EXPECTS[q.get('expect') ?? 'terminal'] ?? EXPECTS.terminal }),
    },
    panels: PANELS[q.get('panels') ?? ''] ?? ['history', 'areas'],
    ...(id.startsWith('11-') ? { online: { repo: 'you/gitquest-sandbox', checkedAt: Date.UTC(2026, 10, 22, 14, 32), error: q.has('ghfail') ? 'Could not reach github.com. Check your connection; GitQuest tries again after your next command.' : null } } : {}),
    id, number, title,
    goal: 'Commit what is staged without staging again',
    story: 'The app.ts module of Nova is ready to move to v3, but the index was prepared with v2. The CTO wants to check an intuition: a commit is a frozen snapshot of the index, not a mirror of the file on your disk.',
    checks: capstone
      ? [
          { label: 'index has v2', done: true, proof: 'git show :app.ts' },
          { label: 'Hidden check', done: false, proof: '' },
          { label: 'Hidden check', done: false, proof: '' },
        ]
      : [
          { label: 'index has v2', done: true, proof: 'git show :app.ts' },
          { label: 'commit with v2', done: false, proof: 'git show HEAD:app.ts' },
          { label: 'v3 on disk', done: true, proof: 'cat app.ts' },
        ],
    hints: [],
    hintsTotal: 3,
    blockedReason: null,
    commandsUsed: 0,
    par: 1,
    completed: null,
    theory: {
      title: 'How this works',
      body: 'A commit saves the index, not your disk. The dashed card is exactly what git commit would record right now.',
      lesson: 'Lesson 1 · The three areas',
    },
  };
}

const EXPECTS: Record<string, MissionOutcome['expect']> = {
  terminal: {
    kind: 'terminal',
    command: 'git config --show-origin --get-regexp "core\\.(editor|pager)"',
    output: 'file:.git/config  core.editor code --wait\nfile:.git/config  core.pager less -FRX',
  },
  file: { kind: 'file', path: '.git/config', content: '[core]\n\teditor = code --wait\n\tpager = less -FRX' },
  diagram: {
    kind: 'diagram',
    diagram: {
      kind: 'graph',
      commits: [
        { id: '2608790', message: 'initial notes', parents: [], lane: 'main' },
        { id: '27087a9', message: 'fix: a.txt', parents: ['2608790'], lane: 'main' },
        { id: 'b31c4e0', message: 'chore: b.txt v2', parents: ['27087a9'], lane: 'main' },
        { id: 'e4d1f02', message: 'docs: v2', parents: ['b31c4e0'], lane: 'main', refs: ['HEAD → main'] },
      ],
      head: 'e4d1f02',
      caption: 'One new commit on main whose app.ts is v2. Disk still has v3.',
    },
  },
};

const PANELS: Record<string, readonly PanelKind[]> = {
  config: ['config'],
  remote: ['history', 'remote'],
  stash: ['history', 'stash-reflog'],
  worktrees: ['history', 'worktrees'],
  workflow: ['workflow'],
  history: ['history'],
};

function panelData(q: URLSearchParams): PanelData {
  return {
    config: [
      { key: 'user.name', value: 'You', scope: 'global' },
      { key: 'user.email', value: 'you@example.com', scope: 'global' },
      { key: 'init.defaultbranch', value: 'main', scope: 'global' },
      { key: 'core.repositoryformatversion', value: '0', scope: 'local' },
      { key: 'core.bare', value: 'false', scope: 'local' },
      { key: 'user.email', value: 'you@nova.dev', scope: 'local' },
      { key: 'core.editor', value: 'code --wait', scope: 'local' },
      { key: 'core.pager', value: 'less -FRX', scope: 'local' },
      { key: 'remote.origin.url', value: 'https://git.nova.example/nova.git', scope: 'local' },
    ],
    remote: [
      { branch: 'main', local: 'b31c4e0a9d', remote: '27087a91c2', ahead: 1, behind: 0, upstream: 'origin/main' },
      { branch: 'feature', local: '5d02b19aaa', remote: '9c11d07aaa', ahead: 2, behind: 1, upstream: 'origin/feature' },
      { branch: 'hotfix', local: '27087a91c2', remote: '27087a91c2', ahead: 0, behind: 0, upstream: 'origin/hotfix' },
      { branch: 'docs', local: '26087904ee', remote: '27087a91c2', ahead: 0, behind: 1, upstream: 'origin/docs' },
      { branch: 'release', local: null, remote: 'b31c4e0a9d', ahead: 0, behind: 0, upstream: null },
      { branch: 'spike/csv', local: '2e7b801aaa', remote: null, ahead: 0, behind: 0, upstream: null },
    ],
    stashes: [
      { ref: 'stash@{0}', message: 'On main: half-done search box' },
      { ref: 'stash@{1}', message: 'WIP on feature: 5d02b19 feat: export rows as CSV' },
    ],
    reflog: [
      { short: 'b31c4e0', action: 'reset: moving to HEAD~1' },
      { short: '9c11d07', action: 'commit: wip: lost idea' },
      { short: 'b31c4e0', action: 'checkout: moving from feature to main' },
      { short: '5d02b19', action: 'commit: feat: export rows as CSV' },
      { short: '2e7b801', action: 'commit: feat: CSV header row' },
      { short: 'b31c4e0', action: 'checkout: moving from main to feature' },
      { short: 'b31c4e0', action: 'commit: chore: b.txt v2' },
      { short: '27087a9', action: 'commit: fix: a.txt' },
      { short: '2608790', action: 'commit (initial): initial notes' },
    ],
    worktrees: [
      { path: '~/GitQuest/nova', branch: 'main', isMain: true },
      { path: '~/GitQuest/nova-hotfix', branch: 'hotfix', isMain: false },
      { path: '~/GitQuest/nova-review', branch: null, isMain: false },
    ],
    workflow: q.has('wferror')
      ? { file: '.github/workflows/ci.yml', jobs: [], error: 'The YAML does not parse: All mapping items must start at the same column at line 4, column 1' }
      : {
          file: '.github/workflows/ci.yml',
          error: null,
          jobs: [
            { id: 'lint', needs: [], runsOn: 'ubuntu-latest', steps: ['actions/checkout@v4', 'npm ci', 'npm run lint'] },
            { id: 'test', needs: [], runsOn: 'ubuntu-latest', steps: ['actions/checkout@v4', 'actions/setup-node@v4', 'npm ci', 'npm test'] },
            { id: 'deploy', needs: ['lint', 'test'], runsOn: 'ubuntu-latest', steps: ['actions/checkout@v4', 'Deploy to staging'] },
          ],
        },
  };
}

/** ~25 files of a real repo: two modified, one staged, one untracked, the rest unchanged (content snippets as labels). */
function bigRepoAreas(): AreaFile[] {
  const same = (path: string, label: string): AreaFile => ({ path, disk: label, index: label, head: label });
  return [
    same('README.md', '# Nova…'),
    same('package.json', '{…'),
    same('package-lock.json', '{…'),
    same('.gitignore', 'node_modules/…'),
    same('.github/workflows/ci.yml', 'name: CI…'),
    same('apps/web/src/main.ts', "import { createApp…"),
    same('apps/web/src/App.vue', '<template>…'),
    { path: 'apps/web/src/components/SearchBox.vue', disk: '<template v3…', index: '<template v2…', head: '<template v2…' },
    same('apps/web/src/components/NoteList.vue', '<template>…'),
    same('apps/web/vite.config.ts', "import { defineConf…"),
    same('packages/sync/src/index.ts', "export * from './qu…"),
    { path: 'packages/sync/src/queue.ts', disk: 'export class Queue…', index: 'export class Queue…', head: 'export class Que…' },
    same('packages/sync/src/retry.ts', 'export function ret…'),
    { path: 'packages/sync/test/queue.test.ts', disk: "import { describe,…", index: "import { describ…", head: "import { describ…" },
    same('packages/sync/package.json', '{…'),
    same('packages/editor/src/index.ts', "export * from './ed…"),
    same('packages/editor/src/markdown.ts', 'export const render…'),
    same('packages/editor/test/markdown.test.ts', "import { describe,…"),
    same('scripts/release.mjs', '#!/usr/bin/env node…'),
    same('docs/architecture.md', '# Architecture…'),
    same('docs/CONTRIBUTING.md', '# Contributing…'),
    same('CODEOWNERS', '* @nova/core…'),
    same('tsconfig.json', '{…'),
    { path: 'notes/2026-11-22-standup.md', disk: '- sync retries…', index: null, head: null },
  ];
}

const HINTS = [
  'The commit photographs the index, even if the file on disk is already newer.',
  'The index already contains v2: a git add app.ts would overwrite that state with v3.',
  'git commit -m "docs: v2"',
];

// One full lesson (Foundations) so the Lesson screen can be developed with the mock. ?lessonread = already read, quiz taken.
const MOCK_LESSON: Lesson = {
  levelId: 'foundations',
  title: 'Snapshots and the three areas',
  summary: 'What a commit really stores, where your files live before they get there, and how to read the difference.',
  theoryOnly: ['git add -p'],
  slides: [
    {
      kind: 'concept',
      id: 'snapshots',
      title: 'A commit is a snapshot, not a diff',
      body: 'Every commit stores the full content of every tracked file at that moment. Git does not save "what changed": it saves a complete photo of the project and points back to the commit before it.\n\nFiles that did not change are not copied again. Git stores each version once and every snapshot that needs it points to the same stored copy, so snapshots stay small.\n\nWhen you ask for a diff, git compares two snapshots on the spot. That is why `git show` and `git diff` can compare any two commits, however far apart.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'initial notes', parents: [], lane: 'main' },
          { id: 'B', message: 'fix: a.txt', parents: ['A'], lane: 'main' },
          { id: 'C', message: 'chore: b.txt v2', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'C',
        caption: 'Three commits, three complete snapshots. Each one points to its parent.',
      },
      remember: 'A commit is a full photo of the project; diffs are computed when you ask for them.',
    },
    {
      kind: 'concept',
      id: 'three-areas',
      title: 'Three places a file lives',
      body: 'Your disk (the working tree) holds the files you edit. The index, also called the staging area, holds the exact versions the next commit will save. HEAD is the last commit on your current branch.\n\nThe same file can have three different versions at once. Here `app.ts` is v3 on disk, v2 in the index and v1 in HEAD.\n\n`notes.txt` exists only on disk: git calls it untracked until you `git add` it.',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' },
          { path: 'notes.txt', disk: 'draft', index: null, head: null },
        ],
      },
      remember: '`git add` copies disk to the index; `git commit` turns the index into a commit.',
    },
    {
      kind: 'concept',
      id: 'commit-saves-index',
      title: 'A commit saves the index, not your disk',
      body: '`git commit` never looks at your disk. It takes whatever the index holds and freezes it into a new snapshot.\n\nSo if you edit a file after `git add`, the commit still records the staged version. Your newer edits stay on disk, waiting for the next `git add`.',
      diagram: {
        kind: 'before-after',
        command: 'git commit -m "app: v2"',
        before: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' }] },
        after: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v2' }] },
        caption: 'HEAD catches up with the index. Disk keeps v3.',
      },
      remember: 'What you staged is what you commit.',
    },
    {
      kind: 'concept',
      id: 'head-moves',
      title: 'HEAD points at a branch, the branch at a commit',
      body: 'A branch is a label holding one commit id. HEAD usually points at a branch, which is how git knows where you are.\n\nWhen you commit, git writes the new snapshot with the current commit as its parent, then moves the branch label to it. HEAD follows because it points at the branch, not at the commit.',
      diagram: {
        kind: 'before-after',
        command: 'git commit',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'initial notes', parents: [], lane: 'main' },
            { id: 'B', message: 'fix: a.txt', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'B',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'initial notes', parents: [], lane: 'main' },
            { id: 'B', message: 'fix: a.txt', parents: ['A'], lane: 'main' },
            { id: 'C', message: 'app: v2', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'C',
        },
      },
      remember: 'Committing moves the current branch forward; HEAD rides along.',
    },
    {
      kind: 'concept',
      id: 'round-trip',
      title: 'Moving files forward and back',
      body: 'Each step forward has a matching step back. `git add` and `git commit` move a version towards history; `git restore` and `git restore --staged` bring one back.\n\n`git restore --staged` copies HEAD into the index and leaves your disk alone. Plain `git restore` copies the index onto your disk and overwrites your edits.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'disk', label: 'Disk', detail: 'the files you edit' },
          { id: 'index', label: 'Index', detail: 'the next commit' },
          { id: 'head', label: 'HEAD', detail: 'the last commit' },
        ],
        edges: [
          { from: 'disk', to: 'index', label: 'git add' },
          { from: 'index', to: 'disk', label: 'git restore' },
          { from: 'index', to: 'head', label: 'git commit' },
          { from: 'head', to: 'index', label: 'restore --staged' },
        ],
      },
      remember: 'Forward with add and commit; back with restore --staged and restore.',
    },
    {
      kind: 'concept',
      id: 'reading-diffs',
      title: 'Reading a diff',
      body: '`git diff` compares disk with the index: what you have not staged yet. `git diff --staged` compares the index with HEAD: what the next commit will add.\n\nLines starting with `-` are in the old version only, lines starting with `+` in the new one. The `@@` header says where in the file the change sits.',
      diagram: {
        kind: 'code',
        title: 'git diff --staged',
        text: 'diff --git a/app.ts b/app.ts\nindex 3b18e51..a4c2f09 100644\n--- a/app.ts\n+++ b/app.ts\n@@ -1,3 +1,3 @@\n export const version =\n-  "v1";\n+  "v2";\n export default version;',
      },
      remember: 'No output from `git diff` only means disk matches the index.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Commands for this level',
      rows: [
        { command: 'git status', does: 'Which files differ between disk, index and HEAD.' },
        { command: 'git add <file>', does: 'Copy the file from disk into the index.' },
        { command: 'git add -p', does: 'Stage part of a file, one change at a time.' },
        { command: 'git commit -m "msg"', does: 'Save the index as a new commit.' },
        { command: 'git commit -am "msg"', does: 'Stage every tracked file, then commit. Skips untracked files.' },
        { command: 'git diff', does: 'Disk compared with the index.' },
        { command: 'git diff --staged', does: 'Index compared with HEAD.' },
        { command: 'git show HEAD:app.ts', does: 'A file as the last commit saved it.' },
        { command: 'git restore --staged <file>', does: 'Unstage: copy HEAD back into the index.' },
        { command: 'git restore <file>', does: 'Throw away disk edits: copy the index onto disk.', danger: true },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Common mistakes',
      items: [
        { mistake: 'Edited a file after `git add`, then committed and the new edits are missing.', fix: 'The commit took the staged version. Run `git add` again and make another commit.' },
        { mistake: '`git commit -am` left a new file out.', fix: '`-a` only stages files git already tracks. `git add` the new file first.' },
        { mistake: 'Staged the wrong file.', fix: '`git restore --staged <file>` unstages it and keeps your edits on disk.' },
        { mistake: 'Ran `git restore <file>` to unstage and lost your edits.', fix: 'Plain restore overwrites disk and cannot be undone. Use `--staged`, or `git stash` first when unsure.' },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-commit-index',
      question: 'You run `git commit -m "save"`. Which version of app.ts does the new commit hold?',
      diagram: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' }] },
      options: [
        { id: 'v1', text: 'v1, the version already in HEAD' },
        { id: 'v2', text: 'v2, the version in the index' },
        { id: 'v3', text: 'v3, the version on disk' },
      ],
      correct: 'v2',
      explanation: 'A commit saves the index. v3 stays on disk, uncommitted, until you `git add` it.',
    },
    {
      id: 'q-am',
      question: 'app.ts is modified and notes.txt is new and untracked. What does `git commit -am "update"` save?',
      options: [
        { id: 'both', text: 'Both files' },
        { id: 'app', text: 'Only the change to app.ts' },
        { id: 'none', text: 'Nothing: it fails without git add' },
      ],
      correct: 'app',
      explanation: '`-a` stages files git already tracks. notes.txt is untracked, so it stays out until you `git add` it.',
    },
    {
      id: 'q-diff-empty',
      question: '`git diff` prints nothing, yet `git status` lists app.ts under "Changes to be committed". Why?',
      options: [
        { id: 'staged', text: 'The change is staged; `git diff` only compares disk with the index' },
        { id: 'broken', text: 'The diff failed silently' },
        { id: 'committed', text: 'The change was already committed' },
        { id: 'ignored', text: 'app.ts is listed in .gitignore' },
      ],
      correct: 'staged',
      explanation: 'Disk and index match, so `git diff` is empty. `git diff --staged` shows the staged change against HEAD.',
    },
    {
      id: 'q-head-moves',
      question: 'You make a commit on main. What moves?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'initial notes', parents: [], lane: 'main' },
          { id: 'B', message: 'fix: a.txt', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'B',
      },
      options: [
        { id: 'head-only', text: 'Only HEAD moves; main stays on B' },
        { id: 'main', text: 'main moves to the new commit and HEAD follows it' },
        { id: 'nothing', text: 'Nothing moves until you push' },
      ],
      correct: 'main',
      explanation: 'HEAD points at main, and committing moves the current branch. HEAD follows because it points at the branch.',
    },
    {
      id: 'q-unstage',
      question: 'You staged app.ts by mistake. Which command unstages it and keeps your edits?',
      options: [
        { id: 'restore', text: '`git restore app.ts`' },
        { id: 'staged', text: '`git restore --staged app.ts`' },
        { id: 'rm', text: '`git rm app.ts`' },
      ],
      correct: 'staged',
      explanation: '`--staged` copies HEAD into the index only. Plain `git restore` overwrites your disk edits, and `git rm` deletes the file.',
    },
    {
      id: 'q-snapshot',
      question: 'You change only app.ts and commit. What does the new commit contain?',
      options: [
        { id: 'diff', text: 'Just the lines that changed in app.ts' },
        { id: 'file', text: 'Only app.ts' },
        { id: 'all', text: 'A snapshot of every tracked file, unchanged ones shared with the parent' },
      ],
      correct: 'all',
      explanation: 'Every commit is a full snapshot. Unchanged files point to the copy git already stored, so nothing is duplicated.',
    },
  ],
};

const NO_LESSON: LevelSummary['lesson'] = { slides: 0, read: false, quizScore: null, quizTotal: 0 };

function levels(): LevelSummary[] {
  const m = (id: string, state: 'done' | 'current' | 'todo', stars: 0 | 1 | 2 | 3) => {
    const [number, title] = MISSION_TITLES[id]!;
    return { id, number, title, state, stars };
  };
  const lv = (number: number, title: string, topics: string, planned: number, suggestedOrder: number | null, warning?: string): LevelSummary =>
    ({ id: `level-${number}`, number, title, topics, missions: [], planned, done: 0, suggestedOrder, ...(warning ? { warning } : {}), lesson: NO_LESSON });
  return [
    { ...lv(0, 'Setup', 'Install, git config, SSH keys and tokens', 3, 0), done: 3 },
    { ...lv(1, 'Foundations', 'Three areas, commits, HEAD, reading diffs', 9, 1), id: 'foundations', done: 1, missions: [m('1-1', 'done', 3), m('1-2', 'current', 0), m('1-3', 'todo', 0)] },
    lv(2, 'Branches and conflicts', 'switch, merge, conflict markers', 8, 4),
    { ...lv(3, 'Remotes and syncing', 'fetch, pull, push, ahead and behind', 7, 2), lesson: { slides: 9, read: true, quizScore: 6, quizTotal: 7 } },
    lv(4, 'Undo and recovery', 'restore, reset, revert, stash, reflog', 8, 3, 'can lose work, practice repo only'),
    lv(5, 'Rewriting history', 'rebase -i, cherry-pick, bisect, tags', 8, null),
    lv(6, 'Advanced and internals', 'Hooks, objects, submodules, LFS', 7, null),
    lv(7, 'GitHub and pull requests', 'PRs, reviews, branch protection', 9, 5),
    lv(8, 'Team workflows', 'GitHub Flow, Conventional Commits, releases', 5, null),
    lv(9, 'Agent workflows', 'Branch per task, worktrees, reviewing agent diffs', 6, 6),
    { ...lv(11, 'GitHub for real', 'Pull requests, Actions, issues and releases on github.com', 6, null), id: 'level-11', online: true, missions: [m('11-1', 'todo', 0)] },
  ];
}

export function createMockApi(q: URLSearchParams): GitQuestApi {
  let status: SetupStatus = {
    gitVersion: q.has('nogit') ? null : '2.50.1',
    sandboxReady: !q.has('setup'),
    repoReady: !q.has('setup'),
    path: q.has('setup') ? null : 'agents',
    paths: { root: `${HOME}/GitQuest`, repo: `${HOME}/GitQuest/nova`, data: `${HOME}/.gitquest` },
    pathLabels: { root: '~/GitQuest', repo: '~/GitQuest/nova', data: '~/.gitquest' },
  };
  let view: WorkspaceView = {
    repoPath: `${HOME}/GitQuest/nova`,
    repoLabel: '~/GitQuest/nova',
    gitVersion: status.gitVersion,
    mission: q.get('screen') === 'levels' ? null
      : q.has('online') ? mission('11-1', q)
      : q.has('blocked') ? { ...mission('1-2', q), hints: HINTS.slice(0, 2), blockedReason: 'HEAD still has app.ts v1: the commit has not been made yet.' }
      : mission('1-2', q),
    commits: q.has('graph') ? [...GRAPH_EXTRA, ...BASE_COMMITS] : BASE_COMMITS,
    nextCommit: [f('a.txt', 'v2'), f('b.txt', 'v2'), f('app.ts', 'v2', true)],
    branches: [{ name: 'main', hash: 'b31c4e0a9d', current: true }],
    headBranch: 'main',
    panelData: panelData(q),
    areas: q.has('bigrepo') ? bigRepoAreas() : [
      { path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' },
      { path: 'a.txt', disk: 'v2', index: 'v2', head: 'v2' },
      { path: 'b.txt', disk: 'v2', index: 'v2', head: 'v2' },
      ...(q.has('untracked') ? [{ path: 'notes.txt', disk: 'draft', index: null, head: null }] : []),
    ],
    levels: levels(),
    lastCommand: null,
  };
  const viewListeners = new Set<(v: WorkspaceView) => void>();
  const termListeners = new Set<(d: string) => void>();
  const push = (patch: Partial<WorkspaceView>): void => {
    view = { ...view, ...patch };
    for (const l of viewListeners) l(view);
  };
  // Lesson progress (same rules as lessonSummary in src/game/view.ts); only Foundations has a mock lesson.
  const lessonProgress: Record<string, LessonProgress> = q.has('lessonread')
    ? { foundations: { slide: MOCK_LESSON.slides.length - 1, read: true, quiz: Object.fromEntries(MOCK_LESSON.quiz.map((x, i) => [x.id, i === 0 ? 'v3' : x.correct])) } }
    : q.has('slide') ? { [q.get('lesson') ?? 'foundations']: { slide: Number(q.get('slide')), read: false, quiz: {} } } : {};
  const withLessons = (list: readonly LevelSummary[]): LevelSummary[] =>
    list.map((l) => {
      if (l.id !== 'foundations') return l;
      const saved = lessonProgress[l.id];
      const answered = MOCK_LESSON.quiz.filter((x) => saved?.quiz[x.id] !== undefined);
      const slides = MOCK_LESSON.slides.length;
      return { ...l, lesson: {
        slides,
        read: saved?.read === true || answered.length > 0,
        quizScore: answered.length === MOCK_LESSON.quiz.length ? answered.filter((x) => saved?.quiz[x.id] === x.correct).length : null,
        quizTotal: MOCK_LESSON.quiz.length,
      } };
    });
  view = { ...view, levels: withLessons(view.levels) };
  const pushLessons = (): void => push({ levels: withLessons(view.levels) });
  const out = (d: string): void => { for (const l of termListeners) l(d); };
  const prompt = (): void => out('\x1b[90mnova (main) %\x1b[0m ');

  const commit = (cmd: string): void => {
    const m = view.mission;
    const newCommit: CommitView = {
      hash: 'e4d1f02bbb', short: 'e4d1f02', message: 'docs: v2', author: 'you', parents: [view.commits.find((c) => c.isHead)?.hash ?? ''],
      lane: 'main', refs: ['HEAD → main'], isHead: true, reachable: true, snapshot: [f('a.txt', 'v2'), f('b.txt', 'v2'), f('app.ts', 'v2', true)],
    };
    push({
      lastCommand: cmd,
      commits: [newCommit, ...view.commits.map((c) => ({ ...c, isHead: false, refs: c.refs.filter((r) => !r.startsWith('HEAD')) }))],
      nextCommit: null,
      areas: view.areas.map((a) => (a.path === 'app.ts' ? { ...a, head: 'v2' } : a)),
      mission: m && {
        ...m,
        checks: m.checks.map((c) => ({ ...c, done: true })),
        commandsUsed: m.commandsUsed + 1,
        completed: { stars: m.commandsUsed + 1 <= m.par ? 3 : 2, used: m.commandsUsed + 1, takeaway: 'The commit takes the snapshot of the index, not of the disk. v3 is still there, uncommitted.', next: '1-3' },
      },
    });
  };
  if (q.has('done')) commit('git commit -m "docs: v2"');

  let line = '';
  const run = (cmd: string): void => {
    if (cmd === 'git log --oneline') {
      for (const c of view.commits) out(`\x1b[33m${c.short}\x1b[0m ${c.refs.length ? `(\x1b[34m${c.refs.join(', ').replace('→', '->')}\x1b[0m) ` : ''}${c.message}\r\n`);
    } else if (cmd === 'git status -s' || cmd === 'git status') {
      out(view.nextCommit ? '\x1b[32mM\x1b[31mM\x1b[0m app.ts\r\n' : ' \x1b[31mM\x1b[0m app.ts\r\n');
    } else if (cmd.startsWith('git commit')) {
      out('[main e4d1f02] docs: v2\r\n 1 file changed, 1 insertion(+), 1 deletion(-)\r\n');
      commit(cmd);
    } else if (cmd) {
      out(`(mock terminal) ${cmd}\r\n`);
      push({ lastCommand: cmd });
    }
    prompt();
  };

  let voiceStatus: VoiceStatus = {
    speech: q.has('nospeech') ? 'unavailable' : q.has('denied') ? 'denied' : 'ready',
    tutor: q.has('nokey') ? 'needs-key' : 'ready',
    tutorBackend: q.has('nokey') ? null : 'claude-code',
    tutorChoices: q.has('nokey') ? [] : ['claude-code', 'codex'],
    tutorPreference: 'auto',
  };
  const transcriptListeners = new Set<(t: Transcript) => void>();
  const hear = (t: Transcript): void => { for (const l of transcriptListeners) l(t); };
  const phrases = [q.get('say') ?? 'git add app dot ts', 'why does the commit keep v2 when the file says v3'];
  let heard = 0;
  let listenTimer: ReturnType<typeof setInterval> | undefined;
  let phrase = '';
  const finish = (): void => {
    clearInterval(listenTimer);
    listenTimer = undefined;
    hear({ text: phrase, final: true });
  };
  const replies: Record<string, TutorReply> = {
    why: { text: 'A commit records the index, and the index still holds v2. Your disk copy is v3, but git only looks at disk when you run git add.', command: null },
    how: { text: 'Commit what is already staged, without adding again. That keeps v2 in the snapshot.', command: 'git commit -m "docs: v2"' },
  };
  if (q.has('tutor')) {
    const say = (text: string, at: number) => setTimeout(() => hear({ text, final: true }), at);
    say('why does the commit keep v2 when the file says v3', 300);
    say('how do I commit it without staging again', 1300);
  }

  const signedIn = !q.has('nogh') && !q.has('ghout');
  let github: GitHubStatus = {
    installed: !q.has('nogh'),
    loggedIn: signedIn,
    login: signedIn ? 'you' : null,
    repo: signedIn ? 'you/gitquest-sandbox' : null,
    sandbox: !signedIn ? 'unknown' : q.has('sandbox') ? 'exists' : 'missing',
    url: q.has('sandbox') ? 'https://github.com/you/gitquest-sandbox' : null,
    missingScopes: ['delete_repo'],
    message: null,
  };

  return {
    github: {
      status: async () => github,
      createSandbox: async () => {
        await new Promise((r) => setTimeout(r, 600));
        github = { ...github, sandbox: 'exists', url: 'https://github.com/you/gitquest-sandbox' };
        return github;
      },
      deleteSandbox: async () => {
        throw new Error('Deleting a repo needs the delete_repo permission, which gh does not have yet. In Terminal run: gh auth refresh -h github.com -s delete_repo, then press Delete sandbox again.');
      },
      refresh: async () => {},
    },
    voice: {
      setTutorBackend: async (preference) => {
        voiceStatus = { ...voiceStatus, tutorPreference: preference, tutorBackend: preference === 'auto' ? voiceStatus.tutorChoices[0] ?? null : preference };
        return voiceStatus;
      },
      status: async () => voiceStatus,
      listen: async () => {
        if (voiceStatus.speech === 'denied' || voiceStatus.speech === 'unavailable') return voiceStatus;
        const words = phrases[heard++ % phrases.length]!.split(' ');
        let n = 0;
        phrase = '';
        listenTimer = setInterval(() => {
          phrase = words.slice(0, ++n).join(' ');
          hear({ text: phrase, final: false });
          if (n >= words.length + 6) finish(); // ~1.5 s of silence ends it, like the recognizer
        }, 250);
        return voiceStatus;
      },
      stopListening: async () => { if (listenTimer) finish(); },
      onTranscript: (l) => { transcriptListeners.add(l); return () => transcriptListeners.delete(l); },
      ask: async (question) => {
        await new Promise((r) => setTimeout(r, 600));
        if (voiceStatus.tutor === 'needs-key') throw new Error('Add a Claude API key in Voice settings to use the tutor.');
        if (q.has('tutorfail')) throw new Error('The tutor could not be reached. Check your internet connection and try again.');
        return /^how/i.test(question) ? replies.how! : replies.why!;
      },
      setApiKey: async (key) => {
        await new Promise((r) => setTimeout(r, 300));
        if (!key.trim().startsWith('sk-ant-')) throw new Error('That does not look like a Claude API key. Keys start with sk-ant-.');
        voiceStatus = { ...voiceStatus, tutor: 'ready' };
        return voiceStatus;
      },
      clearApiKey: async () => {
        voiceStatus = { ...voiceStatus, tutor: 'needs-key' };
        return voiceStatus;
      },
      // ?natural shows the downloaded state; the browser preview never makes sound with it (read-aloud uses window.gitquest).
      natural: {
        status: async () => ({ state: q.has('natural') ? 'ready' : 'not-downloaded', progress: null, error: null }),
        download: async () => ({ state: 'downloading', progress: 0.42, error: null }),
        speak: async () => { throw new Error('No natural voice in the browser preview.'); },
        cancel: async () => {},
        onChunk: () => () => {},
        onStatus: () => () => {},
      },
    },
    lessons: {
      // ?real = the real lesson content (layout checks across every slide).
      get: async (levelId) => ({
        lesson: q.has('real') ? ((await import('../../game/lessons')).lessonFor(levelId) ?? MOCK_LESSON) : { ...MOCK_LESSON, levelId },
        progress: lessonProgress[levelId] ?? { slide: 0, read: false, quiz: {} },
      }),
      setSlide: async (levelId, index) => {
        const saved = lessonProgress[levelId] ?? { slide: 0, read: false, quiz: {} };
        lessonProgress[levelId] = { ...saved, slide: index, read: saved.read || index === MOCK_LESSON.slides.length - 1 };
        pushLessons();
      },
      answer: async (levelId, questionId, optionId) => {
        const saved = lessonProgress[levelId] ?? { slide: 0, read: false, quiz: {} };
        lessonProgress[levelId] = { ...saved, quiz: { ...saved.quiz, [questionId]: optionId } };
        pushLessons();
        return { correct: MOCK_LESSON.quiz.find((x) => x.id === questionId)?.correct === optionId };
      },
    },
    getView: async () => view,
    onView: (l) => { viewListeners.add(l); return () => viewListeners.delete(l); },
    setupStatus: async () => status,
    runSetup: async (path) => {
      await new Promise((r) => setTimeout(r, 400));
      status = { ...status, sandboxReady: true, repoReady: true, path };
      return status;
    },
    startMission: async (id) => {
      push({ mission: mission(id, q), levels: view.levels.map((lv) => ({ ...lv, missions: lv.missions.map((m) => ({ ...m, state: m.id === id ? 'current' : m.state === 'current' ? 'todo' : m.state })) })) });
    },
    hint: async () => {
      const m = view.mission;
      if (m && m.hints.length < m.hintsTotal) push({ mission: { ...m, hints: HINTS.slice(0, m.hints.length + 1) } });
    },
    undo: async () => {
      if (q.has('apierror')) throw new Error('Undo failed: the practice repo is locked by another git process. Wait a moment and try again.');
    },
    restart: async () => { if (view.mission) push({ mission: mission(view.mission.id, q) }); },
    terminal: {
      write: (d) => {
        for (const ch of d) {
          if (ch === '\r') { out('\r\n'); run(line.trim()); line = ''; }
          else if (ch === '\x15') { out('\b \b'.repeat(line.length)); line = ''; }
          else if (ch === '\x7f') { if (line) { line = line.slice(0, -1); out('\b \b'); } }
          else if (ch >= ' ') { line += ch; out(ch); }
        }
      },
      resize: () => {},
      onData: (l) => {
        termListeners.add(l);
        if (termListeners.size === 1) {
          setTimeout(() => {
            out('\x1b[90mnova (main) %\x1b[0m git log --oneline\r\n');
            run('git log --oneline');
          }, 0);
        }
        return () => termListeners.delete(l);
      },
    },
  };
}

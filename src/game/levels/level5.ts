/**
 * Level 5 — Rewriting history: rebase, conflicts mid-rebase, autosquash, cherry-pick, moving commits,
 * log -S / blame, bisect, annotated tags. One story arc: the feature/search branch, then main's history.
 */
import { allOf, check, isWorkingTreeClean, headBranch, snapshotOf } from '../validate';

import type { Commit, FileTree, RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';
import { NOVA_FILES, REGRESSION_SUBJECT, introduceRegression, productionRepo } from '../production';

// Story file contents ------------------------------------------------------

const FILES = {
  readme0: '# Nova notes',
  readme1: '# Nova notes. Install: npm i',
  readmeSearch: '# Nova notes. Install: npm i. Search: Cmd+F',
  readmeCi: '# Nova notes. Install: npm ci',
  search1: 'export const search = (q) => notes.filter((n) => n.includes(q));',
  search2: 'export const search = (q) => notes.filter((n) => n.toLowerCase().includes(q.toLowerCase()));',
  typo: 'placeholder: Serach notes',
  fixed: 'placeholder: Search notes',
  notes0: 'export const notes = [];',
  notesFix: 'export const notes = []; // guard: skip notes with an empty title',
  export1: 'export const toMarkdown = (note) => note.body;',
  export2: 'export const toMarkdown = (note) => note.body;\nexport const toPdf = (note) => render(note.body);',
  syncLine: 'sync=every 5 min',
  goodLimit: 'max_notes=500',
  autoTypo: 'export const suggest = (q) => tags.fliter((t) => t.startsWith(q));',
  auto: 'export const suggest = (q) => tags.filter((t) => t.startsWith(q));',
  autoTest: "test('suggests tags by prefix');",
  autoInes: 'export const suggest = (q) => tags.filter((t) => t.includes(q)); // Ines',
} as const;

const FIX_SUBJECT = 'fix: crash on empty title';

// Level-specific helpers ---------------------------------------------------

function tip(state: RepoState, branch: string): string | undefined {
  return state.branches[branch];
}

function subject(commit: Commit | undefined): string {
  return (commit?.message ?? '').split('\n')[0]!.trim();
}

function isAncestor(state: RepoState, ancestor: string | undefined, descendant: string | undefined): boolean {
  if (ancestor === undefined || descendant === undefined) return false;
  const seen = new Set<string>();
  const queue = [descendant];
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    queue.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
}

/** Commits from `from` back to `base` (excluded), newest first, if that path is a straight line; else undefined. */
function lineSince(state: RepoState, from: string | undefined, base: string | undefined): Commit[] | undefined {
  const chain: Commit[] = [];
  let hash = from;
  while (hash !== undefined && hash !== base) {
    const commit = state.commits[hash];
    if (commit === undefined || commit.parents.length !== 1) return undefined;
    chain.push(commit);
    hash = commit.parents[0];
  }
  return hash === base && base !== undefined ? chain : undefined;
}

/** Most recent commit on `from`'s first-parent line where `has` becomes true (its parent lacks it). */
function introducer(state: RepoState, from: string | undefined, has: (tree: FileTree) => boolean): string | undefined {
  let hash = from;
  while (hash !== undefined) {
    const commit = state.commits[hash];
    if (commit === undefined) return undefined;
    const parent = commit.parents[0];
    if (has(commit.snapshot) && !has(snapshotOf(state, parent))) return hash;
    hash = parent;
  }
  return undefined;
}

function tagOf(ctx: MissionContext, name: string) {
  return ctx.facts.tags.find((tag) => tag.name === name);
}

function ran(ctx: MissionContext, pattern: RegExp): boolean {
  return ctx.commands.some((typed) => typed.exitCode === 0 && pattern.test(typed.command.trim()));
}

const notBusy = (ctx: MissionContext) =>
  check(
    ctx.facts.inProgress === null,
    `A ${ctx.facts.inProgress ?? 'git'} is still in progress. Finish it (--continue) or cancel it (--abort) first.`,
  );

/** feature/search replayed on top of main: linear, made of new commits only. */
function rebasedFeature(state: RepoState, ctx: MissionContext): Commit[] | undefined {
  const chain = lineSince(state, tip(state, 'feature/search'), tip(state, 'main'));
  return chain !== undefined && chain.length > 0 && chain.every((c) => !ctx.entryCommits.has(c.hash)) ? chain : undefined;
}

function rebaseChecks(state: RepoState, ctx: MissionContext) {
  const main = tip(state, 'main');
  const feature = tip(state, 'feature/search');
  return allOf(
    notBusy(ctx),
    check(feature !== undefined, 'The branch feature/search is missing.'),
    check(isAncestor(state, main, feature), 'feature/search does not contain the latest main yet. Run git rebase main on it.'),
    check(
      lineSince(state, feature, main) !== undefined,
      'feature/search contains a merge commit. Rebase instead of merging, so the history stays a straight line.',
    ),
    check(rebasedFeature(state, ctx) !== undefined, 'Your feature commits must be replayed on top of main as new commits.'),
    check(snapshotOf(state, feature)['search.ts'] === FILES.search2, 'feature/search lost its search.ts changes.'),
  );
}

// Missions -----------------------------------------------------------------

const replayOnTop: Mission = {
  id: 'replay-on-top',
  number: '5.1',
  title: 'Replay on top',
  story:
    'You built search on feature/search while Lea added install steps to main. The team keeps history linear: no merge commits for a small feature branch. Replay your work on top of the new main.',
  goal: 'Rebase feature/search onto main so it starts from Lea\'s latest commit, with no merge commit.',
  checks: [
    {
      label: 'feature/search contains the latest main',
      proof: 'git log --oneline --graph --all',
      done: (state) => isAncestor(state, tip(state, 'main'), tip(state, 'feature/search')),
    },
    {
      label: 'History is a straight line, no merge commit',
      proof: 'git log --oneline --graph',
      done: (state) => lineSince(state, tip(state, 'feature/search'), tip(state, 'main')) !== undefined,
    },
    {
      label: 'Your two commits were replayed with new hashes',
      proof: 'git log --oneline main..feature/search',
      done: (state, ctx) => (rebasedFeature(state, ctx)?.length ?? 0) >= 2,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      rebaseChecks(state, ctx),
      check(snapshotOf(state, tip(state, 'feature/search'))['README.md'] === FILES.readme1, "feature/search must include Lea's README."),
    ),
  hints: [
    'Instead of merging main into your branch, move your branch so it starts from the tip of main.',
    'Stay on feature/search and rebase it onto main. Compare git log --oneline before and after: the hashes change.',
    'git rebase main, then git log --oneline --graph --all.',
  ],
  par: 1,
  takeaway: 'git rebase main replays your commits on top of main as brand-new commits: same changes, new hashes, a straight history.',
  theory: {
    title: 'Rebase replays commits',
    body: 'git rebase main takes the commits that are on your branch but not on main and replays them one by one on top of main. Each replayed commit is a new commit with a new hash, so the old ones disappear from the branch. Only rebase commits nobody else has pulled yet.',
    lesson: 'Rebase = replay your commits on a new base; it rewrites their hashes.',
  },
  outcome: {
    summary:
      'feature/search starts from Lea\'s latest commit, in one straight line with no merge commit. A linear history reviewers can read top to bottom.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'before-after',
        command: 'git rebase main',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'feature' },
            { id: 'S2', message: 'feat: search ignores case', parents: ['S1'], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'S2',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1\'', message: 'feat: search', parents: ['L'], lane: 'feature' },
            { id: 'S2\'', message: 'feat: search ignores case', parents: ['S1\''], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'S2\'',
        },
        caption: 'Your two commits now start from Lea\'s docs: install steps, in one straight line.',
      },
    },
  },
  prelude: [
    {
      id: 'm5.1-p1',
      commands: [
        'git switch -c feature/search',
        `edit search.ts "${FILES.search1}"`,
        `edit searchbar.txt "${FILES.typo}"`,
        'git add search.ts searchbar.txt',
        'git commit -m "feat: search"',
        `edit search.ts "${FILES.search2}"`,
        'git commit -am "feat: search ignores case"',
      ],
    },
    {
      id: 'm5.1-p2',
      teammate: 'lea',
      commands: ['git switch main', `edit README.md "${FILES.readme1}"`, 'git commit -am "docs: install steps"'],
    },
    { id: 'm5.1-p3', commands: ['git switch feature/search'] },
  ],
  reference: ['git rebase main'],
  alternatives: [['git rebase main feature/search', 'git log --oneline --graph --all']],
};

const conflictMidRebase: Mission = {
  id: 'conflict-mid-rebase',
  number: '5.2',
  title: 'Conflict mid-rebase',
  story:
    'You documented the search shortcut in the README, and meanwhile Samir switched the install command to npm ci on main. Both edits touch the same line, so the rebase will stop halfway. Keep both changes.',
  goal: 'Rebase feature/search onto main again, resolving the README conflict so it keeps npm ci and the search shortcut.',
  checks: [
    {
      label: 'feature/search sits on top of the latest main',
      proof: 'git log --oneline --graph --all',
      done: (state, ctx) =>
        ctx.facts.inProgress === null && isAncestor(state, tip(state, 'main'), tip(state, 'feature/search')),
    },
    {
      label: 'README keeps npm ci and the search shortcut',
      proof: 'git show feature/search:README.md',
      done: (state) => readmeResolved(snapshotOf(state, tip(state, 'feature/search'))['README.md']),
    },
    {
      label: 'Rebase finished, straight history',
      proof: 'git status',
      done: (state, ctx) => ctx.facts.inProgress === null && rebasedFeature(state, ctx) !== undefined,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      rebaseChecks(state, ctx),
      check(
        readmeResolved(snapshotOf(state, tip(state, 'feature/search'))['README.md']),
        'README.md on feature/search must contain both "npm ci" and "Search: Cmd+F", with no conflict markers.',
      ),
      check(isWorkingTreeClean(state), 'Commit or clean up the remaining changes: the working tree must be clean.'),
    ),
  hints: [
    'Start the same rebase as before. When Git stops on a conflict, fix the file, then tell the rebase to go on.',
    'Edit README.md so the line has npm ci and Search: Cmd+F and no <<<<<<< ======= >>>>>>> markers, git add it, then continue. git rebase --abort would put everything back as it was.',
    'git rebase main, nano README.md (write "# Nova notes. Install: npm ci. Search: Cmd+F"), git add README.md, git rebase --continue (in nano, Ctrl+X keeps the message).',
  ],
  par: 4,
  takeaway: 'A rebase pauses on each conflicting commit: fix the file, git add it, git rebase --continue; git rebase --abort cancels the whole thing.',
  theory: {
    title: 'Conflicts during a rebase',
    body: 'A rebase replays commits one at a time, so a conflict stops it in the middle with HEAD detached. You resolve the file exactly like a merge conflict, stage it, and run git rebase --continue to replay the rest. If you get lost, git rebase --abort brings the branch back to where it was before.',
    lesson: 'Resolve, git add, git rebase --continue (or --abort to bail out).',
  },
  outcome: {
    summary:
      'The rebase is finished and README.md keeps both Samir\'s npm ci and your search shortcut. The conflict is resolved inside the commit that caused it.',
    expect: { kind: 'file', path: 'README.md', content: '# Nova notes. Install: npm ci. Search: Cmd+F' },
  },
  prelude: [
    {
      id: 'm5.2-p1',
      commands: [`edit README.md "${FILES.readmeSearch}"`, 'git commit -am "docs: search shortcut"'],
    },
    {
      id: 'm5.2-p2',
      teammate: 'samir',
      commands: ['git switch main', `edit README.md "${FILES.readmeCi}"`, 'git commit -am "docs: use npm ci"'],
    },
    { id: 'm5.2-p3', commands: ['git switch feature/search'] },
  ],
  reference: [
    'git! rebase main',
    'edit README.md "# Nova notes. Install: npm ci. Search: Cmd+F"',
    'git add README.md',
    'GIT_EDITOR=true git rebase --continue',
  ],
  alternatives: [
    [
      'git! rebase main',
      'edit README.md "# Nova notes. Install: npm ci\nSearch: Cmd+F"',
      'git add README.md',
      'git rebase --continue',
    ],
    // Takes main's line for the conflict (-X ours = upstream during a rebase), which drops the docs commit; recommit it.
    [
      'git rebase -X ours main',
      'edit README.md "# Nova notes. Install: npm ci\nSearch: Cmd+F"',
      'git commit -am "docs: search shortcut"',
    ],
  ],
};

function readmeResolved(readme: string | undefined): boolean {
  return (
    readme !== undefined &&
    readme.includes('npm ci') &&
    readme.includes('Search: Cmd+F') &&
    !/^(<<<<<<<|=======|>>>>>>>)/m.test(readme)
  );
}

/** Commits of feature/search (since main) that contain searchbar.txt, oldest first. */
function searchbarCommits(state: RepoState): Commit[] {
  const chain = lineSince(state, tip(state, 'feature/search'), tip(state, 'main')) ?? [];
  return chain.filter((c) => c.snapshot['searchbar.txt'] !== undefined).reverse();
}

const fixupsLater: Mission = {
  id: 'fixups-later',
  number: '5.3',
  title: 'Fixups later',
  story:
    'Ines spotted a typo in the search bar placeholder ("Serach") that came from your first commit, feat: search. You already fixed the file. Before review, fold that fix into the original commit so the typo never appears in the branch history.',
  goal: 'Squash the typo fix into the feat: search commit, so no commit of feature/search contains "Serach".',
  checks: [
    {
      label: 'The commit that adds searchbar.txt has it right',
      proof: 'git log --oneline -p main..feature/search -- searchbar.txt',
      done: (state) => searchbarCommits(state)[0]?.snapshot['searchbar.txt'] === FILES.fixed,
    },
    {
      label: 'No typo and no fixup! commit left in the branch',
      proof: 'git log --oneline main..feature/search',
      done: (state) => noTypoNoFixup(state),
    },
    {
      label: 'Branch tip has the fix, working tree clean',
      proof: 'git status',
      done: (state) =>
        snapshotOf(state, tip(state, 'feature/search'))['searchbar.txt'] === FILES.fixed && isWorkingTreeClean(state),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(ctx),
      check(
        lineSince(state, tip(state, 'feature/search'), tip(state, 'main')) !== undefined,
        'feature/search must still sit on top of main in a straight line.',
      ),
      check(snapshotOf(state, tip(state, 'feature/search'))['searchbar.txt'] === FILES.fixed, 'Commit the placeholder fix on feature/search.'),
      check(noTypoNoFixup(state), 'A commit of feature/search still contains "Serach" or a fixup! commit is still there. Autosquash it into feat: search.'),
      check(snapshotOf(state, tip(state, 'feature/search'))['search.ts'] === FILES.search2, 'feature/search lost its search.ts changes.'),
      check(isWorkingTreeClean(state), 'The working tree must be clean at the end.'),
    ),
  hints: [
    'Make the fix its own commit marked for feat: search, then let an automatic interactive rebase fold it in.',
    'git commit --fixup <hash-of-feat: search> creates a "fixup!" commit; git rebase -i --autosquash main moves and squashes it. GIT_SEQUENCE_EDITOR=true accepts the todo list without opening nano.',
    'git add searchbar.txt, git commit --fixup HEAD~2, GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash main.',
  ],
  par: 3,
  takeaway: 'git commit --fixup plus git rebase -i --autosquash folds a late fix into the commit it belongs to.',
  theory: {
    title: 'Cleaning history before review',
    body: 'git rebase -i opens a todo list where you can reorder, reword, squash (merge into the previous commit, keeping messages) or fixup (merge, dropping the message) commits. git commit --fixup <hash> makes a commit named "fixup! <subject>", and --autosquash places it right after its target already set to fixup. A blunter tool is git reset --soft main followed by one new commit.',
    lesson: 'commit --fixup, then rebase -i --autosquash.',
  },
  outcome: {
    summary:
      'feature/search has three clean commits and none of them ever contained the Serach typo. Reviewers see the work as it should have been, not every slip along the way.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline main..feature/search',
      output: 'b02282d (HEAD -> feature/search) docs: search shortcut\n6e9abe4 feat: search ignores case\n3264231 feat: search',
    },
  },
  prelude: [{ id: 'm5.3-p1', commands: [`edit searchbar.txt "${FILES.fixed}"`] }],
  reference: ['git add searchbar.txt', 'git commit --fixup HEAD~2', 'GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash main'],
  alternatives: [
    ['git add searchbar.txt', 'git commit --fixup HEAD~2', 'git rebase --autosquash main'],
    ['git add searchbar.txt', 'git reset --soft main', 'git commit -m "feat: search"'],
  ],
};

function noTypoNoFixup(state: RepoState): boolean {
  const chain = lineSince(state, tip(state, 'feature/search'), tip(state, 'main'));
  return (
    chain !== undefined &&
    chain.every((c) => c.snapshot['searchbar.txt'] !== FILES.typo && !subject(c).startsWith('fixup!'))
  );
}

const backport: Mission = {
  id: 'backport-hotfix',
  number: '5.4',
  title: 'Backport a hotfix',
  story:
    'Ines fixed a crash on empty titles directly on main. Users of the released 1.0 hit it too, but release/1.0 must not receive the rest of main. Copy just that one commit.',
  goal: 'Bring the crash fix (the tip of main) onto release/1.0, and nothing else from main.',
  checks: [
    {
      label: 'release/1.0 has the crash fix',
      proof: 'git show release/1.0:notes.ts',
      done: (state) => snapshotOf(state, tip(state, 'release/1.0'))['notes.ts'] === FILES.notesFix,
    },
    {
      label: 'Nothing else from main came along',
      proof: 'git log --oneline release/1.0',
      done: (state) => onlyFix(state),
    },
    {
      label: 'main still has its fix',
      proof: 'git log --oneline -1 main',
      done: (state, ctx) =>
        onlyFix(state) && ctx.facts.inProgress === null && snapshotOf(state, tip(state, 'main'))['notes.ts'] === FILES.notesFix,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(ctx),
      check(snapshotOf(state, tip(state, 'release/1.0'))['notes.ts'] === FILES.notesFix, 'release/1.0 does not have the crash fix in notes.ts yet.'),
      check(onlyFix(state), 'release/1.0 received more than the fix (README or search changed). Copy only the fix commit with git cherry-pick.'),
      check(snapshotOf(state, tip(state, 'main'))['notes.ts'] === FILES.notesFix, 'main must keep the crash fix.'),
      check(isWorkingTreeClean(state), 'The working tree must be clean at the end.'),
    ),
  hints: [
    'You do not want to merge main into the release, only to copy one commit.',
    'Switch to release/1.0 and cherry-pick the fix commit (it is the tip of main). -x records where it came from.',
    'git switch release/1.0, git cherry-pick -x main.',
  ],
  par: 2,
  takeaway: 'git cherry-pick copies one commit onto the current branch as a new commit; -x notes the original hash.',
  theory: {
    title: 'Copying a single commit',
    body: 'git cherry-pick <commit> applies the changes of that one commit on top of your current branch and makes a new commit with the same message. It is the tool for backporting a hotfix to a release branch. With -x, the new message ends with "(cherry picked from commit …)" so people can trace it.',
    lesson: 'cherry-pick = copy one commit here.',
  },
  outcome: {
    summary:
      'release/1.0 has the crash fix as one new commit and nothing else from main. Users of 1.0 get the fix without receiving unreleased features.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'before-after',
        command: 'git cherry-pick -x main',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['release/1.0'] },
            { id: 'C', message: 'docs: use npm ci', parents: ['A'], lane: 'main' },
            { id: 'F', message: 'fix: crash on empty title', parents: ['C'], lane: 'main', refs: ['main'] },
          ],
          head: 'F',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'C', message: 'docs: use npm ci', parents: ['A'], lane: 'main' },
            { id: 'F', message: 'fix: crash on empty title', parents: ['C'], lane: 'main', refs: ['main'] },
            { id: 'F\'', message: 'fix: crash on empty title', parents: ['A'], lane: 'release', refs: ['HEAD → release/1.0'] },
          ],
          head: 'F\'',
        },
        caption: 'Only the fix is copied: release/1.0 gets one new commit with the same change and nothing else from main.',
      },
    },
  },
  prelude: [
    {
      id: 'm5.4-p1',
      teammate: 'ines',
      commands: ['git switch main', `edit notes.ts "${FILES.notesFix}"`, `git commit -am "${FIX_SUBJECT}"`],
    },
  ],
  reference: ['git switch release/1.0', 'git cherry-pick -x main'],
  alternatives: [['git checkout release/1.0', 'git cherry-pick main']],
};

function onlyFix(state: RepoState): boolean {
  const release = snapshotOf(state, tip(state, 'release/1.0'));
  return release['notes.ts'] === FILES.notesFix && release['README.md'] === FILES.readme0 && release['search.ts'] === undefined;
}

const wrongBranch: Mission = {
  id: 'wrong-branch',
  number: '5.5',
  title: 'Wrong branch',
  story:
    'You wrote two export commits and only then noticed you were on main instead of a feature branch. Nothing is pushed yet. Move both commits to a new branch feature/export and put main back on the crash fix.',
  goal: 'Create feature/export with your two export commits and move main back to the crash fix.',
  checks: [
    {
      label: 'feature/export holds both export commits',
      proof: 'git log --oneline main..feature/export',
      done: (state) => exportBranchOk(state),
    },
    {
      label: 'main is back on the crash fix',
      proof: 'git log --oneline -3 main',
      done: (state) => mainBackOnFix(state),
    },
    {
      label: 'Nothing lost, working tree clean',
      proof: 'git status',
      done: (state) => exportBranchOk(state) && isWorkingTreeClean(state),
    },
  ],
  validate: (state) =>
    allOf(
      check(exportBranchOk(state), 'feature/export must exist, start from main and contain both export commits.'),
      check(
        mainBackOnFix(state),
        `main must point at "${FIX_SUBJECT}" again. Move the branch back (reset), do not revert.`,
      ),
      check(isWorkingTreeClean(state), 'The working tree must be clean: the export work lives on feature/export.'),
    ),
  hints: [
    'A branch is just a label. Put a new label on your work first, then move main back.',
    'git branch feature/export keeps the commits safe; then, on main, reset two commits back with --hard.',
    'git branch feature/export, git reset --hard HEAD~2.',
  ],
  par: 2,
  takeaway: 'To move commits off the wrong branch: label them with a new branch, then reset the old branch back.',
  theory: {
    title: 'Moving commits to another branch',
    body: 'Commits do not belong to a branch; a branch is a pointer to a commit. Creating a branch at your current commit keeps the work reachable, then git reset --hard HEAD~2 pulls main back two commits. Splitting one big commit works the same way with git reset HEAD~1 and several smaller commits.',
    lesson: 'Branch first, then reset: the commits stay safe on the new branch.',
  },
  danger: 'git reset --hard throws away uncommitted changes. Create feature/export first so the commits stay reachable.',
  outcome: {
    summary:
      'Your two export commits live on feature/export and main is back on the crash fix. Commits made on the wrong branch are moved, not redone.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'before-after',
        command: 'git branch feature/export, then git reset --hard HEAD~2',
        before: {
          kind: 'graph',
          commits: [
            { id: 'F', message: 'fix: crash on empty title', parents: [], lane: 'main' },
            { id: 'M', message: 'feat: export to Markdown', parents: ['F'], lane: 'main' },
            { id: 'P', message: 'feat: export to PDF', parents: ['M'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'P',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'F', message: 'fix: crash on empty title', parents: [], lane: 'main', refs: ['HEAD → main'] },
            { id: 'M', message: 'feat: export to Markdown', parents: ['F'], lane: 'feature' },
            { id: 'P', message: 'feat: export to PDF', parents: ['M'], lane: 'feature', refs: ['feature/export'] },
          ],
          head: 'F',
        },
        caption: 'Same two commits, now on feature/export; main is back on the crash fix.',
      },
    },
  },
  prelude: [
    {
      id: 'm5.5-p1',
      commands: [
        'git switch main',
        `edit export.ts "${FILES.export1}"`,
        'git add export.ts',
        'git commit -m "feat: export to Markdown"',
        `edit export.ts "${FILES.export2}"`,
        'git commit -am "feat: export to PDF"',
      ],
    },
  ],
  reference: ['git branch feature/export', 'git reset --hard HEAD~2'],
  alternatives: [['git switch -c feature/export', 'git branch -f main HEAD~2']],
};

function exportBranchOk(state: RepoState): boolean {
  const chain = lineSince(state, tip(state, 'feature/export'), tip(state, 'main'));
  return chain !== undefined && chain.length >= 2 && chain[0]!.snapshot['export.ts'] === FILES.export2;
}

function mainBackOnFix(state: RepoState): boolean {
  const main = tip(state, 'main');
  return subject(main === undefined ? undefined : state.commits[main]) === FIX_SUBJECT && snapshotOf(state, main)['export.ts'] === undefined;
}

const syncIntroducer = (state: RepoState) =>
  introducer(state, tip(state, 'main'), (tree) => (tree['config.txt'] ?? '').includes(FILES.syncLine));

const detective: Mission = {
  id: 'history-detective',
  number: '5.6',
  title: 'History detective',
  story:
    'Users say the app now syncs every 5 minutes and drains their battery. Nobody remembers who changed it, and the commit message does not say "sync". Find the commit that introduced the line sync=every 5 min and tag it sync-change for the review.',
  goal: 'Tag the commit that added "sync=every 5 min" to config.txt as sync-change.',
  checks: [
    {
      label: 'A tag sync-change exists',
      proof: 'git tag',
      done: (_state, ctx) => tagOf(ctx, 'sync-change') !== undefined,
    },
    {
      label: 'It points at the commit that added the line',
      proof: 'git show --stat sync-change',
      done: (state, ctx) => tagOf(ctx, 'sync-change')?.target === syncIntroducer(state),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(tagOf(ctx, 'sync-change') !== undefined, 'Create a tag named sync-change on the commit you found.'),
      check(
        tagOf(ctx, 'sync-change')?.target === syncIntroducer(state),
        'sync-change points at the wrong commit: it is not the one that added "sync=every 5 min". Delete it with git tag -d sync-change and try again.',
      ),
    ),
  hints: [
    'The commit message will not help. Search the changes themselves, or ask Git who last touched that line.',
    'git log -S "<text>" lists the commits that added or removed that text; git blame config.txt shows the commit and author of every line.',
    'git log -S "sync=every 5 min" --oneline, then git tag sync-change <hash>.',
  ],
  par: 2,
  takeaway: 'git log -S finds the commit that added or removed a string; git blame shows who last changed each line.',
  theory: {
    title: 'Searching history',
    body: 'git log -S "text" (the pickaxe) lists commits where the number of occurrences of that text changed, so it finds when a line appeared or vanished; -G takes a regex instead. git blame <file> prints, for every line, the commit, author and date of its last change. git log --grep searches commit messages, and git grep searches the files themselves.',
    lesson: 'log -S for "when did this appear", blame for "who last touched this line".',
  },
  outcome: {
    summary:
      'The commit that introduced sync=every 5 min carries the tag sync-change, ready for the review. Searching history by content finds a change even when its message says nothing about it.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -4',
      output: 'fa6d7e8 (HEAD -> main) feat: sidebar\n7454b50 feat: dark theme by default\nd95421d (tag: sync-change) perf: tweak defaults\n8bbefa4 chore: app config',
    },
  },
  prelude: [
    {
      id: 'm5.6-p1',
      teammate: 'lea',
      commands: ['git switch main', 'edit config.txt "theme=light\nsync=manual"', 'git add config.txt', 'git commit -m "chore: app config"'],
    },
    {
      id: 'm5.6-p2',
      teammate: 'samir',
      commands: [`edit config.txt "theme=light\n${FILES.syncLine}"`, 'git commit -am "perf: tweak defaults"'],
    },
    {
      id: 'm5.6-p3',
      teammate: 'yanis',
      commands: [`edit config.txt "theme=dark\n${FILES.syncLine}"`, 'git commit -am "feat: dark theme by default"'],
    },
    {
      id: 'm5.6-p4',
      teammate: 'ines',
      commands: ['edit sidebar.txt "Sidebar: notebooks, tags, trash"', 'git add sidebar.txt', 'git commit -m "feat: sidebar"'],
    },
  ],
  reference: ['git log -S "sync=every 5 min" --oneline', 'git tag sync-change HEAD~2'],
  alternatives: [['git blame config.txt', 'git tag -a sync-change -m "Review the sync change" HEAD~2']],
};

const firstBad = (state: RepoState) =>
  introducer(state, tip(state, 'main'), (tree) => (tree['limits.txt'] ?? '') !== FILES.goodLimit);

const bisect: Mission = {
  id: 'bisect-the-bug',
  number: '5.7',
  title: 'Find the breaking commit',
  story:
    'The test script test.sh passed at v1.0.0 and fails on main today, with a dozen commits in between. Yanis wants the exact commit that broke it. Let git bisect halve the history for you.',
  goal: 'Use git bisect to find the first commit where sh test.sh fails, tag it first-bad, and end the bisect session.',
  checks: [
    {
      label: 'Tag first-bad on the first failing commit',
      proof: 'git show --stat first-bad',
      done: (state, ctx) => tagOf(ctx, 'first-bad')?.target === firstBad(state),
    },
    {
      label: 'Bisect session ended with git bisect reset',
      proof: 'git bisect log',
      done: (_state, ctx) => ctx.facts.inProgress === null && ran(ctx, /^git bisect /),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ran(ctx, /^git bisect /), 'Find the commit with git bisect (start, good, bad or run).'),
      check(tagOf(ctx, 'first-bad') !== undefined, 'Tag the first bad commit: git tag first-bad <hash>.'),
      check(
        tagOf(ctx, 'first-bad')?.target === firstBad(state),
        'first-bad is not on the first failing commit. Delete it with git tag -d first-bad and check the bisect result again.',
      ),
      check(ctx.facts.inProgress === null, 'The bisect session is still running. End it with git bisect reset.'),
      check(headBranch(state) === 'main', 'git bisect reset should bring you back to main.'),
    ),
  hints: [
    'Tell Git one good commit and one bad commit; it checks out the middle one and you say good or bad until one commit is left.',
    'git bisect start, git bisect bad (main is broken), git bisect good v1.0.0, then git bisect run sh test.sh does the testing for you. Tag the result before git bisect reset.',
    'git bisect start HEAD v1.0.0, git bisect run sh test.sh, git tag first-bad refs/bisect/bad, git bisect reset.',
  ],
  par: 4,
  takeaway: 'git bisect binary-searches history: about log2(n) tests to find the commit that broke something.',
  theory: {
    title: 'Binary search in history',
    body: 'git bisect start, then git bisect bad on a broken commit and git bisect good on a working one. Git checks out the commit halfway between; you test and answer good or bad, and it halves again until it names the first bad commit. git bisect run <script> automates the answers (exit 0 = good), and git bisect reset puts you back where you started.',
    lesson: 'bisect: good, bad, repeat; then always git bisect reset.',
  },
  outcome: {
    summary:
      'The first commit where test.sh fails is tagged first-bad and the bisect session is over, so you are back on main. A dozen suspects were narrowed to one without reading a single diff.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -5',
      output: '3f3c162 (HEAD -> main) docs: changelog\n5a48eb9 feat: trash\nc0f46fa feat: pin notes\ne4c14b2 (tag: first-bad) chore: tidy settings\n84932a7 feat: tags',
    },
  },
  prelude: [
    {
      id: 'm5.7-p1',
      teammate: 'lea',
      commands: ['git switch main', 'edit tags.txt "Tags: work, home"', 'git add tags.txt', 'git commit -m "feat: tags"'],
    },
    { id: 'm5.7-p2', teammate: 'yanis', commands: ['edit limits.txt "max_notes=50"', 'git commit -am "chore: tidy settings"'] },
    {
      id: 'm5.7-p3',
      teammate: 'ines',
      commands: ['edit pin.txt "Pinned notes stay on top."', 'git add pin.txt', 'git commit -m "feat: pin notes"'],
    },
    {
      id: 'm5.7-p4',
      teammate: 'samir',
      commands: ['edit trash.txt "Deleted notes stay 30 days in the trash."', 'git add trash.txt', 'git commit -m "feat: trash"'],
    },
    {
      id: 'm5.7-p5',
      teammate: 'lea',
      commands: ['edit CHANGELOG.md "1.1: sidebar, tags, pins, trash"', 'git add CHANGELOG.md', 'git commit -m "docs: changelog"'],
    },
  ],
  reference: ['git bisect start HEAD v1.0.0', 'git bisect run sh test.sh', 'git tag first-bad refs/bisect/bad', 'git bisect reset'],
  alternatives: [
    [
      'git bisect start',
      'git bisect bad',
      'git bisect good v1.0.0',
      'git bisect run sh test.sh',
      'git tag first-bad refs/bisect/bad',
      'git bisect reset',
    ],
  ],
};

const releaseCommit = (state: RepoState) =>
  introducer(state, tip(state, 'main'), (tree) => tree['VERSION'] === '1.1.0');

const shipVersion: Mission = {
  id: 'ship-a-version',
  number: '5.8',
  title: 'Ship a version',
  story:
    'Lea restored the note limit and bumped VERSION to 1.1.0, then Samir already started work-in-progress on top. Version 1.1.0 is the release commit, not today\'s tip. Mark it with a real release tag.',
  goal: 'Create an annotated tag v1.1.0 on the "release: 1.1.0" commit, then check it with git describe.',
  checks: [
    {
      label: 'v1.1.0 is an annotated tag with a message',
      proof: 'git cat-file -t v1.1.0',
      done: (_state, ctx) => tagOf(ctx, 'v1.1.0')?.annotated === true && (tagOf(ctx, 'v1.1.0')?.message ?? '').trim() !== '',
    },
    {
      label: 'v1.1.0 points at the release commit',
      proof: 'git show --no-patch v1.1.0',
      done: (state, ctx) => tagOf(ctx, 'v1.1.0')?.target === releaseCommit(state),
    },
    {
      label: 'git describe names your position from the tag',
      proof: 'git describe',
      done: (_state, ctx) => tagOf(ctx, 'v1.1.0') !== undefined && ran(ctx, /^git describe\b/),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(tagOf(ctx, 'v1.1.0') !== undefined, 'Create the tag v1.1.0.'),
      check(
        tagOf(ctx, 'v1.1.0')?.annotated === true,
        'v1.1.0 is a lightweight tag. Delete it (git tag -d v1.1.0) and recreate it with -a and -m.',
      ),
      check(
        tagOf(ctx, 'v1.1.0')?.target === releaseCommit(state),
        'v1.1.0 is not on the "release: 1.1.0" commit. Delete it with git tag -d v1.1.0 and tag that commit.',
      ),
      check(ran(ctx, /^git describe\b/), 'Run git describe to see how Git names HEAD relative to the newest tag.'),
    ),
  hints: [
    'A release tag carries a message and its author; it must sit on the release commit, which is not HEAD.',
    'git tag -a <name> -m "<message>" <commit> makes an annotated tag on any commit. git describe then prints tag-N-g<hash>.',
    'git tag -a v1.1.0 -m "Nova 1.1.0" HEAD~1, then git describe.',
  ],
  par: 2,
  takeaway: 'Annotated tags (git tag -a) are full objects with a message, made for releases; git describe names commits from them.',
  theory: {
    title: 'Tags and describe',
    body: 'A lightweight tag is a bare name for a commit; an annotated tag (git tag -a -m) is an object with its own author, date and message, and is what releases use. Tags are not pushed by default: git push origin v1.1.0 or --tags sends them. git describe prints the nearest annotated tag plus how many commits you are past it, like v1.1.0-1-g3f2a9c1.',
    lesson: 'Release = annotated tag on the release commit; describe = "tag + N commits".',
  },
  outcome: {
    summary:
      'The release: 1.1.0 commit carries the annotated tag v1.1.0, not the work in progress on top of it. Anyone can now check out exactly what shipped as 1.1.0.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: '51a6a42 (HEAD -> main) wip: offline mode\nc86220e (tag: v1.1.0) release: 1.1.0\nd577156 fix: restore note limit',
    },
  },
  prelude: [
    {
      id: 'm5.8-p1',
      teammate: 'lea',
      commands: [
        'git switch main',
        `edit limits.txt "${FILES.goodLimit}"`,
        'git commit -am "fix: restore note limit"',
        'edit VERSION "1.1.0"',
        'git add VERSION',
        'git commit -m "release: 1.1.0"',
      ],
    },
    {
      id: 'm5.8-p2',
      teammate: 'samir',
      commands: ['edit drafts.txt "Draft: offline mode"', 'git add drafts.txt', 'git commit -m "wip: offline mode"'],
    },
  ],
  reference: ['git tag -a v1.1.0 -m "Nova 1.1.0" HEAD~1', 'git describe'],
  alternatives: [['git log --oneline -3', 'git tag -a v1.1.0 -m "Nova 1.1.0" HEAD^', 'git describe --tags']],
};

// 5.9 Squash an agent's messy commits ------------------------------------------

const AGENT = 'agent/autocomplete';
const AUTO_SUBJECT = 'feat: tag autocomplete';
const MESSY = new Set(['wip', 'fix typo']);

/** agent/autocomplete is one clean commit on top of main with the final files. */
function squashedClean(state: RepoState): boolean {
  const chain = lineSince(state, tip(state, AGENT), tip(state, 'main'));
  const only = chain?.[0];
  return (
    chain?.length === 1 &&
    only !== undefined &&
    only.snapshot['autocomplete.ts'] === FILES.auto &&
    only.snapshot['autocomplete.test.ts'] === FILES.autoTest &&
    !MESSY.has(subject(only)) &&
    !/^(fixup|squash)!/.test(subject(only))
  );
}

const squashAgent: Mission = {
  id: 'squash-agent-commits',
  number: '5.9',
  title: 'Three commits, one change',
  story:
    'Nova Bot built tag autocomplete on agent/autocomplete in three commits: "feat: tag autocomplete", "wip" and "fix typo", the first one with a typo (fliter). Samir will only review it as one clean commit.',
  goal: 'Turn the three commits of agent/autocomplete into one commit with a real message and the final files.',
  checks: [
    {
      label: 'agent/autocomplete is a single commit on top of main',
      proof: 'git log --oneline main..agent/autocomplete',
      done: (state) => lineSince(state, tip(state, AGENT), tip(state, 'main'))?.length === 1,
    },
    {
      label: 'It has the fixed code and the test, and no "wip" or "fix typo" message',
      proof: 'git show --stat agent/autocomplete',
      done: squashedClean,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(ctx),
      check(tip(state, AGENT) !== undefined, `The branch ${AGENT} is missing.`),
      check(
        lineSince(state, tip(state, AGENT), tip(state, 'main'))?.length === 1,
        `${AGENT} must be exactly one commit on top of main. In git rebase -i HEAD~3, keep pick on the first line and mark the other two fixup.`,
      ),
      check(squashedClean(state), 'The single commit must have the fixed autocomplete.ts, the test, and a real message (not "wip" or "fix typo").'),
      check(isWorkingTreeClean(state), 'The working tree must be clean at the end.'),
    ),
  hints: [
    'An interactive rebase lets you rewrite the last few commits: keep the first and melt the other two into it.',
    'git rebase -i HEAD~3 opens the todo list in nano. Keep pick on the first line, change pick to fixup (or f) on the next two, then Ctrl+O, Enter, Ctrl+X. fixup keeps the first message and drops the others.',
    'git rebase -i HEAD~3 and change lines 2 and 3 to fixup. Without an editor: GIT_SEQUENCE_EDITOR="sed -i \'\' -e \'2,3s/^pick/fixup/\'" git rebase -i HEAD~3',
  ],
  par: 1,
  takeaway: 'git rebase -i turns an agent\'s wip and fix typo commits into one reviewable commit: pick the first, fixup the rest.',
  theory: {
    title: 'Interactive rebase',
    body: 'git rebase -i HEAD~3 lists the last three commits, oldest first, each with a command: pick keeps it, reword changes its message, squash melts it into the one above and merges the messages, fixup does the same but drops its message, drop deletes it, and moving a line reorders commits. Agents often leave "wip" and "fix typo" commits, so fold them before review; git reset --soft main followed by one git commit is the blunt alternative. Only rewrite commits nobody else has pulled.',
    lesson: 'pick the first, fixup the rest, and the agent\'s mess is one commit.',
  },
  outcome: {
    summary:
      'agent/autocomplete is one commit with a real message and the final files, right on top of main. Samir reviews one clear change instead of three noisy ones.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2',
      output: '513b48b (HEAD -> agent/autocomplete) feat: tag autocomplete\n51a6a42 (main) wip: offline mode',
    },
  },
  prelude: [
    {
      id: 'm5.9-p1',
      teammate: 'bot',
      commands: [
        `git switch -c ${AGENT} main`,
        `edit autocomplete.ts "${FILES.autoTypo}"`,
        'git add autocomplete.ts',
        `git commit -m "${AUTO_SUBJECT}"`,
        `edit autocomplete.test.ts "${FILES.autoTest}"`,
        'git add autocomplete.test.ts',
        'git commit -m "wip"',
        `edit autocomplete.ts "${FILES.auto}"`,
        'git commit -am "fix typo"',
      ],
    },
  ],
  reference: [`GIT_SEQUENCE_EDITOR="sed -i '' -e '2,3s/^pick/fixup/'" git rebase -i HEAD~3`],
  alternatives: [
    ['git reset --soft HEAD~3', `git commit -m "${AUTO_SUBJECT}"`],
    ['git reset --soft main', 'git commit -m "feat: tag autocomplete with a test"'],
    [`GIT_SEQUENCE_EDITOR="sed -i '' -e '2,3s/^pick/squash/'" git rebase -i HEAD~3`],
  ],
};

// 5.10 Get out of a rebase -------------------------------------------------------

const INES_SUBJECT = 'feat: tag suggestions';

/** agent/autocomplete checked out again, at its own commit (not a replayed copy on top of Ines's). */
function untouched(state: RepoState, ctx: MissionContext): boolean {
  const branchTip = tip(state, AGENT);
  const commit = state.commits[branchTip ?? ''];
  return (
    headBranch(state) === AGENT &&
    branchTip !== undefined &&
    ctx.entryCommits.has(branchTip) &&
    subject(commit) === AUTO_SUBJECT &&
    !isAncestor(state, tip(state, 'main'), branchTip)
  );
}

const abortRebase: Mission = {
  id: 'abort-the-rebase',
  number: '5.10',
  title: 'Get me out of here',
  story:
    'You ran git rebase main on agent/autocomplete, and it stopped on a conflict: Ines just landed her own autocomplete.ts on main. Lea says stop, the team picks one version tomorrow, so agent/autocomplete must stay exactly as it was.',
  goal: 'Cancel the rebase so agent/autocomplete is checked out again exactly as before, with a clean working tree.',
  checks: [
    {
      label: 'No rebase in progress',
      proof: 'git status',
      done: (_state, ctx) => ctx.facts.inProgress === null,
    },
    {
      label: 'agent/autocomplete is checked out, unchanged, and the tree is clean',
      proof: 'git log --oneline -2 agent/autocomplete',
      done: (state, ctx) => untouched(state, ctx) && isWorkingTreeClean(state),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.inProgress === null, 'The rebase is still in progress. git rebase --abort cancels it and puts the branch back.'),
      check(headBranch(state) === AGENT, `HEAD must be back on ${AGENT}.`),
      check(
        untouched(state, ctx),
        `${AGENT} changed: it must still be the bot's single commit on the old main. If you finished the rebase, git reset --hard ORIG_HEAD brings it back.`,
      ),
      check(isWorkingTreeClean(state), 'The working tree must be clean: no conflict markers or staged leftovers.'),
    ),
  hints: [
    'You do not have to finish a rebase you started: there is a way to cancel it completely.',
    'git status says "interactive rebase in progress" or "You are currently rebasing" and lists the ways out. --abort goes back to the state before git rebase started.',
    'git rebase --abort',
  ],
  par: 1,
  takeaway: 'Stuck mid-rebase? git rebase --abort puts the branch, the index and your files back exactly as they were before the rebase.',
  theory: {
    title: 'Leaving a rebase',
    body: 'While a rebase is stopped, HEAD is detached and the conflicted files hold markers, and git status always tells you so. git rebase --abort cancels everything and returns your branch to its old commit, git rebase --skip drops the commit that conflicts, and git rebase --continue goes on after you resolved it. If you already finished a rebase you regret, ORIG_HEAD (or git reflog) still points at the old tip: git reset --hard ORIG_HEAD.',
    lesson: 'Lost in a rebase? git rebase --abort.',
  },
  outcome: {
    summary:
      'The rebase is cancelled and agent/autocomplete is exactly as it was, with a clean working tree. Aborting puts you back where you started, as if the rebase never began.',
    expect: {
      kind: 'terminal',
      command: 'git status',
      output: 'On branch agent/autocomplete\nnothing to commit, working tree clean',
    },
  },
  prelude: [
    {
      id: 'm5.10-p1',
      teammate: 'ines',
      commands: ['git switch main', `edit autocomplete.ts "${FILES.autoInes}"`, 'git add autocomplete.ts', `git commit -m "${INES_SUBJECT}"`],
    },
    { id: 'm5.10-p2', commands: [`git switch ${AGENT}`, 'git! rebase main'] },
  ],
  reference: ['git rebase --abort'],
  alternatives: [['git status', 'git rebase --abort', 'git log --oneline -2']],
};

// 5.11 Capstone: production regression (standalone, on the Nova production repo) ---

const QUEUE_TS = 'packages/sync/src/queue.ts';

const regressionCommit = (state: RepoState) =>
  Object.values(state.commits).find((commit) => subject(commit) === REGRESSION_SUBJECT)?.hash;

/** main fixed by a new commit on top (history kept), queue.ts back to 5 retries, later work still there. */
function mainReverted(state: RepoState, ctx: MissionContext): boolean {
  const main = tip(state, 'main');
  const tree = snapshotOf(state, main);
  return (
    main !== undefined &&
    !ctx.entryCommits.has(main) &&
    isAncestor(state, regressionCommit(state), main) &&
    tree[QUEUE_TS] === NOVA_FILES[QUEUE_TS] &&
    tree['apps/web/src/empty-state.tsx'] !== undefined
  );
}

/** release/1.2 still ends on v1.2.0: it never had the regression, so nothing to backport. */
const releaseUntouched = (state: RepoState, ctx: MissionContext) => tagOf(ctx, 'v1.2.0')?.target === tip(state, 'release/1.2');

const productionRegression: Mission = {
  id: 'production-regression',
  number: '5.11',
  title: 'Capstone: production regression',
  capstone: true,
  story:
    'CI went red on main overnight: scripts/test.sh says sync no longer retries failed jobs, and about twenty commits landed since v1.2.0. Lea needs the guilty commit named, tagged for the postmortem and undone without rewriting shared history. Release 1.2 customers are watching too.',
  goal: 'Bisect main against v1.2.0 with scripts/test.sh, tag the first bad commit first-bad, revert it on main, and leave release/1.2 alone if it never had the bug.',
  checks: [
    {
      label: 'first-bad marks the commit that broke the smoke test',
      proof: 'git show --stat first-bad',
      done: (state, ctx) => tagOf(ctx, 'first-bad')?.target === regressionCommit(state),
    },
    {
      label: 'The bisect session is over',
      proof: 'git bisect log',
      done: (_state, ctx) => ctx.facts.inProgress === null && ran(ctx, /^git bisect /),
    },
    {
      label: 'main is fixed by a revert on top; release/1.2 left as it was',
      proof: 'git log --oneline -3 main',
      done: (state, ctx) => mainReverted(state, ctx) && releaseUntouched(state, ctx),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ran(ctx, /^git bisect /), 'Find the commit with git bisect, not by guessing: good is v1.2.0, bad is main.'),
      check(tagOf(ctx, 'first-bad') !== undefined, 'Tag the first bad commit: git tag first-bad <hash> (or refs/bisect/bad before you reset).'),
      check(
        tagOf(ctx, 'first-bad')?.target === regressionCommit(state),
        'first-bad is not on the commit that broke scripts/test.sh. Delete it (git tag -d first-bad) and read the bisect result again.',
      ),
      notBusy(ctx),
      check(headBranch(state) === 'main', 'Finish on main: git bisect reset brings you back.'),
      check(
        isAncestor(state, regressionCommit(state), tip(state, 'main')),
        'The broken commit is gone from main. main is shared: undo it with git revert, which adds a commit, instead of rewriting history.',
      ),
      check(
        snapshotOf(state, tip(state, 'main'))[QUEUE_TS] === NOVA_FILES[QUEUE_TS],
        'packages/sync/src/queue.ts on main still does not export MAX_RETRIES = 5. Revert the first-bad commit on main.',
      ),
      check(
        mainReverted(state, ctx),
        'main lost the work that came after the regression. Only the bad commit should be undone: git revert first-bad.',
      ),
      check(
        releaseUntouched(state, ctx),
        'release/1.2 never had the regression (v1.2.0 passes the test). Put it back on v1.2.0: nothing needed backporting.',
      ),
      check(isWorkingTreeClean(state), 'Commit or discard the leftover changes in your working tree.'),
    ),
  hints: [
    'A script that says pass or fail plus one known-good release is all git needs to find the culprit for you. Once you know it, undo it the way shared branches are undone.',
    'Bisect between v1.2.0 (good) and main (bad) with git bisect run sh scripts/test.sh, tag refs/bisect/bad before git bisect reset, then git revert it. Check with git branch --contains first-bad whether release/1.2 ever had it.',
    'git bisect start main v1.2.0, git bisect run sh scripts/test.sh, git tag first-bad refs/bisect/bad, git bisect reset, git revert --no-edit first-bad.',
  ],
  par: 5,
  takeaway: 'In production, find the culprit with bisect run, tag it for the record, revert it on the shared branch, and backport only to branches that actually contain it.',
  theory: {
    title: 'Rewriting history, in production',
    body: 'Rebase, autosquash and moving commits are for your own unpushed branches; once main is shared, you fix it with new commits such as git revert. git bisect run turns any pass or fail script into a binary search over history, and tags give the result a stable name for the postmortem. Before backporting, git branch --contains <commit> tells you which release branches actually shipped the bug.',
    lesson: 'Private history: rewrite it. Shared history: bisect, tag, revert.',
  },
  root: [...productionRepo({ remote: false }), ...introduceRegression()],
  outcome: {
    summary:
      'The guilty commit is tagged first-bad and undone on main by a revert, and release/1.2 is left alone. The regression is gone and shared history stays intact.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -5',
      output: '0be428d (HEAD -> main) Revert "refactor(sync): read the retry limit from the environment"\nd907751 ci: add a 10 minute timeout to the test job\n088f6cd docs(changelog): note the empty state\n866b17f feat(web): add an empty state to the notes list\nd9790e8 (tag: first-bad) refactor(sync): read the retry limit from the environment',
    },
  },
  prelude: [],
  reference: [
    'git bisect start main v1.2.0',
    'git bisect run sh scripts/test.sh',
    'git tag first-bad refs/bisect/bad',
    'git bisect reset',
    'git revert --no-edit first-bad',
  ],
  alternatives: [
    [
      'git bisect start',
      'git bisect bad',
      'git bisect good v1.2.0',
      'git bisect run sh scripts/test.sh',
      'git tag -a first-bad -m "Broke the sync retry limit" refs/bisect/bad',
      'git bisect reset',
      'git branch --contains first-bad',
      'git revert --no-commit first-bad',
      'git commit -m "fix(sync): restore the retry limit of 5"',
    ],
  ],
};

export const level5: Level = {
  id: 'rewriting',
  number: 5,
  title: 'Rewriting history',
  topics: 'rebase, autosquash, cherry-pick, log -S, blame, bisect, tags',
  planned: 11,
  root: [
    'git init -b main',
    `edit README.md "${FILES.readme0}"`,
    `edit notes.ts "${FILES.notes0}"`,
    `edit limits.txt "${FILES.goodLimit}"`,
    `edit test.sh "grep -q ${FILES.goodLimit} limits.txt"`,
    'git add .',
    'git commit -m "Initial commit"',
    'git tag -a v1.0.0 -m "Nova 1.0.0"',
    'git branch release/1.0',
  ],
  missions: [
    replayOnTop,
    conflictMidRebase,
    fixupsLater,
    backport,
    wrongBranch,
    detective,
    bisect,
    shipVersion,
    squashAgent,
    abortRebase,
    productionRegression,
  ],
};

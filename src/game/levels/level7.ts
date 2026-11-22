/**
 * Level 7 — GitHub and pull requests, simulated locally. A PR is "a pushed branch that gets reviewed
 * and merged on the server": teammates review and merge through prelude remote steps on origin.
 */
import { allOf, check, headBranch, isWorkingTreeClean } from '../validate';
import { fileAt, isAncestor, notBusy, server } from './level3';

import { ORIGIN_URL, type Level, type Mission, type MissionContext } from '../model';
import { NOVA_FILES, productionRepo } from '../production';
import type { RepoState } from '../../shared/repo-types';

// Story file contents ------------------------------------------------------

const F = {
  readmeTypo: '# Nova notse app',
  readme: '# Nova notes app',
  app10: "export const version = '1.0';",
  app11: "export const version = '1.1';",
  app12: "export const version = '1.2';",
  plain: "export const editor = 'plain';",
  markdown: "export const editor = 'markdown';",
  gfm: "export const editor = 'markdown-gfm';",
  test1: "test('renders markdown');",
  test2: "test('renders markdown-gfm');",
  ines: "export const editor = 'rich-text';\nexport const autosave = true;",
  resolved: "export const editor = 'markdown-gfm';\nexport const autosave = true;",
} as const;

const PR = 'feature/markdown';
const FIX = 'fix/readme-typo';

const tip = (state: RepoState, branch: string) => state.branches[branch];
const serverTip = (state: RepoState, branch: string) => server(state)[branch];

/** Some PR merge commit (2 parents, carrying the markdown test) is still in main's history. */
function prMergeInHistory(state: RepoState, ref: string | undefined): boolean {
  return Object.values(state.commits).some(
    (c) => c.parents.length === 2 && c.snapshot['editor.test.ts'] !== undefined && isAncestor(state, c.hash, ref),
  );
}

// Missions -------------------------------------------------------------------

const branchPerPr: Mission = {
  id: 'pr-branch',
  number: '7.1',
  title: 'One branch per pull request',
  story:
    "Your markdown editor change is ready on disk. On GitHub every change goes through a pull request, and a pull request starts from a branch you pushed, never from main.",
  goal: 'Commit the editor.ts change on a new branch feature/markdown and push it with an upstream.',
  outcome: {
    summary:
      'Your markdown change lives on its own branch, pushed to origin with tracking set up, and main is untouched. That pushed branch is what a pull request is opened from.',
    expect: {
      kind: 'terminal',
      command: 'git branch -vv',
      output: '* feature/markdown e2e69a6 [origin/feature/markdown] feat: markdown editor\n  main             c5d8aef [origin/main] Initial commit',
    },
  },
  checks: [
    {
      label: 'Commit the change on feature/markdown',
      proof: 'git log --oneline -1 feature/markdown',
      done: (state) => fileAt(state, tip(state, PR), 'editor.ts') === F.markdown,
    },
    {
      label: 'Push feature/markdown to origin with -u',
      proof: 'git branch -vv',
      done: (state) => serverTip(state, PR) !== undefined && serverTip(state, PR) === tip(state, PR) && state.upstream?.[PR] === `origin/${PR}`,
    },
  ],
  validate: (state) =>
    allOf(
      check(fileAt(state, tip(state, PR), 'editor.ts') === F.markdown, 'feature/markdown must have a commit with the markdown editor.ts.'),
      check(fileAt(state, tip(state, 'main'), 'editor.ts') === F.plain, 'Keep main untouched: the change belongs on feature/markdown only.'),
      check(fileAt(state, serverTip(state, 'main'), 'editor.ts') === F.plain, 'Never push the change to main: push the branch, the PR merges it later.'),
      check(serverTip(state, PR) === tip(state, PR), 'Push feature/markdown so origin has the same commit.'),
      check(state.upstream?.[PR] === `origin/${PR}`, 'Set the upstream: git push -u origin feature/markdown.'),
    ),
  hints: [
    'Create the branch first: uncommitted changes come along when you switch.',
    'git switch -c feature/markdown, commit editor.ts there, then push the branch with -u.',
    'git switch -c feature/markdown, git commit -am "feat: markdown editor", git push -u origin feature/markdown',
  ],
  par: 3,
  takeaway: 'A pull request is a pushed branch plus a request to merge it into main: one branch per PR.',
  theory: {
    title: 'What a pull request is',
    body: 'A pull request asks to merge a pushed branch (compare) into a base branch, usually main, after review; git itself knows nothing about PRs, they live on GitHub. Writing "Closes #12" in the description closes issue 12 when the PR merges, and a .github/pull_request_template.md file pre-fills every new PR description.',
    lesson: 'New PR: new branch, commit, git push -u origin <branch>.',
  },
  prelude: [{ id: 'm7.1-p1', commands: [`edit editor.ts "${F.markdown}"`] }],
  reference: [`git switch -c ${PR}`, 'git commit -am "feat: markdown editor"', `git push -u origin ${PR}`],
  alternatives: [[`git checkout -b ${PR}`, 'git add editor.ts', 'git commit -m "feat: markdown"', `git push --set-upstream origin ${PR}`]],
};

const reviewSuggestion: Mission = {
  id: 'pr-review-suggestion',
  number: '7.2',
  title: 'A review with a suggestion',
  story:
    'Samir reviewed PR #7, clicked "Commit suggestion" to switch the editor to markdown-gfm, and asked you for a test. The suggestion button made a commit on your branch, on the server.',
  goal: "Commit editor.test.ts and push it to feature/markdown, keeping Samir's suggestion commit.",
  outcome: {
    summary:
      "Your test commit sits on top of Samir's suggestion commit, and origin has both. Pulling before you push keeps a reviewer's commits instead of fighting them.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: '71cf550 (HEAD -> feature/markdown, origin/feature/markdown) test: markdown editor\ne538c9e Apply suggestion from code review\ne2e69a6 feat: markdown editor',
    },
  },
  checks: [
    {
      label: "Bring Samir's suggestion into your branch",
      proof: 'git log --oneline -3',
      done: (state) => fileAt(state, tip(state, PR), 'editor.ts') === F.gfm,
    },
    {
      label: 'Commit editor.test.ts',
      proof: 'git show --stat HEAD',
      done: (state) => fileAt(state, tip(state, PR), 'editor.test.ts') === F.test1,
    },
    {
      label: 'Push: the PR branch on origin has both',
      proof: 'git status',
      done: (state) =>
        serverTip(state, PR) === tip(state, PR) &&
        fileAt(state, serverTip(state, PR), 'editor.test.ts') === F.test1 &&
        fileAt(state, serverTip(state, PR), 'editor.ts') === F.gfm,
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(fileAt(state, serverTip(state, PR), 'editor.ts') === F.gfm, "Samir's suggestion must stay on origin/feature/markdown: never force here."),
      check(fileAt(state, tip(state, PR), 'editor.test.ts') === F.test1, 'Commit editor.test.ts on feature/markdown.'),
      check(serverTip(state, PR) === tip(state, PR), 'Push feature/markdown so the PR shows your test.'),
    ),
  hints: [
    "The server's copy of your branch has a commit you don't have yet.",
    'Commit your test, then pull (with --rebase for a tidy PR) before pushing; or pull first, then commit and push.',
    'git add editor.test.ts, git commit -m "test: markdown editor", git pull --rebase, git push',
  ],
  par: 4,
  takeaway: 'Reviewers can commit to your PR branch from GitHub, so pull before you push new commits.',
  theory: {
    title: 'Reviews and suggestions',
    body: 'Reviewers read the "Files changed" tab, leave line comments, and finish with Comment, Approve or Request changes. A suggested change that you or they accept with "Commit suggestion" becomes a real commit on the PR branch on the server. Answer a review by pushing more commits to the same branch: the PR updates itself.',
    lesson: 'Update a PR by pushing to its branch; pull first if the server moved.',
  },
  prelude: [
    {
      id: 'm7.2-p1',
      teammate: 'samir',
      remote: { push: [PR] },
      commands: [`git switch ${PR}`, `edit editor.ts "${F.gfm}"`, 'git commit -am "Apply suggestion from code review"'],
    },
    { id: 'm7.2-p2', commands: [`edit editor.test.ts "${F.test1}"`] },
  ],
  reference: ['git add editor.test.ts', 'git commit -m "test: markdown editor"', 'git pull --rebase', 'git push'],
  alternatives: [['git pull', 'git add editor.test.ts', 'git commit -m "test: markdown editor"', 'git push']],
};

const amendPr: Mission = {
  id: 'pr-amend',
  number: '7.3',
  title: 'Fix the commit, not the history',
  story:
    'Ines approved with one nit: your test name still says markdown instead of markdown-gfm. The fix is on disk; the team prefers one clean test commit over "fix test" commits in the PR.',
  goal: 'Fold the fix into your last commit with --amend and update the PR with --force-with-lease.',
  outcome: {
    summary:
      'The PR still has a single test commit, now with the right test name, and origin has the rewritten version. Reviewers see one clean commit instead of a trail of small fixes.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3 origin/feature/markdown',
      output: '37fdc97 (HEAD -> feature/markdown, origin/feature/markdown) test: markdown editor\ne538c9e Apply suggestion from code review\ne2e69a6 feat: markdown editor',
    },
  },
  checks: [
    {
      label: 'Amend the test commit with the fix',
      proof: 'git show HEAD',
      done: (state) => {
        const head = tip(state, PR);
        const parent = head === undefined ? undefined : state.commits[head]?.parents[0];
        return fileAt(state, head, 'editor.test.ts') === F.test2 && fileAt(state, parent, 'editor.test.ts') === undefined;
      },
    },
    {
      label: 'Force-push the PR branch with the lease',
      proof: 'git status',
      done: (state) => serverTip(state, PR) === tip(state, PR) && fileAt(state, serverTip(state, PR), 'editor.test.ts') === F.test2,
    },
  ],
  validate: (state) => {
    const head = tip(state, PR);
    const parent = head === undefined ? undefined : state.commits[head]?.parents[0];
    return allOf(
      check(fileAt(state, head, 'editor.test.ts') === F.test2, 'feature/markdown must have the fixed test name.'),
      check(
        fileAt(state, parent, 'editor.test.ts') === undefined,
        'That made a second test commit. Press Undo and fold the fix into the existing one with git commit --amend.',
      ),
      check(fileAt(state, serverTip(state, PR), 'editor.ts') === F.gfm, "Samir's suggestion must stay in the PR."),
      check(serverTip(state, PR) === head, 'The amended commit is not on origin yet: git push --force-with-lease.'),
    );
  },
  hints: [
    'An amend replaces the last commit; the server still has the old one, so a normal push is rejected.',
    'git commit -a --amend --no-edit, then a force push that checks nobody else pushed: --force-with-lease.',
    'git commit -a --amend --no-edit, git push --force-with-lease',
  ],
  par: 2,
  takeaway: 'Amend + git push --force-with-lease keeps a PR tidy; on your own PR branch that rewrite is fine.',
  theory: {
    title: 'New commit or amend?',
    body: 'After a review you can push a new commit (easy to re-review, and GitHub can squash it later) or amend and force-push (cleaner history, but reviewers lose the "changes since last review" view). Either way, only rewrite branches that are yours, and force with --force-with-lease.',
    lesson: 'Rewriting your PR branch: amend, then git push --force-with-lease.',
  },
  danger: 'This rewrites a pushed branch. On a branch others build on, a force push removes their commits from the server.',
  prelude: [{ id: 'm7.3-p1', commands: [`edit editor.test.ts "${F.test2}"`] }],
  reference: ['git commit -a --amend --no-edit', 'git push --force-with-lease'],
  alternatives: [['git add editor.test.ts', 'git commit --amend -m "test: markdown-gfm editor"', 'git push --force']],
};

const updateBranch: Mission = {
  id: 'pr-update-branch',
  number: '7.4',
  title: 'Update branch',
  story:
    'GitHub shows "This branch is out-of-date with the base branch": Yanis merged version 1.1 into main. The team requires PRs to be up to date before merging.',
  goal: 'Bring the latest origin/main into feature/markdown and push the updated PR branch.',
  outcome: {
    summary:
      "feature/markdown now contains Yanis's version 1.1 from main, and the updated branch is pushed. A PR that is up to date is tested against what it will actually merge into.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -6',
      output: "*   f2060ea (HEAD -> feature/markdown, origin/feature/markdown) Merge remote-tracking branch 'origin/main' into feature/markdown\n|\\\n| * 1965848 (origin/main, origin/HEAD) chore: version 1.1 (#6)\n* | 37fdc97 test: markdown editor\n* | e538c9e Apply suggestion from code review\n* | e2e69a6 feat: markdown editor\n|/\n* c5d8aef (main) Initial commit",
    },
  },
  checks: [
    {
      label: 'feature/markdown contains the latest main',
      proof: 'git log --oneline --graph -6',
      done: (state) => isAncestor(state, serverTip(state, 'main'), tip(state, PR)),
    },
    {
      label: 'Push the updated PR branch',
      proof: 'git status',
      done: (state) => serverTip(state, PR) === tip(state, PR) && isAncestor(state, serverTip(state, 'main'), serverTip(state, PR)),
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(isAncestor(state, serverTip(state, 'main'), tip(state, PR)), "feature/markdown must contain origin/main's latest commit (version 1.1)."),
      check(fileAt(state, tip(state, PR), 'editor.test.ts') === F.test2, 'Keep your PR changes on feature/markdown.'),
      check(fileAt(state, serverTip(state, 'main'), 'editor.ts') === F.plain, 'Do not push the PR into main: only its branch is updated.'),
      check(serverTip(state, PR) === tip(state, PR), 'Push feature/markdown so the PR is up to date on the server.'),
    ),
  hints: [
    "Your origin/main is stale. Fetch it, then bring it into the PR branch (not the other way round).",
    'git fetch, then on feature/markdown: git merge --no-edit origin/main (GitHub\'s button does a merge too), then push.',
    'git fetch, git merge --no-edit origin/main, git push',
  ],
  par: 3,
  takeaway: 'Updating a PR = fetch, merge (or rebase onto) origin/main into the PR branch, push.',
  theory: {
    title: 'Keeping a PR (or a fork) in sync',
    body: 'GitHub\'s "Update branch" button merges main into your PR branch; locally that is git fetch then git merge origin/main (or git rebase origin/main and a --force-with-lease push). On a fork, origin is your copy and the team repo is a second remote: git remote add upstream <url>, git fetch upstream, git merge upstream/main, git push.',
    lesson: 'PR behind main: fetch, merge origin/main into it, push.',
  },
  prelude: [
    {
      id: 'm7.4-p1',
      teammate: 'yanis',
      remote: { push: ['main'] },
      commands: [`edit app.ts "${F.app11}"`, 'git commit -am "chore: version 1.1 (#6)"'],
    },
  ],
  reference: ['git fetch', 'git merge --no-edit origin/main', 'git push'],
  alternatives: [
    ['git fetch', 'git rebase origin/main', 'git push --force-with-lease'],
    ['git pull --no-rebase --no-edit origin main', 'git push'],
    [`git remote add upstream ${ORIGIN_URL}`, 'git fetch upstream', 'git merge --no-edit upstream/main', 'git push'],
  ],
};

const prConflict: Mission = {
  id: 'pr-conflict',
  number: '7.5',
  title: 'This branch has conflicts',
  story:
    "Ines's autosave PR was merged first and rewrote editor.ts. Now GitHub says your PR has conflicts that must be resolved. Resolve them on your Mac: the result keeps markdown-gfm and Ines's autosave line.",
  goal: 'Merge origin/main into feature/markdown, resolve editor.ts to keep both changes, and push.',
  outcome: {
    summary:
      "The conflict is resolved on your PR branch: editor.ts keeps your markdown-gfm editor and Ines's autosave, and the merge is pushed. GitHub can then show the PR as mergeable again.",
    expect: { kind: 'file', path: 'editor.ts', content: F.resolved },
  },
  checks: [
    {
      label: 'feature/markdown contains the latest main',
      proof: 'git log --oneline --graph -6',
      done: (state) => isAncestor(state, serverTip(state, 'main'), tip(state, PR)),
    },
    {
      label: "editor.ts keeps markdown-gfm and autosave, without conflict markers",
      proof: 'git show HEAD:editor.ts',
      done: (state) => resolvedOk(fileAt(state, tip(state, PR), 'editor.ts')),
    },
    {
      label: 'Push the resolved PR branch',
      proof: 'git status',
      done: (state) => serverTip(state, PR) === tip(state, PR) && resolvedOk(fileAt(state, serverTip(state, PR), 'editor.ts')),
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(isAncestor(state, serverTip(state, 'main'), tip(state, PR)), "Merge origin/main (with Ines's autosave) into feature/markdown."),
      check(!hasMarkers(fileAt(state, tip(state, PR), 'editor.ts')), 'editor.ts still has conflict markers (<<<<<<<, =======, >>>>>>>).'),
      check(resolvedOk(fileAt(state, tip(state, PR), 'editor.ts')), "editor.ts must keep 'markdown-gfm' and Ines's autosave = true line."),
      check(isWorkingTreeClean(state), 'Commit the resolution: the working tree is not clean.'),
      check(serverTip(state, PR) === tip(state, PR), 'Push feature/markdown so the PR is mergeable again.'),
    ),
  hints: [
    'The conflict is between your branch and the new main: bring main into your branch to see it.',
    'git fetch, git merge origin/main, edit editor.ts in nano (keep the markdown-gfm line and the autosave line, delete the markers), git add, git commit, git push.',
    'git fetch, git merge origin/main, nano editor.ts, git add editor.ts, git commit --no-edit, git push',
  ],
  par: 6,
  takeaway: 'PR conflicts are solved like any merge conflict: merge main into the PR branch locally, resolve, commit, push.',
  theory: {
    title: 'Resolving a PR conflict locally',
    body: 'GitHub can resolve simple conflicts in the browser, but doing it locally lets you run the app and tests. Merge origin/main into your PR branch, fix each file between the <<<<<<< and >>>>>>> markers, git add it, commit, and push: the PR turns mergeable.',
    lesson: 'PR conflict: merge origin/main into the PR branch, resolve, push.',
  },
  prelude: [
    {
      id: 'm7.5-p1',
      teammate: 'ines',
      remote: { push: ['main'] },
      commands: [`edit editor.ts "${F.ines}"`, 'git commit -am "feat: autosave (#8)"'],
    },
  ],
  reference: [
    'git fetch',
    'git! merge origin/main',
    `edit editor.ts "${F.resolved}"`,
    'git add editor.ts',
    'git commit --no-edit',
    'git push',
  ],
  alternatives: [
    ['git! pull --no-rebase origin main', `edit editor.ts "${F.resolved}"`, 'git commit -am "Merge origin/main into feature/markdown"', 'git push'],
    ['git pull --no-rebase --no-commit -X ours origin main', `edit editor.ts "${F.resolved}"`, 'git add editor.ts', 'git commit --no-edit', 'git push'],
  ],
};

function hasMarkers(content: string | undefined): boolean {
  return content !== undefined && /^(<<<<<<<|=======|>>>>>>>)/m.test(content);
}

function resolvedOk(content: string | undefined): boolean {
  return content !== undefined && !hasMarkers(content) && content.includes("'markdown-gfm'") && content.includes('autosave = true');
}

const mergePr: Mission = {
  id: 'pr-merge-commit',
  number: '7.6',
  title: 'Create a merge commit',
  story:
    'PR #7 is approved and green. Lea is offline, so you press the merge button yourself, the way the team configured it: "Create a merge commit".',
  goal: 'Merge feature/markdown into main with a merge commit (--no-ff) and push main.',
  outcome: {
    summary:
      "main has one merge commit that brings in all of PR #7, and it is pushed. The PR stays visible as a single merge in main's history, easy to find and to revert.",
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'P1', message: 'feat: markdown editor', parents: ['A'], lane: PR },
          { id: 'B', message: 'feat: autosave (#8)', parents: ['A'], lane: 'main' },
          { id: 'P2', message: "Merge remote-tracking branch 'origin/main' into feature/markdown", parents: ['P1', 'B'], lane: PR, refs: [PR] },
          { id: 'M', message: "Merge branch 'feature/markdown'", parents: ['B', 'P2'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
        ],
        head: 'M',
        caption: '--no-ff records a merge commit even though main could have fast-forwarded to the PR branch.',
      },
    },
  },
  checks: [
    {
      label: 'main has a merge commit of feature/markdown',
      proof: 'git log --oneline --graph -4 main',
      done: (state) => {
        const head = tip(state, 'main');
        const commit = head === undefined ? undefined : state.commits[head];
        return commit?.parents.length === 2 && commit.parents[1] === tip(state, PR);
      },
    },
    {
      label: 'Push main',
      proof: 'git status',
      done: (state) => serverTip(state, 'main') === tip(state, 'main') && (state.commits[serverTip(state, 'main') ?? '']?.parents.length ?? 0) === 2,
    },
  ],
  validate: (state) => {
    const head = tip(state, 'main');
    const commit = head === undefined ? undefined : state.commits[head];
    return allOf(
      notBusy(state),
      check(fileAt(state, head, 'editor.test.ts') === F.test2, 'main must contain the PR (merge feature/markdown into main).'),
      check(head !== tip(state, PR) && commit?.parents.length === 2, 'main fast-forwarded: no merge commit was created. Press Undo and merge with --no-ff.'),
      check(commit?.parents[1] === tip(state, PR), 'The merge commit must merge feature/markdown.'),
      check(fileAt(state, head, 'app.ts') === F.app11, "main lost Yanis's version 1.1: pull main before merging."),
      check(serverTip(state, 'main') === head, 'Push main so the server has the merge.'),
    );
  },
  hints: [
    'Merge into main, from main. Your PR branch already contains main, so a plain merge would just fast-forward.',
    'git switch main, git pull --ff-only, git merge --no-ff feature/markdown, git push.',
    'git switch main, git pull --ff-only, git merge --no-ff --no-edit feature/markdown, git push',
  ],
  par: 4,
  takeaway: '"Create a merge commit" is git merge --no-ff: the PR stays visible as one merge in main\'s history.',
  theory: {
    title: 'Three merge buttons',
    body: '"Create a merge commit" is git merge --no-ff: every PR commit is kept and one merge commit ties them in. "Squash and merge" is git merge --squash plus a commit: one new commit, the branch commits are not in main. "Rebase and merge" replays each commit on top of main: linear history, new hashes.',
    lesson: 'Merge commit = --no-ff, squash = --squash, rebase = rebase.',
  },
  prelude: [],
  reference: ['git switch main', 'git pull --ff-only', `git merge --no-ff --no-edit ${PR}`, 'git push'],
  alternatives: [['git switch main', `git merge --no-ff -m "Merge pull request #7 from ${PR}" ${PR}`, 'git push']],
};

const revertPr: Mission = {
  id: 'pr-revert',
  number: '7.7',
  title: 'Revert a merged PR',
  story:
    "An hour after the merge, the mobile app crashes on markdown notes. Yanis already pushed version 1.2 on top of main. You need GitHub's \"Revert\" button: undo PR #7 without rewriting main.",
  goal: "Revert the PR's merge commit on main with git revert -m 1 and push, keeping Yanis's 1.2.",
  outcome: {
    summary:
      "main has a new commit that undoes PR #7, on top of Yanis's version 1.2, and it is pushed. Nobody's history was rewritten, so teammates simply pull the fix.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: "cab2040 (HEAD -> main, origin/main, origin/HEAD) Revert \"Merge branch 'feature/markdown'\"\ne8aed5b chore: version 1.2\n28570ee Merge branch 'feature/markdown'",
    },
  },
  checks: [
    {
      label: "Revert the PR's changes on main",
      proof: 'git show --stat HEAD',
      done: (state) => fileAt(state, tip(state, 'main'), 'editor.test.ts') === undefined && fileAt(state, tip(state, 'main'), 'app.ts') === F.app12,
    },
    {
      label: 'Push the revert',
      proof: 'git status',
      done: (state) => serverTip(state, 'main') === tip(state, 'main') && fileAt(state, serverTip(state, 'main'), 'editor.test.ts') === undefined,
    },
  ],
  validate: (state) => {
    const head = tip(state, 'main');
    return allOf(
      notBusy(state),
      check(headBranch(state) === 'main', 'Stay on main.'),
      check(fileAt(state, head, 'app.ts') === F.app12, "main must keep Yanis's version 1.2: pull first, revert on top."),
      check(prMergeInHistory(state, head), 'The merge is gone from main\'s history. Shared history is never rewritten: press Undo and use git revert -m 1.'),
      check(fileAt(state, head, 'editor.test.ts') === undefined, "editor.test.ts is still on main: the PR's changes are not reverted."),
      check(fileAt(state, head, 'editor.ts') === F.ines, "editor.ts must go back to main's version (Ines's autosave)."),
      check(serverTip(state, 'main') === head, 'Push main so the revert reaches the server.'),
    );
  },
  hints: [
    'A merge commit has two parents; to revert it, Git must know which side is "main". That is -m 1.',
    'Pull main, find the merge (git log --oneline --merges -1, it is HEAD~1 after the pull), revert it with -m 1, push.',
    'git pull --ff-only, git revert -m 1 --no-edit HEAD~1, git push',
  ],
  par: 3,
  takeaway: 'git revert -m 1 <merge> undoes a whole merged PR with a new commit, without rewriting shared history.',
  theory: {
    title: 'Reverting a merge',
    body: "git revert makes a new commit that undoes another one; for a merge commit you must name the parent to go back to, and -m 1 means \"main's side\". This is what GitHub's Revert button does, as a new PR. To bring the feature back later, revert the revert, because Git considers the PR's commits already merged.",
    lesson: 'Undo a merged PR: git revert -m 1 <merge-commit>.',
  },
  prelude: [
    {
      id: 'm7.7-p1',
      teammate: 'yanis',
      remote: { push: ['main'] },
      commands: [`edit app.ts "${F.app12}"`, 'git commit -am "chore: version 1.2"'],
    },
  ],
  reference: ['git pull --ff-only', 'git revert -m 1 --no-edit HEAD~1', 'git push'],
  alternatives: [['git fetch', 'git merge --ff-only origin/main', 'git revert -m 1 --no-edit HEAD^', 'git push origin main']],
};

const protectedMain: Mission = {
  id: 'pr-protected-main',
  number: '7.8',
  title: 'Protected main',
  story:
    'After the revert, Lea turned on branch protection: nobody pushes to main, everything goes through a PR. Five minutes later you fix the README typo and commit it... on main.',
  goal: 'Move your typo commit to a new branch fix/readme-typo, push that branch, and put main back on origin/main.',
  outcome: {
    summary:
      'Your README fix is on its own pushed branch, and your local main matches origin/main again. With a protected main, that branch is how the fix reaches main: through a pull request.',
    expect: {
      kind: 'terminal',
      command: 'git branch -vv',
      output: "  feature/markdown f2a6e7f [origin/feature/markdown] Merge remote-tracking branch 'origin/main' into feature/markdown\n* fix/readme-typo  e5320b5 [origin/fix/readme-typo] docs: fix README typo\n  main             cab2040 [origin/main] Revert \"Merge branch 'feature/markdown'\"",
    },
  },
  checks: [
    {
      label: 'Push the fix as fix/readme-typo',
      proof: 'git ls-remote origin',
      done: (state) => fileAt(state, serverTip(state, FIX), 'README.md') === F.readme,
    },
    {
      label: 'Local main is back on origin/main',
      proof: 'git status',
      done: (state) => tip(state, 'main') === serverTip(state, 'main'),
    },
  ],
  validate: (state) =>
    allOf(
      check(
        fileAt(state, serverTip(state, 'main'), 'README.md') === F.readmeTypo,
        'You pushed to main. On GitHub, protection would reject it (GH006); press Undo and push a branch instead.',
      ),
      check(fileAt(state, tip(state, FIX), 'README.md') === F.readme, 'fix/readme-typo must have your README fix.'),
      check(serverTip(state, FIX) === tip(state, FIX), 'Push fix/readme-typo to origin.'),
      check(tip(state, 'main') === serverTip(state, 'main'), 'Your local main still has the fix: move it back to origin/main.'),
      check(isWorkingTreeClean(state), 'Leave a clean working tree.'),
    ),
  hints: [
    'A branch is just a label: put a new label on your commit, then move main\'s label back.',
    'git switch -c fix/readme-typo keeps the commit; push it with -u; git branch -f main origin/main resets main without touching your files.',
    'git switch -c fix/readme-typo, git push -u origin fix/readme-typo, git branch -f main origin/main',
  ],
  par: 3,
  takeaway: 'Committed to a protected main? Branch from it, push the branch, and move main back to origin/main.',
  theory: {
    title: 'Branch protection',
    body: 'A protection rule (or ruleset) on main makes GitHub reject direct pushes with "GH006: Protected branch update failed" and require a reviewed PR, often with passing checks. This sandbox does not enforce it, so the habit is yours: commits go on branches, main only moves through merged PRs.',
    lesson: 'Never push to main: push a branch and open a PR.',
  },
  prelude: [{ id: 'm7.8-p1', commands: [`edit README.md "${F.readme}"`, 'git commit -am "docs: fix README typo"'] }],
  reference: [`git switch -c ${FIX}`, `git push -u origin ${FIX}`, 'git branch -f main origin/main'],
  alternatives: [[`git branch ${FIX}`, 'git reset --hard origin/main', `git push -u origin ${FIX}`]],
};

const releaseCleanup: Mission = {
  id: 'pr-release',
  number: '7.9',
  title: 'Squash, release, clean up',
  story:
    'Lea squash-merged your typo PR on GitHub. Time to ship: tag main as v1.0 for the release page, and delete the merged branch everywhere.',
  goal: 'Update main, tag it v1.0 and push the tag, then delete fix/readme-typo locally and on origin.',
  outcome: {
    summary:
      "main has Lea's squash commit, tagged v1.0 on origin, and fix/readme-typo is gone locally and on the server. The tag is what a GitHub release is built on, and deleting merged branches keeps the branch list honest.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2',
      output: "a22e562 (HEAD -> main, tag: v1.0, origin/main, origin/HEAD) docs: fix README typo (#10)\ncab2040 Revert \"Merge branch 'feature/markdown'\"",
    },
  },
  checks: [
    {
      label: "Pull Lea's squash merge into main",
      proof: 'git log --oneline -2 main',
      done: (state) => tip(state, 'main') === serverTip(state, 'main') && fileAt(state, tip(state, 'main'), 'README.md') === F.readme,
    },
    {
      label: 'Tag main v1.0 and push the tag',
      proof: 'git ls-remote --tags origin',
      done: (state, ctx) =>
        (ctx.facts.server?.tags.includes('v1.0') ?? false) &&
        ctx.facts.tags.some((t) => t.name === 'v1.0' && t.target === serverTip(state, 'main')),
    },
    {
      label: 'Delete fix/readme-typo locally and on origin',
      proof: 'git branch -a',
      done: (state) => tip(state, FIX) === undefined && serverTip(state, FIX) === undefined,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(tip(state, 'main') === serverTip(state, 'main'), "Your main must match origin/main (Lea's squash commit)."),
      check(
        ctx.facts.tags.some((t) => t.name === 'v1.0' && t.target === serverTip(state, 'main')),
        'Tag the up-to-date main: git tag -a v1.0 -m "Nova 1.0" on main after pulling.',
      ),
      check(ctx.facts.server?.tags.includes('v1.0') ?? false, 'The tag is only local: tags are pushed explicitly, git push origin v1.0.'),
      check(serverTip(state, FIX) === undefined, 'fix/readme-typo still exists on origin: git push origin --delete fix/readme-typo.'),
      check(tip(state, FIX) === undefined, 'Your local fix/readme-typo still exists. After a squash merge git branch -d refuses: use -D.'),
    ),
  hints: [
    'Get the squash commit first; the tag should point at the released main. Tags and branch deletions are pushes too.',
    'git switch main, git pull, git tag -a v1.0 -m "Nova 1.0", git push origin v1.0, git push origin --delete fix/readme-typo, then delete the local branch (-D: squash commits are new commits).',
    'git switch main, git pull --ff-only, git tag -a v1.0 -m "Nova 1.0", git push origin v1.0, git push origin --delete fix/readme-typo, git branch -D fix/readme-typo',
  ],
  par: 6,
  takeaway: 'Releases are tags you push explicitly; a squash-merged branch looks unmerged to git, so delete it with -D.',
  theory: {
    title: 'Squash merges, tags and releases',
    body: 'A squash merge writes one brand-new commit on main, so git branch -d thinks your branch was never merged: check the PR is merged, then git branch -D. A GitHub release is built on a tag; git push does not send tags, so push them with git push origin v1.0 (or --follow-tags). Delete the server branch with git push origin --delete, or let GitHub delete it after merging.',
    lesson: 'Ship: git tag -a v1.0, git push origin v1.0, then delete merged branches.',
  },
  danger: 'git branch -D deletes a branch even if its commits are not merged anywhere: check the PR was merged first.',
  prelude: [
    {
      id: 'm7.9-p1',
      teammate: 'lea',
      remote: { push: ['main'] },
      commands: [`git merge --squash origin/${FIX}`, 'git commit -m "docs: fix README typo (#10)"'],
    },
  ],
  reference: [
    'git switch main',
    'git pull --ff-only',
    'git tag -a v1.0 -m "Nova 1.0"',
    'git push origin v1.0',
    `git push origin --delete ${FIX}`,
    `git branch -D ${FIX}`,
  ],
  alternatives: [
    ['git switch main', 'git pull', `git branch -D ${FIX}`, 'git tag v1.0', 'git push origin v1.0', `git push origin :${FIX}`],
  ],
};

// 7.10 Review an agent's PR locally --------------------------------------------

const BOT_PR = 'pr-11';
const BOT_SUBJECT = 'feat: export notes as CSV';
const CSV = { code: 'export const toCsv = (notes) => notes.map((n) => n.title);', test: "test('one CSV row per note');" } as const;

const botPrCommit = (state: RepoState) =>
  Object.values(state.commits).find((c) => c.message.split('\n')[0] === BOT_SUBJECT)?.hash;
const prFetched = (state: RepoState) => {
  const hash = botPrCommit(state);
  return hash !== undefined && Object.entries(state.branches).some(([name, at]) => name !== 'main' && at === hash);
};
const prLanded = (state: RepoState) =>
  isAncestor(state, botPrCommit(state), serverTip(state, 'main')) &&
  tip(state, 'main') === serverTip(state, 'main') &&
  fileAt(state, tip(state, 'main'), 'export.test.ts') === CSV.test;

const reviewBotPr: Mission = {
  id: 'pr-fetch-locally',
  number: '7.10',
  title: 'Check out the bot\'s PR',
  story:
    'Nova Bot opened PR #11, "export notes as CSV", from its own fork, so there is no branch for it on origin: GitHub only keeps the PR under refs/pull/11/head. Lea wants you to look at it on your Mac before it lands, and it is fine to merge if it brings its test.',
  goal: 'Fetch PR #11 into a local branch pr-11, inspect it, then merge it into main and push.',
  outcome: {
    summary:
      "Nova Bot's PR #11 was fetched into a local branch, looked at, then merged into main with its test and pushed. Reviewing an agent's work on your own machine catches what its diff alone hides.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -4',
      output: "*   608ed82 (HEAD -> main, origin/main, origin/HEAD) Merge branch 'pr-11'\n|\\\n| * b298342 (pr-11) feat: export notes as CSV\n|/\n* a22e562 (tag: v1.0) docs: fix README typo (#10)\n* cab2040 Revert \"Merge branch 'feature/markdown'\"",
    },
  },
  checks: [
    {
      label: 'PR #11 is in a local branch',
      proof: 'git log --oneline main..pr-11',
      done: prFetched,
    },
    {
      label: 'The PR is merged into main and pushed, test included',
      proof: 'git log --oneline -3 origin/main',
      done: prLanded,
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(
        prFetched(state),
        'Fetch the PR into its own branch first: git fetch origin pull/11/head:pr-11 (that is what gh pr checkout 11 does for you).',
      ),
      check(isAncestor(state, botPrCommit(state), tip(state, 'main')), 'Merge pr-11 into main once you have looked at it.'),
      check(prLanded(state), 'Push main so the PR lands on origin.'),
      check(isWorkingTreeClean(state), 'The working tree must be clean.'),
    ),
  hints: [
    'A PR from a fork has no branch on origin, but the server keeps a ref for every PR that you can fetch like a branch.',
    'git fetch origin pull/11/head:pr-11 creates the local branch pr-11. git log main..pr-11 and git diff main...pr-11 show what it brings; then merge it into main and push.',
    'git fetch origin pull/11/head:pr-11, git diff --stat main...pr-11, git merge --no-ff --no-edit pr-11, git push',
  ],
  par: 4,
  takeaway: 'Every PR lives at refs/pull/<n>/head: fetch it into a branch (or gh pr checkout <n>) and review an agent\'s work on your own Mac before it lands.',
  theory: {
    title: 'Reviewing a PR locally',
    body: 'GitHub stores every pull request under refs/pull/<number>/head, even when it comes from a fork, so git fetch origin pull/11/head:pr-11 gives you a local branch with exactly the PR\'s commits. gh pr checkout 11 does the same in one step (and --worktree puts it in its own folder). Running the app and the tests on your Mac is the review that catches what an agent\'s diff hides.',
    lesson: 'git fetch origin pull/<n>/head:pr-<n>, or gh pr checkout <n>.',
  },
  prelude: [
    {
      id: 'm7.10-p1',
      teammate: 'bot',
      remote: { push: ['HEAD:refs/pull/11/head'] },
      commands: [
        `edit export.ts "${CSV.code}"`,
        `edit export.test.ts "${CSV.test}"`,
        'git add export.ts export.test.ts',
        `git commit -m "${BOT_SUBJECT}"`,
      ],
    },
  ],
  reference: [
    `git fetch origin pull/11/head:${BOT_PR}`,
    `git diff --stat main...${BOT_PR}`,
    `git merge --no-ff --no-edit ${BOT_PR}`,
    'git push',
  ],
  alternatives: [
    [`git fetch origin pull/11/head:${BOT_PR}`, `git switch ${BOT_PR}`, 'git log --oneline -2', 'git switch main', `git merge ${BOT_PR}`, 'git push origin main'],
  ],
};

// 7.11 Capstone: land the offline-cache PR (production repo) ------------------


const CACHE_PR = 'feature/offline-cache';
const SYNC_INDEX = 'packages/sync/src/index.ts';
const LEA_SUBJECT = 'feat(sync): export queue events from the package';
const ANCHOR = "export { resolveConflict } from './conflict';\n";
const OPEN_CACHE = "export { openCache } from './cache';";
const QUEUE_EVENTS = "export { onQueueEvent, type QueueEvent } from './queue';";
const LEA_INDEX = NOVA_FILES[SYNC_INDEX]!.replace(ANCHOR, `${ANCHOR}${QUEUE_EVENTS}\n`);
const RESOLVED_INDEX = NOVA_FILES[SYNC_INDEX]!.replace(ANCHOR, `${ANCHOR}${OPEN_CACHE}\n${QUEUE_EVENTS}\n`);

const leaCommit = (state: RepoState) => Object.values(state.commits).find((c) => c.message.startsWith(LEA_SUBJECT))?.hash;
const indexResolved = (text: string | undefined) =>
  text !== undefined && !hasMarkers(text) && text.includes(OPEN_CACHE) && text.includes(QUEUE_EVENTS);
/** A PR tip that already has main's change and Samir's cache, with index.ts resolved. */
const prReady = (state: RepoState, hash: string | undefined) =>
  hash !== undefined &&
  isAncestor(state, leaCommit(state), hash) &&
  fileAt(state, hash, 'packages/sync/src/cache.ts') !== undefined &&
  indexResolved(fileAt(state, hash, SYNC_INDEX));
/** The PR merge on main: a new merge commit (--no-ff) whose second parent is the up-to-date PR branch. */
const prMerged = (state: RepoState, ctx: MissionContext) =>
  Object.values(state.commits).some(
    (c) =>
      !ctx.entryCommits.has(c.hash) &&
      c.parents.length === 2 &&
      fileAt(state, c.parents[0], 'packages/sync/src/cache.ts') === undefined &&
      prReady(state, c.parents[1]) &&
      isAncestor(state, c.hash, tip(state, 'main')),
  );
const mainLanded = (state: RepoState, ctx: MissionContext) =>
  prMerged(state, ctx) && indexResolved(fileAt(state, tip(state, 'main'), SYNC_INDEX)) && tip(state, 'main') === serverTip(state, 'main');

const landOfflineCache: Mission = {
  id: 'land-offline-cache',
  number: '7.11',
  title: 'Land the offline-cache PR',
  capstone: true,
  story:
    'Samir is on holiday and asked you to land his offline-cache PR. GitHub says it is out of date with main and has conflicts: Lea just merged queue events that touch the same line of packages/sync/src/index.ts.',
  goal: 'Update feature/offline-cache with main and resolve the conflict there, push it, merge it into main with --no-ff, push main, then delete the branch locally and on origin.',
  outcome: {
    summary:
      "Samir's offline cache lands on main as one merge commit, on top of Lea's queue events with the conflict resolved, and main is pushed. The PR branch is deleted locally and on origin, so nothing stale is left behind.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -5 origin/main',
      output: '*   c77235e (HEAD -> main, origin/main, origin/HEAD) Merge pull request #57 from nova/feature/offline-cache\n|\\\n| * 645f3b2 test(sync): cover cache eviction\n| * bb333b3 feat(sync): read notes through the cache\n| * c19c698 feat(sync): add an IndexedDB cache adapter\n|/\n* 34640b2 feat(sync): export queue events from the package',
    },
  },
  checks: [
    {
      label: 'The PR branch has main\'s changes and the conflict resolved',
      proof: 'git log --oneline --graph -6',
      done: (state, ctx) => prReady(state, serverTip(state, CACHE_PR)) || prMerged(state, ctx),
    },
    { label: 'The PR is merged into main with a merge commit, and main is pushed', proof: 'git log --oneline --graph -5 origin/main', done: mainLanded },
    {
      label: 'feature/offline-cache is deleted locally and on origin',
      proof: 'git branch -a',
      done: (state, ctx) => mainLanded(state, ctx) && tip(state, CACHE_PR) === undefined && serverTip(state, CACHE_PR) === undefined,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(state),
      check(ctx.facts.inProgress === null, 'A rebase or merge is still in progress: resolve index.ts, git add it, then continue (or abort).'),
      check(isAncestor(state, leaCommit(state), tip(state, 'main')), "main must keep Lea's queue-events commit: pull it before merging."),
      check(
        prMerged(state, ctx),
        'main needs a merge commit for the PR, made after the branch was updated: bring origin/main into feature/offline-cache (rebase or merge), resolve index.ts keeping both exports, then git merge --no-ff from main.',
      ),
      check(
        indexResolved(fileAt(state, tip(state, 'main'), SYNC_INDEX)),
        'packages/sync/src/index.ts on main must export both openCache and onQueueEvent, without conflict markers.',
      ),
      check(tip(state, 'main') === serverTip(state, 'main'), 'Push main to origin.'),
      check(serverTip(state, CACHE_PR) === undefined, `The branch still exists on origin: git push origin --delete ${CACHE_PR}.`),
      check(tip(state, CACHE_PR) === undefined, `Your local ${CACHE_PR} still exists: git branch -d ${CACHE_PR}.`),
    ),
  hints: [
    'Resolve the conflict on the PR branch, as GitHub\'s "Update branch" would, then merge the way the merge button does.',
    'On feature/offline-cache: git fetch, then git rebase origin/main (or merge it). Keep both export lines in index.ts, git add, continue, push with --force-with-lease. Then on main: pull, git merge --no-ff, push, and delete the branch on origin and locally.',
    `git switch ${CACHE_PR}, git fetch, git rebase origin/main, nano ${SYNC_INDEX}, git add ${SYNC_INDEX}, git rebase --continue, git push --force-with-lease, git switch main, git pull --ff-only, git merge --no-ff ${CACHE_PR} -m "Merge pull request #57", git push, git push origin --delete ${CACHE_PR}, git branch -d ${CACHE_PR}`,
  ],
  par: 13,
  takeaway: 'Resolve conflicts on the PR branch, merge it with a real merge commit, and clean the branch up everywhere.',
  theory: {
    title: 'Landing a pull request',
    body: 'GitHub will not merge a PR that conflicts with main: someone updates the branch, either by merging main into it (safe on a shared branch) or by rebasing it (a cleaner history, but it rewrites pushed commits, so push with --force-with-lease). The merge button then records a --no-ff merge commit on main, CI runs on the result, and the branch is deleted on the server and locally.',
    lesson: 'Update the branch, resolve there, merge --no-ff, push, delete.',
  },
  danger: 'Rebasing a pushed PR branch rewrites it: push with --force-with-lease, never plain --force, and only on a branch its owner agreed to let you update.',
  root: productionRepo({ remote: true }),
  prelude: [
    {
      id: 'm7.10-lea',
      teammate: 'lea',
      remote: { push: ['main'] },
      // ponytail: JSON.stringify quotes setup content (no tabs or control characters in it).
      commands: [`edit ${SYNC_INDEX} ${JSON.stringify(LEA_INDEX)}`, `git commit -q -am "${LEA_SUBJECT}"`],
    },
  ],
  reference: [
    `git switch ${CACHE_PR}`,
    'git fetch',
    'git! rebase origin/main',
    `edit ${SYNC_INDEX} ${JSON.stringify(RESOLVED_INDEX)}`,
    `git add ${SYNC_INDEX}`,
    'git rebase --continue',
    'git push --force-with-lease',
    'git switch main',
    'git pull --ff-only',
    `git merge --no-ff ${CACHE_PR} -m "Merge pull request #57 from nova/feature/offline-cache"`,
    'git push',
    `git push origin --delete ${CACHE_PR}`,
    `git branch -d ${CACHE_PR}`,
  ],
  alternatives: [
    [
      `git switch ${CACHE_PR}`,
      'git! pull origin main',
      `edit ${SYNC_INDEX} ${JSON.stringify(RESOLVED_INDEX.replace(`${OPEN_CACHE}\n${QUEUE_EVENTS}`, `${QUEUE_EVENTS}\n${OPEN_CACHE}`))}`,
      `git add ${SYNC_INDEX}`,
      'git commit --no-edit',
      'git push',
      'git switch main',
      'git pull',
      `git merge --no-ff --no-edit ${CACHE_PR}`,
      'git push origin main',
      `git branch -d ${CACHE_PR}`,
      `git push origin :${CACHE_PR}`,
    ],
  ],
};

export const level7: Level = {
  id: 'github',
  number: 7,
  title: 'GitHub and pull requests',
  topics: 'PR branches, reviews, update branch, conflicts, merge options, revert, protection, releases',
  planned: 11,
  remote: true,
  root: [
    'git init -b main',
    `edit README.md "${F.readmeTypo}"`,
    `edit app.ts "${F.app10}"`,
    `edit editor.ts "${F.plain}"`,
    'git add .',
    'git commit -m "Initial commit"',
    `git remote add origin ${ORIGIN_URL}`,
    'git push -u origin main',
  ],
  missions: [
    branchPerPr,
    reviewSuggestion,
    amendPr,
    updateBranch,
    prConflict,
    mergePr,
    revertPr,
    protectedMain,
    releaseCleanup,
    reviewBotPr,
    landOfflineCache,
  ],
};

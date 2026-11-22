/**
 * Level 11 — GitHub for real (online, opt-in). Practises on the player's private `<login>/gitquest-sandbox`
 * on github.com, created only after consent in the app. Every mission has its own root (a fresh clone), so
 * rebuilds re-clone locally and never write to GitHub; preludes only write files.
 *
 * Replays without resetting GitHub: validators count a PR, run or tag only when its commit exists locally and
 * is not in ctx.entryCommits (earlier attempts' commits arrive with the clone at entry, so they never count).
 * Branch names are namespaced `gq/11-<n>-…`; on a replay the player picks a new suffix when GitHub says the
 * old one exists.
 */
import type { RepoState } from '../../shared/repo-types';
import type { GitHubPullRequest, Level, Mission, MissionContext } from '../model';
import { SANDBOX_URL } from '../model';
import { snapshotOf, type ValidationResult } from '../validate';

const CLONE = [`git clone -q ${SANDBOX_URL} .`];

/** Setup `edit` for a multi-line file: escapes backslashes, double quotes and newlines. */
const write = (file: string, text: string): string =>
  `edit ${file} "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

export const FILES = {
  template: '## What\n\n## Why',
  ci: `name: CI
on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sh scripts/check.sh`,
  check: `#!/bin/sh
# Fails while any note still says TODO.
if grep -rn TODO notes; then
  echo "Remove the TODO lines above."
  exit 1
fi
echo "Notes look good."`,
  deploy: `name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Use the deploy token
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          if [ -z "$DEPLOY_TOKEN" ]; then echo "DEPLOY_TOKEN is not set"; exit 1; fi
          echo "Token received (\${#DEPLOY_TOKEN} characters). GitHub masks its value in logs."`,
} as const;

const CI_FILES = [write('.github/workflows/ci.yml', FILES.ci), write('scripts/check.sh', FILES.check)];

// Helpers ---------------------------------------------------------------------

const NO_FACTS = 'GitQuest has not heard from GitHub yet. Run a command or press Refresh from GitHub.';

/** Made in this attempt: exists locally and was not there at entry. */
const fresh = (state: RepoState, ctx: MissionContext, sha: string | null | undefined): boolean =>
  sha != null && state.commits[sha] !== undefined && !ctx.entryCommits.has(sha);

/** The local practice branch with this prefix whose tip was made in this attempt. */
function practice(state: RepoState, ctx: MissionContext, prefix: string): string | undefined {
  return Object.keys(state.branches)
    .filter((b) => b.startsWith(prefix) && fresh(state, ctx, state.branches[b]))
    .sort()[0];
}

const pushed = (state: RepoState, branch: string | undefined): boolean =>
  branch !== undefined && state.remoteTracking?.[`origin/${branch}`] === state.branches[branch];

/** This attempt's PRs from a `prefix` branch (head commit or merge commit made here). */
const prs = (state: RepoState, ctx: MissionContext, prefix: string): GitHubPullRequest[] =>
  (ctx.github?.pullRequests ?? []).filter(
    (pr) => pr.head.startsWith(prefix) && (fresh(state, ctx, pr.headOid) || fresh(state, ctx, pr.mergeCommit)),
  );

const runs = (state: RepoState, ctx: MissionContext, prefix: string) =>
  (ctx.github?.runs ?? []).filter((run) => run.branch.startsWith(prefix) && fresh(state, ctx, run.sha));

/** Reason for a run that has not succeeded (yet). */
function runReason(list: ReturnType<typeof runs>, what: string): string {
  const latest = list[0];
  if (latest === undefined) return `GitHub has no run for ${what} yet. Push it, then wait a few seconds and press Refresh from GitHub.`;
  if (latest.status !== 'completed') return `The run for ${what} is ${latest.status.replace('_', ' ')} on GitHub. Follow it with gh run watch.`;
  return `The latest run for ${what} ended with ${latest.conclusion ?? 'no result'}. Read it with gh run view --log-failed.`;
}

const isAncestor = (state: RepoState, ancestor: string, tip: string | undefined): boolean => {
  const seen = new Set<string>();
  const todo = tip === undefined ? [] : [tip];
  while (todo.length > 0) {
    const hash = todo.pop() as string;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    todo.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
};

interface Rule {
  readonly label: string;
  readonly proof: string;
  readonly done: (state: RepoState, ctx: MissionContext) => boolean;
  readonly reason: string | ((state: RepoState, ctx: MissionContext) => string);
  /** Needs ctx.github. */
  readonly online?: boolean;
}

/** Checks and validate from one rule list: the first rule not met gives the reason. */
function judged(rules: readonly Rule[]): Pick<Mission, 'checks' | 'validate'> {
  return {
    checks: rules.map(({ label, proof, done }) => ({ label, proof, done })),
    validate: (state, ctx): ValidationResult => {
      const miss = rules.find((rule) => !rule.done(state, ctx));
      if (miss === undefined) return { ok: true };
      if (miss.online === true && ctx.github == null) return { ok: false, reason: NO_FACTS };
      return { ok: false, reason: typeof miss.reason === 'string' ? miss.reason : miss.reason(state, ctx) };
    },
  };
}

const committed = (prefix: string, label: string, file?: string): Rule => ({
  label,
  proof: 'git log --oneline main..HEAD',
  done: (s, c) => {
    const branch = practice(s, c, prefix);
    return branch !== undefined && (file === undefined || snapshotOf(s, s.branches[branch])[file] !== undefined);
  },
  reason: `Commit the prepared files on a new branch whose name starts with ${prefix}.`,
});

const pushedRule = (prefix: string): Rule => ({
  label: 'Branch pushed to GitHub',
  proof: 'git ls-remote --heads origin',
  done: (s, c) => pushed(s, practice(s, c, prefix)),
  reason: `Push your ${prefix} branch with git push -u origin <branch>. If GitHub rejects it because the name exists from an earlier try, use a new name.`,
});

const STAY = ' Branches are namespaced gq/11-... so you can replay a mission: if GitHub says a name already exists from an earlier try, pick a new suffix.';

// Missions --------------------------------------------------------------------

const openPr: Mission = {
  id: 'gh-open-pr',
  number: '11.1',
  title: 'Push a branch, open a pull request',
  goal: 'Commit the prepared note on a gq/11-1- branch, push it and open a pull request into main whose body keeps the template headings.',
  story:
    'Your sandbox is a real private repo on GitHub, cloned into ~/GitQuest/nova. Lea added a pull request template and a hello note. Ship them the way the team ships everything: a branch, a push, a pull request.',
  ...judged([
    committed('gq/11-1-', 'Commit on a gq/11-1- branch'),
    pushedRule('gq/11-1-'),
    {
      label: 'Pull request into main',
      proof: 'gh pr view',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-1-').some((pr) => pr.base === 'main'),
      reason: 'Open a pull request from your branch into main with gh pr create.',
    },
    {
      label: 'Body follows the template',
      proof: 'gh pr view --json body',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-1-').some((pr) => pr.body.includes('## What') && pr.body.includes('## Why')),
      reason: 'The pull request body should keep the template headings ## What and ## Why: pass --body-file .github/pull_request_template.md.',
    },
  ]),
  hints: [
    'A pull request asks to merge one branch into another, so the branch must exist on GitHub first.',
    `Switch to a new branch gq/11-1-hello, commit everything, push it with -u, then gh pr create with the template as body.${STAY}`,
    'git switch -c gq/11-1-hello\ngit add -A\ngit commit -m "docs: hello note"\ngit push -u origin gq/11-1-hello\ngh pr create --base main --title "docs: hello note" --body-file .github/pull_request_template.md',
  ],
  par: 5,
  takeaway: 'A pull request is a branch on GitHub plus a conversation about merging it; gh pr create opens one from the terminal.',
  theory: {
    title: 'Pull requests on github.com',
    body: 'git push copies your branch to GitHub; a pull request then proposes merging it into main and gives reviewers and CI a place to weigh in. A file at .github/pull_request_template.md pre-fills the description so every PR answers the same questions.',
    lesson: 'Push the branch, then propose it with gh pr create.',
  },
  // Level 11 outcome outputs are illustrative (gh 2.102 formats, TTY): they cannot be replayed offline.
  outcome: {
    summary:
      'Your branch is on GitHub with an open pull request into main whose description follows the team template. Pull requests are where reviewers, CI and agents meet before anything reaches main.',
    expect: {
      kind: 'terminal',
      command: 'gh pr view --json baseRefName,body,state',
      output: `{
  "baseRefName": "main",
  "body": "## What\\n\\n## Why\\n",
  "state": "OPEN"
}`,
    },
  },
  root: CLONE,
  prelude: [
    {
      id: 'gh-open-pr-files',
      commands: [write('.github/pull_request_template.md', FILES.template), 'edit notes/hello.md "Hello from the Nova sandbox."'],
    },
  ],
  reference: [
    'git switch -c gq/11-1-hello',
    'git add -A',
    'git commit -m "docs: hello note"',
    'git push -u origin gq/11-1-hello',
    'gh pr create --base main --title "docs: hello note" --body-file .github/pull_request_template.md',
  ],
  undo: false,
};

const firstRun: Mission = {
  id: 'gh-first-ci-run',
  number: '11.2',
  title: 'A real CI run',
  goal: 'Commit the prepared workflow on a gq/11-2- branch, push it and watch GitHub Actions run it to success.',
  story:
    'Samir wrote a CI workflow that checks the notes on every push. On your laptop it is just a YAML file; on GitHub it starts a real machine. Push it and watch the run.',
  ...judged([
    committed('gq/11-2-', 'Workflow committed on a gq/11-2- branch', '.github/workflows/ci.yml'),
    pushedRule('gq/11-2-'),
    {
      label: 'GitHub ran the workflow',
      proof: 'gh run list',
      online: true,
      done: (s, c) => runs(s, c, 'gq/11-2-').length > 0,
      reason: (s, c) => runReason(runs(s, c, 'gq/11-2-'), 'your push'),
    },
    {
      label: 'The run succeeded',
      proof: 'gh run watch',
      online: true,
      done: (s, c) => runs(s, c, 'gq/11-2-').some((run) => run.conclusion === 'success'),
      reason: (s, c) => runReason(runs(s, c, 'gq/11-2-'), 'your push'),
    },
  ]),
  hints: [
    'Workflows in .github/workflows run on GitHub, not on your Mac, and only once they are pushed.',
    `Commit on a new branch gq/11-2-ci, push it, then gh run watch (or gh run list) shows the run.${STAY}`,
    'git switch -c gq/11-2-ci\ngit add -A\ngit commit -m "ci: check notes on every push"\ngit push -u origin gq/11-2-ci\ngh run watch',
  ],
  par: 5,
  takeaway: 'A pushed workflow file becomes real runs on GitHub; gh run list and gh run watch follow them from the terminal.',
  theory: {
    title: 'GitHub Actions',
    body: 'A workflow is YAML in .github/workflows: on says when it runs, jobs say what runs on a fresh virtual machine. Private repos on the free plan get a monthly allowance of Actions minutes; this check takes a few seconds of it.',
    lesson: 'Workflows run on GitHub only once they are pushed.',
  },
  outcome: {
    summary:
      'GitHub ran the pushed workflow on a fresh machine and it finished green. That check is what reviewers and branch rules rely on before merging anyone\'s work, an agent\'s included.',
    expect: {
      kind: 'terminal',
      command: 'gh run list -L 1',
      output: `STATUS  TITLE                          WORKFLOW  BRANCH      EVENT  ID           ELAPSED  AGE
✓       ci: check notes on every push  CI        gq/11-2-ci  push   19473521806  9s       about 1 minute ago`,
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-first-ci-run-files', commands: [...CI_FILES, 'edit notes/ideas.md "Ideas: dark mode, sync status in the menu bar."'] }],
  reference: [
    'git switch -c gq/11-2-ci',
    'git add -A',
    'git commit -m "ci: check notes on every push"',
    'git push -u origin gq/11-2-ci',
    'gh run watch',
  ],
  undo: false,
};

const todoFile = 'notes/plan.md';
const fixRun: Mission = {
  id: 'gh-fix-red-build',
  number: '11.3',
  title: 'Fix a red build',
  goal: 'Push the draft on a gq/11-3- branch, read why its run fails, push a fix and get a green run on it.',
  story:
    'Ines left a TODO in the sync plan, and the CI check refuses notes with TODO lines. Push the draft as it is, let GitHub tell you what is wrong, then fix it.',
  ...judged([
    {
      label: 'GitHub showed a failing run',
      proof: 'gh run view --log-failed',
      online: true,
      done: (s, c) => runs(s, c, 'gq/11-3-').some((run) => run.conclusion === 'failure'),
      reason: (s, c) =>
        practice(s, c, 'gq/11-3-') === undefined
          ? 'Commit the draft as it is on a new gq/11-3- branch and push it, so GitHub runs the check and fails.'
          : runReason(runs(s, c, 'gq/11-3-'), 'the draft'),
    },
    {
      label: 'Fix committed: no TODO left',
      proof: `git show HEAD:${todoFile}`,
      done: (s, c) => {
        const branch = practice(s, c, 'gq/11-3-');
        const plan = branch === undefined ? undefined : snapshotOf(s, s.branches[branch])[todoFile];
        return plan !== undefined && !plan.includes('TODO');
      },
      reason: `Remove the TODO line from ${todoFile} and commit the fix on the same branch.`,
    },
    pushedRule('gq/11-3-'),
    {
      label: 'Green run on the fix',
      proof: 'gh run watch',
      online: true,
      done: (s, c) => {
        const branch = practice(s, c, 'gq/11-3-');
        return runs(s, c, 'gq/11-3-').some((run) => run.conclusion === 'success' && branch !== undefined && run.sha === s.branches[branch]);
      },
      reason: (s, c) => runReason(runs(s, c, 'gq/11-3-'), 'the fix'),
    },
  ]),
  hints: [
    'Push before fixing: GitHub only runs what it receives, and you want to see the red run first.',
    `Push the draft on gq/11-3-fix, read the failing step with gh run view --log-failed, delete the TODO line, commit and push again.${STAY}`,
    `git switch -c gq/11-3-fix\ngit add -A\ngit commit -m "notes: draft sync plan"\ngit push -u origin gq/11-3-fix\ngh run view --log-failed\nnano ${todoFile}   (delete the TODO line)\ngit commit -am "notes: drop the TODO"\ngit push\ngh run watch`,
  ],
  par: 9,
  takeaway: 'A red run is a message: gh run view --log-failed shows the failing step, and a new push starts a new run.',
  theory: {
    title: 'Reading a failed run',
    body: 'Every push starts a fresh run for the commit at the tip of the branch. gh run view --log-failed prints only the steps that failed, and gh run rerun repeats a run without a new commit when the failure was flaky.',
    lesson: 'Push, read the red step, fix, push again.',
  },
  outcome: {
    summary:
      'Your branch shows a red run for the draft and a green run for the fix on top of it. Reading a failed run and answering with a new push is the everyday CI loop.',
    expect: {
      kind: 'terminal',
      command: 'gh run list -L 2',
      output: `STATUS  TITLE                   WORKFLOW  BRANCH       EVENT  ID           ELAPSED  AGE
✓       notes: drop the TODO    CI        gq/11-3-fix  push   19473640217  8s       about 1 minute ago
X       notes: draft sync plan  CI        gq/11-3-fix  push   19473598830  10s      about 3 minutes ago`,
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-fix-red-build-files', commands: [...CI_FILES, write(todoFile, 'Ship sync in March.\nTODO: write the release note')] }],
  reference: [
    'git switch -c gq/11-3-fix',
    'git add -A',
    'git commit -m "notes: draft sync plan"',
    'git push -u origin gq/11-3-fix',
    'gh run view --log-failed',
    `edit ${todoFile} "Ship sync in March."`,
    'git commit -am "notes: drop the TODO"',
    'git push',
    'gh run watch',
  ],
  undo: false,
};

const checksGreen = (pr: GitHubPullRequest): boolean =>
  pr.checks.length > 0 && pr.checks.every((check) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes((check.conclusion ?? '').toUpperCase()));

const review: Mission = {
  id: 'gh-review-checks',
  number: '11.4',
  title: 'Review on a team of one',
  goal: 'Open a pull request from a gq/11-4- branch, wait for its checks to pass and leave a review comment on it.',
  story:
    'On the Nova team nobody merges without green checks and a review. GitHub will not let you approve your own pull request, but you can still comment as a reviewer and read the checks.',
  ...judged([
    {
      label: 'Pull request from a gq/11-4- branch',
      proof: 'gh pr view',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-4-').length > 0,
      reason: 'Commit the checklist on a new gq/11-4- branch, push it and open a pull request with gh pr create --fill.',
    },
    {
      label: 'Every check passed',
      proof: 'gh pr checks',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-4-').some(checksGreen),
      reason: (s, c) => {
        const checks = prs(s, c, 'gq/11-4-')[0]?.checks ?? [];
        if (checks.length === 0) return 'GitHub shows no checks on the pull request yet. Wait a few seconds and run gh pr checks.';
        return 'Some checks are still running or failed. Follow them with gh pr checks --watch.';
      },
    },
    {
      label: 'A review comment on it',
      proof: 'gh pr view --json reviews',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-4-').some((pr) => pr.reviews.some((r) => r.state === 'COMMENTED')),
      reason: 'Leave a review comment with gh pr review --comment --body "...".',
    },
  ]),
  hints: [
    'Reviews are attached to a pull request, and checks come from the workflow that runs on its commit.',
    `Push a gq/11-4-review branch, gh pr create --fill, gh pr checks --watch, then gh pr review --comment.${STAY}`,
    'git switch -c gq/11-4-review\ngit add -A\ngit commit -m "docs: review checklist"\ngit push -u origin gq/11-4-review\ngh pr create --fill\ngh pr checks --watch\ngh pr review --comment --body "Checklist reads well, checks are green."',
  ],
  par: 7,
  takeaway: 'gh pr checks shows the CI verdict on a PR; reviews are approve, request changes or comment, and only someone else can approve.',
  theory: {
    title: 'Reviews and checks',
    body: 'A review is approve, request changes or comment; GitHub blocks the first two on your own pull request, so on a team of one you practise comments. gh pr checks lists every status check on the head commit, and --watch waits until they finish.',
    lesson: 'Checks gate the merge; only someone else can approve.',
  },
  outcome: {
    summary:
      'Your pull request has all checks green and a review comment on it. Green checks plus a human review is the gate every change, including an agent\'s, should pass.',
    expect: {
      kind: 'terminal',
      command: "gh pr view --json reviews --jq '.reviews[].state'",
      output: 'COMMENTED',
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-review-checks-files', commands: [...CI_FILES, 'edit notes/review.md "Review checklist: tests, naming, docs."'] }],
  reference: [
    'git switch -c gq/11-4-review',
    'git add -A',
    'git commit -m "docs: review checklist"',
    'git push -u origin gq/11-4-review',
    'gh pr create --fill',
    'gh pr checks --watch',
    'gh pr review --comment --body "Checklist reads well, checks are green."',
  ],
  undo: false,
};

/** This attempt's merged PR from `prefix`. */
const merged = (s: RepoState, c: MissionContext, prefix: string) => prs(s, c, prefix).find((pr) => pr.state === 'MERGED');

const squash: Mission = {
  id: 'gh-squash-merge',
  number: '11.5',
  title: 'Squash, merge and sync',
  goal: 'Merge a two-commit pull request from a gq/11-5- branch with a squash, delete its branch and bring the result into your local main.',
  story:
    'Yanis likes a main branch where every pull request is one commit. Make two small commits, open the pull request and squash it into main from the terminal.',
  ...judged([
    {
      label: 'Pull request merged on GitHub',
      proof: 'gh pr view --json state',
      online: true,
      done: (s, c) => merged(s, c, 'gq/11-5-') !== undefined,
      reason: 'Push a gq/11-5- branch with your commits, open a pull request and merge it with gh pr merge --squash --delete-branch.',
    },
    {
      label: 'Local main has the merge',
      proof: 'git log --oneline -3 main',
      online: true,
      done: (s, c) => {
        const oid = merged(s, c, 'gq/11-5-')?.mergeCommit;
        return oid != null && isAncestor(s, oid, s.branches.main);
      },
      reason: 'GitHub merged it, but your local main does not have the merge yet: git switch main, then git pull.',
    },
    {
      label: 'One squash commit, not a merge commit',
      proof: 'git show --no-patch main',
      online: true,
      done: (s, c) => {
        const oid = merged(s, c, 'gq/11-5-')?.mergeCommit;
        return oid != null && s.commits[oid]?.parents.length === 1;
      },
      reason: 'The pull request was merged with a merge commit. Replay with a new gq/11-5- branch and use gh pr merge --squash.',
    },
    {
      label: 'Branch deleted on GitHub',
      proof: 'git ls-remote --heads origin',
      online: true,
      done: (s, c) => {
        const pr = merged(s, c, 'gq/11-5-');
        return pr !== undefined && !(c.github?.branches ?? []).includes(pr.head);
      },
      reason: 'The merged branch is still on GitHub: git push origin --delete <branch>, or merge with --delete-branch next time.',
    },
  ]),
  hints: [
    'Squash turns every commit of the pull request into one new commit on main; the original commits stay only on the branch.',
    `Two commits on gq/11-5-squash, push, gh pr create --fill, then gh pr merge --squash --delete-branch and pull main.${STAY}`,
    'git switch -c gq/11-5-squash\ngit add notes/sync.md\ngit commit -m "notes: sync plan"\ngit add notes/offline.md\ngit commit -m "notes: offline plan"\ngit push -u origin gq/11-5-squash\ngh pr create --fill\ngh pr merge --squash --delete-branch\ngit switch main\ngit pull',
  ],
  par: 10,
  takeaway: 'A squash merge lands a pull request as one commit on main; pull afterwards, because your local main does not move by itself.',
  theory: {
    title: 'Merge methods',
    body: 'GitHub merges a pull request with a merge commit, a squash or a rebase; the repo settings decide which are allowed. Branch protection and rulesets can require reviews and green checks before merging, but private repos on the free plan cannot use them, so here the rules live in your habits.',
    lesson: 'Squash on GitHub, then pull to see it locally.',
  },
  outcome: {
    summary:
      'The pull request landed on main as a single squash commit, its branch is gone from GitHub, and your local main has the result. One commit per pull request keeps main easy to read and to revert.',
    expect: {
      kind: 'terminal',
      command: 'gh pr view gq/11-5-squash --json headRefName,state',
      output: `{
  "headRefName": "gq/11-5-squash",
  "state": "MERGED"
}`,
    },
  },
  root: CLONE,
  prelude: [
    {
      id: 'gh-squash-merge-files',
      commands: ['edit notes/sync.md "Sync runs every five minutes."', 'edit notes/offline.md "Offline edits wait in a queue."'],
    },
  ],
  reference: [
    'git switch -c gq/11-5-squash',
    'git add notes/sync.md',
    'git commit -m "notes: sync plan"',
    'git add notes/offline.md',
    'git commit -m "notes: offline plan"',
    'git push -u origin gq/11-5-squash',
    'gh pr create --fill',
    'gh pr merge --squash --delete-branch',
    'git switch main',
    'git pull',
  ],
  undo: false,
};

const closes: Mission = {
  id: 'gh-issue-closes',
  number: '11.6',
  title: 'An issue closed by a pull request',
  goal: 'Open an issue, fix it in a pull request from a gq/11-6- branch whose body says Closes #n, merge it and see the issue close.',
  story:
    'New players keep asking how sync works, so Lea wants an issue for a sync guide. The guide is already written in notes/guide.md. Link the pull request to the issue so merging it closes the issue by itself.',
  ...judged([
    {
      label: 'Pull request closes an issue',
      proof: 'gh pr view --json closingIssuesReferences',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-6-').some((pr) => pr.closingIssues.length > 0),
      reason: 'Open the issue with gh issue create, then a pull request from a gq/11-6- branch whose body says Closes #<issue number>.',
    },
    {
      label: 'Pull request merged',
      proof: 'gh pr view --json state',
      online: true,
      done: (s, c) => prs(s, c, 'gq/11-6-').some((pr) => pr.closingIssues.length > 0 && pr.state === 'MERGED'),
      reason: 'Merge the pull request: gh pr merge --squash --delete-branch.',
    },
    {
      label: 'The issue is closed',
      proof: 'gh issue list --state closed',
      online: true,
      done: (s, c) =>
        prs(s, c, 'gq/11-6-').some(
          (pr) => pr.state === 'MERGED' && pr.closingIssues.some((n) => c.github?.issues.find((i) => i.number === n)?.state === 'CLOSED'),
        ),
      reason: 'The issue is still open. GitHub closes it a moment after the merge: press Refresh from GitHub.',
    },
  ]),
  hints: [
    'GitHub reads keywords like Closes #12 in a pull request body and closes that issue when the pull request merges into main.',
    `gh issue create prints the issue number; use it in the pull request body as Closes #<number>, then merge.${STAY}`,
    'gh issue create --title "Write a sync guide" --body "New players ask how sync works."\ngit switch -c gq/11-6-guide\ngit add notes/guide.md\ngit commit -m "docs: sync guide"\ngit push -u origin gq/11-6-guide\ngh pr create --title "docs: sync guide" --body "Closes #1"   (your issue number)\ngh pr merge --squash --delete-branch',
  ],
  par: 7,
  takeaway: 'Closes #n in a pull request body links it to the issue, and merging into the default branch closes the issue for you.',
  theory: {
    title: 'Issues and closing keywords',
    body: 'Issues track work to do; pull requests deliver it. The words close, fix or resolve followed by #n in a pull request description link the two, and GitHub closes the issue when that pull request merges into the default branch.',
    lesson: 'Closes #n in the PR body closes the issue on merge.',
  },
  outcome: {
    summary:
      'The sync guide is merged and the issue that asked for it closed by itself. Linking pull requests to issues keeps the backlog honest without manual bookkeeping.',
    expect: {
      kind: 'terminal',
      command: 'gh issue view 1 --json state,stateReason',
      output: `{
  "state": "CLOSED",
  "stateReason": "COMPLETED"
}`,
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-issue-closes-files', commands: ['edit notes/guide.md "How sync works: edit a note, it syncs within five minutes."'] }],
  reference: [
    'gh issue create --title "Write a sync guide" --body "New players ask how sync works."',
    'git switch -c gq/11-6-guide',
    'git add notes/guide.md',
    'git commit -m "docs: sync guide"',
    'git push -u origin gq/11-6-guide',
    'gh pr create --title "docs: sync guide" --body "Closes #1"',
    'gh pr merge --squash --delete-branch',
  ],
  undo: false,
};

const VERSION = /^v\d+\.\d+\.\d+$/;
/** Version tags made in this attempt (pointing at a commit made in this attempt). */
const newTags = (s: RepoState, c: MissionContext) => c.facts.tags.filter((t) => VERSION.test(t.name) && fresh(s, c, t.target));

const release: Mission = {
  id: 'gh-release',
  number: '11.7',
  title: 'Ship a release',
  goal: 'Commit the changelog on main, push it, tag the commit with a version like v0.1.0, push the tag and publish a GitHub release with generated notes.',
  story:
    'The sandbox has enough merged work for a first release. Samir prepared CHANGELOG.md. Tag the release commit and let GitHub write the notes from the merged pull requests.',
  ...judged([
    {
      label: 'Release commit pushed to main',
      proof: 'git log --oneline -1 origin/main',
      done: (s, c) => fresh(s, c, s.branches.main) && s.remoteTracking?.['origin/main'] === s.branches.main,
      reason: 'Commit CHANGELOG.md on main and push main to GitHub.',
    },
    {
      label: 'Version tag on that commit',
      proof: "git tag --list 'v*'",
      done: (s, c) => newTags(s, c).length > 0,
      reason: 'Tag your release commit with a version such as v0.1.0 (a later free version if v0.1.0 exists from an earlier try).',
    },
    {
      label: 'Release published on GitHub',
      proof: 'gh release list',
      online: true,
      done: (s, c) => {
        const tags = new Set(newTags(s, c).map((t) => t.name));
        return (c.github?.releases ?? []).some((r) => tags.has(r.tag) && !r.draft);
      },
      reason: 'Push the tag with git push origin <tag>, then gh release create <tag> --generate-notes.',
    },
  ]),
  hints: [
    'A GitHub release is a page attached to a tag: the tag marks the exact commit you ship.',
    'Commit and push main, git tag v0.1.0, git push origin v0.1.0, then gh release create v0.1.0 --generate-notes. On a replay pick the next free version, like v0.1.1.',
    'git add CHANGELOG.md\ngit commit -m "chore: release 0.1.0"\ngit push origin main\ngit tag v0.1.0\ngit push origin v0.1.0\ngh release create v0.1.0 --generate-notes',
  ],
  par: 6,
  takeaway: 'Tags mark what you shipped; gh release create turns a tag into a release page with notes generated from merged pull requests.',
  theory: {
    title: 'Tags and releases',
    body: 'git push does not send tags unless you name them, so push the tag before creating the release. --generate-notes lists the pull requests merged since the previous release, which is why clear PR titles pay off.',
    lesson: 'Push the tag first, then release it.',
  },
  outcome: {
    summary:
      'A version tag marks the exact commit you shipped, and a published GitHub release lists the merged pull requests since the last one. Anyone can then download or roll back to precisely that version.',
    expect: {
      kind: 'terminal',
      command: 'gh release view v0.1.0 --json tagName,isDraft,isPrerelease',
      output: `{
  "isDraft": false,
  "isPrerelease": false,
  "tagName": "v0.1.0"
}`,
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-release-files', commands: [write('CHANGELOG.md', '## 0.1.0\n- First practice release of the Nova sandbox')] }],
  reference: [
    'git add CHANGELOG.md',
    'git commit -m "chore: release 0.1.0"',
    'git push origin main',
    'git tag v0.1.0',
    'git push origin v0.1.0',
    'gh release create v0.1.0 --generate-notes',
  ],
  undo: false,
};

const SECRET_VALUE = 'fake-value';
const secret: Mission = {
  id: 'gh-secret',
  number: '11.8',
  title: 'A secret in CI',
  goal: 'Store DEPLOY_TOKEN as a repo secret, push the deploy workflow on a gq/11-8- branch and get a green run without the value in any file.',
  story:
    'The deploy job needs a token, and tokens never go into the repo. Store a fake one as a GitHub secret and let the workflow read it at run time.',
  ...judged([
    {
      label: 'Secret DEPLOY_TOKEN on the repo',
      proof: 'gh secret list',
      online: true,
      done: (_s, c) => (c.github?.secrets ?? []).includes('DEPLOY_TOKEN'),
      reason: `Set the secret with gh secret set DEPLOY_TOKEN --body ${SECRET_VALUE}.`,
    },
    {
      label: 'Workflow committed, value in no file',
      proof: 'git grep fake-value',
      done: (s, c) => {
        const branch = practice(s, c, 'gq/11-8-');
        const files = branch === undefined ? {} : snapshotOf(s, s.branches[branch]);
        return files['.github/workflows/deploy.yml'] !== undefined && !Object.values(files).some((text) => text.includes(SECRET_VALUE));
      },
      reason: (s, c) =>
        practice(s, c, 'gq/11-8-') === undefined
          ? 'Commit the deploy workflow on a new gq/11-8- branch.'
          : `A committed file contains ${SECRET_VALUE}. Secrets live on GitHub only: remove it and commit again.`,
    },
    pushedRule('gq/11-8-'),
    {
      label: 'Deploy run passed',
      proof: 'gh run watch',
      online: true,
      done: (s, c) => runs(s, c, 'gq/11-8-').some((run) => run.name === 'Deploy' && run.conclusion === 'success'),
      reason: (s, c) => runReason(runs(s, c, 'gq/11-8-'), 'the deploy workflow'),
    },
  ]),
  hints: [
    'Secrets are stored encrypted on GitHub and handed to workflows as ${{ secrets.NAME }}; nobody can read them back, not even you.',
    `gh secret set stores it; then commit the workflow on gq/11-8-secret, push and watch the run.${STAY}`,
    `gh secret set DEPLOY_TOKEN --body ${SECRET_VALUE}\ngit switch -c gq/11-8-secret\ngit add -A\ngit commit -m "ci: deploy with a token"\ngit push -u origin gq/11-8-secret\ngh run watch`,
  ],
  par: 6,
  takeaway: 'Credentials go into repo secrets, never into files; workflows read them at run time and GitHub masks them in logs.',
  theory: {
    title: 'Secrets in Actions',
    body: 'gh secret set encrypts a value for the repo; a workflow receives it through ${{ secrets.DEPLOY_TOKEN }} and GitHub replaces it with *** in logs. gh secret list shows names and dates only, never values.',
    lesson: 'Secrets live on GitHub, never in a file.',
  },
  outcome: {
    summary:
      'DEPLOY_TOKEN lives encrypted on GitHub, the deploy run read it and passed, and no file in the repo holds its value. Secrets that never touch git cannot leak through a commit, a fork or an agent\'s diff.',
    expect: {
      kind: 'terminal',
      command: 'gh secret list',
      output: `NAME          UPDATED
DEPLOY_TOKEN  about 1 minute ago`,
    },
  },
  root: CLONE,
  prelude: [{ id: 'gh-secret-files', commands: [write('.github/workflows/deploy.yml', FILES.deploy)] }],
  reference: [
    `gh secret set DEPLOY_TOKEN --body ${SECRET_VALUE}`,
    'git switch -c gq/11-8-secret',
    'git add -A',
    'git commit -m "ci: deploy with a token"',
    'git push -u origin gq/11-8-secret',
    'gh run watch',
  ],
  undo: false,
};

export const level11: Level = {
  id: 'github-for-real',
  number: 11,
  title: 'GitHub for real',
  topics: 'Real pull requests, Actions runs, issues, releases and secrets',
  planned: 8,
  warning: 'uses a private repo on your GitHub account',
  online: true,
  root: CLONE,
  missions: [openPr, firstRun, fixRun, review, squash, closes, release, secret],
};

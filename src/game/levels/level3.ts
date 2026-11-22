/**
 * Level 3 — Remotes and syncing. The player's Nova repo is connected to origin (a local bare repo
 * standing in for GitHub); teammates push to it through prelude remote steps.
 */
import { allOf, check, commitDelta, headBranch, headFile, isWorkingTreeClean, snapshotOf } from '../validate';

import { ORIGIN_URL, type Level, type Mission, type MissionContext } from '../model';
import { productionRepo, teammatePushesHotfix } from '../production';
import type { RepoState } from '../../shared/repo-types';

// Story file contents ------------------------------------------------------

const F = {
  notes1: '# Nova notes',
  notes2: '# Nova notes\nSync runs every 5 minutes.',
  sync1: "export const sync = 'v1';",
  sync2: "export const sync = 'v2';",
  sync3: "export const sync = 'v3';",
  offline: 'export const queue = [];',
  offlineTest: "test('queue starts empty');",
  offlineDoc: 'Offline mode: edits wait in a queue until the network is back.',
  roadmap: 'Roadmap: offline mode, then search.',
  ideas: 'Ideas: tags, search, dark mode.',
  team: 'Team: Lea, Samir, Ines, Yanis.',
  search: 'export const search = () => [];',
} as const;

// Level helpers --------------------------------------------------------------

/** Branches as the server (origin) has them right now. */
export function server(state: RepoState): Readonly<Record<string, string>> {
  return state.remotes?.origin?.branches ?? {};
}

export function tracking(state: RepoState, ref: string): string | undefined {
  return state.remoteTracking?.[ref];
}

/** True when `ancestor` is `descendant` or one of its ancestors. */
export function isAncestor(state: RepoState, ancestor: string | undefined, descendant: string | undefined): boolean {
  if (ancestor === undefined || descendant === undefined) return false;
  const seen = new Set<string>();
  const stack = [descendant];
  while (stack.length > 0) {
    const hash = stack.pop()!;
    if (hash === ancestor) return true;
    if (seen.has(hash)) continue;
    seen.add(hash);
    stack.push(...(state.commits[hash]?.parents ?? []));
  }
  return false;
}

export function fileAt(state: RepoState, hash: string | undefined, path: string): string | undefined {
  return snapshotOf(state, hash)[path];
}

export const notBusy = (state: RepoState) =>
  check(state.worktrees[state.activeWorktree]?.merge === undefined, 'Finish the merge first (resolve, git add, git commit) or run git merge --abort.');

// Missions -------------------------------------------------------------------

const firstPush: Mission = {
  id: 'push-upstream',
  number: '3.1',
  title: 'Publish your branch',
  story:
    'You built the offline queue on a new branch, feature/offline, but it only lives on your Mac. Lea wants to review it from her laptop tonight.',
  goal: 'Push feature/offline to origin and make it track origin/feature/offline.',
  checks: [
    {
      label: 'Push feature/offline to origin',
      proof: 'git ls-remote origin',
      done: (state) => server(state)['feature/offline'] !== undefined && server(state)['feature/offline'] === state.branches['feature/offline'],
    },
    {
      label: 'feature/offline tracks origin/feature/offline',
      proof: 'git branch -vv',
      done: (state) => state.upstream?.['feature/offline'] === 'origin/feature/offline',
    },
  ],
  validate: (state) =>
    allOf(
      check(server(state)['feature/offline'] !== undefined, 'origin has no feature/offline branch yet: push it.'),
      check(
        server(state)['feature/offline'] === state.branches['feature/offline'],
        'origin/feature/offline must point to the same commit as your local feature/offline.',
      ),
      check(
        state.upstream?.['feature/offline'] === 'origin/feature/offline',
        'feature/offline has no upstream yet: push with -u (or set it with git branch -u origin/feature/offline).',
      ),
    ),
  hints: [
    'A new branch is not on the server until you push it, and Git does not know where it should sync to.',
    'git push with -u both sends the branch and remembers origin/feature/offline as its upstream.',
    'git push -u origin feature/offline',
  ],
  par: 1,
  takeaway: 'git push -u sends a branch and sets its upstream, so later a plain git push or git pull knows where to go.',
  theory: {
    title: 'Remotes and upstreams',
    body: `A remote is a named URL; here origin is ${ORIGIN_URL}, which GitQuest maps to a folder on your Mac playing GitHub. Pushing with -u (--set-upstream) links your branch to origin/<branch>, the remote-tracking branch that remembers what the server had last time you talked to it. With push.autoSetupRemote = true, a plain git push does the same for new branches.`,
    lesson: 'First push of a branch: git push -u origin <branch>.',
  },
  outcome: {
    summary:
      'feature/offline is on origin and remembers origin/feature/offline as its upstream. Lea can check it out tonight, and your next push or pull needs no arguments.',
    expect: {
      kind: 'terminal',
      command: 'git branch -vv',
      output: '* feature/offline e78f78b [origin/feature/offline] feat: offline queue\n  main            72cccf0 [origin/main] Initial commit',
    },
  },
  prelude: [
    {
      id: 'm3.1-p1',
      commands: [
        'git switch -c feature/offline',
        `edit offline.ts "${F.offline}"`,
        'git add offline.ts',
        'git commit -m "feat: offline queue"',
      ],
    },
  ],
  reference: ['git push -u origin feature/offline'],
  alternatives: [
    ['git push --set-upstream origin feature/offline'],
    ['git push origin feature/offline', 'git branch -u origin/feature/offline'],
    ['git config push.autoSetupRemote true', 'git push'],
  ],
};

// 3.2 is an inspection mission: the outcome is knowing what Lea pushed, so it reads ctx.commands.
const INSPECT = /^git (status|branch -vv|branch -v|log\b.*(origin|@\{u|@\{upstream|FETCH_HEAD)|diff\b.*(origin|@\{u|@\{upstream|FETCH_HEAD)|show\b.*(origin|FETCH_HEAD)|rev-list\b.*(origin|@\{u))/;
const FETCH = /^git (fetch|remote update)\b/;

function inspectedAfterFetch(ctx: MissionContext): boolean {
  const ok = ctx.commands.filter((c) => c.exitCode === 0 || c.exitCode === null).map((c) => c.command.trim());
  const firstFetch = ok.findIndex((c) => FETCH.test(c));
  return firstFetch >= 0 && ok.slice(firstFetch + 1).some((c) => INSPECT.test(c));
}

const fetchFirst: Mission = {
  id: 'fetch-ahead-behind',
  number: '3.2',
  title: 'Look before you pull',
  story:
    'Lea says she pushed something to main while you were on your branch. Before touching your main, you want to see exactly what is new on the server.',
  goal: 'Fetch from origin and inspect how far main is behind origin/main, without changing main.',
  checks: [
    {
      label: "Fetch: origin/main now has Lea's commit",
      proof: 'git log --oneline -1 origin/main',
      done: (state) => tracking(state, 'origin/main') !== undefined && tracking(state, 'origin/main') === server(state).main,
    },
    {
      label: 'Inspect the difference (git status or git log main..origin/main)',
      proof: 'git log --oneline main..origin/main',
      done: (state, ctx) => tracking(state, 'origin/main') === server(state).main && inspectedAfterFetch(ctx),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        tracking(state, 'origin/main') === server(state).main,
        "origin/main still shows the old server state. git fetch downloads Lea's commit without touching your branches.",
      ),
      check(
        !isAncestor(state, server(state).main, state.branches.main) && ctx.entryCommits.has(state.branches.main ?? ''),
        'Your main moved. This mission is about looking first: press Undo and only fetch.',
      ),
      check(
        inspectedAfterFetch(ctx),
        'Now look at the difference: git status shows "behind 1", git log main..origin/main lists the new commit.',
      ),
    ),
  hints: [
    'git status only knows what the server had at your last contact with it. First update that knowledge.',
    'git fetch updates origin/main and leaves main alone. Then compare main with origin/main.',
    'git fetch, then git log --oneline main..origin/main (or git status).',
  ],
  par: 2,
  takeaway: 'git fetch updates origin/* only; git log main..origin/main lists what you would get by pulling.',
  theory: {
    title: 'Fetch, then read ahead and behind',
    body: 'git fetch downloads new commits and moves the remote-tracking branches (origin/main) but never your own branches. git status then compares main with origin/main: "behind 1" means the server has one commit you do not. git log main..origin/main lists those commits, and git log origin/main..main lists yours that the server lacks.',
    lesson: 'Fetch is always safe: it only updates origin/*.',
  },
  outcome: {
    summary:
      'You know exactly what Lea pushed and how far behind your main is, while main itself stays untouched. Looking before you pull is how you avoid surprises.',
    expect: {
      kind: 'terminal',
      command: 'git branch -vv',
      output: '  feature/offline e78f78b [origin/feature/offline] feat: offline queue\n* main            72cccf0 [origin/main: behind 1] Initial commit',
    },
  },
  prelude: [
    { id: 'm3.2-p1', commands: ['git switch main'] },
    {
      id: 'm3.2-p2',
      teammate: 'lea',
      remote: { push: ['main'] },
      commands: [`edit notes.md "${F.notes2}"`, 'git commit -am "docs: sync interval"'],
    },
  ],
  reference: ['git fetch', 'git log --oneline main..origin/main'],
  alternatives: [['git fetch origin', 'git status'], ['git remote update', 'git branch -vv']],
};

const pullFastForward: Mission = {
  id: 'pull-fast-forward',
  number: '3.3',
  title: "Pull the team's work",
  story:
    "You read Lea's commit and it looks good. Meanwhile Samir pushed the roadmap. Bring your main up to date with the server.",
  goal: 'Update main to match origin/main exactly, as a fast-forward (no merge commit).',
  checks: [
    {
      label: "Fetch Samir's new commit too",
      proof: 'git log --oneline -1 origin/main',
      done: (state) => tracking(state, 'origin/main') === server(state).main,
    },
    {
      label: 'main is at the same commit as the server',
      proof: 'git status',
      done: (state) => state.branches.main === server(state).main,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headBranch(state) === 'main', 'Stay on main.'),
      check(
        state.branches.main === server(state).main,
        "main must end at the server's main. git merge origin/main alone uses old news: pull fetches first.",
      ),
      check(commitDelta(state, ctx) === 0, 'No new commit is needed: a fast-forward only moves main.'),
      check(headFile(state, 'roadmap.md') === F.roadmap, "Samir's roadmap.md should be in your main."),
    ),
  hints: [
    'Your origin/main is already stale again: Samir pushed after your fetch.',
    'git pull = git fetch + git merge. With nothing of your own on main, the merge is a fast-forward.',
    'git pull --ff-only',
  ],
  par: 1,
  takeaway: 'git pull fetches then merges; when you have no local commits it just fast-forwards main.',
  theory: {
    title: 'Pull = fetch + merge',
    body: 'git pull runs git fetch and then integrates origin/<branch> into your branch. If you have no local commits, the integration is a fast-forward: main simply moves to the newer commit. --ff-only makes pull refuse anything else, a safe default when you only want to catch up.',
    lesson: 'git pull --ff-only: catch up, never create a surprise merge.',
  },
  outcome: {
    summary:
      'Your main and origin/main point to the same commit, with no merge commit added. You start your next task on the team\'s latest code.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: 'b7983a4 (HEAD -> main, origin/main, origin/HEAD) docs: roadmap\ne266ce9 docs: sync interval\n72cccf0 Initial commit',
    },
  },
  prelude: [
    {
      id: 'm3.3-p1',
      teammate: 'samir',
      remote: { push: ['main'] },
      commands: [`edit roadmap.md "${F.roadmap}"`, 'git add roadmap.md', 'git commit -m "docs: roadmap"'],
    },
  ],
  reference: ['git pull --ff-only'],
  alternatives: [['git pull'], ['git fetch', 'git merge --ff-only origin/main']],
};

const divergent: Mission = {
  id: 'divergent-pull',
  number: '3.4',
  title: 'Divergent branches',
  story:
    'You committed sync v2 on main. Ines pushed her ideas list at the same time. Now your main and origin/main each have a commit the other lacks.',
  goal: "Bring Ines's commit into your main without losing sync v2 (merge or rebase, your choice).",
  checks: [
    {
      label: "Fetch Ines's commit",
      proof: 'git log --oneline -1 origin/main',
      done: (state) => tracking(state, 'origin/main') === server(state).main,
    },
    {
      label: "main has both Ines's commit and your sync v2",
      proof: 'git log --oneline --graph -5',
      done: (state) => isAncestor(state, server(state).main, state.branches.main) && headFile(state, 'sync.ts') === F.sync2,
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(headBranch(state) === 'main', 'Stay on main.'),
      check(isAncestor(state, server(state).main, state.branches.main), "main must contain Ines's commit from origin/main."),
      check(headFile(state, 'sync.ts') === F.sync2, 'Your sync v2 change must still be in main.'),
      check(headFile(state, 'ideas.md') === F.ideas, "Ines's ideas.md must be in main."),
      check(isWorkingTreeClean(state), 'Leave a clean working tree.'),
    ),
  hints: [
    'Both sides moved, so a fast-forward is impossible. Git needs you to choose how to reconcile.',
    'git pull --rebase replays your commit on top of Ines\'s (straight history). git pull --no-rebase makes a merge commit.',
    'git pull --rebase',
  ],
  par: 1,
  takeaway: 'Divergent branches need a choice: pull --rebase (linear) or pull --no-rebase (merge commit); set pull.rebase to make it your default.',
  theory: {
    title: 'Need to specify how to reconcile',
    body: 'When main and origin/main both have new commits, recent Git stops with "You have divergent branches and need to specify how to reconcile them". git pull --rebase replays your local commits on top of the server\'s; git pull --no-rebase creates a merge commit. git config pull.rebase true (or false) records your default so plain git pull stops asking.',
    lesson: 'Divergent? Pick --rebase or --no-rebase, or set pull.rebase once.',
  },
  outcome: {
    summary:
      'Your main holds both Ines\'s ideas list and your sync v2, so nothing is lost. Your branch is ready to push without overwriting anyone\'s work.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -3',
      output: '* 21dabfb (HEAD -> main) feat: sync v2\n* 26d491f (origin/main, origin/HEAD) docs: ideas\n* b7983a4 docs: roadmap',
    },
  },
  prelude: [
    { id: 'm3.4-p1', commands: [`edit sync.ts "${F.sync2}"`, 'git commit -am "feat: sync v2"'] },
    {
      id: 'm3.4-p2',
      teammate: 'ines',
      remote: { push: ['main'] },
      commands: [`edit ideas.md "${F.ideas}"`, 'git add ideas.md', 'git commit -m "docs: ideas"'],
    },
  ],
  reference: ['git pull --rebase'],
  alternatives: [['git pull --no-rebase'], ['git fetch', 'git rebase origin/main'], ['git config pull.rebase true', 'git pull']],
};

const rejectedPush: Mission = {
  id: 'push-rejected',
  number: '3.5',
  title: 'Push rejected',
  story:
    'You finished sync v3 and pushed, but Git answered "rejected (fetch first)": Yanis pushed the team list a minute earlier. Your commits have to land on the server without erasing his.',
  goal: "Integrate Yanis's commit, then push so origin/main has both your work and his.",
  checks: [
    {
      label: "Get Yanis's team.md into your main",
      proof: 'git log --oneline -3',
      done: (state) => headBranch(state) === 'main' && headFile(state, 'team.md') === F.team,
    },
    {
      label: "Push: origin's main matches yours, with sync v3",
      proof: 'git status',
      done: (state) => state.branches.main === server(state).main && fileAt(state, server(state).main, 'sync.ts') === F.sync3,
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(fileAt(state, server(state).main, 'team.md') === F.team, "Yanis's team.md disappeared from the server. Never force here: press Undo."),
      check(fileAt(state, server(state).main, 'sync.ts') === F.sync3, 'The server does not have your sync v3 yet: pull, then push.'),
      check(fileAt(state, server(state).main, 'ideas.md') === F.ideas, "Ines's ideas.md must stay on the server."),
      check(state.branches.main === server(state).main, 'Your main and origin/main must end at the same commit.'),
    ),
  hints: [
    'The server refuses a push that would drop commits it has and you do not. Get them first.',
    'Pull (with --rebase for a straight history), then push again.',
    'git pull --rebase, then git push',
  ],
  par: 2,
  takeaway: 'A rejected push means "the server has commits you lack": pull, then push. Never --force on a shared branch.',
  theory: {
    title: 'Rejected: non-fast-forward',
    body: 'origin only accepts a push that moves its branch forward. If a teammate pushed first, your main no longer contains the server\'s tip, so the push is rejected with "fetch first". Pull to integrate their commits, then push again; forcing would delete their work from the server.',
    lesson: 'Rejected push: pull, then push.',
  },
  outcome: {
    summary:
      'Your branch and origin agree: the server has Yanis\'s team list and both of your sync commits. Nobody\'s work was overwritten to get yours in.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -4',
      output: 'e1478af (HEAD -> main, origin/main, origin/HEAD) feat: sync v3\n45b8863 feat: sync v2\na6a5cad docs: team list\n26d491f docs: ideas',
    },
  },
  prelude: [
    { id: 'm3.5-p1', commands: [`edit sync.ts "${F.sync3}"`, 'git commit -am "feat: sync v3"'] },
    {
      id: 'm3.5-p2',
      teammate: 'yanis',
      remote: { push: ['main'] },
      commands: [`edit team.md "${F.team}"`, 'git add team.md', 'git commit -m "docs: team list"'],
    },
  ],
  reference: ['git pull --rebase', 'git push'],
  alternatives: [['git pull --no-rebase', 'git push'], ['git fetch', 'git rebase origin/main', 'git push origin main']],
};

const forceWithLease: Mission = {
  id: 'force-with-lease',
  number: '3.6',
  title: 'Force, politely',
  story:
    'You amended your pushed feature/offline commit to add the forgotten test, so it now needs a force push. What you do not know: Lea pushed offline.md to that branch an hour ago.',
  goal: "Get your rewritten commit onto origin/feature/offline without losing Lea's offline.md.",
  checks: [
    {
      label: "origin/feature/offline has your test and Lea's offline.md",
      proof: 'git ls-tree --name-only origin/feature/offline',
      done: (state) =>
        fileAt(state, server(state)['feature/offline'], 'offline.test.ts') === F.offlineTest &&
        fileAt(state, server(state)['feature/offline'], 'offline.md') === F.offlineDoc,
    },
    {
      label: 'Your feature/offline matches the server',
      proof: 'git status',
      done: (state) =>
        state.branches['feature/offline'] === server(state)['feature/offline'] &&
        fileAt(state, state.branches['feature/offline'], 'offline.md') === F.offlineDoc,
    },
  ],
  validate: (state) =>
    allOf(
      notBusy(state),
      check(
        fileAt(state, server(state)['feature/offline'], 'offline.md') === F.offlineDoc,
        "Lea's offline.md is gone from the server: a force push overwrote her commit. Press Undo; use --force-with-lease and look at what it refuses.",
      ),
      check(
        fileAt(state, server(state)['feature/offline'], 'offline.test.ts') === F.offlineTest,
        'origin/feature/offline does not have your offline.test.ts yet.',
      ),
      check(
        state.branches['feature/offline'] === server(state)['feature/offline'],
        'Your local feature/offline and origin/feature/offline must end at the same commit.',
      ),
    ),
  hints: [
    'Try git push --force-with-lease first: it refuses if the server has commits you have never seen.',
    "It refused: fetch, look at Lea's commit (git log feature/offline..origin/feature/offline), put it on top of yours, then push with the lease.",
    'git fetch, git cherry-pick origin/feature/offline, git push --force-with-lease',
  ],
  par: 3,
  takeaway: '--force-with-lease only overwrites what you have seen; plain --force silently deletes teammates\' commits.',
  theory: {
    title: '--force-with-lease vs --force',
    body: 'Amending or rebasing a pushed commit gives it a new hash, so a normal push is rejected and a force push is needed. git push --force replaces the server branch no matter what; --force-with-lease first checks that the server still has what your origin/<branch> says, and refuses otherwise. A fetch updates that expectation, so after fetching, integrate what you found before forcing.',
    lesson: 'Rewrite only your own branches, and force with --force-with-lease.',
  },
  danger: 'Force pushes rewrite history on the server: on a real shared branch, git push --force deletes your teammates\' commits without a warning.',
  outcome: {
    summary:
      'origin/feature/offline has your amended commit with Lea\'s offline.md on top of it. A lease-checked force push replaces your old commit without wiping out a teammate\'s.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -3',
      output: '3724d6f (HEAD -> feature/offline, origin/feature/offline) docs: offline mode\n04c3c84 feat: offline queue with test\n72cccf0 Initial commit',
    },
  },
  prelude: [
    {
      id: 'm3.6-p1',
      commands: [
        'git switch feature/offline',
        `edit offline.test.ts "${F.offlineTest}"`,
        'git add offline.test.ts',
        'git commit --amend -m "feat: offline queue with test"',
      ],
    },
    {
      id: 'm3.6-p2',
      teammate: 'lea',
      remote: { push: ['feature/offline'] },
      commands: ['git switch feature/offline', `edit offline.md "${F.offlineDoc}"`, 'git add offline.md', 'git commit -m "docs: offline mode"'],
    },
  ],
  reference: ['git fetch', 'git cherry-pick origin/feature/offline', 'git push --force-with-lease'],
  alternatives: [['git fetch', 'git rebase origin/feature/offline', 'git push']],
};

const pruneDelete: Mission = {
  id: 'prune-delete',
  number: '3.7',
  title: 'Ghost branches',
  story:
    'Lea merged feature/offline into main on the server, and Samir deleted his old spike/search branch there. Your branch list still shows both, as if nothing happened.',
  goal: 'Prune origin/spike/search, then delete feature/offline both locally and on origin.',
  checks: [
    {
      label: 'Prune the stale origin/spike/search',
      proof: 'git branch -r',
      done: (state) => tracking(state, 'origin/spike/search') === undefined,
    },
    {
      label: 'Delete feature/offline on origin',
      proof: 'git ls-remote origin',
      done: (state) => server(state)['feature/offline'] === undefined,
    },
    {
      label: 'Delete your local feature/offline',
      proof: 'git branch',
      done: (state) => state.branches['feature/offline'] === undefined,
    },
  ],
  validate: (state) =>
    allOf(
      check(tracking(state, 'origin/spike/search') === undefined, 'origin/spike/search is still listed: git fetch --prune removes remote-tracking branches the server deleted.'),
      check(server(state)['feature/offline'] === undefined, 'feature/offline still exists on origin: git push origin --delete feature/offline.'),
      check(state.branches['feature/offline'] === undefined, 'Your local feature/offline still exists: switch to main and delete it.'),
      check(state.branches.main !== undefined && server(state).main !== undefined, 'Keep main, locally and on origin.'),
    ),
  hints: [
    'A plain fetch never deletes anything; ask it to prune. Deleting a server branch is a push.',
    'git fetch --prune, then git branch -d feature/offline (not while you are on it), then git push origin --delete feature/offline.',
    'git switch main, git fetch --prune, git branch -d feature/offline, git push origin --delete feature/offline',
  ],
  par: 4,
  takeaway: 'git fetch --prune forgets branches the server deleted; git push origin --delete removes one on the server.',
  theory: {
    title: 'Pruning and deleting remote branches',
    body: 'Remote-tracking branches like origin/spike/search stay on your Mac even after the server deletes the branch; git fetch --prune (or git config fetch.prune true) removes them, and git branch -vv shows [gone] for local branches whose upstream vanished. To delete a branch on the server, push the deletion: git push origin --delete <branch>.',
    lesson: 'fetch --prune cleans your view; push --delete cleans the server.',
  },
  outcome: {
    summary:
      'Your branch list shows only branches that still exist, and feature/offline is gone both on your Mac and on origin. A tidy list means nobody starts work on a dead branch.',
    expect: {
      kind: 'terminal',
      command: 'git branch -a',
      output: '* main\n  remotes/origin/HEAD -> origin/main\n  remotes/origin/main',
    },
  },
  prelude: [
    {
      id: 'm3.7-p1',
      teammate: 'samir',
      remote: { push: ['spike/search'] },
      commands: ['git switch -c spike/search', `edit search.ts "${F.search}"`, 'git add search.ts', 'git commit -m "spike: search"'],
    },
    { id: 'm3.7-p2', commands: ['git fetch'] },
    {
      id: 'm3.7-p3',
      teammate: 'samir',
      remote: { push: ['main'] },
      commands: ['git push origin --delete spike/search'],
    },
    {
      id: 'm3.7-p4',
      teammate: 'lea',
      remote: { push: ['main'] },
      commands: ['git merge --no-ff origin/feature/offline -m "Merge feature/offline"'],
    },
  ],
  reference: ['git switch main', 'git fetch --prune', 'git branch -d feature/offline', 'git push origin --delete feature/offline'],
  alternatives: [
    ['git switch main', 'git pull --prune', 'git push origin --delete feature/offline', 'git branch -d feature/offline'],
    ['git switch main', 'git push origin --delete feature/offline', 'git fetch --prune', 'git branch -D feature/offline'],
  ],
};

// 3.8 An agent force-pushed over your commits ---------------------------------

const TAGS = { code: 'export const tags = [];', doc: 'Tags: group notes by topic.', bot: 'export const syncInterval = 5;' } as const;
const MINE = ['feat: tags', 'docs: tags'] as const;
const BOT_FORCE = 'chore(bot): sync settings';

const subjectHash = (state: RepoState, subject: string) =>
  Object.values(state.commits).find((c) => c.message.split('\n')[0] === subject)?.hash;
/** origin/main has the bot's commit and both of yours (as originals or replayed copies). */
const serverHasAll = (state: RepoState) => {
  const tip = server(state).main;
  const has = (subject: string) =>
    Object.values(state.commits).some((c) => c.message.split('\n')[0] === subject && isAncestor(state, c.hash, tip));
  return has(BOT_FORCE) && MINE.every(has);
};

const forcePushedOver: Mission = {
  id: 'agent-force-pushed',
  number: '3.8',
  title: 'Pushed over',
  story:
    'You pushed two tags commits to main, then Nova Bot, working from an older checkout, ran git push --force and replaced them with its own sync settings commit. Your commits are gone from the server but still on your Mac, and Lea wants the bot\'s commit kept too.',
  goal: "Put your two commits back on origin/main on top of the bot's commit, without losing it.",
  checks: [
    {
      label: "Your main has the bot's commit and both of yours",
      proof: 'git log --oneline -4',
      done: (state) => {
        const main = state.branches.main;
        return [BOT_FORCE, ...MINE].every((subject) =>
          Object.values(state.commits).some((c) => c.message.split('\n')[0] === subject && isAncestor(state, c.hash, main)),
        );
      },
    },
    {
      label: 'origin/main has all three commits and matches your main',
      proof: 'git log --oneline -4 origin/main',
      done: (state) => serverHasAll(state) && server(state).main === state.branches.main,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(state),
      check(ctx.facts.inProgress === null, 'A rebase is still in progress: resolve, git add, git rebase --continue (or git rebase --abort).'),
      check(
        isAncestor(state, subjectHash(state, BOT_FORCE), server(state).main),
        "The bot's commit is gone from origin/main: a blind force push threw it away. Undo, fetch, and put your commits on top of it instead.",
      ),
      check(serverHasAll(state), 'origin/main is still missing your tags commits. Fetch, replay them on top of origin/main, then push.'),
      check(server(state).main === state.branches.main, 'Your main and origin/main must end at the same commit.'),
      check(isWorkingTreeClean(state), 'The working tree must be clean.'),
    ),
  hints: [
    'Your stale origin/main still believes the server has your commits, so even --force-with-lease refuses. Look at the server first.',
    'git fetch shows the forced update (+ ... (forced update)). git log --oneline main..origin/main shows the bot\'s commit; git rebase origin/main replays yours on top of it (not git pull --rebase: it finds your commits in the old origin/main and drops them). Then push with --force-with-lease.',
    'git fetch, git log --oneline main..origin/main, git rebase origin/main, git push --force-with-lease',
  ],
  par: 4,
  takeaway: 'After someone force-pushed over you: fetch, look at what they pushed, replay your commits on top, then push with --force-with-lease.',
  theory: {
    title: 'When an agent force-pushes over you',
    body: 'A force push replaces the server branch, but your own commits still live in your local branch (and in git reflog), so nothing is lost on your Mac. Right after the force push, git push --force-with-lease is rejected as "stale info" because your origin/main still records your old tip; git fetch updates it, and from then on the lease would let you overwrite the agent\'s commit without a word. So fetch, read git log main..origin/main, rebase or cherry-pick onto it, push, and then deny push --force in the agent\'s settings and block force pushes on main.',
    lesson: 'Force-pushed over? Fetch, rebase onto what is there, push, then lock force pushes down.',
  },
  danger: 'Never answer a force push with git push --force: it deletes whatever the other side pushed. Fetch and look first.',
  outcome: {
    summary:
      'origin/main has the bot\'s commit with your two tags commits on top, so nothing anyone pushed is lost. That is how you recover from a force push without starting a push war.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -4',
      output: '8528755 (HEAD -> main, origin/main, origin/HEAD) docs: tags\n1f56f63 feat: tags\nff835b7 chore(bot): sync settings\n3cf3715 Merge feature/offline',
    },
  },
  prelude: [
    {
      id: 'm3.8-p1',
      commands: [
        'git merge --ff-only origin/main',
        `edit tags.ts "${TAGS.code}"`,
        'git add tags.ts',
        `git commit -m "${MINE[0]}"`,
        `append notes.md "${TAGS.doc}"`,
        `git commit -am "${MINE[1]}"`,
        'git push origin main',
      ],
    },
    {
      id: 'm3.8-p2',
      teammate: 'bot',
      remote: { push: ['+main'] },
      commands: ['git reset -q --hard HEAD~2', `edit settings.ts "${TAGS.bot}"`, 'git add settings.ts', `git commit -m "${BOT_FORCE}"`],
    },
  ],
  reference: ['git fetch', 'git log --oneline main..origin/main', 'git rebase origin/main', 'git push --force-with-lease'],
  alternatives: [
    ['git fetch', 'git rebase origin/main', 'git push'],
    ['git fetch', 'git reset --hard origin/main', 'git cherry-pick ORIG_HEAD~1 ORIG_HEAD', 'git push --force-with-lease'],
    ['git fetch', 'git merge --no-edit origin/main', 'git push'],
  ],
};

// 3.9 Capstone: Monday morning sync on the production repo ---------------------

const EXPORT_BRANCH = 'feature/export-markdown';
const EXPORT_TS = "export const toMarkdown = (title: string, body: string) => ['# ' + title, body].join(' ');";
const SYNC_DOC = '# Offline sync\n\nEvery edit is queued locally and flushed to /api/sync in batches.';
const README_LINK = 'See docs/sync.md for how offline sync works.';
const LEA_HOTFIX = 'fix(sync): prefer the server copy when timestamps tie';

/** Merge commits made during this mission on `tip`'s history (a pull that merged instead of rebasing). */
function newMerges(state: RepoState, ctx: MissionContext, tip: string | undefined): number {
  let merges = 0;
  const seen = new Set<string>();
  const stack = tip === undefined ? [] : [tip];
  while (stack.length > 0) {
    const hash = stack.pop()!;
    if (seen.has(hash) || ctx.entryCommits.has(hash)) continue;
    seen.add(hash);
    const parents = state.commits[hash]?.parents ?? [];
    if (parents.length > 1) merges += 1;
    stack.push(...parents);
  }
  return merges;
}

const hasHotfix = (state: RepoState) =>
  Object.values(state.commits).some((c) => c.message.startsWith(LEA_HOTFIX) && isAncestor(state, c.hash, state.branches.main));
const keepsLocalWork = (state: RepoState) => {
  const snap = snapshotOf(state, state.branches.main);
  return snap['docs/sync.md'] === SYNC_DOC && (snap['README.md'] ?? '').includes(README_LINK);
};
const mainRebased = (state: RepoState, ctx: MissionContext) =>
  hasHotfix(state) && keepsLocalWork(state) && newMerges(state, ctx, state.branches.main) === 0;
const exportPublished = (state: RepoState) =>
  state.branches[EXPORT_BRANCH] !== undefined &&
  server(state)[EXPORT_BRANCH] === state.branches[EXPORT_BRANCH] &&
  state.upstream?.[EXPORT_BRANCH] === `origin/${EXPORT_BRANCH}`;
const pruned = (state: RepoState) => tracking(state, 'origin/release/1.2') === undefined;

const mondaySync: Mission = {
  id: 'monday-sync',
  number: '3.9',
  title: 'Monday morning sync',
  capstone: true,
  story:
    'Over the weekend you committed two docs changes on main and started feature/export-markdown, none of it pushed. Meanwhile Lea pushed a sync hotfix to main, and Samir deleted release/1.2 on the server now that 1.2 is tagged.',
  goal: "Put your two commits on top of Lea's hotfix without a merge commit, push main, publish feature/export-markdown with an upstream and prune stale remote-tracking branches.",
  checks: [
    { label: "main has Lea's hotfix and your two commits, in a straight line", proof: 'git log --oneline --graph -5', done: mainRebased },
    {
      label: 'origin/main matches your main',
      proof: 'git status -sb',
      done: (state, ctx) => mainRebased(state, ctx) && server(state).main === state.branches.main,
    },
    { label: 'feature/export-markdown is on origin and tracks it', proof: 'git branch -vv', done: exportPublished },
    { label: 'origin/release/1.2 is pruned', proof: 'git branch -r', done: pruned },
  ],
  validate: (state, ctx) =>
    allOf(
      notBusy(state),
      check(ctx.facts.inProgress === null, 'A rebase is still in progress: resolve, git add, git rebase --continue (or git rebase --abort).'),
      check(hasHotfix(state), "main does not contain Lea's hotfix yet: fetch, then rebase your work onto origin/main."),
      check(keepsLocalWork(state), 'Your two local commits (docs/sync.md and the README link) must stay on main.'),
      check(
        newMerges(state, ctx, state.branches.main) === 0,
        'main has a merge commit. Undo it (git reset --hard ORIG_HEAD) and integrate with git pull --rebase instead.',
      ),
      check(server(state).main === state.branches.main, 'origin/main does not match your main yet: git push.'),
      check(exportPublished(state), `Publish your branch with an upstream: git push -u origin ${EXPORT_BRANCH}.`),
      check(pruned(state), 'origin/release/1.2 is still listed although Samir deleted it on the server: git fetch --prune.'),
    ),
  hints: [
    'Find out what moved on the server before you push anything. A rebase keeps history straight; a plain fetch never deletes anything.',
    'git pull --rebase replays your two commits on top of origin/main. git push -u publishes a new branch and sets its upstream. git fetch --prune forgets branches the server deleted.',
    `git pull --rebase, git push, git push -u origin ${EXPORT_BRANCH}, git fetch --prune`,
  ],
  par: 4,
  takeaway: 'A clean morning sync: fetch, rebase your unpushed work, push, publish new branches with -u and prune what the server deleted.',
  theory: {
    title: 'Syncing with a busy team',
    body: 'On a real repo, start the day with git fetch and git status -sb (or git log --oneline --graph --all) to see what moved. git pull --rebase (or git config pull.rebase true) replays your unpushed commits on top of the team instead of adding merge bubbles, git push -u publishes a branch and remembers its upstream, and git fetch --prune (or fetch.prune true) keeps git branch -r honest.',
    lesson: 'Fetch, rebase local work, push, publish with -u, prune.',
  },
  root: [
    ...productionRepo({ remote: true }),
    `git switch -q -c ${EXPORT_BRANCH}`,
    `edit apps/web/src/export.ts ${JSON.stringify(EXPORT_TS)}`,
    'git add apps/web/src/export.ts',
    'git commit -q -m "feat(web): export a note as Markdown"',
    'git switch -q main',
    // ponytail: JSON.stringify quotes setup content (no tabs or control characters in it).
    `edit docs/sync.md ${JSON.stringify(SYNC_DOC)}`,
    'git add docs/sync.md',
    'git commit -q -m "docs: explain how offline sync works"',
    `append README.md "${README_LINK}"`,
    'git commit -q -am "docs: link the sync guide from the README"',
  ],
  outcome: {
    summary:
      'Your weekend work sits on top of Lea\'s hotfix in a straight line, main and feature/export-markdown are on origin, and branches deleted on the server show up as gone. A clean start to a busy team\'s week.',
    expect: {
      kind: 'terminal',
      command: 'git branch -vv',
      output: '  feature/export-markdown 88724fd [origin/feature/export-markdown] feat(web): export a note as Markdown\n  feature/offline-cache   f85b979 [origin/feature/offline-cache] test(sync): cover cache eviction\n  feature/share-links     4bcafdc [origin/feature/share-links] feat(web): add a copy share link button\n* main                    4b260c5 [origin/main] docs: link the sync guide from the README\n  release/1.2             a31e888 [origin/release/1.2: gone] chore(release): 1.2.0',
    },
  },
  prelude: [
    teammatePushesHotfix('lea'),
    { id: 'm3.8-samir', teammate: 'samir', remote: { push: [] }, commands: ['git push -q origin --delete release/1.2'] },
  ],
  reference: ['git pull --rebase', 'git push', `git push -u origin ${EXPORT_BRANCH}`, 'git fetch --prune'],
  alternatives: [
    ['git fetch --prune', 'git rebase origin/main', 'git push origin main', `git switch ${EXPORT_BRANCH}`, 'git push -u origin HEAD'],
    ['git config pull.rebase true', 'git pull --prune', 'git push', `git push --set-upstream origin ${EXPORT_BRANCH}`],
  ],
};

export const level3: Level = {
  id: 'remotes',
  number: 3,
  title: 'Remotes and syncing',
  topics: 'push -u, fetch, pull, divergent branches, force-with-lease, prune',
  planned: 9,
  remote: true,
  root: [
    'git init -b main',
    `edit notes.md "${F.notes1}"`,
    `edit sync.ts "${F.sync1}"`,
    'git add .',
    'git commit -m "Initial commit"',
    `git remote add origin ${ORIGIN_URL}`,
    'git push -u origin main',
  ],
  missions: [firstPush, fetchFirst, pullFastForward, divergent, rejectedPush, forceWithLease, pruneDelete, forcePushedOver, mondaySync],
};

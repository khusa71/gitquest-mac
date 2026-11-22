/**
 * Level 11 (online) without GitHub: every validator against recorded gh output (src/realgit/fixtures/gh-sandbox.json,
 * parsed by the real wrapper through a fake gh), then the consent flow and mission 11.1 end to end through Game,
 * with a local bare repo standing in for github.com. Nothing here talks to the network.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import * as realgit from '../../realgit';
import { fakeGh, userRoute, type Route } from '../../realgit/fake-gh';
import { fetchFacts, SANDBOX_DESCRIPTION } from '../../realgit/github';
import type { Commit, FileTree, RepoState } from '../../shared/repo-types';
import { Game } from '../index';
import type { GitHubFacts, Mission, MissionContext, RepoFacts } from '../model';
import { FILES, level11 } from './level11';

const REPO = 'octo-player/gitquest-sandbox';
const recorded = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '..', '..', 'realgit', 'fixtures', 'gh-sandbox.json'), 'utf8'),
).routes as Record<string, Route>;
const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'gq-l11-'));
const mission = (n: number) => level11.missions[n - 1] as Mission;
const sha = (two: string) => two.repeat(20);

// The repo after playing every mission once (commit names match the recorded fixture) ---------------------

const README: FileTree = { 'README.md': '# gitquest-sandbox' };
const CI: FileTree = { '.github/workflows/ci.yml': FILES.ci, 'scripts/check.sh': FILES.check };
const commits: Record<string, Commit> = {};
const add = (two: string, parent: string | null, files: FileTree, message = two): string => {
  const hash = sha(two);
  commits[hash] = { hash, parents: parent === null ? [] : [sha(parent)], message, snapshot: files, author: { name: 'P', email: 'p@x' }, timestamp: Object.keys(commits).length };
  return hash;
};
add('c0', null, README);
add('d1', 'c0', { ...README, 'notes/hello.md': 'old try' }); // an earlier attempt of 11.1, cloned at entry
add('a1', 'c0', { ...README, 'notes/hello.md': 'Hello', '.github/pull_request_template.md': FILES.template });
add('a2', 'c0', { ...README, ...CI });
add('a3', 'c0', { ...README, ...CI, 'notes/plan.md': 'Ship sync in March.\nTODO: write the release note' });
add('b3', 'a3', { ...README, ...CI, 'notes/plan.md': 'Ship sync in March.' });
add('a4', 'c0', { ...README, ...CI, 'notes/review.md': 'Review checklist' });
add('a5', 'c0', { ...README, 'notes/sync.md': 'x' });
add('b5', 'a5', { ...README, 'notes/sync.md': 'x', 'notes/offline.md': 'y' });
add('e5', 'c0', { ...README, 'notes/sync.md': 'x', 'notes/offline.md': 'y' }); // squash commit on main
add('a6', 'e5', { ...README, 'notes/sync.md': 'x', 'notes/offline.md': 'y', 'notes/guide.md': 'guide' });
add('e6', 'e5', commits[sha('a6')]!.snapshot);
add('a7', 'e6', { ...commits[sha('e6')]!.snapshot, 'CHANGELOG.md': '## 0.1.0' });
add('a8', 'c0', { ...README, '.github/workflows/deploy.yml': FILES.deploy });

const branches: Record<string, string> = {
  main: sha('a7'),
  'gq/11-1-hello-2': sha('a1'),
  'gq/11-2-ci': sha('a2'),
  'gq/11-3-fix': sha('b3'),
  'gq/11-4-review': sha('a4'),
  'gq/11-8-secret': sha('a8'),
};
const tracking = (b: Record<string, string>) => Object.fromEntries(Object.entries(b).map(([k, v]) => [`origin/${k}`, v]));

function state(over: Partial<{ branches: Record<string, string>; remoteTracking: Record<string, string>; commits: Record<string, Commit> }> = {}): RepoState {
  const b = over.branches ?? branches;
  return {
    version: 1,
    initialized: true,
    commits: over.commits ?? commits,
    branches: b,
    worktrees: { main: { id: 'main', path: '~/GitQuest/nova', isMain: true, head: { kind: 'branch', branch: 'main' }, index: {}, workingDir: {} } },
    activeWorktree: 'main',
    clock: 0,
    nextId: 0,
    remoteTracking: over.remoteTracking ?? { ...tracking(b), 'origin/gq/11-1-hello': sha('d1') },
  };
}

const repoFacts = (tags: RepoFacts['tags']): RepoFacts => ({
  stashes: [], tags, reflog: [], config: {}, inProgress: null, hooks: [], ignored: [], submodules: [], notes: [], server: null,
});
const TAGS: RepoFacts['tags'] = [
  { name: 'v0.1.0', target: sha('c0'), annotated: false, message: null }, // an earlier attempt's release
  { name: 'v0.1.1', target: sha('a7'), annotated: false, message: null },
];

let github: GitHubFacts;
beforeAll(async () => {
  const gh = await fakeGh(tmp(), recorded);
  github = await fetchFacts({ gh: gh.bin }, REPO);
});

const ENTRY = new Set([sha('c0'), sha('d1')]);
const ctx = (over: Partial<MissionContext> = {}): MissionContext => ({ entryCommits: ENTRY, facts: repoFacts(TAGS), commands: [], github, ...over });
const judge = (m: Mission, s: RepoState, c: MissionContext) => ({ result: m.validate(s, c), checks: m.checks.map((check) => check.done(s, c)) });

/** The clone at entry: main at c0, the earlier attempt's branch on origin; GitHub still shows every old object. */
const entryState = () =>
  state({
    branches: { main: sha('c0') },
    remoteTracking: { 'origin/main': sha('c0'), 'origin/gq/11-1-hello': sha('d1') },
    commits: { [sha('c0')]: commits[sha('c0')]!, [sha('d1')]: commits[sha('d1')]! },
  });

describe('level 11 content', () => {
  it('follows the content rules', () => {
    expect(level11).toMatchObject({ number: 11, online: true, planned: level11.missions.length });
    for (const [i, m] of level11.missions.entries()) {
      expect(m.number).toBe(`11.${i + 1}`);
      expect(m.hints).toHaveLength(3);
      expect(m.checks.length).toBeGreaterThanOrEqual(2);
      expect(m.checks.length).toBeLessThanOrEqual(4);
      expect(m.par).toBe(m.reference.length);
      expect(m.root, 'every mission clones the sandbox afresh').toEqual(level11.root);
      expect(m.undo).toBe(false);
      expect((m.story.match(/[.!?]+(?=\s|$)/g) ?? []).length).toBeLessThanOrEqual(3);
      // Preludes only write files: rebuilds never touch GitHub.
      for (const step of m.prelude) for (const c of step.commands) expect(c).toMatch(/^(edit|append|mkdir) /);
    }
    expect(JSON.stringify(level11)).not.toMatch(/[À-ÿ’]/);
  });
});

describe('level 11 validators on recorded GitHub facts', () => {
  for (const m of level11.missions) {
    it(`${m.number} ${m.id}: entry fails (even with old attempts on GitHub), solved passes`, () => {
      // First play: GitHub not read yet, every check false.
      const first = judge(m, entryState(), ctx({ facts: repoFacts([TAGS[0]!]), github: null }));
      expect(first.result.ok).toBe(false);
      expect(first.checks.every((done) => !done), `${m.id}: every check false at entry`).toBe(true);
      // Replay: GitHub still holds the earlier attempt (PRs, runs, release, secret), which must not count.
      const replay = judge(m, entryState(), ctx({ facts: repoFacts([TAGS[0]!]) }));
      expect(replay.result.ok).toBe(false);
      expect(replay.checks.some((done) => !done)).toBe(true);
      expect(judge(m, state(), ctx())).toEqual({ result: { ok: true }, checks: m.checks.map(() => true) });
    });
  }

  it('says when GitHub has not been read yet', () => {
    const s = state({ remoteTracking: {} });
    expect(mission(1).validate(s, ctx({ github: null })).reason).toMatch(/Push your gq\/11-1- branch/);
    expect(mission(1).validate(state(), ctx({ github: null })).reason).toBe('GitQuest has not heard from GitHub yet. Run a command or press Refresh from GitHub.');
  });

  it('11.1 ignores the earlier attempt PR and wants the template body', () => {
    const noBody = { ...github, pullRequests: github.pullRequests.map((pr) => ({ ...pr, body: '' })) };
    expect(mission(1).validate(state(), ctx({ github: noBody })).reason).toMatch(/## What and ## Why/);
    const onlyOld = { ...github, pullRequests: github.pullRequests.filter((pr) => pr.number === 1) };
    expect(mission(1).validate(state(), ctx({ github: onlyOld })).reason).toMatch(/gh pr create/);
  });

  it('11.2 explains a run still in progress and a failed one', () => {
    const with2 = (status: string, conclusion: string | null) => ({
      ...github,
      runs: github.runs.map((r) => (r.sha === sha('a2') ? { ...r, status, conclusion } : r)),
    });
    expect(mission(2).validate(state(), ctx({ github: with2('in_progress', null) })).reason).toMatch(/in progress on GitHub.*gh run watch/);
    expect(mission(2).validate(state(), ctx({ github: with2('completed', 'failure') })).reason).toMatch(/ended with failure/);
  });

  it('11.3 needs the red run first', () => {
    const noRed = { ...github, runs: github.runs.filter((r) => r.conclusion !== 'failure') };
    expect(mission(3).checks[0]?.done(state(), ctx({ github: noRed }))).toBe(false);
  });

  it('11.4 waits for checks', () => {
    const pending = {
      ...github,
      pullRequests: github.pullRequests.map((pr) => (pr.number === 4 ? { ...pr, checks: [{ name: 'check', status: 'IN_PROGRESS', conclusion: null }] } : pr)),
    };
    expect(mission(4).validate(state(), ctx({ github: pending })).reason).toMatch(/gh pr checks --watch/);
  });

  it('11.5 wants the merge pulled and squashed', () => {
    const notPulled = state({ branches: { ...branches, main: sha('c0') } });
    expect(mission(5).validate(notPulled, ctx()).reason).toMatch(/git pull/);
    const mergeCommit = { ...commits, [sha('e5')]: { ...commits[sha('e5')]!, parents: [sha('c0'), sha('b5')] } };
    expect(mission(5).validate(state({ commits: mergeCommit }), ctx()).reason).toMatch(/--squash/);
    const kept = { ...github, branches: [...github.branches, 'gq/11-5-squash'] };
    expect(mission(5).validate(state(), ctx({ github: kept })).reason).toMatch(/still on GitHub/);
  });

  it('11.6 waits for the issue to close', () => {
    const open = { ...github, issues: github.issues.map((i) => ({ ...i, state: 'OPEN' as const })) };
    expect(mission(6).validate(state(), ctx({ github: open })).reason).toMatch(/still open/);
  });

  it('11.7 does not count the earlier attempt tag and release', () => {
    expect(mission(7).validate(state(), ctx({ facts: repoFacts([TAGS[0]!]) })).reason).toMatch(/Tag your release commit/);
  });

  it('11.8 refuses the secret value in a committed file', () => {
    const leaked = { ...commits, [sha('a8')]: { ...commits[sha('a8')]!, snapshot: { ...commits[sha('a8')]!.snapshot, '.env': 'DEPLOY_TOKEN=fake-value' } } };
    expect(mission(8).validate(state({ commits: leaked }), ctx()).reason).toMatch(/contains fake-value/);
    expect(mission(8).validate(state(), ctx({ github: { ...github, secrets: [] } })).reason).toMatch(/gh secret set DEPLOY_TOKEN/);
  });
});

// Game: consent flow + 11.1 through the real code path ---------------------------------------------------------

describe('Game with a fake gh and a local bare repo as github.com', () => {
  it('needs the sandbox, creates it on request, clones it, reads GitHub throttled, and solves 11.1', async () => {
    const home = tmp();
    const paths = realgit.defaultPaths(home);
    const env = realgit.sandboxEnv(paths, { ...process.env, HOME: home });
    // "GitHub": a bare repo with the README that gh repo create --add-readme makes.
    const hub = path.join(home, 'hub', 'gitquest-sandbox.git');
    const seed = path.join(home, 'seed');
    await realgit.runSetupCommands(home, [`git init -q -b main ${seed}`], { env });
    await realgit.runSetupCommands(seed, ['edit README.md "# gitquest-sandbox"', 'git add README.md', 'git commit -q -m "Initial commit"', `git clone -q --bare . ${hub}`], { env });

    const gh = await fakeGh(path.join(home, 'gh'), {
      ...recorded,
      'api user': userRoute('octo-player'),
      'repo view': { stderr: `GraphQL: Could not resolve to a Repository with the name '${REPO}'. (repository)\n`, code: 1 },
      'repo create': { stdout: '', set: { 'repo view': { json: { description: SANDBOX_DESCRIPTION, url: `https://github.com/${REPO}`, visibility: 'PRIVATE' } } } },
      'pr list': { json: [] },
    });
    // A long throttle keeps the test independent of machine speed (the default is GITHUB_THROTTLE_MS = 5 s).
    const game = new Game({ paths, player: { name: 'P', email: 'p@x' }, gh: gh.bin, githubEveryMs: 600_000 });
    await game.init();
    await game.runSetup('classic');
    await realgit.git(['config', '--global', `url.${hub}.insteadOf`, `https://github.com/${REPO}.git`], { cwd: home, env });

    // Consent: nothing exists, starting refuses, the button creates it.
    expect((await game.githubStatus()).sandbox).toBe('missing');
    await expect(game.startMission('gh-open-pr')).rejects.toThrow(/Create the sandbox repo first/);
    expect((await game.createSandbox()).sandbox).toBe('exists');

    await game.startMission('gh-open-pr');
    let view = game.view();
    expect(view.mission?.online).toEqual({ repo: REPO, checkedAt: null, error: null });
    expect(view.mission?.checks.map((c) => c.done)).toEqual([false, false, false, false]);
    expect(view.levels.find((l) => l.number === 11)).toMatchObject({ online: true, suggestedOrder: null });
    const helper = await realgit.git(['config', '--global', '--get-all', 'credential.https://github.com.helper'], { cwd: home, env });
    expect(helper.stdout).toContain(`'${gh.bin}' auth git-credential`);
    expect((await realgit.git(['config', 'remote.origin.url'], { cwd: paths.repo, env })).stdout.trim()).toBe(`https://github.com/${REPO}.git`);

    const type = async (command: string) => {
      const [, ...args] = realgit.tokenize(command);
      const result = await realgit.git(args, { cwd: paths.repo, env });
      expect(result.code, `${command}: ${result.stderr}`).toBe(0);
      return game.afterCommand(command, result.code);
    };
    await type('git switch -c gq/11-1-hello');
    await type('git add -A');
    await type('git commit -q -m "docs: hello note"');
    view = await type('git push -q -u origin gq/11-1-hello');
    const prReads = (await gh.calls()).filter((c) => c[0] === 'pr' && c[1] === 'list').length;
    expect(prReads, 'four quick commands read GitHub once').toBe(1);
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, true, false, false]);
    expect(view.mission?.online?.checkedAt).not.toBeNull();

    const head = (await realgit.git(['rev-parse', 'HEAD'], { cwd: paths.repo, env })).stdout.trim();
    await gh.route({
      'pr list': {
        json: [{ number: 9, title: 'docs: hello note', state: 'OPEN', headRefName: 'gq/11-1-hello', headRefOid: head, baseRefName: 'main', body: FILES.template, mergeCommit: null, closingIssuesReferences: [], reviews: [], statusCheckRollup: [] }],
      },
    });
    view = await game.afterCommand('gh pr create --base main --title "docs: hello note" --body-file .github/pull_request_template.md', 0);
    expect(view.mission?.completed, 'throttled: not read yet').toBeNull();
    view = await game.refreshGitHub();
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, true, true, true]);
    expect(view.mission?.completed).not.toBeNull();
    expect(view.mission?.completed?.next).toBe('gh-first-ci-run');

    await gh.route({ 'pr list': { stderr: 'error connecting to api.github.com\n', code: 1 } });
    view = await game.refreshGitHub();
    expect(view.mission?.online?.error).toBe('GitHub could not be reached. Check your internet connection, then press Refresh from GitHub.');

    const writes = (await gh.calls()).filter((c) => ['create', 'delete'].includes(c[1] ?? ''));
    expect(writes).toEqual([['repo', 'create', 'gitquest-sandbox', '--private', '--add-readme', '--description', SANDBOX_DESCRIPTION]]);
  }, 60_000);
});

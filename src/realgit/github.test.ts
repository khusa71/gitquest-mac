/** The gh wrapper against a fake gh (src/realgit/fake-gh.ts): never touches the real GitHub account. */
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeGh, userRoute, type Route } from './fake-gh';
import { createSandbox, deleteSandbox, DELETE_SCOPE_HELP, fetchFacts, SANDBOX_DESCRIPTION, status } from './github';
import { defaultPaths, ensureSandbox, git, sandboxEnv } from './index';

const REPO = 'octo-player/gitquest-sandbox';
const recorded = JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', 'gh-sandbox.json'), 'utf8')).routes as Record<string, Route>;
const missing: Route = { stderr: `GraphQL: Could not resolve to a Repository with the name '${REPO}'. (repository)\n`, code: 1 };
const ours = (visibility = 'PRIVATE', description = SANDBOX_DESCRIPTION): Route => ({
  json: { description, url: `https://github.com/${REPO}`, visibility },
});

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'gq-gh-'));
const writes = (calls: string[][]) => calls.filter((c) => ['create', 'delete', 'edit', 'rename'].includes(c[1] ?? '') || c.includes('--method'));

describe('status', () => {
  it('reports gh missing when the binary does not exist', async () => {
    expect(await status({ gh: path.join(tmp(), 'nope') })).toMatchObject({ installed: false, loggedIn: false, sandbox: 'unknown' });
    await expect(createSandbox({ gh: path.join(tmp(), 'nope') })).rejects.toThrow(/brew install gh/);
  });

  it('signed out: no message, so the UI shows gh auth login', async () => {
    const gh = await fakeGh(tmp(), { 'api user': { stderr: 'To get started with GitHub CLI, please run:  gh auth login\n', code: 4 } });
    expect(await status({ gh: gh.bin })).toMatchObject({ installed: true, loggedIn: false, login: null, message: null });
  });

  it('signed in, sandbox missing, delete_repo scope missing', async () => {
    const gh = await fakeGh(tmp(), { 'api user': userRoute('octo-player'), 'repo view': missing });
    expect(await status({ gh: gh.bin })).toEqual({
      installed: true,
      loggedIn: true,
      login: 'octo-player',
      repo: REPO,
      sandbox: 'missing',
      url: null,
      missingScopes: ['delete_repo'],
      message: null,
    });
  });

  it('refuses a same-named repo GitQuest did not create, and a public one', async () => {
    const gh = await fakeGh(tmp(), { 'api user': userRoute('octo-player'), 'repo view': ours('PRIVATE', 'my real project') });
    expect(await status({ gh: gh.bin })).toMatchObject({ sandbox: 'unknown', message: expect.stringMatching(/did not create it/) });
    await gh.route({ 'repo view': ours('PUBLIC') });
    expect(await status({ gh: gh.bin })).toMatchObject({ sandbox: 'unknown', message: expect.stringMatching(/not private/) });
  });

  it('offline and slow answers become readable messages', async () => {
    const gh = await fakeGh(tmp(), { 'api user': { stderr: 'error connecting to api.github.com\n', code: 1 } });
    expect((await status({ gh: gh.bin })).message).toMatch(/could not be reached/);
    await gh.route({ 'api user': { ...userRoute('octo-player'), delay: 2000 } });
    expect((await status({ gh: gh.bin, timeoutMs: 200 })).message).toMatch(/did not answer within 0 seconds|did not answer/);
  });
});

describe('consent flow: create and delete', () => {
  it('creates the private sandbox only when asked, and only once', async () => {
    const gh = await fakeGh(tmp(), {
      'api user': userRoute('octo-player', 'repo, workflow, delete_repo'),
      'repo view': missing,
      'repo create': { stdout: `https://github.com/${REPO}\n`, set: { 'repo view': ours() } },
    });
    expect((await status({ gh: gh.bin })).sandbox).toBe('missing');
    expect(writes(await gh.calls())).toEqual([]); // status never writes

    const made = await createSandbox({ gh: gh.bin });
    expect(made).toMatchObject({ sandbox: 'exists', url: `https://github.com/${REPO}`, missingScopes: [] });
    await createSandbox({ gh: gh.bin }); // idempotent
    expect(writes(await gh.calls())).toEqual([
      ['repo', 'create', 'gitquest-sandbox', '--private', '--add-readme', '--description', SANDBOX_DESCRIPTION],
    ]);
  });

  it('delete explains gh auth refresh -s delete_repo instead of calling gh when the scope is missing', async () => {
    const gh = await fakeGh(tmp(), { 'api user': userRoute('octo-player'), 'repo view': ours() });
    await expect(deleteSandbox({ gh: gh.bin })).rejects.toThrow(DELETE_SCOPE_HELP);
    expect(writes(await gh.calls())).toEqual([]);
    expect(DELETE_SCOPE_HELP).toContain('gh auth refresh -h github.com -s delete_repo');
  });

  it('delete removes exactly <login>/gitquest-sandbox, and maps a 403 to the scope help', async () => {
    const gh = await fakeGh(tmp(), {
      'api user': userRoute('octo-player', 'repo, workflow, delete_repo'),
      'repo view': ours(),
      'repo delete': { stderr: 'HTTP 403: Must have admin rights to Repository.\n', code: 1 },
    });
    await expect(deleteSandbox({ gh: gh.bin })).rejects.toThrow(DELETE_SCOPE_HELP);
    await gh.route({ 'repo delete': { stdout: '', set: { 'repo view': missing } } });
    expect((await deleteSandbox({ gh: gh.bin })).sandbox).toBe('missing');
    expect(writes(await gh.calls())).toEqual([
      ['repo', 'delete', REPO, '--yes'],
      ['repo', 'delete', REPO, '--yes'],
    ]);
  });

  it('never deletes a repo GitQuest did not create', async () => {
    const gh = await fakeGh(tmp(), { 'api user': userRoute('octo-player', 'repo, delete_repo'), 'repo view': ours('PRIVATE', 'mine') });
    await expect(deleteSandbox({ gh: gh.bin })).rejects.toThrow(/did not create it/);
    expect(writes(await gh.calls())).toEqual([]);
  });
});

describe('fetchFacts', () => {
  it('parses recorded gh output', async () => {
    const gh = await fakeGh(tmp(), recorded);
    const facts = await fetchFacts({ gh: gh.bin }, REPO);
    expect(facts.repo).toBe(REPO);
    expect(facts.pullRequests.map((pr) => [pr.number, pr.state, pr.head])).toEqual([
      [7, 'MERGED', 'gq/11-6-guide'],
      [6, 'MERGED', 'gq/11-5-squash'],
      [4, 'OPEN', 'gq/11-4-review'],
      [2, 'OPEN', 'gq/11-1-hello-2'],
      [1, 'OPEN', 'gq/11-1-hello'],
    ]);
    expect(facts.pullRequests[0]).toMatchObject({ closingIssues: [5], mergeCommit: 'e6'.repeat(20), base: 'main' });
    expect(facts.pullRequests[2]).toMatchObject({
      reviews: [{ state: 'COMMENTED', body: 'Checklist reads well, checks are green.' }],
      checks: [{ name: 'check', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    });
    expect(facts.runs[3]).toEqual({ id: 19000000002, name: 'CI', branch: 'gq/11-3-fix', sha: 'a3'.repeat(20), status: 'completed', conclusion: 'failure' });
    expect(facts.issues).toEqual([
      { number: 5, title: 'Write a sync guide', state: 'CLOSED' },
      { number: 3, title: 'Old question', state: 'OPEN' },
    ]);
    expect(facts.releases.map((r) => r.tag)).toEqual(['v0.1.1', 'v0.1.0']);
    expect(facts.branches).toContain('gq/11-8-secret');
    expect(facts.secrets).toEqual(['DEPLOY_TOKEN']);
    expect(facts.protection).toBe('unavailable'); // free private repo: 403
    expect(writes(await gh.calls())).toEqual([]);
  });

  it('reports protection none when GitHub says the branch is not protected and no ruleset applies', async () => {
    const gh = await fakeGh(tmp(), {
      ...recorded,
      [`api repos/${REPO}/branches/main/protection`]: { stderr: 'gh: Branch not protected (HTTP 404)\n', code: 1 },
      [`api repos/${REPO}/rules/branches/main`]: { json: [] },
    });
    expect((await fetchFacts({ gh: gh.bin }, REPO)).protection).toBe('none');
  });

  it('throws a readable message when GitHub cannot be reached', async () => {
    const gh = await fakeGh(tmp(), { ...recorded, 'pr list': { stderr: 'error connecting to api.github.com\ncheck your internet connection\n', code: 1 } });
    await expect(fetchFacts({ gh: gh.bin }, REPO)).rejects.toThrow('GitHub could not be reached. Check your internet connection, then press Refresh from GitHub.');
    await gh.route({ 'pr list': { ...recorded['pr list'], delay: 2000 } });
    await expect(fetchFacts({ gh: gh.bin, timeoutMs: 300 }, REPO)).rejects.toThrow(/did not answer within/);
  });
});

describe('sandbox gitconfig', () => {
  it('adds gh as credential helper for github.com only, keeping the rest of the config', async () => {
    const home = tmp();
    const paths = defaultPaths(home);
    await ensureSandbox(paths, { name: 'P', email: 'p@x' }, { gh: "/opt/it's/gh" });
    await ensureSandbox(paths, { name: 'P', email: 'p@x' }, { gh: '/opt/homebrew/bin/gh' }); // idempotent
    const env = sandboxEnv(paths, { ...process.env, HOME: home });
    const all = await git(['config', '--global', '--get-all', 'credential.https://github.com.helper'], { cwd: home, env });
    expect(all.stdout).toBe("\n!'/opt/homebrew/bin/gh' auth git-credential\n");
    expect((await git(['config', '--global', 'credential.helper'], { cwd: home, env })).code).toBe(1); // nothing for other hosts
    expect((await git(['config', '--global', 'user.name'], { cwd: home, env })).stdout.trim()).toBe('P');
  });
});

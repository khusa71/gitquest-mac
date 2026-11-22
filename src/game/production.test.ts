/**
 * The production repo (nova monorepo) and its incident building blocks, built with real git in a temp home.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, git, runSetupCommands, sandboxEnv } from '../realgit';
import { runParts } from './story';
import {
  DEBUG_SUBJECT,
  FAKE_SECRET,
  NOVA_BRANCHES,
  NOVA_FILES,
  NOVA_TAGS,
  REGRESSION_SUBJECT,
  conflictBranch,
  conflictingChange,
  introduceRegression,
  leakSecret,
  productionRepo,
  strayDebugCommit,
  teammatePushesHotfix,
} from './production';

const PLAYER = { name: 'Test Player', email: 'player@test.dev' };
let tmp = '';
let mainHash = '';
beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-prod-')));
});
afterAll(async () => {
  if (tmp !== '') await fs.rm(tmp, { recursive: true, force: true });
});

async function build(name: string, remote: boolean, extra: readonly string[] = []) {
  const paths = defaultPaths(path.join(tmp, name));
  await ensureSandbox(paths, PLAYER);
  const env = sandboxEnv(paths, { ...process.env, HOME: path.join(tmp, name) });
  await fs.mkdir(paths.repo, { recursive: true });
  const started = Date.now();
  await runSetupCommands(paths.repo, [...productionRepo({ remote }), ...extra], { env });
  const ms = Date.now() - started;
  const run = async (...args: string[]) => (await git(args, { cwd: paths.repo, env })).stdout.trim();
  return { paths, env, run, ms };
}

const smoke = (cwd: string) =>
  new Promise<number>((resolve) => execFile('sh', ['scripts/test.sh'], { cwd }, (error) => resolve(error ? 1 : 0)));

it('builds the nova monorepo: history, tags, branches, files, passing smoke test', async () => {
  const { paths, env, run, ms } = await build('plain', false);
  console.log(`productionRepo: ${productionRepo({ remote: false }).length} commands, ${ms} ms`);
  const count = Number(await run('rev-list', '--count', '--all'));
  expect(count).toBeGreaterThanOrEqual(50);
  expect(count).toBeLessThanOrEqual(70);
  expect(Number(await run('rev-list', '--count', '--merges', 'main'))).toBe(2);
  expect(await run('status', '--porcelain')).toBe('');
  expect(await run('branch', '--show-current')).toBe('main');
  expect((await run('branch', '--format=%(refname:short)')).split('\n').sort()).toEqual([...NOVA_BRANCHES].sort());
  for (const tag of NOVA_TAGS) {
    expect(await run('cat-file', '-t', tag)).toBe('tag');
    expect(await run('show', `${tag}:package.json`)).toContain(`"version": "${tag.slice(1)}"`);
    expect(await run('show', `${tag}:CHANGELOG.md`)).toContain(`## [${tag.slice(1)}]`);
    expect((await git(['merge-base', '--is-ancestor', tag, 'main'], { cwd: paths.repo, env })).code).toBe(0);
  }
  expect(await run('log', '-1', '--format=%an', 'feature/offline-cache')).toBe('Samir Haddad');
  expect(await run('log', '-1', '--format=%an', 'feature/share-links')).toBe('Ines Bouvet');
  expect(await run('log', '--format=%s', 'main')).toMatch(/^Merge pull request #42 from nova\/feature\/search$/m);
  // The builder's snapshot matches what git built.
  const tracked = (await run('ls-files')).split('\n').sort();
  expect(tracked).toEqual(Object.keys(NOVA_FILES).sort());
  for (const [file, text] of Object.entries(NOVA_FILES)) {
    expect(await fs.readFile(path.join(paths.repo, file), 'utf8')).toBe(`${text}\n`);
  }
  expect(await run('ls-files', '-s', 'scripts/test.sh')).toMatch(/^100755/);
  expect(await smoke(paths.repo)).toBe(0);
  mainHash = await run('rev-parse', 'main');
});

it('introduceRegression breaks the smoke test and bisect finds it; other incidents apply', async () => {
  const extra = [...introduceRegression(), ...leakSecret(), ...strayDebugCommit(), ...conflictingChange('README.md')];
  const { paths, env, run } = await build('incidents', false, extra);
  expect(await smoke(paths.repo)).toBe(1);
  await runSetupCommands(paths.repo, ['git bisect start main v1.2.0', 'git bisect run sh scripts/test.sh'], { env });
  expect(await run('log', '-1', '--format=%s', 'refs/bisect/bad')).toBe(REGRESSION_SUBJECT);
  await runSetupCommands(paths.repo, ['git bisect reset'], { env });
  expect(await run('show', 'HEAD~2:.env')).toContain(FAKE_SECRET);
  expect(await run('log', '-1', '--format=%s', 'HEAD~1')).toBe(DEBUG_SUBJECT);
  const merge = await git(['merge', conflictBranch('README.md')], { cwd: paths.repo, env });
  expect(merge.code).toBe(1);
  expect(await run('diff', '--name-only', '--diff-filter=U')).toBe('README.md');
});

it('with remote: origin has the branches and tags; a teammate hotfix lands on origin only', async () => {
  const { paths, env, run } = await build('remote', true, conflictingChange('.github/workflows/ci.yml'));
  const server = async (...args: string[]) => (await git(args, { cwd: paths.remote, env })).stdout.trim();
  expect((await server('for-each-ref', '--format=%(refname:short)', 'refs/heads')).split('\n').sort()).toEqual([...NOVA_BRANCHES].sort());
  expect((await server('tag')).split('\n')).toEqual([...NOVA_TAGS]);
  expect(await server('cat-file', '-t', 'v1.2.0')).toBe('tag');
  expect(await run('rev-parse', '--abbrev-ref', 'feature/share-links@{upstream}')).toBe('origin/feature/share-links');
  expect(await server('rev-parse', 'main')).toBe(mainHash); // deterministic: same hashes in every home
  const before = await run('rev-parse', 'origin/main');
  const hotfix = teammatePushesHotfix('yanis');
  await runParts(paths.repo, [{ owner: 'test', kind: 'prelude', minute: 0, ...hotfix }], { paths, env, player: PLAYER });
  expect(await run('rev-parse', 'origin/main')).toBe(before);
  expect(await server('log', '-1', '--format=%an %s', 'main')).toBe('Yanis Perret fix(sync): prefer the server copy when timestamps tie');
  expect(await run('log', '-1', '--format=%s', conflictBranch('.github/workflows/ci.yml'))).toBe('ci: drop Node 20, it reached end of life');
});

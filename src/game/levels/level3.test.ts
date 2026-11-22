/**
 * Wrong turns of Levels 3 and 7 (the harness only proves the right ones): the dangerous or tempting
 * command must NOT validate, and 7.5's real conflict flow (merge stops with exit 1) must.
 * A command starting with "!" may fail, like a player's rejected push or conflicting merge.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, git, readFacts, readRepoState, runSetupCommands, sandboxEnv, tokenize } from '../../realgit';
import { MISSIONS } from '../content';
import { rebuildEntry } from '../story';

const PLAYER = { name: 'Test Player', email: 'player@test.dev' };
let tmp = '';
beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-l3l7-')));
});
afterAll(async () => {
  if (tmp !== '') await fs.rm(tmp, { recursive: true, force: true });
});

async function attempt(missionId: string, commands: readonly string[]) {
  const mission = MISSIONS.find((m) => m.id === missionId)!;
  const home = await fs.mkdtemp(path.join(tmp, `${missionId}-`));
  const paths = defaultPaths(home);
  await ensureSandbox(paths, PLAYER);
  const env = sandboxEnv(paths, { ...process.env, HOME: home });
  await fs.mkdir(paths.repo, { recursive: true });
  await rebuildEntry(paths, missionId, { env, player: PLAYER });
  const opts = { env, remoteDir: paths.remote };
  const entryCommits = new Set(Object.keys((await readRepoState(paths.repo, opts)).commits));
  const typed = [];
  for (const command of commands) {
    if (command.startsWith('!')) {
      const result = await git(tokenize(command.slice(1)).slice(1), { cwd: paths.repo, env: { ...env, GIT_EDITOR: 'true' } });
      typed.push({ command: command.slice(1), exitCode: result.code });
    } else {
      await runSetupCommands(paths.repo, [command], { env });
      typed.push({ command, exitCode: 0 });
    }
  }
  const [state, facts] = await Promise.all([readRepoState(paths.repo, opts), readFacts(paths.repo, opts)]);
  return mission.validate(state, { entryCommits, facts, commands: typed });
}

const T = 120_000;

it('3.2 pulling instead of looking fails', async () => {
  expect((await attempt('fetch-ahead-behind', ['git pull --ff-only', 'git status'])).ok).toBe(false);
}, T);

it('3.6 plain --force deletes Lea\'s commit and fails', async () => {
  const result = await attempt('force-with-lease', ['git push --force']);
  expect(result.reason).toMatch(/Lea's offline.md is gone/);
}, T);

it('3.6 fetch then --force-with-lease also overwrites Lea and fails', async () => {
  const result = await attempt('force-with-lease', ['!git push --force-with-lease', 'git fetch', 'git push --force-with-lease']);
  expect(result.reason).toMatch(/Lea's offline.md is gone/);
}, T);

it('7.5 the real conflict flow passes', async () => {
  const result = await attempt('pr-conflict', [
    'git fetch',
    '!git merge origin/main',
    `edit editor.ts "export const editor = 'markdown-gfm';\nexport const autosave = true;"`,
    'git add editor.ts',
    'git commit --no-edit',
    'git push',
  ]);
  expect(result).toEqual({ ok: true });
}, T);

it('7.6 a fast-forward merge is not a merge commit', async () => {
  const result = await attempt('pr-merge-commit', ['git switch main', 'git pull --ff-only', 'git merge feature/markdown', 'git push']);
  expect(result.reason).toMatch(/fast-forwarded/);
}, T);

it('7.8 pushing to main fails', async () => {
  const result = await attempt('pr-protected-main', ['git push']);
  expect(result.reason).toMatch(/You pushed to main/);
}, T);

it('3.8 the lease is stale before a fetch, and a blind --force drops the bot commit', async () => {
  const result = await attempt('agent-force-pushed', ['!git push --force-with-lease', 'git push --force']);
  expect(result.reason).toMatch(/bot's commit is gone/);
}, T);

it('3.8 git pull --rebase drops your commits (fork-point)', async () => {
  const result = await attempt('agent-force-pushed', ['git pull --rebase', 'git push']);
  expect(result.reason).toMatch(/missing your tags commits/);
}, T);

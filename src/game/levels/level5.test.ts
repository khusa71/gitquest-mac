/**
 * 5.2 played literally, the way the player meets it: `git rebase main` stops on the README conflict (exit 1),
 * the stopped state does not validate, --abort restores, and resolve + --continue passes.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, git, readFacts, readRepoState, runSetupCommands, sandboxEnv } from '../../realgit';
import { rebuildEntry } from '../story';
import { level5 } from './level5';

const PLAYER = { name: 'Test Player', email: 'player@test.dev' };

it('5.2: rebase stops on the conflict, --abort restores, resolve + --continue passes', async () => {
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-l5-')));
  try {
    const paths = defaultPaths(home);
    await ensureSandbox(paths, PLAYER);
    const env = { ...sandboxEnv(paths, { ...process.env, HOME: home }), GIT_EDITOR: 'true' };
    await fs.mkdir(paths.repo, { recursive: true });
    const mission = level5.missions.find((m) => m.id === 'conflict-mid-rebase')!;
    await rebuildEntry(paths, mission.id, { env, player: PLAYER });
    const opts = { env, remoteDir: paths.remote };
    const entryCommits = new Set(Object.keys((await readRepoState(paths.repo, opts)).commits));
    const judge = async (commands: string[]) => {
      const [state, facts] = await Promise.all([readRepoState(paths.repo, opts), readFacts(paths.repo, opts)]);
      return { facts, result: mission.validate(state, { entryCommits, facts, commands: commands.map((command) => ({ command, exitCode: 0 })) }) };
    };

    expect((await git(['rebase', 'main'], { cwd: paths.repo, env })).code).toBe(1);
    const stopped = await judge([]);
    expect(stopped.facts.inProgress).toBe('rebase');
    expect(stopped.result.ok).toBe(false);

    await runSetupCommands(paths.repo, ['git rebase --abort'], { env });
    expect((await judge([])).facts.inProgress).toBe(null);

    expect((await git(['rebase', 'main'], { cwd: paths.repo, env })).code).toBe(1);
    await runSetupCommands(
      paths.repo,
      ['edit README.md "# Nova notes. Install: npm ci. Search: Cmd+F"', 'git add README.md', 'git rebase --continue'],
      { env },
    );
    expect((await judge([])).result).toEqual({ ok: true });
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}, 120_000);

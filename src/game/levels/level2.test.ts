/**
 * Level 2 extras the harness does not enforce: every check is false at entry, and the synthetic
 * stopped merges look like real ones to git (unmerged paths, real markers, MERGE_HEAD).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, git, readFacts, readRepoState, sandboxEnv } from '../../realgit';
import { rebuildEntry } from '../story';
import { level2 } from './level2';

const PLAYER = { name: 'Level2 Player', email: 'player@l2.test' };

it('level 2: every check is false at entry, stopped merges are real conflicts', { timeout: 300_000 }, async () => {
  const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-l2-')));
  try {
    for (const mission of level2.missions) {
      const paths = defaultPaths(path.join(tmp, mission.id));
      await ensureSandbox(paths, PLAYER);
      const env = sandboxEnv(paths, { ...process.env, HOME: path.join(tmp, mission.id) });
      await fs.mkdir(paths.repo, { recursive: true });
      await rebuildEntry(paths, mission.id, { env, player: PLAYER });
      const opts = { env, remoteDir: paths.remote };
      const [state, facts] = await Promise.all([readRepoState(paths.repo, opts), readFacts(paths.repo, opts)]);
      const ctx = { entryCommits: new Set(Object.keys(state.commits)), facts, commands: [] };
      const doneAtEntry = mission.checks.filter((check) => check.done(state, ctx)).map((check) => check.label);
      expect(doneAtEntry, `${mission.number}: checks done at entry`).toEqual([]);

      if (mission.id === 'conflict-by-hand' || mission.id === 'merge-abort') {
        expect(facts.inProgress).toBe('merge');
        const status = (await git(['status', '--porcelain'], { cwd: paths.repo, env })).stdout.toString();
        const file = mission.id === 'merge-abort' ? 'plans.md' : 'README.md';
        expect(status).toContain(`UU ${file}`);
        expect(await fs.readFile(path.join(paths.repo, file), 'utf8')).toMatch(/^<<<<<<< HEAD\n.*\n=======\n.*\n>>>>>>> \w/);
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

/** Real git in a temporary home: setup → missions → carried-forward story → replay. */
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as realgit from '../realgit';
import { MISSIONS, missionById } from './content';
import { Game } from './index';
import { rebuildEntry } from './story';

const player = { name: 'Test Player', email: 'player@example.com' };

async function newGame() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'gq-game-'));
  const paths = realgit.defaultPaths(home);
  const game = new Game({ paths, player });
  await game.init();
  const env = realgit.sandboxEnv(paths, process.env);
  /** Simulates the player typing a git command in the terminal. */
  const type = async (command: string) => {
    const [, ...args] = realgit.tokenize(command);
    const result = await realgit.git(args, { cwd: paths.repo, env });
    return game.afterCommand(command, result.code);
  };
  const head = async () => (await realgit.git(['rev-parse', 'HEAD'], { cwd: paths.repo, env })).stdout.trim();
  const progress = () => JSON.parse(readFileSync(paths.progress, 'utf8'));
  return { home, paths, game, type, head, progress };
}

describe('Game with real git', () => {
  it('plays 1.1 then 1.2 on the carried-forward repo, and a replay rebuilds 1.1 in place', async () => {
    const { paths, game, type, head, progress } = await newGame();

    expect((await game.setupStatus()).repoReady).toBe(false);
    const status = await game.runSetup('agents');
    expect(status).toMatchObject({ sandboxReady: true, repoReady: true, path: 'agents' });
    expect(status.gitVersion).toMatch(/^\d+\.\d+/);
    expect(progress().position).toEqual({ missionId: 'root:foundations', stage: 'after' });
    const rootHead = await head();

    // 1.1: the prelude runs on the real repo (position root/after).
    await game.startMission('three-areas');
    let view = game.view();
    expect(view.repoLabel).toBe('~/GitQuest/nova');
    expect(view.mission?.checks.map((c) => c.done)).toEqual([false, false, false]);
    expect(view.commits.map((c) => [c.message, c.refs])).toEqual([['Initial commit', ['HEAD → main']]]);
    expect(view.areas.find((a) => a.path === 'a.txt')).toEqual({
      path: 'a.txt',
      disk: 'Sync: local + offl…',
      index: 'Sync: local only.',
      head: 'Sync: local only.',
    });
    expect(await head()).toBe(rootHead);

    view = await type('git status');
    expect(view.mission?.commandsUsed).toBe(0);
    expect(view.lastCommand).toBe('git status');
    view = await type('git add a.txt');
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, false, false]);
    expect(view.nextCommit?.find((f) => f.path === 'a.txt')?.changed).toBe(true);
    view = await type('git commit -m "fix: a.txt"');
    expect(view.mission?.completed).toMatchObject({ stars: 3, used: 2, next: 'snapshot' });
    expect(view.commits[0]).toMatchObject({ message: 'fix: a.txt', author: 'Test Player', refs: ['HEAD → main'] });
    expect(progress()).toMatchObject({
      position: { missionId: 'three-areas', stage: 'after' },
      completed: { 'three-areas': { stars: 3 } },
    });
    const playerCommit = await head();

    // 1.2: position three-areas/after → prelude on the real repo, the player's commit stays.
    await game.startMission('snapshot');
    view = game.view();
    expect(progress().position).toEqual({ missionId: 'snapshot', stage: 'entry' });
    expect(view.commits.map((c) => c.message)).toEqual(['chore: b.txt v2', 'fix: a.txt', 'Initial commit']);
    expect(view.commits[0]?.author).toBe('Lea Moreau');
    expect(view.commits[1]?.hash).toBe(playerCommit);
    expect(view.areas.find((a) => a.path === 'app.ts')).toEqual({ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' });
    view = await type('git commit -m "docs: v2"');
    expect(view.mission?.completed).toMatchObject({ stars: 3, used: 1, next: 'am-trap' });

    // Replay 1.1: canonical rebuild, copied into the same directory.
    const inode = statSync(paths.repo).ino;
    await game.startMission('three-areas');
    expect(statSync(paths.repo).ino).toBe(inode);
    view = game.view();
    expect(view.commits.map((c) => c.message)).toEqual(['Initial commit']);
    expect(await head()).toBe(rootHead); // canonical hashes reproduce
    expect(view.mission).toMatchObject({ commandsUsed: 0, completed: null });
    expect(progress().completed['three-areas']).toEqual({ stars: 3 });
    expect(view.levels[1]?.missions.map((m) => m.state).slice(0, 3)).toEqual(['current', 'done', 'todo']);
  });

  it('undo, restart, hints and the blocked reason', async () => {
    const { game, type } = await newGame();
    await game.runSetup('classic');
    await game.startMission('three-areas');

    let view = await type('git add a.txt b.txt');
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, false, false]);
    expect(view.mission?.blockedReason).toBeNull();
    view = await type('git commit -m everything');
    expect(view.mission?.blockedReason).toBe('The commit must keep the old version of b.txt.');
    expect(view.mission?.completed).toBeNull();

    view = await game.undo();
    expect(view.commits).toHaveLength(1);
    expect(view.areas.find((a) => a.path === 'b.txt')?.index).toBe('Ideas: sharing, da…');
    view = await game.undo();
    expect(view.areas.find((a) => a.path === 'b.txt')?.index).toBe('Ideas: dark mode,…');

    view = await game.hint();
    view = await game.hint();
    expect(view.mission?.hints).toHaveLength(2);
    expect(view.mission?.hintsTotal).toBe(3);

    await type('git add a.txt');
    view = await game.restart();
    expect(view.mission).toMatchObject({ commandsUsed: 0, hints: [] });
    expect(view.mission?.checks.every((c) => !c.done)).toBe(true);

    // A watcher call (no command) after an outside change is evaluated too.
    view = await game.afterCommand(null, null);
    expect(view.mission?.commandsUsed).toBe(0);
  });

  it('plays 1.3 from a fresh setup (canonical rebuild through 1.1 and 1.2)', async () => {
    const { game, type } = await newGame();
    await game.runSetup('agents');
    await game.startMission('am-trap');
    let view = game.view();
    expect(view.commits.map((c) => c.message)).toEqual([
      'docs: readme v1',
      'chore: app.ts v3',
      'docs: v2',
      'chore: b.txt v2',
      'fix: a.txt',
      'Initial commit',
    ]);
    view = await type('git commit -am "docs: readme"');
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, false, false]);
    expect(view.mission?.blockedReason).toBe('notes.txt must end up committed.');
    await type('git add notes.txt');
    view = await type('git commit -m "docs: notes"');
    expect(view.mission?.completed).toMatchObject({ stars: 3, used: 3, next: MISSIONS[MISSIONS.indexOf(missionById('am-trap')!) + 1]?.id ?? null });
  });

  it('a rebuilt repo has a fresh index: reset --keep works right away', async () => {
    const { paths } = await newGame();
    const env = realgit.sandboxEnv(paths, process.env);
    await realgit.ensureSandbox(paths, player);
    await rebuildEntry(paths, 'snapshot', { env, player });
    const result = await realgit.git(['reset', '--keep', 'HEAD~1'], { cwd: paths.repo, env });
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });

  it('survives a restart of the app (resume from progress.json)', async () => {
    const { paths, game, type } = await newGame();
    await game.runSetup('agents');
    await game.startMission('three-areas');
    await type('git add a.txt');

    const again = new Game({ paths, player });
    await again.init();
    await again.startMission('three-areas'); // resume, no rebuild
    const view = again.view();
    expect(view.mission?.commandsUsed).toBe(1);
    expect(view.mission?.checks.map((c) => c.done)).toEqual([true, false, false]);
  });
});

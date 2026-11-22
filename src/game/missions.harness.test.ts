/**
 * Mission harness: every mission of every level, with real git in a temp home.
 * Builds the canonical entry through the game's own code path (story.rebuildEntry), checks that the
 * entry is not solved, then replays `reference` and each `alternatives` entry as the player and checks
 * that validate passes and every check is done. Also enforces the content rules of docs/CONTENT-GUIDE.md.
 *
 *   npx vitest run src/game/missions.harness.test.ts            all levels
 *   npx vitest run src/game/missions.harness.test.ts -t "<id>"  one level (e.g. -t "foundations")
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, readFacts, readRepoState, runSetupCommands, sandboxEnv } from '../realgit';
import { LEVEL_LIST, MISSIONS, type Level, type Mission } from './content';
import type { MissionContext } from './model';
import { rebuildEntry } from './story';

const PLAYER = { name: 'Harness Player', email: 'player@harness.test' };
const TIMEOUT = 300_000;

let tmp = '';
beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-harness-')));
});
afterAll(async () => {
  if (tmp !== '') await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3 });
});

/** Fresh home → canonical entry → entry must fail → replay `solution` as the player → judged. */
async function play(mission: Mission, solution: readonly string[]) {
  const home = await fs.mkdtemp(path.join(tmp, `${mission.id}-`));
  const paths = defaultPaths(home);
  await ensureSandbox(paths, PLAYER);
  const env = sandboxEnv(paths, { ...process.env, HOME: home });
  await fs.mkdir(paths.repo, { recursive: true });
  await rebuildEntry(paths, mission.id, { env, player: PLAYER });

  const read = async () => {
    const opts = { env, remoteDir: paths.remote };
    const [state, facts] = await Promise.all([readRepoState(paths.repo, opts), readFacts(paths.repo, opts)]);
    return { state, facts };
  };
  const judge = (state: Awaited<ReturnType<typeof read>>['state'], ctx: MissionContext) => ({
    result: mission.validate(state, ctx),
    checks: mission.checks.map((check) => ({ label: check.label, done: check.done(state, ctx) })),
  });

  const entry = await read();
  const entryCommits = new Set(Object.keys(entry.state.commits));
  const atEntry = judge(entry.state, { entryCommits, facts: entry.facts, commands: [] });

  try {
    await runSetupCommands(paths.repo, solution, { env });
  } catch (error) {
    throw new Error(`${mission.number} ${mission.id}: solution failed to run: ${(error as Error).message}`);
  }
  const after = await read();
  const commands = solution.map((command) => ({ command, exitCode: 0 }));
  const solved = judge(after.state, { entryCommits, facts: after.facts, commands });
  return { atEntry, solved };
}

const FRENCH = /(^|[\s"'(])(le|les|une|avec|dans|vous|nous|est|pour la)(?=[\s.,;:!?"')]|$)/;
const ACCENTS = /[À-ɏ’]/;
const sentences = (text: string) => (text.match(/[.!?]+(?=\s|$)/g) ?? []).length;

function contentRules(level: Level, mission: Mission, index: number): void {
  const where = `${mission.number} ${mission.id}`;
  expect(MISSIONS.filter((m) => m.id === mission.id), `${where}: id must be unique`).toHaveLength(1);
  expect(mission.id, `${where}: id must be kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  expect(mission.number, `${where}: number must be <level>.<position>`).toBe(`${level.number}.${index + 1}`);
  expect(mission.hints, `${where}: exactly 3 hints`).toHaveLength(3);
  expect(mission.checks.length, `${where}: 2 to 4 checks`).toBeGreaterThanOrEqual(2);
  expect(mission.checks.length, `${where}: 2 to 4 checks`).toBeLessThanOrEqual(4);
  for (const check of mission.checks) expect(check.proof, `${where}: proof "${check.label}"`).toMatch(/^git /);
  expect(mission.par, `${where}: par = reference.length`).toBe(mission.reference.length);
  for (const [field, text] of Object.entries({
    title: mission.title,
    goal: mission.goal,
    story: mission.story,
    takeaway: mission.takeaway,
    'theory.title': mission.theory.title,
    'theory.body': mission.theory.body,
    'theory.lesson': mission.theory.lesson,
  })) {
    expect(text.trim(), `${where}: ${field} must not be empty`).not.toBe('');
  }
  expect(sentences(mission.story), `${where}: story must be at most 3 sentences`).toBeLessThanOrEqual(3);
  const prose = [
    mission.title,
    mission.goal,
    mission.story,
    mission.takeaway,
    mission.theory.title,
    mission.theory.body,
    mission.theory.lesson,
    ...mission.hints,
    ...mission.checks.map((check) => check.label),
    mission.danger ?? '',
  ];
  for (const text of prose) {
    expect(text, `${where}: English only (no accents or curly apostrophes)`).not.toMatch(ACCENTS);
    expect(text, `${where}: English only (French word)`).not.toMatch(FRENCH);
  }
  if (mission.prelude.some((step) => step.remote !== undefined)) {
    expect(level.remote, `${where}: remote prelude steps need the level to have remote: true`).toBe(true);
  }
}

for (const level of LEVEL_LIST) {
  // Online levels talk to github.com: proven with a fake gh in levels/level11.test.ts instead.
  if (level.missions.length === 0 || level.online === true) continue;
  describe.concurrent(level.id, () => {
    for (const [index, mission] of level.missions.entries()) {
      it(
        `${mission.number} ${mission.id}`,
        async () => {
          contentRules(level, mission, index);
          const solutions = [mission.reference, ...(mission.alternatives ?? [])];
          const runs = await Promise.all(solutions.map((solution) => play(mission, solution)));
          for (const [i, { atEntry, solved }] of runs.entries()) {
            const name = i === 0 ? 'reference' : `alternative ${i}`;
            if (i === 0) {
              expect(atEntry.result.ok, `${mission.id}: validate must fail at entry`).toBe(false);
              expect(
                atEntry.checks.some((check) => !check.done),
                `${mission.id}: at least one check must be false at entry`,
              ).toBe(true);
            }
            expect(solved.result, `${mission.id}: ${name} must pass validate`).toEqual({ ok: true });
            expect(
              solved.checks.filter((check) => !check.done).map((check) => check.label),
              `${mission.id}: ${name} must complete every check`,
            ).toEqual([]);
          }
        },
        TIMEOUT,
      );
    }
  });
}

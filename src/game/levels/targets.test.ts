/**
 * Mission outcome targets: every `outcome.expect` of an offline level is what real git shows once the reference
 * solution is applied. Builds the canonical entry like the mission harness, replays `reference`, then:
 *   terminal → runs the (git) command; output must match, with commit hashes and trailing spaces ignored;
 *   file     → `git show HEAD:<path>`; the expected lines must appear in order (lines like `# ...` mark elisions).
 *   diagram  → only with `{ diagrams: true }`: see checkDiagram.
 *
 *   npx vitest run src/game/levels/targets.test.ts -t "<level id>"
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultPaths, ensureSandbox, git, runSetupCommands, sandboxEnv, tokenize } from '../../realgit';
import { LEVEL_LIST } from '../content';
import type { Mission } from '../model';
import { rebuildEntry } from '../story';

// The player's own identity shows in some targets (Signed-off-by in 6.6): use the one the outcomes display.
const PLAYER = { name: 'You', email: 'you@example.com' };
const TIMEOUT = 300_000;

let tmp = '';
beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gq-targets-')));
});
afterAll(async () => {
  if (tmp !== '') await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3 });
});

const normalize = (text: string) =>
  text
    .replace(/\b[0-9a-f]{7,40}\b/g, '<hash>')
    // The app's terminal is a pty, so `git log --oneline` decorates (`(HEAD -> main)`); this pipe does not.
    .replace(/^([*|\\/ ]*<hash>) \([^)\n]*\)/gm, '$1')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

const ELISION = /^\s*#\s*\.\.\./;

/** Expected lines (elisions skipped) appear in `actual` in order. Returns the first missing line, if any. */
function missingLine(actual: string, expected: string): string | undefined {
  const lines = actual.split('\n');
  let at = 0;
  for (const line of expected.split('\n')) {
    if (ELISION.test(line)) continue;
    const found = lines.indexOf(line, at);
    if (found < 0) return line;
    at = found + 1;
  }
  return undefined;
}

async function solvedRepo(mission: Mission) {
  const home = await fs.mkdtemp(path.join(tmp, `${mission.id}-`));
  const paths = defaultPaths(home);
  await ensureSandbox(paths, PLAYER);
  const env = sandboxEnv(paths, { ...process.env, HOME: home });
  await fs.mkdir(paths.repo, { recursive: true });
  await rebuildEntry(paths, mission.id, { env, player: PLAYER });
  await runSetupCommands(paths.repo, mission.reference, { env });
  return Object.assign((args: readonly string[]) => git(args, { cwd: paths.repo, env }), { repo: paths.repo });
}

type Diagram = Extract<NonNullable<NonNullable<Mission['outcome']>['expect']>, { kind: 'diagram' }>['diagram'];
type Run = Awaited<ReturnType<typeof solvedRepo>>;

/**
 * Opt-in (`{ diagrams: true }`) diagram checks against the solved repo:
 *   areas → each file's disk / index / HEAD version (null = absent);
 *   graph → every non-ghost message is in history, each ref's tip has that message, `HEAD -> x` means HEAD is on x.
 */
async function checkDiagram(mission: Mission, diagram: Diagram, run: Run): Promise<void> {
  const where = mission.id;
  const show = async (spec: string) => {
    const r = await run(['show', spec]);
    return r.code === 0 ? r.stdout.replace(/\n$/, '') : null;
  };
  if (diagram.kind === 'areas') {
    for (const file of diagram.files) {
      const disk = await fs.readFile(path.join(run.repo, file.path), 'utf8').then((t) => t.replace(/\n$/, ''), () => null);
      expect([disk, await show(`:${file.path}`), await show(`HEAD:${file.path}`)], `${where}: ${file.path} disk/index/HEAD`).toEqual([
        file.disk,
        file.index,
        file.head,
      ]);
    }
  } else if (diagram.kind === 'before-after') {
    await checkDiagram(mission, diagram.after, run); // the solved repo is the "after"
  } else if (diagram.kind === 'graph') {
    const subjects = (await run(['log', '--all', '--format=%s'])).stdout.split('\n');
    for (const commit of diagram.commits.filter((c) => c.ghost !== true)) {
      expect(subjects, `${where}: commit "${commit.message}" in history`).toContain(commit.message);
      for (const ref of commit.refs ?? []) {
        const name = ref.replace(/^HEAD (->|→) /, '').replace(/^tag: /, '');
        const tip = (await run(['log', '-1', '--format=%s', name, '--'])).stdout.trim();
        expect(tip, `${where}: ${ref} points at "${commit.message}"`).toBe(commit.message);
        if (/^HEAD (->|→) /.test(ref)) {
          expect((await run(['symbolic-ref', '--short', 'HEAD'])).stdout.trim(), `${where}: HEAD on ${name}`).toBe(name);
        }
      }
    }
  }
}

function targetsOf(levelId: string, opts: { readonly diagrams?: boolean } = {}): void {
  const level = LEVEL_LIST.find((l) => l.id === levelId)!;
  describe.concurrent(levelId, () => {
    for (const mission of level.missions) {
      it(
        `${mission.number} ${mission.id}`,
        async () => {
          const outcome = mission.outcome;
          expect(outcome?.summary.trim(), `${mission.id}: outcome.summary`).toBeTruthy();
          const target = outcome?.expect;
          expect(target, `${mission.id}: outcome.expect`).toBeDefined();
          if (target === undefined || (target.kind === 'diagram' && opts.diagrams !== true)) return;
          const run = await solvedRepo(mission);
          if (target.kind === 'diagram') {
            await checkDiagram(mission, target.diagram, run);
          } else if (target.kind === 'terminal') {
            const [name, ...args] = tokenize(target.command);
            expect(name, `${mission.id}: only git commands can be replayed`).toBe('git');
            const result = await run(args);
            expect(normalize(result.stdout + result.stderr), `${mission.id}: $ ${target.command}`).toBe(normalize(target.output));
          } else {
            // Files under .git/ (hooks) are never committed: read them from disk.
            const result = target.path.startsWith('.git/')
              ? { code: 0, stdout: await fs.readFile(path.join(run.repo, target.path), 'utf8') }
              : await run(['show', `HEAD:${target.path}`]);
            expect(result.code, `${mission.id}: ${target.path} committed`).toBe(0);
            expect(missingLine(result.stdout, target.content), `${mission.id}: line of ${target.path} not found in order`).toBeUndefined();
          }
        },
        TIMEOUT,
      );
    }
  });
}

targetsOf('setup'); // Level 0
targetsOf('foundations', { diagrams: true }); // Level 1
targetsOf('branches', { diagrams: true }); // Level 2
targetsOf('remotes'); // Level 3
targetsOf('undo'); // Level 4
targetsOf('rewriting', { diagrams: true }); // Level 5
targetsOf('advanced', { diagrams: true }); // Level 6
targetsOf('github', { diagrams: true }); // Level 7
targetsOf('team', { diagrams: true }); // Level 8
targetsOf('agents'); // Level 9
targetsOf('actions'); // Level 10

import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_FACTS } from '../realgit';
import type { Commit, FileTree, RepoState } from '../shared/repo-types';
import { AGENTS_ORDER, FILES, LEVEL_LIST, LEVELS, MISSIONS, missionById, type Mission } from './content';
import { countedCommands, emptyProgress, loadProgress, MAX_COMMANDS, sanitizeProgress, saveProgress, starsFor, withCommand } from './progress';
import { canonicalEntryParts, chainParts, entryParts, preludeParts, previousPosition, storyDate } from './story';
import { buildAreas, buildCommits, buildLevels, buildNextCommit, buildPanelData, buildRemote, guidance, homeLabel, MISSION_PANELS, missionPanels, parseWorkflow, versionLabel } from './view';
import type { MissionContext } from './validate';

// Fixtures -------------------------------------------------------------------

/** A tiny linear-history builder: each commit gets hash c1, c2… */
class Repo {
  commits: Record<string, Commit> = {};
  branches: Record<string, string> = {};
  head: RepoState['worktrees'][string]['head'] = { kind: 'branch', branch: 'main' };
  index: FileTree = {};
  disk: FileTree = {};
  private n = 0;

  constructor(snapshot: FileTree) {
    this.commit('Initial commit', snapshot);
  }

  tip(): string | undefined {
    return this.head.kind === 'branch' ? this.branches[this.head.branch] : this.head.commit;
  }

  edit(file: string, content: string): this {
    this.disk = { ...this.disk, [file]: content };
    return this;
  }

  add(...files: string[]): this {
    const next = { ...this.index };
    for (const file of files) {
      const content = this.disk[file];
      if (content === undefined) delete next[file];
      else next[file] = content;
    }
    this.index = next;
    return this;
  }

  commit(message: string, snapshot: FileTree = this.index, author = 'Player'): this {
    const hash = `c${++this.n}`;
    const parent = this.tip();
    this.commits[hash] = {
      hash,
      parents: parent === undefined ? [] : [parent],
      message,
      snapshot,
      author: { name: author, email: 'x@y' },
      timestamp: this.n,
    };
    if (this.head.kind === 'branch') this.branches[this.head.branch] = hash;
    else this.head = { kind: 'detached', commit: hash };
    this.index = snapshot;
    if (this.n === 1) this.disk = snapshot;
    return this;
  }

  state(): RepoState {
    return {
      version: 1,
      initialized: true,
      commits: this.commits,
      branches: this.branches,
      worktrees: { main: { id: 'main', path: '~/GitQuest/nova', isMain: true, head: this.head, index: this.index, workingDir: this.disk } },
      activeWorktree: 'main',
      clock: this.n,
      nextId: this.n,
    };
  }

  ctx(): MissionContext {
    return { entryCommits: new Set(Object.keys(this.commits)), facts: EMPTY_FACTS, commands: [] };
  }

  clone(): Repo {
    const copy = Object.assign(Object.create(Repo.prototype) as Repo, this);
    copy.commits = { ...this.commits };
    copy.branches = { ...this.branches };
    return copy;
  }
}

const rootTree: FileTree = { 'a.txt': FILES.a1, 'b.txt': FILES.b1, 'app.ts': 'v1', 'bug.txt': FILES.bug };
const mission = (id: string) => missionById(id) as Mission;

function entry11(): Repo {
  return new Repo(rootTree).edit('a.txt', FILES.a2).edit('b.txt', FILES.b2);
}
function entry12(): Repo {
  return entry11()
    .add('a.txt')
    .commit('fix: a.txt')
    .add('b.txt')
    .commit('chore: b.txt v2', undefined, 'Lea Moreau')
    .edit('app.ts', 'v2')
    .add('app.ts')
    .edit('app.ts', 'v3');
}
function entry13(): Repo {
  return entry12()
    .commit('docs: v2')
    .add('app.ts')
    .commit('chore: app.ts v3', undefined, 'Lea Moreau')
    .edit('README.md', FILES.readme1)
    .add('README.md')
    .commit('docs: readme v1', undefined, 'Samir Haddad')
    .edit('README.md', FILES.readme2)
    .edit('notes.txt', FILES.notes);
}

function judge(id: string, entry: Repo, after: Repo) {
  const m = mission(id);
  const ctx = entry.ctx();
  const state = after.state();
  return { result: m.validate(state, ctx), checks: m.checks.map((c) => c.done(state, ctx)) };
}

// Validators -----------------------------------------------------------------

describe('1.1 three-areas', () => {
  it('fails at entry with no check done', () => {
    const entry = entry11();
    const { result, checks } = judge('three-areas', entry, entry);
    expect(result.ok).toBe(false);
    expect(checks).toEqual([false, false, false]);
  });
  it('passes with the reference solution', () => {
    const entry = entry11();
    const after = entry.clone().add('a.txt').commit('fix: a.txt');
    expect(judge('three-areas', entry, after)).toEqual({ result: { ok: true }, checks: [true, true, true] });
  });
  it('tolerates two commits for a.txt', () => {
    const entry = entry11();
    const after = entry.clone().add('a.txt').commit('wip').commit('fix again');
    expect(judge('three-areas', entry, after).result.ok).toBe(true);
  });
  it('explains a commit that includes b.txt', () => {
    const entry = entry11();
    const after = entry.clone().add('a.txt', 'b.txt').commit('everything');
    const { result, checks } = judge('three-areas', entry, after);
    expect(result).toEqual({ ok: false, reason: 'The commit must keep the old version of b.txt.' });
    expect(checks).toEqual([true, true, false]);
  });
});

describe('1.2 snapshot', () => {
  it('fails at entry', () => {
    const entry = entry12();
    expect(judge('snapshot', entry, entry).result.ok).toBe(false);
  });
  it('passes with the reference solution, any message', () => {
    const entry = entry12();
    expect(judge('snapshot', entry, entry.clone().commit('docs: v2'))).toEqual({ result: { ok: true }, checks: [true, true] });
    expect(judge('snapshot', entry, entry.clone().commit('another message')).result.ok).toBe(true);
  });
  it('fails when app.ts was restaged', () => {
    const entry = entry12();
    const after = entry.clone().add('app.ts').commit('docs: v3');
    expect(judge('snapshot', entry, after).result).toEqual({ ok: false, reason: 'The commit must contain v2.' });
  });
  it('names the git add slip before any commit', () => {
    const entry = entry12();
    const after = entry.clone().add('app.ts');
    expect(judge('snapshot', entry, after).result).toEqual({
      ok: false,
      reason: 'git add app.ts replaced the staged v2 with v3. Press Undo to put v2 back in the index.',
    });
  });
  it('keeps the exact count: two commits fail', () => {
    const entry = entry12();
    const after = entry.clone().commit('docs: v2').commit('again');
    expect(judge('snapshot', entry, after).result).toEqual({ ok: false, reason: 'Exactly one new commit is expected.' });
  });
});

describe('1.3 am-trap', () => {
  it('fails at entry', () => {
    const entry = entry13();
    expect(judge('am-trap', entry, entry).result.ok).toBe(false);
  });
  it('passes with the reference solution', () => {
    const entry = entry13();
    const after = entry.clone().add('README.md').commit('docs: readme').add('notes.txt').commit('docs: notes');
    expect(judge('am-trap', entry, after)).toEqual({ result: { ok: true }, checks: [true, true, true] });
  });
  it('passes with git add . and a single commit', () => {
    const entry = entry13();
    const after = entry.clone().add('README.md', 'notes.txt').commit('docs');
    expect(judge('am-trap', entry, after).result.ok).toBe(true);
  });
  it('explains the trap after -am only', () => {
    const entry = entry13();
    const after = entry.clone().add('README.md').commit('docs: readme');
    const { result, checks } = judge('am-trap', entry, after);
    expect(result).toEqual({ ok: false, reason: 'notes.txt must end up committed.' });
    expect(checks).toEqual([true, false, false]);
  });
});

describe('content', () => {
  it('every mission has checks with proofs, hints and theory', () => {
    for (const m of MISSIONS) {
      expect(m.checks.every((c) => /^(git|gh) /.test(c.proof))).toBe(true); // gh: online levels
      expect(m.hints.length).toBeGreaterThan(0);
      expect(m.theory.body.length).toBeGreaterThan(0);
    }
  });
  it('is plain English: no accented letters or curly apostrophes', () => {
    expect(JSON.stringify([MISSIONS, LEVELS, LEVEL_LIST.flatMap(chainParts)])).not.toMatch(/[\u00c0-\u00ff\u2019]/);
  });
});

describe('story chain', () => {
  it('dates every command of a level one minute apart from the base', () => {
    for (const level of LEVEL_LIST) {
      const parts = chainParts(level);
      expect(parts[0]?.minute).toBe(0);
      for (let i = 1; i < parts.length; i++) {
        const prev = parts[i - 1];
        const expected = parts[i]?.kind === 'root' ? 0 : (prev?.minute ?? 0) + (prev?.commands.length ?? 0);
        expect(parts[i]?.minute).toBe(expected);
      }
    }
    expect(storyDate(0)).toBe('2026-01-05T09:00:00Z');
    expect(storyDate(61)).toBe('2026-01-05T10:01:00Z');
  });
  it('canonical entry = root + earlier missions (prelude + reference) + this prelude', () => {
    const kinds = canonicalEntryParts('snapshot').map((p) => `${p.owner}:${p.kind}`);
    expect(kinds).toEqual(['root:foundations:root', 'three-areas:prelude', 'three-areas:reference', 'snapshot:prelude', 'snapshot:prelude']);
    expect(preludeParts('snapshot').map((p) => p.teammate)).toEqual(['lea', undefined]);
  });
  it('chains stay inside a level: the first mission follows its level root', () => {
    expect(previousPosition('three-areas')).toBe('root:foundations');
    expect(previousPosition('snapshot')).toBe('three-areas');
    for (const level of LEVEL_LIST) {
      const first = level.missions[0];
      if (first === undefined) continue;
      const root = first.root === undefined ? `root:${level.id}` : `root:${first.id}`;
      expect(previousPosition(first.id)).toBe(first.root === undefined ? root : null);
      expect(canonicalEntryParts(first.id)[0]?.owner).toBe(root);
      expect(canonicalEntryParts(first.id).every((p) => p.owner === root || p.owner === first.id)).toBe(true);
    }
  });
  it('a standalone mission (own root) starts a new segment that later missions continue', () => {
    const m = (id: string, extra: Partial<Mission> = {}): Mission =>
      ({ ...mission('three-areas'), id, prelude: [{ id: `${id}-p`, commands: [`edit ${id}.txt "x"`] }], reference: [`git add ${id}.txt`], ...extra }) as Mission;
    const level = { ...LEVEL_LIST[1]!, id: 'demo', root: ['git init -b main'], missions: [m('a'), m('solo', { root: ['git init -b main', 'git commit --allow-empty -m s'] }), m('after')] };
    const kinds = (id: string) => entryParts(level, id).map((p) => `${p.owner}:${p.kind}:${p.minute}`);
    expect(kinds('a')).toEqual(['root:demo:root:0', 'a:prelude:1']);
    expect(kinds('solo')).toEqual(['root:solo:root:0', 'solo:prelude:2']);
    expect(kinds('after')).toEqual(['root:solo:root:0', 'solo:prelude:2', 'solo:reference:3', 'after:prelude:4']);
  });
});

// Progress and scoring ---------------------------------------------------------

describe('progress', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gq-progress-'));
  it('falls back to defaults on a missing or corrupt file', async () => {
    expect(await loadProgress(path.join(dir, 'missing.json'))).toEqual(emptyProgress());
    const corrupt = path.join(dir, 'corrupt.json');
    writeFileSync(corrupt, '{"version":1,"path":');
    expect(await loadProgress(corrupt)).toEqual(emptyProgress());
  });
  it('keeps valid fields and drops malformed ones', () => {
    const progress = sanitizeProgress({
      version: 1,
      path: 'agents',
      completed: { 'three-areas': { stars: 3 }, bad: { stars: 9 } },
      current: 42,
      position: { missionId: 'snapshot', stage: 'entry' },
      attempt: { missionId: 'snapshot', commandsUsed: -1, hintsUsed: 0, entryCommits: [] },
    });
    expect(progress).toEqual({
      version: 1,
      path: 'agents',
      completed: { 'three-areas': { stars: 3 } },
      current: null,
      position: { missionId: 'snapshot', stage: 'entry' },
      attempt: null,
      lessons: {},
    });
    expect(sanitizeProgress({ version: 2, path: 'agents' })).toEqual(emptyProgress());
  });
  it('keeps lesson progress, dropping malformed entries', () => {
    const lessons = { foundations: { slide: 3, read: true, quiz: { q1: 'b', q2: 7 } }, branches: { slide: -2, read: 'yes' }, bad: 'x' };
    expect(sanitizeProgress({ version: 1, lessons }).lessons).toEqual({
      foundations: { slide: 3, read: true, quiz: { q1: 'b' } },
      branches: { slide: 0, read: false, quiz: {} },
    });
  });
  it('keeps the typed commands of an attempt, defaulting old files to none', () => {
    const attempt = { missionId: 'snapshot', commandsUsed: 1, hintsUsed: 0, entryCommits: [] };
    expect(sanitizeProgress({ version: 1, attempt }).attempt?.commands).toEqual([]);
    const commands = [{ command: 'git log -S x', exitCode: 0 }, { command: 'oops', exitCode: null }, { command: 3 }];
    expect(sanitizeProgress({ version: 1, attempt: { ...attempt, commands } }).attempt?.commands).toEqual(commands.slice(0, 2));
    let history = withCommand([], { command: 'git status', exitCode: 0 });
    for (let i = 0; i < MAX_COMMANDS + 5; i++) history = withCommand(history, { command: `c${i}`, exitCode: 0 });
    expect(history).toHaveLength(MAX_COMMANDS);
    expect(history.at(-1)?.command).toBe(`c${MAX_COMMANDS + 4}`);
  });
  it('round-trips through disk', async () => {
    const file = path.join(dir, 'nested', 'progress.json');
    const progress = { ...emptyProgress(), path: 'classic' as const, current: 'snapshot' };
    await saveProgress(file, progress);
    expect(await loadProgress(file)).toEqual(progress);
  });
});

describe('scoring', () => {
  it('gives stars like the web game', () => {
    expect([1, 2, 3, 4, 5].map((used) => starsFor(used, 2))).toEqual([3, 3, 2, 2, 1]);
  });
  it('counts only successful git commands that change something', () => {
    expect(countedCommands('git add a.txt', 0)).toBe(1);
    expect(countedCommands('git add a.txt', 1)).toBe(0);
    expect(countedCommands('git add a.txt', null)).toBe(0);
    for (const readOnly of ['git status', 'git log --oneline', 'git diff --staged', 'git show HEAD', 'git branch', 'git branch -a', 'ls', 'cat a.txt', 'cd ..', 'pwd', 'clear', 'echo hi']) {
      expect(countedCommands(readOnly, 0)).toBe(0);
    }
    expect(countedCommands('git branch feature', 0)).toBe(1);
    expect(countedCommands('git branch -d feature', 0)).toBe(1);
    expect(countedCommands('git add a.txt && git commit -m "a; b && c"', 0)).toBe(2);
    expect(countedCommands('git status; git add .', 0)).toBe(1);
    expect(countedCommands('GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash main', 0)).toBe(1);
  });
});

// View building ----------------------------------------------------------------

describe('labels', () => {
  it('keeps vN, cuts long content, empty stays empty', () => {
    expect(versionLabel('v2')).toBe('v2');
    expect(versionLabel('')).toBe('');
    expect(versionLabel('Sync: local only.')).toBe('Sync: local only.');
    expect(versionLabel(FILES.a2)).toBe('Sync: local + offl…');
    expect(versionLabel('line one\nline two')).toBe('line one…');
  });
  it('story versions of a file get distinct labels', () => {
    for (const [one, two] of [[FILES.a1, FILES.a2], [FILES.b1, FILES.b2], [FILES.readme1, FILES.readme2]] as const) {
      expect(versionLabel(one)).not.toBe(versionLabel(two));
    }
  });
  it('shows the home folder as ~', () => {
    expect(homeLabel('/Users/k/GitQuest/nova', '/Users/k')).toBe('~/GitQuest/nova');
    expect(homeLabel('/elsewhere/nova', '/Users/k')).toBe('/elsewhere/nova');
  });
});

describe('view', () => {
  it('builds commits newest first with refs, lanes, authors and changed files', () => {
    const repo = entry12();
    repo.branches.feature = 'c2';
    const state = { ...repo.state(), remoteTracking: { 'origin/main': 'c1' } };
    const commits = buildCommits(state);
    expect(commits.map((c) => c.short)).toEqual(['c3', 'c2', 'c1']);
    expect(commits.map((c) => c.refs)).toEqual([['HEAD → main'], ['feature'], ['origin/main']]);
    expect(commits.every((c) => c.lane === 'main' && c.reachable)).toBe(true);
    expect(commits[0]?.author).toBe('Lea Moreau');
    expect(commits[0]?.snapshot.filter((f) => f.changed).map((f) => f.path)).toEqual(['b.txt']);
    expect(commits[2]?.snapshot.some((f) => f.changed)).toBe(false); // root commit stays muted
    expect(commits[0]?.isHead).toBe(true);
  });
  it('marks commits no ref reaches (amended away) as unreachable', () => {
    const repo = entry11().add('a.txt').commit('fix');
    const lost = repo.state();
    repo.branches.main = 'c1';
    const state = { ...repo.state(), commits: lost.commits };
    const commits = buildCommits(state);
    expect(commits.find((c) => c.hash === 'c2')?.reachable).toBe(false);
  });
  it('nextCommit appears only when the index differs from HEAD', () => {
    expect(buildNextCommit(entry11().state())).toBeNull();
    const staged = buildNextCommit(entry12().state());
    expect(staged?.find((f) => f.path === 'app.ts')).toEqual({ path: 'app.ts', version: 'v2', changed: true });
  });
  it('areas show each file on disk, in the index and in HEAD', () => {
    const areas = buildAreas(entry13().state());
    expect(areas.find((a) => a.path === 'notes.txt')).toEqual({ path: 'notes.txt', disk: 'Meeting notes: LRU…', index: null, head: null });
    expect(areas.find((a) => a.path === 'app.ts')).toEqual({ path: 'app.ts', disk: 'v3', index: 'v3', head: 'v3' });
  });
});

describe('topic panels', () => {
  it('remote: ahead and behind per branch, branches on one side only', () => {
    // main: c1 ← c2 ← c3 locally; origin/main went c1 ← c2 ← t1 (a teammate's push).
    const repo = entry12();
    repo.commits.t1 = { ...(repo.commits.c3 as Commit), hash: 't1', parents: ['c2'], message: 'theirs' };
    repo.branches.local = 'c1';
    const state = {
      ...repo.state(),
      remoteTracking: { 'origin/main': 't1', 'origin/gone': 'c1' },
      upstream: { main: 'origin/main' },
    };
    expect(buildRemote(state)).toEqual([
      { branch: 'main', local: 'c3', remote: 't1', ahead: 1, behind: 1, upstream: 'origin/main' },
      { branch: 'gone', local: null, remote: 'c1', ahead: 0, behind: 0, upstream: null },
      { branch: 'local', local: 'c1', remote: null, ahead: 0, behind: 0, upstream: null },
    ]);
    const behindOnly = { ...state, branches: { main: 'c2' } };
    expect(buildRemote(behindOnly)[0]).toMatchObject({ ahead: 0, behind: 1 });
  });
  it('workflow: jobs, needs, steps and runs-on from YAML; parse errors in words', () => {
    const yml = [
      'on: [push]',
      'jobs:',
      '  test:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Install',
      '        run: npm ci',
      '      - run: |',
      '          npm test',
      '          npm run lint',
      '  deploy:',
      '    needs: test',
      '    runs-on: [self-hosted, linux]',
      '    steps: []',
    ].join('\n');
    expect(parseWorkflow('ci.yml', yml)).toEqual({
      file: 'ci.yml',
      error: null,
      jobs: [
        { id: 'test', needs: [], runsOn: 'ubuntu-latest', steps: ['actions/checkout@v4', 'Install', 'npm test'] },
        { id: 'deploy', needs: ['test'], runsOn: 'self-hosted, linux', steps: [] },
      ],
    });
    expect(parseWorkflow('ci.yml', 'jobs:\n  test:\n runs-on: x\n   - bad').error).toMatch(/^The YAML does not parse/);
    expect(parseWorkflow('ci.yml', 'on: push').error).toBe('No jobs: section yet.');
  });
  it('panel data: workflow from disk (ci.yml first), config with scopes, reflog cut to 12', () => {
    const repo = entry11().edit('.github/workflows/a.yml', 'jobs:\n  a:\n    runs-on: x').edit('.github/workflows/ci.yml', 'jobs:\n  test:\n    runs-on: y');
    const facts = {
      ...EMPTY_FACTS,
      configEntries: [{ key: 'user.name', value: 'Lea', scope: 'local' as const }],
      reflog: Array.from({ length: 20 }, (_, i) => ({ hash: `${i}`.repeat(40), action: `commit: ${i}` })),
    };
    const data = buildPanelData(repo.state(), facts);
    expect(data.workflow?.file).toBe('.github/workflows/ci.yml');
    expect(data.config).toEqual(facts.configEntries);
    expect(data.reflog).toHaveLength(12);
    expect(data.reflog[0]).toEqual({ short: '0000000', action: 'commit: 0' });
    expect(data.worktrees).toEqual([{ path: '~/GitQuest/nova', branch: 'main', isMain: true }]);
    expect(buildPanelData(null, EMPTY_FACTS).remote).toEqual([]);
  });
  it('panels: level default, mission override, every level covered', () => {
    expect(missionPanels(mission('three-areas'), 1)).toEqual(['history', 'areas']);
    expect(missionPanels(mission('unstage'), 4)).toEqual(['history', 'areas']);
    expect(missionPanels(mission('reflog-rescue'), 4)).toEqual(['history', 'stash-reflog']);
    for (const level of LEVEL_LIST) {
      for (const m of level.missions) expect(missionPanels(m, level.number).length).toBeGreaterThan(0);
    }
    for (const id of Object.keys(MISSION_PANELS)) expect(missionById(id), id).toBeDefined();
  });
});

describe('capstone guidance', () => {
  const checks = [
    { label: 'Done one', proof: 'git log', done: true },
    { label: 'Secret', proof: 'git show', done: false },
  ];
  it('hides checks not done yet and holds hints back until 2 commands', () => {
    const capstone = { ...mission('three-areas'), capstone: true } as Mission;
    expect(guidance(capstone, checks, { hintsUsed: 1, commandsUsed: 1 })).toEqual({
      checks: [checks[0], { label: 'Hidden check', proof: '', done: false }],
      hints: [],
    });
    expect(guidance(capstone, checks, { hintsUsed: 1, commandsUsed: 2 }).hints).toEqual(capstone.hints.slice(0, 1));
  });
  it('leaves normal missions alone', () => {
    const normal = mission('three-areas');
    expect(guidance(normal, checks, { hintsUsed: 2, commandsUsed: 0 })).toEqual({ checks, hints: normal.hints.slice(0, 2) });
  });
});

describe('levels', () => {
  it('orders the agents path and marks go-deeper levels', () => {
    const levels = buildLevels({ ...emptyProgress(), path: 'agents' }, true);
    const order = Object.fromEntries(levels.map((l) => [l.number, l.suggestedOrder]));
    expect(order).toEqual(Object.fromEntries(LEVEL_LIST.map((l) => [l.number, AGENTS_ORDER[l.number] ?? null])));
    expect(order).toMatchObject({ 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 7: 5, 5: null, 6: null, 8: null });
    expect(levels.find((l) => l.number === 4)?.warning).toBe('can lose work, practice repo only');
    expect(levels[0]?.done).toBe(levels[0]?.missions.length === 0 ? 3 : 0);
  });
  it('classic path uses level numbers; mission states follow progress', () => {
    const levels = buildLevels(
      { ...emptyProgress(), path: 'classic', current: 'snapshot', completed: { 'three-areas': { stars: 2 } } },
      true,
    );
    expect(levels.map((l) => l.suggestedOrder)).toEqual(LEVEL_LIST.map((l) => (l.online === true ? null : l.number)));
    const foundations = levels[1];
    expect(foundations?.missions.map((m) => [m.number, m.state, m.stars]).slice(0, 3)).toEqual([
      ['1.1', 'done', 2],
      ['1.2', 'current', 0],
      ['1.3', 'todo', 0],
    ]);
    expect(foundations?.done).toBe(1);
    expect(foundations?.planned).toBe(Math.max(9, foundations?.missions.length ?? 0));
  });
});

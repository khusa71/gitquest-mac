import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  defaultPaths,
  ensureSandbox,
  git,
  gitVersion,
  readFacts,
  readRepoState,
  restore,
  runSetupCommands,
  sandboxEnv,
  snapshot,
  tokenize,
  type GitQuestPaths,
} from './index';

const PLAYER = { name: 'Ada Player', email: 'ada@example.com' };
const LEA = { name: 'Léa Moreau', email: 'lea@nova.dev' };
const DATE = '2026-01-05T09:00:00Z';

// Web game: storyRoot (src/content/story/root.ts) expressed as setup commands, then chapter 1 preludes.
const ROOT = [
  'git init',
  'edit a.txt "Nova — notes de conception : synchronisation locale."',
  'edit b.txt "Nova — idées : mode sombre, export PDF."',
  'edit app.ts "v1"',
  'edit bug.txt "export function login(req) { return db.find(req.user); }"',
  'git add .',
  'git commit -m "Initial commit"',
];
const M11_PRELUDE = [
  'edit a.txt "Nova — notes de conception : synchronisation locale + cache hors-ligne."',
  'edit b.txt "Nova — idées : mode sombre, export PDF, partage de notes."',
];

let tmp: string;
const dirs: string[] = [];

async function sandbox(): Promise<{ paths: GitQuestPaths; env: NodeJS.ProcessEnv }> {
  const home = await fs.mkdtemp(path.join(tmp, 'home-'));
  const paths = defaultPaths(home);
  await ensureSandbox(paths, PLAYER);
  await fs.mkdir(paths.repo, { recursive: true });
  return { paths, env: sandboxEnv(paths, { ...process.env, HOME: home }) };
}

async function sh(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): Promise<string> {
  const result = await git(args, { cwd, env });
  return result.stdout.trim();
}

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'gitquest-realgit-')));
  dirs.push(tmp);
});
afterAll(async () => {
  for (const dir of dirs) await fs.rm(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe('tokenize', () => {
  it.each([
    ['git commit -m "fix: a.txt"', ['git', 'commit', '-m', 'fix: a.txt']],
    ["edit a.txt 'single quoted'", ['edit', 'a.txt', 'single quoted']],
    ['edit a.txt "say \\"hi\\" \\\\ ok"', ['edit', 'a.txt', 'say "hi" \\ ok']],
    ['edit a.txt "it\'s"', ['edit', 'a.txt', "it's"]],
    ['  git   status  ', ['git', 'status']],
    ['edit f ""', ['edit', 'f', '']],
    ['a\\ b c', ['a b', 'c']],
    ['edit README.md "# Nova — assistant de notes d’équipe."', ['edit', 'README.md', '# Nova — assistant de notes d’équipe.']],
  ])('%s', (input, expected) => {
    expect(tokenize(input)).toEqual(expected);
  });
  it('turns \\n into a newline inside double quotes only when asked', () => {
    expect(tokenize('edit f "a\\nb" \'c\\nd\'', { newlines: true })).toEqual(['edit', 'f', 'a\nb', 'c\\nd']);
    expect(tokenize('edit f "a\\nb"')).toEqual(['edit', 'f', 'anb']);
  });
});

describe('environment', () => {
  it('reports the git version', async () => {
    expect(await gitVersion()).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('sandboxes git config and locale', () => {
    const paths = defaultPaths('/h');
    const env = sandboxEnv(paths, { PATH: '/bin', GIT_DIR: '/x', GIT_WORK_TREE: '/y', GIT_INDEX_FILE: '/z', LANGUAGE: 'fr' });
    expect(env).toMatchObject({
      PATH: '/bin',
      GIT_CONFIG_GLOBAL: '/h/.gitquest/gitconfig',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      GIT_EDITOR: 'nano',
      GIT_PAGER: 'cat',
      LANG: 'en_US.UTF-8',
    });
    // The player's own pager and locale stay untouched in their shell.
    expect(env.PAGER).toBeUndefined();
    expect(env.LC_ALL).toBeUndefined();
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'LANGUAGE']) expect(env[key]).toBeUndefined();
  });

  it('ensureSandbox is idempotent and maps the story URL to the bare remote', async () => {
    const { paths, env } = await sandbox();
    await ensureSandbox(paths, PLAYER);
    expect(await sh(paths.data, env, 'config', '--global', 'user.name')).toBe(PLAYER.name);
    expect(await sh(paths.data, env, 'config', '--global', 'init.defaultBranch')).toBe('main');
    expect(await sh(paths.remote, env, 'rev-parse', '--is-bare-repository')).toBe('true');
    await runSetupCommands(paths.repo, [...ROOT, 'git remote add origin https://git.nova.example/nova.git', 'git push -u origin main'], { env, date: DATE });
    expect(await sh(paths.remote, env, 'rev-parse', 'main')).toBe(await sh(paths.repo, env, 'rev-parse', 'HEAD'));
    const state = await readRepoState(paths.repo, { env, remoteDir: paths.remote });
    expect(state.remotes?.origin).toMatchObject({ url: 'https://git.nova.example/nova.git', branches: { main: state.branches.main } });
    expect(state.remoteTracking).toEqual({ 'origin/main': state.branches.main });
    expect(state.upstream).toEqual({ main: 'origin/main' });
  });
});

describe('runSetupCommands', () => {
  it('replays the story root and the mission 1.1 prelude', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, ROOT, { env, date: DATE });
    await runSetupCommands(paths.repo, M11_PRELUDE, { env });
    expect(await fs.readFile(path.join(paths.repo, 'app.ts'), 'utf8')).toBe('v1\n');
    const state = await readRepoState(paths.repo, { env });
    const head = state.branches.main!;
    expect(Object.keys(state.commits)).toEqual([head]);
    expect(state.commits[head]).toMatchObject({
      message: 'Initial commit',
      parents: [],
      author: PLAYER,
      branch: 'main',
      timestamp: 1,
      snapshot: { 'a.txt': 'Nova — notes de conception : synchronisation locale.', 'app.ts': 'v1' },
    });
    const main = state.worktrees.main!;
    expect(main.head).toEqual({ kind: 'branch', branch: 'main' });
    expect(main.workingDir['a.txt']).toBe('Nova — notes de conception : synchronisation locale + cache hors-ligne.');
    expect(main.index['a.txt']).toBe('Nova — notes de conception : synchronisation locale.');
  });

  it('stamps teammate authors and produces identical hashes for the same commands', async () => {
    const heads: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const { paths, env } = await sandbox();
      await runSetupCommands(paths.repo, ROOT, { env, author: PLAYER, date: DATE });
      await runSetupCommands(paths.repo, M11_PRELUDE, { env });
      await runSetupCommands(paths.repo, ['git add b.txt', 'git commit -m "chore: b.txt v2"'], { env, author: LEA, date: '2026-01-05T09:01:00Z' });
      heads.push(await sh(paths.repo, env, 'rev-parse', 'HEAD'));
      const state = await readRepoState(paths.repo, { env });
      expect(state.commits[heads[i]!]).toMatchObject({ author: LEA, message: 'chore: b.txt v2', timestamp: 2, branch: 'main' });
    }
    expect(heads[0]).toBe(heads[1]);
  });

  it('handles touch, rm, nested edit and reports failures', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, ['git init', 'touch t.txt', 'edit docs/deep/x.md "x"', 'edit gone.txt "y"', 'rm gone.txt'], { env });
    expect(await fs.readFile(path.join(paths.repo, 't.txt'), 'utf8')).toBe('');
    expect(await fs.readFile(path.join(paths.repo, 'docs/deep/x.md'), 'utf8')).toBe('x\n');
    await expect(fs.stat(path.join(paths.repo, 'gone.txt'))).rejects.toThrow();
    await expect(runSetupCommands(paths.repo, ['git switch nope'], { env })).rejects.toThrow(/git switch nope[\s\S]*nope/);
    await expect(runSetupCommands(paths.repo, ['ls -la'], { env })).rejects.toThrow(/Unknown setup command/);
    await expect(runSetupCommands(paths.repo, ['chmod 644 t.txt'], { env })).rejects.toThrow(/Unknown setup command/);
  });

  it('git! runs git and accepts a non-zero exit (a conflict the next commands resolve)', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(
      paths.repo,
      [...ROOT, 'git switch -c feature', 'edit a.txt "feature"', 'git commit -am "feature"', 'git switch main', 'edit a.txt "main"', 'git commit -am "main"'],
      { env, date: DATE },
    );
    await expect(runSetupCommands(paths.repo, ['git merge feature'], { env })).rejects.toThrow(/git merge feature/);
    await git(['merge', '--abort'], { cwd: paths.repo, env });
    await runSetupCommands(paths.repo, ['git! merge feature', 'edit a.txt "both"', 'git add a.txt', 'git commit --no-edit'], { env });
    expect(await sh(paths.repo, env, 'log', '-1', '--format=%p')).toContain(' ');
    expect(await fs.readFile(path.join(paths.repo, 'a.txt'), 'utf8')).toBe('both\n');
  });

  it('handles append, mkdir, mv, chmod +x, \\n escapes and VAR= prefixes', async () => {
    const { paths, env } = await sandbox();
    const read = (file: string) => fs.readFile(path.join(paths.repo, file), 'utf8');
    await runSetupCommands(
      paths.repo,
      [
        'git init -b main',
        'edit notes.md "# Notes\\n\\n- one"',
        'append notes.md "- two"',
        'touch bare.txt',
        'append bare.txt "first"',
        'append new/log.txt "created"',
        'mkdir empty/dir',
        'edit hook.sh "#!/bin/sh\\nexit 0"',
        'chmod +x hook.sh',
        'mv hook.sh scripts/pre-commit',
        'git add .',
        'GIT_AUTHOR_NAME="Env Author" git commit -m "env: x"',
      ],
      { env, date: DATE },
    );
    expect(await read('notes.md')).toBe('# Notes\n\n- one\n- two\n');
    expect(await read('bare.txt')).toBe('first\n');
    expect(await read('new/log.txt')).toBe('created\n');
    expect((await fs.stat(path.join(paths.repo, 'empty/dir'))).isDirectory()).toBe(true);
    await expect(fs.stat(path.join(paths.repo, 'hook.sh'))).rejects.toThrow();
    expect((await fs.stat(path.join(paths.repo, 'scripts/pre-commit'))).mode & 0o111).not.toBe(0);
    expect(await sh(paths.repo, env, 'log', '-1', '--format=%an|%s')).toBe('Env Author|env: x');
    expect(await sh(paths.repo, env, 'ls-files', '-s', 'scripts/pre-commit')).toMatch(/^100755 /);
    // A file written without a final newline still gets its line on a line of its own.
    await fs.writeFile(path.join(paths.repo, 'raw.txt'), 'no newline');
    await runSetupCommands(paths.repo, ['append raw.txt "next"'], { env });
    expect(await read('raw.txt')).toBe('no newline\nnext\n');
  });
});

describe('readFacts', () => {
  it('reads an empty directory as empty facts', async () => {
    const { paths, env } = await sandbox();
    const facts = await readFacts(paths.repo, { env });
    expect(facts).toMatchObject({ stashes: [], tags: [], reflog: [], inProgress: null, hooks: [], server: null });
    expect(facts.config['user.name']).toBe(PLAYER.name);
  });

  it('reads stashes, tags, reflog, config, hooks, ignored files, submodules, notes and the server', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(
      paths.repo,
      [
        ...ROOT,
        'git remote add origin https://git.nova.example/nova.git',
        'git push -u origin main',
        'git tag v1',
        'git tag -a v1.1 -m "Release 1.1"',
        'git push origin v1.1',
        'git config alias.LG "log --oneline"',
        'git config core.hooksPath .githooks',
        'edit .githooks/pre-commit "#!/bin/sh"',
        'chmod +x .githooks/pre-commit',
        'edit .githooks/notes.txt "not a hook"',
        'edit .gitignore "*.log\\nbuild/"',
        'edit debug.log "x"',
        'edit build/out.js "x"',
        'edit .gitmodules "[submodule \\"lib\\"]\\npath = vendor/lib\\nurl =https://example.com/lib.git"',
        'git notes add -m "reviewed"',
        'edit a.txt "wip"',
        'git stash push -m "half done"',
      ],
      { env, date: DATE },
    );
    await fs.writeFile(path.join(paths.repo, '.git', 'hooks', 'post-commit'), '#!/bin/sh\n', { mode: 0o755 });
    const head = await sh(paths.repo, env, 'rev-parse', 'HEAD');
    const facts = await readFacts(paths.repo, { env, remoteDir: paths.remote });

    expect(facts.stashes).toEqual([{ ref: 'stash@{0}', message: 'On main: half done' }]);
    expect(facts.tags).toEqual([
      { name: 'v1', target: head, annotated: false, message: null },
      { name: 'v1.1', target: head, annotated: true, message: 'Release 1.1' },
    ]);
    expect(facts.reflog[0]).toEqual({ hash: head, action: 'reset: moving to HEAD' });
    expect(facts.reflog.at(-1)).toEqual({ hash: head, action: 'commit (initial): Initial commit' });
    expect(facts.config).toMatchObject({ 'alias.lg': 'log --oneline', 'user.name': PLAYER.name, 'remote.origin.url': 'https://git.nova.example/nova.git' });
    expect(facts.configEntries).toContainEqual({ key: 'alias.lg', value: 'log --oneline', scope: 'local' });
    expect(facts.configEntries).toContainEqual({ key: 'user.name', value: PLAYER.name, scope: 'global' });
    expect(facts.inProgress).toBeNull();
    expect(facts.hooks).toEqual(['pre-commit']); // core.hooksPath wins over .git/hooks
    expect(facts.ignored).toEqual(['build/', 'debug.log']);
    expect(facts.submodules).toEqual(['vendor/lib']);
    expect(facts.notes).toEqual([head]);
    expect(facts.server).toEqual({ branches: { main: head }, tags: ['v1.1'] });
    // Stash and notes commits are bookkeeping: facts report them, the commit graph does not.
    expect(Object.keys((await readRepoState(paths.repo, { env })).commits)).toEqual([head]);
  });

  it('skips submodule gitlinks in the index like in commit snapshots', async () => {
    const { paths, env } = await sandbox();
    const lib = path.join(paths.root, 'lib');
    await fs.mkdir(lib);
    await runSetupCommands(lib, ['git init -b main', 'edit x.txt "x"', 'git add .', 'git commit -m lib'], { env, date: DATE });
    await runSetupCommands(paths.repo, [...ROOT, 'git -c protocol.file.allow=always submodule add ../lib lib'], { env, date: DATE });
    let main = (await readRepoState(paths.repo, { env })).worktrees.main!;
    expect(Object.keys(main.index)).not.toContain('lib');
    await runSetupCommands(paths.repo, ['git commit -m "add lib"'], { env, date: DATE });
    const state = await readRepoState(paths.repo, { env });
    main = state.worktrees.main!;
    expect(main.index).toEqual(state.commits[state.branches.main!]!.snapshot);
    expect((await readFacts(paths.repo, { env })).submodules).toEqual(['lib']);
  });

  it('reports the operation in progress', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(
      paths.repo,
      [...ROOT, 'git switch -c feature', 'edit a.txt "feature"', 'git commit -am "feature"', 'git switch main', 'edit a.txt "main"', 'git commit -am "main"'],
      { env, date: DATE },
    );
    expect((await git(['merge', 'feature'], { cwd: paths.repo, env })).code).not.toBe(0);
    expect((await readFacts(paths.repo, { env })).inProgress).toBe('merge');
    await git(['merge', '--abort'], { cwd: paths.repo, env });
    expect((await git(['rebase', 'feature'], { cwd: paths.repo, env })).code).not.toBe(0);
    expect((await readFacts(paths.repo, { env })).inProgress).toBe('rebase');
    await git(['rebase', '--abort'], { cwd: paths.repo, env });
    await git(['bisect', 'start'], { cwd: paths.repo, env });
    expect((await readFacts(paths.repo, { env })).inProgress).toBe('bisect');
  });
});

describe('readRepoState', () => {
  it('reads an uninitialised directory', async () => {
    const { paths, env } = await sandbox();
    const state = await readRepoState(paths.repo, { env });
    expect(state).toMatchObject({ initialized: false, commits: {}, branches: {} });
  });

  it('reads staged vs unstaged changes, branches, detached commits and lanes', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(
      paths.repo,
      [
        ...ROOT,
        'git switch -c feature',
        'edit app.ts "feature"',
        'git commit -am "feat: app"',
        'git switch main',
        'git switch --detach HEAD',
        'edit bug.txt "detached"',
        'git commit -am "wip: detached"',
        'git switch main',
        'edit a.txt "staged"',
        'git add a.txt',
        'edit a.txt "unstaged"',
        'edit new.txt "untracked"',
        'edit .gitignore "ignored.log"',
        'edit ignored.log "nope"',
      ],
      { env, date: DATE },
    );
    await fs.writeFile(path.join(paths.repo, 'crlf.txt'), 'one\r\ntwo\r\n');
    const state = await readRepoState(paths.repo, { env });
    const byMessage = Object.fromEntries(Object.values(state.commits).map((c) => [c.message, c]));
    expect(Object.keys(byMessage).sort()).toEqual(['Initial commit', 'feat: app', 'wip: detached']);
    expect(byMessage['feat: app']).toMatchObject({ branch: 'feature', timestamp: 2 });
    expect(byMessage['wip: detached']!.branch).toBeUndefined();
    expect(byMessage['wip: detached']!.timestamp).toBe(3);
    expect(byMessage['wip: detached']!.parents).toEqual([state.branches.main]);
    expect(Object.keys(state.branches).sort()).toEqual(['feature', 'main']);
    expect(state.clock).toBe(3);

    const wt = state.worktrees.main!;
    expect(wt).toMatchObject({ id: 'main', isMain: true, head: { kind: 'branch', branch: 'main' } });
    expect(wt.path).toBe('~/GitQuest/nova');
    expect(wt.index['a.txt']).toBe('staged');
    expect(wt.workingDir['a.txt']).toBe('unstaged');
    expect(wt.workingDir['new.txt']).toBe('untracked');
    expect(wt.index['new.txt']).toBeUndefined();
    expect(wt.workingDir['ignored.log']).toBeUndefined();
    expect(wt.workingDir['crlf.txt']).toBe('one\ntwo');
    expect(Object.keys(wt.workingDir).some((file) => file.startsWith('.git/'))).toBe(false);
    expect(wt.merge).toBeUndefined();

    await runSetupCommands(paths.repo, ['git restore --staged a.txt', 'git restore a.txt', 'git switch --detach feature'], { env });
    const detached = await readRepoState(paths.repo, { env });
    expect(detached.worktrees.main!.head).toEqual({ kind: 'detached', commit: state.branches.feature });
  });

  it('reads a merge conflict', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(
      paths.repo,
      [...ROOT, 'git switch -c feature', 'edit app.ts "theirs"', 'git commit -am "feat"', 'git switch main', 'edit app.ts "ours"', 'git commit -am "main"'],
      { env, date: DATE },
    );
    expect((await git(['merge', 'feature'], { cwd: paths.repo, env })).code).not.toBe(0);
    const state = await readRepoState(paths.repo, { env });
    const wt = state.worktrees.main!;
    const root = Object.values(state.commits).find((c) => c.message === 'Initial commit')!;
    expect(wt.merge).toEqual({
      branch: 'feature',
      base: root.hash,
      ours: state.branches.main,
      theirs: state.branches.feature,
      conflicts: [{ path: 'app.ts', base: 'v1', ours: 'ours', theirs: 'theirs' }],
    });
    expect(wt.index['app.ts']).toBe('ours');
    expect(wt.workingDir['app.ts']).toContain('<<<<<<< HEAD');

    await runSetupCommands(paths.repo, ['edit app.ts "resolved"', 'git add app.ts', 'git merge --continue'], { env });
    const merged = await readRepoState(paths.repo, { env });
    const mergeCommit = merged.commits[merged.branches.main!]!;
    expect(mergeCommit).toMatchObject({ message: "Merge branch 'feature'", branch: 'main', timestamp: 4 });
    expect(mergeCommit.parents).toHaveLength(2);
    expect(merged.worktrees.main!.merge).toBeUndefined();
  });

  it('reads linked worktrees', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, [...ROOT, 'git branch hotfix', 'git worktree add ../nova-hotfix hotfix'], { env, date: DATE });
    const state = await readRepoState(paths.repo, { env });
    expect(state.worktrees['nova-hotfix']).toMatchObject({ isMain: false, path: '~/GitQuest/nova-hotfix', head: { kind: 'branch', branch: 'hotfix' } });
    expect(state.worktrees['nova-hotfix']!.workingDir['app.ts']).toBe('v1');
  });
});

describe('snapshot / restore', () => {
  it('round-trips refs, index and files in place', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, [...ROOT, 'edit a.txt "staged"', 'git add a.txt', 'edit b.txt "dirty"'], { env, date: DATE });
    const before = await readRepoState(paths.repo, { env });
    const inode = (await fs.stat(paths.repo)).ino;
    const snapDir = path.join(paths.snapshots, '1');
    await snapshot(paths, snapDir);

    await runSetupCommands(paths.repo, ['git commit -m "later"', 'git switch -c other', 'edit extra.txt "x"', 'git add extra.txt'], { env });
    await fs.writeFile(path.join(paths.repo, '.git', 'junk'), 'x');
    await restore(paths, snapDir);

    expect((await fs.stat(paths.repo)).ino).toBe(inode);
    await expect(fs.stat(path.join(paths.repo, '.git', 'junk'))).rejects.toThrow();
    await expect(fs.stat(path.join(paths.repo, 'extra.txt'))).rejects.toThrow();
    const after = await readRepoState(paths.repo, { env });
    expect(after.branches).toEqual(before.branches);
    expect(after.worktrees).toEqual(before.worktrees);
    expect(await sh(paths.remote, env, 'rev-parse', '--is-bare-repository')).toBe('true');
  });

  it('removes worktree folders the restored repo no longer has', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, ROOT, { env, date: DATE });
    const snapDir = path.join(paths.snapshots, '3');
    await snapshot(paths, snapDir);
    const keep = path.join(paths.root, 'keep');
    await fs.mkdir(keep);
    await fs.writeFile(path.join(keep, '.git'), 'gitdir: /somewhere/else/.git/worktrees/keep\n');
    await runSetupCommands(paths.repo, ['git worktree add -b hotfix ../nova-hotfix'], { env });
    await restore(paths, snapDir);
    await expect(fs.stat(path.join(paths.root, 'nova-hotfix'))).rejects.toThrow();
    expect((await fs.stat(keep)).isDirectory()).toBe(true); // not a worktree of this repo: left alone
    await runSetupCommands(paths.repo, ['git worktree add -b hotfix ../nova-hotfix'], { env });
    expect(Object.keys((await readRepoState(paths.repo, { env })).worktrees)).toHaveLength(2);
  });

  it('refreshes the copied index, so reset --keep works right after a restore', async () => {
    const { paths, env } = await sandbox();
    await runSetupCommands(paths.repo, [...ROOT, 'edit b.txt "two"', 'git commit -am "two"'], { env, date: DATE });
    const snapDir = path.join(paths.snapshots, '2');
    await snapshot(paths, snapDir);
    await new Promise((resolve) => setTimeout(resolve, 1100)); // copies get new mtimes
    await restore(paths, snapDir);
    const result = await git(['reset', '--keep', 'HEAD~1'], { cwd: paths.repo, env });
    expect(result.stderr).toBe('');
    expect(result.code).toBe(0);
  });
});

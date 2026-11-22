/**
 * Reads a real repository into the simulator's RepoState shape.
 *
 * Derivations the game relies on:
 * - `message`   = full commit message (`%B`) trimmed, i.e. exactly the `-m` text for one-line commits.
 * - `timestamp` = creation order, 1 = oldest. Topological (parents first), ties broken by
 *                 committer date, then position in the HEAD reflog, then hash.
 * - `branch`    = the branch whose reflog recorded the commit's creation (commit, merge commit,
 *                 cherry-pick, revert), else the first branch (main first, then A→Z) whose
 *                 first-parent chain contains it, else undefined.
 * - contents    = CRLF → LF, one trailing "\n" removed (setup writes content + "\n").
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  Author,
  Commit,
  FileTree,
  Head,
  MergeConflict,
  MergeState,
  Remote,
  RepoState,
  Worktree,
} from '../shared/repo-types';
import { gitRaw } from './exec';

interface Ctx {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

interface CommitInfo {
  readonly parents: readonly string[];
  readonly message: string;
  readonly author: Author;
  readonly date: number;
  readonly snapshot: FileTree;
}

// ponytail: objects are immutable by hash, so both caches are global and never evicted;
// fine for a story repo of a few hundred objects, add an LRU if repos get big.
const blobCache = new Map<string, string>();
const commitCache = new Map<string, CommitInfo>();

function normalize(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

async function run(ctx: Ctx, args: readonly string[], input?: string): Promise<string> {
  const result = await gitRaw(args, { cwd: ctx.cwd, env: ctx.env, ...(input === undefined ? {} : { input }) });
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.toString('utf8');
}

/** Like run, but a non-zero exit yields null (missing ref, no reflog…). */
async function tryRun(ctx: Ctx, args: readonly string[]): Promise<string | null> {
  const result = await gitRaw(args, { cwd: ctx.cwd, env: ctx.env });
  return result.code === 0 ? result.stdout.toString('utf8') : null;
}

function lines(text: string | null): string[] {
  return (text ?? '').split('\n').filter((line) => line !== '');
}

async function loadBlobs(ctx: Ctx, ids: Iterable<string>): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !blobCache.has(id));
  if (missing.length === 0) return;
  const result = await gitRaw(['cat-file', '--batch'], { ...ctx, input: `${missing.join('\n')}\n` });
  const out = result.stdout;
  let pos = 0;
  while (pos < out.length) {
    const eol = out.indexOf(0x0a, pos);
    if (eol < 0) break;
    const [id, type, size] = out.toString('utf8', pos, eol).split(' ');
    pos = eol + 1;
    if (type === 'missing' || id === undefined || size === undefined) continue;
    const length = Number(size);
    blobCache.set(id, normalize(out.toString('utf8', pos, pos + length)));
    pos += length + 1;
  }
}

function blob(id: string): string {
  return blobCache.get(id) ?? '';
}

/** `ls-files -s` / `ls-tree -r` records → { path, id, stage }. */
function parseEntries(raw: string, tree: boolean): { path: string; id: string; stage: number }[] {
  const entries: { path: string; id: string; stage: number }[] = [];
  for (const record of raw.split('\0')) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const meta = record.slice(0, tab).split(' ');
    if (tree ? meta[1] !== 'blob' : meta[0] === '160000') continue; // submodules (gitlinks)
    entries.push({ path: record.slice(tab + 1), id: meta[tree ? 2 : 1] ?? '', stage: tree ? 0 : Number(meta[2]) });
  }
  return entries;
}

async function loadCommits(ctx: Ctx, hashes: readonly string[]): Promise<void> {
  const missing = hashes.filter((hash) => !commitCache.has(hash));
  if (missing.length === 0) return;
  const raw = await run(
    ctx,
    ['log', '--no-walk=unsorted', '--stdin', '-z', '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%ct%x1f%B'],
    `${missing.join('\n')}\n`,
  );
  const trees = await Promise.all(
    missing.map(async (hash) => [hash, parseEntries(await run(ctx, ['ls-tree', '-r', '-z', '--full-tree', hash]), true)] as const),
  );
  await loadBlobs(
    ctx,
    trees.flatMap(([, entries]) => entries.map((entry) => entry.id)),
  );
  const treeOf = new Map(trees);
  for (const record of raw.split('\0')) {
    const [hash, parents, name, email, date, message] = record.split('\x1f');
    if (hash === undefined || message === undefined) continue;
    const snapshot: Record<string, string> = {};
    for (const entry of treeOf.get(hash) ?? []) snapshot[entry.path] = blob(entry.id);
    commitCache.set(hash, {
      parents: lines((parents ?? '').replace(/ /g, '\n')),
      message: message.trim(),
      author: { name: name ?? '', email: email ?? '' },
      date: Number(date),
      snapshot,
    });
  }
}

/**
 * All reachable commits: every ref, every reflog, HEAD — except git's bookkeeping commits:
 * notes history and stash entries (the stash commit and its index/untracked parents). Facts report those.
 * ponytail: a branch created on a stash commit itself would hide that commit; add a reachability pass if it matters.
 */
async function listCommits(ctx: Ctx): Promise<string[]> {
  const [all, notes, stash] = await Promise.all([
    tryRun(ctx, ['rev-list', '--all', '--reflog']), // --all includes HEAD
    tryRun(ctx, ['rev-list', '--glob=refs/notes/*']),
    tryRun(ctx, ['log', '-g', '--format=%H %P', 'refs/stash', '--']),
  ]);
  const hidden = new Set(lines(notes));
  for (const line of lines(stash)) {
    const [entry, , ...extra] = line.split(' ');
    for (const hash of [entry, ...extra]) if (hash) hidden.add(hash);
  }
  return lines(all).filter((hash) => !hidden.has(hash));
}

/** Kahn's algorithm, picking the smallest key among ready commits. */
function creationOrder(hashes: readonly string[], headReflog: readonly string[]): string[] {
  const set = new Set(hashes);
  const reflogPos = new Map<string, number>();
  headReflog.forEach((hash, i) => {
    if (!reflogPos.has(hash)) reflogPos.set(hash, i);
  });
  const pending = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const hash of hashes) {
    const parents = (commitCache.get(hash)?.parents ?? []).filter((p) => set.has(p));
    pending.set(hash, parents.length);
    for (const parent of parents) children.set(parent, [...(children.get(parent) ?? []), hash]);
  }
  const key = (hash: string): [number, number, string] => [
    commitCache.get(hash)?.date ?? 0,
    reflogPos.get(hash) ?? Number.MAX_SAFE_INTEGER,
    hash,
  ];
  const less = (a: string, b: string): boolean => {
    const [ka, kb] = [key(a), key(b)];
    return ka[0] !== kb[0] ? ka[0] < kb[0] : ka[1] !== kb[1] ? ka[1] < kb[1] : ka[2] < kb[2];
  };
  const ready = hashes.filter((hash) => pending.get(hash) === 0);
  const order: string[] = [];
  // ponytail: O(n²) selection, fine below a few thousand commits; use a heap if that changes.
  while (ready.length > 0) {
    let best = 0;
    for (let i = 1; i < ready.length; i += 1) if (less(ready[i]!, ready[best]!)) best = i;
    const [next] = ready.splice(best, 1);
    order.push(next!);
    for (const child of children.get(next!) ?? []) {
      const left = (pending.get(child) ?? 1) - 1;
      pending.set(child, left);
      if (left === 0) ready.push(child);
    }
  }
  return order;
}

const CREATES_COMMIT = /^(commit|cherry-pick|revert)|^(merge|pull)\b.*: Merge made/;

async function branchLanes(ctx: Ctx, branches: Record<string, string>): Promise<Map<string, string>> {
  const names = Object.keys(branches).sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a < b ? -1 : 1));
  const [reflogs, chains] = await Promise.all([
    Promise.all(names.map((name) => tryRun(ctx, ['log', '-g', '--format=%H%x09%gs', `refs/heads/${name}`, '--']))),
    Promise.all(names.map((name) => tryRun(ctx, ['rev-list', '--first-parent', `refs/heads/${name}`, '--']))),
  ]);
  const lanes = new Map<string, string>();
  names.forEach((name, i) => {
    for (const line of lines(reflogs[i] ?? null)) {
      const [hash, subject] = line.split('\t');
      if (hash && subject !== undefined && CREATES_COMMIT.test(subject) && !lanes.has(hash)) lanes.set(hash, name);
    }
  });
  names.forEach((name, i) => {
    for (const hash of lines(chains[i] ?? null)) if (!lanes.has(hash)) lanes.set(hash, name);
  });
  return lanes;
}

async function readWorkingDir(dir: string, ctx: Ctx): Promise<FileTree> {
  const files = new Set(lines((await run(ctx, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).replace(/\0/g, '\n')));
  const tree: Record<string, string> = {};
  await Promise.all(
    [...files].map(async (file) => {
      try {
        tree[file] = normalize(await fs.readFile(path.join(dir, file), 'utf8'));
      } catch {
        // deleted on disk, or a directory (submodule)
      }
    }),
  );
  return sortKeys(tree);
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

async function readMerge(ctx: Ctx, stageEntries: { path: string; id: string; stage: number }[]): Promise<MergeState | undefined> {
  const mergeHeadFile = path.resolve(ctx.cwd, (await run(ctx, ['rev-parse', '--git-path', 'MERGE_HEAD'])).trim());
  const theirs = (await fs.readFile(mergeHeadFile, 'utf8').catch(() => '')).split('\n')[0]?.trim();
  if (!theirs) return undefined;
  const ours = (await run(ctx, ['rev-parse', 'HEAD'])).trim();
  const base = (await tryRun(ctx, ['merge-base', ours, theirs]))?.trim() ?? '';
  const msgFile = path.resolve(ctx.cwd, (await run(ctx, ['rev-parse', '--git-path', 'MERGE_MSG'])).trim());
  const message = (await fs.readFile(msgFile, 'utf8').catch(() => ''))
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
  const named = /^Merge (?:remote-tracking )?branch '([^']+)'( of )?/.exec(message);
  // ponytail: `git pull` merges are labelled origin/<branch> like the simulator; other remotes would need FETCH_HEAD parsing.
  const branch = named ? (named[2] ? `origin/${named[1]}` : named[1]!) : theirs;
  const conflicts = new Map<string, { base?: string; ours?: string; theirs?: string }>();
  for (const entry of stageEntries) {
    if (entry.stage === 0) continue;
    const side = (['base', 'ours', 'theirs'] as const)[entry.stage - 1]!;
    conflicts.set(entry.path, { ...conflicts.get(entry.path), [side]: blob(entry.id) });
  }
  return {
    branch,
    base,
    ours,
    theirs,
    ...(message === '' || message === `Merge branch '${branch}'` ? {} : { message }),
    conflicts: [...conflicts].map(([file, sides]): MergeConflict => ({ path: file, ...sides })),
  };
}

async function readWorktree(dir: string, env: NodeJS.ProcessEnv, id: string, isMain: boolean, head: Head, home: string): Promise<Worktree> {
  const ctx = { cwd: dir, env };
  const stageEntries = parseEntries(await run(ctx, ['ls-files', '-s', '-z']), false);
  await loadBlobs(ctx, stageEntries.map((entry) => entry.id));
  const index: Record<string, string> = {};
  // Effective index like the simulator: stage 0, or "ours" (stage 2) for conflicted paths.
  for (const entry of stageEntries) if (entry.stage === 0 || entry.stage === 2) index[entry.path] = blob(entry.id);
  const [workingDir, merge] = await Promise.all([readWorkingDir(dir, ctx), readMerge(ctx, stageEntries)]);
  const shown = dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir;
  return { id, path: shown, isMain, head, index: sortKeys(index), workingDir, ...(merge ? { merge } : {}) };
}

function slug(dir: string, taken: Record<string, unknown>): string {
  const base = path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'worktree';
  let id = base;
  for (let n = 2; taken[id] !== undefined; n += 1) id = `${base}-${n}`;
  return id;
}

async function readRemotes(ctx: Ctx, remoteDir: string | undefined): Promise<Pick<RepoState, 'remotes' | 'remoteTracking' | 'upstream'>> {
  const urls = lines(await tryRun(ctx, ['config', '--get-regexp', '^remote\\..*\\.url$']));
  if (urls.length === 0) return {};
  const refs = (raw: string | null, prefix: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of lines(raw)) {
      const [hash, ref] = line.split(' ');
      if (hash && ref?.startsWith(prefix) && !ref.endsWith('/HEAD')) out[ref.slice(prefix.length)] = hash;
    }
    return out;
  };
  const tracking = refs(await tryRun(ctx, ['for-each-ref', '--format=%(objectname) %(refname)', 'refs/remotes']), 'refs/remotes/');
  const serverBranches =
    remoteDir === undefined
      ? undefined
      : refs(await tryRun({ ...ctx, cwd: remoteDir }, ['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads']), 'refs/heads/');
  const remotes: Record<string, Remote> = {};
  for (const line of urls) {
    const match = /^remote\.(.+)\.url (.*)$/.exec(line);
    if (!match) continue;
    const name = match[1]!;
    const fromTracking = Object.fromEntries(
      Object.entries(tracking)
        .filter(([key]) => key.startsWith(`${name}/`))
        .map(([key, hash]) => [key.slice(name.length + 1), hash]),
    );
    remotes[name] = { name, url: match[2]!, branches: name === 'origin' && serverBranches ? serverBranches : fromTracking };
  }
  const upstream: Record<string, string> = {};
  for (const line of lines(await tryRun(ctx, ['for-each-ref', '--format=%(refname:short) %(upstream:short)', 'refs/heads']))) {
    const [branch, up] = line.split(' ');
    if (branch && up) upstream[branch] = up;
  }
  return { remotes, remoteTracking: tracking, upstream };
}

/**
 * Reads a real repository into the shared RepoState shape so mission validators
 * written for the simulator work unchanged. File contents are normalised
 * (CRLF → LF, one trailing newline removed). See docs/CONTRACTS.md for field sources.
 */
export async function readRepoState(
  repoDir: string,
  opts: { readonly env: NodeJS.ProcessEnv; readonly remoteDir?: string },
): Promise<RepoState> {
  const env = { ...opts.env, GIT_OPTIONAL_LOCKS: '0' }; // never fight the player's git for index.lock
  const ctx: Ctx = { cwd: repoDir, env };
  const home = (opts.env.HOME ?? os.homedir()).replace(/\/$/, '');

  const initialized = await fs.stat(path.join(repoDir, '.git')).then(
    () => true,
    () => false,
  );
  if (!initialized) {
    return { version: 1, initialized: false, commits: {}, branches: {}, worktrees: {}, activeWorktree: 'main', clock: 0, nextId: 0 };
  }

  const branches: Record<string, string> = {};
  for (const line of lines(await run(ctx, ['for-each-ref', '--format=%(objectname) %(refname:short)', 'refs/heads']))) {
    const [hash, name] = line.split(' ');
    if (hash && name) branches[name] = hash;
  }

  const local = await listCommits(ctx);
  await loadCommits(ctx, local);
  const remoteDir = opts.remoteDir !== undefined && (await fs.stat(opts.remoteDir).then(() => true, () => false)) ? opts.remoteDir : undefined;
  const remotePart = await readRemotes(ctx, remoteDir);
  // Commits pushed to origin by teammates but not fetched yet live only in the bare remote.
  const known = new Set(local);
  let extra: string[] = [];
  if (remoteDir !== undefined && remotePart.remotes?.origin) {
    const remoteCtx = { cwd: remoteDir, env };
    extra = lines(await tryRun(remoteCtx, ['rev-list', '--exclude=refs/notes/*', '--all'])).filter((hash) => !known.has(hash));
    await loadCommits(remoteCtx, extra);
  }

  const headReflog = lines(await tryRun(ctx, ['log', '-g', '--format=%H', 'HEAD', '--'])).reverse();
  const order = creationOrder([...local, ...extra], headReflog);
  const lanes = await branchLanes(ctx, branches);
  const commits: Record<string, Commit> = {};
  order.forEach((hash, i) => {
    const info = commitCache.get(hash)!;
    const branch = lanes.get(hash);
    commits[hash] = {
      hash,
      parents: info.parents,
      message: info.message,
      snapshot: info.snapshot,
      author: info.author,
      timestamp: i + 1,
      ...(branch === undefined ? {} : { branch }),
    };
  });

  const worktrees: Record<string, Worktree> = {};
  const blocks = (await run(ctx, ['worktree', 'list', '--porcelain'])).split('\n\n').filter((block) => block.trim() !== '');
  for (const [i, block] of blocks.entries()) {
    const field = (key: string): string | undefined =>
      block.split('\n').find((line) => line === key || line.startsWith(`${key} `))?.slice(key.length + 1);
    const dir = field('worktree');
    if (dir === undefined || field('bare') !== undefined) continue;
    if (i > 0 && field('prunable') !== undefined) continue; // directory deleted by hand
    const branchRef = field('branch');
    const head: Head = branchRef
      ? { kind: 'branch', branch: branchRef.replace(/^refs\/heads\//, '') }
      : { kind: 'detached', commit: field('HEAD') ?? '' };
    const id = i === 0 ? 'main' : slug(dir, worktrees);
    // The main worktree is read from repoDir itself (porcelain prints the realpath).
    worktrees[id] = await readWorktree(i === 0 ? repoDir : dir, env, id, i === 0, head, home);
  }

  return {
    version: 1,
    initialized: true,
    commits,
    branches,
    worktrees,
    activeWorktree: 'main',
    clock: order.length,
    nextId: order.length,
    ...remotePart,
  };
}

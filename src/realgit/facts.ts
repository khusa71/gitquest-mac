/**
 * Reads what git knows beyond RepoState (stashes, tags, reflog, config, hooks…) into RepoFacts.
 * Every git call is independent, so they all run in parallel.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ConfigEntry, RepoFacts } from '../game/model';
import { gitRaw } from './exec';

export const EMPTY_FACTS: RepoFacts = {
  stashes: [],
  tags: [],
  reflog: [],
  config: {},
  configEntries: [],
  inProgress: null,
  hooks: [],
  ignored: [],
  submodules: [],
  notes: [],
  server: null,
};

/** stdout, or '' when git fails (no repo, no reflog, no .gitmodules…). */
async function out(cwd: string, env: NodeJS.ProcessEnv, args: readonly string[]): Promise<string> {
  const result = await gitRaw(args, { cwd, env }).catch(() => null);
  return result?.code === 0 ? result.stdout.toString('utf8') : '';
}

const lines = (text: string) => text.split('\n').filter((line) => line !== '');
const exists = (file: string) =>
  fs.stat(file).then(
    () => true,
    () => false,
  );

async function readHooks(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const hooks: string[] = [];
  for (const name of names.sort()) {
    if (name.endsWith('.sample')) continue;
    const stat = await fs.stat(path.join(dir, name)).catch(() => null);
    if (stat?.isFile() && (stat.mode & 0o111) !== 0) hooks.push(name);
  }
  return hooks;
}

async function readInProgress(gitDir: string): Promise<RepoFacts['inProgress']> {
  if (gitDir === '') return null;
  const has = (name: string) => exists(path.join(gitDir, name));
  if ((await has('rebase-merge')) || (await has('rebase-apply'))) return 'rebase';
  if (await has('MERGE_HEAD')) return 'merge';
  if (await has('CHERRY_PICK_HEAD')) return 'cherry-pick';
  if (await has('REVERT_HEAD')) return 'revert';
  if (await has('BISECT_LOG')) return 'bisect';
  return null;
}

/** `git config --list --show-scope -z`: "scope\0key\nvalue\0"; a key without value means true. Command-line scope is skipped. */
export function parseConfig(text: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  const fields = text.split('\0');
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const scope = fields[i]!;
    if (scope !== 'global' && scope !== 'local' && scope !== 'worktree' && scope !== 'system') continue;
    const entry = fields[i + 1]!;
    const nl = entry.indexOf('\n');
    const key = (nl < 0 ? entry : entry.slice(0, nl)).toLowerCase();
    entries.push({ key, value: nl < 0 ? 'true' : entry.slice(nl + 1), scope });
  }
  return entries;
}

export async function readFacts(
  repoDir: string,
  opts: { readonly env: NodeJS.ProcessEnv; readonly remoteDir?: string },
): Promise<RepoFacts> {
  const env = { ...opts.env, GIT_OPTIONAL_LOCKS: '0' };
  const git = (args: readonly string[], cwd = repoDir) => out(cwd, env, args);
  const remoteDir = opts.remoteDir !== undefined && (await exists(opts.remoteDir)) ? opts.remoteDir : undefined;

  const [stashes, tags, reflog, config, gitDir, hooksDir, ignored, submodules, notes, serverRefs] = await Promise.all([
    git(['stash', 'list', '--format=%gd%x00%gs']),
    git(['for-each-ref', '--format=%(refname:short)%00%(objecttype)%00%(objectname)%00%(*objectname)%00%(contents)%01', 'refs/tags']),
    git(['reflog', 'show', '--format=%H%x00%gs', '-n', '100', 'HEAD', '--']),
    git(['config', '--list', '--show-scope', '-z']),
    git(['rev-parse', '--absolute-git-dir']),
    git(['rev-parse', '--git-path', 'hooks']), // honours core.hooksPath; relative to repoDir
    git(['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']),
    git(['config', '-f', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']),
    git(['notes', 'list']),
    remoteDir === undefined ? null : git(['for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads', 'refs/tags'], remoteDir),
  ]);

  const [inProgress, hooks] = await Promise.all([
    readInProgress(gitDir.trim()),
    gitDir.trim() === '' ? [] : readHooks(path.resolve(repoDir, hooksDir.trim())),
  ]);

  const configEntries = parseConfig(config);
  let server: RepoFacts['server'] = null;
  if (serverRefs !== null) {
    const branches: Record<string, string> = {};
    const serverTags: string[] = [];
    for (const line of lines(serverRefs)) {
      const [hash, ref] = line.split(' ');
      if (ref?.startsWith('refs/heads/')) branches[ref.slice('refs/heads/'.length)] = hash!;
      else if (ref?.startsWith('refs/tags/')) serverTags.push(ref.slice('refs/tags/'.length));
    }
    server = { branches, tags: serverTags };
  }

  return {
    stashes: lines(stashes).map((line) => {
      const [ref, message] = line.split('\0');
      return { ref: ref!, message: message ?? '' };
    }),
    tags: tags
      .split('\x01')
      .map((record) => record.replace(/^\n/, ''))
      .filter((record) => record !== '')
      .map((record) => {
        const [name, type, object, peeled, message] = record.split('\0');
        const annotated = type === 'tag';
        return {
          name: name!,
          target: annotated && peeled ? peeled : object!,
          annotated,
          message: annotated ? (message ?? '').trim() : null,
        };
      }),
    reflog: lines(reflog).map((line) => {
      const [hash, action] = line.split('\0');
      return { hash: hash!, action: action ?? '' };
    }),
    // Later scopes win, like git. System config stays out (the sandbox sets GIT_CONFIG_NOSYSTEM anyway).
    config: Object.fromEntries(configEntries.filter((e) => e.scope !== 'system').map((e) => [e.key, e.value])),
    configEntries,
    inProgress,
    hooks,
    ignored: ignored.split('\0').filter((entry) => entry !== ''),
    submodules: lines(submodules).map((line) => line.slice(line.indexOf(' ') + 1)),
    notes: lines(notes).map((line) => line.split(' ')[1] ?? ''),
    server,
  };
}

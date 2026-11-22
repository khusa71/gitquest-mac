/**
 * The GitHub CLI (`gh`) for Level 11. Only three calls write to GitHub, each behind an explicit button in
 * the app: createSandbox, deleteSandbox (both on `<login>/gitquest-sandbox` only, never another repo).
 * Everything else is a read. The binary path is injectable so tests run a fake `gh`.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { SANDBOX_NAME, type GitHubFacts, type GitHubPullRequest, type GitHubRun } from '../game/model';
import type { GitHubStatus } from '../shared/api';

export interface GhOptions {
  /** Path to `gh`; found in Homebrew's folders and PATH when absent. */
  readonly gh?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Per call, default 15 s. */
  readonly timeoutMs?: number;
}

/** Marks the repo as GitQuest's own: status, create and delete refuse a same-named repo without it. */
export const SANDBOX_DESCRIPTION = 'GitQuest practice repo. Safe to delete.';

export const DELETE_SCOPE_HELP =
  'Deleting a repo needs the delete_repo permission, which gh does not have yet. In Terminal run: gh auth refresh -h github.com -s delete_repo, then press Delete sandbox again.';

const NOT_INSTALLED = 'GitHub CLI (gh) is not installed.';
const NOT_SIGNED_IN = /auth login|not logged|Bad credentials|HTTP 401|authentication required/i;
const OFFLINE = /error connecting|could not resolve|no such host|network is unreachable|dial tcp|connection refused|i\/o timeout|TLS handshake/i;

/** Electron apps started from Finder get a bare PATH, so Homebrew's folders are tried first. */
export function findGh(env: NodeJS.ProcessEnv = process.env): string | null {
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', ...(env.PATH ?? '').split(':').filter(Boolean)];
  return dirs.map((dir) => path.join(dir, 'gh')).find((file) => existsSync(file)) ?? null;
}

interface Ran {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
  readonly timedOut: boolean;
  /** gh could not be started at all (not installed, not executable). */
  readonly missing: boolean;
}

function run(o: GhOptions, args: readonly string[]): Promise<Ran> {
  const bin = o.gh ?? findGh(o.env);
  if (bin === null) return Promise.resolve({ stdout: '', stderr: NOT_INSTALLED, code: 127, timedOut: false, missing: true });
  const env = { ...(o.env ?? process.env), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' };
  return new Promise((resolve) => {
    execFile(bin, [...args], { env, timeout: o.timeoutMs ?? 15_000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
      const spawnFailed = error !== null && typeof error.code === 'string'; // ENOENT, EACCES
      resolve({
        stdout: String(stdout),
        stderr: spawnFailed ? `${NOT_INSTALLED} (${error.message})` : String(stderr),
        code,
        timedOut: error?.killed === true,
        missing: spawnFailed,
      });
    });
  });
}

/** A readable sentence for a failed gh call. */
function problem(r: Ran, o: GhOptions, what: string): string {
  if (r.timedOut) {
    return `GitHub did not answer within ${Math.round((o.timeoutMs ?? 15_000) / 1000)} seconds. Check your internet connection, then press Refresh from GitHub.`;
  }
  if (OFFLINE.test(r.stderr)) return 'GitHub could not be reached. Check your internet connection, then press Refresh from GitHub.';
  if (NOT_SIGNED_IN.test(r.stderr)) return 'gh is not signed in to GitHub. In Terminal run: gh auth login';
  const first = r.stderr.trim().split('\n')[0] ?? '';
  return `${what} failed: ${first === '' ? `gh exited with code ${r.code}` : first}`;
}

function json<T>(text: string, what: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${what}: GitHub sent an answer GitQuest could not read.`);
  }
}

const EMPTY_STATUS: GitHubStatus = {
  installed: false,
  loggedIn: false,
  login: null,
  repo: null,
  sandbox: 'unknown',
  url: null,
  missingScopes: [],
  message: null,
};

/** Is gh installed and signed in, as whom, with which scopes, and does the sandbox exist? Read-only. */
export async function status(o: GhOptions = {}): Promise<GitHubStatus> {
  if ((o.gh ?? findGh(o.env)) === null) return EMPTY_STATUS;
  // `--include` prints the HTTP headers first: X-Oauth-Scopes lists the token's scopes (absent for fine-grained tokens).
  const user = await run(o, ['api', 'user', '--include']);
  if (user.missing) return EMPTY_STATUS;
  if (user.code !== 0) {
    const signedOut = user.code === 4 || NOT_SIGNED_IN.test(user.stderr);
    return { ...EMPTY_STATUS, installed: true, message: signedOut ? null : problem(user, o, 'Reading your GitHub account') };
  }
  const split = /\r?\n\r?\n/.exec(user.stdout);
  const headers = split === null ? '' : user.stdout.slice(0, split.index);
  const body = split === null ? user.stdout : user.stdout.slice(split.index + split[0].length);
  const login = json<{ login?: unknown }>(body, 'Reading your GitHub account').login;
  if (typeof login !== 'string' || !/^[A-Za-z0-9-]+$/.test(login)) {
    return { ...EMPTY_STATUS, installed: true, message: 'gh did not report a GitHub login.' };
  }
  const scopeLine = /^x-oauth-scopes:(.*)$/im.exec(headers);
  const scopes = scopeLine?.[1]?.split(',').map((s) => s.trim()) ?? null;
  const missingScopes = scopes === null ? [] : ['workflow', 'delete_repo'].filter((s) => !scopes.includes(s));
  const repo = `${login}/${SANDBOX_NAME}`;
  const base: GitHubStatus = { ...EMPTY_STATUS, installed: true, loggedIn: true, login, repo, missingScopes };

  const view = await run(o, ['repo', 'view', repo, '--json', 'url,visibility,description']);
  if (view.code !== 0) {
    if (/Could not resolve to a Repository|HTTP 404/i.test(view.stderr)) return { ...base, sandbox: 'missing' };
    return { ...base, message: problem(view, o, 'Looking for the sandbox repo') };
  }
  const info = json<{ url?: string; visibility?: string; description?: string }>(view.stdout, 'Looking for the sandbox repo');
  const url = info.url ?? `https://github.com/${repo}`;
  if (info.description !== SANDBOX_DESCRIPTION) {
    return { ...base, url, message: `${repo} already exists but GitQuest did not create it, so it will not use or delete it. Rename that repo on GitHub to play this level.` };
  }
  if (info.visibility !== 'PRIVATE') {
    return { ...base, url, message: `${repo} is not private. Make it private in its GitHub settings (Danger Zone) to play this level.` };
  }
  return { ...base, sandbox: 'exists', url };
}

/** Creates the private sandbox repo (the consent button). Idempotent. */
export async function createSandbox(o: GhOptions = {}): Promise<GitHubStatus> {
  const before = await status(o);
  if (!before.installed) throw new Error(`${NOT_INSTALLED} In Terminal run: brew install gh`);
  if (!before.loggedIn) throw new Error(before.message ?? 'gh is not signed in to GitHub. In Terminal run: gh auth login');
  if (before.sandbox === 'exists') return before;
  if (before.sandbox !== 'missing') throw new Error(before.message ?? 'GitQuest could not tell whether the sandbox exists.');
  const made = await run(o, ['repo', 'create', SANDBOX_NAME, '--private', '--add-readme', '--description', SANDBOX_DESCRIPTION]);
  if (made.code !== 0) throw new Error(problem(made, o, 'Creating the sandbox repo'));
  return status(o);
}

/** Deletes `<login>/gitquest-sandbox` (and nothing else): only a repo GitQuest created. */
export async function deleteSandbox(o: GhOptions = {}): Promise<GitHubStatus> {
  const before = await status(o);
  if (before.sandbox === 'missing') return before;
  if (before.sandbox !== 'exists' || before.repo === null) throw new Error(before.message ?? 'GitQuest could not find the sandbox repo.');
  if (before.missingScopes.includes('delete_repo')) throw new Error(DELETE_SCOPE_HELP);
  const gone = await run(o, ['repo', 'delete', before.repo, '--yes']);
  if (gone.code !== 0) {
    if (/delete_repo|HTTP 403/i.test(gone.stderr)) throw new Error(DELETE_SCOPE_HELP);
    throw new Error(problem(gone, o, 'Deleting the sandbox repo'));
  }
  return status(o);
}

// Facts -------------------------------------------------------------------------

interface RawPr {
  number: number;
  title: string;
  state: GitHubPullRequest['state'];
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  body?: string;
  mergeCommit?: { oid?: string } | null;
  closingIssuesReferences?: { number: number }[];
  reviews?: { state: string; body?: string }[];
  statusCheckRollup?: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[];
}

interface RawRun {
  databaseId: number;
  workflowName?: string;
  name?: string;
  headBranch: string;
  headSha: string;
  status: string;
  conclusion?: string;
}

const PR_FIELDS = 'number,title,state,headRefName,headRefOid,baseRefName,body,mergeCommit,closingIssuesReferences,reviews,statusCheckRollup';

function toPr(pr: RawPr): GitHubPullRequest {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    head: pr.headRefName,
    headOid: pr.headRefOid,
    base: pr.baseRefName,
    body: pr.body ?? '',
    mergeCommit: pr.mergeCommit?.oid ?? null,
    closingIssues: (pr.closingIssuesReferences ?? []).map((issue) => issue.number),
    reviews: (pr.reviews ?? []).map((review) => ({ state: review.state, body: review.body ?? '' })),
    // CheckRun has name/status/conclusion; a commit StatusContext has context/state.
    checks: (pr.statusCheckRollup ?? []).map((c) => ({
      name: c.name ?? c.context ?? '',
      status: c.status ?? 'COMPLETED',
      conclusion: (c.conclusion ?? c.state ?? '') || null,
    })),
  };
}

function toRun(r: RawRun): GitHubRun {
  return {
    id: r.databaseId,
    name: r.workflowName ?? r.name ?? '',
    branch: r.headBranch,
    sha: r.headSha,
    status: r.status,
    conclusion: r.conclusion || null,
  };
}

/** Best effort: classic protection, then rulesets that apply to main. Free private repos answer 403. */
async function protection(o: GhOptions, repo: string): Promise<GitHubFacts['protection']> {
  const classic = await run(o, ['api', `repos/${repo}/branches/main/protection`]);
  if (classic.code === 0) return 'protected';
  if (!/HTTP 404/.test(classic.stderr)) return 'unavailable';
  const rules = await run(o, ['api', `repos/${repo}/rules/branches/main`]);
  if (rules.code !== 0) return /HTTP 404/.test(rules.stderr) ? 'none' : 'unavailable';
  const list = json<unknown[]>(rules.stdout, 'Reading rulesets');
  return Array.isArray(list) && list.length > 0 ? 'protected' : 'none';
}

/** Reads the sandbox's PRs, runs, issues, releases, branches, secret names and protection. Read-only. */
export async function fetchFacts(o: GhOptions, repo: string): Promise<GitHubFacts> {
  const read = async <T>(args: string[], what: string): Promise<T> => {
    const r = await run(o, args);
    if (r.code !== 0) throw new Error(problem(r, o, what));
    return json<T>(r.stdout, what);
  };
  const optional = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [prs, runs, issues, releases, branches, secrets, prot] = await Promise.all([
    read<RawPr[]>(['pr', 'list', '-R', repo, '--state', 'all', '--limit', '30', '--json', PR_FIELDS], 'Reading pull requests'),
    read<RawRun[]>(
      ['run', 'list', '-R', repo, '--limit', '30', '--json', 'databaseId,name,workflowName,headBranch,headSha,status,conclusion'],
      'Reading workflow runs',
    ),
    read<{ number: number; title: string; state: 'OPEN' | 'CLOSED' }[]>(
      ['issue', 'list', '-R', repo, '--state', 'all', '--limit', '30', '--json', 'number,title,state'],
      'Reading issues',
    ),
    read<{ tagName: string; name: string; isDraft: boolean }[]>(
      ['release', 'list', '-R', repo, '--limit', '20', '--json', 'tagName,name,isDraft'],
      'Reading releases',
    ),
    optional(read<{ name: string }[]>(['api', `repos/${repo}/branches?per_page=100`], 'Reading branches'), []),
    optional(read<{ name: string }[]>(['secret', 'list', '-R', repo, '--json', 'name'], 'Reading secrets'), []),
    optional(protection(o, repo), 'unavailable' as const),
  ]);
  return {
    repo,
    pullRequests: prs.map(toPr),
    runs: runs.map(toRun),
    issues: issues.map((i) => ({ number: i.number, title: i.title, state: i.state })),
    releases: releases.map((r) => ({ tag: r.tagName, name: r.name, draft: r.isDraft })),
    branches: branches.map((b) => b.name),
    secrets: secrets.map((s) => s.name),
    protection: prot,
  };
}

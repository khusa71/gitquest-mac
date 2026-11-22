/**
 * Test helper: a fake `gh` (a node script) that answers from routes in routes.json next to it and logs every
 * call to calls.log. It never talks to GitHub. A route is keyed by the first two arguments ("pr list",
 * "api user", "api repos/<owner>/<repo>/branches?per_page=100"); `set` replaces routes once it is hit.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Route {
  readonly stdout?: string;
  /** Printed as JSON (gh --json output). */
  readonly json?: unknown;
  readonly stderr?: string;
  readonly code?: number;
  /** Milliseconds before answering (timeouts). */
  readonly delay?: number;
  readonly set?: Readonly<Record<string, Route>>;
}

const SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'routes.json');
const routes = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, 'calls.log'), JSON.stringify(args) + '\\n');
const r = routes[args.slice(0, 2).join(' ')] || { stderr: 'fake gh: no route for ' + args.join(' '), code: 1 };
if (r.set) fs.writeFileSync(file, JSON.stringify(Object.assign(routes, r.set)));
setTimeout(() => {
  process.stdout.write(r.json !== undefined ? JSON.stringify(r.json) : r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exitCode = r.code || 0;
}, r.delay || 0);
`;

export interface FakeGh {
  /** Path to the executable. */
  readonly bin: string;
  /** Adds or replaces routes. */
  route(routes: Readonly<Record<string, Route>>): Promise<void>;
  /** argv of every call so far, oldest first. */
  calls(): Promise<string[][]>;
}

export async function fakeGh(dir: string, routes: Readonly<Record<string, Route>> = {}): Promise<FakeGh> {
  await fs.mkdir(dir, { recursive: true });
  const bin = path.join(dir, 'gh');
  const file = path.join(dir, 'routes.json');
  await fs.writeFile(bin, SCRIPT, { mode: 0o755 });
  await fs.writeFile(file, JSON.stringify(routes));
  return {
    bin,
    route: async (more) => fs.writeFile(file, JSON.stringify({ ...JSON.parse(await fs.readFile(file, 'utf8')), ...more })),
    calls: async () =>
      (await fs.readFile(path.join(dir, 'calls.log'), 'utf8').catch(() => ''))
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
  };
}

/** Signed in as `login` with these OAuth scopes: what `gh api user --include` prints. */
export const userRoute = (login: string, scopes = 'gist, read:org, repo, workflow'): Route => ({
  stdout: `HTTP/2.0 200 OK\r\nContent-Type: application/json; charset=utf-8\r\nX-Oauth-Scopes: ${scopes}\r\n\r\n${JSON.stringify({ login, id: 1 })}`,
});

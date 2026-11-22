/**
 * Tutor backends that reuse coding agents the player already has signed in: Claude Code (`claude -p`)
 * and Codex (`codex exec`). No API key needed. Each call runs with every tool disabled, in an empty
 * temp folder, without the player's plugins, MCP servers, skills or settings, so a question costs about
 * a thousand tokens instead of loading their whole agent setup.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type CliBackend = 'claude-code' | 'codex';

const TIMEOUT_MS = 60_000;

/** GUI apps launched from Finder don't get the shell PATH, so look in the usual install places too. */
export function findBinary(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const home = os.homedir();
  const dirs = [
    ...(env.PATH ?? '').split(':'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.bun', 'bin'),
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function availableBackends(): Record<CliBackend, string | null> {
  return { 'claude-code': findBinary('claude'), codex: findBinary('codex') };
}

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

function run(bin: string, args: readonly string[], input: string, cwd: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // PATH includes the binary's folder so node-based CLIs find `node`.
    const env = { ...process.env, PATH: `${path.dirname(bin)}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}` };
    const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('The tutor took too long to answer. Try again.'));
    }, TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.stdin.end(input);
  });
}

export interface CliAsk {
  readonly system: string;
  readonly prompt: string;
  readonly schema: object;
}

/** Returns the raw JSON text of the structured reply. Throws a readable Error. */
export async function askCli(backend: CliBackend, bin: string, ask: CliAsk): Promise<string> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'gitquest-tutor-'));
  try {
    if (backend === 'claude-code') {
      const res = await run(
        bin,
        [
          '-p',
          '--output-format', 'json',
          '--json-schema', JSON.stringify(ask.schema),
          '--system-prompt', ask.system,
          '--effort', 'low',
          '--tools', '',
          '--setting-sources', '',
          '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
          '--disable-slash-commands',
          '--no-session-persistence',
        ],
        ask.prompt,
        cwd,
      );
      let out: { is_error?: boolean; result?: unknown; structured_output?: unknown };
      try {
        out = JSON.parse(res.stdout) as typeof out;
      } catch {
        throw new Error(cliTrouble('Claude Code', res));
      }
      if (out.is_error || out.structured_output === undefined) throw new Error(cliTrouble('Claude Code', res, String(out.result ?? '')));
      return JSON.stringify(out.structured_output);
    }

    const schemaFile = path.join(cwd, 'schema.json');
    const outFile = path.join(cwd, 'reply.json');
    await writeFile(schemaFile, JSON.stringify(ask.schema));
    const res = await run(
      bin,
      [
        'exec',
        '--skip-git-repo-check',
        '--ephemeral',
        '--sandbox', 'read-only',
        '-c', 'model_reasoning_effort="low"',
        '--output-schema', schemaFile,
        '-o', outFile,
        '-',
      ],
      `${ask.system}\n\n${ask.prompt}`,
      cwd,
    );
    if (res.code !== 0 || !existsSync(outFile)) throw new Error(cliTrouble('Codex', res));
    return (await readFile(outFile, 'utf8')).trim();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

function cliTrouble(name: string, res: RunResult, detail = ''): string {
  const text = `${detail}\n${res.stderr}\n${res.stdout}`.toLowerCase();
  if (/log ?in|logged in|auth|unauthori[sz]ed|credential|api key/.test(text)) {
    return `${name} isn't signed in. Open Terminal, run ${name === 'Codex' ? 'codex login' : 'claude'} once and sign in, then ask again.`;
  }
  if (/rate|limit|quota|usage/.test(text)) return `${name} has hit its usage limit for now. Try again later or switch the tutor in Voice settings.`;
  return `${name} couldn't answer that one. Try again, or switch the tutor in Voice settings.`;
}

/** Cheap check that the CLI starts (no model call). */
export function cliWorks(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 10_000 }, (error) => resolve(error === null));
  });
}

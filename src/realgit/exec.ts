import { spawn } from 'node:child_process';

export interface RawResult {
  readonly stdout: Buffer;
  readonly stderr: string;
  readonly code: number;
}

/** Spawns git with argv (no shell). Rejects only when git cannot be spawned. */
export function gitRaw(
  args: readonly string[],
  opts: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly input?: string },
): Promise<RawResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...args], {
      cwd: opts.cwd,
      // English git output for parsing, whatever the player's locale.
      env: { ...(opts.env ?? process.env), LC_ALL: 'en_US.UTF-8' },
      stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err).toString('utf8'),
        code: code ?? 1,
      }),
    );
    if (opts.input !== undefined && child.stdin) {
      child.stdin.on('error', () => {}); // git may exit before reading everything (EPIPE)
      child.stdin.end(opts.input);
    }
  });
}

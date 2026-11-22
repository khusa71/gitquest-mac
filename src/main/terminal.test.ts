// Smoke test of the real shell hooks: zsh (and bash) in a real pty, hermetic HOME, no Electron.
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node-pty';
import { describe, expect, it, vi } from 'vitest';
import { defaultPaths } from '../realgit';
import { OscParser, type GqEvent } from './osc';
import { shellLaunch } from './terminal';

vi.mock('../realgit', async (orig) => ({
  ...(await orig<typeof import('../realgit')>()),
  sandboxEnv: (paths: { gitconfig: string }, { GIT_DIR: _drop, ...base }: NodeJS.ProcessEnv = {}) => ({
    ...base,
    GIT_CONFIG_GLOBAL: paths.gitconfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }),
}));

async function session(shellPath: string, home: string, lines: string[]) {
  const paths = defaultPaths(home);
  const { shell, args, env } = shellLaunch(paths, { ...process.env, HOME: home, SHELL: shellPath, GIT_DIR: '/should/be/unset' });
  const p = spawn(shell, args, { cols: 120, rows: 30, cwd: home, env });
  const parser = new OscParser();
  const events: GqEvent[] = [];
  let output = '';
  let raw = '';
  let dones = 0;
  let wake = () => {};
  p.onData((d) => {
    raw += d;
    const r = parser.feed(d);
    output += r.output;
    for (const e of r.events) {
      events.push(e);
      if (e.kind === 'done') dones++;
    }
    wake();
  });
  const until = (n: number) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for done #${n}; output:\n${output}`)), 10000);
      wake = () => dones >= n && (clearTimeout(t), resolve());
      wake();
    });
  await until(1);
  for (const [i, line] of lines.entries()) {
    p.write(line + '\r');
    await until(i + 2);
  }
  p.kill();
  return { events, output, raw };
}

describe('shell hooks (real pty)', () => {
  it('zsh: sources the player rc files, reports commands and exit codes, keeps the sandbox env', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'gq-home-'));
    writeFileSync(path.join(home, '.zshenv'), 'export FROM_ZSHENV=1\n');
    writeFileSync(path.join(home, '.zprofile'), 'export FROM_ZPROFILE=1\n');
    // a user precmd that clobbers $?, and an rc that tries to point git elsewhere
    writeFileSync(path.join(home, '.zshrc'), 'export FROM_ZSHRC=$ZDOTDIR\nexport GIT_CONFIG_GLOBAL=/wrong\nprecmd() { false; }\nPS1="$ "\n');
    const { events, output, raw } = await session('/bin/zsh', home, [
      'echo "rc=$FROM_ZSHRC env=$FROM_ZSHENV prof=$FROM_ZPROFILE g=$GIT_CONFIG_GLOBAL d=${GIT_DIR-unset}"',
      '(exit 3)',
      'echo "héllo | ünïcode"',
      'echo "h=$HISTFILE"',
    ]);
    expect(raw).toContain('\x1b]777;gq;done;0\x07');
    expect(output).not.toContain('777;gq');
    expect(output).toContain(`rc=${home} env=1 prof=1 g=${path.join(home, '.gitquest', 'gitconfig')} d=unset`);
    expect(events).toEqual([
      { kind: 'done', exitCode: 0 },
      { kind: 'cmd', command: 'echo "rc=$FROM_ZSHRC env=$FROM_ZSHENV prof=$FROM_ZPROFILE g=$GIT_CONFIG_GLOBAL d=${GIT_DIR-unset}"' },
      { kind: 'done', exitCode: 0 },
      { kind: 'cmd', command: '(exit 3)' },
      { kind: 'done', exitCode: 3 },
      { kind: 'cmd', command: 'echo "héllo | ünïcode"' },
      { kind: 'done', exitCode: 0 },
      { kind: 'cmd', command: 'echo "h=$HISTFILE"' },
      { kind: 'done', exitCode: 0 },
    ]);
    expect(output).toContain(`h=${home}/.zsh_history`);
  });

  it('bash: best-effort hooks report commands and exit codes', async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), 'gq-home-'));
    writeFileSync(path.join(home, '.bash_profile'), 'export FROM_PROFILE=1\nPS1="$ "\n');
    const { events, output } = await session('/bin/bash', home, ['echo "p=$FROM_PROFILE"', 'false', 'true']);
    expect(output).toContain('p=1');
    expect(events).toEqual([
      { kind: 'done', exitCode: 0 },
      { kind: 'cmd', command: 'echo "p=$FROM_PROFILE"' },
      { kind: 'done', exitCode: 0 },
      { kind: 'cmd', command: 'false' },
      { kind: 'done', exitCode: 1 },
      { kind: 'cmd', command: 'true' },
      { kind: 'done', exitCode: 0 },
    ]);
  });
});

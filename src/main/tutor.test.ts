import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import type { MissionView, WorkspaceView } from '../shared/view-model';
import { createTutor, friendlyError, MESSAGES, renderContext, TUTOR_MODEL } from './tutor';

function mission(id: string, over: Partial<MissionView> = {}): MissionView {
  return {
    undoAllowed: true,
    danger: null,
    level: { id: 'foundations', number: 1, title: 'Foundations' },
    capstone: false,
    outcome: null,
    panels: ['history', 'areas'],
    id,
    number: id,
    title: 'Stage only what matters',
    goal: 'Commit app.ts without notes.txt.',
    story: '',
    checks: [
      { label: 'app.ts is staged', done: true, proof: 'git diff --staged --name-only' },
      { label: 'HEAD has app.ts v2', done: false, proof: 'git show HEAD:app.ts' },
    ],
    hints: ['Look at the index.'],
    hintsTotal: 3,
    blockedReason: 'notes.txt is staged too',
    commandsUsed: 2,
    par: 3,
    completed: null,
    theory: { title: '', body: '', lesson: '' },
    ...over,
  };
}

function view(over: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    repoPath: '/Users/p/GitQuest/nova',
    repoLabel: '~/GitQuest/nova',
    gitVersion: '2.50.1',
    panelData: { config: [], remote: [], stashes: [], reflog: [], worktrees: [], workflow: null },
    mission: mission('1.2'),
    commits: Array.from({ length: 10 }, (_, i) => ({
      hash: `${i}`.repeat(40),
      short: `${i}`.repeat(7),
      message: `commit ${i}`,
      author: 'Lea Moreau',
      parents: [],
      lane: 'main',
      refs: i === 0 ? ['HEAD → main', 'origin/main'] : [],
      isHead: i === 0,
      reachable: true,
      snapshot: [],
    })),
    nextCommit: null,
    branches: [{ name: 'main', hash: '0'.repeat(40), current: true }],
    headBranch: 'main',
    areas: [
      { path: 'app.ts', disk: 'v2', index: 'v2', head: 'v1' },
      { path: 'notes.txt', disk: 'todo', index: null, head: null },
    ],
    levels: [],
    lastCommand: 'git add app.ts',
    ...over,
  };
}

const reply = (text: string, command: string | null = null) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ text, command }) }],
});

function setup(create = vi.fn(async () => reply('Look at the index.'))) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gq-tutor-'));
  const keyFile = path.join(dir, 'sub', 'tutor-key.bin');
  const retrieve = vi.fn(async () => ({ id: TUTOR_MODEL }));
  const fake = { models: { retrieve }, beta: { messages: { create } } } as unknown as Anthropic;
  const makeClient = vi.fn((_key: string) => fake);
  const tutor = createTutor({
    keyFile,
    encrypt: (s) => Buffer.from(`enc:${s}`),
    decrypt: (b) => {
      const s = b.toString();
      if (!s.startsWith('enc:')) throw new Error('bad');
      return s.slice(4);
    },
    canEncrypt: () => true,
    client: makeClient,
    // Never reach the real Claude Code / Codex installed on the dev machine.
    cliAvailable: () => ({ 'claude-code': null, codex: null }),
    prefsFile: path.join(dir, 'tutor.json'),
  });
  return { tutor, keyFile, create, retrieve, makeClient, dir };
}

const headers = new Headers();
const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', headers);

describe('renderContext', () => {
  it('renders mission, checks, hints, areas, branch and the last 8 commits', () => {
    const text = renderContext(view());
    expect(text).toContain('Mission 1.2: Stage only what matters');
    expect(text).toContain('Goal: Commit app.ts without notes.txt.');
    expect(text).toContain('- [done] app.ts is staged');
    expect(text).toContain('- [not yet] HEAD has app.ts v2 (proof: git show HEAD:app.ts)');
    expect(text).toContain('Not done yet because: notes.txt is staged too');
    expect(text).toContain('Hints revealed: 1 of 3\n- Look at the index.');
    expect(text).toContain('Last command: git add app.ts');
    expect(text).toContain('Current branch: main');
    expect(text).toContain('- app.ts: v2 / v2 / v1');
    expect(text).toContain('- notes.txt: todo / - / -');
    expect(text).toContain('- 0000000 "commit 0" by Lea Moreau [HEAD → main, origin/main]');
    expect(text).toContain('7777777');
    expect(text).not.toContain('8888888');
  });

  it('handles no mission, detached HEAD and an empty repo', () => {
    const text = renderContext(view({ mission: null, headBranch: null, commits: [], areas: [], lastCommand: null }));
    expect(text).toContain('No mission is active.');
    expect(text).toContain('detached HEAD');
    expect(text).toContain('no commits yet');
    expect(text).toContain('Last command: none yet');
  });
});

describe('key storage', () => {
  it('round-trips through encrypt/decrypt with mode 0600 and validates first', async () => {
    const { tutor, keyFile, retrieve, makeClient } = setup();
    expect(await tutor.status()).toBe('needs-key');
    await tutor.setKey('  sk-ant-test  ');
    expect(makeClient).toHaveBeenCalledWith('sk-ant-test');
    expect(retrieve).toHaveBeenCalledWith(TUTOR_MODEL);
    expect(readFileSync(keyFile, 'utf8')).toBe('enc:sk-ant-test');
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(await tutor.status()).toBe('ready');
    await tutor.clearKey();
    expect(await tutor.status()).toBe('needs-key');
    await tutor.clearKey(); // idempotent
  });

  it('does not save a rejected key', async () => {
    const { tutor, keyFile, retrieve } = setup();
    retrieve.mockRejectedValueOnce(apiError(401));
    await expect(tutor.setKey('sk-bad')).rejects.toThrow(MESSAGES.rejected);
    expect(() => statSync(keyFile)).toThrow();
  });

  it('refuses to store when encryption is unavailable', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gq-tutor-'));
    const tutor = createTutor({
      keyFile: path.join(dir, 'k.bin'),
      encrypt: () => Buffer.from(''),
      decrypt: () => '',
      canEncrypt: () => false,
      client: () => ({}) as Anthropic,
      cliAvailable: () => ({ 'claude-code': null, codex: null }),
    });
    await expect(tutor.setKey('sk-ant-x')).rejects.toThrow(MESSAGES.cannotEncrypt);
    await expect(tutor.setKey('  ')).rejects.toThrow(MESSAGES.emptyKey);
  });

  it('treats an undecryptable key file as needs-key', async () => {
    const { tutor, keyFile } = setup();
    await tutor.setKey('sk-ant-test');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(keyFile, 'garbage');
    expect(await tutor.status()).toBe('needs-key');
    await expect(tutor.ask('hi', view())).rejects.toThrow(MESSAGES.noKey);
  });
});

describe('ask', () => {
  it('sends the cached system prompt, low effort, a JSON schema and the context', async () => {
    const { tutor, create } = setup(vi.fn(async () => reply('Try git status first.', 'git status')));
    await tutor.setKey('sk-ant-test');
    expect(await tutor.ask('what now?', view())).toEqual({ text: 'Try git status first.', command: 'git status' });
    const params = (create.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(params.model).toBe(TUTOR_MODEL);
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toContain('Mission 1.2');
    expect(params.messages[0].content).toMatch(/Player: what now\?$/);
  });

  it('drops suggested commands that are not a single git command', async () => {
    for (const bad of ['rm -rf .', 'git add . && git commit', 'git log | head', 'git status; ls']) {
      const { tutor } = setup(vi.fn(async () => reply('ok', bad)));
      await tutor.setKey('k');
      expect((await tutor.ask('q', view())).command).toBeNull();
    }
  });

  it('keeps the last 6 exchanges and resets when the mission changes', async () => {
    const { tutor, create } = setup();
    await tutor.setKey('k');
    for (let i = 0; i < 8; i++) await tutor.ask(`q${i}`, view());
    const last = (create.mock.calls.at(-1) as unknown as [Record<string, any>])[0].messages;
    expect(last).toHaveLength(13); // 6 pairs + the new question
    expect(last[0]).toEqual({ role: 'user', content: 'q1' });
    expect(last[1].role).toBe('assistant');

    await tutor.ask('new mission', view({ mission: mission('1.3') }));
    expect((create.mock.calls.at(-1) as unknown as [Record<string, any>])[0].messages).toHaveLength(1);

    await tutor.ask('again', view({ mission: mission('1.3') }));
    expect((create.mock.calls.at(-1) as unknown as [Record<string, any>])[0].messages).toHaveLength(3);

    tutor.reset();
    await tutor.ask('after reset', view({ mission: mission('1.3') }));
    expect((create.mock.calls.at(-1) as unknown as [Record<string, any>])[0].messages).toHaveLength(1);
  });

  it('does not record failed turns', async () => {
    const create = vi.fn(async () => reply('fine'));
    const { tutor } = setup(create);
    await tutor.setKey('k');
    create.mockRejectedValueOnce(apiError(529));
    await expect(tutor.ask('q0', view())).rejects.toThrow(MESSAGES.busy);
    await tutor.ask('q1', view());
    expect((create.mock.calls.at(-1) as unknown as [Record<string, any>])[0].messages).toHaveLength(1);
  });

  it('maps refusals and garbled output to readable errors', async () => {
    const create = vi.fn();
    const { tutor } = setup(create);
    await tutor.setKey('k');
    create.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    await expect(tutor.ask('q', view())).rejects.toThrow(MESSAGES.refused);
    create.mockResolvedValueOnce({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"text": "cut' }] });
    await expect(tutor.ask('q', view())).rejects.toThrow(MESSAGES.garbled);
    await expect(tutor.ask('   ', view())).rejects.toThrow(MESSAGES.emptyQuestion);
  });

  it('needs a key', async () => {
    const { tutor } = setup();
    await expect(tutor.ask('hi', view())).rejects.toThrow(MESSAGES.noKey);
  });
});

describe('friendlyError', () => {
  it.each([
    [apiError(401), MESSAGES.rejected],
    [apiError(403), MESSAGES.forbidden],
    [apiError(404), MESSAGES.modelMissing],
    [apiError(402), MESSAGES.billing],
    [apiError(429), MESSAGES.busy],
    [apiError(500), MESSAGES.busy],
    [apiError(529), MESSAGES.busy],
    [new Anthropic.APIConnectionTimeoutError(), MESSAGES.slow],
    [new Anthropic.APIConnectionError({ message: 'ECONNREFUSED' }), MESSAGES.offline],
  ])('%s', (err, msg) => {
    expect(friendlyError(err)).toBe(msg);
  });

  it('gives a generic message for other statuses', () => {
    expect(friendlyError(apiError(400))).toMatch(/problem \(error 400\)/);
  });
});

describe('Claude Code and Codex backends', () => {
  function cliSetup(bins: { 'claude-code': string | null; codex: string | null }, answer = '{"text":"Check the index first.","command":"git diff --staged"}') {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'gq-tutor-cli-'));
    const cliAsk = vi.fn(async () => answer);
    const tutor = createTutor({
      keyFile: path.join(dir, 'k.bin'),
      encrypt: (t) => Buffer.from(t),
      decrypt: (b) => b.toString(),
      canEncrypt: () => true,
      client: () => ({}) as Anthropic,
      cliAvailable: () => bins,
      cliAsk,
      prefsFile: path.join(dir, 'tutor.json'),
    });
    return { tutor, cliAsk };
  }

  it('is ready without an API key when Claude Code is installed, and prefers it', async () => {
    const { tutor, cliAsk } = cliSetup({ 'claude-code': '/bin/claude', codex: '/bin/codex' });
    expect(await tutor.status()).toBe('ready');
    expect(await tutor.backend()).toEqual({ active: 'claude-code', available: ['claude-code', 'codex'], preference: 'auto' });
    const reply = await tutor.ask('why v3?', view({ mission: mission('m1') }));
    expect(reply).toEqual({ text: 'Check the index first.', command: 'git diff --staged' });
    expect(cliAsk).toHaveBeenCalledWith('claude-code', '/bin/claude', expect.objectContaining({ prompt: expect.stringContaining('Player: why v3?') }));
  });

  it('honours an explicit choice and carries recent turns in the prompt', async () => {
    const { tutor, cliAsk } = cliSetup({ 'claude-code': '/bin/claude', codex: '/bin/codex' });
    expect((await tutor.setBackend('codex')).active).toBe('codex');
    await tutor.ask('first?', view({ mission: mission('m1') }));
    await tutor.ask('second?', view({ mission: mission('m1') }));
    const calls = cliAsk.mock.calls as unknown as [string, string, { prompt: string }][];
    expect(calls[1]?.[0]).toBe('codex');
    expect(calls[1]?.[2].prompt).toContain('Player: first?');
    expect(calls[1]?.[2].prompt).toContain('Tutor: Check the index first.');
  });

  it('needs a key when nothing is installed', async () => {
    const { tutor } = cliSetup({ 'claude-code': null, codex: null });
    expect(await tutor.status()).toBe('needs-key');
    expect((await tutor.backend()).active).toBeNull();
  });
});

/**
 * "nova" — the production-grade repository every level's capstone scenario is played on.
 * Pure data: setup commands (see PreludeStep.commands) that build a realistic monorepo with ~60 commits
 * by the Nova team, Conventional Commit subjects, annotated release tags, a release branch, two open
 * feature branches and a merged feature. Commits carry their own author, committer and dates (June to
 * November 2025, before the story's dates), so the history is identical however it is run.
 *
 * Capstone: `root: productionRepo({ remote: true })`, then append incidents (below) to the root or the prelude.
 */
import { ORIGIN_URL, TEAMMATES, type PreludeStep, type TeammateId } from './model';

// Setup-syntax helpers -----------------------------------------------------

/** Double-quoted setup argument: `\n` = newline (edit/append), `\"` and `\\` escaped. */
const q = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** Env prefix that makes a teammate the author and committer (and tagger) of the git command after it. */
export function as(who: TeammateId): string {
  const { name, email } = TEAMMATES[who];
  return `GIT_AUTHOR_NAME=${q(name)} GIT_AUTHOR_EMAIL=${email} GIT_COMMITTER_NAME=${q(name)} GIT_COMMITTER_EMAIL=${email}`;
}

/** Replaces exactly one occurrence of `find`; throws on authoring mistakes so they fail at import. */
function sub(find: string, replace: string): (text: string) => string {
  return (text) => {
    if (!text.includes(find)) throw new Error(`production.ts: "${find}" not found`);
    return text.replace(find, () => replace);
  };
}

type Change = string | ((text: string) => string);

/**
 * Tiny history builder: emits setup commands and tracks every branch's files, so merges can be
 * checked for conflicts here and the final main snapshot can be exported for incidents and validators.
 */
function builder() {
  const out: string[] = [];
  const trees = new Map<string, Map<string, string>>([['main', new Map()]]);
  const forks = new Map<string, Map<string, string>>();
  let head = 'main';
  let tick = 0;
  const tree = () => trees.get(head)!;
  // ponytail: one commit every ~3 days from 2025-06-02, hour varies; monotonic in creation order.
  const date = () => {
    const ms = Date.UTC(2025, 5, 2, 8) + tick * 3 * 86_400_000 + ((tick * 5) % 9) * 3_600_000;
    tick += 1;
    return new Date(ms).toISOString().replace('.000Z', 'Z');
  };
  const stamp = (who: TeammateId) => {
    const d = date();
    return `${as(who)} GIT_AUTHOR_DATE=${d} GIT_COMMITTER_DATE=${d}`;
  };
  return {
    out,
    files: () => Object.fromEntries(trees.get('main')!),
    /** The calendar day the next commit gets (for CHANGELOG entries). */
    today: () => new Date(Date.UTC(2025, 5, 2, 8) + tick * 3 * 86_400_000).toISOString().slice(0, 10),
    commit(who: TeammateId, subject: string, changes: Record<string, Change>) {
      let added = false;
      for (const [file, change] of Object.entries(changes)) {
        const before = tree().get(file);
        if (typeof change === 'function' && before === undefined) throw new Error(`production.ts: ${file} missing`);
        added ||= before === undefined;
        const text = typeof change === 'string' ? change : change(before!);
        tree().set(file, text);
        out.push(`edit ${file} ${q(text)}`);
      }
      // ponytail: `commit -a` saves one git spawn when no file is new (keeps the build well under 3 s).
      if (added) out.push('git add -A');
      out.push(`${stamp(who)} git commit -q ${added ? '' : '-a '}-m ${q(subject)}`);
    },
    branch(name: string) {
      trees.set(name, new Map(tree()));
      forks.set(name, new Map(tree()));
      head = name;
      out.push(`git checkout -q -b ${name}`);
    },
    checkout(name: string) {
      head = name;
      out.push(`git checkout -q ${name}`);
    },
    merge(who: TeammateId, name: string, message: string) {
      const base = forks.get(name)!;
      const theirs = trees.get(name)!;
      for (const file of new Set([...base.keys(), ...theirs.keys()])) {
        if (theirs.get(file) === base.get(file)) continue;
        if (tree().get(file) !== base.get(file)) throw new Error(`production.ts: merge of ${name} conflicts on ${file}`);
        const text = theirs.get(file);
        if (text === undefined) tree().delete(file);
        else tree().set(file, text);
      }
      out.push(`${stamp(who)} git merge -q --no-ff ${name} -m ${q(message)}`);
    },
    tag(who: TeammateId, name: string, message: string) {
      out.push(`${stamp(who)} git tag -a ${name} -m ${q(message)}`);
    },
  };
}

// File contents ------------------------------------------------------------

const PACKAGE_JSON = `{
  "name": "nova",
  "version": "0.1.0",
  "private": true,
  "description": "Nova: fast, offline-first notes.",
  "license": "MIT",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev -w @nova/web",
    "build": "npm run build --workspaces --if-present",
    "test": "npm test --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=20"
  }
}`;

const README = `# Nova

Nova is a fast, offline-first notes app.

## Packages

- \`apps/web\`: the web app (React + Vite)
- \`packages/sync\`: the offline sync engine`;

const WEB_PACKAGE = `{
  "name": "@nova/web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@nova/sync": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "vite": "^5.2.11"
  }
}`;

const APP = `import { useEffect } from 'react';
import { createSync } from '@nova/sync';

const sync = createSync({ endpoint: '/api/sync' });

export function App() {
  useEffect(() => sync.start(), []);
  return <main className="nova">Nova</main>;
}`;

const SYNC_PACKAGE = `{
  "name": "@nova/sync",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}`;

const SYNC_INDEX = `import { next } from './queue';

export { enqueue, next, size } from './queue';

export interface SyncOptions {
  endpoint: string;
  intervalMs?: number;
}

export function createSync({ endpoint, intervalMs = 5000 }: SyncOptions) {
  const flush = async () => {
    const job = next();
    if (job) await fetch(endpoint, { method: 'POST', body: job.payload });
  };
  return {
    start() {
      const timer = setInterval(flush, intervalMs);
      return () => clearInterval(timer);
    },
  };
}`;

const QUEUE = `export interface Job {
  id: string;
  noteId: string;
  payload: string;
  attempts: number;
}

const jobs: Job[] = [];

export function enqueue(job: Omit<Job, 'attempts'>): void {
  jobs.push({ ...job, attempts: 0 });
}

export function next(): Job | undefined {
  return jobs.shift();
}

export function size(): number {
  return jobs.length;
}`;

const QUEUE_TEST = `import { describe, expect, it } from 'vitest';
import { enqueue, next, size } from '../src/queue';

describe('queue', () => {
  it('keeps jobs in order', () => {
    enqueue({ id: 'a', noteId: 'n1', payload: 'x' });
    enqueue({ id: 'b', noteId: 'n2', payload: 'y' });
    expect(next()?.id).toBe('a');
    expect(size()).toBe(1);
  });
});`;

const CI = `name: CI

on:
  push:
    branches: [main, 'release/**']
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
      - run: npm ci
      - run: npm test`;

const ROUTES = `export interface Route {
  path: string;
  title: string;
}

export const routes: Route[] = [
  { path: '/', title: 'All notes' },
  { path: '/notes/:id', title: 'Editor' },
];

export function match(url: string): Route | undefined {
  return routes.find((route) => new RegExp('^' + route.path.replace(/:\\w+/g, '[^/]+') + '$').test(url));
}`;

const EDITOR = `import { useState } from 'react';
import { enqueue } from '@nova/sync';

export function Editor({ noteId, initial }: { noteId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const save = (value: string) => {
    setText(value);
    enqueue({ id: crypto.randomUUID(), noteId, payload: value });
  };
  return <textarea className="editor" value={text} onChange={(event) => save(event.target.value)} />;
}`;

const CONFLICT = `export interface Version {
  text: string;
  updatedAt: number;
}

/** Last write wins: the most recent edit is kept. */
export function resolveConflict(local: Version, remote: Version): Version {
  return local.updatedAt >= remote.updatedAt ? local : remote;
}`;

/** The smoke test. Its invariants hold on every commit of the production history (bisect-safe). */
const TEST_SH = `#!/bin/sh
# Nova smoke test: fast invariants that must hold on every commit.
# CI runs it on every push; it also works with: git bisect run sh scripts/test.sh
fail() {
  echo "FAIL: $1"
  exit 1
}

grep -q 'export const MAX_RETRIES = 5;' packages/sync/src/queue.ts || fail 'sync must retry failed jobs 5 times'
grep -q 'export function resolveConflict' packages/sync/src/conflict.ts || fail 'conflict resolver is missing'
grep -q '"workspaces"' package.json || fail 'package.json must declare the workspaces'
echo 'ok: smoke tests passed'`;

const changelogEntry = (version: string, day: string, body: string) => `## [${version}] - ${day}\n\n${body}`;
const CHANGELOG_HEAD = `# Changelog

All notable changes to Nova are documented here.
The format follows Keep a Changelog; versions follow Semantic Versioning.`;
const prependRelease = (entry: string) => sub(`${CHANGELOG_HEAD}\n\n`, `${CHANGELOG_HEAD}\n\n${entry}\n\n`);

// The history --------------------------------------------------------------

function buildHistory() {
  const h = builder();

  // v1.0.0: bootstrap (June-July 2025)
  h.commit('lea', 'chore: scaffold the Nova monorepo', {
    'package.json': PACKAGE_JSON,
    'README.md': README,
    '.gitignore': 'node_modules/\ndist/\n.env',
    '.editorconfig': 'root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ninsert_final_newline = true',
    LICENSE: 'MIT License\n\nCopyright (c) 2025 Nova Labs\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software, to deal in the Software without restriction.',
  });
  h.commit('lea', 'feat(web): add the app shell', { 'apps/web/package.json': WEB_PACKAGE, 'apps/web/src/App.tsx': APP });
  h.commit('samir', 'feat(sync): add the sync package with an in-memory job queue', {
    'packages/sync/package.json': SYNC_PACKAGE,
    'packages/sync/src/index.ts': SYNC_INDEX,
    'packages/sync/src/queue.ts': QUEUE,
  });
  h.commit('samir', 'test(sync): cover queue ordering', { 'packages/sync/test/queue.test.ts': QUEUE_TEST });
  h.commit('yanis', 'ci: add the GitHub Actions workflow', { '.github/workflows/ci.yml': CI });
  h.commit('ines', 'feat(web): add routes for the notes list and the editor', {
    'apps/web/src/routes.ts': ROUTES,
    'apps/web/src/App.tsx': sub(
      `export function App() {\n  useEffect(() => sync.start(), []);\n  return <main className="nova">Nova</main>;\n}`,
      `export function App({ url }: { url: string }) {\n  useEffect(() => sync.start(), []);\n  const route = match(url) ?? routes[0];\n  return (\n    <main className="nova">\n      <h1>{route.title}</h1>\n    </main>\n  );\n}`,
    ),
  });
  h.commit('ines', 'feat(web): add the markdown editor component', {
    'apps/web/src/editor.tsx': EDITOR,
    'apps/web/src/App.tsx': (text) =>
      sub("import { createSync } from '@nova/sync';\n", "import { createSync } from '@nova/sync';\nimport { Editor } from './editor';\nimport { match, routes } from './routes';\n")(
        sub('      <h1>{route.title}</h1>\n', "      <h1>{route.title}</h1>\n      {route.path === '/notes/:id' && <Editor noteId={url.split('/')[2]} initial=\"\" />}\n")(text),
      ),
  });
  h.commit('samir', 'feat(sync): retry failed jobs with exponential backoff', {
    'packages/sync/src/queue.ts': sub(
      'const jobs: Job[] = [];\n',
      'export const MAX_RETRIES = 5;\n\nconst jobs: Job[] = [];\n\n/** Re-queues a failed job; returns the delay before the next try, or null when it gives up. */\nexport function retry(job: Job): number | null {\n  if (job.attempts >= MAX_RETRIES) return null;\n  jobs.push({ ...job, attempts: job.attempts + 1 });\n  return 250 * 2 ** job.attempts;\n}\n',
    ),
  });
  h.commit('samir', 'feat(sync): add last-write-wins conflict resolution', {
    'packages/sync/src/conflict.ts': CONFLICT,
    'packages/sync/src/index.ts': sub("export { enqueue, next, size } from './queue';\n", "export { enqueue, next, size } from './queue';\nexport { resolveConflict } from './conflict';\n"),
  });
  h.commit('yanis', 'test: add a smoke test script for CI and bisect', {
    'scripts/test.sh': TEST_SH,
    'package.json': sub('"test": "npm test --workspaces --if-present"', '"test": "sh scripts/test.sh && npm test --workspaces --if-present"'),
  });
  h.out.splice(h.out.length - 2, 0, 'chmod +x scripts/test.sh');
  h.commit('yanis', 'chore: add CODEOWNERS and a pull request template', {
    '.github/CODEOWNERS': '# Default reviewers for everything\n*                 @nova/core\n\n/apps/web/         @ines-bouvet\n/packages/sync/    @samir-haddad\n/.github/          @yanis-perret',
    '.github/pull_request_template.md': '## What\n\n## Why\n\n## How to test\n\n- [ ] `npm test` passes\n- [ ] CHANGELOG.md updated for user-facing changes',
  });
  h.commit('lea', 'docs: add setup instructions to the README', {
    'README.md': (text) => `${text}\n\n## Getting started\n\n\`\`\`sh\nnpm install\nnpm run dev\n\`\`\`\n\nRun \`npm test\` before you open a pull request.`,
  });
  h.commit('ines', 'fix(web): keep the cursor position when a note reloads', {
    'apps/web/src/editor.tsx': (text) =>
      sub("import { useState } from 'react';", "import { useLayoutEffect, useRef, useState } from 'react';")(
        sub(
          '  const [text, setText] = useState(initial);\n',
          '  const [text, setText] = useState(initial);\n  const area = useRef<HTMLTextAreaElement>(null);\n  const caret = useRef(0);\n  useLayoutEffect(() => area.current?.setSelectionRange(caret.current, caret.current), [text]);\n',
        )(
          sub(
            '  return <textarea className="editor" value={text} onChange={(event) => save(event.target.value)} />;',
            '  return (\n    <textarea\n      ref={area}\n      className="editor"\n      value={text}\n      onSelect={(event) => (caret.current = event.currentTarget.selectionStart)}\n      onChange={(event) => save(event.target.value)}\n    />\n  );',
          )(text),
        ),
      ),
  });
  h.commit('yanis', 'ci: cache npm dependencies', {
    '.github/workflows/ci.yml': sub('node-version: ${{ matrix.node-version }}\n', 'node-version: ${{ matrix.node-version }}\n          cache: npm\n'),
  });
  h.commit('lea', 'chore(release): 1.0.0', {
    'package.json': sub('"version": "0.1.0"', '"version": "1.0.0"'),
    'CHANGELOG.md': `${CHANGELOG_HEAD}\n\n${changelogEntry(
      '1.0.0',
      h.today(),
      '### Added\n\n- Markdown editor.\n- Offline sync queue with retries and exponential backoff.\n- Last-write-wins conflict resolution.\n\n### Fixed\n\n- The cursor no longer jumps when a note reloads.',
    )}`,
  });
  h.tag('lea', 'v1.0.0', 'Nova 1.0.0');

  // v1.1.0 (July-August 2025)
  h.commit('ines', 'feat(web): filter notes by tag', {
    'apps/web/src/routes.ts': sub("  { path: '/notes/:id', title: 'Editor' },\n", "  { path: '/notes/:id', title: 'Editor' },\n  { path: '/tags/:tag', title: 'Tagged notes' },\n"),
  });
  h.commit('samir', 'perf(sync): flush queued jobs in batches of 50', {
    'packages/sync/src/queue.ts': sub('export function size(', '/** Takes up to `max` jobs off the queue in one go. */\nexport function drain(max = 50): Job[] {\n  return jobs.splice(0, max);\n}\n\nexport function size('),
    'packages/sync/src/index.ts': (text) =>
      sub("import { next } from './queue';", "import { drain } from './queue';")(
        sub(
          "    const job = next();\n    if (job) await fetch(endpoint, { method: 'POST', body: job.payload });\n",
          "    const batch = drain();\n    await fetch(endpoint, { method: 'POST', body: JSON.stringify(batch) });\n",
        )(text),
      ),
  });
  h.commit('yanis', 'build: add ESLint and a lint script', {
    'package.json': (text) =>
      sub('    "test": ', '    "lint": "eslint . --max-warnings 0",\n    "test": ')(sub('"typescript": "^5.4.5"', '"eslint": "^9.4.0",\n    "typescript": "^5.4.5"')(text)),
    '.github/workflows/ci.yml': sub('      - run: npm test', '      - run: npm run lint\n      - run: npm test'),
  });
  h.commit('ines', 'fix(web): escape HTML in note previews', {
    'apps/web/src/editor.tsx': sub(
      'export function Editor(',
      "export const escapeHtml = (text: string) =>\n  text.replace(/[&<>\"']/g, (char) => `&#${char.charCodeAt(0)};`);\n\nexport function Editor(",
    ),
  });
  h.commit('samir', 'test(sync): cover retry backoff', {
    'packages/sync/test/queue.test.ts': (text) =>
      sub("import { enqueue, next, size } from '../src/queue';", "import { MAX_RETRIES, enqueue, next, retry, size } from '../src/queue';")(
        sub(
          '\n});',
          "\n\n  it('backs off exponentially and gives up', () => {\n    const job = { id: 'c', noteId: 'n3', payload: 'z', attempts: 0 };\n    expect(retry(job)).toBe(250);\n    expect(retry({ ...job, attempts: 3 })).toBe(2000);\n    expect(retry({ ...job, attempts: MAX_RETRIES })).toBeNull();\n  });\n});",
        )(text),
      ),
  });

  // feature/search: Ines, merged with a merge commit (PR #42)
  h.branch('feature/search');
  h.commit('ines', 'feat(web): add the search route', {
    'apps/web/src/routes.ts': sub("  { path: '/tags/:tag', title: 'Tagged notes' },\n", "  { path: '/tags/:tag', title: 'Tagged notes' },\n  { path: '/search', title: 'Search' },\n"),
  });
  h.commit('ines', 'feat(web): highlight search matches', {
    'apps/web/src/search.ts': "export function highlight(text: string, query: string): string {\n  if (query === '') return text;\n  return text.split(query).join(`<mark>${query}</mark>`);\n}",
  });
  h.checkout('main');
  h.commit('yanis', 'chore(deps): bump typescript to 5.5', { 'package.json': sub('"typescript": "^5.4.5"', '"typescript": "^5.5.4"') });
  h.checkout('feature/search');
  h.commit('ines', 'fix(web): debounce the search input', {
    'apps/web/src/search.ts': (text) =>
      `${text}\n\nexport function debounce<T extends unknown[]>(fn: (...args: T) => void, ms = 200) {\n  let timer: ReturnType<typeof setTimeout> | undefined;\n  return (...args: T) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}`,
  });
  h.checkout('main');
  h.merge('lea', 'feature/search', 'Merge pull request #42 from nova/feature/search');
  h.out.push('git branch -q -d feature/search');

  h.commit('samir', 'fix(sync): replace the pending job when a note is saved twice', {
    'packages/sync/src/queue.ts': sub(
      "export function enqueue(job: Omit<Job, 'attempts'>): void {\n",
      "export function enqueue(job: Omit<Job, 'attempts'>): void {\n  const pending = jobs.findIndex((queued) => queued.noteId === job.noteId);\n  if (pending !== -1) jobs.splice(pending, 1);\n",
    ),
  });
  h.commit('lea', 'docs: describe the sync architecture', {
    'README.md': sub(
      '\n\n## Getting started',
      '\n\n## How sync works\n\nEvery edit becomes a job in the sync queue. The queue flushes in batches, retries failed\njobs with exponential backoff and resolves conflicts in `packages/sync/src/conflict.ts`.\n\n## Getting started',
    ),
  });
  h.commit('lea', 'chore(release): 1.1.0', {
    'package.json': sub('"version": "1.0.0"', '"version": "1.1.0"'),
    'CHANGELOG.md': prependRelease(
      changelogEntry(
        '1.1.0',
        h.today(),
        '### Added\n\n- Filter notes by tag.\n- Search with highlighted matches.\n\n### Changed\n\n- Sync flushes jobs in batches of 50.\n\n### Fixed\n\n- HTML in note previews is escaped.\n- Saving a note twice no longer queues two jobs.',
      ),
    ),
  });
  h.tag('lea', 'v1.1.0', 'Nova 1.1.0');

  // v1.2.0 (August-October 2025)
  h.commit('samir', 'feat(sync): three-way merge for text conflicts', {
    'packages/sync/src/conflict.ts': sub(
      '/** Last write wins: the most recent edit is kept. */\nexport function resolveConflict(local: Version, remote: Version): Version {\n  return local.updatedAt >= remote.updatedAt ? local : remote;\n}',
      '/** Returns the merged text, or null when both sides changed it. */\nexport function merge3(base: string, local: string, remote: string): string | null {\n  if (local === base) return remote;\n  if (remote === base || remote === local) return local;\n  return null;\n}\n\n/** Three-way merge first; last write wins when both sides edited the note. */\nexport function resolveConflict(base: Version, local: Version, remote: Version): Version {\n  const text = merge3(base.text, local.text, remote.text);\n  if (text !== null) return { text, updatedAt: Math.max(local.updatedAt, remote.updatedAt) };\n  return local.updatedAt >= remote.updatedAt ? local : remote;\n}',
    ),
  });
  h.commit('ines', 'feat(web): add keyboard shortcuts to the editor', {
    'apps/web/src/editor.tsx': sub(
      '      onSelect={',
      "      onKeyDown={(event) => {\n        if (event.metaKey && event.key === 's') {\n          event.preventDefault();\n          save(text);\n        }\n      }}\n      onSelect={",
    ),
  });
  h.commit('yanis', 'ci: test on Node 20 and 22', { '.github/workflows/ci.yml': sub('node-version: [20]', 'node-version: [20, 22]') });
  h.commit('samir', 'refactor(sync): extract the backoff helper', {
    'packages/sync/src/queue.ts': (text) =>
      sub('export const MAX_RETRIES = 5;\n', 'export const MAX_RETRIES = 5;\n\nexport const backoff = (attempt: number) => Math.min(30_000, 250 * 2 ** attempt);\n')(
        sub('  return 250 * 2 ** job.attempts;', '  return backoff(job.attempts);')(text),
      ),
  });
  h.commit('ines', 'feat(web): add a settings page', {
    'apps/web/src/routes.ts': sub("  { path: '/search', title: 'Search' },\n", "  { path: '/search', title: 'Search' },\n  { path: '/settings', title: 'Settings' },\n"),
  });
  h.commit('samir', 'fix(sync): stop retrying on 4xx responses', {
    'packages/sync/src/queue.ts': (text) =>
      sub('export function retry(job: Job): number | null {\n', 'export function retry(job: Job, status?: number): number | null {\n  if (status !== undefined && status >= 400 && status < 500) return null;\n')(text),
  });
  h.commit('yanis', 'chore: ignore coverage output', { '.gitignore': (text) => `${text}\ncoverage/` });
  h.commit('lea', 'docs: add a contributing section to the README', {
    'README.md': (text) =>
      `${text}\n\n## Contributing\n\nBranch from \`main\` (\`feature/…\`, \`fix/…\`), write Conventional Commits and open a pull\nrequest. CODEOWNERS picks the reviewers; CI must be green before you merge.`,
  });

  // release/1.2: stabilise, tag, merge back
  h.branch('release/1.2');
  h.commit('samir', 'fix(sync): skip empty batches', {
    'packages/sync/src/index.ts': sub('    const batch = drain();\n', '    const batch = drain();\n    if (batch.length === 0) return;\n'),
  });
  h.commit('lea', 'chore(release): 1.2.0', {
    'package.json': sub('"version": "1.1.0"', '"version": "1.2.0"'),
    'CHANGELOG.md': prependRelease(
      changelogEntry(
        '1.2.0',
        h.today(),
        '### Added\n\n- Three-way merge for text conflicts.\n- Keyboard shortcuts in the editor.\n- Settings page.\n\n### Fixed\n\n- Sync no longer retries requests rejected with a 4xx status.\n- Sync skips empty batches.',
      ),
    ),
  });
  h.tag('lea', 'v1.2.0', 'Nova 1.2.0');
  h.checkout('main');
  h.commit('ines', 'feat(web): pin notes to the top of the list', {
    'apps/web/src/App.tsx': sub('      <h1>{route.title}</h1>\n', '      <h1>{route.title}</h1>\n      <p className="hint">Pinned notes stay on top.</p>\n'),
  });
  h.merge('lea', 'release/1.2', "Merge branch 'release/1.2'");

  // After 1.2 (October-November 2025)
  h.commit('samir', 'perf(sync): compress payloads larger than 4 KB', {
    'packages/sync/src/index.ts': (text) =>
      sub(
        "    await fetch(endpoint, { method: 'POST', body: JSON.stringify(batch) });\n",
        "    const body = JSON.stringify(batch);\n    if (body.length <= 4096) return void (await fetch(endpoint, { method: 'POST', body }));\n    const gzipped = new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'));\n    await fetch(endpoint, { method: 'POST', body: await new Response(gzipped).blob(), headers: { 'Content-Encoding': 'gzip' } });\n",
      )(text),
  });
  h.commit('yanis', 'ci: upload test results as an artifact', {
    '.github/workflows/ci.yml': (text) =>
      `${text}\n      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: test-results-node-\${{ matrix.node-version }}\n          path: coverage/`,
  });
  h.commit('lea', 'docs(changelog): start an Unreleased section', { 'CHANGELOG.md': prependRelease('## [Unreleased]') });
  h.commit('ines', 'fix(web): restore the scroll position after navigation', {
    'apps/web/src/App.tsx': sub('  useEffect(() => sync.start(), []);\n', '  useEffect(() => sync.start(), []);\n  useEffect(() => window.scrollTo(0, Number(sessionStorage.getItem(url) ?? 0)), [url]);\n'),
  });
  h.commit('samir', 'refactor(sync): emit typed queue events', {
    'packages/sync/src/queue.ts': (text) =>
      sub(
        'const jobs: Job[] = [];\n',
        "const jobs: Job[] = [];\n\nexport type QueueEvent = { type: 'enqueued' | 'retried'; job: Job };\nconst listeners = new Set<(event: QueueEvent) => void>();\n\nexport function onQueueEvent(listener: (event: QueueEvent) => void): () => void {\n  listeners.add(listener);\n  return () => listeners.delete(listener);\n}\n",
      )(sub('  jobs.push({ ...job, attempts: 0 });\n', "  jobs.push({ ...job, attempts: 0 });\n  listeners.forEach((listener) => listener({ type: 'enqueued', job: { ...job, attempts: 0 } }));\n")(text)),
  });
  h.commit('yanis', 'build(deps): bump vite to 5.4', { 'apps/web/package.json': sub('"vite": "^5.2.11"', '"vite": "^5.4.10"') });
  h.commit('ines', 'feat(web): show the word count in the editor', {
    'apps/web/src/editor.tsx': (text) => {
      const [before, jsx] = text.split('  return (\n');
      const indented = jsx!.replace(/^ {4}/gm, '      ').replace('      );\n}', '  );\n}');
      const words = "  const words = text.trim() === '' ? 0 : text.trim().split(/\\s+/).length;\n";
      return `${before}${words}  return (\n    <>\n      <span className="word-count">{words} words</span>\n${indented.replace('\n  );\n}', '\n    </>\n  );\n}')}`;
    },
  });
  h.commit('samir', 'test(sync): cover duplicate jobs', {
    'packages/sync/test/queue.test.ts': sub(
      '\n});',
      "\n\n  it('keeps one pending job per note', () => {\n    enqueue({ id: 'd', noteId: 'n9', payload: 'v1' });\n    enqueue({ id: 'e', noteId: 'n9', payload: 'v2' });\n    expect(size()).toBe(2);\n  });\n});",
    ),
  });

  // feature/share-links: Ines, open (2 commits, now behind main)
  h.branch('feature/share-links');
  h.commit('ines', 'feat(web): add the share link route', {
    'apps/web/src/routes.ts': sub("  { path: '/settings', title: 'Settings' },\n", "  { path: '/settings', title: 'Settings' },\n  { path: '/s/:token', title: 'Shared note' },\n"),
  });
  h.commit('ines', 'feat(web): add a copy share link button', {
    'apps/web/src/share.tsx':
      "export function ShareButton({ token }: { token: string }) {\n  const url = `${location.origin}/s/${token}`;\n  return <button onClick={() => navigator.clipboard.writeText(url)}>Copy share link</button>;\n}",
  });
  h.checkout('main');
  h.commit('yanis', 'chore: keep trailing spaces in Markdown files', {
    '.editorconfig': (text) => `${text}\ntrim_trailing_whitespace = true\n\n[*.md]\ntrim_trailing_whitespace = false`,
  });
  h.commit('lea', 'docs: describe the release process', {
    'README.md': (text) =>
      `${text}\n\n## Releasing\n\nCut \`release/x.y\` from \`main\`, fix only bugs there, bump the version, update CHANGELOG.md,\ntag \`vx.y.z\` (annotated) and merge the release branch back into \`main\`.`,
  });

  // feature/offline-cache: Samir, open (3 commits)
  h.branch('feature/offline-cache');
  h.commit('samir', 'feat(sync): add an IndexedDB cache adapter', {
    'packages/sync/src/cache.ts':
      "const DB = 'nova-cache';\n\nexport async function openCache(): Promise<IDBDatabase> {\n  return new Promise((resolve, reject) => {\n    const request = indexedDB.open(DB, 1);\n    request.onupgradeneeded = () => request.result.createObjectStore('notes');\n    request.onsuccess = () => resolve(request.result);\n    request.onerror = () => reject(request.error);\n  });\n}",
  });
  h.commit('samir', 'feat(sync): read notes through the cache', {
    'packages/sync/src/index.ts': sub("export { resolveConflict } from './conflict';\n", "export { resolveConflict } from './conflict';\nexport { openCache } from './cache';\n"),
  });
  h.commit('samir', 'test(sync): cover cache eviction', {
    'packages/sync/test/cache.test.ts': "import { describe, expect, it } from 'vitest';\nimport { openCache } from '../src/cache';\n\ndescribe('cache', () => {\n  it('exports an opener', () => {\n    expect(typeof openCache).toBe('function');\n  });\n});",
  });
  h.checkout('main');
  h.commit('ines', 'fix(web): trim trailing whitespace when a note is saved', {
    'apps/web/src/editor.tsx': sub('    enqueue({ id: crypto.randomUUID(), noteId, payload: value });', '    enqueue({ id: crypto.randomUUID(), noteId, payload: value.trimEnd() });'),
  });
  h.commit('samir', 'fix(sync): round backoff delays to whole milliseconds', {
    'packages/sync/src/queue.ts': sub('Math.min(30_000, 250 * 2 ** attempt)', 'Math.min(30_000, Math.round(250 * 2 ** attempt))'),
  });
  h.commit('lea', 'docs(changelog): note the editor whitespace fix', {
    'CHANGELOG.md': sub('## [Unreleased]', '## [Unreleased]\n\n### Fixed\n\n- Trailing whitespace is trimmed when a note is saved.'),
  });
  return h;
}

const HISTORY = buildHistory();

/** Every file on `main` after productionRepo (path → content without the trailing newline), for validators. */
export const NOVA_FILES: Readonly<Record<string, string>> = HISTORY.files();

/** Branches productionRepo creates (HEAD ends on main). */
export const NOVA_BRANCHES = ['main', 'release/1.2', 'feature/offline-cache', 'feature/share-links'] as const;
/** Annotated release tags (v1.2.0 lives on release/1.2, merged back into main). */
export const NOVA_TAGS = ['v1.0.0', 'v1.1.0', 'v1.2.0'] as const;

/**
 * Builds the Nova monorepo in an empty folder (starts with `git init -b main`, ends on a clean main).
 * `remote`: adds origin (ORIGIN_URL) and pushes main, release/1.2, both feature branches (with upstreams)
 * and the tags. The level must then be `remote: true` so the bare origin is reset first.
 */
export function productionRepo(opts: { readonly remote: boolean }): readonly string[] {
  return [
    'git init -q -b main',
    ...HISTORY.out,
    ...(opts.remote
      ? [`git remote add origin ${ORIGIN_URL}`, `git push -q -u origin ${NOVA_BRANCHES.join(' ')}`, 'git push -q origin --tags']
      : []),
  ];
}

// Incidents ----------------------------------------------------------------
// Building blocks for capstones: append them after productionRepo (in the mission's root or prelude).
// Each one starts from the files of NOVA_FILES on main and rewrites whole files, so two incidents that
// touch the same file do not combine (the files each one touches are listed). They commit on the current
// branch (main) unless said otherwise, author their own commits, and take their dates from the story.

const commit = (who: TeammateId, subject: string, changes: Record<string, string>): string[] => [
  ...Object.entries(changes).map(([file, text]) => `edit ${file} ${q(text)}`),
  'git add -A',
  `${as(who)} git commit -q -m ${q(subject)}`,
];

/** Subject of the commit introduceRegression() breaks the smoke test with (find it by subject, never by hash). */
export const REGRESSION_SUBJECT = 'refactor(sync): read the retry limit from the environment';

/**
 * Five commits on main; the 2nd ({@link REGRESSION_SUBJECT}, Samir) breaks `sh scripts/test.sh`, the others
 * are harmless. For `git bisect run sh scripts/test.sh` with good = v1.2.0 (or any tag).
 * Touches: docs/architecture.md, packages/sync/src/queue.ts, apps/web/src/empty-state.tsx, CHANGELOG.md, .github/workflows/ci.yml.
 */
export function introduceRegression(): string[] {
  return [
    ...commit('lea', 'docs: add an architecture overview', {
      'docs/architecture.md': '# Architecture\n\n`apps/web` renders notes; every edit is queued by `packages/sync`, which flushes batches to `/api/sync`.',
    }),
    ...commit('samir', REGRESSION_SUBJECT, {
      'packages/sync/src/queue.ts': sub('export const MAX_RETRIES = 5;', 'export const MAX_RETRIES = Number(process.env.NOVA_MAX_RETRIES ?? 0);')(NOVA_FILES['packages/sync/src/queue.ts']!),
    }),
    ...commit('ines', 'feat(web): add an empty state to the notes list', {
      'apps/web/src/empty-state.tsx': 'export function EmptyState() {\n  return <p className="empty">No notes yet. Press N to write one.</p>;\n}',
    }),
    ...commit('lea', 'docs(changelog): note the empty state', {
      'CHANGELOG.md': sub('## [Unreleased]\n', '## [Unreleased]\n\n### Added\n\n- An empty state on the notes list.\n')(NOVA_FILES['CHANGELOG.md']!),
    }),
    ...commit('yanis', 'ci: add a 10 minute timeout to the test job', {
      '.github/workflows/ci.yml': sub('    runs-on: ubuntu-latest\n', '    runs-on: ubuntu-latest\n    timeout-minutes: 10\n')(NOVA_FILES['.github/workflows/ci.yml']!),
    }),
  ];
}

/** Clearly fake key leakSecret() commits. */
export const FAKE_SECRET = 'sk_test_FAKE_DO_NOT_USE_4f9a2c';

/**
 * One commit on main by `who` (default Yanis) that force-adds `.env` (ignored by .gitignore) with
 * NOVA_API_KEY={@link FAKE_SECRET}, together with a legitimate change that reads the key.
 * Append other incidents after it to bury it deeper. Touches: .env, apps/web/src/analytics.ts.
 */
export function leakSecret(who: TeammateId = 'yanis'): string[] {
  return [
    `edit .env ${q(`NOVA_API_KEY=${FAKE_SECRET}\nNOVA_ANALYTICS_URL=https://analytics.nova.example`)}`,
    `edit apps/web/src/analytics.ts ${q("export const analytics = {\n  key: import.meta.env.NOVA_API_KEY,\n  url: import.meta.env.NOVA_ANALYTICS_URL,\n};")}`,
    'git add -f .env apps/web/src/analytics.ts',
    `${as(who)} git commit -q -m ${q('feat(web): send usage analytics')}`,
  ];
}

/**
 * A prelude step (it needs its own clone): `who` (default Lea) pushes a hotfix to origin/main while the
 * player is away; the player's repo does not see it until they fetch. Level must be `remote: true`.
 * Touches: packages/sync/src/conflict.ts.
 */
export function teammatePushesHotfix(who: TeammateId = 'lea'): PreludeStep {
  return {
    id: `hotfix-${who}`,
    teammate: who,
    remote: { push: ['main'] },
    commands: [
      `edit packages/sync/src/conflict.ts ${q(sub('return local.updatedAt >= remote.updatedAt', 'return local.updatedAt > remote.updatedAt')(NOVA_FILES['packages/sync/src/conflict.ts']!))}`,
      `git commit -q -am ${q('fix(sync): prefer the server copy when timestamps tie')}`,
    ],
  };
}

/** Subject of strayDebugCommit()'s commit. */
export const DEBUG_SUBJECT = 'wip';

/**
 * One commit on main by `who` (default Ines) with subject "wip" that leaves a console.log in the editor
 * and a debug.log file: something to amend, revert or drop before pushing. Touches: apps/web/src/editor.tsx, debug.log.
 */
export function strayDebugCommit(who: TeammateId = 'ines'): string[] {
  return commit(who, DEBUG_SUBJECT, {
    'apps/web/src/editor.tsx': sub('  const save = (value: string) => {\n', "  const save = (value: string) => {\n    console.log('DEBUG save', noteId, value);\n")(NOVA_FILES['apps/web/src/editor.tsx']!),
    'debug.log': 'save n1 "Groceries"\nsave n1 "Groceries, milk"\nflush 2 jobs -> 200',
  });
}

/** One contested line per file: [line on main, main's change, branch's change]. */
const HOT = {
  '.github/workflows/ci.yml': {
    line: 'node-version: [20, 22]',
    main: ['yanis', 'ci: add Node 24 to the test matrix', 'node-version: [20, 22, 24]'],
    branch: ['ci/drop-node-20', 'samir', 'ci: drop Node 20, it reached end of life', 'node-version: [22]'],
  },
  'apps/web/src/routes.ts': {
    line: "{ path: '/settings', title: 'Settings' }",
    main: ['lea', 'feat(web): rename Settings to Preferences', "{ path: '/settings', title: 'Preferences' }"],
    branch: ['feature/account-settings', 'ines', 'feat(web): rename Settings to Account settings', "{ path: '/settings', title: 'Account settings' }"],
  },
  'README.md': {
    line: 'Nova is a fast, offline-first notes app.',
    main: ['lea', 'docs: say who Nova is for', 'Nova is a fast, offline-first notes app for teams.'],
    branch: ['docs/tagline', 'yanis', 'docs: mention end-to-end encryption', 'Nova is a fast, offline-first, end-to-end encrypted notes app.'],
  },
} as const;

export type ConflictPath = keyof typeof HOT;

/** Branch conflictingChange(path) creates. */
export const conflictBranch = (path: ConflictPath): string => HOT[path].branch[0];

/**
 * Two teammates change the same line of `path` differently: one commit on a new branch
 * ({@link conflictBranch}) and one on main, so `git merge <branch>` (or a rebase) stops on a conflict.
 * Ends on main. Touches only `path`.
 */
export function conflictingChange(path: ConflictPath): string[] {
  const { line, main, branch } = HOT[path];
  const [name, theirs, theirSubject, theirLine] = branch;
  const [ours, ourSubject, ourLine] = main;
  const base = NOVA_FILES[path]!;
  return [
    `git checkout -q -b ${name}`,
    ...commit(theirs, theirSubject, { [path]: sub(line, theirLine)(base) }),
    'git checkout -q main',
    ...commit(ours, ourSubject, { [path]: sub(line, ourLine)(base) }),
  ];
}

/**
 * Level 10 — GitHub Actions and automation (offline: workflow and config files checked locally).
 * Owner: the level 10 content agent. See docs/CONTENT-GUIDE.md.
 * Nothing runs: validators parse the YAML the player commits and judge its structure. Rules are judged on
 * the files on disk first (precise feedback while editing), then the files must be committed.
 */
import { parse } from 'yaml';
import { NOVA_FILES, productionRepo } from '../production';
import { check, commitsSince, headFile, workingFile, type ValidationResult } from '../validate';

import type { RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';

const CI = '.github/workflows/ci.yml';
const DEPENDABOT = '.github/dependabot.yml';
const CODEOWNERS = '.github/CODEOWNERS';
const NOTES = 'src/notes.js';
const TEST = 'test/notes.test.js';
const LEAKED = 'nova_live_7f3a9c2e81d44b6a';

/** Setup `edit` for a multi-line file: escapes backslashes, double quotes and newlines. */
const write = (file: string, text: string): string =>
  `edit ${file} "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

// Story file contents ------------------------------------------------------

export const FILES = {
  pkg: `{
  "name": "nova-notes",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "eslint src test",
    "deploy": "node scripts/deploy.js"
  }
}`,
  lock: '{ "name": "nova-notes", "version": "1.0.0", "lockfileVersion": 3, "requires": true, "packages": {} }',
  notes: `export const createNote = (title, body = '') => ({ title: title.trim(), body });
export const countWords = (text) => text.split(/\\s+/).filter(Boolean).length;`,
  notesBug: `export const createNote = (title, body = '', tags = []) => ({ title, body, tags });
export const countWords = (text) => text.split(/\\s+/).filter(Boolean).length;`,
  notesFixed: `export const createNote = (title, body = '', tags = []) => ({ title: title.trim(), body, tags });
export const countWords = (text) => text.split(/\\s+/).filter(Boolean).length;`,
  sync: 'export const sync = (notes) => notes.map((note) => ({ ...note, synced: true }));',
  test: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNote, countWords } from '../src/notes.js';

test('title is trimmed', () => {
  assert.equal(createNote('  Groceries ').title, 'Groceries');
});

test('words are counted', () => {
  assert.equal(countWords('buy milk  and eggs'), 4);
});`,
  log: `CI / test (20) - run #1234 - failed after 41s
Run actions/checkout@v4
Run actions/setup-node@v4
Run npm ci
added 0 packages in 0.4s
Run npm test
> nova-notes@1.0.0 test
> node --test
TAP version 13
# Subtest: title is trimmed
not ok 1 - title is trimmed
  ---
  location: 'test/notes.test.js:5:1'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    + '  Groceries '
    - 'Groceries'
  ...
# Subtest: words are counted
ok 2 - words are counted
# tests 2
# pass 1
# fail 1
Error: Process completed with exit code 1.`,
  guide: '# Nova guide\nWrite a note, press Cmd+S, it syncs.',
  codeownersCore: '# Who reviews what. The last matching line wins.\n* @nova/core',
} as const;

// Workflow pieces: each mission's reference result is assembled from them.
const ON_1 = 'on: [push, pull_request]';
const ON_5 = `on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    paths-ignore:
      - 'docs/**'
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * *'`;
const PERMISSIONS = 'permissions:\n  contents: read';
const CONCURRENCY = 'concurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true';

const test = (opts: { matrix?: boolean; needs?: boolean } = {}): string => `  test:
${opts.needs ? '    needs: lint\n' : ''}    runs-on: ubuntu-latest
${opts.matrix ? '    strategy:\n      matrix:\n        node: [20, 22]\n' : ''}    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
${opts.matrix ? '          node-version: ${{ matrix.node }}\n          cache: npm' : '          node-version: 20'}
      - run: npm ci
      - run: npm test`;

const lint = (checkout: string, annotate: string): string => `  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${checkout}
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - uses: octo-lint/annotate@${annotate}
        with:
          command: npm run lint`;

const deploy = (token: string, mainOnly = false): string => `  deploy:
${mainOnly ? "    needs: test\n    if: github.ref == 'refs/heads/main'\n" : ''}    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy
        env:
          DEPLOY_TOKEN: ${token}`;

const workflow = (...parts: string[]): string => ['name: CI', ...parts].join('\n');
const SECRET_REF = '${{ secrets.DEPLOY_TOKEN }}';

export const CI_FILES = {
  v1: workflow(ON_1, 'jobs:', test()),
  v2Prelude: workflow(ON_1, 'jobs:', test(), lint('main', 'master')),
  v2: workflow(ON_1, PERMISSIONS, 'jobs:', test(), lint('v4', 'v2')),
  v3Prelude: workflow(ON_1, PERMISSIONS, 'jobs:', test(), lint('v4', 'v2'), deploy(LEAKED)),
  v3: workflow(ON_1, PERMISSIONS, 'jobs:', test(), lint('v4', 'v2'), deploy(SECRET_REF)),
  v4: workflow(ON_1, PERMISSIONS, 'jobs:', test({ matrix: true }), lint('v4', 'v2'), deploy(SECRET_REF)),
  v5: workflow(ON_5, PERMISSIONS, 'jobs:', test({ matrix: true }), lint('v4', 'v2'), deploy(SECRET_REF)),
  v6: workflow(
    ON_5,
    PERMISSIONS,
    CONCURRENCY,
    'jobs:',
    test({ matrix: true, needs: true }),
    lint('v4', 'v2'),
    deploy(SECRET_REF, true),
  ),
} as const;

const DEPENDABOT_FILE = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly`;

const ROOT_COMMANDS: readonly string[] = [
  'git init -b main',
  write('package.json', FILES.pkg),
  write('package-lock.json', FILES.lock),
  write('.gitignore', 'node_modules/\nlogs/'),
  write(NOTES, FILES.notes),
  write('src/sync/engine.js', FILES.sync),
  write(TEST, FILES.test),
  'git add .',
  'git commit -m "Initial commit"',
];

// Rules --------------------------------------------------------------------

type Doc = Record<string, unknown>;
type Read = (path: string) => string | undefined;
/** undefined when the rule holds, otherwise the sentence shown to the player. */
type Rule = (read: Read) => string | undefined;

const isDoc = (value: unknown): value is Doc => typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const text = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');

function yamlRule(path: string, judge: (doc: Doc) => string | undefined): Rule {
  return (read) => {
    const source = read(path);
    if (source === undefined) return `Create ${path}.`;
    let doc: unknown;
    try {
      doc = parse(source);
    } catch (error) {
      return `${path} is not valid YAML: ${(error as Error).message.split('\n')[0]} Indent with spaces, never tabs.`;
    }
    return isDoc(doc) ? judge(doc) : `${path} must be a YAML map of key: value lines.`;
  };
}

/** Rules on the files on disk first, then every touched path must be committed. */
function verdict(state: RepoState, paths: readonly string[], rules: readonly Rule[]): ValidationResult {
  const disk: Read = (path) => workingFile(state, path);
  for (const rule of rules) {
    const reason = rule(disk);
    if (reason !== undefined) return { ok: false, reason };
  }
  const pending = paths.filter((path) => workingFile(state, path) !== headFile(state, path));
  return check(pending.length === 0, `Commit ${pending.join(' and ')}: GitHub only sees what is committed and pushed.`);
}

/** A check: the rules hold on the committed files. */
const holds =
  (...rules: Rule[]) =>
  (state: RepoState): boolean =>
    rules.every((rule) => rule((path) => headFile(state, path)) === undefined);

// Workflow helpers ---------------------------------------------------------

const ci = (judge: (wf: Doc) => string | undefined): Rule => yamlRule(CI, judge);

/** `on:` as a map, whatever form it was written in (string, list or map). */
function triggers(wf: Doc): Doc {
  const on = wf['on'];
  return isDoc(on) ? on : Object.fromEntries(list(on).map((event) => [text(event), null]));
}

function job(id: string, judge: (job: Doc, wf: Doc) => string | undefined): Rule {
  return ci((wf) => {
    if (!isDoc(wf['jobs'])) return 'ci.yml has no jobs: section.';
    const found = wf['jobs'][id];
    return isDoc(found) ? judge(found, wf) : `ci.yml has no ${id} job under jobs:.`;
  });
}

const stepsOf = (job: Doc): Doc[] => list(job['steps']).filter(isDoc);
const actionOf = (step: Doc): string => text(step['uses']).split('@')[0]!.toLowerCase();
const setupNode = (job: Doc): Doc | undefined => stepsOf(job).find((step) => actionOf(step) === 'actions/setup-node');
const withOf = (step: Doc | undefined): Doc => (isDoc(step?.['with']) ? step['with'] : {});
const needsOf = (job: Doc): string[] => list(job['needs']).map(text);
const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 10.1 First workflow -------------------------------------------------------

const NPM_CI = /(^|[\s;&])npm ci\b/m;
const NPM_TEST = /(^|[\s;&])npm (test|t|run test)\b/m;

const runsOnPushAndPr = ci((wf) => {
  if (wf['on'] === undefined) return 'ci.yml has no on: key, so it never runs. Add on: [push, pull_request].';
  const on = triggers(wf);
  if (!('push' in on)) return 'ci.yml does not run on push: add push under on:.';
  if (!('pull_request' in on)) return 'ci.yml does not run on pull requests: add pull_request under on:.';
  return undefined;
});

const testOnUbuntu = job('test', (test) =>
  /^ubuntu-/.test(text(test['runs-on'])) ? undefined : 'The test job needs runs-on: ubuntu-latest, the machine GitHub starts for it.',
);

const testSteps = job('test', (test) => {
  const steps = stepsOf(test);
  if (steps.length === 0) return 'The test job has no steps: list.';
  const at = (match: (step: Doc) => boolean) => steps.findIndex(match);
  const checkout = at((step) => actionOf(step) === 'actions/checkout');
  const node = at((step) => actionOf(step) === 'actions/setup-node');
  const install = at((step) => NPM_CI.test(text(step['run'])));
  const tests = at((step) => NPM_TEST.test(text(step['run'])));
  if (checkout < 0) return 'The test job has no actions/checkout step: without it the runner starts in an empty folder.';
  if (node < 0) return 'The test job has no actions/setup-node step.';
  if (install < 0) return 'The test job never runs npm ci.';
  if (tests < 0) return 'The test job never runs npm test.';
  if (checkout > install || node > install) return 'In the test job, actions/checkout and actions/setup-node must come before npm ci: steps run top to bottom.';
  if (install > tests) return 'In the test job, npm ci must run before npm test.';
  return undefined;
});

/** What the first workflow guarantees; every later workflow mission keeps it. */
const BASE: readonly Rule[] = [runsOnPushAndPr, testOnUbuntu, testSteps];

const firstWorkflow: Mission = {
  id: 'first-workflow',
  number: '10.1',
  title: 'A robot that runs the tests',
  story:
    'Twice this week a pull request broke npm test and nobody noticed until Ines tried to release. Lea wants GitHub to run the tests on every push and every pull request.',
  goal: 'Commit .github/workflows/ci.yml: on push and pull_request, a test job on ubuntu-latest that checks out, sets up Node, runs npm ci and npm test.',
  checks: [
    { label: 'Commit .github/workflows/ci.yml, triggered by push and pull_request', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(runsOnPushAndPr) },
    { label: 'A test job runs on ubuntu-latest', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(testOnUbuntu) },
    {
      label: 'Its steps: actions/checkout, actions/setup-node, npm ci, npm test',
      proof: 'git log --stat -1',
      done: holds(testSteps),
    },
  ],
  validate: (state) => verdict(state, [CI], BASE),
  hints: [
    'GitHub only reads workflows from one folder: .github/workflows/. A workflow says when it runs (on:) and what it runs (jobs:).',
    'mkdir -p .github/workflows, then nano .github/workflows/ci.yml. A job has runs-on: and a list of steps:, each step either uses: an action or run: a command. Indent with spaces.',
    'mkdir -p .github/workflows, nano .github/workflows/ci.yml with: name: CI / on: [push, pull_request] / jobs: / (2 spaces) test: / (4) runs-on: ubuntu-latest / (4) steps: / (6) - uses: actions/checkout@v4 / (6) - uses: actions/setup-node@v4 / (6) - run: npm ci / (6) - run: npm test — then git add .github, git commit -m "ci: run tests on push and pull requests".',
  ],
  par: 4,
  takeaway: 'A workflow file in .github/workflows/ tells GitHub when to run (on:) and what to run (jobs: and their steps:).',
  theory: {
    title: 'GitHub Actions workflows',
    body: 'Every YAML file in .github/workflows/ is a workflow: on: lists the events that start it, and each job under jobs: gets a fresh virtual machine (runs-on:) that runs its steps: top to bottom. The machine starts empty, so actions/checkout fetches the commit, actions/setup-node installs Node, and npm ci installs exactly what package-lock.json says. A red or green check then appears next to the commit and on the pull request.',
    lesson: 'on: when, jobs: what, steps: how.',
  },
  outcome: {
    summary:
      'GitHub runs the test suite on every push and every pull request, and a red or green check shows up next to each commit. From then on nobody, human or agent, merges a broken test unnoticed.',
    expect: {
      kind: 'file',
      path: CI,
      content: `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test`,
    },
  },
  prelude: [],
  reference: [
    'mkdir .github/workflows',
    write(CI, CI_FILES.v1),
    'git add .github/workflows/ci.yml',
    'git commit -m "ci: run tests on push and pull requests"',
  ],
  alternatives: [
    [
      write(
        CI,
        `"on":
  push:
  pull_request:
jobs:
  "test":
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11
      - name: Set up Node
        uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: |
          npm ci
          npm test`,
      ),
      'git add .',
      'git commit -m "Add CI"',
    ],
  ],
};

// 10.2 Pin actions, least privilege -----------------------------------------

const PINNED = /^(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/;

const actionsPinned = ci((wf) => {
  for (const [id, found] of Object.entries(isDoc(wf['jobs']) ? wf['jobs'] : {})) {
    for (const step of isDoc(found) ? stepsOf(found) : []) {
      const uses = text(step['uses']);
      if (uses === '' || uses.startsWith('./') || uses.startsWith('docker://')) continue;
      const [action, ref] = uses.split('@');
      if (ref === undefined) return `The ${id} job uses ${action} with no version: add a release tag like @v4 or a full commit SHA.`;
      if (!PINNED.test(ref)) {
        return `The ${id} job uses ${uses}: ${ref} is not a release tag or a full commit SHA, so the code it runs can change under you. Pin it to a tag like @v4 or a 40-character SHA.`;
      }
    }
  }
  return undefined;
});

const readOnlyToken = ci((wf) => {
  const permissions = wf['permissions'];
  if (permissions === undefined) {
    return 'Add permissions: with contents: read at the top level of ci.yml: without it GITHUB_TOKEN may get write access to the repo.';
  }
  if (!isDoc(permissions) || text(permissions['contents']) !== 'read') return 'The top-level permissions: must be a map with contents: read.';
  const writes = Object.keys(permissions).filter((scope) => permissions[scope] === 'write');
  return writes.length > 0 ? `permissions: grants write access to ${writes.join(', ')}: CI only needs to read the code.` : undefined;
});

const pinActions: Mission = {
  id: 'pin-actions',
  number: '10.2',
  title: 'Pin it down',
  story:
    'Samir added a lint job that runs actions/checkout@main and a third-party action, octo-lint/annotate@master. Whoever pushes to those branches now runs code inside Nova\'s CI, with a token that can write to the repo.',
  goal: 'Pin every action in ci.yml to a release tag or a full commit SHA, and give GITHUB_TOKEN only permissions: contents: read.',
  checks: [
    { label: 'Every action is pinned to a release tag or a full commit SHA', proof: 'git grep -n "uses:" HEAD -- .github', done: holds(actionsPinned) },
    { label: 'permissions: contents: read at the top of ci.yml', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(readOnlyToken) },
  ],
  validate: (state) => verdict(state, [CI], [...BASE, actionsPinned, readOnlyToken]),
  hints: [
    'A branch name after @ follows whatever is pushed next. A tag changes rarely, a commit SHA never.',
    'In the lint job, change @main to @v4 and @master to @v2 (or a 40-character SHA). Then add a top-level permissions: block with contents: read.',
    'nano .github/workflows/ci.yml: actions/checkout@main → actions/checkout@v4, octo-lint/annotate@master → octo-lint/annotate@v2, and below the on: line add permissions: / (2 spaces) contents: read — then git commit -am "ci: pin actions and read-only token".',
  ],
  par: 2,
  takeaway: 'Pin actions to a tag or, for third-party code, a full commit SHA, and give the workflow token only the permissions it needs.',
  theory: {
    title: 'Supply chain and GITHUB_TOKEN',
    body: 'uses: runs someone else\'s code with your secrets and your token, so @main means "whatever they push next". A release tag like @v4 is fine for actions you trust (GitHub\'s own), but a tag can be moved, so security-minded teams pin third-party actions to a full 40-character commit SHA and let Dependabot bump it. Each run also gets a GITHUB_TOKEN, and permissions: contents: read limits it to reading the code.',
    lesson: '@sha for third-party actions, permissions: contents: read by default.',
  },
  outcome: {
    summary:
      'Every action in CI runs a fixed release instead of whatever lands on a branch, and the workflow token can only read the code. A hijacked action then cannot push to Nova or steal more than it was given.',
    expect: {
      kind: 'file',
      path: CI,
      content: `name: CI
on: [push, pull_request]
permissions:
  contents: read
jobs:
  # ... test job unchanged
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ...
      - uses: octo-lint/annotate@v2
        with:
          command: npm run lint`,
    },
  },
  prelude: [
    {
      id: 'm10.2-p1',
      teammate: 'samir',
      commands: [write(CI, CI_FILES.v2Prelude), 'git commit -am "ci: add a lint job"'],
    },
  ],
  reference: [write(CI, CI_FILES.v2), 'git commit -am "ci: pin actions and use a read-only token"'],
  alternatives: [
    [
      write(
        CI,
        `name: CI
'on': [push, pull_request]
permissions: { contents: read }
jobs:
${test()}
${lint('v4.1.7', '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567 # v2.1.0')}`,
      ),
      'git add .github/workflows/ci.yml',
      'git commit -m "ci: pin the lint actions"',
    ],
  ],
};

// 10.3 Secrets --------------------------------------------------------------

const SECRET = /^\$\{\{\s*secrets\.DEPLOY_TOKEN\s*\}\}$/;

const noLeakedToken: Rule = (read) =>
  read(CI)?.includes(LEAKED) ? `ci.yml still contains the live token ${LEAKED}: delete it from the file.` : undefined;

const deployReadsSecret = job('deploy', (found) => {
  const steps = stepsOf(found);
  if (!steps.some((step) => /npm run deploy/.test(text(step['run'])))) return 'Keep the npm run deploy step in the deploy job.';
  const envs = [found['env'], ...steps.map((step) => step['env'])].filter(isDoc);
  if (envs.some((env) => Object.values(env).some((value) => SECRET.test(text(value))))) return undefined;
  if (steps.some((step) => text(step['run']).includes('secrets.DEPLOY_TOKEN'))) {
    return 'Pass the secret through env: (DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}) instead of writing it inside run:.';
  }
  return 'The deploy step must read the token from the repository secret: env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}.';
});

const rotationNoted = (state: RepoState, ctx: MissionContext): boolean =>
  commitsSince(state, ctx).some((commit) => /rotat/i.test(commit.message));

const secrets: Mission = {
  id: 'actions-secrets',
  number: '10.3',
  title: 'The token in plain sight',
  story:
    'Yanis added a deploy job and pasted the live deploy token straight into ci.yml. It is committed, and anyone who can read the repo can now deploy Nova.',
  goal: 'Make the deploy step read ${{ secrets.DEPLOY_TOKEN }} through env:, remove the token from ci.yml, and say in the commit message that the token must be rotated.',
  checks: [
    { label: 'The live token is gone from ci.yml', proof: 'git grep -n nova_live HEAD', done: holds(noLeakedToken, deployReadsSecret) },
    { label: 'The deploy step reads ${{ secrets.DEPLOY_TOKEN }} through env:', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(deployReadsSecret) },
    { label: 'The commit message asks to rotate the token', proof: 'git log -1 --format=%B', done: rotationNoted },
  ],
  validate: (state, ctx) => {
    const files = verdict(state, [CI], [...BASE, noLeakedToken, deployReadsSecret]);
    if (!files.ok) return files;
    return check(
      rotationNoted(state, ctx),
      'Say in the commit message that the token must be rotated: removing it does not remove it from Yanis\'s commit, so it is still in history.',
    );
  },
  hints: [
    'Secrets live in the repository settings, not in the code. The workflow only names them.',
    'Replace the token with ${{ secrets.DEPLOY_TOKEN }} under the step\'s env:. The old token stays in history, so it has to be revoked and replaced: write that in the commit message.',
    'nano .github/workflows/ci.yml: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }} — then git commit -am "ci: read DEPLOY_TOKEN from secrets (rotate the leaked token)".',
  ],
  par: 2,
  takeaway: 'Workflows read credentials from ${{ secrets.NAME }} through env:, and a token that was ever committed must be rotated.',
  theory: {
    title: 'Secrets in Actions',
    body: 'Store credentials as repository secrets (Settings, then Secrets and variables, then Actions, or gh secret set DEPLOY_TOKEN) and pass them to a step with env: NAME: ${{ secrets.NAME }}; GitHub masks them in logs and never gives them to pull requests from forks. Deleting a committed token in a new commit is not enough: every clone still has the old commit, so revoke and rotate the token first. Rewriting history with git filter-repo is optional cleanup after that, and push protection blocks the next leak before it lands.',
    lesson: 'Committed once means leaked: rotate, then use secrets.',
  },
  outcome: {
    summary:
      'The deploy job reads its token from the repository secrets, so the workflow file holds no credential, and the commit asks for the leaked token to be rotated. A token that was ever committed is compromised, wherever it lives now.',
    expect: {
      kind: 'file',
      path: CI,
      content: `jobs:
  # ... test and lint unchanged
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}`,
    },
  },
  prelude: [
    {
      id: 'm10.3-p1',
      teammate: 'yanis',
      commands: [write(CI, CI_FILES.v3Prelude), 'git commit -am "ci: deploy main"'],
    },
  ],
  reference: [write(CI, CI_FILES.v3), 'git commit -am "ci: read DEPLOY_TOKEN from secrets, rotate the leaked token"'],
  alternatives: [
    [
      write(
        CI,
        `${workflow(ON_1, PERMISSIONS, 'jobs:', test(), lint('v4', 'v2'))}
  deploy:
    runs-on: ubuntu-latest
    env:
      DEPLOY_TOKEN: "\${{ secrets.DEPLOY_TOKEN }}"
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy`,
      ),
      'git commit -a --amend -m "ci: deploy main (token moved to secrets; Rotate the old one)"',
    ],
  ],
};

// 10.4 Matrix and cache -----------------------------------------------------

/** The matrix key that lists both Node 20 and Node 22 (20, "20", "20.x" all count). */
function nodeMatrixKey(test: Doc): string | undefined {
  const matrix = isDoc(test['strategy']) ? test['strategy']['matrix'] : undefined;
  if (!isDoc(matrix)) return undefined;
  return Object.keys(matrix).find((key) =>
    ['20', '22'].every((major) => list(matrix[key]).some((value) => new RegExp(`^${major}(\\D|$)`).test(text(value)))),
  );
}

const nodeMatrix = job('test', (test) => {
  const strategy = isDoc(test['strategy']) ? test['strategy'] : {};
  if (!isDoc(strategy['matrix'])) return 'The test job has no strategy: matrix:. List the Node versions there: node: [20, 22].';
  return nodeMatrixKey(test) === undefined ? 'The test job\'s matrix must list both Node 20 and Node 22.' : undefined;
});

const nodeFromMatrix = job('test', (test) => {
  const key = nodeMatrixKey(test);
  if (key === undefined) return 'The test job\'s matrix must list both Node 20 and Node 22.';
  const version = text(withOf(setupNode(test))['node-version']);
  return new RegExp(`\\$\\{\\{\\s*matrix\\.${escape(key)}\\s*\\}\\}`).test(version)
    ? undefined
    : `actions/setup-node still installs one fixed version: set node-version: \${{ matrix.${key} }} so each matrix job gets its own.`;
});

const npmCache = job('test', (test) =>
  text(withOf(setupNode(test))['cache']) === 'npm'
    ? undefined
    : 'Add cache: npm under the with: of actions/setup-node in the test job, so npm downloads are restored between runs.',
);

const matrixCache: Mission = {
  id: 'matrix-cache',
  number: '10.4',
  title: 'Two Node versions, one job',
  story:
    'Nova\'s desktop build ships Node 22 while the sync server still runs Node 20, and last month a bug only broke on 20. Every run also downloads every npm package again.',
  goal: 'Run the test job on a matrix of Node 20 and 22, feed the matrix value to actions/setup-node, and turn on its npm cache.',
  checks: [
    { label: 'The test job has a matrix with Node 20 and 22', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(nodeMatrix) },
    { label: 'actions/setup-node uses ${{ matrix.node }}', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(nodeFromMatrix) },
    { label: 'actions/setup-node has cache: npm', proof: 'git diff HEAD~1 -- .github', done: holds(npmCache) },
  ],
  validate: (state) => verdict(state, [CI], [...BASE, nodeMatrix, nodeFromMatrix, npmCache, actionsPinned, deployReadsSecret]),
  hints: [
    'A matrix copies a job once per value. The job reads the current value with ${{ matrix.<name> }}.',
    'Under the test job add strategy: / matrix: / node: [20, 22]. In actions/setup-node, with: takes node-version: ${{ matrix.node }} and cache: npm.',
    'nano .github/workflows/ci.yml: in test, above steps: add (4 spaces) strategy: / (6) matrix: / (8) node: [20, 22]; under setup-node with: write node-version: ${{ matrix.node }} and cache: npm — then git commit -am "ci: test on node 20 and 22 with npm cache".',
  ],
  par: 2,
  takeaway: 'strategy: matrix: runs one job per value, and cache: npm on setup-node restores downloads between runs.',
  theory: {
    title: 'Matrix builds and caching',
    body: 'strategy: matrix: node: [20, 22] turns one job into two parallel jobs, test (20) and test (22), each reading its value as ${{ matrix.node }}; by default one failure cancels the others (fail-fast). actions/setup-node with cache: npm saves the npm cache keyed on package-lock.json and restores it on the next run, so installs stop downloading the internet. For other folders, actions/cache does the same with your own key.',
    lesson: 'Matrix for versions, cache for speed.',
  },
  outcome: {
    summary:
      'Each push tests Nova on Node 20 and Node 22 in parallel, and npm downloads come from a cache. Version-specific bugs show up in CI instead of on the sync server, and runs get faster.',
    expect: {
      kind: 'file',
      path: CI,
      content: `  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test`,
    },
  },
  prelude: [],
  reference: [write(CI, CI_FILES.v4), 'git commit -am "ci: test on node 20 and 22 with npm cache"'],
  alternatives: [
    [
      write(
        CI,
        CI_FILES.v3.replace(
          '    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20',
          "    strategy:\n      fail-fast: false\n      matrix:\n        node-version: ['20.x', '22.x']\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: 'npm'",
        ),
      ),
      'git add .github',
      'git commit -m "ci: node matrix"',
    ],
  ],
};

// 10.5 Triggers -------------------------------------------------------------

/** Once a night: fixed minute and hour, every day. */
const nightly = (cron: string): boolean => {
  const fields = cron.trim().split(/\s+/);
  return (
    fields.length === 5 &&
    /^\d+$/.test(fields[0]!) &&
    /^\d+$/.test(fields[1]!) &&
    Number(fields[0]) < 60 &&
    Number(fields[1]) < 24 &&
    fields.slice(2).every((field) => field === '*')
  );
};

const manualAndNightly = ci((wf) => {
  const on = triggers(wf);
  if (!('workflow_dispatch' in on)) return 'Add workflow_dispatch: under on: so the Actions tab shows a Run workflow button.';
  const crons = list(on['schedule']).filter(isDoc).map((entry) => text(entry['cron']));
  if (crons.length === 0) return "Add a schedule: trigger under on:, a list with one cron line like - cron: '0 3 * * *'.";
  if (!crons.some(nightly)) {
    return `The cron '${crons[0]}' does not run once a night: use a fixed minute and hour and * for the other three fields, like '0 3 * * *'.`;
  }
  return undefined;
});

const prFiltered = ci((wf) => {
  const pr = triggers(wf)['pull_request'];
  if (!isDoc(pr) || !list(pr['branches']).map(text).includes('main')) {
    return 'Limit pull_request to pull requests into main: branches: [main] under pull_request:.';
  }
  if (!list(pr['paths-ignore']).map(text).includes('docs/**')) {
    return "Add paths-ignore: ['docs/**'] under pull_request: so docs-only pull requests skip CI.";
  }
  return undefined;
});

const triggersMission: Mission = {
  id: 'workflow-triggers',
  number: '10.5',
  title: 'When should it run?',
  story:
    'Ines writes the user guide in docs/, and each typo fix burns ten minutes of CI. Yanis wants a nightly run to catch broken dependencies and a button to rerun CI by hand.',
  goal: 'Add workflow_dispatch and a nightly schedule cron, and limit pull_request to branches: [main] with paths-ignore: [\'docs/**\'].',
  checks: [
    { label: 'workflow_dispatch and a nightly cron schedule', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(manualAndNightly) },
    { label: "pull_request: only into main, ignoring 'docs/**'", proof: 'git log -p -1 -- .github', done: holds(prFiltered) },
  ],
  validate: (state) => verdict(state, [CI], [...BASE, manualAndNightly, prFiltered, actionsPinned, deployReadsSecret]),
  hints: [
    'on: can be a map: each event gets its own settings. workflow_dispatch is the manual button, schedule takes cron lines.',
    "Turn on: into a map with push:, pull_request: (branches: [main], paths-ignore: ['docs/**']), workflow_dispatch: and schedule: - cron: '0 3 * * *'. Quote the cron: YAML reads a leading * as an alias.",
    "nano .github/workflows/ci.yml: on: / (2) push: / (2) pull_request: / (4) branches: [main] / (4) paths-ignore: ['docs/**'] / (2) workflow_dispatch: / (2) schedule: / (4) - cron: '0 3 * * *' — then git commit -am \"ci: manual, nightly and docs-free triggers\".",
  ],
  par: 2,
  takeaway: 'on: decides when a workflow runs: filter events with branches: and paths-ignore:, add schedule: for cron and workflow_dispatch: for a manual button.',
  theory: {
    title: 'Workflow triggers',
    body: 'Events under on: take filters: branches: limits pull_request to pull requests targeting those branches, and paths-ignore: skips runs when only matching files changed. schedule: runs on cron in UTC (minute hour day month weekday) on the default branch, and workflow_dispatch: adds a Run workflow button, also reachable with gh workflow run ci.yml. A required status check on a path-filtered workflow never reports on a docs-only pull request, so pick filters with branch protection in mind.',
    lesson: 'branches:, paths-ignore:, schedule:, workflow_dispatch:.',
  },
  outcome: {
    summary:
      'CI runs on pushes and on pull requests into main, skips docs-only pull requests, runs every night and has a manual button. CI minutes go where they catch real breakage.',
    expect: {
      kind: 'file',
      path: CI,
      content: `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
    paths-ignore:
      - 'docs/**'
  workflow_dispatch:
  schedule:
    - cron: '0 3 * * *'
permissions:
  contents: read
# ... jobs unchanged`,
    },
  },
  prelude: [
    {
      id: 'm10.5-p1',
      teammate: 'ines',
      commands: [write('docs/guide.md', FILES.guide), 'git add docs/guide.md', 'git commit -m "docs: user guide"'],
    },
  ],
  reference: [write(CI, CI_FILES.v5), 'git commit -am "ci: manual, nightly and docs-free triggers"'],
  alternatives: [
    [
      write(
        CI,
        CI_FILES.v4.replace(
          ON_1,
          `on:
  push:
  pull_request:
    branches: main
    paths-ignore: ["docs/**", "*.md"]
  schedule: [{ cron: "30 2 * * *" }]
  workflow_dispatch: {}`,
        ),
      ),
      'git add .github/workflows/ci.yml',
      'git commit -m "ci: more triggers"',
    ],
  ],
};

// 10.6 Concurrency, needs, if ------------------------------------------------

const MAIN_ONLY = /github\.ref\s*==\s*['"]refs\/heads\/main['"]|github\.ref_name\s*==\s*['"]main['"]/;

const cancelsSuperseded = ci((wf) => {
  const concurrency = wf['concurrency'];
  if (concurrency === undefined) return 'Add a top-level concurrency: block with group: and cancel-in-progress: true.';
  if (!isDoc(concurrency)) {
    return 'Write concurrency: as a map with group: and cancel-in-progress: true: the short string form only queues runs, it never cancels them.';
  }
  if (!/github\.(ref|ref_name|head_ref)\b/.test(text(concurrency['group']))) {
    return 'The concurrency group must include ${{ github.ref }}: otherwise a push to one branch cancels the runs of every other branch.';
  }
  return concurrency['cancel-in-progress'] === true ? undefined : 'Set cancel-in-progress: true so a new push cancels the run it replaces.';
});

const testAfterLint = job('test', (test) =>
  needsOf(test).includes('lint') ? undefined : 'The test job should wait for lint: add needs: lint to it.',
);
const deployAfterTest = job('deploy', (found) =>
  needsOf(found).includes('test') ? undefined : 'The deploy job must wait for the tests: add needs: test to it.',
);
const deployOnlyMain = job('deploy', (found) =>
  MAIN_ONLY.test(text(found['if']))
    ? undefined
    : "Add if: github.ref == 'refs/heads/main' to the deploy job so pull requests and other branches never deploy.",
);

const pipeline: Mission = {
  id: 'concurrency-needs',
  number: '10.6',
  title: 'Lint, then test, then deploy',
  story:
    'Lea pushes five fixups in a row and gets five full CI runs. Worse, the deploy job starts on every pull request, in parallel with the tests it should wait for.',
  goal: 'Add a concurrency group on github.ref that cancels superseded runs, make test need lint and deploy need test, and deploy only when github.ref is refs/heads/main.',
  checks: [
    { label: 'concurrency: cancels superseded runs of the same ref', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(cancelsSuperseded) },
    { label: 'lint → test → deploy with needs:', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(testAfterLint, deployAfterTest) },
    { label: 'deploy runs only on main', proof: 'git log -p -1 -- .github', done: holds(deployOnlyMain) },
  ],
  validate: (state) =>
    verdict(state, [CI], [...BASE, cancelsSuperseded, testAfterLint, deployAfterTest, deployOnlyMain, actionsPinned, deployReadsSecret]),
  hints: [
    'Jobs run in parallel unless one needs: another, and if: can skip a job entirely.',
    "concurrency: takes group: ci-${{ github.ref }} and cancel-in-progress: true. Add needs: lint to test, and needs: test plus if: github.ref == 'refs/heads/main' to deploy.",
    "nano .github/workflows/ci.yml: top level concurrency: / (2) group: ci-${{ github.ref }} / (2) cancel-in-progress: true; in test (4) needs: lint; in deploy (4) needs: test / (4) if: github.ref == 'refs/heads/main' — then git commit -am \"ci: lint, test, deploy main only\".",
  ],
  par: 2,
  takeaway: 'concurrency: cancels stale runs, needs: orders jobs, and if: decides whether a job runs at all.',
  theory: {
    title: 'Ordering and skipping jobs',
    body: 'Runs that share a concurrency group wait for each other, and cancel-in-progress: true cancels the older one; putting ${{ github.ref }} in the group keeps branches apart. needs: makes a job wait for others and skips it when they fail, so deploy never ships red code. if: is evaluated before the job starts, and github.ref == \'refs/heads/main\' keeps pull requests and other branches from deploying.',
    lesson: 'concurrency to cancel, needs to order, if to skip.',
  },
  outcome: {
    summary:
      'A new push cancels the stale run of the same branch, jobs run lint, then test, then deploy, and only main ever deploys. Pull requests can no longer ship code whose tests have not passed.',
    expect: {
      kind: 'file',
      path: CI,
      content: `concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    needs: lint
    runs-on: ubuntu-latest
    # ...
  lint:
    # ...
  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    # ...`,
    },
  },
  prelude: [],
  reference: [write(CI, CI_FILES.v6), 'git commit -am "ci: lint, test, deploy main only"'],
  alternatives: [
    [
      write(
        CI,
        CI_FILES.v5
          .replace(PERMISSIONS, `${PERMISSIONS}\nconcurrency:\n  group: \${{ github.workflow }}-\${{ github.head_ref || github.ref }}\n  cancel-in-progress: true`)
          .replace('  test:\n', '  test:\n    needs: [lint]\n')
          .replace('  deploy:\n', "  deploy:\n    needs: [lint, test]\n    if: ${{ github.ref_name == 'main' }}\n"),
      ),
      'git add -A',
      'git commit -m "ci: pipeline order"',
    ],
  ],
};

// 10.7 Dependabot and CODEOWNERS ------------------------------------------------

const dependabotWeekly = yamlRule(DEPENDABOT, (doc) => {
  if (Number(doc['version']) !== 2) return 'dependabot.yml must start with version: 2.';
  const updates = list(doc['updates']).filter(isDoc);
  for (const ecosystem of ['npm', 'github-actions']) {
    const entry = updates.find((update) => text(update['package-ecosystem']) === ecosystem);
    if (entry === undefined) return `dependabot.yml has no updates: entry with package-ecosystem: ${ecosystem}.`;
    if (text(entry['directory']) === '' && list(entry['directories']).length === 0) {
      return `The ${ecosystem} entry needs directory: / (where Dependabot looks for its files).`;
    }
    if (!isDoc(entry['schedule']) || text(entry['schedule']['interval']) !== 'weekly') {
      return `The ${ecosystem} entry needs schedule: with interval: weekly.`;
    }
  }
  return undefined;
});

/** Owners of a path: the last matching line wins. ponytail: only *, dir/, dir/* and dir/** patterns; enough for this story. */
function ownersOf(codeowners: string, path: string): string[] {
  let owners: string[] = [];
  for (const line of codeowners.split('\n')) {
    const [pattern, ...rest] = line.trim().split(/\s+/);
    if (pattern === undefined || pattern === '' || pattern.startsWith('#')) continue;
    const base = pattern.replace(/^\//, '').replace(/\*+$/, '').replace(/\/$/, '');
    if (base === '' || path === base || path.startsWith(`${base}/`)) owners = rest;
  }
  return owners;
}

const syncOwners: Rule = (read) => {
  const file = read(CODEOWNERS);
  if (file === undefined) return `Create ${CODEOWNERS}.`;
  const syncFile = 'src/sync/engine.js';
  if (!ownersOf(file, syncFile).includes('@nova/sync')) {
    const syncLines = file.split('\n').filter((line) => line.includes('@nova/sync'));
    if (syncLines.length === 0) return 'Add a line to .github/CODEOWNERS: /src/sync/ @nova/sync';
    return syncLines.some((line) => ownersOf(line, syncFile).length > 0)
      ? 'A later line in CODEOWNERS also matches src/sync/ and wins: put the /src/sync/ line below the * line.'
      : 'The @nova/sync line does not match src/sync/: write it as /src/sync/ @nova/sync.';
  }
  return ownersOf(file, NOTES).includes('@nova/core') ? undefined : 'Keep the * @nova/core line: the rest of the code still needs an owner.';
};

const automationConfig: Mission = {
  id: 'dependabot-codeowners',
  number: '10.7',
  title: 'Robots for updates, owners for review',
  story:
    'Nobody noticed actions/checkout v5 or the security fix in eslint for months. Samir also wants every change under src/sync/ reviewed by the sync team, not by whoever is free.',
  goal: 'Commit .github/dependabot.yml (version 2, npm and github-actions, weekly) and route src/sync/ to @nova/sync in .github/CODEOWNERS.',
  checks: [
    { label: 'Dependabot checks npm and github-actions weekly', proof: 'git show HEAD:.github/dependabot.yml', done: holds(dependabotWeekly) },
    { label: 'CODEOWNERS sends src/sync/ to @nova/sync', proof: 'git show HEAD:.github/CODEOWNERS', done: holds(syncOwners) },
  ],
  validate: (state) => verdict(state, [DEPENDABOT, CODEOWNERS], [dependabotWeekly, syncOwners]),
  hints: [
    'Both files live in .github/. Dependabot reads a list of updates:, CODEOWNERS reads pattern-then-owners lines where the last match wins.',
    'dependabot.yml: version: 2, then updates: with one entry per package-ecosystem (npm, github-actions), each with directory: / and schedule: interval: weekly. In CODEOWNERS add /src/sync/ @nova/sync below the * line.',
    'nano .github/dependabot.yml with: version: 2 / updates: / (2) - package-ecosystem: npm / (4) directory: / / (4) schedule: / (6) interval: weekly / and the same entry for github-actions; nano .github/CODEOWNERS and add /src/sync/ @nova/sync at the end; git add .github, git commit -m "chore: dependabot and sync code owners".',
  ],
  par: 4,
  takeaway: 'Dependabot opens update pull requests on a schedule, and CODEOWNERS requests the right reviewers (the last matching line wins).',
  theory: {
    title: 'Dependabot and CODEOWNERS',
    body: 'Dependabot reads .github/dependabot.yml and opens a pull request whenever a dependency of a listed package-ecosystem has a new version; the github-actions ecosystem also bumps the uses: lines, SHA pins included. CODEOWNERS (in .github/, the root or docs/) maps path patterns to users or teams, the last matching line wins, and GitHub requests their review on every pull request that touches those paths. With branch protection set to require code owner review, their approval becomes mandatory.',
    lesson: 'Dependabot keeps you current, CODEOWNERS routes reviews.',
  },
  outcome: {
    summary:
      'Dependabot will open a pull request each week for outdated npm packages and actions, and every change under src/sync/ asks the sync team for review. Updates and the right reviewers arrive without anyone remembering to ask.',
    expect: {
      kind: 'file',
      path: DEPENDABOT,
      content: `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly`,
    },
  },
  prelude: [
    {
      id: 'm10.7-p1',
      teammate: 'lea',
      commands: [write(CODEOWNERS, FILES.codeownersCore), `git add ${CODEOWNERS}`, 'git commit -m "chore: core team owns everything"'],
    },
  ],
  reference: [
    write(DEPENDABOT, DEPENDABOT_FILE),
    `append ${CODEOWNERS} "/src/sync/ @nova/sync"`,
    'git add .github',
    'git commit -m "chore: dependabot and sync code owners"',
  ],
  alternatives: [
    [
      write(CODEOWNERS, '* @nova/core\nsrc/sync/** @nova/sync @samir'),
      'git commit -am "chore: sync team owns src/sync"',
      write(
        DEPENDABOT,
        `version: 2
updates:
  - { package-ecosystem: "github-actions", directory: "/", schedule: { interval: "weekly" } }
  - package-ecosystem: "npm"
    directories: ["/"]
    schedule:
      interval: "weekly"
      day: "monday"`,
      ),
      `git add ${DEPENDABOT}`,
      'git commit -m "chore: dependabot"',
    ],
  ],
};

// 10.8 Read a failed run ----------------------------------------------------

const testUntouched: Rule = (read) =>
  read(TEST) === FILES.test
    ? undefined
    : 'Put test/notes.test.js back the way it was: the test is right, src/notes.js is wrong.';

const titleTrimmed: Rule = (read) =>
  /\btitle\b[^,\n]*\.trim\(\)/.test(read(NOTES) ?? '')
    ? undefined
    : "createNote in src/notes.js no longer trims the title: that is why 'title is trimmed' fails in logs/ci-run-1234.txt.";

const tagsKept: Rule = (read) =>
  ((read(NOTES) ?? '').match(/\btags\b/g)?.length ?? 0) >= 2
    ? undefined
    : "Keep Samir's tags parameter: fix the title instead of undoing his whole change.";

const failedRun: Mission = {
  id: 'read-failed-run',
  number: '10.8',
  title: 'Red cross on main',
  story:
    'Samir\'s last commit turned main red. Lea saved the failing CI log to logs/ci-run-1234.txt, since you cannot open GitHub from here.',
  goal: 'Read logs/ci-run-1234.txt, find the failing test, fix the code (not the test) in src/notes.js and commit.',
  checks: [
    { label: 'createNote trims the title again (committed)', proof: 'git show HEAD:src/notes.js', done: holds(titleTrimmed) },
    {
      label: "Samir's tags stay, and the test is untouched",
      proof: 'git diff HEAD~1 --stat',
      done: holds(titleTrimmed, tagsKept, testUntouched),
    },
  ],
  validate: (state) => verdict(state, [NOTES, TEST], [testUntouched, titleTrimmed, tagsKept]),
  hints: [
    'A CI log is long, but the answer is near the words "not ok" or "Error". The test file shows what was expected, git log -p shows what changed.',
    "The log says 'title is trimmed' fails at test/notes.test.js. git show HEAD shows Samir dropped .trim() from createNote in src/notes.js. Fix that line, keep his tags.",
    "less logs/ci-run-1234.txt, git show HEAD, nano src/notes.js (title: title.trim()), git commit -am \"fix(notes): trim the title again\".",
  ],
  par: 3,
  takeaway: 'Read a failed run from the bottom up: find the first failing test, compare expected and actual, fix the code, not the test.',
  theory: {
    title: 'Reading a failed run',
    body: 'On GitHub, gh run list shows recent runs and gh run view <id> --log-failed prints only the logs of the failed steps, the same text as logs/ci-run-1234.txt. Look for the first failure, read expected versus actual, then git log -p or git show on the suspect commit tells you what changed. If the failure is flaky rather than real, gh run rerun --failed retries just the failed jobs.',
    lesson: 'gh run view --log-failed, then fix the code.',
  },
  outcome: {
    summary:
      'createNote trims titles again while keeping Samir\'s tags, and the test stays exactly as written. The failing test was right, so the code changes, and main goes back to green.',
    expect: {
      kind: 'file',
      path: NOTES,
      content: `export const createNote = (title, body = '', tags = []) => ({ title: title.trim(), body, tags });
export const countWords = (text) => text.split(/\\s+/).filter(Boolean).length;`,
    },
  },
  prelude: [
    {
      id: 'm10.8-p1',
      teammate: 'samir',
      commands: [write(NOTES, FILES.notesBug), 'git commit -am "feat(notes): add tags to notes"'],
    },
    { id: 'm10.8-p2', commands: [write('logs/ci-run-1234.txt', FILES.log)] },
  ],
  reference: [write(NOTES, FILES.notesFixed), 'git add src/notes.js', 'git commit -m "fix(notes): trim the title again"'],
  alternatives: [
    [
      write(NOTES, FILES.notesBug.replace('({ title, body, tags })', '({ title: String(title).trim(), body, tags })')),
      'git commit -am "fix: restore title trimming"',
    ],
  ],
};

// 10.9 Capstone: CI is red after the upgrade (production repo) --------------

/** Replaces exactly one occurrence of `find`; throws at import when the production workflow drifts. */
function swap(text: string, find: string, replace: string): string {
  if (!text.includes(find)) throw new Error(`level10: "${find}" not found in the production ci.yml`);
  return text.replace(find, () => replace);
}

const CODECOV_LEAK = 'codecov_FAKE_9b2e7d41c0a3';
const PROD_CI = NOVA_FILES[CI] ?? '';
const codecovStep = (token: string, ref = 'v4'): string =>
  `      - uses: codecov/codecov-action@${ref}\n        with:\n          token: ${token}\n          files: coverage/lcov.info\n`;

/** Yanis's "upgrade": Node 24, a Codecov upload with a pasted token, floating refs, and no npm cache. */
const PROD_CI_BROKEN = [
  (text: string) => swap(text, 'node-version: [20, 22]', 'node-version: [20, 22, 24]'),
  (text: string) => swap(text, 'actions/checkout@v4', 'actions/checkout@main'),
  (text: string) => swap(text, 'actions/setup-node@v4', 'actions/setup-node@latest'),
  (text: string) => swap(text, '          cache: npm\n', ''),
  (text: string) => swap(text, '      - run: npm test\n', `      - run: npm test\n${codecovStep(CODECOV_LEAK, 'master')}`),
].reduce((text, change) => change(text), PROD_CI);

const PROD_CI_FIXED = swap(
  [
    (text: string) => swap(text, 'node-version: [20, 22]', 'node-version: [20, 22, 24]'),
    (text: string) => swap(text, '      - run: npm test\n', `      - run: npm test\n${codecovStep('${{ secrets.CODECOV_TOKEN }}')}`),
  ].reduce((text, change) => change(text), PROD_CI),
  '\njobs:\n',
  `\n${PERMISSIONS}\n\njobs:\n`,
);

const SECRET_EXPR = /^\$\{\{\s*secrets\.[A-Za-z0-9_]+\s*\}\}$/;

const noCodecovLeak: Rule = (read) =>
  read(CI)?.includes(CODECOV_LEAK) ? `ci.yml still contains the Codecov token ${CODECOV_LEAK}: delete it from the file.` : undefined;

const codecovFromSecrets = ci((wf) => {
  const jobs = isDoc(wf['jobs']) ? Object.values(wf['jobs']).filter(isDoc) : [];
  const owner = jobs.find((found) => stepsOf(found).some((step) => actionOf(step) === 'codecov/codecov-action'));
  if (owner === undefined) return 'Keep the codecov/codecov-action step: the team still wants coverage reports.';
  const step = stepsOf(owner).find((found) => actionOf(found) === 'codecov/codecov-action')!;
  const envs = [wf['env'], owner['env'], step['env']].filter(isDoc);
  const values = [withOf(step)['token'], ...envs.map((env) => env['CODECOV_TOKEN'])].map(text).filter((value) => value !== '');
  return values.some((value) => SECRET_EXPR.test(value))
    ? undefined
    : 'The Codecov step must read its token from a repository secret: token: ${{ secrets.CODECOV_TOKEN }}.';
});

const CI_RED_RULES: readonly Rule[] = [...BASE, actionsPinned, readOnlyToken, npmCache, noCodecovLeak, codecovFromSecrets];

const ciRedAfterUpgrade: Mission = {
  id: 'ci-red-after-upgrade',
  number: '10.9',
  title: 'CI is red after the upgrade',
  capstone: true,
  story:
    'Yanis "upgraded" the Nova monorepo\'s CI for Node 24 on Friday, and every run since has failed. The security review adds that his commit pasted the Codecov token into ci.yml, follows actions from moving branches, gives GITHUB_TOKEN default permissions, and dropped the npm cache. Bring ci.yml back to the team\'s standards before anyone merges again.',
  goal: 'Commit a ci.yml that keeps Node 24 and the Codecov upload but meets the team\'s Actions standards, and make sure the leaked token gets rotated.',
  checks: [
    { label: 'Every action is pinned to a release tag or a full commit SHA', proof: 'git grep -n "uses:" HEAD -- .github', done: holds(actionsPinned) },
    { label: 'permissions: contents: read at the top of ci.yml', proof: 'git show HEAD:.github/workflows/ci.yml', done: holds(readOnlyToken) },
    { label: 'actions/setup-node restores the npm cache again', proof: 'git diff HEAD~1 -- .github', done: holds(npmCache) },
    {
      label: 'The Codecov token comes from secrets, and the commit says to rotate it',
      proof: 'git log -1 --format=%B',
      done: (state, ctx) => holds(noCodecovLeak, codecovFromSecrets)(state) && rotationNoted(state, ctx),
    },
  ],
  validate: (state, ctx) => {
    const files = verdict(state, [CI], CI_RED_RULES);
    if (!files.ok) return files;
    return check(
      rotationNoted(state, ctx),
      'Say in a commit message that the Codecov token must be rotated: it is still in Yanis\'s commit, so removing it from the file is not enough.',
    );
  },
  hints: [
    'Read the diff of Yanis\'s commit: each problem is one line or one missing line, and every one of them was a lesson of this level.',
    'Pin checkout and setup-node to @v4 (there is no @latest tag) and Codecov to @v4 or a SHA, put the token in ${{ secrets.CODECOV_TOKEN }}, add a top-level permissions: contents: read, and cache: npm under setup-node. Mention the rotation in the commit message.',
    'git show HEAD, nano .github/workflows/ci.yml: @main and @latest to @v4, @master to @v4, token: ${{ secrets.CODECOV_TOKEN }}, add permissions: / (2 spaces) contents: read above jobs:, add cache: npm under node-version — then git commit -am "ci: fix the Node 24 upgrade" -m "Rotate the Codecov token: the old one is in history."',
  ],
  par: 2,
  takeaway: 'A workflow change is code: review it for floating refs, pasted secrets, token permissions and caching before it merges.',
  theory: {
    title: 'Reviewing a workflow like production code',
    body: 'Every rule of this level fails in one innocent-looking upgrade: @main and @latest run whatever is pushed next (or nothing at all), a pasted token is leaked for good and must be rotated, missing permissions: hands GITHUB_TOKEN more than CI needs, and a dropped cache: npm makes every run slower. git show on the commit that turned CI red is usually the fastest way to see what changed. Dependabot for github-actions and CODEOWNERS on .github/ then keep the next upgrade honest.',
    lesson: 'Pinned, least privilege, secrets only, cached.',
  },
  outcome: {
    summary:
      'ci.yml keeps Node 24 and the coverage upload but is pinned, least-privilege, cached and secret-free again, and the commit asks for the Codecov token to be rotated. A workflow upgrade gets the same review as production code.',
    expect: {
      kind: 'file',
      path: CI,
      content: `permissions:
  contents: read

jobs:
  test:
    # ...
        node-version: [20, 22, 24]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      # ...
      - uses: codecov/codecov-action@v4
        with:
          token: \${{ secrets.CODECOV_TOKEN }}
          files: coverage/lcov.info`,
    },
  },
  root: productionRepo({ remote: false }),
  prelude: [
    {
      id: 'm10.9-p1',
      teammate: 'yanis',
      commands: [write(CI, PROD_CI_BROKEN), 'git commit -am "ci: upgrade the workflow for Node 24"'],
    },
  ],
  reference: [
    write(CI, PROD_CI_FIXED),
    'git commit -am "ci: fix the Node 24 upgrade" -m "Pin every action, read the Codecov token from secrets, use a read-only token and restore the npm cache. Rotate the Codecov token: the old one is in history."',
  ],
  alternatives: [
    [
      write(
        CI,
        swap(
          swap(
            swap(
              swap(PROD_CI_BROKEN, 'actions/checkout@main', 'actions/checkout@v4.2.2'),
              'actions/setup-node@latest\n        with:\n',
              'actions/setup-node@v4\n        with:\n          cache: npm\n',
            ),
            `codecov/codecov-action@master\n        with:\n          token: ${CODECOV_LEAK}\n`,
            'codecov/codecov-action@0565863a31f2c772f9f0395002a31e3f06189574 # v5.4.0\n        env:\n          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}\n        with:\n',
          ),
          'name: CI\n',
          'name: CI\npermissions: { contents: read }\n',
        ),
      ),
      'git add .github',
      'git commit -m "ci: pin actions and move the Codecov token to secrets (rotated)"',
    ],
  ],
};

export const level10: Level = {
  id: 'actions',
  number: 10,
  title: 'GitHub Actions and automation',
  topics: 'Workflows, triggers, secrets, matrix, caching, Dependabot, CODEOWNERS',
  planned: 9,
  root: ROOT_COMMANDS,
  missions: [firstWorkflow, pinActions, secrets, matrixCache, triggersMission, pipeline, automationConfig, failedRun, ciRedAfterUpgrade],
};

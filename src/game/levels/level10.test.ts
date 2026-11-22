/**
 * Wrong turns of Level 10 (the harness only proves the right ones): each must fail with a precise reason.
 * Pure: a fake RepoState with one commit, no git.
 */
import { expect, it } from 'vitest';
import { CI_FILES, FILES, level10 } from './level10';

import type { RepoState } from '../../shared/repo-types';
import type { MissionContext } from '../model';

const CI = '.github/workflows/ci.yml';

function repo(committed: Record<string, string>, disk: Record<string, string> = committed): RepoState {
  const commit = { hash: 'h', parents: [], message: 'x', snapshot: committed, author: { name: 'p', email: 'p@x' }, timestamp: 0 };
  const worktree = { id: 'w', path: '~', isMain: true, head: { kind: 'branch', branch: 'main' }, index: committed, workingDir: disk };
  return { commits: { h: commit }, branches: { main: 'h' }, worktrees: { w: worktree }, activeWorktree: 'w' } as unknown as RepoState;
}

const ctx = { entryCommits: new Set<string>(), facts: {}, commands: [] } as unknown as MissionContext;
const reason = (id: string, files: Record<string, string>, disk?: Record<string, string>) =>
  level10.missions.find((m) => m.id === id)!.validate(repo(files, disk), ctx).reason;

it('10.1 names the missing step, the wrong order, and uncommitted work', () => {
  expect(reason('first-workflow', { [CI]: CI_FILES.v1.replace('      - uses: actions/setup-node@v4\n', '') })).toBe(
    'The test job has no actions/setup-node step.',
  );
  expect(reason('first-workflow', { [CI]: CI_FILES.v1.replace('- run: npm ci\n      - run: npm test', '- run: npm test\n      - run: npm ci') })).toBe(
    'In the test job, npm ci must run before npm test.',
  );
  expect(reason('first-workflow', {}, { [CI]: CI_FILES.v1 })).toMatch(/^Commit \.github\/workflows\/ci\.yml/);
  expect(reason('first-workflow', { [CI]: 'on: push\njobs:\n\ttest: {}' })).toMatch(/not valid YAML/);
  expect(reason('first-workflow', { [CI]: CI_FILES.v1 })).toBeUndefined();
});

it('10.2 rejects branch refs and short SHAs', () => {
  expect(reason('pin-actions', { [CI]: CI_FILES.v2.replace('annotate@v2', 'annotate@main') })).toMatch(/octo-lint\/annotate@main/);
  expect(reason('pin-actions', { [CI]: CI_FILES.v2.replace('annotate@v2', 'annotate@b4ffde6') })).toMatch(/full commit SHA/);
  expect(reason('pin-actions', { [CI]: CI_FILES.v2.replace('contents: read', 'contents: write') })).toMatch(/contents: read/);
});

it('10.3 refuses the secret inlined in run:', () => {
  const inline = CI_FILES.v3.replace('- run: npm run deploy\n        env:\n          DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}', '- run: npm run deploy -- --token ${{ secrets.DEPLOY_TOKEN }}');
  expect(reason('actions-secrets', { [CI]: inline })).toMatch(/through env:/);
});

it('10.5 rejects a cron that is not nightly', () => {
  expect(reason('workflow-triggers', { [CI]: CI_FILES.v5.replace("'0 3 * * *'", "'*/5 * * * *'") })).toMatch(/does not run once a night/);
});

it('10.7 knows the last CODEOWNERS line wins', () => {
  const files = { '.github/dependabot.yml': 'version: 2\nupdates:\n  - {package-ecosystem: npm, directory: /, schedule: {interval: weekly}}\n  - {package-ecosystem: github-actions, directory: /, schedule: {interval: weekly}}' };
  expect(reason('dependabot-codeowners', { ...files, '.github/CODEOWNERS': '/src/sync/ @nova/sync\n* @nova/core' })).toMatch(/later line/);
  expect(reason('dependabot-codeowners', { ...files, '.github/CODEOWNERS': '* @nova/core\n/src/sync/ @nova/sync' })).toBeUndefined();
});

it('10.8 refuses a fix made in the test', () => {
  const files = { 'src/notes.js': FILES.notesBug, 'test/notes.test.js': FILES.test.replace("'Groceries');", "'  Groceries ');") };
  expect(reason('read-failed-run', files)).toMatch(/the test is right/);
});

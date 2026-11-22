/**
 * State-based validation helpers, ported from the web game (engine/validate.ts,
 * story/preconditions.ts). They read a RepoState (and the mission context) only.
 */
import type { Commit, FileTree, RepoState, Worktree } from '../shared/repo-types';
import type { MissionContext } from './model';

export type { MissionContext } from './model';

export interface ValidationResult {
  readonly ok: boolean;
  readonly reason?: string;
}

export function check(condition: boolean, reason: string): ValidationResult {
  return condition ? { ok: true } : { ok: false, reason };
}

/** Every result must pass; the first failure gives the reason. */
export function allOf(...results: readonly ValidationResult[]): ValidationResult {
  return results.find((result) => !result.ok) ?? { ok: true };
}

export function activeWorktree(state: RepoState): Worktree | undefined {
  return state.worktrees[state.activeWorktree];
}

export function headBranch(state: RepoState): string | undefined {
  const head = activeWorktree(state)?.head;
  return head?.kind === 'branch' ? head.branch : undefined;
}

export function headCommit(state: RepoState): string | undefined {
  const head = activeWorktree(state)?.head;
  if (head === undefined) return undefined;
  return head.kind === 'branch' ? state.branches[head.branch] : head.commit;
}

export function snapshotOf(state: RepoState, hash: string | undefined): FileTree {
  return hash === undefined ? {} : (state.commits[hash]?.snapshot ?? {});
}

export function headSnapshot(state: RepoState): FileTree {
  return snapshotOf(state, headCommit(state));
}

export function headFile(state: RepoState, path: string): string | undefined {
  return headSnapshot(state)[path];
}

export function indexFile(state: RepoState, path: string): string | undefined {
  return activeWorktree(state)?.index[path];
}

export function workingFile(state: RepoState, path: string): string | undefined {
  return activeWorktree(state)?.workingDir[path];
}

export function commitList(state: RepoState): Commit[] {
  return Object.values(state.commits).sort((left, right) => left.timestamp - right.timestamp);
}

/** Same rule as the web engine's worktreeStatus: nothing staged, modified or untracked. */
export function isWorkingTreeClean(state: RepoState): boolean {
  const worktree = activeWorktree(state);
  if (worktree === undefined) return false;
  const head = headSnapshot(state);
  const { index, workingDir } = worktree;
  const paths = new Set([...Object.keys(head), ...Object.keys(index), ...Object.keys(workingDir)]);
  for (const path of paths) {
    if (head[path] !== index[path]) return false; // staged
    if (index[path] !== undefined && index[path] !== workingDir[path]) return false; // unstaged
    if (index[path] === undefined && workingDir[path] !== undefined) return false; // untracked
  }
  return true;
}

/** Commits present in `state` but not at mission entry. */
export function commitsSince(state: RepoState, ctx: MissionContext): Commit[] {
  return commitList(state).filter((commit) => !ctx.entryCommits.has(commit.hash));
}

export function commitDelta(state: RepoState, ctx: MissionContext): number {
  return commitsSince(state, ctx).length;
}

/**
 * Pure view building: RepoState + progress → the pieces of WorkspaceView.
 */
import { parse } from 'yaml';
import type { Commit, FileTree, RepoState } from '../shared/repo-types';
import type {
  AreaFile,
  CheckView,
  CommitView,
  LearningPath,
  LevelSummary,
  PanelData,
  RemoteBranchView,
  SnapshotFile,
  WorkflowView,
  WorkspaceView,
} from '../shared/view-model';
import { AGENTS_ORDER, LEVELS, missionById, type Mission } from './content';
import { lessonFor } from './lessons';
import type { PanelKind, RepoFacts } from './model';
import type { Attempt, Progress } from './progress';
import { activeWorktree, headBranch, headCommit, headSnapshot } from './validate';

/** "v2" stays; other content shows its first line, cut at ~18 chars with "…". */
export function versionLabel(content: string): string {
  if (/^v\d+$/.test(content)) return content;
  const lines = content.split('\n');
  const first = lines[0] ?? '';
  if (first.length <= 18 && lines.length === 1) return first;
  return `${first.slice(0, 18).trimEnd()}…`;
}

export function homeLabel(fullPath: string, home: string): string {
  if (fullPath === home) return '~';
  return fullPath.startsWith(`${home}/`) ? `~${fullPath.slice(home.length)}` : fullPath;
}

/** `base` null = root commit: nothing is marked changed (drawn muted). */
function snapshotFiles(tree: FileTree, base: FileTree | null): SnapshotFile[] {
  return Object.keys(tree)
    .sort()
    .map((path) => {
      const content = tree[path] as string;
      return { path, version: versionLabel(content), changed: base !== null && base[path] !== content };
    });
}

/** Branch names with main first, then alphabetical. */
function sortedBranches(state: RepoState): string[] {
  return Object.keys(state.branches).sort((a, b) =>
    a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b),
  );
}

/** Newest first, children always before their parents, ties by timestamp. */
function topoOrder(state: RepoState): Commit[] {
  const commits = Object.values(state.commits);
  const children = new Map<string, number>();
  for (const commit of commits) {
    for (const parent of commit.parents) children.set(parent, (children.get(parent) ?? 0) + 1);
  }
  const ready = commits.filter((commit) => !children.has(commit.hash));
  const out: Commit[] = [];
  while (ready.length > 0) {
    // ponytail: O(n²) pick of the newest ready commit; fine for story-sized repos.
    ready.sort((a, b) => b.timestamp - a.timestamp);
    const next = ready.shift() as Commit;
    out.push(next);
    for (const parent of next.parents) {
      const left = (children.get(parent) ?? 0) - 1;
      children.set(parent, left);
      const commit = state.commits[parent];
      if (left === 0 && commit !== undefined) ready.push(commit);
    }
  }
  return out;
}

export function buildCommits(state: RepoState): CommitView[] {
  const branches = sortedBranches(state);
  const head = headCommit(state);
  const attached = headBranch(state);

  // Lanes: walk first parents from each branch tip, main first.
  const lane = new Map<string, string>();
  for (const branch of branches) {
    let hash: string | undefined = state.branches[branch];
    while (hash !== undefined && !lane.has(hash)) {
      lane.set(hash, branch);
      hash = state.commits[hash]?.parents[0];
    }
  }

  // Reachable from any branch, HEAD or remote-tracking ref.
  const reachable = new Set<string>();
  const tips = [
    ...Object.values(state.branches),
    ...Object.values(state.remoteTracking ?? {}),
    ...(head === undefined ? [] : [head]),
  ];
  while (tips.length > 0) {
    const hash = tips.pop() as string;
    if (reachable.has(hash)) continue;
    const commit = state.commits[hash];
    if (commit === undefined) continue;
    reachable.add(hash);
    tips.push(...commit.parents);
  }

  return topoOrder(state).map((commit) => {
    const refs: string[] = [];
    if (commit.hash === head) refs.push(attached === undefined ? 'HEAD' : `HEAD → ${attached}`);
    for (const branch of branches) {
      if (state.branches[branch] === commit.hash && branch !== attached) refs.push(branch);
    }
    for (const [ref, hash] of Object.entries(state.remoteTracking ?? {}).sort()) {
      if (hash === commit.hash) refs.push(ref);
    }
    const parent = commit.parents[0];
    return {
      hash: commit.hash,
      short: commit.hash.slice(0, 7),
      message: commit.message,
      author: commit.author.name,
      parents: commit.parents,
      lane: lane.get(commit.hash) ?? commit.branch ?? null,
      refs,
      isHead: commit.hash === head,
      reachable: reachable.has(commit.hash),
      snapshot: snapshotFiles(commit.snapshot, parent === undefined ? null : (state.commits[parent]?.snapshot ?? null)),
    };
  });
}

export function buildAreas(state: RepoState): AreaFile[] {
  const worktree = activeWorktree(state);
  if (worktree === undefined) return [];
  const head = headSnapshot(state);
  const paths = new Set([...Object.keys(worktree.workingDir), ...Object.keys(worktree.index), ...Object.keys(head)]);
  const label = (content: string | undefined) => (content === undefined ? null : versionLabel(content));
  return [...paths].sort().map((path) => ({
    path,
    disk: label(worktree.workingDir[path]),
    index: label(worktree.index[path]),
    head: label(head[path]),
  }));
}

/** What `git commit` would save now, or null when the index equals HEAD. */
export function buildNextCommit(state: RepoState): SnapshotFile[] | null {
  const worktree = activeWorktree(state);
  if (worktree === undefined) return null;
  const head = headSnapshot(state);
  const index = worktree.index;
  const keys = new Set([...Object.keys(head), ...Object.keys(index)]);
  const differs = [...keys].some((path) => head[path] !== index[path]);
  return differs ? snapshotFiles(index, head) : null;
}

export function buildRepoParts(
  state: RepoState | null,
): Pick<WorkspaceView, 'commits' | 'nextCommit' | 'branches' | 'headBranch' | 'areas'> {
  if (state === null || !state.initialized) {
    return { commits: [], nextCommit: null, branches: [], headBranch: null, areas: [] };
  }
  const attached = headBranch(state) ?? null;
  return {
    commits: buildCommits(state),
    nextCommit: buildNextCommit(state),
    branches: sortedBranches(state).map((name) => ({
      name,
      hash: state.branches[name] as string,
      current: name === attached,
    })),
    headBranch: attached,
    areas: buildAreas(state),
  };
}

// Topic panels ------------------------------------------------------------------

/** What fits under each level's missions. */
const LEVEL_PANELS: Readonly<Record<number, readonly PanelKind[]>> = {
  0: ['config'],
  1: ['history', 'areas'],
  2: ['history'],
  3: ['history', 'remote'],
  4: ['history', 'stash-reflog'],
  5: ['history'],
  6: ['history', 'worktrees'],
  7: ['history', 'remote'],
  8: ['history', 'remote'],
  9: ['history', 'worktrees'],
  10: ['workflow'],
  11: ['history', 'remote'],
};

/** Missions whose topic is not the level's usual one (kept here so level files stay content only). */
export const MISSION_PANELS: Readonly<Record<string, readonly PanelKind[]>> = {
  // Level 4: working-directory and index undos, and the ones that push.
  'discard-edit': ['history', 'areas'],
  unstage: ['history', 'areas'],
  'amend-last-commit': ['history', 'areas'],
  'reset-soft-split': ['history', 'areas'],
  'revert-shared': ['history', 'remote'],
  'pushed-secret': ['history', 'remote'],
  'secret-before-push': ['history', 'remote'],
  // Level 6: only the worktree missions need the worktree cards.
  'pre-commit-hook': ['history'],
  'gitattributes-eol': ['history'],
  'open-the-box': ['history'],
  'git-notes': ['history'],
  'commit-trailers': ['history'],
  'submodule-icons': ['history'],
  // Level 9: cleaning up what the agent left on disk.
  'agent-red-flags': ['history', 'areas'],
  'agent-keep-the-good': ['history', 'areas'],
  'agent-checkpoint': ['history', 'areas'],
};

export function missionPanels(mission: Mission, levelNumber: number | undefined): readonly PanelKind[] {
  return mission.panels ?? MISSION_PANELS[mission.id] ?? LEVEL_PANELS[levelNumber ?? -1] ?? ['history', 'areas'];
}

function ancestors(state: RepoState, tip: string): Set<string> {
  const seen = new Set<string>();
  const stack = [tip];
  while (stack.length > 0) {
    const hash = stack.pop() as string;
    const commit = state.commits[hash];
    if (seen.has(hash) || commit === undefined) continue;
    seen.add(hash);
    stack.push(...commit.parents);
  }
  return seen;
}

/** Every local branch and every origin/* branch, main first: tips on both sides and how far apart they are. */
export function buildRemote(state: RepoState): RemoteBranchView[] {
  const tracking = state.remoteTracking ?? {};
  const names = new Set([
    ...Object.keys(state.branches),
    ...Object.keys(tracking).filter((ref) => ref.startsWith('origin/')).map((ref) => ref.slice('origin/'.length)),
  ]);
  return [...names]
    .sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)))
    .map((branch) => {
      const local = state.branches[branch] ?? null;
      const remote = tracking[`origin/${branch}`] ?? null;
      let ahead = 0;
      let behind = 0;
      if (local !== null && remote !== null && local !== remote) {
        const mine = ancestors(state, local);
        const theirs = ancestors(state, remote);
        ahead = [...mine].filter((hash) => !theirs.has(hash)).length;
        behind = [...theirs].filter((hash) => !mine.has(hash)).length;
      }
      return { branch, local, remote, ahead, behind, upstream: state.upstream?.[branch] ?? null };
    });
}

const text = (value: unknown): string => (typeof value === 'string' ? value : value === undefined || value === null ? '' : JSON.stringify(value));

/** Jobs of one workflow file, with their `needs` and one label per step (name, else uses, else the run line). */
export function parseWorkflow(file: string, source: string): WorkflowView {
  let doc: unknown;
  try {
    doc = parse(source);
  } catch (e) {
    const message = e instanceof Error ? (e.message.split('\n')[0] ?? '') : String(e);
    return { file, jobs: [], error: `The YAML does not parse: ${message}` };
  }
  const jobs = (doc as { jobs?: unknown } | null)?.jobs;
  if (typeof jobs !== 'object' || jobs === null || Array.isArray(jobs)) return { file, jobs: [], error: 'No jobs: section yet.' };
  return {
    file,
    error: null,
    jobs: Object.entries(jobs as Record<string, unknown>).map(([id, raw]) => {
      const job = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const needs = job.needs;
      const steps = Array.isArray(job.steps) ? job.steps : [];
      return {
        id,
        needs: Array.isArray(needs) ? needs.map(text) : typeof needs === 'string' ? [needs] : [],
        runsOn: Array.isArray(job['runs-on']) ? job['runs-on'].map(text).join(', ') : text(job['runs-on']),
        steps: steps.map((step) => {
          const s = (typeof step === 'object' && step !== null ? step : {}) as Record<string, unknown>;
          return (text(s.name) || text(s.uses) || text(s.run)).split('\n')[0] ?? '';
        }),
      };
    }),
  };
}

function buildWorkflow(state: RepoState): WorkflowView | null {
  const disk = activeWorktree(state)?.workingDir ?? {};
  const files = Object.keys(disk)
    .filter((p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p))
    .sort((a, b) => Number(!/\/ci\.ya?ml$/.test(a)) - Number(!/\/ci\.ya?ml$/.test(b)) || a.localeCompare(b));
  // ponytail: one workflow drawn (ci.yml first); the levels use a single file.
  const file = files[0];
  return file === undefined ? null : parseWorkflow(file, disk[file] as string);
}

export const EMPTY_PANEL_DATA: PanelData = { config: [], remote: [], stashes: [], reflog: [], worktrees: [], workflow: null };

/** GitQuest's own sandbox wiring (origin → local practice server, no personal excludes, gh credentials): not the player's settings. */
const plumbing = (key: string): boolean => /^url\..*\.insteadof$/.test(key) || key === 'core.excludesfile' || key.startsWith('credential.');

export function buildPanelData(state: RepoState | null, facts: RepoFacts): PanelData {
  const config = (facts.configEntries ?? []).filter((e) => !plumbing(e.key));
  if (state === null || !state.initialized) return { ...EMPTY_PANEL_DATA, config };
  return {
    config,
    remote: buildRemote(state),
    stashes: facts.stashes,
    reflog: facts.reflog.slice(0, 12).map((entry) => ({ short: entry.hash.slice(0, 7), action: entry.action })),
    worktrees: Object.values(state.worktrees)
      .sort((a, b) => Number(b.isMain) - Number(a.isMain))
      .map((w) => ({ path: w.path, branch: w.head.kind === 'branch' ? w.head.branch : null, isMain: w.isMain })),
    workflow: buildWorkflow(state),
  };
}

function suggestedOrder(path: LearningPath | null, level: number): number | null {
  if (path === 'agents') return AGENTS_ORDER[level] ?? null;
  return level; // classic, self and not chosen yet: level number order
}

export function buildLevels(progress: Progress, setupDone: boolean): LevelSummary[] {
  return LEVELS.map((level) => {
    const missions = level.missions.flatMap((id) => {
      const mission = missionById(id);
      if (mission === undefined) return [];
      const stars = progress.completed[id]?.stars ?? 0;
      // Current only while the attempt is in progress; a solved mission reads as done.
      const playing = id === progress.current && !(progress.position?.missionId === id && progress.position.stage === 'after');
      const state = playing ? 'current' : stars > 0 ? 'done' : 'todo';
      return [{ id, number: mission.number, title: mission.title, state, stars } as const];
    });
    // A level without missions yet (Setup before its missions existed) counts the first-run setup as done.
    const done =
      level.number === 0 && missions.length === 0 ? (setupDone ? level.planned : 0) : missions.filter((m) => m.stars > 0).length;
    return {
      id: level.id,
      number: level.number,
      title: level.title,
      topics: level.topics,
      missions,
      planned: level.planned,
      done,
      // Online levels (GitHub for real) sit outside every offline path.
      suggestedOrder: level.online === true ? null : suggestedOrder(progress.path, level.number),
      ...(level.warning === undefined ? {} : { warning: level.warning }),
      ...(level.online === true ? { online: true } : {}),
      lesson: lessonSummary(level.id, progress),
    };
  });
}

/** Read = reached the last slide once or answered a quiz question; the score shows once every question has an answer. */
export function lessonSummary(levelId: string, progress: Progress): LevelSummary['lesson'] {
  const lesson = lessonFor(levelId);
  const saved = progress.lessons[levelId];
  const slides = lesson?.slides.length ?? 0;
  const quiz = lesson?.quiz ?? [];
  const answered = quiz.filter((q) => saved?.quiz[q.id] !== undefined);
  return {
    slides,
    read: slides > 0 && (saved?.read === true || answered.length > 0),
    quizScore: quiz.length > 0 && answered.length === quiz.length ? answered.filter((q) => saved?.quiz[q.id] === q.correct).length : null,
    quizTotal: quiz.length,
  };
}

// Capstones -------------------------------------------------------------------

/** Capstones give hints only once the player has tried something (2 counted commands). */
export function hintsOpen(mission: Mission, commandsUsed: number): boolean {
  return mission.capstone !== true || commandsUsed >= 2;
}

/** Checks and revealed hints as shown: a capstone hides the checks not done yet. */
export function guidance(
  mission: Mission,
  checks: readonly CheckView[],
  attempt: Pick<Attempt, 'hintsUsed' | 'commandsUsed'>,
): { checks: readonly CheckView[]; hints: readonly string[] } {
  const capstone = mission.capstone === true;
  return {
    checks: capstone ? checks.map((c) => (c.done ? c : { label: 'Hidden check', proof: '', done: false })) : checks,
    hints: hintsOpen(mission, attempt.commandsUsed) ? mission.hints.slice(0, attempt.hintsUsed) : [],
  };
}

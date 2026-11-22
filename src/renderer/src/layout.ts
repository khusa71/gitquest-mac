import type { AreaFile, CommitView } from '../../shared/view-model';

/** Branch lane colours: first lane accent, second purple; later lanes reuse meaning-free spares. */
const LANE_COLORS = ['#4493f8', '#ab7df8', '#3fb950', '#d29922'];
export const DETACHED_COLOR = '#9198a1';

/** Default card width; the real width fits the panel (see fitCardWidth). */
export const CARD_W = 184;
export const GAP = 24;
export const COL = CARD_W + GAP; // card width + gap, at the default width
export const PAD = 16;
const MIN_CARD = 140;
const MAX_CARD = 220;

/** How many card columns fit `available` px at the minimum card width (at least 3). */
export function maxColumns(available: number): number {
  return Math.max(3, Math.floor((available - PAD * 2 + GAP) / (MIN_CARD + GAP)));
}

/** Widest card that lets `cols` cards fit `available` px; History only scrolls below MIN_CARD. */
export function fitCardWidth(available: number, cols: number): number {
  if (available <= 0 || cols <= 0) return CARD_W;
  const fit = Math.floor((available - PAD * 2 - (cols - 1) * GAP) / cols);
  return Math.max(MIN_CARD, Math.min(MAX_CARD, fit));
}
const NODE_TOP = 44;
const LANE_GAP = 32;

export interface HistoryNode {
  readonly commit: CommitView;
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export interface HistoryLayout {
  readonly nodes: readonly HistoryNode[];
  readonly edges: readonly { readonly d: string; readonly color: string; readonly faded: boolean }[];
  /** The folded "earlier commits" node in the first column, null when every commit has its own card. */
  readonly earlier: { readonly x: number; readonly y: number } | null;
  /** Where the dashed "next commit" node sits, null when the index matches HEAD. */
  readonly next: { readonly x: number; readonly y: number; readonly fromX: number; readonly fromY: number } | null;
  readonly width: number;
  readonly height: number;
}

/** Lanes in display order: the head branch's lane first (or main), then by first appearance oldest → newest. */
export function laneOrder(oldestFirst: readonly CommitView[], headBranch: string | null): string[] {
  const lanes: string[] = [];
  const first = headBranch ?? 'main';
  if (oldestFirst.some((c) => c.lane === first)) lanes.push(first);
  for (const c of oldestFirst) if (c.lane !== null && !lanes.includes(c.lane)) lanes.push(c.lane);
  return lanes;
}

/** Commits arrive newest first; the diagram runs oldest → newest, one column per commit. */
export function layoutHistory(
  newestFirst: readonly CommitView[],
  headBranch: string | null,
  hasNext: boolean,
  cardW: number = CARD_W,
  /** True when older commits are folded into one "earlier" column before these. */
  folded = false,
): HistoryLayout {
  const col = cardW + GAP;
  const offset = folded ? 1 : 0;
  const colX = (i: number): number => PAD + cardW / 2 + (i + offset) * col;
  const commits = [...newestFirst].reverse();
  const lanes = laneOrder(commits, headBranch);
  const laneY = (lane: string | null): number => {
    const i = lane === null ? lanes.length : lanes.indexOf(lane);
    return NODE_TOP + Math.max(0, i) * LANE_GAP;
  };
  const nodes: HistoryNode[] = commits.map((commit, i) => {
    const li = commit.lane === null ? -1 : lanes.indexOf(commit.lane);
    return { commit, x: colX(i), y: laneY(commit.lane), color: li < 0 ? DETACHED_COLOR : (LANE_COLORS[li % LANE_COLORS.length] ?? DETACHED_COLOR) };
  });
  const byHash = new Map(nodes.map((n) => [n.commit.hash, n]));
  const earlier = folded ? { x: PAD + cardW / 2, y: laneY(lanes[0] ?? null) } : null;
  const edges = nodes.flatMap((child) =>
    child.commit.parents.flatMap((p) => {
      const parent = byHash.get(p) ?? (earlier && { x: earlier.x, y: earlier.y });
      if (!parent) return [];
      const mid = (parent.x + child.x) / 2;
      const d = parent.y === child.y
        ? `M${parent.x} ${parent.y} H${child.x}`
        : `M${parent.x} ${parent.y} C${mid} ${parent.y} ${mid} ${child.y} ${child.x} ${child.y}`;
      return [{ d, color: child.color, faded: !child.commit.reachable }];
    }),
  );
  const head = nodes.find((n) => n.commit.isHead);
  const next = hasNext
    ? { x: colX(nodes.length), y: head?.y ?? NODE_TOP, fromX: head?.x ?? colX(nodes.length), fromY: head?.y ?? NODE_TOP }
    : null;
  const cols = nodes.length + (next ? 1 : 0) + offset;
  const usedLanes = lanes.length + (commits.some((c) => c.lane === null) ? 1 : 0);
  return {
    nodes,
    edges,
    earlier,
    next,
    width: PAD * 2 + Math.max(1, cols) * col - GAP,
    height: NODE_TOP + Math.max(0, usedLanes - 1) * LANE_GAP + 28,
  };
}

/** Git status words for one file, as `git status` would say them. Untracked = on disk but not in the index. */
export function areaStatus(a: AreaFile): { disk: 'untracked' | 'modified' | 'deleted' | null; index: 'staged' | 'staged new' | 'staged deletion' | null } {
  const untracked = a.disk !== null && a.index === null;
  const disk = untracked ? 'untracked' : a.disk === null && a.index !== null ? 'deleted' : a.disk !== a.index ? 'modified' : null;
  const index = a.index === a.head ? null : a.head === null ? 'staged new' : a.index === null ? 'staged deletion' : 'staged';
  return { disk, index };
}

/** Up to this many files the three areas list every file as the story missions always did; more = a real repo. */
export const AREAS_COMPACT = 6;

/** Keeps the file name: `packages/sync/test/queue.test.ts` → `packages/…/queue.test.ts` (or `…/queue.test.ts`, `…test.ts`). */
export function middleTruncate(path: string, max: number): string {
  if (path.length <= max) return path;
  const cut = path.lastIndexOf('/');
  const name = path.slice(cut + 1);
  if (cut < 0 || name.length + 2 > max) return `…${name.slice(-(max - 1))}`;
  const first = path.slice(0, path.indexOf('/') + 1);
  return first.length + 2 + name.length <= max && first !== path.slice(0, cut + 1) ? `${first}…/${name}` : `…/${name}`;
}

/** Short, version-like content labels (`v2`, `draft`) read well; anything else is a snippet and shows a status word instead. */
export const versionLike = (label: string): boolean => label.length <= 10 && !/\s/.test(label);

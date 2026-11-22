import { describe, expect, it } from 'vitest';
import type { CommitView } from '../../shared/view-model';
import { areaStatus, COL, fitCardWidth, layoutHistory, maxColumns, middleTruncate, versionLike } from './layout';

const c = (hash: string, parents: string[], lane: string | null, isHead = false): CommitView => ({
  hash, short: hash, message: hash, author: 'you', parents, lane, refs: [], isHead, reachable: lane !== null, snapshot: [],
});

describe('layoutHistory', () => {
  it('runs oldest → newest with one column per commit and lanes on separate rows', () => {
    const l = layoutHistory([c('d', ['b'], 'feature'), c('c', ['b'], 'main', true), c('b', ['a'], 'main'), c('a', [], 'main')], 'main', true);
    expect(l.nodes.map((n) => n.commit.hash)).toEqual(['a', 'b', 'c', 'd']);
    expect(l.nodes[1]!.x - l.nodes[0]!.x).toBe(COL);
    expect(l.nodes[3]!.y).toBeGreaterThan(l.nodes[2]!.y); // feature lane below main
    expect(l.edges).toHaveLength(3);
    expect(l.next?.fromX).toBe(l.nodes[2]!.x); // dashed next node leaves from HEAD
    expect(l.next!.x).toBe(l.nodes[3]!.x + COL);
  });
});

describe('fitCardWidth', () => {
  it('fits a few cards to the panel without scrolling', () => {
    const w = fitCardWidth(720, 4);
    expect(16 * 2 + 4 * w + 3 * 24).toBeLessThanOrEqual(720);
  });
  it('caps wide cards and only goes below the minimum by scrolling', () => {
    expect(fitCardWidth(2000, 2)).toBe(220);
    expect(fitCardWidth(600, 12)).toBe(140);
  });
});

describe('folded history', () => {
  it('puts the earlier node in the first column and links the oldest shown commit to it', () => {
    const l = layoutHistory([c('c', ['b'], 'main', true), c('b', ['a'], 'main')], 'main', false, 160, true);
    expect(l.earlier).not.toBeNull();
    expect(l.nodes[0]!.x).toBe(l.earlier!.x + 160 + 24);
    expect(l.edges.some((e) => e.d.startsWith(`M${l.earlier!.x} `))).toBe(true);
  });
  it('fits at least three columns', () => {
    expect(maxColumns(300)).toBe(3);
  });
});

describe('areaStatus', () => {
  const s = (disk: string | null, index: string | null, head: string | null) => areaStatus({ path: 'f', disk, index, head });
  it('names each git status', () => {
    expect(s('v1', null, null)).toEqual({ disk: 'untracked', index: null });
    expect(s('v3', 'v2', 'v1')).toEqual({ disk: 'modified', index: 'staged' });
    expect(s('v1', 'v1', null)).toEqual({ disk: null, index: 'staged new' });
    expect(s(null, 'v1', 'v1')).toEqual({ disk: 'deleted', index: null });
    expect(s('v1', null, 'v1')).toEqual({ disk: 'untracked', index: 'staged deletion' });
    expect(s('v1', 'v1', 'v1')).toEqual({ disk: null, index: null });
  });
});

describe('middleTruncate', () => {
  it('keeps the file name visible', () => {
    expect(middleTruncate('app.ts', 20)).toBe('app.ts');
    expect(middleTruncate('packages/sync/test/queue.test.ts', 24)).toBe('packages/…/queue.test.ts');
    expect(middleTruncate('packages/sync/test/queue.test.ts', 18)).toBe('…/queue.test.ts');
    expect(middleTruncate('packages/sync/test/queue.test.ts', 8)).toBe('…test.ts');
    expect(middleTruncate('src/a-very-long-file-name.ts', 12)).toHaveLength(12);
  });
  it('version-like labels only', () => {
    expect(['v2', 'draft', 'csv v1'].map(versionLike)).toEqual([true, true, false]);
    expect(versionLike('# Nova…')).toBe(false);
  });
});

// Diagrams drawn from static data: the workspace history and three areas, and the lesson diagrams
// (also used by the mission Target card). No app state in here.
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import type { Diagram } from '../../shared/api';
import type { AreaFile, CommitView, SnapshotFile } from '../../shared/view-model';
import { ArrowMarker } from './icons';
import { AREAS_COMPACT, areaStatus, fitCardWidth, layoutHistory, maxColumns, middleTruncate, versionLike } from './layout';

/** Inline `code` spans inside plain text. */
export function inline(text: string): ReactNode[] {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <code key={i}>{part}</code> : part));
}

function SnapshotList({ files, highlight }: { files: readonly SnapshotFile[]; highlight: string }) {
  const w = Math.max(0, ...files.map((f) => f.path.length));
  return (
    <span className="snap-files mono">
      {files.map((f) => (
        <span key={f.path} className={f.changed ? 'snap-changed' : 'muted'} style={f.changed ? { color: highlight } : undefined}>
          {f.path.padEnd(w)} {f.version || '(empty)'}
        </span>
      ))}
    </span>
  );
}

interface HistoryDiagramProps {
  /** Newest first. */
  commits: readonly CommitView[];
  headBranch: string | null;
  nextCommit: readonly SnapshotFile[] | null;
  /** Word under a faded commit's card ("" for none). */
  lostLabel?: string;
}

/** Commit graph with one snapshot card per commit. Static data in, so lessons draw it too. */
export function HistoryDiagram({ commits, headBranch, nextCommit, lostLabel = 'unreachable' }: HistoryDiagramProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Newest commits get full cards; older ones fold into one "earlier" card so nothing is cut off.
  const hasNext = nextCommit !== null;
  const room = available > 0 ? maxColumns(available) : Infinity;
  const needsFold = commits.length + (hasNext ? 1 : 0) > room;
  const keep = needsFold ? Math.max(1, room - 1 - (hasNext ? 1 : 0)) : commits.length;
  // HEAD always keeps its own card, even when newer commits sit on other branches.
  const headIndex = commits.findIndex((c) => c.isHead);
  const newest = headIndex >= keep ? keep - 1 : keep;
  const shown = commits.filter((_c, i) => i < newest || i === headIndex);
  const hidden = commits.filter((_c, i) => !(i < newest || i === headIndex));
  const cardW = fitCardWidth(available, shown.length + (hasNext ? 1 : 0) + (hidden.length > 0 ? 1 : 0));
  const layout = layoutHistory(shown, headBranch, hasNext, cardW, hidden.length > 0);
  const newestHash = commits[0]?.hash;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth; // keep the newest commit in view
  }, [newestHash, layout.width]);

  const lanes = new Set(commits.map((c) => c.lane).filter((l) => l !== null)).size;
  const label = `${commits.length} commits on ${lanes} ${lanes === 1 ? 'branch' : 'branches'}, oldest on the left${nextCommit ? ', and the next commit git commit would make from the index' : ''}`;
  return (
    <div className="history-scroll" ref={scroller}>
      <div style={{ width: layout.width }}>
        <svg role="img" aria-label={label} width={layout.width} height={layout.height} className="history-svg">
          {layout.nodes.map((n) => (
            <path key={`v${n.commit.hash}`} d={`M${n.x} ${n.y + 8} V${layout.height}`} stroke="#30363d" strokeWidth="1" opacity={n.commit.reachable ? 1 : 0.5} />
          ))}
          {layout.edges.map((e, i) => (
            <path key={i} d={e.d} stroke={e.color} strokeWidth="2" fill="none" opacity={e.faded ? 0.4 : 1} strokeDasharray={e.faded ? '4 4' : undefined} />
          ))}
          {layout.earlier && (
            <g aria-hidden="true">
              <path d={`M${layout.earlier.x} ${layout.earlier.y + 8} V${layout.height}`} stroke="#30363d" strokeWidth="1" />
              <circle cx={layout.earlier.x - 6} cy={layout.earlier.y} r="5" fill="#0d1117" stroke="#9198a1" strokeWidth="1.5" />
              <circle cx={layout.earlier.x} cy={layout.earlier.y} r="6" fill="#9198a1" />
              <text x={layout.earlier.x} y={layout.earlier.y - 18} textAnchor="middle" fontSize="12" fill="#9198a1">{hidden.length} earlier</text>
            </g>
          )}
          {layout.next && (
            <>
              <path d={`M${layout.next.fromX} ${layout.next.fromY} H${layout.next.x}`} stroke="#9198a1" strokeWidth="2" strokeDasharray="4 4" />
              <path d={`M${layout.next.x} ${layout.next.y + 8} V${layout.height}`} stroke="#3fb950" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={layout.next.x} cy={layout.next.y} r="8" fill="#0d1117" stroke="#3fb950" strokeWidth="2" strokeDasharray="3 3" />
              <text x={layout.next.x} y={layout.next.y - 18} textAnchor="middle" fill="#3fb950" fontSize="12">next commit</text>
            </>
          )}
          {layout.nodes.map((n) => (
            <g key={n.commit.hash} opacity={n.commit.reachable ? 1 : 0.45}>
              {n.commit.isHead ? (
                <>
                  <circle cx={n.x} cy={n.y} r="9" fill="#0d1117" stroke={n.color} strokeWidth="2" />
                  <circle cx={n.x} cy={n.y} r="4" fill={n.color} />
                </>
              ) : n.commit.reachable ? (
                <circle cx={n.x} cy={n.y} r="6" fill={n.color} />
              ) : (
                <circle cx={n.x} cy={n.y} r="6" fill="#0d1117" stroke={n.color} strokeWidth="2" strokeDasharray="3 2" />
              )}
              <text x={n.x} y={n.y - 18} textAnchor="middle" className="mono" fontSize="12" fill={n.commit.isHead ? '#e6edf3' : '#9198a1'}>{n.commit.short}</text>
            </g>
          ))}
        </svg>
        <ol className="history-cards">
          {hidden.length > 0 && (
            <li className="snap-card earlier" style={{ width: cardW }}>
              <span className="small muted">{hidden.length} earlier {hidden.length === 1 ? 'commit' : 'commits'}</span>
              <span className="snap-files mono">
                {hidden.slice(0, 6).map((c) => (
                  <span key={c.hash} title={`${c.short} ${c.message} · ${c.author}`}>{c.short.slice(0, 7)} {c.message}</span>
                ))}
              </span>
              {hidden.length > 6 && <span className="small muted snap-foot">and {hidden.length - 6} more · git log</span>}
            </li>
          )}
          {[...shown].reverse().map((c, i) => (
            <CommitCard key={c.hash} commit={c} width={cardW} color={layout.nodes[i]?.color ?? '#9198a1'} lostLabel={lostLabel} />
          ))}
          {nextCommit && (
            <li className="snap-card next" style={{ width: cardW }}>
              <span className="small" style={{ color: '#3fb950' }}>git commit would save</span>
              <SnapshotList files={nextCommit} highlight="#3fb950" />
              <span className="small muted snap-foot">from the index, not disk</span>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

function CommitCard({ commit, width, color, lostLabel }: { commit: CommitView; width: number; color: string; lostLabel: string }) {
  const byline = commit.author ? `${commit.message} · ${commit.author}` : commit.message;
  return (
    <li
      className={`snap-card${commit.isHead ? ' head' : ''}${commit.reachable ? '' : ' lost'}`}
      style={{ width, borderColor: commit.isHead ? color : undefined }}
      title={`${commit.short} ${commit.message}${commit.author ? ` (${commit.author})` : ''}${commit.reachable || !lostLabel ? '' : ' — no branch reaches this commit'}`}
    >
      <span className="small muted clamp">{byline}</span>
      <SnapshotList files={commit.snapshot} highlight="#e6edf3" />
      {(commit.refs.length > 0 || (!commit.reachable && lostLabel !== '')) && (
        <span className="snap-foot">
          {commit.refs.map((r) => (
            <span key={r} className="ref mono" style={r.startsWith('HEAD') || r === commit.lane ? { color, background: `${color}1a` } : undefined}>{r}</span>
          ))}
          {!commit.reachable && lostLabel && <span className="small muted">{lostLabel}</span>}
        </span>
      )}
    </li>
  );
}

/** `git status -s` letters for the status words, used when a box is too narrow for the word. */
const STATUS_CODE: Record<string, string> = { modified: 'M', untracked: '??', deleted: 'D', staged: 'M', new: 'A' };

/** Index status words short enough to share a line with a path. */
const SHORT_INDEX: Record<string, string> = { staged: 'staged', 'staged new': 'new', 'staged deletion': 'deleted' };

const readFlag = (key: string | undefined): boolean => {
  if (key === undefined) return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

/**
 * Disk → Index → HEAD boxes with the commands between them. Static data in, so lessons draw it too.
 * Story repos (up to AREAS_COMPACT files) list every file with its content label and status words under it.
 * Real repos list only files that differ, one line each with a short label or a status word, and fold the rest
 * into "N unchanged files" (Show all is remembered under `storageKey`).
 */
export function AreasGrid({ areas, storageKey }: { areas: readonly AreaFile[]; storageKey?: string }) {
  const [grid, width] = useWidth<HTMLDivElement>();
  const [all, setAll] = useState(() => readFlag(storageKey));
  const toggleAll = (): void => {
    setAll(!all);
    try {
      if (storageKey !== undefined) localStorage.setItem(storageKey, all ? '0' : '1');
    } catch {
      // A convenience only.
    }
  };
  const unstaged = (a: AreaFile) => a.disk !== a.index;
  const staged = (a: AreaFile) => a.index !== a.head;
  const changed = (a: AreaFile) => unstaged(a) || staged(a);
  const sorted = [...areas].sort((a, b) => Number(changed(b)) - Number(changed(a)));
  const compact = areas.length <= AREAS_COMPACT;
  const list = compact || all ? sorted : sorted.filter(changed);
  const unchanged = areas.length - areas.filter(changed).length;
  const anyStaged = areas.some(staged);
  // Characters of path that fit a box next to its label (mono 12px ≈ 7.2px); boxes and arrow columns as in the CSS.
  const wide = width > 680;
  const inner = compact ? (width - 2 * (wide ? 112 : 72)) / 3 - (wide ? 32 : 24) - 2 : (width - 2 * 88) / 3 - 24 - 2;
  /** Path characters that fit next to a label of `label` characters (story repos: the name keeps the whole line, as before). */
  const pathMax = (label: number) => (width > 0 ? Math.max(6, Math.floor((inner - (compact ? 0 : label * 7.2 + 8)) / 7.2)) : 60);
  const box = (name: string, sub: string, pick: (a: AreaFile) => string | null, hot: (a: AreaFile) => boolean, color: string, tag: (a: AreaFile) => string | null, word: (a: AreaFile) => string, accent?: boolean) => (
    <div className="area" style={accent ? { borderColor: color } : undefined}>
      <span className="area-head"><b>{name}</b><span className="small muted">{sub}</span></span>
      <ul>
        {list.map((a) => {
          const v = pick(a);
          const st = areaStatus(a);
          const untracked = st.disk === 'untracked';
          // Real repos: a short version label, else the status word ('' when the file is the same here as next door).
          const full = compact ? '' : v === null ? '–' : versionLike(v) ? v : word(a);
          // Narrow boxes: the status word gives way to its `git status -s` letter so the file name stays readable.
          const text = pathMax(full.length) < 10 ? (STATUS_CODE[full] ?? full) : full;
          const shown = middleTruncate(a.path, pathMax(text.length));
          const label = compact
            ? (v ?? (untracked ? null : <span aria-label="not here">–</span>))
            : text === '–' ? <span aria-label="not here">–</span> : text;
          // Story repos: status words sit on a second line; every box gives that file the same two lines so rows stay aligned.
          const t = tag(a) ?? (untracked && v === null ? 'not tracked' : null);
          return (
            <li key={a.path} className={hot(a) ? 'hot' : 'muted'} style={hot(a) ? { color } : undefined} title={shown === a.path && text === full ? undefined : `${a.path}${full && full !== '–' ? ` · ${full}` : ''}`}>
              <span className="area-name">{shown}</span>
              <span className="area-val">{label}</span>
              {compact && (st.disk || st.index) && <span className={`area-tag${t === 'untracked' ? ' untracked' : ''}`}>{t ?? '\u00a0'}</span>}
            </li>
          );
        })}
        {areas.length === 0 && <li className="muted">no files</li>}
        {areas.length > 0 && list.length === 0 && <li className="muted area-clean">Working tree clean</li>}
      </ul>
    </div>
  );
  const arrows = (fwd: string, back: ReactNode) => (
    <div className="area-arrows">
      <span>{fwd}<svg aria-hidden="true" width="60" height="10" viewBox="0 0 60 10"><path d="M0 5h56M52 1l4 4-4 4" stroke="#9198a1" strokeWidth="1.5" fill="none" /></svg></span>
      <span>{back}<svg aria-hidden="true" width="60" height="10" viewBox="0 0 60 10"><path d="M60 5H4M8 1L4 5l4 4" stroke="#9198a1" strokeWidth="1.5" fill="none" /></svg></span>
    </div>
  );
  return (
    <>
      <div className={`areas-grid${compact ? '' : ' repo'}`} ref={grid}>
        {box('Disk', 'files right now', (a) => a.disk, unstaged, '#d29922', (a) => areaStatus(a).disk, (a) => areaStatus(a).disk ?? '')}
        {arrows('git add', 'git restore')}
        {box('Index', 'the next commit', (a) => a.index, staged, '#3fb950', (a) => areaStatus(a).index, (a) => SHORT_INDEX[areaStatus(a).index ?? ''] ?? '', anyStaged)}
        {arrows('git commit', <>restore <span className="nowrap">--staged</span></>)}
        {box('HEAD', 'last commit', (a) => a.head, staged, '#e6edf3', () => null, () => '')}
      </div>
      {!compact && unchanged > 0 && (
        <p className="areas-fold small muted">
          {all ? `Showing ${unchanged} unchanged ${unchanged === 1 ? 'file' : 'files'} too` : `${unchanged} unchanged ${unchanged === 1 ? 'file' : 'files'}`}
          <button type="button" className="link small" aria-pressed={all} onClick={toggleAll}>{all ? 'Hide unchanged' : 'Show all'}</button>
        </p>
      )}
    </>
  );
}

// Diagrams ----------------------------------------------------------------------

export function DiagramView({ diagram }: { diagram: Diagram }) {
  const caption = diagram.kind === 'code' ? undefined : diagram.caption;
  return (
    <figure className="diagram">
      <DiagramBody diagram={diagram} />
      {caption && <figcaption className="small muted">{inline(caption)}</figcaption>}
    </figure>
  );
}

function DiagramBody({ diagram: d }: { diagram: Diagram }) {
  switch (d.kind) {
    case 'graph': {
      const head = d.commits.find((c) => c.id === d.head);
      const headRef = head?.refs?.find((r) => /^HEAD (→|->) /.test(r))?.replace(/^HEAD (→|->) /, 'HEAD → ');
      const commits: CommitView[] = [...d.commits].reverse().map((c) => ({
        hash: c.id, short: c.id, message: c.message, author: '', parents: c.parents, lane: c.lane,
        refs: c.refs ?? [], isHead: c.id === d.head, reachable: c.ghost !== true, snapshot: [],
      }));
      return (
        <div className="panel history lesson-graph">
          <HistoryDiagram commits={commits} headBranch={headRef ? headRef.slice('HEAD → '.length) : (head?.lane ?? null)} nextCommit={null} lostLabel="" />
        </div>
      );
    }
    case 'areas':
      return <div className="lesson-areas"><AreasGrid areas={d.files} /></div>;
    case 'flow':
      return <FlowView diagram={d} />;
    case 'before-after':
      return <BeforeAfter diagram={d} />;
    case 'code':
      return (
        <div className="code-block">
          {d.title && <div className="code-title mono">{d.title}</div>}
          <pre className="mono">{d.text}</pre>
        </div>
      );
  }
}

/** Flow boxes grow to fit their text up to this width, then wrap. */
const NODE_MAX = 220;

/** Gap between two boxes in a row: room for the widest edge label between them (mono 12px ≈ 7.2px a character, plus its padding) and the arrowhead. */
const gapFor = (labels: readonly (string | undefined)[]): number => {
  const longest = Math.max(0, ...labels.map((l) => l?.length ?? 0));
  return longest === 0 ? 64 : Math.max(96, Math.ceil(longest * 7.2) + 40);
};

type FlowDiagram = Extract<Diagram, { kind: 'flow' }>;

/** Nodes grouped by row (row 0 on top), in the order given. */
function flowRows(d: FlowDiagram): FlowDiagram['nodes'][number][][] {
  const rows = new Map<number, FlowDiagram['nodes'][number][]>();
  for (const n of d.nodes) rows.set(n.row ?? 0, [...(rows.get(n.row ?? 0) ?? []), n]);
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, nodes]) => nodes);
}

/** Labels of the edges between two neighbouring boxes, in either direction. */
const labelsBetween = (d: FlowDiagram, a: string, b: string): (string | undefined)[] =>
  d.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)).map((e) => e.label);

/** Rough width a diagram needs to read without scrolling (graph cards at their 140px minimum). */
function needsWidth(d: Diagram): number {
  switch (d.kind) {
    case 'graph': return d.commits.length * 164 + 24;
    case 'areas': return 600;
    case 'flow':
      return Math.max(0, ...flowRows(d).map((row) => row.reduce((w, n, i) => w + NODE_MAX + (i > 0 ? gapFor(labelsBetween(d, row[i - 1]!.id, n.id)) : 0), 0)));
    case 'code': return Math.max(...d.text.split('\n').map((l) => l.length)) * 8 + 24;
    case 'before-after': return Infinity;
  }
}

export interface Rect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/**
 * Boxes laid out by CSS, lines drawn over them: the rects of every `[data-node]` inside the returned ref,
 * relative to it, measured before paint and again whenever the container or a box changes size.
 */
export function useNodeRects<T extends HTMLElement>(key: string): [RefObject<T | null>, ReadonlyMap<string, Rect>] {
  const box = useRef<T>(null);
  const [rects, setRects] = useState<ReadonlyMap<string, Rect>>(new Map());
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = (): void => {
      const base = el.getBoundingClientRect();
      // In the box's own coordinates, so a scaled-down diagram (transform) still draws its arrows in place.
      const k = el.offsetWidth > 0 ? base.width / el.offsetWidth : 1;
      const next = new Map<string, Rect>();
      for (const n of el.querySelectorAll<HTMLElement>('[data-node]')) {
        const r = n.getBoundingClientRect();
        next.set(n.dataset.node ?? '', { x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k });
      }
      setRects(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const n of el.querySelectorAll('[data-node]')) ro.observe(n);
    return () => ro.disconnect();
  }, [key]);
  return [box, rects];
}

/** Width of an element, measured before paint and kept current. */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const box = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [box, width];
}

/** Before and after side by side with the command between; stacked when the two do not fit. */
function BeforeAfter({ diagram: d }: { diagram: Extract<Diagram, { kind: 'before-after' }> }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const stacked = 2 * Math.max(needsWidth(d.before), needsWidth(d.after)) + 200 > width;
  return (
    <div ref={box} className={`before-after${stacked ? ' stacked' : ''}`}>
      <div className="ba-side"><span className="small muted">Before</span><DiagramBody diagram={d.before} /></div>
      <div className="ba-cmd">
        <code>{d.command}</code>
        <svg aria-hidden="true" width="60" height="10" viewBox="0 0 60 10"><path d="M0 5h56M52 1l4 4-4 4" stroke="#9198a1" strokeWidth="1.5" fill="none" /></svg>
      </div>
      <div className="ba-side"><span className="small muted">After</span><DiagramBody diagram={d.after} /></div>
    </div>
  );
}

/** x of the flow curve (control points at the vertical midpoint) where it crosses height `y`. */
function curveX(x1: number, y1: number, x2: number, y2: number, y: number): number {
  const s = Math.min(1, Math.max(0, (y - y1) / (y2 - y1)));
  let lo = 0, hi = 1;
  for (let k = 0; k < 20; k++) {
    const t = (lo + hi) / 2;
    if (1.5 * t * (1 - t) + t * t * t < s) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return x1 + (x2 - x1) * (3 * t * t - 2 * t * t * t);
}

/**
 * Boxes in rows (row 0 on top), each as big as its text, joined by labelled arrows drawn from the measured boxes.
 * The gap between two neighbours fits the widest label between them, so a label never covers a box; a pair of
 * opposite edges is drawn as two parallel lines with one label above and one below. Too wide: it scrolls.
 */
function FlowView({ diagram: d }: { diagram: FlowDiagram }) {
  const marker = `flow-${useId().replace(/:/g, '')}`;
  const rows = flowRows(d);
  const place = new Map<string, { row: number; col: number }>();
  rows.forEach((row, ri) => row.forEach((n, ci) => place.set(n.id, { row: ri, col: ci })));
  const [box, rects] = useNodeRects<HTMLDivElement>(JSON.stringify(d));
  // Last resort after the boxes have narrowed: scale the whole diagram down to the width there is (never scroll).
  // `height` = what the wrapper reserves: the scaled diagram, labels hanging below the last row included.
  const pad = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number | undefined }>({ scale: 1, height: undefined });
  useLayoutEffect(() => {
    const p = pad.current, f = box.current;
    if (!p || !f) return;
    const measure = (): void => {
      const cs = getComputedStyle(p);
      const room = p.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const scale = Math.min(1, room / Math.max(1, f.scrollWidth));
      const next = { scale: Math.floor(scale * 1000) / 1000, height: Math.ceil(Math.max(f.offsetHeight, f.scrollHeight) * scale) };
      setFit((prev) => (prev.scale === next.scale && prev.height === next.height ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(p);
    ro.observe(f);
    return () => ro.disconnect();
  }, [box]);
  const reverse = (from: string, to: string) => d.edges.some((e) => e.from === to && e.to === from);
  // ponytail: straight lines between neighbours; an edge that skips a box in its row crosses it. Keep flow edges adjacent.
  // Labels of edges between two rows each get their own line in the band between them (the band grows to fit),
  // beside their curve, on the side where they fit: they never meet a box or each other.
  const band = (ra: number, rb: number) => Math.min(ra, rb) + 1;
  const slots = new Map<number, number[]>();
  d.edges.forEach((e, i) => {
    const pa = place.get(e.from), pb = place.get(e.to);
    if (pa && pb && pa.row !== pb.row && e.label) slots.set(band(pa.row, pb.row), [...(slots.get(band(pa.row, pb.row)) ?? []), i]);
  });
  const bandGap = (b: number) => Math.max(64, 24 + 20 * (slots.get(b)?.length ?? 0));
  const width = Math.max(0, ...[...rects.values()].map((r) => r.x + r.w));
  const rowBottom = (ri: number) => Math.max(0, ...(rows[ri] ?? []).map((n) => { const r = rects.get(n.id); return r ? r.y + r.h : 0; }));
  const spill = { left: 0, right: 0 };
  const lines = d.edges.flatMap((e, i): { key: number; d: string; label: string | undefined; style: CSSProperties }[] => {
    const a = rects.get(e.from), b = rects.get(e.to), pa = place.get(e.from), pb = place.get(e.to);
    if (!a || !b || !pa || !pb || e.from === e.to) return [];
    const both = reverse(e.from, e.to);
    if (pa.row === pb.row) {
      const right = pb.col > pa.col;
      const off = both ? (right ? -10 : 10) : 0;
      const y = a.y + a.h / 2 + off;
      const x1 = right ? a.x + a.w : a.x, x2 = right ? b.x - 6 : b.x + b.w + 6;
      return [{ key: i, d: `M${x1} ${y} H${x2}`, label: e.label, style: { left: (x1 + x2) / 2, top: off > 0 ? y + 4 : y - 20, transform: 'translateX(-50%)' } }];
    }
    const down = pb.row > pa.row;
    const off = both ? (down ? -14 : 14) : 0;
    const x1 = a.x + a.w / 2 + off, x2 = b.x + b.w / 2 + off;
    const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y - 6 : b.y + b.h + 6;
    const mid = (y1 + y2) / 2;
    const path = Math.abs(x1 - x2) < 1 ? `M${x1} ${y1} V${y2}` : `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
    if (!e.label) return [{ key: i, d: path, label: undefined, style: {} }];
    const k = band(pa.row, pb.row);
    const top = rowBottom(k - 1) + 12 + 20 * (slots.get(k) ?? []).indexOf(i);
    // Where the curve crosses the label's top and bottom edge; the label sits clear of both, on the side away from the
    // rest of the curve (a curve that bends right below the label gets it on the left), or the other side when it does not fit.
    const xa = curveX(x1, y1, x2, y2, top), xb = curveX(x1, y1, x2, y2, top + 16);
    const w = e.label.length * 7.2 + 8;
    const rightX = Math.max(xa, xb) + 8, leftX = Math.min(xa, xb) - 8;
    // The label sits near the upper box: the start of a downward curve, the end of an upward one.
    const prefersLeft = off < 0 || (off === 0 && (down ? x2 > x1 + 1 : x2 < x1 - 1));
    // Sticking out past the diagram is allowed (padding around it makes room): a little on the preferred side,
    // otherwise on whichever side sticks out less.
    const outLeft = Math.max(0, w - leftX), outRight = Math.max(0, rightX + w - width);
    const left = off !== 0 ? prefersLeft : (prefersLeft ? outLeft : outRight) <= 48 ? prefersLeft : outLeft < outRight;
    if (left) spill.left = Math.max(spill.left, w - leftX);
    else spill.right = Math.max(spill.right, rightX + w - width);
    return [{ key: i, d: path, label: e.label, style: { left: left ? leftX : rightX, top, transform: left ? 'translateX(-100%)' : undefined } }];
  });
  const described = d.edges.map((e) => `${d.nodes.find((n) => n.id === e.from)?.label} to ${d.nodes.find((n) => n.id === e.to)?.label}${e.label ? ` (${e.label})` : ''}`).join('; ');
  return (
    <div className="flow-scroll">
      <div className="flow-pad" ref={pad} style={{ paddingLeft: Math.ceil(spill.left), paddingRight: Math.ceil(spill.right), height: fit.height }}>
      <div className="flow" ref={box} role="img" aria-label={described} style={fit.scale < 1 ? { transform: `scale(${fit.scale})` } : undefined}>
        {rows.map((row, ri) => (
          <div key={ri} className="flow-row" aria-hidden="true" style={ri > 0 ? { marginTop: bandGap(ri) } : undefined}>
            {row.map((n, ci) => (
              <Fragment key={n.id}>
                {ci > 0 && <span className="flow-gap" style={{ width: gapFor(labelsBetween(d, row[ci - 1]!.id, n.id)) }} />}
                <div className="dcard flow-node" data-node={n.id} style={{ maxWidth: NODE_MAX }}>
                  <b>{n.label}</b>
                  {n.detail && <span className="small muted">{n.detail}</span>}
                </div>
              </Fragment>
            ))}
          </div>
        ))}
        <svg className="diagram-svg" aria-hidden="true">
          <ArrowMarker id={marker} />
          {lines.map((l) => <path key={l.key} d={l.d} markerEnd={`url(#${marker})`} />)}
        </svg>
        {lines.map((l) => l.label && <span key={l.key} className="flow-label mono" style={l.style} aria-hidden="true">{l.label}</span>)}
      </div>
      </div>
    </div>
  );
}

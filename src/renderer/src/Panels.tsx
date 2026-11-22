// What the mission column shows: the Target card (what done looks like) and the topic panels under the mission
// (history, three areas, config, origin, stash and reflog, worktrees, workflow), picked per mission by the game.
import { Fragment, useEffect, useId, useState } from 'react';
import type { CommitView, MissionView, PanelData, PanelKind, RemoteBranchView, WorkflowView, WorkspaceView } from '../../shared/view-model';
import { AreasGrid, DiagramView, HistoryDiagram, useNodeRects } from './diagrams';
import { Alert, ArrowMarker } from './icons';
import { areaStatus } from './layout';
import { Splitter } from './Splitter';

// Target card -------------------------------------------------------------------

/**
 * "When you're done" (always shown) and "What you should see" (the expected result). The expected result starts open the
 * first time a mission is shown and closed after that; opening or closing it is remembered per mission.
 * Render with `key={mission.id}`.
 */
export function TargetCard({ mission }: { mission: MissionView }) {
  const outcome = mission.outcome;
  const key = `gq.target.${mission.id}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null || saved === 'open';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, 'closed'); // seen once: closed next time
    } catch {
      // Without storage it simply opens every time.
    }
  }, [key]);
  if (outcome === null) return null;
  const expect = outcome.expect;
  const toggle = (next: boolean): void => {
    if (next === open) return;
    setOpen(next);
    try {
      localStorage.setItem(key, next ? 'open' : 'closed');
    } catch {
      // A convenience only.
    }
  };
  return (
    <section className="target" aria-label="Target">
      <p className="target-label small">When you're done</p>
      <p className="target-summary">{outcome.summary}</p>
      {expect && (
        <details className="target-expect" open={open} onToggle={(e) => toggle(e.currentTarget.open)}>
          <summary className="small">What you should see</summary>
          <div className="target-body">
            {expect.kind === 'terminal' && (
              <div className="code-block">
                <pre className="mono"><span className="muted">% </span><b>{expect.command}</b>{expect.output ? `\n${expect.output}` : ''}</pre>
              </div>
            )}
            {expect.kind === 'file' && (
              <div className="code-block">
                <div className="code-title mono">{expect.path}</div>
                <pre className="mono">{expect.content}</pre>
              </div>
            )}
            {expect.kind === 'diagram' && <DiagramView diagram={expect.diagram} />}
          </div>
        </details>
      )}
    </section>
  );
}

// Topic panels ------------------------------------------------------------------

const TITLES: Record<PanelKind, string> = {
  history: 'history',
  areas: 'three areas',
  config: 'config',
  remote: 'origin',
  'stash-reflog': 'stash and reflog',
  worktrees: 'worktrees',
  workflow: 'workflow',
};

interface PanelSize {
  readonly size: number;
  readonly set: (n: number) => void;
  readonly initial: number;
}

/** The mission's panels in order. The last one fills the column; with two or more, a splitter sets its height. */
export function TopicPanels({ view, panels, size }: { view: WorkspaceView; panels: readonly PanelKind[]; size: PanelSize }) {
  const last = panels.length - 1;
  return (
    <>
      {panels.map((kind, i) => (
        <Fragment key={kind}>
          {i === last && i > 0 && (
            <Splitter label={`Resize the ${TITLES[kind]} panel`} orientation="horizontal" panel={size} min={160} max={640} grows={-1} />
          )}
          <Panel kind={kind} view={view} fill={i === last} minHeight={i === last && i > 0 ? size.size : undefined} />
        </Fragment>
      ))}
    </>
  );
}

function Panel({ kind, view, fill, minHeight }: { kind: PanelKind; view: WorkspaceView; fill: boolean; minHeight: number | undefined }) {
  const data: PanelData = view.panelData;
  const style = minHeight === undefined ? undefined : { minHeight };
  const cls = fill ? ' fill' : '';
  switch (kind) {
    case 'history':
      return (
        <section className={`panel history${cls}`} aria-label="Commits and their snapshots" style={style}>
          <div className="panel-head">
            <h2 className="h-sm">History</h2>
            <span className="small muted">each commit is a full snapshot of every file</span>
          </div>
          <HistoryDiagram commits={view.commits} headBranch={view.headBranch} nextCommit={view.nextCommit} />
        </section>
      );
    case 'areas': {
      const anyUntracked = view.areas.some((a) => areaStatus(a).disk === 'untracked');
      return (
        <section className={`panel areas${cls}`} aria-label="The three areas" style={style}>
          <div className="panel-head">
            <h2 className="h-sm">The three areas</h2>
            <span className="small muted">which command moves a file where</span>
          </div>
          <AreasGrid key={view.mission?.id ?? ''} areas={view.areas} storageKey={view.mission ? `gq.areasAll.${view.mission.id}` : undefined} />
          {anyUntracked && (
            <p className="small muted">Untracked files exist only on disk: <code>git add</code> starts tracking them; <code>commit -a</code> skips them.</p>
          )}
          <p className="small muted">
            Top arrows copy files forward. Bottom arrows copy them back, so a wrong <code>git add</code> is undone with <code>git restore --staged</code>
          </p>
        </section>
      );
    }
    case 'config':
      return <ConfigPanel entries={data.config} cls={cls} style={style} />;
    case 'remote':
      return <RemotePanel rows={data.remote} commits={view.commits} cls={cls} style={style} />;
    case 'stash-reflog':
      return <StashReflogPanel data={data} commits={view.commits} cls={cls} style={style} />;
    case 'worktrees':
      return <WorktreesPanel worktrees={data.worktrees} cls={cls} style={style} />;
    case 'workflow':
      return <WorkflowPanel workflow={data.workflow} cls={cls} style={style} />;
  }
}

interface PanelProps {
  cls: string;
  style: { minHeight: number } | undefined;
}

// Config ------------------------------------------------------------------------

/** Keys `git init` writes into every repo: noise next to what the player sets. */
const INIT_KEYS = new Set(['core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.ignorecase', 'core.precomposeunicode']);

const SCOPES = {
  system: ['System', '/etc/gitconfig'],
  global: ['Global', '~/.gitquest/gitconfig'],
  local: ['This repo', '.git/config'],
  worktree: ['This worktree', '.git/config.worktree'],
} as const;

function ConfigPanel({ entries, cls, style }: { entries: PanelData['config'] } & PanelProps) {
  const rows = entries.filter((e) => !(e.scope === 'local' && INIT_KEYS.has(e.key)));
  const lastOf = new Map(rows.map((e, i) => [e.key, i]));
  return (
    <section className={`panel topic${cls}`} aria-label="Git config" style={style}>
      <div className="panel-head">
        <h2 className="h-sm">Config</h2>
        <span className="small muted">read global first, then this repo: the last value wins</span>
      </div>
      {rows.length === 0 ? (
        <p className="small muted">No settings yet.</p>
      ) : (
        <div className="topic-scroll">
          <table className="cfg-table">
            <thead>
              <tr><th scope="col">Setting</th><th scope="col">Value</th><th scope="col">Where from</th></tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const overridden = lastOf.get(e.key) !== i;
                const [where, file] = SCOPES[e.scope];
                return (
                  <tr key={`${e.scope}-${e.key}-${i}`} className={`${e.scope === 'local' ? 'is-local' : ''}${overridden ? ' is-overridden' : ''}`}>
                    <td className="mono">{e.key}</td>
                    <td className="mono cfg-value" title={e.value}>{e.value}</td>
                    <td>
                      <span className="cfg-where">{where}</span> <span className="small muted mono">{file}</span>
                      {overridden && <span className="small muted"> · overridden</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Origin ------------------------------------------------------------------------

function Tip({ name, hash, commits, missing, sub }: { name: string; hash: string | null; commits: readonly CommitView[]; missing: string; sub?: string }) {
  if (hash === null) {
    return <div className="tip is-missing"><span className="mono">{name}</span><span className="small muted">{missing}</span></div>;
  }
  const commit = commits.find((c) => c.hash === hash);
  return (
    <div className="tip">
      <span className="tip-head"><b className="mono">{name}</b><span className="mono muted">{hash.slice(0, 7)}</span></span>
      {commit && <span className="small muted tip-msg" title={commit.message}>{commit.message}</span>}
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

const ARROW_RIGHT = 'M0 5h116M112 1l4 4-4 4';
const ARROW_LEFT = 'M120 5H4M8 1L4 5l4 4';

function Connector({ r }: { r: RemoteBranchView }) {
  let label: string;
  let tone = '';
  let paths: string[];
  let dashed = false;
  if (r.local === null) [label, paths, dashed] = ['only on origin', [ARROW_LEFT], true];
  else if (r.remote === null) [label, paths, dashed] = ['not pushed yet', [ARROW_RIGHT], true];
  else if (r.local === r.remote) [label, tone, paths] = ['in sync', 'tone-success', ['M0 5h120']];
  else if (r.ahead > 0 && r.behind > 0) [label, tone, paths] = [`${r.ahead} ahead, ${r.behind} behind`, 'tone-attention', [ARROW_RIGHT, ARROW_LEFT]];
  else if (r.ahead > 0) [label, paths] = [`${r.ahead} ahead · push`, [ARROW_RIGHT]];
  else [label, paths] = [`${r.behind} behind · pull`, [ARROW_LEFT]];
  return (
    <div className="conn">
      <span className={`small ${tone || 'muted'}`}>{label}</span>
      {paths.map((d) => (
        <svg key={d} aria-hidden="true" width="120" height="10" viewBox="0 0 120 10">
          <path d={d} stroke="#9198a1" strokeWidth="1.5" fill="none" strokeDasharray={dashed ? '4 4' : undefined} />
        </svg>
      ))}
    </div>
  );
}

function RemotePanel({ rows, commits, cls, style }: { rows: readonly RemoteBranchView[]; commits: readonly CommitView[] } & PanelProps) {
  const noOrigin = rows.every((r) => r.remote === null);
  return (
    <section className={`panel topic${cls}`} aria-label="Your Mac and origin" style={style}>
      <div className="panel-head">
        <h2 className="h-sm">Your Mac and origin</h2>
        <span className="small muted">origin as of your last fetch</span>
      </div>
      {rows.length === 0 ? (
        <p className="small muted">No branches yet.</p>
      ) : (
        <div className="topic-scroll">
          <div className="remote-grid">
            <span className="small strong">Your Mac</span>
            <span />
            <span className="small strong">origin</span>
            {rows.map((r) => (
              <Fragment key={r.branch}>
                <Tip name={r.branch} hash={r.local} commits={commits} missing="not on your Mac" sub={r.local === null || r.upstream === `origin/${r.branch}` ? undefined : r.upstream ? `tracks ${r.upstream}` : 'no upstream yet'} />
                <Connector r={r} />
                <Tip name={`origin/${r.branch}`} hash={r.remote} commits={commits} missing="not on origin" />
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {noOrigin && rows.length > 0 && (
        <p className="small muted">Nothing from origin yet: <code>git fetch</code> reads it, <code>git push -u origin &lt;branch&gt;</code> publishes a branch.</p>
      )}
    </section>
  );
}

// Stash and reflog --------------------------------------------------------------

function StashReflogPanel({ data, commits, cls, style }: { data: PanelData; commits: readonly CommitView[] } & PanelProps) {
  return (
    <section className={`panel topic${cls}`} aria-label="Stash and reflog" style={style}>
      <div className="topic-scroll stash-reflog">
        <div className="sr-col">
          <div className="panel-head">
            <h2 className="h-sm">Stash</h2>
            <span className="small muted">work put aside</span>
          </div>
          {data.stashes.length === 0 ? (
            <p className="small muted">Empty. <code>git stash</code> puts uncommitted work here.</p>
          ) : (
            <ol className="plain sr-list">
              {data.stashes.map((s) => (
                <li key={s.ref}><span className="mono">{s.ref}</span><span className="grow" title={s.message}>{s.message}</span></li>
              ))}
            </ol>
          )}
        </div>
        <div className="sr-col">
          <div className="panel-head">
            <h2 className="h-sm">Reflog</h2>
            <span className="small muted">everywhere HEAD has been, newest first</span>
          </div>
          {data.reflog.length === 0 ? (
            <p className="small muted">Nothing yet.</p>
          ) : (
            <ol className="plain sr-list">
              {data.reflog.map((e, i) => {
                const lost = commits.find((c) => c.short === e.short)?.reachable === false;
                return (
                  <li key={i}>
                    <span className="mono muted">HEAD@{`{${i}}`}</span>
                    <span className="mono">{e.short}</span>
                    <span className="grow" title={e.action}>{e.action}</span>
                    {lost && <span className="small tone-attention nowrap">no branch</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

// Worktrees ---------------------------------------------------------------------

const Folder = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16"><path fill="#9198a1" d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" /></svg>
);

function WorktreesPanel({ worktrees, cls, style }: { worktrees: PanelData['worktrees'] } & PanelProps) {
  return (
    <section className={`panel topic${cls}`} aria-label="Worktrees" style={style}>
      <div className="panel-head">
        <h2 className="h-sm">Worktrees</h2>
        <span className="small muted">folders checked out from one repository</span>
      </div>
      <div className="topic-scroll">
        <div className="wt" style={{ gridTemplateColumns: `repeat(${Math.max(1, worktrees.length)}, minmax(160px, 240px))` }}>
          {worktrees.map((w) => (
            <div key={w.path} className={`tip wt-card${w.isMain ? ' is-main' : ''}`}>
              <span className="tip-head"><Folder /><b className="mono wt-path" title={w.path}>{w.path}</b></span>
              <span className="small">{w.branch === null ? <span className="tone-attention">detached HEAD</span> : <>on <span className="mono">{w.branch}</span></>}</span>
              <span className="small muted">{w.isMain ? 'main folder, holds .git' : 'linked worktree'}</span>
            </div>
          ))}
          {worktrees.map((w) => <span key={`l-${w.path}`} className="wt-link" aria-hidden="true" />)}
          <div className="tip wt-git">
            <b className="mono">.git</b>
            <span className="small muted">one repository: every commit, branch and stash, shared by {worktrees.length === 1 ? 'this folder' : `all ${worktrees.length} folders`}. A branch can be checked out in only one of them.</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// Workflow ----------------------------------------------------------------------

/** Column of each job: 0 without needs, else one more than its deepest need (cycles and unknown needs count as 0). */
function jobColumns(jobs: WorkflowView['jobs']): Map<string, number> {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const depth = new Map<string, number>();
  const visit = (id: string, path: Set<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const job = byId.get(id);
    if (job === undefined || path.has(id)) return -1;
    path.add(id);
    const d = 1 + Math.max(-1, ...job.needs.map((n) => visit(n, path)));
    path.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const j of jobs) visit(j.id, new Set());
  return depth;
}

function WorkflowPanel({ workflow, cls, style }: { workflow: WorkflowView | null } & PanelProps) {
  const marker = `wf-${useId().replace(/:/g, '')}`;
  const jobs = workflow?.jobs ?? [];
  const [box, rects] = useNodeRects<HTMLDivElement>(JSON.stringify(jobs));
  const depth = jobColumns(jobs);
  const columns: WorkflowView['jobs'][number][][] = [];
  for (const j of jobs) (columns[depth.get(j.id) ?? 0] ??= []).push(j);
  const ids = new Set(jobs.map((j) => j.id));
  const lines = jobs.flatMap((j) =>
    j.needs.flatMap((n) => {
      const a = rects.get(n), b = rects.get(j.id);
      if (!a || !b) return [];
      const x1 = a.x + a.w, y1 = a.y + Math.min(a.h / 2, 28), x2 = b.x - 6, y2 = b.y + Math.min(b.h / 2, 28);
      const mid = (x1 + x2) / 2;
      return [{ key: `${n}-${j.id}`, d: `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}` }];
    }),
  );
  return (
    <section className={`panel topic${cls}`} aria-label="Workflow" style={style}>
      <div className="panel-head">
        <h2 className="h-sm">Workflow</h2>
        <span className="small muted mono">{workflow?.file ?? '.github/workflows/'}</span>
      </div>
      {workflow === null && <p className="small muted">No workflow yet. GitHub runs every YAML file in <code>.github/workflows/</code>.</p>}
      {workflow?.error && <p className="notice"><Alert /><span>{workflow.error}</span></p>}
      {jobs.length > 0 && (
        <div className="topic-scroll">
          <div className="wf" ref={box} role="img" aria-label={jobs.map((j) => `job ${j.id}${j.needs.length ? ` after ${j.needs.join(' and ')}` : ''}, ${j.steps.length} steps`).join('; ')}>
            {columns.map((col, ci) => (
              <div key={ci} className="wf-col" aria-hidden="true">
                {(col ?? []).map((j) => (
                  <div key={j.id} className="tip wf-job" data-node={j.id}>
                    <span className="tip-head"><b className="mono">{j.id}</b></span>
                    <span className="small muted">{j.runsOn ? <>runs on <span className="mono">{j.runsOn}</span></> : <span className="tone-attention">no runs-on</span>}</span>
                    {j.needs.some((n) => !ids.has(n)) && (
                      <span className="small tone-danger">needs {j.needs.filter((n) => !ids.has(n)).join(', ')}: no such job</span>
                    )}
                    {j.steps.length > 0 ? (
                      <ol className="wf-steps mono">
                        {j.steps.map((s, i) => <li key={i} title={s}>{s}</li>)}
                      </ol>
                    ) : (
                      <span className="small tone-attention">no steps</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <svg className="diagram-svg" aria-hidden="true">
              <ArrowMarker id={marker} />
              {lines.map((l) => <path key={l.key} d={l.d} markerEnd={`url(#${marker})`} />)}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}

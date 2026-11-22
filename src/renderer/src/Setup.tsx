import { useState, type FormEvent } from 'react';
import type { LearningPath, SetupStatus } from '../../shared/view-model';
import { ArrowMarker, Check, Cross, EmptyCircle } from './icons';

export const tilde = (p: string): string => p.replace(/^\/Users\/[^/]+/, '~');

const PATHS: { id: LearningPath; label: string; note: string; recommended?: boolean }[] = [
  { id: 'agents', label: 'Working with AI coding agents', recommended: true, note: 'diffs, sync, undo, PRs, worktrees' },
  { id: 'classic', label: 'Classic', note: 'every level in order, from foundations up' },
  { id: 'self', label: 'Pick topics myself', note: 'open the level map and choose' },
];

// Diagram coordinates, 4px grid. Cards are 208 × 120.
const CARDS = [
  { x: 0, y: 0, title: 'Your Terminal', body: 'zsh with real git, nothing wrapped' },
  { x: 352, y: 0, title: 'Practice repo', body: null, accent: true },
  { x: 704, y: 0, title: 'Checks and live view', body: 'GitQuest reads the repo after every command' },
  { x: 0, y: 260, title: 'Lea and Samir', body: 'scripted teammates who push work while you play' },
  { x: 352, y: 260, title: 'origin', body: 'a local bare repo that stands in for GitHub' },
];
const ARROWS = [
  { d: 'M208 60 H348', label: 'you run git', lx: 216, ly: 32, w: 128, align: 'center' },
  { d: 'M560 60 H700', label: 'checks read it', lx: 568, ly: 32, w: 128, align: 'center' },
  { d: 'M420 120 V256', label: 'git push', lx: 324, ly: 182, w: 84, align: 'right' },
  { d: 'M492 260 V124', label: 'fetch, pull', lx: 504, ly: 182, w: 96, align: 'left' },
  { d: 'M208 320 H348', label: 'their commits', lx: 216, ly: 292, w: 128, align: 'center' },
] as const;

export function Setup({ status, onRun }: { status: SetupStatus; onRun: (path: LearningPath) => Promise<void> }) {
  const [path, setPath] = useState<LearningPath>(status.path ?? 'agents');
  const [busy, setBusy] = useState(false);
  const repo = status.pathLabels?.repo ?? tilde(status.paths.repo);
  const data = status.pathLabels?.data ?? tilde(status.paths.data);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await onRun(path); } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <h1 className="page-title">How GitQuest works on your Mac</h1>
      <p className="muted page-sub">Everything is real git. GitQuest only builds practice repos and reads them to check your work.</p>
      <div className="setup-body">
        <div className="setup-diagram" role="img" aria-label={`Your terminal runs git in the practice repo at ${repo}. GitQuest reads that repo to check your work. The repo pushes to and fetches from origin, a local bare repo where the scripted teammates Lea and Samir push their commits.`}>
          <svg width="912" height="400" aria-hidden="true" className="diagram-svg">
            <ArrowMarker id="setup-arrow" />
            {ARROWS.map((a) => <path key={a.d} d={a.d} markerEnd="url(#setup-arrow)" />)}
          </svg>
          {CARDS.map((c) => (
            <div key={c.title} className={`dcard${c.accent ? ' accent' : ''}`} style={{ left: c.x, top: c.y, width: 208, height: 120 }}>
              <span>
                <b>{c.title}</b>
                <br />
                {c.body !== null ? <span className="muted">{c.body}</span> : <span className="mono small muted path-line" title={status.paths.repo}>{repo}</span>}
                {c.body === null && <><br /><span className="muted">its own git config</span></>}
              </span>
            </div>
          ))}
          {ARROWS.map((a) => (
            <span key={a.label} className="dlabel" style={{ left: a.lx, top: a.ly, width: a.w, textAlign: a.align }}>{a.label}</span>
          ))}
          <p className="muted setup-foot">Your ~/.gitconfig, SSH keys and GitHub account are never touched. Practice repos use their own git config in {data}.</p>
        </div>

        <form className="panel inset setup-panel" onSubmit={submit} aria-labelledby="setup-check-title">
          <h2 id="setup-check-title" className="h-sm">Before you start</h2>
          <ul className="setup-checks">
            <li>
              {status.gitVersion ? <Check /> : <Cross />}
              {status.gitVersion ? (
                <span>git {status.gitVersion} found</span>
              ) : (
                <span>Git was not found. Install the Xcode Command Line Tools, then reopen GitQuest: <code>xcode-select --install</code></span>
              )}
            </li>
            <li>
              {status.sandboxReady ? <Check /> : <span className="muted icon"><EmptyCircle /></span>}
              <span>{status.sandboxReady ? 'Sandbox git config ready' : 'Sandbox git config will be created in'} <code>{data}</code></span>
            </li>
            <li>
              {status.repoReady ? <Check /> : <span className="muted icon"><EmptyCircle /></span>}
              <span>{status.repoReady ? 'Practice repo ready at' : 'Practice repo will be created at'} <code>{repo}</code></span>
            </li>
          </ul>
          <fieldset className="paths">
            <legend className="h-sm">Choose a path</legend>
            {PATHS.map((p) => (
              <label key={p.id} className={`path-opt${path === p.id ? ' on' : ''}`}>
                <input type="radio" name="path" value={p.id} checked={path === p.id} onChange={() => setPath(p.id)} />
                <span><span className="strong">{p.label}</span>{p.recommended && <span className="muted"> (recommended)</span>}<br /><span className="small muted">{p.note}</span></span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="btn primary wide" disabled={busy || !status.gitVersion}>
            {busy ? 'Creating practice repo…' : 'Create practice repo'}
          </button>
        </form>
      </div>
    </main>
  );
}

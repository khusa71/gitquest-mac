import { useCallback, useEffect, useState } from 'react';
import type { GitHubStatus, GitQuestApi } from '../../shared/api';
import type { MissionView } from '../../shared/view-model';
import { Alert, Check, Cross, EmptyCircle } from './icons';

/** Electron prefixes errors thrown in main: keep only the sentence meant for the player. */
const readable = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

/**
 * Consent screen for Level 11, shown when the player opens it. Starts the level by itself once the sandbox
 * exists; otherwise says exactly what will be created and waits for the button.
 */
export function GitHubSetup({ api, onReady, onBack }: { api: GitQuestApi; onReady: () => void; onBack: () => void }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async (next?: Promise<GitHubStatus>) => {
    setBusy(true);
    setError(null);
    try {
      const s = await (next ?? api.github.status());
      setStatus(s);
      if (s.sandbox === 'exists' && s.message === null) onReady();
    } catch (e) {
      setError(readable(e));
    } finally {
      setBusy(false);
    }
  }, [api, onReady]);
  useEffect(() => { void check(); }, [check]);

  const repo = status?.repo ?? '<you>/gitquest-sandbox';
  return (
    <main className="page">
      <h1 className="page-title">GitHub for real</h1>
      <p className="muted page-sub">
        This level practises on a real repo on github.com: real pull requests, Actions runs, issues and releases.
        Nothing is created on your account until you press the button below.
      </p>
      <div className="gh-body">
        {status === null ? (
          <p className="muted">{error ? '' : 'Checking the GitHub CLI…'}</p>
        ) : !status.installed ? (
          <section className="panel inset gh-panel" aria-labelledby="gh-step">
            <h2 id="gh-step" className="h-sm">Install the GitHub CLI first</h2>
            <p className="muted">GitQuest talks to GitHub through gh, the official command line tool. In Terminal run:</p>
            <pre className="gh-code mono">brew install gh{'\n'}gh auth login</pre>
            <p className="small muted">No Homebrew? Download gh from cli.github.com, then sign in with gh auth login.</p>
          </section>
        ) : !status.loggedIn ? (
          <section className="panel inset gh-panel" aria-labelledby="gh-step">
            <h2 id="gh-step" className="h-sm">Sign in to GitHub with gh</h2>
            {status.message ? (
              <p className="notice" role="status"><Alert /><span>{status.message}</span></p>
            ) : (
              <>
                <p className="muted">gh is installed but not signed in. In Terminal run, and choose HTTPS when asked:</p>
                <pre className="gh-code mono">gh auth login</pre>
              </>
            )}
          </section>
        ) : (
          <section className="panel inset gh-panel" aria-labelledby="gh-step">
            <h2 id="gh-step" className="h-sm">What GitQuest will create</h2>
            <ul className="setup-checks">
              <li>{status.sandbox === 'exists' ? <Check /> : <span className="muted icon"><EmptyCircle /></span>}<span>A <b>private</b> repository <code>{repo}</code> with a README, under your GitHub account <b>{status.login}</b>. Only you can see it.</span></li>
            </ul>
            <h2 className="h-sm">What GitQuest will do with it</h2>
            <ul className="gh-list">
              <li>Clone it into the practice folder for each mission. Rebuilds re-clone it locally and never rewrite GitHub history.</li>
              <li>You push practice branches named <code>gq/11-…</code>, open pull requests and an issue, merge, publish a release and set a fake secret, all from the terminal.</li>
              <li>Pushed workflows run on GitHub Actions and use a few minutes of the free Actions minutes your account gets for private repos.</li>
              <li>GitQuest reads the repo's pull requests, runs, issues, releases and secret names with gh. It never touches your other repos.</li>
              <li>Pushes sign in through gh only inside the practice repo; your ~/.gitconfig stays untouched.</li>
              <li>Delete the sandbox any time with Delete sandbox in the level view.</li>
            </ul>
            {status.missingScopes.includes('workflow') && (
              <p className="notice" role="status"><Alert /><span>Pushing workflow files needs the workflow permission. In Terminal run <code>gh auth refresh -h github.com -s workflow</code>, then check again.</span></p>
            )}
            {status.message && <p className="notice" role="status"><Alert /><span>{status.message}</span></p>}
          </section>
        )}
        {error && <p className="notice" role="alert"><Cross /><span>{error}</span></p>}
        <div className="gh-actions">
          {status?.loggedIn && status.sandbox === 'missing' && !status.message ? (
            <button type="button" className="btn primary" disabled={busy} onClick={() => void check(api.github.createSandbox())}>
              {busy ? 'Creating the sandbox repo…' : 'Create sandbox repo'}
            </button>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => void check()}>{busy ? 'Checking…' : 'Check again'}</button>
          )}
          <button type="button" className="btn" onClick={onBack}>Back to levels</button>
        </div>
      </div>
    </main>
  );
}

/** Online missions: where the facts come from, Refresh from GitHub, Delete sandbox. Polls while the mission is open. */
export function OnlineBar({ api, mission, active, lastCommand, act, onDeleted }: {
  api: GitQuestApi;
  mission: MissionView;
  /** False while the workspace is hidden (levels, lesson): no polling then. */
  active: boolean;
  lastCommand: string | null;
  act: (p: Promise<unknown>) => void;
  onDeleted: () => void;
}) {
  const online = mission.online;
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const solved = mission.completed !== null;

  // GitHub changes on its own (CI finishing): re-read 6 s after each command, then every 30 s until solved.
  useEffect(() => {
    if (solved || !active) return;
    const soon = setTimeout(() => void api.github.refresh().catch(() => {}), 6000);
    const every = setInterval(() => { if (!document.hidden) void api.github.refresh().catch(() => {}); }, 30_000);
    return () => { clearTimeout(soon); clearInterval(every); };
  }, [api, solved, active, lastCommand]);

  if (!online) return null;
  const remove = async (): Promise<void> => {
    setDeleteError(null);
    try {
      await api.github.deleteSandbox();
      setConfirming(false);
      onDeleted();
    } catch (e) {
      setDeleteError(readable(e));
    }
  };
  return (
    <section className="panel subtle online-bar" aria-label="GitHub sandbox">
      <div className="online-row">
        <span className="strong">GitHub</span>
        {online.repo ? <a className="link mono" href={`https://github.com/${online.repo}`} target="_blank" rel="noreferrer">{online.repo}</a> : <span className="muted">sandbox</span>}
        <span className="small muted">{online.checkedAt ? `read at ${new Date(online.checkedAt).toLocaleTimeString()}` : 'not read yet'}</span>
        <div className="strip-actions online-actions">
          <button type="button" className="btn sm" onClick={() => act(api.github.refresh())}>Refresh from GitHub</button>
          {!confirming && <button type="button" className="btn sm" onClick={() => setConfirming(true)}>Delete sandbox</button>}
        </div>
      </div>
      {online.error && <p className="notice" role="status"><Alert /><span>{online.error}</span></p>}
      {confirming && (
        <div className="online-row">
          <span>Delete <code>{online.repo ?? 'the sandbox'}</code> on GitHub with its pull requests, issues and releases? This cannot be undone.</span>
          <div className="strip-actions online-actions">
            <button type="button" className="btn sm danger" onClick={() => void remove()}>Delete</button>
            <button type="button" className="btn sm" onClick={() => { setConfirming(false); setDeleteError(null); }}>Cancel</button>
          </div>
        </div>
      )}
      {deleteError && <p className="notice" role="alert"><Cross /><span>{deleteError}</span></p>}
    </section>
  );
}

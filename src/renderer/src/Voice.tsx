import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { NATURAL_VOICES, type GitQuestApi, type NaturalVoiceId, type NaturalVoiceStatus, type TutorBackend, type VoiceStatus } from '../../shared/api';
import { toCommand } from '../../shared/spoken';
import { englishVoices, prefs, savePrefs, speak, stopSpeaking, type VoicePrefs } from './read-aloud';

const SPEECH_STATE: Record<VoiceStatus['speech'], string> = {
  ready: 'Ready',
  'needs-permission': 'Asks for permission the first time you talk',
  denied: 'Turned off in System Settings',
  unavailable: 'Not available on this Mac',
};

function Chevron() {
  return (
    <svg aria-hidden="true" className="select-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4.5l3 3 3-3" />
    </svg>
  );
}

/** Renders `code` spans from the tutor's text as inline code. */
function withCode(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i} className="inline-code">{part.slice(1, -1)}</code> : part,
  );
}

const TUTOR_NAMES: Record<TutorBackend, string> = { 'claude-code': 'Claude Code', codex: 'Codex', api: 'Claude API key' };

export interface Turn {
  readonly who: 'you' | 'tutor';
  readonly text: string;
  readonly command: string | null;
}

/** The quiet line under the mission title: live transcript, "Press Enter to run", or a voice error. */
export type VoiceLine = { readonly kind: 'partial' | 'command' | 'error'; readonly text: string } | null;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const SPEECH_OFF: Partial<Record<VoiceStatus['speech'], string>> = {
  denied: 'Microphone or speech recognition is turned off for GitQuest. Turn both on in System Settings → Privacy & Security, then try again.',
  unavailable: "Speech recognition isn't available on this Mac.",
};

const focusTerminal = (): void => document.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus();

/**
 * Listening, routing and the tutor conversation. A final transcript that reads as a shell command is typed into the
 * terminal without Enter; anything else goes to the tutor. `active` = the workspace is on screen (owns Option+Space).
 */
export function useVoice(api: GitQuestApi, status: VoiceStatus | null, onStatus: (s: VoiceStatus) => void, active: boolean) {
  const [listening, setListening] = useState(false);
  const [line, setLine] = useState<VoiceLine>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [tab, setTab] = useState<'theory' | 'tutor'>('theory');
  const live = useRef(false); // listening, readable from key handlers without re-subscribing
  const cancelled = useRef(false);
  const needsKey = status?.tutor === 'needs-key';

  /** Types a command at the prompt (Ctrl-U clears whatever was there first); the player presses Enter. */
  const insert = useCallback((command: string) => {
    api.terminal.write(`\x15${command}`);
    focusTerminal();
    setLine({ kind: 'command', text: command });
  }, [api]);

  const ask = useCallback(async (question: string, spoken: boolean) => {
    setTab('tutor');
    if (needsKey) return; // the Tutor tab explains how to add a key
    setTurns((t) => [...t, { who: 'you', text: question, command: null }]);
    setThinking(true);
    setTutorError(null);
    try {
      const reply = await api.voice.ask(question);
      setTurns((t) => [...t, { who: 'tutor', text: reply.text, command: reply.command }]);
      if (spoken || prefs.readAloud) speak(reply.text, undefined, undefined, () => document.querySelector('.turn.tutor:last-of-type'));
    } catch (e) {
      setTutorError(message(e));
    } finally {
      setThinking(false);
    }
  }, [api, needsKey]);

  const route = (text: string): void => {
    const command = toCommand(text);
    if (command) {
      insert(command);
      if (prefs.readAloud) speak('Press Enter to run.');
    } else {
      setLine(null);
      void ask(text, true);
    }
  };
  const routeRef = useRef(route);
  routeRef.current = route;

  const end = (): void => {
    live.current = false;
    setListening(false);
  };

  const start = useCallback(async () => {
    if (live.current) return;
    stopSpeaking();
    cancelled.current = false;
    live.current = true;
    setListening(true);
    setLine({ kind: 'partial', text: '' });
    try {
      const s = await api.voice.listen();
      onStatus(s);
      const off = SPEECH_OFF[s.speech];
      if (off) {
        end();
        setLine({ kind: 'error', text: off });
      }
    } catch (e) {
      end();
      setLine({ kind: 'error', text: message(e) });
    }
  }, [api, onStatus]);

  /** Stops listening; the final transcript then gets routed. `cancel` (Esc) drops it instead. */
  const stop = useCallback((cancel: boolean) => {
    if (!live.current) return;
    cancelled.current = cancel;
    end();
    if (cancel) setLine(null);
    api.voice.stopListening().catch((e: unknown) => setLine({ kind: 'error', text: message(e) }));
  }, [api]);

  useEffect(() => api.voice.onTranscript((t) => {
    if (cancelled.current) return;
    if (!t.final) {
      if (live.current) setLine({ kind: 'partial', text: t.text });
      return;
    }
    end();
    const text = t.text.trim();
    if (text) routeRef.current(text);
    else setLine(null);
  }), [api]);

  // Push-to-talk: hold Option+Space. Captured before xterm sees it; every other key still reaches the terminal.
  useEffect(() => {
    if (!active) return;
    let held = false;
    const release = (): void => {
      if (!held) return;
      held = false;
      stop(false);
    };
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat && !held && !live.current) {
          held = true;
          void start();
        }
      } else if (e.key === 'Escape' && live.current) {
        e.preventDefault();
        e.stopPropagation();
        held = false;
        stop(true);
      }
    };
    const up = (e: KeyboardEvent): void => {
      if (held && (e.code === 'Space' || e.key === 'Alt')) {
        e.preventDefault();
        e.stopPropagation();
        release();
      }
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
    };
  }, [active, start, stop]);

  const toggle = useCallback(() => (live.current ? stop(false) : void start()), [start, stop]);
  /** The command line goes away once the player runs something. */
  const commandRan = useCallback(() => setLine((l) => (l?.kind === 'command' ? null : l)), []);

  return { listening, line, toggle, turns, thinking, tutorError, tab, setTab, ask, insert, commandRan };
}

export const MicIcon = ({ filled }: { filled?: boolean }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="5.25" y="1.25" width="5.5" height="8.5" rx="2.75" fill={filled ? 'currentColor' : 'none'} />
    <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2.25" />
  </svg>
);

export const SpeakerIcon = ({ filled }: { filled?: boolean }) => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.75 5.75h2.5L7.75 2.75v10.5l-3.5-3H1.75z" fill={filled ? 'currentColor' : 'none'} />
    <path d="M10.25 5.5a3.5 3.5 0 0 1 0 5M12.25 3.5a6.25 6.25 0 0 1 0 9" />
  </svg>
);

export const SettingsIcon = () => (
  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M1.75 4h12.5M1.75 8h12.5M1.75 12h12.5" />
    <circle cx="5" cy="4" r="1.75" fill="#010409" />
    <circle cx="10.5" cy="8" r="1.75" fill="#010409" />
    <circle cx="6.5" cy="12" r="1.75" fill="#010409" />
  </svg>
);

interface TutorProps {
  readonly turns: readonly Turn[];
  readonly thinking: boolean;
  readonly error: string | null;
  readonly needsKey: boolean;
  readonly ask: (question: string, spoken: boolean) => void;
  readonly insert: (command: string) => void;
  readonly openSettings: () => void;
}

export function TutorPanel({ turns, thinking, error, needsKey, ask, insert, openSettings }: TutorProps) {
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, thinking, error]);

  if (needsKey) {
    return (
      <div className="tutor-empty">
        <p className="muted">The tutor answers questions about this mission. It uses Claude Code or Codex if one is installed and signed in on this Mac (run claude or codex once in Terminal to sign in), or a Claude API key.</p>
        <button type="button" className="btn" onClick={openSettings}>Tutor settings</button>
      </div>
    );
  }

  const send = (e: FormEvent): void => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || thinking) return;
    setDraft('');
    ask(q, false);
  };
  return (
    <>
      <ol className="tutor-log" ref={log} aria-label="Conversation with the tutor">
        {turns.length === 0 && !thinking && (
          <li className="muted small">Ask anything about this mission. Hold Option-Space to ask out loud, or type below.</li>
        )}
        {turns.map((t, i) => (
          <li key={i} className={`turn ${t.who}`}>
            <span className="small muted">{t.who === 'you' ? 'You' : 'Tutor'}</span>
            <p>{withCode(t.text)}</p>
            {t.command && (
              <div className="turn-cmd">
                <code>{t.command}</code>
                <button type="button" className="btn sm" onClick={() => insert(t.command!)} aria-label={`Insert ${t.command} into the terminal`}>Insert command</button>
              </div>
            )}
          </li>
        ))}
        {thinking && <li className="small muted" role="status">Thinking…</li>}
        {error && <li className="tutor-error small" role="alert">{error}</li>}
      </ol>
      <form className="tutor-ask" onSubmit={send}>
        <label htmlFor="tutor-q" className="sr-only">Ask the tutor</label>
        <input id="tutor-q" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask the tutor" autoComplete="off" />
        <button type="submit" className="btn" disabled={!draft.trim() || thinking}>Ask</button>
      </form>
    </>
  );
}

const SPEECH_HELP: Record<VoiceStatus['speech'], string> = {
  ready: 'Speech recognition runs on this Mac. Hold Option-Space, or click Talk, and say a git command or a question.',
  'needs-permission': 'macOS will ask for microphone and speech permission the first time you talk.',
  denied: 'Microphone or speech recognition access is off. Open System Settings → Privacy & Security, turn GitQuest on under Microphone and under Speech Recognition, then reopen GitQuest.',
  unavailable: "Speech recognition isn't available on this Mac.",
};

interface SettingsProps {
  readonly api: GitQuestApi;
  readonly status: VoiceStatus | null;
  readonly onStatus: (s: VoiceStatus) => void;
  readonly onClose: () => void;
}

export function VoiceSettings({ api, status, onStatus, onClose }: SettingsProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState<VoicePrefs>(prefs);
  const [voices, setVoices] = useState(englishVoices);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [natural, setNatural] = useState<NaturalVoiceStatus | null>(null);
  const naturalOn = natural?.state === 'ready' || natural?.state === 'loading';

  useEffect(() => {
    const off = api.voice.natural.onStatus(setNatural);
    api.voice.natural.status().then(setNatural, (e: unknown) => setNatural({ state: 'error', progress: null, error: message(e) }));
    return off;
  }, [api]);
  const downloadNatural = (): void => {
    api.voice.natural.download().then(setNatural, (e: unknown) => setNatural({ state: 'error', progress: null, error: message(e) }));
  };

  useEffect(() => {
    dialog.current?.showModal();
    // showModal focuses the first button (Close) with a ring; start on the body instead.
    dialog.current?.querySelector<HTMLElement>('.dialog-body')?.focus();
    if (typeof speechSynthesis === 'undefined') return;
    const load = (): void => setVoices(englishVoices());
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const update = (patch: Partial<VoicePrefs>): void => {
    const next = { ...p, ...patch };
    setP(next);
    savePrefs(next);
  };
  const keyAction = async (run: () => Promise<VoiceStatus>): Promise<void> => {
    setBusy(true);
    setKeyError(null);
    try {
      onStatus(await run());
      setKey('');
    } catch (e) {
      setKeyError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const saveKey = (e: FormEvent): void => {
    e.preventDefault();
    if (key.trim()) void keyAction(() => api.voice.setApiKey(key.trim()));
  };

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="voice-title" aria-describedby="voice-sub" onClose={onClose}>
      <header className="dialog-head">
        <div>
          <h2 id="voice-title" className="dialog-title">Voice and tutor</h2>
          <p id="voice-sub" className="dialog-sub">Talk to GitQuest, choose who answers, and how it reads to you.</p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => dialog.current?.close()}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div className="dialog-body" tabIndex={-1}>
        <section className="settings-group" aria-labelledby="voice-speech">
          <h3 id="voice-speech" className="settings-title">Speech recognition</h3>
          <div className="setting">
            <span className="setting-label">Status</span>
            <div className="setting-control">
              <span className="status-line">
                <span aria-hidden="true" className={`status-dot ${status?.speech === 'ready' ? 'ok' : status?.speech === 'needs-permission' ? 'wait' : 'off'}`} />
                {status ? SPEECH_STATE[status.speech] : 'Checking'}
              </span>
              <p className="setting-help">{status ? SPEECH_HELP[status.speech] : ''}</p>
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="voice-tutor">
          <h3 id="voice-tutor" className="settings-title">Tutor</h3>
          <div className="setting">
            <label htmlFor="voice-tutor-pick" className="setting-label">Answers from</label>
            <div className="setting-control">
              <span className="select">
                <select
                  id="voice-tutor-pick"
                  value={status?.tutorPreference ?? 'auto'}
                  disabled={busy || !status}
                  onChange={(e) => void keyAction(() => api.voice.setTutorBackend(e.target.value as TutorBackend | 'auto'))}
                >
                  <option value="auto">Automatic{status?.tutorBackend ? ` (${TUTOR_NAMES[status.tutorBackend]})` : ''}</option>
                  {(['claude-code', 'codex', 'api'] as const).map((b) => (
                    <option key={b} value={b} disabled={!status?.tutorChoices.includes(b)}>
                      {TUTOR_NAMES[b]}{status?.tutorChoices.includes(b) ? '' : ' (not set up)'}
                    </option>
                  ))}
                </select>
                <Chevron />
              </span>
              <p className="setting-help">Claude Code and Codex use your own login. GitQuest runs them with every tool switched off, so they can only answer.</p>
            </div>
          </div>
          <div className="setting">
            <label htmlFor="voice-key-input" className="setting-label">API key</label>
            <div className="setting-control">
              {status?.tutorChoices.includes('api') ? (
                <div className="control-row">
                  <span className="status-line"><span aria-hidden="true" className="status-dot ok" />Key saved</span>
                  <button type="button" className="btn" disabled={busy} onClick={() => void keyAction(() => api.voice.clearApiKey())}>Remove</button>
                </div>
              ) : (
                <form className="control-row" onSubmit={saveKey}>
                  <input id="voice-key-input" className="input grow" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Optional, sk-ant-…" autoComplete="off" spellCheck={false} />
                  <button type="submit" className="btn" disabled={busy || !key.trim()}>Save</button>
                </form>
              )}
              <p className="setting-help">Only needed without Claude Code or Codex. Stored encrypted in your keychain.</p>
              {keyError && <p className="tutor-error small" role="alert">{keyError}</p>}
            </div>
          </div>
        </section>

        <section className="settings-group" aria-labelledby="voice-read">
          <h3 id="voice-read" className="settings-title">Reading aloud</h3>
          <div className="setting">
            <label htmlFor={naturalOn ? 'voice-natural' : undefined} className="setting-label">Natural voice</label>
            <div className="setting-control">
              {naturalOn ? (
                <div className="control-row">
                  <span className="select grow">
                    <select id="voice-natural" value={p.natural} onChange={(e) => update({ natural: e.target.value as NaturalVoiceId, voice: '' })}>
                      {NATURAL_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.accent})</option>)}
                    </select>
                    <Chevron />
                  </span>
                  <button type="button" className="btn" onClick={() => speak('Hi, I will read your lessons and hints like this. Ready to learn some git?', undefined, 'natural')}>
                    Play sample
                  </button>
                </div>
              ) : (
                <div className="control-row">
                  <span className="status-line" role="status">
                    <span aria-hidden="true" className={`status-dot ${natural?.state === 'downloading' ? 'wait' : 'off'}`} />
                    {!natural ? 'Checking'
                      : natural.state === 'downloading' ? `Downloading${natural.progress === null ? '' : ` ${Math.round(natural.progress * 100)}%`}`
                      : natural.state === 'error' ? "Couldn't load"
                      : 'Not downloaded'}
                  </span>
                  {(natural?.state === 'not-downloaded' || natural?.state === 'error') && (
                    <button type="button" className="btn" onClick={downloadNatural}>
                      {natural.state === 'error' ? 'Try again' : 'Download natural voice'}
                    </button>
                  )}
                </div>
              )}
              <p className="setting-help">
                {naturalOn
                  ? 'Reads whenever Voice is Automatic. Runs on this Mac, no internet needed.'
                  : 'About 90 MB, runs on this Mac, free. Sounds far more human than the built-in voices.'}
              </p>
              {natural?.state === 'error' && natural.error && <p className="tutor-error small" role="alert">{natural.error}</p>}
            </div>
          </div>
          <div className="setting">
            <label htmlFor="voice-pick" className="setting-label">Voice</label>
            <div className="setting-control">
              <div className="control-row">
                <span className="select grow">
                  <select id="voice-pick" value={p.voice} onChange={(e) => update({ voice: e.target.value })}>
                    <option value="">Automatic{naturalOn ? ` (Natural: ${NATURAL_VOICES.find((v) => v.id === p.natural)?.name ?? 'Heart'})` : voices[0] ? ` (${voices[0].name})` : ''}</option>
                    {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                  </select>
                  <Chevron />
                </span>
                <button type="button" className="btn" onClick={() => speak('Hi, I will read your lessons and hints like this. Ready to learn some git?')}>
                  Play sample
                </button>
              </div>
              <p className="setting-help">Premium voices like Ava or Zoe sound most natural. Add them in System Settings, Accessibility, Spoken Content.</p>
            </div>
          </div>
          <div className="setting">
            <label htmlFor="voice-rate" className="setting-label">Speed</label>
            <div className="setting-control">
              <div className="control-row">
                <input id="voice-rate" className="range" type="range" min="0.6" max="1.6" step="0.1" value={p.rate} onChange={(e) => update({ rate: Number(e.target.value) })} />
                <output htmlFor="voice-rate" className="rate">{p.rate.toFixed(1)}×</output>
              </div>
            </div>
          </div>
          <div className="setting">
            <span className="setting-label" aria-hidden="true" />
            <label className="setting-control check-row">
              <input type="checkbox" checked={p.readAloud} onChange={(e) => update({ readAloud: e.target.checked })} />
              Read hints and reasons aloud
            </label>
          </div>
        </section>
      </div>

      <footer className="dialog-foot">
        <button type="button" className="btn primary" onClick={() => dialog.current?.close()}>Done</button>
      </footer>
    </dialog>
  );
}

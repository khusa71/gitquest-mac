import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GitQuestApi, VoiceStatus } from '../../shared/api';
import type { LevelSummary, MissionView, WorkspaceView } from '../../shared/view-model';
import { OnlineBar } from './GitHub';
import { Alert, Check, CheckCircle, CurrentCircle, EmptyCircle } from './icons';
import { TargetCard, TopicPanels } from './Panels';
import { Splitter, usePanelSize } from './Splitter';
import { prefs, speak, stopSpeaking } from './read-aloud';
import { Terminal } from './Terminal';
import { MicIcon, SpeakerIcon, TutorPanel, useVoice, type VoiceLine } from './Voice';

export const levelName = (l: LevelSummary): string => (l.number === 0 ? l.title : `${l.number} ${l.title}`);

export function currentLevel(view: WorkspaceView): LevelSummary | undefined {
  const id = view.mission?.id;
  return view.levels.find((l) => l.missions.some((m) => (id ? m.id === id : m.state === 'current')));
}

interface Props {
  hidden?: boolean;
  sidebarOpen: boolean;
  api: GitQuestApi;
  view: WorkspaceView;
  act: (p: Promise<unknown>) => void;
  startMission: (id: string) => void;
  openLevel: (level: LevelSummary) => void;
  showLevels: () => void;
  voiceStatus: VoiceStatus | null;
  onVoiceStatus: (s: VoiceStatus) => void;
  openVoiceSettings: () => void;
  openLesson: (levelId: string) => void;
}

export function Workspace({ hidden, sidebarOpen, api, view, act, startMission, openLevel, showLevels, voiceStatus, onVoiceStatus, openVoiceSettings, openLesson }: Props) {
  const level = currentLevel(view);
  const mission = view.mission;
  const sidebar = usePanelSize('gq.sidebarWidth', 240, 180, 360);
  const aside = usePanelSize('gq.terminalWidth', 420, 300, 900);
  const theory = usePanelSize('gq.helpHeight', 260, 80, 560);
  const voice = useVoice(api, voiceStatus, onVoiceStatus, !hidden && mission !== null);
  const { commandRan } = voice;
  useEffect(() => commandRan(), [view.lastCommand, commandRan]);
  const areas = usePanelSize('gq.areasHeight', 300, 160, 640);
  // The theory text never scrolls: the panel grows to fit it (up to the splitter's max), the terminal gives way.
  const theoryBody = useRef<HTMLDivElement>(null);
  const { size: theorySize, set: setTheorySize } = theory;
  useLayoutEffect(() => {
    const el = theoryBody.current;
    if (el && !hidden && el.scrollHeight > el.clientHeight) setTheorySize(theorySize + el.scrollHeight - el.clientHeight);
  }, [mission?.id, voice.tab, hidden, theorySize, setTheorySize]);
  return (
    <div className="ws" hidden={hidden}>
      {sidebarOpen && (
        <>
          <Sidebar view={view} level={level} width={sidebar.size} startMission={startMission} openLevel={openLevel} showLevels={showLevels} openLesson={openLesson} />
          <Splitter label="Resize missions sidebar" orientation="vertical" panel={sidebar} min={180} max={360} grows={1} />
        </>
      )}
      <main className="ws-main">
        {mission && (
          <MissionStrip mission={mission} api={api} act={act} listening={voice.listening} toggleListen={voice.toggle} line={voice.line} speech={voiceStatus?.speech ?? null} />
        )}
        {mission?.online && <OnlineBar api={api} mission={mission} active={!hidden} lastCommand={view.lastCommand} act={act} onDeleted={showLevels} />}
        {mission?.completed && (
          <MissionComplete mission={mission} startMission={startMission} showLevels={showLevels} />
        )}
        <TopicPanels view={view} panels={mission?.panels ?? ['history', 'areas']} size={areas} />
      </main>
      <Splitter label="Resize terminal" orientation="vertical" panel={aside} min={300} max={900} grows={-1} />
      <aside className="ws-aside" aria-label="Terminal and theory" style={{ width: aside.size }}>
        <section className="panel term" aria-label="Terminal">
          <div className="term-bar">
            <span className="strong">Terminal</span>
            <span>zsh · real git</span>
            {view.lastCommand && <span className="term-last mono" title="Last command">{view.lastCommand}</span>}
          </div>
          <Terminal api={api} />
        </section>
        {mission && (
          <>
            <Splitter label="Resize terminal height" orientation="horizontal" panel={theory} min={80} max={560} grows={-1} />
            <section className="panel theory" aria-label="Theory and tutor" style={{ height: theory.size }}>
              <Tabs tab={voice.tab} setTab={voice.setTab} />
              {voice.tab === 'theory' ? (
                <div ref={theoryBody} className="tab-body" role="tabpanel" id="panel-theory" aria-labelledby="tab-theory">
                  <h2 className="h-sm">{mission.theory.title}</h2>
                  <p className="muted">{mission.theory.body}</p>
                  <p className="theory-lesson">
                    <span className="small muted">{mission.theory.lesson}</span>
                    {(level?.lesson.slides ?? 0) > 0 && (
                      <button type="button" className="link small" onClick={() => openLesson(mission.level.id)}>Open the lesson</button>
                    )}
                  </p>
                </div>
              ) : (
                <div className="tab-body tutor" role="tabpanel" id="panel-tutor" aria-labelledby="tab-tutor">
                  <TutorPanel
                    turns={voice.turns}
                    thinking={voice.thinking}
                    error={voice.tutorError}
                    needsKey={voiceStatus?.tutor === 'needs-key'}
                    ask={(q, spoken) => void voice.ask(q, spoken)}
                    insert={voice.insert}
                    openSettings={openVoiceSettings}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: 'theory' | 'tutor'; setTab: (t: 'theory' | 'tutor') => void }) {
  const tabs = [['theory', 'Theory'], ['tutor', 'Tutor']] as const;
  // Two tabs: either arrow key moves to the other one (roving focus, like a native tab strip).
  const flip = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const next = tab === 'theory' ? 'tutor' : 'theory';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Theory and tutor" onKeyDown={flip}>
      {tabs.map(([id, label]) => (
        <button key={id} type="button" role="tab" id={`tab-${id}`} className="tab" aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Sidebar({ view, level, width, startMission, openLevel, showLevels, openLesson }: { view: WorkspaceView; level: LevelSummary | undefined; width: number } & Pick<Props, 'startMission' | 'openLevel' | 'showLevels' | 'openLesson'>) {
  const order = level?.suggestedOrder ?? -1;
  const next = view.levels
    .filter((l) => l !== level && l.suggestedOrder !== null && l.suggestedOrder > order && l.done < l.planned)
    .sort((a, b) => (a.suggestedOrder ?? 0) - (b.suggestedOrder ?? 0))
    .slice(0, 4);
  return (
    <nav className="sidebar" aria-label="Missions" style={{ width }}>
      {level && (
        <>
          <h2 className="side-title">{levelName(level)}</h2>
          {level.lesson.slides > 0 && (
            <button type="button" className="link side-lesson" onClick={() => openLesson(level.id)}>
              Read the lesson{level.lesson.read ? ' again' : ''}
            </button>
          )}
          <ul className="side-list">
            {level.missions.map((m) => {
              const current = m.id === view.mission?.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`side-item${current ? ' is-current' : ''}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => startMission(m.id)}
                    title={m.state === 'done' ? `${m.title} · done, ${m.stars} of 3 stars` : m.title}
                  >
                    {m.state === 'done' ? <CheckCircle /> : m.state === 'current' || current ? <CurrentCircle /> : <span className="muted icon"><EmptyCircle /></span>}
                    <span className="grow">{m.title}</span>
                    <span className="num">{m.number}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {level.planned > level.missions.length && (
            <p className="side-note">{level.planned - level.missions.length} more missions coming</p>
          )}
        </>
      )}
      {next.length > 0 && (
        <>
          <h2 className="side-title spaced">Suggested next</h2>
          <ul className="side-list">
            {next.map((l) => (
              <li key={l.id}>
                <button type="button" className="side-item" title={levelName(l)} onClick={() => openLevel(l)}>
                  <span className="grow">{levelName(l)}</span>
                  <span className="num">{l.done} / {l.planned}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="link side-all" onClick={showLevels}>All {view.levels.length} levels</button>
    </nav>
  );
}

interface StripProps {
  mission: MissionView;
  api: GitQuestApi;
  act: Props['act'];
  listening: boolean;
  toggleListen: () => void;
  line: VoiceLine;
  speech: VoiceStatus['speech'] | null;
}

function MissionStrip({ mission, api, act, listening, toggleListen, line, speech }: StripProps) {
  const hintsLeft = mission.hintsTotal - mission.hints.length;
  const [reading, setReading] = useState(false);
  const readMission = (): void => {
    if (reading) {
      stopSpeaking();
      return setReading(false);
    }
    setReading(true);
    speak(`${mission.title}. ${mission.outcome?.summary ?? mission.story} ${mission.goal}`, () => setReading(false), undefined, () => document.querySelector('.strip'));
  };
  useEffect(() => { if (listening) stopSpeaking(); }, [listening]);

  // With "Read hints and reasons aloud" on, speak each new hint and each new "not validated yet" reason.
  const seen = useRef({ id: mission.id, hints: mission.hints.length, blocked: mission.blockedReason });
  useEffect(() => {
    const before = seen.current;
    seen.current = { id: mission.id, hints: mission.hints.length, blocked: mission.blockedReason };
    if (!prefs.readAloud || before.id !== mission.id) return;
    if (mission.hints.length > before.hints) speak(`Hint ${mission.hints.length}. ${mission.hints[mission.hints.length - 1]}`, undefined, undefined, () => document.querySelector('.hints li:last-child'));
    else if (mission.blockedReason && mission.blockedReason !== before.blocked) speak(`Not validated yet. ${mission.blockedReason}`, undefined, undefined, () => document.querySelector('.strip .notice'));
  }, [mission.id, mission.hints, mission.blockedReason]);

  const unavailable = speech === 'unavailable';
  return (
    <section className="panel subtle strip" aria-labelledby="mission-title">
      <div className="strip-row">
        <h1 id="mission-title" className="strip-title">{mission.title}</h1>
        <span className="small muted" title="Commands that change the repo count; read-only ones do not">
          {mission.commandsUsed} used · par {mission.par}
        </span>
        <div className="strip-actions">
          <button
            type="button"
            className="btn icon-only"
            aria-pressed={reading}
            aria-label={reading ? 'Stop reading' : 'Read the mission aloud'}
            title={reading ? 'Stop reading' : 'Read the mission aloud'}
            onClick={readMission}
          >
            <SpeakerIcon filled={reading} />
          </button>
          <button
            type="button"
            className="btn with-icon"
            aria-pressed={listening}
            disabled={unavailable}
            onClick={toggleListen}
            title={unavailable ? "Speech recognition isn't available on this Mac" : listening ? 'Stop listening (Esc cancels)' : 'Say a git command or ask a question. Or hold Option-Space'}
          >
            <MicIcon filled={listening} />
            {listening ? 'Listening' : 'Talk'}
          </button>
          <button type="button" className="btn" disabled={hintsLeft <= 0} onClick={() => act(api.hint())}>
            {mission.hints.length === 0 ? 'Hint' : `Hint ${Math.min(mission.hints.length + 1, mission.hintsTotal)} of ${mission.hintsTotal}`}
          </button>
          <button
            type="button"
            className="btn"
            disabled={!mission.undoAllowed}
            onClick={() => act(api.undo())}
            title={mission.undoAllowed ? 'Restore the repo to before the last command that changed it' : 'This mission is about recovering with git itself, so Undo is off'}
          >
            Undo
          </button>
          <button type="button" className="btn" onClick={() => act(api.restart())} title="Rebuild this mission's starting repo">Restart</button>
        </div>
      </div>
      <TargetCard key={mission.id} mission={mission} />
      <div className="strip-row">
        <p className="strip-goal">{mission.goal}</p>
        <ol className="checks" aria-label="Checks">
          {mission.checks.map((c, i) => (
            <li key={`${i}-${c.label}`} className={c.done ? '' : 'muted'} title={c.proof ? `Proof: ${c.proof}` : undefined}>
              {c.done ? <Check /> : <EmptyCircle />}
              <span>{c.label}</span>
              <span className="sr-only">{c.done ? ', done' : ', not yet'}.{c.proof ? ` Proof: ${c.proof}` : ''}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className={`voice-line${line?.kind === 'error' ? ' is-error' : ''}`} aria-live="polite">
        {line?.kind === 'partial' && (line.text ? <span className="mono">{line.text}</span> : <span className="muted">Listening. Say a git command or ask a question. Esc cancels.</span>)}
        {line?.kind === 'command' && <><code>{line.text}</code><span className="muted">is in the terminal. Press Enter to run.</span></>}
        {line?.kind === 'error' && line.text}
      </p>
      {mission.danger && <p className="notice"><Alert /><span>{mission.danger}</span></p>}
      {mission.blockedReason && <p className="notice" role="status"><Alert /><span>{mission.blockedReason}</span></p>}
      {mission.hints.length > 0 && (
        <ol className="hints" aria-label="Hints">
          {mission.hints.map((h, i) => (
            <li key={i}><span className="muted">Hint {i + 1}</span> {h}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MissionComplete({ mission, startMission, showLevels }: { mission: MissionView } & Pick<Props, 'startMission' | 'showLevels'>) {
  const done = mission.completed;
  if (!done) return null;
  return (
    <section className="panel complete" role="status" aria-label="Mission complete">
      <div className="complete-head">
        <span className="strong">Mission {mission.number} complete</span>
        <span className="small muted">{done.stars} of 3 stars · {done.used} {done.used === 1 ? 'command' : 'commands'}, par {mission.par}</span>
        {done.next ? (
          <button type="button" className="btn primary" onClick={() => startMission(done.next!)}>Next mission</button>
        ) : (
          <button type="button" className="btn primary" onClick={showLevels}>{mission.capstone ? 'Level complete · back to levels' : 'Back to levels'}</button>
        )}
      </div>
      <p className="muted">{done.takeaway}</p>
    </section>
  );
}

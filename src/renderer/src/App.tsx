import { useCallback, useEffect, useState } from 'react';
import type { GitQuestApi, VoiceStatus } from '../../shared/api';
import type { LearningPath, LevelSummary, SetupStatus, WorkspaceView } from '../../shared/view-model';
import { GitHubSetup } from './GitHub';
import { Cross } from './icons';
import { Lesson } from './Lesson';
import { Levels } from './Levels';
import { Setup } from './Setup';
import { SettingsIcon, VoiceSettings } from './Voice';
import { currentLevel, levelName, Workspace } from './Workspace';

type Screen = 'loading' | 'setup' | 'levels' | 'workspace' | 'lesson' | 'github';

export function App({ api, voiceSettingsOpen = false, initialLesson = null }: { api: GitQuestApi; voiceSettingsOpen?: boolean; initialLesson?: string | null }) {
  const [screen, setScreen] = useState<Screen>('loading');
  /** Level whose lesson is open, and the screen to return to. */
  const [lesson, setLesson] = useState<{ levelId: string; from: 'levels' | 'workspace' } | null>(null);
  /** Online level waiting behind the GitHub consent screen. */
  const [githubLevel, setGithubLevel] = useState<LevelSummary | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(voiceSettingsOpen);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [view, setView] = useState<WorkspaceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem('gq.sidebarOpen') !== '0';
    } catch {
      return true;
    }
  });
  const toggleSidebar = () =>
    setSidebarOpen((open) => {
      try {
        localStorage.setItem('gq.sidebarOpen', open ? '0' : '1');
      } catch {
        // Remembering the choice is optional.
      }
      return !open;
    });

  const act = useCallback((p: Promise<unknown>) => {
    p.catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const off = api.onView(setView);
    api.voice.status().then(setVoiceStatus, () => setVoiceStatus({ speech: 'unavailable', tutor: 'needs-key', tutorBackend: null, tutorChoices: [], tutorPreference: 'auto' }));
    act((async () => {
      const s = await api.setupStatus();
      setStatus(s);
      if (!s.repoReady) return setScreen('setup');
      const v = await api.getView();
      setView(v);
      setScreen(v.mission ? 'workspace' : 'levels');
      if (initialLesson) {
        setLesson({ levelId: initialLesson, from: v.mission ? 'workspace' : 'levels' });
        setScreen('lesson');
      }
    })());
    return off;
  }, [api, act, initialLesson]);

  const openLesson = useCallback((levelId: string) => {
    setLesson({ levelId, from: screen === 'workspace' ? 'workspace' : 'levels' });
    setScreen('lesson');
  }, [screen]);

  const startMission = useCallback((id: string) => {
    act((async () => {
      await api.startMission(id);
      setView(await api.getView());
      setScreen('workspace');
    })());
  }, [api, act]);

  const startLevel = useCallback((level: LevelSummary) => {
    const first = level.missions.find((m) => m.state !== 'done') ?? level.missions[0];
    if (first) startMission(first.id);
    else setScreen('levels');
  }, [startMission]);

  // Order inside a level: lesson, quiz, missions, capstone. A level not started yet opens on its lesson.
  // Online levels go through the GitHub consent screen, which starts the level once the sandbox exists.
  const openLevel = useCallback((level: LevelSummary, fromLesson = false) => {
    const lessonFirst = !fromLesson && level.lesson.slides > 0 && level.lesson.quizScore === null && level.done === 0
      && !level.missions.some((m) => m.state === 'current');
    if (lessonFirst) {
      setLesson({ levelId: level.id, from: 'levels' });
      return setScreen('lesson');
    }
    if (!level.online) return startLevel(level);
    setGithubLevel(level);
    setScreen('github');
  }, [startLevel]);
  const githubReady = useCallback(() => { if (githubLevel) startLevel(githubLevel); }, [githubLevel, startLevel]);

  const runSetup = async (path: LearningPath): Promise<void> => {
    try {
      const s = await api.runSetup(path);
      setStatus(s);
      if (s.repoReady) {
        setView(await api.getView());
        setScreen('levels');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const level = view ? currentLevel(view) : undefined;
  const lessonLevel = lesson ? view?.levels.find((l) => l.id === lesson.levelId) : undefined;
  // Back to the mission in progress when the lesson was opened from it; else start (or resume) the level's missions.
  const backToMission = lesson?.from === 'workspace' && view?.mission?.level.id === lesson.levelId;
  return (
    <div className="app">
      <header className="titlebar">
        {screen === 'workspace' ? (
          <button
            type="button"
            className="icon-btn"
            onClick={toggleSidebar}
            aria-pressed={sidebarOpen}
            aria-label={sidebarOpen ? 'Hide missions' : 'Show missions'}
            title={sidebarOpen ? 'Hide missions' : 'Show missions'}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
              <path d="M6 2.75v10.5" />
            </svg>
          </button>
        ) : (
          <span className="titlebar-spacer" aria-hidden="true" />
        )}
        <span className="brand">GitQuest</span>
        <nav aria-label="Breadcrumb" className="crumbs">
          {screen === 'setup' && <span className="strong">First run</span>}
          {screen === 'levels' && <span className="strong" aria-current="page">Levels</span>}
          {screen === 'github' && (
            <>
              <button type="button" className="link muted" onClick={() => setScreen('levels')}>Levels</button>
              <span className="muted" aria-hidden="true">/</span>
              <span className="strong" aria-current="page">GitHub for real</span>
            </>
          )}
          {screen === 'lesson' && (
            <>
              <button type="button" className="link muted" onClick={() => setScreen('levels')}>Levels</button>
              <span className="muted" aria-hidden="true">/</span>
              {lessonLevel && <><span className="muted">{levelName(lessonLevel)}</span><span className="muted" aria-hidden="true">/</span></>}
              <span className="strong" aria-current="page">Lesson</span>
            </>
          )}
          {screen === 'workspace' && view?.mission && (
            <>
              <button type="button" className="link muted" onClick={() => setScreen('levels')}>Levels</button>
              <span className="muted" aria-hidden="true">/</span>
              {level && <><span className="muted">{levelName(level)}</span><span className="muted" aria-hidden="true">/</span></>}
              <span className="strong" aria-current="page">Mission {view.mission.number}</span>
            </>
          )}
        </nav>
        {view && screen !== 'setup' && (
          <span className="watch small muted" title={view.repoPath}>
            <span className="dot" aria-hidden="true" />
            Watching {view.repoLabel}
          </span>
        )}
        {(view?.gitVersion ?? status?.gitVersion) && (
          <span className="mono small muted gitver">git {view?.gitVersion ?? status?.gitVersion}</span>
        )}
        <button type="button" className="icon-btn voice-btn" onClick={() => setSettingsOpen(true)} aria-label="Voice settings" title="Voice settings">
          <SettingsIcon />
        </button>
      </header>

      {error && (
        <div className="error" role="alert">
          <Cross />
          <span>{error}</span>
          <button type="button" className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss" title="Dismiss">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      )}

      {screen === 'setup' && status && <Setup status={status} onRun={runSetup} />}
      {screen === 'levels' && view && <Levels levels={view.levels} path={status?.path ?? null} openLevel={openLevel} openLesson={(l) => openLesson(l.id)} />}
      {screen === 'github' && githubLevel && <GitHubSetup api={api} onReady={githubReady} onBack={() => setScreen('levels')} />}
      {screen === 'lesson' && lesson && (
        <Lesson
          key={lesson.levelId}
          api={api}
          levelId={lesson.levelId}
          levelLabel={lessonLevel ? levelName(lessonLevel) : ''}
          act={act}
          practice={() => (backToMission ? setScreen('workspace') : lessonLevel ? openLevel(lessonLevel, true) : setScreen('levels'))}
          practiceLabel={backToMission ? 'Back to the mission' : (lessonLevel?.missions.length ?? 0) > 0 ? 'Start the missions' : 'Back to levels'}
        />
      )}
      {/* ponytail: stays mounted (hidden) on Levels so the terminal keeps its scrollback and pty output */}
      {view && (screen === 'workspace' || screen === 'levels' || screen === 'lesson' || screen === 'github') && (
        <Workspace hidden={screen !== 'workspace'} sidebarOpen={sidebarOpen} api={api} view={view} act={act} startMission={startMission} openLevel={openLevel} showLevels={() => setScreen('levels')} voiceStatus={voiceStatus} onVoiceStatus={setVoiceStatus} openVoiceSettings={() => setSettingsOpen(true)} openLesson={openLesson} />
      )}
      {settingsOpen && <VoiceSettings api={api} status={voiceStatus} onStatus={setVoiceStatus} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

import { app, BrowserWindow, ipcMain, Menu, safeStorage, screen, shell, type MenuItemConstructorOptions } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { Game } from '../game';
import { defaultPaths, type Person } from '../realgit';
import { IPC, NATURAL_VOICES, type VoiceStatus } from '../shared/api';
import type { LearningPath, WorkspaceView } from '../shared/view-model';
import { createNeuralVoice } from './neural-voice';
import { createSpeech } from './speech';
import { Terminal } from './terminal';
import { createTutor } from './tutor';
import { watchRepo } from './watcher';

const LEARNING_PATHS: readonly LearningPath[] = ['agents', 'classic', 'self'];

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

/** Player identity for their own commits: macOS full name, a no-reply email. Their ~/.gitconfig is never read. */
function player(): Person {
  const { username } = os.userInfo();
  let name = username;
  try {
    name = execFileSync('id', ['-F'], { encoding: 'utf8' }).trim() || username;
  } catch {
    // keep the username
  }
  return { name, email: `${username}@users.noreply.local` };
}

async function main(): Promise<void> {
  await app.whenReady();
  // The packaged app takes its icon from build/icon.icns; running from source would show Electron's.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'));
  const paths = defaultPaths();
  const game = new Game({ paths, player: player() });
  try {
    await game.init();
  } catch (e) {
    console.error('[gitquest] game.init failed', e);
  }

  let win: BrowserWindow | null = null;
  let lastView: WorkspaceView | null = null;
  const send = (channel: string, payload: unknown) => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  const push = (view: WorkspaceView) => {
    lastView = view;
    send(IPC.view, view);
  };

  // --- every game call that touches the repo runs one at a time; the watcher stays quiet meanwhile and for 1 s after
  let chain: Promise<unknown> = Promise.resolve();
  let gameBusy = 0;
  let commandRunning = false;
  let quietUntil = 0;
  const isQuiet = () => commandRunning || gameBusy > 0 || Date.now() < quietUntil;
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      gameBusy++;
      try {
        return await fn();
      } finally {
        gameBusy--;
        quietUntil = Date.now() + 1000;
      }
    };
    const p = chain.then(run);
    chain = p.catch(() => {});
    return p;
  }
  /** Runs a game action, then pushes its view (or game.view()). On error: log, re-send the last view; throw only when `rethrow`. */
  async function act(fn: () => Promise<WorkspaceView | void>, rethrow = false): Promise<void> {
    try {
      const view = await serial(fn);
      push(view ?? game.view());
    } catch (e) {
      console.error('[gitquest]', e);
      if (lastView) push(lastView);
      if (rethrow) throw e;
    }
  }
  // Commands are never dropped (they count for stars); repeated refreshes (null) coalesce into one queued call.
  let refreshQueued = false;
  function afterCommand(command: string | null, exitCode: number | null): void {
    if (command === null) {
      if (refreshQueued) return;
      refreshQueued = true;
    }
    void act(() => {
      if (command === null) refreshQueued = false;
      return game.afterCommand(command, exitCode);
    });
  }

  // --- terminal + watcher
  const terminal = new Terminal({
    paths,
    send: (data) => send(IPC.termData, data),
    onCommandStart: () => {
      commandRunning = true;
    },
    onCommandDone: (command, exitCode) => {
      commandRunning = false;
      quietUntil = Date.now() + 1000;
      if (command !== null) afterCommand(command, exitCode);
    },
  });
  let stopWatch = watchRepo(paths.repo, isQuiet, () => afterCommand(null, null));
  /** After setup: watch the new repo and move the shell into it. */
  function repoMaybeCreated(): void {
    if (!existsSync(paths.repo)) return;
    stopWatch ??= watchRepo(paths.repo, isQuiet, () => afterCommand(null, null));
    if (terminal.cwd !== null && terminal.cwd !== paths.repo) terminal.respawn();
  }

  // --- IPC (renderer input is untrusted: validate shapes)
  ipcMain.handle(IPC.getView, () => {
    try {
      lastView = game.view();
    } catch (e) {
      if (!lastView) throw e;
      console.error('[gitquest] view()', e);
    }
    return lastView;
  });
  ipcMain.handle(IPC.setupStatus, () => game.setupStatus());
  ipcMain.handle(IPC.runSetup, async (_e, path: unknown) => {
    if (!LEARNING_PATHS.includes(path as LearningPath)) throw new Error(`unknown learning path: ${String(path)}`);
    const status = await serial(() => game.runSetup(path as LearningPath));
    repoMaybeCreated();
    await act(async () => {});
    return status;
  });
  ipcMain.handle(IPC.startMission, (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('missionId must be a string');
    // Rethrown so the renderer can say why (e.g. Level 11 could not clone the sandbox from GitHub).
    return act(() => game.startMission(id), true);
  });
  // GitHub (Level 11): create and delete only ever run from the player's button press in the renderer.
  ipcMain.handle(IPC.githubStatus, () => game.githubStatus());
  ipcMain.handle(IPC.githubCreate, () => game.createSandbox());
  ipcMain.handle(IPC.githubDelete, () => game.deleteSandbox());
  ipcMain.handle(IPC.githubRefresh, () => act(() => game.refreshGitHub()));
  ipcMain.handle(IPC.hint, () => act(() => game.hint()));
  ipcMain.handle(IPC.undo, () => act(() => game.undo()));
  ipcMain.handle(IPC.restart, () => act(() => game.restart()));
  // Lessons: progress.json only, never the repo (no `serial`, the watcher stays as it is).
  const str = (v: unknown, name: string): string => {
    if (typeof v !== 'string' || v === '' || v.length > 200) throw new Error(`${name} must be a short string`);
    return v;
  };
  ipcMain.handle(IPC.lessonGet, (_e, levelId: unknown) => game.lesson(str(levelId, 'levelId')));
  ipcMain.handle(IPC.lessonSlide, async (_e, levelId: unknown, index: unknown) => {
    if (!Number.isInteger(index)) throw new Error('index must be an integer');
    push(await game.setLessonSlide(str(levelId, 'levelId'), index as number));
  });
  ipcMain.handle(IPC.lessonAnswer, async (_e, levelId: unknown, questionId: unknown, optionId: unknown) => {
    const { correct, view } = await game.answerLesson(str(levelId, 'levelId'), str(questionId, 'questionId'), str(optionId, 'optionId'));
    push(view);
    return { correct };
  });
  // Voice: on-device speech recognition (Swift helper) and the Claude tutor.
  const speech = createSpeech(
    app.isPackaged
      ? join(process.resourcesPath, 'bin', 'gitquest-transcribe')
      : join(app.getAppPath(), 'resources', 'bin', 'gitquest-transcribe'),
  );
  const tutor = createTutor({
    prefsFile: join(paths.data, 'tutor.json'),
    keyFile: join(paths.data, 'tutor-key.bin'),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (data) => safeStorage.decryptString(data),
    canEncrypt: () => safeStorage.isEncryptionAvailable(),
  });
  const voiceStatus = async (speechState?: VoiceStatus['speech']): Promise<VoiceStatus> => {
    const backend = await tutor.backend();
    return {
      speech: speechState ?? (await speech.status()),
      tutor: backend.active ? 'ready' : 'needs-key',
      tutorBackend: backend.active,
      tutorChoices: backend.available,
      tutorPreference: backend.preference,
    };
  };
  ipcMain.handle(IPC.voiceStatus, () => voiceStatus());
  // Resolves with denied/unavailable instead of throwing: the UI explains those states itself.
  ipcMain.handle(IPC.voiceListen, async () => {
    const state = await speech.start(
      (transcript) => send(IPC.voiceTranscript, transcript),
      (message) => console.error('[gitquest] speech:', message),
    );
    return voiceStatus(state);
  });
  ipcMain.handle(IPC.voiceStop, () => speech.stop());
  ipcMain.handle(IPC.voiceAsk, (_e, question: unknown) => {
    if (typeof question !== 'string' || question.trim() === '' || question.length > 2000) {
      throw new Error('Ask a question in a few words.');
    }
    return tutor.ask(question.trim(), lastView ?? game.view());
  });
  ipcMain.handle(IPC.voiceSetKey, async (_e, key: unknown) => {
    if (typeof key !== 'string' || key.trim() === '' || key.length > 500) throw new Error('Paste a Claude API key.');
    await tutor.setKey(key.trim());
    return voiceStatus();
  });
  ipcMain.handle(IPC.voiceSetBackend, async (_e, preference: unknown) => {
    if (preference !== 'auto' && preference !== 'claude-code' && preference !== 'codex' && preference !== 'api') {
      throw new Error('Unknown tutor choice.');
    }
    await tutor.setBackend(preference);
    return voiceStatus();
  });
  ipcMain.handle(IPC.voiceClearKey, async () => {
    await tutor.clearKey();
    return voiceStatus();
  });
  // Natural reading voice: downloads only from the player's button press (IPC.naturalDownload).
  const natural = createNeuralVoice({
    modelsDir: join(paths.data, 'models'),
    workerPath: join(import.meta.dirname, 'neural-voice-worker.js'),
    onStatus: (s) => send(IPC.naturalStatusEvent, s),
    onChunk: (c) => send(IPC.naturalChunk, c),
  });
  ipcMain.handle(IPC.naturalStatus, () => natural.status());
  ipcMain.handle(IPC.naturalDownload, () => natural.download());
  ipcMain.handle(IPC.naturalSpeak, (_e, text: unknown, voice: unknown, speed: unknown) => {
    if (typeof text !== 'string' || text.trim() === '' || text.length > 20000) throw new Error('Nothing to read.');
    if (!NATURAL_VOICES.some((v) => v.id === voice)) throw new Error('Unknown voice.');
    if (typeof speed !== 'number' || !(speed >= 0.5 && speed <= 2)) throw new Error('Speed must be between 0.5 and 2.');
    return natural.speak(text, voice as string, speed);
  });
  ipcMain.handle(IPC.naturalCancel, (_e, id: unknown) => {
    if (typeof id === 'string' && id.length <= 100) natural.cancel(id);
  });

  ipcMain.on(IPC.termWrite, (_e, data: unknown) => {
    if (typeof data === 'string') terminal.write(data);
  });
  ipcMain.on(IPC.termResize, (_e, cols: unknown, rows: unknown) => {
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0 && (n as number) < 10000;
    if (ok(cols) && ok(rows)) terminal.resize(cols, rows);
  });

  // --- window + menu
  const dev = !app.isPackaged;
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    ...(dev
      ? [{ label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }] } as MenuItemConstructorOptions]
      : []),
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  function createWindow(): void {
    // Fit the usable screen (menu bar and Dock excluded) so every edge can be grabbed to resize.
    const area = screen.getPrimaryDisplay().workAreaSize;
    win = new BrowserWindow({
      width: Math.min(1440, area.width - 48),
      height: Math.min(900, area.height - 48),
      minWidth: Math.min(960, area.width),
      minHeight: Math.min(600, area.height),
      center: true,
      title: 'GitQuest',
      backgroundColor: '#0d1117',
      titleBarStyle: 'hiddenInset',
      // Centre the traffic lights in the 52px title bar so they line up with the sidebar toggle and title.
      trafficLightPosition: { x: 20, y: 18 },
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    // The shell normally starts on the renderer's first terminal.resize; this is the fallback.
    win.webContents.on('did-finish-load', () => setTimeout(() => terminal.start(), 2000));
    win.on('closed', () => {
      win = null;
    });
    if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
    else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }

  createWindow();
  if (existsSync(paths.repo)) afterCommand(null, null); // first view reflects the repo as it is on disk

  app.on('second-instance', () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on('activate', () => {
    if (!win) createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    speech.dispose();
    natural.dispose();
    terminal.kill();
    stopWatch?.();
  });
}

import type { Lesson } from '../game/lesson-model';
import type { LearningPath, SetupStatus, WorkspaceView } from './view-model';

export type { Lesson, Slide, Diagram, QuizQuestion } from '../game/lesson-model';

/** Saved per level in progress.json: last slide shown, whether the last slide was ever reached, last option chosen per quiz question. */
export interface LessonProgress {
  readonly slide: number;
  readonly read: boolean;
  readonly quiz: Readonly<Record<string, string>>;
}

/** Voice features: on-device speech recognition (macOS Speech framework) and the Claude-powered tutor. */
export interface VoiceStatus {
  /** ready = can listen; needs-permission = macOS will ask on first listen; denied = turned off in System Settings; unavailable = no recognizer (helper missing or unsupported Mac). */
  readonly speech: 'ready' | 'needs-permission' | 'denied' | 'unavailable';
  /** ready when any tutor backend works: Claude Code or Codex already signed in on this Mac, or a saved Claude API key. */
  readonly tutor: 'ready' | 'needs-key';
  /** Where questions go now: the player's own Claude Code / Codex login, or the API key. */
  readonly tutorBackend: TutorBackend | null;
  /** Backends usable on this Mac. */
  readonly tutorChoices: readonly TutorBackend[];
  readonly tutorPreference: TutorBackend | 'auto';
}

export type TutorBackend = 'claude-code' | 'codex' | 'api';

/** The free on-device reading voice (Kokoro-82M, ~90 MB in ~/.gitquest/models). Never downloaded without the player's click. */
export interface NaturalVoiceStatus {
  readonly state: 'not-downloaded' | 'downloading' | 'loading' | 'ready' | 'error';
  /** 0–1 while downloading, when the size is known. */
  readonly progress: number | null;
  readonly error: string | null;
}

/** One spoken sentence as WAV bytes; `last` ends the utterance (its wav may be empty when generation failed). */
export interface NaturalVoiceChunk {
  readonly id: string;
  readonly index: number;
  readonly last: boolean;
  readonly wav: Uint8Array;
}

/** Curated Kokoro voices (all present in kokoro-js 1.2.1), best first. */
export const NATURAL_VOICES = [
  { id: 'af_heart', name: 'Heart', accent: 'US' },
  { id: 'af_bella', name: 'Bella', accent: 'US' },
  { id: 'af_nicole', name: 'Nicole', accent: 'US' },
  { id: 'am_michael', name: 'Michael', accent: 'US' },
  { id: 'am_fenrir', name: 'Fenrir', accent: 'US' },
  { id: 'bf_emma', name: 'Emma', accent: 'UK' },
  { id: 'bm_george', name: 'George', accent: 'UK' },
] as const;
export type NaturalVoiceId = (typeof NATURAL_VOICES)[number]['id'];

export interface Transcript {
  readonly text: string;
  /** false while the player is still speaking (partial result). */
  readonly final: boolean;
}

export interface TutorReply {
  /** Plain spoken English, 1–4 short sentences, no markdown. */
  readonly text: string;
  /** Set when the tutor suggests a git command the player can insert into the terminal. */
  readonly command: string | null;
}

/** Level 11 (GitHub for real): the GitHub CLI and the player's private sandbox repo. */
export interface GitHubStatus {
  /** `gh` (GitHub CLI) found on this Mac. */
  readonly installed: boolean;
  readonly loggedIn: boolean;
  /** GitHub login of gh's active account. */
  readonly login: string | null;
  /** `<login>/gitquest-sandbox`, null when not signed in. */
  readonly repo: string | null;
  /** exists = created by GitQuest and private; unknown = could not tell (see message). */
  readonly sandbox: 'exists' | 'missing' | 'unknown';
  readonly url: string | null;
  /** Token scopes GitQuest still needs: `workflow` (push CI files), `delete_repo` (Delete sandbox). */
  readonly missingScopes: readonly string[];
  /** A readable problem (offline, a repo with that name GitQuest did not create…), null when fine. */
  readonly message: string | null;
}

/** What the preload script exposes as `window.gitquest`. */
export interface GitQuestApi {
  getView(): Promise<WorkspaceView>;
  /** Called with a fresh view after every command and every repo change. */
  onView(listener: (view: WorkspaceView) => void): () => void;

  setupStatus(): Promise<SetupStatus>;
  /** Creates ~/.gitquest and ~/GitQuest/nova (the story repo at its root state). */
  runSetup(path: LearningPath): Promise<SetupStatus>;

  startMission(missionId: string): Promise<void>;
  /** Reveals the next hint. */
  hint(): Promise<void>;
  /** Restores the snapshot taken before the last command that changed the repo. */
  undo(): Promise<void>;
  /** Rebuilds the current mission's starting state. */
  restart(): Promise<void>;

  /** Level 11. Nothing on GitHub is created or deleted without the player pressing the button. */
  github: {
    status(): Promise<GitHubStatus>;
    /** `gh repo create gitquest-sandbox --private --add-readme`, after explicit consent. */
    createSandbox(): Promise<GitHubStatus>;
    /** `gh repo delete <login>/gitquest-sandbox --yes`; rejects with how to grant `delete_repo` when gh lacks it. */
    deleteSandbox(): Promise<GitHubStatus>;
    /** Re-reads PRs, runs, issues… from GitHub now; the new view arrives through onView. */
    refresh(): Promise<void>;
  };

  voice: {
    status(): Promise<VoiceStatus>;
    /** Starts on-device recognition; transcripts arrive through onTranscript. Resolves once listening started. */
    listen(): Promise<VoiceStatus>;
    /** Stops listening; the last transcript arrives with final: true. */
    stopListening(): Promise<void>;
    onTranscript(listener: (transcript: Transcript) => void): () => void;
    /** Asks the tutor about the current mission and repo; rejects with a readable message on failure. */
    ask(question: string): Promise<TutorReply>;
    setApiKey(key: string): Promise<VoiceStatus>;
    clearApiKey(): Promise<VoiceStatus>;
    /** 'auto' prefers Claude Code, then Codex, then the API key. */
    setTutorBackend(preference: TutorBackend | 'auto'): Promise<VoiceStatus>;
    natural: {
      /** Starts loading the model in the background when it is downloaded but not loaded yet. */
      status(): Promise<NaturalVoiceStatus>;
      /** Downloads (~90 MB from Hugging Face) and loads the model; progress arrives through onStatus. */
      download(): Promise<NaturalVoiceStatus>;
      /** Starts reading; sentences arrive in order through onChunk with the returned id. `speed` 0.5–2. */
      speak(text: string, voice: NaturalVoiceId, speed: number): Promise<string>;
      cancel(id: string): Promise<void>;
      onChunk(listener: (chunk: NaturalVoiceChunk) => void): () => void;
      onStatus(listener: (status: NaturalVoiceStatus) => void): () => void;
    };
  };

  lessons: {
    /** Rejects for an unknown level id. */
    get(levelId: string): Promise<{ lesson: Lesson; progress: LessonProgress }>;
    /** Remembers the slide shown (clamped to the lesson), so the lesson resumes there. */
    setSlide(levelId: string, index: number): Promise<void>;
    /** Saves the answer and says whether it is right. */
    answer(levelId: string, questionId: string, optionId: string): Promise<{ correct: boolean }>;
  };

  terminal: {
    write(data: string): void;
    resize(cols: number, rows: number): void;
    onData(listener: (data: string) => void): () => void;
  };
}

/** IPC channel names shared by main and preload. */
export const IPC = {
  getView: 'gq:get-view',
  view: 'gq:view',
  setupStatus: 'gq:setup-status',
  runSetup: 'gq:run-setup',
  startMission: 'gq:start-mission',
  hint: 'gq:hint',
  undo: 'gq:undo',
  restart: 'gq:restart',
  githubStatus: 'gq:github-status',
  githubCreate: 'gq:github-create',
  githubDelete: 'gq:github-delete',
  githubRefresh: 'gq:github-refresh',
  voiceStatus: 'gq:voice-status',
  voiceListen: 'gq:voice-listen',
  voiceStop: 'gq:voice-stop',
  voiceTranscript: 'gq:voice-transcript',
  voiceAsk: 'gq:voice-ask',
  voiceSetKey: 'gq:voice-set-key',
  voiceClearKey: 'gq:voice-clear-key',
  voiceSetBackend: 'gq:voice-set-backend',
  naturalStatus: 'gq:natural-status',
  naturalDownload: 'gq:natural-download',
  naturalSpeak: 'gq:natural-speak',
  naturalCancel: 'gq:natural-cancel',
  naturalChunk: 'gq:natural-chunk',
  naturalStatusEvent: 'gq:natural-status-event',
  termWrite: 'gq:term-write',
  termResize: 'gq:term-resize',
  termData: 'gq:term-data',
  lessonGet: 'gq:lesson-get',
  lessonSlide: 'gq:lesson-slide',
  lessonAnswer: 'gq:lesson-answer',
} as const;

declare global {
  interface Window {
    gitquest: GitQuestApi;
  }
}

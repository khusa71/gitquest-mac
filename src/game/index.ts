/**
 * game — missions, progress, checks, hints, stars and the carried-forward story repo.
 * Node only (main process), no Electron imports. Uses ../realgit for every git call.
 */
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import * as realgit from '../realgit';
import type { GitQuestPaths, Person } from '../realgit';
import type { RepoState } from '../shared/repo-types';
import type { GitHubStatus } from '../shared/api';
import type { CheckView, LearningPath, MissionView, SetupStatus, WorkspaceView } from '../shared/view-model';
import { EMPTY_FACTS } from '../realgit';
import * as github from '../realgit/github';
import type { Lesson, LessonProgress } from '../shared/api';
import { lessonFor } from './lessons';
import { MISSIONS, levelOf, missionById, type Mission } from './content';
import { SANDBOX_NAME, type GitHubFacts, type MissionContext, type RepoFacts } from './model';
import {
  countedCommands,
  emptyProgress,
  loadProgress,
  saveProgress,
  starsFor,
  withCommand,
  type Progress,
} from './progress';
import {
  preludeParts,
  previousPosition,
  rebuildEntry,
  rebuildInPlace,
  rootParts,
  rootPosition,
  runParts,
  type RunOptions,
} from './story';
import { buildLevels, buildPanelData, buildRepoParts, guidance, hintsOpen, homeLabel, missionPanels } from './view';

export interface GameOptions {
  readonly paths: GitQuestPaths;
  /** Player identity for their own commits inside the practice repo (from `id -F` / os.userInfo). */
  readonly player: Person;
  /** Path to the GitHub CLI for online levels; found on disk when absent (tests pass a fake). */
  readonly gh?: string;
  /** Minimum gap between GitHub reads after commands (default GITHUB_THROTTLE_MS). */
  readonly githubEveryMs?: number;
}

/** Online levels read GitHub after a command at most this often (plus Refresh from GitHub). */
export const GITHUB_THROTTLE_MS = 5000;

/** Cheap change detector: refs, HEAD, index, disk and the commit set. */
function fingerprint(state: RepoState): string {
  const worktree = state.worktrees[state.activeWorktree];
  return JSON.stringify([
    state.branches,
    state.remoteTracking ?? null,
    worktree?.head ?? null,
    worktree?.index ?? null,
    worktree?.workingDir ?? null,
    Object.keys(state.commits).sort(),
  ]);
}

export class Game {
  private readonly paths: GitQuestPaths;
  private readonly player: Person;
  private progress: Progress = emptyProgress();
  private gitVersion: string | null | undefined;
  private state: RepoState | null = null;
  private facts: RepoFacts = EMPTY_FACTS;
  private lastFingerprint: string | null = null;
  private checks: CheckView[] = [];
  private blockedReason: string | null = null;
  private lastCommand: string | null = null;
  private lastView: WorkspaceView;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly gh: string | undefined;
  private readonly githubEveryMs: number;
  private githubLogin: string | null = null;
  private githubFacts: GitHubFacts | null = null;
  private githubError: string | null = null;
  private githubCheckedAt: number | null = null;
  private githubTriedAt = 0;

  constructor(options: GameOptions) {
    this.paths = options.paths;
    this.player = options.player;
    this.gh = options.gh;
    this.githubEveryMs = options.githubEveryMs ?? GITHUB_THROTTLE_MS;
    this.lastView = this.buildView();
  }

  /** Loads ~/.gitquest/progress.json. Never throws on a missing or corrupt file (starts empty). */
  async init(): Promise<void> {
    await this.serial(async () => {
      this.progress = await loadProgress(this.paths.progress);
      await this.version();
      try {
        await this.refresh(null, null);
      } catch {
        this.lastView = this.buildView();
      }
    });
  }

  async setupStatus(): Promise<SetupStatus> {
    return {
      gitVersion: await this.version(),
      sandboxReady: existsSync(this.paths.gitconfig) && existsSync(this.paths.remote),
      repoReady: this.repoReady(),
      path: this.progress.path,
      paths: { root: this.paths.root, repo: this.paths.repo, data: this.paths.data },
      // ~/GitQuest's parent is the home folder, whatever HOME is (tests and dev runs use temp homes).
      pathLabels: {
        root: homeLabel(this.paths.root, path.dirname(this.paths.root)),
        repo: homeLabel(this.paths.repo, path.dirname(this.paths.root)),
        data: homeLabel(this.paths.data, path.dirname(this.paths.root)),
      },
    };
  }

  /** First run: sandbox + story repo at its root state, saves the chosen path. Idempotent. */
  async runSetup(learningPath: LearningPath): Promise<SetupStatus> {
    await this.serial(async () => {
      await realgit.ensureSandbox(this.paths, this.player);
      if (!this.repoReady()) {
        await this.save({ position: null, current: null, attempt: null });
        await rebuildInPlace(this.paths, rootParts('foundations'), this.runOptions());
        await this.save({ position: { missionId: rootPosition('foundations'), stage: 'after' } });
      }
      await this.save({ path: learningPath });
      await this.refresh(null, null);
    });
    return this.setupStatus();
  }

  /**
   * Starts a mission on its level's carried-forward story repo (docs/CONTRACTS.md):
   * - position {N, entry}            → resume as is
   * - position {N-1, after}          → apply N's prelude to the real repo (N-1 = previous mission
   *                                    of the same level, or `root:<level>` for its first mission;
   *                                    never for a standalone mission with its own `root`)
   * - anything else, or prelude fails → rebuild N's canonical entry in place
   * Takes the first undo snapshot.
   */
  async startMission(missionId: string): Promise<void> {
    await this.serial(async () => {
      const mission = missionById(missionId);
      if (mission === undefined) throw new Error(`Unknown mission: ${missionId}`);
      const { position, attempt } = this.progress;
      const ready = this.repoReady();

      if (ready && position?.missionId === missionId && position.stage === 'entry' && attempt?.missionId === missionId) {
        await this.save({ current: missionId });
        if ((await this.snapshotNumbers()).length === 0) await this.takeSnapshot();
        this.lastFingerprint = null; // GitQuest set this state itself: not an undo step
        await this.refresh(null, null);
        return;
      }

      const online = levelOf(missionId)?.online === true;
      if (online) await this.prepareOnline();
      const previous = previousPosition(missionId);
      // The repo is about to change: until it reaches the entry, its position is unknown.
      await this.save({ position: null, current: missionId, attempt: null });
      let applied = false;
      if (ready && position !== null && position.missionId === previous && position.stage === 'after') {
        try {
          await runParts(this.paths.repo, preludeParts(missionId), this.runOptions());
          applied = true;
        } catch {
          applied = false; // fall back to the canonical entry
        }
      }
      if (!applied) await rebuildEntry(this.paths, missionId, this.runOptions());

      const state = await this.read();
      await this.save({
        position: { missionId, stage: 'entry' },
        attempt: { missionId, commandsUsed: 0, hintsUsed: 0, entryCommits: Object.keys(state.commits), commands: [] },
      });
      await fs.rm(this.paths.snapshots, { recursive: true, force: true });
      await this.takeSnapshot();
      this.blockedReason = null;
      this.lastCommand = null;
      this.lastFingerprint = null; // GitQuest set this state itself: not an undo step
      // A new attempt starts without GitHub facts: the first command (or Refresh) reads them.
      this.githubFacts = null;
      this.githubError = null;
      this.githubCheckedAt = null;
      this.githubTriedAt = 0;
      await this.refresh(null, null, state);
    });
  }

  /**
   * Called by main after each command finishes in the terminal (and on repo changes).
   * Counts the command for stars when `command` is given, snapshots for undo when the
   * repo changed, re-reads the repo, evaluates checks and completes the mission when solved.
   */
  async afterCommand(command: string | null, exitCode: number | null): Promise<WorkspaceView> {
    return this.serial(async () => {
      if (command !== null) {
        this.lastCommand = command;
        const { attempt, position } = this.progress;
        if (attempt !== null && this.activeMission() !== null && position?.stage === 'entry') {
          await this.save({
            attempt: {
              ...attempt,
              commandsUsed: attempt.commandsUsed + countedCommands(command, exitCode),
              commands: withCommand(attempt.commands, { command, exitCode }),
            },
          });
        }
      }
      await this.readGitHub(false);
      await this.refresh(command, exitCode);
      return this.lastView;
    });
  }

  // GitHub (Level 11) ---------------------------------------------------------

  /** gh installed and signed in, and does the sandbox exist? Read-only. */
  async githubStatus(): Promise<GitHubStatus> {
    const status = await github.status(this.ghOptions());
    this.githubLogin = status.login;
    return status;
  }

  /** The consent button: creates the private sandbox repo on the player's account. */
  async createSandbox(): Promise<GitHubStatus> {
    const status = await github.createSandbox(this.ghOptions());
    this.githubLogin = status.login;
    return status;
  }

  /** Deletes the sandbox repo on GitHub (the local clone stays until another mission rebuilds the repo). */
  async deleteSandbox(): Promise<GitHubStatus> {
    const status = await github.deleteSandbox(this.ghOptions());
    this.githubFacts = null;
    return status;
  }

  /** Refresh from GitHub: reads now, ignoring the throttle, and re-evaluates. */
  async refreshGitHub(): Promise<WorkspaceView> {
    return this.serial(async () => {
      await this.readGitHub(true);
      await this.refresh(null, null);
      return this.lastView;
    });
  }

  async hint(): Promise<WorkspaceView> {
    return this.serial(async () => {
      const mission = this.activeMission();
      const attempt = this.progress.attempt;
      if (mission !== null && attempt !== null && hintsOpen(mission, attempt.commandsUsed) && attempt.hintsUsed < mission.hints.length) {
        await this.save({ attempt: { ...attempt, hintsUsed: attempt.hintsUsed + 1 } });
      }
      this.lastView = this.buildView();
      return this.lastView;
    });
  }

  /** Restores the snapshot taken before the last change (in place) and re-evaluates. No-op when the mission has `undo: false`. */
  async undo(): Promise<WorkspaceView> {
    return this.serial(async () => {
      const mission = this.activeMission();
      if (mission === null || mission.undo === false) return this.lastView;
      const numbers = await this.snapshotNumbers();
      const target = numbers.length >= 2 ? numbers[numbers.length - 2] : numbers[0];
      if (target === undefined) return this.lastView;
      await realgit.restore(this.paths, this.snapshotDir(mission.id, target));
      for (const n of numbers.filter((n) => n > target)) {
        await fs.rm(this.snapshotDir(mission.id, n), { recursive: true, force: true });
      }
      await this.save({ position: { missionId: mission.id, stage: 'entry' } });
      this.blockedReason = null;
      this.lastFingerprint = null; // GitQuest set this state itself: not an undo step
      await this.refresh(null, null);
      return this.lastView;
    });
  }

  /** Back to the mission's starting state (snapshot 0, else the canonical entry); resets commands and hints. */
  async restart(): Promise<WorkspaceView> {
    return this.serial(async () => {
      const mission = this.activeMission();
      const attempt = this.progress.attempt;
      if (mission === null || attempt === null) return this.lastView;
      const numbers = await this.snapshotNumbers();
      let entryCommits = attempt.entryCommits;
      if (numbers[0] === 0) {
        await realgit.restore(this.paths, this.snapshotDir(mission.id, 0));
        for (const n of numbers.slice(1)) await fs.rm(this.snapshotDir(mission.id, n), { recursive: true, force: true });
      } else {
        await rebuildEntry(this.paths, mission.id, this.runOptions());
        entryCommits = Object.keys((await this.read()).commits);
        await fs.rm(this.paths.snapshots, { recursive: true, force: true });
        await this.takeSnapshot();
      }
      await this.save({
        position: { missionId: mission.id, stage: 'entry' },
        attempt: { missionId: mission.id, commandsUsed: 0, hintsUsed: 0, entryCommits, commands: [] },
      });
      this.blockedReason = null;
      this.lastCommand = null;
      this.lastFingerprint = null; // GitQuest set this state itself: not an undo step
      await this.refresh(null, null);
      return this.lastView;
    });
  }

  /** Last computed view (cheap, no git calls). */
  view(): WorkspaceView {
    return this.lastView;
  }

  // lessons ---------------------------------------------------------------------

  /** The level's lesson and where the player left it. Throws for an unknown level. */
  lesson(levelId: string): { lesson: Lesson; progress: LessonProgress } {
    const lesson = this.lessonOrThrow(levelId);
    return { lesson, progress: this.progress.lessons[levelId] ?? { slide: 0, read: false, quiz: {} } };
  }

  /** Remembers the slide shown, clamped to the lesson's slides. */
  async setLessonSlide(levelId: string, index: number): Promise<WorkspaceView> {
    return this.serial(async () => {
      const lesson = this.lessonOrThrow(levelId);
      const slide = Math.max(0, Math.min(Math.trunc(index) || 0, lesson.slides.length - 1));
      const saved = this.progress.lessons[levelId] ?? { slide: 0, read: false, quiz: {} };
      const read = saved.read || slide === lesson.slides.length - 1;
      await this.save({ lessons: { ...this.progress.lessons, [levelId]: { ...saved, slide, read } } });
      this.lastView = this.buildView();
      return this.lastView;
    });
  }

  /** Saves the answer to one quiz question (the latest answer wins) and says whether it is right. */
  async answerLesson(levelId: string, questionId: string, optionId: string): Promise<{ correct: boolean; view: WorkspaceView }> {
    return this.serial(async () => {
      const question = this.lessonOrThrow(levelId).quiz.find((q) => q.id === questionId);
      if (question === undefined) throw new Error(`Unknown question: ${questionId}`);
      if (!question.options.some((o) => o.id === optionId)) throw new Error(`Unknown option: ${optionId}`);
      const saved = this.progress.lessons[levelId] ?? { slide: 0, read: false, quiz: {} };
      await this.save({ lessons: { ...this.progress.lessons, [levelId]: { ...saved, quiz: { ...saved.quiz, [questionId]: optionId } } } });
      this.lastView = this.buildView();
      return { correct: optionId === question.correct, view: this.lastView };
    });
  }

  private lessonOrThrow(levelId: string): Lesson {
    const lesson = lessonFor(levelId);
    if (lesson === undefined) throw new Error(`Unknown level: ${levelId}`);
    return lesson;
  }

  // internals ------------------------------------------------------------------

  /** One operation at a time: terminal commands, the fs watcher and buttons all touch the repo. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private env(): NodeJS.ProcessEnv {
    return realgit.sandboxEnv(this.paths, process.env);
  }

  private runOptions(): RunOptions {
    return { paths: this.paths, env: this.env(), player: this.player, githubLogin: this.githubLogin };
  }

  private ghOptions(): github.GhOptions {
    return this.gh === undefined ? {} : { gh: this.gh };
  }

  private onlineMission(): boolean {
    const mission = this.activeMission();
    return mission !== null && levelOf(mission.id)?.online === true;
  }

  /** Before cloning the sandbox: signed in, sandbox exists, and git may use gh's login for github.com. */
  private async prepareOnline(): Promise<void> {
    const status = await this.githubStatus();
    if (!status.installed) throw new Error('This level needs the GitHub CLI. In Terminal run: brew install gh, then gh auth login');
    if (!status.loggedIn) throw new Error(status.message ?? 'Sign in to GitHub first. In Terminal run: gh auth login');
    if (status.sandbox !== 'exists') throw new Error(status.message ?? 'Create the sandbox repo first (Levels, GitHub for real).');
    const gh = this.gh ?? github.findGh();
    if (gh !== null) await realgit.useGhCredentials(this.paths, gh);
  }

  /** Online missions only: facts from GitHub, at most every githubEveryMs unless forced. Never throws. */
  private async readGitHub(force: boolean): Promise<void> {
    if (!this.onlineMission()) return;
    if (!force && Date.now() - this.githubTriedAt < this.githubEveryMs) return;
    this.githubTriedAt = Date.now();
    try {
      if (this.githubLogin === null) await this.githubStatus();
      if (this.githubLogin === null) throw new Error('gh is not signed in to GitHub. In Terminal run: gh auth login');
      this.githubFacts = await github.fetchFacts(this.ghOptions(), `${this.githubLogin}/${SANDBOX_NAME}`);
      this.githubError = null;
      this.githubCheckedAt = Date.now();
    } catch (e) {
      this.githubError = e instanceof Error ? e.message : String(e);
    }
  }

  private async version(): Promise<string | null> {
    if (this.gitVersion === undefined) this.gitVersion = await realgit.gitVersion();
    return this.gitVersion;
  }

  private repoReady(): boolean {
    return existsSync(path.join(this.paths.repo, '.git'));
  }

  private async save(patch: Partial<Progress>): Promise<void> {
    this.progress = { ...this.progress, ...patch };
    await saveProgress(this.paths.progress, this.progress);
  }

  private readOptions(): { env: NodeJS.ProcessEnv; remoteDir?: string } {
    // Online levels: origin is github.com, not the local bare stand-in.
    const remoteDir = existsSync(this.paths.remote) && !this.onlineMission() ? this.paths.remote : undefined;
    return { env: this.env(), ...(remoteDir === undefined ? {} : { remoteDir }) };
  }

  private read(): Promise<RepoState> {
    return realgit.readRepoState(this.paths.repo, this.readOptions());
  }

  /** The current mission when an attempt for it exists. */
  private activeMission(): Mission | null {
    const { current, attempt } = this.progress;
    if (current === null || attempt?.missionId !== current) return null;
    return missionById(current) ?? null;
  }

  private snapshotDir(missionId: string, n: number): string {
    return path.join(this.paths.snapshots, missionId, String(n));
  }

  private async snapshotNumbers(): Promise<number[]> {
    const mission = this.activeMission();
    if (mission === null) return [];
    try {
      const names = await fs.readdir(path.join(this.paths.snapshots, mission.id));
      return names.filter((name) => /^\d+$/.test(name)).map(Number).sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  private async takeSnapshot(): Promise<void> {
    const mission = this.activeMission();
    if (mission === null) return;
    const numbers = await this.snapshotNumbers();
    const next = numbers.length === 0 ? 0 : (numbers[numbers.length - 1] as number) + 1;
    await fs.mkdir(path.join(this.paths.snapshots, mission.id), { recursive: true });
    await realgit.snapshot(this.paths, this.snapshotDir(mission.id, next));
  }

  /** Re-reads the repo, snapshots on change, evaluates the mission and rebuilds the view. */
  private async refresh(command: string | null, exitCode: number | null, known?: RepoState): Promise<void> {
    if (!this.repoReady()) {
      this.state = null;
      this.facts = EMPTY_FACTS;
      this.lastFingerprint = null;
      this.lastView = this.buildView();
      return;
    }
    const [state, facts] = await Promise.all([known ?? this.read(), realgit.readFacts(this.paths.repo, this.readOptions())]);
    this.facts = facts;
    const print = fingerprint(state);
    const undoable = this.activeMission()?.undo !== false;
    if (undoable && this.lastFingerprint !== null && print !== this.lastFingerprint) await this.takeSnapshot();
    this.lastFingerprint = print;
    const newCommit = this.state !== null && Object.keys(state.commits).some((hash) => this.state?.commits[hash] === undefined);
    this.state = state;
    await this.evaluate(command, exitCode, newCommit);
    this.lastView = this.buildView();
  }

  private async evaluate(command: string | null, exitCode: number | null, newCommit = false): Promise<void> {
    const mission = this.activeMission();
    const attempt = this.progress.attempt;
    if (mission === null || attempt === null || this.state === null) {
      this.checks = [];
      return;
    }
    const state = this.state;
    const ctx: MissionContext = {
      entryCommits: new Set(attempt.entryCommits),
      facts: this.facts,
      commands: attempt.commands,
      github: this.githubFacts,
    };
    const before = this.checks.filter((c) => c.done).length;
    this.checks = mission.checks.map((c) => ({ label: c.label, proof: c.proof, done: c.done(state, ctx) }));
    const done = this.checks.filter((c) => c.done).length;
    const result = mission.validate(state, ctx);
    const position = this.progress.position;

    if (result.ok) {
      this.blockedReason = null;
      if (position?.missionId === mission.id && position.stage === 'entry') {
        const stars = starsFor(attempt.commandsUsed, mission.par);
        const best = Math.max(stars, this.progress.completed[mission.id]?.stars ?? 0) as 1 | 2 | 3;
        await this.save({
          position: { missionId: mission.id, stage: 'after' },
          completed: { ...this.progress.completed, [mission.id]: { stars: best } },
        });
      }
      return;
    }
    const reason = result.reason ?? null;
    if (done === this.checks.length) this.blockedReason = reason;
    else if (command !== null && countedCommands(command, 0) > 0) {
      // An action command: explain when it failed, moved no check forward or made a commit that does not solve it.
      this.blockedReason = exitCode !== 0 || done <= before || newCommit ? reason : null;
    }
  }

  private buildMission(): MissionView | null {
    const mission = this.activeMission();
    const attempt = this.progress.attempt;
    if (mission === null || attempt === null) return null;
    const position = this.progress.position;
    const solved = position?.missionId === mission.id && position.stage === 'after';
    const level = levelOf(mission.id);
    const following = MISSIONS[MISSIONS.indexOf(mission) + 1];
    // Next stays inside the level: the next level starts with its lesson and quiz, not its first mission.
    const next = following !== undefined && levelOf(following.id) === level ? following.id : null;
    return {
      id: mission.id,
      number: mission.number,
      title: mission.title,
      goal: mission.goal,
      story: mission.story,
      ...guidance(mission, this.checks, attempt),
      hintsTotal: mission.hints.length,
      blockedReason: solved ? null : this.blockedReason,
      commandsUsed: attempt.commandsUsed,
      par: mission.par,
      completed: solved
        ? { stars: starsFor(attempt.commandsUsed, mission.par), used: attempt.commandsUsed, takeaway: mission.takeaway, next }
        : null,
      theory: mission.theory,
      outcome: mission.outcome === undefined ? null : mission.capstone ? { summary: mission.outcome.summary } : mission.outcome,
      panels: missionPanels(mission, level?.number),
      undoAllowed: mission.undo !== false,
      danger: mission.danger ?? null,
      level: { id: level?.id ?? '', number: level?.number ?? 0, title: level?.title ?? '' },
      capstone: mission.capstone === true,
      ...(level?.online === true
        ? {
            online: {
              repo: this.githubLogin === null ? null : `${this.githubLogin}/${SANDBOX_NAME}`,
              checkedAt: this.githubCheckedAt,
              error: this.githubError,
            },
          }
        : {}),
    };
  }

  private buildView(): WorkspaceView {
    return {
      repoPath: this.paths.repo,
      repoLabel: homeLabel(this.paths.repo, path.dirname(this.paths.root)),
      gitVersion: this.gitVersion ?? null,
      mission: this.buildMission(),
      ...buildRepoParts(this.state),
      panelData: buildPanelData(this.state, this.facts),
      levels: buildLevels(this.progress, this.progress.path !== null),
      lastCommand: this.lastCommand,
    };
  }
}

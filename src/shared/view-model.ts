import type { ConfigEntry, MissionOutcome, PanelKind } from '../game/model';
export type { ConfigEntry, MissionOutcome, PanelKind } from '../game/model';
/**
 * Everything the UI renders comes from one WorkspaceView, pushed by the main
 * process after every command. The renderer never talks to git directly.
 */

export type LearningPath = 'agents' | 'classic' | 'self';

export interface SetupStatus {
  /** `git version 2.50.1 (Apple Git-155)` → "2.50.1", null when git is missing. */
  readonly gitVersion: string | null;
  /** ~/.gitquest exists with the curated gitconfig and the bare origin. */
  readonly sandboxReady: boolean;
  /** ~/GitQuest/nova exists and holds the story repo. */
  readonly repoReady: boolean;
  readonly path: LearningPath | null;
  readonly paths: { readonly root: string; readonly repo: string; readonly data: string };
  /** The same paths with the home folder shown as ~ (for display). */
  readonly pathLabels: { readonly root: string; readonly repo: string; readonly data: string };
}

export interface MissionSummary {
  readonly id: string;
  /** "1.2" */
  readonly number: string;
  readonly title: string;
  readonly state: 'done' | 'current' | 'todo';
  readonly stars: 0 | 1 | 2 | 3;
}

export interface LevelSummary {
  readonly id: string;
  /** Topic-list level number, 0 = setup. */
  readonly number: number;
  readonly title: string;
  /** One line of topics, e.g. "Three areas, commits, HEAD, reading diffs". */
  readonly topics: string;
  /** Missions playable in this build (may be empty for levels not built yet). */
  readonly missions: readonly MissionSummary[];
  /** Planned mission count for the level (shown as "0 of 7"). */
  readonly planned: number;
  readonly done: number;
  /** Position in the suggested path for the chosen LearningPath, null = "go deeper". */
  readonly suggestedOrder: number | null;
  /** e.g. "can lose work, practice repo only" */
  readonly warning?: string;
  /** Talks to github.com (Level 11): outside the suggested path, opened through the consent screen. */
  readonly online?: boolean;
  /** The level's lesson: slide count (0 = not written yet), read to the end, quiz score once every question is answered. */
  readonly lesson: { readonly slides: number; readonly read: boolean; readonly quizScore: number | null; readonly quizTotal: number };
}

export interface CheckView {
  readonly label: string;
  readonly done: boolean;
  /** The real git command that proves this check, e.g. "git show HEAD:app.ts". */
  readonly proof: string;
}

export interface SnapshotFile {
  readonly path: string;
  /** Short label for the content: "v2", or the first ~18 chars of the file. "" when the file is empty. */
  readonly version: string;
  /** True when this commit changed the file compared with its first parent. */
  readonly changed: boolean;
}

export interface CommitView {
  readonly hash: string;
  readonly short: string;
  readonly message: string;
  readonly author: string;
  readonly parents: readonly string[];
  /** Branch lane this commit was made on (for colour), null = detached. */
  readonly lane: string | null;
  /** Refs pointing here, e.g. ["HEAD → main", "origin/main"]. */
  readonly refs: readonly string[];
  readonly isHead: boolean;
  /** False for commits no branch or HEAD reaches (lost commits, drawn faded). */
  readonly reachable: boolean;
  readonly snapshot: readonly SnapshotFile[];
}

export interface AreaFile {
  readonly path: string;
  /** Version labels per area; null = the file does not exist there. */
  readonly disk: string | null;
  readonly index: string | null;
  readonly head: string | null;
}

export interface MissionView {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  /** One sentence: what to achieve. */
  readonly goal: string;
  /** Up to three sentences of story. */
  readonly story: string;
  readonly checks: readonly CheckView[];
  /** Hints revealed so far, in order. */
  readonly hints: readonly string[];
  readonly hintsTotal: number;
  /** Why the mission is not done yet; shown when every check looks done but validation fails, or after `check`. */
  readonly blockedReason: string | null;
  readonly commandsUsed: number;
  readonly par: number;
  readonly completed: null | {
    readonly stars: 1 | 2 | 3;
    readonly used: number;
    readonly takeaway: string;
    /** Next mission id, null at the end of the build. */
    readonly next: string | null;
  };
  readonly theory: { readonly title: string; readonly body: string; readonly lesson: string };
  /** What done looks like (null when the mission has none). Capstones get the summary only. */
  readonly outcome: MissionOutcome | null;
  /** Visuals under the mission, in order (data in WorkspaceView.panelData). */
  readonly panels: readonly PanelKind[];
  /** False when the mission is about recovering with git itself: the Undo button does nothing. */
  readonly undoAllowed: boolean;
  /** Warning for danger topics (reset --hard, force push…), null otherwise. */
  readonly danger: string | null;
  readonly level: { readonly id: string; readonly number: number; readonly title: string };
  /** End-of-level challenge: checks not done yet read "Hidden check" (empty proof); hints unlock after 2 commands. */
  readonly capstone: boolean;
  /** Online missions (Level 11): the sandbox repo and the last read from GitHub. Absent offline. */
  readonly online?: {
    /** `<login>/gitquest-sandbox`, null until known. */
    readonly repo: string | null;
    /** When GitHub was last read successfully (ms since epoch), null before the first read. */
    readonly checkedAt: number | null;
    /** Why the last read failed (offline, timeout…), null when it worked. */
    readonly error: string | null;
  };
}

export interface RemoteBranchView {
  readonly branch: string;
  /** Tip on your Mac / origin's tip as last fetched (origin/<branch>); null = the branch does not exist there. */
  readonly local: string | null;
  readonly remote: string | null;
  /** Commits only on your Mac / only on origin. */
  readonly ahead: number;
  readonly behind: number;
  /** Configured upstream, e.g. "origin/main"; null = none. */
  readonly upstream: string | null;
}

export interface WorkflowView {
  /** .github/workflows/ci.yml */
  readonly file: string;
  readonly jobs: readonly { readonly id: string; readonly needs: readonly string[]; readonly steps: readonly string[]; readonly runsOn: string }[];
  /** The YAML does not parse (or has no jobs:), in plain words; jobs is then empty. */
  readonly error: string | null;
}

/** What the topic panels draw. Cheap to build from RepoState + RepoFacts on every refresh. */
export interface PanelData {
  readonly config: readonly ConfigEntry[];
  readonly remote: readonly RemoteBranchView[];
  /** Newest first. */
  readonly stashes: readonly { readonly ref: string; readonly message: string }[];
  /** HEAD reflog, newest first, at most 12. */
  readonly reflog: readonly { readonly short: string; readonly action: string }[];
  readonly worktrees: readonly { readonly path: string; readonly branch: string | null; readonly isMain: boolean }[];
  /** The workflow on disk (ci.yml first, else the first file in .github/workflows/), null when there is none. */
  readonly workflow: WorkflowView | null;
}

export interface WorkspaceView {
  /** Absolute path of the practice repo, e.g. /Users/you/GitQuest/nova */
  readonly repoPath: string;
  /** Same path with the home folder shown as "~". */
  readonly repoLabel: string;
  readonly gitVersion: string | null;
  readonly mission: MissionView | null;
  /** Newest first. */
  readonly commits: readonly CommitView[];
  /** What `git commit` would save right now (the index), when it differs from HEAD. */
  readonly nextCommit: readonly SnapshotFile[] | null;
  readonly branches: readonly { readonly name: string; readonly hash: string; readonly current: boolean }[];
  readonly headBranch: string | null;
  readonly areas: readonly AreaFile[];
  readonly panelData: PanelData;
  readonly levels: readonly LevelSummary[];
  /** The last command the player ran in the terminal, e.g. "git commit -m \"docs: v2\"". */
  readonly lastCommand: string | null;
}

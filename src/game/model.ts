/**
 * Mission and level types shared by every level file (src/game/levels/levelN.ts).
 * Contract for the content agents: change it only through the integrator.
 */
import type { Person } from '../realgit';
import type { RepoState } from '../shared/repo-types';
import type { ValidationResult } from './validate';
import type { Diagram } from './lesson-model';

export const TEAMMATES = {
  lea: { name: 'Lea Moreau', email: 'lea@nova.dev' },
  samir: { name: 'Samir Haddad', email: 'samir@nova.dev' },
  ines: { name: 'Ines Bouvet', email: 'ines@nova.dev' },
  yanis: { name: 'Yanis Perret', email: 'yanis@nova.dev' },
  /** The scripted AI coding agent of Level 9 (deterministic, never a real model). */
  bot: { name: 'Nova Bot', email: 'bot@nova.dev' },
} as const satisfies Record<string, Person>;

export type TeammateId = keyof typeof TEAMMATES;

/** The story's GitHub stand-in. ensureSandbox maps it to the local bare repo (~/.gitquest/remotes/nova.git). */
export const ORIGIN_URL = 'https://git.nova.example/nova.git';

/** What git knows beyond RepoState; read once per refresh by realgit.readFacts. */
export interface RepoFacts {
  /** Newest first: `stash@{0}` … */
  readonly stashes: readonly { readonly ref: string; readonly message: string }[];
  readonly tags: readonly {
    readonly name: string;
    /** Commit the tag points to (peeled). */
    readonly target: string;
    readonly annotated: boolean;
    readonly message: string | null;
  }[];
  /** HEAD reflog, newest first, at most 100 entries: action is the reflog subject, e.g. "commit: x", "reset: moving to HEAD~1". */
  readonly reflog: readonly { readonly hash: string; readonly action: string }[];
  /** Effective config visible in the repo (sandbox global + local), keys lower-cased: `user.name`, `alias.lg`, `pull.rebase`. */
  readonly config: Readonly<Record<string, string>>;
  /** Every config entry in git's order with the file it comes from (`git config --list --show-scope`), keys lower-cased. */
  readonly configEntries?: readonly ConfigEntry[];
  /** Operation the repo is in the middle of. */
  readonly inProgress: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect' | null;
  /** Executable hooks in .git/hooks (or core.hooksPath), without ".sample". */
  readonly hooks: readonly string[];
  /** Untracked-but-ignored paths (`git ls-files --others --ignored --exclude-standard --directory`). */
  readonly ignored: readonly string[];
  /** Submodule paths from .gitmodules. */
  readonly submodules: readonly string[];
  /** `git notes list` targets. */
  readonly notes: readonly string[];
  /** Bare remote facts (origin): branch names and tag names that exist on the server. */
  readonly server: { readonly branches: Readonly<Record<string, string>>; readonly tags: readonly string[] } | null;
}

export interface ConfigEntry {
  readonly key: string;
  readonly value: string;
  readonly scope: 'local' | 'global' | 'system' | 'worktree';
}

/** The visuals under the mission, in order. Default per level in view.ts (missionPanels). */
export type PanelKind = 'history' | 'areas' | 'config' | 'remote' | 'stash-reflog' | 'worktrees' | 'workflow';

/** Level 11 practises on the player's own private repo; `{login}` is filled with their GitHub login (story.runParts). */
export const SANDBOX_NAME = 'gitquest-sandbox';
export const SANDBOX_URL = `https://github.com/{login}/${SANDBOX_NAME}.git`;

export interface GitHubPullRequest {
  readonly number: number;
  readonly title: string;
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED';
  /** Head branch name and its tip commit. */
  readonly head: string;
  readonly headOid: string;
  readonly base: string;
  readonly body: string;
  /** Commit the merge created on the base branch (squash commit for a squash merge), null until merged. */
  readonly mergeCommit: string | null;
  /** Issues this PR closes when merged (`Closes #n` in the body). */
  readonly closingIssues: readonly number[];
  readonly reviews: readonly { readonly state: string; readonly body: string }[];
  /** Status checks on the head commit (Actions jobs). conclusion: SUCCESS, FAILURE… or null while running. */
  readonly checks: readonly { readonly name: string; readonly status: string; readonly conclusion: string | null }[];
}

export interface GitHubRun {
  readonly id: number;
  /** Workflow name, e.g. "CI". */
  readonly name: string;
  readonly branch: string;
  readonly sha: string;
  /** queued, in_progress, completed… */
  readonly status: string;
  /** success, failure, cancelled… null until completed. */
  readonly conclusion: string | null;
}

/**
 * What github.com says about the sandbox repo (online levels only), read with `gh` by realgit/github.ts.
 * Lists are newest first. Validators tie objects to this attempt through commits: a PR or run counts
 * when its commit exists locally and is not in ctx.entryCommits (old attempts' commits are cloned at entry).
 */
export interface GitHubFacts {
  /** owner/gitquest-sandbox */
  readonly repo: string;
  readonly pullRequests: readonly GitHubPullRequest[];
  readonly runs: readonly GitHubRun[];
  readonly issues: readonly { readonly number: number; readonly title: string; readonly state: 'OPEN' | 'CLOSED' }[];
  readonly releases: readonly { readonly tag: string; readonly name: string; readonly draft: boolean }[];
  /** Branch names on GitHub. */
  readonly branches: readonly string[];
  /** Repo secret names (values are never readable). */
  readonly secrets: readonly string[];
  /** Branch protection or rulesets on main. Private repos on free plans cannot use them: 'unavailable'. */
  readonly protection: 'protected' | 'none' | 'unavailable';
}

export interface TypedCommand {
  readonly command: string;
  readonly exitCode: number | null;
}

/** Everything a check or validator may use. Never the clock, never the network. */
export interface MissionContext {
  /** Commits that already existed when the mission started. */
  readonly entryCommits: ReadonlySet<string>;
  readonly facts: RepoFacts;
  /** Commands the player ran in this attempt, oldest first (for inspection missions like log -S or bisect). */
  readonly commands: readonly TypedCommand[];
  /** Online levels: the latest facts read from github.com, null until the first successful read. */
  readonly github?: GitHubFacts | null;
}

export interface PreludeStep {
  readonly id: string;
  /** Idempotence guard: when true the step is already applied and skipped. */
  readonly when?: (state: RepoState) => boolean;
  /** Author and committer of the step's commits; the player when absent. */
  readonly teammate?: TeammateId;
  /**
   * Run in the teammate's own clone of origin (fresh clone), then `git push origin <refs>`.
   * Use for "a teammate pushed while you were working". Requires the level to have `remote: true`.
   */
  readonly remote?: { readonly push: readonly string[] };
  /**
   * Setup syntax (web-game style, run by realgit.runSetupCommands, no shell):
   *   edit <file> "<content>"     write file (content + newline; \n inside double quotes = newline)
   *   append <file> "<content>"   append a line
   *   touch <file> | rm <file> | mkdir <dir> | mv <a> <b> | chmod +x <file>
   *   git <args…>                 real git
   */
  readonly commands: readonly string[];
}

export interface CheckDef {
  readonly label: string;
  /** The real git command that proves this check. */
  readonly proof: string;
  readonly done: (state: RepoState, ctx: MissionContext) => boolean;
}

export interface Mission {
  /** Unique across all levels, kebab-case English. */
  readonly id: string;
  /** "2.3" — level number, dot, position. */
  readonly number: string;
  readonly title: string;
  /** One sentence. */
  readonly goal: string;
  /** Up to three sentences, concrete, in the Nova team's world. */
  readonly story: string;
  /** 2–4 checks, all false at entry, all true once solved. */
  readonly checks: readonly CheckDef[];
  /** State-based; reasons are plain English sentences that tell the player what is still wrong. */
  readonly validate: (state: RepoState, ctx: MissionContext) => ValidationResult;
  /** Three hints: vague → precise → the commands. */
  readonly hints: readonly [string, string, string];
  /** Commands needed by the reference solution. */
  readonly par: number;
  readonly takeaway: string;
  readonly theory: { readonly title: string; readonly body: string; readonly lesson: string };
  /**
   * What "done" looks like, shown before the steps: the why in player terms, plus the expected result
   * to aim for. Capstones show only `summary`.
   */
  readonly outcome?: MissionOutcome;
  /** Setup applied on entry (teammates' commits, prepared files). */
  readonly prelude: readonly PreludeStep[];
  /** Reference solution in setup syntax; replayed to rebuild later missions of the same level. */
  readonly reference: readonly string[];
  /** Other valid solutions; the mission test harness proves each one passes. */
  readonly alternatives?: readonly (readonly string[])[];
  /** False in missions where the point is to recover with git itself (Level 4). Default true. */
  readonly undo?: boolean;
  /** Marks danger topics (reset --hard, force push, clean -fd): shown as a warning in the UI. */
  readonly danger?: string;
  /**
   * Standalone scenario: builds its own repo from these setup commands (then `prelude`) instead of
   * continuing the level's story. Used by capstones on the production repo (src/game/production.ts).
   */
  readonly root?: readonly string[];
  /** End-of-level scenario challenge: less hand-holding (check labels stay hidden until done). */
  readonly capstone?: boolean;
  /** Visuals under the mission; the level's default (view.ts missionPanels) when absent. */
  readonly panels?: readonly PanelKind[];
}

export interface MissionOutcome {
  /** One or two sentences: what will be true, and why it matters to the player. No commands. */
  readonly summary: string;
  /** The result to aim for. */
  readonly expect?:
    | {
        /** Terminal output after running `command` once the mission is solved (trimmed to the relevant lines). */
        readonly kind: 'terminal';
        readonly command: string;
        readonly output: string;
      }
    | { readonly kind: 'file'; readonly path: string; readonly content: string }
    | { readonly kind: 'diagram'; readonly diagram: Diagram };
}

export interface Level {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly topics: string;
  /** Planned mission count shown on the map (= missions.length once the level is complete). */
  readonly planned: number;
  readonly warning?: string;
  /**
   * Each level is its own story arc: `root` builds the level's starting repo in an empty folder.
   * Missions inside the level carry the player's repo forward (see docs/CONTRACTS.md).
   */
  readonly root: readonly string[];
  /** True when the level uses origin: the bare remote is reset on rebuild and `root` should add origin and push. */
  readonly remote?: boolean;
  /**
   * Missions talk to github.com (Level 11): origin is the player's private sandbox repo (SANDBOX_URL), every
   * mission has its own `root` that clones it, ctx.github carries the facts. Outside the offline path
   * ordering; the offline mission harness skips these levels.
   */
  readonly online?: boolean;
  readonly missions: readonly Mission[];
}

# Writing GitQuest levels

One file per level: `src/game/levels/levelN.ts` exports `levelN: Level` (types in `src/game/model.ts`).
**You own only your level file(s)** (plus an optional `src/game/levels/levelN.test.ts`). Never edit other files;
propose shared changes in your report. English only. No npm install, no commits.

## Curriculum source

The plan is `/private/tmp/claude-501/-Users-khush-Desktop-git-game/37af36e0-eb30-4532-bac3-79f5509be4f9/scratchpad/mac-plan.md`,
section "2.3 Proposed Mac edition curriculum" (and 2.4 lesson vs hands-on, 2.5 GitHub feasibility, 2.6 danger topics).
The full topic list is `…/scratchpad/topics.md`. The plan numbers chapters differently from our levels — map by topic:

| Our level | Topic-list level | Plan chapter |
|---|---|---|
| 0 Setup | L1 installation & setup | Ch0 Setup & terminal survival |
| 1 Foundations | L1 core concepts + everyday commands | Ch1 Foundations & reading diffs |
| 2 Branches and conflicts | L2 | Ch4 (branch/merge/conflict part) |
| 3 Remotes and syncing | L3 | Ch2 Syncing |
| 4 Undo and recovery | L4 | Ch3 Undo & recovery |
| 5 Rewriting history | L5 | Ch6 History |
| 6 Advanced and internals | L6 | Ch7 Under the hood |
| 7 GitHub and pull requests | L7 (simulated locally) | Ch4 PR part + GitHub track (simulated) |
| 8 Team workflows | L8 | Ch8 |
| 9 Agent workflows | L9 | Ch5 Git with AI agents (scripted "Nova Bot" teammate `bot`) |

Hit the level's `planned` count (set `planned` = number of missions you ship). Pick the topics with the most
hands-on value; topics that can't be hands-on locally go into a mission's `theory` text, not invented missions.

## Mission rules (the harness enforces most of them)

- **Story**: the Nova notes-app team (Lea, Samir, Ines, Yanis; `bot` is the scripted AI agent). 1–3 concrete sentences.
- **Level root**: `root` builds the level's starting repo in an empty folder with setup commands (start with
  `git init -b main`, create a few files, commit). Levels with `remote: true` must also run
  `git remote add origin https://git.nova.example/nova.git` and `git push -u origin main` in the root.
- **Carry forward inside a level**: mission N starts from mission N-1's end state (reference solution applied) plus N's
  `prelude`. Write preludes that work on top of the previous mission's reference result.
- **Prelude teammates**: `teammate: 'lea'` authors commits as Lea. `remote: { push: ['main'] }` runs the step in Lea's
  fresh clone of origin and pushes — use it for "a teammate pushed while you were away".
- **Setup syntax**: `edit f "text"` (`\n` = newline inside double quotes), `append f "line"`, `touch`, `rm`, `mkdir`,
  `mv a b`, `chmod +x f`, `git …`, `git! …` (git where a non-zero exit is expected, e.g. `git! merge x` stopping on a
  conflict), `VAR=value git …`. No shell, no pipes, no network (only the local origin).
- **Checks**: 2–4, each with a `proof` (the real git command that shows it). All false at entry, all true when solved.
- **validate**: state-based (RepoState + `ctx.facts` + `ctx.entryCommits`); use `ctx.commands` only for inspection missions
  where the outcome is knowledge (log -S, blame, bisect, show) — and then accept any command that would reveal it.
  Reasons are plain sentences telling the player what is still wrong. Compare contents exactly as written
  (readRepoState strips one trailing newline). Never compare commit hashes literally; never require an exact commit
  count unless the count is the lesson. Accept harmless extras (extra `git status`, different commit messages).
- **Hints**: exactly three: vague → precise → the exact commands.
- **par** = number of commands in `reference`. `alternatives`: at least one other valid solution where one exists.
- **theory**: `{ title, body (2–3 plain sentences), lesson (one line) }`. **takeaway**: one sentence.
- **Level 4**: set `undo: false` (the point is recovering with git). Danger topics get `danger: "…"`.
- **Editor**: players use nano. Avoid missions that need an interactive editor unless you give them a non-interactive path
  (e.g. `git rebase -i` → use `GIT_SEQUENCE_EDITOR`-free alternatives like `git commit --fixup` + `git rebase --autosquash`
  with `GIT_SEQUENCE_EDITOR=true`, or teach `-i` in theory and practise `--onto`/`reset --soft`).

Helpers: `src/game/validate.ts` (headFile, indexFile, workingFile, headBranch, commitDelta, isWorkingTreeClean, …).
Write level-specific helpers inside your level file.

## Proving your level

`npx vitest run src/game/missions.harness.test.ts -t "<level id>"` builds every mission of the level with real git in a
temp home, checks the entry fails, replays `reference` (and each `alternatives`) and checks validate passes and every
check is done. All your missions must pass. Typecheck: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "levels/levelN"`.
If the harness doesn't exist yet (the infrastructure agent is building it), write your missions first and poll for it.

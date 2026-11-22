# Writing GitQuest lessons

Each level has a lesson the player reads before (or alongside) its missions: concept slides with diagrams,
a command reference, pitfalls, and a short quiz. Types: `src/game/lesson-model.ts`.
File: `src/game/lessons/levelN.ts` exporting `lessonN: Lesson` (`levelId` = the level's id). You own only your lesson files.
English only, no npm install, no commits.

## What a good lesson does

- **Builds a mental model before commands.** Explain what git stores and why the command behaves that way
  (snapshots not diffs, branches as labels, the index as the next commit, remotes as copies that only sync on request,
  reflog as HEAD's diary, objects addressed by content). Commands come after the model.
- **Covers every topic of the level in the topic list** (`…/scratchpad/topics.md`, mapping in docs/CONTENT-GUIDE.md),
  including the ones no mission practises (list those in `theoryOnly`). Read the level's missions
  (`src/game/levels/levelN.ts`) so the lesson prepares exactly what they need and uses the same Nova story and files.
- **One idea per concept slide**, 2–5 short paragraphs, a diagram whenever a picture explains it better
  (graphs for history, areas for staging, flow for remotes/CI, before-after for commands that move things),
  and a one-line `remember`.
- **Commands slide**: every command used in the level's missions plus the common flags from the topic list; mark danger.
- **Pitfalls slide**: the real mistakes (from the topic list's troubleshooting table where relevant) and the way out.
- **Quiz**: 5–8 questions that test understanding, not recall — "what will this command do to this graph?",
  "which area holds v2 now?", "why did the push get rejected?". Every option plausible; the explanation teaches.
- Plain, warm, precise English. No filler, no emoji, no marketing words. Real git behaviour only — when unsure, check
  with a real git repo in a temp dir.

## Diagram data tips

- Graph commit ids are short labels ("A", "B", "M1"); `lane` sets the colour row; `refs` like `["HEAD → main"]`, `["origin/main"]`.
- Areas: `{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' }`, null when absent.
- Flow: nodes `{ id, label, detail, row }`, edges `{ from, to, label }` (e.g. "git push").

`npx vitest run src/game/lessons` runs the lesson checks (structure, every level has a lesson, quiz answers valid,
no French). Typecheck: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "src/game/lessons"`.

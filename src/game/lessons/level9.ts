/**
 * Lesson 9 — Agent workflows: how AI coding agents use git, setting a repo up for them, worktrees, reviewing and undoing.
 * Prepares level 9 (src/game/levels/level9.ts), where Nova Bot is the scripted agent.
 */
import type { Lesson } from '../lesson-model';

export const lesson9: Lesson = {
  levelId: 'agents',
  title: 'Agent workflows',
  summary:
    'How to let AI coding agents work in your repository safely: a branch and a worktree per task, checkpoints you can return to, guardrails that stop mistakes before main, and a review habit that catches what agents get wrong.',
  slides: [
    {
      kind: 'concept',
      id: 'branch-per-task',
      title: 'Git is the safety net for agents',
      body:
        "A coding agent (Claude Code, Codex, Cursor, Copilot and the rest) is a very fast teammate that edits files and runs commands in your repository, including git. It is often right, sometimes confidently wrong, and it never gets tired of making changes. Everything it does is a diff, and git is how you read that diff, keep the good parts and throw away the rest.\n\n" +
        "Rule one: one task, one branch. Ask for the CSV export and the agent works on `agent/csv-export`, never on `main`. If the run goes badly, you delete a branch. If it goes well, the branch goes through review like anyone else's.\n\n" +
        "Before merging, compare the branch with the point where it left `main`: `git diff main...agent/csv-export --stat`. The three dots matter: they diff against the merge base, so you see only the agent's work, not everything that landed on `main` since.\n\n" +
        'In mission 9.1 Nova Bot tried twice. The `--stat` of one attempt touches export.ts and its test; the other also rewrites app.ts and deletes notes.ts. Only one deserves a merge.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main'] },
          { id: 'C1', message: 'feat: export notes to CSV', parents: ['A'], lane: 'agent/csv-export', refs: ['agent/csv-export'] },
          { id: 'Q1', message: 'feat: CSV export (quick version)', parents: ['A'], lane: 'agent/csv-quick', refs: ['agent/csv-quick'] },
        ],
        head: 'A',
        caption: 'Two agent attempts, two branches, main untouched until you choose.',
      },
      remember: 'One task, one branch, one review before merge.',
    },
    {
      kind: 'concept',
      id: 'instruction-files',
      title: 'House rules agents read: CLAUDE.md, AGENTS.md and friends',
      body:
        "Agents start every session knowing nothing about your project. Instruction files fix that: committed Markdown that the agent reads before it starts. Claude Code reads `CLAUDE.md`. Many other agents (Codex, Cursor, Copilot, Jules and more) read `AGENTS.md`. Cursor also has `.cursor/rules/*.mdc`, and GitHub Copilot reads `.github/copilot-instructions.md`.\n\n" +
        "Keep one source of truth. A common setup is a full `AGENTS.md` plus a one-line `CLAUDE.md` that imports it with `@AGENTS.md`, so tools do not drift apart.\n\n" +
        "Put the git rules in there: the branch naming scheme, the commit message format, \"never commit .env\", \"never delete or skip a test to make CI pass\", \"run npm test before committing\", \"open a draft pull request, never push to main\". Also the commands it needs: how to install, test, lint, start the app.\n\n" +
        'These files are instructions, not enforcement. An agent can still ignore them, which is why the next slides add settings, hooks and branch protection that actually block things.',
      diagram: {
        kind: 'code',
        title: 'AGENTS.md (committed, read by most agents)',
        text:
          '# Nova notes: rules for coding agents\n' +
          '- Work on a branch named agent/<task>. Never commit to main.\n' +
          '- Commits: Conventional Commits, one idea per commit.\n' +
          '- Before committing: npm run lint && npm test.\n' +
          '- Never delete, skip or weaken a test to make CI pass.\n' +
          '- Never commit .env, node_modules/ or anything in dist/.\n' +
          '- Do not touch package-lock.json unless the task adds a dependency.\n' +
          '- When done: push the branch and open a draft PR with gh pr create --draft.',
      },
      remember: 'Committed instruction files tell every agent the house rules.',
    },
    {
      kind: 'concept',
      id: 'settings-permissions',
      title: 'Shared settings, personal settings and git permissions',
      body:
        "Agent configuration has two halves. Shared settings are committed so the whole team gets them: for Claude Code that is `.claude/settings.json` (permissions, hooks), plus `CLAUDE.md`. Personal settings stay out of git: `.claude/settings.local.json` holds your own allowances, and `.env` holds your secrets. Add both to `.gitignore` if your tool does not do it for you.\n\n" +
        "Permissions decide which commands an agent may run without asking. Read-only git commands (`status`, `diff`, `log`) are safe to allow. Commits on a branch are usually fine. Anything that rewrites shared history or skips checks should ask or be denied: `push --force`, `reset --hard`, `clean -f`, `commit --no-verify`, pushes to `main`.\n\n" +
        "Deny rules match command text, so they are a seatbelt, not a wall: `git push -f` is not literally `git push --force`. The wall is on the server: branch protection that refuses force pushes and direct pushes to `main` no matter who sends them.\n\n" +
        'Mission 9.3 is the hands-on version of the same idea: you decide what enters a commit, not the agent.',
      diagram: {
        kind: 'code',
        title: '.claude/settings.json (committed)',
        text:
          '{\n' +
          '  "permissions": {\n' +
          '    "allow": ["Bash(git status)", "Bash(git diff:*)", "Bash(git log:*)",\n' +
          '              "Bash(git add:*)", "Bash(git commit:*)", "Bash(npm test)"],\n' +
          '    "ask":   ["Bash(git push:*)"],\n' +
          '    "deny":  ["Bash(git push --force:*)", "Bash(git reset --hard:*)",\n' +
          '              "Bash(git commit --no-verify:*)", "Read(./.env)"]\n' +
          '  }\n' +
          '}\n' +
          '\n' +
          '.gitignore:  .env   .claude/settings.local.json   node_modules/',
      },
      remember: 'Team rules in settings.json, your own in settings.local.json, secrets in .env, none of the last two in git.',
    },
    {
      kind: 'concept',
      id: 'guardrails',
      title: 'Guardrails: hooks, protection, tokens, containers',
      body:
        "Layer the defences so one missed rule is caught by the next. On your machine, git hooks (a `pre-commit` running lint and a secret scanner such as gitleaks) check every commit, the agent's included. Agent hooks go further: a Claude Code `PreToolUse` hook sees each command before it runs and can block it, for example any `git push` to `main`.\n\n" +
        "On GitHub, protect `main` with branch protection or a ruleset: pull request required, status checks required, no force pushes, no deletions. Leave the bypass list empty, so an agent holding your token cannot skip it either.\n\n" +
        "Give the agent the least privilege that works. A fine-grained token limited to one repository with Contents: read and write and Pull requests: write can push branches and open PRs, but cannot change settings or delete the repo. GitHub App tokens expire after an hour, which is even better for cloud agents.\n\n" +
        'Finally, isolate the machine. A dev container (`.devcontainer/devcontainer.json`) gives the agent its own filesystem and tools, so a runaway command cannot reach your home folder or other projects. Many teams only let an agent skip permission prompts inside such a container.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'agent', label: 'agent', detail: 'in a dev container', row: 0 },
          { id: 'perm', label: 'permissions + agent hooks', detail: 'deny push --force', row: 0 },
          { id: 'hook', label: 'git pre-commit', detail: 'lint, gitleaks', row: 0 },
          { id: 'push', label: 'push agent/x', detail: 'least-privilege token', row: 1 },
          { id: 'ci', label: 'CI + protection', detail: 'checks required, no force push', row: 1 },
          { id: 'human', label: 'human review', detail: 'then merge to main', row: 1 },
        ],
        edges: [
          { from: 'agent', to: 'perm', label: 'command' },
          { from: 'perm', to: 'hook', label: 'git commit' },
          { from: 'hook', to: 'push' },
          { from: 'push', to: 'ci', label: 'pull request' },
          { from: 'ci', to: 'human', label: 'green' },
        ],
        caption: 'Every layer can stop a bad change; main is reached only through review.',
      },
      remember: 'Instructions ask, permissions and hooks block locally, protection blocks on the server.',
    },
    {
      kind: 'concept',
      id: 'checkpoints',
      title: 'Checkpoints: git versus agent rewind',
      body:
        "Most agents can undo their own steps: Claude Code has `/rewind` (press Esc twice), Cursor has checkpoints. They restore the files the agent edited with its edit tools in this session. They do not undo what a shell command did (`rm`, `mv`, `npm install`, a `git commit`), changes you made yourself, or anything from an earlier session. They are a convenience, not version control.\n\n" +
        "A git checkpoint covers everything git tracks. Before a risky run: commit or stash your own work, then mark the spot with `git branch checkpoint` (or a tag). Whatever the agent does next, the checkpoint still points at a known good commit.\n\n" +
        "To go back: `git reset --hard checkpoint` moves the current branch there and resets every tracked file, and `git clean -f` deletes the untracked files the agent left behind (`-fd` for folders). Both destroy uncommitted work, so run `git status` and `git clean -n` (dry run) first.\n\n" +
        "That is mission 9.4: two junk commits, a broken app.ts and a stray scratch.ts disappear in two commands.",
      diagram: {
        kind: 'before-after',
        command: 'git reset --hard checkpoint && git clean -f',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['checkpoint'] },
            { id: 'J1', message: 'refactor: move notes to store', parents: ['A'], lane: 'main' },
            { id: 'J2', message: 'refactor: rewire app', parents: ['J1'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'J2',
          caption: 'Disk: app.ts broken, scratch.ts untracked.',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main', 'checkpoint'] },
            { id: 'J1', message: 'refactor: move notes to store', parents: ['A'], lane: 'main', ghost: true },
            { id: 'J2', message: 'refactor: rewire app', parents: ['J1'], lane: 'main', ghost: true },
          ],
          head: 'A',
          caption: 'Disk clean. J1 and J2 are only in the reflog now.',
        },
      },
      remember: 'Commit and mark a checkpoint before every agent run.',
    },
    {
      kind: 'concept',
      id: 'worktrees',
      title: 'One worktree per agent',
      body:
        "Two agents in one folder share one working directory and one HEAD. When agent A switches to its branch, agent B's files change under it; when both edit app.ts, one silently overwrites the other. Running agents in parallel needs separate folders.\n\n" +
        "`git worktree add ../nova-tags agent/tags` checks `agent/tags` out in a sibling folder that shares the same `.git` database: same commits, same branches, same remotes, no second clone. Each agent gets its own worktree, and your main folder keeps `main` checked out the whole time. Some agent CLIs do this for you (for example `claude --worktree tags`).\n\n" +
        "A branch can be checked out in only one worktree at a time; git refuses a second one with \"already used by worktree\". That rule is what keeps two agents from committing to the same branch.\n\n" +
        "From the main folder you can act on another worktree without `cd`: `git -C ../nova-tags commit -am \"fix: sort tags A to Z\"`. Mission 9.5 has you fix one agent's branch that way, merge both, and remove the worktrees.",
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'git', label: '.git (shared)', detail: 'commits, branches, remotes', row: 1 },
          { id: 'main', label: 'nova/', detail: 'main - you', row: 0 },
          { id: 'tags', label: '../nova-tags/', detail: 'agent/tags - agent 1', row: 0 },
          { id: 'theme', label: '../nova-theme/', detail: 'agent/theme - agent 2', row: 0 },
        ],
        edges: [
          { from: 'main', to: 'git' },
          { from: 'tags', to: 'git' },
          { from: 'theme', to: 'git' },
        ],
        caption: 'Three folders, three branches, one repository. A commit in any folder is visible from all of them.',
      },
      remember: 'One agent, one branch, one worktree.',
    },
    {
      kind: 'concept',
      id: 'worktree-details',
      title: 'Living with worktrees',
      body:
        "A new worktree contains only tracked files. Untracked and ignored files stay behind: `.env`, `node_modules/`, build output, local databases. So each worktree needs its own setup: copy or link `.env`, run `npm ci`. A setup script in the repo makes that one command.\n\n" +
        "Running apps clash. Two dev servers both want port 3000, and two test runs against one local database corrupt each other's data. Give each worktree its own port (`PORT=3001`) and its own database name or Docker Compose project name.\n\n" +
        "Keep agent branches fresh. Worktrees share remotes, so one `git fetch origin` updates `origin/main` for all of them; then in the agent's worktree run `git rebase origin/main` (or merge it) and rerun the tests before opening or updating the PR.\n\n" +
        "Clean up when the task is merged: `git worktree remove ../nova-tags`. It refuses if the folder has modified or untracked files, which protects unsaved work; `--force` overrides. If you deleted a worktree folder by hand, `git worktree prune` forgets it. A branch cannot be deleted while a worktree has it checked out.",
      diagram: {
        kind: 'code',
        title: 'A worktree for one agent task',
        text:
          '$ git worktree add -b agent/tags ../nova-tags origin/main\n' +
          '$ cp .env ../nova-tags/ && npm --prefix ../nova-tags ci\n' +
          '$ cd ../nova-tags && PORT=3001 npm run dev      # agent works here\n' +
          '$ git fetch origin && git rebase origin/main     # stay fresh\n' +
          '$ git push -u origin agent/tags && gh pr create --draft --fill\n' +
          '  ... PR merged ...\n' +
          '$ cd ../nova && git worktree remove ../nova-tags && git branch -d agent/tags',
      },
      remember: 'Worktrees share history, not untracked files, ports or databases.',
    },
    {
      kind: 'concept',
      id: 'agent-prs',
      title: 'Agent commits, pull requests, cloud agents and CI',
      body:
        "Agents usually commit with your identity and add a trailer so the history says who helped: `Co-Authored-By: Claude <noreply@anthropic.com>` makes GitHub show both authors on the commit. Agent branches tend to have many small \"try again\" commits; squash-merging the PR turns them into one clean commit on `main`.\n\n" +
        "Agents open pull requests the same way you do: `gh pr create --draft --fill` from the terminal, or through the GitHub MCP server, which gives the agent tools such as create pull request and read CI results. A draft PR is the right default: it says \"ready for a human to look\", not \"ready to merge\".\n\n" +
        "Cloud or background agents (Claude Code on the web, Copilot coding agent, Codex, Cursor background agents, an `@claude` mention handled by a GitHub Action) run in a fresh VM: they clone the repo, work on a branch, push it and open a PR. They never touch your laptop, so the PR is your only interface: review it like a stranger's.\n\n" +
        'Agents can also fix CI: read the failure with `gh run view --log-failed`, reproduce it locally, push a fix commit. Watch what they change: the classic bad fix makes the build green by deleting, skipping or loosening the failing test.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'issue', label: 'issue #42', detail: 'assigned to an agent', row: 0 },
          { id: 'vm', label: 'cloud agent', detail: 'clone, branch agent/42', row: 0 },
          { id: 'pr', label: 'draft PR', detail: 'Closes #42', row: 0 },
          { id: 'ci', label: 'CI', detail: 'red? agent reads the log', row: 1 },
          { id: 'you', label: 'you review', detail: 'gh pr checkout, diff, test', row: 1 },
          { id: 'main', label: 'squash merge', detail: 'one commit on main', row: 1 },
        ],
        edges: [
          { from: 'issue', to: 'vm' },
          { from: 'vm', to: 'pr', label: 'push + gh pr create' },
          { from: 'pr', to: 'ci' },
          { from: 'ci', to: 'vm', label: 'fix commit' },
          { from: 'ci', to: 'you', label: 'green' },
          { from: 'you', to: 'main', label: 'approve' },
        ],
        caption: 'A background agent works like a remote teammate: branch, PR, CI loop, human review.',
      },
      remember: 'Agents propose with draft PRs; humans decide with reviews.',
    },
    {
      kind: 'concept',
      id: 'review',
      title: 'Reading an agent diff: red flags',
      body:
        "Never merge an agent diff you have not read. Start wide, then zoom: `git diff main...agent/x --stat` for the list of files, `git log -p main..agent/x` for each commit with its patch, `git diff` and `git diff --staged` for uncommitted work.\n\n" +
        "Look for what should not be there. Files outside the task. Deleted, skipped or weakened tests (an `it.skip`, a loosened assertion). Secrets: `.env`, keys, tokens. Lockfile churn when no dependency was added. Whole files reformatted, which hides the real change. New dependencies nobody asked for.\n\n" +
        "Keep the good, drop the bad. Stage only what belongs to the task (`git add notes.ts tests/sort.test.ts`), choose hunk by hunk with `git add -p` when a file mixes both, and put the rest back with `git restore app.ts package-lock.json`. `git restore --source=main <file>` brings back a file as `main` has it, such as a test the agent deleted, and `git rm --cached .env` stops tracking a file while leaving it on disk.\n\n" +
        'A secret that reached a commit is leaked even if a later commit removes it: rotate it, then clean up.',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'notes.ts', disk: 'sorted A to Z', index: 'sorted A to Z', head: 'list' },
          { path: 'tests/sort.test.ts', disk: 'sort test', index: 'sort test', head: null },
          { path: 'app.ts', disk: 'reformatted', index: 'notes list', head: 'notes list' },
          { path: 'package-lock.json', disk: '340 packages', index: '12 packages', head: '12 packages' },
        ],
        caption: 'Mission 9.3: stage the task (notes.ts and its test), then git restore app.ts and package-lock.json.',
      },
      remember: 'Read the stat, read the patch, stage only the task.',
    },
    {
      kind: 'concept',
      id: 'undo-ladder',
      title: 'Undoing agent changes, from small to big',
      body:
        "Pick the smallest tool that covers the damage. Uncommitted edits to one file: `git restore <file>`. All uncommitted edits: `git restore .` plus `git clean -fd` for new files. Commits on an agent branch you do not want: delete the branch, or `git reset --hard checkpoint`.\n\n" +
        "Already pushed to a shared branch? Do not rewrite it: `git revert <sha>` adds a commit that undoes the change, and everyone else's history stays valid. For a merged PR use `git revert -m 1 <merge-sha>`.\n\n" +
        "Lost something? `git reflog` lists every position HEAD has had, including commits a reset left behind; `git branch rescue <sha>` brings one back.\n\n" +
        'The agent committed straight to `main` (mission 9.6)? Branch first, then reset: `git branch agent/fix` keeps its commits under a name, and `git reset --hard HEAD~2` moves `main` back. Nothing is lost, and the work can now go through review.',
      diagram: {
        kind: 'before-after',
        command: 'git branch agent/fix && git reset --hard HEAD~2',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'F1', message: 'fix: search ignores case', parents: ['A'], lane: 'main' },
            { id: 'F2', message: 'test: search ignores case', parents: ['F1'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'F2',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main'] },
            { id: 'F1', message: 'fix: search ignores case', parents: ['A'], lane: 'agent/fix' },
            { id: 'F2', message: 'test: search ignores case', parents: ['F1'], lane: 'agent/fix', refs: ['agent/fix'] },
          ],
          head: 'A',
        },
        caption: 'The commits did not move: a new label holds them, and main steps back.',
      },
      remember: 'restore for files, reset for local commits, revert for pushed ones, reflog when lost.',
    },
    {
      kind: 'concept',
      id: 'agent-pr-review',
      title: 'Reviewing agent PRs, stacking them, and giving good context',
      body:
        "To test an agent's PR, run it: `gh pr checkout 42` fetches the PR branch (even from a fork) and switches to it; `gh pr checkout 42 --worktree ../pr-42` puts it in its own folder so your work stays untouched. Then run the tests, click through the app, and leave the review with `gh pr review 42 --request-changes -b \"...\"` or `--approve`.\n\n" +
        "Big agent tasks produce big diffs that nobody reviews well. Split them into a stack: PR 1 adds the storage layer, PR 2 (based on PR 1's branch) the API, PR 3 the UI. Each is small enough to read. When PR 1 merges, rebase the rest onto `main` (`git rebase --update-refs` moves every branch in the stack at once); Graphite, git-town and spr automate the bookkeeping (level 7 shows their commands).\n\n" +
        "Agents do better git work when you hand them git context: the base branch, the issue, the last few commits (`git log --oneline -10`), the exact failing CI log, which files are in scope and which are not. Ask for small commits with Conventional messages, a draft PR, and no pushes to `main`.\n\n" +
        'A good prompt names the branch and the boundary: \"On agent/tags, fix the tag sort in tags.ts only; add a test; do not touch package-lock.json.\"',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main'] },
          { id: 'S1', message: 'feat(store): SQLite storage', parents: ['A'], lane: 'agent/store', refs: ['agent/store (PR 1)'] },
          { id: 'S2', message: 'feat(api): notes endpoints', parents: ['S1'], lane: 'agent/api', refs: ['agent/api (PR 2)'] },
          { id: 'S3', message: 'feat(ui): notes screen', parents: ['S2'], lane: 'agent/ui', refs: ['HEAD → agent/ui (PR 3)'] },
        ],
        head: 'S3',
        caption: 'A stack: each PR targets the branch below it, so each diff stays small.',
      },
      remember: 'Check out the PR, run it, review small pieces.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Commands for working with agents',
      rows: [
        { command: 'git diff main...agent/x --stat', does: 'Files an agent branch changed since it left main.' },
        { command: 'git log -p main..agent/x', does: 'Each agent commit with its patch.' },
        { command: 'git merge agent/csv-export', does: 'Bring a reviewed agent branch into main.' },
        { command: 'git add <file>  /  git add -p', does: 'Stage only the part of the agent work you keep.' },
        { command: 'git restore app.ts', does: 'Throw away uncommitted edits to a file.', danger: true },
        { command: 'git restore --source=main --staged --worktree tests/notes.test.ts', does: 'Bring back a file exactly as main has it (e.g. a deleted test).' },
        { command: 'git rm --cached .env', does: 'Stop tracking a file but keep it on disk; then add it to .gitignore.' },
        { command: 'git branch checkpoint', does: 'Mark a safe spot before an agent run.' },
        { command: 'git reset --hard checkpoint', does: 'Move the branch and all tracked files back to the checkpoint.', danger: true },
        { command: 'git clean -n  /  git clean -f', does: 'List, then delete, untracked files the agent left behind.', danger: true },
        { command: 'git worktree add ../nova-tags agent/tags', does: 'Check an existing branch out in its own folder (-b creates a new branch).' },
        { command: 'git -C ../nova-tags commit -am "fix: sort tags A to Z"', does: 'Run git in another worktree without cd.' },
        { command: 'git worktree list  /  git worktree remove ../nova-tags', does: 'See every worktree; remove one when its task is merged.' },
        { command: 'git branch agent/fix && git reset --hard HEAD~2', does: 'Move an agent\'s commits off main: name them first, then step main back.', danger: true },
        { command: 'git fetch origin && git rebase origin/main', does: 'Bring an agent branch up to date before a PR.' },
        { command: 'gh pr checkout 42 [--worktree ../pr-42]', does: 'Check out an agent PR locally to run and test it.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Common agent problems and the fix',
      items: [
        {
          mistake: 'The agent committed to main.',
          fix: 'Not pushed: git branch agent/fix, then git reset --hard HEAD~N. Pushed: git revert the commits. Prevent it with permissions and branch protection.',
        },
        {
          mistake: 'The agent branch is far behind main and the PR conflicts.',
          fix: 'git fetch origin, then git rebase origin/main (or merge it) in the agent worktree, resolve, rerun the tests, push with --force-with-lease.',
        },
        {
          mistake: 'Two agents edited the same files.',
          fix: 'Merge one branch first, then rebase the other onto main and resolve. Next time split tasks by area and give each agent its own worktree.',
        },
        {
          mistake: 'An agent force-pushed over your commits on a shared branch.',
          fix: 'git fetch, then compare: git log main..origin/main shows what the agent pushed, git log origin/main..main shows your commits it replaced (your local branch, or git reflog, still has them). Rebase or cherry-pick your commits onto the new origin/main, run the tests, then git push --force-with-lease (after the rebase it is a fast-forward anyway). Do not push your old tip straight back: before the fetch the lease is rejected as "stale info", because origin/main still remembers your tip, not the agent\'s; after the fetch it goes through and silently discards the agent\'s commits. Then deny push --force for the agent and block force pushes on the server.',
        },
        {
          mistake: 'The agent committed .env or node_modules/.',
          fix: 'git rm -r --cached .env node_modules, add both to .gitignore, commit. If the commit was pushed, rotate every secret in .env.',
        },
        {
          mistake: 'The agent says the commit failed: a hook rejected it, or "Author identity unknown".',
          fix: 'Read the hook output and fix the lint or test, never --no-verify. In a container or cloud VM, set user.name and user.email for that environment.',
        },
        {
          mistake: 'The push is denied: 403, protected branch, or "Permission denied (publickey)".',
          fix: '403: the token lacks Contents write (or the workflow scope for workflow files). Protected branch: push a branch and open a PR. publickey: the remote is SSH but there is no key; switch to HTTPS with gh auth setup-git or add a key.',
        },
        {
          mistake: 'A new worktree fails to start: missing .env, missing modules, port already in use.',
          fix: 'Untracked files are not copied. Copy .env, run npm ci, and give the worktree its own PORT and database.',
        },
      ],
    },
    {
      kind: 'concept',
      id: 'keep-practising',
      title: 'Keep practising',
      body:
        'You now have the model (snapshots, branches as labels, the index as the next commit, remotes that sync only when asked, the reflog as a safety net) and the commands behind every button and every agent workflow in this game. Fluency comes from repetition, so keep a few places to practise.\n\n' +
        'Learn Git Branching draws the commit graph live while you type, with levels on rebasing, cherry-picking and remotes. Oh My Git! is a free game that plays real Git commands as cards on a live repository. GitHub Skills runs short courses inside a repository of your own, where Actions workflows check each step you commit, PRs and Actions included.\n\n' +
        'For depth and rescue: Pro Git is the free official book (chapter 10, on internals, finishes what level 6 started), and Oh Shit, Git!?! is one page of plain-English fixes for the classic messes, recipes you have now run yourself.\n\n' +
        'Above all, keep a throwaway practice repository: a fresh `git init ~/git-sandbox`, or the private gitquest-sandbox that level 11 creates on GitHub. Before you run an unfamiliar command on real work, especially an agent\'s suggestion with reset, rebase, push --force or filter-repo, try it there first, compare `git log --oneline --graph --all` before and after, and let the reflog catch you if it goes wrong.',
      diagram: {
        kind: 'code',
        title: 'Where to practise next',
        text:
          'Learn Git Branching   learngitbranching.js.org   the graph, drawn as you type\n' +
          'Oh My Git!            ohmygit.org                Git as a card game\n' +
          'GitHub Skills         skills.github.com          courses in your own repository\n' +
          'Pro Git               git-scm.com/book           the free official book\n' +
          'Oh Shit, Git!?!       ohshitgit.com              fixes for classic messes\n' +
          '\n' +
          '$ git init ~/git-sandbox     # try it here before you try it on real work',
      },
      remember: 'Try unfamiliar commands in a throwaway repo first, and read the graph before and after.',
    },
  ],
  quiz: [
    {
      id: 'q-three-dots',
      question: 'main got three new commits from Lea after Nova Bot branched off. What does git diff main...agent/csv-export --stat show?',
      options: [
        { id: 'a', text: "Only the agent's changes, compared with the commit where agent/csv-export left main." },
        { id: 'b', text: "The agent's changes plus Lea's three commits shown in reverse." },
        { id: 'c', text: 'Only the commits on main that the agent branch is missing.' },
        { id: 'd', text: 'Nothing, because three-dot diffs only work on merged branches.' },
      ],
      correct: 'a',
      explanation:
        "With three dots, git diff compares the merge base with the branch tip, so main's newer commits do not appear. A two-dot git diff main agent/csv-export would also show Lea's work undone, which is misleading when reviewing an agent.",
    },
    {
      id: 'q-rewind',
      question: "During a run, the agent edited app.ts with its edit tool and ran rm notes.ts in the shell. You use the agent's rewind. What is restored?",
      options: [
        { id: 'a', text: 'Both files, because rewind restores the whole folder.' },
        { id: 'b', text: 'app.ts, but probably not notes.ts: rewind tracks the agent\'s file edits, not what shell commands did.' },
        { id: 'c', text: 'Neither: rewind only restores the conversation.' },
        { id: 'd', text: 'Both, and it also removes any commits the agent made.' },
      ],
      correct: 'b',
      explanation:
        'Agent checkpoints record the edits made through the agent\'s own edit tools. Deletions, moves, installs and commits done in the shell are outside them. A git checkpoint (git branch checkpoint, then reset --hard and clean) covers every tracked file.',
    },
    {
      id: 'q-worktree-env',
      question: 'You run git worktree add ../nova-tags agent/tags, and the agent there says the API key is missing and the dependencies are not installed. Why?',
      options: [
        { id: 'a', text: 'The worktree has its own empty .git, so it needs a fresh clone first.' },
        { id: 'b', text: 'A worktree only contains tracked files; .env and node_modules/ are ignored, so they stay in the original folder.' },
        { id: 'c', text: 'agent/tags was created before .env existed.' },
        { id: 'd', text: 'Worktrees copy everything but hide dotfiles.' },
      ],
      correct: 'b',
      explanation:
        'git worktree add checks out the commit, which only holds tracked files. Ignored and untracked files must be set up per worktree: copy .env, run npm ci. The history is shared, the folder contents are not.',
    },
    {
      id: 'q-lease-stale',
      question: 'Nova Bot force-pushed main on origin, replacing your commit X with its commit Y. You have not fetched since. You run git push --force-with-lease to put X back. What happens?',
      options: [
        { id: 'a', text: 'It succeeds: X is back on origin and Y is gone.' },
        { id: 'b', text: 'It is rejected as "stale info": your origin/main still says X, but the server has Y, so the lease does not match.' },
        { id: 'c', text: 'GitHub merges X and Y into one history.' },
        { id: 'd', text: 'It is rejected as non-fast-forward, and only --force could restore X.' },
      ],
      correct: 'b',
      explanation:
        'The lease checks that the server still has what your origin/main remembers. You last saw X, the server has Y, so Git refuses. After git fetch the same command would succeed and silently drop Y. Instead: fetch, look at git log main..origin/main, rebase your commits onto origin/main, then push.',
    },
    {
      id: 'q-committed-main',
      question: 'Nova Bot made two good commits directly on main (not pushed). Which sequence moves them to agent/fix and puts main back?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'F1', message: 'fix: search ignores case', parents: ['A'], lane: 'main' },
          { id: 'F2', message: 'test: search ignores case', parents: ['F1'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'F2',
      },
      options: [
        { id: 'a', text: 'git reset --hard HEAD~2, then git branch agent/fix' },
        { id: 'b', text: 'git branch agent/fix, then git reset --hard HEAD~2' },
        { id: 'c', text: 'git revert HEAD~2..HEAD, then git branch agent/fix' },
        { id: 'd', text: 'git switch -c agent/fix, then git reset --hard HEAD~2' },
      ],
      correct: 'b',
      explanation:
        'Name the commits first, then move main. Resetting first leaves agent/fix pointing at A (the work would only be in the reflog). Option d resets agent/fix, not main, because switch -c moved HEAD to the new branch. Revert is for pushed history and would keep the commits on main.',
    },
    {
      id: 'q-red-flag',
      question: 'An agent PR to fix a failing test makes CI green. Its diff: one line in sync.ts, and in tests/sync.test.ts an it( became it.skip(. What do you do?',
      options: [
        { id: 'a', text: 'Merge: CI is green, which is what was asked.' },
        { id: 'b', text: 'Request changes: skipping the test hides the bug; the fix must make the test pass as written.' },
        { id: 'c', text: 'Merge and open an issue to unskip the test later.' },
        { id: 'd', text: 'Close the PR and delete the test for good.' },
      ],
      correct: 'b',
      explanation:
        'Deleted, skipped or weakened tests are the top red flag in agent diffs: the check goes green while the behaviour is still broken. Say so in AGENTS.md too, so the next run knows the rule.',
    },
    {
      id: 'q-deny-rule',
      question: 'Your committed settings deny Bash(git push --force:*). Why do you still protect main on GitHub against force pushes?',
      options: [
        { id: 'a', text: 'Because settings.json is never read by agents.' },
        { id: 'b', text: 'Deny rules match command text, so variants like git push -f or a push from a cloud agent with your token are not covered; protection on the server applies to every push.' },
        { id: 'c', text: 'Branch protection makes pushes faster.' },
        { id: 'd', text: 'Because deny rules only work in settings.local.json.' },
      ],
      correct: 'b',
      explanation:
        'Local rules are a seatbelt: useful, but they only see the commands they match on one machine. Server-side protection is enforced by GitHub for every client and every token without bypass rights.',
    },
    {
      id: 'q-settings-files',
      question: 'Which file belongs in git?',
      options: [
        { id: 'a', text: '.claude/settings.local.json with your personal allowances' },
        { id: 'b', text: '.env with the team API key' },
        { id: 'c', text: 'AGENTS.md with the branch and commit rules' },
        { id: 'd', text: 'node_modules/ so the agent does not have to install' },
      ],
      correct: 'c',
      explanation:
        'Shared rules (AGENTS.md, CLAUDE.md, .claude/settings.json) are committed so every person and agent gets them. Personal settings and secrets stay local and ignored, and node_modules/ is rebuilt from the lockfile.',
    },
  ],
  theoryOnly: [
    'Co-Authored-By trailers and squashing agent commits',
    'Agents opening PRs (gh, GitHub MCP)',
    'Cloud and background agents',
    'Agents fixing CI',
    '.cursor/rules and copilot-instructions.md',
    'Agent permissions for git commands',
    'Branch protection as a guardrail',
    'Least-privilege tokens',
    'Hooks as guardrails',
    'Dev containers',
    'Worktree setup: untracked files, port and database clashes',
    'Keeping agent branches fresh (fetch + rebase origin/main)',
    'Undoing pushed agent changes (revert, reflog)',
    'Reviewing agent PRs with gh pr checkout',
    'Stacked PRs',
    'Giving agents good git context',
    'Branch far behind, two agents on the same files, force-push over my commits',
    'Practice resources (Learn Git Branching, Oh My Git!, GitHub Skills, Pro Git, Oh Shit Git) and a throwaway practice repo',
    'Commit failed (hook, no identity) and push denied (scopes, protection, SSH vs HTTPS)',
  ],
};

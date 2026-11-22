/**
 * Lesson 11 — GitHub for real: the gh CLI end to end against the player's private gitquest-sandbox on github.com,
 * and what differs from the local stand-in used in levels 3, 7 and 8. Prepares level 11 (src/game/levels/level11.ts).
 */
import type { Lesson } from '../lesson-model';

export const lesson11: Lesson = {
  levelId: 'github-for-real',
  title: 'GitHub for real',
  summary:
    'How to drive real GitHub from the terminal with gh: signing in, repositories, issues, pull requests, reviews, merges, Actions runs, secrets, releases and the raw API, and what changes when the remote is github.com instead of a local stand-in.',
  slides: [
    {
      kind: 'concept',
      id: 'real-vs-standin',
      title: 'What changes on real GitHub',
      body:
        "Until now `origin` was a bare repository on your Mac pretending to be GitHub. Pushes, fetches, tags and rejected pushes behaved exactly as they do on github.com, because they are plain git. This level uses a real private repository on your account, `<you>/gitquest-sandbox`, and real GitHub machines.\n\n" +
        "The big idea: git carries commits, branches and tags, and nothing else. Pull requests, reviews, issues, releases, secrets, Actions runs and their logs live only in GitHub's database. `git clone` never brings them and `git push` never sends them. You reach them through the website, the API, or `gh`, GitHub's command-line client, which talks to that API.\n\n" +
        "Other things become real too. Signing in matters, because github.com checks who you are on every push. Workflows actually run, on GitHub's machines, and private repositories spend a monthly allowance of minutes. Some features depend on your plan and on whether the repository is public. And GitHub enforces its own rules, such as \"you cannot approve your own pull request\".\n\n" +
        'The sandbox is private and yours alone, so mistakes are cheap. Still, everything you create there is real: it stays until you delete it.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'mac', label: 'your clone', detail: 'commits, branches, tags', row: 0 },
          { id: 'git', label: 'github.com: git data', detail: 'same commits, branches, tags', row: 0 },
          { id: 'gh', label: 'gh CLI', detail: 'GitHub API client', row: 1 },
          { id: 'db', label: 'github.com: everything else', detail: 'PRs, issues, reviews, runs, secrets, releases', row: 1 },
        ],
        edges: [
          { from: 'mac', to: 'git', label: 'git push / fetch' },
          { from: 'gh', to: 'db', label: 'HTTPS API' },
          { from: 'db', to: 'git', label: 'PRs point at branches' },
        ],
        caption: 'git syncs history; gh manages everything GitHub builds around it.',
      },
      remember: 'git moves commits; gh talks to everything else on GitHub.',
    },
    {
      kind: 'concept',
      id: 'auth',
      title: 'Signing in: gh auth',
      body:
        "`gh auth login` signs you in through the browser: it shows a one-time code, you paste it on github.com, and gh stores the resulting token in the macOS keychain. It asks whether git should use HTTPS or SSH. With HTTPS, `gh auth setup-git` makes git borrow gh's token, so pushes stop asking for credentials. GitHub has not accepted account passwords for git since 2021.\n\n" +
        "`gh auth status` is the first thing to run when anything fails: it shows which account is active, where the token is stored, the git protocol, and the token's scopes. Scopes are what the token may do: `repo` for repositories, `workflow` to push changes to `.github/workflows/`, `delete_repo` to delete one. Add a missing one with `gh auth refresh -s workflow`.\n\n" +
        "Several accounts (work and personal) can be signed in at once; `gh auth switch` changes the active one. For scripts and CI, `GH_TOKEN` in the environment overrides the stored login, which is how gh works inside a GitHub Actions job.\n\n" +
        'Treat the token like a password. Never paste it into a file in a repository.',
      diagram: {
        kind: 'code',
        title: 'Terminal',
        text:
          '$ gh auth login --web --git-protocol https\n' +
          '! First copy your one-time code: 3F2A-91BC\n' +
          'Press Enter to open github.com in your browser...\n' +
          'Logged in as lea-nova\n' +
          '$ gh auth setup-git            # git uses gh for HTTPS credentials\n' +
          '$ gh auth status\n' +
          'github.com\n' +
          '  Logged in to github.com account lea-nova (keyring)\n' +
          '  - Git operations protocol: https\n' +
          "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'",
      },
      remember: 'gh auth status first; gh auth refresh -s <scope> when a scope is missing.',
    },
    {
      kind: 'concept',
      id: 'repos',
      title: 'Repositories: create, clone, fork, view',
      body:
        "`gh repo create gitquest-sandbox --private --source=. --push` turns the local repository you are in into a new GitHub repository: it creates it, adds `origin` and pushes. `--public` makes it visible to everyone; `--private` to you and the people you invite. Visibility can be changed later in Settings, but making a repository public publishes its whole history, secrets included.\n\n" +
        "`gh repo clone owner/name` is `git clone` without typing the URL. `gh repo fork owner/name --clone` creates your fork on GitHub and clones it, with `origin` pointing at your fork and `upstream` at the original, exactly the fork-and-PR layout from level 8. `gh repo sync` has two forms. With no argument it updates your local clone: your local default branch is fast-forwarded from GitHub (in a forked clone, from the parent that `upstream` points to). With an argument, `gh repo sync you/notes` updates your fork on GitHub from its parent, all on the server; then `git pull` brings that into your clone.\n\n" +
        "`gh repo view` prints the description and README; add `--web` to open the repository page in the browser. Most gh commands work on the repository of the current folder. `-R owner/name` points one command at another repository, and `gh repo set-default` picks which remote counts when a clone has several.\n\n" +
        'Deleting is deliberate on purpose: `gh repo delete` needs the `delete_repo` scope and asks you to type the name.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'parent', label: 'nova/notes', detail: 'upstream', row: 0 },
          { id: 'fork', label: 'you/notes', detail: 'origin (fork)', row: 0 },
          { id: 'clone', label: 'local clone', detail: 'origin + upstream remotes', row: 1 },
        ],
        edges: [
          { from: 'parent', to: 'fork', label: 'gh repo fork, later gh repo sync' },
          { from: 'fork', to: 'clone', label: 'gh repo fork --clone' },
        ],
        caption: 'gh repo fork --clone sets up both remotes in one command.',
      },
      remember: 'gh repo create --source=. --push publishes a local repo in one step.',
    },
    {
      kind: 'concept',
      id: 'issues',
      title: 'Issues and closing keywords',
      body:
        "An issue is a numbered note on GitHub: a bug, a task, an idea. `gh issue create --title \"Write a sync guide\" --body \"...\"` opens one and prints its number and URL. `gh issue list` shows the open ones (filter with `--label`, `--assignee @me`, `--state closed`), `gh issue view 1` shows one with `--comments` for the discussion, and `gh issue close 1` closes it, with `--reason \"not planned\"` when it will not be done.\n\n" +
        "Issues and pull requests share one numbering, so `#7` can be either. Writing `#7` in any comment creates a cross-link both ways.\n\n" +
        "Closing keywords go further. `Closes #1`, `Fixes #1` or `Resolves #1` (and their other forms like close, fixed, resolved) in a pull request description link that PR to the issue, and when the PR is merged into the default branch, GitHub closes the issue for you. Merged into any other branch, nothing closes. Mission 11.6 does exactly this.\n\n" +
        'Issues, labels, milestones and comments are not in git: a clone never contains them.',
      diagram: {
        kind: 'code',
        title: 'Mission 11.6 in the terminal',
        text:
          '$ gh issue create --title "Write a sync guide" --body "New players ask how sync works."\n' +
          'https://github.com/lea-nova/gitquest-sandbox/issues/1\n' +
          '$ git switch -c gq/11-6-guide\n' +
          '$ git add notes/guide.md && git commit -m "docs: sync guide"\n' +
          '$ git push -u origin gq/11-6-guide\n' +
          '$ gh pr create --title "docs: sync guide" --body "Closes #1"\n' +
          '$ gh pr merge --squash --delete-branch\n' +
          '$ gh issue list --state closed\n' +
          '1  Write a sync guide  closed',
      },
      remember: 'Closes #n in the PR description closes the issue when it merges into the default branch.',
    },
    {
      kind: 'concept',
      id: 'pr-lifecycle',
      title: 'Pull requests from the terminal',
      body:
        "A pull request is a branch on GitHub plus a conversation about merging it. Push first (`git push -u origin gq/11-1-hello`), then `gh pr create`. `--base main` is the branch to merge into, `--title` and `--body` (or `--body-file`) describe it, and `--fill` takes both from your commits. If `.github/pull_request_template.md` exists, its headings are the starting body on the website; from the terminal, pass it with `--body-file` (mission 11.1).\n\n" +
        "`--draft` opens it as a draft: visible, CI runs, but it cannot be merged. `gh pr ready` marks it ready for review. New commits pushed to the branch appear in the PR automatically; you never open a second PR for the same branch.\n\n" +
        "Then follow it: `gh pr list` (open PRs, `--author @me` for yours), `gh pr view` (state, checks, reviews; `--web` for the page, `--comments` for the thread), `gh pr diff` (the patch, `--name-only` for the files), `gh pr checks` (one line per status check; `--watch` waits until they finish).\n\n" +
        'Without a number, these commands act on the PR of the branch you are on.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'branch', label: 'local branch', detail: 'commits', row: 0 },
          { id: 'pushed', label: 'origin branch', detail: 'git push -u', row: 0 },
          { id: 'pr', label: 'pull request #4', detail: 'gh pr create [--draft]', row: 0 },
          { id: 'checks', label: 'checks', detail: 'gh pr checks --watch', row: 1 },
          { id: 'review', label: 'review', detail: 'gh pr review', row: 1 },
          { id: 'merged', label: 'merged into main', detail: 'gh pr merge', row: 1 },
        ],
        edges: [
          { from: 'branch', to: 'pushed' },
          { from: 'pushed', to: 'pr' },
          { from: 'pr', to: 'checks' },
          { from: 'checks', to: 'review' },
          { from: 'review', to: 'merged' },
        ],
        caption: 'Push the branch, open the PR, let checks and review decide, then merge.',
      },
      remember: 'Push, gh pr create, gh pr checks --watch.',
    },
    {
      kind: 'concept',
      id: 'reviews',
      title: 'Reviewing: checkout, review, suggestions',
      body:
        "To review a teammate's PR properly, run it. `gh pr checkout 4` fetches the PR's commits (from a fork too) into a local branch and switches to it; `--worktree ../pr-4` puts it in its own folder instead. Run the tests, try the change, read `gh pr diff 4`.\n\n" +
        "A review has one of three outcomes: `gh pr review 4 --approve`, `--request-changes -b \"why\"`, or `--comment -b \"...\"`. Branch protection can require approvals before merging. GitHub never lets you approve or request changes on your own pull request, so on a team of one, as in mission 11.4, you practise with comments.\n\n" +
        "On the website, reviewers can also leave suggested changes on a line. When the author clicks Commit suggestion, GitHub makes a commit on the PR branch, on GitHub. Your local branch is now behind: run `git pull` before you push again, or your push is rejected as non-fast-forward.\n\n" +
        'Read the Files changed tab like you read an agent diff in level 9: scope, tests, secrets, then style.',
      diagram: {
        kind: 'code',
        title: 'Reviewing PR #4',
        text:
          '$ gh pr checkout 4\n' +
          "Switched to branch 'gq/11-4-review'\n" +
          '$ gh pr diff 4 --name-only\n' +
          'notes/review.md\n' +
          '$ gh pr checks 4\n' +
          'check  pass  6s\n' +
          '$ gh pr review 4 --comment -b "Checklist reads well, checks are green."\n' +
          '$ gh pr review 4 --approve\n' +
          'failed: Can not approve your own pull request',
      },
      remember: 'Check out, run, then review; only someone else can approve.',
    },
    {
      kind: 'concept',
      id: 'merging',
      title: 'Merging on GitHub, then syncing your Mac',
      body:
        "`gh pr merge` merges on GitHub with the method you choose: `--merge` (merge commit), `--squash` (one new commit) or `--rebase` (replayed commits). The repository settings decide which are allowed (level 7: change them with `gh repo edit --enable-squash-merge --delete-branch-on-merge` or `gh api -X PATCH repos/{owner}/{repo}`). `--delete-branch` deletes the branch on GitHub and locally. `--auto` merges by itself once required checks and reviews pass, where the plan supports auto-merge.\n\n" +
        "The merge happens on GitHub, not on your Mac. Your local `main` does not move until you fetch: `git switch main` then `git pull`. Run `git fetch --prune` now and then so remote-tracking names of branches deleted on GitHub disappear.\n\n" +
        "After a squash merge, the PR's commits are not ancestors of `main`; only the new squash commit is. That is why `git branch -d` refuses an unmerged-looking branch after a squash, and why `gh pr merge --delete-branch` (or `git branch -D` once the PR shows merged) is the clean way to remove it.\n\n" +
        'Mission 11.5 makes a two-commit PR, squashes it into one commit on main, deletes the branch and pulls.',
      diagram: {
        kind: 'before-after',
        command: 'gh pr merge --squash --delete-branch && git switch main && git pull',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'docs: sync guide', parents: [], lane: 'main', refs: ['main', 'origin/main'] },
            { id: 'S1', message: 'notes: sync plan', parents: ['A'], lane: 'gq/11-5-squash' },
            { id: 'S2', message: 'notes: offline plan', parents: ['S1'], lane: 'gq/11-5-squash', refs: ['HEAD → gq/11-5-squash', 'origin/gq/11-5-squash'] },
          ],
          head: 'S2',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'docs: sync guide', parents: [], lane: 'main' },
            { id: 'S1', message: 'notes: sync plan', parents: ['A'], lane: 'gq/11-5-squash', ghost: true },
            { id: 'S2', message: 'notes: offline plan', parents: ['S1'], lane: 'gq/11-5-squash', ghost: true },
            { id: 'Q', message: 'notes: sync plan (#5)', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
          ],
          head: 'Q',
        },
        caption: 'GitHub writes the squash commit Q; git pull brings it to your main. The branch is gone in both places.',
      },
      remember: 'Merge on GitHub, then pull: your Mac only learns by fetching.',
    },
    {
      kind: 'concept',
      id: 'actions-real',
      title: 'Actions runs and secrets from the terminal',
      body:
        "A workflow file is inert on your Mac. Once pushed, every matching event starts a run on GitHub's machines. `gh run list` shows recent runs with their status; `gh run watch` follows one live until it ends (it asks which, if several are running); `gh run view <id>` shows its jobs and steps.\n\n" +
        "When a run is red, `gh run view <id> --log-failed` prints only the failed steps' output. Fix, commit, push: the new push starts a new run on the new commit. When the failure was flaky, `gh run rerun <id> --failed` retries without a commit. Workflows with a `workflow_dispatch:` trigger can be started by hand: `gh workflow run ci.yml`; `gh workflow list` shows them all.\n\n" +
        "Secrets are set from the terminal too. `gh secret set DEPLOY_TOKEN` prompts for the value (or reads `--body`), encrypts it and stores it on GitHub. `gh secret list` shows only names and dates; nobody can read a value back, not even you. Workflows get it as `${{ secrets.DEPLOY_TOKEN }}` and GitHub masks it as *** in logs (mission 11.8).\n\n" +
        'On a private repository every minute counts against the monthly allowance, so a CI check of a few seconds, like the sandbox one, costs almost nothing, while a stuck job can burn hours.',
      diagram: {
        kind: 'code',
        title: 'Mission 11.3: a red run, then a green one',
        text:
          '$ git push -u origin gq/11-3-fix\n' +
          '$ gh run list --limit 1\n' +
          'X  notes: draft sync plan  CI  gq/11-3-fix  push  14s\n' +
          '$ gh run view --log-failed\n' +
          'check  Run sh scripts/check.sh  notes/plan.md:2:TODO: write the release note\n' +
          'check  Run sh scripts/check.sh  Remove the TODO lines above.\n' +
          '$ nano notes/plan.md && git commit -am "notes: drop the TODO" && git push\n' +
          '$ gh run watch\n' +
          '  check  in 6s (ID 4815)    completed  success',
      },
      remember: 'Push starts runs; gh run view --log-failed explains red ones.',
    },
    {
      kind: 'concept',
      id: 'releases',
      title: 'Tags and releases',
      body:
        "A GitHub release is a page built on a git tag: a title, notes, and optional files to download. Make the tag in git and push it, because `git push` alone never sends tags: `git tag v0.1.0`, `git push origin v0.1.0`. Then `gh release create v0.1.0 --generate-notes` (mission 11.7).\n\n" +
        "`--generate-notes` lists the pull requests merged since the previous release, with their authors, which is why clear PR titles pay off. `--notes` or `--notes-file` writes your own, `--title` names it, `--draft` keeps it hidden until you publish, `--prerelease` marks a beta. Files listed after the tag are uploaded as assets: `gh release create v0.1.0 dist/nova.zip`.\n\n" +
        "If the tag does not exist on GitHub yet, gh asks GitHub to create it on the tip of the default branch (or `--target <branch>`). That tag is then on GitHub but not on your Mac until `git fetch --tags`. Pass `--verify-tag` to refuse instead, so a release always matches a tag you made on purpose.\n\n" +
        '`gh release list`, `gh release view v0.1.0` and `gh release download v0.1.0` read releases back.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'docs: sync guide', parents: [], lane: 'main' },
          { id: 'B', message: 'chore: release 0.1.0', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main', 'v0.1.0'] },
        ],
        head: 'B',
        caption: 'Commit, push main, tag, push the tag, then gh release create v0.1.0 --generate-notes.',
      },
      remember: 'Push the tag first, then release it.',
    },
    {
      kind: 'concept',
      id: 'api-extensions',
      title: 'gh api and extensions',
      body:
        "Everything the website does goes through GitHub's API, and `gh api` calls it with your login. `gh api repos/{owner}/{repo}` fills in the current repository. `--jq` filters the JSON, `--paginate` follows every page, `-X PATCH -f name=value` changes things, and `gh api graphql -f query=...` speaks GraphQL.\n\n" +
        "Many commands also take `--json fields` with `--jq`, which is handy in scripts: `gh pr list --json number,title --jq '.[].title'`.\n\n" +
        "When gh lacks a command, someone has usually written an extension: a repository named `gh-something` that adds `gh something`. `gh extension install owner/gh-name` adds one, `gh extension list` and `gh extension upgrade --all` maintain them. `gh alias set` makes your own shortcuts, such as `gh alias set mine 'pr list --author @me'`.\n\n" +
        'Settings with no gh command, like branch protection, are often one API call away, on plans that support them.',
      diagram: {
        kind: 'code',
        title: 'Terminal',
        text:
          "$ gh api repos/{owner}/{repo} --jq '.visibility, .default_branch'\n" +
          'private\n' +
          'main\n' +
          "$ gh api repos/{owner}/{repo}/commits --paginate --jq '.[].commit.message' | wc -l\n" +
          '$ gh api -X PATCH repos/{owner}/{repo} -F delete_branch_on_merge=true\n' +
          '$ gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input protect.json\n' +
          '# 403 on a private repo with GitHub Free: protection needs public or a paid plan\n' +
          '$ gh extension install dlvhdr/gh-dash      # adds: gh dash',
      },
      remember: 'If the website can do it, gh api can do it.',
    },
    {
      kind: 'concept',
      id: 'plans-limits',
      title: 'Plans, visibility and limits',
      body:
        "Several features depend on the plan and on visibility. On GitHub Free, branch protection, rulesets, required reviewers, auto-merge and enforced CODEOWNERS work on public repositories only; on private ones they need GitHub Pro, Team or Enterprise. That is why the private sandbox cannot protect main: in this level, the rules live in your habits.\n\n" +
        "Actions: standard GitHub-hosted runners are free on public repositories. Private repositories get a monthly allowance (2,000 minutes on Free) and storage for artifacts and caches, and macOS and Windows minutes count for more. Publishing GitHub Pages from a private repository needs a paid plan. Secret scanning push protection is on by default for public repositories.\n\n" +
        "Why keep the sandbox private, then? Because practice repositories are messy, and anything public is public forever: search engines, forks and clones keep copies even after you delete it. Public is the right choice for open source, with protection on main and secrets nowhere near the history.\n\n" +
        'When you are done practising, `gh repo delete <you>/gitquest-sandbox` (after `gh auth refresh -s delete_repo`) removes the sandbox and everything in it: issues, pull requests, runs and secrets.',
      diagram: {
        kind: 'code',
        title: 'Free plan at a glance',
        text:
          'Feature                          Public repo     Private repo (Free)\n' +
          'Branch protection / rulesets     yes             no (Pro, Team, Enterprise)\n' +
          'Auto-merge, required reviewers   yes             no (paid plans)\n' +
          'Actions on hosted runners        free            2,000 min/month, then paid\n' +
          'Pages                            yes             no (paid plans)\n' +
          'Push protection for secrets      on by default   with GitHub Secret Protection\n' +
          '\n' +
          'Plans change: check the pricing page before you rely on a line here.',
      },
      remember: 'Public on Free gets the guardrails; private on Free gets privacy, not protection.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'The gh CLI, end to end',
      rows: [
        { command: 'gh auth login  /  gh auth status', does: 'Sign in through the browser; show account, protocol and token scopes.' },
        { command: 'gh auth setup-git  /  gh auth refresh -s workflow', does: 'Let git use gh\'s token; add a missing scope.' },
        { command: 'gh repo create NAME --private --source=. --push', does: 'Create a GitHub repo from the current one, add origin and push.' },
        { command: 'gh repo clone owner/name  /  gh repo fork owner/name --clone', does: 'Clone; fork and clone with origin and upstream set.' },
        { command: 'gh repo view --web', does: 'Open the repository page in the browser.' },
        { command: 'gh repo sync  /  gh repo sync you/fork', does: 'Fast-forward your local clone from GitHub / update your fork on GitHub from its parent.' },
        { command: 'gh repo delete owner/name', does: 'Delete a repository with its issues, PRs and runs. Needs the delete_repo scope.', danger: true },
        { command: 'gh issue create / list / view 1 / close 1', does: 'Open, list, read and close issues.' },
        { command: 'gh pr create --base main --title "..." --body-file FILE [--draft | --fill]', does: 'Open a pull request for the pushed current branch.' },
        { command: 'gh pr list / view / diff / checks --watch', does: 'Follow PRs: list, details, patch, status checks until done.' },
        { command: 'gh pr checkout 4 [--worktree DIR]', does: 'Fetch a PR\'s branch locally (also from forks) and switch to it.' },
        { command: 'gh pr review 4 --approve | --request-changes | --comment -b "..."', does: 'Submit a review; you cannot approve your own PR.' },
        { command: 'gh pr merge --squash --delete-branch [--auto]', does: 'Merge on GitHub and delete the branch in both places. Pull afterwards.' },
        { command: 'gh run list / watch / view ID --log-failed / rerun ID --failed', does: 'Follow Actions runs, read failed steps, retry flaky jobs.' },
        { command: 'gh workflow run ci.yml  /  gh secret set NAME', does: 'Start a workflow_dispatch workflow; store an encrypted secret.' },
        { command: 'gh release create v0.1.0 --generate-notes [--verify-tag]', does: 'Publish a release on a tag, with notes from merged PRs.' },
        { command: 'gh api repos/{owner}/{repo} --jq ...  /  gh extension install owner/gh-x', does: 'Call the API directly; add commands from extensions.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Real GitHub problems and the way out',
      items: [
        {
          mistake: 'git push asks for a password, or says password authentication is not supported.',
          fix: 'GitHub takes tokens or SSH keys, not passwords. Run gh auth login, then gh auth setup-git for HTTPS.',
        },
        {
          mistake: 'A push of a workflow file is refused for missing the workflow scope.',
          fix: 'gh auth refresh -s workflow, then push again.',
        },
        {
          mistake: 'gh pr create says a pull request for this branch already exists.',
          fix: 'There is one PR per branch. Push new commits to the same branch and they appear in it; gh pr view shows it.',
        },
        {
          mistake: '"Can not approve your own pull request."',
          fix: 'Expected: approvals must come from someone else. Leave a --comment review, or ask a teammate.',
        },
        {
          mistake: 'The PR is merged on GitHub but git log main does not show it.',
          fix: 'Merges happen on GitHub. git switch main, git pull, and git fetch --prune to drop deleted branches.',
        },
        {
          mistake: 'Your push after a review is rejected as non-fast-forward.',
          fix: 'Someone (or a Commit suggestion click) added commits on GitHub. git pull (or pull --rebase), then push.',
        },
        {
          mistake: 'The issue stayed open after the PR merged.',
          fix: 'The keyword must be in the PR description (Closes #1), and the PR must merge into the default branch.',
        },
        {
          mistake: 'gh release create made a tag you do not have locally, on the wrong commit.',
          fix: 'Push your own tag first, or pass --verify-tag. To get GitHub\'s tag locally: git fetch --tags.',
        },
        {
          mistake: 'Branch protection settings are missing or the API answers 403.',
          fix: 'Private repos on GitHub Free cannot use protection or rulesets. Make the repo public or use a paid plan.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-clone-brings',
      question: 'You run git clone on the sandbox from a new Mac. Which of these arrive?',
      options: [
        { id: 'a', text: 'Commits, branches and tags, but no issues, pull requests or secrets.' },
        { id: 'b', text: 'Everything, including issues and pull request comments.' },
        { id: 'c', text: 'Commits and secrets, but not tags.' },
        { id: 'd', text: 'Only the default branch with no history.' },
      ],
      correct: 'a',
      explanation:
        'git only knows about git objects and refs. Issues, PRs, reviews, releases, runs and secrets live in GitHub\'s database and are reached with the website, gh or the API.',
    },
    {
      id: 'q-merge-local',
      question: 'You squash-merged your PR with gh pr merge --squash. Lea asks why your local main does not have the new commit. What is going on?',
      options: [
        { id: 'a', text: 'Squash merges are only visible on the website.' },
        { id: 'b', text: 'The merge happened on GitHub; your main moves only when you git switch main and git pull.' },
        { id: 'c', text: 'gh pr merge failed silently; merge again.' },
        { id: 'd', text: 'Squash merges are applied to main overnight.' },
      ],
      correct: 'b',
      explanation:
        'GitHub created the squash commit on its copy of main. Your clone learns about it only by fetching, so git pull brings origin/main and then your main forward.',
    },
    {
      id: 'q-self-approve',
      question: 'On the sandbox, gh pr review 4 --approve fails. Why?',
      options: [
        { id: 'a', text: 'The token lacks the workflow scope.' },
        { id: 'b', text: 'GitHub does not let anyone approve or request changes on their own pull request.' },
        { id: 'c', text: 'Approvals require a public repository.' },
        { id: 'd', text: 'Checks must be green before any review.' },
      ],
      correct: 'b',
      explanation:
        'An approval means a second person agrees. Authors can only leave comment reviews on their own PRs, which is what mission 11.4 practises.',
    },
    {
      id: 'q-closes',
      question: 'A PR body says Closes #3. The PR is merged into a develop branch, not into main, the default branch. What happens to issue #3?',
      options: [
        { id: 'a', text: 'It closes immediately.' },
        { id: 'b', text: 'It stays open: closing keywords act only when the PR merges into the default branch.' },
        { id: 'c', text: 'It is deleted.' },
        { id: 'd', text: 'It closes when the PR is opened.' },
      ],
      correct: 'b',
      explanation:
        'The link exists from the moment the PR is opened, but the automatic close happens only on a merge into the default branch.',
    },
    {
      id: 'q-release-tag',
      question: 'You run gh release create v0.2.0 --generate-notes without having created or pushed a v0.2.0 tag. What happens?',
      options: [
        { id: 'a', text: 'gh refuses, because the tag does not exist.' },
        { id: 'b', text: 'GitHub creates v0.2.0 on the tip of the default branch and publishes the release; your Mac sees the tag after git fetch --tags.' },
        { id: 'c', text: 'gh creates the tag locally on HEAD and pushes it.' },
        { id: 'd', text: 'The release is created with no tag at all.' },
      ],
      correct: 'b',
      explanation:
        'Without --verify-tag, a missing tag is created by GitHub from --target, which defaults to the default branch. That may not be the commit you meant, so pushing your own tag first is the safer habit.',
    },
    {
      id: 'q-workflow-scope',
      question: 'git push of a branch that adds .github/workflows/ci.yml is refused: refusing to allow an OAuth App to create or update workflow without workflow scope. What fixes it?',
      options: [
        { id: 'a', text: 'git push --force' },
        { id: 'b', text: 'gh auth refresh -s workflow, then push again' },
        { id: 'c', text: 'Rename the folder to .github/workflow' },
        { id: 'd', text: 'Make the repository public' },
      ],
      correct: 'b',
      explanation:
        'Changing workflows can run code with your secrets, so GitHub requires an extra token scope for it. Force does not add permissions, and a renamed folder would never run.',
    },
    {
      id: 'q-protection-private',
      question: 'You want main on the private sandbox to require a pull request. Settings shows no way to enforce it, and the API answers 403. Why?',
      options: [
        { id: 'a', text: 'Branch protection only exists in the gh CLI.' },
        { id: 'b', text: 'On GitHub Free, branch protection and rulesets are available for public repositories only; private ones need a paid plan.' },
        { id: 'c', text: 'main cannot be protected; only release branches can.' },
        { id: 'd', text: 'You must first delete the sandbox and recreate it.' },
      ],
      correct: 'b',
      explanation:
        'Plan and visibility decide. Making the repo public or upgrading enables protection; until then, protection is a habit, not a rule GitHub enforces.',
    },
    {
      id: 'q-checkout-pr',
      question: 'A contributor opened PR #12 from their fork. What does gh pr checkout 12 do?',
      options: [
        { id: 'a', text: 'Merges PR #12 into your main.' },
        { id: 'b', text: 'Fetches the PR\'s commits into a local branch and switches to it, so you can run and test them.' },
        { id: 'c', text: 'Forks the contributor\'s repository into your account.' },
        { id: 'd', text: 'Opens PR #12 in the browser.' },
      ],
      correct: 'b',
      explanation:
        'GitHub exposes every PR head as a ref, even from forks, and gh pr checkout fetches it into a branch. Nothing is merged; --web would open the browser instead.',
    },
  ],
  theoryOnly: [
    'gh auth setup-git, scopes and multiple accounts',
    'gh repo create, clone, fork --clone, view --web, sync',
    'gh pr checkout and approve / request-changes reviews',
    'Review suggestions committed on GitHub',
    'gh pr merge --auto and merge methods other than squash',
    'gh run rerun and gh workflow run',
    'Release assets, drafts and prereleases',
    'gh api',
    'gh extensions and aliases',
    'Public vs private repo limits (branch protection, rulesets, Pages, Actions minutes)',
    'Deleting a repository (delete_repo scope)',
  ],
};

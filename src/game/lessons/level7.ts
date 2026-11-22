import type { Lesson } from '../lesson-model';

/** Level 7 lesson: the GitHub platform and pull requests. Missions: src/game/levels/level7.ts (simulated locally). */
export const lesson7: Lesson = {
  levelId: 'github',
  title: 'GitHub and pull requests',
  summary:
    'You will understand what GitHub adds on top of Git (pull requests, reviews, merge buttons, protection and security) and which plain Git commands sit behind each button.',
  slides: [
    {
      kind: 'concept',
      id: 'repos-and-forks',
      title: 'Repositories, forks and clones',
      body:
        'A GitHub repository is a Git remote plus everything around it: issues, pull requests, settings, permissions. Visibility is public (anyone can read), private (only people you invite) or internal (everyone in your enterprise). Making a repository public exposes its whole history, secrets included.\n\n' +
        'A clone is a copy on your Mac. A fork is a copy on GitHub under your account, still linked to the original ("upstream"), so you can open pull requests back to it without write access. A template repository is different again: "Use this template" creates a new repository with the same files but a fresh history and no link.\n\n' +
        'Without a license file, nobody else may legally reuse your code. MIT and Apache-2.0 are permissive (Apache adds a patent grant); GPL requires derived work to stay open.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'up', label: 'nova/nova', detail: 'upstream on GitHub', row: 0 },
          { id: 'fork', label: 'you/nova', detail: 'your fork on GitHub', row: 0 },
          { id: 'mac', label: 'nova/ on your Mac', detail: 'clone of your fork', row: 1 },
        ],
        edges: [
          { from: 'up', to: 'fork', label: 'Fork' },
          { from: 'fork', to: 'mac', label: 'git clone' },
          { from: 'mac', to: 'fork', label: 'git push' },
          { from: 'fork', to: 'up', label: 'pull request' },
        ],
        caption: 'With write access you skip the fork: clone the repository and push branches to it directly.',
      },
      remember: 'Clone = copy on your machine; fork = copy on GitHub that can send PRs back.',
    },
    {
      kind: 'concept',
      id: 'pr-anatomy',
      title: 'Anatomy of a pull request',
      body:
        'A pull request is not a Git object. It is a GitHub page that says "please merge this branch into that one": the base branch (where it goes, usually main) and the compare branch (your work). So every PR starts with a branch you pushed: `git switch -c feature/markdown`, commit, `git push -u origin feature/markdown`. One branch per PR; new commits pushed to it update the PR automatically.\n\n' +
        'The description explains why. Writing `Closes #12` (or fixes, resolves) links issue 12 and closes it when the PR is merged into the default branch. A draft PR shows work in progress: CI runs, but it cannot be merged and code owners are not asked to review until you mark it ready.\n\n' +
        'A committed `.github/pull_request_template.md` pre-fills every new description with the team\'s checklist.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'branch', label: 'feature/markdown', detail: 'pushed with -u', row: 0 },
          { id: 'pr', label: 'PR #7', detail: 'base: main <- compare: feature/markdown', row: 0 },
          { id: 'checks', label: 'Review + checks', detail: 'approvals, CI status', row: 0 },
          { id: 'main', label: 'main', detail: 'merged, issue #12 closed', row: 0 },
        ],
        edges: [
          { from: 'branch', to: 'pr', label: 'Open PR' },
          { from: 'pr', to: 'checks' },
          { from: 'checks', to: 'main', label: 'Merge' },
        ],
      },
      remember: 'A PR = a pushed branch + a request to merge it into base.',
    },
    {
      kind: 'concept',
      id: 'reviewing',
      title: 'Reviewing on GitHub',
      body:
        'The Files changed tab shows the diff of base...compare: what the branch changes since it forked. Tick Viewed on each file to track progress; it unticks itself if the file changes again. Click a line number to comment, drag to comment on a range.\n\n' +
        'A suggestion block in a comment proposes replacement lines; the author can press Commit suggestion, and GitHub creates that commit on the PR branch, on the server. Your local branch is now behind, so pull (`git pull --rebase`) before pushing new commits, or your push is rejected.\n\n' +
        'Comments are gathered into a review with one outcome: Comment (no verdict), Approve, or Request changes (blocks merging when reviews are required, until that reviewer approves or the review is dismissed). Reply in threads and mark them resolved as you fix things; then re-request a review.',
      diagram: {
        kind: 'code',
        title: 'A suggestion in a review comment',
        text:
          'Samir commented on editor.ts line 3:\n' +
          '  Use the GFM flavour so tables work.\n' +
          '  ```suggestion\n' +
          "  export const format = 'markdown-gfm';\n" +
          '  ```\n' +
          '  [Commit suggestion]   -> a new commit on feature/markdown',
      },
      remember: 'Someone else can commit to your PR branch on GitHub: pull before you push.',
    },
    {
      kind: 'concept',
      id: 'updating-pr',
      title: 'Keeping a PR up to date',
      body:
        'To fix something, push more commits; or, to keep the PR tidy, amend or rebase your own branch and push with `git push --force-with-lease`. Rewriting is fine on your PR branch because nobody builds on it; reviewers can compare versions with the "compare" link or `git range-diff`.\n\n' +
        'When main moves on, GitHub may say the branch is out of date. The Update branch button merges main into your branch on the server (or rebases it, if you choose "Update with rebase"). Locally it is `git fetch` then `git merge origin/main` (or `git rebase origin/main` plus a force-with-lease push).\n\n' +
        '"This branch has conflicts" means that merge cannot be automatic. GitHub\'s web editor handles simple text conflicts and commits a merge of main into your branch. For anything bigger (many files, binaries, a deleted file) do it locally: merge origin/main, resolve, commit, push.',
      diagram: {
        kind: 'before-after',
        command: 'git fetch && git merge origin/main && git push',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'E', message: 'feat: markdown editor', parents: ['A'], lane: 'pr', refs: ['HEAD → feature/markdown'] },
            { id: 'V', message: 'release: 1.1', parents: ['A'], lane: 'main', refs: ['origin/main'] },
          ],
          head: 'E',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'E', message: 'feat: markdown editor', parents: ['A'], lane: 'pr' },
            { id: 'V', message: 'release: 1.1', parents: ['A'], lane: 'main', refs: ['origin/main'] },
            { id: 'U', message: "Merge remote-tracking branch 'origin/main'", parents: ['E', 'V'], lane: 'pr', refs: ['HEAD → feature/markdown', 'origin/feature/markdown'] },
          ],
          head: 'U',
        },
        caption: 'The PR branch now contains main\'s latest work, which is exactly what the Update branch button does.',
      },
      remember: 'Out of date or conflicting: bring main into the PR branch, resolve, push.',
    },
    {
      kind: 'concept',
      id: 'merge-options',
      title: 'The three merge buttons',
      body:
        'Create a merge commit is `git merge --no-ff`: every PR commit is kept and a merge commit with two parents marks where the PR landed. Good when the individual commits are meaningful. Squash and merge combines the whole PR into one new commit on main: clean history, one commit per PR, ideal for messy small branches. Rebase and merge replays each commit on top of main with new hashes and no merge commit.\n\n' +
        'Repository settings choose which buttons exist; a "require linear history" rule forbids merge commits. Teams usually allow one or two to keep history consistent.\n\n' +
        'After a squash or rebase merge, your branch\'s own commits are not in main (main has copies), so `git branch -d` refuses: check the PR is merged, then `git branch -D`. "Automatically delete head branches" removes the server branch after merge. Auto-merge merges the PR by itself as soon as the required reviews and checks pass.',
      diagram: {
        kind: 'code',
        title: 'Same PR (commits c1, c2), three results on main',
        text:
          'Create a merge commit   A---B-------M      M has parents B and c2\n' +
          '                             \\     /\n' +
          '                              c1--c2\n' +
          '\n' +
          'Squash and merge        A---B---S          S = c1 + c2, one new commit\n' +
          '\n' +
          "Rebase and merge        A---B---c1'--c2'   copies, new hashes",
      },
      remember: 'Merge commit keeps, squash combines, rebase copies; squashed branches need -D.',
    },
    {
      kind: 'concept',
      id: 'repo-settings',
      title: 'Repository settings and your profile',
      body:
        'Settings are the house rules for every PR in the repository, agents\' PRs included, and only admins can change them. Under General, Features turns Issues, Discussions, Projects and the Wiki on or off. The Pull Requests section picks which merge buttons exist (merge commit, squash, rebase), whether auto-merge is allowed, whether head branches are deleted automatically after a merge, and whether Update branch is always offered. Other pages hold collaborators and teams, branch rules, webhooks, secrets and code security.\n\n' +
        'Every checkbox is also an API field, so you can set it from the terminal and repeat it on every repository: `gh repo edit` has flags for the common ones, and `gh api -X PATCH repos/{owner}/{repo} -F field=value` sets any field (gh fills in owner and repo from the current folder).\n\n' +
        'Your profile README: create a public repository named exactly like your username (you/you) with a README.md, and GitHub shows it at the top of github.com/you. An organization does the same with `profile/README.md` in a public repository called `.github`, which also supplies default issue templates and community files (CONTRIBUTING, SECURITY) to its repositories that have none.',
      diagram: {
        kind: 'code',
        title: 'Squash only, tidy branches, from the terminal',
        text:
          '$ gh repo edit --enable-squash-merge --enable-merge-commit=false \\\n' +
          '    --enable-rebase-merge=false --delete-branch-on-merge --enable-auto-merge\n' +
          '$ gh api -X PATCH repos/{owner}/{repo} -F allow_update_branch=true\n' +
          "$ gh api repos/{owner}/{repo} --jq '.allow_merge_commit, .delete_branch_on_merge'\n" +
          'false\n' +
          'true',
      },
      remember: 'Settings decide what every PR can do; gh repo edit and gh api set them from the terminal.',
    },
    {
      kind: 'concept',
      id: 'revert-and-stacks',
      title: 'The Revert button and stacked PRs',
      body:
        'On a merged PR, the Revert button creates a new branch and a new PR whose single commit undoes the merge (for a merge commit that is `git revert -m 1 <merge>`). Nothing is rewritten, and the revert itself is reviewed and merged like any PR.\n\n' +
        'Stacked PRs split a big change into small dependent ones: PR #8 targets main, PR #9 targets PR #8\'s branch, so reviewers only see the new part. When #8 merges and its branch is deleted, GitHub retargets #9 to main. If #8 was squash-merged, rebase #9 onto main with `git rebase --onto origin/main feature/tags-model`, and use `--update-refs` to move a whole local stack at once.\n\n' +
        'Stacking by hand means a lot of rebasing and retargeting, so tools keep the books. Graphite\'s `gt`: `gt create -m "feat: tags UI"` commits your staged changes on a new branch stacked on the current one, `gt submit --stack` pushes every branch and opens or updates one PR each, and `gt sync` pulls main, restacks the rest and offers to delete merged branches. git-town works with plain branches: `git town append feature/tags-ui` starts a child branch, `git town sync --stack` updates the whole stack, `git town propose` opens the PR. spr makes each commit its own PR: `git spr update` turns the commits on your branch into a stack of PRs. Underneath they rebase and force-push with a lease, exactly as you would by hand.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main'] },
          { id: 'T1', message: 'feat: tags model', parents: ['A'], lane: 'pr8', refs: ['feature/tags-model (PR #8 -> main)'] },
          { id: 'T2', message: 'feat: tags UI', parents: ['T1'], lane: 'pr9', refs: ['HEAD → feature/tags-ui (PR #9 -> tags-model)'] },
        ],
        head: 'T2',
        caption: 'PR #9 shows only T2, because its base is PR #8\'s branch.',
      },
      remember: 'Revert button = a reviewed revert PR; stacked PR = base on the previous PR\'s branch.',
    },
    {
      kind: 'concept',
      id: 'issues-projects',
      title: 'Issues, Projects, Discussions and notifications',
      body:
        'Issues track bugs and tasks. Labels sort them (bug, good first issue), milestones group them toward a release, assignees say who owns them, and sub-issues break a large issue into parts. Issue forms in `.github/ISSUE_TEMPLATE/` ask reporters the right questions.\n\n' +
        '`#12` in any comment links issue 12 (`nova/icons#3` for another repo). Closing keywords (close, fix, resolve and their forms) in a PR description close the issue on merge, but only when the PR targets the default branch; you can also link a PR in its Development sidebar.\n\n' +
        'Projects are tables, boards and roadmaps built from issues and PRs across repositories, with custom fields (status, priority, iteration) and built-in automations, such as moving an item to Done when its PR merges. Discussions are a forum inside the repository for questions, ideas and announcements: threaded, with an answer that can be marked, and an issue can become a discussion or the other way round. A wiki is a set of Markdown pages for longer docs, itself a Git repository you can clone (`nova.wiki.git`).\n\n' +
        'Notifications follow what you watch. Watch a repository for all activity, only threads you take part in, or chosen events such as releases; GitHub also subscribes you to threads you open, comment on, are assigned or are @mentioned in. The inbox at github.com/notifications filters with queries like `reason:review-requested is:unread`, and Settings > Notifications sends email for each organization to the address you choose.',
      diagram: {
        kind: 'code',
        title: 'PR description',
        text:
          '## Markdown editor\n' +
          '\n' +
          'Adds GFM rendering to the editor.\n' +
          '\n' +
          'Closes #12\n' +
          'Related to #15 (stays open)',
      },
      remember: 'Closes #N closes the issue when the PR merges into the default branch.',
    },
    {
      kind: 'concept',
      id: 'governance',
      title: 'Roles, protection, CODEOWNERS and merge queue',
      body:
        'An organization owns repositories instead of a person. Owners manage members, billing and policies; members are grouped into teams (teams can nest), and each team gets a role per repository: Read, Triage (manage issues), Write (push), Maintain (settings short of destructive ones), Admin. Access then follows the team, and `@nova/core` in CODEOWNERS or a review request means all of it. Give the least role that works.\n\n' +
        'Organizations can require two-factor authentication for every member. With SAML single sign-on (GitHub Enterprise Cloud), members also sign in through the company\'s identity provider, so leaving the company ends their access, and tokens and SSH keys must be authorized for the organization before they work there. The audit log (organization Settings > Audit log) records who did what and when, such as a member added, a repository made public or deleted (`action:repo.destroy`), a rule changed. A repository\'s Insights tab shows contributors, commit activity, traffic and the dependency graph.\n\n' +
        'Branch protection rules (or the newer, layered rulesets, which can cover many repositories and tags) can require a PR, a number of approvals, passing status checks, an up-to-date branch, linear history, signed commits, and block force pushes and deletion. Then a direct push to main is rejected, and your only way in is a PR.\n\n' +
        '`.github/CODEOWNERS` maps paths to owners, who are requested automatically and can be required to approve; the last matching line wins. A merge queue lines PRs up, tests each one combined with main and the PRs ahead of it, then merges them in order, so a busy main never breaks because two green PRs conflict logically.',
      diagram: {
        kind: 'code',
        title: '.github/CODEOWNERS',
        text:
          '*            @nova/core\n' +
          '*.css        @samir\n' +
          'docs/        @ines\n' +
          'sync/        @lea @nova/backend\n' +
          '# a PR touching docs/guide.md requests @ines (last match wins)',
      },
      remember: 'Protection decides how code gets into main; CODEOWNERS decides who must look.',
    },
    {
      kind: 'concept',
      id: 'security',
      title: 'Security features',
      body:
        'Dependabot reads your dependency manifests: alerts flag known vulnerable versions, security updates open PRs that bump them, and version updates (configured in `.github/dependabot.yml`) keep everything current. Secret scanning finds tokens in your history; push protection blocks a push that contains one before it lands (bypassing it requires a reason).\n\n' +
        'Code scanning with CodeQL analyses the code itself for vulnerabilities such as injection or unsafe path handling. Turn on default setup in Settings > Code security (advanced setup commits a workflow you can tune instead). It scans pushes and PRs to the default branch; results land in the Security tab, and on a PR new findings appear as annotations on the diff and as a CodeQL check that rules can require. It is free on public repositories; private ones need a paid GitHub security product.\n\n' +
        'A `SECURITY.md` tells researchers how to report a vulnerability privately instead of opening a public issue, and private vulnerability reporting gives them a form for it.\n\n' +
        'Automation needs credentials, so give each the least power: a fine-grained personal access token limited to the repositories and permissions it needs, with an expiry; a GitHub App for integrations (per-repository install, short-lived tokens, acts as a bot); a deploy key for a server that needs one repository over SSH, read-only unless writing is required. Avoid classic tokens with broad scopes.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'push', label: 'git push', detail: 'contains a token?', row: 0 },
          { id: 'protect', label: 'Push protection', detail: 'blocked before it lands', row: 0 },
          { id: 'pr', label: 'Pull request', detail: 'CodeQL + Dependabot checks', row: 0 },
          { id: 'main', label: 'main', detail: 'secret scanning keeps watching', row: 0 },
        ],
        edges: [
          { from: 'push', to: 'protect' },
          { from: 'protect', to: 'pr', label: 'clean' },
          { from: 'pr', to: 'main', label: 'merge' },
        ],
      },
      remember: 'Scan dependencies, secrets and code; give every token the least power it needs.',
    },
    {
      kind: 'concept',
      id: 'releases-and-more',
      title: 'Releases, Packages, Pages, gists and webhooks',
      body:
        'A GitHub Release is built on a Git tag: notes (which GitHub can generate from merged PRs) plus downloadable files. Tag locally with `git tag -a v1.0 -m "Nova 1.0"` and `git push origin v1.0`, or let `gh release create` make the tag. GitHub Packages hosts packages next to the code: container images at `ghcr.io/OWNER/NAME`, plus npm, Maven, NuGet and RubyGems packages. A workflow publishes with its `GITHUB_TOKEN` once it has `permissions: packages: write`.\n\n' +
        'GitHub Pages serves a static site at `https://you.github.io/repo/` (or your own domain), either straight from a branch (its root or `/docs` folder) or, when the site needs a build step, from an Actions workflow that builds and deploys it. Gists (gist.github.com) are snippets of one or a few files, each a small Git repository you can clone and push to; a secret gist is unlisted, not private, so anyone with the URL can read it. Codespaces gives you a cloud development machine configured by `.devcontainer/devcontainer.json`; pressing `.` on a repository opens github.dev, a browser editor without a terminal.\n\n' +
        'A webhook (Settings > Webhooks) makes GitHub send an HTTP POST with a JSON payload to your URL when chosen events happen: push, pull_request, issues, release. Each delivery is signed with your secret in the `X-Hub-Signature-256` header, and your server must check that signature before trusting it. Recent Deliveries shows every request and response and can redeliver one.\n\n' +
        'Search understands qualifiers: `is:pr is:open review-requested:@me`, `repo:nova/nova is:issue label:bug no:assignee`, and code search like `repo:nova/nova path:src/ API_KEY`.',
      diagram: {
        kind: 'code',
        title: 'Shipping v1.0',
        text:
          '$ git switch main && git pull --ff-only\n' +
          '$ git tag -a v1.0 -m "Nova 1.0"\n' +
          '$ git push origin v1.0\n' +
          '$ gh release create v1.0 --generate-notes\n' +
          'https://github.com/nova/nova/releases/tag/v1.0',
      },
      remember: 'A release is a pushed tag plus notes and files.',
    },
    {
      kind: 'concept',
      id: 'copilot-and-gh',
      title: 'Copilot coding agent and the gh CLI',
      body:
        'The Copilot coding agent takes an issue assigned to Copilot (or a task from chat), works in its own temporary environment, pushes to a `copilot/` branch and opens a pull request. You review it like any teammate\'s PR and comment to ask for changes; branch protection, required reviews and checks still apply, and a human decides whether to merge.\n\n' +
        'The `gh` command line does most of the website from the terminal, which also makes it the natural tool for agents. Log in once with `gh auth login`, then create, check out, review and merge PRs without leaving the shell. `gh api` calls any REST or GraphQL endpoint, and `gh extension install` adds commands.',
      diagram: {
        kind: 'code',
        title: 'gh essentials',
        text:
          'gh auth login / gh auth status\n' +
          'gh repo clone nova/nova | gh repo fork --clone | gh repo create | gh repo view --web\n' +
          'gh pr create --fill --draft --base main\n' +
          'gh pr list | gh pr view 7 | gh pr checkout 7 | gh pr diff 7\n' +
          'gh pr review 7 --approve | --request-changes -b "..."\n' +
          'gh pr checks 7 --watch\n' +
          'gh pr merge 7 --squash --delete-branch --auto\n' +
          'gh issue create | gh issue list --label bug\n' +
          'gh run list | gh run view --log-failed\n' +
          'gh release create v1.0 --generate-notes\n' +
          'gh api repos/nova/nova/pulls',
      },
      remember: 'Agent PRs are still PRs: same review, same protection.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Git behind the GitHub buttons',
      rows: [
        { command: 'git switch -c feature/x && git push -u origin feature/x', does: 'Start a PR: a branch on origin with upstream tracking.' },
        { command: 'git pull --rebase', does: 'Get commits made on the PR branch on GitHub (suggestions) before pushing.' },
        { command: 'git commit --amend && git push --force-with-lease', does: 'Tidy your own PR branch without clobbering others\' pushes.', danger: true },
        { command: 'git fetch && git merge origin/main', does: '"Update branch" / resolve PR conflicts locally.' },
        { command: 'git merge --no-ff feature/x', does: '"Create a merge commit".' },
        { command: 'git merge --squash feature/x && git commit', does: '"Squash and merge".' },
        { command: 'git rebase main (then fast-forward)', does: '"Rebase and merge".' },
        { command: 'git revert -m 1 <merge>', does: '"Revert" on a merged PR.' },
        { command: 'git branch -f main origin/main', does: 'Put a local main back on the server\'s main (not checked out).', danger: true },
        { command: 'git rebase --onto origin/main <old-base>', does: 'Restack a PR after its base PR was squash-merged.' },
        { command: 'git tag -a v1.0 -m "msg" && git push origin v1.0', does: 'Tag a release and publish the tag.' },
        { command: 'git push origin --delete feature/x', does: 'Delete the branch on GitHub.' },
        { command: 'git branch -D feature/x', does: 'Delete a squash-merged branch locally (-d refuses).', danger: true },
        { command: 'gh pr create / checkout / review / merge', does: 'Pull requests from the terminal.' },
        { command: 'gh run view --log-failed', does: 'Read why CI failed.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'GitHub mistakes and the way out',
      items: [
        {
          mistake: 'Push to the PR branch rejected after a reviewer used Commit suggestion.',
          fix: 'The server has a commit you lack. git pull --rebase, then git push.',
        },
        {
          mistake: 'Committed to main, and the push is rejected by branch protection.',
          fix: 'git switch -c fix/x, git push -u origin fix/x, open a PR, then git branch -f main origin/main to reset local main.',
        },
        {
          mistake: 'git branch -d says the branch is not fully merged, though the PR was squash-merged.',
          fix: 'Squash wrote a new commit, so Git cannot see the merge. Confirm the PR is merged on GitHub, then git branch -D.',
        },
        {
          mistake: 'Closes #12 in the PR, merged, and the issue is still open.',
          fix: 'Closing keywords only work when the PR targets the default branch. Close it by hand or link it in the Development sidebar.',
        },
        {
          mistake: 'Force-pushed a PR branch with --force and erased a teammate\'s commit.',
          fix: 'Always use --force-with-lease. Recover the lost commit from the teammate\'s clone or the PR timeline, which still lists it.',
        },
        {
          mistake: 'Reverted a merged PR, fixed the branch, merged it again, and most of the feature is still missing.',
          fix: 'Git still sees the old commits as merged. Revert the revert commit first, then merge the fix.',
        },
        {
          mistake: 'Gave a CI script a classic token with full repo scope.',
          fix: 'Use a fine-grained token limited to one repository and the exact permissions, with an expiry, or a GitHub App.',
        },
        {
          mistake: 'Tag v1.0 exists locally but the release page cannot find it.',
          fix: 'git push does not send tags: git push origin v1.0.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-base-compare',
      question: 'You want feature/markdown merged into main. In the PR form, what goes where?',
      options: [
        { id: 'a', text: 'base: feature/markdown, compare: main' },
        { id: 'b', text: 'base: main, compare: feature/markdown' },
        { id: 'c', text: 'base: origin, compare: main' },
        { id: 'd', text: 'Either way works; GitHub detects the direction' },
      ],
      correct: 'b',
      explanation:
        'Base is where the changes go, compare is where they come from. Reversed, the PR would propose merging main into your feature branch.',
    },
    {
      id: 'q-squash-delete',
      question: 'Your PR was squash-merged. Locally, git branch -d fix/readme-typo refuses. Why?',
      options: [
        { id: 'a', text: 'The branch is still checked out on GitHub' },
        { id: 'b', text: 'main holds a new squash commit, not your branch\'s commits, so Git sees them as unmerged' },
        { id: 'c', text: 'Branches with a / in the name need -D' },
        { id: 'd', text: 'You must delete the remote branch first' },
      ],
      correct: 'b',
      explanation:
        'Squash merges copy the changes into one new commit. Your original commits are not ancestors of main, so -d (which checks that) refuses. After confirming the PR merged, -D is safe.',
    },
    {
      id: 'q-revert-pr',
      question: 'Merged PR #7 (merge commit M) breaks the app, and Yanis already pushed more work on top. How do you undo PR #7 from the terminal?',
      options: [
        { id: 'a', text: 'git reset --hard M^1 and git push --force' },
        { id: 'b', text: 'git revert -m 1 M and git push' },
        { id: 'c', text: 'git revert M and git push' },
        { id: 'd', text: 'Delete the feature/markdown branch on GitHub' },
      ],
      correct: 'b',
      explanation:
        'Reverting with -m 1 adds a commit that removes what the merge brought while keeping Yanis\'s work, with a normal push. Without -m Git refuses on a merge, reset would erase Yanis\'s commits, and deleting the branch changes nothing in main.',
    },
    {
      id: 'q-secret-gist',
      question: 'To show Lea a config file, you paste it, real API key included, into a secret gist and send her the link. Who can read it?',
      options: [
        { id: 'a', text: 'Only you and Lea, because secret gists are private' },
        { id: 'b', text: 'Anyone who gets the URL: a secret gist is unlisted, not private' },
        { id: 'c', text: 'Only members of your organization' },
        { id: 'd', text: 'Nobody but you until Lea accepts an invitation' },
      ],
      correct: 'b',
      explanation:
        'Secret only keeps the gist out of search and off your profile. The URL is the only lock, and links travel through chats, logs and browser history. Treat the key as leaked and rotate it; share secrets through a password manager or Actions secrets instead.',
    },
    {
      id: 'q-auto-delete',
      question: 'Every merged agent PR leaves its branch on GitHub, and the team wants squash merges only. Where do you fix both, once, for every future PR?',
      options: [
        { id: 'a', text: 'In each PR, by ticking Delete branch and picking Squash before merging' },
        { id: 'b', text: 'In the repository settings (or gh repo edit): allow only squash, and turn on automatic deletion of head branches' },
        { id: 'c', text: 'In AGENTS.md, by asking agents to delete their branches' },
        { id: 'd', text: 'In a branch protection rule on main that requires linear history' },
      ],
      correct: 'b',
      explanation:
        'Allowed merge methods and "Automatically delete head branches" are repository settings, enforced for every merge by people, agents and gh pr merge. Linear history would block merge commits but still allow rebase merges, and an instruction file is only a request.',
    },
    {
      id: 'q-codeowners',
      question: 'CODEOWNERS contains "* @nova/core" then "docs/ @ines". Whose review is requested for a PR that only changes docs/guide.md?',
      options: [
        { id: 'a', text: '@nova/core only' },
        { id: 'b', text: '@ines only, because the last matching line wins' },
        { id: 'c', text: 'Both, because both lines match' },
        { id: 'd', text: 'Nobody: CODEOWNERS ignores folders' },
      ],
      correct: 'b',
      explanation:
        'For each file, the last pattern that matches decides the owners. docs/guide.md matches both lines, and docs/ comes last, so only @ines is requested.',
    },
    {
      id: 'q-merge-queue',
      question: 'Two PRs are each green against main, but merged together they break the build. Which feature prevents that?',
      options: [
        { id: 'a', text: 'Draft pull requests' },
        { id: 'b', text: 'A merge queue' },
        { id: 'c', text: 'Auto-merge' },
        { id: 'd', text: 'Squash and merge' },
      ],
      correct: 'b',
      explanation:
        'A merge queue tests each PR combined with main and the PRs ahead of it before merging. Auto-merge only waits for each PR\'s own checks, so it would happily merge both.',
    },
    {
      id: 'q-least-privilege',
      question: 'A nightly script must read the contents of one private repository. Which credential follows least privilege?',
      options: [
        { id: 'a', text: 'Your classic token with the repo scope' },
        { id: 'b', text: 'A fine-grained token for that one repository with read-only contents and an expiry' },
        { id: 'c', text: 'Your GitHub password in an environment variable' },
        { id: 'd', text: 'An organization owner\'s token' },
      ],
      correct: 'b',
      explanation:
        'A classic repo-scoped token can write to every repository you can access; a fine-grained token can be limited to one repository, one permission and a lifetime. A read-only deploy key or a GitHub App would also be reasonable.',
    },
  ],
  theoryOnly: [
    'repository visibility and templates',
    'repository settings (features, merge buttons, auto-delete head branches) via Settings, gh repo edit and gh api',
    'profile README (user repo named like the username, org .github/profile)',
    'forks vs clones',
    'licenses',
    'draft pull requests and PR templates',
    'closing keywords',
    'review outcomes (Comment, Approve, Request changes)',
    'squash and rebase merge options, allowed merge methods',
    'auto-merge and auto-deleting branches',
    'resolving conflicts in the web editor',
    'stacked PRs and stacking tools (Graphite, git-town, spr)',
    'the Revert button (practised as git revert -m 1)',
    'issues, labels, milestones, templates, sub-issues',
    'Projects, Discussions, wikis and notifications',
    'roles, organizations, teams, required 2FA and SAML SSO',
    'branch protection rules and rulesets (practised only as a rejected push)',
    'CODEOWNERS',
    'merge queue',
    'audit log and insights',
    'Dependabot',
    'secret scanning and push protection',
    'CodeQL code scanning (default setup, PR annotations)',
    'SECURITY.md',
    'deploy keys, GitHub Apps and fine-grained tokens',
    'GitHub Releases',
    'GitHub Packages (ghcr.io) and GitHub Pages',
    'gists (secret means unlisted), Codespaces, github.dev',
    'webhooks and signature checks',
    'search syntax',
    'Copilot coding agent',
    'gh CLI',
  ],
};

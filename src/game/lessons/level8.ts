/**
 * Lesson 8 — Team workflows: branching strategies, commit conventions, release and deploy flows, repo hygiene.
 * Prepares level 8 (src/game/levels/level8.ts): GitHub Flow, Conventional Commits, atomic commits, v1.1.0, hotfix 1.1.1.
 */
import type { Lesson } from '../lesson-model';

export const lesson8: Lesson = {
  levelId: 'team',
  title: 'Team workflows',
  summary:
    'How a team agrees on where work happens, what a commit message says, how a change travels from a branch to users, and how to ship, fix and roll back without surprises.',
  slides: [
    {
      kind: 'concept',
      id: 'github-flow',
      title: 'GitHub Flow: one short branch per change',
      body:
        "A workflow is a team agreement about three things: what `main` means, where unfinished work lives, and how a change reaches users. Git does not enforce any of it. The agreement lives in habits, branch protection and CI.\n\n" +
        "GitHub Flow is the simplest one. `main` is always deployable. Every change, however small, gets a short-lived branch such as `feature/pin`. You push it, open a pull request, CI runs, a teammate reviews, and the branch is merged into `main` and deleted. Then `main` is deployed.\n\n" +
        "A `--no-ff` merge (or GitHub's Create a merge commit button) keeps one merge commit per feature, so `git log --first-parent main` reads like a list of shipped features. Deleting the branch afterwards, both locally and on origin, keeps the branch list short and honest.\n\n" +
        'It works best for web apps and services that deploy often and support only one version: the one that is live.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['v1.0.0'] },
          { id: 'B', message: 'feat(pin): pin a note to the top', parents: ['A'], lane: 'feature/pin' },
          { id: 'M', message: "Merge branch 'feature/pin'", parents: ['A', 'B'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
        ],
        head: 'M',
        caption: 'Mission 8.1: branch, commit, push, merge with --no-ff, push main, delete feature/pin in both places.',
      },
      remember: 'Branch, push, review, merge, deploy, delete.',
    },
    {
      kind: 'concept',
      id: 'trunk-based',
      title: 'Trunk-based development and feature flags',
      body:
        "Trunk-based teams go one step further: everyone integrates into `main` (the trunk) at least once a day. Branches, if they exist at all, live for hours, not weeks. Small, frequent merges mean merge conflicts stay small and nobody spends Friday integrating a month of work.\n\n" +
        "The catch: unfinished features land in `main` too. A feature flag hides them. The code ships, but the new path runs only when the flag is on, for staff, for 5% of users, or for nobody yet. Turning the flag on is the release; it needs no deploy and can be undone in seconds.\n\n" +
        "This splits two words people often mix up: deploy (the code is on the servers) and release (users see the feature). Flags cost something too: every flag is a branch in your code, so remove it once the feature is fully on.\n\n" +
        'Trunk-based development needs strong CI: if `main` must always work and everyone merges daily, every merge has to be tested automatically.',
      diagram: {
        kind: 'code',
        title: 'src/share.ts: shipped dark',
        text:
          "if (flags.enabled('share-links', user)) {\n" +
          '  showShareButton(note);   // new path: only for users in the rollout\n' +
          '}\n' +
          '// When share-links is at 100% and stable: delete the flag and this if.',
      },
      remember: 'Merge small and daily; hide unfinished work behind a flag, not a branch.',
    },
    {
      kind: 'concept',
      id: 'git-flow',
      title: 'Git Flow: develop, release and hotfix branches',
      body:
        "Git Flow (2010) uses two long-lived branches. `main` holds only released versions, each one tagged. `develop` collects finished features. Features branch from `develop` and merge back into it.\n\n" +
        "To ship, you cut `release/1.2` from `develop`: only fixes go there while it is tested, then it merges into `main` (tagged `v1.2.0`) and back into `develop`. An urgent fix branches from `main` as `hotfix/1.2.1`, merges into `main` with a new tag, and also back into `develop` so the bug does not return.\n\n" +
        "It fits software that ships numbered versions on a schedule: desktop and mobile apps, libraries, firmware. For a web app deployed many times a day it is mostly ceremony, and its own author now recommends GitHub Flow for continuously delivered software.\n\n" +
        "The lasting idea from Git Flow is the hotfix: a fix built on what users actually run, then brought back to the main line. You will do exactly that in mission 8.5.",
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'v1.1.0', parents: [], lane: 'main', refs: ['v1.1.0'] },
          { id: 'D1', message: 'start develop', parents: ['A'], lane: 'develop' },
          { id: 'F1', message: 'feat: share link', parents: ['D1'], lane: 'feature/share' },
          { id: 'D2', message: "Merge 'feature/share'", parents: ['D1', 'F1'], lane: 'develop' },
          { id: 'R1', message: 'fix: release polish', parents: ['D2'], lane: 'release/1.2' },
          { id: 'M1', message: "Merge 'release/1.2'", parents: ['A', 'R1'], lane: 'main', refs: ['v1.2.0'] },
          { id: 'D3', message: "Merge 'release/1.2' into develop", parents: ['D2', 'R1'], lane: 'develop', refs: ['develop'] },
          { id: 'H1', message: 'fix: crash on empty note', parents: ['M1'], lane: 'hotfix/1.2.1' },
          { id: 'M2', message: "Merge 'hotfix/1.2.1'", parents: ['M1', 'H1'], lane: 'main', refs: ['HEAD → main', 'v1.2.1'] },
        ],
        head: 'M2',
        caption: 'Features go through develop; releases and hotfixes merge into main, get a tag, and flow back to develop (hotfix back-merge not drawn).',
      },
      remember: 'Git Flow: main = releases, develop = next release, hotfix = patch on a tag.',
    },
    {
      kind: 'concept',
      id: 'gitlab-flow',
      title: 'GitLab Flow, release branches and backports',
      body:
        "GitLab Flow keeps GitHub Flow's feature branches and adds branches that mirror reality. With environment branches, `main` deploys to staging and a `production` branch deploys to production; you promote by merging `main` into `production`. The branch always tells you what runs where.\n\n" +
        "When you support several versions at once (an app store build, an LTS release), you keep a release branch per version, such as `release/1.x`. New work never lands there, only fixes.\n\n" +
        "The rule is upstream first: fix the bug on `main`, merge it, then backport it with `git cherry-pick -x <sha>` onto each release branch that needs it. `-x` appends \"(cherry picked from commit ...)\" to the message, so anyone can trace the copy back to the original. Fixing the release branch first and forgetting `main` is how a bug comes back in the next version.\n\n" +
        'A cherry-pick creates a new commit with a new hash, because its parent is different. Same change, different commit.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'v1.0.0', parents: [], lane: 'main', refs: ['v1.0.0'] },
          { id: 'R1', message: 'chore(release): 1.0.1', parents: ['A'], lane: 'release/1.x' },
          { id: 'B', message: 'feat: share links', parents: ['A'], lane: 'main' },
          { id: 'C', message: 'fix(search): handle empty query', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
          { id: "C'", message: 'fix(search): handle empty query (cherry picked from C)', parents: ['R1'], lane: 'release/1.x', refs: ['release/1.x'] },
        ],
        head: 'C',
        caption: 'Upstream first: the fix lands on main (C), then git cherry-pick -x C copies it to release/1.x as a new commit.',
      },
      remember: 'Fix main first, then cherry-pick -x the fix into every release you still support.',
    },
    {
      kind: 'concept',
      id: 'fork-or-shared',
      title: 'Fork-and-PR or a shared repository',
      body:
        "In a shared repository every teammate can push branches to the same `origin`. That is the norm inside a company: one remote, branch protection on `main`, pull requests between branches of the same repo.\n\n" +
        "Open source works differently, because strangers cannot get write access. A contributor forks the project (their own copy on GitHub), pushes branches to the fork, and opens a pull request from `fork:branch` to `upstream:main`. Locally they keep two remotes: `origin` for the fork they push to, `upstream` for the project they fetch from.\n\n" +
        "Forks need syncing: `git fetch upstream` then rebase or merge `upstream/main`, or the Sync fork button. Secrets are another difference: workflows triggered by a pull request from a fork get no secrets and a read-only token, so a stranger's code cannot steal them.\n\n" +
        'Some companies use forks internally too, to keep a large org repo free of hundreds of personal branches. It is a trade-off, not a rule.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'up', label: 'upstream', detail: 'nova/notes (read-only to you)', row: 0 },
          { id: 'fork', label: 'origin (your fork)', detail: 'you/notes', row: 0 },
          { id: 'local', label: 'your clone', detail: 'two remotes', row: 1 },
        ],
        edges: [
          { from: 'up', to: 'local', label: 'git fetch upstream' },
          { from: 'local', to: 'fork', label: 'git push origin feature/x' },
          { from: 'fork', to: 'up', label: 'pull request' },
        ],
        caption: 'Fork-and-PR: fetch from upstream, push to your fork, propose the change with a pull request.',
      },
      remember: 'Shared repo: push branches to origin. Fork: push to your fork, fetch from upstream.',
    },
    {
      kind: 'concept',
      id: 'conventional-commits',
      title: 'Conventional Commits: messages a robot can read',
      body:
        "Conventional Commits is a small grammar for the subject line: `type(scope): description`. `feat` adds a capability, `fix` repairs a bug, and `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style` and `revert` cover the rest. The scope in parentheses is optional and names the area: `feat(export): export a note as Markdown`.\n\n" +
        "The point is that tools can read it. `fix` means a patch release (1.1.0 to 1.1.1), `feat` a minor one (1.1.0 to 1.2.0). A breaking change, marked with `!` after the type (`feat(api)!: ...`) or a `BREAKING CHANGE:` footer in the body, means a major one (1.x to 2.0.0).\n\n" +
        "Teams enforce it with commitlint: a `commit-msg` hook (via Husky or lefthook) rejects a bad message on your machine, and the same check runs in CI, because hooks can be skipped with `--no-verify`. When the team squash-merges, the pull request title becomes the commit subject, so the check runs on PR titles instead.\n\n" +
        'Write the description in the imperative, lower case, no period: \"fix(search): ignore case\", not \"Fixed the search.\".',
      diagram: {
        kind: 'code',
        title: 'Subjects and the version they produce (from 1.1.0)',
        text:
          'docs: fix typo in README                 -> no release\n' +
          'fix(search): ignore case                 -> 1.1.1  (patch)\n' +
          'feat(export): export a note as Markdown  -> 1.2.0  (minor)\n' +
          'feat(sync)!: store notes in SQLite       -> 2.0.0  (major)\n' +
          '\n' +
          'refactor(store): drop the JSON backend\n' +
          '\n' +
          'BREAKING CHANGE: notes.json is no longer read.   -> 2.0.0',
      },
      remember: 'feat = minor, fix = patch, ! or BREAKING CHANGE = major.',
    },
    {
      kind: 'concept',
      id: 'release-automation',
      title: 'From commits to releases: semantic-release, release-please, changesets',
      body:
        "A release is a commit plus an annotated tag on it, with a changelog that says what changed. Semantic versioning reads MAJOR.MINOR.PATCH. `git log v1.0.0..HEAD --no-merges --format=\"- %s\"` prints every subject since the last release: that is a changelog draft, and it is what mission 8.4 asks for. Remember that `git push` sends no tags unless you name them or add `--follow-tags`.\n\n" +
        "Tools automate this from Conventional Commits. semantic-release runs in CI on every push to `main`: it computes the next version, tags, writes release notes and publishes, with no human step. release-please instead opens a release pull request that keeps a growing changelog and version bump; merging that PR creates the tag and the GitHub release, so a human chooses when to ship.\n\n" +
        "changesets takes another angle, popular in monorepos: each pull request adds a small `.changeset/*.md` file saying which packages bump and why. The release step collects those files into versions and changelogs, so messages stay free-form.\n\n" +
        'Whatever the tool, the tag is the source of truth: build servers deploy tags, and users report bugs against them.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'commits', label: 'commits on main', detail: 'feat:, fix:, BREAKING CHANGE', row: 0 },
          { id: 'tool', label: 'release tool', detail: 'computes 1.2.0', row: 0 },
          { id: 'tag', label: 'tag v1.2.0', detail: '+ CHANGELOG.md', row: 0 },
          { id: 'rel', label: 'GitHub release', detail: 'notes, assets', row: 1 },
          { id: 'pub', label: 'publish / deploy', detail: 'npm, app store, servers', row: 1 },
        ],
        edges: [
          { from: 'commits', to: 'tool', label: 'read subjects' },
          { from: 'tool', to: 'tag', label: 'bump + changelog' },
          { from: 'tag', to: 'rel' },
          { from: 'rel', to: 'pub', label: 'on: release' },
        ],
        caption: 'Conventional subjects in, version number, tag and changelog out.',
      },
      remember: 'Tags are releases; tools only decide the number and write the notes.',
    },
    {
      kind: 'concept',
      id: 'atomic-and-pr-size',
      title: 'Atomic commits, small pull requests, kind reviews',
      body:
        "An atomic commit holds one idea and leaves the project working. Then `git revert`, `git cherry-pick` and `git bisect` act on exactly one change. If the search fix and a README typo share a commit, reverting the fix also brings the typo back. Stage by path (`git add search.ts`) and, when two ideas share one file, pick hunks with `git add -p`.\n\n" +
        "The same logic scales to pull requests. Review quality drops sharply with size: a 50-line PR gets real comments, a 2,000-line PR gets \"looks good\". Aim for a few hundred lines of real change, split refactors from behaviour changes, and stack dependent PRs rather than piling everything into one.\n\n" +
        "As an author: review your own diff first, say why in the description, link the issue (`Closes #42`), and answer every comment. As a reviewer: review the code, not the person; ask questions instead of giving orders; mark optional points as \"nit:\"; approve when it is good enough, not when it is how you would have written it.\n\n" +
        'During review, push follow-up commits rather than force-pushing a rewritten branch, so reviewers can see what changed since their last look.',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'search.ts', disk: 'ignore case', index: 'ignore case', head: 'case-sensitive' },
          { path: 'README.md', disk: 'typo fixed', index: 'strat (typo)', head: 'strat (typo)' },
        ],
        caption: 'Mission 8.3: stage only search.ts and commit it as fix(search); then commit README.md alone as docs.',
      },
      remember: 'One idea per commit, one purpose per pull request.',
    },
    {
      kind: 'concept',
      id: 'merge-policy',
      title: 'Merge commit, squash or rebase: pick a history policy',
      body:
        "GitHub offers three merge buttons, and teams usually allow one or two. Create a merge commit keeps every commit of the branch and adds a merge commit with two parents. Squash and merge turns the whole branch into a single new commit on `main`. Rebase and merge replays each commit on top of `main` with no merge commit.\n\n" +
        "Squash keeps `main` to one commit per PR, which is easy to revert and makes \"wip\" and \"fix typo\" commits disappear. The cost: the individual steps are gone from `main`, and the squashed commit is new, so `git branch -d feature/x` will say the branch is not fully merged. That is expected; delete it with `-D` once the PR shows merged.\n\n" +
        "Keeping history is worth it when the branch's commits are themselves atomic and well written: bisect can then point at the exact step. Many teams squash by default and keep merge commits for long-lived branches like release merges.\n\n" +
        'Whatever you choose, write it down in CONTRIBUTING.md and enforce it in the repository settings, so the history looks the same no matter who clicks the button.',
      diagram: {
        kind: 'before-after',
        command: 'Squash and merge PR #12 (feature/pin)',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main'] },
            { id: 'B1', message: 'wip: pin', parents: ['A'], lane: 'feature/pin' },
            { id: 'B2', message: 'fix typo', parents: ['B1'], lane: 'feature/pin' },
            { id: 'B3', message: 'add test', parents: ['B2'], lane: 'feature/pin', refs: ['HEAD → feature/pin'] },
          ],
          head: 'B3',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B1', message: 'wip: pin', parents: ['A'], lane: 'feature/pin', ghost: true },
            { id: 'B2', message: 'fix typo', parents: ['B1'], lane: 'feature/pin', ghost: true },
            { id: 'B3', message: 'add test', parents: ['B2'], lane: 'feature/pin', ghost: true, refs: ['feature/pin'] },
            { id: 'S', message: 'feat(pin): pin a note to the top (#12)', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'S',
        },
        caption: 'Squash creates one new commit S on main. The branch commits are not its ancestors, so git branch -d refuses: use -D after the PR is merged.',
      },
      remember: 'Squash for a tidy main; keep commits when each one is worth bisecting.',
    },
    {
      kind: 'concept',
      id: 'ci-cd',
      title: 'CI, continuous delivery, continuous deployment',
      body:
        "Continuous integration (CI) means every push and pull request is built and tested automatically, and people merge into `main` often. The output is a red or green check next to the commit.\n\n" +
        "Continuous delivery adds: every green `main` produces something that could go to production with one click. Continuous deployment removes the click: every green `main` goes to production on its own. Same pipeline, different last step, and the difference is who presses the button.\n\n" +
        "Preview deployments give each pull request its own temporary URL (Vercel, Netlify and Cloudflare Pages do this out of the box), so reviewers can click through the change, not just read it. The preview disappears when the PR closes.\n\n" +
        "Environment promotion moves the same build through stages: build once, deploy that exact artifact to staging, test it, then promote it to production. Rebuilding for each stage would test one thing and ship another. With GitLab-style environment branches the promotion is a merge into the next branch.",
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'pr', label: 'pull request', detail: 'CI: lint + tests', row: 0 },
          { id: 'prev', label: 'preview URL', detail: 'pr-12.nova.dev', row: 1 },
          { id: 'main', label: 'merge to main', detail: 'build artifact once', row: 0 },
          { id: 'stg', label: 'staging', detail: 'same artifact', row: 0 },
          { id: 'prod', label: 'production', detail: 'click (delivery) or auto (deployment)', row: 0 },
        ],
        edges: [
          { from: 'pr', to: 'prev', label: 'deploy preview' },
          { from: 'pr', to: 'main', label: 'review + green' },
          { from: 'main', to: 'stg', label: 'deploy' },
          { from: 'stg', to: 'prod', label: 'promote' },
        ],
        caption: 'Build once, promote the same artifact. Continuous deployment makes the last arrow automatic.',
      },
      remember: 'CI tests every change; delivery makes it shippable; deployment ships it.',
    },
    {
      kind: 'concept',
      id: 'hotfix-rollback',
      title: 'Hotfixes, rollbacks and rolling forward',
      body:
        "Users run a release, not `main`. When 1.1.0 has a bug and `main` already holds unreleased work (Lea's share links), fixing on `main` would ship that work too. So the hotfix starts from the tag: `git switch -c hotfix/1.1.1 v1.1.0`, fix, commit, `git tag -a v1.1.1`, push the tag.\n\n" +
        "Then bring the fix back to `main`, with `git cherry-pick` or by merging the hotfix branch, or 1.2.0 will ship the bug again. That is mission 8.5.\n\n" +
        "For a service, the fastest way out of a bad deploy is usually a rollback: redeploy the previous artifact or tag, with no git change at all. Then fix calmly. In git, `git revert <sha>` (or `git revert -m 1 <merge>` for a merged PR) undoes a change on `main` with a new commit, which is safe on a shared branch, unlike `reset`.\n\n" +
        'Rolling forward means shipping a new fix instead of going back. It is fine when the fix is small and certain. When in doubt, roll back first: users get a working app while you think.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'chore(release): v1.1.0', parents: [], lane: 'main', refs: ['v1.1.0'] },
          { id: 'S', message: 'feat(share): share a note by link', parents: ['A'], lane: 'main' },
          { id: 'H', message: 'fix(search): handle an empty query', parents: ['A'], lane: 'hotfix/1.1.1', refs: ['v1.1.1', 'hotfix/1.1.1'] },
          { id: "H'", message: 'fix(search): handle an empty query', parents: ['S'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
        ],
        head: "H'",
        caption: 'Mission 8.5: v1.1.1 = v1.1.0 + the fix, without share.ts. The same fix is cherry-picked onto main.',
      },
      remember: 'Hotfix from the tag, then bring the fix home to main.',
    },
    {
      kind: 'concept',
      id: 'hygiene',
      title: 'Repo hygiene and onboarding',
      body:
        "A healthy repository explains itself. README.md says what it is and how to run it in three commands. CONTRIBUTING.md holds the workflow you just read about: branch names, commit format, merge policy. CODE_OF_CONDUCT.md, LICENSE, SECURITY.md (how to report a vulnerability), CHANGELOG.md, and `.github/` templates for issues and pull requests complete the set.\n\n" +
        "Style arguments belong to machines. `.editorconfig` tells every editor the indentation, line endings and final newline. Linters and formatters run in a pre-commit hook (Husky with lint-staged, lefthook, or the pre-commit framework) for fast feedback, and again in CI as the real gate, since any hook can be skipped.\n\n" +
        "Branches pile up. Turn on Automatically delete head branches in the repository settings, run `git fetch --prune` (or set `fetch.prune true`) so dead `origin/*` names vanish, and list what is safe to delete with `git branch --merged main`. A repo nobody maintains any more should be archived: it becomes read-only and says so.\n\n" +
        'Onboarding is the test of all this: a new teammate should get from clone to a running app and a first merged pull request on day one. A dev container or a `make setup` script, and a few issues labelled good first issue, make that possible.',
      diagram: {
        kind: 'code',
        title: 'A tidy repository root',
        text:
          '.editorconfig            indent, line endings, final newline\n' +
          '.gitattributes           * text=auto eol=lf\n' +
          '.gitignore               node_modules/, .env, dist/\n' +
          '.github/\n' +
          '  CODEOWNERS             who reviews which paths\n' +
          '  PULL_REQUEST_TEMPLATE.md\n' +
          '  ISSUE_TEMPLATE/bug.yml\n' +
          '  workflows/ci.yml       lint + tests on every PR\n' +
          'CHANGELOG.md   CODE_OF_CONDUCT.md   CONTRIBUTING.md\n' +
          'LICENSE        README.md            SECURITY.md',
      },
      remember: 'Write the rules down, let tools enforce them, prune what is dead.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Commands for team workflows',
      rows: [
        { command: 'git switch -c feature/pin', does: 'Start a short-lived branch for one change (GitHub Flow).' },
        { command: 'git push -u origin feature/pin', does: 'Publish the branch and set its upstream; this is where a pull request opens.' },
        { command: 'git merge --no-ff --no-edit feature/pin', does: 'Merge with a merge commit even when a fast-forward is possible.' },
        { command: 'git branch -d feature/pin', does: 'Delete a merged local branch (refuses if it is not merged).' },
        { command: 'git branch -D feature/pin', does: 'Force-delete a branch, e.g. after a squash merge. Unmerged commits are only in the reflog afterwards.', danger: true },
        { command: 'git push origin --delete feature/pin', does: 'Delete the branch on origin.', danger: true },
        { command: 'git commit -m "feat(export): export a note as Markdown"', does: 'A Conventional Commits subject: type(scope): description.' },
        { command: 'git add search.ts  /  git add -p', does: 'Stage one file, or choose hunk by hunk, to keep commits atomic.' },
        { command: 'git log v1.0.0..HEAD --no-merges --format="- %s"', does: 'List every change since the last release: a changelog draft.' },
        { command: 'git tag -a v1.1.0 -m "Nova 1.1.0"', does: 'Create an annotated release tag on the current commit.' },
        { command: 'git push origin v1.1.0  /  git push --follow-tags', does: 'Send a tag; plain git push never sends tags.' },
        { command: 'git switch -c hotfix/1.1.1 v1.1.0', does: 'Start a hotfix from the release users run, not from main.' },
        { command: 'git cherry-pick -x <sha>', does: 'Copy a fix to another branch (backport) and record where it came from.' },
        { command: 'git revert -m 1 <merge-sha>', does: 'Undo a merged pull request on a shared branch with a new commit.' },
        { command: 'git branch --merged main  /  git fetch --prune', does: 'Find local branches safe to delete; drop origin/* names deleted on the server.' },
        { command: 'git log --first-parent --oneline main', does: 'Read main as one line per merged feature.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Team workflow mistakes and the way out',
      items: [
        {
          mistake: 'Starting a hotfix from main, which already holds unreleased work.',
          fix: 'Branch from the release tag: git switch -c hotfix/x.y.z vX.Y.Z. If you already committed on main, cherry-pick the fix onto a branch made from the tag.',
        },
        {
          mistake: 'Shipping the hotfix but forgetting main, so the next release brings the bug back.',
          fix: 'Fix upstream first when you can; otherwise cherry-pick or merge the hotfix into main right after tagging.',
        },
        {
          mistake: 'Tagging a release and assuming it reached origin.',
          fix: 'git push origin <tag> or git push --follow-tags. Check with git ls-remote --tags origin.',
        },
        {
          mistake: 'One commit mixing a bug fix and an unrelated edit, so it cannot be reverted alone.',
          fix: 'Before pushing: git reset HEAD~1 (keeps the changes), then stage and commit each idea separately.',
        },
        {
          mistake: 'A commit subject like "Fixed stuff" fails commitlint or confuses the release tool.',
          fix: 'git commit --amend -m "fix(search): ignore case" before pushing. With squash merges, fix the PR title instead.',
        },
        {
          mistake: 'git branch -d says a squash-merged branch is not fully merged.',
          fix: 'Expected: squash made a new commit. Confirm the PR is merged, then git branch -D.',
        },
        {
          mistake: 'Hundreds of stale branches locally and on origin.',
          fix: 'git fetch --prune, git branch --merged main for local cleanup, and the Automatically delete head branches setting.',
        },
        {
          mistake: 'A long-lived feature branch that now conflicts with everything.',
          fix: 'Merge or rebase main into it often, split it into smaller PRs, and hide unfinished parts behind a feature flag.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-hotfix-base',
      question:
        "Users on 1.1.0 hit a search bug. main already contains Lea's unreleased share feature. Where should the hotfix branch start?",
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'chore(release): v1.1.0', parents: [], lane: 'main', refs: ['v1.1.0'] },
          { id: 'S', message: 'feat(share): share a note by link', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'S',
      },
      options: [
        { id: 'a', text: 'At main (S), so the fix includes the newest code.' },
        { id: 'b', text: 'At v1.1.0 (A), then tag v1.1.1 and bring the fix back to main.' },
        { id: 'c', text: 'Commit the fix directly on main and tag that commit v1.1.1.' },
        { id: 'd', text: 'At the first commit of the repository, to be safe.' },
      ],
      correct: 'b',
      explanation:
        'A patch release must be the release plus the fix and nothing else. Starting at main would ship the unreleased share feature inside 1.1.1. Afterwards the fix still has to reach main, by cherry-pick or merge, or 1.2.0 regresses.',
    },
    {
      id: 'q-version-bump',
      question: 'Since v2.3.1 the commits are "fix(sync): retry on timeout", "feat(tags): colour tags" and "docs: update README". With Conventional Commits, what is the next version?',
      options: [
        { id: 'a', text: '2.3.2' },
        { id: 'b', text: '2.4.0' },
        { id: 'c', text: '3.0.0' },
        { id: 'd', text: '2.3.1, because docs changes do not count' },
      ],
      correct: 'b',
      explanation:
        'The highest bump wins: feat means a minor release, so 2.3.1 becomes 2.4.0 and the patch resets to 0. Only a ! after the type or a BREAKING CHANGE: footer would make it 3.0.0.',
    },
    {
      id: 'q-tag-push',
      question: 'You ran git tag -a v1.1.0 -m "Nova 1.1.0" and then git push. The build server, which deploys tags found on origin, does nothing. Why?',
      options: [
        { id: 'a', text: 'Annotated tags cannot be pushed; only lightweight ones can.' },
        { id: 'b', text: 'git push sends branches, not tags. Push it with git push origin v1.1.0 or --follow-tags.' },
        { id: 'c', text: 'The tag must be on a merge commit to be deployable.' },
        { id: 'd', text: 'The server needs a CHANGELOG.md in the same commit to see the tag.' },
      ],
      correct: 'b',
      explanation:
        'A plain git push updates the current branch only. Tags travel when you name them, or with --follow-tags, which pushes annotated tags that point into the commits being pushed.',
    },
    {
      id: 'q-atomic',
      question: 'QA finds that the case-insensitive search breaks accented names, and Yanis wants to revert just that fix. Why does it matter that it was committed separately from the README typo fix?',
      options: [
        { id: 'a', text: 'git revert only works on commits that change a single file.' },
        { id: 'b', text: 'Reverting a mixed commit would also bring the README typo back; a separate commit reverts exactly one idea.' },
        { id: 'c', text: 'It does not matter; git revert can undo one file of a commit by default.' },
        { id: 'd', text: 'Separate commits are needed so the changelog has more lines.' },
      ],
      correct: 'b',
      explanation:
        'revert, cherry-pick and bisect all work on whole commits. With one idea per commit they act on exactly that idea. git revert has no option to undo only one file of a commit.',
    },
    {
      id: 'q-squash-delete',
      question: 'Your PR from feature/pin was squash-merged on GitHub. You pull main and run git branch -d feature/pin. What happens?',
      options: [
        { id: 'a', text: 'The branch is deleted, because its changes are in main.' },
        { id: 'b', text: 'git refuses: the squash commit is new, so the branch commits are not ancestors of main. Use -D once you have checked the PR is merged.' },
        { id: 'c', text: 'git deletes the branch and also removes the squash commit from main.' },
        { id: 'd', text: 'git asks GitHub whether the PR was merged and decides from that.' },
      ],
      correct: 'b',
      explanation:
        'git branch -d checks ancestry, not content. A squash merge creates one new commit, so the original commits never become part of main. -D is safe here because the content is in main already.',
    },
    {
      id: 'q-backport',
      question: 'You maintain release/1.x and main. A security fix is needed in both. What does upstream first mean?',
      options: [
        { id: 'a', text: 'Fix it on release/1.x first, because users run it, then merge release/1.x into main.' },
        { id: 'b', text: 'Fix it on main, then git cherry-pick -x the fix commit onto release/1.x.' },
        { id: 'c', text: 'Push the fix to the upstream remote of a fork.' },
        { id: 'd', text: 'Merge main into release/1.x so it gets the fix.' },
      ],
      correct: 'b',
      explanation:
        'Fixing main first guarantees no future version misses the fix. Merging main into release/1.x would drag every new feature into the stable branch, and merging release/1.x into main brings old release-only changes along.',
    },
    {
      id: 'q-delivery',
      question: 'Every merge to main builds, tests and deploys to staging automatically. Production gets the same build when a person clicks Promote. Which practice is this?',
      options: [
        { id: 'a', text: 'Continuous integration only' },
        { id: 'b', text: 'Continuous delivery' },
        { id: 'c', text: 'Continuous deployment' },
        { id: 'd', text: 'Git Flow' },
      ],
      correct: 'b',
      explanation:
        'Every change is ready to ship and shipping is one deliberate click: continuous delivery. Continuous deployment would send each green main to production with no click. CI is only the build-and-test part.',
    },
    {
      id: 'q-flag',
      question: 'The team practises trunk-based development. Share links are half done but must be merged today. What keeps users from seeing them?',
      options: [
        { id: 'a', text: 'Keep the work on a branch until it is finished, even if that takes weeks.' },
        { id: 'b', text: 'Merge it behind a feature flag that is off, and turn the flag on when it is ready.' },
        { id: 'c', text: 'Merge it and revert it right away.' },
        { id: 'd', text: 'Push it to a develop branch.' },
      ],
      correct: 'b',
      explanation:
        'Trunk-based development merges small pieces daily and separates deploy from release with flags. A long-lived branch is exactly what it avoids, and a develop branch belongs to Git Flow.',
    },
  ],
  theoryOnly: [
    'Trunk-based development',
    'Git Flow (develop, release and hotfix branches)',
    'GitLab Flow and environment branches',
    'Release branches and backports (cherry-pick -x)',
    'Fork-and-PR vs shared repository',
    'semantic-release, release-please and changesets',
    'commitlint and commit-msg hooks',
    'PR size and review etiquette',
    'Squash vs merge commit vs rebase merge policy',
    'CI vs continuous delivery vs continuous deployment',
    'Preview deployments',
    'Feature flags',
    'Rollback and roll forward',
    'Environment promotion',
    'README, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, LICENSE',
    'EditorConfig, linters in pre-commit and CI',
    'Stale branch cleanup',
    'Archiving repositories and onboarding',
  ],
};

/**
 * Lesson 10 — GitHub Actions and automation: workflow anatomy, triggers, security, pipelines, runners, failed runs,
 * Dependabot, CODEOWNERS and release automation. Prepares level 10 (src/game/levels/level10.ts), whose missions grow
 * .github/workflows/ci.yml step by step.
 */
import type { Lesson } from '../lesson-model';

export const lesson10: Lesson = {
  levelId: 'actions',
  title: 'GitHub Actions and automation',
  summary:
    'How a workflow file turns a push into a tested, checked and possibly deployed commit: events, jobs and steps, secrets and tokens, matrices and caches, ordered pipelines, runners, failed runs, and the robots that keep a repository current.',
  slides: [
    {
      kind: 'concept',
      id: 'anatomy',
      title: 'Anatomy of a workflow',
      body:
        "A workflow is a YAML file in `.github/workflows/`. `on:` says which events start it. `jobs:` lists what to do: each job gets a fresh virtual machine, named by `runs-on:`, and runs its `steps:` top to bottom on that machine.\n\n" +
        "A step either runs a shell command (`run: npm test`) or uses an action (`uses: actions/checkout@v4`), which is reusable code someone published, configured with `with:`. Steps of one job share the machine and its files. Different jobs run in parallel on different machines and share nothing unless you pass it explicitly.\n\n" +
        "The machine starts empty. `actions/checkout` fetches the commit being tested, `actions/setup-node` installs Node, `npm ci` installs exactly what package-lock.json says. Then `npm test` runs. Any step that exits non-zero fails the job, and the job's result becomes a red or green check on the commit and its pull request.\n\n" +
        'YAML is indentation: two spaces per level, never tabs. A wrong indent silently moves a key to another level. Mission 10.1 writes exactly this file.',
      diagram: {
        kind: 'code',
        title: '.github/workflows/ci.yml (mission 10.1)',
        text:
          'name: CI\n' +
          'on: [push, pull_request]          # when\n' +
          'jobs:\n' +
          '  test:                            # job id, shown as the check name\n' +
          '    runs-on: ubuntu-latest         # fresh VM for this job\n' +
          '    steps:                         # run in order, same machine\n' +
          '      - uses: actions/checkout@v4\n' +
          '      - uses: actions/setup-node@v4\n' +
          '        with:\n' +
          '          node-version: 20\n' +
          '      - run: npm ci\n' +
          '      - run: npm test',
      },
      remember: 'on: when, jobs: what, steps: how.',
    },
    {
      kind: 'concept',
      id: 'run-flow',
      title: 'From git push to a green check',
      body:
        "Nothing runs on your laptop. You push; GitHub records an event (`push`, `pull_request`, and so on); it reads the workflow files from the commit the event points at and starts every workflow whose `on:` matches. That means a workflow change takes effect in the same push that contains it, and a workflow that exists only on your machine does nothing.\n\n" +
        "For a `pull_request` event, GitHub tests a temporary merge of the PR branch into its base (`refs/pull/42/merge`), not the branch alone. So CI answers the question that matters: will `main` still work after this merge?\n\n" +
        "Each job is queued, picked up by a runner, and streams its log to the run page. When it ends, its result is published as a check. Branch protection can then require named checks to be green before the merge button unlocks.\n\n" +
        '`schedule` and `workflow_dispatch` are different: they have no pushed commit, so they use the workflow file on the default branch (or the ref you choose when dispatching).',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'push', label: 'git push', detail: 'or open / update a PR', row: 0 },
          { id: 'event', label: 'event', detail: 'push, pull_request, ...', row: 0 },
          { id: 'wf', label: 'matching workflows', detail: 'read from that commit', row: 0 },
          { id: 'runner', label: 'runner VM per job', detail: 'steps + live log', row: 1 },
          { id: 'check', label: 'check on commit / PR', detail: 'green or red', row: 1 },
          { id: 'merge', label: 'merge button', detail: 'required checks gate it', row: 1 },
        ],
        edges: [
          { from: 'push', to: 'event' },
          { from: 'event', to: 'wf', label: 'on: matches' },
          { from: 'wf', to: 'runner', label: 'queue jobs' },
          { from: 'runner', to: 'check', label: 'exit codes' },
          { from: 'check', to: 'merge' },
        ],
        caption: 'A run is triggered by an event, uses the YAML in that commit, and ends as checks.',
      },
      remember: 'GitHub runs the workflow from the commit that triggered it; pull requests test the merge result.',
    },
    {
      kind: 'concept',
      id: 'triggers',
      title: 'Triggers: choosing when a workflow runs',
      body:
        "`push` and `pull_request` take filters. `branches: [main]` on `pull_request` means PRs that target main. `paths:` and `paths-ignore:` skip the run when only matching files changed, such as `docs/**`. Pushing a tag can trigger too: `push: tags: ['v*']`.\n\n" +
        "`workflow_dispatch:` adds a Run workflow button on the Actions tab, optionally with `inputs:` (a choice of environment, a version string); `gh workflow run ci.yml -f env=staging` presses it from the terminal. `schedule:` takes cron lines in UTC (minute hour day month weekday). Scheduled runs can start late at busy times, and GitHub disables them in public repos after 60 days without activity.\n\n" +
        "Many repository events can start workflows: `release` (types: published) to build and upload release files, `issues` (types: opened) to label new issues, `issue_comment` to react to a command such as `@claude` in a comment, `workflow_run` to chain one workflow after another.\n\n" +
        "Be careful with `pull_request_target`: it runs with the base repository's secrets and a write token even for PRs from forks. Never check out and run the PR's code in it.",
      diagram: {
        kind: 'code',
        title: 'on: after mission 10.5, plus other events',
        text:
          'on:\n' +
          '  push:\n' +
          '    branches: [main]\n' +
          '  pull_request:\n' +
          '    branches: [main]\n' +
          '    paths-ignore:\n' +
          "      - 'docs/**'\n" +
          '  workflow_dispatch:            # Run workflow button\n' +
          '  schedule:\n' +
          "    - cron: '0 3 * * *'         # 03:00 UTC every day\n" +
          '\n' +
          '# other workflows might use:\n' +
          '#   release:  { types: [published] }\n' +
          '#   issues:   { types: [opened] }\n' +
          "#   push:     { tags: ['v*'] }",
      },
      remember: 'Filter events so CI runs when it matters, and only then.',
    },
    {
      kind: 'concept',
      id: 'pinning-token',
      title: 'Pinning actions and the GITHUB_TOKEN',
      body:
        "`uses:` runs someone else's code inside your job, with your secrets and your token in reach. `@main` means whatever they push next. A tag like `@v4` is convenient, but a tag can be moved to different code. A full 40-character commit SHA cannot: it names exactly one version, forever. Pin third-party actions to a SHA (with the version in a comment), and let Dependabot propose bumps. Mission 10.2 does this.\n\n" +
        "Every job also receives a `GITHUB_TOKEN`: a token GitHub creates for the run, limited to this repository and revoked when the job ends. Its default rights come from the repository settings (read-only for new repositories). Set them explicitly with `permissions:` at the top of the workflow or on one job; anything you do not list becomes `none`.\n\n" +
        "Start with `contents: read` and add only what a job needs: `pull-requests: write` to comment on a PR, `contents: write` to push a tag, `id-token: write` for cloud logins. The error \"Resource not accessible by integration\" means a permission is missing.\n\n" +
        'One safety rule to remember: events caused by the GITHUB_TOKEN (a push, a release, a new PR) do not start other workflows, apart from workflow_dispatch and repository_dispatch. That prevents infinite loops, and it surprises everyone once.',
      diagram: {
        kind: 'code',
        title: 'Least privilege, pinned (mission 10.2)',
        text:
          'permissions:\n' +
          '  contents: read                  # everything else: none\n' +
          '\n' +
          'jobs:\n' +
          '  lint:\n' +
          '    runs-on: ubuntu-latest\n' +
          '    steps:\n' +
          '      - uses: actions/checkout@v4                     # GitHub\'s own: tag ok\n' +
          '      - uses: octo-lint/annotate@3f1c2b9e8d7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e  # v2.1.0\n' +
          '        with:\n' +
          '          command: npm run lint',
      },
      remember: '@sha for third-party actions, permissions: contents: read by default.',
    },
    {
      kind: 'concept',
      id: 'secrets-oidc',
      title: 'Secrets, variables and OIDC',
      body:
        "Credentials never go in the YAML. Store them as secrets (Settings, Secrets and variables, Actions, or `gh secret set DEPLOY_TOKEN`) and hand them to the one step that needs them through `env:`. GitHub masks secret values in logs. Non-secret settings, such as a region or a URL, go in variables: `vars.DEPLOY_REGION`, set with `gh variable set`. Both can be defined per repository, per organization or per environment.\n\n" +
        "Workflows started by a pull request from a fork get no secrets and a read-only token, so a stranger cannot print your keys. A token that was ever committed is leaked, even if the next commit deletes it: revoke and rotate it first (mission 10.3).\n\n" +
        "Better still is no stored cloud key at all. With OIDC, the job asks GitHub for a short-lived signed identity token (`permissions: id-token: write`) that says \"repo nova/notes, branch main, environment production\". AWS, Google Cloud and Azure can be configured to trust exactly that claim and return credentials that expire within the hour.\n\n" +
        'Nothing long-lived is stored, nothing useful can leak, and the cloud side decides which repo and branch may deploy.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'job', label: 'deploy job', detail: 'id-token: write', row: 0 },
          { id: 'gh', label: 'GitHub OIDC provider', detail: 'signs: repo, ref, environment', row: 0 },
          { id: 'cloud', label: 'cloud IAM', detail: 'trusts nova/notes on main', row: 1 },
          { id: 'creds', label: 'short-lived credentials', detail: 'expire in about 1 hour', row: 1 },
        ],
        edges: [
          { from: 'job', to: 'gh', label: 'request token' },
          { from: 'gh', to: 'job', label: 'signed JWT' },
          { from: 'job', to: 'cloud', label: 'exchange JWT' },
          { from: 'cloud', to: 'creds' },
        ],
        caption: 'OIDC replaces stored cloud keys with a token that proves which repo and branch is asking.',
      },
      remember: 'Committed once means leaked: rotate, then use secrets, or better, OIDC.',
    },
    {
      kind: 'concept',
      id: 'matrix-cache-artifacts',
      title: 'Matrix, caching and artifacts',
      body:
        "`strategy: matrix:` turns one job into several. `node: [20, 22]` produces `test (20)` and `test (22)`, which run in parallel and read their value as `${{ matrix.node }}`. Two lists multiply: two Node versions times two operating systems is four jobs. `include:` and `exclude:` add or remove combinations. By default `fail-fast` cancels the siblings when one fails.\n\n" +
        "A cache makes the next run faster. `actions/setup-node` with `cache: npm` saves npm's download cache under a key built from the hash of package-lock.json and restores it next time; when the lockfile changes, the key changes. `actions/cache` does the same for any folder with your own key. Caches are disposable: unused ones are evicted after about a week, and nothing may depend on them.\n\n" +
        "An artifact is an output you want to keep: a build, a coverage report, a screenshot of a failing test. `actions/upload-artifact` attaches files to the run (kept for 90 days by default, downloadable from the run page or with `gh run download`), and `actions/download-artifact` hands them to a later job, which is how jobs share files.\n\n" +
        'Cache for speed, artifact for results.',
      diagram: {
        kind: 'code',
        title: 'Matrix + cache (mission 10.4) + an artifact',
        text:
          '  test:\n' +
          '    runs-on: ubuntu-latest\n' +
          '    strategy:\n' +
          '      matrix:\n' +
          '        node: [20, 22]              # -> test (20), test (22)\n' +
          '    steps:\n' +
          '      - uses: actions/checkout@v4\n' +
          '      - uses: actions/setup-node@v4\n' +
          '        with:\n' +
          '          node-version: ${{ matrix.node }}\n' +
          '          cache: npm                # keyed on package-lock.json\n' +
          '      - run: npm ci\n' +
          '      - run: npm test\n' +
          '      - uses: actions/upload-artifact@v4\n' +
          '        with:\n' +
          '          name: coverage-${{ matrix.node }}\n' +
          '          path: coverage/',
      },
      remember: 'Matrix for versions, cache for speed, artifacts for results.',
    },
    {
      kind: 'concept',
      id: 'pipeline',
      title: 'Pipelines: needs, if and concurrency',
      body:
        "Jobs run in parallel unless told otherwise. `needs: lint` makes `test` wait for `lint`, and if `lint` fails, `test` is skipped. Chain them and you get a pipeline: lint, then test, then deploy. Deploy can never ship code whose tests failed. A job can pass values forward through `outputs:`, read as `needs.<job>.outputs.<name>`.\n\n" +
        "`if:` decides whether a job or step runs at all, before it starts. `if: github.ref == 'refs/heads/main'` keeps pull requests and other branches from deploying. Status functions change the default: `if: failure()` runs only after a failure (send an alert), `if: always()` runs no matter what (upload logs).\n\n" +
        "`concurrency:` stops runs from piling up. Runs that share a group wait for each other, and `cancel-in-progress: true` cancels the older one. Putting `${{ github.ref }}` in the group name keeps branches apart, so a new push to your PR cancels the stale run for the previous push but leaves `main` alone. For deploys, leave `cancel-in-progress` off so a deploy is never killed halfway.\n\n" +
        'Mission 10.6 builds exactly this graph.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'lint', label: 'lint', detail: 'npm run lint', row: 0 },
          { id: 't20', label: 'test (20)', detail: 'needs: lint', row: 0 },
          { id: 't22', label: 'test (22)', detail: 'needs: lint', row: 1 },
          { id: 'deploy', label: 'deploy', detail: "needs: test, if: ref is main", row: 0 },
        ],
        edges: [
          { from: 'lint', to: 't20' },
          { from: 'lint', to: 't22' },
          { from: 't20', to: 'deploy' },
          { from: 't22', to: 'deploy' },
        ],
        caption: 'needs: orders jobs; deploy waits for every matrix leg and runs only on main.',
      },
      remember: 'concurrency to cancel, needs to order, if to skip.',
    },
    {
      kind: 'concept',
      id: 'environments-reuse',
      title: 'Environments, reusable workflows and composite actions',
      body:
        "`environment: production` on a deploy job ties it to a named environment with its own secrets and rules. Required reviewers pause the job until a listed person approves it, a wait timer delays it, and deployment branch rules allow only `main` (or tags) to deploy there. The repository page then shows a deployment history per environment.\n\n" +
        "Copy-pasting the same YAML into twenty repositories means fixing it twenty times. A reusable workflow is a workflow with `on: workflow_call`, accepting `inputs:` and `secrets:`. Another workflow calls it as a whole job: `uses: nova/ci/.github/workflows/deploy.yml@v1`, optionally with `secrets: inherit`.\n\n" +
        "A composite action is smaller: an `action.yml` with `runs: using: composite` that bundles several steps (setup Node, restore the cache, install) into one step that any job can `uses:`.\n\n" +
        'Rule of thumb: share steps with a composite action, share whole jobs (runner, environment, permissions included) with a reusable workflow.',
      diagram: {
        kind: 'code',
        title: 'Calling a reusable deploy workflow with an approval gate',
        text:
          'jobs:\n' +
          '  deploy:\n' +
          '    needs: test\n' +
          '    uses: nova/ci/.github/workflows/deploy.yml@v1\n' +
          '    with:\n' +
          '      environment: production   # reviewers must approve\n' +
          '    secrets: inherit\n' +
          '\n' +
          '# nova/ci/.github/workflows/deploy.yml\n' +
          'on:\n' +
          '  workflow_call:\n' +
          '    inputs:\n' +
          '      environment: { type: string, required: true }\n' +
          'jobs:\n' +
          '  deploy:\n' +
          '    runs-on: ubuntu-latest\n' +
          '    environment: ${{ inputs.environment }}\n' +
          '    steps:\n' +
          '      - run: ./scripts/deploy.sh',
      },
      remember: 'Environments gate deploys; reusable workflows share jobs; composite actions share steps.',
    },
    {
      kind: 'concept',
      id: 'runners',
      title: 'Runners and what they cost',
      body:
        "GitHub-hosted runners are fresh virtual machines that GitHub starts for each job and throws away afterwards: `ubuntu-latest`, `windows-latest`, `macos-latest`, plus larger paid sizes with more cores or GPUs. Nothing survives between jobs except what you cache or upload.\n\n" +
        "On public repositories the standard hosted runners are free. On private repositories each plan includes a monthly allowance of minutes (2,000 on GitHub Free) and storage; beyond it you pay per minute, and Windows and especially macOS minutes cost more than Linux ones. A forgotten `schedule` or a job stuck until the 6-hour default timeout eats the allowance, so set `timeout-minutes:` on long jobs.\n\n" +
        "Self-hosted runners are machines you register yourself (`runs-on: [self-hosted, linux]`): useful for special hardware, private networks or big caches. You patch, secure and pay for the machine, and GitHub's own pricing for them has changed over time, so check the current billing page.\n\n" +
        'Never attach a persistent self-hosted runner to a public repository: a pull request from anyone could run code on your machine.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'job', label: 'job', detail: 'runs-on: ...', row: 0 },
          { id: 'hosted', label: 'GitHub-hosted', detail: 'fresh VM, free on public repos', row: 0 },
          { id: 'self', label: 'self-hosted', detail: 'your machine, your upkeep', row: 1 },
        ],
        edges: [
          { from: 'job', to: 'hosted', label: 'ubuntu-latest' },
          { from: 'job', to: 'self', label: '[self-hosted, linux]' },
        ],
        caption: 'runs-on picks the machine. Minutes on private repos come out of a monthly allowance.',
      },
      remember: 'Hosted: fresh and simple. Self-hosted: powerful, and your responsibility.',
    },
    {
      kind: 'concept',
      id: 'failed-runs',
      title: 'Required checks and reading a failed run',
      body:
        "A required status check (branch protection or ruleset) names jobs that must pass before a PR can merge, such as `lint` and `test (20)`. A job skipped by its `if:` counts as passing. A workflow that never started (because `paths-ignore` filtered it out) reports nothing, and the PR waits forever on \"Expected\". Pick filters with protection in mind.\n\n" +
        "When a run goes red, read it from the terminal. `gh run list` shows recent runs, `gh run view <id>` the jobs and which step failed, and `gh run view <id> --log-failed` prints only the logs of the failed steps. Read the first real failure, compare expected and actual, then `git log -p` or `git show` on the suspect commit.\n\n" +
        "Fix the code, not the test, unless the test is truly wrong. Reproduce locally with the same commands the workflow runs (`npm ci && npm test`). Mission 10.8 gives you such a log.\n\n" +
        'If the failure is flaky (a network timeout, a race), `gh run rerun <id> --failed` retries only the failed jobs, and `--debug` turns on verbose logs. A test that fails one run in ten is a bug to fix, not a reason to click rerun forever.',
      diagram: {
        kind: 'code',
        title: 'Terminal: what broke on main?',
        text:
          '$ gh run list --branch main --limit 3\n' +
          'X  fix(notes): accept tags   CI  main  push  1234  41s\n' +
          '$ gh run view 1234 --log-failed\n' +
          'test (20)  Run npm test  not ok 1 - title is trimmed\n' +
          "test (20)  Run npm test    + '  Groceries '\n" +
          "test (20)  Run npm test    - 'Groceries'\n" +
          '$ git show HEAD -- src/notes.js       # the title lost its .trim()\n' +
          '$ gh run rerun 1234 --failed          # only for flaky failures',
      },
      remember: 'gh run view --log-failed, find the first failure, fix the code.',
    },
    {
      kind: 'concept',
      id: 'dependabot-codeowners',
      title: 'Dependabot and CODEOWNERS',
      body:
        "Dependabot reads `.github/dependabot.yml` and, on the schedule you set, opens a pull request for each outdated dependency of each listed `package-ecosystem`: npm, pip, docker, and `github-actions`, which bumps your `uses:` lines, SHA pins included. Your CI tests each bump like any other PR. `groups:` bundles related updates into one PR, and `open-pull-requests-limit` caps the noise.\n\n" +
        "Security updates are separate: when GitHub learns of a vulnerability in a dependency you use, it raises an alert and (if enabled in settings) opens a fix PR right away, whatever the schedule. Workflows triggered by Dependabot get a read-only token and only Dependabot secrets.\n\n" +
        "CODEOWNERS maps path patterns to people or teams. GitHub requests their review on every PR that touches those paths, and the last matching line wins, so put general rules first and specific ones after. With \"Require review from Code Owners\" in branch protection, their approval becomes mandatory.\n\n" +
        'Mission 10.7 adds both files: weekly updates for npm and actions, and src/sync/ owned by @nova/sync.',
      diagram: {
        kind: 'code',
        title: '.github/dependabot.yml and .github/CODEOWNERS',
        text:
          'version: 2\n' +
          'updates:\n' +
          '  - package-ecosystem: npm\n' +
          '    directory: /\n' +
          '    schedule:\n' +
          '      interval: weekly\n' +
          '  - package-ecosystem: github-actions\n' +
          '    directory: /\n' +
          '    schedule:\n' +
          '      interval: weekly\n' +
          '\n' +
          '# CODEOWNERS: the last matching line wins\n' +
          '*            @nova/core\n' +
          'src/sync/    @nova/sync',
      },
      remember: 'Dependabot keeps you current, CODEOWNERS routes reviews.',
    },
    {
      kind: 'concept',
      id: 'release-automation',
      title: 'Release automation',
      body:
        "With Conventional Commits on `main`, a release can build itself. A common setup uses release-please: on every push to `main` it updates a release pull request with the next version and changelog. Merging that PR creates the tag and the GitHub release. A second workflow, `on: release: types: [published]`, then builds the app, uploads the files to the release and publishes the package.\n\n" +
        "The trap: a release created with the default `GITHUB_TOKEN` does not trigger other workflows, so the publish workflow never runs. Either publish in the same workflow, right after the release step, or create the release with a GitHub App token.\n\n" +
        "Publishing is the moment to drop long-lived secrets. npm and PyPI support trusted publishing over OIDC: the registry trusts your repository's workflow, so no publish token is stored anywhere, and the package gets provenance that shows which commit and workflow built it.\n\n" +
        'Tags stay the source of truth. `on: push: tags: [\'v*\']` is the simpler alternative: push a tag by hand (as in level 8) and the workflow does the rest.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'main', label: 'push to main', detail: 'feat:, fix: commits', row: 0 },
          { id: 'rp', label: 'release PR', detail: 'version + CHANGELOG', row: 0 },
          { id: 'tag', label: 'tag + GitHub release', detail: 'v1.2.0', row: 0 },
          { id: 'build', label: 'build + upload assets', detail: 'on: release published', row: 1 },
          { id: 'pub', label: 'publish', detail: 'npm via OIDC, provenance', row: 1 },
        ],
        edges: [
          { from: 'main', to: 'rp', label: 'release-please updates' },
          { from: 'rp', to: 'tag', label: 'merge' },
          { from: 'tag', to: 'build', label: 'needs an App token, not GITHUB_TOKEN' },
          { from: 'build', to: 'pub' },
        ],
        caption: 'Merging the release PR is the human decision; everything after it is automatic.',
      },
      remember: 'Merge the release PR, let workflows tag, build and publish.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Workflow keys and commands',
      rows: [
        { command: 'on: [push, pull_request]', does: 'Run on every push and every pull request update.' },
        { command: "on: pull_request: branches: [main] / paths-ignore: ['docs/**']", does: 'Only PRs into main, and not when only docs changed.' },
        { command: "on: workflow_dispatch / schedule: - cron: '0 3 * * *'", does: 'Add a manual Run button / run nightly at 03:00 UTC.' },
        { command: 'runs-on: ubuntu-latest', does: 'The machine each job gets.' },
        { command: 'uses: owner/action@<40-char sha>', does: 'Pin an action to one immutable version.' },
        { command: 'permissions: contents: read', does: 'Limit the GITHUB_TOKEN; add rights per job only when needed.' },
        { command: 'env: DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}', does: 'Pass a secret to one step without writing it in the file.' },
        { command: 'strategy: matrix: node: [20, 22]', does: 'One job per value, in parallel.' },
        { command: 'with: cache: npm', does: 'Cache npm downloads in actions/setup-node, keyed on the lockfile.' },
        { command: 'needs: test / if: github.ref == \'refs/heads/main\'', does: 'Wait for a job / run only on main.' },
        { command: 'concurrency: group: ci-${{ github.ref }} + cancel-in-progress: true', does: 'Cancel stale runs of the same branch.' },
        { command: 'gh secret set DEPLOY_TOKEN  /  gh variable set REGION', does: 'Store a secret or a plain variable for Actions.' },
        { command: 'gh workflow run ci.yml -f env=staging', does: 'Trigger a workflow_dispatch workflow from the terminal.' },
        { command: 'gh run list  /  gh run view <id> --log-failed', does: 'List runs; print only the failed steps\' logs.' },
        { command: 'gh run watch <id>  /  gh run rerun <id> --failed', does: 'Follow a run live; retry only its failed jobs.' },
        { command: 'gh run download <id>', does: 'Download a run\'s artifacts.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Workflow mistakes and the way out',
      items: [
        {
          mistake: 'The workflow never runs.',
          fix: 'The file must be committed and pushed under .github/workflows/, with a valid on: key and spaces, not tabs. schedule and workflow_dispatch only use the file on the default branch.',
        },
        {
          mistake: 'npm ci fails with "no package.json" or a lockfile mismatch.',
          fix: 'Add actions/checkout as the first step. For a mismatch, run npm install locally and commit the updated package-lock.json.',
        },
        {
          mistake: 'A secret is empty in a PR run.',
          fix: 'PRs from forks and from Dependabot do not get your Actions secrets. Run secret-needing jobs only on push to main, or store the value as a Dependabot secret.',
        },
        {
          mistake: 'A docs-only PR waits forever on a required check.',
          fix: 'paths-ignore stopped the workflow, so the check never reports. Let the workflow run and skip jobs with if:, which counts as passing.',
        },
        {
          mistake: '"Resource not accessible by integration" when a job comments or pushes.',
          fix: 'The GITHUB_TOKEN lacks a permission. Add it on that job only, e.g. permissions: pull-requests: write.',
        },
        {
          mistake: 'A release created by a workflow did not trigger the publish workflow.',
          fix: 'Events made with GITHUB_TOKEN start no new runs. Publish in the same workflow, or create the release with a GitHub App token.',
        },
        {
          mistake: 'Pushing a workflow file is refused: "refusing to allow an OAuth App to create or update workflow".',
          fix: 'Your token lacks the workflow scope: gh auth refresh -s workflow, then push again.',
        },
        {
          mistake: 'A token was committed in ci.yml.',
          fix: 'Revoke and rotate it first, then move it to a secret. Removing it in a new commit does not unleak it.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-needs-fail',
      question: "lint fails on a push to main. test has needs: lint, and deploy has needs: test and if: github.ref == 'refs/heads/main'. What runs?",
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'lint', label: 'lint', detail: 'failed', row: 0 },
          { id: 'test', label: 'test', detail: 'needs: lint', row: 0 },
          { id: 'deploy', label: 'deploy', detail: 'needs: test', row: 0 },
        ],
        edges: [
          { from: 'lint', to: 'test' },
          { from: 'test', to: 'deploy' },
        ],
      },
      options: [
        { id: 'a', text: 'test runs, deploy is skipped.' },
        { id: 'b', text: 'test and deploy are both skipped.' },
        { id: 'c', text: 'deploy runs because the ref is main.' },
        { id: 'd', text: 'test and deploy run, but are marked failed.' },
      ],
      correct: 'b',
      explanation:
        'A job whose needs did not succeed is skipped, and that skip propagates down the chain. The if: on deploy would only be checked if its needs had succeeded; to run after a failure you would need if: failure() or always().',
    },
    {
      id: 'q-fork-secret',
      question: 'A contributor opens a PR from their fork. The deploy-preview step fails because secrets.PREVIEW_TOKEN is empty. Why?',
      options: [
        { id: 'a', text: 'Secrets are only available on the schedule event.' },
        { id: 'b', text: 'Workflows triggered by pull requests from forks receive no secrets, so untrusted code cannot read them.' },
        { id: 'c', text: 'The secret name must be lower case.' },
        { id: 'd', text: 'Secrets need a matrix to be expanded.' },
      ],
      correct: 'b',
      explanation:
        'GitHub withholds secrets and gives a read-only GITHUB_TOKEN to fork PR runs. pull_request_target would have secrets, which is exactly why running the PR\'s code in it is dangerous.',
    },
    {
      id: 'q-pin',
      question: 'Which uses: line is guaranteed to run the same code next month?',
      options: [
        { id: 'a', text: 'uses: octo-lint/annotate@main' },
        { id: 'b', text: 'uses: octo-lint/annotate@v2' },
        { id: 'c', text: 'uses: octo-lint/annotate@3f1c2b9e8d7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e' },
        { id: 'd', text: 'uses: octo-lint/annotate@latest' },
      ],
      correct: 'c',
      explanation:
        'A full commit SHA names one exact snapshot. Branches like main move with every push, and tags like v2 can be moved by the owner (or by an attacker who takes over the repository). Dependabot can keep SHA pins up to date.',
    },
    {
      id: 'q-matrix-count',
      question: 'A job has strategy: matrix: node: [20, 22] and os: [ubuntu-latest, macos-latest]. How many jobs run?',
      options: [
        { id: 'a', text: '2' },
        { id: 'b', text: '3' },
        { id: 'c', text: '4' },
        { id: 'd', text: '1, with both versions installed' },
      ],
      correct: 'c',
      explanation:
        'Matrix lists multiply: every Node version on every OS, 2 x 2 = 4 parallel jobs. On a private repo the macOS ones also cost more minutes.',
    },
    {
      id: 'q-required-paths',
      question: 'test is a required check. The workflow has paths-ignore: [\'docs/**\']. A PR changes only docs/guide.md. What happens?',
      options: [
        { id: 'a', text: 'The check is skipped, which counts as passing, so the PR can merge.' },
        { id: 'b', text: 'The workflow never starts, the required check never reports, and the PR stays blocked waiting for it.' },
        { id: 'c', text: 'GitHub runs the workflow anyway because the check is required.' },
        { id: 'd', text: 'The PR merges and the check runs afterwards.' },
      ],
      correct: 'b',
      explanation:
        'A path filter stops the whole workflow, so no check is ever created and protection keeps waiting. A job skipped with if: does report (as skipped), and that counts as passing.',
    },
    {
      id: 'q-release-token',
      question: 'Your release workflow creates a GitHub release using GITHUB_TOKEN. publish.yml has on: release: types: [published] but never runs. Why?',
      options: [
        { id: 'a', text: 'release events only fire for draft releases.' },
        { id: 'b', text: 'Events caused by GITHUB_TOKEN do not start new workflow runs, to prevent loops.' },
        { id: 'c', text: 'publish.yml needs a schedule as well.' },
        { id: 'd', text: 'Only one workflow per repository may listen to release.' },
      ],
      correct: 'b',
      explanation:
        'Apart from workflow_dispatch and repository_dispatch, anything done with the GITHUB_TOKEN triggers no new runs. Publish in the same workflow, or create the release with a GitHub App or personal token.',
    },
    {
      id: 'q-cache-artifact',
      question: 'You want reviewers to download the built app from the run page, and a later deploy job to use that exact build. What do you use?',
      options: [
        { id: 'a', text: 'actions/cache with the build folder' },
        { id: 'b', text: 'actions/upload-artifact, then actions/download-artifact in the deploy job' },
        { id: 'c', text: 'Commit the build folder to main' },
        { id: 'd', text: 'Nothing: jobs share the same disk' },
      ],
      correct: 'b',
      explanation:
        'Artifacts are results attached to a run and passed between jobs. Caches are a best-effort speed-up that can be evicted at any time. Jobs run on separate machines and share no disk.',
    },
    {
      id: 'q-oidc',
      question: 'What does permissions: id-token: write let a deploy job do?',
      options: [
        { id: 'a', text: 'Write any secret of the repository.' },
        { id: 'b', text: 'Ask GitHub for a signed, short-lived identity token that a cloud provider can trade for temporary credentials.' },
        { id: 'c', text: 'Push commits to main without review.' },
        { id: 'd', text: 'Read the identity of the person who opened the PR.' },
      ],
      correct: 'b',
      explanation:
        'With OIDC the cloud trusts a token that names the repo, branch and environment, and returns credentials that expire soon. No long-lived cloud key is stored as a secret, so there is none to leak.',
    },
  ],
  theoryOnly: [
    'release, issues and issue_comment triggers',
    'workflow_dispatch inputs',
    'pull_request_target risks',
    'Variables (vars context)',
    'OIDC to cloud providers',
    'Artifacts',
    'Environments with required reviewers',
    'Reusable workflows',
    'Composite actions',
    'GitHub-hosted vs self-hosted runners and billing',
    'Required status checks',
    'Re-running failed jobs (gh run rerun)',
    'Dependabot security updates and groups',
    'Release automation (release-please, trusted publishing)',
  ],
};

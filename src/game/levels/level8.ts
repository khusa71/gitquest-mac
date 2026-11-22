/**
 * Level 8 — Team workflows: GitHub Flow, Conventional Commits, atomic commits, releases, hotfixes.
 * remote: true — origin is the local bare repo standing in for GitHub.
 */
import { allOf, check, commitsSince, headBranch, headFile } from '../validate';

import type { Commit, RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';
import { NOVA_FILES, as, productionRepo } from '../production';

// Story file contents ------------------------------------------------------

export const FILES = {
  readmeTypo: '# Nova notes\nRun npm run dev to strat the app.',
  readme: '# Nova notes\nRun npm run dev to start the app.',
  search: 'export const search = (q: string) => notes.filter((n) => n.includes(q));',
  searchCase: 'export const search = (q: string) => notes.filter((n) => n.toLowerCase().includes(q.toLowerCase()));',
  searchEmpty:
    "export const search = (q: string) => q === '' ? notes : notes.filter((n) => n.toLowerCase().includes(q.toLowerCase()));",
  pin: 'export const pin = (note: Note) => ({ ...note, pinned: true });',
  exportMd: "export const toMarkdown = (note: Note) => '# ' + note.title;",
  share: "export const share = (note: Note) => 'https://nova.example/n/' + note.id;",
} as const;

const ROOT_COMMANDS: readonly string[] = [
  'git init -b main',
  `edit README.md "${FILES.readmeTypo}"`,
  `edit search.ts "${FILES.search}"`,
  'git add .',
  'git commit -m "Initial commit"',
  'git tag -a v1.0.0 -m "Nova 1.0.0"',
  'git remote add origin https://git.nova.example/nova.git',
  'git push -u origin main',
  'git push origin v1.0.0',
];

// Helpers ------------------------------------------------------------------

const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([\w./-]+\))?!?: \S/;

const subject = (commit: Commit): string => commit.message.split('\n')[0] ?? '';

function reachable(state: RepoState, from: string | undefined): Set<string> {
  const seen = new Set<string>();
  const queue = from === undefined ? [] : [from];
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (seen.has(hash)) continue;
    seen.add(hash);
    queue.push(...(state.commits[hash]?.parents ?? []));
  }
  return seen;
}

/** New non-merge commits in local main's history. */
function newOnMain(state: RepoState, ctx: MissionContext): Commit[] {
  const onMain = reachable(state, state.branches['main']);
  return commitsSince(state, ctx).filter((commit) => onMain.has(commit.hash) && commit.parents.length < 2);
}

/** Paths whose content differs from the first parent. */
function changed(state: RepoState, commit: Commit): string[] {
  const before = commit.parents[0] === undefined ? {} : (state.commits[commit.parents[0]]?.snapshot ?? {});
  const paths = new Set([...Object.keys(before), ...Object.keys(commit.snapshot)]);
  return [...paths].filter((path) => before[path] !== commit.snapshot[path]);
}

const pushed = (state: RepoState, ctx: MissionContext): boolean =>
  state.branches['main'] !== undefined && ctx.facts.server?.branches['main'] === state.branches['main'];

const tagTarget = (ctx: MissionContext, name: string) => ctx.facts.tags.find((tag) => tag.name === name);

// 8.1 GitHub Flow ----------------------------------------------------------

const mergedPin = (state: RepoState): boolean => {
  const tip = state.commits[state.branches['main'] ?? ''];
  return tip !== undefined && tip.parents.length === 2 && tip.snapshot['pin.ts'] === FILES.pin;
};

const githubFlow: Mission = {
  id: 'github-flow',
  number: '8.1',
  title: 'GitHub Flow, start to finish',
  story:
    'Ines wants pinned notes in tomorrow\'s build, and pin.ts is ready on your disk. Nova uses GitHub Flow: main is always deployable, every change lives on a short branch that gets pushed, reviewed, merged and deleted.',
  goal: 'Commit pin.ts on feature/pin, push it, merge it into main with --no-ff, push main, and delete the branch locally and on origin.',
  outcome: {
    summary:
      'pin.ts reached main through a short-lived branch and one merge commit, main is pushed, and feature/pin is deleted everywhere. That is the loop every change on a GitHub Flow team follows.',
    expect: {
      kind: 'diagram',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['v1.0.0'] },
          { id: 'B', message: 'feat(pin): pin a note to the top', parents: ['A'], lane: 'feature/pin' },
          { id: 'M', message: "Merge branch 'feature/pin'", parents: ['A', 'B'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
        ],
        head: 'M',
        caption: 'feature/pin is deleted locally and on origin; the merge commit still shows where the feature landed.',
      },
    },
  },
  checks: [
    {
      label: 'Merge feature/pin into main with a merge commit',
      proof: 'git log --graph --oneline -4',
      done: mergedPin,
    },
    {
      label: 'Push main to origin',
      proof: 'git ls-remote origin main',
      done: (state, ctx) => mergedPin(state) && pushed(state, ctx),
    },
    {
      label: 'Delete feature/pin locally and on origin',
      proof: 'git branch -a',
      done: (state, ctx) =>
        mergedPin(state) && state.branches['feature/pin'] === undefined && ctx.facts.server?.branches['feature/pin'] === undefined,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(state.commits[state.branches['main'] ?? '']?.snapshot['pin.ts'] === FILES.pin, 'main must contain pin.ts: commit it on feature/pin and merge.'),
      check(mergedPin(state), 'Merge with git merge --no-ff so main keeps a merge commit for the feature.'),
      check(headBranch(state) === 'main', 'Finish on main.'),
      check(pushed(state, ctx), 'Push main to origin.'),
      check(state.branches['feature/pin'] === undefined, 'Delete the local branch: git branch -d feature/pin.'),
      check(ctx.facts.server?.branches['feature/pin'] === undefined, 'Delete the branch on origin: git push origin --delete feature/pin.'),
    ),
  hints: [
    'Branch, commit, push the branch (that is where the pull request would open), merge, push main, clean up.',
    'Use git switch -c feature/pin, git push -u origin feature/pin, then on main git merge --no-ff --no-edit feature/pin. Deleting needs two commands: one local, one on origin.',
    'git switch -c feature/pin, git add pin.ts, git commit -m "feat(pin): pin a note to the top", git push -u origin feature/pin, git switch main, git merge --no-ff --no-edit feature/pin, git push, git branch -d feature/pin, git push origin --delete feature/pin.',
  ],
  par: 9,
  takeaway: 'GitHub Flow is one short branch per change: push it, merge it into main, push main, delete the branch.',
  theory: {
    title: 'GitHub Flow',
    body: 'In GitHub Flow main is always releasable. Each change gets a short-lived branch that is pushed so a pull request can be reviewed and tested, then merged into main and deleted. A --no-ff merge keeps one merge commit per feature, so the history shows where each feature landed; trunk-based teams instead commit tiny changes straight to main behind feature flags.',
    lesson: 'Branch → push → review → merge → delete.',
  },
  prelude: [{ id: 'm8.1-p1', commands: [`edit pin.ts "${FILES.pin}"`] }],
  reference: [
    'git switch -c feature/pin',
    'git add pin.ts',
    'git commit -m "feat(pin): pin a note to the top"',
    'git push -u origin feature/pin',
    'git switch main',
    'git merge --no-ff --no-edit feature/pin',
    'git push origin main',
    'git branch -d feature/pin',
    'git push origin --delete feature/pin',
  ],
  alternatives: [
    [
      'git checkout -b feature/pin',
      'git add pin.ts',
      'git commit -m "feat: pinned notes"',
      'git push origin feature/pin',
      'git checkout main',
      'git merge --no-ff -m "Merge feature/pin" feature/pin',
      'git push',
      'git push origin :feature/pin',
      'git branch -D feature/pin',
    ],
  ],
};

// 8.2 Conventional Commits -------------------------------------------------

const featExport = (state: RepoState, ctx: MissionContext): boolean =>
  newOnMain(state, ctx).some(
    (commit) => /^feat[(!:]/.test(subject(commit)) && CONVENTIONAL.test(subject(commit)) && changed(state, commit).includes('export.ts'),
  );

const allConventional = (state: RepoState, ctx: MissionContext): boolean => {
  const commits = newOnMain(state, ctx);
  return commits.length > 0 && commits.every((commit) => CONVENTIONAL.test(subject(commit)));
};

const conventional: Mission = {
  id: 'conventional-commits',
  number: '8.2',
  title: 'Messages a robot can read',
  story:
    'Samir\'s release script builds the changelog and the next version number from commit subjects: feat bumps the minor version, fix the patch. export.ts, the new Markdown export, is waiting on your disk.',
  goal: 'Commit export.ts with a Conventional Commits subject of type feat, and push main.',
  outcome: {
    summary:
      'The Markdown export is committed with a feat subject and pushed. Release tooling can read that subject and know the next version is a minor bump.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -1',
      output: '946b6d9 (HEAD -> main, origin/main) feat(export): export a note as Markdown',
    },
  },
  checks: [
    { label: 'Commit export.ts with a feat: subject', proof: 'git log -1 --format=%s', done: featExport },
    {
      label: 'Every new commit follows type(scope): description',
      proof: 'git log --format=%s -3',
      done: allConventional,
    },
    { label: 'Push main', proof: 'git status -sb', done: (state, ctx) => featExport(state, ctx) && pushed(state, ctx) },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headFile(state, 'export.ts') === FILES.exportMd, 'Commit export.ts on main.'),
      check(
        allConventional(state, ctx),
        'Each new subject must look like type(scope): description, e.g. feat(export): export a note as Markdown. Amend the message with git commit --amend -m.',
      ),
      check(featExport(state, ctx), 'A new feature uses the type feat.'),
      check(pushed(state, ctx), 'Push main to origin.'),
    ),
  hints: [
    'Conventional Commits: a type, an optional scope in parentheses, a colon, a space, then a short description.',
    'A new capability is feat, a bug fix is fix; docs, chore, refactor, test, perf also exist. ! or a BREAKING CHANGE: footer marks a breaking change.',
    'git add export.ts, git commit -m "feat(export): export a note as Markdown", git push.',
  ],
  par: 3,
  takeaway: 'A Conventional Commits subject lets tools compute versions and changelogs from history.',
  theory: {
    title: 'Conventional Commits',
    body: 'The subject format type(scope): description makes history machine-readable. Release tools map fix to a patch version, feat to a minor one, and feat! or a BREAKING CHANGE: footer to a major one, then write the changelog from the subjects. Teams enforce it with a commit-msg hook or a CI check such as commitlint.',
    lesson: 'feat(scope): what it does.',
  },
  prelude: [{ id: 'm8.2-p1', commands: [`edit export.ts "${FILES.exportMd}"`] }],
  reference: ['git add export.ts', 'git commit -m "feat(export): export a note as Markdown"', 'git push'],
  alternatives: [['git add export.ts', 'git commit -m "feat: markdown export"', 'git push origin main']],
};

// 8.3 Atomic commits -------------------------------------------------------

const only = (state: RepoState, ctx: MissionContext, path: string, other: string): boolean =>
  newOnMain(state, ctx).some((commit) => {
    const paths = changed(state, commit);
    return paths.includes(path) && !paths.includes(other);
  });

const searchAlone = (state: RepoState, ctx: MissionContext): boolean =>
  headFile(state, 'search.ts') === FILES.searchCase && only(state, ctx, 'search.ts', 'README.md');
const readmeAlone = (state: RepoState, ctx: MissionContext): boolean =>
  headFile(state, 'README.md') === FILES.readme && only(state, ctx, 'README.md', 'search.ts');

const atomic: Mission = {
  id: 'atomic-commits',
  number: '8.3',
  title: 'One idea per commit',
  story:
    'Two unrelated edits sit on your disk: the case-insensitive search fix and a typo in the README. Yanis wants to be able to revert the fix alone if QA finds a problem, so they cannot share a commit.',
  goal: 'Commit search.ts and README.md in two separate Conventional commits, then push.',
  outcome: {
    summary:
      'The search fix and the README typo are two separate commits, each touching one file, and both are pushed. Either one can now be reverted or cherry-picked without dragging the other along.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --stat -2',
      output: 'b19dceb (HEAD -> main, origin/main) docs: fix typo in README\n README.md | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n5a3692f fix(search): ignore case\n search.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)',
    },
  },
  checks: [
    { label: 'Commit the search fix on its own', proof: 'git show --stat HEAD~1', done: searchAlone },
    { label: 'Commit the README typo on its own', proof: 'git show --stat HEAD', done: readmeAlone },
    {
      label: 'Push both commits',
      proof: 'git log origin/main --oneline -2',
      done: (state, ctx) => searchAlone(state, ctx) && readmeAlone(state, ctx) && pushed(state, ctx),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        !newOnMain(state, ctx).some((commit) => ['search.ts', 'README.md'].every((path) => changed(state, commit).includes(path))),
        'One commit mixes search.ts and README.md. Undo it, then stage one file at a time.',
      ),
      check(searchAlone(state, ctx), 'Commit the search.ts fix alone: git add search.ts, then commit.'),
      check(readmeAlone(state, ctx), 'Commit the README.md typo fix alone.'),
      check(newOnMain(state, ctx).every((commit) => CONVENTIONAL.test(subject(commit))), 'Keep Conventional subjects: fix(search): … and docs: ….'),
      check(pushed(state, ctx), 'Push main to origin.'),
    ),
  hints: [
    'git commit -a would take both edits at once. Stage only what belongs to one idea.',
    'git add <path> stages one file; git commit -m "…" <path> commits just that path. For two ideas inside one file, git add -p lets you pick hunks.',
    'git add search.ts, git commit -m "fix(search): ignore case", git commit -am "docs: fix typo in README", git push.',
  ],
  par: 4,
  takeaway: 'An atomic commit holds one idea, so it can be reviewed, reverted or cherry-picked on its own.',
  theory: {
    title: 'Atomic commits',
    body: 'Each commit should do one thing and leave the project working. Then git revert, git cherry-pick and git bisect act on exactly one change. Stage by path with git add <file>, and when two ideas live in the same file use git add -p to choose hunk by hunk.',
    lesson: 'One idea, one commit.',
  },
  prelude: [{ id: 'm8.3-p1', commands: [`edit README.md "${FILES.readme}"`, `edit search.ts "${FILES.searchCase}"`] }],
  reference: ['git add search.ts', 'git commit -m "fix(search): ignore case"', 'git commit -am "docs: fix typo in README"', 'git push'],
  alternatives: [
    ['git commit -m "docs(readme): fix typo" README.md', 'git commit -m "fix(search): case-insensitive search" search.ts', 'git push'],
  ],
};

// 8.4 Release --------------------------------------------------------------

/** Every non-merge subject since v1.0.0 (except changelog edits) appears in CHANGELOG.md at `hash`. */
function changelogComplete(state: RepoState, ctx: MissionContext, hash: string | undefined): boolean {
  const changelog = hash === undefined ? undefined : state.commits[hash]?.snapshot['CHANGELOG.md'];
  if (changelog === undefined) return false;
  const released = reachable(state, tagTarget(ctx, 'v1.0.0')?.target);
  return [...reachable(state, hash)]
    .map((h) => state.commits[h]!)
    .filter((commit) => !released.has(commit.hash) && commit.parents.length < 2 && !changed(state, commit).includes('CHANGELOG.md'))
    .every((commit) => changelog.includes(subject(commit)));
}

const v110 = (state: RepoState, ctx: MissionContext): boolean => {
  const tag = tagTarget(ctx, 'v1.1.0');
  return tag !== undefined && tag.annotated && reachable(state, state.branches['main']).has(tag.target) && changelogComplete(state, ctx, tag.target);
};

const release: Mission = {
  id: 'release-tag',
  number: '8.4',
  title: 'Ship 1.1.0',
  story:
    'Pins, Markdown export and the search fix are on main: time for Nova 1.1.0. Users read CHANGELOG.md, and the build server only ships tags it finds on origin.',
  goal: 'Commit a CHANGELOG.md that lists every change since v1.0.0, tag that commit v1.1.0 (annotated) and push main and the tag.',
  outcome: {
    summary:
      'Nova 1.1.0 is a commit with its changelog and an annotated v1.1.0 tag, and both main and the tag are on origin. Users can read what changed, and the build server can find the release.',
    expect: {
      kind: 'file',
      path: 'CHANGELOG.md',
      content: '# Changelog\n\n## v1.1.0\n- docs: fix typo in README\n- fix(search): ignore case\n- feat(export): export a note as Markdown\n- feat(pin): pin a note to the top',
    },
  },
  checks: [
    {
      label: 'Commit CHANGELOG.md listing every change since v1.0.0',
      proof: 'git log v1.0.0..HEAD --no-merges --format=%s',
      done: (state, ctx) => changelogComplete(state, ctx, state.branches['main']),
    },
    { label: 'Tag the release commit v1.1.0 (annotated)', proof: 'git cat-file -t v1.1.0', done: v110 },
    {
      label: 'Push main and v1.1.0',
      proof: 'git ls-remote --tags origin',
      done: (state, ctx) => v110(state, ctx) && pushed(state, ctx) && (ctx.facts.server?.tags.includes('v1.1.0') ?? false),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(headFile(state, 'CHANGELOG.md') !== undefined, 'Commit a CHANGELOG.md on main.'),
      check(
        changelogComplete(state, ctx, state.branches['main']),
        'CHANGELOG.md must list the subject of every commit since v1.0.0: git log v1.0.0..HEAD --no-merges --format="- %s".',
      ),
      check(tagTarget(ctx, 'v1.1.0') !== undefined, 'Create the tag v1.1.0 on the changelog commit.'),
      check(tagTarget(ctx, 'v1.1.0')?.annotated === true, 'Release tags are annotated: git tag -a v1.1.0 -m "…" (delete the light tag with git tag -d v1.1.0).'),
      check(v110(state, ctx), 'v1.1.0 must point at the commit that contains the full CHANGELOG.md.'),
      check(pushed(state, ctx), 'Push main to origin.'),
      check(ctx.facts.server?.tags.includes('v1.1.0') ?? false, 'Push the tag too: git push origin v1.1.0.'),
    ),
  hints: [
    'git log can print exactly the lines a changelog needs, and git push does not send tags unless you ask.',
    'git log v1.0.0..HEAD --no-merges --format="- %s" lists the changes. Commit the file, then git tag -a on that commit.',
    'git log v1.0.0..HEAD --no-merges --format="- %s" > CHANGELOG.md, git add CHANGELOG.md, git commit -m "chore(release): v1.1.0", git tag -a v1.1.0 -m "Nova 1.1.0", git push, git push origin v1.1.0.',
  ],
  par: 6,
  takeaway: 'A release is a commit with its changelog, an annotated tag on it, and both pushed: tags never travel unless you push them.',
  theory: {
    title: 'Releases and semantic versions',
    body: 'Semantic versioning reads MAJOR.MINOR.PATCH: breaking change, new feature, bug fix. An annotated tag (git tag -a) stores who released what and when, and git push only sends a tag when you name it or pass --follow-tags. git log v1.0.0..HEAD --no-merges lists exactly what the new release contains.',
    lesson: 'Changelog, annotated tag, push the tag.',
  },
  prelude: [],
  reference: [
    'edit CHANGELOG.md "# Changelog\\n\\n## v1.1.0\\n- docs: fix typo in README\\n- fix(search): ignore case\\n- feat(export): export a note as Markdown\\n- feat(pin): pin a note to the top"',
    'git add CHANGELOG.md',
    'git commit -m "chore(release): v1.1.0"',
    'git tag -a v1.1.0 -m "Nova 1.1.0"',
    'git push origin main',
    'git push origin v1.1.0',
  ],
  alternatives: [
    [
      'edit CHANGELOG.md "## 1.1.0\\n- feat(pin): pin a note to the top\\n- feat(export): export a note as Markdown\\n- fix(search): ignore case\\n- docs: fix typo in README"',
      'git add CHANGELOG.md',
      'git commit -m "docs: changelog for 1.1.0"',
      'git tag -a v1.1.0 -m "Nova 1.1.0"',
      'git push --follow-tags origin main',
    ],
  ],
};

// 8.5 Hotfix ---------------------------------------------------------------

const hotfixTagged = (state: RepoState, ctx: MissionContext): boolean => {
  const base = tagTarget(ctx, 'v1.1.0')?.target;
  const tip = state.commits[tagTarget(ctx, 'v1.1.1')?.target ?? ''];
  return (
    base !== undefined &&
    tip !== undefined &&
    reachable(state, tip.hash).has(base) &&
    tip.snapshot['search.ts'] === FILES.searchEmpty &&
    tip.snapshot['share.ts'] === undefined
  );
};

const mainHasFix = (state: RepoState): boolean => {
  const tip = state.commits[state.branches['main'] ?? ''];
  return tip?.snapshot['search.ts'] === FILES.searchEmpty && tip.snapshot['share.ts'] === FILES.share;
};

const hotfix: Mission = {
  id: 'hotfix-from-tag',
  number: '8.5',
  title: 'Hotfix 1.1.1',
  story:
    'Users on 1.1.0 see an empty list when the search box is cleared. Meanwhile Lea pushed unreleased link sharing to main, which must not ship yet. Patch the release itself, ship 1.1.1, then make sure main gets the fix too.',
  goal: 'Fix search.ts on hotfix/1.1.1 started from v1.1.0, tag it v1.1.1 and push the tag, then bring the fix into main and push main.',
  outcome: {
    summary:
      "v1.1.1 is v1.1.0 plus the search fix only, tagged and pushed, and main has the same fix on top of Lea's work. Users get the patch without unreleased features, and main never regresses.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --graph -4 main hotfix/1.1.1',
      output: '* 62eb160 (HEAD -> main, origin/main, origin/HEAD) fix(search): handle an empty query\n* d857a80 feat(share): share a note by link\n| * cc8a427 (tag: v1.1.1, hotfix/1.1.1) fix(search): handle an empty query\n|/\n* 5d5b7b2 (tag: v1.1.0) chore(release): v1.1.0',
    },
  },
  checks: [
    { label: 'Tag v1.1.1 on a fix built from v1.1.0', proof: 'git log --oneline v1.1.0..v1.1.1', done: hotfixTagged },
    {
      label: 'Push the v1.1.1 tag',
      proof: 'git ls-remote --tags origin',
      done: (state, ctx) => hotfixTagged(state, ctx) && (ctx.facts.server?.tags.includes('v1.1.1') ?? false),
    },
    {
      label: 'Bring the fix back to main and push it',
      proof: 'git log origin/main --oneline -3',
      done: (state, ctx) => mainHasFix(state) && pushed(state, ctx),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(tagTarget(ctx, 'v1.1.1') !== undefined, 'Tag the hotfix commit v1.1.1.'),
      check(
        state.commits[tagTarget(ctx, 'v1.1.1')?.target ?? '']?.snapshot['share.ts'] === undefined,
        "v1.1.1 contains Lea's unreleased share.ts: start the hotfix branch from v1.1.0, not from main.",
      ),
      check(hotfixTagged(state, ctx), `v1.1.1 must be v1.1.0 plus the fixed search.ts: ${FILES.searchEmpty}`),
      check(ctx.facts.server?.tags.includes('v1.1.1') ?? false, 'Push the tag: git push origin v1.1.1.'),
      check(state.commits[state.branches['main'] ?? '']?.snapshot['share.ts'] === FILES.share, "main must keep Lea's share.ts: pull it."),
      check(mainHasFix(state), 'main must get the fix too: cherry-pick the hotfix commit or merge the hotfix branch.'),
      check(pushed(state, ctx), 'Push main to origin.'),
    ),
  hints: [
    'A hotfix starts from what users run, the release tag, not from main.',
    'git switch -c hotfix/1.1.1 v1.1.0, fix, commit, tag, push the tag. Then on main: pull Lea\'s work and cherry-pick (or merge) the hotfix.',
    'git switch -c hotfix/1.1.1 v1.1.0, nano search.ts (return notes when q is empty), git commit -am "fix(search): handle an empty query", git tag -a v1.1.1 -m "Nova 1.1.1", git push origin v1.1.1, git switch main, git pull, git cherry-pick hotfix/1.1.1, git push.',
  ],
  par: 9,
  takeaway: 'Hotfix from the release tag, tag the patch, then bring the same fix back to main so it never regresses.',
  theory: {
    title: 'Hotfixes and back-merges',
    body: 'Users run a tag, not main, so an urgent fix starts from that tag on its own branch and ships as a patch version. The fix must then reach main as well, either by cherry-picking the commit or by merging the hotfix branch back. Git Flow formalises this with release and hotfix branches; GitHub Flow teams often just fix forward on main.',
    lesson: 'Fix the release, then fix main.',
  },
  prelude: [
    {
      id: 'm8.5-p1',
      teammate: 'lea',
      remote: { push: ['main'] },
      commands: [`edit share.ts "${FILES.share}"`, 'git add share.ts', 'git commit -m "feat(share): share a note by link"'],
    },
  ],
  reference: [
    'git switch -c hotfix/1.1.1 v1.1.0',
    `edit search.ts "${FILES.searchEmpty}"`,
    'git commit -am "fix(search): handle an empty query"',
    'git tag -a v1.1.1 -m "Nova 1.1.1"',
    'git push origin v1.1.1',
    'git switch main',
    'git pull',
    'git cherry-pick hotfix/1.1.1',
    'git push',
  ],
  alternatives: [
    [
      'git switch -c hotfix/1.1.1 v1.1.0',
      `edit search.ts "${FILES.searchEmpty}"`,
      'git commit -am "fix(search): handle an empty query"',
      'git tag v1.1.1',
      'git push origin hotfix/1.1.1 v1.1.1',
      'git switch main',
      'git pull --no-edit',
      'git merge --no-edit hotfix/1.1.1',
      'git push',
    ],
  ],
};

// 8.6 Capstone: ship 1.3.0, then hotfix 1.3.1 (production repo) ---------------

const UNRELEASED = '## [Unreleased]';
const UNRELEASED_NOTE = '- Trailing whitespace is trimmed when a note is saved.';
const CONFLICT_TS = 'packages/sync/src/conflict.ts';
const TIE_FIX = 'fix(sync): prefer the server copy when timestamps tie';
const FIXED_CONFLICT = NOVA_FILES[CONFLICT_TS]!.replace('local.updatedAt >= remote.updatedAt', 'local.updatedAt > remote.updatedAt');
const CHANGELOG_130 = NOVA_FILES['CHANGELOG.md']!.replace(UNRELEASED, '## [1.3.0] - 2026-01-05');
const PACKAGE_130 = NOVA_FILES['package.json']!.replace('"version": "1.2.0"', '"version": "1.3.0"');

/** Unreleased notes now sit under a 1.3.0 heading; an empty Unreleased section above it is fine. */
function changelog130(text: string | undefined): boolean {
  if (text === undefined) return false;
  const heading = text.search(/^## \[1\.3\.0\]/m);
  const note = text.indexOf(UNRELEASED_NOTE);
  const unreleased = text.indexOf(UNRELEASED);
  const emptyUnreleased = unreleased === -1 || (unreleased < heading && text.slice(unreleased + UNRELEASED.length, heading).trim() === '');
  return heading !== -1 && heading < note && note < text.indexOf('## [1.2.0]') && emptyUnreleased;
}

const release130 = (state: RepoState, ctx: MissionContext): boolean => {
  const tag = tagTarget(ctx, 'v1.3.0');
  const snap = state.commits[tag?.target ?? '']?.snapshot;
  return (
    tag !== undefined &&
    tag.annotated &&
    snap !== undefined &&
    (snap['package.json'] ?? '').includes('"version": "1.3.0"') &&
    changelog130(snap['CHANGELOG.md']) &&
    reachable(state, state.branches['main']).has(tag.target)
  );
};

const hotfix131 = (state: RepoState, ctx: MissionContext): boolean => {
  const base = tagTarget(ctx, 'v1.3.0')?.target;
  const tag = tagTarget(ctx, 'v1.3.1');
  const snap = state.commits[tag?.target ?? '']?.snapshot;
  return (
    base !== undefined &&
    tag !== undefined &&
    snap !== undefined &&
    tag.target !== base &&
    reachable(state, tag.target).has(base) &&
    snap[CONFLICT_TS] === FIXED_CONFLICT &&
    snap['packages/sync/src/cache.ts'] === undefined
  );
};

const onServer = (ctx: MissionContext, tag: string) => ctx.facts.server?.tags.includes(tag) ?? false;

const ship130: Mission = {
  id: 'ship-1-3-0',
  number: '8.6',
  title: 'Ship 1.3.0',
  capstone: true,
  story:
    'main is ready for Nova 1.3.0: the notes under Unreleased in CHANGELOG.md are final, but package.json still says 1.2.0. Support already reports a sync bug that Samir fixed in the last commit of his unfinished feature/offline-cache branch, and it must ship right after as 1.3.1, without the cache.',
  goal: "Release 1.3.0 (CHANGELOG, package.json, annotated tag v1.3.0, main and tag pushed), then tag v1.3.1 on a hotfix branch from v1.3.0 with only Samir's fix cherry-picked, and push that tag.",
  outcome: {
    summary:
      "Nova 1.3.0 is released from main with its changelog, version bump and annotated tag, all on origin. Right after it, v1.3.1 adds only Samir's sync fix on top of 1.3.0, without his unfinished cache.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2 hotfix/1.3.1',
      output: 'b79dd97 (HEAD -> hotfix/1.3.1, tag: v1.3.1, origin/hotfix/1.3.1) fix(sync): prefer the server copy when timestamps tie\n0632d28 (tag: v1.3.0, origin/main, main) chore(release): 1.3.0',
    },
  },
  checks: [
    { label: 'v1.3.0 (annotated) tags a commit on main with 1.3.0 in CHANGELOG.md and package.json', proof: 'git show v1.3.0 --stat', done: release130 },
    {
      label: 'main and v1.3.0 are on origin',
      proof: 'git ls-remote origin main v1.3.0',
      done: (state, ctx) => release130(state, ctx) && pushed(state, ctx) && onServer(ctx, 'v1.3.0'),
    },
    { label: "v1.3.1 is v1.3.0 plus Samir's fix, without the cache", proof: 'git log --oneline v1.3.0..v1.3.1', done: hotfix131 },
    { label: 'v1.3.1 is on origin', proof: 'git ls-remote --tags origin', done: (state, ctx) => hotfix131(state, ctx) && onServer(ctx, 'v1.3.1') },
  ],
  validate: (state, ctx) => {
    const v130 = state.commits[tagTarget(ctx, 'v1.3.0')?.target ?? '']?.snapshot ?? {};
    const v131 = state.commits[tagTarget(ctx, 'v1.3.1')?.target ?? '']?.snapshot ?? {};
    return allOf(
      check(ctx.facts.inProgress === null, 'A cherry-pick is still in progress: finish it or abort it first.'),
      check(tagTarget(ctx, 'v1.3.0') !== undefined, 'Commit the release, then tag that commit v1.3.0.'),
      check(tagTarget(ctx, 'v1.3.0')?.annotated === true, 'Release tags are annotated: git tag -d v1.3.0, then git tag -a v1.3.0 -m "Nova 1.3.0".'),
      check((v130['package.json'] ?? '').includes('"version": "1.3.0"'), 'The commit tagged v1.3.0 must have "version": "1.3.0" in package.json.'),
      check(
        changelog130(v130['CHANGELOG.md']),
        'In the tagged CHANGELOG.md, rename "## [Unreleased]" to "## [1.3.0] - <date>" (an empty Unreleased section above it is fine).',
      ),
      check(release130(state, ctx), 'The release commit must be on main.'),
      check(pushed(state, ctx), 'Push main to origin.'),
      check(onServer(ctx, 'v1.3.0'), 'Push the tag: git push origin v1.3.0.'),
      check(tagTarget(ctx, 'v1.3.1') !== undefined, 'Tag the hotfix commit v1.3.1.'),
      check(
        v131['packages/sync/src/cache.ts'] === undefined,
        "v1.3.1 contains Samir's unfinished offline cache: cherry-pick only his fix onto a branch from v1.3.0.",
      ),
      check(hotfix131(state, ctx), `v1.3.1 must be v1.3.0 plus Samir's fix ("${TIE_FIX}"): git switch -c hotfix/1.3.1 v1.3.0, then git cherry-pick it.`),
      check(onServer(ctx, 'v1.3.1'), 'Push the tag: git push origin v1.3.1.'),
    );
  },
  hints: [
    'A release is a commit, an annotated tag and a push of both. A patch release starts from the tag users run, not from main.',
    'Rename "## [Unreleased]" to "## [1.3.0] - <date>", bump "version" in package.json, commit, git tag -a v1.3.0, push main and the tag. Then git switch -c hotfix/1.3.1 v1.3.0 and cherry-pick only the last commit of feature/offline-cache.',
    'nano CHANGELOG.md, nano package.json, git commit -am "chore(release): 1.3.0", git tag -a v1.3.0 -m "Nova 1.3.0", git push origin main v1.3.0, git switch -c hotfix/1.3.1 v1.3.0, git cherry-pick feature/offline-cache, git tag -a v1.3.1 -m "Nova 1.3.1", git push origin hotfix/1.3.1 v1.3.1',
  ],
  par: 9,
  takeaway: 'Ship from main with a changelog, a version bump and an annotated tag, and ship patches from the tag with only the fix cherry-picked.',
  theory: {
    title: 'Releasing from a team repo',
    body: 'Teams collect changes under Unreleased in CHANGELOG.md as PRs merge, so a release only renames that section, bumps the version and adds an annotated tag that CI turns into a GitHub release. A patch release starts from the tag (or a release/x.y branch) and takes fixes by cherry-pick, so unfinished work never ships; the fix still reaches main through its own PR.',
    lesson: 'Changelog, version, annotated tag, push both; patches start from the tag.',
  },
  root: [
    ...productionRepo({ remote: true }),
    'git switch -q feature/offline-cache',
    // ponytail: JSON.stringify quotes setup content (no tabs or control characters in it).
    `edit ${CONFLICT_TS} ${JSON.stringify(FIXED_CONFLICT)}`,
    `${as('samir')} git commit -q -am "${TIE_FIX}"`,
    'git push -q origin feature/offline-cache',
    'git switch -q main',
  ],
  prelude: [],
  reference: [
    `edit CHANGELOG.md ${JSON.stringify(CHANGELOG_130)}`,
    `edit package.json ${JSON.stringify(PACKAGE_130)}`,
    'git commit -am "chore(release): 1.3.0"',
    'git tag -a v1.3.0 -m "Nova 1.3.0"',
    'git push origin main v1.3.0',
    'git switch -c hotfix/1.3.1 v1.3.0',
    'git cherry-pick feature/offline-cache',
    'git tag -a v1.3.1 -m "Nova 1.3.1"',
    'git push origin hotfix/1.3.1 v1.3.1',
  ],
  alternatives: [
    [
      `edit CHANGELOG.md ${JSON.stringify(NOVA_FILES['CHANGELOG.md']!.replace(UNRELEASED, `${UNRELEASED}\n\n## [1.3.0] - 2026-01-06`))}`,
      `edit package.json ${JSON.stringify(PACKAGE_130)}`,
      'git add CHANGELOG.md package.json',
      'git commit -m "chore(release): v1.3.0"',
      'git tag -a v1.3.0 -m "Release 1.3.0"',
      'git push --follow-tags',
      'git switch -c hotfix/1.3.1 v1.3.0',
      'git cherry-pick origin/feature/offline-cache',
      `edit package.json ${JSON.stringify(PACKAGE_130.replace('"version": "1.3.0"', '"version": "1.3.1"'))}`,
      'git commit -am "chore(release): 1.3.1"',
      'git tag v1.3.1',
      'git push -u origin hotfix/1.3.1',
      'git push origin v1.3.1',
    ],
  ],
};

export const level8: Level = {
  id: 'team',
  number: 8,
  title: 'Team workflows',
  topics: 'GitHub Flow, Conventional Commits, atomic commits, releases, hotfixes',
  planned: 6,
  remote: true,
  root: ROOT_COMMANDS,
  missions: [githubFlow, conventional, atomic, release, hotfix, ship130],
};

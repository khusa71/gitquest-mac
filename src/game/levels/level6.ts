/**
 * Level 6 — Advanced and internals: worktrees, hooks, line endings, objects, notes, trailers, submodules.
 * The repo lives at ~/GitQuest/nova, so `../name` siblings land in ~/GitQuest/<name>.
 */
import { allOf, check, commitsSince, headBranch, headFile, snapshotOf, workingFile } from '../validate';

import type { Commit, RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';
import { NOVA_FILES, productionRepo } from '../production';

// Story file contents ------------------------------------------------------

export const FILES = {
  appBug: "export const title = 'Nova Notz';",
  appFixed: "export const title = 'Nova Notes';",
  editor: "export const editor = 'plain';",
  editorWip: "export const editor = 'markdown'; // WIP: toolbar",
  syncDirty: "export const sync = () => queue.flush();\n// TODO: drop the debug key\nexport const API_KEY = 'sk-live-4242';",
  sync: 'export const sync = () => queue.flush();',
  draft: 'Nova manifesto: your notes stay on your Mac. Sync is optional, export is always free.',
  search: 'export const search = (q: string) => index.query(q.toLowerCase());',
  tags: 'export const tags = (note: Note) => [...note.tags].sort();',
  icons: 'star\npin\narchive',
} as const;

/** `git hash-object` of FILES.draft (+ the trailing newline `edit` writes). Content-addressed, so stable everywhere. */
export const DRAFT_BLOB = 'd1f56edc3f083e3a8b4f8087e8bcc16ccaad213c';

/** pre-commit hook: refuse added lines that contain TODO or API_KEY. `\n` is a newline for `edit`. */
export const HOOK = [
  '#!/bin/sh',
  "if git diff --cached -U0 | grep '^+' | grep -qE 'TODO|API_KEY'; then",
  "  echo 'pre-commit: remove the TODO or API_KEY before committing.' >&2",
  '  exit 1',
  'fi',
].join('\\n');

const ROOT_COMMANDS: readonly string[] = [
  'git init -b main',
  'edit README.md "# Nova notes app"',
  `edit app.ts "${FILES.appBug}"`,
  `edit editor.ts "${FILES.editor}"`,
  'git add .',
  'git commit -m "Initial commit"',
];

// Helpers ------------------------------------------------------------------

const BAD = /TODO|API_KEY/;

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

/** New commits on main's history (ignores notes commits and other branches). */
function newOnMain(state: RepoState, ctx: MissionContext): Commit[] {
  const onMain = reachable(state, state.branches['main']);
  return commitsSince(state, ctx).filter((commit) => onMain.has(commit.hash));
}

function introduces(state: RepoState, commit: Commit, path: string, content: string): boolean {
  const parent = commit.parents[0] === undefined ? undefined : state.commits[commit.parents[0]];
  return commit.snapshot[path] === content && parent?.snapshot[path] !== content;
}

// Missions -----------------------------------------------------------------

const hotfixHasFix = (state: RepoState, ctx: MissionContext): boolean => {
  const tip = state.branches['hotfix'];
  return tip !== undefined && !ctx.entryCommits.has(tip) && state.commits[tip]?.snapshot['app.ts'] === FILES.appFixed;
};

const worktreeHotfix: Mission = {
  id: 'worktree-hotfix',
  number: '6.1',
  title: 'A second desk',
  story:
    'You are halfway through the Markdown editor in editor.ts when Lea pings: the app title says "Nova Notz" in production. You do not want to stash or commit half-done work. Open a second working folder next to nova, fix the title there, and put it away.',
  goal: 'Fix app.ts on a new hotfix branch inside a ../nova-hotfix worktree, then remove the worktree, without touching your WIP.',
  outcome: {
    summary:
      'The title fix is committed on its own hotfix branch, made in a second folder that is already gone, while your half-done editor work sits untouched in nova. That is how you answer an urgent bug without stashing or committing work in progress.',
    expect: {
      kind: 'terminal',
      command: 'git branch -v',
      output: '  hotfix 96a8e47 fix: app title\n* main   2330464 Initial commit',
    },
  },
  checks: [
    {
      label: 'Commit the title fix on the hotfix branch',
      proof: 'git log --oneline main..hotfix',
      done: hotfixHasFix,
    },
    {
      label: 'Keep your editor.ts WIP untouched on main',
      proof: 'git status --short',
      done: (state, ctx) =>
        hotfixHasFix(state, ctx) && headBranch(state) === 'main' && workingFile(state, 'editor.ts') === FILES.editorWip,
    },
    {
      label: 'Remove the nova-hotfix worktree',
      proof: 'git worktree list',
      done: (state, ctx) => hotfixHasFix(state, ctx) && Object.keys(state.worktrees).length === 1,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(state.branches['hotfix'] !== undefined, 'Create the hotfix branch with git worktree add ../nova-hotfix -b hotfix.'),
      check(hotfixHasFix(state, ctx), `Commit app.ts with ${FILES.appFixed} on the hotfix branch.`),
      check(
        !ctx.facts.reflog.some((entry) => entry.action.startsWith('checkout: moving from main to hotfix')),
        'You switched this folder to hotfix. The point is to leave main alone: Undo, then use git worktree add.',
      ),
      check(headBranch(state) === 'main', 'This folder (nova) must stay on main.'),
      check(workingFile(state, 'editor.ts') === FILES.editorWip, 'Your editor.ts WIP must stay uncommitted in nova.'),
      check(Object.keys(state.worktrees).length === 1, 'Remove the extra worktree with git worktree remove ../nova-hotfix.'),
    ),
  hints: [
    'A worktree is a second folder attached to the same repository, with its own branch checked out.',
    'Create it with git worktree add, commit the fix from inside it, then come back to nova and remove it.',
    'git worktree add ../nova-hotfix -b hotfix, cd ../nova-hotfix, nano app.ts (Nova Notes), git commit -am "fix: app title", cd ../nova, git worktree remove ../nova-hotfix.',
  ],
  par: 4,
  takeaway: 'A worktree gives a branch its own folder, so an urgent fix never disturbs the work in progress next door.',
  theory: {
    title: 'One repository, several folders',
    body: 'git worktree add <path> -b <branch> creates a new folder that shares the same history but has its own branch, index and files. A branch can be checked out in only one worktree at a time. When you are done, git worktree remove deletes the folder; the branch and its commits stay.',
    lesson: 'Need a second branch right now? Open a worktree instead of stashing.',
  },
  prelude: [{ id: 'm6.1-p1', commands: [`edit editor.ts "${FILES.editorWip}"`] }],
  reference: [
    'git worktree add ../nova-hotfix -b hotfix',
    `edit ../nova-hotfix/app.ts "${FILES.appFixed}"`,
    'git -C ../nova-hotfix commit -am "fix: app title"',
    'git worktree remove ../nova-hotfix',
  ],
  alternatives: [
    [
      'git worktree add -b hotfix ../nova-hotfix main',
      `edit ../nova-hotfix/app.ts "${FILES.appFixed}"`,
      'git -C ../nova-hotfix add app.ts',
      'git -C ../nova-hotfix commit -m "fix(app): correct the title"',
      'git worktree remove ../nova-hotfix',
    ],
  ],
};

const syncCommitted = (state: RepoState): boolean => {
  const sync = headFile(state, 'sync.ts');
  return sync !== undefined && !BAD.test(sync);
};

const preCommitHook: Mission = {
  id: 'pre-commit-hook',
  number: '6.2',
  title: 'A guard at the door',
  story:
    'Last week a live API key reached the Nova history and Samir spent an afternoon rotating it. sync.ts is staged right now with a TODO and a debug key in it. Install a pre-commit hook that refuses such lines, then commit a clean sync.ts.',
  goal: 'Write an executable .git/hooks/pre-commit that blocks TODO and API_KEY, then commit sync.ts without them.',
  outcome: {
    summary:
      'A pre-commit hook now refuses any commit that adds a TODO or an API key, and sync.ts is committed clean. A local guard like this stops a secret before it ever reaches shared history.',
    expect: { kind: 'file', path: '.git/hooks/pre-commit', content: HOOK.replaceAll('\\n', '\n') },
  },
  checks: [
    {
      label: 'Install an executable pre-commit hook',
      proof: 'git hook run pre-commit',
      done: (_state, ctx) => ctx.facts.hooks.includes('pre-commit'),
    },
    {
      label: 'Commit sync.ts without the TODO and the key',
      proof: 'git show HEAD:sync.ts',
      done: syncCommitted,
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.hooks.includes('pre-commit'), 'Create .git/hooks/pre-commit and make it executable with chmod +x.'),
      check(
        !commitsSince(state, ctx).some((commit) => Object.values(commit.snapshot).some((text) => BAD.test(text))),
        'A new commit contains TODO or API_KEY. Undo it: the hook is there to stop exactly that.',
      ),
      check(headFile(state, 'sync.ts') !== undefined, 'Commit sync.ts.'),
      check(syncCommitted(state), 'Remove the TODO line and the API_KEY line from sync.ts before committing.'),
      check(headBranch(state) === 'main', 'Stay on main.'),
    ),
  hints: [
    'Hooks are scripts in .git/hooks named after the moment they run. A pre-commit hook that exits 1 cancels the commit.',
    'Write a sh script that greps the staged diff (git diff --cached) for TODO|API_KEY and exits 1 on a match, chmod +x it, then clean sync.ts.',
    'nano .git/hooks/pre-commit with: #!/bin/sh / if git diff --cached -U0 | grep \'^+\' | grep -qE \'TODO|API_KEY\'; then exit 1; fi — then chmod +x .git/hooks/pre-commit, try git commit (blocked), delete the two bad lines from sync.ts, git add sync.ts, git commit -m "feat(sync): flush the offline queue".',
  ],
  par: 5,
  takeaway: 'A pre-commit hook runs before every commit on this machine and can refuse it, so secrets are stopped before they enter history.',
  theory: {
    title: 'Git hooks',
    body: 'Git runs executable scripts from .git/hooks at fixed moments: pre-commit before the commit is made, commit-msg after the message is written, pre-push before a push. A non-zero exit code aborts the operation. Hooks are not committed or cloned, so teams keep them in a folder like .githooks and set core.hooksPath; git commit --no-verify skips them.',
    lesson: 'pre-commit exits 1 → no commit.',
  },
  prelude: [
    {
      id: 'm6.2-p1',
      when: (state) => workingFile(state, 'editor.ts') === headFile(state, 'editor.ts'),
      commands: ['git add editor.ts', 'git commit -m "feat(editor): markdown mode"'],
    },
    { id: 'm6.2-p2', commands: [`edit sync.ts "${FILES.syncDirty}"`, 'git add sync.ts'] },
  ],
  reference: [
    `edit .git/hooks/pre-commit "${HOOK}"`,
    'chmod +x .git/hooks/pre-commit',
    `edit sync.ts "${FILES.sync}"`,
    'git add sync.ts',
    'git commit -m "feat(sync): flush the offline queue"',
  ],
  alternatives: [
    [
      `edit sync.ts "${FILES.sync}"`,
      `edit .git/hooks/pre-commit "${HOOK}"`,
      'chmod +x .git/hooks/pre-commit',
      'git commit -am "feat(sync): offline queue"',
    ],
  ],
};

const EOL_RULE = /^\*\s+(?=.*\btext=auto\b)(?=.*\beol=lf\b)/m;

const gitattributes: Mission = {
  id: 'gitattributes-eol',
  number: '6.3',
  title: 'Every line changed?!',
  story:
    'Yanis works on Windows. His last pull request showed every single line of sync.ts as changed, only because his editor saved CRLF line endings. Settle it for everyone with a committed rule instead of asking each laptop to configure itself.',
  goal: 'Commit a .gitattributes file with the rule * text=auto eol=lf.',
  outcome: {
    summary:
      'A committed .gitattributes tells every clone to store text files with LF line endings. Windows and Mac teammates stop producing diffs where every line looks changed.',
    expect: {
      kind: 'terminal',
      command: 'git check-attr text eol -- sync.ts',
      output: 'sync.ts: text: auto\nsync.ts: eol: lf',
    },
  },
  checks: [
    {
      label: 'Write the rule * text=auto eol=lf in .gitattributes',
      proof: 'git check-attr text eol -- sync.ts',
      done: (state) => EOL_RULE.test(workingFile(state, '.gitattributes') ?? ''),
    },
    {
      label: 'Commit .gitattributes',
      proof: 'git show HEAD:.gitattributes',
      done: (state) => EOL_RULE.test(headFile(state, '.gitattributes') ?? ''),
    },
  ],
  validate: (state) =>
    allOf(
      check(workingFile(state, '.gitattributes') !== undefined, 'Create a .gitattributes file at the root of the repo.'),
      check(EOL_RULE.test(workingFile(state, '.gitattributes') ?? ''), 'Put the line * text=auto eol=lf in .gitattributes.'),
      check(EOL_RULE.test(headFile(state, '.gitattributes') ?? ''), 'Commit .gitattributes so every clone gets the rule.'),
      check(headBranch(state) === 'main', 'Stay on main.'),
    ),
  hints: [
    'Line endings are a property of the repository, not of each laptop, when you describe them in a committed file.',
    'A .gitattributes line has a pattern then attributes: * matches every file, text=auto lets git detect text, eol=lf picks LF on disk.',
    'echo "* text=auto eol=lf" > .gitattributes, git add .gitattributes, git commit -m "chore: normalize line endings" (then git add --renormalize . for files already committed).',
  ],
  par: 3,
  takeaway: 'A committed .gitattributes makes git store text with LF for everyone, whatever editor or OS they use.',
  theory: {
    title: 'Line endings',
    body: 'Windows editors end lines with CRLF, macOS and Linux with LF, and a file whose endings flip shows up as entirely changed. With * text=auto, git stores text files with LF in the repository; eol=lf also writes LF on disk. After adding the rule, git add --renormalize . rewrites files that were already committed with CRLF.',
    lesson: 'Line endings belong in .gitattributes, committed.',
  },
  prelude: [],
  reference: ['edit .gitattributes "* text=auto eol=lf"', 'git add .gitattributes', 'git commit -m "chore: normalize line endings"'],
  alternatives: [
    [
      'edit .gitattributes "* text=auto eol=lf"',
      'git add .gitattributes',
      'git add --renormalize .',
      'git commit -m "chore: line endings"',
    ],
  ],
};

const openTheBox: Mission = {
  id: 'open-the-box',
  number: '6.4',
  title: 'Open the box',
  story: `Lea saved her manifesto with git hash-object -w draft.md, then deleted the file by mistake. The content still sits in .git/objects as blob ${DRAFT_BLOB.slice(0, 7)}. Samir does not believe a blob is the whole file and not a diff: show him.`,
  goal: `Read blob ${DRAFT_BLOB.slice(0, 7)} with git cat-file, restore it as draft.md and commit it.`,
  outcome: {
    summary:
      "Lea's lost manifesto is back as draft.md and committed, straight from the blob git kept in its object store. The same hash in the tree shows that git stores whole file contents, not diffs.",
    expect: {
      kind: 'terminal',
      command: 'git ls-tree HEAD draft.md',
      output: '100644 blob d1f56edc3f083e3a8b4f8087e8bcc16ccaad213c\tdraft.md',
    },
  },
  checks: [
    {
      label: `Restore draft.md from blob ${DRAFT_BLOB.slice(0, 7)}`,
      proof: `git cat-file -p ${DRAFT_BLOB.slice(0, 7)}`,
      done: (state) => workingFile(state, 'draft.md') === FILES.draft,
    },
    {
      label: 'Commit the recovered draft',
      proof: 'git ls-tree HEAD draft.md',
      done: (state) => headFile(state, 'draft.md') === FILES.draft,
    },
  ],
  validate: (state) =>
    allOf(
      check(workingFile(state, 'draft.md') !== undefined, `Write the content of blob ${DRAFT_BLOB.slice(0, 7)} into draft.md.`),
      check(workingFile(state, 'draft.md') === FILES.draft, `draft.md must contain exactly what git cat-file -p ${DRAFT_BLOB.slice(0, 7)} prints.`),
      check(headFile(state, 'draft.md') === FILES.draft, 'Commit draft.md.'),
      check(headBranch(state) === 'main', 'Stay on main.'),
    ),
  hints: [
    'Every file version git ever stored is a blob object, named by the hash of its content.',
    `git cat-file -t ${DRAFT_BLOB.slice(0, 7)} tells you the type, git cat-file -p prints the content. git cat-file -p HEAD then git ls-tree HEAD show the commit → tree → blob chain.`,
    `git cat-file -p ${DRAFT_BLOB.slice(0, 7)} > draft.md, git add draft.md, git commit -m "docs: restore the manifesto draft".`,
  ],
  par: 3,
  takeaway: 'Git stores whole snapshots: a commit points to a tree, a tree lists blobs, and each blob is a full file named by its hash.',
  theory: {
    title: 'Blobs, trees and commits',
    body: 'Inside .git/objects there are three main kinds of objects: a blob holds one file content, a tree lists names with the blobs and subtrees they point to, and a commit points to one tree plus its parents. git cat-file -t shows an object type, git cat-file -p prints it, and git ls-tree lists a tree. Same content always gives the same hash, which is why identical files are stored once.',
    lesson: 'commit → tree → blob, all named by their content hash.',
  },
  prelude: [
    {
      id: 'm6.4-p1',
      teammate: 'lea',
      commands: [`edit draft.md "${FILES.draft}"`, 'git hash-object -w draft.md', 'rm draft.md'],
    },
  ],
  reference: [`edit draft.md "${FILES.draft}"`, 'git add draft.md', 'git commit -m "docs: restore the manifesto draft"'],
  alternatives: [
    [
      `git update-index --add --cacheinfo 100644,${DRAFT_BLOB},draft.md`,
      'git commit -m "docs: restore the manifesto draft"',
      'git restore draft.md',
    ],
  ],
};

const perfCommit = (state: RepoState, ctx: MissionContext): Commit | undefined =>
  Object.values(state.commits).find(
    (commit) => ctx.entryCommits.has(commit.hash) && commit.message === 'perf(search): query the index',
  );

const noted = (state: RepoState, ctx: MissionContext): boolean => {
  const target = perfCommit(state, ctx);
  return target !== undefined && ctx.facts.notes.includes(target.hash);
};

const gitNotes: Mission = {
  id: 'git-notes',
  number: '6.5',
  title: 'Sticky notes',
  story:
    'Samir just committed a faster search. Ines ran the QA pass and wants the result attached to that exact commit, but rewriting it would change its hash and confuse everyone who already has it.',
  goal: "Attach a note with the QA result to Samir's perf commit without changing the commit.",
  outcome: {
    summary:
      "Samir's commit carries Ines's QA result as a note, and its hash is exactly the one everyone already has. Notes let you annotate shared history without rewriting it.",
    expect: {
      kind: 'terminal',
      command: 'git log --oneline --notes -1',
      output: '6985d76 (HEAD -> main) perf(search): query the index\nNotes:\n    QA: passed on macOS 15',
    },
  },
  checks: [
    {
      label: "Attach a note to Samir's perf commit",
      proof: 'git log -1 --notes',
      done: noted,
    },
    {
      label: 'Keep the commit hash unchanged',
      proof: 'git log --oneline -1',
      done: (state, ctx) => noted(state, ctx) && reachable(state, state.branches['main']).has(perfCommit(state, ctx)!.hash),
    },
  ],
  validate: (state, ctx) => {
    const target = perfCommit(state, ctx);
    return allOf(
      check(target !== undefined, "Samir's commit perf(search): query the index is missing."),
      check(
        target !== undefined && reachable(state, state.branches['main']).has(target.hash),
        "main no longer contains Samir's original commit. Undo the amend: notes exist so you never have to rewrite.",
      ),
      check(noted(state, ctx), 'Add a note to that commit with git notes add -m "…".'),
    );
  },
  hints: [
    'Git can attach extra text to a commit, stored outside the commit itself.',
    'git notes add -m "<text>" <commit> writes a note; git log shows it under the message.',
    'git notes add -m "QA: passed on macOS 15" HEAD.',
  ],
  par: 1,
  takeaway: 'git notes adds information to a commit after the fact without changing its hash.',
  theory: {
    title: 'Git notes',
    body: 'A note is a piece of text stored under refs/notes/commits and linked to a commit, so the commit itself and its hash stay untouched. git log shows notes below the message, git notes show <commit> prints one. Notes are not pushed by default: git push origin refs/notes/* shares them.',
    lesson: 'Annotate history without rewriting it: git notes add.',
  },
  prelude: [
    {
      id: 'm6.5-p1',
      teammate: 'samir',
      commands: [`edit search.ts "${FILES.search}"`, 'git add search.ts', 'git commit -m "perf(search): query the index"'],
    },
  ],
  reference: ['git notes add -m "QA: passed on macOS 15" HEAD'],
  alternatives: [['git notes add -m "QA by Ines: search under 2 ms" main']],
};

const SIGNED_OFF = /^Signed-off-by: .+ <[^>]+>$/m;
const CO_AUTHOR = /^Co-authored-by: Ines Bouvet <ines@nova\.dev>$/im;

const tagsCommit = (state: RepoState, ctx: MissionContext): Commit | undefined =>
  newOnMain(state, ctx).find((commit) => introduces(state, commit, 'tags.ts', FILES.tags));

const trailers: Mission = {
  id: 'commit-trailers',
  number: '6.6',
  title: 'Sign your work',
  story:
    'You and Ines pair-programmed tags.ts this morning. Nova asks every commit to carry a Signed-off-by line, and pairing credit goes in a Co-authored-by line so GitHub shows both faces.',
  goal: 'Commit tags.ts with a Signed-off-by trailer (-s) and Co-authored-by: Ines Bouvet <ines@nova.dev>.',
  outcome: {
    summary:
      'The tags.ts commit ends with a Signed-off-by line for you and a Co-authored-by line for Ines. Projects that require sign-off accept it, and GitHub credits both of you.',
    expect: {
      kind: 'terminal',
      command: 'git log -1 --format=%B',
      output: 'feat(tags): sort note tags\n\nCo-authored-by: Ines Bouvet <ines@nova.dev>\nSigned-off-by: You <you@example.com>',
    },
  },
  checks: [
    { label: 'Commit tags.ts', proof: 'git show --stat HEAD', done: (state, ctx) => tagsCommit(state, ctx) !== undefined },
    {
      label: 'Sign off the commit with -s',
      proof: 'git log -1 --format=%(trailers)',
      done: (state, ctx) => SIGNED_OFF.test(tagsCommit(state, ctx)?.message ?? ''),
    },
    {
      label: 'Credit Ines with a Co-authored-by trailer',
      proof: 'git log -1 --format=%(trailers)',
      done: (state, ctx) => CO_AUTHOR.test(tagsCommit(state, ctx)?.message ?? ''),
    },
  ],
  validate: (state, ctx) => {
    const commit = tagsCommit(state, ctx);
    return allOf(
      check(commit !== undefined, 'Commit tags.ts on main.'),
      check(SIGNED_OFF.test(commit?.message ?? ''), 'The tags.ts commit needs a Signed-off-by line: commit with -s (or amend with --amend -s).'),
      check(
        CO_AUTHOR.test(commit?.message ?? ''),
        'Add the trailer Co-authored-by: Ines Bouvet <ines@nova.dev> on its own line at the end of the message.',
      ),
    );
  },
  hints: [
    'Trailers are "Key: value" lines at the very end of a commit message, after a blank line.',
    '-s appends Signed-off-by with your name. A second -m adds a paragraph, which can be the Co-authored-by line.',
    'git add tags.ts, git commit -s -m "feat(tags): sort note tags" -m "Co-authored-by: Ines Bouvet <ines@nova.dev>".',
  ],
  par: 2,
  takeaway: 'Trailers like Signed-off-by and Co-authored-by sit at the end of the message and tools read them as data.',
  theory: {
    title: 'Commit trailers',
    body: 'A trailer is a "Key: value" line in the last paragraph of a commit message. git commit -s adds Signed-off-by, the Developer Certificate of Origin that many projects require, and --trailer "Key: value" adds any other. GitHub reads Co-authored-by to credit pair programmers; signing with a key (commit -S) is a different, cryptographic thing.',
    lesson: 'git commit -s and Co-authored-by: credit is data.',
  },
  prelude: [{ id: 'm6.6-p1', commands: [`edit tags.ts "${FILES.tags}"`] }],
  reference: [
    'git add tags.ts',
    'git commit -s -m "feat(tags): sort note tags" -m "Co-authored-by: Ines Bouvet <ines@nova.dev>"',
  ],
  alternatives: [
    ['git add tags.ts', 'git commit -s -m "feat(tags): sort tags" --trailer "Co-authored-by: Ines Bouvet <ines@nova.dev>"'],
  ],
};

const ICONS_URL = 'https://git.nova.example/icons.git';
const GITMODULES_ICONS = /path\s*=\s*icons\s*$/m;

const submodule: Mission = {
  id: 'submodule-icons',
  number: '6.7',
  title: 'A repo in a repo',
  story: `Lea cloned the icon set, which has its own repository at ${ICONS_URL}, straight into icons/ inside nova. git status only shows icons/ as untracked, and a plain git add would store a pointer that nobody else can clone. Register it properly so every teammate gets the same icon version.`,
  goal: `Turn icons/ into a submodule with the URL ${ICONS_URL} and commit it.`,
  outcome: {
    summary:
      'icons/ is a registered submodule: nova records where the icon repository lives and the exact icon commit it uses. Every teammate who clones nova can fetch that same icon version.',
    expect: {
      kind: 'terminal',
      command: 'git submodule status',
      output: ' 9818c9c125d4060452c3a74fd7049ba8b51ec9de icons (heads/main)',
    },
  },
  checks: [
    {
      label: 'Register icons/ as a submodule',
      proof: 'git submodule status',
      done: (_state, ctx) => ctx.facts.submodules.includes('icons'),
    },
    {
      label: 'Commit .gitmodules and the submodule pointer',
      proof: 'git show --stat HEAD',
      done: (state) => GITMODULES_ICONS.test(headFile(state, '.gitmodules') ?? ''),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        ctx.facts.submodules.includes('icons'),
        `Register it with git submodule add ${ICONS_URL} icons (if you already ran git add icons, undo it with git rm --cached -f icons first).`,
      ),
      check(GITMODULES_ICONS.test(headFile(state, '.gitmodules') ?? ''), 'Commit .gitmodules together with icons.'),
      check(/url\s*=\s*\S/.test(headFile(state, '.gitmodules') ?? ''), '.gitmodules needs the url of the icon repository.'),
      check(headBranch(state) === 'main', 'Stay on main.'),
    ),
  hints: [
    'A submodule is a pointer to one commit of another repository, plus its URL in .gitmodules so clones can fetch it.',
    'git submodule add <url> <path> on a folder that already holds a repository reuses it and stages .gitmodules and the pointer, with no download.',
    `git submodule add ${ICONS_URL} icons, then git commit -m "chore: add icons submodule".`,
  ],
  par: 2,
  takeaway: 'A submodule pins another repository at one exact commit and records where to clone it from.',
  theory: {
    title: 'Submodules',
    body: 'git add on a nested repository only stores a commit pointer with no URL, and git warns about an embedded repository. git submodule add also writes .gitmodules with the URL, so a fresh clone can run git submodule update --init. Since git 2.38 local file:// submodules are refused unless protocol.file.allow=always is set, a guard against malicious repositories.',
    lesson: 'A submodule is a commit pointer plus a URL, not a copy.',
  },
  prelude: [
    {
      id: 'm6.7-p1',
      teammate: 'lea',
      commands: [
        'git init -b main icons',
        `edit icons/icons.txt "${FILES.icons}"`,
        'git -C icons add icons.txt',
        'git -C icons commit -m "Icon set v1"',
      ],
    },
  ],
  reference: [`git submodule add ${ICONS_URL} icons`, 'git commit -m "chore: add icons submodule"'],
  alternatives: [
    ['git add icons', 'git rm --cached -f -q icons', `git submodule add ${ICONS_URL} icons`, 'git commit -m "chore(icons): pin the icon set"'],
  ],
};

// Capstone: hotfix without losing your place (standalone, on the Nova production repo) ---

/** Double-quoted setup argument (`\n` = newline for edit). */
const q = (text: string) => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

const APP_TSX = 'apps/web/src/App.tsx';
const ONBOARDING_TSX = 'apps/web/src/onboarding.tsx';
const EDITOR_TSX = 'apps/web/src/editor.tsx';
const WIP_APP = NOVA_FILES[APP_TSX]!.replace('      <h1>{route.title}</h1>\n', '      <h1>{route.title}</h1>\n      <Onboarding step={1} />\n');
const WIP_ONBOARDING = "// WIP: first-run tour, not wired up yet\nexport function Onboarding({ step }: { step: number }) {\n  return <aside className=\"onboarding\">Step {step} of 3</aside>;\n}";
const TRIM_FIX = 'payload: value.trimEnd()';
/** Files a patch release may touch besides the fix itself. */
const RELEASE_FILES = new Set([EDITOR_TSX, 'CHANGELOG.md', 'package.json']);

const SECRET_HOOK = [
  '#!/bin/sh',
  "if git diff --cached -U0 | grep '^+' | grep -q 'sk_test_'; then",
  "  echo 'pre-commit: a sk_test_ key is staged. Remove it and use .env (ignored).' >&2",
  '  exit 1',
  'fi',
].join('\n');

/** release/1.2 got the whitespace fix in a new commit on top of v1.2.0, and nothing from main besides it. */
function releaseFixed(state: RepoState, ctx: MissionContext): boolean {
  const tip = state.branches['release/1.2'];
  const v120 = ctx.facts.tags.find((tag) => tag.name === 'v1.2.0')?.target;
  if (tip === undefined || v120 === undefined || ctx.entryCommits.has(tip) || !reachable(state, tip).has(v120)) return false;
  const before = snapshotOf(state, v120);
  const after = snapshotOf(state, tip);
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return (after[EDITOR_TSX] ?? '').includes(TRIM_FIX) && [...paths].every((path) => RELEASE_FILES.has(path) || before[path] === after[path]);
}

const patchTagged = (state: RepoState, ctx: MissionContext): boolean => {
  const tag = ctx.facts.tags.find((t) => t.name === 'v1.2.1');
  return releaseFixed(state, ctx) && tag?.annotated === true && tag.target === state.branches['release/1.2'];
};

/** This folder is back on main with the WIP exactly as it was: uncommitted, nothing extra left around. */
const wipIntact = (state: RepoState, ctx: MissionContext): boolean =>
  headBranch(state) === 'main' &&
  ctx.entryCommits.has(state.branches['main'] ?? '') &&
  headFile(state, APP_TSX) === NOVA_FILES[APP_TSX] &&
  workingFile(state, APP_TSX) === WIP_APP &&
  workingFile(state, ONBOARDING_TSX) === WIP_ONBOARDING;

const hotfixWithoutLosingYourPlace: Mission = {
  id: 'hotfix-without-losing-your-place',
  number: '6.8',
  title: 'Capstone: hotfix without losing your place',
  capstone: true,
  story:
    'You are mid-way through the onboarding tour on main (App.tsx edited, onboarding.tsx not even added) when support escalates: Nova 1.2 users get sync conflicts because trailing spaces are saved. Ines already fixed it on main, so 1.2 needs a 1.2.1 patch now. Last month a test key also slipped into a commit, so Lea wants a local guard against sk_test_ keys before anyone commits again.',
  goal: 'Ship v1.2.1 from release/1.2 with the trailing-whitespace fix from a separate worktree, remove that worktree, keep your main WIP untouched, and install a pre-commit hook that blocks sk_test_ keys.',
  outcome: {
    summary:
      'Nova 1.2.1 is tagged on release/1.2 with only the whitespace fix, built in a folder you have already removed, while your onboarding work waits uncommitted on main. A pre-commit hook now blocks test keys before they reach a commit.',
    expect: {
      kind: 'terminal',
      command: 'git log --oneline -2 release/1.2',
      output: '5463123 (tag: v1.2.1, release/1.2) fix(web): trim trailing whitespace when a note is saved\na31e888 (tag: v1.2.0) chore(release): 1.2.0',
    },
  },
  checks: [
    {
      label: 'release/1.2 has the trailing-whitespace fix, and nothing else from main',
      proof: 'git log --oneline v1.2.0..release/1.2',
      done: releaseFixed,
    },
    {
      label: 'v1.2.1 is an annotated tag on the fixed release/1.2',
      proof: 'git show --no-patch v1.2.1',
      done: patchTagged,
    },
    {
      label: 'Back on main with your WIP untouched and no extra worktree left',
      proof: 'git worktree list',
      done: (state, ctx) =>
        releaseFixed(state, ctx) && wipIntact(state, ctx) && Object.keys(state.worktrees).length === 1 && ctx.facts.stashes.length === 0,
    },
    {
      label: 'A pre-commit hook guards against sk_test_ keys',
      proof: 'git hook run pre-commit',
      done: (_state, ctx) => ctx.facts.hooks.includes('pre-commit'),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(ctx.facts.inProgress === null, `A ${ctx.facts.inProgress ?? 'git'} is still in progress. Finish it (--continue) or cancel it (--abort).`),
      check(
        (snapshotOf(state, state.branches['release/1.2'])[EDITOR_TSX] ?? '').includes(TRIM_FIX),
        'release/1.2 does not have the fix yet. Ines\'s commit "fix(web): trim trailing whitespace when a note is saved" is on main: bring it over.',
      ),
      check(
        releaseFixed(state, ctx),
        'release/1.2 must get only the fix, as a new commit on top of v1.2.0. Do not merge main into it: 1.2.1 must not ship unreleased features.',
      ),
      check(ctx.facts.tags.some((tag) => tag.name === 'v1.2.1'), 'Tag the release: git tag -a v1.2.1 -m "Nova 1.2.1" on release/1.2.'),
      check(
        patchTagged(state, ctx),
        'v1.2.1 must be an annotated tag (-a -m) on the tip of release/1.2. Delete it with git tag -d v1.2.1 and tag again.',
      ),
      check(headBranch(state) === 'main', 'This folder must end on main, where your onboarding work lives.'),
      check(
        ctx.entryCommits.has(state.branches['main'] ?? '') && headFile(state, APP_TSX) === NOVA_FILES[APP_TSX],
        'Your onboarding WIP ended up in a commit on main. It was not ready: keep it uncommitted.',
      ),
      check(
        workingFile(state, APP_TSX) === WIP_APP && workingFile(state, ONBOARDING_TSX) === WIP_ONBOARDING,
        'Your onboarding WIP (App.tsx and onboarding.tsx) is not in this folder any more. If you stashed it, git stash pop.',
      ),
      check(ctx.facts.stashes.length === 0, 'A stash is left over. Pop or drop it so nothing is forgotten.'),
      check(Object.keys(state.worktrees).length === 1, 'Remove the release worktree with git worktree remove <path>; the commits and tag stay.'),
      check(ctx.facts.hooks.includes('pre-commit'), 'Install an executable .git/hooks/pre-commit that refuses staged lines containing sk_test_.'),
    ),
  hints: [
    'Do not touch this folder: give release/1.2 its own folder, borrow the fix that is already on main, tag the patch, then put that folder away. The secret guard is a script Git runs before every commit.',
    'git worktree add <path> release/1.2 checks the release out next door; cherry-pick Ines\'s whitespace fix there (git log --oneline -5 main shows it), tag it annotated, git worktree remove <path>. Then write .git/hooks/pre-commit and chmod +x it.',
    'git worktree add ../nova-1.2 release/1.2, cd ../nova-1.2, git cherry-pick main~2, git tag -a v1.2.1 -m "Nova 1.2.1", cd ../nova, git worktree remove ../nova-1.2, nano .git/hooks/pre-commit (if git diff --cached -U0 | grep \'^+\' | grep -q sk_test_; then exit 1; fi), chmod +x .git/hooks/pre-commit.',
  ],
  par: 6,
  takeaway: 'A worktree lets you cut a patch release next to half-done work, and a pre-commit hook stops secrets before they ever reach history.',
  theory: {
    title: 'Advanced Git, in production',
    body: 'Worktrees give each branch its own folder, so a release hotfix never forces you to stash or commit half-done work, and cherry-pick backports one fix without dragging main\'s features into a patch release. Hooks run on your machine only and are not cloned, so teams keep them in a tracked folder (core.hooksPath) and still rely on server-side secret scanning. Annotated tags carry who released what and when.',
    lesson: 'One folder per branch in flight; hooks guard your commits, tags name your releases.',
  },
  root: [...productionRepo({ remote: false }), `edit ${APP_TSX} ${q(WIP_APP)}`, `edit ${ONBOARDING_TSX} ${q(WIP_ONBOARDING)}`],
  prelude: [],
  reference: [
    'git worktree add ../nova-1.2 release/1.2',
    'git -C ../nova-1.2 cherry-pick main~2',
    'git -C ../nova-1.2 tag -a v1.2.1 -m "Nova 1.2.1"',
    'git worktree remove ../nova-1.2',
    `edit .git/hooks/pre-commit ${q(SECRET_HOOK)}`,
    'chmod +x .git/hooks/pre-commit',
  ],
  alternatives: [
    [
      `edit .git/hooks/pre-commit ${q(SECRET_HOOK)}`,
      'chmod +x .git/hooks/pre-commit',
      'git log --oneline -5 main',
      'git worktree add ../hotfix-1.2.1 release/1.2',
      'git -C ../hotfix-1.2.1 cherry-pick -x main~2',
      'git -C ../hotfix-1.2.1 tag -a v1.2.1 -m "Nova 1.2.1: trim trailing whitespace on save"',
      'git worktree remove ../hotfix-1.2.1',
    ],
    [
      'git stash push -u -m "onboarding tour"',
      'git switch release/1.2',
      'git cherry-pick main~2',
      'git tag -a v1.2.1 -m "Nova 1.2.1"',
      'git switch main',
      'git stash pop',
      `edit .githooks/pre-commit ${q(SECRET_HOOK)}`,
      'chmod +x .githooks/pre-commit',
      'git config core.hooksPath .githooks',
    ],
  ],
};

export const level6: Level = {
  id: 'advanced',
  number: 6,
  title: 'Advanced and internals',
  topics: 'Worktrees, hooks, line endings, objects, notes, trailers, submodules',
  planned: 8,
  root: ROOT_COMMANDS,
  missions: [worktreeHotfix, preCommitHook, gitattributes, openTheBox, gitNotes, trailers, submodule, hotfixWithoutLosingYourPlace],
};

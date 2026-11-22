/**
 * Lesson 1: Foundations. Missions: src/game/levels/level1.ts (three areas, snapshot, -am trap, diffs,
 * .gitignore, rm --cached, mv, log/show, commit messages). Guide: docs/LESSON-GUIDE.md.
 */
import type { Lesson } from '../lesson-model';

export const lesson1: Lesson = {
  levelId: 'foundations',
  title: 'Foundations: snapshots, the index and history',
  summary:
    'You will understand what a repository stores, how a file travels from your disk through the index into a commit, and how to read status, diffs and history before you commit.',
  slides: [
    {
      kind: 'concept',
      id: 'repository',
      title: 'A repository is a folder plus .git',
      body:
        'The Nova project is an ordinary folder of files. What makes it a repository is the hidden .git folder at its top: the entire history (every version of every file, compressed), the branches, HEAD, the index and the repository config.\n\n`git init` creates an empty .git in the current folder. `git clone <url>` downloads a whole repository, history included, into a new folder and checks out its default branch.\n\nThe files you see and edit are the working directory: one version of the project laid out on disk for you to work on. Delete the working files and Git can restore them; delete .git and the history is gone.',
      diagram: {
        kind: 'code',
        title: 'nova/',
        text: 'nova/\n  a.txt  b.txt  app.ts  bug.txt   <- working directory\n  .git/\n    HEAD          which branch you are on\n    config        this repo\'s settings (--local)\n    index         the next commit, being prepared\n    objects/      every file version, tree and commit\n    refs/heads/   one small file per branch',
      },
      remember: 'Your files are a workspace; .git is the project\'s memory.',
    },
    {
      kind: 'concept',
      id: 'snapshots',
      title: 'Snapshots, not diffs',
      body:
        'Many tools store a file\'s first version and then a list of changes. Git stores something simpler: each commit is a snapshot of the whole project as it was at that moment.\n\nThat sounds expensive but is not. Each file version is stored once, under a name computed from its content. If app.ts did not change between two commits, both snapshots point to the same stored copy.\n\nDiffs are not stored at all. When you run git diff or git show, Git compares two snapshots and computes the difference on the spot. That is why any two commits can be compared, not just neighbours.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit: a1 b1 app v1', parents: [], lane: 'main' },
          { id: 'B', message: 'fix: a.txt (a2, rest unchanged)', parents: ['A'], lane: 'main' },
          { id: 'C', message: 'docs: v2 (app v2, rest unchanged)', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'C',
        caption: 'Each commit is a full snapshot; unchanged files are shared, not copied.',
      },
      remember: 'A commit is a photo of the whole project; a diff is computed by comparing two photos.',
    },
    {
      kind: 'concept',
      id: 'commit-anatomy',
      title: 'What a commit contains',
      body:
        'A commit holds a pointer to its snapshot (the tree), the hash of its parent commit (two parents for a merge, none for the first commit), the author and committer with a date, and the message.\n\nIts identity is a hash: 40 hex characters computed from all of that. Change one byte, the message, or the parent, and you get a different hash. That is why history cannot be edited in place, only replaced.\n\nYou rarely need the full hash. `git log --oneline` shows a short prefix such as c15df9c, and any unambiguous prefix works in commands: `git show c15df9c`.',
      diagram: {
        kind: 'code',
        title: 'git cat-file -p HEAD',
        text: 'tree 4127d04101a93fcbacbdc49d2c2b940e9cdff02d\nparent e3806a9f4cc8b14a139da988b6747159c903df2a\nauthor Alex Martin <alex@nova.dev> 1795339419 +0100\ncommitter Alex Martin <alex@nova.dev> 1795339419 +0100\n\nfix: a.txt\n\n$ git rev-parse --short HEAD\nc15df9c',
      },
      remember: 'Snapshot + parents + author + message, all sealed by one hash.',
    },
    {
      kind: 'concept',
      id: 'three-areas',
      title: 'The three areas',
      body:
        'Git keeps every tracked file in up to three versions. The working directory is what is on disk. The index (also called the staging area) is the next commit being prepared. HEAD is the last commit.\n\n`git add a.txt` copies a.txt from disk into the index. `git commit` turns the index, exactly as it is, into a new commit. Nothing on disk that you did not add goes in.\n\nThat is how you ship a fix in a.txt now and keep the half-done b.txt for later: add only a.txt, commit, and b.txt stays modified on disk.',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'a.txt', disk: 'a v2', index: 'a v2', head: 'a v1' },
          { path: 'b.txt', disk: 'b v2', index: 'b v1', head: 'b v1' },
        ],
        caption: 'After git add a.txt: the next commit will contain a v2 and the unchanged b v1.',
      },
      remember: 'A commit photographs the index, not your disk.',
    },
    {
      kind: 'concept',
      id: 'frozen-index',
      title: 'What you staged is what you commit',
      body:
        'Staging copies the file at that moment. If you edit app.ts again after `git add`, the index still holds the version you added. `git status` then lists app.ts twice: once under "Changes to be committed" and once under "Changes not staged".\n\nCommitting now records the staged version and leaves the newer one on disk. If you want the newer one in the commit, run `git add` again.\n\n`git commit -a` is a shortcut that stages every change to files Git already tracks before committing. It never picks up a new, untracked file: those always need `git add`.',
      diagram: {
        kind: 'before-after',
        command: 'git commit -m "docs: v2"',
        before: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' }] },
        after: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v2' }] },
        caption: 'The commit takes v2 from the index; v3 stays on disk, still unstaged.',
      },
      remember: 'Only git add updates the index; -a only covers files Git already tracks.',
    },
    {
      kind: 'concept',
      id: 'file-states',
      title: 'File states and git status',
      body:
        'Every file is in one of these states. Untracked: on disk, never added. Unmodified: same as HEAD. Modified: changed on disk, not staged. Staged: the index holds a version different from HEAD. Ignored: matched by .gitignore, so Git pretends it is not there.\n\n`git status` explains all of this in full sentences, with the command to undo each step. `git status -s` packs it into two columns: the left one is the index (compared with HEAD), the right one is the disk (compared with the index).\n\nRead status before every add and every commit. It is free and it prevents most mistakes.',
      diagram: {
        kind: 'code',
        title: 'git status -s --ignored',
        text: 'M  a.txt        staged, nothing more on disk\n M b.txt        modified, not staged\nMM app.ts       staged v2, and v3 on disk\nA  notes.txt    new file, staged\nR  a.txt -> sync.txt   rename, staged\n?? TODO.txt     untracked\n!! dist/        ignored (only shown with --ignored)',
      },
      remember: 'Left column = index, right column = disk.',
    },
    {
      kind: 'concept',
      id: 'head-local-remote',
      title: 'HEAD, and local vs remote',
      body:
        'HEAD means "where you are now". Usually it points to a branch (main), and the branch points to its latest commit. Committing moves that branch forward and HEAD comes along. HEAD~1 is the commit before.\n\nEverything so far happens in your local repository. A remote is another copy of the repository, usually on a server, that you have given a name: origin. Your Mac also keeps origin/main, a read-only note of where main was on origin the last time you talked to it.\n\nNothing syncs by itself. A commit stays on your Mac until you push it, and teammates\' commits stay on origin until you fetch or pull. Level 3 is all about that.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'B', message: 'fix: a.txt', parents: ['A'], lane: 'main', refs: ['origin/main'] },
          { id: 'C', message: 'docs: notes', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'C',
        caption: 'C exists only on your Mac: origin/main shows the server still at B.',
      },
      remember: 'HEAD is where you are; origin/main is what you last saw on the server.',
    },
    {
      kind: 'concept',
      id: 'diffs',
      title: 'Reading a diff',
      body:
        '`git diff` compares the disk with the index: what you changed but have not staged. `git diff --staged` (same as --cached) compares the index with HEAD: exactly what the next commit will contain. `git diff HEAD` compares the disk with the last commit, and `git diff main` compares the disk with another branch.\n\nIn the output, each file starts with --- a/ (before) and +++ b/ (after). Each hunk starts with @@ -line,count +line,count @@. Lines with - are removed, + are added, a space means unchanged context.\n\nZoom out or in as needed: --stat counts changed lines per file, --name-only lists the files, --word-diff shows changes inside a line as [-old-]{+new+}, which is far easier to read for prose.',
      diagram: {
        kind: 'code',
        title: 'git diff --staged',
        text: 'diff --git a/app.ts b/app.ts\n--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-v3\n+v4: retry offline sync\n\n$ git diff --word-diff notes.md\nSync runs every [-5-]{+10+} minutes.',
      },
      remember: 'git diff = not staged yet; git diff --staged = what you are about to commit.',
    },
    {
      kind: 'concept',
      id: 'log-show',
      title: 'Exploring history',
      body:
        '`git log` lists commits from HEAD backwards. --oneline gives one line each, -n 5 keeps the last five, --graph draws branches and merges, --all includes every branch, not just the current one.\n\nFilters narrow it down: --author=Lea, --since="2 weeks ago", and anything after -- is a path: `git log -- app.ts` keeps only commits that changed app.ts. Add --follow to keep tracking one file across a rename.\n\n`git show <commit>` prints one commit: its message and its diff. --stat replaces the diff with a summary, and `git show HEAD:app.ts` prints a file as it was in that commit.',
      diagram: {
        kind: 'code',
        title: 'git log --oneline --graph --all -n 5',
        text: '* 9f2c1e4 (HEAD -> main) fix(sync): resolve conflicts by timestamp\n* 41ab9d0 docs: notes\n* 7d3e5a2 docs: readme\n* c15df9c fix: a.txt\n* e3806a9 Initial commit\n\n$ git log --oneline -- app.ts\n9f2c1e4 fix(sync): resolve conflicts by timestamp',
      },
      remember: 'git log to find the commit, git show to open it.',
    },
    {
      kind: 'concept',
      id: 'rm-mv',
      title: 'Removing and renaming',
      body:
        '`git rm TODO.txt` deletes the file from disk and stages the deletion. If the file has unstaged changes, Git refuses unless you add -f, so you do not lose work by accident.\n\n`git rm --cached .env` removes the file from the index only. It stays on your disk, becomes untracked, and the next commit stops tracking it. Pair it with a .gitignore line, or git add . brings it straight back.\n\nGit never stores "renamed". `git mv a.txt sync.txt` is a plain mv plus staging both paths. Git sees one path disappear and another appear with similar content (50% or more by default) and reports a rename. That is why renaming with Finder and then `git add -A` gives the same result.',
      diagram: {
        kind: 'before-after',
        command: 'git rm --cached .env',
        before: { kind: 'areas', files: [{ path: '.env', disk: 'API_KEY', index: 'API_KEY', head: 'API_KEY' }] },
        after: { kind: 'areas', files: [{ path: '.env', disk: 'API_KEY', index: null, head: 'API_KEY' }] },
        caption: 'Gone from the index (the next commit), still on disk, still in the old commits.',
      },
      remember: 'Untracking is not deleting, and a rename is a delete plus an add.',
    },
    {
      kind: 'concept',
      id: 'gitignore',
      title: '.gitignore',
      body:
        'A .gitignore lists patterns, one per line, for files Git should not see: *.log matches any log file, dist/ matches a folder, /build only at the top level, and # starts a comment. A pattern starting with ! makes an exception. Each folder can have its own .gitignore for its own files.\n\nOne catch with exceptions: Git does not look inside an ignored folder. With logs/ ignored, !logs/keep.log does nothing; write logs/* and then !logs/keep.log.\n\nIgnoring only affects untracked files. A file that is already committed stays tracked until you `git rm --cached` it. Patterns that are only yours belong elsewhere: .git/info/exclude for one repo, core.excludesFile (by default ~/.config/git/ignore) for all of them, for things like .DS_Store. GitHub publishes ready-made templates per language. `git check-ignore -v <path>` tells you which line matched.',
      diagram: {
        kind: 'code',
        title: '.gitignore',
        text: '# build output\ndist/\n# secrets\n.env\n# logs, except one\nlogs/*\n!logs/keep.log\n\n$ git check-ignore -v .env\n.gitignore:4:.env    .env',
      },
      remember: 'Ignore build output and secrets before the first git add.',
    },
    {
      kind: 'concept',
      id: 'commit-messages',
      title: 'Commit messages, and getting help',
      body:
        'The first line is the subject: 50 characters or less, imperative ("Add offline queue", "Fix login crash"), no final period. git log --oneline and GitHub show only that line.\n\nAfter a blank line comes the body, wrapped around 72 characters: why the change was needed and anything surprising. The diff already says what changed. Each -m adds a paragraph: `git commit -m "subject" -m "body"`. `git commit` without -m opens your editor for longer messages. Many teams add a type prefix such as feat: or fix:.\n\nWhen you forget a flag: `git <command> -h` prints a short summary in the terminal, `git help <command>` opens the full manual.',
      diagram: {
        kind: 'code',
        title: 'A good message',
        text: 'Queue offline edits and replay them\n\nEdits made offline were lost on restart. Keep them in a\nqueue and replay them once the app is back online.',
      },
      remember: 'The diff says what changed; the message says why.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Everyday commands',
      rows: [
        { command: 'git init / git clone <url>', does: 'Create an empty repository here / copy a whole repository with its history.' },
        { command: 'git status (-s)', does: 'Shows the state of every changed file (short: index column, disk column).' },
        { command: 'git add <file> / git add .', does: 'Copies a file / everything under this folder from disk into the index.' },
        { command: 'git add -p', does: 'Walks through each change and asks y/n: stage only some hunks of a file.' },
        { command: 'git commit -m "msg"', does: 'Turns the index into a commit. Two -m make subject and body.' },
        { command: 'git commit -am "msg"', does: 'Stages changes to tracked files, then commits. Skips untracked files.' },
        { command: 'git diff / git diff --staged', does: 'Disk vs index / index vs last commit.' },
        { command: 'git diff --stat / --name-only / --word-diff', does: 'Summary per file / file names only / word-level changes.' },
        { command: 'git log --oneline --graph --all -n 5', does: 'Compact history of every branch, last five commits.' },
        { command: 'git log --author=Lea --since="2 weeks ago" -- app.ts', does: 'Filters history by author, date and path.' },
        { command: 'git show <commit> (--stat)', does: 'Message and diff of one commit (or its file list).' },
        { command: 'git rm <file>', does: 'Deletes the file and stages the deletion.', danger: true },
        { command: 'git rm --cached <file>', does: 'Stops tracking a file, keeps it on disk.' },
        { command: 'git mv <old> <new>', does: 'Renames on disk and stages the rename.' },
        { command: 'git restore <file>', does: 'Throws away unstaged changes to a file (no undo).', danger: true },
        { command: 'git check-ignore -v <path>', does: 'Shows which ignore rule matches a path.' },
        { command: 'git help <cmd> / git <cmd> -h', does: 'Full manual / short option list.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Foundation pitfalls',
      items: [
        {
          mistake: 'You edited a file after git add and committed: the commit has the old version.',
          fix: 'The index froze the version you added. git add the file again before committing (git diff shows what is still unstaged).',
        },
        {
          mistake: 'git commit -am did not include your new file.',
          fix: '-a only stages files Git already tracks. git add the new file, then commit (or git commit --amend to add it to the last commit).',
        },
        {
          mistake: 'git add . staged .env, node_modules or build output.',
          fix: 'git restore --staged <path> to unstage, add the pattern to .gitignore, and read git status before every commit.',
        },
        {
          mistake: 'You added a file to .gitignore but Git still shows its changes.',
          fix: 'It is already tracked. git rm --cached <file>, commit, and the ignore rule takes over.',
        },
        {
          mistake: 'A secret (.env) was committed.',
          fix: 'git rm --cached stops tracking it, but it stays in past commits: rotate the key now. Rewriting history comes later.',
        },
        {
          mistake: 'git diff shows nothing, yet git status says there are changes.',
          fix: 'They are staged. Use git diff --staged to see them.',
        },
        {
          mistake: 'A message like "stuff" or "wip" that nobody will understand in a month.',
          fix: 'If it is not pushed yet, git commit --amend rewrites it. Next time: imperative subject, blank line, the why.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-commit-index',
      question: 'With these three versions of each file, you run git commit -m "ship". What does the new commit contain?',
      diagram: {
        kind: 'areas',
        files: [
          { path: 'a.txt', disk: 'a v2', index: 'a v2', head: 'a v1' },
          { path: 'b.txt', disk: 'b v2', index: 'b v1', head: 'b v1' },
        ],
      },
      options: [
        { id: 'a', text: 'a v2 and b v2: a commit saves the files on disk.' },
        { id: 'b', text: 'a v2 and b v1.' },
        { id: 'c', text: 'Only a.txt: unstaged files are left out of the snapshot.' },
        { id: 'd', text: 'Nothing: you must stage b.txt too.' },
      ],
      correct: 'b',
      explanation:
        'The commit is a snapshot of the whole index. The index holds a v2 (added) and b v1 (unchanged since the last commit), so the snapshot has both files: a v2 and b v1. b v2 stays on disk as an unstaged change.',
    },
    {
      id: 'q-mm',
      question: 'git status -s shows "MM app.ts". What does that mean?',
      options: [
        { id: 'a', text: 'app.ts was modified twice and both changes are staged.' },
        { id: 'b', text: 'app.ts has a staged change, and a further change on disk that is not staged.' },
        { id: 'c', text: 'app.ts has a merge conflict.' },
        { id: 'd', text: 'app.ts was moved and modified.' },
      ],
      correct: 'b',
      explanation:
        'Left column: index vs HEAD (M = staged change). Right column: disk vs index (M = more changes not staged yet). A conflict would show UU, a rename R.',
    },
    {
      id: 'q-am',
      question: 'README.md is tracked and modified, notes.txt is brand new. You run git commit -am "docs". What is in the commit?',
      options: [
        { id: 'a', text: 'Both files.' },
        { id: 'b', text: 'Only the README.md change; notes.txt stays untracked.' },
        { id: 'c', text: 'Only notes.txt.' },
        { id: 'd', text: 'Nothing: -a requires git add first.' },
      ],
      correct: 'b',
      explanation: '-a stages modifications and deletions of files Git already tracks. A new file is untracked, so it needs an explicit git add.',
    },
    {
      id: 'q-diff-staged',
      question: 'You staged a fix in app.ts and left a debug line unstaged in bug.txt. Which command shows exactly what git commit will record?',
      options: [
        { id: 'a', text: 'git diff' },
        { id: 'b', text: 'git diff --staged' },
        { id: 'c', text: 'git diff HEAD' },
        { id: 'd', text: 'git show' },
      ],
      correct: 'b',
      explanation:
        'git diff --staged compares the index with HEAD, which is the next commit. git diff shows only the unstaged debug line; git diff HEAD mixes both; git show prints the last commit, not the next one.',
    },
    {
      id: 'q-ignore-tracked',
      question: '.env was committed last week. Today you add .env to .gitignore and edit .env. What does git status show?',
      options: [
        { id: 'a', text: 'Nothing: .env is ignored now.' },
        { id: 'b', text: '.env as modified: ignore rules do not apply to tracked files.' },
        { id: 'c', text: '.env as deleted.' },
        { id: 'd', text: '.env as untracked.' },
      ],
      correct: 'b',
      explanation:
        '.gitignore only hides untracked files. A tracked file keeps being tracked until you run git rm --cached .env and commit; after that the rule applies.',
    },
    {
      id: 'q-negation',
      question: 'Your .gitignore has two lines: logs/ and then !logs/keep.log. Is logs/keep.log tracked by git add .?',
      options: [
        { id: 'a', text: 'Yes: the ! exception wins because it comes later.' },
        { id: 'b', text: 'No: Git does not look inside an ignored folder, so the exception never applies.' },
        { id: 'c', text: 'Only if you run git add -f logs.' },
        { id: 'd', text: 'Git reports an error for contradictory rules.' },
      ],
      correct: 'b',
      explanation:
        'Excluding the folder logs/ stops Git from listing anything inside it, so a later exception for a file in it has no effect. Write logs/* (the files, not the folder) followed by !logs/keep.log.',
    },
    {
      id: 'q-rename',
      question: 'You rename a.txt to sync.txt in Finder, then run git add -A. What will git status show?',
      options: [
        { id: 'a', text: 'renamed: a.txt -> sync.txt' },
        { id: 'b', text: 'Only "deleted: a.txt"; the new name stays untracked.' },
        { id: 'c', text: 'An error: renames must be done with git mv.' },
        { id: 'd', text: 'Two unrelated changes that Git can never link.' },
      ],
      correct: 'a',
      explanation:
        'Git does not record renames; it detects them. With the deletion and the new file both staged and the content identical, status reports a rename, exactly as git mv would.',
    },
    {
      id: 'q-hash',
      question: 'You fix a typo in the message of your last commit (nothing else). What happens to its hash?',
      options: [
        { id: 'a', text: 'It stays the same: the files did not change.' },
        { id: 'b', text: 'It changes: the message is part of what the hash is computed from.' },
        { id: 'c', text: 'Only the short hash changes.' },
      ],
      correct: 'b',
      explanation:
        'A commit hash covers the snapshot, the parents, the author, the committer and the message. Any change produces a new commit with a new hash, which is why rewriting pushed commits causes trouble.',
    },
  ],
  theoryOnly: [
    'Repository and the .git folder',
    'git init and git clone',
    'Commit anatomy and long vs short hashes',
    'HEAD, and local vs remote',
    'git add -p',
    'git diff HEAD, git diff <branch>, --name-only, --word-diff',
    'git log --graph --all, --author, --since, --follow',
    '.gitignore negation, per-folder files and templates',
    'core.excludesFile and .git/info/exclude',
    'git help and -h',
  ],
};

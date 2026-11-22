import type { Lesson } from '../lesson-model';

/** Level 4 lesson: undo and recovery. Missions: src/game/levels/level4.ts. */
export const lesson4: Lesson = {
  levelId: 'undo',
  title: 'Undo and recovery',
  summary:
    'You will know which mistakes Git can undo and which it cannot, and pick the right tool for each: restore, stash, amend, reset, revert or the reflog.',
  slides: [
    {
      kind: 'concept',
      id: 'what-can-be-recovered',
      title: 'What Git can and cannot bring back',
      body:
        'Undoing in Git is mostly about one question: did Git ever store this version? Git only keeps what passed through `git add` or `git commit`. An edit that only ever lived in your editor is just bytes on disk, and once something overwrites it, no Git command can bring it back.\n\n' +
        'Staged content is safer: `git add` wrote a blob into `.git/objects`, so even if you overwrite the file, the blob sits there until garbage collection, and `git fsck` can still find it.\n\n' +
        'Committed work is the safest of all. Commands like `reset --hard` only move labels: the commits stay in the object store and the reflog remembers them for at least 30 days by default. Once work is pushed and pulled by others, the question changes: you can still undo it, but you must not rewrite history other people already have.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'disk', label: 'Edits on disk', detail: 'never added: gone once overwritten', row: 0 },
          { id: 'index', label: 'Staged', detail: 'a blob exists: fsck can find it', row: 0 },
          { id: 'commit', label: 'Committed', detail: 'reflog remembers it for weeks', row: 0 },
          { id: 'pushed', label: 'Pushed and pulled', detail: 'others have it: revert, do not rewrite', row: 0 },
        ],
        edges: [
          { from: 'disk', to: 'index', label: 'git add' },
          { from: 'index', to: 'commit', label: 'git commit' },
          { from: 'commit', to: 'pushed', label: 'git push' },
        ],
        caption: 'The further right your work is, the easier it is to recover, and the more careful you must be about rewriting it.',
      },
      remember: 'Commit early and Git can almost always save you; never-added edits have no safety net.',
    },
    {
      kind: 'concept',
      id: 'restore',
      title: 'restore: copy a version back into place',
      body:
        '`git restore` copies a file from one area into another. Plain `git restore sync.ts` copies the index version onto disk, which throws away your unstaged edits for good. Name exact files: `git restore .` wipes every unstaged change in the folder.\n\n' +
        '`git restore --staged search.ts` copies the HEAD version into the index. It undoes a `git add` and leaves the file on disk untouched, so nothing is lost.\n\n' +
        '`git restore --source=HEAD~2 config.txt` takes the file from any commit you name and writes it on disk only (add `--staged --worktree` to update both). It is how you grab an old version of one file without moving any branch.\n\n' +
        '`git clean` handles the other kind of mess: untracked files. `git clean -n` lists what it would delete, `git clean -fd` deletes untracked files and folders. Untracked files were never in Git, so this is final. Ignored files survive unless you add `-x`.',
      diagram: {
        kind: 'before-after',
        command: 'git restore --staged search.ts',
        before: {
          kind: 'areas',
          files: [
            { path: 'editor.ts', disk: 'dark theme', index: 'dark theme', head: 'v1' },
            { path: 'search.ts', disk: 'experiment', index: 'experiment', head: 'v1' },
          ],
        },
        after: {
          kind: 'areas',
          files: [
            { path: 'editor.ts', disk: 'dark theme', index: 'dark theme', head: 'v1' },
            { path: 'search.ts', disk: 'experiment', index: 'v1', head: 'v1' },
          ],
        },
        caption: 'Only the index changed: the experiment is still on disk, just no longer part of the next commit.',
      },
      remember: 'restore = copy back. Plain: index to disk (destructive). --staged: HEAD to index (safe).',
    },
    {
      kind: 'concept',
      id: 'stash',
      title: 'The stash: a shelf for unfinished work',
      body:
        '`git stash push` saves your uncommitted changes (staged and unstaged) as a special commit on a stack, then resets your files to HEAD so you can switch branches. Give it a name with `-m "wip: auto theme"`. New, untracked files are not saved unless you add `-u`; `-a` also takes ignored files.\n\n' +
        'The newest entry is `stash@{0}`. `git stash list` shows the stack, `git stash show -p stash@{1}` shows what an entry contains. `git stash pop` re-applies the newest entry and drops it; `git stash apply` re-applies and keeps it. If pop hits a conflict, the entry is kept so nothing is lost.\n\n' +
        '`git stash push --keep-index` stashes everything but leaves what you staged in place, handy to test only the staged part. `git stash branch fix-x` creates a branch from the commit where you stashed and applies the entry there, which avoids conflicts when main has moved on. `git stash drop` deletes one entry, `git stash clear` deletes them all.',
      diagram: {
        kind: 'code',
        title: 'Parking work to fix something on another branch',
        text:
          '$ git stash push -u -m "wip: auto theme"\n' +
          'Saved working directory and index state On main: wip: auto theme\n' +
          '$ git switch release        # fix, commit\n' +
          '$ git switch main\n' +
          '$ git stash list\n' +
          'stash@{0}: On main: wip: auto theme\n' +
          '$ git stash pop\n' +
          'Dropped refs/stash@{0} (3f9c2a1...)',
      },
      remember: 'stash push -u to park, stash pop to resume; untracked files need -u.',
    },
    {
      kind: 'concept',
      id: 'amend',
      title: 'amend: replace the last commit',
      body:
        'Commits never change. `git commit --amend` builds a brand-new commit from the current index (plus a new message if you give one) with the same parent as the old one, and moves the branch to it. The old commit is not edited, just abandoned.\n\n' +
        'That is why the hash changes. Stage the forgotten file first, then `git commit --amend -m "feat: dark theme"`, or `--amend --no-edit` to keep the message.\n\n' +
        'Amend freely until you push. After a push, amending means your local branch and origin disagree, and you would need a force push. On your own pull request branch that is fine (with `--force-with-lease`); on a shared branch, add a new commit instead.',
      diagram: {
        kind: 'before-after',
        command: 'git add theme.css && git commit --amend -m "feat: dark theme"',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'feat: dakr theme', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'B',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'feat: dakr theme', parents: ['A'], lane: 'main', ghost: true },
            { id: "B'", message: 'feat: dark theme (+ theme.css)', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: "B'",
        },
        caption: "B' replaces B. B still exists in the reflog, but no branch points to it.",
      },
      remember: 'amend = a new last commit with a new hash; fine before you push.',
    },
    {
      kind: 'concept',
      id: 'reset-moves',
      title: 'reset moves the branch label',
      body:
        'A branch is a label on a commit. `git reset <commit>` moves the current branch label (and HEAD with it) to another commit. `HEAD~1` means "the parent of HEAD", so `git reset HEAD~1` steps back one commit.\n\n' +
        'The commits after the new position are not deleted. They are simply no longer reachable from any branch, so `git log` stops showing them. The reflog and a backup branch both still point at them.\n\n' +
        'That is the backup habit: before a risky reset, `git branch backup` costs nothing and makes the reset fully reversible. If you change your mind, `git reset --hard backup` brings everything back.',
      diagram: {
        kind: 'before-after',
        command: 'git branch backup && git reset --hard HEAD~1',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'feat: offline sync', parents: ['A'], lane: 'main' },
            { id: 'X', message: 'bot: regex search rewrite', parents: ['B'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'X',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'feat: offline sync', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
            { id: 'X', message: 'bot: regex search rewrite', parents: ['B'], lane: 'backup', refs: ['backup'] },
          ],
          head: 'B',
        },
        caption: 'main moved back to B. X is untouched, and the backup branch keeps it easy to find.',
      },
      remember: 'reset moves a label; put a backup branch on anything you might want again.',
    },
    {
      kind: 'concept',
      id: 'reset-modes',
      title: 'soft, mixed, hard: what happens to your files',
      body:
        'Every reset moves the branch. The mode decides whether the index and the disk follow it.\n\n' +
        '`--soft` moves only the branch: the undone commit\'s changes stay staged, ready to be committed again. It is the cleanest way to redo or split the last commit. `--mixed` (the default when you give no mode) also resets the index, so the changes are still on disk but unstaged. `--hard` resets the index and the disk too: the commit\'s changes and any uncommitted edits to tracked files are gone from your folder.\n\n' +
        '`--hard` is the only mode that can destroy work, and only the uncommitted part: committed content can still be found through the reflog. Run `git status` before it, and commit or stash anything you want to keep.',
      diagram: {
        kind: 'code',
        title: 'Commit C changed sync.ts from v1 to v2. Run each from C:',
        text:
          '                          branch   index   disk\n' +
          'git reset --soft  HEAD~1   -> B      v2      v2    change kept, staged\n' +
          'git reset --mixed HEAD~1   -> B      v1      v2    change kept, unstaged\n' +
          'git reset --hard  HEAD~1   -> B      v1      v1    change gone from disk',
      },
      remember: 'soft = branch only, mixed = branch + index, hard = branch + index + disk.',
    },
    {
      kind: 'concept',
      id: 'revert',
      title: 'revert: undo by adding the opposite',
      body:
        '`git revert <commit>` computes the inverse of that commit and records it as a new commit on top. Lines it added are removed, lines it removed come back. History only grows, so everyone who already pulled the bad commit can pull the fix normally.\n\n' +
        'The bad commit stays visible in the log, followed by "Revert ...". That is a feature: the history tells the truth about what happened. `--no-edit` keeps the default message; you can revert an older commit too, and Git will stop on a conflict if later commits touched the same lines.\n\n' +
        'To undo a revert later (say the feature is fixed), revert the revert.',
      diagram: {
        kind: 'before-after',
        command: 'git revert --no-edit HEAD',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'H', message: 'hotfix: poll every 1 ms', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
          ],
          head: 'H',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'H', message: 'hotfix: poll every 1 ms', parents: ['A'], lane: 'main', refs: ['origin/main'] },
            { id: 'R', message: 'Revert "hotfix: poll every 1 ms"', parents: ['H'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'R',
        },
        caption: 'R is a normal new commit, so a plain git push works: origin/main is simply behind.',
      },
      remember: 'revert = a new commit that cancels an old one; safe on shared branches.',
    },
    {
      kind: 'concept',
      id: 'revert-merge',
      title: 'Reverting a merge needs -m 1',
      body:
        'A merge commit has two parents, so "undo this commit" is ambiguous: undo it relative to which side? Git refuses until you say which parent is the mainline. `git revert -m 1 <merge>` means "keep parent 1 (the branch you merged into, usually main) and remove everything the merged branch brought in".\n\n' +
        'This is exactly what the Revert button on a merged pull request does. One trap: after reverting a merge, Git still considers that branch merged. If you later fix the branch and merge it again, only the new commits come in. To bring the whole feature back, revert the revert first.',
      diagram: {
        kind: 'before-after',
        command: 'git revert -m 1 --no-edit M',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'F', message: 'feat: markdown editor', parents: ['A'], lane: 'feature' },
            { id: 'M', message: 'Merge feature/markdown', parents: ['A', 'F'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'M',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'F', message: 'feat: markdown editor', parents: ['A'], lane: 'feature' },
            { id: 'M', message: 'Merge feature/markdown', parents: ['A', 'F'], lane: 'main' },
            { id: 'R', message: 'Revert "Merge feature/markdown"', parents: ['M'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'R',
        },
        caption: 'R has the same files as A: the feature is gone from main, and nothing was rewritten.',
      },
      remember: 'Revert a merge with -m 1: keep main\'s side, drop what the branch brought.',
    },
    {
      kind: 'concept',
      id: 'golden-rule',
      title: 'reset or revert: the golden rule',
      body:
        'Both undo commits, but in opposite ways. reset rewrites history: the branch points somewhere else and the commits disappear from it. revert adds history: a new commit cancels the old one.\n\n' +
        'The golden rule: never rewrite commits that other people already have. If you reset a pushed branch, your next push is rejected; forcing it makes teammates\' history disagree with the server, and their next pull can resurrect the commits you removed. So: not pushed yet, reset or amend; already shared, revert.\n\n' +
        'One reset is always safe for you: `git fetch` then `git reset --hard origin/main` makes your local main match the server exactly. It discards your local commits and uncommitted edits on that branch, so put a backup branch on them first if there is any doubt.',
      diagram: {
        kind: 'code',
        title: 'Which undo?',
        text:
          'Edits not staged, want them gone      git restore <file>\n' +
          'Staged by mistake                     git restore --staged <file>\n' +
          'Last commit wrong, not pushed         git commit --amend\n' +
          'Last commits wrong, not pushed        git reset --soft / --hard HEAD~n\n' +
          'Commit already pushed and pulled      git revert <commit>\n' +
          'Merged PR must go                     git revert -m 1 <merge>\n' +
          'Local main is a mess, match server    git fetch && git reset --hard origin/main',
      },
      remember: 'Not pushed: reset or amend. Pushed: revert.',
    },
    {
      kind: 'concept',
      id: 'reflog',
      title: 'The reflog: HEAD\'s diary',
      body:
        'Every time HEAD moves (commit, reset, switch, merge, rebase, amend), Git writes a line in the reflog. `git reflog` lists them newest first: `HEAD@{0}` is where HEAD is now, `HEAD@{1}` where it was one move ago, and so on.\n\n' +
        'So after a bad `reset --hard HEAD~2`, the "lost" commits are one line down. `git branch rescue HEAD@{1}` puts a label back on them (or `git reset --hard HEAD@{1}` to move the current branch back).\n\n' +
        'Git also keeps `ORIG_HEAD`, the position before the last reset, merge or rebase: `git reset --hard ORIG_HEAD` undoes that operation in one step. The reflog is local to your machine and is never pushed; entries for unreachable commits expire after 30 days by default.',
      diagram: {
        kind: 'code',
        title: 'After Nova Bot ran git reset --hard HEAD~2',
        text:
          '$ git reflog\n' +
          '1a2b3c4 (HEAD -> main) HEAD@{0}: reset: moving to HEAD~2\n' +
          '9f8e7d6 HEAD@{1}: commit: feat: offline cache\n' +
          '5c4b3a2 HEAD@{2}: commit: feat: auto theme\n' +
          '1a2b3c4 (HEAD -> main) HEAD@{3}: commit (initial): Initial commit\n' +
          '$ git branch rescue HEAD@{1}     # both commits are back on a branch',
      },
      remember: 'Lost a commit? git reflog, then put a branch on it.',
    },
    {
      kind: 'concept',
      id: 'rescue',
      title: 'Rescuing deleted branches and dropped stashes',
      body:
        'A deleted branch is just a removed label. `git branch -D feature` prints `Deleted branch feature (was 7d1e2f3)`: `git branch feature 7d1e2f3` recreates it. If that line has scrolled away, the HEAD reflog still shows the commits you had checked out on it.\n\n' +
        'A dropped stash is harder, because stash entries have no reflog of their own once dropped. `git stash pop` and `drop` print the hash (`Dropped refs/stash@{0} (3f9c2a1...)`); if you lost it, `git fsck --unreachable | grep commit` lists unreachable commits. Stash commits read "WIP on main" or "On main: your message" in `git show`. Then `git stash apply <hash>`.\n\n' +
        'Both rescues work only until garbage collection prunes the objects (weeks by default). The cheapest insurance is the backup branch habit: `git branch backup-before-rebase` before anything that rewrites.',
      diagram: {
        kind: 'code',
        title: 'Finding a dropped stash',
        text:
          '$ git fsck --unreachable | grep commit\n' +
          'unreachable commit 3f9c2a1e...\n' +
          '$ git show --stat 3f9c2a1\n' +
          '    On main: wip: auto theme\n' +
          '$ git stash apply 3f9c2a1',
      },
      remember: 'Labels and stash entries can be rebuilt from a hash; keep the hash or a backup branch.',
    },
    {
      kind: 'concept',
      id: 'secrets',
      title: 'Secrets: rotate first, then clean',
      body:
        'Never commit secrets (API keys, tokens, passwords, .env files). Once a secret is in a commit, deleting the file in a later commit does not help: every earlier commit, every clone and every fork still contains it. Treat a pushed secret as public.\n\n' +
        'Step one is always to revoke and rotate the key at the provider. Then stop tracking the file with `git rm --cached .env` and add `.env` to .gitignore; the file stays on your disk. If the history itself must be cleaned, `git filter-repo --path .env --invert-paths` (or BFG with `--delete-files`) rewrites every commit, which needs a force push and a fresh clone for everyone.\n\n' +
        'Prevention beats cleanup: a pre-commit secret scanner such as gitleaks or trufflehog stops the commit on your machine (level 6 sets one up), and GitHub push protection blocks pushes that contain recognised secrets.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'leak', label: 'Secret pushed', detail: 'assume it is public', row: 0 },
          { id: 'rotate', label: 'Rotate the key', detail: 'at the provider, first', row: 0 },
          { id: 'untrack', label: 'Stop tracking', detail: 'git rm --cached + .gitignore', row: 0 },
          { id: 'rewrite', label: 'Clean history', detail: 'filter-repo or BFG, force push', row: 1 },
          { id: 'prevent', label: 'Prevent', detail: 'pre-commit scanner + push protection', row: 1 },
        ],
        edges: [
          { from: 'leak', to: 'rotate', label: '1' },
          { from: 'rotate', to: 'untrack', label: '2' },
          { from: 'untrack', to: 'rewrite', label: '3 if needed' },
          { from: 'rewrite', to: 'prevent', label: '4' },
        ],
      },
      remember: 'A pushed secret is burned: rotate it, then clean up.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Undo commands',
      rows: [
        { command: 'git restore <file>', does: 'Copy the index version onto disk: discards unstaged edits for good.', danger: true },
        { command: 'git restore --staged <file>', does: 'Unstage: copy HEAD into the index, disk untouched.' },
        { command: 'git restore --source=<commit> <file>', does: 'Bring back a file as it was in any commit (disk only by default).' },
        { command: 'git clean -n / git clean -fd', does: 'List / delete untracked files and folders. -x also deletes ignored files.', danger: true },
        { command: 'git stash push -u -m "msg"', does: 'Park all changes, including new files, under a name.' },
        { command: 'git stash push --keep-index', does: 'Stash everything but keep the staged part in place.' },
        { command: 'git stash list / show -p stash@{1}', does: 'See the stash stack / the content of one entry.' },
        { command: 'git stash pop / apply', does: 'Re-apply the newest entry and drop it / keep it.' },
        { command: 'git stash drop / clear', does: 'Delete one entry / all entries.', danger: true },
        { command: 'git stash branch <name>', does: 'New branch from where you stashed, with the entry applied.' },
        { command: 'git commit --amend [--no-edit]', does: 'Replace the last commit with the index (+ new message). New hash.' },
        { command: 'git reset --soft HEAD~1', does: 'Undo the last commit, keep its changes staged.' },
        { command: 'git reset [--mixed] HEAD~1', does: 'Undo the last commit, keep its changes unstaged.' },
        { command: 'git reset --hard <commit>', does: 'Move the branch and make index and disk match it.', danger: true },
        { command: 'git reset --hard origin/main', does: 'Make local main match the server; drops local commits and edits.', danger: true },
        { command: 'git revert <commit>', does: 'New commit that cancels an old one; safe on shared history.' },
        { command: 'git revert -m 1 <merge>', does: 'Undo a whole merged branch, keeping the mainline.' },
        { command: 'git reflog', does: 'Every position HEAD has had, newest first.' },
        { command: 'git branch rescue HEAD@{1}', does: 'Put a branch on a commit found in the reflog.' },
        { command: 'git reset --hard ORIG_HEAD', does: 'Go back to before the last reset, merge or rebase.', danger: true },
        { command: 'git fsck --unreachable', does: 'List objects no ref points to (dropped stashes, lost commits).' },
        { command: 'git rm --cached <file>', does: 'Stop tracking a file but keep it on disk.' },
        { command: 'git filter-repo --path <f> --invert-paths', does: 'Remove a file from all history (rewrites every commit).', danger: true },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Undo mistakes and the way out',
      items: [
        {
          mistake: 'Running git restore . or git reset --hard to "clean up" with unsaved edits you still wanted.',
          fix: 'Those edits were never in Git and are gone. Next time run git status and git diff first, or git stash before experimenting.',
        },
        {
          mistake: 'Running git clean -fd without looking, deleting new files you had not added yet.',
          fix: 'Always run git clean -n first. Untracked files cannot be recovered by Git; check your editor\'s local history or backups.',
        },
        {
          mistake: 'Reset or amend on a commit that was already pushed, then the push is rejected.',
          fix: 'Do not force it on a shared branch. git reset --hard ORIG_HEAD (or the reflog) to get back, then use git revert instead.',
        },
        {
          mistake: 'Committed to the wrong branch.',
          fix: 'git branch new-branch (labels the commit), then git reset --hard HEAD~1 on the wrong branch, then switch to new-branch.',
        },
        {
          mistake: 'git revert on a merge commit fails with "is a merge but no -m option was given".',
          fix: 'Add -m 1 to keep the main side: git revert -m 1 <merge>.',
        },
        {
          mistake: 'git stash, switch branch, and the new file is still there (or is lost later).',
          fix: 'Untracked files are not stashed by default. Use git stash push -u.',
        },
        {
          mistake: 'Commits vanished after a reset, rebase or bot "cleanup".',
          fix: 'git reflog, find the line before the damage, git branch rescue HEAD@{n}.',
        },
        {
          mistake: 'Committed .env and deleted it in the next commit, thinking that fixes it.',
          fix: 'It is still in history. Rotate the secret now, git rm --cached .env, add it to .gitignore, and clean history with filter-repo if required.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-restore-source',
      question: 'app.ts is v1 in the last commit, v2 in the index and v3 on disk. You run git restore app.ts. What is on disk now?',
      diagram: { kind: 'areas', files: [{ path: 'app.ts', disk: 'v3', index: 'v2', head: 'v1' }] },
      options: [
        { id: 'a', text: 'v1, the committed version' },
        { id: 'b', text: 'v2, the staged version' },
        { id: 'c', text: 'v3, nothing changes because the file is staged' },
        { id: 'd', text: 'The file is deleted' },
      ],
      correct: 'b',
      explanation:
        'Without --source, git restore copies from the index onto disk. v3 is lost, v2 stays staged. To get v1 you would need git restore --source=HEAD --staged --worktree app.ts.',
    },
    {
      id: 'q-soft',
      question: 'Your last commit mixes sync and search changes. You run git reset --soft HEAD~1. Where are those changes now?',
      options: [
        { id: 'a', text: 'Gone; --soft only keeps the commit message' },
        { id: 'b', text: 'On disk but unstaged' },
        { id: 'c', text: 'On disk and still staged, ready to commit again' },
        { id: 'd', text: 'In the stash' },
      ],
      correct: 'c',
      explanation:
        '--soft moves only the branch. Index and disk keep the commit\'s content, so you can unstage one file and commit the parts separately. Unstaged would be --mixed; gone would be --hard.',
    },
    {
      id: 'q-shared',
      question: 'Lea pushed a bad commit an hour ago and Samir and Ines already pulled it. What is the right way to undo it?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'H', message: 'hotfix: poll every 1 ms', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
        ],
        head: 'H',
      },
      options: [
        { id: 'a', text: 'git reset --hard HEAD~1, then git push --force' },
        { id: 'b', text: 'git revert HEAD, then git push' },
        { id: 'c', text: 'git commit --amend, then git push' },
        { id: 'd', text: 'git restore --source=HEAD~1 ., then git push' },
      ],
      correct: 'b',
      explanation:
        'The commit is shared, so history must only move forward: revert adds a commit that cancels it and pushes normally. Reset or amend rewrite history teammates already have and need a force push. Restore only changes your files, nothing is committed.',
    },
    {
      id: 'q-reflog',
      question: 'Nova Bot ran git reset --hard HEAD~2 and two commits vanished from git log. What gets them back?',
      options: [
        { id: 'a', text: 'Nothing: --hard deleted them' },
        { id: 'b', text: 'git stash pop' },
        { id: 'c', text: 'git reflog, then git branch rescue HEAD@{1}' },
        { id: 'd', text: 'git revert HEAD~2' },
      ],
      correct: 'c',
      explanation:
        'reset --hard only moved the branch label; the commits are still in the object store and HEAD@{1} in the reflog points at the old tip. git reset --hard ORIG_HEAD would also work right after the reset.',
    },
    {
      id: 'q-stash-u',
      question: 'You ran git stash with a modified editor.ts and a new, never-added CHANGELOG.md, then switched to release. What do you see there?',
      options: [
        { id: 'a', text: 'A clean folder: both changes are stashed' },
        { id: 'b', text: 'CHANGELOG.md is still there; only editor.ts was stashed' },
        { id: 'c', text: 'editor.ts is still modified; only CHANGELOG.md was stashed' },
        { id: 'd', text: 'git refuses to stash because of the untracked file' },
      ],
      correct: 'b',
      explanation:
        'A plain stash saves changes to tracked files only. Untracked files stay on disk and follow you to the other branch. git stash push -u includes them.',
    },
    {
      id: 'q-revert-merge',
      question: 'You want to undo merged PR #7 (merge commit M) on main. What does git revert -m 1 M do?',
      options: [
        { id: 'a', text: 'Deletes M and its parents from main' },
        { id: 'b', text: 'Adds a commit that removes what the merged branch brought, keeping main\'s side' },
        { id: 'c', text: 'Adds a commit that removes main\'s changes and keeps the branch\'s' },
        { id: 'd', text: 'Moves main back to its first parent' },
      ],
      correct: 'b',
      explanation:
        'Parent 1 of a merge is the branch you were on (main). -m 1 tells revert to treat it as the mainline, so the new commit cancels everything the PR branch introduced. Nothing is deleted or moved.',
    },
    {
      id: 'q-lost-forever',
      question: 'Which of these can Git NOT recover?',
      options: [
        { id: 'a', text: 'A branch deleted with git branch -D yesterday' },
        { id: 'b', text: 'A stash entry you dropped by mistake' },
        { id: 'c', text: 'Commits removed with git reset --hard' },
        { id: 'd', text: 'Edits you never added, discarded with git restore' },
      ],
      correct: 'd',
      explanation:
        'Branches, stash entries and commits are objects Git stored, so the reflog or fsck can find them until garbage collection. Edits that were never added were never stored, so once restore overwrote them, they are gone.',
    },
    {
      id: 'q-secret',
      question: 'You pushed a commit containing a live API key. What should happen first?',
      options: [
        { id: 'a', text: 'Delete the key from the file and push a new commit' },
        { id: 'b', text: 'Run git filter-repo to erase it from history' },
        { id: 'c', text: 'Revoke and rotate the key at the provider' },
        { id: 'd', text: 'Make the repository private' },
      ],
      correct: 'c',
      explanation:
        'Once pushed, the key may already be copied by clones, forks, caches or bots. Only rotating it makes the leaked value useless. Removing it from the file or the history comes after, and hiding the repo does not un-leak it.',
    },
  ],
  theoryOnly: [
    'git restore --source',
    'git clean -n / -fd',
    'stash --keep-index, list, show, apply, drop, clear, stash branch',
    'git reset --mixed',
    'reverting merges with -m 1',
    'git reset --hard origin/main',
    'ORIG_HEAD',
    'recovering a deleted branch',
    'recovering a dropped stash with git fsck --unreachable',
    'git rm --cached for committed files',
    'filter-repo / BFG and rotating secrets',
    'pre-commit secret scanners and push protection',
  ],
};

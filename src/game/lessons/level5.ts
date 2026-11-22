import type { Lesson } from '../lesson-model';

/** Level 5 lesson: rewriting history and inspecting it. Missions: src/game/levels/level5.ts. */
export const lesson5: Lesson = {
  levelId: 'rewriting',
  title: 'Rewriting history',
  summary:
    'You will understand how rebase and cherry-pick copy commits, how to clean a branch before review, how to name any commit, and how to search history for who changed what and when.',
  slides: [
    {
      kind: 'concept',
      id: 'rebase-replays',
      title: 'Rebase replays your commits',
      body:
        'While you built search on feature/search, Lea added commits to main. `git rebase main` (run on your branch) takes each of your commits since the fork point, and replays its change, one by one, on top of main\'s latest commit. Then it moves your branch label to the last replayed commit.\n\n' +
        'Commits can never be edited, so replaying means creating new commits: same changes, same messages, but a different parent and therefore a different hash. The originals are not deleted; they are just left behind, reachable through the reflog.\n\n' +
        'The result is a straight line, as if you had started the work after Lea\'s commit. No merge commit is created.',
      diagram: {
        kind: 'before-after',
        command: 'git rebase main',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'feature' },
            { id: 'S2', message: 'feat: search shortcut', parents: ['S1'], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'S2',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'old', ghost: true },
            { id: 'S2', message: 'feat: search shortcut', parents: ['S1'], lane: 'old', ghost: true },
            { id: "S1'", message: 'feat: search', parents: ['L'], lane: 'feature' },
            { id: "S2'", message: 'feat: search shortcut', parents: ["S1'"], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: "S2'",
        },
        caption: "S1' and S2' are copies with new hashes. The faded originals are only in the reflog now.",
      },
      remember: 'Rebase = replay my commits on a new base: same changes, new hashes.',
    },
    {
      kind: 'concept',
      id: 'rebase-vs-merge',
      title: 'Rebase or merge, and the force push it costs',
      body:
        'Both bring main\'s work into your branch. `git merge main` keeps history exactly as it happened and adds a merge commit with two parents. `git rebase main` rewrites your branch so it looks like it started later: linear, easier to read, but the commits are new.\n\n' +
        'New hashes have a price. If you had already pushed the branch, origin still has the old commits, so a normal push is rejected. You must replace them with `git push --force-with-lease`, which refuses if someone else pushed in the meantime.\n\n' +
        'Hence the golden rule again: rebase your own branches freely, never rebase commits other people have built on (main, a shared release branch). Many teams rebase feature branches before review and merge them into main through pull requests.',
      diagram: {
        kind: 'before-after',
        command: 'git merge main   (instead of rebase)',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'S1',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'feature' },
            { id: 'M', message: "Merge branch 'main'", parents: ['S1', 'L'], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'M',
        },
        caption: 'Merge keeps S1 and adds M. Nothing is rewritten, so no force push is ever needed.',
      },
      remember: 'Merge preserves, rebase rewrites; rewrite only what is yours, then --force-with-lease.',
    },
    {
      kind: 'concept',
      id: 'rebase-conflicts',
      title: 'When a rebase stops on a conflict',
      body:
        'Each replayed commit is a small merge, so a replay can conflict: your README line and Samir\'s npm ci line touched the same place. Git stops at that commit, marks the file with conflict markers and waits.\n\n' +
        'Fix the file, `git add` it, then `git rebase --continue` (not `git commit`). Git finishes that commit and moves on to the next one, which can stop again. `git rebase --skip` drops the current commit entirely, and `git rebase --abort` puts everything back exactly as before the rebase.\n\n' +
        'Watch the labels: during a rebase, "ours" (HEAD) is the base you are replaying onto, and "theirs" is your own commit being replayed. It is the opposite of a merge, because Git is standing on main while it copies your work.',
      diagram: {
        kind: 'code',
        title: 'A rebase that pauses',
        text:
          '$ git rebase main\n' +
          'CONFLICT (content): Merge conflict in README.md\n' +
          'error: could not apply 4c1d2e3... docs: search shortcut\n' +
          '$ nano README.md          # keep npm ci AND the shortcut, remove markers\n' +
          '$ git add README.md\n' +
          '$ git rebase --continue\n' +
          'Successfully rebased and updated refs/heads/feature/search.',
      },
      remember: 'Rebase conflict: fix, git add, git rebase --continue. Lost? git rebase --abort.',
    },
    {
      kind: 'concept',
      id: 'interactive-rebase',
      title: 'Interactive rebase: edit the plan',
      body:
        '`git rebase -i main` (or `-i HEAD~4`) opens a todo list of the commits it is about to replay, oldest at the top. You edit the list, save, and Git executes it line by line.\n\n' +
        'Each line starts with a verb: `pick` keeps the commit, `reword` keeps it but asks for a new message, `edit` stops after it so you can amend or split it, `squash` melds it into the commit above and lets you combine the messages, `fixup` melds it and throws its message away, `drop` (or deleting the line) removes it. Moving lines reorders the commits.\n\n' +
        'Use it to turn "wip", "fix typo" and "oops" commits into a few clear ones before review. Everything after the first changed line gets a new hash.',
      diagram: {
        kind: 'code',
        title: 'git rebase -i main',
        text:
          'pick   1a2b3c4 feat: search\n' +
          'fixup  7d8e9f0 fix typo in placeholder\n' +
          'reword 2b3c4d5 feat: serch shortcut\n' +
          'edit   3c4d5e6 feat: ranking and debug logs\n' +
          'squash 4d5e6f7 feat: ranking tweaks\n' +
          'drop   5e6f7a8 tmp: console.log everywhere',
      },
      remember: 'pick keeps, reword renames, edit stops, squash/fixup meld, drop removes, order = order.',
    },
    {
      kind: 'concept',
      id: 'autosquash',
      title: 'Fixups you decide on later',
      body:
        'Often you only notice a mistake after more commits: the "Serach" typo is in your first commit, two commits back. Make the fix, stage it, and run `git commit --fixup <commit>`. Git writes a commit titled `fixup! feat: search`.\n\n' +
        'Later, `git rebase -i --autosquash main` builds the todo list with every `fixup!` commit already moved under its target and marked `fixup`. You only have to save. To skip the editor completely, run it as `GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash main`, or set `rebase.autoSquash` so plain `git rebase -i` does it.\n\n' +
        '`--squash <commit>` works the same way but lets you edit the combined message, and `--fixup=reword:<commit>` changes only the target\'s message.',
      diagram: {
        kind: 'before-after',
        command: 'git commit --fixup HEAD~2 && git rebase -i --autosquash main',
        before: {
          kind: 'graph',
          commits: [
            { id: 'M', message: 'main', parents: [], lane: 'main', refs: ['main'] },
            { id: 'S', message: 'feat: search ("Serach")', parents: ['M'], lane: 'feature' },
            { id: 'K', message: 'feat: shortcut', parents: ['S'], lane: 'feature' },
            { id: 'R', message: 'feat: ranking', parents: ['K'], lane: 'feature' },
            { id: 'F', message: 'fixup! feat: search', parents: ['R'], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: 'F',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'M', message: 'main', parents: [], lane: 'main', refs: ['main'] },
            { id: "S'", message: 'feat: search ("Search")', parents: ['M'], lane: 'feature' },
            { id: "K'", message: 'feat: shortcut', parents: ["S'"], lane: 'feature' },
            { id: "R'", message: 'feat: ranking', parents: ["K'"], lane: 'feature', refs: ['HEAD → feature/search'] },
          ],
          head: "R'",
        },
        caption: 'The fix is folded into the commit that introduced the typo; no commit ever contains "Serach".',
      },
      remember: 'commit --fixup <target> now, rebase -i --autosquash later.',
    },
    {
      kind: 'concept',
      id: 'onto',
      title: '--onto, --update-refs and -x',
      body:
        '`git rebase --onto <new-base> <old-base> <branch>` replays only the commits after old-base. Typical case: feature-b was built on feature-a, and feature-a was squash-merged into main. `git rebase --onto main feature-a feature-b` moves only b\'s own commits onto main, leaving a\'s old commits behind.\n\n' +
        'With stacked branches (b on top of a on top of main), `git rebase --update-refs main` run on the top branch also moves every branch label in between, so the whole stack stays consistent in one command.\n\n' +
        '`git rebase -x "npm test" main` runs a command after each replayed commit and stops on the first failure, which proves every commit in the cleaned history still builds.',
      diagram: {
        kind: 'before-after',
        command: 'git rebase --onto main feature-a feature-b',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'Q', message: 'feature-a squashed', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'a1', message: 'feat: tags model', parents: ['A'], lane: 'a', refs: ['feature-a'] },
            { id: 'b1', message: 'feat: tag filter UI', parents: ['a1'], lane: 'b', refs: ['HEAD → feature-b'] },
          ],
          head: 'b1',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'Q', message: 'feature-a squashed', parents: ['A'], lane: 'main', refs: ['main'] },
            { id: 'a1', message: 'feat: tags model', parents: ['A'], lane: 'a', refs: ['feature-a'] },
            { id: 'b1', message: 'feat: tag filter UI', parents: ['a1'], lane: 'b', ghost: true },
            { id: "b1'", message: 'feat: tag filter UI', parents: ['Q'], lane: 'b', refs: ['HEAD → feature-b'] },
          ],
          head: "b1'",
        },
        caption: 'Only b1 moved. a1 stays out of feature-b, because main already has its content in Q.',
      },
      remember: '--onto X Y: take the commits after Y and put them on X.',
    },
    {
      kind: 'concept',
      id: 'cherry-pick',
      title: 'cherry-pick: copy one commit',
      body:
        '`git cherry-pick <commit>` takes the change introduced by one commit and applies it on the current branch as a new commit. It is how a fix from main reaches release/1.0 without bringing the rest of main along.\n\n' +
        '`-x` appends "(cherry picked from commit ...)" to the message so anyone can trace the copy back. `--no-commit` (`-n`) applies the change but lets you review or combine before committing. Conflicts work like rebase: fix, add, `git cherry-pick --continue`, or `--abort`.\n\n' +
        'Ranges follow the A..B rule: `git cherry-pick A..B` copies the commits after A up to B, so A itself is excluded. Write `A^..B` to include A.',
      diagram: {
        kind: 'before-after',
        command: 'git switch release/1.0 && git cherry-pick -x main',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit (v1.0.0)', parents: [], lane: 'release', refs: ['HEAD → release/1.0'] },
            { id: 'N', message: 'feat: notes limit', parents: ['A'], lane: 'main' },
            { id: 'F', message: 'fix: crash on empty titles', parents: ['N'], lane: 'main', refs: ['main'] },
          ],
          head: 'A',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit (v1.0.0)', parents: [], lane: 'release' },
            { id: 'N', message: 'feat: notes limit', parents: ['A'], lane: 'main' },
            { id: 'F', message: 'fix: crash on empty titles', parents: ['N'], lane: 'main', refs: ['main'] },
            { id: "F'", message: 'fix: crash on empty titles (cherry picked from F)', parents: ['A'], lane: 'release', refs: ['HEAD → release/1.0'] },
          ],
          head: "F'",
        },
        caption: "F' carries only F's change. N, the feature, stays off the release branch.",
      },
      remember: 'cherry-pick copies a commit\'s change; -x records where it came from.',
    },
    {
      kind: 'concept',
      id: 'moving-commits',
      title: 'Moving and splitting commits',
      body:
        'Committed on main instead of a feature branch, and nothing pushed? A branch is only a label, so you do not need to copy anything. `git branch feature/export` puts a new label on your current commit, then `git reset --hard HEAD~2` moves main back two commits. The two export commits now live only on feature/export.\n\n' +
        'If the target branch already exists, cherry-pick the commits onto it instead, then reset the wrong branch.\n\n' +
        'Splitting a commit is a reset too. For the last commit: `git reset HEAD~1` (mixed) leaves its changes unstaged, then `git add -p` and commit the pieces one by one. For an older commit: mark it `edit` in `git rebase -i`, and when Git stops, do the same reset and commits, then `git rebase --continue`.',
      diagram: {
        kind: 'before-after',
        command: 'git branch feature/export && git reset --hard HEAD~2',
        before: {
          kind: 'graph',
          commits: [
            { id: 'F', message: 'fix: crash on empty titles', parents: [], lane: 'main' },
            { id: 'E1', message: 'feat: export to markdown', parents: ['F'], lane: 'main' },
            { id: 'E2', message: 'feat: export to PDF', parents: ['E1'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'E2',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'F', message: 'fix: crash on empty titles', parents: [], lane: 'main', refs: ['HEAD → main'] },
            { id: 'E1', message: 'feat: export to markdown', parents: ['F'], lane: 'export' },
            { id: 'E2', message: 'feat: export to PDF', parents: ['E1'], lane: 'export', refs: ['feature/export'] },
          ],
          head: 'F',
        },
        caption: 'Same commits, same hashes: only the labels moved.',
      },
      remember: 'Wrong branch: new label on the work, then reset the old label back.',
    },
    {
      kind: 'concept',
      id: 'revisions',
      title: 'Naming any commit',
      body:
        '`~` walks back along first parents: `HEAD~1` is the parent, `HEAD~3` the great-grandparent. `^` picks a parent of a merge: `HEAD^` (= `HEAD^1`) is the first parent, the branch you merged into, and `HEAD^2` is the second, the tip of the branch that was merged.\n\n' +
        '`A..B` means "reachable from B but not from A": `git log main..feature` lists what feature has that main lacks. `A...B` in log means "on either side but not both"; in `git diff A...B` it means "changes on B since it forked from A", which is what a pull request shows.\n\n' +
        '`@{u}` is the upstream of the current branch (`git log @{u}..` = what you have not pushed), `@{-1}` the branch you were on before, `main@{yesterday}` where main pointed yesterday on this machine (from the reflog). `git rev-parse <name>` prints the full hash any of these resolve to.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD~2'] },
          { id: 'B', message: 'docs: install', parents: ['A'], lane: 'main', refs: ['HEAD~1 = HEAD^'] },
          { id: 'T', message: 'feat: tags', parents: ['A'], lane: 'feature', refs: ['HEAD^2'] },
          { id: 'M', message: 'Merge feature/tags', parents: ['B', 'T'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M',
        caption: '~ counts generations along the first parent; ^2 chooses the merged side.',
      },
      remember: '~n = n generations back, ^2 = merged side, A..B = in B not in A.',
    },
    {
      kind: 'concept',
      id: 'searching-log',
      title: 'Searching history with log',
      body:
        '`git log -p` shows each commit with its patch; add `-- path` to stay on one file and `--follow` to keep following it across renames. `--grep "sync"` searches commit messages, which only helps if the message says what you are looking for.\n\n' +
        'The pickaxe searches the changes themselves. `git log -S "sync=every 5 min"` lists commits that changed how many times that exact string appears, which means the commit that added it and the one that removed it. `git log -G "every [0-9]+ min"` takes a regular expression and matches any added or removed line, including edits that move the text around.\n\n' +
        '`--format="%h %an %ar %s"` prints exactly the fields you want (hash, author, relative date, subject). `git shortlog -sn` counts commits per author, `git diff v1.0.0..main --stat` summarises what changed between two points, and `git difftool` opens the same diff in a visual tool.',
      diagram: {
        kind: 'code',
        title: 'Who made sync poll every 5 minutes?',
        text:
          '$ git log --grep sync --oneline\n' +
          '(nothing: the message does not say "sync")\n' +
          '$ git log -S "sync=every 5 min" --oneline\n' +
          '8e2f1a9 chore: tune defaults\n' +
          '$ git show 8e2f1a9 -- config.txt\n' +
          '-sync=every 30 s\n' +
          '+sync=every 5 min',
      },
      remember: '--grep searches messages; -S and -G search the code that changed.',
    },
    {
      kind: 'concept',
      id: 'blame-and-friends',
      title: 'blame, git grep, range-diff and bisect',
      body:
        '`git blame config.txt` shows, for each line, the last commit that touched it. `-w` ignores whitespace changes and `-C` follows lines moved or copied from other files. A big reformat commit makes blame useless; list its hash in `.git-blame-ignore-revs` and run `git blame --ignore-revs-file .git-blame-ignore-revs` (or set `blame.ignoreRevsFile`; GitHub reads that file automatically). `git grep "API_KEY"` searches tracked files fast, and `git grep "x" v1.0.0` searches an old version without checking it out.\n\n' +
        '`git range-diff main feature@{1} feature` compares two versions of a commit series, for example before and after a rebase, commit by commit. Reviewers use it to see what you changed between pushes.\n\n' +
        '`git bisect` finds the commit that broke something by binary search. Give it a bad and a good commit (`git bisect start HEAD v1.0.0`), then answer good or bad for each commit it checks out, or let a script answer: `git bisect run sh test.sh` (exit 0 = good, 1 to 127 = bad, 125 = cannot test, skip). About log2(n) steps: 1000 commits need about 10. `git bisect reset` returns you to where you started.',
      diagram: {
        kind: 'code',
        title: 'git bisect run',
        text:
          '$ git bisect start HEAD v1.0.0\n' +
          'Bisecting: 6 revisions left to test after this (roughly 3 steps)\n' +
          '$ git bisect run sh test.sh\n' +
          '...\n' +
          '5d6e7f8 is the first bad commit\n' +
          '    refactor: limits loader\n' +
          '$ git tag first-bad refs/bisect/bad\n' +
          '$ git bisect reset',
      },
      remember: 'blame = who last touched a line; bisect = which commit broke it.',
    },
    {
      kind: 'concept',
      id: 'tags',
      title: 'Tags and version numbers',
      body:
        'A tag is a name for one commit that never moves. A lightweight tag (`git tag v1.1.0`) is just a ref, like a branch that stays put. An annotated tag (`git tag -a v1.1.0 -m "Nova 1.1.0"`) is a real object with tagger, date and message, and can be signed. Use annotated tags for releases.\n\n' +
        '`git tag -l "v1.*"` lists, `git tag -d v1.1.0` deletes locally, `git push origin v1.1.0` publishes one tag (a plain push sends none), `git push --follow-tags` sends annotated tags reachable from what you push, and `git push origin --delete v1.1.0` removes it from the server. Checking out a tag gives a detached HEAD: look, then `git switch -c` if you want to work there.\n\n' +
        'Semantic versioning reads MAJOR.MINOR.PATCH: breaking change, new feature, bug fix. `git describe` names the current commit from the nearest annotated tag: `v1.1.0-2-g3f4e5a6` means two commits after v1.1.0, at commit 3f4e5a6 (the g stands for git).',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'R', message: 'release: 1.1.0', parents: [], lane: 'main', refs: ['v1.1.0'] },
          { id: 'W1', message: 'wip: tag colors', parents: ['R'], lane: 'main' },
          { id: 'W2', message: 'wip: tag picker', parents: ['W1'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'W2',
        caption: 'git describe here prints v1.1.0-2-g<hash>: the tag, two commits since, and the current commit.',
      },
      remember: 'Release = annotated tag, pushed explicitly; describe = nearest tag + distance.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'History commands',
      rows: [
        { command: 'git rebase main', does: 'Replay the current branch\'s commits on top of main (new hashes).' },
        { command: 'git rebase --continue / --skip / --abort', does: 'After fixing a conflict / drop this commit / cancel the whole rebase.' },
        { command: 'git rebase -i main', does: 'Edit the replay plan: pick, reword, edit, squash, fixup, drop, reorder.' },
        { command: 'git commit --fixup <commit>', does: 'Record a fix meant to be folded into <commit> later.' },
        { command: 'git rebase -i --autosquash main', does: 'Fold every fixup! commit into its target.' },
        { command: 'git rebase --onto <new> <old> <branch>', does: 'Move only the commits after <old> onto <new>.' },
        { command: 'git rebase --update-refs main', does: 'Rebase a stack and move the branch labels inside it too.' },
        { command: 'git rebase -x "npm test" main', does: 'Run tests after every replayed commit.' },
        { command: 'git push --force-with-lease', does: 'Replace your rewritten branch on origin, unless someone else pushed.', danger: true },
        { command: 'git cherry-pick -x <commit>', does: 'Copy one commit onto the current branch, noting its origin.' },
        { command: 'git cherry-pick A^..B', does: 'Copy a range including A (A..B excludes A).' },
        { command: 'git rev-parse HEAD~2', does: 'Print the full hash a name resolves to.' },
        { command: 'git log main..feature', does: 'Commits on feature that main does not have.' },
        { command: 'git log -p --follow -- <file>', does: 'Full patch history of one file, across renames.' },
        { command: 'git log -S "text" / -G "regex"', does: 'Commits whose changes add or remove the text / a matching line.' },
        { command: 'git log --grep "word"', does: 'Search commit messages.' },
        { command: 'git log --format="%h %an %ar %s"', does: 'Custom one-line output.' },
        { command: 'git blame -w -C <file>', does: 'Last commit per line, ignoring whitespace and following moved lines.' },
        { command: 'git grep "text" [<commit>]', does: 'Search tracked files, now or at any commit.' },
        { command: 'git shortlog -sn', does: 'Commit count per author.' },
        { command: 'git range-diff main old new', does: 'Compare two versions of a commit series.' },
        { command: 'git bisect start <bad> <good> / run <cmd> / reset', does: 'Binary-search the commit that broke something.' },
        { command: 'git tag -a v1.1.0 -m "msg" [<commit>]', does: 'Annotated release tag.' },
        { command: 'git push origin v1.1.0', does: 'Publish a tag (push does not send tags by default).' },
        { command: 'git describe', does: 'Name the current commit from the nearest annotated tag.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'History mistakes and the way out',
      items: [
        {
          mistake: 'Rebasing main (or any branch others pull) and force-pushing it.',
          fix: 'Teammates now have commits that no longer exist upstream. Only rebase your own branches; to undo, git reset --hard ORIG_HEAD or use the reflog, then push --force-with-lease back.',
        },
        {
          mistake: 'Running git commit in the middle of a rebase conflict.',
          fix: 'Use git rebase --continue after git add; it creates the commit for you with the original message.',
        },
        {
          mistake: 'Lost in a rebase that keeps stopping on conflicts.',
          fix: 'git rebase --abort returns to exactly where you started. Consider merging main instead, or rebase in smaller steps.',
        },
        {
          mistake: 'Push rejected after a rebase or amend on your feature branch.',
          fix: 'Expected: the hashes changed. git push --force-with-lease, never plain --force.',
        },
        {
          mistake: 'git cherry-pick A..B and commit A is missing.',
          fix: 'A..B excludes A. Use git cherry-pick A^..B.',
        },
        {
          mistake: 'Searching with --grep for a change whose message does not mention it.',
          fix: 'Search the diff instead: git log -S "exact text" or git log -G "regex".',
        },
        {
          mistake: 'Forgot git bisect reset and wondering why HEAD is detached.',
          fix: 'Run git bisect reset to return to your branch.',
        },
        {
          mistake: 'Tagged a release, pushed, and the tag is not on GitHub.',
          fix: 'git push does not send tags: git push origin v1.1.0 (or --follow-tags).',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-rebase-hashes',
      question: 'You run git rebase main on feature/search (two commits). What happens to those two commits?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'L', message: 'docs: install steps', parents: ['A'], lane: 'main', refs: ['main'] },
          { id: 'S1', message: 'feat: search', parents: ['A'], lane: 'feature' },
          { id: 'S2', message: 'feat: search shortcut', parents: ['S1'], lane: 'feature', refs: ['HEAD → feature/search'] },
        ],
        head: 'S2',
      },
      options: [
        { id: 'a', text: 'Git edits their parent field, so they keep their hashes' },
        { id: 'b', text: 'Git makes two new commits on top of L; the originals stay reachable only via the reflog' },
        { id: 'c', text: 'Git squashes them into one commit on top of L' },
        { id: 'd', text: 'Git creates a merge commit joining S2 and L' },
      ],
      correct: 'b',
      explanation:
        'A commit\'s hash covers its parent, and commits cannot be edited, so replaying onto L means creating new commits with new hashes. No squashing and no merge commit happen in a plain rebase.',
    },
    {
      id: 'q-rebase-continue',
      question: 'A rebase stopped on a README conflict. You edited README.md and removed the markers. What next?',
      options: [
        { id: 'a', text: 'git commit -am "resolve conflict"' },
        { id: 'b', text: 'git add README.md, then git rebase --continue' },
        { id: 'c', text: 'git rebase --skip' },
        { id: 'd', text: 'git merge --continue' },
      ],
      correct: 'b',
      explanation:
        'Staging marks the conflict as resolved, and --continue lets the rebase finish this commit and replay the rest. --skip would drop your commit; a manual commit would add an extra one.',
    },
    {
      id: 'q-head-caret-2',
      question: 'HEAD is the merge commit M. Which commit is HEAD^2?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'B', message: 'docs: install', parents: ['A'], lane: 'main' },
          { id: 'T', message: 'feat: tags', parents: ['A'], lane: 'feature' },
          { id: 'M', message: 'Merge feature/tags', parents: ['B', 'T'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M',
      },
      options: [
        { id: 'a', text: 'A, two generations back' },
        { id: 'b', text: 'B, the first parent' },
        { id: 'c', text: 'T, the second parent' },
        { id: 'd', text: 'It is an error: M has no grandparent named ^2' },
      ],
      correct: 'c',
      explanation:
        '^n chooses the nth parent of a merge: ^1 is the branch merged into (B), ^2 the branch that was merged (T). HEAD~2 would be A, two generations back along first parents.',
    },
    {
      id: 'q-dot-dot',
      question: 'What does git log main..feature/search list?',
      options: [
        { id: 'a', text: 'Commits on main that feature/search does not have' },
        { id: 'b', text: 'Commits on feature/search that main does not have' },
        { id: 'c', text: 'All commits of both branches' },
        { id: 'd', text: 'Commits on either branch but not both' },
      ],
      correct: 'b',
      explanation:
        'A..B means reachable from B but not from A: the work your branch would bring into main. "Either but not both" is the three-dot form, main...feature/search.',
    },
    {
      id: 'q-pickaxe',
      question: 'The line sync=every 5 min appeared in config.txt at some point, and no commit message mentions sync. Fastest way to find that commit?',
      options: [
        { id: 'a', text: 'git log --grep "sync"' },
        { id: 'b', text: 'git log -S "sync=every 5 min"' },
        { id: 'c', text: 'git shortlog -sn' },
        { id: 'd', text: 'git grep "sync=every 5 min"' },
      ],
      correct: 'b',
      explanation:
        '-S searches the changes for commits that added or removed the string. --grep only reads messages, shortlog counts authors, and git grep searches the current files (it tells you where the line is now, not when it arrived).',
    },
    {
      id: 'q-bisect',
      question: 'test.sh passed 1000 commits ago and fails today. Roughly how many test runs does git bisect need to find the first bad commit?',
      options: [
        { id: 'a', text: 'About 10' },
        { id: 'b', text: 'About 100' },
        { id: 'c', text: 'About 500' },
        { id: 'd', text: '1000, one per commit' },
      ],
      correct: 'a',
      explanation:
        'Each test halves the range: 1000, 500, 250 ... about log2(1000), so roughly 10 runs. That is why bisect is worth it even on long histories.',
    },
    {
      id: 'q-cherry-range',
      question: 'You run git cherry-pick C2..C5 on release/1.0. Which commits are copied?',
      options: [
        { id: 'a', text: 'C2, C3, C4 and C5' },
        { id: 'b', text: 'C3, C4 and C5' },
        { id: 'c', text: 'Only C2 and C5' },
        { id: 'd', text: 'C2, C3 and C4' },
      ],
      correct: 'b',
      explanation:
        'A..B excludes A, the same rule as git log A..B. To include C2, write git cherry-pick C2^..C5.',
    },
    {
      id: 'q-describe',
      question: 'git describe prints v1.1.0-2-g3f4e5a6. What does that tell you?',
      options: [
        { id: 'a', text: 'You are on version 1.1.2' },
        { id: 'b', text: 'HEAD is commit 3f4e5a6, two commits after the v1.1.0 tag' },
        { id: 'c', text: 'The tag v1.1.0 has two parents' },
        { id: 'd', text: 'There are two tags pointing at 3f4e5a6' },
      ],
      correct: 'b',
      explanation:
        'describe reports the nearest annotated tag, the number of commits since it, and g plus the short hash of the current commit. It never invents a version number.',
    },
  ],
  theoryOnly: [
    'rebase vs merge',
    'git rebase --skip / --abort',
    'interactive rebase verbs (pick, reword, edit, squash, drop, reorder)',
    'git rebase --onto',
    'git rebase --update-refs',
    'git rebase -x',
    'force push after rewriting',
    'cherry-pick ranges and --no-commit',
    'splitting a commit',
    'HEAD^, HEAD^2, A..B, A...B, @{u}, @{-1}, main@{yesterday}, rev-parse',
    'git log -p, --follow, -G, --grep, --format',
    'git blame -w -C and ignore-revs',
    'git grep',
    'git shortlog -sn',
    'git diff A..B --stat and difftool',
    'git range-diff',
    'lightweight tags; list, delete, push and checkout tags',
    'semantic versioning',
  ],
};

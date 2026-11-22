/**
 * Lesson 2: Branches and conflicts. Missions: src/game/levels/level2.ts (search branch, which label moves,
 * detached HEAD at v1.0, fast-forward vs three-way, --no-ff, cleanup, conflict by hand, merge --abort).
 * Guide: docs/LESSON-GUIDE.md.
 */
import type { Lesson } from '../lesson-model';

export const lesson2: Lesson = {
  levelId: 'branches',
  title: 'Branches, merges and conflicts',
  summary:
    'You will see branches as movable labels on a commit graph, predict whether a merge fast-forwards or creates a merge commit, and resolve or abort a conflict calmly.',
  slides: [
    {
      kind: 'concept',
      id: 'branch-label',
      title: 'A branch is a label',
      body:
        'A branch is not a copy of the project. It is a tiny file in .git/refs/heads/ that holds one commit hash. Creating a branch writes 41 bytes; that is why branches in Git are instant and cheap.\n\n`git branch search` creates the label on the commit you are on. `git switch search` attaches HEAD to it. `git switch -c search` does both in one step.\n\n`git branch` lists your branches (* marks the current one), -v adds each tip commit, -vv adds the upstream, -a includes remote-tracking branches like origin/main.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main', 'tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['HEAD → search'] },
        ],
        head: 'B',
        caption: 'After git switch -c search and a commit: main still points at A.',
      },
      remember: 'A branch is a named pointer to one commit, nothing more.',
    },
    {
      kind: 'concept',
      id: 'head-moves',
      title: 'Which label moves on commit',
      body:
        'When you commit, Git writes the new commit with the current commit as its parent, then moves the branch HEAD is attached to. Every other branch stays exactly where it was.\n\nSo to fix login.ts on main while your search work waits, switch to main first, commit there, and come back with `git switch -`, which returns to the previous branch like cd -.\n\nUncommitted changes are not on any branch: they travel with you when you switch. If switching would overwrite one of them, Git refuses with "Your local changes would be overwritten" and changes nothing. Commit or stash first.',
      diagram: {
        kind: 'before-after',
        command: 'git switch main && git commit -am "fix: login crash"',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main'] },
            { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['HEAD → search'] },
          ],
          head: 'B',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
            { id: 'C', message: 'fix: login crash', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'C',
        },
        caption: 'Only main moved. The two branches have now diverged from A.',
      },
      remember: 'Commit moves the branch HEAD points to, and only that one.',
    },
    {
      kind: 'concept',
      id: 'switch-vs-checkout',
      title: 'switch and restore vs checkout',
      body:
        'For years `git checkout` did two unrelated jobs: moving between branches and overwriting files with another version. A typo could turn one into the other and silently discard work.\n\nGit 2.23 split it. `git switch` only moves HEAD between branches. `git restore` only puts back file contents. checkout still works, and you will see it in older docs and scripts, so learn to translate.\n\nThe file forms are the dangerous ones: `git restore app.ts` and `git checkout -- app.ts` both throw away your unstaged edits with no undo.',
      diagram: {
        kind: 'code',
        title: 'Old form -> new form',
        text: 'git checkout search          ->  git switch search\ngit checkout -b search       ->  git switch -c search\ngit checkout -               ->  git switch -\ngit checkout v1.0            ->  git switch --detach v1.0\ngit checkout -- app.ts       ->  git restore app.ts\ngit checkout main -- app.ts  ->  git restore --source main app.ts',
      },
      remember: 'switch moves you, restore changes files; checkout does both, so read it twice.',
    },
    {
      kind: 'concept',
      id: 'detached-head',
      title: 'Detached HEAD',
      body:
        'Normally HEAD points to a branch and the branch points to a commit. Check out a tag or a hash (`git switch --detach v1.0`, or the old `git checkout v1.0`) and HEAD points straight at a commit: a detached HEAD. It is a normal, useful state for looking around or reproducing an old bug.\n\nYou can even commit there. But no branch moves, so the new commits are reachable only through HEAD. Switch away and Git warns "you are leaving 1 commit behind, not connected to any of your branches".\n\nThe fix is one command, run before you leave: `git switch -c v1-repro` puts a branch on the commit you are on. (If you already left, the reflog in level 4 still finds it.)',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'main' },
          { id: 'C', message: 'fix: login crash', parents: ['B'], lane: 'main', refs: ['main'] },
          { id: 'R', message: 'test: repro on v1.0', parents: ['A'], lane: 'detached', refs: ['HEAD (detached)'] },
        ],
        head: 'R',
        caption: 'R belongs to no branch. git switch -c v1-repro gives it one.',
      },
      remember: 'Detached HEAD: run git switch -c <name> before you leave.',
    },
    {
      kind: 'concept',
      id: 'fast-forward',
      title: 'Merge base and fast-forward',
      body:
        'Every merge starts from the merge base: the most recent commit both branches share. `git merge-base main export` prints it.\n\nIf the merge base is main itself, main has not moved since export was created. There is nothing to combine: Git just slides the main label forward to export\'s tip. That is a fast-forward. No new commit, and the output says "Fast-forward".\n\n`git merge --ff-only export` merges only if a fast-forward is possible and otherwise stops with "Not possible to fast-forward". It is a safe way to say "catch up, but do not surprise me".',
      diagram: {
        kind: 'before-after',
        command: 'git merge export',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main'] },
            { id: 'E', message: 'feat: CSV export', parents: ['A'], lane: 'export', refs: ['export'] },
          ],
          head: 'A',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'E', message: 'feat: CSV export', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'export'] },
          ],
          head: 'E',
        },
        caption: 'Merge base = A = main, so main just moves to E.',
      },
      remember: 'If main is the merge base, merging only moves the label.',
    },
    {
      kind: 'concept',
      id: 'three-way',
      title: 'Three-way merge and the merge commit',
      body:
        'When both branches have new commits since the merge base, a fast-forward is impossible. Git does a three-way merge: it compares the base with each tip, keeps every change made on either side, and writes a merge commit with two parents.\n\nThe first parent is the branch you were on (main), the second is the branch you merged (search). `git log --first-parent main` follows only first parents, so it reads as "one line per thing that landed on main".\n\nThe default strategy since Git 2.34 is called ort (it replaced recursive). You rarely need to name it.',
      diagram: {
        kind: 'before-after',
        command: 'git merge search',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit (merge base)', parents: [], lane: 'main' },
            { id: 'S', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
            { id: 'L', message: 'fix: login crash', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'L',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit (merge base)', parents: [], lane: 'main' },
            { id: 'S', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
            { id: 'L', message: 'fix: login crash', parents: ['A'], lane: 'main' },
            { id: 'M', message: "Merge branch 'search'", parents: ['L', 'S'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'M',
        },
        caption: 'M has two parents: L (first, main) and S (second, search).',
      },
      remember: 'Both sides moved: base + ours + theirs -> a merge commit with two parents.',
    },
    {
      kind: 'concept',
      id: 'merge-options',
      title: '--no-ff, --ff-only and --squash',
      body:
        '--no-ff writes a merge commit even when a fast-forward was possible. The feature then stays visible as a bubble in the graph, and one revert of the merge commit can undo the whole feature.\n\n--ff-only is the opposite: fast-forward or nothing. Good for keeping main linear and for "just catch up".\n\n--squash applies all the branch\'s changes to your index as one change, but does not commit and does not record a merge. You then commit once. The branch is not marked as merged afterwards, so `git branch -d` refuses it and you need -D. GitHub\'s "Squash and merge" button does the same thing on the server.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Merge export and search', parents: [], lane: 'main' },
          { id: 'D1', message: 'feat: dark colours', parents: ['A'], lane: 'dark-mode' },
          { id: 'D2', message: 'feat: dark mode toggle', parents: ['D1'], lane: 'dark-mode', refs: ['dark-mode'] },
          { id: 'M', message: "Merge branch 'dark-mode'", parents: ['A', 'D2'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'M',
        caption: 'git merge --no-ff dark-mode: a merge commit although main could have fast-forwarded.',
      },
      remember: '--no-ff keeps the bubble, --ff-only refuses one, --squash flattens without merging.',
    },
    {
      kind: 'concept',
      id: 'conflicts-why',
      title: 'Why conflicts happen',
      body:
        'Git merges changes, not files. If Lea changed line 1 of README.md on main and Samir changed line 1 on redesign, both changes touch the same lines compared with the merge base. Git cannot pick, so it stops and asks you. Changes to different parts of the same file merge cleanly.\n\nOther conflict types: one side modified a file the other deleted (modify/delete), or both added a file with the same name (add/add). `git status` lists every conflicted path under "Unmerged paths" (UU, UD, AA in short form).\n\nIn the file, Git writes both versions between markers. With `git config --global merge.conflictStyle zdiff3`, it also shows the base between ||||||| and =======, which makes it much easier to see what each side actually changed.',
      diagram: {
        kind: 'code',
        title: 'README.md during the merge (zdiff3 style)',
        text: '<<<<<<< HEAD\n# Nova: fast offline notes.\n||||||| 132e22a\n# Nova notes\n=======\n# Nova: notes for small teams.\n>>>>>>> redesign',
      },
      remember: 'Same lines changed on both sides since the base = conflict; markers show ours, base, theirs.',
    },
    {
      kind: 'concept',
      id: 'resolving',
      title: 'Resolving, or backing out',
      body:
        'A stopped merge is a pause, not a failure. For each conflicted file, write the content you want to ship (one side, the other, or a mix) and delete every marker line. `git add <file>` marks it resolved. When none are left, `git merge --continue` (or `git commit`) writes the merge commit.\n\nTo take one whole side of a file: `git checkout --ours theme.css` (your branch) or `--theirs` (the branch being merged), then git add. Careful during a rebase: there "ours" is the branch you are rebasing onto, so the two words swap meaning.\n\nNot the right moment? `git merge --abort` restores the files and index to exactly how they were before git merge. The other branch is untouched; merge it again later.',
      diagram: {
        kind: 'code',
        title: 'Terminal',
        text: '$ git merge redesign\nCONFLICT (content): Merge conflict in README.md\nCONFLICT (content): Merge conflict in theme.css\nAutomatic merge failed; fix conflicts and then commit the result.\n\n$ nano README.md                 # write the final text, remove markers\n$ git checkout --theirs theme.css\n$ git add README.md theme.css\n$ git merge --continue',
      },
      remember: 'Markers out, git add, git merge --continue; or git merge --abort.',
    },
    {
      kind: 'concept',
      id: 'hard-conflicts',
      title: 'Binary files, lockfiles, merge tools and rerere',
      body:
        'Binary files (images, PDFs, design files) cannot be merged line by line. Git keeps your version on disk and reports the conflict: choose one side with --ours or --theirs, or redo the change by hand.\n\nGenerated files like package-lock.json conflict often and are pointless to edit. Take one side (usually the branch you merge into), then run the tool that generates them (`npm install`) and add the result.\n\n`git mergetool` opens a visual three-pane tool you configure (VS Code, opendiff from Xcode, and others). And `git config --global rerere.enabled true` makes Git remember how you resolved a conflict and replay that resolution if the same conflict comes back, which helps when you merge the same long-lived branch repeatedly.\n\nPrevention beats all of this: small branches, merge or rebase main into them often, and agree on a formatter so whitespace never conflicts.',
      remember: 'Binary: pick a side. Lockfile: pick a side and regenerate. Repeats: rerere.',
    },
    {
      kind: 'concept',
      id: 'branch-hygiene',
      title: 'Naming, lifetime and cleanup',
      body:
        'Name branches by purpose, in lowercase with dashes, often with a type prefix and a ticket number: feature/offline-sync, fix/login-crash, docs/readme-tagline. `git branch -m new-name` renames the current branch.\n\nLong-lived branches (main, sometimes release/2.x) live forever and are protected. Short-lived branches carry one task and should last days, not months: the longer a branch lives, the further it drifts and the bigger its conflicts.\n\nAfter merging, delete the label. `git branch --merged main` lists branches whose commits are all in main; `git branch -d` deletes those and refuses unmerged ones. `git branch -D` deletes regardless: the commits only remain findable through the reflog.',
      diagram: {
        kind: 'code',
        title: 'Cleaning up',
        text: '$ git branch --merged main\n  dark-mode\n  export\n* main\n  search\n$ git branch -d search export dark-mode\n$ git branch -d v1-repro\nerror: the branch \'v1-repro\' is not fully merged\n$ git branch -D v1-repro      # only when you mean it',
      },
      remember: 'Short-lived branches, clear names, -d after merging; -D only on purpose.',
    },
    {
      kind: 'concept',
      id: 'visual-tools',
      title: 'Seeing more: diff viewers and Git UIs',
      body:
        'Everything in this game is plain git in a terminal, and that stays the ground truth. But graphs and diffs are easier to read with a better viewer, and you will read a lot of diffs, many of them written by agents.\n\n' +
        'Diff viewers plug into Git. delta (`brew install git-delta`) is a pager: with `git config --global core.pager delta`, every diff, `log -p` and `show` gets syntax colours, line numbers and word-level highlights. It changes how lines look, not which lines differ. difftastic (`brew install difftastic`, command `difft`) compares the syntax instead of lines, so re-indented or re-wrapped code no longer counts as a change. Try it once with `GIT_EXTERNAL_DIFF=difft git diff`, or make it the default with `git config --global diff.external difft` (then `git log -p` needs `--ext-diff`). Plain Git can do part of this too: `git diff -w` ignores whitespace.\n\n' +
        'Terminal UIs run in the same window. `tig` browses history, blame and diffs from the keyboard. `lazygit` shows status, branches, the graph and stashes side by side, and stages single lines, amends, rebases and resolves conflicts with one key each.\n\n' +
        'Desktop apps: GitHub Desktop (free and simple, made for GitHub), VS Code\'s Source Control panel with the GitLens extension (who changed each line, a commit graph, branch comparisons), and others such as GitKraken, Sourcetree or Fork. They all run the same Git underneath, so every button is a command you now know. When one surprises you, `git status` and `git log --oneline --graph --all` show what really happened.',
      diagram: {
        kind: 'code',
        title: '~/.gitconfig',
        text:
          '[core]\n' +
          '    pager = delta\n' +
          '[interactive]\n' +
          '    diffFilter = delta --color-only   # git add -p in colour too\n' +
          '[delta]\n' +
          '    navigate = true                   # n and N jump between files\n' +
          '    side-by-side = true\n' +
          '\n' +
          '$ GIT_EXTERNAL_DIFF=difft git diff    # one structural diff\n' +
          '$ lazygit                             # full-screen Git in the terminal',
      },
      remember: 'A viewer changes how a diff looks; difftastic changes what counts as a change; the history is the same.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Branch and merge commands',
      rows: [
        { command: 'git branch (-v, -vv, -a)', does: 'Lists branches (with tips, upstreams, remote-tracking branches).' },
        { command: 'git switch -c <name>', does: 'Creates a branch here and moves HEAD onto it.' },
        { command: 'git switch <name> / git switch -', does: 'Moves to a branch / back to the previous one.' },
        { command: 'git switch --detach <tag|hash>', does: 'Looks at an old commit without a branch (detached HEAD).' },
        { command: 'git branch -m <new>', does: 'Renames the current branch.' },
        { command: 'git merge-base A B', does: 'Prints the common ancestor that a merge starts from.' },
        { command: 'git merge <branch>', does: 'Fast-forwards if possible, otherwise writes a merge commit.' },
        { command: 'git merge --no-ff / --ff-only <branch>', does: 'Always a merge commit / only a fast-forward.' },
        { command: 'git merge --squash <branch>', does: 'Stages the branch\'s changes as one; you commit. Not recorded as a merge.' },
        { command: 'git merge -X theirs <branch>', does: 'Merges normally but resolves conflicting hunks in favour of the other side.' },
        { command: 'git merge --continue / --abort', does: 'Finishes a merge after resolving / cancels it and restores the pre-merge state.' },
        { command: 'git checkout --ours | --theirs <file>', does: 'During a conflict, takes one side of the whole file (then git add).' },
        { command: 'git branch --merged / --no-merged', does: 'Branches whose commits are / are not all in the current branch.' },
        { command: 'git branch -d <name>', does: 'Deletes a merged branch label.' },
        { command: 'git branch -D <name>', does: 'Deletes a branch even if unmerged.', danger: true },
        { command: 'git merge -s ours <branch>', does: 'Records a merge but keeps only your side, discarding all their changes.', danger: true },
        { command: 'git diff -w  /  GIT_EXTERNAL_DIFF=difft git diff', does: 'Ignore whitespace changes / compare syntax instead of lines (difftastic).' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Branch and merge pitfalls',
      items: [
        {
          mistake: 'You committed on main when you meant to be on your feature branch.',
          fix: 'git branch feature (label the commit), then git reset --hard HEAD~1 on main if it is not pushed. Show the branch in your prompt to avoid it.',
        },
        {
          mistake: 'You committed in detached HEAD and switched away; the commit seems gone.',
          fix: 'Git printed its hash when you left. git branch rescue <hash>. Lost the hash? git reflog lists it.',
        },
        {
          mistake: 'git switch refuses: "Your local changes would be overwritten".',
          fix: 'Commit the work, or git stash, switch, and git stash pop later.',
        },
        {
          mistake: 'You committed a file that still contains <<<<<<< and >>>>>>> lines.',
          fix: 'Fix the file and commit again. Before git add, search for markers: git diff --check flags them.',
        },
        {
          mistake: 'Halfway through resolving, you are lost and the merge is a mess.',
          fix: 'git merge --abort and start over, maybe with merge.conflictStyle zdiff3 for clearer markers.',
        },
        {
          mistake: 'You used -s ours expecting "prefer my side on conflicts".',
          fix: 'That is -X ours. -s ours throws away every change from the other branch, even ones that did not conflict.',
        },
        {
          mistake: 'You hand-edited a conflicted package-lock.json.',
          fix: 'Take one side (git checkout --ours package-lock.json), run npm install, git add the regenerated file.',
        },
        {
          mistake: 'git branch -d says "not fully merged" after a squash merge.',
          fix: 'A squash merge does not record the branch as merged. Check the changes are on main, then use -D.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-who-moves',
      question: 'HEAD is attached to search. You commit. Which labels move?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['main', 'tag: v1.0'] },
          { id: 'B', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['HEAD → search'] },
        ],
        head: 'B',
      },
      options: [
        { id: 'a', text: 'search and main both move to the new commit.' },
        { id: 'b', text: 'Only search (and HEAD with it).' },
        { id: 'c', text: 'Only HEAD; search stays on B until you push.' },
        { id: 'd', text: 'search moves, and the tag v1.0 follows it.' },
      ],
      correct: 'b',
      explanation:
        'Committing moves the branch HEAD is attached to. main and the tag stay where they are; tags never move on their own.',
    },
    {
      id: 'q-ff',
      question: 'main is at A. export has two commits on top of A, and main has nothing new. What does git merge export do on main?',
      options: [
        { id: 'a', text: 'Creates a merge commit with two parents.' },
        { id: 'b', text: 'Moves main to export\'s tip without creating a commit.' },
        { id: 'c', text: 'Copies the two commits onto main with new hashes.' },
        { id: 'd', text: 'Stops and asks you to choose between merge and rebase.' },
      ],
      correct: 'b',
      explanation:
        'The merge base of main and export is A, which is main itself, so Git fast-forwards: the main label slides to export\'s tip. Use --no-ff if you want a merge commit anyway.',
    },
    {
      id: 'q-three-way',
      question: 'In this graph you run git merge search on main. What is the result?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'S', message: 'feat: search draft', parents: ['A'], lane: 'search', refs: ['search'] },
          { id: 'L', message: 'fix: login crash', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'L',
      },
      options: [
        { id: 'a', text: 'A fast-forward of main to S, losing L.' },
        { id: 'b', text: 'A new commit M with parents L and S; main moves to M, search stays on S.' },
        { id: 'c', text: 'A new commit M on search; main is unchanged.' },
        { id: 'd', text: 'A conflict, always, because both branches changed.' },
      ],
      correct: 'b',
      explanation:
        'Both sides have commits since the base A, so Git combines them in a merge commit on the current branch (main). It conflicts only if both changed the same lines, which is not the case for search.ts and login.ts.',
    },
    {
      id: 'q-detached',
      question: 'You ran git switch --detach v1.0 and committed repro.md. What should you run before switching back to main?',
      options: [
        { id: 'a', text: 'git push' },
        { id: 'b', text: 'git switch -c v1-repro' },
        { id: 'c', text: 'git tag -d v1.0' },
        { id: 'd', text: 'Nothing: the commit is saved on v1.0.' },
      ],
      correct: 'b',
      explanation:
        'In detached HEAD no branch moves, so only HEAD reaches the new commit. Creating a branch there keeps it reachable. Tags never move, so v1.0 still points at the old commit.',
    },
    {
      id: 'q-markers',
      question: 'You run git merge redesign on main and README.md shows a conflict. Which part is Samir\'s version from redesign?',
      diagram: {
        kind: 'code',
        text: '<<<<<<< HEAD\n# Nova: fast offline notes.\n=======\n# Nova: notes for small teams.\n>>>>>>> redesign',
      },
      options: [
        { id: 'a', text: 'The line between <<<<<<< HEAD and =======.' },
        { id: 'b', text: 'The line between ======= and >>>>>>> redesign.' },
        { id: 'c', text: 'Neither: that is the merge base.' },
      ],
      correct: 'b',
      explanation:
        'The top half is HEAD, the branch you are on (main, Lea\'s change). The bottom half is the branch you are merging in. The base only appears, after |||||||, with diff3 or zdiff3.',
    },
    {
      id: 'q-x-vs-s',
      question: 'Merging pricing into main conflicts in plans.md only; pricing also adds a new file team.md. Which command keeps main\'s plans.md and still brings in team.md?',
      options: [
        { id: 'a', text: 'git merge -s ours pricing' },
        { id: 'b', text: 'git merge -X ours pricing' },
        { id: 'c', text: 'git merge --squash pricing' },
        { id: 'd', text: 'git merge --ff-only pricing' },
      ],
      correct: 'b',
      explanation:
        '-X ours resolves only the conflicting hunks in your favour and keeps every other change, so team.md arrives. -s ours ignores the other branch completely. --squash still conflicts, and --ff-only refuses because both sides moved.',
    },
    {
      id: 'q-abort',
      question: 'A merge stopped with three conflicts and you need to switch to an urgent fix. What does git merge --abort do?',
      options: [
        { id: 'a', text: 'Deletes the branch you were merging.' },
        { id: 'b', text: 'Restores your files and index to the state before git merge; both branches are unchanged.' },
        { id: 'c', text: 'Commits the merge with the conflict markers in place.' },
        { id: 'd', text: 'Keeps the resolved files and drops only the conflicted ones.' },
      ],
      correct: 'b',
      explanation:
        'Abort cancels the whole merge: no merge commit, no MERGE_HEAD, files as before. Nothing about the other branch changes, so you can merge it again later. (Commit or stash unrelated work before merging, since abort may not be able to keep it.)',
    },
    {
      id: 'q-viewer',
      question: 'An agent re-indented all of sync.ts and changed one condition. git diff shows 200 changed lines. Which shows you the one real change?',
      options: [
        { id: 'a', text: 'Setting delta as your pager: it highlights the changed words.' },
        { id: 'b', text: 'git diff -w, or difftastic: both ignore layout and leave the real change.' },
        { id: 'c', text: 'git diff --stat: it lists only the meaningful lines.' },
        { id: 'd', text: 'git log -p sync.ts: it shows the change commit by commit.' },
      ],
      correct: 'b',
      explanation:
        '-w tells Git to ignore whitespace when comparing, and difftastic compares the parsed code, so pure re-indentation disappears and the changed condition stands out. delta only changes how the same 200 lines look, --stat just counts them, and log -p prints the same line diff inside the commit. (Many GUIs have a hide-whitespace switch that does what -w does.)',
    },
  ],
  theoryOnly: [
    'git branch -a, -v, -vv and branch -m',
    'checkout vs switch + restore',
    'merge --ff-only and merge --squash',
    'Merge strategies (ort, -s ours) and -X ours/theirs',
    'Modify/delete and add/add conflicts',
    'diff3 / zdiff3 conflict style',
    'Merge tools (git mergetool)',
    'Binary file conflicts',
    'Lockfile conflicts',
    'Conflict prevention',
    'rerere',
    'Diff viewers and Git UIs (delta, difftastic, tig, lazygit, GitHub Desktop, VS Code + GitLens)',
    'Branch naming conventions',
    'Long-lived vs short-lived branches',
  ],
};

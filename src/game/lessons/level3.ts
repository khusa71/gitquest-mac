/**
 * Lesson 3: Remotes and syncing. Missions: src/game/levels/level3.ts (push -u, fetch and inspect, pull --ff-only,
 * divergent pull, rejected push, --force-with-lease, prune and delete). Guide: docs/LESSON-GUIDE.md.
 */
import type { Lesson } from '../lesson-model';

export const lesson3: Lesson = {
  levelId: 'remotes',
  title: 'Remotes and syncing',
  summary:
    'You will understand that a remote is another full copy that only syncs when you ask, read ahead and behind correctly, and know what fetch, pull and push each move, including why a push gets rejected and how to force safely.',
  slides: [
    {
      kind: 'concept',
      id: 'remotes',
      title: 'A remote is a named copy',
      body:
        'A remote is a short name for the URL of another copy of the repository. When you clone, Git names the source origin. In the Nova repo, origin is https://git.nova.example/nova.git (in GitQuest, a folder on your Mac playing the part of GitHub).\n\n`git remote -v` lists remotes with their URLs. `git remote add <name> <url>` adds one, `set-url` changes the address (for example from HTTPS to SSH), `rename` and `remove` do what they say.\n\nIf you work on a fork, you usually have two: origin is your fork, which you can push to, and upstream is the original project, which you only fetch from.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'you', label: 'Your Mac', detail: 'main, feature/offline, origin/main', row: 0 },
          { id: 'origin', label: 'origin', detail: 'git.nova.example/nova.git', row: 0 },
          { id: 'lea', label: "Lea's Mac", detail: 'her own clone', row: 0 },
        ],
        edges: [
          { from: 'you', to: 'origin', label: 'git push' },
          { from: 'origin', to: 'you', label: 'git fetch / pull' },
          { from: 'lea', to: 'origin', label: 'git push' },
          { from: 'origin', to: 'lea', label: 'git fetch / pull' },
        ],
        caption: 'You and Lea never talk directly: everything goes through origin, and only on request.',
      },
      remember: 'origin is just a name for a URL; nothing syncs until you fetch, pull or push.',
    },
    {
      kind: 'concept',
      id: 'remote-tracking',
      title: 'Remote-tracking branches',
      body:
        'origin/main is a remote-tracking branch: a read-only bookmark in your repository that records where main was on origin the last time you talked to it. Only fetch, pull and push move it. `git branch -r` lists them, `git branch -a` shows them with your own branches.\n\nIt is a memory, not a live view. If Lea pushed five minutes ago and you have not fetched since, origin/main still shows the old commit.\n\nYou do not commit on origin/main. `git switch feature/offline`, when only origin/feature/offline exists, creates a local feature/offline from it, already tracking it.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
          { id: 'B', message: 'docs: sync interval', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
          { id: 'C', message: 'docs: roadmap (Samir, not fetched)', parents: ['B'], lane: 'main', ghost: true },
        ],
        head: 'B',
        caption: 'Samir pushed C, but your origin/main will not know until you fetch.',
      },
      remember: 'origin/main = what the server had at your last fetch, not what it has now.',
    },
    {
      kind: 'concept',
      id: 'upstream',
      title: 'Upstream: which remote branch is yours',
      body:
        'A local branch can have an upstream: the remote-tracking branch it syncs with. With an upstream, a plain `git pull` and `git push` know where to go, and `git status` can compare you with it.\n\nA new branch has none. Its first `git push` fails with "The current branch feature/offline has no upstream branch". `git push -u origin feature/offline` pushes and records the upstream in one go. `git branch -u origin/feature/offline` sets it without pushing, and `git config --global push.autoSetupRemote true` makes a plain git push do it for new branches.\n\n`git branch -vv` shows every branch with its upstream and how far apart they are. In commands, @{u} means "my upstream": `git log @{u}..`.',
      diagram: {
        kind: 'code',
        title: 'git branch -vv',
        text: '* feature/offline 3f1a2c9 [origin/feature/offline] feat: offline queue\n  main            8b7d0e1 [origin/main: behind 1] docs: notes\n  spike           41ab9d0 feat: try search      <- no upstream',
      },
      remember: 'First push of a branch: git push -u origin <branch>.',
    },
    {
      kind: 'concept',
      id: 'ahead-behind',
      title: 'Ahead, behind, diverged',
      body:
        'git status compares your branch with its upstream. Ahead 2: you have two commits origin/main lacks (push them). Behind 1: origin/main has one you lack (pull it). Diverged, "1 and 1 different commits each": both sides moved.\n\nThe comparison is against your local origin/main, so it is only as fresh as your last fetch. "Your branch is up to date with origin/main" can be false if you have not fetched today.\n\nTo see the commits themselves: `git log main..origin/main` lists what the server has and you do not; `git log origin/main..main` lists what you would push. `git diff main origin/main` shows the content difference.',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'docs: roadmap', parents: [], lane: 'main' },
          { id: 'I', message: 'docs: ideas (Ines)', parents: ['A'], lane: 'origin', refs: ['origin/main'] },
          { id: 'S', message: 'feat: sync v2 (you)', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'S',
        caption: 'Ahead 1 (S), behind 1 (I): main and origin/main have diverged.',
      },
      remember: 'main..origin/main = coming in; origin/main..main = going out. Fetch first.',
    },
    {
      kind: 'concept',
      id: 'fetch',
      title: 'Fetch: download, change nothing',
      body:
        '`git fetch` downloads the commits you do not have from origin and moves your remote-tracking branches (origin/main, origin/feature/offline). It never touches your own branches, your index or your files. It is always safe, so fetch whenever you want to know the truth.\n\n`git fetch --all` fetches from every remote (origin and upstream). `git fetch --prune` also removes remote-tracking branches whose branch was deleted on the server; `git config --global fetch.prune true` makes that the default.\n\nAfter fetching you decide what to do: read the new commits, then merge or rebase them into your branch.',
      diagram: {
        kind: 'before-after',
        command: 'git fetch',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
          ],
          head: 'A',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main', refs: ['HEAD → main'] },
            { id: 'B', message: 'docs: sync interval (Lea)', parents: ['A'], lane: 'origin', refs: ['origin/main'] },
          ],
          head: 'A',
        },
        caption: 'Only origin/main moved. Your main is behind 1 and untouched.',
      },
      remember: 'Fetch is always safe: it only updates origin/*.',
    },
    {
      kind: 'concept',
      id: 'pull',
      title: 'Pull = fetch + integrate',
      body:
        '`git pull` runs git fetch, then integrates your upstream (origin/main) into your current branch. By default that integration is a merge.\n\nIf you have no local commits, the merge is a fast-forward: main simply moves to origin/main and no commit is created. `git pull --ff-only` insists on that and refuses anything else, which makes it the safe way to catch up.\n\nNote that `git merge origin/main` without fetching first merges whatever your Mac last saw, which may be old news. Pull always fetches first.',
      diagram: {
        kind: 'before-after',
        command: 'git pull --ff-only',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'docs: sync interval', parents: ['A'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
            { id: 'C', message: 'docs: roadmap (on the server)', parents: ['B'], lane: 'origin', ghost: true },
          ],
          head: 'B',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'B', message: 'docs: sync interval', parents: ['A'], lane: 'main' },
            { id: 'C', message: 'docs: roadmap', parents: ['B'], lane: 'main', refs: ['HEAD → main', 'origin/main'] },
          ],
          head: 'C',
        },
        caption: 'Fetch brings C and moves origin/main; the fast-forward moves main.',
      },
      remember: 'git pull --ff-only: catch up, never create a surprise merge.',
    },
    {
      kind: 'concept',
      id: 'divergent',
      title: 'Divergent branches: choose merge or rebase',
      body:
        'When both main and origin/main have new commits, a fast-forward is impossible. Since Git 2.33.1 (late 2021), a plain git pull without a configured preference stops here and asks you to choose.\n\n`git pull --rebase` replays your local commits on top of origin/main: a straight line of history, and your commits get new hashes (fine, since they were never pushed). `git pull --no-rebase` creates a merge commit joining the two lines. Both keep everyone\'s work.\n\nRecord your default once: `git config --global pull.rebase true` (rebase), `false` (merge) or `pull.ff only` (refuse, and decide by hand each time). Many teams prefer rebase for local, unpushed work.',
      diagram: {
        kind: 'before-after',
        command: 'git pull --rebase',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'docs: roadmap', parents: [], lane: 'main' },
            { id: 'I', message: 'docs: ideas (Ines)', parents: ['A'], lane: 'origin', refs: ['origin/main'] },
            { id: 'S', message: 'feat: sync v2', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: 'S',
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'docs: roadmap', parents: [], lane: 'main' },
            { id: 'I', message: 'docs: ideas (Ines)', parents: ['A'], lane: 'main', refs: ['origin/main'] },
            { id: 'S', message: 'feat: sync v2 (old copy)', parents: ['A'], lane: 'old', ghost: true },
            { id: "S'", message: 'feat: sync v2', parents: ['I'], lane: 'main', refs: ['HEAD → main'] },
          ],
          head: "S'",
        },
        caption: "Your commit is replayed on top of Ines's as S' (new hash). Now you are ahead 1, ready to push.",
      },
      remember: 'Divergent? Pick --rebase or --no-rebase, or set pull.rebase once.',
    },
    {
      kind: 'concept',
      id: 'push',
      title: 'Push, and why it gets rejected',
      body:
        '`git push` uploads your commits and asks origin to move its branch to your tip. The server accepts only a fast-forward: its current tip must already be in your history. Otherwise accepting would delete commits it has and you do not.\n\nSo when Yanis pushed first, your push is rejected. "(fetch first)" means the server has commits you have never downloaded; "(non-fast-forward)" means you fetched them but have not integrated them. The cure is the same: `git pull --rebase` (or a merge), then push again.\n\nTags are not pushed by git push. Push one with `git push origin v1.0`, all of them with `git push --tags`, or set push.followTags to send annotated tags along with the commits they mark.',
      diagram: {
        kind: 'code',
        title: 'git push',
        text: "To https://git.nova.example/nova.git\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs to 'https://git.nova.example/nova.git'\nhint: Updates were rejected because the remote contains work that you do not\nhint: have locally. [...] use 'git pull' before pushing again.",
      },
      remember: 'Rejected push: pull, then push. Never --force on a shared branch.',
    },
    {
      kind: 'concept',
      id: 'force',
      title: '--force-with-lease vs --force',
      body:
        'Amending or rebasing a commit you already pushed gives it a new hash. The server\'s tip is no longer in your history, so a normal push is rejected and you need a force push, which tells the server "replace your branch with mine".\n\n`git push --force` does that unconditionally. If Lea pushed to the branch in the meantime, her commit vanishes from the server without a word. `git push --force-with-lease` first checks that the server still points where your origin/<branch> says. If someone pushed since your last fetch, it refuses with "(stale info)".\n\nThe lease is your last fetch, so do not just fetch and force again: look at what arrived (`git log feature/offline..origin/feature/offline`), put it on top of your work, then push with the lease. And only force branches that are yours; never main.',
      diagram: {
        kind: 'before-after',
        command: 'git push --force   (what you want to avoid)',
        before: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'Q', message: 'feat: offline queue (old)', parents: ['A'], lane: 'origin' },
            { id: 'D', message: 'docs: offline mode (Lea)', parents: ['Q'], lane: 'origin', refs: ['server: feature/offline'] },
            { id: "Q'", message: 'feat: offline queue with test', parents: ['A'], lane: 'mine', refs: ['HEAD → feature/offline'] },
          ],
          head: "Q'",
        },
        after: {
          kind: 'graph',
          commits: [
            { id: 'A', message: 'Initial commit', parents: [], lane: 'main' },
            { id: 'Q', message: 'feat: offline queue (old)', parents: ['A'], lane: 'origin', ghost: true },
            { id: 'D', message: 'docs: offline mode (Lea, lost)', parents: ['Q'], lane: 'origin', ghost: true },
            { id: "Q'", message: 'feat: offline queue with test', parents: ['A'], lane: 'mine', refs: ['HEAD → feature/offline', 'server: feature/offline'] },
          ],
          head: "Q'",
        },
        caption: '--force-with-lease would have refused here, because D was never fetched.',
      },
      remember: 'Rewrite only your own branches, and force with --force-with-lease.',
    },
    {
      kind: 'concept',
      id: 'cleanup',
      title: 'Pruning and deleting remote branches',
      body:
        'When a branch is deleted on the server (say, after its pull request was merged), your origin/spike/search stays on your Mac forever. A plain fetch never deletes anything. `git fetch --prune` removes those stale bookmarks, and `git branch -vv` marks local branches whose upstream vanished as [gone].\n\nTo delete a branch on the server yourself, push the deletion: `git push origin --delete feature/offline`. Then delete your local label with `git branch -d feature/offline` (from another branch). The two are independent: deleting one never deletes the other.',
      diagram: {
        kind: 'code',
        title: 'Terminal',
        text: '$ git fetch --prune\n - [deleted]         (none)     -> origin/spike/search\n$ git push origin --delete feature/offline\n - [deleted]         feature/offline\n$ git switch main\n$ git branch -d feature/offline',
      },
      remember: 'fetch --prune cleans your view; push --delete cleans the server.',
    },
    {
      kind: 'concept',
      id: 'fork',
      title: 'Keeping a fork in sync',
      body:
        'A fork is your own server-side copy of someone else\'s repository. You push to your fork (origin) and open pull requests to the original (upstream). The original keeps moving, and your fork does not follow by itself.\n\nTo catch up: add the original once as upstream, then fetch it, fast-forward your main to upstream/main, and push that to your fork. Never commit on your fork\'s main; keep your work on branches so main can always fast-forward.\n\nGitHub also has a "Sync fork" button that does the server half for you; you still pull it to your Mac.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'up', label: 'upstream', detail: 'nova/notes (original)', row: 0 },
          { id: 'mac', label: 'Your Mac', detail: 'main', row: 1 },
          { id: 'fork', label: 'origin', detail: 'you/notes (your fork)', row: 0 },
        ],
        edges: [
          { from: 'up', to: 'mac', label: 'git pull --ff-only upstream main' },
          { from: 'mac', to: 'fork', label: 'git push origin main' },
          { from: 'fork', to: 'up', label: 'pull request' },
        ],
      },
      remember: 'Fetch upstream, fast-forward main, push to origin.',
    },
    {
      kind: 'concept',
      id: 'auth',
      title: 'When the server says no: authentication',
      body:
        'SSH remotes (git@github.com:...) failing with "Permission denied (publickey)" mean the server did not accept any key you offered. Run `ssh -T git@github.com`: it should greet you by username. If not, check the key exists (`ls ~/.ssh`), is loaded (`ssh-add -l`), and that the .pub file is added to your account.\n\nHTTPS remotes failing with "Authentication failed" usually mean a wrong, expired or revoked token, often an old one still stored in the Keychain. "Repository not found" on a private repo often means the token is valid but cannot see that repository. GitHub has two kinds of personal access token: classic tokens with broad scopes (repo, workflow), and fine-grained tokens limited to chosen repositories and permissions. Give every token an expiry: organizations can require one, so check your token settings. Prefer fine-grained, with the least access that works.\n\nTwo GitHub accounts on one Mac (work and personal)? Give each its own SSH key and a host alias in ~/.ssh/config, then use the alias in the work remotes\' URLs.',
      diagram: {
        kind: 'code',
        title: '~/.ssh/config: two accounts',
        text: 'Host github.com\n    IdentityFile ~/.ssh/id_ed25519          # personal\n\nHost github-nova\n    HostName github.com\n    IdentityFile ~/.ssh/id_ed25519_nova     # work\n    IdentitiesOnly yes\n\n$ git remote set-url origin git@github-nova:nova/notes.git\n$ ssh -T git@github-nova\nHi alex-nova! You\'ve successfully authenticated, but GitHub does not provide shell access.',
      },
      remember: 'publickey: test with ssh -T. Authentication failed: fix the token in the Keychain.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Remote commands',
      rows: [
        { command: 'git remote -v', does: 'Lists remotes and their URLs.' },
        { command: 'git remote add | set-url | rename | remove', does: 'Adds a remote, changes its URL, renames or removes it.' },
        { command: 'git fetch (--all, --prune)', does: 'Downloads commits and updates origin/*; never touches your branches.' },
        { command: 'git status / git branch -vv', does: 'Ahead and behind compared with the upstream (as of your last fetch).' },
        { command: 'git log main..origin/main', does: 'Commits on the server that you do not have yet.' },
        { command: 'git diff main origin/main', does: 'Content difference between your main and the server\'s, as last fetched.' },
        { command: 'git pull --ff-only', does: 'Fetch, then fast-forward only; refuses if you have local commits.' },
        { command: 'git pull --rebase / --no-rebase', does: 'Fetch, then replay your commits on top / create a merge commit.' },
        { command: 'git config --global pull.rebase true', does: 'Makes plain git pull rebase instead of asking.' },
        { command: 'git push -u origin <branch>', does: 'First push of a branch; sets its upstream.' },
        { command: 'git push', does: 'Sends commits; rejected unless it fast-forwards the server branch.' },
        { command: 'git push --force-with-lease', does: 'Overwrites the server branch only if it is where you last saw it.', danger: true },
        { command: 'git push --force', does: 'Overwrites the server branch unconditionally, deleting others\' commits.', danger: true },
        { command: 'git push origin --delete <branch>', does: 'Deletes a branch on the server.', danger: true },
        { command: 'git push origin v1.0 / --tags', does: 'Pushes one tag / all tags (git push alone sends none).' },
        { command: 'ssh -T git@github.com', does: 'Tests SSH authentication without Git.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Syncing pitfalls',
      items: [
        {
          mistake: 'git status said "up to date", yet a teammate pushed an hour ago.',
          fix: 'Status compares with origin/main as of your last fetch. git fetch first, then read status.',
        },
        {
          mistake: 'Push rejected, so you ran git push --force.',
          fix: 'That deleted the commits you did not have. If it was a shared branch, tell the team now; the lost commits are still in their clones. Next time: git pull --rebase, then git push.',
        },
        {
          mistake: 'git pull stops with "Need to specify how to reconcile divergent branches".',
          fix: 'Choose: git pull --rebase or git pull --no-rebase, and set pull.rebase in your global config so it stops asking.',
        },
        {
          mistake: 'Your branch list is full of origin/... branches that no longer exist on the server.',
          fix: 'git fetch --prune, and git config --global fetch.prune true.',
        },
        {
          mistake: '"The current branch has no upstream branch" on git push.',
          fix: 'git push -u origin <branch> once (or set push.autoSetupRemote true).',
        },
        {
          mistake: 'You rebased a branch others already pulled, and force-pushed it.',
          fix: 'Their copies now diverge from yours. Only rewrite branches nobody else builds on; on shared branches, add new commits or use git revert.',
        },
        {
          mistake: 'Permission denied (publickey).',
          fix: 'ssh -T git@github.com to test; ssh-add your key; add the .pub to your account; or switch the remote to HTTPS with git remote set-url.',
        },
        {
          mistake: 'You want your main to match the server exactly and throw away local junk.',
          fix: 'git fetch, then git reset --hard origin/main. This deletes your unpushed commits and changes on that branch: make a backup branch first.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-fetch-moves',
      question: 'You run git fetch and Lea had pushed one commit to main. What changed in your repository?',
      options: [
        { id: 'a', text: 'main and origin/main both moved to Lea\'s commit.' },
        { id: 'b', text: 'Only origin/main moved; main and your files are untouched.' },
        { id: 'c', text: 'Your files were updated, but main did not move.' },
        { id: 'd', text: 'Nothing until you run git status.' },
      ],
      correct: 'b',
      explanation:
        'Fetch downloads commits and moves remote-tracking branches only. Integrating them into main is a separate step: merge, rebase or pull.',
    },
    {
      id: 'q-stale-status',
      question: 'git status says "Your branch is up to date with \'origin/main\'". Samir pushed ten minutes ago and you have not fetched since. Is your main up to date with the server?',
      options: [
        { id: 'a', text: 'Yes: git status asks the server every time.' },
        { id: 'b', text: 'Not necessarily: status compares with your local origin/main, which is from your last fetch.' },
        { id: 'c', text: 'No: status would have said "behind" automatically.' },
      ],
      correct: 'b',
      explanation:
        'git status never contacts the server. It compares main with origin/main as recorded at your last fetch. Fetch first, then status tells the truth.',
    },
    {
      id: 'q-rejected',
      question: 'Your push is rejected with "! [rejected] main -> main (fetch first)". Why, and what do you do?',
      options: [
        { id: 'a', text: 'Your token expired: log in again.' },
        { id: 'b', text: 'The server has commits you do not have; pull (rebase or merge), then push.' },
        { id: 'c', text: 'main is protected: push with --force.' },
        { id: 'd', text: 'You have uncommitted changes: commit them first.' },
      ],
      correct: 'b',
      explanation:
        'A push must fast-forward the server branch. Someone pushed first, so your main does not contain the server tip. Integrate their commits, then push. An auth problem would say "Authentication failed" or "Permission denied" instead.',
    },
    {
      id: 'q-diverged',
      question: 'Your main and origin/main look like this. Which command makes main contain both commits with a straight, linear history?',
      diagram: {
        kind: 'graph',
        commits: [
          { id: 'A', message: 'docs: roadmap', parents: [], lane: 'main' },
          { id: 'I', message: 'docs: ideas (Ines)', parents: ['A'], lane: 'origin', refs: ['origin/main'] },
          { id: 'S', message: 'feat: sync v2', parents: ['A'], lane: 'main', refs: ['HEAD → main'] },
        ],
        head: 'S',
      },
      options: [
        { id: 'a', text: 'git pull --ff-only' },
        { id: 'b', text: 'git pull --rebase' },
        { id: 'c', text: 'git pull --no-rebase' },
        { id: 'd', text: 'git push --force-with-lease' },
      ],
      correct: 'b',
      explanation:
        '--rebase replays S on top of I, giving A-I-S\'. --no-rebase also keeps both but adds a merge commit. --ff-only refuses because the branches diverged, and forcing would delete Ines\'s commit from the server.',
    },
    {
      id: 'q-lease',
      question: 'You amended a pushed commit on feature/offline. Unknown to you, Lea pushed a commit to that branch since your last fetch. What does git push --force-with-lease do?',
      options: [
        { id: 'a', text: 'Overwrites the branch and Lea\'s commit is lost.' },
        { id: 'b', text: 'Refuses with "stale info", because the server is not where your origin/feature/offline says.' },
        { id: 'c', text: 'Merges Lea\'s commit automatically and pushes.' },
        { id: 'd', text: 'Pushes your commit next to Lea\'s on a new branch.' },
      ],
      correct: 'b',
      explanation:
        'The lease is "the server still points where I last saw it". Lea moved it, so the push is refused. Fetch, look at her commit, put it on top of yours, then push with the lease again.',
    },
    {
      id: 'q-prune',
      question: 'Samir deleted spike/search on the server yesterday. You run git fetch. What happens to your origin/spike/search?',
      options: [
        { id: 'a', text: 'It is deleted automatically.' },
        { id: 'b', text: 'It stays, unless you fetch with --prune or have fetch.prune set.' },
        { id: 'c', text: 'It turns into a local branch.' },
        { id: 'd', text: 'git fetch fails until you delete it.' },
      ],
      correct: 'b',
      explanation:
        'A plain fetch only adds and updates. --prune (or fetch.prune = true) removes remote-tracking branches whose branch no longer exists on the server.',
    },
    {
      id: 'q-upstream',
      question: 'You created feature/offline locally and committed. Which command publishes it so that later a plain git pull on it works?',
      options: [
        { id: 'a', text: 'git push' },
        { id: 'b', text: 'git push -u origin feature/offline' },
        { id: 'c', text: 'git fetch origin feature/offline' },
        { id: 'd', text: 'git remote add feature/offline origin' },
      ],
      correct: 'b',
      explanation:
        'A new branch has no upstream, so a plain git push fails (unless push.autoSetupRemote is set). -u pushes and records origin/feature/offline as the upstream that pull and status use.',
    },
    {
      id: 'q-auth',
      question: 'git push to git@github.com:nova/notes.git prints "Permission denied (publickey)". What is the most useful first step?',
      options: [
        { id: 'a', text: 'git pull --rebase' },
        { id: 'b', text: 'ssh -T git@github.com' },
        { id: 'c', text: 'git config user.email with your GitHub email' },
        { id: 'd', text: 'git push --force' },
      ],
      correct: 'b',
      explanation:
        'This is an SSH authentication failure, not a history problem. ssh -T tests the key alone and tells you which account (if any) GitHub recognised. user.email only labels commits and is never used to log in.',
    },
  ],
  theoryOnly: [
    'remote add / set-url / rename / remove, and the upstream remote',
    'git fetch --all and remote update',
    'pull.rebase and pull.ff configuration',
    'git diff against origin/main',
    'Plain git push --force',
    'Pushing tags',
    'Syncing a fork',
    'Permission denied (publickey) and ssh -T',
    'HTTPS authentication failures and tokens',
    'Fine-grained vs classic personal access tokens',
    'Multiple accounts on one machine',
  ],
};

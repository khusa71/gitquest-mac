import type { Lesson } from '../lesson-model';

/** Level 6 lesson: advanced features and internals. Missions: src/game/levels/level6.ts. */
export const lesson6: Lesson = {
  levelId: 'advanced',
  title: 'Advanced and internals',
  summary:
    'You will see how Git stores everything as hashed objects, and use the tools built on top of that: worktrees, hooks, attributes, submodules, large-repo options, signing, trailers and notes.',
  slides: [
    {
      kind: 'concept',
      id: 'objects',
      title: 'Four kinds of objects',
      body:
        'Everything Git stores lives in `.git/objects` and is named by the hash of its content. A blob is the full content of one file, with no name and no history. A tree is a folder listing: names, modes and the hashes of blobs and subtrees. A commit points to one tree (the whole snapshot), its parent commits, the author, committer and message. An annotated tag points to a commit with a tagger and message.\n\n' +
        'Because names come from content, identical files are stored once, and changing a single byte anywhere changes the blob hash, then the tree hash, then the commit hash. That chain is why history cannot be edited silently.\n\n' +
        'You can read any object: `git cat-file -t <hash>` gives its type, `git cat-file -p <hash>` prints it, `git ls-tree HEAD` lists the root tree of a commit. Lea\'s deleted draft was still a blob, whole, waiting to be printed.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'tag', label: 'tag v1.0', detail: 'object, tagger, message', row: 0 },
          { id: 'commit', label: 'commit 9f3a', detail: 'tree, parent, author, message', row: 0 },
          { id: 'tree', label: 'tree 4b2c', detail: 'README.md, app.ts, src/', row: 0 },
          { id: 'blob1', label: 'blob a1f0', detail: 'README.md, whole file', row: 0 },
          { id: 'blob2', label: 'blob 7c3e', detail: 'app.ts, whole file', row: 1 },
          { id: 'sub', label: 'tree 2d8b', detail: 'src/ folder', row: 1 },
        ],
        edges: [
          { from: 'tag', to: 'commit' },
          { from: 'commit', to: 'tree' },
          { from: 'tree', to: 'blob1' },
          { from: 'tree', to: 'blob2' },
          { from: 'tree', to: 'sub' },
        ],
        caption: 'A commit is a snapshot: one tree of full files, not a list of differences.',
      },
      remember: 'blob = file content, tree = folder, commit = snapshot + parents, all named by hash.',
    },
    {
      kind: 'concept',
      id: 'refs-and-index',
      title: 'Refs, HEAD and the index file',
      body:
        'Objects are immutable; refs are the movable part. A branch is a ref such as `refs/heads/main` holding one commit hash. `.git/HEAD` usually holds `ref: refs/heads/main`, which is how Git knows your current branch; in detached HEAD it holds a hash directly. Tags live under `refs/tags`, remote-tracking branches under `refs/remotes/origin`.\n\n' +
        'Refs may be loose files under `.git/refs` or lines in `.git/packed-refs` after garbage collection (newer Git can also use the reftable format), so do not read the files by hand: `git show-ref`, `git for-each-ref` and `git rev-parse` work in every case.\n\n' +
        'The index is a binary file, `.git/index`: a sorted list of every tracked path with its mode, blob hash and file timestamps. `git ls-files -s` prints it. It is literally the next commit\'s tree in waiting, and the timestamps let `git status` skip re-reading unchanged files.',
      diagram: {
        kind: 'code',
        title: 'Looking under the hood',
        text:
          '$ cat .git/HEAD\n' +
          'ref: refs/heads/main\n' +
          '$ git rev-parse main\n' +
          '9f3a1c2e4b...\n' +
          '$ git cat-file -p main\n' +
          'tree 4b2c8d1...\n' +
          'parent 1e7f0a3...\n' +
          'author Lea Moreau <lea@nova.dev> 1763800000 +0100\n' +
          '\n' +
          'docs: manifesto draft\n' +
          '$ git ls-files -s\n' +
          '100644 a1f0b2c... 0\tREADME.md',
      },
      remember: 'Objects never change; refs are names that point at them; the index is the next tree.',
    },
    {
      kind: 'concept',
      id: 'packs',
      title: 'Packfiles, garbage collection and hashes',
      body:
        'New objects are written loose, one zlib-compressed file each. From time to time Git packs them into a `.pack` file with an `.idx` index, storing similar objects as deltas against each other. So the logical model is full snapshots, while the disk format is compressed deltas: you get both clarity and small repos.\n\n' +
        'Objects that no ref or reflog entry reaches are dangling or unreachable. `git gc` prunes them after a grace period (two weeks by default) once their reflog entries have expired; that grace period is what makes the reflog and `git fsck` rescues work. `git count-objects -vH` shows loose and packed sizes, and `git maintenance start` schedules background repacking for big repos.\n\n' +
        'Hashes are SHA-1 today, hardened against the known collision attack. Git also supports SHA-256 repositories (`git init --object-format=sha256`) and plans to make them the default in a future major version, but hosting and tooling support is still catching up, so nearly every repository you meet is SHA-1.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'loose', label: 'Loose objects', detail: '.git/objects/ab/cdef...', row: 0 },
          { id: 'pack', label: 'Packfile', detail: '.pack + .idx, deltas', row: 0 },
          { id: 'dangling', label: 'Unreachable objects', detail: 'kept while the reflog or grace period protects them', row: 1 },
          { id: 'pruned', label: 'Pruned', detail: 'gone for good', row: 1 },
        ],
        edges: [
          { from: 'loose', to: 'pack', label: 'git gc / repack' },
          { from: 'dangling', to: 'pruned', label: 'git gc after expiry' },
        ],
      },
      remember: 'Snapshots in the model, deltas on disk; gc only deletes what nothing can reach.',
    },
    {
      kind: 'concept',
      id: 'worktrees',
      title: 'Worktrees: one repository, several folders',
      body:
        '`git worktree add ../nova-hotfix -b hotfix` creates a second folder attached to the same repository, with a new branch checked out. Each worktree has its own HEAD, index and files; all of them share the same objects, branches, tags, stash and config. A commit made in one is instantly visible from the others.\n\n' +
        'Rules: a branch can be checked out in only one worktree at a time (Git refuses otherwise). Untracked files such as `.env` or `node_modules` are not copied into the new folder. `git worktree list` shows them all, `git worktree remove ../nova-hotfix` deletes the folder (the branch and commits stay), `git worktree prune` forgets folders you deleted by hand, and `git worktree lock` protects one stored on a removable drive.\n\n' +
        'Compared with the alternatives: stash parks work in the one folder you have; a second clone duplicates every object and needs push and fetch to sync; a worktree is a second desk on the same repository, ideal for an urgent fix or a parallel task.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'git', label: 'nova/.git', detail: 'shared objects, branches, stash', row: 0 },
          { id: 'main', label: 'nova/', detail: 'main, editor.ts half done', row: 0 },
          { id: 'hot', label: 'nova-hotfix/', detail: 'hotfix, app.ts title fix', row: 1 },
        ],
        edges: [
          { from: 'git', to: 'main', label: 'main worktree' },
          { from: 'git', to: 'hot', label: 'git worktree add' },
        ],
        caption: 'The WIP in nova/ is never touched while you fix and commit in nova-hotfix/.',
      },
      remember: 'Need another branch right now? A worktree, not a stash or a second clone.',
    },
    {
      kind: 'concept',
      id: 'hooks',
      title: 'Hooks: scripts Git runs for you',
      body:
        'A hook is an executable file in `.git/hooks` named after an event. `pre-commit` runs before a commit is created, `commit-msg` can check the message, `pre-push` runs before a push, `post-checkout` and `post-merge` after those operations. A non-zero exit from a pre- hook cancels the operation. The file must be executable (`chmod +x`) and have exactly the event name, without the `.sample` suffix.\n\n' +
        '`.git/hooks` is never committed or cloned, so teams share hooks another way: `git config core.hooksPath .githooks` points Git at a committed folder, and hook managers (the pre-commit framework, Husky for Node projects, lefthook) install and run the same checks for everyone.\n\n' +
        'Client hooks are a convenience, not a security boundary: `git commit --no-verify` (or `-n`) skips pre-commit and commit-msg, and anyone can delete them. Enforcement belongs on the server: pre-receive hooks on self-hosted Git servers, or on GitHub, rulesets, required status checks and push protection.',
      diagram: {
        kind: 'code',
        title: '.git/hooks/pre-commit (chmod +x)',
        text:
          '#!/bin/sh\n' +
          "if git diff --cached -U0 | grep '^+' | grep -qE 'TODO|API_KEY'; then\n" +
          "  echo 'pre-commit: remove the TODO or API_KEY before committing.' >&2\n" +
          '  exit 1\n' +
          'fi',
      },
      remember: 'Hooks guard your machine; the server guards the repository.',
    },
    {
      kind: 'concept',
      id: 'secret-scanners',
      title: 'A secret scanner in pre-commit',
      body:
        'The grep hook above only catches the words you thought of; a real key rarely says API_KEY. Secret scanners know hundreds of formats (GitHub, AWS and Stripe tokens, private keys, connection strings) and flag high-entropy strings. The common free ones are gitleaks (`brew install gitleaks`) and trufflehog.\n\n' +
        'Share the check through the pre-commit framework: commit a `.pre-commit-config.yaml`, and each person runs `pre-commit install` once, which writes `.git/hooks/pre-commit`. From then on every commit, an agent\'s included, is scanned. gitleaks looks only at the staged changes, so it is fast, and a hit cancels the commit and names the file and line. Without the framework, one line in `.git/hooks/pre-commit` does the same: `gitleaks git --pre-commit --staged --redact`.\n\n' +
        'A hook only guards new commits. Scan what is already in the repository with `gitleaks git` (the whole history; older releases call it `gitleaks detect`) or `trufflehog git file://.`, and treat any real hit as a pushed secret: rotate it first (level 4). Since `--no-verify` skips local hooks, run the same scanner in CI on every PR, and leave GitHub push protection on as the last net.',
      diagram: {
        kind: 'code',
        title: '.pre-commit-config.yaml',
        text:
          'repos:\n' +
          '  - repo: https://github.com/gitleaks/gitleaks\n' +
          '    rev: v8.30.1          # pin a release; pre-commit autoupdate bumps it\n' +
          '    hooks:\n' +
          '      - id: gitleaks\n' +
          '\n' +
          '$ pre-commit install\n' +
          '$ git commit -m "feat: sync"\n' +
          'Detect hardcoded secrets.................Failed\n' +
          'Finding:     const key = "REDACTED"\n' +
          'RuleID:      stripe-access-token\n' +
          'File:        src/sync.ts\n' +
          'Line:        4',
      },
      remember: 'Scanner in pre-commit for new commits, a history scan for old ones, CI and push protection for whoever skips the hook.',
    },
    {
      kind: 'concept',
      id: 'attributes',
      title: '.gitattributes and the file system',
      body:
        '`.gitattributes` is committed, so its rules apply to everyone. `* text=auto eol=lf` stores text with LF in the repository and checks it out with LF on every OS, which ends the "every line changed" diffs caused by CRLF editors. After adding it, `git add --renormalize .` fixes files already committed. Other lines: `*.png binary`, `*.bat text eol=crlf`, `package-lock.json -diff` (hide noisy diffs), `*.psd filter=lfs diff=lfs merge=lfs -text` (Git LFS).\n\n' +
        'macOS file systems are case-insensitive by default, Linux is not. `Editor.ts` and `editor.ts` are the same file on your Mac and two files in CI. Rename case with `git mv editor.ts Editor.ts` so Git records it, and keep import paths exactly matching.\n\n' +
        'Git tracks only one permission: the executable bit (mode 100755 vs 100644). `git update-index --chmod=+x deploy.sh` sets it without chmod; `core.fileMode=false` ignores mode noise on file systems that do not support it. Symlinks are stored as a small blob containing the target path (mode 120000); on Windows without symlink support they check out as plain text files.',
      diagram: {
        kind: 'code',
        title: '.gitattributes',
        text:
          '* text=auto eol=lf\n' +
          '*.sh text eol=lf\n' +
          '*.bat text eol=crlf\n' +
          '*.png binary\n' +
          'package-lock.json -diff\n' +
          '*.psd filter=lfs diff=lfs merge=lfs -text',
      },
      remember: 'Per-machine config is a wish; a committed .gitattributes is a rule.',
    },
    {
      kind: 'concept',
      id: 'config',
      title: 'Config worth setting once',
      body:
        'A handful of settings remove daily friction. Set them with `git config --global` so every repository on your Mac uses them; `git config --list --show-origin` shows where each value comes from.\n\n' +
        'They change defaults you already met: pull rebases instead of merging, fetch prunes deleted remote branches, rerere remembers how you resolved a conflict and reapplies it next time the same conflict appears, and the histogram diff algorithm gives more readable diffs for moved code.',
      diagram: {
        kind: 'code',
        title: '~/.gitconfig',
        text:
          '[pull]\n    rebase = true            # pull = fetch + rebase\n' +
          '[fetch]\n    prune = true             # drop deleted remote branches\n' +
          '[rerere]\n    enabled = true           # reuse recorded conflict resolutions\n' +
          '[diff]\n    algorithm = histogram\n' +
          '[merge]\n    conflictStyle = zdiff3   # show the base version in conflicts\n' +
          '[push]\n    autoSetupRemote = true   # first push sets the upstream\n' +
          '[rebase]\n    autoSquash = true\n    updateRefs = true',
      },
      remember: 'Configure the defaults once instead of typing flags forever.',
    },
    {
      kind: 'concept',
      id: 'submodules',
      title: 'Submodules, subtrees and monorepos',
      body:
        'A submodule is another repository mounted at a path. `git submodule add https://git.nova.example/icons.git icons` records the URL in `.gitmodules` and stores, in the parent tree, a gitlink: one exact commit of the icons repo (mode 160000). The parent never stores the icon files themselves.\n\n' +
        'Teammates need `git clone --recurse-submodules`, or `git submodule update --init --recursive` after a normal clone. To move to a newer icons version, update inside icons/ (or `git submodule update --remote`), then commit the new pointer in the parent. Inside the submodule HEAD is usually detached, so commit there on a branch. A submodule from a local path or `file://` URL fails with "transport \'file\' not allowed": since git 2.38.1 (a security fix, also backported to older lines) Git refuses local submodule clones unless you opt in for one command with `git -c protocol.file.allow=always submodule add ...`.\n\n' +
        'A subtree (`git subtree add --prefix=icons <url> main --squash`) copies the other project\'s files into your own history instead: nothing extra for cloners, but syncing back is manual. A monorepo puts many projects in one repository and relies on CODEOWNERS per folder, sparse-checkout and path-filtered CI to stay manageable.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'nova', label: 'nova repo', detail: '.gitmodules: icons -> URL', row: 0 },
          { id: 'link', label: 'gitlink icons', detail: 'pinned at commit 4e5f6a7', row: 0 },
          { id: 'icons', label: 'icons repo', detail: 'its own history and remote', row: 0 },
        ],
        edges: [
          { from: 'nova', to: 'link', label: 'tree entry' },
          { from: 'link', to: 'icons', label: 'exact commit' },
        ],
      },
      remember: 'A submodule is a pointer to one commit of another repo, plus its URL.',
    },
    {
      kind: 'concept',
      id: 'big-repos',
      title: 'Big repositories',
      body:
        'A shallow clone, `git clone --depth 1`, fetches only recent commits: fast for CI, but log, blame and merge-base stop at the cut (`git fetch --unshallow` fills it in). A partial clone, `git clone --filter=blob:none`, fetches every commit and tree but downloads file contents only when a checkout needs them, so history commands still work.\n\n' +
        'Sparse-checkout limits which folders appear on disk: `git sparse-checkout set apps/web` in a monorepo. Combined with a partial clone, you only download and see the part you work on.\n\n' +
        'Git LFS keeps large binaries out of the object store: `git lfs track "*.psd"` writes an attribute, the repository stores a small pointer file, and the real content lives on the LFS server. Use it for big assets that change often; plain Git history would keep every version forever.',
      diagram: {
        kind: 'code',
        title: 'Getting less of a big repo',
        text:
          'git clone --depth 1 <url>               # recent history only\n' +
          'git clone --filter=blob:none <url>      # all history, contents on demand\n' +
          'git sparse-checkout set apps/web        # only this folder on disk\n' +
          'git lfs track "*.psd"                   # big binaries as pointers\n' +
          'git count-objects -vH                   # how big is it?\n' +
          'git maintenance start                   # background repacking',
      },
      remember: 'Shallow cuts history, partial defers contents, sparse hides folders, LFS moves binaries out.',
    },
    {
      kind: 'concept',
      id: 'signing-trailers',
      title: 'Signing, trailers and .mailmap',
      body:
        'Anyone can set user.name to "Lea". A signature proves the commit came from a key you own. With SSH signing: `git config gpg.format ssh`, `git config user.signingkey ~/.ssh/id_ed25519.pub`, `git config commit.gpgsign true` (GPG works the same with its own key). Upload the key on GitHub as a signing key and your commits show Verified; vigilant mode also flags unsigned commits that claim to be yours.\n\n' +
        'Trailers are `Key: value` lines in the last paragraph of a message, read by tools as data. `git commit -s` adds `Signed-off-by: you <email>`, a statement that you may contribute the code (the DCO), not a cryptographic signature. `Co-authored-by: Ines Bouvet <ines@nova.dev>` credits a pair partner on GitHub. Add any trailer with `--trailer "Key: value"`.\n\n' +
        'A committed `.mailmap` maps old names and emails to one identity, so `git shortlog` and `git blame` stop listing the same person twice.',
      diagram: {
        kind: 'code',
        title: 'git log -1',
        text:
          'feat(tags): sort note tags\n' +
          '\n' +
          'Co-authored-by: Ines Bouvet <ines@nova.dev>\n' +
          'Signed-off-by: You <you@nova.dev>\n' +
          '\n' +
          '# .mailmap\n' +
          'Ines Bouvet <ines@nova.dev> <ines.b@old-mail.example>',
      },
      remember: 'Signed (-S, key) proves identity; Signed-off-by (-s, text) is only a statement.',
    },
    {
      kind: 'concept',
      id: 'rare-tools',
      title: 'Notes, patches and other rare tools',
      body:
        '`git notes add -m "QA: passed" <commit>` attaches text to a commit without changing its hash; notes live in `refs/notes/commits` and are not pushed unless you push that ref (`git push origin refs/notes/commits`).\n\n' +
        'Email-style patches: `git format-patch -3` writes the last three commits as `.patch` files, `git am *.patch` applies them as commits with the original author, and `git apply fix.diff` applies a plain diff to your files without committing. `git bundle create nova.bundle --all` packs a whole repository into one file you can clone from, useful offline. `git archive --format=zip -o nova.zip HEAD` exports a snapshot without `.git`.\n\n' +
        '`git replace` makes Git show one object in place of another locally (`--graft` rewires parents, the modern form of the old grafts file), mostly for history surgery before a filter-repo. `git switch --orphan gh-pages` starts a branch with no parent and an empty folder, for content that shares no history with main.',
      diagram: {
        kind: 'code',
        title: 'A commit with a note',
        text:
          '$ git notes add -m "QA: passed on macOS 15" HEAD\n' +
          '$ git log -1\n' +
          'commit 6b7c8d9...   (same hash as before)\n' +
          '    perf: faster search\n' +
          '\n' +
          'Notes:\n' +
          '    QA: passed on macOS 15',
      },
      remember: 'Notes annotate without rewriting; patches and bundles move commits without a remote.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Advanced commands',
      rows: [
        { command: 'git cat-file -t / -p <hash>', does: 'Type / content of any object.' },
        { command: 'git ls-tree HEAD', does: 'List the root tree of a commit.' },
        { command: 'git hash-object -w <file>', does: 'Store a file as a blob and print its hash.' },
        { command: 'git ls-files -s', does: 'Show the index: mode, blob hash, path.' },
        { command: 'git show-ref / for-each-ref', does: 'List refs, wherever they are stored.' },
        { command: 'git count-objects -vH', does: 'Loose and packed object sizes.' },
        { command: 'git gc / git maintenance start', does: 'Pack objects and prune unreachable ones / schedule it.' },
        { command: 'git worktree add <path> -b <branch>', does: 'New folder with a new branch, same repository.' },
        { command: 'git worktree list / remove / prune / lock', does: 'Manage worktrees.' },
        { command: 'chmod +x .git/hooks/pre-commit', does: 'Activate a hook.' },
        { command: 'git config core.hooksPath .githooks', does: 'Use a committed hooks folder.' },
        { command: 'git commit --no-verify', does: 'Skip pre-commit and commit-msg hooks.', danger: true },
        { command: 'git add --renormalize .', does: 'Re-apply .gitattributes line endings to tracked files.' },
        { command: 'git update-index --chmod=+x <file>', does: 'Set the executable bit in the index.' },
        { command: 'git submodule add <url> <path>', does: 'Mount another repository at one pinned commit.' },
        { command: 'git submodule update --init --recursive', does: 'Fetch and check out submodules after a clone.' },
        { command: 'git clone --depth 1 / --filter=blob:none', does: 'Shallow clone / partial clone.' },
        { command: 'git sparse-checkout set <dir>', does: 'Only check out some folders.' },
        { command: 'git lfs track "*.psd"', does: 'Store matching files with Git LFS.' },
        { command: 'git commit -S / -s', does: 'Sign cryptographically / add a Signed-off-by trailer.' },
        { command: 'git commit --trailer "Co-authored-by: Name <email>"', does: 'Add a trailer.' },
        { command: 'git notes add -m "text" <commit>', does: 'Attach a note without changing the commit.' },
        { command: 'git format-patch / am / apply', does: 'Export commits as patches / apply as commits / apply a diff.' },
        { command: 'git bundle create <file> --all', does: 'A whole repository in one file.' },
        { command: 'git archive --format=zip -o out.zip HEAD', does: 'Export a snapshot without .git.' },
        { command: 'git switch --orphan <branch>', does: 'Start a branch with no history.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Advanced mistakes and the way out',
      items: [
        {
          mistake: '"fatal: hotfix is already used by worktree at ../nova-hotfix" when switching.',
          fix: 'A branch can be checked out in one worktree only. Work in that folder, or git worktree remove it first.',
        },
        {
          mistake: 'Deleted a worktree folder with rm -rf, and Git still lists it.',
          fix: 'git worktree prune cleans up the stale entry.',
        },
        {
          mistake: 'The hook never runs.',
          fix: 'Check the exact name (pre-commit, no .sample), chmod +x, a #!/bin/sh line, and that core.hooksPath does not point elsewhere.',
        },
        {
          mistake: 'Every line of a file shows as changed after a teammate\'s commit.',
          fix: 'Line endings. Commit * text=auto eol=lf in .gitattributes and run git add --renormalize .',
        },
        {
          mistake: 'Works on the Mac, CI on Linux says module ./Editor not found.',
          fix: 'Case mismatch. Rename with git mv so the committed name matches the import exactly.',
        },
        {
          mistake: 'Cloned the project and the submodule folder is empty.',
          fix: 'git submodule update --init --recursive (or clone with --recurse-submodules).',
        },
        {
          mistake: 'Notes added locally do not appear for teammates.',
          fix: 'Notes are not pushed by default: git push origin refs/notes/commits.',
        },
        {
          mistake: 'A 2 GB video committed by accident makes every clone slow, even after deleting it.',
          fix: 'History keeps it. Remove it from history with git filter-repo, force push, and track such files with Git LFS from now on.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-dedupe',
      question: 'README.md and docs/README.md have exactly the same content. How many blobs does Git store for them?',
      options: [
        { id: 'a', text: 'Two, one per path' },
        { id: 'b', text: 'One, because the blob is named by its content' },
        { id: 'c', text: 'One blob and one delta' },
        { id: 'd', text: 'None until the next git gc' },
      ],
      correct: 'b',
      explanation:
        'A blob has no name or path; trees hold the names. Same content gives the same hash, so both tree entries point to one blob.',
    },
    {
      id: 'q-snapshot',
      question: 'Lea\'s deleted draft survives as a blob. What does git cat-file -p <blob> print?',
      options: [
        { id: 'a', text: 'The diff between this draft and the previous version' },
        { id: 'b', text: 'The full file content, exactly as it was saved' },
        { id: 'c', text: 'The file name and its author' },
        { id: 'd', text: 'Nothing: blobs are only readable inside a commit' },
      ],
      correct: 'b',
      explanation:
        'Objects store whole content. Names live in trees, authors in commits, and deltas are only a compression detail inside packfiles, invisible to cat-file.',
    },
    {
      id: 'q-worktree-branch',
      question: 'You created ../nova-hotfix with git worktree add -b hotfix. Back in nova/, you run git switch hotfix. What happens?',
      options: [
        { id: 'a', text: 'Git switches, and both folders now show hotfix' },
        { id: 'b', text: 'Git refuses: hotfix is already checked out in another worktree' },
        { id: 'c', text: 'Git moves the worktree folder into nova/' },
        { id: 'd', text: 'Git creates a copy named hotfix-2' },
      ],
      correct: 'b',
      explanation:
        'Two folders on the same branch would fight over its tip, so Git allows each branch in one worktree only. Work in nova-hotfix/, or remove it first.',
    },
    {
      id: 'q-hook-shared',
      question: 'Your pre-commit hook in .git/hooks blocks API keys. Samir clones the repository and commits a key without being stopped. Why?',
      options: [
        { id: 'a', text: 'Hooks only run on macOS' },
        { id: 'b', text: '.git/hooks is not part of the repository, so clones never get it' },
        { id: 'c', text: 'Samir has an older Git version' },
        { id: 'd', text: 'Hooks only run on git push' },
      ],
      correct: 'b',
      explanation:
        'Nothing inside .git is cloned except objects and refs. Share hooks through a committed folder plus core.hooksPath or a hook manager, and enforce on the server, since anyone can still use --no-verify.',
    },
    {
      id: 'q-case',
      question: 'You renamed editor.ts to Editor.ts in Finder. Your Mac builds fine, CI on Linux fails to find Editor.ts. What is going on?',
      options: [
        { id: 'a', text: 'Linux cannot read TypeScript files with capital letters' },
        { id: 'b', text: 'The Mac file system is case-insensitive, so Git still has editor.ts; use git mv to record the rename' },
        { id: 'c', text: 'The .gitattributes eol rule changed the file name' },
        { id: 'd', text: 'CI uses a shallow clone that skips renamed files' },
      ],
      correct: 'b',
      explanation:
        'On a case-insensitive disk, a case-only rename can go unnoticed by Git, so the repository keeps the old name. git mv editor.ts Editor.ts records it, and Linux then sees the right file.',
    },
    {
      id: 'q-submodule',
      question: 'After git submodule add, what does the nova repository itself store about icons/?',
      options: [
        { id: 'a', text: 'A full copy of every icon file' },
        { id: 'b', text: 'The URL in .gitmodules and one exact commit hash of the icons repo' },
        { id: 'c', text: 'The URL only; it always follows the icons main branch' },
        { id: 'd', text: 'A symlink to the icons folder' },
      ],
      correct: 'b',
      explanation:
        'A submodule is pinned: the parent tree has a gitlink entry with one commit hash, and .gitmodules says where to clone it from. Updating it is an explicit commit in the parent.',
    },
    {
      id: 'q-partial',
      question: 'You need full history for git log and blame on a huge repo, but not every old version of every file downloaded up front. Which clone?',
      options: [
        { id: 'a', text: 'git clone --depth 1' },
        { id: 'b', text: 'git clone --filter=blob:none' },
        { id: 'c', text: 'git clone --bare' },
        { id: 'd', text: 'git clone --single-branch' },
      ],
      correct: 'b',
      explanation:
        'A partial clone fetches all commits and trees but fetches file contents on demand. --depth 1 cuts history off, which breaks log and blame beyond the cut.',
    },
    {
      id: 'q-signoff',
      question: 'Which command makes GitHub show the Verified badge on your commit (with your key uploaded)?',
      options: [
        { id: 'a', text: 'git commit -s' },
        { id: 'b', text: 'git commit -S (or commit.gpgsign = true)' },
        { id: 'c', text: 'git commit --trailer "Verified: yes"' },
        { id: 'd', text: 'git notes add -m "signed"' },
      ],
      correct: 'b',
      explanation:
        'Capital -S signs the commit with your GPG or SSH key, which GitHub can verify. Lowercase -s only adds a Signed-off-by text line, and trailers or notes are plain text anyone can write.',
    },
  ],
  theoryOnly: [
    'git worktree list, prune, lock',
    'worktrees vs clone vs stash',
    'subtrees and monorepos',
    'shallow clone, partial clone and sparse-checkout',
    'Git LFS',
    'maintenance, gc and count-objects',
    'case sensitivity, core.fileMode and symlinks',
    'useful config (pull.rebase, fetch.prune, rerere.enabled, diff.algorithm)',
    'hook managers, core.hooksPath and --no-verify',
    'secret scanners (gitleaks, trufflehog) as a pre-commit hook and a history scan',
    'server-side hooks and GitHub rulesets',
    'GPG/SSH signing, Verified badge and vigilant mode',
    '.mailmap',
    'tree, commit and tag objects; ls-tree',
    'refs and packed-refs',
    'the index file',
    'packfiles, delta compression and gc',
    'dangling objects',
    'SHA-1 vs SHA-256',
    'format-patch, am and apply',
    'git bundle',
    'git archive',
    'git replace and grafts',
    'git switch --orphan',
  ],
};

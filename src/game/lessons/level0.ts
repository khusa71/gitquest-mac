/**
 * Lesson 0: Setup. Missions: src/game/levels/level0.ts (identity in local config, alias lg, editor and pager).
 * Guide: docs/LESSON-GUIDE.md.
 */
import type { Lesson } from '../lesson-model';

export const lesson0: Lesson = {
  levelId: 'setup',
  title: 'Setup: Git on your Mac',
  summary:
    'You will understand what Git is (and what GitHub is not), how its layered configuration decides who you are and how it behaves, and how your Mac proves who you are to a server.',
  slides: [
    {
      kind: 'concept',
      id: 'version-control',
      title: 'Version control, distributed',
      body:
        'Version control records every saved state of a project, who made it and why, so you can compare, undo and work in parallel without mailing zip files around.\n\nOlder systems (Subversion, CVS) are centralized: the history lives on one server and your laptop only holds a working copy. No network, no history, no commits.\n\nGit is distributed: every clone holds the complete history. You commit, branch, compare and search offline, at full speed. Talking to a server is a separate, explicit step (fetch, pull, push) that you choose to run.\n\nThe "central" server a team uses is a convention, not a technical difference. It is one more copy that everyone agrees to sync through.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'lea', label: "Lea's Mac", detail: 'full history', row: 0 },
          { id: 'origin', label: 'origin (GitHub)', detail: 'full history, shared meeting point', row: 0 },
          { id: 'you', label: 'Your Mac', detail: 'full history', row: 0 },
          { id: 'ines', label: "Ines's laptop", detail: 'full history', row: 1 },
        ],
        edges: [
          { from: 'lea', to: 'origin', label: 'push' },
          { from: 'origin', to: 'you', label: 'fetch' },
          { from: 'ines', to: 'origin', label: 'push / fetch' },
        ],
        caption: 'Every box is a complete repository. Syncing happens only when someone runs a command.',
      },
      remember: 'Every clone is a full repository; the server is a meeting point, not the master copy.',
    },
    {
      kind: 'concept',
      id: 'git-vs-github',
      title: 'Git is not GitHub',
      body:
        'Git is a program on your Mac. It stores history in the .git folder of a project and works with no account and no internet.\n\nGitHub is a website that hosts Git repositories and adds a collaboration layer on top: pull requests, code review, issues, Actions, permissions. GitLab, Bitbucket and Azure Repos offer the same kind of service. Your repository is the same Git repository whichever host you push it to.\n\nSo when something fails, ask which side it is on. "Your branch is behind" is Git. "Pull request cannot be merged" or "permission denied to the repo" is the host.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'git', label: 'git (your Mac)', detail: 'commits, branches, merges, history', row: 0 },
          { id: 'host', label: 'GitHub / GitLab / Bitbucket', detail: 'hosting + pull requests, issues, CI, access control', row: 0 },
        ],
        edges: [{ from: 'git', to: 'host', label: 'push / fetch over HTTPS or SSH' }],
      },
      remember: 'Git is the tool; GitHub is one place to host and review what Git produces.',
    },
    {
      kind: 'concept',
      id: 'install',
      title: 'Installing Git on a Mac',
      body:
        'macOS ships a placeholder at /usr/bin/git. The first time you run `git --version` without the Xcode Command Line Tools, macOS offers to install them; you can also run `xcode-select --install`. That gives you Apple Git, which prints something like "git version 2.50.1 (Apple Git-155)".\n\nApple Git trails the official release a little. If you want the latest, `brew install git` puts a second git in /opt/homebrew/bin, which wins when that folder comes first in your PATH. `which -a git` lists every git on your PATH in the order the shell tries them.\n\n(On Windows the usual choice is Git for Windows; on Linux, the distribution package, such as `sudo apt install git`.)',
      diagram: {
        kind: 'code',
        title: 'Terminal',
        text: '$ git --version\ngit version 2.50.1 (Apple Git-155)\n\n$ which -a git\n/opt/homebrew/bin/git     <- Homebrew, used first\n/usr/bin/git              <- Apple Git',
      },
      remember: 'git --version tells you if Git works and which one you are running.',
    },
    {
      kind: 'concept',
      id: 'config-levels',
      title: 'Three layers of config',
      body:
        'Git reads its settings from several files, from the widest to the narrowest: --system (every user of the Mac), --global (you: ~/.gitconfig) and --local (one repository: .git/config). When the same key appears in several files, the most local one wins.\n\n`git config user.email "x"` with no flag writes to the current repository. `--global` writes your personal default. You rarely need --system.\n\nWhen a value surprises you, ask where it comes from: `git config --show-origin user.email` prints the file, and `git config --list --show-origin` (or --show-scope) prints everything. On a Mac you will also see a file bundled with the Xcode tools; that is where `credential.helper=osxkeychain` comes from.',
      diagram: {
        kind: 'code',
        title: 'git config --list --show-scope',
        text: 'global  user.name=MacBook User\nglobal  user.email=me@home.example\nglobal  alias.lg=log --oneline --graph --all\nlocal   user.name=Alex Martin           <- wins in this repo\nlocal   user.email=alex@nova.dev        <- wins in this repo',
      },
      remember: 'Global for your defaults, local for the exceptions; --show-origin tells you who won.',
    },
    {
      kind: 'concept',
      id: 'identity',
      title: 'Your identity in every commit',
      body:
        'Every commit permanently records an author name and email, taken from user.name and user.email. Set them before your first commit. Changing them later does not rewrite old commits.\n\nThis is a label, not a login: Git does not check it. GitHub links a commit to your account when the email matches one of your verified addresses. If you do not want to publish your address, GitHub gives you a noreply address to use instead.\n\nWork and personal projects on the same Mac? Instead of setting the work email by hand in every repo, put an includeIf block in ~/.gitconfig: every repository under ~/work/ then loads a second file with your work identity. The trailing slash matters; it means "everything below this folder".',
      diagram: {
        kind: 'code',
        title: '~/.gitconfig and ~/.gitconfig-nova',
        text: '# ~/.gitconfig\n[user]\n    name = Alex Martin\n    email = alex@home.example\n[includeIf "gitdir:~/work/"]\n    path = ~/.gitconfig-nova\n\n# ~/.gitconfig-nova  (used inside ~/work/ only)\n[user]\n    email = alex@nova.dev',
      },
      remember: 'user.name and user.email are stamped on each commit; includeIf switches them by folder.',
    },
    {
      kind: 'concept',
      id: 'editor-pager',
      title: 'Default branch, editor and pager',
      body:
        '`git config --global init.defaultBranch main` makes every new `git init` start on main, the name GitHub and most teams use.\n\nGit opens an editor whenever it needs text from you: a commit without -m, a merge message, an interactive rebase plan. It uses GIT_EDITOR, then core.editor, then VISUAL and EDITOR, and falls back to vi. The editor command must not return until you close the file, which is why VS Code needs `code --wait`. With plain `code`, Git sees the editor exit at once and gets an empty message.\n\nLong output (log, diff, show) goes through a pager, less by default. In less, space pages down, / searches, q quits. `less -FRX` quits by itself when the output fits on one screen (-F), keeps colours (-R) and leaves the text on screen after quitting (-X). `git --no-pager log` skips it once.',
      diagram: {
        kind: 'code',
        title: '~/.gitconfig',
        text: '[init]\n    defaultBranch = main\n[core]\n    editor = code --wait     # or: nano\n    pager = less -FRX',
      },
      remember: 'The editor must block until you close it; in the pager, q quits.',
    },
    {
      kind: 'concept',
      id: 'aliases',
      title: 'Aliases',
      body:
        'An alias is a config key in the alias section. With `alias.lg = log --oneline --graph --all`, typing `git lg` runs that command, and anything you add is appended: `git lg -n 5`.\n\nA value that starts with ! runs a shell command instead, from the top folder of the repository: `alias.root = !pwd`.\n\nAn alias cannot replace a built-in command: an alias named status is silently ignored. Keep aliases few and obvious, and put the ones you want everywhere in --global.',
      diagram: {
        kind: 'code',
        title: 'Aliases worth having',
        text: '[alias]\n    lg = log --oneline --graph --all\n    st = status -s\n    last = log -1 --stat',
      },
      remember: 'Aliases save typing, not understanding.',
    },
    {
      kind: 'concept',
      id: 'line-endings',
      title: 'Line endings',
      body:
        'Windows ends text lines with two characters (CRLF), macOS and Linux with one (LF). If a Windows editor and a Mac editor take turns on a file, every line changes its ending, and the diff says the whole file changed although nobody touched the code.\n\ncore.autocrlf tells Git to convert. On Windows use true (CRLF on disk, LF in commits). On a Mac or Linux use input (turn any CRLF into LF when you commit, change nothing on checkout). false means no conversion at all.\n\nThe team-wide fix is a committed .gitattributes file, because it travels with the repository instead of depending on each person\'s config.',
      diagram: {
        kind: 'code',
        title: '.gitattributes',
        text: '* text=auto          # normalise text files to LF in the repo\n*.sh text eol=lf     # scripts keep LF even on Windows\n*.png binary         # never convert or diff',
      },
      remember: 'A diff where every line changed is usually line endings: autocrlf=input on a Mac, .gitattributes for the team.',
    },
    {
      kind: 'concept',
      id: 'https-credentials',
      title: 'HTTPS: tokens and the keychain',
      body:
        'A remote URL decides how your Mac talks to the server. https://github.com/nova/notes.git uses HTTPS: you authenticate with a username and a personal access token. GitHub stopped accepting account passwords for Git in 2021, so the "password" Git asks for is the token.\n\nA credential helper stores the token so you type it once. On a Mac, Apple Git already uses osxkeychain, which saves it in the macOS Keychain. Git Credential Manager (GCM) is a cross-platform helper that can also sign you in through the browser.\n\nIf you change or revoke a token, the old one stays in the Keychain and pushes fail with "Authentication failed". Delete the github.com entry in Keychain Access and push again to be asked for the new token.',
      diagram: {
        kind: 'flow',
        nodes: [
          { id: 'git', label: 'git push', row: 0 },
          { id: 'helper', label: 'credential helper', detail: 'osxkeychain / GCM', row: 0 },
          { id: 'gh', label: 'github.com', detail: 'checks the token', row: 0 },
        ],
        edges: [
          { from: 'git', to: 'helper', label: 'token for github.com?' },
          { from: 'helper', to: 'gh', label: 'username + token' },
        ],
      },
      remember: 'HTTPS needs a token, not your password; the keychain remembers it.',
    },
    {
      kind: 'concept',
      id: 'ssh-keys',
      title: 'SSH keys',
      body:
        'The other option is SSH: the URL looks like git@github.com:nova/notes.git. You create a key pair once with `ssh-keygen -t ed25519 -C "alex@nova.dev"`. The private key (~/.ssh/id_ed25519) never leaves your Mac; you paste the public key (~/.ssh/id_ed25519.pub) into GitHub under Settings, SSH keys.\n\nIf you protect the key with a passphrase, macOS can keep it in the Keychain so you are not asked every time (the ~/.ssh/config lines below, plus `ssh-add --apple-use-keychain ~/.ssh/id_ed25519` once).\n\nTest the connection without Git: `ssh -T git@github.com` answers "Hi alex! You\'ve successfully authenticated". Both methods are fine; pick one and use matching URLs.',
      diagram: {
        kind: 'code',
        title: '~/.ssh/config',
        text: 'Host github.com\n    AddKeysToAgent yes\n    UseKeychain yes\n    IdentityFile ~/.ssh/id_ed25519',
      },
      remember: 'Private key stays on the Mac, public key goes to GitHub; ssh -T tests it.',
    },
    {
      kind: 'concept',
      id: 'prompt',
      title: 'Show the branch in your prompt',
      body:
        'Half of all Git surprises are "I was on the wrong branch". Put the current branch in your shell prompt and you will see it before every command.\n\nGit ships a script, git-prompt.sh, that defines __git_ps1. With the Command Line Tools it lives in /Library/Developer/CommandLineTools/usr/share/git-core/. Source it in ~/.zshrc as below. Tools like Starship or oh-my-zsh themes do the same with more decoration.\n\nUntil then, `git status` (or `git status -s -b`) answers the same question.',
      diagram: {
        kind: 'code',
        title: '~/.zshrc',
        text: 'source /Library/Developer/CommandLineTools/usr/share/git-core/git-prompt.sh\nsetopt PROMPT_SUBST\nPS1=\'%1~$(__git_ps1 " (%s)") %# \'\n\n# prompt becomes:   nova (main) %',
      },
      remember: 'Always know which branch you are on before you type.',
    },
    {
      kind: 'commands',
      id: 'commands',
      title: 'Setup commands',
      rows: [
        { command: 'git --version', does: 'Shows the installed Git (and installs the Command Line Tools on a fresh Mac).' },
        { command: 'git config user.name "Alex Martin"', does: 'Sets the author name for this repository only (local).' },
        { command: 'git config --global user.email "alex@home.example"', does: 'Sets your default email for every repository (~/.gitconfig).' },
        { command: 'git config --show-origin <key>', does: 'Prints a value and the file it came from.' },
        { command: 'git config --list --show-origin', does: 'Lists every setting with its file (--show-scope prints system/global/local).' },
        { command: 'git config --global init.defaultBranch main', does: 'New repositories start on main.' },
        { command: 'git config core.editor "code --wait"', does: 'Uses VS Code for messages; --wait makes Git wait until you close the tab.' },
        { command: 'git config core.pager "less -FRX"', does: 'Pages long output; q quits.' },
        { command: 'git config alias.lg "log --oneline --graph --all"', does: 'Creates git lg.' },
        { command: 'git config --global core.autocrlf input', does: 'On a Mac: turn CRLF into LF when committing.' },
        { command: 'git config --unset <key>', does: 'Removes a key from the chosen level.' },
        { command: 'ssh-keygen -t ed25519 -C "you@nova.dev"', does: 'Creates an SSH key pair in ~/.ssh.' },
        { command: 'ssh -T git@github.com', does: 'Checks that GitHub accepts your SSH key.' },
        { command: 'git help config / git config -h', does: 'Full manual page / short list of options.' },
      ],
    },
    {
      kind: 'pitfalls',
      id: 'pitfalls',
      title: 'Setup pitfalls',
      items: [
        {
          mistake: 'You ran git config --global user.email, but commits in this repo still use the old address.',
          fix: 'The repo has its own local value, which wins. Check with git config --show-origin user.email and set it without --global (or --unset the local one).',
        },
        {
          mistake: 'Commits made before setting your identity show "MacBook User" or your Mac login name.',
          fix: 'Config only affects new commits. Fix the last one with git commit --amend --reset-author --no-edit; older pushed commits are better left alone.',
        },
        {
          mistake: 'core.editor = code (no --wait): every commit aborts with "empty commit message".',
          fix: 'Set it to code --wait, or use git commit -m "..." for short messages.',
        },
        {
          mistake: 'You ended up in vi and cannot get out.',
          fix: 'Press Esc, type :wq and Enter to save and continue (or :q! to abort). Then set core.editor to something you know, like nano.',
        },
        {
          mistake: 'git log seems frozen and shows a colon at the bottom.',
          fix: 'You are in the pager. Press q. Space scrolls, / searches.',
        },
        {
          mistake: 'Every line of a file shows as changed after a teammate on Windows edited it.',
          fix: 'Line endings. Set core.autocrlf (input on a Mac) and commit a .gitattributes with * text=auto.',
        },
        {
          mistake: 'git push over HTTPS asks for a password and rejects your GitHub password.',
          fix: 'Use a personal access token as the password, or switch the remote to SSH with git remote set-url origin git@github.com:org/repo.git.',
        },
      ],
    },
  ],
  quiz: [
    {
      id: 'q-which-wins',
      question:
        'Your ~/.gitconfig says user.email = me@home.example. Inside the Nova repo you run git config user.email alex@nova.dev. Which email will your next commit in Nova use, and in your personal blog repo?',
      options: [
        { id: 'a', text: 'alex@nova.dev in both: the last command run wins everywhere.' },
        { id: 'b', text: 'alex@nova.dev in Nova, me@home.example in the blog.' },
        { id: 'c', text: 'me@home.example in both: --global always overrides local.' },
        { id: 'd', text: 'Git refuses to commit because the two values conflict.' },
      ],
      correct: 'b',
      explanation:
        'Without a flag, git config writes to .git/config of the current repo. Local beats global, but only inside that repo; every other repo still reads the global value.',
    },
    {
      id: 'q-where-from',
      question: 'A commit came out with the wrong email and you have no idea which file set it. What is the fastest way to find out?',
      options: [
        { id: 'a', text: 'git config --show-origin user.email' },
        { id: 'b', text: 'cat ~/.gitconfig' },
        { id: 'c', text: 'git log --format=%ae -1' },
        { id: 'd', text: 'git config --global --get user.email' },
      ],
      correct: 'a',
      explanation:
        '--show-origin prints the winning value and the file it came from, whatever the level. Reading ~/.gitconfig or asking --global only shows one layer, and git log only shows the result, not its source.',
    },
    {
      id: 'q-editor',
      question: 'You set core.editor to "code". You run git commit, VS Code opens, you type a message and save. What happens?',
      options: [
        { id: 'a', text: 'The commit uses your message once you close the tab.' },
        { id: 'b', text: 'Git aborts at once with an empty message, before you even typed.' },
        { id: 'c', text: 'Git waits forever because VS Code never exits.' },
        { id: 'd', text: 'Git falls back to vi.' },
      ],
      correct: 'b',
      explanation:
        'The code command hands the file to VS Code and exits immediately. Git takes that exit as "editor closed", reads the still-empty file and aborts. --wait makes code block until you close the tab.',
    },
    {
      id: 'q-github',
      question: 'Which of these needs GitHub (or another host) rather than Git itself?',
      options: [
        { id: 'a', text: 'Comparing two branches on your Mac with no internet.' },
        { id: 'b', text: 'Creating a commit on a plane.' },
        { id: 'c', text: 'Asking a teammate to review your branch in a pull request.' },
        { id: 'd', text: 'Reading the history of a file you cloned last week.' },
      ],
      correct: 'c',
      explanation:
        'Pull requests and reviews are a hosting feature. Committing, comparing and reading history are pure Git and work offline because every clone has the full history.',
    },
    {
      id: 'q-alias',
      question: 'You add alias.st = "status -s". What does git st --branch run?',
      options: [
        { id: 'a', text: 'git status -s --branch' },
        { id: 'b', text: 'git st --branch, which fails: st is not a command.' },
        { id: 'c', text: 'git status --branch, dropping -s.' },
        { id: 'd', text: 'git branch' },
      ],
      correct: 'a',
      explanation: 'Git replaces the alias name with its value and keeps the extra arguments after it.',
    },
    {
      id: 'q-https',
      question:
        'git push to https://github.com/nova/notes.git fails with "Authentication failed". You created a new token yesterday after revoking the old one. Most likely cause?',
      options: [
        { id: 'a', text: 'Your user.email does not match your GitHub account.' },
        { id: 'b', text: 'The macOS Keychain still holds the revoked token and Git keeps sending it.' },
        { id: 'c', text: 'HTTPS remotes need an SSH key.' },
        { id: 'd', text: 'Your branch is behind origin.' },
      ],
      correct: 'b',
      explanation:
        'The credential helper replays whatever it stored. Delete the github.com entry in Keychain Access, push again, and paste the new token. user.email is only a label in commits; it plays no part in authentication.',
    },
    {
      id: 'q-crlf',
      question: 'Samir on Windows edited one line of README.md, but git diff on your Mac shows every line removed and added. What is the right fix?',
      options: [
        { id: 'a', text: 'Ask Samir to stop using Windows.' },
        { id: 'b', text: 'Commit a .gitattributes with * text=auto, and use core.autocrlf (true on Windows, input on Mac).' },
        { id: 'c', text: 'Run git diff -w and commit anyway.' },
        { id: 'd', text: 'Set core.pager to less -R.' },
      ],
      correct: 'b',
      explanation:
        'His editor wrote CRLF line endings, so every line differs by an invisible character. Normalising line endings in the repository fixes it for everyone; -w only hides it from one diff.',
    },
  ],
  theoryOnly: [
    'Version control: centralized vs distributed',
    'Git vs GitHub (GitLab, Bitbucket, Azure Repos)',
    'Installing Git (Xcode Command Line Tools, Homebrew) and git --version',
    'includeIf for work vs personal identity',
    'init.defaultBranch',
    'Line endings: core.autocrlf and .gitattributes',
    'Credential helpers (osxkeychain, Git Credential Manager)',
    'SSH keys vs HTTPS with a personal access token',
    'Shell prompt branch display',
  ],
};

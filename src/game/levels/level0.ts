/**
 * Level 0 — Setup. Owner: the level 0 content agent. See docs/CONTENT-GUIDE.md.
 * Everything here is verified through ctx.facts.config (sandbox global + this repo's local config).
 * SSH keys vs HTTPS tokens, credential helpers and line endings live in theory text: nothing to check locally.
 */
import { productionRepo } from '../production';
import { allOf, check, headBranch, headCommit, headFile } from '../validate';

import type { RepoState } from '../../shared/repo-types';
import type { Level, Mission, MissionContext } from '../model';

/** The personal identity the repo was created with (local config overrides the sandbox global one). */
const HOME_NAME = 'MacBook User';
const HOME_EMAIL = 'me@home.example';

const conf = (ctx: MissionContext, key: string): string => (ctx.facts.config[key] ?? '').trim().replace(/\s+/g, ' ');

/** A git command the player ran successfully; `re` is tested against the arguments after `git`. */
function ran(ctx: MissionContext, re: RegExp): boolean {
  return ctx.commands.some((typed) => {
    const args = /^git\s+(?:--no-pager\s+)?(.*)$/.exec(typed.command.trim())?.[1];
    return args !== undefined && typed.exitCode === 0 && re.test(args);
  });
}

// Missions -----------------------------------------------------------------

const workEmail = (ctx: MissionContext): boolean => conf(ctx, 'user.email').toLowerCase().endsWith('@nova.dev');
const realName = (ctx: MissionContext): boolean =>
  conf(ctx, 'user.name') !== '' && conf(ctx, 'user.name') !== HOME_NAME;

const identity: Mission = {
  id: 'identity',
  number: '0.1',
  title: 'Who is committing?',
  story:
    'You cloned the Nova repo on your laptop and its config still says "MacBook User" <me@home.example>. Lea wants every Nova commit signed with a real name and an @nova.dev address, and only in this repo: your personal projects keep their own identity.',
  goal: 'Set user.name and an @nova.dev user.email in the config of this repository only.',
  outcome: {
    summary: 'Every commit you make in the Nova repo carries your real name and work address, while your personal projects keep their own identity. The author on a commit is how teammates, reviews and blame know who to ask.',
    expect: {
      kind: 'terminal',
      command: 'git config --local --show-origin --get-regexp user',
      output: 'file:.git/config\tuser.name Alex Martin\nfile:.git/config\tuser.email alex@nova.dev',
    },
  },
  checks: [
    {
      label: 'user.name is your real name in this repo',
      proof: 'git config --show-origin user.name',
      done: (_state, ctx) => realName(ctx),
    },
    {
      label: 'user.email is an @nova.dev address in this repo',
      proof: 'git config --show-origin user.email',
      done: (_state, ctx) => workEmail(ctx),
    },
  ],
  validate: (_state, ctx) =>
    allOf(
      check(
        realName(ctx),
        `user.name is still "${HOME_NAME}". This repo's own config wins over --global: set it with git config user.name "Your Name".`,
      ),
      check(
        workEmail(ctx),
        `user.email is "${conf(ctx, 'user.email')}", not an @nova.dev address. Set it in this repo with git config user.email "you@nova.dev".`,
      ),
    ),
  hints: [
    'Git reads config in layers: system, then global, then the repo itself. The last one wins.',
    'This repo has its own user.name and user.email, so a --global change is hidden. Run git config without --global.',
    'git config user.name "Alex Martin", then git config user.email "alex@nova.dev".',
  ],
  par: 2,
  takeaway: 'git config without a flag writes to the current repo, and that local value overrides --global.',
  theory: {
    title: 'Three layers of config',
    body: 'Git config has three levels: --system for the whole Mac, --global for your user (~/.gitconfig) and --local for one repo (.git/config). When a key is set at several levels, the most local one wins. Every commit records user.name and user.email, so set them before your first commit, and check where a value comes from with git config --show-origin.',
    lesson: 'Global for your defaults, local for the exceptions.',
  },
  prelude: [],
  reference: ['git config user.name "Alex Martin"', 'git config user.email "alex@nova.dev"'],
  alternatives: [['git config --local user.email "alex@nova.dev"', 'git config --local user.name "Alex Martin"']],
};

const LG = 'log --oneline --graph --all';
const lgAlias = (ctx: MissionContext): boolean => {
  const value = conf(ctx, 'alias.lg').split(' ');
  return value[0] === 'log' && ['--oneline', '--graph', '--all'].every((flag) => value.includes(flag));
};

const alias: Mission = {
  id: 'alias-lg',
  number: '0.2',
  title: 'Your first alias',
  story:
    'Samir types git log --oneline --graph --all twenty times a day. He shows you his shortcut: git lg. Set it up for yourself and try it.',
  goal: `Create the alias lg for "${LG}" and run git lg.`,
  outcome: {
    summary: 'Two letters show the whole history as a graph: every branch, every merge, one line per commit. You read history far more often than you write it, so the shortcut pays for itself on day one.',
    expect: {
      kind: 'terminal',
      command: 'git lg',
      output: '* 24cd7d2 (HEAD -> main) Initial commit',
    },
  },
  checks: [
    {
      label: `alias.lg runs "${LG}"`,
      proof: 'git config --get alias.lg',
      done: (_state, ctx) => lgAlias(ctx),
    },
    {
      label: 'Run git lg',
      proof: 'git lg',
      done: (_state, ctx) => lgAlias(ctx) && ran(ctx, /^lg\b/),
    },
  ],
  validate: (_state, ctx) =>
    allOf(
      check(
        lgAlias(ctx),
        conf(ctx, 'alias.lg') === ''
          ? 'There is no alias.lg yet. Create it with git config alias.lg "log --oneline --graph --all".'
          : `alias.lg is "${conf(ctx, 'alias.lg')}": it must be log with --oneline, --graph and --all.`,
      ),
      check(ran(ctx, /^lg\b/), 'The alias exists. Now run git lg to see the whole history as a graph.'),
    ),
  hints: [
    'An alias is just a config key under alias.',
    'Quote the value: everything after git lg is replaced by what you store in alias.lg.',
    `git config alias.lg "${LG}", then git lg.`,
  ],
  par: 2,
  takeaway: 'git config alias.<name> "<command>" turns a long git command into git <name>.',
  theory: {
    title: 'Aliases',
    body: 'An alias is a config entry: alias.lg = log --oneline --graph --all makes git lg run that command. Put aliases you want everywhere in --global; on your own Mac that is ~/.gitconfig. Start with one or two you really use, so you still remember the real commands.',
    lesson: 'Aliases save typing, not understanding.',
  },
  prelude: [],
  reference: [`git config alias.lg "${LG}"`, 'git lg'],
  alternatives: [[`git config --global alias.lg "${LG} --decorate"`, 'git lg -n 5']],
};

const editorWithWait = (ctx: MissionContext): boolean => /^code( .*)? (--wait|-w)( |$)/.test(conf(ctx, 'core.editor'));
const lessPager = (ctx: MissionContext): boolean => /^less( |$)/.test(conf(ctx, 'core.pager'));
const sawOrigin = (ctx: MissionContext): boolean => ran(ctx, /^config\b.*--show-(origin|scope)\b/);

const editorPager: Mission = {
  id: 'editor-pager',
  number: '0.3',
  title: 'Editor and pager',
  story:
    'Ines writes commit messages and rebase plans in VS Code, and she wants long git output to page instead of flooding the terminal. Set both for this repo, then check where each setting comes from.',
  goal: 'Set core.editor to "code --wait" and core.pager to "less -FRX", then list config with --show-origin.',
  outcome: {
    summary: 'When git needs a message from you (a merge, a rebase, a commit without -m) it opens VS Code and waits until you close the tab, and long output like git log scrolls in a pager that gets out of the way when it is short. You will also know which config file each setting comes from.',
    expect: {
      kind: 'terminal',
      command: 'git config --local --show-origin --get-regexp "core.(editor|pager)"',
      output: 'file:.git/config\tcore.editor code --wait\nfile:.git/config\tcore.pager less -FRX',
    },
  },
  checks: [
    {
      label: 'core.editor is code --wait',
      proof: 'git config --get core.editor',
      done: (_state, ctx) => editorWithWait(ctx),
    },
    {
      label: 'core.pager is less -FRX',
      proof: 'git config --get core.pager',
      done: (_state, ctx) => lessPager(ctx),
    },
    {
      label: 'See where each setting comes from',
      proof: 'git config --list --show-origin',
      done: (_state, ctx) => editorWithWait(ctx) && lessPager(ctx) && sawOrigin(ctx),
    },
  ],
  validate: (_state, ctx) =>
    allOf(
      check(
        editorWithWait(ctx),
        /^code\b/.test(conf(ctx, 'core.editor'))
          ? 'core.editor needs --wait: without it git thinks you closed the editor at once and gets an empty message.'
          : 'Set core.editor to "code --wait".',
      ),
      check(lessPager(ctx), 'Set core.pager to "less -FRX".'),
      check(sawOrigin(ctx), 'Run git config --list --show-origin to see which file each setting comes from.'),
    ),
  hints: [
    'Both are ordinary config keys in the core section.',
    'The editor command must wait until you close the file: VS Code needs --wait. In less, q quits.',
    'git config core.editor "code --wait", git config core.pager "less -FRX", git config --list --show-origin.',
  ],
  par: 3,
  takeaway:
    'core.editor must block until you close the file, and git config --show-origin tells you which file set a value.',
  theory: {
    title: 'Editor, pager and the rest of setup',
    body: 'Git opens core.editor for messages without -m (use code --wait, never plain code) and pipes long output through core.pager: in less, q quits and / searches. To talk to GitHub you need either an SSH key (ssh-keygen -t ed25519, public key added to your account) or HTTPS with a personal access token kept by a credential helper (osxkeychain on a Mac), never your password. Set core.autocrlf=input on Mac and Linux (true on Windows) so line endings do not make every line look changed.',
    lesson: 'Configure once: editor, pager, credentials, line endings.',
  },
  prelude: [],
  reference: [
    'git config core.editor "code --wait"',
    'git config core.pager "less -FRX"',
    'git config --list --show-origin',
  ],
  alternatives: [
    [
      'git config --local core.pager "less -R"',
      'git config --local core.editor "code -w"',
      'git config --show-origin --get core.editor',
    ],
  ],
};

// 0.4 Commit failed: Please tell me who you are -------------------------------

const CONTRIBUTING = 'Contributing: one branch per change, PRs need one review.';
const hasIdentity = (ctx: MissionContext): boolean => conf(ctx, 'user.name') !== '' && conf(ctx, 'user.email') !== '';
/** HEAD is a new commit with CONTRIBUTING.md and a real author. */
const committedGuide = (state: RepoState, ctx: MissionContext): boolean => {
  const head = headCommit(state);
  const author = state.commits[head ?? '']?.author;
  return (
    head !== undefined &&
    !ctx.entryCommits.has(head) &&
    headFile(state, 'CONTRIBUTING.md') === CONTRIBUTING &&
    (author?.name.trim() ?? '') !== '' &&
    (author?.email.trim() ?? '') !== ''
  );
};

const unknownIdentity: Mission = {
  id: 'identity-unknown',
  number: '0.4',
  title: 'Please tell me who you are',
  story:
    'Nova Bot ran a setup script in this repo and it blanked user.name and user.email in .git/config. Your CONTRIBUTING.md is staged, and git commit now stops with "Author identity unknown".',
  goal: 'Give this repo a working identity again and commit the staged CONTRIBUTING.md.',
  outcome: {
    summary: 'Your staged guide is committed under a real name and address again, even though a script had blanked the identity in this repo. You will meet this error on a new Mac, in a container or in CI, and you will know it takes two settings and a retry.',
    expect: {
      kind: 'terminal',
      command: 'git log -1 --format="%an <%ae> %s"',
      output: 'Alex Martin <alex@nova.dev> docs: contributing guide',
    },
  },
  checks: [
    {
      label: 'This repo has a user.name and a user.email again',
      proof: 'git config --show-origin user.email',
      done: (_state, ctx) => hasIdentity(ctx),
    },
    {
      label: 'CONTRIBUTING.md is committed with your name on it',
      proof: 'git log -1 --format="%an <%ae> %s"',
      done: (state, ctx) => committedGuide(state, ctx),
    },
  ],
  validate: (state, ctx) =>
    allOf(
      check(
        hasIdentity(ctx),
        'user.name or user.email is still empty. The empty values sit in this repo\'s .git/config and beat --global: set them here with git config user.name and git config user.email (or remove them with git config --unset).',
      ),
      check(headBranch(state) === 'main', 'Stay on main.'),
      check(committedGuide(state, ctx), 'The identity is fixed: now commit the staged CONTRIBUTING.md.'),
    ),
  hints: [
    'Run git commit and read the whole error: git tells you what it is missing and where to set it.',
    'git config --show-origin user.name shows an empty value coming from .git/config. A --global value cannot win over it, so fix it in this repo, then commit again.',
    'git config user.name "Alex Martin", git config user.email "alex@nova.dev", git commit -m "docs: contributing guide".',
  ],
  par: 3,
  takeaway: '"Please tell me who you are" means git has no user.name or user.email for this repo: set them (locally if a local value is in the way) and commit again.',
  theory: {
    title: 'Author identity unknown',
    body: 'Every commit records an author name and email, and git refuses to commit with "Please tell me who you are" when user.name or user.email is missing or empty. This happens on a new Mac, in a container or CI job that has no ~/.gitconfig, or when a repo\'s own config overrides yours with empty values; user.useConfigOnly=true also stops git from guessing from your hostname. Set the identity with git config (--global for your defaults, without it for this repo), check with git config --show-origin, then run the same commit again.',
    lesson: 'No identity, no commit: git config user.name and user.email, then retry.',
  },
  prelude: [
    {
      id: 'm0.4-p1',
      teammate: 'bot',
      commands: ['git config user.name ""', 'git config user.email ""', 'git config user.useConfigOnly true'],
    },
    { id: 'm0.4-p2', commands: [`edit CONTRIBUTING.md "${CONTRIBUTING}"`, 'git add CONTRIBUTING.md'] },
  ],
  reference: ['git config user.name "Alex Martin"', 'git config user.email "alex@nova.dev"', 'git commit -m "docs: contributing guide"'],
  alternatives: [
    // The failing commit first (proves the error), then remove the empty local values so --global applies again.
    [
      'git! commit -m "docs: contributing guide"',
      'git config --unset user.name',
      'git config --unset user.email',
      'git commit -m "docs: contributing guide"',
    ],
  ],
};

// 0.5 Capstone: first day on the production repo ---------------------------

/** Aliases whose value is a log with --graph (alias names as git stores them, lower-cased). */
const graphAliases = (ctx: MissionContext): string[] =>
  Object.keys(ctx.facts.config)
    .filter((key) => key.startsWith('alias.'))
    .filter((key) => {
      const value = conf(ctx, key).replace(/^!git /, '').split(' ');
      return value[0] === 'log' && value.includes('--graph');
    })
    .map((key) => key.slice('alias.'.length));
const ranGraphAlias = (ctx: MissionContext): boolean =>
  graphAliases(ctx).some((name) => ran(ctx, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i')));
/** Any command that shows who reviews packages/sync: CODEOWNERS itself, or the history of the package. */
const foundSyncOwner = (ctx: MissionContext): boolean =>
  ctx.commands.some(
    (typed) =>
      typed.exitCode === 0 &&
      (/CODEOWNERS/.test(typed.command) || /\b(log|shortlog|blame|lg)\b.*packages\/sync/.test(typed.command)),
  );

const firstDay: Mission = {
  id: 'first-day-at-nova',
  number: '0.5',
  title: 'First day at Nova',
  capstone: true,
  story:
    'It is your first day, and Lea has handed you the real Nova monorepo: two years of history, release tags and open feature branches. Your laptop setup script copied your personal identity into its config, and your first ticket touches packages/sync. Get set up like a Nova engineer before you write a line of code.',
  goal: 'Commit as yourself with an @nova.dev address in this repo only, have a working graph log alias, prove where your identity comes from, and find out who reviews packages/sync.',
  outcome: {
    summary: 'The monorepo commits as you with your work address, its history is one short command away as a graph, and you know which file your identity comes from and who reviews the sync package. That is the setup every new engineer needs before touching shared code.',
    expect: {
      kind: 'terminal',
      command: 'git config --local --show-origin --get-regexp "user|alias"',
      output: 'file:.git/config\tuser.name Alex Martin\nfile:.git/config\tuser.email alex@nova.dev\nfile:.git/config\talias.lg log --oneline --graph --all',
    },
  },
  checks: [
    {
      label: 'This repo commits as you, with an @nova.dev address',
      proof: 'git config --show-origin user.email',
      done: (_state, ctx) => realName(ctx) && workEmail(ctx),
    },
    {
      label: 'A graph log alias exists and you used it',
      proof: 'git config --get-regexp alias',
      done: (_state, ctx) => ranGraphAlias(ctx),
    },
    {
      label: 'Checked which config file your identity comes from',
      proof: 'git config --list --show-origin',
      done: (_state, ctx) => realName(ctx) && workEmail(ctx) && sawOrigin(ctx),
    },
    {
      label: 'Found who reviews packages/sync',
      proof: 'git show HEAD:.github/CODEOWNERS',
      done: (_state, ctx) => foundSyncOwner(ctx),
    },
  ],
  validate: (_state, ctx) =>
    allOf(
      check(
        realName(ctx) && workEmail(ctx),
        `This repo still commits as "${conf(ctx, 'user.name')}" <${conf(ctx, 'user.email')}>. Its own config beats --global, so set user.name and an @nova.dev user.email here.`,
      ),
      check(
        graphAliases(ctx).length > 0,
        'Create an alias for the history graph, for example git config alias.lg "log --oneline --graph --all".',
      ),
      check(ranGraphAlias(ctx), 'Your graph alias exists: run it once to see the branches and merges of the monorepo.'),
      check(sawOrigin(ctx), 'Check where your identity comes from with git config --show-origin.'),
      check(
        foundSyncOwner(ctx),
        'Find out who reviews packages/sync: the answer is in .github/CODEOWNERS, and the package history shows who works on it.',
      ),
    ),
  hints: [
    'Four chores: who you commit as, a shortcut for the history graph, proof of where a setting comes from, and who reviews the sync package.',
    'The repo has its own user.name and user.email, so set them without --global. An alias is a config key under alias. Big repos list their reviewers in .github/CODEOWNERS.',
    'git config user.name "Alex Martin", git config user.email "alex@nova.dev", git config alias.lg "log --oneline --graph --all", git lg -n 15, git config --show-origin user.email, git show HEAD:.github/CODEOWNERS.',
  ],
  par: 6,
  takeaway: 'On a new team, fix your identity per repo, make the history easy to read, and learn who reviews what before you change it.',
  theory: {
    title: 'Setting up on a real codebase',
    body: 'A work repo should never get your personal email: set it locally, or once for every work repo with an includeIf "gitdir:~/work/" section in ~/.gitconfig, and confirm with git config --show-origin. Aliases like lg turn a sixty-commit history with release branches into a readable graph. .github/CODEOWNERS maps paths to reviewers, so GitHub asks them automatically on every pull request that touches their code.',
    lesson: 'Right identity, readable history, known reviewers: then start coding.',
  },
  root: [...productionRepo({ remote: false }), `git config user.name "${HOME_NAME}"`, `git config user.email "${HOME_EMAIL}"`],
  prelude: [],
  reference: [
    'git config user.name "Alex Martin"',
    'git config user.email "alex@nova.dev"',
    `git config alias.lg "${LG}"`,
    'git lg -n 15',
    'git config --show-origin user.email',
    'git show HEAD:.github/CODEOWNERS',
  ],
  alternatives: [
    [
      'git config --local user.email "alex.martin@nova.dev"',
      'git config --local user.name "Alex Martin"',
      'git config --local alias.graph "log --graph --decorate --oneline"',
      'git graph',
      'git config --list --show-origin',
      'git shortlog -sn -- packages/sync',
    ],
  ],
};

export const level0: Level = {
  id: 'setup',
  number: 0,
  title: 'Setup',
  topics: 'git config levels, identity, aliases, editor and pager, SSH keys and tokens',
  planned: 5,
  root: [
    'git init -b main',
    'edit README.md "# Nova notes app"',
    'git add README.md',
    'git commit -m "Initial commit"',
    `git config user.name "${HOME_NAME}"`,
    `git config user.email "${HOME_EMAIL}"`,
  ],
  missions: [identity, alias, editorPager, unknownIdentity, firstDay],
};

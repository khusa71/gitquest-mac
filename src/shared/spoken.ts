/**
 * Turns dictated speech into a shell command ("git add app dot ts" → `git add app.ts`).
 * Pure: no Node, no DOM. The renderer calls `toCommand` on every final transcript; null means
 * "not a command" and the text goes to the tutor instead.
 *
 * ponytail: the whole utterance is lowercased (the recognizer capitalises at random), so commit
 * messages come out lowercase and filenames other than README/HEAD lose their capitals.
 */

const GIT_SUBCOMMANDS = new Set([
  'add', 'am', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config',
  'diff', 'fetch', 'grep', 'help', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'reflog', 'remote',
  'reset', 'restore', 'revert', 'rm', 'show', 'stash', 'status', 'switch', 'tag', 'worktree',
]);

/** Common recognizer mistakes in the subcommand position. */
const SUBCOMMAND_FIXES: Record<string, string> = {
  commits: 'commit', comment: 'commit', comets: 'commit', at: 'add', ad: 'add', adds: 'add', logs: 'log',
  locked: 'log', statuses: 'status', diffs: 'diff', def: 'diff', restored: 'restore', resets: 'reset',
  branches: 'branch', pushed: 'push', pulled: 'pull', merged: 'merge', shows: 'show', switched: 'switch',
};

const LONG_OPTIONS = new Set([
  'staged', 'cached', 'oneline', 'soft', 'hard', 'mixed', 'amend', 'all', 'graph', 'stat', 'global', 'force',
  'patch', 'decorate', 'short', 'verbose', 'version', 'help', 'continue', 'abort', 'quiet', 'list', 'merged',
]);
const LONG_FIXES: Record<string, string> = { stage: 'staged', stages: 'staged', cash: 'cached', cashed: 'cached', online: 'oneline' };

const NUMBERS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};
/** Extra number mishearings, only trusted right after ~ ^ @. */
const REF_NUMBERS: Record<string, string> = { ...NUMBERS, won: '1', to: '2', too: '2', for: '4' };

const EXTENSION_FIXES: Record<string, string> = { text: 'txt', jason: 'json', jays: 'js', marked: 'md' };
const LETTER_NAMES: Record<string, string> = { em: 'm', en: 'n', ay: 'a', pee: 'p', vee: 'v' };

const DASH = new Set(['dash', 'minus', 'hyphen']);
const MESSAGE_FLAG_COMMANDS = new Set(['commit', 'stash', 'tag']);

interface Part {
  t: string;
  /** Attach to the previous part without a space. */
  l?: boolean;
  /** The next part attaches to this one without a space. */
  r?: boolean;
}

function join(parts: readonly Part[]): string {
  let s = '';
  parts.forEach((p, i) => {
    s += i > 0 && !p.l && !parts[i - 1]!.r ? ` ${p.t}` : p.t;
  });
  return s;
}

const isLetter = (w: string | undefined): w is string => w !== undefined && /^[a-z]$/.test(LETTER_NAMES[w] ?? w);
const letter = (w: string) => LETTER_NAMES[w] ?? w;

/** "quote … end quote" / "unquote" / "close quote" terminator length at i, or 0. */
function endQuoteAt(words: readonly string[], i: number): number {
  const w = words[i];
  if (w === 'unquote' || w === 'endquote') return 1;
  if ((w === 'end' || w === 'close') && words[i + 1] === 'quote') return 2;
  return 0;
}

/** Collects words from i into a quoted string; returns [quoted, next index]. */
function readQuoted(words: readonly string[], i: number): [string, number] {
  const parts: Part[] = [];
  while (i < words.length) {
    const end = endQuoteAt(words, i);
    if (end) {
      i += end;
      break;
    }
    const raw = words[i++]!;
    const w = raw.replace(/["“”]/g, '');
    if (!w) continue;
    if (w === 'colon') parts.push({ t: ':', l: true });
    else if (w === 'comma') parts.push({ t: ',', l: true });
    else if (w === 'dash' || w === 'hyphen') parts.push({ t: '-', l: true, r: true });
    else if (/^\d+$|^(one|two|three|four|five|six|seven|eight|nine|ten)$/.test(w) && parts.at(-1)?.t === 'v')
      parts.push({ t: NUMBERS[w] ?? w, l: true }); // "v two" → v2
    else parts.push({ t: w });
  }
  const text = join(parts).replace(/[\\"$`]/g, '\\$&');
  return [`"${text}"`, i];
}

/**
 * Returns the shell command the player dictated, or null when the utterance isn't a command.
 * Commands start with "git" (or "get", a common mishearing) followed by a known subcommand,
 * or with "run …" / "type …" followed by any command.
 */
export function toCommand(spoken: string): string | null {
  const cleaned = spoken
    .toLowerCase()
    .replace(/[.?!…]+\s*$/, '') // sentence punctuation the recognizer adds
    .replace(/,/g, ' ')
    .trim();
  let words = cleaned.split(/\s+/).filter(Boolean);
  while (words[0] === 'please' || words[0] === 'okay' || words[0] === 'ok' || words[0] === 'now') words = words.slice(1);

  const prefixed = words[0] === 'run' || words[0] === 'type';
  if (prefixed) words = words.slice(1);
  if (words[0] === 'get' || words[0] === 'gets' || words[0] === 'git') words[0] = 'git';
  if (words.length === 0) return null;

  const parts: Part[] = [];
  let i = 0;
  let subIndex = 0;
  if (words[0] === 'git') {
    let sub = words[1];
    if (sub === undefined) return null;
    if (sub === 'check' && words[2] === 'out') {
      sub = 'checkout';
      i = 3;
    } else if (sub === 'cherry' && words[2] === 'pick') {
      sub = 'cherry-pick';
      i = 3;
    } else {
      sub = SUBCOMMAND_FIXES[sub] ?? sub;
      i = 2;
    }
    if (!GIT_SUBCOMMANDS.has(sub)) return null;
    parts.push({ t: 'git' }, { t: sub });
    subIndex = 1;
  } else if (!prefixed) {
    return null;
  }
  const command = parts[1]?.t ?? '';

  /** True when the last part is a word a following "." or "/" should stick to (a filename or ref piece). */
  const canGlueLeft = () => {
    const prev = parts.at(-1);
    return parts.length - 1 > subIndex && prev !== undefined && !prev.t.startsWith('-') && !prev.t.startsWith('"');
  };

  while (i < words.length) {
    const w = words[i]!;
    const next = words[i + 1];

    // Quoted spans and commit messages.
    if (w === 'quote' || (w === 'open' && next === 'quote')) {
      const [q, ni] = readQuoted(words, i + (w === 'open' ? 2 : 1));
      parts.push({ t: q });
      i = ni;
      continue;
    }
    if (w === 'message') {
      parts.push({ t: '-m' });
      const start = words[i + 1] === 'quote' ? i + 2 : i + 1;
      const [q, ni] = readQuoted(words, start);
      parts.push({ t: q });
      i = ni;
      continue;
    }

    // Long options and "--".
    const doubleDash = (DASH.has(w) && next !== undefined && DASH.has(next)) || (w === 'double' && next !== undefined && DASH.has(next));
    if (doubleDash || w === '--') {
      i += w === '--' ? 1 : 2;
      let opt = words[i];
      let used = 1;
      if (opt === 'one' && words[i + 1] === 'line') {
        opt = 'oneline';
        used = 2;
      } else if (opt === 'no' && words[i + 1] === 'edit') {
        opt = 'no-edit';
        used = 2;
      } else if (opt !== undefined) {
        opt = LONG_FIXES[opt] ?? opt;
      }
      if (opt !== undefined && (LONG_OPTIONS.has(opt) || opt === 'no-edit')) {
        parts.push({ t: `--${opt}` });
        i += used;
      } else {
        parts.push({ t: '--' });
      }
      continue;
    }

    // Short flags: "dash m", "dash am", "dash a m".
    let flag: string | null = null;
    if (DASH.has(w) && next !== undefined) {
      i++;
      let letters = '';
      if (/^[a-z]{2}$/.test(words[i]!) && !LETTER_NAMES[words[i]!]) letters = words[i++]!;
      const stopAtM = MESSAGE_FLAG_COMMANDS.has(command); // "dash m a new file" → -m "a new file"
      while (!(stopAtM && letters.endsWith('m')) && isLetter(words[i])) letters += letter(words[i++]!);
      if (!letters) {
        parts.push({ t: '-', r: true });
        continue;
      }
      flag = `-${letters}`;
    } else if (/^-[a-z]+$/.test(w)) {
      flag = w;
      i++;
    }
    if (flag !== null) {
      parts.push({ t: flag });
      if (flag.endsWith('m') && MESSAGE_FLAG_COMMANDS.has(command) && i < words.length) {
        const [q, ni] = readQuoted(words, words[i] === 'quote' ? i + 1 : i);
        parts.push({ t: q });
        i = ni;
      }
      continue;
    }

    // Path and ref glue.
    if (w === 'dot' || w === 'period' || w === 'point') {
      i++;
      const ext = words[i];
      if (ext === undefined) {
        parts.push({ t: '.', l: canGlueLeft() });
        continue;
      }
      // Extension: "txt", "text" → txt, spelled letters "t s" → ts.
      let e = EXTENSION_FIXES[ext] ?? NUMBERS[ext] ?? ext;
      i++;
      if (isLetter(ext)) {
        e = letter(ext);
        while (isLetter(words[i])) e += letter(words[i++]!);
      }
      parts.push({ t: `.${e}`, l: canGlueLeft() });
      continue;
    }
    if (w === 'slash' || w === 'colon' || w === 'equals' || w === 'tilde' || w === 'caret') {
      const sym = { slash: '/', colon: ':', equals: '=', tilde: '~', caret: '^' }[w];
      const isRef = w === 'tilde' || w === 'caret';
      const glue = isRef || canGlueLeft();
      i++;
      const n = words[i];
      if (isRef && n !== undefined && REF_NUMBERS[n] !== undefined) {
        parts.push({ t: `${sym}${REF_NUMBERS[n]}`, l: glue });
        i++;
      } else {
        parts.push({ t: sym, l: glue, r: n !== undefined });
      }
      continue;
    }
    if (w === 'at' && parts.length - 1 > subIndex && next !== undefined && (REF_NUMBERS[next] ?? /^\d+$/.test(next))) {
      parts.push({ t: `@{${REF_NUMBERS[next] ?? next}}`, l: true });
      i += 2;
      continue;
    }

    // Words.
    i++;
    if (w === 'read' && words[i] === 'me') {
      i++;
      parts.push({ t: 'README' });
    } else if (w === 'readme') parts.push({ t: 'README' });
    else if (w === 'check' && words[i] === 'out') {
      i++;
      parts.push({ t: 'checkout' });
    } else if (NUMBERS[w] !== undefined) parts.push({ t: NUMBERS[w] });
    else parts.push({ t: w.replace(/^head(?![a-z])/, 'HEAD').replace(/^readme(?![a-z])/, 'README') });
  }
  return join(parts);
}

const QUESTION_START =
  /^(what|what's|whats|why|how|when|where|which|who|whose|can|could|should|would|will|is|are|am|was|were|do|does|did|has|have|explain|tell me|help|hint|give me a hint|i don't|i dont|i'm|im|i am|wait|hmm|so)\b/i;

/** Heuristic: does this utterance sound like a question for the tutor? */
export function isQuestion(spoken: string): boolean {
  const s = spoken.trim();
  return s.endsWith('?') || QUESTION_START.test(s);
}

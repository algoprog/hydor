// Auto mode for Custom: before a file change, a command or an MCP call (not the app's own tools) runs,
// a reviewer decides whether it goes ahead (allow), waits for the user (ask), or is stopped with the
// reason (deny). Fixed rules come first, below. The rest goes to the helper model through the app
// (POST <runtime>/review), which sees only the user's own messages, the folder and the step, never
// tool output or web pages, so text planted in a page or a file cannot argue for a step.
// Decisions are kept for the rest of the turn.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUNTIME = process.env.NAGET_AGENT_RUNTIME ?? '';

export type Decision = 'allow' | 'ask' | 'deny';
export interface Verdict {
  decision: Decision;
  /** A few plain words for the user (and for the model, when stopped). */
  reason: string;
}

/** A step as tools ask about it (ToolCtx.ask). */
export interface Step {
  kind: string;
  title: string;
  /** "edit", "cmd:<first words>" or "mcp:<tool>". */
  key: string;
  rawInput: unknown;
  content?: unknown[];
}

const allow = (reason: string): Verdict => ({ decision: 'allow', reason });
const ask = (reason: string): Verdict => ({ decision: 'ask', reason });

// ---- where paths point ---------------------------------------------------------------------------

const HOME = os.homedir();

/** A path with its links resolved as far as it exists. */
function real(p: string): string {
  const rest: string[] = [];
  let base = p;
  for (let i = 0; i < 100; i++) {
    try {
      return path.join(fs.realpathSync(base), ...rest);
    } catch {}
    const up = path.dirname(base);
    if (up === base) break;
    rest.unshift(path.basename(base));
    base = up;
  }
  return p;
}

/** Where a word of a command points, or null when it cannot be told (a variable, another user's home). */
function resolveWord(word: string, cwd: string): string | null {
  let p = word;
  if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
  p = p.replace(/^\$\{?HOME\}?(?=\/|$)/, HOME).replace(/^\$\{?PWD\}?(?=\/|$)/, cwd);
  if (/[$`]/.test(p) || p.startsWith('~')) return null;
  // A pattern points where its fixed part does.
  p = p.replace(/[*?[{].*$/, '') || '.';
  return real(path.resolve(cwd, p));
}

const within = (p: string, root: string) => p === root || p.startsWith(root.endsWith('/') ? root : root + '/');

class Places {
  readonly cwd: string;
  readonly root: string;
  readonly tmp: string;
  constructor(cwd: string) {
    this.cwd = cwd;
    this.root = real(cwd);
    this.tmp = real(os.tmpdir());
  }
  /** In the session's folder. */
  inside(word: string): boolean {
    const p = resolveWord(word, this.cwd);
    return !!p && within(p, this.root);
  }
  /** In the folder or the temporary folder: scratch the user would not miss. */
  scratch(word: string): boolean {
    const p = resolveWord(word, this.cwd);
    return !!p && (within(p, this.root) || within(p, this.tmp));
  }
}

// ---- reading a command ---------------------------------------------------------------------------

interface Simple {
  words: string[];
  redirs: { op: string; target: string }[];
  /** Takes the previous command's output through a pipe. */
  piped: boolean;
}

interface Parsed {
  cmds: Simple[];
  /** $(…), `…`, <(…): what runs inside cannot be told from here. */
  subst: boolean;
  /** Something runs in the background (&), or shell control flow is used. */
  complex: boolean;
}

const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'select', 'function', 'in']);

/** Splits a command line into simple commands (on && || ; | & and newlines), quotes and redirections understood. */
export function parseCommand(src: string): Parsed {
  const cmds: Simple[] = [];
  let cur: Simple = { words: [], redirs: [], piped: false };
  let word: string | null = null;
  let redir: string | null = null;
  let subst = false;
  let complex = false;
  const docs: string[] = [];
  const endWord = () => {
    if (word === null) return;
    if (redir) {
      cur.redirs.push({ op: redir, target: word });
      if (redir === '<<' || redir === '<<-') docs.push(word);
      redir = null;
    } else cur.words.push(word);
    word = null;
  };
  const endCmd = (piped = false) => {
    endWord();
    if (cur.words.length || cur.redirs.length) cmds.push(cur);
    cur = { words: [], redirs: [], piped };
  };
  const add = (s: string) => (word = (word ?? '') + s);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      const end = j < 0 ? src.length : j;
      add(src.slice(i + 1, end));
      i = end;
    } else if (c === '"') {
      let s = '';
      let j = i + 1;
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === '\\' && j + 1 < src.length && '"\\$`\n'.includes(src[j + 1])) {
          s += src[++j];
          continue;
        }
        if (src[j] === '`' || (src[j] === '$' && src[j + 1] === '(')) subst = true;
        s += src[j];
      }
      add(s);
      i = j;
    } else if (c === '\\') {
      if (n !== '\n') add(n ?? '');
      i++;
    } else if (c === '`' || (c === '$' && n === '(') || ((c === '<' || c === '>') && n === '(')) {
      // What runs inside is read as commands of its own, so the rules see it too.
      subst = true;
      endCmd();
      if (c !== '`') i++;
    } else if (c === '#' && word === null) {
      const j = src.indexOf('\n', i);
      i = (j < 0 ? src.length : j) - 1;
    } else if (c === ' ' || c === '\t') endWord();
    else if (c === '\n') {
      endCmd();
      // A here-document's lines are its text, not commands.
      while (docs.length) {
        const d = docs.shift()!;
        let j = i + 1;
        for (;;) {
          const nl = src.indexOf('\n', j);
          const line = src.slice(j, nl < 0 ? src.length : nl);
          j = nl < 0 ? src.length : nl + 1;
          if (nl < 0 || line.replace(/^\t+/, '') === d) break;
        }
        i = j - 1;
      }
    } else if (c === ';' || c === '(' || c === ')') endCmd();
    else if (c === '&') {
      if (n === '&') {
        endCmd();
        i++;
      } else if (n === '>') {
        endWord();
        redir = src[i + 2] === '>' ? '&>>' : '&>';
        i += redir.length - 1;
      } else {
        complex = true;
        endCmd();
      }
    } else if (c === '|') {
      if (n === '|') {
        endCmd();
        i++;
      } else {
        if (n === '&') i++;
        endCmd(true);
      }
    } else if (c === '>' || c === '<') {
      // A file descriptor's number before the sign (2>) belongs to it.
      if (word !== null && /^\d+$/.test(word)) word = null;
      else endWord();
      let op = c;
      if (c === '>' && (n === '>' || n === '|')) op += src[++i];
      else if (c === '<' && n === '<') {
        op += src[++i];
        if (src[i + 1] === '<' || src[i + 1] === '-') op += src[++i];
      } else if (c === '<' && n === '>') op += src[++i];
      if (src[i + 1] === '&') {
        // 2>&1, >&2: to another descriptor, not a file.
        i++;
        while (i + 1 < src.length && /[\d-]/.test(src[i + 1])) i++;
        continue;
      }
      redir = op;
    } else add(c);
  }
  endCmd();
  for (const cmd of cmds) if (KEYWORDS.has(cmd.words[0] ?? '')) complex = true;
  return { cmds, subst, complex };
}

const WRAPPERS = new Set(['time', 'nice', 'nohup', 'command', 'exec', 'builtin', 'stdbuf', 'ionice', 'chrt', 'taskset', 'env', 'timeout', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}']);

/** The words that run: leading VAR=value, wrappers (env, nice, timeout 30…) and keywords left out. */
function head(words: string[]): string[] {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) i++;
    else if (WRAPPERS.has(w)) {
      i++;
      while (i < words.length && (/^-/.test(words[i]) || (/^\d/.test(words[i]) && ['timeout', 'nice', 'taskset', 'chrt'].includes(w)) || (w === 'env' && /=/.test(words[i])))) i++;
    } else break;
  }
  return words.slice(i);
}

const nameOf = (w: string | undefined) => path.basename(w ?? '');
const pathArgs = (args: string[]) => args.filter((a) => a && !a.startsWith('-') && !/^[a-z]+=/i.test(a));
/** git's subcommand, past its own options (-C dir, -c key=value…). */
function gitSub(args: string[]): { sub: string; rest: string[] } {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace'].includes(args[i]) ? 2 : 1;
  return { sub: args[i] ?? '', rest: args.slice(i + 1) };
}
const FILE_SINKS = new Set(['/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty']);
const writesTo = (r: { op: string; target: string }) => /^(>|>>|>\||&>|&>>|<>)$/.test(r.op) && !FILE_SINKS.has(r.target) && !r.target.startsWith('/dev/fd/');

// ---- the fixed rules -----------------------------------------------------------------------------

const SUDO = new Set(['sudo', 'doas', 'pkexec', 'su', 'run0']);
const SHELLS = /^(ba|z|da|k|fi|c|tc)?sh$|^(python[\d.]*|perl|ruby|node|php|bun|deno|pwsh)$/;
const DOWNLOADERS = new Set(['curl', 'wget', 'fetch', 'aria2c', 'http', 'https', 'xh']);
const PAYMENT_HOSTS = /api\.stripe\.com|api(-m)?\.paypal\.com|connect\.squareup\.com|braintreegateway\.com|api\.adyen\.com|checkout\.com\/payments/i;

/** Why a command needs the user's say, whatever the rest: null when no fixed rule says so. */
function risky(p: Parsed, raw: string, at: Places): string | null {
  if (/(\$\(|`|<\(|>\()\s*(sudo|doas|pkexec)\b/.test(raw)) return 'runs a command as administrator (sudo)';
  if (/\b(ba|z|da|k)?sh\b[^;&|\n]*(<\(|\$\(|`)\s*(curl|wget)\b|\b(source|eval)\s+["']?(<\(|\$\()\s*(curl|wget)\b/.test(raw)) return 'runs a script straight from the internet';
  if (/\bstripe\s+(charges|payment_intents|payouts|transfers|refunds|invoices|subscriptions|checkout)\b/.test(raw) || PAYMENT_HOSTS.test(raw)) return 'may spend money';
  let downloading = false;
  for (const c of p.cmds) {
    const w = head(c.words);
    const name = nameOf(w[0]);
    const args = w.slice(1);
    if (!c.piped) downloading = false;
    if (c.piped && downloading && (SHELLS.test(name) || (SUDO.has(name) && SHELLS.test(nameOf(head(args)[0]))))) return 'runs a script straight from the internet';
    if (DOWNLOADERS.has(name)) downloading = true;
    if (SUDO.has(name) || ((name === 'xargs' || name === 'find') && args.some((a) => SUDO.has(a)))) return 'runs a command as administrator (sudo)';
    if (name === 'git') {
      const g = gitSub(args);
      if (g.sub === 'push' && g.rest.some((a) => /^--(force|force-with-lease|force-if-includes|mirror)(=|$)/.test(a) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a) || /^\+/.test(a))) return 'force-pushes, which can overwrite work on the server';
    }
    if (['chmod', 'chown', 'chgrp', 'setfacl', 'chattr'].includes(name) && args.some((a) => a === '--recursive' || /^-[a-zA-Z]*R[a-zA-Z]*$/.test(a))) return 'changes permissions of a whole folder tree';
    const out = (a: string) => !at.scratch(a);
    const files = pathArgs(args);
    if (['rm', 'rmdir', 'unlink', 'shred', 'srm', 'wipe', 'trash', 'trash-put'].includes(name) && files.some(out)) return 'deletes files outside the folder';
    if (['rm', 'rmdir'].includes(name) && files.some((a) => resolveWord(a, at.cwd) === at.root)) return 'deletes the whole folder';
    if (name === 'truncate' && files.some(out)) return 'overwrites files outside the folder';
    if (name === 'mv' && files.some(out)) return 'moves files out of or into places outside the folder';
    if (['cp', 'install', 'ln', 'rsync'].includes(name)) {
      const ti = args.indexOf('-t');
      const t = args.find((a) => a.startsWith('--target-directory='))?.slice(19) ?? (ti >= 0 ? args[ti + 1] : undefined);
      const dest = t ?? (files.length > 1 ? files[files.length - 1] : undefined);
      // host:path is another machine's: the reviewer weighs that.
      if (dest && !/^[^/]*:/.test(dest) && out(dest)) return 'writes files outside the folder';
    }
    if (name === 'tee' && files.some(out)) return 'writes files outside the folder';
    if (name === 'dd') {
      const of = args.find((a) => a.startsWith('of='));
      if (of && out(of.slice(3))) return 'overwrites files outside the folder';
    }
    if ((name === 'sed' || name === 'perl') && args.some((a) => /^(-[a-zA-Z]*i|--in-place)/.test(a)) && files.some((a) => a.includes('/') && out(a))) return 'changes files outside the folder';
    if (name === 'find' && args.some((a) => a === '-delete' || ((a === '-exec' || a === '-execdir') && /^(rm|shred|unlink)$/.test(nameOf(args[args.indexOf(a) + 1]))))) {
      const starts = args.slice(0, Math.max(0, args.findIndex((a) => /^[-(!]/.test(a))));
      if ((starts.length ? starts : ['.']).some(out)) return 'deletes files outside the folder';
    }
    if (c.redirs.some((r) => writesTo(r) && out(r.target))) return 'writes files outside the folder';
  }
  return null;
}

/** Read-only commands: fine on files in the folder. */
const READS = new Set(
  'ls ll la cat head tail wc grep egrep fgrep rg ag ack tree pwd stat file du df which whereis type sort uniq cut tr diff cmp comm nl column sha1sum sha256sum sha512sum md5sum cksum xxd od hexdump basename dirname realpath readlink jq yq fd strings date uname whoami id hostname echo printf true false test [ sleep seq expr fold rev tac paste join bat eza exa less more'.split(
    ' ',
  ),
);
const GIT_READS = new Set('status log diff show blame ls-files ls-tree rev-parse describe shortlog grep cat-file show-ref name-rev merge-base rev-list for-each-ref count-objects check-ignore whatchanged'.split(' '));
/** Tools that check a project: tests, type checks, builds, linters. */
const CHECKERS = new Set(
  'tsc vue-tsc svelte-check eslint oxlint biome prettier stylelint vitest jest mocha ava tap playwright pytest py.test mypy pyright ruff flake8 pylint black isort tox nox shellcheck hadolint actionlint yamllint rubocop rspec phpunit ctest golangci-lint gofmt markdownlint'.split(
    ' ',
  ),
);
const SCRIPT = /^(test|tests|t|build|lint|typecheck|type-check|types|check|checks|format:check|fmt:check|ci|verify|validate|e2e|unit|coverage|compile|tsc)([:\-_.][\w:.-]*)?$/;

/** Whether this runs the project's own checks (tests, a build, a linter). */
function isCheck(w: string[]): boolean {
  const name = nameOf(w[0]);
  const [a, b] = [w[1] ?? '', w[2] ?? ''];
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) {
    if (a === 'test' || a === 't') return true;
    if (a === 'run' || a === 'run-script') return SCRIPT.test(b);
    if (name !== 'npm' && SCRIPT.test(a)) return true;
    if ((name === 'pnpm' && a === 'exec') || (name === 'npm' && a === 'exec') || (name === 'yarn' && a === 'exec')) return CHECKERS.has(nameOf(b));
    return false;
  }
  if (['npx', 'pnpx', 'bunx'].includes(name)) return CHECKERS.has(nameOf(w.find((x, i) => i > 0 && !x.startsWith('-'))));
  if (['uv', 'poetry', 'pipenv', 'hatch', 'pdm', 'rye'].includes(name) && a === 'run') return isCheck(w.slice(2));
  if (/^python[\d.]*$/.test(name) && a === '-m') return ['pytest', 'unittest', 'mypy', 'ruff', 'flake8', 'pylint', 'black', 'isort', 'compileall', 'py_compile', 'doctest', 'tox'].includes(b);
  if (name === 'node' && a === '--test') return true;
  if (name === 'cargo') return ['test', 'build', 'check', 'clippy', 'bench', 'doc', 'nextest'].includes(a) || (a === 'fmt' && w.includes('--check'));
  if (name === 'go') return ['test', 'build', 'vet'].includes(a);
  if (name === 'make' || name === 'just') return w.slice(1).every((x) => /^-j\d*$/.test(x) || SCRIPT.test(x) || x === 'all');
  if (name === 'mvn' || name === 'mvnw') return w.slice(1).some((x) => ['test', 'verify', 'compile', 'package', 'validate'].includes(x));
  if (name === 'gradle' || name === 'gradlew') return w.slice(1).some((x) => ['test', 'build', 'check', 'assemble', 'lint'].includes(x));
  if (['dotnet', 'swift', 'zig'].includes(name)) return ['test', 'build'].includes(a);
  if (name === 'deno') return ['test', 'lint', 'check'].includes(a) || (a === 'fmt' && w.includes('--check'));
  if (name === 'mix') return ['test', 'compile', 'credo'].includes(a);
  if (name === 'cmake') return a === '--build';
  if (name === 'bundle' && a === 'exec') return isCheck(w.slice(2));
  if (name === 'rake') return ['test', 'spec'].includes(a);
  if (name === 'composer') return ['test', 'lint', 'validate'].includes(a);
  if (name === 'terraform') return a === 'validate';
  if (name === 'prettier') return w.includes('--check') || w.includes('-c');
  if (name === 'black' || name === 'isort') return w.includes('--check') || w.includes('-c');
  if (name === 'ruff') return a === 'check' || (a === 'format' && w.includes('--check'));
  return CHECKERS.has(name);
}

/** Why a command can go ahead without asking (reads in the folder, the project's checks): null when no rule says so. */
function routine(p: Parsed, at: Places): string | null {
  if (p.subst || p.complex || !p.cmds.length) return null;
  let checks = false;
  for (const c of p.cmds) {
    if (c.redirs.some((r) => (writesTo(r) && !at.inside(r.target)) || (r.op === '<' && !at.inside(r.target)))) return null;
    const w = head(c.words);
    if (!w.length) continue;
    const name = nameOf(w[0]);
    const args = w.slice(1);
    if (isCheck(w)) {
      checks = true;
      continue;
    }
    if (name === 'cd' || name === 'mkdir' || name === 'touch') {
      if (pathArgs(args).every((a) => at.inside(a)) && (name !== 'cd' || args.length)) continue;
      return null;
    }
    if (name === 'git') {
      const g = gitSub(args);
      const listing = (g.sub === 'branch' || g.sub === 'tag' || g.sub === 'remote' || g.sub === 'stash') && g.rest.every((a) => /^(-a|-r|-v|-vv|--list|-l|--all|list|show)$/.test(a));
      if (GIT_READS.has(g.sub) || listing) continue;
      return null;
    }
    if (name === 'find' && args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/.test(a))) return null;
    // Words that look like paths must be in the folder; others (patterns, text) are fine.
    if (READS.has(name) && pathArgs(args).every((a) => !/^[/~$]|^\.\.?(\/|$)|\//.test(a) || at.inside(a))) continue;
    return null;
  }
  return checks ? "runs the project's checks" : 'reads in the folder';
}

/** An MCP tool's name in words: mcp__gmail__sendEmail → ["send", "email"]. */
const words = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const SEND = new Set('send post publish reply respond forward tweet retweet share invite comment notify broadcast announce submit dm message email mail text sms call'.split(' '));
const POSTED = new Set('issue issues pull pr comment post message tweet event review status release discussion reply email'.split(' '));
const PAY = new Set('pay purchase checkout charge refund payout buy donate tip withdraw deposit trade'.split(' '));
const PAID = new Set('payment order charge invoice transfer payout subscription refund'.split(' '));

/** Why an MCP call needs the user's say: it sends or posts something, or spends money. */
function mcpRisk(full: string): string | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(full);
  const server = m?.[1] ?? 'a connected app';
  const w = words(m?.[2] ?? full);
  const verb = w[0] ?? '';
  if (w.some((x) => PAY.has(x)) || (['create', 'place', 'submit', 'send', 'make'].includes(verb) && w.some((x) => PAID.has(x)))) return `may spend money (${server})`;
  if (SEND.has(verb) || w.some((x) => ['send', 'post', 'publish', 'reply', 'forward', 'tweet', 'invite', 'broadcast'].includes(x)) || (verb === 'create' && w.slice(1).some((x) => POSTED.has(x))))
    return `sends or posts something through ${server}`;
  return null;
}

/** What the fixed rules say about a step, or null to leave it to the reviewer. */
export function rules(step: Step, cwd: string): Verdict | null {
  const at = new Places(cwd);
  const input = (step.rawInput ?? {}) as Record<string, unknown>;
  if (step.key === 'edit' || step.kind === 'edit') {
    const file = typeof input.path === 'string' ? input.path : '';
    if (!file) return null;
    // The repository's own files (.git/hooks…) are left to the reviewer.
    if (at.inside(file)) return /(^|\/)\.git(\/|$)/.test(path.relative(at.root, real(path.resolve(cwd, file)))) ? null : allow('an edit in the folder');
    if (fs.existsSync(path.resolve(cwd, file))) return ask('overwrites a file outside the folder');
    return at.scratch(file) ? allow('a scratch file in the temporary folder') : null;
  }
  if (step.kind === 'execute' || step.key.startsWith('cmd:')) {
    const command = typeof input.command === 'string' ? input.command : '';
    if (!command.trim()) return null;
    const p = parseCommand(command);
    const why = risky(p, command, at);
    if (why) return ask(why);
    const ok = routine(p, at);
    return ok ? allow(ok) : null;
  }
  if (step.key.startsWith('mcp:')) {
    const why = mcpRisk(step.key.slice(4));
    return why ? ask(why) : null;
  }
  return null;
}

// ---- the reviewer --------------------------------------------------------------------------------

/** The change an edit makes, shortened, for the reviewer. */
function change(step: Step): string | undefined {
  const d = (step.content ?? []).find((c: any) => c?.type === 'diff') as { newText?: string } | undefined;
  return typeof d?.newText === 'string' ? d.newText.slice(0, 4000) : undefined;
}

async function reviewer(step: Step): Promise<Verdict> {
  if (!RUNTIME) return ask('there is no reviewer to check it');
  try {
    const r = await fetch(`${RUNTIME}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: step.kind, key: step.key, title: step.title, input: step.rawInput, change: change(step) }),
      signal: AbortSignal.timeout(45_000),
    });
    const d: any = await r.json().catch(() => ({}));
    if (r.ok && ['allow', 'ask', 'deny'].includes(d.decision)) return { decision: d.decision, reason: String(d.reason ?? '').slice(0, 200) || 'checked' };
  } catch {}
  return ask('the check did not answer in time');
}

/** Decisions kept for the turn, per session. */
const kept = new Map<string, { turn: string; map: Map<string, Verdict> }>();

export async function autoReview(s: { id: string; cwd: string; turnId?: string }, step: Step): Promise<Verdict> {
  const turn = s.turnId ?? '';
  let k = kept.get(s.id);
  if (!k || k.turn !== turn) kept.set(s.id, (k = { turn, map: new Map() }));
  const sig = JSON.stringify([step.kind, step.key, step.rawInput, change(step)]);
  const hit = k.map.get(sig);
  if (hit) return hit;
  const v = rules(step, s.cwd) ?? (await reviewer(step));
  k.map.set(sig, v);
  return v;
}

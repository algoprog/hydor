// Reading a shell command before it runs, to decide whether it needs the user's say. A command is split
// into the simple commands it runs: at &&, ||, ;, |, & and newlines, and inside $(…), backticks, <(…),
// subshells and groups. Each keeps its words (unquoted), the files it redirects into or out of, and its
// place in a pipeline. checkCommand() then says which parts only look around, what each "Always allow"
// would save, the files it touches, and whether it is risky enough to ask every time. What cannot be
// read with confidence (a function definition, case, eval of a variable, an unclosed quote) is opaque.
import fs from 'node:fs';
import { WIN, windowsPathOf } from '../platform.ts';
import os from 'node:os';
import path from 'node:path';

export interface Cmd {
  /** Words, unquoted; a word built from a variable or a substitution is not known. */
  words: string[];
  known: boolean[];
  /** Which words have unquoted wildcards (the shell turns them into the files they match). */
  globs: boolean[];
  /** Variable assignments before it (FOO=1 cmd). */
  env: string[];
  /** Files it redirects into (> >> &>) and out of (<); '' when the name is not known. */
  writes: string[];
  reads: string[];
  /** A here-document feeding it: its text, and whether that text is known (quoted, or nothing expands). */
  stdin?: { text: string; known: boolean };
  /** Its pipeline, and its place there (0 = first). */
  pipe: number;
  pos: number;
  /** Inside $(…), backticks or <(…) of another command. */
  nested: boolean;
}

export interface Parsed {
  cmds: Cmd[];
  /** Why it could not be read with confidence. */
  opaque?: string;
}

const HOME = os.homedir();
const UNKNOWN = '\u0000';
const BREAK = new Set([' ', '\t', '\n', ';', '&', '|', '(', ')', '<', '>']);
const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"' };

/** Where a $'…' string closes (its quote), from just inside it; -1 when it does not. */
function ansiEnd(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === "'") return j;
  }
  return -1;
}

/** The text of a $'…' string, its escapes decoded as bash does (\x72 is r, \162 is r too). */
export function ansiC(t: string): string {
  let out = '';
  for (let j = 0; j < t.length; j++) {
    if (t[j] !== '\\' || j + 1 >= t.length) {
      out += t[j];
      continue;
    }
    const n = t[++j];
    let m: RegExpExecArray | null;
    if (n === 'x' && (m = /^[0-9a-fA-F]{1,2}/.exec(t.slice(j + 1)))) {
      out += String.fromCharCode(parseInt(m[0], 16));
      j += m[0].length;
    } else if ((n === 'u' || n === 'U') && (m = (n === 'u' ? /^[0-9a-fA-F]{1,4}/ : /^[0-9a-fA-F]{1,8}/).exec(t.slice(j + 1)))) {
      const c = parseInt(m[0], 16);
      out += c <= 0x10ffff ? String.fromCodePoint(c) : '';
      j += m[0].length;
    } else if (/[0-7]/.test(n)) {
      const o = /^[0-7]{1,3}/.exec(t.slice(j))![0];
      out += String.fromCharCode(parseInt(o, 8) & 0xff);
      j += o.length - 1;
    } else if (n === 'c' && j + 1 < t.length) out += String.fromCharCode(t[++j].charCodeAt(0) & 0x1f);
    else out += ESC[n] ?? `\\${n}`;
  }
  return out;
}

class Parser {
  i = 0;
  cmds: Cmd[] = [];
  opaque?: string;
  cur = { pipe: 0, pos: 0 };
  private heredocs: { delim: string; strip: boolean; quoted: boolean; cmd: Cmd }[] = [];

  constructor(
    private s: string,
    private depth = 0,
    private ids = { n: 0 },
  ) {}

  private fail(why: string) {
    this.opaque ??= why;
    this.i = this.s.length;
  }

  private blanks() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === ' ' || c === '\t' || c === '\r') this.i++;
      else if (c === '\\' && this.s[this.i + 1] === '\n') this.i += 2;
      else return;
    }
  }

  private comment() {
    while (this.i < this.s.length && this.s[this.i] !== '\n') this.i++;
  }

  private next() {
    this.cur = { pipe: ++this.ids.n, pos: 0 };
  }

  /** Commands until the end, or until `stop` (the ")" that closes $(…) or a subshell). */
  list(stop?: string, nested = false) {
    const s = this.s;
    while (this.i < s.length && !this.opaque) {
      this.blanks();
      const c = s[this.i];
      if (c === undefined) return;
      if (stop && c === stop) return;
      if (c === '#') this.comment();
      else if (c === '\n') {
        this.i++;
        this.bodies();
        this.next();
      } else if (s.startsWith(';;', this.i)) return this.fail('case');
      else if (s.startsWith('&&', this.i) || s.startsWith('||', this.i)) {
        this.i += 2;
        this.next();
      } else if (c === ';' || (c === '&' && s[this.i + 1] !== '>')) {
        this.i++;
        this.next();
      } else if (s.startsWith('|&', this.i)) {
        this.i += 2;
        this.cur.pos++;
      } else if (c === '|') {
        this.i++;
        this.cur.pos++;
      } else if (c === ')') return this.fail('unbalanced )');
      else if (c === '(') {
        if (s[this.i + 1] === '(') this.arith(this.i + 2);
        else {
          this.i++;
          this.blanks();
          if (s[this.i] === ')') return this.fail('function');
          this.list(')', nested);
          if (s[this.i] !== ')') return this.fail('unclosed (');
          this.i++;
          // Redirections after a subshell apply to all of it.
          this.command(nested, stop, true);
        }
      } else this.command(nested, stop);
    }
  }

  /** (( … )) and $(( … )): arithmetic, which runs nothing unless it hides a substitution. */
  private arith(from: number) {
    const end = this.s.indexOf('))', from);
    if (end < 0) return this.fail('unclosed ((');
    if (/\$\(|`/.test(this.s.slice(from, end))) return this.fail('substitution inside arithmetic');
    this.i = end + 2;
  }

  /** A simple command: words, assignments, redirections (or, after a subshell, only redirections). */
  private command(nested: boolean, stop?: string, after = false) {
    const s = this.s;
    const cmd: Cmd = { words: [], known: [], globs: [], env: [], writes: [], reads: [], pipe: this.cur.pipe, pos: this.cur.pos, nested };
    let test = false;
    for (;;) {
      this.blanks();
      if (this.i >= s.length || this.opaque) break;
      const c = s[this.i];
      if (stop && c === stop && !test) break;
      if (c === '#') {
        this.comment();
        break;
      }
      if (test) {
        // Inside [[ … ]], && || < > and parentheses belong to the test.
        if (s.startsWith(']]', this.i) && (this.i + 2 >= s.length || BREAK.has(s[this.i + 2]))) {
          cmd.words.push(']]');
          cmd.known.push(true);
          cmd.globs.push(false);
          this.i += 2;
          test = false;
          continue;
        }
        if ('&|<>()'.includes(c)) {
          let j = this.i;
          while (j < s.length && '&|<>()'.includes(s[j])) j++;
          cmd.words.push(s.slice(this.i, j));
          cmd.known.push(true);
          cmd.globs.push(false);
          this.i = j;
          continue;
        }
      }
      if ((c === '<' || c === '>') && s[this.i + 1] === '(') {
        // Process substitution: a command whose output (or input) shows as a file.
        this.i += 2;
        this.inside(')');
        if (s[this.i] !== ')') return this.fail('unclosed (');
        this.i++;
        if (!after) {
          cmd.words.push('/dev/fd/63');
          cmd.known.push(true);
          cmd.globs.push(false);
        }
        continue;
      }
      const r = /^(\d*)(&>>|&>|>>|>\||>&|>|<<<|<<-|<<|<>|<&|<)/.exec(s.slice(this.i, this.i + 8));
      if (r && (r[1] || '<>&'.includes(c))) {
        const op = r[2];
        this.i += r[0].length;
        this.blanks();
        const w = this.word();
        if (!w) return this.fail('a redirection without a target');
        if (op === '<<' || op === '<<-') this.heredocs.push({ delim: w.value, strip: op === '<<-', quoted: /['"\\]/.test(w.raw), cmd });
        else if (op === '<<<') continue;
        else if ((op === '>&' || op === '<&') && /^(\d+-?|-)$/.test(w.value)) continue;
        else if (op === '<&') continue;
        else if (op === '<') cmd.reads.push(w.known ? w.value : '');
        else cmd.writes.push(w.known ? w.value : '');
        continue;
      }
      if (c === '&' || c === '|' || c === ';' || c === '\n' || c === ')') break;
      if (c === '(') {
        // name=( … ): an array; name() { … }: a function, which is not read here.
        const prev = cmd.env[cmd.env.length - 1];
        if (!cmd.words.length && prev?.endsWith('=')) {
          const end = s.indexOf(')', this.i);
          if (end < 0 || /\$\(|`/.test(s.slice(this.i, end))) return this.fail('array');
          this.i = end + 1;
          continue;
        }
        return this.fail(cmd.words.length === 1 ? 'function' : 'unexpected (');
      }
      if (after) return this.fail('words after a subshell');
      const w = this.word();
      if (!w) {
        this.i++;
        continue;
      }
      // Only keywords so far (if, while, !…): this word is where a command, a test or an assignment starts.
      const first = cmd.words.every((x) => KEYWORDS.has(x));
      if (first && /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(w.raw)) {
        cmd.env.push(w.raw);
        continue;
      }
      if (first && w.raw === '[[') test = true;
      cmd.words.push(w.known ? w.value : w.value || UNKNOWN);
      cmd.known.push(w.known);
      cmd.globs.push(w.glob);
    }
    if (cmd.words.length || cmd.writes.length || cmd.reads.length || cmd.env.length || cmd.stdin) this.cmds.push(cmd);
  }

  /**
   * A word, unquoted, with $HOME and ~ filled in; null at an operator. A brace expansion ({a,b}, {1..3})
   * makes it unknown (it becomes several words); `glob` says it has unquoted *, ? or [.
   */
  private word(): { value: string; known: boolean; raw: string; glob: boolean } | null {
    const s = this.s;
    const start = this.i;
    let value = '';
    let known = true;
    let glob = false;
    let braces = 0;
    let listed = false;
    while (this.i < s.length && !this.opaque) {
      const c = s[this.i];
      if (BREAK.has(c)) break;
      if (c === '*' || c === '?' || c === '[') glob = true;
      if (c === '{') braces++;
      else if (braces && (c === ',' || (c === '.' && s[this.i + 1] === '.'))) listed = true;
      else if (c === '}' && braces) {
        braces--;
        if (listed) known = false;
      }
      if (c === '\\') {
        if (s[this.i + 1] === '\n') this.i += 2;
        else {
          value += s[this.i + 1] ?? '';
          this.i += 2;
        }
      } else if (c === "'") {
        const end = s.indexOf("'", this.i + 1);
        if (end < 0) {
          this.fail('unclosed quote');
          break;
        }
        value += s.slice(this.i + 1, end);
        this.i = end + 1;
      } else if (c === '"') {
        const r = this.dquote();
        value += r.value;
        known &&= r.known;
      } else if (c === '`') {
        this.backtick();
        value += UNKNOWN;
        known = false;
      } else if (c === '$') {
        const r = this.dollar(false);
        value += r.value;
        known &&= r.known;
      } else if (c === '~' && this.i === start) {
        const m = /^~([A-Za-z0-9_.-]*)/.exec(s.slice(this.i, this.i + 64))!;
        if (m[1]) known = false;
        value += m[1] ? m[0] : HOME;
        this.i += m[0].length;
      } else {
        value += c;
        this.i++;
      }
    }
    return this.i === start ? null : { value, known, raw: s.slice(start, this.i), glob };
  }

  private dquote(): { value: string; known: boolean } {
    const s = this.s;
    this.i++;
    let value = '';
    let known = true;
    while (this.i < s.length && s[this.i] !== '"' && !this.opaque) {
      const c = s[this.i];
      if (c === '\\') {
        const n = s[this.i + 1];
        if (n === '\n') this.i += 2;
        else if (n !== undefined && '"\\$`'.includes(n)) {
          value += n;
          this.i += 2;
        } else {
          value += c;
          this.i++;
        }
      } else if (c === '`') {
        this.backtick();
        known = false;
        value += UNKNOWN;
      } else if (c === '$') {
        const r = this.dollar(true);
        value += r.value;
        known &&= r.known;
      } else {
        value += c;
        this.i++;
      }
    }
    if (s[this.i] !== '"') {
      this.fail('unclosed quote');
      return { value, known: false };
    }
    this.i++;
    return { value, known };
  }

  private dollar(quoted: boolean): { value: string; known: boolean } {
    const s = this.s;
    const n = s[this.i + 1];
    if (!quoted && n === "'") {
      const end = ansiEnd(s, this.i + 2);
      if (end < 0) {
        this.fail('unclosed quote');
        return { value: '', known: false };
      }
      const v = ansiC(s.slice(this.i + 2, end));
      this.i = end + 1;
      return { value: v, known: true };
    }
    if (!quoted && n === '"') {
      this.i++;
      return this.dquote();
    }
    if (s.startsWith('$((', this.i)) {
      this.arith(this.i + 3);
      return { value: UNKNOWN, known: false };
    }
    if (n === '(') {
      this.i += 2;
      this.inside(')');
      if (s[this.i] !== ')') this.fail('unclosed $(');
      else this.i++;
      return { value: UNKNOWN, known: false };
    }
    if (n === '{') {
      let depth = 0;
      let j = this.i + 1;
      for (; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}' && --depth === 0) break;
      }
      if (j >= s.length) {
        this.fail('unclosed ${');
        return { value: '', known: false };
      }
      const inner = s.slice(this.i + 2, j);
      this.i = j + 1;
      if (inner === 'HOME') return { value: HOME, known: true };
      if (/\$\(|`/.test(inner)) this.fail('substitution inside ${…}');
      return { value: UNKNOWN, known: false };
    }
    const m = /^\$([A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])/.exec(s.slice(this.i, this.i + 256));
    if (!m) {
      this.i++;
      return { value: '$', known: true };
    }
    this.i += m[0].length;
    return m[1] === 'HOME' ? { value: HOME, known: true } : { value: UNKNOWN, known: false };
  }

  /** Commands inside $(…) or <(…): read in place, as a pipeline of their own. */
  private inside(stop: string) {
    const saved = this.cur;
    this.next();
    this.list(stop, true);
    this.cur = saved;
  }

  private backtick() {
    const s = this.s;
    let j = this.i + 1;
    let inner = '';
    while (j < s.length && s[j] !== '`') {
      if (s[j] === '\\' && j + 1 < s.length && '`\\$'.includes(s[j + 1])) {
        inner += s[j + 1];
        j += 2;
      } else inner += s[j++];
    }
    if (j >= s.length) return this.fail('unclosed backtick');
    this.i = j + 1;
    if (this.depth > 6) return this.fail('too deep');
    const p = new Parser(inner, this.depth + 1, this.ids);
    p.cur = { pipe: ++this.ids.n, pos: 0 };
    p.list(undefined, true);
    for (const c of p.cmds) this.cmds.push({ ...c, nested: true });
    if (p.opaque) this.fail(p.opaque);
  }

  /** Here-document bodies, which start after the line that names them. */
  private bodies() {
    const s = this.s;
    for (const h of this.heredocs) {
      let text = '';
      while (this.i < s.length) {
        let end = s.indexOf('\n', this.i);
        if (end < 0) end = s.length;
        const line = s.slice(this.i, end);
        this.i = Math.min(end + 1, s.length);
        if ((h.strip ? line.replace(/^\t+/, '') : line) === h.delim) break;
        text += line + '\n';
      }
      // Unquoted, the body expands: a substitution in it runs.
      if (!h.quoted && /\$\(|`/.test(text)) this.fail('substitution in a here-document');
      h.cmd.stdin = { text, known: h.quoted || !/[$\\]/.test(text) };
    }
    this.heredocs = [];
  }

  finish() {
    if (this.heredocs.length) this.bodies();
  }
}

/** The simple commands in a shell command, in the order they appear. */
export function parseShell(src: string): Parsed {
  if (src.length > 64_000) return { cmds: [], opaque: 'too long' };
  const p = new Parser(src);
  p.list();
  p.finish();
  return { cmds: p.cmds, opaque: p.opaque };
}

// ---- what a command does ---------------------------------------------------------------------------

export interface Part {
  /** The words that name it, for allow rules: the command and its arguments without options. */
  words: string[];
  /** Its words as written (unquoted), so rules saved by earlier versions still match. */
  raw: string[];
  /** What "Always allow" saves for it: "git status", "npm run build". */
  key: string;
  /** Only looks around (ls, cat, git status…): runs without asking. */
  safe: boolean;
  /** Runs code given inline (python -c, a script on stdin) or under risky settings: no rule covers it. */
  inline: boolean;
}

export interface ShellCheck {
  parts: Part[];
  /** Files it reads or writes (absolute; '' for a write whose target is not known). */
  paths: { path: string; write?: boolean }[];
  /** Why it asks every time, whatever the mode and the rules. */
  risk?: string;
  /** Why it could not be read with confidence. */
  opaque?: string;
}

/** How many leading words name a command, for "Always allow": `git status`, `npm run build`, `docker compose up`. */
const ARITY: Record<string, number> = {
  git: 2, 'git stash': 3, 'git remote': 3, 'git config': 3, 'git worktree': 3, 'git submodule': 3,
  npm: 2, 'npm run': 3, 'npm run-script': 3, 'npm exec': 3, 'npm x': 3, pnpm: 2, 'pnpm run': 3, 'pnpm exec': 3, 'pnpm dlx': 3,
  yarn: 2, 'yarn run': 3, 'yarn dlx': 3, 'yarn workspace': 4, bun: 2, 'bun run': 3, 'bun x': 3, bunx: 2, npx: 2,
  deno: 2, 'deno task': 3, 'deno run': 3, node: 2, tsx: 2, 'ts-node': 2,
  python: 2, python3: 2, 'python -m': 3, 'python3 -m': 3, pip: 2, pip3: 2, uv: 2, 'uv run': 3, 'uv pip': 3, 'uv tool': 3, uvx: 2,
  poetry: 2, 'poetry run': 3, pipenv: 2, 'pipenv run': 3, conda: 2, 'conda env': 3, mamba: 2,
  cargo: 2, rustup: 2, go: 2, 'go mod': 3, 'go tool': 3, make: 2, cmake: 2, ninja: 2, mvn: 2, gradle: 2, './gradlew': 2, dotnet: 2,
  docker: 2, 'docker compose': 3, 'docker container': 3, 'docker image': 3, 'docker volume': 3, 'docker network': 3, 'docker buildx': 3, 'docker system': 3,
  podman: 2, kubectl: 2, helm: 2, terraform: 2, gh: 3, 'gh api': 3, aws: 3, gcloud: 3, az: 3,
  brew: 2, apt: 2, 'apt-get': 2, dnf: 2, yum: 2, pacman: 2, snap: 2, flatpak: 2, systemctl: 2, 'systemctl --user': 3,
  composer: 2, bundle: 2, 'bundle exec': 3, rails: 2, rake: 2, ruby: 2, perl: 2, php: 2, 'php artisan': 3, mix: 2, flutter: 2, dart: 2, swift: 2,
  bash: 2, sh: 2, zsh: 2, source: 2, '.': 2, vitest: 2, ruff: 2, nx: 2, turbo: 2, tmux: 2, ssh: 2, rclone: 2,
};

const SAFE = new Set([
  'ls', 'll', 'pwd', 'cat', 'head', 'tail', 'wc', 'echo', 'printf', 'true', 'false', 'test', '[', '[[', 'which', 'type', 'whereis', 'file', 'stat',
  'du', 'df', 'whoami', 'id', 'uname', 'nproc', 'free', 'uptime', 'ps', 'pgrep', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'tree', 'cut', 'tr', 'nl',
  'column', 'diff', 'cmp', 'comm', 'basename', 'dirname', 'realpath', 'readlink', 'jq', 'od', 'hexdump', 'strings', 'md5sum', 'sha1sum',
  'sha256sum', 'sha512sum', 'cksum', 'base64', 'cd', 'pushd', 'popd', 'sleep', 'less', 'more', 'seq', 'expr', 'tac', 'rev', 'paste', 'join',
  'sort', 'uniq', 'find', 'locale', 'read', 'date', 'hostname', 'xxd', 'command', 'lsof', 'fold', 'exit', 'return', ':', 'wait',
]);
/** Toolchains whose --version is harmless. */
const VERSIONED = new Set(['node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'python', 'python3', 'pip', 'pip3', 'uv', 'go', 'cargo', 'rustc', 'java', 'javac', 'gcc', 'g++', 'clang', 'make', 'cmake', 'docker', 'git', 'ruby', 'php', 'perl', 'tsc', 'dotnet', 'gh', 'kubectl', 'terraform', 'ffmpeg']);
const GIT_READS = new Set(['status', 'log', 'diff', 'show', 'blame', 'rev-parse', 'ls-files', 'ls-tree', 'describe', 'shortlog', 'grep', 'cat-file', 'merge-base', 'rev-list', 'whatchanged', 'count-objects', 'for-each-ref', 'name-rev', 'show-ref', 'check-ignore', 'show-branch', 'cherry', 'version', 'help']);
const PRIVILEGED = new Set(['sudo', 'doas', 'su', 'pkexec', 'run0']);
const DISK = /^(dd|mkfs(\.\w+)?|mke2fs|mkswap|wipefs|fdisk|sfdisk|gdisk|cfdisk|parted|blkdiscard)$/;
const POWER = /^(shutdown|reboot|poweroff|halt)$/;
const DOWNLOADERS = new Set(['curl', 'wget', 'fetch', 'http', 'https', 'aria2c']);
const SHELLS = /^((ba|z|da|k|c|tc|fi)?sh)$/;
const INTERPRETERS = /^((ba|z|da|k|c|tc|fi)?sh|python[\d.]*|node|nodejs|perl|ruby|php|pwsh|lua|bun|deno|osascript)$/;
/** Settings that make an otherwise harmless command run something else. */
const RISKY_ENV = /^(LD_\w+|DYLD_\w+|\w*PAGER|EDITOR|VISUAL|GIT_\w+|SSH_ASKPASS|NODE_OPTIONS|PYTHONSTARTUP|PYTHONPATH|PERL5OPT|PERL5LIB|RUBYOPT|BASH_ENV|ENV|PROMPT_COMMAND|IFS|PATH|LESSOPEN|LESSCLOSE)\+?=/;

const base = (w: string) => w.slice(w.lastIndexOf('/') + 1).replace(/^(python\d)(\.\d+)?$/, '$1');
const isFlag = (w: string) => w.startsWith('-') && w !== '-' && w !== '--';

/** The words that name a command: options left out (git's -C <dir> with its value). */
function headWords(words: string[]): string[] {
  const out = [words[0]];
  const name = base(words[0]);
  for (let k = 1; k < words.length; k++) {
    const w = words[k];
    if (name === 'git' && /^(-C|-c|--git-dir|--work-tree|--namespace)$/.test(w)) {
      k++;
      continue;
    }
    if (/^python\d?$/.test(name) && w === '-m') out.push(w);
    else if (name === 'systemctl' && w === '--user') out.push(w);
    else if (!isFlag(w)) out.push(w);
  }
  return out;
}

export function keyOf(words: string[]): string {
  const head = headWords(words);
  const norm = [base(head[0]) === head[0] ? head[0] : head[0], ...head.slice(1)];
  const lookup = [base(head[0]), ...head.slice(1)];
  for (let n = Math.min(4, lookup.length); n > 0; n--) {
    const arity = ARITY[lookup.slice(0, n).join(' ')] ?? (n === 1 ? 1 : undefined);
    if (arity !== undefined) return norm.slice(0, arity).join(' ');
  }
  return norm[0];
}

/** git that only looks: status, log, diff, show, a branch or tag list… */
function gitLooks(args: string[]): boolean {
  const rest = [...args];
  while (rest.length && isFlag(rest[0])) {
    const f = rest.shift()!;
    if (f === '-c' || f === '--exec-path' || f.startsWith('--config-env')) return false;
    if (f === '-C' || f === '--git-dir' || f === '--work-tree') rest.shift();
  }
  const sub = rest.shift();
  if (!sub) return true;
  if (rest.some((a) => /^--(output|ext-diff|exec)/.test(a))) return false;
  if (GIT_READS.has(sub)) return true;
  const pos = rest.filter((a) => !isFlag(a));
  const has = (re: RegExp) => rest.some((a) => re.test(a));
  switch (sub) {
    case 'branch':
      return !has(/^(-[dDmMcCfu]|--(delete|move|copy|force|set-upstream-to|unset-upstream|edit-description|track|no-track))/) && (!pos.length || has(/^(-l|--list|--contains|--no-contains|--merged|--no-merged|--points-at)/));
    case 'tag':
      return !has(/^(-[dasfmu]|--(delete|annotate|sign|force|message))/) && (!pos.length || has(/^(-l|--list|--contains|--points-at)/));
    case 'remote':
      return !pos.length || pos[0] === 'show' || pos[0] === 'get-url';
    case 'stash':
      return pos[0] === 'list' || pos[0] === 'show';
    case 'config':
      return has(/^(--get|--get-all|--get-regexp|--list|-l)$/) && !has(/^--(unset|add|replace-all|rename-section|remove-section|edit)/);
    case 'reflog':
      return !pos.length || pos[0] === 'show';
    case 'worktree':
      return pos[0] === 'list';
  }
  return false;
}

function looks(words: string[]): boolean {
  if (words[0].includes('/')) return false;
  const name = words[0];
  const args = words.slice(1);
  const has = (re: RegExp) => args.some((a) => re.test(a));
  if (VERSIONED.has(name) && args.length === 1 && /^(--version|-v|-V|version)$/.test(args[0])) return true;
  switch (name) {
    case 'git':
      return gitLooks(args);
    case 'find':
      return !has(/^-(exec|execdir|ok|okdir|delete|fprint0?|fprintf|fls)$/);
    case 'sort':
      return !has(/^(-o|--output)/);
    case 'uniq':
      return args.filter((a) => !isFlag(a)).length <= 1;
    case 'rg':
      return !has(/^--pre/);
    case 'tree':
      return !has(/^-o$/);
    case 'date':
      return !has(/^(-s|--set)/);
    case 'hostname':
      return args.every(isFlag) && !has(/^-[bF]|^--(boot|file)/);
    case 'xxd':
      return !has(/^-r/);
    case 'command':
      return args[0] === '-v' || args[0] === '-V';
  }
  return SAFE.has(name);
}

/** Wrappers that run the command after their own options: the command they run (and env's settings). */
function unwrap(words: string[], known: boolean[]): { words: string[]; known: boolean[]; wrapper?: string; assigns?: string[]; skip?: number } {
  const name = base(words[0]);
  let k = 1;
  const assigns: string[] = [];
  const take = (opts: RegExp, withValue: RegExp = /^$/) => {
    while (k < words.length && isFlag(words[k])) {
      if (withValue.test(words[k])) k++;
      else if (!opts.test(words[k])) break;
      k++;
    }
  };
  switch (name) {
    case 'sudo':
    case 'doas':
      take(/^-/, /^-[ugCDhpRrTt]$|^--(user|group|chdir|host|prompt|role|type|close-from)$/);
      break;
    case 'timeout':
      take(/^-/, /^-[sk]$|^--(signal|kill-after)$/);
      k++; // the duration
      break;
    case 'nice':
      take(/^-/, /^-n$|^--adjustment$/);
      break;
    case 'ionice':
      take(/^-/, /^-[cnp]$/);
      break;
    case 'stdbuf':
      take(/^-/, /^-[ioe]$/);
      break;
    case 'env':
      while (k < words.length && (isFlag(words[k]) || /^[A-Za-z_]\w*=/.test(words[k]))) {
        if (/^-S|^--split-string/.test(words[k])) return { words: [UNKNOWN], known: [false] };
        if (/^-[uC]$|^--(unset|chdir)$/.test(words[k])) k++;
        else if (!isFlag(words[k])) assigns.push(words[k]);
        k++;
      }
      break;
    case 'xargs':
      take(/^-/, /^-[IinPdLsaE]$|^--(max-args|max-procs|delimiter|max-lines|max-chars|arg-file|eof|replace)$/);
      break;
    case 'watch':
      take(/^-/, /^-[nd]$|^--(interval|differences)$/);
      break;
    case 'flock':
      take(/^-/, /^-[wEc]$/);
      k++; // the lock file
      break;
    case 'nohup':
    case 'time':
    case 'builtin':
    case 'exec':
      take(/^-/);
      break;
    case 'command':
      if (/^-[vV]$/.test(words[1] ?? '')) return { words, known };
      take(/^-/);
      break;
    default:
      return { words, known };
  }
  if (k >= words.length) return { words, known };
  return { words: words.slice(k), known: known.slice(k), wrapper: name, assigns, skip: k };
}

/** The options that make each interpreter run code given right there. */
const NODE_EVAL = /^-[a-zA-Z]*[ep]|^--(eval|print)(=|$)/;
const INLINE: Record<string, RegExp> = {
  python: /^-[a-zA-Z]*c/, node: NODE_EVAL, nodejs: NODE_EVAL, bun: NODE_EVAL, perl: /^-[a-zA-Z]*[eE]/, ruby: /^-[a-zA-Z]*e/, php: /^-[a-zA-Z]*r/, lua: /^-[a-zA-Z]*e/,
  osascript: /^-e/, pwsh: /^-(c|Command|EncodedCommand)/i,
};
/** Wrappers that change nothing about what runs, so a harmless command stays harmless under them. */
const PLAIN_WRAPPERS = new Set(['timeout', 'nice', 'nohup', 'stdbuf', 'time', 'command', 'builtin', 'ionice']);

const KEYWORDS = new Set(['if', 'then', 'elif', 'else', 'do', 'while', 'until', '!', '{', 'time']);
const CLOSERS = new Set(['fi', 'done', '}', 'esac']);

/** Inside `dir` (or it), as paths go. */
export function within(p: string, dir: string): boolean {
  if (!dir) return false;
  const r = path.relative(dir, p);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

/** A file whose change takes effect elsewhere: startup and settings files in the home folder, SSH keys. */
export function riskyWrite(p: string, cwd: string): string | undefined {
  if (!p) return;
  if (/^\/dev\/(sd|nvme|hd|vd|xvd|mmcblk|disk|loop|md|dm-|mapper)/.test(p)) return 'writes raw data to a disk';
  if (!within(p, HOME) || p === HOME) return;
  const rel = path.relative(HOME, p);
  const top = rel.split(path.sep)[0];
  if (top === '.ssh') return 'changes SSH keys or settings';
  // A dot folder the session itself works in (~/.config/nvim) is fair game.
  if (top.startsWith('.') && !(within(cwd, path.join(HOME, top)) && within(p, cwd))) return 'changes a settings or startup file in your home folder';
}

/** Names of files that often hold keys or passwords (permissions.ts decides for sure). */
const SECRETISH = /^(\.env(\..+)?|id_(rsa|dsa|ecdsa|ed25519).*|.+\.(pem|key|p12|pfx|jks|keystore)|\.netrc|\.npmrc|\.pypirc|\.git-credentials|\.pgpass|credentials(\.json)?|\.htpasswd)$/;
const PATHLESS = new Set(['echo', 'printf', 'test', '[', '[[', 'expr', 'seq', 'sleep', 'basename', 'dirname', 'date', 'kill', 'pkill', 'pgrep', 'ps', 'which', 'type', 'command', 'read', 'exit', 'return', ':', 'wait', 'true', 'false']);
/** Commands whose first argument is a pattern or a script, not a file. */
const FIRST_IS_SCRIPT = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'sed', 'awk', 'gawk', 'jq', 'yq', 'perl']);
const WRITERS: Record<string, 'last' | 'all' | 'rest'> = {
  cp: 'last', mv: 'last', install: 'last', ln: 'last', rsync: 'last', scp: 'last',
  tee: 'all', touch: 'all', mkdir: 'all', rm: 'all', rmdir: 'all', unlink: 'all', truncate: 'all', shred: 'all',
  chmod: 'rest', chown: 'rest', chgrp: 'rest', chattr: 'rest',
};

/** Options that make a command run another command, or code of its own (awk's system(), sed's e). */
function runsOther(name: string, args: string[]): boolean {
  const has = (re: RegExp) => args.some((a) => re.test(a));
  const at = (re: RegExp) => args.findIndex((a) => re.test(a));
  switch (name) {
    case 'git': {
      const sub = args.findIndex((a, k) => !isFlag(a) && !/^(-C|--git-dir|--work-tree|--namespace)$/.test(args[k - 1] ?? ''));
      const before = sub < 0 ? args : args.slice(0, sub);
      if (before.some((a) => /^(-c|--config-env|--exec-path)(=|$)/.test(a))) return true;
      const rest = sub < 0 ? [] : args.slice(sub + 1);
      return (
        (args[sub] === 'rebase' && rest.some((a) => /^(-x|--exec)(=|$)/.test(a))) ||
        (args[sub] === 'bisect' && rest[0] === 'run') ||
        (args[sub] === 'submodule' && rest.includes('foreach')) ||
        (args[sub] === 'difftool' && rest.some((a) => /^(-x|--extcmd)(=|$)/.test(a))) ||
        args[sub] === 'filter-branch'
      );
    }
    case 'rg':
      return has(/^--pre(=|$)/);
    case 'tar':
      return has(/^(--to-command|--use-compress-program|--checkpoint-action|--info-script|--new-volume-script|--rsh-command)(=|$)|^-[A-Za-z]*[IF]/);
    case 'rsync':
      return has(/^(--rsh|--rsync-path)(=|$)|^-[A-Za-z]*e/);
    case 'ssh':
    case 'scp':
    case 'sftp':
      return has(/^-o?\s*(ProxyCommand|LocalCommand|PermitLocalCommand|KnownHostsCommand)/i) || args.some((a, k) => a === '-o' && /^(ProxyCommand|LocalCommand|PermitLocalCommand|KnownHostsCommand)/i.test(args[k + 1] ?? '')) || (name === 'scp' && has(/^-S/));
    case 'zip':
      return has(/^(-TT|--unzip-command)(=|$)/);
    case 'awk':
    case 'gawk':
    case 'mawk':
    case 'nawk': {
      const prog = at(/^-f$/) >= 0 ? null : args.find((a) => !isFlag(a));
      return prog == null || /system\s*\(|\|\s*getline|getline\s*<|\|\s*"|print[^;}]*>/.test(prog);
    }
    case 'sed':
    case 'gsed': {
      if (at(/^(-f|--file)/) >= 0) return true;
      const scripts = args.flatMap((a, k) => (/^(-e|--expression)$/.test(args[k - 1] ?? '') ? [a] : /^--expression=/.test(a) ? [a.slice(13)] : []));
      if (!scripts.length) {
        const first = args.find((a, k) => !isFlag(a) && !/^(-e|--expression|-f|--file|-l|--line-length)$/.test(args[k - 1] ?? ''));
        if (first) scripts.push(first);
      }
      return scripts.some(sedRuns);
    }
  }
  return false;
}

/** A sed script that runs commands (e, or s///e) or writes or reads files of its own (w, W, r, R, s///w). */
function sedRuns(script: string): boolean {
  for (const cmd of script.split(/[;\n]/)) {
    const c = cmd.replace(/^\s*(\d+|\$|\/(\\.|[^/])*\/)?(\s*,\s*(\d+|\$|\/(\\.|[^/])*\/))?\s*!?\s*[{}]?\s*/, '');
    if (/^[eEwWrR](\s|$)/.test(c)) return true;
    const sub = /^s(.)/.exec(c);
    if (sub) {
      const d = sub[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const flags = new RegExp(`^s${d}(?:\\\\.|[^${d}\\\\])*${d}(?:\\\\.|[^${d}\\\\])*${d}([a-zA-Z0-9]*)`).exec(c)?.[1] ?? '';
      if (/[ew]/.test(flags)) return true;
    }
  }
  return false;
}

/** The files a wildcard matches, as the shell would find them (a few levels, a few hundred at most). */
function expand(pattern: string, dir: string): string[] {
  const parts = pattern.split('/');
  let found = [pattern.startsWith('/') ? '/' : dir];
  for (const [k, seg] of parts.entries()) {
    if (!seg) continue;
    const next: string[] = [];
    for (const d of found) {
      if (!/[*?[]/.test(seg)) {
        next.push(path.join(d, seg));
        continue;
      }
      const re = new RegExp(`^${seg.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
      let names: string[] = [];
      try {
        names = fs.readdirSync(d);
      } catch {}
      // As in the shell, a wildcard does not match a leading dot unless the pattern starts with one.
      for (const n of names) if (re.test(n) && (!n.startsWith('.') || seg.startsWith('.'))) next.push(path.join(d, n));
    }
    found = next.slice(0, 300);
    if (k > 8) break;
  }
  return found.filter((f) => f !== dir);
}

/** Reads a command: its parts, the files it touches, and whether it is risky. */
export function checkCommand(src: string, cwd: string): ShellCheck {
  const out: ShellCheck = { parts: [], paths: [] };
  const parsed = parseShell(src);
  if (parsed.opaque) return { ...out, opaque: parsed.opaque, risk: riskyText(src) };
  const risk = (why: string) => void (out.risk ??= why);
  // Where the next command runs: a cd moves it ('' once it went somewhere unknown).
  let dir = cwd;
  const at = (word: string) => {
    // Git's bash on Windows: /c/Users/me is C:\Users\me there (and its /dev/null is its own).
    if (WIN && word.startsWith('/dev/')) return word;
    const w = WIN ? windowsPathOf(word) : word;
    return path.isAbsolute(w) ? path.normalize(w) : dir ? path.resolve(dir, w) : '';
  };
  const read = (w: string) => {
    const p = at(w);
    if (p && !/^\/dev\/(null|stdin|stdout|stderr|tty|fd\/)/.test(p)) out.paths.push({ path: p });
  };
  const write = (w: string) => {
    const p = w && !w.includes(UNKNOWN) ? at(w) : '';
    if (/^\/dev\/(null|stdout|stderr|tty|fd\/)/.test(p)) return;
    const r = riskyWrite(p, cwd);
    if (r) risk(r);
    out.paths.push({ path: p, write: true });
  };
  const deletion = (w: string, what: string) => {
    const p = w.includes(UNKNOWN) ? '' : at(w);
    if (!p) return risk(`deletes ${what} it cannot name in advance`);
    // Outside the session folder, or the folder itself; with the home folder (or a top folder) as the session folder, anything.
    if (!within(p, cwd) || p === cwd || cwd === HOME || path.dirname(cwd) === path.parse(cwd).root) risk(`deletes ${what} outside the session folder`);
  };
  /** A word naming a file to check: away from where it runs (absolute, ~, up with ".."), or one that may hold keys or passwords. */
  const isLink = (w: string) => {
    const p = at(w);
    return !!p && !!fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink();
  };
  const pathish = (w: string) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(w) && (w.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(w) || SECRETISH.test(path.basename(w)) || isLink(w));
  const nameOf = (c: Cmd) => base(c.words.length ? unwrap(c.words, c.known).words[0] : '');
  const queue: { cmd: Cmd; depth: number }[] = parsed.cmds.map((cmd) => ({ cmd, depth: 0 }));
  const nestedDownload = parsed.cmds.some((c) => c.nested && DOWNLOADERS.has(nameOf(c)));

  for (let q = 0; q < queue.length && !out.opaque; q++) {
    const { cmd, depth } = queue[q];
    for (const w of cmd.writes) write(w);
    for (const r of cmd.reads) if (r) read(r);
    let words = [...cmd.words];
    let known = [...cmd.known];
    let globs = [...(cmd.globs ?? cmd.words.map(() => false))];
    while (words.length && KEYWORDS.has(words[0])) {
      if (words[0] === 'time' && words[1] === '-p') {
        words.splice(1, 1);
        known.splice(1, 1);
        globs.splice(1, 1);
      }
      words.shift();
      known.shift();
      globs.shift();
    }
    if (!words.length || (CLOSERS.has(words[0]) && words.length === 1) || words[0] === 'for' || words[0] === 'select') continue;
    if (words[0] === 'case' || words[0] === 'function' || words[0] === 'coproc') {
      out.opaque = words[0];
      break;
    }
    // Wrappers (sudo, timeout, env, xargs…) run the command after them.
    let wrapper: string | undefined;
    let plain = true;
    let assigns = [...cmd.env];
    for (let n = 0; n < 4 && known[0]; n++) {
      const u = unwrap(words, known);
      if (!u.wrapper) break;
      if (PRIVILEGED.has(u.wrapper)) risk('runs as the administrator (sudo)');
      wrapper ??= u.wrapper;
      plain &&= PLAIN_WRAPPERS.has(u.wrapper);
      assigns = [...assigns, ...(u.assigns ?? [])];
      ({ words, known } = u);
      globs = globs.slice(u.skip ?? 0);
    }
    if (!known[0]) {
      out.opaque = 'a command named by a variable';
      break;
    }
    const name = base(words[0]);
    const args = words.slice(1);
    const has = (re: RegExp) => args.some((a) => re.test(a));
    const positional = args.filter((a) => !isFlag(a));
    // Settings that make a harmless command run something else (a pager, a preloaded library, git's
    // config through GIT_CONFIG_*), set before it or exported for the commands after it.
    const exports = /^(export|declare|typeset|local|readonly|set)$/.test(name) ? args.filter((a) => !isFlag(a)) : [];
    let inline = [...assigns, ...exports].some((e) => RISKY_ENV.test(e)) || (wrapper === 'xargs' && INTERPRETERS.test(name)) || runsOther(name, args);

    if (PRIVILEGED.has(name)) risk('runs as the administrator (sudo)');
    if (DISK.test(name)) risk(name === 'dd' ? 'writes raw data (dd)' : 'formats or repartitions a disk');
    if (POWER.test(name) || (name === 'systemctl' && /^(poweroff|reboot|halt|suspend|hibernate|kexec)$/.test(positional[0] ?? ''))) risk('shuts down or restarts the computer');
    if (name === 'crontab' && !has(/^-l$/)) risk('changes scheduled jobs (crontab)');
    if (/^(chmod|chown|chgrp)$/.test(name) && has(/^(-[a-zA-Z]*R[a-zA-Z]*|--recursive)$/)) risk('changes permissions or owners recursively');
    // A download run straight away: piped into an interpreter that reads its code from stdin, or handed to one as a file or as code.
    const scripts = positional.filter((a) => a !== '--');
    const stdinCode = SHELLS.test(name) ? has(/^-[a-z]*s[a-z]*$/) || !scripts.length : !scripts.length || scripts[0] === '-';
    if (INTERPRETERS.test(name) && stdinCode && cmd.pos > 0 && queue.some(({ cmd: c }) => c.pipe === cmd.pipe && c.pos < cmd.pos && DOWNLOADERS.has(nameOf(c)))) risk('pipes a download straight into a shell');
    if (nestedDownload && !cmd.nested && (name === 'eval' || name === 'source' || name === '.' || (INTERPRETERS.test(name) && (positional[0] === '/dev/fd/63' || known.slice(1).some((k) => !k)))))
      risk('runs a download straight away');

    // Shell code given inline is read in turn; other languages' cannot be, so no rule covers them.
    const code = (text: string) => {
      if (depth > 4) return void (out.opaque = 'too deep');
      const p = parseShell(text);
      if (p.opaque) return void (out.opaque = p.opaque);
      for (const c of p.cmds) queue.push({ cmd: { ...c, pipe: c.pipe + 10_000 * (q + 1), nested: c.nested || cmd.nested }, depth: depth + 1 });
    };
    if (name === 'eval' || name === 'trap') {
      if (known.slice(1).every(Boolean)) code(name === 'trap' ? (args[0] ?? '') : args.join(' '));
      else out.opaque = `${name} of a variable`;
      continue;
    }
    if (SHELLS.test(name)) {
      const c = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
      if (c >= 0) {
        if (known[c + 2] === false) out.opaque = 'shell code from a variable';
        else code(args[c + 1] ?? '');
        continue;
      }
      if (!positional.length && cmd.stdin?.known) {
        code(cmd.stdin.text);
        continue;
      }
      if (!positional.length) inline = true;
    } else if (INTERPRETERS.test(name)) {
      const flag = INLINE[name.replace(/[\d.]+$/, '') === 'python' ? 'python' : name];
      if ((flag && has(flag)) || (!positional.length && (cmd.stdin || cmd.pos > 0)) || positional[0] === '-') inline = true;
    } else if (name === 'deno' && positional[0] === 'eval') inline = true;
    // Code given inline that cannot be read as shell: at least its text is checked for what is risky.
    if (inline) {
      const r = riskyText(`${args.join(' ')}\n${cmd.stdin?.text ?? ''}`);
      if (r) risk(r);
    }

    // find: -exec runs a command of its own; -delete deletes what it finds.
    let named = words;
    if (name === 'find') {
      for (let k = 0; k < words.length; k++) {
        if (!/^-(exec|execdir|ok|okdir)$/.test(words[k])) continue;
        let e = k + 1;
        while (e < words.length && words[e] !== ';' && words[e] !== '+') e++;
        const inner = words.slice(k + 1, e).map((w) => (w === '{}' ? UNKNOWN : w));
        if (inner.length) queue.push({ cmd: { ...cmd, words: inner, known: inner.map((w) => w !== UNKNOWN), globs: inner.map(() => false), writes: [], reads: [], env: [], stdin: undefined }, depth: depth + 1 });
        words = [...words.slice(0, k), ...words.slice(e + 1)];
        known = [...known.slice(0, k), ...known.slice(e + 1)];
        globs = [...globs.slice(0, k), ...globs.slice(e + 1)];
        k--;
      }
      words.forEach((w, k) => /^-(fprint0?|fprintf|fls)$/.test(w) && words[k + 1] && write(words[k + 1]));
      named = words;
      if (words.includes('-delete')) {
        named = ['find-delete', ...words.slice(1)];
        const expr = words.findIndex((w, k) => k > 0 && w.startsWith('-') && !/^-[HLP]$/.test(w));
        const roots = words.slice(1, expr < 0 ? undefined : expr).filter((w) => !isFlag(w));
        for (const r of roots.length ? roots : ['.']) deletion(r, 'files');
      }
    }

    // The files it reads and writes.
    const knownArg = (k: number) => known[k + 1] !== false;
    if (name === 'cd' || name === 'pushd') {
      const to = positional[0];
      if (to === undefined) dir = HOME;
      else if (!knownArg(args.indexOf(to)) || to === '-') dir = '';
      else {
        dir = at(to);
        if (dir) read(dir);
      }
    } else if (name === 'popd') dir = '';
    else if (WRITERS[name]) {
      const files = args.filter((a, k) => !isFlag(a) && knownArg(k));
      const unknownArg = args.some((a, k) => !isFlag(a) && !knownArg(k));
      const t = args.findIndex((a) => a === '-t' || a === '--target-directory');
      const kind = WRITERS[name];
      const targets = kind === 'last' ? (t >= 0 ? [args[t + 1]] : files.slice(-1)) : kind === 'rest' ? files.slice(1) : files;
      for (const f of targets) if (f) write(f);
      if (kind === 'last') for (const f of files.slice(0, -1)) if (pathish(f)) read(f);
      if (unknownArg && kind !== 'last') write('');
      if (name === 'rm' && has(/^(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)$/)) {
        for (const f of files) deletion(f, 'a folder');
        if (unknownArg || wrapper === 'xargs') risk('deletes folders it cannot name in advance');
      }
    } else if ((name === 'sed' || name === 'perl') && has(/^(-i|--in-place)/)) {
      const scripted = has(/^(-e|--expression|-f|--file)$/);
      for (const f of positional.slice(scripted ? 0 : 1)) write(f);
    } else if (name === 'dd') {
      for (const a of args) {
        if (a.startsWith('of=')) write(a.slice(3));
        if (a.startsWith('if=')) read(a.slice(3));
      }
    } else if (name === 'curl' || name === 'wget') {
      args.forEach((a, k) => {
        const next = args[k + 1];
        if (name === 'curl' && /^(-o|--output)$/.test(a) && next) write(next);
        if (name === 'wget' && /^(-O|--output-document|-P|--directory-prefix)$/.test(a) && next && next !== '-') write(next);
        if (/^--(output|output-document|directory-prefix)=/.test(a)) write(a.slice(a.indexOf('=') + 1));
      });
    } else if ((name === 'tar' || name === 'unzip') && has(/^(-C|--directory|-d)$/)) {
      const k = args.findIndex((a) => /^(-C|--directory|-d)$/.test(a));
      if (args[k + 1]) write(args[k + 1]);
    } else if (!PATHLESS.has(name)) {
      const skipFirst = FIRST_IS_SCRIPT.has(name) && !has(/^(-e|--regexp|-f|--file)$/);
      let seenFirst = false;
      args.forEach((a, k) => {
        if (!knownArg(k)) return;
        if (isFlag(a)) {
          const eq = a.indexOf('=');
          if (eq > 0 && pathish(a.slice(eq + 1))) read(a.slice(eq + 1));
          return;
        }
        if (skipFirst && !seenFirst) return void (seenFirst = true);
        // A wildcard names the files it matches: those are checked (a secret among them asks).
        if (globs[k + 1] && dir) for (const f of expand(a, dir)) if (pathish(f) || SECRETISH.test(path.basename(f))) read(f);
        if ((name === 'git' && args[k - 1] === '-C') || pathish(a)) read(a);
      });
    }

    const fixed = PATHLESS.has(name) || known.every(Boolean);
    const safe = !assigns.length && !inline && plain && fixed && looks(named) && cmd.writes.every((w) => /^\/dev\/(null|stdout|stderr)$/.test(w));
    out.parts.push({ words: headWords(named), raw: named, key: keyOf(named), safe, inline });
  }
  if (out.opaque) out.risk ??= riskyText(src);
  return out;
}

/** For commands that cannot be read: the risky patterns, found in the text itself. */
export function riskyText(src: string): string | undefined {
  const checks: [RegExp, string][] = [
    [/(^|[\s;&|(`$])(sudo|doas|pkexec|su)\s/, 'runs as the administrator (sudo)'],
    [/(^|[\s;&|(`$])rm\s+(-[a-zA-Z]*[rR]|--recursive)/, 'deletes folders'],
    [/\b(curl|wget|fetch)\b[^\n]*\|\s*(sudo\s+)?\S*\b((ba|z|da|k)?sh|python[\d.]*|node|perl|ruby)\b/, 'pipes a download straight into a shell'],
    [/\b(chmod|chown|chgrp)\s+(-[a-zA-Z]*R|--recursive)/, 'changes permissions or owners recursively'],
    [/(^|[\s;&|(`$])(dd|mkfs(\.\w+)?|mke2fs|mkswap|wipefs|fdisk|sfdisk|parted)\s/, 'writes raw data to a disk'],
    [/(>|\btee\b|\bcp\b|\bmv\b)[^;&|\n]*(~|\$HOME|\/home\/[^/\s]+)\/\.(ssh|bashrc|zshrc|profile|bash_profile|config|local)/, 'changes a settings or startup file in your home folder'],
    [/(^|[\s;&|(`$])(shutdown|reboot|poweroff|halt)\b/, 'shuts down or restarts the computer'],
    [/(^|[\s;&|(`$])crontab\s+(?!-l)/, 'changes scheduled jobs (crontab)'],
    [/:\(\)\s*\{/, 'defines a function that may run without end'],
  ];
  // Also as the shell would see it through simple disguises: $'\x72m', r''m, {rm,-rf,~}, rm${IFS}-rf.
  const plain = src
    .replace(/\$'((?:\\.|[^'])*)'/g, (_, t: string) => ansiC(t))
    .replace(/\$\{?IFS\}?/g, ' ')
    .replace(/\{([^{}\s]*,[^{}\s]*)\}/g, (_, t: string) => ` ${t.split(',').join(' ')} `)
    .replace(/['"\\]/g, '');
  return checks.find(([re]) => re.test(src) || re.test(plain))?.[1];
}

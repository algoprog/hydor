import { basename } from './format';
// Shell commands in plain words for the timeline ("Read index.ts", "Run the tests"), for agents that
// don't describe their commands themselves. Only common commands get a name; the rest show as typed.

const base = (p: string) => basename(p) || p;
const quoted = (s: string) => `“${s.length > 40 ? s.slice(0, 39) + '…' : s}”`;
const unescape = (re: string) => re.replace(/\\([.()[\]{}|*+?^$\\/-])/g, '$1');

// A variable's value: quoted, or a plain word (not a `$(…)` command).
const VALUE = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|()\x60]*)`;

/** Prefixes that don't change what a command does: `cd dir &&`, `sudo`, `VAR=x`, `timeout 60`, `source env &&`. */
const WRAPPERS = [
  /^cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)\s*/,
  /^(?:source|\.)\s+\S+\s*(?:&&|;)\s*/,
  /^set\s+-[a-z]+\s*(?:&&|;|\n)\s*/,
  /^(?:date|pwd|true)(?:\s+[-+][^\s;&|]*)*\s*(?:&&|;|\n)\s*/,
  /^(?:sudo|nohup|time|exec)\s+(?:-[a-zA-Z]+\s+)*/,
  /^timeout\s+(?:-\S+\s+)*\d\S*\s+/,
  new RegExp(String.raw`^(?:export\s+)?(?:[A-Za-z_]\w*=${VALUE}\s*)+(?:&&|;|\n)\s*`),
  new RegExp(String.raw`^[A-Za-z_]\w*=${VALUE}\s+`),
];

/** The command without its leading `cd dir &&` and similar prefixes. */
export function cleanCommand(cmd: string): string {
  let c = cmd.trim();
  for (let again = true; again; ) {
    again = false;
    for (const w of WRAPPERS) {
      const m = w.exec(c);
      if (m && m[0].length < c.length) {
        c = c.slice(m[0].length);
        again = true;
      }
    }
  }
  return c;
}

/** The words of a command up to its first pipe, `;`, `&&` or redirect, unquoted. */
function words(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/(?:[^\s"'|;&<>]|"(?:[^"\\]|\\.)*"|'[^']*')+|[|;&<>]+/g)) {
    if (/^[|;&<>]/.test(m[0])) break;
    out.push(m[0].replace(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g, (_, a, b) => a ?? b));
  }
  return out;
}

/** Options of grep-like tools that take a value. */
const VALUE_FLAGS = new Set(['-A', '-B', '-C', '-m', '-g', '-t', '-T', '-f', '-d', '-D', '--glob', '--type', '--type-not', '--max-count', '--context', '--after-context', '--before-context']);

/** The first argument that isn't an option, an option's value or a bare number. */
function operand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-e' || a === '--regexp') return args[i + 1];
    if (VALUE_FLAGS.has(a)) i++;
    else if (!a.startsWith('-') && !/^\d+$/.test(a)) return a;
  }
}

/** The arguments that name files (sed's `1,80p` script and line counts left out). */
const files = (args: string[]) => args.filter((a) => !a.startsWith('-') && !/^\+?\d+$/.test(a) && !/^[\d,$]+p$/.test(a));

/** "Read index.ts", or "Read 3 files". */
function readLabel(verb: string, args: string[]): string | undefined {
  const f = files(args);
  return f.length === 1 ? `${verb} ${base(f[0])}` : f.length ? `${verb} ${f.length} files` : undefined;
}

/** Options of ssh that take a value. */
const SSH_VALUE = new Set(['-i', '-o', '-p', '-l', '-F', '-J', '-b', '-c', '-D', '-E', '-e', '-I', '-L', '-m', '-O', '-Q', '-R', '-S', '-W', '-w']);

const GIT: Record<string, string> = {
  status: 'Check git status',
  diff: 'Look at the changes',
  show: 'Look at a commit',
  log: 'Look at the history',
  commit: 'Commit',
  push: 'Push',
  pull: 'Pull',
  fetch: 'Fetch from the remote',
  add: 'Stage files',
  checkout: 'Switch branches',
  switch: 'Switch branches',
  branch: 'List branches',
  stash: 'Stash changes',
  worktree: 'Manage worktrees',
};

const PKG = new Set(['npm', 'pnpm', 'yarn', 'bun']);

function tool(prog: string, args: string[]): string | undefined {
  const sub = args[0];
  switch (prog) {
    case 'pytest':
    case 'vitest':
    case 'jest':
    case 'mocha':
      return 'Run the tests';
    case 'tsc':
      return 'Check types';
    case 'eslint':
    case 'ruff':
    case 'mypy':
      return 'Check the code';
    case 'prettier':
      return 'Format the code';
    case 'vite':
      return sub === 'build' ? 'Build the project' : undefined;
    case 'cargo':
    case 'go':
      return sub === 'test' ? 'Run the tests' : sub === 'build' ? 'Build the project' : sub ? `Run ${prog} ${sub}` : undefined;
    case 'pip':
    case 'pip3':
      return sub === 'install' ? 'Install packages' : undefined;
    case 'git': {
      let i = 0;
      while (args[i]?.startsWith('-')) i += args[i] === '-C' || args[i] === '-c' ? 2 : 1;
      const s = args[i];
      return s ? (GIT[s] ?? `Run git ${s}`) : undefined;
    }
    case 'gh':
      return sub ? `Run gh ${sub}${args[1] && !args[1].startsWith('-') ? ` ${args[1]}` : ''}` : undefined;
    case 'ls':
    case 'tree':
    case 'eza': {
      const f = files(args);
      return f.length === 1 && f[0] !== '.' && !/\.\w+$/.test(f[0]) ? `List files in ${base(f[0])}` : 'List files';
    }
    case 'cat':
    case 'head':
    case 'tail':
    case 'less':
    case 'bat':
    case 'nl':
      return readLabel('Read', args);
    case 'sed': {
      // The script is the first operand unless it comes with -e or -f.
      const rest: string[] = [];
      let script = false;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-e' || args[i] === '-f' || args[i] === '--expression') {
          script = true;
          i++;
        } else rest.push(args[i]);
      }
      const ops = rest.filter((a) => !a.startsWith('-'));
      return readLabel(args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place')) ? 'Edit' : 'Read', script ? ops : ops.slice(1));
    }
    case 'rg':
    case 'grep':
    case 'egrep':
    case 'ag':
    case 'ack': {
      if (args.includes('--files')) return 'List files';
      const p = operand(args);
      return p ? `Search for ${quoted(unescape(p))}` : 'Search';
    }
    case 'ssh': {
      let i = 0;
      while (args[i]?.startsWith('-')) i += SSH_VALUE.has(args[i]) ? 2 : 1;
      const host = args[i]?.split('@').pop();
      return host ? `Run on ${host}` : undefined;
    }
    case 'make': {
      const t = args.filter((a, i) => !a.startsWith('-') && !['-C', '-f', '-j'].includes(args[i - 1]) && !a.includes('='));
      return t.length ? `Run make ${t[0]}` : 'Run make';
    }
    case 'find':
    case 'fd':
      return 'Find files';
    case 'wc':
      return 'Count lines';
    case 'diff':
      return 'Compare files';
    case 'curl':
    case 'wget': {
      const url = args.find((a) => /^(?:https?:\/\/|localhost\b|\d+\.\d+\.\d+\.\d+)/.test(a));
      return url ? `Fetch from ${url.replace(/^https?:\/\//, '').split(/[/?#]/)[0]}` : 'Fetch a URL';
    }
    case 'mkdir':
      return 'Make a folder';
    case 'rm': {
      const f = operand(args);
      return f ? `Delete ${base(f)}` : 'Delete files';
    }
    case 'mv':
    case 'cp': {
      const f = files(args);
      const verb = prog === 'mv' ? 'Move' : 'Copy';
      return f.length === 2 ? `${verb} ${base(f[0])}` : `${verb} files`;
    }
    case 'rsync':
    case 'scp':
      return 'Copy files';
    case 'chmod':
    case 'chown':
      return 'Change permissions';
    case 'sleep':
      return /^\d+$/.test(sub ?? '') ? `Wait ${sub} s` : 'Wait';
    case 'ps':
    case 'pgrep':
      return 'Check running processes';
    case 'kill':
    case 'pkill':
      return 'Stop a process';
    case 'systemctl': {
      const unit = args.slice(1).find((a) => !a.startsWith('-'));
      if (sub === 'status' || sub === 'is-active') return unit ? `Check ${unit}` : 'Check a service';
      return sub && unit ? `${sub[0].toUpperCase()}${sub.slice(1)} ${unit}` : undefined;
    }
    case 'journalctl': {
      const u = args.indexOf('-u');
      return u >= 0 && args[u + 1] ? `Read the ${args[u + 1]} log` : 'Read the system log';
    }
    case 'docker':
    case 'podman':
      return sub === 'ps' ? 'Check containers' : sub ? `Run ${prog} ${sub}` : undefined;
    case 'psql':
    case 'sqlite3':
    case 'mysql':
      return 'Query the database';
    case 'nvidia-smi':
      return 'Check the GPUs';
    case 'df':
    case 'du':
      return 'Check disk usage';
  }
  if (PKG.has(prog)) {
    // `npm --prefix web run build`, `pnpm -C web test`, `yarn --cwd web build`.
    let i = 0;
    while (args[i]?.startsWith('-')) i += ['--prefix', '-C', '--dir', '--cwd', '--filter', '-F', '-w', '--workspace'].includes(args[i]) ? 2 : 1;
    const s = args[i] === 'run' ? args[i + 1] : args[i];
    if (s === 'test') return 'Run the tests';
    if (s === 'build') return 'Build the project';
    if (s === 'install' || s === 'i' || s === 'add' || s === 'ci') return 'Install packages';
    if (s === 'typecheck' || s === 'lint' || s === 'check') return 'Check the code';
    return s ? `Run ${s}` : undefined;
  }
}

/** A plain-words name for a common command ("Read index.ts", "Run the tests"), or undefined. */
export function commandLabel(cmd: string): string | undefined {
  const line = cleanCommand(cmd).split('\n')[0];
  const write = /^(?:cat|tee(?:\s+-a)?)\s*(?:>>?\s*(\S+)\s*<<|<<-?\s*\S+\s*>>?\s*(\S+))/.exec(line) ?? /^tee\s+(?:-a\s+)?(\S+)\s*<</.exec(line);
  if (write) return `Write ${base((write[1] ?? write[2]).replace(/^['"]|['"]$/g, ''))}`;
  const script = /<<-?\s*['"]?\w+/.test(line);
  let w = words(line);
  // Launchers that run the real program: `uv run python`, `npx tsc`, `bunx vitest`.
  if (w[0] === 'uv' && w[1] === 'run') {
    w = w.slice(2);
    while (w[0]?.startsWith('-')) w = w.slice(['--with', '--python', '-p', '--project', '--directory', '--env-file'].includes(w[0]) ? 2 : 1);
  } else if (w[0] === 'uv' && (w[1] === 'pip' || w[1] === 'add' || w[1] === 'sync')) return w[1] === 'pip' && w[2] !== 'install' ? undefined : 'Install packages';
  else if (w[0] === 'npx' || w[0] === 'bunx' || w[0] === 'pnpx') {
    w = w.slice(1);
    while (w[0]?.startsWith('-')) w = w.slice(1);
  }
  const prog = base(w[0] ?? '');
  const args = w.slice(1);
  if (/^python[\d.]*$/.test(prog)) {
    if (script || args.includes('-')) return 'Run a Python script';
    if (args.includes('-c')) return 'Run Python code';
    const m = args.indexOf('-m');
    if (m >= 0) return args[m + 1] === 'pytest' ? 'Run the tests' : args[m + 1] ? `Run ${args[m + 1]}` : undefined;
    const f = args.find((a) => a.endsWith('.py'));
    return f ? `Run ${base(f)}` : undefined;
  }
  if (prog === 'node' || prog === 'tsx' || prog === 'deno' || (prog === 'bun' && !args[0]?.match(/^(test|install|add|run|build|x)$/))) {
    if (script || args.includes('-')) return 'Run a Node script';
    if (args.includes('-e') || args.includes('-p') || args.includes('--eval')) return 'Run Node code';
    const f = args.find((a) => /\.[cm]?[jt]sx?$/.test(a));
    return f ? `Run ${base(f)}` : undefined;
  }
  if (prog === 'bash' || prog === 'sh' || prog === 'zsh') {
    if (script) return 'Run a shell script';
    const f = args.find((a) => !a.startsWith('-'));
    return f ? `Run ${base(f)}` : undefined;
  }
  const named = tool(prog, args);
  if (named) return named;
  // A program run by its path: `./build.sh`, `scripts/deploy staging`.
  if (w[0]?.includes('/') && /^[\w.~-][\w./~-]*[\w-]$/.test(w[0])) return `Run ${base(w[0])}${args[0] && /^[a-z][\w-]*$/.test(args[0]) ? ` ${args[0]}` : ''}`;
}

/** The command's first line, as shown next to its name; `…` when a script follows. */
export function commandLine(cmd: string): string {
  const c = cleanCommand(cmd);
  const nl = c.indexOf('\n');
  return nl < 0 ? c : `${c.slice(0, nl).trimEnd()} …`;
}

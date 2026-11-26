// What Hydor knows about running Lean, in one place: the server's tools (server/lean) and the `leancheck` command
// (cli.mjs, beside this file) both use it, so the verdict is the same whoever asks. Finding Lean, running it with a
// time limit, reading its messages, and the verdict itself.
//
// The verdict does not trust what the file under test can change. `#print axioms` can be redefined by the file's own
// `macro_rules`, and `set_option debug.skipKernelTC true` puts in a proof the kernel never saw (both seen with
// Lean 4.36). So the file is compiled on its own, its theorems' axioms are then read by a small program of ours
// (AUDIT) that loads the compiled file without running any of its syntax, and Lean's own `leanchecker` plays every
// declaration back through the kernel.
//
// The verdict also says what was proved: each theorem's statement as Lean reads it, and a pin of it, so that a
// statement changed after it was agreed (a hypothesis added, a bound loosened, a definition rewritten) is caught.
// The pin is a hash of the elaborated type (see AUDIT's `Form`), not of the text of the file: the names of bound
// variables and of the file's own definitions, spacing, comments and the proof do not count; every term, type,
// universe, instance and library name does, and what each definition of one's own that the statement rests on says.
// The same statement can get another pin from another version of Lean or Mathlib, if it reads it otherwise there.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STANDARD_AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'];

/** Imports that only Mathlib's project has (Mathlib and the libraries it brings). */
const MATHLIB_LIBS = /^(Mathlib|Batteries|Aesop|Qq|ProofWidgets|Plausible|ImportGraph|LeanSearchClient)(\.|$)/;

/** A pin: this many hexadecimal digits of the statement's hash. */
export const PIN_LENGTH = 12;

/** Time one check may take unless told otherwise. */
export const DEFAULT_TIMEOUT_MS = 10 * 60_000;

const WIN = process.platform === 'win32';
const exe = (name) => (WIN ? `${name}.exe` : name);

// ---- finding Lean -------------------------------------------------------------------------------------------------

/** The first of `name` on a PATH, or null. */
export function onPath(name, env) {
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    for (const n of WIN ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name]) {
      const p = path.join(d, n);
      try {
        if (fs.statSync(p).isFile()) {
          if (!WIN) fs.accessSync(p, fs.constants.X_OK);
          return p;
        }
      } catch {}
    }
  }
  return null;
}

/** The app's own Lean: its folders under <data folder>/lean. */
export const appPaths = (leanDir) => ({
  elan: path.join(leanDir, 'elan'),
  bin: path.join(leanDir, 'elan', 'bin'),
  /** Written when setting up finished: the version. */
  marker: path.join(leanDir, 'ready'),
  mathlib: path.join(leanDir, 'mathlib'),
  mathlibMarker: path.join(leanDir, 'mathlib', '.hydor-ready'),
  mathlibCache: path.join(leanDir, 'mathlib-cache'),
});

/** The environment a program of the app's own Lean runs in: its elan, first on PATH for that program alone. */
export function appEnv(leanDir, env) {
  const p = appPaths(leanDir);
  return { ...env, ELAN_HOME: p.elan, PATH: [p.bin, env.PATH ?? env.Path ?? ''].filter(Boolean).join(path.delimiter) };
}

/**
 * Lean as it is used here: your own (`lake` and `lean` on `env`'s PATH), used as it is and never changed; else the
 * app's own under `leanDir` once it is set up; else null.
 */
export function findLean(env, leanDir) {
  const lake = onPath('lake', env);
  const lean = onPath('lean', env);
  if (lake && lean) return { lake, lean, own: true, env };
  if (!leanDir) return null;
  const p = appPaths(leanDir);
  if (!fs.existsSync(p.marker)) return null;
  const mine = { lake: path.join(p.bin, exe('lake')), lean: path.join(p.bin, exe('lean')) };
  if (!fs.existsSync(mine.lake) || !fs.existsSync(mine.lean)) return null;
  return { ...mine, own: false, env: appEnv(leanDir, env) };
}

/** Mathlib's project, when it is set up. */
export function mathlibDir(leanDir) {
  if (!leanDir) return null;
  const p = appPaths(leanDir);
  return fs.existsSync(p.mathlibMarker) ? p.mathlib : null;
}

// ---- running ------------------------------------------------------------------------------------------------------

/** A word for sh. */
const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * Runs a program with a time limit; it and everything it started are killed when the time is up or `signal` aborts.
 * `shell` (the app's sandbox, server/agent/sandbox.ts): the command goes through it, from `cwd`.
 */
export function run(cmd, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, signal, shell, onLine, maxOut = 6 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let done = false;
    let child;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve({ code: null, ...r, stdout, stderr, timedOut, aborted: !!signal?.aborted });
    };
    const kill = () => {
      if (!child?.pid) return;
      try {
        if (WIN) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
        else process.kill(-child.pid, 'SIGKILL');
      } catch {}
      // Something that left the process group may hold the pipes open: not for long.
      setTimeout(() => finish({}), 2000).unref();
    };
    const stop = () => kill();
    let timer;
    if (signal?.aborted) return finish({ failed: 'Stopped' });
    try {
      let file = cmd;
      let argv = args;
      let extra = {};
      if (shell) {
        const b = shell(`${cwd ? `cd ${shq(cwd)} && ` : ''}exec ${[cmd, ...args].map(shq).join(' ')}`);
        file = b.cmd;
        argv = b.args;
        extra = b.env ?? {};
      }
      child = spawn(file, argv, { cwd, env: { ...(env ?? process.env), ...extra }, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, windowsHide: true });
    } catch (e) {
      return finish({ failed: e.message });
    }
    timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, Math.max(1, timeoutMs));
    signal?.addEventListener('abort', stop, { once: true });
    let rest = '';
    const lines = (chunk) => {
      if (!onLine) return;
      const parts = (rest + chunk).split(/\r?\n|\r/);
      rest = parts.pop() ?? '';
      for (const l of parts) if (l.trim()) onLine(l.trim());
    };
    child.stdout.setEncoding('utf8').on('data', (d) => {
      if (stdout.length < maxOut) stdout += d;
      lines(d);
    });
    child.stderr.setEncoding('utf8').on('data', (d) => {
      stderr = (stderr + d).slice(-maxOut);
      lines(d);
    });
    child.on('error', (e) => finish({ failed: e.message }));
    child.on('close', (code) => finish({ code }));
  });
}

/** The last lines of what a program said, for an error in words. */
export const lastLines = (r, n = 4) =>
  `${r.stderr}\n${r.stdout}`
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .map((l) => l.slice(0, 300))
    .join('\n');

// ---- reading the source -------------------------------------------------------------------------------------------

/** The source with comments and the insides of strings blanked; every character stays where it was. */
export function stripLean(text) {
  const out = text.split('');
  const blank = (i) => {
    if (out[i] !== '\n') out[i] = ' ';
  };
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '-' && d === '-') {
      while (i < n && text[i] !== '\n') blank(i++);
    } else if (c === '/' && d === '-') {
      let depth = 0;
      do {
        if (text[i] === '/' && text[i + 1] === '-') {
          depth++;
          blank(i++);
          blank(i++);
        } else if (text[i] === '-' && text[i + 1] === '/') {
          depth--;
          blank(i++);
          blank(i++);
        } else blank(i++);
      } while (i < n && depth > 0);
    } else if (c === '"') {
      i++;
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\') blank(i++);
        blank(i++);
      }
      i++;
    } else if (c === '«') {
      const end = text.indexOf('»', i);
      i = end < 0 ? n : end + 1;
    } else if (c === "'" && !/[\p{L}\p{N}_'!?]/u.test(text[i - 1] ?? '') && (d === '\\' || text[i + 2] === "'")) {
      // A character literal (not the prime of a name such as h').
      i++;
      while (i < n && text[i] !== "'" && text[i] !== '\n') {
        if (text[i] === '\\') blank(i++);
        blank(i++);
      }
      i++;
    } else i++;
  }
  return out.join('');
}

const MODIFIERS = String.raw`(?:(?:@\[[^\]]*\]|private|protected|noncomputable|nonrec|public|scoped|local|unsafe|partial|meta)\s+)*`;
/** What may stand before `theorem` on its line: nothing, modifiers, the end of attributes, or `… in`. */
const BEFORE_DECL = new RegExp(String.raw`(?:^\s*|\]\s*|\bin\s+)${MODIFIERS}$`);

/**
 * What a source file holds, as far as the verdict needs it: the places marked `sorry`, the theorems and lemmas by
 * their full names (the namespaces they are in), and the modules it imports. Lean's column: counted from 0.
 */
export function scanLean(text) {
  const code = stripLean(text);
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1);
  const at = (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: [...text.slice(starts[lo], index)].length };
  };
  const sorries = [...code.matchAll(/(?<![\p{L}\p{N}_.'«])(?:sorry|sorryAx)(?![\p{L}\p{N}_'»])/gu)].map((m) => at(m.index));
  const imports = [...code.matchAll(/^[ \t]*(?:public[ \t]+)?(?:meta[ \t]+)?import[ \t]+(?:all[ \t]+)?([^\s]+)/gm)].map((m) => m[1]);
  const theorems = [];
  const stack = [];
  for (const m of code.matchAll(/(?<![\p{L}\p{N}_.'«])(namespace|section|mutual|end|theorem|lemma)(?![\p{L}\p{N}_.'»])/gu)) {
    const word = m[1];
    const after = code.slice(m.index + word.length);
    const named = /^[ \t]+([^\s]+)/.exec(after)?.[1];
    if (word === 'namespace') {
      for (const part of (named ?? '').split('.').filter(Boolean)) stack.push({ ns: true, name: part });
    } else if (word === 'section') {
      const parts = (named ?? '').split('.').filter(Boolean);
      for (const part of parts.length ? parts : ['']) stack.push({ ns: false, name: part });
    } else if (word === 'mutual') stack.push({ ns: false, name: '' });
    else if (word === 'end') {
      const parts = (named ?? '').split('.').filter(Boolean);
      for (let k = Math.max(1, parts.length); k > 0; k--) stack.pop();
    } else {
      const lineStart = code.lastIndexOf('\n', m.index) + 1;
      if (!BEFORE_DECL.test(code.slice(lineStart, m.index))) continue;
      let name = /^\s+((?:«[^»]*»|[^\s({[:⦃,«])+)/u.exec(after)?.[1];
      if (!name) continue;
      name = name.replace(/\.+$/, '');
      const full = name.startsWith('_root_.') ? name.slice(7) : [...stack.filter((s) => s.ns).map((s) => s.name), name].join('.');
      theorems.push({ name: full, ...at(m.index) });
    }
  }
  return { sorries, imports, theorems, skipsKernel: /\bdebug\.skipKernelTC\b/.test(code) };
}

export const needsMathlib = (imports) => imports.some((m) => MATHLIB_LIBS.test(m));

/** The Lake project a file is in: the nearest folder up from it with a lakefile, or null. */
export function findProject(file) {
  let dir = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'lakefile.lean')) || fs.existsSync(path.join(dir, 'lakefile.toml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

// ---- a project's own Mathlib --------------------------------------------------------------------------------------

/** Modules that come with Lean itself. */
const CORE_LIBS = /^(Init|Std|Lean|Lake)(\.|$)/;

const textOf = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/** Whether a project's lakefile requires Mathlib itself. */
function asksForMathlib(toml, lean) {
  const inToml = (toml ?? '').split(/^[ \t]*(?=\[)/m).some((s) => s.startsWith('[[require]]') && /^[ \t]*name[ \t]*=[ \t]*["']mathlib["']/m.test(s));
  const inLean = /^[ \t]*require[ \t]+(?:(?:"[^"\n]*"|«[^»\n]*»|[\w-]+)[ \t]*\/[ \t]*)?(?:"mathlib"|«mathlib»|mathlib(?![\w-]))/m.test((lean ?? '').replace(/--.*$/gm, ''));
  return inToml || inLean;
}

/**
 * Why a file of a project that uses Mathlib is not run: Lake would first fetch what is missing, without a word (a
 * project with no manifest yet downloads and unpacks several GB) or compile Mathlib from source, for hours. Null when
 * what the file needs is there, or the project does not use Mathlib.
 */
export function unfetchedMathlib(root, imports) {
  let manifest = null;
  try {
    manifest = JSON.parse(textOf(path.join(root, 'lake-manifest.json')));
  } catch {}
  const listed = manifest?.packages?.find((p) => p?.name === 'mathlib');
  const toml = textOf(path.join(root, 'lakefile.toml'));
  const lakefile = textOf(path.join(root, 'lakefile.lean'));
  if (!listed && !asksForMathlib(toml, lakefile)) return null;
  const dir = listed?.type === 'path' ? path.resolve(root, listed.dir) : path.resolve(root, manifest?.packagesDir ?? '.lake/packages', 'mathlib');
  const built = [path.join(dir, '.lake', 'build', 'lib', 'lean'), path.join(dir, '.lake', 'build', 'lib')];
  const why = (what) =>
    `This Lean project (${root}) uses Mathlib, and ${what}, so nothing was run: Lean would download it as it went, or compile Mathlib from source, which takes hours. Run \`lake exe cache get\` in that folder first (it needs the network; about 600 MB to download the first time, and about 8 GB in the project, which keeps its own copy of Mathlib), then check again.`;
  // Never updated: Lake would download everything for any file, whatever it imports.
  if (!listed && !fs.existsSync(dir)) return why('its libraries are not fetched yet');
  const sources = [root, ...[...`${toml}\n${lakefile}`.matchAll(/\bsrcDir[ \t]*:?=[ \t]*["']([^"'\n]+)["']/g)].map((m) => path.resolve(root, m[1]))];
  const seen = new Set();
  const todo = [...imports];
  while (todo.length) {
    const mod = todo.pop();
    if (seen.has(mod)) continue;
    seen.add(mod);
    const rel = mod.replace(/[«»]/g, '').split('.').join(path.sep);
    if (/^Mathlib(\.|$)/.test(mod)) {
      // A module Mathlib's fetched source does not have (a misspelled import) is Lean's to report.
      const known = !fs.existsSync(path.join(dir, 'Mathlib')) || fs.existsSync(path.join(dir, `${rel}.lean`));
      if (known && !built.some((d) => fs.existsSync(path.join(d, `${rel}.olean`)))) return why(`${mod} is not built in it yet`);
    } else if (!MATHLIB_LIBS.test(mod) && !CORE_LIBS.test(mod)) {
      // The project's own file, whose imports count too; else another library's, which may import Mathlib.
      const own = sources.map((s) => textOf(path.join(s, `${rel}.lean`))).find((t) => t != null);
      if (own != null) todo.push(...scanLean(own).imports);
      else if (!built.some((d) => fs.existsSync(path.join(d, 'Mathlib')))) return why('it is not built in it yet');
    }
  }
  return null;
}

// ---- Lean's messages ----------------------------------------------------------------------------------------------

const MESSAGE_MAX = 2000;
/** The goals Lean prints are kept longer: they are what the next step is worked out from. */
const GOALS_MAX = 6000;
/** A theorem's statement, as a verdict shows it (the pin is of the whole of it). */
const STATEMENT_MAX = 4000;
const LISTED = { errors: 40, warnings: 20, info: 20 };

const clip = (s, max) => (s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more characters)` : s);

/**
 * Lean's messages: the JSON lines of the file checked (`lean --json`), and Lake's own build log for what it built
 * on the way (an import that fails), whose messages name their file.
 */
export function readMessages(stdout, stderr = '') {
  const errors = [];
  const warnings = [];
  const info = [];
  let sorryWarnings = [];
  const log = [];
  for (const line of stdout.split('\n')) {
    let m = null;
    if (line.startsWith('{')) {
      try {
        m = JSON.parse(line);
      } catch {}
    }
    if (!m || typeof m.data !== 'string') {
      log.push(line);
      continue;
    }
    const at = { line: m.pos?.line ?? 0, column: m.pos?.column ?? 0 };
    if (m.kind === 'hasSorry' || /^declaration uses .sorry./.test(m.data)) sorryWarnings.push(at);
    const goals = m.kind === 'Tactic.unsolvedGoals' || m.data.startsWith('unsolved goals') || m.severity === 'information';
    const out = { ...at, message: clip(m.data, goals ? GOALS_MAX : MESSAGE_MAX) };
    (m.severity === 'error' ? errors : m.severity === 'warning' ? warnings : info).push(out);
  }
  // Lake's log: "error: Proofs/Basic.lean:3:0: message", the message going on for as long as it does.
  let open = null;
  const END = /^(error:|warning:|info:|trace:|✖|✔|⚠|ℹ|Some required|Some builds|- |Build )/;
  for (const line of [...log, ...stderr.split('\n')]) {
    const head = /^(error|warning): (.*)$/.exec(line);
    const said = /^(.*\.lean):(\d+):(\d+): (error|warning): (.*)$/.exec(line);
    if (said || head) {
      open = null;
      const severity = said ? said[4] : head[1];
      let text = said ? said[5] : head[2];
      let file;
      let at = { line: 0, column: 0 };
      if (said) {
        file = said[1];
        at = { line: Number(said[2]), column: Number(said[3]) };
      } else {
        const where = /^(.*?\.lean):(\d+):(\d+): (.*)$/.exec(text);
        if (where) {
          file = where[1];
          at = { line: Number(where[2]), column: Number(where[3]) };
          text = where[4];
        } else if (/^(build failed|Lean exited)/.test(text)) continue;
      }
      const out = { ...at, message: text, ...(file ? { file } : {}) };
      (severity === 'error' ? errors : warnings).push(out);
      open = out;
    } else if (open && line.trim() && !END.test(line) && !line.startsWith('{')) open.message = clip(`${open.message}\n${line}`, MESSAGE_MAX);
    else open = null;
  }
  const more = (list, n) => (list.length > n ? [...list.slice(0, n), { line: 0, column: 0, message: `… and ${list.length - n} more` }] : list);
  return { errors: more(errors, LISTED.errors), warnings: more(warnings, LISTED.warnings), info: more(info, LISTED.info), sorryWarnings, count: errors.length };
}

// ---- checking -----------------------------------------------------------------------------------------------------

export class LeanProblem extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

export const NEEDS_MATHLIB = 'This imports Mathlib, which is not set up: add it in Settings → General → Lean (proof checker) → Add Mathlib (about 8 GB on disk), or ask with lean_setup { mathlib: true }.';

/** The environment `lake env` gives (the project's search paths and toolchain), read with our own Node.js. */
async function lakeEnv(lean, root, o) {
  const print = 'process.stdout.write("\\n@@HYDORENV@@" + JSON.stringify(process.env))';
  const r = await run(lean.lake, ['env', process.execPath, '-e', print], { ...o, cwd: root, env: lean.env });
  const i = r.stdout.lastIndexOf('@@HYDORENV@@');
  if (r.code !== 0 || i < 0) throw new LeanProblem(r.timedOut ? 'Lake did not answer in time.' : `Lake could not read the project: ${lastLines(r) || r.failed || `it ended with ${r.code}`}`, 'lake');
  return JSON.parse(r.stdout.slice(i + '@@HYDORENV@@'.length));
}

/**
 * How a file is run: through Lake in its project (its imports built first, its options used); a loose file or a
 * snippet that imports Mathlib with Mathlib's project's search paths; anything else by `lean` itself.
 */
async function plan(lean, file, scan, o) {
  const root = o.snippet ? null : findProject(file);
  const unfetched = root && unfetchedMathlib(root, scan.imports);
  if (unfetched) throw new LeanProblem(unfetched, 'mathlib');
  if (root) return { root, run: (extra) => ({ cmd: lean.lake, args: ['lean', path.relative(root, file), '--', '--json', ...extra], cwd: root, env: lean.env }), env: () => lakeEnv(lean, root, o) };
  const dir = path.dirname(file);
  if (needsMathlib(scan.imports)) {
    const m = o.mathlib;
    if (!m) throw new LeanProblem(NEEDS_MATHLIB, 'mathlib');
    const env = await lakeEnv(lean, m, o);
    const bin = env.LEAN_SYSROOT ? path.join(env.LEAN_SYSROOT, 'bin', exe('lean')) : lean.lean;
    const direct = fs.existsSync(bin) ? bin : lean.lean;
    return { root: null, run: (extra) => ({ cmd: direct, args: ['--json', ...extra, path.basename(file)], cwd: dir, env }), env: async () => env };
  }
  return {
    root: null,
    run: (extra) => ({ cmd: lean.lean, args: ['--json', ...extra, path.basename(file)], cwd: dir, env: lean.env }),
    env: async () => lean.env,
  };
}

/** The sorries to report: where `sorry` is written, and the declarations Lean warns of that have none written (a macro, a tactic's). */
function sorriesOf(scan, warned, ran) {
  if (!ran) return scan.sorries;
  const decls = [...scan.theorems.map((t) => t.line), Number.MAX_SAFE_INTEGER].sort((a, b) => a - b);
  const written = scan.sorries;
  const extra = warned.filter((w) => {
    const next = decls.find((l) => l > w.line) ?? Number.MAX_SAFE_INTEGER;
    return !written.some((s) => s.line >= w.line && s.line < next);
  });
  return [...written, ...extra].sort((a, b) => a.line - b.line || a.column - b.column);
}

const readSource = (file) => {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    throw new LeanProblem(`There is no file ${file}`, 'file');
  }
  if (!st.isFile() || !file.endsWith('.lean')) throw new LeanProblem(`Not a Lean file (.lean): ${file}`, 'file');
  if (st.size > 4 * 1024 * 1024) throw new LeanProblem(`Too large to check: ${file}`, 'file');
  return fs.readFileSync(file, 'utf8');
};

const stopped = (r, timeoutMs) =>
  r.aborted
    ? 'The check was stopped.'
    : r.timedOut
      ? `Lean was stopped after ${timeoutMs >= 60_000 ? `${Math.round(timeoutMs / 60_000)} minutes` : `${Math.round(timeoutMs / 1000)} s`}. A project's first build can take longer: run \`lake build\` in a terminal first (a project that uses Mathlib: \`lake exe cache get\` before it), then check again.`
      : null;

/** Compiles a file and reads what Lean says. `extra`: more arguments for lean (-o). */
async function compile(lean, file, o, extra = []) {
  const scan = scanLean(readSource(file));
  const p = await plan(lean, file, scan, o);
  const c = p.run(extra);
  const r = await run(c.cmd, c.args, { cwd: c.cwd, env: c.env, timeoutMs: o.left(), signal: o.signal, shell: o.shell });
  const m = readMessages(r.stdout, r.stderr);
  const why = stopped(r, o.timeoutMs);
  if (why) m.errors.unshift({ line: 0, column: 0, message: why });
  else if (r.failed) m.errors.unshift({ line: 0, column: 0, message: `Lean could not start: ${r.failed}` });
  else if (r.code !== 0 && !m.errors.length) m.errors.push({ line: 0, column: 0, message: lastLines(r, 8) || `Lean ended with exit code ${r.code}` });
  return { scan, plan: p, messages: m, ran: !why && !r.failed, ok: !m.errors.length && r.code === 0 };
}

const options = (o) => {
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const end = Date.now() + timeoutMs;
  return { ...o, timeoutMs, left: () => Math.max(1, end - Date.now()) };
};

/** Checks a file: its errors, warnings, messages and the places left as `sorry`. */
export async function checkFile(lean, file, opts = {}) {
  const t0 = Date.now();
  const o = options(opts);
  const c = await compile(lean, path.resolve(file), o);
  const { errors, warnings, info, sorryWarnings } = c.messages;
  return { ok: c.ok, errors, warnings, info, sorries: sorriesOf(c.scan, sorryWarnings, c.ran && c.ok), seconds: Math.round((Date.now() - t0) / 100) / 10 };
}

// ---- the verdict --------------------------------------------------------------------------------------------------

/**
 * Run with `lean --run`: reads a compiled module, and the project's own modules it imports, as data, so that none of
 * their syntax or code is ever run; only Lean's and the downloaded libraries' modules are imported. Then reports, for
 * each name asked, the axioms it depends on (walking every constant it uses, as `#print axioms` does), what it
 * states, the axioms the module declares, and which modules are the file's and the project's own.
 *
 * What it states comes twice. `form` is the elaborated type written down so that it can be hashed: one line a term.
 * `statement` is that type printed for a person, with Lean's and the libraries' notation and none of the file's or the
 * project's (a notation of one's own could make a statement read as another), numbers with their types, every proof
 * as ⋯ and nothing else left out. The file's own constants are put in by their types to print it. The libraries are
 * imported once (their compiled files are large: Mathlib's are several GB); asked with `plain` rather than
 * `notation`, they are imported without notation, for when it cannot be loaded.
 */
export const AUDIT = `import Lean
open Lean Meta

/-- What was loaded: Lean's and the downloaded libraries' modules, imported; the file's own and the project's, read as
data only, so that nothing of theirs (a notation, a printer, an initializer) is ever run here. -/
structure Loaded where
  env : Environment
  /-- The constants of the file and of the project's own files, with the module of each. -/
  own : Std.HashMap Name (ConstantInfo × Name) := {}
  /-- Their \`match\` expressions: what Lean notes about one, so that it can be shown as one. -/
  matches' : Std.HashMap Name Match.MatcherInfo := {}

def Loaded.find? (l : Loaded) (c : Name) : Option ConstantInfo :=
  match l.own[c]? with
  | some (info, _) => some info
  | none => l.env.find? c

def Loaded.isOwn (l : Loaded) (c : Name) : Bool := l.own.contains c

def Loaded.moduleOf (l : Loaded) (c : Name) : Option Name :=
  match l.own[c]? with
  | some (_, m) => some m
  | none => (l.env.getModuleIdxFor? c).map fun i => l.env.header.moduleNames[i.toNat]!

partial def walk (loaded : Loaded) (c : Name) : StateM (NameSet × Array Name) Unit := do
  if (← get).1.contains c then return
  modify fun (s, a) => (s.insert c, a)
  let expr (e : Expr) : StateM (NameSet × Array Name) Unit := e.getUsedConstants.forM (walk loaded)
  match loaded.find? c with
  | some (.axiomInfo v) =>
    modify fun (s, a) => (s, a.push c)
    expr v.type
  | some (.defnInfo v) => expr v.type; expr v.value
  | some (.thmInfo v) => expr v.type; expr v.value
  | some (.opaqueInfo v) => expr v.type; expr v.value
  | some (.quotInfo _) => pure ()
  | some (.ctorInfo v) => expr v.type
  | some (.recInfo v) => expr v.type
  | some (.inductInfo v) => expr v.type; v.ctors.forM (walk loaded)
  | none => pure ()

def userName (n : Name) : Name := (privateToUserName? n).getD n

/-- An axiom by its name; one that only looks standard says which file declared it. -/
def axiomName (loaded : Loaded) (a : Name) : String :=
  let name := (userName a).toString
  let home := loaded.moduleOf a
  let core := match home with
    | some m => m.getRoot == \`Init
    | none => false
  if (name == "propext" || name == "Classical.choice" || name == "Quot.sound") && !core then
    s!"{name} (declared in {home.getD Name.anonymous})"
  else name

/-! What each theorem states. Two things are made of the elaborated type, not of the text of the file: a canonical form,
for the pin, and the statement printed for a person. -/

/-- A name that cannot be read two ways: its parts, as JSON. -/
def nameForm (n : Name) : String :=
  let rec parts : Name → List Json
    | .anonymous => []
    | .str p s => parts p ++ [Json.str s]
    | .num p k => parts p ++ [toJson k]
  (Json.arr (parts n).toArray).compress

/-- The form of a statement as it is written down: one line a term, shared terms written once. The names of bound
variables, binder brackets and notes Lean keeps in terms are left out. A definition of the file's own (or of the
project's) is written as what it says, under a number in the order met, so that its name does not count. -/
structure Form where
  /-- Own constant, as it is referred to. -/
  refs : Std.HashMap Name String := {}
  /-- Own constants whose content is still to be written, in order. -/
  todo : Array Name := #[]
  count : Nat := 0
  terms : Std.HashMap Expr Nat := {}
  levels : Array Name := #[]
  out : Array String := #[]

abbrev FormM := ReaderT Loaded (StateM Form)

def enlist (c : Name) : FormM Nat := do
  let k := (← get).count
  modify fun s => { s with count := k + 1, refs := s.refs.insert c s!"o{k}", todo := s.todo.push c }
  return k

partial def refer (c : Name) : FormM String := do
  let loaded ← read
  unless loaded.isOwn c do return s!"g{nameForm c}"
  if let some r := (← get).refs[c]? then return r
  match loaded.find? c with
  | some (.ctorInfo v) =>
    let base ← refer v.induct
    let r := s!"{base}.c{v.cidx}"
    modify fun s => { s with refs := s.refs.insert c r }
    return r
  | some (.recInfo _) =>
    let base ← refer c.getPrefix
    let r := s!"{base}.{nameForm (.str .anonymous c.getString!)}"
    modify fun s => { s with refs := s.refs.insert c r }
    return r
  | some (.inductInfo v) =>
    for n in v.all do
      unless (← get).refs.contains n do discard <| enlist n
    return (← get).refs[c]?.getD "?"
  | _ => return s!"o{← enlist c}"

partial def levelForm (l : Level) : FormM String := do
  match l with
  | .zero => return "0"
  | .succ a => return s!"S({← levelForm a})"
  | .max a b => return s!"M({← levelForm a},{← levelForm b})"
  | .imax a b => return s!"I({← levelForm a},{← levelForm b})"
  | .param n =>
    if let some i := (← get).levels.idxOf? n then return s!"u{i}"
    let i := (← get).levels.size
    modify fun s => { s with levels := s.levels.push n }
    return s!"u{i}"
  | .mvar _ => return "?"

/-- The type of a \`sorry\`, if \`e\` is one. -/
def sorryOf (e : Expr) : Option Expr :=
  if e.isAppOfArity \`\`sorryAx 3 then
    match e.getAppArgs[0]! with
    | .forallE _ (.const \`\`Lean.Name _) t _ => some t
    | _ => none
  else none

partial def termForm (e : Expr) : FormM Nat := do
  let e := e.consumeMData
  if let some i := (← get).terms[e]? then return i
  -- A gap: the label Lean puts in it says where in the file it was written, which is no part of what is stated.
  let line ← match sorryOf e with
  | some t => pure s!"sorry {← termForm t}"
  | none => match e with
    | .bvar i => pure s!"v {i}"
    | .sort l => pure s!"s {← levelForm l.normalize}"
    | .const n ls =>
      let r ← refer n
      let ls ← ls.mapM fun l => levelForm l.normalize
      pure s!"c {r} {ls}"
    | .app f a => pure s!"a {← termForm f} {← termForm a}"
    | .lam _ t b _ => pure s!"l {← termForm t} {← termForm b}"
    | .forallE _ t b _ => pure s!"p {← termForm t} {← termForm b}"
    | .letE _ t v b _ => pure s!"t {← termForm t} {← termForm v} {← termForm b}"
    | .lit (.natVal n) => pure s!"n {n}"
    | .lit (.strVal t) => pure s!"x {(Json.str t).compress}"
    | .proj t i a => pure s!"j {← refer t} {i} {← termForm a}"
    | _ => pure "?"
  let i := (← get).out.size
  modify fun s => { s with out := s.out.push line, terms := s.terms.insert e i }
  return i

/-- One declaration's content: what it is, and its terms (a theorem's and an axiom's type; never a proof). -/
def declForm (head : String) (parts : List Expr) : FormM Unit := do
  modify fun s => { s with terms := {}, levels := #[] }
  let ids ← parts.mapM termForm
  modify fun s => { s with out := s.out.push s!"= {head} {ids}" }

partial def ownForms (i : Nat) : FormM Unit := do
  let loaded ← read
  let some c := (← get).todo[i]? | return
  match loaded.find? c with
  | some (.defnInfo v) => declForm s!"o{i} def" [v.type, v.value]
  | some (.thmInfo v) => declForm s!"o{i} theorem" [v.type]
  | some (.axiomInfo v) => declForm s!"o{i} axiom" [v.type]
  | some (.opaqueInfo v) => declForm s!"o{i} opaque" [v.type]
  | some (.quotInfo v) => declForm s!"o{i} quot" [v.type]
  | some (.inductInfo v) =>
    let ctors := v.ctors.filterMap fun n => (loaded.find? n).map (·.type)
    declForm s!"o{i} inductive {v.numParams} {v.numIndices} {v.ctors.length}" (v.type :: ctors)
  | _ => modify fun s => { s with out := s.out.push s!"= o{i} ?" }
  ownForms (i + 1)

/-- The canonical form of a statement, and the declarations of one's own it rests on. -/
def statementForm (loaded : Loaded) (type : Expr) : String × Array Name :=
  let go : FormM Unit := do
    declForm "statement" [type]
    ownForms 0
  let (_, s) := (go.run loaded).run {}
  ("\\n".intercalate s.out.toList, s.todo)

/-- What Lean makes by itself in a type's namespace. -/
def madeForType : List String :=
  ["casesOn", "recOn", "rec", "brecOn", "below", "noConfusion", "noConfusionType", "ctorIdx", "ctorElim", "ctorElimType", "toCtorIdx"]

/-- A structure's field, as Lean defines it. -/
def isField : Expr → Bool
  | .lam _ _ b _ => isField b
  | .proj .. => true
  | _ => false

/-- Those of them a person would know by name: not proofs, nor what Lean makes beside a definition. -/
def restsOn (loaded : Loaded) (used : Array Name) : Array Name :=
  let types := used.filter fun c => loaded.find? c matches some (.inductInfo _)
  used.filter fun c =>
    let beside := types.any fun t => t != c && t.isPrefixOf c
    let made := match loaded.find? c with
      | some (.thmInfo _) => true
      | some (.defnInfo v) => beside && (isField v.value || c.components.any fun p => madeForType.contains p.toString)
      | _ => false
    !(userName c).isInternalDetail && !made

/-- Own constants named in \`e\` are added to \`shown\` (as axioms: printing needs only their types), after those their
types name. -/
partial def declare (loaded : Loaded) (e : Expr) : StateM (Environment × NameSet) Unit := do
  for c in e.getUsedConstants do
    unless loaded.isOwn c do continue
    if (← get).2.contains c then continue
    modify fun (s, done) => (s, done.insert c)
    let some info := loaded.find? c | continue
    declare loaded info.type
    -- A \`match\` of the file's own is shown as one: Lean needs to be told that this is what it is.
    if let some matcher := loaded.matches'[c]? then
      modify fun (s, done) => (Match.Extension.addMatcherInfo s (userName c) matcher, done)
    let type := plain info.type
    let decl := Declaration.axiomDecl { name := userName c, levelParams := info.levelParams, type, isUnsafe := false }
    if let .ok next := (← get).1.addDeclCore 0 1000 decl none false then
      modify fun (_, done) => (next, done)
where
  /-- Private names as they are written. -/
  plain (e : Expr) : Expr := e.replace fun
    | .const n ls => if isPrivateName n then some (.const (userName n) ls) else none
    | _ => none

def printed (env : Environment) (type : Expr) : IO String := do
  let mut options : Options := {}
  for (name, value) in [(\`pp.deepTerms, true), (\`pp.numericTypes, true), (\`pp.coercions.types, true),
      (\`pp.funBinderTypes, true), (\`pp.fieldNotation.generalized, false)] do
    options := options.set name value
  options := options.set \`pp.maxSteps (1000000 : Nat)
  let print : MetaM String := return (← PrettyPrinter.ppExpr type).pretty 1000000
  let (s, _) ← print.toIO { fileName := "statement", fileMap := default, options } { env }
  return s

/-- A compiled module's data (all its parts, for one written with Lean's module system), without importing it. -/
unsafe def moduleData (olean : System.FilePath) : IO ModuleData := do
  let hidden := OLeanLevel.private.adjustFileName olean
  if ← hidden.pathExists then
    let parts ← readModuleDataParts #[olean, OLeanLevel.server.adjustFileName olean, hidden]
    match parts.back? with
    | some (data, _) => return data
    | none => throw (IO.userError s!"{olean} could not be read")
  else return (← readModuleData olean).1

unsafe def main (args : List String) : IO Unit := do
  let mark :: notation' :: mod :: wanted := args | throw (IO.userError "usage")
  initSearchPath (← findSysroot)
  let target := mod.toName
  let say (j : Json) : IO Unit := IO.println s!"{mark}{j.compress}"
  let sysroot := (← findSysroot).toString.replace "\\\\" "/"
  -- The file's module and, from what it imports, the project's own; where a library's begins, it is only noted.
  let mut library : Array Import := #[]
  let mut ours : Array Name := #[]
  let mut own : Std.HashMap Name (ConstantInfo × Name) := {}
  let mut matches' : Std.HashMap Name Match.MatcherInfo := {}
  let mut declared : Array Name := #[]
  let mut seen : NameSet := NameSet.empty.insert target
  let mut queue : Array Name := #[target]
  let mut next := 0
  while h : next < queue.size do
    let m := queue[next]
    next := next + 1
    let olean ← findOLean m
    let p := olean.toString.replace "\\\\" "/"
    if m != target && (p.startsWith sysroot || (p.splitOn "/.lake/packages/").length > 1) then
      library := library.push { module := m }
      continue
    let data ← moduleData olean
    ours := ours.push m
    if m == target then declared := data.constNames
    for c in data.constNames, info in data.constants do
      own := own.insertIfNew c (info, m)
    -- What Lean notes about each \`match\`, under the name of the extension that keeps it.
    for (extension, entries) in data.entries do
      if extension == Match.Extension.extension.name then
        for entry in entries do
          let e : Match.Extension.Entry := unsafeCast entry
          matches' := matches'.insert e.name e.info
    for i in data.imports do
      unless seen.contains i.module do
        seen := seen.insert i.module
        queue := queue.push i.module
  -- The libraries, with their notation when asked: statements are printed where only that notation is.
  let env ← if notation' == "notation" then
      enableInitializersExecution
      importModules library {} (loadExts := true)
    else importModules library {}
  let loaded : Loaded := { env, own, matches' }
  for c in declared do
    if let some (.axiomInfo _) := loaded.find? c then
      unless (userName c).isInternalDetail do say (.mkObj [("axiom", .str (userName c).toString)])
  for w in wanted do
    let full := declared.filter fun c => (userName c).toString == w
    let part := if full.isEmpty then declared.filter fun c => !(userName c).isInternalDetail && (userName c).toString.endsWith ("." ++ w) else full
    if h : part.size = 1 then
      let c := part[0]
      let (_, (_, ax)) := (walk loaded c).run ({}, #[])
      let some info := loaded.find? c | throw (IO.userError s!"{w} could not be read")
      let (form, used) := statementForm loaded info.type
      let (_, (shown, _)) := (declare loaded info.type).run (env, {})
      let statement ← try printed shown (declare.plain info.type)
        -- A statement Lean cannot print is still told apart by its pin.
        catch e => pure s!"(Lean could not print it: {e})"
      say (.mkObj [("name", .str w), ("full", .str (userName c).toString), ("axioms", .arr (ax.map fun a => .str (axiomName loaded a))),
        ("statement", .str statement), ("form", .str form), ("rests", .arr ((restsOn loaded used).map fun n => .str (userName n).toString))])
    else say (.mkObj [("name", .str w), ("missing", .bool true), ("matches", .arr (part.map fun c => .str (userName c).toString))])
  for m in ours do say (.mkObj [("module", .str m.toString)])
  say (.mkObj [("done", .bool true)])
`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A theorem as it is asked for: `name`, or `name@pin` to ask as well that its statement is still the one pinned. */
export function readTheorem(spec) {
  const s = String(spec).trim();
  const at = s.lastIndexOf('@');
  // (an @ inside «…» is part of a name)
  if (at < 0 || s.indexOf('»', at) >= 0) return { name: s };
  const name = s.slice(0, at).trim();
  const pin = s.slice(at + 1).trim().toLowerCase();
  if (!name || pin.length !== PIN_LENGTH || !/^[0-9a-f]+$/.test(pin))
    throw new LeanProblem(`${JSON.stringify(s)} is not a theorem with its pin: write it as name@pin, where the pin is the ${PIN_LENGTH} characters (0-9, a-f) a verdict gave for it.`, 'pin');
  return { name, pin };
}

/** The statement on one line: Lean breaks lines only where its layout asks (match), never inside a string. */
const oneLine = (s) => {
  const t = String(s).replace(/\s*\n\s*/g, ' ').trim();
  return t.length > STATEMENT_MAX ? `${t.slice(0, STATEMENT_MAX)}… (${t.length - STATEMENT_MAX} more characters)` : t;
};
const pinOf = (form) => crypto.createHash('sha256').update(form).digest('hex').slice(0, PIN_LENGTH);
const NATIVE = /native_decide|^Lean\.(ofReduceBool|ofReduceNat|trustCompiler)$/;

/** Why one theorem's axioms are not good enough, in plain words; null when they are. */
function whyAxioms(name, axioms, allowSorry) {
  const bad = axioms.filter((a) => !STANDARD_AXIOMS.includes(a) && !(allowSorry && a === 'sorryAx'));
  if (!bad.length) return null;
  if (bad.includes('sorryAx')) return `theorem ${name} leans on a gap marked sorry (in it, or in a lemma it uses)`;
  if (bad.every((a) => NATIVE.test(a))) return `theorem ${name} uses native_decide, which trusts compiled code instead of Lean's proof checker`;
  const other = bad.filter((a) => !NATIVE.test(a));
  return `theorem ${name} leans on ${other.length === 1 ? 'an axiom that is' : 'axioms that are'} not standard: ${other.join(', ')}`;
}

/** At most this many of a project's modules are played back through the kernel. */
const RECHECK_MAX = 40;

/**
 * Whether a file's theorems are proved: it builds, nothing is left as `sorry` (unless `allowSorry`), each theorem
 * named (else each theorem and lemma of the file) depends only on the standard axioms, and the kernel accepts every
 * declaration of the file and of the project's own files it imports. Each theorem comes with its statement and pin,
 * whether or not it is proved; one asked for as `name@pin` whose statement has another pin is in `changed`, one the
 * file does not have in `missing`.
 */
export async function verifyFile(lean, file, opts = {}) {
  const t0 = Date.now();
  const o = options(opts);
  const full = path.resolve(file);
  // A pin that cannot be read is a question to put again, whatever the file holds.
  const asked = (opts.theorems ?? []).map(String).filter((t) => t.trim()).map(readTheorem);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lean-'));
  const done = (r) => ({ ...r, seconds: Math.round((Date.now() - t0) / 100) / 10 });
  const no = (why, more = {}) => done({ ok: false, why, theorems: [], sorries: [], ...more });
  try {
    const mod = `HydorCheck${crypto.randomBytes(6).toString('hex')}`;
    const c = await compile(lean, full, o, ['-o', path.join(work, `${mod}.olean`)]);
    const sorries = sorriesOf(c.scan, c.messages.sorryWarnings, c.ran && c.ok);
    if (!c.ok) {
      const first = c.messages.errors[0];
      const where = first.line ? ` (line ${first.line}${first.file ? ` of ${first.file}` : ''})` : '';
      return no(`it does not build: ${plural(Math.max(1, c.messages.count), 'error')}, the first${where}: ${first.message.split('\n')[0]}`, { errors: c.messages.errors, sorries });
    }
    const reasons = [];
    if (sorries.length && !o.allowSorry) reasons.push(`it still has ${plural(sorries.length, 'gap')} marked sorry`);
    if (c.scan.skipsKernel) reasons.push('it switches off Lean’s proof checker (debug.skipKernelTC)');
    const wanted = [...new Set((asked.length ? asked : c.scan.theorems).map((t) => t.name))];

    const env = { ...(await c.plan.env()) };
    env.LEAN_PATH = [work, env.LEAN_PATH].filter(Boolean).join(path.delimiter);
    const cwd = c.plan.root ?? path.dirname(full);
    const sys = { cwd, env, signal: o.signal, shell: o.shell };
    // The toolchain's own programs, so that leanchecker is the one of the Lean that compiled the file.
    let root = env.LEAN_SYSROOT;
    if (!root) {
      const p = await run(lean.lean, ['--print-prefix'], { ...sys, timeoutMs: o.left() });
      root = p.code === 0 ? p.stdout.trim().split('\n').pop() : undefined;
    }
    const tool = (name, fallback) => (root && fs.existsSync(path.join(root, 'bin', exe(name))) ? path.join(root, 'bin', exe(name)) : fallback);

    const mark = `HYD${crypto.randomBytes(8).toString('hex')} `;
    const audit = path.join(work, 'Audit.lean');
    fs.writeFileSync(audit, AUDIT);
    const read = async (notation) => {
      const a = await run(tool('lean', lean.lean), ['--run', audit, mark, notation, mod, ...wanted], { ...sys, timeoutMs: o.left(), maxOut: 64 * 1024 * 1024 });
      const said = a.stdout
        .split('\n')
        .filter((l) => l.startsWith(mark))
        .map((l) => JSON.parse(l.slice(mark.length)));
      return { a, said, done: said.some((x) => x.done) };
    };
    let { a, said, done: whole } = await read('notation');
    let plain = false;
    // A library whose notation cannot be loaded here: the statements by their full names, rather than no verdict.
    if (!whole && !a.timedOut && !a.aborted) {
      ({ a, said, done: whole } = await read('plain'));
      plain = whole;
    }
    if (!whole)
      return no(stopped(a, o.timeoutMs) ?? `its axioms could not be read: ${lastLines(a) || a.failed || `exit code ${a.code}`}`, { sorries });

    const theorems = [];
    const changed = [];
    const missing = [];
    // A statement that is no longer the one pinned is said before everything else.
    const changes = [];
    for (const name of wanted) {
      const x = said.find((s) => s.name === name);
      if (!x || x.missing) {
        const why = x?.matches?.length > 1 ? `more than one theorem is called ${name}: name it in full (${x.matches.join(', ')})` : `there is no theorem ${name} in this file`;
        theorems.push({ name, axioms: [], ok: false });
        missing.push(name);
        reasons.push(why);
        continue;
      }
      const axioms = [...x.axioms].sort();
      const why = whyAxioms(x.full, axioms, o.allowSorry);
      const statement = oneLine(x.statement);
      const pin = pinOf(x.form);
      const definitions = x.rests ?? [];
      const other = asked.find((t) => t.name === name && t.pin && t.pin !== pin);
      theorems.push({ name: x.full, axioms, ok: !why && !other, statement, pin, ...(definitions.length ? { definitions } : {}) });
      if (other) {
        changed.push(x.full);
        const rests = definitions.length ? ` (the pin covers the definitions of its own that it rests on too: ${definitions.join(', ')})` : '';
        changes.push(`${x.full} no longer says what was agreed: its statement changed (it was pinned as ${other.pin}, it is now ${pin})${rests}. It now says: ${statement}`);
      }
      if (why && !(sorries.length && !o.allowSorry && axioms.includes('sorryAx'))) reasons.push(why);
    }
    reasons.unshift(...changes);
    if (!wanted.length) reasons.push('there is no theorem or lemma in it to check');

    const notes = [];
    if (plain) notes.push('The statements are written without notation, every part by its full name: the libraries’ notation could not be loaded.');
    const added = said.filter((s) => s.axiom).map((s) => s.axiom);
    if (added.length) notes.push(`The file declares ${added.length === 1 ? 'an axiom' : 'axioms'} of its own: ${added.join(', ')}.`);
    const modules = said.filter((s) => s.module).map((s) => s.module);
    const checker = tool('leanchecker', null);
    if (!checker) notes.push('This version of Lean has no leanchecker, so the declarations were not played back through the kernel.');
    else {
      if (modules.length > RECHECK_MAX) notes.push(`Only ${RECHECK_MAX} of the project's ${modules.length} files were played back through the kernel.`);
      for (const m of [mod, ...modules.filter((m) => m !== mod)].slice(0, RECHECK_MAX)) {
        const k = await run(checker, [m], { ...sys, timeoutMs: o.left() });
        if (k.code === 0) continue;
        // leanchecker's own words, from the kernel's on ("(kernel) declaration type mismatch, 'x' has type …").
        const out = `${k.stderr}\n${k.stdout}`;
        const at = out.indexOf('(kernel)');
        const said = (at >= 0 ? out.slice(at + '(kernel)'.length) : lastLines(k, 3)).replaceAll(mod, 'the file').replace(/\s+/g, ' ').trim().slice(0, 200);
        reasons.push(stopped(k, o.timeoutMs) ?? `Lean's kernel does not accept ${m === mod ? 'this file' : `the file ${m} it imports`}: a declaration was put in without being checked (${said})`);
        for (const t of theorems) t.ok = false;
        break;
      }
    }

    const ok = !reasons.length && theorems.every((t) => t.ok);
    const why = reasons.length > 4 ? `${reasons.slice(0, 4).join('; ')}; and ${reasons.length - 4} more` : reasons.join('; ');
    return done({
      ok,
      ...(ok ? {} : { why }),
      theorems,
      ...(changed.length ? { changed } : {}),
      ...(missing.length ? { missing } : {}),
      sorries,
      ...(notes.length ? { note: notes.join(' ') } : {}),
    });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

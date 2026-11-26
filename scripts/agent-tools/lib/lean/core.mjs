// What Hydor knows about running Lean, in one place: the server's tools (server/lean) and the `leancheck` command
// (cli.mjs, beside this file) both use it, so the verdict is the same whoever asks. Finding Lean, running it with a
// time limit, reading its messages, and the verdict itself.
//
// The verdict does not trust what the file under test can change. `#print axioms` can be redefined by the file's own
// `macro_rules`, and `set_option debug.skipKernelTC true` puts in a proof the kernel never saw (both seen with
// Lean 4.36). So the file is compiled on its own, its theorems' axioms are then read by a small program of ours
// (AUDIT) that loads the compiled file without running any of its syntax, and Lean's own `leanchecker` plays every
// declaration back through the kernel.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STANDARD_AXIOMS = ['propext', 'Classical.choice', 'Quot.sound'];

/** Imports that only Mathlib's project has (Mathlib and the libraries it brings). */
const MATHLIB_LIBS = /^(Mathlib|Batteries|Aesop|Qq|ProofWidgets|Plausible|ImportGraph|LeanSearchClient)(\.|$)/;

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
export function run(cmd, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, signal, shell, onLine } = {}) {
  const MAX_OUT = 6 * 1024 * 1024;
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
      if (stdout.length < MAX_OUT) stdout += d;
      lines(d);
    });
    child.stderr.setEncoding('utf8').on('data', (d) => {
      stderr = (stderr + d).slice(-MAX_OUT);
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

// ---- Lean's messages ----------------------------------------------------------------------------------------------

const MESSAGE_MAX = 2000;
/** The goals Lean prints are kept longer: they are what the next step is worked out from. */
const GOALS_MAX = 6000;
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

export const NEEDS_MATHLIB = 'This imports Mathlib, which is not set up: add it in Settings → General → Lean (proof checker) → Add Mathlib (several gigabytes), or ask with lean_setup { mathlib: true }.';

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
 * Run with `lean --run`: loads a compiled module without running any of its syntax or code, then reports, for each
 * name asked, the axioms it depends on (walking every constant it uses, as `#print axioms` does), the axioms the
 * module declares, and which of the modules loaded are neither Lean's nor a downloaded library's.
 */
export const AUDIT = `import Lean
open Lean

partial def walk (env : Environment) (c : Name) : StateM (NameSet × Array Name) Unit := do
  if (← get).1.contains c then return
  modify fun (s, a) => (s.insert c, a)
  let expr (e : Expr) : StateM (NameSet × Array Name) Unit := e.getUsedConstants.forM (walk env)
  match env.find? c with
  | some (.axiomInfo v) =>
    modify fun (s, a) => (s, a.push c)
    expr v.type
  | some (.defnInfo v) => expr v.type; expr v.value
  | some (.thmInfo v) => expr v.type; expr v.value
  | some (.opaqueInfo v) => expr v.type; expr v.value
  | some (.quotInfo _) => pure ()
  | some (.ctorInfo v) => expr v.type
  | some (.recInfo v) => expr v.type
  | some (.inductInfo v) => expr v.type; v.ctors.forM (walk env)
  | none => pure ()

def userName (n : Name) : Name := (privateToUserName? n).getD n

/-- An axiom by its name; one that only looks standard says which file declared it. -/
def axiomName (env : Environment) (a : Name) : String :=
  let name := (userName a).toString
  let home := (env.getModuleIdxFor? a).map fun i => env.header.moduleNames[i.toNat]!
  let core := match home with
    | some m => m.getRoot == \`Init
    | none => false
  if (name == "propext" || name == "Classical.choice" || name == "Quot.sound") && !core then
    s!"{name} (declared in {home.getD Name.anonymous})"
  else name

def main (args : List String) : IO Unit := do
  let mark :: mod :: wanted := args | throw (IO.userError "usage")
  initSearchPath (← findSysroot)
  let target := mod.toName
  let env ← importModules #[{ module := target }] {}
  let some idx := env.getModuleIdx? target | throw (IO.userError "the module was not loaded")
  let own := env.header.moduleData[idx.toNat]!.constNames
  let say (j : Json) : IO Unit := IO.println s!"{mark}{j.compress}"
  for c in own do
    if let some (.axiomInfo _) := env.find? c then
      unless (userName c).isInternalDetail do say (.mkObj [("axiom", .str (userName c).toString)])
  for w in wanted do
    let full := own.filter fun c => (userName c).toString == w
    let part := if full.isEmpty then own.filter fun c => !(userName c).isInternalDetail && (userName c).toString.endsWith ("." ++ w) else full
    if h : part.size = 1 then
      let c := part[0]
      let (_, (_, ax)) := (walk env c).run ({}, #[])
      say (.mkObj [("name", .str w), ("full", .str (userName c).toString), ("axioms", .arr (ax.map fun a => .str (axiomName env a)))])
    else say (.mkObj [("name", .str w), ("missing", .bool true), ("matches", .arr (part.map fun c => .str (userName c).toString))])
  let sysroot := (← findSysroot).toString
  for m in env.header.moduleNames do
    let f ← try some <$> findOLean m catch _ => pure none
    if let some f := f then
      let p := (f.toString.replace "\\\\" "/")
      unless p.startsWith (sysroot.replace "\\\\" "/") || (p.splitOn "/.lake/packages/").length > 1 do
        say (.mkObj [("module", .str m.toString)])
  say (.mkObj [("done", .bool true)])
`;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
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
 * declaration of the file and of the project's own files it imports.
 */
export async function verifyFile(lean, file, opts = {}) {
  const t0 = Date.now();
  const o = options(opts);
  const full = path.resolve(file);
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
    const wanted = [...new Set((o.theorems?.length ? o.theorems : c.scan.theorems.map((t) => t.name)).map((t) => String(t).trim()).filter(Boolean))];

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
    const a = await run(tool('lean', lean.lean), ['--run', audit, mark, mod, ...wanted], { ...sys, timeoutMs: o.left() });
    const said = a.stdout
      .split('\n')
      .filter((l) => l.startsWith(mark))
      .map((l) => JSON.parse(l.slice(mark.length)));
    if (!said.some((x) => x.done))
      return no(stopped(a, o.timeoutMs) ?? `its axioms could not be read: ${lastLines(a) || a.failed || `exit code ${a.code}`}`, { sorries });

    const theorems = [];
    for (const name of wanted) {
      const x = said.find((s) => s.name === name);
      if (!x || x.missing) {
        const why = x?.matches?.length > 1 ? `more than one theorem is called ${name}: name it in full (${x.matches.join(', ')})` : `there is no theorem ${name} in this file`;
        theorems.push({ name, axioms: [], ok: false });
        reasons.push(why);
        continue;
      }
      const axioms = [...x.axioms].sort();
      const why = whyAxioms(x.full, axioms, o.allowSorry);
      theorems.push({ name: x.full, axioms, ok: !why });
      if (why && !(sorries.length && !o.allowSorry && axioms.includes('sorryAx'))) reasons.push(why);
    }
    if (!wanted.length) reasons.push('there is no theorem or lemma in it to check');

    const notes = [];
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
    return done({ ok, ...(ok ? {} : { why }), theorems, sorries, ...(notes.length ? { note: notes.join(' ') } : {}) });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

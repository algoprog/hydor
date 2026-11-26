// A stand-in for lean, lake and leanchecker, for tests on computers without Lean: `node standin.mjs <tool> args…`
// (tests write small `lean`, `lake` and `leanchecker` scripts that call it). What it prints is what Lean 4.36 printed
// for the same case, recorded from the real programs; what happens is read from words in the file it is given:
//   2 + 2 = 5        decide fails           -- unsolved      unsolved goals
//   sorry            a warning, sorryAx     #check           an information message
//   my_axiom         that axiom             native_decide    its axiom
//   Classical        the standard ones      skipKernelTC     leanchecker refuses
//   -- slow          never ends             import Broken    the build of an import fails
//   import Mathlib   fails unless Mathlib's search path is there
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [tool, ...args] = process.argv.slice(2);
const ROOT = process.env.STANDIN_ROOT;
const VERSION = 'Lean (version 4.36.0, x86_64-unknown-linux-gnu, commit 611c117bfaf7b7ae1cfcf246ce6fba31e8f509e9, Release)';

const msg = (file, severity, kind, line, column, data) =>
  JSON.stringify({ caption: '', data, endPos: { column: column + 3, line }, fileName: file, isSilent: false, keepFullRange: false, kind, pos: { column, line }, severity });

const code = (text) => text.split('\n').map((l) => l.replace(/--.*$/, ''));

/** The declarations of a source: name, kind and the text of each. */
function decls(text) {
  const out = [];
  const ns = [];
  let open = null;
  for (const l of text.split('\n')) {
    const n = /^namespace (\S+)/.exec(l);
    const e = /^end (\S+)/.exec(l);
    const d = /^(?:@\[[^\]]*\] )?(?:private )?(theorem|lemma|axiom|def|example)\s*([^\s({:]*)/.exec(l);
    if (n) ns.push(n[1]);
    else if (e) ns.pop();
    else if (d) out.push((open = { kind: d[1], name: [...ns, d[2]].filter(Boolean).join('.'), text: l }));
    else if (open) open.text += `\n${l}`;
  }
  return out;
}

function lean(argv, cwd = process.cwd()) {
  if (argv[0] === '--version') return console.log(VERSION), 0;
  if (argv[0] === '--print-prefix') return console.log(ROOT), 0;
  if (argv[0] === '--run') return audit(argv.slice(2));
  const out = argv.includes('-o') ? argv[argv.indexOf('-o') + 1] : null;
  const file = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '-o').pop();
  const text = fs.readFileSync(path.resolve(cwd, file), 'utf8');
  const lines = text.split('\n');
  const said = [];
  if (/-- slow/.test(text)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120_000);
  lines.forEach((l, i) => {
    const at = i + 1;
    const bare = l.replace(/--.*$/, '');
    if (/^import Mathlib/.test(l) && !(process.env.LEAN_PATH ?? '').includes('mathlib'))
      said.push(msg(file, 'error', '[anonymous]', 1, 0, `unknown module prefix 'Mathlib'\n\nNo directory 'Mathlib' or file 'Mathlib.olean' in the search path entries:\n${ROOT}/lib/lean`));
    if (bare.includes('2 + 2 = 5')) said.push(msg(file, 'error', '[anonymous]', at, bare.indexOf('decide'), 'Tactic `decide` proved that the proposition\n  2 + 2 = 5\nis false'));
    if (/-- unsolved/.test(l)) said.push(msg(file, 'error', 'Tactic.unsolvedGoals', at, 2, 'unsolved goals\ncase right\na b : Nat\nh : 0 < a\n⊢ a < a + b'));
    if (/\bsorry\b/.test(bare)) said.push(msg(file, 'warning', 'hasSorry', lines.slice(0, at).findLastIndex((x) => /^(theorem|lemma|example|def)/.test(x)) + 1 || at, 8, 'declaration uses `sorry`'));
    if (bare.startsWith('#check')) said.push(msg(file, 'information', '[anonymous]', at, 0, 'Nat.add_comm (n m : Nat) : n + m = m + n'));
  });
  for (const s of said) console.log(s);
  const failed = said.some((s) => s.includes('"severity":"error"'));
  if (out && !failed) fs.writeFileSync(out, text);
  return failed ? 1 : 0;
}

/** The compiled stand-in of a module: its source, on the search path. */
function compiled(mod) {
  for (const dir of (process.env.LEAN_PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const f = path.join(dir, `${mod.replaceAll('.', '/')}.olean`);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  }
  return null;
}

function audit([mark, mod, ...names]) {
  const text = compiled(mod);
  if (text == null) return console.error(`uncaught exception: unknown module ${mod}`), 1;
  const all = decls(code(text).join('\n'));
  const say = (x) => console.log(mark + JSON.stringify(x));
  for (const d of all) if (d.kind === 'axiom') say({ axiom: d.name });
  for (const name of names) {
    let found = all.filter((d) => d.name === name);
    if (!found.length) found = all.filter((d) => d.name.endsWith(`.${name}`));
    if (found.length !== 1) {
      say({ name, missing: true, matches: found.map((d) => d.name) });
      continue;
    }
    const t = found[0].text;
    const axioms = [
      ...(/\bsorry\b/.test(t) ? ['sorryAx'] : []),
      ...(t.includes('my_axiom') ? ['my_axiom'] : []),
      ...(t.includes('native_decide') ? ['native._native.native_decide.ax_1_1'] : []),
      ...(t.includes('Classical') ? ['propext', 'Classical.choice', 'Quot.sound'] : []),
    ];
    say({ name, full: found[0].name, axioms });
  }
  say({ module: mod });
  for (const m of text.matchAll(/^import (Proofs\.\S+)/gm)) say({ module: m[1] });
  say({ done: true });
  return 0;
}

function leanchecker([mod]) {
  const text = compiled(mod);
  if (text?.includes('skipKernelTC')) {
    console.error(`leanchecker found a problem in ${mod}\nuncaught exception: while replaying declaration 'skipped':\n(kernel) declaration type mismatch, 'skipped' has type\n  True\nbut it is expected to have type\n  Eq 1 2`);
    return 1;
  }
  return 0;
}

function lake(argv) {
  const [command, ...rest] = argv;
  if (command === '--version') return console.log('Lake version 5.0.0-src+611c117 (Lean version 4.36.0)'), 0;
  const root = process.cwd();
  const searched = [path.join(root, '.lake', 'build', 'lib', 'lean'), ...(fs.existsSync(path.join(root, '.lake', 'packages', 'mathlib', 'built')) ? [path.join(root, '.lake', 'packages', 'mathlib', 'lib')] : [])];
  const env = { ...process.env, LEAN_SYSROOT: ROOT, LEAN_PATH: [...searched, process.env.LEAN_PATH].filter(Boolean).join(path.delimiter) };
  if (command === 'env') {
    const r = spawnSync(rest[0], rest.slice(1), { env, stdio: 'inherit' });
    return r.status ?? 1;
  }
  if (command === 'lean') {
    const [file, , ...more] = rest;
    const text = fs.readFileSync(file, 'utf8');
    if (/^import Broken/m.test(text)) {
      console.error('✖ [2/4] Building Broken (145ms)\ntrace: .> LEAN_PATH=…\nerror: Broken.lean:1:25: Type mismatch\n  rfl\nhas type\n  ?m.8 = ?m.8\nbut is expected to have type\n  1 = 2\nSome required targets logged failures:\n- Broken\nerror: build failed');
      return 1;
    }
    Object.assign(process.env, env);
    return lean([...more, file]);
  }
  const fail = (what) => (process.env.STANDIN_FAIL ?? (fs.existsSync(path.join(ROOT, 'fail')) ? fs.readFileSync(path.join(ROOT, 'fail'), 'utf8') : '')) === what;
  if (command === 'update') {
    console.log('info: mathlib: cloning https://github.com/leanprover-community/mathlib4.git');
    if (fail('update')) return console.error('error: external command git exited with code 128\nfatal: unable to access the repository'), 1;
    fs.mkdirSync(path.join(root, '.lake', 'packages', 'mathlib'), { recursive: true });
    return 0;
  }
  if (command === 'exe' && rest.join(' ') === 'cache get') {
    console.log('Attempting to download 6000 file(s) from leanprover-community/mathlib4 cache');
    if (process.env.MATHLIB_CACHE_DIR) fs.mkdirSync(process.env.MATHLIB_CACHE_DIR, { recursive: true });
    if (fail('cache')) return console.error('error: some files were not downloaded'), 1;
    fs.writeFileSync(path.join(root, '.lake', 'packages', 'mathlib', 'built'), '');
    return 0;
  }
  return console.error(`error: unknown command ${argv.join(' ')}`), 1;
}

process.exitCode = { lean, lake, leanchecker }[tool](args);

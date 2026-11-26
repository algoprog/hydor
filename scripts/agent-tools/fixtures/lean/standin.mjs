// A stand-in for lean, lake and leanchecker, for tests on computers without Lean: `node standin.mjs <tool> args…`
// (tests write small `lean`, `lake` and `leanchecker` scripts that call it). What it prints is what Lean 4.36 printed
// for the same case, recorded from the real programs; what happens is read from words in the file it is given:
//   2 + 2 = 5        decide fails           -- unsolved      unsolved goals
//   sorry            a warning, sorryAx     #check           an information message
//   my_axiom         that axiom             native_decide    its axiom
//   Classical        the standard ones      skipKernelTC     leanchecker refuses
//   -- slow          never ends             import Broken    the build of an import fails
//   import Mathlib   fails unless Mathlib's search path is there
//   #check @…gone    an unknown identifier (as of a name that is not in the library)
//   -- no notation   the audit cannot load the libraries' notation, only read without it
// What a theorem states is worked out from its text, for the simple shapes the tests use, as Lean 4.36 printed them.
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
    const gone = /^#check @(\S*gone\S*)/.exec(bare);
    if (gone) said.push(msg(file, 'error', 'lean.unknownIdentifier', at, 8, `Unknown identifier \`${gone[1]}\``));
    else if (bare.startsWith('#check')) said.push(msg(file, 'information', '[anonymous]', at, 0, 'Nat.add_comm (n m : Nat) : n + m = m + n'));
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

/**
 * What a theorem states, for `theorem name (x : T) … : P := proof` and the like: as the real audit prints it (numbers
 * with their types, a hypothesis nothing names as an arrow), its form with the names of variables left out and each
 * definition of the file's own written as what it says, and those definitions' names.
 */
function stated(d, all) {
  let rest = d.text.split(':=')[0].replace(/^.*?\b(?:theorem|lemma|axiom|def|example)\b\s*[^\s({:]*/, '').replace(/\s+/g, ' ').trim();
  const binders = [];
  while (rest.startsWith('(')) {
    let depth = 0;
    let end = 0;
    for (; end < rest.length; end++) {
      if (rest[end] === '(') depth++;
      else if (rest[end] === ')' && --depth === 0) break;
    }
    const [names, ...type] = rest.slice(1, end).split(':');
    for (const name of names.trim().split(' ')) binders.push({ name, type: type.join(':').trim() });
    rest = rest.slice(end + 1).trim();
  }
  const numbers = (s) => s.replace(/(?<![\p{L}\p{N}_.])(\d+)(?![\p{L}\p{N}_.])/gu, '($1 : Nat)');
  const word = (name) => new RegExp(`(?<![\\p{L}\\p{N}_.])${name}(?![\\p{L}\\p{N}_.])`, 'gu');
  let statement = numbers(rest.replace(/^:/, '').trim());
  let form = statement;
  [...binders].reverse().forEach(({ name, type }, i) => {
    const used = word(name).test(statement);
    statement = used ? `∀ (${name} : ${type}), ${statement}` : `${numbers(type)} → ${statement}`;
    form = `∀ ${numbers(type)}, ${used ? form.replace(word(name), `#${i}`) : form}`;
  });
  const rests = all.filter((x) => x.kind === 'def' && x.name && word(x.name).test(statement));
  rests.forEach((x, i) => {
    form = `${form.replace(word(x.name), `o${i}`)} ; o${i} = ${x.text.slice(x.text.indexOf(x.name) + x.name.length).replace(/\s+/g, ' ').trim()}`;
  });
  return { statement, form, rests: rests.map((x) => x.name) };
}

function audit([mark, notation, mod, ...names]) {
  const text = compiled(mod);
  if (notation === 'notation' && text?.includes('-- no notation')) return console.error('uncaught exception: (interpreter) unknown declaration'), 1;
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
    say({ name, full: found[0].name, axioms, ...stated(found[0], all) });
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
  const cacheGet = () => {
    console.log('Current branch: HEAD\nUsing cache from origin: (some leanprover-community/mathlib4)');
    console.log('Attempting to download 9117 file(s) from leanprover-community/mathlib4 cache at https://cache.mathlib.org/mathlib4-master');
    if (process.env.MATHLIB_CACHE_DIR) fs.mkdirSync(process.env.MATHLIB_CACHE_DIR, { recursive: true });
    if (fail('cache')) return console.error('error: some files were not downloaded'), 1;
    process.stdout.write('Downloaded: 5120 file(s) [attempted 5120/9117 = 56%, 1897 KB/s]\rDownloaded: 9117 file(s) [attempted 9117/9117 = 100%, 812 KB/s]\r\n');
    console.log('Decompressed 9117 file(s)');
    fs.writeFileSync(path.join(root, '.lake', 'packages', 'mathlib', 'built'), '');
    return 0;
  };
  if (command === 'update') {
    console.log(`info: ${path.basename(root)}: no previous manifest, creating one from scratch\ninfo: mathlib: materializing new dependency`);
    console.log("info: mathlib: fetching revision 'stable' from https://github.com/leanprover-community/mathlib4.git");
    if (fail('update')) return console.error('error: external command git exited with code 128\nfatal: unable to access the repository'), 1;
    fs.mkdirSync(path.join(root, '.lake', 'packages', 'mathlib'), { recursive: true });
    console.log('info: toolchain not updated; already up-to-date\ninfo: mathlib: running post-update hooks');
    // Mathlib's hook: the built files are fetched here too, unless told not to.
    return process.env.MATHLIB_NO_CACHE_ON_UPDATE === '1' ? 0 : cacheGet();
  }
  if (command === 'exe' && rest.join(' ') === 'cache get') return cacheGet();
  return console.error(`error: unknown command ${argv.join(' ')}`), 1;
}

process.exitCode = { lean, lake, leanchecker }[tool](args);

// leancheck as agents and goals run it: its help without Lean, usage, no Lean at all, and its exit codes and report
// against stand-in `lake` and `lean` programs (fixtures/lean/standin.mjs). The verdict itself is also tested through
// the app's tools (server/lean/lean-test.ts), and against a real Lean there.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LEANCHECK = path.join(HERE, '..', 'bin', 'leancheck');
const STANDIN = path.join(HERE, '..', 'fixtures', 'lean', 'standin.mjs');
const WIN = process.platform === 'win32';
let ROOT;
let BIN;

before(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'leancheck-test-'));
  BIN = path.join(ROOT, 'sysroot', 'bin');
  fs.mkdirSync(BIN, { recursive: true });
  for (const t of ['lean', 'lake', 'leanchecker'])
    fs.writeFileSync(path.join(BIN, t), `#!/bin/sh\nSTANDIN_ROOT='${path.join(ROOT, 'sysroot')}' exec '${process.execPath}' '${STANDIN}' ${t} "$@"\n`, { mode: 0o755 });
});
after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

const run = (args, env = {}) => {
  const r = spawnSync(process.execPath, [LEANCHECK, ...args], { cwd: ROOT, encoding: 'utf8', env: { PATH: `${BIN}:/usr/bin:/bin`, HOME: ROOT, HYDOR_LEAN_DIR: path.join(ROOT, 'none'), ...env } });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const lean = (name, text) => {
  fs.writeFileSync(path.join(ROOT, name), text);
  return name;
};

test('--help works without Lean, and usage errors are 64', () => {
  const h = run(['--help'], { PATH: '/nowhere' });
  assert.equal(h.code, 0);
  assert.match(h.out, /^leancheck - whether the proofs in a Lean file really hold\./);
  assert.match(h.out, /--theorem NAME@PIN/);
  assert.match(h.out, /Exit codes:\n {2}0 {3}verified\n {2}1 {3}not verified: [^\n]*\n {2}2 {3}the question is wrong or cannot be put: no such file, no such theorem, a malformed pin, no Lean\n {2}3 {3}a statement changed from its pin\n {2}64 {2}usage\n/);
  for (const args of [[], ['--nope', 'a.lean'], ['a.lean', 'b.lean'], ['a.lean', '--theorem'], ['a.lean', '--timeout', 'soon']]) assert.equal(run(args).code, 64, args.join(' '));
});

test('without Lean: exit 2 and where to set it up', () => {
  const r = run([lean('Fine.lean', 'theorem t : True := trivial\n')], { PATH: '/nowhere' });
  assert.equal(r.code, 2);
  assert.match(r.err, /Lean is not set up on this computer: set it up in Hydor’s Settings → General → Lean/);
});

test('verified: 0, with each theorem, what it states, its pin and its axioms', { skip: WIN }, () => {
  const r = run([lean('Good.lean', 'namespace A\ntheorem t : True := trivial\ntheorem u : True := Classical.byContradiction (fun h => h trivial)\nend A\n')]);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /ok {3}A\.t@[0-9a-f]{12} : True {2}\(no axioms\)/);
  assert.match(r.out, /ok {3}A\.u@[0-9a-f]{12} : True {2}\(axioms: Classical\.choice, Quot\.sound, propext\)/);
  assert.match(r.out, /\nVERIFIED \([\d.]+ s\)\n$/);
});

test('not verified: 1, the reason on the last line', { skip: WIN }, () => {
  for (const [name, text, why] of [
    ['False.lean', 'theorem bad : 2 + 2 = 5 := by decide\n', /it does not build: 1 error, the first \(line 1\): Tactic `decide` proved/],
    ['Gap.lean', 'theorem gap : True := by\n  sorry\n', /it still has 1 gap marked sorry/],
    ['Axiom.lean', 'axiom my_axiom : False\ntheorem foo : 1 = 2 := my_axiom.elim\n', /theorem foo leans on an axiom that is not standard: my_axiom/],
    ['Empty.lean', 'def x := 1\n', /there is no theorem or lemma in it to check/],
  ]) {
    const r = run([lean(name, text)]);
    assert.equal(r.code, 1, `${name}: ${r.out}${r.err}`);
    assert.match(r.out.trim().split('\n').pop(), why, name);
  }
});

test('--theorem checks only those named, --allow-sorry passes a skeleton and says it is not proved', { skip: WIN }, () => {
  const f = lean('Two.lean', 'theorem done : True := trivial\ntheorem open_one : True := by\n  sorry\n');
  assert.equal(run([f]).code, 1);
  const only = run([f, '--theorem', 'done']);
  assert.equal(only.code, 1, 'a gap anywhere in the file still fails it');
  const allowed = run([f, '--allow-sorry']);
  assert.equal(allowed.code, 0, allowed.out);
  assert.match(allowed.out, /OK, WITH GAPS ALLOWED: 1 marked sorry, so it is not proved yet/);
  // A theorem that still has its gap is let through, and called a gap, never ok.
  assert.match(allowed.out, /\n {2}ok {3}done@[0-9a-f]{12} : True {2}\(no axioms\)\n {2}gap {2}open_one@[0-9a-f]{12} : True {2}\(axioms: sorryAx\)\n/);
  assert.doesNotMatch(allowed.out, /ok {2,}open_one/);
  const missing = run([f, '--allow-sorry', '--theorem', 'nothing_here']);
  assert.equal(missing.code, 2, 'no such theorem: the question is wrong');
  assert.match(missing.out, /there is no theorem nothing_here in this file/);
  const j = JSON.parse(run([f, '--allow-sorry', '--json', '--theorem=done']).out);
  assert.match(j.theorems[0].pin, /^[0-9a-f]{12}$/);
  assert.deepEqual(j.theorems, [{ name: 'done', axioms: [], ok: true, statement: 'True', pin: j.theorems[0].pin }]);
});

/** The theorem `bound` as agreed, in a file of its own: its pin, and what a verdict says it states. */
const BOUND = 'theorem bound (n : Nat) (h : 0 < n) : n < n + 1 := by\n  omega\n';
const said = (name, text) => JSON.parse(run([lean(name, text), '--json', '--allow-sorry']).out).theorems[0];

test('a statement and a pin for each theorem, whether or not it is proved', { skip: WIN }, () => {
  const f = lean('Open.lean', 'def twice (k : Nat) : Nat := k * 2\ntheorem a (n : Nat) : twice n = n * 2 := by\n  sorry\ntheorem b : 2 + 2 = 4 := by decide\n');
  const r = run([f]);
  assert.equal(r.code, 1, 'not proved yet');
  assert.match(r.out, /\n {2}FAIL a@[0-9a-f]{12} : ∀ \(n : Nat\), twice n = n \* \(2 : Nat\) {2}\(axioms: sorryAx\)\n {7}rests on its own definitions: twice\n/);
  assert.match(r.out, /\n {2}ok {3}b@[0-9a-f]{12} : \(2 : Nat\) \+ \(2 : Nat\) = \(4 : Nat\) {2}\(no axioms\)\n/);
  const v = JSON.parse(run([f, '--json']).out);
  assert.deepEqual(v.theorems.map((t) => [t.name, t.statement, t.definitions]), [['a', '∀ (n : Nat), twice n = n * (2 : Nat)', ['twice']], ['b', '(2 : Nat) + (2 : Nat) = (4 : Nat)', undefined]]);
  assert.ok(v.theorems.every((t) => /^[0-9a-f]{12}$/.test(t.pin)) && v.theorems[0].pin !== v.theorems[1].pin);
});

test('the pin stays through reformatting and a renamed variable, and changes with the statement', { skip: WIN }, () => {
  const agreed = said('Agreed.lean', BOUND);
  assert.equal(agreed.statement, '∀ (n : Nat), (0 : Nat) < n → n < n + (1 : Nat)');
  const same = said('Same.lean', '-- laid out otherwise, other names\ntheorem bound\n    (m : Nat)\n    (pos : 0 < m) :\n    m < m + 1 := by omega\n');
  assert.equal(same.pin, agreed.pin);
  assert.equal(same.statement, '∀ (m : Nat), (0 : Nat) < m → m < m + (1 : Nat)');
  for (const [what, text] of [
    ['an added hypothesis', 'theorem bound (n : Nat) (h : 0 < n) (h2 : n < 10) : n < n + 1 := by\n  omega\n'],
    ['a changed constant', 'theorem bound (n : Nat) (h : 0 < n) : n < n + 2 := by\n  omega\n'],
    ['a changed conclusion', 'theorem bound (n : Nat) (h : 0 < n) : n ≤ n + 1 := by\n  omega\n'],
  ]) assert.notEqual(said('Other.lean', text).pin, agreed.pin, what);
});

test('name@pin: verified while the statement is the pinned one; 3 and its own sentence when it changed', { skip: WIN }, () => {
  const { pin } = said('Pinned.lean', BOUND);
  const f = lean('Pinned.lean', BOUND);
  for (const args of [['--theorem', `bound@${pin}`], [`--theorem=bound@${pin.toUpperCase()}`]]) {
    const ok = run([f, ...args]);
    assert.equal(ok.code, 0, ok.out + ok.err);
    assert.match(ok.out, /\nVERIFIED \(/);
  }
  const weaker = lean('Pinned.lean', 'theorem bound (n : Nat) (h : 0 < n) : n ≤ n + 1 := by\n  omega\n');
  assert.equal(run([weaker]).code, 0, 'it is proved; only the pin tells it is not what was agreed');
  const r = run([weaker, '--theorem', `bound@${pin}`]);
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /\n {2}FAIL bound \(not the statement that was pinned\) : /);
  const last = r.out.trim().split('\n').pop();
  const now = said('Now.lean', 'theorem bound (n : Nat) (h : 0 < n) : n ≤ n + 1 := by\n  omega\n').pin;
  assert.ok(last.startsWith(`NOT VERIFIED: bound no longer says what was agreed: its statement changed (it was pinned as ${pin}, it is now ${now}). It now says: ∀ (n : Nat), (0 : Nat) < n → n ≤ n + (1 : Nat) (`), last);
  const j = JSON.parse(run([weaker, '--theorem', `bound@${pin}`, '--json']).out);
  assert.deepEqual([j.ok, j.changed, j.theorems[0].ok], [false, ['bound'], false]);
  // With a gap as well, the change is still what is said first, and what the exit says.
  const both = run([lean('Pinned.lean', 'theorem bound (n : Nat) : n < n + 1 := by\n  sorry\n'), '--theorem', `bound@${pin}`, '--allow-sorry']);
  assert.equal(both.code, 3, both.out);
  assert.match(both.out, /NOT VERIFIED: bound no longer says what was agreed/);
});

test('without the libraries’ notation the verdict still comes, and says so; the pin is the same', { skip: WIN }, () => {
  const { pin } = said('Notation.lean', BOUND);
  const r = run([lean('Notation.lean', `-- no notation\n${BOUND}`), '--theorem', `bound@${pin}`]);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /\n {2}The statements are written without notation, every part by its full name: /);
});

test('a definition the statement rests on is part of the pin', { skip: WIN }, () => {
  const text = (k) => `def twice (n : Nat) : Nat := n * ${k}\ntheorem t : twice 0 = 0 := by decide\n`;
  const { pin } = said('Def.lean', text(2));
  const r = run([lean('Def.lean', text(3)), '--theorem', `t@${pin}`]);
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, new RegExp(`t no longer says what was agreed: its statement, or one of its own definitions that it rests on \\(twice\\), changed \\(it was pinned as ${pin}, it is now [0-9a-f]{12}\\)\\. A statement can read the same and say something else once a definition under it has changed\\. It now says: twice \\(0 : Nat\\) = \\(0 : Nat\\)`));
});

test('exit 2: the question is wrong (no such file, no such theorem, a malformed pin)', { skip: WIN }, () => {
  const f = lean('Q.lean', BOUND);
  for (const bad of ['bound@', 'bound@123', `bound@${'z'.repeat(12)}`, '@0123456789ab', 'bound@0123456789abc']) {
    const r = run([f, '--theorem', bad]);
    assert.equal(r.code, 2, `${bad}: ${r.out}${r.err}`);
    assert.match(r.err, /is not a theorem with its pin: write it as name@pin, where the pin is the 12 characters/, bad);
  }
  for (const gone of ['gone', 'gone@0123456789ab']) {
    const r = run([f, '--theorem', gone]);
    assert.equal(r.code, 2, `${gone}: ${r.out}${r.err}`);
    assert.match(r.out, /NOT VERIFIED: there is no theorem gone in this file/, gone);
  }
  assert.equal(run(['Nope.lean', '--theorem', 'bound@0123456789ab']).code, 2);
});

test('no such file: 2', { skip: WIN }, () => {
  const r = run(['Nope.lean']);
  assert.equal(r.code, 2);
  assert.match(r.err, /There is no file/);
});

test('the app’s own Lean, found through HYDOR_LEAN_DIR when there is none on PATH', { skip: WIN }, () => {
  const dir = path.join(ROOT, 'app-lean');
  fs.mkdirSync(path.join(dir, 'elan', 'bin'), { recursive: true });
  for (const t of ['lean', 'lake', 'leanchecker']) fs.copyFileSync(path.join(BIN, t), path.join(dir, 'elan', 'bin', t));
  const f = lean('Mine.lean', 'theorem t : True := trivial\n');
  assert.equal(run([f], { PATH: '/usr/bin:/bin', HYDOR_LEAN_DIR: dir }).code, 2, 'not before its set-up finished');
  fs.writeFileSync(path.join(dir, 'ready'), '4.36.0\n');
  const r = run([f], { PATH: '/usr/bin:/bin', HYDOR_LEAN_DIR: dir });
  assert.equal(r.code, 0, r.out + r.err);
});

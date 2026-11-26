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
  assert.match(h.out, /Exit: 0 verified, 1 not verified, 2 it could not be checked/);
  for (const args of [[], ['--nope', 'a.lean'], ['a.lean', 'b.lean'], ['a.lean', '--theorem'], ['a.lean', '--timeout', 'soon']]) assert.equal(run(args).code, 64, args.join(' '));
});

test('without Lean: exit 2 and where to set it up', () => {
  const r = run([lean('Fine.lean', 'theorem t : True := trivial\n')], { PATH: '/nowhere' });
  assert.equal(r.code, 2);
  assert.match(r.err, /Lean is not set up on this computer: set it up in Hydor’s Settings → General → Lean/);
});

test('verified: 0, with each theorem and its axioms', { skip: WIN }, () => {
  const r = run([lean('Good.lean', 'namespace A\ntheorem t : True := trivial\ntheorem u : True := Classical.byContradiction (fun h => h trivial)\nend A\n')]);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /ok {3}A\.t {2}\(no axioms\)/);
  assert.match(r.out, /ok {3}A\.u {2}\(axioms: Classical\.choice, Quot\.sound, propext\)/);
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
  const missing = run([f, '--allow-sorry', '--theorem', 'nothing_here']);
  assert.equal(missing.code, 1);
  assert.match(missing.out, /there is no theorem nothing_here in this file/);
  const j = JSON.parse(run([f, '--allow-sorry', '--json', '--theorem=done']).out);
  assert.deepEqual(j.theorems, [{ name: 'done', axioms: [], ok: true }]);
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

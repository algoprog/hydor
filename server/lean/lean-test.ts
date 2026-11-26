// Lean (server/lean): its state (none, your own, the app's own, installing, failed), setting up and removing, Mathlib's
// step, the tools (lean_check, lean_verify, lean_search, lean_setup), the routes and the leancheck command, all with
// stand-ins for lake, lean, leanchecker and elan's installer (scripts/agent-tools/fixtures/lean/standin.mjs prints what
// the real ones printed). No Lean and no network.
//
// With LIVE=1 and a real toolchain (LEAN_TRIAL names a scratch folder in the temporary folder with elan in its elan/,
// installed there with ELAN_HOME): the verdict on true, false, unfinished and cheating proofs, a Lake project,
// snippets, the app's sandbox where this computer has one, lean_search against the live services, Mathlib's step with
// real Lake and a stand-in Mathlib repository, and the app's own set-up with elan's real installer (the trial's
// toolchain linked in, so it is not downloaded again). Nothing here downloads Mathlib.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/lean/lean-test.ts && DATA_DIR=/tmp/hydor-test-lean node dist/dev/lean-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { appPaths, findLean, run, scanLean, stripLean, verifyFile } from '../../scripts/agent-tools/lib/lean/core.mjs';
import type { LeanState } from '../../shared/lean.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { netCutAvailable, sandboxAvailable } from '../agent/sandbox.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { setCheckSandbox } from '../goals/driver.ts';
import { lean as leanFeature } from './index.ts';
import { looksFormal, searchLean, setSearchFetchForTests } from './search.ts';
import { leanDir, leanState, removeLean, setLeanForTests, setupLean, type LeanWorld } from './setup.ts';
import { leanTools, NOT_SET_UP, setLeanSandboxForTests } from './tools.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-lean-test-'));
// What the checks make in the temporary folder goes in one of this test's own, so what they leave behind can be counted.
fs.mkdirSync(path.join(tmp, 'scratch'));
process.env.TMPDIR = path.join(tmp, 'scratch');
const STANDIN = path.join(APP_ROOT, 'scripts/agent-tools/fixtures/lean/standin.mjs');
const WIN = process.platform === 'win32';
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// ---- stand-ins ----------------------------------------------------------------------------------------------------

/** lake, lean and leanchecker in <root>/bin, calling the stand-in. */
function standIns(root: string): string {
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const t of ['lean', 'lake', 'leanchecker']) fs.writeFileSync(path.join(bin, t), `#!/bin/sh\nSTANDIN_ROOT='${root}' exec '${process.execPath}' '${STANDIN}' ${t} "$@"\n`, { mode: 0o755 });
  return bin;
}

/** Programs a set-up looks for (curl, git), that do nothing, and the system's folders. */
const system = path.join(tmp, 'system');
fs.mkdirSync(system, { recursive: true });
for (const t of ['curl', 'git']) fs.writeFileSync(path.join(system, t), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
const NO_LEAN_PATH = `${system}${path.delimiter}/usr/bin${path.delimiter}/bin`;

/** elan's installer as the app runs it: it puts lean, lake and leanchecker in $ELAN_HOME/bin. */
function installer(o: { fail?: boolean; slow?: boolean; log: string }): string {
  const lines = [
    '#!/bin/sh',
    `printf '%s\\n' "$*" "ELAN_HOME=$ELAN_HOME" >> '${o.log}'`,
    'echo "info: downloading installer"',
    ...(o.slow ? ['sleep 30'] : []),
    ...(o.fail ? ['echo "error: could not download file from github.com" >&2', 'echo "error: network is unreachable" >&2', 'exit 1'] : []),
    'mkdir -p "$ELAN_HOME/bin"',
    ...['lean', 'lake', 'leanchecker'].map((t) => `printf '%s\\n' '#!/bin/sh' "STANDIN_ROOT='$ELAN_HOME' exec '${process.execPath}' '${STANDIN}' ${t} \\"\\$@\\"" > "$ELAN_HOME/bin/${t}"; chmod 755 "$ELAN_HOME/bin/${t}"`),
    'echo "info: default toolchain set to \'stable\'"',
  ];
  return `${lines.join('\n')}\n`;
}

const fetched: string[] = [];
function world(name: string, o: Partial<LeanWorld> & { path?: string; installer?: string } = {}): { dir: string } {
  const dir = path.join(tmp, name, 'lean');
  const log = path.join(tmp, name, 'installer.log');
  fs.mkdirSync(path.join(tmp, name), { recursive: true });
  const { path: PATH, installer: script, ...more } = o;
  setLeanForTests({
    dir: () => dir,
    env: () => ({ PATH: PATH ?? NO_LEAN_PATH, HOME: path.join(tmp, name, 'home') }),
    fetchText: async (url) => {
      fetched.push(url);
      return url.includes('mathlib4') ? 'leanprover/lean4:v4.36.0\n' : (script ?? installer({ log }));
    },
    freeDiskMb: () => 500_000,
    ...more,
  });
  return { dir };
}

/** Your own Lean: the stand-ins on the PATH. */
const ownRoot = path.join(tmp, 'own-lean');
const ownPath = () => `${standIns(ownRoot)}${path.delimiter}${NO_LEAN_PATH}`;

const idle = async () => {
  for (let i = 0; i < 600 && leanState().installing; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(leanState().installing, false, 'the set-up ended');
};

// ---- a run, as the tools see it -----------------------------------------------------------------------------------

const db = openDb(path.join(tmp, 'test.db'));
const cards: ApprovalRequest[] = [];
const session = { mode: 'default', answer: 'accept' as string };
const work = path.join(tmp, 'work');
fs.mkdirSync(work, { recursive: true });
const deps = {
  db,
  sessions: {
    adapterByRun: () => ({
      state: { mode: session.mode },
      ask: async (card: ApprovalRequest) => (cards.push(card), { decision: session.answer }),
    }),
    summary: () => null,
  },
  publicBase: () => 'http://127.0.0.1:1',
} as unknown as Deps;
const ctx: RunCtx = { runId: 'r1', key: 'claude:lean', agent: 'claude', cwd: work, deps };

async function call(name: string, args: Record<string, unknown> = {}, c: RunCtx = ctx): Promise<{ text: string; data: any; error: boolean }> {
  const t = leanTools.find((x) => x.name === name)!;
  const r = await t.run(args, c);
  const out: ToolOutput = typeof r === 'string' ? { text: r } : r;
  let data: any;
  try {
    data = JSON.parse(out.text);
  } catch {}
  return { text: out.text, data, error: !!out.isError };
}
const put = (name: string, text: string) => {
  const f = path.join(work, name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
  return f;
};

// The session's mode is "default" (Claude Code asks before commands): the checks then go through a sandbox, here one
// that only notes what went through it, so the tests do not depend on this computer having one.
const boxed: string[] = [];
const noting = async () => (command: string) => (boxed.push(command), { cmd: '/bin/sh', args: ['-c', command] });
setLeanSandboxForTests(noting);

// ---- reading Lean source ------------------------------------------------------------------------------------------

test('comments and strings are not code: sorries, theorem names and imports are read from the rest', () => {
  const src = [
    'import Mathlib.Tactic',
    '-- import Nope',
    '/- theorem hidden : True := sorry /- nested -/ -/',
    'namespace A.B',
    'section S',
    'theorem one : "sorry --" = "sorry --" := rfl',
    '@[simp] private theorem two (h\' : True) : True := h\'',
    'lemma «odd name» : True := by sorry',
    'end S',
    'end A.B',
    'namespace C',
    'protected theorem _root_.D.three.{u} {α : Sort u} : True := trivial',
    'mutual',
    'theorem four : True := trivial',
    'end',
    'theorem five : \'a\' = \'a\' := rfl',
    'end C',
    'def theorem_like := 1',
    'set_option x true in theorem six : True := sorry',
  ].join('\n');
  const s = scanLean(src);
  assert.deepEqual(s.imports, ['Mathlib.Tactic']);
  assert.deepEqual(s.theorems.map((t) => t.name), ['A.B.one', 'A.B.two', 'A.B.«odd name»', 'D.three', 'C.four', 'C.five', 'six']);
  assert.deepEqual(s.sorries, [{ line: 8, column: 30 }, { line: 19, column: 43 }]);
  assert.equal(s.skipsKernel, false);
  assert.equal(scanLean('set_option debug.skipKernelTC true in\ntheorem x : True := trivial').skipsKernel, true);
  assert.equal(stripLean(src).length, src.length, 'every character stays where it was');
});

// ---- state and setting up -----------------------------------------------------------------------------------------

test('state: none, with the size and whether this computer can set it up; every tool says so in one sentence', async () => {
  world('none');
  const s = leanState();
  assert.deepEqual({ ready: s.ready, own: s.own, installing: s.installing, canInstall: s.canInstall, mathlib: s.mathlib }, { ready: false, own: false, installing: false, canInstall: true, mathlib: 'none' });
  assert.equal(s.sizeMb, 620);
  assert.ok(s.mathlibSizeMb > 1000);
  for (const [name, args] of [['lean_check', { code: 'example : True := trivial' }], ['lean_verify', { file: 'x.lean' }], ['lean_search', { query: 'add_comm' }]] as const) {
    const r = await call(name, args);
    assert.equal(r.text, NOT_SET_UP, name);
    assert.equal(r.error, true);
  }
  assert.match(NOT_SET_UP, /^Lean is not set up on this computer: set it up in Settings → General → Lean \(proof checker\), or ask the user with lean_setup\.$/);
  world('nocurl', { path: '/nowhere' });
  const n = leanState();
  assert.equal(n.canInstall, false);
  assert.match(n.why!, /needs curl/);
  const r = await call('lean_setup');
  assert.equal(r.error, true);
  assert.match(r.text, /needs curl/);
});

test('state: your own Lean is used as it is, with its version; set-up and remove leave it alone', async () => {
  const { dir } = world('own', { path: ownPath() });
  leanState();
  for (let i = 0; i < 100 && !leanState().version; i++) await new Promise((r) => setTimeout(r, 50));
  const s = leanState();
  assert.deepEqual({ ready: s.ready, own: s.own, version: s.version, mathlib: s.mathlib }, { ready: true, own: true, version: '4.36.0', mathlib: 'none' });
  const before = fetched.length;
  await setupLean();
  assert.equal(fetched.length, before, 'nothing is fetched');
  assert.equal(fs.existsSync(path.join(dir, 'elan')), false);
  await removeLean();
  assert.ok(fs.existsSync(path.join(ownRoot, 'bin', 'lean')), 'yours is still there');
  assert.equal(leanState().ready, true);
});

test('the app’s own: installed with elan’s script (no PATH or shell files touched), ready with its version, then removed', async () => {
  const { dir } = world('app');
  const going = setupLean();
  const mid = leanState();
  assert.equal(mid.installing, true);
  assert.equal(mid.ready, false);
  assert.ok(mid.step, 'it says what it is doing');
  assert.equal(setupLean(), going, 'asked again while it runs: the same set-up');
  await going;
  const s = leanState();
  assert.deepEqual({ ready: s.ready, own: s.own, version: s.version, installing: s.installing }, { ready: true, own: false, version: '4.36.0', installing: false });
  assert.equal(s.error, undefined);
  assert.ok(fetched.includes('https://elan.lean-lang.org/elan-init.sh'));
  const log = fs.readFileSync(path.join(tmp, 'app', 'installer.log'), 'utf8');
  assert.match(log, /^-y --no-modify-path --default-toolchain stable\n/);
  assert.ok(log.includes(`ELAN_HOME=${path.join(dir, 'elan')}`), 'its own ELAN_HOME');
  assert.equal(fs.existsSync(path.join(dir, 'elan-init.sh')), false, 'the script is not kept');
  assert.equal(findLean({ PATH: NO_LEAN_PATH }, dir)!.own, false);
  assert.equal(findLean({ PATH: NO_LEAN_PATH }, dir)!.env.ELAN_HOME, path.join(dir, 'elan'));
  await removeLean();
  assert.equal(fs.existsSync(dir), false);
  assert.equal(leanState().ready, false);
});

test('a set-up that fails says why with its last lines; one removed half-way stops quietly; too little disk is refused', async () => {
  world('fails', { installer: installer({ fail: true, log: path.join(tmp, 'fails.log') }) });
  await setupLean();
  const s = leanState();
  assert.equal(s.ready, false);
  assert.match(s.error!, /^Installing elan, Lean’s version manager failed: /);
  assert.match(s.error!, /error: network is unreachable/);
  const slow = world('slow', { installer: installer({ slow: true, log: path.join(tmp, 'slow.log') }) });
  void setupLean({ mathlib: true });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(leanState().installing, true);
  assert.equal(leanState().mathlib, 'installing');
  const t0 = Date.now();
  await removeLean();
  assert.ok(Date.now() - t0 < 10_000, 'it stops at once');
  assert.equal(leanState().installing, false);
  assert.equal(leanState().error, undefined);
  assert.equal(fs.existsSync(slow.dir), false);
  world('full', { freeDiskMb: () => 900 });
  await setupLean();
  assert.equal(leanState().error, 'Not enough disk space: 0.9 GB free, and Lean needs about 5.0 GB.');
});

test('Mathlib: a second step with real commands injected, checked before it is ready, its download cache removed', async () => {
  const ran: string[] = [];
  const { dir } = world('mathlib', {
    run: async (cmd, args, o) => {
      ran.push(`${path.basename(cmd)} ${args.join(' ')}`);
      return run(cmd, args, o);
    },
  });
  await setupLean({ mathlib: true });
  const s = leanState();
  assert.equal(s.error, undefined);
  assert.deepEqual({ ready: s.ready, mathlib: s.mathlib }, { ready: true, mathlib: 'ready' });
  assert.deepEqual(ran.slice(-3), ['lake update', 'lake exe cache get', 'lake lean Probe.lean']);
  const p = appPaths(dir);
  assert.equal(fs.readFileSync(path.join(p.mathlib, 'lean-toolchain'), 'utf8'), 'leanprover/lean4:v4.36.0\n');
  assert.match(fs.readFileSync(path.join(p.mathlib, 'lakefile.toml'), 'utf8'), /\[\[require\]\]\nname = "mathlib"\ngit = "https:\/\/github\.com\/leanprover-community\/mathlib4\.git"\nrev = "stable"/);
  assert.equal(fs.existsSync(p.mathlibCache), false, 'the download is not kept twice');
  // A snippet that imports Mathlib is checked with Mathlib's search path.
  const r = await call('lean_check', { code: 'import Mathlib.Tactic\n\ntheorem t : True := trivial\n' });
  assert.equal(r.data.ok, true, r.text);
  // Mathlib alone removed: Lean stays.
  await removeLean({ mathlib: true });
  assert.deepEqual({ ready: leanState().ready, mathlib: leanState().mathlib }, { ready: true, mathlib: 'none' });
  // A step that fails: Lean stays ready, Mathlib not, with why.
  fs.writeFileSync(path.join(p.elan, 'fail'), 'cache');
  await setupLean({ mathlib: true });
  const failed = leanState();
  assert.deepEqual({ ready: failed.ready, mathlib: failed.mathlib }, { ready: true, mathlib: 'none' });
  assert.match(failed.error!, /^Downloading Mathlib’s built files \(several GB\) failed: [\s\S]*some files were not downloaded/);
});

test('Mathlib: too little disk, or no git, is refused in words', async () => {
  world('smalldisk', { path: ownPath(), freeDiskMb: () => 3000 });
  await setupLean({ mathlib: true });
  assert.equal(leanState().error, 'Not enough disk space: 2.9 GB free, and Mathlib needs about 12.0 GB.');
  assert.equal(leanState().mathlib, 'none');
  const onlyLean = path.join(tmp, 'nogit-bin');
  world('nogit', { path: standIns(onlyLean) });
  await setupLean({ mathlib: true });
  assert.equal(leanState().error, 'Adding Mathlib needs git on this computer.');
});

// ---- the tools ----------------------------------------------------------------------------------------------------

test('lean_check: ok, errors with positions, unsolved goals kept whole, sorries, messages', async () => {
  world('check', { path: ownPath() });
  put('Good.lean', 'theorem t : 2 + 2 = 4 := by decide\n#check Nat.add_comm\n');
  const ok = await call('lean_check', { file: 'Good.lean' });
  assert.equal(ok.data.ok, true, ok.text);
  assert.deepEqual([ok.data.errors, ok.data.warnings, ok.data.sorries], [[], [], []]);
  assert.deepEqual(ok.data.info, [{ line: 2, column: 0, message: 'Nat.add_comm (n m : Nat) : n + m = m + n' }]);
  put('Bad.lean', 'theorem ok : True := trivial\ntheorem bad : 2 + 2 = 5 := by decide\nexample : True := by\n  skip -- unsolved\n');
  const bad = await call('lean_check', { file: 'Bad.lean' });
  assert.equal(bad.data.ok, false);
  assert.deepEqual(bad.data.errors[0], { line: 2, column: 30, message: 'Tactic `decide` proved that the proposition\n  2 + 2 = 5\nis false' });
  assert.equal(bad.data.errors[1].message, 'unsolved goals\ncase right\na b : Nat\nh : 0 < a\n⊢ a < a + b');
  put('Gap.lean', 'theorem gap (n : Nat) : n = n := by\n  sorry\n');
  const gap = await call('lean_check', { file: 'Gap.lean' });
  assert.equal(gap.data.ok, true);
  assert.deepEqual(gap.data.sorries, [{ line: 2, column: 2 }]);
  assert.equal(gap.data.warnings[0].message, 'declaration uses `sorry`');
  assert.match(gap.data.note, /1 gap marked sorry: not a proof yet/);
  for (const args of [{}, { file: 'Good.lean', code: 'x' }]) assert.match((await call('lean_check', args)).text, /one of the two/);
  assert.match((await call('lean_check', { file: 'Nope.lean' })).text, /There is no file/);
  put('notes.txt', 'x');
  assert.match((await call('lean_check', { file: 'notes.txt' })).text, /Not a Lean file/);
});

test('lean_check: a snippet (nothing left behind), Mathlib not set up said with how, an import that fails to build', async () => {
  world('snippet', { path: ownPath() });
  const mine = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('hydor-lean-'));
  const before = mine().length;
  const r = await call('lean_check', { code: 'theorem t : True := trivial' });
  assert.equal(r.data.ok, true, r.text);
  const m = await call('lean_check', { code: 'import Mathlib.Tactic\nexample : True := trivial' });
  assert.equal(m.error, true);
  assert.match(m.text, /^This imports Mathlib, which is not set up: add it in Settings → General → Lean \(proof checker\) → Add Mathlib \(several gigabytes\), or ask with lean_setup \{ mathlib: true \}\.$/);
  assert.equal(mine().length, before, 'the scratch folders go');
  // In a Lake project, through lake: its build's own messages name their files.
  put('proj/lakefile.toml', 'name = "p"\n');
  put('proj/Uses.lean', 'import Broken\ntheorem u : True := trivial\n');
  const b = await call('lean_check', { file: 'proj/Uses.lean' });
  assert.equal(b.data.ok, false);
  assert.deepEqual(b.data.errors[0], { line: 1, column: 25, file: 'Broken.lean', message: 'Type mismatch\n  rfl\nhas type\n  ?m.8 = ?m.8\nbut is expected to have type\n  1 = 2' });
  assert.equal(b.data.errors.length, 1);
});

test('lean_check: the time limit stops it, as does the agent giving up; Plan mode does not run it; a confidential one without a sandbox neither', async () => {
  world('slowcheck', { path: ownPath() });
  put('Slow.lean', '-- slow\ntheorem t : True := trivial\n');
  const t0 = Date.now();
  const r = await call('lean_check', { file: 'Slow.lean', minutes: 0.02 });
  assert.ok(Date.now() - t0 < 20_000);
  assert.equal(r.data.ok, false);
  assert.match(r.data.errors[0].message, /^Lean was stopped after 1 s\. A project's first build can take longer/);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 300);
  const c = await call('lean_check', { file: 'Slow.lean' }, { ...ctx, signal: ac.signal });
  assert.equal(c.data.errors[0].message, 'The check was stopped.');
  session.mode = 'plan';
  for (const name of ['lean_check', 'lean_verify']) assert.match((await call(name, { file: 'Slow.lean' })).text, /Plan mode/);
  session.mode = 'default';
  const conf = { ...ctx, key: 'acp:secret' };
  db.exec('CREATE TABLE IF NOT EXISTS session_meta (key TEXT PRIMARY KEY, extra TEXT)');
  const { setSessionExtra } = await import('../sessionExtra.ts');
  setSessionExtra(db, conf.key, { confidential: true });
  setCheckSandbox({ netCut: () => false });
  try {
    assert.match((await call('lean_check', { file: 'Slow.lean' }, conf)).text, /^Lean can't run here: No sandbox/);
  } finally {
    setCheckSandbox(null);
  }
  // With one, the program goes through it.
  const wrapped: string[] = [];
  setCheckSandbox({ netCut: () => true, shell: async () => (command) => (wrapped.push(command), { cmd: '/bin/sh', args: ['-c', command] }) });
  try {
    put('Fine.lean', 'theorem t : True := trivial\n');
    assert.equal((await call('lean_check', { file: 'Fine.lean' }, conf)).data.ok, true);
    assert.match(wrapped[0], /^cd '.*' && exec '.*lean' '--json' 'Fine\.lean'$/);
  } finally {
    setCheckSandbox(null);
  }
});

test('lean_verify: ok with each theorem’s axioms; a sorry, an axiom of one’s own, native_decide, the kernel skipped, a missing theorem', async () => {
  world('verify', { path: ownPath() });
  const verdict = async (name: string, text: string, theorems?: string[]) => {
    put(name, text);
    const r = await call('lean_verify', { file: name, ...(theorems ? { theorems } : {}) });
    assert.equal(r.error, false, r.text);
    return r.data;
  };
  const good = await verdict('V.lean', 'namespace N\ntheorem a : True := trivial\ntheorem b : True := Classical.byContradiction id\nend N\n');
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.equal(good.why, undefined);
  assert.deepEqual(good.theorems, [{ name: 'N.a', axioms: [], ok: true }, { name: 'N.b', axioms: ['Classical.choice', 'Quot.sound', 'propext'], ok: true }]);
  const gaps = await verdict('G.lean', 'theorem a : True := by\n  sorry\ntheorem b : True := by\n  sorry\n');
  assert.equal(gaps.ok, false);
  assert.equal(gaps.why, 'it still has 2 gaps marked sorry');
  assert.deepEqual(gaps.theorems.map((t: any) => t.ok), [false, false]);
  const ax = await verdict('X.lean', 'axiom my_axiom : False\ntheorem foo : 1 = 2 := my_axiom.elim\n');
  assert.equal(ax.why, 'theorem foo leans on an axiom that is not standard: my_axiom');
  assert.equal(ax.note, 'The file declares an axiom of its own: my_axiom.');
  const native = await verdict('Nd.lean', 'theorem n : 2 * 2 = 4 := by native_decide\n');
  assert.match(native.why, /theorem n uses native_decide, which trusts compiled code/);
  const skip = await verdict('K.lean', 'set_option debug.skipKernelTC true in\ntheorem skipped : 1 = 2 := by decide\n');
  assert.equal(skip.ok, false);
  assert.match(skip.why, /it switches off Lean’s proof checker \(debug\.skipKernelTC\); Lean's kernel does not accept this file: a declaration was put in without being checked \(declaration type mismatch/);
  assert.deepEqual(skip.theorems.map((t: any) => t.ok), [false]);
  const missing = await verdict('M.lean', 'theorem here : True := trivial\n', ['here', 'gone']);
  assert.equal(missing.ok, false);
  assert.equal(missing.why, 'there is no theorem gone in this file');
  assert.deepEqual(missing.theorems, [{ name: 'here', axioms: [], ok: true }, { name: 'gone', axioms: [], ok: false }]);
  const empty = await verdict('E.lean', 'def x := 1\n');
  assert.equal(empty.why, 'there is no theorem or lemma in it to check');
  const broken = await verdict('B.lean', 'theorem bad : 2 + 2 = 5 := by decide\n');
  assert.equal(broken.why, 'it does not build: 1 error, the first (line 1): Tactic `decide` proved that the proposition');
  assert.equal(broken.errors.length, 1);
  // In a project, the project's files it imports are played back through the kernel too.
  put('p2/lakefile.toml', 'name = "p"\n');
  put('p2/Main.lean', 'import Proofs.Other\ntheorem m : True := trivial\n');
  put('p2/.lake/build/lib/lean/Proofs/Other.olean', 'set_option debug.skipKernelTC true in\ntheorem skipped : 1 = 2 := by decide\n');
  const proj = await call('lean_verify', { file: 'p2/Main.lean' });
  assert.match(proj.data.why, /Lean's kernel does not accept the file Proofs\.Other it imports/);
});

test('lean_verify works with the app’s own Lean too, and leaves nothing behind', async () => {
  world('appverify');
  await setupLean();
  const mine = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('hydor-lean-'));
  const before = mine().length;
  put('A.lean', 'theorem a : True := trivial\n');
  const r = await call('lean_verify', { file: 'A.lean' });
  assert.equal(r.data.ok, true, r.text);
  assert.equal(mine().length, before);
});

test('checking runs code, so it is as free as the session’s commands: sandboxed where they ask, as it is where they never do, asked once without a sandbox', async () => {
  world('modes', { path: ownPath() });
  put('S.lean', 'theorem t : True := trivial\n');
  put('Bad.lean', 'theorem bad : 2 + 2 = 5 := by decide\n');
  boxed.length = 0;
  assert.equal((await call('lean_check', { file: 'S.lean' })).data.ok, true);
  assert.match(boxed[0], /^cd '.*' && exec '.*lean' '--json' 'S\.lean'$/, 'a mode that asks: through the sandbox');
  assert.match((await call('lean_check', { file: 'Bad.lean' })).data.note, /^Checked in a sandbox: /);
  boxed.length = 0;
  assert.equal((await call('lean_verify', { file: 'S.lean' })).data.ok, true);
  assert.ok(boxed.length >= 3, 'compiling, reading the axioms and the kernel re-check all go through it');
  session.mode = 'bypassPermissions';
  boxed.length = 0;
  assert.equal((await call('lean_check', { file: 'S.lean' })).data.ok, true);
  assert.equal(boxed.length, 0, 'Bypass runs anything without asking: no sandbox');
  assert.equal((await call('lean_check', { file: 'Bad.lean' })).data.note, undefined);
  // No sandbox on this computer: the person is asked, once for the session.
  session.mode = 'default';
  setLeanSandboxForTests(async () => undefined);
  try {
    cards.length = 0;
    session.answer = 'deny';
    const c = { ...ctx, key: 'claude:nobox' };
    const no = await call('lean_check', { file: 'S.lean' }, c);
    assert.equal(no.text, 'The user said no: nothing was checked.');
    assert.equal(cards[0].title, 'Check Lean files in this session?');
    session.answer = 'accept';
    assert.equal((await call('lean_check', { file: 'S.lean' }, c)).data.ok, true);
    assert.equal((await call('lean_verify', { file: 'S.lean' }, c)).data.ok, true);
    assert.equal(cards.length, 2, 'allowed for the session');
  } finally {
    setLeanSandboxForTests(noting);
  }
});

// ---- search -------------------------------------------------------------------------------------------------------

const loogleAnswer = { count: 1, hits: [{ doc: null, module: 'Init.Data.Nat.Basic', name: 'Nat.add_comm', type: ' (n m : ℕ) : n + m = m + n' }] };
const leansearchAnswer = [[{ result: { module_name: ['Mathlib', 'NumberTheory', 'Real', 'Irrational'], kind: 'theorem', name: ['irrational_sqrt_two'], signature: ': Irrational (√2)', type: 'Irrational √2', docstring: null, informal_name: 'Irrationality', informal_description: 'The square root of 2 is irrational.' }, distance: 0.15 }]];

test('lean_search: both services, the better suited first; one down; both down, said plainly', async () => {
  world('search', { path: ownPath() });
  const asked: string[] = [];
  let down: string[] = [];
  setSearchFetchForTests(async (url, init) => {
    asked.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`);
    const who = url.includes('loogle') ? 'loogle' : 'leansearch';
    if (down.includes(who)) return new Response('bad gateway', { status: 502 });
    return Response.json(who === 'loogle' ? (url.includes('sqrt') ? { error: 'Unknown identifier `sqrt`', suggestions: [] } : loogleAnswer) : leansearchAnswer);
  });
  try {
    const both = await call('lean_search', { query: 'Nat.add_comm' });
    assert.deepEqual(both.data.from, ['Loogle', 'LeanSearch']);
    assert.deepEqual(both.data.hits.map((h: any) => h.name), ['Nat.add_comm', 'irrational_sqrt_two']);
    assert.deepEqual(both.data.hits[1], { name: 'irrational_sqrt_two', type: 'Irrational √2', module: 'Mathlib.NumberTheory.Real.Irrational', doc: 'The square root of 2 is irrational.' });
    assert.ok(asked.some((a) => a.startsWith('GET https://loogle.lean-lang.org/json?q=Nat.add_comm')));
    assert.ok(asked.some((a) => a === 'POST https://leansearch.net/search {"query":["Nat.add_comm"],"num_results":10}'));
    const words = await call('lean_search', { query: 'sqrt two is irrational' });
    assert.deepEqual(words.data.hits.map((h: any) => h.name), ['irrational_sqrt_two']);
    assert.match(words.data.note, /Loogle could not read the query \(Unknown identifier `sqrt`\)/);
    down = ['leansearch'];
    const one = await call('lean_search', { query: 'Nat.add_comm' });
    assert.deepEqual(one.data.from, ['Loogle']);
    assert.match(one.data.note, /Did not answer: LeanSearch: it answered 502\./);
    down = ['leansearch', 'loogle'];
    const none = await call('lean_search', { query: 'add' });
    assert.equal(none.error, true);
    assert.equal(none.text, 'No Lean search service answered (Loogle: it answered 502; LeanSearch: it answered 502). Try again later, or search with exact? and apply? inside Lean.');
    assert.equal(looksFormal('_ + _ = _ + _'), true);
    assert.equal(looksFormal('addition is commutative'), false);
  } finally {
    setSearchFetchForTests(null);
  }
});

// ---- asking the person --------------------------------------------------------------------------------------------

test('lean_setup: the person is asked on a card with the size first; no keeps it as it is, yes starts it', async () => {
  const { dir } = world('ask');
  cards.length = 0;
  session.answer = 'deny';
  const no = await call('lean_setup', { mathlib: true });
  assert.equal(no.error, true);
  assert.match(no.text, /The user said no/);
  assert.equal(fs.existsSync(dir), false, 'nothing is downloaded');
  assert.equal(cards[0].title, 'Set up Lean and Mathlib?');
  assert.match(cards[0].detail!, /about \*\*620 MB\*\*/);
  assert.match(cards[0].detail!, /\*\*several GB\*\* more \(about 6 GB on disk\)/);
  assert.deepEqual(cards[0].options.map((o) => o.label), ['Set up', 'Don’t']);
  // Full access asks too: it is a download.
  session.mode = 'bypassPermissions';
  session.answer = 'accept';
  const yes = await call('lean_setup');
  assert.equal(yes.error, false, yes.text);
  assert.equal(cards[1].title, 'Set up Lean, the proof checker?');
  assert.equal(yes.data.installing, true);
  assert.match(yes.data.note, /in the background/);
  const again = await call('lean_setup');
  assert.equal(cards.length, 2, 'no second card while it installs');
  assert.match(again.data.note, /being set up/);
  await idle();
  const done = await call('lean_setup');
  assert.equal(done.data.note, 'Lean is set up.');
  assert.equal(cards.length, 2);
  await call('lean_setup', { mathlib: true });
  assert.equal(cards[2].title, 'Add Mathlib to Lean?');
  assert.doesNotMatch(cards[2].detail!, /620 MB/);
  await idle();
  assert.equal(leanState().mathlib, 'ready');
  session.mode = 'plan';
  await removeLean();
  assert.match((await call('lean_setup')).text, /only reads/);
  session.mode = 'default';
});

// ---- the routes, the capability -----------------------------------------------------------------------------------

test('the routes: state, set-up (and Mathlib), removing; the tools, the guide note and the variable leancheck reads', async () => {
  const { dir } = world('routes');
  const app = Fastify();
  leanFeature.routes!({ app, db } as unknown as Deps);
  await app.ready();
  const get = async () => (await app.inject({ method: 'GET', url: '/api/lean' })).json() as LeanState;
  assert.equal((await get()).ready, false);
  const started = (await app.inject({ method: 'POST', url: '/api/lean/setup', payload: { mathlib: true } })).json() as LeanState;
  assert.equal(started.installing, true);
  assert.equal(started.mathlib, 'installing');
  await idle();
  assert.deepEqual([(await get()).ready, (await get()).mathlib], [true, 'ready']);
  await app.inject({ method: 'DELETE', url: '/api/lean?mathlib=1' });
  assert.deepEqual([(await get()).ready, (await get()).mathlib], [true, 'none']);
  await app.inject({ method: 'DELETE', url: '/api/lean' });
  assert.equal((await get()).ready, false);
  world('routes-cannot', { path: '/nowhere' });
  const no = await app.inject({ method: 'POST', url: '/api/lean/setup', payload: {} });
  assert.equal(no.statusCode, 400);
  await app.close();
  world('spawn');
  assert.deepEqual(leanFeature.tools!(ctx).map((t) => t.name), ['lean_check', 'lean_verify', 'lean_search', 'lean_setup']);
  const add = (await leanFeature.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: {} }, deps))!;
  assert.deepEqual(Object.keys(add.env!), ['HYDOR_LEAN_DIR']);
  assert.ok(add.env!.HYDOR_LEAN_DIR.endsWith(path.join('spawn', 'lean')) && dir);
  assert.equal(add.guides![0].text, 'Lean checks proofs: lean_check a file or a snippet, lean_search before proving something the library may have, lean_verify for the verdict (no errors, no sorry, standard axioms only). Before proving anything for someone, load the lean-proofs skill: the statement is agreed with them first.');
  assert.equal(await leanFeature.spawn!({ agent: 'claude', cwd: tmp, runId: 'r', resume: false, extra: { browserOnly: true } }, deps), undefined);
});

test('leancheck exits 0 only for a verified file, 1 otherwise, 2 without Lean', () => {
  const bin = standIns(path.join(tmp, 'cli-lean'));
  const cli = (args: string[], PATH = `${bin}:/usr/bin:/bin`) => spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/agent-tools/bin/leancheck'), ...args], { cwd: work, encoding: 'utf8', env: { PATH, HOME: tmp, HYDOR_LEAN_DIR: path.join(tmp, 'no-such') } });
  put('C.lean', 'theorem c : True := trivial\n');
  put('D.lean', 'theorem d : True := by\n  sorry\n');
  assert.equal(cli(['C.lean']).status, 0, cli(['C.lean']).stderr);
  assert.equal(cli(['D.lean']).status, 1);
  assert.equal(cli(['D.lean', '--allow-sorry']).status, 0);
  assert.equal(cli(['C.lean'], '/usr/bin:/bin').status, 2);
});

// ---- the real Lean ------------------------------------------------------------------------------------------------

const TRIAL = path.resolve(process.env.LEAN_TRIAL || path.join(tmp, 'no-trial'));
const LIVE = process.env.LIVE === '1';

if (LIVE) {
  const elan = path.join(TRIAL, 'elan');
  // A scratch one only, never yours: the tests run it with a HOME of their own.
  assert.ok(!TRIAL.startsWith(os.homedir() + path.sep) && fs.existsSync(path.join(elan, 'bin', 'lean')), 'LIVE=1 needs LEAN_TRIAL: a scratch folder with elan in its elan/');
  const home = path.join(tmp, 'live-home');
  fs.mkdirSync(home, { recursive: true });
  process.env.ELAN_HOME = elan;
  const livePath = `${path.join(elan, 'bin')}:/usr/local/bin:/usr/bin:/bin`;
  const liveWorld = (name: string, o: Partial<LeanWorld> = {}) => world(name, { env: () => ({ PATH: livePath, HOME: home, ELAN_HOME: elan }), ...o });
  const show = (what: string, x: unknown) => console.log(`     ${what}: ${typeof x === 'string' ? x : JSON.stringify(x)}`);
  const verdict = async (name: string, text: string, theorems?: string[]) => {
    put(name, text);
    const r = await call('lean_verify', { file: name, ...(theorems ? { theorems } : {}) });
    assert.equal(r.error, false, r.text);
    show(name, { ok: r.data.ok, why: r.data.why, theorems: r.data.theorems, seconds: r.data.seconds });
    return r.data;
  };

  test('LIVE: a true small theorem verifies, a false one fails with its error, sorry and an added axiom are refused', async () => {
    liveWorld('live');
    for (let i = 0; i < 200 && !leanState().version; i++) await new Promise((r) => setTimeout(r, 100));
    show('state', { ready: leanState().ready, own: leanState().own, version: leanState().version });
    const good = await verdict('True.lean', 'namespace Demo\ntheorem add_zero_right (n : Nat) : n + 0 = n := rfl\ntheorem em2 (p : Prop) : p ∨ ¬p := Classical.em p\nend Demo\n');
    assert.equal(good.ok, true);
    assert.deepEqual(good.theorems[1].axioms, ['Classical.choice', 'Quot.sound', 'propext']);
    const bad = await verdict('False.lean', 'theorem two_two : 2 + 2 = 5 := by decide\n');
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0].message, /decide.*proved that the proposition\n {2}2 \+ 2 = 5\nis false/);
    const gap = await verdict('Sorry.lean', 'theorem gap (n : Nat) : 0 + n = n := by\n  sorry\n');
    assert.equal(gap.why, 'it still has 1 gap marked sorry');
    assert.deepEqual(gap.theorems[0].axioms, ['sorryAx']);
    const ax = await verdict('Axiom.lean', 'axiom my_axiom : False\ntheorem foo : 1 = 2 := my_axiom.elim\n');
    assert.equal(ax.why, 'theorem foo leans on an axiom that is not standard: my_axiom');
  });

  test('LIVE: the cheats are refused: #print axioms redefined, the kernel skipped, native_decide, a lemma with a gap', async () => {
    const spoof = await verdict('Spoof.lean', 'axiom my_axiom : False\ntheorem foo : 1 = 2 := my_axiom.elim\nmacro_rules\n  | `(command| #print axioms $_) => `(command| #print "\'foo\' does not depend on any axioms")\n');
    assert.equal(spoof.ok, false);
    const skip = await verdict('Skip.lean', 'import Lean\nopen Lean Elab\nset_option debug.skipKernelTC true in\ntheorem skipped : 1 = 2 := by\n  run_tac do\n    (← Tactic.getMainGoal).assign (mkConst ``True.intro)\n');
    assert.equal(skip.ok, false);
    assert.match(skip.why, /Lean's kernel does not accept this file/);
    const native = await verdict('Native.lean', 'theorem big : 12345 * 2 = 24690 := by native_decide\n');
    assert.match(native.why, /uses native_decide/);
    const via = await verdict('Via.lean', 'theorem helper : 1 = 2 := sorry\nprivate theorem hidden : 1 = 2 := helper\ntheorem main_one : 1 = 2 := hidden\n', ['main_one', 'hidden']);
    assert.deepEqual(via.theorems.map((t: any) => t.axioms), [['sorryAx'], ['sorryAx']]);
  });

  test('LIVE: lean_check on a snippet (unsolved goals, positions) and a Lake project (imports built first)', async () => {
    const r = await call('lean_check', { code: 'theorem u (a b : Nat) (h : 0 < a) : a + b = b + a ∧ a < a + b := by\n  constructor\n  · exact Nat.add_comm a b\n  · skip\n\n#check Nat.add_comm\n' });
    show('snippet', r.data);
    assert.equal(r.data.ok, false);
    assert.equal(r.data.errors[0].line, 4);
    assert.match(r.data.errors[0].message, /^unsolved goals\ncase right\na b : Nat\nh : 0 < a\n⊢ a < a \+ b$/);
    const proj = path.join(work, 'liveproj');
    put('liveproj/lakefile.toml', 'name = "liveproj"\n\n[[lean_lib]]\nname = "Proofs"\n');
    put('liveproj/lean-toolchain', 'leanprover/lean4:v4.36.0\n');
    put('liveproj/Proofs/Basic.lean', 'theorem Proofs.double (n : Nat) : n + n = 2 * n := by omega\n');
    put('liveproj/Proofs/Main.lean', 'import Proofs.Basic\n\ntheorem main_theorem (n : Nat) : n + n + 0 = 2 * n := by\n  rw [Nat.add_zero]\n  exact Proofs.double n\n');
    const c = await call('lean_check', { file: 'liveproj/Proofs/Main.lean' });
    show('project check', c.data);
    assert.equal(c.data.ok, true, c.text);
    const v = await verdict('liveproj/Proofs/Main.lean', fs.readFileSync(path.join(proj, 'Proofs/Main.lean'), 'utf8'));
    assert.equal(v.ok, true);
    const out = spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/agent-tools/bin/leancheck'), 'Proofs/Main.lean'], { cwd: proj, encoding: 'utf8', env: { PATH: livePath, HOME: home, ELAN_HOME: elan } });
    console.log(out.stdout.replace(/^/gm, '     | '));
    assert.equal(out.status, 0, out.stderr);
    put('liveproj/Proofs/Basic.lean', 'theorem Proofs.double (n : Nat) : n + n = 2 * n := rfl\n');
    const broken = await call('lean_check', { file: 'liveproj/Proofs/Main.lean' });
    show('project with a broken import', broken.data.errors);
    assert.equal(broken.data.ok, false);
    assert.equal(broken.data.errors[0].file, 'Proofs/Basic.lean');
  });

  test('LIVE: in the app’s real sandbox (no network, the rest read-only) Lean checks and verifies a project', async () => {
    if (!sandboxAvailable()) return void show('sandbox', 'none on this computer: skipped');
    setLeanSandboxForTests(null);
    try {
      const v = await verdict('liveproj/Proofs/Boxed.lean', 'theorem boxed (n : Nat) : n + 0 = n := rfl\n');
      assert.equal(v.ok, true, v.why);
      // Code in a file cannot reach the network from there.
      const net = await call('lean_check', { code: '#eval do\n  let r ← IO.Process.output { cmd := "curl", args := #["-sS", "-m", "5", "https://example.com"] }\n  IO.println s!"curl ended {r.exitCode}"\n' });
      show('a snippet that tries the network', net.data.info.map((i: any) => i.message));
      if (netCutAvailable()) assert.doesNotMatch(JSON.stringify(net.data.info), /curl ended 0/);
    } finally {
      setLeanSandboxForTests(noting);
    }
  });

  test('LIVE: the time limit really stops Lean', async () => {
    const t0 = Date.now();
    const r = await call('lean_check', { code: 'def spin (n : Nat) : Nat := Id.run do\n  let mut x := n\n  while true do x := x + 1\n  return x\n#eval spin 0\n', minutes: 0.05 });
    show('after the limit', r.data.errors[0].message);
    assert.ok(Date.now() - t0 < 30_000);
    assert.match(r.data.errors[0].message, /^Lean was stopped after 3 s/);
  });

  test('LIVE: lean_search answers from the live services', async () => {
    for (const q of ['_ * (_ + _) = _ * _ + _ * _', 'square root of two is irrational']) {
      const r = await searchLean(q);
      show(`search “${q}”`, { from: r.from, hits: r.hits.slice(0, 3).map((h) => `${h.name} [${h.module}]`), count: r.hits.length, note: r.note });
      assert.ok(r.from.length >= 1, r.note);
      assert.ok(r.hits.length >= 1);
    }
  });

  test('LIVE: Mathlib’s step with real Lake and a stand-in Mathlib repository (the real one is not downloaded)', async () => {
    const repo = path.join(tmp, 'fake-mathlib');
    const w = (f: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true });
      fs.writeFileSync(path.join(repo, f), text);
    };
    w('lakefile.toml', 'name = "mathlib"\ndefaultTargets = ["Mathlib"]\n\n[[lean_lib]]\nname = "Mathlib"\n\n[[lean_exe]]\nname = "cache"\nroot = "Cache"\n');
    w('lean-toolchain', 'leanprover/lean4:v4.36.0\n');
    w('Mathlib/Tactic.lean', 'notation "ℕ" => Nat\nmacro "norm_num" : tactic => `(tactic| decide)\ntheorem Stand.in_lemma : True := trivial\n');
    w('Mathlib.lean', 'import Mathlib.Tactic\n');
    // `lake exe cache get`: builds the library, as the real one fetches it built.
    w('Cache.lean', 'def main (_ : List String) : IO Unit := do\n  let r ← IO.Process.output { cmd := "lake", args := #["build", "Mathlib"] }\n  IO.println r.stdout\n  if r.exitCode != 0 then throw (IO.userError r.stderr)\n');
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: repo, stdio: 'ignore' });
    git('init', '-q', '-b', 'stable');
    git('add', '.');
    git('commit', '-qm', 'stand-in');
    liveWorld('live-mathlib', { mathlibRepo: repo, fetchText: async () => 'leanprover/lean4:v4.36.0\n' });
    await setupLean({ mathlib: true });
    show('after the step', { mathlib: leanState().mathlib, error: leanState().error });
    assert.equal(leanState().mathlib, 'ready', leanState().error);
    const r = await call('lean_check', { code: 'import Mathlib.Tactic\n\ntheorem t : (2 : ℕ) + 2 = 4 := by norm_num\nexample : True := Stand.in_lemma\n' });
    show('a snippet importing it', r.data);
    assert.equal(r.data.ok, true, r.text);
    const v = await verdict('Uses.lean', 'import Mathlib.Tactic\n\ntheorem uses : (2 : ℕ) + 2 = 4 := by norm_num\n');
    assert.equal(v.ok, true, v.why);
    // Checking against Mathlib writes nothing in the app's folder, so it works where that is read-only (the sandbox).
    if (sandboxAvailable()?.kind === 'bwrap') {
      const dir = leanDir();
      const bwrap = sandboxAvailable()!.bin;
      setLeanSandboxForTests(async () => (command) => ({ cmd: bwrap, args: ['--bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--ro-bind', dir, dir, '--unshare-net', '--die-with-parent', '/bin/bash', '-c', command] }));
      try {
        const ro = await call('lean_check', { code: 'import Mathlib.Tactic\n\ntheorem t : (2 : ℕ) + 2 = 4 := by norm_num\n' });
        show('with Mathlib’s folder read-only', ro.data);
        assert.equal(ro.data.ok, true, ro.text);
      } finally {
        setLeanSandboxForTests(noting);
      }
    }
    await removeLean();
  });

  test('LIVE: the app’s own set-up with elan’s real installer (the toolchain linked in, not downloaded again)', async () => {
    const name = 'live-app';
    const dir = path.join(tmp, name, 'lean');
    // The trial's toolchain, so that elan finds the stable one it is asked for already there.
    fs.mkdirSync(path.join(dir, 'elan', 'toolchains'), { recursive: true });
    for (const t of fs.readdirSync(path.join(elan, 'toolchains'))) fs.symlinkSync(path.join(elan, 'toolchains', t), path.join(dir, 'elan', 'toolchains', t));
    const mine = path.join(tmp, name, 'home');
    fs.mkdirSync(mine, { recursive: true });
    world(name, { env: () => ({ PATH: '/usr/local/bin:/usr/bin:/bin', HOME: mine }), fetchText: async (url) => await (await fetch(url)).text() });
    delete process.env.ELAN_HOME;
    try {
      assert.equal(leanState().ready, false);
      await setupLean();
      const s = leanState();
      show('state', { ready: s.ready, own: s.own, version: s.version, error: s.error });
      assert.equal(s.ready, true, s.error);
      assert.equal(s.own, false);
      show('files left in HOME', fs.readdirSync(mine));
      assert.deepEqual(fs.readdirSync(mine).filter((f) => f.startsWith('.profile') || f.startsWith('.bash') || f.startsWith('.zsh') || f === '.elan'), [], 'no shell files, nothing in ~/.elan');
      put('Own.lean', 'theorem own : True := trivial\n');
      const v = await verifyFile(findLean({ PATH: '/usr/bin:/bin', HOME: mine }, dir)!, path.join(work, 'Own.lean'));
      show('verified with it', { ok: v.ok, why: v.why });
      assert.equal(v.ok, true, v.why);
      await removeLean();
      assert.equal(fs.existsSync(dir), false);
      assert.ok(fs.existsSync(path.join(elan, 'bin', 'lean')) && fs.readdirSync(path.join(elan, 'toolchains')).length > 0, 'the trial’s toolchain is untouched');
    } finally {
      process.env.ELAN_HOME = elan;
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------------

if (WIN) {
  console.log('lean: skipped on Windows (the stand-ins are shell scripts)');
  process.exit(0);
}
for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
  }
}
await removeLean().catch(() => {});
setLeanForTests(null);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed${LIVE ? '' : ' (LIVE=1 with a scratch toolchain runs the real Lean too)'}`);
process.exit(passed === tests.length ? 0 : 1);

// Lean (server/lean): its state (none, your own, the app's own, installing, failed), setting up and removing, Mathlib's
// step, the tools (lean_check, lean_verify, lean_search, lean_setup), the routes and the leancheck command, all with
// stand-ins for lake, lean, leanchecker and elan's installer (scripts/agent-tools/fixtures/lean/standin.mjs prints what
// the real ones printed). No Lean and no network.
//
// With LIVE=1 and a real toolchain (LEAN_TRIAL names a scratch folder in the temporary folder with elan in its elan/,
// installed there with ELAN_HOME): the verdict on true, false, unfinished and cheating proofs, a Lake project,
// snippets, the app's sandbox where this computer has one, lean_search against the live services, Mathlib's step with
// real Lake and a stand-in Mathlib repository, and the app's own set-up with elan's real installer (the trial's
// toolchain linked in, so it is not downloaded again).
//
// With LIVE_MATHLIB=1 and a real Mathlib set up by the app (LEAN_MATHLIB_DIR names its <data folder>/lean): checks and
// verdicts on proofs that need Mathlib, leancheck, the sandbox, and a project whose Mathlib is not fetched. They only
// read that folder; skipped when there is none. Nothing here downloads Mathlib.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/lean/lean-test.ts && DATA_DIR=/tmp/hydor-test-lean node dist/dev/lean-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { appPaths, findLean, mathlibDir, run, scanLean, stripLean, unfetchedMathlib, verifyFile } from '../../scripts/agent-tools/lib/lean/core.mjs';
import type { LeanState } from '../../shared/lean.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { netCutAvailable, sandboxAvailable } from '../agent/sandbox.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, ToolOutput } from '../features/types.ts';
import { setCheckSandbox } from '../goals/driver.ts';
import { lean as leanFeature } from './index.ts';
import { confirmHere, NO_MATHLIB } from './confirm.ts';
import { forLoogle, searchLean, setSearchFetchForTests } from './search.ts';
import { lean as theLean, leanDir, leanState, mathlib as theMathlib, removeLean, setLeanForTests, setupLean, type LeanWorld } from './setup.ts';
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
  assert.deepEqual([s.sizeMb, s.mathlibDownloadMb, s.mathlibSizeMb], [620, 600, 7500]);
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
  const steps: string[] = [];
  const { dir } = world('mathlib', {
    run: async (cmd, args, o) => {
      ran.push(`${path.basename(cmd)} ${args.join(' ')}`);
      return run(cmd, args, { ...o, onLine: (l) => (o.onLine?.(l), steps.push(leanState().step ?? '')) });
    },
  });
  await setupLean({ mathlib: true });
  // Mathlib would fetch its built files at the end of `lake update`: they come in the step that says so.
  assert.ok(!steps.some((s) => s.startsWith('Getting Mathlib’s source') && /Downloaded:/.test(s)), 'nothing is downloaded under the source step');
  assert.ok(steps.includes('Downloading Mathlib’s built files (about 500 MB): Downloaded: 9117 file(s) [attempted 9117/9117 = 100%, 812 KB/s]'), steps.join('\n'));
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
  // Mathlib alone removed: Lean stays. Its 150,000 files go while the app carries on: not ready from the first moment.
  const going = removeLean({ mathlib: true });
  assert.equal(leanState().mathlib, 'none');
  assert.ok(fs.existsSync(p.mathlib), 'removing does not hold the app up');
  // Added again meanwhile: it waits for the removal, then sets it up whole.
  const again = setupLean({ mathlib: true });
  await Promise.all([going, again]);
  assert.deepEqual({ mathlib: leanState().mathlib, error: leanState().error }, { mathlib: 'ready', error: undefined });
  await removeLean({ mathlib: true });
  assert.equal(fs.existsSync(p.mathlib), false);
  assert.deepEqual({ ready: leanState().ready, mathlib: leanState().mathlib }, { ready: true, mathlib: 'none' });
  // A step that fails: Lean stays ready, Mathlib not, with why.
  fs.writeFileSync(path.join(p.elan, 'fail'), 'cache');
  await setupLean({ mathlib: true });
  const failed = leanState();
  assert.deepEqual({ ready: failed.ready, mathlib: failed.mathlib }, { ready: true, mathlib: 'none' });
  assert.match(failed.error!, /^Downloading Mathlib’s built files \(about 500 MB\) failed: [\s\S]*some files were not downloaded/);
});

test('Mathlib: too little disk, or no git, is refused in words', async () => {
  world('smalldisk', { path: ownPath(), freeDiskMb: () => 3000 });
  await setupLean({ mathlib: true });
  assert.equal(leanState().error, 'Not enough disk space: 2.9 GB free, and Mathlib needs about 10.0 GB.');
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
  assert.match(m.text, /^This imports Mathlib, which is not set up: add it in Settings → General → Lean \(proof checker\) → Add Mathlib \(about 8 GB on disk\), or ask with lean_setup \{ mathlib: true \}\.$/);
  assert.equal(mine().length, before, 'the scratch folders go');
  // In a Lake project, through lake: its build's own messages name their files.
  put('proj/lakefile.toml', 'name = "p"\n');
  put('proj/Uses.lean', 'import Broken\ntheorem u : True := trivial\n');
  const b = await call('lean_check', { file: 'proj/Uses.lean' });
  assert.equal(b.data.ok, false);
  assert.deepEqual(b.data.errors[0], { line: 1, column: 25, file: 'Broken.lean', message: 'Type mismatch\n  rfl\nhas type\n  ?m.8 = ?m.8\nbut is expected to have type\n  1 = 2' });
  assert.equal(b.data.errors.length, 1);
});

test('a project that uses Mathlib is not run until its built files are there: no silent download, no build from source', async () => {
  world('unfetched', { path: ownPath() });
  // As `lake new … math` writes it, and as Lake writes the manifest.
  const toml = 'name = "ownproj"\ndefaultTargets = ["Ownproj"]\n\n[leanOptions]\nrelaxedAutoImplicit = false\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\nrev = "v4.36.0"\n\n[[lean_lib]]\nname = "Ownproj"\n';
  const manifest = JSON.stringify({ version: '1.3.0', packagesDir: '.lake/packages', packages: [{ url: 'https://github.com/leanprover-community/mathlib4', type: 'git', name: 'mathlib', rev: 'fc4f59e577feb1a4956671bc04ac18aaaf8cd842' }], name: 'ownproj', lakeDir: '.lake' });
  put('own/lakefile.toml', toml);
  put('own/Ownproj/Basic.lean', 'import Mathlib\n\ntheorem t : True := trivial\n');
  put('own/Ownproj/Plain.lean', 'theorem plain : True := trivial\n');
  boxed.length = 0;
  // No manifest: Lake would download all of it for any file.
  for (const file of ['own/Ownproj/Basic.lean', 'own/Ownproj/Plain.lean']) {
    const r = await call('lean_check', { file });
    assert.equal(r.error, true, r.text);
    assert.match(r.text, /^This Lean project \(.*own\) uses Mathlib, and its libraries are not fetched yet, so nothing was run: .* Run `lake exe cache get` in that folder first \(it needs the network; about 600 MB to download the first time, and about 8 GB in the project/);
  }
  assert.match((await call('lean_verify', { file: 'own/Ownproj/Basic.lean' })).text, /nothing was run/);
  assert.equal(boxed.length, 0, 'neither lake nor lean was started');
  // Cloned: a manifest, nothing fetched. A file that needs no Mathlib runs; one that does, through the project's own files too, does not.
  put('own/lake-manifest.json', manifest);
  assert.equal((await call('lean_check', { file: 'own/Ownproj/Plain.lean' })).data.ok, true);
  assert.match((await call('lean_check', { file: 'own/Ownproj/Basic.lean' })).text, /and Mathlib is not built in it yet, so nothing was run/);
  put('own/Ownproj/Part.lean', 'import Mathlib.Tactic.Linarith\n');
  put('own/Ownproj/Uses.lean', 'import Ownproj.Part\nimport Std.Data.HashMap\n\ntheorem u : True := trivial\n');
  assert.match((await call('lean_check', { file: 'own/Ownproj/Uses.lean' })).text, /and Mathlib\.Tactic\.Linarith is not built in it yet/);
  const lc = spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/agent-tools/bin/leancheck'), 'Ownproj/Uses.lean'], { cwd: path.join(work, 'own'), encoding: 'utf8', env: { PATH: ownPath(), HOME: tmp } });
  assert.equal(lc.status, 2, lc.stdout);
  assert.match(lc.stderr, /^leancheck: This Lean project .* nothing was run/);
  // Only what is imported has to be there (as `lake exe cache get <modules>` leaves it).
  const built = 'own/.lake/packages/mathlib/.lake/build/lib/lean';
  put(`${built}/Mathlib/Tactic/Linarith.olean`, '');
  assert.match((await call('lean_check', { file: 'own/Ownproj/Basic.lean' })).text, /and Mathlib is not built in it yet/);
  assert.equal(unfetchedMathlib(path.join(work, 'own'), ['Ownproj.Part']), null);
  // Another library's module may import Mathlib: its build has to be there.
  assert.equal(unfetchedMathlib(path.join(work, 'own'), ['SomeDependency.Basic']), null);
  put(`${built}/Mathlib.olean`, '');
  assert.equal(unfetchedMathlib(path.join(work, 'own'), ['Mathlib']), null);
  // With Mathlib's source there, a misspelled module is left to Lean to report; one it has but has not built is not.
  put('own/.lake/packages/mathlib/Mathlib/Order/Basic.lean', '');
  assert.equal(unfetchedMathlib(path.join(work, 'own'), ['Mathlib.Ordr.Basic']), null);
  assert.match(unfetchedMathlib(path.join(work, 'own'), ['Mathlib.Order.Basic'])!, /Mathlib\.Order\.Basic is not built/);
  // A lakefile.lean, a source folder of its own, and a project that does not use Mathlib.
  put('lk/lakefile.lean', 'import Lake\nopen Lake DSL\n\npackage lk where\n  srcDir := "src"\n\nrequire "leanprover-community" / "mathlib" @ git "v4.36.0"\n');
  assert.match(unfetchedMathlib(path.join(work, 'lk'), [])!, /its libraries are not fetched yet/);
  put('lk/lake-manifest.json', manifest);
  put('lk/src/Deep.lean', 'import Mathlib.Order.Basic\n');
  assert.match(unfetchedMathlib(path.join(work, 'lk'), ['Deep'])!, /Mathlib\.Order\.Basic is not built/);
  assert.match(unfetchedMathlib(path.join(work, 'lk'), ['SomeDependency.Basic'])!, /it is not built in it yet/);
  put('old/lakefile.lean', 'require mathlib from git\n  "https://github.com/leanprover-community/mathlib4"\n');
  assert.match(unfetchedMathlib(path.join(work, 'old'), [])!, /not fetched yet/);
  put('none/lakefile.lean', '-- require mathlib from git "x"\nrequire mathlibExtras from git "y"\n');
  assert.equal(unfetchedMathlib(path.join(work, 'none'), ['Mathlib']), null);
  put('none2/lakefile.toml', 'name = "mathlib"\n\n[[lean_lib]]\nname = "Mathlib"\n');
  assert.equal(unfetchedMathlib(path.join(work, 'none2'), ['Mathlib.Order.Basic']), null, 'Mathlib’s own repository');
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
  const briefly = (v: any) => v.theorems.map((t: any) => ({ name: t.name, axioms: t.axioms, ok: t.ok }));
  assert.deepEqual(briefly(good), [{ name: 'N.a', axioms: [], ok: true }, { name: 'N.b', axioms: ['Classical.choice', 'Quot.sound', 'propext'], ok: true }]);
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
  assert.deepEqual(briefly(missing), [{ name: 'here', axioms: [], ok: true }, { name: 'gone', axioms: [], ok: false }]);
  assert.deepEqual(missing.missing, ['gone']);
  assert.deepEqual(Object.keys(missing.theorems[1]), ['name', 'axioms', 'ok'], 'nothing is stated by a theorem that is not there');
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

test('lean_verify: what each theorem states and its pin, even while it is sorry; name@pin holds a proof to it', async () => {
  world('pins', { path: ownPath() });
  const verify = async (text: string, theorems?: string[]) => {
    put('Pin.lean', text);
    return call('lean_verify', { file: 'Pin.lean', ...(theorems ? { theorems } : {}) });
  };
  const def = 'def twice (k : Nat) : Nat := k * 2\n';
  const open = (await verify(`${def}theorem bound (n : Nat) (h : 0 < n) : twice n < n * 3 := by\n  sorry\n`)).data;
  assert.equal(open.ok, false);
  assert.equal(open.why, 'it still has 1 gap marked sorry');
  const { statement, pin, definitions } = open.theorems[0];
  assert.deepEqual([statement, definitions], ['∀ (n : Nat), (0 : Nat) < n → twice n < n * (3 : Nat)', ['twice']]);
  assert.match(pin, /^[0-9a-f]{12}$/);
  // Proved, laid out otherwise and with another name for the variable: the same pin.
  const proved = (await verify(`${def}-- proved now\ntheorem bound\n    (m : Nat) (pos : 0 < m) : twice m < m * 3 := by\n  unfold twice; omega\n`, [`bound@${pin}`])).data;
  assert.equal(proved.ok, true, JSON.stringify(proved));
  assert.equal(proved.theorems[0].pin, pin);
  assert.equal(proved.changed, undefined);
  const weaker = (await verify(`${def}theorem bound (n : Nat) (h : 0 < n) (few : n < 5) : twice n < n * 3 := by\n  unfold twice; omega\n`, [`bound@${pin}`])).data;
  assert.equal(weaker.ok, false);
  assert.deepEqual([weaker.changed, weaker.theorems[0].ok], [['bound'], false]);
  const now = weaker.theorems[0].pin;
  assert.notEqual(now, pin);
  assert.equal(weaker.why, `bound no longer says what was agreed: its statement changed (it was pinned as ${pin}, it is now ${now}) (the pin covers the definitions of its own that it rests on too: twice). It now says: ∀ (n : Nat), (0 : Nat) < n → n < (5 : Nat) → twice n < n * (3 : Nat)`);
  // A malformed pin is the question's fault; a pin for a theorem that is not there is no such theorem.
  const bad = await verify(`${def}theorem bound : True := trivial\n`, ['bound@abc']);
  assert.equal(bad.error, true);
  assert.equal(bad.text, '"bound@abc" is not a theorem with its pin: write it as name@pin, where the pin is the 12 characters (0-9, a-f) a verdict gave for it.');
  const gone = (await verify('theorem here : True := trivial\n', [`gone@${pin}`])).data;
  assert.deepEqual([gone.why, gone.missing, gone.changed], ['there is no theorem gone in this file', ['gone'], undefined]);
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

test('lean_search: Loogle is asked only what can be one of its queries', () => {
  for (const q of ['Nat.add_comm', 'add_comm', 'Nat', '_ + _ = _ + _', 'Real.sqrt (_ ^ 2)', 'Real.sqrt ?a * Real.sqrt ?a', '"differ"', '|- tsum _ = _ * tsum _', '⊢ _ < _', '(?a -> ?b) -> List ?a -> List ?b', 'List ℕ → ℕ', 'Real.sin, Real.cos', 'Real.sin, "two", _ * _', 'Real.sqrt 2', '2 * x * y ≤ x ^ 2 + y ^ 2', 'List.map f', '∀ n, 0 ≤ n'])
    assert.equal(forLoogle(q), true, q);
  for (const q of ['square root of two is irrational', 'addition is commutative', 'sum of the first n odd numbers', 'is sqrt 2 irrational?', 'Cauchy-Schwarz inequality', 'Bezout’s identity', 'Pythagorean theorem (inner product spaces)', 'what does Nat.succ do', 'continuous functions on compact sets, bounded', ''])
    assert.equal(forLoogle(q), false, q);
});

test('lean_search: routed by the query; from lists the services whose hits are there; each hit its service and page; failures said plainly', async () => {
  world('search', { path: ownPath() });
  const asked: string[] = [];
  let down: Record<string, 'error' | 'unreachable' | 'garbled' | undefined> = {};
  setSearchFetchForTests(async (url, init) => {
    asked.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`);
    const who = url.includes('loogle') ? 'loogle' : 'leansearch';
    if (down[who] === 'error') return new Response('bad gateway', { status: 502 });
    if (down[who] === 'unreachable') throw new TypeError('fetch failed');
    if (down[who] === 'garbled') return new Response('<html>', { status: 200 });
    return Response.json(who === 'loogle' ? (url.includes('irrational') ? { error: "unknown identifier 'irrational'", suggestions: [] } : loogleAnswer) : leansearchAnswer);
  });
  const loogled = () => asked.filter((a) => a.includes('loogle')).length;
  try {
    const both = await call('lean_search', { query: 'Nat.add_comm' });
    assert.deepEqual(both.data.from, ['Loogle', 'LeanSearch']);
    assert.deepEqual(both.data.hits, [
      { name: 'Nat.add_comm', type: '(n m : ℕ) : n + m = m + n', module: 'Init.Data.Nat.Basic', from: 'Loogle', url: 'https://leanprover-community.github.io/mathlib4_docs/Init/Data/Nat/Basic.html#Nat.add_comm' },
      { name: 'irrational_sqrt_two', type: 'Irrational √2', module: 'Mathlib.NumberTheory.Real.Irrational', doc: 'The square root of 2 is irrational.', from: 'LeanSearch', url: 'https://leanprover-community.github.io/mathlib4_docs/Mathlib/NumberTheory/Real/Irrational.html#irrational_sqrt_two' },
    ]);
    assert.ok(asked.some((a) => a.startsWith('GET https://loogle.lean-lang.org/json?q=Nat.add_comm')));
    assert.ok(asked.some((a) => a === 'POST https://leansearch.net/search {"query":["Nat.add_comm"],"num_results":10}'));
    assert.equal(both.data.note, undefined);
    assert.ok(both.data.hits.every((h: any) => !('here' in h)), 'nothing is checked unless asked');
    const pattern = await call('lean_search', { query: '_ + _ = _ + _' });
    assert.deepEqual([loogled(), pattern.data.from], [2, ['Loogle', 'LeanSearch']], 'a pattern goes to both');
    // Plain words are not sent to Loogle, and it is not said to have answered.
    const words = await call('lean_search', { query: 'square root of two is irrational' });
    assert.equal(loogled(), 2);
    assert.deepEqual([words.data.from, words.data.hits.map((h: any) => h.from), words.data.note], [['LeanSearch'], ['LeanSearch'], undefined]);
    // A name Loogle does not know: its hits are not there, so it is not in from.
    const unknown = await call('lean_search', { query: 'irrational' });
    assert.deepEqual([unknown.data.from, unknown.data.note], [['LeanSearch'], 'Loogle knows nothing called irrational.']);
    down = { leansearch: 'error' };
    const one = await call('lean_search', { query: 'Nat.add_comm' });
    assert.deepEqual([one.data.from, one.data.note], [['Loogle'], 'Did not answer: LeanSearch: it answered with an error (502).']);
    down = { loogle: 'unreachable' };
    assert.equal((await call('lean_search', { query: 'Nat.add_comm' })).data.note, 'Did not answer: Loogle: it could not be reached.');
    down = { leansearch: 'garbled' };
    const words2 = await call('lean_search', { query: 'two is irrational' });
    assert.equal(words2.error, true, 'the only service asked did not answer');
    assert.equal(words2.text, 'No Lean search service answered (LeanSearch: its answer could not be read). Try again later, or search with exact? and apply? inside Lean.');
    down = { leansearch: 'error', loogle: 'error' };
    const none = await call('lean_search', { query: 'add' });
    assert.equal(none.error, true);
    assert.equal(none.text, 'No Lean search service answered (Loogle: it answered with an error (502); LeanSearch: it answered with an error (502)). Try again later, or search with exact? and apply? inside Lean.');
    // A hit with no module has no page.
    down = {};
    setSearchFetchForTests(async (url) => Response.json(url.includes('loogle') ? { hits: [{ name: 'Lost.lemma', type: 'True', module: null }] } : [[]]));
    const lost = await call('lean_search', { query: 'Lost.lemma' });
    assert.deepEqual(lost.data.hits, [{ name: 'Lost.lemma', type: 'True', module: '', from: 'Loogle' }]);
    assert.deepEqual(lost.data.from, ['Loogle']);
  } finally {
    setSearchFetchForTests(null);
  }
});

test('lean_search with confirm: the names are checked against what is installed here, or it says why not', async () => {
  const { dir } = world('confirm', { path: ownPath() });
  const found = [{ name: 'Nat.add_comm', type: 't', module: 'Init.Data.Nat.Basic' }, { name: 'Nat.gone_since', type: 't', module: 'Mathlib.Data.Nat.Basic' }, { name: 'bad name\n#eval 1', type: 't', module: 'Mathlib.X' }, { name: 'List.map', type: 't', module: 'Init.Prelude' }];
  setSearchFetchForTests(async (url) => Response.json(url.includes('loogle') ? { hits: found } : [[]]));
  boxed.length = 0;
  try {
    const without = await call('lean_search', { query: 'Nat.add_comm', confirm: true });
    assert.equal(without.error, false, without.text);
    assert.equal(without.data.note, NO_MATHLIB);
    assert.match(NO_MATHLIB, /^The names were not checked against what is installed here: Mathlib is not set up \(add it in Settings → General → Lean \(proof checker\) → Add Mathlib/);
    assert.ok(without.data.hits.every((h: any) => !('here' in h)));
    // Mathlib added (the stand-in's).
    const p = appPaths(dir);
    fs.mkdirSync(path.join(p.mathlib, '.lake', 'packages', 'mathlib'), { recursive: true });
    fs.writeFileSync(path.join(p.mathlib, '.lake', 'packages', 'mathlib', 'built'), '');
    fs.writeFileSync(p.mathlibMarker, 'leanprover/lean4:v4.36.0\n');
    const mine = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('hydor-lean-names-'));
    const with_ = await call('lean_search', { query: 'Nat.add_comm', confirm: true });
    assert.equal(with_.data.note, undefined, with_.text);
    assert.deepEqual(with_.data.hits.map((h: any) => [h.name, h.here]), [['Nat.add_comm', true], ['Nat.gone_since', false], ['bad name\n#eval 1', undefined], ['List.map', true]], 'what is not a name is never written into the file');
    assert.deepEqual(mine(), [], 'the scratch folder goes');
    const off = await call('lean_search', { query: 'Nat.add_comm' });
    assert.ok(off.data.hits.every((h: any) => !('here' in h)));
    // In Plan mode too: nothing of the person's is run.
    session.mode = 'plan';
    assert.equal((await call('lean_search', { query: 'Nat.add_comm', confirm: true })).data.hits[0].here, true);
  } finally {
    session.mode = 'default';
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
  assert.match(cards[0].detail!, /downloads about \*\*600 MB\*\* more and takes about \*\*8 GB\*\* on disk once unpacked\. It takes a few minutes\./);
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
  assert.equal(add.guides![0].text, 'Lean checks proofs: lean_check a file or a snippet, lean_search before proving something the library may have, lean_verify for the verdict (no errors, no sorry, standard axioms only; it names what each theorem states, with a pin of it, and name@pin holds a proof to the agreed statement). Before proving anything for someone, load the lean-proofs skill: the statement is agreed with them first.');
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
  assert.equal(cli(['C.lean', '--theorem', 'nothing']).status, 2);
  assert.equal(cli(['C.lean', '--theorem', 'c@0123456789ab']).status, 3);
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

  const lc = (args: string[], cwd = work) => spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/agent-tools/bin/leancheck'), ...args], { cwd, encoding: 'utf8', env: { PATH: livePath, HOME: home, ELAN_HOME: elan } });
  /** The theorem of a file, as lean_verify states it (the file need not be proved). */
  const stated = async (name: string, text: string, theorem?: string) => {
    put(name, text);
    const r = await call('lean_verify', { file: name, ...(theorem ? { theorems: [theorem] } : {}) });
    assert.equal(r.error, false, r.text);
    const t = r.data.theorems.at(-1);
    assert.ok(t?.pin, r.text);
    show(name, `${t.pin}  ${t.statement}${t.definitions ? `   {${t.definitions.join(', ')}}` : ''}`);
    return t as { name: string; statement: string; pin: string; definitions?: string[] };
  };
  const BOUND = 'theorem bound (n : Nat) (h : 0 < n) : n < n + 1 := by\n  omega\n';

  test('LIVE: pins: the same through reformatting, renaming and the proof; another for a hypothesis, a constant, a conclusion', async () => {
    liveWorld('live-pins');
    const agreed = await stated('pins/Agreed.lean', 'theorem bound (n : Nat) (h : 0 < n) : n < n + 1 := by\n  sorry\n');
    assert.equal(agreed.statement, '∀ (n : Nat), (0 : Nat) < n → n < n + (1 : Nat)');
    for (const [file, text] of [
      ['Proved.lean', BOUND],
      ['Renamed.lean', '-- other names, laid out otherwise, another proof, more in the file\ndef other := 1\n\n/-- doc -/\ntheorem bound\n    (m : Nat)\n    (pos : 0 < m) :\n    m < m + 1 := Nat.lt_succ_self _\n'],
      ['Written.lean', 'theorem bound : ∀ {k : Nat}, 0 < k → k < k + 1 := by\n  intro k _; omega\n'],
    ]) assert.equal((await stated(`pins/${file}`, text)).pin, agreed.pin, file);
    for (const [file, text] of [
      ['Hypothesis.lean', 'theorem bound (n : Nat) (h : 0 < n) (few : n < 10) : n < n + 1 := by\n  omega\n'],
      ['Constant.lean', 'theorem bound (n : Nat) (h : 0 < n) : n < n + 2 := by\n  omega\n'],
      ['Conclusion.lean', 'theorem bound (n : Nat) (h : 0 < n) : n ≤ n + 1 := by\n  omega\n'],
      ['Type.lean', 'theorem bound (n : Int) (h : 0 < n) : n < n + 1 := by\n  omega\n'],
    ]) assert.notEqual((await stated(`pins/${file}`, text)).pin, agreed.pin, file);
    // Universe names do not count.
    const u = await stated('pins/U1.lean', 'universe u v\ntheorem p {α : Sort u} {β : Sort v} (a : α) (b : β) : a = a ∧ b = b := ⟨rfl, rfl⟩\n');
    assert.equal((await stated('pins/U2.lean', 'theorem p {x : Sort w} {y : Sort z} (c : x) (d : y) : c = c ∧ d = d := ⟨rfl, rfl⟩\n')).pin, u.pin);
  });

  test('LIVE: pins cover one’s own definitions, not their names; a project and a loose file agree', async () => {
    const of = (name: string, factor: number, extra = '') => `def ${name} (k : Nat) : Nat := k * ${factor}\n${extra}theorem t (n : Nat) (h : 0 < n) : ${name} n < ${name} n + 1 := Nat.lt_succ_self _\n`;
    const twice = await stated('defs/A.lean', of('f', 2));
    assert.deepEqual(twice.definitions, ['f']);
    assert.equal((await stated('defs/Zeta.lean', of('twice', 2, 'def unused := 7\n'))).pin, twice.pin, 'a renamed definition, another file name');
    const thrice = await stated('defs/Thrice.lean', of('f', 3));
    assert.equal(thrice.statement, twice.statement, 'it reads the same');
    assert.notEqual(thrice.pin, twice.pin, 'and says something else');
    // A match, a structure, an instance, a private definition, a recursive one: the same twice over.
    const rich = 'structure P where\n  x : Int\ninstance : Add P := ⟨fun a b => ⟨a.x + b.x⟩⟩\nprivate def secret (n : Nat) : Prop := n = 0\ndef len : List Nat → Nat\n  | [] => 0\n  | _ :: t => len t + 1\ntheorem r (p q : P) (n : Nat) (hs : secret n) : (p + q).x = p.x + q.x ∧ (match n with | 0 => 1 | _ => 2) ≤ len [n] := by\n  sorry\n';
    const first = await stated('defs/Rich.lean', rich);
    assert.equal((await stated('defs/RichAgain.lean', `-- again\n${rich}`)).pin, first.pin);
    // (the hypothesis that depends on n is matched with it, as Lean reads it)
    assert.match(first.statement, /\(match n, hs with \| \(0 : Nat\), hs => /);
    assert.deepEqual(first.definitions, ['P', 'secret', 'instAddP', 'len']);
    // A definition left as sorry does not make the pin depend on where it is written.
    const gap = await stated('defs/Gap.lean', 'def g (n : Nat) : Nat := sorry\ntheorem t : g 1 = 1 := sorry\n');
    assert.equal((await stated('defs/GapMoved.lean', '\n\n-- lower down\ndef g (n : Nat) : Nat :=\n      sorry\ntheorem t : g 1 = 1 := sorry\n')).pin, gap.pin);
    put('pinproj/lakefile.toml', 'name = "pinproj"\n\n[leanOptions]\nautoImplicit = false\n\n[[lean_lib]]\nname = "Proofs"\n');
    put('pinproj/lean-toolchain', 'leanprover/lean4:v4.36.0\n');
    put('pinproj/Proofs/Basic.lean', 'def f (k : Nat) : Nat := k * 2\nnotation "TWICE" => f\n');
    const proj = await stated('pinproj/Proofs/Main.lean', 'import Proofs.Basic\n\ntheorem t (n : Nat) (h : 0 < n) : TWICE n < TWICE n + 1 := Nat.lt_succ_self _\n');
    assert.equal(proj.pin, twice.pin);
    assert.deepEqual(proj.definitions, ['f'], 'the project’s own, and its notation is not used to show it');
    assert.doesNotMatch(proj.statement, /TWICE/);
  });

  test('LIVE: a file’s own notation, printers and initializers do not change what is shown', async () => {
    const spoof = 'import Lean\nopen Lean PrettyPrinter\nmacro_rules | `(binrel% LT.lt $_ $_) => `(True)\n@[app_unexpander True] def u : Unexpander := fun _ => `(False)\nset_option pp.all true\ninitialize IO.println "an initializer of the file ran"\n';
    const made = await stated('spoof/Made.lean', `${spoof}theorem c : 5 < 3 := trivial\n`);
    assert.equal(made.statement, 'True', 'what it really states');
    const own = await stated('spoof/Instance.lean', 'instance (priority := high) low : LT Nat := ⟨fun _ _ => True⟩\ntheorem c : (5 : Nat) < 3 := trivial\n');
    const real = await stated('spoof/Real.lean', 'theorem c : (5 : Nat) < 3 := by\n  sorry\n');
    assert.equal(own.statement, real.statement, 'it reads the same');
    assert.notEqual(own.pin, real.pin);
    assert.deepEqual(own.definitions, ['low']);
    const out = lc(['spoof/Made.lean']);
    assert.doesNotMatch(out.stdout, /initializer of the file ran/);
  });

  test('LIVE: name@pin and leancheck: verified, changed (3), no such theorem and a malformed pin (2), a gap', async () => {
    const { pin } = await stated('at/Main.lean', 'theorem sum_up (n : Nat) : n ≤ n + n := by\n  sorry\n');
    const run = (args: string[]) => {
      const r = lc(args);
      console.log(`     $ leancheck ${args.join(' ')}\n${`${r.stdout}${r.stderr}`.trimEnd().replace(/^/gm, '     | ')}\n     | exit ${r.status}`);
      return r.status;
    };
    assert.equal(run(['at/Main.lean', '--theorem', `sum_up@${pin}`]), 1, 'not proved yet');
    assert.equal(run(['at/Main.lean', '--theorem', `sum_up@${pin}`, '--allow-sorry']), 0);
    put('at/Main.lean', 'theorem sum_up (n : Nat) : n ≤ n + n := Nat.le_add_right n n\n');
    assert.equal(run(['at/Main.lean', '--theorem', `sum_up@${pin}`]), 0);
    const v = await verdict('at/Main.lean', 'theorem sum_up (n : Nat) : n ≤ n + n + 1 := by omega\n', [`sum_up@${pin}`]);
    assert.equal(v.ok, false);
    assert.deepEqual(v.changed, ['sum_up']);
    show('why', v.why);
    assert.equal(run(['at/Main.lean', '--theorem', `sum_up@${pin}`]), 3);
    assert.equal(run(['at/Main.lean', '--theorem', `other@${pin}`]), 2);
    assert.equal(run(['at/Main.lean', '--theorem', 'sum_up@12']), 2);
    assert.equal(run(['at/Missing.lean', '--theorem', `sum_up@${pin}`]), 2);
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

  test('LIVE: lean_search answers from the live services, and its documentation pages are there', async () => {
    for (const q of ['_ * (_ + _) = _ * _ + _ * _', 'square root of two is irrational']) {
      const r = await searchLean(q);
      show(`search “${q}”`, { from: r.from, hits: r.hits.slice(0, 3).map((h) => `${h.name} [${h.from}] ${h.url}`), count: r.hits.length, note: r.note });
      assert.ok(r.from.length >= 1, r.note);
      assert.ok(r.hits.length >= 1);
      if (q.startsWith('square')) assert.deepEqual([r.from, r.note], [['LeanSearch'], undefined]);
      const [url, anchor] = r.hits[0].url!.split('#');
      const page = await fetch(url);
      assert.equal(page.status, 200, url);
      assert.ok((await page.text()).includes(`id="${decodeURI(anchor)}"`), r.hits[0].url);
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
    // The names a search found, asked of the real Lean: there, not there, and with an apostrophe.
    const named = ['Stand.in_lemma', 'Nat.add_comm', 'Stand.renamed_since', "Nat.add_comm'", 'List.map'].map((name) => ({ name, type: '', module: 'Mathlib.Tactic', from: 'Loogle' as const }));
    const sure = await confirmHere(theLean()!, named, { mathlib: theMathlib(), timeoutMs: 120_000 });
    show('confirm', { hits: sure.hits.map((h) => `${h.name}: ${h.here}`), note: sure.note });
    assert.deepEqual(sure.hits.map((h) => h.here), [true, true, false, false, true]);
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

// ---- the real Mathlib ---------------------------------------------------------------------------------------------

const REAL_LEAN = path.resolve(process.env.LEAN_MATHLIB_DIR || path.join(tmp, 'no-mathlib'));

if (process.env.LIVE_MATHLIB === '1' && !mathlibDir(REAL_LEAN)) console.log('LIVE_MATHLIB: skipped, no Mathlib in LEAN_MATHLIB_DIR (the <data folder>/lean the app set up)');
else if (process.env.LIVE_MATHLIB === '1') {
  const home = path.join(tmp, 'mathlib-home');
  fs.mkdirSync(home, { recursive: true });
  const env = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: home };
  /** The real folder for one test only: what comes after (the last removal) must never see it. */
  const real = async (fn: () => Promise<void>) => {
    world('mathlib-real', { dir: () => REAL_LEAN, env: () => env });
    try {
      await fn();
    } finally {
      world('after-mathlib');
    }
  };
  const lc = (file: string) => spawnSync(process.execPath, [path.join(APP_ROOT, 'scripts/agent-tools/bin/leancheck'), file], { cwd: work, encoding: 'utf8', env: { ...env, HYDOR_LEAN_DIR: REAL_LEAN } });
  const good = 'import Mathlib\n\nnamespace Trial\ntheorem sqrt_two_irrational : Irrational (Real.sqrt 2) := irrational_sqrt_two\ntheorem below (x y : ℝ) (h : x ≤ y) : x - 1 < y := by linarith\nexample : (3 : ℝ) / 4 + 1 / 4 = 1 := by norm_num\nend Trial\n';

  test('LIVE_MATHLIB: checks and verdicts on proofs that need Mathlib, and leancheck’s exit codes', () =>
    real(async () => {
      assert.equal(leanState().mathlib, 'ready');
      put('MGood.lean', good);
      const ok = await call('lean_check', { file: 'MGood.lean' });
      console.log(`     check: ${ok.data?.seconds} s`);
      assert.equal(ok.data.ok, true, ok.text);
      const snippet = await call('lean_check', { code: good });
      assert.equal(snippet.data.ok, true, snippet.text);
      const bad = await call('lean_check', { code: 'import Mathlib\n\ntheorem wrong_sum : (2 : ℝ) + 2 = 5 := by norm_num\n\ntheorem wrong_lt (x : ℝ) : x < x := by\n  linarith\n' });
      assert.equal(bad.data.ok, false);
      assert.deepEqual(bad.data.errors.map((e: any) => [e.line, e.message.split('\n')[0]]), [[3, 'unsolved goals'], [6, 'linarith failed to find a contradiction']]);
      const v = await call('lean_verify', { file: 'MGood.lean' });
      console.log(`     verify: ${v.data?.seconds} s`);
      assert.equal(v.data.ok, true, v.text);
      assert.deepEqual(v.data.theorems.map((t: any) => [t.name, t.axioms]), ['Trial.sqrt_two_irrational', 'Trial.below'].map((n) => [n, ['Classical.choice', 'Quot.sound', 'propext']]));
      put('MGap.lean', 'import Mathlib\n\ntheorem am_gm (x y : ℝ) : 2 * x * y ≤ x ^ 2 + y ^ 2 := by\n  sorry\n');
      assert.equal((await call('lean_verify', { file: 'MGap.lean' })).data.why, 'it still has 1 gap marked sorry');
      put('MAxiom.lean', 'import Mathlib\n\naxiom wishful : ∀ x : ℝ, x < x\n\ntheorem all_below (x : ℝ) : x < x := wishful x\n');
      assert.equal((await call('lean_verify', { file: 'MAxiom.lean' })).data.why, 'theorem all_below leans on an axiom that is not standard: wishful');
      assert.deepEqual(['MGood.lean', 'MGap.lean', 'MAxiom.lean'].map((f) => lc(f).status), [0, 1, 1]);
    }));

  test('LIVE_MATHLIB: in the app’s sandbox, Mathlib’s folder read-only, a check writes nothing there', () =>
    real(async () => {
      const box = sandboxAvailable();
      if (box?.kind !== 'bwrap') return void console.log('     no bubblewrap here: skipped');
      setLeanSandboxForTests(async () => (command) => ({ cmd: box.bin, args: ['--bind', '/', '/', '--dev-bind', '/dev', '/dev', '--proc', '/proc', '--ro-bind', REAL_LEAN, REAL_LEAN, '--unshare-net', '--die-with-parent', '/bin/bash', '-c', command] }));
      try {
        const r = await call('lean_check', { code: good });
        console.log(`     sandboxed check: ${r.data?.seconds} s`);
        assert.equal(r.data.ok, true, r.text);
        put('MBoxed.lean', good);
        const v = await call('lean_verify', { file: 'MBoxed.lean' });
        assert.equal(v.data.ok, true, v.text);
      } finally {
        setLeanSandboxForTests(noting);
      }
    }));

  test('LIVE_MATHLIB: a project whose Mathlib is not fetched is refused and nothing is written in it', () =>
    real(async () => {
      put('mproj/lakefile.toml', 'name = "mproj"\n\n[[require]]\nname = "mathlib"\nscope = "leanprover-community"\nrev = "v4.36.0"\n');
      put('mproj/A.lean', 'import Mathlib\n');
      const r = await call('lean_check', { file: 'mproj/A.lean' });
      assert.match(r.text, /nothing was run/);
      assert.deepEqual(fs.readdirSync(path.join(work, 'mproj')).sort(), ['A.lean', 'lakefile.toml']);
    }));
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

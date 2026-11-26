// The built-in instruction to take fewer, fuller steps (server/steps): every agent kind gets it, the sym clause only while the
// shell tools offer sym, a session in one browser tab only the first bullet, the same text every time, and nothing in it that
// a user could turn off (no setting, no environment switch).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/steps/steps-test.ts && DATA_DIR=/tmp/hydor-test-steps node dist/dev/steps-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ROOT } from '../config.ts';
import { FEATURES } from '../features/index.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps, SpawnInfo } from '../features/types.ts';
import { createShellTools, offeredShellTools, TOOLS } from '../shelltools/index.ts';
import { createSteps, steps, stepsText } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const WITH_SYM = [
  'Every separate tool step re-reads the whole conversation, so make fewer, fuller steps:',
  '- Send independent tool calls (reads, searches, lookups) together in one step, not one at a time.',
  '- When looking around code, put several lookups in one command: several names to one sym call, several grep or sed -n ranges chained in one shell command.',
  '- When waiting on a running command or job, check on it at intervals that fit how long it is expected to take, not every few seconds: each check costs tokens.',
].join('\n');
const WITHOUT_SYM = WITH_SYM.replace('several names to one sym call, ', '');
const BROWSER_ONLY = WITH_SYM.split('\n').slice(0, 2).join('\n');

const deps = { db: null, publicBase: () => 'http://127.0.0.1:1' } as unknown as Deps;
const info = (o: Partial<SpawnInfo> = {}): SpawnInfo => ({ agent: 'claude', cwd: os.tmpdir(), runId: 'r1', resume: false, extra: {}, ...o });
const KINDS: Partial<SpawnInfo>[] = [{ agent: 'claude' }, { agent: 'codex' }, { agent: 'acp', acpAgent: 'console' }, { agent: 'acp', acpAgent: 'other' }];

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('the wording is exactly the three bullets under their heading, with and without the sym clause', () => {
  assert.equal(stepsText({ shell: true, sym: true }), WITH_SYM);
  assert.equal(stepsText({ shell: true, sym: false }), WITHOUT_SYM);
  assert.equal(WITHOUT_SYM.split('\n')[2], '- When looking around code, put several lookups in one command: several grep or sed -n ranges chained in one shell command.');
  assert.equal(stepsText({ shell: false, sym: true }), BROWSER_ONLY);
  assert.equal(stepsText({ shell: false, sym: false }), BROWSER_ONLY);
});

test('every agent kind gets the text, with sym only when it is offered', async () => {
  for (const [offered, want] of [[['waitfor', 'edits', 'sym'], WITH_SYM], [['sym'], WITH_SYM], [['waitfor', 'edits'], WITHOUT_SYM], [[], WITHOUT_SYM]] as const) {
    const f = createSteps(() => offered);
    for (const k of KINDS) assert.deepEqual(await f.spawn!(info(k), deps), { instructions: [want] }, `${offered.join(',')} / ${k.agent} ${k.acpAgent ?? ''}`);
    // On resume, with a model, a lean start: the same.
    assert.deepEqual(await f.spawn!(info({ resume: true, lean: true, model: 'm' }), deps), { instructions: [want] });
  }
  // The text is the same for every session once the answer is (the provider's cache).
  const f = createSteps(() => ['sym']);
  assert.equal((await f.spawn!(info(), deps))!.instructions![0], (await f.spawn!(info({ agent: 'codex', cwd: '/elsewhere', runId: 'r2' }), deps))!.instructions![0]);
});

test('a session that works in one browser tab gets the first bullet and the heading only', async () => {
  for (const offered of [['sym'], []]) assert.deepEqual(await createSteps(() => offered).spawn!(info({ extra: { browserOnly: true } }), deps), { instructions: [BROWSER_ONLY] });
});

test('sym is offered as the shell tools offer it: only after a passed test run, and not while they are off', async () => {
  const root = path.join(os.tmpdir(), `hydor-steps-test-${process.pid}`);
  const bin = path.join(root, 'scripts', 'agent-tools', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  try {
    for (const t of TOOLS) {
      const body = t === 'sym' ? 'console.log("check.ts\\n  1-3  export function greet(name: string) {");' : 'console.log("ok");';
      fs.writeFileSync(path.join(bin, t), `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
    }
    // The real capability's answer, read-only: nothing is offered before its test runs have finished.
    assert.deepEqual(offeredShellTools(), []);
    const f = createShellTools({ dir: () => path.join(root, 'shim'), node: process.execPath, root, rg: undefined, basePath: () => '/usr/bin' });
    f.start!(deps);
    await f.ready();
    assert.deepEqual(f.passed(), ['waitfor', 'job', 'edits', 'sym', 'leancheck']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // The shared instance has not been started in this process: it offers nothing, so the text has no sym clause.
  assert.equal((await steps.spawn!(info(), deps))!.instructions![0], WITHOUT_SYM);
});

test('it is a capability of the app, once, right after shelltools, and its text reaches every kind through the registry', async () => {
  const ids = FEATURES.map((f) => f.id);
  assert.equal(ids.filter((id) => id === 'steps').length, 1);
  assert.equal(ids.indexOf('steps'), ids.indexOf('shelltools') + 1);
  assert.ok(FEATURES.includes(steps));
  registerFeatures([createSteps(() => ['sym'])], deps);
  try {
    for (const k of KINDS) {
      const add = await spawnAdditions({ ...info(k) });
      assert.equal(add.instructions.filter((t) => t.startsWith('Every separate tool step')).length, 1, `${k.agent} is told once`);
      assert.ok(add.instructions.includes(WITH_SYM));
    }
  } finally {
    registerFeatures([], null as unknown as Deps);
  }
});

test('nothing turns it off: the module reads no setting, no kv value, no environment variable and no database', () => {
  const src = fs.readFileSync(path.join(APP_ROOT, 'server', 'steps', 'index.ts'), 'utf8');
  const code = src.split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /process\.env|\benv\b|kv|Setting|settings|\bdb\b|\.\.\/db|assistants\/store|config\.ts/i);
  assert.deepEqual([...code.matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]), ['../shelltools/index.ts', '../features/types.ts']);
  // The spawn does not even take the database: it answers from the session and the shell tools' own state.
  assert.equal(steps.spawn!.length, 1);
  // And no Settings option, environment variable or setting row names it.
  for (const f of ['server/tui/settings-table.ts', 'shared/find-catalog.ts', 'docs/configuration.md']) {
    const text = fs.readFileSync(path.join(APP_ROOT, f), 'utf8');
    assert.doesNotMatch(text, /fewer, fuller steps|HYDOR_STEPS|stepsText/i, f);
  }
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exit(1);
  }
}
console.log(`steps ok (${passed} tests)`);

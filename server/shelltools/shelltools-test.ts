// The commands every agent gets on its PATH (waitfor, edits, sym: server/shelltools): the launchers the server writes
// (quoted for any path, rewritten only when a path changes, run with no node on the PATH), the test runs that decide which
// tools agents hear of, the PATH and instructions a starting session gets (shim folder first, once, only the tools that
// work, nothing before the test runs end or when all failed), the switch HYDOR_SHELL_TOOLS=0, that no other capability
// puts a PATH in what it adds, how the PATH reaches Claude Code's, Codex's and Custom's environments, and that the
// desktop apps' staging ships the tools.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/shelltools/shelltools-test.ts && DATA_DIR=/tmp/hydor-test-shelltools node dist/dev/shelltools-test.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acpAgents } from '../agents/acp.ts';
import { claudeSpec } from '../agents/claude.ts';
import { codexSpec } from '../agents/codex.ts';
import { APP_ROOT } from '../config.ts';
import { openDb } from '../db.ts';
import { FEATURES } from '../features/index.ts';
import { registerFeatures, spawnAdditions } from '../features/registry.ts';
import type { Deps, SpawnInfo } from '../features/types.ts';
import { WIN } from '../platform.ts';
import { createShellTools, launcherText, pathWith, shellToolsOn, shellToolsText, shQuote, SHELL_TOOLS_HEAD, TOOLS, tryLaunchers, writeLaunchers } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-shelltools-test-'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const quiet = async <T>(fn: () => Promise<T> | T): Promise<{ result: T; logged: string[] }> => {
  const logged: string[] = [];
  const log = console.log;
  const err = console.error;
  console.log = (...a: unknown[]) => void logged.push(a.join(' '));
  console.error = (...a: unknown[]) => void logged.push(a.join(' '));
  try {
    return { result: await fn(), logged };
  } finally {
    console.log = log;
    console.error = err;
  }
};
/** A shell with nothing but the launchers' folder and the system's: what an agent's shell has on a Mac or Linux, node never. */
const bare = (dir: string, line: string, o: { cwd?: string; input?: string } = {}) =>
  spawnSync('/usr/bin/env', ['-i', `PATH=${dir}:/usr/bin:/bin`, `HOME=${tmp}`, 'bash', '-c', line], { cwd: o.cwd ?? tmp, input: o.input, encoding: 'utf8', timeout: 60_000 });
/** A file that exists, for a ripgrep that is there. */
const anyFile = process.execPath;
const nodeOnBarePath = !!spawnSync('/usr/bin/env', ['-i', 'PATH=/usr/bin:/bin', 'bash', '-c', 'command -v node'], { encoding: 'utf8' }).stdout.trim();

/** A folder shaped like the app's, with tools of three lines each: what they do is set by `mode`. */
function fakeRoot(name: string, bad: string[] = []) {
  const root = path.join(tmp, name);
  const bin = path.join(root, 'scripts', 'agent-tools', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const t of TOOLS) {
    const body = bad.includes(t)
      ? 'process.stderr.write("broken on purpose\\n"); process.exit(1);'
      : t === 'sym'
        ? 'console.log("check.ts\\n  1-3  export function greet(name: string) {");'
        : 'console.log("ok " + process.argv.slice(2).join(" "));';
    fs.writeFileSync(path.join(bin, t), `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  }
  return root;
}
const fakeDeps = (db: unknown) => ({ db, publicBase: () => 'http://127.0.0.1:1' }) as unknown as Deps;
const info = (o: Partial<SpawnInfo> = {}): SpawnInfo => ({ agent: 'claude', cwd: tmp, runId: 'r1', resume: false, extra: {}, ...o });

test('the launcher text: exec of the node and the tool, both quoted, and for sym HYDOR_RG first', () => {
  const l = { node: '/opt/n ode/bin/node', script: '/opt/app/scripts/agent-tools/bin/waitfor', rg: '/opt/app/rg' };
  assert.equal(launcherText('waitfor', l).split('\n').slice(2).join('\n'), 'exec "/opt/n ode/bin/node" "/opt/app/scripts/agent-tools/bin/waitfor" "$@"\n');
  const sym = launcherText('sym', { ...l, script: '/opt/app/scripts/agent-tools/bin/sym' });
  assert.match(sym, /^#!\/bin\/sh\n/);
  assert.match(sym, /\nexport HYDOR_RG="\/opt\/app\/rg"\nexec "\/opt\/n ode\/bin\/node" "\/opt\/app\/scripts\/agent-tools\/bin\/sym" "\$@"\n$/);
  assert.doesNotMatch(launcherText('edits', l), /HYDOR_RG/);
  assert.equal(shQuote('a"b$c`d\\e'), '"a\\"b\\$c\\`d\\\\e"');
});

test('launchers run with spaces, quotes, dollars and backslashes in the paths, and pass their arguments through', () => {
  if (WIN) return; // a Windows file name cannot hold a quote
  const odd = path.join(tmp, 'we ird "dir" $HOME `x` \\y', 'app root');
  const root = path.join(odd, 'root');
  const bin = path.join(root, 'scripts', 'agent-tools', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const t of TOOLS) fs.writeFileSync(path.join(bin, t), `#!/usr/bin/env node\nconsole.log(JSON.stringify({ t: ${JSON.stringify(t)}, args: process.argv.slice(2), rg: process.env.HYDOR_RG ?? null }));\n`, { mode: 0o755 });
  const nodeDir = path.join(odd, 'no de');
  fs.mkdirSync(nodeDir, { recursive: true });
  const node = path.join(nodeDir, 'node');
  fs.symlinkSync(process.execPath, node);
  const rg = path.join(odd, 'r"g');
  fs.writeFileSync(rg, '#!/bin/sh\n', { mode: 0o755 });
  const dir = path.join(odd, 'shim bin');
  writeLaunchers(dir, TOOLS, { node, root, rg });
  for (const t of TOOLS) {
    const r = bare(dir, `${t} 'a b' "it's" '$X'`);
    assert.equal(r.status, 0, `${t}: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), { t, args: ['a b', "it's", '$X'], rg: t === 'sym' ? rg : null });
  }
  // A ripgrep that is not there is left out.
  writeLaunchers(dir, TOOLS, { node, root, rg: path.join(odd, 'none') });
  assert.equal(JSON.parse(bare(dir, 'sym x').stdout).rg, null);
});

test('launchers are written 0755, atomically, and again only when a path changed', () => {
  const dir = path.join(tmp, 'shim-rewrite');
  const a = { node: '/n/node', root: '/app/one' };
  assert.deepEqual(writeLaunchers(dir, TOOLS, a), ['waitfor', 'edits', 'sym']);
  for (const t of TOOLS) assert.equal(fs.statSync(path.join(dir, t)).mode & 0o777, WIN ? fs.statSync(path.join(dir, t)).mode & 0o777 : 0o755);
  assert.deepEqual(writeLaunchers(dir, TOOLS, a), [], 'the same paths: nothing written');
  const before = fs.statSync(path.join(dir, 'sym')).ino;
  writeLaunchers(dir, TOOLS, a);
  assert.equal(fs.statSync(path.join(dir, 'sym')).ino, before, 'the same file');
  assert.deepEqual(writeLaunchers(dir, TOOLS, { ...a, root: '/app/two' }), ['waitfor', 'edits', 'sym'], 'the app moved');
  assert.match(fs.readFileSync(path.join(dir, 'edits'), 'utf8'), /"\/app\/two\/scripts\/agent-tools\/bin\/edits"/);
  assert.deepEqual(writeLaunchers(dir, TOOLS, { node: '/other/node', root: '/app/two' }), ['waitfor', 'edits', 'sym'], 'another node');
  assert.deepEqual(writeLaunchers(dir, TOOLS, { node: '/other/node', root: '/app/two', rg: anyFile }), ['sym'], 'a ripgrep appears: only sym changes');
  if (!WIN) {
    fs.chmodSync(path.join(dir, 'waitfor'), 0o644);
    assert.deepEqual(writeLaunchers(dir, TOOLS, { node: '/other/node', root: '/app/two', rg: anyFile }), [], 'a lost executable bit is put back, not counted as a rewrite');
    assert.equal(fs.statSync(path.join(dir, 'waitfor')).mode & 0o777, 0o755);
  }
  assert.deepEqual(fs.readdirSync(dir).sort(), ['edits', 'sym', 'waitfor'], 'no temporary files left');
  assert.deepEqual(writeLaunchers(path.join(tmp, 'shim-win'), ['sym'], { node: 'C:\\n\\node.exe', root: 'C:\\app', win: true }), ['sym', 'sym.cmd']);
  assert.equal(fs.readFileSync(path.join(tmp, 'shim-win', 'sym.cmd'), 'utf8'), `@"C:\\n\\node.exe" "${path.join('C:\\app', 'scripts', 'agent-tools', 'bin', 'sym')}" %*\r\n`);
});
test('pathWith puts the folder first, once', () => {
  const d = path.delimiter;
  assert.equal(pathWith('/s/bin', `/usr/bin${d}/bin`), `/s/bin${d}/usr/bin${d}/bin`);
  assert.equal(pathWith('/s/bin', `/usr/bin${d}/s/bin${d}/bin${d}/s/bin/`), `/s/bin${d}/usr/bin${d}/bin`);
  assert.equal(pathWith('/s/bin', undefined), '/s/bin');
});

test('the real tools run from the launchers with no node on the PATH, and sym reads TypeScript with its parser', async () => {
  const dir = path.join(tmp, 'shim-real');
  writeLaunchers(dir, TOOLS, { node: process.execPath, root: APP_ROOT, rg: undefined });
  if (!WIN) {
    for (const t of TOOLS) {
      const r = bare(dir, `${t} --help`);
      assert.equal(r.status, 0, `${t} --help: ${r.stderr}`);
    }
    if (!nodeOnBarePath) assert.equal(bare(dir, 'command -v node').stdout.trim(), '', 'no node on that PATH');
    else console.log('  (this system has a node in /usr/bin: the no-node check proves less here)');
  }
  const r = await tryLaunchers(dir, TOOLS);
  assert.deepEqual(r, { waitfor: null, edits: null, sym: null });
  assert.deepEqual(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('hydor-shelltools-') && fs.existsSync(path.join(os.tmpdir(), f, 'check.ts'))), [], 'the test runs clean up their folder');
  // edits through the launcher changes a file.
  if (!WIN) {
    fs.writeFileSync(path.join(tmp, 'note.txt'), 'one\ntwo\n');
    const e = bare(dir, 'edits', { input: '=== note.txt\n<<<<<<< SEARCH\ntwo\n=======\n2\n>>>>>>> REPLACE\n' });
    assert.equal(e.status, 0, e.stderr);
    assert.equal(fs.readFileSync(path.join(tmp, 'note.txt'), 'utf8'), 'one\n2\n');
  }
});

test('a tool that does not run, or whose parser fails, is named with its reason', async () => {
  const root = fakeRoot('root-bad', ['edits']);
  const dir = path.join(tmp, 'shim-bad');
  writeLaunchers(dir, TOOLS, { node: process.execPath, root });
  const r = await tryLaunchers(dir, TOOLS);
  assert.equal(r.waitfor, null);
  assert.equal(r.sym, null);
  assert.match(r.edits ?? '', /exit 1.*broken on purpose/);
  // sym that prints the wrong range does not pass.
  fs.writeFileSync(path.join(root, 'scripts/agent-tools/bin/sym'), '#!/usr/bin/env node\nconsole.log("check.ts\\n  1-9  function greet");\n');
  assert.match((await tryLaunchers(dir, TOOLS)).sym ?? '', /outline of a TypeScript file was wrong/);
});

test('spawn: nothing before the test runs end; then the shim folder first on the PATH, once, and only the tools that passed', async () => {
  const root = fakeRoot('root-one-bad', ['edits']);
  const dir = path.join(tmp, 'shim-spawn');
  const base = `/home/u/.local/bin${path.delimiter}/usr/bin${path.delimiter}/bin`;
  const f = createShellTools({ dir: () => dir, node: process.execPath, root, rg: undefined, basePath: () => base });
  assert.equal(await f.spawn!(info(), fakeDeps(null)), undefined, 'not started');
  const { logged } = await quiet(async () => {
    f.start!(fakeDeps(null));
    assert.equal(await f.spawn!(info(), fakeDeps(null)), undefined, 'started, the test runs not finished');
    assert.equal(fs.existsSync(path.join(dir, 'sym')), true, 'the launchers are written at once');
    await f.ready();
  });
  assert.deepEqual(f.passed(), ['waitfor', 'sym']);
  assert.equal(logged.filter((l) => /edits does not run/.test(l) && /broken on purpose/.test(l)).length, 1, 'one line for the failure');
  assert.equal(logged.filter((l) => /does not run/.test(l)).length, 1, 'and none for the tools that work');
  const a = (await f.spawn!(info(), fakeDeps(null)))!;
  assert.equal(a.env!.PATH, `${dir}${path.delimiter}${base}`);
  assert.equal(a.env!.PATH.split(path.delimiter).filter((d) => d === dir).length, 1);
  assert.deepEqual(Object.keys(a.env!), ['PATH']);
  assert.equal(a.instructions!.length, 1);
  assert.match(a.instructions![0], /^Shell commands this app adds to your PATH \(each has --help\):\n- waitfor: /);
  assert.match(a.instructions![0], /\n- sym NAME\.\.\.: /);
  assert.doesNotMatch(a.instructions![0], /edits/);
  assert.equal(a.instructions![0], shellToolsText(['waitfor', 'sym']));
  // The PATH the session's start says it would get wins over the login shell's, and a shim folder already in it is not doubled.
  const b = (await f.spawn!(info({ path: `/mine${path.delimiter}${dir}${path.delimiter}/bin` }), fakeDeps(null)))!;
  assert.equal(b.env!.PATH, `${dir}${path.delimiter}/mine${path.delimiter}/bin`);
  // The same text for every session (the provider's cache), whatever the agent.
  assert.deepEqual((await f.spawn!(info({ agent: 'codex' }), fakeDeps(null)))!.instructions, a.instructions);
  assert.deepEqual((await f.spawn!(info({ agent: 'acp', acpAgent: 'console' }), fakeDeps(null)))!.instructions, a.instructions);
  // A session that works in one browser tab has no shell.
  assert.equal(await f.spawn!(info({ extra: { browserOnly: true } }), fakeDeps(null)), undefined);
});

test('the text names every tool when all pass, and is built from the three parts', () => {
  const all = shellToolsText(TOOLS);
  assert.equal(all.split('\n').length, 4);
  assert.equal(all.split('\n')[0], SHELL_TOOLS_HEAD);
  assert.deepEqual(all.split('\n').slice(1).map((l) => l.split(':')[0]), ['- waitfor', '- edits', '- sym NAME...']);
  assert.ok(all.length < 1700, `${all.length} characters`);
});

test('all tools failed: nothing is returned', async () => {
  const root = fakeRoot('root-all-bad', [...TOOLS]);
  const f = createShellTools({ dir: () => path.join(tmp, 'shim-allbad'), node: process.execPath, root, rg: undefined, basePath: () => '/usr/bin' });
  const { logged } = await quiet(async () => {
    f.start!(fakeDeps(null));
    await f.ready();
  });
  assert.deepEqual(f.passed(), []);
  assert.equal(logged.filter((l) => /does not run/.test(l)).length, 3);
  assert.equal(await f.spawn!(info(), fakeDeps(null)), undefined);
});

test('HYDOR_SHELL_TOOLS=0 turns it off: no launchers, nothing returned', async () => {
  const root = fakeRoot('root-off');
  const dir = path.join(tmp, 'shim-off');
  assert.equal(shellToolsOn({}), true);
  for (const v of ['0', 'off', 'false', ' 0 ']) assert.equal(shellToolsOn({ HYDOR_SHELL_TOOLS: v }), false, v);
  for (const v of ['1', 'on', '']) assert.equal(shellToolsOn({ HYDOR_SHELL_TOOLS: v }), true, v);
  const was = process.env.HYDOR_SHELL_TOOLS;
  try {
    process.env.HYDOR_SHELL_TOOLS = '0';
    const f = createShellTools({ dir: () => dir, node: process.execPath, root, rg: undefined, basePath: () => '/usr/bin' });
    f.start!(fakeDeps(null));
    await f.ready();
    assert.equal(fs.existsSync(dir), false, 'nothing written');
    assert.equal(await f.spawn!(info(), fakeDeps(null)), undefined);
    // Switched off after it worked: sessions started from then on get nothing.
    delete process.env.HYDOR_SHELL_TOOLS;
    const g = createShellTools({ dir: () => dir, node: process.execPath, root, rg: undefined, basePath: () => '/usr/bin' });
    g.start!(fakeDeps(null));
    await g.ready();
    assert.ok(await g.spawn!(info(), fakeDeps(null)));
    process.env.HYDOR_SHELL_TOOLS = '0';
    assert.equal(await g.spawn!(info(), fakeDeps(null)), undefined);
  } finally {
    if (was === undefined) delete process.env.HYDOR_SHELL_TOOLS;
    else process.env.HYDOR_SHELL_TOOLS = was;
  }
});

test('it is a capability of the app, and no other capability puts a PATH in what it adds', async () => {
  assert.ok(FEATURES.some((f) => f.id === 'shelltools'));
  assert.equal(FEATURES.filter((f) => f.id === 'shelltools').length, 1);
  const db = openDb(path.join(tmp, 'features.db'));
  const deps = fakeDeps(db);
  let asked = 0;
  const { logged } = await quiet(async () => {
    for (const f of FEATURES) {
      if (f.id === 'shelltools' || !f.spawn) continue;
      for (const agent of ['claude', 'codex', 'acp'] as const) {
        let a;
        try {
          a = await f.spawn(info({ agent, acpAgent: agent === 'acp' ? 'console' : undefined }), deps);
          asked++;
        } catch {
          continue; // the registry skips a capability that throws: it adds nothing
        }
        const keys = Object.keys(a?.env ?? {});
        assert.ok(!keys.some((k) => k.toUpperCase() === 'PATH'), `${f.id} returns ${keys.join(', ')}`);
      }
    }
  });
  assert.ok(asked > 20, `${asked} capability starts were asked (${logged.length} lines logged)`);
});

test('the PATH reaches the environment of Claude Code, Codex and Custom, and their shells find the tools', async () => {
  const root = fakeRoot('root-kinds');
  const dir = path.join(tmp, 'shim-kinds');
  const f = createShellTools({ dir: () => dir, node: process.execPath, root, rg: undefined });
  registerFeatures([f], fakeDeps(null));
  try {
    await quiet(async () => {
      f.start!(fakeDeps(null));
      await f.ready();
    });
    // What sessions.ts starts each kind with: the agents' base environment (a login shell's, no node), the account's, then
    // what the capabilities add, with the PATH it composed from the start's own.
    const base: Record<string, string> = { HOME: tmp, PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' };
    const db = openDb(path.join(tmp, 'kinds.db'));
    const customDef = acpAgents(db).find((d) => d.id === 'console')!;
    const kinds: [string, SpawnInfo, Record<string, string>][] = [
      ['claude', info({ agent: 'claude' }), { ...base }],
      ['codex', info({ agent: 'codex' }), { ...base }],
      ['custom', info({ agent: 'acp', acpAgent: 'console' }), { ...base, ...customDef.env }],
      // An agent the user added with a PATH of its own: the shim folder goes before it, and it is kept.
      ['other', info({ agent: 'acp', acpAgent: 'x' }), { ...base, PATH: '/opt/mine/bin:/usr/bin:/bin' }],
    ];
    for (const [kind, s, env] of kinds) {
      const add = await spawnAdditions({ ...s, path: env.PATH });
      Object.assign(env, add.env);
      assert.equal(env.PATH, `${dir}${path.delimiter}${kind === 'other' ? '/opt/mine/bin:/usr/bin:/bin' : '/usr/bin:/bin'}`, kind);
      assert.equal(add.instructions.filter((t) => t.startsWith(SHELL_TOOLS_HEAD)).length, 1, `${kind} is told once`);
      // The environment each kind's process is started with.
      let spec: { env: Record<string, string>; args: string[] } | null = null;
      if (kind === 'claude') spec = claudeSpec({ cwd: tmp, sessionId: 's1', add }, env);
      if (kind === 'codex') spec = codexSpec({ cwd: tmp, add }, env);
      const got = spec ? spec.env : env;
      assert.equal(got.PATH, env.PATH, `${kind}'s process gets it`);
      if (kind === 'claude') assert.ok(spec!.args.join('\n').includes(SHELL_TOOLS_HEAD), 'Claude Code is told in its system prompt');
      if (!WIN) {
        // …and the shell the agent runs commands in (it inherits that environment; sh -c as Custom's tool does).
        const r = spawnSync('/usr/bin/env', ['-i', ...Object.entries(got).map(([k, v]) => `${k}=${v}`), 'bash', '-c', 'command -v waitfor edits sym'], { encoding: 'utf8' });
        assert.deepEqual(r.stdout.trim().split('\n'), TOOLS.map((t) => path.join(dir, t)), `${kind}'s shell finds the tools: ${r.stderr}`);
      }
    }
  } finally {
    registerFeatures([], null as unknown as Deps);
  }
});

test('sessions.ts hands each kind its PATH to the capabilities', () => {
  const src = fs.readFileSync(path.join(APP_ROOT, 'server', 'sessions.ts'), 'utf8');
  assert.equal((src.match(/spawnAdditions\(\{[^\n]*path: env\.PATH \}\)/g) ?? []).length, 3, 'Claude Code, Codex and the ACP agents (Custom among them)');
});

test('the desktop apps ship the tools: stage.sh names both folders (not the tests), the launchers and the smoke check are there', () => {
  const stage = fs.readFileSync(path.join(APP_ROOT, 'desktop/scripts/stage.sh'), 'utf8');
  const list = stage.slice(stage.indexOf('tar -cf - \\'), stage.indexOf('tar -xf -'));
  assert.match(list, /(^|\s)scripts\/agent-tools\/bin(\s|\\)/m);
  assert.match(list, /(^|\s)scripts\/agent-tools\/lib(\s|\\)/m);
  assert.doesNotMatch(list, /agent-tools\/(test|fixtures)/);
  assert.doesNotMatch(list, /(^|\s)scripts\/agent-tools(\s|\\)/m, 'not the whole folder');
  // Everything under server/ goes in the app, and the app's runtime copy takes the whole server folder.
  assert.match(fs.readFileSync(path.join(APP_ROOT, 'desktop/electron-builder.cjs'), 'utf8'), /filter: \['server\/\*\*\/\*'/);
  assert.match(fs.readFileSync(path.join(APP_ROOT, 'desktop/main.cjs'), 'utf8'), /for \(const part of \['server', 'node', 'bin'\]\)/);
  // The tools are what the checks run: the shipped files exist here as stage.sh would copy them.
  for (const t of TOOLS) assert.ok(fs.existsSync(path.join(APP_ROOT, 'scripts/agent-tools/bin', t)), t);
  assert.ok(fs.existsSync(path.join(APP_ROOT, 'scripts/agent-tools/lib/sym/cli.mjs')));
  assert.match(fs.readFileSync(path.join(APP_ROOT, 'desktop/scripts/smoke.mjs'), 'utf8'), /shelltools[\s\S]*waitfor[\s\S]*sym --outline/);
  // Docker and a checkout have the folder: the image copies the whole repository, and .dockerignore keeps it.
  assert.match(fs.readFileSync(path.join(APP_ROOT, 'Dockerfile'), 'utf8'), /^COPY --chown=node:node \. \.$/m);
  const ignored = fs.readFileSync(path.join(APP_ROOT, '.dockerignore'), 'utf8').split('\n').map((l) => l.trim());
  assert.ok(!ignored.some((l) => /^\/?scripts/.test(l) || /agent-tools/.test(l)), '.dockerignore leaves scripts/ in');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`shelltools ok (${passed} tests)`);

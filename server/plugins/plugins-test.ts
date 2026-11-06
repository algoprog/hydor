// Checks for plugins, run as a script (no test framework): reading a folder as Agent Plugins 1.0 says
// (and Claude Code's layout), versions, adding one from a folder and a .zip with the plugins it needs, turning
// them on and off together, setup (stand-ins for npm and uv), what agents get (servers through the launcher,
// instructions, skills through the library), the editor and packing a plugin, and every built-in plugin.
//
//   OUTDIR=dist/dev node scripts/build-server.mjs server/plugins/plugins-test.ts
//   DATA_DIR=/tmp/hydor-test-plugins node dist/dev/plugins-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import Fastify from 'fastify';
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_SCHEMA, satisfies, validPluginName, type PluginJob, type PluginList, type PluginPreview, type PluginView } from '../../shared/plugins.ts';
import type { ServerEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT } from '../config.ts';
import { vaultTables } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import type { SessionManager } from '../sessions.ts';
import { librarySkills, setFolders, viewSkills } from '../skillpack/library.ts';
import { ManifestError, readPlugin } from './manifest.ts';
import { parseGitLink, plugins, setPluginRoots } from './index.ts';
import { gpuPip, runSetup, setupEnv, setupHash, setupOf, setupTesting } from './setup.ts';
import { requiresOf } from './manifest.ts';
import { noRequires, type PluginRequires } from '../../shared/plugins.ts';

let passed = 0;
const failures: string[] = [];
async function test(name: string, fn: () => unknown) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  FAIL ${name}\n       ${(e as Error).stack?.split('\n').slice(0, 6).join('\n       ')}`);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-plugins-'));
const BUILTIN = path.join(root, 'builtin');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const manifest = (name: string, extra: Record<string, unknown> = {}) => json({ $schema: AGENT_PLUGINS_SCHEMA, name, version: '1.0.0', description: `The ${name} plugin`, ...extra });
const skill = (name: string, body = 'Steps to follow when this applies, one after another.\n') => `---\nname: ${name}\ndescription: Use when testing ${name}.\n---\n\n# ${name}\n\n${body}`;

// The launcher, built as the app builds it.
const launcher = path.join(root, 'pluginlaunch.js');
buildSync({ entryPoints: [path.join(APP_ROOT, 'server/plugins/launch.ts')], outfile: launcher, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning' });

setFolders({ bundled: path.join(root, 'bundled'), learned: path.join(root, 'learned'), view: path.join(root, 'skillview', 'naget') });
write(path.join(root, 'bundled', 'research', 'SKILL.md'), skill('research'));
setPluginRoots({ builtin: BUILTIN, base: path.join(root, 'data'), launcher });

// Built-in plugins for the tests: one others need, one that needs it, one with packages to set up.
write(path.join(BUILTIN, 'base-tools', 'plugin.json'), manifest('base-tools', { version: '1.2.0', extensions: { 'com.naget.agent': { title: 'Base tools' } } }));
write(path.join(BUILTIN, 'base-tools', 'skills', 'base-guide', 'SKILL.md'), skill('base-guide', 'Use ${PLUGIN_ROOT}/files/table.csv and keep notes in ${PLUGIN_DATA}.\n'));
write(path.join(BUILTIN, 'base-tools', 'skills', 'base-guide', 'references', 'more.md'), 'More.\n');
write(path.join(BUILTIN, 'base-tools', 'skills', 'research', 'SKILL.md'), skill('research'));
write(path.join(BUILTIN, 'base-tools', 'files', 'table.csv'), 'a,b\n1,2\n');
write(path.join(BUILTIN, 'base-tools', 'com.naget.agent', 'instructions.md'), 'Base tools are here: ${PLUGIN_ROOT}.\n');
write(
  path.join(BUILTIN, 'base-tools', 'mcp.json'),
  json({
    $schema: AGENT_PLUGINS_MCP_SCHEMA,
    mcpServers: {
      echo: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server.mjs'], env: { WHERE: '${PLUGIN_DATA}/x' } },
      docs: { type: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: { 'X-Tenant': 'public' } },
      old: { type: 'sse', url: 'https://legacy.example.com/sse' },
    },
  }),
);
write(path.join(BUILTIN, 'base-tools', 'server.mjs'), "process.stdout.write(JSON.stringify({ root: process.env.PLUGIN_ROOT, data: process.env.PLUGIN_DATA, where: process.env.WHERE, cwd: process.cwd(), key: process.env.TEST_KEY ?? null }) + '\\n');\n");
write(path.join(BUILTIN, 'needs-base', 'plugin.json'), manifest('needs-base', { extensions: { 'com.naget.agent': { title: 'Needs base', requires: { plugins: { 'base-tools': '^1.0.0' } } } } }));
write(path.join(BUILTIN, 'needs-base', 'skills', 'on-top', 'SKILL.md'), skill('on-top'));
write(
  path.join(BUILTIN, 'with-setup', 'plugin.json'),
  manifest('with-setup', { extensions: { 'com.naget.agent': { title: 'With setup', requires: { npm: { 'left-pad': '1.3.0' }, pip: ['tinypkg>=1,<2'], commands: ['definitely-not-a-program-xyz'], keys: ['TEST_KEY'] } } } }),
);
write(path.join(BUILTIN, 'with-setup', 'mcp.json'), json({ $schema: AGENT_PLUGINS_MCP_SCHEMA, mcpServers: { tool: { type: 'stdio', command: 'python', args: ['-V'] } } }));

const db = openDb(path.join(root, 'test.db'));
vaultTables(db);
const events: ServerEvent[] = [];
const app = Fastify({ bodyLimit: 400 << 20 });
app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : (err.statusCode ?? 500)).send({ error: err.message || 'Error' });
});
const deps: Deps = {
  app,
  db,
  sessions: new EventEmitter() as unknown as SessionManager,
  scheduler: null as never,
  models: null as never,
  broadcast: (e) => events.push(e),
  toSubscribers: () => {},
  publicBase: () => 'https://agent.example',
};
plugins.routes!(deps);
plugins.start!(deps);

const call = async <T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown): Promise<T> => {
  const r = await app.inject({ method, url, payload: payload as never });
  const body = r.headers['content-type']?.toString().includes('json') ? r.json() : r.rawPayload;
  if (r.statusCode >= 400) throw new Error(`${method} ${url}: ${r.statusCode} ${(body as { error?: string }).error ?? ''}`);
  return body as T;
};
const waitJob = async (job: PluginJob): Promise<PluginJob> => {
  for (let i = 0; i < 200; i++) {
    const j = (await call<{ job: PluginJob }>('GET', `/api/plugins/jobs/${job.id}`)).job;
    if (j.state !== 'running') return j;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('the job did not end');
};
const listNow = () => call<PluginList>('GET', '/api/plugins');
const waitJobLong = async (job: PluginJob): Promise<PluginJob> => {
  for (let i = 0; i < 2400; i++) {
    const j = (await call<{ job: PluginJob }>('GET', `/api/plugins/jobs/${job.id}`)).job;
    if (j.state !== 'running') return j;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the job did not end in 20 minutes');
};
const additions = async (agent: 'claude' | 'codex' | 'acp', acpAgent?: string) => plugins.spawn!({ agent, acpAgent, cwd: root, runId: 'r', resume: false, extra: {} }, deps);

console.log('the format');

await test('names and versions', () => {
  for (const n of ['my-plugin', 'acme.tools', 'lint3r', 'a']) assert.ok(validPluginName(n), n);
  for (const n of ['My-Plugin', '-start', 'has--double', 'too.many..dots', '', 'end-', 'a.-b']) assert.ok(!validPluginName(n), n);
  assert.ok(satisfies('1.2.3', '^1.0.0'));
  assert.ok(!satisfies('2.0.0', '^1.0.0'));
  assert.ok(satisfies('0.2.5', '^0.2.1'));
  assert.ok(!satisfies('0.3.0', '^0.2.1'));
  assert.ok(satisfies('1.2.9', '~1.2.3'));
  assert.ok(!satisfies('1.3.0', '~1.2.3'));
  assert.ok(satisfies('2.5.0', '>=2 <3'));
  assert.ok(satisfies('3.1.0', '^1 || ^3'));
  assert.ok(satisfies('1.4.0', '1.x'));
  assert.ok(satisfies(undefined, '*'));
  assert.ok(!satisfies(undefined, '^1'));
});

await test('a plugin as Agent Plugins 1.0 says: skills, servers (stdio, Streamable HTTP; old SSE left out), the extension', () => {
  const m = readPlugin(path.join(BUILTIN, 'base-tools'));
  assert.equal(m.format, 'agent-plugins');
  assert.equal(m.title, 'Base tools');
  assert.deepEqual(
    m.skills.map((s) => s.name),
    ['base-guide', 'research'],
  );
  assert.deepEqual(
    m.servers.map((s) => s.name),
    ['echo', 'docs'],
  );
  assert.match(m.serverInfo.find((s) => s.name === 'old')!.problem!, /SSE/);
  assert.match(m.instructions ?? '', /Base tools are here/);
});

await test('what rejects a plugin, and what only leaves a part out', () => {
  const dir = path.join(root, 'checks');
  write(path.join(dir, 'plugin.json'), json({ $schema: 'https://example.com/other.json', name: 'checks' }));
  assert.throws(() => readPlugin(dir), ManifestError, 'another $schema');
  write(path.join(dir, 'plugin.json'), json({ $schema: AGENT_PLUGINS_SCHEMA, name: 'Bad Name' }));
  assert.throws(() => readPlugin(dir), /name must be/);
  write(path.join(dir, 'plugin.json'), json({ $schema: AGENT_PLUGINS_SCHEMA, name: 'checks', version: 3 }));
  assert.throws(() => readPlugin(dir), /version must be text/);
  write(path.join(dir, 'plugin.json'), json({ $schema: AGENT_PLUGINS_SCHEMA, name: 'checks', commands: './x', extensions: 'no' }));
  write(
    path.join(dir, 'mcp.json'),
    json({
      $schema: AGENT_PLUGINS_MCP_SCHEMA,
      mcpServers: {
        escape: { type: 'stdio', command: '../bin/server' },
        shell: { type: 'stdio', command: 'node', env: { PLUGIN_ROOT: '/x' } },
        plain: { type: 'streamable-http', url: 'http://example.com/mcp' },
        local: { type: 'streamable-http', url: 'http://127.0.0.1:9000/mcp' },
        odd: { type: 'stdio', command: 'node', extra: true },
        ok: { type: 'stdio', command: './bin/run', cwd: '${PLUGIN_DATA}/work' },
      },
    }),
  );
  write(path.join(dir, 'bin', 'run'), '#!/bin/sh\n');
  write(path.join(dir, 'skills', 'good', 'SKILL.md'), skill('good'));
  write(path.join(dir, 'skills', 'other', 'SKILL.md'), skill('mismatch'));
  write(path.join(dir, 'skills', 'Bad_Name', 'SKILL.md'), skill('Bad_Name'));
  const m = readPlugin(dir);
  assert.deepEqual(
    m.servers.map((s) => s.name),
    ['local', 'ok'],
  );
  assert.deepEqual(
    m.skills.map((s) => s.name),
    ['good'],
  );
  assert.ok(m.problems.some((p) => /field the format does not allow, ignored: commands/.test(p)));
  assert.ok(m.problems.some((p) => /extensions is not an object/.test(p)));
  assert.ok(m.problems.some((p) => /escape: a command with a path must start with \.\//.test(p)));
  assert.ok(m.problems.some((p) => /plain: the url must be https/.test(p)));
  // mcp.json for another version: every server left out, the skills still there.
  write(path.join(dir, 'mcp.json'), json({ $schema: 'https://agent-plugins.org/schemas/2.0.0/mcp.schema.json', mcpServers: {} }));
  const m2 = readPlugin(dir);
  assert.equal(m2.servers.length, 0);
  assert.equal(m2.skills.length, 1);
});

await test("Claude Code's layout: .claude-plugin/plugin.json and .mcp.json with ${CLAUDE_PLUGIN_ROOT}", () => {
  const dir = path.join(root, 'claude-style');
  write(path.join(dir, '.claude-plugin', 'plugin.json'), json({ name: 'claude-style', version: '0.3.0', author: 'Someone', repository: { type: 'git', url: 'https://example.com/r' } }));
  write(path.join(dir, '.mcp.json'), json({ mcpServers: { srv: { command: '${CLAUDE_PLUGIN_ROOT}/server.js', args: ['--root', '${CLAUDE_PLUGIN_ROOT}'] } } }));
  write(path.join(dir, 'server.js'), '');
  write(path.join(dir, 'commands', 'hello.md'), 'Hello\n');
  write(path.join(dir, 'skills', 'cs', 'SKILL.md'), skill('cs'));
  const m = readPlugin(dir);
  assert.equal(m.format, 'claude');
  assert.equal(m.repository, 'https://example.com/r');
  const s = m.servers[0];
  assert.ok(s.type === 'stdio' && s.command === './server.js' && s.args[1] === '${PLUGIN_ROOT}');
  assert.deepEqual(m.claudeOnly, ['commands']);
});

await test('Git links as people paste them', () => {
  assert.deepEqual(parseGitLink('acme/tools'), { url: 'https://github.com/acme/tools', ref: undefined, subdir: undefined });
  assert.deepEqual(parseGitLink('https://github.com/acme/tools/tree/main/plugins/pdf'), { url: 'https://github.com/acme/tools', ref: 'main', subdir: 'plugins/pdf' });
  assert.deepEqual(parseGitLink('git@github.com:acme/tools.git', { subdir: 'x/' }), { url: 'git@github.com:acme/tools.git', ref: undefined, subdir: 'x' });
  assert.throws(() => parseGitLink('file:///etc'), /Git address/);
  assert.throws(() => parseGitLink('acme/tools', { subdir: '../up' }), /inside the repository/);
});

console.log('adding, turning on and off, removing');

await test('the built-in plugins are offered; adding one brings the plugins it needs first', async () => {
  let l = await listNow();
  assert.deepEqual(
    l.available.map((p) => p.name),
    ['base-tools', 'needs-base', 'with-setup'],
  );
  const job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { name: 'needs-base' })).job);
  assert.equal(job.state, 'done', job.error);
  assert.deepEqual(
    job.steps.map((s) => s.label),
    ['Adding Base tools', 'Adding Needs base'],
  );
  l = await listNow();
  assert.deepEqual(
    l.installed.map((p) => [p.name, p.enabled]),
    [
      ['base-tools', true],
      ['needs-base', true],
    ],
  );
  assert.deepEqual(l.installed.find((p) => p.name === 'base-tools')!.dependents, ['needs-base']);
});

await test('agents get their skills through the library: placeholders filled in, files linked, a name the library has left out', () => {
  const lib = librarySkills();
  const g = lib.find((s) => s.name === 'base-guide')!;
  assert.equal(g.source, 'plugin');
  assert.equal(g.plugin, 'base-tools');
  const text = fs.readFileSync(path.join(viewSkills(), 'base-guide', 'SKILL.md'), 'utf8');
  assert.ok(text.includes(`${path.join(BUILTIN, 'base-tools')}/files/table.csv`), 'PLUGIN_ROOT filled in');
  assert.ok(text.includes(path.join(root, 'data', 'data', 'base-tools')), 'PLUGIN_DATA filled in');
  assert.ok(fs.existsSync(path.join(viewSkills(), 'base-guide', 'references', 'more.md')), 'its other files are there');
  assert.equal(lib.find((s) => s.name === 'research')!.source, 'bundled', 'the library keeps its own research');
  assert.ok(fs.existsSync(path.join(viewSkills(), 'on-top', 'SKILL.md')));
});

await test('agents get their servers (stdio through the launcher, in the plugin with PLUGIN_ROOT and PLUGIN_DATA) and instructions', async () => {
  const a = (await additions('claude'))!;
  assert.deepEqual(Object.keys(a.mcpServers!).sort(), ['docs', 'echo']);
  const docs = a.mcpServers!.docs;
  assert.ok(docs.type === 'http' && docs.url === 'https://mcp.example.com/mcp' && docs.headers?.['X-Tenant'] === 'public');
  const echo = a.mcpServers!.echo;
  assert.ok(echo.type === 'stdio' && echo.command === process.execPath && echo.args![0] === launcher);
  const out = execFileSync(echo.command, echo.args!, { encoding: 'utf8', cwd: os.tmpdir() });
  const got = JSON.parse(out);
  const broot = path.join(BUILTIN, 'base-tools');
  assert.equal(got.root, broot);
  assert.equal(got.data, path.join(root, 'data', 'data', 'base-tools'));
  assert.equal(got.where, `${got.data}/x`);
  assert.equal(got.cwd, broot, 'started in its own folder');
  assert.match(a.instructions!.join('\n'), /Base tools are here: \//);
  assert.match(a.instructions!.join('\n'), /Its own files are in .*base-tools\/files/);
  // Custom and the other ACP agents get them too.
  assert.ok((await additions('acp', 'console'))!.mcpServers!.echo);
  assert.ok((await additions('acp', 'gemini'))!.mcpServers!.echo);
});

await test('turning off a plugin turns off those that need it; turning one on turns on what it needs', async () => {
  assert.deepEqual((await call('POST', '/api/plugins/base-tools/disable')).off, ['base-tools', 'needs-base']);
  assert.equal((await additions('codex'))?.mcpServers?.echo, undefined);
  assert.ok(!librarySkills().some((s) => s.name === 'on-top'), 'its skills are gone for agents');
  assert.ok(!fs.existsSync(path.join(viewSkills(), 'on-top')));
  assert.deepEqual((await call('POST', '/api/plugins/needs-base/enable')).on.sort(), ['base-tools', 'needs-base']);
  assert.ok(librarySkills().some((s) => s.name === 'on-top'));
});

await test('setup: packages in its own folder; not given to agents until it is ready; missing programs and keys said', async () => {
  const ran: string[] = [];
  let fail = true;
  setupTesting.run = async (cmd, args) => {
    ran.push(`${path.basename(cmd)} ${args.slice(0, 2).join(' ')}`);
    return fail && cmd === 'uv' && args[0] === 'pip' ? { code: 1, out: 'no such package' } : { code: 0, out: 'ok' };
  };
  try {
    let job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { name: 'with-setup' })).job);
    assert.equal(job.state, 'failed');
    assert.match(job.error!, /Installing Python packages: tinypkg failed/);
    let v = await call<PluginView>('GET', '/api/plugins/with-setup');
    assert.equal(v.setup.state, 'failed');
    assert.deepEqual(v.missing, { commands: ['definitely-not-a-program-xyz'], keys: ['TEST_KEY'], plugins: [] });
    assert.equal((await additions('claude'))?.mcpServers?.tool, undefined, 'not ready: not given');
    fail = false;
    job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/with-setup/setup')).job);
    assert.equal(job.state, 'done', job.error);
    assert.ok(ran.includes('npm install --ignore-scripts'), ran.join('; '));
    v = await call<PluginView>('GET', '/api/plugins/with-setup');
    assert.equal(v.setup.state, 'ready');
    const tool = (await additions('claude'))!.mcpServers!.tool;
    assert.ok(tool.type === 'stdio');
    const spec = JSON.parse(fs.readFileSync(tool.args![1], 'utf8'));
    assert.equal(spec.command, path.join(root, 'data', 'data', 'with-setup', 'venv', 'bin', 'python'), 'python is its own');
    assert.ok(spec.env.PATH.startsWith(path.join(root, 'data', 'data', 'with-setup', 'venv', 'bin')));
    assert.equal(spec.env.NODE_PATH, path.join(root, 'data', 'data', 'with-setup', 'node', 'node_modules'));
    assert.match((await additions('claude'))!.instructions!.join('\n'), /The With setup plugin is set up: its Python \(with tinypkg\)/);
  } finally {
    setupTesting.run = null;
  }
});

await test('setup for an NVIDIA GPU: its packages only where there is one, its servers finding their libraries; failing there leaves the CPU', async () => {
  const problems: string[] = [];
  const r: PluginRequires = requiresOf({ pip: ['faster-whisper>=1.1,<2'], pipNvidia: ['nvidia-cublas-cu12>=12,<13', '--index-url x'] }, problems);
  assert.deepEqual(r.pipNvidia, ['nvidia-cublas-cu12>=12,<13']);
  assert.deepEqual(problems, ['requires.pipNvidia: --index-url x is not a package']);
  const was = process.env.HYDOR_TEST_NVIDIA;
  const data = path.join(root, 'data', 'gpu-test');
  try {
    process.env.HYDOR_TEST_NVIDIA = '0';
    const plain = setupHash(r);
    assert.equal(plain, setupHash({ ...noRequires(), pip: r.pip }), 'without an NVIDIA GPU: as if it asked for none, so nothing is set up again');
    assert.deepEqual(gpuPip(r), []);
    process.env.HYDOR_TEST_NVIDIA = '1';
    assert.notEqual(setupHash(r), plain, 'with one: set up again, with them');
    const ran: string[] = [];
    const steps: string[] = [];
    setupTesting.run = async (cmd, args) => {
      ran.push(`${path.basename(cmd)} ${args.join(' ')}`);
      return args.includes('nvidia-cublas-cu12>=12,<13') ? { code: 1, out: 'no wheel for this system' } : { code: 0, out: 'ok' };
    };
    await runSetup('gpu-test', r, data, { step: (x) => steps.push(x), log: () => {} });
    assert.ok(ran.findIndex((x) => x.includes('faster-whisper')) < ran.findIndex((x) => x.includes('nvidia-cublas')), 'after its packages');
    assert.ok(steps.includes('Installing what it needs to run on the NVIDIA GPU: nvidia-cublas-cu12'), steps.join('; '));
    assert.equal(setupOf(r, data, false).state, 'ready', 'a failure there leaves it working, on the CPU');
    const lib = path.join(data, 'venv', 'lib', 'python3.12', 'site-packages', 'nvidia', 'cublas', 'lib');
    fs.mkdirSync(lib, { recursive: true });
    assert.equal(setupEnv(r, root, data).LD_LIBRARY_PATH?.split(path.delimiter)[0], lib, 'its servers find CUDA’s libraries');
    process.env.HYDOR_TEST_NVIDIA = '0';
    assert.equal(setupEnv(r, root, data).LD_LIBRARY_PATH, undefined);
  } finally {
    setupTesting.run = null;
    if (was === undefined) delete process.env.HYDOR_TEST_NVIDIA;
    else process.env.HYDOR_TEST_NVIDIA = was;
    fs.rmSync(data, { recursive: true, force: true });
  }
});

await test('removing a plugin removes those that need it, and their data', async () => {
  fs.mkdirSync(path.join(root, 'data', 'data', 'base-tools'), { recursive: true });
  assert.deepEqual((await call('POST', '/api/plugins/base-tools/remove', {})).removed.sort(), ['base-tools', 'needs-base']);
  assert.ok(!fs.existsSync(path.join(root, 'data', 'data', 'base-tools')));
  assert.deepEqual(
    (await listNow()).installed.map((p) => p.name),
    ['with-setup'],
  );
  await call('POST', '/api/plugins/with-setup/remove', {});
});

console.log('plugins of your own');

await test('a folder: looked at first (what it needs, what it brings), then added in place', async () => {
  const dir = path.join(root, 'my-folder-plugin');
  write(path.join(dir, 'plugin.json'), manifest('folder-one', { extensions: { 'com.naget.agent': { requires: { plugins: ['base-tools@^1'] } } } }));
  const p = await call<PluginPreview>('POST', '/api/plugins/inspect', { path: dir });
  assert.equal(p.view.name, 'folder-one');
  assert.deepEqual(p.brings, ['base-tools']);
  assert.deepEqual(p.unavailable, []);
  const job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { token: p.token })).job);
  assert.equal(job.state, 'done', job.error);
  const v = await call<PluginView>('GET', '/api/plugins/folder-one');
  assert.equal(v.source.kind, 'folder');
  assert.equal(v.root, fs.realpathSync(dir));
  assert.equal(v.editable, true);
  // A plugin that needs one nobody has cannot be added.
  write(path.join(root, 'needs-missing', 'plugin.json'), manifest('needs-missing', { extensions: { 'com.naget.agent': { requires: { plugins: { nowhere: '^2' } } } } }));
  const q = await call<PluginPreview>('POST', '/api/plugins/inspect', { path: path.join(root, 'needs-missing') });
  assert.deepEqual(q.unavailable, ['nowhere ^2']);
  await assert.rejects(call('POST', '/api/plugins/install', { token: q.token }), /needs a plugin not found here: nowhere \^2/);
  await call('POST', '/api/plugins/folder-one/remove', {});
  await call('POST', '/api/plugins/base-tools/remove', {});
  assert.ok(fs.existsSync(dir), 'a folder of your own stays where it is');
});

await test('made here: a new plugin, its editor (skills, a tool server, needs, instructions), its own files, packed and added again from the .zip', async () => {
  const made = (await call<{ plugin: PluginView }>('POST', '/api/plugins/new', { name: 'trip-kit', title: 'Trip kit', description: 'Tools for trips' })).plugin;
  assert.equal(made.source.kind, 'folder');
  assert.ok(made.editable && made.enabled);
  const draft = await call('GET', '/api/plugins/trip-kit/draft');
  assert.equal(draft.title, 'Trip kit');
  await assert.rejects(
    call('PUT', '/api/plugins/trip-kit/draft', { ...draft, skills: [{ name: 'packing', text: skill('other-name') }] }),
    /must say name: packing/,
  );
  await assert.rejects(call('PUT', '/api/plugins/trip-kit/draft', { ...draft, servers: [{ name: 'x', type: 'stdio', command: '../escape' }] }), /must start with \.\//);
  const saved = await call('PUT', '/api/plugins/trip-kit/draft', {
    ...draft,
    version: '1.1.0',
    instructions: 'Trip kit files: ${PLUGIN_ROOT}/files.',
    skills: [{ name: 'packing', text: skill('packing') }],
    servers: [
      { name: 'trip', type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/files/run.mjs'], env: {} },
      { name: 'weather', type: 'streamable-http', url: 'https://weather.example.com/mcp', headers: {} },
    ],
    requires: { plugins: [], npm: {}, pip: [], commands: [{ name: 'git' }], files: [], keys: [] },
  });
  assert.equal(saved.plugin.version, '1.1.0');
  assert.deepEqual(
    saved.plugin.skills.map((s: { name: string }) => s.name),
    ['packing'],
  );
  assert.deepEqual(
    saved.plugin.servers.map((s: { name: string }) => s.name),
    ['trip', 'weather'],
  );
  const f = await call('POST', '/api/plugins/trip-kit/files', { name: 'run.mjs', data: Buffer.from('console.log(1)\n').toString('base64') });
  assert.deepEqual(f.files, [{ name: 'run.mjs', bytes: 15 }]);
  await assert.rejects(call('POST', '/api/plugins/trip-kit/files', { name: '../x', data: 'AA==' }), /Name the file/);
  const pj = JSON.parse(fs.readFileSync(path.join(made.root, 'plugin.json'), 'utf8'));
  assert.equal(pj.$schema, AGENT_PLUGINS_SCHEMA);
  assert.deepEqual(pj.extensions['com.naget.agent'].requires, { commands: ['git'] });
  // Packed into a .zip, then added again from it (as a file now).
  const r = await app.inject({ method: 'GET', url: '/api/plugins/trip-kit/export' });
  assert.equal(r.statusCode, 200);
  assert.match(String(r.headers['content-disposition']), /trip-kit-1\.1\.0\.zip/);
  await call('POST', '/api/plugins/trip-kit/remove', {});
  assert.ok(!fs.existsSync(made.root), 'a plugin made here is removed with it');
  const p = await call<PluginPreview>('POST', '/api/plugins/inspect', { file: { name: 'trip-kit.zip', data: r.rawPayload.toString('base64') } });
  assert.equal(p.view.name, 'trip-kit');
  assert.deepEqual(p.view.files, [{ name: 'run.mjs', bytes: 15 }]);
  const job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { token: p.token })).job);
  assert.equal(job.state, 'done', job.error);
  const v = await call<PluginView>('GET', '/api/plugins/trip-kit');
  assert.equal(v.source.kind, 'file');
  assert.equal(v.editable, false);
  assert.ok(fs.existsSync(path.join(root, 'data', 'installed', 'trip-kit', 'skills', 'packing', 'SKILL.md')));
  await call('POST', '/api/plugins/trip-kit/remove', {});
});

console.log('the built-in plugins');

await test('every built-in plugin reads cleanly, says what it is, and its skills and servers are valid', () => {
  const dir = path.join(APP_ROOT, 'plugins');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => !n.startsWith('.')) : [];
  for (const n of names) {
    const m = readPlugin(path.join(dir, n));
    assert.equal(m.name, n, `${n}: name`);
    assert.equal(m.format, 'agent-plugins', `${n}: Agent Plugins 1.0`);
    assert.deepEqual(m.problems, [], `${n}: no problems`);
    assert.ok(m.description && m.title !== n && m.version, `${n}: a title, a version and a description`);
    assert.ok(m.skills.length || m.servers.length, `${n}: brings skills or tools`);
    for (const s of m.skills) assert.match(s.description, /^Use (when|before)\b/, `${n}/${s.name}: says when to use it`);
    for (const r of m.requires.plugins) assert.ok(names.includes(r.name), `${n}: needs ${r.name}, which is built in`);
  }
});

/** Talks MCP over stdio to a server the way agents do: initialize, then the calls given; returns each answer. */
async function mcpTalk(command: string, args: string[], calls: { method: string; params?: unknown }[]): Promise<any[]> {
  const p = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (b) => (err += b));
  const answers = new Map<number, any>();
  let buf = '';
  p.stdout.on('data', (b) => {
    buf += b;
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        if (m.id != null) answers.set(m.id, m);
      } catch {}
    }
  });
  const send = (m: unknown) => p.stdin.write(`${JSON.stringify(m)}\n`);
  const ask = async (id: number, method: string, params?: unknown) => {
    send({ jsonrpc: '2.0', id, method, params });
    for (let t = 0; t < 600 && !answers.has(id); t++) await new Promise((r) => setTimeout(r, 25));
    if (!answers.has(id)) throw new Error(`no answer to ${method}: ${err.slice(-500)}`);
    return answers.get(id);
  };
  try {
    const init = await ask(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const out = [init];
    let id = 2;
    for (const c of calls) out.push(await ask(id++, c.method, c.params));
    return out;
  } finally {
    p.kill();
  }
}

await test('the SQLite plugin answers as an MCP server: tables, a change in one transaction, a read-only query', async () => {
  setPluginRoots({ builtin: path.join(APP_ROOT, 'plugins') });
  const job = await waitJob((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { name: 'sqlite' })).job);
  assert.equal(job.state, 'done', job.error);
  const s = (await additions('claude'))!.mcpServers!.sqlite;
  assert.ok(s.type === 'stdio');
  const dbFile = path.join(root, 'shop.db');
  const [init, list, made, bad, rows, ro] = await mcpTalk(s.command, s.args!, [
    { method: 'tools/list' },
    { method: 'tools/call', params: { name: 'sqlite_execute', arguments: { database: dbFile, create: true, sql: "create table items(name text, qty integer); insert into items values ('pen', 3), ('cup', 5);" } } },
    { method: 'tools/call', params: { name: 'sqlite_execute', arguments: { database: dbFile, sql: "insert into items values ('x', 1); insert into nowhere values (1);" } } },
    { method: 'tools/call', params: { name: 'sqlite_query', arguments: { database: dbFile, sql: 'select name, qty from items where qty > ? order by name', params: [1] } } },
    { method: 'tools/call', params: { name: 'sqlite_query', arguments: { database: dbFile, sql: 'delete from items' } } },
  ]);
  assert.equal(init.result.serverInfo.name, 'sqlite');
  assert.deepEqual(
    list.result.tools.map((t: { name: string }) => t.name).sort(),
    ['sqlite_execute', 'sqlite_export_csv', 'sqlite_import_csv', 'sqlite_query', 'sqlite_schema', 'sqlite_tables'],
  );
  assert.equal(JSON.parse(made.result.content[0].text).changed_rows, 2);
  assert.ok(bad.result.isError && /nothing was changed/.test(bad.result.content[0].text), 'a failed script changes nothing');
  assert.deepEqual(JSON.parse(rows.result.content[0].text).rows, [
    ['cup', 5],
    ['pen', 3],
  ]);
  assert.ok(ro.result.isError, 'a query cannot change the file');
  await call('POST', '/api/plugins/sqlite/remove', {});
  setPluginRoots({ builtin: BUILTIN });
});

// With HYDOR_TEST_REAL_SETUP=1: each built-in plugin set up for real (its packages downloaded), and its servers asked for their tools.
if (process.env.HYDOR_TEST_REAL_SETUP === '1')
  await test('every built-in plugin sets up for real, and its servers answer', async () => {
    setPluginRoots({ builtin: path.join(APP_ROOT, 'plugins') });
    const names = fs.readdirSync(path.join(APP_ROOT, 'plugins')).filter((n) => !n.startsWith('.'));
    for (const n of names) {
      if ((await listNow()).installed.some((p) => p.name === n)) continue;
      const t0 = Date.now();
      const job = await waitJobLong((await call<{ job: PluginJob }>('POST', '/api/plugins/install', { name: n })).job);
      console.log(`       ${n}: ${job.state} in ${Math.round((Date.now() - t0) / 1000)} s (${job.steps.map((s) => s.label).join(' / ')})`);
      assert.equal(job.state, 'done', `${n}: ${job.error}\n${job.log.slice(-1500)}`);
    }
    const a = (await additions('claude'))!;
    for (const [name, s] of Object.entries(a.mcpServers ?? {})) {
      if (s.type !== 'stdio') continue;
      const [init, list] = await mcpTalk(s.command, s.args!, [{ method: 'tools/list' }]);
      console.log(`       ${name}: ${init.result.serverInfo.name} with ${list.result.tools.map((t: { name: string }) => t.name).join(', ')}`);
      assert.ok(list.result.tools.length > 0, name);
    }
    // Text from pictures reads a picture made here.
    const img = path.join(root, 'sample.png');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=640x120', '-vf', "drawtext=text='Invoice 2026-114 total 42.50':fontsize=40:x=20:y=40:fontcolor=black", '-frames:v', '1', img]);
    const ocr = a.mcpServers!.ocr;
    assert.ok(ocr && ocr.type === 'stdio');
    const [, read] = await mcpTalk(ocr.command, ocr.args!, [{ method: 'tools/call', params: { name: 'ocr_image', arguments: { path: img } } }]);
    const text = JSON.parse(read.result.content[0].text).text;
    console.log(`       ocr read: ${text}`);
    assert.match(text, /Invoice 2026-114/);
    // Python for data's profile script runs with its own Python.
    const py = path.join(root, 'data', 'data', 'python-data', 'venv', 'bin', 'python');
    fs.writeFileSync(path.join(root, 't.csv'), 'city;sales\nAthens;10\nBeijing;20\n');
    const prof = execFileSync(py, [path.join(APP_ROOT, 'plugins/python-data/skills/python-data/scripts/profile_table.py'), path.join(root, 't.csv')], { encoding: 'utf8' });
    assert.match(prof, /2 rows x 2 columns/);
  });

app.close();
fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures.length} failed${failures.length ? `: ${failures.join('; ')}` : ''}`);
process.exit(failures.length ? 1 : 0);

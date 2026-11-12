// Checks for `hydor skills`: the library and the agents' own skills listed and shown, turned on and off, added from a SKILL.md, a folder or typed in, removed.
// Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/skills-test.ts && DATA_DIR=/tmp/hydor-test-skills node dist/dev/skills-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from '../client.ts';
import { UsageError } from './kit.ts';
import { atWidths, fakeConn, run, type Answer } from './test-kit.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const lib = (name: string, extra: object = {}) => ({ name, description: `Use when ${name}`, triggers: [], source: 'learned', path: `/data/skills/${name}/SKILL.md`, uses: 0, ...extra });
const research = lib('research', { source: 'bundled', category: 'research', uses: 4, lastUsed: Date.now() - 3_600_000, triggers: ['sources'] });
const standup = lib('standup', { category: 'work' });
const off = lib('paper-notes', { source: 'plugin', plugin: { name: 'papers', title: 'Papers' }, off: true });
const deploy = { agent: 'claude', name: 'deploy', description: 'Use when shipping', path: '/home/u/.claude/skills/deploy/SKILL.md', scope: 'user', enabled: true, deletable: true };
const shared = { agent: 'codex', name: 'research', description: 'Codex’s research', path: '/home/u/.agents/skills/research/SKILL.md', scope: 'user', enabled: false, deletable: true };
const builtin = { agent: 'codex', name: 'imagegen', description: 'Makes images', path: '/x/imagegen/SKILL.md', scope: 'system', enabled: true, deletable: false };

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/skillpack': { skills: [research, standup, off], pending: [], removed: [] },
  'GET /api/setup/skills': { skills: [deploy, shared, builtin], errors: [] },
  ...extra,
});
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

test('list: the library and the agents’ own, on or off; --agent narrows; --json as returned', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['skills']);
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/api/skillpack', '/api/setup/skills'],
  );
  assert.match(r.out, /^ *SKILL +FROM +USED/m);
  assert.match(r.out, /^● +research +built in +4 uses +Use when research$/m);
  assert.match(r.out, /^· +paper-notes +plugin Papers/m);
  assert.match(r.out, /^● +deploy \(claude\) +Claude Code’s own/m);
  assert.match(r.out, /^· +research \(codex\) +Codex’s own/m);
  assert.match(r.out, /^● +imagegen \(codex\) +Codex’s own, built in/m);
  const only = fakeConn(routes());
  await run(only.conn, ['skills', '--agent', 'hydor']);
  assert.deepEqual(
    only.calls.map((c) => c.path),
    ['/api/skillpack'],
  );
  const claude = fakeConn(routes({ 'GET /api/setup/skills?cwd=%2Fcode%2Fapp': { skills: [deploy], errors: [] } }));
  const c = await run(claude.conn, ['skills', '--agent', 'claude', '--folder', '/code/app']);
  assert.deepEqual(
    claude.calls.map((x) => x.path),
    ['/api/setup/skills?cwd=%2Fcode%2Fapp'],
  );
  assert.doesNotMatch(c.out, /research/);
  assert.deepEqual((await run(fakeConn(routes()).conn, ['skills', '--agent', 'hydor', '--json'])).json, [{ skills: [research, standup, off], pending: [], removed: [] }]);
  assert.deepEqual((await run(fakeConn(routes()).conn, ['skills', '--agent', 'codex', '--json'])).json, [{ skills: [deploy, shared, builtin], errors: [] }]);
  await refused(run(conn, ['skills', '--agent', 'gemini']), /--agent takes hydor, claude, codex/);
});

test('show: a library skill (its text, --history) and an agent’s own (read from its file)', async () => {
  const doc = {
    name: 'research',
    text: '---\nname: research\ndescription: Use when research\n---\n\nFind **sources**.',
    source: 'bundled',
    file: '/x',
    history: [{ id: 1, name: 'research', at: Date.now() - 60_000, action: 'update', added: 3, removed: 1, diff: '' }],
  };
  const t = fakeConn(
    routes({
      'GET /api/skillpack/skills/research': doc,
      'GET /api/fs/read?path=%2Fhome%2Fu%2F.claude%2Fskills%2Fdeploy%2FSKILL.md': { content: '---\nname: deploy\n---\nRun the script.' },
      'GET /api/fs/read?path=%2Fhome%2Fu%2F.agents%2Fskills%2Fresearch%2FSKILL.md': { content: 'Codex text' },
    }),
  );
  const r = await run(t.conn, ['skills', 'show', 'research', '--history']);
  assert.match(r.out, /^research$/m);
  assert.match(r.out, /^From +built in$/m);
  assert.match(r.out, /^Keywords +sources$/m);
  assert.match(r.out, /^Used +4 times, last 1h ago$/m);
  assert.match(r.out, /Find sources\./);
  assert.doesNotMatch(r.out, /description: Use when/, 'the frontmatter is not drawn as text');
  assert.match(r.out, /History\n.*1m ago +update +\+3 −1/);
  const d = await run(t.conn, ['skills', 'show', 'deploy']);
  assert.match(d.out, /^From +Claude Code’s own$/m);
  assert.match(d.out, /Run the script\./);
  // The library's wins on a plain name; the agent's own by agent:name or --agent.
  assert.match((await run(t.conn, ['skills', 'show', 'codex:research'])).out, /Codex text/);
  assert.match((await run(t.conn, ['skills', 'show', 'research', '--agent', 'codex'])).out, /Codex text/);
  assert.deepEqual((await run(t.conn, ['skills', 'show', 'research', '--json'])).json, [doc]);
  await refused(run(t.conn, ['skills', 'show', 'zzz']), /^No skill “zzz”: hydor skills lists them$/);
  await refused(run(t.conn, ['skills', 'show']), /^Say which skill: hydor skills show <skill> \[options\]$/);
  const picked = await run(t.conn, ['skills', 'show'], { interactive: true, pick: 'claude:deploy' });
  assert.deepEqual(picked.picked, ['Which skill?']);
});

test('on and off: the library’s switch, an agent’s own toggle', async () => {
  const { conn, calls } = fakeConn(
    routes({ 'PUT /api/skillpack/skills/paper-notes/off': { off: false }, 'PUT /api/skillpack/skills/standup/off': { off: true }, 'POST /api/setup/skills/toggle': { ok: true } }),
  );
  let r = await run(conn, ['skills', 'on', 'paper-notes']);
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/skillpack/skills/paper-notes/off', body: { off: false } });
  assert.match(r.out, /^“paper-notes” is on\.$/m);
  r = await run(conn, ['skills', 'off', 'standup']);
  assert.deepEqual(calls.at(-1)?.body, { off: true });
  r = await run(conn, ['skills', 'off', 'deploy']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/skills/toggle', body: { agent: 'claude', name: 'deploy', path: '/home/u/.claude/skills/deploy/SKILL.md', enabled: false } });
  assert.match(r.out, /^“deploy” is off for Claude Code\.$/m);
  await run(conn, ['skills', 'on', 'codex:research']);
  assert.equal((calls.at(-1)?.body as { agent: string }).agent, 'codex');
});

test('add: a SKILL.md, a folder, typed in; for an agent’s own; refusals', async () => {
  const dir = path.join(DATA, 'skills-add');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'lint'), { recursive: true });
  const text = '---\nname: lint\ndescription: Use when linting\n---\n\nRun the linter and fix what it finds, then run it again.\n';
  fs.writeFileSync(path.join(dir, 'lint', 'SKILL.md'), text);
  fs.writeFileSync(path.join(dir, 'bare.md'), '---\ndescription: Use when bare\n---\nJust the body of a skill that is long enough to be one.\n');
  const { conn, calls } = fakeConn(
    routes({ 'POST /api/skillpack/skills': (b: unknown) => ({ name: (b as { name: string }).name }), 'POST /api/setup/skills': { path: '/home/u/.claude/skills/lint/SKILL.md' } }),
  );
  let r = await run(conn, ['skills', 'add', path.join(dir, 'lint')]);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/skillpack/skills', body: { name: 'lint', text } });
  assert.match(r.out, /^Added “lint” to the skill library\.$/m);
  await run(conn, ['skills', 'add', path.join(dir, 'lint', 'SKILL.md'), '--name', 'linter']);
  assert.equal((calls.at(-1)?.body as { name: string; text: string }).name, 'linter');
  assert.match((calls.at(-1)?.body as { text: string }).text, /^name: linter$/m);
  await run(conn, ['skills', 'add', path.join(dir, 'bare.md'), '--name', 'bare', '--category', 'work', '--keyword', 'x', '--keyword', 'y']);
  assert.deepEqual(calls.at(-1)?.body, { name: 'bare', description: 'Use when bare', body: 'Just the body of a skill that is long enough to be one.', category: 'work', triggers: ['x', 'y'] });
  await run(conn, ['skills', 'add', 'standup2', '--description', 'Use when standing up', '--file', 'b.md'], { files: { 'b.md': 'Say what you did, what you will do, and what blocks you.\n' } });
  assert.deepEqual(calls.at(-1)?.body, {
    name: 'standup2',
    description: 'Use when standing up',
    body: 'Say what you did, what you will do, and what blocks you.',
    category: undefined,
    triggers: undefined,
  });
  r = await run(conn, ['skills', 'add', path.join(dir, 'lint'), '--agent', 'claude']);
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/api/setup/skills',
    body: { agent: 'claude', name: 'lint', description: 'Use when linting', body: 'Run the linter and fix what it finds, then run it again.', scope: 'user' },
  });
  assert.match(r.out, /^Added “lint” to Claude Code’s own skills/m);
  await run(conn, ['skills', 'add', path.join(dir, 'lint'), '--agent', 'claude', '--scope', 'project', '--folder', '/code/app']);
  assert.deepEqual({ scope: (calls.at(-1)?.body as { scope: string }).scope, cwd: (calls.at(-1)?.body as { cwd: string }).cwd }, { scope: 'project', cwd: '/code/app' });
  await refused(run(conn, ['skills', 'add', path.join(dir, 'lint'), '--agent', 'claude', '--scope', 'project']), /--scope project needs --folder/);
  await refused(run(conn, ['skills', 'add', path.join(dir, 'nothing.md')]), /^Cannot find /);
  await refused(run(conn, ['skills', 'add', 'newone']), /no terminal for the editor/);
  await refused(run(conn, ['skills', 'add', 'newone', '--file', 'b.md'], { files: { 'b.md': 'Some text here.' } }), /needs a description of when to use it/);
  fs.mkdirSync(path.join(dir, 'empty'));
  await refused(run(conn, ['skills', 'add', path.join(dir, 'empty')]), /Cannot read .*SKILL\.md \(a folder to add holds a SKILL\.md\)/);
  const dup = fakeConn(routes({ 'POST /api/skillpack/skills': new ApiError(409, 'There is a skill of that name') }));
  await refused(run(dup.conn, ['skills', 'add', path.join(dir, 'lint')]), /^There is a skill of that name$/, ApiError);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('remove: yours is removed after a yes, built in ones are not, an agent’s own is deleted with its folder', async () => {
  const { conn, calls } = fakeConn(
    routes({ 'POST /api/skillpack/skills/standup/remove': { ok: true }, 'POST /api/setup/skills/delete': { ok: true }, 'GET /api/setup/skills?cwd=%2Fcode%2Fapp': { skills: [deploy], errors: [] } }),
  );
  await refused(run(conn, ['skills', 'remove', 'standup']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['skills', 'remove', 'standup'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “standup”?']);
  assert.match(r.out, /^Not removed\.$/m);
  assert.ok(!calls.some((c) => c.method === 'POST' && c.path.endsWith('/remove')));
  r = await run(conn, ['skills', 'rm', 'standup', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/skillpack/skills/standup/remove' });
  r = await run(conn, ['skills', 'remove', 'deploy', '-y', '--folder', '/code/app']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/setup/skills/delete', body: { agent: 'claude', path: '/home/u/.claude/skills/deploy/SKILL.md', cwd: '/code/app' } });
  const asked = await run(conn, ['skills', 'remove', 'deploy'], { interactive: true, confirm: false });
  assert.deepEqual(asked.asked, ['Delete “deploy” and its folder for good?']);
  await refused(run(conn, ['skills', 'remove', 'research', '-y']), /“research” is built in and cannot be removed: hydor skills off research turns it off/);
  await refused(run(conn, ['skills', 'remove', 'paper-notes', '-y']), /a plugin’s and cannot be removed/);
  await refused(run(conn, ['skills', 'remove', 'imagegen', '-y']), /cannot be deleted/);
});

test('list on a narrow terminal: the description goes whole, then the use count, before the name is cut', async () => {
  const w = await atWidths(fakeConn(routes()).conn, ['skills']);
  for (const [n, lines] of Object.entries(w)) assert.ok(lines.every((l) => [...l].length <= Number(n) - 1), `${n} columns`);
  assert.match(w[100][1], /^● +research +built in +4 uses +Use when research$/);
  assert.match(w[60][0], /^ +SKILL +FROM +USED$/);
  assert.match(w[60][6], /^● +imagegen \(codex\) +Codex’s own, built in$/);
  assert.match(w[40][0], /^ +SKILL +FROM$/);
  assert.match(w[40][4], /^● +deploy \(claude\) +Claude Code’s own$/, 'names whole');
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
process.exit(process.exitCode ?? 0);

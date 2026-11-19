// Checks for `hydor agents`: the list as it always printed, show, new, edit (the whole agent goes back with the change),
// remove (not without a yes, not a built-in one), --json as returned. Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/agents-test.ts && DATA_DIR=/tmp/hydor-test-agents node dist/dev/agents-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

const researcher = { id: 'researcher', name: 'Researcher', icon: 'telescope', description: 'Finds and weighs sources', instructions: 'Cite.', builtin: true, tier: 'best' };
const coder = { id: 'coder', name: 'Coder', icon: 'code', description: 'Writes code', instructions: 'Test first.', builtin: true };
const books = {
  id: 'bookkeeper-3f9a',
  name: 'Bookkeeper',
  icon: 'wallet',
  description: 'Keeps my books',
  instructions: 'Be **exact**.',
  tools: ['read', 'edit'],
  tier: 'standard',
  projects: ['sp1'],
  canAsk: ['coder'],
  budgetUsd: 20,
  agent: 'acp',
  acpAgent: 'console',
  model: 'm1',
  source: '/home/u/.claude/agents/b.md',
};
const scribe = { id: 'scribe-1', name: 'Scribe', icon: 'bot', description: '', instructions: '' };
const assistants = [researcher, coder, books, scribe];
const reply = (list = assistants) => ({ assistants: list, taskRoot: '/home/u/Hydor', defaultTaskRoot: '/home/u/Hydor', cleanUp: true });

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/assistants': reply(),
  'GET /api/projects': {
    spaces: [
      { id: 'sp1', name: 'Thesis' },
      { id: 'sp2', name: 'Notes' },
    ],
  },
  ...extra,
});
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

test('list: what hydor agents always printed, and --json as returned', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['agents']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/assistants' }]);
  assert.match(r.out, /^Researcher +researcher +Finds and weighs sources +Best$/m);
  assert.match(r.out, /^Bookkeeper +bookkeeper-3f9a +Keeps my books +Standard$/m);
  const j = await run(fakeConn(routes()).conn, ['agents', 'list', '--json']);
  assert.deepEqual(j.json, [reply()]);
});

test('show: by name or the start of an id; the fields and instructions', async () => {
  for (const given of ['bookkeeper', 'Bookkeeper', 'bookkeeper-3', 'BOOK']) {
    const r = await run(fakeConn(routes()).conn, ['agents', 'show', given]);
    assert.match(r.out, /^Bookkeeper$/m, given);
    assert.match(r.out, /^Id +bookkeeper-3f9a$/m);
    assert.match(r.out, /^Program +Custom$/m);
    assert.match(r.out, /^Tier +Standard$/m);
    assert.match(r.out, /^May use +read, edit$/m);
    assert.match(r.out, /^Works in +Thesis$/m);
    assert.match(r.out, /^May hand work to +Coder$/m);
    assert.match(r.out, /^Monthly budget +\$20$/m);
    assert.match(r.out, /Instructions\n/);
    assert.match(r.out, /Be exact\./);
  }
  assert.match((await run(fakeConn(routes()).conn, ['agents', 'show', 'researcher'])).out, /^Researcher \(built in\)$/m);
  assert.deepEqual((await run(fakeConn(routes()).conn, ['agents', 'show', 'coder', '--json'])).json, [coder]);
  await refused(run(fakeConn(routes()).conn, ['agents', 'show', 'zzz']), /^No agent “zzz”: hydor agents lists them$/);
  await refused(run(fakeConn(routes()).conn, ['agents', 'show']), /^Say which agent: hydor agents show <agent>$/);
  const picked = await run(fakeConn(routes()).conn, ['agents', 'show'], { interactive: true, pick: 'coder' });
  assert.match(picked.out, /^Coder/m);
});

test('new: the body from the words and options', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/assistants': (b: unknown) => ({ assistant: { ...(b as object), id: 'x-1' } }) }));
  const r = await run(conn, [
    'agents',
    'new',
    'My',
    'helper',
    '--description',
    'Helps',
    '--instructions',
    'Help.',
    '--agent',
    'claude',
    '--model',
    'opus',
    '--tier',
    'best',
    '--tools',
    'read,web',
    '--tools',
    'run',
    '--mode',
    'plan',
    '--folder',
    'project',
    '--projects',
    'thesis',
    '--can-ask',
    'coder',
    '--askable',
    'off',
    '--step-up',
    'off',
    '--standing',
    'on',
    '--budget',
    '12.5',
    '--skills',
    'research,writing',
  ]);
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/api/assistants',
    body: {
      name: 'My helper',
      description: 'Helps',
      instructions: 'Help.',
      agent: 'claude',
      model: 'opus',
      tier: 'best',
      tools: ['read', 'web', 'run'],
      mode: 'plan',
      folder: 'project',
      projects: ['sp1'],
      canAsk: ['coder'],
      askable: false,
      stepUp: false,
      standing: true,
      budgetUsd: 12.5,
      skills: ['research', 'writing'],
    },
  });
  assert.match(r.out, /^Made “My helper” \(x-1\)\.$/m);
  const acp = fakeConn(routes({ 'POST /api/assistants': (b: unknown) => ({ assistant: { ...(b as object), id: 'x' } }) }));
  await run(acp.conn, ['agents', 'new', 'Z', '--agent', 'gemini', '--tools', 'none', '--instructions', 'x']);
  assert.deepEqual(acp.calls.at(-1)?.body, { name: 'Z', instructions: 'x', agent: 'acp', acpAgent: 'gemini', tools: [] });
  await run(acp.conn, ['agents', 'new', 'Z', '--agent', 'custom', '--instructions', 'x']);
  assert.deepEqual((acp.calls.at(-1)?.body as { acpAgent: string }).acpAgent, 'console');
});

test('new: instructions from a file, or the editor on a terminal when nothing else is named; --from copies', async () => {
  const t = fakeConn(routes({ 'POST /api/assistants': (b: unknown) => ({ assistant: { ...(b as object), id: 'x' } }) }));
  await run(t.conn, ['agents', 'new', 'Rev', '--file', 'r.md'], { files: { 'r.md': 'From a file.' } });
  assert.deepEqual(t.calls.at(-1)?.body, { name: 'Rev', instructions: 'From a file.' });
  await run(t.conn, ['agents', 'new', 'Ed'], { interactive: true, edit: 'Typed in the editor' });
  assert.deepEqual(t.calls.at(-1)?.body, { name: 'Ed', instructions: 'Typed in the editor' });
  await run(t.conn, ['agents', 'new', 'My researcher', '--from', 'researcher', '--can-ask', 'coder']);
  assert.deepEqual(
    t.calls.at(-1)?.body,
    { name: 'My researcher', icon: 'telescope', description: 'Finds and weighs sources', instructions: 'Cite.', tier: 'best', canAsk: ['coder'] },
    'a copy has no id and is not built in',
  );
  await refused(run(t.conn, ['agents', 'new', 'Q', '--tier', 'huge']), /--tier takes quick, standard, best, max or auto/);
  await refused(run(t.conn, ['agents', 'new', 'Q', '--tools', 'read,fly']), /--tools takes read, edit, run, web, browser, computer, mcp, all or none \(it was “fly”\)/);
  await refused(run(t.conn, ['agents', 'new', 'Q', '--budget', 'lots']), /--budget takes a number/);
  await refused(run(t.conn, ['agents', 'new', 'Q', '--askable', 'maybe']), /--askable takes on or off/);
  await refused(run(t.conn, ['agents', 'new', 'Q', '--projects', 'nothing']), /No project “nothing”/);
});

test('edit: the whole agent goes back with only the change; "" and auto clear', async () => {
  const { conn, calls } = fakeConn(routes({ 'PUT /api/assistants/bookkeeper-3f9a': (b: unknown) => ({ assistant: b }) }));
  const r = await run(conn, ['agents', 'edit', 'bookkeeper', '--budget', '30', '--tier', 'auto', '--model', '', '--description', 'Books']);
  const put = calls.at(-1)!;
  assert.equal(put.method, 'PUT');
  const { id: _i, ...rest } = books;
  const { tier: _t, model: _m, ...kept } = rest;
  assert.deepEqual(put.body, { ...kept, description: 'Books', budgetUsd: 30 });
  assert.match(r.out, /^Changed “Bookkeeper”: description, model, tier, budget\.$/m);
  // Nothing named: instructions in the editor; unchanged changes nothing.
  const t = fakeConn(routes({ 'PUT /api/assistants/bookkeeper-3f9a': (b: unknown) => ({ assistant: b }) }));
  const same = await run(t.conn, ['agents', 'edit', 'bookkeeper'], { interactive: true, edit: null });
  assert.deepEqual(same.edited, ['Be **exact**.']);
  assert.match(same.out, /^Nothing changed\.$/m);
  assert.ok(!t.calls.some((c) => c.method === 'PUT'));
  await run(t.conn, ['agents', 'edit', 'bookkeeper'], { interactive: true, edit: 'New text' });
  assert.equal((t.calls.at(-1)?.body as { instructions: string }).instructions, 'New text');
  await run(t.conn, ['agents', 'edit', 'bookkeeper', '--name', 'Accountant']);
  assert.equal((t.calls.at(-1)?.body as { name: string }).name, 'Accountant');
  await refused(run(t.conn, ['agents', 'edit', 'researcher', '--budget', '1']), /built in and cannot be changed: hydor agents new "My Researcher" --from researcher/);
  await refused(run(t.conn, ['agents', 'edit', 'bookkeeper'], {}), /no terminal for the editor/);
  const j = await run(t.conn, ['agents', 'edit', 'bookkeeper', '--budget', '1', '--json']);
  assert.equal((j.json[0] as { assistant: { budgetUsd: number } }).assistant.budgetUsd, 1);
});

test('remove: asks, says no to a built-in one, --json', async () => {
  const { conn, calls } = fakeConn(routes({ 'DELETE /api/assistants/bookkeeper-3f9a': reply(assistants.slice(0, 2)) }));
  await refused(run(conn, ['agents', 'remove', 'bookkeeper']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['agents', 'remove', 'bookkeeper'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “Bookkeeper”?']);
  assert.match(r.out, /^Not removed\.$/m);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  r = await run(conn, ['agents', 'rm', 'Bookkeeper', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'DELETE', path: '/api/assistants/bookkeeper-3f9a' });
  assert.match(r.out, /^Removed “Bookkeeper”\.$/m);
  assert.deepEqual((await run(conn, ['agents', 'remove', 'bookkeeper', '-y', '--json'])).json, [reply(assistants.slice(0, 2))]);
  await refused(run(conn, ['agents', 'remove', 'coder', '-y']), /“Coder” is built in and cannot be removed/);
  const server = fakeConn(routes({ 'DELETE /api/assistants/scribe-1': new ApiError(400, 'No') }));
  await refused(run(server.conn, ['agents', 'remove', 'scribe', '-y']), /^No$/, ApiError);
});

test('--results-to: where results go, each kept as it was where it names the same; show says it; results lists the history', async () => {
  const withOut = {
    ...books,
    output: {
      fields: [
        { id: 'spent', label: 'Spent', type: 'number' },
        { id: 'shops', label: 'Shops', type: 'list' },
      ],
      to: [{ kind: 'email', to: ['old@example.org'], subject: 'Books {date}', account: 'me@example.net' }, { kind: 'notify' }],
    },
  };
  const list = [researcher, coder, withOut, scribe];
  const r0 = routes({
    'GET /api/assistants': reply(list),
    'PUT /api/assistants/bookkeeper-3f9a': (b: unknown) => ({ assistant: b }),
    'GET /api/pages': { pages: [{ id: 'pg1', title: 'Household budget', kind: 'sheet' }, { id: 'pg2', title: 'Notes' }] },
  });
  const { conn, calls } = fakeConn(r0);
  const r = await run(conn, ['agents', 'edit', 'bookkeeper', '--results-to', 'sheet:household#2026', '--results-to', 'email:anna@example.org, sam@example.com', '--results-to', 'library']);
  assert.deepEqual((calls.at(-1)?.body as { output: unknown }).output, {
    fields: withOut.output.fields,
    to: [
      { kind: 'sheet', page: 'pg1', tab: '2026' },
      { kind: 'email', to: ['anna@example.org', 'sam@example.com'], subject: 'Books {date}', account: 'me@example.net' },
      { kind: 'library' },
    ],
  });
  assert.match(r.out, /^Changed “Bookkeeper”: where results go\.$/m);
  await run(conn, ['agents', 'edit', 'bookkeeper', '--results-to', 'none']);
  assert.deepEqual((calls.at(-1)?.body as { output: unknown }).output, { fields: withOut.output.fields });
  await refused(run(conn, ['agents', 'edit', 'bookkeeper', '--results-to', 'fax']), /--results-to takes library/);
  await refused(run(conn, ['agents', 'edit', 'bookkeeper', '--results-to', 'email:']), /takes the addresses/);
  // show
  const shown = await run(fakeConn(r0).conn, ['agents', 'show', 'bookkeeper']);
  assert.match(shown.out, /^Hands back +Spent, Shops$/m);
  assert.match(shown.out, /^Results go to +an email to old@example\.org from me@example\.net$/m);
  assert.match(shown.out, /^ +a notification$/m);
  // results
  const history = {
    results: [
      { id: 2, at: new Date(2026, 10, 15, 9, 0).getTime(), key: 'k2', line: '42', value: { spent: 42, shops: ['Lidl', 'Market'] }, sent: [{ kind: 'sheet', ok: true, detail: 'row 3', page: 'pg1' }, { kind: 'email', ok: false, detail: 'no account' }] },
      { id: 1, at: new Date(2026, 10, 14, 9, 0).getTime(), key: 'k1', line: '7', value: { spent: 7 }, sent: [] },
    ],
    total: 9,
    more: true,
    made: { sheet: { id: 'pg1', title: 'Household budget' } },
  };
  const h = fakeConn({ ...r0, 'GET /api/assistants/bookkeeper-3f9a/results?limit=2': history });
  const out = await run(h.conn, ['agents', 'results', 'bookkeeper', '--limit', '2']);
  assert.match(out.out, /When +Spent +Shops +Went to/);
  assert.match(out.out, /2026-11-15 09:00 +42 +Lidl; Market +✓ sheet, ✗ email/);
  assert.match(out.out, /2 of 9: --limit for more\./);
  assert.match(out.out, /Its runs go into “Household budget” in the project\./);
  const j = await run(fakeConn({ ...r0, 'GET /api/assistants/bookkeeper-3f9a/results?limit=20': history }).conn, ['agents', 'results', 'bookkeeper', '--json']);
  assert.deepEqual(j.json, [history]);
});

test('list on a narrow terminal: the description goes whole before the name is cut', async () => {
  const w = await atWidths(fakeConn(routes()).conn, ['agents']);
  for (const [n, lines] of Object.entries(w)) assert.ok(lines.every((l) => [...l].length <= Number(n) - 1), `${n} columns`);
  assert.match(w[100][0], /^Researcher +researcher +Finds and weighs sources +Best$/);
  assert.match(w[40][0], /^Researcher +researcher +Best$/, 'the description went whole');
  assert.match(w[40][2], /^Bookkeeper +bookkeeper-3f9a +Standard$/);
});

test('export: the file the API gives, written as its name.hydor-agent (not over one there), -o, - prints it; what was left out said', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agents-cli-'));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const file = { hydor: 'agent', format: 1, agent: { name: 'Bookkeeper', instructions: 'Be exact.' }, leftOut: ['The project it works in: it works everywhere until you pick them again.'] };
    const r0 = routes({ 'GET /api/assistants/bookkeeper-3f9a/export': file });
    const r = await run(fakeConn(r0).conn, ['agents', 'export', 'bookkeeper']);
    assert.match(r.out, /^Saved “Bookkeeper” as .*Bookkeeper\.hydor-agent\.$/m);
    assert.match(r.out, /Left out, to set again where it is installed:\n {2}- The project it works in/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'Bookkeeper.hydor-agent'), 'utf8')), file);
    await refused(run(fakeConn(r0).conn, ['agents', 'export', 'bookkeeper']), /^Bookkeeper\.hydor-agent exists already: name the file with -o <file>$/);
    await run(fakeConn(r0).conn, ['agents', 'export', 'bookkeeper', '-o', 'out/b.json']);
    assert.ok(fs.existsSync(path.join(dir, 'out', 'b.json')));
    const printed = await run(fakeConn(r0).conn, ['agents', 'export', 'bookkeeper', '-o', '-']);
    assert.deepEqual(JSON.parse(printed.out), file);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('install: what it brings and needs first, then asks; beside yours unless --replace; --schedules', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-agents-cli-'));
  const f = path.join(dir, 'b.hydor-agent');
  fs.writeFileSync(f, '{"hydor":"agent"}');
  const preview = {
    agent: { name: 'Bookkeeper', description: 'Keeps my books' },
    brings: ['Its instructions (2 lines).', 'It may use read files.'],
    needs: ['Who its results are emailed to, and from which mail account: set them again under What it hands back.'],
    notes: [],
    team: [],
    schedules: [{ name: 'Fridays', schedule: { kind: 'daily', time: '16:00' }, task: 'x' }],
    examples: [],
    clash: { id: 'bookkeeper-3f9a', name: 'Bookkeeper' },
    beside: 'Bookkeeper (2)',
  };
  const sent: unknown[] = [];
  const r0 = routes({
    'POST /api/assistants/install/check': preview,
    'POST /api/assistants/install': (b: unknown) => (sent.push(b), { assistant: { id: (b as { replace: boolean }).replace ? 'bookkeeper-3f9a' : 'bookkeeper-77', name: (b as { replace: boolean }).replace ? 'Bookkeeper' : 'Bookkeeper (2)' }, schedules: (b as { schedules: boolean }).schedules ? 1 : 0 }),
  });
  const r = await run(fakeConn(r0).conn, ['agents', 'install', f], { confirm: true });
  assert.deepEqual(r.asked, ['Install “Bookkeeper (2)”?']);
  assert.match(r.out, /^Bookkeeper \(2\) · Keeps my books$/m);
  assert.match(r.out, /^ {2}Its instructions \(2 lines\)\.$/m);
  assert.match(r.out, /It needs from you\n {2}- Who its results are emailed to/);
  assert.match(r.out, /installs beside it as “Bookkeeper \(2\)” \(--replace replaces yours\)/);
  assert.match(r.out, /--schedules adds them, paused/);
  assert.match(r.out, /^Installed “Bookkeeper \(2\)” \(bookkeeper-77\)\.$/m);
  assert.deepEqual(sent[0], { file: '{"hydor":"agent"}', replace: false, schedules: false });
  const no = await run(fakeConn(r0).conn, ['agents', 'install', f], { confirm: false });
  assert.match(no.out, /Not installed\./);
  assert.equal(sent.length, 1);
  const rep = await run(fakeConn(r0).conn, ['agents', 'install', f, '--replace', '--schedules', '-y']);
  assert.match(rep.out, /^Replaced “Bookkeeper” \(bookkeeper-3f9a\), with 1 schedule, paused\.$/m);
  assert.deepEqual(sent[1], { file: '{"hydor":"agent"}', replace: true, schedules: true });
  await refused(run(fakeConn(r0).conn, ['agents', 'install', path.join(dir, 'none.hydor-agent'), '-y']), /^Cannot read /);
  // Nobody to ask and no --yes: it says so.
  await refused(run(fakeConn(r0).conn, ['agents', 'install', f]), /nobody to ask here, so add -y/);
  // A broken file: the server's words.
  const bad = routes({ 'POST /api/assistants/install/check': new ApiError(400, 'This is not a Hydor agent file') });
  await refused(run(fakeConn(bad).conn, ['agents', 'install', f, '-y']), /^This is not a Hydor agent file$/, ApiError);
  fs.rmSync(dir, { recursive: true, force: true });
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

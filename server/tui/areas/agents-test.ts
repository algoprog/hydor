// Checks for `hydor agents`: the list as it always printed, show, new, edit (the whole agent goes back with the change),
// remove (not without a yes, not a built-in one), --json as returned. Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/agents-test.ts && DATA_DIR=/tmp/hydor-test-agents node dist/dev/agents-test.js
import assert from 'node:assert/strict';
import { ApiError } from '../client.ts';
import { UsageError } from './kit.ts';
import { fakeConn, run, type Answer } from './test-kit.ts';

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
  await refused(run(t.conn, ['agents', 'new', 'Q', '--tools', 'read,fly']), /--tools takes read, edit, run, web, mcp, all or none \(it was “fly”\)/);
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

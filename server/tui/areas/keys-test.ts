// Checks for `hydor keys`: names and details listed (never a value), a value asked for hidden or read from stdin and never printed, rotated, removed.
// Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/keys-test.ts && DATA_DIR=/tmp/hydor-test-keys node dist/dev/keys-test.js
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

const gh = { name: 'GITHUB_TOKEN', hint: 'ghp_…c3d4', domains: ['github.com'], commands: true, note: 'for the gh API', createdAt: 1, updatedAt: 2, usedAt: Date.now() - 7_200_000 };
const open = { name: 'OPENAI_API_KEY', hint: 'sk-…9z', domains: [], note: '', createdAt: 1, updatedAt: 1 };
const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({ 'GET /api/connections': { connections: [], secrets: [gh, open] }, ...extra });
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));
const SECRET = 'ghp_SUPERSECRETVALUE';

test('list: names with where each may go, no value and no hint; --json as returned', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['keys']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/connections' }]);
  assert.match(r.out, /^KEY +MAY GO TO +IN COMMANDS +USED/m);
  assert.match(r.out, /^GITHUB_TOKEN +github\.com +commands +used 2h ago +for the gh API$/m);
  assert.match(r.out, /^OPENAI_API_KEY +anywhere +— +not used$/m);
  assert.doesNotMatch(r.out, /ghp_|sk-/, 'not even a hint');
  assert.deepEqual((await run(fakeConn(routes()).conn, ['keys', 'list', '--json'])).json, [{ secrets: [gh, open] }]);
  assert.match((await run(fakeConn({ 'GET /api/connections': { connections: [], secrets: [] } }).conn, ['keys'])).out, /No keys yet: hydor keys set <NAME> adds one\./);
});

test('set: a new key, its value asked for hidden on a terminal and never printed', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/connections/secrets': (b: unknown) => ({ secret: { ...gh, name: (b as { name: string }).name } }) }));
  const r = await run(conn, ['keys', 'set', 'new token', '--domain', 'api.x.com', '--domain', 'x.com', '--commands', 'on', '--note', 'for x', '--header', 'Authorization', '--prefix', 'Bearer '], {
    interactive: true,
    typed: [SECRET],
  });
  assert.deepEqual(r.typed, [{ question: 'Value for NEW_TOKEN: ', hidden: true }]);
  assert.deepEqual(calls.at(-1), {
    method: 'POST',
    path: '/api/connections/secrets',
    body: { name: 'NEW_TOKEN', domains: 'api.x.com,x.com', commands: true, note: 'for x', header: 'Authorization', prefix: 'Bearer ', value: SECRET },
  });
  assert.match(r.out, /^NEW_TOKEN is in the vault\.$/m);
  assert.ok(!r.out.includes(SECRET) && !JSON.stringify(r.json).includes(SECRET), 'the value is never printed');
  const j = await run(conn, ['keys', 'set', 'NEW_TOKEN2', '--json'], { interactive: true, typed: [SECRET] });
  assert.ok(!JSON.stringify(j.json).includes(SECRET));
  await refused(run(conn, ['keys', 'set', 'NEW_TOKEN3'], { interactive: true, typed: [''] }), /NEW_TOKEN3 has no value: type it when asked, or pipe it in/);
  await refused(run(conn, ['keys', 'set', '1']), /is no name for a key/);
  await refused(run(conn, ['keys', 'set', 'X_KEY', '--commands', 'maybe'], { interactive: true, typed: ['v'] }), /--commands takes on or off/);
});

test('set: from stdin when piped (the first line); the value is never an option', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/connections/secrets': { secret: open } }));
  // readText({ file: '-' }) is stdin: the fake reads it from `files`.
  const r = await run(conn, ['keys', 'set', 'OTHER_KEY'], { files: { '-': `${SECRET}\nsecond line\n` } });
  assert.equal((calls.at(-1)?.body as { value: string }).value, SECRET);
  assert.ok(!r.out.includes(SECRET));
  await assert.rejects(run(conn, ['keys', 'set', 'OTHER_KEY', '--value', 'x']), /Unknown option|--value/);
  await refused(run(conn, ['keys', 'set', 'OTHER_KEY'], { files: { '-': '\n' } }), /OTHER_KEY has no value: type it when asked, or pipe it in/);
});

test('set: a key that is there gets a new value, or only new details when the answer is empty', async () => {
  const { conn, calls } = fakeConn(routes({ 'PATCH /api/connections/secrets/GITHUB_TOKEN': { secret: gh } }));
  let r = await run(conn, ['keys', 'set', 'github token'], { interactive: true, typed: [SECRET] });
  assert.deepEqual(r.typed, [{ question: 'New value for GITHUB_TOKEN (empty keeps the current one): ', hidden: true }]);
  assert.deepEqual(calls.at(-1), { method: 'PATCH', path: '/api/connections/secrets/GITHUB_TOKEN', body: { value: SECRET } });
  assert.match(r.out, /^GITHUB_TOKEN has its new value\.$/m);
  r = await run(conn, ['keys', 'set', 'GITHUB_TOKEN', '--note', 'new note', '--domain', ''], { interactive: true, typed: [''] });
  assert.deepEqual(calls.at(-1)?.body, { domains: '', note: 'new note' });
  assert.match(r.out, /^Changed GITHUB_TOKEN\.$/m);
  const n = calls.length;
  r = await run(conn, ['keys', 'set', 'GITHUB_TOKEN'], { interactive: true, typed: [''] });
  assert.equal(calls.length, n + 1, 'only the list was read');
  assert.match(r.out, /^Nothing changed\.$/m);
});

test('remove: by name in any case, asks, --yes; a missing one is a usage error', async () => {
  const { conn, calls } = fakeConn(routes({ 'DELETE /api/connections/secrets/GITHUB_TOKEN': { ok: true } }));
  await refused(run(conn, ['keys', 'remove', 'GITHUB_TOKEN']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['keys', 'remove', 'github_token'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “GITHUB_TOKEN” for good?']);
  assert.match(r.out, /^Not removed\.$/m);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  r = await run(conn, ['keys', 'rm', 'GitHub token', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'DELETE', path: '/api/connections/secrets/GITHUB_TOKEN' });
  assert.match(r.out, /^Removed GITHUB_TOKEN\.$/m);
  await run(conn, ['keys', 'remove', 'GITH', '-y']);
  assert.equal(calls.at(-1)?.path, '/api/connections/secrets/GITHUB_TOKEN', 'the start of a name');
  await refused(run(conn, ['keys', 'remove', 'NOPE', '-y']), /^No key “NOPE”: hydor keys lists them$/);
  const picked = await run(conn, ['keys', 'remove'], { interactive: true, pick: 'GITHUB_TOKEN' });
  assert.deepEqual(picked.picked, ['Which key?']);
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

// Checks for `hydor memory`: notes listed and searched by place, shown, added, edited, forgotten and restored, the profile read and written.
// Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/memory-test.ts && DATA_DIR=/tmp/hydor-test-memory node dist/dev/memory-test.js
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

const now = Date.now();
const note = (id: number, text: string, extra: object = {}) => ({
  id,
  scope: 'global',
  scopeKey: '',
  kind: 'note',
  text,
  status: 'active',
  createdAt: now - 1e7,
  updatedAt: now - 3_600_000,
  uses: 0,
  hits: 0,
  source: 'user',
  scopeLabel: 'About you',
  ...extra,
});
const n1 = note(1, 'I prefer short answers', { basis: 'user', uses: 3, usedAt: now - 60_000 });
const n2 = note(22, 'Uses pnpm, not npm', { scope: 'repo', scopeKey: '/home/u/thesis', scopeLabel: 'thesis', source: 'agent', expiresAt: Date.UTC(2027, 5, 30) });
const n3 = note(23, 'Runs on a Mac', { scope: 'repo', scopeKey: '/home/u/other', scopeLabel: 'thesis' });
const prof = note(5, 'Chris, a researcher.\n\nLikes dark themes.', { kind: 'profile' });
const gone = note(9, 'Old fact', { status: 'deleted' });

const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/memory/entries': { entries: [n1, n2, n3, prof] },
  'GET /api/memory/entries?scope=repo&status=all': { entries: [n2, n3, { ...n3, id: 24, scopeKey: '/home/u/solo', scopeLabel: 'solo' }] },
  ...extra,
});
const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

test('list: a table without the profile; the place options go to the API; --json as returned', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['memory']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/memory/entries' }]);
  assert.match(r.out, /^ *NOTE +ABOUT +TEXT +CHANGED/m);
  assert.match(r.out, /^● +1 +About you +I prefer short answers +1h ago$/m);
  assert.match(r.out, /^● +22 +thesis +Uses pnpm, not npm/m);
  assert.doesNotMatch(r.out, /Chris, a researcher/, 'the profile is its own verb');
  const g = fakeConn(routes({ 'GET /api/memory/entries?scope=global': { entries: [n1] } }));
  await run(g.conn, ['memory', 'list', '--scope', 'global']);
  assert.equal(g.calls[0].path, '/api/memory/entries?scope=global');
  const s = fakeConn(routes({ 'GET /api/memory/entries?scope=session&key=claude%3As1': { entries: [] } }));
  assert.match((await run(s.conn, ['memory', '--session', 'claude:s1'])).out, /No notes yet: hydor memory add <text> makes one\./);
  const d = fakeConn(routes({ 'GET /api/memory/entries?status=deleted': { entries: [gone] } }));
  assert.match((await run(d.conn, ['memory', '--deleted'])).out, /^✗ +9 +About you +Old fact/m);
  assert.deepEqual((await run(fakeConn(routes()).conn, ['memory', '--json'])).json, [{ entries: [n1, n2, n3, prof] }]);
  await refused(run(conn, ['memory', '--scope', 'galaxy']), /--scope takes global, project, session/);
  await refused(run(conn, ['memory', '--project', 'a', '--session', 'b']), /not both/);
});

test('list: a project by its folder name, label or whole folder; several fit → a usage error', async () => {
  const route = '/api/memory/entries?scope=repo&key=%2Fhome%2Fu%2Fsolo';
  for (const given of ['solo', '/home/u/solo', 'SOLO']) {
    const t = fakeConn(routes({ [`GET ${route}`]: { entries: [n3] } }));
    await run(t.conn, ['memory', '--project', given]);
    assert.equal(t.calls.at(-1)?.path, route, given);
  }
  await refused(run(fakeConn(routes()).conn, ['memory', '--project', 'thesis']), /“thesis” fits 2 places: \/home\/u\/thesis, \/home\/u\/other\. Give its whole folder\./);
  await refused(run(fakeConn(routes()).conn, ['memory', '--project', 'nope']), /No project “nope” has notes/);
  await refused(run(fakeConn(routes()).conn, ['memory', '--scope', 'project']), /Say which project: --project <folder or name>/);
});

test('search: the words go as q; none found says so', async () => {
  const t = fakeConn(routes({ 'GET /api/memory/entries?q=short%20answers': { entries: [n1] }, 'GET /api/memory/entries?q=zzz': { entries: [] } }));
  assert.match((await run(t.conn, ['memory', 'search', 'short', 'answers'])).out, /I prefer short answers/);
  assert.match((await run(t.conn, ['memory', 'search', 'zzz'])).out, /^No notes fit “zzz”\.$/m);
  await refused(run(t.conn, ['memory', 'search']), /^Say the words: hydor memory search <words…> \[options\]$/);
});

test('show: by number, any status; the fields, text and --history', async () => {
  const t = fakeConn(
    routes({ 'GET /api/memory/entries?ids=22': { entries: [n2] }, 'GET /api/memory/entries/22/history': { history: [{ at: now - 1000, action: 'added', source: 'agent', why: 'from a chat' }] } }),
  );
  const r = await run(t.conn, ['memory', 'show', '22', '--history']);
  assert.match(r.out, /^Note 22$/m);
  assert.match(r.out, /^About +thesis$/m);
  assert.match(r.out, /^Written by +an agent$/m);
  assert.match(r.out, /^Ends +30 Jun 2027$/m);
  assert.match(r.out, /Uses pnpm, not npm/);
  assert.match(r.out, /History\n.*added +agent +from a chat/);
  assert.deepEqual((await run(t.conn, ['memory', 'show', '22', '--json'])).json, [{ entry: n2 }]);
  await refused(run(fakeConn(routes({ 'GET /api/memory/entries?ids=77': { entries: [] } })).conn, ['memory', 'show', '77']), /^No note 77: hydor memory lists them$/);
  // By the start of its text.
  const w = await run(fakeConn(routes({ 'GET /api/memory/entries?ids=22': { entries: [n2] } })).conn, ['memory', 'show', 'uses pnpm']);
  assert.match(w.out, /^Note 22$/m);
  await refused(run(fakeConn(routes()).conn, ['memory', 'show', 'xyz']), /No note “xyz”/);
  await refused(run(fakeConn(routes()).conn, ['memory', 'show']), /^Say which note: hydor memory show <note>/);
});

test('add: about you by default; a project, a session, an end date; text from a file', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/memory/entries': (b: unknown) => ({ entry: { ...n1, id: 40, ...(b as object) } }) }));
  const r = await run(conn, ['memory', 'add', 'I', 'like', 'tea']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/memory/entries', body: { text: 'I like tea', scope: 'global' } });
  assert.match(r.out, /^Remembered, note 40 \(About you\)\.$/m);
  await run(conn, ['memory', 'add', 'Uses', 'yarn', '--project', 'solo']);
  assert.deepEqual(calls.at(-1)?.body, { text: 'Uses yarn', scope: 'repo', key: '/home/u/solo' });
  await run(conn, ['memory', 'add', 'Fresh', '--project', '/home/u/new']);
  assert.deepEqual(calls.at(-1)?.body, { text: 'Fresh', scope: 'repo', key: '/home/u/new' }, 'a full folder starts a place');
  await run(conn, ['memory', 'add', 'In a session', '--session', 'claude:s1']);
  assert.deepEqual(calls.at(-1)?.body, { text: 'In a session', scope: 'session', key: 'claude:s1' });
  await run(conn, ['memory', 'add', 'x', 'y', '--expires', '2027-03-01']);
  assert.equal((calls.at(-1)?.body as { expiresAt: number }).expiresAt, Date.parse('2027-03-01'));
  await run(conn, ['memory', 'add', 'x', 'y', '--expires', '30d']);
  assert.ok(Math.abs((calls.at(-1)?.body as { expiresAt: number }).expiresAt - (Date.now() + 30 * 86_400_000)) < 5000);
  await run(conn, ['memory', 'add', '--file', 'n.txt'], { files: { 'n.txt': 'From a file\n' } });
  assert.equal((calls.at(-1)?.body as { text: string }).text, 'From a file');
  await refused(run(conn, ['memory', 'add']), /no terminal for the editor/);
  await refused(run(conn, ['memory', 'add', 'x', '--expires', 'soon']), /--expires takes a day/);
  await refused(run(conn, ['memory', 'add', 'x', '--project', 'nope']), /No project “nope” has notes yet/);
  const secret = fakeConn(routes({ 'POST /api/memory/entries': new ApiError(400, 'That looks like a password') }));
  await refused(run(secret.conn, ['memory', 'add', 'password is hunter2']), /looks like a password/, ApiError);
});

test('edit: the new words, a file, the editor (unchanged changes nothing), the end date', async () => {
  const { conn, calls } = fakeConn(routes({ 'GET /api/memory/entries?ids=1': { entries: [n1] }, 'PATCH /api/memory/entries/1': (b: unknown) => ({ entry: { ...n1, ...(b as object) } }) }));
  await run(conn, ['memory', 'edit', '1', 'Short', 'answers', 'please']);
  assert.deepEqual(calls.at(-1), { method: 'PATCH', path: '/api/memory/entries/1', body: { text: 'Short answers please' } });
  await run(conn, ['memory', 'edit', '1', '--file', 'n.txt'], { files: { 'n.txt': 'From file' } });
  assert.deepEqual(calls.at(-1)?.body, { text: 'From file' });
  await run(conn, ['memory', 'edit', '1', '--expires', 'none']);
  assert.deepEqual(calls.at(-1)?.body, { expiresAt: null });
  const same = await run(conn, ['memory', 'edit', '1'], { interactive: true, edit: null });
  assert.deepEqual(same.edited, ['I prefer short answers']);
  assert.match(same.out, /^Nothing changed\.$/m);
  const n = calls.length;
  await run(conn, ['memory', 'edit', '1'], { interactive: true, edit: 'Edited\n' });
  assert.equal(calls.length, n + 2);
  assert.deepEqual(calls.at(-1)?.body, { text: 'Edited' });
});

test('forget: asks, --forever erases; restore brings back', async () => {
  const { conn, calls } = fakeConn(
    routes({
      'GET /api/memory/entries?ids=1': { entries: [n1] },
      'DELETE /api/memory/entries/1': { ok: true },
      'DELETE /api/memory/entries/1?forever=1': { ok: true },
      'GET /api/memory/entries?status=deleted': { entries: [gone] },
      'POST /api/memory/entries/9/restore': { entry: gone },
    }),
  );
  await refused(run(conn, ['memory', 'forget', '1']), /nobody to ask here, so add -y/);
  let r = await run(conn, ['memory', 'forget', '1'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Forget “I prefer short answers”?']);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  r = await run(conn, ['memory', 'forget', '1', '-y']);
  assert.deepEqual(calls.at(-1), { method: 'DELETE', path: '/api/memory/entries/1' });
  assert.match(r.out, /Forgot note 1\. hydor memory restore 1 brings it back for 30 days\./);
  r = await run(conn, ['memory', 'forget', '1', '--forever', '-y']);
  assert.equal(calls.at(-1)?.path, '/api/memory/entries/1?forever=1');
  assert.match(r.out, /^Erased note 1\.$/m);
  r = await run(conn, ['memory', 'restore', 'old']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/memory/entries/9/restore' });
  assert.match(r.out, /^Restored note 9\.$/m);
});

test('profile: shown as Markdown, written from a file or the editor, cleared on a yes', async () => {
  const { conn, calls } = fakeConn(
    routes({ 'GET /api/memory/profile': { profile: prof, maxWords: 1000 }, 'PUT /api/memory/profile': (b: unknown) => ({ profile: { ...prof, ...(b as object) }, maxWords: 1000, fitting: false }) }),
  );
  const r = await run(conn, ['memory', 'profile']);
  assert.match(r.out, /^6 of 1000 words · changed 1h ago$/m);
  assert.match(r.out, /Likes dark themes\./);
  assert.match((await run(conn, ['memory', 'profile', 'show'])).out, /Likes dark themes\./);
  assert.deepEqual((await run(conn, ['memory', 'profile', '--json'])).json, [{ profile: prof, maxWords: 1000 }]);
  await run(conn, ['memory', 'profile', 'edit', '--file', 'p.md'], { files: { 'p.md': 'New profile' } });
  assert.deepEqual(calls.at(-1), { method: 'PUT', path: '/api/memory/profile', body: { text: 'New profile' } });
  const same = await run(conn, ['memory', 'profile', 'edit'], { interactive: true, edit: null });
  assert.deepEqual(same.edited, [prof.text]);
  assert.match(same.out, /^Nothing changed\.$/m);
  await run(conn, ['memory', 'profile', 'edit'], { interactive: true, edit: 'Edited' });
  assert.equal((calls.at(-1)?.body as { text: string }).text, 'Edited');
  await refused(run(conn, ['memory', 'profile', 'edit', '--clear']), /nobody to ask here/);
  const c = await run(conn, ['memory', 'profile', 'edit', '--clear', '-y']);
  assert.deepEqual(calls.at(-1)?.body, { text: '' });
  assert.match(c.out, /^Emptied your profile\.$/m);
  const empty = fakeConn({ 'GET /api/memory/profile': { profile: null, maxWords: 1000 } });
  assert.match((await run(empty.conn, ['memory', 'profile'])).out, /Your profile is empty/);
  const long = fakeConn({ 'GET /api/memory/profile': { profile: prof, maxWords: 1000 }, 'PUT /api/memory/profile': { profile: prof, maxWords: 1000, fitting: true } });
  assert.match((await run(long.conn, ['memory', 'profile', 'edit', '--file', 'p.md'], { files: { 'p.md': 'x' } })).out, /shortens it in the background/);
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

// Checks for `hydor projects`, the worked example of an area: each verb calls the right endpoints with the right
// bodies, names resolve by id or name, nothing is removed without a yes, a missing project is picked on a terminal
// and asked for elsewhere, --json prints what the API returned. Against a fake connection (test-kit.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/projects-test.ts && DATA_DIR=/tmp/hydor-test-projects node dist/dev/projects-test.js
import assert from 'node:assert/strict';
import path from 'node:path';
import { ApiError } from '../client.ts';
import { Cancelled, UsageError } from './kit.ts';
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

const thesis = {
  id: 'sp1aaa',
  name: 'Thesis',
  color: 'blue',
  description: 'My PhD',
  folder: '/home/u/thesis',
  folders: ['/home/u/papers'],
  instructions: 'Cite **everything**.',
  assistant: 'researcher',
  createdAt: Date.UTC(2026, 10, 3),
};
const notes = { id: 'sp2bbb', name: 'Thesis notes', color: 'green', folder: '/home/u/Projects/thesis-notes', createdAt: 1 };
const plain = { id: 'sp3ccc', name: 'Notes', color: 'amber', folder: '/home/u/notes', sharedKnowledge: false, createdAt: 2 };
const group = { id: 'sp4ddd', name: 'All', color: 'slate', folder: '/home/u/all', members: ['sp1aaa', 'sp3ccc'], createdAt: 3 };
const spaces = [
  { ...thesis, sessions: 3, lastAt: Date.now() - 60_000, docs: 2, skills: 1, library: 0 },
  { ...notes, sessions: 0, docs: 0, skills: 0, library: 0 },
  { ...plain, sessions: 1, docs: 0, skills: 0, library: 0 },
  { ...group, sessions: 0, docs: 0, skills: 0, library: 0 },
];
const base = {
  id: 'kb1',
  name: 'Thesis',
  space: 'sp1aaa',
  sources: [
    { id: 's1', kind: 'folder', path: '/home/u/papers', name: 'papers', addedAt: 1 },
    { id: 's0', kind: 'files', path: '/data/kb1/files', name: 'Files you added', addedAt: 1 },
  ],
  filesDir: '/data/kb1/files',
  docs: 2,
  passages: 40,
  embedded: 0,
  errors: [{ path: '/home/u/papers/bad.pdf', error: 'not a PDF' }],
  createdAt: 1,
};
const shared = { id: 'kb9', name: 'Shared', sources: [], filesDir: '', docs: 1, passages: 1, embedded: 0, errors: [], createdAt: 1 };
const docs = [
  { id: 1, base: 'kb1', path: '/home/u/papers/a.pdf', title: 'a.pdf', format: 'pdf', size: 10, passages: 30, status: 'indexed', indexedAt: 1 },
  { id: 2, base: 'kb1', path: '/data/kb1/files/notes.md', title: 'notes.md', format: 'md', size: 10, passages: 10, status: 'indexed', indexedAt: 1 },
];

/** The routes most tests need. */
const routes = (extra: Record<string, Answer> = {}): Record<string, Answer> => ({
  'GET /api/projects': { spaces },
  'GET /api/projects/sp1aaa': { space: thesis, sessions: ['claude:s-2', 'claude:s-1'] },
  'GET /api/projects/sp3ccc': { space: plain, sessions: [] },
  'GET /api/projects/sp4ddd': { space: group, sessions: [] },
  'GET /api/knowledge': { bases: [base, shared] },
  'GET /api/knowledge/kb1/docs': { docs },
  ...extra,
});

const refused = (p: Promise<unknown>, re: RegExp, kind: typeof UsageError | typeof ApiError = UsageError) => assert.rejects(p, (e: Error) => e instanceof kind && re.test(e.message), String(re));

// ---- list and show -----------------------------------------------------------------------------------------------

test('list: a table of projects, --json as returned', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['projects']);
  assert.deepEqual(calls, [{ method: 'GET', path: '/api/projects' }]);
  assert.match(r.out, /^PROJECT +FOLDER +SESSIONS +DOCS +LAST/m);
  assert.match(r.out, /^Thesis +~\/thesis +3 +2 +1m ago +My PhD$/m);
  assert.match(r.out, /^All \(2 projects\) /m);
  assert.equal(r.code, 0);
  const j = await run(fakeConn(routes()).conn, ['projects', 'list', '--json']);
  assert.deepEqual(j.json, [{ spaces }]);
  assert.equal(j.out, '');
  const none = await run(fakeConn({ 'GET /api/projects': { spaces: [] } }).conn, ['projects']);
  assert.match(none.out, /No projects yet: hydor projects new <name> makes one\./);
});

test('show: by name, id, or the start of either; the fields and guidelines', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['projects', 'show', 'thesis']);
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/api/projects', '/api/projects/sp1aaa'],
  );
  assert.match(r.out, /^Thesis$/m);
  assert.match(r.out, /^Id +sp1aaa$/m);
  assert.match(r.out, /^Folder +~\/thesis$/m);
  assert.match(r.out, /^Also works with +~\/papers$/m);
  assert.match(r.out, /^Agent +researcher$/m);
  assert.match(r.out, /^Documents +its own and the shared knowledge$/m);
  assert.match(r.out, /^Sessions +3 \(hydor projects sessions Thesis\)$/m);
  assert.match(r.out, /Guidelines\n/);
  assert.match(r.out, /Cite everything\./, 'the guidelines are drawn as Markdown');
  for (const given of ['sp1aaa', 'sp1', 'THESIS', 'sp3', 'Not']) {
    const t = fakeConn(routes());
    await run(t.conn, ['projects', 'show', given]);
    assert.ok(
      t.calls.some((c) => c.path === (given === 'sp3' || given === 'Not' ? '/api/projects/sp3ccc' : '/api/projects/sp1aaa')),
      given,
    );
  }
  assert.match((await run(fakeConn(routes()).conn, ['projects', 'show', 'Notes'])).out, /^Documents +its own only$/m);
  assert.match((await run(fakeConn(routes()).conn, ['projects', 'show', 'All'])).out, /^Brings together +Thesis, Notes$/m);
  const j = await run(fakeConn(routes()).conn, ['projects', 'show', 'thesis', '--json']);
  assert.deepEqual(j.json, [{ space: thesis, sessions: ['claude:s-2', 'claude:s-1'] }], 'what the API returned');
});

test('show: unknown and ambiguous names are usage errors that say what to do', async () => {
  const { conn } = fakeConn(routes());
  await refused(run(conn, ['projects', 'show', 'zzz']), /^No project “zzz”: hydor projects lists them$/);
  await refused(run(conn, ['projects', 'show', 'sp']), /^“sp” fits 4 projects: Thesis \(sp1aaa\), Thesis notes \(sp2bbb\), Notes \(sp3ccc\), All \(sp4ddd\)\. Give more of it, or its id\.$/);
  // The exact name wins over a longer name that starts with it.
  const t = fakeConn(routes());
  await run(t.conn, ['projects', 'show', 'Thesis']);
  assert.ok(t.calls.some((c) => c.path === '/api/projects/sp1aaa'));
  await refused(run(conn, ['projects', 'show', 'th']), /fits 2 projects/);
});

test('a project left out: asked for when piped, picked on a terminal', async () => {
  const { conn } = fakeConn(routes());
  await refused(run(conn, ['projects', 'show']), /^Say which project: hydor projects show <project>$/);
  const t = fakeConn(routes());
  const r = await run(t.conn, ['projects', 'show'], { interactive: true, pick: 'sp3ccc' });
  assert.deepEqual(r.picked, ['Which project?']);
  assert.ok(t.calls.some((c) => c.path === '/api/projects/sp3ccc'));
  assert.match(r.out, /^Notes$/m);
  await assert.rejects(run(fakeConn(routes()).conn, ['projects', 'show'], { interactive: true, pick: null }), Cancelled);
  // A sub-word is not an argument: too many words.
  await refused(run(conn, ['projects', 'show', 'a', 'b']), /^Too many words \(b\): hydor projects show <project>$/);
});

// ---- new, rename, edit -------------------------------------------------------------------------------------------

test('new: the body from the words and options', async () => {
  const { conn, calls } = fakeConn(routes({ 'POST /api/projects': (b: unknown) => ({ ...(b as object), id: 'sp9', folder: '/home/u/Projects/x', createdAt: 1 }) }));
  let r = await run(conn, ['projects', 'new', 'My', 'new', 'one']);
  assert.deepEqual(calls.at(-1), { method: 'POST', path: '/api/projects', body: { name: 'My new one' } });
  assert.match(r.out, /^Made “My new one” \(sp9\), in ~\/Projects\/x\.$/m);
  r = await run(conn, [
    'projects',
    'new',
    'X',
    '--description',
    'about',
    '--folder',
    '/tmp/f',
    '--with',
    '~/a',
    '--with',
    '/b',
    '--color',
    'teal',
    '--instructions',
    'Be brief',
    '--as',
    'coder',
    '--shared-knowledge',
    'off',
    '--members',
    'thesis',
    '--members',
    'sp3ccc',
  ]);
  assert.deepEqual(calls.at(-1)!.body, {
    name: 'X',
    description: 'about',
    folder: '/tmp/f',
    folders: ['~/a', '/b'],
    color: 'teal',
    instructions: 'Be brief',
    assistant: 'coder',
    sharedKnowledge: false,
    members: ['sp1aaa', 'sp3ccc'],
  });
  await run(conn, ['projects', 'new', 'Rel', '--folder', 'rel/dir']);
  assert.equal((calls.at(-1)!.body as { folder: string }).folder, path.resolve('rel/dir'), 'a folder here is made a full path');
  const there = fakeConn(routes({ 'POST /api/projects': {} }), { here: false });
  await run(there.conn, ['projects', 'new', 'Rel', '--folder', 'rel/dir']);
  assert.equal((there.calls.at(-1)!.body as { folder: string }).folder, 'rel/dir', 'on another computer, as typed');
  await run(conn, ['projects', 'new', 'F', '--file', 'g.md'], { files: { 'g.md': 'From a file' } });
  assert.equal((calls.at(-1)!.body as { instructions: string }).instructions, 'From a file');
  await refused(run(conn, ['projects', 'new']), /^Say the name: hydor projects new <name…> \[options\]$/);
  await refused(run(conn, ['projects', 'new', 'X', '--shared-knowledge', 'maybe']), /--shared-knowledge takes on or off/);
  const j = await run(conn, ['projects', 'new', 'J', '--json']);
  assert.equal((j.json[0] as { name: string }).name, 'J');
  assert.equal(j.out, '');
  await refused(run(fakeConn(routes({ 'POST /api/projects': new ApiError(400, 'No folder at /nope') })).conn, ['projects', 'new', 'X', '--folder', '/nope']), /^No folder at \/nope$/, ApiError);
});

test('rename: a new name of several words', async () => {
  const { conn, calls } = fakeConn(routes({ 'PATCH /api/projects/sp1aaa': (b: unknown) => ({ ...thesis, ...(b as object) }) }));
  const r = await run(conn, ['projects', 'rename', 'thesis', 'PhD', 'thesis']);
  assert.deepEqual(calls.at(-1), { method: 'PATCH', path: '/api/projects/sp1aaa', body: { name: 'PhD thesis' } });
  assert.match(r.out, /^“Thesis” is now “PhD thesis”\.$/m);
  await refused(run(conn, ['projects', 'rename', 'thesis']), /^Say the name: hydor projects rename <project> <name…>$/);
});

test('edit: only what is named changes; guidelines from a file, the editor, or nowhere', async () => {
  const { conn, calls } = fakeConn(routes({ 'PATCH /api/projects/sp1aaa': (b: unknown) => ({ ...thesis, ...(b as object) }) }));
  const body = () => calls.at(-1)!.body;
  let r = await run(conn, ['projects', 'edit', 'thesis', '--description', 'New about', '--color', 'pink']);
  assert.deepEqual(body(), { description: 'New about', color: 'pink' });
  assert.match(r.out, /^Changed “Thesis”: description, color\.$/m);
  await run(conn, ['projects', 'edit', 'thesis', '--description', '', '--as', '']);
  assert.deepEqual(body(), { description: '', assistant: '' }, 'empty clears');
  await run(conn, ['projects', 'edit', 'thesis', '--add-folder', '/home/u/more', '--add-folder', '/home/u/papers', '--remove-folder', '/gone']);
  assert.deepEqual(body(), { folders: ['/home/u/papers', '/home/u/more'] }, 'added once, a folder not there is no matter');
  await run(conn, ['projects', 'edit', 'thesis', '--remove-folder', '/home/u/papers']);
  assert.deepEqual(body(), { folders: [] });
  await run(conn, ['projects', 'edit', 'thesis', '--shared-knowledge', 'on']);
  assert.deepEqual(body(), { sharedKnowledge: true });
  r = await run(conn, ['projects', 'edit', 'thesis', '--file', 'g.md'], { files: { 'g.md': 'Guidelines!' } });
  assert.deepEqual(body(), { instructions: 'Guidelines!' });
  assert.match(r.out, /guidelines\./);
  await run(conn, ['projects', 'edit', 'All', '--ungroup']).catch(() => {});
  // Nothing named, on a terminal: the editor, holding the current guidelines.
  const n = calls.length;
  r = await run(conn, ['projects', 'edit', 'thesis'], { interactive: true, edit: 'Edited text' });
  assert.deepEqual(r.edited, ['Cite **everything**.']);
  assert.deepEqual(
    calls
      .slice(n)
      .filter((c) => c.method === 'PATCH')
      .map((c) => c.body),
    [{ instructions: 'Edited text' }],
  );
  // Saved unchanged: nothing is sent.
  const m = calls.length;
  r = await run(conn, ['projects', 'edit', 'thesis'], { interactive: true, edit: null });
  assert.match(r.out, /Nothing changed\./);
  assert.ok(!calls.slice(m).some((c) => c.method === 'PATCH'));
  // Nothing named and no terminal.
  await refused(run(conn, ['projects', 'edit', 'thesis']), /no terminal for the editor/);
  await refused(run(conn, ['projects', 'edit', 'thesis', '--bogus']), /Unknown option/);
});

// ---- sessions and files ----------------------------------------------------------------------------------------

test('sessions: its sessions, in the project’s order', async () => {
  const mk = (key: string, title: string) => ({ id: key.split(':')[1], key, title, agent: 'claude', cwd: '/home/u/thesis', updatedAt: Date.now(), createdAt: 1 });
  const { conn } = fakeConn(routes({ 'GET /api/sessions?limit=1000': { sessions: [mk('claude:s-1', 'Older'), mk('claude:other', 'Elsewhere'), mk('claude:s-2', 'Newer')] } }));
  const r = await run(conn, ['projects', 'sessions', 'thesis']);
  const lines = r.out.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /Newer/);
  assert.match(lines[1], /Older/);
  assert.match((await run(fakeConn(routes({ 'GET /api/sessions?limit=1000': { sessions: [] } })).conn, ['projects', 'sessions', 'Notes'])).out, /No sessions in “Notes” yet\./);
});

test('files: the project’s own bases only, with their documents', async () => {
  const { conn, calls } = fakeConn(routes());
  const r = await run(conn, ['projects', 'files', 'thesis']);
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/api/projects', '/api/knowledge', '/api/knowledge/kb1/docs'],
  );
  assert.match(r.out, /^Thesis 2 documents, 40 passages$/m);
  assert.match(r.out, /^ {2}folder ~\/papers$/m);
  assert.match(r.out, /a\.pdf +30 passages +~\/papers\/a\.pdf/);
  assert.match(r.out, /✗ ~\/papers\/bad\.pdf: not a PDF/);
  assert.ok(!r.out.includes('Shared'));
  const j = await run(fakeConn(routes()).conn, ['projects', 'files', 'thesis', '--json']);
  assert.deepEqual(j.json, [{ bases: [{ ...base, docs }] }]);
  const none = await run(fakeConn(routes()).conn, ['projects', 'files', 'Notes']);
  assert.match(none.out, /“Notes” has no documents of its own yet: hydor projects files add Notes <folder> adds a folder\./);
});

test('files add: reads a folder into the project’s base, making one when there is none', async () => {
  const t = fakeConn(routes({ 'POST /api/knowledge/kb1/folders': (b: unknown) => ({ id: 's2', kind: 'folder', ...(b as object) }) }));
  const r = await run(t.conn, ['projects', 'files', 'add', 'thesis', '/home/u/more']);
  assert.deepEqual(t.calls.at(-1), { method: 'POST', path: '/api/knowledge/kb1/folders', body: { path: '/home/u/more' } });
  assert.match(r.out, /^“Thesis” reads ~\/more now\.$/m);
  const u = fakeConn(routes({ 'POST /api/knowledge': { ...base, id: 'kbNew', space: 'sp3ccc' }, 'POST /api/knowledge/kbNew/folders': { path: '/home/u/n' } }));
  await run(u.conn, ['projects', 'files', 'add', 'Notes', '/home/u/n']);
  assert.deepEqual(u.calls.slice(-2), [
    { method: 'POST', path: '/api/knowledge', body: { name: 'Notes', space: 'sp3ccc' } },
    { method: 'POST', path: '/api/knowledge/kbNew/folders', body: { path: '/home/u/n' } },
  ]);
  await refused(run(t.conn, ['projects', 'files', 'add', 'thesis']), /^Say which folder: hydor projects files add <project> <folder>$/);
});

test('files remove: a folder or a document, after a yes', async () => {
  const t = fakeConn(routes({ 'DELETE /api/knowledge/kb1/sources/s1': { ok: true }, 'DELETE /api/knowledge/kb1/docs/2': { ok: true } }));
  let r = await run(t.conn, ['projects', 'files', 'remove', 'thesis', '/home/u/papers'], { interactive: true, confirm: true });
  assert.deepEqual(r.asked, ['Remove the folder ~/papers from “Thesis”?']);
  assert.deepEqual(t.calls.at(-1), { method: 'DELETE', path: '/api/knowledge/kb1/sources/s1' });
  r = await run(t.conn, ['projects', 'files', 'remove', 'thesis', 'notes.md', '-y']);
  assert.deepEqual(r.asked, [], '-y asks nothing');
  assert.deepEqual(t.calls.at(-1), { method: 'DELETE', path: '/api/knowledge/kb1/docs/2' });
  const n = t.calls.length;
  r = await run(t.conn, ['projects', 'files', 'remove', 'thesis', 'a.pdf'], { interactive: true, confirm: false });
  assert.match(r.out, /Not removed\./);
  assert.equal(t.calls.length, n + 3, 'only the reads: nothing deleted');
  assert.ok(!t.calls.slice(n).some((c) => c.method === 'DELETE'));
  await refused(run(t.conn, ['projects', 'files', 'remove', 'thesis', 'a.pdf']), /nobody to ask here, so add -y/);
  await refused(run(t.conn, ['projects', 'files', 'remove', 'thesis', 'nope', '-y']), /^No document or folder “nope”: hydor projects files thesis lists them$/);
});

// ---- remove ----------------------------------------------------------------------------------------------------

test('remove: asks first; -y answers; piped with no -y refuses; no is no', async () => {
  const { conn, calls } = fakeConn(routes({ 'DELETE /api/projects/sp3ccc': { ok: true, skills: ['research-notes'] } }));
  const deleted = () => calls.filter((c) => c.method === 'DELETE').length;
  await refused(run(conn, ['projects', 'remove', 'Notes']), /^Remove “Notes”: nobody to ask here, so add -y to say yes$/);
  assert.equal(deleted(), 0);
  let r = await run(conn, ['projects', 'remove', 'Notes'], { interactive: true, confirm: false });
  assert.deepEqual(r.asked, ['Remove “Notes”?']);
  assert.match(r.out, /^Not removed\.$/m);
  assert.equal(deleted(), 0);
  r = await run(conn, ['projects', 'remove', 'Notes'], { interactive: true, confirm: true });
  assert.deepEqual(calls.at(-1), { method: 'DELETE', path: '/api/projects/sp3ccc' });
  assert.match(r.out, /^Removed “Notes”\. Its folder \(~\/notes\), files and sessions stay; its skills joined the skill library: research-notes\.$/m);
  r = await run(conn, ['projects', 'rm', 'Notes', '-y']);
  assert.deepEqual(r.asked, []);
  assert.equal(deleted(), 2);
  const j = await run(conn, ['projects', 'remove', 'Notes', '-y', '--json']);
  assert.deepEqual(j.json, [{ ok: true, skills: ['research-notes'] }]);
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

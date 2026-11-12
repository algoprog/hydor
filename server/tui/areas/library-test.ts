// Checks for `hydor library` against a fake connection (test-kit.ts): list merges pages and media, filters by kind and project;
// search finds by words in titles and descriptions (and by meaning when the server says); show prints a document's text or what
// an item is; export asks the right route for the format, writes the bytes and says where; open prints the address; remove asks.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/tui/areas/library-test.ts && DATA_DIR=/tmp/hydor-test-library node dist/dev/library-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError, type Conn } from '../client.ts';
import { fakeConn, run } from './test-kit.ts';
import { UsageError } from './kit.ts';
import { kindOf } from './library.ts';

const DATA = process.env.DATA_DIR ?? '';
if (!DATA.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const now = Date.now();
const pages = [
  {
    id: 'd0c1111111',
    title: 'Q3 report',
    version: 3,
    versions: 3,
    bytes: 12_000,
    storageBytes: 0,
    createdAt: now - 9e6,
    updatedAt: now - 3600_000,
    kind: 'doc',
    description: 'The quarterly report',
    space: 'sp1',
    folder: 'f2',
  },
  {
    id: 'd3c2222222',
    title: 'Launch deck',
    version: 1,
    versions: 1,
    bytes: 400_000,
    storageBytes: 0,
    createdAt: now - 9e6,
    updatedAt: now - 7200_000,
    kind: 'slides',
    description: 'Pitch slides for the launch',
  },
  { id: 'b0a3333333', title: 'Budget', version: 2, versions: 2, bytes: 5000, storageBytes: 0, createdAt: now - 9e6, updatedAt: now - 86400_000, kind: 'sheet', description: 'Quarterly budget' },
  { id: 'a0b4444444', title: 'Notes page', version: 1, versions: 1, bytes: 900, storageBytes: 0, createdAt: now, updatedAt: now - 9e7, published: true },
  { id: 't0a5555555', title: 'Screen of a template', version: 1, versions: 1, bytes: 1, storageBytes: 0, createdAt: now, updatedAt: now, app: 'someapp' },
];
const media = [
  {
    id: 'img6666666',
    kind: 'image',
    title: 'Sunset',
    description: 'A sunset over the sea',
    mime: 'image/png',
    bytes: 2_500_000,
    width: 1024,
    height: 768,
    model: 'flux',
    createdAt: now - 1000,
    updatedAt: now - 1000,
    caption: 'done',
    file: '/x',
  },
];
const folders = [
  { id: 'f1', name: 'Thesis', space: 'sp1', createdAt: 1 },
  { id: 'f2', name: 'Drafts', parent: 'f1', space: 'sp1', createdAt: 2 },
];
const routes = { 'GET /api/pages': { pages, folders }, 'GET /api/media': { items: media }, 'GET /api/projects': { spaces: [{ id: 'sp1', name: 'Thesis' }] } };

/** A fake connection that can also fetch files: `files` by path. */
function withFiles(extra: Record<string, unknown>, files: Record<string, { data: Buffer; filename?: string; note?: string }>) {
  const f = fakeConn({ ...routes, ...extra });
  const asked: string[] = [];
  (f.conn as Conn).raw = async (p) => {
    asked.push(p);
    const x = files[p];
    if (!x) throw new ApiError(400, `No fake file ${p}`);
    return { type: 'application/octet-stream', ...x };
  };
  return { ...f, asked };
}

test('list merges pages and media, newest change first, with where each is', async () => {
  const { conn } = fakeConn(routes);
  const t = await run(conn, ['library']);
  const lines = t.out.trim().split('\n');
  assert.match(lines[0], /KIND\s+TITLE\s+ID\s+WHERE\s+CHANGED\s+SIZE/);
  assert.match(lines[1], /image\s+Sunset\s+img6666666\s+.*0m ago|image\s+Sunset/);
  assert.match(t.out, /doc\s+Q3 report\s+d0c1111111\s+Thesis › Thesis\/Drafts\s+1h ago\s+12 kB/);
  assert.match(t.out, /slides\s+Launch deck/);
  assert.match(t.out, /sheet\s+Budget/);
  assert.match(t.out, /page\s+Notes page/);
  assert.ok(!t.out.includes('Screen of a template'), 'a template’s screen is not in the Library');
  assert.match(t.out, /2\.5 MB/);
  const j = (await run(conn, ['library', '--json'])).json[0] as any;
  assert.equal(j.items.length, 5);
  assert.equal(j.folders.length, 2);
});

test('list filters by kind (with other words for it) and by project, and cuts to 30', async () => {
  const { conn } = fakeConn(routes);
  assert.match((await run(conn, ['library', 'list', '--kind', 'doc'])).out, /Q3 report/);
  assert.ok(!(await run(conn, ['library', 'list', '--kind', 'doc'])).out.includes('Budget'));
  assert.match((await run(conn, ['library', '--kind', 'deck'])).out, /Launch deck/);
  assert.match((await run(conn, ['library', '--kind', 'picture'])).out, /Sunset/);
  assert.match((await run(conn, ['library', '--project', 'thesis'])).out, /Q3 report/);
  assert.ok(!(await run(conn, ['library', '--project', 'thesis'])).out.includes('Budget'));
  assert.match((await run(conn, ['library', '--kind', 'video'])).out, /Nothing of that kind/);
  await assert.rejects(
    run(conn, ['library', '--kind', 'poem']),
    (e) => e instanceof UsageError && /--kind takes one of page, doc, slides, sheet, diagram, latex, notebook, image, video, audio/.test((e as Error).message),
  );
  assert.match((await run(conn, ['library', '-n', '2'])).out, /… 3 more/);
  assert.equal(kindOf('LaTeX'), 'tex');
  assert.match((await run(fakeConn({ ...routes, 'GET /api/pages': { pages: [], folders: [] }, 'GET /api/media': { items: [] } }).conn, ['library'])).out, /The Library is empty/);
});

test('search finds by every word in a title or description, and adds what is alike in meaning', async () => {
  const { conn } = fakeConn({ ...routes, 'GET /api/find?q=quarterly&in=pages': { alike: [{ id: 'page:d3c2222222' }, { id: 'page:d0c1111111' }] } });
  const t = await run(conn, ['library', 'search', 'quarterly']);
  const order = ['Q3 report', 'Budget', 'Launch deck'].map((x) => t.out.indexOf(x));
  assert.ok(
    order.every((i) => i >= 0),
    'both by words and by meaning',
  );
  assert.ok(order[2] > order[0] && order[2] > order[1], 'by meaning last');
  assert.ok(!t.out.includes('Sunset'));
  const k = await run(conn, ['library', 'search', 'quarterly', '--kind', 'sheet']);
  assert.match(k.out, /Budget/);
  assert.ok(!k.out.includes('Q3 report'));
  const none = fakeConn({ ...routes, 'GET /api/find?q=zebra&in=pages': new ApiError(404, 'x') });
  assert.match((await run(none.conn, ['library', 'search', 'zebra'])).out, /Nothing in the Library fits “zebra”/);
  await assert.rejects(run(conn, ['library', 'search']), (e) => e instanceof UsageError);
});

test('show prints a document’s text and says what anything else is', async () => {
  const { conn } = fakeConn({ ...routes, 'GET /api/pages/d0c1111111/export?format=md': '# Q3\n\nRevenue grew.\n' });
  const piped = await run(conn, ['library', 'show', 'q3']);
  assert.equal(piped.out, '# Q3\n\nRevenue grew.\n', 'piped: the text as it is');
  const term = await run(conn, ['library', 'show', 'Q3 report'], { interactive: true });
  assert.match(term.out, /Kind\s+doc/);
  assert.match(term.out, /Where\s+Thesis › Thesis\/Drafts/);
  assert.match(term.out, /Version\s+3 of 3/);
  assert.match(term.out, /Page\s+http:\/\/fake\/pages\/d0c1111111/);
  assert.match(term.out, /Revenue grew/);
  const deck = await run(conn, ['library', 'show', 'launch']);
  assert.match(deck.out, /Kind\s+slides/);
  assert.match(deck.out, /hydor library open d3c2222222/);
  assert.match(deck.out, /--to pptx\|pdf\|png\|md/);
  const pic = await run(conn, ['library', 'show', 'sunset']);
  assert.match(pic.out, /Picture\s+1024 × 768/);
  assert.match(pic.out, /Made by\s+flux/);
  assert.match(pic.out, /Page\s+http:\/\/fake\/media\/img6666666/);
  assert.equal((await run(conn, ['library', 'show', 'notes', '--json'])).json[0] && ((await run(conn, ['library', 'show', 'notes', '--json'])).json[0] as any).kind, 'page');
  await assert.rejects(run(conn, ['library', 'show', 'zzz']), (e) => e instanceof UsageError && /No item “zzz”/.test((e as Error).message));
});

test('export fetches the format’s route and writes the bytes where asked', async () => {
  const out = path.join(DATA, 'out');
  const f = withFiles(
    {},
    {
      '/api/pages/d0c1111111/export?format=pdf': { data: Buffer.from('%PDF-fake') },
      '/api/pages/d0c1111111/export?format=docx': { data: Buffer.from('PK-docx'), filename: 'Q3 report.docx' },
      '/api/pages/d3c2222222/export?format=pptx': { data: Buffer.from('PK-pptx'), note: 'Fonts inside: Inter' },
      '/api/pages/b0a3333333/export?format=csv': { data: Buffer.from('a,b\n1,2\n') },
      '/api/media/img6666666/file?download=1': { data: Buffer.from('PNGDATA') },
    },
  );
  const t = await run(f.conn, ['library', 'export', 'q3', '--to', 'pdf', '-o', path.join(out, 'q3.pdf')]);
  assert.equal(fs.readFileSync(path.join(out, 'q3.pdf'), 'utf8'), '%PDF-fake');
  assert.match(t.out, /^Saved “Q3 report” as .*q3\.pdf \(9 B\)\./);
  const cwd = process.cwd();
  process.chdir(out);
  try {
    await run(f.conn, ['library', 'export', 'q3']);
    assert.equal(fs.readFileSync(path.join(out, 'Q3 report.docx'), 'utf8'), 'PK-docx', 'a document is a Word file unless told');
    await assert.rejects(run(f.conn, ['library', 'export', 'q3']), (e) => e instanceof UsageError && /exists already/.test((e as Error).message));
    const d = await run(f.conn, ['library', 'export', 'launch']);
    assert.match(d.out, /Fonts inside: Inter/);
    assert.ok(fs.existsSync(path.join(out, 'Launch deck.pptx')));
    await run(f.conn, ['library', 'export', 'budget', '--to', 'csv']);
    assert.equal(fs.readFileSync(path.join(out, 'Budget.csv'), 'utf8'), 'a,b\n1,2\n');
    await run(f.conn, ['library', 'export', 'sunset']);
    assert.equal(fs.readFileSync(path.join(out, 'Sunset.png'), 'utf8'), 'PNGDATA');
    const j = await run(f.conn, ['library', 'export', 'q3', '--to', 'pdf', '-o', 'again.pdf', '--json']);
    assert.deepEqual(j.json, [{ id: 'd0c1111111', file: path.join(out, 'again.pdf'), bytes: 9, format: 'pdf' }]);
  } finally {
    process.chdir(cwd);
  }
  await assert.rejects(run(f.conn, ['library', 'export', 'q3', '--to', 'xlsx']), (e) => e instanceof UsageError && /exports as docx, pdf, odt, md, epub, txt, html/.test((e as Error).message));
  await assert.rejects(run(f.conn, ['library', 'export', 'sunset', '--to', 'pdf']), (e) => e instanceof UsageError && /saved as it is/.test((e as Error).message));
  assert.deepEqual(f.asked.slice(0, 2), ['/api/pages/d0c1111111/export?format=pdf', '/api/pages/d0c1111111/export?format=docx']);
});

test('open prints the address; remove asks, then deletes a page or a media item', async () => {
  const { conn, calls } = fakeConn({ ...routes, 'DELETE /api/pages/b0a3333333': { ok: true }, 'DELETE /api/media/img6666666': { ok: true } });
  assert.equal((await run(conn, ['library', 'open', 'budget'])).out, 'http://fake/pages/b0a3333333\n');
  assert.equal((await run(conn, ['library', 'open', 'sunset'])).out, 'http://fake/media/img6666666\n');
  assert.deepEqual((await run(conn, ['library', 'open', 'budget', '--json'])).json, [{ url: 'http://fake/pages/b0a3333333' }]);
  await assert.rejects(run(conn, ['library', 'remove', 'budget']), (e) => e instanceof UsageError && /add -y/.test((e as Error).message));
  const no = await run(conn, ['library', 'remove', 'budget'], { interactive: true, confirm: false });
  assert.deepEqual(no.asked, ['Delete the sheet “Budget”?']);
  assert.ok(!calls.some((c) => c.method === 'DELETE'));
  assert.equal((await run(conn, ['library', 'rm', 'budget', '-y'])).out, 'Removed “Budget”.\n');
  await run(conn, ['library', 'remove', 'sunset', '-y']);
  assert.deepEqual(
    calls.filter((c) => c.method === 'DELETE').map((c) => c.path),
    ['/api/pages/b0a3333333', '/api/media/img6666666'],
  );
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

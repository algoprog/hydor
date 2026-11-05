// Script tests for files dropped on the Library: uploads in pieces (in order, out of order, a piece too large, the whole
// larger than said, cancelled, an empty file, a disk that will not take one), what each file becomes (a document, a spreadsheet, a notebook, a LaTeX
// document, a picture kept once by its bytes, a video, a sound, a file in a project's folder at its place in the folder
// dropped, a name taken there already), what is refused and why (a kind the Library does not keep, a size past its
// limits, no room on the disk, a project that is not one, a place outside the folder); and the desktop app's moves by
// path: on the same disk and to another (/dev/shm is one here), a page's original to the Trash and back with Put back,
// one that loses something staying where it was, a failed import, a picture the Library had already, the folder a drop
// emptied, and the places a file is never moved from (the app's data, a project's folder, the system's, a link). And,
// from a browser over a real connection, the slides editor's video pieces: one refused part-way is answered at once.
// Build and run with a scratch folder (PLAYWRIGHT_BROWSERS_PATH for the browser):
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/uploads-test.ts
//   DATA_DIR=/tmp/hydor-test-uploads node dist/dev/uploads-test.js
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import Fastify from 'fastify';
import { canCapture, closeCapture, withTab } from '../capture/index.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { listTrash, restoreFromTrash } from '../files.ts';
import { setCaptionChoice } from '../media/caption.ts';
import { hasFfmpeg } from '../media/frames.ts';
import { createSpace } from '../spaces/index.ts';
import { pages } from './index.ts';
import { kindForFile } from './kinds.ts';
import { zipParts } from './ooxml.ts';
import { PIECE } from './uploads.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-uploads-test-')));
// Another disk than the app's data (tmpfs here), for moves that copy, check and remove.
const shm = fs.existsSync('/dev/shm') ? fs.mkdtempSync('/dev/shm/hydor-uploads-test-') : null;
const otherDisk = !!shm && fs.statSync(shm).dev !== fs.statSync(config.dataDir).dev;
if (!otherDisk) console.log('(no second disk here: moves across disks are not tested)');

const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number; extra?: Record<string, unknown> }, _req, reply) =>
  reply.code(err.status ?? err.statusCode ?? 500).send({ ...err.extra, error: err.message }),
);
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {} },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
// A page of this server's own, for a browser to send pieces from as the slides editor does (the last part).
app.get('/pieces', async (_req, reply) => reply.type('text/html').send('<!doctype html><title>Pieces</title>'));
await app.ready();
// Titles and descriptions of pictures from their names: no model is asked.
setCaptionChoice(db, { provider: 'endpoint' });

const json = (r: { body: string }) => {
  try {
    return JSON.parse(r.body);
  } catch {
    return {};
  }
};
const post = (url: string, body: unknown) => app.inject({ method: 'POST', url, payload: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const put = (url: string, data: Buffer) => app.inject({ method: 'PUT', url, payload: data, headers: { 'content-type': 'application/octet-stream' } });
const start = (b: Record<string, unknown>) => post('/api/library/uploads', b);

/** A whole upload, in pieces of `each` bytes: the last answer. */
async function upload(name: string, data: Buffer, o: { space?: string | null; rel?: string; each?: number } = {}) {
  const s = await start({ name, size: data.length, space: o.space ?? null, ...(o.rel ? { rel: o.rel } : {}) });
  if (s.statusCode !== 200) return { status: s.statusCode, body: json(s) };
  const id = json(s).upload as string;
  const each = o.each ?? data.length;
  let r = { statusCode: 0, body: '' };
  let at = 0;
  do {
    const piece = data.subarray(at, Math.min(data.length, at + each));
    r = await put(`/api/library/uploads/${id}?offset=${at}`, piece);
    at += piece.length;
  } while (at < data.length && r.statusCode === 200);
  return { status: r.statusCode, body: json(r), started: json(s) };
}

// ---- projects, files -----------------------------------------------------------------------------------------------

const thesisDir = path.join(tmp, 'Thesis');
fs.mkdirSync(thesisDir);
const thesis = createSpace(db, { name: 'Thesis', folder: thesisDir });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
const ff = await hasFfmpeg();
const media = path.join(tmp, 'media');
fs.mkdirSync(media);
if (ff) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x180:rate=12', '-pix_fmt', 'yuv420p', path.join(media, 'clip.mp4')]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(media, 'tone.mp3')]);
} else console.log('(no ffmpeg here: videos and sounds are not tested)');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const w = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
const word = (body: string) =>
  zipParts([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: `<?xml version="1.0"?><w:document ${NS}><w:body>${body}</w:body></w:document>` },
  ]);
const TEX = '\\documentclass{article}\n\\begin{document}\nHello, world.\n\\end{document}\n';
const pptxImports = kindForFile('a.pptx') === 'slides';

// ---- starting an upload: what is taken, and what is refused before a byte ---------------------------------------

{
  ok((await start({ size: 3 })).statusCode === 400, 'a file needs its name');
  ok((await start({ name: 'a.md', size: -1 })).statusCode === 400, 'and its size');
  ok((await start({ name: 'a.md', size: 3, space: 'spnothere00' })).statusCode === 400, 'a project that is not one is refused');
  ok((await start({ name: 'a.pdf', size: 3, space: thesis.id, rel: '../../etc/a.pdf' })).statusCode === 400, 'a place outside the folder dropped is refused');
  const pdf = await start({ name: 'Report.pdf', size: 1000, space: null });
  ok(pdf.statusCode === 415 && json(pdf).why === 'kind' && /drop it on a project/i.test(json(pdf).error), 'a PDF outside a project is refused before a byte comes, saying what the Library keeps and where it can go');
  const big = await start({ name: 'Notes.md', size: 31 * 1024 * 1024, space: null });
  ok(big.statusCode === 413 && json(big).why === 'size', 'a document over 30 MB outside a project is refused');
  const huge = await start({ name: 'Film.mp4', size: 1025 * 1024 * 1024, space: null });
  ok(huge.statusCode === 413 && json(huge).why === 'size' && /1 GB/.test(json(huge).error), 'a video over 1 GB outside a project is refused');
  const bigIn = await start({ name: 'Notes.md', size: 31 * 1024 * 1024, space: thesis.id });
  ok(bigIn.statusCode === 200 && json(bigIn).becomes === 'file', 'in a project, a document too large for a page goes in its folder as a file');
  if (bigIn.statusCode === 200) await app.inject({ method: 'DELETE', url: `/api/library/uploads/${json(bigIn).upload}` });
  const full = await start({ name: 'Disk image.iso', size: 2 ** 52, space: thesis.id });
  ok(full.statusCode === 507 && json(full).why === 'room', 'a file the disk has no room for is refused');
  const s = json(await start({ name: 'Plan.docx', size: 10, space: null }));
  ok(s.becomes === 'page' && s.kind === 'doc' && s.piece === PIECE, 'a Word file will become a document, sent in pieces of 32 MB at most');
  await app.inject({ method: 'DELETE', url: `/api/library/uploads/${s.upload}` });
  const cat = json(await start({ name: 'Cat.JPG', size: 10 }));
  ok(cat.becomes === 'image', 'a picture will be a picture, whatever the case of its name');
  await app.inject({ method: 'DELETE', url: `/api/library/uploads/${cat.upload}` });
}

// ---- pieces ---------------------------------------------------------------------------------------------------------

{
  const text = Buffer.from('# Field notes\n\nThe river was high today.\n\nWe crossed at the old bridge.\n');
  const s = json(await start({ name: 'Field notes.md', size: text.length, space: thesis.id }));
  const id = s.upload;
  let r = await put(`/api/library/uploads/${id}?offset=0`, text.subarray(0, 10));
  ok(r.statusCode === 200 && json(r).received === 10, 'a first piece is taken, and how much came is said');
  r = await put(`/api/library/uploads/${id}?offset=30`, text.subarray(30, 40));
  ok(r.statusCode === 409 && json(r).received === 10, 'a piece out of order is refused, saying where to go on from');
  r = await put(`/api/library/uploads/${id}?offset=0`, text.subarray(0, 10));
  ok(r.statusCode === 409 && json(r).received === 10, 'a piece sent twice is refused too');
  r = await put(`/api/library/uploads/${id}?offset=10`, Buffer.concat([text.subarray(10), Buffer.from('more than it said')]));
  ok(r.statusCode === 413, 'a piece that would make it larger than it said is refused');
  r = await put(`/api/library/uploads/${id}?offset=10`, text.subarray(10, 40));
  ok(r.statusCode === 200 && json(r).received === 40, 'and nothing of it was kept: the right piece goes on from where the last whole one ended');
  r = await put(`/api/library/uploads/${id}?offset=40`, text.subarray(40));
  const done = json(r).done;
  ok(r.statusCode === 200 && done?.as === 'page' && done.page?.kind === 'doc' && done.page.title === 'Field notes' && done.page.space === thesis.id, 'the last piece makes it a document named after its file, in the project');
  ok(events.some((e) => e.t === 'feature' && e.id === 'pages'), 'and the pages hear of it');
  ok((await put(`/api/library/uploads/${id}?offset=0`, text)).statusCode === 404, 'a finished upload takes no more pieces');
  ok(!fs.readdirSync(path.join(config.dataDir, 'library-uploads')).length, 'and nothing of it is left in the app’s data');
}
{
  // A piece larger than a piece may be.
  const s = json(await start({ name: 'Long.mp4', size: PIECE + 2048, space: null }));
  const r = await put(`/api/library/uploads/${s.upload}?offset=0`, Buffer.alloc(PIECE + 1024, 0x61));
  ok(r.statusCode === 413 && /at most 32 MB/.test(json(r).error), 'a piece over 32 MB is refused');
  // Cancelled: what came goes, and no more pieces are taken.
  const c = json(await start({ name: 'Draft.md', size: 100, space: null }));
  await put(`/api/library/uploads/${c.upload}?offset=0`, Buffer.alloc(50, 0x62));
  ok(fs.existsSync(path.join(config.dataDir, 'library-uploads', `${c.upload}.part`)), 'an upload’s pieces wait in the app’s data');
  ok((await app.inject({ method: 'DELETE', url: `/api/library/uploads/${c.upload}` })).statusCode === 200, 'an upload can be cancelled');
  ok(!fs.existsSync(path.join(config.dataDir, 'library-uploads', `${c.upload}.part`)), 'what came of it goes');
  ok((await put(`/api/library/uploads/${c.upload}?offset=50`, Buffer.alloc(50))).statusCode === 404, 'and it takes no more pieces');
  await app.inject({ method: 'DELETE', url: `/api/library/uploads/${s.upload}` });
  // Cancelled while its last piece is still coming: nothing is made of it.
  const pagesBefore = json(await app.inject({ method: 'GET', url: '/api/pages' })).pages.length;
  const text = Buffer.from('# Late\n\nWords.\n');
  const l = json(await start({ name: 'Late.md', size: text.length, space: null }));
  const slow = new PassThrough();
  const going = app.inject({ method: 'PUT', url: `/api/library/uploads/${l.upload}?offset=0`, payload: slow, headers: { 'content-type': 'application/octet-stream' } });
  slow.write(text.subarray(0, 5));
  await new Promise((r) => setTimeout(r, 50));
  await app.inject({ method: 'DELETE', url: `/api/library/uploads/${l.upload}` });
  slow.end(text.subarray(5));
  const late = await going;
  ok(late.statusCode === 499 && json(await app.inject({ method: 'GET', url: '/api/pages' })).pages.length === pagesBefore, 'an upload cancelled while its last piece comes makes nothing');
}

// ---- a disk that will not take a piece -----------------------------------------------------------------------------

/** The next writes to an upload's file fail as a disk does: `keep` bytes reach it, then `code`. Returns how to undo it. */
function failWrites(upload: string, code: string, keep = 0): () => void {
  const real = fs.createWriteStream;
  const failing = (p: fs.PathLike, o?: Parameters<typeof real>[1]) => {
    if (!String(p).endsWith(`${upload}.part`)) return real(p, o);
    let written = 0;
    return new Writable({
      write(chunk: Buffer, _enc, done) {
        const take = chunk.subarray(0, Math.max(0, keep - written));
        if (take.length) {
          fs.appendFileSync(String(p), take);
          written += take.length;
        }
        if (written >= keep) return done(Object.assign(new Error(`${code}: the disk would not take it, write`), { code }));
        done();
      },
    });
  };
  (fs as unknown as { createWriteStream: typeof failing }).createWriteStream = failing;
  return () => void ((fs as unknown as { createWriteStream: typeof real }).createWriteStream = real);
}
/** An answer, or 'hung' when none came in 15 s. */
const inTime = <T,>(p: Promise<T>) => Promise.race([p, new Promise<'hung'>((r) => setTimeout(() => r('hung'), 15_000))]);

{
  const words = 'Words that go in two pieces. '.repeat(40);
  const text = Buffer.from(`# On a full disk\n\n${words}\n`);
  const whole = async (upload: string) => {
    const r = await put(`/api/library/uploads/${upload}?offset=300`, text.subarray(300));
    const id = json(r).done?.page?.id;
    const model = id ? json(await app.inject({ method: 'GET', url: `/api/pages/${id}` })).model : null;
    return JSON.stringify(model ?? {}).includes(words.trim());
  };
  const part = (upload: string) => path.join(config.dataDir, 'library-uploads', `${upload}.part`);

  // The disk is full: 507, nothing more of the piece kept, and the upload goes on once there is room.
  const a = json(await start({ name: 'On a full disk.md', size: text.length, space: null })).upload;
  await put(`/api/library/uploads/${a}?offset=0`, text.subarray(0, 300));
  let undo = failWrites(a, 'ENOSPC');
  const full = await inTime(put(`/api/library/uploads/${a}?offset=300`, text.subarray(300)));
  undo();
  ok(full !== 'hung' && full.statusCode === 507 && json(full).why === 'room' && json(full).received === 300, 'a piece the full disk will not take is answered at once (507, no room), saying where to go on from');
  ok(fs.statSync(part(a)).size === 300, 'what came before it stays as it was');
  ok(await whole(a), 'sent again once there is room, it goes on from there and the file comes whole');

  // The disk fails part-way through a piece: 500 with what failed, and what of it reached the disk is taken back.
  const b = json(await start({ name: 'On a full disk.md', size: text.length, space: null })).upload;
  await put(`/api/library/uploads/${b}?offset=0`, text.subarray(0, 300));
  undo = failWrites(b, 'EIO', 100);
  const broken = await inTime(put(`/api/library/uploads/${b}?offset=300`, text.subarray(300)));
  undo();
  ok(broken !== 'hung' && broken.statusCode === 500 && /could not be written to the disk: EIO/.test(json(broken).error) && json(broken).received === 300, 'a write the disk fails is answered (500, with what failed)');
  ok(fs.statSync(part(b)).size === 300, 'and the bytes of the piece that reached the disk are taken back');
  ok(await whole(b), 'sent again, the file comes whole');

  // Its folder removed between two pieces: nothing safe is left, so it starts again from its first byte.
  const c = json(await start({ name: 'On a full disk.md', size: text.length, space: null })).upload;
  await put(`/api/library/uploads/${c}?offset=0`, text.subarray(0, 300));
  fs.rmSync(path.join(config.dataDir, 'library-uploads'), { recursive: true, force: true });
  const gone = await inTime(put(`/api/library/uploads/${c}?offset=300`, text.subarray(300)));
  ok(gone !== 'hung' && gone.statusCode === 500 && /ENOENT/.test(json(gone).error) && json(gone).received === 0, 'a piece whose folder was removed is answered, saying to start again');
  ok(json(await put(`/api/library/uploads/${c}?offset=300`, text.subarray(300))).received === 0, 'a piece sent from where it was is out of step');
  await put(`/api/library/uploads/${c}?offset=0`, text.subarray(0, 300));
  ok(await whole(c), 'sent again from its first byte, the file comes whole');
}

// ---- what each file becomes --------------------------------------------------------------------------------------------

{
  const csv = await upload('Budget.csv', Buffer.from('Item,Cost\nRent,1200\nFood,300\n'), { each: 7 });
  ok(csv.body.done?.as === 'page' && csv.body.done.page.kind === 'sheet' && !csv.body.done.page.space, 'a CSV in small pieces becomes a spreadsheet, in no project');
  const nb = JSON.stringify({ cells: [{ cell_type: 'markdown', source: ['# Spending'], metadata: {} }], metadata: {}, nbformat: 4, nbformat_minor: 5 });
  ok((await upload('Spending.ipynb', Buffer.from(nb))).body.done?.page?.kind === 'notebook', 'a notebook becomes a notebook');
  ok((await upload('paper.tex', Buffer.from(TEX), { space: thesis.id })).body.done?.page?.kind === 'tex', 'a .tex file becomes a LaTeX document');
  const latex = zipParts([{ name: 'main.tex', data: TEX }]);
  ok((await upload('Paper.zip', latex, { space: thesis.id })).body.done?.page?.kind === 'tex', 'a LaTeX project’s .zip becomes a LaTeX document');
  const letter = await upload('Letter.docx', word(w('Dear Sam,') + w('Thanks for the call.')));
  ok(letter.body.done?.page?.kind === 'doc' && letter.body.done.page.title === 'Letter', 'a Word file becomes a document');

  // A zip that is no LaTeX project: a file in the project's folder, or refused outside one.
  const photos = zipParts([{ name: 'a.txt', data: 'hello' }]);
  const zin = await upload('Photos.zip', photos, { space: thesis.id, rel: 'Trip/Photos.zip' });
  ok(zin.body.done?.as === 'file' && zin.body.done.path === path.join(thesisDir, 'Trip', 'Photos.zip') && fs.readFileSync(zin.body.done.path).equals(photos), 'a .zip with no LaTeX in it goes in the project’s folder, at its place in the folder dropped');
  ok(zin.body.done?.notes?.length === 0, 'with nothing to say about LaTeX');
  const zout = await upload('Photos.zip', photos);
  ok(zout.status === 415 && /holds no LaTeX/.test(zout.body.error), 'and outside a project it is refused, saying why');

  // Any other file: in the project's folder (a name taken there gets another), refused outside.
  const pdf = Buffer.from('%PDF-1.4\n%fake\n');
  const p1 = await upload('June.pdf', pdf, { space: thesis.id, rel: 'Receipts/June.pdf' });
  const p2 = await upload('June.pdf', pdf, { space: thesis.id, rel: 'Receipts/June.pdf' });
  ok(p1.body.done?.as === 'file' && p1.body.done.path === path.join(thesisDir, 'Receipts', 'June.pdf') && p1.body.done.space === thesis.id, 'a PDF dropped on a project goes in its folder');
  ok(p2.body.done?.path === path.join(thesisDir, 'Receipts', 'June copy.pdf') && fs.readFileSync(p1.body.done.path).equals(pdf), 'a second one of the same name gets a name of its own, the first stays as it was');
  // A link in the project's folder to a folder elsewhere is not written through.
  const elsewhere = fs.mkdtempSync(path.join(tmp, 'elsewhere-'));
  fs.symlinkSync(elsewhere, path.join(thesisDir, 'Linked'));
  const linked = await upload('x.pdf', pdf, { space: thesis.id, rel: 'Linked/x.pdf' });
  ok(linked.status === 400 && !fs.readdirSync(elsewhere).length, 'a file is not put through a link in the project’s folder to a folder outside it');
  const empty = await upload('.gitkeep', Buffer.alloc(0), { space: thesis.id });
  ok(empty.body.done?.as === 'file' && fs.statSync(empty.body.done.path).size === 0, 'an empty file arrives with one empty piece');
  const pptx = await upload('Launch.pptx', Buffer.from('PK\u0003\u0004 not really a deck'), { space: thesis.id });
  if (pptxImports) ok(pptx.body.done?.as === 'page' || pptx.status === 422 || pptx.body.done?.as === 'file', 'a PowerPoint file goes to the import, which takes it');
  else ok(pptx.body.done?.as === 'file' && pptx.body.done.path === path.join(thesisDir, 'Launch.pptx'), 'a PowerPoint file, until the import takes one, goes in the project’s folder');
  if (!pptxImports) ok((await upload('Launch.pptx', Buffer.from('x'))).status === 415, 'and is refused outside a project');
  const bad = await upload('Broken.docx', Buffer.from('not a zip at all'), { space: thesis.id });
  ok(bad.body.done?.as === 'file' && bad.body.done.notes?.[0]?.includes('could not be read'), 'a Word file the import cannot read goes in the project’s folder, saying why');
  ok((await upload('Broken.docx', Buffer.from('not a zip at all'))).status === 422, 'and outside a project is refused with the import’s words');
}

// ---- pictures, videos and sounds -----------------------------------------------------------------------------------

{
  const a = await upload('Boat at dawn.png', PNG, { space: thesis.id });
  const item = a.body.done?.item;
  ok(a.body.done?.as === 'media' && item?.kind === 'image' && item.title === 'Boat at dawn' && item.space === thesis.id && !a.body.done.existed, 'a picture is kept in the Library, titled from its name, in the project');
  ok(item && fs.readFileSync(item.file).equals(PNG) && item.source === 'Boat at dawn.png', 'its bytes are the Library’s own, from the file named so');
  const again = await upload('IMG_2041.png', PNG);
  ok(again.body.done?.existed === true && again.body.done.item?.id === item?.id, 'the same bytes under another name: the Library says it has it, and makes no copy');
  ok(events.some((e) => e.t === 'feature' && e.id === 'media' && e.data?.item?.id === item?.id), 'the pages hear of the picture');
  if (ff) {
    const v = await upload('Tram ride.mp4', fs.readFileSync(path.join(media, 'clip.mp4')), { each: 4096 });
    ok(v.body.done?.item?.kind === 'video' && v.body.done.item.duration > 0, 'a video in many pieces is kept as a video, with its length');
    const s = await upload('Tone.mp3', fs.readFileSync(path.join(media, 'tone.mp3')));
    ok(s.body.done?.item?.kind === 'audio', 'a sound is kept as a sound');
  }
}

// ---- the desktop app: moving a file in by its path --------------------------------------------------------------------

const move = (b: Record<string, unknown>) => post('/api/library/move', b);
const drop = path.join(tmp, 'Downloads');
fs.mkdirSync(drop);
const file = (name: string, data: string | Buffer, at = drop) => {
  fs.mkdirSync(path.dirname(path.join(at, name)), { recursive: true });
  fs.writeFileSync(path.join(at, name), data);
  return path.join(at, name);
};
{
  // A picture: moved into the Library's own folder, by a rename on its disk.
  const pic = file('Sunset.png', Buffer.concat([PNG, Buffer.from('sunset')]));
  const r = json(await move({ path: pic, space: thesis.id }));
  ok(r.as === 'media' && r.moved === true && !fs.existsSync(pic) && fs.existsSync(r.item?.file) && r.item?.source === pic, 'a picture moves into the Library: it leaves its folder, and the Library has it');
  // The same bytes again: the Library says it has it, and the file stays.
  const dup = file('Sunset copy.png', Buffer.concat([PNG, Buffer.from('sunset')]));
  const d = json(await move({ path: dup }));
  ok(d.existed === true && !d.moved && fs.existsSync(dup), 'a picture the Library has already stays where it was');

  // A document: made a page, the original to the Trash, where Put back brings it back.
  const md = file('Shopping.md', '# Shopping\n\n- bread\n- tea\n');
  const p = json(await move({ path: md, space: null }));
  ok(p.as === 'page' && p.page?.kind === 'doc' && p.moved === true && !fs.existsSync(md), 'a Markdown file becomes a document, and leaves its folder');
  ok(p.trashed && fs.existsSync(p.trashed) && (await listTrash()).items.some((t) => t.path === p.trashed && t.from === md), 'its original is in the app’s Trash, which knows where it came from');
  await restoreFromTrash(p.trashed);
  ok(fs.readFileSync(md, 'utf8').startsWith('# Shopping'), 'Put back brings it back where it was');

  // What the page cannot keep: the original stays, and why.
  const shown = file('Trip.md', '# Trip\n\n![the map](map.png)\n');
  const t = json(await move({ path: shown }));
  ok(t.as === 'page' && t.stayed === true && t.lost?.includes('pictures') && fs.existsSync(shown), 'a Markdown file that shows pictures of its folder stays where it was, saying so');
  const foot = file('Thanks.docx', word(w('Dear Sam,') + '<w:p><w:r><w:t>Thanks.</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'));
  const f = json(await move({ path: foot }));
  ok(f.stayed === true && f.lost?.includes('footnotes') && fs.existsSync(foot), 'a Word file with footnotes stays, as Files’ editor would say it loses them');
  const plain = file('Plain.docx', word(w('Just words.')));
  ok(json(await move({ path: plain })).trashed && !fs.existsSync(plain), 'a Word file the document keeps whole goes to the Trash');
  const chapters = file('book/main.tex', '\\documentclass{book}\n\\begin{document}\n\\input{chapter1}\n\\end{document}\n');
  const c = json(await move({ path: chapters, space: thesis.id }));
  ok(c.stayed === true && c.lost?.includes('files') && fs.existsSync(chapters), 'a LaTeX file that reads others of its folder stays there');

  // A failed import: outside a project nothing moves; in one, the file goes in its folder.
  const broken = file('Broken.docx', 'not a zip');
  const b1 = await move({ path: broken });
  ok(b1.statusCode === 422 && fs.existsSync(broken), 'a Word file that cannot be read is refused outside a project, and stays where it was');
  const b2 = json(await move({ path: broken, space: thesis.id }));
  ok(b2.as === 'file' && b2.moved === true && !fs.existsSync(broken) && fs.existsSync(b2.path) && b2.path.startsWith(thesisDir), 'in a project it moves into the project’s folder');

  // Another file: into the project's folder, at its place in the folder dropped; that folder goes once it is empty.
  const album = path.join(drop, 'Receipts');
  const r1 = file('Receipts/jan.pdf', '%PDF jan');
  const r2 = file('Receipts/feb/feb.pdf', '%PDF feb');
  file('Receipts/.DS_Store', 'junk');
  const m1 = json(await move({ path: r1, space: thesis.id, rel: 'Receipts/jan.pdf', root: album }));
  ok(m1.as === 'file' && m1.moved === true && m1.path === path.join(thesisDir, 'Receipts', 'jan.pdf') && !fs.existsSync(r1), 'a PDF moves into the project’s folder, at its place in the folder dropped');
  ok(fs.existsSync(album), 'the folder dropped stays while it holds more');
  const m2 = json(await move({ path: r2, space: thesis.id, rel: 'Receipts/feb/feb.pdf', root: album }));
  ok(m2.path === path.join(thesisDir, 'Receipts', 'feb', 'feb.pdf') && !fs.existsSync(album), 'the last one out takes the emptied folder with it (what systems leave in folders too)');
  const kept = path.join(drop, 'Keep');
  file('Keep/a.pdf', '%PDF a');
  file('Keep/notes.txt.bak', 'mine');
  json(await move({ path: path.join(kept, 'a.pdf'), space: thesis.id, rel: 'Keep/a.pdf', root: kept }));
  ok(fs.existsSync(path.join(kept, 'notes.txt.bak')), 'a folder that still holds something of the user’s stays');
  const outside = file('Paper.pdf', '%PDF');
  const o = await move({ path: outside });
  ok(o.statusCode === 415 && json(o).why === 'kind' && fs.existsSync(outside), 'a PDF dropped outside a project is refused, and stays where it was');

  // Never moved: the app's own data, a project's folder, the system's, a link; nor a folder, nor a path that is not one.
  const own = file('stray.png', PNG, config.dataDir);
  ok(json(await move({ path: own })).copy === 'data' && fs.existsSync(own), 'a file of the app’s own data is not moved: the page is told to send a copy');
  const inProject = file('figure.png', PNG, thesisDir);
  const ip = await move({ path: inProject, space: null });
  ok(ip.statusCode === 403 && json(ip).copy === 'project' && fs.existsSync(inProject), 'nor one in a project’s folder');
  if (fs.existsSync('/etc/hostname')) ok(json(await move({ path: '/etc/hostname', space: thesis.id })).copy === 'system', 'nor one of the system’s');
  const link = path.join(drop, 'link.png');
  fs.symlinkSync(dup, link);
  ok(json(await move({ path: link })).copy === 'link' && fs.lstatSync(link).isSymbolicLink(), 'nor a link');
  ok((await move({ path: drop })).statusCode === 400, 'a folder is not moved whole');
  ok((await move({ path: 'Downloads/x.png' })).statusCode === 400, 'a path must be absolute');
  ok((await move({ path: path.join(drop, 'gone.png') })).statusCode === 404, 'and be there');
}

// ---- from another disk -------------------------------------------------------------------------------------------------

if (otherDisk && shm) {
  const data = crypto.randomBytes(300_000);
  const song = file('Song.png', Buffer.concat([PNG, data]), shm);
  const r = json(await move({ path: song }));
  ok(r.as === 'media' && r.moved === true && !fs.existsSync(song) && fs.readFileSync(r.item.file).equals(Buffer.concat([PNG, data])), 'from another disk a picture is copied whole, then the original removed');
  const md = file('Remote notes.md', '# Remote\n\nWords.\n', shm);
  const p = json(await move({ path: md }));
  ok(p.trashed && fs.existsSync(p.trashed) && !fs.existsSync(md) && fs.readFileSync(p.trashed, 'utf8').startsWith('# Remote'), 'a document’s original on another disk goes to the Trash all the same');
  await restoreFromTrash(p.trashed);
  ok(fs.existsSync(md), 'and Put back brings it back there');
  const pdf = file('Scan.pdf', Buffer.concat([Buffer.from('%PDF'), data]), shm);
  const f = json(await move({ path: pdf, space: thesis.id }));
  ok(f.as === 'file' && f.moved === true && !fs.existsSync(pdf) && fs.readFileSync(f.path).length === data.length + 4, 'another file from another disk moves into the project’s folder whole');
}

// ---- the slides editor's videos, from a browser over a real connection -------------------------------------------------

if (canCapture()) {
  // Refused part-way, a piece used to be answered only once the browser gave up sending it (a minute and more); refused
  // before its bytes are read, it is answered as well. Each is sent as web/src/features/pages/slides/media.ts sends one.
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const said = await withTab({ url: `http://127.0.0.1:${port}/pieces`, width: 800, height: 600 }, (tab) =>
    tab.evaluate<string[]>(
      `(async () => {
        const send = (url, mb) => new Promise((ok) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url);
          xhr.setRequestHeader('content-type', 'application/octet-stream');
          xhr.timeout = 10000;
          xhr.onload = () => { let b = {}; try { b = JSON.parse(xhr.responseText); } catch {} ok(xhr.status + ' ' + (b.error ?? b.received ?? '')); };
          xhr.onerror = () => ok('the connection broke');
          xhr.ontimeout = () => ok('no answer');
          xhr.send(new Blob([new Uint8Array(mb * 1024 * 1024)]));
        });
        const out = [];
        for (let i = 0; i < 3; i++) out.push(await send('/api/pages/videos?upload=browserpast' + i + '&offset=0&total=4194304', 6));
        out.push(await send('/api/pages/videos?upload=browserstep1&offset=5242880&total=41943040', 20));
        out.push(await send('/api/pages/videos?upload=browserbig1&offset=0&total=999999999', 20));
        out.push(await send('/api/pages/videos?upload=browsergood1&offset=0&total=2097152', 1));
        return out;
      })()`,
      120_000,
    ),
  );
  ok(said.slice(0, 3).every((r) => r.startsWith('413 That piece is larger')), `a video's piece refused part-way is answered at once, every time (${said.slice(0, 3).join(' | ')})`);
  ok(said[3]?.startsWith('409 The upload is out of step') && said[4]?.startsWith('413 That video is over'), `so is one refused before its bytes are read (${said[3]} | ${said[4]})`);
  ok(said[5] === '200 1048576', 'and the next piece goes in');
  closeCapture();
} else console.log('(no browser here: a refused video piece over a real connection is not tested)');

if (shm) fs.rmSync(shm, { recursive: true, force: true });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

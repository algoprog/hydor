// Script test for GET /api/fs/thumb (file-thumbs.ts): kinds with no picture and paths /api/fs/raw refuses give 404, a picture
// is scaled where a tool exists, a second ask is served from the kept pictures, and a PDF, a video, a document that carries a
// picture and one the app draws (where a browser is) each give one. Parts that need a tool this computer lacks are skipped.
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/file-thumbs-test.ts
//   DATA_DIR=/tmp/hydor-test-thumbs node dist/dev/file-thumbs-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Fastify from 'fastify';
import { HttpError } from './auth.ts';
import { canCapture, closeCapture, setCaptureIdle } from './capture/index.ts';
import { openDb } from './db.ts';
import { fileThumbRoutes, resweepThumbs, withoutScripts } from './file-thumbs.ts';
import { config } from './config.ts';
import { ffmpegBin } from './media/frames.ts';
import { normalizeDoc } from '../shared/docs.ts';
import { normalizeBook } from '../shared/sheets.ts';
import { docxOfDoc } from './pages/docs.ts';
import { zipParts } from './pages/ooxml.ts';
import { xlsxOfBook } from './pages/sheets.ts';
import { which } from './platform.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
process.env.CUDA_VISIBLE_DEVICES = '';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  }
};
const skip = (what: string) => console.log(`skipped: ${what}`);

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-thumbs-test-')));
const db = openDb(path.join(tmp, 'test.db'));
setCaptureIdle(500);

const app = Fastify();
app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err instanceof HttpError ? err.status : err.statusCode && err.statusCode < 600 ? err.statusCode : 500;
  reply.code(status).send({ error: err.message || 'Error' });
});
fileThumbRoutes(app, db);

const ask = (file: string, extra = '') => app.inject({ method: 'GET', url: `/api/fs/thumb?path=${encodeURIComponent(file)}${extra}` });
const kind = (r: { headers: Record<string, unknown> }) => String(r.headers['content-type'] ?? '');

/** A PNG of `w`×`h` pixels, a gradient, made here (so the test needs no picture tool to have a picture). */
function png(w: number, h: number): Buffer {
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    rows[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      rows[o] = (x * 255) / w;
      rows[o + 1] = (y * 255) / h;
      rows[o + 2] = 128;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'latin1');
    data.copy(b, 8);
    b.writeUInt32BE(zlib.crc32(b.subarray(4, 8 + data.length)) >>> 0, 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** A one-page PDF with a line of text. */
function pdf(): Buffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 36 Tf 72 700 Td (Thumbnail test) Tj ET 0.2 0.4 0.8 rg 72 400 300 200 re f';
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const at: number[] = [];
  objs.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const dims = (b: Buffer): { w: number; h: number } | null => {
  if (b.toString('latin1', 1, 4) === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return null;
};

const dir = path.join(tmp, 'files');
fs.mkdirSync(dir);
const put = (name: string, data: Buffer | string) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, data);
  return f;
};

try {
  // Kinds with no picture, and what /api/fs/raw would not serve either
  const txt = put('notes.txt', 'hello');
  ok((await ask(txt)).statusCode === 404, 'a text file has no picture');
  // An HTML file's scripts never run for its picture: the rule comes before any of them.
  const rule = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`;
  ok(withoutScripts('<html><head lang="en"><script>x()</script></head></html>').startsWith(`<html><head lang="en">${rule}<script>`), 'no scripts: the rule opens the head');
  ok(withoutScripts('<!DOCTYPE html><script>x()</script><p>hi</p>').startsWith(`<!DOCTYPE html>${rule}<script>`), 'no scripts: after the doctype when there is no head');
  ok(withoutScripts('<script>x()</script>').startsWith(`${rule}<script>`), 'no scripts: first of all otherwise');
  ok((await ask(put('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'))).statusCode === 404, 'an SVG is left to the page');
  ok((await ask(put('x.zip', 'PK'))).statusCode === 404, 'an unknown kind has none');
  const missing = await ask(path.join(dir, 'nothing.png'));
  ok(missing.statusCode === 404 && typeof missing.json().error === 'string', 'a missing file gives 404 with an error', missing.body);
  ok((await ask(dir)).statusCode === 404, 'a folder gives 404, as raw does');
  ok((await ask('/')).statusCode === 404, 'the root folder gives 404, as raw does');
  put('fake.png', 'not a png at all, just words');
  const fake = await ask(path.join(dir, 'fake.png'));
  ok(fake.statusCode === 404, 'a file that is not a picture under a picture name has no picture', fake.statusCode);

  // A picture, scaled
  const big = put('big.png', png(1200, 800));
  const tool = !!(which('magick') ?? which('convert')) || !!(await ffmpegBin()) || (process.platform === 'darwin' && fs.existsSync('/usr/bin/sips'));
  const r1 = await ask(big, '&w=300&t=1');
  ok(r1.statusCode === 200, 'a picture gives 200', r1.statusCode);
  ok(/^image\/(webp|jpeg|png)$/.test(kind(r1)), 'a picture comes as webp, jpeg or png', kind(r1));
  ok(r1.headers['cache-control'] === 'private, max-age=31536000, immutable', 'with t it caches for good', r1.headers['cache-control']);
  ok(String((await ask(big, '&w=300')).headers['cache-control']).includes('max-age=60'), 'without t it caches briefly');
  if (tool) {
    ok(r1.rawPayload.length < fs.statSync(big).size, 'the picture is smaller than the file', [r1.rawPayload.length, fs.statSync(big).size]);
    if (kind(r1) === 'image/png') ok(Math.max(dims(r1.rawPayload)?.w ?? 9999, dims(r1.rawPayload)?.h ?? 9999) <= 300, 'a PNG thumbnail is at most 300 on its longer side', dims(r1.rawPayload));
  } else skip('no picture tool here: the original is served');

  // A second ask comes from the kept pictures, and the width is clamped
  const thumbs = path.join(config.dataDir, 'thumbs', 'files');
  const before = fs.existsSync(thumbs) ? fs.readdirSync(thumbs).length : 0;
  ok(before > 0, 'pictures are kept under the data folder', thumbs);
  const same = await ask(big, '&w=300&t=1');
  ok(same.statusCode === 200 && Buffer.compare(same.rawPayload, r1.rawPayload) === 0, 'a second ask gives the same picture');
  ok((fs.existsSync(thumbs) ? fs.readdirSync(thumbs).length : 0) === before, 'and makes no new one');
  ok((await ask(big, '&w=5000')).statusCode === 200, 'a width too large is brought down');
  ok((await ask(big, '&w=abc')).statusCode === 200, 'a width that is no number is the default');
  // A changed file has a new picture
  fs.writeFileSync(big, png(1000, 900));
  const changed = await ask(big, '&w=300&t=2');
  ok(changed.statusCode === 200 && Buffer.compare(changed.rawPayload, r1.rawPayload) !== 0, 'a changed file gets a new picture');
  // Ten asks at once make one picture
  fs.writeFileSync(big, png(1100, 700));
  const many = await Promise.all(Array.from({ length: 10 }, () => ask(big, '&w=250')));
  ok(many.every((r) => r.statusCode === 200 && Buffer.compare(r.rawPayload, many[0].rawPayload) === 0), 'alike asks all get the same picture');

  // The sweep drops what is old
  const old = path.join(thumbs, `${'0'.repeat(40)}.webp`);
  fs.writeFileSync(old, 'x');
  const longAgo = new Date(Date.now() - 40 * 86400_000);
  fs.utimesSync(old, longAgo, longAgo);
  resweepThumbs();
  fs.writeFileSync(big, png(900, 900));
  await ask(big, '&w=200');
  ok(!fs.existsSync(old), 'a picture over 30 days old is swept');

  // A PDF
  if (which('pdftoppm') ?? which('pdftocairo')) {
    const r = await ask(put('doc.pdf', pdf()), '&w=300&t=1');
    ok(r.statusCode === 200 && /^image\//.test(kind(r)), 'a PDF gives a picture of its first page', [r.statusCode, r.body.slice(0, 200)]);
    ok(r.rawPayload.length > 200, 'and it is a picture');
    ok((await ask(put('fake.pdf', 'not a pdf'))).statusCode === 404, 'a file that is not a PDF under its name has none');
  } else skip('no pdftoppm: PDF');

  // A video
  const ffmpeg = await ffmpegBin();
  if (ffmpeg) {
    const v = path.join(dir, 'clip.mp4');
    try {
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', '-pix_fmt', 'yuv420p', v], { stdio: 'pipe' });
      const r = await ask(v, '&w=200&t=1');
      ok(r.statusCode === 200 && /^image\//.test(kind(r)) && r.rawPayload.length > 200, 'a video gives a frame', [r.statusCode, kind(r)]);
      const short = path.join(dir, 'short.mp4');
      execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=0.3:size=160x120:rate=10', '-pix_fmt', 'yuv420p', short], { stdio: 'pipe' });
      const s = await ask(short, '&w=200');
      ok(s.statusCode === 200 && /^image\//.test(kind(s)), 'a video shorter than a second gives its first frame', s.statusCode);
      ok((await ask(put('fake.mkv', 'just text, not a video file'))).statusCode === 404, 'a text file named as a video has none');
    } catch (e) {
      ok(false, 'making the test video', (e as Error).message);
    }
  } else skip('no ffmpeg: video');

  // A document that carries its own picture
  const carried = zipParts([
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'docProps/thumbnail.png', data: png(64, 48) },
  ]);
  const withPic = await ask(put('carry.pptx', carried), '&w=300&t=1');
  ok(withPic.statusCode === 200 && /^image\/(png|webp|jpeg)$/.test(kind(withPic)), 'a document carrying a picture gives it', withPic.statusCode);
  ok(withPic.rawPayload.length > 50, 'and it is not empty');

  // A document and a spreadsheet the app draws, where there is a browser
  const docx = docxOfDoc(db, normalizeDoc({ markdown: '# Quarterly report\n\nSome words in a paragraph.\n\n- one\n- two' }), 'Report');
  const xlsx = xlsxOfBook(normalizeBook({ sheets: [{ name: 'Plan', base: { cells: { A1: { v: 'Item' }, B1: { v: 'Cost' }, A2: { v: 'Tea' }, B2: { v: 4 } } } }] } as never), 'Plan');
  if (canCapture()) {
    const d = await ask(put('report.docx', docx), '&w=300&t=1');
    ok(d.statusCode === 200 && /^image\//.test(kind(d)) && d.rawPayload.length > 500, 'a Word file is drawn as its first page', [d.statusCode, d.body.slice(0, 200)]);
    const x = await ask(put('plan.xlsx', xlsx), '&w=300&t=1');
    ok(x.statusCode === 200 && /^image\//.test(kind(x)) && x.rawPayload.length > 500, 'an Excel file is drawn as its first cells', [x.statusCode, x.body.slice(0, 200)]);
    const c = await ask(put('data.csv', 'a,b\n1,2\n3,4\n'), '&w=300');
    ok(c.statusCode === 200 && /^image\//.test(kind(c)), 'a CSV file is drawn as cells', c.statusCode);
    const h = await ask(put('page.html', '<!doctype html><h1>Hello</h1><img src="https://example.invalid/x.png">'), '&w=300');
    ok(h.statusCode === 200 && /^image\//.test(kind(h)), 'an HTML file is drawn', h.statusCode);
    const nb = await ask(put('n.ipynb', JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [{ cell_type: 'markdown', metadata: {}, source: ['# Title'] }] })), '&w=300');
    ok(nb.statusCode === 200 && /^image\//.test(kind(nb)), 'a notebook is drawn', nb.statusCode);
    ok((await ask(put('big.html', `<p>${'x'.repeat(2_200_000)}</p>`))).statusCode === 404, 'an HTML file over 2 MB has none');
    ok((await ask(put('broken.docx', 'not a zip'))).statusCode === 404, 'a Word file that is not one has none');
  } else {
    skip('no capture browser: documents, spreadsheets, HTML and notebooks drawn by the app');
    ok((await ask(put('report.docx', docx))).statusCode === 404, 'without a browser a Word file with no picture inside has none');
  }
} catch (e) {
  failed++;
  console.log('FAIL the test stopped:', e);
} finally {
  closeCapture();
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Checks the PowerPoint files the slides editor exports against what Office shows, without Office: it makes the
// sample decks (pptx-samples.mjs) in a running copy of the app, exports each as .pptx and as the app's own pictures of
// its slides, validates every XML part of the .pptx against the ECMA-376 schemas (as PowerPoint refuses or "repairs"
// a file that breaks them), opens it in LibreOffice in Docker (an Office computer's fonts, none of the app's) twice —
// as it is, and with the fonts embedded in the file installed, as PowerPoint shows a file whose fonts it loads — and
// puts each slide's three pictures side by side with how much they differ, worst first, in report.html.
//
//   node scripts/office-check/pptx-check.mjs --url http://127.0.0.1:8795 --password 'a demo password' --out /tmp/pptx-check
//
// And the other way: --roundtrip opens each sample's .pptx in the app again (its pictures beside the original's) and
// a copy LibreOffice saved itself (beside LibreOffice's pictures of it); --files a.pptx,b.pptx opens other files
// (beside LibreOffice's pictures of them), in import.html.
//
// Options: --only text,shapes (some decks), --schemas DIR (where the schemas are kept; fetched from
// ecma-international.org when missing), --image hydor-office-check (LibreOffice's Docker image), --prefix NAME (its
// containers' names), --no-office (schemas only), --decks DIR (decks already exported there: no app needed).
// Needs xmllint (XMLLINT=path), Docker with the image (its Dockerfile is in README.md), and Playwright's Chromium
// headless shell (scripts/guide-shots/cdp.mjs finds it) to compare the pictures.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { samples } from './pptx-samples.mjs';
import { Browser } from '../guide-shots/cdp.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const OUT = path.resolve(opt('out', path.join(os.tmpdir(), 'pptx-check')));
const URL_ = opt('url', process.env.HYDOR_URL ?? 'http://127.0.0.1:8795');
const PASSWORD = opt('password', process.env.HYDOR_PASSWORD ?? 'a demo password');
const ONLY = opt('only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SCHEMAS = path.resolve(opt('schemas', path.join(os.tmpdir(), 'ecma-376-schemas')));
const IMAGE = opt('image', 'hydor-office-check');
const PREFIX = opt('prefix', 'office-check-pptx');
const XMLLINT = process.env.XMLLINT ?? 'xmllint';
const DECKS = opt('decks', '');

// ---- a small zip reader ---------------------------------------------------------------------------------------

/** The files of a zip: name → bytes. */
export function unzip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extra = buf.readUInt16LE(at + 30);
    const comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out.set(name, method === 8 ? zlib.inflateRawSync(data) : Buffer.from(data));
    at += 46 + nameLen + extra + comment;
  }
  return out;
}

// ---- the app ---------------------------------------------------------------------------------------------------

let cookie = '';
async function api(method, p, body) {
  const r = await fetch(new URL(p, URL_), {
    method,
    headers: { origin: new URL(URL_).origin, cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r;
}

async function signIn() {
  const r = await api('POST', '/api/auth/login', { password: PASSWORD });
  cookie = (r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? ''])
    .map((c) => c.split(';')[0])
    .filter(Boolean)
    .join('; ');
}

/** A sample made in the app and exported: its .pptx and the app's pictures of its slides (slide-NN.png, twice their size). */
async function exportDeck(d, dir) {
  const made = await (await api('POST', '/api/pages', { kind: 'slides', title: d.title, model: d.model })).json();
  const id = made.page.id;
  fs.writeFileSync(path.join(dir, 'page-id.txt'), id);
  fs.writeFileSync(path.join(dir, 'deck.pptx'), Buffer.from(await (await api('GET', `/api/pages/${id}/export?format=pptx`)).arrayBuffer()));
  fs.writeFileSync(path.join(dir, 'deck.pdf'), Buffer.from(await (await api('GET', `/api/pages/${id}/export?format=pdf`)).arrayBuffer()));
  const pics = unzip(Buffer.from(await (await api('GET', `/api/pages/${id}/export?format=png`)).arrayBuffer()));
  for (const [name, data] of pics) fs.writeFileSync(path.join(dir, `app-${/(\d+)/.exec(name)[1]}.png`), data);
  return id;
}

// ---- the standard's schemas ---------------------------------------------------------------------------------------

const ECMA = 'https://ecma-international.org/wp-content/uploads/';

/** The ECMA-376 Transitional schemas (Part 4) and the packaging ones (Part 2), fetched once, and one schema that takes them all in. */
function schemas() {
  const driver = path.join(SCHEMAS, 'all.xsd');
  if (!fs.existsSync(path.join(SCHEMAS, 'pml.xsd'))) fetchSchemas();
  const imports = [
    ['http://schemas.openxmlformats.org/presentationml/2006/main', 'pml.xsd'],
    ['http://schemas.openxmlformats.org/drawingml/2006/main', 'dml-main.xsd'],
    ['http://schemas.openxmlformats.org/drawingml/2006/chart', 'dml-chart.xsd'],
    ['http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'sml.xsd'],
    ['http://schemas.openxmlformats.org/officeDocument/2006/extended-properties', 'shared-documentPropertiesExtended.xsd'],
    ['http://schemas.openxmlformats.org/package/2006/content-types', 'opc-contentTypes.xsd'],
    ['http://schemas.openxmlformats.org/package/2006/relationships', 'opc-relationships.xsd'],
    ['http://schemas.openxmlformats.org/package/2006/metadata/core-properties', 'opc-coreProperties.xsd'],
  ];
  fs.writeFileSync(driver, `<?xml version="1.0" encoding="UTF-8"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">\n${imports.map(([ns, f]) => `  <xs:import namespace="${ns}" schemaLocation="${f}"/>`).join('\n')}\n</xs:schema>\n`);
  return driver;
}

function fetchSchemas() {
  fs.mkdirSync(SCHEMAS, { recursive: true });
  const fetchZip = (url, file) => execFileSync('curl', ['-sfL', '-m', '300', '-o', file, url]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecma-'));
  fetchZip(`${ECMA}ECMA-376-4_5th_edition_december_2016.zip`, path.join(tmp, 'p4.zip'));
  fetchZip(`${ECMA}ECMA-376-2_5th_edition_december_2021.zip`, path.join(tmp, 'p2.zip'));
  const inner = (zip, name) => unzip(unzip(fs.readFileSync(zip)).get(name));
  for (const [n, data] of inner(path.join(tmp, 'p4.zip'), 'OfficeOpenXML-XMLSchema-Transitional.zip')) fs.writeFileSync(path.join(SCHEMAS, n), data);
  for (const [n, data] of inner(path.join(tmp, 'p2.zip'), 'OpenPackagingConventions-XMLSchema.zip')) fs.writeFileSync(path.join(SCHEMAS, n), data);
  // What they import from elsewhere, kept beside them.
  for (const [n, url] of [
    ['xml.xsd', 'https://www.w3.org/2001/xml.xsd'],
    ['dc.xsd', 'https://www.dublincore.org/schemas/xmls/qdc/2003/04/02/dc.xsd'],
    ['dcterms.xsd', 'https://www.dublincore.org/schemas/xmls/qdc/2003/04/02/dcterms.xsd'],
    ['dcmitype.xsd', 'https://www.dublincore.org/schemas/xmls/qdc/2003/04/02/dcmitype.xsd'],
  ])
    fetchZip(url, path.join(SCHEMAS, n));
  const edit = (n, f) => fs.writeFileSync(path.join(SCHEMAS, n), f(fs.readFileSync(path.join(SCHEMAS, n), 'utf8')));
  const local = (s) =>
    s
      .replace(/schemaLocation="https?:\/\/www\.w3\.org\/2001\/(03\/)?xml\.xsd"/g, 'schemaLocation="xml.xsd"')
      .replace(/schemaLocation="https?:\/\/dublincore\.org\/schemas\/xmls\/qdc\/2003\/04\/02\/(\w+\.xsd)"/g, 'schemaLocation="$1"')
      .replace(/<(xs|xsd):import (id="xml" )?namespace="http:\/\/www\.w3\.org\/XML\/1998\/namespace"\/>/g, '<$1:import $2namespace="http://www.w3.org/XML/1998/namespace" schemaLocation="xml.xsd"/>');
  for (const n of fs.readdirSync(SCHEMAS)) if (n.endsWith('.xsd')) edit(n, local);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/**
 * A part as an Office program that knows only the standard reads it (Markup Compatibility, ECMA-376 Part 3): each
 * mc:AlternateContent as its Fallback, and what the root says may be ignored left out. What a Choice holds is
 * Microsoft's own markup ([MS-PPTX]): returned apart, to be checked by hand.
 */
export function standardOnly(xml) {
  const choices = [];
  let out = xml.replace(/<mc:AlternateContent\b[^>]*>([\s\S]*?)<\/mc:AlternateContent>/g, (_m, inner) => {
    for (const c of inner.matchAll(/<mc:Choice\b[^>]*>([\s\S]*?)<\/mc:Choice>/g)) choices.push(c[1]);
    return /<mc:Fallback>([\s\S]*?)<\/mc:Fallback>/.exec(inner)?.[1] ?? '';
  });
  const ign = /\bmc:Ignorable="([^"]*)"/.exec(out)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
  for (const p of ign) {
    out = out.replace(new RegExp(`\\s${p}:[\\w-]+="[^"]*"`, 'g'), '');
    out = out.replace(new RegExp(`<${p}:([\\w-]+)\\b[^>]*/>`, 'g'), '').replace(new RegExp(`<${p}:([\\w-]+)\\b[^>]*>[\\s\\S]*?</${p}:\\1>`, 'g'), '');
  }
  out = out.replace(/\s(mc:Ignorable|xmlns:mc)="[^"]*"/g, '');
  return { xml: out, choices };
}

/** Every XML part of a .pptx validated against the schemas: the errors xmllint gives, by part. */
function validate(file, work) {
  const driver = schemas();
  const parts = unzip(fs.readFileSync(file));
  const dir = path.join(work, 'parts');
  fs.rmSync(dir, { recursive: true, force: true });
  const names = [];
  // The package's parts, and those of the packages inside it (a chart's workbook).
  const put = (name, data) => {
    if (/\.(xlsx|docx|pptx)$/.test(name)) {
      for (const [inner, d] of unzip(data)) put(`${name}/${inner}`, d);
      return;
    }
    if (!/\.(xml|rels)$/.test(name)) return;
    const { xml } = standardOnly(data.toString('utf8'));
    const f = path.join(dir, name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, xml);
    names.push(f);
  };
  for (const [name, data] of parts) put(name, data);
  const r = spawnSync(XMLLINT, ['--noout', '--nonet', '--schema', driver, ...names], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const errors = (r.stderr || '')
    .split('\n')
    .filter((l) => l && !/ validates$/.test(l) && !/Schemas parser warning/.test(l))
    .map((l) => l.replace(`${dir}/`, ''));
  return { parts: names.length, errors };
}

// ---- LibreOffice ---------------------------------------------------------------------------------------------------

/** An embedded font (PowerPoint's .fntdata, Embedded OpenType) as the TrueType file inside it, or null (MicroType Express compressed). */
export function eotFont(b) {
  if (b.length < 82 || b.readUInt16LE(34) !== 0x504c) return null;
  const size = b.readUInt32LE(4);
  const flags = b.readUInt32LE(12);
  if (flags & 0x4) return null;
  const data = Buffer.from(b.subarray(b.readUInt32LE(0) - size, b.readUInt32LE(0)));
  if (flags & 0x10000000) for (let i = 0; i < data.length; i++) data[i] ^= 0x50;
  return data;
}

/** The deck opened in LibreOffice and printed as pictures of its slides (lo-NN.png), with `fonts` (a folder) installed or none; and the fonts its PDF used. */
function office(dir, tag, fonts, file = 'deck.pptx') {
  const uid = `${process.getuid()}:${process.getgid()}`;
  const mounts = ['-v', `${dir}:/work`, ...(fonts ? ['-v', `${fonts}:/usr/share/fonts/truetype/deck:ro`] : [])];
  const name = `${PREFIX}-${path.basename(dir)}-${tag}`.replace(/[^\w.-]/g, '-');
  const sh = `cd /work && mkdir -p ${tag} && soffice -env:UserInstallation=file:///tmp/lo --headless --convert-to pdf --outdir /work/${tag} /work/${file} >/dev/null 2>&1 && pdftoppm -r 96 -png /work/${tag}/${file.replace(/\.\w+$/, '')}.pdf /work/${tag}/lo && pdffonts /work/${tag}/${file.replace(/\.\w+$/, '')}.pdf > /work/${tag}/fonts.txt`;
  const r = spawnSync('docker', ['run', '--rm', '--name', name, '--network', 'none', '--user', uid, '-e', 'HOME=/tmp', ...mounts, IMAGE, 'sh', '-c', sh], { encoding: 'utf8', timeout: 300_000 });
  if (r.status !== 0) throw new Error(`LibreOffice failed for ${dir}: ${r.stderr.slice(-500)}`);
  const pics = fs
    .readdirSync(path.join(dir, tag))
    .filter((f) => /^lo-\d+\.png$/.test(f))
    .sort((a, b) => Number(/\d+/.exec(a)[0]) - Number(/\d+/.exec(b)[0]));
  const used = fs
    .readFileSync(path.join(dir, tag, 'fonts.txt'), 'utf8')
    .split('\n')
    .slice(2)
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean)
    .map((n) => n.replace(/^[A-Z]{6}\+/, ''));
  return { pics: pics.map((f) => path.join(dir, tag, f)), fonts: [...new Set(used)] };
}

// ---- comparing ---------------------------------------------------------------------------------------------------

/** Each slide's pictures side by side (app, LibreOffice, LibreOffice with the deck's fonts), and how far each is from the app's. */
async function compare(browser, rows) {
  const page = await browser.page();
  await page.viewport(1960, 420, { scale: 1 });
  const out = [];
  for (const row of rows) {
    const urls = row.pics.map((p) => (p ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` : ''));
    const res = await page.eval(`(async () => {
      const urls = ${JSON.stringify(urls)};
      const load = (u) => new Promise((ok) => { if (!u) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = u; });
      const imgs = await Promise.all(urls.map(load));
      const W = 640, H = Math.round(640 * ${row.h} / 1280);
      const data = imgs.map((i) => { if (!i) return null; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(i, 0, 0, W, H); return g.getImageData(0, 0, W, H).data; });
      const diff = (a, b) => { if (!a || !b) return null; let sum = 0, off = 0; for (let k = 0; k < a.length; k += 4) { const d = (Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2])) / 3; sum += d; if (d > 48) off++; } return { mean: sum / (a.length / 4), off: off / (a.length / 4) }; };
      document.body.style.cssText = 'margin:0;background:#222;font:14px system-ui;color:#ddd';
      document.body.innerHTML = '';
      const labels = ${JSON.stringify(row.labels)};
      imgs.forEach((i, k) => { const f = document.createElement('figure'); f.style.cssText = 'display:inline-block;margin:6px;vertical-align:top'; const cap = document.createElement('figcaption'); cap.textContent = labels[k]; f.appendChild(cap); if (i) { const c = document.createElement('img'); c.src = urls[k]; c.style.cssText = 'width:' + W + 'px;height:' + H + 'px;display:block'; f.appendChild(c); } document.body.appendChild(f); });
      return { lo: diff(data[0], data[1]), fonts: data.length > 2 ? diff(data[0], data[2]) : null, h: H };
    })()`);
    await page.viewport(1960, res.h + 40, { scale: 1 });
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(row.file, Buffer.from(shot.data, 'base64'));
    out.push({ ...row, lo: res.lo, withFonts: res.fonts });
  }
  return out;
}

// ---- PowerPoint files opened in the app -------------------------------------------------------------------------------

/** A .pptx opened in the app as New → Open a PowerPoint file opens it: the page's id and what the import said. */
async function importDeck(file, title) {
  const r = await (await api('POST', '/api/pages/import', { name: path.basename(file), data: fs.readFileSync(file).toString('base64'), title })).json();
  return { id: r.page.id, notes: r.notes ?? [] };
}

/** The app's pictures of a page's slides, as `${prefix}-NN.png` in `dir`. */
async function slidePictures(id, dir, prefix) {
  const pics = unzip(Buffer.from(await (await api('GET', `/api/pages/${id}/export?format=png`)).arrayBuffer()));
  const out = [];
  for (const [name, data] of pics) {
    const f = path.join(dir, `${prefix}-${/(\d+)/.exec(name)[1]}.png`);
    fs.writeFileSync(f, data);
    out.push(f);
  }
  return out.sort();
}

/** What differs between two decks, part by part: each slide's parts matched by kind and place (2 px), their words and sizes. */
function deckDiff(a, b) {
  const out = [];
  const flat = (els, dx = 0, dy = 0) => els.flatMap((e) => (e.type === 'group' ? [{ ...e, x: e.x + dx, y: e.y + dy }, ...flat(e.els, e.x + dx, e.y + dy)] : [{ ...e, x: e.x + dx, y: e.y + dy }]));
  const words = (e) => (e.paras ?? []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');
  if (a.slides.length !== b.slides.length) out.push(`${a.slides.length} slides came back as ${b.slides.length}`);
  a.slides.forEach((s, i) => {
    const t = b.slides[i];
    if (!t) return;
    const left = flat(t.els);
    for (const e of flat(s.els)) {
      const k = left.findIndex((x) => x.type === e.type && Math.abs(x.x - e.x) <= 2 && Math.abs(x.y - e.y) <= 2 && Math.abs(x.w - e.w) <= 2 && Math.abs(x.h - e.h) <= 2);
      if (k < 0) {
        out.push(`slide ${i + 1}: ${e.type}${e.shape ? ` ${e.shape}` : ''} at ${Math.round(e.x)},${Math.round(e.y)} did not come back as it was`);
        continue;
      }
      const m = left.splice(k, 1)[0];
      if (words(e) !== words(m)) out.push(`slide ${i + 1}: words "${words(e).slice(0, 40)}" came back as "${words(m).slice(0, 40)}"`);
      if (e.size && m.size && Math.abs(e.size - m.size) > 0.5) out.push(`slide ${i + 1}: "${words(e).slice(0, 20)}" ${e.size}px came back ${m.size}px`);
    }
    for (const x of left) out.push(`slide ${i + 1}: an extra ${x.type} at ${Math.round(x.x)},${Math.round(x.y)}`);
    for (const k of ['transition', 'notes', 'hidden', 'layout']) if (JSON.stringify(s[k] ?? null) !== JSON.stringify(t[k] ?? null)) out.push(`slide ${i + 1}: its ${k} ${JSON.stringify(s[k] ?? null)} came back as ${JSON.stringify(t[k] ?? null)}`);
    if ((s.anims ?? []).length !== (t.anims ?? []).length) out.push(`slide ${i + 1}: ${(s.anims ?? []).length} animations came back as ${(t.anims ?? []).length}`);
    if ((s.comments ?? []).length !== (t.comments ?? []).filter((c) => !c.resolved).length) out.push(`slide ${i + 1}: comments differ`);
  });
  for (const k of ['ratio', 'footer', 'guides']) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) out.push(`its ${k} ${JSON.stringify(a[k] ?? null)} came back as ${JSON.stringify(b[k] ?? null)}`);
  if (JSON.stringify(a.theme) !== JSON.stringify(b.theme)) out.push(`its theme ${JSON.stringify(a.theme)} came back as ${JSON.stringify(b.theme)}`);
  return out;
}

/**
 * Files opened in the app, beside what they should look like: each sample's own .pptx (beside the app's pictures of the
 * deck it came from), a copy LibreOffice saved itself and other files (beside LibreOffice's pictures of them).
 */
async function imports() {
  const rows = [];
  const report = [];
  const files = opt('files', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (flag('roundtrip'))
    for (const d of samples().filter((x) => !ONLY.length || ONLY.includes(x.name))) {
      const dir = path.join(OUT, d.name);
      if (!fs.existsSync(path.join(dir, 'deck.pptx'))) continue;
      const h = d.model.ratio === '4:3' ? 960 : 720;
      // Its own file again: the deck it was.
      const back = await importDeck(path.join(dir, 'deck.pptx'), `${d.title} (back)`);
      const pics = await slidePictures(back.id, dir, 'back');
      const app = fs
        .readdirSync(dir)
        .filter((f) => /^app-\d+\.png$/.test(f))
        .sort();
      const before = (await (await api('GET', `/api/pages/${fs.readFileSync(path.join(dir, 'page-id.txt'), 'utf8').trim()}`)).json()).model;
      const after = (await (await api('GET', `/api/pages/${back.id}`)).json()).model;
      const diff = deckDiff(before, after);
      report.push({ name: `${d.name} (its own file)`, notes: back.notes, diff });
      app.forEach((f, i) =>
        rows.push({ deck: `${d.name} back`, n: i + 1, h, file: path.join(dir, `back-side-${String(i + 1).padStart(2, '0')}.png`), pics: [path.join(dir, f), pics[i] ?? null], labels: ['The deck', 'Its PowerPoint file opened in the app'] }),
      );
      // LibreOffice's own copy of it (saved through its own format), beside LibreOffice's pictures of that copy.
      const lo = path.join(dir, 'lomade');
      fs.rmSync(lo, { recursive: true, force: true });
      fs.mkdirSync(lo);
      const uid = `${process.getuid()}:${process.getgid()}`;
      const sh =
        'cd /work && soffice -env:UserInstallation=file:///tmp/lo --headless --convert-to odp --outdir /work/lomade /work/deck.pptx >/dev/null 2>&1 && mkdir -p /work/lomade/x && soffice -env:UserInstallation=file:///tmp/lo --headless --convert-to pptx --outdir /work/lomade/x /work/lomade/deck.odp >/dev/null 2>&1 && cp /work/lomade/x/deck.pptx /work/lomade/libreoffice.pptx';
      spawnSync('docker', ['run', '--rm', '--name', `${PREFIX}-${d.name}-lomade`, '--network', 'none', '--user', uid, '-e', 'HOME=/tmp', '-v', `${dir}:/work`, IMAGE, 'sh', '-c', sh], { timeout: 300_000 });
      if (fs.existsSync(path.join(lo, 'libreoffice.pptx'))) {
        const shown = office(lo, 'lo', null, 'libreoffice.pptx');
        const came = await importDeck(path.join(lo, 'libreoffice.pptx'), `${d.title} (LibreOffice)`);
        const got = await slidePictures(came.id, lo, 'app');
        report.push({ name: `${d.name} (saved by LibreOffice)`, notes: came.notes, diff: [] });
        shown.pics.forEach((p, i) =>
          rows.push({ deck: `${d.name} libreoffice`, n: i + 1, h, file: path.join(lo, `side-${String(i + 1).padStart(2, '0')}.png`), pics: [p, got[i] ?? null], labels: ['LibreOffice shows its own file', 'The file opened in the app'] }),
        );
      }
      process.stdout.write(`${d.name}: back ${diff.length ? `with ${diff.length} difference${diff.length === 1 ? '' : 's'}` : 'as it was'}\n`);
    }
  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    const dir = path.join(OUT, 'files', name.replace(/[^\w.-]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(file, path.join(dir, 'deck.pptx'));
    const shown = office(dir, 'lo');
    const came = await importDeck(path.join(dir, 'deck.pptx'), name);
    const got = await slidePictures(came.id, dir, 'app');
    const h = (await (await api('GET', `/api/pages/${came.id}`)).json()).model.ratio === '4:3' ? 960 : 720;
    report.push({ name, notes: came.notes, diff: [] });
    shown.pics.forEach((p, i) => rows.push({ deck: name, n: i + 1, h, file: path.join(dir, `side-${String(i + 1).padStart(2, '0')}.png`), pics: [p, got[i] ?? null], labels: ['LibreOffice shows the file', 'The file opened in the app'] }));
    process.stdout.write(`${name}: ${got.length} slides opened; ${came.notes.join(' ')}\n`);
  }
  const browser = await Browser.launch();
  let done = [];
  try {
    done = await compare(browser, rows);
  } finally {
    await browser.close();
  }
  done.sort((a, b) => (b.lo?.mean ?? 0) - (a.lo?.mean ?? 0));
  const pct = (v) => (v ? `${(v.off * 100).toFixed(1)}% off, mean ${v.mean.toFixed(1)}` : '—');
  const esc = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
  const html = `<!doctype html><meta charset="utf-8"><title>PowerPoint files opened</title><style>body{font:14px system-ui;background:#111;color:#ddd;margin:20px}img{max-width:100%;display:block;margin:6px 0 24px}li{margin:2px 0}</style><h1>PowerPoint files opened in the app</h1>${report.map((r) => `<h3>${esc(r.name)}</h3><ul>${[...r.notes.map((n) => `note: ${n}`), ...r.diff].map((x) => `<li>${esc(x)}</li>`).join('') || '<li>as it was</li>'}</ul>`).join('')}<h2>Slides, most different first</h2>${done.map((s) => `<h3>${esc(s.deck)} ${s.n}: ${pct(s.lo)}</h3><img src="${path.relative(OUT, s.file)}">`).join('')}`;
  fs.writeFileSync(path.join(OUT, 'import.html'), html);
  console.log('Most different:');
  for (const s of done.slice(0, 12)) console.log(`  ${s.deck} ${s.n}: ${pct(s.lo)}`);
  for (const r of report)
    if (r.diff.length)
      console.log(
        `${r.name}:\n${r.diff
          .slice(0, 30)
          .map((x) => `  ${x}`)
          .join('\n')}`,
      );
  console.log(`\nReport: ${path.join(OUT, 'import.html')}`);
}

// ---- the run -------------------------------------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const decks = samples().filter((d) => !ONLY.length || ONLY.includes(d.name));
  if (!DECKS) await signIn();
  const report = [];
  for (const d of decks) {
    const dir = DECKS ? path.join(path.resolve(DECKS), d.name) : path.join(OUT, d.name);
    fs.mkdirSync(dir, { recursive: true });
    if (!DECKS) {
      process.stdout.write(`${d.name}: exporting… `);
      await exportDeck(d, dir);
    }
    const v = validate(path.join(dir, 'deck.pptx'), dir);
    process.stdout.write(`${v.parts} parts, ${v.errors.length} schema error${v.errors.length === 1 ? '' : 's'}`);
    const entry = { name: d.name, dir, schema: v.errors, slides: [] };
    if (!flag('no-office')) {
      const plain = office(dir, 'lo');
      // The fonts the file carries, installed: what PowerPoint shows once it has loaded them.
      const fonts = path.join(dir, 'embedded-fonts');
      fs.rmSync(fonts, { recursive: true, force: true });
      fs.mkdirSync(fonts);
      let n = 0;
      for (const [name, data] of unzip(fs.readFileSync(path.join(dir, 'deck.pptx'))))
        if (name.startsWith('ppt/fonts/')) {
          const ttf = eotFont(data);
          if (ttf) (fs.writeFileSync(path.join(fonts, `${path.basename(name, path.extname(name))}.ttf`), ttf), n++);
        }
      const withFonts = n ? office(dir, 'lo-fonts', fonts) : null;
      const app = fs
        .readdirSync(dir)
        .filter((f) => /^app-\d+\.png$/.test(f))
        .sort();
      const h = d.model.ratio === '4:3' ? 960 : 720;
      entry.fonts = { plain: plain.fonts, embedded: n, withFonts: withFonts?.fonts ?? [] };
      entry.slides = app.map((f, i) => ({
        n: i + 1,
        h,
        file: path.join(dir, `side-${String(i + 1).padStart(2, '0')}.png`),
        pics: [path.join(dir, f), plain.pics[i] ?? null, withFonts?.pics[i] ?? null],
        labels: ['The app', 'LibreOffice (an Office computer’s fonts)', `LibreOffice with the ${n} embedded font file${n === 1 ? '' : 's'} installed`],
      }));
      process.stdout.write(`, ${app.length} slides; LibreOffice used ${plain.fonts.join(', ')}${n ? `; ${n} embedded fonts` : ''}`);
    }
    process.stdout.write('\n');
    for (const e of v.errors.slice(0, 40)) console.log(`  ${e}`);
    report.push(entry);
  }
  if (!flag('no-office')) {
    const browser = await Browser.launch();
    try {
      for (const r of report) r.slides = await compare(browser, r.slides);
    } finally {
      await browser.close();
    }
  }
  const all = report.flatMap((r) => r.slides.map((s) => ({ deck: r.name, ...s })));
  all.sort((a, b) => (b.withFonts?.mean ?? b.lo?.mean ?? 0) - (a.withFonts?.mean ?? a.lo?.mean ?? 0));
  const pct = (v) => (v ? `${(v.off * 100).toFixed(1)}% off, mean ${v.mean.toFixed(1)}` : '—');
  const html = `<!doctype html><meta charset="utf-8"><title>PowerPoint check</title><style>body{font:14px system-ui;background:#111;color:#ddd;margin:20px}img{max-width:100%;display:block;margin:6px 0 24px}code{color:#9cf}</style><h1>PowerPoint check</h1>${report.map((r) => `<p><b>${r.name}</b>: ${r.schema.length ? `<span style="color:#f88">${r.schema.length} schema errors</span>` : 'valid against the schemas'}${r.fonts ? `; LibreOffice used <code>${r.fonts.plain.join(', ')}</code>; ${r.fonts.embedded} embedded font files` : ''}</p>`).join('')}<h2>Slides, most different first</h2>${all.map((s) => `<h3>${s.deck} ${s.n}: plain ${pct(s.lo)} · with fonts ${pct(s.withFonts)}</h3><img src="${path.relative(OUT, s.file)}">`).join('')}`;
  fs.writeFileSync(path.join(OUT, 'report.html'), html);
  fs.writeFileSync(
    path.join(OUT, 'report.json'),
    JSON.stringify(
      report.map((r) => ({ ...r, slides: r.slides.map(({ pics: _p, ...s }) => s) })),
      null,
      1,
    ),
  );
  console.log(`\n${report.reduce((a, r) => a + r.schema.length, 0)} schema errors in all. Worst slides:`);
  for (const s of all.slice(0, 12)) console.log(`  ${s.deck} ${s.n}: plain ${pct(s.lo)} · with fonts ${pct(s.withFonts)}`);
  console.log(`\nReport: ${path.join(OUT, 'report.html')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (flag('roundtrip') || opt('files', '')) {
    fs.mkdirSync(OUT, { recursive: true });
    await signIn();
    // The samples' files first, unless they were exported here before.
    if (flag('roundtrip') && !flag('reuse')) await main();
    await imports();
  } else await main();
}

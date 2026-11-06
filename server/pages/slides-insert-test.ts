// Script tests for what the slides gain for inserting and organising: pictures cut to a shape and in frames (checked,
// drawn as outlines that stay in their boxes, written to PowerPoint as their geometry and as shapes round them, read
// back), a logo on every slide (checked, kept with its picture, in its corner above the footer, in PowerPoint on each
// slide), a video's end (PowerPoint's trim, from the film's own length, and back), slides of another deck (fresh ids,
// connectors and animations on their copies, pictures kept, their look or this deck's, another shape, PowerPoint
// compatible), a chart from a spreadsheet of the Library (its tables, a range read with its formulas, save_slides with a
// source), and My themes (saved, renamed, deleted, their logos kept from the sweep, taken by name by save_slides).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/slides-insert-test.ts
//   DATA_DIR=/tmp/hydor-test-slides-insert node dist/dev/slides-insert-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { Zip } from '../documents/zip.ts';
import { writePng } from '../signatures/png.ts';
import { chartSource, deckSources, deckText, everyEl, mapSources, normalizeDeck, PICTURE_MASKS, type ChartEl, type Deck, type ImageEl, type VideoEl } from '../../shared/slides.ts';
import { pictureFramePlan, pictureMaskPath } from '../../shared/slides-runtime.ts';
import { reuseSlides, sameLook } from '../../shared/slides-reuse.ts';
import { chartFromSheet, sheetTables } from '../../shared/slides-sheet.ts';
import { normalizeBook } from '../../shared/sheets.ts';
import { pathCmds, pptxFile, type Picture } from './pptx.ts';
import { deckFromPptx } from './pptx-import.ts';
import { pages } from './index.ts';
import { getAsset, putAsset, sweepAssets } from './assets.ts';
import { myThemeByName, myThemes, myThemesFeature, myThemesNote } from './my-themes.ts';
import { videoSeconds } from './video-length.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-slides-insert-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
pages.routes!(deps);
myThemesFeature.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
  const r = await app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { 'content-type': 'application/json' } });
  return { status: r.statusCode, body: r.json() as Record<string, any> };
};
const modelOf = async (id: string) => (await json('GET', `/api/pages/${id}`)).body.model as Deck;

const png = (w: number, h: number, rgb: [number, number, number] = [30, 140, 220]) => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return writePng({ width: w, height: h, data });
};
const PIC = png(40, 20);
const SHA = putAsset(db, PIC);
const SRC = `naget-asset:${SHA}`;
const picture = (s: string): Picture | null => (s === SRC ? { data: PIC, ext: 'png', w: 40, h: 20 } : null);
const slideXml = (buf: Buffer, n: number) => new Zip(buf).text(`ppt/slides/slide${n}.xml`) ?? '';

// ---- pictures cut to a shape, and in frames ------------------------------------------------------------------------

{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'a', type: 'image', src: SRC, x: 10, y: 10, w: 300, h: 200, mask: 'circle' },
          { id: 'b', type: 'image', src: SRC, x: 10, y: 10, w: 300, h: 200, shape: 'oval' },
          { id: 'c', type: 'image', src: SRC, x: 10, y: 10, w: 300, h: 200, shape: 'rounded' },
          { id: 'd', type: 'image', src: SRC, x: 10, y: 10, w: 300, h: 600, frame: 'iphone', mask: 'star' },
          { id: 'e', type: 'image', src: SRC, x: 10, y: 10, w: 300, h: 200, mask: 'squiggle', frame: 'tv' },
        ],
      },
    ],
  });
  const [a, b, c, dd, e] = d.slides[0].els as ImageEl[];
  ok(a.mask === 'circle' && b.mask === 'ellipse' && c.radius === 32 && !c.mask, 'a shape by its name, "oval" an ellipse, "rounded" its corners');
  ok(dd.frame === 'phone' && !dd.mask, 'a frame by another name ("iphone"), its shape left out inside a frame');
  ok(!e.mask && !e.frame, 'shapes and frames it does not know are left out');
  for (const m of PICTURE_MASKS)
    for (const [w, h] of [
      [300, 200],
      [120, 420],
    ]) {
      const p = pictureMaskPath(m, w, h);
      const cmds = pathCmds(p);
      // Points along the outline (curves' control points may stand outside; the curves keep inside the box).
      const pts: number[][] = [];
      let at = [0, 0];
      for (const k of cmds) {
        if (k[0] === 'M' || k[0] === 'L') at = [k[1], k[2]];
        else if (k[0] === 'C' || k[0] === 'Q') {
          const c = k.slice(1) as number[];
          const [x0, y0] = at;
          for (let t = 0.1; t <= 1.001; t += 0.1) {
            const u = 1 - t;
            pts.push(
              k[0] === 'C'
                ? [u * u * u * x0 + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t * t * t * c[4], u * u * u * y0 + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t * t * t * c[5]]
                : [u * u * x0 + 2 * u * t * c[0] + t * t * c[2], u * u * y0 + 2 * u * t * c[1] + t * t * c[3]],
            );
          }
          at = k[0] === 'C' ? [c[4], c[5]] : [c[2], c[3]];
        }
        pts.push(at);
      }
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      ok(cmds.length > 2 && cmds[0][0] === 'M' && cmds[cmds.length - 1][0] === 'Z' && /^[MLCQZ0-9., -]+$/.test(p), `${m}: a closed outline of M, L, C, Q and Z (${p.slice(0, 40)})`);
      ok(
        Math.min(...xs) >= -0.5 && Math.max(...xs) <= w + 0.5 && Math.min(...ys) >= -0.5 && Math.max(...ys) <= h + 0.5,
        `${m} ${w}×${h}: in its box (${Math.min(...xs).toFixed(1)}…${Math.max(...xs).toFixed(1)} × ${Math.min(...ys).toFixed(1)}…${Math.max(...ys).toFixed(1)})`,
      );
    }
  ok(pictureMaskPath('circle', 300, 200).startsWith('M50,100'), 'a circle is the box’s middle, as wide as its shorter side');
  for (const f of ['polaroid', 'phone', 'laptop', 'browser'])
    for (const dark of [false, true]) {
      const plan = pictureFramePlan(f, 600, 400, dark);
      const sc = plan.screen;
      ok(sc.x >= 0 && sc.y >= 0 && sc.x + sc.w <= 600.01 && sc.y + sc.h <= 400.01 && sc.w > 300 && sc.h > 200, `${f}: its screen inside the frame, most of it`);
      ok(plan.under.length > 0 && plan.under.every((p) => /^#[0-9a-f]{6}$/i.test(p.fill)), `${f}: its pieces in colours of their own`);
    }
  ok(pictureFramePlan('phone', 300, 600, true).under[0].fill !== pictureFramePlan('phone', 300, 600, false).under[0].fill, 'a phone’s edge is lighter on a dark slide');

  // PowerPoint: the geometry, the frame's shapes round the picture, a flipped shape mirrored to come back as it shows.
  const deck = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'a', type: 'image', src: SRC, x: 0, y: 0, w: 300, h: 300, mask: 'circle' },
          { id: 'b', type: 'image', src: SRC, x: 0, y: 0, w: 300, h: 200, mask: 'heart', flipV: true },
          { id: 'c', type: 'image', src: SRC, x: 400, y: 100, w: 300, h: 560, frame: 'phone', alt: 'The app on a phone' },
          { id: 'f', type: 'image', src: SRC, x: 0, y: 0, w: 640, h: 420, frame: 'browser' },
        ],
        anims: [{ el: 'c', fx: 'fade' }],
      },
    ],
  });
  const buf = pptxFile(deck, { title: 'Shapes', picture });
  const xml = slideXml(buf, 1);
  ok(/<p:pic>.*?<a:prstGeom prst="ellipse">/.test(xml), 'a circle in a square box: PowerPoint’s own ellipse');
  ok(/<a:custGeom>.*?<a:cubicBezTo>/.test(xml), 'a heart: its outline as the picture’s own geometry');
  const heart = /name="Picture \d+"[^>]*\/?>(?:(?!<\/p:pic>).)*?<a:custGeom>(.*?)<\/a:custGeom>/.exec(xml)?.[1] ?? '';
  ok(/<a:moveTo><a:pt x="1428750" y="1428750"\/>/.test(heart), `flipped down, the heart’s outline is mirrored first (${heart.slice(0, 140)})`);
  ok(/<p:grpSp><p:nvGrpSpPr><p:cNvPr id="(\d+)" name="Picture \d+" descr="The app on a phone"\/>.*?name="Frame".*?name="Screen".*?<\/p:grpSp>/.test(xml), 'a phone: a group of its frame’s shapes and the picture in its screen');
  const gid = /<p:grpSp><p:nvGrpSpPr><p:cNvPr id="(\d+)" name="Picture \d+" descr="The app on a phone"/.exec(xml)?.[1];
  ok(!!gid && xml.includes(`<p:spTgt spid="${gid}">`), 'its animation moves the whole group');
  ok(/name="Screen".*?<a:custGeom>.*?<a:quadBezTo>/.test(xml.slice(xml.lastIndexOf('<p:grpSp>'))), 'a browser window’s page has only its bottom corners rounded');
  const back = normalizeDeck((await deckFromPptx(buf)).model);
  const pics = everyEl(back.slides[0].els).filter((e): e is ImageEl => e.type === 'image');
  ok(pics[0]?.mask === 'circle', 'read back: a picture cut to an ellipse in a square box is a circle');
  ok(
    back.slides[0].els.some((e) => e.type === 'group' && e.els.some((x) => x.type === 'image')),
    'read back: a framed picture is a group of its parts, each to change',
  );
}

// ---- the logo --------------------------------------------------------------------------------------------------

{
  const d = normalizeDeck({
    logo: { src: SRC, corner: 'bottom-left', width: 100, skipTitle: true },
    footer: { num: true },
    slides: [
      { layout: 'title', title: 'Hi' },
      { layout: 'content', title: 'Two' },
    ],
  });
  ok(d.logo?.at === 'bl' && d.logo.w === 100 && d.logo.h === 50 && d.logo.skipTitle, `a logo: its corner by name, its height from its width (${JSON.stringify(d.logo)})`);
  ok(normalizeDeck({ logo: { src: 'javascript:alert(1)' }, slides: [{}] }).logo === undefined, 'a logo is a picture or nothing');
  ok(deckSources(d).includes(SRC) && mapSources(d, () => 'x').logo?.src === 'x', 'its picture is one of the deck’s (kept, put inside its page, given to PowerPoint)');
  ok(normalizeDeck(JSON.parse(deckText(d))).logo?.src === SRC, 'kept in the deck’s text');
  const buf = pptxFile(d, { title: 'Logo', picture });
  ok(!slideXml(buf, 1).includes('name="Logo"'), 'not on the title slide when it says so');
  const s2 = slideXml(buf, 2);
  // 100×50 box, a 2:1 picture: 100×50 at the left, its foot 60 above the bottom (the footer's band shows there): at 610.
  ok(/name="Logo".*?<a:off x="304800" y="5810250"\/><a:ext cx="952500" cy="476250"\/>/.test(s2), `on the next one, in its corner above the footer (${/name="Logo".*?<\/p:spPr>/.exec(s2)?.[0].slice(0, 300)})`);
}

// ---- a video's end -----------------------------------------------------------------------------------------------

{
  // A film's header alone: its movie box says 30 s (a time scale of 1000, 30000 ticks).
  const box = (type: string, body: Buffer) => Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from(type, 'latin1'), body]).fill(0, 0, 0);
  const sized = (b: Buffer) => {
    b.writeUInt32BE(b.length, 0);
    return b;
  };
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(30000, 16);
  const mp4 = Buffer.concat([sized(box('ftyp', Buffer.from('isom\0\0\0\0isom', 'latin1'))), sized(box('mdat', Buffer.alloc(64))), sized(box('moov', sized(box('mvhd', mvhd))))]);
  ok(videoSeconds(mp4) === 30, `an MP4's length from its movie header (${videoSeconds(mp4)})`);
  // A WebM's: EBML, a segment, its info with a timecode scale of a million and a duration of 12500 (a float).
  const dur = Buffer.alloc(8);
  dur.writeDoubleBE(12500);
  const info = Buffer.concat([Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]), Buffer.from([0x44, 0x89, 0x88]), dur]);
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]), Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | info.length]), info]);
  ok(videoSeconds(webm) === 12.5, `a WebM's from its segment's info (${videoSeconds(webm)})`);
  ok(videoSeconds(Buffer.from('not a film at all, no')) === null, 'no length where the bytes say none');
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'v', type: 'video', src: 'naget-video:0123456789abcdef0123', start: 2, end: 20.25 },
          { id: 'w', type: 'video', src: 'https://youtu.be/dQw4w9WgXcQ', start: 30, end: 10 },
        ],
      },
    ],
  });
  const [v, w] = d.slides[0].els as VideoEl[];
  ok(v.end === 20.3 && w.end === undefined, 'an end after its start (a tenth of a second), else none');
  const buf = pptxFile(d, { title: 'Trim', picture, video: () => ({ data: mp4, ext: 'mp4', mime: 'video/mp4' }) });
  ok(slideXml(buf, 1).includes('<p14:trim st="2000" end="9700"/>'), 'PowerPoint’s trim: 2 s off its start, 9.7 s off its end');
  const back = (await deckFromPptx(buf, db)).model as { slides: { els: Record<string, unknown>[] }[] };
  const got = back.slides[0].els.find((e) => e.type === 'video');
  ok(got?.start === 2 && got?.end === 20.3, `read back: where it starts and stops (${JSON.stringify({ start: got?.start, end: got?.end })})`);
}

// ---- slides of another deck -----------------------------------------------------------------------------------------

{
  const other = normalizeDeck({
    ratio: '4:3',
    theme: 'midnight',
    slides: [
      {
        id: 's1',
        els: [
          { id: 'p', type: 'image', src: SRC, x: 0, y: 0, w: 400, h: 300 },
          { id: 't', type: 'text', x: 0, y: 400, w: 400, h: 80, text: 'Hello' },
          { id: 'l', type: 'line', from: 'p', to: 't', x: 0, y: 0, w: 1, h: 1 },
        ],
        anims: [
          { el: 't', fx: 'fade' },
          { el: 'p', fx: 'pop', on: 'tap', trigger: 't' },
        ],
        notes: 'Say hello',
        comments: [{ text: 'A thought', by: 'user' }],
      },
      {
        id: 's2',
        transition: 'morph',
        els: [
          { id: 'q', key: 'p', type: 'image', src: SRC, x: 100, y: 100, w: 200, h: 150 },
          { id: 'z', type: 'quiz', question: '2+2?', choices: ['3', '*4'] },
        ],
      },
    ],
  });
  const here = normalizeDeck({ theme: 'paper', slides: [{ id: 's1', els: [{ id: 'p', type: 'text', x: 0, y: 0, w: 10, h: 10, text: 'mine' }] }] });
  const got = reuseSlides(other, [0, 1], here, { keepLook: true });
  const ids = got.flatMap((s) => [s.id, ...everyEl(s.els).map((e) => e.id), ...(s.anims ?? []).map((a) => a.id)]);
  const mine = new Set(here.slides.flatMap((s) => [s.id, ...everyEl(s.els).map((e) => e.id)]));
  ok(got.length === 2 && new Set(ids).size === ids.length && !ids.some((x) => mine.has(x) || ['p', 't', 'l', 'q', 'z', 's2'].includes(x)), 'fresh ids for slides, parts and animations, none this deck has');
  const [a, b] = got;
  const pic = a.els.find((e) => e.type === 'image') as ImageEl;
  const txt = a.els.find((e) => e.type === 'text')!;
  const ln = a.els.find((e) => e.type === 'line');
  ok(pic.src === SRC && !!getAsset(db, SHA), 'its pictures come along as they are');
  ok(ln?.type === 'line' && ln.from?.el === pic.id && ln.to?.el === txt.id, 'a connector stays stuck to its parts’ copies');
  ok(a.anims?.[0].el === txt.id && a.anims?.[1].el === pic.id && a.anims?.[1].trigger === txt.id, 'animations and taps on the copies');
  ok(b.els[0].key === pic.id, 'Morph still matches a part to the one of the slide before');
  ok(a.notes === 'Say hello' && !a.comments, 'notes come, comments stay behind');
  ok(!!a.theme && sameLook(a.theme, other.theme) && !sameLook(a.theme, here.theme), 'keeping their look: their deck’s theme as their own');
  ok(pic.h === 225 && pic.y === 0 && txt.y === 300, 'from 4:3 into 16:9: their parts set to its height');
  const plain = reuseSlides(other, [0], here, { keepLook: false });
  ok(!plain[0].theme, 'or taking this deck’s theme');
  const same = reuseSlides(normalizeDeck({ theme: 'paper', slides: [{}] }), [0], here, { keepLook: true });
  ok(!same[0].theme, 'no theme of its own when the looks are the same');
  const ppt = reuseSlides(other, [1], { ...here, format: 'pptx' }, { keepLook: true });
  ok(!everyEl(ppt[0].els).some((e) => e.type === 'quiz') && everyEl(ppt[0].els).some((e) => e.type === 'shape'), 'into a PowerPoint compatible deck, a quiz becomes text boxes');
  // Drawn and written in their own theme.
  const merged = { ...here, slides: [...here.slides, ...got] };
  const xml = slideXml(pptxFile(merged, { title: 'Reused', picture }), 2);
  const midnightText = normalizeDeck({ theme: 'midnight', slides: [{}] })
    .theme.fg.replace('#', '')
    .toUpperCase();
  ok(xml.includes(`<a:srgbClr val="${midnightText}"`), 'PowerPoint writes a slide with its own theme in its colours');
  ok(normalizeDeck(JSON.parse(deckText(merged))).slides[1].theme?.bg === a.theme!.bg, 'its theme kept in the deck’s text');
}

// ---- a chart from a spreadsheet ----------------------------------------------------------------------------------------

{
  const book = normalizeBook({
    sheets: [
      {
        name: 'Sales',
        cells: {
          A1: { v: 'Region' },
          B1: { v: 'Q1' },
          C1: { v: 'Q2' },
          A2: { v: 'North' },
          B2: { v: 10 },
          C2: { v: 12 },
          A3: { v: 'South' },
          B3: { v: 7 },
          C3: { f: 'B3*2' },
          A6: { v: 'Note' },
          E8: { v: 'Year' },
          F8: { v: 'Total' },
          E9: { v: 2025 },
          F9: { v: 1 },
          E10: { v: 2026 },
          F10: { v: 2 },
        },
      },
    ],
  });
  const tables = sheetTables(book);
  ok(tables.length === 2 && tables[0].range === 'A1:C3' && tables[0].names.join(',') === 'Region,Q1,Q2' && tables[1].range === 'E8:F10', `its tables, largest first, with their names (${JSON.stringify(tables)})`);
  const r = chartFromSheet(book, { sheet: 'sales', range: 'A1:C3' });
  ok(
    'labels' in r && r.labels.join() === 'North,South' && r.series.map((s) => `${s.name}:${s.values.join('/')}`).join() === 'Q1:10/7,Q2:12/14',
    `labels down the first column, series' names along the first row, formulas worked out (${JSON.stringify(r)})`,
  );
  const rows = chartFromSheet(book, { sheet: 'Sales', range: 'A1:C3', by: 'rows' });
  ok('labels' in rows && rows.labels.join() === 'Q1,Q2' && rows.series[0].name === 'North', 'or along the rows');
  const none = chartFromSheet(book, { sheet: 'Costs', range: 'A1:B2' });
  ok('error' in none && none.error.includes('Costs'), 'a sheet that is not there is said');
  ok(
    chartSource({ page: 'abc123', sheet: 'S', range: '$a$1:$c$3' })?.range === 'A1:C3' && !chartSource({ page: '../x', sheet: 'S', range: 'A1' }) && !chartSource({ page: 'abc', sheet: 'S', range: 'A1:B2;drop' }),
    'a source is a page’s id and a range of cells, checked',
  );

  const made = await json('POST', '/api/pages', { title: 'Sales 2026', kind: 'sheet', model: book });
  const sheetId = made.body.page?.id as string;
  ok(made.status === 200 && !!sheetId, `a spreadsheet in the Library (${made.status})`);
  const saved = await run('save_slides', {
    title: 'From the sheet',
    slides: [{ els: [{ id: 'c', type: 'chart', kind: 'line', source: { page: sheetId, sheet: 'Sales', range: 'A1:C3' } }] }, { els: [{ id: 'd', type: 'chart', source: { page: 'ffffffffff', sheet: 'Sales', range: 'A1:C3' } }] }],
  });
  const deck = await modelOf(idOf(saved.text));
  const c = deck.slides[0].els[0] as ChartEl;
  ok(c.labels.join() === 'North,South' && c.series.length === 2 && c.source?.title === 'Sales 2026' && !!c.source.at, `save_slides reads a chart's numbers from its source (${JSON.stringify(c).slice(0, 240)})`);
  ok(/not a spreadsheet of the Library/.test(saved.text ?? ''), 'and says when a source is not one');
}

// ---- my themes ------------------------------------------------------------------------------------------------------

{
  const logoPng = png(300, 100, [200, 30, 30]);
  const saved = await json('POST', '/api/slides/themes', {
    name: '  Acme  brand ',
    theme: { id: 'ocean', accent: '#e11d48', font: 'Inter', headFont: 'Lora' },
    logo: { src: `data:image/png;base64,${logoPng.toString('base64')}`, at: 'br', w: 150, h: 50 },
  });
  const t = saved.body.theme as { id: string; name: string; theme: { accent: string; headFont: string; id?: string }; logo?: { src: string } };
  ok(saved.status === 200 && t.name === 'Acme brand' && t.theme.accent === '#e11d48' && t.theme.headFont === 'Lora' && !t.theme.id, `saved, its name tidied (${JSON.stringify(saved.body).slice(0, 200)})`);
  ok(/^naget-asset:[a-f0-9]{40}$/.test(t.logo?.src ?? ''), 'its logo kept as the app keeps pictures');
  const logoSha = t.logo!.src.slice('naget-asset:'.length);
  db.prepare('update page_assets set created_at = 0 where sha = ?').run(logoSha);
  sweepAssets(db);
  ok(!!getAsset(db, logoSha), 'a theme’s logo is never swept while the theme is kept');
  const again = await json('POST', '/api/slides/themes', { name: 'acme BRAND', theme: { accent: '#111111', font: 'Inter', headFont: 'Lora' } });
  ok(again.body.theme.id === t.id && myThemes(db).length === 1 && again.body.theme.theme.accent === '#111111' && !again.body.theme.logo, 'saved again under its name: over the one there');
  ok((await json('POST', '/api/slides/themes', { name: 'Ocean', theme: {} })).status === 400, 'a ready-made theme’s name is refused');
  const gone = await json('PATCH', `/api/slides/themes/${t.id}`, { logo: { src: t.logo!.src } });
  ok(gone.status === 400 && /no longer kept/.test(String(gone.body.error)), 'a logo whose picture went (swept once no theme held it) is asked for again');
  const renamed = await json('PATCH', `/api/slides/themes/${t.id}`, { name: 'Acme', logo: { src: `data:image/png;base64,${logoPng.toString('base64')}`, at: 'tr', w: 120 } });
  ok(renamed.status === 200 && renamed.body.theme.name === 'Acme' && renamed.body.theme.logo?.at === 'tr', 'renamed, a logo again');
  ok(myThemeByName(db, 'ACME')?.id === t.id && !myThemeByName(db, 'paper'), 'found by its name in any case; a preset’s name is the preset');
  ok(/“Acme” \(Lora and Inter, accent #111111, with a logo on every slide\)/.test(myThemesNote(db) ?? ''), `agents hear of it when they start (${myThemesNote(db)})`);
  const r = await run('save_slides', { title: 'Branded', theme: 'acme', slides: [{ layout: 'title', title: 'Hi' }] });
  const deck = await modelOf(idOf(r.text));
  ok(deck.theme.accent === '#111111' && deck.theme.headFont === 'Lora' && deck.logo?.src === renamed.body.theme.logo.src, `save_slides takes a theme by its name, its logo with it (${JSON.stringify({ theme: deck.theme.accent, logo: deck.logo })})`);
  ok(deck.logo!.w === 120 && deck.logo!.h === 40, 'the logo takes its picture’s shape (3:1)');
  const r2 = await run('save_slides', { id: idOf(r.text), title: 'Branded', change: [{ slide: 1, layout: 'title', title: 'Hello' }] });
  ok((await modelOf(idOf(r2.text))).logo?.src === renamed.body.theme.logo.src, 'changing a slide keeps the logo');
  const r3 = await run('save_slides', { id: idOf(r.text), title: 'Branded', logo: null, slides: [{ layout: 'title', title: 'Hello' }] });
  ok(!(await modelOf(idOf(r3.text))).logo, 'logo: null takes it off');
  const del = await json('DELETE', `/api/slides/themes/${t.id}`);
  ok(del.status === 200 && !myThemes(db).length && !db.prepare("select 1 from page_asset_refs where page_id like 'my-theme:%'").get(), 'deleted, its logo no longer held by it');
}

await app.close();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

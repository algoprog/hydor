// Script tests for the picture editor's recipe and saves, and edit_image: a recipe checked and kept within its limits
// (turns, flips, crops, adjustments, filters, marks, sizes), coordinates put in the upright frame as the editor and the
// agents' tool both take them, a recipe turned and flipped and back again, the look worked out pixel by pixel (a filter,
// an adjustment, a vignette, an area hidden), a picture turned and cropped to the exact pixel on the server, the save
// route keeping a picture for a deck, over a Library item and beside it, over a file and beside it (and refusing the
// app's own files and the wrong kind), and edit_image with ffmpeg here (a crop, a resize, an adjustment, words, an
// area blurred, a turn, a picture of a deck).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/mediaedit/mediaedit-test.ts
//   DATA_DIR=/tmp/hydor-test-mediaedit node dist/dev/mediaedit-test.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { applyLook, boxToUpright, cropOfShape, flipRecipe, hideArea, isPlain, LIMITS, normalizeRecipe, outputSize, straightenZoom, toUpright, turnRecipe, uprightMap, apply as applyMap, type ImageRecipe, type Mark } from '../../shared/mediaedit.ts';
import { config } from '../config.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { ffmpegBin } from '../media/frames.ts';
import { media } from '../media/index.ts';
import { getMedia, listMedia } from '../media/store.ts';
import { getAsset, initAssets, putAsset } from '../pages/assets.ts';
import { readPng, writePng } from '../signatures/png.ts';
import { decode, encode, geometry, render } from './image.ts';
import { mediaEdit } from './index.ts';

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
const throws = (f: () => unknown, what: string) => {
  try {
    f();
    ok(false, what);
  } catch {
    ok(true, what);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-mediaedit-test-')));
const ff = await ffmpegBin();
if (!ff) console.log('(no ffmpeg here: JPEGs, words and edit_image’s other kinds of file are not tested)');

/** A picture of four colours, a quarter each: red top left, green top right, blue bottom left, white bottom right. */
function quarters(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const top = y < h / 2;
      const left = x < w / 2;
      const c = top && left ? [255, 0, 0] : top ? [0, 255, 0] : left ? [0, 0, 255] : [255, 255, 255];
      px.set([...c, 255], i);
    }
  return px;
}
const at = (p: { w: number; px: Uint8ClampedArray }, x: number, y: number) => [...p.px.subarray((y * p.w + x) * 4, (y * p.w + x) * 4 + 4)];
const near = (a: number[], b: number[], d = 6) => a.every((v, i) => Math.abs(v - b[i]) <= d);
const mean = (px: Uint8ClampedArray, ch = 0) => {
  let s = 0;
  for (let i = ch; i < px.length; i += 4) s += px[i];
  return s / (px.length / 4);
};
/** How sharply each pixel differs from the next (squared, so an edge spread wide counts for little): the fine detail a blur takes away. */
const detail = (px: Uint8ClampedArray, w: number) => {
  let s = 0;
  let n = 0;
  for (let i = 0; i + 4 < px.length; i += 4) {
    if ((i / 4) % w === w - 1) continue;
    s += (px[i] - px[i + 4]) ** 2 + (px[i + 1] - px[i + 5]) ** 2;
    n++;
  }
  return s / n;
};
const spread = (px: Uint8ClampedArray) => {
  const m = mean(px);
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += (px[i] - m) ** 2;
  return Math.sqrt(s / (px.length / 4));
};

// ---- a recipe checked ---------------------------------------------------------------------------------------------
{
  ok(normalizeRecipe({ rotate: -90 }, 100, 50).rotate === 270, 'a turn the other way is three quarter turns');
  ok(normalizeRecipe({ rotate: 450 }, 100, 50).rotate === 90, 'a turn past a whole one comes round');
  ok(normalizeRecipe({ rotate: 0 }, 100, 50).rotate === undefined, 'no turn is left out');
  ok(normalizeRecipe({ straighten: 80 }, 100, 50).straighten === 45, 'straightening stops at 45°');
  const c = normalizeRecipe({ crop: { x: -20, y: 10, w: 500, h: 20 } }, 100, 50).crop;
  ok(c && c.x === 0 && c.y === 10 && c.w === 100 && c.h === 20, 'a crop is kept within the picture');
  ok(normalizeRecipe({ crop: { x: 0, y: 0, w: 100, h: 50 } }, 100, 50).crop === undefined, 'a crop of the whole picture is left out');
  const tc = normalizeRecipe({ rotate: 90, crop: { x: 0, y: 0, w: 50, h: 100 } }, 100, 50);
  ok(tc.crop === undefined, 'a crop is in the turned picture’s frame (a tall one, turned)');
  const a = normalizeRecipe({ adjust: { brightness: 250, contrast: 0, sharpness: -40, nonsense: 5 } }, 100, 50).adjust as Record<string, number>;
  ok(a.brightness === 100 && !('contrast' in a) && !('sharpness' in a) && !('nonsense' in a), 'adjustments are kept within their ranges, nothing unknown or at 0');
  ok(normalizeRecipe({ filter: { id: 'nope' } }, 10, 10).filter === undefined, 'an unknown filter is left out');
  ok(normalizeRecipe({ filter: { id: 'mono', strength: 0 } }, 10, 10).filter === undefined, 'a filter at no strength is left out');
  ok(JSON.stringify(normalizeRecipe({ filter: { id: 'sepia', strength: 140 } }, 10, 10).filter) === '{"id":"sepia"}', 'a filter at full strength says no more');
  const marks = normalizeRecipe(
    {
      marks: [
        { type: 'arrow', x1: 1, y1: 2, x2: 30, y2: 40, color: 'blue' },
        { type: 'rect', x: 50, y: 40, w: -20, h: -10 },
        { type: 'text', x: 5, y: 5, text: '   ' },
        { type: 'text', x: 5, y: 5, text: 'x'.repeat(900), color: 'not a colour' },
        { type: 'pen', pts: [1, 2, 'x', 4, 5, 6] },
        { type: 'script', x: 1 },
        null,
      ],
    },
    100,
    50,
  ).marks as Mark[];
  ok(marks.length === 4, 'marks that are not marks (empty words, unknown kinds) are left out');
  ok(marks[0].type === 'arrow' && marks[0].color === '#3b82f6' && marks[0].width >= 1, 'a colour by its name, and a width worked out from the picture');
  ok(marks[1].type === 'rect' && marks[1].x === 30 && marks[1].y === 30 && marks[1].w === 20 && marks[1].h === 10, 'a box drawn backwards is the same box');
  ok(marks[2].type === 'text' && marks[2].text.length === LIMITS.text && marks[2].color === '#ffffff', 'words are cut to their limit, a colour that is not one replaced');
  ok(marks[3].type === 'pen' && marks[3].pts.length === 4, 'a pen’s points that are not numbers are left out');
  ok(normalizeRecipe({ marks: Array.from({ length: 400 }, () => ({ type: 'line', x1: 0, y1: 0, x2: 1, y2: 1 })) }, 10, 10).marks!.length === LIMITS.marks, 'marks stop at their limit');
  const rs = normalizeRecipe({ crop: { x: 0, y: 0, w: 60, h: 30 }, resize: { w: 30 } }, 100, 50);
  ok(rs.resize?.w === 30 && rs.resize.h === 15, 'a size given by its width keeps the shape');
  ok(normalizeRecipe({ resize: { w: 100, h: 50 } }, 100, 50).resize === undefined, 'a size that is the picture’s own is left out');
  throws(() => normalizeRecipe({ resize: { w: 9000, h: 9000 } }, 100, 50), 'a size past the limit is refused, in words');
  ok(normalizeRecipe({ format: 'jpg', quality: 300 }, 10, 10).quality === 100 && normalizeRecipe({ format: 'jpg' }, 10, 10).format === 'jpeg', 'a JPEG by either name, its quality within 1 to 100');
  ok(normalizeRecipe({ format: 'png', quality: 50 }, 10, 10).quality === undefined, 'a PNG has no quality');
  ok(isPlain(normalizeRecipe({ adjust: { brightness: 0 }, marks: [] }, 10, 10)), 'a recipe that changes nothing is plain');
  ok(outputSize(normalizeRecipe({ rotate: 90 }, 100, 50), 100, 50).w === 50, 'a quarter turn swaps the sides');
}

// ---- where things are ---------------------------------------------------------------------------------------------
{
  // Turned clockwise, the top left goes to the top right.
  const [x, y] = toUpright(0, 0, 100, 50, 90);
  ok(x === 50 && y === 0, 'the top left of a picture turned clockwise is at its top right');
  ok(JSON.stringify(toUpright(10, 5, 100, 50, 180)) === '[90,45]', 'turned twice, a point goes to the other corner’s side');
  ok(JSON.stringify(toUpright(10, 5, 100, 50, 270)) === '[5,90]', 'turned the other way');
  ok(JSON.stringify(toUpright(10, 5, 100, 50, 0, true)) === '[90,5]', 'flipped left to right');
  const b = boxToUpright({ x: 10, y: 5, w: 20, h: 10 }, 100, 50, 90);
  ok(b.x === 35 && b.y === 10 && b.w === 10 && b.h === 20, 'a box turned with its picture');
  const m = uprightMap({ rotate: 90 }, 100, 50).map;
  const p = applyMap(m, 0, 0);
  ok(Math.abs(p[0] - 50) < 1e-9 && Math.abs(p[1]) < 1e-9, 'the editor’s map agrees with the agents’ points');
  ok(straightenZoom(160, 90, 0) === 1 && straightenZoom(160, 90, 10) > 1.2, 'straightening zooms in, so no corner is empty');
  const sq = cropOfShape(200, 100, 1);
  ok(sq.w === 100 && sq.h === 100 && sq.x === 50, 'a square crop is the largest in the middle');
  // Four turns, and two flips, come back to where they began, marks and crop with them.
  const r0: ImageRecipe = normalizeRecipe(
    {
      crop: { x: 10, y: 5, w: 40, h: 30 },
      marks: [
        { type: 'arrow', x1: 1, y1: 2, x2: 30, y2: 40 },
        { type: 'rect', x: 5, y: 6, w: 7, h: 8 },
      ],
    },
    100,
    50,
  );
  let r = r0;
  for (let i = 0; i < 4; i++) r = turnRecipe(r, 100, 50, 1);
  ok(JSON.stringify(r) === JSON.stringify(r0), 'four quarter turns come back to the same recipe');
  r = turnRecipe(turnRecipe(r0, 100, 50, 1), 100, 50, -1);
  ok(JSON.stringify(r) === JSON.stringify(r0), 'a turn and a turn back too');
  r = flipRecipe(flipRecipe(r0, 100, 50, 'h'), 100, 50, 'h');
  ok(JSON.stringify(r) === JSON.stringify(r0), 'two flips too');
  const t1 = turnRecipe(r0, 100, 50, 1);
  ok(t1.rotate === 90 && t1.crop!.w === 30 && t1.crop!.h === 40, 'a crop turns with its picture');
}

// ---- the look ------------------------------------------------------------------------------------------------------
{
  const w = 40;
  const h = 30;
  const grad = () => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        px.set([Math.round((x / (w - 1)) * 255), 120, Math.round((y / (h - 1)) * 255), 255], i);
      }
    return px;
  };
  const plain = grad();
  const same = grad();
  applyLook(same, w, h, {});
  ok(
    same.every((v, i) => v === plain[i]),
    'no look leaves every pixel as it was',
  );
  const bright = grad();
  applyLook(bright, w, h, { brightness: 60 });
  ok(mean(bright, 1) > mean(plain, 1) + 10, 'brightness lightens');
  const grey = grad();
  applyLook(grey, w, h, { saturation: -100 });
  ok(
    at({ w, px: grey }, 5, 5)
      .slice(0, 3)
      .every((v, _i, a) => Math.abs(v - a[0]) <= 1),
    'no saturation is grey',
  );
  const mono = grad();
  applyLook(mono, w, h, {}, { id: 'mono' });
  ok(
    at({ w, px: mono }, 30, 20)
      .slice(0, 3)
      .every((v, _i, a) => v === a[0]),
    'black and white is grey',
  );
  const half = grad();
  applyLook(half, w, h, {}, { id: 'mono', strength: 50 });
  const hp = at({ w, px: half }, 30, 5);
  ok(hp[0] !== hp[2], 'at half strength a filter keeps some colour');
  const warm = grad();
  applyLook(warm, w, h, { warmth: 80 });
  ok(mean(warm, 0) > mean(plain, 0) && mean(warm, 2) < mean(plain, 2), 'warmth is more red, less blue');
  const flat = new Uint8ClampedArray(w * h * 4).fill(200);
  applyLook(flat, w, h, { vignette: 80 });
  ok(at({ w, px: flat }, 0, 0)[0] < at({ w, px: flat }, 20, 15)[0] - 40, 'a vignette darkens the corners, not the middle');
  const blurred = grad();
  applyLook(blurred, w, h, { blur: 100 });
  ok(spread(blurred) < spread(plain), 'blur softens');
  const pix = grad();
  hideArea(pix, w, h, { x: 0, y: 0, w: 20, h: 20 }, 'pixelate', 100);
  ok(near(at({ w, px: pix }, 0, 0), at({ w, px: pix }, 2, 2), 0), 'pixelated, a block is one colour');
  ok(
    at({ w, px: pix }, 30, 25).every((v, i) => v === at({ w, px: plain }, 30, 25)[i]),
    'outside the area, nothing changes',
  );
  // Fine detail (a checkerboard of single pixels, as small print is) is gone once blurred.
  const fine = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) fine.set(((i % w) + Math.floor(i / w)) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
  const before = detail(fine, w);
  hideArea(fine, w, h, { x: 0, y: 0, w: 40, h: 30 }, 'blur', 60);
  ok(detail(fine, w) < before * 0.05, 'a blurred area cannot be read');
}

// ---- turned and cropped on the server --------------------------------------------------------------------------------
{
  const src = { w: 8, h: 4, px: quarters(8, 4) };
  const t = geometry(src, normalizeRecipe({ rotate: 90 }, 8, 4));
  ok(t.w === 4 && t.h === 8, 'turned, its sides swap');
  ok(near(at(t, 3, 0), [255, 0, 0, 255], 0) && near(at(t, 0, 0), [0, 0, 255, 255], 0), 'turned clockwise, red goes to the top right and blue to the top left');
  const f = geometry(src, normalizeRecipe({ flipH: true }, 8, 4));
  ok(near(at(f, 0, 0), [0, 255, 0, 255], 0), 'flipped, green is at the top left');
  const c = geometry(src, normalizeRecipe({ crop: { x: 4, y: 2, w: 4, h: 2 } }, 8, 4));
  ok(c.w === 4 && c.h === 2 && c.px.every((v, i) => (i % 4 === 3 ? v === 255 : v === 255)), 'cropped to the white quarter exactly');
  const s = geometry({ w: 64, h: 64, px: quarters(64, 64) }, normalizeRecipe({ straighten: 10 }, 64, 64));
  ok(s.w === 64 && at(s, 0, 0)[3] === 255 && at(s, 63, 63)[3] === 255, 'straightened, the corners are filled');
  // Marks drawn on the server: an arrow's colour where it runs, nothing far from it.
  const blank = { w: 60, h: 40, px: new Uint8ClampedArray(60 * 40 * 4).fill(255) };
  const drawn = render(
    blank,
    normalizeRecipe(
      {
        marks: [
          { type: 'arrow', x1: 5, y1: 20, x2: 55, y2: 20, color: '#ff0000', width: 4 },
          { type: 'rect', x: 2, y: 2, w: 20, h: 10, color: '#0000ff', width: 2 },
        ],
      },
      60,
      40,
    ),
  ).p;
  ok(near(at(drawn, 30, 20), [255, 0, 0, 255], 10), 'an arrow is drawn along its line');
  ok(near(at(drawn, 49, 20), [255, 0, 0, 255], 10) && near(at(drawn, 49, 22), [255, 0, 0, 255], 10) && near(at(drawn, 30, 23), [255, 255, 255, 255], 30), 'and its head at its end, wider than its line');
  ok(near(at(drawn, 30, 35), [255, 255, 255, 255], 0), 'nothing far from it');
  ok(near(at(drawn, 2, 6), [0, 0, 255, 255], 30) && near(at(drawn, 10, 7), [255, 255, 255, 255], 0), 'a box is its outline, its inside as it was');
}

// ---- the save route ------------------------------------------------------------------------------------------------
const db = openDb(path.join(tmp, 'test.db'));
initAssets(db);
const app = Fastify({ bodyLimit: 90 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const events: { t: string; id?: string; data?: any }[] = [];
const deps = {
  app,
  db,
  sessions: { adapterByRun: () => null },
  models: { agentModels: () => [], ensure: async () => null },
  broadcast: (e: { t: string }) => void events.push(e),
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
media.routes!(deps);
mediaEdit.routes!(deps);
await app.ready();
const req = (method: 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const png = (w: number, h: number) => writePng({ width: w, height: h, data: new Uint8Array(quarters(w, h).buffer) }, { alpha: false });
const dataUrl = (b: Buffer, mime = 'image/png') => `data:${mime};base64,${b.toString('base64')}`;
{
  const pic = png(40, 20);
  const r = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { asset: true } });
  const j = r.json();
  ok(r.statusCode === 200 && /^naget-asset:[a-f0-9]+$/.test(j.src) && j.w === 40 && j.h === 20 && j.mime === 'image/png', 'a picture is kept for a deck, its size said');
  ok(!!getAsset(db, j.src.slice('naget-asset:'.length)), 'and the app keeps it');
  ok((await req('POST', '/api/mediaedit/image', { data: 'data:text/plain;base64,aGVsbG8=', to: { asset: true } })).statusCode === 400, 'what is not a picture is refused');
  ok((await req('POST', '/api/mediaedit/image', { data: dataUrl(Buffer.from('not a png')), to: { asset: true } })).statusCode === 415, 'nor bytes that are not one');
  ok((await req('POST', '/api/mediaedit/image', { data: dataUrl(pic) })).statusCode === 400, 'where it goes is asked for');

  // The Library: a new picture, then written over (its place and id kept), then a copy beside it.
  const n = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { as: 'copy', title: 'Harbour at dawn.jpg' } });
  const item = n.json().item;
  ok(n.statusCode === 200 && n.json().media && getMedia(db, n.json().media)?.kind === 'image', 'a new picture is kept in the Library');
  ok(/Harbour at dawn \(edited\)/.test(item.title), 'named after what it was, edited');
  const bigger = png(80, 40);
  events.length = 0;
  const rep = await req('POST', '/api/mediaedit/image', { data: dataUrl(bigger), to: { media: item.id, as: 'replace' } });
  const after = getMedia(db, item.id)!;
  ok(rep.statusCode === 200 && rep.json().replaced && after.width === 80 && after.bytes === bigger.length && fs.readFileSync(after.file).equals(bigger), 'a Library picture is written over, its new size kept');
  ok(after.title === item.title && after.createdAt === item.createdAt, 'its title and place stay');
  ok(after.updatedAt >= item.updatedAt && events.some((e) => e.t === 'feature' && e.id === 'media' && e.data?.item?.id === item.id), 'the pages hear of it');
  const copy = await req('POST', '/api/mediaedit/image', { data: dataUrl(png(30, 30)), to: { media: item.id, as: 'copy' } });
  ok(copy.statusCode === 200 && copy.json().media !== item.id && listMedia(db).length === 2, 'a copy of a Library picture is a new one beside it');
  ok((await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { media: 'ffffffffff', as: 'replace' } })).statusCode === 404, 'a Library picture that is not there is said to be');

  // A file: written over (its old version to the Trash), or a copy beside it.
  const dir = path.join(tmp, 'pictures');
  fs.mkdirSync(dir);
  const file = path.join(dir, 'boat.png');
  fs.writeFileSync(file, pic);
  const over = await req('POST', '/api/mediaedit/image', { data: dataUrl(bigger), to: { file, as: 'replace' } });
  ok(over.statusCode === 200 && over.json().replaced && fs.readFileSync(file).equals(bigger), 'a file is written over');
  const trash = path.join(config.dataDir, 'trash');
  ok(fs.existsSync(trash) && fs.readdirSync(trash).some((f) => f.endsWith('boat.png')), 'its old version is in the Trash');
  const side = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file, as: 'copy' } });
  ok(side.statusCode === 200 && side.json().path === path.join(dir, 'boat (edited).png') && fs.existsSync(side.json().path), 'a copy goes beside it');
  const again = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file, as: 'copy' } });
  ok(again.json().path === path.join(dir, 'boat (edited) copy.png'), 'a second copy takes a name of its own');
  const jpgFile = path.join(dir, 'photo.jpg');
  fs.writeFileSync(jpgFile, pic);
  const wrong = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file: jpgFile, as: 'replace' } });
  ok(wrong.statusCode === 400 && /JPEG/.test(wrong.json().error), 'a JPEG file is not written over with a PNG');
  const own = path.join(config.dataDir, 'mine.png');
  fs.writeFileSync(own, pic);
  ok((await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file: own, as: 'replace' } })).statusCode === 403, 'the app’s own files are not written from here');
  ok((await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file: path.join(dir, 'gone.png'), as: 'replace' } })).statusCode === 404, 'a file that is not there is said to be');
  if (ff) {
    const conv = await req('POST', '/api/mediaedit/image', { data: dataUrl(pic), to: { file: jpgFile, as: 'replace' }, format: 'jpeg', quality: 80 });
    ok(
      conv.statusCode === 200 &&
        conv.json().mime === 'image/jpeg' &&
        fs
          .readFileSync(jpgFile)
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff])),
      'a picture the browser could not make as a JPEG is made one here',
    );
  }
}

// ---- edit_image ----------------------------------------------------------------------------------------------------
{
  const session = path.join(tmp, 'session');
  fs.mkdirSync(session);
  const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: session, deps } as RunCtx;
  const tool = mediaEdit.tools!(ctx).find((t) => t.name === 'edit_image')!;
  ok(!!tool && /quick edits/i.test(tool.description) && /costs nothing/.test(tool.description), 'agents have edit_image, which says what it is for and what it costs');
  const run = async (args: Record<string, unknown>) => {
    try {
      const r = await tool.run(args, ctx);
      return typeof r === 'string' ? { text: r, isError: false } : { text: r.text, isError: !!r.isError };
    } catch (e) {
      return { text: (e as Error).message, isError: true };
    }
  };
  const fileOf = (text: string) => /^(\/\S+\.(?:png|jpe?g|webp)) \((\d+)×(\d+), /m.exec(text);
  // A PNG works without ffmpeg: turned, cropped, made smaller.
  fs.writeFileSync(path.join(session, 'quarters.png'), png(80, 40));
  const t = await run({ path: 'quarters.png', rotate: 90, crop: { x: 0, y: 0, w: 40, h: 20 } });
  const tf = fileOf(t.text);
  ok(!t.isError && tf && tf[2] === '20' && tf[3] === '40', 'a crop of the top left quarter, turned: tall, as the card reads it');
  if (tf) {
    const img = readPng(fs.readFileSync(tf[1]));
    ok(img.data[0] === 255 && img.data[1] === 0 && img.data[2] === 0, 'all red: the crop was of the red quarter, in the picture as given');
    ok(tf[1].startsWith(path.join(session, 'images')), 'the result is in the session’s images/ folder');
  }
  const small = await run({ path: 'quarters.png', resize: { w: 20 } });
  ok(fileOf(small.text)?.[2] === '20' && fileOf(small.text)?.[3] === '10', 'made smaller, it keeps its shape');
  // A picture of a deck.
  const sha = putAsset(db, png(16, 8));
  const k = await run({ path: `naget-asset:${sha}`, flip: 'horizontal' });
  ok(!k.isError && /in place of the old picture/.test(k.text) && k.text.includes(`naget-asset:${sha}`), 'a deck’s picture is edited, and the answer says how to put it in its place');
  ok((await run({ path: 'nope.png' })).isError, 'a picture that is not there is said to be');
  ok((await run({ path: 'quarters.png', filter: 'glitter' })).isError, 'an unknown filter is said to be');
  ok((await run({ path: 'quarters.png', resize: { w: 99999 } })).isError, 'a size past the limit is refused');
  // A Library picture by its id: edited, and put back over it or beside it as the editor's Save and Save a copy do.
  {
    const lib = listMedia(db).find((m) => m.kind === 'image')!;
    const before = listMedia(db).length;
    const over = await run({ library: lib.id, flip: 'horizontal', save_to_library: 'replace' });
    const after = getMedia(db, lib.id)!;
    ok(!over.isError && /in the Library in place of/.test(over.text) && listMedia(db).length === before && after.title === lib.title, `a Library picture is edited and written over, its title kept: ${over.text.split('\n').pop()}`);
    const beside = await run({ library: lib.id, rotate: 90, save_to_library: 'copy' });
    ok(!beside.isError && /as a new picture beside/.test(beside.text) && listMedia(db).length === before + 1, 'or kept beside it as a new one');
    ok((await run({ path: 'quarters.png', save_to_library: 'replace' })).isError, 'save_to_library goes with a Library picture');
  }
  if (ff) {
    // A photo: ffmpeg's test picture as a JPEG.
    const jpg = path.join(session, 'photo.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:duration=1', '-frames:v', '1', '-q:v', '3', jpg]);
    const plainOut = await run({ path: 'photo.jpg', crop: { x: 100, y: 50, w: 300, h: 200 }, name: 'plain' });
    const pf = fileOf(plainOut.text);
    ok(!plainOut.isError && pf && pf[2] === '300' && pf[3] === '200' && /\.jpg$/.test(pf[1]), 'a JPEG cropped stays a JPEG of the crop’s size');
    // A grey photo shows a change of light best.
    const grey = path.join(session, 'grey.jpg');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x707070:size=320x240', '-frames:v', '1', '-q:v', '2', grey]);
    const brighter = await run({ path: 'grey.jpg', adjust: { brightness: 70 }, name: 'bright' });
    const bf = fileOf(brighter.text);
    if (bf) {
      const a = await decode(fs.readFileSync(grey));
      const b = await decode(fs.readFileSync(bf[1]));
      ok(mean(b.px, 1) > mean(a.px, 1) + 25, 'brighter, as asked');
      ok(/brightness \+70/.test(brighter.text), 'the answer says what was done');
    } else ok(false, 'a photo is made brighter');
    const words = await run({ path: 'photo.jpg', text: [{ text: 'Harbour at dawn', place: 'bottom', size: 40 }], format: 'png', name: 'words' });
    const wf = fileOf(words.text);
    const bare = await run({ path: 'photo.jpg', format: 'png', name: 'bare' });
    const nf = fileOf(bare.text);
    if (wf && nf) {
      const a = readPng(fs.readFileSync(wf[1]));
      const b = readPng(fs.readFileSync(nf[1]));
      let diffBottom = 0;
      let diffTop = 0;
      for (let y = 0; y < 480; y++)
        for (let x = 0; x < 640; x++) {
          const i = (y * 640 + x) * 4;
          const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]);
          if (d > 40) y > 380 ? diffBottom++ : diffTop++;
        }
      ok(diffBottom > 500 && diffTop < 50, 'words placed at the bottom are written there, and nowhere else');
    } else ok(false, 'words are written on a photo');
    const hidden = await run({ path: 'photo.jpg', blur_areas: [{ x: 200, y: 150, w: 200, h: 150 }], format: 'png', name: 'hidden' });
    const hf = fileOf(hidden.text);
    if (hf && nf) {
      const a = readPng(fs.readFileSync(hf[1]));
      const b = readPng(fs.readFileSync(nf[1]));
      const part = (img: { data: Uint8Array }) => {
        const px = new Uint8ClampedArray(200 * 150 * 4);
        for (let y = 0; y < 150; y++) px.set(img.data.subarray(((150 + y) * 640 + 200) * 4, ((150 + y) * 640 + 400) * 4), y * 200 * 4);
        return px;
      };
      ok(detail(part(a), 200) < detail(part(b), 200) * 0.1, 'a blurred area loses its detail');
      ok(near([...a.data.subarray(0, 4)], [...b.data.subarray(0, 4)], 2), 'and the rest of the picture stays as it was');
    } else ok(false, 'an area of a photo is blurred');
    const turned = await run({ path: 'photo.jpg', rotate: 270, format: 'webp', quality: 70, name: 'turned' });
    const tw = fileOf(turned.text);
    ok(!turned.isError && tw && tw[2] === '480' && tw[3] === '640' && /\.webp$/.test(tw[1]), 'turned, and as a WebP');
    const arrows = await run({ path: 'photo.jpg', arrows: [{ x1: 50, y1: 50, x2: 300, y2: 200, color: 'yellow', width: 8 }], boxes: [{ x: 400, y: 300, w: 120, h: 80 }], name: 'pointed' });
    ok(!arrows.isError && /1 arrow/.test(arrows.text) && /1 box/.test(arrows.text), 'arrows and boxes are drawn');
    // Its pixels as ffmpeg reads them: an encoded PNG reads back the same.
    const e = await encode({ w: 4, h: 2, px: quarters(4, 2) }, { format: 'png' });
    const back = await decode(e.data);
    ok(back.w === 4 && near(at(back, 3, 1), [255, 255, 255, 255], 0), 'a PNG written here reads back as it was');
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Script tests for signatures: what the pad makes (cropped to the ink, see-through around it; a photo's paper made
// see-through), the PNG pictures read and written here (every kind of PNG), the store (each picture sealed in the
// database, sealed again when the vault's key is replaced, never in a list or an agent's answer, refused to agents'
// app_api), placing one into Word files, documents and pictures, and the cards that ask the user. Build and run with a
// scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/signatures/signatures-test.ts
//   mkdir -p /tmp/hydor-test-signatures && DATA_DIR=/tmp/hydor-test-signatures node dist/dev/signatures-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { cropPixels, hasClearBackground, inkBox, padBox, paperToClear } from '../../shared/signatures.ts';
import { rotateVaultKey } from '../connections/vault.ts';
import { openDb } from '../db.ts';
import { ruleFor } from '../guide/api.ts';
import { boxPicture, composite, hasAlpha, isPng, pngSize, readPng, resize, writePng, type Rgba } from './png.ts';
import { addSignature, changeSignature, cleanPicture, deleteSignature, findSignature, listSignatures, signatureImage, signatureTables } from './store.ts';
import { signatureTools } from './tools.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import type { ApprovalAnswer } from '../agents/live.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 600)}` : ''}`);
  }
};
const throws = (f: () => unknown, re: RegExp, what: string) => {
  try {
    f();
    ok(false, `${what} (did not throw)`);
  } catch (e) {
    ok(re.test((e as Error).message), what, (e as Error).message);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-signatures-test-')));
const db = openDb(path.join(tmp, 'test.db'));
signatureTables(db);

/** A picture of `w`×`h`, every pixel from `f`. */
function picture(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}

/** A signature-like picture: a dark blue wave on nothing, a margin of clear pixels around it. */
const wave = (w = 300, h = 100) =>
  picture(w, h, (x, y) => {
    const cy = h / 2 + Math.sin(x / 18) * (h / 4);
    const d = Math.abs(y - cy);
    const inside = x >= 20 && x < w - 20 && d < 3;
    return inside ? [20, 40, 160, d < 2 ? 255 : 128] : [0, 0, 0, 0];
  });

// ---- what the pad makes ---------------------------------------------------------------------------------------
{
  const w = wave();
  const box = inkBox(w.data, w.width, w.height)!;
  ok(box && box.x === 20 && box.x + box.w === w.width - 20, 'the box around the ink starts and ends with it', box);
  ok(box.y > 0 && box.y + box.h < w.height, 'the box leaves out the clear rows above and below');
  ok(inkBox(new Uint8Array(40 * 40 * 4), 40, 40) === null, 'an empty picture has no ink');
  const pad = padBox(box, 5, w.width, w.height);
  ok(pad.x === 15 && pad.w === box.w + 10, 'a margin goes around the ink', pad);
  ok(padBox({ x: 1, y: 1, w: 5, h: 5 }, 10, 8, 8).x === 0 && padBox({ x: 1, y: 1, w: 5, h: 5 }, 10, 8, 8).w === 8, 'the margin stays inside the picture');
  const cut = cropPixels(w.data, w.width, pad);
  const cutBox = inkBox(cut, pad.w, pad.h)!;
  ok(cutBox.x === 5 && cutBox.y === 5 && cutBox.w === box.w && cutBox.h === box.h, 'cropped, the ink is the same shape with its margin around it', cutBox);
  ok(cut[3] === 0 && cut[cut.length - 1] === 0, 'cropped, the corners stay see-through');
  ok(hasClearBackground(w.data, w.width, w.height), 'a drawn signature’s background is see-through already');

  // A photo of a signature on white paper with a shadow across it, in colour: no alpha of its own.
  const W = 400;
  const H = 160;
  const photo = picture(W, H, (x, y) => {
    const paper = 236 - (x / W) * 70 - (y / H) * 20;
    const cy = H / 2 + Math.sin(x / 22) * 30;
    const ink = x > 40 && x < W - 40 && Math.abs(y - cy) < 2.5;
    return ink ? [30, 45, 120, 255] : [paper, paper, paper - 6, 255];
  });
  ok(!hasClearBackground(photo.data, W, H), 'a photo has paper, not a clear background');
  const px = new Uint8ClampedArray(photo.data);
  paperToClear(px, W, H);
  const alphaAt = (x: number, y: number) => px[(y * W + x) * 4 + 3];
  ok(alphaAt(5, 5) === 0 && alphaAt(W - 5, H - 5) === 0 && alphaAt(W - 5, 5) === 0, 'the paper is see-through, in the light and in the shadow', [alphaAt(5, 5), alphaAt(W - 5, H - 5)]);
  const cy = Math.round(H / 2 + Math.sin(200 / 22) * 30);
  ok(alphaAt(200, cy) > 200, 'the ink stays', alphaAt(200, cy));
  const o = (cy * W + 200) * 4;
  ok(px[o + 2] > px[o] && px[o] < 80, 'the ink keeps its blue', [px[o], px[o + 1], px[o + 2]]);
  const after = inkBox(px, W, H, 20)!;
  ok(after.x >= 38 && after.x + after.w <= W - 38, 'only the ink is left to crop to', after);
}

// ---- PNG pictures ---------------------------------------------------------------------------------------------
{
  const w = wave(120, 50);
  const png = writePng(w);
  ok(isPng(png) && JSON.stringify(pngSize(png)) === JSON.stringify({ width: 120, height: 50 }), 'a written PNG says its size');
  const back = readPng(png);
  ok(Buffer.from(back.data).equals(Buffer.from(w.data)), 'RGBA comes back pixel for pixel');
  ok(hasAlpha(back), 'with its see-through parts');
  const rgb = readPng(
    writePng(
      picture(30, 20, (x, y) => [x * 8, y * 12, 77, 255]),
      { alpha: false },
    ),
  );
  ok(rgb.data[(5 * 30 + 7) * 4] === 56 && rgb.data[(5 * 30 + 7) * 4 + 3] === 255 && !hasAlpha(rgb), 'RGB without alpha comes back whole');

  // Other kinds of PNG, written here as other programs write them: a palette with see-through entries, grey in 1 and
  // 16 bits, interlaced RGBA.
  const crcChunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const pngOf = (w: number, h: number, depth: number, color: number, rows: Buffer, extra: Buffer[] = [], interlace = 0) => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = depth;
    ihdr[9] = color;
    ihdr[12] = interlace;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), crcChunk('IHDR', ihdr), ...extra, crcChunk('IDAT', zlib.deflateSync(rows)), crcChunk('IEND', Buffer.alloc(0))]);
  };
  // A palette: red, then see-through green; 2 bits a pixel.
  const pal = pngOf(4, 1, 2, 3, Buffer.from([0, 0b00010001]), [crcChunk('PLTE', Buffer.from([255, 0, 0, 0, 255, 0])), crcChunk('tRNS', Buffer.from([255, 0]))]);
  const p = readPng(pal);
  ok(p.data[0] === 255 && p.data[3] === 255 && p.data[4 + 1] === 255 && p.data[4 + 3] === 0, 'a palette with a see-through entry', [...p.data]);
  // Grey, 1 bit: black, white, black…; and 16 bits with a Sub filter.
  const g1 = readPng(pngOf(8, 1, 1, 0, Buffer.from([0, 0b01010101])));
  ok(g1.data[0] === 0 && g1.data[4] === 255 && g1.data[8] === 0, 'grey in 1 bit');
  const g16 = readPng(pngOf(2, 1, 16, 0, Buffer.from([1, 0x80, 0x00, 0x10, 0x00])));
  ok(g16.data[0] === 0x80 && g16.data[4] === 0x90, 'grey in 16 bits, with a filter', [g16.data[0], g16.data[4]]);
  // Interlaced (Adam7) RGBA: every pixel where it belongs.
  const W = 10;
  const H = 9;
  const want = picture(W, H, (x, y) => [x * 20, y * 25, (x * y) % 256, 255 - x]);
  const passes: [number, number, number, number][] = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ];
  const parts: number[] = [];
  for (const [x0, y0, dx, dy] of passes)
    for (let y = y0; y < H; y += dy) {
      if (x0 >= W) break;
      parts.push(0);
      for (let x = x0; x < W; x += dx) parts.push(...want.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));
    }
  const inter = readPng(pngOf(W, H, 8, 6, Buffer.from(parts), [], 1));
  ok(Buffer.from(inter.data).equals(Buffer.from(want.data)), 'interlaced pixels each in their place');
  throws(() => readPng(Buffer.from('not a picture')), /not a PNG/, 'what is not a PNG is refused');
  throws(() => readPng(png.subarray(0, png.length - 30)), /cut short|damaged/, 'a PNG cut short is refused');
  throws(() => readPng(pngOf(3000, 3000, 8, 6, Buffer.alloc(10)), { maxPixels: 1000 }), /too large/, 'one too large is refused before it is unpacked');

  // Made smaller, laid over another picture.
  const half = resize(w, 60, 25);
  ok(half.width === 60 && inkBox(half.data, 60, 25) !== null, 'made smaller, the ink is still there');
  const base = picture(50, 50, () => [255, 255, 255, 255]);
  const top = picture(10, 10, () => [0, 0, 255, 128]);
  const both = composite(base, top, 20, 30);
  const at = (img: Rgba, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
  ok(JSON.stringify(at(both, 25, 35)) === JSON.stringify([127, 127, 255, 255]) && JSON.stringify(at(both, 5, 5)) === JSON.stringify([255, 255, 255, 255]), 'laid over, half see-through blue tints white; the rest is untouched', at(both, 25, 35));
  const box = boxPicture(80, 30);
  ok(box.width === 80 && box.data[3] > 100 && box.data[(15 * 80 + 40) * 4 + 3] > 0, 'the box an agent sees is drawn, see-through inside');
}

// ---- the store ------------------------------------------------------------------------------------------------
{
  const png = writePng(wave());
  const s = addSignature(db, { name: '  My   signature ', kind: 'signature', png });
  ok(s.name === 'My signature' && s.kind === 'signature' && s.width === 300 && s.height === 100, 'a signature is kept under its name, tidied', s);
  const row = db.prepare('select image from signatures where id = ?').get(s.id) as { image: string };
  ok(row.image.startsWith('v1.') && !row.image.includes(png.toString('base64').slice(0, 40)), 'its picture is sealed in the database, never as it is');
  const raw = fs.readFileSync(path.join(tmp, 'test.db'));
  ok(!raw.includes(png.subarray(0, 64)) && !raw.includes(Buffer.from(png.toString('base64').slice(8, 60))), 'the database file holds no part of the picture in the clear');
  const pic = (await signatureImage(db, s.id))!;
  ok(pic && readPng(pic.png).data.length === 300 * 100 * 4 && Buffer.from(readPng(pic.png).data).equals(Buffer.from(wave().data)), 'opened, it is the same picture', pic && pic.width);
  ok((await signatureImage(db, 'MY SIGNATURE'))?.signature.id === s.id, 'found by its name in any case');
  ok((await signatureImage(db, 'nobody')) === null, 'a name nobody saved finds nothing');
  const listed = JSON.stringify(listSignatures(db));
  ok(!listed.includes('iVBOR') && !listed.includes('image') && listed.includes('My signature'), 'the list has names, never pictures', listed);
  throws(() => addSignature(db, { name: 'my SIGNATURE', png }), /already/, 'two signatures may not share a name, whatever its case');
  throws(() => addSignature(db, { name: 'Blank', png: writePng(picture(20, 20, () => [0, 0, 0, 0])) }), /empty/, 'an empty picture is not a signature');
  throws(() => addSignature(db, { name: 'Text', png: Buffer.from('hello') }), /PNG/, 'only PNG pictures are kept');
  throws(() => addSignature(db, { name: '   ', png }), /name/, 'a signature needs a name');
  // What comes in is written again: other chunks (text, metadata) are not kept.
  const withText = Buffer.concat([png.subarray(0, 33), Buffer.from([0, 0, 0, 5]), Buffer.from('tEXtsecrt'), Buffer.alloc(4), png.subarray(33)]);
  const clean = cleanPicture(withText);
  ok(!clean.png.includes(Buffer.from('secrt')), 'a picture’s other chunks are left out when it is kept');

  const i = addSignature(db, { name: 'Initials', kind: 'initials', png: writePng(wave(80, 60)) });
  ok(
    listSignatures(db)
      .map((x) => x.name)
      .join() === 'My signature,Initials',
    'signatures first, then initials',
  );
  const renamed = changeSignature(db, i.id, { name: 'AR' });
  ok(renamed.name === 'AR' && renamed.kind === 'initials', 'renamed, it stays initials');
  throws(() => changeSignature(db, i.id, { name: 'my signature' }), /already/, 'a new name may not be another’s');
  const redrawn = changeSignature(db, i.id, { png: writePng(wave(90, 40)) });
  ok(redrawn.width === 90 && redrawn.height === 40, 'drawn again, its new size is kept');

  // One given for now only goes when its time is up, unless it is kept.
  const soon = addSignature(db, { name: 'For now', png, until: Date.now() + 60_000 });
  ok(
    listSignatures(db).some((x) => x.id === soon.id && x.until),
    'one for now is listed with its time',
  );
  const kept = changeSignature(db, soon.id, { keep: true });
  ok(!kept.until, 'kept, it stays for good');
  const gone = addSignature(db, { name: 'Gone', png, until: Date.now() + 60_000 });
  db.prepare('update signatures set until = ? where id = ?').run(Date.now() - 1, gone.id);
  ok(!listSignatures(db).some((x) => x.id === gone.id) && !findSignature(db, gone.id), 'one whose time is up is gone');

  // The vault's key replaced: every signature is sealed again and still opens.
  const before = (db.prepare('select image from signatures where id = ?').get(s.id) as { image: string }).image;
  rotateVaultKey(db);
  const after = (db.prepare('select image from signatures where id = ?').get(s.id) as { image: string }).image;
  ok(before !== after && before.split('.')[1] !== after.split('.')[1], 'a new vault key seals the signatures again');
  ok(Buffer.from(readPng((await signatureImage(db, s.id))!.png).data).equals(Buffer.from(wave().data)), 'and they still open');
  deleteSignature(db, soon.id);
  ok(!findSignature(db, soon.id), 'a deleted signature is gone');
}

// ---- an agent asks for one -------------------------------------------------------------------------------------

/** A run whose session shows cards: `user` answers each as the person would (null: the card is withdrawn). */
function runWith(user: ((card: ApprovalRequest, check?: (a: ApprovalAnswer) => string | null) => ApprovalAnswer | null) | null, key = 'claude:sig-test'): { ctx: RunCtx; cards: ApprovalRequest[] } {
  const cards: ApprovalRequest[] = [];
  const adapter = user && {
    ask: async (card: ApprovalRequest, o: { check?: (a: ApprovalAnswer) => string | null }) => {
      cards.push(card);
      return user(card, o.check);
    },
  };
  const ctx = { runId: 'run-1', key, agent: 'claude', cwd: tmp, deps: { db, sessions: { adapterByRun: () => adapter ?? undefined } } } as unknown as RunCtx;
  return { ctx, cards };
}
const tool = (name: string) => signatureTools({} as RunCtx).find((t) => t.name === name)!;
const text = (r: string | ToolOutput) => (typeof r === 'string' ? r : r.text);
{
  for (const x of listSignatures(db)) deleteSignature(db, x.id);
  const drawn = writePng(wave(240, 90));
  // The user draws it on the card, which keeps it, then answers with its id.
  const { ctx, cards } = runWith((card, check) => {
    const s = addSignature(db, { name: card.signature!.ask!.name, kind: card.signature!.ask!.kind, png: drawn });
    const a = { decision: 'accept', form: { signature: s.id } };
    return check?.(a) ? null : a;
  });
  const r = text(await tool('ask_signature').run({ kind: 'signature', name: 'Work signature', why: 'To sign the lease, page 3' }, ctx));
  const card = cards[0];
  ok(card?.signature?.ask?.kind === 'signature' && card.signature.ask.name === 'Work signature' && card.signature.ask.why === 'To sign the lease, page 3', 'ask_signature shows a card with the pad, the name and why', card);
  ok(card.options.map((o) => o.id).join() === 'accept,decline', 'the card has Save and Not now');
  ok(/saved their signature as “Work signature”/.test(r) && /place_signature/.test(r) && /not a cryptographic digital signature/.test(r), 'the agent hears it is saved, its name, and what it is', r);
  ok(!r.includes('iVBOR') && !r.includes(drawn.toString('base64').slice(20, 80)), 'the agent never gets the picture');
  // Saved already: the names, and no card.
  const again = runWith(() => null);
  const r2 = text(await tool('ask_signature').run({}, again.ctx));
  ok(!again.cards.length && /saved already: “Work signature” \(signature\)/.test(r2), 'one saved already: the agent gets its name instead of a card', r2);
  // new: true asks again, with a name no saved one has.
  const fresh = runWith(() => ({ decision: 'decline' }));
  const r3 = text(await tool('ask_signature').run({ name: 'Work signature', new: true }, fresh.ctx));
  ok(fresh.cards[0]?.signature?.ask?.name === 'Work signature 2', 'asked again, the card suggests a name no saved one has', fresh.cards[0]?.signature);
  ok(/chose not to/.test(r3), 'Not now: the agent hears the user declined', r3);
  // Initials are asked for apart from signatures.
  const ini = runWith(() => null);
  const r4 = await tool('ask_signature').run({ kind: 'initials' }, ini.ctx);
  ok(ini.cards[0]?.signature?.ask?.kind === 'initials' && ini.cards[0].title === 'Your initials, please' && typeof r4 !== 'string' && r4.isError, 'initials get a card of their own; one withdrawn is an error for the agent', r4);
  // An answer that names no saved signature is refused, and the card stays.
  let refused: string | null = null;
  const bad = runWith((_card, check) => ((refused = check?.({ decision: 'accept', form: { signature: 'sg_nothing' } }) ?? null), null));
  await tool('ask_signature').run({ new: true }, bad.ctx);
  ok(refused === 'Draw your signature and save it first', 'an answer without a saved signature is refused', refused);
  // Nobody to draw it.
  const none = runWith(null);
  const r5 = await tool('ask_signature').run({ new: true }, none.ctx);
  ok(typeof r5 !== 'string' && r5.isError && /Settings → App → Signatures/.test(r5.text), 'with nobody to answer, the agent is told where the user can draw one', r5);
}

// ---- agents' app_api ------------------------------------------------------------------------------------------
{
  ok(ruleFor('GET', '/api/signatures').level === 'free', 'agents may list the signatures by name');
  for (const [m, p] of [
    ['GET', '/api/signatures/sg_1/image'],
    ['POST', '/api/signatures'],
    ['PATCH', '/api/signatures/sg_1'],
    ['DELETE', '/api/signatures/sg_1'],
    ['POST', '/api/signatures/sg_1/asset'],
  ])
    ok(ruleFor(m, p).level === 'refuse', `agents' app_api is refused ${m} ${p}`, ruleFor(m, p));
}

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

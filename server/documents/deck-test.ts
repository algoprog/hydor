// Script test for deckPreview, a PowerPoint file read as a deck for the file viewer (GET /api/documents/deck): its slides,
// words and notes as the Library reads them, its pictures kept apart, each version read once, and what it refuses.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/documents/deck-test.ts && DATA_DIR=/tmp/hydor-test-deck node dist/dev/deck-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.ts';
import { everyEl, normalizeDeck, plainText, type ImageEl, type TextEl } from '../../shared/slides.ts';
import { getAsset, initAssets } from '../pages/assets.ts';
import { pptxFile } from '../pages/pptx.ts';
import { writePng } from '../signatures/png.ts';
import { deckPreview } from './deck.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-deck-')));
const db = openDb(path.join(root, 'test.db'));
// The Library's tables for kept pictures and videos (the server makes them as it starts).
initAssets(db);
const PIC = writePng({ width: 40, height: 20, data: Buffer.alloc(40 * 20 * 4, 200) });
const SRC = `data:image/png;base64,${PIC.toString('base64')}`;
const deckFile = (name: string, words: string) => {
  const deck = normalizeDeck({
    slides: [
      { els: [{ type: 'text', x: 80, y: 60, w: 900, h: 120, text: words }], notes: 'Say hello first.' },
      { els: [{ type: 'image', x: 100, y: 100, w: 400, h: 200, src: SRC, alt: 'Grey' }], hidden: true },
    ],
  });
  const p = path.join(root, name);
  fs.writeFileSync(p, pptxFile(deck, { title: 'T', picture: (s) => (s === SRC ? { data: PIC, ext: 'png', w: 40, h: 20 } : null) }));
  return p;
};
const status = async (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e.status ?? 500);

const tests: [string, () => Promise<void>][] = [
  [
    'reads its slides, words, notes and hidden slides, its pictures kept apart',
    async () => {
      const r = await deckPreview(db, deckFile('talk.pptx', 'Hello, deck'));
      assert.equal(r.deck.slides.length, 2);
      const text = everyEl(r.deck.slides[0].els).find((e): e is TextEl => e.type === 'text');
      assert.equal(plainText(text?.paras), 'Hello, deck');
      assert.equal(r.deck.slides[0].notes, 'Say hello first.');
      assert.equal(r.deck.slides[1].hidden, true);
      const pic = everyEl(r.deck.slides[1].els).find((e): e is ImageEl => e.type === 'image');
      assert.match(pic?.src ?? '', /^naget-asset:[a-f0-9]{16,64}$/);
      assert.ok(getAsset(db, pic!.src.slice('naget-asset:'.length)), 'the picture is one the app keeps');
      assert.ok(!JSON.stringify(r.deck).includes('data:image'), 'no picture data in the deck');
      assert.ok(Array.isArray(r.notes));
      assert.equal(typeof r.pages, 'boolean');
    },
  ],
  [
    'reads each version once, and again once the file changes',
    async () => {
      const p = deckFile('again.pptx', 'First words');
      const a = await deckPreview(db, p);
      assert.equal((await deckPreview(db, p)).deck, a.deck, 'the same version comes from memory');
      fs.writeFileSync(p, fs.readFileSync(deckFile('other.pptx', 'Second words, longer')));
      fs.utimesSync(p, new Date(), new Date(Date.now() + 5000));
      const b = await deckPreview(db, p);
      assert.notEqual(b.deck, a.deck);
      assert.equal(plainText(everyEl(b.deck.slides[0].els).find((e): e is TextEl => e.type === 'text')?.paras), 'Second words, longer');
    },
  ],
  [
    'refuses what is not a PowerPoint file, a file that is not there, and a broken one',
    async () => {
      const txt = path.join(root, 'notes.txt');
      fs.writeFileSync(txt, 'hello');
      assert.equal(await status(deckPreview(db, txt)), 415);
      assert.equal(await status(deckPreview(db, path.join(root, 'missing.pptx'))), 404);
      const broken = path.join(root, 'broken.pptx');
      fs.writeFileSync(broken, 'not a zip at all');
      assert.equal(await status(deckPreview(db, broken)), 422);
      // Mended, it is read again (a failed read is not kept).
      fs.writeFileSync(broken, fs.readFileSync(deckFile('mended.pptx', 'Mended')));
      fs.utimesSync(broken, new Date(), new Date(Date.now() + 9000));
      assert.equal((await deckPreview(db, broken)).deck.slides.length, 2);
    },
  ],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
  }
}
db.close();
fs.rmSync(root, { recursive: true, force: true });
if (failed) process.exit(1);
console.log('all passed');

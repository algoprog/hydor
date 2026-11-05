// Script tests for PowerPoint files as the slides editor exports them, made to look in Office as they do in the app:
// the deck's fonts carried inside the file as PowerPoint reads them (Embedded OpenType, only the faces its words use),
// what PowerPoint is told of every font (its fallbacks, the theme's, East Asian scripts' own), and the words laid out
// as the app lays them out (line pitch, space after and indents at the size shown, letter spacing, kerning, bullets in
// their box's font and colour, each run's language, links in their words' colour). Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/pptx-test.ts
//   DATA_DIR=/tmp/hydor-test-pptx node dist/dev/pptx-test.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Zip } from '../documents/zip.ts';
import zlib from 'node:zlib';
import { normalizeDeck, type El } from '../../shared/slides.ts';
import { canCapture } from '../capture/index.ts';
import { chartPlan, langOf, pptxFile, shapeOutline, type Picture } from './pptx.ts';
import { deckRenders } from './slides-render.ts';
import { deckFaces, deckFontFiles, eotOf, faceFile, faceKey, fontAttrs, fontInfo } from './pptx-fonts.ts';

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

// KaTeX's TrueType files come with the app's packages: real fonts to carry.
const KATEX = path.join(process.cwd(), 'node_modules/katex/dist/fonts');
const regular = fs.readFileSync(path.join(KATEX, 'KaTeX_Main-Regular.ttf'));
const bold = fs.readFileSync(path.join(KATEX, 'KaTeX_Main-Bold.ttf'));
/** A copy of a font with one of its OS/2 table's 16-bit values changed (at `at` in the table). */
function withOs2(font: Buffer, at: number, value: number): Buffer {
  const b = Buffer.from(font);
  for (let i = 0; i < b.readUInt16BE(4); i++) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'OS/2') b.writeUInt16BE(value, b.readUInt32BE(12 + i * 16 + 8) + at);
  return b;
}
// KaTeX's italic face says so only in its name: one that says so where fonts do (fsSelection's ITALIC bit).
const italic = withOs2(fs.readFileSync(path.join(KATEX, 'KaTeX_Main-Italic.ttf')), 62, 0x41);
const part = (file: Buffer, name: string) => new Zip(file).read(name)?.toString('utf8') ?? '';

/** A PNG of `w`×`h` pixels, each `px(x, y)`. */
function png(w: number, h: number, px: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) Buffer.from(px(x, y)).copy(raw, y * (w * 4 + 1) + 1 + x * 4);
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head.subarray(4), data])) >>> 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The first pixel of a PNG the browser wrote (8-bit RGBA, unfiltered or Sub/Up/Average/Paeth on the first row). */
function pixel(b: Buffer): number[] {
  const chunks: Buffer[] = [];
  for (let at = 8; at < b.length; ) {
    const n = b.readUInt32BE(at);
    if (b.toString('latin1', at + 4, at + 8) === 'IDAT') chunks.push(b.subarray(at + 8, at + 8 + n));
    at += 12 + n;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  return [raw[1], raw[2], raw[3]];
}

// ---- Embedded OpenType ------------------------------------------------------------------------------------------
{
  const eot = eotOf(regular)!;
  ok(eot && eot.readUInt32LE(0) === eot.length && eot.readUInt32LE(4) === regular.length && eot.readUInt32LE(8) === 0x00020002 && eot.readUInt32LE(12) === 0, 'a font is kept as Embedded OpenType 2.2: its sizes, whole and plain');
  ok(eot.readUInt16LE(34) === 0x504c && eot.readUInt8(26) === 1 && eot.readUInt8(27) === 0 && eot.readUInt32LE(28) === 400, 'with the magic number, the default charset, upright, weight 400');
  ok(eot.subarray(eot.length - regular.length).equals(regular), 'the font itself after the header, as it was');
  // The names, each after its padding and size, in UTF-16LE.
  let at = 80;
  const names: string[] = [];
  for (let i = 0; i < 4; i++) {
    ok(eot.readUInt16LE(at) === 0, `padding before name ${i + 1}`);
    const n = eot.readUInt16LE(at + 2);
    names.push(eot.subarray(at + 4, at + 4 + n).toString('utf16le'));
    at += 4 + n;
  }
  ok(names[0] === 'KaTeX_Main' && names[1] === 'Regular' && names[2].startsWith('Version') && names[3] === 'KaTeX_Main-Regular', 'its family, style, version and full names');
  ok(eot.readUInt16LE(at) === 0 && eot.readUInt16LE(at + 2) === 0 && eot.readUInt32LE(at + 4) === 0x50475342 && at + 24 === eot.length - regular.length, 'no root string (its checksum as the format makes it), no signature, no EUDC font');
  ok(eotOf(bold)!.readUInt32LE(28) === 700 && eotOf(italic)!.readUInt8(27) === 1, 'a bold face says its weight, an italic one that it is italic');
  const restricted = withOs2(regular, 8, 0x0002);
  ok(eotOf(restricted) === null && fontInfo(restricted)?.embeddable === false, 'a font whose licence forbids embedding is not carried');
  ok(eotOf(Buffer.from('not a font at all, just words')) === null, 'nor what is not a font');
}

// ---- the faces a deck uses ------------------------------------------------------------------------------------------
const deck = normalizeDeck({
  theme: { id: 'midnight' },
  footer: { text: 'Foot', skipTitle: true },
  slides: [
    {
      els: [
        { type: 'text', role: 'title', text: 'Title', bold: true, x: 80, y: 40, w: 1000, h: 90, size: 46 },
        { id: 'body', type: 'text', x: 80, y: 160, w: 600, h: 300, size: 24, lh: 1.5, gap: 12, ls: 0.1, text: '- One\n  - Two\n1. Three' },
      ],
    },
    {
      els: [
        {
          id: 'runs',
          type: 'text',
          x: 80,
          y: 80,
          w: 900,
          h: 300,
          size: 30,
          paras: [
            { runs: [{ t: 'Plain ' }, { t: 'slanted', i: true }, { t: ' Georgia', font: 'Georgia' }, { t: ' Playfair', font: 'Playfair Display', b: true }] },
            { runs: [{ t: '季度回顾', color: 'accent' }, { t: ' Τριμηνιαία' }, { t: ' link', link: 'https://example.com' }] },
          ],
        },
        {
          type: 'table',
          x: 80,
          y: 420,
          w: 600,
          h: 120,
          rows: [
            ['Head', 'Row'],
            ['a', 'b'],
          ],
        },
        { type: 'chart', x: 700, y: 420, w: 400, h: 240, kind: 'bar', title: 'Sales', labels: ['A'], series: [{ name: 'S', values: [1] }] },
        { type: 'text', x: 80, y: 600, w: 300, h: 60, text: 'Empty face', font: 'Lato' },
      ],
    },
  ],
});
{
  const keys = deckFaces(deck).map(faceKey).sort();
  ok(JSON.stringify(keys) === JSON.stringify(['Inter|0|0', 'Inter|0|1', 'Inter|1|0', 'Lato|0|0', 'Playfair Display|1|0', 'Space Grotesk|1|0']), `the faces a deck's words show in, and only those: ${keys.join(', ')}`);
  ok(!keys.some((k) => k.startsWith('Georgia')), 'an Office font (Georgia) is not carried');
}

// ---- the fonts inside the file -----------------------------------------------------------------------------------------
{
  const fonts = new Map([
    ['Inter|0|0', regular],
    ['Inter|1|0', bold],
    ['Inter|0|1', italic],
  ]);
  const file = pptxFile(deck, { title: 'T', picture: () => null, fonts });
  const pres = part(file, 'ppt/presentation.xml');
  const rels = part(file, 'ppt/_rels/presentation.xml.rels');
  const types = part(file, '[Content_Types].xml');
  ok(pres.includes('embedTrueTypeFonts="1"') && !pres.includes('saveSubsetFonts'), 'the presentation says it carries its fonts, whole');
  ok(
    /<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter" panose="020B0604020202020204" pitchFamily="34" charset="0"\/><p:regular r:id="rId\d+"\/><p:bold r:id="rId\d+"\/><p:italic r:id="rId\d+"\/><\/p:embeddedFont><\/p:embeddedFontLst>/.test(
      pres,
    ),
    'each family listed with its faces in PowerPoint’s order',
  );
  ok(/<p:notesSz [^>]*\/><p:embeddedFontLst>/.test(pres) && pres.indexOf('</p:embeddedFontLst>') < pres.indexOf('<p:defaultTextStyle>'), 'where the standard puts the list');
  ok(
    (rels.match(/relationships\/font" Target="fonts\/font\d\.fntdata"/g) ?? []).length === 3 && types.includes('<Default Extension="fntdata" ContentType="application/x-fontdata"/>'),
    'each face a font part of its own, of the type PowerPoint keeps fonts in',
  );
  const f1 = new Zip(file).read('ppt/fonts/font1.fntdata')!;
  ok(f1.readUInt16LE(34) === 0x504c && f1.subarray(f1.length - regular.length).equals(regular), 'as Embedded OpenType');
  const bare = pptxFile(deck, { title: 'T', picture: () => null });
  ok(
    !part(bare, 'ppt/presentation.xml').includes('embeddedFont') && !part(bare, '[Content_Types].xml').includes('fntdata') && !new Zip(bare).names().some((n) => n.startsWith('ppt/fonts/')),
    'a deck exported without its fonts (offline) has none, and says none',
  );
}

// ---- what PowerPoint is told of each font -------------------------------------------------------------------------------
{
  const file = pptxFile(deck, { title: 'T', picture: () => null, scales: new Map([['body', 0.5]]) });
  const s1 = part(file, 'ppt/slides/slide1.xml');
  const s2 = part(file, 'ppt/slides/slide2.xml');
  ok(
    s1.includes('<a:latin typeface="Space Grotesk" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/>'),
    'a title’s run: its font with what to fall back on, East Asian and complex scripts in the theme’s heading fonts for them',
  );
  ok(s1.includes('<a:latin typeface="Inter" panose="020B0604020202020204" pitchFamily="34" charset="0"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>'), 'a body run: the theme’s body fonts for East Asian and complex scripts');
  ok(s2.includes('<a:latin typeface="Georgia" panose="02040502050405020303" pitchFamily="18" charset="0"/>') && fontAttrs('JetBrains Mono').includes('pitchFamily="49"'), 'a serif falls back on a serif, a fixed-pitch font on one');
  ok(/<a:rPr lang="zh-CN" altLang="en-US" [^>]*>/.test(s2) && /<a:rPr lang="el-GR" [^>]*>/.test(s2) && /<a:rPr lang="en-US" [^>]*>/.test(s2), 'each run in its language, by its letters');
  ok(langOf('こんにちは') === 'ja-JP' && langOf('안녕') === 'ko-KR' && langOf('مرحبا') === 'ar-SA' && langOf('Hello') === 'en-US', 'Japanese, Korean and Arabic told apart');
  ok(
    /<a:rPr [^>]*u="sng"[^>]*><a:solidFill><a:srgbClr val="[0-9A-F]{6}"><\/a:srgbClr><\/a:solidFill>[^]*?<a:hlinkClick r:id="rId\d+"><a:extLst><a:ext uri="\{A12FA001-AC4F-418D-AE19-62706E023703\}"><ahyp:hlinkClr xmlns:ahyp="http:\/\/schemas.microsoft.com\/office\/drawing\/2018\/hyperlinkcolor" val="tx"\/><\/a:ext><\/a:extLst><\/a:hlinkClick><\/a:rPr><a:t> link<\/a:t>/.test(
      s2,
    ),
    'a link underlined, in its words’ colour',
  );
  ok((s1.match(/kern="100"/g) ?? []).length >= 4, 'words kerned at every size, as the browser kerns them');
  // The body: lh 1.5 (PowerPoint's single spacing is 1.2 × the size: 125%), made half as large to fit.
  const body = /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Text \d+"\/>[^]*?<\/p:sp>/.exec(s1)?.[0] ?? '';
  ok(body.includes('<a:normAutofit fontScale="50000"/>') && (body.match(/<a:lnSpc><a:spcPct val="125000"\/><\/a:lnSpc>/g) ?? []).length === 3, 'a box made smaller to fit says so once; its lines are as far apart as the app’s');
  ok((body.match(/<a:spcAft><a:spcPts val="450"\/><\/a:spcAft>/g) ?? []).length === 2 && body.includes('<a:spcAft><a:spcPts val="0"/></a:spcAft><a:buClr>'), 'the space after at the size shown (12 px at half: 4.5 pt), none after the last');
  ok(body.includes(`marL="${Math.round(1.25 * 24 * 0.5 * 9525)}" indent="-${Math.round(1.25 * 24 * 0.5 * 9525)}"`) && body.includes(`marL="${Math.round(2.75 * 24 * 0.5 * 9525)}"`), 'a bullet hangs 1.25 em, each level 1.5 em in, at the size shown');
  ok(body.includes(`spc="${Math.round(0.1 * 24 * 0.5 * 75)}"`), 'letter spacing in the box’s em, at the size shown');
  ok(
    /<a:buClr><a:srgbClr val="DFE5EF"><\/a:srgbClr><\/a:buClr><a:buFont typeface="Inter" panose="[0-9A-F]{20}" pitchFamily="34" charset="0"\/><a:buChar char="•"\/>/.test(body) && body.includes('<a:buAutoNum type="arabicPeriod"/>'),
    'bullets and numbers in the box’s font and colour',
  );
  ok(/<a:endParaRPr lang="en-US" sz="1800" b="0" i="0" dirty="0"><a:solidFill>/.test(body), 'words typed at a paragraph’s end in PowerPoint take the box’s look');
  const table = /<a:tbl>[^]*<\/a:tbl>/.exec(s2)?.[0] ?? '';
  ok(
    table.includes('<a:lnSpc><a:spcPct val="100000"/></a:lnSpc>') && /<a:rPr lang="en-US" sz="1500" b="1" kern="100" dirty="0">/.test(table) && table.includes('<a:latin typeface="Inter"'),
    'a table’s words in its font, the header bold, single-spaced',
  );
  const theme = part(file, 'ppt/theme/theme1.xml');
  ok(
    /<a:majorFont><a:latin typeface="Space Grotesk" panose="[0-9A-F]{20}" pitchFamily="34" charset="0"\/><a:ea typeface=""\/><a:cs typeface=""\/><a:font script="Jpan" typeface="游ゴシック"\/>/.test(theme) &&
      theme.includes('<a:font script="Hans" typeface="等线"/>'),
    'the theme’s fonts with their fallbacks, and Office’s own for East Asian scripts',
  );
  const chart = part(file, 'ppt/charts/chart1.xml');
  ok(chart.includes('<a:latin typeface="Inter" panose=') && chart.includes('<a:ea typeface="+mn-ea"/>'), 'a chart’s words in the deck’s font with its fallbacks');
}

// ---- faces fetched once and kept ----------------------------------------------------------------------------------------
{
  // A face kept from before is read from where it was kept, without the network.
  const dir = path.join(process.env.DATA_DIR!, 'pages', 'fonts', 'ttf');
  fs.mkdirSync(dir, { recursive: true });
  const name = (k: string) => path.join(dir, `${crypto.createHash('sha256').update(k).digest('hex').slice(0, 24)}.ttf`);
  fs.writeFileSync(name('Inter|0|0'), regular);
  fs.writeFileSync(name('Inter|1|0'), bold);
  ok((await faceFile({ family: 'Inter', bold: false, italic: false }))?.equals(regular) === true, 'a face kept before is read where it was kept');
  ok((await faceFile({ family: 'Georgia', bold: false, italic: false })) === null, 'an Office font is never fetched');
  const only = normalizeDeck({ theme: 'paper', slides: [{ els: [{ type: 'text', x: 0, y: 0, w: 400, h: 100, text: 'Hi **there**' }] }] });
  const files = await deckFontFiles(only);
  ok(files.size === 2 && files.get('Inter|0|0')?.equals(regular) && files.get('Inter|1|0')?.equals(bold), 'a deck’s faces, ready for its file');
}

// ---- pictures ----------------------------------------------------------------------------------------------------------
{
  const pic: Picture = { data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAAAASUVORK5CYII=', 'base64'), ext: 'png', w: 400, h: 200 };
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'warm', type: 'image', src: 'naget-asset:0123456789abcdef', x: 0, y: 0, w: 200, h: 200, adjust: { bright: 40, sat: 0 }, opacity: 0.5 },
          { id: 'grey', type: 'image', src: 'naget-asset:0123456789abcdef', x: 300, y: 0, w: 200, h: 200, adjust: { gray: true } },
          { id: 'fit', type: 'image', src: 'naget-asset:0123456789abcdef', x: 600, y: 0, w: 200, h: 200, fit: 'contain', line: '#000000', shadow: true },
        ],
      },
    ],
  });
  const baked: Picture = { ...pic, data: Buffer.concat([pic.data, Buffer.from([0])]) };
  const x = part(pptxFile(d, { title: 'T', picture: () => pic, renders: new Map([['adjust:warm', baked]]) }), 'ppt/slides/slide1.xml');
  const warm = /<p:pic>(?:(?!<\/p:pic>)[^])*?name="Picture 1"[^]*?<\/p:pic>/.exec(x)?.[0] ?? '';
  ok(warm.includes('<a:alphaModFix amt="50000"/></a:blip>') && !warm.includes('<a:lum') && !warm.includes('<a:hsl'), 'a picture whose colours were changed goes as the editor shows it, see-through as it is, without PowerPoint’s effects on top');
  const rels = part(pptxFile(d, { title: 'T', picture: () => pic, renders: new Map([['adjust:warm', baked]]) }), 'ppt/slides/_rels/slide1.xml.rels');
  ok((rels.match(/media\/image\d\.png/g) ?? []).length === 2, 'the changed picture is a picture of its own beside the plain one');
  ok(x.includes('<a:grayscl/>'), 'grey alone is PowerPoint’s own effect');
  ok(
    /<a:srcRect l="0" t="-50000" r="0" b="-50000"\/>/.test(x) && x.includes(`<a:ext cx="${200 * 9525}" cy="${200 * 9525}"/>`),
    'a picture fitted inside its box keeps the box (and its outline), the picture inside it as PowerPoint’s Crop → Fit writes it',
  );
  ok(x.includes('<a:outerShdw blurRad="171450" dist="95250" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="25000"/>'), 'a picture’s shadow as the app casts it');
  const plain = part(pptxFile(d, { title: 'T', picture: () => pic }), 'ppt/slides/slide1.xml');
  ok(plain.includes('<a:lum bright="40000"'), 'without a browser to change it, the nearest of PowerPoint’s effects');
  if (canCapture()) {
    // Drawn by the browser's own filters: brighter, and grey without saturation.
    const red = png(8, 8, () => [200, 40, 40, 255]);
    const made = await deckRenders(d, () => ({ data: red, ext: 'png', w: 8, h: 8 }));
    const got = made.get('adjust:warm');
    ok(got && got.w === 8 && got.h === 8 && !made.has('adjust:grey') && !made.has('adjust:fit'), 'with a browser here, only pictures whose colours only pixels can show are drawn again, at their own size');
    const px = got ? pixel(got.data) : [0, 0, 0];
    // 200,40,40 made 1.4 times as bright (255,56,56), then grey by Rec. 709's weights, as CSS's filters do.
    ok(
      px.every((v) => Math.abs(v - 98) <= 3),
      `as the editor draws them (brighter, no colour): ${px.join(',')}`,
    );
  }
}

// ---- shapes and lines -----------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          { id: 'st', type: 'shape', shape: 'star', x: 0, y: 0, w: 200, h: 200, fill: 'accent' },
          { id: 'hb', type: 'shape', shape: 'heart', x: 220, y: 0, w: 200, h: 200, fill: 'accent' },
          { id: 'lab', type: 'shape', shape: 'chevron', x: 440, y: 0, w: 300, h: 100, text: 'Plan the launch', shadow: true },
          { id: 'rr', type: 'shape', shape: 'round', x: 760, y: 0, w: 200, h: 100, radius: 20, pad: 10, text: 'Go', shadow: true },
          { id: 'cn', type: 'connector', from: { el: 'lab', at: 'b' }, to: { el: 'rr', at: 'b' }, width: 2, end: 'arrow', start: 'dot', dash: 'dash' },
        ],
      },
    ],
  });
  const x = part(pptxFile(d, { title: 'T', picture: () => null }), 'ppt/slides/slide1.xml');
  ok(x.includes('<a:prstGeom prst="star5"><a:avLst><a:gd name="adj" fmla="val 19098"/><a:gd name="hf" fmla="val 100000"/><a:gd name="vf" fmla="val 105000"/></a:avLst></a:prstGeom>'), 'a star is PowerPoint’s, in the app’s proportions');
  const heart = /name="Shape 2"[^]*?<\/p:sp>/.exec(x)?.[0] ?? '';
  ok(heart.includes('<a:custGeom>') && (heart.match(/<a:cubicBezTo>/g) ?? []).length === 4 && heart.includes('<a:path w="1905000" h="1905000">'), 'a heart is drawn as the app draws it, its own curves');
  const chevron = /name="Shape 3"[^]*?<\/p:sp>/.exec(x)?.[0] ?? '';
  ok(
    chevron.includes('<a:custGeom>') && chevron.includes('<a:rect l="l" t="t" r="r" b="b"/>') && chevron.includes('<a:cxnLst><a:cxn ang="16200000"><a:pos x="hc" y="t"/>'),
    'a shape with words in it keeps them to its whole box, as the app does, and is joined at its sides’ middles',
  );
  ok(chevron.includes('<a:outerShdw blurRad="152400" dist="76200"') && /name="Shape 4"[^]*?<a:outerShdw blurRad="266700" dist="95250"/.test(x), 'drawn shapes and boxes cast the app’s two kinds of shadow');
  const rr = /name="Shape 4"[^]*?<\/p:sp>/.exec(x)?.[0] ?? '';
  ok(rr.includes('<a:prstGeom prst="roundRect">') && rr.includes(`lIns="${Math.round((10 - 20 * 0.29289) * 9525)}"`), 'a rounded box is PowerPoint’s, its words as far in as the app’s');
  const cn = /<p:cxnSp>[^]*?<\/p:cxnSp>/.exec(x)?.[0] ?? '';
  const id3 = /<p:cNvPr id="(\d+)" name="Shape 3"/.exec(x)?.[1];
  const id4 = /<p:cNvPr id="(\d+)" name="Shape 4"/.exec(x)?.[1];
  ok(cn.includes(`<a:stCxn id="${id3}" idx="2"/><a:endCxn id="${id4}" idx="2"/>`), 'a connector stays stuck to a shape drawn as its own outline');
  ok(
    cn.includes('<a:custDash><a:ds d="300000" sp="200000"/></a:custDash>') && cn.includes('<a:headEnd type="oval" w="lg" len="lg"/>') && cn.includes('<a:tailEnd type="triangle" w="lg" len="lg"/>'),
    'a dashed line as the app dashes it, its ends as large',
  );
  const outline = shapeOutline('callout', 100, 100);
  ok(outline[0][0] === 'M' && outline.some((c) => c[0] === 'Q') && outline.at(-1)?.[0] === 'Z', 'a callout’s outline has the app’s rounded corners');
}

// ---- charts --------------------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    slides: [
      {
        els: [
          {
            id: 'c1',
            type: 'chart',
            kind: 'column',
            x: 0,
            y: 0,
            w: 600,
            h: 300,
            title: 'Sales',
            labels: ['Q1', 'Q2', 'Q3'],
            series: [
              { name: 'North', values: [12, 18, 24] },
              { name: 'South', values: [8, 11, 9] },
            ],
            values: true,
            size: 16,
          },
          { id: 'c2', type: 'chart', kind: 'doughnut', x: 600, y: 0, w: 400, h: 300, labels: ['A', 'B'], series: [{ name: 'S', values: [3, 1] }], values: true },
          { id: 'c3', type: 'chart', kind: 'line', x: 0, y: 300, w: 600, h: 300, labels: ['A', 'B'], series: [{ name: 'S', values: [3, 1] }], size: 18 },
        ],
      },
    ],
  });
  const file = pptxFile(d, { title: 'T', picture: () => null });
  const c1 = part(file, 'ppt/charts/chart1.xml');
  const plan = chartPlan(d.slides[0].els[0] as Extract<El, { type: 'chart' }>);
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  ok(plan.lo === 0 && plan.hi === 25 && plan.step === 6.25, `the app’s ticks: ${plan.lo}…${plan.hi} by ${plan.step}`);
  ok(c1.includes('<c:scaling><c:orientation val="minMax"/><c:max val="25"/><c:min val="0"/></c:scaling>') && c1.includes('<c:majorUnit val="6.25"/>'), 'its value axis on the app’s ticks');
  ok(
    c1.includes(
      `<c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${r4(plan.plot.x / 600)}"/><c:y val="${r4(plan.plot.y / 300)}"/><c:w val="${r4(plan.plot.w / 600)}"/><c:h val="${r4(plan.plot.h / 300)}"/></c:manualLayout>`,
    ),
    'its plot where the app draws it',
  );
  ok(c1.includes('<c:gapWidth val="78"/>') && /<c:overlap val="-\d+"\/>/.test(c1) && c1.includes('<c:dLblPos val="outEnd"/>'), 'its bars as wide as the app’s, side by side, their values above them');
  ok(
    c1.includes('<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>') && part(file, 'ppt/charts/_rels/chart1.xml.rels').includes('relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet1.xlsx"'),
    'its numbers in a workbook beside it, for Edit Data',
  );
  const book = new Zip(new Zip(file).read('ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx')!);
  const sheet = book.read('xl/worksheets/sheet1.xml')?.toString() ?? '';
  ok(
    sheet.includes('<c r="B1" t="inlineStr"><is><t>North</t></is></c>') && sheet.includes('<c r="A3" t="inlineStr"><is><t>Q2</t></is></c><c r="B3"><v>18</v></c><c r="C3"><v>11</v></c>') && !!book.read('xl/workbook.xml'),
    'the workbook: labels down column A, a column per series, as the chart’s formulas say',
  );
  ok(part(file, '[Content_Types].xml').includes('<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>'), 'of a workbook’s type');
  const c2 = part(file, 'ppt/charts/chart2.xml');
  ok(c2.includes('<c:doughnutChart>') && !c2.includes('dLblPos') && c2.includes('<c:numFmt formatCode="0%" sourceLinked="0"/>'), 'a doughnut’s shares as percentages, where PowerPoint puts them (it takes no position for them)');
  const c3 = part(file, 'ppt/charts/chart3.xml');
  ok(c3.includes(`<c:size val="${Math.round(2 * Math.max(3, 18 / 4.5) * 0.75)}"/>`), 'a line’s dots as large as the app’s');
}

// ---- masters, layouts and the footer -----------------------------------------------------------------------------------
{
  const d = normalizeDeck({
    theme: 'paper',
    footer: { num: true, text: 'Acme', date: 'today', skipTitle: true },
    slides: [
      { layout: 'title', title: 'Hello', subtitle: 'World' },
      { layout: 'content', title: 'Points', text: '- One\n- Two' },
      { layout: 'image', title: 'No picture yet' },
      { layout: 'section', title: 'Part two' },
      { els: [{ type: 'text', role: 'title', x: 80, y: 40, w: 600, h: 80, text: 'Loose title' }] },
    ],
  });
  const file = pptxFile(d, { title: 'T', picture: () => null });
  const master = part(file, 'ppt/slideMasters/slideMaster1.xml');
  const types = part(file, '[Content_Types].xml');
  ok((master.match(/<p:sldLayoutId id="\d+" r:id="rId\d+"\/>/g) ?? []).length === 15 && (types.match(/slideLayout\d+\.xml" ContentType/g) ?? []).length === 15, 'every layout of the app’s is a layout of the file’s, for New Slide');
  ok(
    /<p:titleStyle><a:lvl1pPr [^>]*><a:lnSpc><a:spcPct val="91667"\/><\/a:lnSpc>[^]*?<a:defRPr sz="3450" b="1" kern="100"><a:solidFill><a:schemeClr val="tx2"\/><\/a:solidFill><a:latin typeface="\+mj-lt"\/>/.test(master),
    'the master’s titles as the app’s: its heading font and colour, its size and line height',
  );
  ok(master.includes('<p:ph type="dt" sz="half" idx="2"/>') && master.includes('<p:ph type="ftr" sz="quarter" idx="3"/>') && master.includes('<p:ph type="sldNum" sz="quarter" idx="4"/>'), 'the master has the footer’s placeholders');
  const lay = (n: number) => part(file, `ppt/slideLayouts/slideLayout${n}.xml`);
  ok(lay(1).includes('type="title"') && lay(1).includes('<p:cSld name="Title">') && lay(1).includes('<p:ph type="ctrTitle"/>') && lay(1).includes('<p:ph type="subTitle" idx="1"/>'), 'the Title layout: a title and a subtitle where the app puts them');
  ok(lay(2).includes('type="obj"') && lay(2).includes('<p:cSld name="Title and text">') && lay(2).includes('<p:ph idx="1"/>') && lay(2).includes(`<a:off x="${80 * 9525}" y="${196 * 9525}"/>`), 'Title and text: its text where the app’s is');
  ok(lay(4).includes('type="secHead"') && /<p:bg><p:bgPr><a:solidFill><a:srgbClr val="2F6FEC">/.test(lay(4)), 'a section’s layout in the accent colour');
  ok(lay(15).includes('type="blank"') && lay(15).includes('<p:ph type="sldNum" sz="quarter" idx="12"/>'), 'Blank has the footer’s placeholders too');
  const rel = (n: number) => /slideLayouts\/slideLayout(\d+)\.xml/.exec(part(file, `ppt/slides/_rels/slide${n}.xml.rels`))?.[1];
  ok(rel(1) === '1' && rel(2) === '2' && rel(3) === '6' && rel(5) === '15', 'each slide on the layout it was made from (Blank when made of parts)');
  const s1 = part(file, 'ppt/slides/slide1.xml');
  const s2 = part(file, 'ppt/slides/slide2.xml');
  const s3 = part(file, 'ppt/slides/slide3.xml');
  ok(s1.includes('<p:ph type="ctrTitle"/>') && s1.includes('<p:ph type="subTitle" idx="1"/>') && !s1.includes('type="sldNum"'), 'a title slide’s title and subtitle fill its placeholders; no footer on it');
  ok(s2.includes('<p:ph type="title"/>') && s2.includes('<p:ph idx="1"/>') && !/<p:ph[^>]*>[^]*?<p:ph type="title"\/>/.test(s2.replace(/<p:ph type="(dt|ftr|sldNum)"[^>]*\/>/g, '')), 'a slide’s title and text fill its layout’s, each once');
  ok(
    /<p:sp><p:nvSpPr><p:cNvPr id="\d+" name="Picture Placeholder \d+"\/><p:cNvSpPr><a:spLocks noGrp="1"\/><\/p:cNvSpPr><p:nvPr><p:ph type="pic" idx="1"\/><\/p:nvPr><\/p:nvSpPr><p:spPr><a:xfrm>/.test(s3),
    'a picture not given yet is a place to add one',
  );
  ok(
    s2.includes('<p:ph type="sldNum" sz="quarter" idx="12"/>') &&
      s2.includes('<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">') &&
      s2.includes('<p:ph type="ftr" sz="quarter" idx="11"/>') &&
      s2.includes('>Acme<') &&
      s2.includes('<p:ph type="dt" sz="half" idx="10"/>') &&
      s2.includes('type="datetime4"'),
    'the footer in the layout’s placeholders: the date and the number as fields',
  );
  ok(part(file, 'ppt/slides/slide5.xml').includes('<p:ph type="title"/>'), 'a slide made of parts has its first title as its title');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

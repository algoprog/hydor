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
import { normalizeDeck } from '../../shared/slides.ts';
import { langOf, pptxFile } from './pptx.ts';
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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

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
import { everyEl, normalizeDeck, plainText, type El } from '../../shared/slides.ts';
import { canCapture } from '../capture/index.ts';
import { chartPlan, langOf, pptxFile, shapeOutline, type Picture } from './pptx.ts';
import { deckRenders } from './slides-render.ts';
import { deckFromPptx } from './pptx-import.ts';
import { zipParts } from './ooxml.ts';
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

/**
 * A small .pptx in PowerPoint's own way, written here: a 4:3 deck whose slides' placeholders say nothing of their place
 * or look (the layout and master do), theme colours changed (lumMod, tint), a text box, Office Math, a freeform, a
 * hidden slide with PowerPoint's new comments, and a font it carries.
 */
function powerpointFile(): Buffer {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const rels = (list: [string, string, string][]) =>
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, t, to]) => `<Relationship Id="${id}" Type="${t.includes('://') ? t : R + t}" Target="${to}"/>`).join('')}</Relationships>`;
  const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
  const xf = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
  const ph = (id: number, name: string, p: string, paras: string, spPr = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${p}</p:nvPr></p:nvSpPr><p:spPr>${spPr}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  const para = (t: string, lvl = 0, rPr = '<a:rPr lang="en-US" dirty="0"/>') => `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r>${rPr}<a:t>${t}</a:t></a:r></a:p>`;
  const theme = `<a:theme ${NS} name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
  const master = `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}${ph(2, 'Title Placeholder 1', '<p:ph type="title"/>', para('Master title'), `${xf(571500, 381000, 8001000, 1143000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`)}${ph(3, 'Text Placeholder 2', '<p:ph type="body" idx="1"/>', para('Master text'), `${xf(571500, 1600200, 8001000, 4525963)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`)}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial"/><a:buChar char="•"/><a:defRPr sz="3200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="–"/><a:defRPr sz="2800"/></a:lvl2pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
  const layout = `<p:sldLayout ${NS} type="obj" preserve="1"><p:cSld name="Title and Content"><p:spTree>${GRP}${ph(2, 'Title 1', '<p:ph type="title"/>', para('Layout title'))}${ph(3, 'Content Placeholder 2', '<p:ph idx="1"/>', para('Layout text'), xf(571500, 1905000, 8001000, 4000000))}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
  const math = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><mc:Choice Requires="a14"><p:sp><p:nvSpPr><p:cNvPr id="6" name="TextBox 5"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xf(1000000, 5600000, 3000000, 600000)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a14:m><m:oMathPara xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:oMath><m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f></m:oMath></m:oMathPara></a14:m></a:p></p:txBody></p:sp></mc:Choice><mc:Fallback><p:sp><p:nvSpPr><p:cNvPr id="6" name="TextBox 5"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xf(1000000, 5600000, 3000000, 600000)}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>a/b</a:t></a:r></a:p></p:txBody></p:sp></mc:Fallback></mc:AlternateContent>`;
  const box = `<p:sp><p:nvSpPr><p:cNvPr id="4" name="TextBox 3"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xf(5000000, 5000000, 2000000, 500000)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"><a:tint val="40000"/></a:schemeClr></a:solidFill></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${para('A box')}</p:txBody></p:sp>`;
  const free = `<p:sp><p:nvSpPr><p:cNvPr id="5" name="Freeform 4"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xf(7000000, 4000000, 1000000, 1000000)}<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="50"/></a:lnTo><a:arcTo wR="20" hR="20" stAng="0" swAng="5400000"/><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="00AA00"/></a:solidFill></p:spPr></p:sp>`;
  const slide1 = `<p:sld ${NS}><p:cSld><p:spTree>${GRP}${ph(2, 'Title 1', '<p:ph type="title"/>', para('Hello'))}${ph(3, 'Content Placeholder 2', '<p:ph idx="1"/>', para('First') + para('Second', 1) + para('Darker', 0, '<a:rPr lang="en-US"><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill></a:rPr>'))}${box}${free}${math}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slide2 = `<p:sld ${NS} show="0"><p:cSld><p:spTree>${GRP}${ph(2, 'Title 1', '<p:ph type="title"/>', para('Hidden'))}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const P188 = 'xmlns:p188="http://schemas.microsoft.com/office/powerpoint/2018/8/main"';
  const comments = `<p188:cmLst ${NS} ${P188}><p188:cm id="{11111111-1111-1111-1111-111111111111}" authorId="{A}" created="2026-01-02T03:04:05.000" status="resolved"><p188:replyLst><p188:reply id="{22222222-2222-2222-2222-222222222222}" authorId="{B}" created="2026-01-03T03:04:05.000"><p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>A reply</a:t></a:r></a:p></p188:txBody></p188:reply></p188:replyLst><p188:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Modern comment</a:t></a:r></a:p></p188:txBody></p188:cm></p188:cmLst>`;
  const authors = `<p188:authorLst ${NS} ${P188}><p188:author id="{A}" name="Ana" initials="A" userId="ana" providerId="None"/><p188:author id="{B}" name="Agent" initials="Ag" userId="agent" providerId="None"/></p188:authorLst>`;
  const pres = `<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId3"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/><p:embeddedFontLst><p:embeddedFont><p:font typeface="Brand Sans"/><p:regular r:id="rId9"/></p:embeddedFont></p:embeddedFontLst></p:presentation>`;
  const ct =
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>';
  return zipParts([
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', data: pres },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: rels([
        ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
        ['rId2', 'slide', 'slides/slide1.xml'],
        ['rId3', 'slide', 'slides/slide2.xml'],
        ['rId8', 'http://schemas.microsoft.com/office/2018/10/relationships/authors', 'authors.xml'],
      ]),
    },
    { name: 'ppt/authors.xml', data: authors },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: rels([
        ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', 'theme', '../theme/theme1.xml'],
      ]),
    },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
    { name: 'ppt/theme/theme1.xml', data: theme },
    { name: 'ppt/slides/slide1.xml', data: slide1 },
    { name: 'ppt/slides/_rels/slide1.xml.rels', data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) },
    { name: 'ppt/slides/slide2.xml', data: slide2 },
    {
      name: 'ppt/slides/_rels/slide2.xml.rels',
      data: rels([
        ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', 'http://schemas.microsoft.com/office/2018/10/relationships/comments', '../comments/modernComment_101_1.xml'],
      ]),
    },
    { name: 'ppt/comments/modernComment_101_1.xml', data: comments },
  ]);
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

// ---- guides ----------------------------------------------------------------------------------------------------------------
{
  const d = normalizeDeck({ guides: { x: [640], y: [100, 620] }, slides: [{ layout: 'blank' }] });
  const pres = part(pptxFile(d, { title: 'T', picture: () => null }), 'ppt/presentation.xml');
  ok(
    pres.includes('<p:ext uri="{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"><p15:sldGuideLst xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"><p15:guide id="1" orient="vert" pos="3840" userDrawn="1">') &&
      pres.includes('orient="horz" pos="3720"'),
    'the deck’s guides are PowerPoint’s guides, where they are',
  );
  ok(!part(pptxFile(normalizeDeck({ slides: [{ layout: 'blank' }] }), { title: 'T', picture: () => null }), 'ppt/presentation.xml').includes('sldGuideLst'), 'a deck without guides has none');
}

// ---- PowerPoint files opened as decks ----------------------------------------------------------------------------------
{
  // A deck of every kind of part comes back from its own PowerPoint file as it was.
  const pic: Picture = { data: png(40, 20, (x) => [x * 6, 100, 200, 255]), ext: 'png', w: 40, h: 20 };
  const d = normalizeDeck({
    theme: 'midnight',
    footer: { num: true, text: 'Acme', skipTitle: true },
    guides: { x: [640], y: [360] },
    slides: [
      { layout: 'title', title: 'Hello', subtitle: 'World', notes: 'Say hello' },
      {
        layout: 'content',
        title: 'Points',
        text: '- One **bold**\n  - Two\n1. Three',
        transition: { fx: 'push', dir: 'left', dur: 650 },
        extra: [
          { id: 'sh', type: 'shape', shape: 'chevron', x: 700, y: 400, w: 300, h: 100, text: 'Next', fill: 'c2', line: '#ff0000', lineW: 3, dash: 'dash', shadow: true },
          { id: 'st', type: 'shape', shape: 'star', x: 1050, y: 400, w: 100, h: 100, fill: 'accent', rot: 20 },
          { id: 'hb', type: 'shape', shape: 'heart', x: 1150, y: 520, w: 100, h: 100, fill: '#e5534b' },
          { id: 'im', type: 'image', src: 'naget-asset:0123456789abcdef', x: 100, y: 500, w: 200, h: 100, crop: { l: 0.1, t: 0, r: 0.2, b: 0 }, adjust: { gray: true }, flipH: true },
          { id: 'cv', type: 'image', src: 'naget-asset:0123456789abcdef', x: 320, y: 500, w: 100, h: 100 },
          { id: 'ct', type: 'image', src: 'naget-asset:0123456789abcdef', x: 440, y: 500, w: 100, h: 100, fit: 'contain' },
          { id: 'cn', type: 'connector', from: { el: 'sh', at: 'r' }, to: { el: 'hb', at: 'l' }, end: 'arrow', width: 2 },
          { id: 'ic', type: 'icon', icon: 'star', paths: [['path', { d: 'M12 2l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z' }]], x: 600, y: 600, w: 80, h: 80, color: 'c3', lineW: 3 },
          { id: 'eq', type: 'math', tex: 'E = mc^2', x: 700, y: 560, w: 200, h: 80 },
          { id: 'yt', type: 'video', src: 'https://youtu.be/dQw4w9WgXcQ', x: 900, y: 560, w: 160, h: 90 },
        ],
        anims: [{ el: 'sh', type: 'in', fx: 'fly', dir: 'left', on: 'click', dur: 600, delay: 0 }],
      },
      {
        transition: 'morph',
        hidden: true,
        bg: { color: '#102030', to: '#405060', angle: 90 },
        els: [
          { id: 'sh2', key: 'sh', type: 'shape', shape: 'chevron', x: 100, y: 100, w: 300, h: 100, text: 'Next', fill: 'c2' },
          {
            id: 'tb',
            type: 'table',
            x: 100,
            y: 300,
            w: 600,
            h: 120,
            rows: [
              ['A', 'B', 'C'],
              ['d', 'e', 'f'],
            ],
            merges: [{ r: 1, c: 0, rs: 1, cs: 2 }],
            fills: { '1,2': '#ff0000' },
          },
          {
            id: 'ch',
            type: 'chart',
            kind: 'bar',
            x: 700,
            y: 300,
            w: 400,
            h: 300,
            title: 'Sales',
            labels: ['Q1', 'Q2'],
            series: [
              { name: 'North', values: [3, 5] },
              { name: 'South', values: [2, 1], color: '#123456' },
            ],
            stacked: true,
            values: true,
          },
          {
            id: 'gp',
            type: 'group',
            x: 800,
            y: 50,
            els: [
              { type: 'text', x: 0, y: 0, w: 200, h: 50, text: 'In a group', size: 20 },
              { type: 'shape', shape: 'ellipse', x: 210, y: 0, w: 50, h: 50 },
            ],
          },
        ],
        comments: [{ id: 'c1', text: 'On the slide', x: 500, y: 40, replies: [{ by: 'agent', text: 'Seen' }] }],
      },
    ],
  });
  const file = pptxFile(d, { title: 'T', picture: () => pic, renders: new Map([['math:eq', pic]]) });
  const got = await deckFromPptx(file);
  const back = normalizeDeck(got.model);
  const s1 = back.slides[1];
  const find = (s: (typeof back.slides)[number], test: (e: El) => boolean) => everyEl(s.els).find(test);
  ok(back.ratio === '16:9' && back.theme.id === 'midnight' && back.theme.accent === d.theme.accent && back.theme.headFont === 'Space Grotesk' && back.theme.muted === d.theme.muted, 'its theme comes back as it was (this app’s own, by its name)');
  ok(back.slides.length === 3 && back.slides[0].layout === 'title' && back.slides[1].layout === 'content' && back.slides[2].layout === undefined && back.slides[2].hidden === true, 'its slides, their layouts, a hidden one');
  ok(JSON.stringify(back.footer) === JSON.stringify(d.footer) && JSON.stringify(back.guides) === JSON.stringify(d.guides), 'its footer (not on the title slide) and its guides');
  ok(back.slides[0].notes === 'Say hello' && JSON.stringify(s1.transition) === JSON.stringify({ fx: 'push', dir: 'left', dur: 650 }) && back.slides[2].transition?.fx === 'morph', 'its notes, and its transitions as they were, to the millisecond');
  const title = find(back.slides[0], (e) => e.type === 'text' && e.role === 'title') as Extract<El, { type: 'text' }>;
  const was = d.slides[0].els[0] as Extract<El, { type: 'text' }>;
  ok(
    title && title.x === was.x && title.y === was.y && title.w === was.w && title.size === was.size && plainText(title.paras) === 'Hello' && title.valign === 'bottom' && title.bold === true,
    'a title placeholder: its place, size, weight and anchor',
  );
  const body = find(s1, (e) => e.type === 'text' && e.role === 'body') as Extract<El, { type: 'text' }>;
  ok(
    body && body.paras.length === 3 && body.paras[0].list === 'bullet' && body.paras[1].lvl === 1 && body.paras[2].list === 'number' && body.paras[0].runs.some((r) => r.b && r.t === 'bold') && body.lh === 1.3 && body.gap === 12,
    'its text: bullets, levels, numbers, bold words, line height and space after',
  );
  const sh = find(s1, (e) => e.type === 'shape' && e.shape === 'chevron') as Extract<El, { type: 'shape' }>;
  ok(
    sh && sh.fill === 'c2' && sh.line === '#ff0000' && sh.lineW === 3 && sh.dash === 'dash' && sh.shadow === true && plainText(sh.paras) === 'Next',
    'a shape with words in it (its own outline) comes back as that shape, its fill, line, dashes and shadow',
  );
  ok(find(s1, (e) => e.type === 'shape' && e.shape === 'star' && e.rot === 20) && find(s1, (e) => e.type === 'shape' && e.shape === 'heart'), 'a star and a heart');
  const im = find(s1, (e) => e.type === 'image' && !!e.crop) as Extract<El, { type: 'image' }>;
  ok(im && im.crop?.l === 0.1 && im.crop.r === 0.2 && im.adjust?.gray === true && im.flipH === true && im.src.startsWith('data:image/png;base64,'), 'a picture: cropped, grey, flipped');
  const cv = find(s1, (e) => e.type === 'image' && e.x === 320) as Extract<El, { type: 'image' }>;
  const ct = find(s1, (e) => e.type === 'image' && e.x === 440) as Extract<El, { type: 'image' }>;
  ok(cv && !cv.crop && (cv.fit ?? 'cover') === 'cover' && ct?.fit === 'contain', 'pictures covering and fitted inside their boxes come back so');
  const cn = find(s1, (e) => e.type === 'line') as Extract<El, { type: 'line' }>;
  const hb = find(s1, (e) => e.type === 'shape' && e.shape === 'heart');
  ok(cn && cn.from?.el === sh.id && cn.from.at === 'r' && cn.to?.el === hb?.id && cn.to?.at === 'l' && cn.end === 'arrow', 'a connector, stuck to its shapes at their sides');
  const ic = find(s1, (e) => e.type === 'icon') as Extract<El, { type: 'icon' }>;
  ok(ic && ic.icon === 'star' && ic.color === 'c3' && ic.lineW === 3 && ic.paths[0][0] === 'path', 'an icon comes back as an icon: its lines, colour and width');
  ok(find(s1, (e) => e.type === 'math' && e.tex === 'E = mc^2') && find(s1, (e) => e.type === 'video' && e.src === 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'), 'an equation as its LaTeX, a YouTube video as that video');
  ok(s1.anims?.[0]?.fx === 'fly' && s1.anims[0].dir === 'left' && s1.anims[0].on === 'click' && s1.anims[0].el === sh.id, 'an animation, on its part');
  const s2 = back.slides[2];
  ok(s2.bg?.color === '#102030' && s2.bg.to === '#405060' && s2.bg.angle === 90, 'a gradient background');
  const sh2 = find(s2, (e) => e.type === 'shape') as Extract<El, { type: 'shape' }>;
  ok(!!sh.key && sh.key === sh2.key, 'Morph’s pairs stay paired');
  const tb = find(s2, (e) => e.type === 'table') as Extract<El, { type: 'table' }>;
  ok(
    tb &&
      JSON.stringify(tb.rows) ===
        JSON.stringify([
          ['A', 'B', 'C'],
          ['d', '', 'f'],
        ]) &&
      tb.merges?.[0].cs === 2 &&
      tb.fills?.['1,2'] === '#ff0000' &&
      tb.head === true,
    'a table: its cells, merged and coloured',
  );
  const ch = find(s2, (e) => e.type === 'chart') as Extract<El, { type: 'chart' }>;
  ok(
    ch && ch.kind === 'bar' && ch.title === 'Sales' && ch.stacked && ch.values && JSON.stringify(ch.labels) === '["Q1","Q2"]' && ch.series[1].color === '#123456' && !ch.series[0].color && ch.series[0].values[1] === 5,
    'a chart from its cached numbers, its own colours kept',
  );
  const gp = find(s2, (e) => e.type === 'group') as Extract<El, { type: 'group' }>;
  ok(gp && gp.els.length === 2 && gp.els[1].type === 'shape' && Math.abs(gp.els[1].x - 210) < 0.6, 'a group with its parts placed in it');
  ok(s2.comments?.[0]?.text === 'On the slide' && s2.comments[0].replies?.[0]?.by === 'agent' && s2.comments[0].x === 500, 'comments with their replies');
  ok(got.notes.length === 0, `nothing said to be left out: ${got.notes.join(' ')}`);
  // Bold first words, plain after them (as LibreOffice writes them: b="1", then b="0"): the box is not bold.
  const boldFirst = normalizeDeck((await deckFromPptx(pptxFile(normalizeDeck({ slides: [{ els: [{ type: 'text', x: 0, y: 0, w: 500, h: 100, text: '**Bold** and plain' }] }] }), { title: 'T', picture: () => null }))).model);
  const bf = boldFirst.slides[0].els[0] as Extract<El, { type: 'text' }>;
  ok(!bf.bold && bf.paras[0].runs[0].b === true && !bf.paras[0].runs[1].b, 'bold first words keep the rest plain');

  // A file in PowerPoint's own way: placeholders that take their place and look from their layout and master.
  const pp = powerpointFile();
  const imp = await deckFromPptx(pp);
  const pd = normalizeDeck(imp.model);
  const [p1, p2] = pd.slides;
  ok(pd.ratio === '4:3' && pd.theme.font === 'Arial' && pd.theme.headFont === 'Georgia' && pd.theme.accent === '#4f81bd', 'a PowerPoint file’s theme: its fonts and colours');
  const pt = find(p1, (e) => e.type === 'text' && e.role === 'title') as Extract<El, { type: 'text' }>;
  // A 10-inch slide 1280 px wide: 128 px an inch.
  ok(pt && pt.x === 80 && Math.abs(pt.y - 53.33) < 0.01 && Math.abs(pt.size - (44 / 72) * 128) < 0.1 && (pt.font ?? pd.theme.headFont) === 'Georgia', `a title placeholder in its master’s place, size and font: ${pt?.x},${pt?.y} ${pt?.size}`);
  const pb = find(p1, (e) => e.type === 'text' && e.role === 'body') as Extract<El, { type: 'text' }>;
  ok(pb && Math.abs(pb.y - 266.67) < 0.01 && pb.paras[0].list === 'bullet' && pb.paras[1].lvl === 1 && Math.abs(pb.size - (32 / 72) * 128) < 0.1, 'a body placeholder in its layout’s place, with its master’s bullets and size');
  // Office's "Accent 1, darker 25%" of 4F81BD is 366092.
  ok(/^#3[67]6092$/.test(String(pb.paras[2].runs[0].color)), `a theme colour made darker (lumMod): ${pb?.paras[2].runs[0].color}`);
  const tint = find(p1, (e) => e.type === 'text' && !!e.fill) as Extract<El, { type: 'text' }>;
  ok(tint && /^#[0-9a-f]{6}$/.test(String(tint.fill)) && tint.fill !== '#4f81bd', `a theme colour made lighter (tint, in linear light): ${tint?.fill}`);
  ok(find(p1, (e) => e.type === 'math' && e.tex.includes('\\frac')) !== undefined, 'PowerPoint’s equation as LaTeX');
  ok(find(p1, (e) => e.type === 'image' && e.src.startsWith('data:image/svg+xml')) !== undefined && imp.notes.some((n) => /Freeform/.test(n)), 'a freeform as a picture of it, and said so');
  ok(p2.hidden === true && p2.comments?.[0].text === 'Modern comment' && p2.comments[0].replies?.[0].text === 'A reply' && p2.comments[0].resolved === true, 'PowerPoint’s new comments, their replies and whether they are resolved');
  ok(
    imp.notes.some((n) => /carries the fonts Brand Sans/.test(n)),
    'the fonts it carries are named in the notes',
  );
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

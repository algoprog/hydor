// Script tests for Word and Excel files that look in Office as they do in the app: a document's fonts embedded as Word
// embeds them (obfuscated, only the faces it uses) with Word's fallbacks for each, its layout as the editor's (lines in
// points, spaces that collapse as Word's do, lists, quotes, code, callouts, tables, pictures, contents, header and
// footer), its parts in the order Word's schema has them, and the file read back as it was written. Build and run with a
// scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/word-excel-test.ts
//   DATA_DIR=/tmp/hydor-test-word-excel node dist/dev/word-excel-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { docCss, docFonts, normalizeDoc, type Block, type Doc, type ParaBlock, type Run, type TableBlock } from '../../shared/docs.ts';
import { canCapture, closeCapture, setCaptureIdle, withTab } from '../capture/index.ts';
import { openDb } from '../db.ts';
import { Zip } from '../documents/zip.ts';
import { docFaces, docFromFile, docPage, docxOfDoc } from './docs.ts';
import { fontInfo, fontKey, obfuscate, officeFont, ttfInfo, wordFonts, type EmbeddedFont } from './word-fonts.ts';
import { wordPlaces } from './word-layout.ts';
import { normalizeBook, type Workbook } from '../../shared/sheets.ts';
import { importBook, xlsxOfBook } from './sheets.ts';
import { zipParts } from './ooxml.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string, extra?: unknown) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 600)}` : ''}`);
  }
};

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-word-excel-test-')));
const db = openDb(path.join(tmp, 'test.db'));

/** A TrueType file with only the tables what Word is told of a font is read from (head, hhea, OS/2, post, name). */
function fakeTtf(family: string, m: { upm?: number; winAscent: number; winDescent: number; ascender: number; descender: number; lineGap?: number; fixed?: boolean; fsType?: number }): Buffer {
  const upm = m.upm ?? 1000;
  const head = Buffer.alloc(54);
  head.writeUInt16BE(upm, 18);
  const hhea = Buffer.alloc(36);
  hhea.writeInt16BE(m.ascender, 4);
  hhea.writeInt16BE(m.descender, 6);
  hhea.writeInt16BE(m.lineGap ?? 0, 8);
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(4, 0);
  os2.writeUInt16BE(m.fsType ?? 0, 8);
  os2.writeInt16BE(8 << 8, 30);
  Buffer.from([2, 11, 5, 2, 3, 0, 0, 0, 0, 4]).copy(os2, 32);
  os2.writeUInt32BE(0xe0000aff, 42);
  os2.writeUInt16BE(m.winAscent, 74);
  os2.writeUInt16BE(m.winDescent, 76);
  os2.writeUInt32BE(1, 78);
  const post = Buffer.alloc(32);
  post.writeUInt32BE(m.fixed ? 1 : 0, 12);
  const nameStr = Buffer.from(family, 'utf16le').swap16();
  const name = Buffer.alloc(6 + 12 + nameStr.length);
  name.writeUInt16BE(1, 2);
  name.writeUInt16BE(18, 4);
  [3, 1, 0x409, 1, nameStr.length, 0].forEach((v, k) => name.writeUInt16BE(v, 6 + k * 2));
  nameStr.copy(name, 18);
  const tables: [string, Buffer][] = [
    ['OS/2', os2],
    ['head', head],
    ['hhea', hhea],
    ['name', name],
    ['post', post],
  ];
  const dir = Buffer.alloc(12 + tables.length * 16);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(tables.length, 4);
  let off = dir.length;
  const bodies: Buffer[] = [];
  tables.forEach(([tag, data], k) => {
    dir.write(tag, 12 + k * 16, 'latin1');
    dir.writeUInt32BE(off, 12 + k * 16 + 8);
    dir.writeUInt32BE(data.length, 12 + k * 16 + 12);
    bodies.push(data);
    off += data.length;
  });
  return Buffer.concat([dir, ...bodies]);
}

const xmlOf = (file: Buffer, part: string) => new Zip(file).text(part) ?? '';
const words = (b: Block | undefined) => (b && (b.type === 'p' || b.type === 'li') ? b.runs.map((r) => r.t).join('') : '');
/** A paragraph's properties in the document, by (the start of) its words. */
const pPrOf = (xml: string, text: string) => {
  const i = xml.indexOf(`>${text}`);
  const p = xml.lastIndexOf('<w:p>', i);
  const pPr = /^<w:p><w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml.slice(p));
  return pPr ? pPr[1] : '';
};

// The order Word's schema gives a paragraph's and a run's properties (ECMA-376 CT_PPrBase, CT_RPr): Word refuses (or
// "repairs") a file with them in another order.
const P_ORDER = [
  'pStyle',
  'keepNext',
  'keepLines',
  'pageBreakBefore',
  'framePr',
  'widowControl',
  'numPr',
  'suppressLineNumbers',
  'pBdr',
  'shd',
  'tabs',
  'suppressAutoHyphens',
  'kinsoku',
  'wordWrap',
  'overflowPunct',
  'topLinePunct',
  'autoSpaceDE',
  'autoSpaceDN',
  'bidi',
  'adjustRightInd',
  'snapToGrid',
  'spacing',
  'ind',
  'contextualSpacing',
  'mirrorIndents',
  'suppressOverlap',
  'jc',
  'textDirection',
  'textAlignment',
  'textboxTightWrap',
  'outlineLvl',
  'divId',
  'cnfStyle',
  'rPr',
  'sectPr',
  'pPrChange',
];
const R_ORDER = [
  'rStyle',
  'rFonts',
  'b',
  'bCs',
  'i',
  'iCs',
  'caps',
  'smallCaps',
  'strike',
  'dstrike',
  'outline',
  'shadow',
  'emboss',
  'imprint',
  'noProof',
  'snapToGrid',
  'vanish',
  'webHidden',
  'color',
  'spacing',
  'w',
  'kern',
  'position',
  'sz',
  'szCs',
  'highlight',
  'u',
  'effect',
  'bdr',
  'shd',
  'fitText',
  'vertAlign',
  'rtl',
  'cs',
  'em',
  'lang',
  'eastAsianLayout',
  'specVanish',
  'oMath',
  'ins',
  'del',
  'rPrChange',
];
/** The first properties element (pPr or rPr) whose children are out of the schema's order, or null. */
function misordered(xml: string): string | null {
  for (const [tag, order] of [
    ['pPr', P_ORDER],
    ['rPr', R_ORDER],
  ] as const) {
    for (const m of xml.matchAll(new RegExp(`<w:${tag}>(.*?)</w:${tag}>`, 'g'))) {
      // Its own children: what nests inside them (a mark's rPr, a border's sides) taken out first.
      const own = m[1].replace(/<w:(pBdr|tabs|numPr|rPr|pPrChange|rPrChange)>[\s\S]*?<\/w:\1>/g, '<w:$1/>');
      const kids = [...own.matchAll(/<w:([A-Za-z]+)[\s/>]/g)].map((k) => k[1]);
      const at = kids.map((k) => order.indexOf(k as never));
      if (at.some((x, i) => x < 0 || (i && x < at[i - 1]))) return m[0].slice(0, 300);
    }
  }
  return null;
}

// ---- fonts ------------------------------------------------------------------------------------------------------
{
  const inter = fakeTtf('Inter', { upm: 2048, winAscent: 2269, winDescent: 660, ascender: 1984, descender: -494 });
  const info = ttfInfo(inter);
  ok(info?.family === 'Inter' && info.panose === '020B0502030000000004' && info.family2 === 'swiss' && info.pitch === 'variable', 'a font file says its family, PANOSE numbers, kind and pitch', info);
  ok(info?.line === 1.43 && info.sig?.[0] === 'E0000AFF' && info.sig[4] === '00000001', "and Word's single line (its Windows metrics) and what it covers", info);
  const gap = ttfInfo(fakeTtf('Gap', { winAscent: 1009, winDescent: 324, ascender: 1036, descender: -335 }));
  ok(gap?.line === 1.371, "hhea's taller line is Word's external leading", gap?.line);
  ok(ttfInfo(fakeTtf('Mono', { winAscent: 1020, winDescent: 300, ascender: 1020, descender: -300, fixed: true }))?.family2 === 'modern', 'a fixed-pitch font is modern');
  ok(ttfInfo(fakeTtf('Locked', { winAscent: 900, winDescent: 300, ascender: 900, descender: -300, fsType: 2 })) === null && ttfInfo(Buffer.from('not a font')) === null, 'a font that may not be embedded, and what is not a font, are none');
  // Obfuscation (ECMA-376 17.8.1): the first 32 bytes XORed with the key's bytes from its last pair of digits to its first.
  const key = '{01020304-0506-0708-090A-0B0C0D0E0F10}';
  const zero = Buffer.alloc(40);
  const o = obfuscate(zero, key);
  ok(o[0] === 0x10 && o[15] === 0x01 && o[16] === 0x10 && o[31] === 0x01 && o[32] === 0, 'a font is obfuscated with its key as Word does', [...o.subarray(0, 4)]);
  ok(obfuscate(o, key).equals(zero) && /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/.test(fontKey()), 'and the same again undoes it; keys are GUIDs');
  ok(officeFont('Inter') === 'Arial' && officeFont('lora') === 'Georgia' && officeFont('JetBrains Mono') === 'Consolas' && officeFont('Calibri') === 'Calibri', "the Office font closest to each of the app's");
  const off = fontInfo('Merriweather');
  ok(off.family === 'Merriweather' && off.line === 1.732 && off.family2 === 'roman' && !off.panose, "without its file, a font of the app's has its Word line and kind", off);
  ok(fontInfo('Arial').panose === '020B0604020202020204' && fontInfo('Times New Roman').family2 === 'roman', "Office's fonts as Word writes them");

  // A document's faces: its font, bold for headings, italic for quotes, its words' own, its code's.
  const d = normalizeDoc({
    font: 'Inter',
    blocks: [
      { h1: 'Head' },
      { quote: 'Said' },
      {
        p: [
          { t: 'a', b: true, i: true },
          { t: 'b', font: 'Lora' },
          { t: 'c', code: true },
        ],
      },
    ],
  });
  const faces = docFaces(d).map((f) => `${f.name}${f.b ? ' b' : ''}${f.i ? ' i' : ''}`);
  ok(['Inter', 'Inter b', 'Inter i', 'Inter b i', 'Lora', 'JetBrains Mono'].every((f) => faces.includes(f)) && faces.length === 6, 'a document uses the faces it shows, no more', faces);

  // Embedded: each face a part of its own, obfuscated, named in the font table with Word's fallbacks.
  const bold = fakeTtf('Inter', { upm: 2048, winAscent: 2269, winDescent: 660, ascender: 1984, descender: -494 });
  const fonts = new Map<string, EmbeddedFont>([['Inter', { info: info!, faces: { regular: inter, bold } }]]);
  const file = docxOfDoc(db, d, 'Fonts', undefined, fonts);
  const zip = new Zip(file);
  const table = zip.text('word/fontTable.xml') ?? '';
  const entry = /<w:font w:name="Inter">([\s\S]*?)<\/w:font>/.exec(table)?.[1] ?? '';
  ok(
    entry.startsWith('<w:altName w:val="Arial"/><w:panose1 w:val="020B0502030000000004"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/><w:sig '),
    "the font table gives Word each font's fallbacks, in its schema's order",
    entry.slice(0, 300),
  );
  const reg = /<w:embedRegular r:id="(rId\d+)" w:fontKey="(\{[^"]+\})"\/>/.exec(entry);
  ok(reg && /<w:embedBold r:id="rId\d+" w:fontKey="\{[^"]+\}"\/>/.test(entry) && !entry.includes('embedItalic'), 'and embeds the faces it uses, each with a key of its own', entry);
  const target = new RegExp(`Id="${reg?.[1]}" Type="[^"]+/font" Target="(fonts/[^"]+)"`).exec(zip.text('word/_rels/fontTable.xml.rels') ?? '')?.[1];
  const part = target ? zip.read(`word/${target}`) : null;
  ok(part && reg && obfuscate(part, reg[2]).equals(inter) && !part.equals(inter), 'the face is in the file as Word reads it, obfuscated with its key');
  ok(
    /<Default Extension="odttf" ContentType="application\/vnd\.openxmlformats-officedocument\.obfuscatedFont"\/>/.test(zip.text('[Content_Types].xml') ?? '') && (zip.text('word/settings.xml') ?? '').includes('<w:embedTrueTypeFonts/>'),
    'Word is told the file carries its fonts',
  );
  ok(/<w:font w:name="JetBrains Mono"><w:altName w:val="Consolas"\/>/.test(table) && /<w:font w:name="Lora"><w:altName w:val="Georgia"\/>/.test(table), 'fonts not embedded (offline) are named with the Office font closest to them');
  const offline = docxOfDoc(db, d, 'Fonts');
  ok(
    !xmlOf(offline, 'word/settings.xml').includes('embedTrueTypeFonts') && !new Zip(offline).names().some((n) => n.endsWith('.odttf')) && xmlOf(offline, 'word/fontTable.xml').includes('<w:font w:name="Inter"><w:altName w:val="Arial"/>'),
    'without its fonts at hand a file still names them, with their fallbacks',
  );
}

// ---- fonts fetched from Google ---------------------------------------------------------------------------------------
{
  // Google, stood in for: its stylesheet as it serves programs that are not browsers (a TrueType file a face), the files.
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  const face = (w: number) => fakeTtf('Lora', { winAscent: 1206 + w, winDescent: 294, ascender: 1006, descender: -274 });
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.startsWith('https://fonts.googleapis.com/css2?family=Lora:')) {
      const block = (style: string, weight: number) =>
        `@font-face {\n  font-family: 'Lora';\n  font-style: ${style};\n  font-weight: ${weight};\n  font-stretch: normal;\n  src: url(https://fonts.gstatic.com/s/lora/v37/${style}${weight}.ttf) format('truetype');\n}\n`;
      return new Response(block('normal', 400) + block('normal', 700) + block('italic', 400));
    }
    const m = /\/s\/lora\/v37\/(normal|italic)(\d+)\.ttf$/.exec(url);
    if (m) return new Response(new Uint8Array(face(Number(m[2]))));
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  const got = await wordFonts([
    { name: 'Lora', b: false, i: false },
    { name: 'Lora', b: true, i: false },
    { name: 'Lora', b: true, i: true },
    { name: 'Arial', b: false, i: false },
  ]);
  const lora = got.get('Lora');
  ok(
    lora?.faces.regular?.equals(face(400)) && lora.faces.bold?.equals(face(700)) && !lora.faces.boldItalic && !lora.faces.italic && lora.info.family === 'Lora' && !got.has('Arial'),
    "the faces a file uses of the app's fonts, from Google (a face it lacks left out); Office's own not fetched",
    [...got.keys()],
  );
  const before = asked.length;
  await wordFonts([{ name: 'Lora', b: false, i: false }]);
  ok(asked.length === before, 'and kept: fetched once');
  const t0 = Date.now();
  const none = await wordFonts([
    { name: 'Fraunces', b: false, i: false },
    { name: 'Playfair Display', b: false, i: false },
  ]);
  const tried = asked.length - before;
  await wordFonts([{ name: 'Merriweather', b: false, i: false }]);
  ok(!none.size && tried === 1 && asked.length - before === 1 && Date.now() - t0 < 5000, 'Google out of reach: a file is made at once without them, and the next ones do not wait on it either', [tried, asked.length - before]);
  globalThis.fetch = realFetch;
}

// ---- layout ------------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    font: 'Inter',
    size: 11,
    header: { text: 'Head', align: 'right' },
    footer: 'Page {page}',
    blocks: [
      { title: 'Title' },
      { h1: 'One' },
      { p: 'Body words.' },
      { bullets: ['Item one', ['Item deeper']] },
      { numbers: ['First'] },
      { h2: 'After a list' },
      {
        table: [
          ['A', 'B'],
          ['1', '2'],
        ],
      },
      { p: 'After a table.' },
      { table: [['C'], ['3']] },
      { table: [['D'], ['4']] },
      { pagebreak: true },
      { h1: 'New page' },
      { quote: 'Quoted.' },
      { code: 'let x = 1' },
      { callout: 'Mind this.' },
      { checks: ['Open', '[x] Done', ['[x] Deeper']] },
      { pagebreak: true },
      { table: [['After a break']] },
      { p: 'Last.' },
    ],
  });
  const file = docxOfDoc(db, d, 'Layout');
  const xml = xmlOf(file, 'word/document.xml');
  const styles = xmlOf(file, 'word/styles.xml');
  const style = (id: string) => new RegExp(`<w:style w:type="paragraph" w:styleId="${id}">[\\s\\S]*?</w:style>`).exec(styles)?.[0] ?? '';
  ok(
    styles.includes('<w:pPrDefault><w:pPr><w:widowControl/><w:spacing w:before="0" w:after="132" w:line="319" w:lineRule="atLeast"/></w:pPr></w:pPrDefault>'),
    "body text's lines are the editor's 1.45 (at least 15.95pt), .6em after, two lines at least on a page",
    styles.slice(0, 900),
  );
  ok(
    /<w:rFonts w:ascii="Inter" w:hAnsi="Inter" w:cs="Inter"\/><w:color w:val="1F2328"\/><w:kern w:val="2"\/><w:sz w:val="22"\/>/.test(styles) && styles.includes('<w14:ligatures w14:val="standardContextual"/>'),
    "the document's font, ink, kerning and ligatures as a browser sets words",
  );
  ok(
    style('Heading1').includes('<w:keepNext/><w:keepLines/><w:spacing w:before="356" w:after="139" w:line="495" w:lineRule="exact"/>'),
    "a heading's lines exactly the editor's where Word's own for the font are taller (Inter's), kept with what follows",
    style('Heading1'),
  );
  ok(style('Title').includes('<w:keepNext/>') && style('Subtitle').includes('<w:keepNext/>'), 'the title and subtitle go on with what follows them, as on the editor’s pages');
  const arial = xmlOf(docxOfDoc(db, normalizeDoc({ font: 'Arial', blocks: [{ h1: 'x' }] }), 'A'), 'word/styles.xml');
  ok(/w:styleId="Heading1">[\s\S]*?<w:spacing w:before="356" w:after="139" w:line="495" w:lineRule="atLeast"\/>/.test(arial), "and at least the editor's where Word's line is not taller (Arial's)");
  // Spaces collapse in Word as in the editor: only what the layout needs beyond the styles is said.
  ok(pPrOf(xml, 'One') === '<w:pStyle w:val="Heading1"/>' && pPrOf(xml, 'Body words.') === '', 'blocks spaced as their styles say carry no spacing of their own');
  // Heading 2 is 1.45 × 11pt: .6 of its em is 9.57pt.
  ok(pPrOf(xml, 'After a list').includes('<w:spacing w:before="191"/>'), 'a block after a list starts .6 of its em below it, as in the editor', pPrOf(xml, 'After a list'));
  ok(pPrOf(xml, 'After a table.').includes('<w:spacing w:before="198"/>'), 'a paragraph after a table is the table’s .9em below it', pPrOf(xml, 'After a table.'));
  ok(
    /<\/w:tbl><w:p><w:pPr><w:spacing w:before="178" w:after="0" w:line="20" w:lineRule="exact"\/><w:rPr><w:sz w:val="2"\/><w:szCs w:val="2"\/><\/w:rPr><\/w:pPr><\/w:p><w:tbl>/.test(xml),
    'two tables are kept apart by a paragraph a point high, the gap the editor leaves',
  );
  ok(
    pPrOf(xml, 'New page').startsWith('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/><w:spacing w:before="0"/>') && !xml.includes('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'),
    'a page break starts the next paragraph on a new page, at its top',
    pPrOf(xml, 'New page'),
  );
  ok(/<w:br w:type="page"\/><\/w:r><\/w:p><w:tbl>/.test(xml), 'and before a table, a paragraph a point high breaks the page');
  const twice = normalizeDoc({ blocks: [{ p: 'One' }, { pagebreak: true }, { pagebreak: true }, { p: 'Three' }] });
  const tx = xmlOf(docxOfDoc(db, twice, 'T'), 'word/document.xml');
  ok((tx.match(/<w:pageBreakBefore\/>/g) ?? []).length === 2 && docFromFile(docxOfDoc(db, twice, 'T'), 'T.docx').blocks.filter((b) => b.type === 'pagebreak').length === 2, 'two page breaks in a row keep the empty page between them, there and back');
  const sect = /<w:pgMar [^>]*\/>/.exec(xml)?.[0] ?? '';
  ok(sect.includes('w:top="1440"') && sect.includes('w:header="612" w:footer="612"'), 'the header and footer sit in the middle of the margins, as the editor draws them', sect);
  ok(
    style('Quote').includes('<w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="D0D7DE"/></w:pBdr>') && style('Quote').includes('<w:ind w:left="245" w:right="0"/>'),
    "a quote's line on its left and its words .9em from it, as in the editor",
    style('Quote'),
  );
  ok(
    style('Code').includes('<w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>') && style('Code').includes('<w:rFonts w:ascii="JetBrains Mono" w:hAnsi="JetBrains Mono" w:cs="JetBrains Mono"/><w:sz w:val="20"/>'),
    'code is in JetBrains Mono at .9em, on its tint',
    style('Code'),
  );
  const callout = pPrOf(xml, '💡');
  ok(
    callout.includes('<w:keepLines/>') && callout.includes('w:space="8" w:color="FEF7E0"') && callout.includes('<w:ind w:left="616" w:right="230" w:hanging="440"/>') && xml.includes('Segoe UI Emoji'),
    "a callout's emoji .8em in and its words 2.8em in on every line, its tint all round",
    callout,
  );
  const numbering = xmlOf(file, 'word/numbering.xml');
  ok(
    numbering.includes('<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="center"/><w:pPr><w:ind w:left="352" w:hanging="231"/></w:pPr></w:lvl>') &&
      numbering.includes('<w:ind w:left="1072" w:hanging="231"/>'),
    "a list's bullets centred where the editor draws them, its words 1.6em in, a step (36pt) a level",
    numbering.slice(0, 600),
  );
  ok(/<w:numFmt w:val="decimal"\/><w:lvlText w:val="%1\."\/><w:lvlJc w:val="left"\/><w:pPr><w:ind w:left="352" w:hanging="352"\/>/.test(numbering), "and numbers at the mark's place");
  ok(
    /<w14:checkedState w14:val="2611" w14:font="Segoe UI Symbol"\/>/.test(xml) && /<w:rStyle w:val="DoneItem"\/><w:lang|<w:rStyle w:val="DoneItem"\/>/.test(xml) && styles.includes('<w:rPr><w:strike/><w:color w:val="80868B"/></w:rPr>'),
    "a checklist's box Word ticks, a done item's words struck and grey",
  );
  ok(pPrOf(xml, '').length >= 0 && xml.includes('<w:ind w:left="1072" w:hanging="352"/>'), "a deeper item's box a step further in");
  const tbl = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml)?.[0] ?? '';
  ok(
    tbl.includes('<w:gridCol w:w="4513"/><w:gridCol w:w="4513"/>') && tbl.includes('<w:top w:w="77" w:type="dxa"/><w:left w:w="121" w:type="dxa"/>') && tbl.includes('w:sz="6" w:space="0" w:color="D0D7DE"') && tbl.includes('w:fill="F3F5F7"'),
    "a table's columns even (as the editor draws them), its cells' padding, lines and header as the editor's",
    tbl.slice(0, 900),
  );
  ok(misordered(xml) === null && misordered(styles) === null, "every paragraph's and run's properties in the schema's order", misordered(xml) ?? misordered(styles));
  ok(!xml.includes('w:dirty'), 'nothing asks Word to update fields when the file opens');
  // The layout's spaces, as numbers.
  const places = wordPlaces(d, d.blocks);
  const at = (text: string) => places[d.blocks.findIndex((b) => words(b) === text)].before;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  ok(near(at('One'), 0.9 * 19.8) && near(at('After a list'), 0.6 * 15.95) && at('Title') === 0, 'a heading is its style’s .9em below, after a list .6em, the first block at the top', [at('One'), at('After a list'), at('Title')]);

  // A table's rows a cell is merged down over stay together; a document's pictures say where they go, at their share of the width.
  const merged = normalizeDoc({
    blocks: [
      {
        table: [
          [{ text: 'Tall', rs: 2 }, 'a'],
          ['', 'b'],
          ['c', 'd'],
        ],
      },
    ],
  });
  const mx = xmlOf(docxOfDoc(db, merged, 'M'), 'word/document.xml');
  const rows = [...mx.matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  ok(rows[0].includes('<w:keepNext/>') && !rows[1].includes('<w:keepNext/>') && !rows[2].includes('<w:keepNext/>'), 'rows a cell is merged down over are kept together on a page');
}

// ---- equations, languages, contents ---------------------------------------------------------------------------------
{
  const d = normalizeDoc({ font: 'Lora', size: 12, blocks: [{ toc: true }, { h1: 'Part' }, { math: 'x^2' }, { p: [{ t: 'Area ' }, { t: '\\pi r^2', math: true }] }, { p: 'Καλημέρα κόσμε' }, { p: '你好，世界' }] });
  const file = docxOfDoc(db, d, 'Lang');
  const xml = xmlOf(file, 'word/document.xml');
  ok(
    /<m:oMathPara><m:oMath><m:sSup><m:e><m:r><w:rPr><w:sz w:val="29"\/><w:szCs w:val="29"\/><\/w:rPr><m:t/.test(xml) && /<m:r><w:rPr><w:sz w:val="26"\/><w:szCs w:val="26"\/><\/w:rPr><m:t xml:space="preserve">π/.test(xml),
    'equations are as large as the editor draws them (1.21em on a line of their own, 1.1em among words)',
  );
  ok(
    xml.includes('<w:lang w:val="el-GR"/>') && xml.includes('<w:lang w:eastAsia="zh-CN"/>') && xmlOf(file, 'word/styles.xml').includes('w:eastAsia="Microsoft YaHei"'),
    "Greek and Chinese words say their language; Chinese ones have Office's Chinese font",
  );
  ok(xml.includes(' TOC \\o "1-3" \\h \\z \\u \\n "1-3" ') && !xml.includes('w:leader="dot"'), 'a table of contents lists its headings without page numbers, as the editor does, and shows as it is');
  const back = docFromFile(file, 'Lang.docx');
  ok(back.blocks[0].type === 'toc' && back.blocks.some((b) => b.type === 'math'), 'and comes back as one');
}

// ---- back from Word -----------------------------------------------------------------------------------------------
{
  // What a document says, without what a round trip may rename.
  const shape = (d: Doc) =>
    d.blocks.map((b) => {
      const { id: _i, ...x }: Record<string, unknown> = { ...b };
      const run = ({ cm, ins, del, fmt, ...r }: Run) => ({ ...r, ...(cm ? { cm: 1 } : {}), ...(ins ? { ins: 1 } : {}), ...(del ? { del: 1 } : {}), ...(fmt ? { fmt: 1 } : {}) });
      if (b.type === 'p' || b.type === 'li') x.runs = b.runs.map(run);
      if (b.type === 'table') x.rows = b.rows.map((r) => r.map((c) => ({ ...c, runs: c.runs.map(run) })));
      if (b.type === 'image') x.src = 'picture';
      if (b.ins) x.ins = 1;
      if (b.del) x.del = 1;
      return x;
    });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP8z4AATAxYOAAk9AEHbhoYJgAAAABJRU5ErkJggg==';
  const d = normalizeDoc({
    font: 'Inter',
    blocks: [
      { p: [{ t: 'Code ' }, { t: 'x = 1', code: true }, { t: ' and a ' }, { t: 'link', link: 'https://example.com' }, { t: ' in ' }, { t: 'Courier', font: 'Courier New' }, { t: ' and ' }, { t: 'Mono', font: 'JetBrains Mono' }] },
      { checks: ['Open', '[x] Done', ['[x] Deeper', ['Deepest']]] },
      {
        type: 'table',
        head: true,
        cols: [3, 1],
        rows: [
          ['Name', 'Qty'],
          ['Beds', '4'],
        ],
      },
      {
        table: [
          ['C', 'D'],
          ['3', '4'],
        ],
      },
      { image: png, w: 0.3, align: 'left', caption: 'Left' },
      { image: png, w: 0.5 },
      { callout: 'Hot topic', icon: '🔥', tint: '#fce8e6' },
      { p: 'Own spacing', sb: 18, sa: 2, lh: 1.5 },
      { bullets: ['Item'] },
      { h2: 'Heading after a list' },
      { quote: 'A quote', sa: 20 },
      { pagebreak: true },
      { p: 'After a break' },
      { table: [['Added'], ['row']], ins: 's1' },
    ],
    suggestions: [{ id: 's1', by: 'user', author: 'Jun Park', at: 1_700_000_000_000 }],
  });
  const kept = normalizeDoc(JSON.parse(JSON.stringify(d)));
  const back = docFromFile(docxOfDoc(db, kept, 'Back'), 'Back.docx');
  const a = shape(kept);
  const b = shape(back);
  // A table's column shares come back within a twip of theirs (0.75 of 9026 twips is half a twip from a whole one).
  const cols = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'cols' ? (v as number[]).map((s) => Math.round(s * 1000) / 1000) : v));
  const diff = a.map((x, i) => (cols(x) === cols(b[i]) ? null : { was: x, came: b[i] })).filter(Boolean);
  ok(
    a.length === b.length && !diff.length,
    'a document comes back from its Word file as it was: code, links, fonts, checklists, header rows, tables side by side, pictures on the left, callouts, spacing, suggestions',
    diff[0] ?? [a.length, b.length],
  );
  const code = (back.blocks[0] as ParaBlock).runs.find((r) => r.code);
  ok(code && !code.hl && !code.size && !(back.blocks[0] as ParaBlock).runs.find((r) => r.link)?.color, "code's and links' looks are theirs, not their words' own");
  const after = back.blocks.findIndex((x) => words(x) === 'After a break');
  ok(after > 0 && (back.blocks[after] as ParaBlock).sb === undefined && back.blocks[after - 1].type === 'pagebreak', 'what starts a page has no space of its own above it');
  const t = back.blocks.find((x) => x.type === 'table') as TableBlock;
  ok(t.head && t.rows[0].every((c) => !c.fill && c.runs.every((r) => !r.b)), "a header row's bold and shading are the header's own");

  // A file made in Word: spacing of its own (a multiple of Word's line, or points) and a monospaced font for code.
  const foreign = normalizeDoc({ font: 'Calibri', blocks: [{ p: 'x' }] });
  const raw = xmlOf(docxOfDoc(db, foreign, 'F'), 'word/document.xml').replace('<w:p><w:r>', '<w:p><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/></w:rPr>');
  const zip = new Zip(docxOfDoc(db, foreign, 'F'));
  const parts = zip.names().map((n) => ({ name: n, data: n === 'word/document.xml' ? Buffer.from(raw) : zip.read(n)! }));
  const { zipParts } = await import('./ooxml.ts');
  const f = docFromFile(zipParts(parts), 'F.docx').blocks[0] as ParaBlock;
  ok(f.sa === 8 && f.lh === 1.15 && f.runs[0].code, "Word's own spacing comes in as Word shows it (1.08 of Calibri's line is 1.15 of the editor's), Consolas as code", f);
}

// ---- Excel -----------------------------------------------------------------------------------------------------------
{
  const book = normalizeBook({
    sheets: [
      {
        name: 'Plan',
        header: true,
        rows: [
          ['Task', 'Owner', 'Status', 'Due', 'Score'],
          ['Beds', 'Ana', 'Open', '2026-04-02', 3.5e-4],
          ['Soil', 'Ben', 'Done', '2026-03-20', 12],
          ['  spaced  ', 'Cy', 'Doing', '2026-05-01', 7],
        ],
        widths: { A: 100, B: 64, C: 240 },
        heights: { '1': 30 },
        styles: { A1: { wrap: true }, B2: { valign: 'bottom' }, C2: { valign: 'top' }, E2: { fmt: 'scientific' } },
        validation: [{ range: 'C2:C9', list: ['Open', { v: 'Doing', color: '#fde293' }, { v: 'Done', color: '#ceead6' }] }],
        conditional: [
          { range: 'D2:D9', when: { op: 'before', a: '2026-04-01' }, style: { s: true } },
          { range: 'D2:D9', when: { op: 'after', a: 'today' }, style: { b: true } },
          { range: 'D2:D9', when: { op: 'dateIs', a: '2026-05-01' }, style: { i: true } },
          { range: 'D2:D9', when: { op: 'dateIs', a: 'year' }, style: { u: true } },
        ],
        notes: { B3: 'Line one\nline two' },
      },
      {
        name: 'Wide',
        rows: [Array.from({ length: 12 }, (_, c) => `C${c}`), Array.from({ length: 12 }, (_, c) => c)],
        widths: Object.fromEntries(Array.from({ length: 12 }, (_, c) => [String.fromCharCode(65 + c), 100])),
        charts: [
          { kind: 'scatter', range: 'A1:B2', at: 'A4:F18', colors: ['#c5221f'] },
          { kind: 'column', range: 'A1:C2', at: 'G4:L18' },
        ],
      },
    ],
  });
  const file = xlsxOfBook(book, 'Plan');
  const z = new Zip(file);
  const styles = z.text('xl/styles.xml') ?? '';
  const s1 = z.text('xl/worksheets/sheet1.xml') ?? '';
  const s2 = z.text('xl/worksheets/sheet2.xml') ?? '';
  ok(styles.includes('<fonts count=') && styles.includes('<font><sz val="10"/><name val="Arial"/><family val="2"/></font>'), "cells are in Arial at 10pt, the Office font closest to the editor's (Inter, 10pt)", styles.slice(0, 400));
  ok(
    styles.includes('<cellXfs count=') && /<cellXfs count="\d+"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"\/><\/xf>/.test(styles),
    'words sit in the middle of their rows, as in the editor',
  );
  ok(/<alignment vertical="top" wrapText="1"\/>/.test(styles) && /<alignment vertical="bottom"\/>/.test(styles), 'wrapped words from the top, and a cell that says so at the bottom');
  // 64 and 240 px, and the default 100 px (A, written as the sheet's default width).
  ok(
    s1.includes('<col min="2" max="2" width="9.07421875" customWidth="1"/><col min="3" max="3" width="34.21875" customWidth="1"/>') && !s1.includes('<col min="1"'),
    "columns' widths as Excel turns them back into the editor's pixels (its padding counted)",
    /<cols>[\s\S]*?<\/cols>/.exec(s1)?.[0],
  );
  ok(s1.includes('<sheetFormatPr defaultColWidth="14.21875" defaultRowHeight="18" customHeight="1"/>') && s1.includes('<row r="1" ht="22.5" customHeight="1">'), "rows as tall as the editor's (24px) unless they say");
  ok(
    s1.includes(
      '<printOptions gridLines="1"/><pageMargins left="0.4724" right="0.4724" top="0.4724" bottom="0.4724" header="0.2" footer="0.2"/><pageSetup orientation="portrait"/><headerFooter><oddHeader>&amp;L&amp;&quot;-,Bold&quot;&amp;12&amp;A</oddHeader></headerFooter>',
    ),
    'printed as the app prints it: its cells’ lines, 12mm margins, its name on top',
    /<printOptions[\s\S]*?<\/headerFooter>/.exec(s1)?.[0],
  );
  ok(
    s2.includes('<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>') && s2.startsWith('<?xml') && s2.includes('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension') && !s2.includes('gridLines'),
    'a sheet wider than a page across, made smaller to fit; no lines across the empty cells its charts stand on',
  );
  ok((z.text('xl/workbook.xml') ?? '').includes('<definedName name="_xlnm.Print_Titles" localSheetId="0">Plan!$1:$1</definedName>'), 'its header row repeated on each printed page');
  ok(
    (z.text('xl/sharedStrings.xml') ?? '').includes('<t xml:space="preserve">  spaced  </t>') && !(z.text('xl/comments1.xml') ?? '').includes('xml:space'),
    'only words with spaces at their ends are marked to keep them (ECMA-376’s schema has no such mark there)',
  );
  const cf = s1.match(/<conditionalFormatting[\s\S]*?<\/conditionalFormatting>/g) ?? [];
  ok(
    cf.length === 6 && cf[4].includes('sqref="C2:C9"') && cf[4].includes('<formula>&quot;Doing&quot;</formula>') && cf[5].includes('<formula>&quot;Done&quot;</formula>'),
    "a list's coloured options shown by conditional formatting, after the sheet's own rules",
    cf.slice(4),
  );
  const chart = z.text('xl/charts/chart1.xml') ?? '';
  ok(
    chart.includes('<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525">') && chart.includes('<a:latin typeface="Arial"/>') && chart.includes('<c:roundedCorners val="1"/>'),
    'charts on a white card with rounded corners, their words in Arial, as the editor draws them',
  );

  const back = importBook(file, 'Plan.xlsx');
  const b = back.book.sheets[0];
  ok(back.loses?.length === 0, 'read back, nothing is said to be lost (the app makes its print settings again)', back.loses);
  ok(!b.cols?.[0] && b.cols?.[1]?.w === 64 && b.cols?.[2]?.w === 240 && b.rows?.[0]?.h === 30, 'widths and heights come back as they were', [b.cols, b.rows]);
  ok(b.cells.B2.s?.valign === 'bottom' && b.cells.C2.s?.valign === 'top' && !b.cells.A1.s?.valign && b.cells.A1.s?.wrap && !b.cells.A2.s, "words' places up and down come back, the editor's own as none", [b.cells.A1.s, b.cells.B2.s, b.cells.C2.s]);
  ok(b.cells.E2.s?.fmt === 'scientific', "Excel's own scientific format (its number 11) comes back as one");
  ok(
    JSON.stringify(b.conditional?.map((r) => r.when)) === JSON.stringify(book.sheets[0].conditional?.map((r) => r.when)),
    'date rules come back as the rules they were, not formulas',
    b.conditional?.map((r) => r.when),
  );
  ok(b.validation?.[0]?.options?.[1]?.color === '#fde293' && b.conditional?.length === 4, "the list keeps its colours, and their conditional formatting is the list's, not the sheet's");
  const c = back.book.sheets[1].charts ?? [];
  ok(c[0]?.colors?.[0] === '#c5221f' && c.every((x) => x.labels === undefined && x.names === undefined && x.legend === undefined), 'charts come back as kept: a scatter’s colour, and nothing the app takes for them anyway', c);
  const same = (x: Workbook) => JSON.stringify(x, (k, v) => (k === 'id' ? undefined : v));
  ok(same(back.book) === same(book), 'the whole workbook comes back from Excel as it was');

  // Another program's file: Excel's own widths (9.140625 is its 64px default), its default alignment, a print area.
  const sheet = s1.replace(/<cols>[\s\S]*?<\/cols>/, '<cols><col min="1" max="1" width="9.140625" customWidth="1"/></cols>');
  const wb = (z.text('xl/workbook.xml') ?? '').replace('</definedNames>', '<definedName name="_xlnm.Print_Area" localSheetId="0">Plan!$A$1:$E$4</definedName></definedNames>');
  const parts = z.names().map((n) => ({ name: n, data: n === 'xl/worksheets/sheet1.xml' ? Buffer.from(sheet) : n === 'xl/workbook.xml' ? Buffer.from(wb) : z.read(n)! }));
  const other = importBook(zipParts(parts), 'Other.xlsx');
  ok(other.book.sheets[0].cols?.[0]?.w === 64 && other.book.sheets[0].print?.area === 'A1:E4' && !other.loses?.includes('print'), "Excel's widths read as the pixels Excel shows; a print area is kept", [other.book.sheets[0].cols, other.book.sheets[0].print, other.loses]);
}

// ---- the editor's page and PDF ------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ footer: '{page}', blocks: [{ h1: 'Top' }, { code: 'x' }] });
  ok(docFonts(d).includes('JetBrains Mono') && !docFonts(normalizeDoc({ blocks: [{ p: 'x' }] })).includes('JetBrains Mono'), 'a document with code loads JetBrains Mono, so code looks the same on every computer and in its files');
  ok(
    docPage(db, d, 'T', 'print').includes('.nd-sheet>.nd-band+.nd-b,.nd-sheet>.nd-band+.nd-band+.nd-b{margin-top:0}') && docCss(d).includes('JetBrains Mono'),
    "a printed page's first block starts at the top of its words, a header or footer before it or not",
  );
}

// ---- the browser exports are made with ----------------------------------------------------------------------------
if (canCapture()) {
  // A job that starts as the last one's idle while runs out: the browser stays open for it (it was closed under it).
  setCaptureIdle(400);
  const html = '<!doctype html><p>x</p>';
  await withTab({ html, width: 200, height: 100, settleMs: 0 }, async () => true);
  await new Promise((r) => setTimeout(r, 300));
  const got = await withTab({ html, width: 200, height: 100, settleMs: 0 }, async (tab) => {
    await new Promise((r) => setTimeout(r, 500));
    return tab.evaluate<number>('1 + 1');
  }).catch((e: Error) => e.message);
  ok(got === 2, 'a PDF or picture started just as the browser would close for being idle is made all the same', got);
  setCaptureIdle(90_000);
  closeCapture();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// Script tests for a document's other files (doc-files.ts): plain text, an EPUB e-book and an OpenDocument text file made
// from a document with headings, lists, a table with its caption, a picture, footnotes, a citation and a bibliography, on
// landscape paper; and PDFs opened as documents, from lines made by hand and from documents printed by the browser (when
// there is one). Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/doc-files-test.ts
//   DATA_DIR=/tmp/hydor-test-doc-files node dist/dev/doc-files-test.js
// With DOC_FILES_OUT=<folder>, the files made are kept there too (to open in LibreOffice, or check with epubcheck).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canCapture, closeCapture, printPdf, withTab } from '../capture/index.ts';
import { openDb } from '../db.ts';
import { all, att, parseXml, textOf, type El } from '../documents/xml.ts';
import { Zip } from '../documents/zip.ts';
import { docLang, docFromPdf, epubOfDoc, odtOfDoc, pdfBlocks, textOfDoc, type PdfLine } from './doc-files.ts';
import { docFromFile, docPage } from './docs.ts';
import { EXPORT_TYPES } from './export.ts';
import { kindOf } from './kinds.ts';
import { normalizeDoc, runsText, type Block, type Doc } from '../../shared/docs.ts';

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
    console.log(`FAIL ${what}${extra !== undefined ? ` :: ${JSON.stringify(extra).slice(0, 900)}` : ''}`);
  }
};

const keep = process.env.DOC_FILES_OUT;
const kept = (name: string, data: Buffer | string) => {
  if (!keep) return;
  fs.mkdirSync(keep, { recursive: true });
  fs.writeFileSync(path.join(keep, name), data);
};

/**
 * What is wrong with some XML, strictly ('' for nothing): one root element, every element closed in the order opened,
 * attributes quoted and given once, and references only as XML knows them (only numbers, with `numeric`).
 */
function xmlProblem(xml: string, numeric = false): string {
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  const near = () => JSON.stringify(xml.slice(Math.max(0, i - 60), i + 60));
  const refs = (s: string) => {
    for (const m of s.matchAll(/&([^;\s<&]{0,16})(;?)/g)) {
      if (!m[2]) return 'an & that starts no reference';
      if (/^#\d+$/.test(m[1]) || /^#x[0-9a-f]+$/i.test(m[1])) continue;
      if (!numeric && /^(amp|lt|gt|quot|apos)$/.test(m[1])) continue;
      return `the reference &${m[1]};`;
    }
    return '';
  };
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(xml)) return 'a character XML does not allow';
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = xml.slice(i, lt < 0 ? xml.length : lt);
    if (text.trim() && !stack.length) return `words outside the root at ${near()}`;
    const r = refs(text);
    if (r) return `${r} at ${near()}`;
    if (lt < 0) break;
    i = lt;
    const skip = (open: string, end: string) => {
      if (!xml.startsWith(open, i)) return false;
      const e = xml.indexOf(end, i + open.length);
      i = e < 0 ? xml.length + 1 : e + end.length;
      return true;
    };
    if (skip('<?', '?>') || skip('<!--', '-->') || skip('<![CDATA[', ']]>') || skip('<!DOCTYPE', '>')) {
      if (i > xml.length) return 'something left open at the end';
      continue;
    }
    tag.lastIndex = i;
    const m = tag.exec(xml);
    if (!m) return `a tag XML cannot read at ${near()}`;
    const [whole, close, name, attrs, self] = m;
    if (close) {
      if (attrs || self) return `a closing tag with more in it at ${near()}`;
      const open = stack.pop();
      if (open !== name) return `</${name}> closes <${open}> at ${near()}`;
    } else {
      const names = [...attrs.matchAll(/([A-Za-z_][\w.:-]*)\s*=/g)].map((x) => x[1]);
      if (new Set(names).size !== names.length) return `an attribute twice at ${near()}`;
      const r2 = refs(attrs);
      if (r2) return `${r2} at ${near()}`;
      if (!stack.length && ++roots > 1) return `a second root at ${near()}`;
      if (!self) stack.push(name);
    }
    i += whole.length;
  }
  return stack.length ? `left open: ${stack.join(' > ')}` : roots === 1 ? '' : 'no root element';
}

ok(xmlProblem('<a x="1"><b/>t &amp; &#38;</a>') === '', 'the checker takes good XML');
ok(xmlProblem('<a><b></a>') !== '' && xmlProblem('<a x=1></a>') !== '' && xmlProblem('<a>&nbsp;</a>') !== '' && xmlProblem('<a><br></a>') !== '' && xmlProblem('<a>&amp;</a>', true) !== '', 'and finds bad XML', [xmlProblem('<a><b></a>'), xmlProblem('<a x=1></a>'), xmlProblem('<a>&nbsp;</a>')]);

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-doc-files-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8DwnwELaGDABQBU7QT8V3S8BwAAAABJRU5ErkJggg==';
const MD = [
  'Water notes {.title}',
  '',
  '# Results',
  '',
  'Water boils[^1] at 100 °C, as shown [@doe2020]; see <ref to="fig1"/> and **the table**.',
  '',
  '## Steps',
  '',
  '- First step',
  '- Second step',
  '  - A deeper step',
  '',
  '1. One',
  '2. Two',
  '',
  '- [ ] To do',
  '- [x] Done',
  '',
  'Table: Prices {#tab1 label=Table}',
  '',
  '| Item | Price |',
  '| --- | --- |',
  '| Tea | 3 |',
  '',
  `![A red square](${PNG} "Growth"){#fig1 label=Figure}`,
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '\\pagebreak',
  '',
  '# References',
  '',
  '[BIBLIOGRAPHY]',
  '',
  '[^1]: At sea level, as [the guide](https://example.com/boil?a=1&b=2) says.',
].join('\n');
const doc = normalizeDoc({
  markdown: MD,
  sources: [{ id: 'doe2020', kind: 'article', title: 'Boiling points', authors: [{ family: 'Doe', given: 'Jane' }], year: '2020', in: 'Nature' }],
  page: { size: 'a4', margin: 20, orient: 'landscape' },
  header: { text: 'Water notes', align: 'right' },
  footer: { text: 'Page {page} of {pages}', align: 'center' },
});
const kinds = doc.blocks.map((b) => (b.type === 'li' ? `li:${b.list}:${b.lvl ?? 0}` : b.type === 'p' ? `p:${b.style ?? 'normal'}` : b.type));
ok(
  JSON.stringify(kinds) === JSON.stringify(['p:title', 'p:h1', 'p:normal', 'p:h2', 'li:bullet:0', 'li:bullet:0', 'li:bullet:1', 'li:number:0', 'li:number:0', 'li:check:0', 'li:check:0', 'table', 'image', 'math', 'pagebreak', 'p:h1', 'bib']),
  'the document to export is as written',
  kinds,
);

// ---- plain text -------------------------------------------------------------------------------------------------------
{
  const t = textOfDoc(doc);
  kept('doc.txt', t);
  const lines = t.split('\n');
  ok(t.startsWith('Water notes\n\nResults\n\nWater boils[1] at 100 °C, as shown (Doe, 2020); see Figure 1 and the table.\n\nSteps\n\n'), 'the title, headings and a paragraph, its footnote, citation and cross-reference as they read', t.slice(0, 200));
  ok(t.includes('• First step\n• Second step\n  ◦ A deeper step\n\n1. One\n2. Two\n\n☐ To do\n☑ Done'), 'list items with their marks, a level deeper under the words', t);
  ok(t.includes('Table 1: Prices\nItem\tPrice\nTea\t3'), 'a table: its caption, then its rows between tabs');
  ok(lines.includes('Figure 1: Growth') && lines.includes('E = mc^2') && lines.includes('\f'), 'a picture as its caption, an equation as its LaTeX, a page break as a form feed');
  ok(t.includes('\n\nReferences\n\nDoe, J. (2020). Boiling points. Nature.'), 'the bibliography as it reads', t.slice(-300));
  ok(t.endsWith('__________\n[1] At sea level, as the guide says.\n'), 'the footnotes at the end', t.slice(-120));
  ok(!t.includes('<') && !/ \n/.test(t), 'no markup, no spaces at lines’ ends');
  const pic = textOfDoc(normalizeDoc({ blocks: [{ type: 'image', src: PNG, alt: 'A cat' }, { type: 'image', src: PNG }] }));
  ok(pic === '[Picture: A cat]\n\n[Picture]\n', 'a picture without a caption says what it shows', pic);
  const sug = textOfDoc(normalizeDoc({ blocks: [{ p: [{ t: 'Keep ' }, { t: 'gone ', del: 's1' }, { t: 'new', ins: 's1' }] }], suggestions: [{ id: 's1', by: 'agent', at: 1 }] }));
  ok(sug === 'Keep new\n', 'suggested changes made', sug);
}

// ---- EPUB -------------------------------------------------------------------------------------------------------------
{
  const buf = epubOfDoc(db, doc, 'Water notes');
  kept('doc.epub', buf);
  const zip = new Zip(buf);
  const names = zip.names();
  ok(names[0] === 'mimetype' && zip.packed('mimetype')?.method === 0 && zip.text('mimetype') === 'application/epub+zip', 'the mimetype first, as it is', names.slice(0, 3));
  ok(buf.toString('latin1', 30, 38) === 'mimetype' && buf.toString('latin1', 38, 58) === 'application/epub+zip', 'at the very start of the file, as readers look for it');
  const container = zip.text('META-INF/container.xml') ?? '';
  ok(/<rootfile full-path="OEBPS\/content\.opf" media-type="application\/oebps-package\+xml"\/>/.test(container) && !xmlProblem(container), 'the container names the package', container);
  const opf = zip.text('OEBPS/content.opf') ?? '';
  ok(!xmlProblem(opf), 'the package is well formed', xmlProblem(opf));
  const pkg = parseXml(opf).root;
  ok(textOf(all(pkg, 'title')[0]) === 'Water notes' && textOf(all(pkg, 'language')[0]) === 'en' && /^urn:uuid:[0-9a-f-]{36}$/.test(textOf(all(pkg, 'identifier')[0])), 'its title, language and identifier', opf.slice(0, 600));
  ok(/<meta property="dcterms:modified">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ<\/meta>/.test(opf), 'when it was made');
  const items = all(pkg, 'item');
  const hrefs = items.map((x) => att(x, 'href') ?? '');
  ok(hrefs.every((h) => names.includes(`OEBPS/${h}`)) && names.filter((n) => n.startsWith('OEBPS/') && n !== 'OEBPS/content.opf').every((n) => hrefs.includes(n.slice(6))), 'the manifest lists every file, and every file it lists is there', [hrefs, names]);
  const png = items.find((x) => att(x, 'media-type') === 'image/png');
  ok(png && /^images\/picture-1\.png$/.test(att(png, 'href') ?? ''), 'the picture is a file of the book', items.map((x) => x.a));
  ok(items.some((x) => att(x, 'properties') === 'nav') && items.some((x) => att(x, 'properties') === 'mathml'), 'the contents, and a chapter with maths, marked as such');
  const spine = all(pkg, 'itemref').map((x) => att(x, 'idref'));
  ok(spine.length === 3, 'a chapter at each Heading 1 with something before it', spine);
  const nav = zip.text('OEBPS/nav.xhtml') ?? '';
  ok(!xmlProblem(nav, true), 'the contents are well formed', xmlProblem(nav, true));
  const navLinks = all(parseXml(nav).root, 'a').map((a) => `${textOf(a)}→${att(a, 'href')}`);
  ok(navLinks.length === 3 && navLinks[0].startsWith('Results→chapter-02.xhtml#nd-') && navLinks[1].startsWith('Steps→chapter-02.xhtml#nd-') && navLinks[2].startsWith('References→chapter-03.xhtml#nd-'), 'the contents list the headings, each in its chapter', navLinks);
  ok(/<nav epub:type="toc" id="toc"><h1>Water notes<\/h1><ol><li><a [^>]+>Results<\/a><ol><li><a [^>]+>Steps<\/a><\/li><\/ol><\/li><li>/.test(nav), 'a heading under another, a level down', nav.slice(-500));
  const chapters = names.filter((n) => /\.xhtml$/.test(n)).map((n) => ({ n, x: zip.text(n) ?? '' }));
  for (const c of chapters) ok(!xmlProblem(c.x, true), `${c.n} is well formed, with numbers for references`, xmlProblem(c.x, true));
  const two = zip.text('OEBPS/chapter-02.xhtml') ?? '';
  const root = parseXml(two).root;
  ok(att(root, 'xmlns') === 'http://www.w3.org/1999/xhtml' && att(root, 'xml:lang') === 'en', 'XHTML in the language of the words');
  const aside = all(root, 'aside')[0];
  ok(aside && att(aside, 'epub:type') === 'footnote' && textOf(aside).includes('At sea level, as the guide says.') && all(aside, 'a').some((a) => att(a, 'href') === 'https://example.com/boil?a=1&b=2'), 'the footnote, the e-book’s own, with its link', aside && textOf(aside));
  const noteref = all(root, 'a').find((a) => att(a, 'epub:type') === 'noteref');
  ok(noteref && att(noteref, 'href') === `#${att(aside, 'id')}` && textOf(noteref) === '1' && all(aside, 'a').some((a) => att(a, 'href') === '#nd-fn-1-ref') && two.includes('id="nd-fn-1-ref"'), 'its mark leads to it, and it back to its mark', noteref?.a);
  ok(two.includes('(Doe, 2020)') && /<a href="#nd-fig1">Figure 1<\/a>/.test(two), "the citation's words, and the cross-reference leading to the picture");
  ok(/<figure id="nd-fig1" class="center"><img src="images\/picture-1\.png" alt="A red square" style="width:100%"\/><figcaption>Figure 1: Growth<\/figcaption><\/figure>/.test(two), 'the picture, its description and its numbered caption', /<figure[^]*?<\/figure>/.exec(two)?.[0]);
  ok(/<p class="li"><span class="mark">•<\/span>First step<\/p>/.test(two) && /<p class="li" style="margin-left:2em"><span class="mark">◦<\/span>A deeper step<\/p>/.test(two) && /<span class="mark">1\.<\/span>One/.test(two) && /class="li done"><span class="mark">☑<\/span>Done/.test(two), 'list items with their marks and levels');
  ok(/<caption class="nd-cap">Table 1: Prices<\/caption>/.test(two) && /<col style="width:50%"\/>/.test(two) && /<th>Item<\/th>/.test(two), 'the table with its caption, columns and header row');
  ok(/<div class="math"><span class="katex"><math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML" display="block">/.test(two), 'the equation as MathML');
  ok(/<div class="pb"><\/div>/.test(two), 'a page break');
  const three = zip.text('OEBPS/chapter-03.xhtml') ?? '';
  ok(/<p class="bib-e">Doe, J\. \(2020\)\. <em>Boiling points<\/em>|<p class="bib-e">Doe, J\. \(2020\)\. Boiling points\. <em>Nature<\/em>/.test(three), 'the bibliography, its looks kept', /<div[^>]*class="bib"[^]*?<\/div>/.exec(three)?.[0]);
  const css = zip.text('OEBPS/style.css') ?? '';
  ok(/font-family:Arial/.test(css) && /h1\{font-size:1\.8em/.test(css) && /aside|\.notes/.test(css), "the stylesheet: the document's font and styles", css.slice(0, 300));
  // A link to another chapter goes to its file; one to nowhere loses its link, not its words.
  const linked = normalizeDoc({ markdown: 'Intro, see [the end](#end1).\n\n# One\n\nWords.\n\n# Two {#end1}\n\nMore, and [nowhere](#gone1).' });
  const lz = new Zip(epubOfDoc(db, linked, 'Links'));
  const c1 = lz.text('OEBPS/chapter-01.xhtml') ?? '';
  ok(/<a href="chapter-03\.xhtml#nd-end1">the end<\/a>/.test(c1) && /<a>nowhere<\/a>/.test(lz.text('OEBPS/chapter-03.xhtml') ?? ''), 'links between chapters, and to nowhere', c1);
  ok(docLang(normalizeDoc({ markdown: 'Το νερό βράζει στους εκατό βαθμούς, όπως ξέρουμε.' })) === 'el' && docLang(normalizeDoc({ markdown: 'Le chat est dans la maison et les enfants sont dans le jardin.' })) === 'fr' && docLang(normalizeDoc({ markdown: '水在一百度沸腾。' })) === 'zh', 'the language from the words');
}

// ---- OpenDocument ---------------------------------------------------------------------------------------------------
{
  const buf = odtOfDoc(db, doc, 'Water notes');
  kept('doc.odt', buf);
  const zip = new Zip(buf);
  const names = zip.names();
  ok(names[0] === 'mimetype' && zip.packed('mimetype')?.method === 0 && zip.text('mimetype') === 'application/vnd.oasis.opendocument.text', 'the mimetype first, as it is', names);
  const manifest = zip.text('META-INF/manifest.xml') ?? '';
  ok(!xmlProblem(manifest), 'the manifest is well formed', xmlProblem(manifest));
  const listed = all(parseXml(manifest).root, 'file-entry').map((e) => att(e, 'full-path'));
  ok(['/', 'content.xml', 'styles.xml', 'meta.xml', 'Pictures/1.png'].every((p) => listed.includes(p)) && names.filter((n) => n !== 'mimetype' && n !== 'META-INF/manifest.xml').every((n) => listed.includes(n)), 'it lists every part', listed);
  const content = zip.text('content.xml') ?? '';
  const styles = zip.text('styles.xml') ?? '';
  const meta = zip.text('meta.xml') ?? '';
  for (const [n, x] of [['content.xml', content], ['styles.xml', styles], ['meta.xml', meta]]) ok(!xmlProblem(x), `${n} is well formed`, xmlProblem(x));
  const root = parseXml(content).root;
  const heads = all(root, 'h').map((h) => `${att(h, 'text:outline-level')}:${textOf(h)}`);
  ok(JSON.stringify(heads) === JSON.stringify(['1:Results', '2:Steps', '1:References']), 'headings with their outline levels', heads);
  ok(all(root, 'p').some((p) => att(p, 'text:style-name') === 'Title' && textOf(p) === 'Water notes'), 'the title in its style');
  const lists = all(root, 'list');
  ok(lists.length >= 4 && lists.some((l) => att(l, 'text:style-name') === 'L_number') && lists.some((l) => att(l, 'text:style-name') === 'L_check') && all(lists[0], 'list').length === 1, 'lists: bullets with one inside, numbers, a checklist', lists.map((l) => att(l, 'text:style-name')));
  ok(content.includes('☐ To do') && content.includes('☑ Done'), 'a checklist’s boxes');
  const table = all(root, 'table')[0];
  ok(table && all(table, 'table-column').length === 2 && all(table, 'table-header-rows').length === 1 && textOf(table).includes('Tea'), 'the table: its columns, its header row', table && textOf(table));
  ok(/<text:p text:style-name="P\d+">(?:<text:bookmark[^>]*\/>)?Table 1: Prices<\/text:p><table:table /.test(content), 'its caption over it');
  const note = all(root, 'note')[0];
  ok(note && att(note, 'text:note-class') === 'footnote' && textOf(all(note, 'note-citation')[0]) === '1' && textOf(all(note, 'note-body')[0]) === 'At sea level, as the guide says.', 'the footnote, where its mark is', note && textOf(note));
  ok(content.includes('xlink:href="https://example.com/boil?a=1&amp;b=2"'), 'a link inside it, its address escaped');
  ok(content.includes('(Doe, 2020)') && /<text:a xlink:type="simple" xlink:href="#nd-fig1"[^>]*>Figure 1<\/text:a>/.test(content) && content.includes('<text:bookmark text:name="nd-fig1"/>'), "the citation's words, and the cross-reference leading to the picture");
  const image = all(root, 'image')[0];
  ok(image && att(image, 'xlink:href') === 'Pictures/1.png' && zip.read('Pictures/1.png')?.equals(Buffer.from(PNG.split(',')[1], 'base64')), 'the picture inside it', image?.a);
  const frame = all(root, 'frame')[0];
  ok(frame && att(frame, 'svg:width') === '153mm' && att(frame, 'svg:height') === '153mm' && textOf(all(frame, 'desc')[0]) === 'A red square', 'the picture as wide as the text but no taller than the page’s, with its description', frame?.a);
  ok(/Figure 1: Growth<\/text:p>/.test(content) && content.includes('E = mc^2') && content.includes('Doe, J. (2020). '), 'its caption under it, the equation as LaTeX, the bibliography');
  ok(/<style:paragraph-properties fo:break-before="page"\/>/.test(content), 'a page break');
  ok(/style:print-orientation="landscape"/.test(styles) && /fo:page-width="297mm" fo:page-height="210mm"/.test(styles) && /fo:margin-left="20mm"/.test(styles), 'the page: landscape A4, its margins', /<style:page-layout-properties[^>]*>/.exec(styles)?.[0]);
  ok(/<style:style style:name="Heading_20_1" style:display-name="Heading 1"[^>]*style:default-outline-level="1"/.test(styles) && /fo:font-size="19\.8pt"/.test(styles) && /<style:font-face style:name="Arial"/.test(styles), "the document's styles, sizes and font");
  ok(/<style:header><text:p text:style-name="MH1">Water notes<\/text:p><\/style:header>/.test(styles) && /<style:footer><text:p text:style-name="MF1">Page <text:page-number text:select-page="current">1<\/text:page-number> of <text:page-count>1<\/text:page-count><\/text:p><\/style:footer>/.test(styles), 'the header and footer, with page numbers');
  ok(/<dc:title>Water notes<\/dc:title>/.test(meta) && /<dc:language>en<\/dc:language>/.test(meta), 'its title and language');
  // Columns, a page colour, a title page, spaces kept, a list skipping a level, a merged cell, a second mark of one note.
  const more = normalizeDoc({
    markdown: 'Top\n\n- a\n    - deep\n\nx[^n] and again[^n]\n\n```\n  two  spaces\n```\n\n<table><tr><td colspan="2" style="background-color:#e8f0fe">wide</td></tr><tr><td>1</td><td>2</td></tr></table>\n\n[^n]: The note.',
    page: { cols: 2, color: '#fef7e0' },
    header: 'Head',
    titlePage: true,
  });
  const mb = odtOfDoc(db, more, 'More');
  kept('more.odt', mb);
  const mz = new Zip(mb);
  const mc = mz.text('content.xml') ?? '';
  const ms = mz.text('styles.xml') ?? '';
  ok(!xmlProblem(mc) && !xmlProblem(ms), 'well formed', [xmlProblem(mc), xmlProblem(ms)]);
  ok(/<style:columns fo:column-count="2" fo:column-gap="12\.7mm"\/>/.test(ms) && /fo:background-color="#fef7e0"/.test(ms), 'two columns and a page colour', /<style:page-layout-properties[^]*?<\/style:page-layout>/.exec(ms)?.[0]);
  ok(/style:master-page-name="First_20_Page"/.test(mc) && /<style:master-page style:name="First_20_Page"[^>]*style:next-style-name="Standard"\/>/.test(ms), 'a first page without the header');
  ok(mc.includes('<text:s text:c="2"/>two <text:s/>spaces'), 'spaces kept as they are', /<text:p text:style-name="Preformatted[^]*?<\/text:p>/.exec(mc)?.[0]);
  ok(/<text:list text:style-name="L_bullet"><text:list-item><text:p[^>]*>a<\/text:p><text:list text:style-name="L_bullet"><text:list-item><text:p[^>]*>deep/.test(mc), 'an item a level deeper, inside the one above', mc.slice(mc.indexOf('<text:list'), mc.indexOf('<text:list') + 400));
  ok(/table:number-columns-spanned="2"><text:p[^>]*>wide<\/text:p><\/table:table-cell><table:covered-table-cell\/>/.test(mc) && /fo:background-color="#e8f0fe"/.test(mc), 'a merged cell, with its fill');
  ok((mc.match(/<text:note /g) ?? []).length === 1 && /<text:note-ref text:note-class="footnote" text:reference-format="text" text:ref-name="ftn1">1<\/text:note-ref>/.test(mc), 'a note marked twice: its words once, a reference to them after');
}

// ---- the other kinds of block, in both ------------------------------------------------------------------------------------
{
  const SVG = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#1a73e8"/></svg>').toString('base64')}`;
  const variety = normalizeDoc({
    markdown: [
      'Variety {.title}',
      '',
      '[TOC]',
      '',
      '# One',
      '',
      '> 💡 A tip, with $x^2$ among its words {.callout}',
      '',
      '> A quote, and [a link to Two](#two1).',
      '',
      '```',
      'let a = 1 < 2 && 3;',
      '```',
      '',
      `![](${SVG}){width=40% .left}`,
      '',
      '| a | b[^c] |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '---',
      '',
      '# Two {#two1}',
      '',
      '### Deeper',
      '',
      'End.',
      '',
      '[^c]: In a cell.',
    ].join('\n'),
  });
  const e = new Zip(epubOfDoc(db, variety, 'Variety'));
  kept('variety.epub', epubOfDoc(db, variety, 'Variety'));
  const one = e.text('OEBPS/chapter-02.xhtml') ?? '';
  ok(e.names().filter((n) => n.endsWith('.xhtml')).every((n) => !xmlProblem(e.text(n) ?? '', true)), 'every part well formed', e.names().map((n) => (n.endsWith('.xhtml') ? xmlProblem(e.text(n) ?? '', true) : '')));
  ok(/<div class="callout" style="background-color:#fef7e0"><p><span class="icon">💡<\/span>A tip, with <span class="nd-m" data-tex="x\^2"><span class="katex"><math /.test(one), 'a callout, maths among its words as MathML', /<div class="callout"[^]*?<\/div>/.exec(one)?.[0]);
  ok(/<blockquote class="quote"><p>A quote, and <a href="chapter-03\.xhtml#nd-two1">a link to Two<\/a>\.<\/p><\/blockquote>/.test(one) && /<pre class="code">let a = 1 &#60; 2 &#38;&#38; 3;<\/pre>/.test(one), 'a quote with a link to another chapter, and code');
  ok(e.names().includes('OEBPS/images/picture-1.svg') && /<figure class="left"><img src="images\/picture-1\.svg" alt="" style="width:40%"\/><\/figure>/.test(one), 'an SVG picture as it is');
  ok(/<aside id="nd-fn-c"/.test(one) && /<hr\/>/.test(one), "a footnote in a table's cell, a line across");
  ok(/<div class="toc"><p class="toc-1"><a href="chapter-02\.xhtml#nd-[\w-]+">One<\/a><\/p><p class="toc-1"><a href="chapter-03\.xhtml#nd-two1">Two<\/a><\/p><p class="toc-3"><a href="chapter-03\.xhtml#nd-[\w-]+">Deeper<\/a><\/p><\/div>/.test(e.text('OEBPS/chapter-01.xhtml') ?? ''), 'the table of contents, its links to the chapters', e.text('OEBPS/chapter-01.xhtml'));
  ok(/<li><a href="chapter-03\.xhtml#nd-two1">Two<\/a><ol><li><a [^>]+>Deeper<\/a><\/li><\/ol><\/li>/.test(e.text('OEBPS/nav.xhtml') ?? ''), 'a heading two levels down sits one level down in the contents');
  const ob = odtOfDoc(db, variety, 'Variety');
  kept('variety.odt', ob);
  const oc = new Zip(ob).text('content.xml') ?? '';
  ok(!xmlProblem(oc), 'the OpenDocument file is well formed', xmlProblem(oc));
  ok(/<text:table-of-content [^>]*><text:table-of-content-source text:outline-level="3">/.test(oc) && /<text:p text:style-name="Contents_20_3"><text:a xlink:type="simple" xlink:href="#nd-[\w-]+">Deeper<\/text:a><\/text:p>/.test(oc), 'the table of contents as LibreOffice’s own');
  ok(/<draw:image xlink:href="Pictures\/1\.svg"/.test(oc) && /svg:width="[\d.]+mm" svg:height="[\d.]+mm"/.test(oc), 'the SVG inside it, sized by its viewBox');
  ok(oc.includes('let a = 1 &lt; 2 &amp;&amp; 3;') && /💡 A tip, with <text:span text:style-name="T\d+">x\^2<\/text:span>/.test(oc) && /<text:a [^>]*xlink:href="#nd-two1"/.test(oc) && /<text:bookmark text:name="nd-two1"\/>Two/.test(oc), 'code, a callout with maths, a link to a heading and its bookmark');
}

// ---- registered as the document's files ------------------------------------------------------------------------------------
{
  const k = kindOf('doc')!;
  ok(typeof k.files.odt === 'function' && typeof k.files.epub === 'function' && typeof k.files.txt === 'function' && k.opens?.test('report.pdf'), 'a document exports as odt, epub and txt, and opens from a PDF');
  ok(EXPORT_TYPES.odt === 'application/vnd.oasis.opendocument.text' && EXPORT_TYPES.epub === 'application/epub+zip' && EXPORT_TYPES.txt === 'text/plain; charset=utf-8', 'their types');
  const help = { picture: () => null };
  const text = JSON.stringify(doc);
  ok(String(await k.files.txt!(db, text, 'Water notes', help)).startsWith('Water notes\n\nResults'), 'the text file, through the kind');
  ok(Buffer.isBuffer(await k.files.odt!(db, text, 'Water notes', help)) && Buffer.isBuffer(await k.files.epub!(db, text, 'Water notes', help)), 'the OpenDocument and EPUB files, through the kind');
}

// ---- a PDF opened as a document: lines made by hand ---------------------------------------------------------------------
{
  const L = (text: string, x: number, base: number, size = 11, w = text.length * size * 0.5): PdfLine => ({ text, x, y: base - size * 0.8, w, h: size, base, size });
  const page1 = {
    w: 612,
    h: 792,
    lines: [
      L('My Report', 72, 40, 9),
      L('A Study of Water', 150, 110, 24),
      L('Introduction', 72, 160, 16),
      L('Water is a common sub-', 72, 190, 11, 468),
      L('stance found on Earth. It boils at a', 72, 204, 11, 468),
      L('hundred degrees.', 72, 218, 11, 90),
      L('A new paragraph starts here after a gap', 72, 240, 11, 468),
      L('and goes on.', 72, 254, 11, 70),
      L('Method', 72, 290, 13),
      L('• First thing to do', 90, 315),
      L('• Second thing, which is long and', 90, 329, 11, 450),
      L('wraps under its words', 101, 343),
      L('1. Number one', 90, 365),
      L('2) Number two', 90, 379),
      L('◦ Deeper', 110, 393),
      L('3', 300, 760, 10),
    ],
  };
  const page2 = {
    w: 612,
    h: 792,
    lines: [L('My Report', 72, 40, 9), L('More words on the second page.', 72, 120, 11, 200), L('Results', 72, 160, 16), L('Done.', 72, 190), L('4', 300, 760, 10)],
  };
  const doc2 = normalizeDoc({ blocks: pdfBlocks([page1, page2]) });
  const got = doc2.blocks.map((b: Block) => `${b.type === 'li' ? `li:${b.list}:${b.lvl ?? 0}` : b.type === 'p' ? (b.style ?? 'p') : b.type}|${b.type === 'p' || b.type === 'li' ? runsText(b.runs) : ''}`);
  const want = [
    'title|A Study of Water',
    'h1|Introduction',
    'p|Water is a common substance found on Earth. It boils at a hundred degrees.',
    'p|A new paragraph starts here after a gap and goes on.',
    'h2|Method',
    'li:bullet:0|First thing to do',
    'li:bullet:0|Second thing, which is long and wraps under its words',
    'li:number:0|Number one',
    'li:number:0|Number two',
    'li:bullet:1|Deeper',
    'p|More words on the second page.',
    'h1|Results',
    'p|Done.',
  ];
  ok(JSON.stringify(got) === JSON.stringify(want), 'lines made a title, headings by size, paragraphs, words joined over a hyphen, list items; page numbers and a header on every page left out', got);
  // A first line set in starts a paragraph; a sentence goes on over a page's end.
  const indented = normalizeDoc({
    blocks: pdfBlocks([
      { w: 612, h: 792, lines: [L('Once upon a time there was a cat who', 72, 100, 11, 468), L('lived in a house. The end.', 72, 114, 11, 150), L('Then another story begins here and it', 90, 128, 11, 450), L('runs on to the next', 72, 142, 11, 468)] },
      { w: 612, h: 792, lines: [L('page without a break.', 72, 100, 11, 120)] },
    ]),
  });
  const got2 = indented.blocks.map((b) => (b.type === 'p' ? runsText(b.runs) : b.type));
  ok(JSON.stringify(got2) === JSON.stringify(['Once upon a time there was a cat who lived in a house. The end.', 'Then another story begins here and it runs on to the next page without a break.']), 'a first line set in starts a paragraph; one going on over a page does not', got2);
  // A footnote's number raised beside a word goes back into its line.
  const raised = normalizeDoc({ blocks: pdfBlocks([{ w: 612, h: 792, lines: [{ ...L('Water boils at sea level.', 72, 100, 11, 140), xs: [...'Water boils at sea level.'].map((_, i): [number, number] => [72 + i * 5.6, 77 + i * 5.6]) }, L('1', 129, 96, 7, 4)] }]) });
  ok(raised.blocks[0].type === 'p' && runsText(raised.blocks[0].runs) === 'Water boils1 at sea level.', 'a raised number goes back into its line', raised.blocks);
  let threw = '';
  try {
    docFromPdf(Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'));
  } catch (e) {
    threw = (e as Error).message;
  }
  ok(threw.startsWith('This PDF has no text in it (a scanned page?)'), 'a PDF without text: words a person can act on', threw);
  let notPdf = '';
  try {
    docFromFile(Buffer.from('hello'), 'x.pdf');
  } catch (e) {
    notPdf = (e as Error).message;
  }
  ok(/not a PDF/i.test(notPdf), 'a file that is no PDF says so', notPdf);
}

// ---- PDFs printed by the browser, read back -----------------------------------------------------------------------------
if (canCapture()) {
  const print = (d: Doc, title: string) =>
    withTab({ html: docPage(db, d, title, 'print'), width: 1280, height: 800, settleMs: 300 }, async (tab) => {
      await tab.evaluate('document.fonts.ready.then(() => new Promise((ok) => setTimeout(() => ok(true), 120)))');
      await tab.evaluate("new Promise((ok) => { const t = Date.now(); const w = () => (!document.querySelector('script[data-paginate]') || document.documentElement.dataset.paged || Date.now() - t > 15000 ? ok(true) : setTimeout(w, 50)); w(); })").catch(() => {});
      return printPdf(tab.s, { paperWidth: 8.27, paperHeight: 11.69, margin: 0, cssPageSize: true });
    });
  const show = (d: Doc) => d.blocks.map((b) => `${b.type === 'li' ? `li:${b.list}:${b.lvl ?? 0}` : b.type === 'p' ? (b.style ?? 'p') : b.type}|${b.type === 'p' || b.type === 'li' ? runsText(b.runs) : ''}`);
  {
    const pdf = await print(doc, 'Water notes');
    kept('doc.pdf', pdf);
    const back = docFromFile(pdf, 'Water notes.pdf');
    const got = show(back);
    const at = (s: string) => got.findIndex((g) => g === s);
    ok(at('title|Water notes') === 0, 'the title', got);
    ok(at('h1|Results') > 0 && at('h2|Steps') > at('h1|Results') && at('h1|References') > at('h2|Steps'), 'the headings, by their sizes, in order', got);
    ok(got.some((g) => /^p\|Water boils1? at 100 °C, as shown \(Doe, 2020\); see Figure 1 and the table\.$/.test(g)), 'a paragraph, its words as they read', got);
    ok(at('li:bullet:0|First step') > 0 && at('li:bullet:0|Second step') > 0 && at('li:bullet:1|A deeper step') > 0 && at('li:number:0|One') > 0 && at('li:number:0|Two') > 0, 'list items, a level deeper too', got);
    ok(got.some((g) => g.startsWith('p|Doe, J. (2020). Boiling points. Nature')), 'the bibliography', got);
    ok(!got.some((g) => /Water notes$/.test(g) && !g.startsWith('title')) && !got.some((g) => /^p\|Page \d of \d$/.test(g)), 'its header and footer left out', got);
  }
  {
    // Two columns, read one after the other.
    const words = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
    const cols = normalizeDoc({ blocks: [{ title: 'Two columns' }, ...words.map((w) => ({ type: 'p', runs: [{ t: `${w} starts this paragraph, ${'and its words go on for a while across the column '.repeat(3)}until ${w.toLowerCase()} ends it.` }] }))], page: { cols: 2 } });
    const pdf = await print(cols, 'Two columns');
    kept('cols.pdf', pdf);
    const back = docFromPdf(pdf);
    const paras = back.blocks.filter((b) => b.type === 'p' && !b.style).map((b) => (b.type === 'p' ? runsText(b.runs) : ''));
    ok(paras.length === words.length && paras.every((p, i) => p.startsWith(`${words[i]} starts`) && p.endsWith(`until ${words[i].toLowerCase()} ends it.`)), 'two columns read one after the other, each paragraph whole', paras.map((p) => p.slice(0, 40) + '…' + p.slice(-30)));
  }
  closeCapture();
} else console.log('(no browser here: the printed PDFs are not read back)');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

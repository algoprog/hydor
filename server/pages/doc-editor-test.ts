// Script tests for the documents editor's model and files: what documents keep besides their words (line and paragraph
// spacing, callouts, a table of contents, equations, a header and footer with page numbers, tables' filled and merged
// cells, comments on words with their replies), checked as they come in from agents, the editor and files; read and
// written as Markdown (what agents get and send back); drawn on the document's own page and its print; and through
// Word (.docx) out and back in. Documents saved before any of this open unchanged. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/doc-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-doc-editor node dist/dev/doc-editor-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blockHtml, docMarkdown, docText, mdBlocks, normalizeDoc, tocEntries, type Block, type Cell, type Doc, type ParaBlock, type Run, type TableBlock } from '../../shared/docs.ts';
import { openDb } from '../db.ts';
import { parseXml } from '../documents/xml.ts';
import { Zip } from '../documents/zip.ts';
import { agentDoc, docForAgent, docFromFile, docPage, docxOfDoc, wordLosses } from './docs.ts';
import { ommlOf, texOfOmml } from './omml.ts';

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

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-doc-editor-test-')));
const db = openDb(path.join(tmp, 'test.db'));

/** The document read back from its kept text. */
const again = (d: Doc) => normalizeDoc(JSON.parse(docText(d)));
/** The document read back from its Markdown (for an agent: with its comments' marks). */
const viaMd = (d: Doc, comments = false) => normalizeDoc({ markdown: docMarkdown(d, { comments }), comments: d.comments });
const words = (b: Block | undefined) => (b && (b.type === 'p' || b.type === 'li') ? b.runs.map((r) => r.t).join('') : '');
const strip = (d: Doc) => JSON.stringify(d.blocks.map(({ id: _id, ...b }) => b));

// ---- documents saved before ------------------------------------------------------------------------------------
{
  const old = {
    v: 1,
    page: { size: 'a4', margin: 25.4 },
    font: 'Arial',
    size: 11,
    blocks: [
      { id: 'a1', type: 'p', style: 'title', runs: [{ t: 'Plan' }] },
      { id: 'a2', type: 'p', runs: [{ t: 'We grow ', b: true }, { t: 'beans' }] },
      { id: 'a3', type: 'li', list: 'number', runs: [{ t: 'Dig' }] },
      {
        id: 'a4',
        type: 'table',
        head: true,
        rows: [
          [{ runs: [{ t: 'A' }] }, { runs: [{ t: 'B' }] }],
          [{ runs: [] }, { runs: [{ t: '2' }], align: 'right' }],
        ],
      },
      { id: 'a5', type: 'pagebreak' },
      { id: 'a6', type: 'p', runs: [] },
    ],
  };
  const text = docText(old as Doc);
  ok(docText(normalizeDoc(JSON.parse(text))) === text, 'a document saved before opens unchanged');
  ok(!('comments' in normalizeDoc(old)) && !('header' in normalizeDoc(old)), 'and gains no fields it did not have');
}

// ---- line and paragraph spacing ------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    blocks: [
      { p: 'Airy', lh: 1.5, sb: 12, sa: 0 },
      { p: 'Words', line: 'double', before: '6pt', after: 3 },
      { bullet: 'Item', lh: 1.15 },
      { p: 'Bad', lh: 99, sb: -4 },
    ],
  });
  const [a, b, c, e] = d.blocks as ParaBlock[];
  ok(a.lh === 1.5 && a.sb === 12 && a.sa === 0, 'a paragraph keeps its line spacing and space before and after (0 too)');
  ok(b.lh === 2 && b.sb === 6 && b.sa === 3, 'spacing is read from words agents use ("double", "6pt")');
  ok(c.lh === 1.15, 'a list item keeps its line spacing');
  ok(e.lh === 5 && e.sb === undefined, 'spacing out of bounds is brought within them, or left out');
  const md = docMarkdown(d);
  ok(md.includes('Airy {line=1.5 before=12 after=0}') && md.includes('- Item {line=1.15}'), 'Markdown says spacing in braces');
  ok(strip(viaMd(d)) === strip(d), 'and reads it back');
  ok(blockHtml(a, '', { src: (s) => s }).includes('line-height:1.725;margin-top:12pt;margin-bottom:0pt'), 'the page draws it');
}

// ---- callouts ----------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    blocks: [
      { callout: 'Mind the **gap**', icon: '⚠️', tint: '#fce8e6' },
      { type: 'callout', text: 'Plain' },
      { callout: 'x', icon: '<b>' },
    ],
  });
  const [a, b, c] = d.blocks as ParaBlock[];
  ok(a.style === 'callout' && a.icon === '⚠️' && a.tint === '#fce8e6' && a.runs[1]?.b, 'a callout keeps its emoji, tint and words');
  ok(b.style === 'callout' && !b.icon && !b.tint, 'one without them has the usual ones (left out)');
  ok(!c.icon, 'an emoji that is markup is refused');
  const md = docMarkdown(d);
  ok(md.includes('> ⚠️ Mind the **gap** {.callout tint=#fce8e6}') && md.includes('> 💡 Plain {.callout}'), 'Markdown writes a callout as a quote with its emoji and {.callout}');
  ok(strip(viaMd(d)) === strip(d), 'and reads it back');
  const gh = normalizeDoc({ markdown: '> [!WARNING]\n> Hot surface.\n> Do not touch.\n' });
  const w = gh.blocks[0] as ParaBlock;
  ok(w.style === 'callout' && w.icon === '⚠️' && words(w) === 'Hot surface. Do not touch.', "GitHub's alerts are callouts");
  ok(blockHtml(a, '', { src: (s) => s }).includes('data-icon="⚠️"') && blockHtml(a, '', { src: (s) => s }).includes('--tint:#fce8e6'), 'the page draws its emoji and tint');
}

// ---- a table of contents -------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: '# Plan {.title}\n\n[TOC]\n\n# One\n\n## Two\n\n#### Deep\n' });
  ok(d.blocks[1].type === 'toc', '[TOC] is a table of contents');
  const toc = tocEntries(d);
  ok(toc.length === 2 && toc[0].text === 'One' && toc[1].level === 2, 'it lists the headings, levels 1 to 3, not the title');
  ok(docMarkdown(d).includes('\n[TOC]\n') && strip(viaMd(d)) === strip(d), 'Markdown writes it back as [TOC]');
  const html = blockHtml(d.blocks[1], '', { src: (s) => s, toc });
  ok(html.includes(`href="#nd-${toc[0].id}"`) && html.includes('>One</a>'), 'the page draws each heading as a link to it');
  ok(blockHtml(d.blocks[2], '', { src: (s) => s }).includes(`id="nd-${toc[0].id}"`), 'and the headings are where they lead');
  ok(normalizeDoc({ blocks: [{ toc: true }] }).blocks[0].type === 'toc' && normalizeDoc({ markdown: '\\tableofcontents' }).blocks[0].type === 'toc', 'agents may write it as {"toc": true} or \\tableofcontents');
  ok(docMarkdown(d, { tocLinks: true }).includes('- [One](#one)\n  - [Two](#two)'), 'a Markdown file has it as a list of links to its headings');
}

// ---- equations ---------------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: 'Energy: $E = mc^2$, costs $5 and $10.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n$$a+b$$\n\nPrice $$100 a day\n' });
  const p = d.blocks[0] as ParaBlock;
  ok(
    p.runs.some((r) => r.math && r.t === 'E = mc^2'),
    'maths among words is $…$',
  );
  ok(words(p).includes('costs $5 and $10.'), 'dollars in prices stay words');
  ok(d.blocks[1].type === 'math' && d.blocks[1].tex.startsWith('\\int_0^1'), '$$ on lines of their own is an equation');
  ok(d.blocks[2].type === 'math' && d.blocks[2].tex === 'a+b', 'and $$…$$ alone on a line');
  ok(words(d.blocks[3]).startsWith('Price $$100'), 'a line that only starts with $$ is words');
  ok(strip(viaMd(d)) === strip(d), 'Markdown writes equations back as they were');
  const tricky = normalizeDoc({ blocks: [{ p: [{ t: 'Pay $x$ now, or ' }, { t: 'y^2', math: true }, { t: ' later $' }] }] });
  ok(strip(viaMd(tricky)) === strip(tricky), 'words that look like maths are escaped, so they stay words');
  const two = normalizeDoc({
    blocks: [
      {
        p: [
          { t: '\\alpha', math: true },
          { t: 'b', math: true },
        ],
      },
    ],
  });
  ok((two.blocks[0] as ParaBlock).runs.length === 2, 'two equations side by side stay two');
  ok(
    normalizeDoc({ blocks: [{ math: '$$x$$' }, { type: 'equation', tex: '\\[y\\]' }] }).blocks.every((b) => b.type === 'math' && /^[xy]$/.test(b.tex)),
    'an equation written with its $$ or \\[ \\] keeps only its LaTeX',
  );
  const drawn = blockHtml(d.blocks[1], '', { src: (s) => s, math: (t, display) => `<M ${display}>${t.length}</M>` });
  ok(drawn.includes('<M true>'), 'the page draws an equation with what it is given to draw maths');
  const inline = blockHtml(p, '', { src: (s) => s, edit: true, math: () => '<K/>' });
  ok(inline.includes('data-tex="E = mc^2" contenteditable="false"><K/>'), 'in the editor, maths among words is one thing, its LaTeX kept on it');
}

// ---- tables: filled and merged cells ------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    blocks: [
      {
        table: [
          [{ text: 'Name', fill: '#e8f0fe', cs: 2 }, { text: 'gone' }, { text: 'Total', rs: 2, va: 'middle' }],
          ['Ada', '3', 'x'],
          ['Alan', { text: 'Big', cs: 9, rs: 9 }, '7'],
        ],
      },
    ],
  });
  const t = d.blocks[0] as TableBlock;
  const c = (r: number, k: number): Cell => t.rows[r][k];
  ok(c(0, 0).cs === 2 && c(0, 0).fill === '#e8f0fe' && c(0, 2).rs === 2 && c(0, 2).va === 'middle', 'cells keep their fill, alignment up and down, and merges');
  ok(
    c(0, 1).runs.length === 0 &&
      c(0, 0)
        .runs.map((r) => r.t)
        .join('') === 'Name\ngone',
    'a merged cell takes the words of the cells it covers',
  );
  ok(c(1, 2).runs.length === 0, 'covered cells are empty');
  ok(c(2, 1).cs === 2 && !c(2, 1).rs, 'a merge is kept within the table and off other merges');
  const md = docMarkdown(d);
  ok(md.includes('<table>') && md.includes('colspan="2"') && md.includes('background-color:#e8f0fe'), 'Markdown writes such a table as HTML');
  ok(strip(viaMd(d)) === strip(d), 'and reads it back the same');
  const html = blockHtml(t, '', { src: (s) => s, edit: true });
  ok(html.includes('data-c="0,0" data-t="" colspan="2"') && !html.includes('data-c="0,1"') && html.includes('vertical-align:middle'), 'the editor draws merged cells once, covered ones not at all');
  const plain = normalizeDoc({ markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |\n' });
  ok(!docMarkdown(plain).includes('<table'), 'a plain table stays a Markdown table');
}

// ---- header, footer and page numbers ------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: '# Report', header: 'ACME — Confidential', footer: { text: 'Page {page} of {pages}', align: 'center' }, titlePage: true });
  ok(d.header?.text === 'ACME — Confidential' && !d.header.align && d.footer?.align === 'center' && d.titlePage, 'a document keeps its header, footer and title page');
  ok(docText(again(d)) === docText(d), 'kept as text and read back');
  ok(!normalizeDoc({ markdown: 'x', titlePage: true }).titlePage && !normalizeDoc({ markdown: 'x', header: '   ' }).header, 'a title page needs a header or footer; an empty one is none');
  const print = docPage(db, d, 'Report', 'print');
  ok(print.includes('@bottom-center{content:"Page " counter(page) " of " counter(pages)') && print.includes('@top-left{content:"ACME — Confidential"'), 'printed, every page has them, with its number');
  ok(print.includes('@page:first{@top-left{content:none}'), 'but the title page');
  const evil = docPage(db, normalizeDoc({ markdown: 'x', header: '"}</style><script>alert(1)</script>' }), 'x', 'print');
  ok(!evil.includes('</style><script>') && !/<script/i.test(evil), 'a header cannot leave its stylesheet');
  const view = docPage(db, normalizeDoc({ markdown: 'One\n\n\\pagebreak\n\nTwo', footer: { text: 'Page {page} of {pages}', align: 'center' }, header: 'ACME', titlePage: true }), 'Report', 'viewer');
  ok(view.includes('class="nd-band nd-foot nd-center">Page 2 of 2') && view.includes('@media print{@page'), 'the page as it reads shows them on its sheets, and prints as the PDF does');
  ok(!view.includes('Page 1 of 2'), 'the title page without them');
}

// ---- comments ------------------------------------------------------------------------------------------------------
{
  const comments = [
    { id: 'c1', by: 'user', text: 'Is this right?', at: 1_700_000_000_000, quote: 'beans', replies: [{ id: 'r1', by: 'agent', text: 'Yes.', at: 1_700_000_100_000 }] },
    { id: 'c2', by: 'agent', text: 'Shorter?', at: 1_700_000_200_000, resolved: true },
  ];
  const d = normalizeDoc({
    blocks: [{ p: [{ t: 'We grow ' }, { t: 'beans', cm: ['c1'] }, { t: ' and ', cm: ['c1', 'c2', 'nope'] }, { t: 'peas', cm: ['c2'] }] }, { table: [[{ runs: [{ t: 'cell', cm: ['c2'] }] }]] }],
    comments,
  });
  const runs = (d.blocks[0] as ParaBlock).runs;
  ok(d.comments?.length === 2 && d.comments[0].replies?.[0].text === 'Yes.', 'a document keeps its comments and their replies');
  ok(runs[2].cm?.join() === 'c1,c2', 'words keep the comments on them, not ones it has not');
  ok(
    normalizeDoc({ blocks: [{ p: [{ t: 'x', cm: ['c9'] }] }] }).blocks.every((b) => !(b as ParaBlock).runs?.some((r: Run) => r.cm)),
    'marks of comments it does not have are dropped',
  );
  ok(docText(again(d)) === docText(d), 'kept as text and read back');
  ok(!docMarkdown(d).includes('data-comment'), 'Markdown for a file leaves comments out');
  const md = docMarkdown(d, { comments: true });
  ok(md.includes('<span data-comment="c1">beans</span>') && md.includes('<span data-comment="c1 c2"> and </span>'), 'for an agent, the words comments are on are marked');
  ok(strip(viaMd(d, true)) === strip(d), 'and read back where they were');
  ok(blockHtml(d.blocks[0], '', { src: (s) => s, edit: true }).includes('<span data-cm="c1">beans</span>') && !blockHtml(d.blocks[0], '', { src: (s) => s }).includes('data-cm'), 'the editor marks them; the page does not');
}

// ---- the page --------------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: '# Maths\n\nInline $\\alpha^2$ here.\n\n$$\\mathbb{R}^n$$\n' });
  const page = docPage(db, d, 'Maths', 'viewer');
  ok(page.includes('class="katex"') && page.includes('@font-face') && page.includes('data:font/woff2;base64,'), 'maths is drawn on the page, with its fonts inside it');
  ok(/@font-face\{[^}]*KaTeX_AMS/.test(page) && !/@font-face\{[^}]*KaTeX_Fraktur/.test(page), 'only the fonts its maths uses');
  ok(!docPage(db, normalizeDoc({ markdown: 'No maths.' }), 'x').includes('@font-face'), 'a page without maths carries none of it');
  const bad = docPage(db, normalizeDoc({ markdown: '$$\\frac{1}{$$' }), 'x');
  ok(bad.includes('katex-error') || bad.includes('class="katex"'), 'a formula KaTeX cannot read still makes a page');
}

// ---- Markdown for other things it reads -------------------------------------------------------------------------------
{
  const raw = mdBlocks('<table>\n<tr><td rowspan="2">A</td><td>B</td></tr>\n<tr><td>C</td></tr>\n</table>\n');
  const t = normalizeDoc({ blocks: raw }).blocks[0] as TableBlock;
  ok(t.type === 'table' && t.rows[0][0].rs === 2 && t.rows[1].length === 2 && t.rows[1][1].runs[0]?.t === 'C', 'an HTML table in Markdown keeps its merged cells in their places');
}

// ---- agents: comments, header and footer ------------------------------------------------------------------------------
{
  const prev = normalizeDoc({
    blocks: [{ p: [{ t: 'We grow ' }, { t: 'beans', cm: ['c1'] }, { t: ' and peas.' }] }, { p: 'Water daily.' }],
    header: 'Garden',
    footer: { text: 'Page {page}', align: 'right' },
    comments: [{ id: 'c1', by: 'user', text: 'Which beans?', at: 1_700_000_000_000, quote: 'beans' }],
  });
  const got = docForAgent(docText(prev));
  ok(got.includes('<span data-comment="c1">beans</span>') && got.includes('- c1 · open · on “beans” · the user') && got.includes('"reply"'), 'get_page shows the comments, their words marked, and how to answer');
  ok(got.includes('Header: “Garden”') && got.includes('Footer: “Page {page}” (right)'), 'and the header and footer');
  const md = docMarkdown(prev, { comments: true }).replace('beans</span>', 'runner beans</span>').replace('Water daily.', 'Water <span data-comment="n1">daily</span>.');
  const r = await agentDoc(
    db,
    {
      markdown: md,
      comments: [
        { id: 'c1', reply: 'Runner beans: changed.', resolve: true },
        { id: 'n1', text: 'Twice in August?' },
        { id: 'n2', text: 'Check the soil.', on: 'peas' },
        { id: 'zz', reply: 'x' },
      ],
    },
    tmp,
    docText(prev),
  );
  const c1 = r.doc.comments?.find((c) => c.id === 'c1');
  ok(c1?.resolved && c1.replies?.[0]?.by === 'agent' && c1.replies[0].text === 'Runner beans: changed.', 'an agent answers and resolves a comment');
  ok(c1?.quote === 'runner beans', 'its quote follows the words it is on');
  const n1 = r.doc.comments?.find((c) => c.id === 'n1');
  ok(n1?.by === 'agent' && n1.quote === 'daily', 'an agent adds a comment on the words it marks');
  ok(r.doc.comments?.find((c) => c.id === 'n2')?.quote === 'peas', 'or on the words it names');
  ok(
    r.notes.some((n) => n.includes('zz')),
    'a comment that is not there is said',
  );
  ok(r.doc.header?.text === 'Garden' && r.doc.footer?.align === 'right', 'the header and footer stay when not said');
  const r2 = await agentDoc(db, { markdown: 'Short.', header: '', footer: 'Page {page} of {pages}', titlePage: true }, tmp, r.text);
  ok(!r2.doc.header && r2.doc.footer?.text === 'Page {page} of {pages}' && r2.doc.titlePage, 'an agent removes, changes or sets them');
  ok(r2.doc.comments?.length === 3 && !r2.doc.blocks.some((b) => (b as ParaBlock).runs?.some((x) => x.cm)), 'comments whose words are gone stay, with their quotes');
}

// ---- Word's equations ------------------------------------------------------------------------------------------------
{
  const back = (tex: string) => {
    const x = ommlOf(tex);
    return x ? texOfOmml(parseXml(`<m:oMath xmlns:m="m">${x.slice('<m:oMath>'.length, -'</m:oMath>'.length)}</m:oMath>`).root) : null;
  };
  const f = ommlOf('\\frac{a+b}{\\sqrt[3]{x}}');
  ok(f?.includes('<m:f><m:num>') && f.includes('<m:rad><m:deg>'), "a fraction and a root are Word's own");
  ok(ommlOf('\\sum_{i=1}^{n} x_i^2')?.includes('<m:chr m:val="∑"/><m:limLoc m:val="undOvr"/>') ?? false, 'a sum keeps its limits under and over it');
  ok(ommlOf('\\alpha \\leq \\infty')?.includes('α') ?? false, 'Greek letters and operators are their characters');
  ok(ommlOf('\\left( \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix} \\right)')?.includes('<m:mr>') ?? false, 'matrices and growing brackets convert');
  ok(ommlOf('\\unknowncommand{x}') === null, 'what it does not know is said, so the LaTeX is written instead');
  ok(back('\\frac{1}{2}') === '\\frac{1}{2}' && back('x^{2}') === 'x^2' && back('\\sqrt{x}') === '\\sqrt{x}', 'and they read back as LaTeX');
  ok(back('\\alpha+\\beta')?.replace(/\s/g, '') === '\\alpha+\\beta', 'Greek letters read back as their commands');
}

// ---- Word, out and back in ------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    markdown: [
      '# Report {.title}',
      '[TOC]',
      '# Costs',
      'Spaced out {line=2 before=12 after=0}',
      '> 🔥 Hot topic {.callout tint=#fce8e6}',
      'Energy is $E=mc^2$ here.',
      '$$\n\\frac{a}{b}\n$$',
      '$$\n\\weird{x}\n$$',
      '## Details',
      '<table><tr><td colspan="2" style="background-color:#e8f0fe">Wide</td><td rowspan="2" style="vertical-align:middle">Tall</td></tr><tr><td>a</td><td>b</td></tr></table>',
    ].join('\n\n'),
    header: { text: 'ACME — {page}', align: 'right' },
    footer: 'Page {page} of {pages}',
    titlePage: true,
  });
  // A comment on "Spaced out", with a reply; another, resolved, on "here".
  const spaced = d.blocks.findIndex((b) => words(b).startsWith('Spaced'));
  const sp = d.blocks[spaced] as ParaBlock;
  const energy = d.blocks.find((b) => words(b).startsWith('Energy')) as ParaBlock;
  const withCm: Doc = normalizeDoc({
    ...d,
    blocks: d.blocks.map((b) => (b === sp ? { ...sp, runs: [{ t: 'Spaced', cm: ['k1'] }, { t: ' out' }] } : b === energy ? { ...energy, runs: energy.runs.map((r) => (r.t === ' here.' ? { ...r, cm: ['k2'] } : r)) } : b)),
    comments: [
      { id: 'k1', by: 'user', text: 'Too airy?', at: 1_700_000_000_000, replies: [{ id: 'x', by: 'agent', text: 'Made it 2 lines on purpose.', at: 1_700_000_500_000 }] },
      { id: 'k2', by: 'agent', text: 'Cite this.', at: 1_700_000_900_000, resolved: true },
    ],
  });
  const file = docxOfDoc(db, withCm, 'Report');
  const zip = new Zip(file);
  const xml = zip.text('word/document.xml') ?? '';
  ok(/<w:spacing w:before="240" w:after="0" w:line="480" w:lineRule="auto"\/>/.test(xml), "spacing goes to Word as the paragraph's own");
  ok(xml.includes('w:fill="FCE8E6"') && xml.includes('🔥'), 'a callout is a shaded paragraph with its emoji');
  ok(xml.includes('TOC \\o "1-3"') && /w:anchor="_Toc1"/.test(xml) && /<w:bookmarkStart w:id="\d+" w:name="_Toc1"\/>/.test(xml), 'a table of contents is a field Word fills in, its lines leading to bookmarks');
  ok(xml.includes('<m:oMathPara><m:oMath><m:f>') && xml.includes('<m:oMath>'), "equations are Word's own");
  ok(xml.includes('\\weird{x}') && xml.includes('Cambria Math'), 'one that does not convert is its LaTeX in a maths font');
  ok(xml.includes('<w:gridSpan w:val="2"/>') && xml.includes('<w:vMerge w:val="restart"/>') && xml.includes('<w:vMerge/>') && xml.includes('<w:vAlign w:val="center"/>'), 'merged cells and alignment go to Word');
  ok(xml.includes('<w:headerReference w:type="default"') && xml.includes('<w:titlePg/>'), 'the header and footer are parts of it, the first page apart');
  ok((zip.text('word/footer1.xml') ?? '').includes('w:instr=" NUMPAGES "') && (zip.text('word/header1.xml') ?? '').includes('w:instr=" PAGE "'), "with the page's number and count");
  const cx = zip.text('word/comments.xml') ?? '';
  ok(xml.includes('<w:commentRangeStart w:id="0"/>') && xml.includes('<w:commentReference w:id="1"/>') && cx.includes('w:author="Agent"') && cx.includes('Too airy?'), "comments are Word's own, replies too");
  ok((zip.text('word/commentsExtended.xml') ?? '').includes('w15:done="1"'), 'and Word knows which were resolved');
  const back = docFromFile(file, 'Report.docx');
  const bsp = back.blocks.find((b) => words(b) === 'Spaced out') as ParaBlock;
  ok(bsp?.lh === 2 && bsp.sb === 12 && bsp.sa === 0, 'spacing comes back from Word');
  const call = back.blocks.find((b) => b.type === 'p' && b.style === 'callout') as ParaBlock;
  ok(call?.icon === '🔥' && call.tint === '#fce8e6' && words(call) === 'Hot topic', 'a callout comes back');
  ok(back.blocks.filter((b) => b.type === 'toc').length === 1 && !back.blocks.some((b) => words(b) === 'Costs' && (b as ParaBlock).style === undefined), 'the table of contents comes back as one, its lines not as words');
  ok(
    back.blocks.some((b) => b.type === 'math' && b.tex === '\\frac{a}{b}'),
    'an equation comes back as LaTeX',
  );
  ok(
    (back.blocks.find((b) => words(b).startsWith('Energy')) as ParaBlock)?.runs.some((r) => r.math && r.t.replace(/\s/g, '') === 'E=mc^2'),
    'and maths among words',
  );
  const bt = back.blocks.find((b) => b.type === 'table') as TableBlock;
  ok(bt?.rows[0][0].cs === 2 && bt.rows[0][0].fill === '#e8f0fe' && bt.rows[0][2].rs === 2 && bt.rows[0][2].va === 'middle', 'merged and filled cells come back');
  ok(back.header?.text === 'ACME — {page}' && back.header.align === 'right' && back.footer?.text === 'Page {page} of {pages}' && back.titlePage, 'the header, footer and title page come back');
  const k1 = back.comments?.find((c) => c.text === 'Too airy?');
  ok(k1?.replies?.[0]?.text === 'Made it 2 lines on purpose.' && k1.replies[0].by === 'agent' && k1.quote === 'Spaced', 'comments come back with their replies and what they were on');
  ok(back.comments?.find((c) => c.text === 'Cite this.')?.resolved === true, 'and whether they were resolved');
  ok((back.blocks.find((b) => words(b) === 'Spaced out') as ParaBlock).runs[0].cm?.[0] === k1?.id, 'the words keep their comment');
  const losses = wordLosses(file, back);
  ok(!losses.loses.length && !losses.cut, 'a file written here loses nothing coming back');
}

// ---- comments' authors ------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    blocks: [{ p: [{ t: 'Budget ', cm: ['m1'] }, { t: 'and plan.' }] }],
    comments: [
      { id: 'm1', by: 'user', author: '  Maria   Lopez ', text: 'Too high?', at: 1_700_000_000_000, replies: [{ id: 'm1r', by: 'user', author: 'Jun Park', text: 'Agreed.', at: 1_700_000_100_000 }, { id: 'm1s', by: 'user', text: 'Cut it.', at: 1_700_000_200_000 }] },
      { id: 'm2', by: 'user', author: 'You', text: 'Mine.', at: 1_700_000_300_000 },
    ],
  });
  ok(d.comments?.[0].author === 'Maria Lopez' && d.comments[0].replies?.[0].author === 'Jun Park' && !d.comments[0].replies?.[1].author, 'a comment and its replies keep who wrote them, by name');
  ok(!d.comments?.[1].author, 'the names that stand for you and an agent are no names of their own');
  const file = docxOfDoc(db, d, 'Budget');
  const cx = new Zip(file).text('word/comments.xml') ?? '';
  ok(cx.includes('w:author="Maria Lopez"') && cx.includes('w:initials="ML"') && cx.includes('w:author="Jun Park"') && cx.includes('w:author="You" w:date="') && cx.includes('w:initials="Y"'), 'a Word file carries their names and initials');
  const back = docFromFile(file, 'Budget.docx');
  const m = back.comments?.find((c) => c.text === 'Too high?');
  ok(m?.author === 'Maria Lopez' && m.replies?.[0].author === 'Jun Park' && !m.replies?.[1].author && !back.comments?.find((c) => c.text === 'Mine.')?.author, 'and they come back from Word, yours as yours');
  ok(docForAgent(docText(d)).includes('“Maria Lopez”, 2023-11-14') && docForAgent(docText(d)).includes('↳ “Jun Park”'), 'get_page names them');
}

// ---- its own web page, opened again --------------------------------------------------------------------------------
{
  const d = normalizeDoc({
    markdown: [
      '# Plan {.title}',
      '[TOC]',
      '# One',
      'Airy {line=1.5 before=12 after=0}',
      'In a step {indent=1}',
      '- Dig',
      '  - Deeper',
      '1. First',
      '- [x] Done',
      '- [ ] To do',
      '> 🔥 Hot {.callout tint=#fce8e6}',
      '![A box](data:image/png;base64,iVBORw0KGgo= "Its caption"){width=40%}',
      '\\pagebreak',
      'Second page.',
    ].join('\n\n'),
    header: 'ACME',
    footer: { text: 'Page {page} of {pages}', align: 'center' },
  });
  const back = docFromFile(Buffer.from(docPage(db, d, 'Plan', 'viewer')), 'Plan.html');
  const kinds = back.blocks.map((b) => `${b.type}${b.type === 'p' && b.style ? `:${b.style}` : ''}${b.type === 'li' ? `:${b.list}${b.lvl ? b.lvl : ''}${b.checked ? 'x' : ''}` : ''}`);
  ok(
    kinds.join(' ') === 'p:title toc p:h1 p p li:bullet li:bullet1 li:number li:checkx li:check p:callout image pagebreak p',
    "a document's own web page opened again has its lists, checklists, callout, table of contents and page breaks",
  );
  ok(!back.blocks.some((b) => words(b).includes('ACME') || words(b).includes('Page 1')), 'and not its header and footer as words');
  const airy = back.blocks.find((b) => words(b) === 'Airy') as ParaBlock;
  ok(airy?.lh === 1.5 && airy.sb === 12 && airy.sa === 0 && (back.blocks.find((b) => words(b) === 'In a step') as ParaBlock)?.lvl === 1, 'nor its spacing and indents');
  const call = back.blocks.find((b) => b.type === 'p' && b.style === 'callout') as ParaBlock;
  ok(call?.icon === '🔥' && call.tint === '#fce8e6', "a callout keeps its emoji and tint");
  const pic = back.blocks.find((b) => b.type === 'image');
  ok(pic?.type === 'image' && pic.w === 0.4 && pic.caption === 'Its caption', 'a picture keeps its width and caption');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

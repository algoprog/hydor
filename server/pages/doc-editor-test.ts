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
import { docPage } from './docs.ts';

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
      { id: 'a4', type: 'table', head: true, rows: [[{ runs: [{ t: 'A' }] }, { runs: [{ t: 'B' }] }], [{ runs: [] }, { runs: [{ t: '2' }], align: 'right' }]] },
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
  const d = normalizeDoc({ blocks: [{ p: 'Airy', lh: 1.5, sb: 12, sa: 0 }, { p: 'Words', line: 'double', before: '6pt', after: 3 }, { bullet: 'Item', lh: 1.15 }, { p: 'Bad', lh: 99, sb: -4 }] });
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
  const d = normalizeDoc({ blocks: [{ callout: 'Mind the **gap**', icon: '⚠️', tint: '#fce8e6' }, { type: 'callout', text: 'Plain' }, { callout: 'x', icon: '<b>' }] });
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
}

// ---- equations ---------------------------------------------------------------------------------------------------------
{
  const d = normalizeDoc({ markdown: 'Energy: $E = mc^2$, costs $5 and $10.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n$$a+b$$\n\nPrice $$100 a day\n' });
  const p = d.blocks[0] as ParaBlock;
  ok(p.runs.some((r) => r.math && r.t === 'E = mc^2'), 'maths among words is $…$');
  ok(words(p).includes('costs $5 and $10.'), 'dollars in prices stay words');
  ok(d.blocks[1].type === 'math' && d.blocks[1].tex.startsWith('\\int_0^1'), '$$ on lines of their own is an equation');
  ok(d.blocks[2].type === 'math' && d.blocks[2].tex === 'a+b', 'and $$…$$ alone on a line');
  ok(words(d.blocks[3]).startsWith('Price $$100'), 'a line that only starts with $$ is words');
  ok(strip(viaMd(d)) === strip(d), 'Markdown writes equations back as they were');
  const tricky = normalizeDoc({ blocks: [{ p: [{ t: 'Pay $x$ now, or ' }, { t: 'y^2', math: true }, { t: ' later $' }] }] });
  ok(strip(viaMd(tricky)) === strip(tricky), 'words that look like maths are escaped, so they stay words');
  const two = normalizeDoc({ blocks: [{ p: [{ t: '\\alpha', math: true }, { t: 'b', math: true }] }] });
  ok((two.blocks[0] as ParaBlock).runs.length === 2, 'two equations side by side stay two');
  ok(normalizeDoc({ blocks: [{ math: '$$x$$' }, { type: 'equation', tex: '\\[y\\]' }] }).blocks.every((b) => b.type === 'math' && /^[xy]$/.test(b.tex)), 'an equation written with its $$ or \\[ \\] keeps only its LaTeX');
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
  ok(c(0, 1).runs.length === 0 && c(0, 0).runs.map((r) => r.t).join('') === 'Name\ngone', 'a merged cell takes the words of the cells it covers');
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
  ok(normalizeDoc({ blocks: [{ p: [{ t: 'x', cm: ['c9'] }] }] }).blocks.every((b) => !(b as ParaBlock).runs?.some((r: Run) => r.cm)), 'marks of comments it does not have are dropped');
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

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

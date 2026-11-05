// Script tests for the LaTeX editor's newer parts: the templates (each one typesets when TeX is here, made from the
// Library's New or by save_latex's template), what the setup says this TeX has, the word count (as texcount counts),
// the table editor's grid read from a tabular and written back, BibTeX entries (read, keyed, made safe, added to a
// .bib), the reference finder's reading of what was asked (and, with TEX_REFS_LIVE=1, real lookups on the web), the
// quick checks before typesetting, comments on a document's words (kept, found again when the text moves, answered
// by agents) and on a file's of this computer (kept by the app by its path, merged with an agent's answers, moved
// along with the file), and what get_page tells an agent. Through the routes, with a stand-in for the session
// manager. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/tex-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-tex-editor node dist/dev/tex-editor-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { TEX_ASKED } from '../../shared/latex-catalog.ts';
import { addBibEntry, bibInfo, bibKeyFor, bibKeys, bibText, cleanBibEntry, parseBibEntry, uniqueKey } from '../../shared/latex-bib.ts';
import { texCheck } from '../../shared/latex-check.ts';
import { texCount, texCountText, totalWords } from '../../shared/latex-count.ts';
import { blankTable, cellTex, cellText, tableAt, tableTex } from '../../shared/latex-table.ts';
import { TEMPLATE_NEEDS, TEX_TEMPLATES, texFromTemplate, texTemplate } from '../../shared/latex-templates.ts';
import { mergeTexComments, newTex, normalizeTex, parseTexText, texText } from '../../shared/latex.ts';
import { fileComments, moveFileComments } from './filecomments.ts';
import { refQuery } from './latex-refs.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tex-editor-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
  try {
    done(null, String(b).trim() ? JSON.parse(String(b)) : {});
  } catch (e) {
    done(e as Error, undefined);
  }
});
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = {
  app,
  db,
  sessions: { deliverOrQueue: async () => {} },
  broadcast: () => {},
  toSubscribers() {},
  publicBase: () => 'https://naget.example',
} as unknown as Deps;
pages.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
const run = async (name: string, args: Record<string, unknown>): Promise<{ text?: string; error?: string }> => {
  try {
    const r = await tools[name].run(args, ctx);
    return { text: typeof r === 'string' ? r : r.text };
  } catch (e) {
    return { error: (e as Error).message };
  }
};
const idOf = (text?: string) => /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
const doc = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

const setup = (await req('GET', '/api/pages/tex/setup')).json();
const tex = !setup.missing && setup.engines?.pdflatex;

// ---- what this TeX has ------------------------------------------------------------------------------------------
{
  if (tex) {
    ok(Array.isArray(setup.installed) && setup.installed.includes('amsmath.sty') && setup.installed.every((n: string) => TEX_ASKED.includes(n)), 'the setup says which of the asked classes and packages TeX has');
    ok(!setup.installed.includes('no-such-package-here.sty'), 'and only those');
  } else ok(setup.installed === undefined, 'without TeX, the setup names no packages');
}

// ---- templates -----------------------------------------------------------------------------------------------------
{
  ok(TEX_TEMPLATES.length >= 8 && new Set(TEX_TEMPLATES.map((t) => t.id)).size === TEX_TEMPLATES.length, 'there are templates, each with its own id');
  for (const t of TEX_TEMPLATES) {
    const d = texFromTemplate(t.id, 'Heat & light');
    ok(normalizeTex(d) && d.main.includes('\\documentclass') && d.main.includes('\\end{document}'), `the ${t.id} template is a whole document`);
    if (t.id !== 'letter' && t.id !== 'cv') ok(d.main.includes('Heat \\& light'), `the ${t.id} template has its title, escaped`);
    ok(JSON.stringify(parseTexText(texText(d))) === JSON.stringify(normalizeTex(d)), `the ${t.id} template keeps as text and reads back`);
  }
  ok(texFromTemplate('article', 'Notes').main === newTex('Notes').main, 'the article template is the usual new document');
  ok(texFromTemplate('nonsense', 'X').main === newTex('X').main, 'an unknown template is the article');
  const greek = texFromTemplate('report', 'Θερμότητα');
  ok(greek.engine === 'xelatex' && greek.main.includes('\\usepackage{fontspec}'), 'a title pdfLaTeX cannot write makes a XeLaTeX document with a font for it');
  ok(!texFromTemplate('paper', 'Θερμότητα').main.includes('\\usepackage{times}'), 'and leaves out the fonts only pdfLaTeX reads');
  ok(texFromTemplate('cv', 'CV').engine === 'xelatex', 'the CV is typeset with XeLaTeX');

  // New in the Library sends the template's model.
  const made = (await req('POST', '/api/pages', { title: 'Talk', kind: 'tex', model: texFromTemplate('beamer', 'Talk') })).json();
  const back = (await req('GET', `/api/pages/${made.page.id}`)).json();
  ok(back.page.kind === 'tex' && back.model.main.includes('\\begin{frame}') && back.model.main.includes('\\title{Talk}'), 'New makes a document from a template');

  // save_latex's template.
  const r = await run('save_latex', { title: 'Wave notes', template: 'homework' });
  const id = idOf(r.text);
  const m = (await req('GET', `/api/pages/${id}`)).json().model;
  ok(id && m.main.includes('\\newtheorem{problem}') && m.main.includes('Wave notes'), 'save_latex starts a document from a template, with its title');
  const thesis = (await req('GET', `/api/pages/${idOf((await run('save_latex', { title: 'My thesis', template: 'thesis' })).text)}`)).json().model;
  ok(thesis.files.some((f: { name: string }) => f.name === 'refs.bib') && thesis.main.includes('\\frontmatter'), 'a template by another name (thesis), with its bibliography');
  const mixed = (await req('GET', `/api/pages/${idOf((await run('save_latex', { title: 'Mine', template: 'report', files: { 'notes.tex': 'Notes.' } })).text)}`)).json().model;
  ok(mixed.main.includes('\\chapter{Introduction}') && mixed.files.some((f: { name: string }) => f.name === 'notes.tex'), 'files sent with a template go in beside it');
  ok((await run('save_latex', { title: 'X', template: 'menu' })).error?.includes('no LaTeX template'), 'an unknown template is refused, saying which there are');
  const again = await run('save_latex', { id, title: 'Wave notes', template: 'poster' });
  ok(!again.error && (await req('GET', `/api/pages/${id}`)).json().model.main.includes('\\newtheorem{problem}'), 'a template is for new documents only: a saved one keeps its source');
  ok(tools.save_latex.inputSchema && JSON.stringify(tools.save_latex.inputSchema).includes('"template"') && String(tools.save_latex.description).includes('template:'), 'save_latex tells agents of its templates');

  // The papers in the styles conferences ask for: one family, each with its class, its bibliography style and refs.bib.
  const papers = TEX_TEMPLATES.filter((t) => t.family === 'paper').map((t) => t.id);
  ok(['paper', 'ieee', 'acm', 'lncs'].every((x) => papers.includes(x as never)), 'the papers are a family: two columns, IEEE, ACM and Springer LNCS');
  for (const [id, cls, bst] of [
    ['ieee', '\\documentclass[conference]{IEEEtran}', '\\bibliographystyle{IEEEtran}'],
    ['acm', '\\documentclass[sigconf]{acmart}', '\\bibliographystyle{ACM-Reference-Format}'],
    ['lncs', '\\documentclass[runningheads]{llncs}', '\\bibliographystyle{splncs04}'],
  ] as const) {
    const d = texFromTemplate(id, 'Heat & light');
    ok(d.engine === 'pdflatex' && d.main.includes(cls) && d.main.includes(bst) && d.main.includes('\\title{Heat \\& light}') && d.files.some((f) => f.name === 'refs.bib'), `the ${id} template is a paper in its class, with its bibliography style`);
    ok(texTemplate(id)!.needs.some((n) => n.endsWith('.cls')) && texTemplate(id)!.needs.some((n) => n.endsWith('.bst')), `the ${id} template asks for its class and its bibliography style`);
  }
  ok(TEMPLATE_NEEDS.includes('IEEEtran.cls') && TEX_ASKED.includes('acmart.cls') && TEX_ASKED.includes('splncs04.bst'), 'the setup asks TeX for the publishers’ classes and styles');
  const greekLncs = texFromTemplate('lncs', 'Θερμότητα');
  ok(greekLncs.engine === 'xelatex' && !greekLncs.main.includes('fontenc') && greekLncs.main.includes('\\usepackage{fontspec}'), 'a Greek title makes an LNCS paper XeLaTeX, without the font encoding only pdfLaTeX reads');
  const greekAcm = texFromTemplate('acm', 'Θερμότητα');
  ok(greekAcm.engine === 'xelatex' && !greekAcm.main.includes('fontspec'), 'an ACM paper keeps acmart’s own fonts for Greek letters');
  ok(texFromTemplate('acm', '热传导').main.includes('\\usepackage{fontspec}'), 'and gets a font for Chinese ones');
  for (const [alias, cls] of [
    ['ieeetran', 'IEEEtran'],
    ['sigconf', 'acmart'],
    ['springer', 'llncs'],
  ]) {
    const made = (await req('GET', `/api/pages/${idOf((await run('save_latex', { title: 'A paper', template: alias })).text)}`)).json().model;
    ok(made?.main.includes(`{${cls}}`), `save_latex knows the ${cls} template as ${alias} too`);
  }
  ok(/ieee \(IEEEtran/.test(String(tools.save_latex.description)) && /texlive-publishers/.test(String(tools.save_latex.description)), 'save_latex tells agents of the papers and what they need');
  // What the setup says to install for the templates this TeX lacks (or that MiKTeX installs them by itself).
  if (tex && setup.installed) {
    const lacking = TEMPLATE_NEEDS.filter((n) => !setup.installed.includes(n));
    ok(lacking.length ? !!(setup.add?.cmd || setup.add?.auto) : !setup.add || !!setup.add.auto, `the setup says what adds what the templates lack${setup.add?.cmd ? ` (${setup.add.cmd})` : ''}`);
    if (lacking.includes('IEEEtran.cls') && setup.add?.cmd?.startsWith('sudo apt')) ok(setup.add.cmd.includes('texlive-publishers'), 'on Debian or Ubuntu, the publishers’ classes come with texlive-publishers');
    if (lacking.includes('IEEEtran.cls')) {
      const c = (await req('POST', '/api/pages/tex/compile', { model: texFromTemplate('ieee', 'A test') })).json();
      const e = c.errors.find((x: { message: string }) => /IEEEtran/.test(x.message));
      ok(e && /texlive-publishers/.test(e.hint ?? '') && /tlmgr install ieeetran/.test(e.hint ?? ''), 'a paper whose class is missing says what to install');
    }
  }

  if (tex) {
    for (const t of TEX_TEMPLATES) {
      if (t.needs.some((n) => !setup.installed?.includes(n))) {
        console.log(`(the ${t.id} template needs ${t.needs.filter((n) => !setup.installed?.includes(n)).join(', ')}, which this TeX lacks)`);
        continue;
      }
      if (t.id === 'cv' && !setup.engines.xelatex) continue;
      const c = (await req('POST', '/api/pages/tex/compile', { model: texFromTemplate(t.id, 'A test of it') })).json();
      ok(c.ok && c.errors.length === 0 && c.pages >= 1, `the ${t.id} template typesets with no errors${c.errors?.length ? ` (${c.errors.map((e: { message: string }) => e.message).join('; ')})` : ''}`);
      ok(c.warnings.length === 0, `the ${t.id} template typesets with no warnings${c.warnings?.length ? ` (${c.warnings.map((e: { message: string }) => e.message).join('; ')})` : ''}`);
    }
  }
}

// ---- word count ----------------------------------------------------------------------------------------------------
{
  const t = `\\documentclass{article}
\\title{Not counted}
\\begin{document}
\\section{The first part}
Hello \\textbf{bold} world, it's a test~\\cite{x} of caf\\'e and \\href{http://x.y}{a link}.
% a comment with words in it
$x^2 + y$ inline and \\(a\\) too. 50\\% done.
\\begin{equation} E = mc^2 \\label{eq} \\end{equation}
\\[ a = b \\]
\\begin{figure}[htbp]\\centering\\includegraphics[width=3cm]{a.png}\\caption{A picture of things}\\label{fig:a}\\end{figure}
Footnote here\\footnote{Three more words.}.
\\begin{tabular}{lrr} A & B & C \\\\ \\hline \\end{tabular}
\\begin{verbatim}
code words not counted
\\end{verbatim}
中文字
\\end{document}`;
  const c = texCountText(t);
  ok(c.words === 24, `words in the text are counted as texcount does (${c.words})`);
  ok(c.headingWords === 3 && c.headings === 1, 'headings apart');
  ok(c.otherWords === 7, 'captions and footnotes apart');
  ok(c.inline === 2 && c.display === 2 && c.floats === 1, 'formulas in the text and on their own lines, and figures');
  ok(totalWords(c) === 34, 'and all together');
  const d = normalizeTex({ main: doc('\\section{One}\nFirst words here.\n\\input{chapters/two}'), files: { 'chapters/two.tex': '\\section{Two}\nSecond part words.', 'other.tex': 'Never read.' } });
  const whole = texCount(d);
  ok(whole.words === 6 && whole.headings === 2, 'a whole project counts the files main.tex reads, where it reads them');
  ok(texCount(d, 'main.tex').words === 3 && texCount(d, 'chapters/two.tex').words === 3 && texCount(d, 'other.tex').words === 2, 'or one file');
  ok(texCount(d, 'refs.bib').words === 0, 'a file that is not TeX has none');
}

// ---- tables --------------------------------------------------------------------------------------------------------
{
  const src = [
    'Before.',
    '\\begin{table}[htbp]',
    '  \\centering',
    '  \\caption{Results on the test set.}',
    '  \\label{tab:results}',
    '  \\begin{tabular}{|l|c|r|}',
    '    \\hline',
    '    Method & Accuracy (\\%) & Time \\\\',
    '    \\hline',
    '    Base\\_line & $x_1$ & 1.0 \\\\',
    '    Ours & \\textbf{86.5} & 1.3 \\\\',
    '    \\hline',
    '  \\end{tabular}',
    '\\end{table}',
    'After.',
  ].join('\n');
  const found = tableAt(src, src.indexOf('Ours'));
  ok('table' in found && found.table.rows.length === 3 && found.table.rows[1][0] === 'Base_line' && found.table.rows[1][1] === '$x_1$', 'a tabular reads into a grid, its escapes shown plain and its maths kept');
  ok('table' in found && found.table.align.join('') === 'lcr' && found.table.rules && found.table.lines === 'hline' && found.table.header, 'with its columns, its lines and its header');
  ok('table' in found && found.table.caption === 'Results on the test set.' && found.table.label === 'tab:results' && found.table.float, 'and the table around it, its caption and label');
  ok('table' in found && src.slice(found.from, found.to).startsWith('\\begin{table}') && src.slice(found.from, found.to).endsWith('\\end{table}'), 'the whole table environment is what goes');
  if ('table' in found) {
    const out = tableTex(found.table).text;
    const again = tableAt(out, 5);
    ok('table' in again && JSON.stringify(again.table) === JSON.stringify(found.table), 'written out and read again, it is the same table');
  }
  ok('table' in tableAt(src, src.indexOf('caption')), 'from the caption, the table is found too');
  ok('why' in tableAt('\\begin{tabular}{cc} \\multicolumn{2}{c}{X} \\\\ a & b \\end{tabular}', 5), 'merged cells are said to be beyond the grid');
  ok('why' in tableAt(src, 2), 'outside a table there is none');
  const grid = tableAt('\\begin{tabular}{ll}\\hline a & b \\\\\\hline c & d \\\\\\hline e & f \\\\\\hline\\end{tabular}', 5);
  ok('table' in grid && grid.table.lines === 'all', 'a line under every row is kept as such');
  const b = tableTex({ ...blankTable(2, 2), caption: 'Costs and prices' });
  ok(b.text.includes('\\toprule') && b.text.includes('\\label{tab:costs-and-prices}') && b.needs.includes('booktabs'), 'a new table has booktabs lines, its caption and a label made from it');
  ok(cellTex('50% & a_b $x_1$ #1') === '50\\% \\& a\\_b $x_1$ \\#1' && cellText(cellTex('50% & a_b $x_1$ #1')) === '50% & a_b $x_1$ #1', 'what would break a table is escaped going in, and plain coming back');
  const typed = tableTex({
    ...blankTable(2, 3),
    rows: [
      ['A', 'B', 'C'],
      ['1', '2', '3'],
    ],
  }).text;
  ok(tableAt(doc(typed), 50) && 'table' in tableAt(doc(typed), doc(typed).indexOf('& 2')), 'a table from the grid is one the grid reads');
  if (tex) {
    const c = (
      await req('POST', '/api/pages/tex/compile', {
        model: {
          main: `\\documentclass{article}\n\\usepackage{booktabs}\n\\begin{document}\n${
            tableTex({
              ...blankTable(3, 3),
              rows: [
                ['Item', 'Cost (%)', 'Note'],
                ['A_1', '$x^2$', 'R&D'],
                ['B', '3', '#2'],
              ],
              caption: 'Costs',
            }).text
          }\n\\end{document}\n`,
        },
      })
    ).json();
    ok(c.ok && c.errors.length === 0, 'a table from the grid typesets, with what would break it escaped');
  }
}

// ---- BibTeX ----------------------------------------------------------------------------------------------------------
{
  const crossref = ` @article{Knuth_1984, title={Literate Programming}, volume={27}, url={http://dx.doi.org/10.1093/comjnl/27.2.97}, DOI={10.1093/comjnl/27.2.97}, number={2}, journal={The Computer Journal}, publisher={Oxford University Press (OUP)}, author={Knuth, D. E.}, year={1984}, month=feb, pages={97–111} }`;
  const e = parseBibEntry(crossref);
  ok(e?.type === 'article' && e.key === 'Knuth_1984' && e.fields.length === 11, 'a BibTeX entry on one line is read, field by field');
  const c = cleanBibEntry(e!);
  ok(bibKeyFor(c) === 'knuth1984literate', 'its key is made as people make them');
  const text = bibText({ ...c, key: 'knuth1984literate' });
  ok(
    text.startsWith('@article{knuth1984literate,\n  author') && text.includes('month     = feb,') && text.includes('pages     = {97--111}') && text.includes('year      = 1984'),
    'written one field a line, in the usual order, months bare and page ranges as BibTeX has them',
  );
  const info = bibInfo({ ...c, key: 'k' });
  ok(info.title === 'Literate Programming' && info.authors === 'D. E. Knuth' && info.year === '1984' && info.venue === 'The Computer Journal', 'what a list shows of it');
  const safe = cleanBibEntry({
    type: 'article',
    key: 'a b',
    fields: [
      ['title', 'Fish &amp; <i>chips</i> 100% _good_ #1 {bad'],
      ['url', 'http://a.b/c_d%20e'],
      ['bad field', 'x'],
    ],
  });
  ok(safe.key === 'ab' && safe.fields.length === 2 && safe.fields[0][1] === 'Fish \\& chips 100\\% \\_good\\_ \\#1 bad' && safe.fields[1][1] === 'http://a.b/c_d%20e', 'values from the web are made safe for TeX (addresses kept as they are)');
  const added = addBibEntry('@book{knuth1984literate, title={x}}\n', text);
  ok(added.key === 'knuth1984literate2' && bibKeys(added.text).join() === 'knuth1984literate,knuth1984literate2', 'an entry added to a .bib gets a key no other has');
  ok(addBibEntry('', text).text === text, 'and starts an empty one');
  ok(uniqueKey('Smith2020', ['smith2020', 'smith20202']) === 'Smith20203', 'keys are told apart without regard to case');
  ok(parseBibEntry('@comment{x, y}') === null && parseBibEntry('not bibtex') === null, 'what is not an entry is not read as one');
  if (tex) {
    const bib = addBibEntry(
      addBibEntry('', text).text,
      bibText({
        type: 'misc',
        key: 'vaswani2017attention',
        fields: cleanBibEntry({
          type: 'misc',
          key: 'x',
          fields: [
            ['author', 'Ashish Vaswani and Noam Shazeer'],
            ['title', 'Attention Is All You Need'],
            ['year', '2017'],
            ['howpublished', 'arXiv:1706.03762'],
            ['eprint', '1706.03762'],
            ['archiveprefix', 'arXiv'],
            ['url', 'https://arxiv.org/abs/1706.03762'],
          ],
        }).fields,
      }),
    ).text;
    const c2 = (
      await req('POST', '/api/pages/tex/compile', {
        model: { main: doc('Cited~\\cite{knuth1984literate,vaswani2017attention}.\n\\bibliographystyle{plainnat}\n\\bibliography{refs}').replace('\\begin{document}', '\\usepackage{natbib}\n\\begin{document}'), files: { 'refs.bib': bib } },
      })
    ).json();
    ok(c2.ok && c2.errors.length === 0, 'entries made here typeset with BibTeX (plainnat, which shows their addresses)');
  }
}

// ---- references from the web -------------------------------------------------------------------------------------------
{
  const q = (s: string) => JSON.stringify(refQuery(s));
  ok(q('10.1093/comjnl/27.2.97') === '{"kind":"doi","doi":"10.1093/comjnl/27.2.97"}' && q('https://doi.org/10.1145/3292500.3330701') === '{"kind":"doi","doi":"10.1145/3292500.3330701"}', 'a DOI is told, bare or as an address');
  ok(q('doi: 10.1038/nature14539.') === '{"kind":"doi","doi":"10.1038/nature14539"}', 'with its last full stop left out');
  ok(
    q('arXiv:1706.03762') === '{"kind":"arxiv","id":"1706.03762"}' && q('https://arxiv.org/abs/1706.03762v5') === '{"kind":"arxiv","id":"1706.03762v5"}' && q('https://arxiv.org/pdf/2101.00001') === '{"kind":"arxiv","id":"2101.00001"}',
    'an arXiv paper is told, by its id or its address',
  );
  ok(q('hep-th/9901001') === '{"kind":"arxiv","id":"hep-th/9901001"}', 'old arXiv ids too');
  ok(refQuery('attention is all you need').kind === 'search', 'anything else is searched for');
  ok((await req('POST', '/api/pages/tex/reference', { query: '' })).statusCode === 400, 'nothing to find is refused');
  ok((await req('POST', '/api/pages/tex/reference', { query: 'x'.repeat(600) })).statusCode === 400, 'and too much');
  if (process.env.TEX_REFS_LIVE === '1') {
    const d = (await req('POST', '/api/pages/tex/reference', { query: '10.1093/comjnl/27.2.97' })).json();
    ok(d.kind === 'doi' && d.entries?.[0]?.key === 'knuth1984literate' && d.entries[0].bibtex.includes('Literate Programming'), 'a DOI comes back as its BibTeX (live)');
    const a = (await req('POST', '/api/pages/tex/reference', { query: 'arXiv:1706.03762' })).json();
    ok(a.entries?.[0]?.key === 'vaswani2017attention' && a.entries[0].bibtex.includes('archivePrefix = {arXiv}'), 'an arXiv paper comes back as an entry made from its record (live)');
    const s = (await req('POST', '/api/pages/tex/reference', { query: 'deep learning lecun nature' })).json();
    ok(s.entries?.length > 1 && s.entries.some((x: { title: string }) => x.title === 'Deep learning'), 'words find papers in Crossref and arXiv (live)');
    ok((await req('POST', '/api/pages/tex/reference', { query: '10.9999/no-such-thing-at-all-xyz' })).statusCode === 404, 'a DOI that is no paper is said to be none (live)');
  }
}

// ---- quick checks before typesetting ----------------------------------------------------------------------------------
{
  const t = [
    '\\documentclass{article}',
    '\\begin{document}',
    'Price \\$5 and $x^2$ and \\{ok\\}. % $ in a comment {',
    '\\begin{itemize}',
    '  \\item one',
    '\\end{enumerate}',
    'Text $ left open',
    '',
    '\\[ a \\]',
    '\\verb|}{$| fine',
    '\\begin{verbatim}',
    '} { $ \\begin{x}',
    '\\end{verbatim}',
    'One } too many.',
    '\\end{document}',
  ].join('\n');
  const found = texCheck(t);
  const at = (m: string) => found.find((x) => x.message.includes(m));
  ok(at('\\end{enumerate} has no \\begin{enumerate}') && t.slice(at('has no \\begin')!.from, at('has no \\begin')!.to) === '\\end{enumerate}', 'an \\end without its \\begin is found where it is');
  ok(at('\\begin{itemize} is not ended'), 'and a \\begin left open');
  ok(at('This $ is not closed before the paragraph ends'), 'a $ left open at a paragraph’s end');
  ok(at('This } has no {') && t.slice(at('This }')!.from, at('This }')!.to) === '}', 'a } with no { before it');
  ok(found.length === 4, `escaped characters, comments, \\verb and verbatim are passed over (${found.map((x) => x.message).join('; ')})`);
  ok(texCheck('\\begin{document}\n$a$ \\(b\\) \\[c\\] $$d$$ {e} \\begin{x}\\end{x}\n\\end{document}').length === 0, 'a sound file has nothing to say');
  ok(texCheck('\\(a').some((x) => x.message.includes('has no')) && texCheck('{a').some((x) => x.message.includes('never closed')), 'maths and braces never closed');
  for (const tpl of TEX_TEMPLATES) ok(texCheck(texFromTemplate(tpl.id, 'T').main).length === 0, `the ${tpl.id} template passes the quick checks`);
}

// ---- comments -----------------------------------------------------------------------------------------------------------
{
  const main = doc('\\section{Heat}\nHeat flows from hot to cold.\n%%%% naget-comments\nThe end.');
  const d = normalizeTex({
    main,
    files: { 'refs.bib': '@book{k, title={T}}' },
    comments: [
      { id: 'c1', by: 'user', text: 'Which rod?', at: 1, quote: 'Heat flows', file: 'main.tex', from: main.indexOf('Heat flows'), to: main.indexOf('Heat flows') + 10, replies: [{ id: 'r1', by: 'agent', text: 'Copper.', at: 2 }] },
      { id: 'c2', text: '<b>bold</b>\u0007 plain', file: 'gone.tex', from: 0, to: 1 },
      { id: 'c3', text: '' },
      { text: 'On the bibliography', file: 'refs.bib', from: 0, to: 5, quote: '@book' },
    ],
  });
  ok(d.comments?.length === 2 && d.comments[0].id === 'c1' && d.comments[0].replies?.[0].text === 'Copper.' && d.comments[1].file === 'refs.bib', 'comments are kept, checked: those on a file the document lacks or with nothing to say go');
  const kept = texText(d);
  const back = normalizeTex(parseTexText(kept));
  ok(JSON.stringify(back) === JSON.stringify(d), 'comments keep as text and read back');
  ok(kept.includes('\n!%%%% naget-comments\n') && back.main === main, 'a line of a file that reads like the comments’ marker is kept as itself');
  ok(kept.split('\n').filter((l) => l.startsWith('{"id":"c')).length === 2 && kept.trimEnd().endsWith('}'), 'each comment is a line of its own at the end, so versions diff by comment');
  const moved = normalizeTex({ ...d, main: main.replace('\\section{Heat}', '\\section{Heat}\nA new first line.') });
  ok(moved.main.slice(moved.comments![0].from, moved.comments![0].to) === 'Heat flows', 'text added before a comment’s words: it is found on them again');
  ok(normalizeTex({ main: doc('x'), comments: [{ text: 'a', from: 999, to: 5 }] }).comments?.[0].from === normalizeTex({ main: doc('x') }).main.length, 'a place past the end is held to the text');

  // Agents read them and answer.
  const made = await run('save_latex', { title: 'Commented', source: main });
  const id = idOf(made.text);
  const v1 = (await req('GET', `/api/pages/${id}`)).json().model;
  await req('POST', `/api/pages/${id}/versions`, {
    model: { ...v1, comments: [{ id: 'cu1', by: 'user', text: 'Say which rod: copper or steel?', at: Date.now(), quote: 'Heat flows', file: 'main.tex', from: v1.main.indexOf('Heat flows'), to: v1.main.indexOf('Heat flows') + 10 }] },
    base: 1,
  });
  const got = (await run('get_page', { id })).text ?? '';
  ok(/Comments: 1 open/.test(got) && /- cu1 on main\.tex:4 “Heat flows”, by the user: Say which rod/.test(got), 'get_page lists the comments, where they are and who wrote them');
  const answered = await run('save_latex', {
    id,
    title: 'Commented',
    comments: [
      { id: 'cu1', reply: 'Copper: I said so in the text.', resolve: true },
      { quote: 'The end.', text: 'Should this go?' },
      { id: 'nope', reply: 'x' },
      { quote: 'not there', text: 'y' },
    ],
  });
  const v3 = (await req('GET', `/api/pages/${id}`)).json().model;
  const cu1 = v3.comments.find((c: { id: string }) => c.id === 'cu1');
  ok(cu1?.resolved && cu1.replies?.[0]?.by === 'agent' && cu1.replies[0].text.startsWith('Copper'), 'an agent answers a comment and resolves it');
  ok(
    v3.comments.some((c: { by: string; quote: string }) => c.by === 'agent' && c.quote === 'The end.'),
    'and adds its own, on the words it quotes',
  );
  ok(/no comment nope/.test(answered.text ?? '') && /has no “not there”/.test(answered.text ?? ''), 'what could not be done is said');
  await run('save_latex', { id, title: 'Commented', source: v3.main.replace('\\section{Heat}', '\\section{Heat and cold}\nMore words first.') });
  const v4 = (await req('GET', `/api/pages/${id}`)).json().model;
  const c4 = v4.comments.find((c: { id: string }) => c.id === 'cu1');
  ok(v4.main.slice(c4.from, c4.to) === 'Heat flows', 'a source rewritten by an agent keeps each comment on its words');
}

// ---- comments on LaTeX files of this computer (Files), kept by the app by each file's path -----------------------------
{
  const dir = path.join(tmp, 'files', 'heat');
  fs.mkdirSync(dir, { recursive: true });
  const mainText = doc('\\section{Heat}\nHeat flows from hot to cold.\n\\input{results}');
  const resultsText = '\\section{Results}\nThe rod warms up.\n';
  fs.writeFileSync(path.join(dir, 'paper.tex'), mainText);
  fs.writeFileSync(path.join(dir, 'results.tex'), resultsText);
  const put = (body: unknown) => app.inject({ method: 'PUT', url: '/api/pages/file', payload: JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
  const open = async () => (await req('GET', `/api/pages/file?path=${encodeURIComponent(path.join(dir, 'paper.tex'))}`)).json();
  const o1 = await open();
  ok(o1.kind === 'tex' && !o1.model.comments && o1.tex.main === 'paper.tex' && o1.model.files.some((f: { name: string }) => f.name === 'results.tex'), 'a LaTeX file opens with its project, no comments yet');
  const at = (t: string, w: string) => ({ from: t.indexOf(w), to: t.indexOf(w) + w.length, quote: w });
  const mine = [
    { id: 'fc1', by: 'user', text: 'Which rod?', at: 1, file: 'main.tex', ...at(mainText, 'Heat flows') },
    { id: 'fc2', by: 'user', text: 'How fast?', at: 2, file: 'results.tex', ...at(resultsText, 'warms up') },
  ];
  const s1 = await put({ path: path.join(dir, 'paper.tex'), model: { ...o1.model, comments: mine }, mtime: o1.mtime, tex: { ...o1.tex, comments: [] } });
  ok(s1.statusCode === 200 && s1.json().comments?.length === 2 && fs.readFileSync(path.join(dir, 'paper.tex'), 'utf8') === mainText, 'saving keeps the comments in the app, the file as it was');
  ok(fileComments(db, path.join(dir, 'paper.tex'))[0]?.id === 'fc1' && fileComments(db, path.join(dir, 'results.tex'))[0]?.id === 'fc2', 'each by its own file’s path');
  const o2 = await open();
  ok(o2.model.comments?.length === 2 && o2.model.comments.find((c: { id: string }) => c.id === 'fc2')?.file === 'results.tex', 'the file opens again with its project’s comments');

  // An agent reads and answers them, without writing the file.
  const told = (await run('get_page', { path: path.join(dir, 'paper.tex') })).text ?? '';
  ok(/Comments: 2 open/.test(told) && /- fc1 on paper\.tex:4 “Heat flows”, by the user: Which rod\?/.test(told) && /- fc2 on results\.tex:2/.test(told), 'get_page with a path lists a file’s comments, by the files’ own names');
  const answered = await run('save_latex', { path: path.join(dir, 'paper.tex'), comments: [{ id: 'fc1', reply: 'Copper.' }, { file: 'paper.tex', quote: 'hot to cold', text: 'Say from where.' }] });
  ok(/1 resolved|3 open/.test(answered.text ?? '') && !answered.error, `save_latex with a path answers a file’s comments (${answered.error ?? answered.text})`);
  ok(fs.readFileSync(path.join(dir, 'paper.tex'), 'utf8') === mainText, 'and leaves the file as it is');
  const kept = fileComments(db, path.join(dir, 'paper.tex'));
  ok(kept.find((c) => c.id === 'fc1')?.replies?.[0]?.text === 'Copper.' && kept.some((c) => c.by === 'agent' && c.quote === 'hot to cold'), 'the answer and the agent’s own comment are kept on the file');

  // The editor saves what it had before the agent answered: both are kept (the user's resolution, the agent's reply).
  const theirs = o2.model.comments;
  const resolved = theirs.map((c: { id: string }) => (c.id === 'fc1' ? { ...c, resolved: true } : c));
  const s2 = await put({ path: path.join(dir, 'paper.tex'), model: { ...o2.model, comments: resolved }, mtime: s1.json().mtime, tex: { ...o2.tex, files: s1.json().files, comments: theirs } });
  const after = s2.json().comments as { id: string; resolved?: boolean; replies?: { text: string }[]; by: string }[];
  ok(after.find((c) => c.id === 'fc1')?.resolved && after.find((c) => c.id === 'fc1')?.replies?.[0]?.text === 'Copper.' && after.some((c) => c.by === 'agent'), 'a save keeps what an agent did meanwhile, with the user’s changes');
  // The user deletes the agent's comment: it stays deleted.
  const s3 = await put({ path: path.join(dir, 'paper.tex'), model: { ...o2.model, comments: after.filter((c) => c.by !== 'agent') }, mtime: s2.json().mtime, tex: { ...o2.tex, files: s2.json().files, comments: after } });
  ok(!s3.json().comments.some((c: { by: string }) => c.by === 'agent'), 'a comment deleted in the editor stays deleted');
  ok(mergeTexComments([], [], [{ id: 'x', by: 'agent', text: 't', at: 1, file: 'main.tex', from: 0, to: 0 }]).length === 1, 'one added elsewhere since comes in');

  // Files renames the folder: the comments go with it.
  const moved = path.join(tmp, 'files', 'heat-moved');
  fs.renameSync(dir, moved);
  moveFileComments(db, dir, moved);
  ok(fileComments(db, path.join(moved, 'results.tex'))[0]?.id === 'fc2' && !fileComments(db, path.join(dir, 'results.tex')).length, 'a folder renamed takes its files’ comments along');
  moveFileComments(db, path.join(moved, 'results.tex'), path.join(moved, 'findings.tex'));
  ok(fileComments(db, path.join(moved, 'findings.tex'))[0]?.id === 'fc2', 'and a file renamed, its own');
  ok(String(tools.get_page.description).includes('path') && String(tools.save_latex.description).includes('save_latex with path'), 'agents are told how to read and answer a file’s comments');
}

// ---- what an agent is told ---------------------------------------------------------------------------------------------
{
  const r = await run('save_latex', { title: 'Counted', source: doc('\\section{One}\nFour words of text.\n$x$ and \\[y\\]') });
  const got = (await run('get_page', { id: idOf(r.text) })).text ?? '';
  ok(/about 6 \(5 in the text, 1 in 1 heading, 0 in captions and footnotes\); 1 formula in the text, 1 on lines of their own/.test(got), 'get_page says how many words and formulas it has');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

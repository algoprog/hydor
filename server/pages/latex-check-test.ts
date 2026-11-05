// Script tests for the LaTeX editor's paper tools: the pre-submission check (latex-check.ts) and the arXiv package
// (latex-arxiv.ts). BibTeX read entry by entry (braces, quotes, @string, # joins, crossref, a broken entry), the keys
// cited, comments told from text (verbatim, \%, addresses with %, \verb, comment blocks, \iffalse) and taken out as
// arXiv should get them, the files a package needs, each check on small papers made here (anonymity, required parts,
// TODO marks, bold on the best values, a table of Experiments' worked out again with a stand-in for its records, the
// numbers traced to runs), the references online with canned answers (and, when the network is there, one real
// Crossref and arXiv lookup each), the pages, fonts and fields of a typeset PDF where TeX and poppler are installed,
// and the routes and the latex_check tool. Build and run in the worktree, with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/latex-check-test.ts
//   DATA_DIR=/tmp/hydor-test-latex-check node dist/dev/latex-check-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { normalizeTex, type TexDoc } from '../../shared/latex.ts';
import { ARXIV_DEFAULTS, detectVenue, venueById, venueWith, type CheckFinding, type CheckState } from '../../shared/latex-submit.ts';
import type { ResultsTable, RunRecord } from '../../shared/experiments.ts';
import { arxivPackage, flattenTex, pictureSize, stripComments, usedFiles } from './latex-arxiv.ts';
import { checkJob, finishedCheck, fontsOf, gridOf, infoOf, pagesOf, startCheck, useRecords } from './latex-check.ts';
import { differences, entryFrom, Lookup, sameVenue, type PaperRecord } from './latex-lookup.ts';
import { betterOf, bibAuthors, bibField, cellNumber, citesIn, cleanTex, parseBibFile, scanTex, tabularsIn, templateMode, texSources, titleLikeness } from './latex-paper.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-latex-check-test-')));
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
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
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
const setup = (await req('GET', '/api/pages/tex/setup')).json();
const tex = !setup.missing && setup.engines?.pdflatex;
const doc = (main: string, files: Record<string, string> = {}, pictures: Record<string, string> = {}): TexDoc => normalizeTex({ main, files, pictures });
/** A check run to its end (with a stand-in for the web when given). */
const check = async (d: TexDoc, venue: string, o: { fetch?: typeof fetch; project?: string } = {}) => {
  const st = startCheck(db, { doc: d, venue: venueWith(venue), project: o.project ?? null }, `test:${Math.random()}`, { fetch: o.fetch ?? offline });
  return finishedCheck(st.id, 240_000);
};
const ids = (st: CheckState) => st.findings.map((f) => f.id);
const has = (st: CheckState, prefix: string) => st.findings.find((f) => f.id.startsWith(prefix));
/** No network: every service fails at once. */
const offline: typeof fetch = async () => {
  throw new Error('offline');
};
/** A text file's edits made, as the editor makes them (each only where the text is as it was). */
const applied = (text: string, f: CheckFinding, file: string) => {
  let out = text;
  for (const e of [...(f.fix?.edits ?? [])].filter((x) => x.file === file).sort((a, b) => b.from - a.from)) {
    if (out.slice(e.from, e.to) !== e.was) throw new Error(`the edit's text is not where it was (${e.from})`);
    out = out.slice(0, e.from) + e.text + out.slice(e.to);
  }
  return out;
};

// ---- BibTeX, entry by entry ------------------------------------------------------------------------------------------
{
  const bib = [
    '% A comment before the entries, and an @ in it: me@example.org',
    '@string{acl = "Proceedings of the Annual Meeting of the ACL"}',
    '@STRING{ jmlr = {Journal of Machine Learning Research} }',
    '@inproceedings{devlin2019,',
    '  author = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},',
    '  title = {{BERT}: Pre-training of Deep Bidirectional Transformers},',
    '  booktitle = acl # ", Volume 1",',
    '  year = 2019, month = jun,',
    '}',
    '@article{nested,',
    '  title = "A title with {braces {inside} them} and {\\"o}",',
    '  journal = jmlr,',
    '}',
    '@inproceedings{child, title = {A Chapter}, author = {Ada Lovelace}, crossref = {parent}}',
    '@proceedings{parent, title = {The Proceedings}, booktitle = {The Proceedings}, year = {1843}}',
    '@misc{broken, title = {No closing brace, author = {X}',
    '@misc{after, title = {After the broken one}}',
    '@comment{@misc{commented, title = {Not an entry}}}',
  ].join('\n');
  const r = parseBibFile('refs.bib', bib);
  const keys = r.entries.map((e) => e.key);
  ok(keys.includes('devlin2019') && keys.includes('nested') && keys.includes('child') && keys.includes('parent') && keys.includes('after'), `BibTeX: the entries are read (${keys})`);
  ok(!keys.includes('commented'), 'an @comment is not an entry');
  const d = r.entries.find((e) => e.key === 'devlin2019')!;
  ok(bibField(d, 'booktitle') === 'Proceedings of the Annual Meeting of the ACL, Volume 1', `@string macros and # joins (${bibField(d, 'booktitle')})`);
  ok(bibField(d, 'month') === 'June' && bibField(d, 'year') === '2019', 'a month macro and a bare year');
  ok(bibField(d, 'title') === '{BERT}: Pre-training of Deep Bidirectional Transformers', 'braces inside a value are kept');
  ok(bib.slice(d.from, d.to).startsWith('@inproceedings{devlin2019') && bib.slice(d.from, d.to).endsWith('}'), 'an entry knows where it is');
  ok(d.line === 4, `and its line (${d.line})`);
  const n = r.entries.find((e) => e.key === 'nested')!;
  ok(bibField(n, 'title') === 'A title with {braces {inside} them} and {\\"o}', `a quoted value with braces (${bibField(n, 'title')})`);
  ok(bibField(n, 'journal') === 'Journal of Machine Learning Research', 'a macro defined with braces and spaces');
  ok(r.problems.some((p) => /broken/.test(p.message)), 'a broken entry is said, and the next one is still read');
  ok(bibAuthors(bibField(d, 'author')).families.join(',') === 'devlin,chang,lee,toutanova', 'family names from “Family, Given”');
  ok(bibAuthors('Ashish Vaswani and Noam Shazeer and others').families.join(',') === 'vaswani,shazeer' && bibAuthors('Ashish Vaswani and others').cut, '“Given Family” and “and others”');
  ok(bibAuthors('Kurt G{\\"o}del and Johannes van der Waals and John Smith Jr.').families.join(',') === 'godel,waals,smith', 'accents, particles and Jr.');
  ok(titleLikeness('Attention Is All You Need', 'Attention is all you need.') === 1 && titleLikeness('BERT', 'GPT') === 0, 'titles compared by their words');
}

// ---- what a paper cites ----------------------------------------------------------------------------------------------
{
  const d = doc('\\documentclass{article}\n\\begin{document}\nAs \\citet[p.~3]{a} and \\citep[see][]{b, c} say; \\cite{d}\\nocite{e}.\n% \\cite{commented}\n\\input{more}\n\\end{document}\n', {
    'more.tex': 'More: \\parencite{f} and \\textcite{g}. \\Citeauthor{h}.',
  });
  const u = citesIn(texSources(d));
  ok(u.uses.map((x) => x.key).join(',') === 'a,b,c,d,e,f,g,h', `every citation, in order, the files read too (${u.uses.map((x) => x.key)})`);
  const b = u.uses.find((x) => x.key === 'c')!;
  ok(d.main.slice(b.from, b.to) === 'c' && b.line === 3, 'each key knows where it is');
  ok(!u.all && citesIn(texSources(doc('\\documentclass{article}\\begin{document}\\nocite{*}\\end{document}'))).all, '\\nocite{*} cites them all');
}

// ---- comments, and text taken as it is -------------------------------------------------------------------------------
{
  const src = [
    'A line % a comment',
    '% a line that is only a comment',
    '50\\% of it, and \\\\% this is a comment after a line break',
    '\\url{https://example.org/a%20b} and \\href{https://x.org/%7Euser}{text}',
    '\\verb|50% verbatim| stays',
    '\\begin{verbatim}',
    'code % not a comment',
    '\\end{verbatim}',
    '\\begin{lstlisting}[language=Python]',
    'x = 1 % 2  # not a comment either',
    '\\end{lstlisting}',
    '\\begin{comment}',
    'all of this goes',
    '\\end{comment}',
    '\\iffalse',
    'switched off \\ifx a b yes \\fi still off',
    '\\fi',
    '\\iffalse kept \\else shown \\fi',
    'end%',
    'joined',
  ].join('\n');
  const scan = scanTex(src);
  ok(scan.comments.length === 4, `the comments are found, and only they (${scan.comments.map((c) => JSON.stringify(src.slice(c.from, c.to)))})`);
  ok(scan.commentEnvs.length === 1 && scan.iffalse.length === 1, 'a comment block, and the \\iffalse without an \\else (not the one with)');
  const out = stripComments(src, { iffalse: true }).text;
  ok(out.includes('A line %\n') && !out.includes('% a comment'), 'a comment after text goes, its % stays');
  ok(!out.includes('a line that is only a comment') && !out.includes('\n\n50'), 'a line that is only a comment goes whole');
  ok(out.includes('50\\% of it, and \\\\%\n'), '\\% stays, and a % after \\\\ is a comment');
  ok(out.includes('\\url{https://example.org/a%20b}') && out.includes('\\href{https://x.org/%7Euser}{text}'), 'addresses keep their %');
  ok(out.includes('\\verb|50% verbatim| stays') && out.includes('code % not a comment') && out.includes('x = 1 % 2  # not a comment either'), '\\verb, verbatim and listings stay as they are');
  ok(!out.includes('all of this goes') && !out.includes('\\begin{comment}'), 'a comment block goes whole');
  ok(!out.includes('switched off') && out.includes('\\iffalse kept \\else shown \\fi'), 'an \\iffalse block goes (nested \\if… \\fi and all); one with \\else stays');
  ok(out.endsWith('end%\njoined'), 'a % that joins two lines stays');
  ok(!stripComments(src).text.includes('all of this goes') && stripComments(src).text.includes('switched off'), 'without the option, \\iffalse blocks stay');
  const clean = cleanTex(src);
  ok(clean.length === src.length && !clean.includes('a comment') && !clean.includes('code %'), 'the clean text is as long, with comments and literal text blanked');
}

// ---- venues and templates --------------------------------------------------------------------------------------------
{
  ok(detectVenue('\\documentclass[11pt]{article}\n\\usepackage[review]{acl}') === 'arr-long', 'ACL’s style points to ARR');
  ok(detectVenue('\\documentclass{article}\n\\usepackage{neurips_2026}') === 'neurips' && detectVenue('\\usepackage{iclr2027_conference,times}') === 'iclr', 'NeurIPS and ICLR');
  ok(detectVenue('\\documentclass[sigconf,anonymous]{acmart}\n\\acmConference[SIGIR ’27]{The 50th International ACM SIGIR Conference}{July 2027}{Rome}') === 'sigir-full', 'acmart with a SIGIR conference');
  ok(detectVenue('% \\usepackage{icml2026}\n\\documentclass{article}') === null, 'a commented line points nowhere');
  const acl = templateMode('\\documentclass{article}\n\\usepackage[final]{acl}\n');
  ok(acl.template === 'acl' && acl.anonymous === false && acl.toAnonymous?.[0].text === '\\usepackage[review]{acl}', `ACL in its final version, and the switch back (${acl.toAnonymous?.[0].text})`);
  const acm = templateMode('\\documentclass[sigconf,natbib=true,anonymous=true]{acmart}');
  ok(acm.anonymous === true, 'acmart with anonymous=true');
  const acm2 = templateMode('\\documentclass[sigconf]{acmart}');
  ok(acm2.anonymous === false && acm2.toAnonymous?.[0].text === '\\documentclass[sigconf,anonymous]{acmart}', 'acmart made anonymous');
  ok(templateMode('\\usepackage{neurips_2026}').anonymous === true && templateMode('\\usepackage[main, final]{neurips_2026}').anonymous === false, 'NeurIPS: anonymous unless final');
  const iclr = templateMode('\\usepackage{iclr2027_conference}\n\\iclrfinalcopy\n');
  ok(iclr.anonymous === false && iclr.toAnonymous?.[0].text === '% \\iclrfinalcopy', 'ICLR: \\iclrfinalcopy commented out');
  ok(templateMode('\\usepackage{iclr2027_conference}\n% \\iclrfinalcopy\n').anonymous === true, 'ICLR: anonymous with \\iclrfinalcopy commented out');
  ok(templateMode('\\documentclass{llncs}').anonymous === null, 'LNCS has no anonymous version of its own');
  ok(venueById('arr-long').pages === 8 && venueById('arr-long').finalPages === 9 && venueById('nothing').id === 'other', 'the presets');
  ok(venueWith('other', { pages: 12, anonymous: true }).pages === 12 && venueWith('other', { pages: 12, anonymous: true }).anonymous, 'Other’s own rules');
}

// ---- tables and their numbers ------------------------------------------------------------------------------------------
{
  const c = (raw: string) => cellNumber({ from: 0, to: raw.length, raw, col: 1, span: 1 });
  ok(c('0.412')?.value === 0.412 && c('0.412')?.digits === 3, 'a number');
  ok(c('\\textbf{87.5}')?.bold && c('$\\mathbf{0.5}$')?.bold && c('{\\bf 3}')?.bold, 'bold, three ways');
  ok(c('0.87 $\\pm$ 0.02')?.value === 0.87 && c('12.3\\%')?.percent, 'a value with ±, and a percentage');
  ok(c('0.5$^\\dagger$')?.marked && c('0.5*')?.marked && !c('0.5')?.marked, 'significance marks');
  ok(c('GPT-2') === null && c('--') === null && c('N/A') === null && c('') === null, 'words, dashes and nothing are not numbers');
  ok(c('\\cellcolor{gray!20}0.7')?.value === 0.7 && c('\\multicolumn{1}{c}{0.25}')?.value === 0.25, 'colours and \\multicolumn around a number');
  ok(betterOf('Latency (ms)').better === 'min' && betterOf('nDCG@10').better === 'max' && betterOf('WER $\\downarrow$').better === 'min' && !betterOf('Avg.').sure, 'which way is better, by the header');
  const t = tabularsIn(texSources(doc('\\documentclass{article}\\begin{document}\n\\begin{tabular}{l|cc}\n\\toprule\n& \\multicolumn{2}{c}{Scores} \\\\\nModel & P@10 & Loss \\\\\n\\midrule\nA & 0.5 & 1.2 \\\\ % a note: 0.9\nB & 0.6 & 1.1 \\\\\n\\bottomrule\n\\end{tabular}\n\\end{document}'))[0])[0];
  const g = gridOf(t);
  ok(g.head === 2 && g.rows.length === 4 && /P@10/.test(g.header[1]) && /Scores/.test(g.header[2]), `header rows and each column's header words (${g.head}, ${JSON.stringify(g.header)})`);
  ok(g.rows[2].cells[1].n?.value === 0.5 && g.rows[3].cells[2].n?.value === 1.1, 'each row’s numbers, a comment in a cell left out');
}

// ---- the checks, on small papers ---------------------------------------------------------------------------------------------
const PAPER = (body: string, pre = '\\documentclass[11pt]{article}\n\\usepackage[final]{acl}\n') =>
  `${pre}\\title{A Paper}\n\\author{Alice Smith \\\\ University of Somewhere \\thanks{Funded by ACME Corp.}}\n\\begin{document}\n\\maketitle\n${body}\n\\end{document}\n`;
{
  const d = doc(
    PAPER(
      [
        '\\begin{abstract}An abstract.\\end{abstract}',
        '\\section{Introduction}',
        'In our previous work \\cite{smith2020}, we showed it. Our code is available at \\url{https://github.com/alicesmith/tool}. We use \\url{https://github.com/facebookresearch/faiss} as is.',
        'A page: \\url{https://alicesmith.github.io}. TODO: add the second experiment. \\todo{check this number}',
        '\\section*{Acknowledgments}',
        'We thank Bob for his help.',
        '\\bibliography{refs}',
      ].join('\n'),
    ),
    { 'refs.bib': '@inproceedings{smith2020, author = {Smith, Alice}, title = {An Earlier Paper}, booktitle = {Proceedings of ACL}, year = {2020}}\n@misc{unused, title = {Never cited}, year = {2001}}\n' },
  );
  const st = await check(d, 'arr-long');
  const tpl = has(st, 'anon:template');
  ok(tpl?.level === 'must' && tpl.fix?.label === 'Make it anonymous', 'the template in its final version, with the switch to anonymous');
  ok(applied(d.main, tpl!, 'main.tex').includes('\\usepackage[review]{acl}'), 'and the switch makes it [review]');
  ok(has(st, 'anon:thanks:'), '\\thanks with the names shown');
  ok(st.findings.filter((f) => f.id.startsWith('anon:link:')).length === 2, `links: the paper’s own repository and a personal page, not a library it uses (${st.findings.filter((f) => f.id.startsWith('anon:link:')).map((f) => f.title)})`);
  ok(has(st, 'anon:own:'), '“our previous work” with a citation');
  const acks = has(st, 'anon:acks:');
  ok(acks?.level === 'must' && acks.fix?.label === 'Comment it out', 'acknowledgements, to comment out');
  const commented = applied(d.main, acks!, 'main.tex');
  ok(commented.includes('% \\section*{Acknowledgments}\n% We thank Bob for his help.\n\\bibliography{refs}'), 'commented out up to the bibliography');
  ok(has(st, 'parts:limitations')?.level === 'must', 'no Limitations section: ARR desk-rejects');
  ok(!has(st, 'parts:abstract'), 'the abstract is there');
  const todos = st.findings.filter((f) => f.id.startsWith('format:todo:'));
  ok(todos.length === 2 && todos.some((f) => f.fix?.label === 'Take it out'), `TODO marks: the word and the \\todo note, which can go (${todos.map((f) => f.title)})`);
  ok(has(st, 'refs:uncited:')?.level === 'info' && /unused/.test(has(st, 'refs:uncited:')!.detail!), 'an entry never cited, for information');
  ok(!st.findings.some((f) => f.group === 'refs' && f.level === 'must'), 'the cited entry is there');
  ok(st.done && !st.error, `the check ends (${st.error ?? ''})`);
  // Not anonymous: no anonymity findings at all.
  const open = await check(d, 'ieee');
  ok(!open.findings.some((f) => f.group === 'anon'), 'a venue that is not anonymous is not checked for it');
  ok(has(open, 'parts:index')?.level === 'must', 'IEEE asks for Index Terms');
}
{
  // References: keys cited but not defined, a key's case, the same paper twice, fields missing.
  const d = doc(PAPER('\\begin{abstract}x\\end{abstract}\nSee \\cite{nokey}, \\cite{Lee2019} and \\cite{p1,p2,p3}.\n\\section*{Limitations}\nSome.\n\\bibliography{refs}', '\\documentclass{article}\n'), {
    'refs.bib': [
      '@article{lee2019, author = {Lee, K.}, title = {A Study}, journal = {J}, year = {2019}}',
      '@inproceedings{p1, author = {Vaswani, Ashish}, title = {Attention Is All You Need}, booktitle = {NeurIPS}, year = 2017, doi = {10.5555/3295222.3295349}}',
      '@misc{p2, author = {Ashish Vaswani}, title = {Attention is all you need}, year = 2017, eprint = {1706.03762}, archivePrefix = {arXiv}}',
      '@article{p3, author = {Nobody, A.}, title = {Missing Its Journal}}',
    ].join('\n'),
  });
  const st = await check(d, 'other');
  ok(has(st, 'refs:undefined:nokey')?.level === 'must', 'a key cited but not defined');
  const kase = has(st, 'refs:case:Lee2019');
  ok(kase?.fix && applied(d.main, kase, 'main.tex').includes('\\cite{lee2019}'), 'a key cited with other capitals, fixed to the entry’s');
  ok(has(st, 'refs:twice:p1:p2'), 'the same paper under two keys');
  ok(/journal, year/.test(has(st, 'refs:fields:p3')?.title ?? ''), `fields a @article needs (${has(st, 'refs:fields:p3')?.title})`);
  ok(st.notes.some((n) => /could not be asked/.test(n)), 'services that could not be asked are said');
  ok(!has(st, 'refs:notfound:'), 'nothing is said not to exist when the services could not be asked');
}
{
  // Required parts: NeurIPS's checklist, and its answers still TODO.
  const d = doc('\\documentclass{article}\n\\usepackage{neurips_2026}\n\\begin{document}\n\\begin{abstract}x\\end{abstract}\nText.\n\\end{document}\n');
  ok(has(await check(d, 'neurips'), 'parts:checklist')?.level === 'must', 'no NeurIPS checklist');
  const d2 = doc('\\documentclass{article}\n\\begin{document}\n\\begin{abstract}x\\end{abstract}\n\\section*{NeurIPS Paper Checklist}\n\\answerYes{} \\answerTODO{}\n\\end{document}\n');
  const st = await check(d2, 'neurips');
  ok(!ids(st).includes('parts:checklist') && ids(st).includes('parts:checklist-todo'), 'a checklist with a question still TODO');
  ok(has(await check(doc('\\documentclass{article}\\begin{document}\\section{Intro}\\end{document}'), 'icml'), 'parts:impact'), 'ICML: no Impact Statement');
}

// ---- numbers -------------------------------------------------------------------------------------------------------------------
{
  const table = [
    '\\begin{table}',
    '\\begin{tabular}{lcc}',
    '\\toprule',
    'Model & nDCG@10 & Latency (ms) \\\\',
    '\\midrule',
    'BM25 & 0.412 & \\textbf{12} \\\\',
    'Ours & \\textbf{0.405} & 30 \\\\',
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
    '% hydor:table t1',
    '\\begin{tabular}{lc}',
    '\\toprule',
    'Run & MRR \\\\',
    '\\midrule',
    'A & 0.31 \\\\',
    'B & \\textbf{0.35} \\\\',
    '\\bottomrule',
    '\\end{tabular}',
    '\\begin{tabular}{lccc}',
    'Data & P & R & F1 \\\\',
    '\\hline',
    'X & 0.70 & 0.60 & 64.6 \\\\',
    'Y & 0.10 & 0.20 & 13.3 \\\\',
    '\\end{tabular}',
  ].join('\n');
  const d = doc(`\\documentclass{article}\\begin{document}\n${table}\n\\end{document}\n`);
  const newer: ResultsTable = {
    id: 't1',
    spec: { columns: [{ metric: 'mrr', better: 'max' }] },
    rows: [],
    latex: '% hydor:table t1\n\\begin{tabular}{lc}\n\\toprule\nRun & MRR \\\\\n\\midrule\nA & 0.31 \\\\\nB & \\textbf{0.36}$^\\dagger$ \\\\\n\\bottomrule\n\\end{tabular}\n',
    markdown: '',
    csv: '',
    madeAt: 0,
  };
  const runs = [{ id: 'r1', status: 'done', command: 'x', cwd: tmp, createdAt: 0, metrics: { last: { p: 0.7012, r: 0.6, f1: 0.6462 } } }] as RunRecord[];
  useRecords({ recomputeTable: (_db, id) => (id === 't1' ? newer : null), listRuns: () => runs });
  const st = await check(d, 'other');
  const bold = has(st, 'numbers:bold:');
  ok(bold?.level === 'must' && /0\.412/.test(bold.detail ?? ''), `bold on a value that is not the best (${bold?.detail})`);
  const fixed = applied(d.main, bold!, 'main.tex');
  ok(fixed.includes('BM25 & \\textbf{0.412} & \\textbf{12}') && fixed.includes('Ours & 0.405 & 30'), 'Move the bold puts it on the best, and only there');
  const stale = has(st, 'numbers:stale:t1');
  ok(stale?.level === 'must' && /0\.35 in the paper, 0\.36 now/.test(stale.detail ?? '') && stale.fix?.label === 'Update the table', `a table of Experiments' whose runs changed (${stale?.detail})`);
  ok(applied(d.main, stale!, 'main.tex').includes('B & \\textbf{0.36}$^\\dagger$') && applied(d.main, stale!, 'main.tex').includes('% hydor:table t1\n\\begin{tabular}'), 'Update the table puts in the new one, under its marker');
  const traced = st.findings.filter((f) => f.id.startsWith('numbers:traced:'));
  ok(traced.length === 2 && traced.some((f) => /^3 of the 6 numbers/.test(f.title)) && traced.some((f) => /^0 of the 4 numbers/.test(f.title)) && traced.every((f) => f.level === 'info'), `numbers traced to runs, as the table rounds them and as percentages (${traced.map((f) => f.title)})`);
  useRecords({ recomputeTable: () => null, listRuns: () => [] });
  const st2 = await check(d, 'other');
  ok(has(st2, 'numbers:gone:t1')?.level === 'info' && has(st2, 'numbers:noruns')?.level === 'info', 'no runs: said as information, never as an error');
  // Ties, blocks and a table with its metrics in rows are fine.
  const fine = doc(
    '\\documentclass{article}\\begin{document}\n\\begin{tabular}{lcc}\nModel & Acc & F1 \\\\\n\\midrule\nA & \\textbf{0.9} & \\textbf{0.8} \\\\\nB & 0.9 & 0.7 \\\\\n\\midrule\nC & \\textbf{0.5} & \\textbf{0.4} \\\\\nD & 0.4 & 0.3 \\\\\n\\end{tabular}\n\\begin{tabular}{lcc}\nMetric & M1 & M2 \\\\\n\\midrule\nLoss & \\textbf{0.1} & 0.2 \\\\\nAccuracy & 0.8 & \\textbf{0.9} \\\\\n\\end{tabular}\n\\end{document}\n',
  );
  ok(!has(await check(fine, 'other'), 'numbers:bold:'), 'ties, the best of each block, and metrics in rows: no finding');
}

// ---- the references online, with canned answers ---------------------------------------------------------------------------------
{
  const asked: string[] = [];
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  const canned: typeof fetch = async (input, init) => {
    const url = String(input);
    asked.push(url);
    // As the real fetch does: header values are bytes, not any character.
    for (const v of Object.values((init?.headers ?? {}) as Record<string, string>)) if (/[^\x00-\xff]/.test(v)) throw new TypeError('Cannot convert argument to a ByteString');
    if (url.startsWith('https://api.crossref.org/works/10.1000/known'))
      return json({ message: { DOI: '10.1000/known', type: 'proceedings-article', title: ['A Known Paper'], author: [{ given: 'Ada', family: 'Lovelace' }, { given: 'Charles', family: 'Babbage' }], issued: { 'date-parts': [[2021]] }, 'container-title': ['Proceedings of SIGIR'] } });
    if (url.startsWith('https://api.crossref.org/works/10.1000/nowhere')) return json({ status: 'error' }, 404);
    if (url.startsWith('https://api.datacite.org/dois/10.1000/nowhere')) return json({ errors: [] }, 404);
    if (url.startsWith('https://doi.org/api/handles/10.1000/nowhere')) return json({ responseCode: 100 });
    if (url.startsWith('https://export.arxiv.org/api/query'))
      return new Response(
        '<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T00:00:00Z</published><updated>2023-08-02T00:00:00Z</updated><title>Attention Is All You Need</title><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry><entry><id>http://arxiv.org/api/errors#incorrect_id_format_for_9999.99999</id><title>Error</title></entry></feed>',
        { status: 200 },
      );
    if (url.includes('api.crossref.org/works?') && url.includes('filter=type'))
      return json({ message: { items: [{ DOI: '10.5555/3295222.3295349', type: 'proceedings-article', title: ['Attention is All you Need'], author: [{ given: 'Ashish', family: 'Vaswani' }], issued: { 'date-parts': [[2017]] }, 'container-title': ['Advances in Neural Information Processing Systems'], page: '5998-6008', volume: '30' }] } });
    if (url.includes('api.crossref.org/works?')) return json({ message: { items: [{ DOI: '10.9/other', type: 'journal-article', title: ['Something Else Entirely'], issued: { 'date-parts': [[1999]] } }] } });
    if (url.includes('api.openalex.org/works?')) return json({ results: [] });
    if (url.includes('dblp.org')) return new Response('<html>Are you human?</html>', { status: 200 });
    if (url.includes('semanticscholar')) return json({ message: 'Too Many Requests' }, 429);
    return json({}, 404);
  };
  const bib = [
    '@inproceedings{known, author = {Lovelace, Ada}, title = {A Known Paper}, booktitle = {Proceedings of SIGIR}, year = {2020}, doi = {10.1000/known}}',
    '@article{vaswani2017, author = {Vaswani, Ashish and Shazeer, Noam}, title = {{Attention} Is All You Need}, journal = {arXiv preprint arXiv:1706.03762}, year = {2017}}',
    '@misc{nodoi, author = {X, Y}, title = {With a Bad DOI}, year = {2020}, doi = {10.1000/nowhere}}',
    '@inproceedings{ghost, author = {Nobody, Ann}, title = {A Paper That Was Never Written}, booktitle = {Somewhere}, year = {2020}}',
    '@misc{badid, title = {Wrong Id}, eprint = {9999.99999}, archivePrefix = {arXiv}, year = {2020}}',
  ].join('\n');
  const d = doc(PAPER('\\begin{abstract}x\\end{abstract}\\cite{known,vaswani2017,nodoi,ghost,badid}\n\\bibliography{refs}', '\\documentclass{article}\n'), { 'refs.bib': bib });
  const st = await check(d, 'other', { fetch: canned });
  const known = has(st, 'refs:differs:known');
  ok(known && /2021/.test(known.title + (known.detail ?? '')) && /2 authors|Babbage/.test(`${known.title} ${known.detail}`), `an entry whose year and authors differ from Crossref's (${known?.title} | ${known?.detail})`);
  const fixedBib = applied(bib, known!, 'refs.bib');
  ok(/@inproceedings\{known,/.test(fixedBib) && /year\s*= 2021/.test(fixedBib) && /Lovelace, Ada and Babbage, Charles/.test(fixedBib) && /doi\s*= \{10\.1000\/known\}/.test(fixedBib), 'Fix puts in the entry as Crossref lists it, under the same key');
  const pub = has(st, 'refs:published:vaswani2017');
  ok(pub && /Neural Information Processing Systems/.test(pub.title), `a preprint published since (${pub?.title})`);
  const pubBib = applied(bib, pub!, 'refs.bib');
  ok(/@inproceedings\{vaswani2017,/.test(pubBib) && /booktitle\s*= \{Advances in Neural Information Processing Systems\}/.test(pubBib) && /pages\s*= \{5998--6008\}/.test(pubBib) && !/arXiv preprint/.test(pubBib.split('@misc{nodoi')[0]), 'and its published entry, the preprint’s fields gone, its title’s braces kept');
  ok(/\{\{Attention\} Is All You Need\}/.test(pubBib), 'the title as the user wrote it, with its braces');
  ok(has(st, 'refs:nodoi:nodoi')?.level === 'check' && /as far as the services know/.test(has(st, 'refs:nodoi:nodoi')!.title), 'a DOI no one knows, said carefully');
  ok(has(st, 'refs:notfound:ghost')?.level === 'check' && /may not exist/.test(has(st, 'refs:notfound:ghost')!.detail ?? ''), 'a paper found nowhere: it may not exist, check it');
  ok(has(st, 'refs:noarxiv:badid'), 'an arXiv id arXiv does not have');
  ok(st.notes.some((n) => /DBLP/.test(n)), `DBLP’s check for people is said (${st.notes.join(' | ')})`);
  ok(asked.filter((u) => u.includes('export.arxiv.org')).length === 1, 'arXiv is asked for all its papers at once');
  // What was asked is kept: a second check asks the services nothing again.
  const before = asked.length;
  await check(d, 'other', { fetch: canned });
  ok(asked.length - before <= 2, `a second check uses what the services said (${asked.length - before} new requests)`);
  // The lookups alone.
  const lk = new Lookup({ db, fetch: canned });
  const r = await lk.byDoi('10.1000/known');
  ok(r?.year === 2021 && lk.requests === 0, 'a DOI answered from the cache');
  ok(sameVenue('Proceedings of the 44th International ACM SIGIR Conference on Research and Development in Information Retrieval', 'SIGIR') === true && sameVenue('NeurIPS', 'ICML') === false && sameVenue('A', 'B') === null, 'venues by their acronyms and names');
}
{
  // differences and entryFrom on their own.
  const bib = '@article{k, author = {Smith, John and Doe, Jane}, title = {On Things}, journal = {Journal of Things}, year = 2019}';
  const e = parseBibFile('r.bib', bib).entries[0];
  const rec: PaperRecord = { source: 'crossref', title: 'On Things', names: [{ family: 'Smith', given: 'John' }, { family: 'Roe', given: 'Richard' }], year: 2019, venue: 'Journal of Things', kind: 'journal' };
  const diffs = differences(e, rec);
  ok(diffs.length === 1 && /Doe/.test(diffs[0].text), `a name not among the authors (${diffs.map((x) => x.text)})`);
  ok(/author\s*= \{Smith, John and Roe, Richard\}/.test(entryFrom(bib, e, rec)), 'the entry made with the record’s authors');
  ok(differences(e, { ...rec, names: rec.names.slice(0, 1).concat({ family: 'Doe' }) }).length === 0, 'the same authors: nothing to say');
}

// ---- a typeset PDF: pages, fonts, the PDF's own fields ---------------------------------------------------------------------------
{
  const text = 'A title\nSome words of the abstract go here\n\fPage two text with many words in it\n1 Introduction\n\fMore text on page three\nReferences\nA. Author. A paper.\n\fAppendix text\n\f';
  const p = pagesOf(text, { freeHeadings: [] });
  ok(p.total === 4 && p.counted === 3 && p.refsAt === 3, `pages before the references (${JSON.stringify(p)})`);
  const top = pagesOf('Under review as a conference paper\nThe text of the first page\n\fUnder review as a conference paper\nReferences\nx\n\f', {});
  ok(top.counted === 1, `a references heading at the top of its page, under the running head: that page does not count (${JSON.stringify(top)})`);
  const acl = pagesOf('words words words words\n\fmore words here and there\nLimitations\nThe limits.\n\fReferences\n', { freeHeadings: ['limitations?'] });
  ok(acl.counted === 2 && /Limitations/.test(acl.heading ?? ''), 'the count stops at a part the venue does not count');
  const row = (n: string, t: string, e: string, emb: string) => `${n.padEnd(37)}${t.padEnd(18)}${e.padEnd(17)}${emb.padEnd(4)}no  no      4  0`;
  const fonts = fontsOf(
    [
      `${'name'.padEnd(37)}${'type'.padEnd(18)}${'encoding'.padEnd(17)}emb sub uni object ID`,
      `${'-'.repeat(36)} ${'-'.repeat(17)} ${'-'.repeat(16)} --- --- --- ---------`,
      row('ABCDEF+CMR10', 'Type 1', 'Builtin', 'yes'),
      row('T3Font_0', 'Type 3', 'Custom', 'yes'),
      row('Arial', 'TrueType', 'WinAnsi', 'no'),
    ].join('\n'),
  );
  ok(fonts.length === 3 && fonts[1].type === 'Type 3' && !fonts[2].emb && fonts[0].emb, 'pdffonts read');
  const info = infoOf('Title:           \nSubject:         \nAuthor:          Alice Smith\nPages:           2\n');
  ok(info.Author === 'Alice Smith' && info.Title === '' && info.Pages === '2', `pdfinfo read, its empty fields too (${JSON.stringify(info)})`);
  if (tex) {
    const d = doc(
      '\\documentclass{article}\n\\usepackage[pdfauthor={Alice Smith}]{hyperref}\n\\usepackage[margin=1cm]{geometry}\n\\begin{document}\n\\begin{abstract}x\\end{abstract}\n\\section{Intro}\nSee Section~\\ref{sec:none} and this.\\vspace{-3mm}\n\\section*{Limitations}\nSome.\n\\end{document}\n',
    );
    const st = await check(d, 'arr-long');
    const author = has(st, 'anon:pdfauthor');
    ok(author?.level === 'must' && author.fix?.label === 'Clear it', `the PDF's Author field names you (${author?.title})`);
    ok(author && applied(d.main, author, 'main.tex').includes('pdfauthor={}'), 'and Clear it empties it');
    ok(has(st, 'format:undefined:reference:sec:none'), 'an undefined reference');
    ok(st.pages?.total === 1 && st.pages.limit === 8, `the pages (${JSON.stringify(st.pages)})`);
    ok(!has(st, 'format:layout:main.tex') && !has(st, 'format:vspace:main.tex'), 'the template’s layout is only checked where the paper uses a venue’s template');
    const many = doc(`\\documentclass{article}\\begin{document}\n${Array.from({ length: 3 }, (_, i) => `\\section{S${i}}\n\\newpage`).join('\n')}\n\\end{document}\n`);
    const short = await check(many, 'other');
    ok(short.pages?.total === 3 && !has(short, 'format:pages'), 'no limit: the pages counted, no finding');
    const tight = await check(many, venueById('arr-short').id);
    ok(!has(tight, 'format:pages'), 'three pages are within four');
    const st3 = startCheck(db, { doc: many, venue: venueWith('other', { pages: 2 }) }, 'test:pages', { fetch: offline });
    const over = await finishedCheck(st3.id);
    ok(has(over, 'format:pages')?.level === 'must' && /3 pages/.test(has(over, 'format:pages')!.title), `over the limit (${has(over, 'format:pages')?.title})`);
  } else console.log('(no pdfLaTeX here: the PDF checks were not run)');
}

// ---- the arXiv package ---------------------------------------------------------------------------------------------------------------
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  ok(JSON.stringify(pictureSize(png)) === '{"w":1,"h":1}', 'a PNG’s size');
  const assets = (await req('POST', '/api/pages/assets', { data: `data:image/png;base64,${png.toString('base64')}` })).json();
  const d = doc(
    [
      '\\documentclass{article}',
      '\\usepackage{graphicx}',
      '\\usepackage{mystyle}',
      '\\graphicspath{{figures/}}',
      '\\begin{document}',
      '% a private note',
      'Text \\cite{a}. % another',
      '\\includegraphics{plot}',
      '\\input{sections/intro}',
      '\\include{sections/results}',
      '\\bibliographystyle{plain}',
      '\\bibliography{refs}',
      '\\end{document}',
      '',
    ].join('\n'),
    {
      'mystyle.sty': '\\RequirePackage{helper}\n',
      'helper.sty': '% helper\n',
      'unused.sty': '',
      'sections/intro.tex': 'Intro text. % note\n\\input{data.tikz}\n',
      'data.tikz': '% a figure\n',
      'sections/results.tex': 'Results.\n',
      'old/draft.tex': 'An old draft.\n',
      'refs.bib': '@book{a, author = {A. Author}, title = {A Book}, publisher = {P}, year = {2000}}\n',
    },
    { 'figures/plot.png': assets.src, 'figures/unused.png': assets.src, 'figures/my plot.png': assets.src },
  );
  const used = usedFiles(d, texSources(d), false);
  ok(
    [...used.files].sort().join(',') === 'data.tikz,helper.sty,mystyle.sty,sections/intro.tex,sections/results.tex' && [...used.pictures].join(',') === 'figures/plot.png',
    `the files it uses: what it reads, its styles (and theirs), its pictures through \\graphicspath (${[...used.files]} | ${[...used.pictures]})`,
  );
  ok(usedFiles(d, texSources(d), true).files.has('refs.bib'), 'and its .bib when it is sent');
  const texts = new Map<string, string>([['main.tex', d.main], ...d.files.map((f) => [f.name, f.text] as [string, string])]);
  const flat = flattenTex(d, texts);
  ok(flat.includes('Intro text. % note\n\\input{data.tikz}') === false && flat.includes('Intro text.') && flat.includes('\\clearpage\nResults.\n\\clearpage') && flat.includes('% a figure'), 'flattened: \\input in place, \\include between page breaks, in turn');
  const { zip, report } = await arxivPackage(db, d, ARXIV_DEFAULTS, 'My Paper: Results');
  const names = report.files.map((f) => f.name).sort();
  ok(report.name === 'My-Paper-Results-arxiv.zip' && zip.length === report.bytes, `the package's name and size (${report.name})`);
  ok(!names.includes('old/draft.tex') && !names.includes('unused.sty') && !names.includes('figures/unused.png') && names.includes('figures/plot.png') && names.includes('helper.sty'), `only what it uses (${names})`);
  ok(report.removed.some((r) => /comments/.test(r)) && report.removed.some((r) => /old\/draft\.tex/.test(r)), `what was left out is said (${report.removed.join(' | ')})`);
  ok(report.warnings.some((w) => /pick pdfLaTeX/.test(w)), 'what to pick on arXiv');
  if (tex) {
    ok(names.includes('main.bbl') && !names.includes('refs.bib') && !names.includes('plain.bst'), `the .bbl in, the .bib out (${names})`);
    ok(report.compiled.ok && report.compiled.pages >= 1, `the package typesets (${JSON.stringify(report.compiled.errors)})`);
    const r = (await req('POST', '/api/pages/tex/arxiv', { model: d, title: 'T', options: { strip: false, unused: false, bbl: false } })).json();
    ok(r.files.some((f: { name: string }) => f.name === 'refs.bib') && r.files.some((f: { name: string }) => f.name === 'figures/my-plot.png') && r.renamed.some((x: string[]) => x[1] === 'figures/my-plot.png'), 'everything, with names without spaces');
    const dl = await req('GET', `/api/pages/tex/arxiv/${r.token}`);
    ok(dl.statusCode === 200 && dl.headers['content-type'] === 'application/zip' && dl.rawPayload.subarray(0, 2).toString() === 'PK', 'its download');
  } else console.log('(no pdfLaTeX here: the package was not typeset)');
  ok((await req('GET', '/api/pages/tex/arxiv/0123456789abcdef01234567')).statusCode === 404, 'a package not kept: 404');
}

// ---- the routes and the tool ---------------------------------------------------------------------------------------------------------
{
  const model = doc('\\documentclass{article}\n\\begin{document}\n\\begin{abstract}x\\end{abstract}\nTODO\n\\end{document}\n');
  const st = (await req('POST', '/api/pages/tex/check', { model, venue: 'other' })).json() as CheckState;
  ok(typeof st.id === 'string' && !st.done, 'POST starts a check');
  let s: CheckState = st;
  for (let i = 0; i < 400 && !s.done; i++) {
    await new Promise((r) => setTimeout(r, 100));
    s = (await req('GET', `/api/pages/tex/check/${st.id}`)).json();
  }
  ok(s.done && s.findings.some((f) => f.id.startsWith('format:todo:')), 'GET follows it to its end');
  ok((await req('GET', '/api/pages/tex/check/nope')).statusCode === 404, 'a check not kept: 404');
  ok(checkJob(st.id)?.done, 'kept a while');
  // The tool, on a Library document and on a folder.
  const saved = await tools.save_latex.run({ title: 'Checked', source: '\\documentclass{article}\n\\usepackage[final]{acl}\n\\begin{document}\nText \\todo{x}.\n\\end{document}\n' }, ctx);
  const id = /\(page ([a-f0-9]{10})/.exec(typeof saved === 'string' ? saved : saved.text)?.[1] ?? '';
  const out = String(await tools.latex_check.run({ doc: id }, ctx));
  ok(/for ACL Rolling Review, long paper/.test(out) && /\[must fix\].*template is in its final version/.test(out) && /Limitations/.test(out), `latex_check: a Library document, its venue from its style (${out.slice(0, 300)})`);
  fs.mkdirSync(path.join(tmp, 'paper'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'paper', 'paper.tex'), '\\documentclass{article}\n\\begin{document}\nSee \\cite{x}.\n\\bibliography{refs}\n\\end{document}\n');
  fs.writeFileSync(path.join(tmp, 'paper', 'refs.bib'), '');
  const out2 = String(await tools.latex_check.run({ path: 'paper', venue: 'other' }, ctx));
  ok(/“x” is cited, but no entry has that key/.test(out2), `latex_check: a folder (${out2.slice(0, 300)})`);
  let err = '';
  try {
    await tools.latex_check.run({}, ctx);
  } catch (e) {
    err = (e as Error).message;
  }
  ok(/Give doc/.test(err), 'without a document it says what to give');
  // The paper on disk, for the apps.
  const onDisk = (await req('POST', '/api/pages/tex/paper', { model: doc('\\documentclass{article}\\begin{document}Hi\\end{document}'), page: id })).json();
  ok(onDisk.folder?.includes(path.join('pages', 'papers', id)) && fs.existsSync(path.join(onDisk.folder, 'main.tex')), `the paper's folder (${onDisk.folder})`);
  if (tex) ok(onDisk.pdf && fs.existsSync(onDisk.pdf) && /Checked\.pdf$/.test(onDisk.pdf), `and its PDF (${onDisk.pdf})`);
  ok((await req('POST', '/api/pages/tex/paper', { model: doc('\\documentclass{article}\\begin{document}Hi\\end{document}') })).statusCode === 400, 'which paper must be said');
}

// ---- real lookups, when the network is there --------------------------------------------------------------------------------------------
{
  const lk = new Lookup({ db: openDb(path.join(tmp, 'live.db')) });
  try {
    const bert = await lk.byDoi('10.18653/v1/N19-1423');
    if (bert === undefined) console.log('(no network: the real lookups were skipped)');
    else {
      ok(bert && /BERT/.test(bert.title) && bert.year === 2019 && bert.names[0].family === 'Devlin', `Crossref, for real (${bert?.title})`);
      const ax = await lk.byArxiv(['1706.03762']);
      const a = ax.get('1706.03762');
      if (a === undefined) console.log('(arXiv did not answer: skipped)');
      else ok(a && /Attention/.test(a.title) && a.years?.[0] === 2017, `arXiv, for real (${a?.title})`);
    }
  } catch (e) {
    console.log(`(the real lookups failed: ${(e as Error).message})`);
  }
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

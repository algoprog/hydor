// Script tests for the LaTeX editor's newer helpers: the guard on what AI may change (commands, maths, keys and
// comments kept; a rewrite that drops or makes up one is caught), proofreading's corrections checked against the source,
// Tidy the source (indents, lists, groups, verbatim left alone, tables lined up at their &), the as-you-type check of
// references to labels and keys the document lacks, Tidy the bibliography (sorted, unused taken out, duplicates merged
// with their citations moved, keys fixed, fields filled from DOIs), the words of typeset pages and finding in them, and
// the routes: rewrite (asked again once), write, an error explained and fixed, proofreading, papers for a claim and a
// picture read, all with stand-ins for the models and the web; a version named (and kept past the newest 40), the
// page_action tidies, and typesetting in draft and stop-at-the-first-error modes, cleared, and its words (with TeX here).
// Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/tex-ai-test.ts
//   DATA_DIR=/tmp/hydor-test-tex-ai node dist/dev/tex-ai-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { citedKeys, docLabels, proseParagraphs, smallestChange, texGuard, texKept, texProtected, touchesProtected } from '../../shared/latex-ai.ts';
import { bibNeedsFill, fillEntry, renameCites, splitBib, tidyBib } from '../../shared/latex-bibtidy.ts';
import { texRefCheck } from '../../shared/latex-check.ts';
import { findInPages, pageText, readBboxLayout } from '../../shared/latex-pdfwords.ts';
import { tidyTex } from '../../shared/latex-tidy.ts';
import { normalizeTex, type TexDoc } from '../../shared/latex.ts';
import { VERSION_LIMITS } from '../../shared/pages.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { checkCorrections, setLatexWriteForTests } from '../write/latex.ts';
import { write } from '../write/index.ts';
import { pages } from './index.ts';
import { addVersion, versionsOf } from './store.ts';

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
const eq = (a: unknown, b: unknown, what: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);

// ---- what AI may not change ------------------------------------------------------------------------------------------

{
  const src = 'Transformers \\citep{vaswani2017} beat RNNs on $n$ tasks (see Table~\\ref{tab:main}).\\footnote{As in \\url{https://x.org}.} % check this\n';
  const k = texKept(src);
  eq(k.keys, ['\\citep{vaswani2017}', '\\ref{tab:main}', '\\url{https://x.org}'], 'keys found');
  eq(k.fixed, ['$n$'], 'maths found');
  eq(k.comments, ['% check this'], 'comments found');
  ok(k.commands.includes('\\footnote'), 'commands found');
  eq(texGuard(src, 'Transformers \\citep{vaswani2017} outperform RNNs on $n$ tasks (see Table~\\ref{tab:main}).\\footnote{As in \\url{https://x.org}.} % check this\n'), [], 'a rewrite of the words alone passes');
  const dropped = texGuard(src, 'Transformers beat RNNs on $n$ tasks (see Table~\\ref{tab:main}).\\footnote{As in \\url{https://x.org}.} % check this\n');
  ok(dropped.some((p) => p.includes('\\citep{vaswani2017}')), `a dropped citation is said: ${dropped}`);
  const madeUp = texGuard(src, src.replace('\\citep{vaswani2017}', '\\citep{vaswani2017,devlin2019}'));
  ok(madeUp.some((p) => p.includes('left out \\citep{vaswani2017}')) && madeUp.some((p) => p.includes('made up')), `a citation changed and one made up are said: ${madeUp}`);
  ok(texGuard(src, src.replace('$n$', '$N$')).some((p) => p.includes('changed $n$ into $N$')), 'changed maths is said');
  ok(texGuard(src, src.replace(' % check this', '')).some((p) => p.includes('comment')), 'a dropped comment is said');
  ok(texGuard(src, src.replace('\\footnote{As in \\url{https://x.org}.}', 'As in \\url{https://x.org}.')).some((p) => p.includes('\\footnote')), 'a dropped command is said');
  eq(texGuard('A \\textbf{bold} claim.', 'Une affirmation \\textbf{audacieuse}.'), [], 'translated words inside a command pass');
  eq(texGuard('Spaces in $a + b$ maths.', 'Spaces in $a +  b$ maths now.'), [], 'spaces in maths do not count');
  eq(texGuard('\\begin{itemize}\n\\item One\n\\item Two\n\\end{itemize}', '\\begin{itemize}\n\\item One\n\\end{itemize}').length, 1, 'a dropped item is said once');
  ok(texGuard('See \\eqref{eq:1}.', 'See \\eqref{eq:2}.').length === 2, 'a changed label key is said');
  eq(texGuard('An equation:\n\\begin{equation}\n  E = mc^2 \\label{eq:e}\n\\end{equation}\n', 'This equation:\n\\begin{equation}\n  E = mc^2 \\label{eq:e}\n\\end{equation}\n'), [], 'a maths environment kept whole passes');
  ok(texGuard('\\begin{equation}\nE = mc^2\n\\end{equation}', '\\begin{equation}\nE = mc^3\n\\end{equation}').length > 0, 'a maths environment changed is said');
  eq(texGuard('Costs \\$5 and 10\\% more.', 'It costs \\$5 and 10\\% more.'), [], 'escaped characters are words');
  eq(texGuard('A \\verb|x_1| name.', 'The \\verb|x_1| name.'), [], '\\verb kept passes');
  ok(texGuard('A \\verb|x_1| name.', 'The \\verb|x_2| name.').length > 0, '\\verb changed is said');
}

{
  const doc = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\nIntro text with \\cite{a} here.\n\n$$x$$\n\nSecond paragraph, words and words.\n% just a comment\n\\end{document}\n';
  const paras = proseParagraphs(doc);
  eq(
    paras.map((p) => p.text),
    ['Intro text with \\cite{a} here.', 'Second paragraph, words and words.\n% just a comment\n\\end{document}'],
    'paragraphs of words: the preamble, maths and lone commands left out',
  );
  ok(paras.every((p) => doc.slice(p.from, p.to) === p.text), 'each paragraph is where it says');
  const spans = texProtected(doc);
  const at = doc.indexOf('\\cite{a}');
  ok(touchesProtected(spans, at + 6, at + 7), 'a key is protected');
  ok(touchesProtected(spans, 5, 6), 'the preamble is protected');
  ok(!touchesProtected(spans, doc.indexOf('Intro'), doc.indexOf('Intro') + 5), 'words are not');
  ok(!touchesProtected(spans, at, at), 'putting words in just before a command is fine');
  eq([...citedKeys(['\\cite{a, b}\\citep[p.~2]{c}', '% \\cite{d}', '\\nocite{*}']).keys], ['a', 'b', 'c'], 'cited keys (commented ones not)');
  ok(citedKeys(['\\nocite{*}']).all, '\\nocite{*} cites everything');
  eq([...docLabels(['\\label{a}\\begin{lstlisting}[label=lst:x]', '\\newcommand{\\lbl}[1]{\\label{#1}}\n\\lbl{made}'])].sort(), ['#1', 'a', 'lst:x', 'made'], 'labels, from options and the document’s own commands too');
}

{
  eq(smallestChange('teh cat', 'the cat'), { from: 0, to: 3, insert: 'the' }, 'a change takes its whole word');
  eq(smallestChange('the the cat', 'the cat'), { from: 4, to: 8, insert: '' }, 'a doubled word taken out');
  const paragraphs = [{ id: 1, text: 'Their are many model, see \\cite{smith} and $x$.' }];
  const c = checkCorrections(paragraphs, [
    { p: 1, find: 'Their are', replace: 'There are', why: 'spelling' },
    { p: 1, find: 'many model,', replace: 'many models,', why: 'agreement' },
    { p: 1, find: '\\cite{smith}', replace: '\\cite{smyth}', why: 'no' },
    { p: 1, find: 'and $x$', replace: 'and $y$', why: 'no' },
    { p: 1, find: 'not there', replace: 'x', why: 'no' },
    { p: 2, find: 'Their', replace: 'There', why: 'no such paragraph' },
  ]);
  eq(
    c.map((x) => [x.was, x.now]),
    [
      ['Their', 'There'],
      ['model', 'models'],
    ],
    'corrections that touch only words are kept, as their smallest change',
  );
  ok(paragraphs[0].text.slice(c[1].from, c[1].to) === 'model', 'a correction is where it says');
}

// ---- Tidy the source -------------------------------------------------------------------------------------------------

{
  const messy = [
    '\\documentclass{article}',
    '\\newcommand{\\note}[1]{%',
    '\\textbf{#1}}',
    '\\begin{document}',
    '\\section{One}   ',
    '\\begin{itemize}',
    '\\item First',
    'goes on',
    '      \\item Second',
    '\\begin{enumerate}',
    '\\item Inner',
    '\\end{enumerate}',
    '\\end{itemize}',
    '\\begin{figure}',
    '\\centering',
    '\\caption{A long caption',
    'that goes on}',
    '\\end{figure}',
    '\\begin{verbatim}',
    '   kept   ',
    '\\end{verbatim}',
    '\\[',
    'x = 1',
    '\\]',
    '\\begin{tabular}{lrr}',
    '\\toprule',
    'Model & Acc & F1 \\\\',
    '\\midrule',
    'BERT & 91.2 & 88 \\\\',
    'A much longer name & 9 & 100.5\\\\ \\hline',
    '\\multicolumn{2}{c}{x} & y \\\\',
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{document}',
  ].join('\n');
  const r = tidyTex(messy, { indent: '  ' });
  const want = [
    '\\documentclass{article}',
    '\\newcommand{\\note}[1]{%',
    '  \\textbf{#1}}',
    '\\begin{document}',
    '\\section{One}',
    '\\begin{itemize}',
    '  \\item First',
    '    goes on',
    '  \\item Second',
    '    \\begin{enumerate}',
    '      \\item Inner',
    '    \\end{enumerate}',
    '\\end{itemize}',
    '\\begin{figure}',
    '  \\centering',
    '  \\caption{A long caption',
    '    that goes on}',
    '\\end{figure}',
    '\\begin{verbatim}',
    '   kept   ',
    '\\end{verbatim}',
    '\\[',
    '  x = 1',
    '\\]',
    '\\begin{tabular}{lrr}',
    '  \\toprule',
    '  Model              & Acc  & F1    \\\\',
    '  \\midrule',
    '  BERT               & 91.2 & 88    \\\\',
    '  A much longer name & 9    & 100.5 \\\\ \\hline',
    '  \\multicolumn{2}{c}{x} & y \\\\',
    '  \\bottomrule',
    '\\end{tabular}',
    '\\end{document}',
  ];
  const got = r.text.split('\n');
  for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) ok(false, `tidy line ${i + 1}: got ${JSON.stringify(got[i])}, wanted ${JSON.stringify(want[i])}`);
  eq(r.tables, 1, 'one table lined up');
  ok(r.lines > 10, 'lines changed are counted');
  eq(tidyTex(r.text, { indent: '  ' }).text, r.text, 'tidy twice is tidy once');
  eq(tidyTex(r.text, { indent: '  ' }).lines, 0, 'nothing more to change');
  // Only the lines asked for.
  const part = tidyTex(messy, { indent: '  ', from: 6, to: 8 }).text.split('\n');
  eq([part[4], part[6], part[7], part[14]], ['\\section{One}   ', '  \\item First', '    goes on', '\\centering'], 'only the lines asked for change');
  // Braces that never close: indented by environments alone.
  eq(tidyTex('\\begin{document}\n\\textbf{open\n\\begin{center}\nx\n\\end{center}\n\\end{document}', { indent: '  ' }).text, '\\begin{document}\n\\textbf{open\n\\begin{center}\n  x\n\\end{center}\n\\end{document}', 'broken braces: environments alone');
  eq(tidyTex('\\begin{abstract}\n\tWords.\n\\end{abstract}').text, '\\begin{abstract}\n\tWords.\n\\end{abstract}', 'the file’s own step (a tab) is kept');
  eq(tidyTex('a & b \\\\\nc & d \\\\').text, 'a & b \\\\\nc & d \\\\', 'rows outside a table are not lined up');
  eq(tidyTex('\\begin{pmatrix}\n1 & 22 \\\\\n333 & 4\n\\end{pmatrix}', { indent: '  ' }).text, '\\begin{pmatrix}\n  1 & 22 \\\\\n  333 & 4\n\\end{pmatrix}', 'a last row without \\\\ is left as it is (one row is no table to line up)');
  eq(tidyTex('\\begin{tabular}{ll}\na & b \\\\ % note\ncc & d \\\\\n\\end{tabular}', { indent: '  ' }).text, '\\begin{tabular}{ll}\n  a & b \\\\ % note\n  cc & d \\\\\n\\end{tabular}', 'a row with a comment is left as it is');
}

// ---- references that point nowhere --------------------------------------------------------------------------------------

{
  const s = 'See \\ref{sec:a} and \\cref{fig:x,sec:b}. % \\ref{gone}\n\\newcommand{\\f}[1]{\\ref{#1}}\n\\cite{k1, k9}';
  const c = texRefCheck(s, new Set(['sec:a', 'sec:b']), new Set(['k1']));
  eq(
    c.map((x) => [s.slice(x.from, x.to), x.message]),
    [
      ['fig:x', 'There is no \\label{fig:x} in the document.'],
      ['k9', 'No entry k9 in the bibliography.'],
    ],
    'unknown labels and keys are marked where they are; comments and #1 passed over',
  );
  eq(texRefCheck('\\cite{x}', new Set(), null), [], 'keys are not checked when the bibliography is not all known');
}

// ---- Tidy the bibliography ---------------------------------------------------------------------------------------------

{
  const bib = [
    '@string{acl = "ACL"}',
    '',
    '% the classics',
    '@article{zeta2020,',
    '  author = {Zeta, Z.},',
    '  title = {Zeta things},',
    '  year = 2020,',
    '  doi = {10.1/zeta}',
    '}',
    '',
    '@inproceedings{alpha2019, title = {Alpha paper about many things}, author = {Alpha, A.}, year = {2019}, booktitle = {Proc. A}}',
    '',
    '@misc{Alpha2019b, title = {Alpha Paper About Many Things}, author = {Alpha, A.}, year = {2019}, note = {preprint}}',
    '',
    '@article{bad key, title = {Bad}, author = {B, B}, year = 2001}',
    '',
    '@article{unused2000, title = {Nobody cites me}, author = {U, U}, year = 2000}',
    '',
    '@article{dup, title = {First dup}, author = {D, D}, year = 2001}',
    '@article{dup, title = {Second dup}, author = {E, E}, year = 2002}',
    '',
  ].join('\n');
  eq(
    splitBib(bib).map((b) => b.kind),
    ['string', 'entry', 'entry', 'entry', 'entry', 'entry', 'entry', 'entry'],
    'a .bib split into its blocks',
  );
  const cited = citedKeys(['\\cite{zeta2020,Alpha2019b} \\cite{ALPHA2019} \\cite{bad key} \\cite{dup}']);
  const fill = new Map([['zeta2020', fillEntry('@article{x, author = {Zeta, Z.}, title = {Zeta things}, journal = {J. Z}, volume = {3}, number = {2}, pages = {1--9}, year = {2020}}')!]]);
  eq(bibNeedsFill(bib).map((x) => [x.key, x.doi, x.missing]), [['zeta2020', '10.1/zeta', ['journal', 'volume', 'number', 'pages']]], 'what to ask doi.org for');
  const r = tidyBib(bib, cited, { sort: true, unused: true, duplicates: true, keys: true }, fill);
  const keys = splitBib(r.text)
    .filter((b) => b.entry)
    .map((b) => b.entry!.key);
  eq(keys, ['alpha2019', 'badkey', 'dup', 'dup2', 'zeta2020'].filter((k) => k !== 'dup2'), 'sorted, the duplicate merged, the unused and the second of a shared key out');
  ok(r.text.startsWith('@string{acl = "ACL"}'), '@string first');
  ok(r.text.includes('% the classics\n@article{zeta2020'), 'a comment goes with its entry');
  ok(/journal\s*= \{J\. Z\}/.test(r.text) && /pages\s*= \{1--9\}/.test(r.text), 'fields filled from the DOI');
  ok(!/doi\s*=.*\n[\s\S]*doi\s*=/.test(r.text.slice(r.text.indexOf('zeta2020'), r.text.indexOf('zeta2020') + 400)), 'no field twice');
  ok(r.text.includes('@inproceedings{alpha2019, title = {Alpha paper about many things}'), 'an entry nothing changed keeps its own text');
  eq(r.renames, { 'bad key': 'badkey', Alpha2019b: 'alpha2019', ALPHA2019: 'alpha2019' }, 'citations to change');
  ok(r.changes.some((c) => c.kind === 'merged' && c.what.includes('the same title and year')), 'the merge is said');
  ok(r.changes.some((c) => c.kind === 'removed' && c.key === 'unused2000'), 'the unused one is said');
  ok(r.changes.some((c) => c.kind === 'filled' && c.what.includes('journal')), 'the fields filled are said');
  ok(r.changes.some((c) => c.kind === 'sorted'), 'the sort is said');
  const all = tidyBib(bib, citedKeys(['\\nocite{*}']), { unused: true }, undefined);
  ok(!all.changes.some((c) => c.kind === 'removed'), '\\nocite{*}: nothing is unused');
  eq(tidyBib('@article{a, title={A}}\n', null, { sort: true, unused: true, duplicates: true, keys: true }).changes, [], 'a tidy bibliography: nothing to say');
  const f = tidyBib('@article{a,title={A},year=2001}', null, { format: true });
  ok(f.text === '@article{a,\n  title = {A},\n  year  = 2001\n}\n' && f.changes.some((c) => c.kind === 'formatted'), 'every entry written one field a line');
  eq(renameCites('\\cite{a, Alpha2019b,alpha2019} % \\cite{Alpha2019b}\n\\citep[see][]{bad key}', r.renames), '\\cite{a, alpha2019} % \\cite{Alpha2019b}\n\\citep[see][]{badkey}', 'citations renamed (a key named twice once; comments as they are)');
  const byDoi = tidyBib('@article{a, doi={10.1/X}, title={One}}\n@article{b, doi={https://doi.org/10.1/x}, title={Other title}, pages={1--2}}\n', citedKeys(['\\cite{b}']), { duplicates: true });
  ok(byDoi.text.includes('@article{b') && !byDoi.text.includes('@article{a') && byDoi.renames.a === 'b', 'the same DOI: the cited one kept');
}

// ---- the words of the typeset pages ------------------------------------------------------------------------------------

{
  const xhtml = `<doc><page width="595.276000" height="841.890000"><flow><block><line xMin="1"><word xMin="10" yMin="20" xMax="40" yMax="30">Trans-</word></line><line><word xMin="10" yMin="32" xMax="40" yMax="42">formers</word><word xMin="45" yMin="32" xMax="60" yMax="42">are</word><word xMin="62" yMin="32" xMax="80" yMax="42">e&#xFB03;cient &amp; good</word></line></block></flow></page><page width="300" height="400"><flow><block><line><word xMin="1" yMin="2" xMax="3" yMax="4">are</word></line></block></flow></page></doc>`;
  const pages = readBboxLayout(xhtml);
  eq(pages.length, 2, 'two pages read');
  eq(pages[0].words[0], ['Trans-', 10, 20, 30, 10, 0], 'a word with its box and line');
  eq(pageText(pages[0].words).text, 'transformers are efficient & good', 'a word broken at a line’s end joined; ligatures as letters');
  const m = findInPages(pages, 'TRANSFORMERS   are');
  eq(m.length, 1, 'found across a broken word');
  eq(m[0].boxes.length, 2, 'a box a line');
  eq(findInPages(pages, 'are').map((x) => x.page), [1, 2], 'found on each page');
  const part = findInPages(pages, 'form')[0];
  ok(part && part.boxes[0].w < 30, 'part of a word: a part of its box');
}

// ---- the routes ---------------------------------------------------------------------------------------------------------

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tex-ai-test-')));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example', models: {} } as unknown as Deps;
pages.routes!(deps);
write.routes!(deps);
await app.ready();
const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));
const req = async (method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) => {
  const r = await app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { status: r.statusCode, json: r.body ? JSON.parse(r.body) : null };
};

// The helper model: a queue of answers, each call's prompt kept.
let answers: string[] = [];
const asked: { system: string; prompt: string; images?: unknown[] }[] = [];
setLatexWriteForTests({
  helper: async (q) => {
    asked.push(q);
    return answers.shift() ?? '';
  },
});

{
  answers = ['Transformers outperform RNNs \\citep{vaswani2017}.'];
  const r = await req('POST', '/api/write/latex/rewrite', { text: 'Transformers beat RNNs \\citep{vaswani2017}.', how: 'academic' });
  eq([r.status, r.json.text, r.json.problems], [200, 'Transformers outperform RNNs \\citep{vaswani2017}.', []], 'a rewrite that keeps the keys');
  ok(asked[0].prompt.includes('more academic') && asked[0].system.includes('character for character'), 'it is told how, and what to keep');
  asked.length = 0;
  answers = ['Transformers outperform RNNs.', 'Transformers outperform RNNs \\citep{vaswani2017}.'];
  const again = await req('POST', '/api/write/latex/rewrite', { text: 'Transformers beat RNNs \\citep{vaswani2017}.', how: 'shorter' });
  eq([again.json.problems, asked.length], [[], 2], 'asked again once when a key was dropped, and kept the second');
  ok(asked[1].prompt.includes('did not keep what must stay') && asked[1].prompt.includes('\\citep{vaswani2017}'), 'told what it dropped');
  answers = ['Transformers outperform RNNs.', 'Transformers outperform RNNs \\citep{devlin2019}.'];
  const bad = await req('POST', '/api/write/latex/rewrite', { text: 'Transformers beat RNNs \\citep{vaswani2017}.', how: 'clearer' });
  ok(bad.json.problems.length >= 2, `still wrong: the problems are said (${bad.json.problems})`);
  answers = ['```latex\nLos \\textbf{transformadores}.\n```'];
  const tr = await req('POST', '/api/write/latex/rewrite', { text: 'The \\textbf{transformers}.\n', how: 'translate', lang: 'Spanish' });
  eq(tr.json.text, 'Los \\textbf{transformadores}.\n', 'a fence goes, the line end stays');
  eq((await req('POST', '/api/write/latex/rewrite', { text: 'x', how: 'louder' })).status, 400, 'an unknown way is refused');
  eq((await req('POST', '/api/write/latex/rewrite', { text: 'x'.repeat(9000), how: 'fix' })).status, 413, 'too much at once is refused');
}

{
  answers = ['{"latex": "\\\\begin{algorithm}\\n\\\\caption{Search}\\n\\\\end{algorithm}", "packages": ["\\\\usepackage{algorithm}", "\\\\usepackage{algpseudocode}", "\\\\usepackage{amsmath}", "rm -rf /", "booktabs"], "note": ""}'];
  const r = await req('POST', '/api/write/latex/write', { ask: 'an algorithm for binary search', preamble: '\\documentclass{article}\n\\usepackage{amsmath}\n' });
  eq(r.json.latex, '\\begin{algorithm}\n\\caption{Search}\n\\end{algorithm}', 'the LaTeX written');
  eq(r.json.packages, ['\\usepackage{algorithm}', '\\usepackage{algpseudocode}', '\\usepackage{booktabs}'], 'the packages it needs, those loaded and odd lines left out');
  ok(asked[asked.length - 1].prompt.includes('binary search') && asked[asked.length - 1].prompt.includes('\\usepackage{amsmath}'), 'it is told what and the preamble');
}

{
  answers = ['It means a brace is missing.'];
  const ex = await req('POST', '/api/write/latex/error', { how: 'explain', message: 'Missing } inserted.', file: 'main.tex', line: 3, lines: [{ n: 3, text: '\\textbf{x' }] });
  eq(ex.json.text, 'It means a brace is missing.', 'an error explained');
  answers = ['{"why": "The brace was never closed.", "from": 3, "to": 3, "text": "\\\\textbf{x}"}'];
  const fx = await req('POST', '/api/write/latex/error', { how: 'fix', message: 'Missing } inserted.', file: 'main.tex', line: 3, lines: [{ n: 2, text: 'a' }, { n: 3, text: '\\textbf{x' }, { n: 4, text: 'b' }] });
  eq(fx.json.fix, { from: 3, to: 3, text: '\\textbf{x}' }, 'a fix of the lines shown');
  answers = ['{"why": "Elsewhere.", "from": 40, "to": 41, "text": "x"}'];
  const far = await req('POST', '/api/write/latex/error', { how: 'fix', message: 'Undefined control sequence.', lines: [{ n: 3, text: '\\foo' }] });
  ok(!far.json.fix && far.json.text === 'Elsewhere.', 'a fix past the lines shown is not offered');
}

{
  answers = [
    '{"corrections": [{"p": 0, "find": "Their is", "replace": "There is", "why": "wrong word"}, {"p": 0, "find": "\\\\cite{smith}", "replace": "\\\\cite{smyth}", "why": "x"}, {"p": 1, "find": "recieve", "replace": "receive", "why": "spelling"}]}',
  ];
  const r = await req('POST', '/api/write/latex/proofread', { paragraphs: [{ id: 0, text: 'Their is a model \\cite{smith}.' }, { id: 1, text: 'We recieve it.' }] });
  eq(
    r.json.corrections.map((c: { id: number; was: string; now: string }) => [c.id, c.was, c.now]),
    [
      [0, 'Their', 'There'],
      [1, 'recieve', 'receive'],
    ],
    'proofreading: words corrected, keys left alone',
  );
}

{
  // The web: OpenAlex and arXiv, canned.
  setLatexWriteForTests({
    fetch: (async (u: string | URL) => {
      const url = String(u);
      if (url.includes('openalex.org'))
        return new Response(
          JSON.stringify({
            results: [
              { doi: 'https://doi.org/10.5555/attn', display_name: 'Attention Is All You Need', publication_year: 2017, authorships: [{ author: { display_name: 'Ashish Vaswani' } }], primary_location: { source: { display_name: 'NeurIPS' } }, abstract_inverted_index: { The: [0], Transformer: [1] }, cited_by_count: 100000, type: 'article' },
              { doi: null, display_name: 'Cooking with herbs', publication_year: 2001, authorships: [], abstract_inverted_index: null },
            ],
          }),
        );
      if (url.includes('arxiv.org')) return new Response('<feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><published>2017-06-12</published><summary>The Transformer.</summary><author><name>Ashish Vaswani</name></author></entry></feed>');
      return new Response('', { status: 404 });
    }) as typeof fetch,
  });
  answers = ['{"queries": ["transformer attention sequence model"]}', '{"papers": [{"n": 1, "backs": "strong", "why": "It introduced the Transformer."}, {"n": 2, "backs": "no", "why": ""}]}'];
  const r = await req('POST', '/api/write/latex/cite', { claim: 'Self-attention models replaced recurrent networks for translation.' });
  eq(r.json.queries, ['transformer attention sequence model'], 'the searches written');
  eq(r.json.papers.length, 1, 'only the papers that back it');
  const p = r.json.papers[0];
  eq([p.title, p.doi, p.arxiv, p.backs, p.why], ['Attention Is All You Need', '10.5555/attn', '1706.03762', 'strong', 'It introduced the Transformer.'], 'a paper with its record, joined from both places');
  ok(/^@article\{vaswani2017attention,/.test(p.bibtex) && p.bibtex.includes('doi'), `its BibTeX made from its record: ${p.bibtex}`);
  ok(asked[asked.length - 1].prompt.includes('The Transformer'), 'judged by its abstract');
  setLatexWriteForTests({ fetch: null });
}

{
  const reader = await req('GET', '/api/write/latex/picture');
  eq(reader.json.where, 'helper', 'who reads pictures');
  answers = ['{"kind": "equation", "latex": "\\\\begin{equation}\\n  a^2 + b^2 = c^2\\n\\\\end{equation}", "packages": ["\\\\usepackage{amsmath}"], "note": ""}'];
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c40000000049454e44ae426082', 'hex');
  const r = await req('POST', '/api/write/latex/picture', { data: `data:image/png;base64,${png.toString('base64')}` });
  eq([r.json.kind, r.json.latex, r.json.packages], ['equation', '\\begin{equation}\n  a^2 + b^2 = c^2\n\\end{equation}', ['\\usepackage{amsmath}']], 'a picture read into LaTeX');
  ok((asked[asked.length - 1].images ?? []).length === 1, 'the picture is shown to the model');
  eq((await req('POST', '/api/write/latex/picture', { data: Buffer.from('hello').toString('base64') })).status, 415, 'not a picture: refused');
}

// ---- named versions, page_action's tidies -------------------------------------------------------------------------------

const save = async (args: Record<string, unknown>) => {
  try {
    const r = await tools.save_latex.run(args, ctx);
    return typeof r === 'string' ? r : r.text;
  } catch (e) {
    return `ERROR ${(e as Error).message}`;
  }
};
const action = async (args: Record<string, unknown>) => {
  try {
    const r = await tools.page_action.run(args, ctx);
    return typeof r === 'string' ? r : r.text;
  } catch (e) {
    return `ERROR ${(e as Error).message}`;
  }
};
{
  const made = await save({ title: 'Paper', source: '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item One \\cite{b, A}\n\\end{itemize}\n\\bibliography{refs}\n\\end{document}\n', files: { 'refs.bib': '@article{b, title={B}}\n\n@article{a, title={A}}\n\n@article{z, title={Z}}\n' } });
  const id = /\(page ([a-f0-9]{10})/.exec(made)?.[1] ?? '';
  ok(id, `a document saved: ${made}`);
  const named = await req('PUT', `/api/pages/${id}/versions/1/name`, { name: '  Sent   to ICML ' });
  eq(named.json.versions[0].name, 'Sent to ICML', 'a version named');
  eq((await req('PUT', `/api/pages/${id}/versions/7/name`, { name: 'x' })).status, 404, 'a version not kept: 404');
  eq((await req('PUT', `/api/pages/${id}/versions/1/name`, { name: 'x'.repeat(81) })).status, 400, 'a name too long: 400');
  const tidied = await action({ id, action: 'tidy_source' });
  ok(/tidied main\.tex: 1 line indented anew/.test(tidied), `tidy_source: ${tidied}`);
  const bib = await action({ id, action: 'tidy_bibliography', fill: false, unused: true });
  ok(bib.includes('nothing in the document cites it') && bib.includes('\\cite{A} → \\cite{a}'), `tidy_bibliography says what changed: ${bib}`);
  const kept = (await req('GET', `/api/pages/${id}`)).json;
  const m = normalizeTex(kept.model) as TexDoc;
  ok(m.main.includes('  \\item One \\cite{b, a}'), 'the citations follow the keys');
  eq(m.files[0].text, '@article{a, title={A}}\n\n@article{b, title={B}}\n', 'the bibliography sorted, the unused out');
  ok(versionsOf(db, id).find((v) => v.version === 1)?.name === 'Sent to ICML', 'the named version is still there');
  // Kept past the newest 40.
  for (let i = 0; i < VERSION_LIMITS.count + 2; i++) addVersion(db, id, { model: { ...m, main: `${m.main}% ${i}\n` }, by: 'edit' });
  const vs = versionsOf(db, id);
  ok(vs.some((v) => v.version === 1 && v.name === 'Sent to ICML'), 'a named version is kept past the newest 40');
  eq(vs.filter((v) => !v.name).length, VERSION_LIMITS.count, 'the others keep to 40');
  eq(await req('PUT', `/api/pages/${id}/versions/1/name`, { name: '' }).then((r) => r.json.versions.find((v: { version: number }) => v.version === 1)?.name), undefined, 'a name taken away');
}

// ---- typesetting in draft and stop-at-the-first-error modes (with TeX here) ------------------------------------------

{
  const setup = (await req('GET', '/api/pages/tex/setup')).json;
  eq(setup.timeLimit, 45, 'the time limit is said');
  if (setup.engines?.pdflatex) {
    const model = { engine: 'pdflatex', main: '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nHello searchable world.\n\\end{document}\n' };
    const plain = (await req('POST', '/api/pages/tex/compile', { model })).json;
    const draft = (await req('POST', '/api/pages/tex/compile', { model, draft: true })).json;
    ok(plain.ok && draft.ok && plain.key !== draft.key, 'draft is typeset apart');
    const broken = { engine: 'pdflatex', main: '\\documentclass{article}\n\\begin{document}\n\\foo one\n\\bar two\n\\end{document}\n' };
    const all = (await req('POST', '/api/pages/tex/compile', { model: broken })).json;
    const halt = (await req('POST', '/api/pages/tex/compile', { model: broken, halt: true })).json;
    ok(all.errors.length >= 2 && halt.errors.length === 1 && !halt.pdf, `stop at the first error: ${all.errors.length} errors, then ${halt.errors.length}`);
    if (setup.words) {
      const w = (await req('GET', `/api/pages/tex/${plain.key}/words`)).json;
      ok(w.pages?.[0]?.words.some((x: unknown[]) => x[0] === 'searchable'), 'the words of the typeset page');
      eq(findInPages(w.pages, 'searchable world').length, 1, 'found in the typeset page');
    }
    eq((await req('POST', '/api/pages/tex/clear', { keys: [plain.key, draft.key, 'nope'] })).json.cleared, 2, 'cached typesettings cleared');
    eq((await req('GET', `/api/pages/tex/${plain.key}/words`)).status, 404, 'cleared: gone');
  } else console.log('(no pdfLaTeX here: typesetting modes not tried)');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

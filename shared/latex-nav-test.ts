// Script tests for moving about a LaTeX project (latex-nav.ts: the target of \ref, \cite, \input and \includegraphics under the
// cursor, where it is defined, what labels and keys say in lists) and for find and replace across its files
// (latex-search.ts). Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs shared/latex-nav-test.ts && node dist/dev/latex-nav-test.js
import { byline, citeNotes, findDefinition, labelNotes, plainLine, targetAt } from './latex-nav.ts';
import { replaceFiles, searchFiles, searchPattern } from './latex-search.ts';

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const same = (a: unknown, b: unknown, what: string) => {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x === y) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}\n  got  ${x}\n  want ${y}`);
  }
};

// ---- the target under the cursor
const t1 = 'See \\ref{fig:model} and \\cite{knuth84, lamport94} for \\input{chapters/intro}.\n% \\ref{commented}\n\\includegraphics[width=3cm]{pics/a.png}\n';
const at = (s: string) => t1.indexOf(s);
same(targetAt(t1, at('fig:model') + 2)?.name, 'fig:model', 'a ref key');
same(targetAt(t1, at('fig:model') + 2)?.kind, 'ref', 'its kind');
same(targetAt(t1, at('\\ref'))?.name, 'fig:model', 'on the command itself');
same(targetAt(t1, at('knuth84') + 1)?.name, 'knuth84', 'the first cite key');
same(targetAt(t1, at('lamport94') + 3)?.name, 'lamport94', 'the second cite key, after a comma and a space');
same(targetAt(t1, at('lamport94') + 3)?.from, at('lamport94'), 'where that key starts');
same(targetAt(t1, at('chapters/intro') + 3)?.kind, 'input', 'an \\input');
same(targetAt(t1, at('pics/a.png') + 3)?.kind, 'graphics', 'an \\includegraphics, after its options');
ok(targetAt(t1, at('commented') + 2) === null, 'nothing in a comment');
ok(targetAt(t1, at('See') + 1) === null, 'nothing in plain words');
same(targetAt('\\autocite*[p. 3]{x1}', 18)?.name, 'x1', 'a cite with options and a star');
same(targetAt('\\cref{a,b}', 8)?.name, 'b', 'a list of refs');
same(targetAt('\\Cref{a}', 2)?.kind, 'ref', 'capital Cref');
same(targetAt('\\usepackage{a}', 12), null, 'not a command that names something');

// ---- where it is defined
const files = [
  { name: 'main.tex', text: '\\section{Intro}\\label{sec:intro}\n\\input{chapters/two}\n\\begin{figure}\n\\includegraphics{pics/a.png}\n\\caption{The model}\n\\label{fig:model}\n\\end{figure}\n\\bibliography{refs}\n' },
  { name: 'chapters/two.tex', text: 'Text \\label{sec:two}\n\\begin{equation}\\label{eq:one} x=1\\end{equation}\n\\input{three}\n' },
  { name: 'chapters/three.tex', text: 'x' },
  { name: 'refs.bib', text: '@book{knuth84,\n  author = {Donald E. Knuth},\n  title = {The {\\TeX}book},\n  year = {1984}\n}\n\n@article{lamport94,\n  author = {Leslie Lamport and Someone Else},\n  title = {\\LaTeX: A Document Preparation System},\n  year = 1994\n}\n@comment{x}\n' },
];
const pics = ['pics/a.png', 'b.jpg'];
const def = (kind: 'ref' | 'cite' | 'input' | 'graphics' | 'bib', name: string, from = 'main.tex') => findDefinition(files, { kind, name }, from, pics);
const f1 = def('ref', 'fig:model');
same(f1 && f1.kind === 'file' && [f1.file, f1.line], ['main.tex', 6], 'a label in main.tex, on its line');
ok(f1?.kind === 'file' && files[0].text.slice(f1.from, f1.to) === 'fig:model', 'its offsets are the name');
const f2 = def('ref', 'eq:one');
same(f2 && f2.kind === 'file' && [f2.file, f2.line], ['chapters/two.tex', 2], 'a label in another file');
same(def('ref', 'nope'), null, 'no such label');
const f3 = def('cite', 'lamport94');
same(f3 && f3.kind === 'file' && [f3.file, f3.line], ['refs.bib', 7], 'a bib entry');
ok(f3?.kind === 'file' && files[3].text.slice(f3.from, f3.to) === 'lamport94', 'its offsets are the key');
same(def('cite', 'comment'), null, 'a @comment is no entry');
same(findDefinition([{ name: 'main.tex', text: '\\bibitem{a1} Smith' }], { kind: 'cite', name: 'a1' }, 'main.tex'), { kind: 'file', file: 'main.tex', from: 9, to: 11, line: 1 }, 'a \\bibitem');
same(def('input', 'chapters/two'), { kind: 'file', file: 'chapters/two.tex', from: 0, to: 0, line: 1 }, 'an \\input without .tex');
same(def('input', 'three', 'chapters/two.tex'), { kind: 'file', file: 'chapters/three.tex', from: 0, to: 0, line: 1 }, 'an \\input next to the file asking');
same(def('input', 'chapters/../chapters/three.tex'), { kind: 'file', file: 'chapters/three.tex', from: 0, to: 0, line: 1 }, 'a path with ..');
same(def('bib', 'refs'), { kind: 'file', file: 'refs.bib', from: 0, to: 0, line: 1 }, 'a \\bibliography');
same(def('graphics', 'pics/a'), { kind: 'picture', name: 'pics/a.png' }, 'a picture without its extension');
same(def('graphics', './b.jpg'), { kind: 'picture', name: 'b.jpg' }, 'a picture with ./');
same(def('graphics', 'c.png'), null, 'no such picture');

// ---- what labels and keys say
const ln = labelNotes(files);
same(ln.get('sec:intro'), { kind: 'Section', text: 'Intro' }, 'a section label');
same(ln.get('fig:model'), { kind: 'Figure', text: 'The model' }, 'a figure label has its caption');
same(ln.get('eq:one')?.kind, 'Equation', 'an equation label');
same(ln.get('sec:two'), { kind: 'Label', text: '' }, 'a label under no heading in its file');
const ln2 = labelNotes([{ name: 'a.tex', text: '\\subsection{A \\emph{big} idea}\n\\label{s}\n\\begin{table}\\label{t}\\caption[short]{Results by year}\\end{table}\n\\begin{lemma}[Zorn] Every chain has a bound.\\label{l}\\end{lemma}\n%\\label{c}\n' }]);
same(ln2.get('s'), { kind: 'Subsection', text: 'A big idea' }, 'a heading with markup');
same(ln2.get('t'), { kind: 'Table', text: 'Results by year' }, 'a caption after its label');
same(ln2.get('l')?.kind, 'Lemma', 'a theorem');
ok(!ln2.has('c'), 'a commented label');
const cn = citeNotes(files);
same(cn.get('knuth84')?.label, 'Knuth 1984 — The TeXbook', 'Author Year — Title');
same(cn.get('lamport94')?.label, 'Lamport and Else 1994 — LaTeX: A Document Preparation System', 'two authors, a command in the title');
ok(!cn.has('comment'), 'no @comment');
same(citeNotes([{ name: 'm.tex', text: '\\bibitem{k} A. Smith, A paper, 2001.\n' }]).get('k')?.label, 'A. Smith, A paper, 2001.', 'a \\bibitem');
same(byline(['A', 'B', 'C']), 'A et al.', 'three authors');
same(plainLine('The \\emph{model} of $x$ \\label{a}'), 'The model of x', 'plainLine');

// ---- find and replace across the project
const sf = [
  { name: 'main.tex', text: 'Hello world\nhello again\nbye' },
  { name: 'b.tex', text: 'say Hello\n\nHELLOHELLO' },
];
const r1 = searchFiles(sf, 'hello');
same(r1.hits.map((h) => [h.file, h.line, h.at]), [['main.tex', 1, 0], ['main.tex', 2, 0], ['b.tex', 1, 4], ['b.tex', 3, 0], ['b.tex', 3, 5]], 'case-insensitive hits with lines');
same(searchFiles(sf, 'hello', { caseSensitive: true }).hits.length, 1, 'case matters');
same(searchFiles(sf, 'hello', { wholeWord: true }).hits.length, 3, 'whole words');
same(searchFiles(sf, 'h(e|a)llo', { regex: true }).hits.length, 5, 'a regular expression');
same(searchFiles(sf, 'a.c', {}).hits.length, 0, 'a dot is a dot without regex');
ok(searchFiles(sf, '(', { regex: true }).error, 'a broken regular expression says so');
ok(searchFiles(sf, 'x*', { regex: true }).error, 'a pattern for nothing is refused');
same(searchFiles(sf, '').hits.length, 0, 'an empty search finds nothing');
same(searchFiles([{ name: 'x', text: 'a'.repeat(1000) }], 'a').capped, true, 'a long run of hits is capped');
const h = searchFiles([{ name: 'x', text: `${'z'.repeat(500)}NEEDLE${'z'.repeat(500)}` }], 'needle').hits[0];
ok(h.text.length <= 200 && h.text.slice(h.at, h.at + h.len) === 'NEEDLE', 'a long line is cut round the match');
const rp = replaceFiles(sf, 'hello', 'Hi');
same(rp.count, 5, 'replace counts');
same(rp.files.map((f) => f.text), ['Hi world\nHi again\nbye', 'say Hi\n\nHiHi'], 'replace writes every file');
same(replaceFiles(sf, 'hello', 'Hi', {}, new Set(['b.tex'])).files.map((f) => f.name), ['b.tex'], 'only the checked files');
same(replaceFiles([{ name: 'a', text: 'foo bar' }], '(\\w+) (\\w+)', '$2 $1 $& $$', { regex: true }).files[0].text, 'bar foo foo bar $', 'groups in the replacement');
same(replaceFiles([{ name: 'a', text: 'a.b' }], '.', '$1').files[0].text, 'a$1b', 'no groups without regex');
same(replaceFiles([{ name: 'a', text: 'ab ab' }], 'a', 'xx').files[0].changes, [{ from: 0, to: 1, insert: 'xx' }, { from: 3, to: 4, insert: 'xx' }], 'each change, in the old text\'s places');
same(replaceFiles([{ name: 'a', text: 'k=1' }], '(?<k>\\w)=(\\d)', '$<k>:$2', { regex: true }).files[0].text, 'k:1', 'a named group');
same(replaceFiles([{ name: 'a', text: 'x' }], 'q', 'r').files, [], 'files with no match are left out');
ok(!('error' in (searchPattern('a', {}) as object)), 'a good pattern');

console.log(failed ? `${failed} failed, ${passed} passed` : `All ${passed} checks passed`);
process.exit(failed ? 1 : 0);

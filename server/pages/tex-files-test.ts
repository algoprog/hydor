// Script tests for a LaTeX project's files: what its document uses (shared/latex-files.ts) on tricky sources (\input
// without braces, \graphicspath, the extensions TeX tries, \subfile, \import, lists of bibliographies, comments and \%,
// a file reading itself, a style of the project's own beside a TeX Live package, names made at TeX's run), the tree's
// order, references kept right when files move; the on-disk loader (server/pages/filemodel.ts) reporting the files
// TeX takes from the folder and finding the document a chapter belongs to; and a LaTeX project's folder brought into
// the Library as one document (its folders kept, the files it uses first when it is over the limits). Build and run
// with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/tex-files-test.ts
//   DATA_DIR=/tmp/hydor-test-tex-files node dist/dev/tex-files-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { pages } from './index.ts';
import { texMask, texMoveFiles, texTree, texUses, texDocUses, texIsUsed, type TexTreeNode } from '../../shared/latex-files.ts';
import { normalizeTex, TEX_MAIN, type TexDoc } from '../../shared/latex.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-tex-files-test-')));
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
const req = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
  app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

/** A project of texts and other files (pictures, data: their names only). */
const project = (main: string, texts: Record<string, string>, others: string[] = []) => {
  const names = new Set([...Object.keys(texts), ...others]);
  return texUses({ main, read: (n) => (n === TEX_MAIN ? main : (texts[n] ?? null)), has: (n) => names.has(n), names: () => names });
};
const usedOf = (u: ReturnType<typeof texUses>) => [...u.used.keys()];

// ---- what a document uses ----------------------------------------------------------------------------------------
{
  const main = [
    '\\documentclass{article}',
    '\\usepackage{amsmath,mystyle}',
    '\\usepackage[utf8]{inputenc}',
    '\\graphicspath{{fig/}{img/}}',
    '\\bibliographystyle{mybst}',
    '\\begin{document}',
    '\\input chapters/intro',
    '\\subfile{chapters/one}',
    '\\import{parts/}{two}',
    '% \\input{commented}',
    'It costs 50\\% \\input{real}',
    '\\includegraphics[width=\\linewidth]{plot}',
    '\\includegraphics<2->[scale=.5]{photo}',
    '\\includegraphics{both}',
    '\\begin{verbatim}',
    '\\input{notreally}',
    '\\end{verbatim}',
    '\\lstinputlisting[language=Python]{code/run.py}',
    '\\begin{tikzpicture}\\begin{axis}\\addplot table {data/results.dat};\\addplot table {x y \\\\ 1 2 \\\\};\\end{axis}\\end{tikzpicture}',
    '\\input{nothere}',
    '\\bibliography{a, b}',
    '\\addbibresource{c.bib}',
    '\\end{document}',
    '\\input{after-the-end}',
  ].join('\n');
  const texts: Record<string, string> = {
    'chapters/intro.tex': 'Intro.\n\\input{chapters/loop}\n',
    'chapters/loop.tex': 'I read myself: \\input{chapters/loop}\n',
    'chapters/one.tex': '\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nOne.\n\\end{document}\n',
    'parts/two.tex': 'Two \\input{sub} \\includegraphics{pic} \\subimport{deep/}{x}\n',
    'parts/sub.tex': 'Sub.\n',
    'parts/deep/x.tex': 'Deep.\n\\endinput\n\\input{chapters/unread}\n',
    'real.tex': 'Real.\n',
    'commented.tex': 'No.\n',
    'notreally.tex': 'No.\n',
    'after-the-end.tex': 'No.\n',
    'chapters/unread.tex': 'No.\n',
    'mystyle.sty': '\\RequirePackage{helper}\n\\newcommand{\\logo}{\\includegraphics{logo}}\n',
    'helper.sty': '% a helper\n',
    'a.bib': '',
    'b.bib': '',
    'c.bib': '',
    'unused.bib': '',
  };
  const others = ['fig/photo.jpg', 'img/plot.png', 'both.pdf', 'both.png', 'parts/pic.png', 'logo.png', 'code/run.py', 'data/results.dat', 'mybst.bst', 'stray.png', 'main.bbl'];
  const u = project(main, texts, others);
  const used = usedOf(u);
  const has = (n: string) => u.used.has(n);
  ok(has('chapters/intro.tex'), '\\input without braces reads its file');
  ok(has('chapters/one.tex'), '\\subfile reads its file');
  ok(has('parts/two.tex') && has('parts/sub.tex') && has('parts/pic.png'), '\\import reads its file, and what it reads is found from its folder');
  ok(has('parts/deep/x.tex'), '\\subimport reads from the folder of the file it is in');
  ok(!has('chapters/unread.tex'), 'nothing after \\endinput is read');
  ok(!has('commented.tex') && has('real.tex'), 'a comment is passed over, an escaped \\% is no comment');
  ok(!has('notreally.tex'), 'verbatim text is passed over');
  ok(!has('after-the-end.tex'), 'nothing after \\end{document} is read');
  ok(has('chapters/loop.tex') && used.filter((n) => n === 'chapters/loop.tex').length === 1, 'a file reading itself is read once');
  ok(has('img/plot.png') && has('fig/photo.jpg'), '\\graphicspath{{fig/}{img/}} finds pictures in either folder, with the extension TeX tries');
  ok(u.used.get('img/plot.png')?.line === 12 && u.used.get('img/plot.png')?.cmd === 'includegraphics', 'where it is used is said (file and line)');
  ok(has('both.pdf') && !has('both.png'), 'of two pictures by one name, the extension TeX tries first wins');
  ok(has('mystyle.sty') && has('helper.sty') && has('logo.png'), 'a style of the project is read on: what it loads and shows is used');
  ok(!u.missing.some((r) => r.name === 'amsmath' || r.name === 'inputenc'), 'a TeX Live package is not missing');
  ok(has('mybst.bst'), '\\bibliographystyle of the project’s own');
  ok(has('a.bib') && has('b.bib') && has('c.bib') && !has('unused.bib'), '\\bibliography{a, b} reads both, \\addbibresource its file');
  ok(has('code/run.py') && has('data/results.dat'), 'listings and pgfplots data are used');
  ok(!u.refs.some((r) => r.name.includes('1 2')), 'a table written inline is no file');
  ok(u.missing.length === 1 && u.missing[0].name === 'nothere' && u.missing[0].line === 20, 'a chapter the project lacks is missing, with its line');
  ok(!has('stray.png') && texIsUsed(u, 'main.bbl') && !texIsUsed(u, 'stray.png'), 'a picture nothing shows is not used; the bibliography BibTeX made counts as used');
  ok(used.indexOf('chapters/intro.tex') < used.indexOf('chapters/loop.tex') && used.indexOf('chapters/loop.tex') < used.indexOf('chapters/one.tex'), 'files come in the order TeX reads them (a chapter’s own where it is read)');
}
{
  // Names TeX makes at its run, and simple macros.
  const main = '\\documentclass{article}\n\\newcommand{\\figdir}{figures}\n\\begin{document}\n\\includegraphics{\\figdir/cat}\n\\foreach \\i in {1,2} {\\includegraphics{frames/f\\i}}\n\\end{document}\n';
  const u = project(main, {}, ['figures/cat.png', 'frames/f1.png', 'frames/f2.png', 'other/f3.png']);
  ok(u.used.has('figures/cat.png'), 'a name with a plain macro is read with it');
  ok(u.used.has('frames/f1.png') && u.used.has('frames/f2.png') && !u.used.has('other/f3.png'), 'a name made at the run counts every file it may be');
  ok(!u.missing.length, 'and none of them is missing');
}
{
  const src = 'a % b\nc \\% d % e\n\\begin{comment}\n\\input{x}\n\\end{comment}\nf';
  const want = 'a    \nc \\% d    \n\\begin{comment}\n         \n\\end{comment}\nf';
  ok(texMask(src) === want, `the masked source keeps its length and its escaped \\%, and drops comments and verbatim text (${JSON.stringify(texMask(src))})`);
}

// ---- the tree ------------------------------------------------------------------------------------------------------
{
  const names = ['refs.bib', 'chapters/b.tex', 'chapters/a.tex', 'figures/plot.png', 'style.sty', 'notes.txt', 'chapters/fig.png', 'zeta.tex', 'alpha.tex'];
  const tree = texTree(names, { order: ['chapters/b.tex', 'chapters/a.tex', 'zeta.tex'], folders: ['empty'] });
  const labels = (list: TexTreeNode[]): string[] => list.map((n) => (n.kind === 'folder' ? `${n.label}/[${labels(n.items).join(',')}]` : n.label));
  ok(
    JSON.stringify(labels(tree)) === JSON.stringify(['chapters/[b.tex,a.tex,fig.png]', 'empty/[]', 'figures/[plot.png]', 'zeta.tex', 'alpha.tex', 'refs.bib', 'style.sty', 'notes.txt']),
    `folders first, then sources in reading order, the bibliography, styles, pictures, the rest (${JSON.stringify(labels(tree))})`,
  );
}

// ---- files moved, their references with them ----------------------------------------------------------------------------
{
  const d: TexDoc = normalizeTex({
    main: '\\documentclass{article}\n\\graphicspath{{figures/}}\n\\begin{document}\nSee \\input{chapters/intro} and \\includegraphics{figures/plot} and \\includegraphics{logo.png}.\n\\includegraphics{photo}\n\\bibliography{refs}\n\\end{document}\n',
    files: [
      { name: 'chapters/intro.tex', text: 'Intro \\includegraphics{photo}\n' },
      { name: 'drafts/old.tex', text: 'Old: \\includegraphics{figures/plot}\n' },
      { name: 'refs.bib', text: '@misc{k, title={T}}\n' },
    ],
    pictures: [
      { name: 'figures/plot.png', src: 'naget-asset:0123456789abcdef' },
      { name: 'figures/photo.jpg', src: 'naget-asset:1123456789abcdef' },
      { name: 'logo.png', src: 'naget-asset:2123456789abcdef' },
    ],
    comments: [
      { id: 'c1', by: 'user', text: 'on the intro', at: 1, file: 'chapters/intro.tex', from: 0, to: 5, quote: 'Intro' },
      { id: 'c2', by: 'user', text: 'after the references', at: 1, file: 'main.tex', from: 0, to: 0, quote: 'and a' },
    ],
  });
  // Where the words of the second comment are.
  const at = d.main.indexOf('and \\includegraphics{logo');
  d.comments![1] = { ...d.comments![1], from: at, to: at + 5, quote: 'and \\' };
  const moved = texMoveFiles(d, [
    ['figures/plot.png', 'img/plot.png'],
    ['figures/photo.jpg', 'figures/sub/photo.jpg'],
    ['chapters/intro.tex', 'parts/intro.tex'],
    ['refs.bib', 'bib/refs.bib'],
    ['logo.png', 'art/logo.png'],
  ]);
  ok(moved.main.includes('\\input{parts/intro}') && moved.main.includes('\\includegraphics{img/plot}') && moved.main.includes('\\includegraphics{art/logo.png}'), 'references follow their files, with or without the extension as they were written');
  ok(moved.main.includes('\\includegraphics{sub/photo}') && moved.files.find((f) => f.name === 'parts/intro.tex')?.text.includes('\\includegraphics{sub/photo}'), 'one written from \\graphicspath’s folder stays so while the file is still under it');
  ok(moved.main.includes('\\bibliography{bib/refs}'), 'a bibliography too');
  ok(moved.files.find((f) => f.name === 'drafts/old.tex')?.text.includes('\\includegraphics{img/plot}'), 'references in files the document does not use move too');
  ok(moved.pictures.some((p) => p.name === 'img/plot.png') && moved.files.some((f) => f.name === 'bib/refs.bib'), 'the files and pictures have their new names');
  const c1 = moved.comments?.find((c) => c.id === 'c1');
  const c2 = moved.comments?.find((c) => c.id === 'c2');
  ok(c1?.file === 'parts/intro.tex' && moved.files.find((f) => f.name === 'parts/intro.tex')!.text.slice(c1.from, c1.to) === 'Intro', 'a comment goes with its file');
  ok(c2 && moved.main.slice(c2.from, c2.to) === 'and \\', 'a comment beside a reference that changed stays on its words');
  const u = texDocUses(moved);
  ok(u.missing.length === 0, 'after the move, every reference finds its file');
}

// ---- a project on disk: what the editor holds, what TeX takes from the folder, the document a chapter is of -------------
{
  const P = path.join(tmp, 'thesis');
  const put = (rel: string, data: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(P, rel)), { recursive: true });
    fs.writeFileSync(path.join(P, rel), data);
  };
  put(
    'main.tex',
    [
      '\\documentclass{book}',
      '\\usepackage{mystyle}',
      '\\begin{document}',
      '\\input{chapters/ch1}',
      '\\include{chapters/ch2}',
      '\\subfile{chapters/sub}',
      '\\input{parts/a/deep}',
      '\\includegraphics{figures/plot}',
      '\\begin{tikzpicture}\\begin{axis}\\addplot table {data/r.dat};\\end{axis}\\end{tikzpicture}',
      '\\bibliography{refs}',
      '\\end{document}',
      '',
    ].join('\n'),
  );
  put('chapters/ch1.tex', 'One \\includegraphics{figures/cat.png}\n');
  put('chapters/ch2.tex', 'Two.\n');
  put('chapters/sub.tex', '\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nA subfile.\n\\end{document}\n');
  put('chapters/note.tex', '% !TEX root = ../main.tex\nA note nothing reads.\n');
  put('parts/a/deep.tex', 'Deep down.\n');
  put('mystyle.sty', '\\ProvidesPackage{mystyle}\n\\RequirePackage{graphicx}\n');
  put('refs.bib', '@misc{k, title={T}}\n');
  put('old.tex', 'An old draft.\n');
  put('data/r.dat', 'x y\n1 2\n');
  put('figures/plot.pdf', '%PDF-1.4 a picture\n');
  put('figures/cat.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  put('figures/unused.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const open = async (rel: string) => (await req('GET', `/api/pages/file?path=${encodeURIComponent(path.join(P, rel))}`)).json();
  const t = await open('chapters/ch1.tex');
  const names = (t.model?.files ?? []).map((f: { name: string }) => f.name);
  ok(t.tex?.main === 'main.tex' && t.tex.open === 'chapters/ch1.tex', 'a chapter opens its document, on the chapter');
  ok(JSON.stringify(names) === JSON.stringify(['chapters/ch1.tex', 'chapters/ch2.tex', 'chapters/sub.tex', 'parts/a/deep.tex', 'refs.bib']), `the editor holds the sources and the bibliography it uses, in the order TeX reads them (${names.join(', ')})`);
  type Use = { name: string; kind: string; size: number };
  const uses = new Map<string, Use>((t.tex?.uses ?? []).map((u: Use) => [u.name, u]));
  ok(uses.get('mystyle.sty')?.kind === 'style' && uses.get('figures/plot.pdf')?.kind === 'picture' && uses.has('figures/cat.png') && uses.get('data/r.dat')?.kind === 'data', 'what TeX takes from the folder is listed, with its kind');
  ok(uses.get('data/r.dat')?.size === 8, 'and its size');
  ok(!uses.has('old.tex') && !uses.has('figures/unused.png') && !names.includes('old.tex'), 'what the document does not use is neither in the editor nor listed');
  const sub = await open('chapters/sub.tex');
  ok(sub.tex?.main === 'main.tex' && sub.tex.open === 'chapters/sub.tex', 'a subfile opens the document it names, on itself');
  const note = await open('chapters/note.tex');
  ok(note.tex?.main === 'main.tex', 'a part that names its root (% !TEX root) opens that document');
  const deep = await open('parts/a/deep.tex');
  ok(deep.tex?.main === 'main.tex' && deep.tex.open === 'parts/a/deep.tex', 'a chapter two folders down finds its document');
  const agentView = await req('GET', '/api/pages/file?path=' + encodeURIComponent(path.join(P, 'main.tex')));
  ok(agentView.statusCode === 200, 'the document itself opens');
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

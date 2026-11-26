// Independent mechanical check of a reported extent, using its own parser instances.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { family, RUNTIME_URL } from '../grammar.mjs';

const { Parser, Language } = await import(RUNTIME_URL);

const HERE = path.dirname(fileURLToPath(import.meta.url));
let inited = false;
const parsers = {};
async function parserFor(lang) {
  if (!inited) { await Parser.init(); inited = true; }
  if (!parsers[lang]) {
    const L = await Language.load(path.join(HERE, '..', 'grammars', `tree-sitter-${lang}.wasm`));
    const p = new Parser(); p.setLanguage(L); parsers[lang] = p;
  }
  return parsers[lang];
}
export async function preloadAll() { for (const l of ['typescript', 'tsx', 'javascript', 'python', 'rust']) await parserFor(l); }

const TRIVIA = ['comment', 'decorator', 'attribute_item', 'line_comment', 'block_comment'];

// lines: file lines (0-based array); a,b: 1-based inclusive range; word: last component of the name
// returns {status:'ok'|'FAIL', detail}
export async function verifyExtent(lang, lines, a, b, word) {
  const fam = family(lang);
  const slice = lines.slice(a - 1, b);
  const wre = new RegExp(`(?<![\\w$])${word.replace(/[$]/g, '\\$')}(?![\\w$])`);
  const problems = [];
  const isTrivia = (l) => {
    const t = l.trim();
    if (fam === 'py') return t.startsWith('#') || t.startsWith('@');
    if (fam === 'rs') return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('#[');
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('@');
  };
  if (word) {
    let nameLine = -1;
    for (let j = 0; j < slice.length; j++) if (!isTrivia(slice[j]) && wre.test(slice[j])) { nameLine = j; break; }
    if (nameLine < 0) problems.push('name not on first declaration lines');
  }
  const firstCode = slice.find((l) => l.trim() && !isTrivia(l)) || '';
  const indented = /^\s/.test(firstCode);
  const wrapsAll = fam === 'py'
    ? [['', '']]
    : fam === 'rs'
      ? [['', ''], ['impl X {\n', '\n}'], ['trait X {\n', '\n}'], ['mod x {\n', '\n}'], ['enum X {\n', '\n}'], ['struct X {\n', '\n}'], ['extern "C" {\n', '\n}'], ['fn w() {\n', '\n}']]
      : [['', ''], ['class X {\n', '\n}'], ['interface X {\n', '\n}'], ['enum X {\n', '\n}'], ['const o = {\n', '\n};'], ['namespace N {\n', '\n}'], ['type T = {\n', '\n}'], ['function w() {\n', '\n}']];
  // an indented declaration is a member / nested: never accept the bare top-level parse for it
  const wraps = fam !== 'py' && indented ? wrapsAll.slice(1) : wrapsAll;
  const parser = await parserFor(lang);
  if (fam === 'py') {
    const ind = /^\s*/.exec(slice.find((l) => l.trim()) || '')[0].length;
    if (ind > 0) wraps[0] = ['class X:\n', ''];
  }
  let okWrap = null;
  for (const [pre, post] of wraps) {
    const tree = parser.parse(pre + slice.join('\n') + post);
    if (tree.rootNode.hasError) { tree.delete(); continue; }
    let top = tree.rootNode.namedChildren.filter((n) => !TRIVIA.includes(n.type));
    if (pre) {
      const w = top[0];
      const body = w && (w.childForFieldName('body') || w);
      if (!body) { tree.delete(); continue; }
      top = body.namedChildren.filter((n) => !TRIVIA.includes(n.type));
    }
    if (top.length < 1) { tree.delete(); continue; }
    okWrap = { n: top.length, types: top.map((n) => n.type) };
    tree.delete();
    break;
  }
  // the line after the end must not continue the declaration: a deeper-indented, non-closing next line does
  {
    const indentOf = (l) => /^\s*/.exec(l)[0].length;
    let k = b;
    while (k < lines.length && lines[k].trim() === '') k++;
    const next = lines[k];
    const declLine = slice.find((l) => l.trim() && !isTrivia(l)) || slice[0];
    if (next !== undefined && indentOf(next) > indentOf(declLine) && !/^\s*[})\]]/.test(next) && !isTrivia(next)) {
      problems.push(`next line is more indented than the declaration: ${next.trim().slice(0, 50)}`);
    }
  }
  if (!okWrap) problems.push('slice does not parse as a complete node');
  else if (okWrap.n > 1 && slice.length > 1 && !(okWrap.types.every((t) => /signature|function_declaration|method|overload|variable_declarator|definition/.test(t)) || fam === 'py')) problems.push(`slice holds ${okWrap.n} top-level nodes: ${okWrap.types.join(',')}`);
  return { status: problems.length ? 'FAIL' : 'ok', detail: problems.join('; ') };
}

// A LaTeX document while an agent's save_latex call streams in (page-drafts.ts says what drafts are for). The file
// being written (main.tex's source, or another of its files) shows as far as it has come over the version's text: the
// lines written so far, then the version's lines from where the two meet, so a document written again stays in place
// and only what changes moves. Its other files stay as they were, or as the call gives them once written whole. It is
// typeset when the call is done, not before. A call that changes parts of it (edits) shows them made as they come.
import { alike, inOrder, writingIn, type DraftMemo, type Drafted } from './page-drafts.ts';
import type { PartialJson } from './partial-json.ts';
import { TEX_MAIN, type TexDoc } from './latex.ts';
import { texFromTemplate } from './latex-templates.ts';
import { applyTexEdits } from './tex-edits.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A line with enough in it to be matched far from where it was (a blank line or a lone brace matches only nearby). */
const strong = (l: string) => l.trim().length >= 12;

/**
 * Text written so far (`now`; its last line still coming while `writing`) over the old text: lines matched in order,
 * then the old lines from where the two meet. `at`: where the words have come to in it (-1 when written whole).
 */
export function linesOver(old: string, now: string, writing: boolean): { text: string; at: number } {
  if (!writing) return { text: now, at: -1 };
  const was = old.split('\n');
  const lines = now.split('\n');
  const done = lines.slice(0, -1);
  const open = lines[lines.length - 1];
  const match = inOrder(was, done, done.map(strong));
  // Changed lines between two of those stand in for the old ones there, one for one; after the last one, only while
  // their words are alike (more may be new, the old ones still to come).
  let j = 0;
  while (j < done.length) {
    if (match[j] >= 0) {
      j++;
      continue;
    }
    const from = j;
    while (j < done.length && match[j] < 0) j++;
    const lo = from > 0 ? match[from - 1] + 1 : 0;
    const closed = j < done.length;
    const hi = closed ? match[j] : was.length;
    for (let a = from, b = lo; a < j && b < hi; a++, b++) {
      if (!closed && !alike(was[b], done[a])) break;
      match[a] = b;
    }
  }
  let k = 0;
  for (const m of match) if (m >= 0) k = Math.max(k, m + 1);
  const head = done.join('\n');
  const start = done.length ? head.length + 1 : 0;
  const next = was[k];
  let line = open;
  let rest = k;
  if (next !== undefined && next.startsWith(open)) {
    // Written again as it was, so far: the old line stays whole, the words arriving through it.
    line = next;
    rest = k + 1;
  } else if (next !== undefined && (open.trim().length < 8 || alike(next, open))) rest = k + 1;
  const text = [...done, line, ...was.slice(rest)].join('\n');
  return { text, at: start + open.length };
}

/** A document's files by name, main.tex first. */
const filesOf = (d: TexDoc) => new Map<string, string>([[TEX_MAIN, d.main], ...d.files.map((f) => [f.name, f.text] as [string, string])]);

/** A document with its files' texts as given (a new file after the others), the rest as it was. */
function withFiles(d: TexDoc, files: Map<string, string>): TexDoc {
  const main = files.get(TEX_MAIN) ?? d.main;
  const known = new Set(d.files.map((f) => f.name));
  const list = d.files.map((f) => (files.has(f.name) ? { ...f, text: files.get(f.name)! } : f));
  for (const [name, text] of files) if (name !== TEX_MAIN && !known.has(name)) list.push({ name, text });
  return { ...d, main, files: list };
}

/**
 * The document a save_latex call (as far as it has come, `p`) is writing, over the version open now (`base`; none for
 * a new document): null while it says nothing of its text yet, or when it only answers a file's comments.
 */
export function draftTex(base: TexDoc | null, p: PartialJson, memo: DraftMemo): Drafted<TexDoc> | null {
  memo.turn();
  const v = isObj(p.value) ? p.value : {};
  // A file of this computer's comments, not a document of the Library.
  if (typeof v.path === 'string' && !(typeof v.id === 'string' && v.id)) return null;
  let doc = base;
  if (!doc && typeof v.template === 'string' && !writingIn(p.open, 'template'))
    try {
      doc = texFromTemplate(v.template, typeof v.title === 'string' ? v.title : '');
    } catch {}
  if (doc && Array.isArray(v.edits)) {
    const r = applyTexEdits(filesOf(doc), v.edits as unknown[], { partial: writingIn(p.open, 'edits') ? p.open!.slice(1) : null });
    return { model: withFiles(doc, r.files), mark: r.at ? { kind: 'tex', file: r.at.file, at: r.at.at } : null };
  }
  const old = doc ? filesOf(doc) : new Map<string, string>();
  const files = new Map<string, string>();
  let mark: Drafted<TexDoc>['mark'] = null;
  // main.tex's source, as it comes.
  for (const k of ['source', 'main', 'tex']) {
    if (typeof v[k] !== 'string') continue;
    const r = linesOver(old.get(TEX_MAIN) ?? '', v[k] as string, writingIn(p.open, k));
    files.set(TEX_MAIN, r.text);
    if (r.at >= 0) mark = { kind: 'tex', file: TEX_MAIN, at: r.at };
    break;
  }
  // Its other files: by name ({"refs.bib": "…"}) or as a list ([{name, text}]).
  const o = p.open;
  if (isObj(v.files))
    for (const [name, x] of Object.entries(v.files)) {
      const text = typeof x === 'string' ? x : isObj(x) && typeof (x.text ?? x.content) === 'string' ? ((x.text ?? x.content) as string) : null;
      if (text === null) continue;
      const key = name.replace(/^\.\//, '') || TEX_MAIN;
      const r = linesOver(old.get(key) ?? '', text, !!o && o[0] === 'files' && o[1] === name);
      files.set(key, r.text);
      if (r.at >= 0) mark = { kind: 'tex', file: key, at: r.at };
    }
  else if (Array.isArray(v.files))
    v.files.forEach((x, i) => {
      if (!isObj(x) || typeof x.name !== 'string' || typeof (x.text ?? x.content ?? x.source) !== 'string') return;
      const key = x.name.replace(/^\.\//, '');
      const r = linesOver(old.get(key) ?? '', (x.text ?? x.content ?? x.source) as string, !!o && o[0] === 'files' && o[1] === i);
      files.set(key, r.text);
      if (r.at >= 0) mark = { kind: 'tex', file: key, at: r.at };
    });
  if (!files.size) return doc ? { model: doc, mark: null } : null;
  const shell: TexDoc = doc ?? { v: 1, engine: 'pdflatex', main: '', files: [], pictures: [] };
  return { model: withFiles(shell, files), mark };
}

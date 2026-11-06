// What a document's marks show where they are, worked out from the whole of it (shared/docs.ts DocRefs): each
// footnote's number (where its first mark comes), each numbered caption's label and number ("Figure 2", counted among
// the blocks of its label in the document's order), each cross-reference's words (what it points to is called: a
// numbered caption's label, a heading's words, a bookmark's name), each citation in the document's style, and the
// bibliography (the sources it cites, in the style's order). The editor, the document's own page and its files all
// draw from this, so they say the same.
import { bibRuns, bibSort, citeWords, yearSuffixes, type CiteCtx } from './doc-cite.ts';
import { citeItems, docHeadings, noteNumbers, type Block, type CiteStyle, type Doc, type DocRefs, type Run, type Source } from './docs.ts';

/** A cross-reference whose block is gone shows this. */
export const MISSING_REF = '??';

/** DocRefs, with what they were worked out from (for the editor: what changed, what the citations name). */
export interface Refs extends DocRefs {
  style: CiteStyle;
  /** The sources cited, in the order they are first cited. */
  cited: Source[];
  /** Each numbered block's label and number, by its id. */
  labels: Map<string, string>;
}

/** Each run of a document's words, in order (its tables' cells row by row, then its footnotes'). */
function eachRun(d: Doc, f: (r: Run) => void) {
  for (const b of d.blocks) {
    if (b.type === 'p' || b.type === 'li') b.runs.forEach(f);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) c.runs.forEach(f);
  }
  for (const n of d.notes ?? []) n.runs.forEach(f);
}

/** Numbered blocks: each label's blocks counted in the document's order. */
function labelsOf(blocks: Block[]): Map<string, string> {
  const count = new Map<string, number>();
  const out = new Map<string, string>();
  for (const b of blocks) {
    if ((b.type === 'image' || b.type === 'table' || b.type === 'math') && b.label) {
      const n = (count.get(b.label) ?? 0) + 1;
      count.set(b.label, n);
      out.set(b.id, `${b.label} ${n}`);
    }
  }
  return out;
}

/** The document's refs: footnotes, captions, cross-references, citations and its bibliography. */
export function docRefs(d: Doc): Refs {
  const style: CiteStyle = d.cite ?? 'apa';
  const notes = noteNumbers(d);
  const labels = labelsOf(d.blocks);
  // What a cross-reference shows of what it points to: a numbered block's label, a heading's words, a bookmark's name.
  const heads = new Map(docHeadings(d).map((h) => [h.id, h.text]));
  const marks = new Map<string, string>();
  for (const b of d.blocks) if ((b.type === 'p' || b.type === 'li') && b.bm) marks.set(b.id, b.bm);
  // The sources cited, in the order they are first cited (IEEE's numbers), and their letters (2017a).
  const src = new Map((d.sources ?? []).map((s) => [s.id, s]));
  const num = new Map<string, number>();
  const cited: Source[] = [];
  eachRun(d, (r) => {
    if (!r.cite || r.del) return;
    for (const x of citeItems(r.t)) {
      const s = src.get(x.key);
      if (s && !num.has(s.id)) {
        num.set(s.id, num.size + 1);
        cited.push(s);
      }
    }
  });
  const suffix = yearSuffixes(style, cited);
  const ctx: CiteCtx = { src, num, suffix };
  const texts = new Map<string, string>();
  return {
    style,
    cited,
    labels,
    note: (id) => notes.get(id) ?? 0,
    label: (id) => labels.get(id) ?? null,
    text(r) {
      if (r.xref) return labels.get(r.t) ?? heads.get(r.t) ?? marks.get(r.t) ?? MISSING_REF;
      if (!r.cite) return r.t;
      let t = texts.get(r.t);
      if (t === undefined) texts.set(r.t, (t = citeWords(style, citeItems(r.t), ctx)));
      return t;
    },
    bib: () => bibSort(style, cited, num).map((s) => bibRuns(style, s, { n: num.get(s.id), suffix: suffix.get(s.id) })),
  };
}

/** What a block shows that the whole document decides (its marks' words and numbers, its caption's number, a bibliography's entries), as one key: drawn again when it changes. */
export function refsKey(b: Block, r: Refs): string {
  const ofRuns = (runs: Run[]) => runs.map((x) => (x.fn ? `n${r.note(x.t)}` : x.cite || x.xref ? r.text(x) : '')).join('|');
  if (b.type === 'p' || b.type === 'li') return b.runs.some((x) => x.fn || x.cite || x.xref) ? ofRuns(b.runs) : '';
  if (b.type === 'table') return `${b.label ? r.label(b.id) : ''}#${b.rows.some((row) => row.some((c) => c.runs.some((x) => x.fn || x.cite || x.xref))) ? b.rows.map((row) => row.map((c) => ofRuns(c.runs)).join(',')).join(';') : ''}`;
  if (b.type === 'image' || b.type === 'math') return b.label ? (r.label(b.id) ?? '') : '';
  if (b.type === 'bib') return JSON.stringify(r.bib());
  return '';
}

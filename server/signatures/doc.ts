// A saved signature placed into a document of the Library as a picture block, on the left and sized for a signature
// line: right after the paragraph with the words an agent names ("Signature:"), in place of placeholder words (the
// paragraph goes when they were all it held), after a table whose cell holds the words (a cell holds words only), or
// at the end. The document is checked again as a whole (normalizeDoc) before it is kept.
import { normalizeDoc, PAPERS, newId, type Block, type Doc, type ImageBlock, type Run } from '../../shared/docs.ts';
import type { PlaceSpot } from '../../shared/signatures.ts';

export interface DocSpot {
  placeholder?: string;
  after?: string;
  cell?: unknown;
  occurrence?: number;
}

/** The words of a run of text as they read (words suggested to be taken out, and maths, left out). */
const shown = (r: Run) => (r.del || r.math ? '' : r.t);

/** Where the words are in a text of runs, ignoring case and runs of spaces: their first and last characters. */
function findIn(text: string, words: string): [number, number][] {
  const want = words.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return [];
  let norm = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = /\s/.test(text[i]) ? ' ' : text[i].toLowerCase();
    if (c === ' ' && norm.endsWith(' ')) continue;
    norm += c;
    from.push(i);
  }
  const out: [number, number][] = [];
  for (let i = norm.indexOf(want); i >= 0; i = norm.indexOf(want, i + 1)) out.push([from[i], from[i + want.length - 1]]);
  return out;
}

/** Runs with characters s…e of their words taken out. */
function cut(runs: Run[], s: number, e: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const t = shown(r);
    const r0 = at;
    at += t.length;
    if (!t.length || at <= s || r0 > e) {
      out.push(r);
      continue;
    }
    const keep = t.slice(0, Math.max(0, s - r0)) + t.slice(Math.max(0, e + 1 - r0));
    if (keep) out.push({ ...r, t: keep });
  }
  return out;
}

const clip = (s: string, n: number, end: boolean) => {
  const t = s.replace(/\s+/g, ' ');
  return end ? (t.length > n ? `…${t.slice(-n).trimStart()}` : t) : t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
};

/**
 * The document with the signature `src` (a kept picture) placed at `spot`, `widthMm` wide; where it went in plain words
 * and the words around it. Throws, in words an agent can act on, when the spot is not there.
 */
export function placeInDoc(doc: Doc, src: string, spot: DocSpot, o: { widthMm: number; alt: string }): { doc: Doc; where: string; spot: PlaceSpot; before: string; after: string } {
  if (spot.cell) throw new Error('A document of the Library keeps words alone in a table’s cells: name the words in the cell with after (the signature goes right after the table), or words elsewhere.');
  const paper = PAPERS[doc.page.size] ?? PAPERS.a4;
  const textMm = Math.max(20, paper.w - 2 * doc.page.margin);
  const img: ImageBlock = { id: newId(), type: 'image', src, w: Math.min(1, Math.max(0.05, Math.round((o.widthMm / textMm) * 1000) / 1000)), align: 'left', alt: o.alt };
  const blocks = doc.blocks.slice();
  const words = spot.placeholder || spot.after;
  if (!words) {
    const last = [...blocks].reverse().find((b) => b.type === 'p' || b.type === 'li');
    blocks.push(img);
    return { doc: normalizeDoc({ ...doc, blocks }), where: 'at the end of the document', spot: { kind: 'end' }, before: last && 'runs' in last ? clip(last.runs.map(shown).join(''), 90, true) : '', after: '' };
  }
  // Every place the words are: a paragraph or a list's item, or a table's cell.
  const hits: { block: number; cell?: [number, number]; s: number; e: number; text: string }[] = [];
  blocks.forEach((b, i) => {
    if (b.type === 'p' || b.type === 'li') {
      const text = b.runs.map(shown).join('');
      for (const [s, e] of findIn(text, words)) hits.push({ block: i, s, e, text });
    } else if (b.type === 'table')
      b.rows.forEach((row, r) =>
        row.forEach((c, k) => {
          const text = c.runs.map(shown).join('');
          for (const [s, e] of findIn(text, words)) hits.push({ block: i, cell: [r, k], s, e, text });
        }),
      );
  });
  if (!hits.length) throw new Error(`“${words}” is not in the document. Read it with get_page and name words that are, as they are written there.`);
  const n = Math.trunc(Number(spot.occurrence) || 1);
  const hit = hits[n < 0 ? hits.length + n : n - 1];
  if (!hit) throw new Error(`Those words are in the document ${hits.length} time${hits.length === 1 ? '' : 's'}: occurrence is from 1 to ${hits.length} (or -1 for the last)`);
  const nth = hits.indexOf(hit) + 1;
  const where = `${spot.placeholder ? `in place of “${words}”` : `right after ${hit.cell ? 'the table with ' : ''}“${words}”`}${hits.length > 1 ? ` (the ${nth === 1 ? 'first' : nth === 2 ? 'second' : nth === 3 ? 'third' : `${nth}th`} of ${hits.length} places with those words)` : ''}`;
  const place: PlaceSpot = { kind: 'words', words, how: spot.placeholder ? 'replace' : 'after', ...(hit.cell ? { table: true } : {}), ...(hits.length > 1 ? { nth, of: hits.length } : {}) };
  const before = clip(hit.text.slice(0, spot.placeholder ? hit.s : hit.e + 1), 90, true);
  const after = clip(hit.text.slice(hit.e + 1), 90, false);
  const b = blocks[hit.block];
  if (spot.placeholder) {
    if (b.type === 'table' && hit.cell) {
      const [r, k] = hit.cell;
      const rows = b.rows.map((row, ri) => row.map((c, ki) => (ri === r && ki === k ? { ...c, runs: cut(c.runs, hit.s, hit.e) } : c)));
      blocks[hit.block] = { ...b, rows };
    } else if (b.type === 'p' || b.type === 'li') {
      const runs = cut(b.runs, hit.s, hit.e);
      // The paragraph goes when the words were all it had.
      if (!runs.map(shown).join('').trim() && b.type === 'p') {
        blocks.splice(hit.block, 1, img);
        return { doc: normalizeDoc({ ...doc, blocks }), where, spot: place, before, after };
      }
      blocks[hit.block] = { ...b, runs } as Block;
    }
  }
  blocks.splice(hit.block + 1, 0, img);
  return { doc: normalizeDoc({ ...doc, blocks }), where, spot: place, before, after };
}

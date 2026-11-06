// The editing of a document, as changes to its model: where a place in it is (a block, a table's cell, how far into
// its words), and what each edit does: typing, Enter, Backspace at a block's start and Delete at its end, taking
// out what is selected, pasting blocks, the look of words, a paragraph's style, spacing, lists and indents,
// alignment, tables' rows and columns (merged cells kept whole), their cells' fills and merges, pictures, comments'
// marks on words, finding and replacing words, and words' case. Pure functions of the model: the editor (engine.ts)
// maps the browser's selection to places and draws what they return.
import {
  docText,
  isAtom,
  fixMerges,
  listInfo,
  lookOf,
  mergeRuns,
  newId,
  runsText,
  type Align,
  type Spacing,
  type Block,
  type Cell,
  type Doc,
  type ImageBlock,
  type ItemBlock,
  type ListKind,
  type Look,
  type ParaBlock,
  type ParaStyle,
  type Run,
  type TableBlock,
  type TextBlock,
} from '@shared/docs';

/** A place in a document: in a block's words (or a table's cell's: row, column), `o` characters in. */
export interface Pos {
  b: string;
  c?: [number, number];
  o: number;
}

export interface Edit {
  doc: Doc;
  /** Where the caret goes. */
  at: Pos;
  /** A picture (or a line, a page break) to pick instead. */
  pick?: string;
}

export const isText = (b: Block | undefined): b is TextBlock => !!b && (b.type === 'p' || b.type === 'li');
export const sameCell = (a?: [number, number], b?: [number, number]) => (!a && !b) || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);
/** In the same words: the same block, and the same cell of it. */
export const sameBox = (a: Pos, b: Pos) => a.b === b.b && sameCell(a.c, b.c);
export const samePos = (a: Pos, b: Pos) => sameBox(a, b) && a.o === b.o;

const indexes = new WeakMap<Block[], Map<string, number>>();

/** Where a block is in the document (-1 when it is not). */
export function indexOf(doc: Doc, id: string): number {
  let m = indexes.get(doc.blocks);
  if (!m) {
    m = new Map(doc.blocks.map((b, i) => [b.id, i]));
    indexes.set(doc.blocks, m);
  }
  return m.get(id) ?? -1;
}

export const blockOf = (doc: Doc, id: string): Block | undefined => doc.blocks[indexOf(doc, id)];

/** Which of two places comes first (negative when `p` does). */
export function cmp(doc: Doc, p: Pos, q: Pos): number {
  const a = indexOf(doc, p.b);
  const b = indexOf(doc, q.b);
  if (a !== b) return a - b;
  const pc = p.c ? p.c[0] * 4096 + p.c[1] : -1;
  const qc = q.c ? q.c[0] * 4096 + q.c[1] : -1;
  return pc !== qc ? pc - qc : p.o - q.o;
}

/** Two places, the first first. */
export const ordered = (doc: Doc, a: Pos, f: Pos): [Pos, Pos] => (cmp(doc, a, f) <= 0 ? [a, f] : [f, a]);

/** A block with no field left that says nothing (style: undefined). */
function tidy<T extends Block>(b: T): T {
  const o = b as unknown as Record<string, unknown>;
  for (const k of Object.keys(o)) if (o[k] === undefined || (k === 'lvl' && o[k] === 0)) delete o[k];
  return b;
}

/** An id no block of the document has. */
export function freshId(doc: Doc): string {
  let id = newId();
  while (indexOf(doc, id) >= 0) id = newId();
  return id;
}

const withBlocks = (doc: Doc, blocks: Block[]): Doc => ({ ...doc, blocks });

/** The document with `count` blocks from `i` replaced by `list`. */
export function splice(doc: Doc, i: number, count: number, list: Block[]): Doc {
  return withBlocks(doc, [...doc.blocks.slice(0, i), ...list, ...doc.blocks.slice(i + count)]);
}

function withBlock(doc: Doc, i: number, b: Block): Doc {
  const blocks = doc.blocks.slice();
  blocks[i] = b;
  return withBlocks(doc, blocks);
}

/** A document ends with words to write in (a caret has no place after a last picture or table). */
export function fixDoc(doc: Doc): Doc {
  const last = doc.blocks[doc.blocks.length - 1];
  return isText(last) ? doc : withBlocks(doc, [...doc.blocks, { id: freshId(doc), type: 'p', runs: [] }]);
}

// ---- runs --------------------------------------------------------------------------------------------------

export const lenOf = (runs: Run[]) => runs.reduce((n, r) => n + r.t.length, 0);

/** Runs cut at `o` characters in. */
export function splitAt(runs: Run[], o: number): [Run[], Run[]] {
  const left: Run[] = [];
  const right: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const end = at + r.t.length;
    if (end <= o) left.push(r);
    else if (at >= o) right.push(r);
    else {
      left.push({ ...r, t: r.t.slice(0, o - at) });
      right.push({ ...r, t: r.t.slice(o - at) });
    }
    at = end;
  }
  return [left, right];
}

export const sliceRuns = (runs: Run[], from: number, to: number) => splitAt(splitAt(runs, to)[0], from)[1];

/**
 * How words typed at `o` look: as the character before (or, at the start, after). A link, or a comment's words, does
 * not go on past its end (as in Google Docs); in their middle, where they go on in the next run, words typed are theirs.
 */
export function lookAt(runs: Run[], o: number): Look {
  let at = 0;
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    const end = at + r.t.length;
    if (o > at && o <= end) {
      // Words typed after an equation are words.
      if (isAtom(r)) return {};
      const look = typedLook(r);
      if (o === end) {
        const next = runs[k + 1];
        if (look.link && next?.link !== look.link) delete look.link;
        const cm = look.cm?.filter((id) => next?.cm?.includes(id));
        if (cm?.length) look.cm = cm;
        else delete look.cm;
      }
      return look;
    }
    at = end;
  }
  const first = runs[0] && !isAtom(runs[0]) ? typedLook(runs[0]) : {};
  delete first.link;
  delete first.cm;
  return first;
}

/** A run's look for words typed beside it: never its suggested change's marks (words typed are yours, or a suggestion of yours). */
function typedLook(r: Run): Look {
  const { ins: _i, del: _d, fmt: _f, was: _w, ...look } = lookOf(r);
  return look;
}

/** The run a place is in: the character before it's (at the start, the first). */
export function runAt(runs: Run[], o: number): Run | undefined {
  let at = 0;
  for (const r of runs) {
    const end = at + r.t.length;
    if (o > at && o <= end) return r;
    at = end;
  }
  return runs[0];
}

/** A place in words moved off the inside of an equation (which is one thing): to its nearer edge, or `after`. */
export function snapOut(runs: Run[], o: number, after?: boolean): number {
  let at = 0;
  for (const r of runs) {
    const end = at + r.t.length;
    if (isAtom(r) && o > at && o < end) return after === undefined ? (o - at < end - o ? at : end) : after ? end : at;
    at = end;
  }
  return o;
}

/** Where the character before `o` starts (`back`), or the one after it ends: a letter as people see one (an emoji with its joiners), an equation whole. */
export function charStep(runs: Run[], o: number, back: boolean): number {
  let at = 0;
  for (const r of runs) {
    const end = at + r.t.length;
    if (isAtom(r) && (back ? o > at && o <= end : o >= at && o < end)) return back ? at : end;
    at = end;
  }
  const text = runsText(runs);
  if (typeof Intl.Segmenter !== 'function') return Math.max(0, Math.min(text.length, o + (back ? -1 : 1)));
  let last = 0;
  for (const { index } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) {
    if (back) {
      if (index >= o) return last;
      last = index;
    } else if (index > o) return index;
  }
  return back ? last : text.length;
}

/** Where the word before `o` starts (`back`), or the one after it ends, as Ctrl+Backspace takes one out: the spaces beside it with it. */
export function wordStep(runs: Run[], o: number, back: boolean): number {
  const t = searchText(runs);
  const w = (ch: string | undefined) => !!ch && /[\p{L}\p{N}_'’]/u.test(ch);
  let i = o;
  if (back) {
    while (i > 0 && /\s/.test(t[i - 1])) i--;
    if (w(t[i - 1])) while (w(t[i - 1])) i--;
    else if (i > 0) i--;
  } else {
    while (i < t.length && /\s/.test(t[i])) i++;
    if (w(t[i])) while (w(t[i])) i++;
    else if (i < t.length) i++;
  }
  return snapOut(runs, i, !back);
}

/** The word around `o` (letters and digits), or null where there is none (between spaces). */
export function wordAt(runs: Run[], o: number): [number, number] | null {
  const t = runsText(runs);
  const w = /[\p{L}\p{N}_'’-]/u;
  let a = o;
  let b = o;
  while (a > 0 && w.test(t[a - 1])) a--;
  while (b < t.length && w.test(t[b])) b++;
  return b > a && a < o && o < b ? [a, b] : null;
}

// ---- the words of a place ----------------------------------------------------------------------------------

/** The runs of the words a place is in (a text block's, or a cell's), or null. */
export function boxRuns(doc: Doc, b: string, c?: [number, number]): Run[] | null {
  const blk = blockOf(doc, b);
  if (!blk) return null;
  if (c) return blk.type === 'table' ? (blk.rows[c[0]]?.[c[1]]?.runs ?? null) : null;
  return isText(blk) ? blk.runs : null;
}

/** The document with those words' runs replaced. */
export function setBox(doc: Doc, b: string, c: [number, number] | undefined, runs: Run[]): Doc {
  const i = indexOf(doc, b);
  const blk = doc.blocks[i];
  if (!blk) return doc;
  if (c && blk.type === 'table') return withBlock(doc, i, { ...blk, rows: blk.rows.map((r, ri) => (ri !== c[0] ? r : r.map((cell, ci) => (ci !== c[1] ? cell : { ...cell, runs })))) });
  if (!c && isText(blk)) return withBlock(doc, i, { ...blk, runs });
  return doc;
}

/** Each set of words a stretch passes through (text blocks, a table's cells), and how much of them. */
export function boxesIn(doc: Doc, s: Pos, e: Pos): { b: string; c?: [number, number]; from: number; to: number }[] {
  const out: { b: string; c?: [number, number]; from: number; to: number }[] = [];
  const si = indexOf(doc, s.b);
  const ei = indexOf(doc, e.b);
  for (let i = si; i <= ei && i >= 0; i++) {
    const B = doc.blocks[i];
    if (isText(B)) out.push({ b: B.id, from: i === si ? s.o : 0, to: i === ei ? e.o : lenOf(B.runs) });
    else if (B.type === 'table') {
      const cols = B.rows[0]?.length ?? 0;
      const first = i === si && s.c ? s.c[0] * cols + s.c[1] : 0;
      const last = i === ei && e.c ? e.c[0] * cols + e.c[1] : B.rows.length * cols - 1;
      for (let k = first; k <= last; k++) {
        const c: [number, number] = [Math.floor(k / cols), k % cols];
        const len = lenOf(B.rows[c[0]][c[1]].runs);
        out.push({ b: B.id, c, from: k === first && i === si && s.c ? s.o : 0, to: k === last && i === ei && e.c ? e.o : len });
      }
    }
  }
  return out;
}

/** The words between two places, as plain text (blocks on lines of their own, cells apart by tabs). */
export function textBetween(doc: Doc, s: Pos, e: Pos): string {
  const parts: string[] = [];
  let last = '';
  for (const bx of boxesIn(doc, s, e)) {
    const t = runsText(sliceRuns(boxRuns(doc, bx.b, bx.c) ?? [], bx.from, bx.to));
    if (parts.length) parts.push(bx.b === last && bx.c ? (bx.c[1] === 0 ? '\n' : '\t') : '\n');
    parts.push(t);
    last = bx.b;
  }
  return parts.join('');
}

// ---- typing and taking out ---------------------------------------------------------------------------------

/** A table with the words between two of its places (null: its start, or its end) taken out of its cells. */
function clearCells(t: TableBlock, from: Pos | null, to: Pos | null): TableBlock {
  const cols = t.rows[0]?.length ?? 0;
  const a = from?.c ? from.c[0] * cols + from.c[1] : 0;
  const z = to?.c ? to.c[0] * cols + to.c[1] : t.rows.length * cols - 1;
  return {
    ...t,
    rows: t.rows.map((r, ri) =>
      r.map((cell, ci) => {
        const k = ri * cols + ci;
        if (k < a || k > z) return cell;
        const len = lenOf(cell.runs);
        const lo = k === a && from?.c ? from.o : 0;
        const hi = k === z && to?.c ? to.o : len;
        return lo >= hi ? cell : { ...cell, runs: mergeRuns([...splitAt(cell.runs, lo)[0], ...splitAt(cell.runs, hi)[1]]) };
      }),
    ),
  };
}

/** What is between two places taken out: the words between them, and the blocks wholly between. */
export function deleteRange(doc: Doc, a: Pos, f: Pos): Edit {
  const [s, e] = ordered(doc, a, f);
  if (samePos(s, e)) return { doc, at: s };
  const si = indexOf(doc, s.b);
  const ei = indexOf(doc, e.b);
  const S = doc.blocks[si];
  const E = doc.blocks[ei];
  if (si === ei) {
    if (sameCell(s.c, e.c)) {
      const runs = boxRuns(doc, s.b, s.c) ?? [];
      return { doc: setBox(doc, s.b, s.c, mergeRuns([...splitAt(runs, s.o)[0], ...splitAt(runs, e.o)[1]])), at: s };
    }
    return { doc: S.type === 'table' ? withBlock(doc, si, clearCells(S, s, e)) : doc, at: s };
  }
  const head: Block | null = isText(S) ? { ...S, runs: splitAt(S.runs, s.o)[0] } : S.type === 'table' ? clearCells(S, s, null) : null;
  const tail: Block | null = isText(E) ? { ...E, runs: splitAt(E.runs, e.o)[1] } : E.type === 'table' ? clearCells(E, null, e) : null;
  const out: Block[] = [];
  // Words on both sides join in the first block (its kind, its style).
  if (head && tail && isText(head) && isText(tail)) out.push({ ...head, runs: mergeRuns([...head.runs, ...tail.runs]) });
  else {
    if (head) out.push(head);
    if (tail) out.push(tail);
  }
  return { doc: splice(doc, si, ei - si + 1, out), at: s };
}

/** Words typed at a place (looking as `look`, else as the words there). */
export function insertText(doc: Doc, at: Pos, text: string, look?: Look): Edit {
  const runs = boxRuns(doc, at.b, at.c);
  if (!runs || !text) return { doc, at };
  const [l, r] = splitAt(runs, at.o);
  return { doc: setBox(doc, at.b, at.c, mergeRuns([...l, { ...(look ?? lookAt(runs, at.o)), t: text }, ...r])), at: { ...at, o: at.o + text.length } };
}

/** Runs put in at a place, as they look. */
export function insertRuns(doc: Doc, at: Pos, ins: Run[]): Edit {
  const runs = boxRuns(doc, at.b, at.c);
  if (!runs) return { doc, at };
  const [l, r] = splitAt(runs, at.o);
  return { doc: setBox(doc, at.b, at.c, mergeRuns([...l, ...ins, ...r])), at: { ...at, o: at.o + lenOf(ins) } };
}

/** A new block of the kind of `b`, empty (a heading's next one, at its end, is normal text). */
function like(doc: Doc, b: TextBlock, atEnd: boolean): TextBlock {
  if (b.type === 'li') return tidy({ id: freshId(doc), type: 'li', list: b.list, lvl: b.lvl, align: b.align, runs: [] } as ItemBlock);
  // After a heading (or the title) comes normal text, aligned as normal text is.
  const reset = atEnd && (b.style === 'title' || b.style === 'subtitle' || /^h\d$/.test(b.style ?? ''));
  return tidy({ id: freshId(doc), type: 'p', style: reset ? undefined : b.style, align: reset ? undefined : b.align, lvl: b.lvl, runs: [] } as ParaBlock);
}

/** A list item made a paragraph (its indent kept). */
const toPara = (b: ItemBlock): ParaBlock => tidy({ id: b.id, type: 'p', align: b.align, lvl: b.lvl, runs: b.runs } as ParaBlock);

/** A quote, code or callout made normal text (a callout's emoji and tint go with its style). */
const plainPara = (b: ParaBlock): ParaBlock => tidy({ ...b, style: undefined, icon: undefined, tint: undefined });

/** Enter: the block split at the caret (a list's empty item ends the list; code takes a line break instead). */
export function enter(doc: Doc, at: Pos): Edit {
  if (at.c) return insertText(doc, at, '\n');
  const i = indexOf(doc, at.b);
  const B = doc.blocks[i];
  if (!isText(B)) return { doc, at };
  const text = runsText(B.runs);
  if (B.type === 'p' && B.style === 'code') {
    // An empty line at its end ends it: what is typed next is normal text.
    if (at.o === text.length && text.endsWith('\n')) {
      const np: ParaBlock = { id: freshId(doc), type: 'p', runs: [] };
      return { doc: splice(doc, i, 1, [{ ...B, runs: splitAt(B.runs, text.length - 1)[0] }, np]), at: { b: np.id, o: 0 } };
    }
    return insertText(doc, at, '\n');
  }
  if (!text) {
    if (B.type === 'li') return { doc: withBlock(doc, i, B.lvl ? tidy({ ...B, lvl: B.lvl - 1 }) : toPara(B)), at };
    // An empty quote or callout ends it: what is typed next is normal text (else each Enter made another one).
    if (B.style === 'quote' || B.style === 'callout') return { doc: withBlock(doc, i, plainPara(B)), at };
  }
  if (at.o === 0 && text) {
    // At its start: an empty block before it, its words where they are.
    return { doc: splice(doc, i, 0, [like(doc, B, false)]), at };
  }
  const [l, r] = splitAt(B.runs, at.o);
  const second = { ...like(doc, B, !r.length), runs: r } as TextBlock;
  return { doc: splice(doc, i, 1, [{ ...B, runs: l }, second]), at: { b: second.id, o: 0 } };
}

/** Backspace at a block's start: a list item's mark goes, an indent comes back, a quote is normal text; else it joins the block before. */
export function backspace(doc: Doc, at: Pos): Edit {
  if (at.c) return { doc, at };
  const i = indexOf(doc, at.b);
  const B = doc.blocks[i];
  if (!isText(B)) return { doc, at };
  if (B.type === 'li') return { doc: withBlock(doc, i, toPara(B)), at };
  if (B.lvl) return { doc: withBlock(doc, i, tidy({ ...B, lvl: B.lvl - 1 })), at };
  if (B.style === 'quote' || B.style === 'code' || B.style === 'callout') return { doc: withBlock(doc, i, plainPara(B)), at };
  const P = doc.blocks[i - 1];
  if (!P) return B.style ? { doc: withBlock(doc, i, tidy({ ...B, style: undefined })), at } : { doc, at };
  if (isText(P)) return { doc: splice(doc, i - 1, 2, [{ ...P, runs: mergeRuns([...P.runs, ...B.runs]) }]), at: { b: P.id, o: lenOf(P.runs) } };
  if (P.type === 'table') {
    const c: [number, number] = [P.rows.length - 1, (P.rows[0]?.length ?? 1) - 1];
    const end: Pos = { b: P.id, c, o: lenOf(P.rows[c[0]][c[1]].runs) };
    return { doc: !B.runs.length && i < doc.blocks.length - 1 ? splice(doc, i, 1, []) : doc, at: end };
  }
  // A picture is picked first (the next Backspace takes it out); a line across or a page break goes.
  if (P.type === 'image') return { doc: !B.runs.length && i < doc.blocks.length - 1 ? splice(doc, i, 1, []) : doc, at, pick: P.id };
  return { doc: splice(doc, i - 1, 1, []), at };
}

/** Delete at a block's end: the block after joins it (a picture is picked, a line or page break goes). */
export function deleteForward(doc: Doc, at: Pos): Edit {
  if (at.c) return { doc, at };
  const i = indexOf(doc, at.b);
  const B = doc.blocks[i];
  const N = doc.blocks[i + 1];
  if (!isText(B) || !N) return { doc, at };
  if (isText(N)) return { doc: splice(doc, i, 2, [{ ...B, runs: mergeRuns([...B.runs, ...N.runs]) }]), at };
  if (N.type === 'table') return { doc: B.runs.length ? doc : splice(doc, i, 1, []), at: { b: N.id, c: [0, 0], o: 0 } };
  if (N.type === 'image') return { doc, at, pick: N.id };
  return { doc: splice(doc, i + 1, 1, []), at };
}

/** A block's words, for putting blocks in a table's cell. */
function runsOf(b: Block): Run[] {
  if (isText(b)) return b.runs;
  if (b.type === 'table') return b.rows.flatMap((r, ri) => [...(ri ? [{ t: '\n' }] : []), ...r.flatMap((c, ci) => [...(ci ? [{ t: '\t' }] : []), ...c.runs])]);
  if (b.type === 'image') return b.caption || b.alt ? [{ t: b.caption || b.alt || '' }] : [];
  return [];
}

/**
 * Blocks put in at a place (pasted, or a picture, a table, a line, a page break): one block of words goes in among
 * the words; others split the block there, the first joining the words before and the last the words after.
 */
export function insertBlocks(doc: Doc, at: Pos, list: Block[]): Edit {
  if (!list.length) return { doc, at };
  if (at.c) {
    const runs: Run[] = [];
    list.forEach((b) => {
      const r = runsOf(b);
      if (runs.length && r.length) runs.push({ t: '\n' });
      runs.push(...r);
    });
    return insertRuns(doc, at, mergeRuns(runs));
  }
  const i = indexOf(doc, at.b);
  const T = doc.blocks[i];
  if (!isText(T)) return { doc, at };
  const first = list[0];
  if (list.length === 1 && isText(first)) {
    // An empty block takes the pasted one's kind.
    if (!T.runs.length) return { doc: withBlock(doc, i, { ...first, id: T.id }), at: { b: T.id, o: lenOf(first.runs) } };
    return insertRuns(doc, at, first.runs);
  }
  const [l, r] = splitAt(T.runs, at.o);
  const out: Block[] = [];
  let mid = list;
  let idFree = true;
  if (l.length) {
    if (isText(first)) {
      out.push({ ...T, runs: mergeRuns([...l, ...first.runs]) });
      mid = mid.slice(1);
    } else out.push({ ...T, runs: l });
    idFree = false;
  } else if (isText(first)) {
    out.push({ ...first, id: T.id });
    mid = mid.slice(1);
    idFree = false;
  }
  const last = mid[mid.length - 1];
  if (mid.length && isText(last)) {
    out.push(...mid.slice(0, -1), { ...last, runs: mergeRuns([...last.runs, ...r]) });
    return { doc: splice(doc, i, 1, out), at: { b: last.id, o: lenOf(last.runs) } };
  }
  out.push(...mid);
  const next = doc.blocks[i + 1];
  // Nothing after the caret, and words to write in next already: the caret goes there.
  if (!r.length && isText(next) && !idFree) return { doc: splice(doc, i, 1, out), at: { b: next.id, o: 0 } };
  const tail = { ...like(doc, T, !r.length), runs: r } as TextBlock;
  if (idFree) tail.id = T.id;
  out.push(tail);
  return { doc: splice(doc, i, 1, out), at: { b: tail.id, o: 0 } };
}

/** A block moved to stand before the block now at `to` (the end, past the last); the caret goes to its start. */
export function moveBlock(doc: Doc, id: string, to: number): Edit {
  const i = indexOf(doc, id);
  if (i < 0 || to === i || to === i + 1) return { doc, at: nearPos(doc, Math.max(0, i)) };
  const b = doc.blocks[i];
  const rest = doc.blocks.filter((_, k) => k !== i);
  const at = to > i ? to - 1 : to;
  const d = fixDoc(withBlocks(doc, [...rest.slice(0, at), b, ...rest.slice(at)]));
  return isText(b) ? { doc: d, at: { b: b.id, o: 0 } } : { doc: d, at: nearPos(d, at), pick: b.type === 'table' ? undefined : b.id };
}

/** A block taken out; the caret goes to the words after it (or before; or an empty paragraph made for it). */
export function removeBlock(doc: Doc, id: string): Edit {
  const i = indexOf(doc, id);
  if (i < 0) return { doc, at: firstPos(doc) };
  let d = splice(doc, i, 1, []);
  if (!d.blocks.length) d = withBlocks(d, [{ id: freshId(doc), type: 'p', runs: [] }]);
  d = fixDoc(d);
  return { doc: d, at: nearPos(d, Math.min(i, d.blocks.length - 1)) };
}

/** The first place for words in the document. */
export function firstPos(doc: Doc): Pos {
  return nearPos(doc, 0);
}

/** The place for words nearest block `i` (its start, or the next block's, or the end of one before). */
export function nearPos(doc: Doc, i: number, back = false): Pos {
  const at = (k: number): Pos | null => {
    const b = doc.blocks[k];
    if (isText(b)) return { b: b.id, o: back ? lenOf(b.runs) : 0 };
    if (b?.type === 'table' && b.rows.length) {
      const c: [number, number] = back ? [b.rows.length - 1, b.rows[0].length - 1] : [0, 0];
      return { b: b.id, c, o: back ? lenOf(b.rows[c[0]][c[1]].runs) : 0 };
    }
    return null;
  };
  for (let k = i; k < doc.blocks.length && k >= 0; back ? k-- : k++) {
    const p = at(k);
    if (p) return p;
  }
  for (let k = i; k < doc.blocks.length && k >= 0; back ? k++ : k--) {
    const p = at(k);
    if (p) return p;
  }
  return { b: doc.blocks[0]?.id ?? '', o: 0 };
}

/** The end of a block's words. */
export function endOf(doc: Doc, id: string): Pos {
  return nearPos(doc, indexOf(doc, id), true);
}

// ---- how words look ------------------------------------------------------------------------------------------

/** The words between two places, each run changed by `f`. */
export function mapLook(doc: Doc, s: Pos, e: Pos, f: (r: Run) => Run): Doc {
  let d = doc;
  for (const bx of boxesIn(doc, s, e)) {
    if (bx.from >= bx.to) continue;
    const runs = boxRuns(d, bx.b, bx.c) ?? [];
    const [l, rest] = splitAt(runs, bx.from);
    const [m, r] = splitAt(rest, bx.to - bx.from);
    d = setBox(d, bx.b, bx.c, mergeRuns([...l, ...m.map(f), ...r]));
  }
  return d;
}

/** The runs between two places (pieces of them where they are cut). */
export function runsBetween(doc: Doc, s: Pos, e: Pos): Run[] {
  return boxesIn(doc, s, e).flatMap((bx) => sliceRuns(boxRuns(doc, bx.b, bx.c) ?? [], bx.from, bx.to));
}

type Flag = 'b' | 'i' | 'u' | 's' | 'code' | 'sup' | 'sub';

/** Whether all the words between two places have a look (spaces aside). */
export function allHave(doc: Doc, s: Pos, e: Pos, k: Flag): boolean {
  const runs = runsBetween(doc, s, e).filter((r) => r.t.trim());
  return runs.length > 0 && runs.every((r) => r[k]);
}

/** A run with a look on (or off): bold, italic… (raised and lowered words are one or the other). */
export const flagFn =
  (k: Flag, on: boolean) =>
  (r: Run): Run => {
    const n: Run = { ...r };
    if (on) n[k] = true;
    else delete n[k];
    if (on && k === 'sup') delete n.sub;
    if (on && k === 'sub') delete n.sup;
    return n;
  };

/** A run with a colour, highlight, size, font or link (undefined takes it off). */
export const valueFn =
  (k: 'color' | 'hl' | 'size' | 'font' | 'link', v: string | number | undefined) =>
  (r: Run): Run => {
    const n: Record<string, unknown> = { ...r };
    if (v === undefined || v === '') delete n[k];
    else n[k] = v;
    return n as unknown as Run;
  };

/** A run with no look of its own but its link (an equation stays one; comments and suggestions stay on their words). */
export const clearFn = (r: Run): Run => {
  if (isAtom(r)) return r;
  const { t, link, cm, ins, del, fmt, was } = r;
  return { t, ...(link ? { link } : {}), ...(cm ? { cm } : {}), ...(ins ? { ins } : {}), ...(del ? { del } : {}), ...(fmt ? { fmt, was } : {}) };
};

/** A look on (or off) for the words between two places. */
export const setFlag = (doc: Doc, s: Pos, e: Pos, k: Flag, on: boolean): Doc => mapLook(doc, s, e, flagFn(k, on));

/** A colour, highlight, size, font or link for the words between two places (undefined takes it off). */
export const setValue = (doc: Doc, s: Pos, e: Pos, k: 'color' | 'hl' | 'size' | 'font' | 'link', v: string | number | undefined): Doc => mapLook(doc, s, e, valueFn(k, v));

/** The words between two places with no look of their own but their links (an equation stays one, comments stay on their words). */
export const clearLook = (doc: Doc, s: Pos, e: Pos): Doc => mapLook(doc, s, e, clearFn);

/** What the words between two places share: each value they all have. */
export function commonLook(doc: Doc, s: Pos, e: Pos): Look {
  const runs = runsBetween(doc, s, e).filter((r) => r.t.trim());
  if (!runs.length) return lookAt(boxRuns(doc, s.b, s.c) ?? [], s.o);
  const out: Look = {};
  for (const k of ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'color', 'hl', 'size', 'font', 'link'] as const) {
    const v = runs[0][k];
    if (v !== undefined && runs.every((r) => r[k] === v)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** A link's stretch around a place: the run of words with the same address. */
export function linkAt(doc: Doc, at: Pos): { from: number; to: number; link: string } | null {
  const runs = boxRuns(doc, at.b, at.c);
  if (!runs) return null;
  let o = 0;
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    const end = o + r.t.length;
    if (r.link && at.o >= o && at.o <= end && (at.o < end || at.o > o)) {
      let from = o;
      let to = end;
      for (let j = k - 1; j >= 0 && runs[j].link === r.link; j--) from -= runs[j].t.length;
      for (let j = k + 1; j < runs.length && runs[j].link === r.link; j++) to += runs[j].t.length;
      return { from, to, link: r.link };
    }
    o = end;
  }
  return null;
}

// ---- paragraphs ------------------------------------------------------------------------------------------------

/** The text blocks between two places (and the block of each). */
export function textBlocksIn(doc: Doc, s: Pos, e: Pos): number[] {
  const out: number[] = [];
  for (let i = indexOf(doc, s.b); i <= indexOf(doc, e.b) && i >= 0; i++) if (isText(doc.blocks[i])) out.push(i);
  return out;
}

const mapBlocks = (doc: Doc, idx: number[], f: (b: TextBlock) => Block): Doc => {
  const blocks = doc.blocks.slice();
  for (const i of idx) blocks[i] = f(blocks[i] as TextBlock);
  return withBlocks(doc, blocks);
};

/** A paragraph style for the text blocks between two places (a list's items become paragraphs, but for normal text). */
export function setStyle(doc: Doc, s: Pos, e: Pos, style: ParaStyle): Doc {
  const idx = textBlocksIn(doc, s, e);
  let d = mapBlocks(doc, idx, (b) => {
    if (b.type === 'li') return style === 'normal' ? b : tidy({ id: b.id, type: 'p', style, align: b.align, runs: b.runs } as ParaBlock);
    const head = style === 'title' || style === 'subtitle' || /^h\d$/.test(style);
    return tidy({ ...b, style: style === 'normal' ? undefined : style, lvl: head ? undefined : b.lvl });
  });
  // Code made of several paragraphs is one block of lines.
  if (style === 'code' && idx.length > 1) {
    const first = idx[0];
    const joined: Run[] = [];
    idx.forEach((i, k) => {
      if (k) joined.push({ t: '\n' });
      joined.push(...(d.blocks[i] as TextBlock).runs.map((r) => ({ t: r.t })));
    });
    const keep = { ...(d.blocks[first] as ParaBlock), runs: mergeRuns(joined) };
    const gone = new Set(idx.slice(1));
    d = withBlocks(
      d,
      d.blocks.flatMap((b, i) => (i === first ? [keep] : gone.has(i) ? [] : [b])),
    );
  }
  return d;
}

/** Bullets, numbers or a checklist for the text blocks between two places; off again when they all are already. */
export function toggleList(doc: Doc, s: Pos, e: Pos, kind: ListKind): Doc {
  const idx = textBlocksIn(doc, s, e);
  const all = idx.length > 0 && idx.every((i) => doc.blocks[i].type === 'li' && (doc.blocks[i] as ItemBlock).list === kind);
  return mapBlocks(doc, idx, (b) => {
    if (all && b.type === 'li') return toPara(b);
    if (b.type === 'li') return tidy({ ...b, list: kind, checked: kind === 'check' ? b.checked : undefined });
    return tidy({ id: b.id, type: 'li', list: kind, lvl: b.style ? undefined : b.lvl, align: b.align, runs: b.runs } as ItemBlock);
  });
}

/** A step more (or less) indent: a list's items a level deeper, paragraphs further in. */
export function indent(doc: Doc, s: Pos, e: Pos, by: 1 | -1): Doc {
  return mapBlocks(doc, textBlocksIn(doc, s, e), (b) => {
    if (b.type === 'p' && (b.style === 'title' || b.style === 'subtitle' || /^h\d$/.test(b.style ?? ''))) return b;
    return tidy({ ...b, lvl: Math.max(0, Math.min(4, (b.lvl ?? 0) + by)) });
  });
}

/** Alignment for the text blocks between two places, and the cells of tables between them. */
export function setAlign(doc: Doc, s: Pos, e: Pos, align: Align): Doc {
  const a = align === 'left' ? undefined : align;
  let d = mapBlocks(doc, textBlocksIn(doc, s, e), (b) => tidy({ ...b, align: a }));
  for (const bx of boxesIn(doc, s, e)) {
    if (!bx.c) continue;
    const i = indexOf(d, bx.b);
    const t = d.blocks[i] as TableBlock;
    d = withBlock(d, i, { ...t, rows: t.rows.map((r, ri) => r.map((c, ci) => (ri === bx.c![0] && ci === bx.c![1] ? (a ? { ...c, align: a } : { runs: c.runs }) : c))) });
  }
  return d;
}

/** A checklist's item ticked, or not. */
export function toggleCheck(doc: Doc, id: string): Doc {
  const i = indexOf(doc, id);
  const b = doc.blocks[i];
  return b?.type === 'li' && b.list === 'check' ? withBlock(doc, i, tidy({ ...b, checked: b.checked ? undefined : true })) : doc;
}

/** A block replaced by itself changed (a picture's size, its caption). */
export function patchBlock<T extends Block>(doc: Doc, id: string, f: (b: T) => T): Doc {
  const i = indexOf(doc, id);
  return i < 0 ? doc : withBlock(doc, i, tidy(f(doc.blocks[i] as T)));
}

// ---- tables --------------------------------------------------------------------------------------------------------

export type TableOp = 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'delTable' | 'head';

/** A new table: `rows` × `cols` empty cells, its first row a header when it has more than one. */
export function newTable(doc: Doc, rows: number, cols: number): TableBlock {
  const t: TableBlock = { id: freshId(doc), type: 'table', rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ runs: [] }) as Cell)) };
  if (rows > 1) t.head = true;
  return t;
}

const share = (cols: number[] | undefined) => {
  if (!cols) return undefined;
  const sum = cols.reduce((a, b) => a + b, 0);
  return sum > 0 ? cols.map((c) => Math.round((c / sum) * 10000) / 10000) : undefined;
};

/** A change to a table's rows or columns, at a cell of it; where the caret goes. */
export function tableOp(doc: Doc, id: string, cell: [number, number], op: TableOp): Edit {
  const i = indexOf(doc, id);
  const t = doc.blocks[i];
  if (t?.type !== 'table') return { doc, at: firstPos(doc) };
  // A merged cell's own row and column, and its last ones (a row goes in after its last, say).
  const [r0, c0] = cellOwner(t, cell);
  const own = t.rows[r0]?.[c0];
  const r = op === 'rowBelow' ? r0 + (own?.rs ?? 1) - 1 : r0;
  const c = op === 'colRight' ? c0 + (own?.cs ?? 1) - 1 : c0;
  const n = t.rows[0]?.length ?? 0;
  const empty = (align?: Align): Cell => (align ? { runs: [], align } : { runs: [] });
  const rects = rectsOf(t);
  let next: TableBlock = t;
  let at: Pos = { b: id, c: [r0, c0], o: 0 };
  switch (op) {
    case 'rowAbove':
    case 'rowBelow': {
      const k = op === 'rowAbove' ? r : r + 1;
      const row = t.rows[r].map((x) => empty(x.align));
      // A merged cell the new row passes through grows over it.
      const moved = rects.map((x) => (x.r >= k ? { ...x, r: x.r + 1 } : x.r < k && x.r + x.rs > k ? { ...x, rs: x.rs + 1 } : x));
      next = { ...t, rows: withRects([...t.rows.slice(0, k), row, ...t.rows.slice(k)], moved) };
      at = { b: id, c: [k, c0], o: 0 };
      break;
    }
    case 'colLeft':
    case 'colRight': {
      const k = op === 'colLeft' ? c : c + 1;
      const moved = rects.map((x) => (x.c >= k ? { ...x, c: x.c + 1 } : x.c < k && x.c + x.cs > k ? { ...x, cs: x.cs + 1 } : x));
      const rows = t.rows.map((row) => [...row.slice(0, k), empty(row[c]?.align), ...row.slice(k)]);
      next = tidy({ ...t, rows: withRects(rows, moved), cols: t.cols ? share([...t.cols.slice(0, k), 1 / (n + 1), ...t.cols.slice(k)]) : undefined });
      at = { b: id, c: [r0, k], o: 0 };
      break;
    }
    case 'delRow': {
      if (t.rows.length <= 1) return removeBlock(doc, id);
      // A merged cell that starts in the row goes on from the next one, its words with it; one passing through shrinks.
      const rows = t.rows.map((x) => x.slice());
      const moved: Rect[] = [];
      for (const x of rects) {
        if (x.r === r && x.rs > 1) {
          rows[r + 1][x.c] = { ...rows[r][x.c], rs: undefined, cs: undefined } as Cell;
          moved.push({ ...x, rs: x.rs - 1 });
        } else if (x.r < r && x.r + x.rs > r) moved.push({ ...x, rs: x.rs - 1 });
        else if (x.r > r) moved.push({ ...x, r: x.r - 1 });
        else if (x.r !== r) moved.push(x);
      }
      next = tidy({ ...t, rows: withRects(rows.filter((_, k) => k !== r), moved), head: r === 0 && t.rows.length === 2 ? undefined : t.head });
      at = { b: id, c: [Math.min(r, next.rows.length - 1), 0], o: 0 };
      break;
    }
    case 'delCol': {
      if (n <= 1) return removeBlock(doc, id);
      const rows = t.rows.map((x) => x.slice());
      const moved: Rect[] = [];
      for (const x of rects) {
        if (x.c === c && x.cs > 1) {
          rows[x.r][c + 1] = { ...rows[x.r][c], rs: undefined, cs: undefined } as Cell;
          moved.push({ ...x, cs: x.cs - 1 });
        } else if (x.c < c && x.c + x.cs > c) moved.push({ ...x, cs: x.cs - 1 });
        else if (x.c > c) moved.push({ ...x, c: x.c - 1 });
        else if (x.c !== c) moved.push(x);
      }
      next = tidy({ ...t, rows: withRects(rows.map((row) => row.filter((_, k) => k !== c)), moved), cols: t.cols ? share(t.cols.filter((_, k) => k !== c)) : undefined });
      at = { b: id, c: [r0, Math.min(c, n - 2)], o: 0 };
      break;
    }
    case 'delTable':
      return removeBlock(doc, id);
    case 'head':
      next = tidy({ ...t, head: t.head ? undefined : true });
      at = { b: id, c: cell, o: 0 };
      break;
  }
  return { doc: withBlock(doc, i, next), at };
}

/** Tab in a table: the next cell (a new row after the last), or with Shift the one before. */
export function nextCell(doc: Doc, at: Pos, back: boolean): Edit {
  const t = blockOf(doc, at.b);
  if (t?.type !== 'table' || !at.c) return { doc, at };
  const n = t.rows[0].length;
  let k = at.c[0] * n + at.c[1];
  // The next cell that is one of its own (cells a merged one covers are passed over).
  for (;;) {
    k += back ? -1 : 1;
    if (k < 0) return { doc, at: { ...at, c: [0, 0], o: 0 } };
    if (k >= t.rows.length * n) {
      const e = tableOp(doc, t.id, [t.rows.length - 1, 0], 'rowBelow');
      const nt = blockOf(e.doc, t.id) as TableBlock;
      return { doc: e.doc, at: { b: t.id, c: [nt.rows.length - 1, 0], o: 0 } };
    }
    const c: [number, number] = [Math.floor(k / n), k % n];
    const o = cellOwner(t, c);
    if (o[0] === c[0] && o[1] === c[1]) return { doc, at: { b: t.id, c, o: lenOf(t.rows[c[0]][c[1]].runs) } };
  }
}

// ---- copying -------------------------------------------------------------------------------------------------------

/** What is between two places, as blocks of its own (fresh ids): to copy, or to drag. */
export function sliceBlocks(doc: Doc, s: Pos, e: Pos): Block[] {
  const si = indexOf(doc, s.b);
  const ei = indexOf(doc, e.b);
  const out: Block[] = [];
  for (let i = si; i <= ei && i >= 0; i++) {
    const B = doc.blocks[i];
    if (isText(B)) {
      const from = i === si ? s.o : 0;
      const to = i === ei ? e.o : lenOf(B.runs);
      out.push({ ...B, id: newId(), runs: sliceRuns(B.runs, from, to) });
    } else if (B.type === 'table') {
      // The rows it covers, whole; within one cell, its words alone.
      if (si === ei && s.c && e.c && sameCell(s.c, e.c)) out.push({ id: newId(), type: 'p', runs: sliceRuns(B.rows[s.c[0]][s.c[1]].runs, s.o, e.o) });
      else {
        const r0 = i === si && s.c ? s.c[0] : 0;
        const r1 = i === ei && e.c ? e.c[0] : B.rows.length - 1;
        out.push(tidy({ ...B, id: newId(), rows: B.rows.slice(r0, r1 + 1), head: B.head && r0 === 0 ? true : undefined }));
      }
    } else out.push({ ...B, id: newId() });
  }
  return out;
}

/** A model as a document, for blocks alone (to draw or write them as one). */
export const asDoc = (doc: Doc, blocks: Block[]): Doc => ({ ...doc, blocks });

/** Plain text of blocks: a line each, items with their marks, a table's cells apart by tabs. */
export function blocksPlain(blocks: Block[]): string {
  const { labels } = listInfo(blocks);
  return blocks
    .map((b, i) => {
      if (b.type === 'li') return `${'    '.repeat(b.lvl ?? 0)}${b.list === 'check' ? (b.checked ? '☑ ' : '☐ ') : `${labels[i]} `}${runsText(b.runs)}`;
      if (isText(b)) return runsText(b.runs);
      if (b.type === 'table') return b.rows.map((r) => r.map((c) => runsText(c.runs).replace(/\n/g, ' ')).join('\t')).join('\n');
      if (b.type === 'image') return b.caption ?? b.alt ?? '';
      return '';
    })
    .join('\n');
}

/** Whether two documents keep the same text (the editor's change, made again, came back to what was saved). */
export const sameDoc = (a: Doc, b: Doc) => a === b || docText(a) === docText(b);

// ---- spacing and callouts ---------------------------------------------------------------------------------------

/** Line spacing, or the space before or after, for the text blocks between two places (undefined: as their style has it). */
export function setSpacing(doc: Doc, s: Pos, e: Pos, patch: Spacing): Doc {
  return mapBlocks(doc, textBlocksIn(doc, s, e), (b) => tidy({ ...b, ...patch } as TextBlock));
}

/** A callout's emoji or tint. */
export function setCallout(doc: Doc, id: string, patch: { icon?: string; tint?: string }): Doc {
  return patchBlock<ParaBlock>(doc, id, (b) => (b.style === 'callout' ? { ...b, ...patch } : b));
}

// ---- comments' marks ---------------------------------------------------------------------------------------------

/** Every set of words in the document (text blocks, then each table's cells), with where they are. */
export function allBoxes(doc: Doc): { b: string; c?: [number, number]; runs: Run[] }[] {
  const out: { b: string; c?: [number, number]; runs: Run[] }[] = [];
  for (const B of doc.blocks) {
    if (isText(B)) out.push({ b: B.id, runs: B.runs });
    else if (B.type === 'table') B.rows.forEach((r, ri) => r.forEach((cell, ci) => out.push({ b: B.id, c: [ri, ci], runs: cell.runs })));
  }
  return out;
}

/** A comment's mark on the words between two places. */
export function markComment(doc: Doc, s: Pos, e: Pos, id: string): Doc {
  return mapLook(doc, s, e, (r) => ({ ...r, cm: [...(r.cm ?? []).filter((x) => x !== id), id] }));
}

/** A comment's marks taken off the document's words (the comment deleted). */
export function unmarkComment(doc: Doc, id: string): Doc {
  let d = doc;
  for (const bx of allBoxes(doc)) {
    if (!bx.runs.some((r) => r.cm?.includes(id))) continue;
    const runs = mergeRuns(
      bx.runs.map((r) => {
        if (!r.cm?.includes(id)) return r;
        const cm = r.cm.filter((x) => x !== id);
        const { cm: _cm, ...rest } = r;
        return cm.length ? { ...rest, cm } : rest;
      }),
    );
    d = setBox(d, bx.b, bx.c, runs);
  }
  return d;
}

/** Where a comment's words are: from the first to the last of them (null when they are gone). */
export function commentSpan(doc: Doc, id: string): [Pos, Pos] | null {
  let first: Pos | null = null;
  let last: Pos | null = null;
  for (const bx of allBoxes(doc)) {
    let o = 0;
    for (const r of bx.runs) {
      if (r.cm?.includes(id)) {
        if (!first) first = { b: bx.b, ...(bx.c ? { c: bx.c } : {}), o };
        last = { b: bx.b, ...(bx.c ? { c: bx.c } : {}), o: o + r.t.length };
      }
      o += r.t.length;
    }
  }
  return first && last ? [first, last] : null;
}

/** Blocks with no comments' or suggestions' marks (pasted copies are not the comments' words, nor the suggestions). */
export function withoutComments(blocks: Block[]): Block[] {
  const clean = (runs: Run[]) => (runs.some((r) => r.cm || r.ins || r.del || r.fmt) ? mergeRuns(runs.map(({ cm: _cm, ins: _i, del: _d, fmt: _f, was: _w, ...r }) => r)) : runs);
  return blocks.map((b) => {
    const { ins: _i, del: _d, ...own } = b;
    return isText(own) ? { ...own, runs: clean(own.runs) } : own.type === 'table' ? { ...own, rows: own.rows.map((r) => r.map((c) => ({ ...c, runs: clean(c.runs) }))) } : own;
  });
}

// ---- finding and replacing ------------------------------------------------------------------------------------------

/** A stretch of words found: in which words (a block, a cell of it), from and to. */
export interface Found {
  b: string;
  c?: [number, number];
  s: number;
  e: number;
}

/** The text of a box to search: an equation counts as marks no query matches (its LaTeX is not words). */
export const searchText = (runs: Run[]) => runs.map((r) => (isAtom(r) || r.del ? '\u0000'.repeat(r.t.length) : r.t)).join('');

/** Words put in place of a stretch of one box's words, looking as its first character does. */
export function replaceIn(doc: Doc, f: Found, text: string): Doc {
  const runs = boxRuns(doc, f.b, f.c);
  if (!runs) return doc;
  const [l, rest] = splitAt(runs, f.s);
  const [mid, r] = splitAt(rest, f.e - f.s);
  const look = mid[0] ? typedLook(mid[0]) : lookAt(runs, f.s);
  delete look.math;
  delete look.fn;
  delete look.cite;
  delete look.xref;
  return setBox(doc, f.b, f.c, mergeRuns([...l, ...(text ? [{ ...look, t: text }] : []), ...r]));
}

// ---- words' case ------------------------------------------------------------------------------------------------------

export type Case = 'upper' | 'lower' | 'title' | 'sentence';

/** The words between two places in another case (a character whose other case is longer stays as it is, so places hold). */
export function setCase(doc: Doc, s: Pos, e: Pos, k: Case): Doc {
  let d = doc;
  for (const bx of boxesIn(doc, s, e)) {
    if (bx.from >= bx.to) continue;
    const runs = boxRuns(d, bx.b, bx.c) ?? [];
    const text = runsText(runs);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (i < bx.from || i >= bx.to) {
        out += ch;
        continue;
      }
      const prev = text.slice(0, i);
      const upper = k === 'upper' || (k === 'title' && !/[\p{L}\p{N}'’]$/u.test(prev)) || (k === 'sentence' && (/^\s*$/.test(prev) || /[.!?]["')\]]*\s+$/.test(prev)));
      const to = upper ? ch.toLocaleUpperCase() : ch.toLocaleLowerCase();
      out += to.length === 1 ? to : ch;
    }
    let o = 0;
    const next = runs.map((r) => {
      const t = isAtom(r) ? r.t : out.slice(o, o + r.t.length);
      o += r.t.length;
      return { ...r, t };
    });
    d = setBox(d, bx.b, bx.c, next);
  }
  return d;
}

// ---- tables: merged cells, fills, widths ---------------------------------------------------------------------------

type Rect = { r: number; c: number; rs: number; cs: number };

/** A table's merged cells, as the rectangles they cover. */
const rectsOf = (t: TableBlock): Rect[] => t.rows.flatMap((row, r) => row.flatMap((cell, c) => (cell.rs || cell.cs ? [{ r, c, rs: cell.rs ?? 1, cs: cell.cs ?? 1 }] : [])));

/** Rows with their merged cells as `rects` say (each rectangle's first cell spans it). */
function withRects(rows: Cell[][], rects: Rect[]): Cell[][] {
  const out = rows.map((row) => row.map((c) => tidy({ ...c, rs: undefined, cs: undefined } as unknown as Block) as unknown as Cell));
  for (const x of rects) {
    if (x.rs <= 1 && x.cs <= 1) continue;
    const cell = out[x.r]?.[x.c];
    if (!cell) continue;
    if (x.rs > 1) cell.rs = x.rs;
    if (x.cs > 1) cell.cs = x.cs;
  }
  fixMerges(out);
  return out;
}

/** Which merged cell a cell is under (its first cell, [row, column]), or itself. */
export function cellOwner(t: TableBlock, at: [number, number]): [number, number] {
  for (const x of rectsOf(t)) if (at[0] >= x.r && at[0] < x.r + x.rs && at[1] >= x.c && at[1] < x.c + x.cs) return [x.r, x.c];
  return at;
}

/** The cells from one to another (a rectangle; merged cells it touches taken in whole). */
export function cellRect(t: TableBlock, a: [number, number], b: [number, number]): Rect {
  let r0 = Math.min(a[0], b[0]);
  let r1 = Math.max(a[0], b[0]);
  let c0 = Math.min(a[1], b[1]);
  let c1 = Math.max(a[1], b[1]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const x of rectsOf(t)) {
      const meets = x.r <= r1 && x.r + x.rs - 1 >= r0 && x.c <= c1 && x.c + x.cs - 1 >= c0;
      if (!meets) continue;
      const nr0 = Math.min(r0, x.r);
      const nr1 = Math.max(r1, x.r + x.rs - 1);
      const nc0 = Math.min(c0, x.c);
      const nc1 = Math.max(c1, x.c + x.cs - 1);
      if (nr0 !== r0 || nr1 !== r1 || nc0 !== c0 || nc1 !== c1) {
        [r0, r1, c0, c1] = [nr0, nr1, nc0, nc1];
        grew = true;
      }
    }
  }
  return { r: r0, c: c0, rs: r1 - r0 + 1, cs: c1 - c0 + 1 };
}

/** The cells between two cells merged into one (their words joined, line by line); the caret goes in it. */
export function mergeCells(doc: Doc, id: string, a: [number, number], b: [number, number]): Edit {
  const i = indexOf(doc, id);
  const t = doc.blocks[i];
  if (t?.type !== 'table') return { doc, at: firstPos(doc) };
  const x = cellRect(t, a, b);
  if (x.rs === 1 && x.cs === 1) return { doc, at: { b: id, c: [x.r, x.c], o: 0 } };
  const rows = t.rows.map((r) => r.map((c) => ({ ...c })));
  const runs: Run[] = [];
  for (let r = x.r; r < x.r + x.rs; r++)
    for (let c = x.c; c < x.c + x.cs; c++) {
      const cell = rows[r][c];
      if (cell.runs.some((y) => y.t.trim())) {
        if (runs.length) runs.push({ t: '\n' });
        runs.push(...cell.runs);
      }
      if (r !== x.r || c !== x.c) rows[r][c] = { runs: [] };
    }
  rows[x.r][x.c] = { ...rows[x.r][x.c], runs: mergeRuns(runs) };
  const rects = rectsOf(t).filter((y) => !(y.r >= x.r && y.r < x.r + x.rs && y.c >= x.c && y.c < x.c + x.cs));
  const next: TableBlock = { ...t, rows: withRects(rows, [...rects, x]) };
  return { doc: withBlock(doc, i, next), at: { b: id, c: [x.r, x.c], o: lenOf(rows[x.r][x.c].runs) } };
}

/** A merged cell split back into the cells it covered (its words stay in the first). */
export function unmergeCell(doc: Doc, id: string, at: [number, number]): Edit {
  const i = indexOf(doc, id);
  const t = doc.blocks[i];
  if (t?.type !== 'table') return { doc, at: firstPos(doc) };
  const own = cellOwner(t, at);
  const rects = rectsOf(t).filter((y) => !(y.r === own[0] && y.c === own[1]));
  return { doc: withBlock(doc, i, { ...t, rows: withRects(t.rows, rects) }), at: { b: id, c: own, o: 0 } };
}

/** A fill, or where words sit up and down, for the cells between two cells (undefined takes it off). */
export function setCells(doc: Doc, id: string, a: [number, number], b: [number, number], patch: { fill?: string; va?: 'middle' | 'bottom' }): Doc {
  const i = indexOf(doc, id);
  const t = doc.blocks[i];
  if (t?.type !== 'table') return doc;
  const x = cellRect(t, a, b);
  const rows = t.rows.map((row, r) =>
    row.map((cell, c) => (r >= x.r && r < x.r + x.rs && c >= x.c && c < x.c + x.cs ? (tidy({ ...cell, ...patch } as unknown as Block) as unknown as Cell) : cell)),
  );
  return withBlock(doc, i, { ...t, rows });
}

/** A table's columns' widths (shares of its width); equal ones say nothing. */
export function setCols(doc: Doc, id: string, cols: number[]): Doc {
  return patchBlock<TableBlock>(doc, id, (t) => {
    const n = t.rows[0]?.length ?? 0;
    const shares = share(cols);
    if (!shares || shares.length !== n) return t;
    return tidy({ ...t, cols: shares.some((w) => Math.abs(w - 1 / n) > 0.004) ? shares : undefined });
  });
}

export type { ImageBlock };

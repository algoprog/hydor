// Suggesting, as Google Docs' Suggesting mode and Word's Track changes have it: each edit made as a suggested change of
// the document rather than the change itself (shared/docs.ts keeps them, doc-changes.ts says what each does). Words
// typed are words to add, marked with a suggestion of yours (the one you are writing goes on while you write beside
// it); words deleted stay, marked to go (Backspace steps over words marked already); words picked and typed over are
// both, as one suggestion; Enter breaks the paragraph as a suggestion, and Backspace at a paragraph's start joins it
// to the one before as one; blocks pasted or put in (a table, a picture, a page break…) are added as suggestions, and a
// block taken out is marked to go; a new look (bold, a colour…) is suggested with the old one kept. Your own suggested
// words change as they are (deleted, they go at once). A paragraph's own look (its style, a list, alignment, spacing)
// changes as when editing. Pure functions of the model, as ops.ts's are.
import { mergeRuns, runsText, type Block, type Doc, type Look, type Run, type Suggestion } from '@shared/docs';
import * as ops from './ops';
import type { Edit, Pos } from './ops';

/** Who is suggesting (you, in the editor). */
export interface Me {
  by: 'user' | 'agent';
  author?: string;
}

const LOOKS = ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'color', 'hl', 'size', 'font', 'link'] as const;

/** A run's look alone: what a suggested new look keeps as the old one. */
export function plainLook(r: Look): Look {
  const out: Look = {};
  for (const k of LOOKS) if (r[k] !== undefined) (out as Record<string, unknown>)[k] = r[k];
  return out;
}

const sameLooks = (a: Look, b: Look) => LOOKS.every((k) => a[k] === b[k]);

/** Which suggestions are yours: by you, and of no other name. */
function mineOf(doc: Doc, me: Me): (id?: string) => boolean {
  const own = new Set((doc.suggestions ?? []).filter((x) => x.by === me.by && (x.author ?? '') === (me.author ?? '')).map((x) => x.id));
  return (id) => !!id && own.has(id);
}

/** A new suggestion of yours: its id, and the document with it. */
function open(doc: Doc, me: Me): { doc: Doc; id: string } {
  const ids = new Set((doc.suggestions ?? []).map((x) => x.id));
  let id = '';
  do id = `s${Math.random().toString(36).slice(2, 10)}`;
  while (ids.has(id));
  const sg: Suggestion = { id, by: me.by, ...(me.author ? { author: me.author } : {}), at: Date.now() };
  return { doc: { ...doc, suggestions: [...(doc.suggestions ?? []), sg] }, id };
}

/** The runs on either side of a place in some words (null at an end). */
function sides(runs: Run[], o: number): [Run | null, Run | null] {
  let at = 0;
  let before: Run | null = null;
  for (const r of runs) {
    const end = at + r.t.length;
    if (end <= o) before = r;
    else if (at >= o) return [before, r];
    else return [r, r];
    at = end;
  }
  return [before, null];
}

/** Your suggestion to go on with at a place, or at either end of a stretch (words of yours added or taken out just beside it), else a new one. */
function near(doc: Doc, at: Pos, me: Me, end?: Pos): { doc: Doc; id: string } {
  const mine = mineOf(doc, me);
  for (const p of end ? [at, end] : [at]) {
    const [a, b] = sides(ops.boxRuns(doc, p.b, p.c) ?? [], p.o);
    for (const r of [a, b]) {
      if (r && mine(r.ins)) return { doc, id: r.ins! };
      if (r && mine(r.del)) return { doc, id: r.del! };
    }
  }
  return open(doc, me);
}

/** A suggestion that marks nothing any more (all of yours deleted again) taken out of the list. */
function tidy(doc: Doc, id: string): Doc {
  const used = (runs: Run[]) => runs.some((r) => r.ins === id || r.del === id || r.fmt === id);
  const marks = doc.blocks.some((b) => b.ins === id || b.del === id || ((b.type === 'p' || b.type === 'li') && used(b.runs)) || (b.type === 'table' && b.rows.some((r) => r.some((c) => used(c.runs)))));
  return marks || !doc.suggestions?.some((x) => x.id === id) ? doc : { ...doc, suggestions: doc.suggestions.filter((x) => x.id !== id) };
}

/**
 * What is between two places marked to go, as a suggestion of yours: words (your own suggested words there go at once,
 * words marked already stay so), the breaks of the paragraphs it runs into, blocks wholly in it. Where it starts and
 * ends after, and the suggestion's id.
 */
export function remove(doc: Doc, s0: Pos, e0: Pos, me: Me, given?: string): { doc: Doc; start: Pos; end: Pos; id: string } {
  const [s, e] = ops.ordered(doc, s0, e0);
  let d = doc;
  let id = given ?? '';
  if (!id) ({ doc: d, id } = near(d, s, me, e));
  const mine = mineOf(d, me);
  let end = e;
  for (const bx of ops.boxesIn(d, s, e)) {
    if (bx.from >= bx.to) continue;
    const runs = ops.boxRuns(d, bx.b, bx.c) ?? [];
    const [l, rest] = ops.splitAt(runs, bx.from);
    const [m, r] = ops.splitAt(rest, bx.to - bx.from);
    let gone = 0;
    const kept: Run[] = [];
    for (const x of m) {
      if (mine(x.ins)) gone += x.t.length;
      else kept.push(x.del ? x : { ...x, del: id });
    }
    d = ops.setBox(d, bx.b, bx.c, mergeRuns([...l, ...kept, ...r]));
    // Words of yours that went before the end, in its words: the end comes back by as much.
    if (bx.b === end.b && ops.sameCell(bx.c, end.c)) end = { ...end, o: end.o - gone };
  }
  // The breaks of the paragraphs it runs into (one of yours goes at once: the paragraph joins the one before), and
  // blocks wholly within it.
  const si = ops.indexOf(d, s.b);
  const ei = ops.indexOf(d, e.b);
  if (ei > si) {
    const out: Block[] = d.blocks.slice(0, si + 1);
    for (let i = si + 1; i <= ei; i++) {
      const b = d.blocks[i];
      if (ops.isText(b)) {
        const prev = out[out.length - 1];
        if (mine(b.ins) && ops.isText(prev)) {
          if (b.id === end.b) end = { b: prev.id, o: ops.lenOf(prev.runs) + end.o };
          out[out.length - 1] = { ...prev, runs: mergeRuns([...prev.runs, ...b.runs]) };
          continue;
        }
        out.push(b.del ? b : { ...withoutMark(b, 'ins'), ...(b.ins ? { ins: b.ins } : {}), del: id });
      } else if (b.type !== 'table' && (i < ei || b.id !== e.b)) {
        if (mine(b.ins)) continue;
        out.push(b.del ? b : { ...b, del: id });
      } else out.push(b);
    }
    d = { ...d, blocks: [...out, ...d.blocks.slice(ei + 1)] };
  }
  return { doc: tidy(d, id), start: s, end, id };
}

/** A block without one of its marks. */
function withoutMark<B extends Block>(b: B, k: 'ins' | 'del'): B {
  const n = { ...b };
  delete n[k];
  return n;
}

/** Words typed at a place, in place of what is picked: words to add (after the words marked to go), as one suggestion of yours. */
export function insert(doc: Doc, s: Pos, e: Pos, text: string, look: Look, me: Me): Edit {
  let d = doc;
  let at = s;
  let id: string;
  if (!ops.samePos(s, e)) {
    const r = remove(d, s, e, me);
    d = r.doc;
    at = r.end;
    id = r.id;
  } else ({ doc: d, id } = near(d, s, me));
  if (!text) return { doc: d, at };
  const { ins: _i, del: _d, fmt: _f, was: _w, cm: _c, math: _m, ...plain } = look;
  return ops.insertRuns(d, at, [{ ...plain, t: text, ins: id }]);
}

/** Runs put in at a place (maths among the words) as words to add. */
export function insertRuns(doc: Doc, at: Pos, runs: Run[], me: Me): Edit {
  const { doc: d, id } = near(doc, at, me);
  return ops.insertRuns(
    d,
    at,
    runs.map((r) => ({ ...r, ins: id })),
  );
}

/** Words marked to go between two places, the end of what is picked when Backspace or Delete is pressed. */
function stepOverDeleted(runs: Run[], o: number, back: boolean): number {
  let p = o;
  for (;;) {
    const [a, b] = sides(runs, p);
    const r = back ? a : b;
    if (!r?.del) return p;
    // To the far end of that run.
    let at = 0;
    for (const x of runs) {
      const end = at + x.t.length;
      if (x === r) return stepOverDeleted(runs, back ? at : end, back);
      at = end;
    }
    return p;
  }
}

/** Backspace at a caret, as a suggestion: the character before marked to go (words marked already stepped over); at a paragraph's start, its break. */
export function backspace(doc: Doc, at: Pos, me: Me): Edit {
  const runs = ops.boxRuns(doc, at.b, at.c) ?? [];
  const o = stepOverDeleted(runs, at.o, true);
  if (o > 0) {
    const q = ops.charStep(runs, o, true);
    const r = remove(doc, { ...at, o: q }, { ...at, o }, me);
    return { doc: r.doc, at: { ...at, o: q } };
  }
  if (at.c) return { doc, at: { ...at, o } };
  const i = ops.indexOf(doc, at.b);
  const B = doc.blocks[i];
  if (!B || !ops.isText(B)) return { doc, at };
  // A list's item, an indent, a quote, code or a callout lose that look, as when editing.
  if (B.type === 'li' || B.lvl || (B.type === 'p' && (B.style === 'quote' || B.style === 'code' || B.style === 'callout'))) return ops.backspace(doc, { ...at, o: 0 });
  const mine = mineOf(doc, me);
  const P = doc.blocks[i - 1];
  if (!P) return { doc, at: { ...at, o: 0 } };
  if (ops.isText(P)) {
    // Your own new paragraph's break goes at once (joined back); another's, or one that was there, is marked to go.
    if (mine(B.ins)) {
      const joined = ops.backspace({ ...doc, blocks: doc.blocks.map((x, k) => (k === i ? withoutMark(B, 'ins') : x)) }, { ...at, o: 0 });
      return { ...joined, doc: tidy(joined.doc, B.ins!) };
    }
    if (B.del) return { doc, at: ops.endOf(doc, P.id) };
    const { doc: d, id } = near(doc, ops.endOf(doc, P.id), me);
    return { doc: { ...d, blocks: d.blocks.map((x, k) => (k === i ? { ...B, del: id } : x)) }, at: ops.endOf(d, P.id) };
  }
  if (P.type === 'table') return { doc, at: ops.endOf(doc, P.id) };
  // A block of its own before it (a picture, a line…): marked to go.
  return removeBlock(doc, P.id, me);
}

/** Delete at a caret, as a suggestion: the character after marked to go; at a paragraph's end, the next one's break. */
export function deleteForward(doc: Doc, at: Pos, me: Me): Edit {
  const runs = ops.boxRuns(doc, at.b, at.c) ?? [];
  const len = ops.lenOf(runs);
  const o = stepOverDeleted(runs, at.o, false);
  if (o < len) {
    const q = ops.charStep(runs, o, false);
    const r = remove(doc, { ...at, o }, { ...at, o: q }, me);
    return { doc: r.doc, at: { ...at, o: r.end.o } };
  }
  if (at.c) return { doc, at };
  const i = ops.indexOf(doc, at.b);
  const N = doc.blocks[i + 1];
  if (!N) return { doc, at };
  if (ops.isText(N)) {
    const mine = mineOf(doc, me);
    if (mine(N.ins)) {
      const joined = ops.deleteForward({ ...doc, blocks: doc.blocks.map((x, k) => (k === i + 1 ? withoutMark(N, 'ins') : x)) }, at);
      return { ...joined, doc: tidy(joined.doc, N.ins!) };
    }
    if (N.del) return { doc, at };
    const { doc: d, id } = near(doc, at, me);
    return { doc: { ...d, blocks: d.blocks.map((x, k) => (k === i + 1 ? { ...N, del: id } : x)) }, at };
  }
  if (N.type === 'table') return { doc, at: { b: N.id, c: [0, 0], o: 0 } };
  return removeBlock(doc, N.id, me);
}

/** A word deleted (Ctrl+Backspace, Ctrl+Delete), as a suggestion. */
export function deleteWord(doc: Doc, at: Pos, back: boolean, me: Me): Edit {
  const runs = ops.boxRuns(doc, at.b, at.c) ?? [];
  const o = stepOverDeleted(runs, at.o, back);
  const q = ops.wordStep(runs, o, back);
  if (q === o) return back ? backspace(doc, { ...at, o }, me) : deleteForward(doc, { ...at, o }, me);
  const r = remove(doc, { ...at, o: Math.min(o, q) }, { ...at, o: Math.max(o, q) }, me);
  return { doc: r.doc, at: back ? r.start : { ...at, o: r.end.o } };
}

/** Enter, as a suggestion: the paragraph broken in two (its new break suggested); in a cell or code, a line break added. */
export function enter(doc: Doc, at: Pos, look: Look, me: Me): Edit {
  const B = ops.blockOf(doc, at.b);
  if (at.c || (B?.type === 'p' && B.style === 'code')) return insert(doc, at, at, '\n', look, me);
  const before = new Set(doc.blocks.map((b) => b.id));
  const e = ops.enter(doc, at);
  const fresh = e.doc.blocks.find((b) => !before.has(b.id));
  // No block made (a list's empty item ended, a quote left): its look changed, as when editing.
  if (!fresh) return e;
  const { doc: d, id } = near(e.doc, at, me);
  return { ...e, doc: { ...d, blocks: d.blocks.map((b) => (b.id === fresh.id ? { ...b, ins: id } : b)) } };
}

/** Blocks put in (pasted, a table, a picture…) in place of what is picked, as a suggestion: their words added, and new blocks and breaks. */
export function insertBlocks(doc: Doc, s: Pos, e: Pos, list: Block[], me: Me): Edit {
  let d = doc;
  let at = s;
  let id: string;
  if (!ops.samePos(s, e)) {
    const r = remove(d, s, e, me);
    d = r.doc;
    at = r.end;
    id = r.id;
  } else ({ doc: d, id } = near(d, s, me));
  const mark = (runs: Run[]) => runs.map((r) => ({ ...r, ins: id }));
  const marked = list.map((b): Block => {
    if (ops.isText(b)) return { ...b, runs: mark(b.runs) };
    if (b.type === 'table') return { ...b, rows: b.rows.map((r) => r.map((c) => ({ ...c, runs: mark(c.runs) }))) };
    return b;
  });
  const before = new Set(d.blocks.map((b) => b.id));
  const r = ops.insertBlocks(d, at, marked);
  // The blocks it made (and the breaks before them) are the suggestion's.
  return { ...r, doc: { ...r.doc, blocks: r.doc.blocks.map((b) => (before.has(b.id) || b.ins ? b : { ...b, ins: id })) } };
}

/** A block of its own taken out, as a suggestion: marked to go (yours, it goes at once); the caret goes to the words after it. */
export function removeBlock(doc: Doc, blockId: string, me: Me): Edit {
  const i = ops.indexOf(doc, blockId);
  const b = doc.blocks[i];
  if (!b) return { doc, at: ops.firstPos(doc) };
  const mine = mineOf(doc, me);
  if (mine(b.ins)) {
    const r = ops.removeBlock(doc, blockId);
    return { ...r, doc: tidy(r.doc, b.ins!) };
  }
  if (b.del) return { doc, at: ops.nearPos(doc, i + 1) };
  const { doc: d, id } = open(doc, me);
  return { doc: { ...d, blocks: d.blocks.map((x) => (x.id === blockId ? { ...x, del: id } : x)) }, at: ops.nearPos(d, i + 1) };
}

/** A new look for the words between two places, as a suggestion (the old one kept); your own added words just take it. */
export function look(doc: Doc, s: Pos, e: Pos, f: (r: Run) => Run, me: Me): Doc {
  const opened = open(doc, me);
  const mine = mineOf(opened.doc, me);
  let used = false;
  const d = ops.mapLook(opened.doc, s, e, (r) => {
    const n = f(r);
    if (r.math || r.del || mine(r.ins)) return n;
    const was = r.fmt ? (r.was ?? {}) : plainLook(r);
    if (sameLooks(plainLook(n), was)) {
      const { fmt: _f, was: _w, ...rest } = n;
      return rest;
    }
    if (sameLooks(plainLook(n), plainLook(r)) && !r.fmt) return n;
    used ||= !(r.fmt && mine(r.fmt));
    return { ...n, fmt: r.fmt && mine(r.fmt) ? r.fmt : opened.id, was };
  });
  return used ? d : tidy(d, opened.id);
}

/** Words found put in place of others, as suggestions: each one's words marked to go and the new ones added after them. */
export function replace(doc: Doc, list: ops.Found[], text: (f: ops.Found) => string, me: Me): Doc {
  // From the last to the first, so the places of the ones before stay where they are.
  const sorted = [...list].sort((x, y) => -ops.cmp(doc, { b: x.b, c: x.c, o: x.s }, { b: y.b, c: y.c, o: y.s }));
  let d = doc;
  for (const f of sorted) {
    const at = { b: f.b, ...(f.c ? { c: f.c } : {}) };
    const runs = ops.boxRuns(d, f.b, f.c) ?? [];
    const look = ops.sliceRuns(runs, f.s, f.s + 1)[0] ?? ops.lookAt(runs, f.s);
    d = insert(d, { ...at, o: f.s }, { ...at, o: f.e }, text(f), look, me).doc;
  }
  return d;
}

/**
 * Words the browser changed by itself in some words (an input method's), made a suggestion: what it took out marked to
 * go again, what it put in added. `before` and `after` are the words' runs; the caret's place after, given back.
 */
export function fromBrowser(doc: Doc, at: { b: string; c?: [number, number] }, before: Run[], after: Run[], me: Me): Edit {
  const a = runsText(before);
  const z = runsText(after);
  let p = 0;
  while (p < a.length && p < z.length && a[p] === z[p]) p++;
  let q = 0;
  while (q < a.length - p && q < z.length - p && a[a.length - 1 - q] === z[z.length - 1 - q]) q++;
  if (p === a.length && p === z.length) return { doc, at: { ...at, o: p } };
  // The words as they were, then the suggestion made there: the old middle to go, the new one added after it.
  const d0 = ops.setBox(doc, at.b, at.c, before);
  const added = ops.sliceRuns(after, p, z.length - q);
  const r = remove(d0, { ...at, o: p }, { ...at, o: a.length - q }, me);
  const look = added[0] ?? {};
  return insert(r.doc, r.end, r.end, added.map((x) => x.t).join(''), look, me);
}

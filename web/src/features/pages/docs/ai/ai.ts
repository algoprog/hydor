// What the document editor's AI works from and how its answers go in (server/write/doc-ai.ts answers): the document
// around the caret as text, its paragraphs (and tables' cells) as numbered items with their things of their own (maths,
// footnotes' marks, citations) as ⟦1⟧ marks, and paragraphs the AI changed put back: as the editor's own suggestions
// by "AI" (each change one, its reason a reply on it), or as edits; words changed word by word, so a paragraph keeps
// the looks of the words that stay.
import { docOutline, isAtom, mdRuns, mergeRuns, normalizeBlocks, mdBlocks, runsText, type Block, type Doc, type Run } from '@shared/docs';
import { api } from '../../../../lib/api';
import * as ops from '../ops';
import * as sg from '../suggest';

/** Who the AI's suggestions are by. */
export const AI_ME: sg.Me = { by: 'agent', author: 'AI' };

export interface Priced {
  model?: string;
  /** US dollars, when the helper model is one paid by the word. */
  cost?: number;
}

/** What an answer cost, in words ("" when it is not known or nothing). */
export const costWords = (p: Priced) => (p.cost && p.cost > 0 ? ` · $${p.cost < 0.01 ? p.cost.toFixed(4) : p.cost.toFixed(2)}` : '');

// ---- the document as text ------------------------------------------------------------------------------------------

/** A block as the AI reads it: a heading with its #s, an item with its mark, a table a row a line, a picture its caption. */
function blockLine(b: Block): string {
  const atoms = (runs: Run[]) => runs.map((r) => (r.del ? '' : r.math ? `$${r.t}$` : isAtom(r) ? '' : r.t)).join('');
  if (b.type === 'p') {
    const h = b.style === 'title' ? '# ' : b.style && /^h\d$/.test(b.style) ? `${'#'.repeat(Number(b.style[1]) + 1)} ` : b.style === 'quote' ? '> ' : '';
    return `${h}${atoms(b.runs)}`;
  }
  if (b.type === 'li') return `${'  '.repeat(b.lvl ?? 0)}${b.list === 'number' ? '1.' : '-'} ${atoms(b.runs)}`;
  if (b.type === 'table') return b.rows.map((r) => `| ${r.map((c) => atoms(c.runs).replace(/\n/g, ' ')).join(' | ')} |`).join('\n');
  if (b.type === 'image') return b.caption ? `[Picture: ${b.caption}]` : '';
  if (b.type === 'math') return `$$${b.tex}$$`;
  return '';
}

export const plainOf = (blocks: Block[]) =>
  blocks
    .map(blockLine)
    .filter((l) => l.trim())
    .join('\n\n');

/** The document around the caret, for Write with AI: what is before it (the caret's paragraph up to it), after it, its title and outline. */
export function contextAt(doc: Doc, at: ops.Pos, title: string) {
  const i = ops.indexOf(doc, at.b);
  const b = doc.blocks[i];
  const runs = ops.boxRuns(doc, at.b, at.c) ?? [];
  const [l, r] = ops.splitAt(runs, at.o);
  const head = b && ops.isText(b) ? [{ ...b, runs: l } as Block] : [];
  const tail = b && ops.isText(b) ? [{ ...b, runs: r } as Block] : [];
  return {
    before: plainOf([...doc.blocks.slice(0, Math.max(0, i)), ...head]),
    after: plainOf([...tail, ...doc.blocks.slice(i + 1)]).slice(0, 3000),
    title,
    outline: docOutline(doc),
  };
}

// ---- paragraphs as items -------------------------------------------------------------------------------------------

/** A paragraph (or a table's cell) as the AI gets it: its words, things of their own as ⟦n⟧, and where those are in its runs. */
export interface Item {
  id: string;
  b: string;
  c?: [number, number];
  text: string;
  /** Each piece of `text`: where it starts in it, in the runs, and how long it is there and here. */
  map: { at: number; o: number; len: number; runLen: number }[];
}

/** A box's words as an item (null: none, or suggested changes waiting in it, which are left as they are). */
function itemOf(id: string, b: string, c: [number, number] | undefined, runs: Run[]): Item | null {
  if (!runs.some((r) => !isAtom(r) && r.t.trim()) || runs.some((r) => r.ins || r.del || r.fmt)) return null;
  let text = '';
  let o = 0;
  let n = 0;
  const map: Item['map'] = [];
  for (const r of runs) {
    const t = isAtom(r) ? `⟦${++n}⟧` : r.t;
    map.push({ at: text.length, o, len: t.length, runLen: r.t.length });
    text += t;
    o += r.t.length;
  }
  return { id, b, ...(c ? { c } : {}), text, map };
}

/** The document's paragraphs, items and tables' cells as items, in order (code and empty ones left out); how many had suggestions waiting. */
export function itemsOf(doc: Doc, only?: Set<string>): { items: Item[]; waiting: number } {
  const items: Item[] = [];
  let waiting = 0;
  for (const b of doc.blocks) {
    if (only && !only.has(b.id)) continue;
    if ((b.type === 'p' && b.style !== 'code') || b.type === 'li') {
      const it = itemOf(b.id, b.id, undefined, b.runs);
      if (it) items.push(it);
      else if (b.runs.some((r) => r.ins || r.del || r.fmt)) waiting++;
    } else if (b.type === 'table')
      b.rows.forEach((row, ri) =>
        row.forEach((cell, ci) => {
          const it = itemOf(`${b.id}:${ri},${ci}`, b.id, [ri, ci], cell.runs);
          if (it) items.push(it);
        }),
      );
  }
  return { items, waiting };
}

/** Items in parts of about `max` characters (as many paragraphs a part as fit), for one call each. */
export function partsOf(items: Item[], max = 3500): Item[][] {
  const out: Item[][] = [];
  let cur: Item[] = [];
  let n = 0;
  for (const it of items) {
    if (cur.length && (n + it.text.length > max || cur.length >= 40)) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(it);
    n += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

// ---- words changed, word by word ------------------------------------------------------------------------------------

const tokens = (s: string) => s.match(/⟦\d+⟧|[\p{L}\p{N}’']+|\s+|[^\p{L}\p{N}\s]/gu) ?? [];

/** Where two texts differ: each stretch of the first that changes, and what takes its place (by words, the rest kept). */
export function hunks(a: string, b: string): { s: number; e: number; text: string }[] {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length * y.length > 2_500_000) return a === b ? [] : [{ s: 0, e: a.length, text: b }];
  // The longest run of words both keep, by dynamic programming from the end.
  const n = x.length;
  const m = y.length;
  const L = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * (m + 1) + j] = x[i] === y[j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
  const out: { s: number; e: number; text: string }[] = [];
  let i = 0;
  let j = 0;
  let ai = 0;
  let cur: { s: number; e: number; text: string } | null = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) {
      flush();
      ai += x[i].length;
      i++;
      j++;
    } else if (j < m && (i >= n || L[i * (m + 1) + j + 1] >= L[(i + 1) * (m + 1) + j])) {
      cur ??= { s: ai, e: ai, text: '' };
      cur.text += y[j++];
    } else {
      cur ??= { s: ai, e: ai, text: '' };
      ai += x[i++].length;
      cur.e = ai;
    }
  }
  flush();
  // A space between two changes changes with them (one change, not two).
  const joined: typeof out = [];
  for (const h of out) {
    const last = joined[joined.length - 1];
    if (last && /^\s*$/.test(a.slice(last.e, h.s)) && h.s - last.e <= 2) {
      last.text += a.slice(last.e, h.s) + h.text;
      last.e = h.e;
    } else joined.push({ ...h });
  }
  return joined;
}

/** A place in an item's text as a place in its runs (inside a ⟦n⟧ mark: its start). */
function runOffset(it: Item, at: number): number {
  for (const p of it.map) {
    if (at < p.at + p.len) return p.o + (p.len === p.runLen ? at - p.at : 0);
  }
  const last = it.map[it.map.length - 1];
  return last ? last.o + last.runLen : 0;
}

/** A changed paragraph, from the AI: its id, its new words, and why (shown as a reply on its suggestions). */
export interface Fix {
  id: string;
  text: string;
  why?: string;
}

/**
 * Changed paragraphs put into the document: as suggestions by the AI (`suggest`; each change one, its reason a reply
 * on it), or made. Changes that would touch a ⟦n⟧ mark are left out. How many changes went in.
 */
export function applyFixes(doc: Doc, items: Item[], fixes: Fix[], suggest: boolean): { doc: Doc; changes: number } {
  const byId = new Map(items.map((x) => [x.id, x]));
  let d = doc;
  let changes = 0;
  for (const f of fixes) {
    const it = byId.get(f.id);
    if (!it) continue;
    // Still the words the AI was given (the person may have typed meanwhile).
    const now = ops.boxRuns(d, it.b, it.c);
    if (!now || itemOf(it.id, it.b, it.c, now)?.text !== it.text) continue;
    const list = hunks(it.text, f.text).filter((h) => !/⟦\d+⟧/.test(it.text.slice(h.s, h.e)) && !/⟦\d+⟧/.test(h.text));
    if (!list.length) continue;
    const found: (ops.Found & { text: string })[] = list.map((h) => ({ b: it.b, ...(it.c ? { c: it.c } : {}), s: runOffset(it, h.s), e: runOffset(it, h.e), text: h.text }));
    const before = new Set((d.suggestions ?? []).map((x) => x.id));
    if (suggest) d = sg.replace(d, found, (x) => (x as ops.Found & { text: string }).text, AI_ME);
    else for (const x of [...found].sort((p, q) => q.s - p.s)) d = ops.replaceIn(d, x, x.text);
    changes += found.length;
    // Why, as a reply on each suggestion made for this paragraph.
    if (suggest && f.why) {
      const made = (d.suggestions ?? []).filter((x) => !before.has(x.id));
      if (made.length) d = { ...d, suggestions: d.suggestions!.map((x) => (made.includes(x) ? { ...x, replies: [{ id: `${x.id}w`, by: 'agent' as const, author: 'AI', text: f.why!, at: Date.now() }] } : x)) };
    }
  }
  return { doc: d, changes };
}

/** A copy of the document with its paragraphs' words in place of the old (a translation): each one's looks kept where it had one look throughout. */
export function withWords(doc: Doc, items: Item[], fixes: Fix[]): Doc {
  const byId = new Map(fixes.map((f) => [f.id, f.text]));
  let d = doc;
  for (const it of items) {
    const text = byId.get(it.id);
    const runs = ops.boxRuns(d, it.b, it.c);
    if (text === undefined || !runs) continue;
    const atoms = runs.filter(isAtom);
    const words = runs.filter((r) => !isAtom(r) && r.t.trim());
    const look = words.length && words.every((r) => JSON.stringify({ ...r, t: '' }) === JSON.stringify({ ...words[0], t: '' })) ? { ...words[0] } : null;
    const next: Run[] = [];
    for (const piece of text.split(/(⟦\d+⟧)/)) {
      const m = /^⟦(\d+)⟧$/.exec(piece);
      if (m) {
        const a = atoms[Number(m[1]) - 1];
        if (a) next.push(a);
      } else if (piece) next.push(look ? { ...look, t: piece } : { t: piece });
    }
    d = ops.setBox(d, it.b, it.c, mergeRuns(next));
  }
  return d;
}

// ---- Markdown from the AI, as blocks --------------------------------------------------------------------------------

/** Blocks from the AI's Markdown, with ids the document does not have. */
export function aiBlocks(doc: Doc, markdown: string): Block[] {
  return normalizeBlocks(mdBlocks(markdown), {}, new Set(doc.blocks.map((b) => b.id)));
}

/** Words from the AI's Markdown, as runs of one paragraph (its first). */
export const aiRuns = (markdown: string): Run[] => mdRuns(markdown.split(/\n\s*\n/)[0] ?? '');

export { runsText };

// ---- the routes -------------------------------------------------------------------------------------------------------

export type ComposeKind = 'write' | 'continue' | 'summary' | 'conclusion' | 'list' | 'table' | 'explain' | 'summarize' | 'tablify';

const send = <T,>(path: string, body: unknown, signal?: AbortSignal) => api<T>(path, { method: 'POST', body, signal });

export const compose = (body: { kind: ComposeKind; ask?: string; before?: string; after?: string; title?: string; outline?: string; words?: string }, signal?: AbortSignal) =>
  send<{ markdown: string } & Priced>('/api/write/compose', body, signal);

export const proofread = (items: Item[], signal?: AbortSignal) => send<{ items: Fix[] } & Priced>('/api/write/proofread', { items: items.map((x) => ({ id: x.id, text: x.text })) }, signal);

export const rewriteAll = (body: { how: 'tone' | 'translate'; tone?: string; lang?: string; items: Item[] }, signal?: AbortSignal) =>
  send<{ items: Fix[] } & Priced>('/api/write/paragraphs', { ...body, items: body.items.map((x) => ({ id: x.id, text: x.text })) }, signal);

export const complete = (before: string, after: string, signal?: AbortSignal) => send<{ text: string } & Priced>('/api/write/complete', { before, after }, signal);

export const askDoc = (body: { question: string; title?: string; paragraphs: { id: string; text: string }[]; history?: { q: string; a: string }[] }, signal?: AbortSignal) =>
  send<{ answer: string; cites: string[]; short?: boolean } & Priced>('/api/write/ask-doc', body, signal);

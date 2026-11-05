// Changes in a document (shared/docs.ts), as Google Docs and Word show them: what each suggested change does, said in a
// few words for the list beside the page and for agents (the words it adds and takes out, the look it changes, the
// paragraphs it breaks or joins, the blocks it adds or takes out), the colour of who suggested it, and two documents
// compared as one with what changed from the first to the second marked as suggestions: words taken out (struck),
// words added, looks changed, paragraphs and blocks added or taken out, each change one suggestion of its own. An
// agent's save with `suggest` makes its changes so; comparing an older version with the latest shows them so.
import { mergeRuns, newId, type Block, type Cell, type Doc, type Look, type Run, type Suggestion, type TableBlock } from './docs.ts';

/** What a suggested change does, for the list beside the page and for agents. */
export interface Change {
  id: string;
  /** The words it adds, and those it takes out (each cut at 300 characters). */
  added: string;
  removed: string;
  /** What of the words' look it changes: bold, italic, colour… (Look's keys). */
  looks: string[];
  /** Paragraphs it breaks in two (added) or joins to the one before (removed). */
  breaks: { added: number; removed: number };
  /** Whole paragraphs it adds or takes out (their words and their breaks). */
  paras: { added: number; removed: number };
  /** Blocks of their own it adds or takes out (their kinds: table, image, hr, pagebreak, toc, math). */
  blocks: { added: string[]; removed: string[] };
  /** Where its first mark is: the block (and the table's cell). */
  block: string;
  cell?: [number, number];
}

const LOOKS = ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'color', 'hl', 'size', 'font', 'link'] as const;
const cut = (s: string) => (s.length > 300 ? `${s.slice(0, 299)}…` : s);

/** Every suggestion's change, in the order its first mark comes in the document. */
export function changesOf(d: Doc): Change[] {
  const by = new Map<string, Change>();
  const get = (id: string, block: string, cell?: [number, number]) => {
    let c = by.get(id);
    if (!c) {
      c = { id, added: '', removed: '', looks: [], breaks: { added: 0, removed: 0 }, paras: { added: 0, removed: 0 }, blocks: { added: [], removed: [] }, block, ...(cell ? { cell } : {}) };
      by.set(id, c);
    }
    return c;
  };
  const runs = (list: Run[], block: string, cell?: [number, number]) => {
    for (const r of list) {
      const t = r.math ? `$${r.t}$` : r.t;
      if (r.ins) get(r.ins, block, cell).added += t;
      if (r.del) get(r.del, block, cell).removed += t;
      if (r.fmt) {
        const c = get(r.fmt, block, cell);
        for (const k of LOOKS) if ((r.was ?? {})[k] !== r[k] && !c.looks.includes(k)) c.looks.push(k);
      }
    }
  };
  for (const b of d.blocks) {
    const text = b.type === 'p' || b.type === 'li';
    // A paragraph all of whose words go with its break is a paragraph added (taken out), not one broken (joined).
    const whole = (id: string, k: 'ins' | 'del') => text && (b as { runs: Run[] }).runs.every((r) => r[k] === id);
    if (b.ins) {
      const c = get(b.ins, b.id);
      if (whole(b.ins, 'ins')) c.paras.added++;
      else if (text) c.breaks.added++;
      else c.blocks.added.push(b.type);
    }
    if (b.del) {
      const c = get(b.del, b.id);
      if (whole(b.del, 'del')) c.paras.removed++;
      else if (text) c.breaks.removed++;
      else c.blocks.removed.push(b.type);
    }
    if (text) runs(b.runs, b.id);
    else if (b.type === 'table') b.rows.forEach((row, ri) => row.forEach((c, ci) => runs(c.runs, b.id, [ri, ci])));
  }
  for (const c of by.values()) {
    c.added = cut(c.added);
    c.removed = cut(c.removed);
  }
  return [...by.values()];
}

/** The colour of who suggested a change (dark enough to read on white paper): yours green, an agent's purple, others' each their own. */
export function suggestionColor(s: Pick<Suggestion, 'by' | 'author'> | undefined): string {
  if (!s) return '#1a73e8';
  if (s.author) {
    let h = 0;
    for (const ch of s.author) h = (h * 31 + ch.codePointAt(0)!) % 360;
    return `hsl(${h} 62% 36%)`;
  }
  return s.by === 'agent' ? '#8430ce' : '#188038';
}

// ---- comparing two documents ---------------------------------------------------------------------------------------

type Piece = { run: Run; tok: number };

/** Words as tokens (a word, a run of spaces, a mark, an equation), each with the pieces of runs that make it. */
function tokens(runs: Run[]): { keys: string[]; pieces: Piece[] } {
  const keys: string[] = [];
  const pieces: Piece[] = [];
  // The words' text (an equation as one mark of its own), where each run starts in it, and each character's run.
  let text = '';
  const starts: number[] = [];
  const owner: number[] = [];
  runs.forEach((r, i) => {
    starts.push(text.length);
    const t = r.math ? '\u0001' : r.t;
    text += t;
    for (let k = 0; k < t.length; k++) owner.push(i);
  });
  for (const m of text.matchAll(/\s+|[\p{L}\p{N}_'’-]+|./gu)) {
    const start = m.index!;
    const end = start + m[0].length;
    const tok = keys.length;
    const first = runs[owner[start]];
    keys.push(first.math ? `\u0000${first.t}` : m[0]);
    // The token's characters, a piece for each run they are in.
    for (let k = start; k < end; ) {
      const ri = owner[k];
      let e = k;
      while (e < end && owner[e] === ri) e++;
      const r = runs[ri];
      pieces.push({ run: r.math ? r : { ...r, t: r.t.slice(k - starts[ri], e - starts[ri]) }, tok });
      k = e;
    }
  }
  return { keys, pieces };
}

/** Pairs of the same keys where each key is one of its own (blocks' ids): the longest run of them in the same order. */
function alignUnique(a: string[], b: string[]): [number, number][] {
  const at = new Map(b.map((k, j) => [k, j]));
  const seq = a.flatMap((k, i) => (at.has(k) ? [[i, at.get(k)!] as [number, number]] : []));
  // The longest increasing run of the second's places, as patience sorting finds it.
  const tails: number[] = [];
  const prev: number[] = new Array(seq.length).fill(-1);
  for (let k = 0; k < seq.length; k++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]][1] < seq[k][1]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[k] = tails[lo - 1];
    tails[lo] = k;
  }
  const out: [number, number][] = [];
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) out.push(seq[k]);
  return out.reverse();
}

/** The longest common subsequence of two lists of keys, as pairs of their indexes (a list too long to compare is none). */
function lcs(a: string[], b: string[], limit = 4_000_000): [number, number][] {
  const n = a.length;
  const m = b.length;
  if (!n || !m || n * m > limit) return [];
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
  const out: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++;
    else j++;
  }
  return out;
}

/** Pairs of equal keys, the same at both ends trimmed first (the usual case: a few words changed in a long text). */
function align(a: string[], b: string[]): [number, number][] {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const mid = lcs(a.slice(p, a.length - s), b.slice(p, b.length - s)).map(([i, j]) => [i + p, j + p] as [number, number]);
  return [...Array.from({ length: p }, (_, k) => [k, k] as [number, number]), ...mid, ...Array.from({ length: s }, (_, k) => [a.length - s + k, b.length - s + k] as [number, number])];
}

/** What a run's look is (its words, comments and marks aside), to tell a change of look. */
const lookKey = (r: Run) => JSON.stringify(LOOKS.map((k) => r[k] ?? null));
const plainLook = (r: Run): Look => {
  const out: Look = {};
  for (const k of LOOKS) if (r[k] !== undefined) (out as Record<string, unknown>)[k] = r[k];
  return out;
};

/** A run as it is in the first document, without the marks of the second's changes (its comments are the first's). */
const bare = (r: Run): Run => {
  const { cm: _c, ins: _i, del: _d, fmt: _f, was: _w, ...rest } = r;
  return rest;
};

export interface Who {
  by: 'user' | 'agent';
  author?: string;
  at: number;
}

class Ids {
  list: Suggestion[] = [];
  constructor(
    private who: Who,
    private prefix: string,
  ) {}
  next(): string {
    const id = `${this.prefix}${this.list.length + 1}`;
    this.list.push({ id, by: this.who.by, ...(this.who.author ? { author: this.who.author } : {}), at: this.who.at });
    return id;
  }
}

/** Two runs' words compared: the second's, with the first's words taken out marked `del`, its own added `ins`, a look changed `fmt`. */
function diffRuns(a: Run[], b: Run[], ids: Ids): Run[] {
  const ta = tokens(a);
  const tb = tokens(b);
  const pairs = align(ta.keys, tb.keys);
  const byTokA = new Map<number, Run[]>();
  for (const p of ta.pieces) byTokA.set(p.tok, [...(byTokA.get(p.tok) ?? []), p.run]);
  const byTokB = new Map<number, Run[]>();
  for (const p of tb.pieces) byTokB.set(p.tok, [...(byTokB.get(p.tok) ?? []), p.run]);
  const out: Run[] = [];
  let i = 0;
  let j = 0;
  // One suggestion for each stretch of changes between two words that stay.
  let id = '';
  let fmtId = '';
  const flush = () => {
    id = '';
  };
  const change = () => (id ||= ids.next());
  for (const [pi, pj] of [...pairs, [ta.keys.length, tb.keys.length] as [number, number]]) {
    for (; i < pi; i++) for (const r of byTokA.get(i) ?? []) out.push({ ...bare(r), del: change() });
    for (; j < pj; j++) for (const r of byTokB.get(j) ?? []) out.push({ ...r, ins: change() });
    if (pi >= ta.keys.length) break;
    flush();
    // The same word: the second's, its look's change marked when it has one.
    const ra = byTokA.get(pi) ?? [];
    const rb = byTokB.get(pj) ?? [];
    const changedLook = ra.map(lookKey).join('|') !== rb.map(lookKey).join('|');
    if (changedLook && !rb[0]?.math) {
      fmtId ||= ids.next();
      for (const r of rb) out.push({ ...r, fmt: fmtId, was: plainLook(ra[0] ?? r) });
    } else {
      fmtId = '';
      out.push(...rb);
    }
    i = pi + 1;
    j = pj + 1;
  }
  return mergeRuns(out);
}

/** Text of a block, to tell two blocks are the same one rewritten. */
const blockKey = (b: Block): string => {
  const { id: _id, ...rest } = b;
  return JSON.stringify(rest);
};

const isText = (b: Block) => b.type === 'p' || b.type === 'li';

/** Whether two paragraphs are one rewritten (half their words or more the same), rather than one taken out and another put in. */
function alike(a: Block, b: Block): boolean {
  const words = (x: Block) => tokens((x as { runs: Run[] }).runs).keys.filter((k) => /[\p{L}\p{N}]/u.test(k));
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return !wa.length && !wb.length;
  return align(wa, wb).length / Math.max(wa.length, wb.length) >= 0.5;
}

/**
 * Two documents compared as one: the second, with what changed from the first marked as suggestions by `who`: words
 * and blocks taken out (kept, marked to go), words and blocks added, looks changed, paragraphs broken or joined, each
 * change a suggestion of its own (ids from `prefix`). Blocks are matched by their ids (kept between versions), else by
 * what they hold.
 */
export function compareDocs(a: Doc, b: Doc, who: Who, prefix = 'v'): Doc {
  const ids = new Ids(who, prefix);
  const byId = new Set(a.blocks.map((x) => x.id));
  const shared = b.blocks.filter((x) => byId.has(x.id)).length;
  // Ids say which blocks are the same, unless the versions share few (a file opened again): then what they hold does.
  const useIds = shared >= Math.min(a.blocks.length, b.blocks.length) * 0.3;
  const pairs = useIds ? alignUnique(a.blocks.map((x) => x.id), b.blocks.map((x) => x.id)) : align(a.blocks.map(blockKey), b.blocks.map(blockKey));
  const out: Block[] = [];
  let i = 0;
  let j = 0;
  const removed = (x: Block) => {
    const id = ids.next();
    if (isText(x)) out.push({ ...x, id: newId(), del: id, runs: (x as { runs: Run[] }).runs.map((r) => ({ ...bare(r), del: id })) } as Block);
    else if (x.type === 'table') out.push({ ...x, id: newId(), del: id, rows: x.rows.map((r) => r.map((c) => ({ ...c, runs: c.runs.map(bare) }))) });
    else out.push({ ...x, id: newId(), del: id });
  };
  const added = (x: Block) => {
    const id = ids.next();
    if (isText(x)) out.push({ ...x, ins: id, runs: (x as { runs: Run[] }).runs.map((r) => ({ ...r, ins: id })) } as Block);
    else out.push({ ...x, ins: id });
  };
  const same = (x: Block, y: Block) => {
    if (isText(x) && isText(y)) return out.push({ ...y, runs: diffRuns((x as { runs: Run[] }).runs, (y as { runs: Run[] }).runs, ids) } as Block);
    if (x.type === 'table' && y.type === 'table' && x.rows.length === y.rows.length && x.rows[0]?.length === y.rows[0]?.length) {
      const t: TableBlock = { ...(y as TableBlock), rows: y.rows.map((r, ri) => r.map((c, ci): Cell => ({ ...c, runs: diffRuns(x.rows[ri][ci].runs, c.runs, ids) }))) };
      return out.push(t);
    }
    if (blockKey(x) === blockKey(y)) return out.push(y);
    // Changed past comparing (a picture for another, a table of another shape): the old one out, the new one in.
    removed(x);
    added(y);
  };
  for (const [pi, pj] of [...pairs, [a.blocks.length, b.blocks.length] as [number, number]]) {
    // Between two that match: those of the same kind one for one (rewritten), the rest taken out or added.
    const olds = a.blocks.slice(i, pi);
    const news = b.blocks.slice(j, pj);
    let k = 0;
    while (k < olds.length && k < news.length && (isText(olds[k]) ? isText(news[k]) && alike(olds[k], news[k]) : olds[k].type === news[k].type)) {
      same(olds[k], news[k]);
      k++;
    }
    for (const x of olds.slice(k)) removed(x);
    for (const y of news.slice(k)) added(y);
    if (pi >= a.blocks.length) break;
    same(a.blocks[pi], b.blocks[pj]);
    i = pi + 1;
    j = pj + 1;
  }
  // Only the suggestions something is marked with stay.
  const used = new Set<string>();
  const note = (runs: Run[]) => runs.forEach((r) => [r.ins, r.del, r.fmt].forEach((x) => x && used.add(x)));
  for (const x of out) {
    if (x.ins) used.add(x.ins);
    if (x.del) used.add(x.del);
    if (isText(x)) note((x as { runs: Run[] }).runs);
    else if (x.type === 'table') x.rows.forEach((r) => r.forEach((c) => note(c.runs)));
  }
  const suggestions = [...(b.suggestions ?? []), ...ids.list.filter((s) => used.has(s.id))];
  return { ...b, blocks: out, ...(suggestions.length ? { suggestions } : {}) };
}

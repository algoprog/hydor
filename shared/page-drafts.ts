// What a document, a deck, a spreadsheet or a LaTeX document looks like while an agent's call to save it is still
// being written (save_doc, save_slides, save_sheet, save_latex: their input streams in a piece at a time). Each
// kind's builder (draft-doc.ts, draft-deck.ts, draft-book.ts, draft-tex.ts) takes the version open now and the call
// as far as it has come (partial-json.ts reads it) and gives the version being written: what the agent has written
// so far, then the old rest from where the two meet, so only what changes moves; and where the words are arriving
// (the agent's mark). Nothing is saved from it: the saved version takes its place when the call is done.
import type { JsonPath } from './partial-json.ts';

/** The kinds a call can be watched for, by the tool that saves them. */
export const DRAFT_TOOLS = { save_doc: 'doc', save_slides: 'slides', save_sheet: 'sheet', save_latex: 'tex', save_diagram: 'diagram' } as const;
export type DraftTool = keyof typeof DRAFT_TOOLS;
export type DraftKind = (typeof DRAFT_TOOLS)[DraftTool];

/** Where the agent's words are arriving. */
export type DraftMark =
  /** In a document: a block, and how far into its words (-1: the block as a whole, a table or a picture). */
  | { kind: 'doc'; block: string; at: number }
  /** In a deck: a slide (from 0), and the part being written on it. */
  | { kind: 'slides'; slide: number; el?: string }
  /** In a spreadsheet: a sheet (its id) and a cell (A1). */
  | { kind: 'sheet'; sheet: string; cell: string }
  /** In a LaTeX document: a file and a place in its text. */
  | { kind: 'tex'; file: string; at: number }
  /** In a diagram: a page (from 0), and the item being written on it. */
  | { kind: 'diagram'; page: number; item?: string };

export interface Drafted<M> {
  model: M;
  mark: DraftMark | null;
}

/**
 * What was made on the last draw, by what it holds: the same thing on the next draw is the same object again, so an
 * editor sees at once what did not change (it compares objects) and draws only the rest.
 */
export class DraftMemo {
  private prev = new Map<string, object[]>();
  private next = new Map<string, object[]>();
  /** `x`, or the object made last time for the same key. */
  same<T extends object>(x: T, key = JSON.stringify(x)): T {
    const list = this.prev.get(key);
    const got = (list?.shift() as T | undefined) ?? x;
    const now = this.next.get(key);
    if (now) now.push(got);
    else this.next.set(key, [got]);
    return got;
  }
  /** What was made last time for `key`, else what `make` makes now (made only when it is not there). */
  make<T>(key: string, make: () => T): T {
    const list = this.prev.get(key);
    const got = list?.length ? (list.shift() as { v: T }) : { v: make() };
    const now = this.next.get(key);
    if (now) now.push(got);
    else this.next.set(key, [got]);
    return got.v;
  }
  /** This draw is done: what it made is what the next one may reuse. */
  turn() {
    this.prev = this.next;
    this.next = new Map();
  }
}

/** Whether a call's text stopped inside a field (a field name, or a path into it). */
export const writingIn = (open: JsonPath | null, field: string | number): boolean => !!open && open.length > 0 && open[0] === field;

/**
 * The new items written so far (`now`: their keys, `strong`: whether each has enough in it to be matched far from where
 * it was) matched in order with the old ones (`was`): each takes the first old one like it after the last one taken.
 * Nearby is taken at once; far ahead (content moved or taken out) only when the next strong one written matches right
 * after it too, so one item that happens to read like another further on does not hide what is between. -1: unmatched.
 */
export function inOrder(was: string[], now: string[], strong: boolean[]): number[] {
  const at = new Map<string, number[]>();
  was.forEach((k, i) => at.set(k, [...(at.get(k) ?? []), i]));
  const match: number[] = new Array(now.length).fill(-1);
  let last = -1;
  let lastJ = -1;
  for (let j = 0; j < now.length; j++) {
    const list = at.get(now[j]);
    if (!list) continue;
    const expect = last + (j - lastJ);
    for (const i of list) {
      if (i <= last) continue;
      if (!strong[j] && i - last > 3) break;
      let ok = Math.abs(i - expect) <= 2;
      if (!ok) {
        // Confirmed by the next strong item written, found right after it.
        const n = now.findIndex((k, x) => x > j && strong[x]);
        ok = n >= 0 && was.slice(i + 1, i + 1 + (n - j) + 3).includes(now[n]);
      }
      if (ok) {
        match[j] = i;
        last = i;
        lastJ = j;
      }
      break;
    }
  }
  return match;
}

/** Words that share at least half of the shorter one's words (a paragraph changed, rather than another one). */
export function alike(a: string, b: string): boolean {
  const wa = a.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const wb = b.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!wa.length || !wb.length) return !wa.length && !wb.length;
  // A paragraph still being written: its words so far against as many of the other's.
  const short = wa.length <= wb.length ? wa : wb;
  const long = new Set((wa.length <= wb.length ? wb : wa).slice(0, Math.ceil(short.length * 1.5) + 2));
  let n = 0;
  for (const w of short) if (long.has(w)) n++;
  return n * 2 >= short.length;
}

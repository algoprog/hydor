// Changes to some slides of a saved deck, made without sending all of it (save_slides' change, add and remove): slides
// written again in place (by their number, from 1 as get_page numbers them, or their id; each keeps its id, so its
// comments stay with it), new slides put after one (or at the end), and slides taken out. They make the deck's whole
// list of slides, which the server then saves as it saves a whole deck sent back; a draft makes them as the call
// comes in (page-drafts.ts), the slide being written shown as far as it has come.
import type { Deck } from './slides.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether a call changes some slides rather than sending all of them. */
export const changesSlides = (v: Obj) => Array.isArray(v.change) || Array.isArray(v.add) || Array.isArray(v.remove);

export interface DeckEditsOut {
  /** The deck's slides as they then are: the version's own (as kept) and those the call gives (as written). */
  slides: unknown[];
  /** Where each slide the call gives went, by the call's place in its own lists ("change:0", "add:2"). */
  at: Map<string, number>;
}

/**
 * The slides of `base` with a call's change, add and remove made: removes and changes name slides as `base` numbers
 * them (from 1) or by id; adds go after the slide named (0: first; none: at the end), in order. Without `draft`, a
 * slide named that is not there is an error that says so, for the agent; a draft passes it over.
 */
export function applyDeckEdits(base: Deck, v: Obj, o: { draft?: boolean } = {}): DeckEditsOut {
  const n = base.slides.length;
  const fail = (where: string, why: string) => {
    if (!o.draft) throw new Error(`${where}: ${why}.`);
  };
  /** A slide named by its number or id: its id, or null. */
  const idOf = (ref: unknown, where: string): string | null => {
    if (typeof ref === 'number' && Number.isInteger(ref)) {
      if (ref >= 1 && ref <= n) return base.slides[ref - 1].id;
      fail(where, `there is no slide ${ref} (the deck has ${n}, numbered from 1)`);
      return null;
    }
    if (typeof ref === 'string' && ref.trim()) {
      const s = ref.trim();
      if (/^\d+$/.test(s)) return idOf(Number(s), where);
      if (base.slides.some((x) => x.id === s)) return s;
      fail(where, `there is no slide with the id ${s}`);
      return null;
    }
    fail(where, 'say which slide: its number (from 1) or its id');
    return null;
  };
  const gone = new Set<string>();
  if (Array.isArray(v.remove))
    v.remove.forEach((r, i) => {
      const id = idOf(r, `remove[${i}]`);
      if (id) gone.add(id);
    });
  const changed = new Map<string, { raw: Obj; key: string }>();
  if (Array.isArray(v.change))
    v.change.forEach((c, i) => {
      if (!isObj(c)) return fail(`change[${i}]`, 'each is a slide with "slide": its number or id');
      const id = idOf(c.slide ?? c.id, `change[${i}]`);
      if (!id) return;
      const { slide: _s, ...rest } = c;
      changed.set(id, { raw: { ...rest, id }, key: `change:${i}` });
    });
  // New slides after the one each names (its number or id as the version has it), in the order given.
  const after = new Map<string, { raw: Obj; key: string }[]>();
  const end: { raw: Obj; key: string }[] = [];
  if (Array.isArray(v.add))
    v.add.forEach((a, i) => {
      if (!isObj(a)) return fail(`add[${i}]`, 'each is a slide, with "after": the number or id of the slide it follows (0: first)');
      const { after: ref, ...rest } = a;
      const item = { raw: rest, key: `add:${i}` };
      if (ref === undefined || ref === null) return void end.push(item);
      if (ref === 0 || ref === '0') return void after.set('', [...(after.get('') ?? []), item]);
      const id = idOf(ref, `add[${i}]`);
      if (id) after.set(id, [...(after.get(id) ?? []), item]);
      else end.push(item);
    });
  const slides: unknown[] = [];
  const at = new Map<string, number>();
  const put = (x: { raw: Obj; key: string }) => {
    at.set(x.key, slides.length);
    slides.push(x.raw);
  };
  for (const x of after.get('') ?? []) put(x);
  for (const s of base.slides) {
    if (!gone.has(s.id)) {
      const c = changed.get(s.id);
      if (c) put(c);
      else slides.push(s);
    }
    for (const x of after.get(s.id) ?? []) put(x);
  }
  for (const x of end) put(x);
  return { slides, at };
}

/** For the agent: what save_slides' change, add and remove are and how to write them. */
export const DECK_EDITS_HELP =
  'To change some slides of a saved deck without sending all of it, give its id and, instead of slides: change: [{"slide": 3 (its number from 1, or its id), …the slide written again}] (it keeps its id and comments), add: [{"after": 5 (a number or id; 0 for first; left out: at the end), …a new slide}], remove: [7, "<id>"]; numbers are the slides as get_page numbers them before this save, the rest stays as it is. The user watches each save come in: make a long deck in steps, a few slides at a time (start with the first few, then add the next), rather than in one long call.';

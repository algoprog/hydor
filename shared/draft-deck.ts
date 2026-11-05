// A deck while an agent's save_slides call streams in (page-drafts.ts says what drafts are for). Each slide finished
// shows as it will be (one that holds what the version's slide of its id held is that slide itself, as drawn), the one
// being written as far as it has come, over the slide it writes again (what it has not reached yet stays as it was),
// and the version's slides from where the two meet follow. A call that changes some slides (change, add, remove) shows
// the deck with them made as they come.
import { applyDeckEdits, changesSlides } from './deck-edits.ts';
import type { JsonPath, PartialJson } from './partial-json.ts';
import { writingIn, type DraftMemo, type Drafted } from './page-drafts.ts';
import { normalizeDeck, type Deck, type Slide } from './slides.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The id the slide being written has while it is new. */
const OPEN = 'draft-open-slide';

/** The deck's own settings: those the call gives (once written whole), else the version's; the same objects while they hold the same. */
function settings(base: Deck | null, v: Obj, p: PartialJson, memo: DraftMemo): Omit<Deck, 'slides'> {
  const given = (k: string) => k in v && !writingIn(p.open, k);
  let d: Deck;
  try {
    d = normalizeDeck({ ratio: given('ratio') ? v.ratio : base?.ratio, theme: given('theme') ? v.theme : base?.theme, footer: given('footer') ? v.footer : base?.footer, guides: given('guides') ? v.guides : base?.guides, slides: [{}] });
  } catch {
    d = normalizeDeck({ slides: [{}] });
  }
  const same = <T>(x: T | undefined, was: T | undefined): T | undefined => (x === undefined ? undefined : was !== undefined && JSON.stringify(x) === JSON.stringify(was) ? was : (memo.same(x as object) as T));
  const out: Omit<Deck, 'slides'> = { v: 1, ratio: d.ratio, theme: same(d.theme, base?.theme)! };
  const footer = same(d.footer, base?.footer);
  if (footer) out.footer = footer;
  const guides = same(d.guides, base?.guides);
  if (guides) out.guides = guides;
  return out;
}

/** One slide as the deck keeps it (its id kept, or a new one), checked as a deck's are. */
function one(raw: unknown, head: Omit<Deck, 'slides'>): Slide | null {
  try {
    return normalizeDeck({ ratio: head.ratio, theme: head.theme, slides: [raw] }).slides[0] ?? null;
  } catch {
    return null;
  }
}

/** A finished slide: the version's own when it holds the same, else the one made last time for the same words. */
function finished(raw: unknown, head: Omit<Deck, 'slides'>, byId: Map<string, Slide>, memo: DraftMemo): Slide | null {
  const was = isObj(raw) && typeof raw.id === 'string' ? byId.get(raw.id) : undefined;
  if (was && raw === was) return was;
  // Made once: the next draws find it by what it says.
  return memo.make(`slide:${JSON.stringify(raw)}`, () => {
    const s = one(raw, head);
    return s && was && JSON.stringify(s) === JSON.stringify(was) ? was : s;
  });
}

/**
 * The slide being written (`raw`, as far as it has come; `rest`: where its text stopped inside it) over the version's
 * slide it writes again (`was`): its parts so far, then those of the old one it has not reached; what it has not said
 * yet stays as it was. The mark's part: the one being written.
 */
function writing(raw: unknown, rest: JsonPath, head: Omit<Deck, 'slides'>, was: Slide | undefined): { slide: Slide; el?: string } | null {
  const s = one(raw, head);
  if (!s) return was ? { slide: was } : null;
  const r = isObj(raw) ? raw : {};
  let out: Slide = s;
  if (was) {
    out = { ...s, id: was.id };
    for (const k of Object.keys(was) as (keyof Slide)[]) if (!(k in r) && k !== 'els' && k !== 'id') (out as unknown as Obj)[k] = was[k];
    // Its parts still coming: those written so far, then the old ones not reached yet.
    if (Array.isArray(r.els) && rest[0] === 'els') {
      const have = new Set(s.els.map((e) => e.id));
      out.els = [...s.els, ...was.els.filter((e) => !have.has(e.id))];
    } else if (!('els' in r) && !('layout' in r) && Object.keys(r).every((k) => k === 'id' || k === 'notes' || k === 'bg' || k === 'transition' || k === 'hidden' || k === 'nofooter' || k === 'anims')) out.els = was.els;
  } else out = { ...s, id: isObj(raw) && typeof raw.id === 'string' ? s.id : OPEN };
  // The part being written: by its place among the parts, or by the layout's words being written.
  let el: string | undefined;
  if (rest[0] === 'els' && typeof rest[1] === 'number') {
    const rawEl = Array.isArray(r.els) ? (r.els[rest[1]] as Obj | undefined) : undefined;
    el = typeof rawEl?.id === 'string' ? rawEl.id : s.els[rest[1]]?.id;
  } else if (typeof rest[0] === 'string') {
    // A layout's words: the part of its role (a column's or a list's words go in the last of its body parts written).
    const role = ({ title: 'title', subtitle: 'subtitle', quote: 'quote', by: 'caption', caption: 'caption', text: 'body', right: 'body', left: 'body', cards: 'body', steps: 'body', stats: 'body' } as Record<string, string>)[rest[0]];
    const hit = role ? [...out.els].reverse().find((e) => (e as { role?: string }).role === role) : undefined;
    el = hit?.id;
  }
  return { slide: out, el };
}

/**
 * The deck a save_slides call (as far as it has come, `p`) is writing, over the version open now (`base`; none for a
 * new deck): null while it says nothing of the slides yet.
 */
export function draftDeck(base: Deck | null, p: PartialJson, memo: DraftMemo): Drafted<Deck> | null {
  const v = isObj(p.value) ? p.value : {};
  const head = settings(base, v, p, memo);
  const byId = new Map((base?.slides ?? []).map((s) => [s.id, s] as const));
  const done = (slides: Slide[], mark: Drafted<Deck>['mark']): Drafted<Deck> | null => {
    memo.turn();
    if (!slides.length && !base) return null;
    return { model: { ...head, slides: slides.length ? slides : base!.slides }, mark };
  };
  // Some slides changed, added or taken out: made on the version as they come.
  if (base && changesSlides(v)) {
    const { slides: raws, at } = applyDeckEdits(base, v, { draft: true });
    const o = p.open;
    const openKey = o && (o[0] === 'change' || o[0] === 'add') && typeof o[1] === 'number' ? `${o[0]}:${o[1]}` : null;
    const openAt = openKey ? at.get(openKey) : undefined;
    const slides: Slide[] = [];
    let mark: Drafted<Deck>['mark'] = null;
    raws.forEach((raw, i) => {
      if (i === openAt) {
        const was = isObj(raw) && typeof raw.id === 'string' ? byId.get(raw.id) : undefined;
        const { slide: _s, after: _a, ...r } = raw as Obj;
        const w = writing(r, o!.slice(2), head, o![0] === 'change' ? was : undefined);
        if (w) {
          slides.push(w.slide);
          mark = { kind: 'slides', slide: slides.length - 1, el: w.el };
        }
        return;
      }
      const s = finished(raw, head, byId, memo);
      if (s) slides.push(s);
    });
    return done(slides, mark);
  }
  if (!Array.isArray(v.slides)) return base ? done(base.slides, null) : null;
  const list = v.slides as unknown[];
  const inSlides = writingIn(p.open, 'slides');
  const openIdx = inSlides && typeof p.open![1] === 'number' ? (p.open![1] as number) : -1;
  const slides: Slide[] = [];
  // Where the version's slides take up again: after the last one the call wrote again (by its id), or (slides without
  // ids, as a new deck is written) after as many as it has written.
  let k = 0;
  let ids = false;
  const used = new Set<string>();
  let mark: Drafted<Deck>['mark'] = null;
  list.forEach((raw, i) => {
    const id = isObj(raw) && typeof raw.id === 'string' ? raw.id : null;
    const was = id ? byId.get(id) : undefined;
    if (was) {
      ids = true;
      used.add(was.id);
      k = Math.max(k, base!.slides.indexOf(was) + 1);
    }
    if (i === openIdx) {
      const w = writing(raw, p.open!.slice(2), head, was);
      if (w) {
        slides.push(w.slide);
        mark = { kind: 'slides', slide: slides.length - 1, el: w.el };
      }
      return;
    }
    const s = finished(raw, head, byId, memo);
    if (s) slides.push(s);
  });
  if (base && inSlides) {
    // Still coming: the version's rest follows, from where they meet (each slide once).
    const from = ids ? k : list.length;
    for (const s of base.slides.slice(from)) if (!used.has(s.id)) slides.push(s);
  }
  if (!mark && inSlides && slides.length) mark = { kind: 'slides', slide: Math.min(list.length, slides.length) - 1 };
  return done(slides, mark);
}

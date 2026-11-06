// Slides of another deck, to put in this one (PowerPoint's Reuse Slides, Google Slides' Import slides): copies with ids
// of their own (slides, parts, animations), none the deck has; their connectors stuck to their copies, their animations,
// taps and Morph's matches on their copies; their speaker notes kept and their comments left behind (they were said of
// the other deck). Keeping their look, each takes its deck's theme as a theme of its own (as PowerPoint keeps a slide's
// master); else it takes this deck's, its parts' colours and fonts following it. A deck of the other shape (4:3, 16:9)
// has its slides' parts set to this one's height. Into a PowerPoint compatible deck, what only the web format has
// becomes PowerPoint's (toPowerPoint). Pictures and videos the app keeps are kept by their hash: they come as they are.
import { everyEl, newId, scaleEls, slideH, toPowerPoint, isWebDeck, type Anim, type Deck, type El, type Slide, type Stick, type Theme } from './slides.ts';

/** Whether two themes look the same (their colours and fonts). */
export function sameLook(a: Theme, b: Theme): boolean {
  const k = (t: Theme) => JSON.stringify([t.bg, t.fg, t.head, t.muted, t.accent, t.accentFg, t.soft, t.colors, t.font, t.headFont]);
  return k(a) === k(b);
}

/** Copies of slides `picks` (their places in `from`) for `into`, in their order. */
export function reuseSlides(from: Deck, picks: number[], into: Deck, o: { keepLook: boolean }): Slide[] {
  const used = new Set<string>(into.slides.flatMap((s) => [s.id, ...everyEl(s.els).map((e) => e.id), ...(s.anims ?? []).map((a) => a.id)]));
  const fresh = () => {
    let id = newId();
    while (used.has(id)) id = newId();
    used.add(id);
    return id;
  };
  const chosen = [...new Set(picks)].filter((i) => i >= 0 && i < from.slides.length).map((i) => from.slides[i]);
  // Every part's new id, across the slides taken (Morph matches a part to one of the slide before by its key or id).
  const ids = new Map<string, string>();
  for (const s of chosen) for (const e of everyEl(s.els)) if (!ids.has(e.id)) ids.set(e.id, fresh());
  const re = (id: string) => ids.get(id) ?? id;
  const stick = (st: Stick | undefined) => (st ? { ...st, el: re(st.el) } : undefined);
  const renew = (els: El[]): El[] =>
    els.map((e) => {
      const c = { ...e, id: re(e.id) } as El;
      if (c.key) c.key = re(c.key);
      if (c.type === 'line') {
        const from = stick(c.from);
        const to = stick(c.to);
        if (from) c.from = from;
        if (to) c.to = to;
      }
      return c.type === 'group' ? { ...c, els: renew(c.els) } : c;
    });
  const k = slideH(into.ratio) / slideH(from.ratio);
  let slides = chosen.map((s): Slide => {
    const { comments: _c, theme: own, ...rest } = s;
    let els = renew(s.els);
    if (k !== 1) els = scaleEls(els, 1, k);
    const anims = s.anims?.map((a): Anim => ({ ...a, id: fresh(), el: re(a.el), ...(a.trigger ? { trigger: re(a.trigger) } : {}) }));
    const out: Slide = { ...rest, id: fresh(), els, ...(anims?.length ? { anims } : {}) };
    if (!anims?.length) delete out.anims;
    // Its look: its own theme, else its deck's, where that is not this deck's already.
    const look = own ?? from.theme;
    if (o.keepLook && !sameLook(look, into.theme)) out.theme = { ...look, colors: [...look.colors] };
    return out;
  });
  // A PowerPoint compatible deck takes only what PowerPoint has.
  if (!isWebDeck(into)) {
    const made = toPowerPoint({ ...into, slides: [...into.slides, ...slides] });
    slides = made.slides.slice(into.slides.length);
  }
  return slides;
}

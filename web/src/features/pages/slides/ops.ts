// What the slides editor does to a deck, each as a new deck (the old one stays for Undo): parts added, changed,
// moved, lined up and stacked; slides added from a layout, copied, moved and removed; animations in their order.
import {
  layoutSlide,
  newId,
  SLIDE_W,
  slideH,
  type Anim,
  type ChartEl,
  type Deck,
  type El,
  type ImageEl,
  type LayoutId,
  type LineEl,
  type Para,
  type ShapeEl,
  type ShapeKind,
  type Slide,
  type TableEl,
  type TextEl,
} from '@shared/slides';

export const W = SLIDE_W;
export const heightOf = (d: Deck) => slideH(d.ratio);

/** A part's box on the slide: a line's from its two ends. */
export function boxOf(e: El): { x: number; y: number; w: number; h: number } {
  if (e.type === 'line') return { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h), w: Math.abs(e.w), h: Math.abs(e.h) };
  return { x: e.x, y: e.y, w: e.w, h: e.h };
}

export const setSlide = (d: Deck, i: number, f: (s: Slide) => Slide): Deck => ({ ...d, slides: d.slides.map((s, k) => (k === i ? f(s) : s)) });

export const setEls = (d: Deck, i: number, ids: string[], f: (e: El) => El): Deck => setSlide(d, i, (s) => ({ ...s, els: s.els.map((e) => (ids.includes(e.id) ? f(e) : e)) }));

/** Every part of the deck has a new id (copies of slides and parts), its animations following. */
function fresh(s: Slide): Slide {
  const ids = new Map<string, string>();
  const els = s.els.map((e) => {
    const id = newId();
    ids.set(e.id, id);
    return { ...e, id };
  });
  return { ...s, id: newId(), els, anims: s.anims?.filter((a) => ids.has(a.el)).map((a) => ({ ...a, id: newId(), el: ids.get(a.el)! })) };
}

export function addSlide(d: Deck, after: number, layout: LayoutId): { deck: Deck; at: number } {
  const s = layoutSlide(layout, {}, d.ratio);
  const slides = [...d.slides];
  slides.splice(after + 1, 0, s);
  return { deck: { ...d, slides }, at: after + 1 };
}

export function duplicateSlides(d: Deck, list: number[]): { deck: Deck; at: number } {
  const slides = [...d.slides];
  const sorted = [...list].sort((a, b) => a - b);
  const last = sorted[sorted.length - 1];
  slides.splice(last + 1, 0, ...sorted.map((i) => fresh(d.slides[i])));
  return { deck: { ...d, slides }, at: last + 1 };
}

export function removeSlides(d: Deck, list: number[]): Deck {
  const slides = d.slides.filter((_, i) => !list.includes(i));
  return { ...d, slides: slides.length ? slides : [layoutSlide('blank', {}, d.ratio)] };
}

export function moveSlide(d: Deck, from: number, to: number): Deck {
  const slides = [...d.slides];
  const [s] = slides.splice(from, 1);
  slides.splice(Math.max(0, Math.min(slides.length, to)), 0, s);
  return { ...d, slides };
}

// ---- parts ---------------------------------------------------------------------------------------------

const centred = (d: Deck, w: number, h: number) => ({ x: Math.round((W - w) / 2), y: Math.round((heightOf(d) - h) / 2), w, h });

export function textBox(d: Deck): TextEl {
  return { id: newId(), type: 'text', ...centred(d, 520, 90), role: 'body', paras: [{ runs: [{ t: '' }] }], size: 28, ph: 'Click to add text', fit: 'shrink' };
}

export function shape(d: Deck, kind: ShapeKind): ShapeEl {
  const square = ['ellipse', 'star', 'plus', 'heart', 'octagon', 'hexagon', 'pentagon', 'diamond', 'triangle', 'rtriangle'].includes(kind);
  return { id: newId(), type: 'shape', shape: kind, ...centred(d, square ? 220 : 320, square ? 220 : 160), fill: 'accent', paras: [{ runs: [{ t: '' }] }], size: 24, color: 'accentFg', align: 'center', valign: 'middle', ...(kind === 'round' ? { radius: 24 } : {}) };
}

export function line(d: Deck, arrow: boolean): LineEl {
  const h = heightOf(d);
  return { id: newId(), type: 'line', x: 440, y: Math.round(h / 2), w: 400, h: 0, width: 4, color: 'fg', ...(arrow ? { end: 'arrow' as const } : {}) };
}

export function image(d: Deck, src: string, nw: number, nh: number): ImageEl {
  const H = heightOf(d);
  const k = Math.min(1, 720 / nw, (H * 0.8) / nh);
  const w = Math.max(40, Math.round(nw * k));
  const h = Math.max(40, Math.round(nh * k));
  return { id: newId(), type: 'image', src, ...centred(d, w, h), fit: 'cover' };
}

export function table(d: Deck): TableEl {
  return {
    id: newId(),
    type: 'table',
    ...centred(d, 900, 4 * 58),
    rows: [
      ['Heading', 'Heading', 'Heading'],
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ],
    head: true,
    band: true,
    size: 20,
  };
}

export function chart(d: Deck): ChartEl {
  return {
    id: newId(),
    type: 'chart',
    ...centred(d, 820, 460),
    kind: 'column',
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: [
      { name: 'This year', values: [4, 6, 5, 8] },
      { name: 'Last year', values: [3, 4, 4, 6] },
    ],
    legend: true,
    grid: true,
    size: 18,
  };
}

/** Parts added to a slide (on top), selected after. */
export function addEls(d: Deck, i: number, els: El[]): Deck {
  return setSlide(d, i, (s) => ({ ...s, els: [...s.els, ...els] }));
}

export function removeEls(d: Deck, i: number, ids: string[]): Deck {
  return setSlide(d, i, (s) => {
    const anims = s.anims?.filter((a) => !ids.includes(a.el));
    return { ...s, els: s.els.filter((e) => !ids.includes(e.id)), ...(anims ? { anims } : {}) };
  });
}

/** Copies of parts, a little down and to the right of where they were (or where `at` puts them). */
export function copies(els: El[], shift = 24): El[] {
  return els.map((e) => ({ ...e, id: newId(), x: e.x + shift, y: e.y + shift }));
}

/** Parts moved in the stacking order: to the front or back, or one step. */
export function restack(d: Deck, i: number, ids: string[], how: 'front' | 'back' | 'forward' | 'backward'): Deck {
  return setSlide(d, i, (s) => {
    const els = [...s.els];
    const picked = els.filter((e) => ids.includes(e.id));
    const rest = els.filter((e) => !ids.includes(e.id));
    if (how === 'front') return { ...s, els: [...rest, ...picked] };
    if (how === 'back') return { ...s, els: [...picked, ...rest] };
    const out = [...els];
    const order = how === 'forward' ? [...out.keys()].reverse() : [...out.keys()];
    for (const k of order) {
      if (!ids.includes(out[k].id)) continue;
      const j = how === 'forward' ? k + 1 : k - 1;
      if (j < 0 || j >= out.length || ids.includes(out[j].id)) continue;
      [out[k], out[j]] = [out[j], out[k]];
    }
    return { ...s, els: out };
  });
}

export type AlignHow = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Parts lined up with each other (two or more), or with the slide (one). */
export function align(d: Deck, i: number, ids: string[], how: AlignHow): Deck {
  const s = d.slides[i];
  const picked = s.els.filter((e) => ids.includes(e.id));
  if (!picked.length) return d;
  const boxes = picked.map(boxOf);
  const area =
    picked.length === 1
      ? { x: 0, y: 0, w: W, h: heightOf(d) }
      : (() => {
          const x = Math.min(...boxes.map((b) => b.x));
          const y = Math.min(...boxes.map((b) => b.y));
          return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
        })();
  return setEls(d, i, ids, (e) => {
    const b = boxOf(e);
    let dx = 0;
    let dy = 0;
    if (how === 'left') dx = area.x - b.x;
    if (how === 'center') dx = area.x + area.w / 2 - (b.x + b.w / 2);
    if (how === 'right') dx = area.x + area.w - (b.x + b.w);
    if (how === 'top') dy = area.y - b.y;
    if (how === 'middle') dy = area.y + area.h / 2 - (b.y + b.h / 2);
    if (how === 'bottom') dy = area.y + area.h - (b.y + b.h);
    return { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) };
  });
}

/** Three or more parts spread evenly across or down. */
export function distribute(d: Deck, i: number, ids: string[], axis: 'h' | 'v'): Deck {
  const s = d.slides[i];
  const picked = s.els.filter((e) => ids.includes(e.id)).map((e) => ({ e, b: boxOf(e) }));
  if (picked.length < 3) return d;
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  picked.sort((a, b) => a.b[key] - b.b[key]);
  const first = picked[0].b[key];
  const end = Math.max(...picked.map((p) => p.b[key] + p.b[size]));
  const total = picked.reduce((a, p) => a + p.b[size], 0);
  const gap = (end - first - total) / (picked.length - 1);
  const at = new Map<string, number>();
  let pos = first;
  for (const p of picked) {
    at.set(p.e.id, pos);
    pos += p.b[size] + gap;
  }
  return setEls(d, i, ids, (e) => {
    const b = boxOf(e);
    const target = at.get(e.id);
    if (target === undefined) return e;
    const delta = Math.round(target - b[key]);
    return { ...e, [key]: e[key] + delta } as El;
  });
}

// ---- text ----------------------------------------------------------------------------------------------

/** The text's paragraphs changed by `f`, each run of each changed by `r` (for the whole box at once). */
export function eachRun(paras: Para[], r: (run: Para['runs'][number]) => Para['runs'][number]): Para[] {
  return paras.map((p) => ({ ...p, runs: p.runs.map(r) }));
}

/** A run without a field (its own bold, its own colour…): the box's own then shows. */
export function dropRunField<K extends keyof Para['runs'][number]>(paras: Para[], k: K): Para[] {
  return eachRun(paras, (r) => {
    if (!(k in r)) return r;
    const { [k]: _gone, ...rest } = r;
    return rest as Para['runs'][number];
  });
}

/** Lists on or off for every paragraph: bullets, numbers, or none. */
export function listAll(paras: Para[], list: 'bullet' | 'number' | null): Para[] {
  return paras.map((p) => {
    const { list: _l, ...rest } = p;
    return list ? { ...rest, list } : rest;
  });
}

// ---- animations ----------------------------------------------------------------------------------------

export function addAnim(d: Deck, i: number, a: Omit<Anim, 'id'>, id = newId()): Deck {
  return setSlide(d, i, (s) => ({ ...s, anims: [...(s.anims ?? []), { ...a, id }] }));
}

export function setAnim(d: Deck, i: number, id: string, patch: Partial<Anim>): Deck {
  return setSlide(d, i, (s) => ({ ...s, anims: (s.anims ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
}

export function removeAnim(d: Deck, i: number, id: string): Deck {
  return setSlide(d, i, (s) => {
    const anims = (s.anims ?? []).filter((a) => a.id !== id);
    const { anims: _a, ...rest } = s;
    return anims.length ? { ...rest, anims } : rest;
  });
}

export function moveAnim(d: Deck, i: number, id: string, by: -1 | 1): Deck {
  return setSlide(d, i, (s) => {
    const list = [...(s.anims ?? [])];
    const k = list.findIndex((a) => a.id === id);
    const j = k + by;
    if (k < 0 || j < 0 || j >= list.length) return s;
    [list[k], list[j]] = [list[j], list[k]];
    return { ...s, anims: list };
  });
}

/** What a part is called in the editor: its name, else its kind and first words. */
export function partName(e: El): string {
  if (e.name) return e.name;
  if (e.type === 'text' || e.type === 'shape') {
    const words = e.paras
      .map((p) => p.runs.map((r) => r.t).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const kind = e.type === 'shape' ? 'Shape' : e.role === 'title' ? 'Title' : e.role === 'subtitle' ? 'Subtitle' : 'Text';
    return words ? `${kind}: ${words.length > 28 ? `${words.slice(0, 27)}…` : words}` : kind;
  }
  if (e.type === 'image') return e.alt ? `Picture: ${e.alt.slice(0, 28)}` : 'Picture';
  if (e.type === 'chart') return e.title ? `Chart: ${e.title.slice(0, 28)}` : 'Chart';
  if (e.type === 'table') return 'Table';
  if (e.type === 'icon') return `Icon: ${e.icon.replace(/-/g, ' ')}`;
  if (e.type === 'math') return `Equation: ${e.tex.length > 24 ? `${e.tex.slice(0, 23)}…` : e.tex}`;
  if (e.type === 'video') return 'Video';
  if (e.type === 'group') return `Group of ${e.els.length}`;
  return e.end === 'arrow' || e.start === 'arrow' ? 'Arrow' : 'Straight line';
}

// ---- undo ----------------------------------------------------------------------------------------------

export interface History {
  past: Deck[];
  future: Deck[];
  /** The last change's kind and time: changes of one kind in a row (typing, nudging) undo together. */
  last?: { key: string; at: number };
}

export const HISTORY_MAX = 120;

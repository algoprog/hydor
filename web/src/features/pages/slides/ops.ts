// What the slides editor does to a deck, each as a new deck (the old one stays for Undo): parts added, changed
// (in groups too), moved, lined up and stacked, grouped and ungrouped; slides added from a layout, copied, moved and
// removed; animations in their order; a part's look copied onto others (the format painter); table cells merged;
// the comments on a part that goes kept on its slide.
import {
  everyEl,
  facingSides,
  fitGroup,
  groupOf,
  layoutSlide,
  newId,
  SLIDE_W,
  slideH,
  ungroupEls,
  type Anim,
  type ChartEl,
  type Deck,
  type El,
  type GroupEl,
  type ImageEl,
  type LayoutId,
  type LineEl,
  type Merge,
  type Para,
  type ShapeEl,
  type ShapeKind,
  sidePoint,
  type Slide,
  type Stick,
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

/** Parts changed by `f` wherever they are, in groups too; a group whose parts changed is fitted round them again. */
function mapDeep(els: El[], ids: string[], f: (e: El) => El): El[] {
  let changed = false;
  const out = els.map((e) => {
    if (ids.includes(e.id)) {
      changed = true;
      return f(e);
    }
    if (e.type === 'group') {
      const inner = mapDeep(e.els, ids, f);
      if (inner !== e.els) {
        changed = true;
        return fitGroup({ ...e, els: inner });
      }
    }
    return e;
  });
  return changed ? out : els;
}

export const setEls = (d: Deck, i: number, ids: string[], f: (e: El) => El): Deck => setSlide(d, i, (s) => ({ ...s, els: mapDeep(s.els, ids, f) }));

/** A part of a slide by its id, wherever it is. */
export function findEl(els: El[], id: string): El | undefined {
  for (const e of els) {
    if (e.id === id) return e;
    if (e.type === 'group') {
      const got = findEl(e.els, id);
      if (got) return got;
    }
  }
  return undefined;
}

/** The groups a part is in, the outermost first ([] for one on the slide itself; null when it is not there). */
export function pathTo(els: El[], id: string, path: GroupEl[] = []): GroupEl[] | null {
  for (const e of els) {
    if (e.id === id) return path;
    if (e.type === 'group') {
      const got = pathTo(e.els, id, [...path, e]);
      if (got) return got;
    }
  }
  return null;
}

/** The parts picked, wherever they are. */
export const pickedOf = (s: Slide | undefined, sel: string[]): El[] => (s ? sel.map((id) => findEl(s.els, id)).filter((e): e is El => !!e) : []);

/** A part as it is on the slide: one in a group placed where it shows, turned with its groups. */
export function onSlide(s: Slide, e: El): El {
  const path = pathTo(s.els, e.id) ?? [];
  let out = e;
  for (let i = path.length - 1; i >= 0; i--) out = ungroupEls({ ...path[i], els: [out] })[0];
  return out;
}

/** The part of the slide itself a part is in (itself, or the outermost group around it). */
export const topOf = (s: Slide, id: string): El | undefined => pathTo(s.els, id)?.[0] ?? s.els.find((e) => e.id === id);

/** Copies of parts with new ids (their groups' parts' too), keeping what Morph knows them by; `ids` gets each old id's copy's. */
function renew(els: El[], ids: Map<string, string> = new Map()): El[] {
  return els.map((e) => {
    const c = { ...e, id: newId(), key: e.key ?? e.id } as El;
    ids.set(e.id, c.id);
    return c.type === 'group' ? { ...c, els: renew(c.els, ids) } : c;
  });
}

/** Connectors among copies: an end stuck to a part copied with them sticks to its copy; one stuck to a part left behind is free. */
function restick(els: El[], ids: Map<string, string>): El[] {
  return els.map((e) => {
    if (e.type === 'group') return { ...e, els: restick(e.els, ids) };
    if (e.type !== 'line' || (!e.from && !e.to)) return e;
    const { from, to, ...rest } = e;
    const re = (st?: Stick) => (st && ids.has(st.el) ? { ...st, el: ids.get(st.el)! } : undefined);
    const f = re(from);
    const t = re(to);
    return { ...rest, ...(f ? { from: f } : {}), ...(t ? { to: t } : {}) };
  });
}

/** Every part of the deck has a new id (copies of slides and parts), its animations and connectors following; its comments stay with the slide copied. */
function fresh(s: Slide): Slide {
  const ids = new Map<string, string>();
  const els = restick(renew(s.els, ids), ids);
  const { comments: _c, ...rest } = s;
  return { ...rest, id: newId(), els, anims: s.anims?.filter((a) => ids.has(a.el)).map((a) => ({ ...a, id: newId(), el: ids.get(a.el)! })) };
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

/** Parts removed wherever they are; a group left empty goes too, one left with parts is fitted round them. */
function dropDeep(els: El[], ids: string[]): El[] {
  const out: El[] = [];
  for (const e of els) {
    if (ids.includes(e.id)) continue;
    if (e.type === 'group') {
      const inner = dropDeep(e.els, ids);
      if (!inner.length) continue;
      out.push(inner.length === e.els.length && inner.every((x, k) => x === e.els[k]) ? e : fitGroup({ ...e, els: inner }));
    } else out.push(e);
  }
  return out;
}

export function removeEls(d: Deck, i: number, ids: string[]): Deck {
  return setSlide(d, i, (s) => {
    const els = dropDeep(s.els, ids);
    const left = new Set(els.map((e) => e.id));
    const anims = s.anims?.filter((a) => left.has(a.el));
    // The comments on a part that goes stay on the slide, their mark where the part's top-right corner was; the
    // connectors stuck to it are free there.
    const gone = new Set(everyEl(s.els).map((e) => e.id).filter((id) => !everyEl(els).some((e) => e.id === id)));
    const kept = gone.size ? restick(els, new Map(everyEl(els).map((e) => [e.id, e.id]))) : els;
    const comments = s.comments?.map((c) => {
      if (!c.el || !gone.has(c.el)) return c;
      const was = findEl(s.els, c.el);
      const b = was ? boxOf(onSlide(s, was)) : { x: W - 40, y: 40, w: 0, h: 0 };
      const { el: _e, ...rest } = c;
      return { ...rest, x: Math.round(Math.min(W, Math.max(0, b.x + b.w))), y: Math.round(Math.max(0, b.y)) };
    });
    return { ...s, els: kept, ...(anims ? { anims } : {}), ...(comments ? { comments } : {}) };
  });
}

/** Copies of parts, a little down and to the right of where they were; connectors stay stuck to what was copied with them. */
export function copies(els: El[], shift = 24): El[] {
  const ids = new Map<string, string>();
  return restick(renew(els, ids), ids).map((c) => ({ ...c, x: c.x + shift, y: c.y + shift }));
}

/** A connector: between two parts picked (from the first to the second, by the sides that face each other), or free in the slide's middle (its ends stick to parts once dragged onto them). */
export function connector(d: Deck, i: number, elbow: boolean, picked: El[]): LineEl {
  const h = heightOf(d);
  const free: LineEl = { id: newId(), type: 'line', x: 440, y: Math.round(h / 2 - (elbow ? 80 : 0)), w: 400, h: elbow ? 160 : 0, width: 3, color: 'fg', end: 'arrow', ...(elbow ? { route: 'elbow' as const } : {}) };
  const s = d.slides[i];
  if (!s || picked.length !== 2 || picked.some((e) => e.type === 'line')) return free;
  const a = onSlide(s, picked[0]);
  const b = onSlide(s, picked[1]);
  const [fa, fb] = facingSides(a, b);
  const p1 = sidePoint(a, fa);
  const p2 = sidePoint(b, fb);
  return { ...free, x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, from: { el: picked[0].id, at: fa }, to: { el: picked[1].id, at: fb } };
}

/** The parts' own list that holds every one of `ids` (the slide's, or a group's), with the group it is in. */
function levelOf(els: El[], ids: string[], group: GroupEl | null = null): { els: El[]; group: GroupEl | null } | null {
  if (ids.every((id) => els.some((e) => e.id === id))) return { els, group };
  for (const e of els)
    if (e.type === 'group') {
      const got = levelOf(e.els, ids, e);
      if (got) return got;
    }
  return null;
}

/** A level's list of parts replaced: the slide's own, or a group's (then fitted round them). */
function setLevel(d: Deck, i: number, group: GroupEl | null, els: El[], anims?: (a: Anim[]) => Anim[]): Deck {
  return setSlide(d, i, (s) => {
    if (!group) {
      const next = anims ? anims(s.anims ?? []) : s.anims;
      const { anims: _a, ...rest } = s;
      return next?.length ? { ...rest, els, anims: next } : { ...rest, els };
    }
    return { ...s, els: mapDeep(s.els, [group.id], (g) => fitGroup({ ...(g as GroupEl), els })) };
  });
}

/**
 * Two or more parts (side by side in the same list) made into a group, where the topmost of them was. Their
 * animations go to the group: the first that brings them in, stresses them and takes them out.
 */
export function groupEls(d: Deck, i: number, ids: string[]): { deck: Deck; id: string } | null {
  const lv = levelOf(d.slides[i].els, ids);
  if (!lv || ids.length < 2) return null;
  const picked = lv.els.filter((e) => ids.includes(e.id));
  const id = newId();
  const g = groupOf(picked, id);
  const top = Math.max(...picked.map((e) => lv.els.indexOf(e)));
  const els: El[] = [];
  lv.els.forEach((e, k) => {
    if (!ids.includes(e.id)) els.push(e);
    else if (k === top) els.push(g);
  });
  const deck = setLevel(d, i, lv.group, els, (anims) => {
    const seen = new Set<string>();
    return anims.flatMap((a) => {
      if (!ids.includes(a.el)) return [a];
      if (seen.has(a.type)) return [];
      seen.add(a.type);
      return [{ ...a, el: id, byPara: undefined }];
    });
  });
  return { deck, id };
}

/** A group's parts back in its place, where they show; its animations go to its parts, which then move together. */
export function ungroup(d: Deck, i: number, id: string): { deck: Deck; ids: string[] } | null {
  const lv = levelOf(d.slides[i].els, [id]);
  const g = lv?.els.find((e) => e.id === id);
  if (!lv || !g || g.type !== 'group') return null;
  const parts = ungroupEls(g);
  const els = lv.els.flatMap((e) => (e.id === id ? parts : [e]));
  const deck = setLevel(d, i, lv.group, els, (anims) => anims.flatMap((a) => (a.el !== id ? [a] : parts.map((p, k) => ({ ...a, id: k ? newId() : a.id, el: p.id, on: k ? ('with' as const) : a.on, delay: k ? 0 : a.delay })))));
  return { deck, ids: parts.map((p) => p.id) };
}

/** Parts moved in the stacking order: to the front or back, or one step (in their group, for parts of one). */
export function restack(d: Deck, i: number, ids: string[], how: 'front' | 'back' | 'forward' | 'backward'): Deck {
  const lv = levelOf(d.slides[i].els, ids);
  if (lv?.group) return setLevel(d, i, lv.group, restack({ ...d, slides: [{ id: 'x', els: lv.els }] }, 0, ids, how).slides[0].els);
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
  const lv = levelOf(s.els, ids);
  const picked = (lv?.els ?? s.els).filter((e) => ids.includes(e.id));
  if (!picked.length) return d;
  const boxes = picked.map(boxOf);
  // One part lines up with the slide, or with its group when it is in one.
  const area =
    picked.length === 1
      ? lv?.group
        ? { x: 0, y: 0, w: lv.group.w, h: lv.group.h }
        : { x: 0, y: 0, w: W, h: heightOf(d) }
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
  const picked = (levelOf(s.els, ids)?.els ?? s.els).filter((e) => ids.includes(e.id)).map((e) => ({ e, b: boxOf(e) }));
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

// ---- the format painter ---------------------------------------------------------------------------------

/** What makes up a part's look, by kind: its fill and border, its words' look, a line's ends, an icon's colour. */
const LOOKS: Record<El['type'], string[]> = {
  text: ['fill', 'fill2', 'angle', 'line', 'lineW', 'dash', 'radius', 'shadow', 'opacity', 'font', 'size', 'color', 'bold', 'italic', 'align', 'valign', 'lh', 'gap', 'ls', 'pad'],
  shape: ['fill', 'fill2', 'angle', 'line', 'lineW', 'dash', 'radius', 'shadow', 'opacity', 'font', 'size', 'color', 'bold', 'italic', 'align', 'valign', 'lh', 'gap', 'ls', 'pad'],
  image: ['radius', 'line', 'lineW', 'shadow', 'opacity', 'adjust'],
  line: ['color', 'width', 'dash', 'start', 'end', 'opacity'],
  icon: ['color', 'lineW', 'opacity'],
  math: ['color', 'opacity'],
  video: ['radius', 'opacity'],
  table: ['size', 'color', 'font', 'fill', 'headColor', 'line', 'head', 'band', 'opacity'],
  chart: ['size', 'color', 'font', 'opacity'],
  code: ['size', 'look', 'lineNumbers', 'radius', 'opacity'],
  html: ['opacity'],
  embed: ['radius', 'opacity'],
  quiz: ['size', 'color', 'font', 'fill', 'layout', 'opacity'],
  score: ['size', 'color', 'font', 'bold', 'align', 'opacity'],
  scene3d: ['color', 'material', 'light', 'bg', 'opacity'],
  group: ['opacity'],
};

export interface Look {
  type: El['type'];
  props: Record<string, unknown>;
  /** How the words look where they start (their own bold, colour, font…), for text. */
  words?: Partial<Para['runs'][number]>;
}

/** A part's look, to put on others. */
export function lookOf(e: El): Look {
  const props: Record<string, unknown> = {};
  for (const k of LOOKS[e.type]) props[k] = (e as unknown as Record<string, unknown>)[k];
  if (e.type === 'text' || e.type === 'shape') {
    const r = e.paras.flatMap((p) => p.runs).find((x) => x.t);
    if (r) {
      // The words' own look, where they have one, is what shows.
      if (r.font) props.font = r.font;
      if (r.size) props.size = r.size;
      if (r.color) props.color = r.color;
      if (r.b !== undefined) props.bold = r.b || undefined;
      if (r.i !== undefined) props.italic = r.i || undefined;
      return { type: e.type, props, words: { u: r.u, s: r.s, hl: r.hl } };
    }
  }
  return { type: e.type, props };
}

/** A look put on a part: what the two kinds share (a colour is a colour, a line's or an icon's); on a group, on each of its parts. */
export function withLook(e: El, look: Look): El {
  if (e.type === 'group' && look.type !== 'group') return { ...e, els: e.els.map((x) => withLook(x, look)) };
  const mine = LOOKS[e.type];
  const theirs = LOOKS[look.type];
  const alias: Record<string, string> = e.type === look.type ? {} : { color: 'color', lineW: e.type === 'line' ? 'width' : 'lineW', width: e.type === 'icon' ? 'lineW' : 'width' };
  const out = { ...e } as Record<string, unknown>;
  for (const k of theirs) {
    const to = mine.includes(k) ? k : alias[k] && mine.includes(alias[k]) ? alias[k] : null;
    if (!to) continue;
    const v = look.props[k];
    if (v === undefined) delete out[to];
    else out[to] = v;
  }
  if ((e.type === 'text' || e.type === 'shape') && (look.type === 'text' || look.type === 'shape')) {
    const w = look.words ?? {};
    out.paras = e.paras.map((p) => ({
      ...p,
      runs: p.runs.map((r) => {
        const { font: _f, size: _s, color: _c, b: _b, i: _i, u: _u, s: _st, hl: _h, ...rest } = r;
        return { ...rest, ...(w.u ? { u: true } : {}), ...(w.s ? { s: true } : {}), ...(w.hl ? { hl: w.hl } : {}) };
      }),
    }));
  }
  return out as unknown as El;
}

// ---- tables -------------------------------------------------------------------------------------------------

/** The merged block a cell is in, if it is in one. */
export const mergeAt = (t: TableEl, r: number, c: number): Merge | undefined => t.merges?.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);

/** A block of cells merged into one: their words together in its first cell, merges it covers undone. */
export function mergeCells(t: TableEl, r0: number, c0: number, r1: number, c1: number): TableEl {
  let [ra, rb, ca, cb] = [Math.min(r0, r1), Math.max(r0, r1), Math.min(c0, c1), Math.max(c0, c1)];
  // A merged block it touches becomes part of it.
  for (let grew = true; grew;) {
    grew = false;
    for (const m of t.merges ?? []) {
      const meets = m.r <= rb && m.r + m.rs - 1 >= ra && m.c <= cb && m.c + m.cs - 1 >= ca;
      if (!meets) continue;
      const nr = [Math.min(ra, m.r), Math.max(rb, m.r + m.rs - 1), Math.min(ca, m.c), Math.max(cb, m.c + m.cs - 1)] as const;
      if (nr[0] !== ra || nr[1] !== rb || nr[2] !== ca || nr[3] !== cb) {
        [ra, rb, ca, cb] = nr;
        grew = true;
      }
    }
  }
  if (ra === rb && ca === cb) return t;
  const words: string[] = [];
  const rows = t.rows.map((row, r) =>
    row.map((v, c) => {
      if (r < ra || r > rb || c < ca || c > cb) return v;
      if (v.trim()) words.push(v);
      return '';
    }),
  );
  rows[ra][ca] = words.join('\n');
  const merges = (t.merges ?? []).filter((m) => !(m.r <= rb && m.r + m.rs - 1 >= ra && m.c <= cb && m.c + m.cs - 1 >= ca));
  return { ...t, rows, merges: [...merges, { r: ra, c: ca, rs: rb - ra + 1, cs: cb - ca + 1 }] };
}

/** The merged block a cell is in, split back into its cells. */
export function unmergeCell(t: TableEl, r: number, c: number): TableEl {
  const m = mergeAt(t, r, c);
  if (!m) return t;
  const merges = (t.merges ?? []).filter((x) => x !== m);
  const { merges: _m, ...rest } = t;
  return merges.length ? { ...rest, merges } : rest;
}

/** A block of cells given a fill of their own (none: back to the table's). */
export function fillCells(t: TableEl, r0: number, c0: number, r1: number, c1: number, fill: string | undefined): TableEl {
  const fills = { ...(t.fills ?? {}) };
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
    for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) {
      if (fill) fills[`${r},${c}`] = fill;
      else delete fills[`${r},${c}`];
    }
  const { fills: _f, ...rest } = t;
  return Object.keys(fills).length ? { ...rest, fills } : rest;
}

/** Rows or columns removed from a table: merges and fills that were in them go, those after move up or left. */
export function dropMergesPast(t: TableEl): TableEl {
  const rows = t.rows.length;
  const cols = Math.max(1, ...t.rows.map((r) => r.length));
  const merges = (t.merges ?? []).filter((m) => m.r + m.rs <= rows && m.c + m.cs <= cols);
  const fills = Object.fromEntries(Object.entries(t.fills ?? {}).filter(([k]) => Number(k.split(',')[0]) < rows && Number(k.split(',')[1]) < cols));
  const { merges: _m, fills: _f, ...rest } = t;
  return { ...rest, ...(merges.length ? { merges } : {}), ...(Object.keys(fills).length ? { fills } : {}) };
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
  if (e.type === 'code') return e.lang ? `Code: ${e.lang}` : 'Code';
  if (e.type === 'html') return 'Custom code';
  if (e.type === 'embed') return 'Web page';
  if (e.type === 'quiz') return e.question ? `Quiz: ${e.question.length > 24 ? `${e.question.slice(0, 23)}…` : e.question}` : 'Quiz';
  if (e.type === 'score') return 'Quiz score';
  if (e.type === 'scene3d') return '3D';
  if (e.route === 'elbow') return 'Elbow connector';
  if (e.from || e.to) return 'Connector';
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

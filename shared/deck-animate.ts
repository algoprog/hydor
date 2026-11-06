// Animating a whole deck in one click, as Canva's Magic Animate does. Every slide's parts come in in an order that
// reads: the title first (its accent bar with it, the subtitle just after), then the words, a row at a time from the top
// (bullets one by one, cards one after another with their words, numbers counting up in a web deck), then the
// pictures, charts, tables and the rest. Transitions suit the slides: Morph between slides that share parts (the
// shared parts glide into place rather than come in again), else the style's own. Three styles: Subtle (fades),
// Lively (things rise, bars wipe in, lines draw) and Bold (things drop, pop and flip; cube turns between slides); a web
// deck gets the web format's effects, a PowerPoint compatible one only PowerPoint's. Everything plays by itself as its
// slide comes, so the slideshow takes no more clicks than before; effects that run when a part is clicked (an answer
// shown on a click) are kept. "none" takes every animation and transition off. Pure functions of the deck, for the
// editor's Animate tab and for agents (save_slides).
import { everyEl, isWebDeck, newId, plainText, slideH, SLIDE_LIMITS, SLIDE_W, turnedBox, type Anim, type AnimFx, type Deck, type Dir, type Ease, type El, type Slide, type Transition, type TransitionFx } from './slides.ts';

export type AnimateStyle = 'subtle' | 'lively' | 'bold';
export const ANIMATE_STYLES: AnimateStyle[] = ['subtle', 'lively', 'bold'];

/** What a part is, for the order it comes in and the effect it gets. */
type Kind = 'title' | 'subtitle' | 'decor' | 'words' | 'list' | 'number' | 'card' | 'picture' | 'chart' | 'table' | 'icon' | 'line' | 'media';

interface Fx {
  fx: AnimFx;
  dir?: Dir;
  dur: number;
  ease?: Ease;
}

interface Style {
  /** Each kind's effect in a web deck, and in a PowerPoint compatible one. */
  web: Record<Kind, Fx>;
  ppt: Record<Kind, Fx>;
  /** How long after one another the parts of a row start. */
  gap: number;
  /** The transition between slides that share no parts. */
  tr: { web: TransitionFx; ppt: TransitionFx; dir?: Dir; dur: number };
}

const all = (f: Fx): Record<Kind, Fx> => ({ title: f, subtitle: f, decor: f, words: f, list: f, number: f, card: f, picture: f, chart: f, table: f, icon: f, line: f, media: f });

const fade = (dur: number): Fx => ({ fx: 'fade', dur });

const SUBTLE: Record<Kind, Fx> = { ...all(fade(500)), title: fade(600), list: fade(400), decor: fade(400), picture: fade(700), chart: fade(600), icon: fade(400), line: fade(400) };

export const STYLES: Record<AnimateStyle, Style> = {
  subtle: { web: SUBTLE, ppt: SUBTLE, gap: 120, tr: { web: 'fade', ppt: 'fade', dur: 500 } },
  lively: {
    web: {
      title: { fx: 'rise', dur: 700 },
      subtitle: { fx: 'rise', dur: 600 },
      decor: { fx: 'wipe', dir: 'left', dur: 500 },
      words: { fx: 'rise', dur: 500 },
      list: { fx: 'rise', dur: 450 },
      number: { fx: 'count', dur: 1200 },
      card: { fx: 'pop', dur: 500, ease: 'spring' },
      picture: { fx: 'blur', dur: 700 },
      chart: { fx: 'wipe', dir: 'left', dur: 800 },
      table: { fx: 'rise', dur: 600 },
      icon: { fx: 'draw', dur: 900 },
      line: { fx: 'draw', dur: 800 },
      media: { fx: 'rise', dur: 600 },
    },
    ppt: {
      title: { fx: 'float', dir: 'up', dur: 600 },
      subtitle: { fx: 'float', dir: 'up', dur: 500 },
      decor: { fx: 'wipe', dir: 'left', dur: 400 },
      words: { fx: 'float', dir: 'up', dur: 500 },
      list: { fx: 'float', dir: 'up', dur: 450 },
      number: { fx: 'zoom', dur: 500 },
      card: { fx: 'zoom', dur: 500 },
      picture: { fx: 'zoom', dur: 600 },
      chart: { fx: 'wipe', dir: 'left', dur: 800 },
      table: { fx: 'float', dir: 'up', dur: 500 },
      icon: { fx: 'zoom', dur: 400 },
      line: { fx: 'wipe', dir: 'left', dur: 500 },
      media: { fx: 'float', dir: 'up', dur: 500 },
    },
    gap: 150,
    tr: { web: 'push', ppt: 'push', dir: 'right', dur: 600 },
  },
  bold: {
    web: {
      title: { fx: 'drop', dur: 800, ease: 'bounce' },
      subtitle: { fx: 'blur', dur: 600 },
      decor: { fx: 'wipe', dir: 'left', dur: 500 },
      words: { fx: 'swing', dur: 700 },
      list: { fx: 'fly', dir: 'left', dur: 500, ease: 'spring' },
      number: { fx: 'count', dur: 1400 },
      card: { fx: 'flip', dur: 700, ease: 'spring' },
      picture: { fx: 'pop', dur: 600, ease: 'spring' },
      chart: { fx: 'wipe', dir: 'down', dur: 900 },
      table: { fx: 'flip', dur: 700 },
      icon: { fx: 'pop', dur: 500, ease: 'spring' },
      line: { fx: 'draw', dur: 800 },
      media: { fx: 'pop', dur: 600, ease: 'spring' },
    },
    ppt: {
      title: { fx: 'bounce', dur: 900 },
      subtitle: { fx: 'fade', dur: 500 },
      decor: { fx: 'wipe', dir: 'left', dur: 400 },
      words: { fx: 'fly', dir: 'left', dur: 500 },
      list: { fx: 'fly', dir: 'left', dur: 450 },
      number: { fx: 'zoom', dur: 500 },
      card: { fx: 'zoom', dur: 500 },
      picture: { fx: 'zoom', dur: 600 },
      chart: { fx: 'wipe', dir: 'down', dur: 800 },
      table: { fx: 'zoom', dur: 500 },
      icon: { fx: 'zoom', dur: 400 },
      line: { fx: 'wipe', dir: 'left', dur: 500 },
      media: { fx: 'zoom', dur: 500 },
    },
    gap: 180,
    tr: { web: 'cube', ppt: 'zoom', dir: 'right', dur: 900 },
  },
};

// ---- what is on a slide ------------------------------------------------------------------------------------------

const words = (e: El) => (e.type === 'text' || e.type === 'shape' ? plainText(e.paras).trim() : '');

/** Words that are a number to count up to: 42, 3.5k, 98%, $1.2M, +17 (not a step's 1, 2, 3). */
export function isNumber(text: string): boolean {
  const s = text.replace(/\s+/g, ' ').trim();
  const m = /^[+−-]?[$€£¥]?\s?(\d[\d.,]*)\s?(%|[kKmMbB]n?|x|×|\+)?$/.exec(s);
  if (!m) return false;
  // A year is a name for a time, not an amount.
  if (!m[2] && /^(1[5-9]|20)\d\d$/.test(s)) return false;
  return Number(m[1].replace(/,/g, '')) >= 10 || !!m[2] || m[1].includes('.') || /[$€£¥]/.test(s);
}

interface Item {
  el: El;
  kind: Kind;
  box: { x: number; y: number; w: number; h: number };
  /** Parts that come in with it (a card's words, a number's label). */
  with: El[];
}

const contains = (a: Item['box'], b: Item['box']) => {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h;
};

/** How much of the smaller of two spans the two share (0–1). */
const shared = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));

/** A part's kind; null for one that stays as it is (a background, an empty box, a picture still to be picked). */
function kindOf(e: El, H: number): Kind | null {
  const b = turnedBox(e);
  // A background: a part as large as the slide, behind the rest.
  if (b.w * b.h >= SLIDE_W * H * 0.85 && (e.type === 'image' || (e.type === 'shape' && !words(e)))) return null;
  switch (e.type) {
    case 'text':
    case 'shape': {
      const w = words(e);
      if (!w) return e.type === 'shape' ? (b.w <= 24 || b.h <= 24 || b.w * b.h < SLIDE_W * H * 0.012 ? 'decor' : 'card') : null;
      if (e.role === 'title') return 'title';
      if (e.role === 'subtitle') return 'subtitle';
      if (isNumber(w)) return 'number';
      return e.paras.filter((p) => p.runs.some((r) => r.t.trim())).length > 1 ? 'list' : 'words';
    }
    case 'image':
      return e.src ? 'picture' : null;
    case 'chart':
      return 'chart';
    case 'table':
      return 'table';
    case 'icon':
      return 'icon';
    case 'line':
      return Math.abs(e.w) + Math.abs(e.h) < 2 ? null : 'line';
    case 'group':
      return everyEl(e.els).some((x) => !!words(x)) ? 'card' : 'media';
    default:
      return 'media';
  }
}

const WORDY: Kind[] = ['words', 'list', 'number', 'card', 'decor'];

/** Items in rows: parts side by side (sharing most of their height) in a row, rows from the top, each left to right. */
function rows(items: Item[]): Item[][] {
  const out: Item[][] = [];
  for (const it of items.slice().sort((a, b) => a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2))) {
    const row = out.find((r) => r.some((o) => shared(o.box.y, o.box.y + o.box.h, it.box.y, it.box.y + it.box.h) >= 0.5));
    if (row) row.push(it);
    else out.push([it]);
  }
  for (const r of out) r.sort((a, b) => a.box.x - b.box.x);
  return out.sort((a, b) => Math.min(...a.map((x) => x.box.y)) - Math.min(...b.map((x) => x.box.y)));
}

// ---- Morph --------------------------------------------------------------------------------------------------------

/** What Morph knows a part by besides its id: its words, picture, icon, equation, video, chart or table (not a bare shape). */
function sig(e: El): string {
  if (e.type === 'text' || e.type === 'shape') return words(e) ? `w:${words(e)}` : '';
  if (e.type === 'image') return e.src ? `i:${e.src}` : '';
  if (e.type === 'icon') return `c:${e.icon}`;
  if (e.type === 'math') return `m:${e.tex}`;
  if (e.type === 'video') return `v:${e.src}`;
  if (e.type === 'chart') return `h:${e.kind}:${e.title ?? ''}`;
  if (e.type === 'table') return `t:${(e.rows[0] ?? []).join('|')}`;
  return '';
}

/**
 * The parts of slide `b` that Morph glides from slide `a` (as the slideshow pairs them: the same part copied, by its
 * key or id; the same name; the same words or picture), leaving out bare shapes, which every slide of a layout shares.
 */
export function morphShared(a: Slide | undefined, b: Slide): Set<string> {
  const left = (a?.els ?? []).slice();
  const out = new Set<string>();
  const take = (test: (x: El) => boolean) => {
    const i = left.findIndex(test);
    return i < 0 ? null : left.splice(i, 1)[0];
  };
  const mk = (e: El) => e.key || e.id;
  const rest: El[] = [];
  for (const e of b.els) {
    const m = take((x) => mk(x) === mk(e));
    if (m && (sig(e) || e.type === 'group')) out.add(e.id);
    else if (!m) rest.push(e);
  }
  const rest2: El[] = [];
  for (const e of rest) {
    const m = e.name ? take((x) => x.type === e.type && x.name === e.name) : null;
    if (m) out.add(e.id);
    else rest2.push(e);
  }
  for (const e of rest2) {
    const g = sig(e);
    if (g && take((x) => x.type === e.type && sig(x) === g)) out.add(e.id);
  }
  return out;
}

// ---- animating ----------------------------------------------------------------------------------------------------

/** The slide shown before slide `i` in the slideshow (hidden ones are skipped). */
const shownBefore = (d: Deck, i: number) => {
  for (let k = i - 1; k >= 0; k--) if (!d.slides[k].hidden) return d.slides[k];
  return undefined;
};

/** A slide's transition as the style has it (Morph when it shares parts with the slide before), its own "go on by itself" kept. */
function transitionFor(d: Deck, i: number, style: AnimateStyle | 'none', morph: boolean): Transition | undefined {
  const auto = d.slides[i].transition?.auto;
  const keep = auto ? { auto } : {};
  if (style === 'none' || i === 0) return auto ? { fx: 'none', ...keep } : undefined;
  if (morph) return { fx: 'morph', dur: 1000, ...keep };
  const st = STYLES[style].tr;
  const fx = isWebDeck(d) ? st.web : st.ppt;
  const t: Transition = { fx, dur: st.dur, ...keep };
  if (st.dir && (fx === 'push' || fx === 'wipe' || fx === 'cover' || fx === 'cube' || fx === 'flip')) t.dir = st.dir;
  return t;
}

/** A slide of the deck animated in a style ("none": its animations taken off), its transition with it. */
export function animateSlide(d: Deck, i: number, style: AnimateStyle | 'none'): Slide {
  const s = d.slides[i];
  const before = shownBefore(d, i);
  const glide = style === 'none' || !before ? new Set<string>() : morphShared(before, s);
  const morph = glide.size > 0 && !s.hidden;
  const transition = transitionFor(d, i, style, morph);
  const out: Slide = { ...s };
  delete out.anims;
  delete out.transition;
  if (transition) out.transition = transition;
  if (style === 'none') return out;

  const web = isWebDeck(d);
  const st = STYLES[style];
  const fxOf = (k: Kind) => (web ? st.web : st.ppt)[k];
  // Effects that run when a part is clicked are the slide's own way of working (an answer shown): they stay, and the
  // parts they bring in are left to them.
  const taps = (s.anims ?? []).filter((a) => a.on === 'tap');
  const tapIn = new Set(taps.filter((a) => a.type === 'in').map((a) => a.el));
  const H = slideH(d.ratio);
  const items: Item[] = [];
  for (const e of s.els) {
    // A part that glides from the slide before is already there; one a click brings in waits for it.
    if (tapIn.has(e.id) || (morph && glide.has(e.id))) continue;
    const kind = kindOf(e, H);
    if (kind) items.push({ el: e, kind, box: turnedBox(e), with: [] });
  }
  // A card's words come in with it; a panel behind the title (or behind cards) stays where it is, under them.
  const order = (e: El) => s.els.indexOf(e);
  for (const card of items.filter((x) => x.kind === 'card' && x.el.type === 'shape')) {
    const inner = items.filter((x) => x !== card && order(x.el) > order(card.el) && contains(card.box, x.box));
    if (inner.some((x) => x.kind === 'title' || x.kind === 'subtitle' || x.kind === 'card')) {
      items.splice(items.indexOf(card), 1);
      continue;
    }
    for (const it of inner) {
      card.with.push(it.el);
      items.splice(items.indexOf(it), 1);
    }
  }
  // A number's label (just under it) comes in with the number.
  for (const num of items.filter((x) => x.kind === 'number')) {
    const label = items.find((x) => (x.kind === 'words' || x.kind === 'list') && x.box.y >= num.box.y + num.box.h - 8 && x.box.y - (num.box.y + num.box.h) < 60 && shared(num.box.x, num.box.x + num.box.w, x.box.x, x.box.x + x.box.w) >= 0.6);
    if (label) {
      num.with.push(label.el);
      items.splice(items.indexOf(label), 1);
    }
  }
  // A shape that holds no words after all is a bare shape: it comes in as a picture does.
  for (const it of items) if (it.kind === 'card' && !it.with.length && it.el.type === 'shape') it.kind = 'media';

  const anims: Anim[] = [];
  const add = (el: El, k: Kind, on: Anim['on'], delay: number, byPara = false) => {
    const f = fxOf(k);
    // Numbers count up, lines draw: only on the parts that can (the web format's effects suit some parts alone).
    let fx = f.fx;
    if (fx === 'count' && !(el.type === 'text' || el.type === 'shape')) fx = 'fade';
    if (fx === 'draw' && !(el.type === 'line' || el.type === 'shape' || el.type === 'icon')) fx = 'fade';
    const a: Anim = { id: newId(), el: el.id, type: 'in', fx, on, dur: f.dur, delay: Math.round(delay) };
    if (f.dir) a.dir = f.dir;
    if (web && f.ease) a.ease = f.ease;
    if (byPara) a.byPara = true;
    anims.push(a);
  };

  // The title, its bar or line, and its subtitle: what plays as the slide comes.
  const title = items.find((x) => x.kind === 'title');
  const head: Item[] = [];
  if (title) {
    head.push(title);
    for (const it of items.filter((x) => (x.kind === 'decor' || x.kind === 'line') && Math.min(Math.abs(x.box.y - (title.box.y + title.box.h)), Math.abs(title.box.y - (x.box.y + x.box.h))) < 120)) head.push(it);
    for (const it of items.filter((x) => x.kind === 'subtitle')) head.push(it);
  }
  head.forEach((it, k) => {
    add(it.el, it.kind === 'line' ? 'decor' : it.kind, 'with', k === 0 ? 0 : k * st.gap + (it.kind === 'subtitle' ? fxOf('title').dur * 0.4 : 0));
    for (const w of it.with) add(w, 'words', 'with', k * st.gap + 100);
  });
  const rest = items.filter((x) => !head.includes(x));
  // Then the words a row at a time, then the pictures, charts and the rest.
  for (const row of [...rows(rest.filter((x) => WORDY.includes(x.kind))), ...rows(rest.filter((x) => !WORDY.includes(x.kind)))]) {
    // A row with bullets in it comes a part at a time (bullets one by one, each after the one before).
    const listRow = row.some((x) => x.kind === 'list');
    row.forEach((it, k) => {
      const first = anims.length === 0;
      if (it.kind === 'list') add(it.el, 'list', 'after', 0, true);
      else if (listRow || k === 0) add(it.el, it.kind, first ? 'with' : 'after', 0);
      else add(it.el, it.kind, 'with', k * st.gap);
      // A card's words just after it, a number's label as it counts.
      const at = listRow || k === 0 ? 0 : k * st.gap;
      it.with.forEach((w, j) => add(w, kindOf(w, H) === 'list' ? 'words' : (kindOf(w, H) ?? 'words'), 'with', at + 100 + j * 60));
    });
  }
  const list = [...anims.slice(0, SLIDE_LIMITS.anims - Math.min(taps.length, SLIDE_LIMITS.anims)), ...taps];
  if (list.length) out.anims = list;
  return out;
}

/** The deck with every slide animated in a style ("none": every animation and transition taken off). */
export function animateDeck(d: Deck, style: AnimateStyle | 'none'): Deck {
  return { ...d, slides: d.slides.map((_, i) => animateSlide(d, i, style)) };
}

/** What agents are told of animating a whole deck (save_slides' "animate"). */
export const DECK_ANIMATE_HELP =
  'animate: "subtle", "lively" or "bold" animates every slide in one go, as the editor\'s Animate → Animate every slide does (the title first, then the words a row at a time with bullets one by one, numbers counting up and lines drawing in the web format, then pictures and charts; Morph between slides that share parts, else the style\'s transition; it all plays by itself as each slide comes, and effects that run when a part is clicked stay); "none" takes every animation and transition off. It replaces the slides\' own animations.';

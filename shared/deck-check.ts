// A deck's accessibility check, as PowerPoint's: slide by slide, what makes a slide hard for some people to see, read
// or follow. Pictures without a description (what a screen reader says for them), words too small to read from the
// back of a room (under 18 px), words whose colour stands out too little from what is behind them (worked out from
// their colour, the fill or the parts behind them, the slide's background and how much its picture is dimmed), slides
// without a title, a title read after other words (a screen reader reads a slide's parts in their order, back to
// front), videos that start by themselves with their sound, and tables without a header row. Each says what is wrong
// in plain words and, where it can be put right for the user, how (fixIssue does it). A pure function of the deck, so
// the editor's panel and an agent's get_page give the same list. Hidden slides are left out: nobody sees them.
import { ASSET, cssColor, everyEl, hexColor, plainText, slideH, slideTitle, turnedBox, type Deck, type El, type Para, type ShapeEl, type Slide, type TextEl, type Theme } from './slides.ts';

/** The smallest words a slide should have, in its pixels (a 1280-wide slide). */
export const MIN_TEXT = 18;

export type IssueKind = 'alt' | 'small' | 'contrast' | 'title' | 'order' | 'autoplay' | 'header';

/** The kinds in the order the panel lists them within a slide. */
export const ISSUE_KINDS: IssueKind[] = ['title', 'order', 'alt', 'contrast', 'small', 'autoplay', 'header'];

export interface DeckIssue {
  /** Its slide, from 0. */
  slide: number;
  /** The part it is about (by id, one in a group too); none for the slide itself. */
  el?: string;
  kind: IssueKind;
  /** What is wrong, in words. */
  what: string;
  /** What Fix does, in words ("Make it 18 px"); none when it cannot be done for the user. */
  fix?: string;
  /** A picture without a description: its source (a description can be written by AI from it when the app keeps it). */
  src?: string;
}

// ---- colours ----------------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

/** A colour as red, green and blue (0–255) and its opacity; null for one that is not a colour here. */
function rgbOf(c: string | undefined, t: Theme): { rgb: Rgb; a: number } | null {
  if (!c) return null;
  const css = cssColor(c, t, '');
  if (!css || css === 'transparent') return { rgb: [0, 0, 0], a: 0 };
  const h = hexColor(c, t, '');
  if (!/^[0-9A-F]{6}$/.test(h.hex)) return null;
  return { rgb: [0, 2, 4].map((i) => parseInt(h.hex.slice(i, i + 2), 16)) as Rgb, a: h.alpha };
}

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [0, 1, 2].map((i) => a[i] * k + b[i] * (1 - k)) as Rgb;

/** How light a colour is to the eye (WCAG's relative luminance). */
export function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** How much two colours stand out from each other: 1 (the same) to 21 (black on white). */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * A picture as the check counts it (it cannot see the picture): somewhere between a fairly light photo and a dark one,
 * darkened by `dim`. Light words are judged against its light end, dark words against its dark end.
 */
const PHOTO: Rgb = [200, 200, 200];
const DARK_PHOTO: Rgb = [40, 40, 40];
/** A picture's two ends, darkened by `dim`. */
const photoEnds = (dim: number): Rgb[] => [mix(PHOTO, BLACK, 1 - dim), mix(DARK_PHOTO, BLACK, 1 - dim)];
/** How far under what is needed contrast may be before it is said: the app's own themes' quiet words sit at 4.4 to 1. */
const SLACK = 0.15;
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

/** What is behind a part's words: a colour (the ends of a gradient are two), or a picture dimmed as much as it is. */
interface Behind {
  colors: Rgb[];
  /** A picture: its dim (0–0.8), and whether it is the slide's background (which can be dimmed for the user). */
  picture?: { dim: number; bg: boolean };
}

/** The slide's background: its colour or gradient, or its picture or video (dimmed as it is). */
function slideBehind(s: Slide, t: Theme): Behind {
  const b = s.bg ?? {};
  const base = rgbOf(b.color ?? 'bg', t) ?? { rgb: WHITE, a: 1 };
  const under = rgbOf(t.bg, t)?.rgb ?? WHITE;
  const c1 = base.a < 1 ? mix(base.rgb, under, base.a) : base.rgb;
  if (b.image || b.video) return { colors: [c1], picture: { dim: Math.max(0, Math.min(0.8, b.dim ?? 0)), bg: true } };
  const colors = [c1];
  if (b.to && b.color) {
    const c2 = rgbOf(b.to, t);
    if (c2) colors.push(c2.a < 1 ? mix(c2.rgb, under, c2.a) : c2.rgb);
  }
  return { colors };
}

/** Whether a part paints over what is behind it where it is (a fill, a picture, a chart…), and the colour it paints. */
function paintOf(e: El, t: Theme): { rgb?: Rgb; picture?: boolean } | null {
  if (e.type === 'image') return e.src ? { picture: true } : null;
  if (e.type === 'text' || e.type === 'shape') {
    if (e.glass) return null;
    const f = e.type === 'shape' ? (e.fill ?? 'accent') : e.fill;
    const c = rgbOf(f, t);
    if (!c || c.a < 0.6 || (e.opacity ?? 1) < 0.6) return null;
    return { rgb: c.rgb };
  }
  if (e.type === 'video' || e.type === 'html' || e.type === 'embed') return { picture: true };
  return null;
}

const inside = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** What is behind a part's words: its own fill, else the topmost part under its middle that paints, else the slide. */
function behindOf(s: Slide, list: El[], at: number, e: TextEl | ShapeEl, t: Theme): Behind {
  const own = paintOf(e, t);
  if (own?.rgb) return { colors: [own.rgb] };
  const b = turnedBox(e);
  const mid = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  for (let i = at - 1; i >= 0; i--) {
    const u = list[i];
    if (u.type === 'line' || u.type === 'group') continue;
    if (!inside(mid, turnedBox(u))) continue;
    const p = paintOf(u, t);
    if (!p) continue;
    if (p.rgb) return { colors: [p.rgb] };
    return { colors: [PHOTO], picture: { dim: 0, bg: false } };
  }
  return slideBehind(s, t);
}

/** The colours a part's words are in: its runs' own, else its own, else its kind's (titles the headings' colour). */
function inkOf(e: TextEl | ShapeEl, t: Theme): string[] {
  const role = e.role;
  const box = e.color ?? (role === 'title' || role === 'quote' ? 'head' : role === 'subtitle' || role === 'caption' ? 'muted' : 'fg');
  const out = new Set<string>();
  for (const p of e.paras) for (const r of p.runs) if (r.t.trim()) out.add(r.color ?? box);
  return [...out];
}

/** Whether words this big count as large (WCAG: 24 px, or 18.66 px in bold), which need less contrast. */
const large = (size: number, bold: boolean) => size >= 24 || (bold && size >= 18.66);

/** The contrast words need: 4.5 to 1, or 3 to 1 for large words. */
const needOf = (size: number, bold: boolean) => (large(size, bold) ? 3 : 4.5);

/** The smallest size a part's words show at (its runs' own sizes too). */
function smallestOf(e: TextEl | ShapeEl): number {
  let min = e.size;
  for (const p of e.paras) for (const r of p.runs) if (r.t.trim() && r.size) min = Math.min(min, r.size);
  return min;
}

/** Whether all of a part's words are bold. */
const allBold = (e: TextEl | ShapeEl) => !!e.bold || e.paras.every((p) => p.runs.every((r) => !r.t.trim() || r.b));

const hasWords = (e: El): e is TextEl | ShapeEl => (e.type === 'text' || e.type === 'shape') && plainText(e.paras).trim().length > 0;

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * How well a part's words stand out from what is behind them: the worst of its colours against the worst of what is
 * behind (a gradient's ends; a picture counted as a fairly light photo, darkened by its dim).
 */
function contrastOf(e: TextEl | ShapeEl, behind: Behind, t: Theme): number {
  const bgs = behind.picture ? photoEnds(behind.picture.dim) : behind.colors;
  let worst = 21;
  for (const ink of inkOf(e, t)) {
    const c = rgbOf(ink, t);
    if (!c) continue;
    for (const bg of bgs) {
      // See-through words (or a see-through part) mix with what is behind them.
      const k = c.a * (e.opacity ?? 1);
      const shown = k < 1 ? mix(c.rgb, bg, k) : c.rgb;
      worst = Math.min(worst, contrast(shown, bg));
    }
  }
  return worst;
}

/** The theme colour (or black or white) that stands out most from what is behind, for words that need `need`. */
function bestInk(behind: Behind, t: Theme, need: number, dimmed?: number): string {
  const bgs = behind.picture ? photoEnds(dimmed ?? behind.picture.dim) : behind.colors;
  const score = (c: string) => {
    const x = rgbOf(c, t);
    return x ? Math.min(...bgs.map((b) => contrast(x.rgb, b))) : 0;
  };
  for (const name of ['fg', 'head', 'bg', 'accentFg']) if (score(name) + SLACK >= need) return name;
  return score('#000000') >= score('#ffffff') ? '#000000' : '#ffffff';
}

/** How much a background picture needs dimming for light words of `need` on it (null: more than the most it may be). */
function dimFor(need: number): number | null {
  for (const d of [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) if (contrast(WHITE, mix(PHOTO, BLACK, 1 - d)) + SLACK >= need) return d;
  return null;
}

// ---- the check --------------------------------------------------------------------------------------------------

/** A file's name, or a word that says nothing of a picture: not a description. */
const blankAlt = (alt: string | undefined) => !alt || !alt.trim() || /^(image|picture|photo|img|pic|screenshot)\s*\d*$/i.test(alt.trim()) || /^[\w ()-]+\.(png|jpe?g|gif|webp|svg|heic|bmp)$/i.test(alt.trim());

/** Words as a short quote for what is wrong: “Our plan”. */
const quote = (e: TextEl | ShapeEl) => {
  const s = plainText(e.paras).replace(/\s+/g, ' ').trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
};

/** The parts of a slide in the order a screen reader reads them (back to front, a group's parts where the group is). */
const readingOrder = (s: Slide) => everyEl(s.els).filter((e) => e.type !== 'group');

/** The part a slide's title should be, when it has none: its largest words in the top part of the slide. */
function titleCandidate(s: Slide, H: number): TextEl | ShapeEl | null {
  const list = s.els.filter(hasWords).filter((e) => e.role !== 'big' || plainText(e.paras).trim().length > 6);
  const top = list.filter((e) => turnedBox(e).y < H * 0.45);
  const pool = top.length ? top : list;
  const best = pool.slice().sort((a, b) => smallestOf(b) - smallestOf(a) || turnedBox(a).y - turnedBox(b).y)[0];
  return best && smallestOf(best) >= 24 ? best : null;
}

/** Whether a part covers what is behind it (moving the title behind it would hide the title). */
const covers = (e: El, t: Theme) =>
  e.type !== 'line' && (e.type === 'image' || e.type === 'chart' || e.type === 'table' || e.type === 'video' || e.type === 'html' || e.type === 'embed' || e.type === 'quiz' || e.type === 'scene3d' || e.type === 'code' || !!paintOf(e, t));

const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where the title can move to in the slide's parts so it is read first, without a part coming over it; null: nowhere. */
function titlePlace(s: Slide, t: Theme): number | null {
  const at = s.els.findIndex((e) => hasWords(e) && e.role === 'title');
  if (at < 0) return null;
  const first = s.els.findIndex((e) => e.type !== 'line' && (hasWords(e) || e.type === 'table' || e.type === 'chart' || e.type === 'quiz' || e.type === 'group'));
  if (first < 0 || first >= at) return null;
  const tb = turnedBox(s.els[at]);
  for (let i = first; i < at; i++) if (covers(s.els[i], t) && overlap(turnedBox(s.els[i]), tb)) return null;
  return first;
}

/** Everything on one slide that makes it harder to see, read or follow. */
export function checkSlide(d: Deck, i: number): DeckIssue[] {
  const s = d.slides[i];
  if (!s || s.hidden) return [];
  const t = d.theme;
  const H = slideH(d.ratio);
  const out: DeckIssue[] = [];
  const add = (x: Omit<DeckIssue, 'slide'>) => out.push({ slide: i, ...x });

  // A title: what a screen reader announces the slide by, and what the slides are listed by.
  const title = everyEl(s.els).find((e) => (e.type === 'text' || e.type === 'shape') && e.role === 'title');
  if (!title || !hasWords(title)) {
    const c = titleCandidate(s, H);
    if (title && !hasWords(title)) add({ el: title.id, kind: 'title', what: 'Its title is empty.' });
    else if (c) add({ el: c.id, kind: 'title', what: `This slide has no title: “${quote(c)}” could be it.`, fix: 'Make it the title' });
    else add({ kind: 'title', what: 'This slide has no title.' });
  } else {
    const order = readingOrder(s);
    const before = order
      .slice(
        0,
        order.findIndex((e) => e.id === title.id),
      )
      .filter((e) => hasWords(e) || e.type === 'table' || e.type === 'chart' || e.type === 'quiz');
    if (before.length) add({ el: title.id, kind: 'order', what: 'Its title is read after other words on it.', ...(titlePlace(s, t) !== null ? { fix: 'Read the title first' } : {}) });
  }

  const top = s.els;
  const walk = (list: El[]) =>
    list.forEach((e, at) => {
      if (e.type === 'group') return walk(e.els);
      if (e.type === 'image' && e.src && blankAlt(e.alt)) add({ el: e.id, kind: 'alt', what: 'This picture has no description for people who can’t see it.', ...(e.src.startsWith(ASSET) ? { src: e.src } : {}) });
      if (e.type === 'video' && e.autoplay && !e.muted) add({ el: e.id, kind: 'autoplay', what: 'This video starts by itself, with its sound.', fix: 'Play it without sound' });
      if (e.type === 'table' && !e.head && e.rows.length > 1) add({ el: e.id, kind: 'header', what: 'This table has no header row to say what its columns hold.', fix: 'Give it a header row' });
      const small = (size: number) => add({ el: e.id, kind: 'small', what: `Words of ${r1(size)} px are hard to read: ${MIN_TEXT} px or more.`, fix: `Make them ${MIN_TEXT} px` });
      if (hasWords(e)) {
        const size = smallestOf(e);
        if (size < MIN_TEXT) small(size);
        if (!e.textFx || e.textFx === 'shadow') {
          // Words in a group are checked against their group's own parts, as they are drawn.
          const behind = behindOf(s, list === top ? top : list, at, e, t);
          const ratio = contrastOf(e, behind, t);
          const need = needOf(size, allBold(e));
          if (ratio + SLACK < need) {
            const pic = behind.picture;
            const what = pic ? 'These words may be hard to see over the picture behind them.' : `These words stand out too little from what is behind them (${Math.floor(ratio * 10) / 10} to 1; ${need} to 1 is needed).`;
            const fix = pic && pic.bg ? (dimFor(need) !== null ? 'Darken the picture and light the words' : undefined) : pic ? undefined : 'Use a colour that stands out';
            add({ el: e.id, kind: 'contrast', what, ...(fix ? { fix } : {}) });
          }
        }
      } else if (e.type === 'table' && e.size < MIN_TEXT) small(e.size);
      else if (e.type === 'chart' && e.size < MIN_TEXT && (e.labels.length || e.series.length)) small(e.size);
      else if (e.type === 'quiz' && e.size * 0.78 < MIN_TEXT) small(e.size * 0.78);
      else if ((e.type === 'score' || e.type === 'code') && e.size < MIN_TEXT) small(e.size);
    });
  walk(top);
  return out.sort((a, b) => ISSUE_KINDS.indexOf(a.kind) - ISSUE_KINDS.indexOf(b.kind));
}

/** Everything in the deck that makes it harder to see, read or follow, slide by slide. */
export function checkDeck(d: Deck): DeckIssue[] {
  return d.slides.flatMap((_, i) => checkSlide(d, i));
}

// ---- fixing what can be fixed ------------------------------------------------------------------------------------

/** A part's words made `to` px at the smallest, their own sizes in step. */
function bigger<T extends TextEl | ShapeEl>(e: T, to: number): T {
  const k = to / Math.max(1, smallestOf(e));
  const size = Math.max(to, Math.round(e.size * k * 10) / 10);
  return { ...e, size, paras: e.paras.map((p): Para => ({ ...p, runs: p.runs.map((r) => (r.size ? { ...r, size: Math.max(to, Math.round(r.size * k * 10) / 10) } : r)) })) };
}

/** A part's words in one colour (its runs' own colours taken off). */
const inked = <T extends TextEl | ShapeEl>(e: T, color: string): T => ({ ...e, color, paras: e.paras.map((p) => ({ ...p, runs: p.runs.map(({ color: _c, ...r }) => r) })) });

/** The deck with one part of a slide changed (one in a group too). */
function setPart(d: Deck, i: number, id: string, f: (e: El) => El): Deck {
  const map = (list: El[]): El[] => list.map((e) => (e.id === id ? f(e) : e.type === 'group' ? { ...e, els: map(e.els) } : e));
  return { ...d, slides: d.slides.map((s, k) => (k === i ? { ...s, els: map(s.els) } : s)) };
}

/** A part made a slide's title, looking as it did (its font, colour and line height kept as they were drawn). */
function asTitle(e: TextEl | ShapeEl): TextEl | ShapeEl {
  const color = e.color ?? (e.role === 'subtitle' || e.role === 'caption' ? 'muted' : e.role === 'quote' ? 'head' : 'fg');
  const font = e.font ?? (e.role === 'quote' || e.role === 'big' ? 'head' : 'body');
  return { ...e, role: 'title', color, font, lh: e.lh ?? (e.role === 'title' ? 1.1 : 1.2) };
}

/** The deck with an issue put right, where it can be; the same deck where it cannot (or it is no longer there). */
export function fixIssue(d: Deck, x: DeckIssue): Deck {
  const s = d.slides[x.slide];
  if (!s || !x.fix) return d;
  const t = d.theme;
  switch (x.kind) {
    case 'title':
      return x.el ? setPart(d, x.slide, x.el, (e) => (e.type === 'text' || e.type === 'shape' ? asTitle(e) : e)) : d;
    case 'order': {
      const to = titlePlace(s, t);
      const at = s.els.findIndex((e) => hasWords(e) && e.role === 'title');
      if (to === null || at < 0) return d;
      const els = s.els.slice();
      const [title] = els.splice(at, 1);
      els.splice(to, 0, title);
      return { ...d, slides: d.slides.map((y, k) => (k === x.slide ? { ...y, els } : y)) };
    }
    case 'autoplay':
      return x.el ? setPart(d, x.slide, x.el, (e) => (e.type === 'video' ? { ...e, muted: true } : e)) : d;
    case 'header':
      return x.el ? setPart(d, x.slide, x.el, (e) => (e.type === 'table' ? { ...e, head: true } : e)) : d;
    case 'small':
      return x.el
        ? setPart(d, x.slide, x.el, (e) => {
            if (e.type === 'text' || e.type === 'shape') return bigger(e, MIN_TEXT);
            if (e.type === 'table' || e.type === 'chart' || e.type === 'score' || e.type === 'code') return { ...e, size: Math.max(e.size, MIN_TEXT) };
            if (e.type === 'quiz') return { ...e, size: Math.max(e.size, Math.ceil(MIN_TEXT / 0.78)) };
            return e;
          })
        : d;
    case 'contrast': {
      if (!x.el) return d;
      // Where the part is, as it is drawn (a group's parts against their group's).
      const find = (list: El[]): { list: El[]; at: number } | null => {
        for (const [at, e] of list.entries()) {
          if (e.id === x.el) return { list, at };
          if (e.type === 'group') {
            const got = find(e.els);
            if (got) return got;
          }
        }
        return null;
      };
      const got = find(s.els);
      const e = got?.list[got.at];
      if (!got || !e || (e.type !== 'text' && e.type !== 'shape')) return d;
      const behind = behindOf(s, got.list, got.at, e, t);
      const need = needOf(smallestOf(e), allBold(e));
      if (behind.picture) {
        const dim = behind.picture.bg ? dimFor(need) : null;
        if (dim === null) return d;
        const lit = setPart(d, x.slide, x.el, (p) => (p.type === 'text' || p.type === 'shape' ? inked(p, bestInk(behind, t, need, dim)) : p));
        return { ...lit, slides: lit.slides.map((y, k) => (k === x.slide ? { ...y, bg: { ...(y.bg ?? {}), dim: Math.max(dim, y.bg?.dim ?? 0) } } : y)) };
      }
      return setPart(d, x.slide, x.el, (p) => (p.type === 'text' || p.type === 'shape' ? inked(p, bestInk(behind, t, need)) : p));
    }
    default:
      return d;
  }
}

/** The deck with every issue that can be fixed put right (each slide's found again after each fix: one may change another). */
export function fixAll(d: Deck): { deck: Deck; fixed: number } {
  let deck = d;
  let fixed = 0;
  for (let i = 0; i < deck.slides.length; i++)
    for (let guard = 0; guard < 50; guard++) {
      const next = checkSlide(deck, i).find((x) => x.fix && fixIssue(deck, x) !== deck);
      if (!next) break;
      deck = fixIssue(deck, next);
      fixed++;
    }
  return { deck, fixed };
}

/** What get_page tells an agent of a deck's accessibility: a line per issue (its slide, its part), or '' when there are none. */
export function deckCheckText(d: Deck): string {
  const list = checkDeck(d);
  if (!list.length) return '';
  const lines = list.map((x) => `- slide ${x.slide + 1}${slideTitle(d.slides[x.slide]) ? ` (“${slideTitle(d.slides[x.slide]).slice(0, 40)}”)` : ''}${x.el ? `, part ${x.el}` : ''}: ${x.what}`);
  return `Accessibility (${list.length} to look at, as the editor's Tools → Check accessibility lists them):\n${lines.join('\n')}\nPut them right when you change the deck: a description (alt) on each picture, words of ${MIN_TEXT} px or more, colours that stand out from what is behind them (dim a background picture under words), a title on each slide (role "title"), read first (before other words in the slide's parts), videos that start by themselves muted, tables with a header row.`;
}

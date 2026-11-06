// Design ideas for a slide, as PowerPoint Designer and Canva's Magic Design give them: the slide's own words, pictures
// and data laid out anew, a few ways at once (a picture behind the words, a split, a big number, cards, steps, a
// statement…), each in the deck's theme. The ways are picked to suit what the slide holds (a picture-led one only for a
// slide with a picture), and More ideas asks for others. The writer (writer.ts: the helper model the user picked, else
// Claude's Sonnet) draws each up as the slide's parts, told the slide model in the words save_slides gives agents; what
// it answers is checked as any deck is (normalizeDeck), then held to the slide: its pictures only (by their kept
// sources), its charts' and tables' data and its live parts as they were (put back by their ids), no number or name
// that was not on it, nothing of it left out, every part on the slide, no words under 18 px. Parts that stay the same
// keep their ids, so their animations, comments and Morph stay with them; the slide keeps its id, notes, transition
// and comments. An idea that does not hold is asked for once more, saying why; one that still does not is left out.
import { everyEl, isWebDeck, newId, normalizeDeck, plainText, slideH, SLIDE_W, slideTitle, turnedBox, type Deck, type El, type Slide } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import { lucideIcon, SAVE_SLIDES_DESCRIPTION } from '../pages/slides.ts';

// ---- the slide model, as save_slides tells agents ----------------------------------------------------------------

/** The part of save_slides' description from `start` up to `end` ('' when it is not there: the words below stand in). */
function helpPart(start: string, end: string): string {
  const h = SAVE_SLIDES_DESCRIPTION;
  const a = h.indexOf(start);
  if (a < 0) return '';
  const b = h.indexOf(end, a + start.length);
  return h.slice(a, b < 0 ? undefined : b).trim();
}

/** What the writer is told of the slide model: save_slides' own words for slides, words, parts, looks and colours. */
export function modelHelp(web: boolean): string {
  const parts = [
    helpPart('Slides are 1280', 'Each slide comes from') || 'Slides are 1280×720 px; text sizes are px too.',
    helpPart('Words (text, left', 'Parts: {type') || 'Words: a line per paragraph, "- " for a bullet, **bold**, *italic*.',
    helpPart('Parts: {type', 'The web format’s own parts') ||
      'Parts: {type, x, y, w, h, …}: text {text, size, color, font, bold, align, valign, fill, role: title|subtitle|body|caption|quote|big}, shape {shape, fill, radius, text}, image {src, fit, radius, crop}, line, table, chart, icon {icon: a Lucide name}, group {els}.',
    web ? helpPart('Web looks:', 'Colours:') : '',
    helpPart('Colours:', 'A slide may also') || 'Colours: the theme’s names (accent, accentFg, fg, head, muted, bg, soft, c1 to c6), or #hex.',
    'A slide’s bg: a colour; {color, to, angle} for a gradient; {image: one of its pictures’ src, dim: 0 to 0.8, darkening it under words}.',
  ];
  return parts.filter(Boolean).join('\n');
}

// ---- the ways a slide can be laid out ------------------------------------------------------------------------------

/** What a slide holds, for the ways that suit it. */
export interface Holds {
  words: number;
  /** Its points: paragraphs of its body words, or its text parts beside the title. */
  points: number;
  pictures: number;
  charts: number;
  tables: number;
  number: boolean;
  quote: boolean;
}

export function holdsOf(s: Slide): Holds {
  const all = everyEl(s.els);
  const texts = all.filter((e) => (e.type === 'text' || e.type === 'shape') && plainText(e.paras).trim());
  const body = texts.filter((e) => (e as { role?: string }).role !== 'title');
  const paras = body.reduce((n, e) => n + (e.type === 'text' || e.type === 'shape' ? e.paras.filter((p) => p.runs.some((r) => r.t.trim())).length : 0), 0);
  const text = texts.map((e) => (e.type === 'text' || e.type === 'shape' ? plainText(e.paras) : '')).join(' ');
  return {
    words: text.split(/\s+/).filter(Boolean).length,
    points: Math.max(paras, body.length),
    pictures: all.filter((e) => e.type === 'image' && e.src).length + (s.bg?.image ? 1 : 0),
    charts: all.filter((e) => e.type === 'chart').length,
    tables: all.filter((e) => e.type === 'table').length,
    number: /(^|\s)[$€£¥]?\d[\d.,]*\s?(%|[kKmMbB]n?|x|×)?(\s|$)/.test(text),
    quote: texts.some((e) => (e as { role?: string }).role === 'quote') || /^\s*[“"«]/.test(text),
  };
}

export interface Way {
  /** Its id; its name under its picture in the panel is IDEA_WAYS'. */
  id: string;
  fits(h: Holds): boolean;
  /** What the writer is asked to do. */
  ask: string;
}

export const WAYS: Way[] = [
  {
    id: 'picture-behind',
    fits: (h) => h.pictures === 1 && h.words <= 70,
    ask: 'Put the picture behind the whole slide (bg: {image: its src, dim: 0.35 to 0.55}, and no image part for it), the words over it in a light colour (accentFg, or #ffffff), large and clear, gathered on one side.',
  },
  {
    id: 'big-number',
    fits: (h) => h.number && h.words <= 80,
    ask: 'Make the slide’s key number its hero: very large (role big, 120 to 200 px, bold, in the accent colour), what it means as a short label beside or under it, the rest of the words smaller.',
  },
  {
    id: 'split',
    fits: (h) => h.pictures + h.charts + h.tables >= 1 && h.words > 0,
    ask: 'Split the slide in two: the picture (or the chart, or the table) fills one half from edge to edge (full height, no margin; a picture with fit cover), the words on the other half with generous space.',
  },
  {
    id: 'cards',
    fits: (h) => h.points >= 2 && h.points <= 6,
    ask: 'Put each point on a card of its own (a shape: round, fill soft, radius 16 to 24, no line) in a row, or a grid of two rows for four or more, its words on the card (in parts of their own over it): a short lead in bold where the point has one, and a Lucide icon at the top of each card where one fits the point.',
  },
  {
    id: 'steps',
    fits: (h) => h.points >= 3 && h.points <= 6,
    ask: 'Show the points as steps along a line: a thin line across the slide, a numbered circle on it for each point (shape ellipse, fill accent, its number in accentFg), each point’s words under its circle.',
  },
  {
    id: 'statement',
    fits: (h) => h.words <= 35 && h.pictures + h.charts + h.tables === 0,
    ask: 'Make it one bold statement: the slide’s background the accent colour (bg: {color: "accent"}), its main words very large in accentFg with lots of space around them, anything else small beneath.',
  },
  {
    id: 'band',
    fits: (h) => h.words > 0,
    ask: 'A band of colour down the left third of the slide (a rect from the top to the bottom, fill accent or soft), the title in it (in accentFg on accent); the rest to its right.',
  },
  {
    id: 'columns',
    fits: (h) => h.points >= 2 && h.points <= 6,
    ask: 'Lay the points out in two or three columns under the title, each with a short accent line or a Lucide icon above it and its lead in bold.',
  },
  {
    id: 'picture-grid',
    fits: (h) => h.pictures >= 2,
    ask: 'Lay the pictures out as a tidy grid of tiles of the same size (radius 12, fit cover), their words as short captions under them, the title above.',
  },
  {
    id: 'chart-first',
    fits: (h) => h.charts + h.tables >= 1,
    ask: 'Make the chart (or the table) large and clear, the title above it, and any other words as a short note beside it on a soft card.',
  },
  {
    id: 'quote',
    fits: (h) => h.quote && h.words <= 60,
    ask: 'Make the words a large quote: a big quotation mark in the accent colour, the words in italic at 40 to 54 px, who said it under them in muted.',
  },
  {
    id: 'magazine',
    fits: (h) => h.pictures >= 1 && h.words <= 90,
    ask: 'Like a magazine page: the picture large and cropped tight, taking two thirds of the slide, the title in large type overlapping its edge on a soft card, the other words in a narrow column.',
  },
  {
    id: 'centred',
    fits: () => true,
    ask: 'Centre everything: the title large in the middle, a short accent line under it, the other words beneath in a narrower column, centred.',
  },
];

/** The ways to ask for: those that suit the slide, in their order, less those already shown (then again, if none are left). */
export function waysFor(s: Slide, count: number, avoid: string[]): Way[] {
  const h = holdsOf(s);
  const fit = WAYS.filter((w) => w.fits(h));
  const fresh = fit.filter((w) => !avoid.includes(w.id));
  const out = fresh.slice(0, count);
  for (const w of fit) if (out.length < count && !out.includes(w)) out.push(w);
  return out;
}

// ---- what the writer is told ---------------------------------------------------------------------------------------

/** A part as the writer sees it: what is long and must stay as it is (code, a page, an icon's lines) said in a few words. */
function shown(e: El): Record<string, unknown> {
  const { ...o } = e as unknown as Record<string, unknown>;
  if (e.type === 'html') o.html = `[custom code, ${e.html.length} characters, kept as it is]`;
  if (e.type === 'code') o.code = `[code, ${e.code.split('\n').length} lines, kept as it is]`;
  if (e.type === 'icon') delete o.paths;
  if (e.type === 'group') o.els = e.els.map(shown);
  return o;
}

export const IDEAS_SYSTEM = [
  'You are a presentation designer, as PowerPoint Designer and Canva’s Magic Design are: you lay one slide out anew, keeping everything on it.',
  'Keep its content exactly: the same words (you may drop a few words to shorten a line, split a paragraph over parts, or move words between parts, but never add facts, numbers, names, claims or words of your own beyond a short label such as “Step 1”), the same pictures (their src exactly as given; a picture may grow, be cropped, sit beside the words or become the slide’s background), its charts and tables with their data as they are, and its other parts (custom code, videos, quizzes, equations, code) as they are: keep their ids and fields, you may move and size them.',
  'Keep each part’s id when you keep the part (its words or picture), so its animations and comments stay with it; new parts (cards, lines, icons) take new ids.',
  'Design well: a clear visual hierarchy (a title that stands out, then the rest), generous margins (at least 48 px from the slide’s edges), parts lined up on a few edges, nothing overlapping unless it is meant to (words on a card or over a dimmed picture), text never under 20 px (titles 40 to 64, body 22 to 30), at most a few colours, all the theme’s by name (accent, soft, head, muted, fg, bg, accentFg, c1 to c6), fonts "head" or "body".',
  'Answer with JSON only, no words around it: {"bg": the slide’s background or null, "els": [the slide’s parts, back to front]}.',
].join(' ');

/** What the writer is asked: the deck's look, the slide as it is, and the way to lay it out. */
export function ideaPrompt(d: Deck, i: number, way: Way, problem?: string): string {
  const s = d.slides[i];
  const H = slideH(d.ratio);
  const others = d.slides
    .map((x, k) => (k === i ? null : `${k + 1}. ${slideTitle(x) || '(no title)'}`))
    .filter(Boolean)
    .slice(0, 30)
    .join('\n');
  return [
    `The deck: ${d.slides.length} slides of ${SLIDE_W}×${H} px, ${isWebDeck(d) ? 'in the web format' : 'PowerPoint compatible (only PowerPoint’s parts and looks)'}. Its theme: ${JSON.stringify(d.theme)}.`,
    others ? `Its other slides, for the look and the sense:\n${others}` : '',
    `The slide to lay out anew (slide ${i + 1}):\n${JSON.stringify({ bg: s.bg ?? null, els: s.els.map(shown) })}`,
    `The way to lay it out: ${way.ask}`,
    problem ? `Your last design did not hold: ${problem} Lay it out again, keeping everything on the slide.` : '',
    `How slides are written:\n${modelHelp(isWebDeck(d))}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---- holding an idea to the slide ------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The first JSON object in a model's answer (code fences and words around it left out), or null. */
export function jsonOf(raw: string): Obj | null {
  const s = raw.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return isObj(v) ? v : null;
  } catch {
    return null;
  }
}

/** Words as the check counts them: small letters, numbers as their digits. */
const tokens = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu) ?? [];
const numbers = (text: string) => (text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, '').replace(/,/g, ''));
/** A word's stem, so "grew" and "growth" are not the same but "points" and "point" are. */
const stem = (w: string) => w.replace(/['’]s$/, '').replace(/(ies|es|s|ed|ing|ly)$/, '');

/** The words a slide shows: its parts' words, its tables' cells, its charts' titles, labels and series' names, its quizzes' (not its pictures' descriptions, which do not show). */
export function visibleWords(els: El[]): string {
  const out: string[] = [];
  for (const e of everyEl(els)) {
    if (e.type === 'text' || e.type === 'shape') out.push(plainText(e.paras));
    else if (e.type === 'table') out.push(e.rows.flat().join(' '));
    else if (e.type === 'chart') out.push([e.title ?? '', ...e.labels, ...e.series.map((x) => x.name)].join(' '));
    else if (e.type === 'quiz') out.push([e.question, ...e.choices.map((c) => c.text), e.explain ?? ''].join(' '));
    else if (e.type === 'score') out.push(e.text ?? '');
  }
  return out.join('\n');
}

/** What a part holds, to tell the same part in another place: its words, picture, data or code. */
function contentKey(e: El): string {
  switch (e.type) {
    case 'text':
    case 'shape':
      return plainText(e.paras).trim() ? `w:${plainText(e.paras).replace(/\s+/g, ' ').trim().toLowerCase()}` : '';
    case 'image':
      return e.src ? `i:${e.src}` : '';
    case 'chart':
      return `h:${JSON.stringify([e.labels, e.series.map((x) => x.values)])}`;
    case 'table':
      return `t:${JSON.stringify(e.rows)}`;
    case 'icon':
      return `c:${e.icon}`;
    case 'math':
      return `m:${e.tex}`;
    case 'video':
      return `v:${e.src}`;
    case 'code':
      return `k:${e.code}`;
    case 'embed':
      return `e:${e.url}`;
    case 'quiz':
      return `q:${e.question}`;
    default:
      return '';
  }
}

/** The fields of a part that are its content and stay as they were (put back by its id): the rest the idea may change. */
const KEPT: Partial<Record<El['type'], string[]>> = {
  html: ['html', 'poster', 'interactive'],
  code: ['code', 'lang', 'highlight', 'lineNumbers'],
  quiz: ['question', 'choices', 'explain', 'multi'],
  score: ['text'],
  video: ['src', 'poster', 'start', 'autoplay', 'muted', 'loop'],
  embed: ['url', 'poster', 'interactive'],
  scene3d: ['model', 'shape', 'text', 'poster', 'material', 'light', 'spin', 'orbit'],
  math: ['tex'],
  chart: ['labels', 'series'],
  table: ['rows', 'merges'],
  image: ['src', 'adjust', 'alt', 'flipH', 'flipV'],
};

/** Parts only the slide's own may be (an idea that brings one in has made it up). */
const OWN_ONLY = new Set<El['type']>(['html', 'code', 'quiz', 'score', 'video', 'embed', 'scene3d', 'math', 'chart', 'table']);

/** Why an idea does not hold to its slide, or null when it does; and the idea put right where it can be. */
export function holdIdea(d: Deck, i: number, raw: Obj): { slide: Slide } | { problem: string } {
  const orig = d.slides[i];
  const H = slideH(d.ratio);
  const mine = new Map(everyEl(orig.els).map((e) => [e.id, e]));
  const pictures = new Set<string>([...everyEl(orig.els).flatMap((e) => (e.type === 'image' && e.src ? [e.src] : [])), ...(orig.bg?.image ? [orig.bg.image] : [])]);
  const notes: string[] = [];
  // The parts as the idea gives them, before they are checked: the slide's own content put back by its ids.
  const prepare = (list: unknown[]): unknown[] =>
    list.flatMap((r): unknown[] => {
      if (!isObj(r)) return [];
      const type = typeof r.type === 'string' ? r.type : '';
      const own = typeof r.id === 'string' ? mine.get(r.id) : undefined;
      const o: Obj = { ...r };
      if (type === 'group') o.els = prepare(Array.isArray(r.els) ? r.els : Array.isArray(r.parts) ? r.parts : []);
      if (own && own.type !== type && !(type === 'textbox' && own.type === 'text')) delete o.id;
      else if (own) {
        for (const k of KEPT[own.type] ?? []) {
          const v = (own as unknown as Obj)[k];
          if (v === undefined) delete o[k];
          else o[k] = v;
        }
        if (own.type === 'icon' && o.icon === own.icon) o.paths = own.paths;
        // A picture keeps its crop while its box keeps its shape (in another shape it would be stretched: it fills it instead).
        if (own.type === 'image') {
          const w = Number(o.w);
          const h = Number(o.h);
          if (own.crop && w > 0 && h > 0 && Math.abs(w / h / (own.w / own.h) - 1) < 0.05) o.crop = own.crop;
          else delete o.crop;
        }
      }
      if (type === 'image' && !pictures.has(String(o.src ?? ''))) {
        notes.push(`a picture that is not the slide’s (${String(o.src ?? '').slice(0, 60) || 'no src'}): use only its pictures, by their src`);
        return [];
      }
      if (OWN_ONLY.has(type as El['type']) && !(own && own.type === type)) {
        // A chart or table of the slide's own data, given without its id, is the slide's.
        const same = [...mine.values()].find((m) => m.type === type && (type === 'chart' || type === 'table') && contentKey(m) === contentKey({ ...(m as object), ...(o as object) } as El));
        if (!same) {
          notes.push(`a ${type} that is not the slide’s: keep its own parts by their ids`);
          return [];
        }
        o.id = same.id;
      }
      return [o];
    });
  const els = prepare(Array.isArray(raw.els) ? raw.els : []);
  const why = (p: string) => ({ problem: notes.length ? `${p} It also had ${notes.join('; ')}.` : p });
  if (!els.length) return why('it had no parts.');
  let made: Slide;
  try {
    const deck = normalizeDeck({ ratio: d.ratio, theme: d.theme, format: d.format, slides: [{ id: orig.id, els, bg: isObj(raw.bg) || typeof raw.bg === 'string' ? raw.bg : undefined }] }, { icon: lucideIcon });
    made = deck.slides[0];
  } catch (e) {
    return { problem: `it was not a slide (${(e as Error).message}).` };
  }
  // Whatever the idea called its parts ("picture", "equation", "iframe"…): a picture is one of the slide's, and a chart,
  // a table or a live part is the slide's own (by its id), else it is left out.
  const real = (list: El[]): El[] =>
    list.flatMap((e): El[] => {
      if (e.type === 'group') return [{ ...e, els: real(e.els) }];
      if (e.type === 'image' && !pictures.has(e.src)) {
        notes.push(`a picture that is not the slide’s (${e.src.slice(0, 60) || 'no src'})`);
        return [];
      }
      if (OWN_ONLY.has(e.type) && mine.get(e.id)?.type !== e.type) {
        notes.push(`a ${e.type} that is not the slide’s`);
        return [];
      }
      return [e];
    });
  made = { ...made, els: real(made.els) };
  // Its background: a colour, or one of the slide's own pictures.
  if (made.bg?.image && !pictures.has(made.bg.image)) {
    const { image: _i, dim: _d, ...bg } = made.bg;
    made = { ...made, bg: Object.keys(bg).length ? bg : undefined };
  }
  if (made.bg?.video && made.bg.video !== orig.bg?.video) {
    const { video: _v, ...bg } = made.bg;
    made = { ...made, bg: Object.keys(bg).length ? bg : undefined };
  }
  if (!made.bg) delete made.bg;
  // Nothing left out: its pictures, charts, tables and live parts; most of its words.
  const shownPics = new Set([...everyEl(made.els).flatMap((e) => (e.type === 'image' && e.src ? [e.src] : [])), ...(made.bg?.image ? [made.bg.image] : [])]);
  const lostPic = [...pictures].find((p) => !shownPics.has(p));
  if (lostPic) return why(`it left out a picture of the slide (${lostPic.slice(0, 60)}).`);
  const ids = new Set(everyEl(made.els).map((e) => e.id));
  const lost = [...mine.values()].find((e) => OWN_ONLY.has(e.type) && !ids.has(e.id));
  if (lost) return why(`it left out the slide’s ${lost.type} (id ${lost.id}).`);
  const before = visibleWords(orig.els);
  const after = visibleWords(made.els);
  const had = new Set(
    tokens(before)
      .filter((w) => w.length >= 3)
      .map(stem),
  );
  const has = new Set(
    tokens(after)
      .filter((w) => w.length >= 3)
      .map(stem),
  );
  const kept = [...had].filter((w) => has.has(w)).length;
  if (had.size >= 4 && kept / had.size < 0.7) return why(`it left out words of the slide (it kept ${kept} of its ${had.size} words).`);
  // Nothing made up: no number that was not on it (a step's own single digit aside), few words of its own.
  const nums = new Set(numbers(before));
  const madeUp = numbers(after).filter((n) => !nums.has(n) && !/^\d$/.test(n));
  if (madeUp.length) return why(`it has numbers that are not on the slide (${[...new Set(madeUp)].slice(0, 4).join(', ')}): use only the slide’s own.`);
  const extra = [...has].filter((w) => !had.has(w));
  if (extra.length > Math.max(4, had.size * 0.35)) return why(`it adds words of its own (${extra.slice(0, 6).join(', ')}): use the slide’s own words.`);
  // Ids: the slide's own parts keep theirs (moved, restyled or their words shortened), and so does a part with the content
  // of one of the slide's (its animations and comments go with it); every other part gets one no other part of the deck has.
  const byKey = new Map<string, string[]>();
  for (const e of mine.values()) {
    const k = contentKey(e);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), e.id]);
  }
  const deckIds = new Set(d.slides.flatMap((x) => [x.id, ...everyEl(x.els).map((e) => e.id), ...(x.anims ?? []).map((a) => a.id)]));
  const taken = new Set<string>();
  const fresh = () => {
    let id = newId();
    while (deckIds.has(id) || taken.has(id)) id = newId();
    return id;
  };
  const reid = (list: El[]): El[] =>
    list.map((e) => {
      const own = mine.get(e.id);
      const k = contentKey(e);
      let id: string;
      if (own && !taken.has(e.id) && (own.type === e.type || (!!k && contentKey(own) === k))) id = e.id;
      else id = (k ? (byKey.get(k) ?? []).find((x) => !taken.has(x) && !ids.has(x)) : undefined) ?? fresh();
      taken.add(id);
      const out = { ...e, id } as El;
      return out.type === 'group' ? { ...out, els: reid(out.els) } : out;
    });
  let parts = reid(made.els);
  // On the slide, and words big enough to read.
  const fit = (e: El): El => {
    if (e.type === 'line') return e;
    const b = turnedBox(e);
    let { x, y } = e;
    const w = Math.min(e.w, SLIDE_W);
    const h = Math.min(e.h, H);
    if (b.x < -b.w * 0.25 || b.x + b.w > SLIDE_W + b.w * 0.25) x = Math.max(0, Math.min(SLIDE_W - w, x));
    if (b.y < -b.h * 0.25 || b.y + b.h > H + b.h * 0.25) y = Math.max(0, Math.min(H - h, y));
    let out = { ...e, x, y, w, h } as El;
    if ((out.type === 'text' || out.type === 'shape') && out.size < 18) out = { ...out, size: 18, paras: out.paras.map((p) => ({ ...p, runs: p.runs.map((r) => (r.size && r.size < 18 ? { ...r, size: 18 } : r)) })) };
    return out;
  };
  parts = parts.map(fit);
  // The slide's own: its id, notes, transition, comments (on parts still there, else on the slide), animations of parts still there.
  const now = new Set(everyEl(parts).map((e) => e.id));
  const slide: Slide = { ...made, id: orig.id, els: parts };
  delete slide.anims;
  const anims = (orig.anims ?? []).filter((a) => parts.some((e) => e.id === a.el) && (!a.trigger || now.has(a.trigger)));
  if (anims.length) slide.anims = anims;
  for (const k of ['notes', 'transition', 'hidden', 'nofooter', 'layout'] as const) {
    if (orig[k] !== undefined) (slide as unknown as Obj)[k] = orig[k];
    else delete (slide as unknown as Obj)[k];
  }
  const comments = (orig.comments ?? []).map((c) => (c.el && !now.has(c.el) ? (({ el: _e, ...rest }) => rest)(c) : c));
  if (comments.length) slide.comments = comments;
  else delete slide.comments;
  return { slide };
}

/** The deck an idea's ask is about: the editor's own model, or a saved deck's by its id (read by `read`). */
export function deckOf(v: unknown, read: (id: string) => Deck | null): Deck {
  if (typeof v === 'string') {
    if (!/^[\w-]{1,64}$/.test(v)) throw new HttpError(400, 'deck: the deck, or a saved deck’s id');
    const d = read(v);
    if (!d) throw new HttpError(404, 'There is no such deck');
    return d;
  }
  try {
    return normalizeDeck(v);
  } catch (e) {
    throw new HttpError(400, `deck: ${(e as Error).message}`);
  }
}

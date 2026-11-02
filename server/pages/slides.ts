// Slide decks in Pages: a page of the kind "slides" keeps its deck (shared/slides.ts) as text, a line per part,
// its pictures apart (assets.ts). Wherever a page's HTML is needed (the frame in the conversation, its own address,
// a published copy, a file, its picture in Pages, a PDF), the deck's own page is made from it: the deck with its
// pictures inside, and the runtime that draws and plays it (shared/slides-runtime.ts), as a slideshow to click
// through, or every slide on a page of its own to print.
//
// save_slides is how agents make and change decks; get_page gives a deck back as it is kept.
import { ASSET, deckFonts, deckOutline, deckSources, deckText, FONT_TABLE, googleFamilies, isDeckText, mapSources, normalizeDeck, type Deck } from '../../shared/slides.ts';
import { slidesRuntime } from '../../shared/slides-runtime.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { assetDataUrl, putAsset, takeIn } from './assets.ts';
import { scriptSafe } from './kit.ts';

export { isDeckText };

/** The longest a deck's text may be (its pictures are kept apart). */
export const MAX_DECK = 3 * 1024 * 1024;

const RUNTIME_SRC = scriptSafe(slidesRuntime.toString());
const FONTS_JSON = JSON.stringify(FONT_TABLE);

/** A deck's text, read back; a broken one is an error a person can act on. */
export function readDeck(text: string): Deck {
  try {
    return normalizeDeck(JSON.parse(text));
  } catch (e) {
    throw new HttpError(500, `This deck could not be read: ${(e as Error).message}`);
  }
}

/** The deck as it is kept, checked; data: pictures are kept apart, other sources stay as they are. */
export function keepDeck(db: DB, input: unknown): { deck: Deck; text: string } {
  let deck: Deck;
  try {
    deck = normalizeDeck(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  deck = mapSources(deck, (s) => {
    if (!s.startsWith('data:')) return s;
    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(s);
    return m ? ASSET + putAsset(db, Buffer.from(m[1], 'base64')) : '';
  });
  const text = deckText(deck);
  if (Buffer.byteLength(text) > MAX_DECK) throw new HttpError(413, `The deck is over ${MAX_DECK / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { deck, text };
}

/**
 * A deck from an agent: checked as keepDeck does, its pictures taken in first (files of its session, data:
 * addresses, pictures on the web). What could not be taken in is said in `notes`, for the agent.
 */
export async function agentDeck(db: DB, input: unknown, cwd: string): Promise<{ deck: Deck; text: string; notes: string[] }> {
  let deck: Deck;
  try {
    // Any source may be a file of the session's: kept as written until it is taken in below.
    deck = normalizeDeck(input, { src: (s) => (s.length <= 4096 ? s : null) });
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_slides' description for the deck's shape.`);
  }
  const notes: string[] = [];
  const done = new Map<string, string>();
  for (const s of new Set(deckSources(deck))) done.set(s, await takeIn(db, s, { cwd, notes }));
  deck = mapSources(deck, (s) => done.get(s) ?? s);
  const text = deckText(deck);
  if (Buffer.byteLength(text) > MAX_DECK) throw new Error(`The deck is over ${MAX_DECK / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { deck, text, notes };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** What every deck's page looks like around its slides: the app's colours in a frame, dark when it fills a window. */
const PAGE_CSS = [
  'html,body{margin:0;padding:0}',
  'body{background:var(--n-bg,#f6f5f1);color:var(--n-fg,#1b1915);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}',
  'html[data-n-theme=dark] body{background:#121110;color:#f2eee7}',
  'body.ns-filled{background:#0e0e0f;color:#eceae6;min-height:100vh;display:flex;flex-direction:column;justify-content:center}',
  'body.ns-filled .ns-wrap{padding:12px}',
  'body.ns-filled .ns-viewer{color:#eceae6}',
  '.ns-wrap{min-width:0}',
].join('');

/**
 * The deck's own page: a viewer to click through (`viewer`), every slide on a page of its own (`print`), or its
 * first slide alone (`still`, for its picture in Pages). Its pictures go inside it.
 */
export function deckPage(db: DB, deck: Deck, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer'): string {
  const inside = mapSources(deck, (s) => (s.startsWith(ASSET) ? (assetDataUrl(db, s.slice(ASSET.length)) ?? '') : s));
  const fams = googleFamilies(deckFonts(deck));
  const json = JSON.stringify(inside).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    '<meta name="generator" content="Naget Agent slides">',
    fams ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${esc(fams)}&amp;display=swap">` : '',
    `<style>${PAGE_CSS}</style></head><body>`,
    `<script type="application/json" id="n-deck">${json}</script>`,
    `<script>(${RUNTIME_SRC})(window, ${FONTS_JSON}).boot(${JSON.stringify({ mode })})</script>`,
    '</body></html>',
  ].join('\n');
}

/** A deck page is one by its marker (the frame lets such a page go full screen). */
export const isDeckPage = (html: string) => /<script type="application\/json" id="n-deck">/.test(html.slice(0, 4096));

/** What get_page tells an agent of a deck. */
export function deckForAgent(text: string): string {
  const deck = readDeck(text);
  const body = text.length > 150_000 ? `${text.slice(0, 150_000)}\n… (cut: the deck is ${Math.round(text.length / 1024)} KB; keep the parts you did not read as they are by changing the deck slide by slide)` : text;
  return `A slide deck of ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'} (${deck.ratio}, theme ${deck.theme.id ?? 'custom'}).\n\nOutline:\n${deckOutline(deck)}\n\nThe deck (send it back whole with save_slides and this id to change it; keep naget-asset: pictures as they are):\n${body}`;
}

const SLIDES_HELP = [
  'Make or change a slide deck, kept in the user’s Library: they can present it (full screen; a presenter view with notes, the next slide and a timer), edit it as in PowerPoint or Google Slides, and export it to PowerPoint (.pptx) or PDF. Use it whenever the user asks for slides, a deck or a presentation, rather than writing a .pptx file (unless they ask for a file, or work on one they have). It shows in the conversation as a slideshow.',
  'Slides are 1280×720 px ("ratio": "4:3" makes them 1280×960); text sizes are px too (1 px = 0.75 pt: body 24–30, titles 44–60).',
  'Each slide comes from a layout with its words, from parts placed by position ("els"), or both ("extra": parts added to a layout). Layouts: title {title, subtitle}; content {title, text}; two {title, left, right, leftTitle, rightTitle}; section {title, subtitle}; image-right {title, text, image}; image {title, image, caption}; stats {title, stats: [{value, label}]}; cards {title, cards: [{title, text}]}; steps {title, steps: [{title, text}]}; quote {quote, by}; chart {title, chart: {kind, labels, series}}; table {title, table: [[header…], [row…]]}; title-only {title}; end {title, subtitle}; blank.',
  'Words (text, left, right, a part’s text): a line per paragraph, "- " for a bullet and "1. " for a number, two spaces before them a level deeper, **bold**, *italic*, [words](https://…); or an array of bullets (a nested array a level deeper).',
  'Parts: {type, x, y, w, h, …}. text {text, size, color, font, bold, italic, align, valign: top|middle|bottom, fill, line, radius, role: title|subtitle|body|caption|quote|big}. shape {shape: rect|round|ellipse|triangle|rtriangle|diamond|pentagon|hexagon|octagon|star|arrow|larrow|uarrow|darrow|chevron|parallelogram|trapezoid|plus|heart|callout, fill ("none" for none), fill2 and angle for a gradient, line, lineW, shadow, and text like a text part}. image {src, fit: cover|contain|fill, radius, alt}: src is a file of this session (a picture you made), a public https address, or a picture of the deck already (naget-asset:…). line {x, y to x+w, y+h; color, width, dash: solid|dash|dot, start and end: none|arrow|dot}. table {rows: [[…]], head, band, size}. chart {kind: column|bar|line|area|pie|doughnut, labels, series: [{name, values}], legend, values, stacked}. Any part may have rot (degrees), opacity, link ("https://…", or "#3" for slide 3), name, and anim: its entrance ("fade", or {fx, on, dur, delay, dir}).',
  'Colours: the theme’s names, which follow it (accent, accentFg, fg, head, muted, bg, soft, c1 to c6), or #hex.',
  'A slide may also have notes (speaker notes: what to say), bg (a colour; {color, to, angle} for a gradient; {image, dim} for a picture), transition (none|fade|push|wipe|cover|zoom|split, or {fx, dir, dur, auto: seconds to go on by itself}), hidden, build: true (its bullets come one at a time), and anims: [{el: a part’s id, type: in|em|out, fx: appear|fade|fly|float|zoom|wipe|bounce for in and out, pulse|spin|grow|shake for em, on: click|with|after, dur and delay in ms, dir: left|right|up|down, byPara}].',
  'theme: a preset (paper, midnight, ember, forest, ocean, noir, blossom, slate) or {id, bg, fg, head, muted, accent, accentFg, soft, colors: [6], font, headFont}; fonts: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito, DM Sans, Work Sans, Space Grotesk, IBM Plex Sans, Outfit, Playfair Display, Merriweather, Lora, Fraunces, DM Serif Display, Source Serif 4, JetBrains Mono, Arial, Georgia.',
  'Good slides: one idea each, a title that says the point, a few short bullets, numbers as charts or big numbers, pictures where they help, and what to say in the notes.',
  'To change a deck, get_page with its id gives it whole (each slide and part with its id); send the whole deck back with the same id: a new version, the older ones restorable. Keep what the user changed.',
].join(' ');

export const SAVE_SLIDES_DESCRIPTION = SLIDES_HELP;

export const SAVE_SLIDES_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved deck’s id, to save a new version of it.' },
    title: { type: 'string', description: 'The deck’s name in the Library: "Q3 results".' },
    ratio: { type: 'string', enum: ['16:9', '4:3'] },
    theme: { description: 'A preset’s name, or the theme’s colours and fonts.', anyOf: [{ type: 'string' }, { type: 'object' }] },
    slides: { type: 'array', items: { type: 'object' }, description: 'The slides, in order.' },
  },
  required: ['title', 'slides'],
};

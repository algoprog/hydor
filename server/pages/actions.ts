// page_action: what the Library's editors do in a click to the whole of a page (animating every slide, putting right what
// the accessibility check finds, PowerPoint compatible or the web format, a ready-made theme, accepting the suggested
// changes, sorting a table, taking out its duplicate rows, renaming a LaTeX project's files…), for agents, and first of
// all for the agent beside the page (Ask the agent). Each runs the editor's own code (shared/) on the version kept now,
// and keeps a new version as the save tools do (index.ts keepModel: an agent's saves of a page in one turn are one
// version; the user's own changes and the comments in it stay), so the editor open on the page shows it at once. What
// an agent does as easily with a save tool (a part's look, a cell's value, a slide's words) stays the save tool's:
// docs/plans/agent-parity.md lists every editor's actions and how an agent does each.
import { HttpError } from '../auth.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { describe } from '../write/index.ts';
import { kindOf, mustKind, type PageKind } from './kinds.ts';
import { folderPath } from './folders.ts';
import { compileSummary, compileTex } from './latex.ts';
import { myThemeByName, myThemes } from './my-themes.ts';
import { readBook } from './sheets.ts';
import { createPage, mustPage, pageSource } from './store.ts';
import { refreshThumbs } from './thumbs.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { HTML_ACTIONS } from './page-tools.ts';
import { animateSlide, type AnimateStyle } from '../../shared/deck-animate.ts';
import { checkSlide, fixAll, fixIssue, MIN_TEXT as MIN, type DeckIssue, type IssueKind } from '../../shared/deck-check.ts';
import { reshapeDeck } from '../../shared/deck-shape.ts';
import { reuseSlides } from '../../shared/slides-reuse.ts';
import { chartRefreshed } from '../../shared/slides-sheet.ts';
import { TURN_INTO, turnAsk } from '../../shared/content-asks.ts';
import { ASSET, everyEl, isWebDeck, plainText, powerPointNote, richFeatures, slideTitle, THEMES, toPowerPoint, type ChartEl, type Deck, type El, type Theme } from '../../shared/slides.ts';
import { docFont, PAPERS, ptOf, resolveSuggestion, type Band, type Doc } from '../../shared/docs.ts';
import {
  adjustForDelete,
  adjustForInsert,
  colIndex,
  colName,
  computeBook,
  formatValue,
  MAX_COLS,
  MAX_ROWS,
  parseRange,
  rangeName,
  refName,
  removeSheet,
  renameSheet,
  SHEET_LIMITS,
  uniqueSheetName,
  type Calc,
  type Cell,
  type Rect,
  type Sheet,
  type Workbook,
} from '../../shared/sheets.ts';
import { clearChanges, commentsAfterSort, fillChanges, guessSeparator, hasHeader, holds, regionAround, removeDuplicates, sortByKeys, sortChanges, splitColumn, styleChanges, summarySheet, trimChanges, type SummaryFn } from '../../shared/sheet-tools.ts';
import { sheetNamed } from '../../shared/sheet-edits.ts';
import { AI_BATCH } from '../../shared/sheet-ai.ts';
import { aiCells } from '../write/sheets.ts';
import { quoteSheet } from '../../shared/sheets.ts';
import { pivotSheet } from '../../shared/sheet-pivot.ts';
import { goalSeek } from '../../shared/sheet-whatif.ts';
import { cleanTexName, TEX_MAIN, texFileText, type TexDoc } from '../../shared/latex.ts';
import { texMoveFiles } from '../../shared/latex-files.ts';
import { citedKeys } from '../../shared/latex-ai.ts';
import type { BibEntry } from '../../shared/latex-bib.ts';
import { bibNeedsFill, fillEntry, renameCites, tidyBib } from '../../shared/latex-bibtidy.ts';
import { tidyTex } from '../../shared/latex-tidy.ts';
import { bibtexForDois } from './latex-refs.ts';

type Args = Record<string, unknown>;
type Json = Record<string, any>;

/** How index.ts keeps an agent's change of a page: a new version (one with its saves of the page earlier in the turn). */
export type KeepPage = (ctx: RunCtx, id: string, kind: PageKind, title: unknown, model: unknown) => PageInfo & { version: number; folded?: number };

/** What an action did: the model it made (none: nothing changed, and nothing is saved), in words for the agent. */
interface Done<M> {
  model?: M;
  said: string;
  notes?: string[];
}

interface Here {
  ctx: RunCtx;
  page: PageInfo;
  /** A page out of the agent's reach (a confidential session's, seen from another): as if there were none. */
  hidden: (p: PageInfo) => boolean;
}

type Act<M> = (m: M, a: Args, x: Here) => Done<M> | Promise<Done<M>>;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const isObj = (v: unknown): v is Args => !!v && typeof v === 'object' && !Array.isArray(v);
/** A list given as one value or as a list; empty when left out. */
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const quote = (s: string, n = 60) => `“${s.length > n ? `${s.slice(0, n - 1)}…` : s}”`;

// ---- slide decks ------------------------------------------------------------------------------------------------------

/** The slides an action is for, in order (by number from 1, or by id); every slide when left out. */
function slidesOf(d: Deck, v: unknown): number[] {
  const given = listOf(v);
  if (!given.length) return d.slides.map((_, i) => i);
  const out = new Set<number>();
  for (const x of given) {
    const s = str(x);
    const i = /^\d+$/.test(s) ? Number(s) - 1 : d.slides.findIndex((y) => y.id === s);
    if (i < 0 || i >= d.slides.length) throw new Error(`slides: there is no slide ${s ? quote(s) : '(none given)'}: the deck has ${d.slides.length}, numbered from 1 (or name them by the ids get_page shows).`);
    out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** "every slide", "slide 3", "slides 2, 4". */
const whichSlides = (ix: number[], d: Deck) => (ix.length === d.slides.length && ix.length > 1 ? 'every slide' : ix.length === 1 ? `slide ${ix[0] + 1}` : `slides ${ix.map((i) => i + 1).join(', ')}`);

/** The deck with one part of a slide changed (one in a group too). */
function setPart(d: Deck, i: number, id: string, f: (e: El) => El): Deck {
  const map = (list: El[]): El[] => list.map((e) => (e.id === id ? f(e) : e.type === 'group' ? { ...e, els: map(e.els) } : e));
  return { ...d, slides: d.slides.map((s, k) => (k === i ? { ...s, els: map(s.els) } : s)) };
}

/** A slide's own words, for a picture's description to follow their sense and be in their language (as the accessibility panel sends them). */
const slideWords = (d: Deck, i: number) =>
  everyEl(d.slides[i]?.els ?? [])
    .map((e) => (e.type === 'text' || e.type === 'shape' ? plainText(e.paras) : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

const STYLES: Record<string, AnimateStyle | 'none'> = { subtle: 'subtle', lively: 'lively', bold: 'bold', striking: 'bold', none: 'none', off: 'none' };
const STYLE_NAME: Record<AnimateStyle, string> = { subtle: 'Subtle', lively: 'Lively', bold: 'Striking' };

/** Animate → Animate every slide (shared/deck-animate.ts), on every slide or those named. */
const animate: Act<Deck> = (d, a) => {
  const style = STYLES[str(a.style).toLowerCase()];
  if (!style) throw new Error('style: subtle (things fade in, calm and quick), lively (they rise and slide in, lines draw, numbers count up), bold (they drop, pop and flip in; the slides turn as a cube) or none (every animation and transition off).');
  const ix = slidesOf(d, a.slides);
  const pick = new Set(ix);
  const next: Deck = { ...d, slides: d.slides.map((s, i) => (pick.has(i) ? animateSlide(d, i, style) : s)) };
  if (style === 'none') {
    const had = ix.some((i) => d.slides[i].anims?.length || (d.slides[i].transition && d.slides[i].transition!.fx !== 'none'));
    return had ? { model: next, said: `took every animation and transition off ${whichSlides(ix, d)}.` } : { said: `There is nothing to take off: ${whichSlides(ix, d)} ${ix.length === 1 ? 'has' : 'have'} no animations or transitions.` };
  }
  const anims = ix.reduce((n, i) => n + (next.slides[i].anims?.length ?? 0), 0);
  const taps = ix.reduce((n, i) => n + (next.slides[i].anims ?? []).filter((x) => x.on === 'tap').length, 0);
  const morphs = ix.filter((i) => next.slides[i].transition?.fx === 'morph').map((i) => i + 1);
  return {
    model: next,
    said: `animated ${whichSlides(ix, d)} (${STYLE_NAME[style]}${isWebDeck(d) ? '' : ', with PowerPoint’s own effects'}): ${plural(anims, 'animation')}, each playing by itself as its slide comes${morphs.length ? `; Morph into slide${morphs.length === 1 ? '' : 's'} ${morphs.join(', ')}, where parts are shared with the slide before` : ''}${taps ? `; ${plural(taps, 'effect')} run on a click on a part, as before` : ''}.`,
  };
};

/** What putting right so many issues of a kind did, in words. */
const FIXED: Record<IssueKind, (n: number) => string> = {
  title: (n) => `${plural(n, 'slide')} given a title`,
  order: (n) => `${plural(n, 'title')} read first`,
  small: (n) => `${plural(n, 'part')} with words made ${MIN} px or more`,
  contrast: (n) => `${plural(n, 'part')} with words given a colour that stands out`,
  autoplay: (n) => `${plural(n, 'video')} made to start muted`,
  header: (n) => `${plural(n, 'table')} given a header row`,
  alt: (n) => `${plural(n, 'picture')} described`,
};

/** An issue of the check, as get_page lists them. */
const issueLine = (d: Deck, x: DeckIssue) => {
  const t = slideTitle(d.slides[x.slide]);
  return `- slide ${x.slide + 1}${t ? ` (${quote(t, 40)})` : ''}${x.el ? `, part ${x.el}` : ''}: ${x.what}${x.kind === 'alt' ? ' (describe_pictures writes one)' : ''}`;
};

/** Tools → Check accessibility → Fix the ones it can (shared/deck-check.ts), on the whole deck or the slides named. */
const fixAccessibility: Act<Deck> = (d, a) => {
  const ix = slidesOf(d, a.slides);
  const before = ix.flatMap((i) => checkSlide(d, i));
  let deck = d;
  let fixed = 0;
  if (ix.length === d.slides.length) ({ deck, fixed } = fixAll(d));
  else
    // Fix the ones it can, as fixAll does, on these slides alone.
    for (const i of ix)
      for (let guard = 0; guard < 50; guard++) {
        const next = checkSlide(deck, i).find((x) => x.fix && fixIssue(deck, x) !== deck);
        if (!next) break;
        deck = fixIssue(deck, next);
        fixed++;
      }
  const after = ix.flatMap((i) => checkSlide(deck, i));
  const left = after.length ? `Still to look at (${after.length}):\n${after.slice(0, 20).map((x) => issueLine(deck, x)).join('\n')}${after.length > 20 ? `\n… and ${after.length - 20} more` : ''}` : 'Nothing else is left to put right there.';
  if (!fixed) return { said: `${before.length ? 'Nothing there can be put right by itself.' : `The check finds nothing to put right on ${whichSlides(ix, d)}.`} ${before.length ? left : ''}`.trim() };
  // What was put right, by kind: those found before and not after.
  const count = (list: DeckIssue[], k: IssueKind) => list.filter((x) => x.kind === k).length;
  const kinds = (Object.keys(FIXED) as IssueKind[]).flatMap((k) => {
    const n = count(before, k) - count(after, k);
    return n > 0 ? [FIXED[k](n)] : [];
  });
  return { model: deck, said: `put ${fixed} thing${fixed === 1 ? '' : 's'} right on ${whichSlides(ix, d)}${kinds.length ? `: ${kinds.join(', ')}` : ''}. ${left}` };
};

/** At most this many pictures are described in one call (each is a model looking at it). */
const DESCRIBE_MAX = 12;

/** Tools → Check accessibility → Describe it with AI (server/write describe), for each picture without a description, or those named. */
const describePictures: Act<Deck> = async (d, a, x) => {
  const ix = slidesOf(d, a.slides);
  const named = listOf(a.parts).map(str).filter(Boolean);
  const want = new Set(named);
  const found: { i: number; id: string; src: string }[] = [];
  for (const i of ix) for (const e of everyEl(d.slides[i].els)) if (e.type === 'image' && e.src && (want.size ? want.has(e.id) : !e.alt?.trim())) found.push({ i, id: e.id, src: e.src });
  const missing = named.filter((id) => !found.some((f) => f.id === id));
  if (missing.length) throw new Error(`parts: ${missing.map((m) => quote(m)).join(', ')} ${missing.length === 1 ? 'is not a picture' : 'are not pictures'} on ${whichSlides(ix, d)} (get_page shows each part’s id and type).`);
  if (!found.length) return { said: `Every picture on ${whichSlides(ix, d)} has a description already.` };
  const notes: string[] = [];
  const done: string[] = [];
  let deck = d;
  let by = '';
  const signal = x.ctx.signal ?? AbortSignal.timeout(15 * 60_000);
  for (const f of found.slice(0, DESCRIBE_MAX)) {
    if (!f.src.startsWith(ASSET)) {
      notes.push(`Slide ${f.i + 1}, part ${f.id}: its picture is not one the app keeps, so it was not described here; write its alt with save_slides.`);
      continue;
    }
    try {
      const r = await describe(x.ctx.deps.db, x.ctx.deps, { src: f.src, context: slideWords(d, f.i) }, signal);
      deck = setPart(deck, f.i, f.id, (e) => (e.type === 'image' ? { ...e, alt: r.alt } : e));
      by = r.by ?? by;
      done.push(`slide ${f.i + 1}, part ${f.id}: “${r.alt}”`);
    } catch (e) {
      if (signal.aborted) throw e;
      notes.push(`Slide ${f.i + 1}, part ${f.id}: ${(e as Error).message}.`);
    }
  }
  if (found.length > DESCRIBE_MAX) notes.push(`${found.length - DESCRIBE_MAX} more pictures have no description: call it again for them.`);
  if (!done.length) return { said: 'No picture was described.', notes };
  return { model: deck, said: `described ${plural(done.length, 'picture')}${by ? ` (by ${by})` : ''}: ${done.join('; ')}. Read them and change any that is not right with save_slides.`, notes };
};

/** Tools → PowerPoint compatible (shared/slides.ts toPowerPoint), or back to the web format. */
const powerpoint: Act<Deck> = (d, a) => {
  if (typeof a.on !== 'boolean') throw new Error('on: true makes the deck PowerPoint compatible, false puts it back in the web format.');
  if (a.on) {
    if (!isWebDeck(d)) return { said: 'The deck is PowerPoint compatible already.' };
    const note = powerPointNote(richFeatures(d));
    return { model: toPowerPoint(d), said: `made the deck PowerPoint compatible (only what PowerPoint has, so its PowerPoint file keeps everything). ${note || 'Nothing on its slides had to change.'}` };
  }
  if (isWebDeck(d)) return { said: 'The deck is in the web format already.' };
  // As the editor's toWebFormat: the format left out is the web format; its slides stay as they are.
  const { format: _f, ...web } = d;
  return { model: web, said: 'put the deck back in the web format: custom code, quizzes, 3D and the web’s effects can go on it again (its slides are as they were).' };
};

/**
 * The Theme tab's Ready-made (a preset's colours and fonts) or My themes (the user's own, by its name: its colours, fonts
 * and logo), as the editor puts them on the deck.
 */
const theme: Act<Deck> = (d, a, x) => {
  const name = str(a.theme).toLowerCase();
  const p = THEMES.find((t) => t.id === name || t.label.toLowerCase() === name);
  if (p) {
    const own: Theme = { id: p.id, bg: p.bg, fg: p.fg, head: p.head, muted: p.muted, accent: p.accent, accentFg: p.accentFg, soft: p.soft, colors: [...p.colors], font: p.font, headFont: p.headFont };
    if (JSON.stringify(own) === JSON.stringify(d.theme)) return { said: `The deck is in the ${p.label} theme already.` };
    return { model: { ...d, theme: own }, said: `put the ${p.label} theme on the deck: its colours and fonts (${p.headFont === p.font ? p.font : `${p.headFont} and ${p.font}`}) on every slide; parts with colours of their own keep them.` };
  }
  const mine = myThemeByName(x.ctx.deps.db, str(a.theme));
  if (!mine) {
    const names = myThemes(x.ctx.deps.db).map((t) => `“${t.name}”`);
    throw new Error(`theme: a ready-made theme (${THEMES.map((t) => t.id).join(', ')})${names.length ? ` or one of the user’s own (${names.join(', ')})` : ''}; colours and fonts of your own go in save_slides’ theme.`);
  }
  const next: Deck = { ...d, theme: { ...mine.theme, colors: [...mine.theme.colors] }, ...(mine.logo ? { logo: { ...mine.logo } } : {}) };
  if (JSON.stringify([next.theme, next.logo]) === JSON.stringify([d.theme, d.logo])) return { said: `The deck is in “${mine.name}” already.` };
  return { model: next, said: `put the user’s theme “${mine.name}” on the deck: its colours and fonts on every slide${mine.logo ? ', and its logo' : ''}.` };
};

/** The Theme tab's Slide shape (shared/deck-shape.ts). */
const slideShape: Act<Deck> = (d, a) => {
  const r = str(a.ratio);
  if (r !== '16:9' && r !== '4:3') throw new Error('ratio: "16:9" (wide) or "4:3" (standard).');
  if (d.ratio === r) return { said: `The slides are ${r} already.` };
  return { model: reshapeDeck(d, r), said: `made the slides ${r === '16:9' ? 'wide (16:9)' : 'standard (4:3)'}: every part kept its place across the slide, and its place and height down it went in step with the slide’s new height.` };
};

/** Insert → Slides from another deck (shared/slides-reuse.ts): copies of its slides, after the slide named (at the end when left out). */
const reuse: Act<Deck> = (d, a, x) => {
  const fromId = str(a.from);
  if (!fromId) throw new Error('from: the deck to take slides from, by its id (get_page lists them).');
  const fp = mustPage(x.ctx.deps.db, fromId);
  if (x.hidden(fp)) throw new HttpError(404, 'No saved page with that id');
  if (fp.kind !== 'slides') throw new Error(`from: “${fp.title}” is a ${NOUN[fp.kind && kindOf(fp.kind) ? fp.kind : 'page']}, not a slide deck.`);
  const from = mustKind('slides').read(pageSource(x.ctx.deps.db, fromId)!.text) as Deck;
  const picks = slidesOf(from, a.slides);
  const at = a.after === undefined || a.after === null || a.after === '' ? d.slides.length : str(a.after) === '0' ? 0 : slidesOf(d, [a.after])[0] + 1;
  const keepLook = a.keep_look !== false;
  const made = reuseSlides(from, picks, d, { keepLook });
  if (d.slides.length + made.length > 300) throw new Error(`The deck would have ${d.slides.length + made.length} slides: a deck holds at most 300.`);
  const slides = [...d.slides];
  slides.splice(at, 0, ...made);
  const where = at === d.slides.length ? 'at the end' : at === 0 ? 'first' : `after slide ${at}`;
  return {
    model: { ...d, slides },
    said: `put ${plural(made.length, 'slide')} from “${fp.title}” (${whichSlides(picks, from).replace('every slide', 'all of its slides')}) ${where}, as slides ${at + 1}${made.length > 1 ? ` to ${at + made.length}` : ''}: ${keepLook ? 'each keeps its own look' : 'they take this deck’s theme'}; their speaker notes came along, their comments stayed behind.`,
  };
};

/** A chart's Update from the spreadsheet (shared/slides-sheet.ts), for every chart made from one (or on the slides named). */
const updateCharts: Act<Deck> = (d, a, x) => {
  const ix = new Set(slidesOf(d, a.slides));
  const books = new Map<string, { title: string; book: Workbook } | string>();
  const bookOf = (id: string) => {
    if (!books.has(id)) {
      const p = (() => {
        try {
          return mustPage(x.ctx.deps.db, id);
        } catch {
          return null;
        }
      })();
      const src = p && !x.hidden(p) ? pageSource(x.ctx.deps.db, id) : null;
      books.set(id, src?.kind === 'sheet' ? { title: src.title, book: readBook(src.text) } : `its spreadsheet (${id}) is no longer in the Library`);
    }
    return books.get(id)!;
  };
  const notes: string[] = [];
  let n = 0;
  let found = 0;
  const map = (els: El[], i: number): El[] =>
    els.map((e) => {
      if (e.type === 'group') return { ...e, els: map(e.els, i) };
      if (e.type !== 'chart' || !e.source) return e;
      found++;
      const got = bookOf(e.source.page);
      if (typeof got === 'string') {
        notes.push(`Slide ${i + 1}, chart ${e.id}: ${got}.`);
        return e;
      }
      const r = chartRefreshed(e, got.book, got.title);
      if ('error' in r) {
        notes.push(`Slide ${i + 1}, chart ${e.id}: ${r.error}`);
        return e;
      }
      n++;
      return r as ChartEl;
    });
  const next: Deck = { ...d, slides: d.slides.map((s, i) => (ix.has(i) ? { ...s, els: map(s.els, i) } : s)) };
  if (!found) return { said: `No chart on ${whichSlides([...ix], d)} is made from a spreadsheet (a chart’s source: {page, sheet, range} in save_slides makes one so).` };
  if (!n) return { said: 'No chart could be read again.', notes };
  return { model: next, said: `read ${plural(n, 'chart')} again from ${books.size === 1 ? 'its spreadsheet' : 'their spreadsheets'}: their labels and numbers are the cells’ as they are now, each series in the colour it had.`, notes };
};

// ---- documents --------------------------------------------------------------------------------------------------------

/** Tools → Accept (or Reject) all suggestions, or those named (shared/docs.ts resolveSuggestion). */
const suggestions =
  (accept: boolean): Act<Doc> =>
  (doc, a) => {
    const all = doc.suggestions ?? [];
    if (!all.length) return { said: 'The document has no suggested changes.' };
    const ids = listOf(a.ids).map(str).filter(Boolean);
    const notes: string[] = [];
    let d = doc;
    let n = 0;
    if (!ids.length) {
      d = resolveSuggestion(d, null, accept);
      n = all.length;
    } else
      for (const id of ids) {
        if (!d.suggestions?.some((x) => x.id === id)) {
          notes.push(`There is no suggestion ${id}: get_page lists them.`);
          continue;
        }
        d = resolveSuggestion(d, id, accept);
        n++;
      }
    if (!n) throw new Error(notes.join(' '));
    const left = d.suggestions?.length ?? 0;
    const what = ids.length ? plural(n, 'suggested change') : `every suggested change (${n})`;
    return { model: d, notes, said: `${accept ? 'accepted' : 'rejected'} ${what}: ${accept ? 'what they suggest is made' : 'the words are as they were before them'}.${left ? ` ${plural(left, 'suggestion')} still wait${left === 1 ? 's' : ''}.` : ''}` };
  };

/** Format → Page setup: the paper, its margins, the body text's font and size. */
const pageSetup: Act<Doc> = (doc, a) => {
  const d: Doc = { ...doc, page: { ...doc.page } };
  if (a.paper !== undefined) {
    const p = str(a.paper).toLowerCase().replace(/^us\s*/, '');
    if (p !== 'a4' && p !== 'letter') throw new Error('paper: a4 or letter.');
    d.page.size = p;
  }
  if (a.margin !== undefined) {
    const m = typeof a.margin === 'number' ? a.margin : Number(str(a.margin).replace(/\s*mm$/i, ''));
    if (!Number.isFinite(m) || m < 5 || m > 60) throw new Error('margin: in millimetres, 5 to 60 (12.7 narrow, 25.4 medium, 38.1 wide).');
    d.page.margin = Math.round(m * 10) / 10;
  }
  if (a.font !== undefined) {
    const f = docFont(a.font);
    if (!f) throw new Error(`font: a font the documents have, such as Arial, Georgia, Inter, Lora, Merriweather or Roboto (not ${quote(str(a.font))}).`);
    d.font = f;
  }
  if (a.size !== undefined) {
    const s = ptOf(a.size, 6, 72);
    if (!s) throw new Error('size: the body text’s size in points, 6 to 72.');
    d.size = s;
  }
  if (a.paper === undefined && a.margin === undefined && a.font === undefined && a.size === undefined) throw new Error('Give what to change: paper, margin, font or size.');
  if (JSON.stringify([d.page, d.font, d.size]) === JSON.stringify([doc.page, doc.font, doc.size])) return { said: 'The page is set up so already.' };
  return { model: d, said: `set the page up: ${PAPERS[d.page.size].label} paper, ${d.page.margin} mm margins, ${d.font} ${d.size} pt.` };
};

/** A header or footer as given: {text, align}, words alone, or null (none). */
function bandOf(v: unknown, what: string): Band | null {
  if (v === null || v === '' || v === false) return null;
  const o = isObj(v) ? v : { text: v };
  const text = str(o.text);
  if (!text) return null;
  if (text.length > 500) throw new Error(`${what}: at most 500 characters.`);
  const align = str(o.align).toLowerCase();
  if (align && !['left', 'center', 'centre', 'right'].includes(align)) throw new Error(`${what}.align: left, center or right.`);
  return { text, ...(align === 'center' || align === 'centre' ? { align: 'center' as const } : align === 'right' ? { align: 'right' as const } : {}) };
}

/** Insert → Header and footer, and Page numbers (as the editor's setBands). */
const headerFooter: Act<Doc> = (doc, a) => {
  if (a.header === undefined && a.footer === undefined && a.title_page === undefined) throw new Error('Give header, footer (each {text, align} or null for none) or title_page.');
  const d: Doc = { ...doc };
  if (a.header !== undefined) {
    const b = bandOf(a.header, 'header');
    if (b) d.header = b;
    else delete d.header;
  }
  if (a.footer !== undefined) {
    const b = bandOf(a.footer, 'footer');
    if (b) d.footer = b;
    else delete d.footer;
  }
  if (a.title_page !== undefined) {
    if (a.title_page === true) d.titlePage = true;
    else delete d.titlePage;
  }
  if (!d.header && !d.footer) delete d.titlePage;
  if (JSON.stringify([d.header, d.footer, d.titlePage]) === JSON.stringify([doc.header, doc.footer, doc.titlePage])) return { said: 'The header and footer are so already.' };
  const band = (b: Band | undefined) => (b ? `“${b.text}”${b.align ? ` (${b.align === 'center' ? 'in the middle' : 'on the right'})` : ''}` : 'none');
  return { model: d, said: `set the header to ${band(d.header)} and the footer to ${band(d.footer)}${d.titlePage ? ', the first page a title page without them' : ''}.` };
};

// ---- spreadsheets -----------------------------------------------------------------------------------------------------

interface At {
  book: Workbook;
  si: number;
  sh: Sheet;
  calc: Calc;
}

/** The sheet an action is for: by its name or id, the first when left out. */
function sheetAt(book: Workbook, v: unknown): At {
  const ref = str(v);
  const sh = sheetNamed(book, ref || undefined);
  if (!sh) throw new Error(`sheet: there is no sheet ${quote(ref)}; its sheets are ${book.sheets.map((s) => `“${s.name}”`).join(', ')}.`);
  return { book, si: book.sheets.indexOf(sh), sh, calc: computeBook(book) };
}

/** The workbook with some cells of a sheet changed (null: emptied), as the editor's patch of them does. */
function withCells(book: Workbook, si: number, changes: Record<string, Cell | null>): Workbook {
  const cells = { ...book.sheets[si].cells };
  for (const [k, c] of Object.entries(changes)) {
    if (c) cells[k] = c;
    else delete cells[k];
  }
  return { ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, cells } : s)) };
}

const withSheet = (book: Workbook, si: number, patch: Partial<Sheet>): Workbook => ({ ...book, sheets: book.sheets.map((s, i) => (i === si ? { ...s, ...patch } : s)) });

/** What a cell shows. */
const shown = (at: At, r: number, c: number) => formatValue(at.calc.value(at.si, r, c), at.sh.cells[refName(r, c)]?.s);

/**
 * The cells an action is for: the range given ("A1:D40"; whole columns or rows as far as the sheet holds), or the table
 * around the cell given, else around A1 (the sheet's first filled cell), as the editor finds the table around the cell
 * picked. `around`: a table found so, whose first row may be its header.
 */
function tableOf(at: At, v: unknown, what = 'range'): { x: Rect; around: boolean } {
  const e = at.calc.extent(at.si);
  const s = str(v);
  const around = (r: number, c: number) => ({ x: regionAround(at.sh, r, c, Math.max(e.rows, r + 1), Math.max(e.cols, c + 1)), around: true });
  if (!s) {
    let first: [number, number] | null = null;
    for (const k of Object.keys(at.sh.cells)) {
      const m = /^([A-Z]+)(\d+)$/.exec(k);
      if (!m || !holds(at.sh.cells[k])) continue;
      const rc: [number, number] = [Number(m[2]) - 1, colIndex(m[1])];
      if (!first || rc[0] < first[0] || (rc[0] === first[0] && rc[1] < first[1])) first = rc;
    }
    if (!first) throw new Error(`The sheet “${at.sh.name}” is empty.`);
    return around(first[0], first[1]);
  }
  const x = parseRange(s);
  if (!x) throw new Error(`${what}: a range such as "A1:D40", columns "C:E", rows "2:40", or one cell (the table around it).`);
  if (x.r1 === x.r2 && x.c1 === x.c2) return around(x.r1, x.c1);
  if (x.r1 === 0 && x.r2 === MAX_ROWS - 1) return { x: { ...x, r2: Math.max(0, e.rows - 1) }, around: true };
  if (x.c1 === 0 && x.c2 === MAX_COLS - 1) return { x: { ...x, c2: Math.max(0, e.cols - 1) }, around: false };
  return { x, around: false };
}

/** Whether a table's first row is its header: as said, else as the editor tells it (words over numbers, or bold over plain). */
const headerOf = (at: At, x: Rect, around: boolean, v: unknown) => (typeof v === 'boolean' ? v : around && hasHeader(at.sh, at.calc, at.si, x));

/** The columns of a table, for an answer: "A (Date), B (Item)". */
const columnNames = (at: At, x: Rect, head: boolean) =>
  Array.from({ length: Math.min(30, x.c2 - x.c1 + 1) }, (_, j) => {
    const c = x.c1 + j;
    const h = head ? shown(at, x.r1, c).trim() : '';
    return h ? `${colName(c)} (${h.slice(0, 30)})` : colName(c);
  }).join(', ');

/** A column of a table, by its letters or its header's words. */
function columnIn(at: At, x: Rect, head: boolean, v: unknown, what: string): number {
  const s = str(v);
  if (/^[A-Za-z]{1,3}$/.test(s)) {
    const c = colIndex(s);
    if (c >= x.c1 && c <= x.c2) return c;
  }
  if (head && s) for (let c = x.c1; c <= x.c2; c++) if (shown(at, x.r1, c).trim().toLowerCase() === s.toLowerCase()) return c;
  throw new Error(`${what}: there is no column ${quote(s || '(none given)')} in ${rangeName(x)} of “${at.sh.name}”; its columns are ${columnNames(at, x, head)}.`);
}

/** A column's name for an answer: "C (Amount)". */
const colLabel = (at: At, x: Rect, head: boolean, c: number) => {
  const h = head ? shown(at, x.r1, c).trim() : '';
  return h ? `${colName(c)} (${h.slice(0, 30)})` : colName(c);
};

/** Data → Sort range, or Sort sheet by a column (shared/sheet-tools.ts): whole rows move, their formulas and comments along. */
const sort: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const { x, around } = tableOf(at, a.range);
  const head = headerOf(at, x, around, a.header_row);
  const body = head ? { ...x, r1: x.r1 + 1 } : x;
  if (body.r2 <= body.r1) throw new Error(`There is nothing to sort in ${rangeName(x)} of “${at.sh.name}”: it has ${body.r2 < body.r1 ? 'no rows' : 'one row'}${head ? ' under its header' : ''}.`);
  const by = listOf(a.by);
  if (!by.length) throw new Error(`by: the column to sort by (its letter, or its header’s words), or a list of them; the table’s columns are ${columnNames(at, x, head)}.`);
  const desc = a.descending === true;
  const keys = by.map((k) => (isObj(k) ? { c: columnIn(at, x, head, k.column ?? k.col, 'by'), asc: !(k.descending === true || k.desc === true) } : { c: columnIn(at, x, head, k, 'by'), asc: !desc }));
  const moved = new Map<number, number>();
  const changes = keys.length === 1 ? sortChanges(at.sh, at.calc, at.si, body, keys[0].c, keys[0].asc, moved) : sortByKeys(at.sh, at.calc, at.si, body, keys, moved);
  let next = withCells(book, at.si, changes);
  const comments = commentsAfterSort(at.sh, body, moved);
  if (comments) next = withSheet(next, at.si, { comments });
  const how = keys.map((k) => `${colLabel(at, x, head, k.c)} ${k.asc ? 'A to Z (smallest first)' : 'Z to A (largest first)'}`).join(', then ');
  return {
    model: next,
    said: `sorted ${rangeName(body)} of “${at.sh.name}” (${plural(body.r2 - body.r1 + 1, 'row')}) by ${how}${head ? `; its header row (${x.r1 + 1}) stayed on top` : ''}; formulas moved with their rows${comments ? `, and the comments did too` : ''}.`,
  };
};

/** Data → Remove duplicates (shared/sheet-tools.ts): rows that repeat one above them in the columns given go, the rest move up. */
const dedupe: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const { x, around } = tableOf(at, a.range);
  const head = headerOf(at, x, around, a.header_row);
  const given = listOf(a.columns);
  const cols = given.length ? [...new Set(given.map((v) => columnIn(at, x, head, v, 'columns')))] : Array.from({ length: x.c2 - x.c1 + 1 }, (_, j) => x.c1 + j);
  const got = removeDuplicates(at.sh, at.calc, at.si, x, head, cols);
  const over = cols.length === x.c2 - x.c1 + 1 ? 'every column' : `${cols.length === 1 ? 'column' : 'columns'} ${cols.map((c) => colLabel(at, x, head, c)).join(', ')}`;
  if (!got.removed) return { said: `No row of ${rangeName(x)} in “${at.sh.name}” repeats one above it in ${over}.` };
  return { model: withCells(book, at.si, got.changes), said: `took ${plural(got.removed, 'duplicate row')} out of ${rangeName(x)} in “${at.sh.name}” (the same as a row above in ${over}${head ? ', under its header row' : ''}); the rows under them moved up.` };
};

/** A range given for an action that changes cells in place (not a table found around a cell). */
function rangeIn(at: At, v: unknown, what: string, example: string): Rect {
  const s = str(v);
  if (!s) throw new Error(`${what}: the cells, such as ${example}.`);
  const x = parseRange(s);
  if (!x) throw new Error(`${what}: a range such as ${example}.`);
  const e = at.calc.extent(at.si);
  // Whole columns or rows: as far as the sheet holds.
  if (x.r1 === 0 && x.r2 === MAX_ROWS - 1) x.r2 = Math.max(0, e.rows - 1);
  if (x.c1 === 0 && x.c2 === MAX_COLS - 1) x.c2 = Math.max(0, e.cols - 1);
  return x;
}

/** Edit → Fill down (Ctrl+D) or Fill right (Ctrl+R) (shared/sheet-tools.ts fillChanges). */
const fill: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const dir = str(a.direction).toLowerCase() || 'down';
  if (dir !== 'down' && dir !== 'right') throw new Error('direction: down (the first row copied down the range) or right (the first column copied across it).');
  const x = rangeIn(at, a.range, 'range', '"B2:B20" (its first row copied down it)');
  const down = dir === 'down';
  const changes = fillChanges(at.sh, x, down);
  if (!Object.keys(changes).length) throw new Error(`Nothing to fill from in ${rangeName(x)}: a cell alone takes the one ${down ? 'above' : 'to its left'}, a range its first ${down ? 'row' : 'column'}.`);
  const from = down ? (x.r1 === x.r2 ? `row ${x.r1}` : `row ${x.r1 + 1}`) : x.c1 === x.c2 ? `column ${colName(x.c1 - 1)}` : `column ${colName(x.c1)}`;
  return { model: withCells(book, at.si, changes), said: `filled ${rangeName(x)} of “${at.sh.name}” ${down ? 'down' : 'right'} from ${from}: values and looks copied, formulas moving as copied ones do.` };
};

/** Edit → Clear, and Format → Clear formatting (shared/sheet-tools.ts). */
const clear: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const what = str(a.what).toLowerCase() || 'contents';
  if (!['contents', 'formatting', 'all'].includes(what)) throw new Error('what: contents (what the cells hold; their looks and notes stay), formatting (their looks only) or all.');
  const x = rangeIn(at, a.range, 'range', '"B2:D9"');
  const changes = what === 'formatting' ? styleChanges(at.sh, at.calc, at.si, x, () => undefined) : clearChanges(at.sh, at.calc, at.si, x, what === 'all');
  const next = withCells(book, at.si, changes);
  if (JSON.stringify(next.sheets[at.si].cells) === JSON.stringify(at.sh.cells)) return { said: `${rangeName(x)} of “${at.sh.name}” has nothing to clear.` };
  return { model: next, said: `cleared ${what === 'formatting' ? 'the looks of' : what === 'all' ? 'everything in' : 'what is in'} ${rangeName(x)} of “${at.sh.name}”${what === 'contents' ? ' (its looks and notes stayed)' : ''}.` };
};

/** Data → Trim spaces (shared/sheet-tools.ts), on the range given or every cell of the sheet. */
const trim: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const e = at.calc.extent(at.si);
  const x = a.range === undefined ? { r1: 0, c1: 0, r2: Math.max(0, e.rows - 1), c2: Math.max(0, e.cols - 1) } : rangeIn(at, a.range, 'range', '"A2:A40"');
  const got = trimChanges(at.sh, at.calc, at.si, x);
  if (!got.count) return { said: `No cell of ${a.range === undefined ? `“${at.sh.name}”` : `${rangeName(x)} in “${at.sh.name}”`} has spaces to take off.` };
  return { model: withCells(book, at.si, got.changes), said: `trimmed ${plural(got.count, 'cell')} of ${a.range === undefined ? `“${at.sh.name}”` : `${rangeName(x)} in “${at.sh.name}”`}: spaces off the ends of their words, and runs of them made one.` };
};

const SEPARATORS: Record<string, string> = { comma: ',', semicolon: ';', tab: '\t', space: ' ', pipe: '|' };
const sepName = (s: string) => Object.entries(SEPARATORS).find(([, v]) => v === s)?.[0] ?? `“${s}”`;

/** Data → Split text to columns (shared/sheet-tools.ts): one column's words into the columns to its right. */
const split: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const x0 = rangeIn(at, a.range, 'range', '"A2:A40" (one column’s cells)');
  if (x0.c1 !== x0.c2) throw new Error(`range: one column’s cells, such as "${colName(x0.c1)}2:${colName(x0.c1)}40"; ${rangeName(x0)} is several columns.`);
  const e = at.calc.extent(at.si);
  const b: Rect = { ...x0, r2: Math.min(x0.r2, Math.max(x0.r1, e.rows - 1)) };
  const given = str(a.separator);
  let sep = given ? (SEPARATORS[given.toLowerCase()] ?? given) : '';
  if (!sep) {
    const texts: string[] = [];
    for (let r = b.r1; r <= Math.min(b.r2, b.r1 + 200); r++) texts.push(shown(at, r, b.c1));
    sep = guessSeparator(texts);
  }
  const got = splitColumn(at.sh, at.calc, at.si, b, sep);
  if (!Object.keys(got.changes).length) return { said: `No cell of ${rangeName(b)} in “${at.sh.name}” has a ${sepName(sep)} to split it by.` };
  // Cells to the right that hold something are written over: the editor asks first, so this needs overwrite.
  const over = Object.keys(got.changes).filter((k) => {
    const m = /^([A-Z]+)/.exec(k);
    return m && colIndex(m[1]) > b.c1 && holds(at.sh.cells[k]);
  });
  if (over.length && a.overwrite !== true) throw new Error(`Splitting ${rangeName(b)} by ${sepName(sep)} would write over ${plural(over.length, 'cell')} to its right (${over.slice(0, 6).join(', ')}${over.length > 6 ? '…' : ''}): give overwrite: true to go ahead, or insert_columns first to make room.`);
  return { model: withCells(book, at.si, got.changes), said: `split ${rangeName(b)} of “${at.sh.name}” by ${sepName(sep)} into ${plural(got.cols, 'column')} (${colName(b.c1)} to ${colName(b.c1 + got.cols - 1)})${over.length ? `, over what ${plural(over.length, 'cell')} held` : ''}.` };
};

const FNS: SummaryFn[] = ['sum', 'count', 'average', 'min', 'max'];

/** Data → Summarize by (shared/sheet-tools.ts summarySheet): a new sheet of formulas summing the table up, after this one. */
const summarize: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  if (book.sheets.length >= SHEET_LIMITS.sheets) throw new Error(`The spreadsheet has ${SHEET_LIMITS.sheets} sheets, as many as it may hold: delete one first.`);
  const { x, around } = tableOf(at, a.range);
  const head = headerOf(at, x, around, a.header_row);
  if (!head || x.r2 <= x.r1) throw new Error(`summarize needs a table with a header row (its columns’ names) and rows under it; ${rangeName(x)} of “${at.sh.name}” ${x.r2 <= x.r1 ? 'has one row' : 'has no header row (header_row: true says its first row is one)'}.`);
  const by = columnIn(at, x, head, a.by, 'by');
  const across = a.across === undefined || a.across === null || a.across === '' ? null : columnIn(at, x, head, a.across, 'across');
  const vals = listOf(a.values).map((v) => {
    const o = isObj(v) ? v : { column: v };
    const fn = (str(o.fn).toLowerCase() || 'sum') as SummaryFn;
    if (!FNS.includes(fn)) throw new Error(`values: each {column, fn}, fn one of ${FNS.join(', ')}.`);
    return { c: columnIn(at, x, head, o.column ?? o.col, 'values'), fn };
  });
  const values = vals.length ? (across === null ? vals : vals.slice(0, 1)) : [{ c: by, fn: 'count' as SummaryFn }];
  const made = summarySheet(at.sh, at.calc, at.si, x, by, across, values, `Summary of ${at.sh.name}`.slice(0, 31));
  const name = uniqueSheetName(made.name, book.sheets.map((s) => s.name));
  const { id: _id, ...sheet } = made;
  const next: Workbook = { ...book, sheets: [...book.sheets.slice(0, at.si + 1), { ...sheet, name } as Sheet, ...book.sheets.slice(at.si + 1)] };
  const what = values.map((v) => `${v.fn === 'count' ? 'the count' : v.fn === 'min' ? 'the lowest' : v.fn === 'max' ? 'the highest' : v.fn === 'average' ? 'the average' : 'the sum'} of ${colLabel(at, x, head, v.c)}`).join(', ');
  return { model: next, said: `added the sheet “${name}” after “${at.sh.name}”: ${what} for each value of ${colLabel(at, x, head, by)}${across !== null ? ` and each of ${colLabel(at, x, head, across)}` : ''}, as formulas that keep up with ${rangeName(x)}, and a total.` };
};

/** A row's or column's place (from 0) given as its number or letters. */
function placeOf(v: unknown, axis: 'row' | 'col', what: string): number {
  const s = str(v);
  const n = axis === 'row' ? (/^\d+$/.test(s) ? Number(s) - 1 : -1) : /^\d+$/.test(s) ? Number(s) - 1 : colIndex(s);
  const max = axis === 'row' ? SHEET_LIMITS.rows : SHEET_LIMITS.cols;
  if (n < 0 || n >= max) throw new Error(`${what}: ${axis === 'row' ? `a row’s number, 1 to ${max}` : `a column’s letters ("C"), A to ${colName(max - 1)}`}.`);
  return n;
}

/** How many to put in (1 when left out). */
function countOf(v: unknown, max: number): number {
  if (v === undefined || v === null || v === '') return 1;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`count: 1 to ${max}.`);
  return n;
}

/** Insert → Rows above or below, Columns left or right (shared/sheets.ts adjustForInsert: every formula that points past them follows). */
const insertLines =
  (axis: 'row' | 'col'): Act<Workbook> =>
  (book, a) => {
    const at = sheetAt(book, a.sheet);
    const i = placeOf(a.at, axis, 'at');
    const n = countOf(a.count, axis === 'row' ? 1000 : 100);
    const name = (k: number) => (axis === 'row' ? String(k + 1) : colName(k));
    const next = adjustForInsert(book, at.sh.id, axis, i, n);
    const lines = axis === 'row' ? plural(n, 'empty row') : plural(n, 'empty column');
    return { model: next, said: `put ${lines} in “${at.sh.name}” at ${axis === 'row' ? 'row' : 'column'} ${name(i)}${n > 1 ? ` to ${name(i + n - 1)}` : ''}: what was ${axis === 'row' ? 'row' : 'column'} ${name(i)} is ${name(i + n)} now, and every formula that pointed there follows it.` };
  };

/** The rows ("5", "5:7") or columns ("C", "C:D") given, as runs from 0, the last first (so each leaves the others where they are). */
function linesOf(v: unknown, axis: 'row' | 'col', what: string): [number, number][] {
  const given = listOf(v);
  if (!given.length) throw new Error(`${what}: ${axis === 'row' ? 'the rows, such as "5" or "5:7"' : 'the columns, such as "C" or "C:D"'}.`);
  const runs: [number, number][] = [];
  for (const g of given) {
    const [p, q = p] = str(g).split(':');
    const a = placeOf(p, axis, what);
    const b = placeOf(q, axis, what);
    runs.push([Math.min(a, b), Math.max(a, b)]);
  }
  // Runs that meet or overlap as one, the last first.
  runs.sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out.reverse();
}

/** Delete rows, Delete columns (shared/sheets.ts adjustForDelete: formulas follow; a reference to a cell that went becomes #REF!). */
const deleteLines =
  (axis: 'row' | 'col'): Act<Workbook> =>
  (book, a) => {
    const at = sheetAt(book, a.sheet);
    const runs = linesOf(axis === 'row' ? a.rows : a.columns, axis, axis === 'row' ? 'rows' : 'columns');
    let next = book;
    for (const [from, to] of runs) next = adjustForDelete(next, at.sh.id, axis, from, to - from + 1);
    const name = (k: number) => (axis === 'row' ? String(k + 1) : colName(k));
    const n = runs.reduce((s, [p, q]) => s + q - p + 1, 0);
    const which = runs
      .slice()
      .reverse()
      .map(([p, q]) => (p === q ? name(p) : `${name(p)}:${name(q)}`))
      .join(', ');
    return { model: next, said: `took ${axis === 'row' ? plural(n, 'row') : plural(n, 'column')} (${which}) out of “${at.sh.name}”: those after moved ${axis === 'row' ? 'up' : 'left'}, formulas followed them, and a reference to a cell that went is #REF! now.` };
  };

/** A sheet tab's Rename (shared/sheets.ts renameSheet: the formulas that name it change too). */
const renameTab: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const name = str(a.name);
  if (!name) throw new Error('name: the sheet’s new name.');
  const next = renameSheet(book, at.sh.id, name);
  const now = next.sheets.find((s) => s.id === at.sh.id)!.name;
  if (next === book || now === at.sh.name) return { said: `The sheet is called “${at.sh.name}” already.` };
  return { model: next, said: `renamed the sheet “${at.sh.name}” to “${now}”${now !== name ? ` (as a sheet may be named)` : ''}; the formulas that name it name it so now.` };
};

/** A sheet tab's Duplicate: a copy of it right after it, as the editor makes one. */
const duplicateTab: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  if (book.sheets.length >= SHEET_LIMITS.sheets) throw new Error(`The spreadsheet has ${SHEET_LIMITS.sheets} sheets, as many as it may hold.`);
  const { id: _id, comments: _c, ...copy } = structuredClone(at.sh);
  const name = uniqueSheetName(str(a.name) || at.sh.name, book.sheets.map((s) => s.name));
  const next: Workbook = { ...book, sheets: [...book.sheets.slice(0, at.si + 1), { ...copy, name } as Sheet, ...book.sheets.slice(at.si + 1)] };
  return { model: next, said: `added “${name}”, a copy of “${at.sh.name}” (its cells, looks, rules and charts; not its comments), right after it.` };
};

/** A sheet tab's Delete this sheet (shared/sheets.ts removeSheet: formulas that used it show #REF!). */
const deleteTab: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  if (str(a.sheet) === '') throw new Error('sheet: the sheet to delete, by its name or id.');
  if (book.sheets.length < 2) throw new Error('A spreadsheet keeps at least one sheet: this is its only one.');
  return { model: removeSheet(book, at.sh.id), said: `deleted the sheet “${at.sh.name}”: formulas of the other sheets that used its cells show #REF! now (an older version still has it).` };
};

/** A sheet tab's Move left and Move right, to any place. */
const moveTab: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const to = Number(a.to);
  if (!Number.isInteger(to) || to < 1 || to > book.sheets.length) throw new Error(`to: the sheet’s new place, 1 to ${book.sheets.length}.`);
  if (to - 1 === at.si) return { said: `“${at.sh.name}” is sheet ${to} already.` };
  const list = [...book.sheets];
  const [s] = list.splice(at.si, 1);
  list.splice(to - 1, 0, s);
  return { model: { ...book, sheets: list }, said: `moved “${at.sh.name}” to be sheet ${to} of ${list.length}.` };
};

/** The AI cells that wait for an answer (=AI(…) an agent wrote, or whose cells changed): the helper model asked for them, many at once. */
const askAi: Act<Workbook> = async (book, a, x) => {
  const calc = computeBook(book);
  calc.all();
  const want = new Map(calc.aiAsks().map((q) => [q.key, q]));
  // Asked again: the answers of the cells named (or all) forgotten first.
  if (a.again === true) {
    const bare = computeBook({ ...book, ai: undefined });
    bare.all();
    for (const q of bare.aiAsks()) want.set(q.key, q);
  }
  if (!want.size) return { said: 'No AI cell waits for an answer.' };
  const list = [...want.values()].slice(0, 400);
  const ai = { ...(book.ai ?? {}) };
  let got = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += AI_BATCH) {
    const r = await aiCells(x.ctx.deps.db, { asks: list.slice(i, i + AI_BATCH) }, AbortSignal.timeout(600_000));
    Object.assign(ai, r.answers);
    got += Object.keys(r.answers).length;
    failed += Object.keys(r.failed ?? {}).length;
  }
  if (!got) return { said: `The helper model gave no answers for the ${plural(list.length, 'AI cell')}: try again.` };
  return { model: { ...book, ai }, said: `asked the helper model for ${plural(got, 'AI cell')}${failed ? ` (${failed} got no answer)` : ''}${want.size > list.length ? `; ${want.size - list.length} more still wait: run it again` : ''}: their answers are kept with the sheet.` };
};

/** Data → Pivot table (shared/sheet-pivot.ts): a sheet of formulas summing the table up by columns for its rows (and across), its filters leaving values out. */
const pivotTable: Act<Workbook> = (book, a, x) => {
  const at = sheetAt(book, a.sheet);
  if (book.sheets.length >= SHEET_LIMITS.sheets) throw new Error(`The spreadsheet has ${SHEET_LIMITS.sheets} sheets, as many as it may hold: delete one first.`);
  const t = tableOf(at, a.range);
  const head = headerOf(at, t.x, t.around, a.header_row);
  if (!head || t.x.r2 <= t.x.r1) throw new Error(`pivot_table needs a table with a header row and rows under it; ${rangeName(t.x)} of “${at.sh.name}” has ${t.x.r2 <= t.x.r1 ? 'one row' : 'no header row'}.`);
  const colOf = (v: unknown, what: string) => colName(columnIn(at, t.x, head, v, what));
  const rows = (Array.isArray(a.rows) ? a.rows : [a.rows ?? a.by]).slice(0, 2).map((v) => colOf(v, 'rows'));
  const values = listOf(a.values).map((v) => (isObj(v) ? { col: colOf(v.column ?? v.col, 'values'), fn: (['sum', 'count', 'average', 'min', 'max'].includes(str(v.fn)) ? str(v.fn) : 'sum') as 'sum' } : { col: colOf(v, 'values'), fn: 'sum' as const }));
  if (!values.length) throw new Error('values: [{column, fn: sum|count|average|min|max}], the columns it sums up.');
  const filters = listOf(a.filters).flatMap((f) => (isObj(f) ? [{ col: colOf(f.column ?? f.col, 'filters'), hide: listOf(f.hide).map((h) => str(h)) }] : []));
  const def = { source: `${quoteSheet(at.sh.name)}!${rangeName(t.x)}`, rows, ...(a.across !== undefined ? { cols: colOf(a.across, 'across') } : {}), values, ...(filters.length ? { filters } : {}) };
  const name = uniqueSheetName(str(a.name) || `Pivot of ${at.sh.name}`.slice(0, 31), book.sheets.map((s) => s.name));
  const made = pivotSheet(book, at.calc, def, name);
  if (!made) throw new Error('That table cannot be summed up: give a range with a header row, and columns of it for the rows and values.');
  const { id: _id, ...sheet } = made;
  void x;
  return { model: { ...book, sheets: [...book.sheets.slice(0, at.si + 1), { ...sheet, name } as Sheet, ...book.sheets.slice(at.si + 1)] }, said: `added the pivot table “${name}” after “${at.sh.name}”, of formulas that keep up with ${rangeName(t.x)}; the user changes it with Data → Edit the pivot table.` };
};

/** Tools → Goal seek (shared/sheet-whatif.ts): the value of a cell that makes a formula give the result wanted, put in. */
const goalSeekAct: Act<Workbook> = (book, a) => {
  const at = sheetAt(book, a.sheet);
  const set = str(a.cell ?? a.set).toUpperCase();
  const by = str(a.changing ?? a.by_changing ?? a.by).toUpperCase();
  const to = Number(a.to ?? a.value);
  if (!/^[A-Z]{1,3}\d+$/.test(set) || at.sh.cells[set]?.f === undefined) throw new Error('cell: the cell of the formula to set ("C10").');
  if (!/^[A-Z]{1,3}\d+$/.test(by) || at.sh.cells[by]?.f !== undefined) throw new Error('changing: a cell of a number the formula uses ("B2"), not a formula.');
  if (!Number.isFinite(to)) throw new Error('to: the number the formula is to give.');
  const r = goalSeek(book, at.si, set, to, by);
  if (!r) throw new Error(`${set} gives no number with any value of ${by}.`);
  const cells = { ...at.sh.cells, [by]: { ...(at.sh.cells[by] ?? {}), v: r.value } };
  return { model: withSheet(book, at.si, { cells }), said: r.reached ? `set ${by} to ${r.value}: ${set} gives ${Number(r.result.toPrecision(12))} now.` : `found no value of ${by} that makes ${set} give ${to}; the nearest, ${r.value} (${set} gives ${Number(r.result.toPrecision(12))}), was put in.` };
};

// ---- LaTeX ------------------------------------------------------------------------------------------------------------

/** The files tree's Rename and moves (shared/latex-files.ts texMoveFiles): every reference to a file follows it. */
const moveFiles: Act<TexDoc> = (d, a) => {
  const raw = listOf(a.moves);
  if (!raw.length) throw new Error('moves: a list of {"from": "…", "to": "…"}: a file, a picture, or a folder ending in "/" with all in it.');
  const names = [...d.files.map((f) => f.name), ...d.pictures.map((p) => p.name)];
  const isPicture = (n: string) => d.pictures.some((p) => p.name === n);
  const moves: [string, string][] = [];
  for (const m of raw) {
    const from = str(Array.isArray(m) ? m[0] : isObj(m) ? m.from : '');
    const to = str(Array.isArray(m) ? m[1] : isObj(m) ? m.to : '');
    if (!from || !to) throw new Error('moves: each {"from": "chapters/intro.tex", "to": "parts/intro.tex"}.');
    if (from === TEX_MAIN || to === TEX_MAIN) throw new Error('main.tex is the file TeX typesets: it keeps its name and place.');
    if (from.endsWith('/')) {
      const dir = to.endsWith('/') ? to : `${to}/`;
      const inside = names.filter((n) => n.startsWith(from));
      if (!inside.length) throw new Error(`There is no folder “${from}” in the document.`);
      for (const n of inside) moves.push([n, dir + n.slice(from.length)]);
      continue;
    }
    if (!names.includes(from)) throw new Error(`There is no file or picture “${from}” in the document; it has ${[TEX_MAIN, ...names].join(', ')}.`);
    moves.push([from, to.endsWith('/') ? to + from.split('/').pop() : to]);
  }
  const leaving = new Set(moves.map(([f]) => f));
  const taken = new Set([TEX_MAIN, ...names.filter((n) => !leaving.has(n))].map((n) => n.toLowerCase()));
  for (const [f, t] of moves) {
    const kind = isPicture(f) ? 'picture' : 'file';
    if (cleanTexName(t, kind) !== t) throw new Error(`“${t}” is not a name a document’s ${kind} may have: letters, digits, spaces, _ + - and dots, in a few folders at most, ending as ${kind === 'picture' ? 'a picture does (.png, .jpg, .pdf…)' : 'its kind does (.tex, .bib, .sty…)'}.`);
    if (taken.has(t.toLowerCase())) throw new Error(`There is a file “${t}” already.`);
    taken.add(t.toLowerCase());
  }
  const next = texMoveFiles(d, moves);
  const texts = (x: TexDoc) => [x.main, ...x.files.map((f) => f.text)];
  const before = texts(d);
  const changed = texts(next).filter((t, i) => t !== before[i]).length;
  return { model: next, said: `moved ${moves.map(([f, t]) => `${f} → ${t}`).join(', ')}${changed ? `; the references to them in ${plural(changed, 'file')} name them where they are now` : ''}, and their comments and tracked changes went with them.` };
};

/** A LaTeX document's .tex files by name (all of them when none are given). */
function texFilesOf(d: TexDoc, given: unknown): string[] {
  const all = [TEX_MAIN, ...d.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.name)];
  const names = listOf(given).map(str).filter(Boolean);
  for (const n of names) if (!all.includes(n)) throw new Error(`There is no .tex file “${n}” in the document; it has ${all.join(', ')}.`);
  return names.length ? names : all;
}

const setText = (d: TexDoc, name: string, text: string): TexDoc => (name === TEX_MAIN ? { ...d, main: text } : { ...d, files: d.files.map((f) => (f.name === name ? { ...f, text } : f)) });

/** Edit → Tidy the source (shared/latex-tidy.ts): lines indented by what they are in, tables' cells lined up at their &. */
const tidySource: Act<TexDoc> = (d, a) => {
  let next = d;
  let lines = 0;
  let tables = 0;
  const touched: string[] = [];
  for (const name of texFilesOf(d, a.files)) {
    const r = tidyTex(texFileText(d, name) ?? '', { align: a.align !== false });
    if (!r.lines) continue;
    next = setText(next, name, r.text);
    lines += r.lines;
    tables += r.tables;
    touched.push(name);
  }
  if (!touched.length) return { said: 'The source is tidy already: nothing changed.' };
  return { model: next, said: `tidied ${touched.join(', ')}: ${plural(lines, 'line')} indented anew${tables ? `, the cells of ${plural(tables, 'table')} lined up` : ''}; no line’s own text changed.` };
};

/** Tools → Tidy the bibliography (shared/latex-bibtidy.ts): sorted, duplicates merged, keys fixed, fields filled from DOIs, unused out. */
const tidyBibliography: Act<TexDoc> = async (d, a, x) => {
  const bibs = d.files.filter((f) => f.name.endsWith('.bib')).map((f) => f.name);
  const name = str(a.file) || bibs[0];
  if (!name || !bibs.includes(name)) throw new Error(bibs.length ? `file: one of the document’s bibliographies, ${bibs.join(', ')}.` : 'The document has no .bib file of its own to tidy.');
  const texs = [d.main, ...d.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.text)];
  const cited = citedKeys(texs);
  const bib = texFileText(d, name) ?? '';
  const on = (k: string, dflt: boolean) => (a[k] === undefined ? dflt : a[k] === true);
  let fill: Map<string, BibEntry> | undefined;
  const notes: string[] = [];
  if (on('fill', true)) {
    const need = bibNeedsFill(bib).slice(0, 60);
    if (need.length) {
      const got = await bibtexForDois(
        need.map((n) => n.doi),
        x.ctx.signal,
      ).catch((e) => (notes.push(`The DOIs could not be looked up: ${(e as Error).message}`), null));
      fill = new Map();
      for (const n of need) {
        const e = got?.entries[n.doi] ? fillEntry(got.entries[n.doi]) : null;
        if (e) fill.set(n.key, e);
      }
      if (got?.missing.length) notes.push(`doi.org had no record for ${plural(got.missing.length, 'DOI')}: ${got.missing.slice(0, 6).join(', ')}.`);
    }
  }
  const r = tidyBib(bib, cited, { sort: on('sort', true), duplicates: on('duplicates', true), keys: on('keys', true), unused: on('unused', false), format: on('format', false) }, fill);
  if (r.text === bib && !Object.keys(r.renames).length) return { said: `${name} is tidy already: nothing changed.`, notes };
  let next = setText(d, name, r.text);
  let cites = 0;
  for (const f of [TEX_MAIN, ...d.files.filter((y) => /\.(tex|ltx)$/i.test(y.name)).map((y) => y.name)]) {
    const before = texFileText(next, f) ?? '';
    const after = renameCites(before, r.renames);
    if (after !== before) {
      next = setText(next, f, after);
      cites++;
    }
  }
  const what = r.changes.map((c) => `- ${c.what}`).join('\n');
  return { model: next, said: `tidied ${name}${cites ? ` (and the citations in ${plural(cites, 'file')})` : ''}:\n${what || '- its entries written anew.'}`, notes };
};

// ---- notebooks --------------------------------------------------------------------------------------------------------

/** Clear all outputs (as the notebook's own: each code cell's outputs and run count), or those of the cells named. */
const clearOutputs: Act<Json> = (nb, a) => {
  const cells: Json[] = Array.isArray(nb.cells) ? nb.cells : [];
  const given = listOf(a.cells);
  const want = new Set<number>();
  for (const g of given) {
    const s = str(g);
    const i = /^\d+$/.test(s) ? Number(s) - 1 : cells.findIndex((c) => c.id === s);
    if (i < 0 || i >= cells.length) throw new Error(`cells: there is no cell ${quote(s || '(none given)')}: the notebook has ${cells.length}, numbered from 1 (or name them by their ids).`);
    want.add(i);
  }
  let n = 0;
  const next = cells.map((c, i) => {
    if (c.cell_type !== 'code' || (want.size && !want.has(i)) || (!(Array.isArray(c.outputs) && c.outputs.length) && c.execution_count == null)) return c;
    n++;
    return { ...c, outputs: [], execution_count: null };
  });
  if (!n) return { said: `No ${want.size ? 'cell of those' : 'cell'} has outputs to clear.` };
  return { model: { ...nb, cells: next }, said: `cleared the outputs of ${plural(n, 'code cell')}.` };
};

// ---- every kind -------------------------------------------------------------------------------------------------------

const ACTIONS: { [K in PageKind]: Record<string, Act<any>> } = {
  slides: { animate, fix_accessibility: fixAccessibility, describe_pictures: describePictures, powerpoint, theme, slide_shape: slideShape, reuse_slides: reuse, update_charts: updateCharts },
  doc: { accept_suggestions: suggestions(true), reject_suggestions: suggestions(false), page_setup: pageSetup, header_footer: headerFooter },
  sheet: {
    sort,
    remove_duplicates: dedupe,
    fill,
    clear,
    trim_spaces: trim,
    split_text: split,
    summarize,
    insert_rows: insertLines('row'),
    insert_columns: insertLines('col'),
    delete_rows: deleteLines('row'),
    delete_columns: deleteLines('col'),
    rename_sheet: renameTab,
    duplicate_sheet: duplicateTab,
    delete_sheet: deleteTab,
    move_sheet: moveTab,
    ask_ai: askAi,
    pivot_table: pivotTable,
    goal_seek: goalSeekAct,
  },
  tex: { move_files: moveFiles, tidy_source: tidySource, tidy_bibliography: tidyBibliography },
  notebook: { clear_outputs: clearOutputs },
};

/** Every action's name: those of each kind, and those of any kind. */
export const PAGE_ACTIONS = [...Object.values(ACTIONS).flatMap((m) => Object.keys(m)), ...Object.keys(HTML_ACTIONS), 'turn_into', 'duplicate'];

const NOUN: Record<PageKind | 'page', string> = { slides: 'slide deck', doc: 'document', sheet: 'spreadsheet', tex: 'LaTeX document', notebook: 'notebook', page: 'page' };

/** The actions there are for a kind of page, for the agent beside one (index.ts askInstructions) and for errors. */
export const actionsFor = (kind: PageKind | 'page') => [...(kind === 'page' ? Object.keys(HTML_ACTIONS) : Object.keys(ACTIONS[kind])), 'turn_into', 'duplicate'];

/**
 * The Library's Turn it into (shared/content-asks.ts turnAsk): what the app asks an agent for, to make slides, a document
 * or a page from it; the agent does it with its save tool, and the page itself stays as it is.
 */
function turnInto(x: Here, a: Args): string {
  const { page } = x;
  const from = page.kind && kindOf(page.kind) ? page.kind : 'page';
  const to = str(a.to).toLowerCase();
  const can = TURN_INTO[from];
  if (!(can as string[]).includes(to)) throw new Error(`to: a ${NOUN[from]} turns into ${can.map((k) => (k === 'slides' ? 'slides' : k === 'doc' ? 'a document (doc)' : 'a page')).join(', ')}.`);
  const folder = page.folder ? folderPath(x.ctx.deps.db, page.folder) : '';
  const ask = turnAsk({ from, to: to as 'slides' | 'doc' | 'page', id: page.id, title: page.title, folder: folder || undefined });
  return `Nothing is changed yet. What the Library’s Turn it into asks for, to do now with ${to === 'slides' ? 'save_slides' : to === 'doc' ? 'save_doc' : 'save_page'} (keep it in their Library; it shows them where it is): ${ask}`;
}

/** Duplicate in the Library: a copy beside it (its data stays with the first), made by the agent. */
function duplicate(x: Here, a: Args): string {
  const { ctx, page } = x;
  const db = ctx.deps.db;
  const cur = pageSource(db, page.id)!;
  const title = str(a.title) || `${page.title} (copy)`;
  // Beside it, saying what it is as the first does (main's copyPage keeps the description too).
  const place = { by: 'agent' as const, sessionKey: ctx.key, space: page.space ?? null, folder: page.folder ?? null, description: page.description };
  const p = cur.kind === 'page' ? createPage(db, { title, html: cur.text, ...place }) : createPage(db, { title, kind: cur.kind, model: mustKind(cur.kind).read(cur.text), ...place });
  ctx.deps.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  refreshThumbs(ctx.deps, [p.id]);
  return `Saved "${p.title}" (page ${p.id}, version 1): a copy of “${page.title}” (page ${page.id}), beside it in the Library${cur.kind === 'page' ? ', without the data the page stores' : ''}. The first is as it was.`;
}

const DESCRIPTION = [
  'Do to a saved page of the user’s Library what its editor does with one click to the whole of it, where a save tool (save_slides, save_doc, save_sheet, save_latex, save_notebook) would have you write it all out yourself.',
  'Each runs the editor’s own code on the version kept now and keeps a new version (the older ones restorable; the user’s changes and comments stay), which the editor open on it shows at once; it answers what changed.',
  'Free and instant, but describe_pictures (a model looks at each picture) and ask_ai (the helper model answers each AI cell). Give id (get_page lists them) and action, with its fields:',
  'Slide decks.',
  '- animate {style: subtle|lively|bold|none, slides?}: animate every slide (or the slides listed, by number or id) as Animate → Animate every slide does: the title first, then the words a row at a time, bullets one by one, pictures after; Morph between slides that share parts; none takes every animation and transition off.',
  '- fix_accessibility {slides?}: put right what Tools → Check accessibility can (small words, colours that stand out too little, titles and the order they are read in, videos that start with their sound, tables without a header row); it lists what is left.',
  '- describe_pictures {slides?, parts?: [part ids]}: a description (alt) for each picture without one (or those listed), written by the model that describes the Library’s pictures (Settings → Images, video and audio; it may cost a little); up to 12 a call.',
  '- powerpoint {on: true|false}: PowerPoint compatible (what PowerPoint lacks becomes pictures or its nearest effects; it says what changed) when the user wants a file for PowerPoint, Keynote or Google Slides; false puts it back in the web format.',
  `- theme {theme: ${THEMES.map((t) => t.id).join('|')} or one of the user’s own themes by its name}: its colours and fonts on every slide, and a theme of the user’s own brings its logo (the Theme tab’s Ready-made and My themes).`,
  '- slide_shape {ratio: 16:9|4:3}: wide or standard slides, every part moved and sized down the slide in step.',
  '- reuse_slides {from: another deck’s id, slides?: its slides (all when left out), after?: a slide of this deck (0: first; left out: at the end), keep_look?: false for this deck’s theme}: copies of its slides put in (Insert → Slides from another deck), their notes along, their comments left behind.',
  '- update_charts {slides?}: every chart made from a spreadsheet of the Library read again from its cells (Update from the spreadsheet), each series keeping its colour.',
  'Documents.',
  '- accept_suggestions, reject_suggestions {ids?}: accept or reject the suggested changes listed (get_page lists them), or every one.',
  '- page_setup {paper?: a4|letter, margin?: mm, font?, size?: pt}: the paper, margins and body text (Page setup).',
  '- header_footer {header?, footer?: {text, align?: center|right} or null, title_page?}: the line at the top and foot of each page ({page} its number, {pages} how many), as Insert → Header and footer and Page numbers; title_page: none on the first page.',
  'Spreadsheets (sheet: its name or id, the first when left out; range: "A1:D40", columns "C:E", or a cell for the table around it; left out, the table around A1, its header row told as the editor tells it, or header_row: true|false):',
  '- sort {by: a column (its letter or its header’s words) or a list of them, each a column or {column, descending}, descending?, range?, header_row?}: the table’s rows in that order; formulas and comments move with their rows.',
  '- remove_duplicates {columns?, range?, header_row?}: rows that repeat one above them (in those columns; in all when left out) go.',
  '- fill {range, direction?: down|right}: the range’s first row copied down it (or first column across it), formulas moving as copied ones do (Fill down, Fill right).',
  '- clear {range, what?: contents|formatting|all}: empty the cells (their looks and notes stay), take only their looks off (Clear formatting), or both.',
  '- trim_spaces {range?}: spaces off the ends of words and runs of them made one (every cell of the sheet when left out).',
  '- split_text {range: one column’s cells, separator?: comma|semicolon|tab|space or the characters, overwrite?}: its words into the columns to its right (the separator guessed when left out; overwrite: true to write over cells there).',
  '- summarize {by, across?, values?: [{column, fn: sum|count|average|min|max}], range?}: a new sheet after it summing the table up by a column’s values (and another’s, across), as formulas that keep up with the table (Summarize by: a pivot table).',
  '- insert_rows {at: a row number, count?}, insert_columns {at: a column’s letters, count?}: empty rows or columns put in there; every formula that points past them follows.',
  '- delete_rows {rows: "5", "5:7" or a list}, delete_columns {columns: "C", "C:D" or a list}: taken out; formulas follow, and a reference to a cell that went becomes #REF!.',
  '- rename_sheet {sheet, name} (the formulas that name it follow), duplicate_sheet {sheet, name?}, delete_sheet {sheet}, move_sheet {sheet, to: its place from 1}: the sheet tabs’ menu.',
  '- pivot_table {rows: a column or two (letters or header words), across?: a column, values: [{column, fn: sum|count|average|min|max}], filters?: [{column, hide: [values left out]}], range?, name?}: a new sheet after it summing the table up, as formulas that keep up with it (Data → Pivot table; the user changes it there).',
  '- goal_seek {cell: a formula’s cell, to: the number it is to give, changing: a cell of a number it uses}: the value of that cell that makes the formula give it, put in (Tools → Goal seek).',
  '- ask_ai {again?}: the AI cells (=AI(…)) that wait for an answer asked of the helper model, many at once, their answers kept with the sheet (it costs a little, as any question to it does); again: true asks every AI cell again (Refresh AI cells).',
  'LaTeX documents.',
  '- move_files {moves: [{from, to}]}: rename or move files, pictures and folders ("figures/" to "img/"), every \\input, \\include and \\includegraphics that names them following, their comments and tracked changes along; it is typeset again.',
  '- tidy_source {files?, align?}: Edit → Tidy the source on its .tex files (or those listed): each line indented by the environments, items and groups it is in, and tables’ cells lined up at their & (align: false leaves them); no line’s own text changes.',
  '- tidy_bibliography {file?, sort?, duplicates?, keys?, fill?, unused?, format?}: Tidy on a .bib (its first when left out): sorted by key, duplicates (same DOI, or title and year) merged with their citations pointed at the one kept, keys fixed, the fields an entry lacks filled from its DOI (doi.org), all on unless false; unused: true also takes out the entries nothing cites; format: true writes every entry one field a line. It answers what changed.',
  'Notebooks.',
  '- clear_outputs {cells?}: clear the outputs of every code cell (or of the cells listed, by number or id).',
  'Pages (of HTML).',
  '- lock, unlock: Lock the page (it then makes no new version, by anyone, until it is unlocked; its databases still take rows): lock it when the user asks to keep it from changing by accident, unlock it before changing it when they ask.',
  '- fill_column {database?: its name (data-db) or title, the first when left out; column?: an AI column’s name, the first; rows?: "empty" (the default), "all" or row ids}: the helper model fills the AI column’s cells from each row’s other cells, as the editor’s Fill every row does (one request a row).',
  'Any of them.',
  '- turn_into {to: slides|doc|page}: what the Library’s Turn it into asks for, to make slides, a document or a page from it (you then make it with the save tool; it stays as it is).',
  '- duplicate {title?}: a copy beside it in the Library (“… (copy)”).',
  'Freezing rows and columns, a filter, and what a part, a slide, a cell or a paragraph has of its own are the save tools’ (save_sheet’s freeze and filter, save_slides’ change, save_doc’s edits).',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The saved page’s id (get_page lists them).' },
    action: { type: 'string', enum: PAGE_ACTIONS, description: 'What to do; its fields as the description says.' },
    style: { type: 'string', enum: ['subtle', 'lively', 'bold', 'none'], description: 'animate.' },
    slides: { type: 'array', items: { type: ['number', 'string'] }, description: 'Slides by number (from 1) or id; all when left out.' },
    parts: { type: 'array', items: { type: 'string' }, description: 'describe_pictures: pictures by part id.' },
    on: { type: 'boolean', description: 'powerpoint.' },
    theme: { type: 'string', description: 'theme: a ready-made theme’s name, or one of the user’s own by its name.' },
    from: { type: 'string', description: 'reuse_slides: the deck to take slides from, by its id.' },
    after: { type: ['number', 'string'], description: 'reuse_slides: the slide they go after (0: first; left out: at the end).' },
    keep_look: { type: 'boolean', description: 'reuse_slides: false to give them this deck’s theme (they keep their own when left out).' },
    ratio: { type: 'string', enum: ['16:9', '4:3'], description: 'slide_shape.' },
    ids: { type: 'array', items: { type: 'string' }, description: 'accept_suggestions, reject_suggestions: suggestions by id; all when left out.' },
    paper: { type: 'string', enum: ['a4', 'letter'] },
    margin: { type: 'number', description: 'page_setup: millimetres, 5 to 60.' },
    font: { type: 'string' },
    size: { type: 'number', description: 'page_setup: the body text in points.' },
    header: { type: ['object', 'string', 'null'], description: 'header_footer: {text, align}, or null for none.' },
    footer: { type: ['object', 'string', 'null'], description: 'header_footer: {text, align}, or null for none.' },
    title_page: { type: 'boolean' },
    sheet: { type: 'string', description: 'A sheet’s name or id; the first when left out.' },
    range: { type: 'string', description: '"A1:D40", "C:E", or one cell for the table around it.' },
    header_row: { type: 'boolean', description: 'Whether the table’s first row is its header (told from it when left out).' },
    by: { type: ['string', 'array'], description: 'sort: a column (letters or header words), or a list of them or of {column, descending}; summarize: the column to sum up by.' },
    descending: { type: 'boolean', description: 'sort: Z to A, largest first.' },
    columns: { type: ['string', 'array'], description: 'remove_duplicates: the columns that must match (all when left out); delete_columns: "C", "C:D" or a list.' },
    rows: { type: ['string', 'number', 'array'], description: 'delete_rows: "5", "5:7" or a list; fill_column: empty (the default), all, or row ids.' },
    direction: { type: 'string', enum: ['down', 'right'] },
    what: { type: 'string', enum: ['contents', 'formatting', 'all'] },
    separator: { type: 'string' },
    overwrite: { type: 'boolean' },
    across: { type: 'string', description: 'summarize: a second column, its values across the top.' },
    values: { type: 'array', items: { type: 'object' }, description: 'summarize: [{column, fn: sum|count|average|min|max}].' },
    at: { type: ['number', 'string'], description: 'insert_rows: a row number; insert_columns: a column’s letters.' },
    count: { type: 'number' },
    name: { type: 'string', description: 'rename_sheet, duplicate_sheet: the sheet’s name.' },
    to: { type: ['number', 'string'], description: 'move_sheet: its place from 1; turn_into: slides, doc or page.' },
    moves: { type: 'array', items: { type: 'object' }, description: 'move_files: [{from, to}].' },
    files: { type: 'array', items: { type: 'string' }, description: 'tidy_source: the .tex files (all when left out).' },
    file: { type: 'string', description: 'tidy_bibliography: the .bib file (the first when left out).' },
    align: { type: 'boolean', description: 'tidy_source: false to leave tables’ cells as they are.' },
    sort: { type: 'boolean', description: 'tidy_bibliography: sort by key (on unless false).' },
    duplicates: { type: 'boolean', description: 'tidy_bibliography: merge duplicates (on unless false).' },
    keys: { type: 'boolean', description: 'tidy_bibliography: fix keys (on unless false).' },
    fill: { type: 'boolean', description: 'tidy_bibliography: fill missing fields from DOIs (on unless false).' },
    unused: { type: 'boolean', description: 'tidy_bibliography: true to take out the entries nothing cites.' },
    format: { type: 'boolean', description: 'tidy_bibliography: true to write every entry one field a line.' },
    cells: { type: 'array', items: { type: ['number', 'string'] }, description: 'clear_outputs: cells by number or id.' },
    title: { type: 'string', description: 'duplicate: the copy’s title.' },
    database: { type: 'string', description: 'fill_column: the database (its name or title).' },
    column: { type: 'string', description: 'fill_column: the AI column’s name.' },
    again: { type: 'boolean', description: 'ask_ai: every AI cell asked again.' },
    filters: { type: 'array', items: { type: 'object' }, description: 'pivot_table: [{column, hide: [values]}].' },
    cell: { type: 'string', description: 'goal_seek: the formula’s cell.' },
    changing: { type: 'string', description: 'goal_seek: the cell of a number it changes.' },
  },
  required: ['id', 'action'],
};

/**
 * The tool. `keep` keeps a changed model as the save tools do; `hidden` says a page is out of the agent's reach (one a
 * confidential session made, seen from another), which it then cannot find.
 */
export function pageActionTool(o: { keep: KeepPage; hidden: (ctx: RunCtx, p: PageInfo) => boolean }): RunTool {
  return {
    name: 'page_action',
    description: DESCRIPTION,
    inputSchema: SCHEMA,
    async run(a, ctx) {
      const db = ctx.deps.db;
      const id = str(a.id);
      if (!id) throw new Error('id: the saved page’s id (get_page lists them).');
      const page = mustPage(db, id);
      if (o.hidden(ctx, page)) throw new HttpError(404, 'No saved page with that id');
      const kind: PageKind | 'page' = page.kind && kindOf(page.kind) ? page.kind : 'page';
      const action = str(a.action).toLowerCase().replace(/[\s-]+/g, '_');
      const here: Here = { ctx, page, hidden: (q) => o.hidden(ctx, q) };
      if (action === 'duplicate') return duplicate(here, a);
      if (action === 'turn_into') return turnInto(here, a);
      // A page of HTML: locked or unlocked, an AI column of its databases filled (page-tools.ts).
      if (kind === 'page' && HTML_ACTIONS[action]) return HTML_ACTIONS[action](ctx.deps, page, a);
      const run = kind === 'page' ? undefined : ACTIONS[kind][action];
      if (!run) {
        const other = (Object.keys(ACTIONS) as PageKind[]).find((k) => ACTIONS[k][action]);
        const mine = actionsFor(kind).join(', ');
        if (other) throw new Error(`${action} is for a ${NOUN[other]}; “${page.title}” is a ${NOUN[kind]}: its actions are ${mine}.`);
        throw new Error(`action: ${action ? `there is no action ${quote(action)}; ` : ''}for a ${NOUN[kind]} (“${page.title}”) it is one of ${mine}.${kind === 'page' ? ' A page of HTML changes with save_page.' : ''}`);
      }
      const k = mustKind(kind as PageKind);
      const done = await run(k.read(pageSource(db, id)!.text), a, here);
      if (done.model === undefined) return [done.said, ...(done.notes ?? [])].join(' ');
      // A LaTeX document is typeset first, as save_latex does: the agent hears of errors to fix.
      const typeset = kind === 'tex' ? compileSummary(await compileTex(db, done.model as TexDoc)) : '';
      const p = o.keep(ctx, id, kind as PageKind, page.title, done.model);
      const fold = p.folded ? ` It took the place of version ${p.folded}, your save of it a moment ago: saves in a row are kept as one version.` : '';
      return [[`Saved "${p.title}" (page ${p.id}, version ${p.version}): ${done.said} The editor open on it shows it now; the version before stays among its versions.${fold}`, ...(done.notes ?? [])].join(' '), typeset].filter(Boolean).join('\n\n');
    },
  };
}

/** For the agent beside a page (index.ts askInstructions): its kind's actions, in a line. */
export function actionsLine(kind: PageKind | 'page'): string {
  return `page_action does in one call what the editor does in a click to the whole of it (${actionsFor(kind).join(', ')}): use it rather than writing it all out.`;
}

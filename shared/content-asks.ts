// The requests made from the kinds an agent makes (content-types.ts), as they go to the agent: a kind's ask, the
// person's words and where it goes (composeAsk), and what "Turn it into" in the Library asks (turnAsk), with the kinds
// each can be turned into. Words for the agent, in English, never shown as the app's own (the i18n extractor leaves
// this file out; New's own "Or describe it" says the same starts in the app's language). It takes only types from the
// list of kinds, so the pages that use it do not load the list.
import type { ContentKind, ContentType } from './content-types.ts';

/** How a request for something new starts, as New in the Library's "Or describe it" does (its ASK_FOR, in English). */
export const NEW_START: Record<'deck' | 'doc' | 'page' | 'sheet' | 'design' | 'diagram', string> = {
  page: 'Make me a page and keep it in my Library: ',
  design: 'Make me a design and keep it in my Library: ',
  deck: 'Make me slides and keep them in my Library: ',
  doc: 'Write me a document and keep it in my Library: ',
  sheet: 'Make me a spreadsheet and keep it in my Library: ',
  diagram: 'Make me a diagram and keep it in my Library: ',
};

/** The kinds of page the Library holds, as "Turn it into" names them. */
export type PageKindName = 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook' | 'diagram';
/** What Turn it into makes. */
export type TurnTo = 'slides' | 'doc' | 'page' | 'diagram';

/** What each kind can be turned into, from the Library: the others of slides, a document, a page and a diagram. */
export const TURN_INTO: Record<PageKindName, TurnTo[]> = {
  page: ['slides', 'doc', 'diagram'],
  slides: ['doc', 'page', 'diagram'],
  doc: ['slides', 'page', 'diagram'],
  sheet: ['slides', 'doc', 'page', 'diagram'],
  tex: ['slides', 'doc', 'page', 'diagram'],
  notebook: ['slides', 'doc', 'page', 'diagram'],
  diagram: ['slides', 'doc', 'page'],
};

/** Where it goes and what it is made for: as much of it as the editor or the New dialog knows. */
export interface ComposeContext {
  /** Its kind, when no type is picked (words alone). */
  kind?: ContentKind;
  /** A slide: the one it goes after (its index from 0, as the editor counts, and its title); left out, at the end. */
  after?: { index: number; title: string };
  /** A section or a page's part: where it goes, in words that follow "Add …": "after the section “Pricing”". */
  at?: string;
  /** A slide: the deck is in the web format (false: PowerPoint compatible). */
  webDeck?: boolean;
  /** Something new: the name asked for it. */
  title?: string;
  /** A new deck's theme (a preset's id and name) and the slides' shape. */
  theme?: { id: string; label: string };
  ratio?: '16:9' | '4:3';
  /** Something new: the Library folder it goes in, as a path ("Thesis/Drafts"). */
  folder?: string;
  /** Something new: the language the app is shown in, when not English ("Greek"). */
  lang?: string;
  /** A design: its size, as picked (a size of shared/design.ts, by its name and pixels). */
  size?: { label: string; w: number; h: number };
}

const sentence = (s: string) => (/[.!?…”"’)]$/.test(s) ? s : `${s}.`);
/** The user's words, at most so many: "It is about: …". */
const about = (words: string) => {
  const w = words.trim().slice(0, 2000);
  return w ? ` It is about: ${sentence(w)}` : '';
};
const quoted = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * The request for one: the type's ask (or the words alone, with no type), the user's words, and where it goes. A slide,
 * a section or a page's part is added to what is open, drawn from it and in its look; something new starts as New's
 * "Or describe it" does, with the name, the theme and the shape picked.
 */
export function composeAsk(t: ContentType | null, words: string, c: ComposeContext = {}): string {
  const kind = t?.kind ?? c.kind ?? 'page';
  const w = words.trim();
  if (!t && !w) return '';
  const what = t ? `${t.ask}${about(w)}` : sentence(w.slice(0, 2000));
  if (kind === 'slide') {
    const n = c.after ? c.after.index + 1 : 0;
    const where = c.after ? `after slide ${n}${c.after.title.trim() ? ` (“${quoted(c.after.title)}”)` : ''}` : 'at the end of the deck';
    const pptx =
      c.webDeck === false
        ? t?.web
          ? ' The deck is PowerPoint compatible: use only what PowerPoint has (no quiz, score, html, embed or 3D parts), and make the nearest with words, shapes, pictures and animations on a click.'
          : ' The deck is PowerPoint compatible: use only what PowerPoint has.'
        : '';
    return `Add one slide ${where}: ${what} Draw it from what the deck already says (read it with get_page), in the deck’s theme and the look of its other slides, in its language.${pptx} Add only this slide (save_slides with add${c.after ? `, after ${n}` : ''}) and leave the others as they are.`;
  }
  if (kind === 'section') {
    const where = c.at?.trim() ? c.at.trim() : 'where it fits best in the document';
    return `Add a section ${where}: ${what} Draw it from what the document already says (read it with get_page), with its headings’ levels and its style, in its language. Add only this section (save_doc with edits) and leave the rest as it is.`;
  }
  if (kind === 'block') {
    const where = c.at?.trim() ? c.at.trim() : 'where it fits best';
    return `Add a part to the page ${where}: ${what} Read the page with get_page first, and make the part in the page’s own look (its colours, fonts and spacing), in its language, working on a phone too. Keep everything else on the page as it is, and save the whole page with save_page and its id.`;
  }
  const start = NEW_START[kind === 'deck' ? 'deck' : kind === 'doc' ? 'doc' : kind === 'sheet' ? 'sheet' : kind === 'design' ? 'design' : kind === 'diagram' ? 'diagram' : 'page'];
  const named = c.title?.trim() ? ` Call it “${quoted(c.title)}”.` : '';
  const look =
    kind === 'deck' && (c.theme || c.ratio) ? ` Make it${c.theme ? ` in the ${c.theme.label} theme (the preset “${c.theme.id}”)` : ''}${c.ratio ? `${c.theme ? ',' : ''} with ${c.ratio === '4:3' ? 'standard 4:3' : 'wide 16:9'} slides` : ''}.` : '';
  const into = c.folder?.trim() ? ` Keep it in my Library folder “${quoted(c.folder)}”.` : '';
  const lang = c.lang && c.lang !== 'English' ? ` Write it in ${c.lang}.` : '';
  const design = kind === 'design' ? ` Make it ${c.size ? `a ${quoted(c.size.label)}, ${Math.round(c.size.w)}×${Math.round(c.size.h)} pixels` : 'the size that suits it'}, as a design (how_to_make “design” says how), so I can change it as in Canva.` : '';
  const diagram = kind === 'diagram' ? ' Make it with save_diagram, so I can change it as in draw.io.' : '';
  return `${start}${what}${named}${look}${design}${diagram}${into}${lang}`;
}

const NOUN: Record<PageKindName, string> = { page: 'page', slides: 'deck', doc: 'document', sheet: 'spreadsheet', tex: 'LaTeX document', notebook: 'notebook', diagram: 'diagram' };

/** The request that makes another kind from something in the Library, which stays as it is. */
export function turnAsk(o: { from: PageKindName; to: TurnTo; id: string; title: string; folder?: string }): string {
  const noun = NOUN[o.from];
  const mine = `my ${noun} “${quoted(o.title)}” (saved page ${o.id})`;
  const numbers = o.from === 'sheet' || o.from === 'notebook';
  const body =
    o.to === 'diagram'
      ? `Make a diagram from ${mine} and keep it in my Library: read it with get_page, then draw what it says with save_diagram, as the diagram that shows it best: its steps and decisions as a flowchart, its parts and how they connect as a block or architecture diagram, its ideas as a mind map, its people as an org chart, its stages as a timeline${numbers ? ', its table’s rows as shapes and the links between them as connectors' : ''}; short words in each shape, a calm palette, one look for each kind of thing.`
      : o.to === 'slides'
      ? `Make slides from ${mine} and keep them in my Library: read it with get_page, then make a deck that tells what it says: a title slide, then a slide for each main point in its order (a title that says the point, a few short bullets), ${numbers ? 'its numbers as charts and big numbers, its tables as small tables' : 'its numbers as charts or big numbers, its tables and pictures where they help'}, pictures of your own where they would help, and speaker notes with what to say.`
      : o.to === 'doc'
        ? `Write a document from ${mine} and keep it in my Library: read it with get_page, then write what it says in full, as a document to read, print and change: a title, a short summary, headings for its parts in their order, paragraphs${o.from === 'slides' ? ' (the slides’ points and their speaker notes written out)' : numbers ? ' that explain its numbers' : ''}, and its tables and pictures.`
        : `Make a page from ${mine} and keep it in my Library: read it with get_page, then make a page that shows it well on any screen, a phone too: ${numbers ? 'a dashboard of its numbers, the key figures as cards, charts of them and its tables, the data written into the page' : 'its title and parts as sections with headings, a bar to jump between them, its pictures and its tables'}.`;
  const into = o.folder?.trim() ? ` Put it in my Library folder “${quoted(o.folder)}”, beside it.` : '';
  return `${body} Write it in the language the ${noun} is in.${into} Leave the ${noun} itself as it is.`;
}

// ---- what a session is asked to make (extra.make) -------------------------------------------------------------------

/**
 * What a session is asked to make (`extra.make`): its agent hears it in full from the pages capability, while the
 * person's message says it in short, in their words. A kind picked in the gallery (or the words alone), what it is
 * about and where it goes; or what Turn it into makes, from which page of the Library.
 */
export interface MakeExtra {
  /** The kind picked in the gallery ("slide.swot"); left out when the words alone say what. */
  type?: string;
  /** What it is, with no kind picked: a slide, a section, a new page… */
  kind?: ContentKind;
  /** The person's words: what it is about. */
  words?: string;
  /** A slide: the one it goes after (its index from 0, and its title). */
  after?: { index: number; title: string };
  /** A section or a page's part: where it goes, in words. */
  at?: string;
  /** A slide: whether the deck is in the web format. */
  webDeck?: boolean;
  /** Something new: its name, a deck's theme and shape, its Library folder, the app's language. */
  title?: string;
  theme?: { id: string; label: string };
  ratio?: '16:9' | '4:3';
  folder?: string;
  lang?: string;
  /** Turn it into: the page of the Library it is made from, and what it becomes. */
  turn?: { from: PageKindName; to: TurnTo; id: string; title: string };
  /** A design: its size. */
  size?: { label: string; w: number; h: number };
}

const KINDS: ContentKind[] = ['slide', 'deck', 'doc', 'section', 'page', 'block', 'sheet', 'design', 'diagram'];
const text = (v: unknown, most: number) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim().slice(0, most) : undefined);
const record = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/**
 * `extra.make` as a session keeps it, checked: kinds and places by their shapes, words cut to their sizes, anything else
 * left out; null when it asks for nothing (no kind picked, no words, nothing to turn into).
 */
export function makeOf(v: unknown): MakeExtra | null {
  const x = record(v);
  if (!x) return null;
  const out: MakeExtra = {};
  const type = text(x.type, 60);
  if (type && /^[a-z]+\.[a-z0-9-]+$/.test(type)) out.type = type;
  if (typeof x.kind === 'string' && (KINDS as string[]).includes(x.kind)) out.kind = x.kind as ContentKind;
  const words = typeof x.words === 'string' ? x.words.trim().slice(0, 2000) : '';
  if (words) out.words = words;
  const after = record(x.after);
  if (after && Number.isInteger(after.index) && (after.index as number) >= 0 && (after.index as number) < 10_000) out.after = { index: after.index as number, title: text(after.title, 200) ?? '' };
  const at = text(x.at, 400);
  if (at) out.at = at;
  if (typeof x.webDeck === 'boolean') out.webDeck = x.webDeck;
  const title = text(x.title, 120);
  if (title) out.title = title;
  const theme = record(x.theme);
  const themeId = text(theme?.id, 40);
  const themeLabel = text(theme?.label, 60);
  if (themeId && themeLabel && /^[a-z0-9-]+$/.test(themeId)) out.theme = { id: themeId, label: themeLabel };
  if (x.ratio === '16:9' || x.ratio === '4:3') out.ratio = x.ratio;
  const folder = text(x.folder, 300);
  if (folder) out.folder = folder;
  const lang = text(x.lang, 40);
  if (lang && /^[A-Za-z ()-]+$/.test(lang)) out.lang = lang;
  const size = record(x.size);
  const sizeLabel = text(size?.label, 60);
  if (size && sizeLabel && Number(size.w) >= 16 && Number(size.h) >= 16 && Number(size.w) <= 8000 && Number(size.h) <= 8000) out.size = { label: sizeLabel, w: Math.round(Number(size.w)), h: Math.round(Number(size.h)) };
  const turn = record(x.turn);
  const from = turn?.from as PageKindName;
  const id = text(turn?.id, 40);
  if (turn && from in TURN_INTO && TURN_INTO[from].includes(turn.to as 'slides') && id && /^[A-Za-z0-9_-]+$/.test(id)) out.turn = { from, to: turn.to as 'slides' | 'doc' | 'page', id, title: text(turn.title, 200) ?? '' };
  return out.turn || out.type || (out.kind && out.words) ? out : null;
}

/** The whole request `extra.make` stands for, as composeAsk or turnAsk writes it (`t`: its kind picked, found by its id). */
export function makeRequest(m: MakeExtra, t: ContentType | null): string {
  if (m.turn) return turnAsk({ ...m.turn, folder: m.folder });
  return composeAsk(t, m.words ?? '', { kind: t?.kind ?? m.kind, after: m.after, at: m.at, webDeck: m.webDeck, title: m.title, theme: m.theme, ratio: m.ratio, folder: m.folder, lang: m.lang, size: m.size });
}

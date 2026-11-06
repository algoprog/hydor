// The requests made from the kinds an agent makes (content-types.ts), as they go to the agent: a kind's ask, the
// person's words and where it goes (composeAsk), and what "Turn it into" in the Library asks (turnAsk). Words for the
// agent, in English, never shown as the app's own (the i18n extractor leaves this file out).
import { NEW_START, type ContentKind, type ContentType, type PageKindName } from './content-types.ts';

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
  const start = NEW_START[kind === 'deck' ? 'deck' : kind === 'doc' ? 'doc' : kind === 'sheet' ? 'sheet' : 'page'];
  const named = c.title?.trim() ? ` Call it “${quoted(c.title)}”.` : '';
  const look =
    kind === 'deck' && (c.theme || c.ratio) ? ` Make it${c.theme ? ` in the ${c.theme.label} theme (the preset “${c.theme.id}”)` : ''}${c.ratio ? `${c.theme ? ',' : ''} with ${c.ratio === '4:3' ? 'standard 4:3' : 'wide 16:9'} slides` : ''}.` : '';
  const into = c.folder?.trim() ? ` Keep it in my Library folder “${quoted(c.folder)}”.` : '';
  const lang = c.lang && c.lang !== 'English' ? ` Write it in ${c.lang}.` : '';
  return `${start}${what}${named}${look}${into}${lang}`;
}

const NOUN: Record<PageKindName, string> = { page: 'page', slides: 'deck', doc: 'document', sheet: 'spreadsheet', tex: 'LaTeX document', notebook: 'notebook' };

/** The request that makes another kind from something in the Library, which stays as it is. */
export function turnAsk(o: { from: PageKindName; to: 'slides' | 'doc' | 'page'; id: string; title: string; folder?: string }): string {
  const noun = NOUN[o.from];
  const mine = `my ${noun} “${quoted(o.title)}” (saved page ${o.id})`;
  const numbers = o.from === 'sheet' || o.from === 'notebook';
  const body =
    o.to === 'slides'
      ? `Make slides from ${mine} and keep them in my Library: read it with get_page, then make a deck that tells what it says: a title slide, then a slide for each main point in its order (a title that says the point, a few short bullets), ${numbers ? 'its numbers as charts and big numbers, its tables as small tables' : 'its numbers as charts or big numbers, its tables and pictures where they help'}, pictures of your own where they would help, and speaker notes with what to say.`
      : o.to === 'doc'
        ? `Write a document from ${mine} and keep it in my Library: read it with get_page, then write what it says in full, as a document to read, print and change: a title, a short summary, headings for its parts in their order, paragraphs${o.from === 'slides' ? ' (the slides’ points and their speaker notes written out)' : numbers ? ' that explain its numbers' : ''}, and its tables and pictures.`
        : `Make a page from ${mine} and keep it in my Library: read it with get_page, then make a page that shows it well on any screen, a phone too: ${numbers ? 'a dashboard of its numbers, the key figures as cards, charts of them and its tables, the data written into the page' : 'its title and parts as sections with headings, a bar to jump between them, its pictures and its tables'}.`;
  const into = o.folder?.trim() ? ` Put it in my Library folder “${quoted(o.folder)}”, beside it.` : '';
  return `${body} Write it in the language the ${noun} is in.${into} Leave the ${noun} itself as it is.`;
}

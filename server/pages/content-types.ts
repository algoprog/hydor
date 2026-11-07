// how_to_make: the agents' way into the kinds the gallery offers people (shared/content-types.ts). An agent asked for
// one by name ("add a SWOT slide", "write me a cover letter") reads what the gallery would have asked for, and how to
// add it to what is open, so it comes out as well as it does from the gallery. Free and local: it only reads the list.
// Also what a session started from the gallery or Turn it into is told (`extra.make`): the request in full, while the
// person's message says it in short.
import { makeOf, makeRequest } from '../../shared/content-asks.ts';
import { contentType, CONTENT_TYPES, findTypes, typesOf, type ContentKind, type ContentType } from '../../shared/content-types.ts';
import type { RunTool } from '../features/types.ts';
import { brandForAgent } from '../../shared/design-brand.ts';
import { designHow } from './design-agent.ts';
import { readBrand } from './design-routes.ts';

const KINDS: ContentKind[] = ['slide', 'deck', 'doc', 'section', 'page', 'block', 'sheet', 'design', 'diagram'];

/** What each kind is, as the answers name it. */
const NOUN: Record<ContentKind, string> = {
  slide: 'a slide added to a deck',
  deck: 'a new deck',
  doc: 'a new document',
  section: 'a section added to a document',
  page: 'a new page',
  block: 'a part added to a page',
  sheet: 'a new spreadsheet',
  design: 'a new design',
  diagram: 'a new diagram',
};
const LIST_NAME: Record<ContentKind, string> = {
  slide: 'Slides added to a deck',
  deck: 'New decks',
  doc: 'New documents',
  section: 'Sections added to a document',
  page: 'New pages',
  block: 'Parts added to a page',
  sheet: 'New spreadsheets',
  design: 'New designs (posters, flyers, social posts, cards)',
  diagram: 'New diagrams (flowcharts, org charts, mind maps, architecture and UML diagrams)',
};

/** How it goes where it belongs. */
const HOW: Record<ContentKind, string> = {
  slide:
    'Adding it: read the deck with get_page, draw the slide from what the deck already says, in the deck’s theme and the look of its other slides, in its language, and add only that slide with save_slides (add, after the slide it follows). A web deck may use the web format’s parts; a PowerPoint compatible one only what PowerPoint has.',
  deck: 'Make it with save_slides.',
  doc: 'Make it with save_doc, in steps for a long one. Where the kind has them: sources cited as [@key] with save_doc’s sources (or bibtex) and a [BIBLIOGRAPHY] under a References heading, footnotes as [^1], numbered figures and tables ({label=Figure}, Table: … {label=Table}) referred to with <ref to="id"/>.',
  section: 'Adding it: read the document with get_page, draw the section from what it says, with its headings’ levels and its style, in its language, and add only that section with save_doc’s edits.',
  page: 'Make it with save_page.',
  block: 'Adding it: read the page with get_page, make the part in the page’s own look (its colours, fonts and spacing) and language, working on a phone too, keep the rest as it is, and save the whole page with save_page and its id.',
  sheet: 'Make it with save_sheet.',
  design: 'Make it with save_page as a design (how_to_make “design” says how to write one).',
  diagram: 'Make it with save_diagram: nodes and edges with the layout it names, which the app lays out and sizes to their words (or Mermaid where it says so).',
};

const isKind = (v: unknown): v is ContentKind => typeof v === 'string' && (KINDS as string[]).includes(v);

/** One kind in full: its name, what it is, what to make, and how it goes in. */
const whole = (t: ContentType) => `${t.label} (${NOUN[t.kind]}; ${t.blurb.charAt(0).toLowerCase()}${t.blurb.slice(1)}): ${t.ask}${t.web ? ' It needs the web format.' : ''}\n${HOW[t.kind]}`;

/** Every kind it knows, by kind: the answer when no words are given. */
function listAll(kind?: ContentKind): string {
  const lines = (kind ? [kind] : KINDS).map(
    (k) =>
      `${LIST_NAME[k]}: ${typesOf(k)
        .map((t) => t.label)
        .join(', ')}.`,
  );
  return [`The kinds the app knows how to make (${kind ? typesOf(kind).length : CONTENT_TYPES.length}); ask how_to_make for one by its name:`, ...lines].join('\n');
}

export const HOW_TO_MAKE: RunTool = {
  name: 'how_to_make',
  annotations: { readOnlyHint: true },
  description: [
    'How to make a known kind of thing well, as the app’s gallery asks for it: a slide added to a deck (a SWOT analysis, a timeline, a quiz), a new deck (a pitch deck, a lecture, a thesis defence), a document (a cover letter, a CV, meeting minutes, a grant proposal), a section added to one (an executive summary, a risks table), a page (a habit tracker, a landing page, a loan calculator), a part added to a page (a pricing table, a FAQ), a spreadsheet (a budget, a loan schedule), a design (an event poster, a sale flyer, a quote post, a YouTube thumbnail, an invitation, a business card, a certificate, a menu, a logo), or a diagram (a flowchart, a swimlane process, an org chart, a mind map, a system architecture, a database schema, a sequence diagram).',
    'With "design" alone: how a design is written (its artboards, sizes and elements), and the user’s brand kit when they have one.',
    'It says what goes in it, in what order, how it should look and where pictures help, and how to add it to what is open. Use it when the user asks for one of these by name, before you make it: it is free and instant. With no words, it lists every kind it knows.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      what: { type: 'string', description: 'The kind asked for, in a few words: "SWOT slide", "pitch deck", "cover letter", "habit tracker". Left out: the list of every kind.' },
      kind: {
        type: 'string',
        enum: KINDS,
        description: 'Which it is, when known: a slide added to a deck, a new deck, a document (doc), a section added to a document, a page, a part added to a page (block), a spreadsheet (sheet), a design (a poster, a flyer, a social post, a card), a diagram.',
      },
    },
  },
  async run(a, ctx) {
    const kind = isKind(a.kind) ? a.kind : undefined;
    const what = typeof a.what === 'string' ? a.what.trim().slice(0, 200) : '';
    // A design: how one is written, with the user's brand kit; a design's kind also gets them after its ask.
    const brand = () => brandForAgent(ctx ? readBrand(ctx.deps.db) : null);
    if (/^(a |the )?designs?( format)?$/i.test(what)) return [designHow(), brand(), listAll('design')].filter(Boolean).join('\n');
    if (!what) return listAll(kind);
    const found = findTypes(what, { kind });
    if (!found.length) return `No kind the app knows matches “${what}”${kind ? ` among ${LIST_NAME[kind].toLowerCase()}` : ''}: make it as the user asks. how_to_make with no words lists the kinds it knows.`;
    const [best, ...rest] = found;
    const others = rest.slice(0, 3).map((t) => `${t.label} (${NOUN[t.kind]})`);
    const extra = best.kind === 'design' ? [designHow(), brand()].filter(Boolean).join('\n') : '';
    return `${whole(best)}${extra ? `\n${extra}` : ''}${others.length ? `\nOthers close to it: ${others.join('; ')}.` : ''}`;
  },
};

/**
 * What the agent of a session started from the gallery (a slide, a section, a block, something new) or from Turn it
 * into is told (`extra.make`): the request in full, as the app composes it; null when it asks for nothing known.
 */
export function makeInstructions(v: unknown): string | null {
  const m = makeOf(v);
  if (!m) return null;
  const t = m.type ? contentType(m.type) : undefined;
  if (m.type && !t && !m.turn) return null;
  const req = makeRequest(m, t ?? null);
  if (!req) return null;
  const from = m.turn ? 'Turn it into, in their Library' : 'the gallery of things made with AI';
  return `What the user asked for, in full: they picked it in the app (${from}), and their message says it in short, in their own words. ${req}`;
}

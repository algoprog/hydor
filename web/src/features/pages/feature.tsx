// Pages: HTML pages agents show in the conversation (show_html) and keep (save_page), slide decks (save_slides),
// pages saved as files (export_page), a page's own place (/pages/<id>), the published sites (/published), the old
// Library addresses (they move on to where its parts live now), the cards that ask the user before publishing, and the
// panel beside a conversation where a page shows as it is written and can be changed (Canvas).
import { HtmlPage } from '../session/HtmlPage';
import type { ToolView, WebFeature } from '../registry';
import { CanvasSide, closeCanvas, PageOver, useCanvasOpen } from './Canvas';
import { exportPageStep, pageActionStep, PublishCard, ReadPageRow, readPageStep, SavedPageCard, savedPageStep } from './cards';
import { latexCheckStep } from './checkStep';
import { LibraryRedirect } from './LibraryRedirect';
import { howToMakeStep } from './types/step';
import { PageEditNoteView } from './notes';
import { PagesRoute } from './PagesPage';
import { PublishedPage } from './PublishedPage';
import { RemotePage } from './slides/Remote';
import { savedPageOf, savedRef } from './state';
import { nagetTool } from '../registry';

const saved = { place: 'answer', Row: SavedPageCard, same: savedPageOf, step: savedPageStep } satisfies ToolView;
/** page_action: a version it saved shows as the saves' card does (one card for a page's saves in a turn); else a step of the work. */
const actionSaved = { ...saved, step: pageActionStep } satisfies ToolView;
const actionWork = { place: 'work', Row: ReadPageRow, step: pageActionStep } satisfies ToolView;

/** A page's own place (/pages/<id>, and its audience view). */
const isPages = (p: string) => p.startsWith('/pages/');
/** The Library's old addresses (and /pages, its other one): they move on at once. */
const isOld = (p: string) => p === '/library' || p.startsWith('/library/') || p === '/pages';

export const pagesFeature: WebFeature = {
  id: 'pages',
  toolViews: {
    show_html: { place: 'answer', Row: HtmlPage },
    // A page saved several times in a turn shows once, at its newest save; the earlier saves are steps of the work.
    save_page: saved,
    // A deck shows as its slideshow, a document as its pages, a spreadsheet as its tables: each opens to edit in Pages.
    save_slides: saved,
    save_doc: saved,
    save_sheet: saved,
    save_latex: saved,
    save_diagram: saved,
    save_board: saved,
    // Nothing is published until the user says so on its card.
    publish_site: { place: 'attention', Row: PublishCard },
    // A step of the work, counted with the agent's other reads.
    get_page: { place: 'work', Row: ReadPageRow, step: readPageStep },
    export_page: { place: 'work', Row: ReadPageRow, step: exportPageStep },
    latex_check: { place: 'work', Row: ReadPageRow, step: latexCheckStep },
    how_to_make: { place: 'work', Row: ReadPageRow, step: howToMakeStep },
  },
  matchTool: (t) => (nagetTool(t.name) === 'page_action' ? (savedRef(t.output) ? actionSaved : actionWork) : undefined),
  noteViews: { 'page-edit': PageEditNoteView },
  // A slideshow's phone remote (slides/Remote.tsx) too.
  routes: [
    { match: isPages, Page: PagesRoute },
    { match: (p) => p === '/published', Page: PublishedPage },
    { match: isOld, Page: LibraryRedirect },
    { match: (p) => p.startsWith('/remote/'), Page: RemotePage },
  ],
  sessionSide: { useOpen: useCanvasOpen, close: closeCanvas, Panel: CanvasSide },
  // A page opened to change over everything (a phone, a narrow window).
  SessionDock: PageOver,
};

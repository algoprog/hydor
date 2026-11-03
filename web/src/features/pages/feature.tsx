// Pages: HTML pages agents show in the conversation (show_html) and keep (save_page), slide decks (save_slides),
// pages saved as files (export_page), the Library (/library: pages, the images and videos kept, what was
// published) with its sidebar entry, the cards that ask the user before publishing, and the panel beside a
// conversation where a page shows as it is written and can be changed (Canvas).
import { LibraryBig } from 'lucide-react';
import { HtmlPage } from '../session/HtmlPage';
import type { ToolView, WebFeature } from '../registry';
import { CanvasSide, closeCanvas, PageOver, useCanvasOpen } from './Canvas';
import { exportPageStep, PublishCard, ReadPageRow, readPageStep, SavedPageCard, savedPageStep } from './cards';
import { PageEditNoteView } from './notes';
import { PagesRoute } from './PagesPage';
import { savedPageOf } from './state';

const saved = { place: 'answer', Row: SavedPageCard, same: savedPageOf, step: savedPageStep } satisfies ToolView;

const isPages = (p: string) => p === '/library' || p === '/pages' || p.startsWith('/pages/');
/** The Library's own pages, a page's and an image's or video's among them. */
const inLibrary = (p: string) => isPages(p) || p.startsWith('/media/');

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
    // Nothing is published until the user says so on its card.
    publish_site: { place: 'attention', Row: PublishCard },
    // A step of the work, counted with the agent's other reads.
    get_page: { place: 'work', Row: ReadPageRow, step: readPageStep },
    export_page: { place: 'work', Row: ReadPageRow, step: exportPageStep },
  },
  noteViews: { 'page-edit': PageEditNoteView },
  routes: [{ match: isPages, Page: PagesRoute }],
  nav: [{ id: 'pages', path: '/library', label: 'Library', icon: <LibraryBig size={17} />, match: inLibrary }],
  sessionSide: { useOpen: useCanvasOpen, close: closeCanvas, Panel: CanvasSide },
  // A page opened to change over everything (a phone, a narrow window).
  SessionDock: PageOver,
};

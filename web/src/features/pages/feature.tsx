// Pages: HTML pages agents show in the conversation (show_html) and keep (save_page), slide decks (save_slides),
// pages saved as files (export_page), the Pages library
// (/pages) with its sidebar entry, the cards that ask the user before publishing, and the panel beside a
// conversation where a page shows as it is written and can be changed (Canvas).
import { AppWindow } from 'lucide-react';
import { HtmlPage } from '../session/HtmlPage';
import type { WebFeature } from '../registry';
import { CanvasSide, closeCanvas, PageOver, useCanvasOpen } from './Canvas';
import { exportPageStep, PublishCard, ReadPageRow, readPageStep, SavedPageCard } from './cards';
import { PageEditNoteView } from './notes';
import { PagesRoute } from './PagesPage';

const isPages = (p: string) => p === '/pages' || p.startsWith('/pages/');

export const pagesFeature: WebFeature = {
  id: 'pages',
  toolViews: {
    show_html: { place: 'answer', Row: HtmlPage },
    save_page: { place: 'answer', Row: SavedPageCard },
    // A deck shows as its slideshow, a document as its pages, a spreadsheet as its tables: each opens to edit in Pages.
    save_slides: { place: 'answer', Row: SavedPageCard },
    save_doc: { place: 'answer', Row: SavedPageCard },
    save_sheet: { place: 'answer', Row: SavedPageCard },
    save_latex: { place: 'answer', Row: SavedPageCard },
    // Nothing is published until the user says so on its card.
    publish_site: { place: 'attention', Row: PublishCard },
    // A step of the work, counted with the agent's other reads.
    get_page: { place: 'work', Row: ReadPageRow, step: readPageStep },
    export_page: { place: 'work', Row: ReadPageRow, step: exportPageStep },
  },
  noteViews: { 'page-edit': PageEditNoteView },
  routes: [{ match: isPages, Page: PagesRoute }],
  nav: [{ id: 'pages', path: '/pages', label: 'Pages', icon: <AppWindow size={17} />, match: isPages }],
  sessionSide: { useOpen: useCanvasOpen, close: closeCanvas, Panel: CanvasSide },
  // A page opened to change over everything (a phone, a narrow window).
  SessionDock: PageOver,
};

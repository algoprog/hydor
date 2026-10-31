// Pages: HTML pages agents show in the conversation (show_html) and keep (save_page), the Pages
// library (/pages) with its sidebar entry, and the cards that ask the user before publishing.
import { AppWindow } from 'lucide-react';
import { HtmlPage } from '../session/HtmlPage';
import type { WebFeature } from '../registry';
import { PublishCard, ReadPageRow, readPageStep, SavedPageCard } from './cards';
import { PagesRoute } from './PagesPage';

const isPages = (p: string) => p === '/pages' || p.startsWith('/pages/');

export const pagesFeature: WebFeature = {
  id: 'pages',
  toolViews: {
    show_html: { place: 'answer', Row: HtmlPage },
    save_page: { place: 'answer', Row: SavedPageCard },
    // Nothing is published until the user says so on its card.
    publish_site: { place: 'attention', Row: PublishCard },
    // A step of the work, counted with the agent's other reads.
    get_page: { place: 'work', Row: ReadPageRow, step: readPageStep },
  },
  routes: [{ match: isPages, Page: PagesRoute }],
  nav: [{ path: '/pages', label: 'Pages', icon: <AppWindow size={17} />, match: isPages }],
};

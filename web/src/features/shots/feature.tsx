// Screenshots agents show: those they take of a web app they change (ui_screenshot, before and after) and those they
// already have as files (show_screenshots), to review in the conversation or beside it. A reply's screenshots, from
// either tool, show together as one card.
import type { WebFeature } from '../registry';
import { ShotCard } from './Review';

export const shotsFeature: WebFeature = {
  id: 'shots',
  toolViews: {
    ui_screenshot: { place: 'answer', many: 'shots', Row: ShotCard },
    show_screenshots: { place: 'answer', many: 'shots', Row: ShotCard },
  },
};

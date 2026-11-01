// Before and after: the screenshots agents take of a web app they change (ui_screenshot), to review in
// the conversation or beside it.
import type { WebFeature } from '../registry';
import { ShotCard } from './Review';

export const shotsFeature: WebFeature = {
  id: 'shots',
  toolViews: {
    ui_screenshot: { place: 'answer', Row: ShotCard },
  },
};

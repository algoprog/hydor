// The Library's images and videos: each one's own page (/media/<id>). Their list is the Library's Media tab
// (pages/PagesPage.tsx), and Save to Library on what agents make (images/) keeps them.
import type { WebFeature } from '../registry';
import { MediaRoute } from './MediaView';

export const mediaFeature: WebFeature = {
  id: 'media',
  routes: [{ match: (p) => p.startsWith('/media/'), Page: MediaRoute }],
};

// The Library's images and videos: each one's own page (/media/<id>). They show among the Library's other things
// (pages/Library.tsx), and Save to Library on what agents make (images/) keeps them.
import type { WebFeature } from '../registry';
import { MediaRoute } from './MediaView';

export const mediaFeature: WebFeature = {
  id: 'media',
  routes: [{ match: (p) => p.startsWith('/media/'), Page: MediaRoute }],
};

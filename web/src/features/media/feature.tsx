// The Library's images and videos: each one's own page (/media/<id>). They show among the Library's other things
// (pages/Library.tsx), and Save to Library on what agents make (images/) keeps them. A picture an agent edited
// (edit_image) shows with its reply as the pictures agents make do.
import type { WebFeature } from '../registry';
import { GeneratedImages } from '../images/GeneratedImages';
import { MediaRoute } from './MediaView';

export const mediaFeature: WebFeature = {
  id: 'media',
  routes: [{ match: (p) => p.startsWith('/media/'), Page: MediaRoute }],
  toolViews: {
    edit_image: { place: 'answer', Row: GeneratedImages },
  },
};

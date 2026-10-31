// Images generated through OpenRouter, in the conversation (generate_image), and Settings → Images.
import { ImageIcon } from 'lucide-react';
import type { WebFeature } from '../registry';
import { GeneratedImages } from './GeneratedImages';
import { ImagesSettings } from './ImagesSettings';

export const imagesFeature: WebFeature = {
  id: 'images',
  toolViews: { generate_image: { place: 'answer', Row: GeneratedImages } },
  settings: [{ id: 'images', label: 'Images', icon: ImageIcon, sub: 'Pictures agents make for you, with an image model through OpenRouter', Body: ImagesSettings }],
};

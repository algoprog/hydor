// Images and videos made through OpenRouter, in the conversation (generate_image, generate_video), and
// Settings → Images and video (the models, and the one that writes captions in the Library).
import { ImageIcon } from 'lucide-react';
import type { WebFeature } from '../registry';
import { GeneratedImages } from './GeneratedImages';
import { GeneratedVideos } from './GeneratedVideos';
import { ImagesSettings } from './ImagesSettings';

export const imagesFeature: WebFeature = {
  id: 'images',
  toolViews: { generate_image: { place: 'answer', Row: GeneratedImages }, generate_video: { place: 'answer', Row: GeneratedVideos } },
  settings: [{ id: 'images', label: 'Images and video', icon: ImageIcon, sub: 'Pictures and videos agents make for you through OpenRouter, and who writes their captions in the Library', Body: ImagesSettings }],
};

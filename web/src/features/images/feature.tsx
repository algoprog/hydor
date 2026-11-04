// Images, videos and audio made through OpenRouter, in the conversation (generate_image, generate_video,
// generate_audio), and Settings → Images, video and audio (the models, and the one that writes captions in the Library).
import { ImageIcon } from 'lucide-react';
import type { WebFeature } from '../registry';
import { GeneratedAudio } from './GeneratedAudio';
import { GeneratedImages } from './GeneratedImages';
import { GeneratedVideos } from './GeneratedVideos';
import { ImagesSettings } from './ImagesSettings';

export const imagesFeature: WebFeature = {
  id: 'images',
  toolViews: {
    generate_image: { place: 'answer', Row: GeneratedImages },
    generate_video: { place: 'answer', Row: GeneratedVideos },
    generate_audio: { place: 'answer', Row: GeneratedAudio },
  },
  settings: [
    {
      id: 'images',
      label: 'Images, video and audio',
      icon: ImageIcon,
      sub: 'Pictures, videos, music and voices agents make for you through OpenRouter, and who writes their captions in the Library',
      Body: ImagesSettings,
    },
  ],
};

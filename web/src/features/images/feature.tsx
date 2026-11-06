// Images, drawings, videos and audio made through OpenRouter, in the conversation (generate_image, make_svg,
// generate_video, generate_audio; and videos edit_video edited), and Settings → Images, video and audio (the models, and the one that writes
// captions in the Library).
import { ImageIcon } from 'lucide-react';
import type { WebFeature } from '../registry';
import { GeneratedAudio } from './GeneratedAudio';
import { GeneratedImages } from './GeneratedImages';
import { GeneratedVideos } from './GeneratedVideos';
import { ImagesSettings } from './ImagesSettings';
import { EditedVideo } from '../mediaedit/video/EditedVideo';

export const imagesFeature: WebFeature = {
  id: 'images',
  toolViews: {
    generate_image: { place: 'answer', Row: GeneratedImages },
    make_svg: { place: 'answer', Row: GeneratedImages },
    generate_video: { place: 'answer', Row: GeneratedVideos },
    generate_audio: { place: 'answer', Row: GeneratedAudio },
    edit_video: { place: 'answer', Row: EditedVideo },
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

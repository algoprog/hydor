// Videos for slides: a YouTube or Vimeo video's still, which the server fetches and keeps as a picture so it shows
// everywhere the slide does (the editor, the slideshow, a deck's own page, PowerPoint's file) without the web.
import { post } from '../../../lib/api';

/** A YouTube or Vimeo video's still, kept by the app ("naget-asset:<sha>"), or undefined when its site gave none. */
export async function fetchVideoStill(url: string): Promise<string | undefined> {
  try {
    return (await post<{ src: string }>('/api/pages/video-still', { url })).src;
  } catch {
    return undefined;
  }
}

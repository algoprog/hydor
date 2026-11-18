// A picture of a page that the desktop app read into a file (the right-click menu's Save image to Library): kept in the
// Library, with the page it came from as its source.
import type { MediaItem } from '@shared/media';
import { post } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toastError, useToasts } from '../../lib/store';

/** Keeps the picture in the Library and says so, with a way to open it. */
export async function keepPicture(c: { path: string; url: string }) {
  // The file is on this computer: another machine's Library cannot reach it.
  if (machineId) return toastError(new Error('A picture can only be saved to the Library of the computer this app runs on.'));
  try {
    const r = await post<{ item: MediaItem; existed: boolean }>('/api/media', { path: c.path, source: c.url });
    useToasts.getState().push('ok', r.existed ? 'That picture is in your Library already' : 'Saved to your Library', { label: 'Open', run: () => go(`/media/${encodeURIComponent(r.item.id)}`) });
  } catch (e) {
    toastError(e);
  }
}

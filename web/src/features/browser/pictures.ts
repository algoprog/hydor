// A picture of a page that the desktop app read into a file (the right-click menu's Save image): kept in the project
// (and folder) Save uses (SaveButton.tsx), with the page it came from as its source.
import type { MediaItem } from '@shared/media';
import { post } from '../../lib/api';
import { basename } from '../../lib/format';
import { machineId } from '../../lib/machine';
import { go } from '../../lib/nav';
import { tr } from '../../i18n/runtime';
import { toastError, useToasts } from '../../lib/store';
import { folderStill, type useSavePlace } from './SaveButton';

/** Keeps the picture in the project picked (`where`: the page's useSavePlace) and says so, with a way to open it. */
export async function keepPicture(c: { path: string; url: string }, where: ReturnType<typeof useSavePlace>) {
  // The file is on this computer: another machine cannot reach it.
  if (machineId) return toastError(new Error('A picture can only be saved on the computer this app runs on.'));
  try {
    const { place, name } = where;
    const dir = await folderStill(where);
    const r = await post<{ item: MediaItem; existed: boolean }>('/api/media', { path: c.path, source: c.url, space: place.space, dir });
    const text = r.existed ? 'That picture is saved already' : dir ? tr(`Saved to ${basename(dir)}`) : name ? tr(`Saved to ${name}’s files`) : 'Picture saved';
    useToasts.getState().push('ok', text, { label: 'Open', run: () => go(`/media/${encodeURIComponent(r.item.id)}`) });
  } catch (e) {
    toastError(e);
  }
}

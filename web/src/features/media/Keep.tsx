// "Keep" on a picture, video or sound an agent made: the file is copied to be kept (in the project you
// pick, when there are projects, and a folder of it if you like), where a model writes its title and description. Once
// kept, it says so and opens it.
import { useEffect, useState } from 'react';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import type { MediaItem } from '@shared/media';
import { post } from '../../lib/api';
import { basename } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { Button, cx, IconButton } from '../../components/ui';
import { useKeepIn } from '../spaces/SpacePick';
import { keptFrom, useMedia } from './state';

export interface KeepWhat {
  path: string;
  prompt?: string;
  model?: string;
  /** A song's lyrics, a hint for its title and description (the model cannot hear it). */
  lyrics?: string;
  sessionKey?: string;
}

function useKeep(w: KeepWhat) {
  const items = useMedia((s) => s.items);
  const [busy, setBusy] = useState(false);
  useEffect(() => useMedia.getState().ensure(), []);
  const kept = keptFrom(items, w.path);
  const keepIn = async (space: string | null, dir?: string) => {
    setBusy(true);
    try {
      const r = await post<{ item: MediaItem; existed: boolean }>('/api/media', { path: w.path, prompt: w.prompt, model: w.model, lyrics: w.lyrics, sessionKey: w.sessionKey, space, dir });
      useMedia.getState().put(r.item);
      if (!r.existed) toast(dir ? tr(`Saved to ${basename(dir)}; a title and a description are being written for it`) : 'Saved; a title and a description are being written for it', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // With spaces, it asks which one the picture goes in (the session's first); with none, it keeps at once.
  const menu = useKeepIn(w.sessionKey, (space, dir) => void keepIn(space, dir));
  const keep = (el: HTMLElement) => {
    if (kept) return go(`/media/${kept.id}`);
    menu.ask(el);
  };
  return { kept, busy, keep, menu: menu.menu };
}

/** The button under a picture, video or sound: Keep, or Kept, which opens it. */
export function KeepButton(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep, menu } = useKeep(w);
  // Where kept things go is said the first time a Keep button shows (features/tips).
  return (
    <>
      <span data-tip="library" className="inline-flex shrink-0">
        <Button
          size="sm"
          variant={kept ? 'ghost' : 'secondary'}
          className={cx(w.className, kept && 'text-ok')}
          icon={kept ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
          disabled={busy}
          onClick={(e) => keep(e.currentTarget)}
        >
          {kept ? 'Kept' : 'Keep'}
        </Button>
      </span>
      {menu}
    </>
  );
}

/** The same as an icon, on a picture's hover bar. */
export function KeepIcon(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep, menu } = useKeep(w);
  return (
    <>
      <IconButton label={kept ? 'Kept: open it' : 'Keep'} size="sm" disabled={busy} onClick={(e) => keep(e.currentTarget)} className={w.className}>
        {kept ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
      </IconButton>
      {menu}
    </>
  );
}

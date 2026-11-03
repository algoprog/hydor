// "Save to Library" on a picture or video an agent made: the file is copied into the Library (in the space you pick,
// when there are spaces), where a model writes its title and description. Once kept, it says so and opens it there.
import { useEffect, useState } from 'react';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import type { MediaItem } from '@shared/media';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton } from '../../components/ui';
import { useKeepIn } from '../spaces/SpacePick';
import { keptFrom, useMedia } from './state';

export interface KeepWhat {
  path: string;
  prompt?: string;
  model?: string;
  sessionKey?: string;
}

function useKeep(w: KeepWhat) {
  const items = useMedia((s) => s.items);
  const [busy, setBusy] = useState(false);
  useEffect(() => useMedia.getState().ensure(), []);
  const kept = keptFrom(items, w.path);
  const keepIn = async (space: string | null) => {
    setBusy(true);
    try {
      const r = await post<{ item: MediaItem; existed: boolean }>('/api/media', { path: w.path, prompt: w.prompt, model: w.model, sessionKey: w.sessionKey, space });
      useMedia.getState().put(r.item);
      if (!r.existed) toast('Saved to your Library; a title and a description are being written for it', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // With spaces, it asks which one the picture goes in (the session's first); with none, it keeps at once.
  const menu = useKeepIn(w.sessionKey, (space) => void keepIn(space));
  const keep = (el: HTMLElement) => {
    if (kept) return go(`/media/${kept.id}`);
    menu.ask(el);
  };
  return { kept, busy, keep, menu: menu.menu };
}

/** The button under a picture or video: Save to Library, or Saved, which opens it there. */
export function KeepButton(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep, menu } = useKeep(w);
  return (
    <>
      <Button
        size="sm"
        variant={kept ? 'ghost' : 'secondary'}
        className={cx(w.className, kept && 'text-ok')}
        icon={kept ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />}
        disabled={busy}
        onClick={(e) => keep(e.currentTarget)}
      >
        {kept ? 'In your Library' : 'Save to Library'}
      </Button>
      {menu}
    </>
  );
}

/** The same as an icon, on a picture's hover bar. */
export function KeepIcon(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep, menu } = useKeep(w);
  return (
    <>
      <IconButton label={kept ? 'In your Library: open it there' : 'Save to Library'} size="sm" disabled={busy} onClick={(e) => keep(e.currentTarget)} className={w.className}>
        {kept ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
      </IconButton>
      {menu}
    </>
  );
}

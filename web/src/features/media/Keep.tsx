// "Save to Library" on a picture or video an agent made: the file is copied into the Library, where a model
// writes its title and description. Once kept, it says so and opens the item there.
import { useEffect, useState } from 'react';
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import type { MediaItem } from '@shared/media';
import { post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton } from '../../components/ui';
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
  const keep = async () => {
    if (kept) return go(`/media/${kept.id}`);
    setBusy(true);
    try {
      const r = await post<{ item: MediaItem; existed: boolean }>('/api/media', { path: w.path, prompt: w.prompt, model: w.model, sessionKey: w.sessionKey });
      useMedia.getState().put(r.item);
      if (!r.existed) toast('Saved to your Library; a title and a description are being written for it', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return { kept, busy, keep };
}

/** The button under a picture or video: Save to Library, or Saved, which opens it there. */
export function KeepButton(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep } = useKeep(w);
  return (
    <Button size="sm" variant={kept ? 'ghost' : 'secondary'} className={cx(w.className, kept && 'text-ok')} icon={kept ? <BookmarkCheck size={13} /> : <BookmarkPlus size={13} />} disabled={busy} onClick={() => void keep()}>
      {kept ? 'In your Library' : 'Save to Library'}
    </Button>
  );
}

/** The same as an icon, on a picture's hover bar. */
export function KeepIcon(w: KeepWhat & { className?: string }) {
  const { kept, busy, keep } = useKeep(w);
  return (
    <IconButton label={kept ? 'In your Library: open it there' : 'Save to Library'} size="sm" disabled={busy} onClick={() => void keep()} className={w.className}>
      {kept ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
    </IconButton>
  );
}

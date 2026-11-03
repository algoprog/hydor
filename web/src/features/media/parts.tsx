// The Library's pictures and videos (shown among its other things, by space: pages/Library.tsx): a still to show
// one by, and what its menus do (write its title again, start a session with it, download it). Each opens at its
// own place (/media/<id>).
import { useState } from 'react';
import { ImageIcon, Play } from 'lucide-react';
import { clipLength, type MediaItem } from '@shared/media';
import { enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { startSessionWith } from '../../lib/startFiles';
import { toastError } from '../../lib/store';
import { cx } from '../../components/ui';
import { mediaUrl } from './state';

/** A still of an item: the picture itself (or its smaller copy), a video's still. */
export function Still({ m, className }: { m: MediaItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cx('relative overflow-hidden bg-bg-2', className)}>
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center text-fg-3">{m.kind === 'video' ? <Play size={22} /> : <ImageIcon size={22} />}</span>
      ) : (
        <img src={mu(mediaUrl(m, 'still'))} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      )}
      {m.kind === 'video' && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          <Play size={10} fill="currentColor" />
          {clipLength(m.duration) || 'Video'}
        </span>
      )}
    </div>
  );
}

export async function recaption(m: MediaItem) {
  try {
    await post(`/api/media/${enc(m.id)}/caption`);
  } catch (e) {
    toastError(e);
  }
}

/** The start page, with the Library's copy in its message box: the new session gets it with its first message. */
export const startSessionWithMedia = (m: MediaItem) => startSessionWith([{ path: m.file, size: m.bytes, name: `${m.title}${/\.[a-z0-9]+$/i.exec(m.file)?.[0] ?? ''}` }]);

export function downloadMedia(m: MediaItem) {
  const a = document.createElement('a');
  a.href = mu(`${mediaUrl(m)}?download=1`);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

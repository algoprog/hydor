// The Library's pictures, videos and sounds (shown among its other things, by space: pages/Library.tsx): a still to
// show one by (a sound's shape, with a button to play it where it is), and what its menus do (write its title again,
// start a session with it, download it). Each opens at its own place (/media/<id>).
import { useState } from 'react';
import { ImageIcon, Play } from 'lucide-react';
import { clipLength, type MediaItem } from '@shared/media';
import { enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { startSessionWith } from '../../lib/startFiles';
import { toastError } from '../../lib/store';
import { cx } from '../../components/ui';
import { PlayButton, SoundIcon, useSound, Waveform } from '../../components/AudioPlayer';
import { clock } from '../../components/VideoPlayer';
import { mediaUrl } from './state';

/** A still of an item: the picture itself (or its smaller copy), a video's still, a sound's shape. */
export function Still({ m, className }: { m: MediaItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (m.kind === 'audio') return <SoundFace m={m} progress={0} className={className} />;
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

/** A sound's face: its shape on a soft wash of the accent (its icon when the shape is not known), the part played filled. */
function SoundFace({ m, progress, className }: { m: MediaItem; progress: number; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br from-accent-soft via-bg-2 to-bg-2', className)}>
      {m.peaks?.length ? (
        <span className="absolute inset-x-[9%] top-[18%] bottom-[34%] flex">
          <Waveform peaks={m.peaks} progress={progress} thin className="h-full w-full" />
        </span>
      ) : (
        <span className="absolute inset-x-0 top-[18%] bottom-[34%] flex items-center justify-center">
          <SoundIcon size={28} />
        </span>
      )}
    </div>
  );
}

/**
 * A sound's card picture in the Library: its face, which opens it (`onOpen`), and a button to play it right there,
 * with its length beside it (the time played, while it plays).
 */
export function SoundTile({ m, onOpen, className }: { m: MediaItem; onOpen: () => void; className?: string }) {
  const s = useSound(mu(mediaUrl(m)), false);
  const started = s.playing || s.time > 0;
  return (
    <div className={cx('relative', className)}>
      <button type="button" onClick={onOpen} className="absolute inset-0 block text-left" aria-label={m.title}>
        <SoundFace m={m} progress={s.progress} className="h-full w-full" />
      </button>
      <span className="absolute bottom-2 left-2.5 flex items-center gap-2">
        <PlayButton playing={s.playing} onClick={s.toggle} size={32} disabled={s.failed} />
        {(started || !!m.duration) && <span className="tnum rounded-md bg-bg/70 px-1.5 py-0.5 text-[11px] font-medium text-fg-2 backdrop-blur-sm">{started ? clock(s.time) : clipLength(m.duration)}</span>}
      </span>
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

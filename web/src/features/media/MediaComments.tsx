// Comments on a picture, a video or a sound (shared/media-comments.ts), as review tools have them: on a spot of a
// picture, shown as a numbered pin on it; at a moment of a video or a sound, shown as a mark along its time; or on the
// whole of it. The stage (the picture with its pins, the player with its marks) and the list beside it share one state
// (useMediaReview): picking one shows it on the other, a click on the picture while a comment is being written puts it
// there, and a comment at a moment is at the moment the player is at. Your own Library page (MediaView) and the page of
// someone it is shared with (portal/PortalMedia) both show it, each sending the changes where its own comments are kept.
import { useMemo, useRef, useState } from 'react';
import { Clock, Crosshair, MessageSquarePlus, X } from 'lucide-react';
import type { Comment } from '@shared/comments';
import { momentText, sortMediaComments, type MediaComment, type MediaCommentOp } from '@shared/media-comments';
import type { MediaKind } from '@shared/media';
import { AudioPlayer } from '../../components/AudioPlayer';
import { VideoPlayer, type PlayerHandle } from '../../components/VideoPlayer';
import { Button, cx } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { toastError } from '../../lib/store';
import { CommentBox, CommentThread, isMine } from '../pages/common/Comments';

/** What the review shows of the item. */
export interface ReviewItem {
  id: string;
  kind: MediaKind;
  title: string;
  description?: string;
  width?: number;
  height?: number;
  duration?: number;
  peaks?: number[];
}

/** Where a new comment goes: a spot of the picture, a moment, or (neither) the whole of it. */
type Place = { x: number; y: number } | { t: number } | null;

export interface MediaReview {
  item: ReviewItem;
  comments: MediaComment[];
  /** Sends a list of changes; false when it could not. */
  send(ops: MediaCommentOp[]): Promise<boolean>;
  active: string | null;
  setActive(id: string | null): void;
  /** A comment being written, and where it goes. */
  adding: boolean;
  place: Place;
  setPlace(p: Place): void;
  start(): void;
  stop(): void;
  player: React.MutableRefObject<PlayerHandle | null>;
  /** The pins' numbers, by comment: the open ones on a spot, in their order. */
  numbers: Map<string, number>;
}

/** The state a review shares between its stage and its list. `send` keeps the changes and gives the comments after them. */
export function useMediaReview(item: ReviewItem, comments: MediaComment[], send: (ops: MediaCommentOp[]) => Promise<MediaComment[]>, onChange: (list: MediaComment[]) => void): MediaReview {
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [place, setPlace] = useState<Place>(null);
  const player = useRef<PlayerHandle | null>(null);
  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const c of sortMediaComments(comments)) if (c.x !== undefined && !c.resolved) m.set(c.id, ++n);
    return m;
  }, [comments]);
  return {
    item,
    comments,
    async send(ops) {
      try {
        onChange(await send(ops));
        return true;
      } catch (e) {
        toastError(e);
        return false;
      }
    },
    active,
    setActive,
    adding,
    place,
    setPlace,
    start() {
      setAdding(true);
      setActive(null);
      // A video's or a sound's comment is at the moment it is at now (the whole of it, from its start).
      const t = player.current?.time() ?? 0;
      setPlace(item.kind !== 'image' && t > 0.05 ? { t } : null);
    },
    stop() {
      setAdding(false);
      setPlace(null);
    },
    player,
    numbers,
  };
}

/** A pin on the picture: its number, raised when picked. */
function Pin({ n, active, at, onClick, adding }: { n: number | string; active?: boolean; at: { x: number; y: number }; onClick?: () => void; adding?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={typeof n === 'number' ? tr(`Comment ${n}`) : tr('Your new comment')}
      className={cx(
        // Its point (the corner without a curve) on the spot.
        'absolute flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-none text-[12px] font-semibold text-white shadow-lg ring-2 ring-white/90 transition-transform',
        adding ? 'bg-accent' : active ? 'scale-110 bg-warn' : 'bg-info hover:scale-110',
      )}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%`, transformOrigin: 'bottom left' }}
    >
      {n}
    </button>
  );
}

/**
 * The picture with its pins (a click while a comment is written puts it there), or the video or the sound with its
 * marks. `src`: its file; `poster`: a video's still.
 */
export function MediaStage({ r, src, poster, downloadUrl, onOpen }: { r: MediaReview; src: string; poster?: string; downloadUrl?: string; /** A click on the picture when no comment is being placed (full size). */ onOpen?: () => void }) {
  const { item } = r;
  const marks = r.comments.filter((c) => c.t !== undefined && !c.resolved).map((c) => ({ id: c.id, at: c.t!, active: c.id === r.active }));
  if (item.kind === 'video') {
    const ratio = item.width && item.height ? item.width / item.height : 16 / 9;
    const shape = item.width && item.height ? `${item.width} / ${item.height}` : '16 / 9';
    return (
      // As tall as the screen allows, as wide as its shape then is.
      <div className="overflow-hidden rounded-2xl border border-line bg-black" style={{ aspectRatio: shape, width: `min(100%, calc(72dvh * ${ratio}))` }}>
        <VideoPlayer src={src} name={item.title} downloadUrl={downloadUrl} poster={poster} marks={marks} onMark={(id) => r.setActive(id)} handle={r.player} />
      </div>
    );
  }
  if (item.kind === 'audio')
    return (
      // Its shape as kept, on a soft wash of the accent.
      <div className="w-full rounded-2xl border border-line bg-gradient-to-br from-accent-soft via-panel to-panel px-4 py-6 sm:px-6 sm:py-8">
        <AudioPlayer src={src} peaks={item.peaks ?? undefined} downloadUrl={downloadUrl} large marks={marks} onMark={(id) => r.setActive(id)} handle={r.player} />
      </div>
    );
  const placing = r.adding;
  return (
    <div className="relative inline-block max-w-full">
      <img
        src={src}
        alt={item.description || item.title}
        draggable={false}
        onClick={(e) => {
          if (!placing) return onOpen?.();
          const b = e.currentTarget.getBoundingClientRect();
          r.setPlace({ x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) });
        }}
        className={cx('block max-h-[72dvh] max-w-full rounded-2xl border border-line bg-bg-2 object-contain', placing ? 'cursor-crosshair' : onOpen && 'cursor-zoom-in')}
      />
      {r.comments.map((c) => (c.x !== undefined && c.y !== undefined && !c.resolved && r.numbers.has(c.id) ? <Pin key={c.id} n={r.numbers.get(c.id)!} active={c.id === r.active} at={{ x: c.x, y: c.y }} onClick={() => r.setActive(c.id)} /> : null))}
      {r.place && 'x' in r.place && <Pin n="+" adding at={r.place} />}
    </div>
  );
}

/** Where a comment is, in a few words: its moment (a click goes there), its pin's number, or the whole of it. */
function Where({ r, c }: { r: MediaReview; c: MediaComment }) {
  if (c.t !== undefined)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          r.player.current?.seek(c.t!);
          r.setActive(c.id);
        }}
        className="tnum inline-flex items-center gap-1 rounded-md bg-info/12 px-1.5 py-0.5 text-[11.5px] font-medium text-info hover:bg-info/20"
      >
        <Clock size={11} />
        {momentText(c.t)}
      </button>
    );
  const n = r.numbers.get(c.id);
  if (c.x !== undefined)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-info/12 px-1.5 py-0.5 text-[11.5px] font-medium text-info">
        <Crosshair size={11} />
        {n ? tr(`Pin ${n}`) : 'On a spot'}
      </span>
    );
  return null;
}

/** The comments: a new one (where it goes, then its words), and each thread to answer, resolve, change or delete. */
export function MediaCommentsPanel({ r, className }: { r: MediaReview; className?: string }) {
  const [resolved, setResolved] = useState(false);
  const sorted = sortMediaComments(r.comments);
  const open = sorted.filter((c) => !c.resolved);
  const done = sorted.filter((c) => c.resolved);
  // Whole sentences, each kind its own (they read so in every language).
  const whole = r.item.kind === 'video' ? 'On the whole video' : r.item.kind === 'audio' ? 'On the whole sound' : 'On the whole picture';
  const instead = r.item.kind === 'video' ? 'On the whole video instead' : r.item.kind === 'audio' ? 'On the whole sound instead' : 'On the whole picture instead';
  const thread = (c: MediaComment) => (
    <div key={c.id} className="space-y-1">
      <Where r={r} c={c} />
      <CommentThread
        comment={c as Comment}
        active={r.active === c.id}
        onFocus={() => {
          r.setActive(c.id);
          if (c.t !== undefined) r.player.current?.seek(c.t);
        }}
        onReply={(text) => void r.send([{ id: c.id, reply: text }])}
        onResolve={(x) => void r.send([x ? { id: c.id, resolve: true } : { id: c.id, reopen: true }])}
        onEdit={isMine(c) ? (text) => void r.send([{ id: c.id, edit: text }]) : undefined}
        onDelete={() => void r.send([{ id: c.id, delete: true }])}
      />
    </div>
  );
  return (
    <div className={cx('space-y-2.5', className)}>
      {r.adding ? (
        <div className="space-y-2 rounded-xl border border-line bg-elevated p-2.5">
          <div className="flex min-h-6 flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
            {r.place && 't' in r.place ? (
              <>
                {/* Its moment as the clock shows it, as each comment's is (no words to read wrongly in another language). */}
                <span className="tnum inline-flex items-center gap-1 rounded-md bg-info/12 px-1.5 py-0.5 font-medium text-info" title={tr('At the moment it is at')}>
                  <Clock size={11} />
                  {momentText(r.place.t)}
                </span>
                <button type="button" onClick={() => r.setPlace(null)} className="hover:text-fg">
                  {tr(instead)}
                </button>
              </>
            ) : r.place && 'x' in r.place ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
                  <Crosshair size={11} />
                  On the spot you picked
                </span>
                <button type="button" onClick={() => r.setPlace(null)} className="inline-flex items-center gap-0.5 hover:text-fg" aria-label={tr('Take the pin away')}>
                  <X size={12} /> Take it away
                </button>
              </>
            ) : r.item.kind === 'image' ? (
              <span>Click on the picture where it goes, or leave it on the whole picture.</span>
            ) : (
              <>
                <span>{tr(whole)}</span>
                <button
                  type="button"
                  onClick={() => r.setPlace({ t: r.player.current?.time() ?? 0 })}
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Clock size={11} /> At the moment it is at
                </button>
              </>
            )}
          </div>
          <CommentBox
            autoFocus
            onSubmit={async (text) => {
              const p = r.place;
              const sent = await r.send([{ text, ...(p && 'x' in p ? { x: p.x, y: p.y } : p && 't' in p ? { t: p.t } : {}) }]);
              if (sent) r.stop();
            }}
            onCancel={r.stop}
          />
        </div>
      ) : (
        <Button size="sm" variant="secondary" icon={<MessageSquarePlus size={14} />} onClick={r.start} className="w-full justify-center">
          Add a comment
        </Button>
      )}
      {open.map(thread)}
      {!open.length && !r.adding && <div className="px-1 py-3 text-center text-[13px] text-fg-3">{done.length ? 'Every comment is resolved.' : 'No comments yet.'}</div>}
      {done.length > 0 && (
        <button type="button" onClick={() => setResolved((x) => !x)} className="px-1 text-[12.5px] text-fg-3 hover:text-fg">
          {resolved ? 'Hide the resolved ones' : tr(`Show ${done.length} resolved`)}
        </button>
      )}
      {resolved && done.map(thread)}
    </div>
  );
}

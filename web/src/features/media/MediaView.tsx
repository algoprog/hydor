// One image or video in the Library (/media/<id>): the picture (a tap away from full size) or the video to play,
// its title and description (written by a model, or by you: Edit), what it was made from and with, its size,
// length and file, the session it came from, and for a video the frames the model saw. Download, write the
// title and description again, or delete it.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Ellipsis, MessagesSquare, Pencil, RefreshCw, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { useLocation } from 'wouter';
import { clipLength, type MediaItem } from '@shared/media';
import { api, del, enc, patch } from '../../lib/api';
import { bytes } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { openLightbox } from '../../components/Lightbox';
import { VideoPlayer } from '../../components/VideoPlayer';
import { Button, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { NavButton } from '../layout/PageHeader';
import { downloadMedia, recaption } from './MediaGrid';
import { mediaUrl, useMedia } from './state';

export function MediaRoute() {
  const [loc] = useLocation();
  const id = /^\/media\/([a-f0-9]{10})$/.exec(loc)?.[1];
  return id ? <MediaView id={id} /> : <Empty title="No such image or video" />;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-[12.5px]">
      <span className="w-24 shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 flex-1 text-fg-2">{children}</span>
    </div>
  );
}

function MediaView({ id }: { id: string }) {
  const mobile = useIsMobile();
  const live = useMedia((s) => s.items?.find((m) => m.id === id));
  const [loaded, setLoaded] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => {
    setLoaded(null);
    setError(null);
    setEditing(false);
    api<{ item: MediaItem }>(`/api/media/${enc(id)}`).then(
      (r) => setLoaded(r.item),
      (e) => setError((e as Error).message),
    );
    useMedia.getState().ensure();
  }, [id]);
  // The list hears of changes (its title written, an edit): the newest of the two.
  const m = live && (!loaded || live.updatedAt >= loaded.updatedAt) ? live : loaded;
  if (error) return <Empty title="No such image or video">{error}</Empty>;
  if (!m)
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const startEdit = () => {
    setTitle(m.title);
    setText(m.description);
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const r = await patch<{ item: MediaItem }>(`/api/media/${enc(m.id)}`, { title, description: text });
      setLoaded(r.item);
      useMedia.getState().put(r.item);
      setEditing(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: `Delete “${m.title}”?`, body: 'It goes from your Library. The file it was saved from, if it is still there, stays.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(`/api/media/${enc(m.id)}`);
      go('/library?tab=media');
    } catch (e) {
      toastError(e);
    }
  };
  const src = mu(mediaUrl(m));
  const size = m.width && m.height ? `${m.width} × ${m.height}` : undefined;
  const ratio = m.width && m.height ? m.width / m.height : 16 / 9;
  const shape = m.width && m.height ? `${m.width} / ${m.height}` : '16 / 9';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
          {!mobile && <NavButton />}
          <IconButton label="The Library’s images and videos" onClick={() => go('/library?tab=media')}>
            <ArrowLeft size={18} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
              {m.title}
            </h1>
            <div className="truncate text-[11.5px] text-fg-3">{m.kind === 'video' ? (m.duration ? `A video, ${clipLength(m.duration)}` : 'A video') : 'An image'}</div>
          </div>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => downloadMedia(m)}>
            <span className="max-sm:hidden">Download</span>
          </Button>
          <IconButton ref={moreRef} label="More" onClick={() => setMenu((x) => !x)} active={menu}>
            <Ellipsis size={17} />
          </IconButton>
          <Popover anchor={moreRef} open={menu} onClose={() => setMenu(false)} align="end" width={260}>
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(false), startEdit())}>
              Edit the title and description
            </MenuItem>
            <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setMenu(false), void recaption(m))}>
              Write them again
            </MenuItem>
            {m.sessionKey && (
              <MenuItem icon={<MessagesSquare size={14} />} onClick={() => (setMenu(false), go(`/s/${encodeURIComponent(m.sessionKey!)}`))}>
                Open its session
              </MenuItem>
            )}
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
              Delete
            </MenuItem>
          </Popover>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1180px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 items-start justify-center">
            {m.kind === 'video' ? (
              // As tall as the screen allows, as wide as its shape then is.
              <div className="overflow-hidden rounded-2xl border border-line bg-black" style={{ aspectRatio: shape, width: `min(100%, calc(72dvh * ${ratio}))` }}>
                <VideoPlayer src={src} name={m.title} downloadUrl={`${src}?download=1`} poster={mu(mediaUrl(m, 'still'))} />
              </div>
            ) : (
              <button type="button" className="cursor-zoom-in" onClick={() => openLightbox([{ src, name: m.title }])} aria-label="Show it full size">
                <img src={src} alt={m.description || m.title} className="max-h-[72dvh] max-w-full rounded-2xl border border-line bg-bg-2 object-contain" />
              </button>
            )}
          </div>
          <aside className="min-w-0 space-y-4">
            {editing ? (
              <div className="space-y-2.5 rounded-2xl border border-line bg-panel p-4">
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-fg-2">Title</span>
                  <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                </label>
                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-fg-2">Description</span>
                  <textarea value={text} maxLength={2000} rows={5} onChange={(e) => setText(e.target.value)} className={`${inputCls} h-auto py-2 leading-snug`} />
                </label>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" disabled={busy || !title.trim()} onClick={() => void save()}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="flex items-start gap-2">
                  <h2 translate="no" className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">
                    {m.title}
                  </h2>
                  <IconButton label="Edit the title and description" size="sm" onClick={startEdit}>
                    <Pencil size={14} />
                  </IconButton>
                </div>
                {m.caption === 'pending' ? (
                  <p className="mt-2 flex items-center gap-2 text-[12.5px] text-fg-3">
                    <Throbber size={12} /> Writing its title and description…
                  </p>
                ) : (
                  m.description && (
                    <p translate="no" className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
                      {m.description}
                    </p>
                  )
                )}
                {m.caption === 'failed' && (
                  <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] leading-snug text-fg-2">
                    <div className="flex items-start gap-2">
                      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
                      <span>
                        No model could write them, so they come from the words it was made from.{' '}
                        <span translate="no" className="text-fg-3">
                          {m.captionError}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={() => void recaption(m)}>
                        Try again
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Settings2 size={13} />} onClick={() => go('/settings?s=images&find=Captions%20in%20the%20Library')}>
                        Pick the model
                      </Button>
                    </div>
                  </div>
                )}
                {m.captionBy && m.caption === 'done' && <p className="mt-2 text-[11.5px] text-fg-3">Written by {m.captionBy}</p>}
              </div>
            )}
            <div className="rounded-2xl border border-line bg-panel px-4 py-2.5">
              {m.model && (
                <Fact label="Made with">
                  <span translate="no" className="font-mono text-[12px]">
                    {m.model}
                  </span>
                </Fact>
              )}
              {m.prompt && (
                <Fact label="From the words">
                  <span translate="no" className="line-clamp-6 whitespace-pre-wrap">
                    {m.prompt}
                  </span>
                </Fact>
              )}
              {size && <Fact label="Size">{size}</Fact>}
              {m.duration ? <Fact label="Length">{clipLength(m.duration)}</Fact> : null}
              <Fact label="File">{bytes(m.bytes)}</Fact>
              <Fact label="Kept">{new Date(m.createdAt).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}</Fact>
            </div>
            {m.kind === 'video' && (
              <div className="rounded-2xl border border-line bg-panel p-3">
                <div className="mb-2 px-1 text-[12.5px] font-medium text-fg-2">The frames its description was written from</div>
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => openLightbox([{ src: mu(mediaUrl(m, 'frames')), name: `${m.title}: 10 frames` }])} aria-label="Show the frames full size">
                  <img src={mu(mediaUrl(m, 'frames'))} alt="" loading="lazy" className="w-full rounded-lg border border-line bg-bg-2" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
      {confirmNode}
    </div>
  );
}

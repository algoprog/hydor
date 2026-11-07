// One image, video or sound in the Library (/media/<id>): the picture (a tap away from full size), the video or the
// sound to play (a sound's shape to seek along), its title and description (written by a model, or by you: Edit),
// its comments (on a spot of a picture, at a moment of a video or a sound: MediaComments.tsx), what it was made from
// and with, its size, length and file, the session it came from, for a video the frames the model saw, and for a sound
// its words. Edit a picture or a video in its editor (saved over it, or as a copy; the one before is kept, and Earlier
// versions brings one back), share it with people (each a link of their own, to comment or edit), download it, write
// the title and description again, start a new session with it in the message box, or delete it. A sound opens in the
// sound editor, and so does a video's sound (its More menu).
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, Download, Ellipsis, FolderInput, History, MessageSquare, MessageSquarePlus, MessagesSquare, Pencil, RefreshCw, Settings2, Share2, SlidersHorizontal, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { clipLength, type MediaItem, type MediaVersion } from '@shared/media';
import type { MediaComment, MediaCommentOp } from '@shared/media-comments';
import { api, del, enc, patch, post } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { bytes } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { openLightbox } from '../../components/Lightbox';
import { Button, Dialog, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { NavButton } from '../layout/PageHeader';
import { openEditor } from '../mediaedit/host';
import { editLibraryVideo } from '../mediaedit/video/open';
import { editLibrarySound } from '../mediaedit/audio/open';
import { SpaceMenu } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { openShare, useSharedThings } from '../spaces/ShareHost';
import { MediaCommentsPanel, MediaStage, useMediaReview } from './MediaComments';
import { downloadMedia, recaption, startSessionWithMedia } from './parts';
import { mediaUrl, useMedia, withDownload } from './state';

export function MediaRoute() {
  const [loc] = useLocation();
  const id = /^\/media\/([a-f0-9]{10})$/.exec(loc)?.[1];
  return id ? <MediaView id={id} /> : <Empty title="No such image, video or sound" />;
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
  const [moving, setMoving] = useState(false);
  const spaces = useSpaces();
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
  // Its comments, kept up to date (someone it is shared with, an agent).
  const [comments, setComments] = useState<MediaComment[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const loadComments = useCallback(() => api<{ comments: MediaComment[] }>(`/api/media/${enc(id)}/comments`).then((r) => setComments(r.comments), () => {}), [id]);
  useEffect(() => {
    setComments([]);
    void loadComments();
    return onFeatureEvent('media', ({ data }) => {
      const e = data as { what?: string; id?: string };
      if (e.what === 'comments' && e.id === id) void loadComments();
    });
  }, [id, loadComments]);
  const review = useMediaReview(
    m ?? { id, kind: 'image', title: '' },
    comments,
    (ops: MediaCommentOp[]) => post<{ comments: MediaComment[] }>(`/api/media/${enc(id)}/comments`, { ops }).then((r) => r.comments),
    setComments,
  );
  const people = useSharedThings()('media', id);
  if (error) return <Empty title="No such image, video or sound">{error}</Empty>;
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
      go(m.space ? `/library?project=${m.space}&kind=${m.kind}` : `/library?kind=${m.kind}`);
    } catch (e) {
      toastError(e);
    }
  };
  const src = mu(mediaUrl(m));
  /** The picture in the picture editor: saved over this item (its place, title and folder kept), or as a new one beside it. */
  const editPicture = () =>
    openEditor({
      kind: 'image',
      src,
      title: m.title,
      from: { label: m.title },
      to: { media: m.id },
      copy: true,
      save: (r) => {
        // A copy is a new item: it opens; the item written over shows itself again, as the Library hears.
        if (r.media && r.media !== m.id) go(`/media/${r.media}`);
      },
    });
  /** The video in the video editor: saved over this item (its place, title and folder kept), or as a new one beside it. */
  const editVideo = () =>
    editLibraryVideo(m, {
      src: mediaUrl(m),
      label: m.title,
      // A copy is a new item: it opens; the item written over shows itself again, as the Library hears.
      after: (r) => void (r.media && r.media !== m.id && go(`/media/${r.media}`)),
    });
  /** The sound in the sound editor (a video's: its sound, saved as a new sound): saved over this item, or as a new one beside it. */
  const editSound = () =>
    editLibrarySound(m, {
      src: mediaUrl(m),
      label: m.title,
      after: (r) => void (r.media && r.media !== m.id && go(`/media/${r.media}`)),
    });
  const size = m.width && m.height ? `${m.width} × ${m.height}` : undefined;
  const ratio = m.width && m.height ? m.width / m.height : 16 / 9;
  const shape = m.width && m.height ? `${m.width} / ${m.height}` : '16 / 9';
  const back = m.kind === 'video' ? 'The Library’s videos' : m.kind === 'audio' ? 'The Library’s audio' : 'The Library’s pictures';
  const what = m.kind === 'video' ? (m.duration ? `A video, ${clipLength(m.duration)}` : 'A video') : m.kind === 'audio' ? (m.duration ? `Audio, ${clipLength(m.duration)}` : 'Audio') : 'An image';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-6">
          {!mobile && <NavButton />}
          <IconButton label={back} onClick={() => go(m.space ? `/library?project=${m.space}&kind=${m.kind}` : `/library?kind=${m.kind}`)}>
            <ArrowLeft size={18} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
              {m.title}
            </h1>
            <div className="truncate text-[11.5px] text-fg-3">{what}</div>
          </div>
          <Button size="sm" variant="primary" icon={<MessageSquarePlus size={14} />} onClick={() => startSessionWithMedia(m)} title="Start a session with it" aria-label="Start a session with it">
            <span className="max-sm:hidden">Start a session with it</span>
          </Button>
          {m.kind === 'image' && (
            <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={editPicture} title="Edit the picture" aria-label="Edit the picture">
              <span className="max-sm:hidden">Edit</span>
            </Button>
          )}
          {m.kind === 'audio' && (
            <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={editSound} title="Edit the sound" aria-label="Edit the sound">
              <span className="max-sm:hidden">Edit</span>
            </Button>
          )}
          {m.kind === 'video' && (
            <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={14} />} onClick={editVideo} title="Edit the video" aria-label="Edit the video">
              <span className="max-sm:hidden">Edit</span>
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={<Share2 size={14} />} onClick={() => openShare({ kind: 'media', id: m.id, title: m.title, mediaKind: m.kind })} title="Share with people" aria-label="Share with people">
            <span className="max-sm:hidden">Share</span>
            {people > 0 && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3 max-sm:hidden">{people}</span>}
          </Button>
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
            {m.kind === 'video' && (
              <MenuItem icon={<AudioLines size={14} />} onClick={() => (setMenu(false), editSound())}>
                Edit its sound
              </MenuItem>
            )}
            <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setMenu(false), void recaption(m))}>
              Write them again
            </MenuItem>
            {!!m.versions && (
              <MenuItem icon={<History size={14} />} hint={String(m.versions)} onClick={() => (setMenu(false), setVersionsOpen(true))}>
                Earlier versions
              </MenuItem>
            )}
            {m.sessionKey && (
              <MenuItem icon={<MessagesSquare size={14} />} onClick={() => (setMenu(false), go(`/s/${encodeURIComponent(m.sessionKey!)}`))}>
                Open its session
              </MenuItem>
            )}
            {!!spaces?.length && (
              <MenuItem icon={<FolderInput size={14} />} hint={<span translate="no">{spaces.find((x) => x.id === m.space)?.name ?? ''}</span>} onClick={() => (setMenu(false), setMoving(true))}>
                Move to a project
              </MenuItem>
            )}
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
              Delete
            </MenuItem>
          </Popover>
          <SpaceMenu
            anchor={moreRef}
            open={moving}
            onClose={() => setMoving(false)}
            title="Move it to"
            value={m.space ?? null}
            onPick={(space) => {
              if (space === (m.space ?? null)) return;
              patch<{ item: MediaItem }>(`/api/media/${enc(m.id)}`, { space })
                .then((r) => {
                  useMedia.getState().put(r.item);
                  const name = spaces?.find((x) => x.id === space)?.name;
                  toast(name ? tr(`Moved to ${name}`) : 'Moved out of its project', 'ok');
                })
                .catch(toastError);
            }}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1180px] gap-5 px-3 py-4 sm:px-6 sm:py-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 items-start justify-center">
            <MediaStage
              r={review}
              src={src}
              poster={m.kind === 'video' ? mu(mediaUrl(m, 'still')) : undefined}
              downloadUrl={withDownload(src)}
              onOpen={() => openLightbox([{ src, name: m.title, edit: { to: { media: m.id }, from: m.title, save: (r) => void (r.media && r.media !== m.id && go(`/media/${r.media}`)) } }])}
            />
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
            <div className="rounded-2xl border border-line bg-panel p-3">
              <div className="mb-2 flex items-center gap-1.5 px-1 text-[12.5px] font-medium text-fg-2">
                <MessageSquare size={13} className="text-fg-3" />
                Comments
                {comments.filter((c) => !c.resolved).length > 0 && <span className="tnum text-fg-3">{comments.filter((c) => !c.resolved).length}</span>}
              </div>
              <MediaCommentsPanel r={review} />
            </div>
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
              {m.who && (
                <Fact label="Saved by">
                  <span translate="no">{m.who}</span>
                  {!!m.versions && (
                    <button type="button" onClick={() => setVersionsOpen(true)} className="ml-1.5 text-accent hover:underline">
                      Earlier versions
                    </button>
                  )}
                </Fact>
              )}
            </div>
            {m.lyrics && (
              <div className="rounded-2xl border border-line bg-panel p-4">
                <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Sung or spoken</div>
                <p translate="no" className="max-h-80 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap text-fg-2">
                  {m.lyrics}
                </p>
              </div>
            )}
            {m.kind === 'video' && (
              <div className="rounded-2xl border border-line bg-panel p-3">
                <div className="mb-2 px-1 text-[12.5px] font-medium text-fg-2">The frames its description was written from</div>
                <button type="button" className="block w-full cursor-zoom-in" onClick={() => openLightbox([{ src: mu(mediaUrl(m, 'frames')), name: `${m.title}: 10 frames`, edit: false }])} aria-label="Show the frames full size">
                  <img src={mu(mediaUrl(m, 'frames'))} alt="" loading="lazy" className="w-full rounded-lg border border-line bg-bg-2" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
      {versionsOpen && <VersionsDialog m={m} onClose={() => setVersionsOpen(false)} />}
      {confirmNode}
    </div>
  );
}

/** Its earlier versions (kept when it was saved over): each to look at or download, and to bring back. */
function VersionsDialog({ m, onClose }: { m: MediaItem; onClose: () => void }) {
  const [list, setList] = useState<MediaVersion[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => {
    api<{ versions: MediaVersion[] }>(`/api/media/${enc(m.id)}/versions`).then((r) => setList(r.versions), toastError);
  }, [m.id, m.updatedAt]);
  const fileOf = (v: number) => mu(`/api/media/${enc(m.id)}/versions/${v}/file`);
  const back = async (v: MediaVersion) => {
    if (!(await confirm({ title: 'Bring this version back?', body: 'It is shown again; the one shown now is kept among the earlier versions.', confirm: 'Bring it back' }))) return;
    setBusy(v.version);
    try {
      const r = await post<{ item: MediaItem }>(`/api/media/${enc(m.id)}/versions/${v.version}/restore`);
      useMedia.getState().put(r.item);
      toast('Brought back', 'ok');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Earlier versions" width={520}>
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">When it is saved over (by you, an agent, or someone you shared it with), the one before is kept here: the last five.</p>
      {!list ? (
        <Throbber className="text-fg-3" />
      ) : !list.length ? (
        <div className="py-4 text-center text-[13px] text-fg-3">No earlier versions.</div>
      ) : (
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {list.map((v) => (
            <div key={v.version} className="flex items-center gap-3 px-3 py-2.5 text-[13px]">
              {m.kind === 'image' ? (
                <button type="button" onClick={() => openLightbox([{ src: fileOf(v.version), name: m.title, edit: false }])} className="h-12 w-12 shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-line bg-bg-2" aria-label="Show it full size">
                  <img src={fileOf(v.version)} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ) : (
                <History size={16} className="shrink-0 text-fg-3" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{new Date(v.at).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <div className="truncate text-[12px] text-fg-3">
                  {[v.width && v.height ? `${v.width} × ${v.height}` : '', v.duration ? clipLength(v.duration) : '', bytes(v.bytes)].filter(Boolean).join(' · ')}
                  {v.who && (
                    <>
                      {' · '}
                      <span translate="no">{v.who}</span>
                    </>
                  )}
                </div>
              </div>
              <a href={withDownload(fileOf(v.version))} className="inline-flex h-7 items-center rounded-md px-2 text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Download">
                <Download size={14} />
              </a>
              <Button size="sm" variant="secondary" icon={<Undo2 size={13} />} disabled={busy !== null} onClick={() => void back(v)}>
                Bring back
              </Button>
            </div>
          ))}
        </div>
      )}
      {confirmNode}
    </Dialog>
  );
}

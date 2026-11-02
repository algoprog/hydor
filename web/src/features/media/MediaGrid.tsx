// The Library's Media: the images and videos you kept, each with the title and description a model wrote for
// it, newest first or by name, all or only images or only videos, and a box to find one by its words. Each
// opens at its own place (/media/<id>).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Download, Ellipsis, ImageIcon, Images, Play, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { clipLength, type MediaItem } from '@shared/media';
import { del, enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, IconButton, MenuItem, MenuSep, Popover, Segmented, Throbber, useConfirm } from '../../components/ui';
import { mediaUrl, useMedia } from './state';

type Show = 'all' | 'image' | 'video';
type Sort = 'new' | 'name';

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

export function downloadMedia(m: MediaItem) {
  const a = document.createElement('a');
  a.href = mu(`${mediaUrl(m)}?download=1`);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function MediaCard({ m }: { m: MediaItem }) {
  const [menu, setMenu] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const open = () => go(`/media/${m.id}`);
  const close = () => setMenu(false);
  const remove = async () => {
    close();
    if (!(await confirm({ title: `Delete “${m.title}”?`, body: 'It goes from your Library. The file it was saved from, if it is still there, stays.', confirm: 'Delete', danger: true }))) return;
    del(`/api/media/${enc(m.id)}`).catch(toastError);
  };
  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2">
      <button type="button" onClick={open} className="block text-left" aria-label={m.title}>
        <Still m={m} className="aspect-[16/10] w-full border-b border-line" />
      </button>
      <div className="flex min-w-0 items-start gap-1 py-2 pr-1 pl-3">
        <button type="button" onClick={open} className="min-w-0 flex-1 text-left">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {m.title}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[12px] leading-4 text-fg-3">
            {m.caption === 'pending' ? (
              <>
                <Throbber size={11} /> Writing its title…
              </>
            ) : (
              <span translate="no" className="truncate">
                {m.description || ago(m.createdAt)}
              </span>
            )}
          </span>
        </button>
        <IconButton ref={anchor} label="More" size="sm" onClick={() => setMenu((x) => !x)} active={menu}>
          <Ellipsis size={15} />
        </IconButton>
      </div>
      <Popover anchor={anchor} open={menu} onClose={close} align="end" width={250}>
        <MenuItem icon={<Download size={14} />} onClick={() => (close(), downloadMedia(m))}>
          Download
        </MenuItem>
        <MenuItem icon={<RefreshCw size={14} />} onClick={() => (close(), void recaption(m))}>
          Write its title and description again
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
          Delete
        </MenuItem>
      </Popover>
      {confirmNode}
    </div>
  );
}

export function MediaGrid() {
  const items = useMedia((s) => s.items);
  const [show, setShow] = useState<Show>('all');
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('wa.media.sort') as Sort) || 'new');
  const [sortMenu, setSortMenu] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    useMedia.getState().load().catch(toastError);
  }, []);
  useEffect(() => localStorage.setItem('wa.media.sort', sort), [sort]);
  const list = useMemo(() => {
    const q = find.trim().toLowerCase();
    const l = (items ?? []).filter((m) => (show === 'all' || m.kind === show) && (!q || `${m.title} ${m.description} ${m.prompt ?? ''}`.toLowerCase().includes(q)));
    return sort === 'name' ? [...l].sort((a, b) => a.title.localeCompare(b.title)) : l;
  }, [items, show, find, sort]);
  if (!items)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  if (!items.length)
    return (
      <Empty icon={<Images size={22} />} title="No images or videos yet">
        <span className="block">Ask an agent for a picture or a short video, then press Save to Library under it. Each one gets a title and a description written for it, and stays here after the session’s files are gone.</span>
        <span className="mt-3 inline-flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => go('/settings?s=images')}>
            Settings for images and video
          </Button>
        </span>
      </Empty>
    );
  const both = items.some((m) => m.kind === 'image') && items.some((m) => m.kind === 'video');
  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        {both && (
          <Segmented
            size="sm"
            value={show}
            onChange={setShow}
            options={[
              { value: 'all', label: 'All' },
              { value: 'image', label: 'Images' },
              { value: 'video', label: 'Videos' },
            ]}
          />
        )}
        {items.length > 4 && (
          <>
            <label className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 sm:max-w-[320px]">
              <Search size={14} className="shrink-0 text-fg-3" />
              <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an image or a video" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
              {find && (
                <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                  <X size={13} />
                </button>
              )}
            </label>
            <Button ref={sortRef} size="sm" variant="ghost" icon={<ArrowDownUp size={13} />} onClick={() => setSortMenu((x) => !x)}>
              {sort === 'name' ? 'Name' : 'Newest'}
            </Button>
            <Popover anchor={sortRef} open={sortMenu} onClose={() => setSortMenu(false)} width={180}>
              {(['new', 'name'] as Sort[]).map((x) => (
                <MenuItem key={x} onClick={() => (setSort(x), setSortMenu(false))}>
                  <span className={cx(sort === x && 'font-semibold text-fg')}>{x === 'name' ? 'Name' : 'Newest'}</span>
                </MenuItem>
              ))}
            </Popover>
          </>
        )}
      </div>
      {!list.length ? (
        <p className="py-6 text-center text-[13px] text-fg-3">{find ? `Nothing here has “${find}” in its words.` : 'Nothing of that kind yet.'}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] sm:gap-3.5">
          {list.map((m) => (
            <MediaCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </>
  );
}

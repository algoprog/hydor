// Free photos (Canva's photos, Google Slides' image search), for slides, documents and pages: a search of openly
// licensed photos (Openverse's, through this server: server/photos), their small pictures in a grid with each one's
// licence, and the one picked kept with what shows it, with its credit (title, author, licence, link). choosePhoto()
// opens it (a sheet on a phone) and resolves with the photo kept, or null when it is closed.
import { createElement, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExternalLink, Search } from 'lucide-react';
import type { Photo, PhotoOrientation, PhotoSearch, PhotoUse } from '@shared/photos';
import { api, enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { Button, cx, Dialog, inputCls, Segmented } from '../../components/ui';

/** Words to start from, before anything is searched for. */
const IDEAS = ['Mountains', 'A city at night', 'People at work', 'Ocean', 'Forest', 'Food', 'Technology', 'Flowers'];

const SHAPES: { value: PhotoOrientation; label: string }[] = [
  { value: 'any', label: 'Any shape' },
  { value: 'wide', label: 'Wide' },
  { value: 'tall', label: 'Tall' },
  { value: 'square', label: 'Square (1:1)' },
];

function FreePhotos({ start, onDone }: { start: { orientation?: PhotoOrientation; query?: string }; onDone: (p: PhotoUse | null) => void }) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState(start.query ?? '');
  const [shape, setShape] = useState<PhotoOrientation>(start.orientation ?? 'any');
  const [asked, setAsked] = useState<{ q: string; shape: PhotoOrientation } | null>(null);
  const [found, setFound] = useState<Photo[]>([]);
  const [from, setFrom] = useState<PhotoSearch['from'] | undefined>();
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<'search' | 'more' | 'use' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<Photo | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const done = (p: PhotoUse | null) => {
    setOpen(false);
    onDone(p);
  };

  const search = async (words: string, how: PhotoOrientation, next = false) => {
    const w = words.trim();
    if (!w || busy) return;
    setBusy(next ? 'more' : 'search');
    setError(null);
    try {
      const at = next ? page + 1 : 1;
      const r = await api<PhotoSearch>(`/api/photos/search?q=${enc(w)}&orientation=${how}&page=${at}${next && from ? `&from=${from}` : ''}`);
      setFound((f) => (next ? [...f, ...r.photos.filter((p) => !f.some((x) => x.id === p.id))] : r.photos));
      setFrom(r.from);
      setPage(at);
      setMore(r.more);
      setNote(r.note ?? null);
      setAsked({ q: w, shape: how });
      if (!next) setPicked(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  // Another shape, once something was searched for: the same words again.
  useEffect(() => {
    if (asked && asked.shape !== shape) void search(asked.q, shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);
  useEffect(() => {
    if (start.query) void search(start.query, shape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const use = async (p: Photo) => {
    if (busy) return;
    setBusy('use');
    setError(null);
    try {
      done(await post<PhotoUse>('/api/photos/use', { id: p.id }));
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => done(null)}
      title="Free photos"
      width={760}
      footer={
        <>
          <span className="mr-auto min-w-0 truncate text-[12px] text-fg-3">
            {picked ? (
              <span translate="no">
                {picked.title}
                {picked.creator ? ` · ${picked.creator}` : ''} · {picked.license}
              </span>
            ) : (
              'Openly licensed photos, free to use and to change; each one’s credit goes with it.'
            )}
          </span>
          {picked && (
            <a href={picked.page} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
              <ExternalLink size={13} />
              Its page
            </a>
          )}
          <Button size="sm" variant="primary" disabled={!picked || !!busy} onClick={() => picked && void use(picked)}>
            {busy === 'use' ? 'Adding…' : 'Use it'}
          </Button>
        </>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q, shape);
        }}
      >
        <input ref={field} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mountains, a team at work, a city at night…" aria-label="What the photos are of" className={cx(inputCls, 'min-w-0 flex-1')} />
        <Button size="sm" variant="secondary" type="submit" icon={<Search size={14} />} disabled={!q.trim() || busy === 'search'} className="h-9 shrink-0">
          {busy === 'search' ? 'Searching…' : 'Search'}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={shape} onChange={setShape} options={SHAPES} />
      </div>
      {error && <p className="mt-3 text-[12.5px] text-err">{error}</p>}
      {!asked && !error && (
        <div className="mt-4 space-y-2">
          <p className="text-[12.5px] text-fg-3">Search millions of photos people share to be used freely (Openverse: Flickr, Wikimedia Commons, museums and more). Or start from one of these:</p>
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => {
                  setQ(w);
                  void search(w, shape);
                }}
                className="rounded-full border border-line px-3 py-1 text-[12.5px] text-fg-2 hover:border-line-2 hover:bg-bg-1 hover:text-fg"
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
      {asked && !found.length && !busy && !error && <p className="mt-4 text-[12.5px] text-fg-3">{note ?? 'No free photos of that: try other words, or fewer.'}</p>}
      {found.length > 0 && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {found.map((p) => (
              <button
                key={p.id}
                type="button"
                title={`${p.title}${p.creator ? ` · ${p.creator}` : ''} · ${p.license}`}
                aria-label={p.title}
                aria-pressed={picked?.id === p.id}
                onClick={() => setPicked(p)}
                onDoubleClick={() => void use(p)}
                className={cx(
                  'group relative aspect-square overflow-hidden rounded-lg bg-bg-2 outline-none',
                  picked?.id === p.id ? 'ring-2 ring-accent ring-offset-2 ring-offset-elevated' : 'hover:ring-1 hover:ring-line-2 focus-visible:ring-2 focus-visible:ring-accent',
                )}
              >
                <img src={mu(p.thumb)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                <span translate="no" className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-px text-[10.5px] font-medium text-white">
                  {p.license.replace(/ \d.*$/, '')}
                </span>
              </button>
            ))}
          </div>
          {more && (
            <div className="mt-2 flex justify-center">
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => asked && void search(asked.q, asked.shape, true)}>
                {busy === 'more' ? 'Searching…' : 'More'}
              </Button>
            </div>
          )}
          {from === 'wikimedia' && <p className="mt-2 text-[11.5px] text-fg-3">From Wikimedia Commons: Openverse could not answer just now.</p>}
        </>
      )}
    </Dialog>
  );
}

/** Free photos to pick from: the one picked kept by the app, with its size and credit; null when closed. */
export function choosePhoto(start: { orientation?: PhotoOrientation; query?: string } = {}): Promise<PhotoUse | null> {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    let gone = false;
    root.render(
      createElement(FreePhotos, {
        start,
        onDone: (p: PhotoUse | null) => {
          if (gone) return;
          gone = true;
          resolve(p);
          // Its portal goes with its root, once the dialog has closed.
          setTimeout(() => {
            root.unmount();
            el.remove();
          }, 0);
        },
      }),
    );
  });
}

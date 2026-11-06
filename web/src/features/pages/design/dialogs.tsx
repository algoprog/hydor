// A design's dialogs: Download (PNG with a see-through background if you like, JPG, or a PDF to print, at 1×, 2× or 3×,
// exactly its size), Resize (a copy at another size, or this one resized, its elements placed to fit), a QR code, and
// a picture or a video picked from the Library.
import { useEffect, useMemo, useState } from 'react';
import { Download, Scaling, Search } from 'lucide-react';
import type { MediaItem } from '@shared/media';
import type { DesignSize } from '@shared/design';
import { ApiError, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { go } from '../../../lib/nav';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, Dialog, inputCls, Segmented, Switch } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { useMedia } from '../../media/state';
import { saveBlob } from '../exportFile';
import { ColorField } from '../studio/fields';
import { qrHtml } from './elements';
import { SizePicker } from './sizes';

type Format = 'png' | 'jpg' | 'pdf';

/** The design as a file, made by the server's browser from what is in the editor now. */
export function DownloadDialog({ open, onClose, html, title, boards, current }: { open: boolean; onClose: () => void; html: () => Promise<string>; title: string; boards: { w: number; h: number }[]; current: number }) {
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState('2');
  const [clear, setClear] = useState(false);
  const [which, setWhich] = useState<'all' | 'one'>('all');
  const [busy, setBusy] = useState(false);
  const b = boards[current] ?? boards[0] ?? { w: 1080, h: 1080 };
  const many = boards.length > 1;
  const download = async () => {
    setBusy(true);
    try {
      const body = { html: await html(), title, format, scale: Number(scale), transparent: format === 'png' && clear, board: many && which === 'one' ? current : undefined };
      const res = await fetch(mu('/api/pages/design-export'), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new ApiError(j?.error ?? `${res.status} ${res.statusText}`, res.status);
      }
      const cd = res.headers.get('content-disposition') ?? '';
      const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] ?? '') || `${title || 'design'}.${format}`;
      saveBlob(await res.blob(), name);
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const k = Number(scale);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Download"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Download size={14} />} disabled={busy} onClick={() => void download()}>
            {busy ? 'Making it…' : 'Download'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5 text-[13px]">
        <div className="space-y-1.5">
          <div className="text-[12.5px] font-medium text-fg-2">Kind of file</div>
          <Segmented
            size="sm"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPG' },
              { value: 'pdf', label: tr('PDF to print') },
            ]}
          />
          <p className="text-[12px] leading-snug text-fg-3">
            {format === 'png'
              ? tr('Every pixel kept, and see-through parts if you like: for the web and social media.')
              : format === 'jpg'
                ? tr('Smaller files, for photos and sharing.')
                : tr('Its own size on paper (an A4 poster prints on A4), its words sharp at any size.')}
          </p>
        </div>
        {format !== 'pdf' && (
          <div className="space-y-1.5">
            <div className="text-[12.5px] font-medium text-fg-2">Size</div>
            <Segmented size="sm" value={scale} onChange={setScale} options={['1', '2', '3'].map((v) => ({ value: v, label: `${v}×` }))} />
            <p className="text-[12px] text-fg-3 tabular-nums">{`${Math.round(b.w * k)} × ${Math.round(b.h * k)} px`}</p>
          </div>
        )}
        {format === 'png' && <Switch on={clear} onChange={setClear} label={tr('See-through background')} />}
        {many && (
          <div className="space-y-1.5">
            <div className="text-[12.5px] font-medium text-fg-2">Pages</div>
            <Segmented
              size="sm"
              value={which}
              onChange={setWhich}
              options={[
                { value: 'all', label: tr(`All ${boards.length} pages`) },
                { value: 'one', label: tr(`Page ${current + 1}`) },
              ]}
            />
            {which === 'all' && format !== 'pdf' && <p className="text-[12px] text-fg-3">{tr('A picture a page, in a .zip file.')}</p>}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Resize: a copy of the design at another size (Canva's Magic resize), or this design itself resized. */
export function ResizeDialog({
  open,
  onClose,
  from,
  title,
  current,
  copy,
  inPlace,
}: {
  open: boolean;
  onClose: () => void;
  from: { w: number; h: number } | null;
  title: string;
  current?: DesignSize;
  copy: (s: DesignSize) => Promise<string>;
  inPlace: (s: DesignSize) => void;
}) {
  const [size, setSize] = useState<DesignSize | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setSize(null);
  }, [open]);
  const same = !!size && !!from && size.w === from.w && size.h === from.h;
  const makeCopy = async () => {
    if (!size) return;
    setBusy(true);
    try {
      const html = await copy(size);
      const r = await post<{ page: { id: string } }>('/api/pages', { title: `${title} · ${tr(size.label)}`.slice(0, 120), html });
      onClose();
      toast(tr('A copy at the new size: opened for you'), 'ok');
      go(`/pages/${r.page.id}?mode=edit`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resize"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={!size || same || busy}
            onClick={() => {
              if (!size) return;
              inPlace(size);
              onClose();
            }}
          >
            Resize this one
          </Button>
          <Button variant="primary" icon={<Scaling size={14} />} disabled={!size || same || busy} onClick={() => void makeCopy()}>
            {busy ? 'Making it…' : 'Make a copy'}
          </Button>
        </>
      }
    >
      <p className="pb-3 text-[12.5px] leading-snug text-fg-2">
        {tr('Pick a size: its elements are scaled and placed to fit, what ran across the page runs across the new one, and what touched an edge still does. Check the copy over: long words may want a nudge.')}
        {from && <span className="text-fg-3 tabular-nums">{` ${tr('Now')} ${from.w} × ${from.h} px${current ? ` (${tr(current.label)})` : ''}.`}</span>}
      </p>
      <SizePicker value={size} onPick={setSize} columns={3} />
    </Dialog>
  );
}

/** Add → QR code: a link or any words, in two colours (the ground may be see-through). */
export function QrDialog({ open, onClose, onInsert, width, ink }: { open: boolean; onClose: () => void; onInsert: (html: string) => void; width: number; ink: string }) {
  const [text, setText] = useState('');
  const [dark, setDark] = useState(ink);
  const [light, setLight] = useState<string | null>('#ffffff');
  useEffect(() => {
    if (open) {
      setText('');
      setDark('#000000');
      setLight('#ffffff');
    }
  }, [open]);
  const html = useMemo(() => {
    try {
      return text.trim() ? qrHtml(text.trim(), { dark, light }, width) : '';
    } catch {
      return '';
    }
  }, [text, dark, light, width]);
  const svg = /<svg[\s\S]*<\/svg>/.exec(html)?.[0] ?? '';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="QR code"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!html} onClick={() => (onInsert(html), onClose())}>
            Add it
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="https://… or any words" className={cx(inputCls, 'w-full')} />
        <div className="flex items-start gap-3">
          <div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
            {svg ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="px-2 text-center text-[11.5px] text-fg-3">{tr('Type a link to see its code')}</span>}
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-[12.5px]">
            <div>
              <div className="pb-1 text-fg-2">{tr('Its squares')}</div>
              <ColorField value={dark} palette={['#000000', ink]} onChange={(c) => setDark(c ?? '#000000')} />
            </div>
            <div>
              <div className="pb-1 text-fg-2">{tr('Its ground')}</div>
              <ColorField value={light} none palette={['#ffffff']} onChange={setLight} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** The Library's pictures or videos, to pick one. */
export function MediaPick({ kind, onClose, onPick }: { kind: 'image' | 'video' | null; onClose: () => void; onPick: (m: MediaItem) => void }) {
  const items = useMedia((s) => s.items);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (kind) useMedia.getState().ensure();
  }, [kind]);
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (items ?? []).filter((m) => m.kind === kind && words.every((w) => `${m.title} ${m.description}`.toLowerCase().includes(w))).slice(0, 120);
  }, [items, kind, q]);
  return (
    <Dialog open={!!kind} onClose={onClose} title={kind === 'video' ? 'A video from your Library' : 'A picture from your Library'} width={620}>
      <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 focus-within:border-accent/60">
        <Search size={14} className="shrink-0 text-fg-3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name or description" className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      {!items && <p className="py-8 text-center text-[13px] text-fg-3">…</p>}
      {items && !list.length && <p className="py-8 text-center text-[13px] text-fg-3">{q.trim() ? tr('None by that name.') : kind === 'video' ? tr('Your Library has no videos yet.') : tr('Your Library has no pictures yet.')}</p>}
      <div className="grid max-h-[min(60dvh,460px)] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
        {list.map((m) => (
          <button key={m.id} type="button" onClick={() => onPick(m)} title={m.title} className="group overflow-hidden rounded-lg border border-line bg-bg-1 text-left hover:border-accent/60">
            <img src={mu(`/api/media/${enc(m.id)}/${m.kind === 'video' ? 'still' : 'file'}`)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            <span translate="no" className="block truncate px-1.5 py-1 text-[11.5px] text-fg-2">
              {m.title}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

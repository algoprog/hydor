// A thing of the Library to pick, of one kind (a deck, a spreadsheet): a find field over their names, newest first, each
// with its picture, its name and when it last changed. For Insert → Slides from another deck and Chart → From a
// spreadsheet.
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import { enc } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { cx } from '../../../components/ui';
import { LOCALE } from '../../../i18n/locale';
import { usePagesStore } from '../state';

const when = (at: number) => new Date(at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

export function LibraryPick({ kind, picked, onPick, leaveOut, empty }: { kind: NonNullable<PageInfo['kind']>; picked: string | null; onPick: (p: PageInfo) => void; leaveOut?: string; empty: string }) {
  const pages = usePagesStore((s) => s.pages);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!pages) void usePagesStore.getState().loadPages();
  }, [pages]);
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (pages ?? [])
      .filter((p) => p.kind === kind && !p.app && p.id !== leaveOut && words.every((w) => p.title.toLowerCase().includes(w)))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 200);
  }, [pages, q, kind, leaveOut]);
  return (
    <div className="space-y-1.5">
      <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 focus-within:border-accent/60">
        <Search size={14} className="shrink-0 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name" aria-label="Find by name" className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
      </label>
      <div className="max-h-[188px] overflow-y-auto overscroll-contain rounded-lg border border-line">
        {!pages && <p className="px-3 py-2.5 text-[12.5px] text-fg-3">…</p>}
        {pages && !list.length && <p className="px-3 py-2.5 text-[12.5px] text-fg-3">{q.trim() ? 'None by that name.' : empty}</p>}
        {list.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            aria-pressed={picked === p.id}
            className={cx('flex w-full items-center gap-2.5 border-b border-line px-2 py-1.5 text-left last:border-b-0', picked === p.id ? 'bg-accent-soft' : 'hover:bg-bg-1')}
          >
            <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md border border-line bg-bg-2">
              {p.thumb && <img src={mu(`/api/pages/${enc(p.id)}/thumb?v=${enc(p.thumb)}`)} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top" />}
            </span>
            <span translate="no" className="min-w-0 flex-1 truncate text-[13px] text-fg">
              {p.title}
            </span>
            <span className="shrink-0 text-[11.5px] text-fg-3 tabular-nums">{when(p.updatedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The history panel: the pages you visited in your own browser, by day, with a search box; what you closed lately,
// to open again; and a way to clear it all.
import { useEffect, useMemo, useRef, useState } from 'react';
import { History as HistoryIcon, Search, Trash2, Undo2, X } from 'lucide-react';
import type { HistoryEntry, HistoryImport, HistorySource } from '@shared/browser';
import { LOCALE } from '../../i18n/locale';
import { api, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, inputCls, Throbber } from '../../components/ui';
import { deleteHistory, goTo, KEY, loadHistory, reopenClosed } from './browsing';
import { Note, Panel } from './Panel';
import { SiteIcon } from './TabStrip';
import { useBrowser } from './store';

const PAGE = 100;
const clock = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' });

/** The day an entry belongs to, as its heading: Today, Yesterday, or the date. */
function dayOf(ts: number, now: Date): string {
  const d = new Date(ts);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86_400_000) return 'Yesterday';
  return (d.getFullYear() === now.getFullYear() ? dayName : dayYear).format(d);
}

/** Where an address is shown: without its scheme. */
const shown = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function HistoryPanel({ onClose, onClear, tab }: { onClose: () => void; onClear: () => void; tab?: string }) {
  const closed = useBrowser((s) => s.views[KEY]?.closed) ?? [];
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Counts the times history was brought in, so the list shown is read again.
  const [brought, setBrought] = useState(0);
  const first = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  // The first page at once, a later one a moment after typing stops; an answer to words no longer typed is dropped.
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(
      () => {
        loadHistory(q.trim(), undefined, PAGE).then(
          (r) => {
            if (!live) return;
            setEntries(r);
            setMore(r.length >= PAGE);
          },
          () => live && setEntries([]),
        );
      },
      first.current ? 0 : 150,
    );
    first.current = false;
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q, brought]);

  const older = async () => {
    const last = entries?.[entries.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      const r = await loadHistory(q.trim(), last.at, PAGE);
      setEntries((e) => [...(e ?? []), ...r.filter((x) => !e?.some((y) => y.id === x.id))]);
      setMore(r.length >= PAGE);
    } catch {
      setMore(false);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: number) => {
    if (await deleteHistory(id)) setEntries((e) => e?.filter((x) => x.id !== id) ?? null);
  };
  const open = (url: string, inNew: boolean) => void goTo(url, inNew || !tab ? { newTab: true } : { tab });

  const days = useMemo(() => {
    const now = new Date();
    const out: { day: string; items: HistoryEntry[] }[] = [];
    for (const e of entries ?? []) {
      const day = dayOf(e.at, now);
      const g = out[out.length - 1];
      if (g?.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [entries]);

  return (
    <Panel
      title="History"
      onClose={onClose}
      actions={
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onClear}>
          Clear browsing data…
        </Button>
      }
    >
      <div className="relative border-b border-line p-3">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-fg-3" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your history" aria-label="Search your history" translate="no" className={cx(inputCls, 'h-9 pl-9 text-[13.5px]')} />
      </div>
      {!q.trim() && closed.length > 0 && (
        <div className="border-b border-line py-1">
          <div className="px-4 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">Recently closed</div>
          {closed.slice(0, 6).map((c, i) => (
            <button key={`${c.url}${c.at}`} onClick={() => void reopenClosed(i)} title="Open it again" className="flex h-9 w-full items-center gap-2.5 px-4 text-left text-[13.5px] hover:bg-bg-2">
              <Undo2 size={14} className="shrink-0 text-fg-3" />
              <span translate="no" className="min-w-0 flex-1 truncate">
                {c.title || shown(c.url)}
              </span>
            </button>
          ))}
        </div>
      )}
      {!entries ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : !entries.length ? (
        <Note>{q.trim() ? 'Nothing in your history matches.' : 'Nothing here yet. The pages you visit are kept here, on this computer.'}</Note>
      ) : (
        <>
          {days.map((g) => (
            <div key={g.day}>
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg-1 px-4 pt-3 pb-1 text-[12px] font-medium text-fg-2">
                <HistoryIcon size={13} className="text-fg-3" />
                {g.day === 'Today' || g.day === 'Yesterday' ? g.day : <span translate="no">{g.day}</span>}
              </div>
              {g.items.map((e) => (
                <div key={e.id} className="group flex items-center gap-1 pr-2 pl-4 hover:bg-bg-2">
                  <button onClick={(ev) => open(e.url, ev.ctrlKey || ev.metaKey)} title={e.url} className="flex min-h-10 min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left">
                    <span translate="no" className="tnum shrink-0 whitespace-nowrap text-[11.5px] text-fg-3">
                      {clock.format(e.at)}
                    </span>
                    <SiteIcon url={e.url} size={15} />
                    <span className="min-w-0 flex-1">
                      <span translate="no" className="block truncate text-[13.5px]">
                        {e.title || shown(e.url)}
                      </span>
                      {e.title && (
                        <span translate="no" className="block truncate text-[11.5px] text-fg-3">
                          {shown(e.url)}
                        </span>
                      )}
                    </span>
                  </button>
                  <IconButton label="Remove from history" size="sm" onClick={() => void remove(e.id)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                    <X size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          ))}
          {more && (
            <div className="flex justify-center p-3">
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void older()}>
                {busy ? 'Loading…' : 'Show older'}
              </Button>
            </div>
          )}
        </>
      )}
      {!q.trim() && <ImportBox onBrought={() => setBrought((n) => n + 1)} />}
    </Panel>
  );
}

/** Bringing history in from the other browsers on this computer. */
function ImportBox({ onBrought }: { onBrought: () => void }) {
  const [sources, setSources] = useState<HistorySource[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api<{ sources: HistorySource[] }>('/api/browser/browsing/history/sources').then(
      (r) => live && setSources(r.sources),
      () => live && setSources([]),
    );
    return () => {
      live = false;
    };
  }, []);

  const bring = async (id: string) => {
    setBusy(id);
    try {
      const r = await post<HistoryImport>('/api/browser/browsing/history/import', { source: id });
      const n = r.added + r.updated;
      toast(n ? `Brought in ${n.toLocaleString(LOCALE)} page${n === 1 ? '' : 's'}` : 'Your history has all of it already', 'info');
      onBrought();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-line pb-4">
      <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Import</div>
      {sources === null && (
        <div className="flex justify-center py-3">
          <Throbber size={18} />
        </div>
      )}
      {sources?.map((s) => (
        <div key={s.id} className="flex items-center gap-2 px-4 py-1.5">
          <div className="min-w-0 flex-1">
            <div translate="no" className="truncate text-[13px]">
              {s.browser}
              {s.profile ? ` · ${s.profile}` : ''}
            </div>
            <div className={cx('text-[12px]', s.error ? 'text-warn' : 'text-fg-3')}>{s.error ? s.error : `${s.count.toLocaleString(LOCALE)} page${s.count === 1 ? '' : 's'}`}</div>
          </div>
          <Button size="sm" disabled={(!s.error && !s.count) || busy !== null} onClick={() => void bring(s.id)}>
            {busy === s.id ? 'Importing…' : 'Import'}
          </Button>
        </div>
      ))}
      {sources?.length === 0 && <Note>No other browser with history was found on this computer.</Note>}
    </div>
  );
}

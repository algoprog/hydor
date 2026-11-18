// What your own browser keeps, as lists in the Library (its chips Bookmarks, Downloads and History, in the desktop app):
// never copied into the Library, never in Everything or a project's count, and shown only to you (agents are refused
// the routes). Each row is a site's icon, a title and a muted line, with what can be done to it at the right on hover.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bookmark, ExternalLink, FileDown, FolderOpen, History as HistoryIcon, Lock, X } from 'lucide-react';
import type { BookmarkNode, DownloadEntry, HistoryEntry } from '@shared/browser';
import { api, del, enc } from '../../lib/api';
import { sepOf } from '../../lib/format';
import { go } from '../../lib/nav';
import { revealLabel } from '../../lib/reveal';
import { toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { Button, cx, Empty, IconButton, Throbber } from '../../components/ui';
import { deleteHistory, loadBookmarks, loadHistory, removeBookmark, showDownload, useBookmarks } from '../browser/browsing';
import { hostOfTab, SiteIcon } from '../browser/TabStrip';

export type BrowserKind = 'bookmarks' | 'downloads' | 'history';
export const BROWSER_KINDS: BrowserKind[] = ['bookmarks', 'downloads', 'history'];
export const isBrowserKind = (v: string | null | undefined): v is BrowserKind => !!v && (BROWSER_KINDS as string[]).includes(v);

const PAGE = 100;
const clock = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' });

/** The day a time belongs to, as its heading: Today, Yesterday, or the date. */
function dayOf(ts: number, now: Date): string {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86_400_000) return 'Yesterday';
  const d = new Date(ts);
  return (d.getFullYear() === now.getFullYear() ? dayName : dayYear).format(d);
}

/** Where an address is shown: without its scheme. */
const shown = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** Opens an address in your own browser (the Browser page opens it in a tab of its own). */
export const openInBrowser = (url: string) => go(`/browser?url=${encodeURIComponent(url)}`);

/** The folder a path is in. */
const folderOf = (path: string) => {
  const sep = sepOf(path);
  const i = path.lastIndexOf(sep);
  return i > 0 ? path.slice(0, i) : sep;
};

// ---- a row --------------------------------------------------------------------------------------------------------

/** One row: its icon, title and muted line; the actions show at the right when the row is hovered or has focus. */
function Row({ icon, title, line, tip, onOpen, actions, failed }: { icon: ReactNode; title: string; line: ReactNode; tip?: string; onOpen?: () => void; actions: ReactNode; failed?: boolean }) {
  return (
    <div className="group flex h-12 items-center gap-1 rounded-[10px] pr-1.5 pl-1.5 transition-colors hover:bg-bg-2 focus-within:bg-bg-2">
      <button type="button" onClick={onOpen} disabled={!onOpen} title={tip} className="flex h-full min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-1">{icon}</span>
        <span className="min-w-0 flex-1">
          <span translate="no" className="block truncate text-[13.5px] leading-5 text-fg">
            {title}
          </span>
          <span className={cx('block truncate text-[12px] leading-4', failed ? 'text-err' : 'text-fg-3')}>{line}</span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">{actions}</span>
    </div>
  );
}

const Day = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 px-2 pt-5 pb-1.5 text-[12px] font-medium text-fg-2 first:pt-1">
    <HistoryIcon size={13} className="text-fg-3" />
    {label === 'Today' || label === 'Yesterday' ? label : <span translate="no">{label}</span>}
  </div>
);

/** The list's own line under the toolbar: it is yours alone. */
const Private = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 flex items-center gap-1.5 px-1 text-[12px] text-fg-3">
    <Lock size={12} className="shrink-0" />
    {children}
  </p>
);

const Loading = () => (
  <div className="flex justify-center py-10 text-fg-3">
    <Throbber size={28} />
  </div>
);

// ---- bookmarks ----------------------------------------------------------------------------------------------------

/** Every bookmark (not the folders), the bookmarks bar's first, each with the folders it is in as a path. */
function flatten(nodes: BookmarkNode[]): { node: BookmarkNode; root: 'bar' | 'other'; folders: string[] }[] {
  const byParent = new Map<string, BookmarkNode[]>();
  for (const n of nodes) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
  const out: { node: BookmarkNode; root: 'bar' | 'other'; folders: string[] }[] = [];
  const walk = (root: 'bar' | 'other', parent: string, folders: string[]) => {
    for (const n of (byParent.get(parent) ?? []).sort((a, b) => a.pos - b.pos)) {
      if (n.url) out.push({ node: n, root, folders });
      else if (folders.length < 12) walk(root, n.id, [...folders, n.title]);
    }
  };
  walk('bar', 'bar', []);
  walk('other', 'other', []);
  return out;
}

function Bookmarks({ q }: { q: string }) {
  const { nodes, loaded } = useBookmarks();
  useEffect(() => void loadBookmarks(), []);
  const all = useMemo(() => flatten(nodes), [nodes]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = words.length ? all.filter((b) => words.every((w) => `${b.node.title}\n${b.node.url}`.toLowerCase().includes(w))) : all;
  if (!loaded) return <Loading />;
  if (!all.length)
    return (
      <Empty icon={<Bookmark size={22} />} title="No bookmarks yet">
        Bookmarks you add in your Browser show here, with the ones you brought in from your other browsers. They stay in the Browser: agents never see them.
      </Empty>
    );
  if (!list.length) return <p className="py-8 text-center text-[13px] text-fg-3">{tr(`No bookmark matches “${q}”.`)}</p>;
  return (
    <div>
      <Private>Only you see your bookmarks. They are not copied into the Library.</Private>
      {list.map(({ node, root, folders }) => (
        <Row
          key={node.id}
          icon={<SiteIcon url={node.url!} size={16} />}
          title={node.title || shown(node.url!)}
          tip={node.url}
          line={
            <>
              <span translate="no">{hostOfTab(node.url!) || shown(node.url!)}</span>
              {' · '}
              {root === 'bar' ? tr('Bookmarks bar') : tr('Other bookmarks')}
              {folders.length > 0 && <span translate="no">{` › ${folders.join(' › ')}`}</span>}
            </>
          }
          onOpen={() => openInBrowser(node.url!)}
          actions={
            <>
              <IconButton label="Open" size="sm" onClick={() => openInBrowser(node.url!)}>
                <ExternalLink size={14} />
              </IconButton>
              <IconButton label="Delete" size="sm" onClick={() => void removeBookmark(node.id)}>
                <X size={15} />
              </IconButton>
            </>
          }
        />
      ))}
    </div>
  );
}

// ---- history and downloads, by day ---------------------------------------------------------------------------------

/** A list by day that is read a page at a time, newest first, older ones by "Show older" (`before` the last one's time); the words filter it on the server. */
function useDays<T extends { id: number; at: number }>(q: string, load: (q: string, before?: number) => Promise<T[]>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(
      () => {
        loader.current(q, undefined).then(
          (r) => {
            if (!live) return;
            setItems(r);
            setMore(r.length >= PAGE);
          },
          (e) => {
            if (!live) return;
            setItems([]);
            toastError(e);
          },
        );
      },
      first.current ? 0 : 200,
    );
    first.current = false;
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q]);
  const older = async () => {
    const last = items?.[items.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      const r = await loader.current(q, last.at);
      setItems((e) => [...(e ?? []), ...r.filter((x) => !e?.some((y) => y.id === x.id))]);
      setMore(r.length >= PAGE);
    } catch {
      setMore(false);
    } finally {
      setBusy(false);
    }
  };
  const drop = (id: number) => setItems((e) => e?.filter((x) => x.id !== id) ?? null);
  const days = useMemo(() => {
    const now = new Date();
    const out: { day: string; items: T[] }[] = [];
    for (const e of items ?? []) {
      const day = dayOf(e.at, now);
      const g = out[out.length - 1];
      if (g?.day === day) g.items.push(e);
      else out.push({ day, items: [e] });
    }
    return out;
  }, [items]);
  return { items, days, more, busy, older, drop };
}

const Older = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <div className="flex justify-center pt-4 pb-2">
    <Button size="sm" variant="secondary" disabled={busy} onClick={onClick}>
      {busy ? <Throbber size={14} /> : 'Show older'}
    </Button>
  </div>
);

function History({ q }: { q: string }) {
  const { items, days, more, busy, older, drop } = useDays<HistoryEntry>(q, (words, before) => loadHistory(words, before, PAGE));
  if (!items) return <Loading />;
  if (!items.length)
    return q ? (
      <p className="py-8 text-center text-[13px] text-fg-3">{tr(`Nothing in your history matches “${q}”.`)}</p>
    ) : (
      <Empty icon={<HistoryIcon size={22} />} title="Nothing in your history yet">
        The pages you visit in your Browser are listed here, on this computer. Agents never see them.
      </Empty>
    );
  return (
    <div>
      <Private>Only you see your history. It is not copied into the Library.</Private>
      {days.map((g) => (
        <div key={g.day}>
          <Day label={g.day} />
          {g.items.map((e) => (
            <Row
              key={e.id}
              icon={<SiteIcon url={e.url} size={16} />}
              title={e.title || shown(e.url)}
              tip={e.url}
              line={
                <>
                  <span translate="no">{hostOfTab(e.url) || shown(e.url)}</span>
                  {` · ${clock.format(e.at)}`}
                </>
              }
              onOpen={() => openInBrowser(e.url)}
              actions={
                <>
                  <IconButton label="Open" size="sm" onClick={() => openInBrowser(e.url)}>
                    <ExternalLink size={14} />
                  </IconButton>
                  <IconButton label="Remove from history" size="sm" onClick={() => void deleteHistory(e.id).then((ok) => ok && drop(e.id))}>
                    <X size={15} />
                  </IconButton>
                </>
              }
            />
          ))}
        </div>
      ))}
      {more && <Older busy={busy} onClick={() => void older()} />}
    </div>
  );
}

const loadDownloads = (q: string, before?: number) =>
  api<{ downloads: DownloadEntry[] }>(`/api/browser/browsing/downloads?q=${enc(q)}&limit=${PAGE}${before ? `&before=${before}` : ''}`).then((r) => r.downloads);

function Downloads({ q }: { q: string }) {
  const { items, days, more, busy, older, drop } = useDays<DownloadEntry>(q, loadDownloads);
  const remove = (id: number) => del(`/api/browser/browsing/downloads/${enc(String(id))}`).then(() => drop(id), toastError);
  if (!items) return <Loading />;
  if (!items.length)
    return q ? (
      <p className="py-8 text-center text-[13px] text-fg-3">{tr(`No download matches “${q}”.`)}</p>
    ) : (
      <Empty icon={<FileDown size={22} />} title="Nothing downloaded yet">
        Files you download in your Browser are listed here, with where they were saved. The files stay where they are; agents never see this list.
      </Empty>
    );
  return (
    <div>
      <Private>Only you see your downloads. They are not copied into the Library.</Private>
      {days.map((g) => (
        <div key={g.day}>
          <Day label={g.day} />
          {g.items.map((d) => (
            <Row
              key={d.id}
              failed={d.failed}
              icon={d.url && hostOfTab(d.url) ? <SiteIcon url={d.url} size={16} /> : <FileDown size={16} className="text-fg-3" />}
              title={d.name}
              tip={d.path || d.url || undefined}
              line={
                <>
                  {d.failed || !d.path ? (
                    tr('Failed')
                  ) : (
                    <>
                      {tr('Saved in')} <span translate="no">{folderOf(d.path)}</span>
                    </>
                  )}
                  {` · ${clock.format(d.at)}`}
                </>
              }
              onOpen={d.path && !d.failed ? () => showDownload(d.path) : undefined}
              actions={
                <>
                  {d.path && !d.failed && (
                    <IconButton label={revealLabel()} size="sm" onClick={() => showDownload(d.path)}>
                      <FolderOpen size={14} />
                    </IconButton>
                  )}
                  {d.url && (
                    <IconButton label="Open the address it came from" size="sm" onClick={() => openInBrowser(d.url)}>
                      <ExternalLink size={14} />
                    </IconButton>
                  )}
                  <IconButton label="Remove from the list" size="sm" onClick={() => void remove(d.id)}>
                    <X size={15} />
                  </IconButton>
                </>
              }
            />
          ))}
        </div>
      ))}
      {more && <Older busy={busy} onClick={() => void older()} />}
    </div>
  );
}

/** What one of the browser's chips shows; `q`: the words in the toolbar's search box. */
export function BrowserList({ kind, q }: { kind: BrowserKind; q: string }) {
  return kind === 'bookmarks' ? <Bookmarks q={q} /> : kind === 'history' ? <History q={q} /> : <Downloads q={q} />;
}

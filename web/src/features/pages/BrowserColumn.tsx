// A few of what your own browser keeps, in a column beside the Library's cards (Everything, with the All chip; the
// desktop app only): bookmarks, history, Read later, downloads and highlights, each in a card of its own with how many
// there are and See all, which opens that list. A list with nothing in it has no card. It is yours alone: nothing here is
// copied into the Library, and agents are refused the route that fills it. With words typed in the Library's search box,
// the cards show what matches them.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Bookmark, Clock, FileDown, Highlighter, History as HistoryIcon } from 'lucide-react';
import type { BrowsingOverview, DownloadEntry, HistoryEntry, LaterItem } from '@shared/browser';
import type { PageHighlight } from '@shared/highlights';
import { api, enc } from '../../lib/api';
import { sepOf } from '../../lib/format';
import { go } from '../../lib/nav';
import { tr, trIn } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { cx } from '../../components/ui';
import { showDownload, showHighlight } from '../browser/browsing';
import { hostOfTab, SiteIcon } from '../browser/TabStrip';
import { openInBrowser, type BrowserKind } from './BrowserLists';

// ---- the overview -------------------------------------------------------------------------------------------------

/** The last answer, so coming back to the Library shows the column at once (and then asks again). */
let last: { q: string; o: BrowsingOverview } | null = null;

/**
 * A few of each list your own browser keeps (for the words typed, what matches them), or null while it is off or has not
 * answered yet. The first answer comes at once, the next 200 ms after the words stop changing; the one before shows
 * meanwhile, and an error leaves it as it was.
 */
export function useBrowsingOverview(q: string, on: boolean): BrowsingOverview | null {
  const [got, setGot] = useState<{ q: string; o: BrowsingOverview } | null>(() => (last && last.q === q ? last : null));
  const first = useRef(true);
  useEffect(() => {
    if (!on) {
      first.current = true;
      return;
    }
    let live = true;
    const ask = () =>
      api<BrowsingOverview>(`/api/browser/browsing/overview?q=${enc(q)}`)
        .then((o) => {
          if (!live) return;
          last = { q, o };
          setGot(last);
        })
        .catch(() => {});
    // The first time ask at once; after that wait for the typing to stop.
    const wait = setTimeout(ask, first.current ? 0 : 200);
    first.current = false;
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [q, on]);
  if (!on) return null;
  return got?.o ?? null;
}

/** Whether any list has something to show. */
export const overviewHasAny = (o: BrowsingOverview | null): boolean => !!o && (o.bookmarks.count > 0 || o.later.count > 0 || o.history.count > 0 || o.downloads.count > 0 || o.highlights.count > 0);

// ---- times and addresses ------------------------------------------------------------------------------------------

const clock = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dayShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dayYear = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const count = new Intl.NumberFormat(LOCALE);

const startOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

/** A date without the weekday: the day and short month, and the year when it is not this one. */
const dateOf = (ts: number, now: Date) => {
  const d = new Date(ts);
  return (d.getFullYear() === now.getFullYear() ? dayShort : dayYear).format(d);
};

/** When something happened: the time today, Yesterday, or the date. */
function when(ts: number): string {
  const now = new Date();
  const start = startOfDay(now);
  if (ts >= start) return clock.format(ts);
  if (ts >= start - 86_400_000) return tr('Yesterday');
  return dateOf(ts, now);
}

/** The day something was added: Today, Yesterday, or the date. */
function day(ts: number): string {
  const now = new Date();
  const start = startOfDay(now);
  if (ts >= start) return tr('Today');
  if (ts >= start - 86_400_000) return tr('Yesterday');
  return dateOf(ts, now);
}

/** An address without its scheme. */
const bare = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** The site of an address, or the address itself without its scheme. */
const hostOf = (url: string) => hostOfTab(url) || bare(url);

/** The last name of the folder a path is in. */
const folderName = (path: string) => {
  const sep = sepOf(path);
  const parts = path.split(sep).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : sep;
};

// ---- the cards ----------------------------------------------------------------------------------------------------

/** A card: the list's icon, name and count, and See all at its end. */
function Card({ icon, name, total, onSeeAll, children }: { icon: ReactNode; name: string; total: number; onSeeAll: () => void; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel px-3.5 pt-3 pb-1.5">
      <header className="flex min-w-0 items-center gap-2 pb-1.5">
        <span className="shrink-0 text-fg-3">{icon}</span>
        <h3 className="truncate text-[13.5px] font-semibold text-fg">{name}</h3>
        <span className="tnum text-[12px] text-fg-3">{count.format(total)}</span>
        <span className="flex-1" />
        <button type="button" onClick={onSeeAll} className="flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-accent hover:underline">
          {tr('See all')}
          <ArrowRight size={12} />
        </button>
      </header>
      {children}
    </section>
  );
}

/** One row of a list: a site's icon (or another), a title and a muted line. */
function Row({ icon, title, line, tip, onOpen }: { icon: ReactNode; title: string; line: ReactNode; tip?: string; onOpen?: () => void }) {
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} title={tip} className={cx('flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors', onOpen && 'hover:bg-bg-2')}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-bg-1">{icon}</span>
      <span className="min-w-0 flex-1">
        <span translate="no" className="block truncate text-[13px] leading-[18px] text-fg">
          {title}
        </span>
        <span className="block truncate text-[11.5px] leading-4 text-fg-3">{line}</span>
      </span>
    </button>
  );
}

const Rows = ({ children }: { children: ReactNode }) => <div className="-mx-1.5 pb-1">{children}</div>;

function Bookmarks({ items }: { items: BrowsingOverview['bookmarks']['items'] }) {
  return (
    <div className="grid grid-cols-4 gap-x-1 gap-y-2 pt-0.5 pb-2">
      {items.map((b) => {
        const url = b.url ?? '';
        return (
          <button key={b.id} type="button" title={url} onClick={() => url && openInBrowser(url)} className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl px-0.5 py-1.5 transition-colors hover:bg-bg-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] border border-line bg-bg-1">
              <SiteIcon url={url} size={18} />
            </span>
            <span translate="no" className="line-clamp-2 w-full text-center text-[11px] leading-[1.25] break-words text-fg-3 group-hover:text-fg">
              {b.title || bare(url)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const HistoryRows = ({ items }: { items: HistoryEntry[] }) => (
  <Rows>
    {items.map((h) => (
      <Row
        key={h.id}
        icon={<SiteIcon url={h.url} size={14} />}
        title={h.title || bare(h.url)}
        tip={h.url}
        line={
          <>
            <span translate="no">{hostOf(h.url)}</span> · {when(h.at)}
          </>
        }
        onOpen={() => openInBrowser(h.url)}
      />
    ))}
  </Rows>
);

const LaterRows = ({ items }: { items: LaterItem[] }) => (
  <Rows>
    {items.map((l) => (
      <Row
        key={l.id}
        icon={<SiteIcon url={l.url} size={14} />}
        title={l.title || bare(l.url)}
        tip={l.url}
        line={
          <>
            <span translate="no">{hostOf(l.url)}</span> · {tr('Added')} {day(l.addedAt)}
          </>
        }
        onOpen={() => openInBrowser(l.url)}
      />
    ))}
  </Rows>
);

const DownloadRows = ({ items }: { items: DownloadEntry[] }) => (
  <Rows>
    {items.map((d) => {
      const failed = d.failed || !d.path;
      const line = failed ? (
        <>
          <span className="text-err">{tr('Failed')}</span> · {when(d.at)}
        </>
      ) : (
        <>
          {tr('Saved in')} <span translate="no">{folderName(d.path)}</span> · {when(d.at)}
        </>
      );
      return (
        <Row
          key={d.id}
          icon={hostOfTab(d.url) ? <SiteIcon url={d.url} size={14} /> : <FileDown size={14} className="text-fg-3" />}
          title={d.name}
          tip={d.path || d.url}
          line={line}
          onOpen={d.path && !d.failed ? () => showDownload(d.path) : d.url ? () => openInBrowser(d.url) : undefined}
        />
      );
    })}
  </Rows>
);

const HighlightRows = ({ items }: { items: PageHighlight[] }) => (
  <Rows>
    {items.map((h) => (
      <button key={h.id} type="button" onClick={() => void showHighlight(h.id).then((ok) => ok && go('/browser'))} className="block w-full rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-bg-2">
        <span translate="no" className="line-clamp-2 border-l-[3px] border-[#ffd60a]/70 pl-2.5 text-[13px] leading-[1.45] text-fg">
          <span className="rounded-[3px] bg-[#ffd60a]/15 px-0.5 box-decoration-clone">{h.text}</span>
        </span>
        <span translate="no" className="mt-1 block truncate pl-[13px] text-[11.5px] text-fg-3">
          {h.title ? `${h.title} · ${hostOf(h.url)}` : hostOf(h.url)}
        </span>
      </button>
    ))}
  </Rows>
);

/** The column: a card for each list that has something, in the order people reach for them. Their names are the Browser's words (trIn). */
export function BrowserColumn({ overview, onSeeAll }: { overview: BrowsingOverview; onSeeAll: (k: BrowserKind) => void }) {
  const o = overview;
  return (
    // No heading over it: the cards say what they are (its name is for screen readers).
    <aside aria-label="From your browser" className="min-w-0">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] items-start gap-3 @min-[860px]:grid-cols-1">
        {o.bookmarks.count > 0 && (
          <Card icon={<Bookmark size={14} />} name={trIn('browser', 'Bookmarks')} total={o.bookmarks.count} onSeeAll={() => onSeeAll('bookmarks')}>
            <Bookmarks items={o.bookmarks.items.slice(0, 8)} />
          </Card>
        )}
        {o.history.count > 0 && (
          <Card icon={<HistoryIcon size={14} />} name={trIn('browser', 'History')} total={o.history.count} onSeeAll={() => onSeeAll('history')}>
            <HistoryRows items={o.history.items.slice(0, 4)} />
          </Card>
        )}
        {o.later.count > 0 && (
          <Card icon={<Clock size={14} />} name={trIn('browser', 'Read later')} total={o.later.count} onSeeAll={() => onSeeAll('later')}>
            <LaterRows items={o.later.items.slice(0, 3)} />
          </Card>
        )}
        {o.downloads.count > 0 && (
          <Card icon={<FileDown size={14} />} name={trIn('browser', 'Downloads')} total={o.downloads.count} onSeeAll={() => onSeeAll('downloads')}>
            <DownloadRows items={o.downloads.items.slice(0, 3)} />
          </Card>
        )}
        {o.highlights.count > 0 && (
          <Card icon={<Highlighter size={14} />} name={trIn('browser', 'Highlights')} total={o.highlights.count} onSeeAll={() => onSeeAll('highlights')}>
            <HighlightRows items={o.highlights.items.slice(0, 2)} />
          </Card>
        )}
      </div>
    </aside>
  );
}

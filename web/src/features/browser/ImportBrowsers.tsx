// Bringing in the other browsers' bookmarks and history: the rows (a browser profile each, with what it holds), the
// choice of what to bring, and what has come in. The welcome tour's page and the Browser page's Import panel share it, so
// what the tour brought in shows as brought in there too.
import { useEffect } from 'react';
import { Check, Globe, Import, Settings } from 'lucide-react';
import { create } from 'zustand';
import type { BookmarkNode, BookmarkSource, HistoryImport, HistorySource } from '@shared/browser';
import { LOCALE } from '../../i18n/locale';
import { api, post } from '../../lib/api';
import { canOpenFullDiskAccess, openFullDiskAccess, whenBack } from '../../lib/notify';
import { Button, cx, Throbber } from '../../components/ui';
import { useBookmarks } from './browsing';
import { Note, Panel } from './Panel';

/** A browser profile on this computer, with what it holds. */
export interface FoundBrowser {
  id: string;
  browser: string;
  profile?: string;
  bookmarks: number;
  history: number;
  /** Why a kind cannot be read now, when it cannot. */
  errors: { bookmarks?: string; history?: string };
  /** macOS keeps Hydor from reading it until Hydor has Full Disk Access. */
  needs?: 'full-disk-access';
}

export type Kind = 'bookmarks' | 'history';

/** Bringing one browser's things in: under way, which kinds came in, and what went wrong with the others (they can be tried again). */
export interface BrowserImport {
  busy: boolean;
  brought: { bookmarks?: true; history?: true };
  error?: string;
}

interface BrowsersState {
  rows: FoundBrowser[];
  loaded: boolean;
  /** When the rows were read. */
  at: number;
  imports: Record<string, BrowserImport>;
  /** Which kinds to bring. */
  bring: Record<Kind, boolean>;
  /** The rows that were looked at again after Full Disk Access was asked for. */
  retried: Record<string, true>;
}

export const useBrowsers = create<BrowsersState>(() => ({ rows: [], loaded: false, at: 0, imports: {}, bring: { bookmarks: true, history: true }, retried: {} }));

/** The bookmark sources and the history sources, one row for each browser profile: those with bookmarks, history or an error. */
function mergeBrowsers(bookmarks: BookmarkSource[], history: HistorySource[]): FoundBrowser[] {
  const rows = new Map<string, FoundBrowser>();
  for (const s of bookmarks) rows.set(s.id, { id: s.id, browser: s.browser, profile: s.profile, bookmarks: s.count, history: 0, errors: { bookmarks: s.error }, needs: s.needs });
  for (const s of history) {
    const r = rows.get(s.id);
    if (!r) rows.set(s.id, { id: s.id, browser: s.browser, profile: s.profile, bookmarks: 0, history: s.count, errors: { history: s.error }, needs: s.needs });
    else {
      r.profile ??= s.profile;
      r.history = s.count;
      r.errors.history = s.error;
      r.needs ??= s.needs;
    }
  }
  return [...rows.values()].filter((r) => r.bookmarks || r.history || r.errors.bookmarks || r.errors.history);
}

/** Looks up the browsers here (a failed list counts as empty) and keeps them; gives the rows. */
export async function loadBrowsers(): Promise<FoundBrowser[]> {
  const [b, h] = await Promise.allSettled([api<{ sources: BookmarkSource[] }>('/api/browser/bookmarks/sources'), api<{ sources: HistorySource[] }>('/api/browser/browsing/history/sources')]);
  const rows = mergeBrowsers(b.status === 'fulfilled' ? b.value.sources : [], h.status === 'fulfilled' ? h.value.sources : []);
  useBrowsers.setState({ rows, loaded: true, at: Date.now() });
  return rows;
}

/** What a row holds, as words: "12 bookmarks · 3,400 pages of history". */
function holds(b: FoundBrowser): string {
  const n = (x: number) => x.toLocaleString(LOCALE);
  return [b.bookmarks > 0 && `${n(b.bookmarks)} bookmark${b.bookmarks === 1 ? '' : 's'}`, b.history > 0 && `${n(b.history)} page${b.history === 1 ? '' : 's'} of history`].filter(Boolean).join(' · ');
}

/** The kinds to bring from a row: those toggled on that it has (an error counts: trying again may work now) and not brought yet. */
const toBring = (b: FoundBrowser, on: Record<Kind, boolean>, r?: BrowserImport): Kind[] => (['bookmarks', 'history'] as const).filter((k) => on[k] && (b[k] > 0 || b.errors[k]) && !r?.brought[k]);

/** What to tell when a Mac still keeps Hydor out after Full Disk Access was asked for. */
export const REOPEN_NOTE = 'Allowed it? macOS may want Hydor reopened first: quit Hydor and open it again.';

// Only the latest wait for the window to come back (a second press replaces the first).
let stopWaiting: (() => void) | undefined;

/** Opens where a Mac gives Hydor Full Disk Access; `onBack` runs once the window is in front again. None without the desktop app's help. */
export function OpenSettings({ onBack, onPress, className }: { onBack: () => void; onPress?: () => void; className?: string }) {
  if (!canOpenFullDiskAccess) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      className={className}
      icon={<Settings size={13} />}
      onClick={() => {
        onPress?.();
        stopWaiting?.();
        const stop = whenBack(() => {
          stop();
          onBack();
        });
        stopWaiting = stop;
        void openFullDiskAccess();
      }}
    >
      Open System Settings
    </Button>
  );
}

const setImport = (id: string, f: (r: BrowserImport) => BrowserImport) => useBrowsers.setState((s) => ({ imports: { ...s.imports, [id]: f(s.imports[id] ?? { busy: false, brought: {} }) } }));

// Each kind left to bring, one after the other: one that came in is kept (a second try does not bring it twice), a failure
// is shown on the row (the first one: Safari's permission, say, is the same for both) and the next kind goes on.
async function run(b: FoundBrowser) {
  const s = useBrowsers.getState();
  const kinds = toBring(b, s.bring, s.imports[b.id]);
  const errors: string[] = [];
  setImport(b.id, (r) => ({ ...r, busy: true, error: undefined }));
  for (const k of kinds) {
    try {
      if (k === 'bookmarks') {
        const r = await post<{ added: number; folder?: string; nodes: BookmarkNode[] }>('/api/browser/bookmarks/import', { source: b.id });
        useBookmarks.setState({ nodes: r.nodes, loaded: true });
      } else await post<HistoryImport>('/api/browser/browsing/history/import', { source: b.id });
      setImport(b.id, (r) => ({ ...r, brought: { ...r.brought, [k]: true } }));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  setImport(b.id, (r) => ({ ...r, busy: false, error: errors[0] }));
}

/** Which kinds to bring, and a row for each browser to bring in. `onSettings`: Open System Settings was pressed on a row. */
export function ImportBrowsers({ onSettings, className }: { onSettings?: () => void; className?: string }) {
  const rows = useBrowsers((s) => s.rows);
  const imports = useBrowsers((s) => s.imports);
  const bring = useBrowsers((s) => s.bring);
  const retried = useBrowsers((s) => s.retried);
  const toggle = (k: Kind, label: string) => (
    <button
      type="button"
      aria-pressed={bring[k]}
      onClick={() => useBrowsers.setState((s) => ({ bring: { ...s.bring, [k]: !s.bring[k] } }))}
      className={cx(
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] ring-inset transition-colors',
        bring[k] ? 'bg-bg-1 text-fg ring-[1.5px] ring-[var(--water-2)]' : 'bg-bg-1 text-fg-3 ring-1 ring-line hover:ring-line-2',
      )}
    >
      <Check size={13} strokeWidth={3} className={bring[k] ? 'text-[var(--water-2)]' : 'invisible'} /> {label}
    </button>
  );
  return (
    <div className={cx('grid gap-3', className)}>
      <div className="flex flex-wrap gap-2">
        {toggle('bookmarks', 'Bookmarks')}
        {toggle('history', 'History')}
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel/70 ring-1 ring-line">
        {rows.map((b) => {
          const r = imports[b.id];
          const left = toBring(b, bring, r).length;
          const brought = !!r && (r.brought.bookmarks || r.brought.history);
          const text = holds(b);
          // The import's own error, else why the first kind still wanted could not be read.
          const error = r?.error || (['bookmarks', 'history'] as const).map((k) => (bring[k] && !r?.brought[k] ? b.errors[k] : undefined)).find(Boolean);
          const access = b.needs === 'full-disk-access' && canOpenFullDiskAccess;
          return (
            <div key={b.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="tour-tile-icon">
                <Globe size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-fg" translate="no">
                  {b.profile ? `${b.browser} · ${b.profile}` : b.browser}
                </div>
                {text && <div className="text-[12px] text-fg-3">{text}</div>}
                {error && <div className="text-[12px] text-warn">{error}</div>}
                {access && retried[b.id] && <div className="text-[12px] text-fg-3">{REOPEN_NOTE}</div>}
              </div>
              {access ? (
                <OpenSettings
                  className="rounded-full"
                  onPress={onSettings}
                  onBack={() => void loadBrowsers().then(() => useBrowsers.setState((s) => ({ retried: { ...s.retried, [b.id]: true } })))}
                />
              ) : left === 0 && brought ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
                  <Check size={14} className="text-ok" /> Brought in
                </span>
              ) : (
                <Button size="sm" variant="secondary" className="rounded-full" icon={<Import size={13} />} disabled={left === 0 || !!r?.busy} onClick={() => void run(b)}>
                  {r?.busy ? 'Importing…' : 'Import'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The Browser page's panel for it. */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const loaded = useBrowsers((s) => s.loaded);
  const rows = useBrowsers((s) => s.rows);
  // Read again when the rows are more than a minute old (the offer above it read them a moment ago).
  useEffect(() => {
    if (Date.now() - useBrowsers.getState().at > 60_000) void loadBrowsers();
  }, []);
  return (
    <Panel title="Import bookmarks and history" onClose={onClose}>
      <Note>Bookmarks come into a new folder at the end of the bookmarks bar, and history joins yours. It all stays on this computer.</Note>
      {!loaded ? (
        <div className="flex justify-center py-6">
          <Throbber size={20} />
        </div>
      ) : rows.length ? (
        <ImportBrowsers className="px-4 py-3" />
      ) : (
        <Note>No other browser was found on this computer.</Note>
      )}
    </Panel>
  );
}

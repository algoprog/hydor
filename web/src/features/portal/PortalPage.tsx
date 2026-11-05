// A project shared with someone, at their own link (/p/<token>, or /m/<machine>/p/<token> for another machine's): the
// project as a portal, in the app's look and the language they pick, with none of the owner's other things. At the
// top, the project's mark, name and the owner's words about it, and who they are (their menu: what they may do,
// the language and the theme); under them, tabs: Documents, Sessions, and when the project has them, Runs and Reading
// list. A document opens to read (with its comments, where they can add theirs) or, with Edit documents, in the
// Library's own editor (PortalItem.tsx); a session opens as a read-only link shows it (PortalSession.tsx). What is
// open is in the address (?doc=, ?session=, ?tab=), so Back works. A link that was stopped or ran out shows a plain page.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppWindow, BookOpen, ExternalLink, FileText, MessagesSquare, Monitor, Moon, NotebookText, Presentation, Sheet, Sigma, Sun } from 'lucide-react';
import { LANGS } from '@shared/i18n';
import { initials, SHARE_ROLES, type PortalItem, type PortalPaper, type PortalRun, type PortalSession as SessionRow, type PortalView } from '@shared/share';
import { spaceColor } from '@shared/spaces';
import { AgentIcon } from '../../components/AgentIcon';
import { Logo } from '../../components/Logo';
import { Toasts } from '../../components/Toasts';
import { cx, Empty, MenuItem, MenuLabel, MenuSep, Popover, SheetsOnPhone, Tabs, Throbber, useMediaQuery } from '../../components/ui';
import { currentLang, KEY as LANG_KEY, LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { ago, duration, timeAgo } from '../../lib/format';
import { portalToken } from '../../lib/machine';
import { useUI } from '../../lib/store';
import { applyTheme } from '../../lib/theme';
import { setCommentMe } from '../pages/common/Comments';
import { SpaceMark } from '../spaces/parts';
import { BASE, LinkError, papi } from './api';
import { PortalDocument } from './PortalItem';
import { PortalSession } from './PortalSession';

export type PortalTab = 'documents' | 'sessions' | 'runs' | 'reading';

/** What is open: a tab, a document or a session; kept in the address. */
export interface Where {
  tab: PortalTab;
  doc?: string;
  session?: string;
}

function whereNow(): Where {
  const q = new URLSearchParams(location.search);
  const tab = q.get('tab');
  return { tab: tab === 'sessions' || tab === 'runs' || tab === 'reading' ? tab : 'documents', doc: q.get('doc') ?? undefined, session: q.get('session') ?? undefined };
}

/** Opens a place of the portal; Back comes back. */
export function goTo(w: Partial<Where>, replace = false) {
  const q = new URLSearchParams();
  if (w.tab && w.tab !== 'documents') q.set('tab', w.tab);
  if (w.doc) q.set('doc', w.doc);
  if (w.session) q.set('session', w.session);
  const s = q.toString();
  history[replace ? 'replaceState' : 'pushState'](null, '', `${location.pathname}${s ? `?${s}` : ''}`);
  window.dispatchEvent(new Event('portal:where'));
}

function useWhere(): Where {
  const [w, setW] = useState(whereNow);
  useEffect(() => {
    const f = () => setW(whereNow());
    window.addEventListener('popstate', f);
    window.addEventListener('portal:where', f);
    return () => {
      window.removeEventListener('popstate', f);
      window.removeEventListener('portal:where', f);
    };
  }, []);
  return w;
}

const KIND: Record<string, { label: string; icon: ReactNode }> = {
  page: { label: 'Page', icon: <AppWindow size={12} /> },
  slides: { label: 'Slides', icon: <Presentation size={12} /> },
  doc: { label: 'Document', icon: <FileText size={12} /> },
  sheet: { label: 'Spreadsheet', icon: <Sheet size={12} /> },
  tex: { label: 'LaTeX', icon: <Sigma size={12} /> },
  notebook: { label: 'Notebook', icon: <NotebookText size={12} /> },
};
export const kindOf = (it: Pick<PortalItem, 'kind'>) => KIND[it.kind ?? 'page'] ?? KIND.page;

const TONES = ['from-accent/25 to-accent/5 text-accent', 'from-info/25 to-info/5 text-info', 'from-ok/25 to-ok/5 text-ok', 'from-warn/25 to-warn/5 text-warn', 'from-claude/25 to-claude/5 text-claude', 'from-codex/25 to-codex/5 text-codex'];
const toneOf = (id: string) => TONES[parseInt(id.slice(0, 6), 16) % TONES.length];

/** When a date is, in a few words: "12 Dec". */
const day = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(new Date(t).getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });

export default function PortalPage() {
  const [v, setV] = useState<PortalView | null>(null);
  const [err, setErr] = useState<LinkError | null>(null);
  const where = useWhere();
  const load = useCallback(async (visit = false) => {
    try {
      const next = await papi<PortalView>(visit ? '?visit=1' : '');
      setCommentMe(next.me.id);
      setV(next);
      setErr(null);
    } catch (e) {
      setErr(e instanceof LinkError ? e : new LinkError((e as Error).message, 0));
    }
  }, []);
  useEffect(() => {
    applyTheme();
    void load(true);
  }, [load]);
  // Kept up to date: every minute while in view, and at once when it comes back into view.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    const back = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', back);
    };
  }, [load]);
  useEffect(() => {
    if (v) document.title = `${v.project.name} · Hydor`;
  }, [v?.project.name]);

  // An address that is no link at all (cut short when copied, say) opens nothing either.
  const ended = !portalToken ? new LinkError('This link does not open anything.', 404) : err && (!v || err.status === 404 || err.status === 410 || err.status === 429) ? err : null;
  return (
    <>
      {ended ? (
        <Ended err={ended} />
      ) : !v ? (
        <div className="flex h-full items-center justify-center bg-bg text-fg-3">
          <Throbber size={28} />
        </div>
      ) : where.doc ? (
        <PortalDocument v={v} id={where.doc} onBack={() => goTo({ tab: 'documents' })} onChanged={() => void load()} />
      ) : where.session ? (
        <PortalSession v={v} sessionKey={where.session} onBack={() => goTo({ tab: 'sessions' })} />
      ) : (
        <Shell v={v} tab={where.tab} />
      )}
      <Toasts />
    </>
  );
}

/** A link that no longer opens anything (or an address paused for wrong ones): what happened, plainly. */
function Ended({ err }: { err: LinkError }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6 pb-[10vh] text-center">
      <Logo size={40} />
      <div className="mt-2 max-w-[420px] text-[16px] font-semibold tracking-tight">{err.message}</div>
      <div className="max-w-[420px] text-[13.5px] leading-relaxed text-fg-3">
        {err.status === 429 ? 'Try again later.' : err.status === 404 || err.status === 410 ? 'Ask the person who shared it with you for a new link.' : 'Try again in a moment.'}
      </div>
    </div>
  );
}

/** The project's top and its tabs, with the tab's content under them. */
function Shell({ v, tab }: { v: PortalView; tab: PortalTab }) {
  const wide = useMediaQuery('(min-width: 640px)');
  const c = spaceColor(v.project);
  const tabs: { value: PortalTab; label: string; count?: number }[] = [
    { value: 'documents', label: 'Documents', count: wide ? v.items.length : undefined },
    { value: 'sessions', label: 'Sessions', count: wide ? v.sessions.length : undefined },
    ...(v.runs.length ? [{ value: 'runs' as const, label: 'Runs', count: wide ? v.runs.length : undefined }] : []),
    ...(v.reading.length ? [{ value: 'reading' as const, label: 'Reading list', count: wide ? v.reading.length : undefined }] : []),
  ];
  const shown = tabs.some((t) => t.value === tab) ? tab : 'documents';
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="relative shrink-0 border-b border-line pt-[var(--safe-top)]">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${c} 15%, transparent), color-mix(in oklab, ${c} 3%, transparent))` }} />
        <div className="relative mx-auto flex max-w-[1120px] items-center gap-3 px-4 pt-3 sm:px-6 sm:pt-5">
          <SpaceMark s={v.project} size={wide ? 46 : 34} className="rounded-[12px] max-sm:rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <h1 translate="no" className="truncate text-[17px] leading-tight font-semibold tracking-tight sm:text-[21px]">
              {v.project.name}
            </h1>
            <div className="mt-0.5 truncate text-[12.5px] text-fg-3 sm:text-[13.5px]">
              {v.project.description ? <span translate="no">{v.project.description}</span> : tr(`Shared with you by ${v.owner}`)}
            </div>
          </div>
          <Me v={v} />
        </div>
        <div className="relative mx-auto max-w-[1120px] px-1.5 pt-1.5 sm:px-4 sm:pt-3">
          <Tabs value={shown} dense={!wide} onChange={(t) => goTo({ tab: t }, true)} options={tabs} />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1120px] px-4 py-5 pb-[max(20px,var(--safe-bottom))] sm:px-6">
          {shown === 'documents' ? <Documents items={v.items} /> : shown === 'sessions' ? <Sessions list={v.sessions} /> : shown === 'runs' ? <Runs list={v.runs} /> : <Reading list={v.reading} />}
        </div>
      </main>
    </div>
  );
}

/** Who they are, in a mark with their initials: their menu has what they may do, who shared it, the language and the theme. */
function Me({ v }: { v: PortalView }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const wide = useMediaQuery('(min-width: 640px)');
  const theme = useUI((s) => s.theme);
  const lang = currentLang();
  const setTheme = (t: 'light' | 'dark' | 'system') => {
    useUI.getState().set({ theme: t });
    applyTheme();
  };
  const setLang = (l: string) => {
    // On this device only, as the app's own pages keep it (a link tells the owner's agents nothing).
    localStorage.setItem(LANG_KEY, l);
    location.reload();
  };
  // On a phone, a sheet from the bottom, under their name (the top shows only their initials there).
  return (
    <SheetsOnPhone.Provider value>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex shrink-0 items-center gap-2 rounded-full py-1 pr-1 pl-1 transition-colors hover:bg-bg-2/70 sm:pr-3', open && 'bg-bg-2/70')}
        aria-label={tr('You, and this page’s settings')}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-info/15 text-[12px] font-semibold text-info" translate="no">
          {initials(v.me.name)}
        </span>
        {wide && (
          <span className="min-w-0 text-left">
            <span translate="no" className="block max-w-[160px] truncate text-[13px] leading-4 font-medium">
              {v.me.name}
            </span>
            <span className="block text-[11.5px] leading-4 text-fg-3">{SHARE_ROLES[v.me.role]}</span>
          </span>
        )}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={270} title={<span translate="no">{v.me.name}</span>}>
        <div className="px-2.5 pt-1.5 pb-2 text-[12.5px] leading-relaxed text-fg-3">
          <div className="font-medium text-fg-2">
            {SHARE_ROLES[v.me.role]}
            {v.me.expiresAt ? ` · ${tr(`until ${day(v.me.expiresAt)}`)}` : ''}
          </div>
          <div>{tr(`Shared with you by ${v.owner}, from Hydor`)}</div>
        </div>
        <MenuSep />
        <MenuLabel>Language</MenuLabel>
        {LANGS.map((l) => (
          <MenuItem key={l.id} checked={lang === l.id} onClick={() => lang !== l.id && setLang(l.id)}>
            <span translate="no">{l.name}</span>
          </MenuItem>
        ))}
        <MenuSep />
        <MenuLabel>Theme</MenuLabel>
        <MenuItem icon={<Sun size={14} />} checked={theme === 'light'} onClick={() => setTheme('light')}>
          Light
        </MenuItem>
        <MenuItem icon={<Moon size={14} />} checked={theme === 'dark'} onClick={() => setTheme('dark')}>
          Dark
        </MenuItem>
        <MenuItem icon={<Monitor size={14} />} checked={theme === 'system'} onClick={() => setTheme('system')}>
          Like this device
        </MenuItem>
      </Popover>
    </SheetsOnPhone.Provider>
  );
}

// ---- the tabs ---------------------------------------------------------------------------------------------------

/** A document's card: its picture (or its first letter) with its kind, its name and when it last changed. */
function DocCard({ it }: { it: PortalItem }) {
  const [failed, setFailed] = useState(false);
  const k = kindOf(it);
  return (
    <button type="button" onClick={() => goTo({ doc: it.id })} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition-colors hover:border-line-2">
      <span className={cx('relative block aspect-[16/10] w-full overflow-hidden border-b border-line bg-gradient-to-br', toneOf(it.id))}>
        {it.thumb && !failed ? (
          <img src={`${BASE}/pages/${it.id}/thumb?v=${encodeURIComponent(it.thumb)}`} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <span translate="no" className="absolute inset-0 flex items-center justify-center text-[34px] font-semibold opacity-80">
            {[...it.title.trim()][0]?.toUpperCase() ?? 'D'}
          </span>
        )}
        {it.kind && (
          <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {k.icon}
            {k.label}
          </span>
        )}
      </span>
      <span className="block min-w-0 px-3 py-2">
        <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
          {it.title}
        </span>
        <span className="block truncate text-[12px] leading-4 text-fg-3">{tr(`Changed ${ago(it.updatedAt)}`)}</span>
      </span>
    </button>
  );
}

function Documents({ items }: { items: PortalItem[] }) {
  if (!items.length)
    return (
      <Empty icon={<FileText size={22} />} title="No documents yet">
        The project’s pages, documents, slides, spreadsheets and LaTeX documents show here.
      </Empty>
    );
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3 max-sm:grid-cols-2 max-sm:gap-2.5">
      {items.map((it) => (
        <DocCard key={it.id} it={it} />
      ))}
    </div>
  );
}

const working = (status: string) => ['working', 'waiting', 'starting'].includes(status);

function Sessions({ list }: { list: SessionRow[] }) {
  if (!list.length)
    return (
      <Empty icon={<MessagesSquare size={22} />} title="No sessions yet">
        The conversations with agents in this project show here, to read.
      </Empty>
    );
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {list.map((s) => (
        <button key={s.key} type="button" onClick={() => goTo({ session: s.key })} className="flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-1">
          <AgentIcon agent={s.agent} name={s.acpName} size={15} spinning={working(s.status)} />
          <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px]">
            {s.title}
          </span>
          {working(s.status) ? <span className="shrink-0 text-[12px] text-busy">Working now</span> : s.updatedAt ? <span className="tnum shrink-0 text-[12px] text-fg-3">{timeAgo(s.updatedAt)}</span> : null}
        </button>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = { running: 'bg-busy', starting: 'bg-busy', done: 'bg-ok', failed: 'bg-err', lost: 'bg-err' };
const STATUS_WORDS: Record<string, string> = { queued: 'In line', waiting: 'Waiting', starting: 'Starting', running: 'Running', done: 'Done', failed: 'Failed', stopped: 'Stopped', lost: 'Lost' };

/** A number as people read it: a few significant digits. */
const num = (n: number) => (Math.abs(n) >= 1000 || Number.isInteger(n) ? n.toLocaleString(LOCALE, { maximumFractionDigits: 2 }) : n.toLocaleString(LOCALE, { maximumSignificantDigits: 4 }));

function Runs({ list }: { list: PortalRun[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {list.map((r) => {
        const metrics = Object.entries(r.best ?? r.metrics ?? {}).slice(0, 4);
        const params = Object.entries(r.params ?? {}).slice(0, 6);
        return (
          <div key={r.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
            <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', STATUS_TONE[r.status] ?? 'bg-fg-3/50')} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span translate="no" className="min-w-0 truncate text-[13.5px] font-medium">
                  {r.name || r.id}
                </span>
                {r.group && (
                  <span translate="no" className="min-w-0 truncate text-[12px] text-fg-3">
                    {r.group}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-fg-3">
                {STATUS_WORDS[r.status] ?? r.status}
                {r.startedAt ? ` · ${tr(`started ${ago(r.startedAt)}`)}` : ''}
                {r.startedAt && r.endedAt ? ` · ${duration(r.endedAt - r.startedAt)}` : ''}
              </div>
              {metrics.length > 0 && (
                <div translate="no" className="mt-1.5 flex flex-wrap gap-1.5">
                  {metrics.map(([k, n]) => (
                    <span key={k} className="tnum rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2">
                      {k} {num(n)}
                    </span>
                  ))}
                </div>
              )}
              {params.length > 0 && (
                <div translate="no" className="mt-1 truncate font-mono text-[11.5px] text-fg-3">
                  {params.map(([k, x]) => `${k}=${String(x)}`).join('  ')}
                  {r.seed !== undefined ? `  seed=${r.seed}` : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const READ_TONE: Record<string, string> = { read: 'bg-ok/15 text-ok', reading: 'bg-info/15 text-info' };

function Reading({ list }: { list: PortalPaper[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {list.map((p) => (
        <div key={p.id} className="flex min-w-0 items-start gap-3 px-4 py-3">
          <BookOpen size={15} className="mt-0.5 shrink-0 text-fg-3" />
          <div className="min-w-0 flex-1">
            {p.link ? (
              <a href={p.link} target="_blank" rel="noopener noreferrer" translate="no" className="group inline-flex max-w-full items-baseline gap-1 text-[13.5px] font-medium text-fg hover:text-accent">
                <span className="min-w-0 truncate">{p.title}</span>
                <ExternalLink size={11} className="shrink-0 self-center text-fg-3 group-hover:text-accent" />
              </a>
            ) : (
              <div translate="no" className="truncate text-[13.5px] font-medium">
                {p.title}
              </div>
            )}
            {(p.authors || p.venue || p.year) && (
              <div translate="no" className="mt-0.5 truncate text-[12px] text-fg-3">
                {[p.authors, [p.venue, p.year].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
              </div>
            )}
            {!!p.tags?.length && (
              <div translate="no" className="mt-1.5 flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <span key={t} className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-2">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          {p.status && <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-medium', READ_TONE[p.status] ?? 'bg-bg-2 text-fg-3')}>{p.status === 'read' ? 'Read' : p.status === 'reading' ? 'Reading' : p.status === 'to read' ? 'To read' : p.status}</span>}
        </div>
      ))}
    </div>
  );
}


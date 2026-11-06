// The Apps page, in two parts. Agent apps (/apps): small tools that find things out and show them clearly, each for one
// job. At its very top the apps you pinned (big tiles, in the order you drag them into, the same on every device); then
// a box that finds any app as you type (Enter opens the first), staying at the top as the page scrolls, and its kinds
// as chips with their counts; the apps you ran lately (each once: how it went, Open the result, Run again), with the
// latest runs folded beside them; for someone who has run none yet, four ready-made apps to start with and a line on
// what apps are; your own apps (sorted as you like); the ready-made ones (which come installed), by kind; those you
// uninstalled, to install again; and building blocks, apps made to be steps of others, folded at the end. Each card
// says, by small marks with words on hover, whether the app opens in a view of its own, whether agents run it in
// chats and whether it needs a key. An app file dropped on the page opens the card that installs it, and each app's
// card downloads it as a file. Connected apps (/apps/connected): the services every agent can use, connected once,
// their marketplace and the keys in the vault.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { ArrowRight, ArrowUpDown, ChevronDown, ChevronRight, Download, FilePlus2, FileUp, Globe, KeyRound, LayoutDashboard, LayoutGrid, MessagesSquare, MoreHorizontal, Plus, Puzzle, Search, Sparkles, TextCursorInput, X } from 'lucide-react';
import type { AppDef, AppRun } from '@shared/apps';
import { APP_COLORS, inputsLine, isActive, madeForSessions, RECENT_APPS, USED_SOURCES } from '@shared/apps';
import { pagesFor } from '@shared/app-ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Tabs, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { ConnectedApps, type ConnTab } from '../connections/ConnectedApps';
import { useConn } from '../connections/store';
import { InstallReadyDialog } from './About';
import { appPath, runPath, useRunEvents, type Gallery, type ReadyApp } from './api';
import { AppIcon } from './AppIcon';
import { findWords, fitOf } from './find';
import { DownloadDialog, InstallFromFile, type InstallHandle } from './Install';
import { PinMenuItem, PinnedRow } from './Pinned';
import { gotPins, usePins } from './pins';
import { isNew, RecentlyUsed, StartWith } from './Recent';
import { statusBadge } from './status';

export { statusBadge };

/** New app: describe it, start from scratch, or install one from a file; one menu. */
function NewAppMenu() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={btn} size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => setOpen((o) => !o)}>
        New app
        <ChevronDown size={14} className="-mr-1 opacity-70" />
      </Button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={250}>
        <MenuItem icon={<Sparkles size={15} />} onClick={() => (setOpen(false), go('/?assistant=app-builder'))}>
          Describe it to an agent
        </MenuItem>
        <MenuItem icon={<FilePlus2 size={15} />} onClick={() => (setOpen(false), go('/apps/new'))}>
          Start from scratch
        </MenuItem>
        <InstallFromFile
          trigger={(pick) => (
            <MenuItem icon={<FileUp size={15} />} onClick={() => (setOpen(false), pick())}>
              Install from a file
            </MenuItem>
          )}
        />
      </Popover>
    </>
  );
}

/** An app's card's More: open it, pin it to the top of the page (or unpin it), or download it as a file to keep or to install elsewhere. */
function CardMenu({ a, ready }: { a: AppDef | ReadyApp; ready?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  // A ready-made app downloads by its id ("tpl:<id>"), as a file named after it.
  const asFile = (ready ? { ...a, id: `tpl:${(a as ReadyApp).id}`, slug: (a as ReadyApp).id } : a) as AppDef;
  return (
    <>
      <IconButton
        ref={btn}
        label="More"
        size="sm"
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className="absolute top-2.5 right-2.5 bg-panel/80 opacity-100 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-sm:top-1/2 max-sm:right-2 max-sm:-translate-y-1/2 sm:opacity-0 [@media(hover:none)]:opacity-100"
      >
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={220}>
        <MenuItem icon={<ArrowRight size={15} />} onClick={() => (setOpen(false), go(appPath(asFile.id)))}>
          Open
        </MenuItem>
        {(!ready || (a as ReadyApp).installed) && <PinMenuItem id={asFile.id} onDone={() => setOpen(false)} />}
        <MenuItem icon={<Download size={15} />} onClick={() => (setOpen(false), setSaving(true))}>
          Download as a file
        </MenuItem>
      </Popover>
      <DownloadDialog app={asFile} open={saving} onClose={() => setSaving(false)} />
    </>
  );
}

// ---- an app's card -------------------------------------------------------------------------------------------

/** A small mark of what an app is like, its words on hover. */
function Mark({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <span role="img" title={title} aria-label={title} className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-fg-3">
      {icon}
    </span>
  );
}

type CardApp = (AppDef & { lastRunAt?: number; needsKey?: true }) | ReadyApp;

/**
 * An app's card, all of one size: its face, one line of what it does, what its form asks for, and small marks (a view
 * of its own, agents use it in chats, a key it still needs, its public page open, not installed, a building block),
 * with when it last ran. `first`: what Enter in the find box opens.
 */
function AppCard({ a, ready, first }: { a: CardApp; ready?: boolean; first?: boolean }) {
  const own = !ready ? (a as AppDef) : null;
  const t = ready ? (a as ReadyApp) : null;
  const view = pagesFor(a.ui, 'run').length > 0 || pagesFor(a.ui, 'app').length > 0;
  // Agents run it in your sessions: made for that, and not turned off on its page.
  const chats = madeForSessions(a) && (t ? t.agents && t.installed : own?.agents !== false);
  const path = appPath(t ? `tpl:${t.id}` : a.id);
  // A ready-made app's words are the app's own (translated); yours are yours.
  const mine = t ? undefined : 'no';
  return (
    <button
      type="button"
      onClick={() => go(path)}
      className={cx(
        'flex h-full w-full flex-col bg-panel text-left transition-colors hover:bg-bg-1 max-sm:px-4 max-sm:py-3 sm:rounded-2xl sm:border sm:border-line sm:p-4 sm:hover:border-line-2',
        first && 'max-sm:bg-bg-1 sm:border-accent/50 sm:ring-1 sm:ring-accent/30',
      )}
    >
      <div className="flex w-full items-start gap-3 pr-7 max-sm:items-center">
        <AppIcon icon={a.icon} color={a.color} size={40} />
        <div className="min-w-0 flex-1">
          <div translate={mine} className="truncate text-[15px] font-semibold tracking-tight">
            {a.name}
          </div>
          <div translate={a.description ? mine : undefined} className="mt-0.5 truncate text-[13px] leading-snug text-fg-3">
            {a.description || 'No description'}
          </div>
        </div>
      </div>
      <div title="What it asks for" className="mt-3 flex w-full min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3 max-sm:hidden">
        <TextCursorInput size={13} className="shrink-0 opacity-80" aria-hidden />
        {a.fields.length ? (
          <span translate={mine} className="truncate">
            {a.fields.map((f) => f.label).join(' · ')}
          </span>
        ) : (
          <span className="truncate">Ready to run</span>
        )}
      </div>
      <div className="mt-auto flex w-full min-w-0 items-center gap-2 pt-2.5 max-sm:hidden">
        {view && <Mark icon={<LayoutDashboard size={14} />} title="Its answer opens in a view of its own: maps, charts, tables" />}
        {chats && <Mark icon={<MessagesSquare size={14} />} title="Ask for what it does in any session, and the agent runs it there" />}
        {a.needsKey && <Mark icon={<KeyRound size={14} />} title="Needs a key" />}
        {own?.public.on && <Mark icon={<Globe size={14} />} title="Public" />}
        {t && !t.installed && <span className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-3">Not installed</span>}
        {a.block && <span className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] text-fg-3">Building block</span>}
        <span className="flex-1" />
        {a.lastRunAt ? <span className="truncate text-[12px] text-fg-3">{tr(`Ran ${timeAgo(a.lastRunAt)} ago`)}</span> : null}
      </div>
    </button>
  );
}

/** A card with its More (open, pin, download as a file). */
function YourApp({ a, ready, first }: { a: CardApp; ready?: boolean; first?: boolean }) {
  return (
    <div className="group relative">
      <AppCard a={a} ready={ready} first={first} />
      <CardMenu a={a} ready={ready} />
    </div>
  );
}

/** Cards side by side, as many as the page's width takes (it is a container); on a phone, the rows of one list (shorter, so more of them show). */
const COLS = 'grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3';
const GRID = `${COLS} sm:gap-3 max-sm:divide-y max-sm:divide-line max-sm:overflow-hidden max-sm:rounded-2xl max-sm:border max-sm:border-line`;

/** Your own app, made here: it opens the builder (which also takes a description or a file). After your apps, a card
 *  with an app card's face (a plus on an accent tile, the name, a line); with none yet, one row across the page. */
function NewTile({ row }: { row?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => go('/apps/new')}
      className={cx(
        'group flex w-full gap-3 rounded-2xl border border-line text-left transition-colors hover:border-line-2 hover:bg-bg-1',
        row ? 'items-center px-4 py-3 sm:gap-4 sm:px-5 sm:py-4' : 'min-h-[128px] items-start p-4 max-sm:hidden',
      )}
    >
      <span aria-hidden className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-[12px] bg-accent/15 text-accent ring-1 ring-accent/20 ring-inset">
        <Plus size={21} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-tight">Make an app</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-pretty text-fg-3">Describe it to an agent, start from scratch, or install a file</span>
      </span>
      {row && <ChevronRight size={16} className="shrink-0 text-fg-3 transition-colors group-hover:text-accent" />}
    </button>
  );
}

/** A part of the page: its title, a quiet line beside it, and what it holds. */
function Part({ title, sub, children, action }: { title: ReactNode; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="scroll-mt-16">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {sub && <span className="text-[13px] text-fg-3">{sub}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** A ready-made app you uninstalled: a band of its colour, what it does, what you get (the pages of its view), and Install. */
function ReadyMade({ t, onInstall }: { t: ReadyApp; onInstall: () => void }) {
  const c = APP_COLORS[t.color] ?? APP_COLORS.blue;
  const pages = pagesFor(t.ui, 'run').filter((p) => p.tab !== false);
  return (
    <button type="button" onClick={onInstall} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition-colors hover:border-line-2">
      <div className="relative h-[72px] w-full" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${c} 24%, transparent), color-mix(in oklab, ${c} 6%, transparent))` }}>
        <span className="absolute top-3 right-4 text-[11.5px] font-medium tracking-wide uppercase" style={{ color: c }}>
          {t.category}
        </span>
        <span className="absolute -bottom-6 left-5 rounded-[15px] bg-panel p-[3px]">
          <AppIcon icon={t.icon} color={t.color} size={46} />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-5 pt-8 pb-4">
        <div className="text-[16px] font-semibold tracking-tight">{t.name}</div>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-fg-2">{t.description}</p>
        {pages.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pages.map((p) => (
              <span key={p.id} className="rounded-full bg-bg-2 px-2.5 py-0.5 text-[12px] text-fg-2">
                {p.title}
              </span>
            ))}
          </div>
        )}
        <span className="mt-auto flex items-center gap-1 pt-4 text-[13px] font-medium text-fg-3 transition-colors group-hover:text-accent">
          <Plus size={14} /> Install
        </span>
      </div>
    </button>
  );
}

/** A run to pick up again: its app, what it was asked, how it stands. */
function RecentRun({ r, a }: { r: AppRun; a?: { icon: string; color: string; fields?: AppDef['fields'] } }) {
  return (
    <button type="button" onClick={() => go(runPath(r.id))} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-bg-1">
      <AppIcon icon={a?.icon ?? 'sparkles'} color={a?.color ?? 'slate'} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium" translate={r.app.startsWith('tpl:') ? undefined : 'no'}>
          {r.appName}
        </span>
        <span className="block truncate text-[12.5px] text-fg-3" translate="no">
          {(a?.fields ? inputsLine(a.fields, r.inputs, 90) : Object.values(r.inputs).filter(Boolean).join(' · ')) || '—'}
        </span>
      </span>
      {statusBadge(r)}
      <span className={cx('tnum hidden w-14 shrink-0 text-right text-[12px] text-fg-3 sm:block', isActive(r.status) && 'invisible')}>{timeAgo(r.endedAt ?? r.createdAt)}</span>
      <ChevronRight size={15} className="shrink-0 text-fg-3" />
    </button>
  );
}

// ---- your own apps, in the order you pick --------------------------------------------------------------------

type Sort = 'used' | 'az' | 'new';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'used', label: 'Most used' },
  { value: 'az', label: 'A to Z' },
  { value: 'new', label: 'Newest' },
];
const SORT_KEY = 'wa.apps.sort';
/** From this many of your own apps, the order they show in is yours to pick. */
const SORT_FROM = 4;

type OwnApp = Gallery['apps'][number];

function sorted(list: OwnApp[], sort: Sort): OwnApp[] {
  if (sort === 'az') return [...list].sort((a, b) => a.name.localeCompare(b.name, LOCALE, { sensitivity: 'base' }));
  if (sort === 'new') return [...list].sort((a, b) => b.createdAt - a.createdAt);
  // Most used: how often each ran, then when it last ran, then the latest changed.
  return [...list].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || b.updatedAt - a.updatedAt);
}

/** The order your own apps show in: one quiet button and its menu. */
function SortMenu({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen((o) => !o)} title="Sort your apps" className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
        <ArrowUpDown size={13} />
        {SORTS.find((s) => s.value === value)!.label}
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={180}>
        {SORTS.map((s) => (
          <MenuItem key={s.value} checked={s.value === value} onClick={() => (setOpen(false), onChange(s.value))}>
            {s.label}
          </MenuItem>
        ))}
      </Popover>
    </>
  );
}

// ---- the page ----------------------------------------------------------------------------------------------------

/** Where the guide says what apps are. */
const GUIDE = '/guide/apps#what-an-app-is';

export function GalleryPage({ tab = 'agent' }: { tab?: 'agent' | 'connected' }) {
  const [g, setG] = useState<Gallery | null>(null);
  const [cat, setCat] = useState('All');
  const [find, setFind] = useState('');
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [adding, setAdding] = useState<ReadyApp | null>(null);
  const [sort, setSortState] = useState<Sort>(() => {
    try {
      const s = localStorage.getItem(SORT_KEY);
      return s === 'az' || s === 'new' ? s : 'used';
    } catch {
      return 'used';
    }
  });
  const setSort = (s: Sort) => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {}
  };
  const load = () =>
    api<Gallery>('/api/apps').then((x) => {
      setG(x);
      if (x.pins) gotPins(x.pins);
    }, toastError);
  useEffect(() => {
    if (tab === 'agent') load();
  }, [tab]);
  const pins = usePins((s) => s.ids);
  // The connected services, for their tab's count (and the part itself).
  const connections = useConn((s) => s.connections);
  useEffect(() => {
    void useConn.getState().loadCatalog();
    void useConn.getState().load();
  }, []);
  const connTab = new URLSearchParams(useSearch()).get('tab');
  // An app file dropped anywhere on the page: the card that installs it.
  const installer = useRef<InstallHandle>(null);
  const [dropping, setDropping] = useState(false);
  const files = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      setDropping(true);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
    },
    onDrop: (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      setDropping(false);
      const f = e.dataTransfer.files[0];
      if (f) installer.current?.open(f);
    },
  };
  // A run changing shows in the latest runs and the apps used lately; a new one from a form, a page or a chat joins them.
  useRunEvents((run) =>
    setG((x) => {
      if (!x) return x;
      const recent = x.recent.some((r) => r.id === run.id) ? x.recent.map((r) => (r.id === run.id ? run : r)) : run.source === 'web' || run.source === 'test' ? [run, ...x.recent].slice(0, 6) : x.recent;
      let used = x.used ?? [];
      const here = x.apps.some((a) => a.id === run.app) || x.templates.some((t) => `tpl:${t.id}` === run.app && t.installed);
      if (here && USED_SOURCES.includes(run.source) && !run.parent && !run.flow) {
        const was = used.find((u) => u.app === run.app);
        if (was?.run.id === run.id) used = used.map((u) => (u.app === run.app ? { app: u.app, run } : u));
        else if (!was || was.run.createdAt <= run.createdAt) used = [{ app: run.app, run }, ...used.filter((u) => u.app !== run.app)].slice(0, RECENT_APPS);
      }
      return { ...x, recent, used };
    }),
  );
  // Ready-made apps come installed: those you uninstalled wait below, to install again.
  const ready = useMemo(() => (g?.templates ?? []).filter((t) => !t.block && t.installed), [g]);
  const removed = useMemo(() => (g?.templates ?? []).filter((t) => !t.block && !t.installed), [g]);
  const blocks = useMemo(() => (g?.templates ?? []).filter((t) => t.block), [g]);
  const own = useMemo(() => (g?.apps ?? []).filter((a) => !a.block), [g]);
  const ownBlocks = useMemo(() => (g?.apps ?? []).filter((a) => a.block), [g]);
  // The kinds of apps there are, the ready-made ones' first, in their order, each with how many apps it has.
  const kinds = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of [...ready, ...own]) n.set(a.category ?? 'Other', (n.get(a.category ?? 'Other') ?? 0) + 1);
    return [['All', ready.length + own.length] as [string, number], ...n.entries()];
  }, [own, ready]);
  const ofKind = (a: { category?: string }) => cat === 'All' || (a.category ?? 'Other') === cat;
  const words = useMemo(() => findWords(find), [find]);
  const finding = words.length > 0;
  // Every app (yours, the ready-made ones, those uninstalled, building blocks), as well as it fits the words, best first;
  // yours a little ahead, those uninstalled and blocks a little behind.
  const found = useMemo(() => {
    if (!finding) return [];
    const all: { key: string; a: CardApp; ready: boolean; weight: number }[] = [
      ...own.map((a) => ({ key: a.id, a, ready: false, weight: 1.15 })),
      ...ready.map((t) => ({ key: `tpl:${t.id}`, a: t, ready: true, weight: 1 })),
      ...ownBlocks.map((a) => ({ key: a.id, a, ready: false, weight: 0.8 })),
      ...blocks.map((t) => ({ key: `tpl:${t.id}`, a: t, ready: true, weight: 0.8 })),
      ...removed.map((t) => ({ key: `tpl:${t.id}`, a: t, ready: true, weight: 0.7 })),
    ];
    return all
      .filter((x) => ofKind(x.a))
      .map((x) => ({ ...x, fit: fitOf(words, { name: [x.a.name, tr(x.a.name)], kind: [x.a.category ?? '', tr(x.a.category ?? '')], about: [x.a.description ?? '', tr(x.a.description ?? '')] }) * x.weight }))
      .filter((x) => x.fit > 0)
      .sort((a, b) => b.fit - a.fit || a.a.name.localeCompare(b.a.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finding, words, own, ready, ownBlocks, blocks, removed, cat]);
  const ownShown = useMemo(() => sorted(own.filter(ofKind), sort), [own, cat, sort]);
  const readyShown = ready.filter(ofKind);
  // All of them: the ready-made apps under their kinds.
  const byKind = useMemo(() => {
    if (cat !== 'All') return null;
    const out = new Map<string, ReadyApp[]>();
    for (const t of readyShown) out.set(t.category ?? 'Other', [...(out.get(t.category ?? 'Other') ?? []), t]);
    return [...out.entries()];
  }, [readyShown, cat]);
  const faces = useMemo(() => Object.fromEntries([...(g?.apps ?? []).map((a) => [a.id, a] as const), ...(g?.templates ?? []).map((t) => [`tpl:${t.id}`, t] as const)]), [g]);
  const used = g?.used ?? [];
  const runs = g?.recent ?? [];
  const pinned = (pins ?? []).filter((id) => faces[id]);
  // Enter opens the best fit; Escape empties the box.
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' && found[0]) go(appPath(found[0].key));
    if (e.key === 'Escape' && find) (e.preventDefault(), setFind(''));
  };

  const header = (
    <PageHeader
      title="Apps"
      tip={tab === 'connected' ? 'connections' : 'apps'}
      sub={<span className="max-sm:hidden">{tab === 'connected' ? 'Services every agent can use, connected once, and the keys they use' : 'Small tools that find things out and show them clearly: open one here, or ask in any chat'}</span>}
      actions={tab === 'agent' ? <NewAppMenu /> : undefined}
    >
      <Tabs
        value={tab}
        onChange={(t) => go(t === 'agent' ? '/apps' : '/apps/connected')}
        options={[
          { value: 'agent', label: 'Agent apps', count: g ? own.length + ready.length : undefined },
          { value: 'connected', label: 'Connected apps', count: connections?.length || undefined },
        ]}
      />
    </PageHeader>
  );
  if (tab === 'connected')
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConnectedApps tab={connTab === 'market' || connTab === 'keys' || connTab === 'connected' ? (connTab as ConnTab) : null} onTab={(t) => go(`/apps/connected?tab=${t}`, true)} />
        </div>
      </div>
    );

  const nothing = !!g && (finding ? !found.length : !ownShown.length && !readyShown.length);
  const browsing = !finding && cat === 'All';
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="relative min-h-0 flex-1 overflow-y-auto" {...drop}>
        {dropping && (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent/8 backdrop-blur-[1px]">
            <div className="text-center">
              <FileUp size={28} className="mx-auto text-accent" />
              <div className="mt-2 text-[15px] font-semibold">Drop an app file to install it</div>
              <div className="text-[13px] text-fg-3">A .hydor-app or .json: you see what it does before anything is installed</div>
            </div>
          </div>
        )}
        {!g ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="@container mx-auto max-w-[1120px] px-4 pt-5 pb-10 sm:px-6 sm:pt-6">
            {pinned.length > 0 && (
              <div className="mb-5">
                <Part title="Pinned" sub={pinned.length > 1 ? <span className="max-sm:hidden">Drag to change the order</span> : undefined}>
                  <PinnedRow ids={pinned} faces={faces} />
                </Part>
              </div>
            )}

            {/* The find box stays at the top while the page scrolls; the kinds scroll away under it. */}
            <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 py-2 sm:-mx-6 sm:px-6">
              <label className="flex h-10 min-w-0 items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 focus-within:border-accent/60 sm:max-w-[460px]">
                <Search size={15} className="shrink-0 text-fg-3" />
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  onKeyDown={keys}
                  placeholder="Find an app: weather, recipes, a trip…"
                  enterKeyHint="go"
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3"
                />
                {find && (
                  <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
            {kinds.length > 2 && (
              <div className="-mx-4 mt-1.5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                {kinds.map(([k, n]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={cat === k}
                    onClick={() => setCat(k)}
                    className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors', cat === k ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg')}
                  >
                    {k}
                    <span className={cx('tnum text-[11.5px]', cat === k ? 'opacity-70' : 'text-fg-3')}>{n}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-8 space-y-9">
              {finding ? (
                found.length > 0 && (
                  <div className={GRID}>
                    {found.map((x, i) => (
                      <YourApp key={x.key} a={x.a} ready={x.ready} first={i === 0} />
                    ))}
                  </div>
                )
              ) : (
                <>
                  {browsing && (used.length > 0 || runs.length > 0) && (
                    <Part
                      title={used.length ? 'Recently used' : 'Latest runs'}
                      sub={used.length > 0 && !pinned.length ? <span className="max-sm:hidden">Pin the ones you use most from their ⋯ menu to keep them at the top</span> : undefined}
                      action={
                        used.length > 0 && runs.length > 0 ? (
                          <button type="button" onClick={() => setRunsOpen((o) => !o)} aria-expanded={runsOpen} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 hover:text-fg">
                            Latest runs
                            <ChevronDown size={14} className={cx('transition-transform', runsOpen && 'rotate-180')} />
                          </button>
                        ) : undefined
                      }
                    >
                      {used.length > 0 && <RecentlyUsed used={used} faces={faces} />}
                      {(runsOpen || !used.length) && (
                        <div className={cx('overflow-hidden rounded-2xl border border-line bg-panel', used.length > 0 && 'mt-3')}>
                          {runs.map((r) => (
                            <RecentRun key={r.id} r={r} a={faces[r.app]} />
                          ))}
                        </div>
                      )}
                    </Part>
                  )}

                  {browsing && isNew(g.used, g.recent) && (
                    <Part title="Start with">
                      <p className="-mt-1 mb-3.5 max-w-[760px] text-[13px] leading-relaxed text-fg-3">
                        Small tools for one job each: answer a few questions and the answer opens in a view of its own, or just ask for it in any chat.{' '}
                        <button type="button" onClick={() => go(GUIDE)} className="font-medium text-accent hover:underline">
                          Learn more
                        </button>
                      </p>
                      <StartWith templates={g.templates} />
                    </Part>
                  )}

                  {(ownShown.length > 0 || cat === 'All') && (
                    <Part title="Your own apps" sub={ownShown.length ? tr(`${ownShown.length}`) : undefined} action={own.length >= SORT_FROM ? <SortMenu value={sort} onChange={setSort} /> : undefined}>
                      {ownShown.length > 0 ? (
                        <div className={cx(COLS, 'gap-3')}>
                          <div className={cx(GRID, 'sm:contents')}>
                            {ownShown.map((a) => (
                              <YourApp key={a.id} a={a} />
                            ))}
                          </div>
                          {cat === 'All' && <NewTile />}
                        </div>
                      ) : (
                        <NewTile row />
                      )}
                    </Part>
                  )}

                  {readyShown.length > 0 && (
                    <Part title="Ready-made apps" sub="They come with Hydor: run one, or make it yours to change it">
                      {byKind ? (
                        <div className="space-y-6">
                          {byKind.map(([kind, list]) => (
                            <div key={kind}>
                              <h3 className="mb-2.5 text-[13px] font-semibold tracking-wide text-fg-3 uppercase">{kind}</h3>
                              <div className={GRID}>
                                {list.map((t) => (
                                  <YourApp key={`tpl:${t.id}`} a={t} ready />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={GRID}>
                          {readyShown.map((t) => (
                            <YourApp key={`tpl:${t.id}`} a={t} ready />
                          ))}
                        </div>
                      )}
                    </Part>
                  )}
                </>
              )}

              {nothing && (
                <div className="rounded-2xl border border-dashed border-line-2 px-5 py-2">
                  <Empty icon={<LayoutGrid size={20} />} title={own.length + ready.length ? 'No app does that yet' : 'Your apps will be here'}>
                    <span className="block">{own.length + ready.length ? 'Describe it, and an agent makes a small app for it: a form, the steps, and a view of the answer.' : 'Describe one, or use More → Save as an app in a session’s menu.'}</span>
                    <span className="mt-3 inline-flex">
                      <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => go(`/?assistant=app-builder${finding ? `&prompt=${encodeURIComponent(`${tr('Make me an app: ')}${find.trim()}`)}` : ''}`)}>
                        Describe it to an agent
                      </Button>
                    </span>
                  </Empty>
                </div>
              )}

              {removed.length > 0 && !finding && (
                <Part title="Ready-made apps to install" sub="The ones you uninstalled: install one again to have it back">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {removed.map((t) => (
                      <ReadyMade key={t.id} t={t} onInstall={() => setAdding(t)} />
                    ))}
                  </div>
                </Part>
              )}

              {(blocks.length > 0 || ownBlocks.length > 0) && !finding && (
                <section className="rounded-2xl border border-line">
                  <button type="button" onClick={() => setBlocksOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left" aria-expanded={blocksOpen}>
                    <Puzzle size={17} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">Building blocks</span>
                      <span className="block text-[12.5px] text-fg-3">Small apps made to be steps of your own: sum up a page, translate, answer from the web…</span>
                    </span>
                    <span className="text-[12.5px] text-fg-3">{blocks.length + ownBlocks.length}</span>
                    <ChevronRight size={16} className={cx('shrink-0 text-fg-3 transition-transform', blocksOpen && 'rotate-90')} />
                  </button>
                  {blocksOpen && (
                    <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {[...ownBlocks.map((a) => ({ key: a.id, path: appPath(a.id), icon: a.icon, color: a.color, name: a.name, description: a.description, own: true })), ...blocks.map((t) => ({ key: t.id, path: appPath(`tpl:${t.id}`), icon: t.icon, color: t.color, name: t.name, description: t.description, own: false }))].map((b) => (
                        <button key={b.key} type="button" onClick={() => go(b.path)} className="flex items-start gap-3 rounded-xl p-2.5 text-left hover:bg-bg-1">
                          <AppIcon icon={b.icon} color={b.color} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13.5px] font-medium" translate={b.own ? 'no' : undefined}>
                              {b.name}
                            </span>
                            <span className="line-clamp-2 block text-[12.5px] leading-snug text-fg-3" translate={b.own ? 'no' : undefined}>
                              {b.description}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </div>
      {adding && <InstallReadyDialog t={adding} open onClose={() => setAdding(null)} />}
      <InstallFromFile ref={installer} trigger={() => null} />
    </div>
  );
}

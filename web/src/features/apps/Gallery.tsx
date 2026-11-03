// The Apps page, in two parts. Agent apps (/apps): small tools that find things out and show them clearly, each for one
// job. A short note says what they are (fill in a few answers, or just ask in any session; the answer shows in a view
// of its own) until you put it away; then a box to find an app and chips for its kind; the runs to pick up again;
// your own apps; the ready-made ones (which come installed), by kind; those you uninstalled, to install again; and
// building blocks, apps made to be steps of others, folded at the end. Each card says whether the app opens in a view
// of its own and whether agents run it in chats. An app file dropped on the page opens the card that installs it, and
// each app's card downloads it as a file. Connected apps (/apps/connected): the services every agent can use,
// connected once, their marketplace and the keys in the vault.
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { ArrowRight, ChevronDown, ChevronRight, Download, FilePlus2, FileUp, Globe, LayoutDashboard, LayoutGrid, MessagesSquare, MoreHorizontal, Plus, Puzzle, Search, Sparkles, Target, X } from 'lucide-react';
import type { AppDef, AppRun } from '@shared/apps';
import { APP_COLORS, inputsLine, isActive, madeForSessions } from '@shared/apps';
import { pagesFor } from '@shared/app-ui';
import { tr } from '../../i18n/runtime';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, Empty, IconButton, MenuItem, Popover, Tabs, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { ConnectedApps, type ConnTab } from '../connections/ConnectedApps';
import { useConn } from '../connections/store';
import { InstallReadyDialog } from './About';
import { appPath, runPath, useRunEvents, type Gallery, type ReadyApp } from './api';
import { AppIcon } from './AppIcon';
import { DownloadDialog, InstallFromFile, type InstallHandle } from './Install';

const STATUS: Record<AppRun['status'], { label: string; tone: 'neutral' | 'ok' | 'err' | 'warn' | 'info' }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  starting: { label: 'Starting', tone: 'info' },
  running: { label: 'Working', tone: 'info' },
  waiting: { label: 'Needs you', tone: 'warn' },
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'err' },
  stopped: { label: 'Stopped', tone: 'neutral' },
};

export const statusBadge = (r: AppRun) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>;

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

/** An app's card's More: open it, or download it as a file to keep or to install elsewhere. */
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
        className="absolute top-2.5 right-2.5 bg-panel/80 opacity-100 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0 [@media(hover:none)]:opacity-100"
      >
        <MoreHorizontal size={16} />
      </IconButton>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={220}>
        <MenuItem icon={<ArrowRight size={15} />} onClick={() => (setOpen(false), go(appPath(asFile.id)))}>
          Open
        </MenuItem>
        <MenuItem icon={<Download size={15} />} onClick={() => (setOpen(false), setSaving(true))}>
          Download as a file
        </MenuItem>
      </Popover>
      <DownloadDialog app={asFile} open={saving} onClose={() => setSaving(false)} />
    </>
  );
}

// ---- what apps are -------------------------------------------------------------------------------------------

const INTRO_KEY = 'wa.apps.intro';

/** What an app is, in three parts: its own page and view, any chat, one job. Put away with Got it, brought back by What are apps?. */
function AppsIntro({ onHide }: { onHide: () => void }) {
  const parts: [ReactNode, string, string][] = [
    [<LayoutDashboard key="v" size={17} />, 'Open it here', 'Its page asks a few questions. The answer opens in a view made for it: maps, charts, tables and cards to look through.'],
    [<MessagesSquare key="c" size={17} />, 'Or just ask in any chat', '“Plan 4 days in Lisbon in May”: the agent runs the right app for you, asks what it is missing, and shows its answer there.'],
    [<Target key="t" size={17} />, 'One job each', 'Small and quick: each app answers one kind of question well and helps you see it clearly. It is not a big program.'],
  ];
  return (
    <section className="relative rounded-3xl border border-line bg-panel px-5 py-5 sm:px-7 sm:py-6">
      <IconButton label="Got it" size="sm" onClick={onHide} className="absolute top-3 right-3">
        <X size={15} />
      </IconButton>
      <div className="flex items-center gap-2 pr-8 text-[12.5px] font-medium tracking-wide text-accent uppercase">
        <Sparkles size={14} />
        Apps
      </div>
      <h2 className="mt-1 pr-8 text-[19px] leading-tight font-semibold tracking-tight sm:text-[21px]">Small tools that find things out and show them clearly</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {parts.map(([icon, title, body]) => (
          <div key={title} className="rounded-2xl bg-bg-1 px-4 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-soft text-accent">{icon}</span>
            <div className="mt-2.5 text-[13.5px] font-semibold">{title}</div>
            <div className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- an app's card -------------------------------------------------------------------------------------------

/** One of the two ways an app works, as a quiet mark on its card. */
function Way({ icon, children, title }: { icon: ReactNode; children: ReactNode; title: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1 text-[12px] text-fg-3">
      {icon}
      {children}
    </span>
  );
}

type CardApp = (AppDef & { lastRunAt?: number }) | ReadyApp;

/** An app's card: its face, what it does, whether it has a view of its own and works in chats, and when it last ran. */
function AppCard({ a, ready }: { a: CardApp; ready?: boolean }) {
  const own = !ready ? (a as AppDef) : null;
  const view = (pagesFor(a.ui, 'run').length > 0 || pagesFor(a.ui, 'app').length > 0);
  // Agents run it in your sessions: made for that, and not turned off on its page.
  const chats = madeForSessions(a) && (ready ? (a as ReadyApp).agents : own?.agents !== false);
  const path = appPath(ready ? `tpl:${(a as ReadyApp).id}` : a.id);
  // A ready-made app's words are the app's own (translated); yours are yours.
  const mine = ready ? undefined : 'no';
  return (
    <button type="button" onClick={() => go(path)} className="flex h-full min-h-[128px] w-full flex-col rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-line-2 hover:bg-bg-1">
      <div className="flex w-full items-start gap-3 pr-7">
        <AppIcon icon={a.icon} color={a.color} size={42} />
        <div className="min-w-0 flex-1">
          <div translate={mine} className="truncate text-[15px] font-semibold tracking-tight">
            {a.name}
          </div>
          <div translate={a.description ? mine : undefined} className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg-3">
            {a.description || 'No description'}
          </div>
        </div>
      </div>
      <div className="mt-auto flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-3">
        {view && (
          <Way icon={<LayoutDashboard size={12} />} title="Its answer opens in a view of its own: maps, charts, tables">
            Its own view
          </Way>
        )}
        {chats && (
          <Way icon={<MessagesSquare size={12} />} title="Ask for what it does in any session, and the agent runs it there">
            Works in chats
          </Way>
        )}
        {own?.public.on && (
          <Badge tone="info">
            <Globe size={10} className="mr-1" />
            Public
          </Badge>
        )}
        <span className="flex-1" />
        {a.lastRunAt ? <span className="text-[12px] text-fg-3">{tr(`Ran ${timeAgo(a.lastRunAt)} ago`)}</span> : null}
      </div>
    </button>
  );
}

/** A card with its More (open, download as a file). */
function YourApp({ a, ready }: { a: CardApp; ready?: boolean }) {
  return (
    <div className="group relative">
      <AppCard a={a} ready={ready} />
      <CardMenu a={a} ready={ready} />
    </div>
  );
}

const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3';

/** A part of the page: its title, a quiet line beside it, and what it holds. */
function Part({ title, sub, children, action }: { title: ReactNode; sub?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
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
    <button type="button" onClick={() => go(runPath(r.id))} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-bg-1">
      <AppIcon icon={a?.icon ?? 'sparkles'} color={a?.color ?? 'slate'} size={32} />
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

/** How many runs to pick up again show before Show all. */
const RUNS = 4;

export function GalleryPage({ tab = 'agent' }: { tab?: 'agent' | 'connected' }) {
  const [g, setG] = useState<Gallery | null>(null);
  const [cat, setCat] = useState('All');
  const [find, setFind] = useState('');
  const [intro, setIntro] = useState(() => localStorage.getItem(INTRO_KEY) !== 'hidden');
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [allRuns, setAllRuns] = useState(false);
  const [adding, setAdding] = useState<ReadyApp | null>(null);
  const load = () => api<Gallery>('/api/apps').then(setG, toastError);
  useEffect(() => {
    if (tab === 'agent') load();
  }, [tab]);
  const showIntro = (on: boolean) => {
    setIntro(on);
    try {
      if (on) localStorage.removeItem(INTRO_KEY);
      else localStorage.setItem(INTRO_KEY, 'hidden');
    } catch {}
  };
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
  // A run changing shows in the latest runs; a new one from a form joins them.
  useRunEvents((run) =>
    setG((x) => {
      if (!x) return x;
      if (x.recent.some((r) => r.id === run.id)) return { ...x, recent: x.recent.map((r) => (r.id === run.id ? run : r)) };
      return run.source === 'web' || run.source === 'test' ? { ...x, recent: [run, ...x.recent].slice(0, 6) } : x;
    }),
  );
  // Ready-made apps come installed: those you uninstalled wait below, to install again.
  const ready = useMemo(() => (g?.templates ?? []).filter((t) => !t.block && t.installed), [g]);
  const removed = useMemo(() => (g?.templates ?? []).filter((t) => !t.block && !t.installed), [g]);
  const blocks = useMemo(() => (g?.templates ?? []).filter((t) => t.block), [g]);
  const own = useMemo(() => (g?.apps ?? []).filter((a) => !a.block), [g]);
  const ownBlocks = useMemo(() => (g?.apps ?? []).filter((a) => a.block), [g]);
  // The kinds of apps there are, the ready-made ones' first, in their order.
  const cats = useMemo(() => ['All', ...new Set([...ready.map((t) => t.category ?? 'Other'), ...own.map((a) => a.category ?? 'Other')])], [own, ready]);
  const words = find.trim().toLowerCase();
  const fits = (a: { name: string; description?: string; category?: string }) =>
    (cat === 'All' || (a.category ?? 'Other') === cat) && (!words || `${a.name} ${a.description ?? ''} ${a.category ?? ''} ${tr(a.name)} ${tr(a.description ?? '')}`.toLowerCase().includes(words));
  const ownShown = own.filter(fits);
  const readyShown = ready.filter(fits);
  // All of them, no words: the ready-made apps under their kinds.
  const byKind = useMemo(() => {
    if (cat !== 'All' || words) return null;
    const out = new Map<string, ReadyApp[]>();
    for (const t of readyShown) out.set(t.category ?? 'Other', [...(out.get(t.category ?? 'Other') ?? []), t]);
    return [...out.entries()];
  }, [readyShown, cat, words]);
  const faces = useMemo(() => Object.fromEntries([...(g?.apps ?? []).map((a) => [a.id, a] as const), ...(g?.templates ?? []).map((t) => [`tpl:${t.id}`, t] as const)]), [g]);
  const runs = allRuns ? (g?.recent ?? []) : (g?.recent ?? []).slice(0, RUNS);

  const header = (
    <PageHeader
      title="Apps"
      tip={tab === 'connected' ? 'connections' : 'apps'}
      sub={tab === 'connected' ? 'Services every agent can use, connected once, and the keys they use' : 'Small tools that find things out and show them clearly: open one here, or ask in any chat'}
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

  const nothing = !!g && !ownShown.length && !readyShown.length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="relative min-h-0 flex-1 overflow-y-auto" {...drop}>
        {dropping && (
          <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent/8 backdrop-blur-[1px]">
            <div className="text-center">
              <FileUp size={28} className="mx-auto text-accent" />
              <div className="mt-2 text-[15px] font-semibold">Drop an app file to install it</div>
              <div className="text-[13px] text-fg-3">A .naget-app or .json: you see what it does before anything is installed</div>
            </div>
          </div>
        )}
        {!g ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="mx-auto max-w-[1120px] space-y-9 px-4 py-6 sm:px-6 sm:py-7">
            {intro && <AppsIntro onHide={() => showIntro(false)} />}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-bg-1 px-3 sm:max-w-[420px]">
                  <Search size={15} className="shrink-0 text-fg-3" />
                  <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an app: weather, recipes, a trip…" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-3" />
                  {find && (
                    <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                      <X size={14} />
                    </button>
                  )}
                </label>
                <span className="flex-1" />
                {!intro && (
                  <button type="button" onClick={() => showIntro(true)} className="shrink-0 text-[12.5px] font-medium text-fg-3 hover:text-fg">
                    What are apps?
                  </button>
                )}
              </div>
              {cats.length > 2 && (
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
                  {cats.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={cat === c}
                      onClick={() => setCat(c)}
                      className={cx('h-8 shrink-0 rounded-full border px-3.5 text-[13px] transition-colors', cat === c ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {g.recent.length > 0 && !words && cat === 'All' && (
              <Part
                title="Pick up where you left off"
                action={
                  g.recent.length > RUNS ? (
                    <button type="button" onClick={() => setAllRuns((x) => !x)} className="text-[12.5px] font-medium text-fg-3 hover:text-fg">
                      {allRuns ? 'Show fewer' : tr(`All ${g.recent.length}`)}
                    </button>
                  ) : undefined
                }
              >
                <div className="overflow-hidden rounded-2xl border border-line bg-panel">
                  {runs.map((r) => (
                    <RecentRun key={r.id} r={r} a={faces[r.app]} />
                  ))}
                </div>
              </Part>
            )}

            {ownShown.length > 0 && (
              <Part title="Your own apps" sub={tr(`${ownShown.length}`)}>
                <div className={GRID}>
                  {ownShown.map((a) => (
                    <YourApp key={a.id} a={a} />
                  ))}
                </div>
              </Part>
            )}

            {readyShown.length > 0 && (
              <Part title="Ready-made apps" sub="They come with Naget Agent: run one, or make it yours to change it">
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

            {nothing && (
              <div className="rounded-2xl border border-dashed border-line-2 px-5 py-2">
                <Empty icon={<LayoutGrid size={20} />} title={own.length + ready.length ? 'No app does that yet' : 'Your apps will be here'}>
                  <span className="block">{own.length + ready.length ? 'Describe it, and an agent makes a small app for it: a form, the steps, and a view of the answer.' : 'Describe one, or use More → Save as an app in a session’s menu.'}</span>
                  <span className="mt-3 inline-flex">
                    <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => go(`/?assistant=app-builder${words ? `&prompt=${encodeURIComponent(`${tr('Make me an app: ')}${find.trim()}`)}` : ''}`)}>
                      Describe it to an agent
                    </Button>
                  </span>
                </Empty>
              </div>
            )}

            {removed.length > 0 && !words && (
              <Part title="Ready-made apps to install" sub="The ones you uninstalled: install one again to have it back">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {removed.map((t) => (
                    <ReadyMade key={t.id} t={t} onInstall={() => setAdding(t)} />
                  ))}
                </div>
              </Part>
            )}

            {(blocks.length > 0 || ownBlocks.length > 0) && !words && (
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
        )}
      </div>
      {adding && <InstallReadyDialog t={adding} open onClose={() => setAdding(null)} />}
      <InstallFromFile ref={installer} trigger={() => null} />
    </div>
  );
}

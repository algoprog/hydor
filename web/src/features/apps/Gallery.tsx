// The Apps page (/apps): a box to describe a new app (with a few ideas to start from), your apps (your own, then the
// ready-made ones, which come installed) with when each last ran, the runs to pick up again, and the ready-made apps
// you uninstalled, each showing what you get from it (the pages of its view), to install again. Building blocks,
// apps made to be steps of others, wait folded at the end.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, FilePlus2, FileUp, Globe, LayoutGrid, Plus, Puzzle, Sparkles } from 'lucide-react';
import type { AppDef, AppRun } from '@shared/apps';
import { APP_COLORS, inputsLine, isActive } from '@shared/apps';
import { pagesFor } from '@shared/app-ui';
import { tr } from '../../i18n/runtime';
import { api, enc } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, Empty, MenuItem, Popover, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { InstallReadyDialog } from './About';
import { appPath, runPath, useRunEvents, type Gallery, type ReadyApp } from './api';
import { AppIcon } from './AppIcon';
import { InstallFromFile } from './Install';

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

/** Ideas to start a new app from: a click puts one in the box. */
const IDEAS = [
  'Turn my meeting notes into tasks with owners and dates',
  'Every Friday, sum up the links I saved this week',
  'Plan a week of dinners from what is in my fridge',
  'Check the prices of things I want, and tell me when they drop',
];

/** A new app: in words, for the App builder to make; or from scratch, or from a file (in the menu beside). */
function MakeBox() {
  const [ask, setAsk] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const make = () => ask.trim() && go(`/?assistant=app-builder&prompt=${enc(`${tr('Make me an app: ')}${ask.trim()}`)}`);
  return (
    <section className="relative overflow-hidden rounded-3xl border border-line bg-panel px-5 py-6 sm:px-8 sm:py-7">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative">
        <div className="flex items-center gap-2 text-[12.5px] font-medium tracking-wide text-accent uppercase">
          <Sparkles size={14} />
          New app
        </div>
        <h2 className="mt-1.5 text-[22px] leading-tight font-semibold tracking-tight sm:text-[24px]">What should your next app do?</h2>
        <p className="mt-1 max-w-[620px] text-[14px] leading-relaxed text-fg-2">Say it in a sentence. An agent builds it, tries it, and shows you how it looks before you use it.</p>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            make();
          }}
        >
          <textarea
            ref={box}
            rows={2}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                make();
              }
            }}
            placeholder="e.g. Every Monday, read my saved links, sum each one up, and send me the three worth reading"
            className="min-h-[84px] min-w-0 flex-1 resize-none rounded-2xl border border-line-2 bg-bg-1 px-4 py-3 text-[15px] leading-snug outline-none placeholder:text-fg-3 focus:border-accent sm:min-h-[56px]"
          />
          <Button type="submit" variant="primary" disabled={!ask.trim()} icon={<ArrowRight size={15} />} className="h-11 px-5">
            Make it
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {IDEAS.map((idea, i) => (
            <button
              key={idea}
              type="button"
              onClick={() => (setAsk(tr(idea)), box.current?.focus())}
              className={cx('rounded-full border border-line bg-bg-1 px-3 py-1.5 text-left text-[12.5px] text-fg-2 transition-colors hover:border-line-2 hover:text-fg', i > 1 && 'max-sm:hidden')}
            >
              {idea}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

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

/** One of your apps (or a ready-made one installed): what it is, and when it last ran. */
function YourApp({ a, ready }: { a: (AppDef & { lastRunAt?: number }) | ReadyApp; ready?: boolean }) {
  const own = !ready ? (a as AppDef) : null;
  const view = !!own && (pagesFor(own.ui, 'run').length > 0 || pagesFor(own.ui, 'app').length > 0);
  const path = appPath(ready ? `tpl:${(a as ReadyApp).id}` : a.id);
  // A ready-made app's words are the app's own (translated); yours are yours.
  const mine = ready ? undefined : 'no';
  return (
    <button type="button" onClick={() => go(path)} className="group flex min-h-[132px] flex-col rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-line-2 hover:bg-bg-1">
      <div className="flex w-full items-start gap-3">
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
      <div className="mt-auto flex w-full min-w-0 items-center gap-2 pt-3 text-[12px] text-fg-3">
        <span className="truncate">{a.lastRunAt ? tr(`Last run ${timeAgo(a.lastRunAt)} ago`) : 'Not run yet'}</span>
        <span className="flex-1" />
        {ready && <Badge tone="neutral">Ready-made</Badge>}
        {view && <Badge tone="neutral">Has a view</Badge>}
        {own?.public.on && (
          <Badge tone="info">
            <Globe size={10} className="mr-1" />
            Public
          </Badge>
        )}
      </div>
    </button>
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

export function GalleryPage() {
  const [g, setG] = useState<Gallery | null>(null);
  const [cat, setCat] = useState('All');
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [adding, setAdding] = useState<ReadyApp | null>(null);
  const load = () => api<Gallery>('/api/apps').then(setG, toastError);
  useEffect(() => {
    load();
  }, []);
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
  // Your apps by kind of task, once there are enough of them to look through.
  const cats = useMemo(() => ['All', ...new Set([...own.map((a) => a.category ?? 'Other'), ...ready.map((t) => t.category ?? 'Other')])], [own, ready]);
  const sorting = own.length + ready.length > 6 && cats.length > 2;
  const shown = (category?: string) => !sorting || cat === 'All' || (category ?? 'Other') === cat;
  const faces = useMemo(() => Object.fromEntries([...(g?.apps ?? []).map((a) => [a.id, a] as const), ...(g?.templates ?? []).map((t) => [`tpl:${t.id}`, t] as const)]), [g]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Apps" tip="apps" sub="Small tools made of agents: you fill in a few answers, they come back with the finished work" actions={<NewAppMenu />} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!g ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="mx-auto max-w-[1120px] space-y-10 px-4 py-6 sm:px-6 sm:py-8">
            <MakeBox />

            <section>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-[17px] font-semibold tracking-tight">Your apps</h2>
                {own.length + ready.length > 0 && <span className="text-[13px] text-fg-3">{own.length + ready.length}</span>}
                {own.length + ready.length > 0 && <span className="text-[13px] text-fg-3">Run one here, or ask for what it does in any session</span>}
              </div>
              {sorting && (
                <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
                  {cats.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className={cx('h-8 shrink-0 rounded-full border px-3.5 text-[13px] transition-colors', cat === c ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              {own.length + ready.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {own
                    .filter((a) => shown(a.category))
                    .map((a) => (
                      <YourApp key={a.id} a={a} />
                    ))}
                  {ready
                    .filter((t) => shown(t.category))
                    .map((t) => (
                      <YourApp key={`tpl:${t.id}`} a={t} ready />
                    ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line-2 px-5 py-6 text-center">
                  <Empty icon={<LayoutGrid size={20} />} title="Your apps will be here">
                    Describe one above, install a ready-made one below, or use More → Save as an app in a session’s menu.
                  </Empty>
                </div>
              )}
            </section>

            {g.recent.length > 0 && (
              <section>
                <h2 className="mb-3 text-[17px] font-semibold tracking-tight">Pick up where you left off</h2>
                <div className="overflow-hidden rounded-2xl border border-line bg-panel">
                  {g.recent.map((r) => (
                    <RecentRun key={r.id} r={r} a={faces[r.app]} />
                  ))}
                </div>
              </section>
            )}

            {removed.length > 0 && (
              <section>
                <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                  <h2 className="text-[17px] font-semibold tracking-tight">Ready-made apps to install</h2>
                  <span className="text-[13px] text-fg-3">The ones you uninstalled: install one again to have it back</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {removed.map((t) => (
                    <ReadyMade key={t.id} t={t} onInstall={() => setAdding(t)} />
                  ))}
                </div>
              </section>
            )}

            {(blocks.length > 0 || ownBlocks.length > 0) && (
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
    </div>
  );
}

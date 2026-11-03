// The Apps page (/apps): a box to describe a new one, your own apps, the latest runs, and the ready-made ones by
// kind of task. Each card says what it is made of: its steps and what they do (side by side, code, a question for
// you), what it keeps, its screen.
import { useEffect, useMemo, useState } from 'react';
import { AppWindow, ChevronRight, CodeXml, Columns2, Database, Globe, LayoutGrid, MessageCircleQuestion, Plus, Sparkles } from 'lucide-react';
import type { AppRecipe, AppRun } from '@shared/apps';
import { isActive } from '@shared/apps';
import { allSteps } from '@shared/app-manifest';
import { tr } from '../../i18n/runtime';
import { api, enc } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Badge, Button, cx, Empty, inputCls, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { appPath, runPath, useRunEvents, type Gallery } from './api';
import { AppIcon } from './AppIcon';
import { InstallFromFile } from './Install';

/** `own`: one of yours, whose name and description stay as you wrote them in every language. */
function Card({ icon, color, name, description, meta, own, onClick }: { icon: string; color: string; name: string; description: string; meta?: React.ReactNode; own?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition duration-150 hover:border-line-2 hover:bg-bg-1 active:scale-[0.99]"
    >
      <div className="flex w-full items-start gap-3">
        <AppIcon icon={icon} color={color} size={40} />
        <div className="min-w-0 flex-1">
          <div translate={own ? 'no' : undefined} className="truncate text-[14.5px] font-semibold tracking-tight">
            {name}
          </div>
          <div translate={own && description ? 'no' : undefined} className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">
            {description || 'No description'}
          </div>
        </div>
      </div>
      {meta && <div className="flex w-full min-w-0 items-center gap-2 text-[12px] text-fg-3">{meta}</div>}
    </button>
  );
}

/** What an app is made of, in a few words: its steps and what they do, what it keeps, its screen. */
function Traits({ r }: { r: Pick<AppRecipe, 'flow' | 'flows' | 'data' | 'screens' | 'fields'> }) {
  const steps = [...allSteps(r.flow?.steps ?? []), ...Object.values(r.flows ?? {}).flatMap((f) => allSteps(f.steps))];
  const side = steps.some((s) => s.do === 'parallel' || (s.do === 'repeat' && (s.atOnce ?? 1) > 1));
  const bits: { key: string; icon?: React.ReactNode; text: string }[] = [
    { key: 'n', text: steps.length ? tr(`${steps.length} step${steps.length === 1 ? '' : 's'}`) : tr(`${r.fields.length} question${r.fields.length === 1 ? '' : 's'}`) },
    ...(side ? [{ key: 'p', icon: <Columns2 size={13} />, text: tr('side by side') }] : []),
    ...(steps.some((s) => s.do === 'code') ? [{ key: 'c', icon: <CodeXml size={13} />, text: tr('code') }] : []),
    ...(steps.some((s) => s.do === 'ask') ? [{ key: 'a', icon: <MessageCircleQuestion size={13} />, text: tr('asks you') }] : []),
    ...(Object.keys(r.data ?? {}).length ? [{ key: 'd', icon: <Database size={13} />, text: tr('keeps data') }] : []),
    ...(r.screens?.main ? [{ key: 's', icon: <AppWindow size={13} />, text: tr('a screen') }] : []),
  ];
  // The count in words, the rest as icons that say what they are when pointed at: short enough for a card.
  const [count, ...flags] = bits;
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-2">
      <span className="shrink-0">{count.text}</span>
      {flags.map((b) => (
        <span key={b.key} title={b.text} aria-label={b.text} className="flex shrink-0 items-center text-fg-3">
          {b.icon}
        </span>
      ))}
    </span>
  );
}

/** A new app: described in a few words for the App builder to make, or from scratch, or from a file. */
function MakeBox() {
  const [ask, setAsk] = useState('');
  return (
    <form
      className="rounded-2xl border border-line bg-panel p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ask.trim()) go(`/?assistant=app-builder&prompt=${enc(`${tr('Make me an app: ')}${ask.trim()}`)}`);
      }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
        <Sparkles size={14} className="text-accent" />
        Describe an app, and an agent makes it
      </div>
      <div className="flex gap-2">
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Every Monday, read my saved links, sum each up, and send me the three worth reading" className={cx(inputCls, 'min-w-0 flex-1')} />
        <Button type="submit" variant="primary" disabled={!ask.trim()}>
          Make it
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-3">
        <button type="button" onClick={() => go('/apps/new')} className="flex items-center gap-1 hover:text-fg">
          <Plus size={13} /> Start from scratch
        </button>
        <InstallFromFile />
      </div>
    </form>
  );
}

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

export function GalleryPage() {
  const [g, setG] = useState<Gallery | null>(null);
  const [cat, setCat] = useState('All');
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
  const cats = useMemo(() => ['All', ...new Set((g?.templates ?? []).map((t) => t.category ?? 'Other'))], [g]);
  const icons = useMemo(() => Object.fromEntries([...(g?.apps ?? []).map((a) => [a.id, a] as const), ...(g?.templates ?? []).map((t) => [`tpl:${t.id}`, t] as const)]), [g]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Apps"
        tip="apps"
        sub="Tasks you run again and again: fill in a form, and an agent does the job"
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => go('/apps/new')}>
            New app
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!g ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="mx-auto max-w-[1080px] space-y-8 px-4 py-6 sm:px-6">
            <MakeBox />
            <section>
              <h2 className="mb-3 text-[13px] font-medium text-fg-3">Your apps</h2>
              {g.apps.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.apps.filter((a) => !a.block).map((a) => (
                    <Card
                      key={a.id}
                      icon={a.icon}
                      color={a.color}
                      name={a.name}
                      description={a.description}
                      own
                      onClick={() => go(appPath(a.id))}
                      meta={
                        <>
                          {a.flow ? (
                            <Traits r={a} />
                          ) : (
                            <>
                              <AgentIcon agent={a.agent} size={13} />
                              <span className="truncate">{agentName(a.agent, a.agent === 'acp' ? (a.acpAgent === 'console' ? 'Custom' : a.acpAgent) : undefined)}</span>
                            </>
                          )}
                          <span className="flex-1" />
                          {a.public.on && (
                            <Badge tone="info">
                              <Globe size={10} className="mr-1" />
                              Public
                            </Badge>
                          )}
                          {a.usage.runs > 0 && <span className="tnum shrink-0">{a.usage.runs} today</span>}
                        </>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-line-2 px-5 py-6 text-center">
                  <Empty icon={<LayoutGrid size={20} />} title="Make an app from any task you repeat">
                    Start from a ready-made one below and save it as your own, build one from scratch, or choose More → Save as an app in a session’s menu.
                  </Empty>
                </div>
              )}
            </section>

            {g.apps.some((a) => a.block) && (
              <section>
                <h2 className="mb-1 text-[13px] font-medium text-fg-3">Your blocks</h2>
                <p className="mb-3 text-[12.5px] text-fg-3">Apps made to be steps of others: Add a step offers them in every app’s steps.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.apps
                    .filter((a) => a.block)
                    .map((a) => (
                      <Card key={a.id} icon={a.icon} color={a.color} name={a.name} description={a.description} own onClick={() => go(appPath(a.id))} />
                    ))}
                </div>
              </section>
            )}

            {g.recent.length > 0 && (
              <section>
                <h2 className="mb-3 text-[13px] font-medium text-fg-3">Latest runs</h2>
                <div className="overflow-hidden rounded-2xl border border-line bg-panel">
                  {g.recent.map((r) => {
                    const a = icons[r.app];
                    return (
                      <button key={r.id} type="button" onClick={() => go(runPath(r.id))} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-bg-1">
                        <AppIcon icon={a?.icon ?? 'sparkles'} color={a?.color ?? 'slate'} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px]">{r.appName}</span>
                          <span className="block truncate text-[12px] text-fg-3">{Object.values(r.inputs).filter(Boolean).join(' · ') || 'No inputs'}</span>
                        </span>
                        {statusBadge(r)}
                        <span className={cx('tnum w-10 shrink-0 text-right text-[12px] text-fg-3', isActive(r.status) && 'invisible')}>{timeAgo(r.endedAt ?? r.createdAt)}</span>
                        <ChevronRight size={15} className="shrink-0 text-fg-3" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="text-[13px] font-medium text-fg-3">Ready-made</h2>
                <div className="flex flex-1 gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
                  {cats.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className={cx('h-7 shrink-0 rounded-full px-3 text-[12.5px] transition-colors', cat === c ? 'bg-fg text-bg' : 'bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg')}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.templates
                  .filter((t) => cat === 'All' || (t.category ?? 'Other') === cat)
                  .map((t) => (
                    <Card
                      key={t.id}
                      icon={t.icon}
                      color={t.color}
                      name={t.name}
                      description={t.description}
                      onClick={() => go(appPath(`tpl:${t.id}`))}
                      meta={
                        <>
                          <span className="shrink-0">{t.category}</span>
                          <span className="flex-1" />
                          <Traits r={t} />
                        </>
                      }
                    />
                  ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

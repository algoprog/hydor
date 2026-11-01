// The Templates page (/apps): your own templates, the latest runs, and the ready-made ones by kind of task.
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Globe, LayoutGrid, Plus } from 'lucide-react';
import type { AppRun } from '@shared/apps';
import { isActive } from '@shared/apps';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Badge, Button, cx, Empty, Throbber } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { appPath, runPath, useRunEvents, type Gallery } from './api';
import { AppIcon } from './AppIcon';

function Card({ icon, color, name, description, meta, onClick }: { icon: string; color: string; name: string; description: string; meta?: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col gap-3 rounded-2xl border border-line bg-panel p-4 text-left transition duration-150 hover:border-line-2 hover:bg-bg-1 active:scale-[0.99]"
    >
      <div className="flex w-full items-start gap-3">
        <AppIcon icon={icon} color={color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold tracking-tight">{name}</div>
          <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{description || 'No description'}</div>
        </div>
      </div>
      {meta && <div className="flex w-full min-w-0 items-center gap-2 text-[12px] text-fg-3">{meta}</div>}
    </button>
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
        title="Templates"
        sub="Tasks you run again and again: fill in a form, and an agent does the job"
        actions={
          <Button size="sm" variant="primary" icon={<Plus size={15} />} onClick={() => go('/apps/new')}>
            New template
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
            <section>
              <h2 className="mb-3 text-[13px] font-medium text-fg-3">Your templates</h2>
              {g.apps.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {g.apps.map((a) => (
                    <Card
                      key={a.id}
                      icon={a.icon}
                      color={a.color}
                      name={a.name}
                      description={a.description}
                      onClick={() => go(appPath(a.id))}
                      meta={
                        <>
                          <AgentIcon agent={a.agent} size={13} />
                          <span className="truncate">{agentName(a.agent, a.agent === 'acp' ? (a.acpAgent === 'console' ? 'Custom' : a.acpAgent) : undefined)}</span>
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
                  <Empty icon={<LayoutGrid size={20} />} title="Make a template from any task you repeat">
                    Start from a ready-made one below and save it as your own, build one from scratch, or choose More → Save as template in a session’s menu.
                  </Empty>
                </div>
              )}
            </section>

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
                          <span>{t.category}</span>
                          <span className="flex-1" />
                          <span className="shrink-0">
                            {t.fields.length} question{t.fields.length === 1 ? '' : 's'}
                          </span>
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

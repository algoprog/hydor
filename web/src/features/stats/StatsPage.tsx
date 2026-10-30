import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, CircleDollarSign, FileDiff, FolderGit2, Gauge, MessageSquare, Minus, Plus, SquareTerminal, Table2, TextCursorInput, Users } from 'lucide-react';
import type { StatsGranularity, StatsResponse, StatsTotals } from '@shared/types';
import { api } from '../../lib/api';
import { compact, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Columns, DivergingColumns, Legend, StackedColumns } from '../../components/charts';
import { cx, Dots, Segmented } from '../../components/ui';
import { ModelPricesDialog } from './ModelPrices';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const WINDOW: Record<StatsGranularity, string> = { day: 'Last 30 days', week: 'Last 26 weeks', month: 'Last 12 months', year: 'By year' };
const PREV: Record<StatsGranularity, string> = { day: 'previous 30 days', week: 'previous 26 weeks', month: 'previous 12 months', year: '' };

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return null;
  const d = (cur - prev) / prev;
  if (!Number.isFinite(d)) return null;
  const Icon = d > 0.005 ? ArrowUp : d < -0.005 ? ArrowDown : Minus;
  // Activity has no good or bad direction, so the change stays neutral.
  return (
    <span className="inline-flex items-center gap-0.5 text-[11.5px] text-fg-3">
      <Icon size={11} />
      {Math.abs(d) >= 10 ? `${Math.round(d)}×` : `${Math.round(Math.abs(d) * 100)}%`}
    </span>
  );
}

function Tile({ icon, label, value, sub, cur, prev }: { icon: React.ReactNode; label: string; value: string; sub?: string; cur: number; prev?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="flex items-center gap-1.5 text-[12px] text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[22px] leading-tight font-semibold tracking-tight">{value}</span>
        {prev != null && <Delta cur={cur} prev={prev} />}
      </div>
      {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
    </div>
  );
}

function Card({ title, sub, children, className }: { title: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-2xl border border-line bg-panel p-4', className)}>
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && <div className="text-[12px] text-fg-3">{sub}</div>}
      </header>
      {children}
    </section>
  );
}

const num = (n: number) => n.toLocaleString();

/** Average output throughput (tokens/sec) over a bucket's reply-generation time. */
const tps = (t: { tokensOut: number; genMs: number }) => (t.genMs > 0 ? Math.round(t.tokensOut / (t.genMs / 1000)) : 0);

function totalsRow(t: StatsTotals) {
  return [t.sessions, t.prompts, t.commands, t.fileEdits, t.linesAdded, t.linesRemoved, t.tokensIn, t.tokensCached, t.tokensOut, tps(t)];
}

const COLS = ['Sessions', 'Prompts', 'Commands', 'File edits', 'Lines +', 'Lines −', 'Input', 'Cached input', 'Output', 'Tok/s'];

/** Daily to yearly activity: filters, totals, charts and tables. Scrolls with its page. */
export function StatsBody() {
  const home = useApp((s) => s.boot?.home);
  const [g, setG] = useState<StatsGranularity>(() => {
    try {
      return (localStorage.getItem('wa.stats.g') as StatsGranularity) || 'day';
    } catch {
      return 'day';
    }
  });
  const [agent, setAgent] = useState<'all' | 'claude' | 'codex'>('all');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem('wa.stats.g', g);
    } catch {}
    setLoading(true);
    api<StatsResponse>(`/api/stats?granularity=${g}&agent=${agent}&tz=${encodeURIComponent(TZ)}`)
      .then(setData)
      .catch(toastError)
      .finally(() => setLoading(false));
  }, [g, agent, rev]);

  const t = data?.totals;
  const p = data?.previous;
  const hasPrev = g !== 'year' && !!p && (p.prompts > 0 || p.tokensOut > 0);
  const b = data?.buckets ?? [];

  return (
    <div>
      <ModelPricesDialog open={pricing} models={data?.byModel ?? []} onClose={() => setPricing(false)} onSaved={() => setRev((r) => r + 1)} />
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Segmented<StatsGranularity>
            value={g}
            onChange={setG}
            options={[
              { value: 'day', label: 'Daily' },
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
              { value: 'year', label: 'Yearly' },
            ]}
          />
          <Segmented
            value={agent}
            onChange={setAgent}
            options={[
              { value: 'all', label: 'All' },
              { value: 'claude', label: 'Claude', icon: <AgentIcon agent="claude" size={12} /> },
              { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={12} /> },
            ]}
          />
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Charts', icon: <BarChart3 size={13} /> },
              { value: 'table', label: 'Table', icon: <Table2 size={13} /> },
            ]}
          />
          <span className="ml-auto text-[12px] text-fg-3">
            {WINDOW[g]}
            {hasPrev && ` · arrows compare with the ${PREV[g]}`} · {TZ}
          </span>
        </div>

        {!data ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Dots />
          </div>
        ) : (
          <div className={cx('space-y-4 transition-opacity', loading && 'opacity-60')}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile icon={<Plus size={13} />} label="Lines added" value={compact(t!.linesAdded)} cur={t!.linesAdded} prev={hasPrev ? p!.linesAdded : undefined} />
              <Tile icon={<Minus size={13} />} label="Lines removed" value={compact(t!.linesRemoved)} cur={t!.linesRemoved} prev={hasPrev ? p!.linesRemoved : undefined} />
              <Tile
                icon={<TextCursorInput size={13} />}
                label="Input tokens"
                value={compact(t!.tokensIn + t!.tokensCached)}
                sub={`${compact(t!.tokensIn)} fresh · ${compact(t!.tokensCached)} cached`}
                cur={t!.tokensIn + t!.tokensCached}
                prev={hasPrev ? p!.tokensIn + p!.tokensCached : undefined}
              />
              <Tile icon={<MessageSquare size={13} />} label="Output tokens" value={compact(t!.tokensOut)} cur={t!.tokensOut} prev={hasPrev ? p!.tokensOut : undefined} />
              <Tile icon={<Gauge size={13} />} label="Output speed" value={`${num(tps(t!))} tok/s`} sub="avg over reply generation" cur={tps(t!)} prev={hasPrev ? tps(p!) : undefined} />
              <Tile icon={<CircleDollarSign size={13} />} label="API cost (est.)" value={dollars(t!.cost ?? 0)} sub="the same tokens at API prices" cur={t!.cost ?? 0} prev={hasPrev ? (p!.cost ?? 0) : undefined} />
              <Tile icon={<TextCursorInput size={13} />} label="Prompts" value={compact(t!.prompts)} sub={`${compact(t!.turns)} turns`} cur={t!.prompts} prev={hasPrev ? p!.prompts : undefined} />
              <Tile icon={<Users size={13} />} label="Sessions" value={compact(t!.sessions)} cur={t!.sessions} prev={hasPrev ? p!.sessions : undefined} />
              <Tile icon={<SquareTerminal size={13} />} label="Commands" value={compact(t!.commands)} sub={`${compact(t!.toolCalls)} tool calls`} cur={t!.commands} prev={hasPrev ? p!.commands : undefined} />
              <Tile icon={<FileDiff size={13} />} label="File edits" value={compact(t!.fileEdits)} cur={t!.fileEdits} prev={hasPrev ? p!.fileEdits : undefined} />
            </div>

            {view === 'table' ? (
              <Card title="Per period" sub={`${b.length} periods, newest first`}>
                <div className="overflow-x-auto">
                  <table className="tnum w-full text-[12.5px]">
                    <thead>
                      <tr className="text-left text-[11px] text-fg-3">
                        <th className="py-1.5 pr-4 font-medium">Period</th>
                        {COLS.map((c) => (
                          <th key={c} className="py-1.5 pr-4 text-right font-medium whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...b].reverse().map((r) => (
                        <tr key={r.key} className="border-t border-line">
                          <td className="py-1.5 pr-4 whitespace-nowrap">{r.label}</td>
                          {totalsRow(r).map((v, i) => (
                            <td key={i} className={cx('py-1.5 pr-4 text-right', i === 4 && v ? 'text-add' : i === 5 && v ? 'text-del' : !v && 'text-fg-3')}>
                              {num(v)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t border-line-2 font-semibold">
                        <td className="py-1.5 pr-4">Total</td>
                        {totalsRow(t!).map((v, i) => (
                          <td key={i} className="py-1.5 pr-4 text-right">
                            {num(v)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <>
                <Card
                  title="Lines changed"
                  sub={
                    <Legend
                      shape="rect"
                      items={[
                        { label: 'Added', color: 'var(--add)', value: `+${compact(t!.linesAdded)}` },
                        { label: 'Removed', color: 'var(--del)', value: `−${compact(t!.linesRemoved)}` },
                      ]}
                    />
                  }
                >
                  <DivergingColumns
                    data={b.map((x) => ({ key: x.key, label: x.label, up: x.linesAdded, down: x.linesRemoved }))}
                    format={(v) => compact(v)}
                    up={{ label: 'added', color: 'var(--add)' }}
                    down={{ label: 'removed', color: 'var(--del)' }}
                  />
                </Card>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Card
                    title="Input tokens"
                    sub={
                      <Legend
                        shape="rect"
                        items={[
                          { label: 'Fresh', color: 'var(--viz-1)', value: compact(t!.tokensIn) },
                          { label: 'Cached', color: 'var(--viz-2)', value: compact(t!.tokensCached) },
                        ]}
                      />
                    }
                  >
                    <StackedColumns
                      data={b.map((x) => ({ key: x.key, label: x.label, values: [x.tokensIn, x.tokensCached] }))}
                      series={[
                        { label: 'fresh', color: 'var(--viz-1)' },
                        { label: 'cached', color: 'var(--viz-2)' },
                      ]}
                      format={(v) => compact(v)}
                    />
                  </Card>
                  <Card title="Output tokens" sub={compact(t!.tokensOut)}>
                    <Columns label="Output tokens" data={b.map((x) => ({ key: x.key, value: x.tokensOut, label: x.label }))} format={(v) => compact(v)} height={170} />
                  </Card>
                </div>
                <Card title="Output throughput" sub={`${num(tps(t!))} tok/s avg`}>
                  <Columns label="Output throughput (tokens/sec)" data={b.map((x) => ({ key: x.key, value: tps(x), label: x.label }))} format={(v) => `${num(v)} tok/s`} axisFormat={(v) => num(v)} height={150} />
                </Card>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {(
                    [
                      ['Prompts', 'prompts'],
                      ['Sessions', 'sessions'],
                      ['Commands', 'commands'],
                      ['File edits', 'fileEdits'],
                    ] as const
                  ).map(([label, k]) => (
                    <Card key={k} title={label} sub={compact(t![k])}>
                      <Columns label={label} data={b.map((x) => ({ key: x.key, value: x[k], label: x.label }))} format={(v) => compact(v)} height={120} />
                    </Card>
                  ))}
                </div>
              </>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="By agent">
                <table className="tnum w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] text-fg-3">
                      <th className="py-1.5 pr-3 font-medium">Agent</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Sessions</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Prompts</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Lines</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Input</th>
                      <th className="py-1.5 text-right font-medium">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(['claude', 'codex'] as const).map((a) => {
                      const v = data.byAgent[a];
                      return (
                        <tr key={a} className="border-t border-line">
                          <td className="py-1.5 pr-3">
                            <span className="flex items-center gap-1.5">
                              <AgentIcon agent={a} size={13} /> {a === 'claude' ? 'Claude Code' : 'Codex'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">{num(v.sessions)}</td>
                          <td className="py-1.5 pr-3 text-right">{num(v.prompts)}</td>
                          <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                            <span className="text-add">+{compact(v.linesAdded)}</span> <span className="text-del">−{compact(v.linesRemoved)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">{compact(v.tokensIn + v.tokensCached)}</td>
                          <td className="py-1.5 text-right">{compact(v.tokensOut)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
              <Card title="Top projects" sub="by lines changed">
                <table className="tnum w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] text-fg-3">
                      <th className="py-1.5 pr-3 font-medium">Folder</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Sessions</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Lines</th>
                      <th className="py-1.5 text-right font-medium">Output</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.projects.slice(0, 8).map((pr) => (
                      <tr key={pr.cwd} className="border-t border-line">
                        <td className="max-w-[260px] truncate py-1.5 pr-3 font-mono text-[12px]" title={pr.cwd}>
                          <FolderGit2 size={12} className="mr-1.5 inline text-fg-3" />
                          {tildify(pr.cwd, home)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{num(pr.sessions)}</td>
                        <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                          <span className="text-add">+{compact(pr.linesAdded)}</span> <span className="text-del">−{compact(pr.linesRemoved)}</span>
                        </td>
                        <td className="py-1.5 text-right">{compact(pr.tokensOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <Card
                title="By model"
                sub={
                  <button onClick={() => setPricing(true)} className="text-accent hover:underline">
                    Model prices
                  </button>
                }
              >
                <table className="tnum w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11px] text-fg-3">
                      <th className="py-1.5 pr-3 font-medium">Model</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Input</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Cached</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Output</th>
                      <th className="py-1.5 text-right font-medium">API cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.slice(0, 12).map((m) => (
                      <tr key={m.model} className="border-t border-line">
                        <td className="max-w-[220px] truncate py-1.5 pr-3 font-mono text-[12px]" title={m.price ? `$${m.price.input}/M in · $${m.price.output}/M out (${m.price.source === 'custom' ? 'your price' : 'public price table'})` : 'No price known'}>
                          {m.model}
                        </td>
                        <td className="py-1.5 pr-3 text-right">{compact(m.tokensIn)}</td>
                        <td className="py-1.5 pr-3 text-right">{compact(m.tokensCached)}</td>
                        <td className="py-1.5 pr-3 text-right">{compact(m.tokensOut)}</td>
                        <td className="py-1.5 text-right">
                          {m.cost != null ? (
                            dollars(m.cost)
                          ) : (
                            <button onClick={() => setPricing(true)} className="text-fg-3 hover:text-accent">
                              set a price
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** One line for the home page: today's numbers. */
/** "$0.42", "$12.30", "$1,284". */
function dollars(v: number): string {
  return v >= 1000 ? `$${Math.round(v).toLocaleString()}` : `$${v.toFixed(2)}`;
}

export function TodayStrip() {
  const [t, setT] = useState<StatsTotals | null>(null);
  useEffect(() => {
    api<StatsResponse>(`/api/stats?granularity=day&count=1&tz=${encodeURIComponent(TZ)}`)
      .then((r) => setT(r.totals))
      .catch(() => {});
  }, []);
  if (!t || (!t.prompts && !t.tokensOut)) return null;
  return (
    <button onClick={() => go('/stats')} title="Open stats" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md text-left text-[12.5px] text-fg-2 hover:text-fg">
      <span className="font-medium text-fg">Today</span>
      <span>
        <span className="text-add">+{compact(t.linesAdded)}</span> <span className="text-del">−{compact(t.linesRemoved)}</span> lines
      </span>
      <span>{compact(t.tokensIn + t.tokensCached)} in</span>
      <span>{compact(t.tokensOut)} out</span>
      <span>{t.prompts} prompts</span>
      <span>{t.sessions} sessions</span>
    </button>
  );
}

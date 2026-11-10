import { useEffect } from 'react';
import { AlertTriangle, Coins, TrendingUp } from 'lucide-react';
import type { AgentAccount, AgentUsage, UsageWindow } from '@shared/types';
import { ago, compact, pct, untilText } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp, useUsage } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Columns, Meter, severityColor } from '../../components/charts';
import { Button, cx, Throbber, Tabs } from '../../components/ui';
import { SystemHeader } from '../system/SystemHeader';
import { StatsBody } from '../stats/StatsPage';
import { ArenaBoard } from '../arena/ArenaBoard';
import { LimitBanner, ResetList } from './LimitReset';
import { RefreshIcon } from '../../components/RefreshIcon';
import { LOCALE } from '../../i18n/locale';

function WindowRow({ w }: { w: UsageWindow }) {
  const left = w.usedPercent == null ? null : Math.max(0, 100 - w.usedPercent);
  const critical = (w.usedPercent ?? 0) >= 90;
  return (
    <div className="py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{w.label}</span>
        {critical && <AlertTriangle size={13} className="shrink-0 self-center text-[var(--status-critical)]" aria-label="Nearly used up" />}
        <span className="shrink-0 text-[15px] font-semibold">{pct(w.usedPercent)}</span>
        <span className="shrink-0 text-[12px] text-fg-3">used</span>
      </div>
      <Meter percent={w.usedPercent} />
      <div className="mt-1 flex justify-between gap-3 text-[11.5px] text-fg-3">
        <span>{left == null ? '' : `${pct(left)} left`}</span>
        <span title={w.resetsAt ? new Date(w.resetsAt).toLocaleString(LOCALE) : ''}>{w.resetsAt ? `resets ${untilText(w.resetsAt)}` : ''}</span>
      </div>
    </div>
  );
}

function Card({ u, agent, account }: { u: AgentUsage | null; agent: 'claude' | 'codex'; account?: AgentAccount }) {
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <header className="mb-3 flex items-center gap-2.5">
        <AgentIcon agent={agent} size={20} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">
            {agentName(agent)}
            {account && <span className="font-normal text-fg-3"> · {account.name}</span>}
          </div>
          <div className="truncate text-[12px] text-fg-3">
            {u?.account?.email ?? '—'}
            {u?.account?.plan && <span> · {u.account.plan}</span>}
          </div>
        </div>
        {u && <span className="shrink-0 text-[12px] text-fg-3">{ago(u.fetchedAt)}</span>}
      </header>
      {!u ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber />
        </div>
      ) : !u.ok && !u.windows.length ? (
        <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2.5 text-[12.5px]">
          <div className="text-err">{u.error ?? 'Usage is unavailable'}</div>
          <button className="mt-1 text-accent hover:underline" onClick={() => go('/settings')}>
            Check the sign-in in Settings
          </button>
        </div>
      ) : (
        <>
          <LimitBanner agent={agent} account={account?.id} className="mb-2" />
          <div className="divide-y divide-line">
            {u.windows.map((w) => (
              <WindowRow key={w.id} w={w} />
            ))}
            {!u.windows.length &&
              (u.account ? (
                <div className="py-3 text-[12.5px] text-fg-3">No usage limits reported for this plan.</div>
              ) : (
                <div className="py-3 text-[12.5px] text-fg-3">
                  Not signed in.{' '}
                  <button className="text-accent hover:underline" onClick={() => go('/settings?s=accounts')}>
                    Sign in in Settings
                  </button>
                </div>
              ))}
          </div>
          {u.extra && (
            <div className="mt-3 rounded-lg bg-bg-1 px-3 py-2 text-[12.5px]">
              <div className="flex items-center gap-2">
                <TrendingUp size={13} className="text-fg-3" />
                <span className="font-medium">Extra usage</span>
                <span className="ml-auto text-fg-3">{u.extra.enabled ? 'On' : 'Off'}</span>
              </div>
              {u.extra.enabled && u.extra.monthlyLimit != null && (
                <div className="mt-1.5">
                  <Meter percent={u.extra.utilization ?? (u.extra.used && u.extra.monthlyLimit ? (u.extra.used / u.extra.monthlyLimit) * 100 : 0)} />
                  <div className="mt-1 text-[11.5px] text-fg-3">
                    {u.extra.used ?? 0} of {u.extra.monthlyLimit} {u.extra.currency ?? ''} this month
                  </div>
                </div>
              )}
              {u.extra.note && <div className="mt-0.5 text-[11.5px] text-fg-3">{u.extra.note}</div>}
            </div>
          )}
          {u.credits && (
            <div className="mt-3 rounded-lg bg-bg-1 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                <Coins size={12} /> Credits
              </div>
              <div className="mt-0.5 text-[17px] font-semibold">{u.credits.unlimited ? 'Unlimited' : u.credits.balance ? compact(Number(u.credits.balance), 1) : '0'}</div>
            </div>
          )}
          <ResetList u={u} account={account?.id} />
          {u.breakdown && u.breakdown.some((b) => b.percent > 0) && (
            <div className="mt-4">
              <div className="mb-1.5 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">This week by surface</div>
              {u.breakdown.map((b) => (
                <div key={b.label} className="flex items-center gap-2 py-1 text-[12.5px]">
                  <span className="w-24 shrink-0 truncate text-fg-2">{b.label}</span>
                  <Meter percent={b.percent} color="var(--viz-1)" className="flex-1" height={5} />
                  <span className="tnum w-10 shrink-0 text-right">{pct(b.percent)}</span>
                </div>
              ))}
            </div>
          )}
          {u.daily && u.daily.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Tokens per day</span>
                {u.lifetimeTokens ? <span className="text-[11.5px] text-fg-3">{compact(u.lifetimeTokens)} lifetime</span> : null}
              </div>
              <Columns
                label="Tokens per day"
                data={u.daily.slice(-30).map((d) => ({ key: d.date, value: d.tokens, label: new Date(d.date + 'T00:00:00').toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }) }))}
                format={(v) => compact(v, 0)}
                height={130}
              />
            </div>
          )}
          {!u.ok && u.error && <div className="mt-2 text-[11.5px] text-warn">Showing the last known numbers: {u.error}</div>}
        </>
      )}
    </section>
  );
}

const SUBS = { limits: 'How much of each plan is left, and when it resets', activity: 'Lines changed, tokens and sessions over time', arena: 'Which models win on your own tasks' };

export function UsagePage({ tab }: { tab: 'limits' | 'activity' | 'arena' }) {
  const { claude, codex, accounts: usageByAccount, loading, refresh } = useUsage();
  const added = useApp((s) => s.boot?.accounts) ?? [];
  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* A tab of System since 0.37.0 (its place in the sidebar went to Agents); Limits, Activity and the Arena are its own. */}
      <SystemHeader
        tab="usage"
        sub={SUBS[tab]}
        actions={
          tab === 'limits' && (
            <Button size="sm" variant="ghost" icon={<RefreshIcon size={14} busy={loading} />} onClick={() => refresh(true)} disabled={loading}>
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )
        }
      />
      <div className="shrink-0 border-b border-line px-2 sm:px-4">
        <Tabs
          value={tab}
          onChange={(t) => go(t === 'activity' ? '/stats' : t === 'arena' ? '/arena' : '/usage', true)}
          options={[
            { value: 'limits', label: 'Limits' },
            { value: 'activity', label: 'Activity' },
            { value: 'arena', label: 'Arena' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'limits' ? (
          <div className="mx-auto max-w-[1040px] px-3 py-4 sm:px-6 sm:py-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Card u={claude} agent="claude" />
              <Card u={codex} agent="codex" />
              {added.map((a) => (
                <Card key={a.id} u={usageByAccount[a.id] ?? null} agent={a.agent === 'codex' ? 'codex' : 'claude'} account={a} />
              ))}
            </div>
          </div>
        ) : tab === 'arena' ? (
          <ArenaBoard />
        ) : (
          <StatsBody />
        )}
      </div>
    </div>
  );
}

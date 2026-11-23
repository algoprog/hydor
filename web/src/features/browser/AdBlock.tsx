// The ad blocker in your own browser: the shield in the address bar (how many ads and trackers were blocked on this
// page, and a popover with what they were, a switch for this site, and ways to the statistics and the settings), and
// the statistics panel (what was blocked in all, by day, by host and by site). The desktop app's blocker counts; this
// page only shows it, so everything here waits for the app to say (an older app says nothing: the shield still
// switches the blocker and the site).
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Ban, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { AdblockPage, AdblockStats as Stats, BlockedKind, BrowserTab } from '@shared/browser';
import { bytes, compact } from '../../lib/format';
import { useCountUp } from '../../lib/motion';
import { Badge, Button, cx, Popover, Switch, Throbber, useConfirm } from '../../components/ui';
import { Legend, StackedColumns, useInterval } from '../../components/charts';
import { LOCALE } from '../../i18n/locale';
import { adblockCounts, desktopBrowser, loadAdblockPage, loadAdblockStats, navigate, resetAdblockStats, savePrefs, usePrefs, useAdblockStats, useTabState } from './browsing';
import { Note, Panel } from './Panel';
import { hostOf } from './store';

/** Where the shield's popover sends you: the Browser page opens the settings at Ads, or the statistics panel (a count, so each press does it). */
export const useAdBlockUI = create<{ settings: number; stats: number }>(() => ({
  settings: 0,
  stats: 0,
}));
export const openAdBlockSettings = () => useAdBlockUI.setState((s) => ({ settings: s.settings + 1 }));
export const openAdBlockStats = () => useAdBlockUI.setState((s) => ({ stats: s.stats + 1 }));

const whole = (n: number) => n.toLocaleString(LOCALE);
/** A day as "3 Nov" in the app's language. */
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
/** A date with its year ("3 Nov 2026"). */
export const sinceLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const adsText = (n: number) => (n === 1 ? '1 ad' : `${whole(n)} ads`);
const trackersText = (n: number) => (n === 1 ? '1 tracker' : `${whole(n)} trackers`);
const KIND: Record<BlockedKind, string> = { ad: 'Ad', tracker: 'Tracker' };

/** The shield in the address bar: lit with this page's count while the blocker works on the site, off when ads are allowed here or the blocker is off. Nothing on a page that is not on the web. */
export function AdBlockButton({ tab }: { tab: BrowserTab }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const prefs = usePrefs((s) => s.prefs);
  const blocked = useTabState((s) => s.byTab[tab.id]?.blocked) ?? 0;
  if (!prefs || !desktopBrowser() || !/^https?:/i.test(tab.url)) return null;
  const on = prefs.adblock;
  const allowed = on && prefs.allowAds.includes(hostOf(tab.url));
  const working = on && !allowed;
  const count = blocked > 999 ? '999+' : whole(blocked);
  const label = !on ? 'The ad blocker is off' : allowed ? 'Ads are allowed on this site' : `Ad blocker: ${count} blocked on this page`;
  return (
    <>
      <button
        ref={ref}
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'ml-0.5 flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-fg-3 hover:bg-bg-3 hover:text-fg',
          !on && 'opacity-60 hover:opacity-100',
          open && 'bg-bg-3 text-fg',
        )}
      >
        {working ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
        {working && blocked > 0 && <span className="tnum text-[11.5px] leading-none">{count}</span>}
      </button>
      <AdBlockPopover anchor={ref} open={open} onClose={() => setOpen(false)} tab={tab} />
    </>
  );
}

/** What the blocker did on this page, a switch for this site, and the way to the statistics and the settings. */
function AdBlockPopover({ anchor, open, onClose, tab }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; tab: BrowserTab }) {
  const prefs = usePrefs((s) => s.prefs);
  const blocked = useTabState((s) => s.byTab[tab.id]?.blocked) ?? 0;
  const [page, setPage] = useState<AdblockPage | null>(null);
  const host = hostOf(tab.url);
  const on = !!prefs?.adblock;
  const allowed = !!prefs?.allowAds.includes(host);
  // The details are read when it opens and again whenever the page's count moves; those of the last read stay meanwhile.
  useEffect(() => {
    if (!open) return setPage(null);
    let live = true;
    void loadAdblockPage(tab.id).then((p) => live && setPage(p));
    return () => {
      live = false;
    };
  }, [open, tab.id, tab.url, blocked]);
  const setAds = async (block: boolean) => {
    if (!prefs) return;
    const rest = prefs.allowAds.filter((h) => h !== host);
    if (await savePrefs({ allowAds: block ? rest : [...rest, host] })) {
      onClose();
      // The page asks for its ads again, with the new answer.
      void navigate('reload');
    }
  };
  const go = (to: () => void) => () => {
    onClose();
    to();
  };
  const total = page ? page.ads + page.trackers : blocked;
  const shown = page?.hosts.slice(0, 6) ?? [];
  const more = (page?.hosts.length ?? 0) - shown.length;
  const switchRow = (
    <div className="flex items-center gap-2.5 border-t border-line pt-2.5 text-[13px] text-fg-2">
      <Ban size={15} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1">Block ads on this site</span>
      <Switch on={!allowed} label="Block ads on this site" onChange={(v) => void setAds(v)} />
    </div>
  );
  // Turning it on here means this page too: it loads again, without its ads.
  const turnOn = async () => {
    if (await savePrefs({ adblock: true })) {
      onClose();
      void navigate('reload');
    }
  };
  // The buttons' words line up with the text above them (a ghost button's padding is its own).
  const footer = (
    <div className="border-t border-line pt-2">
      <div className="-ml-2 flex items-center gap-1">
        {on && adblockCounts() && (
          <Button size="sm" variant="ghost" onClick={go(openAdBlockStats)}>
            Statistics
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={go(openAdBlockSettings)}>
          Settings
        </Button>
      </div>
    </div>
  );
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={320} title={host}>
      <div className="space-y-2.5 p-2.5">
        {!on ? (
          <>
            <div className="flex items-start gap-2.5">
              <ShieldOff size={16} className="mt-0.5 shrink-0 text-fg-3" />
              <div className="min-w-0">
                <div className="text-[14px] font-medium">The ad blocker is off</div>
                <div className="text-[12.5px] leading-snug text-fg-3">Ads and trackers are not blocked on any site.</div>
              </div>
            </div>
            <Button size="sm" variant="primary" className="w-full" onClick={() => void turnOn()}>
              Turn on
            </Button>
          </>
        ) : allowed ? (
          <div className="flex items-start gap-2.5">
            <ShieldOff size={16} className="mt-0.5 shrink-0 text-fg-3" />
            <div className="min-w-0">
              <div className="text-[14px] font-medium">Ads are allowed on this site</div>
              <div className="text-[12.5px] leading-snug text-fg-3">Nothing is blocked on it until you turn this back on.</div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="tnum text-[22px] leading-tight font-semibold tracking-tight">{whole(total)}</span>
                <span className="text-[13px] text-fg-2">blocked on this page</span>
              </div>
              {page && total > 0 && (
                <div className="tnum text-[12.5px] text-fg-3">
                  {adsText(page.ads)} · {trackersText(page.trackers)}
                </div>
              )}
            </div>
            {shown.length > 0 && (
              <div className="space-y-0.5">
                {shown.map((h) => (
                  <div key={`${h.kind}:${h.host}`} className="flex h-6 items-center gap-2 text-[12.5px]">
                    <span translate="no" className="min-w-0 flex-1 truncate text-fg-2">
                      {h.host}
                    </span>
                    <Badge>{KIND[h.kind]}</Badge>
                    <span className="tnum w-9 shrink-0 text-right text-fg-3">{whole(h.count)}</span>
                  </div>
                ))}
                {more > 0 && <div className="pt-0.5 text-[12px] text-fg-3">{`and ${whole(more)} more`}</div>}
              </div>
            )}
            {page && page.siteTotal > 0 && <div className="tnum text-[12.5px] text-fg-3">{`On this site: ${whole(page.siteTotal)} since ${sinceLabel(page.since)}`}</div>}
          </>
        )}
        {on && switchRow}
        {footer}
      </div>
    </Popover>
  );
}

/** A number in a tile of the statistics, counting up to it when it arrives or changes (as the Statistics page's tiles do). */
function Tile({ label, value, format, title, i }: { label: string; value: number; format: (n: number) => React.ReactNode; title?: string; i: number }) {
  const shown = useCountUp(value);
  return (
    <div title={title} className="min-w-0 rounded-2xl border border-line bg-panel px-4 py-3" style={{ '--i': i } as React.CSSProperties}>
      <div className="truncate text-[12px] text-fg-3">{label}</div>
      <div className="tnum mt-1 truncate text-[22px] leading-tight font-semibold tracking-tight">{format(shown)}</div>
    </div>
  );
}

/** A box with a small title, for a chart or a list. */
function Card({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {sub && <div className="text-[12px] text-fg-3">{sub}</div>}
      </header>
      {children}
    </section>
  );
}

/** The panel of what the ad blocker blocked in all: totals, the last 30 days, and the hosts and sites with the most. */
export function AdBlockStatsPanel({ onClose }: { onClose: () => void }) {
  const stats = useAdblockStats((s) => s.stats);
  const loaded = useAdblockStats((s) => s.loaded);
  const here = adblockCounts();
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => {
    if (here) void loadAdblockStats();
  }, [here]);
  useInterval(() => void loadAdblockStats(), 5000, here);
  const reset = async () => {
    const ok = await confirm({
      title: 'Reset statistics',
      body: 'Forget what the ad blocker counted so far? It starts counting again from now.',
      confirm: 'Reset',
      danger: true,
    });
    if (ok) await resetAdblockStats();
  };
  let body: React.ReactNode;
  if (!here) body = <Note>Update the desktop app to see the ad blocker’s statistics.</Note>;
  else if (!loaded)
    body = (
      <div className="flex justify-center py-10">
        <Throbber size={24} />
      </div>
    );
  else if (!stats || stats.total.ads + stats.total.trackers === 0) body = <Note>Nothing blocked yet. Ads and trackers blocked in your own browsing are counted here.</Note>;
  else body = <StatsBody stats={stats} />;
  return (
    <Panel title="Ad blocker" onClose={onClose}>
      {body}
      <div className="flex items-center gap-2 border-t border-line p-3">
        {here && !!stats && (
          <Button size="sm" variant="secondary" icon={<Trash2 size={14} />} onClick={() => void reset()}>
            Reset statistics
          </Button>
        )}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={openAdBlockSettings}>
          Settings
        </Button>
      </div>
      {confirmNode}
    </Panel>
  );
}

function StatsBody({ stats }: { stats: Stats }) {
  const total = stats.total.ads + stats.total.trackers;
  // Each day as "3 Nov"; the days are local dates (YYYY-MM-DD).
  const days = stats.days.map((d) => {
    const [y, m, n] = d.day.split('-').map(Number);
    return {
      key: d.day,
      label: dayLabel(new Date(y, m - 1, n).getTime()),
      values: [d.ads, d.trackers],
    };
  });
  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Tile i={0} label="Blocked" value={total} format={(n) => whole(Math.round(n))} />
        <Tile i={1} label="Ads" value={stats.total.ads} format={(n) => whole(Math.round(n))} />
        <Tile i={2} label="Trackers" value={stats.total.trackers} format={(n) => whole(Math.round(n))} />
        <Tile
          i={3}
          label="Data saved"
          value={stats.bytes}
          title="An estimate from the usual size of what was blocked"
          format={(n) => (
            <>
              <span className="mr-1 text-[13px] font-normal text-fg-3">about</span>
              {bytes(n)}
            </>
          )}
        />
      </div>
      <div className="tnum px-1 text-[12.5px] text-fg-3">{`Since ${sinceLabel(stats.since)}`}</div>
      <Card
        title="Last 30 days"
        sub={
          <Legend
            shape="rect"
            items={[
              {
                label: 'Ads',
                color: 'var(--viz-1)',
                value: compact(days.reduce((a, d) => a + d.values[0], 0)),
              },
              {
                label: 'Trackers',
                color: 'var(--viz-2)',
                value: compact(days.reduce((a, d) => a + d.values[1], 0)),
              },
            ]}
          />
        }
      >
        <StackedColumns
          data={days}
          series={[
            { label: 'ads', color: 'var(--viz-1)' },
            { label: 'trackers', color: 'var(--viz-2)' },
          ]}
          format={(v) => compact(v)}
        />
      </Card>
      {stats.hosts.length > 0 && (
        <Card title="Blocked most">
          <ul className="space-y-0.5">
            {stats.hosts.slice(0, 10).map((h) => (
              <li key={`${h.kind}:${h.host}`} className="flex h-7 items-center gap-2 text-[13px]">
                <span translate="no" className="min-w-0 flex-1 truncate">
                  {h.host}
                </span>
                <Badge>{KIND[h.kind]}</Badge>
                <span className="tnum w-12 shrink-0 text-right text-fg-3">{whole(h.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stats.sites.length > 0 && (
        <Card title="Sites with the most blocked">
          <ul className="space-y-0.5">
            {stats.sites.slice(0, 10).map((s) => (
              <li key={s.site} className="flex h-7 items-center gap-2 text-[13px]">
                <span translate="no" className="min-w-0 flex-1 truncate">
                  {s.site}
                </span>
                <span className="tnum w-12 shrink-0 text-right text-fg-3">{whole(s.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

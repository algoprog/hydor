// The card for what a web app may use of Hydor's models, on its Overview, when it has the ai block: before the first use it says what the app asks ("use your models, up to $1 a day"),
// with one button to allow it; after, the owner sees what it has spent today against the cap, can change the cap, switch each tier, or turn it all off. Hydor's models answer for the app;
// the app carries no key. What is shown is counts: never a word anyone asked or was answered.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { Tier } from '@shared/tiers';
import type { WebApp } from '@shared/webapps';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { enc, put } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, Section, Switch } from '../../components/ui';

const money = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : n === 0 ? '$0' : `$${n.toFixed(n < 0.01 ? 4 : 3)}`.replace(/0+$/, '').replace(/\.$/, '.00'));
const WORDS: Record<string, string> = { quick: 'Quick', standard: 'Standard', best: 'Best' };
const tierList = (t: string[]) => t.map((x) => tr(WORDS[x] ?? x)).join(', ');
const num = (n: number) => n.toLocaleString(LOCALE);
/** When the day's count starts again, in the reader's own time. */
const until = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });

export function ModelUse({ app, reload }: { app: WebApp; reload: () => Promise<void> }) {
  const ai = app.ai;
  const [saving, setSaving] = useState(false);
  const [cap, setCap] = useState(String(ai?.capUsd ?? 1));
  if (!ai) return null;
  const save = async (settings: { tiers?: Tier[]; dailyCapUsd?: number }) => {
    setSaving(true);
    try {
      await put(`/api/webapps/${enc(app.id)}`, { settings });
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const pct = ai.capUsd > 0 ? Math.min(100, Math.round((ai.spentUsd / ai.capUsd) * 100)) : 100;
  const asked = ai.asks.length > 0;
  const off = asked && ai.allowed.length === 0;
  const capNum = Number(cap);
  const capOk = cap.trim() !== '' && Number.isFinite(capNum) && capNum >= 0 && capNum <= 10000;
  return (
    <Section title="What it may use" sub="It asks your own models. The app carries no key of theirs.">
      <div className="space-y-4" data-ai="card">
        {!asked && <p className="text-[13.5px] leading-snug text-fg-3">{tr('Its hydor.json does not say which models it needs, so it gets none. Ask the agent to add what it uses.')}</p>}
        {off && (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3.5" data-ai="ask">
            <p className="text-[14px] leading-snug font-medium">{tr(`It would use your models (${tierList(ai.asks)}), up to ${money(ai.capUsd)} a day.`)}</p>
            <p className="mt-1 text-[13px] leading-snug text-fg-3">
              {ai.asksUsdPerDay !== undefined && ai.asksUsdPerDay > ai.capUsd ? tr(`It says a day of it costs about ${money(ai.asksUsdPerDay)}: change the most below if you want it to have that. `) : ''}
              {tr('It stops at that and starts again at midnight. Nothing is used until you allow it.')}
              {ai.today.refused > 0 && ' ' + tr(`It has tried ${num(ai.today.refused)} time${ai.today.refused === 1 ? '' : 's'} today and was told no.`)}
            </p>
            <div className="mt-3">
              <Button size="sm" variant="primary" icon={<Sparkles size={13} />} disabled={saving} onClick={() => void save({ tiers: ai.asks })}>
                Allow it
              </Button>
            </div>
          </div>
        )}
        {asked && !off && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-ai="tiers">
              {ai.asks.map((t) => (
                <label key={t} className="flex items-center gap-2 text-[13.5px] text-fg-2">
                  <Switch on={ai.allowed.includes(t)} disabled={saving} label={tr(`Let it use the ${WORDS[t] ?? t} model`)} onChange={(on) => void save({ tiers: on ? [...ai.allowed, t] : ai.allowed.filter((x) => x !== t) })} />
                  <span>{tr(WORDS[t] ?? t)}</span>
                </label>
              ))}
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save({ tiers: [] })}>
                Turn it off
              </Button>
            </div>
            <div data-ai="spend">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="tnum text-[20px] font-semibold tracking-tight">{money(ai.spentUsd)}</span>
                <span className="text-[13px] text-fg-3">{tr(`of ${money(ai.capUsd)} today`)}</span>
                {ai.atCap && <Badge tone="warn">{tr(`Stopped until ${until(ai.until)}`)}</Badge>}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tr('Spent today')}>
                <div className={cx('h-full rounded-full', pct >= 90 ? 'bg-err' : pct >= 60 ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-[13px] leading-snug text-fg-3" data-ai="counts">
                {tr(`${num(ai.today.calls)} answer${ai.today.calls === 1 ? '' : 's'} today for ${num(ai.today.people)} ${ai.today.people === 1 ? 'person' : 'people'}, ${num(ai.today.inputTokens + ai.today.outputTokens)} tokens`)}
                {ai.today.flowsUsd > 0 && ' ' + tr(`(its agents' work spent ${money(ai.today.flowsUsd)} of it)`)}
                {ai.today.unpriced > 0 && ' ' + tr(`${num(ai.today.unpriced)} answer${ai.today.unpriced === 1 ? '' : 's'} came from a model with no price here, counted as nothing.`)}
              </p>
            </div>
          </>
        )}
        {asked && (
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-fg-2" data-ai="cap">
            <label htmlFor={`cap-${app.id}`}>{tr('The most it may spend a day, in dollars')}</label>
            <input id={`cap-${app.id}`} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className={cx('h-8 w-24 rounded-lg border bg-bg-1 px-2.5 text-[13.5px] tnum', capOk ? 'border-line-2' : 'border-err')} />
            <Button size="sm" variant="secondary" disabled={saving || !capOk || capNum === ai.capUsd} onClick={() => void save({ dailyCapUsd: capNum })}>
              Save
            </Button>
            {app.flows && <span className="text-[12.5px] text-fg-3">{tr('This is also the most its agents’ work may spend.')}</span>}
          </div>
        )}
      </div>
    </Section>
  );
}

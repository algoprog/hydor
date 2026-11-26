// A web app's Flows tab: the agents' work behind its pages. The flows with their questions and answer fields in plain words, the recent runs (who they acted for, how they
// went, when) with a way to open each on Hydor's own run page, the app's own functions its agents may use (off until its owner switches them on; one that changes things asks the
// person on a card the first time in a run, unless the owner chose "without asking"), what the runs have spent today against the cap, and Unlink.
import { useEffect, useState } from 'react';
import { ArrowUpRight, Unlink } from 'lucide-react';
import type { FlowsFunction, FlowsOverview, WebApp } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { del, enc, put } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Badge, Button, cx, Section, Switch, Throbber, useConfirm } from '../../components/ui';
import { appPath } from '../apps/api';
import { useLoaded, webAppPath } from './api';
import { Fold, Meaning } from './Overview';
import { stateWord, typeWord } from './join';
import { ago } from './time';

const money = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n < 0.01 && n > 0 ? 4 : 3)}`.replace(/0+$/, '').replace(/\.$/, '.00'));

function Spend({ today, cap, meaning }: { today: number; cap: number; meaning?: { texts: number; limit: number } }) {
  const pct = cap > 0 ? Math.min(100, Math.round((today / cap) * 100)) : 0;
  return (
    <div data-flows="spend">
      <div className="flex items-baseline gap-2">
        <span className="tnum text-[20px] font-semibold tracking-tight">{money(today)}</span>
        <span className="text-[13px] text-fg-3">{tr(`of ${money(cap)} a day`)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={tr('Spent today')}>
        <div className={cx('h-full rounded-full', pct >= 90 ? 'bg-err' : pct >= 60 ? 'bg-warn' : 'bg-accent')} style={{ width: `${pct}%` }} />
      </div>
      {meaning && <Meaning meaning={meaning} />}
    </div>
  );
}

function Functions({ app, o, reload }: { app: WebApp; o: FlowsOverview; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const list = o.functions.list;
  // What is allowed (to the app's own agents, and to agents in sessions) and what is allowed without asking, as the page shows them; each change saves the whole list of its kind.
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };
  const saveOwn = (next: FlowsFunction[]) => run(() => put(`/api/webapps/${enc(app.id)}/flows/functions`, { allow: next.filter((f) => f.allowed).map((f) => f.name), free: next.filter((f) => f.allowed && f.writes && f.withoutAsking).map((f) => f.name) }));
  const saveSessions = (next: FlowsFunction[]) => run(() => put(`/api/webapps/${enc(app.id)}/functions/sessions`, { allow: next.filter((f) => f.inSessions).map((f) => f.name), free: next.filter((f) => f.inSessions && f.writes && f.inSessionsWithoutAsking).map((f) => f.name) }));
  const changeOwn = (name: string, patch: Partial<FlowsFunction>) => void saveOwn(list.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  const changeSessions = (name: string, patch: Partial<FlowsFunction>) => void saveSessions(list.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  if (o.functions.file !== 'ok')
    return (
      <p translate="no" className="text-[13.5px] leading-snug text-fg-3">
        {o.functions.problems[0] ?? tr('The app offers its agents no functions.')}
      </p>
    );
  if (list.length === 0) return <p className="text-[13.5px] text-fg-3">{tr('The app offers its agents no functions.')}</p>;
  return (
    <ul className="divide-y divide-line" data-flows="functions">
      {list.map((f) => (
        <li key={f.name} className="py-2.5 first:pt-0 last:pb-0" data-function={f.name}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <code translate="no" className="text-[13px] font-medium">
              {f.name}
            </code>
            <Badge tone={f.writes ? 'warn' : 'neutral'}>{f.writes ? tr('Changes things') : tr('Only reads')}</Badge>
          </div>
          <p translate="no" className="mt-1 text-[13px] leading-snug text-fg-3">
            {f.description}
          </p>
          <div className="mt-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-fg-2" data-offer="agents">
              <Switch on={f.allowed} disabled={saving} onChange={(on) => changeOwn(f.name, { allowed: on, withoutAsking: on ? f.withoutAsking : false })} label={tr(`Let its agents use ${f.name}`)} />
              <span>{tr('Its own agents')}</span>
              {f.writes && f.allowed && (
                <label className="flex items-center gap-2 text-fg-3">
                  <Switch on={f.withoutAsking} disabled={saving} onChange={(on) => changeOwn(f.name, { withoutAsking: on })} label={tr(`Use ${f.name} without asking`)} />
                  <span>{f.withoutAsking ? tr('Without asking the person') : tr('Asks the person first, once in each run')}</span>
                </label>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-fg-2" data-offer="sessions">
              <Switch on={f.inSessions} disabled={saving} onChange={(on) => changeSessions(f.name, { inSessions: on, inSessionsWithoutAsking: on ? f.inSessionsWithoutAsking : false })} label={tr(`Let agents in your sessions use ${f.name}`)} />
              <span>{tr('In sessions')}</span>
              {f.writes && f.inSessions && (
                <label className="flex items-center gap-2 text-fg-3">
                  <Switch on={f.inSessionsWithoutAsking} disabled={saving} onChange={(on) => changeSessions(f.name, { inSessionsWithoutAsking: on })} label={tr(`Use ${f.name} in sessions without asking`)} />
                  <span>{f.inSessionsWithoutAsking ? tr('Without asking you') : tr('Asks you first, once in each session')}</span>
                </label>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Flows({ app, reload: reloadApp }: { app: WebApp; reload: () => Promise<void> }) {
  const { data: o, error, reload } = useLoaded<FlowsOverview>(app.flows ? `/api/webapps/${enc(app.id)}/flows/overview` : null);
  const [ask, confirmNode] = useConfirm();
  const [unlinking, setUnlinking] = useState(false);
  // While a run goes, the list follows it.
  const going = !!o?.runs.some((r) => ['queued', 'starting', 'running', 'waiting'].includes(r.status));
  useEffect(() => {
    if (!going) return;
    const t = setInterval(() => void reload(), 2500);
    return () => clearInterval(t);
  }, [going, reload]);
  if (!app.flows)
    return (
      <div className="mx-auto max-w-[920px] px-4 py-5 sm:px-6">
        <p className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center text-[13.5px] text-fg-3">{tr('This app has no agents’ work yet. Add it on its Overview.')}</p>
      </div>
    );
  if (error && !o) return <p translate="no" className="mx-auto max-w-[920px] px-4 py-6 text-[13.5px] text-err sm:px-6">{error}</p>;
  if (!o)
    return (
      <div className="flex justify-center py-16 text-fg-3">
        <Throbber size={24} />
      </div>
    );
  const unlink = async () => {
    const folder = app.flows!.folder;
    if (
      !(await ask({
        title: tr(`Unlink ${o.app.name}?`),
        body: (
          <>
            <p>
              {tr(`${o.app.name} stays among your agent apps${folder ? ', kept as files in a folder of its own' : ''}, and keeps working in your sessions.`)} {tr('This app keeps its pages and everything it kept, and its key for the work is revoked: its pages can no longer start it.')}
            </p>
          </>
        ),
        confirm: tr('Unlink'),
        danger: true,
      }))
    )
      return;
    setUnlinking(true);
    try {
      await del(`/api/webapps/${enc(app.id)}/flows`);
      toast(tr(`${o.app.name} is no longer the work of ${app.name}`), 'ok');
      await reloadApp();
      go(webAppPath(app.id), true);
    } catch (e) {
      toastError(e);
    } finally {
      setUnlinking(false);
    }
  };
  return (
    <div className="mx-auto max-w-[920px] space-y-3 px-4 py-5 sm:px-6 sm:py-6" data-flows="tab">
      <Section
        title={
          <span translate="no" className="flex items-center gap-2">
            {o.app.name}
          </span>
        }
        sub={tr('The agents’ work behind its pages')}
        actions={
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => go(appPath(o.app.id))}>
              {tr('The agent app')}
            </Button>
            <Button size="sm" variant="ghost" icon={<Unlink size={14} />} disabled={unlinking} onClick={() => void unlink()}>
              {tr('Unlink')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          {o.flows.map((f) => (
            <div key={f.id} data-flow={f.id}>
              <div className="flex items-baseline gap-2">
                {/* The flow of an app that has only one, called as the app is, is not named again under the app's own name. */}
                {(o.flows.length > 1 || f.name !== o.app.name) && (
                  <span translate="no" className="text-[14px] font-medium">
                    {f.name}
                  </span>
                )}
                <span translate="no" className="text-[12.5px] text-fg-3">
                  {f.form.length === 1 ? tr('1 question') : tr(`${f.form.length} questions`)} · {tr(`answers with ${f.answer.length}`)}
                </span>
              </div>
              <Fold label={tr('Questions and answer')}>
                <dl className="space-y-1 text-[13px]">
                  {f.form.map((q) => (
                    <div key={q.id} className="flex items-baseline justify-between gap-4">
                      <dt translate="no" className="min-w-0 text-fg-2">
                        {q.label}
                        {q.required ? ' *' : ''}
                      </dt>
                      <dd translate="no" className="min-w-0 text-right text-fg-3">
                        {typeWord(q.type)}
                        {q.options ? `: ${q.options.join(', ')}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 mb-1 text-[12px] font-medium text-fg-3">{tr('It answers with')}</p>
                <dl className="space-y-1 text-[13px]">
                  {f.answer.map((x) => (
                    <div key={x.id} className="flex items-baseline justify-between gap-4">
                      <dt translate="no" className="min-w-0 text-fg-2">
                        {x.label}
                      </dt>
                      <dd translate="no" className="min-w-0 text-right text-fg-3">
                        {typeWord(x.type)}
                        {x.columns ? `: ${x.columns.join(', ')}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Fold>
            </div>
          ))}
        </div>
      </Section>
      <Section title={tr('Recent runs')}>
        {o.runs.length === 0 ? (
          <p className="text-[13.5px] text-fg-3">{tr('Nothing has run yet. Open the app and start one.')}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line" data-flows="runs">
            {o.runs.map((r) => {
              const st = stateWord(r.status);
              return (
                <li key={r.id} data-run={r.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span translate="no" className="min-w-0 truncate text-[13.5px] font-medium">
                        {r.person?.name ?? tr('Nobody')}
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p translate="no" className="truncate text-[12.5px] text-fg-3">
                      {r.inputs || r.flow}
                    </p>
                  </div>
                  <span className="shrink-0 text-right text-[12px] text-fg-3">{ago(r.createdAt)}</span>
                  <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />} onClick={() => go(r.path)} aria-label={tr('Open the run')}>
                    <span className="max-sm:hidden">{tr('Open')}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      <Section title={tr('Its functions for the agents')} sub={tr('Agents act as the person, with what they may do in the app and no more. Off until you switch one on.')}>
        <Functions app={app} o={o} reload={reload} />
      </Section>
      <Section title={tr('Spent today')}>
        <Spend today={o.spend.todayUsd} cap={o.spend.capUsd} meaning={o.spend.meaning} />
      </Section>
      {confirmNode}
    </div>
  );
}

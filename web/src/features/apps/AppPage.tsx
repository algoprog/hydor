// An app's page (or a template's): its form and Run, its past runs, runs over the rows of a CSV, and
// how to reach it from outside (API keys, other agents, the public page), and whether agents in your sessions
// may run it. A template runs as it is, with the agent and model picked here, or becomes an app of your own;
// one you uninstalled shows what it is, to install it again.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppWindow, ChevronRight, Copy, Download, MoreHorizontal, Pencil, Play, Plus, RefreshCw, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react';
import type { AcpAgentDef, Agent } from '@shared/types';
import type { AppDef, AppRun, AppTemplate } from '@shared/apps';
import { appInfo } from '@shared/app-manifest';
import { pagesFor } from '@shared/app-ui';
import { inputsLine, isActive, madeForSessions, prefillOf } from '@shared/apps';
import { appSummary } from '@shared/app-summary';
import { api, del, enc, post, put } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker, modelLabel, useCatalog } from '../../components/AgentPickers';
import { Button, cx, Empty, IconButton, inputCls, MenuItem, Popover, Section, SheetsOnPhone, Switch, Tabs, Throbber, useConfirm } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { PageHeader } from '../layout/PageHeader';
import { AgentsCard, AppAbout } from './About';
import { AppKeys, AppKeysCard, emptyKeys, keysBody, keysFor, keysMissing, type KeyInput, type KeyState } from './AppKeys';
import { appPath, money, runPath, SOURCE_LABEL, useRunDetail, useRunEvents, type AppDetail, type HomeSettings, type RunDetail } from './api';
import { AppIcon } from './AppIcon';
import { BatchTab } from './Batch';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { statusBadge } from './Gallery';
import { FlowList } from './FlowStrip';
import { PinMenuItem } from './Pinned';
import { DownloadDialog, EnvLine } from './Install';
import { AppScreen } from './Screen';
import { AppView } from './View';
import { Schedules } from './Schedules';
import { ShareTab } from './Share';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { EXPLORE_ID, sawExplore } from '../home/ExploreButton';

type Tab = 'run' | 'runs' | 'rows' | 'share';

/** "Claude Code · Sonnet 4.5 · high effort · Auto": what runs an app. */
export function RunsWith({ agent, acpAgent, model, effort, mode }: { agent: Agent; acpAgent?: string; model?: string; effort?: string; mode?: string }) {
  const cat = useCatalog(agent, agent === 'acp' ? acpAgent : undefined);
  const acp = useApp((s) => s.boot?.acpAgents)?.find((a: AcpAgentDef) => a.id === acpAgent);
  const modeLabel = cat?.modes.find((m) => m.value === mode)?.label;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
      <AgentIcon agent={agent} name={acp?.name} size={13} />
      <span className="truncate">
        {agentName(agent, acp?.name)} · {cat ? modelLabel(cat, model) : model || 'default model'}
        {effort && agent !== 'acp' ? ` · ${effort} effort` : ''}
        {modeLabel ? ` · ${modeLabel}` : ''}
      </span>
    </span>
  );
}

/** The app, big: its icon, name and what it does, and what kind of app it is. */
function AppIntro({ recipe, template }: { recipe: AppDef | AppTemplate; template: boolean }) {
  const view = pagesFor(recipe.ui, 'run').length > 0;
  return (
    <div className="flex items-start gap-4">
      <AppIcon icon={recipe.icon} color={recipe.color} size={58} />
      <div className="min-w-0 flex-1 pt-0.5">
        <h1 className="text-[23px] leading-tight font-semibold tracking-tight" translate={template ? undefined : 'no'}>
          {recipe.name}
        </h1>
        {recipe.description && (
          <p className="mt-1 text-[14.5px] leading-relaxed text-fg-2" translate={template ? undefined : 'no'}>
            {recipe.description}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-bg-2 px-2.5 py-0.5 text-[12px] text-fg-2">{template ? 'Ready-made' : 'Your app'}</span>
          {recipe.category && <span className="rounded-full bg-bg-2 px-2.5 py-0.5 text-[12px] text-fg-2">{recipe.category}</span>}
          {view && <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[12px] text-accent">Opens in a view of its own</span>}
        </div>
      </div>
    </div>
  );
}

/** What a run gives: the pages of its view, or the fields of its answer. */
function WhatYouGet({ recipe, template }: { recipe: AppDef | AppTemplate; template: boolean }) {
  const pages = pagesFor(recipe.ui, 'run').filter((p) => p.tab !== false);
  if (!pages.length && !recipe.answer.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 py-3.5">
      <h3 className="text-[13px] font-semibold">What you get</h3>
      <p className="mt-0.5 text-[12.5px] leading-snug text-fg-3">{pages.length ? 'Its answer opens in a view of its own, page by page:' : 'Its answer, as a card you can copy or download:'}</p>
      <ol className="mt-3 space-y-2">
        {(pages.length ? pages.map((p) => ({ id: p.id, title: p.title })) : recipe.answer.map((f) => ({ id: f.id, title: f.label }))).map((x, i) => (
          <li key={x.id} className="flex items-center gap-2.5 text-[13.5px]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-accent/12 text-[12px] font-semibold text-accent">{i + 1}</span>
            <span className="min-w-0 truncate" translate={template ? undefined : 'no'}>
              {x.title}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const DOT: Record<AppRun['status'], string> = { queued: 'bg-fg-3', starting: 'bg-busy', running: 'bg-busy', waiting: 'bg-warn', done: 'bg-ok', failed: 'bg-err', stopped: 'bg-fg-3' };

/** Its latest runs, to open again: what each was asked, how it went, and when. */
function LatestRuns({ id, recipe, template }: { id: string; recipe: AppDef | AppTemplate; template: boolean }) {
  const [runs, setRuns] = useState<AppRun[] | null>(null);
  const load = () => api<{ runs: AppRun[] }>(`/api/apps/${enc(id)}/runs`).then((r) => setRuns(r.runs.filter((x) => !x.flow && !x.parent && x.source !== 'chat').slice(0, 5)), () => setRuns([]));
  useEffect(() => {
    void load();
  }, [id]);
  useRunEvents((r) => r.app === id && !r.parent && void load());
  if (!runs) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <h3 className="flex-1 text-[13px] font-semibold">Latest runs</h3>
        {!template && runs.length > 0 && (
          <button type="button" onClick={() => go(`${appPath(id)}?tab=runs`)} className="text-[12.5px] text-fg-3 hover:text-fg">
            All runs
          </button>
        )}
      </div>
      {runs.length ? (
        <div className="pb-1.5">
          {runs.map((r) => (
            <button key={r.id} type="button" onClick={() => go(runPath(r.id))} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-bg-1">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', DOT[r.status])} title={r.status} />
              <span className="min-w-0 flex-1 truncate text-[13px]" translate="no">
                {inputsLine(recipe.fields, r.inputs, 60) || '—'}
              </span>
              <span className="shrink-0 text-[11.5px] text-fg-3">{isActive(r.status) ? 'now' : timeAgo(r.endedAt ?? r.createdAt)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="px-4 pb-3.5 text-[12.5px] leading-snug text-fg-3">Its runs show here once it has run: each opens to its answer.</p>
      )}
    </section>
  );
}

function RunTab({ id, recipe, template, again, given, agents, secrets }: { id: string; recipe: AppDef | AppTemplate; template: boolean; again?: string | null; given?: Record<string, string>; agents?: ReactNode; secrets?: KeyState[] }) {
  // The keys it needs: those the vault lacks are asked for here, and saved there as it starts (not those only its other flows need).
  const [keyStates, setKeyStates] = useState<KeyState[]>(keysFor(secrets));
  useEffect(() => setKeyStates(keysFor(secrets)), [secrets]);
  const [keys, setKeys] = useState<KeyInput>(emptyKeys);
  const [keyErrors, setKeyErrors] = useState<Record<string, string>>({});
  // Its form as it starts, with the answers its address gave (?in.<question>=…).
  const [values, setValues] = useState<FormValues>(() => ({ ...initialValues(recipe.fields), ...given }));
  // "Run again": the answers of an earlier run (files are chosen afresh).
  useEffect(() => {
    if (!again) return;
    api<RunDetail>(`/api/apps/runs/${enc(again)}`).then(
      (d) => setValues((v) => ({ ...v, ...Object.fromEntries(recipe.fields.filter((f) => f.type !== 'file' && d.run.inputs[f.id] !== undefined).map((f) => [f.id, d.run.inputs[f.id]])) })),
      () => {},
    );
  }, [again]);
  const [files, setFiles] = useState<FormFiles>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // A ready-made app runs with the agent picked here (the last one used for one, else its own), changed behind one line.
  const [picking, setPicking] = useState(false);
  const remembered = (() => {
    try {
      return JSON.parse(localStorage.getItem('wa.apps.agent') ?? 'null') as { agent: Agent; acpAgent?: string; model?: string | null; effort?: string | null; mode?: string | null } | null;
    } catch {
      return null;
    }
  })();
  const [agent, setAgent] = useState<Agent>(template ? (remembered?.agent ?? recipe.agent) : recipe.agent);
  const [acpAgent, setAcpAgent] = useState<string | null>(template ? (remembered?.acpAgent ?? null) : (recipe.acpAgent ?? null));
  const [model, setModel] = useState<string | null>(template ? (remembered?.model ?? null) : (recipe.model ?? null));
  const [effort, setEffort] = useState<string | null>(template ? (remembered?.effort ?? null) : (recipe.effort ?? null));
  const [mode, setMode] = useState<string | null>(template ? (remembered?.mode ?? null) : (recipe.mode ?? null));
  const acpList = useApp((s) => s.boot?.acpAgents) ?? [];
  const run = async () => {
    const errs = formErrors(recipe.fields, values, files);
    setErrors(errs);
    const lacking = keysMissing(keyStates, keys);
    setKeyErrors(Object.fromEntries(lacking.map((k) => [k.name, tr('Needed to run it')])));
    if (Object.keys(errs).length || lacking.length) return toast(lacking.length && !Object.keys(errs).length ? 'Add the key it needs first' : 'Fill in the questions marked first', 'error');
    setBusy(true);
    try {
      const pick = template ? { agent, acpAgent: agent === 'acp' ? acpAgent : undefined, model: model ?? undefined, effort: effort ?? undefined, mode: mode ?? undefined } : {};
      if (template) localStorage.setItem('wa.apps.agent', JSON.stringify(pick));
      const r = await post<{ run: AppRun }>(`/api/apps/${enc(id)}/runs`, { inputs: values, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { name: f.name, data: f.data }])), ...pick, ...keysBody(keys) });
      go(runPath(r.run.id));
    } catch (e) {
      // Keys it still needs (one removed from the vault meanwhile): asked for here.
      const need = (e as { data?: { secrets?: KeyState[] } }).data?.secrets;
      if (need?.length) {
        setKeyStates((ks) => ks.map((k) => (need.some((n) => n.name === k.name) ? { ...k, have: false, hint: undefined } : k)));
        setKeyErrors(Object.fromEntries(need.map((k) => [k.name, tr('Needed to run it')])));
      }
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto grid max-w-[1120px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8 lg:py-8">
      <div className="min-w-0 space-y-5">
        <AppIntro recipe={recipe} template={template} />
        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className="px-5 pt-4 pb-5 sm:px-6">
            <h2 className="mb-4 text-[15px] font-semibold">{recipe.fields.length ? 'Your answers' : 'Ready to run'}</h2>
            <AppForm
              fields={recipe.fields}
              values={values}
              files={files}
              errors={errors}
              disabled={busy}
              onChange={(k, v) => (setValues((x) => ({ ...x, [k]: v })), errors[k] && setErrors((e) => ({ ...e, [k]: '' })))}
              onFile={(k, v) =>
                setFiles((x) => {
                  const next = { ...x };
                  if (v) next[k] = v;
                  else delete next[k];
                  return next;
                })
              }
            />
          </div>
          {keyStates.length > 0 && (
            <AppKeys
              keys={keyStates}
              input={keys}
              onChange={(next) => (setKeys(next), setKeyErrors((x) => Object.fromEntries(Object.entries(x).filter(([n]) => !next.values[n]?.trim()))))}
              errors={keyErrors}
              disabled={busy}
              own={!template}
              className="border-t border-line px-5 pt-3.5 pb-2 sm:px-6"
            />
          )}
          {template && picking && (
            <div className="flex flex-wrap items-center gap-1 border-t border-line bg-bg-1 px-4 py-2.5">
              <AgentPicker
                agent={agent}
                acpId={acpAgent}
                acpList={acpList}
                onPick={(a, aid) => {
                  setAgent(a);
                  setAcpAgent(aid);
                  setModel(null);
                  setEffort(null);
                  setMode(null);
                }}
              />
              <ModelPicker agent={agent} acp={acpAgent ?? undefined} value={model} onChange={(v) => setModel(v)} />
              <EffortPicker agent={agent} acp={acpAgent ?? undefined} model={model} value={effort} onChange={setEffort} />
              <ModePicker agent={agent} acp={acpAgent ?? undefined} value={mode ?? (agent === 'acp' && acpAgent !== 'console' ? null : 'auto')} onChange={setMode} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <RunsWith agent={agent} acpAgent={acpAgent ?? undefined} model={model ?? undefined} effort={effort ?? undefined} mode={mode ?? 'auto'} />
              {template && (
                <button type="button" onClick={() => setPicking((p) => !p)} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
                  {picking ? 'Done' : 'Change'}
                </button>
              )}
            </div>
            <Button variant="primary" icon={busy ? <Throbber /> : <Play size={14} fill="currentColor" />} onClick={run} disabled={busy} className="h-10 px-5 max-sm:w-full">
              {busy ? 'Starting…' : 'Run'}
            </Button>
          </div>
        </section>
        <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">Nobody needs to watch a run: it makes sensible assumptions instead of asking, and you can leave this page while it works.</p>
      </div>
      <aside className="space-y-4">
        <WhatYouGet recipe={recipe} template={template} />
        {agents}
        <LatestRuns id={id} recipe={recipe} template={template} />
        {recipe.flow && <FlowList flow={recipe.flow} own={!template} onGraph={() => go(template ? `/apps/new?template=${enc(id.slice(4))}` : `/apps/${enc(id)}/edit`)} />}
      </aside>
    </div>
  );
}

/** A ready-made app you uninstalled: what it is, in plain terms, to install it again (its past runs are still here). */
function NotInstalled({ id, t, onInstalled }: { id: string; t: AppTemplate; onInstalled: () => void }) {
  const [agents, setAgents] = useState(true);
  const [busy, setBusy] = useState(false);
  const summary = useMemo(() => appSummary(t), [t]);
  const install = async () => {
    setBusy(true);
    try {
      await post(`/api/apps/${enc(id)}/install`);
      if (!agents && summary.sessions) await put(`/api/apps/${enc(id)}/agents`, { on: false });
      toast('Installed', 'ok');
      onInstalled();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-[760px] space-y-4 px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
        <span className="min-w-0 flex-1 text-[13.5px] text-fg-2">You uninstalled it. Install it again to run it here and to let agents run it in your sessions.</span>
        <Button variant="primary" icon={busy ? <Throbber /> : <Plus size={15} />} onClick={install} disabled={busy}>
          Install
        </Button>
      </div>
      <AppAbout name={t.name} description={t.description} icon={t.icon} color={t.color} category={t.category} origin="Ready-made" summary={summary} translate agents={agents} onAgents={setAgents} block={t.block} />
      <LatestRuns id={id} recipe={t} template />
    </div>
  );
}

/**
 * An app that opens on its own page (its view's "app" pages): its latest finished run of its main flow, which the view
 * shows; the one working now; the latest one that did not finish, when it came after; and the earlier finished ones.
 */
interface OwnPage {
  /** Its latest finished run (undefined: not known yet, null: none). */
  last: AppRun | null | undefined;
  active: AppRun | null;
  failed: AppRun | null;
  earlier: AppRun[];
  reload: () => Promise<void>;
}

function useOwnPage(id: string, on: boolean): OwnPage {
  const [runs, setRuns] = useState<AppRun[] | null>(null);
  const load = () =>
    api<{ runs: AppRun[] }>(`/api/apps/${enc(id)}/runs`).then(
      (r) => setRuns(r.runs.filter((x) => !x.flow && !x.parent && x.source !== 'chat')),
      () => setRuns([]),
    );
  useEffect(() => {
    if (on) void load();
  }, [id, on]);
  useRunEvents((r) => on && r.app === id && !r.flow && !r.parent && void load());
  return useMemo(() => {
    if (!runs) return { last: undefined, active: null, failed: null, earlier: [], reload: load };
    const done = runs.filter((r) => r.status === 'done');
    const last = done[0] ?? null;
    const active = runs.find((r) => isActive(r.status)) ?? null;
    const ended = runs.find((r) => !isActive(r.status)) ?? null;
    const failed = ended && ended.status !== 'done' && (!last || ended.createdAt > last.createdAt) ? ended : null;
    return { last, active, failed, earlier: done.slice(1, 6), reload: load };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);
}

/** What a run is doing now, in a line: its step running, else how it stands. */
function NowLine({ id, template }: { id: string; template: boolean }) {
  const { d } = useRunDetail(id);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = [...(d?.progress.steps ?? [])].reverse().find((x) => x.status === 'running')?.title;
  const since = d?.run.startedAt ?? d?.run.createdAt;
  const secs = since ? Math.max(0, Math.round((Date.now() - since) / 1000)) : 0;
  return (
    <span className="min-w-0 truncate">
      {step ? (template ? tr(step) : step) : d?.run.status === 'queued' ? 'Waiting its turn' : 'Starting'}
      {since ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : ''}
    </span>
  );
}

/** A run of an app's main flow from its own page, with the answers kept as its settings. */
async function runFromPage(id: string, home: HomeSettings | undefined, after: () => void) {
  try {
    await post<{ run: AppRun }>(`/api/apps/${enc(id)}/runs`, { inputs: home?.inputs ?? {}, source: 'screen' });
    after();
  } catch (e) {
    toastError(e);
  }
}

/** Update, at the top of an app's own page: runs it now with its settings; while it works, it says so. */
function UpdateButton({ id, own, home }: { id: string; own: OwnPage; home?: HomeSettings }) {
  const [busy, setBusy] = useState(false);
  const working = !!own.active || busy;
  // Before its first run, the page itself offers to make it.
  if (!own.last && !working) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={working ? <Throbber /> : <RefreshCw size={14} />}
      disabled={working}
      title={own.last ? `Last updated ${timeAgo(own.last.endedAt ?? own.last.createdAt)} ago` : undefined}
      onClick={() => (setBusy(true), void runFromPage(id, home, own.reload).finally(() => setBusy(false)))}
    >
      <span className="max-sm:hidden">{working ? 'Updating…' : 'Update'}</span>
    </Button>
  );
}

/** A day of the week's name, in the app's language (0 is Sunday). */
const dayName = (d: number) => new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(new Date(Date.UTC(2026, 0, 4 + d, 12)));

/** The days Update automatically runs on, as its picker has them: every day, weekdays, one day ("5"), or others set elsewhere. */
function daysChoice(days?: number[]): string {
  if (!days?.length) return 'all';
  if (days.join() === '1,2,3,4,5') return 'weekdays';
  return days.length === 1 ? String(days[0]) : 'other';
}

/** When it updates by itself, in a line: "A new one every Friday at 16:00" (with `listed`, that Scheduled tasks lists it too). Whole sentences, each one to translate. */
function whenLine(daily: HomeSettings['daily'], listed = false): string {
  const c = daysChoice(daily.days);
  const days = c === 'other' ? daily.days!.map(dayName).join(', ') : '';
  const day = c === 'all' || c === 'weekdays' || c === 'other' ? '' : dayName(Number(c));
  if (listed) {
    if (c === 'all') return `A new one at ${daily.time} each day; it shows in Scheduled tasks too.`;
    if (c === 'weekdays') return `A new one at ${daily.time} on weekdays; it shows in Scheduled tasks too.`;
    if (c === 'other') return `A new one at ${daily.time} on ${days}; it shows in Scheduled tasks too.`;
    return `A new one every ${day} at ${daily.time}; it shows in Scheduled tasks too.`;
  }
  if (c === 'all') return `A new one at ${daily.time} each day`;
  if (c === 'weekdays') return `A new one at ${daily.time} on weekdays`;
  if (c === 'other') return `A new one at ${daily.time} on ${days}`;
  return `A new one every ${day} at ${daily.time}`;
}

/** A field as the others, sized by the row it is in (inputCls fills its line). */
const fieldCls = inputCls.replace(/(^|\s)w-full(?=\s|$)/, ' ');

/** Update automatically's days and time, in one row: every day, on weekdays, or once a week on a day of your choice. */
function WhenRow({ daily, disabled, onChange }: { daily: HomeSettings['daily']; disabled?: boolean; onChange: (d: { days?: number[] | null; time?: string }) => void }) {
  const choice = daysChoice(daily.days);
  return (
    <div className="flex items-center gap-2 text-[13px] text-fg-2">
      <select
        aria-label="Which days"
        value={choice}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'other') return;
          onChange({ days: v === 'all' ? null : v === 'weekdays' ? [1, 2, 3, 4, 5] : [Number(v)] });
        }}
        className={cx(fieldCls, 'h-8 min-w-0 flex-1 px-2 text-[13px]')}
      >
        <option value="all">Every day</option>
        <option value="weekdays">On weekdays</option>
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <option key={d} value={String(d)}>{`Once a week on ${dayName(d)}`}</option>
        ))}
        {choice === 'other' && <option value="other">{daily.days!.map(dayName).join(', ')}</option>}
      </select>
      <span className="shrink-0">at</span>
      <input type="time" aria-label="At what time" value={daily.time} disabled={disabled} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && onChange({ time: e.target.value })} className={cx(fieldCls, 'h-8 w-[8rem] shrink-0 px-2 text-[13px]')} />
    </div>
  );
}

/** Its settings: Update automatically (on which days, and when), then its form's answers, which each update takes, and the keys it uses (those it can do without too). */
function HomeSettingsPanel({ id, recipe, template, home, onSaved, keys, onKeys }: { id: string; recipe: AppDef | AppTemplate; template: boolean; home: HomeSettings; onSaved: (h: HomeSettings) => void; keys?: KeyState[]; onKeys?: (keys: KeyState[]) => void }) {
  const [values, setValues] = useState<FormValues>(() => ({ ...initialValues(recipe.fields), ...home.inputs }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [keyInput, setKeyInput] = useState<KeyInput>(emptyKeys);
  const typed = Object.values(keyInput.values).some((v) => v.trim()) || keyInput.allow.length > 0;
  const changed = recipe.fields.some((f) => String(values[f.id] ?? '') !== String(home.inputs[f.id] ?? ''));
  const save = async (body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const r = await put<{ home: HomeSettings }>(`/api/apps/${enc(id)}/home`, body);
      onSaved(r.home);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setSaving(false);
    }
  };
  const fields = recipe.fields.filter((f) => f.type !== 'file');
  return (
    <div className="px-1 pt-1 pb-1">
      <div className="flex items-start gap-3 px-2 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Update automatically</div>
          <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{home.daily.on ? whenLine(home.daily, true) : 'Off: it changes only when you press Update.'}</div>
        </div>
        <Switch label="Update automatically" on={home.daily.on} disabled={saving} onChange={(on) => void save({ daily: { on } })} />
      </div>
      {home.daily.on && (
        <div className="px-2 pb-2.5">
          <WhenRow daily={home.daily} disabled={saving} onChange={(d) => void save({ daily: d })} />
        </div>
      )}
      {fields.length > 0 && (
        <div className="mt-1 border-t border-line px-2 pt-3 pb-1">
          <AppForm
            fields={fields}
            values={values}
            files={{}}
            errors={errors}
            disabled={saving}
            onChange={(k, v) => (setValues((x) => ({ ...x, [k]: v })), errors[k] && setErrors((e) => ({ ...e, [k]: '' })))}
            onFile={() => {}}
          />
          {keys && keys.length > 0 && <AppKeys keys={keys} input={keyInput} onChange={setKeyInput} disabled={saving} own={!template} className="mt-3 border-t border-line pt-3" />}
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="flex-1 text-[12px] leading-snug text-fg-3">Each update uses these.</span>
            <Button
              size="sm"
              variant="primary"
              disabled={(!changed && !typed) || saving}
              onClick={async () => {
                const errs = formErrors(fields, values, {});
                setErrors(errs);
                if (Object.keys(errs).length) return;
                if (changed && !(await save({ inputs: Object.fromEntries(fields.map((f) => [f.id, String(values[f.id] ?? '')])) }))) return;
                // The keys typed go to the vault, as on its form.
                if (typed) {
                  setSaving(true);
                  try {
                    const r = await post<{ secrets: KeyState[] }>(`/api/apps/${enc(id)}/secrets`, { values: keyInput.values, allow: keyInput.allow });
                    setKeyInput(emptyKeys());
                    onKeys?.(r.secrets);
                  } catch (e) {
                    return void toastError(e);
                  } finally {
                    setSaving(false);
                  }
                }
                toast('Saved', 'ok');
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The settings button at the top of an app's own page, and their panel. */
function HomeSettingsButton(props: { id: string; recipe: AppDef | AppTemplate; template: boolean; home: HomeSettings; onSaved: (h: HomeSettings) => void; keys?: KeyState[]; onKeys?: (keys: KeyState[]) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="Settings" ref={ref} active={open} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={16} />
      </IconButton>
      <SheetsOnPhone.Provider value>
        <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={380} title="Settings">
          <HomeSettingsPanel {...props} />
        </Popover>
      </SheetsOnPhone.Provider>
    </>
  );
}

/** The first answer of a run that reads as a line (an edition's cover line), for the list of earlier ones. */
function firstLine(recipe: AppDef | AppTemplate, r: AppRun): string {
  for (const f of recipe.answer) {
    const v = r.result?.[f.id];
    if (f.type === 'text' && typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * The app's own page in its view (its pages with on: "app"), in place of its form: what it keeps, its latest run of
 * its main flow (`last`), and its events, with everything an owner's page may do. Above it, the run working now; with
 * no run yet, what it is and a button that makes the first; under it, the earlier ones.
 */
function HomeView({ id, recipe, template, view, home, own, onHome }: { id: string; recipe: AppDef | AppTemplate; template: boolean; view?: Record<string, unknown>; home?: HomeSettings; own: OwnPage; onHome: (h: HomeSettings) => void }) {
  const info = useMemo(() => appInfo(id, recipe), [id, recipe]);
  const [starting, setStarting] = useState(false);
  // Before the first one: the questions it cannot do without that its settings leave empty (your venues, your name), asked here.
  const needs = recipe.fields.filter((f) => f.required && f.type !== 'file' && !String(home?.inputs[f.id] ?? '').trim());
  const [values, setValues] = useState<FormValues>(() => initialValues(needs));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const first = async () => {
    let settings = home;
    if (needs.length) {
      const errs = formErrors(needs, values, {});
      setErrors(errs);
      if (Object.keys(errs).length) return;
      try {
        settings = (await put<{ home: HomeSettings }>(`/api/apps/${enc(id)}/home`, { inputs: Object.fromEntries(needs.map((f) => [f.id, String(values[f.id] ?? '')])) })).home;
        onHome(settings);
      } catch (e) {
        return toastError(e);
      }
    }
    setStarting(true);
    await runFromPage(id, settings, own.reload).finally(() => setStarting(false));
  };
  // The keys one of its flows needs, asked for here when it ran without them (Sync with Zotero, say).
  const [keys, setKeys] = useState<KeyState[] | null>(null);
  // An app whose page is a place to work with what it keeps (the Reading list) shows it at once, with no edition to update.
  const editions = updatable(recipe);
  const keeps = !!recipe.data && Object.keys(recipe.data).length > 0;
  const atOnce = keeps && !editions;
  if (own.last === undefined)
    return (
      <div className="flex justify-center py-20 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const working = own.active && editions && (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px]">
      <Throbber className="shrink-0 text-accent" />
      <span className="shrink-0 font-medium">{own.last ? 'Updating' : 'Making the first one'}</span>
      <span className="flex min-w-0 flex-1 text-fg-3">
        <NowLine id={own.active.id} template={template} />
      </span>
      <button type="button" onClick={() => go(runPath(own.active!.id))} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
        Follow it
      </button>
    </div>
  );
  const failed = !own.active && own.failed && editions && (
    <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-warn/30 bg-warn/8 px-4 py-3 text-[13px] text-fg-2">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" />
      <span className="min-w-0 flex-1">
        {own.failed.status === 'stopped' ? 'The last update was stopped.' : `The last update did not finish${own.failed.error ? `: ${own.failed.error}` : '.'}`}{' '}
        <button type="button" onClick={() => go(runPath(own.failed!.id))} className="font-medium text-accent hover:underline">
          See what happened
        </button>
      </span>
    </div>
  );
  return (
    <div className="mx-auto max-w-[1040px] px-4 py-6 sm:px-6">
      {working}
      {failed}
      {keys && (
        <div className="mb-5">
          <AppKeysCard appId={id} keys={keys} own={!template} onSaved={() => setKeys(null)} />
        </div>
      )}
      {own.last || atOnce ? (
        <AppView ui={recipe.ui!} name={recipe.name} description={recipe.description} appId={id} on="app" last={own.last} answer={recipe.answer} view={view} info={info} can={['keep', 'run', 'start', 'data']} assets={recipe.assets} translate={template} keeps={keeps} onKeys={setKeys} />
      ) : (
        !own.active && (
          <div className="mx-auto flex max-w-[560px] flex-col items-center py-10 text-center sm:py-16">
            <AppIcon icon={recipe.icon} color={recipe.color} size={64} />
            <h2 className="mt-4 text-[22px] font-semibold tracking-tight" translate={template ? undefined : 'no'}>
              {recipe.name}
            </h2>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg-2" translate={template ? undefined : 'no'}>
              {recipe.description}
            </p>
            {needs.length > 0 && (
              <div className="mt-6 w-full rounded-2xl border border-line bg-panel px-5 py-4 text-left">
                <AppForm fields={needs} values={values} files={{}} errors={errors} disabled={starting} onChange={(k, v) => (setValues((x) => ({ ...x, [k]: v })), errors[k] && setErrors((e) => ({ ...e, [k]: '' })))} onFile={() => {}} />
              </div>
            )}
            <Button variant="primary" icon={starting ? <Throbber /> : <Play size={14} fill="currentColor" />} disabled={starting} className="mt-6 h-10 px-5" onClick={() => void first()}>
              Make the first one
            </Button>
            {home && (
              <label className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">Update automatically</span>
                  <span className="block text-[12px] text-fg-3">{whenLine(home.daily)}</span>
                </span>
                <Switch label="Update automatically" on={home.daily.on} onChange={(on) => void put<{ home: HomeSettings }>(`/api/apps/${enc(id)}/home`, { daily: { on } }).then((r) => onHome(r.home), toastError)} />
              </label>
            )}
          </div>
        )
      )}
      {editions && own.earlier.length > 0 && (
        <section className="mt-8 border-t border-line pt-4">
          <h3 className="mb-1 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">Earlier</h3>
          <ul>
            {own.earlier.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => go(runPath(r.id))} className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-bg-1">
                  <span className="w-28 shrink-0 text-[12.5px] text-fg-3">{new Date(r.endedAt ?? r.createdAt).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px]" translate="no">
                    {firstLine(recipe, r) || inputsLine(recipe.fields, r.inputs, 80) || '—'}
                  </span>
                  <ChevronRight size={14} className="shrink-0 self-center text-fg-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Whether an app's own page updates (Explore's editions: Update, and Update every day): its form runs as it is, with no
 * question that needs a new answer each time. The Reading list's needs a paper each time: its page is where you work.
 */
/** Whether its own page makes editions to update (Explore, Paper radar…), not a place to work with what it keeps (the Reading list: home.editions false). */
export const updatable = (r: Pick<AppDef, 'home'>) => r.home?.editions !== false;

export function RunsList({ app, runs, more, onMore }: { app: { fields: AppDef['fields'] }; runs: AppRun[]; more?: boolean; onMore?: () => void }) {
  if (!runs.length) return <Empty title="No runs yet">Runs from the form, the API, other agents and the public page all show here.</Empty>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-panel">
      {runs.map((r) => (
        <button key={r.id} type="button" onClick={() => go(runPath(r.id))} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-bg-1">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px]">{inputsLine(app.fields, r.inputs, 90) || 'No inputs'}</span>
            <span className="block truncate text-[12px] text-fg-3">
              {SOURCE_LABEL[r.source]}
              {r.row ? ` ${r.row}` : ''} · {timeAgo(r.createdAt)} ago{r.costUsd != null ? ` · ${money(r.costUsd)}` : ''}
            </span>
          </span>
          {statusBadge(r)}
          <ChevronRight size={15} className="shrink-0 text-fg-3" />
        </button>
      ))}
      {more && (
        <button type="button" onClick={onMore} className="w-full py-2.5 text-[13px] text-fg-3 hover:bg-bg-1 hover:text-fg">
          Show older runs
        </button>
      )}
    </div>
  );
}

function RunsTab({ id, app, def }: { id: string; app: AppDef | AppTemplate; def?: AppDef }) {
  const [runs, setRuns] = useState<AppRun[] | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    api<{ runs: AppRun[] }>(`/api/apps/${enc(id)}/runs`).then((r) => (setRuns(r.runs), setMore(r.runs.length >= 50)), toastError);
  }, [id]);
  useRunEvents((run) => setRuns((l) => (l ? (l.some((r) => r.id === run.id) ? l.map((r) => (r.id === run.id ? run : r)) : run.app === id || run.app === `tpl:${id}` ? [run, ...l] : l) : l)));
  const older = () => {
    const last = runs?.[runs.length - 1];
    if (!last) return;
    api<{ runs: AppRun[] }>(`/api/apps/${enc(id)}/runs?before=${last.createdAt}`).then((r) => (setRuns((l) => [...(l ?? []), ...r.runs]), setMore(r.runs.length >= 50)), toastError);
  };
  return (
    <div className="mx-auto max-w-[860px] space-y-4 px-4 py-6 sm:px-6">
      {def && <Schedules app={def} />}
      {runs ? <RunsList app={app} runs={runs} more={more} onMore={older} /> : <Throbber className="mx-auto block text-[24px] text-fg-3" />}
    </div>
  );
}

export function AppPage({ id, tab, again, prefill }: { id: string; tab: Tab; again?: string | null; prefill?: string }) {
  const [d, setD] = useState<AppDetail | null>(null);
  const [err, setErr] = useState('');
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const [ask, confirmNode] = useConfirm();
  const load = () => api<AppDetail>(`/api/apps/${enc(id)}`).then(setD, (e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, [id]);
  // While its packages install, the line about them follows along.
  useEffect(() => {
    if (d?.env?.state !== 'installing') return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [d?.env?.state]);
  const template = id.startsWith('tpl:');
  const recipe = d?.app ?? d?.template;
  // A ready-made app comes installed; one you uninstalled shows what it is, to install it again.
  const installed = !template || d?.installed !== false;
  const setTab = (t: Tab) => go(`${appPath(id)}${t === 'run' ? '' : `?tab=${t}`}`, true);
  const uninstall = async () => {
    setMenu(false);
    if (!recipe) return;
    if (template) {
      if (!(await ask({ title: `Uninstall ${recipe.name}?`, body: 'It leaves your apps, and agents stop running it in your sessions. It waits under Ready-made apps to install on the Apps page, to install again whenever you like; its runs stay.', confirm: 'Uninstall', danger: true }))) return;
      try {
        await post(`/api/apps/${enc(id)}/uninstall`);
        go('/apps');
      } catch (e) {
        toastError(e);
      }
      return;
    }
    const file = !!d?.app?.fromFile;
    const body = file ? 'It is deleted completely: its runs, keys, public page and the data it keeps go with it. The sessions it started stay. To have it again, install its file again.' : 'Its runs, keys, public page and the data it keeps go with it. The sessions it started stay.';
    if (!(await ask({ title: file ? `Uninstall ${recipe.name}?` : `Delete ${recipe.name}?`, body, confirm: file ? 'Uninstall' : 'Delete', danger: true }))) return;
    try {
      await del(`/api/apps/${enc(id)}`);
      go('/apps');
    } catch (e) {
      toastError(e);
    }
  };
  // Answers its address gives its form (?in.<question>=…): its form opens with them, even where it has a page of its own.
  const given = useMemo(() => (recipe && prefill ? prefillOf(recipe.fields, prefill) : {}), [recipe, prefill]);
  const filled = Object.keys(given).length > 0;
  // An app that opens on its own page (its view's "app" pages, as Explore's magazine): there in place of its form,
  // with Update and its settings at the top (when it updates: see updatable).
  const ownPage = !!recipe && installed && tab === 'run' && !again && !filled && pagesFor(recipe.ui, 'app').length > 0;
  const own = useOwnPage(id, ownPage);
  // Seen: the start page's Explore shows no dot for the edition you are looking at.
  useEffect(() => {
    if (id === EXPLORE_ID && own.last) sawExplore();
  }, [id, own.last]);
  const [home, setHome] = useState<HomeSettings | undefined>(undefined);
  useEffect(() => setHome(d?.home), [d]);
  // Whether agents in your sessions may run it: the switch beside its form.
  const agentsOn = template ? d?.agents !== false : d?.app?.agents !== false;
  const agentsCard = recipe && installed && (
    <AgentsCard
      id={id}
      made={madeForSessions(recipe)}
      on={agentsOn}
      block={recipe.block}
      ownPage={!!d?.app?.screens?.main || pagesFor(recipe.ui, 'app').length > 0}
      onChange={(on) => setD((x) => (x ? (template ? { ...x, agents: on } : x.app ? { ...x, app: { ...x.app, agents: on } } : x) : x))}
    />
  );
  if (err) return <Empty title="This app could not be opened">{err}</Empty>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        back={recipe ? { label: 'All apps', onClick: () => go('/apps') } : undefined}
        title={
          recipe ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <AppIcon icon={recipe.icon} color={recipe.color} size={26} />
              <span className="truncate">{recipe.name}</span>
            </span>
          ) : (
            'App'
          )
        }
        actions={
          recipe &&
          (template ? (
            installed && (
              <>
                {ownPage && updatable(recipe) && <UpdateButton id={id} own={own} home={home} />}
                {ownPage && updatable(recipe) && home && <HomeSettingsButton id={id} recipe={recipe} template home={home} onSaved={setHome} keys={d?.secrets} onKeys={(secrets) => setD((x) => (x ? { ...x, secrets } : x))} />}
                {/* On its own page, Make it mine waits in the menu: Update and Settings are what it is for. */}
                {!ownPage && (
                  <Button size="sm" icon={<Pencil size={14} />} onClick={() => go(`/apps/new?template=${enc(id.slice(4))}`)}>
                    <span className="max-sm:hidden">Make it mine</span>
                    <span className="sm:hidden">Edit</span>
                  </Button>
                )}
                <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                  <MoreHorizontal size={17} />
                </IconButton>
                <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
                  <PinMenuItem id={id} onDone={() => setMenu(false)} />
                  {ownPage && (
                    <MenuItem icon={<Pencil size={15} />} onClick={() => (setMenu(false), go(`/apps/new?template=${enc(id.slice(4))}`))}>
                      Make it mine
                    </MenuItem>
                  )}
                  <MenuItem icon={<Trash2 size={15} />} danger onClick={uninstall}>
                    Uninstall
                  </MenuItem>
                </Popover>
              </>
            )
          ) : (
            <>
              {ownPage && updatable(recipe) && <UpdateButton id={id} own={own} home={home} />}
              {ownPage && updatable(recipe) && home && <HomeSettingsButton id={id} recipe={recipe} template={false} home={home} onSaved={setHome} keys={d?.secrets} onKeys={(secrets) => setD((x) => (x ? { ...x, secrets } : x))} />}
              <Button size="sm" icon={<Pencil size={14} />} onClick={() => go(`${appPath(id)}/edit`)}>
                Edit
              </Button>
              <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal size={17} />
              </IconButton>
              <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
                <PinMenuItem id={d?.app?.id ?? id} onDone={() => setMenu(false)} />
                <MenuItem
                  icon={<Copy size={15} />}
                  onClick={async () => {
                    setMenu(false);
                    try {
                      const { id: _i, slug: _s, createdAt: _c, updatedAt: _u, public: _p, ...rest } = d!.app!;
                      const r = await post<{ app: AppDef }>('/api/apps', { recipe: { ...rest, name: `${rest.name} copy` }, mcp: rest.mcp });
                      // Its screens come along as pages of the copy's own.
                      for (const [name, s] of Object.entries(rest.screens ?? {})) {
                        const { screen } = await api<{ screen: { html: string } }>(`/api/apps/${enc(d!.app!.id)}/screens/${enc(name)}`);
                        await post(`/api/apps/${enc(r.app.id)}/screens`, { name, title: s.title, html: screen.html });
                      }
                      go(appPath(r.app.id));
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  Duplicate
                </MenuItem>
                <MenuItem
                  icon={<AppWindow size={15} />}
                  onClick={async () => {
                    setMenu(false);
                    const page = d?.app?.screens?.main?.page;
                    if (page) return go(`/pages/${enc(page)}`);
                    try {
                      await post(`/api/apps/${enc(id)}/screens`, {});
                      await load();
                      setTab('run');
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  {d?.app?.screens?.main ? 'Edit the screen' : 'Give it a screen'}
                </MenuItem>
                <MenuItem
                  icon={<Download size={15} />}
                  onClick={() => {
                    setMenu(false);
                    setSaving(true);
                  }}
                >
                  Download as a file
                </MenuItem>
                <MenuItem icon={<Trash2 size={15} />} danger onClick={uninstall}>
                  {d?.app?.fromFile ? 'Uninstall' : 'Delete'}
                </MenuItem>
              </Popover>
              {d?.app && <DownloadDialog app={d.app} open={saving} onClose={() => setSaving(false)} />}
            </>
          ))
        }
      >
        {recipe && !template && (
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'run', label: 'Run' },
              { value: 'runs', label: 'Runs', count: d?.usage?.runs ? `${d.usage.runs} today` : undefined },
              { value: 'rows', label: 'For each row' },
              { value: 'share', label: 'API & sharing' },
            ]}
          />
        )}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!recipe ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <>
            {/* An app that opens on its own screen or view: the keys it still needs, given here (its form asks for them otherwise). */}
            {d?.app && tab === 'run' && !again && (pagesFor(d.app.ui, 'app').length > 0 || !!d.app.screens?.main) && keysFor(d.secrets).some((k) => !k.have && !k.optional) && (
              <div className="mx-auto max-w-[920px] px-4 pt-5 sm:px-6">
                <AppKeysCard appId={d.app.id} keys={keysFor(d.secrets)} own onSaved={(secrets) => setD((x) => (x ? { ...x, secrets } : x))} />
              </div>
            )}
            {d?.app && d.env && tab === 'run' && (d.env.state !== 'none' && d.env.state !== 'ready' ? true : d.env.missing.length > 0) && (
              <div className="mx-auto max-w-[760px] px-5 pt-5 sm:px-7">
                <EnvLine appId={d.app.id} env={d.env} onChange={load} />
              </div>
            )}
            {/* Its view's own page, or its screen, in place of its form (the form comes back to run again with earlier answers). */}
            {template && !installed && d?.template ? (
              <NotInstalled id={id} t={d.template} onInstalled={load} />
            ) : ownPage ? (
              <HomeView id={id} recipe={recipe} template={template} view={d?.view} home={home} own={own} onHome={setHome} />
            ) : tab === 'run' && d?.app?.screens?.main && !again && !filled ? (
              <div className="h-full min-h-[420px]">
                <AppScreen app={d.app} />
              </div>
            ) : (
              (tab === 'run' || template) && <RunTab key={`${id}:${JSON.stringify(given)}`} id={id} recipe={recipe} template={template} again={again} given={given} agents={agentsCard} secrets={d?.secrets} />
            )}
            {tab === 'runs' && !template && <RunsTab id={id} app={recipe} def={d?.app} />}
            {tab === 'rows' && d?.app && <BatchTab app={d.app} />}
            {tab === 'share' && d?.app && <ShareTab detail={d} onChange={load} />}
          </>
        )}
      </div>
      {confirmNode}
    </div>
  );
}


// An app's page (or a template's): its form and Run, its past runs, runs over the rows of a CSV, and
// how to reach it from outside (API keys, other agents, the public page), and whether agents in your sessions
// may run it. A template runs as it is, with the agent and model picked here, or becomes an app of your own;
// one you uninstalled shows what it is, to install it again.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppWindow, ArrowLeft, ChevronRight, Copy, Download, MoreHorizontal, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { AcpAgentDef, Agent } from '@shared/types';
import type { AppDef, AppRun, AppTemplate } from '@shared/apps';
import { appInfo } from '@shared/app-manifest';
import { pagesFor } from '@shared/app-ui';
import { inputsLine, isActive, madeForSessions } from '@shared/apps';
import { appSummary } from '@shared/app-summary';
import { api, del, enc, post, put } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker, modelLabel, useCatalog } from '../../components/AgentPickers';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Section, Tabs, Throbber, useConfirm } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { PageHeader } from '../layout/PageHeader';
import { AgentsCard, AppAbout } from './About';
import { appPath, money, runPath, SOURCE_LABEL, useRunEvents, type AppDetail, type RunDetail } from './api';
import { AppIcon } from './AppIcon';
import { BatchTab } from './Batch';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { statusBadge } from './Gallery';
import { FlowList } from './FlowStrip';
import { DownloadDialog, EnvLine } from './Install';
import { AppScreen } from './Screen';
import { AppView } from './View';
import { Schedules } from './Schedules';
import { ShareTab } from './Share';

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

function RunTab({ id, recipe, template, again, agents }: { id: string; recipe: AppDef | AppTemplate; template: boolean; again?: string | null; agents?: ReactNode }) {
  const [values, setValues] = useState<FormValues>(() => initialValues(recipe.fields));
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
    if (Object.keys(errs).length) return toast('Fill in the questions marked first', 'error');
    setBusy(true);
    try {
      const pick = template ? { agent, acpAgent: agent === 'acp' ? acpAgent : undefined, model: model ?? undefined, effort: effort ?? undefined, mode: mode ?? undefined } : {};
      if (template) localStorage.setItem('wa.apps.agent', JSON.stringify(pick));
      const r = await post<{ run: AppRun }>(`/api/apps/${enc(id)}/runs`, { inputs: values, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { name: f.name, data: f.data }])), ...pick });
      go(runPath(r.run.id));
    } catch (e) {
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
 * The app's own page in its view (its pages with on: "app"), in place of its form: what it keeps, its latest run
 * of its main flow (`last`), and its events, with everything an owner's page may do.
 */
function HomeView({ app, view }: { app: AppDef; view?: Record<string, unknown> }) {
  const [last, setLast] = useState<AppRun | null | undefined>(undefined);
  const load = () => api<{ runs: AppRun[] }>(`/api/apps/${enc(app.id)}/runs`).then((r) => setLast(r.runs.find((x) => x.status === 'done' && !x.flow && !x.parent && x.source !== 'chat') ?? null), () => setLast(null));
  useEffect(() => {
    void load();
  }, [app.id]);
  useRunEvents((r) => r.app === app.id && !r.flow && !r.parent && r.status === 'done' && void load());
  const info = useMemo(() => appInfo(app.id, app), [app]);
  if (last === undefined)
    return (
      <div className="flex justify-center py-20 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  return (
    <div className="mx-auto max-w-[920px] px-4 py-6 sm:px-6">
      <AppView ui={app.ui!} name={app.name} description={app.description} appId={app.id} on="app" last={last} answer={app.answer} view={view} info={info} can={['keep', 'run', 'start', 'data']} />
    </div>
  );
}

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

export function AppPage({ id, tab, again }: { id: string; tab: Tab; again?: string | null }) {
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
        title={
          recipe ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <IconButton label="All apps" size="sm" onClick={() => go('/apps')} className="shrink-0">
                <ArrowLeft size={17} />
              </IconButton>
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
                <Button size="sm" icon={<Pencil size={14} />} onClick={() => go(`/apps/new?template=${enc(id.slice(4))}`)}>
                  <span className="max-sm:hidden">Make it mine</span>
                  <span className="sm:hidden">Edit</span>
                </Button>
                <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                  <MoreHorizontal size={17} />
                </IconButton>
                <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
                  <MenuItem icon={<Trash2 size={15} />} danger onClick={uninstall}>
                    Uninstall
                  </MenuItem>
                </Popover>
              </>
            )
          ) : (
            <>
              <Button size="sm" icon={<Pencil size={14} />} onClick={() => go(`${appPath(id)}/edit`)}>
                Edit
              </Button>
              <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal size={17} />
              </IconButton>
              <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
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
            {d?.app && d.env && tab === 'run' && (d.env.state !== 'none' && d.env.state !== 'ready' ? true : d.env.missing.length > 0) && (
              <div className="mx-auto max-w-[760px] px-5 pt-5 sm:px-7">
                <EnvLine appId={d.app.id} env={d.env} onChange={load} />
              </div>
            )}
            {/* Its view's own page, or its screen, in place of its form (the form comes back to run again with earlier answers). */}
            {template && !installed && d?.template ? (
              <NotInstalled id={id} t={d.template} onInstalled={load} />
            ) : tab === 'run' && d?.app && pagesFor(d.app.ui, 'app').length > 0 && !again ? (
              <HomeView app={d.app} view={d.view} />
            ) : tab === 'run' && d?.app?.screens?.main && !again ? (
              <div className="h-full min-h-[420px]">
                <AppScreen app={d.app} />
              </div>
            ) : (
              (tab === 'run' || template) && <RunTab key={id} id={id} recipe={recipe} template={template} again={again} agents={agentsCard} />
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


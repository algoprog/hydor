// An app's page (or a template's): its form and Run, its past runs, runs over the rows of a CSV, and
// how to reach it from outside (API keys, other agents, the public page). A template runs as it is,
// with the agent and model picked here, or becomes an app of your own.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Copy, Download, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react';
import type { AcpAgentDef, Agent } from '@shared/types';
import type { AppDef, AppRun, AppTemplate } from '@shared/apps';
import { inputsLine } from '@shared/apps';
import { api, del, enc, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker, modelLabel, useCatalog } from '../../components/AgentPickers';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Section, Tabs, Throbber, useConfirm } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { PageHeader } from '../layout/PageHeader';
import { appPath, money, runPath, SOURCE_LABEL, useRunEvents, type AppDetail, type RunDetail } from './api';
import { AppIcon } from './AppIcon';
import { BatchTab } from './Batch';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { statusBadge } from './Gallery';
import { DownloadDialog, EnvLine } from './Install';
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

function RunTab({ id, recipe, template, again }: { id: string; recipe: AppDef | AppTemplate; template: boolean; again?: string | null }) {
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
  // A template runs with the agent picked here (the last one used for it, else its own).
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
    <div className="mx-auto max-w-[760px] space-y-4 px-4 py-6 sm:px-6">
      <Section>
        <AppForm
          fields={recipe.fields}
          values={values}
          files={files}
          errors={errors}
          disabled={busy}
          onChange={(k, v) => (setValues((x) => ({ ...x, [k]: v })), errors[k] && setErrors((e) => ({ ...e, [k]: '' })))}
          onFile={(k, v) => setFiles((x) => {
            const next = { ...x };
            if (v) next[k] = v;
            else delete next[k];
            return next;
          })}
        />
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {template ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
          ) : (
            <div className="min-w-0 flex-1">
              <RunsWith agent={recipe.agent} acpAgent={recipe.acpAgent} model={recipe.model} effort={recipe.effort} mode={recipe.mode ?? 'auto'} />
            </div>
          )}
          <Button variant="primary" icon={busy ? <Throbber /> : <Play size={14} fill="currentColor" />} onClick={run} disabled={busy} className="max-sm:w-full">
            {busy ? 'Starting…' : 'Run'}
          </Button>
        </div>
      </Section>
      <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
        A run starts a session with the filled-in task; its result comes back as {recipe.answer.length ? 'a card you can copy or download' : 'the agent’s reply'}. Nobody needs to watch it: it makes sensible assumptions instead of asking.
      </p>
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

function RunsTab({ id, app }: { id: string; app: AppDef | AppTemplate }) {
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
  return <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6">{runs ? <RunsList app={app} runs={runs} more={more} onMore={older} /> : <Throbber className="mx-auto block text-[24px] text-fg-3" />}</div>;
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
  const setTab = (t: Tab) => go(`${appPath(id)}${t === 'run' ? '' : `?tab=${t}`}`, true);
  if (err) return <Empty title="This template could not be opened">{err}</Empty>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          recipe ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <IconButton label="All templates" size="sm" onClick={() => go('/apps')} className="-ml-1">
                <ArrowLeft size={17} />
              </IconButton>
              <AppIcon icon={recipe.icon} color={recipe.color} size={26} />
              <span className="truncate">{recipe.name}</span>
            </span>
          ) : (
            'Template'
          )
        }
        actions={
          recipe &&
          (template ? (
            <Button size="sm" icon={<Pencil size={14} />} onClick={() => go(`/apps/new?template=${enc(id.slice(4))}`)}>
              <span className="max-sm:hidden">Make it mine</span>
              <span className="sm:hidden">Edit</span>
            </Button>
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
                      go(appPath(r.app.id));
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  Duplicate
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
                <MenuItem
                  icon={<Trash2 size={15} />}
                  danger
                  onClick={async () => {
                    setMenu(false);
                    if (!(await ask({ title: `Delete ${recipe.name}?`, body: 'Its runs, keys, public page and the data it keeps go with it. The sessions it started stay.', confirm: 'Delete', danger: true }))) return;
                    try {
                      await del(`/api/apps/${enc(id)}`);
                      go('/apps');
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  Delete
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
            {recipe.description && (tab === 'run' || template) && <p className={cx('mx-auto max-w-[760px] px-5 pt-5 text-[13.5px] leading-relaxed text-fg-2 sm:px-7')}>{recipe.description}</p>}
            {(tab === 'run' || template) && <RunTab key={id} id={id} recipe={recipe} template={template} again={again} />}
            {tab === 'runs' && !template && <RunsTab id={id} app={recipe} />}
            {tab === 'rows' && d?.app && <BatchTab app={d.app} />}
            {tab === 'share' && d?.app && <ShareTab detail={d} onChange={load} />}
          </>
        )}
      </div>
      {confirmNode}
    </div>
  );
}


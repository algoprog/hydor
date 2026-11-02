// Making or changing an app: its face, the questions of its form, the task with the answers put in (or
// its steps, once it works in steps), the answer fields of its result, what it keeps between runs, who
// does it (agent, model, mode, assistant, folder), which tools it may use, its limits, and a test run of
// what is on screen before saving. "Save as template" in a session's menu opens it with a draft from that
// session.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, FlaskConical, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { tr } from '../../i18n/runtime';
import type { Agent } from '@shared/types';
import type { AnswerField, AppDef, AppField, AppRecipe, AppRun, AppTemplate, RunProgress } from '@shared/apps';
import type { Flow } from '@shared/app-manifest';
import { titleOf } from '@shared/app-manifest';
import { ANSWER_TYPES, APP_COLORS, APP_ICONS, COLUMN_TYPES, fieldId, FIELD_TYPES, fillTemplate, isActive, placeholders } from '@shared/apps';
import { api, enc, post, put } from '../../lib/api';
import { composeInsert, useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { EffortPicker, ModelPicker, ModePicker } from '../../components/AgentPickers';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, Popover, Section, Switch, Throbber } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { PageHeader } from '../layout/PageHeader';
import { appPath, useRunEvents, type RunDetail } from './api';
import { AppIcon, ICONS } from './AppIcon';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { RunBody } from './Result';
import { InstallFromFile } from './Install';
import { Advice } from './Advice';
import { ExamplesEditor } from './Examples';
import { Versions } from './Versions';
import { FolderBox } from './Folder';
import { KeepsEditor } from './Keeps';
import { RunSteps } from './Steps';
import { StepsEditor } from './StepsEditor';

/** A flow that is only the task (one agent step, as Work in steps makes it): its instructions, to go back to one task. */
const oneTask = (flow: Flow): string | null => {
  const [s, ...rest] = flow.steps;
  return !rest.length && s?.do === 'agent' && !s.if && !s.failed && !flow.outputs ? s.instructions : null;
};

const BLANK: AppRecipe = {
  name: '',
  icon: 'sparkles',
  color: 'blue',
  description: '',
  agent: 'claude',
  prompt: '',
  fields: [],
  answer: [],
  tools: null,
  limits: {},
};

// Every part of the recipe, so a save keeps what this page does not show yet (its data, memory, needs, other flows).
const recipeOf = (a: AppDef | AppTemplate): AppRecipe => {
  const { name, icon, color, description, category, assistant, agent, acpAgent, model, effort, mode, cwd, prompt, fields, answer, tools, limits, flow, data, memory, requires, flows, screens, examples, graph, block } = a;
  return { name, icon, color, description, category, assistant, agent, acpAgent, model, effort, mode, cwd, prompt, fields, answer, tools, limits, flow, data, memory, requires, flows, screens, examples, graph, block };
};

/** A text box that grows with what is written in it. */
function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} className={cx(inputCls, 'block h-auto resize-none py-2', props.className)} />;
}

function IconPick({ icon, color, onChange }: { icon: string; color: string; onChange: (p: { icon?: string; color?: string }) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="relative shrink-0 rounded-[14px] transition active:scale-95" aria-label="Change the icon">
        <AppIcon icon={icon} color={color} size={52} />
        <span className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-elevated text-fg-3">
          <ChevronDown size={12} />
        </span>
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={316}>
        <div className="p-2">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.entries(APP_COLORS).map(([k, c]) => (
              <button key={k} type="button" onClick={() => onChange({ color: k })} aria-label={k} className={cx('h-6 w-6 rounded-full ring-offset-2 ring-offset-elevated transition', color === k && 'ring-2 ring-fg')} style={{ background: c }} />
            ))}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {APP_ICONS.map((n) => {
              const I = ICONS[n];
              return (
                <button key={n} type="button" onClick={() => onChange({ icon: n })} aria-label={n} className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg', icon === n && 'bg-bg-2 text-fg ring-1 ring-line-2')}>
                  <I size={16} />
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </>
  );
}

function Row({ children, onUp, onDown, onRemove }: { children: ReactNode; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <div className="group flex gap-2 rounded-xl border border-line bg-bg-1 p-2.5">
      <div className="flex shrink-0 flex-col">
        <IconButton label="Move up" size="sm" onClick={onUp} disabled={!onUp}>
          <ArrowUp size={14} />
        </IconButton>
        <IconButton label="Move down" size="sm" onClick={onDown} disabled={!onDown}>
          <ArrowDown size={14} />
        </IconButton>
      </div>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <IconButton label="Remove" size="sm" onClick={onRemove}>
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}

// The kit's field without its full width, so a row can size its parts.
const bare = inputCls.replace('w-full', '');
const small = cx(bare, 'h-8.5 w-full text-[13.5px]');
const smallFit = cx(bare, 'h-8.5 text-[13.5px]');
const move = <T,>(list: T[], i: number, by: number) => {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + by, 0, x);
  return next;
};

function FieldRow({ f, auto, onChange, ...nav }: { f: AppField; auto: boolean; onChange: (f: AppField, id?: string) => void; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const [more, setMore] = useState(!f.label);
  return (
    <Row {...nav}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(smallFit, 'min-w-[160px] flex-[2]')} placeholder="The question, e.g. Where to?" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} />
        <select className={cx(smallFit, 'min-w-[120px] flex-1')} value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as AppField['type'], options: e.target.value === 'choice' ? (f.options ?? []) : undefined })}>
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
          <Switch on={!!f.required} onChange={(on) => onChange({ ...f, required: on || undefined })} label="Needed" />
          Needed
        </label>
      </div>
      {f.type === 'choice' && (
        <textarea
          className={cx(inputCls, 'h-auto py-1.5 text-[13px]')}
          rows={Math.min(6, Math.max(2, (f.options?.length ?? 0) + 1))}
          placeholder="The choices, one per line"
          value={(f.options ?? []).join('\n')}
          onChange={(e) => onChange({ ...f, options: e.target.value.split('\n') })}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
        <code className="rounded bg-bg-3 px-1.5 py-px font-mono text-[11.5px] text-fg-2" title={auto ? 'Follows the question until the task uses it' : undefined}>{`{{${f.id}}}`}</code>
        <button type="button" onClick={() => setMore((m) => !m)} className="text-left hover:text-fg">
          {more ? 'Fewer details' : 'Help text, example, default…'}
        </button>
      </div>
      {more && (
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={small} placeholder="Help under the question" value={f.help ?? ''} onChange={(e) => onChange({ ...f, help: e.target.value || undefined })} />
          <input className={small} placeholder="An example answer" value={f.placeholder ?? ''} onChange={(e) => onChange({ ...f, placeholder: e.target.value || undefined })} />
          <input className={small} placeholder="Filled in at first" value={f.default ?? ''} onChange={(e) => onChange({ ...f, default: e.target.value || undefined })} />
        </div>
      )}
    </Row>
  );
}

function AnswerRow({ f, onChange, ...nav }: { f: AnswerField; onChange: (f: AnswerField) => void; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const cols = f.columns ?? [];
  return (
    <Row {...nav}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(smallFit, 'min-w-[150px] flex-[2]')} placeholder="A heading, e.g. Recommendation" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} />
        <select className={cx(smallFit, 'min-w-[110px] flex-1')} value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as AnswerField['type'], columns: e.target.value === 'table' ? (f.columns?.length ? f.columns : [{ id: 'item', label: 'Item', type: 'text' }]) : undefined })}>
          {ANSWER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
          <Switch on={!!f.required} onChange={(on) => onChange({ ...f, required: on || undefined })} label="Needed" />
          Needed
        </label>
      </div>
      <input className={small} placeholder="What goes here, for the agent (optional)" value={f.description ?? ''} onChange={(e) => onChange({ ...f, description: e.target.value || undefined })} />
      {f.type === 'table' && (
        <div className="space-y-1.5 rounded-lg border border-line bg-panel p-2">
          <div className="text-[12px] text-fg-3">Columns</div>
          {cols.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={cx(smallFit, 'min-w-0 flex-1')}
                placeholder="Column"
                value={c.label}
                onChange={(e) => onChange({ ...f, columns: cols.map((x, j) => (j === i ? { ...x, label: e.target.value, id: fieldId(e.target.value || 'column', cols.filter((_, k) => k !== i).map((y) => y.id)) } : x)) })}
              />
              <select className={cx(smallFit, 'w-[104px] shrink-0 px-2')} value={c.type} onChange={(e) => onChange({ ...f, columns: cols.map((x, j) => (j === i ? { ...x, type: e.target.value as typeof c.type } : x)) })}>
                {COLUMN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <IconButton label="Remove the column" size="sm" onClick={() => onChange({ ...f, columns: cols.filter((_, j) => j !== i) })} disabled={cols.length < 2}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
          <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => onChange({ ...f, columns: [...cols, { id: fieldId('column', cols.map((c) => c.id)), label: '', type: 'text' }] })}>
            Add a column
          </button>
        </div>
      )}
    </Row>
  );
}

/** A new template in words: the App builder makes it, in a session of its own. */
function Describe() {
  const [ask, setAsk] = useState('');
  return (
    <form
      className="min-w-[min(100%,320px)] flex-1 space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ask.trim()) return;
        go(`/?assistant=app-builder&prompt=${enc(`${tr('Make me an app: ')}${ask.trim()}`)}`);
      }}
    >
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
        <Sparkles size={13} className="text-accent" />
        Or describe the app, and an agent makes it
      </span>
      <div className="flex gap-2">
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Keeps the links I send, sums each up, and lists the unread ones" className={cx(inputCls, 'min-w-0 flex-1')} />
        <Button type="submit" variant="secondary" disabled={!ask.trim()}>
          Ask
        </Button>
      </div>
    </form>
  );
}

/** A test of what is on screen: the form, then the run as it goes. */
function TestRun({ recipe, appId, open, onClose, onKeep }: { recipe: AppRecipe; appId: string | null; open: boolean; onClose: () => void; onKeep: (inputs: FormValues) => void }) {
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<FormFiles>({});
  const [run, setRun] = useState<{ run: AppRun; progress?: RunProgress; steps?: RunDetail['steps'] } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) (setValues(initialValues(recipe.fields)), setFiles({}), setRun(null));
  }, [open]);
  const refresh = (id: string) => api<RunDetail>(`/api/apps/runs/${enc(id)}`).then((d) => setRun({ run: d.run, progress: d.progress, steps: d.steps }), () => {});
  useRunEvents((r) => run && r.id === run.run.id && refresh(r.id));
  useEffect(() => {
    if (!run || !isActive(run.run.status)) return;
    const t = setInterval(() => refresh(run.run.id), 2000);
    return () => clearInterval(t);
  }, [run?.run.id, run && isActive(run.run.status)]);
  const start = async () => {
    const errs = formErrors(recipe.fields, values, files);
    if (Object.keys(errs).length) return toast(`Fill in ${Object.keys(errs).map((k) => recipe.fields.find((f) => f.id === k)?.label).join(', ')}`, 'error');
    setBusy(true);
    try {
      const r = await post<{ run: AppRun }>(`/api/apps/${enc(appId ?? 'test')}/runs`, { recipe, source: 'test', inputs: values, files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, { name: f.name, data: f.data }])) });
      setRun({ run: r.run });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Test run · ${recipe.name || 'Untitled app'}`}
      width={640}
      footer={
        run ? (
          <>
            {run.run.key && (
              <Button variant="ghost" onClick={() => go(`/s/${enc(run.run.key!)}`)}>
                Open the session
              </Button>
            )}
            {!isActive(run.run.status) && (
              <Button
                variant="ghost"
                onClick={() => {
                  onKeep(values);
                  onClose();
                }}
              >
                Keep as an example
              </Button>
            )}
            <Button variant="secondary" onClick={() => setRun(null)}>
              Test again
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={busy ? <Throbber /> : <FlaskConical size={14} />} onClick={start} disabled={busy}>
              Run the test
            </Button>
          </>
        )
      }
    >
      {run ? (
        <div className="space-y-3">
          {run.steps && (
            <RunSteps
              steps={run.steps}
              onAgain={
                isActive(run.run.status)
                  ? undefined
                  : (step) =>
                      post<{ run: AppRun }>(`/api/apps/runs/${enc(run.run.id)}/again`, { from: step, recipe }).then(
                        (x) => setRun({ run: x.run }),
                        toastError,
                      )
              }
            />
          )}
          <RunBody run={run.run} progress={run.progress} answer={recipe.answer} name={recipe.name} />
        </div>
      ) : (
        <AppForm
          fields={recipe.fields}
          values={values}
          files={files}
          onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))}
          onFile={(k, v) =>
            setFiles((x) => {
              const n = { ...x };
              if (v) n[k] = v;
              else delete n[k];
              return n;
            })
          }
        />
      )}
    </Dialog>
  );
}

/** `embedded`: beside a session's conversation (`session`), where an agent builds it: no way back, a save stays here, and a step can be asked about there. */
export function BuilderPage({ id, template, from, embedded, session }: { id?: string; template?: string; from?: string; embedded?: boolean; session?: string }) {
  const [recipe, setRecipe] = useState<AppRecipe | null>(id || template || from ? null : BLANK);
  const [saved, setSaved] = useState<AppDef | null>(null);
  // The version on screen as it was loaded or saved here: what differs from it is not saved yet.
  const loaded = useRef('');
  const [newer, setNewer] = useState<AppDef | null>(null);
  const [newerBy, setNewerBy] = useState<string>('');
  const load = (a: AppDef) => {
    const r = recipeOf(a);
    loaded.current = JSON.stringify(r);
    setSaved(a);
    setRecipe(r);
    setNewer(null);
  };
  const [note, setNote] = useState('');
  // What the next save says it did, when it is not what the changes say (a version brought back).
  const why = useRef<string | undefined>(undefined);
  const noteBox = useRef<HTMLDivElement>(null);
  const [auto, setAuto] = useState<Set<string>>(new Set());
  const [tools, setTools] = useState<{ name: string; description: string }[] | null>(null);
  const [assistants, setAssistants] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const acpList = useApp((s) => s.boot?.acpAgents) ?? [];
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (id)
      api<{ app: AppDef }>(`/api/apps/${enc(id)}`).then((r) => load(r.app), (e) => (toastError(e), embedded || go('/apps')));
    else if (template) api<{ template: AppTemplate }>(`/api/apps/tpl:${enc(template)}`).then((r) => setRecipe(recipeOf(r.template)), (e) => (toastError(e), setRecipe(BLANK)));
    else if (from)
      post<{ recipe: AppRecipe; note?: string }>('/api/apps/draft', { key: from }).then(
        (r) => {
          setRecipe(r.recipe);
          if (r.note) setNote(r.note);
        },
        (e) => (toastError(e), setRecipe(BLANK)),
      );
    api<{ tools: { name: string; description: string }[] }>('/api/apps/tools').then((r) => setTools(r.tools), () => setTools([]));
    // Assistants, when that capability offers them.
    api<{ assistants?: { id: string; name: string }[] } | { id: string; name: string }[]>('/api/assistants').then(
      (r) => setAssistants((Array.isArray(r) ? r : (r.assistants ?? [])).filter((a) => a && typeof a.id === 'string')),
      () => {},
    );
  }, [id, template, from]);

  const set = (p: Partial<AppRecipe>) => setRecipe((r) => (r ? { ...r, ...p } : r));
  // Another save (an agent's, or this template open elsewhere): taken at once, or offered while there are changes here.
  useFeatureEvent('apps', ({ data }) => {
    const a = (data as { app?: { id: string; updatedAt: number; by?: string } } | undefined)?.app;
    // While this page saves, the news is of its own save.
    if (!a || !saved || busy || a.id !== saved.id || a.updatedAt <= saved.updatedAt) return;
    api<{ app: AppDef }>(`/api/apps/${enc(a.id)}`).then((r) => {
      if (recipe && JSON.stringify(recipe) !== loaded.current) (setNewer(r.app), setNewerBy(a.by ?? ''));
      else {
        load(r.app);
        if (a.by === 'folder') toast('Changed in its folder');
      }
    }, () => {});
  });
  const used = useMemo(() => new Set(placeholders(recipe?.prompt ?? '')), [recipe?.prompt]);

  if (!recipe)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-fg-3">
        <Throbber size={28} />
        {from && <div className="text-[13px]">Drafting an app from the session…</div>}
      </div>
    );

  const ids = recipe.fields.map((f) => f.id);
  const unknown = [...used].filter((p) => p !== 'today' && !ids.includes(p));
  const unusedNeeded = recipe.fields.filter((f) => f.required && !used.has(f.id));

  const insert = (text: string) => {
    const el = prompt.current;
    const v = recipe.prompt;
    const at = el ? el.selectionStart : v.length;
    const end = el ? el.selectionEnd : v.length;
    set({ prompt: v.slice(0, at) + text + v.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };

  const changeField = (i: number, f: AppField) => {
    const prev = recipe.fields[i];
    let next = f;
    // A new question's placeholder follows its wording until the task uses it.
    if (auto.has(prev.id) && f.label !== prev.label && !used.has(prev.id)) {
      const id2 = fieldId(f.label || 'question', ids.filter((x) => x !== prev.id));
      next = { ...f, id: id2 };
      setAuto((s) => new Set([...[...s].filter((x) => x !== prev.id), id2]));
    }
    set({ fields: recipe.fields.map((x, j) => (j === i ? next : x)) });
  };

  const addField = () => {
    const nid = fieldId('question', ids);
    setAuto((s) => new Set([...s, nid]));
    set({ fields: [...recipe.fields, { id: nid, label: '', type: 'text' }] });
  };

  const addAnswer = () => set({ answer: [...recipe.answer, { id: fieldId('answer', recipe.answer.map((a) => a.id)), label: '', type: 'text' }] });

  // A new answer field takes its name from its heading; a saved one keeps its own (programs read it).
  const cleanAnswer = () => {
    const taken: string[] = [];
    return recipe.answer.map((a) => {
      const id = /^answer(_\d+)?$/.test(a.id) && a.label ? fieldId(a.label, taken) : a.id;
      taken.push(id);
      return { ...a, id };
    });
  };

  const save = async () => {
    if (!recipe.name.trim()) return toast('Give the app a name', 'error');
    if (!recipe.prompt.trim() && !recipe.flow) return toast('Write the task: it is what the agent is asked to do', 'error');
    setBusy(true);
    try {
      const body = { recipe: { ...recipe, answer: cleanAnswer(), fields: recipe.fields.map((f) => ({ ...f, options: f.options?.map((o) => o.trim()).filter(Boolean) })) }, ...(template && !saved ? { template } : {}), ...(why.current ? { why: why.current } : {}) };
      const r = saved ? await put<{ app: AppDef }>(`/api/apps/${enc(saved.id)}`, body) : await post<{ app: AppDef }>('/api/apps', body);
      why.current = undefined;
      // Beside the conversation: it stays, and the agent that builds it hears of the change.
      if (embedded && saved) {
        load(r.app);
        toast('Saved: the agent hears of your changes with your next message', 'ok');
        return;
      }
      toast(saved ? 'Saved' : `${r.app.name} is ready`);
      go(appPath(r.app.id));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  // The task as a first step: an agent that does it and hands in the answer fields, for steps to go before and after.
  const inSteps = () => set({ flow: { steps: [{ id: 'task', title: 'Do the task', do: 'agent', instructions: recipe.prompt, ...(recipe.answer.length ? { outputs: cleanAnswer() } : {}) }] }, prompt: '' });

  const sample = Object.fromEntries(recipe.fields.map((f) => [f.id, f.default || `[${f.label || f.id}]`]));
  const back = saved ? appPath(saved.id) : template ? appPath(`tpl:${template}`) : '/apps';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            {!embedded && (
              <IconButton label="Back" size="sm" onClick={() => go(back)} className="-ml-1">
                <ArrowLeft size={17} />
              </IconButton>
            )}
            <span className="truncate">{saved ? `Edit ${saved.name}` : 'New app'}</span>
          </span>
        }
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<FlaskConical size={14} />} onClick={() => (recipe.prompt.trim() || recipe.flow ? setTesting(true) : toast('Write the task first', 'error'))}>
              <span className="max-sm:hidden">Test run</span>
            </Button>
            <Button size="sm" variant="primary" onClick={save} disabled={busy}>
              {saved ? 'Save' : 'Create'}
            </Button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[820px] space-y-4 px-4 py-6 pb-24 sm:px-6">
          {note && (
            <div ref={noteBox} className="scroll-mt-16 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-snug">
              {note}
            </div>
          )}
          {newer && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-[13px] leading-snug">
              <span className="min-w-0 flex-1">{newerBy === 'folder' ? 'It changed in its folder while you changed it here.' : 'A newer version was saved (by the agent, or elsewhere) while you changed it here.'}</span>
              <Button size="sm" variant="secondary" onClick={() => load(newer)}>
                Load it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => (setSaved(newer), setNewer(null))}>
                Keep mine
              </Button>
            </div>
          )}
          {!saved && !template && !from && (
            <div className="-mt-1 flex flex-wrap items-end gap-x-4 gap-y-2">
              <Describe />
              <InstallFromFile />
            </div>
          )}
          <Section>
            <div className="flex items-start gap-4">
              <IconPick icon={recipe.icon} color={recipe.color} onChange={set} />
              <div className="min-w-0 flex-1 space-y-2">
                <input className={cx(inputCls, 'text-[15px] font-medium')} placeholder="Name, e.g. Trip planner" value={recipe.name} onChange={(e) => set({ name: e.target.value })} />
                <Grow className="text-[13.5px] leading-snug" placeholder="What it does, in a sentence" value={recipe.description} onChange={(e) => set({ description: e.target.value })} />
              </div>
            </div>
          </Section>

          <Section title="The form" sub="The questions someone answers before each run.">
            <div className="space-y-2">
              {recipe.fields.map((f, i) => (
                <FieldRow
                  key={i}
                  f={f}
                  auto={auto.has(f.id)}
                  onChange={(nf) => changeField(i, nf)}
                  onUp={i ? () => set({ fields: move(recipe.fields, i, -1) }) : undefined}
                  onDown={i < recipe.fields.length - 1 ? () => set({ fields: move(recipe.fields, i, 1) }) : undefined}
                  onRemove={() => set({ fields: recipe.fields.filter((_, j) => j !== i) })}
                />
              ))}
              <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={addField}>
                Add a question
              </Button>
            </div>
          </Section>

          {recipe.flow ? (
            <Section
              title="What it does"
              sub="Its steps, in order: each can use the form’s answers and what the steps before it gave."
              actions={
                oneTask(recipe.flow) && (
                  <button type="button" onClick={() => set({ prompt: oneTask(recipe.flow!)!, flow: undefined })} className="text-[12.5px] text-fg-3 hover:text-fg">
                    Back to one task
                  </button>
                )
              }
            >
              <div className="space-y-3">
                {saved && <Advice app={saved} recipe={recipe} onChange={set} session={session} />}
                <StepsEditor
                  recipe={{ ...recipe, flow: recipe.flow }}
                  appId={saved?.id ?? null}
                  onChange={set}
                  onAsk={session ? (st) => composeInsert(tr(`About the step “${titleOf(st)}” (${st.id}) of the app: `), session) : undefined}
                />
              </div>
            </Section>
          ) : (
          <Section
            title="The task"
            sub="What the agent is asked to do, with the answers put in."
            actions={
              <span className="flex items-center gap-3">
                <button type="button" onClick={() => setPreview((p) => !p)} className="text-[12.5px] text-fg-3 hover:text-fg">
                  {preview ? 'Edit' : 'Preview'}
                </button>
                <button type="button" onClick={inSteps} className="text-[12.5px] text-fg-3 hover:text-fg">
                  Work in steps
                </button>
              </span>
            }
          >
            {recipe.fields.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-fg-3">Insert</span>
                {recipe.fields.map((f) => (
                  <button key={f.id} type="button" onClick={() => insert(`{{${f.id}}}`)} className={cx('h-6.5 rounded-md px-2 font-mono text-[11.5px] ring-1 ring-inset transition-colors', used.has(f.id) ? 'bg-bg-2 text-fg-2 ring-line' : 'bg-accent-soft text-accent ring-accent/30')}>
                    {f.label || f.id}
                  </button>
                ))}
                <button type="button" onClick={() => insert('{{today}}')} className="h-6.5 rounded-md bg-bg-2 px-2 font-mono text-[11.5px] text-fg-3 ring-1 ring-line ring-inset">
                  today
                </button>
              </div>
            )}
            {preview ? (
              <div className="max-h-[420px] overflow-y-auto rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2 text-[13.5px] leading-relaxed whitespace-pre-wrap">{fillTemplate(recipe.prompt, sample, { known: ids }) || <span className="text-fg-3">Nothing yet.</span>}</div>
            ) : (
              <textarea
                ref={prompt}
                className={cx(inputCls, 'h-auto min-h-[180px] py-2 text-[13.5px] leading-relaxed')}
                rows={10}
                placeholder={'e.g. Plan a {{days}}-day trip to {{destination}}. Check opening hours for those dates, keep travel short, and give a budget.'}
                value={recipe.prompt}
                onChange={(e) => set({ prompt: e.target.value })}
              />
            )}
            <div className="mt-2 space-y-1 text-[12px] leading-snug text-fg-3">
              <div>
                <code className="font-mono">{'{{question}}'}</code> is replaced by its answer. Text between <code className="font-mono">{'{{#question}}'}</code> and <code className="font-mono">{'{{/question}}'}</code> stays only when it was answered (and not with No).
              </div>
              {unknown.length > 0 && <div className="text-warn">{unknown.map((u) => `{{${u}}}`).join(', ')} {unknown.length > 1 ? 'are' : 'is'} not a question, so it stays as written.</div>}
              {unusedNeeded.length > 0 && <div className="text-warn">{unusedNeeded.map((f) => f.label || f.id).join(', ')} {unusedNeeded.length > 1 ? 'are' : 'is'} never used in the task.</div>}
            </div>
          </Section>
          )}

          <Section title="The answer" sub={recipe.flow ? 'What a run gives back: it shows as a card or a table, and comes back as JSON to programs. What it does says where each comes from.' : 'Fields the agent fills in when it is done (with submit_result): they show as a card or a table, and come back as JSON to programs. None: the reply is the answer.'}>
            <div className="space-y-2">
              {recipe.answer.map((a, i) => (
                <AnswerRow
                  key={i}
                  f={a}
                  onChange={(na) => set({ answer: recipe.answer.map((x, j) => (j === i ? na : x)) })}
                  onUp={i ? () => set({ answer: move(recipe.answer, i, -1) }) : undefined}
                  onDown={i < recipe.answer.length - 1 ? () => set({ answer: move(recipe.answer, i, 1) }) : undefined}
                  onRemove={() => set({ answer: recipe.answer.filter((_, j) => j !== i) })}
                />
              ))}
              <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={addAnswer}>
                Add an answer field
              </Button>
              <div className="flex items-center gap-3 border-t border-line pt-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px]">A block</span>
                  <span className="block text-[12px] text-fg-3">Offered when other apps add a step: its form is what it is given, its answer what it gives.</span>
                </span>
                <Switch on={!!recipe.block} label="A block" onChange={(on) => set({ block: on || undefined })} />
              </div>
            </div>
          </Section>

          <Section title="Examples" sub="Answers to try it with, and checks on what a run gives: to try a change, and to notice when it gets worse.">
            <ExamplesEditor recipe={recipe} appId={saved?.id ?? null} onChange={set} />
          </Section>

          <Section title="What it keeps" sub="Lists of records it keeps between runs, which its steps, its agents and its screen share, and a memory of its own.">
            <KeepsEditor recipe={recipe} onChange={set} />
          </Section>

          <Section title="Who does it" sub="The agent, its model and mode. Runs go ahead without anyone watching, so pick a mode that does not stop to ask (Auto, or one that allows edits).">
            <div className="flex flex-wrap items-center gap-1">
              <AgentPicker
                agent={recipe.agent}
                acpId={recipe.acpAgent ?? null}
                acpList={acpList}
                onPick={(a: Agent, aid) => set({ agent: a, acpAgent: aid ?? undefined, model: undefined, mode: undefined, effort: undefined })}
              />
              <ModelPicker agent={recipe.agent} acp={recipe.acpAgent} value={recipe.model ?? null} onChange={(v) => set({ model: v ?? undefined })} />
              <EffortPicker agent={recipe.agent} acp={recipe.acpAgent} model={recipe.model} value={recipe.effort ?? null} onChange={(v) => set({ effort: v ?? undefined })} />
              <ModePicker agent={recipe.agent} acp={recipe.acpAgent} value={recipe.mode ?? (recipe.agent === 'acp' && recipe.acpAgent !== 'console' ? null : 'auto')} onChange={(v) => set({ mode: v })} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {assistants.length > 0 && (
                <label className="block min-w-0">
                  <span className="mb-1 block text-[12.5px] text-fg-3">Assistant</span>
                  <select className={inputCls} value={recipe.assistant ?? ''} onChange={(e) => set({ assistant: e.target.value || undefined })}>
                    <option value="">None</option>
                    {assistants.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="min-w-0">
                <span className="mb-1 block text-[12.5px] text-fg-3">Folder</span>
                <div className="flex h-9.5 items-center gap-2 rounded-[10px] border border-line-2 bg-bg-1 px-2">
                  {recipe.cwd ? (
                    <>
                      <FolderChip value={recipe.cwd} onChange={(p) => set({ cwd: p })} />
                      <span className="flex-1" />
                      <button type="button" className="text-[12px] text-fg-3 hover:text-fg" onClick={() => set({ cwd: undefined })}>
                        Use a new one each time
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate pl-1 text-[13px] text-fg-2">A new folder for each run</span>
                      <button type="button" className="shrink-0 text-[12px] text-accent hover:underline" onClick={() => set({ cwd: useApp.getState().boot?.defaultCwd ?? '~' })}>
                        Pick one
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Tools" sub="What the runs may use from Naget Agent’s own tools (web search, pages, memory…). The agent’s own files and commands follow its mode.">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-[13.5px]">{recipe.tools === null ? 'All of them' : `${recipe.tools.length} picked`}</span>
              <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
                All
                <Switch on={recipe.tools === null} onChange={(on) => set({ tools: on ? null : (tools ?? []).map((t) => t.name) })} label="All tools" />
              </label>
            </div>
            {recipe.tools !== null && (
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                {(tools ?? []).map((t) => {
                  const on = recipe.tools!.includes(t.name);
                  return (
                    <label key={t.name} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-2" title={t.description}>
                      <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={on} onChange={() => set({ tools: on ? recipe.tools!.filter((x) => x !== t.name) : [...recipe.tools!, t.name] })} />
                      <span className="min-w-0">
                        <span className="block font-mono text-[12.5px]">{t.name}</span>
                        <span className="block truncate text-[11.5px] text-fg-3">{t.description}</span>
                      </span>
                    </label>
                  );
                })}
                {tools && !tools.length && <div className="text-[12.5px] text-fg-3">No tools to pick from.</div>}
              </div>
            )}
          </Section>

          {saved && !embedded && (
            <Section title="Its folder" sub="Work on it as files, in any editor or with a coding agent: what you save there comes here.">
              <FolderBox app={saved} />
            </Section>
          )}
          {saved && (
            <Section title="Versions" sub="Each save that changed what it does (by you, an agent or its folder), and how its examples went with it.">
              <Versions
                app={saved}
                onBring={(r, n) => {
                  setRecipe(recipeOf({ ...saved, ...r, screens: saved.screens }));
                  why.current = tr(`Brought back version ${n}`);
                  setNote(tr(`Version ${n} is on screen: save to bring it back (it becomes the newest version), or leave without saving.`));
                  setTimeout(() => noteBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
              />
            </Section>
          )}
          <Section title="Limits">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-fg-3">Runs a day (from anywhere)</span>
                <input className={cx(inputCls, 'tnum')} inputMode="numeric" placeholder="No limit" value={recipe.limits.runsPerDay ?? ''} onChange={(e) => set({ limits: { ...recipe.limits, runsPerDay: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-fg-3">Most one run may spend (US$)</span>
                <input className={cx(inputCls, 'tnum')} inputMode="decimal" placeholder="No cap" defaultValue={recipe.limits.capUsd ?? ''} onBlur={(e) => set({ limits: { ...recipe.limits, capUsd: Number(e.target.value) > 0 ? Number(e.target.value) : undefined } })} />
              </label>
            </div>
          </Section>
        </div>
      </div>
      <TestRun
        recipe={{ ...recipe, answer: cleanAnswer() }}
        appId={saved?.id ?? null}
        open={testing}
        onClose={() => setTesting(false)}
        onKeep={(inputs) => {
          const list = recipe.examples ?? [];
          set({ examples: [...list, { id: fieldId('example', list.map((x) => x.id)), inputs }] });
          toast('Kept as an example: give it checks under Examples', 'ok');
        }}
      />
    </div>
  );
}

// Making or changing an app: its face, the questions of its form, the task with the answers put in (or
// its steps, once it works in steps), the answer fields of its result, what it keeps between runs, who
// does it (agent, model, mode, assistant, folder), which tools it may use, its limits, and a test run of
// what is on screen before saving. "Save as template" in a session's menu opens it with a draft from that
// session.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Bot, ChevronDown, ClipboardList, Database, Ellipsis, Eye, FileOutput, FlaskConical, FolderOpen, Gauge, History, Images, KeyRound, Palette, Plus, Puzzle, Settings2, Sparkles, Trash2, Workflow, Wrench, X } from 'lucide-react';
import { tr } from '../../i18n/runtime';
import type { Agent } from '@shared/types';
import type { AnswerField, AppDef, AppField, AppRecipe, AppRun, AppTemplate, RunProgress } from '@shared/apps';
import type { Flow } from '@shared/app-manifest';
import { allSteps, titleOf } from '@shared/app-manifest';
import { ANSWER_TYPES, APP_COLORS, APP_ICONS, COLUMN_TYPES, fieldId, FIELD_TYPES, fillTemplate, isActive, placeholders } from '@shared/apps';
import { api, enc, post, put } from '../../lib/api';
import { composeInsert, useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { EffortPicker, ModelPicker, ModePicker } from '../../components/AgentPickers';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, Popover, Section, Segmented, Switch, Throbber, useMediaQuery } from '../../components/ui';
import { AgentPicker } from '../home/AgentPicker';
import { PageHeader } from '../layout/PageHeader';
import { appPath, useRunEvents, type RunDetail } from './api';
import { AppIcon, ICONS } from './AppIcon';
import { AppForm, formErrors, initialValues, type FormFiles, type FormValues } from './Form';
import { ResultView, RunBody } from './Result';
import { DesignEditor, sampleResult } from './Design';
import { AppView } from './View';
import { InstallFromFile } from './Install';
import { Advice } from './Advice';
import { ExamplesEditor } from './Examples';
import { Versions } from './Versions';
import { FolderBox } from './Folder';
import { KeepsEditor } from './Keeps';
import { RunSteps } from './Steps';
import { StepsEditor } from './StepsEditor';
import { FilesEditor, SecretsEditor } from './Needs';

/** A flow that is only the task (one agent step, as Work in steps makes it): its instructions, to go back to one task. */
const oneTask = (flow: Flow): string | null => {
  const [s, ...rest] = flow.steps;
  return !rest.length && s?.do === 'agent' && !s.if && !s.failed && !flow.outputs ? s.instructions : null;
};

/** The builder's parts, one on screen at a time: what it does first. */
type Part = 'does' | 'form' | 'answer' | 'design' | 'examples' | 'settings';
/** How its steps show on a computer, as last picked: the graph unless the list was. */
const VIEW_KEY = 'naget.apps.view';
const viewWas = (): 'list' | 'graph' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'graph';
  } catch {
    return 'graph';
  }
};

/** The builder's parts as tabs, each with its icon. */
const PARTS: { value: Part; label: string; icon: typeof Workflow }[] = [
  { value: 'does', label: 'What it does', icon: Workflow },
  { value: 'form', label: 'Form', icon: ClipboardList },
  { value: 'answer', label: 'Answer', icon: FileOutput },
  { value: 'design', label: 'Design', icon: Palette },
  { value: 'examples', label: 'Examples', icon: FlaskConical },
  { value: 'settings', label: 'Settings', icon: Settings2 },
];

/** The parts' tabs: one row where the page is wide, two rows of three where it is narrow (a phone, beside a conversation), so none is out of sight. */
function PartTabs({ value, onChange, counts }: { value: Part; onChange: (p: Part) => void; counts: Partial<Record<Part, number>> }) {
  return (
    <div role="tablist" aria-label="Parts of the app" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-panel p-1 @2xl:grid-cols-6">
      {PARTS.map(({ value: v, label, icon: I }) => {
        const on = v === value;
        const n = counts[v];
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className={cx(
              'relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 font-medium transition-colors @2xl:h-10 @2xl:flex-row @2xl:gap-2',
              on ? 'bg-bg-2 text-fg ring-1 ring-line-2' : 'text-fg-3 hover:bg-bg-1 hover:text-fg',
            )}
          >
            <I size={16} className={cx('shrink-0', on && 'text-accent')} />
            <span className="max-w-full truncate text-[12px] @2xl:text-[13.5px]">{label}</span>
            {!!n && <span className={cx('tnum absolute top-1.5 right-2 rounded-md px-1.5 text-[10.5px] leading-[16px] font-normal @2xl:static @2xl:text-[11.5px]', on ? 'bg-bg-3 text-fg-2' : 'bg-bg-2 text-fg-3')}>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A list of Settings' parts in one box, each a row. */
const LIST = 'divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel';

/** A part of Settings, folded to a line that says how it is set until it is opened. */
function Fold({ icon, title, summary, sub, children }: { icon: ReactNode; title: string; summary?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-1 sm:px-5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-bg-2 text-fg-2">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">{title}</span>
          <span className={cx('block text-[12.5px] leading-snug text-fg-3', !open && 'truncate')}>{open ? sub : summary}</span>
        </span>
        <ChevronDown size={16} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-4 pt-1 pb-5 sm:pr-5 sm:pl-[64px]">{children}</div>}
    </section>
  );
}

/** A row of Settings that is one switch. */
function SwitchRow({ icon, title, sub, on, onChange }: { icon: ReactNode; title: string; sub: ReactNode; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <section className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-bg-2 text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-[12.5px] leading-snug text-fg-3">{sub}</span>
      </span>
      <Switch on={on} label={title} onChange={onChange} />
    </section>
  );
}

/** A preview beside what it shows: a quiet box with what it is. */
function PreviewBox({ note, children }: { note: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Eye size={14} className="shrink-0 text-fg-3" />
        <span className="text-[12.5px] font-medium text-fg-2">Preview</span>
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-fg-3">{note}</span>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

/** The form as the app's page asks it, as it is on screen: a change shows at once. */
function FormPreview({ fields }: { fields: AppField[] }) {
  const shown = fields.filter((f) => f.label.trim());
  const [values, setValues] = useState<FormValues>(() => initialValues(shown));
  const [files, setFiles] = useState<FormFiles>({});
  // A question added or its kind, choices or first answer changed: the form starts again.
  const shape = JSON.stringify(shown.map((f) => [f.id, f.type, f.default ?? '', f.options ?? []]));
  useEffect(() => setValues(initialValues(shown)), [shape]);
  return (
    <PreviewBox note="As its page asks it">
      {shown.length ? (
        <AppForm
          fields={shown}
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
      ) : (
        <p className="text-[13px] leading-relaxed text-fg-3">No questions: it runs at once, without asking anything.</p>
      )}
    </PreviewBox>
  );
}

/** A run's answer as a card, with made-up values in its shape. */
function AnswerPreview({ recipe }: { recipe: AppRecipe }) {
  const fields = recipe.answer.filter((a) => a.label.trim());
  const shape = JSON.stringify(fields);
  const result = useMemo(() => sampleResult(fields, recipe.assets), [shape, recipe.assets]);
  return (
    <PreviewBox note={recipe.ui ? 'As a plain card; its view, under Design, shows it its own way' : 'A made-up answer, as a run shows it'}>
      {fields.length ? <ResultView answer={fields} result={result} name={recipe.name} assets={recipe.assets} /> : <p className="text-[13px] leading-relaxed text-fg-3">No answer fields: the agent’s reply is the answer.</p>}
    </PreviewBox>
  );
}

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
  const { name, icon, color, description, category, assistant, agent, acpAgent, model, effort, mode, cwd, prompt, fields, answer, tools, limits, flow, data, memory, requires, secrets, assets, flows, screens, ui, examples, graph, block, sessions } = a;
  return { name, icon, color, description, category, assistant, agent, acpAgent, model, effort, mode, cwd, prompt, fields, answer, tools, limits, flow, data, memory, requires, secrets, assets, flows, screens, ui, examples, graph, block, sessions };
};

/** A text box that grows with what is written in it, and with how narrow it is. `base`: its look, the kit's field unless given. */
function Grow({ base, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; base?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight + 2, 240)}px`;
  };
  useLayoutEffect(fit, [props.value]);
  // A tab that makes the page wider or narrower (the graph's, Design's), a phone turned: its lines change, so does its height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} {...props} className={cx(base ?? inputCls, 'block h-auto resize-none py-2', props.className)} />;
}

/** The name and description: text until pointed at, a box while written in. */
const inline = 'w-full rounded-[10px] border border-transparent bg-transparent px-2.5 outline-none transition-colors placeholder:text-fg-3 hover:border-line-2 focus:border-accent/60 focus:bg-bg-1 focus:ring-3 focus:ring-accent/15';

function IconPick({ icon, color, onChange }: { icon: string; color: string; onChange: (p: { icon?: string; color?: string }) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="group relative shrink-0 rounded-[16px] transition active:scale-95" aria-label="Change the icon" title="Change the icon">
        <AppIcon icon={icon} color={color} size={60} />
        <span className="absolute -right-1 -bottom-1 flex h-5.5 w-5.5 items-center justify-center rounded-full border border-line bg-elevated text-fg-3 transition-colors group-hover:text-fg">
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

/** A question's or an answer field's ⋯: move it up or down, or remove it. */
function RowMenu({ onUp, onDown, onRemove }: { onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const act = (f?: () => void) => () => {
    setOpen(false);
    f?.();
  };
  return (
    <>
      <IconButton ref={ref} label="More" size="sm" onClick={() => setOpen((o) => !o)} active={open}>
        <Ellipsis size={16} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={190}>
        <MenuItem icon={<ArrowUp size={14} />} disabled={!onUp} onClick={act(onUp)}>
          Move up
        </MenuItem>
        <MenuItem icon={<ArrowDown size={14} />} disabled={!onDown} onClick={act(onDown)}>
          Move down
        </MenuItem>
        <MenuItem icon={<Trash2 size={14} />} danger onClick={act(onRemove)}>
          Remove
        </MenuItem>
      </Popover>
    </>
  );
}

/** A question or an answer field: its number, what it is, and its ⋯. */
function Row({ n, children, onUp, onDown, onRemove }: { n: number; children: ReactNode; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-bg-1 p-3">
      <span className="tnum mt-[7px] grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bg-3 text-[12px] font-semibold text-fg-2 @max-md:hidden">{n}</span>
      <div className="min-w-0 flex-1 space-y-2.5">{children}</div>
      <div className="-mr-1 pt-[3px]">
        <RowMenu onUp={onUp} onDown={onDown} onRemove={onRemove} />
      </div>
    </div>
  );
}

/** Add one more to a list: a wide, quiet button at its end. */
function AddRow({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-[13.5px] font-medium text-fg-2 transition-colors hover:border-accent/60 hover:bg-accent-soft hover:text-accent">
      <Plus size={15} />
      {children}
    </button>
  );
}

/** A small label over a box. */
function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] text-fg-3">{label}</span>
      {children}
    </label>
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

/** Needed, with its switch: what a question or an answer field cannot be without. */
function Needed({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex h-8.5 shrink-0 cursor-pointer items-center gap-2 text-[13px] text-fg-2">
      <Switch on={on} onChange={onChange} label="Needed" />
      Needed
    </label>
  );
}

function FieldRow({ f, n, auto, onChange, ...nav }: { f: AppField; n: number; auto: boolean; onChange: (f: AppField, id?: string) => void; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const [more, setMore] = useState(!f.label);
  return (
    <Row n={n} {...nav}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(smallFit, 'min-w-[200px] flex-[3] font-medium')} placeholder="The question, e.g. Where to?" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} />
        <select className={cx(smallFit, 'min-w-[130px] flex-1')} aria-label="Its kind" value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as AppField['type'], options: e.target.value === 'choice' ? (f.options ?? []) : undefined, multi: e.target.value === 'choice' ? f.multi : undefined })}>
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Needed on={!!f.required} onChange={(on) => onChange({ ...f, required: on || undefined })} />
      </div>
      {f.type === 'choice' && (
        <>
          <textarea
            className={cx(inputCls, 'h-auto py-1.5 text-[13px] leading-relaxed')}
            rows={Math.min(6, Math.max(2, (f.options?.length ?? 0) + 1))}
            placeholder="The choices, one per line"
            value={(f.options ?? []).join('\n')}
            onChange={(e) => onChange({ ...f, options: e.target.value.split('\n') })}
          />
          <label className="flex h-8.5 w-fit cursor-pointer items-center gap-2 text-[13px] text-fg-2">
            <Switch on={!!f.multi} onChange={(on) => onChange({ ...f, multi: on || undefined })} label="Several can be picked" />
            Several can be picked
          </label>
        </>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-3">
        <code className="rounded-md bg-bg-3 px-1.5 py-px font-mono text-[11.5px] text-fg-2" translate="no" title={auto ? 'Follows the question until the task uses it' : 'How the task names its answer'}>{`{{${f.id}}}`}</code>
        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="inline-flex items-center gap-1 text-left hover:text-fg">
          {more ? 'Fewer details' : 'Help text, example, default…'}
          <ChevronDown size={12} className={cx('transition-transform', more && 'rotate-180')} />
        </button>
      </div>
      {more && (
        <div className="grid gap-2 @xl:grid-cols-3">
          <Labeled label="Help under the question">
            <input className={small} placeholder="Optional" value={f.help ?? ''} onChange={(e) => onChange({ ...f, help: e.target.value || undefined })} />
          </Labeled>
          <Labeled label="An example answer">
            <input className={small} placeholder="Optional" value={f.placeholder ?? ''} onChange={(e) => onChange({ ...f, placeholder: e.target.value || undefined })} />
          </Labeled>
          <Labeled label="Filled in at first">
            <input className={small} placeholder="Optional" value={f.default ?? ''} onChange={(e) => onChange({ ...f, default: e.target.value || undefined })} />
          </Labeled>
        </div>
      )}
    </Row>
  );
}

function AnswerRow({ f, n, onChange, ...nav }: { f: AnswerField; n: number; onChange: (f: AnswerField) => void; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  const cols = f.columns ?? [];
  return (
    <Row n={n} {...nav}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cx(smallFit, 'min-w-[200px] flex-[3] font-medium')} placeholder="A heading, e.g. Recommendation" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value })} />
        <select className={cx(smallFit, 'min-w-[130px] flex-1')} aria-label="Its kind" value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as AnswerField['type'], columns: e.target.value === 'table' ? (f.columns?.length ? f.columns : [{ id: 'item', label: 'Item', type: 'text' }]) : undefined })}>
          {ANSWER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Needed on={!!f.required} onChange={(on) => onChange({ ...f, required: on || undefined })} />
      </div>
      <input className={small} placeholder="What goes here, for the agent (optional)" value={f.description ?? ''} onChange={(e) => onChange({ ...f, description: e.target.value || undefined })} />
      {f.type === 'table' && (
        <div className="space-y-1.5 rounded-lg border border-line bg-panel p-2.5">
          <div className="text-[12px] font-medium text-fg-2">Columns</div>
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

/** A new app in words: the App builder makes it, in a session of its own. Or one from a file. */
function Describe() {
  const [ask, setAsk] = useState('');
  return (
    // On a phone the way to install a file goes under the box, so the title keeps its line.
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3.5 sm:px-5 sm:py-4">
      <span className="order-1 flex min-w-0 flex-1 items-center gap-2 text-[14px] font-semibold">
        <Sparkles size={15} className="shrink-0 text-accent" />
        Describe an app, and an agent makes it
      </span>
      <span className="order-4 sm:order-2">
        <InstallFromFile />
      </span>
      <form
        className="order-3 flex w-full gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ask.trim()) return;
          go(`/?assistant=app-builder&prompt=${enc(`${tr('Make me an app: ')}${ask.trim()}`)}`);
        }}
      >
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Keeps the links I send, sums each up, and lists the unread ones" className={cx(inputCls.replace('bg-bg-1', 'bg-panel'), 'min-w-0 flex-1')} />
        <Button type="submit" variant="primary" disabled={!ask.trim()}>
          Make it
        </Button>
      </form>
    </section>
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
          <RunBody
            assets={recipe.assets}
            run={run.run}
            progress={run.progress}
            answer={recipe.answer}
            name={recipe.name}
            view={recipe.ui ? <AppView ui={recipe.ui} name={recipe.name} appId={appId ?? 'test'} run={run.run} answer={recipe.answer} can={['keep', 'run', ...(appId ? (['data'] as const) : [])]} assets={recipe.assets} /> : undefined}
          />
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
  const [part, setPart] = useState<Part>('does');
  // The graph wants room: phones keep the list.
  const wide = useMediaQuery('(min-width: 1000px)');
  const [view, setViewNow] = useState<'list' | 'graph'>(viewWas);
  const setView = (v: 'list' | 'graph') => {
    setViewNow(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

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
    // The tools its agents may be allowed (not those only steps have).
    api<{ tools: { name: string; description: string; stepOnly?: boolean }[] }>('/api/apps/tools').then((r) => setTools(r.tools.filter((t) => !t.stepOnly)), () => setTools([]));
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

  // What it does, as one task, a list of steps or a graph of them (on a computer): a task becomes a first step.
  const mode: 'task' | 'list' | 'graph' = !recipe.flow ? 'task' : wide ? view : 'list';
  const pickMode = (m: 'task' | 'list' | 'graph') => {
    if (m === 'task') {
      const task = recipe.flow ? oneTask(recipe.flow) : null;
      if (task !== null) set({ prompt: task, flow: undefined });
      return;
    }
    if (!recipe.flow) inSteps();
    setView(m);
  };
  const modeSwitch = (
    <Segmented
      size="sm"
      value={mode}
      onChange={pickMode}
      options={[
        ...(!recipe.flow || oneTask(recipe.flow) !== null ? [{ value: 'task' as const, label: 'One task' }] : []),
        { value: 'list' as const, label: 'List' },
        ...(wide ? [{ value: 'graph' as const, label: 'Graph' }] : []),
      ]}
    />
  );
  // Settings, each in a line until it is opened.
  const agentName = recipe.agent === 'acp' ? (acpList.find((a) => a.id === recipe.acpAgent)?.name ?? recipe.acpAgent ?? 'Agent') : recipe.agent === 'codex' ? 'Codex' : 'Claude Code';
  const whoLine = [agentName, recipe.model || tr('Default model'), recipe.mode === 'auto' || !recipe.mode ? tr('Auto') : recipe.mode].join(' · ');
  const lists = Object.keys(recipe.data ?? {}).length;
  const keepsLine = [lists ? tr(`${lists} list${lists > 1 ? 's' : ''}`) : tr('No lists'), recipe.memory ? tr('remembers across runs') : null].filter(Boolean).join(' · ');
  const limitsLine =
    [recipe.limits.runsPerDay ? tr(`${recipe.limits.runsPerDay} runs a day`) : null, recipe.limits.capUsd ? tr(`at most $${recipe.limits.capUsd} a run`) : null].filter(Boolean).join(' · ') || tr('No limits');

  // Changed since it was loaded or saved here.
  const changed = !!saved && JSON.stringify(recipe) !== loaded.current;
  const counts: Partial<Record<Part, number>> = { does: recipe.flow ? allSteps(recipe.flow.steps).length : undefined, form: recipe.fields.length, answer: recipe.answer.length, examples: recipe.examples?.length };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={saved ? `Edit ${saved.name}` : 'New app'}
        back={embedded ? undefined : { label: 'Back', onClick: () => go(back) }}
        actions={
          <>
            {changed && <span className="mr-1 text-[12.5px] text-fg-3 max-sm:hidden">Not saved yet</span>}
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
        {/* One width for every part, so nothing moves from one tab to the next. */}
        <div className="@container mx-auto max-w-[1120px] space-y-4 px-4 py-5 pb-24 sm:px-6 sm:py-6">
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
          {!saved && !template && !from && <Describe />}
          <section className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-4 sm:gap-4 sm:p-5">
            <IconPick icon={recipe.icon} color={recipe.color} onChange={set} />
            <div className="-mt-1 min-w-0 flex-1 space-y-0.5">
              <input className={cx(inline, 'h-10 !text-[19px] font-semibold tracking-tight')} aria-label="Name" placeholder="Name, e.g. Trip planner" value={recipe.name} onChange={(e) => set({ name: e.target.value })} />
              <Grow base={inline} className="text-[14px] leading-snug text-fg-2" aria-label="Description" placeholder="What it does, in a sentence" value={recipe.description} onChange={(e) => set({ description: e.target.value })} />
            </div>
          </section>

          {/* The tabs stay in reach while a long part scrolls (not on a phone, where they take two rows). */}
          <div className="z-20 -mx-2 bg-bg/90 px-2 py-1 backdrop-blur @2xl:sticky @2xl:top-0">
            <PartTabs value={part} onChange={setPart} counts={counts} />
          </div>

          {part === 'form' && (
            <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_340px]">
              <Section title="The form" sub="The questions someone answers before each run.">
                <div className="space-y-2.5">
                  {recipe.fields.map((f, i) => (
                    <FieldRow
                      key={i}
                      n={i + 1}
                      f={f}
                      auto={auto.has(f.id)}
                      onChange={(nf) => changeField(i, nf)}
                      onUp={i ? () => set({ fields: move(recipe.fields, i, -1) }) : undefined}
                      onDown={i < recipe.fields.length - 1 ? () => set({ fields: move(recipe.fields, i, 1) }) : undefined}
                      onRemove={() => set({ fields: recipe.fields.filter((_, j) => j !== i) })}
                    />
                  ))}
                  <AddRow onClick={addField}>Add a question</AddRow>
                </div>
              </Section>
              <div className="@max-4xl:hidden @4xl:sticky @4xl:top-[68px]">
                <FormPreview fields={recipe.fields} />
              </div>
            </div>
          )}

          {part === 'does' &&
            (recipe.flow ? (
              <Section title="What it does" sub="Its steps: each can use the form’s answers, the built-in values (today, now…) and what the steps before it gave." actions={modeSwitch}>
                <div className="space-y-3">
                  {saved && <Advice app={saved} recipe={recipe} onChange={set} session={session} />}
                  <StepsEditor
                    view={mode === 'graph' ? 'graph' : 'list'}
                    onPart={setPart}
                    recipe={{ ...recipe, flow: recipe.flow }}
                    appId={saved?.id ?? null}
                    onChange={set}
                    onAsk={session ? (st) => composeInsert(tr(`About the step “${titleOf(st)}” (${st.id}) of the app: `), session) : undefined}
                  />
                </div>
              </Section>
            ) : (
              <Section title="The task" sub="What the agent is asked to do, with the answers put in." actions={modeSwitch}>
                <div className="overflow-hidden rounded-xl border border-line-2 bg-bg-1 transition-colors focus-within:border-accent/60 focus-within:ring-3 focus-within:ring-accent/15">
                  {/* Its toolbar: the answers and built-in values to put in where the cursor is, and Preview. */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2.5 py-2">
                    <span className="mr-0.5 text-[12px] text-fg-3">Insert</span>
                    {recipe.fields.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        disabled={preview}
                        onClick={() => insert(`{{${f.id}}}`)}
                        title={used.has(f.id) ? `{{${f.id}}}` : 'Not in the task yet'}
                        className={cx('h-6.5 rounded-md px-2 text-[12px] ring-1 ring-inset transition-colors disabled:opacity-50', used.has(f.id) ? 'bg-bg-2 text-fg-2 ring-line hover:text-fg' : 'bg-accent-soft text-accent ring-accent/30')}
                      >
                        {f.label || f.id}
                      </button>
                    ))}
                    {(['today', 'now', 'weekday'] as const).map((b) => (
                      <button key={b} type="button" disabled={preview} onClick={() => insert(`{{${b}}}`)} className="h-6.5 rounded-md bg-bg-2 px-2 font-mono text-[11.5px] text-fg-3 ring-1 ring-line ring-inset hover:text-fg disabled:opacity-50">
                        {b}
                      </button>
                    ))}
                    <span className="flex-1" />
                    <button type="button" onClick={() => setPreview((p) => !p)} aria-pressed={preview} className={cx('inline-flex h-6.5 items-center gap-1.5 rounded-md px-2 text-[12.5px] transition-colors', preview ? 'bg-bg-3 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}>
                      <Eye size={13} />
                      {preview ? 'Edit' : 'Preview'}
                    </button>
                  </div>
                  {preview ? (
                    <div className="max-h-[480px] min-h-[240px] overflow-y-auto px-3.5 py-3 text-[14px] leading-relaxed whitespace-pre-wrap">{fillTemplate(recipe.prompt, sample, { known: ids }) || <span className="text-fg-3">Nothing yet.</span>}</div>
                  ) : (
                    <textarea
                      ref={prompt}
                      className="block min-h-[240px] w-full resize-y bg-transparent px-3.5 py-3 text-[14px] leading-relaxed outline-none placeholder:text-fg-3"
                      rows={12}
                      aria-label="The task"
                      placeholder={'e.g. Plan a {{days}}-day trip to {{destination}}. Check opening hours for those dates, keep travel short, and give a budget.'}
                      value={recipe.prompt}
                      onChange={(e) => set({ prompt: e.target.value })}
                    />
                  )}
                </div>
                <div className="mt-2.5 space-y-1 text-[12px] leading-snug text-fg-3">
                  <div>
                    <code className="font-mono">{'{{question}}'}</code> is replaced by its answer. Text between <code className="font-mono">{'{{#question}}'}</code> and <code className="font-mono">{'{{/question}}'}</code> stays only when it was answered (and not with No).
                  </div>
                  {unknown.length > 0 && <div className="text-warn">{unknown.map((u) => `{{${u}}}`).join(', ')} {unknown.length > 1 ? 'are' : 'is'} not a question, so it stays as written.</div>}
                  {unusedNeeded.length > 0 && <div className="text-warn">{unusedNeeded.map((f) => f.label || f.id).join(', ')} {unusedNeeded.length > 1 ? 'are' : 'is'} never used in the task.</div>}
                </div>
              </Section>
            ))}

          {part === 'answer' && (
            <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1fr)_340px]">
              <Section title="The answer" sub={recipe.flow ? 'What a run gives back: it shows as a card or a table, and comes back as JSON to programs. What it does says where each comes from.' : 'Fields the agent fills in when it is done (with submit_result): they show as a card or a table, and come back as JSON to programs. None: the reply is the answer.'}>
                <div className="space-y-2.5">
                  {recipe.answer.map((a, i) => (
                    <AnswerRow
                      key={i}
                      n={i + 1}
                      f={a}
                      onChange={(na) => set({ answer: recipe.answer.map((x, j) => (j === i ? na : x)) })}
                      onUp={i ? () => set({ answer: move(recipe.answer, i, -1) }) : undefined}
                      onDown={i < recipe.answer.length - 1 ? () => set({ answer: move(recipe.answer, i, 1) }) : undefined}
                      onRemove={() => set({ answer: recipe.answer.filter((_, j) => j !== i) })}
                    />
                  ))}
                  <AddRow onClick={addAnswer}>Add an answer field</AddRow>
                </div>
              </Section>
              <div className="@max-4xl:hidden @4xl:sticky @4xl:top-[68px] @4xl:max-h-[calc(100dvh-140px)] @4xl:overflow-y-auto @4xl:rounded-2xl">
                <AnswerPreview recipe={recipe} />
              </div>
            </div>
          )}

          {part === 'design' && (
            <Section title="How its answer looks" sub="Its view: pages of elements made for its answer, filled in by each run, and what a click there does.">
              <DesignEditor recipe={recipe} appId={saved?.id ?? null} template={template} session={session} onChange={set} />
            </Section>
          )}

          {part === 'design' && (
            <div className={LIST}>
              <Fold icon={<Images size={16} />} title="Its own files" summary={Object.keys(recipe.assets ?? {}).length ? tr(`${Object.keys(recipe.assets ?? {}).length} files`) : tr('None yet')} sub="Pictures, videos, sounds and data that come with it, for its view to show.">
                <FilesEditor recipe={recipe} onChange={set} />
              </Fold>
            </div>
          )}

          {part === 'examples' && (
            <Section title="Examples" sub="Answers to try it with, and checks on what a run gives: to try a change, and to notice when it gets worse.">
              <ExamplesEditor recipe={recipe} appId={saved?.id ?? null} onChange={set} />
            </Section>
          )}

          {part === 'settings' && (
          <div className="space-y-4">
          <div className={LIST}>
          <Fold icon={<Bot size={16} />} title="Who does it" summary={whoLine} sub="The agent, its model and mode. Runs go ahead without anyone watching, so pick a mode that does not stop to ask (Auto, or one that allows edits).">
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
                  <span className="mb-1 block text-[12.5px] text-fg-3">Agent</span>
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
          </Fold>

          <Fold icon={<KeyRound size={16} />} title="Keys it needs" summary={recipe.secrets?.length ? recipe.secrets.map((s) => s.label || s.name).join(', ') : tr('None')} sub="API keys and tokens its runs use, kept in your vault, never in the app.">
            <SecretsEditor recipe={recipe} onChange={set} />
          </Fold>

          <Fold icon={<Database size={16} />} title="What it keeps" summary={keepsLine} sub="Lists of records it keeps between runs, which its steps, its agents and its screen share, and a memory of its own.">
            <KeepsEditor recipe={recipe} onChange={set} />
          </Fold>

          <Fold icon={<Wrench size={16} />} title="Tools" summary={recipe.tools === null ? tr('All of Hydor’s own tools') : tr(`${recipe.tools.length} picked`)} sub="What the runs may use from Hydor’s own tools (web search, pages, memory…). The agent’s own files and commands follow its mode.">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 text-[13.5px]">{recipe.tools === null ? 'All of them' : `${recipe.tools.length} picked`}</span>
              <label className="flex items-center gap-2 text-[12.5px] text-fg-2">
                All
                <Switch on={recipe.tools === null} onChange={(on) => set({ tools: on ? null : (tools ?? []).map((t) => t.name) })} label="All tools" />
              </label>
            </div>
            {recipe.tools !== null && (
              <div className="mt-2 grid gap-1 @xl:grid-cols-2 @5xl:grid-cols-3">
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
          </Fold>

          <Fold icon={<Gauge size={16} />} title="Limits" summary={limitsLine} sub="So that it cannot run or spend more than you mean it to.">
            <div className="grid gap-3 @xl:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-fg-3">Runs a day (from anywhere)</span>
                <input className={cx(inputCls, 'tnum')} inputMode="numeric" placeholder="No limit" value={recipe.limits.runsPerDay ?? ''} onChange={(e) => set({ limits: { ...recipe.limits, runsPerDay: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined } })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12.5px] text-fg-3">Most one run may spend (US$)</span>
                <input className={cx(inputCls, 'tnum')} inputMode="decimal" placeholder="No cap" defaultValue={recipe.limits.capUsd ?? ''} onBlur={(e) => set({ limits: { ...recipe.limits, capUsd: Number(e.target.value) > 0 ? Number(e.target.value) : undefined } })} />
              </label>
            </div>
          </Fold>

          <SwitchRow icon={<Puzzle size={16} />} title="A block" sub="Offered when other apps add a step: its form is what it is given, its answer what it gives." on={!!recipe.block} onChange={(on) => set({ block: on || undefined })} />
          </div>

          {saved && (
            <div className={LIST}>
              {!embedded && (
                <Fold icon={<FolderOpen size={16} />} title="Its folder" summary={saved.folder ?? tr('Not made yet')} sub="Work on it as files, in any editor or with a coding agent: what you save there comes here.">
                  <FolderBox app={saved} />
                </Fold>
              )}
              <Fold icon={<History size={16} />} title="Versions" summary={tr('Each save that changed what it does, to bring back')} sub="Each save that changed what it does (by you, an agent or its folder), and how its examples went with it.">
                <Versions
                  app={saved}
                  onBring={(r, n) => {
                    setRecipe(recipeOf({ ...saved, ...r, screens: saved.screens }));
                    why.current = tr(`Brought back version ${n}`);
                    setNote(tr(`Version ${n} is on screen: save to bring it back (it becomes the newest version), or leave without saving.`));
                    setTimeout(() => noteBox.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                  }}
                />
              </Fold>
            </div>
          )}
          </div>
          )}
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

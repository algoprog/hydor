// What a template does, step by step, to change by hand (the builder's What it does): its steps in order,
// each opening to its settings, the steps inside a Decide, a Repeat or side by side below it, values from
// the form and the steps before put in from a short menu, and the flow's checks as you go. Agents change
// the same steps through the API; shared/app-manifest.ts has the format and the checks.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AppWindow, ArrowDown, ArrowUp, Bot, Braces, CodeXml, Columns2, Copy, Database, Ellipsis, MessageCircleQuestion, MessageSquare, Plus, Repeat, Sigma, Sparkles, Split, Trash2, Wrench, X } from 'lucide-react';
import type { AnswerField, AppDef, AppField, AppRecipe, AppTemplate } from '@shared/apps';
import { ANSWER_TYPES, COLUMN_TYPES, fieldId, FIELD_TYPES } from '@shared/apps';
import type { DataOp, Flow, Step, StepKind, ValueOp } from '@shared/app-manifest';
import { allSteps, checkFlow, cleanFlow, givesOf, labelOf, RESCUED, STEP_KINDS, STEP_TOOLS, titleOf, VALUE_OPS } from '@shared/app-manifest';
import { api, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { BlockChips } from './Blocks';
import { GraphEditor } from './GraphEditor';
import { childList, editList, listsOf, move, type ListPath } from './paths';
import { cx, IconButton, inputCls, MenuItem, Popover, Segmented, Switch, useMediaQuery } from '../../components/ui';

const ICON: Record<StepKind, typeof Bot> = { agent: Bot, model: Sparkles, tool: Wrench, decide: Split, repeat: Repeat, parallel: Columns2, app: AppWindow, data: Database, ask: MessageCircleQuestion, code: CodeXml, value: Sigma };
const KIND = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k])) as Record<StepKind, (typeof STEP_KINDS)[number]>;
const OPS: { value: DataOp; label: string }[] = [
  { value: 'add', label: 'Add a record' },
  { value: 'find', label: 'Find records' },
  { value: 'search', label: 'Search them for a question' },
  { value: 'get', label: 'Get one by its id' },
  { value: 'update', label: 'Change records' },
  { value: 'remove', label: 'Remove records' },
];

const bare = inputCls.replace('w-full', '');
const small = cx(bare, 'h-8.5 w-full text-[13.5px]');

interface ToolInfo {
  name: string;
  description: string;
  step?: boolean;
  inputs?: { name: string; type?: string; required?: boolean; description?: string }[];
}

const refRe = (id: string) => new RegExp(`(\\{\\{\\s*[#^/]?\\s*)${id}(?=[.\\[}\\s])`, 'g');

/** The flow with a step's name changed, and every value that named it. */
function renamed(flow: Flow, from: string, to: string): Flow {
  const next: Flow = JSON.parse(JSON.stringify(flow).replace(refRe(from), `$1${to}`));
  for (const s of allSteps(next.steps)) {
    if (s.id === from) s.id = to;
    if (s.do === 'repeat' && s.collect === from) s.collect = to;
  }
  return next;
}

/** A copy of a step, it and the steps inside it with names of their own (and its values naming them changed to match). */
function copyOf(s: Step, taken: Set<string>): Step {
  const names = allSteps([s]).map((x) => {
    const fresh = fieldId(x.id, [...taken]);
    taken.add(fresh);
    return [x.id, fresh] as const;
  });
  let json = JSON.stringify(s);
  for (const [a, b] of names) json = json.replace(refRe(a), `$1${b}`);
  const copy: Step = JSON.parse(json);
  allSteps([copy]).forEach((x, n) => {
    x.id = names[n][1];
    if (x.do === 'repeat' && x.collect) x.collect = names.find(([a]) => a === x.collect)?.[1] ?? x.collect;
  });
  return copy;
}

const WORD: Record<StepKind, string> = { agent: 'agent', model: 'model', tool: 'tool', decide: 'decide', repeat: 'each', parallel: 'together', app: 'call', data: 'data', ask: 'ask', code: 'code', value: 'value' };

function newStep(kind: StepKind, taken: string[], recipe: AppRecipe): Step {
  const id = fieldId(WORD[kind], taken);
  switch (kind) {
    case 'agent':
      return { id, do: 'agent', instructions: '' };
    case 'model':
      return { id, do: 'model', instructions: '' };
    case 'tool':
      return { id, do: 'tool', tool: 'web_search', with: {} };
    case 'decide':
      return { id, do: 'decide', rule: '', then: [] };
    case 'repeat':
      return { id, do: 'repeat', over: '', steps: [] };
    case 'parallel':
      return { id, do: 'parallel', branches: [[], []] };
    case 'app':
      return { id, do: 'app', app: '' };
    case 'data':
      return { id, do: 'data', op: 'find', collection: Object.keys(recipe.data ?? {})[0] ?? '' };
    case 'ask':
      return { id, do: 'ask', question: '' };
    case 'code':
      return { id, do: 'code', language: 'javascript', code: CODE_START.javascript };
    case 'value':
      return { id, do: 'value', of: '', op: 'count' };
  }
}

/** What Work out a value asks besides the value, by what it works out: its label, a hint, an example. */
const VALUE_ARG: Partial<Record<ValueOp, [string, string, string]>> = {
  pick: ['The field', 'Each item’s field of this name', 'title'],
  sum: ['Of the field', 'Of this field of each (none: of the items)', 'price'],
  average: ['Of the field', 'Of this field of each (none: of the items)', 'price'],
  min: ['Of the field', 'Of this field of each (none: of the items)', 'price'],
  max: ['Of the field', 'Of this field of each (none: of the items)', 'price'],
  sort: ['By the field', '-field: highest first (none: the items themselves)', '-price'],
  join: ['Between them', ', unless set; \\n for a new line', ', '],
  date: ['Days later', 'Of the date (none: today)', '7'],
};

/** What a new code step starts with: its input read, its values returned. */
const CODE_START = {
  javascript: "const { text = '' } = input;\nreturn { words: text.split(/\\s+/).filter(Boolean).length };",
  typescript: "const text: string = String(input.text ?? '');\nreturn { words: text.split(/\\s+/).filter(Boolean).length };",
  python: "text = input.get('text', '')\nreturn {'words': len(text.split())}",
};

// ---- values ------------------------------------------------------------------------------------------------

interface Val {
  ref: string;
  label: string;
}
export interface ValGroup {
  label: string;
  vals: Val[];
}

/** The values a step at this place can use: the form's answers, what the steps before it gave, and its round's item. */
function valuesAt(flow: Flow, list: ListPath, i: number, fields: AppField[]): ValGroup[] {
  const before: Val[] = [];
  const here: Val[] = [];
  const visit = (s: Step) => {
    for (const g of givesOf(s) ?? []) before.push({ ref: `${s.id}.${g}`, label: `${titleOf(s)} › ${g}` });
    // A Decide's paths and the branches have ended by the next step (a Repeat's rounds have not: its values say what they gave).
    if (s.do !== 'repeat') for (const { key } of listsOf(s)) childList(s, key).forEach(visit);
    else if (Array.isArray(s.failed)) s.failed.forEach(visit);
  };
  let at = flow.steps;
  for (let k = 0; k + 1 < list.length; k += 2) {
    const idx = list[k] as number;
    const key = list[k + 1] as string;
    at.slice(0, idx).forEach(visit);
    const s = at[idx];
    if (!s) break;
    if (s.do === 'repeat' && key === 'steps') {
      if (s.over !== undefined) here.push({ ref: s.as || 'item', label: 'The item' });
      here.push({ ref: 'index', label: 'Its number, from 0' });
    }
    if (key === 'failed') here.push({ ref: 'error', label: 'Why it failed' });
    at = childList(s, key);
  }
  at.slice(0, i).forEach(visit);
  return [
    { label: 'The form', vals: fields.map((f) => ({ ref: f.id, label: f.label || f.id })) },
    { label: 'Steps before', vals: before },
    { label: 'Here', vals: here },
    { label: 'Other', vals: [{ ref: 'today', label: 'Today' }] },
  ].filter((g) => g.vals.length);
}

function ValuesMenu({ anchor, open, onClose, groups, onPick }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; groups: ValGroup[]; onPick: (ref: string) => void }) {
  const [q, setQ] = useState('');
  const all = groups.reduce((n, g) => n + g.vals.length, 0);
  const find = q.trim().toLowerCase();
  // Short enough to fit on the screen: past ten, the rest by finding.
  let room = 10;
  const shown = groups
    .map((g) => {
      const vals = g.vals.filter((v) => !find || `${v.label} ${v.ref}`.toLowerCase().includes(find)).slice(0, Math.max(0, room));
      room -= vals.length;
      return { ...g, vals };
    })
    .filter((g) => g.vals.length);
  const left = groups.reduce((n, g) => n + g.vals.filter((v) => !find || `${v.label} ${v.ref}`.toLowerCase().includes(find)).length, 0) - shown.reduce((n, g) => n + g.vals.length, 0);
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={320} align="end" title="Put in a value">
      <div className="p-1">
        {all > 10 && <input autoFocus className={cx(small, 'mb-1')} placeholder="Find a value" value={q} onChange={(e) => setQ(e.target.value)} />}
        {shown.map((g) => (
          <div key={g.label}>
            <div className="px-2.5 pt-1.5 pb-0.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{g.label}</div>
            {g.vals.map((v) => (
              <button key={v.ref} type="button" onClick={() => onPick(v.ref)} className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-bg-2">
                <span className="min-w-0 flex-1 truncate text-[13px]" translate="no">
                  {v.label}
                </span>
                <code className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-fg-3" translate="no">{`{{${v.ref}}}`}</code>
              </button>
            ))}
          </div>
        ))}
        {left > 0 && <div className="px-2.5 py-1.5 text-[12px] text-fg-3">{left} more: type to find them</div>}
        {!shown.length && <div className="px-2.5 py-2 text-[12.5px] text-fg-3">Nothing found</div>}
      </div>
    </Popover>
  );
}

/** The values a check on a run can read: the form's answers, what the steps gave, the answer fields and the reply. */
export function checkValues(recipe: AppRecipe): ValGroup[] {
  const groups = recipe.flow ? valuesAt(recipe.flow, [], recipe.flow.steps.length, recipe.fields).filter((g) => g.label !== 'Other') : [{ label: 'The form', vals: recipe.fields.map((f) => ({ ref: f.id, label: f.label || f.id })) }];
  groups.push({ label: 'Its answer', vals: recipe.answer.map((a) => ({ ref: `answer.${a.id}`, label: a.label || a.id })) }, { label: 'Other', vals: [{ ref: 'reply', label: 'Its reply' }] });
  return groups.filter((g) => g.vals.length);
}

/** A text box for words with values in them, and a button to put one in where the cursor is. */
export function RefText({ value, onChange, groups, multiline, placeholder, mono }: { value: string; onChange: (v: string) => void; groups: ValGroup[]; multiline?: boolean; placeholder?: string; mono?: boolean }) {
  const box = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    if (!multiline || !el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight + 2, 280)}px`;
  }, [value, multiline]);
  const put = (ref: string) => {
    const el = box.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const text = `{{${ref}}}`;
    onChange(value.slice(0, at) + text + value.slice(end));
    setOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + text.length, at + text.length);
    });
  };
  const cls = cx(small, 'pr-9', mono && 'font-mono text-[12.5px]');
  return (
    <div className="relative">
      {multiline ? (
        <textarea ref={box} rows={2} className={cx(cls, 'block h-auto resize-none py-1.5 leading-relaxed')} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input ref={box} className={cls} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      <button ref={btn} type="button" title="Put in a value" aria-label="Put in a value" onClick={() => setOpen((o) => !o)} className="absolute top-1 right-1 flex h-6.5 w-6.5 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
        <Braces size={13} />
      </button>
      <ValuesMenu anchor={btn} open={open} onClose={() => setOpen(false)} groups={groups} onPick={put} />
    </div>
  );
}

const asText = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));
/** What is typed, as a value: yes/no, numbers and JSON as themselves, anything else as words. */
function asValue(t: string): unknown {
  const x = t.trim();
  if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(x) || ((x.startsWith('{') || x.startsWith('[')) && !x.startsWith('{{'))) {
    try {
      return JSON.parse(x);
    } catch {}
  }
  return t;
}

/** Named values (a tool's inputs, a record, which records): one row each, the known names first (with `few`, the needed and set ones, the rest a word away). */
function NamedValues({ value, onChange, known, groups, free = true, few, keyLabel = 'Name' }: { value: Record<string, unknown> | undefined; onChange: (v: Record<string, unknown> | undefined) => void; known?: { name: string; label?: string; required?: boolean; hint?: string }[]; groups: ValGroup[]; free?: boolean; few?: boolean; keyLabel?: string }) {
  const v = value ?? {};
  const [all, setAll] = useState(false);
  const shown = (known ?? []).filter((k) => all || !few || k.required || v[k.name] !== undefined);
  const hidden = (known?.length ?? 0) - shown.length;
  const knownNames = new Set((known ?? []).map((k) => k.name));
  const others = Object.keys(v).filter((k) => !knownNames.has(k));
  const put = (k: string, text: string) => {
    const next: Record<string, unknown> = { ...v };
    if (text === '') delete next[k];
    else next[k] = asValue(text);
    onChange(Object.keys(next).length ? next : undefined);
  };
  const rename = (from: string, to: string) => onChange(Object.fromEntries(Object.entries(v).map(([k, x]) => [k === from ? to : k, x])));
  return (
    <div className="space-y-1.5">
      {shown.map((k) => (
        <label key={k.name} className="block">
          <span className="mb-0.5 flex items-baseline gap-1.5 text-[12px] text-fg-3">
            <span className="font-mono text-fg-2" translate="no">
              {k.label ?? k.name}
            </span>
            {k.required && <span className="text-err">*</span>}
            {k.hint && (
              <span className="min-w-0 truncate" translate="no">
                {k.hint}
              </span>
            )}
          </span>
          <RefText value={asText(v[k.name])} onChange={(t) => put(k.name, t)} groups={groups} />
        </label>
      ))}
      {others.map((k) => (
        <div key={k} className="flex items-start gap-1.5">
          <input className={cx(bare, 'h-8.5 w-[34%] shrink-0 font-mono text-[12.5px]')} aria-label={keyLabel} defaultValue={k} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== k && rename(k, e.target.value.trim())} />
          <div className="min-w-0 flex-1">
            <RefText value={asText(v[k])} onChange={(t) => put(k, t)} groups={groups} />
          </div>
          <IconButton label="Remove" size="sm" onClick={() => put(k, '')}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className="text-[12.5px] text-fg-3 hover:text-fg" onClick={() => setAll(true)}>
          {hidden} more inputs
        </button>
      )}
      {free && (
        <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => onChange({ ...v, [fieldId('value', Object.keys(v))]: '' })}>
          Add a value
        </button>
      )}
    </div>
  );
}

// ---- fields (a step's outputs, a list's fields) ------------------------------------------------------------------

const typeName = (t: string) => ANSWER_TYPES.find((x) => x.value === t)?.label ?? t;

function FieldForm({ f, taken, plain, onChange, onRemove }: { f: AnswerField; taken: string[]; plain?: boolean; onChange: (f: AnswerField) => void; onRemove: () => void }) {
  const cols = f.columns ?? [];
  // Its name follows its heading while it is a new one's.
  const follows = /^value(_\d+)?$/.test(f.id);
  return (
    <div className="space-y-2 p-2.5">
      <input autoFocus className={small} placeholder="Its heading, e.g. Summary" value={f.label} onChange={(e) => onChange({ ...f, label: e.target.value, ...(follows && e.target.value ? { id: fieldId(e.target.value, taken) } : {}) })} />
      <div className="flex items-center gap-2">
        <select className={cx(bare, 'h-8.5 min-w-0 flex-1 text-[13.5px]')} value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as AnswerField['type'], columns: e.target.value === 'table' ? (cols.length ? cols : [{ id: 'item', label: 'Item', type: 'text' }]) : undefined })}>
          {ANSWER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {!plain && (
          <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
            <Switch on={!!f.required} onChange={(on) => onChange({ ...f, required: on || undefined })} label="Needed" />
            Needed
          </label>
        )}
      </div>
      <input className={small} placeholder="What goes here (optional)" value={f.description ?? ''} onChange={(e) => onChange({ ...f, description: e.target.value || undefined })} />
      {f.type === 'table' && (
        <div className="space-y-1">
          <div className="text-[12px] text-fg-3">Columns</div>
          {cols.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <input className={cx(bare, 'h-8 min-w-0 flex-1 text-[13px]')} placeholder="Column" value={c.label} onChange={(e) => onChange({ ...f, columns: cols.map((x, j) => (j === i ? { ...x, label: e.target.value, id: fieldId(e.target.value || 'column', cols.filter((_, k) => k !== i).map((y) => y.id)) } : x)) })} />
              <select className={cx(bare, 'h-8 w-[96px] shrink-0 px-2 text-[13px]')} value={c.type} onChange={(e) => onChange({ ...f, columns: cols.map((x, j) => (j === i ? { ...x, type: e.target.value as typeof c.type } : x)) })}>
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
      <div className="flex items-center justify-between pt-0.5">
        <code className="font-mono text-[11.5px] text-fg-3" translate="no">
          {f.id}
        </code>
        <button type="button" className="text-[12.5px] text-err hover:underline" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

/** Fields as chips (a step's outputs, what a list's records hold, `plain`: none of them needed): one opens to change it. */
export function FieldChips({ fields, onChange, add, none, plain }: { fields: AnswerField[]; onChange: (f: AnswerField[]) => void; add: string; none?: string; plain?: boolean }) {
  const [edit, setEdit] = useState<number | null>(null);
  const chips = useRef<(HTMLButtonElement | null)[]>([]);
  const anchor = useMemo(
    () => ({
      get current() {
        return edit === null ? null : (chips.current[edit] ?? null);
      },
    }),
    [edit],
  );
  const ids = fields.map((f) => f.id);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fields.map((f, i) => (
        <button
          key={i}
          ref={(el) => {
            chips.current[i] = el;
          }}
          type="button"
          onClick={() => setEdit(i)}
          className="flex h-7 items-center gap-1.5 rounded-md bg-bg-2 px-2 text-[12.5px] ring-1 ring-line ring-inset hover:ring-line-2"
        >
          <span translate="no">{f.label || f.id}</span>
          <span className="text-fg-3">{typeName(f.type)}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          onChange([...fields, { id: fieldId('value', ids), label: '', type: 'text' }]);
          setEdit(fields.length);
        }}
        className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-accent hover:bg-bg-2"
      >
        <Plus size={13} />
        {add}
      </button>
      {!fields.length && none && <span className="text-[12px] text-fg-3">{none}</span>}
      {edit !== null && fields[edit] && (
        <Popover anchor={anchor} open onClose={() => setEdit(null)} width={300}>
          <FieldForm
            f={fields[edit]}
            taken={ids.filter((_, j) => j !== edit)}
            plain={plain}
            onChange={(nf) => onChange(fields.map((x, j) => (j === edit ? nf : x)))}
            onRemove={() => {
              onChange(fields.filter((_, j) => j !== edit));
              setEdit(null);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

/** An Ask a person step's form: a row for each question it asks (no files: an answer is typed). */
function AskForm({ fields, onChange }: { fields: AppField[]; onChange: (f: AppField[]) => void }) {
  const ids = fields.map((f) => f.id);
  const put = (i: number, f: AppField) => onChange(fields.map((x, j) => (j === i ? f : x)));
  return (
    <div className="space-y-1.5">
      {fields.map((f, i) => (
        <div key={i} className="space-y-1.5 rounded-lg border border-line p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              className={cx(bare, 'h-8.5 min-w-[140px] flex-[2] text-[13.5px]')}
              placeholder="The question, e.g. Which one?"
              value={f.label}
              onChange={(e) => put(i, { ...f, label: e.target.value, ...(/^(answer|question)(_\d+)?$/.test(f.id) && e.target.value ? { id: fieldId(e.target.value, ids.filter((_, j) => j !== i)) } : {}) })}
            />
            <select className={cx(bare, 'h-8.5 min-w-[110px] flex-1 text-[13.5px]')} value={f.type} onChange={(e) => put(i, { ...f, type: e.target.value as AppField['type'], options: e.target.value === 'choice' ? (f.options ?? []) : undefined })}>
              {FIELD_TYPES.filter((t) => t.value !== 'file').map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
              <Switch on={!!f.required} onChange={(on) => put(i, { ...f, required: on || undefined })} label="Needed" />
              Needed
            </label>
            <IconButton label="Remove" size="sm" onClick={() => onChange(fields.filter((_, j) => j !== i))} disabled={fields.length < 2}>
              <X size={14} />
            </IconButton>
          </div>
          {f.type === 'choice' && (
            <textarea className={cx(small, 'h-auto py-1.5 text-[13px]')} rows={Math.min(5, Math.max(2, (f.options?.length ?? 0) + 1))} placeholder="The choices, one per line" value={(f.options ?? []).join('\n')} onChange={(e) => put(i, { ...f, options: e.target.value.split('\n') })} />
          )}
        </div>
      ))}
      <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => onChange([...fields, { id: fieldId('question', ids), label: '', type: 'text' }])}>
        Add a question
      </button>
    </div>
  );
}

/** A program's text: monospace, Tab indents (two spaces in JavaScript, four in Python). */
function CodeBox({ value, onChange, language }: { value: string; onChange: (v: string) => void; language: 'javascript' | 'typescript' | 'python' }) {
  return (
    <textarea
      className={cx(small, 'block h-auto min-h-[150px] resize-y py-2 font-mono text-[12.5px] leading-relaxed')}
      rows={Math.min(18, Math.max(6, value.split('\n').length + 1))}
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        const el = e.currentTarget;
        const pad = language === 'python' ? '    ' : '  ';
        const at = el.selectionStart;
        onChange(value.slice(0, at) + pad + value.slice(el.selectionEnd));
        requestAnimationFrame(() => el.setSelectionRange(at + pad.length, at + pad.length));
      }}
    />
  );
}

const WAITS: [number, string][] = [
  [1, 'An hour'],
  [24, 'A day'],
  [72, 'Three days'],
  [168, 'A week'],
  [720, 'Thirty days'],
];

// ---- each kind's settings --------------------------------------------------------------------------------------

export interface Ctx {
  recipe: AppRecipe;
  flow: Flow;
  open: string | null;
  setOpen: (k: string | null) => void;
  update: (list: ListPath, i: number, s: Step) => void;
  rename: (from: string, to: string) => boolean;
  add: (list: ListPath, kind: StepKind) => void;
  /** Puts a step (a new one of a kind, or one made already) in a list at a place; gives its id. */
  insert: (list: ListPath, at: number, s: StepKind | Step) => string;
  /** A new step of a kind, with a name of its own (not put anywhere yet). */
  make: (kind: StepKind) => Step;
  /** A template made here (a block), for the steps that call one. */
  addApp: (a: AppDef) => void;
  /** The blocks Add a step offers: yours (but this one), and the ready-made ones. */
  blocks: { mine: AppDef[]; ready: AppTemplate[] };
  /** Puts in a step that calls a block (a ready-made one made yours first); gives its id. */
  useBlock: (list: ListPath, at: number, b: AppDef | AppTemplate) => Promise<string>;
  edit: (list: ListPath, f: (l: Step[]) => Step[]) => void;
  copy: (list: ListPath, i: number) => void;
  msgs: Map<string, { text: string; error: boolean }[]>;
  tools: ToolInfo[];
  models: { id: string; label: string }[];
  apps: AppDef[];
  /** Beside an agent's conversation: puts a question about a step in its message box. */
  ask?: (s: Step) => void;
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline gap-2 text-[12px] text-fg-3">
      <span className="shrink-0 font-medium text-fg-2">{children}</span>
      {hint && <span className="min-w-0 truncate">{hint}</span>}
    </span>
  );
}

function KindFields({ s, set, groups, ctx }: { s: Step; set: (s: Step) => void; groups: ValGroup[]; ctx: Ctx }) {
  switch (s.do) {
    case 'agent':
    case 'model':
      return (
        <>
          <div>
            <Label>{s.do === 'agent' ? 'What the agent does' : 'What the model is asked'}</Label>
            <RefText multiline value={s.instructions} onChange={(instructions) => set({ ...s, instructions })} groups={groups} placeholder={s.do === 'agent' ? 'e.g. Read {{url}} and note what changed since {{last.date}}' : 'e.g. Sort this message into bug, question or idea: {{message}}'} />
          </div>
          <div>
            <Label hint={s.outputs?.length ? undefined : s.do === 'agent' ? 'None: its reply' : 'None: its text'}>What it hands in</Label>
            <FieldChips fields={s.outputs ?? []} onChange={(o) => set({ ...s, outputs: o.length ? o : undefined })} add="Add" />
          </div>
          {s.do === 'model' && (
            <label className="block">
              <Label>The model</Label>
              <select className={small} value={s.model ?? ''} onChange={(e) => set({ ...s, model: e.target.value || undefined })}>
                <option value="">The helper model (Settings → Models)</option>
                {ctx.models.map((m) => (
                  <option key={m.id} value={m.id} translate="no">
                    {m.label}
                  </option>
                ))}
                {s.model && !ctx.models.some((m) => m.id === s.model) && <option value={s.model}>{s.model}</option>}
              </select>
            </label>
          )}
        </>
      );
    case 'tool': {
      const tools: ToolInfo[] = ctx.tools.length ? ctx.tools : STEP_TOOLS.map((name) => ({ name, description: '' }));
      const t = tools.find((x) => x.name === s.tool);
      return (
        <>
          <label className="block">
            <Label hint={t?.description}>The tool</Label>
            <select className={cx(small, 'font-mono text-[12.5px]')} value={s.tool} onChange={(e) => set({ ...s, tool: e.target.value, with: {} })}>
              {tools.map((x) => (
                <option key={x.name} value={x.name}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Label>Its inputs</Label>
            <NamedValues value={s.with} onChange={(w) => set({ ...s, with: w })} known={t?.inputs?.map((i) => ({ name: i.name, required: i.required, hint: i.description }))} groups={groups} free={!t?.inputs?.length} few />
          </div>
        </>
      );
    }
    case 'decide': {
      const by = s.ask !== undefined ? 'ask' : 'rule';
      return (
        <>
          <Segmented size="sm" value={by} onChange={(v) => set(v === 'ask' ? { ...s, rule: undefined, ask: s.ask ?? '' } : { ...s, ask: undefined, rule: s.rule ?? '' })} options={[{ value: 'rule', label: 'By a rule' }, { value: 'ask', label: 'By a question in words' }]} />
          {by === 'rule' ? (
            <div>
              <Label hint="=, !=, <, >, contains, is empty, joined by and / or">The rule</Label>
              <RefText mono value={s.rule ?? ''} onChange={(rule) => set({ ...s, rule })} groups={groups} placeholder="{{price}} < 100 and {{kind}} = bug" />
            </div>
          ) : (
            <div>
              <Label hint="The helper model answers yes or no">The question</Label>
              <RefText multiline value={s.ask ?? ''} onChange={(ask) => set({ ...s, ask })} groups={groups} placeholder="e.g. Does {{page.text}} announce a new product?" />
            </div>
          )}
        </>
      );
    }
    case 'repeat': {
      const by = s.over !== undefined ? 'over' : 'until';
      return (
        <>
          <Segmented size="sm" value={by} onChange={(v) => set(v === 'over' ? { ...s, over: s.over ?? '', until: undefined, untilAsk: undefined } : { ...s, over: undefined, until: s.until ?? '' })} options={[{ value: 'over', label: 'For each item of a list' }, { value: 'until', label: 'Until something holds' }]} />
          {by === 'over' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_90px]">
              <div className="min-w-0">
                <Label>The list</Label>
                <RefText mono value={s.over ?? ''} onChange={(over) => set({ ...s, over })} groups={groups} placeholder="{{find.records}}" />
              </div>
              <label className="block">
                <Label>Its item</Label>
                <input className={cx(small, 'font-mono text-[12.5px]')} placeholder="item" value={s.as ?? ''} onChange={(e) => set({ ...s, as: e.target.value.replace(/[^A-Za-z0-9_]/g, '') || undefined })} />
              </label>
              <label className="block">
                <Label>At once</Label>
                <select className={small} value={s.atOnce ?? 1} onChange={(e) => set({ ...s, atOnce: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <div className="min-w-0">
                <Label hint="Checked after each round">Until this holds</Label>
                <RefText mono value={s.until ?? ''} onChange={(until) => set({ ...s, until })} groups={groups} placeholder="{{check.count}} > 3" />
              </div>
              <label className="block">
                <Label>At most</Label>
                <input className={cx(small, 'tnum')} inputMode="numeric" placeholder="5 rounds" value={s.max ?? ''} onChange={(e) => set({ ...s, max: Number(e.target.value) > 0 ? Math.min(50, Math.round(Number(e.target.value))) : undefined })} />
              </label>
            </div>
          )}
        </>
      );
    }
    case 'parallel':
      return <div className="text-[12.5px] text-fg-3">Its branches run side by side; the next step starts when they have all ended.</div>;
    case 'code':
      return (
        <>
          <Segmented
            size="sm"
            value={s.language}
            onChange={(language) => set({ ...s, language, code: s.code.trim() && s.code !== CODE_START[s.language] ? s.code : CODE_START[language] })}
            options={[
              { value: 'javascript', label: 'JavaScript' },
              { value: 'typescript', label: 'TypeScript' },
              { value: 'python', label: 'Python' },
            ]}
          />
          <div>
            <Label hint={s.language === 'python' ? 'It reads input; what it gives back is the step’s values' : 'It reads input and may await (await import() for packages); what it gives back is the step’s values'}>The program</Label>
            <CodeBox value={s.code} onChange={(code) => set({ ...s, code })} language={s.language} />
            <div className="mt-1 text-[12px] leading-snug text-fg-3">It runs in a sandbox: no network, and nothing of this computer's files but the packages What it needs installs. What it prints is {`{{${s.id}.printed}}`}.</div>
            <div className="mt-1 text-[12px] leading-snug text-fg-3">
              <span>It reaches out through ctx, each call a step of the run, kept (after a restart, a call it made before gives what it gave then):</span>{' '}
              <code className="text-fg-2" translate="no">
                {s.language === 'python'
                  ? "ctx.model('Sum it up: {{text}}', with_={'text': t}) · ctx.agent(…) · ctx.tool('read_page', {'url': u}) · ctx.ask(…) · ctx.data.add('items', {…}) · ctx.app(…)"
                  : "await ctx.model('Sum it up: {{text}}', { with: { text } }) · ctx.agent(…) · ctx.tool('read_page', { url }) · ctx.ask(…) · ctx.data.add('items', {…}) · ctx.app(…)"}
              </code>
            </div>
          </div>
          <div>
            <Label hint={s.outputs?.length ? undefined : 'None: the fields of what it returns, whatever they are'}>What it gives</Label>
            <FieldChips fields={s.outputs ?? []} onChange={(o) => set({ ...s, outputs: o.length ? o : undefined })} add="Add" />
          </div>
          <div>
            <Label hint="input.name in the program">Its input</Label>
            <NamedValues value={s.with} onChange={(w) => set({ ...s, with: w })} groups={groups} />
          </div>
          <label className="block">
            <Label>It may take at most</Label>
            <select className={small} value={s.seconds ?? 20} onChange={(e) => set({ ...s, seconds: Number(e.target.value) === 20 ? undefined : Number(e.target.value) })}>
              {[5, 20, 60, 120].map((n) => (
                <option key={n} value={n}>
                  {`${n} seconds`}
                </option>
              ))}
              {s.seconds && ![5, 20, 60, 120].includes(s.seconds) && <option value={s.seconds}>{`${s.seconds} seconds`}</option>}
            </select>
          </label>
        </>
      );
    case 'value': {
      const arg = VALUE_ARG[s.op];
      return (
        <>
          <div>
            <Label hint="A value of the form, or of a step before it">Of</Label>
            <RefText mono value={s.of} onChange={(of) => set({ ...s, of })} groups={groups} placeholder="{{find.records}}" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <Label>What it works out</Label>
              <select className={small} value={s.op} onChange={(e) => set({ ...s, op: e.target.value as ValueOp, arg: undefined })}>
                {VALUE_OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {arg && (
              <label className="block">
                <Label hint={arg[1]}>{arg[0]}</Label>
                <input className={cx(small, 'font-mono text-[12.5px]')} placeholder={arg[2]} value={s.arg ?? ''} onChange={(e) => set({ ...s, arg: e.target.value || undefined })} />
              </label>
            )}
          </div>
          <div className="text-[12px] text-fg-3">At once and at no cost; its value is {`{{${s.id}.value}}`}.</div>
        </>
      );
    }
    case 'ask': {
      const form = s.fields !== undefined;
      const wait = s.waitHours ?? 168;
      return (
        <>
          <div>
            <Label hint="The run waits for your answer: on its page, in the inbox and from a notice on your phone">The question</Label>
            <RefText multiline value={s.question} onChange={(question) => set({ ...s, question })} groups={groups} placeholder="e.g. Send this brief to the team? {{brief.summary}}" />
          </div>
          <Segmented
            size="sm"
            value={form ? 'form' : 'yes'}
            onChange={(v) => set(v === 'form' ? { ...s, fields: s.fields ?? [{ id: 'answer', label: '', type: 'text', required: true }] } : { ...s, fields: undefined })}
            options={[
              { value: 'yes', label: 'Yes or no' },
              { value: 'form', label: 'A short form' },
            ]}
          />
          {form && <AskForm fields={s.fields!} onChange={(fields) => set({ ...s, fields })} />}
          <label className="block">
            <Label hint="Then it fails (If it fails… says what happens next)">It waits at most</Label>
            <select className={small} value={wait} onChange={(e) => set({ ...s, waitHours: Number(e.target.value) === 168 ? undefined : Number(e.target.value) })}>
              {WAITS.map(([h, l]) => (
                <option key={h} value={h}>
                  {l}
                </option>
              ))}
              {!WAITS.some(([h]) => h === wait) && <option value={wait}>{`${wait} hours`}</option>}
            </select>
          </label>
        </>
      );
    }
    case 'app': {
      const target = ctx.apps.find((a) => a.slug === s.app);
      return (
        <>
          <label className="block">
            <Label>The template</Label>
            <select className={small} value={s.app} onChange={(e) => set({ ...s, app: e.target.value, with: undefined })}>
              <option value="">Pick one</option>
              {ctx.apps.map((a) => (
                <option key={a.id} value={a.slug} translate="no">
                  {a.name}
                </option>
              ))}
              {s.app && !target && <option value={s.app}>{s.app}</option>}
            </select>
          </label>
          {target && target.fields.length > 0 && (
            <div>
              <Label>Its form</Label>
              <NamedValues value={s.with} onChange={(w) => set({ ...s, with: w })} known={target.fields.map((f) => ({ name: f.id, label: f.label || f.id, required: f.required }))} groups={groups} free={false} />
            </div>
          )}
        </>
      );
    }
    case 'data': {
      const lists = Object.keys(ctx.recipe.data ?? {});
      const fields = ctx.recipe.data?.[s.collection]?.fields;
      const known = fields?.map((f) => ({ name: f.id, label: f.label || f.id }));
      const one = s.record !== undefined;
      const which = (
        <>
          <Segmented size="sm" value={one ? 'one' : 'where'} onChange={(v) => set(v === 'one' ? { ...s, record: s.record ?? '', where: undefined } : { ...s, record: undefined })} options={[{ value: 'one', label: 'One, by its id' }, { value: 'where', label: 'Those that match' }]} />
          {one ? (
            <RefText mono value={s.record ?? ''} onChange={(record) => set({ ...s, record })} groups={groups} placeholder="{{find.first.id}}" />
          ) : (
            <NamedValues value={s.where} onChange={(where) => set({ ...s, where })} known={known} groups={groups} free={!fields} keyLabel="Field" />
          )}
        </>
      );
      return (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <Label>What it does</Label>
              <select className={small} value={s.op} onChange={(e) => set({ id: s.id, title: s.title, if: s.if, failed: s.failed, do: 'data', op: e.target.value as DataOp, collection: s.collection })}>
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <Label>In the list</Label>
              <select className={cx(small, 'font-mono text-[12.5px]')} value={s.collection} onChange={(e) => set({ ...s, collection: e.target.value })}>
                {!lists.includes(s.collection) && <option value={s.collection}>{s.collection || 'Pick one'}</option>}
                {lists.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!lists.length && <div className="text-[12.5px] text-warn">The template keeps no lists yet: add one under What it keeps.</div>}
          {s.op === 'add' && (
            <div>
              <Label>The record</Label>
              <NamedValues value={s.with} onChange={(w) => set({ ...s, with: w })} known={known} groups={groups} free={!fields} keyLabel="Field" />
            </div>
          )}
          {s.op === 'get' && (
            <div>
              <Label>Its id</Label>
              <RefText mono value={s.record ?? ''} onChange={(record) => set({ ...s, record })} groups={groups} placeholder="{{find.first.id}}" />
            </div>
          )}
          {s.op === 'find' && (
            <>
              <div>
                <Label hint="None: all of them">Those that match</Label>
                <NamedValues value={s.where} onChange={(where) => set({ ...s, where })} known={known} groups={groups} free={!fields} keyLabel="Field" />
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_100px]">
                <div className="min-w-0">
                  <Label>With these words</Label>
                  <RefText value={s.search ?? ''} onChange={(search) => set({ ...s, search: search || undefined })} groups={groups} />
                </div>
                <label className="block">
                  <Label>Sorted by</Label>
                  <input className={cx(small, 'font-mono text-[12.5px]')} placeholder="-createdAt" value={s.sort ?? ''} onChange={(e) => set({ ...s, sort: e.target.value || undefined })} />
                </label>
                <label className="block">
                  <Label>At most</Label>
                  <input className={cx(small, 'tnum')} inputMode="numeric" placeholder="100" value={s.limit ?? ''} onChange={(e) => set({ ...s, limit: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined })} />
                </label>
              </div>
            </>
          )}
          {s.op === 'search' && (
            <div className="grid gap-2 sm:grid-cols-[1fr_150px_90px]">
              <div className="min-w-0">
                <Label>The question</Label>
                <RefText value={s.query ?? ''} onChange={(query) => set({ ...s, query })} groups={groups} placeholder="e.g. {{topic}}" />
              </div>
              <label className="block">
                <Label>By</Label>
                <select className={small} value={s.mode ?? 'auto'} onChange={(e) => set({ ...s, mode: e.target.value === 'auto' ? undefined : (e.target.value as 'words' | 'meaning') })}>
                  <option value="auto">Words and meaning</option>
                  <option value="words">Words</option>
                  <option value="meaning">Meaning</option>
                </select>
              </label>
              <label className="block">
                <Label>At most</Label>
                <input className={cx(small, 'tnum')} inputMode="numeric" placeholder="10" value={s.limit ?? ''} onChange={(e) => set({ ...s, limit: Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined })} />
              </label>
            </div>
          )}
          {s.op === 'update' && (
            <>
              <div className="space-y-1.5">
                <Label>Which</Label>
                {which}
              </div>
              <div>
                <Label>What changes</Label>
                <NamedValues value={s.with} onChange={(w) => set({ ...s, with: w })} known={known} groups={groups} free={!fields} keyLabel="Field" />
              </div>
            </>
          )}
          {s.op === 'remove' && (
            <div className="space-y-1.5">
              <Label>Which</Label>
              {which}
            </div>
          )}
        </>
      );
    }
  }
}

/** Its name, its rule, and what happens when it fails: shown when set, else behind a word each. */
function CommonFields({ s, set, groups, ctx }: { s: Step; set: (s: Step) => void; groups: ValGroup[]; ctx: Ctx }) {
  const [show, setShow] = useState<Set<string>>(new Set());
  const [name, setName] = useState(s.id);
  useEffect(() => setName(s.id), [s.id]);
  const on = (k: string) => show.has(k);
  const toggle = (k: string) => setShow((x) => new Set(x.has(k) ? [...x].filter((y) => y !== k) : [...x, k]));
  const fails = s.failed === 'skip' || s.failed === 'agent' ? s.failed : Array.isArray(s.failed) ? 'steps' : 'stop';
  const words: [string, string, boolean][] = [
    ['name', 'Its name', on('name')],
    ['if', 'Only when…', on('if') || s.if !== undefined],
    ['failed', 'If it fails…', on('failed') || s.failed !== undefined],
  ];
  return (
    <div className="space-y-2.5">
      {on('name') && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <Label>Its title</Label>
            <input className={small} placeholder={labelOf(s.id)} value={s.title ?? ''} onChange={(e) => set({ ...s, title: e.target.value || undefined })} />
          </label>
          <label className="block">
            <Label hint={`Values: {{${s.id}.…}}`}>Its name</Label>
            <input
              className={cx(small, 'font-mono text-[12.5px]')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const next = fieldId(name, []).replace(/^(\d)/, 's_$1');
                if (next !== s.id && !ctx.rename(s.id, next)) setName(s.id);
              }}
            />
          </label>
        </div>
      )}
      {(on('if') || s.if !== undefined) && (
        <div>
          <Label hint="Otherwise it is skipped, and its values are empty">Only when</Label>
          <RefText mono value={s.if ?? ''} onChange={(v) => set({ ...s, if: v })} groups={groups} placeholder="{{unread.count}} > 0" />
        </div>
      )}
      {(on('failed') || s.failed !== undefined) && (
        <label className="block">
          <Label hint={fails === 'agent' ? 'It gets what the step was given and why it failed, and hands in the values the steps after it use' : undefined}>If it fails</Label>
          <select
            className={small}
            value={fails}
            onChange={(e) => {
              const v = e.target.value;
              set({ ...s, failed: v === 'skip' || v === 'agent' ? v : v === 'steps' ? (Array.isArray(s.failed) ? s.failed : []) : undefined });
            }}
          >
            <option value="stop">The run stops</option>
            <option value="skip">Go on without its values</option>
            {RESCUED.has(s.do) && <option value="agent">An agent does its work</option>}
            <option value="steps">Run other steps instead</option>
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {words
          .filter(([, , shown]) => !shown)
          .map(([k, w]) => (
            <button key={k} type="button" onClick={() => toggle(k)} className="text-[12px] text-fg-3 hover:text-fg">
              {w}
            </button>
          ))}
      </div>
    </div>
  );
}

// ---- steps --------------------------------------------------------------------------------------------------

function summaryOf(s: Step, ctx: Ctx): ReactNode {
  const first = (t: string) => t.split('\n').find((l) => l.trim())?.trim() ?? '';
  switch (s.do) {
    case 'agent':
    case 'model':
      return first(s.instructions) ? <span translate="no">{first(s.instructions)}</span> : 'No instructions yet';
    case 'tool':
      return <span translate="no">{[s.tool, ...Object.values(s.with ?? {}).map(asText)].filter(Boolean).join(' · ')}</span>;
    case 'decide':
      return s.ask || s.rule ? <span translate="no">{s.ask || s.rule}</span> : 'No rule yet';
    case 'repeat':
      return s.over !== undefined ? (
        <>
          For each of <span translate="no">{s.over}</span>
        </>
      ) : (
        <>
          Until <span translate="no">{s.until || s.untilAsk}</span>
        </>
      );
    case 'parallel':
      return `${s.branches.length} branches`;
    case 'app':
      return s.app ? <span translate="no">{ctx.apps.find((a) => a.slug === s.app)?.name ?? s.app}</span> : 'No template picked';
    case 'data':
      return (
        <>
          {OPS.find((o) => o.value === s.op)?.label} · <span translate="no">{s.collection}</span>
        </>
      );
    case 'ask':
      return first(s.question) ? <span translate="no">{first(s.question)}</span> : 'No question yet';
    case 'code':
      return (
        <>
          {s.language === 'python' ? 'Python' : s.language === 'typescript' ? 'TypeScript' : 'JavaScript'} · <span translate="no">{first(s.code)}</span>
        </>
      );
    case 'value':
      return (
        <>
          {VALUE_OPS.find((o) => o.value === s.op)?.label} · <span translate="no">{s.of || '…'}</span>
        </>
      );
  }
}

/** A step's settings: those of its kind, its name, its rule and what happens when it fails, and what needs fixing in it. */
export function StepBody({ s, list, i, ctx }: { s: Step; list: ListPath; i: number; ctx: Ctx }) {
  const msgs = ctx.msgs.get(s.id) ?? [];
  const set = (next: Step) => ctx.update(list, i, next);
  const groups = useMemo(() => valuesAt(ctx.flow, list, i, ctx.recipe.fields), [ctx.flow, ctx.recipe.fields, JSON.stringify([...list, i])]);
  return (
    <div className="space-y-3">
      <KindFields s={s} set={set} groups={groups} ctx={ctx} />
      <CommonFields s={s} set={set} groups={groups} ctx={ctx} />
      {msgs.length > 0 && (
        <ul className="space-y-0.5 text-[12.5px] leading-snug">
          {msgs.map((m) => (
            <li key={m.text} className={m.error ? 'text-err' : 'text-warn'}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** What can be done with a step: move it, copy it, ask the agent about it (beside a conversation), remove it. */
export function StepActions({ s, list, i, last, ctx, done }: { s: Step; list: ListPath; i: number; last: number; ctx: Ctx; done: () => void }) {
  const act = (f: () => void) => () => {
    done();
    f();
  };
  return (
    <div className="p-1">
      <MenuItem icon={<ArrowUp size={14} />} disabled={i === 0} onClick={act(() => ctx.edit(list, (l) => move(l, i, -1)))}>
        Move up
      </MenuItem>
      <MenuItem icon={<ArrowDown size={14} />} disabled={i === last} onClick={act(() => ctx.edit(list, (l) => move(l, i, 1)))}>
        Move down
      </MenuItem>
      <MenuItem icon={<Copy size={14} />} onClick={act(() => ctx.copy(list, i))}>
        Duplicate
      </MenuItem>
      {ctx.ask && (
        <MenuItem icon={<MessageSquare size={14} />} onClick={act(() => ctx.ask!(s))}>
          Ask the agent about it
        </MenuItem>
      )}
      <MenuItem icon={<Trash2 size={14} />} danger onClick={act(() => ctx.edit(list, (l) => l.filter((_, j) => j !== i)))}>
        Remove
      </MenuItem>
    </div>
  );
}

function StepCard({ s, list, i, last, ctx }: { s: Step; list: ListPath; i: number; last: number; ctx: Ctx }) {
  const key = JSON.stringify([...list, i]);
  const open = ctx.open === key;
  const more = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const Icon = ICON[s.do];
  const msgs = ctx.msgs.get(s.id) ?? [];
  const set = (next: Step) => ctx.update(list, i, next);
  return (
    <li>
      <div className={cx('rounded-xl border bg-bg-1', open ? 'border-line-2' : 'border-line')}>
        <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-2">
          <button type="button" onClick={() => ctx.setOpen(open ? null : key)} className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5 text-left">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">
              <Icon size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[13.5px] font-medium" translate="no">
                  {titleOf(s)}
                </span>
                <span className="shrink-0 text-[11.5px] text-fg-3">{KIND[s.do].label}</span>
              </span>
              {!open && <span className="block truncate text-[12px] text-fg-3">{summaryOf(s, ctx)}</span>}
            </span>
            {msgs.length > 0 && <span className={cx('h-2 w-2 shrink-0 rounded-full', msgs.some((m) => m.error) ? 'bg-err' : 'bg-warn')} />}
          </button>
          <IconButton ref={more} label="More" size="sm" onClick={() => setMenu((m) => !m)}>
            <Ellipsis size={15} />
          </IconButton>
          <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={200}>
            <StepActions s={s} list={list} i={i} last={last} ctx={ctx} done={() => setMenu(false)} />
          </Popover>
        </div>
        {open && (
          <div className="border-t border-line px-3 pt-3 pb-3">
            <StepBody s={s} list={list} i={i} ctx={ctx} />
          </div>
        )}
      </div>
      {listsOf(s).length > 0 && (
        <div className="mt-1.5 ml-3.5 space-y-2 border-l-2 border-line pl-3">
          {listsOf(s).map(({ key: k, label }) => (
            <div key={k}>
              <div className="mb-1 flex items-center gap-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">
                {label}
                {s.do === 'parallel' && s.branches.length > 2 && (
                  <IconButton label="Remove the branch" size="sm" onClick={() => set({ ...s, branches: s.branches.filter((_, n) => `b${n}` !== k) })}>
                    <X size={13} />
                  </IconButton>
                )}
              </div>
              <StepList steps={childList(s, k)} list={[...list, i, k]} ctx={ctx} />
            </div>
          ))}
          {s.do === 'parallel' && s.branches.length < 6 && (
            <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => set({ ...s, branches: [...s.branches, []] })}>
              Add a branch
            </button>
          )}
        </div>
      )}
    </li>
  );
}


function AddStep({ onPick, ctx, list, at }: { onPick: (k: StepKind) => void; ctx: Ctx; list: ListPath; at: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg">
        <Plus size={14} />
        Add a step
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={380} title="Add a step">
        <div className="p-1">
          {STEP_KINDS.map((k) => {
            const I = ICON[k.value];
            return (
              <button key={k.value} type="button" title={k.hint} onClick={() => (setOpen(false), onPick(k.value))} className="flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left hover:bg-bg-2">
                <I size={14} className="shrink-0 text-fg-3" />
                <span className="shrink-0 text-[13.5px]">{k.label}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{k.hint}</span>
              </button>
            );
          })}
        </div>
        <BlockChips
          ctx={ctx}
          onPick={(b) => {
            setOpen(false);
            ctx.useBlock(list, at, b).then(() => ctx.setOpen(JSON.stringify([...list, at])), toastError);
          }}
        />
      </Popover>
    </>
  );
}

function StepList({ steps, list, ctx }: { steps: Step[]; list: ListPath; ctx: Ctx }) {
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <StepCard key={i} s={s} list={list} i={i} last={steps.length - 1} ctx={ctx} />
      ))}
      <li>
        <AddStep onPick={(k) => ctx.add(list, k)} ctx={ctx} list={list} at={steps.length} />
      </li>
    </ol>
  );
}

/** The builder's What it does, for a template with steps: the steps, where its answer comes from, and the checks. */
export function StepsEditor({ recipe, onChange, onAsk, appId }: { recipe: AppRecipe & { flow: Flow }; onChange: (p: Partial<AppRecipe>) => void; onAsk?: (s: Step) => void; appId?: string | null }) {
  const flow = recipe.flow;
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'graph'>('list');
  // The graph wants room: phones keep the list.
  const wide = useMediaQuery('(min-width: 1000px)');
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [apps, setApps] = useState<AppDef[]>([]);
  const [ready, setReady] = useState<AppTemplate[]>([]);
  useEffect(() => {
    api<{ tools: ToolInfo[] }>('/api/apps/tools').then((r) => setTools(r.tools.filter((t) => t.step)), () => {});
    api<{ models: { id: string; label: string }[] }>('/api/apps/models').then((r) => setModels(r.models), () => {});
    api<{ apps: AppDef[]; templates: AppTemplate[] }>('/api/apps').then(
      (r) => (setApps(r.apps), setReady(r.templates.filter((t) => t.block))),
      () => {},
    );
  }, []);

  // What must change before it saves, and what may surprise, by the step they are about.
  const { msgs, general } = useMemo(() => {
    const c = checkFlow({ fields: recipe.fields, answer: recipe.answer, flow, data: recipe.data, flows: recipe.flows });
    const all = [...cleanFlow(flow).errors.map((text) => ({ text, error: true })), ...c.errors.map((text) => ({ text, error: true })), ...c.warnings.map((text) => ({ text, error: false }))];
    const msgs = new Map<string, { text: string; error: boolean }[]>();
    const general: { text: string; error: boolean }[] = [];
    const seen = new Set<string>();
    for (const m of all) {
      if (seen.has(m.text)) continue;
      seen.add(m.text);
      const id = /^Step “([^”]+)”/.exec(m.text)?.[1];
      if (id) msgs.set(id, [...(msgs.get(id) ?? []), m]);
      else general.push(m);
    }
    return { msgs, general };
  }, [recipe.fields, recipe.answer, flow, recipe.data, recipe.flows]);

  const setSteps = (steps: Step[]) => onChange({ flow: { ...flow, steps } });
  const taken = () => allSteps(flow.steps).map((s) => s.id);
  const ctx: Ctx = {
    recipe,
    flow,
    open,
    setOpen,
    msgs,
    tools,
    models,
    apps,
    ask: onAsk,
    update: (list, i, s) => setSteps(editList(flow.steps, list, (l) => l.map((x, j) => (j === i ? s : x)))),
    edit: (list, f) => {
      setOpen(null);
      setSteps(editList(flow.steps, list, f));
    },
    make: (kind) => newStep(kind, taken(), recipe),
    addApp: (a) => setApps((x) => [...x.filter((y) => y.id !== a.id), a]),
    blocks: { mine: apps.filter((a) => a.block && a.id !== appId), ready },
    useBlock: async (list, at, b) => {
      let a: AppDef;
      if ('slug' in b) a = b as AppDef;
      else {
        a = (await post<{ app: AppDef }>('/api/apps', { recipe: b, template: b.id })).app;
        setApps((x) => [...x, a]);
      }
      // Its questions the template's own form has by the same name are given; the rest are to fill in.
      const own = new Set(recipe.fields.map((f) => f.id));
      const w = Object.fromEntries(a.fields.map((f) => [f.id, own.has(f.id) ? `{{${f.id}}}` : (f.default ?? '')]));
      const s = { ...newStep('app', taken(), recipe), title: a.name, app: a.slug, ...(a.fields.length ? { with: w } : {}) } as Step;
      setSteps(editList(flow.steps, list, (l) => [...l.slice(0, at), s, ...l.slice(at)]));
      return s.id;
    },
    insert: (list, at, what) => {
      const s = typeof what === 'string' ? newStep(what, taken(), recipe) : what;
      setSteps(editList(flow.steps, list, (l) => [...l.slice(0, at), s, ...l.slice(at)]));
      return s.id;
    },
    add: (list, kind) => {
      const s = newStep(kind, taken(), recipe);
      const at = editList(flow.steps, list, (l) => [...l, s]);
      setSteps(at);
      let n = flow.steps;
      for (let k = 0; k + 1 < list.length; k += 2) n = childList(n[list[k] as number], list[k + 1] as string);
      setOpen(JSON.stringify([...list, n.length]));
    },
    copy: (list, i) => {
      const ids = new Set(taken());
      setOpen(null);
      setSteps(editList(flow.steps, list, (l) => [...l.slice(0, i + 1), copyOf(l[i], ids), ...l.slice(i + 1)]));
    },
    rename: (from, to) => {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(to) || taken().includes(to) || to === 'inputs' || to === 'today' || to === 'item' || to === 'index' || to === 'error') return false;
      onChange({ flow: renamed(flow, from, to) });
      return true;
    },
  };

  const answerGroups = useMemo(() => valuesAt(flow, [], flow.steps.length, recipe.fields), [flow, recipe.fields]);
  const outputs = flow.outputs ?? {};
  const setOutput = (id: string, v: string) => {
    const next = { ...outputs };
    if (v.trim()) next[id] = v;
    else delete next[id];
    onChange({ flow: { ...flow, outputs: Object.keys(next).length ? next : undefined } });
  };
  const others = Object.keys(recipe.flows ?? {});

  return (
    <div className="space-y-4">
      {wide && (
        <div className="-mt-1 flex justify-end">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: 'List' },
              { value: 'graph', label: 'Graph' },
            ]}
          />
        </div>
      )}
      {view === 'graph' && wide ? (
        <GraphEditor ctx={ctx} appId={appId} graph={recipe.graph} onGraph={(graph) => onChange({ graph })} onFlows={(f) => onChange(f)} Body={StepBody} Actions={StepActions} />
      ) : (
        <StepList steps={flow.steps} list={[]} ctx={ctx} />
      )}
      {recipe.answer.length > 0 && (
        <div>
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-2">Where its answer comes from</div>
          <div className="space-y-1.5">
            {recipe.answer.map((a) => (
              <div key={a.id} className="grid items-center gap-x-2 gap-y-0.5 sm:grid-cols-[minmax(0,180px)_1fr]">
                <span className="truncate text-[13px]" translate="no">
                  {a.label || a.id}
                </span>
                <RefText mono value={outputs[a.id] ?? ''} onChange={(v) => setOutput(a.id, v)} groups={answerGroups} placeholder={`From the last step that gives “${a.id}”`} />
              </div>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div className="text-[12.5px] text-fg-3">
          It also has other flows, which its screen starts: <span translate="no">{others.join(', ')}</span>. Ask an agent to change them.
        </div>
      )}
      {general.length > 0 && (
        <ul className="space-y-0.5 text-[12.5px] leading-snug">
          {general.map((m) => (
            <li key={m.text} className={m.error ? 'text-err' : 'text-warn'}>
              {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

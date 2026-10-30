import { useEffect, useId, useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import type { Question } from '@shared/types';
import { post } from '../../lib/api';
import { attachmentPayload, readAttachments } from '../../lib/attachments';
import { toastError } from '../../lib/store';
import { cx, Dots } from '../../components/ui';

/** A file attached to an answer: saved on this machine, and named in the answer so the agent can open it. */
export interface AnswerFile {
  name: string;
  path: string;
  image: boolean;
}

/** One question's state: the options ticked, the free-text "Other" answer, and attached files. */
export interface Pick {
  picks: string[];
  other: string;
  otherOn: boolean;
  files?: AnswerFile[];
}

export type Picks = Record<string, Pick>;

const EMPTY: Pick = { picks: [], other: '', otherOn: false };

/** The answer as one string; multi-select answers are joined with `sep`. Attached files follow by path. */
export function answerOf(q: Question, p: Pick | undefined, sep: string): string {
  if (!p) return '';
  const other = p.otherOn ? p.other.trim() : '';
  let text: string;
  if (!q.multiSelect) text = other || (p.otherOn ? '' : (p.picks[0] ?? ''));
  else {
    const vals = q.options.map((o) => o.label).filter((l) => p.picks.includes(l));
    if (other) vals.push(other);
    text = vals.join(sep);
  }
  if (!p.files?.length) return text;
  const list = p.files.map((f) => `- ${f.path}`).join('\n');
  return `${text || 'See the attached files.'}\n\nAttached files (open them to see them):\n${list}`;
}

export const allAnswered = (qs: Question[], v: Picks) => qs.every((q) => answerOf(q, v[q.id], ', ') !== '');

function Field({ q, value, onChange, onSubmit, disabled, keys }: { q: Question; value: Pick; onChange: (p: Pick) => void; onSubmit?: () => void; disabled?: boolean; keys?: boolean }) {
  const name = useId();
  const otherRef = useRef<HTMLInputElement>(null);
  const uploads = useAnswerUploads(value, onChange);
  const multi = !!q.multiSelect;
  const type = multi ? 'checkbox' : 'radio';
  const toggle = (label: string) =>
    onChange(
      multi
        ? { ...value, picks: value.picks.includes(label) ? value.picks.filter((x) => x !== label) : [...value.picks, label] }
        : { ...value, picks: [label], otherOn: false },
    );
  const chooseOther = (on: boolean) => {
    onChange({ ...value, otherOn: on, picks: multi ? value.picks : [] });
    if (on) requestAnimationFrame(() => otherRef.current?.focus());
  };
  const row = (on: boolean) =>
    cx(
      'flex items-start gap-2.5 rounded-lg border px-3 transition-colors',
      on ? 'border-accent/70 bg-accent-soft' : 'border-line',
      disabled ? 'opacity-75' : cx('cursor-pointer', !on && 'hover:border-line-2 hover:bg-bg-2'),
    );
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {q.header && <span className="rounded bg-bg-3 px-1.5 py-px text-[10.5px] font-medium text-fg-2">{q.header}</span>}
        <span className="text-[13.5px] font-medium">{q.question}</span>
        {multi && <span className="text-[11.5px] text-fg-3">Pick any</span>}
      </legend>
      <div role={multi ? 'group' : 'radiogroup'} aria-label={q.question} className="space-y-1">
        {q.options.map((o, i) => {
          const on = value.picks.includes(o.label);
          return (
            <label key={o.label} className={cx(row(on), 'py-2')}>
              <input type={type} name={name} checked={on} onChange={() => toggle(o.label)} className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-5 font-medium">{o.label}</span>
                {o.description && <span className="block text-[12px] text-fg-3">{o.description}</span>}
              </span>
              {keys && i < 9 && <span className="tnum mt-0.5 hidden shrink-0 rounded border border-line-2 px-1 text-[10.5px] text-fg-3 sm:inline">{i + 1}</span>}
            </label>
          );
        })}
        {q.allowOther !== false && (
          <label className={cx(row(value.otherOn), 'py-2')}>
            <input
              type={type}
              name={name}
              checked={value.otherOn}
              onChange={(e) => chooseOther(multi ? e.target.checked : true)}
              aria-label="Other"
              className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
            />
            <input
              ref={otherRef}
              onPaste={(e) => {
                // A pasted screenshot goes with the answer as a file, not into the text.
                const f = Array.from(e.clipboardData.files);
                if (!f.length) return;
                e.preventDefault();
                uploads.add(f);
              }}
              value={value.other}
              onFocus={() => !value.otherOn && onChange({ ...value, otherOn: true, picks: multi ? value.picks : [] })}
              onChange={(e) => onChange({ ...value, other: e.target.value, otherOn: true, picks: multi ? value.picks : [] })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  onSubmit?.();
                }
              }}
              placeholder="Other — type your own answer"
              autoComplete="off"
              data-1p-ignore=""
              data-lpignore="true"
              className="h-5 min-w-0 flex-1 bg-transparent p-0 text-[13px] leading-5 outline-none placeholder:text-fg-3 focus-visible:outline-none"
            />
          </label>
        )}
      </div>
      <AnswerFiles value={value} onChange={onChange} disabled={disabled} add={uploads.add} busy={uploads.busy} />
    </fieldset>
  );
}

/** Uploads files for one answer as they are attached or pasted; the answer names their paths. */
function useAnswerUploads(value: Pick, onChange: (p: Pick) => void) {
  const [busy, setBusy] = useState(false);
  const latest = useRef(value);
  latest.current = value;
  const add = async (list: FileList | File[]) => {
    setBusy(true);
    try {
      const atts = await readAttachments(list);
      if (!atts.length) return;
      const r = await post<{ files: AnswerFile[] }>('/api/uploads', attachmentPayload(atts));
      onChange({ ...latest.current, files: [...(latest.current.files ?? []), ...r.files] });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return { add, busy };
}

/** The files attached to one answer, and the button that adds more. */
function AnswerFiles({ value, onChange, disabled, add, busy }: { value: Pick; onChange: (p: Pick) => void; disabled?: boolean; add: (f: FileList | File[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const files = value.files ?? [];
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <span key={f.path} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md border border-line bg-bg-1 py-0.5 pr-1 pl-2 text-[12px] text-fg-2" title={f.path}>
          <FileText size={12} className="shrink-0 text-fg-3" />
          <span className="truncate">{f.name}</span>
          {!disabled && (
            <button type="button" onClick={() => onChange({ ...value, files: files.filter((x) => x !== f) })} className="rounded p-0.5 text-fg-3 hover:text-fg" aria-label={`Remove ${f.name}`}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
          {busy ? <Dots /> : <Paperclip size={12} />} Attach files
        </button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Radio buttons per question (checkboxes when several answers are allowed), "Other" last. */
export function QuestionForm({
  questions,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  questions: Question[];
  value: Picks;
  onChange: (v: Picks) => void;
  /** Enter in an "Other" box. */
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  // Keys 1–9 pick an option of the first question still unanswered (while no field has the keyboard).
  const target = questions.find((q) => !(value[q.id]?.picks.length || value[q.id]?.otherOn)) ?? questions[0];
  const latest = useRef({ value, onChange, target });
  latest.current = { value, onChange, target };
  useEffect(() => {
    if (disabled) return;
    const k = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key) || (e.target as HTMLElement)?.closest?.('input[type="text"], input:not([type]), textarea, .cm-editor, .xterm')) return;
      const { value: v, onChange: set, target: q } = latest.current;
      const o = q?.options[Number(e.key) - 1];
      if (!q || !o) return;
      e.preventDefault();
      const cur = v[q.id] ?? EMPTY;
      set({ ...v, [q.id]: q.multiSelect ? { ...cur, picks: cur.picks.includes(o.label) ? cur.picks.filter((x) => x !== o.label) : [...cur.picks, o.label] } : { ...cur, picks: [o.label], otherOn: false } });
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [disabled]);
  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <Field key={q.id} q={q} value={value[q.id] ?? EMPTY} onChange={(p) => onChange({ ...value, [q.id]: p })} onSubmit={onSubmit} disabled={disabled} keys={!disabled && q === target} />
      ))}
    </div>
  );
}

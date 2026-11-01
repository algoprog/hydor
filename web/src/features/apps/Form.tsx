// An app's form: each field as the right control (text, a long text that grows, number, date, a choice
// as chips or a list, yes/no, a file), with its help line and what to fix under it. Used by the app's
// page, the builder's test run and the public page.
import { useLayoutEffect, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import type { AppField } from '@shared/apps';
import { bytes } from '../../lib/format';
import { cx, inputCls, Switch } from '../../components/ui';
import { fileToBase64 } from './api';

export interface FileValue {
  name: string;
  size: number;
  data: string;
}

export type FormValues = Record<string, string>;
export type FormFiles = Record<string, FileValue>;

/** What the form starts with: each field's default. */
export const initialValues = (fields: AppField[]): FormValues => Object.fromEntries(fields.map((f) => [f.id, f.default ?? (f.type === 'yesno' ? 'No' : '')]));

function Grow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 92), 420)}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={3} {...props} className={cx(inputCls, 'block h-auto resize-none py-2 leading-relaxed', props.className)} />;
}

function FilePick({ value, onPick, disabled, maxMb }: { value?: FileValue; onPick: (f: FileValue | null) => void; disabled?: boolean; maxMb: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const take = async (f?: File | null) => {
    if (!f) return;
    if (f.size > maxMb * 1024 * 1024) return setErr(`${f.name} is too big: at most ${maxMb} MB`);
    setErr('');
    onPick({ name: f.name, size: f.size, data: await fileToBase64(f) });
  };
  return (
    <div>
      <div
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
        className={cx('flex min-h-11 items-center gap-3 rounded-[10px] border border-dashed px-3 py-2 transition-colors', over ? 'border-accent bg-accent-soft' : 'border-line-2 bg-bg-1')}
      >
        <FileUp size={17} className="shrink-0 text-fg-3" />
        {value ? (
          <>
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{value.name}</span>
            <span className="tnum shrink-0 text-[12px] text-fg-3">{bytes(value.size)}</span>
            <button type="button" disabled={disabled} onClick={() => onPick(null)} className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Remove the file">
              <X size={15} />
            </button>
          </>
        ) : (
          <span className="flex-1 text-[13.5px] text-fg-3">
            <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className="font-medium text-accent hover:underline">
              Choose a file
            </button>{' '}
            <span className="max-sm:hidden">or drop it here</span>
          </span>
        )}
        <input
          ref={ref}
          type="file"
          hidden
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {err && <div className="mt-1 text-[12px] text-err">{err}</div>}
    </div>
  );
}

export function FieldInput({ f, value, onChange, file, onFile, disabled, maxMb = 25 }: { f: AppField; value: string; onChange: (v: string) => void; file?: FileValue; onFile?: (v: FileValue | null) => void; disabled?: boolean; maxMb?: number }) {
  const id = `fld-${f.id}`;
  switch (f.type) {
    case 'long':
      return <Grow id={id} value={value} disabled={disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input id={id} className={inputCls} type="text" inputMode="decimal" value={value} disabled={disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input id={id} className={cx(inputCls, 'max-w-[240px]')} type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
    case 'choice': {
      const opts = f.options ?? [];
      // A few short options read best as chips; many as a list.
      if (opts.length <= 5 && opts.join('').length <= 60)
        return (
          <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-1.5">
            {opts.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={value === o}
                disabled={disabled}
                onClick={() => onChange(value === o && !f.required ? '' : o)}
                className={cx(
                  'h-8.5 rounded-full px-3.5 text-[13.5px] ring-1 transition-colors ring-inset',
                  value === o ? 'bg-accent-soft font-medium text-accent ring-accent/40' : 'bg-bg-1 text-fg-2 ring-line-2 hover:bg-bg-2 hover:text-fg',
                )}
              >
                {o}
              </button>
            ))}
          </div>
        );
      return (
        <select id={id} className={cx(inputCls, 'pr-8')} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          <option value="">{f.required ? 'Pick one…' : 'None'}</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    case 'yesno':
      return (
        <div className="flex h-9 items-center gap-2.5">
          <Switch on={value === 'Yes'} onChange={(on) => onChange(on ? 'Yes' : 'No')} label={f.label} disabled={disabled} />
          <span className="text-[13.5px] text-fg-2">{value === 'Yes' ? 'Yes' : 'No'}</span>
        </div>
      );
    case 'file':
      return <FilePick value={file} onPick={(v) => onFile?.(v)} disabled={disabled} maxMb={maxMb} />;
    default:
      return <input id={id} className={inputCls} value={value} disabled={disabled} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />;
  }
}

export function AppForm({
  fields,
  values,
  files,
  onChange,
  onFile,
  errors,
  disabled,
  maxMb,
}: {
  fields: AppField[];
  values: FormValues;
  files: FormFiles;
  onChange: (id: string, v: string) => void;
  onFile: (id: string, v: FileValue | null) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
  maxMb?: number;
}) {
  if (!fields.length) return <div className="text-[13.5px] text-fg-3">No questions to answer: press Run.</div>;
  return (
    <div className="space-y-4.5">
      {fields.map((f) => (
        <div key={f.id}>
          <label htmlFor={`fld-${f.id}`} id={`fld-${f.id}-label`} className="mb-1.5 flex items-baseline gap-1 text-[13.5px] font-medium">
            {f.label}
            {f.required && (
              <span className="text-err" aria-label="needed">
                *
              </span>
            )}
          </label>
          <FieldInput f={f} value={values[f.id] ?? ''} onChange={(v) => onChange(f.id, v)} file={files[f.id]} onFile={(v) => onFile(f.id, v)} disabled={disabled} maxMb={maxMb} />
          {errors?.[f.id] ? <div className="mt-1 text-[12px] text-err">{errors[f.id]}</div> : f.help && <div className="mt-1 text-[12px] text-fg-3">{f.help}</div>}
        </div>
      ))}
    </div>
  );
}

/** What to fix before sending, by field: needed fields left empty, numbers and dates that are not. */
export function formErrors(fields: AppField[], values: FormValues, files: FormFiles): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.id] ?? '').trim();
    if (f.type === 'file') {
      if (f.required && !files[f.id]) out[f.id] = 'Choose a file';
      continue;
    }
    if (!v) {
      if (f.required) out[f.id] = 'Needed';
      continue;
    }
    if (f.type === 'number' && !/^[-+]?(\d[\d,_ ]*\.?\d*|\.\d+)$/.test(v.replace(/^[$€£¥]\s*/, ''))) out[f.id] = 'A number, please';
  }
  return out;
}

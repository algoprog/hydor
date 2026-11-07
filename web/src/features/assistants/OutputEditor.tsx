// What an agent hands back (the fields of each result; none: its reply) and where each result goes: a file in the
// folder it works in, a page in the Library, a webhook (signed with a key from the vault) and a notification. In All
// settings, and from its sentence on its page.
import { Plus, Trash2 } from 'lucide-react';
import { ANSWER_TYPES, type AnswerField, type AnswerType } from '@shared/apps';
import type { AgentOutput, OutputTarget } from '@shared/assistants';
import { cx, IconButton, inputCls, Switch } from '../../components/ui';

const TYPES = ANSWER_TYPES.filter((t) => t.value !== 'media');

const PLACE: Record<OutputTarget['kind'], string> = { file: 'a file', library: 'the Library', webhook: 'a webhook', notify: 'a notification' };

const and = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** "its reply", "Summary and Papers to the Library and a notification": what an agent hands back, in a few words. */
export function outputText(o?: AgentOutput): string {
  const f = o?.fields ?? [];
  const what = !f.length ? 'its reply' : f.length <= 3 ? and(f.map((x) => x.label)) : `${f.length} fields`;
  const where = [...new Set((o?.to ?? []).map((t) => PLACE[t.kind]))];
  return where.length ? `${what} to ${and(where)}` : what;
}

/** Its output with empty parts left out: none when it names neither fields nor places. */
function tidy(fields: AnswerField[], to: OutputTarget[]): AgentOutput | undefined {
  const fs = fields.filter((f) => f.label.trim());
  return fs.length || to.length ? { ...(fs.length ? { fields: fs } : {}), ...(to.length ? { to } : {}) } : undefined;
}

export function OutputEditor({ value, onChange }: { value?: AgentOutput; onChange: (o?: AgentOutput) => void }) {
  const fields = value?.fields ?? [];
  const to = value?.to ?? [];
  const file = to.find((t): t is Extract<OutputTarget, { kind: 'file' }> => t.kind === 'file');
  const hook = to.find((t): t is Extract<OutputTarget, { kind: 'webhook' }> => t.kind === 'webhook');
  const has = (k: OutputTarget['kind']) => to.some((t) => t.kind === k);
  const setFields = (next: AnswerField[]) => onChange(tidy(next, to));
  const setTo = (kind: OutputTarget['kind'], t: OutputTarget | null) => onChange(tidy(fields, [...to.filter((x) => x.kind !== kind), ...(t ? [t] : [])]));
  const field = (i: number, p: Partial<AnswerField>) => setFields(fields.map((f, j) => (j === i ? { ...f, ...p } : f)));
  return (
    <div className="space-y-3 text-[13px]">
      <div>
        <div className="mb-1.5 text-[12.5px] text-fg-2">Fields of each result</div>
        {fields.length === 0 && <div className="mb-1.5 text-[12px] text-fg-3">None: it hands back its reply.</div>}
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line p-1.5">
              <input
                value={f.label}
                onChange={(e) => field(i, { label: e.target.value, id: '' })}
                maxLength={80}
                placeholder="Summary"
                aria-label="Field"
                className={cx(inputCls, 'h-8 min-w-0 flex-1')}
              />
              <select
                value={f.type}
                onChange={(e) => field(i, { type: e.target.value as AnswerType, columns: e.target.value === 'table' ? (f.columns ?? [{ id: 'item', label: 'Item', type: 'text' }]) : undefined })}
                className={cx(inputCls, 'h-8 w-32')}
                aria-label="Kind"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[12px] text-fg-3">
                <Switch on={!!f.required} onChange={(on) => field(i, { required: on || undefined })} label="Required" />
                Required
              </label>
              <IconButton label={`Remove ${f.label || 'the field'}`} size="sm" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
                <Trash2 size={13} />
              </IconButton>
              {f.type === 'table' && (
                <input
                  value={(f.columns ?? []).map((c) => c.label).join(', ')}
                  onChange={(e) =>
                    field(i, {
                      columns: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .map((label) => ({ id: '', label, type: 'text' as const })),
                    })
                  }
                  placeholder="Its columns: Name, Price, Link"
                  aria-label="Its columns"
                  className={cx(inputCls, 'h-8 w-full')}
                />
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setFields([...fields, { id: '', label: '', type: 'text' }])} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
          <Plus size={13} />
          Add a field
        </button>
      </div>
      <div>
        <div className="mb-1.5 text-[12.5px] text-fg-2">Where each result goes, besides the conversation</div>
        <div className="divide-y divide-line rounded-xl border border-line">
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">A page in the Library</span>
            <Switch on={has('library')} onChange={(on) => setTo('library', on ? { kind: 'library' } : null)} label="A page in the Library" />
          </label>
          <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1">A notification</span>
            <Switch on={has('notify')} onChange={(on) => setTo('notify', on ? { kind: 'notify' } : null)} label="A notification" />
          </label>
          <div className="px-3 py-2">
            <div className="mb-1">A file in the folder it works in</div>
            <input
              value={file?.path ?? ''}
              onChange={(e) => setTo('file', e.target.value.trim() ? { kind: 'file', path: e.target.value } : null)}
              placeholder="reports/{date}.md (.json for the fields as JSON)"
              aria-label="A file in the folder it works in"
              className={cx(inputCls, 'h-8')}
            />
          </div>
          <div className="px-3 py-2">
            <div className="mb-1">A webhook</div>
            <div className="flex flex-wrap gap-1.5">
              <input
                value={hook?.url ?? ''}
                onChange={(e) => setTo('webhook', e.target.value.trim() ? { kind: 'webhook', url: e.target.value, ...(hook?.secret ? { secret: hook.secret } : {}) } : null)}
                placeholder="https://hooks.example.com/…"
                aria-label="A webhook"
                className={cx(inputCls, 'h-8 min-w-0 flex-[2]')}
              />
              <input
                value={hook?.secret ?? ''}
                disabled={!hook}
                onChange={(e) => hook && setTo('webhook', { kind: 'webhook', url: hook.url, ...(e.target.value.trim() ? { secret: e.target.value.toUpperCase() } : {}) })}
                placeholder="Key in the vault, if any"
                aria-label="Key in the vault"
                className={cx(inputCls, 'h-8 min-w-0 flex-1')}
              />
            </div>
          </div>
        </div>
        <div className="mt-1 text-[12px] leading-snug text-fg-3">
          {'In a file name, {date}, {time} and {agent} fill in. A webhook gets the result as JSON, signed with the key when one is named (only to the hosts the key is allowed for).'}
        </div>
      </div>
    </div>
  );
}

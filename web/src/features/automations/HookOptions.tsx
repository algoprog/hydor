// A webhook task's options: a signing secret the calls must be signed with, and a filter on the
// payload that skips the run. Retried deliveries run once, and ?wait= returns the reply.
import { KeyRound } from 'lucide-react';
import type { TaskSchedule } from '@shared/automations';
import { Button, cx } from '../../components/ui';
import { boxCls, Field } from './parts';

type Hook = Extract<TaskSchedule, { kind: 'webhook' }>;

const small = cx(boxCls, 'h-8.5 text-[13px]');

function randomSecret(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function HookOptions({ value, onChange }: { value: Hook; onChange: (s: Hook) => void }) {
  const f = value.filter;
  const setFilter = (p: Partial<NonNullable<Hook['filter']>>) => {
    const next = { path: '', value: '', ...f, ...p };
    onChange({ ...value, filter: next.path || next.value ? next : undefined });
  };
  return (
    <div className="space-y-3 rounded-xl border border-line-2 p-3">
      <Field label="Signing secret (optional)" hint="Calls must then carry an HMAC-SHA256 signature of their body made with it, as GitHub, Gitea and others send (GitLab’s token header works too). Unsigned calls are refused.">
        <div className="flex gap-2">
          <input value={value.secret ?? ''} onChange={(e) => onChange({ ...value, secret: e.target.value || undefined })} placeholder="None" className={cx(small, 'min-w-0 flex-1 font-mono')} autoComplete="off" spellCheck={false} />
          <Button size="sm" icon={<KeyRound size={13} />} onClick={() => onChange({ ...value, secret: randomSecret() })}>
            Generate
          </Button>
        </div>
      </Field>
      {value.secret && (
        <Field label="Signature header" hint="Leave empty for the usual ones: X-Hub-Signature-256, X-Gitea-Signature, X-Signature-256…">
          <input value={value.header ?? ''} onChange={(e) => onChange({ ...value, header: e.target.value || undefined })} placeholder="Any of the usual" className={cx(small, 'w-full font-mono')} />
        </Field>
      )}
      <Field label="Filter (optional)" hint="A path into the call: body.action, headers.x-github-event, query.kind. A call the filter leaves out is answered and starts nothing.">
        <div className="flex flex-wrap items-center gap-2">
          <select value={f?.skip ? 'skip' : 'only'} onChange={(e) => setFilter({ skip: e.target.value === 'skip' || undefined })} className={cx(small, 'w-auto')}>
            <option value="only">Run only when</option>
            <option value="skip">Skip when</option>
          </select>
          <input value={f?.path ?? ''} onChange={(e) => setFilter({ path: e.target.value })} placeholder="body.action" className={cx(small, 'w-40 min-w-0 flex-1 font-mono')} />
          <span className="text-[13px] text-fg-3">is</span>
          <input value={f?.value ?? ''} onChange={(e) => setFilter({ value: e.target.value })} placeholder="opened" className={cx(small, 'w-32 min-w-0 flex-1')} />
        </div>
      </Field>
      <p className="text-[12px] leading-relaxed text-fg-3">
        A delivery sent again with the same <code className="font-mono">Idempotency-Key</code> or delivery id runs once. Add <code className="font-mono">?wait=60</code> to the address to get the agent’s reply in the response (up to 300 seconds); a run still going then answers 202 with a link to it.
      </p>
    </div>
  );
}

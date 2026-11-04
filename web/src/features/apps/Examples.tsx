// A template's examples, in its builder: answers to try it with and checks on what a run gives, each with
// how its last try went (the checks that held or not, and what they saw), tried one at a time or all at once
// with the template as it is on screen. A test run can be kept as one.
import { useEffect, useState } from 'react';
import { FlaskConical, Plus, Trash2, X } from 'lucide-react';
import type { AppExample } from '@shared/app-manifest';
import type { AppRecipe, AppRun } from '@shared/apps';
import { fieldId, inputsLine, isActive } from '@shared/apps';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, cx, IconButton, inputCls, Throbber } from '../../components/ui';
import { money, useRunEvents } from './api';
import { AppForm, type FormValues } from './Form';
import { checkValues, RefText } from './StepsEditor';

const small = cx(inputCls.replace('w-full', ''), 'h-8.5 w-full text-[13.5px]');

/** The form an example fills: its flow's, or the template's. */
const formOf = (r: AppRecipe, e: AppExample) => (e.flow ? (r.flows?.[e.flow]?.inputs ?? []) : r.fields);

const asForm = (inputs: Record<string, unknown>): FormValues => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));

function Result({ run }: { run?: AppRun }) {
  if (!run) return <span className="text-[12px] text-fg-3">Not tried yet</span>;
  if (isActive(run.status)) return <Throbber className="h-3.5 text-fg-3" />;
  const failed = (run.checks ?? []).filter((c) => !c.ok).length;
  const took = run.startedAt && run.endedAt ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 1000)) : 0;
  const good = run.status === 'done' && !failed;
  return (
    <span className={cx('text-[12px]', good ? 'text-ok' : 'text-err')}>
      {run.status !== 'done' ? 'Did not finish' : failed ? `${failed} of ${run.checks!.length} checks failed` : 'Passed'}
      <span className="text-fg-3">
        {took ? ` · ${took} s` : ''}
        {run.costUsd ? ` · ${money(run.costUsd)}` : ''}
      </span>
    </span>
  );
}

export function ExamplesEditor({ recipe, appId, onChange }: { recipe: AppRecipe; appId: string | null; onChange: (p: Partial<AppRecipe>) => void }) {
  const examples = recipe.examples ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AppRun>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!appId) return;
    api<{ examples: (AppExample & { last?: AppRun })[] }>(`/api/apps/${enc(appId)}/examples`).then(
      (r) => setRuns(Object.fromEntries(r.examples.filter((e) => e.last).map((e) => [e.id, e.last!]))),
      () => {},
    );
  }, [appId]);
  // A run of an example as it goes, and its checks once it ends.
  useRunEvents((run) => run.example && setRuns((m) => (m[run.example!]?.id === run.id || (m[run.example!]?.createdAt ?? 0) <= run.createdAt ? { ...m, [run.example!]: run } : m)));
  const set = (list: AppExample[]) => onChange({ examples: list.length ? list : undefined });
  const put = (i: number, e: AppExample) => set(examples.map((x, j) => (j === i ? e : x)));
  const tryThem = async (only?: string[]) => {
    setBusy(true);
    try {
      const r = await post<{ runs: { example: string; run?: AppRun; error?: string }[] }>(`/api/apps/${enc(appId ?? 'test')}/examples/run`, { recipe, ...(only ? { only } : {}) });
      setRuns((m) => ({ ...m, ...Object.fromEntries(r.runs.filter((x) => x.run).map((x) => [x.example, x.run!])) }));
      const failed = r.runs.find((x) => x.error);
      if (failed) toastError(new Error(failed.error));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const groups = checkValues(recipe);

  return (
    <div className="space-y-2">
      {!examples.length && <p className="pb-1 text-[13px] leading-relaxed text-fg-3">None yet. Add one here, or keep a finished test run as one.</p>}
      {examples.map((e, i) => {
        const run = runs[e.id];
        const fields = formOf(recipe, e);
        const shown = open === e.id;
        return (
          <div key={e.id} className={cx('rounded-xl border bg-bg-1', shown ? 'border-line-2' : 'border-line')}>
            <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
              <button type="button" onClick={() => setOpen(shown ? null : e.id)} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
                <span className="min-w-0 flex-1 truncate text-[13.5px]" translate="no">
                  {e.name || inputsLine(fields, asForm(e.inputs)) || e.id}
                </span>
                <Result run={run} />
              </button>
              <IconButton label="Try it" size="sm" onClick={() => void tryThem([e.id])} disabled={busy || (run && isActive(run.status))}>
                <FlaskConical size={14} />
              </IconButton>
              <IconButton label="Remove the example" size="sm" onClick={() => set(examples.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            {shown && (
              <div className="space-y-3 border-t border-line px-3 pt-3 pb-3">
                <input className={small} placeholder="Its name (optional)" value={e.name ?? ''} onChange={(ev) => put(i, { ...e, name: ev.target.value || undefined })} />
                {fields.length > 0 && <AppForm fields={fields} values={asForm(e.inputs)} files={{}} onChange={(k, v) => put(i, { ...e, inputs: { ...e.inputs, [k]: v } })} onFile={() => {}} />}
                <div>
                  <div className="mb-1 text-[12px] font-medium text-fg-2">Checks</div>
                  <div className="space-y-1.5">
                    {(e.checks ?? []).map((c, k) => {
                      const seen = run?.checks?.find((x) => x.rule === c);
                      return (
                        <div key={k}>
                          <div className="flex items-start gap-1.5">
                            <span className={cx('mt-3 h-2 w-2 shrink-0 rounded-full', !seen ? 'bg-line-2' : seen.ok ? 'bg-ok' : 'bg-err')} />
                            <div className="min-w-0 flex-1">
                              <RefText mono value={c} onChange={(v) => put(i, { ...e, checks: e.checks!.map((x, j) => (j === k ? v : x)) })} groups={groups} placeholder="{{answer.count}} > 0" />
                            </div>
                            <IconButton label="Remove the check" size="sm" onClick={() => put(i, { ...e, checks: e.checks!.filter((_, j) => j !== k) })}>
                              <X size={14} />
                            </IconButton>
                          </div>
                          {seen && !seen.ok && seen.why && (
                            <div className="mt-0.5 ml-3.5 text-[12px] text-err" translate="no">
                              {seen.why}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => put(i, { ...e, checks: [...(e.checks ?? []), ''] })}>
                      Add a check
                    </button>
                  </div>
                </div>
                {run && run.status !== 'done' && !isActive(run.status) && run.error && <div className="text-[12.5px] text-err">{run.error}</div>}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const id = fieldId('example', examples.map((x) => x.id));
            set([...examples, { id, inputs: Object.fromEntries(recipe.fields.filter((f) => f.default).map((f) => [f.id, f.default!])) }]);
            setOpen(id);
          }}
          className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-line-2 text-[13.5px] font-medium text-fg-2 transition-colors hover:border-accent/60 hover:bg-accent-soft hover:text-accent"
        >
          <Plus size={15} />
          Add an example
        </button>
        {examples.length > 0 && (
          <Button variant="secondary" className="!h-11 !rounded-xl" icon={busy ? <Throbber /> : <FlaskConical size={14} />} onClick={() => void tryThem()} disabled={busy}>
            Try them
          </Button>
        )}
      </div>
    </div>
  );
}

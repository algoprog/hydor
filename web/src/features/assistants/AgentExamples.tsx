// An agent's examples, on its page: messages to try it with and what its answer must do (sentences the helper model
// reads its answer against, or rules on what it gave). Try the examples runs each in a throwaway session as the agent,
// after saying what that costs; each shows how its last try went. After a change to the agent, it offers to try them
// again. Nothing runs by itself.
import { useEffect, useState } from 'react';
import { Check, FlaskConical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { AGENT_EXAMPLE_LIMITS, exampleName, isRuleCheck, type AgentExample, type AgentExampleRun, type AgentExamplesState } from '@shared/agent-files';
import type { Assistant, AssistantsState } from '@shared/assistants';
import { api, enc, post, put } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';
import { money, timeAgo } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { lastAgent } from '../../lib/start';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, Throbber } from '../../components/ui';
import { useAssistants } from './state';

const BUSY = new Set<AgentExampleRun['status']>(['running', 'waiting', 'judging']);

function RunStatus({ r }: { r: AgentExampleRun }) {
  const failed = (r.checks ?? []).filter((c) => !c.ok).length;
  const [label, cls] =
    r.status === 'passed'
      ? ['Passed', 'text-ok']
      : r.status === 'failed'
        ? [failed === 1 ? '1 check failed' : `${failed} checks failed`, 'text-err']
        : r.status === 'error'
          ? ['Did not finish', 'text-err']
          : r.status === 'waiting'
            ? ['Waiting for you', 'text-warn']
            : r.status === 'judging'
              ? ['Reading its checks…', 'text-info']
              : ['Trying it…', 'text-info'];
  return <span className={cx('text-[12.5px] font-medium', cls)}>{label}</span>;
}

/** One example in the editor: its name, message and checks. */
function ExampleEditor({ value, onSave, onCancel }: { value: AgentExample | null; onSave: (e: AgentExample) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(value?.name ?? '');
  const [message, setMessage] = useState(value?.message ?? '');
  const [checks, setChecks] = useState<string[]>(value?.checks?.length ? value.checks : ['']);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await onSave({ id: value?.id ?? '', ...(name.trim() ? { name: name.trim() } : {}), message, checks: checks.map((c) => c.trim()).filter(Boolean) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2.5 rounded-xl border border-line bg-bg-1 p-3">
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-fg-3">Its name (if you like)</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="A quiet week" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[12.5px] text-fg-3">The message to try it with</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={AGENT_EXAMPLE_LIMITS.message}
          placeholder="Write this week’s report: I merged two pull requests and fixed the login bug."
          className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
        />
      </label>
      <div>
        <div className="mb-1 text-[12.5px] text-fg-3">What its answer must do: a sentence each, read by the helper model, or a rule such as {'{{result.count}} > 0'} or {'{{reply}} contains Lisbon'}</div>
        <div className="space-y-1.5">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={c}
                onChange={(e) => setChecks(checks.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={AGENT_EXAMPLE_LIMITS.check}
                placeholder={i === 0 ? 'It names both pull requests' : 'Another thing a good answer does'}
                className={cx(inputCls, isRuleCheck(c) && 'font-mono text-[12.5px]')}
              />
              <IconButton label="Remove this check" size="sm" onClick={() => setChecks(checks.length > 1 ? checks.filter((_x, j) => j !== i) : [''])}>
                <X size={14} />
              </IconButton>
            </div>
          ))}
        </div>
        {checks.length < AGENT_EXAMPLE_LIMITS.checks && (
          <button type="button" className="mt-1.5 text-[12.5px] text-accent hover:underline" onClick={() => setChecks([...checks, ''])}>
            Add a check
          </button>
        )}
      </div>
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" disabled={busy || !message.trim()} onClick={() => void save()}>
          Save the example
        </Button>
      </div>
    </div>
  );
}

/** What a try gave and how its checks went. */
function RunDetail({ r }: { r: AgentExampleRun }) {
  return (
    <div className="mt-2 space-y-2 text-[13px]">
      {r.error && <div className="text-err">{r.error}</div>}
      {!!r.checks?.length && (
        <ul className="space-y-1">
          {r.checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              {c.ok ? <Check size={14} className="mt-0.5 shrink-0 text-ok" /> : <X size={14} className="mt-0.5 shrink-0 text-err" />}
              <span className="min-w-0">
                <span translate={c.check === 'It hands back a result' ? undefined : 'no'} className={cx(isRuleCheck(c.check) && 'font-mono text-[12.5px]')}>
                  {c.check}
                </span>
                {c.why && (
                  <span className="block text-[12px] text-fg-3" translate="no">
                    {c.why}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {r.result && (
        <div>
          <div className="text-[12px] text-fg-3">What it handed back</div>
          <pre translate="no" className="mt-0.5 max-h-48 overflow-auto rounded-lg bg-bg-2 px-2.5 py-1.5 text-[12px] whitespace-pre-wrap">
            {Object.entries(r.result)
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join('\n')}
          </pre>
        </div>
      )}
      {r.reply && (
        <div>
          <div className="text-[12px] text-fg-3">Its reply</div>
          <div translate="no" className="mt-0.5 max-h-48 overflow-auto rounded-lg bg-bg-2 px-2.5 py-1.5 text-[12.5px] whitespace-pre-wrap">
            {r.reply}
          </div>
        </div>
      )}
      {r.key && (
        <button type="button" className="text-[12.5px] text-accent hover:underline" onClick={() => openSession(r.key!)}>
          Open its session
        </button>
      )}
    </div>
  );
}

export function ExamplesPanel({ a }: { a: Assistant }) {
  const [st, setSt] = useState<AgentExamplesState | null>(null);
  const [editing, setEditing] = useState<AgentExample | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState<string[] | null>(null);
  const [starting, setStarting] = useState(false);
  const examples = a.examples ?? [];
  const load = () => {
    api<AgentExamplesState>(`/api/assistants/${enc(a.id)}/examples`).then(setSt, () => {});
  };
  const stamp = JSON.stringify(a);
  useEffect(() => {
    load();
    return onFeatureEvent('assistants', (e) => {
      if ((e.data as Record<string, unknown> | undefined)?.examples === a.id) load();
    });
  }, [a.id, stamp]);
  const going = !!st?.runs.some((r) => BUSY.has(r.status));
  // While some are going: a look every few seconds (one waiting on you says so).
  useEffect(() => {
    if (!going) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [going, a.id]);
  const saveAll = async (list: AgentExample[]) => {
    try {
      const r = await put<AssistantsState & { assistant: Assistant }>(`/api/assistants/${enc(a.id)}`, { ...a, examples: list });
      useAssistants.getState().set(r);
      setEditing(null);
    } catch (e) {
      toastError(e);
      throw e;
    }
  };
  const tryThem = async (only: string[]) => {
    setStarting(true);
    try {
      const w = lastAgent();
      const r = await post<AgentExamplesState>(`/api/assistants/${enc(a.id)}/examples/try`, { only, agent: w.agent, acpAgent: w.acp ?? undefined });
      setSt(r);
      setAsking(null);
    } catch (e) {
      toastError(e);
    } finally {
      setStarting(false);
    }
  };
  const runOf = (id: string) => st?.runs.find((r) => r.example === id);
  const est = st?.estimate;
  const n = asking?.length ?? 0;
  const total = est?.perRun !== undefined ? est.perRun * n : undefined;
  const passed = examples.filter((e) => runOf(e.id)?.status === 'passed').length;
  const tried = examples.filter((e) => runOf(e.id) && !BUSY.has(runOf(e.id)!.status)).length;
  return (
    <section className="rounded-2xl border border-line bg-panel p-4" data-i18n="agents">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[14px] font-semibold">Examples</h3>
        {tried > 0 && <span className={cx('text-[12.5px]', passed === tried ? 'text-ok' : 'text-err')}>{`${passed} of ${tried} passed`}</span>}
        {examples.length < AGENT_EXAMPLE_LIMITS.examples && (
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setEditing('new')}>
            Add an example
          </Button>
        )}
        {examples.length > 0 && (
          <Button size="sm" variant="secondary" icon={<FlaskConical size={14} />} disabled={going} onClick={() => setAsking(examples.map((e) => e.id))}>
            Try the examples
          </Button>
        )}
      </div>
      {st?.changedSince && !going && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]">
          <span className="flex-1">{`It changed since its examples were last tried (with version ${st.changedSince}).`}</span>
          <Button size="sm" variant="secondary" onClick={() => setAsking(examples.map((e) => e.id))}>
            Try them again
          </Button>
        </div>
      )}
      {!examples.length && editing !== 'new' && (
        <div className="text-[13px] text-fg-3">
          A message to try it with, and what its answer must do. After you change its instructions or settings, try them to see that it still does its job.
        </div>
      )}
      <div className="-my-1 divide-y divide-line">
        {examples.map((e) =>
          editing !== 'new' && editing?.id === e.id ? (
            <div key={e.id} className="py-2">
              <ExampleEditor value={e} onCancel={() => setEditing(null)} onSave={(x) => saveAll(examples.map((y) => (y.id === e.id ? { ...x, id: e.id } : y)))} />
            </div>
          ) : (
            <div key={e.id} className="py-2">
              <div className="flex items-center gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span translate="no" className="block truncate text-[13.5px]">
                    {exampleName(e)}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-fg-3">
                    {runOf(e.id) ? <RunStatus r={runOf(e.id)!} /> : <span>Not tried yet</span>}
                    {runOf(e.id)?.endedAt && <span>{timeAgo(runOf(e.id)!.endedAt)}</span>}
                    {!!runOf(e.id)?.costUsd && <span>{money(runOf(e.id)!.costUsd)}</span>}
                    <span>{(e.checks?.length ?? 0) === 1 ? '1 check' : `${e.checks?.length ?? 0} checks`}</span>
                  </span>
                </button>
                <IconButton label="Try this one" size="sm" disabled={!!runOf(e.id) && BUSY.has(runOf(e.id)!.status)} onClick={() => setAsking([e.id])}>
                  <FlaskConical size={14} />
                </IconButton>
                <IconButton label="Change it" size="sm" onClick={() => setEditing(e)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton label="Remove it" size="sm" onClick={() => void saveAll(examples.filter((y) => y.id !== e.id)).catch(() => {})}>
                  <Trash2 size={14} />
                </IconButton>
              </div>
              {open === e.id && (
                <div className="mt-1.5 pl-0.5">
                  <div translate="no" className="text-[13px] whitespace-pre-wrap text-fg-2">
                    {e.message}
                  </div>
                  {runOf(e.id) ? <RunDetail r={runOf(e.id)!} /> : null}
                </div>
              )}
            </div>
          ),
        )}
      </div>
      {editing === 'new' && (
        <div className="mt-2">
          <ExampleEditor value={null} onCancel={() => setEditing(null)} onSave={(x) => saveAll([...examples, x])} />
        </div>
      )}
      <Dialog
        open={!!asking}
        onClose={() => setAsking(null)}
        title={n === 1 ? 'Try this example?' : `Try its ${n} examples?`}
        width={480}
        part="agents"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<FlaskConical size={14} />} disabled={starting} onClick={() => void tryThem(asking ?? [])}>
              {n === 1 ? 'Try it' : 'Try them'}
            </Button>
          </>
        }
      >
        <div className="space-y-2.5 text-[13.5px]">
          <p>{n === 1 ? `This starts one session as ${a.name}${est?.tier ? `, thinking with ${est.tier}` : ''}, with the example’s message.` : `This starts ${n} sessions as ${a.name}${est?.tier ? `, thinking with ${est.tier}` : ''}, one for each example.`}</p>
          {!est ? (
            <Throbber className="text-fg-3" />
          ) : total !== undefined ? (
            <p>
              About <b>{money(total)}</b>
              {n > 1 ? ` in all (${money(est.perRun!)} each)` : ''}, {est.from === 'tries' ? 'from what its last tries cost.' : 'from what its sessions cost this month.'}
            </p>
          ) : (
            <p className="text-fg-3">What a try costs shows once one has run: it is a session as the agent, like any other.</p>
          )}
          {est?.budgetLeft !== undefined && <p className="text-fg-3">{`It counts towards its monthly budget: ${money(est.budgetLeft)} is left.`}</p>}
          <p className="text-fg-3">
            Each works in an empty folder of its own and sends nothing: what it would send through your connected apps is kept as what it would have sent, and what it hands back goes nowhere but here. The helper model then reads each answer against its checks.
          </p>
        </div>
      </Dialog>
    </section>
  );
}

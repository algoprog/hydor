// Install from a file (the Agents page): pick or drop a .hydor-agent file, see what it brings and what it needs before
// anything is saved, and install it: beside an agent of yours with the same name, unless you choose to replace that one,
// with the schedules it suggests added paused if you like.
import { useRef, useState } from 'react';
import { FileDown } from 'lucide-react';
import { AGENT_FILE_EXT, AGENT_FILE_MAX, type AgentInstallPreview } from '@shared/agent-files';
import type { Assistant, AssistantsState } from '@shared/assistants';
import { enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { lastAgent } from '../../lib/start';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Segmented, Switch } from '../../components/ui';
import { AssistantIcon } from './icons';
import { useAssistants } from './state';

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'warn' }) {
  if (!items.length) return null;
  return (
    <div className={cx('rounded-xl border px-3.5 py-2.5', tone === 'warn' ? 'border-warn/40 bg-warn/10' : 'border-line bg-bg-1')}>
      <div className="mb-1 text-[12.5px] font-semibold">{title}</div>
      <ul className="list-disc space-y-0.5 pl-4 text-[13px]">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export function InstallAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [p, setP] = useState<AgentInstallPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replace, setReplace] = useState(false);
  const [schedules, setSchedules] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => (setFile(null), setP(null), setError(null), setReplace(false), setSchedules(false));
  const close = () => (reset(), onClose());
  const read = async (f: File | undefined) => {
    if (!f) return;
    reset();
    if (f.size > AGENT_FILE_MAX) return setError('That file is too big for an agent file');
    const text = await f.text();
    setFile({ name: f.name, text });
    try {
      setP(await post<AgentInstallPreview>('/api/assistants/install/check', { file: text }));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const install = async () => {
    if (!file || !p) return;
    setBusy(true);
    try {
      const w = lastAgent();
      const r = await post<AssistantsState & { assistant: Assistant; schedules: number }>('/api/assistants/install', {
        file: file.text,
        replace: replace && !!p.clash,
        schedules,
        agent: w.agent,
        acpAgent: w.acp ?? undefined,
      });
      useAssistants.getState().set(r);
      toast(replace && p.clash ? `Replaced ${r.assistant.name}` : `Installed ${r.assistant.name}`, 'ok');
      close();
      go(`/agents/${enc(r.assistant.id)}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const name = replace && p?.clash ? p.clash.name : p?.beside;
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Install an agent from a file"
      width={560}
      part="agents"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {p && (
            <Button variant="primary" disabled={busy} onClick={() => void install()}>
              {replace && p.clash ? 'Replace mine' : 'Install'}
            </Button>
          )}
        </>
      }
    >
      <div
        className="space-y-3 text-[13.5px]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void read(e.dataTransfer.files?.[0]);
        }}
      >
        <input ref={input} type="file" accept={`${AGENT_FILE_EXT},.json,application/json`} className="hidden" onChange={(e) => void read(e.target.files?.[0] ?? undefined).finally(() => (e.target.value = ''))} />
        {!p && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-2 px-4 py-6 text-center hover:border-accent"
          >
            <FileDown size={20} className="text-fg-3" />
            <span className="font-medium">Choose a file</span>
            <span className="text-[12.5px] text-fg-3">An agent’s file (.hydor-agent), downloaded from another Hydor with Download as a file. You can drop it here too.</span>
          </button>
        )}
        {error && <div className="rounded-xl border border-err/40 bg-err/10 px-3.5 py-2.5 text-[13px]">{error}</div>}
        {p && (
          <>
            <div className="flex items-start gap-3">
              <AssistantIcon icon={p.agent.icon ?? 'bot'} size={18} />
              <div className="min-w-0 flex-1">
                <div translate="no" className="text-[15px] font-semibold break-words">
                  {name}
                </div>
                {p.agent.description && (
                  <div translate="no" className="text-[13px] text-fg-3">
                    {p.agent.description}
                  </div>
                )}
                <div translate="no" className="mt-0.5 truncate text-[12px] text-fg-3">
                  {file?.name}
                </div>
              </div>
              <button type="button" className="shrink-0 text-[12.5px] text-accent hover:underline" onClick={() => input.current?.click()}>
                Another file
              </button>
            </div>
            <List title="What it brings" items={p.brings} />
            <List title="What it needs from you" items={p.needs} tone="warn" />
            {!!p.notes.length && (
              <ul className="space-y-1 text-[12.5px] text-fg-3">
                {p.notes.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {!!p.agent.instructions && (
              <details className="rounded-xl border border-line px-3.5 py-2">
                <summary className="cursor-pointer text-[12.5px] font-semibold">Its instructions</summary>
                <div translate="no" className="mt-1.5 max-h-56 overflow-auto text-[12.5px] whitespace-pre-wrap text-fg-2">
                  {p.agent.instructions}
                </div>
              </details>
            )}
            {p.clash && (
              <div className="space-y-1.5 rounded-xl border border-line bg-bg-1 px-3.5 py-2.5">
                <div className="text-[13px]">{`You have an agent named “${p.clash.name}” already.`}</div>
                <Segmented
                  size="sm"
                  value={replace ? 'replace' : 'beside'}
                  onChange={(v) => setReplace(v === 'replace')}
                  options={[
                    { value: 'beside', label: `Install beside it, as “${p.beside}”` },
                    { value: 'replace', label: 'Replace mine' },
                  ]}
                />
                {replace && <div className="text-[12.5px] text-fg-3">Yours becomes this one, as a new version: the way it is now stays in its Versions, to bring back, and your examples stay.</div>}
              </div>
            )}
            {!!p.schedules.length && (
              <label className="flex items-center justify-between gap-3">
                <span>
                  {p.schedules.length === 1 ? 'Add the schedule it suggests, paused' : `Add the ${p.schedules.length} schedules it suggests, paused`}
                  <span className="block text-[12px] text-fg-3" translate="no">
                    {p.schedules.map((s) => s.name).join(', ')}
                  </span>
                </span>
                <Switch on={schedules} onChange={setSchedules} label="Add the schedules it suggests, paused" />
              </label>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

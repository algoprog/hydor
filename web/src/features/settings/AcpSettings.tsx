// Settings → More agents: agents beyond Claude Code and Codex that speak the Agent Client Protocol
// (Gemini CLI, OpenCode, Qwen Code, Goose…). Each is a command the app starts per session; signing in
// happens once in the agent's own CLI.
import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import type { AcpAgentDef } from '@shared/types';
import { api, del, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Dialog, Dots, IconButton, inputCls, Section, useConfirm } from '../../components/ui';

type Def = AcpAgentDef & { installed: boolean };

export function AcpSettings() {
  const [data, setData] = useState<{ agents: Def[]; presets: Def[] } | null>(null);
  const [edit, setEdit] = useState<Partial<AcpAgentDef> | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<{ agents: Def[]; presets: Def[] }>('/api/acp-agents')
      .then(setData)
      .catch(toastError);
  useEffect(() => {
    load();
  }, []);
  const add = async (d: AcpAgentDef) => {
    await post('/api/acp-agents', { id: d.id, name: d.name, command: d.command, args: d.args, env: d.env }).catch(toastError);
    toast(`Added ${d.name}`, 'ok');
    load();
  };
  const remove = async (d: Def) => {
    if (!(await confirm({ title: `Remove ${d.name}?`, body: 'Its sessions stay listed; continuing them needs it set up again.', confirm: 'Remove', danger: true }))) return;
    await del(`/api/acp-agents/${d.id}`).catch(toastError);
    load();
  };
  return (
    <div className="space-y-4">
      <Section
        title="Your agents"
        sub="They show next to Claude Code and Codex when you start a session"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEdit({ args: [] })}>
            Add your own
          </Button>
        }
      >
        {!data ? (
          <Dots className="text-fg-3" />
        ) : !data.agents.length ? (
          <p className="text-[13px] leading-relaxed text-fg-3">None yet. Pick one below, or add any agent that speaks ACP by the command that starts it.</p>
        ) : (
          <div className="-my-1 divide-y divide-line">
            {data.agents.map((a) => (
              <AgentRow key={a.id} a={a}>
                <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>
                  Edit
                </Button>
                <IconButton label="Remove" size="sm" onClick={() => remove(a)}>
                  <Trash2 size={14} />
                </IconButton>
              </AgentRow>
            ))}
          </div>
        )}
      </Section>
      {data && data.presets.length > 0 && (
        <Section title="Agents that speak ACP" sub="Install one, sign in once in its own CLI, then add it here">
          <div className="-my-1 divide-y divide-line">
            {data.presets.map((a) => (
              <AgentRow key={a.id} a={a}>
                <Button size="sm" variant={a.installed ? 'primary' : 'ghost'} icon={<Plus size={13} />} onClick={() => add(a)}>
                  Add
                </Button>
              </AgentRow>
            ))}
          </div>
        </Section>
      )}
      <p className="px-1 text-[12.5px] leading-relaxed text-fg-3">
        The app talks to each agent over the Agent Client Protocol: it opens a session in the folder you pick, shows its messages and steps, and asks you before what the agent asks
        permission for. Goals, forks and hand-offs are for Claude Code and Codex.
      </p>
      <EditAgent value={edit} onClose={() => setEdit(null)} onSaved={load} />
      {confirmNode}
    </div>
  );
}

function AgentRow({ a, children }: { a: Def; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <AgentIcon agent="acp" name={a.name} size={22} />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{a.name}</div>
        <div className="flex items-center gap-1.5 truncate text-[12px] text-fg-3">
          {a.installed ? <CheckCircle2 size={12} className="text-ok" /> : <XCircle size={12} className="text-fg-3" />}
          <span className="truncate font-mono text-[11.5px]">{[a.command, ...a.args].join(' ')}</span>
          {!a.installed && a.hint && <span className="truncate">· not installed: {a.hint}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EditAgent({ value, onClose, onSaved }: { value: Partial<AcpAgentDef> | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [env, setEnv] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!value) return;
    setName(value.name ?? '');
    setCommand(value.command ?? '');
    setArgs((value.args ?? []).join(' '));
    setEnv(
      Object.entries(value.env ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
    );
  }, [value]);
  const save = async () => {
    setBusy(true);
    try {
      const envObj = Object.fromEntries(
        env
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.includes('='))
          .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
      );
      await post('/api/acp-agents', { id: value?.id, name, command, args: args.split(/\s+/).filter(Boolean), env: envObj });
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!value}
      onClose={onClose}
      title={value?.id ? `Edit ${value.name}` : 'Add an agent'}
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim() || !command.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="mb-1 block text-fg-2">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Gemini CLI" className={inputCls} autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
          <label className="block">
            <span className="mb-1 block text-fg-2">Command</span>
            <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="gemini" className={cx(inputCls, 'font-mono text-[12.5px]')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-fg-2">Arguments</span>
            <input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--experimental-acp" className={cx(inputCls, 'font-mono text-[12.5px]')} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-fg-2">Environment (optional, NAME=value per line)</span>
          <textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} spellCheck={false} className={cx(inputCls, 'h-auto py-2 font-mono text-[12px]')} />
        </label>
        <p className="leading-relaxed text-fg-3">The command must start the agent in ACP mode, speaking JSON-RPC on its standard input and output.</p>
      </div>
    </Dialog>
  );
}

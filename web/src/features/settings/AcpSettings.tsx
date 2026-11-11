// Settings → More agents: agents beyond Claude Code and Codex that speak the Agent Client Protocol
// (Gemini CLI, OpenCode, Qwen Code, Goose, Hermes Agent, Pi…). Each is a command the app starts per session; signing in
// happens once in the agent's own CLI.
import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react';
import type { AcpAgentDef } from '@shared/types';
import { api, del, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { go } from '../../lib/nav';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, Dialog, MenuItem, Throbber, inputCls, useConfirm } from '../../components/ui';
import { EmptyRow, Group, MoreMenu, Row, Stack } from './kit';

type Def = AcpAgentDef & { installed: boolean };

/** How many agents that are not installed show before "Show all". */
const NOT_INSTALLED_SHOWN = 6;

export function AcpSettings() {
  const [data, setData] = useState<{ agents: Def[]; presets: Def[] } | null>(null);
  const [edit, setEdit] = useState<Partial<AcpAgentDef> | null>(null);
  const [all, setAll] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () => api<{ agents: Def[]; presets: Def[] }>('/api/acp-agents').then(setData).catch(toastError);
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
  // The installed ones first, then the rest in their own order.
  const presets = data ? [...data.presets.filter((p) => p.installed), ...data.presets.filter((p) => !p.installed)] : [];
  const installed = presets.filter((p) => p.installed).length;
  const collapsed = !all && presets.length - installed > NOT_INSTALLED_SHOWN;
  const shown = collapsed ? presets.slice(0, installed + NOT_INSTALLED_SHOWN) : presets;
  return (
    <Stack>
      <Group
        title="Your agents"
        hint="They show next to Claude Code and Codex when you start a session"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEdit({ args: [] })}>
            Add your own
          </Button>
        }
      >
        {!data ? (
          <Row label="Looking for your agents…" control={<Throbber className="text-fg-3" />} />
        ) : !data.agents.length ? (
          <EmptyRow>None yet. Pick one below, or add any agent that speaks ACP by the command that starts it.</EmptyRow>
        ) : (
          data.agents.map((a) => (
            <Row
              key={a.id}
              icon={<AgentIcon agent="acp" name={a.name} size={20} />}
              label={<span translate="no">{a.name}</span>}
              hint={
                a.builtin ? (
                  <span translate="no">Built in: {a.hint?.replace(/^Built in: /, '')}</span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    {a.installed ? <CheckCircle2 size={12} className="shrink-0 text-ok" /> : <XCircle size={12} className="shrink-0 text-fg-3" />}
                    <span className="truncate font-mono text-[11.5px]" title={[a.command, ...a.args].join(' ')} translate="no">
                      {[a.command, ...a.args].join(' ')}
                    </span>
                    {!a.installed && <span className="shrink-0">· not installed</span>}
                  </span>
                )
              }
              control={
                a.builtin ? (
                  <Button size="sm" variant="secondary" onClick={() => go('/settings?s=models')}>
                    Models
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEdit(a)}>
                      Edit
                    </Button>
                    <MoreMenu width={190}>
                      {(close) => (
                        <MenuItem
                          icon={<Trash2 size={14} />}
                          danger
                          onClick={() => {
                            close();
                            void remove(a);
                          }}
                        >
                          Remove
                        </MenuItem>
                      )}
                    </MoreMenu>
                  </>
                )
              }
            />
          ))
        )}
      </Group>
      {data && presets.length > 0 && (
        <Group
          title="Agents that speak ACP"
          hint="Install one, sign in once in its own CLI, then add it here"
          info="The app talks to each agent over the Agent Client Protocol: it opens a session in the folder you pick, shows its messages and steps, and asks you before what the agent asks permission for. Goals, forks and hand-offs are for Claude Code and Codex."
        >
          {shown.map((a) => (
            <Row
              key={a.id}
              icon={<AgentIcon agent="acp" name={a.name} size={20} />}
              label={<span translate="no">{a.name}</span>}
              hint={
                a.installed ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="shrink-0 text-ok" /> Installed
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0">Not installed</span>
                    {a.hint && (
                      <span className="truncate font-mono text-[11.5px]" title={a.hint} translate="no">
                        · {a.hint}
                      </span>
                    )}
                  </span>
                )
              }
              control={
                <Button size="sm" variant={a.installed ? 'primary' : 'secondary'} icon={<Plus size={13} />} onClick={() => add(a)}>
                  Add
                </Button>
              }
            />
          ))}
          {collapsed && <Row label={`Show all ${presets.length}`} onClick={() => setAll(true)} />}
        </Group>
      )}
      <EditAgent value={edit} onClose={() => setEdit(null)} onSaved={load} />
      {confirmNode}
    </Stack>
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

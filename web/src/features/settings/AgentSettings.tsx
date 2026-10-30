// Settings for the agents themselves: MCP servers, skills, Claude Code plugins and the instruction
// files (CLAUDE.md, AGENTS.md), for one working folder where that matters.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Download, KeyRound, LogIn, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Agent, MarketplaceEntry, McpEntry, McpScope, McpSpec, McpStatus, McpTransport, PluginEntry, SetupResult, SkillEntry } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { compact, tildify } from '../../lib/format';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Badge, Button, cx, Dialog, Dots, IconButton, inputCls, Section, Segmented, Switch, useConfirm } from '../../components/ui';
import { showTerminal, type TerminalInfo } from '../terminal/TerminalPanel';
import { EditorDialog, InstructionsEditor } from './Instructions';

const AGENTS: Agent[] = ['claude', 'codex'];

/** The one line that matters from an agent CLI's output (a JSON result line's message, else the last line). */
function gist(output: string): string {
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (j && typeof j === 'object' && (j.message || j.error)) return String(j.message ?? j.error);
    } catch {}
  }
  return lines[lines.length - 1] ?? '';
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-medium text-fg-2">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11.5px] leading-snug text-fg-3">{hint}</div>}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-6 text-fg-3">
      <Dots />
    </div>
  );
}

function AgentTitle({ agent }: { agent: Agent }) {
  return (
    <span className="flex items-center gap-2">
      <AgentIcon agent={agent} size={16} />
      {agentName(agent)}
    </span>
  );
}

function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onChange('')} placeholder={placeholder} className={cx(inputCls, 'h-8.5 pl-8 text-[13.5px]')} />
    </div>
  );
}

// ---- MCP servers -------------------------------------------------------------------------

const MCP_SCOPE: Record<McpScope, string> = { user: 'All folders', local: 'This folder, only you', project: 'This folder, shared' };

/** Splits a command line the way a shell would (quotes and backslashes), expanding a leading ~. */
function splitCommand(line: string, home: string): string[] {
  const out: string[] = [];
  let cur = '';
  let open = false;
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === q) q = null;
      else if (ch === '\\' && q === '"' && i + 1 < line.length) cur += line[++i];
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      q = ch;
      open = true;
    } else if (ch === '\\' && i + 1 < line.length) {
      cur += line[++i];
      open = true;
    } else if (/\s/.test(ch)) {
      if (open) out.push(cur);
      cur = '';
      open = false;
    } else {
      cur += ch;
      open = true;
    }
  }
  if (open) out.push(cur);
  return out.map((a) => (home && (a === '~' || a.startsWith('~/')) ? home + a.slice(1) : a));
}

/** `KEY=value` (or `Name: value`) lines into an object; blank lines and # comments are skipped. */
function pairs(text: string, sep: '=' | ':', what: string): Record<string, string> {
  const out: Record<string, string> = {};
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const at = line.indexOf(sep);
    if (at <= 0) throw new Error(`${what} line ${i + 1} needs ${sep === '=' ? 'KEY=value' : 'Name: value'}`);
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  });
  return out;
}

function AgentToggle({ agent, on, disabled, onChange }: { agent: Agent; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 transition-colors ring-inset disabled:opacity-40',
        on ? 'bg-bg-3 text-fg ring-line-2' : 'text-fg-3 ring-line hover:text-fg',
      )}
    >
      <AgentIcon agent={agent} size={14} />
      {agentName(agent)}
      {on && <Check size={13} strokeWidth={2.5} />}
    </button>
  );
}

function AddMcpDialog({ open, cwd, onClose, onAdded }: { open: boolean; cwd: string; onClose: () => void; onAdded: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [agents, setAgents] = useState<Agent[]>(AGENTS);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [headers, setHeaders] = useState('');
  const [bearer, setBearer] = useState('');
  const [scope, setScope] = useState<McpScope>('user');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<(SetupResult & { agent: Agent })[]>([]);

  useEffect(() => {
    if (!open) return;
    setAgents(AGENTS);
    setName('');
    setTransport('stdio');
    setCommand('');
    setUrl('');
    setEnv('');
    setHeaders('');
    setBearer('');
    setScope('user');
    setFailed([]);
  }, [open]);

  // Codex has no SSE transport.
  const chosen = agents.filter((a) => a === 'claude' || transport !== 'sse');
  const claude = chosen.includes('claude');
  const codex = chosen.includes('codex');
  const ready = !!chosen.length && !!name.trim() && (transport === 'stdio' ? !!command.trim() : /^https?:\/\/\S+$/.test(url.trim()));

  const submit = async () => {
    if (!ready || busy) return;
    let spec: McpSpec;
    try {
      const parts = splitCommand(command, home);
      spec =
        transport === 'stdio'
          ? { agents: chosen, name: name.trim(), transport, cwd, scope, command: parts[0], args: parts.slice(1), env: pairs(env, '=', 'Environment') }
          : { agents: chosen, name: name.trim(), transport, cwd, scope, url: url.trim(), headers: claude ? pairs(headers, ':', 'Header') : undefined, bearerEnv: (codex && bearer.trim()) || undefined };
    } catch (e) {
      return toastError(e);
    }
    setBusy(true);
    setFailed([]);
    try {
      const r = await post<{ results: (SetupResult & { agent: Agent })[] }>('/api/setup/mcp', spec);
      onAdded();
      const bad = r.results.filter((x) => !x.ok);
      if (!bad.length) {
        toast(`Added ${spec.name}`, 'ok');
        onClose();
      } else {
        // Whichever agents took it are done; a retry goes only to the ones that failed.
        setAgents(bad.map((b) => b.agent));
        setFailed(bad);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const mono = cx(inputCls, 'font-mono text-[13px]');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an MCP server"
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!ready || busy}>
            {busy ? <Dots /> : 'Add server'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label="Add to">
          <div className="flex flex-wrap gap-2">
            {AGENTS.map((a) => (
              <AgentToggle key={a} agent={a} on={chosen.includes(a)} disabled={a === 'codex' && transport === 'sse'} onChange={(on) => setAgents((l) => (on ? [...l, a] : l.filter((x) => x !== a)))} />
            ))}
          </div>
        </Field>
        <Field label="Name" hint="Letters, digits, dots, dashes or underscores; the agents show tools as name/tool.">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="github" autoFocus autoComplete="off" />
        </Field>
        <Field label="Type" hint={transport === 'sse' ? 'SSE is the older remote transport; Codex does not support it.' : undefined}>
          <Segmented
            size="sm"
            value={transport}
            onChange={setTransport}
            options={[
              { value: 'stdio', label: 'Command' },
              { value: 'http', label: 'HTTP' },
              { value: 'sse', label: 'SSE' },
            ]}
          />
        </Field>
        {transport === 'stdio' ? (
          <>
            <Field label="Command" hint="Runs on this machine when a session starts. Quote arguments that contain spaces.">
              <input className={mono} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx -y @modelcontextprotocol/server-github" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Environment" hint="One KEY=value per line. Values go into the agents' config files and are never shown here again.">
              <textarea className={cx(mono, 'h-20 resize-y py-2')} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="GITHUB_TOKEN=…" spellCheck={false} />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <input className={mono} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" autoComplete="off" spellCheck={false} />
            </Field>
            {claude && (
              <Field label={codex ? 'Headers (Claude Code)' : 'Headers'} hint="One Name: value per line, for servers that take an API key. Servers that use OAuth need none: sign in from the list after adding.">
                <textarea className={cx(mono, 'h-16 resize-y py-2')} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Authorization: Bearer …" spellCheck={false} />
              </Field>
            )}
            {codex && (
              <Field label={claude ? 'Bearer token variable (Codex)' : 'Bearer token variable'} hint="Optional. Codex sends the value of this environment variable as the bearer token.">
                <input className={mono} value={bearer} onChange={(e) => setBearer(e.target.value)} placeholder="GITHUB_TOKEN" autoComplete="off" spellCheck={false} />
              </Field>
            )}
          </>
        )}
        {claude && (
          <Field
            label={codex ? 'Where Claude Code uses it' : 'Where it is used'}
            hint={
              scope === 'user'
                ? 'Every Claude Code session on this machine.'
                : scope === 'local'
                  ? `Only sessions in ${tildify(cwd, home)}, kept in your own Claude Code config.`
                  : `Saved to .mcp.json in ${tildify(cwd, home)}, so everyone working in the repository gets it.`
            }
          >
            <Segmented
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'user', label: 'All folders' },
                { value: 'local', label: 'This folder' },
                { value: 'project', label: 'Shared .mcp.json' },
              ]}
            />
          </Field>
        )}
        {codex && claude && scope !== 'user' && <div className="text-[11.5px] text-fg-3">Codex servers always apply to every folder.</div>}
        {failed.map((f) => (
          <div key={f.agent} className="rounded-lg border border-err/30 bg-err/5 px-3 py-2">
            <div className="text-[12.5px] font-medium text-err">{agentName(f.agent)} did not add it</div>
            <pre className="mt-1 max-h-36 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-fg-2">{f.output || 'No output'}</pre>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

const STATUS_BADGE: Record<McpStatus['state'], { tone: 'ok' | 'warn' | 'err' | 'neutral'; label: string }> = {
  connected: { tone: 'ok', label: 'Connected' },
  auth: { tone: 'warn', label: 'Needs sign-in' },
  pending: { tone: 'warn', label: 'Still connecting' },
  failed: { tone: 'err', label: 'Failed' },
  off: { tone: 'neutral', label: 'Off' },
};

function McpRow({ s, status, onLogin, onRemove }: { s: McpEntry; status?: McpStatus; onLogin: () => void; onRemove: () => void }) {
  const target = s.transport === 'stdio' ? [s.command, ...(s.args ?? [])].filter(Boolean).join(' ') : s.url;
  const keys = [...(s.envKeys ?? []), ...(s.headerKeys ?? []), ...(s.bearerEnv ? [`Bearer $${s.bearerEnv}`] : [])];
  const badge = status && STATUS_BADGE[status.state];
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] font-medium">{s.name}</span>
          <Badge>{s.transport === 'stdio' ? 'Command' : s.transport.toUpperCase()}</Badge>
          {s.agent === 'claude' && <Badge>{MCP_SCOPE[s.scope]}</Badge>}
          {s.enabled === false && <Badge tone="warn">Off</Badge>}
          {badge && (
            <Badge tone={badge.tone}>
              {badge.label}
              {status?.state === 'connected' && status.tools != null && ` · ${status.tools} tool${status.tools === 1 ? '' : 's'}`}
            </Badge>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[12px] text-fg-3" title={target}>
          {target}
        </div>
        {keys.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {keys.map((k) => (
              <span key={k} title="Set; the value stays on the server" className="inline-flex items-center gap-1 rounded bg-bg-2 px-1.5 py-px font-mono text-[11px] text-fg-2">
                <KeyRound size={10} className="text-fg-3" />
                {k}
              </span>
            ))}
          </div>
        )}
        {status?.state === 'failed' && <div className="mt-1.5 text-[12px] break-words text-err">{status.error || 'The server did not start or did not answer.'}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {s.transport !== 'stdio' &&
          (status?.state === 'auth' ? (
            <Button size="sm" icon={<LogIn size={14} />} onClick={onLogin}>
              Sign in
            </Button>
          ) : (
            <IconButton label="Sign in (OAuth) in a terminal" size="sm" onClick={onLogin}>
              <LogIn size={15} />
            </IconButton>
          ))}
        <IconButton label="Remove" size="sm" onClick={onRemove}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function McpSettings({ cwd }: { cwd: string }) {
  const [list, setList] = useState<McpEntry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<Partial<Record<Agent, Record<string, McpStatus> | 'busy'>>>({});
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(
    () =>
      api<{ servers: McpEntry[] }>(`/api/setup/mcp?cwd=${enc(cwd)}`)
        .then((r) => setList(r.servers))
        .catch(toastError),
    [cwd],
  );
  useEffect(() => {
    setList(null);
    setStatus({});
    load();
  }, [load]);

  /** Starts each server the way a new session would and shows how it went. */
  const check = async (agent: Agent) => {
    setStatus((st) => ({ ...st, [agent]: 'busy' }));
    try {
      const r = await post<{ servers: McpStatus[] }>('/api/setup/mcp/status', { agent, cwd });
      setStatus((st) => ({ ...st, [agent]: Object.fromEntries(r.servers.map((x) => [x.name, x])) }));
    } catch (e) {
      toastError(e);
      setStatus((st) => ({ ...st, [agent]: undefined }));
    }
  };
  const login = async (s: McpEntry) => {
    try {
      showTerminal(await post<TerminalInfo>('/api/setup/mcp/login', { agent: s.agent, name: s.name, cwd }));
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async (s: McpEntry) => {
    const ok = await confirm({
      title: `Remove ${s.name}?`,
      body: <>{agentName(s.agent)} stops loading this server. Sessions already running keep it until they restart.</>,
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await post<SetupResult>('/api/setup/mcp/remove', { agent: s.agent, name: s.name, scope: s.scope, cwd });
      if (!r.ok) throw new Error(gist(r.output) || 'Could not remove the server');
      toast(`Removed ${s.name}`, 'ok');
    } catch (e) {
      toastError(e);
    }
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-3">New sessions load these servers; sessions already running pick up changes when they restart.</p>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
          Add server
        </Button>
      </div>
      {AGENTS.map((a) => {
        const rows = (list ?? []).filter((s) => s.agent === a);
        const st = status[a];
        return (
          <Section
            key={a}
            title={<AgentTitle agent={a} />}
            actions={
              rows.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => check(a)} disabled={st === 'busy'} title="Start every server the way a new session would and see which connect">
                  {st === 'busy' ? (
                    <>
                      <Dots /> Connecting
                    </>
                  ) : (
                    'Check connections'
                  )}
                </Button>
              )
            }
          >
            {!list ? (
              <Loading />
            ) : rows.length ? (
              <div className="-my-1 divide-y divide-line">
                {rows.map((s) => (
                  <McpRow key={`${s.scope}:${s.name}`} s={s} status={st && st !== 'busy' ? st[s.name] : undefined} onLogin={() => login(s)} onRemove={() => remove(s)} />
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-fg-3">No MCP servers yet.</div>
            )}
          </Section>
        );
      })}
      <AddMcpDialog open={adding} cwd={cwd} onClose={() => setAdding(false)} onAdded={load} />
      {confirmNode}
    </div>
  );
}

// ---- skills ------------------------------------------------------------------------------

const SKILL_SCOPE: Record<SkillEntry['scope'], string> = { user: 'All folders', project: 'This folder', repo: 'This repository', plugin: 'Plugin', system: 'Built in', admin: 'Admin' };
const SCOPE_ORDER: SkillEntry['scope'][] = ['project', 'repo', 'user', 'plugin', 'system', 'admin'];

function NewSkillDialog({ open, cwd, onClose, onCreated }: { open: boolean; cwd: string; onClose: () => void; onCreated: (path: string) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [agent, setAgent] = useState<Agent>('claude');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [scope, setScope] = useState<'user' | 'project'>('user');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName('');
    setDesc('');
    setScope('user');
  }, [open]);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const r = await post<{ path: string }>('/api/setup/skills', { agent, name, description: desc, scope, cwd });
      onClose();
      onCreated(r.path);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const where = agent === 'codex' ? '~/.agents/skills' : scope === 'project' ? `${tildify(cwd, home)}/.claude/skills` : '~/.claude/skills';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New skill"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim() || busy}>
            {busy ? <Dots /> : 'Create and edit'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <Field label="For">
          <Segmented
            size="sm"
            value={agent}
            onChange={setAgent}
            options={AGENTS.map((a) => ({ value: a, label: agentName(a), icon: <AgentIcon agent={a} size={13} /> }))}
          />
        </Field>
        <Field label="Name" hint="Becomes the folder name: lowercase, with dashes.">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="release-notes" autoFocus autoComplete="off" />
        </Field>
        <Field label="When to use it" hint="The agent sees this line in every session and reads the rest of the skill only when it applies.">
          <textarea className={cx(inputCls, 'h-20 resize-y py-2')} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Use when writing release notes from merged pull requests" />
        </Field>
        {agent === 'claude' && (
          <Field label="Where">
            <Segmented
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'user', label: 'All folders' },
                { value: 'project', label: 'This folder' },
              ]}
            />
          </Field>
        )}
        <div className="text-[11.5px] text-fg-3">
          Saved to <span className="font-mono">{where}</span>
          {agent === 'codex' && ', which Codex reads in every folder'}.
        </div>
      </div>
    </Dialog>
  );
}

function SkillRow({ s, onOpen, onToggle, onDelete }: { s: SkillEntry; onOpen: () => void; onToggle: (on: boolean) => void; onDelete: () => void }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={onOpen} className={cx('min-w-0 truncate text-left text-[14px] font-medium hover:underline', !s.enabled && 'text-fg-3')}>
            {s.name}
          </button>
          <Badge>{SKILL_SCOPE[s.scope]}</Badge>
          {s.plugin && <Badge tone="info">{s.plugin.split('@')[0]}</Badge>}
        </div>
        {s.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{s.description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <IconButton label={s.deletable ? 'Edit' : 'Open'} size="sm" onClick={onOpen}>
          <Pencil size={14} />
        </IconButton>
        {s.deletable && (
          <IconButton label="Delete" size="sm" onClick={onDelete}>
            <Trash2 size={14} />
          </IconButton>
        )}
        <Switch on={s.enabled} onChange={onToggle} label={s.enabled ? `Turn ${s.name} off` : `Turn ${s.name} on`} className="ml-1.5" />
      </div>
    </div>
  );
}

export function SkillsSettings({ cwd }: { cwd: string }) {
  const [data, setData] = useState<{ skills: SkillEntry[]; errors: string[] } | null>(null);
  const [agent, setAgent] = useState<'all' | Agent>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ path: string; title: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(
    () =>
      api<{ skills: SkillEntry[]; errors: string[] }>(`/api/setup/skills?cwd=${enc(cwd)}`)
        .then(setData)
        .catch(toastError),
    [cwd],
  );
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const toggle = async (s: SkillEntry, enabled: boolean) => {
    setData((d) => d && { ...d, skills: d.skills.map((x) => (x === s ? { ...x, enabled } : x)) });
    try {
      await post('/api/setup/skills/toggle', { agent: s.agent, name: s.name, path: s.path, enabled });
    } catch (e) {
      toastError(e);
      load();
    }
  };
  const remove = async (s: SkillEntry) => {
    const ok = await confirm({ title: `Delete ${s.name}?`, body: 'Its folder is deleted from disk, with every file in it.', confirm: 'Delete', danger: true });
    if (!ok) return;
    try {
      await post('/api/setup/skills/delete', { agent: s.agent, path: s.path, cwd });
      toast(`Deleted ${s.name}`, 'ok');
    } catch (e) {
      toastError(e);
    }
    load();
  };

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (data?.skills ?? []).filter((s) => (agent === 'all' || s.agent === agent) && words.every((w) => `${s.name} ${s.description} ${s.plugin ?? ''}`.toLowerCase().includes(w)));
  const sorted = (a: Agent) =>
    shown.filter((s) => s.agent === a).sort((x, y) => SCOPE_ORDER.indexOf(x.scope) - SCOPE_ORDER.indexOf(y.scope) || x.name.localeCompare(y.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={agent}
          onChange={setAgent}
          options={[{ value: 'all' as const, label: 'All' }, ...AGENTS.map((a) => ({ value: a, label: agentName(a), icon: <AgentIcon agent={a} size={13} /> }))]}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Filter skills" className="min-w-[160px] flex-1" />
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          New skill
        </Button>
      </div>
      {!!data?.errors.length && (
        <div className="rounded-lg border border-warn/35 bg-warn/10 px-3 py-2 text-[12.5px]">
          {data.errors.map((e, i) => (
            <div key={i} className="break-words">
              {e}
            </div>
          ))}
        </div>
      )}
      {AGENTS.filter((a) => agent === 'all' || agent === a).map((a) => {
        const rows = sorted(a);
        const total = data?.skills.filter((s) => s.agent === a).length ?? 0;
        return (
          <Section key={a} title={<AgentTitle agent={a} />} sub={data ? `${total} skill${total === 1 ? '' : 's'}${rows.length !== total ? `, ${rows.length} shown` : ''}` : undefined}>
            {!data ? (
              <Loading />
            ) : rows.length ? (
              <div className="-my-1 divide-y divide-line">
                {rows.map((s) => (
                  <SkillRow key={`${s.agent}:${s.path}`} s={s} onOpen={() => setEditing({ path: s.path, title: s.name })} onToggle={(on) => toggle(s, on)} onDelete={() => remove(s)} />
                ))}
              </div>
            ) : (
              <div className="text-[13px] text-fg-3">{words.length ? 'No skills match.' : 'No skills yet.'}</div>
            )}
          </Section>
        );
      })}
      <NewSkillDialog
        open={creating}
        cwd={cwd}
        onClose={() => setCreating(false)}
        onCreated={(path) => {
          load();
          setEditing({ path, title: 'New skill' });
        }}
      />
      <EditorDialog path={editing?.path ?? null} title={editing?.title} onClose={() => (setEditing(null), load())} />
      {confirmNode}
    </div>
  );
}

// ---- plugins -------------------------------------------------------------------------------

interface PluginsData {
  installed: PluginEntry[];
  available: PluginEntry[];
  marketplaces: MarketplaceEntry[];
  total: number;
}

const PAGE = 40;

function PluginRow({ p, busy, actions }: { p: PluginEntry; busy: boolean; actions: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cx('text-[14px] font-medium', p.installed && p.enabled === false && 'text-fg-3')}>{p.name}</span>
          {p.marketplace && <Badge>{p.marketplace}</Badge>}
          {p.version && <span className="text-[11.5px] text-fg-3">v{p.version}</span>}
          {!p.installed && p.installCount != null && (
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-fg-3" title={`${p.installCount.toLocaleString()} installs`}>
              <Download size={11} />
              {compact(p.installCount)}
            </span>
          )}
        </div>
        {p.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">{p.description}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{busy ? <Dots className="px-3 text-fg-3" /> : actions}</div>
    </div>
  );
}

export function PluginsSettings() {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<PluginsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [market, setMarket] = useState('');
  const [confirm, confirmNode] = useConfirm();
  const seq = useRef(0);

  const load = useCallback(async (query: string, lim: number) => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await api<PluginsData>(`/api/setup/plugins?q=${enc(query)}&limit=${lim}`);
      if (n === seq.current) setData(r);
    } catch (e) {
      if (n === seq.current) toastError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q, limit), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, limit, load]);

  const act = async (action: 'install' | 'uninstall' | 'enable' | 'disable', p: PluginEntry) => {
    if (action === 'install') {
      const ok = await confirm({
        title: `Install ${p.name}?`,
        body: (
          <>
            From <span className="font-medium text-fg">{p.marketplace}</span>, for every Claude Code session. Plugins can add skills, commands, agents, hooks and MCP servers; hooks and servers run commands on this
            machine, so install only plugins you trust.
          </>
        ),
        confirm: 'Install',
      });
      if (!ok) return;
    }
    if (action === 'uninstall') {
      const ok = await confirm({ title: `Uninstall ${p.name}?`, body: 'New Claude Code sessions stop loading its skills, commands and servers.', confirm: 'Uninstall', danger: true });
      if (!ok) return;
    }
    setBusy(p.id);
    try {
      const r = await post<SetupResult>(`/api/setup/plugins/${action}`, { id: p.id, scope: p.scope });
      if (!r.ok) throw new Error(gist(r.output) || `Could not ${action} ${p.name}`);
      toast(`${{ install: 'Installed', uninstall: 'Uninstalled', enable: 'Turned on', disable: 'Turned off' }[action]} ${p.name}`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };

  const marketAct = async (action: 'add' | 'remove', target: string) => {
    if (action === 'remove' && !(await confirm({ title: `Remove ${target}?`, body: 'Plugins installed from it are uninstalled too.', confirm: 'Remove', danger: true }))) return;
    setBusy(`market:${target}`);
    try {
      const r = await post<SetupResult>(`/api/setup/marketplaces/${action}`, { target });
      if (!r.ok) throw new Error(gist(r.output) || `Could not ${action} the marketplace`);
      toast(action === 'add' ? `Added ${target}` : `Removed ${target}`, 'ok');
      if (action === 'add') setMarket('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Installed" sub="Claude Code plugins on this machine. New sessions load them.">
        {!data ? (
          <Loading />
        ) : data.installed.length ? (
          <div className="-my-1 divide-y divide-line">
            {data.installed.map((p) => (
              <PluginRow
                key={p.id}
                p={p}
                busy={busy === p.id}
                actions={
                  <>
                    <IconButton label="Uninstall" size="sm" onClick={() => act('uninstall', p)}>
                      <Trash2 size={14} />
                    </IconButton>
                    <Switch on={p.enabled !== false} onChange={(on) => act(on ? 'enable' : 'disable', p)} label={p.enabled !== false ? `Turn ${p.name} off` : `Turn ${p.name} on`} className="ml-1.5" />
                  </>
                }
              />
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-fg-3">No plugins installed yet. Find one below.</div>
        )}
      </Section>

      <Section
        title="Browse"
        sub={data ? `${data.total.toLocaleString()} ${q ? 'matching' : 'available'}, most installed first` : 'Loading the marketplaces…'}
        actions={
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setLimit(PAGE);
            }}
            placeholder="Search plugins"
            className="w-full sm:w-64"
          />
        }
      >
        {!data ? (
          <Loading />
        ) : data.available.length ? (
          <>
            <div className={cx('-my-1 divide-y divide-line transition-opacity', loading && 'opacity-60')}>
              {data.available.map((p) => (
                <PluginRow
                  key={p.id}
                  p={p}
                  busy={busy === p.id}
                  actions={
                    <Button size="sm" variant="ghost" onClick={() => act('install', p)} disabled={!!busy}>
                      Install
                    </Button>
                  }
                />
              ))}
            </div>
            {data.available.length < data.total && (
              <div className="mt-3 flex justify-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
                  {loading ? <Dots /> : `Show more (${(data.total - data.available.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-[13px] text-fg-3">{q ? 'No plugins match.' : 'Nothing to install: add a marketplace below.'}</div>
        )}
      </Section>

      <Section title="Marketplaces" sub="Catalogs Claude Code installs plugins from">
        {!data ? (
          <Loading />
        ) : (
          <>
            <div className="-my-1 divide-y divide-line">
              {data.marketplaces.map((m) => (
                <div key={m.name} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{m.name}</div>
                    <div className="truncate font-mono text-[12px] text-fg-3">{m.repo ?? m.url ?? m.source}</div>
                  </div>
                  {busy === `market:${m.name}` ? (
                    <Dots className="px-3 text-fg-3" />
                  ) : (
                    <IconButton label="Remove" size="sm" onClick={() => marketAct('remove', m.name)} disabled={!!busy}>
                      <Trash2 size={14} />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (market.trim()) marketAct('add', market.trim());
              }}
            >
              <input className={cx(inputCls, 'h-8.5 font-mono text-[13px]')} value={market} onChange={(e) => setMarket(e.target.value)} placeholder="owner/repo, a git URL or a folder" spellCheck={false} />
              <Button size="sm" type="submit" disabled={!market.trim() || !!busy}>
                {busy === `market:${market.trim()}` ? <Dots /> : 'Add'}
              </Button>
            </form>
          </>
        )}
      </Section>
      {confirmNode}
    </div>
  );
}

// ---- instructions ----------------------------------------------------------------------------

export function InstructionsSettings({ cwd, agent, onAgent }: { cwd: string; agent: Agent; onAgent: (a: Agent) => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented size="sm" value={agent} onChange={onAgent} options={AGENTS.map((a) => ({ value: a, label: agentName(a), icon: <AgentIcon agent={a} size={13} /> }))} />
        <span className="w-full text-[12.5px] text-fg-3 sm:w-auto sm:min-w-0 sm:flex-1">
          {agent === 'claude'
            ? 'Claude Code reads all of these at the start of a session, outermost first; later files refine earlier ones.'
            : 'Codex reads its own file, then one file per folder from the repository root down to this one.'}
        </span>
      </div>
      <InstructionsEditor key={`${agent}:${cwd}`} agent={agent} cwd={cwd} className="h-[calc(100dvh-230px)] min-h-[440px]" />
    </div>
  );
}

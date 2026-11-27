// Settings for the agents themselves: MCP servers (Claude Code's, Codex's and Custom's), Claude Code's own plugins and
// the instruction files (CLAUDE.md, AGENTS.md), for one working folder where that matters.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, KeyRound, Link2, LogIn, LogOut, Pencil, Plug, Plus, Puzzle, Search, Trash2 } from 'lucide-react';
import type { Agent, MarketplaceEntry, McpEntry, McpFrom, McpScope, McpSpec, McpStatus, McpTarget, McpTransport, PluginEntry, SetupResult } from '@shared/types';
import { isProgram, PROGRAM_IDS, programUsable } from '@shared/programs';
import { api, enc, post, put } from '../../lib/api';
import { compact, tildify } from '../../lib/format';
import { toast, toastError, useApp } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Badge, Button, cx, Dialog, Throbber, IconButton, inputCls, MenuItem, Segmented, Switch, useConfirm } from '../../components/ui';
import { useSignInReturn } from '../connections/signInReturn';
import { useFeatureEvent } from '../../lib/featureEvents';
import { showTerminal, type TerminalInfo } from '../terminal/TerminalPanel';
import { InstructionsEditor } from './Instructions';
import { EmptyRow, Group, MoreMenu, Row, SectionActions, Stack } from './kit';
import { McpSignInDialog, type SignInServer } from './McpSignIn';

const AGENTS: Agent[] = ['claude', 'codex'];
/** Whose MCP servers the page lists: the programs' own settings, and Custom's, which Hydor keeps. */
const TARGETS: McpTarget[] = ['claude', 'codex', 'custom'];

const targetName = (t: McpTarget) => (t === 'custom' ? 'Custom' : agentName(t));
const TargetIcon = ({ target, size }: { target: McpTarget; size: number }) => (target === 'custom' ? <AgentIcon agent="acp" name="Custom" size={size} /> : <AgentIcon agent={target} size={size} />);

/** Where a server Custom reads from elsewhere was set up. */
const MCP_FROM: Record<McpFrom, string> = { claude: 'From Claude Code', codex: 'From Codex', project: 'From .mcp.json' };

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
      <Throbber />
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

function TargetToggle({ target, on, disabled, title, onChange }: { target: McpTarget; on: boolean; disabled?: boolean; title?: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!on)}
      className={cx(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] ring-1 transition-colors ring-inset disabled:opacity-40',
        on ? 'bg-bg-3 text-fg ring-line-2' : 'text-fg-3 ring-line hover:text-fg',
      )}
    >
      <TargetIcon target={target} size={14} />
      {targetName(target)}
      {on && <Check size={13} strokeWidth={2.5} />}
    </button>
  );
}

/** A command line back from its words, quoted where splitCommand would split them otherwise. */
const joinCommand = (words: string[]) => words.map((w) => (w && !/[\s"'\\]/.test(w) ? w : `"${w.replace(/(["\\])/g, '\\$1')}"`)).join(' ');

/** Adds a server to Claude Code, Codex and Custom; with `edit`, changes one of Custom's own. */
function McpDialog({ open, cwd, edit, onClose, onSaved }: { open: boolean; cwd: string; edit: McpEntry | null; onClose: () => void; onSaved: () => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const programs = useApp((s) => s.boot?.programs);
  const [targets, setTargets] = useState<McpTarget[]>([]);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransport>('stdio');
  const [command, setCommand] = useState('');
  const [url, setUrl] = useState('');
  const [env, setEnv] = useState('');
  const [headers, setHeaders] = useState('');
  const [bearer, setBearer] = useState('');
  const [scope, setScope] = useState<McpScope>('user');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<(SetupResult & { agent: McpTarget })[]>([]);

  useEffect(() => {
    if (!open) return;
    // Claude Code and Codex where they are set up (Custom reads their servers too); with neither, Custom.
    const set = PROGRAM_IDS.filter((p) => programUsable(programs, p));
    setTargets(edit ? ['custom'] : set.length ? set : ['custom']);
    setName(edit?.name ?? '');
    setTransport(edit?.transport ?? 'stdio');
    setCommand(edit?.command ? joinCommand([edit.command, ...(edit.args ?? [])]) : '');
    setUrl(edit?.url ?? '');
    setEnv((edit?.envKeys ?? []).map((k) => `${k}=`).join('\n'));
    setHeaders((edit?.headerKeys ?? []).map((k) => `${k}: `).join('\n'));
    setBearer('');
    setScope('user');
    setFailed([]);
  }, [open, edit]);

  /** Why a program cannot be picked, or undefined. */
  const unavailable = (t: McpTarget) => (isProgram(t) && !programUsable(programs, t) ? `${targetName(t)} is not set up: sign in to it in Settings → Agents → Accounts` : t === 'codex' && transport === 'sse' ? 'Codex does not support SSE' : undefined);
  const chosen = targets.filter((t) => !unavailable(t));
  const claude = chosen.includes('claude');
  const codex = chosen.includes('codex');
  const custom = chosen.includes('custom');
  const ready = !!chosen.length && !!name.trim() && (transport === 'stdio' ? !!command.trim() : /^https?:\/\/\S+$/.test(url.trim()));
  const unset = PROGRAM_IDS.filter((p) => !programUsable(programs, p));

  const submit = async () => {
    if (!ready || busy) return;
    let spec: McpSpec;
    try {
      const parts = splitCommand(command, home);
      spec =
        transport === 'stdio'
          ? { agents: chosen, name: name.trim(), transport, cwd, scope, command: parts[0], args: parts.slice(1), env: pairs(env, '=', 'Environment') }
          : { agents: chosen, name: name.trim(), transport, cwd, scope, url: url.trim(), headers: claude || custom ? pairs(headers, ':', 'Header') : undefined, bearerEnv: (codex && bearer.trim()) || undefined };
    } catch (e) {
      return toastError(e);
    }
    setBusy(true);
    setFailed([]);
    try {
      if (edit) {
        await put(`/api/setup/mcp/custom/${enc(edit.name)}`, spec);
        onSaved();
        toast(`Saved ${edit.name}`, 'ok');
        return onClose();
      }
      const r = await post<{ results: (SetupResult & { agent: McpTarget })[] }>('/api/setup/mcp', spec);
      onSaved();
      const bad = r.results.filter((x) => !x.ok);
      if (!bad.length) {
        toast(`Added ${spec.name}`, 'ok');
        onClose();
      } else {
        // Whichever agents took it are done; a retry goes only to the ones that failed.
        setTargets(bad.map((b) => b.agent));
        setFailed(bad);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const mono = cx(inputCls, 'font-mono text-[13px]');
  const headersLabel = codex ? (claude && custom ? 'Headers (Claude Code and Custom)' : claude ? 'Headers (Claude Code)' : 'Headers (Custom)') : 'Headers';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={edit ? 'Edit an MCP server' : 'Add an MCP server'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!ready || busy}>
            {busy ? <Throbber /> : edit ? 'Save' : 'Add server'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        {!edit && (
          <Field
            label="Add to"
            hint={
              <>
                {unset.map((p) => (
                  <div key={p}>{unavailable(p)}</div>
                ))}
                <div>Custom also uses the servers of Claude Code and Codex.</div>
              </>
            }
          >
            <div className="flex flex-wrap gap-2">
              {TARGETS.map((t) => (
                <TargetToggle key={t} target={t} on={chosen.includes(t)} disabled={!!unavailable(t)} title={unavailable(t)} onChange={(on) => setTargets((l) => (on ? [...l, t] : l.filter((x) => x !== t)))} />
              ))}
            </div>
          </Field>
        )}
        <Field label="Name" hint="Letters, digits, dots, dashes or underscores; the agents show tools as name/tool.">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="github" autoFocus={!edit} disabled={!!edit} autoComplete="off" />
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
            <Field
              label="Environment"
              hint={
                edit
                  ? 'One KEY=value per line. Leave a value empty to keep the one saved.'
                  : claude || codex
                    ? 'One KEY=value per line. Values go into the agents\' config files and are never shown here again.'
                    : 'One KEY=value per line. Hydor keeps the values on this computer and never shows them here again.'
              }
            >
              <textarea className={cx(mono, 'h-20 resize-y py-2')} value={env} onChange={(e) => setEnv(e.target.value)} placeholder="GITHUB_TOKEN=…" spellCheck={false} />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <input className={mono} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp.example.com/mcp" autoComplete="off" spellCheck={false} />
            </Field>
            {(claude || custom) && (
              <Field
                label={headersLabel}
                hint={edit ? 'One Name: value per line. Leave a value empty to keep the one saved.' : 'One Name: value per line, for servers that take an API key. Servers that use OAuth need none: sign in from the list after adding.'}
              >
                <textarea className={cx(mono, 'h-16 resize-y py-2')} value={headers} onChange={(e) => setHeaders(e.target.value)} placeholder="Authorization: Bearer …" spellCheck={false} />
              </Field>
            )}
            {codex && (
              <Field label={claude || custom ? 'Bearer token variable (Codex)' : 'Bearer token variable'} hint="Optional. Codex sends the value of this environment variable as the bearer token.">
                <input className={mono} value={bearer} onChange={(e) => setBearer(e.target.value)} placeholder="GITHUB_TOKEN" autoComplete="off" spellCheck={false} />
              </Field>
            )}
          </>
        )}
        {claude && (
          <Field
            label={codex || custom ? 'Where Claude Code uses it' : 'Where it is used'}
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
        {claude && scope !== 'user' && (codex || custom) && (
          <div className="text-[11.5px] text-fg-3">{codex && custom ? 'Servers of Codex and Custom always apply to every folder.' : codex ? 'Codex servers always apply to every folder.' : 'Custom servers always apply to every folder.'}</div>
        )}
        {failed.map((f) => (
          <div key={f.agent} className="rounded-lg border border-err/30 bg-err/5 px-3 py-2">
            <div className="text-[12.5px] font-medium text-err">{targetName(f.agent)} did not add it</div>
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

interface RowActions {
  onLogin: () => void;
  onRemove: () => void;
  onEdit: () => void;
  onSignOut: () => void;
}

function McpRow({ s, status, onLogin, onRemove, onEdit, onSignOut }: { s: McpEntry; status?: McpStatus } & RowActions) {
  const target = s.transport === 'stdio' ? [s.command, ...(s.args ?? [])].filter(Boolean).join(' ') : s.url;
  const keys = [...(s.envKeys ?? []), ...(s.headerKeys ?? []), ...(s.bearerEnv ? [`Bearer $${s.bearerEnv}`] : [])];
  const custom = s.agent === 'custom';
  // What the last check said; without one, what is known of Custom's sign-in.
  const again = custom && !!(status ? status.again : s.again);
  const badge = again ? ({ tone: 'warn', label: 'Sign in again' } as const) : status ? STATUS_BADGE[status.state] : custom && s.signedIn ? ({ tone: 'neutral', label: 'Signed in' } as const) : undefined;
  const failed = status?.state === 'failed';
  const signedIn = custom && !!(s.signedIn || status?.signedIn);
  // A program signs in through its own command; Custom signs in here (HTTP only).
  const signsIn = custom ? s.transport === 'http' : s.transport !== 'stdio';
  const wants = status?.state === 'auth' || again;
  return (
    <Row
      icon={<Plug size={16} />}
      label={
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span translate="no">{s.name}</span>
          {s.agent === 'claude' && <Badge>{MCP_SCOPE[s.scope]}</Badge>}
          {s.from && <Badge>{MCP_FROM[s.from]}</Badge>}
          {s.enabled === false && <Badge tone="warn">Off</Badge>}
        </span>
      }
      hint={
        <span translate="no" className="block truncate font-mono text-[12px]" title={target}>
          {target}
        </span>
      }
      control={
        <>
          {badge && (
            <Badge tone={badge.tone}>
              {badge.label}
              {status?.state === 'connected' && status.tools != null && ` · ${status.tools} tool${status.tools === 1 ? '' : 's'}`}
            </Badge>
          )}
          {signsIn && wants && (
            <Button size="sm" variant="secondary" icon={<LogIn size={14} />} onClick={onLogin}>
              {again ? 'Sign in again' : 'Sign in'}
            </Button>
          )}
          {(!custom || !s.from || s.transport === 'http') && (
            <MoreMenu label={`${s.name}: more`} width={240}>
              {(close) => (
                <>
                  {custom && !s.from && (
                    <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), onEdit())}>
                      Edit
                    </MenuItem>
                  )}
                  {signsIn && (
                    <MenuItem icon={<LogIn size={14} />} onClick={() => (close(), onLogin())}>
                      {custom ? (signedIn ? 'Sign in again' : 'Sign in (OAuth)') : 'Sign in (OAuth) in a terminal'}
                    </MenuItem>
                  )}
                  {signedIn && (
                    <MenuItem icon={<LogOut size={14} />} onClick={() => (close(), onSignOut())}>
                      Sign out
                    </MenuItem>
                  )}
                  {(!custom || !s.from) && (
                    <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), onRemove())}>
                      Remove
                    </MenuItem>
                  )}
                </>
              )}
            </MoreMenu>
          )}
        </>
      }
    >
      {(keys.length > 0 || failed) && (
        <div className="space-y-1.5">
          {keys.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keys.map((k) => (
                <span key={k} translate="no" title="Set; the value stays on the server" className="inline-flex items-center gap-1 rounded bg-bg-2 px-1.5 py-px font-mono text-[11px] text-fg-2">
                  <KeyRound size={10} className="text-fg-3" />
                  {k}
                </span>
              ))}
            </div>
          )}
          {failed && <div className="text-[12px] break-words text-err">{status.error || 'The server did not start or did not answer.'}</div>}
        </div>
      )}
    </Row>
  );
}

/**
 * Custom's group: its own servers and the signed-in ones it reads from elsewhere; after a check, everything it
 * loads (with the servers of Claude Code, Codex and a folder's .mcp.json).
 */
function customRows(list: McpEntry[], status: Record<string, McpStatus> | undefined): McpEntry[] {
  const listed = list.filter((s) => s.agent === 'custom');
  const names = new Set(listed.map((s) => s.name));
  const checked = Object.values(status ?? {})
    .filter((x) => x.from && !names.has(x.name))
    .map((x): McpEntry => ({ agent: 'custom', name: x.name, from: x.from, scope: 'user', transport: x.transport ?? 'stdio', url: x.url }));
  return [...listed, ...checked];
}

export function McpSettings({ cwd }: { cwd: string }) {
  const programs = useApp((s) => s.boot?.programs);
  const [list, setList] = useState<McpEntry[] | null>(null);
  const [dialog, setDialog] = useState<{ edit: McpEntry | null } | null>(null);
  const [signing, setSigning] = useState<SignInServer | null>(null);
  const [status, setStatus] = useState<Partial<Record<McpTarget, Record<string, McpStatus> | 'busy'>>>({});
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
  useFeatureEvent('mcpservers', () => void load());
  // Back from signing in (a phone signs in in this tab).
  useSignInReturn(() => void load(), '/settings', (name) => `Signed in to ${name}`);

  /** Starts each server the way a new session would and shows how it went. */
  const check = async (target: McpTarget) => {
    setStatus((st) => ({ ...st, [target]: 'busy' }));
    try {
      const r = await post<{ servers: McpStatus[] }>('/api/setup/mcp/status', { agent: target, cwd });
      setStatus((st) => ({ ...st, [target]: Object.fromEntries(r.servers.map((x) => [x.name, x])) }));
    } catch (e) {
      toastError(e);
      setStatus((st) => ({ ...st, [target]: undefined }));
    }
  };
  /** A server's sign-in changed: its last check no longer says how it stands. */
  const forget = (name: string) =>
    setStatus((st) => {
      const c = st.custom;
      if (!c || c === 'busy') return st;
      const { [name]: _, ...rest } = c;
      return { ...st, custom: rest };
    });
  const login = async (s: McpEntry) => {
    if (s.agent === 'custom') return setSigning({ name: s.name, url: s.url! });
    try {
      showTerminal(await post<TerminalInfo>('/api/setup/mcp/login', { agent: s.agent, name: s.name, cwd }));
    } catch (e) {
      toastError(e);
    }
  };
  /** After a sign-in or a sign-out: the list again, and the server checked again when the group was checked. */
  const signedChanged = async () => {
    await load();
    if (status.custom) await check('custom');
  };
  const signOut = async (s: McpEntry) => {
    try {
      await post('/api/setup/mcp/signout', { name: s.name, cwd });
      toast(`Signed out of ${s.name}`, 'ok');
      forget(s.name);
    } catch (e) {
      toastError(e);
    }
    await signedChanged();
  };
  const remove = async (s: McpEntry) => {
    const ok = await confirm({
      title: `Remove ${s.name}?`,
      body: <>{targetName(s.agent)} stops loading this server. Sessions already running keep it until they restart.</>,
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await post<SetupResult>('/api/setup/mcp/remove', { agent: s.agent, name: s.name, scope: s.scope, cwd });
      if (!r.ok) throw new Error(gist(r.output) || 'Could not remove the server');
      toast(`Removed ${s.name}`, 'ok');
      setStatus((st) => ({ ...st, [s.agent]: undefined }));
    } catch (e) {
      toastError(e);
    }
    load();
  };

  const none = !!list && !list.length;
  return (
    <Stack>
      <SectionActions>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setDialog({ edit: null })}>
          Add server
        </Button>
      </SectionActions>
      {none ? (
        <Group>
          <EmptyRow>No MCP servers yet: add one to give your agents more tools</EmptyRow>
        </Group>
      ) : (
        TARGETS.map((t) => {
          const st = status[t];
          const results = st && st !== 'busy' ? st : undefined;
          const rows = t === 'custom' ? customRows(list ?? [], results) : (list ?? []).filter((s) => s.agent === t);
          // A program that is not set up here and has no servers has no group.
          if (isProgram(t) && !programUsable(programs, t) && !rows.length) return null;
          // Custom checks the programs' servers too, which it also loads.
          const checkable = rows.length > 0 || (t === 'custom' && !!list?.length);
          return (
            <Group
              key={t}
              title={
                <span className="flex items-center gap-2">
                  <TargetIcon target={t} size={16} />
                  {targetName(t)}
                </span>
              }
              info={
                t === 'custom'
                  ? 'Kept by Hydor, for every folder. Custom also loads the servers of Claude Code, Codex and a .mcp.json file; a name kept here wins. New sessions load changes.'
                  : 'New sessions load these servers; sessions already running pick up changes when they restart.'
              }
              actions={
                checkable && (
                  <Button size="sm" variant="ghost" onClick={() => check(t)} disabled={st === 'busy'} title="Start every server the way a new session would and see which connect">
                    {st === 'busy' ? (
                      <>
                        <Throbber /> Connecting
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
                rows.map((s) => (
                  <McpRow key={`${s.scope}:${s.from ?? ''}:${s.name}`} s={s} status={results?.[s.name]} onLogin={() => login(s)} onRemove={() => remove(s)} onEdit={() => setDialog({ edit: s })} onSignOut={() => void signOut(s)} />
                ))
              ) : (
                <EmptyRow>No MCP servers yet</EmptyRow>
              )}
            </Group>
          );
        })
      )}
      <McpDialog open={!!dialog} edit={dialog?.edit ?? null} cwd={cwd} onClose={() => setDialog(null)} onSaved={() => (setStatus((st) => ({ ...st, custom: undefined })), void load())} />
      <McpSignInDialog server={signing} cwd={cwd} onClose={() => setSigning(null)} onDone={() => void signedChanged()} />
      {confirmNode}
    </Stack>
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

function PluginRow({ p, busy, control }: { p: PluginEntry; busy: boolean; control: ReactNode }) {
  return (
    <Row
      icon={<Puzzle size={16} />}
      label={
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span translate="no" className={cx('font-medium', p.installed && p.enabled === false && 'text-fg-3')}>
            {p.name}
          </span>
          {p.marketplace && <Badge>{p.marketplace}</Badge>}
          {p.version && <span className="text-[11.5px] text-fg-3">v{p.version}</span>}
          {!p.installed && p.installCount != null && (
            <span className="text-[11.5px] text-fg-3" title={`${p.installCount.toLocaleString()} installs`}>
              {compact(p.installCount)} installs
            </span>
          )}
        </span>
      }
      hint={
        p.description && (
          <span translate="no" className="line-clamp-1">
            {p.description}
          </span>
        )
      }
      control={busy ? <Throbber className="px-3 text-fg-3" /> : control}
    />
  );
}

/** Claude Code's own plugins (its marketplaces): Settings → Plugins, its Claude Code tab. */
export function ClaudePluginsSettings() {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<PluginsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [market, setMarket] = useState('');
  const [adding, setAdding] = useState(false);
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
      if (action === 'add') (setMarket(''), setAdding(false));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };
  const addMarket = async () => {
    if (market.trim() && !busy) await marketAct('add', market.trim());
  };

  const loadingRow = (
    <div className="flex justify-center px-4 py-6">
      <Throbber className="text-fg-3" />
    </div>
  );
  return (
    <Stack>
      <Group title="Installed" hint="Only Claude Code sessions use these">
        {!data ? (
          loadingRow
        ) : data.installed.length ? (
          data.installed.map((p) => (
            <PluginRow
              key={p.id}
              p={p}
              busy={busy === p.id}
              control={
                <>
                  <Switch on={p.enabled !== false} onChange={(on) => act(on ? 'enable' : 'disable', p)} label={p.enabled !== false ? `Turn ${p.name} off` : `Turn ${p.name} on`} />
                  <MoreMenu label={`${p.name}: more`} width={200}>
                    {(close) => (
                      <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (close(), act('uninstall', p))}>
                        Uninstall
                      </MenuItem>
                    )}
                  </MoreMenu>
                </>
              }
            />
          ))
        ) : (
          <EmptyRow>None yet: find one below</EmptyRow>
        )}
      </Group>

      <Group title="Browse" hint={data ? `${data.total.toLocaleString()} ${q ? 'matching' : 'available'}, most installed first` : 'Loading the marketplaces…'}>
        <label className="relative block">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            onKeyDown={(e) => e.key === 'Escape' && (setQ(''), setLimit(PAGE))}
            placeholder="Search plugins"
            aria-label="Search plugins"
            className="block h-10 w-full rounded-t-[11px] bg-transparent pr-4 pl-10 text-[13.5px] outline-none placeholder:text-fg-3 focus:bg-bg-1"
          />
        </label>
        {!data ? (
          loadingRow
        ) : data.available.length ? (
          <div className={cx('divide-y divide-line transition-opacity', loading && 'opacity-60')}>
            {data.available.map((p) => (
              <PluginRow
                key={p.id}
                p={p}
                busy={busy === p.id}
                control={
                  <Button size="sm" variant="secondary" onClick={() => act('install', p)} disabled={!!busy}>
                    Install
                  </Button>
                }
              />
            ))}
            {data.available.length < data.total && (
              <div className="flex justify-center px-4 py-2.5">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
                  {loading ? <Throbber /> : `Show more (${(data.total - data.available.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <EmptyRow>{q ? 'None match' : 'Nothing to install: add a marketplace below'}</EmptyRow>
        )}
      </Group>

      <Group
        title="Marketplaces"
        hint="Catalogs Claude Code installs plugins from"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add
          </Button>
        }
      >
        {!data ? (
          loadingRow
        ) : data.marketplaces.length ? (
          data.marketplaces.map((m) => (
            <Row
              key={m.name}
              icon={<Link2 size={16} />}
              label={<span translate="no">{m.name}</span>}
              hint={
                <span translate="no" className="block truncate font-mono text-[12px]">
                  {m.repo ?? m.url ?? m.source}
                </span>
              }
              control={
                busy === `market:${m.name}` ? (
                  <Throbber className="px-3 text-fg-3" />
                ) : (
                  <IconButton label="Remove" size="sm" onClick={() => marketAct('remove', m.name)} disabled={!!busy}>
                    <Trash2 size={14} />
                  </IconButton>
                )
              }
            />
          ))
        ) : (
          <EmptyRow>None yet</EmptyRow>
        )}
      </Group>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a marketplace"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!market.trim() || !!busy} onClick={() => void addMarket()}>
              Add
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addMarket();
          }}
        >
          <input autoFocus className={cx(inputCls, 'font-mono text-[13px]')} value={market} onChange={(e) => setMarket(e.target.value)} placeholder="owner/repo, a git URL or a folder" spellCheck={false} />
        </form>
      </Dialog>
      {confirmNode}
    </Stack>
  );
}

// ---- instructions ----------------------------------------------------------------------------

export function InstructionsSettings({ cwd, agent, onAgent }: { cwd: string; agent: Agent; onAgent: (a: Agent) => void }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented size="sm" value={agent} onChange={onAgent} options={AGENTS.map((a) => ({ value: a, label: agentName(a), icon: <AgentIcon agent={a} size={13} /> }))} />
        <span className="w-full text-[12.5px] leading-snug text-fg-3 sm:w-auto sm:min-w-0 sm:flex-1">
          {agent === 'claude'
            ? 'Claude Code reads all of these at the start of a session, outermost first; later files refine earlier ones.'
            : 'Codex reads its own file, then one file per folder from the repository root down to this one.'}
        </span>
      </div>
      <InstructionsEditor key={`${agent}:${cwd}`} agent={agent} cwd={cwd} className="h-[calc(100dvh-230px)] min-h-[440px]" />
    </div>
  );
}

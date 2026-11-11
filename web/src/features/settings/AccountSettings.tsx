// Settings → Accounts: the Claude Code and Codex sign-ins every session uses, switching accounts and API credit at a
// limit, and the agents’ programs on this machine.
import { useEffect, useState, type ReactNode } from 'react';
import { ExternalLink, KeyRound, LogIn, LogOut, Pencil, Plus, Trash2 } from 'lucide-react';
import type { AccountStatus, Agent, AgentAccount, ClientInfo, ClientUpdateItem, ClientUpdates, LoginFlow } from '@shared/types';
import { api, del, patch, post, put } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError, useAppSettings, useLogins } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { CopyButton } from '../../components/Markdown';
import { Badge, Button, cx, Dialog, MenuItem, MenuSep, Throbber, inputCls, Segmented, Switch, useConfirm } from '../../components/ui';
import { Group, MoreMenu, Row, Stack } from './kit';

export function LoginDialog({ agent, account, open, onClose, onDone }: { agent: Agent; account?: AgentAccount; open: boolean; onClose: () => void; onDone: () => void }) {
  // An added account signs in into its own folder.
  const q = account ? `?account=${encodeURIComponent(account.id)}` : '';
  const who = account ? `${agentName(agent)} (${account.name})` : agentName(agent);
  const [method, setMethod] = useState(agent === 'claude' ? 'claudeai' : 'device');
  const [flowId, setFlowId] = useState<string | null>(null);
  const flow = useLogins((s) => (flowId ? s.flows[flowId] : undefined));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setFlowId(null);
      setInput('');
    }
  }, [open]);

  useEffect(() => {
    if (flow?.state === 'done') {
      toast(`${who} is signed in`, 'ok');
      onDone();
      onClose();
    }
  }, [flow?.state, agent, onDone, onClose]);

  const start = async () => {
    setBusy(true);
    try {
      const f = await post<LoginFlow>(`/api/accounts/${agent}/login${q}`, { method });
      useLogins.getState().put(f);
      setFlowId(f.id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!flowId) return;
    setBusy(true);
    try {
      const f = await post<LoginFlow>(`/api/accounts/${agent}/login/${flowId}${q}`, agent === 'claude' ? { code: input } : { url: input });
      useLogins.getState().put(f);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (flowId && flow && flow.state !== 'done' && flow.state !== 'failed') await del(`/api/accounts/${agent}/login/${flowId}${q}`).catch(() => {});
    onClose();
  };

  return (
    <Dialog open={open} onClose={cancel} title={`Sign in to ${who}`} width={520}>
      {!flow ? (
        <div className="space-y-4">
          <Segmented
            value={method}
            onChange={setMethod}
            options={
              agent === 'claude'
                ? [
                    { value: 'claudeai', label: 'Claude subscription' },
                    { value: 'console', label: 'Console (API billing)' },
                  ]
                : [
                    { value: 'device', label: 'Device code' },
                    { value: 'browser', label: 'Browser redirect' },
                  ]
            }
          />
          <p className="text-[13px] text-fg-2">
            {agent === 'claude'
              ? 'You get a sign-in link. Approve access in your browser; the page then shows a code to paste back here.'
              : method === 'device'
                ? 'You get a link and a one-time code. Open the link on any device, sign in to ChatGPT, and enter the code. This page notices when you are done.'
                : 'You get a sign-in link. After you sign in, your browser tries to open a localhost page and fails: copy that address and paste it here.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={start} disabled={busy} icon={<LogIn size={14} />}>
              {busy ? 'Starting…' : 'Get sign-in link'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {flow.state === 'starting' && (
            <div className="flex items-center gap-2 text-[13px] text-fg-3">
              <Throbber /> Starting {agentName(agent)} sign-in…
            </div>
          )}
          {flow.url && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg-2">1. Open this link</div>
              <div className="flex items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 py-2">
                <a href={flow.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate font-mono text-[12px] text-accent hover:underline">
                  {flow.url}
                </a>
                <CopyButton text={flow.url} />
              </div>
              <a href={flow.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg hover:opacity-90">
                <ExternalLink size={13} /> Open sign-in page
              </a>
            </div>
          )}
          {flow.code && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg-2">2. Enter this code</div>
              <div className="flex items-center gap-3">
                <span className="rounded-xl border border-line-2 bg-bg-1 px-4 py-2 font-mono text-[22px] font-semibold tracking-[0.15em]">{flow.code}</span>
                <CopyButton text={flow.code} />
              </div>
              {flow.state === 'waiting' && (
                <div className="mt-3 flex items-center gap-2 text-[12.5px] text-fg-3">
                  <Throbber /> Waiting for you to finish in the browser…
                </div>
              )}
            </div>
          )}
          {flow.needsInput && (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-fg-2">2. {flow.needsInput === 'code' ? 'Paste the code from the page' : 'Paste the localhost address from your browser'}</div>
              <input
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && input.trim() && submit()}
                placeholder={flow.needsInput === 'code' ? 'code#state' : 'http://localhost:1455/auth/callback?code=…'}
                className="h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-3 font-mono text-[12.5px] outline-none focus:border-accent/70"
              />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" onClick={submit} disabled={!input.trim() || busy}>
                  {busy ? 'Checking…' : 'Finish sign-in'}
                </Button>
              </div>
            </div>
          )}
          {flow.state === 'verifying' && (
            <div className="flex items-center gap-2 text-[13px] text-fg-3">
              <Throbber /> Verifying…
            </div>
          )}
          {flow.state === 'failed' && (
            <div className="rounded-lg border border-err/30 bg-err/5 px-3 py-2 text-[12.5px] text-err">
              Sign-in failed{flow.error ? `: ${flow.error}` : ''}.
              <button className="ml-2 underline" onClick={() => setFlowId(null)}>
                Try again
              </button>
            </div>
          )}
          {flow.message && flow.state !== 'failed' && <p className="text-[12px] text-fg-3">{flow.message}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** Something a row’s ⋯ menu does besides signing out. */
type RowAction = { label: string; icon?: ReactNode; danger?: boolean; run: () => void };

/** One sign-in: the agent and the account’s name, how it is signed in (or what is wrong), and Sign in or Switch account. */
function AccountRow({
  agent,
  a,
  account,
  onChange,
  actions = [],
  apiKey,
}: {
  agent: Agent;
  a: AccountStatus | null;
  account?: AgentAccount;
  onChange: () => void;
  actions?: RowAction[];
  apiKey?: boolean;
}) {
  const q = account ? `?account=${encodeURIComponent(account.id)}` : '';
  const [login, setLogin] = useState(false);
  const [confirm, node] = useConfirm();
  const icon = <AgentIcon agent={agent} size={18} />;
  const label = (
    <>
      {agentName(agent)}
      {account && (
        <span className="text-fg-3" translate="no">
          {' '}
          · {account.name}
        </span>
      )}
      {apiKey && (
        <span className="ml-2 align-middle" title="An Anthropic API key is saved for this account: used only when every account is at its usage limit and Use API credit at a limit is on">
          <Badge>API credit</Badge>
        </span>
      )}
    </>
  );
  if (!a) return <Row icon={icon} label={label} control={<Throbber className="text-fg-3" />} />;
  const signOut = async () => {
    if (
      !(await confirm({
        title: `Sign out of ${agentName(agent)}${account ? ` (${account.name})` : ''}?`,
        body: account ? 'Sessions that run as this account stop working until it signs in again.' : 'This signs the CLI out on the server, for every terminal and editor that uses it.',
        confirm: 'Sign out',
        danger: true,
      }))
    )
      return;
    await post(`/api/accounts/${agent}/logout${q}`).catch(toastError);
    onChange();
  };
  // Rename and the API key first; the ones that take the sign-in away last.
  const rest = actions.filter((x) => !x.danger);
  const danger = actions.filter((x) => x.danger);
  const run = (close: () => void, fn: () => void) => () => {
    close();
    fn();
  };
  const hasMenu = rest.length > 0 || danger.length > 0 || a.loggedIn;
  return (
    <>
      <Row
        icon={icon}
        label={label}
        hint={
          a.loggedIn ? (
            <span title={[a.email, a.plan, a.method].filter(Boolean).join(' · ')}>
              <span translate="no">{a.email ?? 'Signed in'}</span>
              {a.plan ? ` · ${a.plan}` : ''}
              {a.method ? ` · ${a.method}` : ''}
            </span>
          ) : (
            <span className="text-err">{a.error ?? a.detail ?? 'Not signed in'}</span>
          )
        }
        control={
          <>
            <Button size="sm" variant={a.loggedIn ? 'secondary' : 'primary'} icon={<LogIn size={13} />} onClick={() => setLogin(true)}>
              {a.loggedIn ? 'Switch account' : 'Sign in'}
            </Button>
            {hasMenu && (
              <MoreMenu width={210}>
                {(close) => (
                  <>
                    {rest.map((it) => (
                      <MenuItem key={it.label} icon={it.icon} onClick={run(close, it.run)}>
                        {it.label}
                      </MenuItem>
                    ))}
                    {rest.length > 0 && (a.loggedIn || danger.length > 0) && <MenuSep />}
                    {a.loggedIn && (
                      <MenuItem icon={<LogOut size={14} />} danger onClick={run(close, signOut)}>
                        Sign out
                      </MenuItem>
                    )}
                    {danger.map((it) => (
                      <MenuItem key={it.label} icon={it.icon} danger onClick={run(close, it.run)}>
                        {it.label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </MoreMenu>
            )}
          </>
        }
      />
      <LoginDialog agent={agent} account={account} open={login} onClose={() => setLogin(false)} onDone={onChange} />
      {node}
    </>
  );
}

/** A session whose account runs out of usage moves to another account of its agent with usage left. Kept on the server. */
function AutoSwitchSetting() {
  const on = useAppSettings((s) => s.autoSwitch);
  useEffect(() => void useAppSettings.getState().load(), []);
  return (
    <Row
      label="Switch accounts at a limit"
      hint="The session moves to another account with usage left"
      info="When a session’s account runs out of usage, the session moves to another of that agent’s accounts with usage left and carries on. New sessions skip an account at its limit."
      control={
        on === null ? (
          <Throbber className="text-fg-3" />
        ) : (
          <Switch
            on={on}
            label="Switch accounts at a limit"
            onChange={(v) => {
              useAppSettings.getState().set({ autoSwitch: v });
              put('/api/app-settings', { autoSwitch: v }).catch((e) => (useAppSettings.getState().set({ autoSwitch: !v }), toastError(e)));
            }}
          />
        )
      }
    />
  );
}

/** When every Claude Code account is at its limit, sessions carry on billed to an Anthropic API key saved for an account. Kept on the server. */
function ApiCreditSetting() {
  const on = useAppSettings((s) => s.apiCredit);
  useEffect(() => void useAppSettings.getState().load(), []);
  return (
    <Row
      label="Use API credit at a limit"
      hint="Carry on billed to an API key when every account is out"
      info="When every Claude Code account is at its usage limit, sessions carry on billed to an account’s Anthropic API key instead of stopping. Off until you turn it on."
      control={
        on === null ? (
          <Throbber className="text-fg-3" />
        ) : (
          <Switch
            on={on}
            label="Use API credit at a limit"
            onChange={(v) => {
              useAppSettings.getState().set({ apiCredit: v });
              put('/api/app-settings', { apiCredit: v }).catch((e) => (useAppSettings.getState().set({ apiCredit: !v }), toastError(e)));
            }}
          />
        )
      }
    />
  );
}

/** Saves the Anthropic API key of a Claude Code account (its API credit): checked with Anthropic, kept encrypted. */
function ApiKeyDialog({ target, onClose, onDone }: { target: { id: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setKey('');
    setError('');
  }, [target?.id]);
  const save = async () => {
    if (!target || !key.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await put(`/api/accounts/claude/api-keys/${encodeURIComponent(target.id)}`, { key: key.trim() });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!target} onClose={onClose} title={target ? `API key for ${target.name}` : ''} width={460}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-fg-2">Anthropic API key</span>
          <input autoFocus type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" className={cx(inputCls, 'w-full font-mono text-[12.5px]')} />
        </label>
        <p className="text-[12px] leading-snug text-fg-3">
          From console.anthropic.com → API keys. Used only when every account is at its usage limit and Use API credit at a limit is on. Kept encrypted on this computer.
        </p>
        {error && <p className="text-[12.5px] text-err">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!key.trim() || busy}>
            {busy ? 'Checking…' : 'Save key'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type AccountsInfo = { claude: AccountStatus; codex: AccountStatus; extra: (AgentAccount & { status: AccountStatus })[]; apiKeys?: Record<string, boolean> };

export function AccountSettings() {
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [keyFor, setKeyFor] = useState<{ id: string; name: string } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = () => api<AccountsInfo>('/api/accounts').then(setAccounts).catch(toastError);
  useEffect(() => {
    load();
  }, []);
  const rename = async (a: AgentAccount) => {
    const name = window.prompt('A new name for the account', a.name)?.trim();
    if (!name || name === a.name) return;
    await patch(`/api/agent-accounts/${a.id}`, { name }).catch(toastError);
    load();
  };
  const remove = async (a: AgentAccount) => {
    let wipe = false;
    const ok = await confirm({
      title: `Remove ${a.name}?`,
      body: (
        <div className="space-y-2">
          <p>Its sessions leave the list. Their history stays in its folder unless you delete that too.</p>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" onChange={(e) => (wipe = e.target.checked)} className="accent-[var(--err)]" />
            Also delete its sign-in and the history of its sessions
          </label>
        </div>
      ),
      confirm: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await del(`/api/agent-accounts/${a.id}${wipe ? '?wipe=1' : ''}`).catch(toastError);
    load();
  };
  /** A Claude Code account’s API key actions (its API credit): `id` is "main" for the CLI’s own sign-in. */
  const keyActions = (id: string, name: string): RowAction[] => [
    { label: accounts?.apiKeys?.[id] ? 'Change API key…' : 'Add API key…', icon: <KeyRound size={14} />, run: () => setKeyFor({ id, name }) },
    ...(accounts?.apiKeys?.[id]
      ? [
          {
            label: 'Remove API key',
            icon: <Trash2 size={14} />,
            run: () =>
              void del(`/api/accounts/claude/api-keys/${encodeURIComponent(id)}`)
                .catch(toastError)
                .then(load),
          },
        ]
      : []),
  ];
  // Each agent’s own sign-in, then the accounts added for it.
  const rows = (agent: Agent, main: AccountStatus | undefined) => [
    <AccountRow
      key={agent}
      agent={agent}
      a={main ?? null}
      onChange={load}
      apiKey={agent === 'claude' && !!accounts?.apiKeys?.main}
      actions={agent === 'claude' ? keyActions('main', 'Claude Code') : []}
    />,
    ...(accounts?.extra ?? [])
      .filter((x) => x.agent === agent)
      .map((x) => (
        <AccountRow
          key={x.id}
          agent={x.agent}
          a={x.status}
          account={x}
          onChange={load}
          apiKey={x.agent === 'claude' && !!accounts?.apiKeys?.[x.id]}
          actions={[
            { label: 'Rename', icon: <Pencil size={14} />, run: () => rename(x) },
            ...(x.agent === 'claude' ? keyActions(x.id, x.name) : []),
            { label: 'Remove', icon: <Trash2 size={14} />, danger: true, run: () => remove(x) },
          ]}
        />
      )),
  ];
  const limits = !!accounts?.extra.length || !!accounts?.claude.loggedIn || !!accounts?.extra.some((x) => x.agent === 'claude');
  return (
    <Stack>
      <Group
        title="Accounts"
        info="The Claude Code and Codex sign-ins your sessions use. Add another subscription, a work and a personal one say, and pick one when you start a session."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add an account
          </Button>
        }
      >
        {rows('claude', accounts?.claude)}
        {rows('codex', accounts?.codex)}
      </Group>
      {limits && (
        <Group title="At a usage limit">
          {!!accounts?.extra.length && <AutoSwitchSetting />}
          {(accounts?.claude.loggedIn || accounts?.extra.some((x) => x.agent === 'claude')) && <ApiCreditSetting />}
        </Group>
      )}
      <AgentPrograms />
      <AddAgentAccount open={adding} onClose={() => setAdding(false)} onAdded={load} />
      <ApiKeyDialog target={keyFor} onClose={() => setKeyFor(null)} onDone={load} />
      {confirmNode}
    </Stack>
  );
}

const SOURCE: Record<ClientInfo['source'], string> = { yours: 'your own install', app: 'installed by the app', bundled: 'comes with the app', missing: 'Not here: installs by itself when first used' };

type ClientsState = { clients: ClientInfo[]; updates: ClientUpdates };

/** What an update did to one program, in a line (each part its own text, for the translations). */
function UpdateNote({ i }: { i: ClientUpdateItem }) {
  return (
    <>
      {i.yours ? <span>{`${i.name} (your own)`}</span> : i.name}{' '}
      <span>{i.ok ? `${i.from ? `${i.from} → ` : ''}${i.to}` : i.kept ? `${i.to} did not work here (${i.error}), so it stays on ${i.kept}` : `${i.to} could not be installed: ${i.error}`}</span>
    </>
  );
}

/** The agents’ programs on this machine: whose they are, which version, and keeping them up to date. */
function AgentPrograms() {
  const [st, setSt] = useState<ClientsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api<ClientsState>('/api/clients').then(setSt, toastError);
  }, []);
  // A check or an update is going on: follow it until it ends.
  const running = st?.updates.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => api<ClientsState>('/api/clients').then(setSt, () => {}), 2000);
    return () => clearInterval(t);
  }, [running]);
  const install = async (c: ClientInfo) => {
    setBusy(c.id);
    try {
      setSt(await post<ClientsState>(`/api/clients/${c.id}/install`));
      toast(`${c.name} is installed`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const start = (what: 'update' | 'check') => post<ClientsState>(`/api/clients/${what}`).then(setSt, toastError);
  const list = st?.clients ?? [];
  const updates = st?.updates;
  const out = list.filter((c) => c.latest).length;
  const last = updates?.last && !running && Date.now() - updates.last.at < 7 * 86_400_000 ? updates.last : undefined;
  return (
    <Group title="Agent programs" info="The command-line agents the sessions run. Missing ones install by themselves, with npm in the app’s own folder.">
      {!st && <Row label="Looking at this computer…" control={<Throbber className="text-fg-3" />} />}
      {list.map((c) => (
        <Row
          key={c.id}
          label={c.name}
          hint={
            <span title={c.path}>
              {c.version ? `${c.version} · ` : ''}
              {SOURCE[c.source]}
              {c.yours?.version && c.yours.version !== c.version && (
                <>
                  {' · '}
                  <span>{`yours in the terminal: ${c.yours.version}`}</span>
                </>
              )}
              {c.latest && (
                <>
                  {' · '}
                  <span className="text-accent">{`${c.latest} is out`}</span>
                </>
              )}
              {c.failed && (
                <>
                  {' · '}
                  <span className="text-warn">{`${c.failed} did not work here`}</span>
                </>
              )}
            </span>
          }
          control={
            c.source === 'missing' ? (
              <Button size="sm" variant="secondary" disabled={busy === c.id || c.installing} icon={busy === c.id || c.installing ? <Throbber /> : undefined} onClick={() => install(c)}>
                Install
              </Button>
            ) : undefined
          }
        />
      ))}
      {updates && (
        <Row
          label="Update automatically"
          hint="Once a day, and a version that fails is undone"
          info="Once a day: the app’s copies with npm, your own installs with their own updater (claude update, codex update…). A new version that does not work here is undone."
          control={<Switch on={updates.auto} label="Update automatically" onChange={(on) => put<ClientsState>('/api/clients/auto', { on }).then(setSt, toastError)} />}
        >
          <div className="space-y-1 text-[12.5px] leading-snug text-fg-3">
            {running ? (
              <div className="flex items-center gap-2 text-fg-2">
                <Throbber className="text-fg-3" /> {running === 'check' ? 'Looking for new versions…' : updates.current ? `Updating ${updates.current}…` : 'Updating…'}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {out > 0 && (
                  <Button size="sm" variant="primary" onClick={() => start('update')}>
                    Update now
                  </Button>
                )}
                <span className={cx(updates.error && 'text-warn')}>
                  {updates.error
                    ? `Could not look for new versions: ${updates.error}`
                    : out > 1
                      ? 'Newer versions are out'
                      : out === 1
                        ? 'A newer version is out'
                        : updates.checkedAt
                          ? `Up to date · checked ${ago(updates.checkedAt)}`
                          : 'Not checked yet'}
                </span>
                {out === 0 && (
                  <button onClick={() => start('check')} className="text-accent hover:underline">
                    Check now
                  </button>
                )}
              </div>
            )}
            {last?.items.map((i, n) => (
              <div key={n} className={cx(!i.ok && 'text-warn')}>
                {n === 0 && <span>{last.auto ? `The automatic update, ${ago(last.at)}:` : `The last update, ${ago(last.at)}:`}</span>} <UpdateNote i={i} />
              </div>
            ))}
          </div>
        </Row>
      )}
    </Group>
  );
}

function AddAgentAccount({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [agent, setAgent] = useState<Agent>('claude');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<AgentAccount | null>(null);
  useEffect(() => {
    if (open) (setName(''), setMade(null));
  }, [open]);
  const add = async () => {
    setBusy(true);
    try {
      const a = await post<AgentAccount>('/api/agent-accounts', { agent, name });
      onAdded();
      setMade(a);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Dialog
        open={open && !made}
        onClose={onClose}
        title="Add an account"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={add} disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add and sign in'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <Segmented<Agent>
            value={agent}
            onChange={setAgent}
            options={[
              { value: 'claude', label: 'Claude Code', icon: <AgentIcon agent="claude" size={14} /> },
              { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={14} /> },
            ]}
          />
          <label className="block">
            <span className="mb-1 block text-fg-2">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && add()} placeholder="Work, Personal…" className={inputCls} autoFocus />
          </label>
        </div>
      </Dialog>
      {made && <LoginDialog agent={made.agent} account={made} open onClose={() => (setMade(null), onClose())} onDone={onAdded} />}
    </>
  );
}

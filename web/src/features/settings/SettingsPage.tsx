// Settings, in one place: the app (theme, notifications, password) and the agents (their accounts,
// instruction files, MCP servers, skills and plugins). On wide screens a tab per group, with its
// sections in a menu beside the open one; on phones a list, each section on its own page.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { Bell, Blocks, Bot, Cable, CalendarClock, Cpu, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, ExternalLink, GitPullRequest, KeyRound, LogIn, LogOut, MoreHorizontal, Pencil, Plug, Plus, ScrollText, Server, SlidersHorizontal, Sparkles, Trash2, UserRound, XCircle, type LucideIcon } from 'lucide-react';
import { featureSections } from '../registry';
import { isLang, LANGS } from '@shared/i18n';
import type { AccountStatus, Agent, AgentAccount, ClientInfo, ClientUpdateItem, ClientUpdates, LoginFlow, RetentionSettings, StartupState, UpdateState } from '@shared/types';
import { api, del, patch, post, put } from '../../lib/api';
import { ago, MOD } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp, useAppSettings, useLogins, useUI } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { FolderChip } from '../../components/FolderPicker';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, IconButton, MenuItem, Popover, Throbber, inputCls, Section, Segmented, Switch, Tabs, useConfirm, useIsMobile } from '../../components/ui';
import { currentLang, setLang } from '../../i18n';
import { chime, disablePush, enablePush, notifyPrefs, pushState, setNotifyPrefs, type PushState } from '../../lib/notify';
import { PageHeader } from '../layout/PageHeader';
import { followUpPref, type FollowUp } from '../session/Composer';
import { InstructionsSettings, McpSettings, PluginsSettings, SkillsSettings } from './AgentSettings';
import { startTour } from '../tour/Tour';
import { TasksSettings } from './TasksSettings';
import { ModelsSettings } from './ModelsSettings';
import { ThemeSettings } from './Themes';
import { ScmSettings } from './ScmSettings';
import { ConnectSettings } from './ConnectSettings';
import { AcpSettings } from './AcpSettings';
import { machineId } from '../../lib/machine';
import { pointAt } from '../../lib/pointAt';
import { openReleaseNotes } from './Releases';
import { MachineSettings } from './MachineSettings';
import { GuidelinesSettings } from '../guidelines/parts';

/** A built-in section, or one of a capability's (registry.tsx) by its id. */
export type SettingsSection = string;

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  sub: string;
  /** Shown for one working folder at a time (project servers, skills and instruction files). */
  folder?: boolean;
}

const GROUPS: { label: string; items: SectionDef[] }[] = [
  {
    label: 'App',
    items: [
      { id: 'general', label: 'General', icon: SlidersHorizontal, sub: 'Theme, and what Enter does while an agent works' },
      { id: 'notifications', label: 'Notifications', icon: Bell, sub: 'When a session finishes, fails or needs your answer' },
      { id: 'security', label: 'Password', icon: KeyRound, sub: 'The password for this app, and signing out' },
      { id: 'scm', label: 'Source control', icon: GitPullRequest, sub: 'GitHub and Gitea accounts for opening pull requests' },
      { id: 'connect', label: 'Connect other agents', icon: Cable, sub: 'Let agents elsewhere start and steer sessions here, through this app’s MCP server' },
      { id: 'machines', label: 'Machines', icon: Server, sub: 'Other machines running Naget Agent, to use from here, and access to this one' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { id: 'accounts', label: 'Accounts', icon: UserRound, sub: 'The Claude Code and Codex sign-ins every session uses' },
      { id: 'agents', label: 'More agents', icon: Bot, sub: 'Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP' },
      { id: 'models', label: 'Models', icon: Cpu, sub: 'Models for Custom, the app’s own agent: OpenRouter, Ollama, and Hugging Face models run here with vLLM' },
      { id: 'guidelines', label: 'Agent Guidelines', icon: ScrollText, sub: 'What every agent follows: in every session, in a space, or in one session' },
      { id: 'mcp', label: 'MCP servers', icon: Plug, sub: 'Tools the agents can call', folder: true },
      { id: 'skills', label: 'Skills', icon: Sparkles, sub: 'Know-how the agents load when a task calls for it', folder: true },
      { id: 'plugins', label: 'Plugins', icon: Blocks, sub: 'Claude Code add-ons that bundle skills, commands, agents and MCP servers' },
      { id: 'tasks', label: 'Scheduled tasks', icon: CalendarClock, sub: 'Agent work that starts by itself: on a schedule, once, or when a webhook calls' },
    ],
  },
];

// Another machine's MCP server is reached at its own address, not through this one.
if (machineId) for (const g of GROUPS) g.items = g.items.filter((d) => d.id !== 'connect');

/** The built-in groups, then the capabilities' sections (search, browser, memory…), read when first needed. */
let all: { label: string; items: SectionDef[] }[] | null = null;
const groups = () => (all ??= [...GROUPS, { label: 'Capabilities', items: featureSections().map(({ id, label, icon, sub }): SectionDef => ({ id, label, icon, sub })) }].filter((g) => g.items.length));
const sections = () => groups().flatMap((g) => g.items);
export const isSettingsSection = (s: string | null): s is SettingsSection => sections().some((d) => d.id === s);
/** Every section with its tab, for the search box. */
export const settingsSections = () => groups().flatMap((g) => g.items.map((d) => ({ id: d.id, label: d.label, sub: d.sub, icon: d.icon, group: g.label })));

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

/** Something a row's ⋯ menu does besides signing out. */
type RowAction = { label: string; icon?: ReactNode; danger?: boolean; run: () => void };

function AccountRow({ a, account, onChange, actions = [] }: { a: AccountStatus | null; account?: AgentAccount; onChange: () => void; actions?: RowAction[] }) {
  const agent = a?.agent ?? account?.agent;
  const q = account ? `?account=${encodeURIComponent(account.id)}` : '';
  const [login, setLogin] = useState(false);
  const [menu, setMenu] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const [confirm, node] = useConfirm();
  if (!a || !agent) {
    return (
      <div className="flex items-center gap-3 py-3 text-fg-3">
        <Throbber />
      </div>
    );
  }
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
  const items: RowAction[] = [...(a.loggedIn ? [{ label: 'Sign out', icon: <LogOut size={14} />, run: signOut }] : []), ...actions];
  // The name and sign-in keep their width; on a phone the buttons go under them.
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-bg-2">
        <AgentIcon agent={agent} size={18} />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-[min(100%,14rem)] flex-1">
          <div className="text-[14px] font-medium">
            {agentName(agent)}
            {account && (
              <span className="font-normal text-fg-3" translate="no">
                {' '}
                · {account.name}
              </span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
            {a.loggedIn ? <CheckCircle2 size={12} className="shrink-0 text-ok" /> : <XCircle size={12} className="shrink-0 text-err" />}
            {a.loggedIn ? (
              <span className="truncate" title={[a.email, a.plan, a.method].filter(Boolean).join(' · ')}>
                {a.email ?? 'Signed in'}
                {a.plan ? ` · ${a.plan}` : ''}
                {a.method ? ` · ${a.method}` : ''}
              </span>
            ) : (
              <span className="min-w-0 break-words">{a.error ?? a.detail ?? 'Not signed in'}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={a.loggedIn ? 'secondary' : 'primary'} icon={<LogIn size={13} />} onClick={() => setLogin(true)}>
            {a.loggedIn ? 'Switch account' : 'Sign in'}
          </Button>
          {items.length > 0 && (
            <>
              <IconButton label="More" ref={more} onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal size={17} />
              </IconButton>
              <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={180}>
                {items.map((it) => (
                  <MenuItem
                    key={it.label}
                    icon={it.icon}
                    danger={it.danger}
                    onClick={() => {
                      setMenu(false);
                      it.run();
                    }}
                  >
                    {it.label}
                  </MenuItem>
                ))}
              </Popover>
            </>
          )}
        </div>
      </div>
      <LoginDialog agent={agent} account={account} open={login} onClose={() => setLogin(false)} onDone={onChange} />
      {node}
    </div>
  );
}

function PasswordForm() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const field = inputCls;
  return (
    <form
      className="grid gap-2 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (next !== again) return toast('The new passwords differ', 'error');
        setBusy(true);
        try {
          await post('/api/auth/password', { current: cur, next });
          toast('Password changed. Other browsers were signed out.', 'ok');
          setCur('');
          setNext('');
          setAgain('');
        } catch (err) {
          toastError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className={field} type="password" placeholder="Current password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <input className={field} type="password" placeholder="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      <input className={field} type="password" placeholder="Repeat new password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
      <div className="sm:col-span-3">
        <Button size="sm" variant="secondary" icon={<KeyRound size={14} />} disabled={busy || !cur || next.length < 10}>
          Change password
        </Button>
      </div>
    </form>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function GeneralSettings() {
  const boot = useApp((s) => s.boot);
  const termSuggest = useUI((s) => s.termSuggest);
  const [follow, setFollow] = useState<FollowUp>(followUpPref);
  return (
    <div className="space-y-4">
      <ThemeSettings />
      <Section>
        <div className="-my-2 divide-y divide-line">
          <SettingRow label="Language" hint="The language the app is shown in. Agents write to you in it too.">
            {/* Each language by its own name, never translated. */}
            <select translate="no" className={cx(inputCls, 'h-8.5 max-w-[220px] pr-8 text-[13px]')} value={currentLang()} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)} aria-label="Language">
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Sending while an agent works"
            hint={
              follow === 'steer'
                ? `Enter adds your message to the turn in progress. ${MOD}Enter waits for the turn to end instead.`
                : `Enter waits for the turn to end, then sends. ${MOD}Enter adds it to the turn in progress instead.`
            }
          >
            <Segmented<FollowUp>
              size="sm"
              value={follow}
              onChange={(x) => {
                setFollow(x);
                try {
                  localStorage.setItem('wa.followUp', x);
                } catch {}
              }}
              options={[
                { value: 'steer', label: 'Join the turn' },
                { value: 'queue', label: 'Wait for it' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Terminal suggestions" hint="Grey text after the cursor with the likeliest rest of the command; → takes it. Ctrl+Space lists more either way.">
            <Switch on={termSuggest} label="Terminal suggestions" onChange={(v) => useUI.getState().set({ termSuggest: v })} />
          </SettingRow>
          <AutoResumeSetting />
          <DeleteInactiveSetting />
        </div>
      </Section>
      <Section>
        <div className="-my-2 divide-y divide-line">
          <StartupSetting />
          <AutoUpdateSetting />
          <SettingRow label="Welcome tour" hint="Connect your subscriptions and see what each part of the app does">
            <Button size="sm" variant="secondary" icon={<CircleHelp size={14} />} onClick={() => startTour()}>
              Take the tour
            </Button>
          </SettingRow>
        </div>
      </Section>
      <Section title="About">
        <div className="space-y-1.5 text-[13px] leading-relaxed text-fg-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-fg-2">Naget Agent {boot?.version}</span>
            <button onClick={() => openReleaseNotes(boot?.version)} className="text-accent hover:underline">
              Release notes
            </button>
          </div>
          <UpdateLine />
          <div>
            Sessions run as your user through the installed Claude Code and Codex. History comes from <span className="font-mono text-[12px]">~/.claude/projects</span> and{' '}
            <span className="font-mono text-[12px]">~/.codex/sessions</span>. Terminals live in a private tmux server and survive reloads.
          </div>
        </div>
      </Section>
    </div>
  );
}

const PHASE: Record<NonNullable<UpdateState['running']>['phase'], string> = {
  pull: 'Getting the new version',
  install: 'Installing packages',
  build: 'Building',
  restart: 'Restarting, this page reconnects by itself',
};

/** Whether a newer version is out (for copies installed from git), updating to it, and how the last update went. */
function UpdateLine() {
  const update = useApp((s) => s.boot?.update);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const r = await post<{ update: UpdateState | null }>('/api/update-check');
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, update: r.update ?? undefined } });
      if (!r.update) toast('This copy was not installed from git with an upstream, so it cannot check', 'info');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const updateNow = async () => {
    // This tab reloads into the new version once the server is back with it.
    try {
      sessionStorage.setItem('wa.updating', '1');
    } catch {}
    try {
      await post('/api/update');
    } catch (e) {
      try {
        sessionStorage.removeItem('wa.updating');
      } catch {}
      toastError(e);
    }
  };
  const checkButton = (
    <button onClick={check} disabled={busy} className="text-accent hover:underline disabled:opacity-50">
      {busy ? 'Checking…' : 'Check now'}
    </button>
  );
  if (!update)
    return (
      <div className="flex items-center gap-2">
        <span>Updates are checked daily for copies installed from git.</span>
        {checkButton}
      </div>
    );
  const last = update.last && !update.running && Date.now() - update.last.at < 7 * 86_400_000 ? update.last : undefined;
  return (
    <div className="space-y-1.5">
      {update.running ? (
        <div className="anim-in flex items-center gap-2 text-fg-2">
          <Throbber className="text-fg-3" /> {PHASE[update.running.phase]}…
        </div>
      ) : update.behind > 0 ? (
        <div className="space-y-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2.5 text-fg-2">
          <div>
            <span className="font-medium text-fg">
              {update.behind} update{update.behind === 1 ? '' : 's'} out
            </span>
            {update.latest && <span> · latest: {update.latest}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Button size="sm" variant="primary" onClick={updateNow}>
              Update now
            </Button>
            <span className="text-[12px] text-fg-3">{update.canRestart ? 'It pulls, builds and restarts; running agents carry on.' : 'It pulls and builds; restart the server afterwards to use it.'}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={cx(update.error && 'text-warn')}>{update.error ? `Could not check for updates: ${update.error}` : `Up to date · checked ${ago(update.checkedAt)}`}</span>
          {checkButton}
        </div>
      )}
      {last && (
        <div className={cx('text-[12px]', last.ok ? 'text-fg-3' : 'text-warn')}>
          {!last.ok
            ? `The ${last.auto ? 'automatic ' : ''}update ${ago(last.at)} failed: ${last.error}`
            : last.from && last.from === last.to
              ? `Already up to date when it last tried, ${ago(last.at)}`
              : `Updated${last.auto ? ' by itself' : ''} ${ago(last.at)}${last.from && last.to ? ` (${last.from} → ${last.to})` : ''}${last.needsRestart ? ': restart the server to use it' : ''}`}
        </div>
      )}
    </div>
  );
}

/** New versions install themselves while you are away, for a copy that can restart itself. */
function AutoUpdateSetting() {
  const update = useApp((s) => s.boot?.update);
  if (!update) return null;
  return (
    <SettingRow
      label="Update automatically"
      hint={
        update.canRestart
          ? 'After 5 hours without a message from you, at most once a day. Running agents carry on.'
          : 'This server cannot restart itself. Run it as a service (install.sh) or with Docker to update automatically.'
      }
    >
      <Switch on={update.auto && update.canRestart} disabled={!update.canRestart} label="Update automatically" onChange={(on) => put('/api/update/auto', { on }).catch(toastError)} />
    </SettingRow>
  );
}

/** The app comes back after this computer restarts (on by default): a service of your user, a system
 * service, or Docker's restart policy; whichever runs it says what can change. */
function StartupSetting() {
  const [st, setSt] = useState<StartupState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<StartupState>('/api/startup')
      .then(setSt)
      .catch(() => setSt(null));
  }, []);
  if (!st) return null;
  const hint =
    st.how === 'docker'
      ? 'In Docker its restart policy brings it back: restart: unless-stopped in compose.yaml.'
      : st.how === 'system-service'
        ? `The system service ${st.unit} ${st.on ? 'starts it at boot' : 'is off: it does not start at boot'}. Changing it needs root on this computer.`
        : st.how === 'user-service'
          ? st.on
            ? st.linger
              ? `As ${st.unit}, a service of your user, even before anyone logs in. It also comes back if it stops.`
              : `As ${st.unit}, a service of your user, once you log in. To start it before anyone logs in: sudo loginctl enable-linger ${'$'}USER`
            : `${st.unit} is set up but does not start at boot.`
          : st.can
            ? 'Sets it up as a service of your user that starts at boot and comes back if it stops.'
            : 'Not available here (no systemd for your user): start it with your system’s own tools, or run it in Docker.';
  return (
    <SettingRow label="Start when this computer starts" hint={hint}>
      {busy ? (
        <Throbber className="text-fg-3" />
      ) : (
        <Switch
          on={st.on}
          disabled={!st.can}
          label="Start when this computer starts"
          onChange={async (on) => {
            setBusy(true);
            try {
              setSt(await put<StartupState>('/api/startup', { on }));
            } catch (e) {
              toastError(e);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </SettingRow>
  );
}

/** Sessions stopped by a plan's usage limit continue by themselves once it lifts. Kept on the server. */
function AutoResumeSetting() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ autoResume: boolean }>('/api/app-settings')
      .then((r) => setOn(r.autoResume))
      .catch(() => setOn(false));
  }, []);
  return (
    <SettingRow label="Resume after usage limits" hint="When a turn stops because a plan's usage ran out, the session continues by itself a minute after the limit resets">
      {on === null ? (
        <Throbber className="text-fg-3" />
      ) : (
        <Switch
          on={on}
          label="Resume after usage limits"
          onChange={(v) => {
            setOn(v);
            put('/api/app-settings', { autoResume: v }).catch((e) => (setOn(!v), toastError(e)));
          }}
        />
      )}
    </SettingRow>
  );
}

/** A session whose account runs out of usage moves to another account of its agent with usage left. Kept on the server. */
function AutoSwitchSetting() {
  const on = useAppSettings((s) => s.autoSwitch);
  useEffect(() => void useAppSettings.getState().load(), []);
  return (
    <SettingRow label="Switch accounts at a limit" hint="When a session's account runs out of usage, the session moves to another of that agent's accounts with usage left and carries on. New sessions skip an account at its limit.">
      {on === null ? (
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
      )}
    </SettingRow>
  );
}

/** How long a session may stay inactive before the app deletes it. */
const AGES: [number, string][] = [
  [90, '3 months'],
  [182, '6 months'],
  [365, '1 year'],
  [730, '2 years'],
  [1825, '5 years'],
];

/**
 * Sessions nobody used for a while are deleted, a year by default; their numbers stay in Activity. Until
 * then the app keeps every conversation, whatever the agent's own program deletes. Kept on the server.
 */
function DeleteInactiveSetting() {
  const [r, setR] = useState<RetentionSettings | null>(null);
  useEffect(() => {
    api<RetentionSettings>('/api/retention').then(setR, () => {});
  }, []);
  const save = (p: Partial<RetentionSettings>) => {
    const was = r;
    setR({ ...r!, ...p });
    put<RetentionSettings>('/api/retention', p).then(setR, (e) => (setR(was), toastError(e)));
  };
  const ages = r && !AGES.some(([d]) => d === r.days) ? [...AGES, [r.days, `${r.days} days`] as [number, string]] : AGES;
  return (
    <SettingRow
      label="Delete inactive sessions"
      hint="Sessions nobody used for this long are deleted; pinned ones, and ones at work or waiting, stay. Their numbers stay in Activity. Until then every conversation is kept, whatever the agent’s own program deletes."
    >
      {!r ? (
        <Throbber className="text-fg-3" />
      ) : (
        <div className="flex items-center gap-2.5">
          <select aria-label="After how long" disabled={!r.on} value={r.days} onChange={(e) => save({ days: Number(e.target.value) })} className={cx(inputCls, '!h-8 w-auto pr-8 text-[13px] disabled:opacity-50')}>
            {ages.map(([d, label]) => (
              <option key={d} value={d}>
                After {label}
              </option>
            ))}
          </select>
          <Switch on={r.on} label="Delete inactive sessions" onChange={(v) => save({ on: v })} />
        </div>
      )}
    </SettingRow>
  );
}

/** Notices when a session finishes, fails or needs you: pushed to this device, with or without a chime. */
function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null);
  const [sound, setSound] = useState(() => notifyPrefs().sound);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState()
      .then(setState)
      .catch(() => setState('unsupported'));
  }, []);
  const appleNotInstalled = /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as Navigator & { standalone?: boolean }).standalone;
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      setState(on ? await enablePush() : await disablePush());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const hint =
    state === 'unsupported'
      ? appleNotInstalled
        ? 'On iPhone or iPad: Share → Add to Home Screen, open Naget Agent from there, then turn this on.'
        : 'This browser cannot receive notifications here.'
      : state === 'denied'
        ? 'Blocked for this site in the browser settings; allow notifications there first.'
        : 'Arrives even when the app is closed, like on a phone in your pocket. Each device turns it on for itself.';
  return (
    <Section>
      <div className="-my-2 divide-y divide-line">
        <SettingRow label="Notify this device" hint={hint}>
          {state === null || busy ? <Throbber className="text-fg-3" /> : <Switch on={state === 'on'} disabled={state === 'unsupported' || state === 'denied'} onChange={toggle} label="Notify this device" />}
        </SettingRow>
        <SettingRow label="Sound" hint="A short chime with each notice while the app is open">
          <Switch
            on={sound}
            onChange={(v) => {
              setSound(v);
              setNotifyPrefs({ sound: v });
              if (v) chime('done');
            }}
            label="Sound"
          />
        </SettingRow>
        {state === 'on' && (
          <SettingRow label="Try it" hint="Shows on this device when the app is not in view">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const r = await post<{ sent: number }>('/api/push/test').catch((e) => (toastError(e), null));
                if (r) toast(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}. It shows when the app is not in view.` : 'No device got it.', r.sent ? 'ok' : 'error');
              }}
            >
              Send a test
            </Button>
          </SettingRow>
        )}
      </div>
    </Section>
  );
}

function SecuritySettings() {
  return (
    <div className="space-y-4">
      <Section title="Change password" sub="Changing it signs out every other browser">
        <PasswordForm />
      </Section>
      <Section>
        <div className="-my-2">
          <SettingRow label="Sign out of this browser" hint="You will need the password to come back">
            <Button
              size="sm"
              variant="secondary"
              icon={<LogOut size={14} />}
              onClick={async () => {
                await post('/api/auth/logout').catch(() => {});
                location.reload();
              }}
            >
              Sign out
            </Button>
          </SettingRow>
        </div>
      </Section>
    </div>
  );
}

type AccountsInfo = { claude: AccountStatus; codex: AccountStatus; extra: (AgentAccount & { status: AccountStatus })[] };

function AccountSettings() {
  const [accounts, setAccounts] = useState<AccountsInfo | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<AccountsInfo>('/api/accounts')
      .then(setAccounts)
      .catch(toastError);
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
  // Each agent's own sign-in, then the accounts added for it.
  const rows = (agent: Agent, main: AccountStatus | undefined) => [
    <AccountRow key={agent} a={main ?? null} onChange={load} />,
    ...(accounts?.extra ?? [])
      .filter((x) => x.agent === agent)
      .map((x) => (
        <AccountRow
          key={x.id}
          a={x.status}
          account={x}
          onChange={load}
          actions={[
            { label: 'Rename', icon: <Pencil size={14} />, run: () => rename(x) },
            { label: 'Remove', icon: <Trash2 size={14} />, danger: true, run: () => remove(x) },
          ]}
        />
      )),
  ];
  return (
    <div className="space-y-4">
      <Section
        title="Your accounts"
        sub="The Claude Code and Codex sign-ins your sessions use. Add another subscription, a work and a personal one say, and pick one when you start a session."
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add an account
          </Button>
        }
      >
        <div className="-my-2 divide-y divide-line">
          {rows('claude', accounts?.claude)}
          {rows('codex', accounts?.codex)}
          {!!accounts?.extra.length && <AutoSwitchSetting />}
        </div>
      </Section>
      <AgentPrograms />
      <AddAgentAccount open={adding} onClose={() => setAdding(false)} onAdded={load} />
      {confirmNode}
    </div>
  );
}

const SOURCE: Record<ClientInfo['source'], string> = {
  yours: 'your own install',
  app: 'installed by the app',
  bundled: 'comes with the app',
  missing: 'not here: installs by itself when you first use it',
};

type ClientsState = { clients: ClientInfo[]; updates: ClientUpdates };

/** What an update did to one program, in a line (each part its own text, for the translations). */
function UpdateNote({ i }: { i: ClientUpdateItem }) {
  return (
    <>
      {i.yours ? <span>{`${i.name} (your own)`}</span> : i.name} <span>{i.ok ? `${i.from ? `${i.from} → ` : ''}${i.to}` : i.kept ? `${i.to} did not work here (${i.error}), so it stays on ${i.kept}` : `${i.to} could not be installed: ${i.error}`}</span>
    </>
  );
}

/** The agents' programs on this machine: whose they are, which version, and keeping them up to date. */
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
  if (!st) return null;
  const { clients: list, updates } = st;
  const out = list.filter((c) => c.latest).length;
  const last = updates.last && !running && Date.now() - updates.last.at < 7 * 86_400_000 ? updates.last : undefined;
  return (
    <Section title="Agent programs" sub="The command-line agents the sessions run. Missing ones install by themselves (with npm, in the app’s own folder).">
      <div className="-my-2 divide-y divide-line">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className="w-28 shrink-0 font-medium">{c.name}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3" title={c.path}>
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
            {c.source === 'missing' && (
              <Button size="sm" variant="secondary" disabled={busy === c.id || c.installing} icon={busy === c.id || c.installing ? <Throbber /> : undefined} onClick={() => install(c)}>
                Install
              </Button>
            )}
          </div>
        ))}
        <SettingRow label="Update automatically" hint="Once a day: the app’s copies with npm, your own installs with their own updater (claude update, codex update…). A new version that does not work here is undone.">
          <Switch on={updates.auto} label="Update automatically" onChange={(on) => put<ClientsState>('/api/clients/auto', { on }).then(setSt, toastError)} />
        </SettingRow>
        <div className="space-y-1 py-3 text-[12.5px] leading-snug text-fg-3">
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
      </div>
    </Section>
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

function SectionBody({ id, cwd, agent, onAgent, onCwd }: { id: SettingsSection; cwd: string; agent: Agent; onAgent: (a: Agent) => void; onCwd: (c: string) => void }) {
  switch (id) {
    case 'general':
      return <GeneralSettings />;
    case 'notifications':
      return <NotificationSettings />;
    case 'security':
      return <SecuritySettings />;
    case 'scm':
      return <ScmSettings />;
    case 'connect':
      return <ConnectSettings />;
    case 'machines':
      return <MachineSettings />;
    case 'accounts':
      return <AccountSettings />;
    case 'agents':
      return <AcpSettings />;
    case 'models':
      return <ModelsSettings />;
    case 'guidelines':
      // CLAUDE.md and AGENTS.md, for those who keep them, folded away under the guidelines every agent follows.
      return (
        <GuidelinesSettings
          files={
            <div className="space-y-3">
              <FolderScope cwd={cwd} onChange={onCwd} />
              <InstructionsSettings cwd={cwd} agent={agent} onAgent={onAgent} />
            </div>
          }
        />
      );
    case 'mcp':
      return <McpSettings cwd={cwd} />;
    case 'skills':
      return <SkillsSettings cwd={cwd} />;
    case 'plugins':
      return <PluginsSettings />;
    case 'tasks':
      return <TasksSettings />;
    default: {
      const f = featureSections().find((d) => d.id === id);
      return f ? <f.Body /> : null;
    }
  }
}

/** Which folder's servers, skills and instruction files are shown. */
function FolderScope({ cwd, onChange }: { cwd: string; onChange: (c: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-3">
      <span>Folder</span>
      <FolderChip value={cwd} onChange={onChange} />
    </div>
  );
}

/** Phones: every section as a row; each opens on its own page. */
function SectionList({ onOpen }: { onOpen: (id: SettingsSection) => void }) {
  return (
    <div className="space-y-5 px-4 pt-4 pb-8">
      {groups().map((g) => (
        <div key={g.label}>
          <div className="px-1 pb-1.5 text-[12px] font-medium text-fg-3">{g.label}</div>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {g.items.map((d) => (
              <button key={d.id} onClick={() => onOpen(d.id)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-bg-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">
                  <d.icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-fg">{d.label}</span>
                  <span className="block truncate text-[12.5px] text-fg-3">{d.sub}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-fg-3" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The group a section is in: on wide screens, its tab. */
const groupOf = (id: SettingsSection | null) => groups().find((g) => g.items.some((d) => d.id === id)) ?? groups()[0];

/** The section last open under each tab, so going back to a tab opens it again. */
const lastOpen: Record<string, SettingsSection> = {};

/** Wide screens: the open tab's sections, beside the open one. Short enough to need no scrolling of its
 * own, it stays in place while the section scrolls. */
function SectionMenu({ items, current, onOpen }: { items: SectionDef[]; current: SettingsSection | null; onOpen: (id: SettingsSection) => void }) {
  return (
    // Only a window too short for all of a tab's sections scrolls them on their own.
    <nav className="sticky top-0 max-h-[calc(100dvh-94px)] w-[200px] shrink-0 overflow-y-auto py-6" aria-label="Settings sections">
      {items.map((d) => {
        const on = d.id === current;
        return (
          <button
            key={d.id}
            onClick={() => onOpen(d.id)}
            aria-current={on ? 'page' : undefined}
            className={cx(
              'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors',
              on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg',
            )}
          >
            <d.icon size={16} className={cx('shrink-0', on ? 'text-fg' : 'text-fg-3')} />
            <span className="truncate">{d.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsPage({ section, cwd: cwdParam, agent: agentParam }: { section: SettingsSection | null; cwd: string | null; agent: Agent | null }) {
  const mobile = useIsMobile();
  const boot = useApp((s) => s.boot);
  const root = useUI((s) => s.explorerRoot);
  const cwd = cwdParam || root || boot?.defaultCwd || boot?.home || '/';
  const agent = agentParam ?? 'claude';
  // Wide screens always show a section; phones start at the list.
  const current = section ?? (mobile ? null : 'general');
  const def = sections().find((d) => d.id === current);
  // Phones: a section slides in over the list (which drifts left and dims under it) and back out. Only
  // taps here slide; the browser's back and forward switch at once, since Safari on an iPhone has already
  // animated its swipe. `slideTo` is where a tap is sliding until the slide ends; meanwhile a section
  // sliding away stays on its page.
  const [slideTo, setSlideTo] = useState<SettingsSection | null>();
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);
  const sliding = slideTo !== undefined && slideTo === current;
  const page = def ?? (sliding ? sections().find((d) => d.id === last) : undefined);
  const url = (p: { s?: SettingsSection | null; cwd?: string | null; agent?: Agent | null }) => {
    const q = new URLSearchParams();
    const s = p.s === undefined ? section : p.s;
    const c = p.cwd === undefined ? cwdParam : p.cwd;
    const a = p.agent === undefined ? agentParam : p.agent;
    if (s) q.set('s', s);
    if (c) q.set('cwd', c);
    if (a) q.set('agent', a);
    const qs = q.toString();
    return `/settings${qs ? `?${qs}` : ''}`;
  };
  // On a phone, opening a section is a step the back button undoes; elsewhere it replaces.
  const open = (id: SettingsSection) => {
    if (mobile) setSlideTo(id);
    go(url({ s: id }), !mobile);
  };
  const body = page && (
    <div data-settings-body>
      <SectionBody id={page.id} cwd={cwd} agent={agent} onAgent={(a) => go(url({ agent: a }), true)} onCwd={(c) => go(url({ cwd: c }), true)} />
    </div>
  );
  const folder = page?.folder ? <FolderScope cwd={cwd} onChange={(c) => go(url({ cwd: c }), true)} /> : null;
  // Wide screens: the tab is the open section's group, and each section opens at its top.
  const tab = groupOf(current);
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (current) lastOpen[groupOf(current).label] = current;
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [current]);
  // From the search box (`find=`): the option that says those words, scrolled to and lit up.
  const findWords = new URLSearchParams(useSearch()).get('find');
  useEffect(() => {
    if (!findWords || !current) return;
    let live = true;
    void pointAt(() => document.querySelector('[data-settings-body]'), findWords).then(() => live && go(url({}), true));
    return () => {
      live = false;
    };
  }, [findWords, current]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mobile) {
    const motion = sliding && 'transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]';
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader
          title={
            def ? (
              <button key={def.id} onClick={() => (setSlideTo(null), go(url({ s: null })))} className={cx('-ml-1 flex max-w-full items-center gap-0.5 rounded-md text-left', sliding && 'anim-fade')} aria-label="All settings">
                <ChevronLeft size={18} className="shrink-0 text-fg-3" />
                <span className="truncate">{def.label}</span>
              </button>
            ) : (
              <span className={cx(sliding && 'anim-fade')}>Settings</span>
            )
          }
        />
        {/* The list stays built under an open section, so it keeps its place; each section opens at its top. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div inert={!!def} className={cx('absolute inset-0 overflow-y-auto', motion, def ? '-translate-x-1/4' : 'translate-x-0')}>
            <SectionList onOpen={open} />
          </div>
          <div className={cx('pointer-events-none absolute inset-0 bg-black/20', motion, def ? 'opacity-100' : 'opacity-0')} />
          <div
            onTransitionEnd={(e) => e.target === e.currentTarget && setSlideTo(undefined)}
            className={cx('absolute inset-0 bg-bg', motion, def ? 'translate-x-0' : 'translate-x-full', page && 'shadow-lg')}
          >
            {page && (
              <div key={page.id} className="h-full overflow-y-auto">
                <div className="space-y-4 px-4 pt-4 pb-8">
                  <p className="text-[13px] leading-snug text-fg-3">{page.sub}</p>
                  {folder}
                  {body}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // A tab per group (App, Agents, Capabilities), its sections in a menu beside the open one, and one
  // scroll for the page. The tabs line up with the menu: under the title, and on a screen wider than
  // 1280px together with it in the middle.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Settings">
        <div className="mx-auto max-w-[1248px]">
          <Tabs value={tab.label} onChange={(t) => open(lastOpen[t] ?? groups().find((g) => g.label === t)!.items[0].id)} options={groups().map((g) => ({ value: g.label, label: g.label }))} />
        </div>
      </PageHeader>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1280px] items-start gap-9 px-4">
          <SectionMenu items={tab.items} current={current} onOpen={open} />
          {def && (
            <div key={def.id} className="max-w-[920px] min-w-0 flex-1 pt-6 pb-10">
              <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[19px] font-semibold tracking-tight">{def.label}</h2>
                  <p className="mt-0.5 text-[13px] text-fg-3">{def.sub}</p>
                </div>
                {folder}
              </header>
              {body}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

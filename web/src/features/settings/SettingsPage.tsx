// Settings, in one place: the app (theme, notifications, password) and the agents (their accounts,
// instruction files, MCP servers, skills and plugins). On wide screens a tab per group, with its
// sections in a menu beside the open one; on phones a list, each section on its own page.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Bell, Blocks, Bot, Cable, CalendarClock, ChevronRight, Cpu, GitPullRequest, KeyRound, MessagesSquare, Plug, ScrollText, Server, Signature, SlidersHorizontal, Sparkles, type LucideIcon, UserRound } from 'lucide-react';
import { featureSections } from '../registry';
import { SECTION_TOPIC } from '@shared/find-catalog';
import { HeaderSlot } from './kit';
import type { Agent } from '@shared/types';
import { go } from '../../lib/nav';
import { useApp, useUI } from '../../lib/store';
import { FolderChip } from '../../components/FolderPicker';
import { cx, Tabs, useIsMobile } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { InstructionsSettings, McpSettings } from './AgentSettings';
import { SkillsSettings } from '../skillpack/SkillsPage';
import { PluginsSettings } from '../plugins/PluginsSettings';
import type { TipId } from '@shared/tips';
import { TasksSettings } from './TasksSettings';
import { ModelsSettings } from './ModelsSettings';
import { ScmSettings } from './ScmSettings';
import { ChatAppsSettings } from './ChatAppsSettings';
import { ConnectSettings } from './ConnectSettings';
import { AcpSettings } from './AcpSettings';
import { machineId } from '../../lib/machine';
import { pointAt } from '../../lib/pointAt';
import { MachineSettings } from './MachineSettings';
import { GuidelinesSettings } from '../guidelines/parts';
import { SignatureSettings } from '../signatures/SignatureSettings';
import { GeneralSettings } from './GeneralSettings';
import { NotificationSettings } from './NotificationSettings';
import { SecuritySettings } from './SecuritySettings';
import { AccountSettings } from './AccountSettings';

/** A built-in section, or one of a capability's (registry.tsx) by its id. */
export type SettingsSection = string;

interface SectionDef {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  sub: string;
  /** Shown for one working folder at a time (project servers and instruction files). */
  folder?: boolean;
}

const GROUPS: { label: string; items: SectionDef[] }[] = [
  {
    label: 'App',
    items: [
      { id: 'general', label: 'General', icon: SlidersHorizontal, sub: 'Theme, and what Enter does while an agent works' },
      { id: 'notifications', label: 'Notifications', icon: Bell, sub: 'When a session finishes, fails or needs your answer' },
      { id: 'chat', label: 'Chat apps', icon: MessagesSquare, sub: 'Talk to your agents from Telegram, Discord or Slack: start sessions, get their replies, answer what they ask' },
      { id: 'security', label: 'Password', icon: KeyRound, sub: 'The password for this app, and signing out' },
      { id: 'signatures', label: 'Signatures', icon: Signature, sub: 'Your signature and initials, drawn once and kept encrypted, for the documents you sign' },
      { id: 'scm', label: 'Source control', icon: GitPullRequest, sub: 'GitHub and Gitea accounts for opening pull requests' },
      { id: 'connect', label: 'Connect other agents', icon: Cable, sub: 'Let agents elsewhere start and steer sessions here, through this app’s MCP server' },
      { id: 'machines', label: 'Machines', icon: Server, sub: 'Other machines running Hydor, to use from here, and access to this one' },
    ],
  },
  {
    label: 'Agents',
    items: [
      { id: 'accounts', label: 'Accounts', icon: UserRound, sub: 'The Claude Code and Codex sign-ins every session uses' },
      { id: 'agents', label: 'More agents', icon: Bot, sub: 'Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP' },
      { id: 'models', label: 'Models', icon: Cpu, sub: 'Models for Custom, the app’s own agent: OpenRouter, Ollama, and Hugging Face models run here with vLLM' },
      { id: 'guidelines', label: 'Agent Guidelines', icon: ScrollText, sub: 'What every agent follows: in every session, in a project, or in one session' },
      { id: 'mcp', label: 'MCP servers', icon: Plug, sub: 'Tools the agents can call', folder: true },
      { id: 'skills', label: 'Skills', icon: Sparkles, sub: 'Written methods agents load when a task calls for one: built in, yours, from plugins and the agents’ own' },
      { id: 'plugins', label: 'Plugins', icon: Blocks, sub: 'Add-ons that bring skills, tools and instructions to every agent' },
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

/** Settings sections with a tip that says what they are for, the first time they open (features/tips). */
const SECTION_TIPS: Partial<Record<string, TipId>> = { tasks: 'tasks', memory: 'memory', guidelines: 'guidelines', assistants: 'assistants', connections: 'connections', skills: 'skills' };

function SectionBody({ id, cwd, agent, onAgent, onCwd }: { id: SettingsSection; cwd: string; agent: Agent; onAgent: (a: Agent) => void; onCwd: (c: string) => void }) {
  switch (id) {
    case 'general':
      return <GeneralSettings />;
    case 'notifications':
      return <NotificationSettings />;
    case 'chat':
      return <ChatAppsSettings />;
    case 'security':
      return <SecuritySettings />;
    case 'signatures':
      return <SignatureSettings />;
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
      return <SkillsSettings />;
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

/** Which folder's servers and instruction files are shown. */
function FolderScope({ cwd, onChange }: { cwd: string; onChange: (c: string) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-3">
      <span>Folder</span>
      <FolderChip value={cwd} onChange={onChange} />
    </div>
  );
}

/** Where the guide explains a section, after the line under its title. */
function LearnMore({ id }: { id: SettingsSection }) {
  const topic = SECTION_TOPIC[id];
  if (!topic) return null;
  const href = `/guide/${topic}`;
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(href);
      }}
      className="whitespace-nowrap text-fg-2 underline decoration-fg-3/40 underline-offset-2 transition-colors hover:text-fg hover:decoration-fg/60"
    >
      Learn more
    </a>
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
    // Wide enough for the longest section's name ("Images, video and audio") in full.
    <nav className="sticky top-0 max-h-[calc(100dvh-94px)] w-[216px] shrink-0 overflow-y-auto py-6" aria-label="Settings sections">
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
  // Phones: a section opens over the list at once, and Back (or the browser's) shows the list again.
  const page = def;
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
  const open = (id: SettingsSection) => go(url({ s: id }), !mobile);
  // The section's own switch or button beside its title (kit.tsx, SectionActions), as soon as the title is there.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const body = page && (
    <HeaderSlot.Provider value={slot}>
      <div data-settings-body>
        <SectionBody id={page.id} cwd={cwd} agent={agent} onAgent={(a) => go(url({ agent: a }), true)} onCwd={(c) => go(url({ cwd: c }), true)} />
      </div>
    </HeaderSlot.Provider>
  );
  const folder = page?.folder ? <FolderScope cwd={cwd} onChange={(c) => go(url({ cwd: c }), true)} /> : null;
  // Wide screens: the tab is the open section's group, and each section opens at its top.
  const tab = groupOf(current);
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (current) lastOpen[groupOf(current).label] = current;
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [current]);
  // From the search box (`find=`): the option that says those words (in the section, or its switch beside the title), scrolled to and lit up.
  const findWords = new URLSearchParams(useSearch()).get('find');
  useEffect(() => {
    if (!findWords || !current) return;
    let live = true;
    void pointAt(() => document.querySelector('[data-settings-section]'), findWords).then(() => live && go(url({}), true));
    return () => {
      live = false;
    };
  }, [findWords, current]); // eslint-disable-line react-hooks/exhaustive-deps

  if (mobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title={def ? def.label : 'Settings'} back={def ? { label: 'All settings', onClick: () => go(url({ s: null })) } : undefined} />
        {/* The list stays built under an open section, so it keeps its place; each section opens at its top. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div inert={!!def} className="absolute inset-0 overflow-y-auto">
            <SectionList onOpen={open} />
          </div>
          {page && (
            <div key={page.id} className="absolute inset-0 overflow-y-auto bg-bg">
              <div data-settings-section className="space-y-5 px-4 pt-4 pb-10">
                <div className="flex items-start gap-3">
                  <p data-tip={SECTION_TIPS[page.id]} className="min-w-0 flex-1 text-[13.5px] leading-snug text-fg-3">
                    {page.sub} <LearnMore id={page.id} />
                  </p>
                  <div ref={setSlot} className="flex shrink-0 items-center gap-2 empty:hidden" />
                </div>
                {folder}
                {body}
              </div>
            </div>
          )}
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
            <div key={def.id} data-settings-section className="max-w-[760px] min-w-0 flex-1 pt-7 pb-14">
              <header className="mb-7 flex flex-wrap items-start gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[22px] leading-tight font-semibold tracking-tight">
                    <span data-tip={SECTION_TIPS[def.id]}>{def.label}</span>
                  </h2>
                  <p className="mt-1 text-[13.5px] leading-snug text-fg-3">
                    {def.sub} <LearnMore id={def.id} />
                  </p>
                </div>
                {folder}
                <div ref={setSlot} className="flex shrink-0 items-center gap-2 pt-0.5 empty:hidden" />
              </header>
              {body}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

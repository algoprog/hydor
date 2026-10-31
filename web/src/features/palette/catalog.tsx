// What the search box knows by itself, before the server answers: what ships with the app (its pages and actions,
// every Settings section and the options in them, the themes: shared/find-catalog.ts), your own themes, and
// (fetched when it opens) apps, scheduled tasks, assistants, skills, pages and connections. Each entry says where
// it is and goes there: a setting opens its section and points at it by its words (`find=`, lib/pointAt.ts).
import type { ReactNode } from 'react';
import { Activity, AppWindow, ArrowRight, Bot, Cable, CalendarClock, CircleHelp, FileSearch, FolderTree, Gauge, GitBranch, LayoutGrid, Library, MonitorSmartphone, Moon, Palette, PanelLeft, Settings, SquarePen, SquareTerminal, TrendingUp } from 'lucide-react';
import type { Findable } from '@shared/find';
import { catalogItems, type CatalogItem } from '@shared/find-catalog';
import type { ScheduledTask } from '@shared/automations';
import type { ConnectionView } from '@shared/connections';
import type { PageInfo } from '@shared/pages';
import type { SkillLibrary } from '@shared/skillpack';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { useUI } from '../../lib/store';
import { allThemes, applyTheme, pickTheme } from '../../lib/theme';
import { appPath, type Gallery } from '../apps/api';
import { settingsSections } from '../settings/SettingsPage';
import { startTour } from '../tour/Tour';

export type Group = 'Settings' | 'Go to' | 'Actions' | 'Sessions' | 'In messages' | 'Memory' | 'Apps' | 'Scheduled tasks' | 'Assistants' | 'Skills' | 'Connections' | 'Pages' | 'Themes' | 'Files';

export interface Entry extends Findable {
  id: string;
  group: Group;
  icon: ReactNode;
  /** Where it is, as names ("Settings › Capabilities › Memory"). */
  where?: string;
  /** Shown beside it in the list (a shortcut, a time). */
  hint?: string;
  /** For the preview: more about it, and a few facts. */
  body?: string;
  facts?: [string, string][];
  /** What opening it does, in a few words ("Opens Settings → Memory, at this option"). */
  opens?: string;
  run: () => void;
}

const settingsAt = (s: string, find?: string) => `/settings?s=${encodeURIComponent(s)}${find ? `&find=${encodeURIComponent(find)}` : ''}`;

const PAGE_ICONS: Record<string, ReactNode> = {
  'go:new': <SquarePen size={15} />,
  'go:files': <FolderTree size={15} />,
  'go:search-files': <FileSearch size={15} />,
  'go:git': <GitBranch size={15} />,
  'go:terminal': <SquareTerminal size={15} />,
  'go:apps': <LayoutGrid size={15} />,
  'go:new-app': <LayoutGrid size={15} />,
  'go:pages': <AppWindow size={15} />,
  'go:published': <AppWindow size={15} />,
  'go:preview': <MonitorSmartphone size={15} />,
  'go:usage': <Gauge size={15} />,
  'go:stats': <TrendingUp size={15} />,
  'go:system': <Activity size={15} />,
  'go:settings': <Settings size={15} />,
};

const ACTS: Record<NonNullable<CatalogItem['act']>, { icon: ReactNode; run: () => void; hint?: string }> = {
  tour: { icon: <CircleHelp size={15} />, run: () => startTour() },
  theme: {
    icon: <Moon size={15} />,
    run: () => {
      useUI.getState().set({ theme: useUI.getState().theme === 'light' ? 'dark' : 'light' });
      applyTheme();
    },
  },
  sidebar: { icon: <PanelLeft size={15} />, run: () => useUI.getState().set({ sideOpen: !useUI.getState().sideOpen }), hint: 'Ctrl+B' },
  panel: { icon: <SquareTerminal size={15} />, run: () => useUI.getState().set({ panelOpen: !useUI.getState().panelOpen }), hint: 'Ctrl+`' },
};

/** What ships with the app (shared/find-catalog.ts), with icons and where each goes; and your own themes. */
export function staticEntries(): Entry[] {
  const secs = new Map(settingsSections().map((s) => [s.id, s]));
  const themes = allThemes();
  const out: Entry[] = [];
  for (const it of catalogItems()) {
    const base = { id: it.id, group: it.group as Group, title: it.title, keywords: it.keywords, text: it.text, where: it.where, body: it.text };
    if (it.path) out.push({ ...base, icon: PAGE_ICONS[it.id] ?? <ArrowRight size={15} />, opens: `Opens ${it.title}`, run: () => go(it.path!) });
    else if (it.act) {
      const a = ACTS[it.act];
      out.push({ ...base, icon: a.icon, hint: a.hint, body: a.hint ? undefined : it.text, run: a.run });
    } else if (it.section) {
      // A section this machine does not show (another machine's pages) is left out.
      const s = secs.get(it.section);
      if (!s) continue;
      const Icon = s.icon;
      out.push({ ...base, icon: <Icon size={15} />, opens: it.find ? `Opens Settings → ${s.label}, at this option` : `Opens Settings → ${s.label}`, run: () => go(settingsAt(it.section!, it.find)) });
    } else if (it.theme) {
      const t = themes.find((x) => x.name === it.theme);
      if (t) out.push({ ...base, icon: <Palette size={15} />, opens: 'Switches to it', run: () => pickTheme(t) });
    }
  }
  const shipped = new Set(catalogItems().map((it) => it.theme));
  for (const t of themes)
    if (!shipped.has(t.name))
      out.push({ id: `theme:${t.id}`, group: 'Themes', icon: <Palette size={15} />, title: t.name, keywords: `theme appearance ${t.base}`, text: `A ${t.base} theme of your own`, where: 'Settings › App › General', opens: 'Switches to it', run: () => pickTheme(t) });
  return out;
}

/** What the app holds that changes: fetched when the search box opens, kept a minute. */
let held: { at: number; entries: Entry[] } | null = null;

export async function liveEntries(): Promise<Entry[]> {
  if (held && Date.now() - held.at < 60_000) return held.entries;
  const get = <T,>(path: string) => api<T>(path).catch(() => null);
  const [apps, tasks, assistants, lib, pages, conns] = await Promise.all([
    get<Gallery>('/api/apps'),
    get<{ tasks: ScheduledTask[] }>('/api/tasks'),
    get<{ assistants?: { id: string; name: string; description?: string }[] }>('/api/assistants'),
    get<SkillLibrary>('/api/skillpack'),
    get<{ pages: PageInfo[] }>('/api/pages'),
    get<{ connections: ConnectionView[] }>('/api/connections'),
  ]);
  const out: Entry[] = [];
  for (const a of apps?.apps ?? [])
    out.push({ id: `app:${a.id}`, group: 'Apps', icon: <LayoutGrid size={15} />, title: a.name, text: a.description, where: 'Apps', body: a.description, opens: 'Opens the app', run: () => go(appPath(a.id)) });
  for (const t of apps?.templates ?? [])
    out.push({ id: `app:tpl:${t.id}`, group: 'Apps', icon: <LayoutGrid size={15} />, title: t.name, keywords: 'template', text: t.description, where: 'Apps › Templates', body: t.description, opens: 'Opens the template', run: () => go(appPath(`tpl:${t.id}`)) });
  for (const t of tasks?.tasks ?? [])
    out.push({
      id: `task:${t.id}`,
      group: 'Scheduled tasks',
      icon: <CalendarClock size={15} />,
      title: t.name,
      keywords: 'scheduled task automation',
      text: t.prompt.slice(0, 200),
      where: 'Settings › Agents › Scheduled tasks',
      body: t.prompt.slice(0, 400),
      opens: 'Opens Settings → Scheduled tasks, at this task',
      run: () => go(settingsAt('tasks', t.name)),
    });
  for (const a of Array.isArray(assistants) ? assistants : (assistants?.assistants ?? []))
    out.push({ id: `asst:${a.id}`, group: 'Assistants', icon: <Bot size={15} />, title: a.name, keywords: 'assistant', text: a.description, where: 'Settings › Capabilities › Assistants', body: a.description, opens: 'Opens Settings → Assistants, at this one', run: () => go(settingsAt('assistants', a.name)) });
  for (const s of lib?.skills ?? [])
    out.push({ id: `skill:${s.name}`, group: 'Skills', icon: <Library size={15} />, title: s.name, keywords: `skill ${s.triggers.join(' ')}`, text: s.description, where: 'Settings › Capabilities › Skill library', body: s.description, opens: 'Opens the skill library, at this skill', run: () => go(settingsAt('skillpack', s.name)) });
  for (const p of pages?.pages ?? [])
    out.push({ id: `page:${p.id}`, group: 'Pages', icon: <AppWindow size={15} />, title: p.title, keywords: 'page published', where: 'Pages', body: `Version ${p.version}`, opens: 'Opens the page', run: () => go(`/pages/${encodeURIComponent(p.id)}`) });
  for (const c of conns?.connections ?? [])
    out.push({
      id: `conn:${c.id}`,
      group: 'Connections',
      icon: <Cable size={15} />,
      title: c.name,
      keywords: `connection ${c.app?.name ?? ''}`,
      text: c.app?.description,
      where: 'Settings › Capabilities › Connections',
      body: c.app?.description,
      opens: 'Opens Settings → Connections, at this one',
      run: () => go(settingsAt('connections', c.name)),
    });
  held = { at: Date.now(), entries: out };
  return out;
}

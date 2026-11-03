// What the search box knows by itself, before the server answers: what ships with the app (its pages and actions,
// every Settings section and the options in them, the themes: shared/find-catalog.ts), your own themes, and
// (fetched when it opens) spaces, apps, scheduled tasks, assistants, skills, pages and connections. Each entry
// says where it is and goes there: a setting opens its section and points at it by its words (`find=`,
// lib/pointAt.ts).
import type { ReactNode } from 'react';
import { Activity, AppWindow, ArrowRight, Blocks, MonitorCog, BookOpen, Bot, Cable, CalendarClock, CircleHelp, FileSearch, Folders, FolderTree, Gauge, GitBranch, Globe, Headphones, ImageIcon, Images, LayoutGrid, Library, LibraryBig, MonitorSmartphone, Moon, Palette, PanelLeft, Play, ScrollText, Settings, Sparkles, SquarePen, SquareTerminal, TrendingUp } from 'lucide-react';
import type { Findable } from '@shared/find';
import { catalogItems, type CatalogItem } from '@shared/find-catalog';
import { AGENT_TOPICS, plainText } from '@shared/guide';
import type { ScheduledTask } from '@shared/automations';
import type { ConnectionView } from '@shared/connections';
import type { MediaItem } from '@shared/media';
import type { PageInfo } from '@shared/pages';
import type { SkillLibrary } from '@shared/skillpack';
import type { PluginList } from '@shared/plugins';
import { isGroup, type SpaceView } from '@shared/spaces';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go, goApp } from '../../lib/nav';
import { useUI } from '../../lib/store';
import { allThemes, applyTheme, pickTheme } from '../../lib/theme';
import { appPath, type Gallery } from '../apps/api';
import { openReleaseNotes } from '../settings/Releases';
import { settingsSections } from '../settings/SettingsPage';
import { SpaceMark } from '../spaces/parts';
import { startTour } from '../tour/Tour';
import { openAsk } from '../guide/ask';
import { loadGuide } from '../guide/state';
import { startHandsFree } from '../voice/HandsFree';

export type Group = 'Settings' | 'Go to' | 'Actions' | 'Guide' | 'Sessions' | 'In messages' | 'Memory' | 'Projects' | 'Apps' | 'Scheduled tasks' | 'Assistants' | 'Skills' | 'Plugins' | 'Connections' | 'Pages' | 'Images and videos' | 'Themes' | 'Files';

export interface Entry extends Findable {
  id: string;
  group: Group;
  icon: ReactNode;
  /** The icon at the preview's size, when it does not grow by itself (a space's mark). */
  mark?: ReactNode;
  /** Where it is, as names ("Settings › Capabilities › Memory"). */
  where?: string;
  /** Shown beside it in the list (a shortcut, a time). */
  hint?: string;
  /** For the preview: more about it, and a few facts. */
  body?: string;
  facts?: [string, string][];
  /** What opening it does, in a few words ("Opens Settings → Memory, at this option"). */
  opens?: string;
  /** The place it is in (a setting's section, sec:memory): visiting that counts for it too, half as much. */
  within?: string;
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
  'go:library': <LibraryBig size={15} />,
  'go:media': <Images size={15} />,
  'go:videos': <Play size={15} />,
  'go:published': <Globe size={15} />,
  'go:preview': <MonitorSmartphone size={15} />,
  'go:usage': <Gauge size={15} />,
  'go:stats': <TrendingUp size={15} />,
  'go:system': <MonitorCog size={15} />,
  'go:monitor': <Activity size={15} />,
  'go:settings': <Settings size={15} />,
  'go:guide': <CircleHelp size={15} />,
};

const ACTS: Record<NonNullable<CatalogItem['act']>, { icon: ReactNode; run: () => void; hint?: string }> = {
  tour: { icon: <CircleHelp size={15} />, run: () => startTour() },
  ask: { icon: <Sparkles size={15} />, run: () => (go('/guide'), openAsk()) },
  releases: { icon: <ScrollText size={15} />, run: () => openReleaseNotes() },
  handsfree: { icon: <Headphones size={15} />, run: () => startHandsFree() },
  theme: {
    icon: <Moon size={15} />,
    run: () => {
      useUI.getState().set({ theme: useUI.getState().theme === 'light' ? 'dark' : 'light' });
      applyTheme();
    },
  },
  sidebar: { icon: <PanelLeft size={15} />, run: () => useUI.getState().set({ sideOpen: !useUI.getState().sideOpen }), hint: 'Ctrl+B' },
  groups: { icon: <Folders size={15} />, run: () => useUI.getState().set({ groupByFolder: !useUI.getState().groupByFolder }) },
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
      out.push({
        ...base,
        icon: <Icon size={15} />,
        opens: it.find ? `Opens Settings → ${s.label}, at this option` : `Opens Settings → ${s.label}`,
        within: it.find ? `sec:${it.section}` : undefined,
        run: () => go(settingsAt(it.section!, it.find)),
      });
    } else if (it.theme) {
      const t = themes.find((x) => x.name === it.theme);
      if (t) out.push({ ...base, icon: <Palette size={15} />, opens: 'Switches to it', within: 'sec:general', run: () => pickTheme(t) });
    }
  }
  const shipped = new Set(catalogItems().map((it) => it.theme));
  for (const t of themes)
    if (!shipped.has(t.name))
      out.push({ id: `theme:${t.id}`, group: 'Themes', icon: <Palette size={15} />, title: t.name, keywords: `theme appearance ${t.base}`, text: `A ${t.base} theme of your own`, where: 'Settings › App › General', opens: 'Switches to it', within: 'sec:general', run: () => pickTheme(t) });
  return out;
}

/** What the app holds that changes: fetched when the search box opens, kept a minute. */
let held: { at: number; entries: Entry[] } | null = null;

export async function liveEntries(): Promise<Entry[]> {
  if (held && Date.now() - held.at < 60_000) return held.entries;
  const get = <T,>(path: string) => api<T>(path).catch(() => null);
  const [apps, tasks, assistants, lib, pages, conns, spaces, media, plugins] = await Promise.all([
    get<Gallery>('/api/apps'),
    get<{ tasks: ScheduledTask[] }>('/api/tasks'),
    get<{ assistants?: { id: string; name: string; description?: string }[] }>('/api/assistants'),
    get<SkillLibrary>('/api/skillpack'),
    get<{ pages: PageInfo[] }>('/api/pages'),
    get<{ connections: ConnectionView[] }>('/api/connections'),
    get<{ spaces: SpaceView[] }>('/api/spaces'),
    get<{ items: MediaItem[] }>('/api/media'),
    get<PluginList>('/api/plugins'),
  ]);
  const out: Entry[] = [];
  for (const s of spaces?.spaces ?? [])
    out.push({
      id: `space:${s.id}`,
      group: 'Projects',
      icon: <SpaceMark s={s} />,
      mark: <SpaceMark s={s} size={22} />,
      title: s.name,
      keywords: isGroup(s) ? 'project group space' : 'project space',
      text: s.description,
      where: 'Projects',
      body: s.description,
      facts: [
        ['Folder', s.folder],
        ['Sessions', String(s.sessions)],
        ['Last active', s.lastAt ? timeAgo(s.lastAt) : ''],
      ],
      opens: 'Opens the project',
      run: () => go(`/spaces/${encodeURIComponent(s.id)}`),
    });
  for (const a of apps?.apps ?? [])
    out.push({ id: `app:${a.id}`, group: 'Apps', icon: <LayoutGrid size={15} />, title: a.name, keywords: 'template', text: a.description, where: 'Apps', body: a.description, opens: 'Opens the app', run: () => go(appPath(a.id)) });
  for (const t of apps?.templates ?? [])
    out.push({ id: `app:tpl:${t.id}`, group: 'Apps', icon: <LayoutGrid size={15} />, title: t.name, keywords: 'template', text: t.description, where: 'Apps › Ready-made', body: t.description, opens: 'Opens the app', run: () => go(appPath(`tpl:${t.id}`)) });
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
      within: 'sec:tasks',
      run: () => go(settingsAt('tasks', t.name)),
    });
  for (const a of Array.isArray(assistants) ? assistants : (assistants?.assistants ?? []))
    out.push({ id: `asst:${a.id}`, group: 'Assistants', icon: <Bot size={15} />, title: a.name, keywords: 'assistant', text: a.description, where: 'Settings › Capabilities › Assistants', body: a.description, opens: 'Opens Settings → Assistants, at this one', within: 'sec:assistants', run: () => go(settingsAt('assistants', a.name)) });
  for (const s of lib?.skills ?? [])
    out.push({ id: `skill:${s.name}`, group: 'Skills', icon: <Library size={15} />, title: s.name, keywords: `skill ${s.triggers.join(' ')}`, text: s.description, where: 'Settings › Agents › Skills', body: s.description, opens: 'Opens Settings → Skills, at this skill', within: 'sec:skills', run: () => go(settingsAt('skills', s.name)) });
  for (const p of [...(plugins?.installed ?? []), ...(plugins?.available ?? [])])
    out.push({
      id: `plugin:${p.name}`,
      group: 'Plugins',
      icon: <Blocks size={15} />,
      title: p.title,
      keywords: `plugin ${p.name} ${p.keywords.join(' ')} ${p.skills.map((s) => s.name).join(' ')}`,
      text: p.description,
      where: 'Settings › Agents › Plugins',
      body: p.description,
      opens: p.installed ? 'Opens the plugin' : 'Opens the plugin, to add it',
      within: 'sec:plugins',
      run: () => go(`/settings?s=plugins&plugin=${encodeURIComponent(p.name)}`),
    });
  for (const p of pages?.pages ?? [])
    out.push({ id: `page:${p.id}`, group: 'Pages', icon: <AppWindow size={15} />, title: p.title, keywords: 'page published', where: 'Library', body: `Version ${p.version}`, opens: 'Opens the page', run: () => go(`/pages/${encodeURIComponent(p.id)}`) });
  for (const m of media?.items ?? [])
    out.push({
      id: `media:${m.id}`,
      group: 'Images and videos',
      icon: m.kind === 'video' ? <Play size={15} /> : <ImageIcon size={15} />,
      title: m.title,
      keywords: `${m.kind === 'video' ? 'video clip' : 'image picture'} library`,
      text: [m.description, m.prompt].filter(Boolean).join(' '),
      where: 'Library › Media',
      body: m.description,
      opens: m.kind === 'video' ? 'Opens the video' : 'Opens the image',
      run: () => go(`/media/${encodeURIComponent(m.id)}`),
    });
  for (const c of conns?.connections ?? [])
    out.push({
      id: `conn:${c.id}`,
      group: 'Connections',
      icon: <Cable size={15} />,
      title: c.name,
      keywords: `connection ${c.app?.name ?? ''}`,
      text: c.app?.description,
      where: 'Apps › Connected apps',
      body: c.app?.description,
      opens: 'Opens Apps → Connected apps',
      within: 'go:connected',
      run: () => go('/apps/connected?tab=connected'),
    });
  out.push(...(await guideEntries()));
  held = { at: Date.now(), entries: out };
  return out;
}

/** The guide (Help): each topic and each of its sections, which go there. It changes only with the app. */
let guide: Entry[] | null = null;
async function guideEntries(): Promise<Entry[]> {
  if (guide) return guide;
  const topics = await loadGuide().catch(() => null);
  if (!topics) return [];
  guide = topics
    .filter((t) => !AGENT_TOPICS.includes(t.id))
    .flatMap((t): Entry[] => [
      { id: `guide:${t.id}`, group: 'Guide', icon: <BookOpen size={15} />, title: t.title, keywords: 'help guide how', text: t.summary, where: 'Help', body: t.summary, opens: 'Opens this topic of the guide', run: () => goApp(`/guide/${encodeURIComponent(t.id)}`) },
      ...t.sections.map((x): Entry => {
        const text = plainText(x.text);
        return {
          id: `guide:${t.id}#${x.id}`,
          group: 'Guide',
          icon: <BookOpen size={15} />,
          title: x.title,
          keywords: `${t.title} help how`,
          text: text.slice(0, 300),
          where: `Help › ${t.title}`,
          body: text.length > 280 ? `${text.slice(0, 280)}…` : text,
          opens: 'Opens the guide at this section',
          within: `guide:${t.id}`,
          run: () => goApp(`/guide/${encodeURIComponent(t.id)}#${encodeURIComponent(x.id)}`),
        };
      }),
    ]);
  return guide;
}

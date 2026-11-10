// How Help shows each topic of the guide: its icon (the one its part of the app uses), the group it sits in on
// Help's first page, and a line on what it is for. The titles and the text come from docs/guide; a topic
// missing here still shows, under "More".
import {
  Blocks,
  Bot,
  Boxes,
  Braces,
  Brain,
  CalendarClock,
  Compass,
  Cpu,
  FileText,
  FolderTree,
  Gauge,
  Globe,
  Inbox,
  LayoutGrid,
  MessagesSquare,
  MonitorCog,
  MousePointerClick,
  Palette,
  PlugZap,
  ScrollText,
  Settings,
  Smartphone,
  Sparkles,
  SquareTerminal,
  Telescope,
  FlaskConical,
  GraduationCap,
  Wrench,
  WandSparkles,
  BookOpen,
  LibraryBig,
  type LucideIcon,
} from 'lucide-react';

export type GroupId = 'basics' | 'yours' | 'abilities' | 'setup' | 'more';

export interface TopicLook {
  icon: LucideIcon;
  group: GroupId;
  /** What the topic is for, in a line. */
  blurb: string;
}

export const GROUPS: { id: GroupId; title: string; tint: string }[] = [
  { id: 'basics', title: 'The basics', tint: 'var(--accent)' },
  { id: 'yours', title: 'Make the agents yours', tint: 'var(--codex)' },
  { id: 'abilities', title: 'What agents can do for you', tint: 'var(--info)' },
  { id: 'setup', title: 'Your setup', tint: 'var(--claude)' },
  { id: 'more', title: 'More', tint: 'var(--fg-3)' },
];

const LOOKS: Record<string, TopicLook> = {
  start: { icon: Compass, group: 'basics', blurb: 'What is on the screen, and your first session' },
  sessions: { icon: MessagesSquare, group: 'basics', blurb: 'Ask an agent, follow its work, approve what it does' },
  'ask-agents': { icon: MousePointerClick, group: 'basics', blurb: 'Have an agent change settings or set things up' },
  inbox: { icon: Inbox, group: 'basics', blurb: 'What waits on you, and notifications' },
  devices: { icon: Smartphone, group: 'basics', blurb: 'Your phone, other computers, and sharing a session' },
  app: { icon: Palette, group: 'basics', blurb: 'A theme you like, your language, and new versions' },
  guidelines: { icon: ScrollText, group: 'yours', blurb: 'What every agent should know about you and your work' },
  assistants: { icon: WandSparkles, group: 'yours', blurb: 'Researcher, Writer and others for each kind of work' },
  projects: { icon: Boxes, group: 'yours', blurb: 'A project’s sessions, files and documents together' },
  memory: { icon: Brain, group: 'yours', blurb: 'What agents remember about you and your projects' },
  skills: { icon: Sparkles, group: 'yours', blurb: 'Methods agents load when a task calls for one, and yours' },
  plugins: { icon: Blocks, group: 'yours', blurb: 'Skills, tools and files bundled for every agent' },
  connections: { icon: PlugZap, group: 'yours', blurb: 'Your apps and accounts, and keys kept safe' },
  web: { icon: Globe, group: 'abilities', blurb: 'Web searches, and a browser you can take over' },
  research: { icon: Telescope, group: 'abilities', blurb: 'Deep research, second opinions and teams of agents' },
  'documents-voice': { icon: FileText, group: 'abilities', blurb: 'Documents, pictures and videos in and out, and talking' },
  library: { icon: LibraryBig, group: 'abilities', blurb: 'Pages and documents agents make, and the images and videos you keep' },
  apps: { icon: LayoutGrid, group: 'abilities', blurb: 'Fill in a short form, and an agent does the job' },
  tasks: { icon: CalendarClock, group: 'abilities', blurb: 'Work that starts by itself, when you say' },
  researchers: { icon: GraduationCap, group: 'abilities', blurb: 'Papers to keep up with, read, check and present, and your lab’s work' },
  experiments: { icon: FlaskConical, group: 'abilities', blurb: 'Jobs that wait for a GPU, run, and are kept and compared' },
  engineering: { icon: Wrench, group: 'abilities', blurb: 'Failed CI, new issues, dependencies and incidents, handled' },
  'agents-models': { icon: Cpu, group: 'setup', blurb: 'Claude Code, Codex and others, their accounts and models' },
  custom: { icon: Bot, group: 'setup', blurb: 'The app’s own agent, for any model, local ones too' },
  usage: { icon: Gauge, group: 'setup', blurb: 'What you used, your limits and what it costs' },
  'files-git': { icon: MonitorCog, group: 'setup', blurb: 'This computer: files, Git, a terminal, previews and its monitor' },
  terminal: { icon: SquareTerminal, group: 'setup', blurb: 'Talk to agents and run requests from a terminal: the hydor command' },
  settings: { icon: Settings, group: 'setup', blurb: 'Every option in Settings, one by one' },
  api: { icon: Braces, group: 'more', blurb: 'The app’s endpoints, for scripts and agents' },
};

export const lookOf = (id: string): TopicLook => LOOKS[id] ?? { icon: BookOpen, group: 'more', blurb: '' };

/** Where a topic comes in its group: as listed above, any other after them. */
export const rankOf = (id: string) => {
  const i = Object.keys(LOOKS).indexOf(id);
  return i < 0 ? 1000 : i;
};

/** The topics in the order Help shows them: group by group. */
export const ordered = <T extends { id: string }>(topics: T[]): T[] => {
  const g = (id: string) => GROUPS.findIndex((x) => x.id === lookOf(id).group);
  return [...topics].sort((a, b) => g(a.id) - g(b.id) || rankOf(a.id) - rankOf(b.id));
};

export const tintOf = (id: string) => GROUPS.find((g) => g.id === lookOf(id).group)!.tint;

/** Questions people often have, offered under Help's question box. */
export const POPULAR = [
  'How do I use the app on my phone?',
  'Can an agent send me a news brief every morning?',
  'What do agents remember about me?',
  'How do I connect my email?',
];

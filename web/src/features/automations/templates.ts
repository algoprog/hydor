// Ready-made automations: each a short form (a time, a topic, an address) that becomes a task.
import { BellRing, CalendarCheck, FileStack, FolderInput, GitPullRequest, Globe, HardDrive, HeartPulse, Inbox, Newspaper, Rocket, Sunrise, Tag, type LucideIcon } from 'lucide-react';
import type { TaskDraft, TaskSchedule } from '@shared/automations';

export interface TemplateField {
  id: string;
  label: string;
  kind: 'text' | 'url' | 'time' | 'days' | 'weekday' | 'folder' | 'number' | 'long';
  placeholder?: string;
  default?: string;
  hint?: string;
  optional?: boolean;
}

export interface Template {
  id: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
  fields: TemplateField[];
  /** A connection it needs (Settings → Connections). */
  needs?: string;
  build(v: Record<string, string>): Pick<TaskDraft, 'name' | 'prompt' | 'schedule'> & Partial<Pick<TaskDraft, 'cwd'>>;
}

/** "Every day", "Weekdays", "Weekends" as days. */
export const DAY_SETS: Record<string, number[] | undefined> = { daily: undefined, weekdays: [1, 2, 3, 4, 5], weekends: [0, 6] };

const daily = (time: string, days: string): TaskSchedule => ({ kind: 'daily', time: time || '09:00', days: DAY_SETS[days] });
const sh = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const time = (d: string): TemplateField => ({ id: 'time', label: 'At', kind: 'time', default: d });
const days = (d = 'weekdays'): TemplateField => ({ id: 'days', label: 'On', kind: 'days', default: d });
const every = (d: string): TemplateField => ({ id: 'minutes', label: 'Check every (minutes)', kind: 'number', default: d });

export const TEMPLATES: Template[] = [
  {
    id: 'morning-brief',
    icon: Sunrise,
    title: 'Morning brief',
    blurb: 'The weather, news on what you follow, and your day, each morning.',
    fields: [time('07:30'), days(), { id: 'city', label: 'Weather for', kind: 'text', placeholder: 'Athens' }, { id: 'topics', label: 'News on', kind: 'text', placeholder: 'AI, football, my city' }],
    build: (v) => ({
      name: 'Morning brief',
      schedule: daily(v.time, v.days),
      prompt: [
        'Write my morning brief for today. Look things up on the web.',
        v.city ? `- The weather in ${v.city} today, in a line or two.` : '',
        v.topics ? `- What is new on ${v.topics} since yesterday: the few things worth knowing, each in a line with its source.` : '- The main news since yesterday, each in a line with its source.',
        '- If a calendar or mail app is connected, today’s events and anything urgent in my inbox.',
        'Keep it short and easy to skim. Use your task notes to avoid repeating what you reported before.',
      ]
        .filter(Boolean)
        .join('\n'),
    }),
  },
  {
    id: 'topic-news',
    icon: Newspaper,
    title: 'News on a topic',
    blurb: 'What is genuinely new about a subject, with sources; quiet when nothing is.',
    fields: [{ id: 'topic', label: 'Topic', kind: 'text', placeholder: 'Rust 2027 edition' }, time('09:00'), days('daily')],
    build: (v) => ({
      name: `News: ${v.topic || 'a topic'}`,
      schedule: daily(v.time, v.days),
      prompt: `Find what is new about ${v.topic || 'the topic'} since your last run: search the web, and check your task notes for what you already reported. Report only real developments, each in a line with its source link. If there is nothing new, report silent. Add what you reported to your task notes.`,
    }),
  },
  {
    id: 'price-watch',
    icon: Tag,
    title: 'Price watch',
    blurb: 'Tells you when a product’s price changes, or drops below your target.',
    fields: [
      { id: 'url', label: 'Product page', kind: 'url', placeholder: 'https://shop.example/kettle' },
      { id: 'near', label: 'Text near the price', kind: 'text', placeholder: 'Price', optional: true, hint: 'Only that part of the page counts, so other changes stay quiet.' },
      { id: 'target', label: 'Tell me below', kind: 'text', placeholder: '€99', optional: true },
      every('60'),
    ],
    build: (v) => ({
      name: `Price: ${host(v.url)}`,
      schedule: { kind: 'watch', minutes: Number(v.minutes) || 60, watch: { kind: 'page', url: v.url, ...(v.near ? { match: v.near } : {}) } },
      prompt: `The product page at ${v.url} changed. Find the current price${v.target ? ` and say whether it is at or below ${v.target}` : ' and how it moved'}. If the change is not about the price${v.target ? ', or the price is still above the target' : ''}, report silent.`,
    }),
  },
  {
    id: 'page-change',
    icon: Globe,
    title: 'Page change alert',
    blurb: 'When a page (or part of it) changes, what changed and whether it matters.',
    fields: [{ id: 'url', label: 'Page', kind: 'url', placeholder: 'https://example.com/opening-hours' }, { id: 'near', label: 'Only near this text', kind: 'text', optional: true, placeholder: 'Opening hours' }, every('30')],
    build: (v) => ({
      name: `Changes: ${host(v.url)}`,
      schedule: { kind: 'watch', minutes: Number(v.minutes) || 30, watch: { kind: 'page', url: v.url, ...(v.near ? { match: v.near } : {}) } },
      prompt: `This page changed: ${v.url}. Say in a few lines what changed and whether it matters to me. If the change is trivial (a date, a counter, an ad), report silent.`,
    }),
  },
  {
    id: 'weekly-folder',
    icon: FileStack,
    title: 'Weekly report from a folder',
    blurb: 'Every week, what changed in a folder or repository and what looks unfinished.',
    fields: [{ id: 'folder', label: 'Folder', kind: 'folder' }, { id: 'day', label: 'On', kind: 'weekday', default: '5' }, time('16:00')],
    build: (v) => ({
      name: 'Weekly report',
      cwd: v.folder,
      schedule: { kind: 'daily', time: v.time || '16:00', days: [Number(v.day ?? 5)] },
      prompt:
        'Write a short weekly report of the work in this folder: what was added or changed in the last 7 days (use git log if it is a repository, otherwise the files’ dates), what it is about, and anything that looks unfinished. End with three suggestions for next week. Do not change any files.',
    }),
  },
  {
    id: 'inbox-digest',
    icon: Inbox,
    title: 'Inbox digest',
    blurb: 'What came in, the messages that need you first. Reads only.',
    needs: 'a connected mail app',
    fields: [time('08:00'), days()],
    build: (v) => ({
      name: 'Inbox digest',
      schedule: daily(v.time, v.days),
      prompt:
        'Using the connected mail app, go through the messages that arrived since your last run (your task notes say when that was). Write a digest: first the ones that need a reply or an action from me, each with who, what and by when; then the rest, one line each. Do not send, move or delete anything. Keep the time of the newest message you covered in your task notes.',
    }),
  },
  {
    id: 'habit',
    icon: CalendarCheck,
    title: 'Habit check-in',
    blurb: 'A friendly daily question about a habit, keeping your streak.',
    fields: [{ id: 'habit', label: 'Habit', kind: 'text', placeholder: 'a 20-minute walk' }, time('20:00'), days('daily')],
    build: (v) => ({
      name: `Check-in: ${v.habit || 'habit'}`,
      schedule: daily(v.time, v.days),
      prompt: `Check in with me about my habit: ${v.habit || 'my habit'}. Ask in one friendly line whether I did it today, and mention my streak from your task notes. When I answer in this conversation, update the streak in your task notes.`,
    }),
  },
  {
    id: 'releases',
    icon: Rocket,
    title: 'New releases',
    blurb: 'A repository’s new releases, summarized with what could break.',
    fields: [{ id: 'repo', label: 'GitHub repository', kind: 'text', placeholder: 'owner/name' }, every('360')],
    build: (v) => ({
      name: `Releases: ${v.repo || 'repository'}`,
      schedule: { kind: 'watch', minutes: Number(v.minutes) || 360, watch: { kind: 'feed', url: `https://github.com/${(v.repo || '').trim()}/releases.atom` } },
      prompt: `A new release of ${v.repo} came out (above). Summarize what is new and anything that could break for me, in a few lines with the link.`,
    }),
  },
  {
    id: 'site-up',
    icon: HeartPulse,
    title: 'Site up check',
    blurb: 'Looks into it when a site goes down, and tells you when it is back.',
    fields: [{ id: 'url', label: 'Address', kind: 'url', placeholder: 'https://example.com' }, every('10')],
    build: (v) => ({
      name: `Up: ${host(v.url)}`,
      schedule: { kind: 'watch', minutes: Number(v.minutes) || 10, watch: { kind: 'command', command: `curl -fsS -o /dev/null --max-time 20 ${sh(v.url)}`, on: 'exit' } },
      prompt: `The check of ${v.url} changed (its exit code is above: 0 means it answers). If it went down, find out why (DNS, certificate, HTTP status, time-out) and tell me briefly. If it came back, say so in one line.`,
    }),
  },
  {
    id: 'disk-space',
    icon: HardDrive,
    title: 'Disk space alert',
    blurb: 'When a disk fills past a mark, what takes the space. Deletes nothing.',
    fields: [{ id: 'mount', label: 'Disk (mount point)', kind: 'text', default: '/' }, { id: 'percent', label: 'Over (%)', kind: 'number', default: '90' }, every('30')],
    build: (v) => {
      const pct = Number(v.percent) || 90;
      const mount = v.mount || '/';
      return {
        name: `Disk space: ${mount}`,
        schedule: { kind: 'watch', minutes: Number(v.minutes) || 30, watch: { kind: 'command', command: `df -P ${sh(mount)} | awk 'NR==2 { print (($5 + 0) >= ${pct}) ? "over" : "ok" }'`, on: 'output' } },
        prompt: `Disk use on ${mount} crossed ${pct}% (the output above says over), or went back under it (ok). If it is over, find what takes the space (the largest folders, caches, logs) and suggest what to clean up; do not delete anything. If it says ok, report silent.`,
      };
    },
  },
  {
    id: 'pr-review',
    icon: GitPullRequest,
    title: 'Review new pull requests',
    blurb: 'GitHub or Gitea calls it for each new pull request; the agent reviews it.',
    fields: [{ id: 'folder', label: 'Repository folder', kind: 'folder' }],
    build: (v) => ({
      name: 'Pull request review',
      cwd: v.folder,
      schedule: { kind: 'webhook', filter: { path: 'body.action', value: 'opened' } },
      prompt:
        'Review this pull request: {{body.pull_request.html_url}} ({{body.pull_request.title}}). Read the change against this repository, point out bugs and risky parts, and suggest fixes. Do not push or merge anything.',
    }),
  },
  {
    id: 'new-files',
    icon: FolderInput,
    title: 'New files in a folder',
    blurb: 'When files land in a folder (downloads, scans), the agent looks at them.',
    fields: [{ id: 'folder', label: 'Folder', kind: 'folder' }, { id: 'pattern', label: 'Only files like', kind: 'text', optional: true, placeholder: '*.pdf' }, { id: 'what', label: 'Then', kind: 'long', optional: true, placeholder: 'Tell me in a line what each one is.' }, every('15')],
    build: (v) => ({
      name: 'New files',
      cwd: v.folder,
      schedule: { kind: 'watch', minutes: Number(v.minutes) || 15, watch: { kind: 'folder', path: v.folder, ...(v.pattern ? { pattern: v.pattern } : {}) } },
      prompt: `New files arrived (listed above). ${v.what?.trim() || 'Look at each and tell me in a line what it is.'}`,
    }),
  },
  {
    id: 'reminder',
    icon: BellRing,
    title: 'Reminder',
    blurb: 'A nudge at a set time, once or on repeat.',
    fields: [{ id: 'what', label: 'Remind me to', kind: 'text', placeholder: 'call the dentist' }, time('09:00'), days('weekdays')],
    build: (v) => ({
      name: `Reminder: ${v.what || 'something'}`,
      schedule: daily(v.time, v.days),
      prompt: `Remind me, in one friendly line, to ${v.what || 'do the thing I asked about'}.`,
    }),
  },
];

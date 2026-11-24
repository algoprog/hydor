// "What Hydor can do", on Help's first page: the features people miss, one card each, with the icon of its part of the
// app, a line on what it does, and what to do first: a request that goes into the message box (never sent for you), or
// the place to open; "How it works" opens the guide's section. The names and lines are the same as the website's and
// the README's. Its address is /guide#what-hydor-can-do (the search box's "What Hydor can do" goes there too).
import { useEffect, useRef } from 'react';
import { ArrowRight, Import, Shapes, TextCursorInput, WandSparkles, type LucideIcon } from 'lucide-react';
import { cx } from '../../components/ui';
import { go, goApp } from '../../lib/nav';
import { DESKTOP_APP } from '../tour/setup';
import { tryWords } from '../tour/Tour';
import { lookOf, tintOf } from './topics';

/** Where Help's first page shows it: the section's id in the address. */
export const HIGHLIGHTS_ID = 'what-hydor-can-do';

interface Highlight {
  id: string;
  name: string;
  line: string;
  /** The guide topic of its part of the app: its icon (unless `icon`) and its colour. */
  topic: string;
  icon?: LucideIcon;
  /** A request to put in the message box, or the place to open. */
  ask?: string;
  open?: { label: string; path: string };
  /** The guide's section on it. */
  guide: string;
  /** Desktop apps only. */
  desktop?: true;
}

const HIGHLIGHTS: Highlight[] = [
  {
    id: 'bring-in',
    name: 'Bring in from ChatGPT or Claude',
    line: 'Bring over what they know about you, from the export they email you: your instructions, memory and chats. You pick what to keep.',
    topic: 'memory',
    icon: Import,
    open: { label: 'Open Bring in', path: '/settings?s=memory&find=Bring%20in%E2%80%A6' },
    guide: '/guide/memory#bring-in-from-other-assistants',
  },
  {
    id: 'apps',
    name: 'Apps',
    line: 'Ready-made apps for the jobs you do again and again: a trip plan, a product comparison, the weather, a news digest. Each answers in a view of its own, with maps, charts and pictures.',
    topic: 'apps',
    ask: 'Plan 4 days in Lisbon in May',
    guide: '/guide/apps#use-a-ready-made-app',
  },
  {
    id: 'make-app',
    name: 'Make your own app',
    line: 'Describe a job you do often, and an agent builds an app for it: a form, the work, and a view for its answer. Run it, schedule it or share it.',
    topic: 'apps',
    icon: WandSparkles,
    open: { label: 'Make an app', path: '/apps/new' },
    guide: '/guide/apps#make-your-own-app',
  },
  {
    id: 'answer-cards',
    name: 'Answer cards',
    line: 'Answers come as cards when that’s clearer: charts, maps, tables, quizzes and small tools, nearly 150 kinds. Open one full screen, save it as a picture or pin it to a board.',
    topic: 'sessions',
    icon: Shapes,
    ask: 'Compare the three best e-bikes under $2,000',
    guide: '/guide/sessions#answer-uis-cards-charts-and-maps-in-replies',
  },
  {
    id: 'suggest',
    name: 'Word suggestions',
    line: 'The rest of the word you’re typing in grey, and the next one: Tab takes it. Made on your computer by a small model that learns how you write.',
    topic: 'documents-voice',
    icon: TextCursorInput,
    open: { label: 'Open the setting', path: '/settings?s=suggest' },
    guide: '/guide/documents-voice#word-suggestions-as-you-type',
  },
  {
    id: 'documents',
    name: 'Documents, slides and spreadsheets',
    line: 'Agents write them and you edit them in the app, like Word, PowerPoint and Excel. They open beside the conversation as they’re written, and export to Office files or PDF.',
    topic: 'documents-voice',
    ask: 'Make a short slide deck that introduces our team to a new client',
    guide: '/guide/library#watch-a-page-as-it-is-written',
  },
  {
    id: 'research',
    name: 'Deep research',
    line: 'Researchers search and read in rounds and hand back one report, every claim with its source.',
    topic: 'research',
    ask: 'Research how heat pumps compare with gas boilers and give me a report with sources',
    guide: '/guide/research#run-a-deep-research',
  },
  {
    id: 'tasks',
    name: 'Work that runs by itself',
    line: 'Scheduled tasks, watchers and webhooks, and agents of your own, each within a monthly budget.',
    topic: 'tasks',
    ask: 'Every Monday at 8, send me a short brief of the week’s news on AI research',
    guide: '/guide/tasks#what-a-scheduled-task-is',
  },
  {
    id: 'goals',
    name: 'Goals',
    line: 'Agree what “done” means (tests that pass, a number to reach) and the agent keeps at it round after round. The app runs the checks itself.',
    topic: 'goals',
    guide: '/guide/goals#set-a-goal',
  },
  {
    id: 'experiments',
    name: 'Experiments',
    line: 'Training and evaluation runs that wait for a free GPU, with live charts, sweeps and results tables for your paper. Agents start and watch them for you.',
    topic: 'experiments',
    open: { label: 'Open Experiments', path: '/system/experiments' },
    guide: '/guide/experiments#open-experiments',
  },
  {
    id: 'phone',
    name: 'On your phone',
    line: 'Follow your agents and approve from the notification, in the same app on your phone.',
    topic: 'devices',
    open: { label: 'Use on your phone', path: '/settings?s=phone' },
    guide: '/guide/devices#use-the-app-on-a-phone',
  },
  {
    id: 'browser',
    name: 'A browser of its own',
    line: 'Tabs, an ad blocker, translation and reader view, and agents that work in it while you watch.',
    topic: 'web',
    open: { label: 'Open the browser', path: '/browser' },
    guide: '/guide/web#your-own-browser',
    desktop: true,
  },
];

function Card({ h }: { h: Highlight }) {
  const Icon = h.icon ?? lookOf(h.topic).icon;
  const tint = tintOf(h.topic);
  const request = useRef<HTMLButtonElement>(null);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ color: tint, background: `color-mix(in srgb, ${tint} 14%, transparent)` }}>
        <Icon size={18} strokeWidth={1.9} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <span className="block text-[14px] leading-snug font-medium text-fg">{h.name}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{h.line}</span>
        <span className="mt-auto flex items-end justify-between gap-3 pt-2.5">
          {/* The request as it shows, in the app's language, goes in the message box (as the tour's chips do). */}
          {h.ask && (
            <button
              ref={request}
              type="button"
              title="Put this in the message box"
              onClick={() => tryWords(request.current?.textContent?.trim() || h.ask!)}
              className="min-w-0 rounded-xl border border-line bg-bg-1 px-2.5 py-1 text-left text-[12.5px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg"
            >
              {h.ask}
            </button>
          )}
          {h.open && (
            <button
              type="button"
              onClick={() => go(h.open!.path)}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-bg-1 px-2.5 py-1 text-[12.5px] text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg"
            >
              {h.open.label}
              <ArrowRight size={12} className="text-fg-3" />
            </button>
          )}
          <button type="button" onClick={() => goApp(h.guide)} className="ml-auto shrink-0 rounded py-1 text-[12.5px] text-fg-3 transition-colors hover:text-fg">
            How it works
          </button>
        </span>
      </div>
    </div>
  );
}

export function Highlights({ className }: { className?: string }) {
  const section = useRef<HTMLElement>(null);
  // The address /guide#what-hydor-can-do (from the tour, the search box or a link) scrolls here.
  useEffect(() => {
    const look = () => decodeURIComponent(location.hash.slice(1)) === HIGHLIGHTS_ID && section.current?.scrollIntoView({ block: 'start' });
    look();
    window.addEventListener('hydor:hash', look);
    window.addEventListener('hashchange', look);
    return () => {
      window.removeEventListener('hydor:hash', look);
      window.removeEventListener('hashchange', look);
    };
  }, []);
  return (
    <section ref={section} id={HIGHLIGHTS_ID} className={cx('scroll-mt-4', className)}>
      <h3 className="mb-3 px-1 text-[14px] font-semibold text-fg-2">What Hydor can do</h3>
      <div className="grid gap-2.5 @lg:grid-cols-2 @3xl:grid-cols-3">
        {HIGHLIGHTS.filter((h) => !h.desktop || DESKTOP_APP).map((h) => (
          <Card key={h.id} h={h} />
        ))}
      </div>
    </section>
  );
}

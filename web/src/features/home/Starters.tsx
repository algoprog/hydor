// Starters under the start page's empty message box: three example requests, two of your apps and an automation, so a
// first visit shows what to ask for. An example or the automation fills the box (to change and send: nothing is sent);
// an app opens its form. The examples change each day, from a small pool for everyday work, research, documents and
// code, and lean towards code in a code folder. The apps are those you run most, else two that suit anyone (GET
// /api/apps/suggested; an older server has no such route: the same two then). They fold away as you type; Hide puts
// them away for good, on every device (kept with the start page's picks; Settings → General → Starter ideas brings
// them back).
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, Code, FileText, Lightbulb, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { saveStart } from '../../lib/start';
import { toast, useApp } from '../../lib/store';
import { cx, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { AppIcon } from '../apps/AppIcon';
import { appPath } from '../apps/api';

type Kind = 'everyday' | 'research' | 'documents' | 'code';

/** Example requests, each complete enough to send and easy to change. A trailing "…" is where your own words go. */
const EXAMPLES: Record<Kind, string[]> = {
  everyday: [
    'Plan five quick weeknight dinners for two, with one shopping list',
    'Help me write a polite note to my landlord about a broken heater',
    'Make a packing list for a four-day trip to a rainy city',
    'Compare the best robot vacuums for a small flat with pets',
    'Plan a relaxed Saturday with two young children, close to home',
  ],
  research: [
    'What does recent research say about intermittent fasting? Cite the studies',
    'Explain how heat pumps work, and whether one suits an old house',
    'Give me a balanced brief on the pros and cons of a four-day work week',
    'Find the most cited recent papers on …',
    'What are the main arguments for and against nuclear power today, with sources?',
  ],
  documents: [
    'Write a short, friendly cover letter for a project manager job',
    'Make a monthly budget spreadsheet with categories and totals',
    'Turn the PDF I attach into a one-page summary of its key points',
    'Make a short slide deck that introduces our team to a new client',
    'Draft a clear email inviting the team to a planning day next month',
  ],
  code: [
    'Explain how this project is organised, and where to start',
    'Find out why the tests fail, and fix them',
    'Review the latest changes for bugs and anything unclear',
    'Write a README that says what this project does and how to run it',
    'Find the slowest parts of this code and suggest how to speed them up',
  ],
};

const ICON: Record<Kind, ReactNode> = {
  everyday: <Lightbulb size={15} />,
  research: <Search size={15} />,
  documents: <FileText size={15} />,
  code: <Code size={15} />,
};

/** A time of day as the language in use writes it ("8:00 AM", "08:00"). */
const clock = (h: number, m = 0) => new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 5, h, m));

/** Automations: a request agents turn into a scheduled task themselves. */
function automations(code: boolean): string[] {
  if (code) return [`Every Friday at ${clock(17)}, send me a summary of what changed in this project this week`];
  return [
    `Every Monday at ${clock(8)}, send me a short brief of the week’s news on …`,
    `Every morning at ${clock(7, 30)}, send me today’s weather for … and what to wear`,
    `Every Sunday at ${clock(18)}, send me a meal plan and a shopping list for the week`,
    `Every day at ${clock(9)}, look for new papers on … and send me the best three`,
  ];
}

/** Where the box is: a code folder (a git repository), a project, or anywhere else. */
export type StarterPlace = 'code' | 'project' | 'any';

/** Today's examples for a place: different each day, the same all day. */
export function examplesFor(place: StarterPlace, day: number): { kind: Kind; text: string }[] {
  const at = (kind: Kind, k: number) => ({ kind, text: EXAMPLES[kind][(((day + k) % EXAMPLES[kind].length) + EXAMPLES[kind].length) % EXAMPLES[kind].length] });
  if (place === 'code') return [at('code', 0), at('code', 2), day % 2 ? at('documents', 0) : at('research', 0)];
  if (place === 'project') return [at('research', 0), at('documents', 0), at('documents', 2)];
  return [at('everyday', 0), at('research', 1), at('documents', 2)];
}

/** Today, as a number of days: the examples change at local midnight. */
const today = () => {
  const d = new Date();
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
};

interface SuggestedApp {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
}

/** What an older server, which cannot say, suggests: the two ready-made apps that suit anyone. */
const READY: SuggestedApp[] = [
  { id: 'tpl:deep-research', name: 'Deep research report', description: 'A sourced report on any question: the web searched, facts cross-checked, every claim cited.', icon: 'telescope', color: 'violet' },
  { id: 'tpl:trip-planner', name: 'Trip planner', description: 'A day-by-day plan checked against your dates: opening hours, events, travel times, budget and what to book.', icon: 'plane', color: 'indigo' },
];

/** The apps to suggest, asked for at most once a few minutes while the page is open. */
let held: { at: number; apps: SuggestedApp[] } | null = null;
async function suggested(): Promise<SuggestedApp[]> {
  if (held && Date.now() - held.at < 5 * 60_000) return held.apps;
  const apps = await api<{ apps: SuggestedApp[] }>('/api/apps/suggested?n=2').then(
    (r) => (Array.isArray(r.apps) ? r.apps.slice(0, 2) : READY),
    () => READY,
  );
  held = { at: Date.now(), apps };
  return apps;
}

function Tile({ icon, onClick, children, title }: { icon: ReactNode; onClick: () => void; children: ReactNode; title?: string }) {
  const mobile = useIsMobile();
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx(
        'group flex min-w-0 items-start gap-2.5 rounded-xl border border-line bg-panel/60 px-3 py-2.5 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg',
        mobile && 'w-[232px] shrink-0 snap-start',
      )}
    >
      <span className="mt-px flex shrink-0 text-fg-3 transition-colors group-hover:text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/**
 * The starters. `onFill` puts a request in the box (its words in the language in use); they show only while the box is
 * empty, which the start page decides.
 */
export function Starters({ place, onFill }: { place: StarterPlace; onFill: (text: string) => void }) {
  const mobile = useIsMobile();
  const [apps, setApps] = useState<SuggestedApp[] | null>(held?.apps ?? null);
  useEffect(() => {
    let alive = true;
    suggested().then((a) => alive && setApps(a));
    return () => {
      alive = false;
    };
  }, []);
  const day = today();
  const examples = examplesFor(place, day);
  const autos = automations(place === 'code');
  const auto = autos[day % autos.length];
  const hide = () => {
    saveStart({ starters: false }, true);
    toast('Starter ideas hidden: Settings → General → Starter ideas brings them back');
  };
  return (
    <section aria-label="Starter ideas" className="anim-in mt-5">
      <div className="mb-2 flex items-center justify-between px-1 text-[12px] text-fg-3">
        <span>Try one, or write your own</span>
        <button onClick={hide} title="Hide the starter ideas (Settings → General brings them back)" className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-bg-2 hover:text-fg-2">
          <X size={12} />
          Hide
        </button>
      </div>
      <div className={cx(mobile ? '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]' : 'grid grid-cols-3 gap-2')}>
        {examples.map((e) => (
          <Tile key={e.text} icon={ICON[e.kind]} onClick={() => onFill(tr(e.text))} title="Put it in the box, to change and send">
            <span className="line-clamp-2">{e.text}</span>
          </Tile>
        ))}
        {(apps ?? []).map((a) => (
          <Tile key={a.id} icon={<AppIcon icon={a.icon} color={a.color} size={18} />} onClick={() => go(appPath(a.id))} title="Open the app’s form">
            <span className="block truncate font-medium text-fg" translate={a.id.startsWith('tpl:') ? undefined : 'no'}>
              {a.name}
            </span>
            {a.description && (
              <span className="block truncate text-[12px] text-fg-3" translate={a.id.startsWith('tpl:') ? undefined : 'no'}>
                {a.description}
              </span>
            )}
          </Tile>
        ))}
        <Tile icon={<CalendarClock size={15} />} onClick={() => onFill(tr(auto))} title="Put it in the box: the agent sets it up as a scheduled task">
          <span className="line-clamp-2">{auto}</span>
        </Tile>
      </div>
    </section>
  );
}

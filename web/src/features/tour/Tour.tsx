// The welcome tour. The first time someone opens the app (right after choosing a password on a new install), and
// whenever they start it again from Help, it shows what Hydor is with a short film of a request being done, asks
// what should do the work (Claude, ChatGPT's Codex, models through OpenRouter or on this computer, other agents) and
// sets up each one picked, on pages that fill the screen over a still sea that rises a little with each step, a
// picture beside each page. Then it builds the app up as it shows it around: a step lights an element marked
// data-tour="…", which arrives as the step comes, with the rest of the page dimmed around it and a card beside it,
// some with something to try; whatever no step lights arrives when the tour ends. Little of it moves. After it, tips
// (features/tips) show the rest of the app as you come to each part: finishing the tour turns them on, skipping it
// turns them off for good. The pictures are in scenes.tsx; the words are short and plain, for people new to AI.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { create } from 'zustand';
import { ArrowRight, Bell, Blocks, Check, CircleHelp, Cloud, Cpu, Import, LayoutGrid, ListChecks, MessageSquareText, MessagesSquare, Plus, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import type { AccountStatus, AcpAgentDef, Agent, ClientInfo, ModelsState } from '@shared/types';
import { api, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { saveStart, startSettings } from '../../lib/start';
import { enablePush, pushState, type PushState } from '../../lib/notify';
import { toastError, useApp, useUI } from '../../lib/store';
import { live } from '../../lib/ws';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Button, cx, Throbber, useIsMobile } from '../../components/ui';
import { Wordmark } from '../../components/Logo';
import { LoginDialog } from '../settings/SettingsPage';
import { BringIn } from '../memory/BringIn';
import { shortGpu } from '../settings/ModelsSettings';
import { TourLocal, TourMedia, TourOpenRouter } from './TourModels';
import { Sea, SourcesMap, TideMark, TourProgress, WelcomeFilm, type Use } from './scenes';
import { machineBase, machineId } from '../../lib/machine';
import { tourDone } from '../tips/state';
import { build, setupDone, takeAfterSetup, TOUR_SETUP_STEPS } from './setup';

export { Sea, setupDone, TOUR_SETUP_STEPS, TourProgress, type Use };

/** Raise it when the tour changes enough to be worth showing again to everyone. */
export const TOUR_VERSION = 2;

const USES: Use[] = ['claude', 'codex', 'openrouter', 'local', 'agents'];
const USES_KEY = 'wa.tour.uses';

function savedUses(): Use[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(USES_KEY) ?? 'null');
    return Array.isArray(v) ? USES.filter((u) => v.includes(u)) : null;
  } catch {
    return null;
  }
}

interface Step {
  id: string;
  /** The element lit: [data-tour="…"]. It stays hidden until its step (or comes with the part it is one of, as
   * Settings does with the tools), so name it in styles.css ("the tour builds the app up") too. None, after the
   * pages: the card sits in the middle. */
  target?: string;
  /** What stays in the light around the target, when that is only a part of it (the whole message box for the row
   * under it): the ring marks the target, the card keeps clear of this. */
  focus?: string;
  title: string;
  body: ReactNode;
  /** Something to do right in the step. */
  Extra?: () => ReactNode;
  /** A page's picture, beside its words, in the same place on every page (on a narrow screen only the welcome's, above
   * its words). */
  scene?: (uses: Use[]) => ReactNode;
  /** A card's icon, in the app. */
  icon?: ReactNode;
  /** The page the target is on. */
  route?: string;
  /** The target is in the sidebar: shown first (the drawer, on phones), and arriving with it. */
  sidebar?: boolean;
  /** The card's width on wider screens. */
  width?: number;
  /** Next waits for this. */
  ready?: (uses: Use[]) => boolean;
  /** Next's words, when not "Next". */
  next?: string;
}

interface TourState {
  open: boolean;
  /** Fading out. */
  closing: boolean;
  i: number;
  signIn: Agent | null;
  accountsRev: number;
  uses: Use[];
  /** The uses came from the person (saved or picked), not from what is set up already. */
  picked: boolean;
  /** Right after choosing the password: that screen was the welcome. */
  fresh: boolean;
  /** The other assistants with a folder on this computer (Hermes, pi…): when there are any, a step offers to bring in what they know. */
  found: string[];
  /** The Bring in dialog is open over the tour. */
  bringIn: boolean;
}

const useTour = create<TourState>(() => ({ open: false, closing: false, i: 0, signIn: null, accountsRev: 0, uses: [], picked: false, fresh: false, found: [], bringIn: false }));

/** The tour is on screen (tips wait for it). */
export const tourOpen = () => useTour.getState().open;

let closeTimer = 0;
let builtTimer = 0;


/** Opens the tour, at its start or at one step. */
export function startTour(from?: string, fresh = false) {
  window.clearTimeout(closeTimer);
  window.clearTimeout(builtTimer);
  const saved = savedUses();
  const uses = saved ?? [];
  const i = from ? steps(uses, fresh, []).findIndex((s) => s.id === from) : 0;
  useTour.setState({ open: true, closing: false, i: Math.max(0, i), signIn: null, uses, picked: !!saved, fresh, found: [], bringIn: false });
  // Which assistants are here is looked up as the tour opens; the step comes (and the dots count it) once it is known.
  api<{ found: { name: string }[] }>('/api/memory/bring-in/found')
    .then((r) => useTour.setState({ found: r.found.map((f) => f.name) }))
    .catch(() => {});
}


/** Closes the tour as the rest of the app arrives; finishing it readies the message box. Finishing it turns the tips
 * after it on; skipping it turns them off; closing it (✕ or Esc) leaves them as they were. */
function endTour(finished = false, skipped = false) {
  const s = useTour.getState();
  if (!s.open || s.closing) return;
  useTour.setState({ closing: true, signIn: null, bringIn: false });
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    useTour.setState({ open: false, closing: false });
    if (useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
  }, 380);
  // Once the rest has arrived the app is itself again, and the message box shows it is ready.
  window.clearTimeout(builtTimer);
  builtTimer = window.setTimeout(() => {
    build(null);
    if (finished) invite();
  }, 700);
  const boot = useApp.getState().boot;
  if (boot && boot.tourSeen < TOUR_VERSION) useApp.getState().set({ boot: { ...boot, tourSeen: TOUR_VERSION } });
  post('/api/tour', { version: TOUR_VERSION }).catch(() => {});
  tourDone(TOUR_VERSION, finished ? true : skipped ? false : undefined);
}

/** After the tour: the message box glows once, ready for the first task. */
function invite() {
  const box = document.querySelector<HTMLElement>('[data-tour="composer"]');
  if (!box) return;
  box.classList.remove('tour-invite');
  void box.offsetWidth;
  box.classList.add('tour-invite');
  setTimeout(() => box.classList.remove('tour-invite'), 1500);
  if (!window.matchMedia('(pointer: coarse)').matches) box.querySelector('textarea')?.focus({ preventScroll: true });
}

/** The start page's agent, when the one it has is not among those chosen. */
function pickAgent(uses: Use[]) {
  const cur = startSettings().agent ?? '';
  const own = useApp.getState().boot?.acpAgents.filter((a) => !a.builtin) ?? [];
  const fits = (v: string) =>
    v === 'claude' ? uses.includes('claude') : v === 'codex' ? uses.includes('codex') : v === 'acp:console' ? uses.includes('openrouter') || uses.includes('local') : v.startsWith('acp:') && uses.includes('agents');
  if (cur && fits(cur)) return;
  const next = ['claude', 'codex', 'acp:console', ...own.map((a) => `acp:${a.id}`)].find(fits);
  if (!next || next === (cur || 'claude')) return;
  // Kept for the start page, which may open after this; an open one takes it at once.
  saveStart({ agent: next });
  window.dispatchEvent(new CustomEvent('wa:agent', { detail: next }));
}

/** Puts words in the message box, as a link to the start page does, and leaves them for you to send or change. */
function tryWords(text: string) {
  go(`/?prompt=${encodeURIComponent(text)}`);
  setTimeout(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) document.querySelector<HTMLTextAreaElement>('[data-tour="composer"] textarea')?.focus({ preventScroll: true });
  }, 120);
}

// ---- things to do inside steps ----------------------------------------------------------

/** One thing about the app, on the welcome page. */
function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="tour-point-icon">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[14.5px] font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-[13.5px] leading-snug text-balance text-fg-3">{children}</div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2.5 py-5 text-[13.5px] text-fg-3">
      <Throbber size={18} /> Checking…
    </div>
  );
}

/** A plan as the CLIs name it ("max", "free"), as people read it. */
const planName = (p?: string) => (p ? p[0].toUpperCase() + p.slice(1) : '');

const Connected = ({ label = 'Connected' }: { label?: string }) => (
  <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-fg-2">
    <Check size={14} className="text-ok" /> {label}
  </span>
);

const TILES: { id: Use; title: string; sub: string; icon: ReactNode }[] = [
  { id: 'claude', title: 'Claude', sub: 'I pay for Claude (Pro or Max): use that plan', icon: <AgentIcon agent="claude" size={19} /> },
  { id: 'codex', title: 'ChatGPT', sub: 'I pay for ChatGPT (Plus or Pro): use its agent, Codex', icon: <AgentIcon agent="codex" size={19} /> },
  { id: 'openrouter', title: 'Pay as you go', sub: 'The best AI models from every company, with one account', icon: <Cloud size={18} /> },
  { id: 'local', title: 'Free, on this computer', sub: 'Private AI that runs right here: nothing leaves this computer', icon: <Cpu size={18} /> },
  { id: 'agents', title: 'Other agents', sub: 'I already use Gemini CLI, OpenCode, Goose or the like', icon: <Blocks size={18} /> },
];

/** The choice the tour adapts to; what is set up already starts ticked. */
function UsesPicker() {
  const uses = useTour((s) => s.uses);
  const [acc, setAcc] = useState<Record<Agent, AccountStatus> | null>(null);
  const [models, setModels] = useState<ModelsState | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.allSettled([api<Record<Agent, AccountStatus>>('/api/accounts'), api<ModelsState>('/api/models')]).then(([a, m]) => {
      if (!alive) return;
      const accounts = a.status === 'fulfilled' ? a.value : null;
      const st = m.status === 'fulfilled' ? m.value : null;
      setAcc(accounts);
      setModels(st);
      if (useTour.getState().picked) return;
      const own = useApp.getState().boot?.acpAgents.some((x) => !x.builtin);
      const have: Record<Use, boolean> = {
        claude: !!accounts?.claude?.loggedIn,
        codex: !!accounts?.codex?.loggedIn,
        openrouter: !!st?.openrouter.keyHint,
        local: !!st?.local.length,
        agents: !!own,
      };
      const found = USES.filter((u) => have[u]);
      if (found.length) useTour.setState({ uses: found });
    });
    return () => {
      alive = false;
    };
  }, []);
  const toggle = (u: Use) => useTour.setState((s) => ({ uses: USES.filter((x) => (x === u ? !s.uses.includes(u) : s.uses.includes(x))), picked: true }));
  const status = (u: Use): string | null => {
    if (u === 'claude' || u === 'codex') {
      const s = acc?.[u];
      return s?.loggedIn ? `Signed in${s.plan ? ` · ${planName(s.plan)}` : ''}` : null;
    }
    if (!models) return null;
    const pinned = models.openrouter.pinned.length;
    if (u === 'openrouter') return !models.openrouter.keyHint ? null : pinned === 1 ? 'Connected · 1 model' : pinned ? `Connected · ${pinned} models` : 'Connected';
    if (u === 'local') {
      if (models.local.length) return `${models.local.length} model${models.local.length > 1 ? 's' : ''} here already`;
      const g = models.machine.gpus[0];
      return models.machine.apple ? `Private AI on your ${models.machine.apple.chip.replace(/^Apple\s+/, '')}` : g ? `Private AI on your ${shortGpu(g.name)}` : null;
    }
    return null;
  };
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {TILES.map((t) => {
        const on = uses.includes(t.id);
        const s = status(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t.id)}
            className={cx('tour-tile group', on && 'tour-tile-on', t.id === 'agents' && 'sm:col-span-2')}
          >
            <span className="tour-tile-icon">{t.icon}</span>
            <span className="min-w-0 flex-1 pt-px">
              <span className="block text-[14.5px] leading-tight font-medium text-fg">{t.title}</span>
              <span className={cx('mt-1 block text-[12.5px] leading-snug text-balance', s ? 'text-ok' : 'text-fg-3')}>{s ?? t.sub}</span>
            </span>
            <span className="tour-tile-check" aria-hidden>
              {on && <Check size={11} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AccountsSetup() {
  const rev = useTour((s) => s.accountsRev);
  const uses = useTour((s) => s.uses);
  const [acc, setAcc] = useState<Record<Agent, AccountStatus> | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  useEffect(() => {
    api<Record<Agent, AccountStatus>>('/api/accounts')
      .then(setAcc)
      .catch(toastError);
    api<{ clients: ClientInfo[] }>('/api/clients').then(
      (r) => setMissing(r.clients.filter((c) => c.source === 'missing').map((c) => c.id)),
      () => {},
    );
  }, [rev]);
  const agents = (['claude', 'codex'] as const).filter((a) => uses.includes(a));
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl bg-panel/70 ring-1 ring-line">
      {agents.map((a) => {
        const s = acc?.[a];
        return (
          <div key={a} className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="tour-tile-icon">
              <AgentIcon agent={a} size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-fg">{a === 'claude' ? 'Claude' : `ChatGPT (${agentName(a)})`}</div>
              <div className="truncate text-[12.5px] text-fg-3">
                {!s
                  ? 'Checking…'
                  : s.loggedIn
                    ? `${s.email ?? 'Signed in'}${s.plan ? ` · ${planName(s.plan)}` : ''}`
                    : missing.includes(a)
                      ? 'Signing in installs it first: it takes a minute'
                      : (s.error ?? (a === 'claude' ? 'A Claude plan (Pro, Max or Team) or an Anthropic Console account' : 'A ChatGPT plan: Plus, Pro, Business or Enterprise'))}
              </div>
            </div>
            {s &&
              (s.loggedIn ? (
                <Connected />
              ) : (
                <Button size="sm" variant="primary" className="rounded-full px-4" onClick={() => useTour.setState({ signIn: a })}>
                  Sign in
                </Button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

type AgentDef = AcpAgentDef & { installed: boolean };

function AgentsSetup() {
  const [data, setData] = useState<{ agents: AgentDef[]; presets: AgentDef[] } | null>(null);
  useEffect(() => {
    const load = () => api<{ agents: AgentDef[]; presets: AgentDef[] }>('/api/acp-agents').then(setData, toastError);
    load();
    return live.on((e) => e.t === 'acpAgents' && load());
  }, []);
  if (!data) return <Loading />;
  const add = (d: AgentDef) => post('/api/acp-agents', { id: d.id, name: d.name, command: d.command, args: d.args, env: d.env }).catch(toastError);
  // The app installs the ones published on npm by itself.
  const installs = (d: AgentDef) => !!d.hint?.startsWith('npm install');
  const rows = [...data.agents.filter((a) => !a.builtin).map((a) => ({ a, added: true })), ...data.presets.map((a) => ({ a, added: false }))];
  const status = (a: AgentDef, added: boolean) =>
    a.installed ? (added ? 'Ready: sign in to it once in its own program' : 'On this computer') : added ? (installs(a) ? 'Installing…' : `Install it: ${a.hint}`) : installs(a) ? 'The app installs it' : `Install it first: ${a.hint}`;
  // Two to a row, so all of them fit the page.
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(({ a, added }) => (
        <div key={a.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-panel/70 px-3.5 py-2.5 ring-1 ring-line">
          <AgentIcon agent="acp" name={a.name} size={20} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium text-fg">{a.name}</div>
            <div className="truncate text-[12px] text-fg-3" title={status(a, added)}>
              {status(a, added)}
            </div>
          </div>
          {added ? (
            <Connected label="Added" />
          ) : (
            <Button size="sm" variant="secondary" className="rounded-full" icon={<Plus size={13} />} onClick={() => add(a)}>
              Add
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function NotifySetup() {
  const [st, setSt] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState()
      .then(setSt)
      .catch(() => setSt('unsupported'));
  }, []);
  if (st === null) return null;
  if (st === 'on' || st === 'app')
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-fg-2">
        <Check size={14} className="text-ok" /> Notifications are on for this device
      </div>
    );
  if (st === 'unsupported' || st === 'denied')
    return (
      <div className="text-[12.5px] text-balance text-fg-3">
        {st === 'denied' ? 'Notifications are blocked for this site; allow them in the browser’s settings first.' : 'This browser can’t show notifications here. On an iPhone, add the app to your Home Screen first.'}
      </div>
    );
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={<Bell size={14} />}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          setSt(await enablePush());
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      Turn on notifications
    </Button>
  );
}

/** First things to try: each puts its words in the message box (and, at the end, ends the tour there). */
/** The assistants found, and the button that opens Bring in over the tour (the dialog lists what would come first). */
function BringInStep() {
  const found = useTour((s) => s.found);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {found.map((n) => (
          <span key={n} className="rounded-full border border-line bg-bg-1 px-3 py-1 text-[13px] text-fg-2" translate="no">
            {n}
          </span>
        ))}
      </div>
      <div>
        <Button variant="secondary" icon={<Import size={15} />} onClick={() => useTour.setState({ bringIn: true })}>
          Bring in what they know
        </Button>
      </div>
    </div>
  );
}

const FIRST_TASKS = ['Plan a 3-day trip to Lisbon in May', 'Sum up a PDF I drop in', 'Make a budget spreadsheet for a small café'];

function TryThese({ finish }: { finish?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-fg-3">{finish ? 'Start with one of these:' : 'Try it: put one in the box'}</div>
      <div className="flex flex-wrap gap-1.5">
        {FIRST_TASKS.map((t) => (
          <button
            key={t}
            type="button"
            className="tour-try"
            onClick={(e) => {
              // The words as they show, in the app's language.
              tryWords(e.currentTarget.textContent?.trim() || t);
              if (finish) endTour(true);
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the dot by each session means, moving as it does in the list. */
function DotsLegend() {
  return (
    <div className="grid gap-1.5 text-[13px] text-fg-2">
      {(
        [
          ['bg-busy breathe', 'Working on it'],
          ['bg-warn', 'Needs you: a question, or a yes or no'],
          ['bg-ok', 'Done'],
        ] as const
      ).map(([c, t]) => (
        <span key={t} className="flex items-center gap-2.5">
          <span className={cx('h-2.5 w-2.5 shrink-0 rounded-full', c)} />
          {t}
        </span>
      ))}
    </div>
  );
}

// ---- the steps ----------------------------------------------------------------------------

/** "a, b or c" */
const either = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : (xs[0] ?? ''));

function steps(uses: Use[], fresh: boolean, found: string[]): Step[] {
  const has = (u: Use) => uses.includes(u);
  const claude = has('claude');
  const codex = has('codex');
  const cli = claude || codex;
  const models = has('openrouter') || has('local');
  const list: Step[] = [];
  if (!fresh)
    list.push({
      id: 'welcome',
      title: 'Welcome to Hydor',
      body: 'AI helpers, called agents, that do real work on this computer: they read and write files, search the web, make documents and write code.',
      scene: () => (
        <div className="flex w-full flex-col items-center gap-8">
          <span className="max-lg:hidden">
            <TideMark size={84} />
          </span>
          <WelcomeFilm />
        </div>
      ),
      next: 'Let’s set it up',
      Extra: () => (
        <div className="grid gap-4">
          <Point icon={<MessageSquareText size={17} />} title="Ask in your own words">
            Like “sum up this report” or “plan a weekend in Rome”.
          </Point>
          <Point icon={<ListChecks size={17} />} title="Watch it work">
            Every step shows as it happens, at your desk or on your phone.
          </Point>
          <Point icon={<ShieldCheck size={17} />} title="You stay in charge">
            It asks before anything you haven’t allowed, and stops when you say.
          </Point>
        </div>
      ),
    });
  list.push({
    id: 'choose',
    title: 'What should do the work?',
    body: 'Pick one or more, and add others later. Already pay for Claude or ChatGPT? Start with that. Not sure? Pay as you go suits everyone.',
    scene: (u) => <SourcesMap on={u} />,
    Extra: UsesPicker,
    ready: (u) => u.length > 0,
  });
  if (cli)
    list.push({
      id: 'accounts',
      title: claude && codex ? 'Sign in to your plans' : claude ? 'Sign in to Claude' : 'Sign in to ChatGPT',
      body:
        claude && codex
          ? 'Hydor uses the plans you already pay for, so there is nothing more to pay. Sign in once to each, and they work on every device.'
          : 'Hydor uses the plan you already pay for, so there is nothing more to pay. Sign in once, and it works on every device.',
      scene: (u) => <SourcesMap on={u} focus={['claude', 'codex']} />,
      Extra: AccountsSetup,
    });
  if (has('openrouter'))
    list.push(
      {
        id: 'openrouter',
        title: 'Pay as you go',
        body: 'OpenRouter is one account for AI models from every company. Add a little credit there, and pay only for what you use: often cents a task.',
        scene: (u) => <SourcesMap on={u} focus="openrouter" />,
        Extra: TourOpenRouter,
      },
      {
        id: 'media',
        title: 'Pictures, music, voices and videos',
        body: 'The same account lets any agent make these. Ask for “a logo for my bakery” or “a calm piano tune”, and see the price before it starts.',
        scene: (u) => <SourcesMap on={u} focus="openrouter" />,
        Extra: TourMedia,
      },
    );
  if (has('local'))
    list.push({
      id: 'local',
      title: 'Free AI on this computer',
      body: 'These run right here, so nothing you do leaves your computer, and they cost nothing to use. Pick one that runs well on yours.',
      scene: (u) => <SourcesMap on={u} focus="local" />,
      Extra: TourLocal,
    });
  if (has('agents'))
    list.push({
      id: 'agents',
      title: 'Other agents',
      body: 'Agents you already use, such as Gemini CLI or Goose, work here too. The app installs those it knows; each asks you to sign in once.',
      scene: (u) => <SourcesMap on={u} focus="agents" />,
      Extra: AgentsSetup,
    });
  // Another assistant's folder is here: one step offers its memory and skills, before the tour moves into the app.
  if (found.length)
    list.push({
      id: 'bring-in',
      title: 'Coming from another agent?',
      body: 'Hydor found these on this computer. Bring over what they know about you, and the skills you made, in one step. You see everything first, and nothing is added until you pick.',
      scene: () => (
        <div className="flex w-full justify-center">
          <TideMark size={84} />
        </div>
      ),
      Extra: BringInStep,
    });
  const names = [claude && 'Claude Code', codex && 'Codex', models && 'Custom with your models', has('agents') && 'the agents you added'].filter((x): x is string => !!x);
  // The app arrives in this order, the message box before the row under it.
  list.push(
    {
      id: 'composer',
      target: 'composer',
      route: '/',
      icon: <MessageSquareText size={16} />,
      title: 'Ask for anything',
      body: 'Write what you want done and press Enter: an agent gets to work. Drop in files and pictures too. Each conversation is called a session.',
      Extra: () => <TryThese />,
    },
    {
      id: 'start-bar',
      target: 'start-bar',
      focus: 'composer',
      route: '/',
      icon: <SlidersHorizontal size={16} />,
      title: 'Choose who does it, and where',
      body: `Under the box: the agent that does the work${names.length ? ` (${either(names)})` : ''}, the AI model it thinks with, and the folder on this computer it may use. What you pick stays for next time.`,
    },
    {
      id: 'pickers',
      target: 'pickers',
      focus: 'composer',
      route: '/',
      icon: <ShieldCheck size={16} />,
      title: 'Decide how much it may do',
      body: cli
        ? 'Options sets what the agent may do without asking you, from checking with you before every change to working on its own, and how hard it thinks. Change it any time.'
        : 'Options sets what the agent may do without asking you, from checking with you before every change to working on its own. Change it any time.',
    },
    {
      id: 'sessions',
      target: 'sessions',
      sidebar: true,
      icon: <MessagesSquare size={16} />,
      title: 'Your sessions',
      body: 'Every conversation is listed here, and keeps going when you close the page. The dot beside each one says how it is doing:',
      Extra: DotsLegend,
    },
    {
      id: 'tools',
      target: 'tools',
      sidebar: true,
      icon: <LayoutGrid size={16} />,
      title: 'Everything else',
      body: 'Library keeps what agents made for you, Apps the tasks you run again and again, Usage what your plans have left, System this computer’s files, and Help the guide to every part of the app.',
    },
    {
      id: 'notify',
      target: 'nav-settings',
      sidebar: true,
      icon: <Bell size={16} />,
      title: 'Hear when it’s done',
      body: 'Get a notification when an agent finishes or needs you, even with the app closed. Settings holds this, and everything else you can change.',
      Extra: NotifySetup,
    },
    {
      id: 'done',
      icon: <Check size={16} />,
      title: 'You’re all set',
      body: 'Agents are ready to help. Help (?) explains every part of the app, and short tips will show you the rest as you go.',
      width: 420,
      next: 'Get started',
      Extra: () => <TryThese finish />,
    },
  );
  return list;
}

// The new install's first screen counts the tour's steps without the tour (setup.ts): checked here while developing.
if (import.meta.env.DEV && steps([], true, []).length + 1 !== TOUR_SETUP_STEPS)
  console.warn(`TOUR_SETUP_STEPS is ${TOUR_SETUP_STEPS} in tour/setup.ts, but a new install's tour has ${steps([], true, []).length + 1} steps`);

// ---- the overlay ----------------------------------------------------------------------------

const PAD = 6;
const GAP = 16;
const EDGE = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the card goes: beside the target (right of the sidebar, else below or above), else in the middle. */
function placeCard(r: DOMRect | null, w: number, h: number, mobile: boolean, sidebar?: boolean): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!r) return { left: (vw - w) / 2, top: clamp((vh - h) / 2, EDGE, vh - EDGE - h) };
  const below = r.bottom + PAD + GAP;
  const above = r.top - PAD - GAP - h;
  if (mobile) {
    if (below + h <= vh - EDGE) return { left: EDGE, top: below };
    if (above >= EDGE) return { left: EDGE, top: above };
    return { left: EDGE, top: vh - EDGE - h };
  }
  const right = r.right + PAD + GAP;
  if (sidebar && right + w <= vw - EDGE) return { left: right, top: clamp(r.top + r.height / 2 - h / 2, EDGE, vh - EDGE - h) };
  const left = clamp(r.left + r.width / 2 - w / 2, EDGE, vw - EDGE - w);
  if (below + h <= vh - EDGE) return { left, top: below };
  if (above >= EDGE) return { left, top: above };
  if (right + w <= vw - EDGE) return { left: right, top: clamp(r.top, EDGE, vh - EDGE - h) };
  return { left, top: vh - EDGE - h };
}

/** A target's box with room around it. */
const around = (r: DOMRect): Box => ({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 });

/** Elements' boxes where they come to rest: whatever is moving them in (their own entrance or one around them, the
 * sidebar sliding in, the drawer opening) is taken to its end for the reading and put back as it was. So the light
 * and the card go straight to a part's place, instead of following it there. */
function settled(els: Element[]): DOMRect[] {
  const moving = document.getAnimations().flatMap((a) => {
    const fx = a.effect;
    if (a.playState !== 'running' || typeof a.currentTime !== 'number' || !(fx instanceof KeyframeEffect) || fx.pseudoElement || !els.some((el) => fx.target?.contains(el))) return [];
    const { endTime, activeDuration } = fx.getComputedTiming();
    // A hair short of the end, which looks the same: a transition taken right to it would finish.
    return typeof endTime === 'number' && Number.isFinite(endTime) && typeof activeDuration === 'number' ? [{ a, now: a.currentTime, end: endTime - activeDuration / 1000 }] : [];
  });
  for (const m of moving) m.a.currentTime = m.end;
  const boxes = els.map((el) => el.getBoundingClientRect());
  for (const m of moving) m.a.currentTime = m.now;
  return boxes;
}

/** How long a step waits for its target to show before its card goes to the middle. */
const WAIT = 800;

/** A box a step of the way to where it is going, there once close. */
function glide(cur: Box | null, goal: Box, k: number): Box {
  if (!cur) return goal;
  const b: Box = { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, w: cur.w + (goal.w - cur.w) * k, h: cur.h + (goal.h - cur.h) * k };
  return Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y) + Math.abs(b.w - goal.w) + Math.abs(b.h - goal.h) < 0.5 ? goal : b;
}

/** The dimmed page with a rounded hole where the target is. */
function holePath(b: Box): string {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const w = Math.round(b.w);
  const h = Math.round(b.h);
  if (w < 2 || h < 2) return 'none';
  const r = Math.min(14, w / 2, h / 2);
  return `path(evenodd, "M0 0H${vw}V${vh}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`;
}

const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * A setup step: the whole screen, over the app that is not there yet. Its picture on the left, its words on the right,
 * each starting in the same place on every page, and all of it fits the screen (only a window too small for a page
 * scrolls its words); on a narrow screen the words alone, but for the welcome's picture above them. Back, where the
 * tour stands and Next stay put at the foot, over the sea, whose waves drift slowly and rise a little with each step.
 * The page goes (out) as the app comes in or the tour closes; a new install's first one follows the password screen
 * with no change between them.
 */
function TourPage(p: {
  list: Step[];
  /** The step shown. */
  k: number;
  fresh: boolean;
  uses: Use[];
  out: boolean;
  now?: boolean;
  ready: boolean;
  /** None while it goes: its buttons are still. */
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { list, k, fresh, out, ready } = p;
  const step = list[k];
  const phone = useIsMobile();
  const [still] = useState(p.now);
  const scroller = useRef<HTMLDivElement>(null);
  // The words stay above the buttons, never under them.
  const foot = useRef<HTMLDivElement>(null);
  const [footH, setFootH] = useState(phone ? 132 : 104);
  useLayoutEffect(() => {
    const f = foot.current;
    if (!f) return;
    const measure = () => setFootH(f.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(f);
    return () => ro.disconnect();
  }, []);
  // Each step starts at its top. (In braces: newer browsers return a promise from scrollTo, which React would take for
  // the effect's cleanup and call.)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [k]);
  const Extra = step.Extra;
  const pages = list.findIndex((s) => !!s.target);
  const at = k + (fresh ? 1 : 0);
  const total = list.length + (fresh ? 1 : 0);
  const where = ready ? <TourProgress at={at} total={total} /> : <span className="text-[12.5px] text-fg-3">Pick one or more</span>;
  const back = (
    <Button variant="ghost" className="h-10 rounded-xl px-3.5 text-[14px]" onClick={k > 0 ? p.onBack : p.onSkip} title={k > 0 ? undefined : 'No tour, and no tips later'}>
      {k > 0 ? 'Back' : phone ? 'Skip' : 'Skip the tour'}
    </Button>
  );
  const next = (
    <Button ref={p.nextRef} variant="primary" className={cx('gap-2 rounded-xl px-5', phone ? 'h-11 flex-1 text-[15px]' : 'h-10 text-[14px]')} onClick={p.onNext} disabled={!ready}>
      {step.next ?? 'Next'}
      <ArrowRight size={16} />
    </Button>
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={out ? undefined : 'tour-title'}
      className={cx('tour-page fixed inset-0 overflow-hidden bg-bg', still && 'tour-page-now', out && 'tour-page-out pointer-events-none')}
    >
      <Sea level={pages > 0 ? Math.min(1, k / pages) : 0} />
      <div className="absolute top-[calc(var(--safe-top)+18px)] left-5 z-10 text-fg sm:top-6 sm:left-7">
        <Wordmark height={14} />
      </div>
      <button
        onClick={() => endTour()}
        className="absolute top-[calc(var(--safe-top)+12px)] right-3 z-10 rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-fg/[0.06] hover:text-fg sm:top-5 sm:right-5"
        aria-label="Close the tour"
        title="Close the tour (Esc)"
      >
        <X size={18} />
      </button>
      <div ref={scroller} className="tour-scroll absolute inset-x-0 top-0 overflow-y-auto overscroll-contain" style={{ bottom: footH }}>
        <div className="tour-stage mx-auto w-full max-w-[1060px] px-5 pt-[calc(var(--safe-top)+64px)] pb-8 sm:px-10 lg:pt-[clamp(76px,14vh,136px)]">
          <div key={step.id} className="flex w-full flex-col gap-6 lg:flex-row lg:items-start lg:gap-16">
            <div className={cx('tour-figure flex shrink-0 justify-center lg:w-[380px] lg:pt-1', step.id !== 'welcome' && 'max-lg:hidden')}>{step.scene?.(p.uses)}</div>
            <div className="min-w-0 flex-1 lg:max-w-[580px]">
              <div className="mb-2.5 text-[12px] font-medium tracking-[0.12em] text-fg-3 uppercase">{`Step ${at + 1} of ${total}`}</div>
              <h2 id={out ? undefined : 'tour-title'} className="text-[26px] leading-[1.15] font-semibold tracking-tight text-balance text-fg sm:text-[32px]">
                {step.title}
              </h2>
              <div className="mt-2.5 max-w-[34rem] text-[15px] leading-relaxed text-balance text-fg-2">{step.body}</div>
              {Extra && (
                <div className="mt-6">
                  <Extra />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div ref={foot} className="tour-foot absolute inset-x-0 bottom-0 z-[1]">
        {phone ? (
          <div className="px-5 pt-3 pb-[calc(var(--safe-bottom)+18px)]">
            <div className="mb-3.5 flex justify-center">{where}</div>
            <div className="flex items-center gap-2">
              {back}
              {next}
            </div>
          </div>
        ) : (
          <div className="relative mx-auto flex w-full max-w-[1060px] items-center justify-between px-10 pt-4 pb-[clamp(24px,5vh,56px)]">
            {back}
            <span className="absolute left-1/2 -translate-x-1/2">{where}</span>
            {next}
          </div>
        )}
      </div>
    </div>
  );
}

export function Tour() {
  const { open, closing, i, signIn, uses, fresh, found, bringIn } = useTour();
  // A dialog is open over the tour: the tour waits under it.
  const over = !!signIn || bringIn;
  const boot = useApp((s) => s.boot);
  const mobile = useIsMobile();
  const [loc] = useLocation();
  const list = useMemo(() => steps(uses, fresh, found), [uses, fresh, found]);
  const step = open ? list[Math.min(i, list.length - 1)] : undefined;
  // The step's target as last looked for: where it comes to rest, or null while it is not there.
  const [seen, setSeen] = useState<{ id: string; r: DOMRect | null } | null>(null);
  // The step whose target has been waited for long enough.
  const [waited, setWaited] = useState<string>();
  // Where the card is, and whether it glides from there: once it has come in (until then it has no place to glide
  // from, and its first one moves as it learns its size).
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const [glides, setGlides] = useState(false);
  const [inner, setInner] = useState<HTMLDivElement | null>(null);
  const [foot, setFoot] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ inner: 0, foot: 0 });
  const scrim = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const hole = useRef<Box | null>(null);
  const mark = useRef<Box | null>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const auto = useRef(false);
  // The steps before the first one in the app are pages.
  const pages = list.findIndex((s) => !!s.target);
  const onPage = i < pages;
  // A page stays a moment once the tour moves into the app (or closes), going as the app comes in.
  const [page, setPage] = useState<{ n: number; out: boolean } | null>(null);
  const pageNow = step && onPage && !closing ? i : null;
  if (pageNow !== null && (page?.n !== pageNow || page.out)) setPage({ n: pageNow, out: false });
  else if (pageNow === null && page && !page.out) setPage({ n: page.n, out: true });
  useEffect(() => {
    if (!page?.out) return;
    const t = setTimeout(() => setPage(null), 560);
    return () => clearTimeout(t);
  }, [page]);

  // The parts of the app shown so far: each step's own, and the sidebar around those in it.
  const shown = useMemo(() => [...new Set(list.slice(0, i + 1).flatMap((s) => (!s.target ? [] : s.sidebar ? ['sidebar', s.target] : [s.target])))].join(' '), [list, i]);
  useLayoutEffect(() => {
    if (open) build(closing ? `${shown} all` : shown);
  }, [open, closing, shown]);

  // The first visit (or the first after the tour changed) opens it on the home page; a new install goes on from its
  // password at once.
  useEffect(() => {
    if (auto.current || open) return;
    if (takeAfterSetup()) {
      auto.current = true;
      startTour(undefined, true);
      return;
    }
    // Another machine's pages never open it: the tour is about this app, seen on the main one.
    if (!boot || boot.tourSeen >= TOUR_VERSION || loc !== '/' || machineId) return;
    auto.current = true;
    startTour();
  }, [boot, loc, open]);

  // Put the page where the step's target is.
  useEffect(() => {
    if (!step || closing) return;
    if (step.route && location.pathname !== machineBase + step.route) go(step.route);
    const ui = useUI.getState();
    if (mobile) {
      if (!!step.sidebar !== ui.drawerOpen) ui.set({ drawerOpen: !!step.sidebar });
    } else if (step.target && !ui.sideOpen) ui.set({ sideOpen: true }); // there from the first part on, so the page keeps its place
    // The message box arrives with an agent picked from those chosen.
    if (step.route === '/') pickAgent(useTour.getState().uses);
  }, [step, mobile, closing]);

  // Follow the target (it may appear late, a page or the drawer opening, and move), and glide the hole after what is
  // in the light (the target, or the whole it is part of) and the ring after the target, to where they come to rest;
  // with no target both shut in the middle, and while one is still coming they stay where they are. The pages have no
  // light: it comes in where the app's first step points.
  useEffect(() => {
    if (!open) return;
    const id = step?.id ?? '';
    const t = setTimeout(() => setWaited(id), WAIT);
    let raf = 0;
    let last = performance.now();
    const since = last;
    let scrolled = false;
    let painted = '';
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const shut: Box = { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
      let lit: Box | null = shut;
      let ringed: Box | null = shut;
      if (step?.target && !over) {
        const el = document.querySelector(`[data-tour="${step.target}"]`);
        const whole = el && step.focus ? document.querySelector(`[data-tour="${step.focus}"]`) : null;
        const [r, w] = el ? settled(whole ? [el, whole] : [el]) : [];
        if (el && r && r.width > 0 && r.height > 0) {
          const f = whole && w && w.width > 0 && w.height > 0 ? w : r;
          if (!scrolled) {
            (whole ?? el).scrollIntoView({ block: 'nearest', inline: 'nearest' });
            scrolled = true;
          }
          lit = around(f);
          ringed = around(r);
          setSeen((p) => (p?.id === id && p.r && p.r.x === f.x && p.r.y === f.y && p.r.width === f.width && p.r.height === f.height ? p : { id, r: f }));
        } else {
          setSeen((p) => (p?.id === id && !p.r ? p : { id, r: null }));
          if (now - since < WAIT) lit = ringed = null;
        }
      }
      if (!scrim.current || !ring.current) {
        hole.current = mark.current = null;
        setSeen(null);
      } else if (lit && ringed) {
        const k = 1 - Math.exp(-dt / 85);
        const h = (hole.current = glide(hole.current, lit, k));
        const m = (mark.current = glide(mark.current, ringed, k));
        const key = [h.x, h.y, h.w, h.h, m.x, m.y, m.w, m.h].map((v) => v.toFixed(1)).join() + `,${innerWidth},${innerHeight}`;
        if (key !== painted) {
          painted = key;
          scrim.current.style.clipPath = holePath(h);
          const s = ring.current.style;
          s.transform = `translate(${m.x}px, ${m.y}px)`;
          s.width = `${m.w}px`;
          s.height = `${m.h}px`;
          s.opacity = m.w > 8 && m.h > 8 ? '1' : '0';
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open, step, over]);

  // The card grows and shrinks with what it holds.
  useLayoutEffect(() => {
    if (!inner || !foot) return;
    const measure = () => setSize({ inner: inner.offsetHeight, foot: foot.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    ro.observe(foot);
    return () => ro.disconnect();
  }, [inner, foot]);

  const ready = !step?.ready || step.ready(uses);
  const next = () => {
    if (!ready) return;
    if (step?.id === 'choose') {
      try {
        localStorage.setItem(USES_KEY, JSON.stringify(uses));
      } catch {}
      useTour.setState({ picked: true });
    }
    if (i >= list.length - 1) endTour(true);
    else useTour.setState({ i: i + 1 });
  };
  const back = () => i > 0 && useTour.setState({ i: i - 1 });

  useEffect(() => {
    if (!step || over || closing) return;
    const k = (e: KeyboardEvent) => {
      if (editable(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        endTour();
      } else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  // Enter goes on: the next button takes the focus at each step (and as the card comes in).
  const cardIn = !!at;
  useEffect(() => {
    if (step && !over) nextBtn.current?.focus({ preventScroll: true });
  }, [step?.id, over, cardIn]);

  if (!step) return null;

  // The step's target, where it comes to rest, once found.
  const target = seen?.id === step.id ? seen.r : null;
  // One still coming: the card stays where it is (out of sight once it is known to be missing) until it is found, or
  // a moment has gone by and it goes to the middle. It first comes in once it has a place.
  const coming = !!step.target && !target && waited !== step.id;
  const missing = coming && seen?.id === step.id;
  const w = mobile ? window.innerWidth - EDGE * 2 : (step.width ?? 372);
  const maxH = window.innerHeight - EDGE * 2;
  const want = size.inner + size.foot + 2;
  const h = size.inner ? Math.min(want, maxH) : 0;
  const place = onPage ? null : coming ? at : placeCard(target, w, h || 280, mobile, step.sidebar);
  if (place?.left !== at?.left || place?.top !== at?.top) setAt(place);
  if (!place && glides) setGlides(false);
  const Extra = step.Extra;
  // A new install's password screen was step 1.
  const total = list.length + (fresh ? 1 : 0);
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const last = i >= list.length - 1;
  return (
    <>
      {createPortal(
        // Under a sign-in's dialog while it is open.
        <div className={cx('fixed inset-0', over ? 'z-[45]' : 'z-[55]', closing && 'pointer-events-none')} onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
          {!onPage && (
            <>
              <div ref={scrim} className={cx('scrim tour-scrim pointer-events-none fixed inset-0', closing && 'opacity-0')} />
              {/* Out of sight until the light first lands. */}
              <div ref={ring} className={cx('tour-ring pointer-events-none fixed top-0 left-0 rounded-[14px] opacity-0', closing && 'invisible')} />
              {place && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="tour-title"
                  className={cx('tour-card fixed flex flex-col overflow-hidden rounded-[20px] border border-line-2 bg-elevated', closing && 'tour-card-out', missing && 'pointer-events-none opacity-0')}
                  onAnimationEnd={(e) => e.target === e.currentTarget && setGlides(true)}
                  style={{
                    left: place.left,
                    top: place.top,
                    width: w,
                    height: h || undefined,
                    transition: `${glides ? `left 520ms ${ease}, top 520ms ${ease}, ` : ''}width 420ms ${ease}, height 420ms ${ease}, opacity 200ms ease`,
                  }}
                >
                  <button
                    onClick={() => endTour()}
                    className="absolute top-3.5 right-3.5 z-10 rounded-md p-1 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
                    aria-label="Close the tour"
                    title="Close the tour (Esc)"
                  >
                    <X size={15} />
                  </button>
                  <div className="min-h-0 flex-1" style={{ overflowY: want > maxH ? 'auto' : 'hidden' }}>
                    <div ref={setInner} className="px-5 pt-5 pb-4">
                      {last && (
                        <div className="mb-6 flex justify-center pt-4">
                          <TideMark size={60} />
                        </div>
                      )}
                      <div className={cx('flex items-center gap-2.5 pr-7', last && 'justify-center pr-0')}>
                        {!last && <span className="tour-card-icon">{step.icon}</span>}
                        <h2 id="tour-title" className={cx('text-[17px] font-semibold tracking-tight text-fg', last && 'text-[20px]')}>
                          {step.title}
                        </h2>
                      </div>
                      <div className={cx('mt-2 text-[14px] leading-relaxed text-balance text-fg-2', last && 'text-center')}>{step.body}</div>
                      {Extra && (
                        <div className="mt-4">
                          <Extra />
                        </div>
                      )}
                    </div>
                  </div>
                  <div ref={setFoot} className="flex shrink-0 items-center gap-2 border-t border-line bg-bg-1/80 px-4 py-2.5">
                    <Button size="sm" variant="ghost" onClick={i > 0 ? back : () => endTour(false, true)} title={i > 0 ? undefined : 'No tour, and no tips later'}>
                      {i > 0 ? 'Back' : 'Skip the tour'}
                    </Button>
                    <span className="flex min-w-0 flex-1 justify-center">
                      <TourProgress at={i + (fresh ? 1 : 0)} total={total} />
                    </span>
                    <Button ref={nextBtn} size="sm" variant="primary" className="gap-1.5 rounded-lg" onClick={next} disabled={!ready}>
                      {step.next ?? 'Next'}
                      {!last && <ArrowRight size={14} />}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {page && (
            <TourPage
              list={list}
              k={page.n}
              fresh={fresh}
              uses={uses}
              out={page.out}
              now={fresh && page.n === 0}
              ready={page.out || ready}
              {...(!page.out && { onBack: back, onNext: next, onSkip: () => endTour(false, true), nextRef: nextBtn })}
            />
          )}
        </div>,
        document.body,
      )}
      {bringIn && <BringIn open onClose={() => useTour.setState({ bringIn: false })} />}
      {signIn && (
        <LoginDialog
          agent={signIn}
          open
          onClose={() => useTour.setState({ signIn: null })}
          onDone={() => useTour.setState((s) => ({ accountsRev: s.accountsRev + 1 }))}
        />
      )}
    </>
  );
}

/** Desktop: the ? in the bottom-right corner, while the sidebar is hidden: Help, the guide (with the tour). */
export function HelpButton() {
  return (
    <button
      onClick={() => go('/guide')}
      className="fixed right-4 bottom-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-elevated text-fg-2 shadow-lg transition-colors hover:text-fg"
      aria-label="Help"
      title="Help: the guide to every part of the app"
    >
      <CircleHelp size={18} />
    </button>
  );
}

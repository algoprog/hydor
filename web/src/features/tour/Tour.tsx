// The welcome tour. The first time someone opens the console (right after choosing a password on a
// new install), and whenever they press the ? button, it walks over the real screens: connecting the
// AI subscriptions first, then what each part of the app is for. A step points at an element marked
// data-tour="…" and dims everything else; a step without one shows in the middle of the screen.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { create } from 'zustand';
import { Bell, Check, CircleHelp, CornerDownLeft, Eye, FileDiff, GitFork, MessageSquareText, ShieldCheck, Smartphone, Sparkles, X } from 'lucide-react';
import type { AccountStatus, Agent } from '@shared/types';
import { api, post } from '../../lib/api';
import { MOD } from '../../lib/format';
import { go } from '../../lib/nav';
import { enablePush, pushState, type PushState } from '../../lib/notify';
import { toastError, useApp, useUI } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Button, cx, useIsMobile } from '../../components/ui';
import { LoginDialog } from '../settings/SettingsPage';
import { machineBase, machineId } from '../../lib/machine';

/** Raise it when the tour changes enough to be worth showing again to everyone. */
export const TOUR_VERSION = 1;

interface Step {
  id: string;
  /** The element pointed at: [data-tour="…"]. None: the card sits in the middle. */
  target?: string;
  title: string;
  body: ReactNode;
  /** Something to do right in the step. */
  Extra?: () => ReactNode;
  /** The page the target is on. */
  route?: string;
  /** The target is in the sidebar: shown first (the drawer, on phones). */
  sidebar?: boolean;
  wide?: boolean;
}

const useTour = create<{ open: boolean; i: number; signIn: Agent | null; accountsRev: number }>(() => ({ open: false, i: 0, signIn: null, accountsRev: 0 }));

/** Opens the tour, at its start or at one step. */
export function startTour(from?: string) {
  const i = from ? STEPS.findIndex((s) => s.id === from) : 0;
  useTour.setState({ open: true, i: Math.max(0, i), signIn: null });
}

/** A new install chose its password: the tour goes on from connecting the subscriptions. */
let afterSetup = false;
export const setupDone = () => {
  afterSetup = true;
};

function endTour() {
  useTour.setState({ open: false, signIn: null });
  if (useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
  const boot = useApp.getState().boot;
  if (boot && boot.tourSeen < TOUR_VERSION) useApp.getState().set({ boot: { ...boot, tourSeen: TOUR_VERSION } });
  post('/api/tour', { version: TOUR_VERSION }).catch(() => {});
}

// ---- things to do inside steps ----------------------------------------------------------

function Feature({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">{children}</span>
    </div>
  );
}

function AccountsSetup() {
  const rev = useTour((s) => s.accountsRev);
  const [acc, setAcc] = useState<Record<Agent, AccountStatus> | null>(null);
  useEffect(() => {
    api<Record<Agent, AccountStatus>>('/api/accounts')
      .then(setAcc)
      .catch(toastError);
  }, [rev]);
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {(['claude', 'codex'] as Agent[]).map((a) => {
        const s = acc?.[a];
        return (
          <div key={a} className="flex items-center gap-3 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bg-2">
              <AgentIcon agent={a} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium text-fg">{agentName(a)}</div>
              <div className="truncate text-[12px] text-fg-3">
                {!s
                  ? 'Checking…'
                  : s.loggedIn
                    ? `${s.email ?? 'Signed in'}${s.plan ? ` · ${s.plan}` : ''}`
                    : (s.error ?? (a === 'claude' ? 'Claude Pro, Max or Team, or an Anthropic Console account' : 'A ChatGPT plan: Plus, Pro, Business or Enterprise'))}
              </div>
            </div>
            {s &&
              (s.loggedIn ? (
                <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ok">
                  <Check size={14} /> Connected
                </span>
              ) : (
                <Button size="sm" variant="primary" onClick={() => useTour.setState({ signIn: a })}>
                  Sign in
                </Button>
              ))}
          </div>
        );
      })}
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
  if (st === 'on')
    return (
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
        <Check size={15} /> Notifications are on for this device
      </div>
    );
  if (st === 'unsupported' || st === 'denied')
    return (
      <div className="text-[12.5px] text-fg-3">
        {st === 'denied'
          ? 'Notifications are blocked for this site; allow them in the browser settings first.'
          : 'This browser can’t show notifications here. On an iPhone, add the app to your Home Screen first.'}
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

// ---- the steps ----------------------------------------------------------------------------

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Agent Console',
    body: 'Run Claude Code and Codex on this computer from any browser, at your desk or on your phone. This short tour connects your AI subscriptions and shows you around.',
    Extra: () => (
      <div className="space-y-2.5">
        <Feature icon={<Sparkles size={15} />}>Start a coding agent in any folder, with any model.</Feature>
        <Feature icon={<Eye size={15} />}>Follow its work live, approve what it asks, answer its questions.</Feature>
        <Feature icon={<Smartphone size={15} />}>Pick up on your phone, and get a notification when it’s done.</Feature>
      </div>
    ),
  },
  {
    id: 'accounts',
    title: 'Connect your AI subscriptions',
    body: 'Each agent works with your own plan. Sign in to at least one; you can change these later in Settings → Accounts.',
    Extra: AccountsSetup,
    wide: true,
  },
  {
    id: 'start-bar',
    target: 'start-bar',
    route: '/',
    title: 'Pick an agent and a folder',
    body: 'Choose Claude Code or Codex, and the folder on this computer it should work in. The CLAUDE.md / AGENTS.md button opens the standing instructions the agent reads there.',
  },
  {
    id: 'composer',
    target: 'composer',
    route: '/',
    title: 'Say what you want done',
    body: 'Describe a task, ask a question or paste an error. Drop in screenshots and files, type @ to point at a file, or / for the agent’s commands. Enter starts the session.',
  },
  {
    id: 'pickers',
    target: 'pickers',
    route: '/',
    title: 'Model, effort and permissions',
    body: 'Choose the model, from either company, and how hard it thinks. The shield sets what the agent may do without asking you first, from checking with you before every change to full access. Shift+Tab switches it.',
  },
  {
    id: 'sessions',
    target: 'sessions',
    sidebar: true,
    title: 'Every session, live',
    body: `All Claude Code and Codex sessions on this computer show up here, even ones open in VS Code or a terminal. The dot says what each one is doing: blue working, amber needs you, green done. ${MOD}K finds any of them.`,
  },
  {
    id: 'tools',
    target: 'tools',
    sidebar: true,
    title: 'Your computer, from anywhere',
    body: 'Files to browse and edit, Git to review and push changes, a Terminal that survives reloads, Usage for your plan limits and when they reset, and System for CPU, memory and GPUs.',
  },
  {
    id: 'notify',
    target: 'nav-settings',
    sidebar: true,
    title: 'Get notified',
    body: 'Hear when a session finishes or needs your answer, even with the app closed. Settings also holds your accounts, MCP servers, skills, plugins and instructions.',
    Extra: NotifySetup,
  },
  {
    id: 'session',
    title: 'Inside a session',
    body: 'Once a session starts:',
    Extra: () => (
      <div className="space-y-2.5">
        <Feature icon={<MessageSquareText size={15} />}>The agent’s messages read like a chat; its commands fold into small boxes you can open.</Feature>
        <Feature icon={<ShieldCheck size={15} />}>Approve or deny what it wants to do, and answer its questions.</Feature>
        <Feature icon={<CornerDownLeft size={15} />}>Message it while it works: your note joins the turn, or {MOD}Enter queues it for after.</Feature>
        <Feature icon={<GitFork size={15} />}>Fork a session, or hand it to the other agent with the whole conversation.</Feature>
        <Feature icon={<FileDiff size={15} />}>Review every file it changed. {MOD}F finds text in the conversation.</Feature>
        <div className="pt-1 text-[12.5px] text-fg-3">
          Take this tour again any time with the <CircleHelp size={13} className="inline -translate-y-px" /> button.
        </div>
      </div>
    ),
    wide: true,
  },
];

export const TOUR_STEP_COUNT = STEPS.length;

/** Where the tour stands: one dot per step. */
export function TourProgress({ at, total = STEPS.length, className }: { at: number; total?: number; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5', className)} aria-label={`Step ${at + 1} of ${total}`}>
      {Array.from({ length: total }, (_, n) => (
        <span key={n} className={cx('h-1.5 rounded-full transition-all duration-300', n === at ? 'w-4 bg-accent' : n < at ? 'w-1.5 bg-fg-3' : 'w-1.5 bg-line-2')} />
      ))}
    </div>
  );
}

// ---- the overlay ----------------------------------------------------------------------------

const PAD = 6;
const GAP = 14;
const EDGE = 16;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

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

export function Tour() {
  const { open, i, signIn } = useTour();
  const boot = useApp((s) => s.boot);
  const mobile = useIsMobile();
  const [loc] = useLocation();
  const step = open ? STEPS[i] : undefined;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [waited, setWaited] = useState(false);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const auto = useRef(false);

  // The first visit (or the first after the tour changed) opens it on the home page.
  useEffect(() => {
    // Another machine's pages never open it: the tour is about this app, seen on the main one.
    if (auto.current || !boot || boot.tourSeen >= TOUR_VERSION || open || loc !== '/' || machineId) return;
    auto.current = true;
    const from = afterSetup ? 'accounts' : undefined;
    afterSetup = false;
    const t = setTimeout(() => startTour(from), 600);
    return () => clearTimeout(t);
  }, [boot, loc, open]);

  // Put the page where the step's target is.
  useEffect(() => {
    if (!step) return;
    if (step.route && location.pathname !== machineBase + step.route) go(step.route);
    const ui = useUI.getState();
    if (step.sidebar) {
      if (mobile) ui.set({ drawerOpen: true });
      else if (!ui.sideOpen) ui.set({ sideOpen: true });
    } else if (mobile && ui.drawerOpen) ui.set({ drawerOpen: false });
  }, [step, mobile]);

  // Follow the target: it may appear late (a page or the drawer opening) and move.
  useEffect(() => {
    setRect(null);
    setWaited(false);
    if (!step?.target || signIn) return;
    let raf = 0;
    let scrolled = false;
    const t = setTimeout(() => setWaited(true), 800);
    const tick = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      if (el && r && r.width > 0 && r.height > 0) {
        if (!scrolled) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          scrolled = true;
        }
        setRect((p) => (p && p.x === r.x && p.y === r.y && p.width === r.width && p.height === r.height ? p : r));
      } else setRect(null);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [step, signIn]);

  useLayoutEffect(() => {
    if (!card) return;
    const measure = () => setSize({ w: card.offsetWidth, h: card.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [card]);

  useEffect(() => {
    if (!step || signIn) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        endTour();
      } else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });

  if (!step) return null;
  const last = i === STEPS.length - 1;
  const next = () => (last ? endTour() : useTour.setState({ i: i + 1 }));
  const back = () => i > 0 && useTour.setState({ i: i - 1 });

  // Signing in happens in its own dialog; the tour waits behind it.
  if (signIn)
    return (
      <LoginDialog
        agent={signIn}
        open
        onClose={() => useTour.setState({ signIn: null })}
        onDone={() => useTour.setState((s) => ({ accountsRev: s.accountsRev + 1 }))}
      />
    );

  const target = step.target ? rect : null;
  // Wait a moment for a target that is still appearing before falling back to the middle.
  const pending = !!step.target && !rect && !waited;
  const w = mobile ? window.innerWidth - EDGE * 2 : step.wide ? 440 : 360;
  const pos = placeCard(target, size.w || w, size.h || 240, mobile, step.sidebar);
  const Extra = step.Extra;

  return createPortal(
    <div className="fixed inset-0 z-[55]" onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
      {target ? (
        <div
          className="pointer-events-none fixed rounded-[14px] transition-all duration-300 ease-out"
          style={{
            left: target.left - PAD,
            top: target.top - PAD,
            width: target.width + PAD * 2,
            height: target.height + PAD * 2,
            // An accent outline around the target; everything else dimmed.
            boxShadow: '0 0 0 2px var(--accent), 0 0 0 6px var(--accent-soft), 0 0 0 9999px rgba(0, 0, 0, 0.62)',
          }}
        />
      ) : (
        <div className="anim-overlay pointer-events-none fixed inset-0 bg-black/60" />
      )}
      {!pending && (
        <div
          key={step.id}
          ref={setCard}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className="anim-pop fixed overflow-hidden rounded-2xl border border-line-2 bg-elevated shadow-lg transition-[left,top] duration-300 ease-out"
          style={{ left: pos.left, top: pos.top, width: w, maxHeight: `calc(100dvh - ${EDGE * 2}px)` }}
        >
          <div className="max-h-[calc(100dvh-100px)] overflow-y-auto px-5 pt-4 pb-4">
            <div className="mb-3 flex items-center gap-2">
              <TourProgress at={i} />
              <span className="flex-1" />
              <button onClick={endTour} className="-mr-1.5 rounded-md p-1 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg" aria-label="Close the tour" title="Close the tour (Esc)">
                <X size={15} />
              </button>
            </div>
            <h2 id="tour-title" className="text-[16.5px] font-semibold tracking-tight text-fg">
              {step.title}
            </h2>
            <div className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{step.body}</div>
            {Extra && (
              <div className="mt-3.5">
                <Extra />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line bg-bg-1 px-4 py-2.5">
            {i > 0 ? (
              <Button size="sm" variant="ghost" onClick={back}>
                Back
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={endTour}>
                Skip the tour
              </Button>
            )}
            <span className="flex-1" />
            <span className="tnum text-[12px] text-fg-3">
              {i + 1} of {STEPS.length}
            </span>
            <Button size="sm" variant="primary" onClick={next} autoFocus>
              {last ? 'Get started' : i === 0 ? 'Show me around' : 'Next'}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Desktop: the ? in the bottom-right corner that opens the tour again. */
export function HelpButton() {
  return (
    <button
      onClick={() => startTour()}
      className="fixed right-4 bottom-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-elevated text-fg-2 shadow-lg transition-colors hover:text-fg"
      aria-label="Take the tour"
      title="Take the tour"
    >
      <CircleHelp size={18} />
    </button>
  );
}

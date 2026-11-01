// The welcome tour. The first time someone opens the app (right after choosing a password on a new
// install), and whenever they start it again from Help, it asks what they want to use (Claude Code, Codex,
// models through OpenRouter or on this computer, other agents) and sets each of those up, on pages that
// fill the screen while the app behind is empty. Then it builds the app up as it shows it around: a step
// points at an element marked data-tour="…", which arrives as the step comes, with the rest of the page
// dimmed and blurred around it; whatever no step points at arrives when the tour ends. A step without a
// target after the pages shows in the middle of the screen.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { create } from 'zustand';
import { ArrowRight, Bell, Blocks, Check, CircleHelp, Cloud, CornerDownLeft, Cpu, Eye, FileDiff, FolderOpen, GitFork, MessageSquareText, Plus, ShieldCheck, Smartphone, X } from 'lucide-react';
import type { AccountStatus, AcpAgentDef, Agent, ClientInfo, ModelsState } from '@shared/types';
import { api, post } from '../../lib/api';
import { MOD } from '../../lib/format';
import { go } from '../../lib/nav';
import { saveStart, startSettings } from '../../lib/start';
import { enablePush, pushState, type PushState } from '../../lib/notify';
import { toastError, useApp, useUI } from '../../lib/store';
import { live } from '../../lib/ws';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { Button, cx, Throbber, useIsMobile } from '../../components/ui';
import { ARCH, NUGGET, TileGradients } from '../../components/Logo';
import { LoginDialog } from '../settings/SettingsPage';
import { shortGpu } from '../settings/ModelsSettings';
import { TourLocal, TourOpenRouter } from './TourModels';
import { machineBase, machineId } from '../../lib/machine';

/** Raise it when the tour changes enough to be worth showing again to everyone. */
export const TOUR_VERSION = 2;

/** What someone wants to use: the tour sets up those and leaves the rest out. */
export type Use = 'claude' | 'codex' | 'openrouter' | 'local' | 'agents';
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
  /** Its name in the list of steps beside the pages. */
  label: string;
  /** The element pointed at: [data-tour="…"]. It stays hidden until its step, so name it in styles.css
   * ("the tour builds the app up") too. None: the card sits in the middle. */
  target?: string;
  /** What stays in the light around the target, when that is only a part of it (the whole message box
   * for the row under it): the ring marks the target, the card keeps clear of this. */
  focus?: string;
  title: string;
  body: ReactNode;
  /** Something to do right in the step. */
  Extra?: () => ReactNode;
  /** The page the target is on. */
  route?: string;
  /** The target is in the sidebar: shown first (the drawer, on phones), and arriving with it. */
  sidebar?: boolean;
  /** The card's width on wider screens (a page's column is at least 520px). */
  width?: number;
  /** The welcome page's mark on top. */
  hero?: boolean;
  /** Next waits for this. */
  ready?: (uses: Use[]) => boolean;
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
  /** Gold dust where the tour was finished. */
  burst: { x: number; y: number; id: number } | null;
}

const useTour = create<TourState>(() => ({ open: false, closing: false, i: 0, signIn: null, accountsRev: 0, uses: [], picked: false, fresh: false, burst: null }));

let closeTimer = 0;
let builtTimer = 0;

/** The app builds up as the tour shows it: <html data-tour-build> names the parts shown so far, with
 * "all" as the tour ends, and the app is empty but for them (styles.css, "the tour builds the app up").
 * Null: the app is whole again. */
function build(parts: string | null) {
  if (parts === null) delete document.documentElement.dataset.tourBuild;
  else document.documentElement.dataset.tourBuild = parts;
}

/** Opens the tour, at its start or at one step. */
export function startTour(from?: string, fresh = false) {
  window.clearTimeout(closeTimer);
  window.clearTimeout(builtTimer);
  const saved = savedUses();
  const uses = saved ?? [];
  const i = from ? steps(uses, fresh).findIndex((s) => s.id === from) : 0;
  useTour.setState({ open: true, closing: false, i: Math.max(0, i), signIn: null, uses, picked: !!saved, fresh });
}

/** A new install chose its password: the tour goes on from what to use, and the app comes in empty. */
let afterSetup = false;
export const setupDone = () => {
  afterSetup = true;
  build('');
};

/** Closes the tour (fading) as the rest of the app arrives; finishing it sends gold dust from the
 * button and points at the message box. */
function endTour(finishedAt?: HTMLElement | null) {
  const s = useTour.getState();
  if (!s.open || s.closing) return;
  const r = finishedAt?.getBoundingClientRect();
  useTour.setState({ closing: true, signIn: null, burst: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, id: Date.now() } : s.burst });
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    useTour.setState({ open: false, closing: false });
    if (useUI.getState().drawerOpen) useUI.getState().set({ drawerOpen: false });
  }, 380);
  // Once the rest has arrived the app is itself again, and the message box glows, ready.
  window.clearTimeout(builtTimer);
  builtTimer = window.setTimeout(() => {
    build(null);
    if (r) invite();
  }, 1150);
  const boot = useApp.getState().boot;
  if (boot && boot.tourSeen < TOUR_VERSION) useApp.getState().set({ boot: { ...boot, tourSeen: TOUR_VERSION } });
  post('/api/tour', { version: TOUR_VERSION }).catch(() => {});
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

// ---- the app mark, arriving ------------------------------------------------------------------------

/** The app mark as Naget's film draws it: a speck of gold condenses into the nugget, the n is drawn
 * around it, and the nugget drops into place, where it glows. */
export function HeroMark({ size = 64 }: { size?: number }) {
  const id = useId();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="hero-glow" aria-hidden />
      <svg width={size} height={size} viewBox="0 0 512 512" className="relative" aria-hidden>
        <defs>
          <TileGradients id={id} />
        </defs>
        <rect className="hero-tile" x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}tile)`} stroke="rgba(0,0,0,0.10)" strokeWidth="8" />
        <path className="hero-arch" pathLength={1} d={ARCH} fill="none" stroke={`url(#${id}ink)`} strokeWidth="66" />
        <circle className="hero-nugget" {...NUGGET} fill={`url(#${id}gold)`} />
      </svg>
    </span>
  );
}

/** Soft light drifting behind the mark. */
export function Aurora({ className }: { className?: string }) {
  return (
    <div className={cx('aurora', className)} aria-hidden>
      <span />
      <span />
      <span />
    </div>
  );
}

/** Gold dust drifting in the light: a speck catches it now and then. */
const DUST = [
  { x: '27%', y: '26%', s: 5, d: 1500 },
  { x: '70%', y: '20%', s: 4, d: 2400 },
  { x: '76%', y: '66%', s: 6, d: 1900 },
  { x: '22%', y: '70%', s: 4, d: 3000 },
  { x: '60%', y: '84%', s: 3, d: 3600 },
  { x: '40%', y: '14%', s: 3, d: 4200 },
];

/** The welcome page's mark, drawing itself in the light, in line with the words under it. */
function TourHero() {
  return (
    <div className="relative mb-8 h-[76px] w-[76px]">
      <div className="pointer-events-none absolute -inset-x-[82px] -inset-y-[28px]" aria-hidden>
        {DUST.map((g, n) => (
          <span key={n} className="dust absolute rounded-full" style={{ left: g.x, top: g.y, width: g.s, height: g.s, animationDelay: `${g.d}ms` }} />
        ))}
      </div>
      <HeroMark size={76} />
    </div>
  );
}

/** Gold dust flying out from where the tour was finished. */
const BURST = Array.from({ length: 14 }, (_, n) => {
  const a = (n / 14) * Math.PI * 2 + (n % 2 ? 0.22 : 0);
  const d = [66, 48, 36][n % 3];
  return { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d), s: [7, 5, 4][n % 3], delay: (n % 4) * 30 };
});

function Burst() {
  const b = useTour((s) => s.burst);
  useEffect(() => {
    if (!b) return;
    const t = setTimeout(() => useTour.setState({ burst: null }), 1100);
    return () => clearTimeout(t);
  }, [b]);
  if (!b) return null;
  return createPortal(
    <div className="burst pointer-events-none fixed inset-0 z-[60]" aria-hidden>
      {BURST.map((p, n) => (
        <span key={`${b.id}-${n}`} style={{ left: b.x, top: b.y, width: p.s, height: p.s, animationDelay: `${p.delay}ms`, '--dx': `${p.dx}px`, '--dy': `${p.dy}px` } as CSSProperties} />
      ))}
    </div>,
    document.body,
  );
}

// ---- things to do inside steps ----------------------------------------------------------

/** One thing the app does, on the welcome page: a card, or a row on a phone. */
function Highlight({ icon, title, children, i }: { icon: ReactNode; title: string; children: ReactNode; i: number }) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-line bg-panel/70 p-4 sm:block" style={{ '--i': i } as CSSProperties}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">{icon}</span>
      <div className="min-w-0 sm:mt-3.5">
        <div className="text-[14px] font-medium text-fg">{title}</div>
        <div className="mt-1 text-[12.5px] leading-snug text-fg-3">{children}</div>
      </div>
    </div>
  );
}

function Feature({ icon, children, i }: { icon: ReactNode; children: ReactNode; i: number }) {
  return (
    <div className="flex items-start gap-3" style={{ '--i': i } as CSSProperties}>
      <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-bg-2 text-fg-2">{icon}</span>
      <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">{children}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-6 text-fg-3">
      <Throbber size={26} />
    </div>
  );
}

/** A plan as the CLIs name it ("max", "free"), as people read it. */
const planName = (p?: string) => (p ? p[0].toUpperCase() + p.slice(1) : '');

const Connected = ({ label = 'Connected' }: { label?: string }) => (
  <span className="anim-pop-in flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ok">
    <Check size={14} className="anim-draw" /> {label}
  </span>
);


const TILES: { id: Use; title: string; sub: string; icon: ReactNode }[] = [
  { id: 'claude', title: 'Claude Code', sub: 'With your Claude plan or an API key', icon: <AgentIcon agent="claude" size={18} /> },
  { id: 'codex', title: 'Codex', sub: 'With your ChatGPT plan', icon: <AgentIcon agent="codex" size={18} /> },
  { id: 'openrouter', title: 'Models through OpenRouter', sub: 'DeepSeek, Qwen, GLM, Kimi and hundreds more, paid per use', icon: <Cloud size={17} /> },
  { id: 'local', title: 'Models on this computer', sub: 'Open models on your own hardware, with Ollama or vLLM', icon: <Cpu size={17} /> },
  { id: 'agents', title: 'Other agents', sub: 'Gemini CLI, OpenCode, Qwen Code, Goose and more', icon: <Blocks size={17} /> },
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
    if (u === 'openrouter') return models.openrouter.keyHint ? `Key added${pinned ? ` · ${pinned} model${pinned > 1 ? 's' : ''}` : ''}` : null;
    if (u === 'local') {
      if (models.local.length) return `${models.local.length} model${models.local.length > 1 ? 's' : ''} here already`;
      const g = models.machine.gpus[0];
      return g ? `Open models on your ${shortGpu(g.name)}, with Ollama or vLLM` : 'Small open models on the processor, with Ollama';
    }
    return null;
  };
  return (
    <div className="stagger grid gap-3 sm:grid-cols-2">
      {TILES.map((t, n) => {
        const on = uses.includes(t.id);
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(t.id)}
            style={{ '--i': n } as CSSProperties}
            className={cx(
              'flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,translate,scale] duration-200 active:scale-[0.985]',
              on ? 'border-accent/50 bg-accent/[0.07]' : 'border-line bg-panel/70 hover:-translate-y-px hover:border-line-2 hover:bg-panel hover:shadow-md',
              t.id === 'agents' && 'sm:col-span-2',
            )}
          >
            <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors', on ? 'bg-accent/15 text-accent' : 'bg-bg-2 text-fg-2')}>{t.icon}</span>
            <span className="min-w-0 flex-1 pt-px">
              <span className="block text-[14px] leading-tight font-medium text-fg">{t.title}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-fg-3">{status(t.id) ?? t.sub}</span>
            </span>
            <span className={cx('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-200', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-2')}>
              {on && <Check size={11} strokeWidth={3.5} className="anim-draw" />}
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
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {agents.map((a) => {
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
                    ? `${s.email ?? 'Signed in'}${s.plan ? ` · ${planName(s.plan)}` : ''}`
                    : missing.includes(a)
                      ? 'Not on this computer yet: signing in installs it first'
                      : (s.error ?? (a === 'claude' ? 'Claude Pro, Max or Team, or an Anthropic Console account' : 'A ChatGPT plan: Plus, Pro, Business or Enterprise'))}
              </div>
            </div>
            {s &&
              (s.loggedIn ? (
                <Connected />
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
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
      {rows.map(({ a, added }) => (
        <div key={a.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <AgentIcon agent="acp" name={a.name} size={22} />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium text-fg">{a.name}</div>
            <div className="truncate text-[12px] text-fg-3">
              {a.installed ? (added ? 'Ready: sign in once in its own CLI' : 'Installed on this computer') : added ? (installs(a) ? 'Installing…' : `Install it: ${a.hint}`) : installs(a) ? 'The app installs it' : `Install it first: ${a.hint}`}
            </div>
          </div>
          {added ? (
            <Connected label="Added" />
          ) : (
            <Button size="sm" variant={a.installed ? 'primary' : 'secondary'} icon={<Plus size={13} />} onClick={() => add(a)}>
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
  if (st === 'on')
    return (
      <div className="anim-pop-in flex items-center gap-1.5 text-[13px] font-medium text-ok">
        <Check size={15} className="anim-draw" /> Notifications are on for this device
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

/** "a, b or c" */
const either = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : (xs[0] ?? ''));

function steps(uses: Use[], fresh: boolean): Step[] {
  const has = (u: Use) => uses.includes(u);
  const claude = has('claude');
  const codex = has('codex');
  const cli = claude || codex;
  const models = has('openrouter') || has('local');
  const cliNames = claude && codex ? 'Claude Code and Codex' : claude ? 'Claude Code' : 'Codex';
  const list: Step[] = [];
  if (!fresh)
    list.push({
      id: 'welcome',
      label: 'Welcome',
      hero: true,
      title: 'Welcome to Naget Agent',
      body: 'Run agents on this computer from any browser, at your desk or on your phone: Claude Code, Codex, open models and more, for code, research, documents and everyday tasks. This short tour sets up the ones you want and shows you around.',
      width: 440,
      Extra: () => (
        <div className="stagger grid gap-3 sm:grid-cols-3">
          <Highlight i={0} icon={<FolderOpen size={16} />} title="Any agent, any folder">
            Start one in any folder on this computer, with any model.
          </Highlight>
          <Highlight i={1} icon={<Eye size={16} />} title="Follow it live">
            Watch its work, approve what it asks and clarify.
          </Highlight>
          <Highlight i={2} icon={<Smartphone size={16} />} title="On your phone too">
            Pick up anywhere, and get a notification when it’s done.
          </Highlight>
        </div>
      ),
    });
  list.push({
    id: 'choose',
    label: 'What to use',
    title: 'What would you like to use?',
    body: 'Pick one or more. The tour sets up each, and Settings adds others any time.',
    Extra: UsesPicker,
    width: 620,
    ready: (u) => u.length > 0,
  });
  if (cli)
    list.push({
      id: 'accounts',
      label: claude && codex ? 'Subscriptions' : 'Sign in',
      title: claude && codex ? 'Connect your subscriptions' : `Sign in to ${cliNames}`,
      body:
        claude && codex
          ? 'Claude Code and Codex run on your own plans. Sign in to each here; Settings → Accounts changes them later.'
          : claude
            ? 'It runs on your Claude plan or an Anthropic API key. Sign in once; Settings → Accounts changes it later.'
            : 'It runs on your ChatGPT plan. Sign in once; Settings → Accounts changes it later.',
      Extra: AccountsSetup,
      width: 460,
    });
  if (has('openrouter'))
    list.push({
      id: 'openrouter',
      label: 'OpenRouter',
      title: 'Models through OpenRouter',
      body: 'Hundreds of models through one key. Custom, the app’s own agent, runs them with the same tools, skills and MCP servers as the other agents.',
      Extra: TourOpenRouter,
      width: 560,
    });
  if (has('local'))
    list.push({
      id: 'local',
      label: 'On this computer',
      title: 'Models on this computer',
      body: 'Custom, the app’s own agent, runs open models on your own hardware, and nothing leaves it. Search Hugging Face: each model shows how it would run here before anything downloads.',
      Extra: TourLocal,
      width: 560,
    });
  if (has('agents'))
    list.push({
      id: 'agents',
      label: 'More agents',
      title: 'More agents',
      body: 'Agents that speak ACP run here too. Add the ones you use: the app installs those it knows, and each signs in once in its own CLI.',
      Extra: AgentsSetup,
      width: 480,
    });
  const names = [claude && 'Claude Code', codex && 'Codex', models && 'Custom with your models', has('agents') && 'the agents you added'].filter((x): x is string => !!x);
  // Where the models come from, said beside the model.
  const modelFrom =
    cli && models
      ? ' (from your plans or your own)'
      : cli && claude && codex
        ? ' (from either company)'
        : models
          ? ` (${has('openrouter') && has('local') ? 'the OpenRouter models you added or the ones on this computer' : has('openrouter') ? 'any of the OpenRouter models you added' : 'one of those on this computer'})`
          : '';
  // The app arrives in this order, the message box before the row under it.
  list.push(
    {
      id: 'composer',
      label: 'The message box',
      target: 'composer',
      route: '/',
      title: 'Say what you want done',
      body: 'Describe a task, ask a question or paste an error. Drop in screenshots and files, type @ to point at a file, or / for the agent’s commands. Enter starts the session.',
    },
    {
      id: 'start-bar',
      label: 'Agent and folder',
      target: 'start-bar',
      focus: 'composer',
      route: '/',
      title: 'Pick an agent and a folder',
      body: `Under the message box: the agent${names.length ? ` (${either(names)})` : ''}, its model${modelFrom}, the folder on this computer it works in, and the assistant it starts as. What you pick stays for next time. The folder’s menu also opens the AGENTS.md or CLAUDE.md the agent reads there.`,
    },
    {
      id: 'pickers',
      label: 'Options',
      target: 'pickers',
      focus: 'composer',
      route: '/',
      title: cli ? 'Effort, permissions and more' : 'Permissions and more',
      body: `Options holds ${cli ? 'how hard the model thinks, ' : ''}permissions, memory and a spending cap, and names any you change. Permissions set what the agent may do without asking you first, from checking with you before every change to full access. Shift+Tab switches them.`,
    },
    {
      id: 'sessions',
      label: 'Sessions',
      target: 'sessions',
      sidebar: true,
      title: 'Every session, live',
      body: `${cli ? `All ${cliNames} sessions on this computer show up here, even ones open in VS Code or a terminal.` : 'Every session you start shows up here, and keeps going when you close the page.'} The dot says what each one is doing: blue working, amber needs you, green done. ${MOD}K finds any of them.`,
    },
    {
      id: 'tools',
      label: 'Tools',
      target: 'tools',
      sidebar: true,
      title: 'Your computer, from anywhere',
      body: `Files to browse and edit, Git to review and push changes, a Terminal that survives reloads${cli ? ', Usage for your plan limits and when they reset,' : ''} and System for CPU, memory and GPUs.`,
    },
    {
      id: 'notify',
      label: 'Notifications',
      target: 'nav-settings',
      sidebar: true,
      title: 'Get notified',
      body: 'Hear when a session finishes or needs your answer, even with the app closed. Settings also holds your accounts, models, MCP servers, skills and the guidelines every agent follows.',
      Extra: NotifySetup,
    },
    {
      id: 'session',
      label: 'Inside a session',
      title: 'Inside a session',
      body: 'Once a session starts:',
      width: 440,
      Extra: () => (
        <div className="stagger space-y-2.5">
          <Feature i={0} icon={<MessageSquareText size={15} />}>
            The agent’s messages read like a chat; its commands fold into small boxes you can open.
          </Feature>
          <Feature i={1} icon={<ShieldCheck size={15} />}>
            Approve or deny what it wants to do, and answer its questions.
          </Feature>
          <Feature i={2} icon={<CornerDownLeft size={15} />}>
            Message it while it works: your note joins the turn, or {MOD}Enter queues it for after.
          </Feature>
          {cli && (
            <Feature i={3} icon={<GitFork size={15} />}>
              {claude && codex ? 'Fork a session, or hand it to the other agent with the whole conversation.' : 'Fork a session to try another way.'}
            </Feature>
          )}
          <Feature i={4} icon={<FileDiff size={15} />}>
            Review every file it changed. {MOD}F finds text in the conversation.
          </Feature>
          <div className="pt-1 text-[12.5px] text-fg-3" style={{ '--i': 5 } as CSSProperties}>
            Help (<CircleHelp size={13} className="inline -translate-y-px" />) explains every part of the app, and takes you on this tour again.
          </div>
        </div>
      ),
    },
  );
  return list;
}

/** Steps of a new install's tour before anything is picked, the password included. */
export const TOUR_SETUP_STEPS = steps([], true).length + 1;

/** Where the tour stands: one dot per step. */
export function TourProgress({ at, total, className }: { at: number; total: number; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1.5', className)} aria-label={`Step ${at + 1} of ${total}`}>
      {Array.from({ length: total }, (_, n) => (
        <span key={n} className={cx('h-1.5 rounded-full transition-all duration-500 ease-out', n === at ? 'w-4 bg-accent' : n < at ? 'w-1.5 bg-fg-3' : 'w-1.5 bg-line-2')} />
      ))}
    </div>
  );
}

// ---- the overlay ----------------------------------------------------------------------------

const PAD = 6;
const GAP = 14;
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

/** A box a step of the way to where it is going, there once close. */
function glide(cur: Box | null, goal: Box, k: number): Box {
  if (!cur) return goal;
  const b: Box = { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, w: cur.w + (goal.w - cur.w) * k, h: cur.h + (goal.h - cur.h) * k };
  return Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y) + Math.abs(b.w - goal.w) + Math.abs(b.h - goal.h) < 0.5 ? goal : b;
}

/** The dimmed, blurred page with a rounded hole where the target is. */
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

/** A setup step: the whole screen, over the app that is not there yet. Its words start in the same place
 * every step, and Back, where the tour stands and Next stay put at the foot of the screen; a long step
 * scrolls under them, seen through frosted glass. It dissolves (out) as the app comes in or the tour
 * closes; a new install's first one follows the password screen without a fade. */
function TourPage(p: {
  list: Step[];
  /** The step shown. */
  k: number;
  fresh: boolean;
  /** The way the tour moved: forward 1, back -1. */
  dir: number;
  out: boolean;
  now?: boolean;
  ready: boolean;
  /** None while it dissolves: its buttons are still. */
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
  const end = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  // Room under the words for the buttons, and whether the words run on under them (models found).
  const [footH, setFootH] = useState(96);
  const [under, setUnder] = useState(false);
  useEffect(() => {
    const s = scroller.current;
    const f = foot.current;
    const e = end.current;
    if (!s || !f || !e) return;
    const check = () => {
      setFootH(f.offsetHeight);
      setUnder(e.getBoundingClientRect().top > f.getBoundingClientRect().top + 1);
    };
    check();
    s.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(s);
    ro.observe(f);
    if (s.firstElementChild) ro.observe(s.firstElementChild);
    return () => {
      s.removeEventListener('scroll', check);
      ro.disconnect();
    };
  }, []);
  // Each step starts at its top. (In braces: newer browsers return a promise from scrollTo, which React
  // would take for the effect's cleanup and call.)
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [k]);
  const Extra = step.Extra;
  const column = 'mx-auto w-full max-w-[760px] px-5 sm:px-10 2xl:max-w-[840px]';
  const where = ready ? <TourProgress at={k + (fresh ? 1 : 0)} total={list.length + (fresh ? 1 : 0)} /> : <span className="text-[12.5px] text-fg-3">Pick one or more</span>;
  const back = (
    <Button variant="ghost" className="h-10 rounded-xl px-3.5 text-[14px]" onClick={k > 0 ? p.onBack : p.onSkip}>
      {k > 0 ? 'Back' : phone ? 'Skip' : 'Skip the tour'}
    </Button>
  );
  const next = (
    <Button ref={p.nextRef} variant="primary" className={cx('gap-2 rounded-xl px-5', phone ? 'h-11 flex-1 text-[15px]' : 'h-10 text-[14px]')} onClick={p.onNext} disabled={!ready}>
      {step.id === 'welcome' ? 'Show me around' : 'Next'}
      <ArrowRight size={16} />
    </Button>
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={out ? undefined : 'tour-title'}
      className={cx('tour-page fixed inset-0 bg-bg', still && 'tour-page-now', out && 'tour-page-out pointer-events-none')}
    >
      <Aurora className="aurora-page" />
      <button
        onClick={() => endTour()}
        className="absolute top-[calc(var(--safe-top)+12px)] right-3 z-10 rounded-lg p-1.5 text-fg-3 transition-colors hover:bg-fg/[0.06] hover:text-fg sm:top-5 sm:right-5"
        aria-label="Close the tour"
        title="Close the tour (Esc)"
      >
        <X size={18} />
      </button>
      <div ref={scroller} className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className={cx(column, 'pt-[calc(var(--safe-top)+64px)] sm:pt-[clamp(56px,14vh,160px)]')} style={{ paddingBottom: footH + 24 }}>
          <div key={step.id} className="tour-step" style={{ '--dx': `${p.dir * 22}px` } as CSSProperties}>
            {step.hero && <TourHero />}
            <h2 id={out ? undefined : 'tour-title'} className="text-[27px] leading-[1.15] font-semibold tracking-tight text-balance text-fg sm:text-[34px]" style={{ '--i': 0 } as CSSProperties}>
              {step.title}
            </h2>
            <div className="mt-3.5 max-w-[36rem] text-[15px] leading-relaxed text-pretty text-fg-2 sm:text-[16px]" style={{ '--i': 1 } as CSSProperties}>
              {step.body}
            </div>
            {Extra && (
              <div className="mt-9" style={{ '--i': 2 } as CSSProperties}>
                <Extra />
              </div>
            )}
          </div>
          <div ref={end} className="h-px" />
        </div>
      </div>
      <div
        ref={foot}
        className={cx(
          'absolute inset-x-0 bottom-0 z-[1] border-t transition-[background-color,border-color] duration-300',
          // Glass only while something runs under it: a backdrop blur kept on all the time can draw black
          // in Safari as the next step slides in.
          under ? 'border-line/70 bg-bg/60 backdrop-blur-lg' : 'border-transparent',
        )}
      >
        {phone ? (
          // The dots over the buttons, so neither moves with the words on them.
          <div className={cx(column, 'pt-3 pb-[calc(var(--safe-bottom)+20px)]')}>
            <div className="mb-3 flex justify-center">{where}</div>
            <div className="flex items-center gap-2">
              {back}
              {next}
            </div>
          </div>
        ) : (
          // Up off the bottom edge, at the same height on every step.
          <div className={cx(column, 'relative flex items-center justify-between pt-5 pb-[clamp(32px,12vh,140px)]')}>
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
  const { open, closing, i, signIn, uses, fresh } = useTour();
  const boot = useApp((s) => s.boot);
  const mobile = useIsMobile();
  const [loc] = useLocation();
  const list = useMemo(() => steps(uses, fresh), [uses, fresh]);
  const step = open ? list[Math.min(i, list.length - 1)] : undefined;
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [waited, setWaited] = useState(false);
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
  // A page stays a moment once the tour moves into the app (or closes), dissolving as the app comes in.
  const [page, setPage] = useState<{ n: number; out: boolean } | null>(null);
  const pageNow = step && onPage && !closing ? i : null;
  if (pageNow !== null && (page?.n !== pageNow || page.out)) setPage({ n: pageNow, out: false });
  else if (pageNow === null && page && !page.out) setPage({ n: page.n, out: true });
  useEffect(() => {
    if (!page?.out) return;
    const t = setTimeout(() => setPage(null), 380);
    return () => clearTimeout(t);
  }, [page]);
  // Which way the tour last moved: a page comes in from that side.
  const [move, setMove] = useState({ i, dir: 1 });
  if (move.i !== i) setMove({ i, dir: i > move.i ? 1 : -1 });

  // The parts of the app shown so far: each step's own, and the sidebar around those in it.
  const shown = useMemo(() => [...new Set(list.slice(0, i + 1).flatMap((s) => (!s.target ? [] : s.sidebar ? ['sidebar', s.target] : [s.target])))].join(' '), [list, i]);
  useLayoutEffect(() => {
    if (open) build(closing ? `${shown} all` : shown);
  }, [open, closing, shown]);

  // The first visit (or the first after the tour changed) opens it on the home page; a new install goes
  // on from its password at once.
  useEffect(() => {
    if (auto.current || open) return;
    if (afterSetup) {
      auto.current = true;
      afterSetup = false;
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

  // Follow the target (it may appear late, a page or the drawer opening, and move), and glide the hole
  // after what is in the light (the target, or the whole it is part of) and the ring after the target;
  // with no target both shut in the middle.
  useEffect(() => {
    if (!open) return;
    setRect(null);
    setWaited(false);
    const t = setTimeout(() => setWaited(true), 800);
    let raf = 0;
    let last = performance.now();
    let scrolled = false;
    let painted = '';
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const shut: Box = { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
      let lit = shut;
      let ringed = shut;
      if (step?.target && !signIn) {
        const el = document.querySelector(`[data-tour="${step.target}"]`);
        const r = el?.getBoundingClientRect();
        if (el && r && r.width > 0 && r.height > 0) {
          const whole = step.focus ? document.querySelector(`[data-tour="${step.focus}"]`) : null;
          const w = whole?.getBoundingClientRect();
          const f = whole && w && w.width > 0 && w.height > 0 ? w : r;
          if (!scrolled) {
            (whole ?? el).scrollIntoView({ block: 'nearest', inline: 'nearest' });
            scrolled = true;
          }
          lit = around(f);
          ringed = around(r);
          setRect((p) => (p && p.x === f.x && p.y === f.y && p.width === f.width && p.height === f.height ? p : f));
        } else setRect(null);
      }
      const k = 1 - Math.exp(-dt / 85);
      const h = (hole.current = glide(hole.current, lit, k));
      const m = (mark.current = glide(mark.current, ringed, k));
      const key = [h.x, h.y, h.w, h.h, m.x, m.y, m.w, m.h].map((v) => v.toFixed(1)).join() + `,${innerWidth},${innerHeight}`;
      if (key !== painted && scrim.current && ring.current) {
        painted = key;
        scrim.current.style.clipPath = holePath(h);
        const s = ring.current.style;
        s.transform = `translate(${m.x}px, ${m.y}px)`;
        s.width = `${m.w}px`;
        s.height = `${m.h}px`;
        s.opacity = m.w > 8 && m.h > 8 ? '1' : '0';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [open, step, signIn]);

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
    if (i >= list.length - 1) endTour(nextBtn.current);
    else useTour.setState({ i: i + 1 });
  };
  const back = () => i > 0 && useTour.setState({ i: i - 1 });

  useEffect(() => {
    if (!step || signIn || closing) return;
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

  // Enter goes on: the next button takes the focus at each step.
  useEffect(() => {
    if (step && !signIn) nextBtn.current?.focus({ preventScroll: true });
  }, [step?.id, signIn]);

  if (!step) return <Burst />;

  const target = step.target ? rect : null;
  // Wait a moment for a target that is still appearing before falling back to the middle.
  const pending = !!step.target && !rect && !waited;
  const w = mobile ? window.innerWidth - EDGE * 2 : (step.width ?? 360);
  const maxH = window.innerHeight - EDGE * 2;
  const want = size.inner + size.foot + 2;
  const h = size.inner ? Math.min(want, maxH) : 0;
  const pos = placeCard(target, w, h || 280, mobile, step.sidebar);
  const Extra = step.Extra;
  // A new install's password screen was step 1.
  const total = list.length + (fresh ? 1 : 0);
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  return (
    <>
      {createPortal(
        // Under a sign-in's dialog while it is open.
        <div className={cx('fixed inset-0', signIn ? 'z-[45]' : 'z-[55]', closing && 'pointer-events-none')} onPointerDown={(e) => e.target === e.currentTarget && e.preventDefault()}>
          {!onPage && (
            <>
              <div ref={scrim} className={cx('scrim tour-scrim pointer-events-none fixed inset-0', closing && 'opacity-0')} />
              <div ref={ring} className={cx('tour-ring pointer-events-none fixed top-0 left-0 rounded-[14px]', closing && 'invisible')}>
                {target && <span key={step.id} className="tour-ping" />}
              </div>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-title"
                className={cx('tour-card fixed flex flex-col overflow-hidden rounded-2xl border border-line-2 bg-elevated shadow-lg', closing && 'tour-card-out', pending && 'pointer-events-none opacity-0')}
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: w,
                  height: h || undefined,
                  transition: `left 520ms ${ease}, top 520ms ${ease}, width 420ms ${ease}, height 420ms ${ease}, opacity 200ms ease`,
                }}
              >
                <button
                  onClick={() => endTour()}
                  className="absolute top-3 right-3 z-10 rounded-md p-1 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
                  aria-label="Close the tour"
                  title="Close the tour (Esc)"
                >
                  <X size={15} />
                </button>
                <div className="min-h-0 flex-1" style={{ overflowY: want > maxH ? 'auto' : 'hidden' }}>
                  <div ref={setInner} className="px-5 pt-5 pb-4">
                    <div key={step.id} className="tour-rise">
                      <h2 id="tour-title" className="pr-7 text-[16.5px] font-semibold tracking-tight text-fg" style={{ '--i': 0 } as CSSProperties}>
                        {step.title}
                      </h2>
                      <div className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2" style={{ '--i': 1 } as CSSProperties}>
                        {step.body}
                      </div>
                      {Extra && (
                        <div className="mt-3.5" style={{ '--i': 2 } as CSSProperties}>
                          <Extra />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div ref={setFoot} className="flex shrink-0 items-center gap-2 border-t border-line bg-bg-1 px-4 py-2.5">
                  <Button size="sm" variant="ghost" onClick={i > 0 ? back : () => endTour()}>
                    {i > 0 ? 'Back' : 'Skip the tour'}
                  </Button>
                  <span className="flex min-w-0 flex-1 justify-center">
                    <TourProgress at={i + (fresh ? 1 : 0)} total={total} />
                  </span>
                  <Button ref={nextBtn} size="sm" variant="primary" className="gap-1.5" onClick={next} disabled={!ready}>
                    {i >= list.length - 1 ? 'Get started' : 'Next'}
                    {i < list.length - 1 && <ArrowRight size={14} />}
                  </Button>
                </div>
              </div>
            </>
          )}
          {page && (
            <TourPage
              list={list}
              k={page.n}
              fresh={fresh}
              dir={move.dir}
              out={page.out}
              now={fresh && page.n === 0}
              ready={page.out || ready}
              {...(!page.out && { onBack: back, onNext: next, onSkip: () => endTour(), nextRef: nextBtn })}
            />
          )}
        </div>,
        document.body,
      )}
      {signIn && (
        <LoginDialog
          agent={signIn}
          open
          onClose={() => useTour.setState({ signIn: null })}
          onDone={() => useTour.setState((s) => ({ accountsRev: s.accountsRev + 1 }))}
        />
      )}
      <Burst />
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

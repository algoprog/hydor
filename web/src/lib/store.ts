import { create } from 'zustand';
import type { AppTheme } from '@shared/themes';
import type { FolderOrigin } from '@shared/sidebar';
import type { TeamSettings, TierMap } from '@shared/tiers';
import type {
  AccountAgent,
  AcpAgentDef,
  Agent,
  AgentAccount,
  SessionPrefs,
  AgentUsage,
  LiveOverlay,
  LiveState,
  LoginFlow,
  NotifyEvent,
  ServerEvent,
  SessionSummary,
  StartSettings,
  SystemSample,
  TimelineItem,
  TimelinePage,
  UpdateState,
} from '@shared/types';
import type { ProgramStatus } from '@shared/programs';
import { api, enc, post } from './api';
import { stopRegistry, type Stop, type StopScope } from './stopping';
import { live } from './ws';
import { machineId, machineKey } from './machine';
import { useMachines } from './machines';
import { handleNotify } from './notify';
import { useNotes } from './notes';
import { emitFeatureEvent } from './featureEvents';
import { useSignIn } from '../features/accounts/signin';

// ---- toasts --------------------------------------------------------------------

export interface Toast {
  id: number;
  level: 'info' | 'error' | 'ok';
  text: string;
  /** A second, quieter line. */
  detail?: string;
  /** A button on the toast (Open, Undo); it closes the toast. */
  action?: { label: string; run: () => void };
  /** A session finished, failed or needs you: shown as a small card for that session. */
  notice?: ToastNotice;
  /** On its way out (it slips away before it is removed). */
  leaving?: boolean;
}

export interface ToastNotice {
  key: string;
  agent: Agent;
  kind: NotifyEvent['kind'];
  title: string;
  body?: string;
  /** The machine the session is on, when it is not the one the page shows. */
  machine?: string;
  open: () => void;
}

let toastSeq = 0;
/** Toasts under the pointer stay until it leaves. */
const held = new Set<number>();

export const useToasts = create<{
  list: Toast[];
  push: (level: Toast['level'], text: string, action?: Toast['action'], detail?: string) => number;
  /** One card per session: a newer notice replaces its last one. */
  notice: (n: ToastNotice) => number;
  dismiss: (id: number) => void;
  hold: (id: number, on: boolean) => void;
}>((set) => {
  const leave = (id: number) => {
    held.delete(id);
    set((s) => ({ list: s.list.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
    setTimeout(() => set((s) => ({ list: s.list.filter((t) => t.id !== id) })), 180);
  };
  const expire = (id: number, ms: number) => {
    setTimeout(() => (held.has(id) ? expire(id, 1500) : leave(id)), ms);
  };
  return {
    list: [],
    push: (level, text, action, detail) => {
      const id = ++toastSeq;
      set((s) => ({ list: [...s.list.slice(-3), { id, level, text, action, detail }] }));
      expire(id, action ? 8000 : level === 'error' ? 7000 : 3500);
      return id;
    },
    notice: (n) => {
      const id = ++toastSeq;
      const level = n.kind === 'failed' ? 'error' : n.kind === 'done' ? 'ok' : 'info';
      set((s) => ({ list: [...s.list.filter((t) => t.notice?.key !== n.key).slice(-3), { id, level, text: n.title, notice: n }] }));
      expire(id, n.kind === 'done' ? 8000 : 12000);
      return id;
    },
    dismiss: (id) => leave(id),
    hold: (id, on) => void (on ? held.add(id) : held.delete(id)),
  };
});
export const toast = (text: string, level: Toast['level'] = 'info') => useToasts.getState().push(level, text);
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'error');

// ---- app / auth -------------------------------------------------------------------

export interface Bootstrap {
  version: string;
  home: string;
  /** The app's own data folder (~/.hydor, or ~/.naget-agent or ~/.web-agent on older installs). */
  dataDir?: string;
  defaultCwd: string;
  /** Folders no one picks (task folders' place, apps' runs, worktrees, the temporary folder…); missing on older servers. */
  autoFolders?: string[];
  /** Names for folders that have one besides their own (a Codex project's, such as a ChatGPT project's folder); missing on older servers. */
  folderNames?: Record<string, string>;
  /** Folders two or more sessions worked in: where the sessions of those whose work began outside Hydor came from (empty for the rest); missing on older servers. */
  folderOrigins?: Record<string, FolderOrigin[]>;
  prefs: Record<string, SessionPrefs>;
  /** What the start page had picked last; missing on servers before it was kept. */
  start?: StartSettings;
  indexing: { done: number; total: number; running: boolean };
  /** The welcome tour version this user finished or skipped (0: never). */
  /** The machine's hostname. */
  host?: string;
  tourSeen: number;
  /** Themes the user made. */
  themes: AppTheme[];
  /** How far this copy is behind its git upstream (checked daily), and updating; missing when that cannot be told. */
  update?: UpdateState;
  /** Accounts added beside the agents' own sign-ins (Settings → Accounts). */
  accounts: AgentAccount[];
  /** Agents that speak ACP, set up in Settings → More agents. */
  acpAgents: AcpAgentDef[];
  /** Which model each tier means, and how sessions use the tiers (the start page's Automatic); missing on servers before the team. */
  tiers?: TierMap;
  team?: TeamSettings;
  /** Whether Claude Code and Codex are signed in here; missing when not known yet (and on older servers): both offered. */
  programs?: ProgramStatus;
}

export const useApp = create<{
  auth: 'unknown' | 'setup' | 'login' | 'ok';
  boot: Bootstrap | null;
  connected: boolean;
  indexing: Bootstrap['indexing'] | null;
  set: (p: Partial<{ auth: 'unknown' | 'setup' | 'login' | 'ok'; boot: Bootstrap | null; connected: boolean; indexing: Bootstrap['indexing'] | null }>) => void;
}>((set) => ({ auth: 'unknown', boot: null, connected: false, indexing: null, set: (p) => set(p) }));

// ---- sessions ------------------------------------------------------------------------

function sortKeys(byKey: Record<string, SessionSummary>): string[] {
  return Object.values(byKey)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .map((s) => s.key);
}

const upsertedAt = new Map<string, number>();
/** When each session left the list, so that a list read before that does not bring it back. */
const removedAt = new Map<string, number>();
/**
 * Sessions deleted from this page. Each leaves the list as you confirm and stays out: deleting a running one takes the
 * server a few seconds (its agent stops first), and what still arrives for it meanwhile is older than the delete.
 */
const deleted = new Set<string>();

/** Takes a session you are deleting off the list now (deleteSession, lib/flags.ts). */
export function markDeleted(key: string) {
  deleted.add(key);
  useSessions.getState().remove([key]);
}

/** The delete did not go through: the session is listed again. */
export function unmarkDeleted(key: string) {
  deleted.delete(key);
  useSessions.getState().load().catch(() => {});
}

export const useSessions = create<{
  byKey: Record<string, SessionSummary>;
  order: string[];
  loaded: boolean;
  total: number;
  load: () => Promise<void>;
  upsert: (list: SessionSummary[]) => void;
  remove: (keys: string[]) => void;
}>((set, get) => ({
  byKey: {},
  order: [],
  loaded: false,
  total: 0,
  load: async () => {
    const started = Date.now();
    const r = await api<{ sessions: SessionSummary[]; total: number }>('/api/sessions?limit=600');
    const prev = get().byKey;
    const byKey: Record<string, SessionSummary> = {};
    // Updates that arrived while the list was in flight are newer than the list: a session deleted or removed
    // meanwhile stays out, one started meanwhile stays in.
    for (const s of r.sessions) {
      const gone = removedAt.get(s.key) ?? 0;
      if (deleted.has(s.key) || (gone > started && gone >= (upsertedAt.get(s.key) ?? 0))) continue;
      byKey[s.key] = (upsertedAt.get(s.key) ?? 0) > started && prev[s.key] ? prev[s.key] : stops.summary(s);
    }
    for (const [k, s] of Object.entries(prev)) if (!byKey[k] && (upsertedAt.get(k) ?? 0) > started) byKey[k] = s;
    set({ byKey, order: sortKeys(byKey), loaded: true, total: r.total });
  },
  upsert: (list) => {
    const byKey = { ...get().byKey };
    const now = Date.now();
    for (const s of list) {
      if (deleted.has(s.key)) continue;
      byKey[s.key] = stops.summary(s);
      upsertedAt.set(s.key, now);
    }
    set({ byKey, order: sortKeys(byKey) });
  },
  remove: (keys) => {
    const byKey = { ...get().byKey };
    const now = Date.now();
    for (const k of keys) {
      delete byKey[k];
      removedAt.set(k, now);
    }
    set({ byKey, order: sortKeys(byKey) });
  },
}));

// ---- timelines ---------------------------------------------------------------------

export interface TimelineState {
  items: TimelineItem[];
  start: number;
  total: number;
  loading: boolean;
  loadingEarlier: boolean;
  error?: string;
}

const PAGE = 250;

export const useTimeline = create<{
  byKey: Record<string, TimelineState>;
  load: (key: string) => Promise<void>;
  loadEarlier: (key: string) => Promise<void>;
  apply: (key: string, items: TimelineItem[], total: number, reset: boolean) => void;
}>((set, get) => ({
  byKey: {},
  load: async (key) => {
    const prev = get().byKey[key];
    set((s) => ({ byKey: { ...s.byKey, [key]: { items: prev?.items ?? [], start: prev?.start ?? 0, total: prev?.total ?? 0, loading: true, loadingEarlier: false } } }));
    try {
      const page = await api<TimelinePage>(`/api/sessions/${enc(key)}/timeline?limit=${PAGE}&whole=1`);
      set((s) => ({ byKey: { ...s.byKey, [key]: { items: page.items, start: page.start, total: page.total, loading: false, loadingEarlier: false } } }));
      stops.items(key, page.items);
    } catch (e) {
      set((s) => ({ byKey: { ...s.byKey, [key]: { items: [], start: 0, total: 0, loading: false, loadingEarlier: false, error: (e as Error).message } } }));
    }
  },
  loadEarlier: async (key) => {
    const cur = get().byKey[key];
    if (!cur || cur.start <= 0 || cur.loadingEarlier) return;
    set((s) => ({ byKey: { ...s.byKey, [key]: { ...cur, loadingEarlier: true } } }));
    try {
      // Whole turns at a time: a page always shows as earlier conversation, never only more folded steps.
      const page = await api<TimelinePage>(`/api/sessions/${enc(key)}/timeline?before=${cur.start}&limit=${PAGE}&whole=1`);
      const now = get().byKey[key];
      // A reload while this page was on its way already has the history from its own start.
      if (!now || now.start !== cur.start) return;
      set((s) => ({ byKey: { ...s.byKey, [key]: { ...now, items: [...page.items, ...now.items], start: page.start, loadingEarlier: false } } }));
    } catch {
      const now = get().byKey[key];
      if (now) set((s) => ({ byKey: { ...s.byKey, [key]: { ...now, loadingEarlier: false } } }));
    }
  },
  apply: (key, items, total, reset) => {
    const cur = get().byKey[key];
    if (!cur) return;
    if (reset) {
      get().load(key);
      return;
    }
    const next = cur.items.slice();
    for (const it of items) {
      const i = it.seq - cur.start;
      if (i < 0) continue;
      if (i < next.length) next[i] = it;
      else if (i === next.length) next.push(it);
      else {
        // A gap: we missed items; reload to resync.
        get().load(key);
        return;
      }
    }
    set((s) => ({ byKey: { ...s.byKey, [key]: { ...cur, items: next, total: Math.max(total, cur.start + next.length) } } }));
    stops.items(key, next);
  },
}));

// ---- live overlays -------------------------------------------------------------------

const emptyOverlay: LiveOverlay = { items: [], patches: {}, approvals: [] };

export const useLive = create<{
  byKey: Record<string, { live: LiveState | null; overlay: LiveOverlay }>;
  set: (key: string, live: LiveState | null, overlay: LiveOverlay) => void;
}>((set) => ({
  byKey: {},
  set: (key, liveState, overlay) => {
    // As it is, or as a stop shows it (below).
    const shown = stops.live(key, liveState, overlay ?? emptyOverlay);
    set((s) => ({ byKey: { ...s.byKey, [key]: shown } }));
  },
}));

// ---- Stop shows at once ----------------------------------------------------------------

/** The sessions that show a stop their agent has not confirmed yet: their conversation ends the stopped turn ("Stopped after …"). */
export const useStops = create<{ byKey: Record<string, Stop> }>(() => ({ byKey: {} }));

/**
 * The stops this page shows (lib/stopping.ts): a session you stop shows stopped at once, in every store, while its agent
 * takes a moment to stop; what the server says of it goes through them on its way in.
 */
const stops = stopRegistry({
  session: (key) => {
    const tl = useTimeline.getState().byKey[key];
    return { live: useLive.getState().byKey[key], summary: useSessions.getState().byKey[key], items: tl ? (tl.loading && !tl.items.length ? null : tl.items) : undefined };
  },
  show: (key) => {
    const lv = useLive.getState().byKey[key];
    if (lv) useLive.getState().set(key, lv.live, lv.overlay);
    const s = useSessions.getState().byKey[key];
    if (s) useSessions.getState().upsert([s]);
  },
  refresh: (key) => {
    api<{ summary: SessionSummary | null; live: LiveState | null; overlay: LiveOverlay }>(`/api/sessions/${enc(key)}`).then(
      (r) => {
        if (stops.has(key)) return;
        if (r.summary) useSessions.getState().upsert([r.summary]);
        if (useLive.getState().byKey[key]) useLive.getState().set(key, r.live, r.overlay);
      },
      () => {},
    );
  },
  changed: (byKey) => useStops.setState({ byKey }),
});

/** The Hydor subagents under a session, theirs in turn. */
function subagentsUnder(key: string): string[] {
  const all = Object.values(useSessions.getState().byKey);
  const seen = new Set([key]);
  const out: string[] = [];
  const walk = (k: string) => {
    for (const s of all) {
      if (s.extra?.parent !== k || seen.has(s.key)) continue;
      seen.add(s.key);
      out.push(s.key);
      walk(s.key);
    }
  };
  walk(key);
  return out;
}

/**
 * Stops a session's turn (`turn`: Stop in its header), or its turn and all it started (`all`: its background tasks and its
 * Hydor subagents, theirs in turn: the Stop by its message box), and shows it stopped at once, though its agent takes a
 * moment to stop. Should the server refuse, it shows as it is again.
 */
export async function stopSession(key: string, scope: StopScope): Promise<void> {
  const shown = [key, ...(scope === 'all' ? subagentsUnder(key) : [])].filter((k) => stops.begin(k, scope, k !== key));
  try {
    await post(`/api/sessions/${enc(key)}/${scope === 'all' ? 'stop-all' : 'interrupt'}`);
  } catch (e) {
    for (const k of shown) stops.end(k);
    toastError(e);
  }
}

/** You sent a session a message: it shows as it is from now on, no longer with the stop you pressed a moment ago. */
export const stopOverridden = (key: string) => stops.end(key);

// ---- usage, login, system ---------------------------------------------------------------

export const useUsage = create<{
  claude: AgentUsage | null;
  codex: AgentUsage | null;
  /** Grok Build's own sign-in: none until Grok Build is set up. */
  grok: AgentUsage | null;
  /** Antigravity CLI's own sign-in: none until Antigravity CLI is set up. */
  antigravity: AgentUsage | null;
  /** Added accounts' usage, by account id. */
  accounts: Record<string, AgentUsage>;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
  set: (p: { claude?: AgentUsage; codex?: AgentUsage; grok?: AgentUsage; antigravity?: AgentUsage; accounts?: Record<string, AgentUsage> }) => void;
}>((set) => ({
  claude: null,
  codex: null,
  grok: null,
  antigravity: null,
  accounts: {},
  loading: false,
  refresh: async (force) => {
    set({ loading: true });
    try {
      const r = await api<{ claude: AgentUsage; codex: AgentUsage; grok?: AgentUsage; antigravity?: AgentUsage; accounts?: Record<string, AgentUsage> }>(`/api/usage${force ? '?refresh=1' : ''}`);
      set({ claude: r.claude, codex: r.codex, grok: r.grok ?? null, antigravity: r.antigravity ?? null, accounts: r.accounts ?? {} });
    } finally {
      set({ loading: false });
    }
  },
  set: (p) => set((s) => ({ claude: p.claude ?? s.claude, codex: p.codex ?? s.codex, grok: p.grok ?? s.grok, antigravity: p.antigravity ?? s.antigravity, accounts: p.accounts ? { ...s.accounts, ...p.accounts } : s.accounts })),
}));

/** App-wide switches kept on the server (/api/app-settings); read once, then kept in step by whoever changes them. */
export const useAppSettings = create<{
  autoResume: boolean | null;
  autoSwitch: boolean | null;
  apiCredit: boolean | null;
  loaded: boolean;
  load: () => Promise<void>;
  set: (p: { autoResume?: boolean; autoSwitch?: boolean; apiCredit?: boolean }) => void;
}>((set, get) => ({
  autoResume: null,
  autoSwitch: null,
  apiCredit: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const r = await api<{ autoResume: boolean; autoSwitch: boolean; apiCredit?: boolean }>('/api/app-settings');
      set({ autoResume: r.autoResume, autoSwitch: r.autoSwitch, apiCredit: !!r.apiCredit });
    } catch {
      set({ loaded: false });
    }
  },
  set: (p) => set(p),
}));

/** Used up: not readable, at a limit, or a window full (as the server judges it before switching). */
export const usedUp = (u: AgentUsage | null | undefined) => !u?.ok || !!u.limited || u.windows.some((w) => (w.usedPercent ?? 0) >= 100);

/** The usage of the account a session runs as (an added one, or the agent's own sign-in). */
export function usageOf(agent: AccountAgent, account?: string): AgentUsage | null {
  const u = useUsage.getState();
  return account ? (u.accounts[account] ?? null) : u[agent];
}

export const useLogins = create<{ flows: Record<string, LoginFlow>; put: (f: LoginFlow) => void }>((set) => ({
  flows: {},
  put: (f) => set((s) => ({ flows: { ...s.flows, [f.id]: f } })),
}));

export const useSystemLive = create<{ samples: SystemSample[]; push: (s: SystemSample) => void; reset: (list: SystemSample[]) => void }>((set) => ({
  samples: [],
  push: (smp) => set((s) => ({ samples: [...s.samples.slice(-299), smp] })),
  reset: (list) => set({ samples: list.slice(-300) }),
}));

// ---- UI preferences (persisted) ----------------------------------------------------------

export type Theme = 'dark' | 'light' | 'system';
/** How much moves (Settings → General → Appearance): everything, all but what moves as you open things, or none of the decorative motion. */
export type Motion = 'full' | 'calm' | 'off';
/** How big reading text is (Settings → General → Appearance): the size it has, a seventh larger, or a third larger (lib/textSize.ts). */
export type TextSize = 'default' | 'large' | 'larger';
export type SideView = 'sessions' | 'files' | 'search';

export interface OpenTab {
  id: string;
  kind: 'session' | 'file';
  ref: string;
}

export type DetailsTab = 'changes' | 'commands' | 'info';

interface UIState {
  /** The mode: always dark, always light, or the device's. */
  theme: Theme;
  /** How much of the app's small motion plays on this device (lib/motion.ts). */
  motion: Motion;
  /** How big messages, Help pages and the message box are on this device (lib/textSize.ts). */
  textSize: TextSize;
  /** The conversation's zoom on this device, 1 being 100 % (shared/zoom.ts, lib/convZoom.ts). */
  convZoom: number;
  /** The theme shown in each mode (lib/theme.ts). */
  darkTheme: string;
  lightTheme: string;
  /** Grey suggestions after the cursor in terminals. */
  termSuggest: boolean;
  /** Grey word suggestions while typing, in this browser (Settings → Capabilities → Word suggestions). */
  wordSuggestions: boolean;
  /** Web apps show files, commands and logs beside the plain words (Settings → General → Apps). */
  technicalDetails: boolean;
  /** The Files page's left pane: the tree or search in files. */
  side: SideView;
  /** Desktop sidebar shown. */
  sideOpen: boolean;
  /** Mobile navigation drawer (not persisted). */
  drawerOpen: boolean;
  /** The session details panel and its tab. */
  detailsOpen: boolean;
  detailsTab: DetailsTab;
  /** A file to expand in the Changes tab (not persisted). */
  detailsFocus: string | null;
  /** Width of the desktop navigation, distinct from the file tree. */
  navigationWidth: number;
  /** Width of the Browser page's right column on a computer (Ask, an agent's conversation, the panels): dragged at its edge. */
  browserColumnWidth: number;
  sideWidth: number;
  panelOpen: boolean;
  panelHeight: number;
  explorerRoot: string | null;
  showHidden: boolean;
  tabs: OpenTab[];
  /** The program the sidebar lists the sessions of (Runs on: Claude Code or Codex); all of them with 'all'. */
  agentFilter: 'all' | 'claude' | 'codex';
  /** The agent (General, Researcher…, by its id) the sidebar lists the sessions of; all when null. */
  assistantFilter: string | null;
  /** The space the sidebar lists the sessions of; all when null. */
  spaceFilter: string | null;
  /** The sidebar groups sessions by the space or the folder they work in (sessions/groups.ts), else only by day. */
  groupByFolder: boolean;
  /** The sidebar's space and folder groups you folded (true) or opened (false), by their ids; the others follow sessions/groups.ts. */
  groupFolds: Record<string, boolean>;
  /** Collapsed top-level session sections on this machine. */
  sidebarSectionFolds: { active?: boolean; pinned?: boolean; folders?: boolean; projects?: boolean };
  /** The start page's While you were away opened (it starts folded). */
  awayOpen: boolean;
  set: (p: Partial<Omit<UIState, 'set' | 'openTab' | 'closeTab'>>) => void;
  openTab: (t: OpenTab) => void;
  closeTab: (id: string) => void;
}

const UI_KEY = 'wa.ui.v1';
/** Folders, open files and the sidebar's folded groups are each machine's own (Settings → Machines); the rest of the layout is shared. */
const PER_MACHINE = ['explorerRoot', 'tabs', 'groupFolds', 'sidebarSectionFolds'] as const;
const read = (k: string): Record<string, unknown> => {
  try {
    return JSON.parse(localStorage.getItem(k) ?? '{}') ?? {};
  } catch {
    return {};
  }
};
function loadUI(): Partial<UIState> {
  const shared = read(UI_KEY);
  if (!machineId) return shared;
  const own = read(machineKey(UI_KEY));
  for (const k of PER_MACHINE) delete shared[k];
  return { ...shared, ...own } as Partial<UIState>;
}

export const useUI = create<UIState>((set, get) => ({
  theme: 'dark',
  motion: 'full',
  textSize: 'default',
  convZoom: 1,
  darkTheme: 'naget-dark',
  lightTheme: 'naget-light',
  termSuggest: true,
  wordSuggestions: true,
  technicalDetails: false,
  side: 'files',
  sideOpen: true,
  drawerOpen: false,
  detailsOpen: false,
  detailsTab: 'changes',
  detailsFocus: null,
  navigationWidth: 280,
  browserColumnWidth: 400,
  sideWidth: 300,
  panelOpen: false,
  panelHeight: 280,
  explorerRoot: null,
  showHidden: false,
  tabs: [],
  agentFilter: 'all',
  assistantFilter: null,
  spaceFilter: null,
  groupByFolder: true,
  groupFolds: {},
  sidebarSectionFolds: {},
  awayOpen: false,
  ...loadUI(),
  set: (p) => set(p),
  openTab: (t) => {
    const tabs = get().tabs.filter((x) => x.id !== t.id);
    set({ tabs: [...tabs, t].slice(-12) });
  },
  closeTab: (id) => set({ tabs: get().tabs.filter((t) => t.id !== id) }),
}));

useUI.subscribe((s) => {
  try {
    const { set: _s, openTab: _o, closeTab: _c, drawerOpen: _d, detailsFocus: _f, ...rest } = s;
    if (!machineId) return localStorage.setItem(UI_KEY, JSON.stringify(rest));
    // Another machine's page keeps this machine's folders and files apart from the main one's.
    const own: Record<string, unknown> = {};
    const shared: Record<string, unknown> = { ...rest };
    for (const k of PER_MACHINE) {
      own[k] = shared[k];
      delete shared[k];
    }
    localStorage.setItem(machineKey(UI_KEY), JSON.stringify(own));
    localStorage.setItem(UI_KEY, JSON.stringify({ ...read(UI_KEY), ...shared }));
  } catch {}
});

// ---- wiring server events into the stores -----------------------------------------------

/** This page's build: the file name of its entry script (none in development). */
const pageBuild = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')?.getAttribute('src')?.split('/').pop();
let offered = '';
/** The server hands out a newer build than this page runs (after an update): reload into it, or offer to. */
export function newerBuild(build: string) {
  if (!pageBuild || build === pageBuild || offered === build) return;
  offered = build;
  // "Update now" in this tab: it wanted the new version.
  let asked = false;
  try {
    asked = !!sessionStorage.getItem('wa.updating');
    sessionStorage.removeItem('wa.updating');
  } catch {}
  if (asked) return location.reload();
  const offer = () => useToasts.getState().push('info', 'Hydor was updated', { label: 'Reload', run: () => location.reload() }, 'Reload to use the new version');
  if (document.visibilityState === 'visible') offer();
  else document.addEventListener('visibilitychange', offer, { once: true });
}

/** On another machine's pages: the build that machine's socket named first. */
let machineBuild = '';
/** That machine names another build: it was updated. Update now in this tab (its Settings → General) shows its pages again. */
function machineBuilt(build: string) {
  if (!machineBuild || build === machineBuild) return void (machineBuild = build);
  machineBuild = build;
  try {
    if (!sessionStorage.getItem('wa.updating')) return;
    sessionStorage.removeItem('wa.updating');
  } catch {
    return;
  }
  location.reload();
}

export function handleEvent(e: ServerEvent) {
  switch (e.t) {
    case 'sessions':
      if (e.upsert.length) useSessions.getState().upsert(e.upsert);
      if (e.remove?.length) useSessions.getState().remove(e.remove);
      break;
    case 'items':
      useTimeline.getState().apply(e.key, e.items, e.total, !!e.reset);
      break;
    case 'live': {
      useLive.getState().set(e.key, e.live, e.overlay);
      // Keep the open session's row in the list in step with its header (both as they show, with a stop they show).
      const cur = useSessions.getState().byKey[e.key];
      const shown = useLive.getState().byKey[e.key]?.live ?? null;
      const tasks = (l: LiveState | null | undefined) => l?.backgroundTasks?.length ?? 0;
      if (cur && (cur.live?.status !== shown?.status || tasks(cur.live) !== tasks(shown))) useSessions.getState().upsert([{ ...cur, live: e.live, external: e.live ? null : cur.external }]);
      break;
    }
    case 'usage':
      useUsage.getState().set({ claude: e.claude, codex: e.codex, grok: e.grok, antigravity: e.antigravity, accounts: e.accounts });
      break;
    case 'accounts': {
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, accounts: e.accounts } });
      break;
    }
    case 'signin':
      useSignIn.getState().set(e.needs);
      break;
    case 'programs': {
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, programs: e.programs } });
      break;
    }
    case 'acpAgents': {
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, acpAgents: e.agents } });
      break;
    }
    case 'login':
      useLogins.getState().put(e.flow);
      break;
    case 'update': {
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, update: e.update ?? undefined } });
      break;
    }
    case 'hello':
      // On another machine's pages this socket is that machine's, whose build is not this page's: this server's own
      // comes on its own socket (App.tsx), and that machine's tells when it was updated.
      if (e.build) (machineId ? machineBuilt(e.build) : newerBuild(e.build));
      break;
    case 'index': {
      const was = useApp.getState().indexing?.running;
      useApp.getState().set({ indexing: { done: e.done, total: e.total, running: e.running } });
      // A full indexing run just finished: pick up everything it found at once.
      if (was && !e.running) useSessions.getState().load().catch(() => {});
      break;
    }
    case 'system':
      useSystemLive.getState().push(e.sample);
      break;
    case 'toast':
      toast(e.text, e.level === 'error' ? 'error' : 'info');
      break;
    case 'notify':
      handleNotify(e.n);
      break;
    case 'machines':
      useMachines.getState().load().catch(() => {});
      break;
    case 'tasks':
      // Pages showing scheduled tasks reload them.
      window.dispatchEvent(new Event('wa:tasks'));
      break;
    case 'themes':
      // Another machine's pages keep this server's themes (they come on its own socket).
      if (!machineId) window.dispatchEvent(new CustomEvent('wa:themes', { detail: e.themes }));
      break;
    case 'note':
      useNotes.getState().apply(e.key, e.note, e.removed);
      break;
    case 'feature':
      emitFeatureEvent(e.id, { key: e.key, data: e.data });
      break;
    case 'jobs':
      // The Jobs page and its count on the rail hear it (features/jobs/store).
      emitFeatureEvent('jobs', { data: { running: e.running, queued: e.queued } });
      break;
  }
}

live.on(handleEvent);

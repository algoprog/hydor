import { create } from 'zustand';
import type { AppTheme } from '@shared/themes';
import type {
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
import { api, enc } from './api';
import { live } from './ws';
import { machineId, machineKey } from './machine';
import { useMachines } from './machines';
import { handleNotify } from './notify';
import { useNotes } from './notes';
import { emitFeatureEvent } from './featureEvents';

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
    // Updates that arrived while the list was in flight are newer than the list.
    for (const s of r.sessions) byKey[s.key] = (upsertedAt.get(s.key) ?? 0) > started && prev[s.key] ? prev[s.key] : s;
    set({ byKey, order: sortKeys(byKey), loaded: true, total: r.total });
  },
  upsert: (list) => {
    const byKey = { ...get().byKey };
    const now = Date.now();
    for (const s of list) {
      byKey[s.key] = s;
      upsertedAt.set(s.key, now);
    }
    set({ byKey, order: sortKeys(byKey) });
  },
  remove: (keys) => {
    const byKey = { ...get().byKey };
    for (const k of keys) delete byKey[k];
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
  },
}));

// ---- live overlays -------------------------------------------------------------------

const emptyOverlay: LiveOverlay = { items: [], patches: {}, approvals: [] };

export const useLive = create<{
  byKey: Record<string, { live: LiveState | null; overlay: LiveOverlay }>;
  set: (key: string, live: LiveState | null, overlay: LiveOverlay) => void;
}>((set) => ({
  byKey: {},
  set: (key, liveState, overlay) => set((s) => ({ byKey: { ...s.byKey, [key]: { live: liveState, overlay: overlay ?? emptyOverlay } } })),
}));

// ---- usage, login, system ---------------------------------------------------------------

export const useUsage = create<{
  claude: AgentUsage | null;
  codex: AgentUsage | null;
  /** Added accounts' usage, by account id. */
  accounts: Record<string, AgentUsage>;
  loading: boolean;
  refresh: (force?: boolean) => Promise<void>;
  set: (p: { claude?: AgentUsage; codex?: AgentUsage; accounts?: Record<string, AgentUsage> }) => void;
}>((set) => ({
  claude: null,
  codex: null,
  accounts: {},
  loading: false,
  refresh: async (force) => {
    set({ loading: true });
    try {
      const r = await api<{ claude: AgentUsage; codex: AgentUsage; accounts?: Record<string, AgentUsage> }>(`/api/usage${force ? '?refresh=1' : ''}`);
      set({ claude: r.claude, codex: r.codex, accounts: r.accounts ?? {} });
    } finally {
      set({ loading: false });
    }
  },
  set: (p) => set((s) => ({ claude: p.claude ?? s.claude, codex: p.codex ?? s.codex, accounts: p.accounts ? { ...s.accounts, ...p.accounts } : s.accounts })),
}));

/** App-wide switches kept on the server (/api/app-settings); read once, then kept in step by whoever changes them. */
export const useAppSettings = create<{
  autoResume: boolean | null;
  autoSwitch: boolean | null;
  loaded: boolean;
  load: () => Promise<void>;
  set: (p: { autoResume?: boolean; autoSwitch?: boolean }) => void;
}>((set, get) => ({
  autoResume: null,
  autoSwitch: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    set({ loaded: true });
    try {
      const r = await api<{ autoResume: boolean; autoSwitch: boolean }>('/api/app-settings');
      set({ autoResume: r.autoResume, autoSwitch: r.autoSwitch });
    } catch {
      set({ loaded: false });
    }
  },
  set: (p) => set(p),
}));

/** Used up: not readable, at a limit, or a window full (as the server judges it before switching). */
export const usedUp = (u: AgentUsage | null | undefined) => !u?.ok || !!u.limited || u.windows.some((w) => (w.usedPercent ?? 0) >= 100);

/** The usage of the account a session runs as (an added one, or the agent's own sign-in). */
export function usageOf(agent: Agent, account?: string): AgentUsage | null {
  const u = useUsage.getState();
  return account ? (u.accounts[account] ?? null) : agent === 'claude' ? u.claude : u.codex;
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
  /** The theme shown in each mode (lib/theme.ts). */
  darkTheme: string;
  lightTheme: string;
  /** Grey suggestions after the cursor in terminals. */
  termSuggest: boolean;
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
  sideWidth: number;
  panelOpen: boolean;
  panelHeight: number;
  explorerRoot: string | null;
  showHidden: boolean;
  tabs: OpenTab[];
  agentFilter: 'all' | 'claude' | 'codex';
  /** The space the sidebar lists the sessions of; all when null. */
  spaceFilter: string | null;
  /** The sidebar groups sessions by the space or the folder they work in (sessions/groups.ts), else only by day. */
  groupByFolder: boolean;
  /** The sidebar's space and folder groups you folded (true) or opened (false), by their ids; the others follow sessions/groups.ts. */
  groupFolds: Record<string, boolean>;
  set: (p: Partial<Omit<UIState, 'set' | 'openTab' | 'closeTab'>>) => void;
  openTab: (t: OpenTab) => void;
  closeTab: (id: string) => void;
}

const UI_KEY = 'wa.ui.v1';
/** Folders, open files and the sidebar's folded groups are each machine's own (Settings → Machines); the rest of the layout is shared. */
const PER_MACHINE = ['explorerRoot', 'tabs', 'groupFolds'] as const;
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
  darkTheme: 'naget-dark',
  lightTheme: 'naget-light',
  termSuggest: true,
  side: 'files',
  sideOpen: true,
  drawerOpen: false,
  detailsOpen: false,
  detailsTab: 'changes',
  detailsFocus: null,
  sideWidth: 300,
  panelOpen: false,
  panelHeight: 280,
  explorerRoot: null,
  showHidden: false,
  tabs: [],
  agentFilter: 'all',
  spaceFilter: null,
  groupByFolder: true,
  groupFolds: {},
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
function newerBuild(build: string) {
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
      // Keep the open session's row in the list in step with its header.
      const cur = useSessions.getState().byKey[e.key];
      const tasks = (l: LiveState | null | undefined) => l?.backgroundTasks?.length ?? 0;
      if (cur && (cur.live?.status !== e.live?.status || tasks(cur.live) !== tasks(e.live))) useSessions.getState().upsert([{ ...cur, live: e.live, external: e.live ? null : cur.external }]);
      break;
    }
    case 'usage':
      useUsage.getState().set({ claude: e.claude, codex: e.codex, accounts: e.accounts });
      break;
    case 'accounts': {
      const boot = useApp.getState().boot;
      if (boot) useApp.getState().set({ boot: { ...boot, accounts: e.accounts } });
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
      if (e.build) newerBuild(e.build);
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
  }
}

live.on(handleEvent);

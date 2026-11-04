// Who may use the Mac, and when. Settings → Capabilities → Computer use turns it on (off at first) and shows macOS's
// two permissions; each session asks the user once, on a card in its conversation (Allow for this session, or Not
// now); Stop (the menu bar, ⌘⇧Esc, Settings, the session's line) ends what an agent is doing and takes every
// session's allowance back until the user allows it again on the card. One session at a time moves the mouse, one
// action at a time. While an agent acts, the Mac app's menu bar and the pages say so.
import crypto from 'node:crypto';
import { COMPUTER_CARD, type ComputerActive, type ComputerEvent, type ComputerPermissions, type ComputerState, type ScreenAccess } from '../../shared/computer.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { askDesktop, desktop, tellDesktop } from '../desktop.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { appWords } from '../language/index.ts';

const KEY = 'computer.settings';
/** After this long without an action, an agent is no longer using the Mac (and another session may). */
export const IDLE_MS = 30_000;
/** How long the card waits for the user. */
const WAIT_MS = 15 * 60_000;
const SCREEN: ScreenAccess[] = ['granted', 'denied', 'not-determined', 'restricted', 'unknown'];

let deps: Deps | null = null;
export const setComputerDeps = (d: Deps) => (deps = d);

/** Where the server runs and what macOS allows; the tests put stand-ins here. */
export const hooks = {
  // The Mac app only: the Windows and Linux apps have no computer use yet.
  inApp: () => desktop?.platform === 'mac',
  permissions: async (): Promise<ComputerPermissions | null> => {
    const r = await askDesktop<{ accessibility?: unknown; screen?: unknown }>({ what: 'permissions' }, 4000);
    return { accessibility: r.accessibility === true, screen: SCREEN.includes(r.screen as ScreenAccess) ? (r.screen as ScreenAccess) : 'unknown' };
  },
};

export function computerSettings(db: DB): { enabled: boolean } {
  try {
    return { enabled: JSON.parse(kvGet(db, KEY) ?? '{}').enabled === true };
  } catch {
    return { enabled: false };
  }
}

export function setComputerSettings(db: DB, patch: { enabled?: unknown }) {
  const next = { ...computerSettings(db) };
  if (patch.enabled !== undefined) next.enabled = !!patch.enabled;
  kvSet(db, KEY, JSON.stringify(next));
  // Turned off: whatever an agent is doing ends, and the sessions allowed ask again next time.
  if (!next.enabled) stopAll();
}

let perms: { at: number; p: ComputerPermissions | null } | null = null;
/** What macOS lets the app do now (asked of the Mac app, for a few seconds at a time); null when it does not say. */
export async function permissions(fresh = false): Promise<ComputerPermissions | null> {
  if (!hooks.inApp()) return null;
  if (!fresh && perms && Date.now() - perms.at < 3000) return perms.p;
  let p: ComputerPermissions | null = null;
  try {
    p = await hooks.permissions();
  } catch {}
  perms = { at: Date.now(), p };
  return p;
}

// ---- sessions allowed, stopped, and the one at work --------------------------------------------------------------

const allowed = new Set<string>();
/** Sessions the user stopped: their card says so when they ask again. */
const stopped = new Set<string>();
const asking = new Map<string, Promise<string | null>>();
let active: (ComputerActive & { at: number }) | null = null;
let idleTimer: NodeJS.Timeout | null = null;
/** Actions under way, by session: Stop aborts them. */
const running = new Map<string, Set<AbortController>>();

export const activeView = (): ComputerActive | null => (active ? { key: active.key, title: active.title, since: active.since } : null);

function announce() {
  tellDesktop({ type: 'computer', active: !!active, ...(active ? { title: active.title } : {}) });
  deps?.broadcast({ t: 'feature', id: 'computer', data: { type: 'active', active: activeView() } satisfies ComputerEvent });
}

/** An agent acts: the menu bar and the pages say so, until it has done nothing for a while. */
export function markActive(key: string, title: string) {
  const now = Date.now();
  const changed = !active || active.key !== key;
  active = { key, title, since: changed ? now : active!.since, at: now };
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => clearActive(), IDLE_MS);
  idleTimer.unref?.();
  if (changed) announce();
}

export function clearActive(key?: string) {
  if (!active || (key && active.key !== key)) return;
  active = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  announce();
}

/** Another session acting right now, if one is. */
function busyElsewhere(key: string) {
  return active && active.key !== key && Date.now() - active.at < IDLE_MS ? active : null;
}

/** A signal for one action of a session: aborted by Stop, or when the agent gives up on the call. */
export function actionSignal(key: string, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  let set = running.get(key);
  if (!set) running.set(key, (set = new Set()));
  set.add(c);
  const signal = outer ? AbortSignal.any([outer, c.signal]) : c.signal;
  return {
    signal,
    done: () => {
      set.delete(c);
      if (!set.size) running.delete(key);
    },
  };
}

/** Stop: what agents do on the Mac ends, and no session may go on until the user allows it again. Returns how many were stopped. */
export function stopAll(): number {
  const keys = new Set([...allowed, ...running.keys(), ...(active ? [active.key] : [])]);
  for (const k of keys) stopped.add(k);
  allowed.clear();
  for (const set of running.values()) for (const c of set) c.abort();
  running.clear();
  clearActive();
  return keys.size;
}

/** Whether the user stopped this session (its last action was cut short, or it is to ask again). */
export const wasStopped = (key: string) => stopped.has(key);

/** A session that ended or went away. */
export function forgetSession(key: string) {
  allowed.delete(key);
  stopped.delete(key);
  clearActive(key);
}

export const allowedCount = () => allowed.size;

/** For tests: forget every session. */
export function resetAccess() {
  allowed.clear();
  stopped.clear();
  asking.clear();
  running.clear();
  active = null;
  perms = null;
}

// ---- may this session use it now? -------------------------------------------------------------------------------

export const OFF = 'Computer use is off. The user turns it on in Settings → Capabilities → Computer use (in the Hydor Mac app).';

/**
 * Null when the session's agent may go on (to see the screen, and to act on it); else what to tell it. The first time
 * in a session, the user is asked on a card.
 */
export async function mayUse(ctx: RunCtx, need: { see: boolean; act: boolean }): Promise<string | null> {
  if (!hooks.inApp()) return 'Computer use works only in the Hydor Mac app.';
  if (!computerSettings(ctx.deps.db).enabled) return OFF;
  const p = await permissions();
  if (!p) return 'The Mac app did not say what macOS allows Hydor to do. Ask the user to check Settings → Capabilities → Computer use.';
  const missing = [need.act && !p.accessibility ? 'Accessibility (to use the mouse and keyboard)' : '', need.see && p.screen !== 'granted' ? 'Screen Recording (to see the screen)' : ''].filter(Boolean);
  if (missing.length)
    return `macOS does not allow Hydor ${missing.join(' or ')} yet. Ask the user to allow it: Settings → Capabilities → Computer use has the buttons (then macOS's System Settings → Privacy & Security). Then try again.`;
  const other = busyElsewhere(ctx.key);
  if (other) return `Another session (“${other.title}”) is using this Mac right now. Do other work, or try again in a minute.`;
  if (allowed.has(ctx.key)) return null;
  let pending = asking.get(ctx.key);
  if (!pending) {
    pending = askUser(ctx).finally(() => asking.delete(ctx.key));
    asking.set(ctx.key, pending);
  }
  return pending;
}

/** The card: let the agent use the Mac for the rest of the session, or not now. */
async function askUser(ctx: RunCtx): Promise<string | null> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can allow it now (the session is not running in the app). Ask the user in your reply.';
  const tr = appWords(ctx.deps.db);
  const card: ApprovalRequest = {
    id: `computer-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'other',
    title: tr(stopped.has(ctx.key) ? COMPUTER_CARD.again : COMPUTER_CARD.title),
    detail: tr(COMPUTER_CARD.detail),
    prose: true,
    options: [
      { id: 'accept', label: COMPUTER_CARD.allow, style: 'primary' },
      { id: 'deny', label: COMPUTER_CARD.deny },
    ],
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(WAIT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
  if (!answer) return limit.aborted ? 'The user did not answer the card in time; it was withdrawn. Ask them in your reply whether you may use their Mac.' : 'The card was withdrawn before the user answered.';
  if (answer.decision !== 'accept') return `The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Do not use the computer tools again in this session unless they ask you to.`;
  allowed.add(ctx.key);
  stopped.delete(ctx.key);
  return null;
}

/** Settings → Capabilities → Computer use, as the page shows it. */
export async function computerState(db: DB, fresh = false): Promise<ComputerState> {
  const available = hooks.inApp();
  return { available, enabled: computerSettings(db).enabled, ...(available ? { permissions: await permissions(fresh) } : {}), active: activeView(), allowed: allowed.size };
}

/** One action at a time on the Mac, whichever session asks. */
let chain: Promise<unknown> = Promise.resolve();
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const r = chain.then(fn, fn);
  chain = r.catch(() => {});
  return r;
}

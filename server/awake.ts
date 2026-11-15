// Keeping the computer awake, in the desktop apps (Settings → General → Keep the computer awake). A laptop that goes
// to sleep stops the agents at work on it, and its 7:00 task runs only when the lid opens at 9:40. So while anything
// works here (an agent session's turn: scheduled runs, app runs and subagents are sessions too; an app run's steps;
// a running experiment) and, by default, from a few minutes before a scheduled run is due until it starts, the app
// keeps the computer from going to sleep by itself: the server tells the desktop app each time the answer changes
// ({ type: 'awake' }, server/desktop.ts) and the app holds Electron's powerSaveBlocker meanwhile (desktop/awake.cjs);
// the screen may still turn off, and closing a laptop's lid still puts it to sleep. Watchers that look every few
// minutes do not keep it awake on their own (the run a change starts does, while it works), nor does a session
// waiting for your answer, nor what runs on other machines. The Linux service has no desktop app: nothing happens
// there. server/awake-test.ts checks the decision.
import type { KeepAwakeMode, KeepAwakeState } from '../shared/types.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { desktop, tellDesktop } from './desktop.ts';

export const AWAKE_MODES: KeepAwakeMode[] = ['tasks', 'working', 'never'];
/** How long before a scheduled run the computer is kept awake. */
export const AWAKE_LEAD = 5 * 60_000;
/**
 * A run this late has not started for a reason of its own (the scheduler starts a due one within 20 seconds): it no
 * longer keeps the computer awake, so one that never starts cannot keep it awake for good.
 */
export const AWAKE_LATE = 10 * 60_000;
/** A turn under way: not a session waiting for your answer, nor an idle one with programs left running. */
const AT_WORK = new Set(['starting', 'working']);

const KEY = 'keep_awake';

export function awakeMode(db: DB): KeepAwakeMode {
  const v = kvGet(db, KEY) as KeepAwakeMode | undefined;
  return v && AWAKE_MODES.includes(v) ? v : 'tasks';
}

export function setAwakeMode(db: DB, mode: unknown): KeepAwakeMode {
  if (!AWAKE_MODES.includes(mode as KeepAwakeMode)) throw new Error(`Keep the computer awake is one of ${AWAKE_MODES.join(', ')}`);
  kvSet(db, KEY, mode as string);
  return mode as KeepAwakeMode;
}

/** What the decision reads: the database (tasks, app runs, experiments) and the sessions run here, by their agent's status. */
export interface AwakeSources {
  db: DB;
  lives: Iterable<[string, { adapter: { state: { status: string } } }]>;
}

/** What works here now, one id each: `session:<key>`, `app:<run>` (one no session of its own carries), `experiment:<run>`. */
export function workingNow(src: AwakeSources): string[] {
  const out: string[] = [];
  const busy = new Set<string>();
  for (const [key, l] of src.lives)
    if (AT_WORK.has(l.adapter.state.status)) {
      busy.add(key);
      out.push(`session:${key}`);
    }
  // App runs (server/apps/store.ts): an agent's run is its session's turn; a run of steps works without one.
  try {
    for (const r of src.db.prepare(`select id, key from app_runs where status in ('starting', 'running')`).all() as { id: string; key: string | null }[])
      if (!r.key || !busy.has(r.key)) out.push(`app:${r.id}`);
  } catch {}
  // Experiments (server/experiments/records.ts) running on this computer: not on a cluster, nor another machine's.
  try {
    for (const r of src.db.prepare(`select id, info from exp_runs where status in ('starting', 'running') and place = 'local'`).all() as { id: string; info: string | null }[]) {
      let remote = false;
      try {
        remote = !!JSON.parse(r.info ?? '{}')?.remote;
      } catch {}
      if (!remote) out.push(`experiment:${r.id}`);
    }
  } catch {}
  return out;
}

/**
 * The next scheduled run of the tasks here (an agent's and an app's schedules are tasks too), from AWAKE_LATE ago on:
 * none for watchers (they look every few minutes) or webhooks (they have no time), nor for paused tasks.
 */
export function nextScheduled(db: DB, now: number): { id: string; name: string; at: number } | undefined {
  let rows: { id: string; name: string; schedule: string; next_at: number }[] = [];
  try {
    rows = db.prepare('select id, name, schedule, next_at from tasks where enabled = 1 and next_at is not null and next_at >= ? order by next_at').all(now - AWAKE_LATE) as typeof rows;
  } catch {
    return undefined;
  }
  for (const r of rows) {
    let kind = '';
    try {
      kind = String(JSON.parse(r.schedule)?.kind ?? '');
    } catch {}
    if (kind === 'watch' || kind === 'webhook') continue;
    return { id: r.id, name: r.name, at: r.next_at };
  }
  return undefined;
}

/**
 * Whether the computer should stay awake now, and when the answer changes by itself (a scheduled run's few minutes
 * starting): `never` never; else while anything works; with `tasks` also from AWAKE_LEAD before the next run is due
 * until it starts (nextScheduled leaves a run out once it is AWAKE_LATE overdue).
 */
export function decideAwake(mode: KeepAwakeMode, now: number, working: number, next?: { at: number }): { awake: boolean; recheckAt?: number } {
  if (mode === 'never') return { awake: false };
  if (working > 0) return { awake: true };
  if (mode !== 'tasks' || !next) return { awake: false };
  if (next.at - AWAKE_LEAD <= now) return { awake: true };
  return { awake: false, recheckAt: next.at - AWAKE_LEAD };
}

/** The whole state, as Settings shows it. */
export function awakeState(src: AwakeSources, now = Date.now()): KeepAwakeState & { recheckAt?: number } {
  const mode = awakeMode(src.db);
  const working = workingNow(src).length;
  const next = mode === 'tasks' ? nextScheduled(src.db, now) : undefined;
  const d = decideAwake(mode, now, working, next);
  return {
    available: !!desktop,
    ...(desktop ? { platform: desktop.platform } : {}),
    mode,
    awake: !!desktop && d.awake,
    working,
    ...(next ? { next: { name: next.name, at: next.at } } : {}),
    ...(d.recheckAt ? { recheckAt: d.recheckAt } : {}),
  };
}

/** A gap this short between two turns (a queued message going out, a scheduled run's session starting) keeps it awake. */
export const AWAKE_GRACE = 15_000;
/** Looked at again this often all the same, in case a change came without a word (a task's time moved, a process died). */
const SAFETY_MS = 60_000;

/**
 * Tells the desktop app whether to keep the computer awake each time the answer changes: poke() after anything that may
 * change it (sessions, tasks, app runs, experiments, the setting); a timer looks again when a scheduled run's few minutes
 * begin. Outside a desktop app it does nothing. `send` is the channel to the app (tests give their own).
 */
export class KeepAwake {
  private sent: boolean | null = null;
  private soon: NodeJS.Timeout | null = null;
  private release: NodeJS.Timeout | null = null;
  private recheck: NodeJS.Timeout | null = null;
  private safety: NodeJS.Timeout | null = null;

  constructor(
    private src: AwakeSources,
    private o: { send?: (on: boolean, why: string) => void; debounceMs?: number; graceMs?: number; on?: boolean } = {},
  ) {
    if (!this.on) return;
    this.safety = setInterval(() => this.poke(), SAFETY_MS);
    this.safety.unref?.();
    this.poke();
  }

  private get on() {
    return this.o.on ?? !!desktop;
  }

  /** As Settings shows it: `awake` is what the app was last told (it holds on for AWAKE_GRACE after the work ends). */
  state(): KeepAwakeState {
    const { recheckAt: _r, ...st } = awakeState(this.src);
    return this.on ? { ...st, available: true, awake: this.sent === true } : st;
  }

  /** Something changed that may change the answer: looked at in a moment (a burst of changes is one look). */
  poke() {
    if (!this.on || this.soon) return;
    this.soon = setTimeout(() => {
      this.soon = null;
      this.evaluate();
    }, this.o.debounceMs ?? 1000);
    this.soon.unref?.();
  }

  /** Looks now. */
  evaluate() {
    if (!this.on) return;
    const now = Date.now();
    const mode = awakeMode(this.src.db);
    const working = workingNow(this.src).length;
    const next = mode === 'tasks' ? nextScheduled(this.src.db, now) : undefined;
    const d = decideAwake(mode, now, working, next);
    if (this.recheck) clearTimeout(this.recheck);
    this.recheck = null;
    if (d.recheckAt) {
      // At most a day ahead (a timer that long is fine; the safety look catches a time that moves).
      this.recheck = setTimeout(() => this.evaluate(), Math.min(Math.max(1000, d.recheckAt - now + 500), 24 * 3600_000));
      this.recheck.unref?.();
    }
    if (d.awake) {
      if (this.release) clearTimeout(this.release);
      this.release = null;
      this.tell(true, working ? `${working} at work` : `${next?.name ?? 'a scheduled task'} is due at ${new Date(next!.at).toISOString()}`);
    } else if (this.sent === true) {
      // Let go once nothing has needed it for a moment (or at once when the setting says never).
      if (mode === 'never') return this.letGo('the setting is Never');
      this.release ??= setTimeout(() => {
        this.release = null;
        const n = Date.now();
        const m = awakeMode(this.src.db);
        if (!decideAwake(m, n, workingNow(this.src).length, m === 'tasks' ? nextScheduled(this.src.db, n) : undefined).awake) this.tell(false, 'nothing needs it');
      }, this.o.graceMs ?? AWAKE_GRACE);
      this.release.unref?.();
    } else this.tell(false, mode === 'never' ? 'the setting is Never' : 'nothing needs it');
  }

  private letGo(why: string) {
    if (this.release) clearTimeout(this.release);
    this.release = null;
    this.tell(false, why);
  }

  private tell(on: boolean, why: string) {
    if (this.sent === on) return;
    this.sent = on;
    if (this.o.send) this.o.send(on, why);
    else tellDesktop({ type: 'awake', on, why });
  }

  stop() {
    for (const t of [this.soon, this.release, this.recheck]) if (t) clearTimeout(t);
    if (this.safety) clearInterval(this.safety);
    this.soon = this.release = this.recheck = this.safety = null;
  }
}

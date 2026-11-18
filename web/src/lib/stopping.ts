// What a session you stop shows at once (lib/store.ts, stopSession): stopped. Its agent takes a moment to stop: it ends
// what it was doing (a command it ran is ended, what it wrote is saved) and then its turn, which can take seconds (the
// server gives it 15). Meanwhile what the session says of the turn you stopped shows it over, nothing in it waits for
// you, the background tasks you stopped with it show stopped, and the turn ends "Stopped after …" in the conversation,
// until the session says so itself. Plain functions, so tests need no page (stopping-test.ts).
import type { LiveOverlay, LiveState, SessionSummary, TimelineItem } from '@shared/types';

/** turn: the turn alone (Stop in the header); all: what the session started too, its background tasks and Hydor subagents (the message box's). */
export type StopScope = 'turn' | 'all';

export interface Stop {
  /** When Stop was pressed, by this page's clock. */
  at: number;
  scope: StopScope;
  /** A turn was under way: the one stopped. */
  turn: boolean;
  /** When that turn began, as the session said: a turn that began at another time is a new one, not stopped. */
  turnStartedAt?: number;
  /** The background tasks that ran (scope all), by id. */
  tasks: string[];
  /** Hydor subagents ran (scope all): each is stopped too, and the session counts none running. */
  helpers: boolean;
}

/** How long a session shows a stop it has not confirmed: past the server's 15 s for the agent to stop, it shows as it stands. */
export const STOP_SHOWN_MS = 20_000;

/** A turn under way that Stop ends. One still starting is not: until its agent has its message, there is nothing to stop. */
export const turnOn = (l: LiveState | null | undefined): boolean => !!l && (l.status === 'working' || l.status === 'waiting');

/** The turn you stopped is still under way, as `l` says. */
export const stoppedTurnOn = (stop: Stop, l: LiveState | null | undefined): boolean =>
  stop.turn && turnOn(l) && (stop.turnStartedAt === undefined || l!.turnStartedAt === undefined || l!.turnStartedAt === stop.turnStartedAt);

/** The background tasks you stopped that `l` says still run. */
export const stoppedTasksOn = (stop: Stop, l: LiveState | null | undefined) =>
  stop.tasks.length ? (l?.backgroundTasks ?? []).filter((t) => t.status === 'running' && stop.tasks.includes(t.id)) : [];

/** What a stop is, from what the session is doing as you press Stop: none when there is nothing it would stop. */
export function stopOf(scope: StopScope, l: LiveState | null | undefined, helpers: number | undefined, at: number): Stop | null {
  // Waiting for its memory to be built, Stop answers that card (it starts the agent): that shows as it happens.
  if (l?.memory) return null;
  const turn = turnOn(l);
  const tasks = scope === 'all' ? (l?.backgroundTasks ?? []).filter((t) => t.status === 'running').map((t) => t.id) : [];
  const subs = scope === 'all' && !!helpers;
  if (!turn && !tasks.length && !subs) return null;
  return { at, scope, turn, ...(turn && l?.turnStartedAt ? { turnStartedAt: l.turnStartedAt } : {}), tasks, helpers: subs };
}

/** A session's live state as it shows with a stop: the turn you stopped over, with nothing waiting for you, and the tasks you stopped ended. */
export function stoppedLive(stop: Stop, l: LiveState | null): LiveState | null {
  if (!l) return l;
  const turn = stoppedTurnOn(stop, l);
  const tasks = stoppedTasksOn(stop, l);
  if (!turn && !tasks.length) return l;
  const out: LiveState = { ...l };
  if (turn) {
    out.status = 'idle';
    delete out.turnStartedAt;
    out.pendingApprovals = 0;
  }
  if (tasks.length) {
    out.backgroundTasks = (l.backgroundTasks ?? []).filter((t) => !tasks.includes(t));
    out.endedTasks = [...tasks.map((t) => ({ ...t, status: 'stopped', endedAt: stop.at })), ...(l.endedTasks ?? [])];
  }
  return out;
}

/** What is under way in a session as it shows with a stop: no card from the turn you stopped waits for an answer. */
export const stoppedOverlay = (stop: Stop, l: LiveState | null, ov: LiveOverlay): LiveOverlay => (ov.approvals.length && stoppedTurnOn(stop, l) ? { ...ov, approvals: [] } : ov);

/** The last turn end a conversation has (by its id), to tell when the turn you stopped has its own. */
export function lastEnd(items: TimelineItem[]): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].kind === 'turn') return items[i].id;
}

/** A step of a turn you stopped: one under way shows stopped, a text being written as it stands. */
function stoppedItem(it: TimelineItem): TimelineItem {
  if (it.kind === 'tool' && (it.tool.status === 'running' || it.tool.status === 'pending' || it.tool.status === 'waiting')) return { ...it, tool: { ...it.tool, status: 'interrupted' } };
  if ((it.kind === 'assistant' || it.kind === 'thinking') && it.streaming) return { ...it, streaming: false };
  return it;
}

/**
 * The conversation as it shows with a stop, until its own end comes: what was under way since the last turn's end shows
 * stopped, and an end closes it ("Stopped after …", as long as the turn had run when you pressed Stop). Unchanged when the
 * last turn has its end already.
 */
export function stoppedTurn(items: TimelineItem[], stop: Stop): TimelineItem[] {
  let from = items.length;
  while (from > 0 && items[from - 1].kind !== 'turn') from--;
  if (from === items.length) return items;
  const end: TimelineItem = {
    kind: 'turn',
    id: `stopped:${stop.at}`,
    seq: 0,
    ts: stop.at,
    status: 'interrupted',
    ...(stop.turnStartedAt ? { durationMs: Math.max(0, stop.at - stop.turnStartedAt) } : {}),
  };
  return [...items.slice(0, from), ...items.slice(from).map(stoppedItem), end];
}

// ---- the stops a page shows ------------------------------------------------------------

/** What the stops a page shows need of it (lib/store.ts gives its stores; tests give their own). */
export interface StopHost {
  /** What the page has of a session: its live state with what is under way, its summary, its conversation (null while it first loads). */
  session(key: string): { live?: { live: LiveState | null; overlay: LiveOverlay }; summary?: SessionSummary; items?: TimelineItem[] | null };
  /** Shows the session again as the page has it, now through the stop just begun. */
  show(key: string): void;
  /** Shows the session as the server has it now, fetched afresh: what the stop showed differently goes. */
  refresh(key: string): void;
  /** The stops shown changed: each conversation ends its stopped turn while its stop lasts. */
  changed(stops: Record<string, Stop>): void;
}

/**
 * A stop shown until the session says so itself in every part: the turn you stopped over, its end written in its
 * conversation (when one is open here), the tasks and Hydor subagents you stopped with it no longer running.
 */
interface Stopping {
  stop: Stop;
  turnOver: boolean;
  tasksOver: boolean;
  helpersOver: boolean;
  endWritten: boolean;
  /** The last turn end its conversation had as you pressed Stop: a new one is the stopped turn's. */
  lastEnd?: string;
  /** A Hydor subagent stopped with the session that started it: it shows stopped, not done. */
  withParent: boolean;
  timer: unknown;
}

export interface StopClock {
  now: () => number;
  later: (fn: () => void, ms: number) => unknown;
  cancel: (timer: unknown) => void;
}

const realClock: StopClock = { now: () => Date.now(), later: (fn, ms) => setTimeout(fn, ms), cancel: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) };

/**
 * The stops a page shows. What the server says of a session goes through `live` and `summary` on its way into the page's
 * stores (and its conversation through `items`): as it is, or as its stop shows it while one lasts. A stop ends once the
 * session has said it in every part, after STOP_SHOWN_MS without that, or when you send it a message (`end`): it then
 * shows as the server has it.
 */
export function stopRegistry(host: StopHost, clock: StopClock = realClock) {
  const all = new Map<string, Stopping>();
  // The live states made to show a stop: a summary that carries one (a copy of the one shown) says nothing new of its session.
  const shownLives = new WeakSet<LiveState>();
  const publish = () => host.changed(Object.fromEntries([...all].map(([k, st]) => [k, st.stop])));

  /** What a session said of itself (`l`, as it is): whether the turn and tasks you stopped have stopped. */
  const heard = (st: Stopping, l: LiveState | null | undefined) => {
    if (l && shownLives.has(l)) return;
    if (!stoppedTurnOn(st.stop, l)) st.turnOver = true;
    if (!stoppedTasksOn(st.stop, l).length) st.tasksOver = true;
  };

  const end = (key: string) => {
    const st = all.get(key);
    if (!st) return;
    all.delete(key);
    clock.cancel(st.timer);
    publish();
    host.refresh(key);
  };

  /** Ends a stop the session has said in every part; says whether it did. */
  const settled = (key: string): boolean => {
    const st = all.get(key);
    if (!st || !(st.turnOver && st.tasksOver && st.helpersOver && st.endWritten)) return false;
    end(key);
    return true;
  };

  const shownLive = (st: Stopping, l: LiveState | null): LiveState | null => {
    const shown = stoppedLive(st.stop, l);
    if (shown && shown !== l) shownLives.add(shown);
    return shown;
  };

  return {
    /** Whether a session shows a stop. */
    has: (key: string) => all.has(key),

    /**
     * Shows a session stopped at once, when Stop stops something of it (`withParent`: it is a Hydor subagent stopped with
     * the session that started it). Says whether it does.
     */
    begin(key: string, scope: StopScope, withParent = false): boolean {
      if (all.has(key)) return true;
      const now = host.session(key);
      const stop = stopOf(scope, now.live?.live ?? now.summary?.live ?? null, now.summary?.helpers, clock.now());
      if (!stop) return false;
      all.set(key, {
        stop,
        turnOver: !stop.turn,
        tasksOver: !stop.tasks.length,
        helpersOver: !stop.helpers,
        endWritten: !stop.turn || !now.items,
        lastEnd: now.items ? lastEnd(now.items) : undefined,
        withParent,
        timer: clock.later(() => end(key), STOP_SHOWN_MS),
      });
      publish();
      host.show(key);
      return true;
    },

    end,

    /** A session's live state and what is under way in it, as the page shows them. */
    live(key: string, l: LiveState | null, ov: LiveOverlay): { live: LiveState | null; overlay: LiveOverlay } {
      const st = all.get(key);
      if (!st) return { live: l, overlay: ov };
      heard(st, l);
      if (settled(key)) return { live: l, overlay: ov };
      return { live: shownLive(st, l), overlay: stoppedOverlay(st.stop, l, ov) };
    },

    /** A session's summary as the page shows it. */
    summary(s: SessionSummary): SessionSummary {
      const st = all.get(s.key);
      if (!st) return s;
      heard(st, s.live);
      // None running is undefined from the server; a stop's own count of none is 0, which a copy of the shown summary carries.
      if (s.helpers === undefined) st.helpersOver = true;
      if (settled(s.key)) return s;
      return {
        ...s,
        live: s.live ? shownLive(st, s.live) : s.live,
        ...(st.stop.helpers ? { helpers: 0 } : {}),
        ...(st.withParent && !s.extra?.stoppedWithParent ? { extra: { ...s.extra, stoppedWithParent: st.stop.at } } : {}),
      };
    },

    /** A session's conversation came in: the turn you stopped has its end once one comes that was not there as you pressed Stop. */
    items(key: string, items: TimelineItem[]) {
      const st = all.get(key);
      if (!st || st.endWritten || lastEnd(items) === st.lastEnd) return;
      st.endWritten = true;
      settled(key);
    },
  };
}

export type StopRegistry = ReturnType<typeof stopRegistry>;

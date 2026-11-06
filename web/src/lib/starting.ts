// A session started from the start page shows at once. Its page opens on a stand-in with your message and the agent
// at work, as the session's own page shows them (features/session/StartingSession.tsx), while the server starts the
// agent, and becomes the session itself as soon as the server answers and the session can show: its summary, its
// conversation and your message in it, so it never shows half-loaded. Should it not start, the stand-in says why,
// and your message (with what went with it) waits in the start page's box again. An answer lost on the way (a phone
// that slept, a network that changed) is not taken for a start that failed: the page asks the server what came of
// the start and sends it again only if it never arrived, since the server makes one session per start.
import { create } from 'zustand';
import type { Agent, LiveOverlay, LiveState, SessionSummary } from '@shared/types';
import { api, enc, lostOnTheWay, post } from './api';
import { sendingPictures, type Attachment } from './attachments';
import { keepStartDraft, startDraft, type StartDraft } from './drafts';
import { machineBase } from './machine';
import { go, sessionPath } from './nav';
import { toast, useLive, useSessions, useTimeline } from './store';

export interface Starting {
  id: string;
  agent: Agent;
  /** An agent of Settings → More agents: its name, for its icon. */
  acpName?: string;
  /** What the session is called until it has a title of its own (as the server names it: its first words). */
  title: string;
  /** What was written, and what went with it. */
  text: string;
  atts: Attachment[];
  /** Where it works (empty while a task folder is being made for it). */
  cwd: string;
  /** When Start was pressed. */
  at: number;
  /** The session, once the server has started it. */
  key?: string;
  /** The session can show now: the stand-in becomes it. */
  ready?: boolean;
  /** Its start's answer was lost on the way: the page is asking the server what came of it. */
  reconnecting?: boolean;
  /** Why it did not start. */
  error?: string;
  /**
   * The server could not be reached to start it or to say whether it started: Try again asks again (`retry`), or the
   * server cannot say (`unsure`: an older version, on another machine).
   */
  lost?: 'retry' | 'unsure';
}

/** What the stand-in shows of the session to be. */
export type StartShown = Pick<Starting, 'agent' | 'acpName' | 'title' | 'text' | 'atts' | 'cwd'>;

export const useStarting = create<{ byId: Record<string, Starting> }>(() => ({ byId: {} }));

const change = (id: string, p: Partial<Starting>) => useStarting.setState((s) => (s.byId[id] ? { byId: { ...s.byId, [id]: { ...s.byId[id], ...p } } } : s));

/** A stand-in's address is /s/new-…: no session's key looks like that (theirs are agent:id). */
export const isStartingKey = (key: string) => key.startsWith('new-');

/** Whether this page shows `path` now (the session's stand-in, not another page moved to meanwhile). */
const showing = (path: string) => location.pathname === machineBase + path;

/** Try again, for each start the server could not be reached for. */
const again = new Map<string, () => void>();

/**
 * Opens a new session's page at once and starts the session with what `body` makes (the body of POST /api/sessions,
 * made once: a task folder may be made for it). `draft`: the start page's box as it was sent, which gets it back
 * should the session not start.
 */
export function startSession(s: StartShown, body: () => Promise<Record<string, unknown>>, draft: StartDraft) {
  const at = Date.now();
  // Also the start's id on the server, which makes one session for it however often it is sent.
  const id = `new-${at.toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  useStarting.setState((x) => ({ byId: { ...x.byId, [id]: { ...s, id, at } } }));
  const here = sessionPath(id);
  go(here);
  const start: Start = { id, body, sent: false };
  const run = async () => {
    let key: string;
    try {
      key = await reach(start);
    } catch (e) {
      const lost = e instanceof Unreached ? 'retry' : e instanceof Unsure ? 'unsure' : undefined;
      const why = lost === 'retry' ? RETRY : lost === 'unsure' ? UNSURE : (e as Error)?.message || 'The session did not start';
      // The box gets it back, unless something new was written there meanwhile.
      if (showing(here) || !startDraft()) keepStartDraft(draft);
      if (lost === 'retry')
        again.set(id, () => {
          change(id, { error: undefined, lost: undefined, reconnecting: true });
          void run();
        });
      change(id, { error: why, lost, reconnecting: false });
      if (!showing(here)) toast(lost === 'retry' ? 'The app could not be reached: check the connection, then try again.' : lost ? why : `The session did not start: ${why}`, 'error');
      return;
    }
    again.delete(id);
    // Started after all (Try again): the box no longer needs it, unless something new was written there meanwhile.
    if (startDraft() === draft) keepStartDraft(null, false);
    change(id, { key, reconnecting: false });
    // Its pictures show in your message until the agent has written it down, as when sent from a session's own box.
    sendingPictures(key, s.text, s.atts)(true);
    await load(key);
    // The stand-in, if it is on screen (now or when you come back to it), becomes the session.
    change(id, { ready: true });
    setTimeout(() => forget(id), 5 * 60_000);
  };
  void run();
}

/** Try again, for a start the server could not be reached for: it asks what came of it, and sends it only if it never arrived. */
export function retryStart(id: string) {
  const fn = again.get(id);
  again.delete(id);
  fn?.();
}

/** The stand-in is done with: a session that did not start, once you go back to the start page. */
export function forget(id: string) {
  again.delete(id);
  useStarting.setState((s) => {
    if (!s.byId[id]) return s;
    const byId = { ...s.byId };
    delete byId[id];
    return { byId };
  });
}

// ---- sending a start, and asking after one whose answer was lost ----------------------------------------------------

const RETRY = 'Check the connection, then try again. If the session started already, it opens: it never starts twice.';
const UNSURE = 'The connection dropped before the app answered. If the session started, it is in the list.';

/** The server could not be reached, for long enough to say so. */
class Unreached extends Error {}
/** The server cannot say what came of a start (an older version, without GET /api/sessions/start/:id). */
class Unsure extends Error {}

interface Start {
  id: string;
  body: () => Promise<Record<string, unknown>>;
  /** What it sends, once made. */
  made?: Record<string, unknown>;
  /** It went out at least once, so the server may have it. */
  sent: boolean;
}

/** How long to wait before asking again while the server cannot be reached, in view; then the page says so (Try again). */
const WAITS = [1, 2, 3, 5, 8, 13, 15, 15].map((s) => s * 1000);

/**
 * Sends the start and returns its session's key. Should the answer be lost on the way, it asks the server what came
 * of the start (the session it made, or that it is making it now) and sends it again only if it never arrived. Offline
 * it waits; only tries made with the stand-in on screen count towards saying the server could not be reached, so one
 * left for another page (or a phone put away) keeps trying, "Starting" in the sidebar, until the server answers.
 */
async function reach(st: Start): Promise<string> {
  for (let missed = 0; ; ) {
    try {
      if (st.sent) {
        const r = await api<{ key: string | null; starting: boolean }>(`/api/sessions/start/${enc(st.id)}`).catch((e) => {
          throw lostOnTheWay(e) ? e : new Unsure();
        });
        if (r.key) return r.key;
        // Being made now: it is the server's answer to wait for.
        if (r.starting) {
          await pause(1500);
          continue;
        }
      }
      st.made ??= await st.body();
      st.sent = true;
      return (await post<{ key: string }>('/api/sessions', { ...st.made, startId: st.id })).key;
    } catch (e) {
      if (!lostOnTheWay(e)) throw e;
      if (missed >= WAITS.length) throw new Unreached();
      change(st.id, { reconnecting: true });
      const seen = document.visibilityState === 'visible' && showing(sessionPath(st.id));
      await pause(WAITS[Math.min(missed, WAITS.length - 1)]);
      if (seen) missed++;
      await online();
    }
  }
}

/** Waits `ms`, or less should the page come back into view or online (a phone woken, a network back). */
function pause(ms: number): Promise<void> {
  return new Promise((done) => {
    const end = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener('online', end);
      done();
    };
    const back = () => document.visibilityState === 'visible' && end();
    const timer = setTimeout(end, ms);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('online', end);
  });
}

/** Resolves once the browser is online. */
function online(): Promise<void> {
  if (navigator.onLine !== false) return Promise.resolve();
  return new Promise((done) => window.addEventListener('online', () => done(), { once: true }));
}

/** What the session's page needs to show at once: its summary, its live state with your message, its conversation. */
async function load(key: string) {
  const summary = api<{ summary: SessionSummary | null; live: LiveState | null; overlay: LiveOverlay }>(`/api/sessions/${enc(key)}`).then(
    (r) => {
      if (r.summary) useSessions.getState().upsert([r.summary]);
      useLive.getState().set(key, r.live, r.overlay);
    },
    () => {},
  );
  await Promise.all([summary, useTimeline.getState().load(key)]);
}

const NO_STATS = { userMessages: 1, assistantMessages: 0, toolCalls: 0, commands: 0, backgroundCommands: 0, filesChanged: 0, linesAdded: 0, linesRemoved: 0, turns: 0, tokensIn: 0, tokensOut: 0, tokensCached: 0 };

/**
 * The sidebar's rows for sessions still starting: each shows at once, at the top of Active, as the session will
 * ("Starting", its first words for a title), until the session itself is in the list. One that did not start
 * leaves it (its page says why).
 */
export function startingRows(byId: Record<string, Starting>, listed: Record<string, SessionSummary | undefined>): SessionSummary[] {
  const all = Object.values(byId).filter((st) => !st.error);
  if (!all.length) return [];
  // The session can be in the list a moment before its start is answered: one made since, with your message.
  const since = Math.min(...all.map((st) => st.at)) - 5_000;
  const fresh = Object.values(listed).filter((s): s is SessionSummary => !!s && (s.createdAt ?? 0) >= since);
  return all
    .filter((st) => !(st.key && listed[st.key]) && !fresh.some((s) => s.agent === st.agent && (s.createdAt ?? 0) >= st.at - 5_000 && !!st.text && s.firstPrompt === st.text.slice(0, 300)))
    .map((st) => ({
      key: st.id,
      id: st.id,
      agent: st.agent,
      acpName: st.acpName,
      title: st.title,
      firstPrompt: st.text,
      cwd: st.cwd || undefined,
      createdAt: st.at,
      updatedAt: st.at,
      stats: NO_STATS,
      live: { status: 'starting', startedAt: st.at, pendingApprovals: 0 },
    }));
}

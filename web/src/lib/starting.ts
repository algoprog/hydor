// A session started from the start page shows at once. Its page opens on a stand-in with your message and the agent
// at work, as the session's own page shows them (features/session/StartingSession.tsx), while the server starts the
// agent, and becomes the session itself as soon as the server answers and the session can show: its summary, its
// conversation and your message in it, so it never shows half-loaded. Should it not start, the stand-in says why,
// and your message (with what went with it) waits in the start page's box again.
import { create } from 'zustand';
import type { Agent, LiveOverlay, LiveState, SessionSummary } from '@shared/types';
import { api, enc } from './api';
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
  /** Why it did not start. */
  error?: string;
}

export const useStarting = create<{ byId: Record<string, Starting> }>(() => ({ byId: {} }));

const change = (id: string, p: Partial<Starting>) => useStarting.setState((s) => (s.byId[id] ? { byId: { ...s.byId, [id]: { ...s.byId[id], ...p } } } : s));

/** A stand-in's address is /s/new-…: no session's key looks like that (theirs are agent:id). */
export const isStartingKey = (key: string) => key.startsWith('new-');

/** Whether this page shows `path` now (the session's stand-in, not another page moved to meanwhile). */
const showing = (path: string) => location.pathname === machineBase + path;

/**
 * Opens a new session's page at once and starts the session with `create`, which returns its key. `draft`: the
 * start page's box as it was sent, which gets it back should the session not start.
 */
export function startSession(s: Omit<Starting, 'id' | 'at' | 'key' | 'ready' | 'error'>, create: () => Promise<string>, draft: StartDraft) {
  const at = Date.now();
  const id = `new-${at.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  useStarting.setState((x) => ({ byId: { ...x.byId, [id]: { ...s, id, at } } }));
  const here = sessionPath(id);
  go(here);
  void (async () => {
    let key: string;
    try {
      key = await create();
    } catch (e) {
      const why = (e as Error)?.message || 'The session did not start';
      // The box gets it back, unless something new was written there meanwhile.
      if (showing(here) || !startDraft()) keepStartDraft(draft);
      change(id, { error: why });
      if (!showing(here)) toast(`The session did not start: ${why}`, 'error');
      return;
    }
    change(id, { key });
    // Its pictures show in your message until the agent has written it down, as when sent from a session's own box.
    sendingPictures(key, s.text, s.atts)(true);
    await load(key);
    // The stand-in, if it is on screen (now or when you come back to it), becomes the session.
    change(id, { ready: true });
    setTimeout(() => forget(id), 5 * 60_000);
  })();
}

/** The stand-in is done with: a session that did not start, once you go back to the start page. */
export function forget(id: string) {
  useStarting.setState((s) => {
    if (!s.byId[id]) return s;
    const byId = { ...s.byId };
    delete byId[id];
    return { byId };
  });
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

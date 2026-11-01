// Agent Guidelines: what the user wants every agent to follow, for every session, for a space (the space's own
// field, server/spaces) or for one session (its extra.guidelines). Every agent the app starts gets them in one
// block, the most general first: Claude Code and Codex in their instructions, ACP agents with their first
// message, Custom before each turn. When they change, an idle Claude Code or Codex session starts its agent
// afresh before the next message, so it follows the new ones (its conversation carries on).
//
//   GET /api/guidelines?key=&space=   every session's, and the session's and its space's (or a space's)
//   PUT /api/guidelines               { global?, space?: { id, text }, session?: { key, text } }
import crypto from 'node:crypto';
import { MAX_GUIDELINES, type GuidelinesPut, type GuidelinesView } from '../../shared/guidelines.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { setSettings, toneOf } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { spaceById, updateSpace } from '../spaces/index.ts';

const GLOBAL = 'guidelines.global';

export const globalGuidelines = (db: DB): string => kvGet(db, GLOBAL) ?? '';

const clip = (v: unknown) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_GUIDELINES);

export function setGlobalGuidelines(db: DB, text: unknown) {
  kvSet(db, GLOBAL, clip(text));
}

/** The block an agent gets for a session with these settings; empty when no level has any. */
export function guidelinesBlock(db: DB, extra: SessionExtra): string {
  const parts: string[] = [];
  const g = globalGuidelines(db).trim();
  if (g) parts.push(`## For every session\n${g}`);
  const sp = typeof extra.space === 'string' ? spaceById(db, extra.space) : null;
  if (sp?.instructions?.trim()) parts.push(`## For the space “${sp.name}”\n${sp.instructions.trim()}`);
  const s = typeof extra.guidelines === 'string' ? clip(extra.guidelines) : '';
  if (s) parts.push(`## For this session\n${s}`);
  if (!parts.length) return '';
  return [
    '# Agent Guidelines',
    'The user’s own guidelines for every agent here, the most general first. Follow them throughout; where two disagree, the more specific (later) one wins, and what the user asks in the conversation comes first.',
    '',
    parts.join('\n\n'),
  ].join('\n');
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('base64url').slice(0, 16);

/** What each agent process was started with, by its run id: a later change starts it afresh. */
const given = new Map<string, string>();
function remember(runId: string, block: string) {
  given.delete(runId);
  given.set(runId, hash(block));
  // A few hundred runs at most: the oldest go.
  if (given.size > 500) given.delete(given.keys().next().value!);
}

export function guidelinesView(db: DB, o: { key?: string; space?: string }): GuidelinesView {
  const out: GuidelinesView = { global: globalGuidelines(db) };
  const extra = o.key ? sessionExtra(db, o.key) : {};
  const spaceId = o.space || (typeof extra.space === 'string' ? extra.space : '');
  const sp = spaceId ? spaceById(db, spaceId) : null;
  if (sp) out.space = { id: sp.id, name: sp.name, text: sp.instructions ?? '' };
  if (o.key) out.session = { key: o.key, text: typeof extra.guidelines === 'string' ? extra.guidelines : '' };
  return out;
}

export function putGuidelines(d: Pick<Deps, 'db' | 'sessions' | 'broadcast'>, b: GuidelinesPut) {
  if (b.global !== undefined) setGlobalGuidelines(d.db, b.global);
  if (b.space) {
    if (!spaceById(d.db, String(b.space.id))) throw new HttpError(404, 'No such space');
    updateSpace(d.db, String(b.space.id), { instructions: clip(b.space.text) });
    d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
  }
  if (b.session) {
    const key = String(b.session.key ?? '');
    if (!d.sessions.summary(key)) throw new HttpError(404, 'No such session');
    setSessionExtra(d.db, key, { guidelines: clip(b.session.text) || null });
    d.sessions.queueSummary(key);
  }
  d.broadcast({ t: 'feature', id: 'guidelines', data: { changed: true } });
}

export const guidelines: Feature = {
  id: 'guidelines',
  routes(d) {
    d.app.get('/api/guidelines', async (req) => {
      const q = req.query as { key?: string; space?: string };
      return guidelinesView(d.db, { key: q.key ? String(q.key) : undefined, space: q.space ? String(q.space) : undefined });
    });
    d.app.put('/api/guidelines', async (req) => {
      const b = (req.body ?? {}) as GuidelinesPut;
      putGuidelines(d, b);
      return guidelinesView(d.db, { key: b.session?.key, space: b.space?.id });
    });
  },
  spawn(s, d) {
    const block = guidelinesBlock(d.db, s.extra);
    remember(s.runId, block);
    return block ? { instructions: [block] } : undefined;
  },
  async beforeSend(key, d) {
    // Claude Code and Codex read their instructions once, when they start: changed guidelines start them afresh.
    if (!key.startsWith('claude:') && !key.startsWith('codex:')) return;
    const run = d.sessions.runOf(key);
    const was = run ? given.get(run) : undefined;
    if (!run || was === undefined) return;
    const st = d.sessions.adapterByRun(run)?.state;
    // Not mid-turn, nor with a goal or work in the background, which a new process would lose.
    if (!st || st.status !== 'idle' || st.goal || st.backgroundTasks?.length) return;
    if (hash(guidelinesBlock(d.db, sessionExtra(d.db, key))) === was) return;
    await d.sessions.recycle(key);
  },
  start(d) {
    // "How the agents talk to you" became part of the guidelines for every session.
    const tone = toneOf(d.db).trim();
    if (!tone) return;
    const g = globalGuidelines(d.db).trim();
    setGlobalGuidelines(d.db, `${g ? `${g}\n\n` : ''}How to talk to me: ${tone}`);
    setSettings(d.db, { tone: '' });
  },
};

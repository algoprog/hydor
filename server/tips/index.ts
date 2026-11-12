// Tips after the welcome tour (shared/tips.ts): which were shown and whether they are on, kept here so every device
// shows each tip once, and skipping them anywhere stops them everywhere. Open pages hear of a change at once.
// Another machine's pages use this server's, as they do its tour.
import { COSTLY_MODES, isCostlyMode, isTipId, TIP_IDS, type CostlyMode, type TipId, type TipsState } from '../../shared/tips.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Feature } from '../features/types.ts';

const KEY = 'tips';
/** Where POST /api/tour keeps the tour version finished or skipped. */
const TOUR_KEY = 'tour.seen';

/** What is kept: tips are on unless turned off, and the ids shown, in order. */
interface Kept {
  off?: boolean;
  seen?: unknown;
  explained?: unknown;
}

function kept(db: DB): Kept {
  try {
    const v: unknown = JSON.parse(kvGet(db, KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Kept) : {};
  } catch {
    return {};
  }
}

export function tipsState(db: DB): TipsState {
  const k = kept(db);
  // Ids an older or newer version knew and this one does not are left out.
  const seen = Array.isArray(k.seen) ? [...new Set(k.seen.filter(isTipId))] : [];
  const explained = Array.isArray(k.explained) ? [...new Set(k.explained.filter(isCostlyMode))] : [];
  return { on: k.off !== true, seen, tour: Number(kvGet(db, TOUR_KEY) ?? 0) || 0, explained };
}

/**
 * Turns tips on or off, marks tips as shown, or shows every tip again (`reset`, before `seen`; it shows the costly
 * modes' explanations again too); `explained` marks costly modes as explained. A tip or mode it does not know is
 * refused, so a mistyped one is not dropped unseen.
 */
export function setTips(db: DB, body: unknown): TipsState {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as { on?: unknown; seen?: unknown; reset?: unknown; explained?: unknown };
  if (b.on !== undefined && typeof b.on !== 'boolean') throw new HttpError(400, 'on: true to show tips, false to stop them');
  if (b.reset !== undefined && typeof b.reset !== 'boolean') throw new HttpError(400, 'reset: true to show every tip again');
  if (b.seen !== undefined && !Array.isArray(b.seen)) throw new HttpError(400, `seen: a list of tips shown already: ${TIP_IDS.join(', ')}`);
  const unknown = ((b.seen as unknown[] | undefined) ?? []).filter((t) => !isTipId(t));
  if (unknown.length) throw new HttpError(400, `Not a tip: ${unknown.map(String).join(', ')}. The tips: ${TIP_IDS.join(', ')}`);
  if (b.explained !== undefined && !Array.isArray(b.explained)) throw new HttpError(400, `explained: a list of costly modes explained already: ${COSTLY_MODES.join(', ')}`);
  const notMode = ((b.explained as unknown[] | undefined) ?? []).filter((m) => !isCostlyMode(m));
  if (notMode.length) throw new HttpError(400, `Not a costly mode: ${notMode.map(String).join(', ')}. The modes: ${COSTLY_MODES.join(', ')}`);
  if (b.on === undefined && b.reset === undefined && b.seen === undefined && b.explained === undefined) throw new HttpError(400, 'Send on, seen, explained or reset');
  const cur = tipsState(db);
  const seen: TipId[] = b.reset === true ? [] : cur.seen;
  for (const t of (b.seen as TipId[] | undefined) ?? []) if (!seen.includes(t)) seen.push(t);
  const explained: CostlyMode[] = b.reset === true ? [] : cur.explained;
  for (const m of (b.explained as CostlyMode[] | undefined) ?? []) if (!explained.includes(m)) explained.push(m);
  const on = typeof b.on === 'boolean' ? b.on : cur.on;
  kvSet(db, KEY, JSON.stringify({ ...(on ? {} : { off: true }), seen, ...(explained.length ? { explained } : {}) }));
  return tipsState(db);
}

export const tips: Feature = {
  id: 'tips',
  routes(d) {
    d.app.get('/api/tips', async () => tipsState(d.db));
    d.app.put('/api/tips', async (req) => {
      const state = setTips(d.db, req.body);
      d.broadcast({ t: 'feature', id: 'tips', data: state });
      return state;
    });
  },
};

// Spending caps: a session stops when what it has spent, at API prices, reaches its cap. The cap covers
// the child sessions it starts. A turn that runs past it is stopped with a note under it, and new
// messages wait (beforeSend) until the cap is raised or cleared. Scheduled tasks pass a cap to the
// sessions they start with capExtra().
import { parseCap, usd, type BudgetNote, type BudgetState } from '../../shared/budget.ts';
import type { SessionSummary } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { childKeys, parentOf } from '../children/family.ts';
import type { Deps, Feature } from '../features/types.ts';
import { addNote } from '../notes.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { budgetState, capOf, capReached } from './spend.ts';

export { budgetState, capOf, capReached, childShare, spending } from './spend.ts';

/**
 * The settings a new session gets for a cap typed as `v` ("5", 12.5; empty or null for none): merge it
 * into CreateOpts.extra. Throws a 400 for anything that is not an amount from a cent to $100,000.
 */
export function capExtra(v: unknown): { capUsd?: number } {
  const p = parseCap(v);
  if (!p) throw new HttpError(400, 'A spending cap is an amount in dollars, from $0.01 to $100,000');
  return p.cap == null ? {} : { capUsd: p.cap };
}

/** The statuses of a turn that is running. */
const RUNNING = new Set(['working', 'waiting']);
/** When the turn each session was stopped in began, so a turn is stopped (and noted) once. */
const stopped = new Map<string, number>();
/** What each session's pages were last told. */
const told = new Map<string, string>();

const titleOf = (d: Deps, key: string) => d.sessions.summary(key)?.title ?? 'the session that started this one';

/** Tells the pages showing the session where it stands, when that changed. */
function tell(d: Deps, s: BudgetState) {
  const sig = `${s.capUsd}|${s.spentUsd.toFixed(3)}|${s.reached}|${s.parent ? `${s.parent.capUsd}|${s.parent.spentUsd.toFixed(3)}` : ''}`;
  if (told.get(s.key) === sig) return;
  told.set(s.key, sig);
  d.toSubscribers(s.key, { t: 'feature', id: 'budget', key: s.key, data: s });
}

/** Stops a session's running turn at a cap, with a note under it. */
async function stop(d: Deps, key: string, n: BudgetNote) {
  const s = d.sessions.summary(key);
  if (!s?.live || !RUNNING.has(s.live.status)) return;
  const turn = s.live.turnStartedAt ?? 0;
  if (stopped.get(key) === turn) return;
  stopped.set(key, turn);
  await d.sessions.interrupt(key).catch(() => {});
  let anchor: string | undefined;
  try {
    anchor = (await d.sessions.timeline(key)).parser.items.at(-1)?.id;
  } catch {}
  addNote(d.db, { key, kind: 'budget', anchor, data: n });
  d.broadcast({ t: 'toast', level: 'info', text: `Stopped at its spending cap · ${s.title}` });
}

/** Checks a session against its cap and its parent's: tells their pages, and stops what runs past a cap. */
export async function checkBudget(d: Deps, key: string) {
  const capped = [key, parentOf(d.db, key)].filter((k): k is string => !!k && capOf(d.db, k) != null);
  for (const k of capped) {
    const state = budgetState(d.db, k, (x) => titleOf(d, x));
    tell(d, state);
    if (!state.reached) continue;
    // The cap covers the session and its children: whichever is running stops.
    for (const m of [k, ...childKeys(d.db, k)]) await stop(d, m, { capUsd: state.capUsd!, spentUsd: state.spentUsd, parent: m === k ? undefined : { key: k, title: titleOf(d, k) } });
  }
}

/** Whether a session (as the list shows it) has a cap to watch: its own or its parent's. */
const watched = (s: SessionSummary) => typeof s.extra?.capUsd === 'number' || typeof s.extra?.parent === 'string';

export const budget: Feature = {
  id: 'budget',

  routes(d) {
    const keyOf = (req: { params: unknown }) => (req.params as { key: string }).key;
    d.app.get('/api/budget/:key', async (req) => budgetState(d.db, keyOf(req), (x) => titleOf(d, x)));
    /** Sets the cap ({ capUsd }: dollars, or null for none). Messages held back by the old cap go out. */
    d.app.put('/api/budget/:key', async (req) => {
      const key = keyOf(req);
      const p = parseCap((req.body as { capUsd?: unknown } | undefined)?.capUsd);
      if (!p) throw new HttpError(400, 'A spending cap is an amount in dollars, from $0.01 to $100,000');
      const was = capReached(d.db, key);
      setSessionExtra(d.db, key, { capUsd: p.cap });
      d.sessions.queueSummary(key);
      const state = budgetState(d.db, key, (x) => titleOf(d, x));
      tell(d, state);
      // The queue was most likely held by the cap: it goes on now.
      if (was?.key === key && !capReached(d.db, key) && d.sessions.summary(key)?.queueHeld) d.sessions.resumeQueue(key);
      return state;
    });
  },

  beforeSend(key, d) {
    const r = capReached(d.db, key);
    if (!r) return;
    if (r.key === key) throw new HttpError(402, `This session has spent ${usd(r.spentUsd)} of its ${usd(r.capUsd)} spending cap. Raise or clear the cap (the session's ⋯ menu → Spending cap) to send more.`);
    throw new HttpError(402, `The session that started this one ("${titleOf(d, r.key)}") has spent ${usd(r.spentUsd)} of its ${usd(r.capUsd)} spending cap, which covers this one too. Raise or clear that session's cap to go on.`);
  },

  start(d) {
    // Spending grows as transcripts do: each indexed change comes as a list update.
    d.sessions.on('sessions', (upsert: SessionSummary[]) => {
      for (const s of upsert) if (watched(s)) void checkBudget(d, s.key).catch(() => {});
    });
    // And while turns run, every few seconds besides.
    setInterval(() => {
      for (const [key, l] of d.sessions.lives) if (RUNNING.has(l.adapter.state.status)) void checkBudget(d, key).catch(() => {});
    }, 4000).unref();
  },
};

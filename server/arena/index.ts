// The model arena: a session started with other models picked under the start page's Options becomes a
// match. The same prompt goes to each model, in a session of its own (with the same folder, files and
// settings); the pages show their answers side by side, and the one the user keeps wins: the others are
// archived. Every decided match counts toward a rating per model (Elo), so the Arena tab shows which models
// win on the user's own tasks.
import crypto from 'node:crypto';
import { contenderId, type ArenaEntry, type ArenaMatch, type ArenaStanding, type ArenaState, type Contender } from '../../shared/arena.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import type { CreateOpts } from '../sessions.ts';

const made = new WeakSet<DB>();
function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`create table if not exists arena_matches (id text primary key, prompt text not null, created_at integer not null, entries text not null, winner text, decided_at integer)`);
  made.add(db);
}

interface Row {
  id: string;
  prompt: string;
  created_at: number;
  entries: string;
  winner: string | null;
  decided_at: number | null;
}

const toMatch = (r: Row): ArenaMatch => ({ id: r.id, prompt: r.prompt, createdAt: r.created_at, entries: JSON.parse(r.entries), ...(r.winner ? { winner: r.winner, decidedAt: r.decided_at ?? undefined } : {}) });

export function getMatch(db: DB, id: string): ArenaMatch | null {
  tables(db);
  const r = db.prepare('select * from arena_matches where id = ?').get(id) as Row | undefined;
  return r ? toMatch(r) : null;
}

export function matches(db: DB, limit = 100): ArenaMatch[] {
  tables(db);
  return (db.prepare('select * from arena_matches order by created_at desc limit ?').all(limit) as Row[]).map(toMatch);
}

/**
 * Starts the other models of a match beside the session the start page made (`main`), with its prompt,
 * folder and settings. Each session's settings name the match. Models that fail to start are left out.
 */
export async function startMatch(d: Pick<Deps, 'db' | 'sessions' | 'broadcast'>, main: ArenaEntry, opts: CreateOpts, others: Contender[]): Promise<ArenaMatch> {
  tables(d.db);
  const id = `ar${crypto.randomBytes(5).toString('hex')}`;
  const { arena: _a, ...extra } = opts.extra ?? {};
  const started = await Promise.all(
    others.map(async (c): Promise<ArenaEntry | null> => {
      try {
        const key = await d.sessions.create({ ...opts, agent: c.agent, acpAgent: c.acpAgent, model: c.model, effort: undefined, mode: undefined, account: undefined, remember: false, extra: { ...extra, arena: id } });
        return { ...c, key };
      } catch (e) {
        d.broadcast({ t: 'toast', level: 'error', text: `Arena: ${(e as Error).message}` });
        return null;
      }
    }),
  );
  const entries = [main, ...started.filter((x): x is ArenaEntry => !!x)];
  setSessionExtra(d.db, main.key, { arena: id });
  d.sessions.queueSummary(main.key);
  d.db.prepare('insert into arena_matches (id, prompt, created_at, entries) values (?, ?, ?, ?)').run(id, (opts.prompt ?? '').slice(0, 2000), Date.now(), JSON.stringify(entries));
  d.broadcast({ t: 'feature', id: 'arena', data: { changed: id } });
  return getMatch(d.db, id)!;
}

/** The user keeps one answer: it wins the match, and the other sessions are archived (still there to look at). */
export function pickWinner(d: Pick<Deps, 'db' | 'sessions' | 'broadcast'>, id: string, key: string): ArenaMatch {
  const m = getMatch(d.db, id);
  if (!m) throw new HttpError(404, 'No such match');
  if (!m.entries.some((e) => e.key === key)) throw new HttpError(400, 'That session is not in this match');
  d.db.prepare('update arena_matches set winner = ?, decided_at = ? where id = ?').run(key, Date.now(), id);
  for (const e of m.entries) d.sessions.setFlags(e.key, { archived: e.key !== key });
  d.broadcast({ t: 'feature', id: 'arena', data: { changed: id } });
  return getMatch(d.db, id)!;
}

/** Each model's rating over the decided matches, in the order they were decided: the kept one beat each of the others. */
export function standings(list: ArenaMatch[]): ArenaStanding[] {
  const K = 24;
  const by = new Map<string, ArenaStanding>();
  const of = (c: Contender) => {
    const id = contenderId(c);
    let s = by.get(id);
    if (!s) by.set(id, (s = { id, agent: c.agent, ...(c.acpAgent ? { acpAgent: c.acpAgent } : {}), ...(c.model ? { model: c.model } : {}), rating: 1000, wins: 0, played: 0 }));
    return s;
  };
  for (const m of list.filter((x) => x.winner).sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0))) {
    const w = m.entries.find((e) => e.key === m.winner);
    if (!w) continue;
    const ws = of(w);
    ws.wins++;
    for (const e of m.entries) {
      const s = of(e);
      s.played++;
      if (e === w || contenderId(e) === ws.id) continue;
      const expect = 1 / (1 + 10 ** ((s.rating - ws.rating) / 400));
      ws.rating += K * (1 - expect);
      s.rating -= K * (1 - expect);
    }
  }
  return [...by.values()].map((s) => ({ ...s, rating: Math.round(s.rating) })).sort((a, b) => b.rating - a.rating || b.wins - a.wins);
}

export function arenaState(db: DB): ArenaState {
  tables(db);
  const all = (db.prepare('select * from arena_matches order by created_at desc').all() as Row[]).map(toMatch);
  return { matches: all.slice(0, 100), board: standings(all) };
}

export const arena: Feature = {
  id: 'arena',
  routes(d) {
    d.app.get('/api/arena', async () => arenaState(d.db));
    d.app.get('/api/arena/:id', async (req) => {
      const m = getMatch(d.db, (req.params as { id: string }).id);
      if (!m) throw new HttpError(404, 'No such match');
      return m;
    });
    d.app.post('/api/arena/:id/winner', async (req) => pickWinner(d, (req.params as { id: string }).id, String((req.body as { key?: string } | undefined)?.key ?? '')));
  },
};

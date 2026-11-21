// Made-up goals, one for each place a goal can stand, for the words' test and for looking at every screen without the
// server: a shop's search that must put the right product first and stay fast (the design's own example, research/goal-mode).
// Nothing in the app imports this but the test and the development preview.
import { GOAL_SETTINGS, type GoalCheck, type GoalQuestion, type GoalResult, type GoalRound, type GoalState, type GoalStatus, type GoalWay } from '@shared/goals';

const MIN = 60000;

export const CHECKS: GoalCheck[] = [
  { id: 'c1', kind: 'command', label: 'Tests pass', run: 'npm test' },
  { id: 'c2', kind: 'command', label: 'Types check', run: 'npm run typecheck' },
  { id: 'c3', kind: 'measure', label: 'Relevance: nDCG@10 at least 0.80', run: 'npm run eval:search', target: { op: '>=', value: 0.8 } },
  { id: 'c4', kind: 'measure', label: 'Speed: 95% of searches under 200 ms', run: 'npm run bench:search', target: { op: '<=', value: 200 }, unit: 'ms' },
  { id: 'c5', kind: 'review', label: 'The search page still shows filters and sorting', claim: 'The search page still shows filters and sorting', evidence: { diff: true } },
];

/** The results of a round: tests and types hold unless said, the page holds, and the two numbers. */
function results(rel: number, speed: number, o: { tests?: boolean; error?: string } = {}): GoalResult[] {
  const start = { rel: 0.61, speed: 340 };
  const near = (v: number, from: number, to: number, ok: boolean) => (ok ? 1 : Math.max(0, Math.min(0.99, (v - from) / (to - from))));
  const tests = o.tests !== false;
  return [
    { id: 'c1', holds: tests, closeness: tests ? 1 : 0, ms: 41000, ...(tests ? {} : { detail: 'FAIL tests/checkout/order.test.ts › keeps the basket order\nTests: 1 failed, 211 passed, 212 total' }) },
    { id: 'c2', holds: true, closeness: 1, ms: 9000 },
    { id: 'c3', holds: rel >= 0.8, value: rel, closeness: near(rel, start.rel, 0.8, rel >= 0.8), ms: 22000 },
    { id: 'c4', holds: speed <= 200, value: speed, closeness: near(speed, start.speed, 200, speed <= 200), ms: 14000 },
    o.error
      ? { id: 'c5', holds: false, closeness: 0, error: o.error, ms: 800 }
      : { id: 'c5', holds: true, closeness: 1, detail: 'The filters and the sort menu are still rendered.', ms: 7000 },
  ];
}

const score = (r: GoalResult[]) => r.reduce((s, x) => s + x.closeness, 0) / r.length;

/** A round that ended at `at` minutes after the goal began, `took` minutes long. */
function round(n: number, at: number, took: number, o: Partial<GoalRound> & { rel: number; speed: number; tests?: boolean; error?: string }, t0: number): GoalRound {
  const rs = results(o.rel, o.speed, { tests: o.tests, error: o.error });
  const { rel: _r, speed: _s, tests: _t, error: _e, ...rest } = o;
  return { n, startedAt: t0 + (at - took) * MIN, endedAt: t0 + at * MIN, results: rs, score: score(rs), outcome: 'kept', usd: 0.5, ...rest };
}

/** The rounds up to the sixth, as the design draws them: 1, 2 and 4 kept, 3, 5 and 6 undone. */
function history(t0: number, undo: boolean): GoalRound[] {
  const out = undo ? 'undone' : 'stays';
  return [
    round(0, 2, 2, { rel: 0.61, speed: 340, outcome: 'start', usd: 0.08 }, t0),
    round(1, 10, 8, { rel: 0.68, speed: 352, way: 'Weighted fields: title ×3, brand ×2', did: 'Weighted the title and brand fields in the index.', usd: 0.52 }, t0),
    round(2, 20, 10, { rel: 0.73, speed: 365, way: 'Stemming and synonyms for plurals and typos', did: 'Added a stemmer and a synonym list.', usd: 0.61 }, t0),
    round(3, 34, 14, { rel: 0.79, speed: 910, way: 'Re-rank the top 50 with a cross-encoder', did: 'Re-ranked the top 50 results with a cross-encoder.', outcome: out, cause: 'behind', why: 'Speed fell far behind its best (365 → 910 ms)', usd: 0.74 }, t0),
    round(4, 43, 9, { rel: 0.73, speed: 208, way: 'Cache parsed queries; index brand names', did: 'Cached parsed queries and indexed brand names.', usd: 0.48 }, t0),
    round(5, 50, 7, { rel: 0.73, speed: 205, way: 'Tune BM25 (k1 and b)', did: 'Tuned k1 and b.', outcome: out, cause: 'none', why: 'No gain', usd: 0.44 }, t0),
    round(
      6,
      58,
      8,
      {
        rel: 0.74,
        speed: 214,
        tests: false,
        way: 'Boost products that are in stock',
        did: 'Added an in-stock boost of 1.3 to the score. Relevance 0.73 → 0.74.',
        outcome: out,
        cause: 'broke',
        why: 'A check that held (Tests pass) stopped holding.',
        usd: 0.39,
      },
      t0,
    ),
  ];
}

const way = (name: string, why: string, expects: string, cost: string): GoalWay => ({ name, why, expects, cost });

export const WAYS: GoalWay[] = [
  way('Keyword and vector search, fused', 'The misses are typos and synonyms; vectors catch those.', 'Relevance +0.06 to +0.10 · Speed about the same', 'about 2 rounds · $1.20 · on Best'),
  way('Learn the ranking from past clicks', 'There are 14 months of click logs to learn from.', 'Relevance +0.03 to +0.06 · Speed +10 to 20 ms', 'about 2 rounds · $0.90'),
  way('Rewrite queries with a small model first', 'Fixes typos before the search runs.', 'Relevance +0.02 to +0.04 · Speed +150 ms or more', '1 round · $0.50'),
];

const asked = (now: number, o: Partial<GoalQuestion> = {}): GoalQuestion => ({
  id: 'q1',
  kind: 'way',
  question: 'Two rounds without progress. Which way next?',
  context: 'Best so far is round 4: Relevance 0.73 (needs 0.80), Speed 208 ms (needs 200). Tuning BM25 and boosting in-stock products did not help.',
  ways: WAYS,
  pick: 0,
  why: 'trying all three would cost about $2.60. Ways that are cheap to try, it tries without asking.',
  askedAt: now - MIN,
  expiresAt: now + 9 * MIN,
  ...o,
});

/** A goal at its start: the checks proposed, nothing run. */
function base(now: number, undo: boolean): GoalState {
  const t0 = now - 84 * MIN;
  return {
    key: 'claude:sample',
    id: 'goal-1',
    status: 'working',
    contract: {
      objective: 'Make search on the shop find the right product. People type things like “runing shoes” or “kids bike 20 inch” and the wrong things come first. It has to stay fast.',
      title: 'Search on the shop puts the right product first, and stays fast.',
      checks: CHECKS,
      protect: ['tests/', 'search-eval/'],
      limits: { rounds: 12, usd: 10, minutes: 180 },
    },
    settings: { ...GOAL_SETTINGS },
    rounds: [],
    undo,
    rules: [],
    next: [],
    dropped: [],
    startedAt: t0,
    spentUsd: 0,
    activeMs: 0,
  };
}

export interface GoalSample {
  id: string;
  label: string;
  goal: GoalState;
}

/** One goal for each status (and the kinds of question), each with undo and without where that changes what shows. */
export function samples(now = Date.now()): GoalSample[] {
  const mk = (id: string, label: string, undo: boolean, f: (g: GoalState) => void): GoalSample => {
    const g = base(now, undo);
    f(g);
    return { id: undo ? id : `${id}-no-undo`, label: undo ? label : `${label} (no undo)`, goal: g };
  };
  const out: GoalSample[] = [];
  for (const undo of [true, false]) {
    const t0 = now - 84 * MIN;
    const rounds = history(t0, undo);
    const midRun = (g: GoalState) => {
      g.rounds = rounds;
      g.best = undo ? 4 : 6;
      g.spentUsd = 3.26;
      g.activeMs = 58 * MIN;
    };
    out.push(
      mk('drafting', 'Drafting', undo, (g) => {
        g.status = 'drafting';
        g.contract.checks = [];
        g.contract.protect = [];
      }),
      mk('agreeing', 'Agreeing, a check could not run', undo, (g) => {
        g.status = 'agreeing';
        // A first Start came back: a check could not run, so the next one says Start anyway.
        g.reason = 'A check could not run';
        const rs = results(0.61, 340, { error: 'No screenshot tool on this computer' });
        g.rounds = [{ n: 0, startedAt: t0, endedAt: now - 3 * MIN, results: rs, score: score(rs), outcome: 'start', usd: 0.08 }];
        g.best = 0;
        g.spentUsd = 0.08;
        g.activeMs = 2 * MIN;
      }),
      mk('agreeing-unmeasured', 'Agreeing, not measured yet', undo, (g) => {
        // Where commands ask first, the checks are not run before you agree: no round yet.
        g.status = 'agreeing';
      }),
      mk('measuring', 'Measuring', undo, (g) => {
        g.status = 'measuring';
      }),
      mk('working', 'Working', undo, (g) => {
        midRun(g);
        g.status = 'working';
        g.round = 7;
        g.rules = [
          { id: 'r1', text: 'No new dependencies', at: now - 30 * MIN },
          { id: 'r2', text: 'Try exact brand matches first', at: now - 5 * MIN },
        ];
      }),
      mk('working-pending', 'Working, a change of the checks waits', undo, (g) => {
        midRun(g);
        g.status = 'working';
        g.round = 7;
        // The person changed a limit's neighbour while the round runs: a check's target and a protected path.
        g.pending = { checks: CHECKS.map((c) => (c.id === 'c4' ? { ...c, target: { op: '<=' as const, value: 250 } } : c)), protect: ['tests/', 'search-eval/', 'src/checkout/'] };
      }),
      mk('working-pausing', 'Working, pausing after this round', undo, (g) => {
        midRun(g);
        g.status = 'working';
        g.round = 7;
        g.pausing = true;
      }),
      mk('working-swarm', 'Working, a swarm waiting for its members', undo, (g) => {
        // A session that leads a swarm: each round is the whole team's work, and a round's row says how many members worked in it.
        midRun(g);
        const members = [0, 3, 3, 4, 2, 2, 3];
        g.rounds = g.rounds.map((r) => (members[r.n] ? { ...r, members: members[r.n], usd: Math.round(r.usd * 3.4 * 100) / 100 } : r));
        g.status = 'working';
        g.round = 7;
      }),
      mk('checking', 'Checking', undo, (g) => {
        midRun(g);
        g.status = 'checking';
        g.round = 7;
      }),
      mk('asking', 'Asking, three ways', undo, (g) => {
        midRun(g);
        g.status = 'asking';
        g.round = 7;
        g.question = asked(now);
      }),
      mk('asking-waits', 'Asking, waits for you', undo, (g) => {
        midRun(g);
        g.status = 'asking';
        g.round = 7;
        g.settings = { asks: 'every', noAnswerMin: 0 };
        g.question = asked(now, { expiresAt: undefined });
      }),
      mk('asking-yours', 'Asking, a check of yours', undo, (g) => {
        midRun(g);
        g.status = 'needs-you';
        g.contract.checks = [...CHECKS, { id: 'c6', kind: 'you', label: 'The results feel right when you try them' }];
        g.question = {
          id: 'q2',
          kind: 'yours',
          question: 'The results feel right when you try them',
          context: 'Every other check holds. Try a few searches yourself, then say whether this one holds.',
          ways: [{ name: 'It holds' }, { name: 'Not yet' }],
          pick: 0,
          askedAt: now - 2 * MIN,
        };
      }),
      mk('asking-blocked', 'Asking, blocked', undo, (g) => {
        midRun(g);
        g.status = 'needs-you';
        g.reason = 'It needs something only you can give';
        g.question = {
          id: 'q3',
          kind: 'blocked',
          question: 'The evaluation needs the click log export, and it is not in the folder.',
          context: 'It cannot build the click-trained ranker without it.',
          ways: [],
          pick: 0,
          askedAt: now - 2 * MIN,
        };
      }),
      mk('paused', 'Paused, with a reason', undo, (g) => {
        midRun(g);
        g.status = 'paused';
        g.reason = 'You stopped the agent';
        g.round = 7;
      }),
      mk('needs-you', 'Needs you', undo, (g) => {
        midRun(g);
        g.status = 'needs-you';
        g.reason = 'The agent’s turn failed: the session lost its connection';
      }),
      mk('reached', 'Reached', undo, (g) => {
        midRun(g);
        const fin = results(0.82, 187);
        g.rounds = [...rounds, { ...round(7, 84, 12, { rel: 0.82, speed: 187, way: 'Keyword and vector search, fused', did: 'Fused keyword and vector results.', usd: 0.71 }, t0) }];
        g.best = 7;
        g.status = 'reached';
        g.spentUsd = 5.92;
        g.activeMs = 84 * MIN;
        g.endedAt = now - MIN;
        g.report = { summary: 'All 5 checks hold in the last round, and again in a final check on a clean copy.', final: fin, review: '0.81 on the 40 queries kept back, which the agent never saw. The tests and the test queries are unchanged.' };
      }),
      mk('reached-changed', 'Reached, a check changed after the start', undo, (g) => {
        midRun(g);
        const fin = results(0.82, 187);
        g.rounds = [...rounds, { ...round(7, 84, 12, { rel: 0.82, speed: 187, way: 'Keyword and vector search, fused', did: 'Fused keyword and vector results.', usd: 0.71 }, t0) }];
        // The speed check was changed while the goal ran (round 3): it was measured first after that round.
        g.rounds[0] = { ...g.rounds[0], results: g.rounds[0].results.map((r) => (r.id === 'c4' ? { ...r, since: 3 } : r)) };
        g.best = 7;
        g.status = 'reached';
        g.spentUsd = 5.92;
        g.activeMs = 84 * MIN;
        g.endedAt = now - MIN;
        g.report = { summary: 'All 5 checks hold in the last round, and again in a final check on a clean copy.', final: fin };
      }),
      mk('limit', 'Stopped at a limit', undo, (g) => {
        midRun(g);
        g.contract = { ...g.contract, limits: { ...g.contract.limits, rounds: 6 } };
        g.status = 'limit';
        g.reason = 'It ran its 6 rounds';
        g.spentUsd = 7.4;
        g.activeMs = 120 * MIN;
        g.endedAt = now - MIN;
        g.report = { summary: 'Relevance and speed pull against each other here. Three ways tried did not get both.' };
      }),
      mk('stopped', 'Stopped by you', undo, (g) => {
        midRun(g);
        g.status = 'stopped';
        g.endedAt = now - MIN;
        g.report = { summary: 'You stopped it after round 6.' };
      }),
    );
  }
  return out;
}

/** The sample for a status, or the first sample of that id. */
export const sampleOf = (id: string, now = Date.now()): GoalState => (samples(now).find((x) => x.id === id) ?? samples(now)[0]).goal;

export const STATUSES: GoalStatus[] = ['drafting', 'agreeing', 'measuring', 'working', 'checking', 'asking', 'paused', 'needs-you', 'reached', 'stopped', 'limit'];

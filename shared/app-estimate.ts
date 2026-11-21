// What a run of an app takes and costs, roughly, before it has run: from its steps, each kind with a range of its own
// (a tool, code, a value or the records it keeps: a second or three and free; a quick question to a model: a few
// seconds and next to nothing; an agent: by the tier it thinks with). A repeat goes round its most rounds (5 unless
// set), a few at a time; steps side by side take as long as the longest and cost all together. Once the app has
// finished runs, their middle values say it better. The sketch an agent shows before building, and the builder's
// What it does, give it in one line.
import type { Flow, Step } from './app-manifest.ts';
import type { AppRecipe } from './apps.ts';
import type { Tier } from './tiers.ts';

/** A range, lowest first. */
export type Range = [number, number];

export interface RunEstimate {
  /** Seconds a run takes. */
  seconds: Range;
  /** US dollars it costs. */
  usd: Range;
  /** From its steps, or from the middle of its finished runs (how many). */
  from: 'steps' | 'runs';
  runs?: number;
  /** One of its steps waits for a person's answer, which takes as long as they do. */
  waits?: boolean;
}

/** An agent step by the tier it thinks with (no tier: as Standard). */
const AGENT: Record<Tier, { seconds: Range; usd: Range }> = {
  quick: { seconds: [30, 60], usd: [0.01, 0.05] },
  standard: { seconds: [60, 180], usd: [0.1, 0.4] },
  best: { seconds: [180, 360], usd: [0.5, 2] },
  max: { seconds: [300, 600], usd: [1, 4] },
};
/** A step that is done here (a tool, code, a value, the records): a second or three, and free. */
const HERE = { seconds: [1, 3] as Range, usd: [0, 0] as Range };
/** One quick answer from a model. */
const MODEL = { seconds: [2, 8] as Range, usd: [0.001, 0.01] as Range };
/** A repeat over a list it cannot count beforehand. */
const ROUNDS = 5;

interface Part {
  seconds: Range;
  usd: Range;
  waits: boolean;
}

const NONE: Part = { seconds: [0, 0], usd: [0, 0], waits: false };
const add = (a: Part, b: Part): Part => ({ seconds: [a.seconds[0] + b.seconds[0], a.seconds[1] + b.seconds[1]], usd: [a.usd[0] + b.usd[0], a.usd[1] + b.usd[1]], waits: a.waits || b.waits });
const times = (p: Part, time: number, cost: number): Part => ({ seconds: [p.seconds[0] * time, p.seconds[1] * time], usd: [p.usd[0] * cost, p.usd[1] * cost], waits: p.waits });
const isTier = (t: unknown): t is Tier => t === 'quick' || t === 'standard' || t === 'best' || t === 'max';

function stepPart(s: Step, tier: Tier | undefined): Part {
  switch (s.do) {
    case 'agent': {
      const t = isTier(s.tier) ? s.tier : s.model ? 'standard' : (tier ?? 'standard');
      return { ...AGENT[t], waits: false };
    }
    case 'model':
      return { ...MODEL, waits: false };
    case 'ask':
      return { ...NONE, waits: true };
    case 'app':
      // Another app, whose steps are not known here: as one agent would.
      return { ...AGENT.standard, waits: false };
    case 'decide': {
      // One way or the other: from the cheaper way's lowest to the dearer one's highest, after the question, if it asks one.
      const a = listPart(s.then, tier);
      const b = listPart(s.else ?? [], tier);
      const way: Part = { seconds: [Math.min(a.seconds[0], b.seconds[0]), Math.max(a.seconds[1], b.seconds[1])], usd: [Math.min(a.usd[0], b.usd[0]), Math.max(a.usd[1], b.usd[1])], waits: a.waits || b.waits };
      return add(s.ask ? { ...MODEL, waits: false } : NONE, way);
    }
    case 'repeat': {
      const rounds = Math.max(1, Number(s.max) || ROUNDS);
      const atOnce = Math.max(1, Math.min(rounds, Number(s.atOnce) || 1));
      const each = add(listPart(s.steps, tier), s.untilAsk ? { ...MODEL, waits: false } : NONE);
      return times(each, Math.ceil(rounds / atOnce), rounds);
    }
    case 'parallel': {
      const branches = s.branches.map((b) => listPart(b, tier));
      return branches.reduce<Part>(
        (out, b) => ({ seconds: [Math.max(out.seconds[0], b.seconds[0]), Math.max(out.seconds[1], b.seconds[1])], usd: [out.usd[0] + b.usd[0], out.usd[1] + b.usd[1]], waits: out.waits || b.waits }),
        NONE,
      );
    }
    default:
      return { ...HERE, waits: false };
  }
}

const listPart = (steps: Step[], tier: Tier | undefined): Part => steps.reduce((out, s) => add(out, stepPart(s, tier)), NONE);

/** The middle value of some numbers. */
const middle = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * What a run takes and costs: from its finished runs (`runs`: how long each took and what it cost) when it has some,
 * else from its steps (`flow`; none: one agent does `prompt`, thinking with `tier`). Null for an app with nothing to do yet.
 */
export function estimateRun(r: Pick<AppRecipe, 'prompt' | 'tier'> & { flow?: Flow }, runs: { seconds?: number; costUsd?: number }[] = []): RunEstimate | null {
  const tier = isTier(r.tier) ? r.tier : undefined;
  const steps: Step[] | null = r.flow?.steps.length ? r.flow.steps : r.prompt?.trim() ? [{ id: 'task', do: 'agent', instructions: r.prompt }] : null;
  const from = steps ? listPart(steps, tier) : null;
  const secs = runs.map((x) => x.seconds).filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  const costs = runs.map((x) => x.costUsd).filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
  if (secs.length || costs.length) {
    const s = secs.length ? middle(secs) : null;
    const c = costs.length ? middle(costs) : null;
    if (from || (s !== null && c !== null))
      return {
        seconds: s !== null ? [s, s] : from!.seconds,
        usd: c !== null ? [c, c] : from!.usd,
        from: 'runs',
        runs: Math.max(secs.length, costs.length),
        ...(from?.waits ? { waits: true } : {}),
      };
  }
  if (!from) return null;
  return { seconds: from.seconds, usd: from.usd, from: 'steps', ...(from.waits ? { waits: true } : {}) };
}

/** "40 s", "1–3 min", "30 s–1 min": rounded as a person would say it. */
export function timeText([lo, hi]: Range): string {
  const one = (s: number, unit: boolean): string => {
    if (s < 90) return `${Math.max(1, Math.round(s))}${unit ? ' s' : ''}`;
    if (s < 5400) return `${Math.round(s / 60)}${unit ? ' min' : ''}`;
    return `${Math.round((s / 3600) * 10) / 10}${unit ? ' h' : ''}`;
  };
  const unitOf = (s: number) => (s < 90 ? 's' : s < 5400 ? 'min' : 'h');
  const b = one(hi, true);
  // A minute or more says minutes when the other end does: "1–3 min", not "60 s–3 min".
  const inMinutes = lo >= 60 && unitOf(hi) === 'min';
  const a = inMinutes ? `${Math.round(lo / 60)} min` : one(lo, true);
  if (a === b) return a;
  // One unit for both ends when they share it: "1–3 min".
  return inMinutes || unitOf(lo) === unitOf(hi) ? `${a.replace(/ \S+$/, '')}–${b}` : `${a}–${b}`;
}

/** "$0.10–0.40", "$1.20", "under a cent", "nothing". */
export function costText([lo, hi]: Range): string {
  if (hi <= 0) return 'nothing';
  if (hi < 0.01) return 'under a cent';
  const fmt = (x: number) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(2).replace(/\.00$/, '') : x.toFixed(2));
  const a = fmt(lo);
  const b = fmt(hi);
  return a === b ? `$${b}` : `$${lo < 0.01 ? '0' : a}–${b}`;
}

/** The estimate in a line, in English (for agents; the pages put its parts in their own words). */
export function estimateText(e: RunEstimate): string {
  const cost = costText(e.usd);
  const costs = cost === 'nothing' ? 'costs nothing' : cost === 'under a cent' ? 'costs under a cent' : `costs about ${cost}`;
  const base = `A run takes about ${timeText(e.seconds)} and ${costs}`;
  const how = e.from === 'runs' ? ` (the middle of its last ${e.runs} finished run${e.runs === 1 ? '' : 's'})` : ' (a rough guess from its steps)';
  return `${base}${how}${e.waits ? ', plus the time a person takes to answer it' : ''}.`;
}

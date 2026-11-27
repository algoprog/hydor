// Which run took the place of which, and where each run stands in a list: the rules the server and the Experiments
// pages share (nothing here is stored; it is worked out from the records as they are listed).
//
// A run that failed, was lost or was stopped is replaced by a later one of the same experiment that was started as
// another attempt at it (its `from`: Run again, or an agent's `replaces`), or, with nothing said, that is the very same
// job (command, folder, where, seed, settings, variables) queued after it had ended. A run that finished is never
// replaced: running it again is a repeat. The runs of such a chain show as one row, the latest of them.
import { isOutputSetting, sweptCheckpoint, withoutOutputs } from './experiment-outputs.ts';
import { isTrialRun, type RunRecord } from './experiments.ts';

type Run = Pick<RunRecord, 'id' | 'status' | 'command' | 'cwd' | 'createdAt'> & Partial<Pick<RunRecord, 'group' | 'from' | 'endedAt' | 'seed' | 'env' | 'params' | 'where' | 'tags' | 'stopping' | 'sweep'>>;

/** What a listed run is told about its chain. */
export interface Attempt {
  /** The failed, lost or stopped run it is another attempt at. */
  retryOf?: string;
  /** The later attempt that took its place. */
  replacedBy?: string;
  /** Which attempt it is (2 or more), counted from the chain's first. */
  attempt?: number;
}

const RETRIED = new Set(['failed', 'lost', 'stopped']);

/** Whether a run ended in a way that another run of it is another attempt (not a repeat). */
export const canBeReplaced = (r: Pick<RunRecord, 'status'>) => RETRIED.has(r.status);

/** Trials and the runs that score evaluations are no part of any chain. */
const chained = (r: Run) => !isTrialRun({ tags: r.tags, env: r.env }) && !(r.tags?.includes('evaluation') && r.env?.HYDOR_EVALUATION !== undefined);

const sorted = (o: Record<string, unknown> | undefined) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * The very same job: what a run is told apart by when nothing says which run it follows. Numbers and seeds count as
 * written; where it writes and which checkpoint it goes on from do not count (experiment-outputs.ts).
 */
const sameJob = (r: Run) => {
  const command = withoutOutputs(r.command, { keepCheckpoints: sweptCheckpoint(r) }).replace(/[ \t]+/g, ' ');
  const params = Object.fromEntries(Object.entries(r.params ?? {}).filter(([k, v]) => !isOutputSetting(k, v, !!r.sweep)));
  return JSON.stringify([r.group, command, r.cwd, r.where ?? 'local', r.seed ?? null, sorted(r.env), sorted(params)]);
};

/** Each run's place in its chain, by id; runs of no chain are left out. The runs given are those of one computer. */
export function attemptsOf(runs: Run[]): Map<string, Attempt> {
  const list = runs.filter(chained).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  const at = new Map(list.map((r, i) => [r.id, i]));
  const next = new Map<string, string>();
  const prev = new Map<string, string>();
  const link = (p: string, r: string) => {
    const old = next.get(p);
    if (old !== undefined) prev.delete(old);
    next.set(p, r);
    prev.set(r, p);
  };
  // What was said first: the later of two attempts at one run takes it. An earlier run only: no chain can close on itself.
  list.forEach((r, i) => {
    const j = r.from === undefined ? undefined : at.get(r.from);
    if (j === undefined || j >= i) return;
    const p = list[j];
    if ((p.group ?? '') === (r.group ?? '') && canBeReplaced(p)) link(p.id, r.id);
  });
  // Then the same job started again: after the earlier one ended, and only where nothing else took its place.
  const open = new Map<string, Run[]>();
  for (const r of list) {
    if (!r.group) continue;
    const key = sameJob(r);
    const seen = open.get(key) ?? [];
    if (r.from === undefined) {
      let best: Run | undefined;
      for (const p of seen) if (canBeReplaced(p) && !next.has(p.id) && p.endedAt !== undefined && p.endedAt <= r.createdAt && (!best || p.endedAt >= best.endedAt!)) best = p;
      if (best) link(best.id, r.id);
    }
    seen.push(r);
    open.set(key, seen);
  }
  const out = new Map<string, Attempt>();
  const n = new Map<string, number>();
  for (const r of list) {
    const p = prev.get(r.id);
    const s = next.get(r.id);
    const k = p === undefined ? 1 : (n.get(p) ?? 1) + 1;
    n.set(r.id, k);
    if (p === undefined && s === undefined) continue;
    out.set(r.id, { ...(p === undefined ? {} : { retryOf: p }), ...(s === undefined ? {} : { replacedBy: s }), ...(k > 1 ? { attempt: k } : {}) });
  }
  return out;
}

// ---- where each run shows ----------------------------------------------------------------------------------------

/** A run as the standings read it: a listed one, with its chain's marks and whether it was put aside. */
export type Listed = Pick<RunRecord, 'id' | 'replacedBy' | 'retryOf' | 'archivedAt'> & Partial<Pick<RunRecord, 'machine'>>;

export interface Standings<T> {
  /** The runs that have a row of their own, in the order given. */
  rows: T[];
  /** The earlier attempts under a row, the latest first, by the row's key. */
  earlier: Map<string, T[]>;
  /** Every earlier attempt, in the order given. */
  folded: T[];
  /** The runs put aside: archived themselves, or earlier attempts of a run that is. */
  archived: T[];
}

/** A run's key, unique across this computer's runs and other machines'. */
export const standingKey = (r: Pick<RunRecord, 'id' | 'machine'>) => `${r.machine?.id ?? ''}:${r.id}`;

/**
 * Which runs have a row, which sit under one as earlier attempts, and which are put aside. A chain's row is its latest
 * run that is not archived by itself; when the very latest is archived, so is the row, earlier attempts and all. A chain
 * whose later runs are not among those given ends at the last one given.
 */
export function standingsOf<T extends Listed>(runs: T[]): Standings<T> {
  const by = new Map(runs.map((r) => [standingKey(r), r]));
  const keyAt = (r: T, id: string) => standingKey({ id, machine: r.machine });
  const head = new Map<string, T>();
  const headOf = (r: T): T => {
    const k = standingKey(r);
    const known = head.get(k);
    if (known) return known;
    // The chain ends where nothing later is listed (a `seen` set: a chain cannot go round).
    const seen = new Set([k]);
    let at = r;
    while (at.replacedBy) {
      const n = by.get(keyAt(at, at.replacedBy));
      if (!n || seen.has(standingKey(n))) break;
      seen.add(standingKey(n));
      at = n;
    }
    head.set(k, at);
    return at;
  };
  const out: Standings<T> = { rows: [], earlier: new Map(), folded: [], archived: [] };
  for (const r of runs) {
    const h = headOf(r);
    if (r.archivedAt || h.archivedAt) out.archived.push(r);
    else if (h === r) out.rows.push(r);
    else {
      out.folded.push(r);
      const k = standingKey(h);
      out.earlier.set(k, [...(out.earlier.get(k) ?? []), r]);
    }
  }
  // A chain's own order: the one before the row first, then the one before that.
  for (const [k, list] of out.earlier) {
    const rank = new Map<string, number>();
    let at: T | undefined = by.get(k);
    for (let i = 0; at?.retryOf && i <= runs.length; i++) {
      at = by.get(keyAt(at, at.retryOf));
      if (at) rank.set(standingKey(at), i);
    }
    list.sort((a, b) => (rank.get(standingKey(a)) ?? runs.length) - (rank.get(standingKey(b)) ?? runs.length));
  }
  return out;
}

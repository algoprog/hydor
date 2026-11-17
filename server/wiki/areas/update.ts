// Update now: what the wiki would do over the next hours, done at once for one wiki at a person's (or an agent's)
// request, in the background. `sources`: the documents waiting in the digest's queue, the project's conversations not
// read yet (the work pass for this project alone, its caps and exclusions kept), its new commits. `articles`: the
// articles marked stale by the code (up to 10), every stale hub (no hourly cap), the queued folds and merges (up to 5).
// `areas`: the reorganising pass, whatever its triggers. Its progress and what it did are in the same status as a
// rebuild's (jobs.ts); one run at a time for each wiki. It can be stopped between its parts and its steps (the helper calls in
// flight end); what it did stays. Its conversations are read by the same pool of helpers as a build's (helperParallel).
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import { baseRow } from '../../knowledge/store.ts';
import { spaceById } from '../../spaces/index.ts';
import { digestCommitsNow } from '../digest/commits.ts';
import { checkWikiDrift } from '../digest/drift.ts';
import { digestQueue } from '../digest/queue.ts';
import type { DigestAsk } from '../digest/plan.ts';
import { learnWikiFromWork } from '../digest/work.ts';
import { wikiMemoryOn, wikiRoot } from '../roots.ts';
import { helperParallel } from '../../helper.ts';
import { withSignal } from '../digest/plan.ts';
import { claimJob, finishJob, jobSignal, releaseJob, saveJob, type JobPhase, type JobState } from './jobs.ts';
import { runMerges } from './merge.ts';
import { jobOptions } from './run.ts';
import { reorganiseWiki, reorganising } from './reorganise.ts';
import { refreshHubs } from './tend.ts';

export const UPDATE_PARTS = ['sources', 'articles', 'areas'] as const;
export type UpdatePart = (typeof UPDATE_PARTS)[number];
/** Stale articles revised, and queued merges done, in one update at most. */
export const UPDATE_REVISE = 10;
export const UPDATE_MERGES = 5;

export interface UpdateOptions {
  ask?: DigestAsk;
  strong?: DigestAsk;
  onUpdate?: (space: string | null) => void;
  /** Whether an agent works in a session (the work pass leaves it for later). */
  busy?: (key: string) => boolean;
  /** How many conversations are read at once (the helper's: helperParallel). */
  workers?: number;
}

/** The parts asked for, each once, in their order; all three when none. */
export function updateParts(raw: unknown): UpdatePart[] {
  if (raw == null) return [...UPDATE_PARTS];
  if (!Array.isArray(raw) || raw.some((p) => !UPDATE_PARTS.includes(p as UpdatePart))) throw new HttpError(400, 'parts: some of "sources", "articles" and "areas"');
  const set = new Set(raw as UpdatePart[]);
  if (!set.size) throw new HttpError(400, 'parts: some of "sources", "articles" and "areas"');
  return UPDATE_PARTS.filter((p) => set.has(p));
}

/** Starts an update of a wiki in the background: 409 while it does something else at a person's request. */
export function startUpdate(db: DB, space: string | null, parts: UpdatePart[], options: UpdateOptions = {}): { started: true; parts: UpdatePart[] } {
  const o = jobOptions(db, options);
  if (space && !spaceById(db, space)) throw new HttpError(404, 'No such project');
  if (!wikiMemoryOn(db, space)) throw new HttpError(409, space ? 'Wiki memory is off for this project' : 'The shared wiki is off in Settings → Memory → Wiki memory');
  if (!claimJob(space)) throw new HttpError(409, 'The wiki is busy with a rebuild, an update or a reorganisation: try again when it is done');
  const job: JobState = { kind: 'update', state: 'running', parts, done: 0, total: parts.length, startedAt: Date.now(), did: [] };
  saveJob(db, space, job);
  o.onUpdate?.(space);
  void runUpdate(db, space, parts, job, o);
  return { started: true, parts };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Does the parts in turn; never throws (a part that fails says so, and the others still run). */
export async function runUpdate(db: DB, space: string | null, parts: UpdatePart[], job: JobState, options: UpdateOptions = {}): Promise<void> {
  const o = jobOptions(db, options);
  const signal = jobSignal(space);
  const ask = withSignal(o.ask, signal);
  const strong = withSignal(o.strong, signal);
  const stopped = () => !!signal?.aborted;
  const did = (line: string) => {
    job.did = [...(job.did ?? []), line];
    saveJob(db, space, job);
    o.onUpdate?.(space);
  };
  const phase = (p: JobPhase) => {
    job.phase = p;
    saveJob(db, space, job);
    o.onUpdate?.(space);
  };
  const step = async (p: JobPhase, f: () => Promise<string | null>) => {
    phase(p);
    try {
      const line = await f();
      if (line && !stopped()) did(line);
    } catch (e) {
      did(`${p}: ${(e as Error).message.slice(0, 200)}`);
    }
  };
  try {
    for (const part of parts) {
      if (stopped()) break;
      if (part === 'sources') {
        await step('documents', async () => {
          const q = digestQueue();
          if (!q) return null;
          const mine = (base: string) => {
            try {
              return baseRow(db, base).space === space;
            } catch {
              return false;
            }
          };
          const n = await q.readNow((d) => mine(d.base));
          return `Read ${plural(n, 'waiting document')}`;
        });
        if (space) {
          await step('conversations', async () => `Read ${plural(await learnWikiFromWork(db, ask, Date.now(), o.onUpdate, { only: space, busy: o.busy, workers: o.workers ?? helperParallel(db), signal }), 'conversation')}`);
          await step('commits', async () => ((await digestCommitsNow(db, ask, space, Date.now(), o.onUpdate)) ? 'Read the new commits' : 'No new commits to read'));
        }
      } else if (part === 'articles') {
        const root = wikiRoot(db, space);
        if (space)
          await step('drift', async () => {
            const r = await checkWikiDrift(db, { ask, force: true, only: space, revise: UPDATE_REVISE, onUpdate: o.onUpdate });
            return `Brought ${plural(r.revised, 'stale article')} up to date`;
          });
        if (root) {
          await step('hubs', async () => `Wrote ${plural(await refreshHubs(db, ask, [root], { max: Infinity }), 'hub')}`);
          await step('merges', async () => `Did ${plural((await runMerges(root, ask, { db, space, max: UPDATE_MERGES, daily: Infinity, onUpdate: o.onUpdate })).filter((m) => m.ok).length, 'queued merge')}`);
        }
      } else {
        const root = wikiRoot(db, space);
        await step('areas', async () => {
          if (!root) return 'The wiki is still empty';
          if (reorganising()) return 'Areas: another wiki is being reorganised; try again in a few minutes';
          const p = space ? spaceById(db, space) : null;
          const r = await reorganiseWiki(root, { db, space, propose: strong, check: ask, project: p ? { name: p.name, description: p.description } : null, onUpdate: o.onUpdate });
          return r.ran ? `Areas: ${r.summary}` : `Areas: ${r.error}`;
        });
      }
      if (stopped()) break;
      job.done++;
      saveJob(db, space, job);
    }
    Object.assign(job, stopped() ? { state: 'stopped', endedAt: Date.now() } : { state: 'done', endedAt: Date.now(), phase: undefined });
    saveJob(db, space, job);
  } catch (e) {
    Object.assign(job, { state: 'failed', endedAt: Date.now(), error: (e as Error).message.slice(0, 400) });
    saveJob(db, space, job);
  } finally {
    finishJob(space, job.state);
    o.onUpdate?.(space);
  }
}

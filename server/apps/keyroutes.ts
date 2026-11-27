// What a program outside Hydor may do with an app and its own key (`Authorization: Bearer napp_…`), or a signed-in person
// by the same routes (docs/guide/90-api.md, "Apps, from outside"):
//   POST /api/apps/:slug/run                   start a run { inputs, files?, flow?, personToken?, wait? } → the run
//   GET  /api/apps/:slug/run                   the app's runs started that way, newest first (?limit, ?person, ?before)
//   GET  /api/apps/:slug/run/:runId            one run (?wait=<seconds> waits for it to end)
//   GET  /api/apps/:slug/run/:runId/events     one run followed as it goes: server-sent events
//   POST /api/apps/:slug/run/:runId/answer     answer the question a run waits on { values } or { yes }
//   POST /api/apps/:slug/run/:runId/stop       stop a run that has not ended
// Every call counts toward the key's thirty a minute; starting a run counts toward the app's runs a day, and a run is held to
// the app's own cap on what it may spend. A key opens its own app only. Who a run acts for is proven, not claimed: the web app
// that is this app's other half sends `personToken`, the signed x-hydor-person header exactly as it received it from Hydor's
// proxy, and Hydor checks it with that web app's secret (server/webapps/flows.ts sets how that is known); a run started with
// that web app's key and no token acts for nobody.
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDef, RunPerson } from '../../shared/apps.ts';
import { isActive } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { checkDaily, waitSeconds } from './api.ts';
import { answerRun, flowsOf, keyRun, keyStep, KEY_STATUS, questionOf, type KeyRun } from './keyrun.ts';
import { isFlowRun, startRun, stopRun, waitFor, watchRuns } from './runs.ts';
import { stepsOf } from './flow.ts';
import { Limiter, persistLimits } from './limits.ts';
import { appOfKey, dayStart, getApp, getRun, KEY_PREFIX, listRuns, usageSince, type RunRecord } from './store.ts';

const keyLimiter = new Limiter(Date.now, 'api-key');

/** How a web app that an agent app is the flows half of is known here (set by server/webapps/flows.ts); none: no app is linked. */
export interface WebappLinks {
  /**
   * Whether the app is a flows half, and whether `keyId` (none: a signed-in person) is its web app's own key; what the web app may spend a day;
   * and the person a token names, when it is one that web app's proxy signed with its secret and that has not run out (a short grace allowed).
   */
  of(app: AppDef, keyId: string | undefined): { viaKey: boolean; dailyCapUsd: number; person(token: string): { person: RunPerson } | { problem: string } } | null;
  /** The person signed in to Hydor, as a run of this app is recorded to act for them when it is started on Hydor's own pages (the same shape as a person a token proves); null: the app is not a flows half. */
  signedIn(app: AppDef): RunPerson | null;
}
let links: WebappLinks | null = null;
export const useWebappLinks = (l: WebappLinks | null) => (links = l);
/** Who a run started by the signed-in person acts for: for the flows half of a web app, that person; for any other app, nobody is recorded (undefined). */
export const signedInPerson = (a: AppDef): RunPerson | undefined => links?.signedIn(a) ?? undefined;

/** Longest one followed run may keep a stream open, and most streams one key keeps open at once. */
export const STREAM = { maxMs: 30 * 60_000, perKey: 8, pingMs: 15_000 };

/** The longest `ref` a run may carry. */
export const REF_MAX = 120;
/** A run's own reference as the caller sent it: a short text without control characters (null: none sent). Throws what to fix. */
function cleanRef(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.length > REF_MAX || /[\u0000-\u001f\u007f]/.test(v)) throw new HttpError(400, `ref is a short text of your own (at most ${REF_MAX} characters, on one line), such as the id of the row the run belongs to.`);
  return v;
}

/** The app a call may run: an app key opens its own app only (server/index.ts lets these through to here). */
export function callable(d: Deps, req: FastifyRequest): { a: AppDef; keyId?: string } {
  const a = getApp(d.db, (req.params as { slug: string }).slug);
  const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
  if (bearer?.startsWith(KEY_PREFIX)) {
    const k = appOfKey(d.db, bearer);
    if (!k) throw new HttpError(401, 'That key is not valid (it may have been revoked)');
    // An app that is not there and an app this key does not open are told apart, to those who hold a key: both are a 404 or a 401, never a guess at which apps exist.
    if (!a) throw new HttpError(404, 'There is no app with that address');
    if (k.app !== a.id) throw new HttpError(401, 'That key does not open this app');
    if (!keyLimiter.take(k.id, 30, 60_000)) throw new HttpError(429, 'Too many calls with this key: at most 30 a minute');
    return { a, keyId: k.id };
  }
  // Anything else here passed the sign-in (or a machine's access token) on the way in.
  if (!a) throw new HttpError(404, 'There is no app with that address');
  return { a };
}

/** The run an app's caller names, which has to be one of that app's. */
function runOf(d: Deps, a: AppDef, id: string): RunRecord {
  const r = getRun(d.db, id);
  if (!r || r.app !== a.id || r.source === 'step') throw new HttpError(404, `The app “${a.slug}” has no run ${id}`);
  return r;
}

/** Runs a key started may be answered and stopped by a key; those started on Hydor's own pages are the person's. */
function startedByKey(r: RunRecord) {
  if (r.source !== 'api') throw new HttpError(403, 'This run was not started with a key: only the person answers it or stops it, on its page in Hydor.');
}

export function keyRoutes(d: Deps, link: (key: string) => string) {
  persistLimits(d.db);
  const { app, db } = d;
  const shape = (r: RunRecord) => keyRun(r, link);
  const streams = new Map<string, number>();

  app.post('/api/apps/:slug/run', { bodyLimit: 40 * 1024 * 1024 }, async (req) => {
    const { a, keyId } = callable(d, req);
    const b = (req.body ?? {}) as Record<string, any>;
    // The form's values under "inputs", or at the top level beside the options.
    const { wait, files, inputs, flow, person: claimed, personToken, ref, ...rest } = b;
    if (flow !== undefined && typeof flow !== 'string') throw new HttpError(400, 'flow is the name of one of the app’s flows.');
    const reference = cleanRef(ref);
    const linked = links?.of(a, keyId) ?? null;
    // Who a run acts for is proven, never claimed: a person said in the body is refused, and the token is checked.
    if (claimed !== undefined && claimed !== null) throw new HttpError(400, 'Who a run acts for cannot be claimed: send personToken, the x-hydor-person header’s value exactly as the web app received it, and Hydor takes the person from it.');
    let person: RunPerson | null | undefined;
    if (personToken !== undefined && personToken !== null) {
      if (typeof personToken !== 'string') throw new HttpError(400, 'personToken is the x-hydor-person header’s value, as text.');
      if (!linked) throw new HttpError(400, 'personToken is for an app that is the flows half of a web app: that web app proves who a run acts for. This app is not linked to one.');
      if (keyId && !linked.viaKey) throw new HttpError(403, 'Only the web app’s own key may start a run for a person; this key was made for something else.');
      const checked = linked.person(personToken);
      if ('problem' in checked) throw new HttpError(403, checked.problem);
      person = checked.person;
    } else if (linked?.viaKey) person = null; // started by the web app with nobody at the screen: it acts for nobody, and is recorded so
    else if (linked && !keyId) person = signedInPerson(a); // the person signed in to Hydor starts it: it acts for them
    checkDaily(db, a);
    // A web app's runs are held to what it may spend a day: what they spent, and what those still going may spend at the most.
    if (linked?.viaKey) {
      const today = usageSince(db, a.id, dayStart(), 'api');
      const going = listRuns(db, { app: a.id, source: 'api', status: ['queued', 'starting', 'running', 'waiting'], limit: 500 }).length;
      if (today.spent + going * (a.limits.capUsd ?? 0) >= linked.dailyCapUsd) throw new HttpError(429, `The web app has spent what it may in a day ($${linked.dailyCapUsd}: its Settings), or its runs still going may.`);
    }
    const r = startRun({
      app: a.id,
      slug: a.slug,
      recipe: a,
      source: 'api',
      // With no app key the caller is the signed-in person, who may choose any project; a key's holder may not.
      signedIn: !keyId,
      inputs: inputs && typeof inputs === 'object' ? inputs : rest,
      files: files && typeof files === 'object' ? files : undefined,
      flow: flow && flow !== 'run' ? flow : undefined,
      ...(person !== undefined ? { person } : {}),
      ...(reference ? { ref: reference } : {}),
    });
    const done = await waitFor(r.id, waitSeconds(wait, 0, 900) * 1000);
    return shape(done ?? r);
  });

  /** What the app's flows are, for the pages that start them: each one's name, its form and its answer's fields. */
  app.get('/api/apps/:slug/flows', async (req) => {
    const { a } = callable(d, req);
    return flowsOf(a);
  });

  app.get('/api/apps/:slug/run', async (req) => {
    const { a } = callable(d, req);
    const q = req.query as Record<string, string | undefined>;
    const limit = q.limit === undefined ? 20 : Number(q.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'limit is a number from 1 to 100.');
    const before = q.before === undefined ? undefined : Number(q.before);
    if (before !== undefined && !Number.isFinite(before)) throw new HttpError(400, 'before is a time in milliseconds (the createdAt of the oldest run you have).');
    if (q.person !== undefined && (!q.person || q.person.length > 120)) throw new HttpError(400, 'person is a person’s id.');
    if (q.ref !== undefined && !cleanRef(q.ref)) throw new HttpError(400, `ref is the short reference you started the runs with (at most ${REF_MAX} characters).`);
    const runs = listRuns(db, { app: a.id, source: 'api', limit, before, ...(q.person ? { person: q.person } : {}), ...(q.ref ? { ref: q.ref } : {}) });
    return { runs: runs.map((r) => keyRun(r, link, { brief: true })) };
  });

  app.get('/api/apps/:slug/run/:runId', async (req) => {
    const { a } = callable(d, req);
    const r = runOf(d, a, (req.params as { runId: string }).runId);
    const done = await waitFor(r.id, waitSeconds((req.query as Record<string, string>).wait, 0, 900) * 1000);
    return shape(done ?? r);
  });

  app.post('/api/apps/:slug/run/:runId/answer', async (req) => {
    const { a } = callable(d, req);
    const r = runOf(d, a, (req.params as { runId: string }).runId);
    startedByKey(r);
    answerRun(r, (req.body ?? {}) as { step?: unknown; yes?: unknown; values?: unknown });
    // The run goes on: given a moment to take the answer, so what comes back is no longer stopped on the same question.
    const asked = questionOf(r)?.step;
    for (let i = 0; i < 30; i++) {
      const now = getRun(db, r.id);
      if (!now || now.status !== 'waiting' || questionOf(now)?.step !== asked) break;
      await new Promise((go) => setTimeout(go, 50));
    }
    const wait = waitSeconds((req.query as Record<string, string>).wait, 0, 900);
    const now = wait ? await waitFor(r.id, wait * 1000) : getRun(db, r.id);
    return shape(now ?? getRun(db, r.id) ?? r);
  });

  app.post('/api/apps/:slug/run/:runId/stop', async (req) => {
    const { a } = callable(d, req);
    const r = runOf(d, a, (req.params as { runId: string }).runId);
    startedByKey(r);
    if (!isActive(r.status)) throw new HttpError(409, 'It has ended already');
    await stopRun(r.id);
    // A run being interrupted ends in a moment: what it is by then.
    const now = await waitFor(r.id, 5000);
    return shape(now ?? getRun(db, r.id) ?? r);
  });

  /** One run followed as it goes: `run` (all of it, first), `step` (one step, each time it changes), `status` (when the run's changes, with the question it asks), `end` (all of it again, then the stream closes). */
  app.get('/api/apps/:slug/run/:runId/events', async (req, reply: FastifyReply) => {
    const { a, keyId } = callable(d, req);
    const r0 = runOf(d, a, (req.params as { runId: string }).runId);
    const who = keyId ?? 'person';
    if ((streams.get(who) ?? 0) >= STREAM.perKey) throw new HttpError(429, `At most ${STREAM.perKey} runs may be followed at once with one key.`);
    streams.set(who, (streams.get(who) ?? 0) + 1);
    reply.hijack();
    const out = reply.raw;
    out.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    const send = (event: string, data: unknown) => {
      if (!out.destroyed && !out.writableEnded) out.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const stepsSeen = new Map<string, string>();
    let statusSeen = '';
    let closed = false;
    let timer: NodeJS.Timeout | undefined;
    let stopWatching = () => {};
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      clearInterval(ping);
      clearTimeout(limit);
      stopWatching();
      streams.set(who, Math.max(0, (streams.get(who) ?? 1) - 1));
      if (!out.destroyed && !out.writableEnded) out.end();
    };
    /** Sends what changed since the last look. */
    const look = () => {
      timer = undefined;
      if (closed) return;
      const r = getRun(db, r0.id);
      if (!r) return close();
      if (isFlowRun(r))
        for (const s of stepsOf(r.id).filter((x) => x.kind !== 'round')) {
          const step = keyStep(s);
          const text = JSON.stringify(step);
          if (stepsSeen.get(step.step) !== text) {
            stepsSeen.set(step.step, text);
            send('step', { step });
          }
        }
      const question = questionOf(r);
      const mark = `${r.status}|${question ? `${question.step}:${question.title}` : ''}`;
      if (mark !== statusSeen) {
        statusSeen = mark;
        send('status', { status: r.status, state: KEY_STATUS[r.status], ...(question ? { question } : {}) });
      }
      if (!isActive(r.status)) {
        send('end', shape(r));
        close();
      }
    };
    /** Looks soon: a burst of changes is one look. */
    const soon = () => {
      if (!timer && !closed) timer = setTimeout(look, 60);
    };
    const ping = setInterval(() => !out.destroyed && !out.writableEnded && out.write(': keep-alive\n\n'), STREAM.pingMs);
    const limit = setTimeout(() => {
      send('timeout', { reconnect: true });
      close();
    }, STREAM.maxMs);
    ping.unref?.();
    limit.unref?.();
    out.on('close', close);
    // The whole run first; then what changes. Steps and status are noted as seen, so only changes after this follow.
    const first = getRun(db, r0.id) ?? r0;
    if (isFlowRun(first)) for (const s of stepsOf(first.id).filter((x) => x.kind !== 'round')) stepsSeen.set(s.path, JSON.stringify(keyStep(s)));
    const q0 = questionOf(first);
    statusSeen = `${first.status}|${q0 ? `${q0.step}:${q0.title}` : ''}`;
    send('run', shape(first));
    if (!isActive(first.status)) {
      send('end', shape(first));
      return close();
    }
    stopWatching = watchRuns((c) => c.id === r0.id && soon());
  });
}

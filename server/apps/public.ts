// The public page of an app (/a/<slug>, served by the web app; its data comes from /a-api/<slug>):
// anyone with the link fills the form and sees the answer. Visitors are told apart by a cookie and see
// only their own runs; they never see the prompt, the model, the owner's settings or other runs.
// Runs are limited per address and per hour, per day for the page, and by what they may spend in a
// day; they use Custom with no shell and no files (publicRun.ts).
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppDef, AppRun, RunProgress } from '../../shared/apps.ts';
import { isActive } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { Limiter, waitText } from './limits.ts';
import { progressOf, startRun } from './runs.ts';
import { dayStart, getApp, getRun, listRuns, usageSince, type RunRecord } from './store.ts';

const COOKIE = 'naget_visitor';
const hash = (s: string) => crypto.createHash('sha256').update(`naget-apps:${s}`).digest('hex').slice(0, 32);
const limiter = new Limiter();

/** At most this many public runs at once for one app, and for all of them together. */
const BUSY_APP = 3;
const BUSY_ALL = 8;

/** What a visitor sees of the app: its face and its form. */
export function publicApp(a: AppDef) {
  return {
    slug: a.slug,
    name: a.name,
    icon: a.icon,
    color: a.color,
    description: a.description,
    fields: a.fields.map(({ id, label, type, required, help, placeholder, options, default: def }) => ({ id, label, type, required, help, placeholder, options, default: def })),
    answer: a.answer.map(({ id, label, type, columns }) => ({ id, label, type, columns: columns?.map(({ id: cid, label: cl, type: ct }) => ({ id: cid, label: cl, type: ct })) })),
  };
}

/** What a visitor sees of their run: no session, no cost, and errors in general words. */
export function publicRun(r: RunRecord): Omit<AppRun, 'key' | 'costUsd' | 'agent' | 'model' | 'batch' | 'row' | 'source' | 'app' | 'appName'> {
  return {
    id: r.id,
    status: r.status,
    inputs: r.inputs,
    result: r.result,
    reply: r.reply,
    error: r.status === 'failed' ? 'Something went wrong with this run. Try again in a while.' : r.status === 'stopped' ? 'This run was stopped.' : undefined,
    createdAt: r.createdAt,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
  };
}

const ipOf = (req: FastifyRequest) => String(req.headers['cf-connecting-ip'] ?? req.ip ?? 'unknown');
const https = (req: FastifyRequest) => req.headers['x-forwarded-proto'] === 'https' || String(req.headers['cf-visitor'] ?? '').includes('https') || req.protocol === 'https';

/** The visitor's id (hashed), given a cookie first if they have none. */
function visitor(req: FastifyRequest, reply: FastifyReply): string {
  let v = req.cookies?.[COOKIE];
  if (!v || !/^[\w-]{20,64}$/.test(v)) {
    v = crypto.randomBytes(18).toString('base64url');
    reply.setCookie(COOKIE, v, { path: '/', httpOnly: true, sameSite: 'lax', secure: https(req), maxAge: 365 * 24 * 3600 });
  }
  return hash(v);
}

/** A page that is open: on, with a model for its runs. */
function openApp(d: Deps, slug: string): AppDef {
  const a = getApp(d.db, slug);
  if (!a || a.slug !== slug || !a.public.on || !a.public.model) throw new HttpError(404, 'There is no page here, or it was closed');
  return a;
}

/** Browsers say where a form was sent from: only this page's own site may start runs. */
function sameSite(req: FastifyRequest): boolean {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    return new URL(o).host === req.headers.host;
  } catch {
    return false;
  }
}

export function publicRoutes(d: Deps) {
  const { app, db } = d;
  const quiet = (reply: FastifyReply) => reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex');

  app.get('/a-api/:slug', async (req, reply) => {
    const a = openApp(d, (req.params as { slug: string }).slug);
    const v = visitor(req, reply);
    quiet(reply);
    return { app: publicApp(a), web: a.public.web, runs: listRuns(db, { app: a.id, visitor: v, limit: 10 }).map(publicRun) };
  });

  app.post('/a-api/:slug/run', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const a = openApp(d, (req.params as { slug: string }).slug);
    if (!sameSite(req)) throw new HttpError(403, 'Send the form from its own page');
    const v = visitor(req, reply);
    quiet(reply);
    const ip = hash(ipOf(req));
    const p = a.public;
    // Today's runs and spending for the page, and the app's own daily limit.
    const today = usageSince(db, a.id, dayStart(), 'public');
    if (today.runs >= p.runsPerDay || today.spent >= p.spendPerDay) throw new HttpError(429, 'This page has done all it can for today. Try again tomorrow.');
    if (a.limits.runsPerDay && usageSince(db, a.id, dayStart()).runs >= a.limits.runsPerDay) throw new HttpError(429, 'This page has done all it can for today. Try again tomorrow.');
    const going = listRuns(db, { status: ['starting', 'running', 'waiting'], limit: 200 }).filter((r) => r.source === 'public');
    if (going.filter((r) => r.app === a.id).length >= BUSY_APP || going.length >= BUSY_ALL) throw new HttpError(429, 'It is busy right now. Try again in a minute.');
    if (going.some((r) => r.app === a.id && r.visitor === v)) throw new HttpError(429, 'Your last run is still going: wait for it to finish first.');
    const mine = `pub:${a.id}:${ip}`;
    if (!limiter.take(mine, p.perIpPerHour, 3600_000)) throw new HttpError(429, `That is as many runs as one visitor gets in an hour. Try again ${waitText(limiter.wait(mine, p.perIpPerHour, 3600_000))}.`);
    if (!limiter.take(`pub:${ip}`, 60, 3600_000)) {
      limiter.undo(mine);
      throw new HttpError(429, 'Too many runs from here. Try again later.');
    }
    const b = (req.body ?? {}) as { inputs?: Record<string, unknown>; files?: Record<string, { name: string; data: string }> };
    try {
      const r = startRun({
        app: a.id,
        slug: a.slug,
        recipe: a,
        source: 'public',
        inputs: b.inputs && typeof b.inputs === 'object' ? b.inputs : {},
        files: b.files && typeof b.files === 'object' ? b.files : undefined,
        public: { model: p.model!, web: p.web, capUsd: Math.max(0.01, p.spendPerDay - today.spent) },
        visitor: v,
        ip,
      });
      return { run: publicRun(r) };
    } catch (e) {
      // A form that does not pass costs the visitor nothing.
      limiter.undo(mine);
      limiter.undo(`pub:${ip}`);
      throw e;
    }
  });

  app.get('/a-api/:slug/run/:id', async (req, reply) => {
    const { slug, id } = req.params as { slug: string; id: string };
    const a = openApp(d, slug);
    const v = visitor(req, reply);
    quiet(reply);
    const r = getRun(db, id);
    if (!r || r.app !== a.id || r.visitor !== v) throw new HttpError(404, 'No such run here');
    const progress: RunProgress = isActive(r.status) ? await progressOf(r, true) : { steps: [] };
    return { run: publicRun(r), progress };
  });
}

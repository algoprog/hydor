// A webhook task's address, POST /hooks/<secret>. No sign-in: the secret in the path is the
// permission, and a task may also want the call signed (HMAC-SHA256 of the body, as GitHub and Gitea
// send it). A delivery that comes again (same Idempotency-Key or delivery id) starts no second run, a
// filter on the payload can skip the run, and ?wait=60 holds the call until the run's turn ends and
// answers with the reply. What a call carries reaches the agent marked as outside data.
import crypto from 'node:crypto';
import type { PayloadFilter } from '../../shared/automations.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { valueAt } from './watch.ts';

export interface HookCall {
  body: unknown;
  /** The body as it came, for its signature. */
  raw: Buffer;
  headers: Record<string, unknown>;
  query: Record<string, unknown>;
}

// Where the usual senders put an HMAC-SHA256 of the body, hex (or base64), with or without "sha256=" (CircleCI's
// "v1=", among others after commas).
const SIGNATURE_HEADERS = ['x-hub-signature-256', 'x-gitea-signature', 'x-gogs-signature', 'x-signature-256', 'x-signature', 'x-webhook-signature', 'circleci-signature', 'sentry-hook-signature'];
// Senders that send the secret itself rather than a signature.
const TOKEN_HEADERS = ['x-gitlab-token', 'x-webhook-token', 'x-buildkite-token'];
const DELIVERY_HEADERS = ['idempotency-key', 'x-github-delivery', 'x-gitea-delivery', 'x-gogs-delivery', 'x-gitlab-event-uuid', 'x-delivery-id'];

const same = (a: Buffer, b: Buffer) => a.length === b.length && crypto.timingSafeEqual(a, b);

/** Whether the call carries a valid signature (or the secret itself, GitLab's way) made with `secret`. */
export function verifySignature(secret: string, raw: Buffer, headers: Record<string, unknown>, header?: string): boolean {
  const want = crypto.createHmac('sha256', secret).update(raw).digest();
  for (const name of header ? [header.toLowerCase()] : SIGNATURE_HEADERS) {
    const v = headers[name];
    if (typeof v !== 'string' || !v.trim()) continue;
    for (const part of v.split(',')) {
      const sig = part.trim().replace(/^(sha256|v1)=/i, '');
      if (sig && same(/^[0-9a-f]{64}$/i.test(sig) ? Buffer.from(sig, 'hex') : Buffer.from(sig, 'base64'), want)) return true;
    }
  }
  for (const name of header ? [header.toLowerCase()] : TOKEN_HEADERS) {
    const v = headers[name];
    if (typeof v === 'string' && same(Buffer.from(v.trim()), Buffer.from(secret))) return true;
  }
  return false;
}

/** The id a sender gives each delivery, which a retry keeps. */
export function deliveryId(headers: Record<string, unknown>): string | null {
  for (const h of DELIVERY_HEADERS) {
    const v = headers[h];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 200);
  }
  return null;
}

/** The value a filter path reads: "body.action", "headers.x-github-event", "query.kind"; a bare path reads the body. */
export function filterValue(path: string, call: Pick<HookCall, 'body' | 'headers' | 'query'>): string {
  const [root, ...rest] = path.trim().split('.');
  const known = root === 'body' || root === 'headers' || root === 'query';
  const base = known ? call[root as 'body' | 'headers' | 'query'] : call.body;
  const p = known ? rest.join('.') : path.trim();
  const v = p ? valueAt(base, root === 'headers' ? p.toLowerCase() : p) : base;
  return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
}

/** Whether a call passes the task's filter (runs). */
export const passesFilter = (f: PayloadFilter, call: Pick<HookCall, 'body' | 'headers' | 'query'>) => (filterValue(f.path, call) === f.value) !== !!f.skip;

/** A body as JSON, a form, or text. */
export function parseBody(raw: Buffer, type: string): unknown {
  const text = raw.toString('utf8');
  if (!text.trim()) return null;
  if (/json/i.test(type) || (!type && /^\s*[[{]/.test(text))) {
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }
  if (/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(text));
  return text;
}

/** Longest a call may wait for its run, in seconds. */
const MAX_WAIT = 300;

export function hookRoutes(d: Deps) {
  // Its own content parsing: the body as it came, so a signature can be checked against it.
  d.app.register(async (sub) => {
    sub.removeAllContentTypeParsers();
    sub.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 2 * 1024 * 1024 }, (_req, body, done) => done(null, body));
    sub.post('/hooks/:secret', async (req, reply) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const query = req.query as Record<string, unknown>;
      const call: HookCall = { body: parseBody(raw, String(req.headers['content-type'] ?? '')), raw, headers: req.headers as Record<string, unknown>, query };
      const r = await d.scheduler.webhook((req.params as { secret: string }).secret, call);
      const url = (key?: string) => (key ? `${d.publicBase()}/s/${encodeURIComponent(key)}` : undefined);
      if (r.status === 'skipped') return reply.code(200).send({ ok: true, status: 'skipped', reason: r.reason });
      const dup = r.status === 'duplicate' ? { duplicate: true } : {};
      const wait = Math.min(Math.max(Number(query.wait) || 0, 0), MAX_WAIT);
      if (!wait) return reply.code(r.status === 'duplicate' ? 200 : 202).send({ ok: true, ...dup, session: r.key, run: r.runId, url: url(r.key) });
      const done = r.runId ? await d.scheduler.waitRun(r.runId, wait * 1000) : null;
      if (!done) return reply.code(202).send({ status: 'running', ...dup, key: r.key, url: url(r.key), run: r.runId });
      return reply.code(200).send({ status: done.status, ...dup, reply: done.reply ?? '', summary: done.summary, key: done.key, url: url(done.key), run: done.id });
    });
  });
}

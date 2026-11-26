// Who may use /agent/jobs (the `job` command's routes), which the app's sign-in does not guard by itself: a session's
// run, with a token signed for it and for this purpose alone (as memory's file-touch hook is, server/memory/hook-auth.ts),
// or whoever may use /api: the app's own calls, an access token (the command line's), or the page's sign-in.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { AuthManager, SESSION_COOKIE } from '../auth.ts';
import type { DB } from '../db.ts';
import { isInternal } from '../internal.ts';
import { signWithKey } from '../links.ts';
import { accessOk, bearerOf } from '../machines.ts';
import { originListed } from '../origins.ts';

/** The bearer one run's `job` command uses. */
export function jobsToken(runId: string): string {
  return `${runId}.${signWithKey(`jobs:${runId}`).slice(0, 22)}`;
}

/** The run a bearer was signed for, or null. */
export function jobsRunOf(token: string): string | null {
  const runId = token.split('.')[0];
  if (!/^[\w-]{1,64}$/.test(runId)) return null;
  const expected = Buffer.from(jobsToken(runId));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given) ? runId : null;
}

/** A page's request that changes something must come from the app's own address, as /api's must. */
function fromHere(req: FastifyRequest): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  if (originListed(origin)) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** Whether a request carries the app's own sign-in. */
export function signedIn(db: DB, auth: AuthManager, req: FastifyRequest): boolean {
  if (isInternal(req)) return true;
  const token = bearerOf(req.headers.authorization);
  if (token) return accessOk(db, token);
  const cookie = (req as { cookies?: Record<string, string | undefined> }).cookies?.[SESSION_COOKIE];
  return !!cookie && fromHere(req) && auth.validateSession(cookie);
}

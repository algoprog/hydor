// Calls the app makes to its own API from inside the server (an agent's app_api, server/guide/api.ts), through
// Fastify's inject: they carry a secret that lives only in this process's memory, which stands in for the
// sign-in and the origin check. Nothing outside the process can know it, so no request from the network can.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export const INTERNAL_HEADER = 'x-naget-internal';
const SECRET = crypto.randomBytes(32).toString('hex');

/** The headers an in-process call carries. */
export const internalHeaders = (): Record<string, string> => ({ [INTERNAL_HEADER]: SECRET });

/** Whether a request is one of the app's own in-process calls. */
export function isInternal(req: FastifyRequest): boolean {
  const v = req.headers[INTERNAL_HEADER];
  if (typeof v !== 'string' || v.length !== SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(v), Buffer.from(SECRET));
}

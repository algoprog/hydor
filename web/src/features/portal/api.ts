// A shared project's own calls (server/spaces/portal.ts): under /p-api/<token>, the token being the permission. They
// send no cookies: the link alone says who is asking, whoever else may be signed in in this browser.
import { machineBase, portalToken } from '../../lib/machine';

export const BASE = `${machineBase}/p-api/${portalToken ?? ''}`;

export class LinkError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** A call of the link's own routes: `path` after /p-api/<token> ("", "/items/<id>"…). */
export async function papi<T>(path: string, o: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = o.method ?? (o.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(BASE + path, {
    method,
    headers: o.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    credentials: 'omit',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new LinkError(data?.error ?? `${res.status} ${res.statusText}`, res.status);
  // Not an answer of the link's (the app's own page came back): it opens nothing.
  if (data === null) throw new LinkError('This link does not open anything.', 404);
  return data as T;
}

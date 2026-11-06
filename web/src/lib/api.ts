import { mu } from './machine';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** The whole reply, for the fields beside `error`. */
    public data: any = null,
  ) {
    super(message);
  }
}

type Listener = () => void;
const unauthorized = new Set<Listener>();
export function onUnauthorized(fn: Listener) {
  unauthorized.add(fn);
  return () => {
    unauthorized.delete(fn);
  };
}

/** `base`: the machine to ask ('' for this server's own, "/m/<id>" for another), whichever machine the page shows. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal; base?: string } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(opts.base !== undefined ? opts.base + path : mu(path), {
    method,
    headers: method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    credentials: 'same-origin',
    signal: opts.signal,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (res.status === 401 && !path.startsWith('/api/auth/')) for (const fn of unauthorized) fn();
  if (!res.ok) throw new ApiError(data?.error ?? `${res.status} ${res.statusText}`, res.status, data);
  return data as T;
}

/** What a proxy in front of the app answers while the app restarts or cannot be reached (Cloudflare's 52x among them). */
const GATEWAY = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

/**
 * Whether a call was lost on the way, so it may or may not have been done: no answer at all (the connection dropped,
 * a phone went to sleep, the network changed: "Load failed", "Failed to fetch") or a proxy's answer in the app's place.
 */
export const lostOnTheWay = (e: unknown) => e instanceof TypeError || (e instanceof ApiError && GATEWAY.has(e.status) && !e.data?.error);

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });

export const enc = encodeURIComponent;

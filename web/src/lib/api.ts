import { mu } from './machine';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const res = await fetch(mu(path), {
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
  if (!res.ok) throw new ApiError(data?.error ?? `${res.status} ${res.statusText}`, res.status);
  return data as T;
}

export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const del = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });

export const enc = encodeURIComponent;

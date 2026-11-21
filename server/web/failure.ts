// What kind of failure a call to a site met, said in a structured way for the tools to hand on (ToolOutput.failure):
// an app's flow tries a call again when the failure may pass, waits what the site asked, and tells the person what it
// could not have (server/apps/sturdy.ts).
import type { ToolFailure } from '../features/types.ts';

/** The most a Retry-After is taken at: past this, a call does not wait for it. */
const MOST_WAIT = 24 * 3600_000;

/** A Retry-After header (seconds, or an HTTP date) in milliseconds from now; undefined when it says nothing usable. */
export function retryAfterMs(v: string | null | undefined, now = Date.now()): number | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.min(Math.round(Number(s) * 1000), MOST_WAIT);
  const at = Date.parse(s);
  if (Number.isNaN(at)) return undefined;
  return Math.min(Math.max(0, at - now), MOST_WAIT);
}

/** Connection errors by their code: those that may pass, and how. */
const DROPPED = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED']);
const UNREACHABLE = new Set(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', 'ENETDOWN']);
const SLOW = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

/** A thrown error's kind, when it is one that may pass (no answer in time, a dropped or refused connection). */
export function failureOf(e: unknown): ToolFailure | undefined {
  const o = e as { name?: unknown; code?: unknown; cause?: { code?: unknown; name?: unknown } } | null;
  if (!o) return undefined;
  if (o.name === 'TimeoutError' || o.cause?.name === 'TimeoutError') return { kind: 'timeout' };
  const code = String(o.code ?? o.cause?.code ?? '');
  if (SLOW.has(code)) return { kind: 'timeout' };
  if (DROPPED.has(code)) return { kind: 'dropped' };
  if (UNREACHABLE.has(code)) return { kind: 'unreachable' };
  return undefined;
}

/**
 * A page that keeps programs out instead of showing its content: Cloudflare's "Just a moment…" and "Attention Required!",
 * Imunify360, DDoS-Guard, Sucuri, Akamai's and others' bot checks. Only short pages count: an article that mentions one is
 * not one.
 */
export function botWall(text: string | undefined, title?: string): boolean {
  const t = `${title ?? ''}\n${String(text ?? '').slice(0, 6000)}`;
  if (String(text ?? '').length > 6000) return false;
  return /just a moment\.\.\.|attention required!? \| cloudflare|checking (if the site connection is secure|your browser before accessing)|cf-browser-verification|cf_chl_|enable javascript and cookies to continue|imunify360|ddos-guard|sucuri website firewall|pardon our interruption|verify(ing)? (that )?you are (a )?human|are you a robot\?|access denied.{0,80}(bot|automated)|request unsuccessful\. incapsula|perimeterx|px-captcha/i.test(t);
}

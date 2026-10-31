// What the browser's pages may reach: every request is paused (CDP Fetch, for the whole browser) and
// goes on only when its address is public, or the session allowed it (its own dev server), and the
// sites the user listed allow it. Pages from the web stay away from this machine and its network.
import dns from 'node:dns/promises';
import net from 'node:net';
import { privateIp } from '../web/fetch.ts';

export interface Policy {
  blockPrivate: boolean;
  /** Only these sites, for pages and frames (when any are listed). */
  allow: string[];
  /** Never these sites. */
  block: string[];
  /** host:port on this machine or its network the session may reach. */
  local: string[];
}

const dnsCache = new Map<string, { ips: string[]; at: number }>();

async function addresses(host: string): Promise<string[]> {
  if (net.isIP(host)) return [host];
  const hit = dnsCache.get(host);
  if (hit && Date.now() - hit.at < 30_000) return hit.ips;
  const ips = (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (dnsCache.size > 2000) dnsCache.clear();
  dnsCache.set(host, { ips, at: Date.now() });
  return ips;
}

/** Whether a host is one of the listed sites or under one ("example.com" covers "www.example.com"). */
export function onList(host: string, port: string, list: string[]): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return list.some((s) => {
    const [site, p] = s.split(':');
    if (p && p !== port) return false;
    return h === site || h.endsWith(`.${site}`);
  });
}

const defaultPort = (u: URL) => u.port || (u.protocol === 'https:' || u.protocol === 'wss:' ? '443' : '80');

/** The address as the session's allowances name it: host:port. */
export function hostPort(u: URL): string {
  return `${u.hostname.replace(/^\[|\]$/g, '').toLowerCase()}:${defaultPort(u)}`;
}

export const isLoopback = (host: string) => host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '::1' || host === '[::1]';

/** Whether an address is on this machine or its network (by name or by what it resolves to). */
export async function isPrivate(u: URL): Promise<boolean> {
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  const ips = await addresses(host);
  return ips.some(privateIp);
}

/** Why a request may not go out, or null when it may. `appPort` is this app's own port, never reachable. */
export async function refusal(raw: string, resourceType: string | undefined, p: Policy, appPort: number): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:' || u.protocol === 'chrome-error:') return null;
  if (u.protocol === 'file:') return 'files on this machine are not for web pages';
  if (!/^(https?|wss?):$/.test(u.protocol)) return `${u.protocol} addresses are not allowed`;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = defaultPort(u);
  if (onList(host, port, p.block)) return `${host} is on the list of blocked sites`;
  const doc = resourceType === 'Document';
  if (doc && p.allow.length && !onList(host, port, p.allow) && !p.local.includes(`${host}:${port}`)) return `${host} is not on the list of allowed sites`;
  if (!p.blockPrivate) return null;
  if (p.local.includes(`${host}:${port}`)) return isLoopback(host) && Number(port) === appPort ? 'that is Naget Agent itself' : null;
  return (await isPrivate(u)) ? `${host} is on this machine or its network` : null;
}

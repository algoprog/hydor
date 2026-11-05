// Confidential sessions: a session that keeps everything on this computer. It runs on Custom with a model
// here (Ollama, vLLM, or an endpoint on this computer or your private network), its tools that reach outside
// are off, its commands run without network, and nothing is sent out about it (titles, summaries, memory,
// notifications, share links). The server enforces it (server/confidential); this is what the pages and the
// server share: whether a session is one, and which addresses count as this computer or your network.
import type { SessionExtra } from './features.ts';

/** A session's settings say it is confidential. */
export const isConfidential = (extra?: SessionExtra | null): boolean => extra?.confidential === true;

/** What a confidential session keeps in its settings: memory off (nothing it says is kept for other sessions). */
export const CONFIDENTIAL_EXTRA = { confidential: true, memory: false } as const;

/** The four numbers of an IPv4 address written as one ("10.0.0.7"), or null. */
function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const n = m.slice(1).map(Number);
  return n.every((x) => x <= 255) ? n : null;
}

/** This computer (127.x, 0.0.0.0) or a private network (10.x, 172.16–31.x, 192.168.x). */
const privateV4 = ([a, b]: number[]) => a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 0 && b === 0);

/** An IPv6 address as its eight 16-bit groups, or null (an IPv4 address at its end is read too). */
function ipv6(host: string): number[] | null {
  if (!/^[0-9a-f:.]+$/.test(host) || !host.includes(':')) return null;
  let h = host;
  const tail = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (tail) {
    const v = ipv4(tail[1]);
    if (!v) return null;
    h = `${h.slice(0, tail.index)}:${((v[0] << 8) | v[1]).toString(16)}:${((v[2] << 8) | v[3]).toString(16)}`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const part = (s: string) => (s ? s.split(':') : []);
  const head = part(halves[0]);
  const rest = halves.length === 2 ? part(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const groups = [...head, ...Array(Math.max(0, fill)).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** ::1 (this computer), :: (any address here), fc00::/7 (a private network), or an IPv4 one of those written as IPv6. */
function privateV6(g: number[]): boolean {
  if (g.slice(0, 7).every((x) => x === 0)) return g[7] === 1 || g[7] === 0;
  if ((g[0] & 0xfe00) === 0xfc00) return true;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return privateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  return false;
}

/**
 * Whether an address (a URL, or a host with or without its port) is this computer or your private network:
 * localhost, 127.x, ::1, 10.x, 172.16–31.x, 192.168.x, fc00::/7 or a name ending in .local. Decided by the
 * address alone, as written (a name that only resolves to such an address elsewhere does not count), after
 * the URL rules browsers use: http://0x7f000001 is 127.0.0.1, http://localhost@example.com is example.com.
 */
export function isLocalAddress(address: string): boolean {
  const a = String(address ?? '').trim();
  if (!a) return false;
  // An IPv6 address on its own, without brackets (::1).
  if (/^[0-9a-f:.]+$/i.test(a) && (a.match(/:/g)?.length ?? 0) >= 2) {
    const g = ipv6(a.toLowerCase());
    return !!g && privateV6(g);
  }
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(a) ? a : `http://${a}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith('[') && host.endsWith(']')) {
    const g = ipv6(host.slice(1, -1));
    return !!g && privateV6(g);
  }
  if (host === 'localhost') return true;
  // mDNS names on your own network (gpu-box.local); "local" alone is not one.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(host)) return true;
  const v4 = ipv4(host);
  return !!v4 && privateV4(v4);
}

/**
 * A title from the first words of a request, when no model on this computer can name the session: up to
 * eight words and 60 characters, cut at a word, without markdown or a trailing full stop.
 */
export function firstWordsTitle(request: string): string | null {
  const line =
    String(request ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .split('\n')
      .map((l) => l.replace(/^[#>*\-\s]+/, '').replace(/[*_`]+/g, '').trim())
      .find(Boolean) ?? '';
  const words = line.split(/\s+/).filter(Boolean);
  let t = words.slice(0, 8).join(' ');
  let cut = words.length > 8;
  if (t.length > 60) {
    t = t.slice(0, 59).replace(/\s+\S*$/, '');
    cut = true;
  }
  t = t.replace(/[.。:;,，]+$/, '');
  return t ? (cut ? `${t}…` : t) : null;
}

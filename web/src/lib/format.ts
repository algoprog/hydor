/** Short relative time for lists: "just now", "5m", "2h", "3d". */
export function timeAgo(ts?: number | null, now = Date.now()): string {
  if (!ts) return '';
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(d / 365)}y`;
}

/** "in 2 h 13 min" / "in 4 days". */
/** Relative time in a sentence: "just now", "5m ago". */
export function ago(ts?: number | null, now = Date.now()): string {
  const t = timeAgo(ts, now);
  return !t || t === 'just now' ? t : `${t} ago`;
}

/** A path as a person reads it: relative to `cwd` when inside it, `~` for home, long ones shortened. */
export function prettyPath(p: string, cwd?: string, home?: string): string {
  if (cwd && cwd !== '/' && p.startsWith(cwd + '/')) return p.slice(cwd.length + 1);
  const t = tildify(p, home);
  const parts = t.split('/');
  return parts.length > 5 ? `…/${parts.slice(-3).join('/')}` : t;
}

export function untilText(ts?: number | null, now = Date.now()): string {
  if (!ts) return '';
  const s = Math.max(0, Math.round((ts - now) / 1000));
  if (s < 60) return 'in under a minute';
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `in ${Math.round(h / 24)} days`;
}

export function duration(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '';
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.round(s % 60)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function compact(n?: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  // 17.0K reads as 17K.
  const f = (v: number, d: number, unit: string) => `${v.toFixed(d).replace(/\.0+$/, '')}${unit}`;
  if (a >= 1e12) return f(n / 1e12, digits, 'T');
  if (a >= 1e9) return f(n / 1e9, digits, 'B');
  if (a >= 1e6) return f(n / 1e6, digits, 'M');
  if (a >= 1e3) return f(n / 1e3, a >= 1e4 ? digits : 1, 'K');
  return String(Math.round(n));
}

export function bytes(n?: number | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = n;
  while (Math.abs(v) >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(digits)} ${u[i]}`;
}

export function rate(n?: number | null): string {
  return `${bytes(n)}/s`;
}

export function money(n?: number | null): string {
  if (n == null) return '';
  return n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`;
}

const homeRe = /^\/home\/[^/]+/;
export function tildify(p?: string | null, home?: string): string {
  if (!p) return '';
  if (home && p.startsWith(home)) return '~' + p.slice(home.length);
  return p.replace(homeRe, '~');
}

export function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function joinPath(a: string, b: string): string {
  if (b.startsWith('/')) return b;
  return `${a.replace(/\/+$/, '')}/${b}`;
}

export function dayGroup(ts?: number, now = new Date()): string {
  if (!ts) return 'Older';
  const d = new Date(ts);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86400_000) return 'Yesterday';
  if (ts >= start - 6 * 86400_000) return 'This week';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleString(undefined, { month: 'long' });
  return String(d.getFullYear());
}

export function clockTime(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function pct(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return `${n < 10 && n > 0 ? n.toFixed(1) : Math.round(n)}%`;
}

/** Splits a snippet marked with \u0001 … \u0002 into text runs. */
export function markRuns(s: string): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  let hit = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '\u0001' || ch === '\u0002') {
      if (cur) out.push({ text: cur, hit });
      cur = '';
      hit = ch === '\u0001';
    } else cur += ch;
  }
  if (cur) out.push({ text: cur, hit });
  return out;
}

export function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '');
}

/** The shortcut modifier as this platform writes it. */
export const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

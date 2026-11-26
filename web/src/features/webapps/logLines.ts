// A line an app logs may be JSON of a request or an error (time, level, what, and for a request its method, path, status and how long it took).
// The Run tab shows each as a row; a line that is not one of those (a message of the server's own, a line the host put in front) is a row with its words.
export type LogLevel = 'info' | 'warn' | 'error' | 'plain';

export interface LogRow {
  /** The line as it was read (what "Raw" shows). */
  raw: string;
  /** The time it says, in ms since 1970, or null. */
  at: number | null;
  level: LogLevel;
  /** What happened, in a few words: "GET /customers", "TypeError: Cannot read properties of undefined", or the line's own words. */
  what: string;
  status?: number;
  /** How long a request took, in ms. */
  ms?: number;
  /** The request's id, to quote when someone reports a problem. */
  id?: string;
}

const text = (v: unknown, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : typeof v === 'number' ? String(v) : '');

/** One line of a log as a row. A line may have something in front of the JSON (a service's name, a time the host adds): it is left out of the row and kept in the raw line. */
export function parseLogLine(line: string): LogRow {
  const raw = line;
  const open = line.indexOf('{');
  let j: Record<string, unknown> | null = null;
  if (open >= 0) {
    try {
      const v = JSON.parse(line.slice(open));
      if (v && typeof v === 'object' && !Array.isArray(v)) j = v as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
  }
  if (!j || (typeof j.msg !== 'string' && typeof j.level !== 'string')) return { raw, at: null, level: 'plain', what: line.trim().slice(0, 400) };
  const t = typeof j.t === 'string' ? Date.parse(j.t) : NaN;
  const level: LogLevel = j.level === 'error' ? 'error' : j.level === 'warn' ? 'warn' : 'info';
  const row: LogRow = { raw, at: Number.isFinite(t) ? t : null, level, what: '' };
  if (typeof j.status === 'number') row.status = j.status;
  if (typeof j.ms === 'number') row.ms = Math.round(j.ms);
  if (typeof j.id === 'string') row.id = j.id;
  if (j.msg === 'request') row.what = [text(j.method), text(j.path)].filter(Boolean).join(' ') || 'request';
  else if (j.msg === 'error' || typeof j.name === 'string') row.what = [text(j.name), text(j.text)].filter(Boolean).join(': ') || text(j.msg) || 'error';
  else {
    const rest = Object.entries(j).filter(([k]) => !['t', 'level', 'msg', 'id', 'status', 'ms'].includes(k)).map(([k, v]) => `${k} ${text(v, 60)}`);
    row.what = [text(j.msg), ...rest].filter(Boolean).join(' · ').slice(0, 400) || 'log';
  }
  return row;
}

/** The time a row says, as the page writes times (`locale` is the page's). */
export const timeOf = (row: LogRow, locale?: string): string => (row.at === null ? '' : new Date(row.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

/** How long a request took, in a few characters: "14 ms", "1.2 s". */
export const msWords = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s` : `${ms} ms`);

// What the steps of the tidy-up share (tidy.ts and the steps in drift, refile, promote and agentsmd): how a change is
// worded for the report, how the helper's text and ids are checked, and how a long list goes to it in questions.
import type { MemoryChange, MemoryEntry } from '../../shared/memory.ts';
import { secretIn, steeringIn } from './secrets.ts';
import { cleanText } from './store.ts';

export const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Who made a change: the helper, with a few words on why. */
export const by = (why?: string) => ({ source: 'auto' as const, why: why?.replace(/\s+/g, ' ').trim().slice(0, 200) || undefined });

/** A change for the tidy-up's report. */
export const change = (e: MemoryEntry, c: Omit<MemoryChange, 'entry' | 'scope' | 'scopeKey' | 'source' | 'kind'>): MemoryChange => ({
  entry: e.id,
  scope: e.scope,
  scopeKey: e.scopeKey,
  kind: e.kind,
  source: 'auto',
  ...c,
});

/** A list of ids from the helper's answer, each once. */
export const numbers = (v: unknown): number[] => [...new Set((Array.isArray(v) ? v : []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];

/** The helper's text for a note: one paragraph of 3 to `max` characters with no secret and nothing that steers; else null. */
export function textOk(t: unknown, max: number): string | null {
  if (typeof t !== 'string') return null;
  const s = cleanText(t, max + 1);
  return s.length >= 3 && s.length <= max && !secretIn(s) && !steeringIn(s) ? s : null;
}

/** Text from a note, a diff or a file, unable to close the tags (`tags`: names joined by "|") the helper reads it inside. */
export const shut = (text: string, tags = 'notes') => text.replace(new RegExp(`<(/?)(${tags})\\b`, 'gi'), '‹$1$2');

/** Questions of at most `count` items and `chars` characters (`size` of each). */
export function batches<T>(items: T[], size: (t: T) => number, count = 10, chars = 7000): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let n = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= count || n + size(it) > chars)) (out.push(cur), (cur = []), (n = 0));
    cur.push(it);
    n += size(it);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Files and folders whose changes are never shown to the helper: what holds secrets. */
export const SECRETISH = /(^|\/)(\.env[^/]*|[^/]*\.(pem|key|p12|pfx|keystore)|id_(rsa|ed25519|ecdsa)[^/]*|[^/]*(secret|credential)[^/]*)$/i;

// lean_search: finding what Lean's libraries already prove, through two public services that need no key (both tried
// and answering on 2026-11-26): Loogle (by a name, a pattern or a type: https://loogle.lean-lang.org) and LeanSearch
// (by meaning, in ordinary words: https://leansearch.net). Both are asked at once; the one the query suits leads.
// They index a recent Mathlib, so a name may differ a little in an older one.
import type { LeanHit } from '../../shared/lean.ts';

const LOOGLE = 'https://loogle.lean-lang.org/json';
const LEANSEARCH = 'https://leansearch.net/search';
const ASK_MS = 30_000;
const SHOWN = 10;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
let fetchFor: Fetch = (url, init) => fetch(url, init);
/** For tests: stubbed services; null puts the real ones back. */
export const setSearchFetchForTests = (f: Fetch | null) => void (fetchFor = f ?? ((url, init) => fetch(url, init)));

export interface LeanSearched {
  /** The services that answered. */
  from: ('Loogle' | 'LeanSearch')[];
  hits: LeanHit[];
  note?: string;
}

const clip = (s: unknown, max: number) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
const hit = (name: string, type: unknown, module: unknown, doc: unknown): LeanHit => ({
  name,
  type: clip(type, 600),
  module: clip(module, 200),
  ...(clip(doc, 300) ? { doc: clip(doc, 300) } : {}),
});

async function answer(url: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const limit = AbortSignal.timeout(ASK_MS);
  const r = await fetchFor(url, { ...init, signal: signal ? AbortSignal.any([signal, limit]) : limit });
  if (!r.ok) throw new Error(`it answered ${r.status}`);
  return r.json();
}

async function loogle(q: string, signal?: AbortSignal): Promise<{ hits: LeanHit[]; said?: string }> {
  const d = await answer(`${LOOGLE}?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': 'Hydor' } }, signal);
  // A query it cannot read (ordinary words, an unknown name) comes back as an error of its own: no hits, and why.
  if (typeof d?.error === 'string') return { hits: [], said: clip(d.error.split('\n')[0], 200) };
  if (!Array.isArray(d?.hits)) throw new Error('its answer could not be read');
  return { hits: d.hits.slice(0, SHOWN).map((h: any) => hit(String(h.name), h.type, h.module, h.doc)) };
}

const joined = (x: unknown) => (Array.isArray(x) ? x.join('.') : typeof x === 'string' ? x : '');

async function leansearch(q: string, signal?: AbortSignal): Promise<{ hits: LeanHit[] }> {
  const d = await answer(LEANSEARCH, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'Hydor' }, body: JSON.stringify({ query: [q], num_results: SHOWN }) }, signal);
  if (!Array.isArray(d?.[0])) throw new Error('its answer could not be read');
  return {
    hits: d[0]
      .map((x: any) => x?.result)
      .filter((r: any) => r && joined(r.name))
      .slice(0, SHOWN)
      .map((r: any) => hit(joined(r.name), r.type || r.signature, joined(r.module_name), r.docstring || r.informal_description)),
  };
}

/** A name, a pattern or a type (Loogle reads these), rather than ordinary words. */
export const looksFormal = (q: string) => /[⊢→←↔∀∃≤≥≠∣∈∑∏√_|?"*+=<>^()[\]{}]/.test(q) || /^[\p{L}_][\p{L}\p{N}_'.]*$/u.test(q.trim());

export async function searchLean(query: string, signal?: AbortSignal): Promise<LeanSearched> {
  const q = query.trim().slice(0, 500);
  const [a, b] = await Promise.allSettled([loogle(q, signal), leansearch(q, signal)]);
  const from: LeanSearched['from'] = [];
  const down: string[] = [];
  const got = (r: PromiseSettledResult<{ hits: LeanHit[] }>, name: 'Loogle' | 'LeanSearch') => {
    if (r.status === 'fulfilled') {
      from.push(name);
      return r.value.hits;
    }
    down.push(`${name}: ${(r.reason as Error)?.name === 'TimeoutError' ? 'no answer in time' : (r.reason as Error)?.message}`);
    return [];
  };
  const byPattern = got(a, 'Loogle');
  const byMeaning = got(b, 'LeanSearch');
  if (!from.length) return { from, hits: [], note: `No Lean search service answered (${down.join('; ')}). Try again later, or search with exact? and apply? inside Lean.` };
  const [first, second] = looksFormal(q) ? [byPattern, byMeaning] : [byMeaning, byPattern];
  // The better suited one leads; the other keeps a few places.
  const seen = new Set<string>();
  const hits: LeanHit[] = [];
  const take = (list: LeanHit[], max: number) => {
    for (const h of list) {
      if (hits.length >= max) return;
      if (seen.has(h.name)) continue;
      seen.add(h.name);
      hits.push(h);
    }
  };
  take(first, second.length ? SHOWN - 3 : SHOWN);
  take(second, SHOWN);
  take(first, SHOWN);
  const notes = [
    down.length ? `Did not answer: ${down.join('; ')}.` : '',
    a.status === 'fulfilled' && a.value.said && !byPattern.length ? `Loogle could not read the query (${a.value.said}).` : '',
    hits.length ? '' : 'Nothing was found: try other words, a pattern such as "_ + _ = _ + _", or a name.',
  ].filter(Boolean);
  return { from, hits, ...(notes.length ? { note: notes.join(' ') } : {}) };
}

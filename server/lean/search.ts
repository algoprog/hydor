// lean_search: finding what Lean's libraries already prove, through two public services that need no key (both tried
// and answering on 2026-11-26): Loogle (by a name, a pattern or a type: https://loogle.lean-lang.org) and LeanSearch
// (by meaning, in ordinary words: https://leansearch.net). LeanSearch is asked every query; Loogle only what can be
// one of its own (forLoogle). The one the query suits leads. They index a recent Mathlib, so a name may differ a little
// in an older one: confirm.ts checks the names against what is installed here, when asked.
import type { LeanHit, LeanService } from '../../shared/lean.ts';

const LOOGLE = 'https://loogle.lean-lang.org/json';
const LEANSEARCH = 'https://leansearch.net/search';
/** Mathlib's documentation, which has Lean's own libraries and Mathlib's: a page a module, an anchor a name. */
const DOCS = 'https://leanprover-community.github.io/mathlib4_docs';
const ASK_MS = 30_000;
const SHOWN = 10;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
let fetchFor: Fetch = (url, init) => fetch(url, init);
/** For tests: stubbed services; null puts the real ones back. */
export const setSearchFetchForTests = (f: Fetch | null) => void (fetchFor = f ?? ((url, init) => fetch(url, init)));

export interface LeanSearched {
  /** The services whose hits these are. */
  from: LeanService[];
  hits: LeanHit[];
  note?: string;
  /** No service that was asked answered. */
  unanswered?: boolean;
}

const clip = (s: unknown, max: number) => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** A lemma's page in Mathlib's documentation, when its module is known. */
export function docUrl(name: string, module: string): string | undefined {
  const path = module.split('.').map((p) => p.replace(/[«»]/g, '')).filter(Boolean);
  return path.length ? `${DOCS}/${path.map(encodeURIComponent).join('/')}.html#${encodeURI(name)}` : undefined;
}

function hit(from: LeanService, name: string, type: unknown, module: unknown, doc: unknown): LeanHit {
  const home = clip(module, 200);
  const url = docUrl(name, home);
  return { name, type: clip(type, 600), module: home, ...(clip(doc, 300) ? { doc: clip(doc, 300) } : {}), from, ...(url ? { url } : {}) };
}

async function answer(url: string, init: RequestInit, signal?: AbortSignal): Promise<any> {
  const limit = AbortSignal.timeout(ASK_MS);
  const r = await fetchFor(url, { ...init, signal: signal ? AbortSignal.any([signal, limit]) : limit });
  if (!r.ok) throw new Error(`it answered with an error (${r.status})`);
  try {
    return await r.json();
  } catch {
    throw new Error('its answer could not be read');
  }
}

/** Why a service did not answer, in plain words. */
function whyNot(e: unknown): string {
  const x = e as Error;
  if (x?.name === 'TimeoutError') return 'no answer in time';
  // What fetch throws when the network, the name or the certificate fails.
  if (x instanceof TypeError) return 'it could not be reached';
  return x?.message || 'it did not answer';
}

async function loogle(q: string, signal?: AbortSignal): Promise<{ hits: LeanHit[]; said?: string }> {
  const d = await answer(`${LOOGLE}?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': 'Hydor' } }, signal);
  // A query it cannot read (an unknown name, a pattern it cannot parse) comes back as an error of its own: no hits, and why.
  if (typeof d?.error === 'string') return { hits: [], said: clip(d.error.split('\n')[0], 200) };
  if (!Array.isArray(d?.hits)) throw new Error('its answer could not be read');
  return { hits: d.hits.slice(0, SHOWN).map((h: any) => hit('Loogle', String(h.name), h.type, h.module, h.doc)) };
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
      .map((r: any) => hit('LeanSearch', joined(r.name), r.type || r.signature, joined(r.module_name), r.docstring || r.informal_description)),
  };
}

/** One identifier, dotted or not: a name Loogle can look up. */
const NAME = /^@?[\p{L}_][\p{L}\p{M}\p{N}_'!?]*(?:\.(?:[\p{L}\p{M}\p{N}_'!?]+|«[^»]*»))*$/u;
/** A word of a sentence (two letters or more, no dot, digit or underscore). */
const WORD = /^\p{L}[\p{L}'’-]+[,.;:?!]?$/u;

/**
 * Whether a query can be one of Loogle's, which reads (https://loogle.lean-lang.org): a constant's name, a part of a
 * name in quotes, a pattern with holes (_ or ?a), a type with arrows, a conclusion after |- or ⊢, and several of these
 * with commas between. Ordinary words are not sent to it: it would only say it cannot read them.
 */
export function forLoogle(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  // Quotes, a turnstile, an arrow, a binder or a hole: nothing a sentence has.
  if (/"[^"]+"|⊢|\|-|->|[→↔∀∃λ]/u.test(q)) return true;
  if (/(?:^|[\s([{,])(?:_(?![\p{L}\p{N}_])|\?[\p{L}_])/u.test(q)) return true;
  // Names, one or several.
  if (q.split(',').every((p) => NAME.test(p.trim()))) return true;
  // A term such as Real.sqrt 2 or (a + b) ^ 2: a dotted name or an operator, and no two words of a sentence together.
  const term = /[\p{L}\p{N}_']\.[\p{L}_]|[+*=<>≤≥≠∣∈∑∏√^∧∨¬∘•]|\s[-/]\s/u.test(q);
  const words = q.split(/\s+/);
  return term && !words.some((w, i) => i > 0 && WORD.test(w) && WORD.test(words[i - 1]));
}

/** What Loogle said it could not read, in plain words. */
function unread(said: string): string {
  const name = /^unknown identifier [`'‘]([^`'’]+)[`'’]/i.exec(said)?.[1];
  return name ? `Loogle knows nothing called ${name}.` : `Loogle could not read the query (${said}).`;
}

export async function searchLean(query: string, signal?: AbortSignal): Promise<LeanSearched> {
  const q = query.trim().slice(0, 500);
  const formal = forLoogle(q);
  const [a, b] = await Promise.allSettled([formal ? loogle(q, signal) : Promise.resolve(null), leansearch(q, signal)]);
  const down: string[] = [];
  const got = (r: PromiseSettledResult<{ hits: LeanHit[] } | null>, name: LeanService) => {
    if (r.status === 'fulfilled') return r.value?.hits ?? [];
    down.push(`${name}: ${whyNot(r.reason)}`);
    return [];
  };
  const byPattern = got(a, 'Loogle');
  const byMeaning = got(b, 'LeanSearch');
  if (down.length === (formal ? 2 : 1)) return { from: [], hits: [], unanswered: true, note: `No Lean search service answered (${down.join('; ')}). Try again later, or search with exact? and apply? inside Lean.` };
  const [first, second] = formal ? [byPattern, byMeaning] : [byMeaning, byPattern];
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
    a.status === 'fulfilled' && a.value?.said && !byPattern.length ? unread(a.value.said) : '',
    hits.length ? '' : 'Nothing was found: try other words, a pattern such as "_ + _ = _ + _", or a name.',
  ].filter(Boolean);
  const from = (['Loogle', 'LeanSearch'] as const).filter((s) => hits.some((h) => h.from === s));
  return { from, hits, ...(notes.length ? { note: notes.join(' ') } : {}) };
}

// Runs a search through the providers that are on, in order: the first that answers wins. One that
// fails for a while (no key yet, its allowance used up, a rate limit) rests until it may be asked
// again, so every search does not wait on it; and the same search within a few minutes is answered
// from memory.
import type { NagetCredits } from '../../shared/search.ts';
import { SearchError, type SearchErrorKind, type SearchProvider, type SearchQuery, type SearchResult } from './types.ts';

/** A provider with its settings. */
export interface Configured {
  provider: SearchProvider;
  enabled: boolean;
  key?: string;
  url?: string;
}

/** A provider that did not answer, and why. */
export interface Attempt {
  id: string;
  name: string;
  kind: SearchErrorKind | 'missing' | 'resting';
  message: string;
}

export interface SearchOutcome {
  provider: SearchProvider;
  results: SearchResult[];
  /** Filters the provider that answered could not keep to. */
  ignored: string[];
  /** The providers before it that could not answer. */
  failed: Attempt[];
}

/** Why a provider did not answer, without its name in front ("needs a key for now…"). */
const reason = (f: Attempt) => f.message.replace(new RegExp(`^${f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:?\\s*`), '').replace(/\.$/, '');

/** No provider could answer: each one's reason. */
export class NoProvider extends Error {
  failed: Attempt[];
  constructor(failed: Attempt[]) {
    super(failed.length ? `No search provider could answer. ${failed.map((f) => `${f.name}: ${reason(f)}.`).join(' ')}` : 'Every search provider is off in Settings → Search.');
    this.failed = failed;
  }
}

/** Why a provider cannot answer as set up, if so. */
export function missing(c: Configured): string | undefined {
  if (c.provider.key === 'required' && !c.key) return 'needs a key';
  if (c.provider.url?.required && !c.url) return 'needs its address';
  return undefined;
}

const CACHE_MS = 10 * 60_000;

export class Searcher {
  private fetch: typeof fetch;
  private onCredits?: (c: NagetCredits) => void;
  private now: () => number;
  /** Providers resting after a failure, until they may be asked again. */
  readonly resting = new Map<string, { until: number; kind: SearchErrorKind; message: string }>();
  /** Each provider's last failure, for Settings. */
  readonly lastError = new Map<string, { at: number; kind: string; message: string }>();
  private cache = new Map<string, { at: number; out: SearchOutcome }>();

  constructor(o: { fetch?: typeof fetch; credits?: (c: NagetCredits) => void; now?: () => number } = {}) {
    this.fetch = o.fetch ?? fetch;
    this.onCredits = o.credits;
    this.now = o.now ?? Date.now;
  }

  /** Lets a provider be asked again at once (its settings changed). */
  wake(id?: string) {
    if (id) {
      this.resting.delete(id);
      this.lastError.delete(id);
    } else {
      this.resting.clear();
      this.lastError.clear();
    }
    this.cache.clear();
  }

  /** Notes a provider's failure (here or in another of its services): it rests until it may be asked again. */
  rest(id: string, err: SearchError) {
    this.lastError.set(id, { at: this.now(), kind: err.kind, message: err.message });
    if (err.retryAt) this.resting.set(id, { until: err.retryAt, kind: err.kind, message: err.message });
  }

  /** The order to try: those on, the one asked for first. */
  order(list: Configured[], prefer?: string): Configured[] {
    const on = list.filter((c) => c.enabled);
    const first = prefer ? on.find((c) => c.provider.id === prefer) : undefined;
    return first ? [first, ...on.filter((c) => c !== first)] : on;
  }

  /** One provider, as set up, without falling back (Settings' Test button, and each step below). */
  async ask(c: Configured, q: SearchQuery, signal?: AbortSignal): Promise<{ results: SearchResult[]; ignored: string[] }> {
    const a = await c.provider.search(q, { key: c.key, url: c.url, signal: signal ?? new AbortController().signal, fetch: this.fetch, credits: this.onCredits });
    return { results: a.results.slice(0, q.k), ignored: a.ignored ?? [] };
  }

  async search(q: SearchQuery, list: Configured[], o: { prefer?: string; signal?: AbortSignal } = {}): Promise<SearchOutcome> {
    const order = this.order(list, o.prefer);
    const key = JSON.stringify([q, order.map((c) => c.provider.id)]);
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < CACHE_MS) return hit.out;
    const failed: Attempt[] = [];
    for (const c of order) {
      const p = c.provider;
      const why = missing(c);
      if (why) {
        failed.push({ id: p.id, name: p.name, kind: 'missing', message: why });
        continue;
      }
      const rest = this.resting.get(p.id);
      if (rest && rest.until > this.now()) {
        failed.push({ id: p.id, name: p.name, kind: 'resting', message: rest.message });
        continue;
      }
      try {
        const a = await this.ask(c, q, o.signal);
        this.resting.delete(p.id);
        this.lastError.delete(p.id);
        const out: SearchOutcome = { provider: p, results: a.results, ignored: a.ignored, failed };
        this.cache.set(key, { at: this.now(), out });
        if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value!);
        return out;
      } catch (e) {
        if (o.signal?.aborted) throw e;
        const err = e instanceof SearchError ? e : new SearchError('unavailable', `${p.name} failed: ${(e as Error)?.message ?? e}`);
        // The agent's arguments need fixing: another provider would only ignore them.
        if (err.kind === 'invalid') throw err;
        this.rest(p.id, err);
        failed.push({ id: p.id, name: p.name, kind: err.kind, message: err.message });
      }
    }
    throw new NoProvider(failed);
  }
}

/** A line for the agent on what happened before the provider that answered. */
export function fallbackNote(out: SearchOutcome): string | undefined {
  if (!out.failed.length) return undefined;
  const why = out.failed.map((f) => `${f.name} ${f.kind === 'missing' ? f.message : `could not answer (${reason(f)})`}`);
  return `${why.join('; ')}; so ${out.provider.name} answered.`;
}

// Search as the app runs it: the providers' settings (kept in the app's database, which only this user
// can read), which of them are resting after a failure, and Naget's categories and allowance. The sources a
// reply cites show with the reply itself (shared/citations.ts).
import type { NagetCredits, SearchEvent, SearchProviderView, SearchSettingsView, SearchTestResult } from '../../shared/search.ts';
import { FALLBACK_TAXONOMY, fetchTaxonomy, nagetBase, type Taxonomy } from './naget.ts';
import { PROVIDERS } from './providers.ts';
import { missing, Searcher, type Configured } from './run.ts';
import { SearchError, type ProviderCtx, type SearchProvider, type SearchQuery } from './types.ts';

interface Stored {
  order: string[];
  providers: Record<string, { enabled?: boolean; key?: string; url?: string }>;
  defaultK: number;
}

export interface KV {
  get(k: string): string | undefined;
  set(k: string, v: string): void;
}

/** What Settings may change at once. */
export interface SettingsPatch {
  order?: string[];
  defaultK?: number;
  provider?: { id: string; enabled?: boolean; key?: string | null; url?: string | null };
}

const DAY = 86_400_000;

/** An address as typed ("searx.example.org/") made whole ("https://searx.example.org"); throws for one that is not. */
function address(p: SearchProvider, raw: string | null | undefined): string {
  let url = typeof raw === 'string' ? raw.trim() : '';
  if (!url) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = `https://${url}`;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`"${raw}" is not a web address`);
  }
  url = url.replace(/\/+$/, '');
  return p.id === 'naget' ? nagetBase(url) : url;
}

/** "sk-ab…12cd": enough to tell keys apart, never the key. */
const keyHint = (k?: string) => (k ? (k.length > 12 ? `${k.slice(0, 5)}…${k.slice(-4)}` : '••••') : undefined);

export class SearchService {
  readonly providers: SearchProvider[];
  readonly searcher: Searcher;
  credits?: NagetCredits;
  private kv: KV;
  private emit: (e: SearchEvent) => void;
  private fetch: typeof fetch;
  private stored: Stored;
  private taxonomy: Taxonomy = FALLBACK_TAXONOMY;

  constructor(o: { kv: KV; emit?: (e: SearchEvent) => void; fetch?: typeof fetch; providers?: SearchProvider[] }) {
    this.kv = o.kv;
    this.emit = o.emit ?? (() => {});
    this.fetch = o.fetch ?? fetch;
    this.providers = o.providers ?? PROVIDERS;
    this.searcher = new Searcher({ fetch: this.fetch, credits: (c) => this.noteCredits(c) });
    this.stored = this.load();
    try {
      const t = JSON.parse(this.kv.get('search.taxonomy') ?? 'null') as Taxonomy | null;
      if (t?.categories?.length) this.taxonomy = t;
      this.credits = JSON.parse(this.kv.get('search.credits') ?? 'null') ?? undefined;
    } catch {}
  }

  /** Once the server is up: Naget's categories, read again each day. */
  start() {
    if (!this.taxonomy.live || Date.now() - this.taxonomy.at > DAY) void this.refreshTaxonomy();
    setInterval(() => void this.refreshTaxonomy(), DAY).unref();
  }

  private load(): Stored {
    let s: Partial<Stored> = {};
    try {
      s = JSON.parse(this.kv.get('search.settings') ?? '{}') ?? {};
    } catch {}
    const ids = this.providers.map((p) => p.id);
    const order = [...(Array.isArray(s.order) ? s.order.filter((id) => ids.includes(id)) : [])];
    // A provider added since keeps its place in the default order.
    for (const id of ids) if (!order.includes(id)) order.splice(Math.min(ids.indexOf(id), order.length), 0, id);
    const k = Number(s.defaultK);
    return { order, providers: s.providers && typeof s.providers === 'object' ? s.providers : {}, defaultK: Number.isInteger(k) && k >= 1 && k <= 100 ? k : 20 };
  }

  private save() {
    this.kv.set('search.settings', JSON.stringify(this.stored));
    this.emit({ kind: 'settings' });
  }

  get defaultK() {
    return this.stored.defaultK;
  }

  /** The providers with their settings, in the order they are tried. */
  configured(): Configured[] {
    return this.stored.order.map((id) => {
      const provider = this.providers.find((p) => p.id === id)!;
      const s = this.stored.providers[id] ?? {};
      return { provider, enabled: s.enabled ?? provider.enabledByDefault, key: s.key || undefined, url: s.url || provider.url?.default || undefined };
    });
  }

  /** The category ids a search can keep to. */
  categoryIds(): string[] {
    return this.taxonomy.categories.map((c) => c.id);
  }

  get categories() {
    return this.taxonomy;
  }

  view(): SearchSettingsView {
    const providers = this.configured().map((c): SearchProviderView => {
      const p = c.provider;
      const s = this.stored.providers[p.id] ?? {};
      const err = this.searcher.lastError.get(p.id);
      const why = missing(c);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        enabled: c.enabled,
        key: p.key,
        keyHint: keyHint(s.key),
        keyUrl: p.keyUrl,
        url: p.url ? { value: s.url ?? '', placeholder: p.url.placeholder, required: p.url.required, default: p.url.default } : undefined,
        caps: p.caps,
        missing: why === 'needs a key' ? 'Needs a key' : why ? 'Needs your instance’s address' : undefined,
        lastError: err,
      };
    });
    return { providers, defaultK: this.stored.defaultK, credits: this.credits };
  }

  /** Changes settings; throws with a message for the user when a value cannot be taken. */
  update(patch: SettingsPatch): SearchSettingsView {
    const ids = this.providers.map((p) => p.id);
    if (patch.order !== undefined) {
      if (!Array.isArray(patch.order)) throw new Error('order should be a list of provider ids');
      const order = patch.order.filter((id, i) => ids.includes(id) && patch.order!.indexOf(id) === i);
      this.stored.order = [...order, ...this.stored.order.filter((id) => !order.includes(id))];
    }
    if (patch.defaultK !== undefined) {
      const k = Number(patch.defaultK);
      if (!Number.isInteger(k) || k < 1 || k > 100) throw new Error('The number of results should be from 1 to 100');
      this.stored.defaultK = k;
    }
    const pp = patch.provider;
    if (pp) {
      const p = this.providers.find((x) => x.id === pp.id);
      if (!p) throw new Error(`There is no search provider "${pp.id}"`);
      const cur = { ...this.stored.providers[p.id] };
      let added = false;
      if (pp.key !== undefined) {
        const key = typeof pp.key === 'string' ? pp.key.trim() : '';
        if (key && /\s/.test(key)) throw new Error('A key has no spaces in it');
        if (key && p.key === 'none') throw new Error(`${p.name} takes no key`);
        added ||= !!key && key !== cur.key;
        if (key) cur.key = key;
        else delete cur.key;
      }
      if (pp.url !== undefined) {
        const url = address(p, pp.url);
        if (url && url !== p.url?.default) {
          added ||= url !== cur.url;
          cur.url = url;
        } else delete cur.url;
      }
      // Giving a provider what it needs turns it on, unless told otherwise.
      if (pp.enabled !== undefined) cur.enabled = !!pp.enabled;
      else if (added) cur.enabled = true;
      this.stored.providers[p.id] = cur;
      this.searcher.wake(p.id);
      if (p.id === 'naget' && (pp.key !== undefined || pp.url !== undefined)) void this.refreshTaxonomy();
    }
    this.save();
    return this.view();
  }

  /** One provider as set up (or with a key or address not saved yet), on a small search, without falling back. */
  async test(id: string, o: { key?: string; url?: string } = {}): Promise<SearchTestResult> {
    const c = this.configured().find((x) => x.provider.id === id);
    if (!c) return { ok: false, ms: 0, error: `There is no search provider "${id}"` };
    let t: Configured;
    try {
      t = { ...c, key: o.key?.trim() || c.key, url: address(c.provider, o.url) || c.url };
    } catch (e) {
      return { ok: false, ms: 0, error: (e as Error).message };
    }
    const why = missing(t);
    if (why) return { ok: false, ms: 0, error: `${c.provider.name} ${why}` };
    const q: SearchQuery = { text: 'open source web search engines', k: 5, sites: [], excludeSites: [], categories: [], languages: [], fileTypes: [], homepagesOnly: false, snippets: 'plain' };
    const at = Date.now();
    // With the settings as saved, the answer also says whether the provider works now (for Settings).
    const saved = !o.key && !o.url;
    try {
      const r = await this.searcher.ask(t, q, AbortSignal.timeout(45_000));
      if (saved) this.searcher.wake(id);
      return { ok: true, ms: Date.now() - at, count: r.results.length, sample: r.results.slice(0, 3).map((x) => ({ title: x.title, url: x.url })) };
    } catch (e) {
      if (saved && e instanceof SearchError) this.searcher.rest(id, e);
      return { ok: false, ms: Date.now() - at, error: e instanceof SearchError ? e.message : `${c.provider.name} failed: ${(e as Error)?.message ?? e}` };
    } finally {
      if (saved) this.changed();
    }
  }

  /** Tells open pages the providers' state changed (a failure, a recovery). */
  changed() {
    this.emit({ kind: 'settings' });
  }

  /**
   * Naget Search's settings for its other services (the context filter), while it is on and not resting.
   * Searching needs no key, but the context filter does: without one it is not asked at all, so its
   * refusal never rests Naget Search for the searches that follow.
   */
  naget(): { ctx?: ProviderCtx; why?: string } {
    const c = this.configured().find((x) => x.provider.id === 'naget');
    if (!c?.enabled) return { why: 'Naget Search is off in Settings → Search' };
    if (!c.key) return { why: 'Naget Search picks the parts of a page that answer a question only with a key (Settings → Search)' };
    const rest = this.searcher.resting.get('naget');
    if (rest && rest.until > Date.now()) return { why: rest.message };
    return { ctx: { key: c.key, url: c.url, signal: AbortSignal.timeout(120_000), fetch: this.fetch, credits: (x) => this.noteCredits(x) } };
  }

  private noteCredits(c: NagetCredits) {
    this.credits = c;
    this.kv.set('search.credits', JSON.stringify(c));
    this.emit({ kind: 'credits', credits: c });
  }

  async refreshTaxonomy(): Promise<void> {
    const c = this.configured().find((x) => x.provider.id === 'naget');
    if (!c) return;
    try {
      this.taxonomy = await fetchTaxonomy({ key: c.key, url: c.url, signal: AbortSignal.timeout(20_000), fetch: this.fetch, credits: (x) => this.noteCredits(x) });
      this.kv.set('search.taxonomy', JSON.stringify(this.taxonomy));
    } catch (e) {
      // Keep the last list read (or the documented one) until Naget answers; Settings shows why it did not.
      if (e instanceof SearchError && c.enabled) {
        this.searcher.rest('naget', e);
        this.changed();
      }
    }
  }
}

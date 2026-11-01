// Search as the app runs it: the providers' settings (kept in the app's database, which only this user
// can read), which of them are resting after a failure, Naget's categories and allowance, and the
// sources each turn used, which become a note under the turn's reply.
import type { NagetCredits, SearchEvent, SearchProviderView, SearchSettingsView, SearchTestResult, SourcesData } from '../../shared/search.ts';
import type { TimelineItem } from '../../shared/types.ts';
import type { Deps, TurnInfo } from '../features/types.ts';
import { addNote } from '../notes.ts';
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

type Source = { at: number; search?: SourcesData['searches'][number]; page?: SourcesData['pages'][number] };

const DAY = 86_400_000;
/** The app's own tools as each agent's transcript names them. */
const OWN_TOOL = /^mcp__(?:naget-agent|agent-console)__(?:web_search|read_page)$/;
/** The agents' own web tools: Claude Code's, and Codex's search. */
const AGENT_WEB: Record<string, string> = { WebSearch: 'Claude Code', WebFetch: 'Claude Code', web_search: 'Codex' };

/** What a turn searched and read with the agent's own web tools (the app's record themselves as they run). */
export function agentSources(items: TimelineItem[]): Source[] {
  const out: Source[] = [];
  for (const it of items) {
    if (it.kind !== 'tool' || it.tool.category !== 'web' || !AGENT_WEB[it.tool.name] || it.tool.status === 'error') continue;
    const t = it.tool;
    if (t.name === 'WebFetch') {
      // What it asked of the page (its subtitle turns into the answer's status once one comes).
      const prompt = (t.input as { prompt?: unknown } | undefined)?.prompt;
      const ask = typeof prompt === 'string' ? prompt.trim().split('\n')[0].slice(0, 200) : '';
      if (/^https?:\/\//.test(t.title)) out.push({ at: it.ts ?? 0, page: { url: t.title, ...(ask && { question: ask }) } });
      continue;
    }
    // Each result is a title, then its address on the next line, indented.
    const lines = (t.output ?? '').split('\n');
    const top: { title: string; url: string }[] = [];
    lines.forEach((l, i) => {
      const url = l.trim();
      if (/^\s+https?:\/\/\S+$/.test(l) && !top.some((r) => r.url === url)) top.push({ title: lines[i - 1]?.trim() || url, url });
    });
    out.push({ at: it.ts ?? 0, search: { query: t.title, provider: AGENT_WEB[t.name], count: top.length, top: top.slice(0, 5) } });
  }
  return out;
}

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
  private sources = new Map<string, Source[]>();

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

  // ---- the sources a turn used ------------------------------------------------------------------------

  record(key: string, s: Omit<Source, 'at'>) {
    const list = this.sources.get(key) ?? [];
    list.push({ ...s, at: Date.now() });
    this.sources.set(key, list.slice(-60));
  }

  /** The sources gathered for a session up to `until`, taken out, with `more` the turn's others. */
  take(key: string, until: number, more: Source[] = []): SourcesData | null {
    const list = this.sources.get(key) ?? [];
    if (!list.length && !more.length) return null;
    const mine = [...list.filter((s) => s.at <= until), ...more].sort((a, b) => a.at - b.at);
    const rest = list.filter((s) => s.at > until);
    if (rest.length) this.sources.set(key, rest);
    else this.sources.delete(key);
    const pages: SourcesData['pages'] = [];
    for (const s of mine) if (s.page && !pages.some((p) => p.url === s.page!.url)) pages.push(s.page);
    const searches = mine.flatMap((s) => (s.search ? [s.search] : []));
    return searches.length || pages.length ? { searches: searches.slice(0, 12), pages: pages.slice(0, 20) } : null;
  }

  /** A turn ended: what it searched and read becomes a note under its reply. */
  async turnEnded(t: TurnInfo, d: Deps): Promise<void> {
    // A session running elsewhere (VS Code, a terminal) is read only when the app's tools ran in it.
    if (t.external && !this.sources.get(t.key)?.length) return;
    let items: TimelineItem[] = [];
    try {
      items = (await d.sessions.timeline(t.key)).page(undefined, 400).items;
    } catch {}
    // The turn: what came after its prompt.
    const prompt = items.findLastIndex((it) => it.kind === 'user' && !it.meta);
    const turn = items.slice(prompt + 1);
    const data = this.take(t.key, t.endedAt + 1000, agentSources(turn));
    if (!data) return;
    // The turn's last search or read; else its last item.
    const last = turn.findLast((it) => it.kind === 'tool' && (OWN_TOOL.test(it.tool.name) || !!AGENT_WEB[it.tool.name]));
    addNote(d.db, { key: t.key, kind: 'sources', anchor: (last ?? items[items.length - 1])?.id, data });
  }
}

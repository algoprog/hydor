// A few real, read-only calls: Naget's taxonomy and search (anonymous unless NAGET_API_KEY is set),
// DuckDuckGo, a whole web_search through the providers in order, and read_page. Not part of the tests.
// Run: node server/search/tests/live.ts
import { parsePage, parseSearch } from '../../../shared/search.ts';
import type { Deps, RunCtx } from '../../features/types.ts';
import { duckduckgo } from '../duckduckgo.ts';
import { fetchTaxonomy, naget } from '../naget.ts';
import { SearchService } from '../service.ts';
import { searchTools } from '../tools.ts';
import type { ProviderCtx, SearchQuery } from '../types.ts';

const key = process.env.NAGET_API_KEY || undefined;
const ctx = (): ProviderCtx => ({ key, signal: AbortSignal.timeout(60_000), fetch, credits: (c) => console.log('  allowance:', JSON.stringify(c)) });
const q: SearchQuery = { text: 'solid state battery', k: 5, sites: [], excludeSites: [], categories: [], languages: [], fileTypes: [], homepagesOnly: false, snippets: 'plain' };
const step = async (name: string, fn: () => Promise<void>) => {
  const at = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - at} ms)`);
  } catch (e) {
    console.log(`FAIL ${name} (${Date.now() - at} ms): ${(e as Error).message}`);
  }
};

console.log(`Naget Search ${key ? 'with a key' : 'without a key'}`);
await step('Naget taxonomy', async () => {
  const t = await fetchTaxonomy(ctx());
  console.log(`  ${t.categories.length} categories: ${t.categories.map((c) => c.id).join(', ')}`);
});
await step('Naget search, categories uspto', async () => {
  const r = await naget.search({ ...q, categories: ['uspto'] }, ctx());
  for (const x of r.results) console.log(`  ${x.title} | ${x.url} | ${x.date ?? ''} | ${x.category ?? ''}`);
});
await step('DuckDuckGo', async () => {
  const r = await duckduckgo.search(q, { signal: AbortSignal.timeout(30_000), fetch });
  console.log(`  ${r.results.length} results`);
  for (const x of r.results.slice(0, 3)) console.log(`  ${x.title} | ${x.url}`);
});

const kv = new Map<string, string>();
const svc = new SearchService({ kv: { get: (k) => kv.get(k), set: (k, v) => void kv.set(k, v) } });
if (key) svc.update({ provider: { id: 'naget', key } });
const [web, read] = searchTools(svc);
const run = { runId: 'live', key: 'live', agent: 'claude', cwd: '/tmp', deps: {} as Deps } as RunCtx;
await step('web_search through the providers in order', async () => {
  const out = await web.run({ query: 'grid battery storage', k: 5 }, run);
  const text = typeof out === 'string' ? out : out.text;
  const p = parseSearch(text);
  console.log(text.split('\n').slice(0, 4).map((l) => `  ${l}`).join('\n'));
  if (!p) throw new Error('no results');
  console.log(`  parsed ${p.hits.length} results from ${p.provider}`);
});
await step('read_page with a question', async () => {
  const out = await read.run({ url: 'https://en.wikipedia.org/wiki/Grid_energy_storage', question: 'How large is the largest battery storage plant?' }, run);
  const text = typeof out === 'string' ? out : out.text;
  const p = parsePage(text);
  console.log(`  ${p?.title} · ${p?.detail}\n  ${p?.body.slice(0, 300).replace(/\n/g, ' ')}…`);
});

// Web search for every agent: web_search, read_page and find_media on each session's own MCP server, Naget
// Search by default with other providers behind it (providers.ts), and Settings → Search. The pages a reply
// cites show as links in it and as cards under it (shared/citations.ts, in the pages).
import type { SearchTestResult } from '../../shared/search.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet } from '../db.ts';
import type { Feature } from '../features/types.ts';
import { helper, helperParallel } from '../helper.ts';
import { iconRoutes } from '../web/icons.ts';
import { SearchService, type SettingsPatch } from './service.ts';
import { INSTRUCTIONS, searchTools } from './tools.ts';

let svc: SearchService | null = null;

export const search: Feature = {
  id: 'search',
  routes(d) {
    const s = (svc = new SearchService({
      kv: { get: (k) => kvGet(d.db, k), set: (k, v) => kvSet(d.db, k, v) },
      emit: (data) => d.broadcast({ t: 'feature', id: 'search', data }),
      // The helper model reads the filters a search's words state (search/reader.ts). Its answer is about 150
      // tokens; the room above that is for a helper that reasons first, which the reader's time limit still bounds.
      ask: (q) => helper(d.db, { system: q.system, prompt: q.prompt, timeoutMs: q.timeoutMs, signal: q.signal, maxTokens: 1000 }),
      parallel: () => helperParallel(d.db),
    }));
    d.app.get('/api/search/settings', async () => s.view());
    d.app.put('/api/search/settings', async (req) => {
      try {
        return s.update((req.body ?? {}) as SettingsPatch);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }
    });
    // The icons of the sites a reply cites.
    iconRoutes(d.app);
    d.app.post('/api/search/test', async (req): Promise<SearchTestResult> => {
      const b = (req.body ?? {}) as { id?: string; key?: string; url?: string };
      return s.test(String(b.id ?? ''), { key: typeof b.key === 'string' ? b.key : undefined, url: typeof b.url === 'string' ? b.url : undefined });
    });
  },
  tools: () => (svc ? searchTools(svc) : []),
  spawn: () => ({ guides: [{ tools: ['web_search', 'read_page', 'find_media'], text: INSTRUCTIONS }] }),
  start: () => svc?.start(),
};

// A project's wiki memory for the Projects tab: what is in it, and its files, read-only.
import path from 'node:path';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import type { ProjectWikiView, WikiArea } from '../../shared/wiki.ts';
import { spaceById } from '../spaces/index.ts';
import { browseWiki } from './browse.ts';
import { readFollowing } from './areas/redirects.ts';
import { areaArticles, membersByArea } from './areas/articles.ts';
import { areaOrder, hasAreas, hubPath, isHubPath, loadRegistry, memberPath } from './areas/registry.ts';
import { listOf, readOrNull, splitFront } from './digest/write.ts';
import { wikiFileActive } from './knowledge/bindings.ts';
import { wikiMemoryOn, wikiRoot } from './roots.ts';

/** The wiki's areas with their articles, for the Memory tab; undefined while it has none. */
function areasOf(root: string): WikiArea[] | undefined {
  const r = loadRegistry(root);
  if (!hasAreas(r)) return undefined;
  const members = membersByArea(areaArticles(root), r);
  const out: WikiArea[] = [];
  for (const { area } of areaOrder(r)) {
    const hub = readOrNull(root, hubPath(area.id));
    const order = hub ? listOf(splitFront(hub.content), 'members').map(memberPath) : [];
    const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
    const own = [...(members.get(area.id) ?? [])].sort((x, y) => rank(x.path) - rank(y.path) || x.title.localeCompare(y.title));
    if (!own.length && !r.areas.some((c) => c.parent === area.id && members.get(c.id)?.length)) continue;
    out.push({ id: area.id, name: area.name, about: area.about, parent: area.parent, ...(hub && wikiFileActive(root, path.join(root, ...hubPath(area.id).split('/'))) ? { hub: hubPath(area.id) } : {}), articles: own.map((a) => a.path) });
  }
  return out;
}

export const wikiBrowse: Feature = {
  id: 'wiki-browse',
  routes(d) {
    const project = (id: string) => {
      const p = spaceById(d.db, id);
      if (!p) throw new HttpError(404, 'No such project');
      return p;
    };
    /** The project's wiki folder, never made by looking: null while it is off or nothing has been written to it. */
    const target = (id: string) => {
      const on = wikiMemoryOn(d.db, id);
      return { on, root: on ? wikiRoot(d.db, id) : null };
    };
    d.app.get('/api/projects/:id/wiki', async (req): Promise<ProjectWikiView> => {
      const p = project(String((req.params as { id: string }).id));
      const inherited = p.wikiMemory === undefined;
      try {
        const { on, root } = target(p.id);
        if (!on) return { status: 'off', on, inherited };
        if (!root) return { status: 'empty', on, inherited };
        const view = browseWiki(root);
        const areas = areasOf(root);
        if (areas) view.articles = view.articles.filter((a) => !isHubPath(a.path));
        return { status: view.articles.length || view.sources.length || view.plans.length ? 'ready' : 'empty', on, inherited, root, ...view, ...(areas ? { areas } : {}) };
      } catch {
        return { status: 'error', on: wikiMemoryOn(d.db, p.id), inherited, error: 'The project wiki cannot be read safely.' };
      }
    });
    d.app.get('/api/projects/:id/wiki/file', async (req) => {
      const p = project(String((req.params as { id: string }).id));
      const relative = String((req.query as { path?: string }).path ?? '');
      try {
        const { root } = target(p.id);
        if (!root) throw new Error('No wiki');
        if (!/^(?:wiki|raw|output\/projects|output\/evidence)\//.test(relative) || !/\.md$/i.test(relative)) throw new Error('Not an active wiki document');
        // An article merged into another opens that one (one hop), as wiki_read does.
        const doc = readFollowing(root, relative);
        if (!wikiFileActive(root, path.resolve(root, doc.path))) throw new Error('Not an active wiki document');
        return doc;
      } catch { throw new HttpError(404, 'This wiki file is unavailable'); }
    });
  },
};

// A project's wiki memory for the Projects tab: what is in it, and its files, read-only.
import path from 'node:path';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import type { ProjectWikiView } from '../../shared/wiki.ts';
import { spaceById } from '../spaces/index.ts';
import { readWiki } from './core.ts';
import { browseWiki } from './browse.ts';
import { wikiFileActive } from './knowledge/bindings.ts';
import { wikiMemoryOn, wikiRoot } from './roots.ts';

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
        return { status: view.articles.length || view.sources.length || view.plans.length ? 'ready' : 'empty', on, inherited, root, ...view };
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
        if (!/^(?:wiki|raw|output\/projects)\//.test(relative) || !/\.md$/i.test(relative) || !wikiFileActive(root, path.resolve(root, relative))) throw new Error('Not an active wiki document');
        return readWiki(root, relative);
      } catch { throw new HttpError(404, 'This wiki file is unavailable'); }
    });
  },
};

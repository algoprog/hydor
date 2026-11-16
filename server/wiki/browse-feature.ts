// Project-scoped read-only wiki endpoints for the Projects tab.
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../auth.ts';
import type { Feature } from '../features/types.ts';
import { spaceById } from '../spaces/index.ts';
import { wikiSettings } from './settings/settings.ts';
import { binding } from './tools.ts';
import { readWiki, resolveWiki } from './core.ts';
import { browseWiki } from './browse.ts';
import { wikiFileActive } from './knowledge/bindings.ts';

export const wikiBrowse: Feature = {
  id: 'wiki-browse',
  routes(d) {
    /** Resolve this project's own binding without falling back to the shared hub. */
    const target = (id: string) => {
      const settings = wikiSettings(d.db);
      if (!settings.enabled) return { status: 'disabled' as const };
      const project = spaceById(d.db, id);
      if (!project) throw new HttpError(404, 'No such project');
      if (!project.folder) return { status: 'missing' as const };
      try {
        const candidate = binding(project.folder) ?? settings.projectPath;
        const requested = path.resolve(project.folder, candidate);
        if (!fs.existsSync(requested)) return { status: 'missing' as const, root: requested };
        const root = resolveWiki({ hub: settings.hubPath || project.folder, cwd: project.folder, projectWiki: candidate });
        return { status: 'ready' as const, root };
      } catch {
        return { status: 'error' as const, error: 'The project wiki cannot be read safely.' };
      }
    };
    d.app.get('/api/projects/:id/wiki', async (req) => {
      const result = target(String((req.params as { id: string }).id));
      if (result.status !== 'ready') return result;
      try { return { ...result, ...browseWiki(result.root) }; }
      catch { return { status: 'error', error: 'The project wiki cannot be read.' }; }
    });
    d.app.get('/api/projects/:id/wiki/file', async (req) => {
      const result = target(String((req.params as { id: string }).id));
      if (result.status !== 'ready') throw new HttpError(404, 'The project wiki is not available');
      const relative = String((req.query as { path?: string }).path ?? '');
      try {
        if (!/^(?:wiki|raw)\//.test(relative) || !/\.md$/i.test(relative) || !wikiFileActive(result.root, path.resolve(result.root, relative))) throw new Error('Not an active article or source');
        return readWiki(result.root, relative);
      }
      catch { throw new HttpError(404, 'This wiki file is unavailable'); }
    });
  },
};

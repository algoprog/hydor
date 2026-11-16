// The settings are local to this Hydor installation and never create or move wiki data.
import type { Feature } from '../../features/types.ts';
import type { WikiMemorySettings } from '../../../shared/wiki.ts';
import { setWikiSettings, wikiSettings } from './settings.ts';
import { invalidateWikiKnowledge } from '../knowledge/index.ts';
import { guardHubChange, wikiMigrationRoutes } from './migration-api.ts';

export const wikiSettingsFeature: Feature = {
  id: 'wiki-settings',
  routes(d) {
    d.app.get('/api/wiki/settings', async () => wikiSettings(d.db));
    d.app.put('/api/wiki/settings', async (req) => {
      const before = wikiSettings(d.db);
      const input = (req.body ?? {}) as Partial<WikiMemorySettings>;
      guardHubChange(d.db, input);
      const after = d.db.transaction(() => {
        const after = setWikiSettings(d.db, input);
        // Old indexed roots must stop appearing immediately after changing either location.
        if (before.hubPath !== after.hubPath || before.projectPath !== after.projectPath || before.projectWikis !== after.projectWikis) invalidateWikiKnowledge(d.db);
        return after;
      })();
      // Open chats refresh inherited defaults after the settings transaction commits.
      d.broadcast?.({ t: 'feature', id: 'wiki-settings', data: { changed: true } });
      return after;
    });
    wikiMigrationRoutes(d);
  },
};

// Wiki memory from documents (server/wiki/digest): new and changed documents in knowledge add memory notes and
// update the wiki. Listens to knowledge's 'indexed' event; lists what it did for the project page.
import { HttpError } from '../../auth.ts';
import type { Feature } from '../../features/types.ts';
import { knowledgeEvents, type IndexedDoc } from '../../knowledge/events.ts';
import { spaceById } from '../../spaces/index.ts';
import { createDigest, type Digest } from './digest.ts';
import { updatesOf } from './store.ts';

let digest: Digest | null = null;

export const wikiDigest: Feature = {
  id: 'wiki-digest',
  routes(d) {
    /** What new and changed documents did to the shared wiki and memory, newest first. */
    d.app.get('/api/wiki/updates', async () => ({ updates: updatesOf(d.db, null) }));
    /** The same for one project. */
    d.app.get('/api/projects/:id/wiki/updates', async (req) => {
      const id = String((req.params as { id: string }).id);
      if (!spaceById(d.db, id)) throw new HttpError(404, 'No such project');
      return { updates: updatesOf(d.db, id) };
    });
  },
  start(d) {
    digest?.dispose();
    const mine = (digest = createDigest(d.db, { onUpdate: (space) => d.broadcast({ t: 'feature', id: 'wiki', data: { space } }) }));
    knowledgeEvents.on('indexed', (doc: IndexedDoc) => mine.enqueue(doc));
  },
};

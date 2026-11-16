// What knowledge tells the rest of the app, so it need not import them: a document was read and is indexed, new or
// changed (a file the base already had, unchanged, is skipped before it gets here). Wiki memory listens
// (server/wiki/digest) to add memory notes and update the wiki from it.
import { EventEmitter } from 'node:events';

/** A document saved with status `indexed`: its base, its path as the base keeps it, and its title. */
export interface IndexedDoc {
  base: string;
  path: string;
  title: string;
}

/** Emits 'indexed' with an IndexedDoc. A listener that throws never holds up the indexing (see emitIndexed). */
export const knowledgeEvents = new EventEmitter();

export function emitIndexed(doc: IndexedDoc) {
  for (const fn of knowledgeEvents.listeners('indexed')) {
    try {
      fn(doc);
    } catch (e) {
      console.warn(`[knowledge] a listener failed: ${(e as Error).message}`);
    }
  }
}

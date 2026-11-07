// Comments on the Library's pictures, videos and sounds (shared/media-comments.ts): kept with each item in its row
// (media.comments, as JSON), apart from its file, so a new version of the picture keeps them. You change them on the
// item's page in the Library, agents through the API (app_api), and the people it is shared with through their link
// (server/spaces/portal-media.ts), each by a list of changes, so two at once lose nothing.
//
// Routes, signed in (media/index.ts):
//   GET  /api/media/:id/comments    { comments: MediaComment[] }
//   POST /api/media/:id/comments    { ops: MediaCommentOp[] } → { comments, added, notes }
import type { Writer } from '../../shared/comments.ts';
import { applyMediaOps, cleanMediaComments, type MediaComment } from '../../shared/media-comments.ts';
import type { DB } from '../db.ts';
import { initMedia, mustMedia } from './store.ts';

/** An item's comments, as kept. */
export function mediaComments(db: DB, id: string): MediaComment[] {
  initMedia(db);
  const r = db.prepare('select comments from media where id = ?').get(id) as { comments: string | null } | undefined;
  if (!r?.comments) return [];
  try {
    return cleanMediaComments(JSON.parse(r.comments));
  } catch {
    return [];
  }
}

/** Changes an item's comments, as `by` makes them: the list after them, what could not be done, the new ones and the replies. */
export function changeMediaComments(db: DB, id: string, ops: unknown, by: Writer) {
  mustMedia(db, id);
  return db.transaction(() => {
    const out = applyMediaOps(mediaComments(db, id), ops, by);
    db.prepare('update media set comments = ? where id = ?').run(out.list.length ? JSON.stringify(out.list) : null, id);
    return out;
  })();
}

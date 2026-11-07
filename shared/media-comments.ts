// Comments on the Library's pictures, videos and sounds, as the review tools for them have them: the comment itself is
// the editors' own (shared/comments.ts: who wrote it, when, what it says, the replies under it, resolved), and each may
// say where it is: a spot of the picture (or of a video's picture), as a pin there, and a moment of a video or a sound,
// as a mark on its timeline. Left out, it is about the whole of it. They are kept with the item, apart from its file
// (server/media/comments.ts), so saving a new version of the picture keeps them. You, agents (through the API) and the
// people it is shared with (server/spaces/share.ts) add, answer, resolve and delete them by a list of changes, as a
// page's comments are changed.

import { applyCommentChanges, cleanComment, COMMENT_LIMITS, newCommentId, type Comment, type CommentOpsResult, type Writer } from './comments.ts';

export interface MediaComment extends Comment {
  /** On a spot: from its left and from its top, as shares of its width and height (0 to 1). */
  x?: number;
  y?: number;
  /** At a moment of a video or a sound, in seconds from its start. */
  t?: number;
}

/**
 * A change of an item's comments: a new one ({text, x?, y?, t?}), a reply ({id, reply}), {id, resolve: true} or {id,
 * reopen: true}, its words changed ({id, edit}), {id, delete: true}, or moved ({id, x, y} or {id, t}).
 */
export interface MediaCommentOp {
  id?: string;
  text?: string;
  x?: number;
  y?: number;
  t?: number;
  reply?: string;
  resolve?: boolean;
  reopen?: boolean;
  edit?: string;
  delete?: boolean;
}

/** The longest moment a comment can be at: a day, in seconds. */
const MAX_T = 86_400;

const share = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 10_000) / 10_000 : undefined);
const moment = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < MAX_T ? Math.round(v * 100) / 100 : undefined);

/** Where a comment (or a change of one) says it is: a spot (both x and y), a moment, both, or neither. */
export function mediaPlace(o: Record<string, unknown>): Pick<MediaComment, 'x' | 'y' | 't'> | undefined {
  const x = share(o.x);
  const y = share(o.y);
  const t = moment(o.t);
  const out: Pick<MediaComment, 'x' | 'y' | 't'> = {};
  if (x !== undefined && y !== undefined) {
    out.x = x;
    out.y = y;
  }
  if (t !== undefined) out.t = t;
  return out.x !== undefined || out.t !== undefined ? out : undefined;
}

/** An item's comments, checked as the editors' are, each with where it is checked. */
export function cleanMediaComments(v: unknown, now = Date.now()): MediaComment[] {
  if (!Array.isArray(v)) return [];
  const out: MediaComment[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, COMMENT_LIMITS.comments)) {
    const c = cleanComment(x, now) as MediaComment | null;
    if (!c) continue;
    if (seen.has(c.id)) c.id = newCommentId();
    seen.add(c.id);
    const at = x && typeof x === 'object' ? mediaPlace(x as Record<string, unknown>) : undefined;
    if (at) Object.assign(c, at);
    out.push(c);
  }
  return out;
}

/** Applies changes to an item's comments, made by `by` (shared/comments.ts applyCommentChanges). */
export function applyMediaOps(list: MediaComment[], ops: unknown, by: Writer, now = Date.now()): CommentOpsResult<MediaComment> {
  return applyCommentChanges<MediaComment>(list, ops, by, mediaPlace, { noun: 'A picture, video or sound', lists: 'GET /api/media/<id>/comments lists them' }, now);
}

/** A moment as people read it: "0:07", "1:05", "1:02:03". */
export function momentText(t: number): string {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** The comments, open ones first and each kind of place in its order: moments in time, then spots, then the whole. */
export function sortMediaComments<C extends MediaComment>(list: C[]): C[] {
  const key = (c: C) => (c.t !== undefined ? c.t : c.x !== undefined ? MAX_T + (c.y ?? 0) * 10 + (c.x ?? 0) : MAX_T * 2 + c.at / 1e13);
  return [...list].sort((a, b) => Number(!!a.resolved) - Number(!!b.resolved) || key(a) - key(b) || a.at - b.at);
}

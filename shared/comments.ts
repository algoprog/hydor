// Comments on what the editors hold (a document's words, a slide, a cell, a LaTeX line), as Google Docs and Word have
// them: who wrote it (you, an agent, or someone a project is shared with, by name), when, what it says, the replies
// under it, and whether it was resolved. Agents
// read them with get_page and answer or resolve them when they save, so a comment is a way to ask for a change where
// it is needed. Each editor keeps its comments in its own model and says what each is about in its own way; this file
// is the comment itself and its checking: plain text only, with limits.

export const COMMENT_LIMITS = { comments: 500, replies: 50, text: 4000, quote: 500 };

/** user: you, the app's owner; agent: an agent; person: someone a project is shared with (server/spaces/share.ts), by name. */
export type CommentBy = 'user' | 'agent' | 'person';

export interface CommentReply {
  id: string;
  by: CommentBy;
  /** A person's name, as the owner gave it when sharing the project with them. */
  name?: string;
  /** Which person: the id of their share (it stays theirs when their link is made again). */
  who?: string;
  text: string;
  /** When it was written: ms since 1970. */
  at: number;
}

export interface Comment {
  id: string;
  by: CommentBy;
  /** A person's name (by: person). */
  name?: string;
  /** Which person (by: person): their share's id. */
  who?: string;
  text: string;
  /** When it was written: ms since 1970. */
  at: number;
  resolved?: boolean;
  /** The words it was about when it was made, to show beside it (the editor keeps where they are now). */
  quote?: string;
  replies?: CommentReply[];
}

export const newCommentId = () => `c${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;

const ID = /^[A-Za-z0-9_-]{1,40}$/;

const cleanText = (v: unknown, max: number) =>
  typeof v === 'string'
    ? v
        .replace(/\r\n?/g, '\n')
        // Control characters other than line breaks and tabs say nothing a person wrote.
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';

const cleanAt = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? Math.round(v) : fallback);

const cleanBy = (v: unknown): CommentBy => (v === 'agent' ? 'agent' : v === 'person' ? 'person' : 'user');

/** Who wrote it: its kind, and for a person their name and share (a person with no name is no one: it reads as yours). */
function author(o: Record<string, unknown>): Pick<Comment, 'by' | 'name' | 'who'> {
  const by = cleanBy(o.by);
  if (by !== 'person') return { by };
  const name = cleanText(o.name, 60).replace(/\s+/g, ' ');
  if (!name) return { by: 'user' };
  return typeof o.who === 'string' && ID.test(o.who) ? { by, name, who: o.who } : { by, name };
}

/** Who wrote a comment or a reply, as agents are told it. */
export function authorForAgent(c: Pick<Comment, 'by' | 'name'>): string {
  return c.by === 'agent' ? 'an agent' : c.by === 'person' ? `${c.name || 'someone'} (someone the user shared the project with)` : 'the user';
}

/** One comment, checked; null when it says nothing. */
export function cleanComment(v: unknown, now = Date.now()): Comment | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = cleanText(o.text, COMMENT_LIMITS.text);
  if (!text) return null;
  const c: Comment = { id: typeof o.id === 'string' && ID.test(o.id) ? o.id : newCommentId(), ...author(o), text, at: cleanAt(o.at, now) };
  if (o.resolved === true) c.resolved = true;
  const quote = cleanText(o.quote, COMMENT_LIMITS.quote);
  if (quote) c.quote = quote;
  if (Array.isArray(o.replies)) {
    const replies: CommentReply[] = [];
    for (const r of o.replies.slice(0, COMMENT_LIMITS.replies)) {
      if (!r || typeof r !== 'object') continue;
      const ro = r as Record<string, unknown>;
      const t = cleanText(ro.text, COMMENT_LIMITS.text);
      if (!t) continue;
      replies.push({ id: typeof ro.id === 'string' && ID.test(ro.id) ? ro.id : newCommentId(), ...author(ro), text: t, at: cleanAt(ro.at, now) });
    }
    if (replies.length) c.replies = replies;
  }
  return c;
}

/** A list of comments, checked: each one's text plain and within its limits, ids that are ids and not twice. */
export function cleanComments(v: unknown, now = Date.now()): Comment[] {
  if (!Array.isArray(v)) return [];
  const out: Comment[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (out.length >= COMMENT_LIMITS.comments) break;
    const c = cleanComment(x, now);
    if (!c) continue;
    if (seen.has(c.id)) c.id = newCommentId();
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** The comments not resolved yet. */
export const openComments = (cs: Comment[] | undefined) => (cs ?? []).filter((c) => !c.resolved);

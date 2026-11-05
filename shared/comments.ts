// Comments on what the editors hold (a document's words, a slide, a cell, a LaTeX line), as Google Docs and Word have
// them: who wrote it (you or an agent), when, what it says, the replies under it, and whether it was resolved. Agents
// read them with get_page and answer or resolve them when they save, so a comment is a way to ask for a change where
// it is needed. Each editor keeps its comments in its own model and says what each is about in its own way; this file
// is the comment itself and its checking: plain text only, with limits.

export const COMMENT_LIMITS = { comments: 500, replies: 50, text: 4000, quote: 500 };

export interface CommentReply {
  id: string;
  by: 'user' | 'agent';
  text: string;
  /** When it was written: ms since 1970. */
  at: number;
}

export interface Comment {
  id: string;
  by: 'user' | 'agent';
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

const cleanBy = (v: unknown): 'user' | 'agent' => (v === 'agent' ? 'agent' : 'user');

/** One comment, checked; null when it says nothing. */
export function cleanComment(v: unknown, now = Date.now()): Comment | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const text = cleanText(o.text, COMMENT_LIMITS.text);
  if (!text) return null;
  const c: Comment = { id: typeof o.id === 'string' && ID.test(o.id) ? o.id : newCommentId(), by: cleanBy(o.by), text, at: cleanAt(o.at, now) };
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
      replies.push({ id: typeof ro.id === 'string' && ID.test(ro.id) ? ro.id : newCommentId(), by: cleanBy(ro.by), text: t, at: cleanAt(ro.at, now) });
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

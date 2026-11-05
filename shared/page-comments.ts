// Comments on a page of HTML's blocks (the page editor's, as Notion has them): the comment itself is the editors' own
// (shared/comments.ts: who, when, what it says, replies, resolved), and each says which block it is on: where that block
// was among the page's parts, its tag and the start of its words, so the editor finds it again as the page changes. They
// are kept with the page, outside its HTML (its look, its scripts and the data it stores are untouched), and shown only
// in the app. People add, answer, resolve and delete them in the editor; agents read them with get_page and answer,
// resolve or add them with save_page. A list of changes (`PageCommentOp`) does all of that, so two at once lose nothing.

import { cleanComment, COMMENT_LIMITS, newCommentId, type Comment } from './comments.ts';

/** Which block a comment is on. */
export interface PageAnchor {
  /** Where the block was when last placed: its index among its parent's parts, from the page's <html> down. */
  path?: number[];
  /** Its tag then ("h2", "li", "pre"…). */
  tag?: string;
  /** The start of its words then, to find it again when the page changed around it. */
  words?: string;
}

export interface PageComment extends Comment {
  on?: PageAnchor;
}

/**
 * A change of a page's comments: a new one ({text, on?, quote?}, with an id of the caller's if it likes); a reply
 * ({id, reply}); {id, resolve: true} or {id, reopen: true}; its words changed ({id, edit}); {id, delete: true}; or its
 * block's new place, as the editor saw it when the page was saved ({id, on}). An agent may give `on` as the words of the
 * block a new comment is about.
 */
export interface PageCommentOp {
  id?: string;
  text?: string;
  quote?: string;
  on?: PageAnchor | string;
  reply?: string;
  resolve?: boolean;
  reopen?: boolean;
  edit?: string;
  delete?: boolean;
}

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** An anchor, checked: a path of small numbers, a tag's name, a line of words. */
export function cleanAnchor(v: unknown): PageAnchor | undefined {
  if (typeof v === 'string') {
    const words = v.replace(/\s+/g, ' ').trim().slice(0, 300);
    return words ? { words } : undefined;
  }
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const a: PageAnchor = {};
  if (Array.isArray(o.path) && o.path.length <= 40 && o.path.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < 100_000)) a.path = o.path as number[];
  if (typeof o.tag === 'string' && /^[a-z][a-z0-9-]{0,15}$/.test(o.tag)) a.tag = o.tag;
  if (typeof o.words === 'string') {
    const words = o.words.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (words) a.words = words;
  }
  return a.path || a.words ? a : undefined;
}

/** A page's comments, checked (as the editors' are), each with its anchor checked. */
export function cleanPageComments(v: unknown, now = Date.now()): PageComment[] {
  if (!Array.isArray(v)) return [];
  const out: PageComment[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, COMMENT_LIMITS.comments)) {
    const c = cleanComment(x, now) as PageComment | null;
    if (!c) continue;
    if (seen.has(c.id)) c.id = newCommentId();
    seen.add(c.id);
    const on = cleanAnchor((x as { on?: unknown }).on);
    if (on) c.on = on;
    out.push(c);
  }
  return out;
}

/** Applies changes to a page's comments, made by `by`: the list after them, and what could not be done (for an agent). */
export function applyCommentOps(list: PageComment[], ops: unknown, by: 'user' | 'agent', now = Date.now()): { list: PageComment[]; notes: string[]; added: string[] } {
  const out: PageComment[] = list.map((c) => ({ ...c, ...(c.replies ? { replies: [...c.replies] } : {}) }));
  const notes: string[] = [];
  const added: string[] = [];
  if (!Array.isArray(ops)) return { list: out, notes: ['comments must be a list of changes, such as [{"id": "c1", "reply": "…"}]: they were left as they were.'], added };
  const text = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string).replace(/\r\n?/g, '\n').trim().slice(0, COMMENT_LIMITS.text) : '');
  for (const raw of ops.slice(0, 200)) {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim() : '';
    const c = id ? out.find((x) => x.id === id) : undefined;
    if (c) {
      if (o.delete === true) {
        out.splice(out.indexOf(c), 1);
        continue;
      }
      const reply = text(o, 'reply');
      if (reply) {
        c.replies = [...(c.replies ?? []), { id: `${c.id}r${(c.replies?.length ?? 0) + 1}${now.toString(36).slice(-3)}`, by, text: reply, at: now }].slice(-COMMENT_LIMITS.replies);
      }
      if (o.resolve === true || o.resolved === true) c.resolved = true;
      if (o.reopen === true || o.resolved === false) delete c.resolved;
      const edit = text(o, 'edit');
      if (edit) {
        if (c.by === by) c.text = edit;
        else notes.push(`Comment ${id} is ${c.by === 'user' ? 'the user’s' : 'an agent’s'}: answer it with "reply".`);
      }
      const on = cleanAnchor(o.on);
      if (on) c.on = on;
      if (!reply && !edit && !on && o.resolve === undefined && o.resolved === undefined && o.reopen === undefined && text(o, 'text')) notes.push(`There is a comment ${id} already: answer it with "reply", or give a new comment another id.`);
      continue;
    }
    if (o.delete === true || text(o, 'reply') || o.resolve !== undefined || o.reopen !== undefined || text(o, 'edit')) {
      notes.push(`There is no comment ${id || '(no id)'} to change: get_page lists them.`);
      continue;
    }
    const words = text(o, 'text');
    if (!words) continue;
    if (out.length >= COMMENT_LIMITS.comments) {
      notes.push(`A page keeps at most ${COMMENT_LIMITS.comments} comments.`);
      break;
    }
    const nid = ID.test(id) && !out.some((x) => x.id === id) ? id : newCommentId();
    const quote = text(o, 'quote').replace(/\s+/g, ' ').slice(0, COMMENT_LIMITS.quote);
    const on = cleanAnchor(o.on);
    out.push({ id: nid, by, text: words, at: now, ...(quote ? { quote } : {}), ...(on ? { on } : {}) });
    added.push(nid);
  }
  return { list: out, notes, added };
}

const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');

/** The comments as an agent reads them in get_page, and how to answer them. */
export function commentsForAgent(list: PageComment[]): string {
  if (!list.length) return '';
  const open = list.filter((c) => !c.resolved).length;
  const who = (by: 'user' | 'agent' | 'person') => (by === 'agent' ? 'an agent' : by === 'person' ? 'someone the user shared the project with' : 'the user');
  return [
    `Comments (${open} open, ${list.length - open} resolved), each on a block of the page:`,
    ...list.flatMap((c) => [
      `- ${c.id} · ${c.resolved ? 'resolved' : 'open'}${c.on?.tag ? ` · on the <${c.on.tag}>` : ''}${c.on?.words ? ` “${c.on.words.slice(0, 120)}”` : ''}${c.quote && c.quote !== c.on?.words ? `, the words “${c.quote.slice(0, 160)}”` : ''} · ${who(c.by)}, ${when(c.at)} UTC: ${c.text.replace(/\n/g, ' / ')}`,
      ...(c.replies ?? []).map((r) => `    ↳ ${who(r.by)}, ${when(r.at)} UTC: ${r.text.replace(/\n/g, ' / ')}`),
    ]),
    'To answer them, save_page with this id and comments: [{"id": "<id>", "reply": "what you did or say", "resolve": true}] (resolve once it is dealt with; "reopen": true opens it again). Make the change a comment asks for in the html too; to only answer, leave html out. Add one of your own with {"text": "…", "on": "words of the block it is about"}.',
  ].join('\n');
}

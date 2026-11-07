// What Resolve with AI asks an agent about comments (web/src/features/pages/common/commentAi.tsx): to make the change
// each comment asks for and, in the same save, reply to it saying what it changed and resolve it; to answer a comment
// that only asks something, and leave it open; to say why when it cannot do one. Each comment is named by where it
// is (a file's line, a slide's part, a sheet's cell, a block), the words it is on, its id (get_page lists them), what
// it says and its last replies. The words go to agents, and show as the person's own message in the conversation:
// they are not translated (scripts/i18n-extract.mjs leaves this file out).
import type { Comment, CommentReply } from './comments.ts';

/** A comment as a request names it: `where` says where it is ("In main.tex, line 12, on “…”"); left out, the words it is on. */
export interface AskedComment {
  c: Comment;
  where?: string;
}

const short = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Who wrote a comment or a reply (the request is the person's own message: they are "I"). */
function writer(c: Pick<Comment | CommentReply, 'by' | 'name' | 'author'>): string {
  if (c.by === 'agent') return 'an agent';
  if (c.by === 'person') return c.name || 'someone it is shared with';
  return c.author ?? 'me';
}

/** Where a comment is when nothing else says: the words it is on. `what` names the thing ("document", "page"). */
export const onWords = (c: Pick<Comment, 'quote'>, what: string) => (c.quote?.trim() ? `On “${short(c.quote, 140)}”` : `On the ${what} as a whole`);

/** A LaTeX comment: its file (as the editor names it), its line, and its words. */
export const texWhere = (file: string, line: number, c: Pick<Comment, 'quote'>) => `In ${file}, line ${line}, ${onWords(c, 'file').replace(/^On/, 'on')}`;

/** A spreadsheet's comment: its cell and sheet. */
export const sheetWhere = (cell: string, sheet: string) => `On cell ${cell} of the sheet “${sheet}”`;

/** A slide's comment: its slide (number from 1, title), and its part (what it is, its words, its id) or the whole slide. */
export function slideWhere(n: number, title: string, part?: { kind: string; words: string; id: string }): string {
  const on = part ? `its ${part.kind.toLowerCase()}${part.words.trim() ? ` “${short(part.words, 80)}”` : ''} (part ${part.id})` : 'the slide as a whole';
  return `On slide ${n}${title.trim() ? ` (“${short(title, 60)}”)` : ''}, ${on}`;
}

/** A page's comment on no words of its own: the block it is on, by the start of its words. */
export const blockWhere = (words: string) => `On the block that starts “${short(words, 100)}”`;

/** A document in Suggesting: the agent suggests its changes too. */
export const SUGGEST_NOTE = 'I am suggesting changes in it: suggest yours too rather than make them (save_doc with "suggest": true), so that I can accept or reject each.';

/** A LaTeX file of this computer's (opened from Files): changed in place, its comments answered with save_latex's path. */
export const DISK_NOTE = 'It is the LaTeX file open on this computer: change its files in place with your own tools, then answer the comments with save_latex’s path and comments.';

/** Which saved page a request is about, before it, where the conversation may have several ("About “Q3 report” (page 3f9a…): "). */
export const pageNamed = (title: string | undefined, id: string | undefined) => (id ? `About “${short(title || 'the page', 80)}” (page ${id}): ` : '');

/**
 * The request: what to do, each comment (numbered when there are several), and what to do with a question or with what
 * cannot be done. `what` names the thing ("document", "LaTeX document", "slides", "spreadsheet", "page"); `extra`
 * says more (SUGGEST_NOTE, DISK_NOTE).
 */
export function commentsRequest(list: AskedComment[], what: string, extra?: string): string {
  const one = list.length === 1;
  const head = one
    ? `Resolve this comment in the ${what}: make the change it asks for, then, in the same save, reply to it in a sentence saying what you changed and resolve it.`
    : `Resolve these ${list.length} comments in the ${what}: make the change each asks for, then, in the same save, reply to each in a sentence saying what you changed and resolve it.`;
  const items = list.map(({ c, where }, i) => {
    const by = c.by === 'user' && !c.author ? '' : `, by ${writer(c)}`;
    const lines = [`${one ? '' : `${i + 1}. `}${where ?? onWords(c, what)} (comment ${c.id}${by}): ${short(c.text, 1500)}`];
    for (const r of (c.replies ?? []).slice(-4)) lines.push(`${one ? '' : '   '}↳ ${writer(r) === 'me' ? 'My reply' : `Reply from ${writer(r)}`}: ${short(r.text, 400)}`);
    return lines.join('\n');
  });
  const rules = one
    ? 'If it only asks a question, answer it in a reply and leave it open; if you cannot do what it asks, reply saying why and leave it open.'
    : 'If a comment only asks a question, answer it in a reply and leave it open; if you cannot do what one asks, reply saying why and leave it open.';
  return [head, items.join('\n'), [extra, rules].filter(Boolean).join(' ')].join('\n\n');
}

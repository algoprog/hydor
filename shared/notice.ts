// How a session notice ("finished", "needs you", "failed") reads: the session's name cut to fit a
// line, and the status before the detail.
import type { NotifyEvent } from './types.ts';

export const NOTICE_VERB: Record<NotifyEvent['kind'], string> = { done: 'Finished', waiting: 'Needs you', failed: 'Failed' };

/** A long title (sessions are named after their first message) cut at a word, with an ellipsis. */
export function shortTitle(title: string, max = 60): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** The status, then what there is to say about it; a notice that already says what it needs stands alone. */
export function noticeLine(n: { kind: NotifyEvent['kind']; body?: string }): { status: string; detail?: string } {
  if (n.kind === 'waiting') return { status: n.body || NOTICE_VERB.waiting };
  const status = NOTICE_VERB[n.kind];
  return { status, detail: n.body && n.body !== status ? n.body : undefined };
}

/** A notice as a system notification: the session's name as the title, the status first in the body. */
export function noticeText(n: NotifyEvent): { title: string; body: string } {
  const { status, detail } = noticeLine(n);
  return { title: shortTitle(n.title || 'Naget Agent'), body: detail ? `${status} · ${detail}` : status };
}

// What a message to an agent is suggested from, besides the words typed: the agent's last reply (the one being
// answered, even while it is still being written) and the person's message before. Read when a request goes out.
import { childReplyOf } from '@shared/children';
import { goalMessageOf } from '@shared/goals';
import type { TimelineItem } from '@shared/types';
import { useLive, useTimeline } from '../../lib/store';

/** The text of the last item of a kind, newest first among these (the live overlay's, not yet in the transcript, are newer). */
function lastText(lists: TimelineItem[][], pick: (i: TimelineItem) => string | undefined): string | undefined {
  for (const list of lists) for (let n = list.length - 1; n >= 0; n--) {
    const t = pick(list[n]);
    if (t?.trim()) return t;
  }
  return undefined;
}

/** What goes with the text typed in session `key`'s message box. */
export function chatContext(key: string): { reply?: string; prev?: string; session: string } {
  const lists = [useLive.getState().byKey[key]?.overlay.items ?? [], useTimeline.getState().byKey[key]?.items ?? []];
  return {
    reply: lastText(lists, (i) => (i.kind === 'assistant' ? i.text : undefined)),
    prev: lastText(lists, (i) => (i.kind === 'user' && !i.meta && !i.peer && !childReplyOf(i.text) && !goalMessageOf(i.text) ? i.text : undefined)),
    session: key,
  };
}

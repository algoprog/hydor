// After each turn of a session the app runs, a note under the reply lists what the agent saved to memory or
// removed from it in that turn (its remember and forget calls), each with undo. Memory is not written by
// itself after a reply: notes come from agents (when the user asks, or they learn something lasting) and
// from the user in Settings, and the nightly tidy-up (tidy.ts) keeps them short and current.
import { splitRunMessage } from '../../shared/automations.ts';
import type { MemoryChange, MemoryHistoryRow, MemoryNoteData } from '../../shared/memory.ts';
import type { TimelineItem, ToolInfo } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { addNote } from '../notes.ts';
import { changesSince, cursorOf, entries, setCursor } from './store.ts';

/** One exchange: what the user wrote, the steps taken, the final reply (and its timeline item). */
export interface Turn {
  user: string[];
  steps: string[];
  reply: string;
  anchor?: string;
  /** A scheduled run started it: its message is the task's, not words the user wrote now. */
  run?: boolean;
}

/** Most turns read at once (when several ended close together). */
const MAX_TURNS = 3;

const isUser = (it: TimelineItem): it is Extract<TimelineItem, { kind: 'user' }> => it.kind === 'user' && (!it.meta || it.meta === 'queued') && !it.peer && !!it.text.trim();

/** A step as a short line: its kind and title, never what it returned. */
export function stepLine(t: ToolInfo): string | null {
  if (t.category === 'todo') return null;
  const title = (t.label || t.title || t.name).split('\n')[0].trim();
  const short = title.length > 120 ? title.slice(0, 119) + '…' : title;
  return `${t.category}: ${short}${t.status === 'error' ? ' (failed)' : ''}`;
}

/**
 * The turns after the item `after`, oldest first, at most MAX_TURNS; the latest turn alone when `after`
 * is not given or no longer in the conversation (it was rewound). `last` is the conversation's last item.
 */
export function turnsAfter(items: TimelineItem[], after?: string): { turns: Turn[]; last?: string } {
  let start = after ? items.findIndex((i) => i.id === after) + 1 : 0;
  if (start <= 0) {
    start = 0;
    for (let i = items.length - 1; i >= 0; i--)
      if (isUser(items[i])) {
        start = i;
        break;
      }
  }
  const turns: Turn[] = [];
  const next = (): Turn => {
    const t: Turn = { user: [], steps: [], reply: '' };
    turns.push(t);
    return t;
  };
  let cur: Turn | null = null;
  let afterStep = false;
  for (const it of items.slice(start)) {
    if (isUser(it)) {
      // A message sent while the agent was still at it joins its turn; one after a reply starts the next.
      if (!cur || cur.reply || cur.steps.length) {
        cur = next();
        afterStep = false;
      }
      if (splitRunMessage(it.text)) cur.run = true;
      else cur.user.push(it.text);
    } else if (it.kind === 'tool') {
      cur ??= next();
      const line = stepLine(it.tool);
      if (line && cur.steps.length < 40) cur.steps.push(line);
      afterStep = true;
    } else if (it.kind === 'assistant' && it.text.trim()) {
      cur ??= next();
      // The final reply is what the agent wrote after its last step.
      cur.reply = afterStep || !cur.reply ? it.text : `${cur.reply}\n\n${it.text}`;
      cur.anchor = it.id;
      afterStep = false;
    } else if (it.kind === 'turn') {
      // A turn the agent goes on with by itself (a goal's) starts afresh.
      cur = null;
      afterStep = false;
    }
  }
  // A run's own turn is left out (each run would teach the task's prompt again), unless the user wrote in it too.
  return { turns: turns.filter((t) => t.user.length || (t.reply && !t.run)).slice(-MAX_TURNS), last: items[items.length - 1]?.id };
}

/** An agent's own remember and forget calls, as changes for the note. */
function agentChanges(db: DB, rows: MemoryHistoryRow[]): MemoryChange[] {
  const out: MemoryChange[] = [];
  for (const h of rows) {
    if (h.action === 'restored' || h.action === 'expiry') continue;
    const e = entries(db, { ids: [h.entry], status: 'all' })[0];
    if (e) out.push({ entry: h.entry, action: h.action, scope: e.scope, scopeKey: e.scopeKey, before: h.before, after: h.after, why: h.why, source: 'agent' });
  }
  return out;
}

/**
 * Adds a note under the last reply with the agent's own memory changes since the session was last read (no
 * note when there are none) and moves its cursor on. Returns the changes.
 */
export function noteChanges(db: DB, o: { key: string; items: TimelineItem[] }): { changes: MemoryChange[]; noteId?: string } {
  const startedAt = Date.now();
  const cursor = cursorOf(db, o.key);
  const { turns, last } = turnsAfter(o.items, cursor?.item);
  const changes = agentChanges(
    db,
    changesSince(db, o.key, cursor?.at ?? 0, 'agent').filter((h) => h.at <= startedAt && (cursor || h.at >= startedAt - 30 * 60_000)),
  );
  setCursor(db, o.key, last, startedAt);
  if (!changes.length) return { changes };
  const data: MemoryNoteData = { changes };
  const note = addNote(db, { key: o.key, kind: 'memory', anchor: turns[turns.length - 1]?.anchor ?? last, data });
  return { changes, noteId: note.id };
}

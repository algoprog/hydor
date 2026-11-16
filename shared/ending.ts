// How a session's work ended, for its status while nothing runs: Done (its last turn finished), Stopped (you stopped
// it, or it was cut off before it could finish) or Failed (it ended with an error); with the files its turns made or
// changed. Read from a timeline: the session's page reads the one it already has (each turn's end is recorded in it,
// with how it went), and the server reads the one it holds when a turn ends, to keep how it ended for the start page's
// "While you were away" (server/away).
import type { TimelineItem } from './types.ts';

export type Ending = 'done' | 'stopped' | 'failed';

export interface SessionEnd {
  ended: Ending;
  /** New files its turns made, and files they changed that were there before (each counted once). */
  made: number;
  changed: number;
}

/** A message you sent, not one the app or another program added. */
const sent = (it: TimelineItem) => it.kind === 'user' && (!it.meta || it.meta === 'queued');

/** The files the turns in `items` made (new ones, oldest first) and changed (there before), each once; deleted ones left out. */
export function filesOf(items: TimelineItem[]): { made: string[]; changed: string[] } {
  const made = new Set<string>();
  const changed = new Set<string>();
  for (const it of items) {
    if (it.kind !== 'tool' || !it.tool.files || it.tool.status === 'error' || it.tool.status === 'declined') continue;
    for (const f of it.tool.files) {
      const p = f.op === 'move' && f.movePath ? f.movePath : f.path;
      if (f.op === 'delete') continue;
      if (f.op === 'create') {
        if (!changed.has(p)) made.add(p);
      } else if (!made.has(p)) changed.add(p);
    }
  }
  return { made: [...made], changed: [...changed] };
}

/**
 * How the work in `items` ended (oldest first, as the timeline gives them); null while there is nothing to tell (no
 * turn yet), which keeps the wording of before.
 */
export function sessionEnd(items: TimelineItem[]): SessionEnd | null {
  let ended: Ending | null = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    // A message sent after the last turn ended, whose turn never did: it was cut off.
    if (sent(it)) {
      ended = 'stopped';
      break;
    }
    if (it.kind !== 'turn') continue;
    if (it.status === 'interrupted') ended = 'stopped';
    else if (it.status === 'failed') ended = 'failed';
    else {
      // A turn that "completed" on an error (Claude Code ends a turn on an API error it could not get past): the
      // error came after the last thing the agent said or did.
      ended = 'done';
      for (let j = i - 1; j >= 0; j--) {
        const x = items[j];
        if (x.kind === 'system' && x.level === 'error' && !x.peer) {
          ended = 'failed';
          break;
        }
        if (x.kind === 'assistant' || x.kind === 'tool' || sent(x)) break;
      }
    }
    break;
  }
  if (!ended) return null;
  const f = filesOf(items);
  return { ended, made: f.made.length, changed: f.changed.length };
}

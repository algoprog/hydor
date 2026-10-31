// A conversation's turns, as the timeline groups them: a message from the user and everything the agent
// did until the next one. Child sessions report a turn's reply; a second opinion checks a turn's work.
import type { FileChange, TimelineItem, UserItem } from '../../shared/types.ts';

/** A message from the user that begins a turn (not a note the harness added, nor a command's output). */
export const opensTurn = (it: TimelineItem): it is UserItem => it.kind === 'user' && it.meta !== 'note' && it.meta !== 'command-output';

export interface Turn {
  /** The message that began it; none for what came before the first one. */
  prompt?: UserItem;
  items: TimelineItem[];
  /** What the agent wrote after its last step. */
  reply: string;
  /** completed, interrupted or failed; none while it runs. */
  status?: string;
  /** The error it stopped with, if any. */
  error?: string;
  /** Files it changed (one entry per edit, in order). */
  files: FileChange[];
  commands: { title: string; failed: boolean }[];
  /** Its last item, to put a note under it. */
  last: TimelineItem;
}

function build(prompt: UserItem | undefined, items: TimelineItem[]): Turn {
  const all = prompt ? [prompt, ...items] : items;
  const files: FileChange[] = [];
  const commands: Turn['commands'] = [];
  let lastStep = -1;
  let status: string | undefined;
  let error: string | undefined;
  items.forEach((it, i) => {
    if (it.kind === 'tool') {
      lastStep = i;
      if (it.tool.files && it.tool.status !== 'error' && it.tool.status !== 'declined') files.push(...it.tool.files);
      if (it.tool.category === 'command') commands.push({ title: it.tool.title, failed: it.tool.status === 'error' || (it.tool.exitCode != null && it.tool.exitCode !== 0) });
    } else if (it.kind === 'turn') status = it.status;
    else if (it.kind === 'system' && it.level === 'error') error = it.detail || it.text;
  });
  const said = items.filter((it, i): it is Extract<TimelineItem, { kind: 'assistant' }> => it.kind === 'assistant' && !!it.text.trim() && i > lastStep);
  // Codex marks its last message as the final answer; the others are what it said on the way.
  const final = said.filter((it) => it.phase === 'final_answer');
  let reply = (final.length ? final : said).map((it) => it.text.trim()).join('\n\n');
  if (!reply) {
    const lastSaid = [...items].reverse().find((it) => it.kind === 'assistant' && it.text.trim());
    reply = lastSaid?.kind === 'assistant' ? lastSaid.text.trim() : '';
  }
  return { prompt, items, reply, status, error, files, commands, last: all[all.length - 1] };
}

/** Every turn, oldest first. */
export function turnsOf(items: TimelineItem[]): Turn[] {
  const out: Turn[] = [];
  let prompt: UserItem | undefined;
  let cur: TimelineItem[] = [];
  const flush = () => {
    if (prompt || cur.length) out.push(build(prompt, cur));
  };
  for (const it of items) {
    if (opensTurn(it)) {
      flush();
      prompt = it;
      cur = [];
    } else cur.push(it);
  }
  flush();
  return out;
}

/** The latest turn that began with a message. */
export function lastTurn(items: TimelineItem[]): Turn | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (opensTurn(it)) return build(it, items.slice(i + 1));
  }
  return undefined;
}

/** A turn by the id of its message; the latest finished one when none is given. */
export function findTurn(items: TimelineItem[], id?: string, running = false): Turn | undefined {
  const list = turnsOf(items).filter((t) => t.prompt);
  if (id) return list.find((t) => t.prompt!.id === id);
  // The one still running is not finished yet.
  return (running ? list.slice(0, -1) : list).at(-1);
}

/** Each file's changes in one diff, in the order it was first changed. */
export function mergedDiffs(files: FileChange[]): { path: string; added: number; removed: number; diff: string }[] {
  const by = new Map<string, { path: string; added: number; removed: number; diff: string }>();
  for (const f of files) {
    const e = by.get(f.path) ?? { path: f.path, added: 0, removed: 0, diff: '' };
    e.added += f.added;
    e.removed += f.removed;
    const d = (f.diff ?? '').trim() || (f.op === 'delete' ? '(file deleted)' : '');
    if (d) e.diff = e.diff ? `${e.diff}\n${d}` : d;
    by.set(f.path, e);
  }
  return [...by.values()];
}

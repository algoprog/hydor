// Who writes the code behind drawings (SVG) and plots (Python): the helper model the user picked in Settings →
// Models, else Claude's Sonnet through its CLI (a stronger writer than the helper's usual Haiku), else Codex, as the
// app's other one-off questions are asked (server/oneshot.ts). Nothing of it is kept as a session.
import type { DB } from '../db.ts';
import { helper, helperModelId, helperOptions } from '../helper.ts';
import { oneShot } from '../oneshot.ts';

export interface WriteAsk {
  system: string;
  prompt: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** The writer's name, as the editors' price lines say it ("Claude", or the helper model's). */
export function writerName(db: DB): string {
  const id = helperModelId(db);
  if (id === 'auto') return 'Claude';
  return helperOptions(db).options.find((x) => x.value === id)?.label ?? id;
}

/** What the writer answers, and its name. */
export async function writeWith(db: DB, q: WriteAsk): Promise<{ text: string; model: string }> {
  const id = helperModelId(db);
  if (id !== 'auto') return { text: await helper(db, { system: q.system, prompt: q.prompt, timeoutMs: q.timeoutMs, signal: q.signal, maxTokens: 16_000 }), model: writerName(db) };
  return { text: await oneShot({ system: q.system, prompt: q.prompt, model: 'sonnet', timeoutMs: q.timeoutMs ?? 180_000, signal: q.signal }), model: 'Claude' };
}

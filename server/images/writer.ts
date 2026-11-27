// Who writes the code behind drawings (SVG) and plots (Python): the helper model (Settings → Models); on Automatic,
// Claude's Sonnet through its CLI (a stronger writer than the helper's usual Haiku), else Codex, else one of
// Custom's models, as far as they are signed in here. Nothing of it is kept as a session.
import type { DB } from '../db.ts';
import { helper, helperName } from '../helper.ts';

export interface WriteAsk {
  system: string;
  prompt: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** The writer's name, as the editors' price lines say it ("Claude", or the helper model's). */
export const writerName = (db: DB): string => helperName(db);

/** What the writer answers, and its name. */
export async function writeWith(db: DB, q: WriteAsk): Promise<{ text: string; model: string }> {
  const text = await helper(db, { system: q.system, prompt: q.prompt, strong: true, timeoutMs: q.timeoutMs ?? 180_000, signal: q.signal, maxTokens: 16_000, task: 'writing a drawing’s code' });
  return { text, model: writerName(db) };
}

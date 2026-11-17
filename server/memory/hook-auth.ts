// Binds Claude Code's file-touch hook to one running Hydor run, without giving it the run's MCP token (as the wiki's
// hooks do: server/wiki/session/hook-auth.ts). Signed for its purpose alone: it opens the memory-touch route, nothing else.
import crypto from 'node:crypto';
import { signWithKey } from '../links.ts';

/** The scoped bearer for one run's memory hook. */
export function memoryHookToken(runId: string): string {
  return `${runId}.${signWithKey(`memory-hook:${runId}`).slice(0, 22)}`;
}

/** The run a bearer was signed for, or null. */
export function memoryHookRunOf(token: string): string | null {
  const runId = token.split('.')[0];
  if (!/^[a-f0-9]{12}$/.test(runId)) return null;
  const expected = memoryHookToken(runId);
  return expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? runId : null;
}

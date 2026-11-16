// Bind a native Claude hook to one active Hydor run without granting its MCP token.
import crypto from 'node:crypto';
import { signWithKey } from '../../links.ts';

/** Derive a narrow token whose only consumer is the native wiki hook endpoint. */
export function wikiHookToken(runId: string): string {
  return `${runId}.${signWithKey(`wiki-hook:${runId}`).slice(0, 22)}`;
}

/** Reject malformed and non-matching run identifiers before looking up a live session. */
export function wikiHookRunOf(token: string): string | null {
  const runId = token.split('.')[0];
  if (!/^[a-f0-9]{12}$/.test(runId)) return null;
  const expected = wikiHookToken(runId);
  return expected.length === token.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? runId : null;
}

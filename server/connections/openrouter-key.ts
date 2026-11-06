// The OpenRouter key, asked for when a model that runs through OpenRouter is needed and none is set: a tool that
// makes pictures, drawings, videos or sounds (or cuts a picture out without the picture tools) puts a card in the
// conversation, as request_secret's does, and waits. The key goes from the person's browser straight to Settings →
// Models → OpenRouter (never through the conversation, never into the vault), checked with OpenRouter first; then the
// tool goes on. They may skip it: then that model does not run, nothing is spent, and the session is not asked again
// for a while (the agent is told to go on without it). Runs nobody watches (a scheduled task's, an app's) get no card.
import { sessionExtra } from '../sessionExtra.ts';
import type { RunCtx } from '../features/types.ts';
import { loadConfig } from '../models/config.ts';
import { notifyRequest } from './tools.ts';
import { addRequest, latestRequest } from './vault.ts';

/** The request's name: what the card and the inbox show. */
export const OPENROUTER_REQUEST = 'OPENROUTER_API_KEY';

/** How long a tool waits for the key (under Codex's ten minutes for a tool call). */
const WAIT_MS = 540_000;
/** A session that skipped it is not asked again for this long. */
const SKIP_MS = 6 * 3600_000;

/** What became of the ask: the key, or why there is none. */
export type KeyAnswer = { key: string } | { key: null; why: 'skipped' | 'skipped-before' | 'nobody' | 'timeout' | 'stopped' };

const waiting = new Map<string, Set<(a: KeyAnswer) => void>>();
const skipped = new Map<string, number>();

/** Whether someone can answer a card in this run: not a scheduled task's or an app's run, and the session is in the app. */
function attended(ctx: RunCtx): boolean {
  if (!ctx.deps.sessions.adapterByRun(ctx.runId)) return false;
  try {
    const x = sessionExtra(ctx.deps.db, ctx.key);
    return !x.automations && !x.app;
  } catch {
    return true;
  }
}

/**
 * The OpenRouter key: the one set in Settings → Models, else the user is asked for it on a card in the conversation
 * (`why`: what it is for and what it costs, in a sentence or two) and this waits for their answer.
 */
export async function openRouterKey(ctx: RunCtx, o: { why: string; waitMs?: number }): Promise<KeyAnswer> {
  const have = loadConfig().openrouter.apiKey;
  if (have) return { key: have };
  if (!attended(ctx)) return { key: null, why: 'nobody' };
  const at = skipped.get(ctx.key);
  if (at && Date.now() - at < SKIP_MS) return { key: null, why: 'skipped-before' };
  const db = ctx.deps.db;
  // One card at a time in a session: a second tool waits on the same one.
  if (latestRequest(db, ctx.key, OPENROUTER_REQUEST)?.state !== 'pending') {
    addRequest(db, { key: ctx.key, name: OPENROUTER_REQUEST, why: o.why.replace(/\s+/g, ' ').trim().slice(0, 600), domains: ['openrouter.ai'] });
    notifyRequest(ctx.key);
  }
  return new Promise<KeyAnswer>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const done = (a: KeyAnswer) => {
      clearTimeout(timer);
      waiting.get(ctx.key)?.delete(done);
      ctx.signal?.removeEventListener('abort', stop);
      resolve(a);
    };
    const stop = () => done({ key: null, why: 'stopped' });
    timer = setTimeout(() => done({ key: null, why: 'timeout' }), o.waitMs ?? WAIT_MS);
    ctx.signal?.addEventListener('abort', stop, { once: true });
    if (!waiting.has(ctx.key)) waiting.set(ctx.key, new Set());
    waiting.get(ctx.key)!.add(done);
  });
}

/** The card was answered with a key (saved in Settings → Models): the tools waiting go on. Whether any was waiting. */
export function keyGiven(session: string, key: string): boolean {
  skipped.delete(session);
  const w = [...(waiting.get(session) ?? [])];
  for (const f of w) f({ key });
  return w.length > 0;
}

/** The card was skipped: the tools waiting give up, and the session is not asked again for a while. Whether any was waiting. */
export function keySkipped(session: string): boolean {
  skipped.set(session, Date.now());
  const w = [...(waiting.get(session) ?? [])];
  for (const f of w) f({ key: null, why: 'skipped' });
  return w.length > 0;
}

/** What a tool tells the agent when there is no key, by why: `what` names what did not run ("Seedream 5.0 Pro", "the picture"). */
export function noKeyText(a: Exclude<KeyAnswer, { key: string }>, what: string): string {
  switch (a.why) {
    case 'skipped':
      return `The user chose not to add an OpenRouter key, so ${what} did not run: nothing was made and nothing was spent. Do not ask for the key again; go on without it (another way that needs no key, or none), and say so in a few words.`;
    case 'skipped-before':
      return `The user chose earlier in this session not to add an OpenRouter key, so ${what} did not run: nothing was made. Do not ask for the key; go on without it.`;
    case 'timeout':
      return `The user did not answer the card asking for an OpenRouter key in time, so ${what} did not run. The card stays in the conversation: if they add the key, you will hear of it. Meanwhile go on without it.`;
    case 'stopped':
      return `Stopped before an OpenRouter key was given: ${what} did not run.`;
    default:
      return `${what} runs through OpenRouter, and no OpenRouter key is set. Tell the user to add one in Settings → Models → OpenRouter (keys come from https://openrouter.ai/keys); then try again.`;
  }
}

/** Whether OpenRouter takes the key (a quick question to it); true when it cannot be reached, so a key is never refused for that alone. */
export async function keyWorks(key: string): Promise<boolean> {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    return r.status !== 401 && r.status !== 403;
  } catch {
    return true;
  }
}

// What a connected app asks of its client partway through a call: a form for the user to fill in (MCP
// "elicitation"), or a ping. The bridge (a local app) and the relay (a remote one) bring these here
// rather than to the agent, so every agent gets the same card in the session, beside its own approvals.
import crypto from 'node:crypto';
import { elicitCard, elicitCheck, elicitResult, type ElicitParams, type ElicitResult } from '../agents/elicit.ts';
import type { Deps } from '../features/types.ts';
import type { Rpc } from './upstream.ts';

/** Shows the form in the session the run belongs to and waits for the user; cancelled when nobody can answer. */
export async function askForm(d: Deps, runId: string, from: string, p: ElicitParams, signal?: AbortSignal): Promise<ElicitResult> {
  const adapter = d.sessions.adapterByRun(runId);
  if (!adapter) return { action: 'cancel' };
  const card = elicitCard(`form-${crypto.randomBytes(6).toString('hex')}`, from, p, { app: true });
  // An hour at most: the app's call has long given up by then.
  const limit = AbortSignal.timeout(3600_000);
  const a = await adapter.ask(card, { signal: signal ? AbortSignal.any([signal, limit]) : limit, check: (x) => elicitCheck(p, x) });
  return elicitResult(p, a);
}

/** The answer to a request from a connected app: a form, a ping; nothing else is offered. */
export async function answerApp(d: Deps, runId: string, from: string, m: Rpc, signal?: AbortSignal): Promise<Rpc> {
  if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
  if (m.method === 'elicitation/create') return { jsonrpc: '2.0', id: m.id, result: await askForm(d, runId, from, (m.params ?? {}) as ElicitParams, signal) };
  return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Not offered' } };
}

/** The agent's initialize, saying its client takes forms: the app shows them, whatever the agent itself can. */
export function withForms<T extends Rpc>(m: T): T {
  if (m.method !== 'initialize') return m;
  return { ...m, params: { ...(m.params ?? {}), capabilities: { ...(m.params?.capabilities ?? {}), elicitation: { form: {}, url: {} } } } };
}

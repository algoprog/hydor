// The "email" connection's MCP server, answered by Hydor itself: agents reach it at the relay's address like any
// connected app (relay.ts), so turning a tool off, Ask first and masking apply to it as to the others. Also the
// direct call the Outbox makes for a held call once the person allows it, and the connection's Test.
import type { Deps } from '../features/types.ts';
import type { Conn } from '../connections/apps.ts';
import type { Rpc } from '../connections/upstream.ts';
import type { DB } from '../db.ts';
import { listAccounts, passwordOf, setAccountStatus } from './accounts.ts';
import { MailError, testImap } from './imap.ts';
import { mailToolInfos, runMailTool, type MailToolInfo } from './tools.ts';

const PROTOCOL = '2025-06-18';

/** The session's folder, from its key. */
const folderOf = (d: Deps, key?: string) => (key ? d.sessions.summary(key)?.cwd : undefined);

/**
 * Makes a tools/call directly, without a run's address: for the Outbox, which makes a held call itself once the person
 * allows it (the agent's run may have ended by then). `cwd` is the session's folder (attachments); `key` finds it when not given.
 */
export async function callBuiltin(d: Deps, c: Conn, tool: string, args: Record<string, unknown>, o: { key?: string; cwd?: string } = {}): Promise<{ content: unknown[]; isError?: boolean; structuredContent?: unknown }> {
  if (c.entry.server.transport !== 'builtin') return { content: [{ type: 'text', text: `${c.entry.name} is not answered here` }], isError: true };
  const r = await runMailTool({ db: d.db, cwd: o.cwd ?? folderOf(d, o.key) }, tool, args ?? {});
  return { content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) };
}

/** Answers what an agent sends the "email" server: introductions, the tools, and calls to them. */
export async function viaBuiltin(d: Deps, c: Conn, run: { runId: string; key: string }, msgs: Rpc[]): Promise<{ status?: undefined; text?: undefined; replies: Rpc[]; sessionId?: string }> {
  const replies: Rpc[] = [];
  for (const m of msgs) {
    if (m.id === undefined || m.id === null) continue;
    const ok = (result: unknown) => replies.push({ jsonrpc: '2.0', id: m.id, result });
    switch (m.method) {
      case 'initialize':
        ok({ protocolVersion: typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'hydor-email', version: '1' } });
        break;
      case 'ping':
        ok({});
        break;
      case 'tools/list':
        ok({ tools: mailToolInfos(d.db) });
        break;
      case 'resources/list':
        ok({ resources: [] });
        break;
      case 'prompts/list':
        ok({ prompts: [] });
        break;
      case 'tools/call':
        ok(await callBuiltin(d, c, String(m.params?.name ?? ''), (m.params?.arguments ?? {}) as Record<string, unknown>, { key: run.key }));
        break;
      default:
        replies.push({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } });
    }
  }
  return { replies };
}

/** The connection's Test: signs in to every account (reading), keeping each one's outcome; its tools when all work. */
export async function testBuiltin(db: DB, _c: Conn): Promise<{ tools: MailToolInfo[] }> {
  const accounts = listAccounts(db);
  if (!accounts.length) throw new MailError('No mail account is connected yet: add one with Change');
  const failed: string[] = [];
  await Promise.all(
    accounts.map(async (a) => {
      try {
        await testImap(a, passwordOf(db, a.id));
        setAccountStatus(db, a.id, 'ok');
      } catch (e) {
        setAccountStatus(db, a.id, 'error', (e as Error).message);
        failed.push(`${a.address}: ${(e as Error).message}`);
      }
    }),
  );
  if (failed.length) throw new MailError(failed.join(' · '));
  return { tools: mailToolInfos(db) };
}

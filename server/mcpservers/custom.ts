// Adding one of Custom's own MCP servers to Hydor's file (server/setup.ts adds to Claude Code, Codex and Custom
// at once; server/mcpservers/index.ts changes and removes them).
import type { McpSpec, SetupResult } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { readStore, storeFile, writeStore, type StoredServer } from './store.ts';

export const customStore = () => storeFile(config.dataDir);

export const names = (o: Record<string, string> | undefined) => (o && Object.keys(o).length ? Object.keys(o) : undefined);

/** The server as the file keeps it; setup.ts checked the name, address, command and names of variables and headers. */
export function stored(s: McpSpec): StoredServer {
  for (const v of [...Object.values(s.env ?? {}), ...Object.values(s.headers ?? {})]) if (typeof v !== 'string' || /[\r\n]/.test(v)) throw new HttpError(400, 'Each value is one line of text');
  if (s.transport === 'stdio') return { type: 'stdio', command: s.command!.trim(), args: (s.args ?? []).map(String), ...(names(s.env) ? { env: s.env } : {}) };
  return { type: s.transport, url: s.url!.trim(), ...(names(s.headers) ? { headers: s.headers } : {}) };
}

export function addCustom(s: McpSpec): SetupResult {
  if (s.name === 'hydor') return { ok: false, output: 'The name hydor is the app’s own server: pick another.' };
  const store = readStore(customStore());
  if (Object.hasOwn(store.servers, s.name)) return { ok: false, output: `Custom has a server named ${s.name} already: edit it, or pick another name.` };
  store.servers[s.name] = stored(s);
  writeStore(customStore(), store);
  return { ok: true, output: `Added ${s.name}` };
}

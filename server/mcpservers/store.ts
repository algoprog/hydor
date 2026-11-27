// Custom's own MCP servers, the ones added in Settings → MCP servers rather than in Claude Code's or Codex's
// settings: a file in the data folder (mode 0600, like the programs' own configs, as it holds environment and
// header values), written by the app and read by Custom's agent process (server/agent/mcp.ts) at each session.
// It also names the addresses Hydor holds a browser sign-in for (server/mcpservers/signin.ts): requests to
// those go through the app, which adds the token. No token is ever written here.
import fs from 'node:fs';
import path from 'node:path';

export interface StoredServer {
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpStore {
  servers: Record<string, StoredServer>;
  signedIn: string[];
}

/** The environment variable that tells Custom's agent where the file is. */
export const STORE_ENV = 'HYDOR_MCP_SERVERS';

export const storeFile = (dataDir: string) => path.join(dataDir, 'mcp-servers.json');

export function readStore(file: string | undefined): McpStore {
  let j: any = null;
  if (file) {
    try {
      j = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      // A file that is there but cannot be read must not be written over with an empty one.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`Could not read ${file}: ${(e as Error).message}`);
    }
  }
  return {
    servers: j?.servers && typeof j.servers === 'object' ? j.servers : {},
    signedIn: Array.isArray(j?.signedIn) ? j.signedIn.map(String) : [],
  };
}

export function writeStore(file: string, s: McpStore) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

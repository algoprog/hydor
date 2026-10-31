import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const home = os.homedir();
const here = path.dirname(fileURLToPath(import.meta.url));
// dist/server/*.js -> project root is two levels up
export const APP_ROOT = process.env.NAGET_AGENT_ROOT ?? process.env.WEB_AGENT_ROOT ?? path.resolve(here, '..', '..');

function packageVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function firstExisting(...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  return undefined;
}

// The Codex binary the npm package ships for this platform (as its own launcher picks it).
const CODEX_TARGET: Record<string, [string, string]> = {
  'linux-x64': ['codex-linux-x64', 'x86_64-unknown-linux-musl'],
  'linux-arm64': ['codex-linux-arm64', 'aarch64-unknown-linux-musl'],
  'darwin-x64': ['codex-darwin-x64', 'x86_64-apple-darwin'],
  'darwin-arm64': ['codex-darwin-arm64', 'aarch64-apple-darwin'],
};
const codexTarget = CODEX_TARGET[`${process.platform}-${process.arch}`];
const vendoredCodex = codexTarget && path.join(APP_ROOT, `node_modules/@openai/${codexTarget[0]}/vendor/${codexTarget[1]}/bin/codex`);
/** The ripgrep that comes with Codex, when this platform's package has one. */
export const bundledRg = codexTarget && firstExisting(path.join(APP_ROOT, `node_modules/@openai/${codexTarget[0]}/vendor/${codexTarget[1]}/codex-path/rg`));

/** The app's own data: ~/.naget-agent, or ~/.web-agent where an older install keeps it. */
function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  const dir = path.join(home, '.naget-agent');
  const older = path.join(home, '.web-agent');
  return !fs.existsSync(dir) && fs.existsSync(older) ? older : dir;
}

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 8790),
  dataDir: dataDir(),
  home,
  defaultCwd: process.env.DEFAULT_CWD ?? home,
  claudeBin: process.env.CLAUDE_BIN ?? firstExisting(path.join(home, '.local/bin/claude')) ?? 'claude',
  codexBin: process.env.CODEX_BIN ?? firstExisting(vendoredCodex, path.join(home, '.local/bin/codex')) ?? 'codex',
  codexPackageRoot: path.join(APP_ROOT, 'node_modules/@openai/codex'),
  claudeProjectsDir: process.env.CLAUDE_PROJECTS_DIR ?? path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(home, '.claude'), 'projects'),
  codexHome: process.env.CODEX_HOME ?? path.join(home, '.codex'),
  /**
   * Extra origins allowed to call state-changing APIs and open the WebSocket, comma-separated (the
   * address a reverse proxy serves the app at). Same-host requests and localhost always pass.
   */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Stop an idle live session after this long without activity (0 = never). */
  idleStopMs: Number(process.env.IDLE_STOP_HOURS ?? 3) * 3600_000,
  webDist: path.join(APP_ROOT, 'dist/web'),
  /** From package.json, the one place it is kept. */
  version: packageVersion(),
};

/**
 * Where agents keep their history: the default account's folders, then those of accounts added in
 * Settings → Accounts (server/accounts.ts keeps the lists current).
 */
export const agentRoots = {
  claudeProjects: [config.claudeProjectsDir],
  codexHomes: [config.codexHome],
};

export const paths = {
  db: path.join(config.dataDir, fs.existsSync(path.join(config.dataDir, 'web-agent.db')) ? 'web-agent.db' : 'naget-agent.db'),
  auth: path.join(config.dataDir, 'auth.json'),
  setupToken: path.join(config.dataDir, 'setup-token'),
  runs: path.join(config.dataDir, 'runs'),
  uploads: path.join(config.dataDir, 'uploads'),
  probe: path.join(config.dataDir, 'probe'),
  logs: path.join(config.dataDir, 'logs'),
};

export function ensureDirs() {
  for (const d of [config.dataDir, paths.runs, paths.uploads, paths.probe, paths.logs]) {
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  }
}

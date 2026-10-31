// The agents' own programs (Claude Code, Codex, Gemini CLI, OpenCode…). One that is missing when it
// is needed (signing in, a session starting, an agent added) is installed with npm into the app's own
// folder, so no administrator rights are needed; those copies are brought up to date once a day. A
// program the user installed themselves is used as it is and left alone.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ClientInfo } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { APP_ROOT, config } from './config.ts';

export const CLIENTS_DIR = path.join(config.dataDir, 'clients');
export const CLIENTS_BIN = path.join(CLIENTS_DIR, 'node_modules', '.bin');

/** The npm package of each program the app can install, by the command it runs as. */
export const PACKAGES: Record<string, { pkg: string; name: string }> = {
  claude: { pkg: '@anthropic-ai/claude-code', name: 'Claude Code' },
  codex: { pkg: '@openai/codex', name: 'Codex' },
  gemini: { pkg: '@google/gemini-cli', name: 'Gemini CLI' },
  opencode: { pkg: 'opencode-ai', name: 'OpenCode' },
  qwen: { pkg: '@qwen-code/qwen-code', name: 'Qwen Code' },
  auggie: { pkg: '@augmentcode/auggie', name: 'Auggie' },
};

const nodeDir = path.dirname(process.execPath);
const npmBin = fs.existsSync(path.join(nodeDir, 'npm')) ? path.join(nodeDir, 'npm') : 'npm';

function npm(args: string[], timeout: number): Promise<{ ok: boolean; out: string }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), PATH: `${nodeDir}:${process.env.PATH ?? '/usr/bin:/bin'}` };
  delete env.NODE_ENV;
  return new Promise((resolve) => execFile(npmBin, args, { env, timeout, maxBuffer: 16 << 20 }, (err, out, errOut) => resolve({ ok: !err, out: `${out}\n${errOut}`.trim() })));
}

const pkgJson = (dir: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
};

/** The version the app installed of a program, if it did. */
export const managedVersion = (cmd: string): string | null => (PACKAGES[cmd] ? (pkgJson(path.join(CLIENTS_DIR, 'node_modules', PACKAGES[cmd].pkg))?.version ?? null) : null);
const managedBin = (cmd: string) => (fs.existsSync(path.join(CLIENTS_BIN, cmd)) ? path.join(CLIENTS_BIN, cmd) : null);

/** A command on the PATH (or a path that exists). */
function onPath(cmd: string): string | null {
  if (cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null;
  for (const d of (process.env.PATH ?? '').split(':').concat(path.join(process.env.HOME ?? '', '.local/bin'))) {
    if (!d || d === CLIENTS_BIN) continue;
    try {
      fs.accessSync(path.join(d, cmd), fs.constants.X_OK);
      return path.join(d, cmd);
    } catch {}
  }
  return null;
}

const busy = new Map<string, Promise<string>>();

/** Installs (or updates) a program into the app's folder; its command's path. */
export function install(cmd: string): Promise<string> {
  const p = PACKAGES[cmd];
  if (!p) throw new HttpError(400, `The app cannot install ${cmd} by itself`);
  const running = busy.get(cmd);
  if (running) return running;
  const job = (async () => {
    fs.mkdirSync(CLIENTS_DIR, { recursive: true });
    if (!fs.existsSync(path.join(CLIENTS_DIR, 'package.json'))) fs.writeFileSync(path.join(CLIENTS_DIR, 'package.json'), '{ "private": true }\n');
    const r = await npm(['install', '--prefix', CLIENTS_DIR, `${p.pkg}@latest`, '--no-audit', '--no-fund', '--loglevel=error'], 15 * 60_000);
    const bin = managedBin(cmd);
    if (!r.ok || !bin) throw new HttpError(500, `Could not install ${p.name}: ${r.out.split('\n').slice(-3).join(' ').slice(0, 300)}`);
    return bin;
  })().finally(() => busy.delete(cmd));
  busy.set(cmd, job);
  return job;
}

/** Claude Code's command, installed now when there is none (the user's own copy comes first). */
export async function ensureClaude(): Promise<string> {
  const own = onPath(config.claudeBin) ?? onPath('claude');
  if (own) return (config.claudeBin = own);
  return (config.claudeBin = managedBin('claude') ?? (await install('claude')));
}

/** An ACP agent's command: there already, or installed when the app knows its package. */
export async function ensureCommand(cmd: string): Promise<string | null> {
  const found = onPath(cmd) ?? managedBin(cmd);
  if (found || !PACKAGES[cmd]) return found;
  return install(cmd);
}

const CODEX_NATIVE: Record<string, [string, string]> = {
  'linux-x64': ['codex-linux-x64', 'x86_64-unknown-linux-musl'],
  'linux-arm64': ['codex-linux-arm64', 'aarch64-unknown-linux-musl'],
  'darwin-x64': ['codex-darwin-x64', 'x86_64-apple-darwin'],
  'darwin-arm64': ['codex-darwin-arm64', 'aarch64-apple-darwin'],
};

const newer = (a: string, b: string) => {
  const x = a.split(/[.-]/).map((n) => parseInt(n) || 0);
  const y = b.split(/[.-]/).map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
};

/** Codex comes with the app; a newer copy the app installed takes over (its native program). */
export function useNewestCodex() {
  const t = CODEX_NATIVE[`${process.platform}-${process.arch}`];
  const mine = managedVersion('codex');
  const bundled = pkgJson(path.join(APP_ROOT, 'node_modules/@openai/codex'))?.version;
  if (!t || !mine || (bundled && !newer(mine, bundled)) || process.env.CODEX_BIN) return;
  const bin = path.join(CLIENTS_DIR, `node_modules/@openai/${t[0]}/vendor/${t[1]}/bin/codex`);
  if (fs.existsSync(bin)) config.codexBin = bin;
}

/** Brings the programs the app installed up to date (Codex too, once newer than the one it came with). */
export async function updateClients(): Promise<string[]> {
  const done: string[] = [];
  for (const cmd of Object.keys(PACKAGES)) {
    const have = managedVersion(cmd);
    if (!have && cmd !== 'codex') continue;
    const latest = (await npm(['view', PACKAGES[cmd].pkg, 'version'], 60_000)).out.trim().split('\n').pop() ?? '';
    const base = have ?? pkgJson(path.join(APP_ROOT, 'node_modules/@openai/codex'))?.version ?? '';
    if (/^\d+\.\d+/.test(latest) && newer(latest, base)) {
      await install(cmd).then(() => done.push(`${PACKAGES[cmd].name} ${latest}`), () => {});
    }
  }
  useNewestCodex();
  return done;
}

/** The programs, where they come from and their versions, for Settings. */
export function clients(): ClientInfo[] {
  return Object.entries(PACKAGES).map(([cmd, p]) => {
    const own = cmd === 'codex' ? null : onPath(cmd);
    const mine = managedVersion(cmd);
    const bundled = cmd === 'codex' ? pkgJson(path.join(APP_ROOT, 'node_modules/@openai/codex'))?.version : undefined;
    return {
      id: cmd,
      name: p.name,
      source: own ? 'yours' : mine && (cmd !== 'codex' || !bundled || newer(mine, bundled)) ? 'app' : bundled ? 'bundled' : 'missing',
      version: own ? undefined : (mine ?? bundled ?? undefined),
      path: own ?? managedBin(cmd) ?? undefined,
      installing: busy.has(cmd),
    };
  });
}

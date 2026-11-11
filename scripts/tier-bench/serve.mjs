// A scratch copy of the app for the benchmark: its own data folder and port, and one Claude Code account of its own
// that signs in with a copy of an account's access token (never its refresh token, so the copy cannot renew or replace
// the real sign-in; it works until the token runs out, a few hours at most). Nothing here touches the app you use: its
// data, its sessions and its accounts stay as they are, and it never hears of the benchmark's sessions.
//
//   node scripts/tier-bench/serve.mjs --from ~/.claude [--port 8814] [--data /tmp/hydor-bench/data] [--memory 24]
//
// --memory: the most memory, in GB, the server and everything it starts may use together (on Linux, a scope of their
// own: past it the kernel ends processes there, never elsewhere on the machine); 0 for no cap.
// The benchmark's agents work offline: the tasks hold all they need, and a task made from a published problem must
// not be answered by looking it up. --web lets them search and read the web.
//
// Build first (npm run build:server). Writes the server's address, an access token for it and the account's id to
// <data>/bench.json (run.mjs reads it), and keeps running until it is stopped (Ctrl+C, or kill): then it stops the
// server. Run again while it is up, it only renews the copied token (from the same account, or another one whose plan
// has usage left) and ends. Remove the data folder afterwards: it holds the copied token.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capped } from './capped.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const port = Number(arg('port', 8814));
const data = path.resolve(arg('data', '/tmp/hydor-bench/data'));
const memoryGb = Number(arg('memory', 24));
const web = process.argv.includes('--web');

/** What the benchmark's agents may not use while they work offline: web search and reading, the app's browser and HTTP tools, curl and wget. */
const OFFLINE = ['WebSearch', 'WebFetch', 'Bash(curl:*)', 'Bash(wget:*)', ...['web_search', 'read_page', 'http_request', 'find_media', 'find_photos', 'browser_open', 'browser_act', 'browser_read', 'browser_tabs', 'browser_upload', 'browser_ask_user'].map((t) => `mcp__hydor__${t}`)];

/** Claude Code's settings for the benchmark's account: the tools above denied (deny rules hold in every permission mode), or none with --web. */
function offline(dir) {
  const file = path.join(dir, 'settings.json');
  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  const deny = (settings.permissions?.deny ?? []).filter((r) => !OFFLINE.includes(r));
  settings.permissions = { ...settings.permissions, deny: web ? deny : [...deny, ...OFFLINE] };
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
}
const from = arg('from')?.replace(/^~(?=\/|$)/, os.homedir());
if (!from || !fs.existsSync(path.join(from, '.credentials.json'))) {
  console.error('Say which signed-in Claude Code folder to take the access token from: --from ~/.claude (it needs a .credentials.json)');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'dist/server/index.js'))) {
  console.error('Build the server first: npm run build:server');
  process.exit(2);
}

/** Gives the benchmark's account a copy of the access token in `from`; how many minutes it still works. */
function copyToken(dir) {
  const cred = JSON.parse(fs.readFileSync(path.join(from, '.credentials.json'), 'utf8'));
  const oauth = cred.claudeAiOauth ?? {};
  const left = Math.round(((oauth.expiresAt ?? 0) - Date.now()) / 60_000);
  if (!oauth.accessToken || left < 10) throw new Error(`The access token in ${from} ${oauth.accessToken ? `runs out in ${left} min` : 'is missing'}: use the account once (so it renews) and start again.`);
  fs.writeFileSync(path.join(dir, '.credentials.json'), JSON.stringify({ claudeAiOauth: { ...oauth, refreshToken: '', refreshTokenExpiresAt: 0 } }), { mode: 0o600 });
  return left;
}

// Up already (this data folder's server answers its own token): the account's token is renewed, nothing else.
try {
  const b = JSON.parse(fs.readFileSync(path.join(data, 'bench.json'), 'utf8'));
  const r = await fetch(`${b.server}/api/accounts`, { headers: { authorization: `Bearer ${b.token}` }, signal: AbortSignal.timeout(4000) });
  if (r.ok) {
    const left = copyToken(path.join(data, 'accounts', `claude-${b.account}`));
    offline(path.join(data, 'accounts', `claude-${b.account}`));
    console.log(`Already up at ${b.server}: account ${b.account} now signs in with the token from ${from}, which works for ${left} more minutes.`);
    process.exit(0);
  }
} catch (e) {
  if (String(e.message).startsWith('The access token')) {
    console.error(e.message);
    process.exit(1);
  }
  // Not up: started below.
}

fs.mkdirSync(data, { recursive: true, mode: 0o700 });
// The default accounts are empty folders here: the app's own sign-ins and history are not read. A copy in development
// sets nothing up on the computer: started by hand from a git checkout, the app would otherwise install a service
// that starts it with the computer (with this copy's port and data folder) and keep its agent programs updated.
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DATA_DIR: data,
  PORT: String(port),
  HOST: '127.0.0.1',
  CLAUDE_CONFIG_DIR: path.join(data, 'claude-default'),
  CODEX_HOME: path.join(data, 'codex-default'),
  HYDOR_APPS_DIR: path.join(data, 'apps'),
  CUDA_VISIBLE_DEVICES: '',
};
// The prices the app you use has, so costs read the same without asking the network again.
for (const f of ['model-prices.json', 'openrouter-prices.json']) {
  const live = [path.join(os.homedir(), '.hydor', f), path.join(os.homedir(), '.web-agent', f)].find((p) => fs.existsSync(p));
  if (live && !fs.existsSync(path.join(data, f))) fs.copyFileSync(live, path.join(data, f));
}
const token = execFileSync(process.execPath, [path.join(root, 'dist/server/cli.js'), 'access-token', 'Benchmark'], { env, encoding: 'utf8' }).trim().split('\n').pop();
const [command, argv] = capped(process.execPath, [path.join(root, 'dist/server/index.js')], memoryGb);
const server = spawn(command, argv, { env, stdio: ['ignore', fs.openSync(path.join(data, 'server.log'), 'a'), fs.openSync(path.join(data, 'server.log'), 'a')] });
const stop = () => (server.kill('SIGTERM'), process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => (console.error(`The server stopped (${code}); its log: ${path.join(data, 'server.log')}`), process.exit(1)));

const base = `http://127.0.0.1:${port}`;
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${p}: ${j.error ?? r.status}`);
  return j;
};
for (let i = 0; ; i++) {
  try {
    await api('GET', '/api/health');
    break;
  } catch (e) {
    if (i > 120) throw e;
    await new Promise((r) => setTimeout(r, 500));
  }
}
// The account the benchmark's sessions run as: a folder of its own, with the access token alone.
const accounts = (await api('GET', '/api/accounts')).extra ?? [];
const account = accounts.find((a) => a.name === 'Benchmark') ?? (await api('POST', '/api/agent-accounts', { agent: 'claude', name: 'Benchmark' }));
let left = 0;
try {
  left = copyToken(path.join(data, 'accounts', `claude-${account.id}`));
  offline(path.join(data, 'accounts', `claude-${account.id}`));
} catch (e) {
  console.error(e.message);
  stop();
}
// What run.mjs needs, kept beside the data (only you can read it).
fs.writeFileSync(path.join(data, 'bench.json'), JSON.stringify({ server: base, token, account: account.id }), { mode: 0o600 });
console.log(`Ready at ${base} (account ${account.id}; its token works for ${left} more minutes; agents ${web ? 'may use the web' : 'work offline'}). run.mjs reads ${path.join(data, 'bench.json')}.`);

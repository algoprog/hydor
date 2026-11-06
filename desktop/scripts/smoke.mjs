// Checks a packed desktop app: its Node.js runs its server, which answers, with its native modules and (on macOS and
// Linux) its tmux working. A Mac app's signature must check out too.
//   node desktop/scripts/smoke.mjs dist/mac-arm64/Hydor.app    (dist/mac/ on Intel)
//   node desktop/scripts/smoke.mjs dist/win-unpacked
//   node desktop/scripts/smoke.mjs dist/linux-unpacked          (dist/linux-arm64-unpacked on ARM)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const app = process.argv[2];
if (!app || !fs.existsSync(app)) {
  console.error('usage: node smoke.mjs <the packed app: Hydor.app, win-unpacked or linux-unpacked>');
  process.exit(2);
}
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
if (MAC) execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
const res = MAC ? path.join(app, 'Contents/Resources') : path.join(app, 'resources');

// A copy away from the repository, so the server can only use what is inside the app (Node.js looks for packages in
// every folder above it, and the repository's own node_modules would do).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-smoke-'));
for (const part of ['server', 'node', 'bin']) if (fs.existsSync(path.join(res, part))) fs.cpSync(path.join(res, part), path.join(tmp, part), { recursive: true, verbatimSymlinks: true });
const node = WIN ? path.join(tmp, 'node/node.exe') : path.join(tmp, 'node/bin/node');
const tmux = path.join(tmp, 'bin/tmux');
const data = path.join(tmp, 'data');
fs.mkdirSync(data);
let server = null;
const cleanup = () => {
  try {
    server?.kill();
  } catch {}
  if (!WIN) {
    try {
      execFileSync(tmux, ['-S', path.join(data, 'tmux.sock'), 'kill-server'], { stdio: 'ignore' });
    } catch {}
  }
  // Windows lets go of a stopped program's files a moment later.
  setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }), WIN ? 1000 : 0);
};
const fail = (why) => {
  console.error(why);
  cleanup();
  process.exitCode = 1;
};

try {
  if (!fs.existsSync(path.join(tmp, 'server/node_modules/fastify'))) throw new Error("The server's packages are not in the app.");
  console.log(execFileSync(node, ['-e', 'console.log("node", process.version, process.platform, process.arch)'], { encoding: 'utf8' }).trim());
  if (!WIN) {
    console.log(execFileSync(tmux, ['-V'], { encoding: 'utf8' }).trim());
    // A terminal: a session that prints, read back from its pane.
    const sock = path.join(data, 'tmux.sock');
    execFileSync(tmux, ['-S', sock, '-f', '/dev/null', 'new-session', '-d', '-x', '80', '-y', '24', 'echo tmux-works; sleep 5'], { env: { ...process.env, TERM: 'xterm-256color' } });
    await new Promise((r) => setTimeout(r, 700));
    const pane = execFileSync(tmux, ['-S', sock, 'capture-pane', '-p'], { encoding: 'utf8' });
    if (!pane.includes('tmux-works')) throw new Error(`tmux did not run its command:\n${pane}`);
    console.log('tmux runs a terminal');
  }
} catch (e) {
  fail(e.message);
  process.exit(1);
}

const port = 20000 + Math.floor(Math.random() * 20000);
const log = path.join(tmp, 'server.log');
const out = fs.openSync(log, 'a');
const PATH = [path.dirname(node), WIN ? null : path.join(tmp, 'bin'), process.env.PATH].filter(Boolean).join(path.delimiter);
server = spawn(node, [path.join(tmp, 'server/dist/server/index.js')], {
  cwd: tmp,
  env: { ...process.env, DATA_DIR: data, PORT: String(port), NODE_ENV: 'production', HYDOR_ROOT: path.join(tmp, 'server'), PATH, HYDOR_EMBED: 'off' },
  stdio: ['ignore', out, out],
  windowsHide: true,
});
let exited = null;
server.on('exit', (code, signal) => (exited = signal ?? code));
const base = `http://127.0.0.1:${port}`;
let health = null;
for (let i = 0; i < 90 && !health && exited === null; i++) {
  health = await fetch(`${base}/api/health`).then((r) => (r.ok ? r.json() : null), () => null);
  if (!health) await new Promise((r) => setTimeout(r, 1000));
}
const text = () => fs.readFileSync(log, 'utf8');
if (!health) {
  console.error(text());
  fail(exited === null ? 'The server did not answer.' : `The server stopped (${exited}).`);
} else {
  console.log(JSON.stringify(health));
  const page = await fetch(`${base}/`).then((r) => r.text());
  if (!page.includes('<div id="root"')) fail('The web app is not served.');
  else if (!/listening on/.test(text())) fail("The server's log does not say it listens.");
  else {
    console.log("The app's server starts.");
    cleanup();
  }
}

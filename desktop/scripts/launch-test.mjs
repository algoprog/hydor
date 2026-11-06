// Opens the packed app as you would at login (without its window), and checks that it starts its server: on Windows
// and from an AppImage, from the copy of this version it makes first. Then it quits the app (and on macOS and Linux
// checks that the server stopped with it).
//   node desktop/scripts/launch-test.mjs <the app's program>
//     dist/mac-arm64/Hydor.app/Contents/MacOS/Hydor, dist/win-unpacked/Hydor.exe, the installed Hydor.exe,
//     dist/linux-unpacked/hydor or dist/Hydor-<version>-x86_64.AppImage (Linux runs it with xvfb-run)
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const program = process.argv[2] && path.resolve(process.argv[2]);
if (!program || !fs.existsSync(program)) {
  console.error('usage: node launch-test.mjs <the app’s program>');
  process.exit(2);
}
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const APPIMAGE = program.endsWith('.AppImage');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-launch-'));
const port = 20000 + Math.floor(Math.random() * 20000);
// Its own home: settings, the server's data and the runtime copies all go there.
const home = path.join(tmp, 'home');
fs.mkdirSync(home);
const readyFile = path.join(tmp, 'ready.json');
const traceFile = path.join(tmp, 'trace.log');
const env = { ...process.env, PORT: String(port), DATA_DIR: path.join(tmp, 'data'), HYDOR_DESKTOP_READY_FILE: readyFile, HYDOR_DESKTOP_TRACE: traceFile, ELECTRON_ENABLE_LOGGING: '1', HYDOR_EMBED: 'off' };
// (Windows: the app's runtime copies go in its own LOCALAPPDATA; the profile stays the runner's, whose folders Windows
// works out from it, and a fresh runner is a first start all the same.)
if (WIN) Object.assign(env, { LOCALAPPDATA: path.join(home, 'Local') });
else if (!MAC) Object.assign(env, { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local/share'), XDG_CACHE_HOME: path.join(home, '.cache'), APPIMAGE_EXTRACT_AND_RUN: '1' });
for (const d of WIN ? [env.LOCALAPPDATA] : []) fs.mkdirSync(d, { recursive: true });

// Linux: on a screen of its own; without the kernel's sandbox where the runner has none to give (an AppImage
// decides that itself).
const args = ['--hidden', ...(!MAC && !WIN && !APPIMAGE ? ['--no-sandbox'] : [])];
const child = MAC || WIN ? spawn(program, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn('xvfb-run', ['-a', program, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));
let exited = null;
child.on('exit', (code, signal) => (exited = signal ?? code));

const base = `http://127.0.0.1:${port}`;
let health = null;
const started = Date.now();
// The first start on Windows copies the server out of the app, which takes a while.
while (!health && exited === null && Date.now() - started < 240_000) {
  health = await fetch(`${base}/api/health`).then((r) => (r.ok ? r.json() : null), () => null);
  if (!health) await new Promise((r) => setTimeout(r, 1000));
}
const logs = WIN ? path.join(process.env.APPDATA ?? '', 'Hydor/logs/server.log') : MAC ? path.join(os.homedir(), 'Library/Logs/Hydor/server.log') : path.join(home, '.config/Hydor/logs/server.log');
const serverLog = () => {
  try {
    return fs.readFileSync(logs, 'utf8').split('\n').slice(-40).join('\n');
  } catch {
    return '(no server log)';
  }
};
let ok = !!health;
// The app heard its server say it is ready (the server knows it runs in the app), as its window needs to show the app.
let ready = null;
for (let i = 0; health && !ready && i < 60; i++) {
  try {
    ready = JSON.parse(fs.readFileSync(readyFile, 'utf8'));
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (health && !ready) {
  ok = false;
  console.error(`The server answers, but the app did not hear it say it is ready.\n${output.slice(-2000)}`);
} else if (ready) console.log(`The app heard its server: ${JSON.stringify(ready)}`);
const traced = () => {
  try {
    return fs.readFileSync(traceFile, 'utf8');
  } catch {
    return '(nothing traced)';
  }
};
if (!health) console.error(`The app's server did not answer (${exited === null ? 'still running' : `the app stopped: ${exited}`}).\n${output.slice(-4000)}\n---- what the app did\n${traced()}\n---- server log\n${serverLog()}`);
else {
  console.log(`The app started its server in ${Math.round((Date.now() - started) / 1000)} s: ${JSON.stringify(health)}`);
  if (WIN || APPIMAGE) {
    const runtimes = path.join(WIN ? path.join(env.LOCALAPPDATA, 'Hydor') : path.join(home, '.local/share/Hydor'), 'runtime');
    const copies = fs.existsSync(runtimes) ? fs.readdirSync(runtimes) : [];
    const copy = copies.find((n) => fs.existsSync(path.join(runtimes, n, '.copied')));
    if (!copy) {
      ok = false;
      console.error(`No copy of this version in ${runtimes} (${copies.join(', ') || 'empty'})`);
    } else console.log(`It runs its server from ${path.join(runtimes, copy)}`);
  }
}

// Quit: a Mac app and a Linux one on SIGTERM, as at logout; Windows' with its whole tree.
if (WIN) {
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {}
} else {
  try {
    if (MAC) child.kill('SIGTERM');
    else process.kill(-child.pid, 'SIGTERM');
  } catch {}
}
for (let i = 0; i < 30 && exited === null; i++) await new Promise((r) => setTimeout(r, 500));
if (health && !WIN) {
  const still = await fetch(`${base}/api/health`).then(() => true, () => false);
  if (still) {
    ok = false;
    console.error('The server kept running after the app quit.');
  } else console.log('Quitting the app stopped its server.');
}
if (!ok) process.exitCode = 1;
setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }), WIN ? 2000 : 0);

// The browser's own check (server/browser/selftest.ts) run on the desktop app's own browser (desktop/browser.cjs): the dev
// app starts, runs that check instead of the server (HYDOR_DESKTOP_SERVER_ENTRY) with HYDOR_BROWSER_ENGINE=desktop, and
// quits with its exit code. Then a second run (desktop/scripts/browser-ipc-check.cjs) checks what the check cannot, the
// app's window: an agent's tab watched and used through the messages the window's page sends, and your own tab shown.
//   node desktop/scripts/browser-selftest.mjs [--no-ipc] [--only-ipc]
// Needs `electron` in desktop/node_modules (npm ci there) and, without a display, xvfb-run (Linux). It builds the
// check into dist/dev, so run it in a checkout.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(root, 'desktop');
const args = process.argv.slice(2);
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const electron = path.join(desktop, 'node_modules/.bin', WIN ? 'electron.cmd' : 'electron');
if (!fs.existsSync(electron)) {
  console.error(`No Electron in desktop/node_modules (run npm ci in desktop/): ${electron}`);
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-browser-selftest-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(home);
const noDisplay = !MAC && !WIN && !process.env.DISPLAY;
// Nothing here may use a GPU; the kernel's sandbox may be missing where this runs.
const flags = ['--disable-gpu', ...(!MAC && !WIN ? ['--no-sandbox'] : [])];
const envFor = (name) => ({
  ...process.env,
  CUDA_VISIBLE_DEVICES: '',
  HOME: home,
  XDG_CONFIG_HOME: path.join(home, '.config'),
  XDG_DATA_HOME: path.join(home, '.local/share'),
  XDG_CACHE_HOME: path.join(home, '.cache'),
  DATA_DIR: path.join(tmp, `data-${name}`),
  HYDOR_DESKTOP_NO_COMMAND: '1',
  HYDOR_EMBED: 'off',
});

/** Runs the dev app with these arguments (on a screen of its own without a display); resolves with its exit code and what it printed. */
function run(argv, env, ms) {
  return new Promise((resolve) => {
    const child = noDisplay ? spawn('xvfb-run', ['-a', electron, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true }) : spawn(electron, argv, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const kill = () => {
      try {
        if (!WIN) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {}
    };
    const timer = setTimeout(() => {
      out += `\n(timed out after ${ms / 1000} s)\n`;
      kill();
    }, ms);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      // xvfb-run's X server and the app's helpers must not outlive it.
      kill();
      resolve({ code: signal ? 1 : code, out });
    });
  });
}

let failed = false;

if (!args.includes('--only-ipc')) {
  console.log('Building the browser check...');
  const built = spawnSync(process.execPath, ['scripts/build-server.mjs', 'server/browser/selftest.ts'], { cwd: root, env: { ...process.env, OUTDIR: 'dist/dev' }, stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status ?? 1);
  console.log('Running it in the desktop app...');
  const env = { ...envFor('selftest'), HYDOR_DESKTOP_SERVER_ENTRY: path.join(root, 'dist/dev/selftest.js'), HYDOR_BROWSER_ENGINE: 'desktop' };
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
  const r = await run([desktop, '--hidden', `--user-data-dir=${path.join(tmp, 'user-selftest')}`, ...flags], env, 8 * 60_000);
  // The check's own output is the app's server log.
  let log = '';
  try {
    log = fs.readFileSync(path.join(tmp, 'user-selftest/logs/server.log'), 'utf8');
  } catch {}
  process.stdout.write(log || r.out);
  if (r.code !== 0) {
    failed = true;
    console.log(`\nThe browser check failed (exit ${r.code}). The app said:\n${r.out.split('\n').slice(-30).join('\n')}`);
  }
}

if (!args.includes('--no-ipc')) {
  console.log('\nRunning the window check in the desktop app...');
  const env = { ...envFor('ipc'), HYDOR_PRELOAD: path.join(desktop, 'preload.cjs') };
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
  const r = await run([path.join(desktop, 'scripts/browser-ipc-check.cjs'), `--user-data-dir=${path.join(tmp, 'user-ipc')}`, ...flags], env, 4 * 60_000);
  process.stdout.write(r.out);
  if (r.code !== 0) {
    failed = true;
    console.log(`\nThe window check failed (exit ${r.code}).`);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);

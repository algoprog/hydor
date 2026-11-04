// Hydor for macOS: the app around the server. It runs the server that comes inside it (with the Node.js
// that comes inside it too), shows the app in a window of its own, stays in the menu bar when the window is
// closed, and starts the server again whenever it exits: agents carry on meanwhile, as with the Linux service.
//
// Updates: the server finds, downloads and checks a new version (server/updates.ts). Downloaded by itself, it waits:
// { type: 'update' } puts Restart to Update in the menus and, when its minute starts, shows a notification from the
// Mac (clicking it opens the app, where a note counts down with Restart now and Later; its button installs at once).
// Then the server sends { type: 'install' }: the app stops the server, moves itself aside (to previous.app in its
// Application Support folder), puts the new version where it was, and opens it. If the new version's server does
// not start (it stops three times before it is up, or is not up in three minutes), the version before comes back and
// the server is told why, so Settings says it, and that version is not installed by itself again.
//
// Computer use (server/computer/): agents see the screen and use the mouse and keyboard through programs the server
// starts, which macOS counts as this app's doing, so the permissions (Accessibility, Screen Recording) are this
// app's: the server asks here what macOS allows and to ask you for the rest ({ type: 'ask' }, answered with
// { type: 'reply' }). While an agent acts ({ type: 'computer' }), the menu bar says so, with Stop, and ⌘⇧Esc stops it
// too ({ type: 'computer-stop' } to the server).
'use strict';
const { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, dialog, globalShortcut, nativeImage, nativeTheme, session, shell, systemPreferences } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HIDDEN = process.argv.includes('--hidden');
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
  return;
}

// ---- where things are -----------------------------------------------------------------------------------------

const PACKAGED = app.isPackaged;
const RES = PACKAGED ? process.resourcesPath : __dirname;
/** The server: inside the app, or (developing, `npm start` in mac/) the repository it sits in, built. */
const SERVER = PACKAGED ? path.join(RES, 'server') : path.resolve(__dirname, '..');
const NODE_BIN = PACKAGED ? path.join(RES, 'node/bin') : null;
/** The .app this runs from (…/Hydor.app/Contents/MacOS/Hydor); developing, a stand-in to try updates on. */
const BUNDLE = (!PACKAGED && process.env.HYDOR_DESKTOP_BUNDLE) || path.resolve(process.execPath, '../../..');
const REPLACEABLE = PACKAGED || !!process.env.HYDOR_DESKTOP_BUNDLE;
// The app was called Naget Agent: its folders move over once, before anything uses them.
for (const [base, older] of [[app.getPath('appData'), 'Naget Agent'], [path.join(os.homedir(), 'Library/Logs'), 'Naget Agent'], [path.join(os.homedir(), 'Library/Caches'), 'Naget Agent']]) {
  try {
    if (fs.existsSync(path.join(base, older)) && !fs.existsSync(path.join(base, 'Hydor'))) fs.renameSync(path.join(base, older), path.join(base, 'Hydor'));
  } catch (e) {
    console.error('[hydor] could not move', older, e);
  }
}
const DATA = app.getPath('userData'); // ~/Library/Application Support/Hydor
const LOGS = app.getPath('logs'); // ~/Library/Logs/Hydor
const CACHE = path.join(os.homedir(), 'Library/Caches/Hydor');
const PENDING = path.join(DATA, 'update.json');
const PREVIOUS = path.join(DATA, 'previous.app');
const PIDFILE = path.join(DATA, 'server.pid');
const LOG = path.join(LOGS, 'server.log');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(LOGS, { recursive: true });

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const writable = (p) => {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
};
/** Whether this copy may replace itself: not on the disk image, not a translocated copy, in a folder you can write to. */
const updatable = () => REPLACEABLE && !BUNDLE.includes('/AppTranslocation/') && !BUNDLE.startsWith('/Volumes/') && writable(path.dirname(BUNDLE)) && writable(BUNDLE);

/** Moves a folder, across disks too. */
function move(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    execFileSync('ditto', [from, to]);
    fs.rmSync(from, { recursive: true, force: true });
  }
}

// ---- the environment the server and its agents get ---------------------------------------------------------------

/**
 * Apps opened from the Finder get a bare PATH (/usr/bin:/bin:…), without Homebrew or the folders your shell
 * adds (where `claude`, `git` and the rest are). The server gets your login shell's environment instead, as a
 * terminal would.
 */
function loginEnv() {
  const shellPath = process.env.SHELL || '/bin/zsh';
  const mark = '__HYDOR_ENV__';
  try {
    const out = execFileSync(shellPath, ['-ilc', `printf '%s' '${mark}'; command env -0`], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, HYDOR_READING_ENV: '1' },
    });
    const env = {};
    for (const kv of out.slice(out.lastIndexOf(mark) + mark.length).split('\0')) {
      const i = kv.indexOf('=');
      if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
    }
    for (const k of ['SHLVL', 'PWD', 'OLDPWD', '_', 'HYDOR_READING_ENV']) delete env[k];
    if (env.PATH) return env;
  } catch {}
  return { ...process.env, PATH: ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':') };
}

/** Your own settings for the server (PORT, DATA_DIR…), one NAME=value a line, as on Linux. */
function envFile() {
  const env = {};
  // Naget Agent's file first, so a setting in hydor.env wins.
  for (const f of [path.join(os.homedir(), '.config/naget-agent.env'), path.join(os.homedir(), '.config/hydor.env')]) {
    let text = '';
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return env;
}

let baseEnv = null;
function serverEnv(extra) {
  baseEnv ??= loginEnv();
  const env = { ...baseEnv, ...envFile() };
  for (const k of Object.keys(env)) if (k.startsWith('ELECTRON_') || k === 'NODE_OPTIONS') delete env[k];
  const bins = PACKAGED ? [NODE_BIN, path.join(RES, 'bin')] : [];
  return {
    ...env,
    ...extra,
    PATH: [...bins, env.PATH].join(':'),
    NODE_ENV: 'production',
    HYDOR_ROOT: SERVER,
    HYDOR_DESKTOP: 'mac',
    HYDOR_DESKTOP_APP: BUNDLE,
    HYDOR_DESKTOP_UPDATABLE: updatable() ? '1' : '0',
    HYDOR_DESKTOP_CACHE: CACHE,
  };
}

// ---- the server -------------------------------------------------------------------------------------------------

let server = null;
let serverUrl = null;
let setupToken = null;
let quitting = false;
let installing = false;
/** Recent quick exits, for backing off and for giving up on a new version. */
let failures = 0;
let startedAt = 0;
/** A new version waiting to prove it starts: { from, to, at }. */
let verifying = null;
let verifyTimer = null;
/** Told to the server once: why the last update did not stay. */
let updateError = null;

/** A server left by an app that ended without stopping it would hold the port: stop it first. */
function stopStale() {
  const pid = Number(readJson(PIDFILE));
  if (!pid) return;
  try {
    const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
    if (cmd.includes('dist/server/index.js')) process.kill(pid, 'SIGTERM');
  } catch {}
}

function logFd() {
  try {
    if (fs.statSync(LOG).size > 20 << 20) fs.renameSync(LOG, LOG.replace(/\.log$/, '.old.log'));
  } catch {}
  return fs.openSync(LOG, 'a');
}

function startServer() {
  if (server || quitting) return;
  const extra = {};
  if (updateError) extra.HYDOR_UPDATE_ERROR = JSON.stringify(updateError);
  updateError = null;
  const fd = logFd();
  fs.writeSync(fd, `\n---- ${new Date().toISOString()} Hydor ${app.getVersion()} starts the server\n`);
  const node = NODE_BIN ? path.join(NODE_BIN, 'node') : 'node';
  const child = spawn(node, [path.join(SERVER, 'dist/server/index.js')], { cwd: SERVER, env: serverEnv(extra), stdio: ['ignore', fd, fd, 'ipc'] });
  fs.closeSync(fd);
  server = child;
  startedAt = Date.now();
  if (child.pid) fs.writeFileSync(PIDFILE, String(child.pid));
  child.on('message', onMessage);
  child.on('error', (e) => console.error('[hydor] the server did not start:', e));
  child.on('exit', (code, signal) => {
    if (server === child) server = null;
    fs.rmSync(PIDFILE, { force: true });
    if (quitting || installing) return;
    // What it showed here goes with it: the next one says again what waits.
    forgetShown();
    const quick = Date.now() - startedAt < 60_000;
    failures = quick ? failures + 1 : 0;
    if (verifying && failures >= 3) return rollBack(`it stopped as it started (${signal ?? `exit ${code}`})`);
    if (failures >= 5) {
      showProblem();
      return;
    }
    // Exits by itself to restart (exit 0 after an update or a restart); quick crashes wait longer each time.
    setTimeout(startServer, quick ? Math.min(30_000, 1000 * 2 ** failures) : 500);
  });
}

function stopServer(timeout = 15_000) {
  const child = server;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'ready') {
    const first = !serverUrl;
    serverUrl = m.url;
    setupToken = m.setupToken || null;
    failures = 0;
    if (verifying) confirmUpdate();
    const at = setupToken ? `/setup?token=${encodeURIComponent(setupToken)}` : '/';
    // The window shows the app now (it may be hidden: it loads all the same). The page reconnects by itself
    // after later restarts. Opened at login, the window stays closed, unless the password is still to choose.
    if (win && (first || win.webContents.getURL().startsWith('data:'))) void win.loadURL(serverUrl + at);
    else if (!win && first && setupToken) openWindow(at);
    rebuildTray();
  } else if (m.type === 'install' && typeof m.app === 'string') {
    void install(m);
  } else if (m.type === 'update') {
    onUpdate(m);
  } else if (m.type === 'computer') {
    onComputer(m);
  } else if (m.type === 'ask' && typeof m.id === 'string') {
    void answer(m);
  }
}

/** To the server, while it runs. */
function toServer(m) {
  try {
    if (server && server.connected) server.send(m);
  } catch {}
}

// ---- what the server shows here: a new version waiting, an agent using the Mac ------------------------------------

/** A new version downloaded and waiting (its version), for Restart to Update in the menus. */
let updateReady = null;
/** An agent using the Mac (computer use) while it acts: { title } of its session. */
let computerActive = null;
/** Notifications on screen, kept so they are still there to click. */
const notices = new Set();
const STOP_KEYS = 'Command+Shift+Escape';

function onUpdate(m) {
  updateReady = typeof m.version === 'string' && m.version ? m.version : null;
  rebuildTray();
  appMenu();
  if (updateReady && m.notice) notify(m.notice);
}

const updateNow = () => toServer({ type: 'update-now' });

/** A notification from the Mac: clicking it opens the app (its note counts down, with Later); its button installs now. */
function notify(n) {
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: String(n.title || 'Hydor'), body: String(n.body || ''), actions: n.action ? [{ type: 'button', text: String(n.action) }] : [] });
  notices.add(note);
  const done = () => notices.delete(note);
  note.on('click', () => {
    done();
    go();
  });
  note.on('action', () => {
    done();
    updateNow();
  });
  note.on('close', done);
  note.show();
}

function onComputer(m) {
  const was = !!computerActive;
  computerActive = m.active ? { title: typeof m.title === 'string' ? m.title : '' } : null;
  // ⌘⇧Esc stops it, only while an agent acts (the keys stay the other apps' otherwise).
  if (computerActive && !was) {
    try {
      if (!globalShortcut.register(STOP_KEYS, stopComputer)) console.error('[hydor] ⌘⇧Esc is taken by another app');
    } catch {}
  } else if (!computerActive && was) {
    try {
      globalShortcut.unregister(STOP_KEYS);
    } catch {}
  }
  rebuildTray();
}

/** Stop (the menu bar, ⌘⇧Esc): the agent's actions end, and no agent uses the Mac until you allow it again. */
function stopComputer() {
  toServer({ type: 'computer-stop' });
  onComputer({ active: false });
}

/** The server stopped: what it showed here goes until the next one says it again. */
function forgetShown() {
  if (computerActive) onComputer({ active: false });
  if (updateReady) {
    updateReady = null;
    rebuildTray();
    appMenu();
  }
}

// ---- computer use: macOS's permissions, which are this app's ---------------------------------------------------

const PANES = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
};

/** What macOS lets this app (and the programs its server starts) do: use the mouse and keyboard, see the screen. */
function permissions() {
  let screen = 'unknown';
  try {
    screen = systemPreferences.getMediaAccessStatus('screen');
  } catch {}
  return { accessibility: systemPreferences.isTrustedAccessibilityClient(false), screen };
}

/** The server asks: what macOS allows, or to ask you for a permission (macOS's own prompt, then its settings). */
async function answer(m) {
  const reply = (r) => toServer({ type: 'reply', id: m.id, ok: true, ...r });
  try {
    if (m.what === 'permissions') return reply(permissions());
    if (m.what === 'request' && m.which === 'accessibility') {
      // macOS asks once ("Hydor would like to control this computer"); its settings list the app from then on.
      if (!systemPreferences.isTrustedAccessibilityClient(true)) await shell.openExternal(PANES.accessibility);
      return reply(permissions());
    }
    if (m.what === 'request' && m.which === 'screen') {
      if (permissions().screen !== 'granted') {
        // Looking at the screen once makes macOS ask, and list the app under Screen Recording.
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
        await shell.openExternal(PANES.screen);
      }
      return reply(permissions());
    }
    toServer({ type: 'reply', id: m.id, ok: false, error: `the app does not know "${m.what}"` });
  } catch (e) {
    toServer({ type: 'reply', id: m.id, ok: false, error: String((e && e.message) || e) });
  }
}

// ---- updates ----------------------------------------------------------------------------------------------------

async function install(m) {
  if (installing || !updatable()) return;
  installing = true;
  const fail = (error) => {
    console.error('[hydor] the update did not install:', error);
    installing = false;
    updateError = { from: m.from, to: m.to, error };
    startServer();
  };
  await stopServer();
  try {
    move(BUNDLE, PREVIOUS);
  } catch (e) {
    return fail(`could not move the app aside: ${e.message}`);
  }
  try {
    execFileSync('ditto', [m.app, BUNDLE]);
  } catch (e) {
    try {
      fs.rmSync(BUNDLE, { recursive: true, force: true });
      move(PREVIOUS, BUNDLE);
    } catch {}
    return fail(`could not put the new version in place: ${String(e.message).split('\n')[0]}`);
  }
  try {
    execFileSync('xattr', ['-dr', 'com.apple.quarantine', BUNDLE], { stdio: 'ignore' });
  } catch {}
  fs.rmSync(path.join(CACHE, 'updates'), { recursive: true, force: true });
  fs.writeFileSync(PENDING, JSON.stringify({ from: m.from, to: m.to, at: Date.now() }));
  relaunch();
}

/** Opens this app again (the new version, after an update), with its window as it is now. */
function relaunch() {
  quitting = true;
  const args = process.argv.slice(1).filter((a) => a !== '--hidden');
  if (!win || !win.isVisible()) args.push('--hidden');
  app.relaunch({ args });
  app.exit(0);
}

function confirmUpdate() {
  clearTimeout(verifyTimer);
  verifying = null;
  fs.rmSync(PENDING, { force: true });
  fs.rmSync(PREVIOUS, { recursive: true, force: true });
}

/** The new version does not start: the version before comes back, and says why. */
function rollBack(why) {
  clearTimeout(verifyTimer);
  const p = verifying;
  verifying = null;
  if (!p || !fs.existsSync(PREVIOUS)) {
    fs.rmSync(PENDING, { force: true });
    return showProblem();
  }
  quitting = true;
  void stopServer(5000).then(() => {
    try {
      move(BUNDLE, path.join(DATA, 'failed.app'));
      move(PREVIOUS, BUNDLE);
      fs.rmSync(path.join(DATA, 'failed.app'), { recursive: true, force: true });
      fs.writeFileSync(PENDING, JSON.stringify({ ...p, failed: `Version ${p.to} did not start: ${why}. The version before is back.` }));
    } catch (e) {
      console.error('[hydor] could not go back to the version before:', e);
    }
    app.relaunch({ args: process.argv.slice(1) });
    app.exit(0);
  });
}

/** After an update: the new version on trial, or the word that it was rolled back. */
function readPending() {
  const p = readJson(PENDING);
  if (!p) return;
  if (p.failed) {
    updateError = { from: p.from, to: p.to, error: p.failed };
    fs.rmSync(PENDING, { force: true });
  } else if (p.to === app.getVersion() && fs.existsSync(PREVIOUS)) {
    verifying = p;
    verifyTimer = setTimeout(() => rollBack('it was not up within three minutes'), 3 * 60_000);
  } else {
    // Not the version it installed (put back by hand, say): the copy kept for going back is no longer needed.
    fs.rmSync(PENDING, { force: true });
    fs.rmSync(PREVIOUS, { recursive: true, force: true });
  }
}

// ---- the window ---------------------------------------------------------------------------------------------

let win = null;
const sameOrigin = (url) => {
  try {
    return !!serverUrl && new URL(url).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
};

const page = (body) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Hydor</title><style>
  :root{color-scheme:light dark;font:14px -apple-system,system-ui,sans-serif}
  body{margin:0;height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
  main{max-width:560px;padding:24px;text-align:center} p{opacity:.7;line-height:1.5}
  pre{text-align:left;font:11px ui-monospace,monospace;opacity:.8;white-space:pre-wrap;max-height:40vh;overflow:auto;border:1px solid #8884;border-radius:8px;padding:10px}
  a{color:AccentColor;margin:0 8px}</style><main>${body}</main>`);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// While the server starts: the logo, HYDΩR, water rising in its Ω and moving gently until the app is there, in the
// app's colours, dark or light as the Mac is. The page the server sends opens on the same logo (web/index.html #boot),
// its Ω already full, so the one follows the other without a jump.
const OMEGA_D = 'M4 95H24C24 80.6 3 65.3 3 47.3C3 23 23.2 5 48 5C72.8 5 93 23 93 47.3C93 65.3 72 80.6 72 95H92';
const SEA_D = 'M-72 0 q9 -5.5 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0';
const bootPage = () =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Hydor</title><style>
  :root{color-scheme:light dark;--bg:#f6f5f1;--fg:#1b1915;--w1:#14b8a6;--w2:#0ea5e9;--w3:#2563eb;--ink:#0284c7}
  @media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#e9edf5;--w1:#5eead4;--w2:#38bdf8;--w3:#60a5fa;--ink:#38bdf8}}
  html,body{height:100%;margin:0}body{display:grid;place-items:center;background:var(--bg);color:var(--fg)}
  svg{display:block;width:min(232px,56vw);height:auto;overflow:visible}
  .fill{transform:translateY(112px);animation:fill 1.6s cubic-bezier(.22,1,.36,1) .1s forwards}
  .ebb{animation:ebb 3.2s ease-in-out 1.7s infinite}.bob{animation:bob 2.6s ease-in-out infinite}.swell{animation:swell 1.5s linear infinite}
  @keyframes fill{to{transform:translateY(8px)}}@keyframes ebb{50%{transform:translateY(12px)}}
  @keyframes bob{50%{transform:translateY(4px)}}@keyframes swell{to{transform:translateX(-36px)}}
  @media (prefers-reduced-motion:reduce){.fill{transform:translateY(8px);animation:none}.ebb,.bob,.swell{animation:none}}
  </style><svg viewBox="-4 -1 530 102" width="232" height="45" fill="none" stroke-width="10" role="img" aria-label="Hydor is starting"><defs>
  <clipPath id="c"><rect x="-10" y="0" width="542" height="100"/></clipPath>
  <mask id="m" maskUnits="userSpaceOnUse" x="-10" y="-10" width="116" height="120"><path d="${OMEGA_D}" stroke="#fff" stroke-width="10"/></mask>
  <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="96"><stop offset="0" style="stop-color:var(--w1)"/><stop offset=".55" style="stop-color:var(--w2)"/><stop offset="1" style="stop-color:var(--w3)"/></linearGradient>
  </defs><g clip-path="url(#c)"><path d="M5 0V100M61 0V100M5 50H61" stroke="currentColor"/><path transform="translate(104 0)" d="M-1 -6L35 52L71 -6M35 52V100" stroke="currentColor"/>
  <path transform="translate(212 0)" d="M5 0V100M5 5H30A39 45 0 0 1 30 95H5" stroke="currentColor"/><g transform="translate(324 0)"><path d="${OMEGA_D}" style="stroke:var(--ink)" opacity=".3"/>
  <g mask="url(#m)"><g class="fill"><g class="ebb"><g class="bob"><g class="swell"><path d="${SEA_D} V130 H-72 Z" fill="url(#g)" stroke="none"/><path d="${SEA_D}" stroke="#fff" stroke-width="5" opacity=".85"/></g></g></g></g></g></g>
  <path transform="translate(458 0)" d="M5 100V5H34A25 20 0 0 1 34 50H5M30 50L66 106" stroke="currentColor"/></g></svg>`);

function openWindow(at) {
  if (!win) {
    const bounds = readJson(path.join(DATA, 'window.json')) || {};
    win = new BrowserWindow({
      width: 1280,
      height: 860,
      ...bounds,
      minWidth: 640,
      minHeight: 480,
      show: false,
      title: 'Hydor',
      // The app's page colour (Hydor Dark, Hydor Light), so nothing flashes before the starting page paints.
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#f6f5f1',
      webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, backgroundThrottling: false },
    });
    win.webContents.setUserAgent(`${win.webContents.getUserAgent()} HydorMac/${app.getVersion()}`);
    win.once('ready-to-show', () => win && win.show());
    win.on('close', (e) => {
      if (quitting) return;
      // Closing the window keeps the app (and its agents) going, in the menu bar.
      e.preventDefault();
      try {
        fs.writeFileSync(path.join(DATA, 'window.json'), JSON.stringify(win.getBounds()));
      } catch {}
      win.hide();
      app.dock?.hide();
    });
    win.on('closed', () => (win = null));
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (sameOrigin(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 800, webPreferences: { contextIsolation: true, sandbox: true } } };
      if (/^(https?|mailto):/.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (url.startsWith('naget-action:')) {
        e.preventDefault();
        return action(url.slice('naget-action:'.length));
      }
      if (url.startsWith('data:') || sameOrigin(url)) return;
      e.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    });
  }
  if (at !== undefined && serverUrl) void win.loadURL(serverUrl + at);
  else if (!serverUrl && !win.webContents.getURL()) void win.loadURL(bootPage());
  app.dock?.show();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** The server would not start: say so, with the end of its log. */
function showProblem() {
  let tail = '';
  try {
    tail = fs.readFileSync(LOG, 'utf8').split('\n').slice(-25).join('\n');
  } catch {}
  openWindow();
  void win.loadURL(
    page(
      `<h2>Hydor could not start</h2><p>Its server stopped each time it started. The end of its log:</p><pre>${esc(tail)}</pre>` +
        `<p><a href="naget-action:retry">Try again</a><a href="naget-action:log">Show the log</a></p>`,
    ),
  );
}

function action(what) {
  if (what === 'retry') {
    failures = 0;
    void win?.loadURL(bootPage());
    startServer();
  } else if (what === 'log') shell.showItemInFolder(LOG);
}

const go = (at) => (serverUrl ? openWindow(at) : openWindow());

// ---- menus ------------------------------------------------------------------------------------------------------

let tray = null;
function rebuildTray() {
  if (!tray) {
    const icon = nativeImage.createFromPath(path.join(PACKAGED ? RES : path.join(__dirname, 'resources'), 'trayTemplate.png'));
    icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('Hydor');
  }
  // While an agent uses the Mac, the menu bar says so beside the icon, and its menu starts with Stop.
  const agent = computerActive
    ? [
        { label: 'An agent is using your Mac', enabled: false },
        ...(computerActive.title ? [{ label: `In “${computerActive.title.slice(0, 60)}”`, enabled: false }] : []),
        { label: 'Stop', accelerator: STOP_KEYS, click: stopComputer },
        { type: 'separator' },
      ]
    : [];
  tray.setTitle(computerActive ? 'Agent using your Mac' : '');
  tray.setToolTip(computerActive ? 'Hydor: an agent is using your Mac' : 'Hydor');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      ...agent,
      { label: 'Open Hydor', click: () => go() },
      { label: 'Open in Browser', enabled: !!serverUrl, click: () => serverUrl && shell.openExternal(serverUrl) },
      { type: 'separator' },
      { label: 'Settings…', enabled: !!serverUrl, click: () => go('/settings') },
      updateReady
        ? { label: `Restart to Update to ${updateReady}`, click: updateNow }
        : { label: 'Check for Updates…', enabled: !!serverUrl, click: () => go('/settings?s=general&find=Check%20now') },
      { type: 'separator' },
      { label: 'Quit Hydor', click: () => app.quit() },
    ]),
  );
}

function appMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          updateReady ? { label: `Restart to Update to ${updateReady}`, click: updateNow } : { label: 'Check for Updates…', click: () => go('/settings?s=general&find=Check%20now') },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'Cmd+,', click: () => go('/settings') },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          { label: 'Hydor Guide', click: () => go('/guide') },
          { label: 'Open in Browser', click: () => serverUrl && shell.openExternal(serverUrl) },
          { label: 'Show the Server Log', click: () => shell.showItemInFolder(LOG) },
        ],
      },
    ]),
  );
}

// ---- start and quit ---------------------------------------------------------------------------------------------

app.on('second-instance', () => go());
app.on('activate', () => go());

app.on('before-quit', (e) => {
  if (quitting && !server) return;
  quitting = true;
  if (!server) return;
  // The server stops first (agents carry on, and are picked up again next time).
  e.preventDefault();
  void stopServer().then(() => app.quit());
});

app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: 'Hydor', applicationVersion: app.getVersion(), copyright: 'Naget, Inc.' });
  // Opened from the disk image or Downloads, it offers to move to Applications, where it can update itself.
  if (PACKAGED && !HIDDEN && !app.isInApplicationsFolder()) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message: 'Move Hydor to your Applications folder?',
      detail: 'From there it starts with your Mac and keeps itself up to date.',
      buttons: ['Move to Applications', 'Not Now'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      try {
        if (app.moveToApplicationsFolder()) return;
      } catch (err) {
        dialog.showErrorBox('Hydor could not move itself', String(err.message || err));
      }
    }
  }
  appMenu();
  rebuildTray();
  // The window may use the microphone (voice) and show notifications; only for the app's own pages.
  session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
    const ok = sameOrigin(details.requestingUrl || wc.getURL());
    if (ok && permission === 'media') {
      if ((details.mediaTypes || []).includes('audio')) return void systemPreferences.askForMediaAccess('microphone').then(done, () => done(false));
      return done(false);
    }
    done(ok && ['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock'].includes(permission));
  });
  readPending();
  stopStale();
  if (!HIDDEN) openWindow();
  else app.dock?.hide();
  startServer();
});

app.on('window-all-closed', () => {
  // Stays in the menu bar.
});

app.on('will-quit', () => globalShortcut.unregisterAll());

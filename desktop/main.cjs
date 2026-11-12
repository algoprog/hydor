// Hydor's desktop app, for macOS, Windows and Linux: the app around the server. It runs the server that comes inside
// it (with the Node.js that comes inside it too), shows the app in a window of its own, stays in the menu bar (on
// Windows the notification area, on Linux the system tray) when the window is closed, and starts the server again
// whenever it exits: agents carry on meanwhile, as with the Linux service.
//
// Where the server runs from: inside the app on a Mac and from the Linux .deb. On Windows and from an AppImage, from a
// copy the app makes once for each version (runtime/<version> in its local data folder). Agents outlive the app and its
// updates, and they must not hold the app's own files: Windows cannot replace a file a program has open (its installer
// even stops every program that runs from the app's folder), and an AppImage's files go away when it closes.
//
// Updates: the server finds, downloads and checks a new version (server/updates.ts). Downloaded by itself, it waits:
// { type: 'update' } puts Restart to Update in the menus and, when its minute starts, shows a notification (clicking it
// opens the app, where a note counts down with Restart now and Later; its button installs at once). Then the server
// sends { type: 'install' } with the download, and the app installs it the way its kind of copy is installed:
//   - a Mac app stops the server, moves itself aside (to previous.app in its Application Support folder), puts the new
//     version where it was, and opens it; an AppImage does the same with its one file (previous.AppImage);
//   - on Windows it runs the new version's installer without its window, which installs over this one and opens it;
//   - from the .deb, the system installs the new package once you give your password (pkexec), and the app opens again.
// If the new version's server does not start (it stops three times before it is up, or is not up in three minutes), a
// Mac app or an AppImage puts the version before back, and the server is told why, so Settings says it, and that
// version is not installed by itself again.
//
// Computer use (server/computer/, on a Mac, Windows, and Linux with X11): agents see the screen and use the mouse and
// keyboard through programs the server starts. On a Mac, macOS counts them as this app's doing, so the permissions
// (Accessibility, Screen Recording) are this app's: the server asks here what macOS allows and to ask you for the rest
// ({ type: 'ask' }, answered with { type: 'reply' }). While an agent acts ({ type: 'computer' }), a glow lines the
// screen's edges with a note that Esc stops it (glow.cjs), the agent's pointer shows over the real one ({ type:
// 'pointer' }), the menu bar or tray says so, with Stop, and Esc (⌘⇧Esc too on a Mac) stops it ({ type:
// 'computer-stop' } to the server). The glow is hidden while the agent looks at the screen,
// and Esc let go while the agent itself presses it; on Linux the app takes the agent's screenshots.
//
// The hydor command (a Mac): bin/hydor inside the app runs the app's own Node.js on the app's own cli.js. At each start
// the app puts it on the PATH of Terminal by itself (cli-link.cjs), and under the app the command opens the app when it
// is not running, rather than starting a server of its own.
//
// Notices (a session finished, failed or needs you): the server sends each one here ({ type: 'notice' }), and the app
// shows it as the system's own notification, even with the window closed; clicking it opens that session. The page in
// the window shows none itself, only those the system did not show (not allowed in its settings), handed to it here.
'use strict';
const { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, dialog, globalShortcut, ipcMain, nativeImage, nativeTheme, session, shell, systemPreferences } = require('electron');
const glow = require('./glow.cjs');
const { createNotices } = require('./notices.cjs');
const { spawn, execFile, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
/** Which desktop app this is, as the server hears it (HYDOR_DESKTOP). */
const PLATFORM = MAC ? 'mac' : WIN ? 'windows' : 'linux';

/** For desktop/scripts/launch-test.mjs: what the app did as it started, in a file the test names. */
const trace = (...what) => {
  if (!process.env.HYDOR_DESKTOP_TRACE) return;
  try {
    fs.appendFileSync(process.env.HYDOR_DESKTOP_TRACE, `${new Date().toISOString()} ${what.map((w) => (typeof w === 'string' ? w : JSON.stringify(w))).join(' ')}\n`);
  } catch {}
};
trace('start', process.argv, process.execPath);
process.on('uncaughtException', (e) => trace('uncaught', String((e && e.stack) || e)));
process.on('unhandledRejection', (e) => trace('unhandled', String((e && e.stack) || e)));

// The lock lives in the app's data folder, which must be there first (a first start, a new Windows profile).
try {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
} catch (e) {
  trace('no data folder', app.getPath('userData'), String(e));
}
if (!app.requestSingleInstanceLock()) {
  trace('another copy holds the single-instance lock: quitting', app.getPath('userData'));
  app.exit(0);
  return;
}
// Windows shows notifications under the app its Start menu shortcut names (the installer gives it this id).
if (WIN) app.setAppUserModelId('com.hydor.app');

// ---- where things are -----------------------------------------------------------------------------------------

const PACKAGED = app.isPackaged;
const RES = PACKAGED ? process.resourcesPath : __dirname;
const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};
/**
 * How this copy was installed, which decides how it updates: `app` (a Mac app), `nsis` (Windows, with its installer),
 * `appimage`, `deb` (the Linux package), `dir` (an unpacked build, which does not update itself), or `dev`.
 */
const FORMAT = !PACKAGED
  ? 'dev'
  : MAC
    ? 'app'
    : WIN
      ? exists(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`))
        ? 'nsis'
        : 'dir'
      : process.env.APPIMAGE
        ? 'appimage'
        : RES.startsWith('/opt/') && exists('/var/lib/dpkg/info/hydor.list')
          ? 'deb'
          : 'dir';
/**
 * What an update replaces, and what opens the app (at login, after a restart): the .app this runs from
 * (…/Hydor.app/Contents/MacOS/Hydor), the AppImage, or the program itself. Developing, a stand-in to try updates on.
 */
const BUNDLE = (!PACKAGED && process.env.HYDOR_DESKTOP_BUNDLE) || (MAC ? path.resolve(process.execPath, '../../..') : FORMAT === 'appimage' ? process.env.APPIMAGE : process.execPath);
const REPLACEABLE = PACKAGED || !!process.env.HYDOR_DESKTOP_BUNDLE;
// The app was called Naget Agent (on the Mac): its folders move over once, before anything uses them.
if (MAC) {
  for (const [base, older] of [[app.getPath('appData'), 'Naget Agent'], [path.join(os.homedir(), 'Library/Logs'), 'Naget Agent'], [path.join(os.homedir(), 'Library/Caches'), 'Naget Agent']]) {
    try {
      if (fs.existsSync(path.join(base, older)) && !fs.existsSync(path.join(base, 'Hydor'))) fs.renameSync(path.join(base, older), path.join(base, 'Hydor'));
    } catch (e) {
      console.error('[hydor] could not move', older, e);
    }
  }
}
const DATA = app.getPath('userData'); // ~/Library/Application Support/Hydor, %APPDATA%\Hydor, ~/.config/Hydor
const LOGS = app.getPath('logs'); // ~/Library/Logs/Hydor, or logs in DATA
/** What stays on this computer (not in a roaming Windows profile): the runtime copies. */
const LOCAL = WIN ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'Hydor') : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'Hydor');
const CACHE = MAC ? path.join(os.homedir(), 'Library/Caches/Hydor') : WIN ? path.join(LOCAL, 'Cache') : path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'Hydor');
const RUNTIMES = path.join(LOCAL, 'runtime');
const PENDING = path.join(DATA, 'update.json');
const PREVIOUS = path.join(DATA, MAC ? 'previous.app' : 'previous.AppImage');
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
const readText = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
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
/** A program on the PATH (Linux). */
const onPath = (name) => (process.env.PATH || '').split(path.delimiter).some((d) => d && exists(path.join(d, name)));

/**
 * Whether this copy may replace itself: a Mac app not on the disk image, nor a translocated copy, in a folder you can
 * write to; an AppImage in a folder you can write to; a Windows install of your own; the .deb, with your password.
 */
function updatable() {
  if (!REPLACEABLE) return false;
  if (MAC || FORMAT === 'dev') return !BUNDLE.includes('/AppTranslocation/') && !BUNDLE.startsWith('/Volumes/') && writable(path.dirname(BUNDLE)) && writable(BUNDLE);
  if (FORMAT === 'appimage') return writable(path.dirname(BUNDLE)) && writable(BUNDLE);
  if (FORMAT === 'nsis') return writable(path.dirname(BUNDLE));
  if (FORMAT === 'deb') return onPath('pkexec') && onPath('dpkg');
  return false;
}

/** Moves a file or a folder, across disks too. */
function move(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    if (MAC) execFileSync('ditto', [from, to]);
    else fs.cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

// ---- the server, its Node.js and tmux: inside the app, or in this version's copy ------------------------------------

/** Where they are: the app's resources, this version's copy, or (developing, `npm start` in desktop/) none. */
let ROOT = PACKAGED ? RES : null;
/** Windows and AppImages run a copy (see the top). */
const COPIES = PACKAGED && (WIN || FORMAT === 'appimage');
/** The server: in ROOT, or developing, the repository desktop/ sits in, built. */
const serverDir = () => (ROOT ? path.join(ROOT, 'server') : path.resolve(__dirname, '..'));
const nodeDir = () => (ROOT ? path.join(ROOT, WIN ? 'node' : 'node/bin') : null);
const binDir = () => (ROOT && !WIN ? path.join(ROOT, 'bin') : null);

/** This build's name, which scripts/stage.sh writes: its version, commit and when it was made. */
const buildId = () => (readText(path.join(RES, 'BUILD')) || app.getVersion()).trim();

/** Copies this build's server, Node.js and tmux out of the app, once, and runs them from there. */
async function useRuntime() {
  const id = buildId();
  const dir = path.join(RUNTIMES, `${app.getVersion()}-${crypto.createHash('sha256').update(id).digest('hex').slice(0, 8)}`);
  if (readText(path.join(dir, '.copied')) !== id) {
    const tmp = `${dir}.copying`;
    await fs.promises.rm(tmp, { recursive: true, force: true });
    await fs.promises.mkdir(tmp, { recursive: true });
    for (const part of ['server', 'node', 'bin']) {
      const from = path.join(RES, part);
      if (exists(from)) await fs.promises.cp(from, path.join(tmp, part), { recursive: true, verbatimSymlinks: true });
    }
    await fs.promises.writeFile(path.join(tmp, '.copied'), id);
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.rename(tmp, dir);
  }
  ROOT = dir;
  trace('runs from', dir);
}

/** The programs running now, by their paths and command lines (lowercase on Windows); null when that cannot be told. */
function programsRunning() {
  return new Promise((resolve) => {
    if (WIN) {
      const ps = 'Get-CimInstance Win32_Process | ForEach-Object { $_.ExecutablePath; $_.CommandLine }';
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, maxBuffer: 64 << 20, timeout: 120_000 }, (err, out) =>
        resolve(err ? null : String(out).toLowerCase().split(/\r?\n/)),
      );
      return;
    }
    try {
      const out = [];
      for (const pid of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pid)) continue;
        try {
          out.push(fs.readlinkSync(`/proc/${pid}/exe`));
        } catch {}
        try {
          out.push(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '));
        } catch {}
      }
      resolve(out);
    } catch {
      resolve(null);
    }
  });
}

/** Copies of other versions nothing runs from any more (agents that started there finish, and a later start tidies up). */
async function pruneRuntimes() {
  let names = [];
  try {
    names = fs.readdirSync(RUNTIMES);
  } catch {
    return;
  }
  const others = names.map((n) => path.join(RUNTIMES, n)).filter((d) => d !== ROOT);
  if (!others.length) return;
  const running = await programsRunning();
  if (!running) return;
  for (const d of others) {
    const inside = (WIN ? d.toLowerCase() : d) + path.sep;
    if (running.some((p) => p && p.includes(inside))) continue;
    await fs.promises.rm(d, { recursive: true, force: true }).catch(() => {});
  }
}

// ---- the environment the server and its agents get ---------------------------------------------------------------

/**
 * This process's environment without what an AppImage sets for itself (its folders in PATH and the library paths,
 * gone once it closes), and with the desktop's own name back where Electron changed it (Linux).
 */
function ownEnv() {
  const env = { ...process.env };
  const dir = process.env.APPDIR;
  if (FORMAT === 'appimage' && dir) {
    for (const k of ['PATH', 'LD_LIBRARY_PATH', 'XDG_DATA_DIRS', 'GSETTINGS_SCHEMA_DIR', 'PERLLIB', 'QT_PLUGIN_PATH', 'PYTHONPATH']) {
      if (env[k] == null) continue;
      const kept = env[k].split(':').filter((p) => p && !p.startsWith(dir));
      if (kept.length) env[k] = kept.join(':');
      else delete env[k];
    }
    for (const k of ['APPDIR', 'APPIMAGE', 'ARGV0', 'OWD']) delete env[k];
  }
  if (env.ORIGINAL_XDG_CURRENT_DESKTOP) {
    env.XDG_CURRENT_DESKTOP = env.ORIGINAL_XDG_CURRENT_DESKTOP;
    delete env.ORIGINAL_XDG_CURRENT_DESKTOP;
  }
  return env;
}

/**
 * Apps opened from the Finder (or from a Linux desktop's menu) get a bare PATH (/usr/bin:/bin:…), without Homebrew or
 * the folders your shell adds (where `claude`, `git` and the rest are). The server gets your login shell's environment
 * instead, as a terminal would. Windows apps get your whole environment as it is.
 */
let loginEnvRead = false; // whether loginEnv() got the shell's environment (else its PATH is a guess)
function loginEnv() {
  const own = ownEnv();
  if (WIN) return own;
  const shellPath = process.env.SHELL || (MAC ? '/bin/zsh' : '/bin/bash');
  const mark = '__HYDOR_ENV__';
  try {
    const out = execFileSync(shellPath, ['-ilc', `printf '%s' '${mark}'; command env -0`], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...own, HYDOR_READING_ENV: '1' },
    });
    const env = {};
    for (const kv of out.slice(out.lastIndexOf(mark) + mark.length).split('\0')) {
      const i = kv.indexOf('=');
      if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
    }
    for (const k of ['SHLVL', 'PWD', 'OLDPWD', '_', 'HYDOR_READING_ENV']) delete env[k];
    if (env.PATH) {
      loginEnvRead = true;
      return env;
    }
  } catch {}
  return MAC ? { ...own, PATH: ['/opt/homebrew/bin', '/usr/local/bin', own.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':') } : own;
}

/** Your own settings for the server (PORT, DATA_DIR…), one NAME=value a line, as on Linux. */
function envFile() {
  const env = {};
  // Naget Agent's file first, so a setting in hydor.env wins.
  for (const f of [path.join(os.homedir(), '.config/naget-agent.env'), path.join(os.homedir(), '.config/hydor.env')]) {
    const text = readText(f);
    if (text == null) continue;
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
  // Windows spells it Path, and an environment given to a program must have it once (as PATH: any spelling works there).
  const pathKeys = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH');
  const current = pathKeys.map((k) => env[k]).find(Boolean) || '';
  for (const k of pathKeys) delete env[k];
  return {
    ...env,
    ...extra,
    PATH: [nodeDir(), binDir(), current].filter(Boolean).join(path.delimiter),
    NODE_ENV: 'production',
    HYDOR_ROOT: serverDir(),
    HYDOR_DESKTOP: PLATFORM,
    HYDOR_DESKTOP_FORMAT: FORMAT,
    HYDOR_DESKTOP_APP: BUNDLE,
    HYDOR_DESKTOP_UPDATABLE: updatable() ? '1' : '0',
    HYDOR_DESKTOP_CACHE: CACHE,
  };
}

// ---- the server -------------------------------------------------------------------------------------------------

let server = null;
let serverUrl = null;
let setupToken = null;
/** Where in the app the window goes once its server answers: a page that did not load meanwhile (the logo shows). */
let awaited = null;
let awaitTimer = null;
/** Where the app opens: its start, or the page to choose a password while there is none. */
const home = () => (setupToken ? `/setup?token=${encodeURIComponent(setupToken)}` : '/');
/** The server stopped for good, and the window says why (showProblem), until it starts again (Try again). */
let gaveUp = false;
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
    if (WIN) {
      const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
      if (/^"node\.exe"/im.test(out)) process.kill(pid);
    } else {
      const cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
      if (cmd.includes('dist/server/index.js')) process.kill(pid, 'SIGTERM');
    }
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
  gaveUp = false;
  const extra = {};
  if (updateError) extra.HYDOR_UPDATE_ERROR = JSON.stringify(updateError);
  updateError = null;
  const fd = logFd();
  fs.writeSync(fd, `\n---- ${new Date().toISOString()} Hydor ${app.getVersion()} starts the server\n`);
  const node = nodeDir() ? path.join(nodeDir(), WIN ? 'node.exe' : 'node') : 'node';
  const child = spawn(node, [path.join(serverDir(), 'dist/server/index.js')], { cwd: serverDir(), env: serverEnv(extra), stdio: ['ignore', fd, fd, 'ipc'], windowsHide: true });
  fs.closeSync(fd);
  server = child;
  startedAt = Date.now();
  if (child.pid) fs.writeFileSync(PIDFILE, String(child.pid));
  child.on('message', onMessage);
  child.on('error', (e) => (console.error('[hydor] the server did not start:', e), trace('server error', String(e))));
  trace('server started', node, child.pid);
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
    // Windows has no SIGTERM a program can catch: the server is asked over its channel to stop as it would on one.
    try {
      if (WIN && child.connected) return void child.send({ type: 'quit' });
    } catch {}
    child.kill('SIGTERM');
  });
}

function onMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.type === 'ready') {
    const first = !serverUrl;
    serverUrl = m.url;
    console.log(`[hydor] the server is ready at ${m.url}`);
    // For desktop/scripts/launch-test.mjs: the app heard its server (not just that something answers on the port).
    if (process.env.HYDOR_DESKTOP_READY_FILE) {
      try {
        fs.writeFileSync(process.env.HYDOR_DESKTOP_READY_FILE, JSON.stringify({ url: m.url, platform: PLATFORM, format: FORMAT }));
      } catch {}
    }
    setupToken = m.setupToken || null;
    failures = 0;
    if (verifying) confirmUpdate();
    // The window shows the app now (it may be hidden: it loads all the same), or the page that did not load while the
    // server was away. The page reconnects by itself after later restarts. Opened at login, the window stays closed,
    // unless the password is still to choose.
    const at = awaited ?? home();
    const wanted = awaited !== null;
    awaited = null;
    if (win && (first || wanted || win.webContents.getURL().startsWith('data:'))) void win.loadURL(serverUrl + at);
    else if (!win && first && setupToken) openWindow(at);
    rebuildTray();
    // Copies of versions before this one, once nothing runs from them.
    if (first && COPIES) setTimeout(() => void pruneRuntimes(), 60_000).unref?.();
  } else if (m.type === 'install' && typeof m.app === 'string') {
    void install(m);
  } else if (m.type === 'update') {
    onUpdate(m);
  } else if (m.type === 'notice') {
    sessionNotices.show(m);
  } else if (m.type === 'computer') {
    onComputer(m);
  } else if (m.type === 'pointer') {
    if (computerActive) glow.pointer(m);
  } else if (m.type === 'glow') {
    glow.unveil();
  } else if (m.type === 'esc') {
    lendEsc(false);
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

// ---- what the server shows here: a new version waiting, an agent using the computer --------------------------------

/** A new version downloaded and waiting (its version), for Restart to Update in the menus. */
let updateReady = null;
/** An agent using the computer (computer use) while it acts: { title } of its session, and `using`, in the user's words. */
let computerActive = null;
/** Notifications on screen, kept so they are still there to click. */
const notices = new Set();
/** What stops an agent at the computer: Esc, and on a Mac also ⌘⇧Esc, which macOS leaves free. */
const ESC = 'Escape';
const STOP_KEYS = 'Command+Shift+Escape';
/** The agent itself is pressing Esc: the app lets go of it meanwhile, so the agent does not stop itself. */
let escLent = false;

function onUpdate(m) {
  updateReady = typeof m.version === 'string' && m.version ? m.version : null;
  rebuildTray();
  appMenu();
  if (updateReady && m.notice) notify(m.notice);
}

const updateNow = () => toServer({ type: 'update-now' });

/** A notification: clicking it opens the app (its note counts down, with Later); its button installs now. */
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

// ---- notices: a session finished, failed or needs you (notices.cjs) ------------------------------------------------

/** The path of the app's page the window shows; '' for none (the starting logo, a problem). */
function shownPath() {
  try {
    const u = new URL(win.webContents.getURL());
    return sameOrigin(u.href) ? u.pathname : '';
  } catch {
    return '';
  }
}

/** Opens the window at a page of the app: the page already there goes to it itself, without loading again. */
function openAt(at) {
  if (win && sameOrigin(win.webContents.getURL())) {
    win.webContents.send('hydor:open', at);
    openWindow();
  } else go(at);
}

const sessionNotices = createNotices({
  Notification,
  mac: MAC,
  front: () => (win && win.isVisible() && !win.isMinimized() && win.isFocused() ? shownPath() : null),
  inApp: (n) => {
    if (win && !win.webContents.isDestroyed()) win.webContents.send('hydor:notice', n);
  },
  open: openAt,
  showApp: () => go(),
});

/**
 * Where the system lets you allow the app's notifications: on a Mac, Hydor's own page in System Settings →
 * Notifications (its bundle id, electron-builder.cjs appId); on Windows, Settings → System → Notifications.
 */
const NOTICE_SETTINGS = MAC ? 'x-apple.systempreferences:com.apple.preference.notifications?id=com.hydor.app' : WIN ? 'ms-settings:notifications' : null;

// What the page in the window asks (preload.cjs): only the app's own pages.
const fromOwnPage = (e) => sameOrigin((e.senderFrame && e.senderFrame.url) || '');
ipcMain.handle('hydor:notices', (e) => (fromOwnPage(e) ? sessionNotices.state() : null));
ipcMain.handle('hydor:notice-test', (e, t) => (fromOwnPage(e) ? sessionNotices.test(t) : null));
ipcMain.handle('hydor:notice-settings', async (e) => {
  if (!fromOwnPage(e) || !NOTICE_SETTINGS) return false;
  try {
    await shell.openExternal(NOTICE_SETTINGS);
    return true;
  } catch {
    return false;
  }
});

const SYSTEM_USING = MAC ? 'An agent is using your Mac' : WIN ? 'An agent is using your PC' : 'An agent is using your computer';

/** Esc (and ⌘⇧Esc) stop the agent, only while one acts: the keys stay the other apps' otherwise. */
function holdStops() {
  if (!computerActive) return;
  const hold = (keys, name) => {
    try {
      if (!globalShortcut.isRegistered(keys) && !globalShortcut.register(keys, stopComputer)) console.error(`[hydor] ${name} is taken by another app`);
    } catch {}
  };
  if (!escLent) hold(ESC, 'Esc');
  if (MAC) hold(STOP_KEYS, '⌘⇧Esc');
}

function dropStops(keys) {
  for (const k of keys)
    try {
      if (globalShortcut.isRegistered(k)) globalShortcut.unregister(k);
    } catch {}
}

/** The agent presses Esc itself (lent), or has (given back). */
function lendEsc(lent) {
  escLent = lent;
  if (lent) dropStops([ESC]);
  else holdStops();
}

function onComputer(m) {
  const was = !!computerActive;
  computerActive = m.active ? { title: typeof m.title === 'string' ? m.title : '', using: typeof m.using === 'string' && m.using ? m.using : SYSTEM_USING } : null;
  if (computerActive) {
    glow.setGlow(m.glow !== false, { using: computerActive.using, esc: typeof m.esc === 'string' ? m.esc : '', agent: typeof m.agent === 'string' ? m.agent : '' });
    holdStops();
  } else if (was) {
    glow.setGlow(false);
    escLent = false;
    dropStops([ESC, STOP_KEYS]);
  }
  rebuildTray();
}

/** Stop (Esc, the menu bar or tray, ⌘⇧Esc): the agent's actions end, and no agent uses the computer until you allow it again. */
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

/** macOS's names for those permissions, for tccutil. */
const TCC = { accessibility: 'Accessibility', screen: 'ScreenCapture' };
const cleared = new Set();

/**
 * A switch left on in System Settings for an earlier version of the app, which macOS does not count for this one (each
 * update did that while the app was signed ad hoc; Hydor's own certificate keeps them since): cleared once a run,
 * before asking, so macOS asks again and the switch it lists is this version's. Not while developing, where the app is
 * Electron's.
 */
function clearStale(which) {
  if (!PACKAGED || cleared.has(which)) return;
  cleared.add(which);
  try {
    execFileSync('/usr/bin/tccutil', ['reset', TCC[which], 'com.hydor.app'], { stdio: 'ignore', timeout: 10_000 });
  } catch {}
}

/** What macOS lets this app (and the programs its server starts) do: use the mouse and keyboard, see the screen. */
function permissions() {
  let screen = 'unknown';
  try {
    screen = systemPreferences.getMediaAccessStatus('screen');
  } catch {}
  return { accessibility: systemPreferences.isTrustedAccessibilityClient(false), screen };
}

/**
 * The server asks: to hide the glow for a screenshot, to let go of Esc while the agent presses it, a picture of the
 * screen (Linux), what macOS allows, or to ask you for a permission (macOS's own prompt, then its settings).
 */
async function answer(m) {
  const reply = (r) => toServer({ type: 'reply', id: m.id, ok: true, ...r });
  try {
    if (m.what === 'glow') {
      if (m.show === false) await glow.veil();
      else glow.unveil();
      return reply({});
    }
    if (m.what === 'esc') {
      lendEsc(m.on === false);
      return reply({});
    }
    if (m.what === 'screenshot') return reply(await glow.capture(Number(m.max) || 1280, Number(m.quality) || 70));
    if (!MAC) return toServer({ type: 'reply', id: m.id, ok: false, error: 'only the Mac app can do that' });
    if (m.what === 'permissions') return reply(permissions());
    if (m.what === 'request' && m.which === 'accessibility') {
      // macOS asks once ("Hydor would like to control this computer"); its settings list the app from then on.
      if (!systemPreferences.isTrustedAccessibilityClient(false)) {
        clearStale('accessibility');
        if (!systemPreferences.isTrustedAccessibilityClient(true)) await shell.openExternal(PANES.accessibility);
      }
      return reply(permissions());
    }
    if (m.what === 'request' && m.which === 'screen') {
      if (permissions().screen !== 'granted') {
        clearStale('screen');
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
  const hidden = !win || !win.isVisible();
  await stopServer();
  if (FORMAT === 'nsis') return runInstaller(m, hidden, fail);
  if (FORMAT === 'deb') return installPackage(m, hidden, fail);
  // A Mac app or an AppImage: the new version takes this one's place, and this one waits aside until it starts.
  try {
    move(BUNDLE, PREVIOUS);
  } catch (e) {
    return fail(`could not move the app aside: ${e.message}`);
  }
  try {
    if (MAC) execFileSync('ditto', [m.app, BUNDLE]);
    else {
      move(m.app, BUNDLE);
      fs.chmodSync(BUNDLE, 0o755);
    }
  } catch (e) {
    try {
      fs.rmSync(BUNDLE, { recursive: true, force: true });
      move(PREVIOUS, BUNDLE);
    } catch {}
    return fail(`could not put the new version in place: ${String(e.message).split('\n')[0]}`);
  }
  if (MAC) {
    try {
      execFileSync('xattr', ['-dr', 'com.apple.quarantine', BUNDLE], { stdio: 'ignore' });
    } catch {}
  }
  fs.rmSync(path.join(CACHE, 'updates'), { recursive: true, force: true });
  fs.writeFileSync(PENDING, JSON.stringify({ from: m.from, to: m.to, at: Date.now() }));
  relaunch();
}

/** Windows: the new version's installer, without its window. It installs over this app (closed by then) and opens it. */
function runInstaller(m, hidden, fail) {
  fs.writeFileSync(PENDING, JSON.stringify({ from: m.from, to: m.to, at: Date.now(), hidden }));
  const failed = (e) => {
    fs.rmSync(PENDING, { force: true });
    fail(`could not start the installer: ${e.message}`);
  };
  let child;
  try {
    child = spawn(m.app, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' });
  } catch (e) {
    return failed(e);
  }
  child.once('error', failed);
  child.once('spawn', () => {
    child.unref();
    quitting = true;
    app.exit(0);
  });
}

/** The .deb: the system installs the new package once you give your password; then the app opens again, as the new version. */
function installPackage(m, hidden, fail) {
  let err = '';
  const child = spawn('pkexec', ['dpkg', '-i', m.app], { stdio: ['ignore', 'ignore', 'pipe'] });
  child.stderr.on('data', (d) => (err += d));
  child.once('error', (e) => fail(`could not ask for your password: ${e.message}`));
  child.once('exit', (code) => {
    if (code === 126 || code === 127) return fail('your password was not given, so the system did not install it');
    if (code !== 0) return fail(`the system did not install it: ${err.trim().split('\n').pop() || `exit ${code}`}`);
    fs.rmSync(path.join(CACHE, 'updates'), { recursive: true, force: true });
    fs.writeFileSync(PENDING, JSON.stringify({ from: m.from, to: m.to, at: Date.now(), hidden }));
    relaunch();
  });
}

/** Opens this app again (the new version, after an update), with its window as it is now. */
function relaunch() {
  quitting = true;
  const args = process.argv.slice(1).filter((a) => a !== '--hidden' && a !== '--updated');
  if (!win || !win.isVisible()) args.push('--hidden');
  app.relaunch(FORMAT === 'appimage' ? { execPath: BUNDLE, args } : { args });
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
    const failed = path.join(DATA, MAC ? 'failed.app' : 'failed.AppImage');
    try {
      move(BUNDLE, failed);
      move(PREVIOUS, BUNDLE);
      fs.rmSync(failed, { recursive: true, force: true });
      fs.writeFileSync(PENDING, JSON.stringify({ ...p, failed: `Version ${p.to} did not start: ${why}. The version before is back.` }));
    } catch (e) {
      console.error('[hydor] could not go back to the version before:', e);
    }
    const args = process.argv.slice(1);
    app.relaunch(FORMAT === 'appimage' ? { execPath: BUNDLE, args } : { args });
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
    // Installed and opened (Windows, the .deb: there is no copy to go back to), or not the version it installed (put
    // back by hand, say): what was kept for it is no longer needed.
    fs.rmSync(PENDING, { force: true });
    fs.rmSync(PREVIOUS, { recursive: true, force: true });
    try {
      fs.rmSync(path.join(CACHE, 'updates'), { recursive: true, force: true });
    } catch {}
  }
}

/** Opened at login, or after an update while its window was closed: the window stays closed. */
const pending = readJson(PENDING);
const HIDDEN = process.argv.includes('--hidden') || (!!pending && pending.hidden === true && pending.to === app.getVersion());

// ---- the window ---------------------------------------------------------------------------------------------

let win = null;
const sameOrigin = (url) => {
  try {
    return !!serverUrl && new URL(url).origin === new URL(serverUrl).origin;
  } catch {
    return false;
  }
};

const FONT = MAC ? '-apple-system,system-ui,sans-serif' : 'system-ui,"Segoe UI",Ubuntu,Cantarell,sans-serif';
const page = (body) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Hydor</title><style>
  :root{color-scheme:light dark;font:14px ${FONT}}
  body{margin:0;height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
  main{max-width:560px;padding:24px;text-align:center} p{opacity:.7;line-height:1.5}
  pre{text-align:left;font:11px ui-monospace,monospace;opacity:.8;white-space:pre-wrap;max-height:40vh;overflow:auto;border:1px solid #8884;border-radius:8px;padding:10px}
  a{color:AccentColor;margin:0 8px}</style><main>${body}</main>`);
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// While the server starts: the logo, HYDΩR, water rising in its Ω and moving gently until the app is there, in the
// app's colours, dark or light as the system is. The page the server sends opens on the same logo (web/index.html
// #boot), its Ω already full, so the one follows the other without a jump.
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

/** Pictures the app shows itself: the tray's, the window's (Linux), the About panel's. */
const resource = (name) => path.join(PACKAGED ? RES : path.join(__dirname, 'resources'), name);
/** Closing the window the first time on Windows or Linux says where the app went. */
const TRAY_TOLD = path.join(DATA, 'tray-told');

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
      // Windows and Linux: the menu shows when you press Alt.
      autoHideMenuBar: !MAC,
      ...(MAC || WIN ? {} : { icon: resource('icon-256.png') }),
      // preload.cjs gives the app's own page a dropped file's path, so the Library moves it in rather than copying it.
      webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.cjs') },
    });
    win.webContents.setUserAgent(`${win.webContents.getUserAgent()} Hydor${MAC ? 'Mac' : WIN ? 'Windows' : 'Linux'}/${app.getVersion()}`);
    win.once('ready-to-show', () => win && win.show());
    win.on('close', (e) => {
      if (quitting) return;
      // Closing the window keeps the app (and its agents) going, in the menu bar (the notification area, the tray).
      e.preventDefault();
      try {
        fs.writeFileSync(path.join(DATA, 'window.json'), JSON.stringify(win.getBounds()));
      } catch {}
      win.hide();
      app.dock?.hide();
      if (!MAC && !exists(TRAY_TOLD)) {
        try {
          fs.writeFileSync(TRAY_TOLD, String(Date.now()));
        } catch {}
        if (Notification.isSupported()) {
          const where = WIN ? 'the notification area of the taskbar' : 'the system tray';
          const note = new Notification({ title: 'Hydor is still running', body: `Its agents carry on. Open it again from ${where}, or quit it there.` });
          notices.add(note);
          note.on('click', () => {
            notices.delete(note);
            go();
          });
          note.on('close', () => notices.delete(note));
          note.show();
        }
      }
    });
    win.on('closed', () => (win = null));
    win.webContents.setWindowOpenHandler(({ url }) => {
      // With the window's preload, a page there leaves notices to the app as the window's does.
      if (sameOrigin(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1100, height: 800, autoHideMenuBar: !MAC, webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') } } };
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
    // A page of the app that did not load (its server did not answer, as while it starts again): the logo rather than
    // an empty window, then that page once the server answers (onMessage). -3 is a load another one took over from.
    win.webContents.on('did-fail-load', (_e, code, what, url, mainFrame) => {
      if (!mainFrame || code === -3 || code >= 0 || !sameOrigin(url)) return;
      trace('page did not load', code, what, url.split('?')[0]);
      if (gaveUp) return showProblem();
      const u = new URL(url);
      awaited = u.pathname + u.search + u.hash;
      void win?.loadURL(bootPage());
      awaitServer();
    });
    // For desktop/scripts/launch-test.mjs: what the window shows.
    win.webContents.on('did-navigate', (_e, url) => trace('page shown', url.startsWith('data:') ? 'data:' : url.split('?')[0]));
  }
  // The app, where asked; else, in a window that shows nothing yet (made just now, as when the app started without
  // one: at login, or after it updated itself with its window closed) or only the logo of a page that did not load,
  // at its start or that page. Before the server first answers, the logo until it does (onMessage); once it has
  // stopped for good, what showProblem says.
  const empty = !win.webContents.getURL();
  if (serverUrl && !gaveUp && (at !== undefined || empty || awaited !== null)) {
    const to = at ?? awaited ?? home();
    awaited = null;
    void win.loadURL(serverUrl + to);
  } else if (empty) void win.loadURL(bootPage());
  app.dock?.show();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * While the logo stands in for a page that did not load: that page as soon as the server answers, should it be up
 * already (the load broke off another way, as when the computer slept) rather than starting again (onMessage).
 */
function awaitServer(wait = 2000) {
  clearTimeout(awaitTimer);
  awaitTimer = setTimeout(async () => {
    if (awaited === null || gaveUp || !serverUrl) return;
    const up = await fetch(`${serverUrl}/api/health`).then((r) => r.ok, () => false);
    if (!win || awaited === null || gaveUp) return;
    if (!up) return awaitServer(Math.min(30_000, wait * 2));
    const at = awaited;
    awaited = null;
    void win.loadURL(serverUrl + at);
  }, wait);
}

/** The server would not start (or this version could not be set up): say so, with the end of its log. */
function showProblem(why) {
  let tail = '';
  try {
    tail = fs.readFileSync(LOG, 'utf8').split('\n').slice(-25).join('\n');
  } catch {}
  // This page stays until Try again, rather than the app's while its server is not there to answer.
  gaveUp = true;
  awaited = null;
  openWindow();
  void win.loadURL(
    page(
      why
        ? `<h2>Hydor could not start</h2><p>${esc(why)}</p>` + `<p><a href="naget-action:retry">Try again</a><a href="naget-action:log">Show the log</a></p>`
        : `<h2>Hydor could not start</h2><p>Its server stopped each time it started. The end of its log:</p><pre>${esc(tail)}</pre>` +
            `<p><a href="naget-action:retry">Try again</a><a href="naget-action:log">Show the log</a></p>`,
    ),
  );
}

function action(what) {
  if (what === 'retry') {
    failures = 0;
    void win?.loadURL(bootPage());
    void start();
  } else if (what === 'log') shell.showItemInFolder(LOG);
}

const go = (at) => (serverUrl ? openWindow(at) : openWindow());

// ---- the `hydor` command in Terminal (a Mac) -----------------------------------------------------------------------

/**
 * Puts the command on the PATH of Terminal (cli-link.cjs), with nothing asked and nothing shown: a link to bin/hydor
 * inside the app, in ~/.local/bin, ~/bin, /usr/local/bin or /opt/homebrew/bin when that is on your PATH and yours to write
 * in, else in ~/.local/bin with a line in your shell's startup file.
 */
function linkCommand() {
  if (!MAC || !PACKAGED) return;
  // From a disk image or a translocated copy the app's files go away, and the link would point at nothing.
  if (BUNDLE.includes('/AppTranslocation/') || BUNDLE.startsWith('/Volumes/')) return trace('hydor command', 'skipped: the app runs from a disk image or a translocated copy', BUNDLE);
  try {
    // Only a PATH the login shell really gave counts (loginEnv's guess does not say what Terminal has).
    const loginPath = loginEnvRead && baseEnv ? baseEnv.PATH : null;
    const did = require('./cli-link.cjs').linkCommand({ launcher: path.join(RES, 'bin/hydor'), loginPath, shell: os.userInfo().shell, env: baseEnv || process.env });
    trace('hydor command', did);
    console.log(`[hydor] the hydor command: ${did}`);
  } catch (e) {
    trace('hydor command failed', String(e));
  }
}

// ---- menus ------------------------------------------------------------------------------------------------------

let tray = null;
function trayIcon() {
  if (MAC) {
    const icon = nativeImage.createFromPath(resource('trayTemplate.png'));
    icon.setTemplateImage(true);
    return icon;
  }
  return nativeImage.createFromPath(resource(WIN ? 'tray.ico' : 'tray-linux.png'));
}

function rebuildTray() {
  if (!tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip('Hydor');
    // Windows (and some Linux desktops): a click on the icon opens the app; its menu is on the other button.
    if (!MAC) tray.on('click', () => go());
  }
  // While an agent uses the computer, the menu bar says so beside the icon (a Mac), and the menu starts with Stop.
  const agent = computerActive
    ? [
        { label: computerActive.using, enabled: false },
        ...(computerActive.title ? [{ label: `In “${computerActive.title.slice(0, 60)}”`, enabled: false }] : []),
        // Esc as the menu's hint (Linux's tray menus show none).
        { label: 'Stop', ...(MAC || WIN ? { accelerator: 'Escape' } : {}), click: stopComputer },
        { type: 'separator' },
      ]
    : [];
  if (MAC) tray.setTitle(computerActive ? 'Agent using your Mac' : '');
  tray.setToolTip(computerActive ? `Hydor: ${computerActive.using}` : 'Hydor');
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
  const update = updateReady ? { label: `Restart to Update to ${updateReady}`, click: updateNow } : { label: 'Check for Updates…', click: () => go('/settings?s=general&find=Check%20now') };
  const help = {
    role: 'help',
    submenu: [
      { label: 'Hydor Guide', click: () => go('/guide') },
      { label: 'Open in Browser', click: () => serverUrl && shell.openExternal(serverUrl) },
      { label: 'Show the Server Log', click: () => shell.showItemInFolder(LOG) },
      ...(MAC ? [] : [{ type: 'separator' }, { role: 'about', label: 'About Hydor' }]),
    ],
  };
  if (MAC) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            update,
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
        help,
      ]),
    );
    return;
  }
  // Windows and Linux: no Edit menu (copying and pasting work without one) and no keys the app's terminals need, such
  // as Ctrl+R and Ctrl+W.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'File',
        submenu: [
          { label: 'Settings…', accelerator: 'Ctrl+,', click: () => go('/settings') },
          update,
          { type: 'separator' },
          { label: 'Close Window', click: () => win?.close() },
          { label: 'Quit Hydor', ...(WIN ? {} : { accelerator: 'Ctrl+Q' }), click: () => app.quit() },
        ],
      },
      {
        label: 'View',
        submenu: [
          { label: 'Reload', accelerator: 'F5', click: () => win?.webContents.reload() },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      help,
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

/** The server, from this version's copy where there is one (made first, while the window shows the logo). */
async function start() {
  trace('start the server', { FORMAT, COPIES, RES, BUNDLE, DATA, LOCAL });
  if (COPIES && ROOT === RES) {
    try {
      await useRuntime();
    } catch (e) {
      return showProblem(`It could not set up this version in ${RUNTIMES}: ${String((e && e.message) || e)}`);
    }
  }
  startServer();
}

app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: 'Hydor', applicationVersion: app.getVersion(), copyright: 'Hydor Devs', ...(MAC ? {} : { iconPath: resource('icon-256.png') }) });
  // Opened from the disk image or Downloads, it offers to move to Applications, where it can update itself.
  if (MAC && PACKAGED && !HIDDEN && !app.isInApplicationsFolder()) {
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
  void sessionNotices.restore();
  // The window may use the microphone (voice) and show notifications; only for the app's own pages.
  session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
    const ok = sameOrigin(details.requestingUrl || wc.getURL());
    if (ok && permission === 'media') {
      if (!(details.mediaTypes || []).includes('audio')) return done(false);
      if (MAC) return void systemPreferences.askForMediaAccess('microphone').then(done, () => done(false));
      return done(true);
    }
    done(ok && ['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock'].includes(permission));
  });
  readPending();
  stopStale();
  if (!HIDDEN) openWindow();
  else app.dock?.hide();
  await start();
  // The hydor command, a moment later and in the background.
  setTimeout(linkCommand, 2000).unref?.();
});

app.on('window-all-closed', () => {
  // Stays in the menu bar (the notification area, the tray).
});

app.on('will-quit', () => globalShortcut.unregisterAll());

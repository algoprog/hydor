// Puts the `hydor` command on the PATH of a terminal, by itself and without a password or a dialog (plain Node, no Electron:
// main.cjs runs it at each start of the packaged app, and server/desktop-cli-link-test.ts tries it on scratch folders).
// The command is bin/hydor inside the app (bin/hydor.cmd on Windows; stage.sh writes it: it runs the app's own Node.js on
// the app's own cli.js). There are three ways to get it onto the PATH, by how the app is kept:
//   a Mac:        a symlink to the launcher inside the .app, which stays where it is until the app moves (then it is relinked)
//   Linux:        a small shim file (`open` is given): the app's server runs from a copy for each version (an AppImage) or
//                 from /opt (the .deb), and a link to the launcher in a copy would break when that goes. The shim names the
//                 app's program (HYDOR_APP_OPEN, which opens the app when it is closed) and runs the current launcher; the
//                 app writes it again at each start. A link of the Mac's kind, from an older version, counts as ours.
//   Windows:      the shim is a hydor.cmd: in %LOCALAPPDATA%\Microsoft\WindowsApps when that is on the PATH (it is on Windows
//                 10 and 11), else in %LOCALAPPDATA%\Hydor\bin, which is added to your user Path in the registry.
// It never throws, never shows anything, and returns what it did, for the trace:
//   'fine'                           the first `hydor` on the PATH is already this app's (or a script someone wrote by hand)
//   'relinked'                       a link of ours that pointed at where the app used to be points here now
//   'linked <folder>'                a link in one of ~/.local/bin, ~/bin, /usr/local/bin, /opt/homebrew/bin (the first that
//                                    is on the PATH, yours to write in, and holds no hydor that is not ours)
//   'linked ~/.local/bin + <file>'   a link in ~/.local/bin, which that shell's startup file now adds to the PATH
//                                    (a tool's own folder on the PATH, such as ~/.cargo/bin, is never used)
//   'updated'                        (shim) ours was there and now says where the app is now
//   'linked WindowsApps' …           (Windows) where the shim went; see linkWindows
//   'skipped: …'                     it left things as they were, and says why
// What it will not do: write outside your own folders, replace a `hydor` that is not ours (on Linux and Windows it
// leaves everything alone when there is one on the PATH), or add to the PATH twice.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** What the startup file says about the line below it: found first, so the line is never added twice. */
const MARKER = '# Added by Hydor: the hydor command';
const SH_LINE = 'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac';
const FISH_LINE = 'contains -- $HOME/.local/bin $PATH; or set -gx PATH $PATH $HOME/.local/bin';
/** The same, first on the PATH: when a program of the app's own is linked as `hydor` after it (the .deb's /usr/bin/hydor). */
const PRE_SH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';
const PRE_FISH_LINE = 'set -gx PATH $HOME/.local/bin $PATH';
/** What the shim file says in its first lines (a file with it is ours). */
const SHIM_MARK = 'Hydor app: the hydor command';
/** What the first lines of the app's own launcher (stage.sh's bin/hydor) say: a link to a file that says it is the app's. */
const LAUNCHER_MARK = 'The `hydor` command of the Hydor app';
/** Where a link of an older version pointed on Linux and Windows: the launcher of a runtime copy, or of the app's resources. */
const FROM_A_COPY = /[\\/](runtime[\\/][^\\/]+|resources)[\\/]bin[\\/]hydor(\.cmd)?$/;
/** A link of ours that went stale ends like this: the app's own launcher, wherever the app was. */
const FROM_AN_APP = '.app/Contents/Resources/bin/hydor';
/** What a script someone wrote by hand to run the app's command mentions. */
const SCRIPT_MENTIONS = '/Contents/Resources/server/dist/server/cli.js';
const lstat = (p) => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};
const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
};
const canWrite = (p) => {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const canRun = (p) => {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Where a symlink points, as an absolute path; null when `p` is not a symlink. */
function target(p) {
  try {
    if (!fs.lstatSync(p).isSymbolicLink()) return null;
    return path.resolve(path.dirname(p), fs.readlinkSync(p));
  } catch {
    return null;
  }
}

/** Link `p` is a symlink to `launcher` (by its name, or by where both end up). */
function isOurs(p, launcher) {
  const to = target(p);
  if (to == null) return false;
  if (to === launcher) return true;
  const a = real(p);
  return a != null && a === real(launcher);
}

/** A symlink to some app's launcher that is not this one's: the app has moved. */
const isStale = (p, launcher) => {
  const to = target(p);
  return to != null && to.endsWith(FROM_AN_APP) && !isOurs(p, launcher);
};

/** A script someone wrote by hand to run this app's command (a file, or a link to one, that names the app's cli.js). */
function isHandWritten(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(64 * 1024);
      return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0)).includes(SCRIPT_MENTIONS);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/** The folders of a PATH: absolute ones, once each, in order. */
const folders = (p, delimiter = path.delimiter, fold = (d) => d) => {
  const seen = new Set();
  const out = [];
  for (let d of String(p || '').split(delimiter)) {
    d = d.trim().replace(/^"(.*)"$/, '$1');
    if (!d || !path.isAbsolute(d)) continue;
    d = path.resolve(d);
    if (!seen.has(fold(d))) {
      seen.add(fold(d));
      out.push(d);
    }
  }
  return out;
};

/** Makes (or replaces) the link `file` to the launcher. */
function link(file, launcher) {
  if (lstat(file)) fs.unlinkSync(file);
  fs.symlinkSync(launcher, file);
}

/** The first `hydor` that a shell would run from this PATH ('' when none), and whether it is ours or a script of the user's. */
function first(dirs, launcher) {
  for (const d of dirs) {
    const f = path.join(d, 'hydor');
    if (canRun(f)) return isOurs(f, launcher) || isHandWritten(f) ? 'fine' : f;
  }
  return '';
}

/** The startup file of the login shell that adds ~/.local/bin to the PATH, and what goes in it; null for a shell it does not know. */
function startupFile(shell, home, env, first = false) {
  const name = path.basename(String(shell || ''));
  const sh = first ? PRE_SH_LINE : SH_LINE;
  if (name === 'zsh') return { file: path.join(env.ZDOTDIR || home, '.zprofile'), line: sh };
  if (name === 'bash') {
    for (const f of ['.bash_profile', '.bash_login', '.profile']) if (lstat(path.join(home, f))) return { file: path.join(home, f), line: sh };
    return { file: path.join(home, '.bash_profile'), line: sh };
  }
  if (name === 'fish') return { file: path.join(home, '.config/fish/conf.d/hydor.fish'), line: first ? PRE_FISH_LINE : FISH_LINE, own: true };
  return null;
}

/** Adds the line to that file once. Returns the file when it did or it was there, else null. */
function addToPath(rc) {
  let text = '';
  try {
    text = fs.readFileSync(rc.file, 'utf8');
  } catch {}
  if (text.includes(MARKER)) return rc.file;
  fs.mkdirSync(path.dirname(rc.file), { recursive: true });
  fs.appendFileSync(rc.file, `${text && !text.endsWith('\n') ? '\n' : ''}${text && !rc.own ? '\n' : ''}${MARKER}\n${rc.line}\n`);
  return rc.file;
}

/**
 * A Mac: makes the `hydor` command work in a new Terminal window, with a link to the launcher.
 *   launcher   the app's bin/hydor
 *   loginPath  the PATH your login shell gives, or null/'' when it could not be read (then only ~/.local/bin is used)
 *   home, shell, env   default to this user's own (env: for ZDOTDIR)
 *   candidates   the folders to link in, in order (default: ~/.local/bin, ~/bin, /usr/local/bin, /opt/homebrew/bin; for tests)
 */
function linkSymlink({ launcher, loginPath, home = os.homedir(), shell, env = process.env, candidates } = {}) {
  try {
    if (!launcher || !fs.existsSync(launcher)) return 'skipped: the app has no command inside';
    shell ??= (() => {
      try {
        return os.userInfo().shell;
      } catch {
        return '';
      }
    })();
    const known = !!String(loginPath || '').trim();
    const dirs = known ? folders(loginPath) : [];
    const tilde = (p) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
    const localBin = path.join(home, '.local/bin');
    candidates ??= [localBin, path.join(home, 'bin'), '/usr/local/bin', '/opt/homebrew/bin'];

    // Already fine: the first hydor a shell finds is this app's, or a script of the user's.
    if (known && first(dirs, launcher) === 'fine') return 'fine';

    // A link of ours that went stale (the app moved): pointed here, wherever the PATH or the usual folders have it.
    let relinked = false;
    for (const dir of new Set([...dirs, ...candidates])) {
      const f = path.join(dir, 'hydor');
      if (!isStale(f, launcher) || !canWrite(dir)) continue;
      try {
        link(f, launcher);
        relinked = true;
      } catch {}
    }
    if (relinked && (!known || first(dirs, launcher) === 'fine')) return 'relinked';

    // One of the general folders, when it is on the PATH and yours to write in.
    if (known) {
      for (const dir of candidates.map((d) => path.resolve(d))) {
        const f = path.join(dir, 'hydor');
        if (!dirs.includes(dir) || !canWrite(dir)) continue;
        if (isOurs(f, launcher)) return relinked ? 'relinked' : 'fine';
        if (lstat(f)) continue; // somebody else's hydor: left alone
        try {
          fs.symlinkSync(launcher, f);
          return `linked ${tilde(dir)}`;
        } catch {}
      }
    }

    // None: ~/.local/bin, and the PATH of new Terminal windows gets it.
    const f = path.join(localBin, 'hydor');
    if (lstat(f) && !isOurs(f, launcher)) return `skipped: ${tilde(f)} is something else`;
    fs.mkdirSync(localBin, { recursive: true });
    if (!lstat(f)) fs.symlinkSync(launcher, f);
    if (known && dirs.includes(localBin)) return 'linked ~/.local/bin';
    const rc = startupFile(shell, home, env);
    if (!rc) return `linked ~/.local/bin (no startup file to change for ${path.basename(String(shell || '')) || 'this shell'})`;
    try {
      return `linked ~/.local/bin + ${tilde(addToPath(rc))}`;
    } catch (e) {
      return `linked ~/.local/bin (${tilde(rc.file)} could not be changed: ${(e && e.code) || e})`;
    }
  } catch (e) {
    return `skipped: ${(e && e.message) || e}`;
  }
}

// ---- Linux: the shim ------------------------------------------------------------------------------------------------

/** A string as one word for sh (a path with spaces, a quote or a $ in it stays one piece). */
const shq = (v) => `'${String(v).replace(/'/g, "'\\''")}'`;

/** The shim file's text: what the app is, what opens it, and the launcher of the copy that runs now. */
function shimText(launcher, open) {
  for (const v of [launcher, open]) if (/[\r\n\0]/.test(v)) throw new Error('a path with a line break in it');
  return `#!/bin/sh
# ${SHIM_MARK}
# The Hydor app writes this file each time it starts, so it names the version that runs now: changes made here are lost.
HYDOR_APP_OPEN=${shq(open)}
export HYDOR_APP_OPEN
exec ${shq(launcher)} "$@"
`;
}

/** The first bytes of a file as text (through links), '' when it cannot be read. */
function head(p, n = 2048) {
  try {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(n);
      return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, n, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** A plain file (not a link) that is a shim of the app's: it says so in its first lines. */
function isShim(p) {
  const st = lstat(p);
  return !!st && st.isFile() && head(p).includes(SHIM_MARK);
}

/** A link of an older version to a launcher of the app's, which may be gone by now (a runtime copy of an old version). */
function isOldLink(p) {
  const to = target(p);
  return to != null && (head(to).includes(LAUNCHER_MARK) || FROM_A_COPY.test(to));
}

/** Writes the file whole at once (a temporary file renamed over it: a link there is replaced, never written through). Whether it changed. */
function writeFileAtomic(file, text, mode) {
  const st = lstat(file);
  if (st && st.isFile() && !st.isSymbolicLink()) {
    try {
      if (fs.readFileSync(file, 'utf8') === text) return false;
    } catch {}
  }
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, text, { mode });
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return true;
}

/** The first `hydor` a shell would run from these folders, as { file, ours, index }. The app's own program linked as `hydor` (the .deb's /usr/bin/hydor) does not count: { shadow } says where it is. */
function firstShim(dirs, appReal) {
  let shadow = -1;
  for (let i = 0; i < dirs.length; i++) {
    const f = path.join(dirs[i], 'hydor');
    if (!canRun(f)) continue;
    if (appReal && real(f) === appReal) {
      if (shadow < 0) shadow = i;
      continue;
    }
    return { file: f, ours: isShim(f) || isOldLink(f), index: i, shadow };
  }
  return { file: '', ours: false, index: -1, shadow };
}

/**
 * Linux: the shim `hydor` in a folder of the PATH, as the Mac's link is chosen (~/.local/bin, ~/bin, /usr/local/bin, the first on the
 * PATH and yours to write in; else ~/.local/bin and a line in your shell's startup file), but a file the app writes again whenever
 * what it holds would change. A `hydor` on the PATH that is not ours (install.sh's link to a git checkout) is left alone, and
 * all of it with it. The .deb links its own program as /usr/bin/hydor: ours goes before it, or its line puts ours first.
 *   open   the program that starts the app (the AppImage, or the app's own program)
 *   appProgram   the app's own program (to know the .deb's link to it)
 */
function linkShim({ launcher, loginPath, home = os.homedir(), shell, env = process.env, candidates, open, appProgram }) {
  const text = shimText(launcher, open);
  const known = !!String(loginPath || '').trim();
  const dirs = known ? folders(loginPath) : [];
  const tilde = (p) => (p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p);
  const localBin = path.join(home, '.local/bin');
  candidates ??= [localBin, path.join(home, 'bin'), '/usr/local/bin'];
  const appReal = appProgram ? real(appProgram) : null;

  // Someone else's hydor first on the PATH: nothing is touched.
  const first = known ? firstShim(dirs, appReal) : { file: '', ours: false, index: -1, shadow: -1 };
  if (first.file && !first.ours) return `skipped: another hydor on the PATH: ${first.file}`;

  // Every shim or older link of ours that is yours to write in (on the PATH or in the usual folders) says where the app is now.
  let rewritten = false;
  for (const dir of new Set([...dirs, ...candidates.map((d) => path.resolve(d))])) {
    const f = path.join(dir, 'hydor');
    if (!(isShim(f) || isOldLink(f)) || !canWrite(dir)) continue;
    try {
      if (writeFileAtomic(f, text, 0o755)) rewritten = true;
    } catch {}
  }
  if (first.ours && first.shadow < 0) return rewritten ? 'updated' : 'fine';

  // A general folder before the app's own link (when there is one), on the PATH and yours to write in.
  const before = (dir) => first.shadow < 0 || (dirs.indexOf(dir) >= 0 && dirs.indexOf(dir) < first.shadow);
  if (known) {
    for (const dir of candidates.map((d) => path.resolve(d))) {
      const f = path.join(dir, 'hydor');
      if (!dirs.includes(dir) || !canWrite(dir) || !before(dir)) continue;
      if (isShim(f)) return rewritten ? 'updated' : 'fine';
      if (lstat(f)) continue; // somebody else's hydor: left alone
      try {
        writeFileAtomic(f, text, 0o755);
        return `linked ${tilde(dir)}`;
      } catch {}
    }
  }

  // None: ~/.local/bin, and the PATH of new terminals gets it.
  const f = path.join(localBin, 'hydor');
  if (lstat(f) && !isShim(f) && !isOldLink(f)) return `skipped: ${tilde(f)} is something else`;
  fs.mkdirSync(localBin, { recursive: true });
  writeFileAtomic(f, text, 0o755);
  if (known && dirs.includes(localBin) && before(localBin)) return 'linked ~/.local/bin';
  const rc = startupFile(shell, home, env, first.shadow >= 0);
  if (!rc) return `linked ~/.local/bin (no startup file to change for ${path.basename(String(shell || '')) || 'this shell'})`;
  try {
    return `linked ~/.local/bin + ${tilde(addToPath(rc))}`;
  } catch (e) {
    return `linked ~/.local/bin (${tilde(rc.file)} could not be changed: ${(e && e.code) || e})`;
  }
}

// ---- Windows: hydor.cmd ---------------------------------------------------------------------------------------------

const toWin = (p) => String(p).replace(/\//g, '\\');
/** What a path is in a .cmd file: in %LOCALAPPDATA% where it is (the file stays plain ASCII for a user name that is not), and % doubled (cmd reads %%). */
function cmdPath(p, localAppData) {
  const w = toWin(p);
  if (/["\r\n\0!]/.test(w)) throw new Error('a path with a character a .cmd file cannot hold (a quote, a ! or a line break)');
  const la = toWin(localAppData || '').replace(/\\+$/, '');
  const under = la && w.toLowerCase().startsWith(`${la.toLowerCase()}\\`);
  const out = under ? `%LOCALAPPDATA%${w.slice(la.length).replace(/%/g, '%%')}` : w.replace(/%/g, '%%');
  if (/[^\x20-\x7e]/.test(out)) throw new Error('a path with characters outside ASCII, which a .cmd file reads in the console’s code page');
  return out;
}

/**
 * The shim hydor.cmd: sets HYDOR_APP_OPEN (the app's program, which `hydor` starts when the app is closed) for its own run
 * only, then runs the copy's node.exe on its cli.js, as the launcher bin\hydor.cmd does (not through it: `call` would read
 * the % and ^ of a path a second time), and gives the exit code back. Every path is in quotes, with % doubled.
 */
function cmdShimText(launcher, open, localAppData) {
  const root = path.dirname(path.dirname(launcher));
  const node = cmdPath(path.join(root, 'node', 'node.exe'), localAppData);
  const cli = cmdPath(path.join(root, 'server', 'dist', 'server', 'cli.js'), localAppData);
  const app = cmdPath(open, localAppData);
  return `${[
    '@echo off',
    `rem ${SHIM_MARK}`,
    'rem The Hydor app writes this file each time it starts, so it names the version that runs now: changes made here are lost.',
    'setlocal',
    `set "HYDOR_APP_OPEN=${app}"`,
    `"${node}" "${cli}" %*`,
    'exit /b %ERRORLEVEL%',
  ].join('\r\n')}\r\n`;
}

/** What `reg query HKCU\Environment /v Path` prints → { type, value } (null when there is no such value). */
function parseRegQuery(text) {
  const m = /^[ \t]+(\S+)[ \t]+(REG_[A-Z_]+)[ \t]*(.*?)\r?$/m.exec(String(text || ''));
  return m ? { type: m[2], value: m[3] } : null;
}

/** The user's Path value in the registry, read and written with reg.exe (never [Environment]::SetEnvironmentVariable: it expands %VAR% entries for good). */
function windowsRegistry(env = process.env) {
  const { execFile, execFileSync } = require('node:child_process');
  const system32 = path.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32');
  const reg = path.join(system32, 'reg.exe');
  const KEY = 'HKCU\\Environment';
  return {
    get() {
      let out;
      try {
        out = execFileSync(reg, ['query', KEY, '/v', 'Path'], { windowsHide: true, timeout: 20_000, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (e) {
        if (e && e.status === 1) return null; // no Path value
        throw e;
      }
      // reg.exe writes in the console's code page: a value that is not plain ASCII cannot be given back as it was.
      const text = out.toString('latin1');
      if (/[^\x09\x0a\x0d\x20-\x7e]/.test(text)) throw new Error('your user Path has characters outside ASCII, which reg.exe cannot give back safely');
      return parseRegQuery(text);
    },
    set(type, value) {
      execFileSync(reg, ['add', KEY, '/v', 'Path', '/t', type, '/d', value, '/f'], { windowsHide: true, timeout: 20_000, stdio: 'ignore' });
    },
    // Programs that are running (Explorer, new terminals) read the environment again.
    broadcast() {
      const ps = [
        "Add-Type -Namespace Hydor -Name Native -MemberDefinition '[DllImport(\"user32.dll\", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'",
        '$r = [UIntPtr]::Zero',
        "[Hydor.Native]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r) | Out-Null",
      ].join('; ');
      execFile(path.join(system32, 'WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 30_000 }, () => {});
    },
  };
}

/** Adds `dir` to the user's Path once, keeping the value's type and every entry. 'added' or 'there'; throws when it cannot be done safely. */
function ensureUserPath(registry, dir, env) {
  const key = (v) => toWin(v).trim().replace(/^"(.*)"$/, '$1').replace(/\\+$/, '').toLowerCase();
  const expand = (v) => String(v).replace(/%([^%]+)%/g, (all, n) => env[Object.keys(env).find((k) => k.toUpperCase() === n.toUpperCase()) ?? ''] ?? all);
  const cur = registry.get();
  const entries = cur && cur.value ? cur.value.split(';') : [];
  if (entries.some((e) => key(e) === key(dir) || key(expand(e)) === key(dir))) return 'there';
  if (cur && cur.type !== 'REG_SZ' && cur.type !== 'REG_EXPAND_SZ') throw new Error(`your user Path is a ${cur.type}, not text`);
  const type = cur ? cur.type : 'REG_EXPAND_SZ';
  const value = cur && cur.value ? `${cur.value.replace(/;+$/, '')};${toWin(dir)}` : toWin(dir);
  registry.set(type, value);
  const now = registry.get();
  if (!now || now.type !== type || now.value !== value) {
    // Not what was written: put back what was there.
    if (cur) registry.set(cur.type, cur.value);
    throw new Error('the user Path did not read back as written');
  }
  try {
    registry.broadcast();
  } catch {}
  return 'added';
}

/**
 * Windows: hydor.cmd, the shim, in %LOCALAPPDATA%\Microsoft\WindowsApps when that is on the PATH (as it is by default on
 * Windows 10 and 11), else in %LOCALAPPDATA%\Hydor\bin with that folder added to the user's Path in the registry (once, with its
 * type and every entry kept, and running programs told). A hydor on the PATH that is not ours is left alone, all of it.
 *   launcher   the copy's bin\hydor.cmd   loginPath   the PATH (process.env.PATH)   registry   { get, set, broadcast }, for tests
 */
function linkWindows({ launcher, loginPath, env = process.env, open, registry, localAppData }) {
  localAppData ||= env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local');
  const text = cmdShimText(launcher, open, localAppData);
  const fold = (d) => d.toLowerCase();
  const dirs = folders(loginPath, ';', fold);
  const apps = path.join(localAppData, 'Microsoft', 'WindowsApps');
  const mine = path.join(localAppData, 'Hydor', 'bin');
  const find = (dir) => ['hydor.com', 'hydor.exe', 'hydor.bat', 'hydor.cmd'].map((n) => path.join(dir, n)).find((f) => lstat(f)) || '';
  const isOurs = (f) => !!f && /\.cmd$/i.test(f) && head(f).includes(SHIM_MARK);
  const write = (f) => writeFileAtomic(f, text, 0o644);
  const userPath = () => {
    try {
      return ensureUserPath(registry || windowsRegistry(env), mine, env) === 'added' ? ' + the user Path' : '';
    } catch (e) {
      return ` (the user Path could not be changed: ${(e && e.message) || e})`;
    }
  };

  // Someone else's hydor first on the PATH: nothing is touched. Ours first: it says where the app is now.
  for (const dir of dirs) {
    const f = find(dir);
    if (!f) continue;
    if (!isOurs(f)) return `skipped: another hydor on the PATH: ${f}`;
    break;
  }
  let rewritten = false;
  for (const dir of [apps, mine]) {
    const f = path.join(dir, 'hydor.cmd');
    if (isOurs(f)) rewritten = write(f) || rewritten;
  }
  const first = dirs.map(find).find(Boolean);
  if (first) return rewritten ? 'updated' : 'fine';
  // Ours in Hydor\bin from before, which the PATH here does not have yet: it is in the user's Path again, and that is all.
  if (isOurs(path.join(mine, 'hydor.cmd'))) return `${rewritten ? 'updated' : 'fine'}${userPath()}`;
  if (isOurs(path.join(apps, 'hydor.cmd'))) return rewritten ? 'updated' : 'fine';

  if (dirs.some((d) => fold(d) === fold(path.resolve(apps))) && canWrite(apps)) {
    try {
      write(path.join(apps, 'hydor.cmd'));
      return 'linked %LOCALAPPDATA%\\Microsoft\\WindowsApps';
    } catch {}
  }
  fs.mkdirSync(mine, { recursive: true });
  write(path.join(mine, 'hydor.cmd'));
  return `linked %LOCALAPPDATA%\\Hydor\\bin${userPath()}`;
}

/**
 * Makes the `hydor` command work in a new terminal window, whatever the app's kind (see the top of this file).
 *   launcher   the app's bin/hydor (bin\hydor.cmd on Windows), of the copy the server runs from
 *   loginPath  the PATH your login shell gives (on Windows, this process's), or null/'' when it could not be read (then
 *              only ~/.local/bin is used)
 *   open       Linux and Windows: the program that starts the app (the shim names it); without it, a Mac's link is made
 *   appProgram Linux: the app's own program, to know a link to it on the PATH (the .deb's /usr/bin/hydor) from another hydor
 *   registry   Windows: { get(): {type, value}|null, set(type, value), broadcast() } (default: reg.exe), for tests
 *   platform, localAppData   Windows (default: this system's, and %LOCALAPPDATA%), for tests
 *   home, shell, env, candidates   default to this user's own (env: for ZDOTDIR); candidates: the folders to link in, in order
 */
function linkCommand(o = {}) {
  try {
    if (!o.launcher || !fs.existsSync(o.launcher)) return 'skipped: the app has no command inside';
    if ((o.platform || process.platform) === 'win32') return linkWindows(o);
    if (o.open) {
      o.shell ??= (() => {
        try {
          return os.userInfo().shell;
        } catch {
          return '';
        }
      })();
      return linkShim(o);
    }
    return linkSymlink(o);
  } catch (e) {
    return `skipped: ${(e && e.message) || e}`;
  }
}

module.exports = { linkCommand, MARKER, SH_LINE, FISH_LINE, SHIM_MARK, PRE_SH_LINE, PRE_FISH_LINE, parseRegQuery, cmdShimText, shimText, windowsRegistry };

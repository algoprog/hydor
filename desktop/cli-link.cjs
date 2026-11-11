// Puts the `hydor` command on the PATH of a Mac's Terminal, by itself and without a password (plain Node, no Electron:
// main.cjs runs it at each start of the packaged Mac app, and server/desktop-cli-link-test.ts tries it on scratch folders).
// The command is bin/hydor inside the app (stage.sh writes it: it runs the app's own Node.js on the app's own cli.js).
// It never throws, never shows anything, and returns what it did, for the trace:
//   'fine'                           the first `hydor` on the PATH is already this app's (or a script someone wrote by hand)
//   'relinked'                       a link of ours that pointed at where the app used to be points here now
//   'linked <folder>'                a link in a folder on the PATH you can write to
//   'linked ~/.local/bin + <file>'   a link in ~/.local/bin, which that shell's startup file now adds to the PATH
//   'skipped: …'                     it left things as they were, and says why
// What it will not do: write outside your own folders, replace a `hydor` that is not ours, or add to the PATH twice.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** What the startup file says about the line below it: found first, so the line is never added twice. */
const MARKER = '# Added by Hydor: the hydor command';
const SH_LINE = 'case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$PATH:$HOME/.local/bin" ;; esac';
const FISH_LINE = 'contains -- $HOME/.local/bin $PATH; or set -gx PATH $PATH $HOME/.local/bin';
/** A link of ours that went stale ends like this: the app's own launcher, wherever the app was. */
const FROM_AN_APP = '.app/Contents/Resources/bin/hydor';
/** What a script someone wrote by hand to run the app's command mentions. */
const SCRIPT_MENTIONS = '/Contents/Resources/server/dist/server/cli.js';
/** Folders that are the system's own. */
const SYSTEM = [/^\/usr\/bin(\/|$)/, /^\/bin(\/|$)/, /^\/usr\/sbin(\/|$)/, /^\/sbin(\/|$)/, /^\/System(\/|$)/, /^\/Library\/Apple(\/|$)/, /^\/usr\/libexec(\/|$)/];
/**
 * Folders that belong to one version of something (a Node.js, a Python…): a link there goes when the version does, and
 * these are often first on the PATH.
 */
const PER_VERSION = /\/(\.nvm|\.fnm|\.volta|\.asdf|\.pyenv|\.rbenv|\.rustup|\.sdkman|\.conda|\.venv|venv|miniconda\d*|anaconda\d*|node_modules|mise)(\/|$)/;

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
const folders = (p) => [...new Set(String(p || '').split(path.delimiter).filter((d) => d && path.isAbsolute(d)).map((d) => path.resolve(d)))];

/** Whether a link may go in this folder, whoever's it is: yours, not in an app, not the system's, not one version's. */
const fit = (dir) => !dir.includes('.app/') && !dir.endsWith('.app') && !SYSTEM.some((r) => r.test(dir)) && !PER_VERSION.test(dir + '/') && canWrite(dir);

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
function startupFile(shell, home, env) {
  const name = path.basename(String(shell || ''));
  if (name === 'zsh') return { file: path.join(env.ZDOTDIR || home, '.zprofile'), line: SH_LINE };
  if (name === 'bash') {
    for (const f of ['.bash_profile', '.bash_login', '.profile']) if (lstat(path.join(home, f))) return { file: path.join(home, f), line: SH_LINE };
    return { file: path.join(home, '.bash_profile'), line: SH_LINE };
  }
  if (name === 'fish') return { file: path.join(home, '.config/fish/conf.d/hydor.fish'), line: FISH_LINE, own: true };
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
 * Makes the `hydor` command work in a new Terminal window.
 *   launcher   the app's bin/hydor
 *   loginPath  the PATH your login shell gives, or null/'' when it could not be read (then only ~/.local/bin is used)
 *   home, shell, env   default to this user's own (env: for ZDOTDIR)
 */
function linkCommand({ launcher, loginPath, home = os.homedir(), shell, env = process.env } = {}) {
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

    // Already fine: the first hydor a shell finds is this app's, or a script of the user's.
    if (known && first(dirs, launcher) === 'fine') return 'fine';

    // A link of ours that went stale (the app moved): pointed here, wherever the PATH or the usual folders have it.
    let relinked = false;
    for (const dir of new Set([...dirs, '/usr/local/bin', '/opt/homebrew/bin', localBin, path.join(home, 'bin')])) {
      const f = path.join(dir, 'hydor');
      if (!isStale(f, launcher) || !canWrite(dir)) continue;
      try {
        link(f, launcher);
        relinked = true;
      } catch {}
    }
    if (relinked && (!known || first(dirs, launcher) === 'fine')) return 'relinked';

    // A folder on the PATH that is yours to write in.
    if (known) {
      for (const dir of dirs) {
        const f = path.join(dir, 'hydor');
        if (!fit(dir)) continue;
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

module.exports = { linkCommand, MARKER, SH_LINE, FISH_LINE };

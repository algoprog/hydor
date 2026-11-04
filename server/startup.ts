// Whether the app comes back when this computer starts: as a systemd service of your user (lingering,
// so it starts before anyone logs in), as a system service, or by Docker's restart policy. On by
// default: a copy started by hand from a git install sets up its user service the first time it runs.
// In the desktop apps it is a login item that opens the app in the background when you log in, on from its first
// start as well: a launch agent on a Mac, your account's Run key on Windows, an autostart entry on Linux.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { StartupState } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { APP_ROOT } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { desktop } from './desktop.ts';
import { ENV_FILE, UNIT, UNIT_DIR, UNIT_PATH, unitText } from './service.ts';

const user = os.userInfo().username;
function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000, windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** The systemd unit this process runs in, and whether it is the user's or the system's. */
function ownUnit(): { unit: string; user: boolean } | null {
  if (!process.env.INVOCATION_ID) return null;
  try {
    const cg = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const unit = /([^/\s]+\.service)\s*$/m.exec(cg)?.[1];
    return unit ? { unit, user: cg.includes('/user@') } : null;
  } catch {
    return null;
  }
}
const inDocker = () => fs.existsSync('/.dockerenv') || (process.env.HYDOR_RESTARTS ?? process.env.AGENT_CONSOLE_RESTARTS) === '1';
const lingers = () => /Linger=yes/.test(run('loginctl', ['show-user', user, '-p', 'Linger']).out);

/** The Mac app's launch agent: opens the app, without its window, when you log in. */
const PLIST = path.join(os.homedir(), 'Library/LaunchAgents/com.hydor.app.plist');
const xml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plistText = (app: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.hydor.app</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/open</string><string>-g</string><string>-a</string><string>${xml(app)}</string><string>--args</string><string>--hidden</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`;
/** Windows: the Run key of your account opens the app, without its window, when you sign in. */
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const runValue = (app: string) => `"${app}" --hidden`;
/** Linux: an autostart entry, which the desktop opens when you log in. */
const AUTOSTART = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'hydor.desktop');
const desktopEntry = (app: string) => `[Desktop Entry]
Type=Application
Name=Hydor
Comment=Opens Hydor in the background when you log in
Exec="${app.replace(/(["`$\\])/g, '\\$1')}" --hidden
Icon=hydor
Terminal=false
X-GNOME-Autostart-enabled=true
`;

/** What the login item opens now, or null when there is none. */
function loginItem(): string | null {
  try {
    if (desktop!.platform === 'mac') return fs.readFileSync(PLIST, 'utf8');
    if (desktop!.platform === 'linux') return fs.readFileSync(AUTOSTART, 'utf8');
  } catch {
    return null;
  }
  const r = run('reg', ['query', RUN_KEY, '/v', 'Hydor']);
  return r.ok ? r.out : null;
}

/** Whether the login item opens the app where it is now. */
const loginItemHere = (item: string) => item.includes(desktop!.platform === 'mac' ? `<string>${xml(desktop!.app)}</string>` : desktop!.app);

function setLoginItem(on: boolean) {
  const app = desktop!.app;
  if (desktop!.platform === 'windows') {
    const r = on ? run('reg', ['add', RUN_KEY, '/v', 'Hydor', '/t', 'REG_SZ', '/d', runValue(app), '/f']) : run('reg', ['delete', RUN_KEY, '/v', 'Hydor', '/f']);
    if (on && !r.ok) throw new HttpError(500, `Could not add Hydor to the programs Windows opens when you sign in: ${r.out.split('\n').pop()}`);
    return;
  }
  const file = desktop!.platform === 'mac' ? PLIST : AUTOSTART;
  if (!on) return fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, desktop!.platform === 'mac' ? plistText(app) : desktopEntry(app));
}

export function startupState(): StartupState {
  if (desktop) return { on: loginItem() !== null, how: 'login-item', can: true, platform: desktop.platform };
  if (inDocker()) return { on: true, how: 'docker', can: false };
  const own = ownUnit();
  if (own && !own.user) return { on: run('systemctl', ['is-enabled', own.unit]).out === 'enabled', how: 'system-service', unit: own.unit, can: true };
  const unit = own?.user ? own.unit : fs.existsSync(UNIT_PATH) ? UNIT : null;
  if (unit) return { on: run('systemctl', ['--user', 'is-enabled', unit]).out === 'enabled', how: 'user-service', unit, linger: lingers(), can: true };
  return { on: false, how: 'none', can: process.platform === 'linux' && run('systemctl', ['--user', 'show-environment']).ok };
}

/** A user's services start at boot, before anyone logs in, once it lingers; your own account may usually set that. */
const enableLinger = () => lingers() || run('loginctl', ['enable-linger', user]).ok || run('sudo', ['-n', 'loginctl', 'enable-linger', user]).ok;

/** The user service for a copy started by hand, with the settings this process runs with, so it starts the same way. */
function install() {
  const keep = ['PORT', 'HOST', 'DATA_DIR', 'ALLOWED_ORIGINS', 'DEFAULT_CWD', 'IDLE_STOP_HOURS', 'CLAUDE_BIN', 'CODEX_BIN', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  let env = '';
  try {
    env = fs.readFileSync(ENV_FILE, 'utf8');
  } catch {}
  const add = keep.filter((k) => process.env[k] && !new RegExp(`^\\s*${k}\\s*=`, 'm').test(env)).map((k) => `${k}=${process.env[k]}`);
  if (add.length) {
    fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
    fs.appendFileSync(ENV_FILE, `${env && !env.endsWith('\n') ? '\n' : ''}${add.join('\n')}\n`, { mode: 0o600 });
  }
  fs.mkdirSync(UNIT_DIR, { recursive: true });
  fs.writeFileSync(UNIT_PATH, unitText(APP_ROOT));
  run('systemctl', ['--user', 'daemon-reload']);
}

export function setStartup(on: boolean): StartupState {
  const st = startupState();
  if (st.how === 'login-item') {
    setLoginItem(on);
    return startupState();
  }
  if (st.how === 'docker') throw new HttpError(400, 'In Docker, its restart policy decides: restart: unless-stopped in compose.yaml, or docker run --restart unless-stopped');
  if (st.how === 'system-service') {
    if (!run('sudo', ['-n', 'systemctl', on ? 'enable' : 'disable', st.unit!]).ok) throw new HttpError(403, `The system service needs root: sudo systemctl ${on ? 'enable' : 'disable'} ${st.unit}`);
    return startupState();
  }
  if (st.how === 'none') {
    if (!on) return st;
    if (!st.can) throw new HttpError(400, 'There is no systemd for your user here: start the app with your system’s own tools, or use Docker');
    install();
  }
  const unit = st.unit ?? UNIT;
  const r = run('systemctl', ['--user', on ? 'enable' : 'disable', unit]);
  if (!r.ok) throw new HttpError(500, `Could not ${on ? 'enable' : 'disable'} ${unit}: ${r.out.split('\n').pop()}`);
  if (on) enableLinger();
  return startupState();
}

/** On by default: the first run of a copy started by hand from a git install sets up its service (not test copies). */
export function startupDefault(db: DB) {
  // The app may have moved since (to Applications, say): the login item opens it where it is now.
  if (desktop) {
    const item = loginItem();
    if (item !== null && !loginItemHere(item)) setLoginItem(true);
  }
  if (kvGet(db, 'startup.default')) return;
  kvSet(db, 'startup.default', String(Date.now()));
  const st = startupState();
  if (desktop && st.how === 'login-item' && !st.on && desktop.updatable) {
    setLoginItem(true);
    return console.log('[hydor] It now opens when you log in; turn that off in Settings → General.');
  }
  if (st.how !== 'none' || !st.can || process.env.NODE_ENV === 'development') return;
  if (!fs.existsSync(path.join(APP_ROOT, '.git')) || APP_ROOT.startsWith(os.tmpdir())) return;
  try {
    setStartup(true);
    console.log(`[hydor] It now starts when this computer starts (${UNIT}); turn that off in Settings → General.`);
  } catch (e) {
    console.warn(`[hydor] Could not set it up to start with this computer: ${(e as Error).message}`);
  }
}

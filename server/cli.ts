// The `hydor` command (bin/hydor.mjs runs this file). Without a command, or with one of the terminal's (chat, run,
// resume, sessions, show, send, stop, models, tiers, agents, tasks, usage, status, serve, open), it is Hydor in a
// terminal: server/tui/main.ts, loaded only then. Maintenance commands, run on the host:
//   node dist/server/cli.js set-password        prompts; resets the web password, signs everyone out, lifts sign-in pauses
//   node dist/server/cli.js setup-token         prints the one-time token for first setup
//   node dist/server/cli.js access-token [name] prints a new token for another Hydor to use this machine
//   node dist/server/cli.js service install     runs the app as a systemd user service (no root needed)
//   node dist/server/cli.js service uninstall | status | logs
//   node dist/server/cli.js update              pulls the latest code, builds it and restarts the service
//   node dist/server/cli.js app …               templates: new, folder, dev, try, export, import (server/apps/cli.ts)
//   node dist/server/cli.js completion [shell]  prints Tab completion for bash, zsh or fish; `completion install` sets it up
//   node dist/server/cli.js __complete -- …     (hidden) what the completion scripts ask for: candidates, quick and quiet
// `<maintenance command> --help` shows that command's help and runs nothing.
import './env-compat.ts';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ENV_FILE, UNIT, UNIT_PATH, unitText } from './service.ts';
import { helpText, MAINTENANCE, subCommandError } from './tui/args.ts';
import { asciify, asciiWanted, colorWanted, makePaint } from './tui/term.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const [cmd, sub] = process.argv.slice(2);

// The service's settings (PORT, DATA_DIR…) apply here too, so commands act on the same data.
try {
  for (const l of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(l);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}

if (cmd && MAINTENANCE.includes(cmd) && process.argv.slice(3).some((a) => a === '-h' || a === '--help')) {
  const help = helpText(makePaint(colorWanted(process.stdout, process.argv.includes('--no-color'))), cmd);
  process.stdout.write(`${help && asciiWanted(process.env, process.platform, process.stdout) ? asciify(help) : help}\n`);
  process.exit(0);
}

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    (rl as any)._writeToOutput = (s: string) => {
      if (s.includes(q)) process.stdout.write(q);
    };
    rl.question(q, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

/** Runs a command where you can see it; stops here when it fails. */
function run(bin: string, args: string[], cwd = ROOT) {
  console.log(`$ ${bin} ${args.join(' ')}`);
  const r = spawnSync(bin, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`${bin} failed${r.status != null ? ` (exit ${r.status})` : ''}.`);
    process.exit(r.status || 1);
  }
}

const systemctl = (...args: string[]) => spawnSync('systemctl', ['--user', ...args], { stdio: 'inherit' }).status ?? 1;

async function auth() {
  const { AuthManager } = await import('./auth.ts');
  const { ensureDirs } = await import('./config.ts');
  const { openDb } = await import('./db.ts');
  ensureDirs();
  const db = openDb();
  return { db, auth: new AuthManager(db) };
}

if (cmd === 'set-password') {
  const { db, auth: a } = await auth();
  const { validatePassword } = await import('./auth.ts');
  const { paths } = await import('./config.ts');
  const pw = await ask('New password: ');
  const again = await ask('Repeat: ');
  if (pw !== again) {
    console.error('Passwords differ.');
    process.exit(1);
  }
  validatePassword(pw);
  fs.rmSync(paths.auth, { force: true });
  const token = a.setupToken()!;
  await a.setup(token, pw);
  db.prepare('delete from auth_sessions').run();
  a.clearTries();
  console.log('Password set. All browsers were signed out, and addresses paused after wrong passwords may sign in again.');
} else if (cmd === 'setup-token') {
  const { auth: a } = await auth();
  const t = a.setupToken();
  console.log(t ?? 'A password is already set (use set-password to reset it).');
} else if (cmd === 'access-token') {
  // For another machine's Hydor (its Settings → Machines): it can then do all you can here.
  const { db } = await auth();
  const { createAccessToken } = await import('./machines.ts');
  console.log(createAccessToken(db, process.argv.slice(3).join(' ') || 'Another machine').token);
} else if (cmd === 'service' && sub === 'install') {
  if (process.env.HYDOR_APP_BUNDLE) {
    console.error('The Hydor app already runs the server (and keeps it running): there is nothing to install.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, 'dist/server/index.js'))) {
    console.error('Build it first: npm ci && npm run build');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(UNIT_PATH), { recursive: true });
  fs.writeFileSync(UNIT_PATH, unitText(ROOT));
  console.log(`Wrote ${UNIT_PATH}`);
  if (systemctl('daemon-reload') !== 0 || systemctl('enable', '--now', UNIT) !== 0) process.exit(1);
  // Without lingering, user services stop when you log out.
  const linger = spawnSync('loginctl', ['enable-linger', os.userInfo().username], { stdio: 'ignore' }).status === 0;
  console.log(`\nHydor runs as a service of your user${linger ? ', also while you are logged out' : ''}.`);
  if (!linger) console.log(`To keep it running after you log out: sudo loginctl enable-linger ${os.userInfo().username}`);
  const { auth: a } = await auth();
  const t = a.setupToken();
  const port = process.env.PORT ?? '8790';
  if (t) console.log(`\nFirst time? Open http://localhost:${port}/setup?token=${t} and choose a password.`);
  else console.log(`\nOpen http://localhost:${port}`);
} else if (cmd === 'service' && sub === 'uninstall') {
  systemctl('disable', '--now', UNIT);
  fs.rmSync(UNIT_PATH, { force: true });
  systemctl('daemon-reload');
  const { config } = await import('./config.ts');
  console.log(`Removed the service. Your data (${config.dataDir}) and running agents stay.`);
} else if (cmd === 'service' && sub === 'status') {
  process.exit(systemctl('status', '--no-pager', UNIT));
} else if (cmd === 'service' && sub === 'logs') {
  spawnSync('journalctl', ['--user', '-u', UNIT, '-n', '200', '--no-pager'], { stdio: 'inherit' });
} else if (cmd === '__complete') {
  const { completeCommand } = await import('./tui/completion.ts');
  await completeCommand(process.argv.slice(3));
} else if (cmd === 'completion') {
  const { completionCommand } = await import('./tui/completion.ts');
  process.exitCode = completionCommand(process.argv.slice(3));
} else if (cmd === 'app') {
  const { appCommand } = await import('./apps/cli.ts');
  try {
    process.exitCode = await appCommand(process.argv.slice(3));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
} else if (cmd === 'update') {
  if (process.env.HYDOR_APP_BUNDLE) {
    console.error('The Hydor app updates itself: choose Hydor → Check for Updates…');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('This copy was not installed from git; download the new version instead.');
    process.exit(1);
  }
  const before = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
  run('git', ['pull', '--ff-only']);
  const after = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
  if (before === after) {
    console.log('Already up to date.');
    process.exit(0);
  }
  const changed = execFileSync('git', ['diff', '--name-only', before, after], { cwd: ROOT }).toString();
  if (/^(package-lock\.json|package\.json)$/m.test(changed)) run('npm', ['ci']);
  run('npm', ['run', 'build']);
  if (fs.existsSync(UNIT_PATH)) {
    // Agents keep running across the restart; the server reconnects to them.
    systemctl('restart', UNIT);
    console.log('Updated and restarted.');
  } else console.log('Updated. Restart the server to use the new version (running agents are not interrupted).');
} else if (cmd === 'service') {
  console.error(subCommandError('service', sub));
  process.exitCode = 2;
} else {
  // Everything else is Hydor in a terminal (with no command at all, the chat).
  const { tuiCommand } = await import('./tui/main.ts');
  const code = await tuiCommand(process.argv.slice(2));
  process.exitCode = code;
  // Whatever still holds the process (a socket closing, a timer) does not keep it from ending.
  setTimeout(() => process.exit(code), 300).unref();
}

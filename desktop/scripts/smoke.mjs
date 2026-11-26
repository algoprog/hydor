// Checks a packed desktop app: its Node.js runs its server, which answers, with its native modules and (on macOS and
// Linux) its tmux working. A Mac app's signature must check out too. The server must also have written the launchers of
// the three command-line tools every agent gets on its PATH (waitfor, edits, sym: server/shelltools), and they must run
// from a shell with no node on its PATH, as an agent's shell runs them (on Windows, in Git's bash).
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
  // On Windows kill() stops the server alone, and the programs it started would go on (it asks Claude Code and Codex for
  // their models as it starts, working in data\probe), holding the folders they work in: the whole tree goes, as
  // launch-test.mjs stops the app. The app itself asks its server to stop over its channel, so the server stops them.
  try {
    if (WIN && server?.pid) execFileSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    else server?.kill();
  } catch {
    try {
      server?.kill();
    } catch {}
  }
  if (!WIN) {
    try {
      execFileSync(tmux, ['-S', path.join(data, 'tmux.sock'), 'kill-server'], { stdio: 'ignore' });
    } catch {}
  }
  // Windows lets go of a stopped program's files a moment later. A scratch folder left behind is no fault of the app.
  setTimeout(
    () => {
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch (e) {
        console.warn(`Could not remove ${tmp} (${e.code ?? e.message}); left for the system to clear.`);
      }
    },
    WIN ? 1000 : 0,
  );
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
  env: { ...process.env, DATA_DIR: data, PORT: String(port), NODE_ENV: 'production', HYDOR_ROOT: path.join(tmp, 'server'), PATH, HYDOR_EMBED: 'off', HYDOR_SUGGEST: 'off' },
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
    try {
      await shellTools();
      cleanup();
    } catch (e) {
      console.error(text().split('\n').filter((l) => l.includes('[shelltools]')).join('\n'));
      fail(e.message);
    }
  }
}

/**
 * The agents' tools through the launchers the server wrote in its data folder, in a shell whose PATH has them and the
 * system's own folders, never node: `--help` of each, then edits changing a file and sym reading a TypeScript file with
 * its bundled parser.
 */
async function shellTools() {
  const bin = path.join(data, 'shelltools', 'bin');
  const tools = ['waitfor', 'edits', 'sym'];
  for (let i = 0; i < 60 && !tools.every((t) => fs.existsSync(path.join(bin, t))); i++) await new Promise((r) => setTimeout(r, 500));
  for (const t of tools) if (!fs.existsSync(path.join(bin, t))) throw new Error(`The server wrote no launcher for ${t} in ${bin}`);
  let bash = '/bin/bash';
  let PATH = `${bin}:/usr/bin:/bin`;
  if (WIN) {
    // Git's bash, as the app finds it (server/platform.ts); its commands are in …\Git\usr\bin.
    const candidates = [process.env.CLAUDE_CODE_GIT_BASH_PATH, ...[process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean).map((p) => path.join(p, 'Git', 'bin', 'bash.exe'))];
    bash = candidates.find((c) => c && fs.existsSync(c));
    if (!bash) throw new Error("Git's bash is not on this computer, so the tools cannot be tried the way agents run them.");
    PATH = [bin, path.resolve(path.dirname(bash), '..', 'usr', 'bin'), path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32')].join(';');
  }
  const work = path.join(tmp, 'tools-work');
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, 'check.ts'), 'export function greet(name: string) {\n  return `hello ${name}`;\n}\n');
  fs.writeFileSync(path.join(work, 'note.txt'), 'one\ntwo\n');
  const env = { PATH, HOME: work, TMPDIR: work, TEMP: work, TMP: work, LANG: 'C.UTF-8', ...(WIN ? { SystemRoot: process.env.SystemRoot, windir: process.env.windir, ComSpec: process.env.ComSpec } : {}) };
  const sh = (line, input) => execFileSync(bash, ['-c', line], { cwd: work, env, input, encoding: 'utf8', timeout: 60_000, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const expect = (what, line, want, input) => {
    let out;
    try {
      out = sh(line, input);
    } catch (e) {
      throw new Error(`${what}: \`${line}\` failed (${e.status ?? e.code}): ${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`);
    }
    if (!want.test(out)) throw new Error(`${what}: \`${line}\` printed:\n${out}`);
    console.log(`${what}: ok`);
  };
  if (sh('command -v node || true').trim()) throw new Error('The shell used for the tools has a node on its PATH: it would prove nothing.');
  expect('waitfor', 'waitfor --help', /waitfor/);
  expect('edits', 'edits --help', /edits/);
  expect('sym (its parser)', 'sym --outline check.ts', /\b1-3\b.*\bgreet\b/);
  expect('edits (changes a file)', 'edits', /note\.txt/, '=== note.txt\n<<<<<<< SEARCH\ntwo\n=======\n2\n>>>>>>> REPLACE\n');
  if (fs.readFileSync(path.join(work, 'note.txt'), 'utf8').replace(/\r/g, '') !== 'one\n2\n') throw new Error('edits did not change the file.');
  // The launcher runs the app's own Node.js, wherever the app is.
  const launcher = fs.readFileSync(path.join(bin, 'sym'), 'utf8');
  if (!launcher.includes('agent-tools')) throw new Error(`The launcher does not name the tool:\n${launcher}`);
  console.log('The agents’ command-line tools run through their launchers.');
}

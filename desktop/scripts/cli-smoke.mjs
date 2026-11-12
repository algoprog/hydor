// Checks the `hydor` command of a packed desktop app, on each system:
//   (a) the app's own launcher (bin/hydor, bin/hydor.cmd on Windows) runs and prints the command's help;
//   (b) desktop/cli-link.cjs (what the app runs at each start) puts the command on a PATH, on scratch folders (a HOME of
//       its own and, on Windows, a LOCALAPPDATA of its own with a fake registry: the runner's own are never touched), and
//       `hydor help` runs through what it made: the link on a Mac, the shim on Linux, hydor.cmd on Windows, in WindowsApps
//       and then in Hydor\bin with the user's Path (which the fake registry holds).
//   node desktop/scripts/cli-smoke.mjs dist/mac-arm64/Hydor.app    (dist/mac/ on Intel)
//   node desktop/scripts/cli-smoke.mjs dist/win-unpacked
//   node desktop/scripts/cli-smoke.mjs dist/linux-unpacked          (dist/linux-arm64-unpacked on ARM)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const app = process.argv[2] && path.resolve(process.argv[2]);
if (!app || !fs.existsSync(app)) {
  console.error('usage: node cli-smoke.mjs <the packed app: Hydor.app, win-unpacked or linux-unpacked>');
  process.exit(2);
}
const MAC = process.platform === 'darwin';
const WIN = process.platform === 'win32';
const res = MAC ? path.join(app, 'Contents/Resources') : path.join(app, 'resources');
const launcher = path.join(res, 'bin', WIN ? 'hydor.cmd' : 'hydor');
// The program that opens the app (the shim names it; `help` never starts it).
const program = MAC ? path.join(app, 'Contents/MacOS/Hydor') : WIN ? path.join(app, 'Hydor.exe') : path.join(app, 'hydor');
const { linkCommand } = createRequire(import.meta.url)('../cli-link.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-cli-'));
const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
const fail = (why) => {
  console.error(why);
  cleanup();
  process.exit(1);
};
const data = path.join(tmp, 'data');
fs.mkdirSync(data);

/** Runs `hydor help` the way a terminal would: `line` is what is typed, run by the system's own shell with this environment. */
function typed(line, env) {
  const all = { ...process.env, ...env, DATA_DIR: data, HYDOR_EMBED: 'off', CUDA_VISIBLE_DEVICES: '' };
  delete all.HYDOR_APP_OPEN;
  const opts = { cwd: tmp, env: all, encoding: 'utf8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true };
  // cmd.exe reads the whole line in its outer quotes (/s), as a console does; /d leaves its AutoRun out.
  if (WIN) return execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...opts, windowsVerbatimArguments: true });
  return execFileSync('/bin/sh', ['-c', line], opts);
}
function expectHelp(what, line, env) {
  let out;
  try {
    out = typed(line, env);
  } catch (e) {
    fail(`${what}: \`${line}\` failed (${e.status ?? e.code}): ${e.stdout ?? ''}${e.stderr ?? ''}${e.message}`);
  }
  if (!out.includes('Usage: hydor')) fail(`${what}: \`${line}\` did not print the help:\n${out}`);
  console.log(`${what}: ok`);
}

if (!fs.existsSync(launcher)) fail(`The app has no command inside: ${launcher}`);

// (a) The app's own launcher.
expectHelp("The app's own launcher", WIN ? `"${launcher}" help` : `'${launcher.replace(/'/g, "'\\''")}' help`);

// (b) What the app does at each start, on scratch folders.
const home = path.join(tmp, 'home');
fs.mkdirSync(home);
if (WIN) {
  // A registry of our own: the user's Path as a value with its type, and what is done to it.
  const fakeRegistry = (value) => {
    const r = { value, sets: [], broadcasts: 0, get: () => (r.value ? { ...r.value } : null), set: (type, v) => (r.sets.push(v), (r.value = { type, value: v })), broadcast: () => r.broadcasts++ };
    return r;
  };
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  for (const where of ['WindowsApps', 'Hydor\\bin']) {
    const la = path.join(tmp, where === 'WindowsApps' ? 'local-apps' : 'local-mine');
    const apps = path.join(la, 'Microsoft', 'WindowsApps');
    fs.mkdirSync(where === 'WindowsApps' ? apps : la, { recursive: true });
    const registry = fakeRegistry({ type: 'REG_EXPAND_SZ', value: '%USERPROFILE%\\bin;C:\\tools' });
    const env = { LOCALAPPDATA: la };
    const did = linkCommand({ launcher, open: program, loginPath: [...(where === 'WindowsApps' ? [apps] : []), system].join(';'), env, registry, localAppData: la });
    console.log(`The hydor command (${where}): ${did}`);
    const shim = path.join(where === 'WindowsApps' ? apps : path.join(la, 'Hydor', 'bin'), 'hydor.cmd');
    if (!fs.existsSync(shim)) fail(`No shim in ${shim}: ${did}`);
    if (where === 'WindowsApps' && (registry.sets.length || registry.broadcasts)) fail('The user Path was changed with WindowsApps on the PATH.');
    if (where !== 'WindowsApps') {
      const added = path.join(la, 'Hydor', 'bin');
      if (registry.sets.length !== 1 || registry.value.type !== 'REG_EXPAND_SZ' || registry.value.value !== `%USERPROFILE%\\bin;C:\\tools;${added}`) fail(`The user Path is not as it should be: ${JSON.stringify(registry.value)}`);
      // The next start does not add it again.
      linkCommand({ launcher, open: program, loginPath: system, env, registry, localAppData: la });
      if (registry.sets.length !== 1) fail('The folder was added to the user Path twice.');
    }
    // A new terminal: its PATH has the folder (as the registry's would give it), and `hydor` is typed as it is.
    const path2 = [where === 'WindowsApps' ? apps : path.join(la, 'Hydor', 'bin'), system].join(';');
    expectHelp(`\`hydor help\` through the shim (${where})`, 'hydor help', { LOCALAPPDATA: la, PATH: path2, Path: path2 });
  }
} else {
  const bin = path.join(home, '.local/bin');
  fs.mkdirSync(bin, { recursive: true });
  const loginPath = `${bin}:/usr/bin:/bin`;
  const did = linkCommand({ launcher, loginPath, home, shell: '/bin/sh', env: {}, candidates: [bin, path.join(home, 'bin')], ...(MAC ? {} : { open: program, appProgram: program }) });
  console.log(`The hydor command: ${did}`);
  const made = path.join(bin, 'hydor');
  if (did !== 'linked ~/.local/bin' || !fs.existsSync(made)) fail(`The command was not put in ~/.local/bin: ${did}`);
  // Run again, as the next start does: nothing to do.
  const again = linkCommand({ launcher, loginPath, home, shell: '/bin/sh', env: {}, candidates: [bin, path.join(home, 'bin')], ...(MAC ? {} : { open: program, appProgram: program }) });
  if (again !== 'fine') fail(`A second run says ${again}, not fine.`);
  expectHelp(`\`hydor help\` through the ${MAC ? 'link' : 'shim'}`, 'hydor help', { PATH: `${bin}:/usr/bin:/bin`, HOME: home });
}
cleanup();
console.log("The app's hydor command works.");

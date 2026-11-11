// The agents' own programs (Claude Code, Codex, Gemini CLI, OpenCode…). One that is missing when it
// is needed (signing in, a session starting, an agent added) is installed with npm into the app's own
// folder, so no administrator rights are needed. Once a day (and on Update now in Settings) each one is
// brought up to its newest version: the app's copies with npm, your own installs with their own updater
// (claude update, codex update, opencode upgrade) or with npm when that is how they came; with Update
// automatically off, the daily run only looks. A new version must then start and answer the way the
// sessions talk to it (Claude Code's and Codex's handshakes, the others' --version), within a minute of the
// computer being awake, or two more on a second start. One that does not is
// undone: the app's copy goes back to the version before, an npm install of yours too, and the sessions
// keep running your Claude Code's previous version, which its installer keeps beside the new one. A
// version that failed is not tried again by itself; the next one is.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClientInfo, ClientUpdateItem, ClientUpdates } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { APP_ROOT, CODEX_TARGET, config, EXE, paths } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { agentBaseEnv } from './env.ts';
import { execProgram, programFile, spawnProgram, which, WIN, withPath } from './platform.ts';
import { LineSplitter } from './runner/frames.ts';

export const CLIENTS_DIR = path.join(config.dataDir, 'clients');
export const CLIENTS_BIN = path.join(CLIENTS_DIR, 'node_modules', '.bin');

/**
 * The npm package of each program the app can install, by the command it runs as; `update`: how your own install updates
 * itself; `with`: programs it needs (installed beside it when not on the PATH); `ignoreScripts`: installed without running
 * the package's install scripts (npm --ignore-scripts); `hidden`: kept current but not listed in Settings.
 */
export const PACKAGES: Record<string, { pkg: string; name: string; update?: string[]; with?: string[]; ignoreScripts?: boolean; hidden?: boolean }> = {
  claude: { pkg: '@anthropic-ai/claude-code', name: 'Claude Code', update: ['update'] },
  codex: { pkg: '@openai/codex', name: 'Codex', update: ['update'] },
  gemini: { pkg: '@google/gemini-cli', name: 'Gemini CLI' },
  opencode: { pkg: 'opencode-ai', name: 'OpenCode', update: ['upgrade'] },
  qwen: { pkg: '@qwen-code/qwen-code', name: 'Qwen Code' },
  auggie: { pkg: '@augmentcode/auggie', name: 'Auggie' },
  // Pi speaks no ACP: the pi-acp adapter runs it, so both are installed (pi itself stays current as its own entry).
  'pi-acp': { pkg: 'pi-acp', name: 'Pi', with: ['pi'], ignoreScripts: true },
  pi: { pkg: '@earendil-works/pi-coding-agent', name: 'Pi (the agent itself)', ignoreScripts: true, hidden: true },
};

const HOUR = 3600_000;
const nodeDir = path.dirname(process.execPath);
const npmBin = fs.existsSync(path.join(nodeDir, 'npm')) ? path.join(nodeDir, 'npm') : 'npm';
/** On Windows, npm's own script beside node.exe, run by it (its npm and npm.cmd need a shell). */
const npmCli = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const VERSION = /\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/;

type Json = Record<string, any>;

const TICK = 1000;
/**
 * setTimeout for time the computer is awake. Node's timers keep counting while a Mac sleeps (libuv reads
 * mach_continuous_time), so a limit that a sleep cuts in two runs out the moment the Mac wakes, though the program
 * it was for slept all along. This one reads the clock every second and counts a longer gap (a sleep, or the app
 * held up) as a second and a half. Returns what stops it; `clock` is for the tests.
 */
export function awakeTimeout(ms: number, fn: () => void, clock: () => number = () => performance.now()): () => void {
  let left = ms;
  let last = clock();
  const t = setInterval(() => {
    const now = clock();
    left -= Math.min(Math.max(now - last, 0), TICK * 1.5);
    last = now;
    if (left > 0) return;
    clearInterval(t);
    fn();
  }, TICK);
  return () => clearInterval(t);
}

/** Runs a program to its end, or for `timeout` ms of the computer awake (then it is stopped: `late`). */
function run(cmd: string, args: string[], timeout: number, env: Record<string, string>): Promise<{ ok: boolean; out: string; stdout: string; late: boolean }> {
  fs.mkdirSync(paths.probe, { recursive: true });
  return new Promise((resolve) => {
    let late = false;
    const child = execProgram(cmd, args, { env, cwd: paths.probe, maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
      stop();
      resolve({ ok: !err, out: `${stdout}\n${stderr}`.trim(), stdout, late });
    });
    // An npm install that a sleep cuts in two carries on after it, rather than being stopped half done.
    const stop = awakeTimeout(timeout, () => {
      late = true;
      child.kill('SIGTERM');
    });
  });
}

/** The app's npm, with the dev packages' NODE_ENV left out. */
function npm(args: string[], timeout: number) {
  const env = withPath(process.env as Record<string, string>, [nodeDir]);
  delete env.NODE_ENV;
  return WIN && fs.existsSync(npmCli) ? run(process.execPath, [npmCli, ...args], timeout, env) : run(npmBin, args, timeout, env);
}

/** The last few lines of a program's output. */
const tail = (out: string) =>
  out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' · ')
    .slice(0, 300) || 'no output';

const readJson = (file: string): Json | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const realpath = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
};

/** Whether version a is newer than b (a release is newer than its own pre-releases). */
export function newer(a: string, b: string): boolean {
  const [x, xPre = ''] = a.split(/-(.*)/s);
  const [y, yPre = ''] = b.split(/-(.*)/s);
  const xs = x.split('.').map((n) => parseInt(n) || 0);
  const ys = y.split('.').map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) if ((xs[i] ?? 0) !== (ys[i] ?? 0)) return (xs[i] ?? 0) > (ys[i] ?? 0);
  if (!xPre || !yPre) return !xPre && !!yPre;
  return xPre.localeCompare(yPre, 'en', { numeric: true }) > 0;
}

/** The version the app installed of a program, if it did. */
export const managedVersion = (cmd: string): string | null => (PACKAGES[cmd] ? (readJson(path.join(CLIENTS_DIR, 'node_modules', PACKAGES[cmd].pkg, 'package.json'))?.version ?? null) : null);
const managedBin = (cmd: string) => (WIN ? programFile(path.join(CLIENTS_BIN, cmd)) : fs.existsSync(path.join(CLIENTS_BIN, cmd)) ? path.join(CLIENTS_BIN, cmd) : null);
const bundledCodex = (): string | null => readJson(path.join(APP_ROOT, 'node_modules/@openai/codex/package.json'))?.version ?? null;

/** A command on the agents' PATH, the app's own folder aside (or a path that exists). */
function onPath(cmd: string): string | null {
  if (/[\\/]/.test(cmd)) return WIN ? programFile(cmd) : fs.existsSync(cmd) ? cmd : null;
  return which(cmd, withPath(agentBaseEnv(), [], [path.join(config.home, '.local', 'bin')]), (d) => d === CLIENTS_BIN);
}

/** Your own copy of a program, unless CLAUDE_BIN or CODEX_BIN names the one to run (that one is left as it is). */
function ownCopy(cmd: string): string | null {
  if ((cmd === 'claude' && process.env.CLAUDE_BIN) || (cmd === 'codex' && process.env.CODEX_BIN)) return null;
  return onPath(cmd);
}

const busy = new Map<string, Promise<string>>();

/** Installs (or updates) a program into the app's folder; its command's path. */
export function install(cmd: string, version = 'latest'): Promise<string> {
  const p = PACKAGES[cmd];
  if (!p) throw new HttpError(400, `The app cannot install ${cmd} by itself`);
  const running = busy.get(cmd);
  if (running) return running;
  const job = (async () => {
    fs.mkdirSync(CLIENTS_DIR, { recursive: true });
    if (!fs.existsSync(path.join(CLIENTS_DIR, 'package.json'))) fs.writeFileSync(path.join(CLIENTS_DIR, 'package.json'), '{ "private": true }\n');
    // What it needs and the machine lacks goes in with it, in one npm run.
    const needs = (p.with ?? []).filter((c) => PACKAGES[c] && !onPath(c) && !managedBin(c)).map((c) => PACKAGES[c]);
    const specs = [`${p.pkg}@${version}`, ...needs.map((n) => `${n.pkg}@latest`)];
    const quiet = p.ignoreScripts || needs.some((n) => n.ignoreScripts) ? ['--ignore-scripts'] : [];
    const r = await npm(['install', '--prefix', CLIENTS_DIR, ...specs, ...quiet, '--no-audit', '--no-fund', '--loglevel=error'], 15 * 60_000);
    const bin = managedBin(cmd);
    if (!r.ok || !bin) throw new HttpError(500, `Could not install ${p.name}: ${r.out.split('\n').slice(-3).join(' ').slice(0, 300)}`);
    return bin;
  })().finally(() => busy.delete(cmd));
  busy.set(cmd, job);
  return job;
}

/** Claude Code's command, installed now when there is none (the user's own copy comes first). */
export async function ensureClaude(): Promise<string> {
  const own = onPath(config.claudeBin) ?? onPath('claude');
  if (own) return (config.claudeBin = own);
  return (config.claudeBin = managedBin('claude') ?? (await install('claude')));
}

/** An ACP agent's command: there already, or installed when the app knows its package. */
export async function ensureCommand(cmd: string): Promise<string | null> {
  const found = onPath(cmd) ?? managedBin(cmd);
  if (found || !PACKAGES[cmd]) return found;
  return install(cmd);
}

/**
 * Extra environment for an ACP agent's program: the Pi adapter starts `pi`, which is the app's own copy when none is on the
 * PATH (PI_ACP_PI_COMMAND).
 */
export function acpEnvFor(cmd: string, env: Record<string, string>): Record<string, string> {
  if (cmd !== 'pi-acp' || env.PI_ACP_PI_COMMAND) return {};
  const pi = onPath('pi') ? null : managedBin('pi');
  return pi ? { PI_ACP_PI_COMMAND: pi } : {};
}

/** The Codex the app runs when nothing newer is installed: the one it came with (config.ts). */
const firstCodexBin = config.codexBin;
/** The native program of the app's own Codex copy, which the sessions run rather than its npm launcher. */
function managedCodexNative(): string | null {
  const t = CODEX_TARGET[`${process.platform}-${process.arch}`];
  const bin = t && path.join(CLIENTS_DIR, `node_modules/@openai/${t[0]}/vendor/${t[1]}/bin/codex${EXE}`);
  return bin && fs.existsSync(bin) ? bin : null;
}

/** Codex comes with the app; a newer copy the app installed takes over (its native program), and gives way again once it is gone or older. */
export function useNewestCodex() {
  if (process.env.CODEX_BIN) return;
  const mine = managedVersion('codex');
  const bundled = bundledCodex();
  const bin = managedCodexNative();
  if (bin && mine && (!bundled || newer(mine, bundled))) config.codexBin = bin;
  else config.codexBin = firstCodexBin;
}

// ---- checking that a version works ---------------------------------------------------------------

/**
 * How long a program has to answer the check, counted while the computer is awake: a minute, then two more on a
 * second start for one that did not answer in it (tests shorten them).
 */
export const limits = { answer: 60_000, again: 120_000 };

/** A time limit in words: "a minute", "2 minutes", "30 s". */
const span = (ms: number) => (ms === 60_000 ? 'a minute' : ms % 60_000 === 0 ? `${ms / 60_000} minutes` : `${Math.round(ms / 1000)} s`);

/** Why a check failed (null: it works); `late`: only that no answer came in its time, `said` what the program wrote meanwhile. */
type Verdict = { why: string; late?: boolean; said?: string } | null;

const noAnswer = (limit: number, out: string): Verdict => {
  const said = out.trim() ? tail(out) : undefined;
  return { why: `it did not answer within ${span(limit)}${said ? ` (${said})` : ''}`, late: true, said };
};

/**
 * Starts a program, writes `first` and reads its JSON lines until `answer` settles it: true when it works,
 * else why not. `limit` ms awake at most; the program is stopped either way. Null: it works.
 */
function talk(bin: string, args: string[], env: Record<string, string>, first: object, answer: (m: Json, send: (o: object) => void) => true | string | undefined, limit: number): Promise<Verdict> {
  fs.mkdirSync(paths.probe, { recursive: true });
  return new Promise((resolve) => {
    let err = '';
    let settled = false;
    const proc = spawnProgram(bin, args, { cwd: paths.probe, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const finish = (v: Verdict) => {
      if (settled) return;
      settled = true;
      stop();
      try {
        proc.stdin.end();
      } catch {}
      proc.kill('SIGTERM');
      setTimeout(() => proc.exitCode === null && proc.signalCode === null && proc.kill('SIGKILL'), 3000).unref();
      resolve(v);
    };
    const stop = awakeTimeout(limit, () => finish(noAnswer(limit, err)));
    const send = (o: object) => {
      try {
        proc.stdin.write(JSON.stringify(o) + '\n');
      } catch {}
    };
    const lines = new LineSplitter();
    proc.stdout.on('data', (buf: Buffer) =>
      lines.push(buf, (line) => {
        let m: Json;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        const r = answer(m, send);
        if (r !== undefined) finish(r === true ? null : { why: r });
      }),
    );
    proc.stderr.on('data', (b: Buffer) => (err = (err + b.toString()).slice(-4000)));
    proc.stdin.on('error', () => {});
    proc.on('error', (e) => finish({ why: `it did not start: ${e.message}` }));
    // What it wrote as it stopped can come in just after.
    proc.on('exit', (code, sig) =>
      setTimeout(() => finish({ why: `it stopped before answering${code != null ? ` (exit code ${code})` : sig ? ` (${sig})` : ''}${err.trim() ? `: ${tail(err)}` : ''}` }), 200),
    );
    send(first);
  });
}

/** The environment Codex runs in for the sessions (agents/codex.ts codexEnv), for the copies the app runs. */
const codexEnvFor = (bin: string) => {
  const env = agentBaseEnv();
  return bin === ownCopy('codex') ? env : { ...env, CODEX_MANAGED_PACKAGE_ROOT: config.codexPackageRoot, CODEX_MANAGED_BY_NPM: '1' };
};

/**
 * Whether a program works the way the sessions use it: Claude Code answers stream-json's initialize with its
 * models, Codex's app-server initializes and lists its models, the others start and say their version. Null
 * when it works, else why not. Nothing here needs a sign-in or spends any usage. One that does not answer in
 * its minute is started once more, with longer: a first start can be slow (macOS looks a new program over before
 * it first runs, a disk or the network is busy), so only a second start that does not answer either fails it.
 */
export async function works(cmd: string, bin: string): Promise<string | null> {
  const first = await check(cmd, bin, limits.answer);
  if (!first?.late) return first?.why ?? null;
  console.log(`[clients] ${bin} did not answer within ${span(limits.answer)}; starting it again`);
  const again = await check(cmd, bin, limits.again);
  if (!again?.late) return again?.why ?? null;
  return `it did not answer within ${span(limits.answer)}, nor within ${span(limits.again)} when started again${again.said ? ` (${again.said})` : ''}`;
}

/** One start of works(), with `limit` ms of the computer awake to answer. */
function check(cmd: string, bin: string, limit: number): Promise<Verdict> {
  if (cmd === 'claude')
    return talk(
      bin,
      ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--strict-mcp-config', '--permission-prompt-tool', 'stdio'],
      agentBaseEnv(),
      { type: 'control_request', request_id: 'check', request: { subtype: 'initialize' } },
      (m) => {
        if (m.type !== 'control_response' || m.response?.request_id !== 'check') return;
        if (m.response.subtype !== 'success') return `it answered with an error: ${String(m.response.error ?? 'none given').slice(0, 200)}`;
        return Array.isArray(m.response.response?.models) || 'it did not list its models';
      },
      limit,
    );
  if (cmd === 'codex')
    return talk(
      bin,
      ['app-server'],
      codexEnvFor(bin),
      { id: 1, method: 'initialize', params: { clientInfo: { name: 'hydor_check', title: 'Hydor', version: config.version }, capabilities: { experimentalApi: true, requestAttestation: false } } },
      (m, send) => {
        if (m.id === 1) {
          if (m.error) return `it answered with an error: ${String(m.error.message ?? '').slice(0, 200)}`;
          send({ method: 'initialized' });
          send({ id: 2, method: 'model/list', params: { includeHidden: false } });
          return;
        }
        if (m.id === 2) return m.error ? `it could not list its models: ${String(m.error.message ?? '').slice(0, 200)}` : Array.isArray(m.result?.data) || 'it did not list its models';
      },
      limit,
    );
  // The Pi adapter has no --version: it answers ACP's initialize.
  if (cmd === 'pi-acp')
    return talk(
      bin,
      [],
      agentBaseEnv(),
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } },
      (m) => {
        if (m.id !== 1) return;
        return m.error ? `it answered with an error: ${String(m.error.message ?? '').slice(0, 200)}` : m.result?.protocolVersion != null || 'it did not answer the ACP handshake';
      },
      limit,
    );
  return run(bin, ['--version'], limit, agentBaseEnv()).then((r) => (r.ok && VERSION.test(r.out) ? null : r.late ? noAnswer(limit, r.out) : { why: `it did not start: ${tail(r.out)}` }));
}

const versions = new Map<string, { key: string; version: string | null }>();
/** The version a program says it is (--version), remembered until its file changes. */
export async function versionOf(bin: string): Promise<string | null> {
  const real = realpath(bin);
  if (!real) return null;
  let key: string;
  try {
    key = `${real}:${fs.statSync(real).mtimeMs}`;
  } catch {
    return null;
  }
  const had = versions.get(bin);
  if (had?.key === key) return had.version;
  const r = await run(bin, ['--version'], 30_000, agentBaseEnv());
  const version = r.ok ? (VERSION.exec(r.stdout)?.[0] ?? VERSION.exec(r.out)?.[0] ?? null) : null;
  versions.set(bin, { key, version });
  return version;
}

// ---- the newest versions ------------------------------------------------------------------------

const claudeSettings = (): Json => readJson(path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(config.home, '.claude'), 'settings.json')) ?? {};
const isOn = (v: unknown) => v != null && v !== '' && v !== '0' && v !== 'false';
/** Claude Code's own updates are off (DISABLE_AUTOUPDATER, as the Docker image sets it): the app leaves your copy alone too, until you press Update now. */
const claudeUpdatesOff = () => [process.env.DISABLE_AUTOUPDATER, agentBaseEnv().DISABLE_AUTOUPDATER, claudeSettings().env?.DISABLE_AUTOUPDATER].some(isOn);

/** The version a program's dist-tags offer: Claude Code's own release line (stable, when its settings pick that), else latest. */
export function pickTag(cmd: string, tags: Json, channel = cmd === 'claude' && claudeSettings().autoUpdatesChannel === 'stable' ? 'stable' : 'latest'): string | null {
  const v = tags?.[channel] ?? tags?.latest;
  return typeof v === 'string' && VERSION.test(v) ? v : null;
}

/** Looks up the newest version on npm (tests put their own here). */
export const lookup = {
  newest: async (cmd: string): Promise<string | null> => {
    const r = await npm(['view', PACKAGES[cmd].pkg, 'dist-tags', '--json'], 60_000);
    if (!r.ok) throw new Error(tail(r.out));
    return pickTag(cmd, JSON.parse(r.stdout));
  },
};

// ---- updating -----------------------------------------------------------------------------------

let ctx: { db: DB; onUpdated: (ids: string[]) => void } | null = null;
let job: { mode: Mode; current?: string } | null = null;
/** By itself (once a day; it only looks when Update automatically is off), Update now, or Check now. */
type Mode = 'auto' | 'now' | 'check';

const kvJson = <T>(k: string, fallback: T): T => {
  try {
    return (ctx && JSON.parse(kvGet(ctx.db, k) ?? 'null')) ?? fallback;
  } catch {
    return fallback;
  }
};
const kvPut = (k: string, v: unknown) => ctx && kvSet(ctx.db, k, JSON.stringify(v));
const autoOn = () => !!ctx && kvGet(ctx.db, 'clients.auto') !== '0';

/** Versions that did not work here, by program (`claude`, or `claude:yours` for your own copy): not tried again by themselves. */
type Bad = Record<string, string>;

/** Your Claude Code's previous version, which the sessions keep running while its newest one does not work here. */
const pinned = (): { path: string; version: string } | null => {
  const p = kvJson<{ path: string; version: string } | null>('clients.pin', null);
  return p && fs.existsSync(p.path) ? p : null;
};
function pin(p: { path: string; version: string } | null) {
  kvPut('clients.pin', p);
  if (p) config.claudeBin = p.path;
  else if (!process.env.CLAUDE_BIN) config.claudeBin = ownCopy('claude') ?? managedBin('claude') ?? config.claudeBin;
}

/** The copy of a program the sessions run: yours, the app's or the one it came with. */
function sessionsCopy(cmd: string): string | null {
  if (cmd === 'claude') return pinned()?.path ?? (process.env.CLAUDE_BIN ? onPath(process.env.CLAUDE_BIN) : null) ?? onPath('claude') ?? managedBin('claude');
  if (cmd === 'codex') return fs.existsSync(config.codexBin) ? config.codexBin : onPath(config.codexBin);
  return onPath(cmd) ?? managedBin(cmd);
}

/** For a copy installed with npm -g: that npm folder (its prefix), when this user may write to it. */
function globalNpm(bin: string, pkg: string): { npm: string; prefix: string; env: Record<string, string> } | null {
  const real = realpath(bin);
  const at = real?.indexOf(`/lib/node_modules/${pkg}/`) ?? -1;
  if (!real || at < 0) return null;
  const prefix = real.slice(0, at);
  try {
    fs.accessSync(path.join(prefix, 'lib/node_modules'), fs.constants.W_OK);
  } catch {
    return null;
  }
  const own = path.join(prefix, 'bin/npm');
  const env: Record<string, string> = { ...agentBaseEnv(), PATH: `${path.join(prefix, 'bin')}:${nodeDir}:${agentBaseEnv().PATH ?? ''}` };
  delete env.NODE_ENV;
  return { npm: fs.existsSync(own) ? own : npmBin, prefix, env };
}

const npmGlobal = (g: NonNullable<ReturnType<typeof globalNpm>>, spec: string) =>
  run(g.npm, ['install', '-g', '--prefix', g.prefix, spec, '--no-audit', '--no-fund', '--loglevel=error'], 15 * 60_000, g.env);

/** The app's own copy to `to`, checked; one that does not work goes back to the version before (none: Codex runs the one the app came with again). */
async function updateApp(cmd: string, to: string, bad: Bad): Promise<ClientUpdateItem> {
  const name = PACKAGES[cmd].name;
  const before = managedVersion(cmd);
  const from = before ?? (cmd === 'codex' ? bundledCodex() : null) ?? undefined;
  try {
    await install(cmd, to);
  } catch (e) {
    return { id: cmd, name, from, to, ok: false, error: (e as Error).message };
  }
  const now = managedVersion(cmd) ?? to;
  const bin = cmd === 'codex' ? (managedCodexNative() ?? managedBin(cmd)) : managedBin(cmd);
  const why = bin ? await works(cmd, bin) : 'npm did not put its command where it belongs';
  if (!why) {
    delete bad[cmd];
    return { id: cmd, name, from, to: now, ok: true };
  }
  bad[cmd] = now;
  const back = before
    ? await install(cmd, before).then(
        () => true,
        () => false,
      )
    : (await npm(['uninstall', '--prefix', CLIENTS_DIR, PACKAGES[cmd].pkg, '--no-audit', '--no-fund', '--loglevel=error'], 5 * 60_000)).ok;
  return { id: cmd, name, from, to: now, ok: false, error: why, kept: back ? from : undefined };
}

/**
 * Your own copy to `to`, with its own updater or npm, checked. One that does not work is undone where it can
 * be: npm puts the version before back, and the sessions keep running your Claude Code's previous version.
 * Null: there is no way the app knows to update it (a run by itself says nothing of it).
 */
export async function updateOwn(cmd: string, bin: string, from: string, to: string, bad: Bad, auto: boolean): Promise<ClientUpdateItem | null> {
  const p = PACKAGES[cmd];
  // Codex's sessions run the app's copy: yours is the one your terminal runs.
  const item = { id: cmd, name: p.name, yours: (cmd === 'codex' && bin !== config.codexBin) || undefined, from };
  const key = `${cmd}:yours`;
  const before = realpath(bin);
  const g = p.update ? null : globalNpm(bin, p.pkg);
  if (!p.update && !g) return auto ? null : { ...item, to, ok: false, error: 'the app cannot update this copy: update it the way you installed it' };
  const r = p.update ? await run(bin, p.update, 15 * 60_000, agentBaseEnv()) : await npmGlobal(g!, `${p.pkg}@${to}`);
  const now = await versionOf(bin);
  if (now === from && realpath(bin) === before) return { ...item, to, ok: false, error: r.ok ? `still ${from} after its updater ran: ${tail(r.out)}` : tail(r.out) };
  // Something changed: what is there now must work, even one that no longer says its version.
  const why = now ? await works(cmd, bin) : `it no longer says its version${r.ok ? '' : ` (its updater: ${tail(r.out)})`}`;
  const got = now ?? to;
  if (!why) {
    delete bad[key];
    if (cmd === 'claude' && kvJson('clients.pin', null)) pin(null);
    return { ...item, to: got, ok: true };
  }
  bad[key] = got;
  if (g) return { ...item, to: got, ok: false, error: why, kept: (await npmGlobal(g, `${p.pkg}@${from}`)).ok ? from : undefined };
  if (cmd === 'claude') {
    // The sessions keep the version that worked: one kept already, else the one this replaced, still beside it.
    const keep = pinned() ?? (before && before !== realpath(bin) && fs.existsSync(before) ? { path: before, version: from } : null);
    if (keep) {
      pin(keep);
      return { ...item, to: got, ok: false, error: why, kept: keep.version };
    }
  }
  return { ...item, to: got, ok: false, error: why };
}

/** Looks up each program's newest version, and (unless only looking) brings every copy that is behind up to it. */
async function runUpdates(mode: Mode): Promise<void> {
  const auto = mode === 'auto';
  const installs = mode === 'now' || (auto && autoOn());
  const bad = kvJson<Bad>('clients.bad', {});
  const latest: Record<string, string> = {};
  const items: ClientUpdateItem[] = [];
  const errors: { name: string; message: string }[] = [];
  const here = Object.keys(PACKAGES).filter((cmd) => managedVersion(cmd) || (cmd === 'codex' && bundledCodex()) || ownCopy(cmd));
  const wants = await Promise.all(
    here.map((cmd) =>
      lookup.newest(cmd).catch((e) => {
        errors.push({ name: PACKAGES[cmd].name, message: (e as Error).message });
        return null;
      }),
    ),
  );
  // The same reason for all (offline, say) once; else each program's.
  const error = new Set(errors.map((e) => e.message)).size === 1 ? errors[0].message : errors.map((e) => `${e.name}: ${e.message}`).join(' · ') || undefined;
  for (const [i, cmd] of here.entries()) {
    const want = wants[i];
    if (!want) continue;
    latest[cmd] = want;
    if (!installs) continue;
    job!.current = PACKAGES[cmd].name;
    // The app's copy (Codex: once newer than the one the app came with), unless CLAUDE_BIN or CODEX_BIN names another to run.
    const base = managedVersion(cmd) ?? (cmd === 'codex' ? bundledCodex() : null);
    const named = (cmd === 'claude' && process.env.CLAUDE_BIN) || (cmd === 'codex' && process.env.CODEX_BIN);
    if (base && !named && newer(want, base) && !(auto && bad[cmd] === want)) items.push(await updateApp(cmd, want, bad));
    // Your own: by itself only when its own updates are not turned off, and not a version that failed here.
    const own = ownCopy(cmd);
    if (!own || (auto && cmd === 'claude' && claudeUpdatesOff())) continue;
    const have = await versionOf(own);
    // Kept on an older Claude Code, while yours now runs another version (you updated it yourself): back to yours once it works.
    if (cmd === 'claude' && pinned() && have && have !== bad[`${cmd}:yours`] && (await works(cmd, own)) === null) pin(null);
    if (have && newer(want, have) && !(auto && bad[`${cmd}:yours`] === want)) {
      const it = await updateOwn(cmd, own, have, want, bad, auto);
      if (it) items.push(it);
    }
  }
  if (!pinned() && kvJson('clients.pin', null)) pin(null);
  useNewestCodex();
  kvPut('clients.bad', bad);
  kvPut('clients.latest', { latest, checkedAt: Date.now(), error });
  if (items.length) kvPut('clients.last', { at: Date.now(), auto, items });
  for (const it of items) console.log(`[clients] ${it.name}${it.yours ? ' (your own)' : ''} ${it.from ?? '?'} → ${it.to ?? '?'}: ${it.ok ? 'updated' : `${it.error}${it.kept ? `; kept ${it.kept}` : ''}`}`);
  const changed = [...new Set(items.filter((i) => i.ok || i.kept).map((i) => i.id))];
  if (changed.length) ctx!.onUpdated(changed);
}

/** Looks up the newest versions and (but for Check now) updates what is behind, in the background (409 while a run goes on). */
export function startClientUpdates(mode: Mode): ClientUpdates {
  if (!ctx) throw new HttpError(503, 'Starting up');
  if (job) throw new HttpError(409, 'The agent programs are already being checked or updated');
  job = { mode };
  void runUpdates(mode)
    .catch((e) => console.warn(`[clients] the update stopped: ${(e as Error).message}`))
    .finally(() => (job = null));
  return clientUpdates();
}

export function setClientAutoUpdate(on: boolean): ClientUpdates {
  if (ctx) kvSet(ctx.db, 'clients.auto', on ? '1' : '0');
  return clientUpdates();
}

export function clientUpdates(): ClientUpdates {
  const l = kvJson<{ checkedAt?: number; error?: string }>('clients.latest', {});
  const running = !job ? undefined : job.mode === 'check' || (job.mode === 'auto' && !autoOn()) ? 'check' : 'update';
  return { auto: autoOn(), checkedAt: l.checkedAt, error: l.error, running, current: running === 'update' ? job?.current : undefined, last: kvJson('clients.last', undefined) };
}

/** Whether a run is going on now (tests wait for it). */
export const clientUpdatesRunning = () => !!job;

/** Keeps the programs current: a run about ten minutes after the start, then once a day. */
export function watchClients(db: DB, onUpdated: (ids: string[]) => void) {
  ctx = { db, onUpdated };
  const p = pinned();
  if (p && !process.env.CLAUDE_BIN) config.claudeBin = p.path;
  useNewestCodex();
  // A copy run from a temporary folder (a test's, the guide's pictures') or in development leaves the programs to the real one.
  if (process.env.NODE_ENV === 'development' || [os.tmpdir(), '/dev/shm'].some((d) => APP_ROOT.startsWith(d + path.sep))) return;
  const tick = () => {
    if (job || Date.now() - Number(kvGet(db, 'clients.autoAt') ?? 0) < 23 * HOUR) return;
    kvSet(db, 'clients.autoAt', String(Date.now()));
    try {
      startClientUpdates('auto');
    } catch {}
  };
  setTimeout(tick, 10 * 60_000).unref();
  setInterval(tick, HOUR).unref();
}

/** The programs, where they come from, their versions and what is newer, for Settings. */
export async function clients(): Promise<ClientInfo[]> {
  const latest = kvJson<{ latest?: Record<string, string> }>('clients.latest', {}).latest ?? {};
  const bad = kvJson<Bad>('clients.bad', {});
  return Promise.all(
    Object.entries(PACKAGES)
      .filter(([, p]) => !p.hidden)
      .map(async ([cmd, p]): Promise<ClientInfo> => {
      const bin = sessionsCopy(cmd);
      const mine = managedVersion(cmd);
      const bundled = cmd === 'codex' ? bundledCodex() : null;
      const appCopy = !!bin && bin.startsWith(CLIENTS_DIR + path.sep);
      const source: ClientInfo['source'] = !bin ? 'missing' : appCopy ? 'app' : cmd === 'codex' && bin === firstCodexBin && bundled ? 'bundled' : 'yours';
      const version = (source === 'app' ? mine : source === 'bundled' ? bundled : bin ? await versionOf(bin) : null) ?? undefined;
      const failed = bad[source === 'app' || source === 'bundled' ? cmd : `${cmd}:yours`];
      const own = cmd === 'codex' ? ownCopy('codex') : null;
      return {
        id: cmd,
        name: p.name,
        source,
        version,
        path: bin ?? undefined,
        installing: busy.has(cmd),
        latest: version && latest[cmd] && newer(latest[cmd], version) && latest[cmd] !== failed ? latest[cmd] : undefined,
        failed: version && failed && newer(failed, version) ? failed : undefined,
        yours: own && own !== bin ? { version: (await versionOf(own)) ?? undefined, path: own } : undefined,
      };
    }),
  );
}

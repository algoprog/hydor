// Newer versions, for a copy installed from git: once a day it fetches its upstream and counts the
// commits this checkout is behind. "Update now" in Settings pulls, builds and restarts the server;
// a copy that comes back by itself when the server exits (the installer's systemd service, the
// Docker image's restart loop: both leave the agents running) also updates itself, after 5 hours
// without a message from you and at most once a day. Agents may be at work meanwhile.
//
// In the Mac app (desktop.ts) it is by version instead: the newest release on GitHub says which version is
// out and where each Mac's build is; an update downloads it, checks it, unpacks it, and hands it to the app,
// which swaps itself for it, starts again, and goes back to the version before if the new one does not start.
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import type { UpdateResult, UpdateState } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { newer } from './clients.ts';
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { desktop, tellDesktop } from './desktop.ts';
import { agentBaseEnv } from './env.ts';
import { git } from './git.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** No message from you for this long before an update installs itself. */
const IDLE = 5 * HOUR;

let check: { behind: number; latest?: string; checkedAt: number; error?: string } | null = null;
let running: UpdateState['running'];
let ctx: { db: DB; onChange: (u: UpdateState | null) => void } | null = null;
/** The last message you sent through the app (the activity index has the rest, by the hour). */
let lastMessage = 0;

export const noteUserMessage = () => {
  lastMessage = Date.now();
};

export function updateState(): UpdateState | null {
  if (!check) return null;
  let last: UpdateResult | undefined;
  try {
    last = ctx ? JSON.parse(kvGet(ctx.db, 'update.last') ?? 'null') ?? undefined : undefined;
  } catch {}
  return { ...check, kind: desktop ? 'app' : 'git', auto: !!ctx && kvGet(ctx.db, 'update.auto') !== '0', canRestart: !!restarter(), running, last };
}

const emit = () => {
  if (ctx && check) kvSet(ctx.db, 'update.check', JSON.stringify(check));
  ctx?.onChange(updateState());
};

export async function checkUpdates(): Promise<UpdateState | null> {
  if (desktop) return checkRelease();
  if (!fs.existsSync(path.join(ROOT, '.git'))) return null;
  const up = await git(ROOT, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (!up.ok) return null;
  const fetched = await git(ROOT, ['fetch', '--quiet'], 60_000);
  const [count, subject] = await Promise.all([git(ROOT, ['rev-list', '--count', 'HEAD..@{u}']), git(ROOT, ['log', '-1', '--format=%s', '@{u}'])]);
  check = { behind: Number(count.out.trim()) || 0, latest: subject.out.trim() || undefined, checkedAt: Date.now(), error: fetched.ok ? undefined : fetchError(fetched.err) };
  emit();
  return updateState();
}

/** The line of git's output that says why a fetch failed. */
function fetchError(err: string): string {
  const lines = err
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines.find((l) => /denied|fatal|could not|unable|timed out|not found/i.test(l)) ?? lines[0] ?? 'the fetch failed';
  return line.replace(/^fatal:\s*/, '').slice(0, 200);
}

let how: { code: number } | null | undefined;
/**
 * How this server comes back after it exits, if it does with the agents left running: the Docker
 * image's loop (any exit), or a systemd service that restarts (exit 75 for Restart=on-failure)
 * and keeps the rest of its processes (KillMode=process).
 */
function restarter(): { code: number } | null {
  if (how !== undefined) return how;
  how = null;
  if ((process.env.NAGET_AGENT_RESTARTS ?? process.env.AGENT_CONSOLE_RESTARTS) === '1') return (how = { code: 0 });
  if (desktop) return (how = desktop.updatable ? { code: 0 } : null);
  if (!process.env.INVOCATION_ID) return how;
  try {
    const cg = fs.readFileSync('/proc/self/cgroup', 'utf8');
    const unit = /([^/\s]+\.service)\s*$/m.exec(cg)?.[1];
    if (!unit) return how;
    const r = spawnSync('systemctl', [...(cg.includes('/user@') ? ['--user'] : []), 'show', unit, '-p', 'Restart', '-p', 'KillMode'], { encoding: 'utf8', timeout: 5000 });
    const v = Object.fromEntries((r.stdout ?? '').split('\n').map((l) => l.split('=') as [string, string]));
    if (v.KillMode === 'process' && (v.Restart === 'always' || v.Restart === 'on-failure')) how = { code: v.Restart === 'always' ? 0 : 75 };
  } catch {}
  return how;
}

/** When you last sent a message: through the app, or to any session the index has seen (to the end of that hour). */
function lastMessageAt(db: DB): number {
  const r = db.prepare('select max(hour) as h from activity where prompts > 0').get() as { h: number | null } | undefined;
  return Math.max(lastMessage, r?.h != null ? (r.h + 1) * HOUR : 0);
}

const nodeDir = path.dirname(process.execPath);
const npm = fs.existsSync(path.join(nodeDir, 'npm')) ? path.join(nodeDir, 'npm') : 'npm';

/** npm in the app's folder. Building needs the dev packages, which NODE_ENV=production would leave out. */
function npmRun(args: string[], timeout: number): Promise<{ ok: boolean; out: string }> {
  const env: Record<string, string> = { ...agentBaseEnv(), PATH: `${nodeDir}:${agentBaseEnv().PATH ?? ''}` };
  delete env.NODE_ENV;
  return new Promise((resolve) =>
    execFile(npm, args, { cwd: ROOT, env, timeout, maxBuffer: 64 << 20 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ''}\n${stderr ?? ''}` })),
  );
}

/** The last few lines of a failed step's output. */
const tail = (out: string) =>
  out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3)
    .join(' · ')
    .slice(0, 300) || 'it failed';

/** Starts an update (409 while one runs); its progress and outcome arrive as update events. */
export function startUpdate(auto: boolean): UpdateState | null {
  if (!ctx) throw new HttpError(503, 'Starting up');
  if (running) throw new HttpError(409, 'An update is already running');
  if (desktop) {
    if (!desktop.updatable) throw new HttpError(400, 'Move Naget Agent to your Applications folder to update it');
    running = { phase: 'pull', since: Date.now(), auto };
    void updateApp(ctx.db, auto);
    emit();
    return updateState();
  }
  if (!fs.existsSync(path.join(ROOT, '.git'))) throw new HttpError(400, 'This copy was not installed from git');
  running = { phase: 'pull', since: Date.now(), auto };
  void update(ctx.db, auto);
  emit();
  return updateState();
}

async function update(db: DB, auto: boolean) {
  const at = Date.now();
  const phase = (p: NonNullable<UpdateState['running']>['phase']) => {
    running = { phase: p, since: Date.now(), auto };
    emit();
  };
  const done = (r: Omit<UpdateResult, 'at' | 'auto'>) => {
    kvSet(db, 'update.last', JSON.stringify({ ...r, at, auto }));
    running = undefined;
    emit();
  };
  try {
    const head = async () => (await git(ROOT, ['rev-parse', '--short', 'HEAD'])).out.trim();
    const from = await head();
    const pull = await git(ROOT, ['pull', '--ff-only'], 180_000);
    if (!pull.ok) return done({ ok: false, from, error: fetchError(pull.err) });
    const to = await head();
    if (to === from) {
      await checkUpdates().catch(() => {});
      return done({ ok: true, from, to });
    }
    const changed = (await git(ROOT, ['diff', '--name-only', from, to])).out;
    if (/^(package-lock\.json|package\.json)$/m.test(changed)) {
      phase('install');
      const r = await npmRun(['ci', '--include=dev', '--no-audit', '--no-fund'], 20 * 60_000);
      if (!r.ok) return done({ ok: false, from, to, error: tail(r.out) });
    }
    phase('build');
    const b = await npmRun(['run', 'build'], 20 * 60_000);
    if (!b.ok) return done({ ok: false, from, to, error: tail(b.out) });
    if (check) check = { ...check, behind: 0, latest: undefined };
    const r = restarter();
    if (!r) return done({ ok: true, from, to, needsRestart: true });
    kvSet(db, 'update.last', JSON.stringify({ ok: true, from, to, at, auto }));
    phase('restart');
    // The service or the container's loop starts the new version; agents carry on meanwhile.
    setTimeout(() => process.exit(r.code), 1000);
  } catch (e) {
    done({ ok: false, error: (e as Error).message });
  }
}

export function setAutoUpdate(on: boolean): UpdateState | null {
  if (ctx) kvSet(ctx.db, 'update.auto', on ? '1' : '0');
  emit();
  return updateState();
}

/** Whether a newer version may install itself now: it is on, can restart, and nothing from you for 5 hours, once a day. */
export function autoUpdateDue(s: { now: number; on: boolean; canRestart: boolean; behind: number; running: boolean; autoAt: number; lastMessage: number }): boolean {
  return s.on && s.canRestart && s.behind > 0 && !s.running && s.now - s.autoAt >= DAY && s.now - s.lastMessage >= IDLE;
}

/** Checks a few minutes after start, then daily; installs on its own when it may. */
export function watchUpdates(db: DB, onChange: (u: UpdateState | null) => void) {
  ctx = { db, onChange };
  try {
    if (desktop || fs.existsSync(path.join(ROOT, '.git'))) check = JSON.parse(kvGet(db, 'update.check') ?? 'null');
  } catch {}
  if (desktop && check) {
    // What was out when it last looked, against the version running now (an update may have just installed).
    const latest = check.latest;
    check = { ...check, behind: latest && newer(latest, config.version) ? 1 : 0, latest: latest && newer(latest, config.version) ? latest : undefined };
  }
  if (desktop?.updateError) {
    // The app went back to the version before (or could not swap): say so, and don't try that version again by itself.
    const e = desktop.updateError;
    const last = JSON.parse(kvGet(db, 'update.last') ?? 'null') as UpdateResult | null;
    kvSet(db, 'update.last', JSON.stringify({ ok: false, from: e.from, to: e.to, error: e.error, at: Date.now(), auto: !!last?.auto }));
    kvSet(db, 'update.skip', e.to);
  }
  const tick = () => checkUpdates().catch(() => {});
  setTimeout(tick, (desktop && !check ? 0.5 : 3) * 60_000).unref();
  setInterval(tick, DAY).unref();
  setInterval(() => {
    const now = Date.now();
    const due = autoUpdateDue({
      now,
      on: kvGet(db, 'update.auto') !== '0',
      canRestart: !!restarter(),
      behind: desktop && check?.latest === kvGet(db, 'update.skip') ? 0 : (check?.behind ?? 0),
      running: !!running,
      autoAt: Number(kvGet(db, 'update.autoAt') ?? 0),
      lastMessage: lastMessageAt(db),
    });
    if (!due) return;
    kvSet(db, 'update.autoAt', String(now));
    try {
      startUpdate(true);
    } catch {}
  }, 10 * 60_000).unref();
}

// ---- the Mac app: by release --------------------------------------------------------------------------------

/** The newest release's Mac builds (mac/scripts/feed.mjs writes it, the release carries it). */
interface Feed {
  version: string;
  files: Record<string, { url: string; sha512: string; size: number }>;
}
const feedUrl = () => process.env.NAGET_UPDATE_FEED || 'https://github.com/Naget-Inc/naget-agent/releases/latest/download/naget-mac.json';

async function feed(): Promise<Feed> {
  const r = await fetch(feedUrl(), { signal: AbortSignal.timeout(30_000), headers: { 'user-agent': `naget-agent/${config.version}` } });
  if (!r.ok) throw new Error(r.status === 404 ? 'no Mac release is published yet' : `GitHub answered ${r.status}`);
  const f = (await r.json()) as Feed;
  if (typeof f?.version !== 'string' || typeof f.files !== 'object') throw new Error('the release does not say its version');
  return f;
}

async function checkRelease(): Promise<UpdateState | null> {
  try {
    const f = await feed();
    const out = newer(f.version, config.version) && !!f.files[process.arch];
    check = { behind: out ? 1 : 0, latest: out ? f.version : undefined, checkedAt: Date.now() };
  } catch (e) {
    check = { behind: check?.behind ?? 0, latest: check?.latest, checkedAt: Date.now(), error: (e as Error).message.slice(0, 200) };
  }
  emit();
  return updateState();
}

const run = (cmd: string, args: string[], timeout = 120_000) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => execFile(cmd, args, { timeout, maxBuffer: 16 << 20 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}`.trim() || (err?.message ?? '') })));

/** The team a Mac app is signed by, or null when it is not signed by a developer. */
async function teamOf(app: string): Promise<string | null> {
  const r = await run('codesign', ['-dv', '--verbose=2', app]);
  const team = /^TeamIdentifier=(.+)$/m.exec(r.out)?.[1]?.trim();
  return team && team !== 'not set' ? team : null;
}

/** Downloads the build for this Mac, checks it is the one the release names, and unpacks it next to the others. */
async function fetchBuild(to: string, file: Feed['files'][string]): Promise<string> {
  const dir = path.join(desktop!.cache, 'updates');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, `${to}.zip`);
  const r = await fetch(file.url, { signal: AbortSignal.timeout(30 * 60_000), headers: { 'user-agent': `naget-agent/${config.version}` } });
  if (!r.ok || !r.body) throw new Error(`the download failed (${r.status})`);
  const hash = createHash('sha512');
  const body = Readable.fromWeb(r.body as import('node:stream/web').ReadableStream);
  body.on('data', (c: Buffer) => hash.update(c));
  await pipeline(body, fs.createWriteStream(zip));
  if (fs.statSync(zip).size !== file.size || hash.digest('base64') !== file.sha512) throw new Error('the download is not the build the release names (its checksum differs)');
  const out = path.join(dir, 'app');
  const x = await run('ditto', ['-x', '-k', zip, out], 10 * 60_000);
  fs.rmSync(zip, { force: true });
  if (!x.ok) throw new Error(`could not unpack it: ${x.out.trim().split('\n').pop()}`);
  const app = fs.readdirSync(out).find((n) => n.endsWith('.app'));
  if (!app) throw new Error('the download has no app in it');
  return path.join(out, app);
}

async function updateApp(db: DB, auto: boolean) {
  const at = Date.now();
  const from = config.version;
  const done = (r: Omit<UpdateResult, 'at' | 'auto' | 'from'>) => {
    kvSet(db, 'update.last', JSON.stringify({ ...r, from, at, auto }));
    running = undefined;
    emit();
  };
  try {
    const f = await feed();
    const file = f.files[process.arch];
    if (!newer(f.version, from) || !file) {
      check = { behind: 0, checkedAt: Date.now() };
      return done({ ok: true, to: from });
    }
    const to = f.version;
    const app = await fetchBuild(to, file);
    // A signed app takes only a build signed by the same developer.
    const team = await teamOf(desktop!.app);
    if (team) {
      const v = await run('codesign', ['--verify', '--deep', '--strict', app]);
      if (!v.ok) return done({ ok: false, to, error: 'the new version’s signature does not check out' });
      if ((await teamOf(app)) !== team) return done({ ok: false, to, error: 'the new version is signed by someone else' });
    }
    kvSet(db, 'update.last', JSON.stringify({ ok: true, from, to, at, auto }));
    kvSet(db, 'update.skip', '');
    running = { phase: 'restart', since: Date.now(), auto };
    emit();
    // The app stops this server, swaps itself for the new version and starts again; agents carry on.
    if (!tellDesktop({ type: 'install', app, from, to })) done({ ok: false, to, error: 'the app around the server did not answer' });
  } catch (e) {
    done({ ok: false, error: (e as Error).message });
  }
}

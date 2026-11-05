// Newer versions, for a copy installed from git: once a day it fetches its upstream and counts the
// commits this checkout is behind. "Update now" in Settings pulls, builds and restarts the server;
// a copy that comes back by itself when the server exits (the installer's systemd service, the
// Docker image's restart loop: both leave the agents running) also updates itself, after 5 hours
// without a message from you and at most once a day. Agents may be at work meanwhile.
//
// In the desktop apps (desktop.ts) it is by version instead: the newest release on GitHub says which version is
// out and where each system's builds are (hydor-mac.json, hydor-windows.json, hydor-linux.json). The app looks a
// minute after it starts and then every 4 hours. With updates on, it downloads a new version at once (a download that
// breaks off or goes quiet, as when the computer sleeps, carries on from its last byte; one that gets nowhere keeps
// what it has and tries again an hour later), checks it (and
// unpacks a Mac's), says so (a notification, and a note in every open page that counts down a minute, with Restart
// now and Later), then hands it to the app, which installs it its own way (desktop/main.cjs) and starts again: a Mac
// app or an AppImage goes back to the version before if the new one does not start. Later puts it off for 4 hours;
// Restart to Update in the menus and Restart now in Settings install it at any time. The .deb asks for your password
// to install, so there a version downloaded by itself waits for you. With updates off nothing downloads by itself:
// Update now downloads, checks and installs at once.
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { UPDATE_WORDS } from '../shared/desktop.ts';
import type { UpdateReady, UpdateResult, UpdateState } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { newer } from './clients.ts';
import { config } from './config.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { desktop, onDesktop, SYSTEM_NAME, tellDesktop } from './desktop.ts';
import { agentBaseEnv } from './env.ts';
import { git } from './git.ts';
import { appWords } from './language/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** No message from you for this long before an update installs itself. */
const IDLE = 5 * HOUR;
/** The Mac app looks for a new version this often, and a minute after it starts. */
export const APP_EVERY = 4 * HOUR;
/** A version the Mac app downloaded by itself is said this long before it restarts into it. */
export const NOTICE = Number(process.env.HYDOR_UPDATE_NOTICE_MS) || 60_000;
/** Later puts it off this long. */
export const LATER = 4 * HOUR;
/** After a download the app started by itself failed, the next one waits at least this long. */
export const RETRY = HOUR;
/** A download that gets nothing for this long is dropped, and the next try carries on from its last byte. */
export const STALL = 60_000;
/**
 * The waits before each new try after one that got no further (the network coming back after the computer slept,
 * say). When they run out the download stops for now, keeping what it has, and tries again after RETRY.
 */
export const WAITS = [3_000, 10_000, 30_000, 60_000];

let check: { behind: number; latest?: string; checkedAt: number; error?: string } | null = null;
let running: UpdateState['running'];
let ctx: { db: DB; onChange: (u: UpdateState | null) => void } | null = null;
/** The last message you sent through the app (the activity index has the rest, by the hour). */
let lastMessage = 0;

/** The Mac app: a new version downloaded and checked, waiting for its turn (see Waiting). */
let ready: Waiting | null = null;
let readyTimer: NodeJS.Timeout | null = null;
/** When a download the app started by itself last failed. */
let failedAt = 0;
/** One that failed on the way tries again after RETRY (not at the next look, 4 hours on). */
let retryTimer: NodeJS.Timeout | null = null;

/**
 * A downloaded version: said at `askAt` (a notification from the Mac, the pages' note) and installed at
 * `installAt`; both 0 while it waits for you (automatic updates off). `told`: the notification for this ask went out.
 */
interface Waiting {
  version: string;
  app: string;
  at: number;
  askAt: number;
  installAt: number;
  told?: boolean;
}

export const noteUserMessage = () => {
  lastMessage = Date.now();
};

export function updateState(): UpdateState | null {
  if (!check) return null;
  let last: UpdateResult | undefined;
  try {
    last = ctx ? JSON.parse(kvGet(ctx.db, 'update.last') ?? 'null') ?? undefined : undefined;
  } catch {}
  return {
    ...check,
    kind: desktop ? 'app' : 'git',
    ...(desktop ? { platform: desktop.platform, format: desktop.format } : {}),
    auto: !!ctx && autoOn(ctx.db),
    canRestart: !!restarter(),
    running,
    ...(ready ? { ready: readyView(ready, Date.now()) } : {}),
    last,
  };
}

const autoOn = (db: DB) => kvGet(db, 'update.auto') !== '0';

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
  if ((process.env.HYDOR_RESTARTS ?? process.env.AGENT_CONSOLE_RESTARTS) === '1') return (how = { code: 0 });
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

/**
 * Starts an update (409 while one runs); its progress and outcome arrive as update events. In the Mac app, a version
 * already downloaded and waiting installs at once.
 */
export function startUpdate(auto: boolean): UpdateState | null {
  if (!ctx) throw new HttpError(503, 'Starting up');
  if (running) throw new HttpError(409, 'An update is already running');
  if (desktop) {
    if (!desktop.updatable) cannotUpdate();
    if (ready) {
      installReady(ctx.db, auto);
      return updateState();
    }
    running = { phase: 'download', since: Date.now(), auto };
    void updateApp(ctx.db, auto, 'install');
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
  if (ctx) {
    kvSet(ctx.db, 'update.auto', on ? '1' : '0');
    // A version waiting: it now installs after its notice, or waits for you.
    if (ready) {
      ready = { ...ready, ...(on && installsAlone() ? appInstallTimes(Date.now(), ready.version, laterOf(ctx.db)) : { askAt: 0, installAt: 0 }), told: false };
      schedule();
    } else if (on) autoDownload();
  }
  emit();
  return updateState();
}

/** Whether a newer version may install itself now: it is on, can restart, and nothing from you for 5 hours, once a day. */
export function autoUpdateDue(s: { now: number; on: boolean; canRestart: boolean; behind: number; running: boolean; autoAt: number; lastMessage: number }): boolean {
  return s.on && s.canRestart && s.behind > 0 && !s.running && s.now - s.autoAt >= DAY && s.now - s.lastMessage >= IDLE;
}

/**
 * The Mac app: whether to download a newer version by itself now. It is on and the app can replace itself, a newer
 * version is out that did not have to be rolled back, nothing runs, it is not the one waiting already, and the
 * last download that failed was a while ago.
 */
export function appDownloadDue(s: { now: number; on: boolean; canRestart: boolean; latest?: string; current: string; skip?: string; running: boolean; ready?: string; failedAt: number }): boolean {
  return s.on && s.canRestart && !!s.latest && newer(s.latest, s.current) && s.latest !== s.skip && !s.running && s.ready !== s.latest && s.now - s.failedAt >= RETRY;
}

/** When a downloaded version is said and installs: now and a minute later, or when Later put it off to. */
export function appInstallTimes(now: number, version: string, later?: { version: string; until: number } | null, notice = NOTICE): { askAt: number; installAt: number } {
  const askAt = later && later.version === version && later.until > now ? later.until : now;
  return { askAt, installAt: askAt + notice };
}

/** A waiting version as the pages see it: counting down to its install, put off until a time, or waiting for you. */
export function readyView(r: { version: string; at: number; askAt: number; installAt: number }, now: number): UpdateReady {
  if (!r.installAt) return { version: r.version, at: r.at };
  if (now < r.askAt) return { version: r.version, at: r.at, later: r.askAt };
  return { version: r.version, at: r.at, installIn: Math.max(0, r.installAt - now) };
}

/** When to look for a new version: the first time after starting, then how often. */
export function checkTimes(kind: 'app' | 'git', checkedBefore: boolean): { first: number; every: number } {
  if (kind === 'app') return { first: (checkedBefore ? 1 : 0.5) * 60_000, every: APP_EVERY };
  return { first: 3 * 60_000, every: DAY };
}

/** The Mac app: a look at the newest release every few hours; elsewhere a daily one, and installing when you are away. */
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
  const times = checkTimes(desktop ? 'app' : 'git', !!check);
  setTimeout(tick, times.first).unref();
  setInterval(tick, times.every).unref();
  if (desktop) {
    // Nothing waits yet (a menu left from before this server started says otherwise); Restart to Update installs.
    tellDesktop({ type: 'update', version: null });
    onDesktop('update-now', () => {
      try {
        if (ready) installReady(db, false);
      } catch {}
    });
    return;
  }
  setInterval(() => {
    const now = Date.now();
    const due = autoUpdateDue({
      now,
      on: autoOn(db),
      canRestart: !!restarter(),
      behind: check?.behind ?? 0,
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

/** Why this copy cannot update itself, as Settings says it too. */
function cannotUpdate(): never {
  switch (desktop?.format) {
    case 'app':
      throw new HttpError(400, 'Move Hydor to your Applications folder to update it');
    case 'appimage':
      throw new HttpError(400, 'Put the AppImage in a folder you can write to (your home folder, say) to update it');
    case 'deb':
      throw new HttpError(400, 'Updating the .deb needs pkexec: install the new version from the Releases page');
    default:
      throw new HttpError(400, 'This copy does not update itself: install the new version from the Releases page');
  }
}

/** Whether a version downloaded by itself installs by itself too: not the .deb, which asks for your password. */
const installsAlone = () => desktop?.format !== 'deb';

// ---- the desktop apps: by release ------------------------------------------------------------------------

/** The newest release's builds for this system (desktop/scripts/feed.mjs writes it, the release carries it). */
interface Feed {
  version: string;
  files: Record<string, { url: string; sha512: string; size: number }>;
}
const feedUrl = () => process.env.HYDOR_UPDATE_FEED || `https://github.com/algoprog/hydor/releases/latest/download/hydor-${desktop?.platform ?? 'mac'}.json`;
/** This copy's build in the feed: a Mac's by its processor, the others' by their kind and processor (appimage-x64). */
const buildKey = () => (!desktop || desktop.platform === 'mac' ? process.arch : `${desktop.format}-${process.arch}`);

/** The cause of an error on the way (no answer, the connection broken off or gone quiet): another try may get through. */
const NET = Symbol('on the way');
const onTheWay = (e: unknown) => (e as Error | undefined)?.cause === NET;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const userAgent = () => ({ 'user-agent': `hydor/${config.version}` });

/**
 * A request that failed on the way, in plain words (fetch says "fetch failed", "terminated" or "The operation was
 * aborted…"), as an error on the way.
 */
function netError(e: unknown, url: string): Error {
  if (onTheWay(e)) return e as Error;
  const err = e as Error & { cause?: { code?: string; errors?: { code?: string }[] } };
  const code = err?.cause?.code ?? err?.cause?.errors?.[0]?.code;
  if (err?.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return new Error(`${hostOf(url)} did not answer in time`, { cause: NET });
  if (err?.message === 'terminated' || code === 'UND_ERR_SOCKET' || code === 'ECONNRESET' || code === 'EPIPE') return new Error('the connection broke off', { cause: NET });
  if (code) return new Error(`could not reach ${hostOf(url)} (${code})`, { cause: NET });
  if (err?.message === 'fetch failed') return new Error(`could not reach ${hostOf(url)}`, { cause: NET });
  return new Error(err?.message || String(e), { cause: NET });
}

async function feed(): Promise<Feed> {
  const url = feedUrl();
  let r: Response;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: userAgent() });
  } catch (e) {
    throw netError(e, url);
  }
  if (r.status >= 500 || r.status === 429) throw new Error(`GitHub answered ${r.status}`, { cause: NET });
  if (!r.ok) throw new Error(r.status === 404 ? `no ${SYSTEM_NAME[desktop?.platform ?? 'mac']} release is published yet` : `GitHub answered ${r.status}`);
  let f: Feed;
  try {
    f = (await r.json()) as Feed;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('the release does not say its version');
    throw netError(e, url);
  }
  if (typeof f?.version !== 'string' || typeof f.files !== 'object') throw new Error('the release does not say its version');
  return f;
}

/** The feed, asked again after each of `waits` while the network fails (as just after the computer wakes). */
async function feedTried(waits = WAITS): Promise<Feed> {
  for (let i = 0; ; i++) {
    try {
      return await feed();
    } catch (e) {
      if (!onTheWay(e) || i >= waits.length) throw e;
      console.log(`[updates] the release could not be read (${(e as Error).message}); trying again in ${waits[i] / 1000} s`);
      await sleep(waits[i]);
    }
  }
}

const mb = (n: number) => Math.round(n / 1e6);

async function sha512Of(file: string): Promise<string> {
  const hash = createHash('sha512');
  for await (const c of fs.createReadStream(file)) hash.update(c as Buffer);
  return hash.digest('base64');
}

/**
 * Downloads `url` into `dest`, checked against the size and SHA-512 the release names. It carries on where it stopped:
 * a try that breaks off, or gets nothing for `stall` ms (a connection gone quiet, the computer asleep), is followed by
 * one from its last byte (a range request), at once while each gets further and after each of `waits` while they
 * don't. When those run out it throws an error on the way (NET) and leaves what it got in `dest`.part, which the next
 * download of the same file carries on from.
 */
export async function download(
  url: string,
  dest: string,
  want: { size: number; sha512: string },
  o: { stall?: number; waits?: number[]; headers?: Record<string, string> } = {},
): Promise<void> {
  const { stall = STALL, waits = WAITS, headers = {} } = o;
  const part = `${dest}.part`;
  const size = () => {
    try {
      return fs.statSync(part).size;
    } catch {
      return 0;
    }
  };
  if (size() > want.size) fs.rmSync(part, { force: true });
  let best = size();
  let misses = 0;
  while (size() < want.size) {
    const from = size();
    let why = new Error('the file ended early', { cause: NET });
    try {
      await getFrom(url, part, from, stall, headers);
    } catch (e) {
      if (!onTheWay(e)) throw e;
      why = e as Error;
    }
    const now = size();
    if (now >= want.size) break;
    if (now > best) {
      best = now;
      misses = 0;
      console.log(`[updates] the download broke off at ${mb(now)} of ${mb(want.size)} MB (${why.message}); carrying on from there`);
      continue;
    }
    if (misses >= waits.length) {
      if (!now) throw why;
      throw new Error(`the download stopped at ${mb(now)} of ${mb(want.size)} MB (${why.message}); the next try carries on from there`, { cause: NET });
    }
    console.log(`[updates] the download got no further than ${mb(now)} of ${mb(want.size)} MB (${why.message}); trying again in ${waits[misses] / 1000} s`);
    await sleep(waits[misses++]);
  }
  if (size() !== want.size || (await sha512Of(part)) !== want.sha512) {
    fs.rmSync(part, { force: true });
    throw new Error('the download is not the build the release names (its checksum differs)');
  }
  fs.renameSync(part, dest);
}

/**
 * One try at a download: from byte `from` on (a range request) onto the end of `part`, or the whole file over it
 * when the server sends that. A failure on the way is an error on the way (NET); a refusal (404, say) a plain one.
 */
async function getFrom(url: string, part: string, from: number, stall: number, headers: Record<string, string>): Promise<void> {
  const ac = new AbortController();
  const quiet = setTimeout(() => ac.abort(new Error('the connection went quiet', { cause: NET })), stall);
  try {
    let r: Response;
    try {
      r = await fetch(url, { signal: ac.signal, headers: from ? { ...headers, range: `bytes=${from}-` } : headers });
    } catch (e) {
      throw netError(e, url);
    }
    quiet.refresh();
    const drop = () => r.body?.cancel().catch(() => {});
    if (from && r.status === 416) {
      // Nothing after the part it has: the file is shorter than the release says.
      await drop();
      fs.rmSync(part, { force: true });
      throw new Error('the download is not the build the release names (its checksum differs)');
    }
    if (!r.ok || !r.body) {
      await drop();
      // A server's trouble may pass; a refusal (404, say) does not.
      throw new Error(`the download failed (${r.status})`, r.status >= 500 || r.status === 408 || r.status === 429 ? { cause: NET } : undefined);
    }
    const ranged = from > 0 && r.status === 206;
    if (ranged && Number(/^bytes (\d+)-/.exec(r.headers.get('content-range') ?? '')?.[1]) !== from) {
      await drop();
      fs.rmSync(part, { force: true });
      throw new Error('the server sent another part of the file', { cause: NET });
    }
    // A 200 is the whole file, from its start: it goes over the part.
    const out = fs.createWriteStream(part, { flags: ranged ? 'a' : 'w' });
    const body = Readable.fromWeb(r.body as import('node:stream/web').ReadableStream);
    body.on('data', () => quiet.refresh());
    try {
      await pipeline(body, out);
    } catch (e) {
      // The disk's errors (no space left) are not the network's: another try would not help.
      if ((e as NodeJS.ErrnoException).syscall) throw e;
      throw netError(e, url);
    } finally {
      if (!out.closed) await once(out, 'close').catch(() => {});
    }
  } finally {
    clearTimeout(quiet);
  }
}

async function checkRelease(): Promise<UpdateState | null> {
  try {
    const f = await feed();
    const out = newer(f.version, config.version) && !!f.files[buildKey()];
    check = { behind: out ? 1 : 0, latest: out ? f.version : undefined, checkedAt: Date.now() };
  } catch (e) {
    check = { behind: check?.behind ?? 0, latest: check?.latest, checkedAt: Date.now(), error: (e as Error).message.slice(0, 200) };
  }
  autoDownload();
  emit();
  return updateState();
}

/** The version just found, downloaded by itself when it may (appDownloadDue). */
function autoDownload() {
  if (!ctx || !desktop) return;
  const due = appDownloadDue({
    now: Date.now(),
    on: autoOn(ctx.db),
    canRestart: !!restarter(),
    latest: check?.latest,
    current: config.version,
    skip: kvGet(ctx.db, 'update.skip') || undefined,
    running: !!running,
    ready: ready?.version,
    failedAt,
  });
  if (!due) return;
  // A newer version than the one waiting: that one goes (its download is replaced).
  if (ready) {
    ready = null;
    schedule();
  }
  running = { phase: 'download', since: Date.now(), auto: true };
  void updateApp(ctx.db, true, 'wait');
}

const run = (cmd: string, args: string[], timeout = 120_000) =>
  new Promise<{ ok: boolean; out: string }>((resolve) => execFile(cmd, args, { timeout, maxBuffer: 16 << 20 }, (err, stdout, stderr) => resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}`.trim() || (err?.message ?? '') })));

/** The team a Mac app is signed by, or null when it is not signed by a developer. */
async function teamOf(app: string): Promise<string | null> {
  const r = await run('codesign', ['-dv', '--verbose=2', app]);
  const team = /^TeamIdentifier=(.+)$/m.exec(r.out)?.[1]?.trim();
  return team && team !== 'not set' ? team : null;
}

/**
 * Downloads this copy's build, checks it is the one the release names, and for a Mac unpacks it next to the others.
 * Its path: the new Hydor.app, AppImage, installer (.exe) or package (.deb).
 */
async function fetchBuild(to: string, file: Feed['files'][string]): Promise<string> {
  const dir = path.join(desktop!.cache, 'updates');
  const mac = desktop!.platform === 'mac';
  const ext = { app: '.zip', nsis: '-setup.exe', appimage: '.AppImage', deb: '.deb', dir: '', dev: '.zip' }[desktop!.format];
  // Named by its checksum too, so that a part left by a download that stopped is carried on only for the same build.
  const zip = path.join(dir, `Hydor-${to}-${file.sha512.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)}${ext}`);
  fs.mkdirSync(dir, { recursive: true });
  // What earlier downloads left goes, but for that part.
  for (const n of fs.readdirSync(dir)) if (n !== `${path.basename(zip)}.part`) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  await download(file.url, zip, file, { headers: userAgent() });
  if (!mac) {
    if (desktop!.format === 'appimage') fs.chmodSync(zip, 0o755);
    return zip;
  }
  const out = path.join(dir, 'app');
  const x = await run('ditto', ['-x', '-k', zip, out], 10 * 60_000);
  fs.rmSync(zip, { force: true });
  if (!x.ok) throw new Error(`could not unpack it: ${x.out.trim().split('\n').pop()}`);
  const app = fs.readdirSync(out).find((n) => n.endsWith('.app'));
  if (!app) throw new Error('the download has no app in it');
  return path.join(out, app);
}

/**
 * Downloads the newest version and checks it; then installs it at once (Update now), or keeps it waiting for its
 * notice (`wait`: found by itself).
 */
async function updateApp(db: DB, auto: boolean, then: 'install' | 'wait') {
  const at = Date.now();
  const from = config.version;
  const done = (r: Omit<UpdateResult, 'at' | 'auto' | 'from'>) => {
    kvSet(db, 'update.last', JSON.stringify({ ...r, from, at, auto }));
    running = undefined;
    emit();
  };
  const fail = (error: string, to?: string, again = false) => {
    console.log(`[updates] ${auto ? 'the automatic update' : 'the update'}${to ? ` to ${to}` : ''} failed: ${error}`);
    if (then === 'wait') {
      failedAt = Date.now();
      // Stopped on the way (the network, not the build): it tries again in an hour, carrying on from what it has.
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = again ? setTimeout(() => void checkUpdates().catch(() => {}), RETRY) : null;
      retryTimer?.unref?.();
    }
    done({ ok: false, to, error });
  };
  let to: string | undefined;
  try {
    const f = await feedTried();
    const file = f.files[buildKey()];
    if (!newer(f.version, from) || !file) {
      check = { behind: 0, checkedAt: Date.now() };
      if (then === 'wait') {
        running = undefined;
        return emit();
      }
      return done({ ok: true, to: from });
    }
    to = f.version;
    const app = await fetchBuild(to, file);
    // A signed Mac app takes only a build signed by the same developer.
    const team = desktop!.platform === 'mac' ? await teamOf(desktop!.app) : null;
    if (team) {
      const v = await run('codesign', ['--verify', '--deep', '--strict', app]);
      if (!v.ok) return fail('the new version’s signature does not check out', to);
      if ((await teamOf(app)) !== team) return fail('the new version is signed by someone else', to);
    }
    running = undefined;
    ready = { version: to, app, at: Date.now(), askAt: 0, installAt: 0 };
    if (then === 'install') return installReady(db, auto);
    if (autoOn(db) && installsAlone()) ready = { ...ready, ...appInstallTimes(Date.now(), to, laterOf(db)) };
    schedule();
    emit();
  } catch (e) {
    fail((e as Error).message, to, onTheWay(e));
  }
}

/** The version Later put off, and until when. */
function laterOf(db: DB): { version: string; until: number } | null {
  try {
    const l = JSON.parse(kvGet(db, 'update.later') || 'null');
    return l && typeof l.version === 'string' && typeof l.until === 'number' ? l : null;
  } catch {
    return null;
  }
}

/**
 * The waiting version's turn: the menu bar offers it; when its time to be said comes, a notification from the Mac
 * and the pages' note (they count down from installIn), and a minute later it installs.
 */
function schedule() {
  if (readyTimer) clearTimeout(readyTimer);
  readyTimer = null;
  const r = ready;
  if (!r) return void tellDesktop({ type: 'update', version: null });
  const now = Date.now();
  if (!r.installAt || now < r.askAt) {
    tellDesktop({ type: 'update', version: r.version });
    if (r.installAt) {
      readyTimer = setTimeout(() => {
        schedule();
        emit();
      }, r.askAt - now);
      readyTimer.unref?.();
    }
    return;
  }
  if (!r.told) {
    r.told = true;
    const tr = ctx ? appWords(ctx.db) : (s: string) => s;
    tellDesktop({ type: 'update', version: r.version, notice: { title: tr(UPDATE_WORDS.title(r.version)), body: tr(UPDATE_WORDS.body), action: tr(UPDATE_WORDS.action) } });
  } else tellDesktop({ type: 'update', version: r.version });
  readyTimer = setTimeout(() => {
    if (ctx) installReady(ctx.db, true);
  }, Math.max(0, r.installAt - now));
  readyTimer.unref?.();
}

/** Hands the waiting version to the app, which stops this server, swaps itself for it and starts again; agents carry on. */
function installReady(db: DB, auto: boolean) {
  const r = ready;
  if (!r || running) return;
  if (readyTimer) clearTimeout(readyTimer);
  readyTimer = null;
  ready = null;
  const from = config.version;
  const at = Date.now();
  kvSet(db, 'update.last', JSON.stringify({ ok: true, from, to: r.version, at, auto }));
  kvSet(db, 'update.skip', '');
  kvSet(db, 'update.later', '');
  running = { phase: 'restart', since: at, auto };
  emit();
  if (!tellDesktop({ type: 'install', app: r.app, from, to: r.version })) {
    kvSet(db, 'update.last', JSON.stringify({ ok: false, from, to: r.version, at, auto, error: 'the app around the server did not answer' }));
    running = undefined;
    emit();
  }
}

/** Restart now: the waiting version installs at once. */
export function installUpdateNow(): UpdateState | null {
  if (!ctx) throw new HttpError(503, 'Starting up');
  if (running) throw new HttpError(409, 'An update is already running');
  if (!ready) throw new HttpError(409, 'No new version is waiting to be installed');
  installReady(ctx.db, false);
  return updateState();
}

/** Later: the waiting version asks again in 4 hours (and keeps waiting in the menu bar and Settings meanwhile). */
export function laterUpdate(): UpdateState | null {
  if (!ctx) throw new HttpError(503, 'Starting up');
  if (!ready) throw new HttpError(409, 'No new version is waiting to be installed');
  const until = Date.now() + LATER;
  kvSet(ctx.db, 'update.later', JSON.stringify({ version: ready.version, until }));
  if (ready.installAt) ready = { ...ready, askAt: until, installAt: until + NOTICE, told: false };
  schedule();
  emit();
  return updateState();
}

// Newer versions, for a copy installed from git: once a day it fetches its upstream and counts the
// commits this checkout is behind. "Update now" in Settings pulls, builds and restarts the server;
// a copy that comes back by itself when the server exits (the installer's systemd service, the
// Docker image's restart loop: both leave the agents running) also updates itself, after 5 hours
// without a message from you and at most once a day. Agents may be at work meanwhile.
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UpdateResult, UpdateState } from '../shared/types.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
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
  return { ...check, auto: !!ctx && kvGet(ctx.db, 'update.auto') !== '0', canRestart: !!restarter(), running, last };
}

const emit = () => {
  if (ctx && check) kvSet(ctx.db, 'update.check', JSON.stringify(check));
  ctx?.onChange(updateState());
};

export async function checkUpdates(): Promise<UpdateState | null> {
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
    if (fs.existsSync(path.join(ROOT, '.git'))) check = JSON.parse(kvGet(db, 'update.check') ?? 'null');
  } catch {}
  const tick = () => checkUpdates().catch(() => {});
  setTimeout(tick, 3 * 60_000).unref();
  setInterval(tick, DAY).unref();
  setInterval(() => {
    const now = Date.now();
    const due = autoUpdateDue({
      now,
      on: kvGet(db, 'update.auto') !== '0',
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

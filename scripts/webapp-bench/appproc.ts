// Starting and stopping the built app, the way anyone would run it in production: one command in the app's folder, the port and the data folder in the environment names
// judge.json gives, nothing else of this computer's environment but the path. The app is a process group of its own, so that what it started is stopped with it.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { JudgeJson } from './acceptance.ts';
import { fill } from './acceptance.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Ran {
  status: number | null;
  out: string;
  timedOut: boolean;
  seconds: number;
}

/** Runs a shell command in a folder at the lowest priority, with the judge's own environment (no inherited keys), and gives what it said. */
export function sh(command: string, cwd: string, minutes: number, extra: Record<string, string> = {}): Ran {
  const began = Date.now();
  const r = spawnSync('nice', ['-n', '19', 'sh', '-c', command], {
    cwd,
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', CI: '1', CUDA_VISIBLE_DEVICES: '', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false', ...extra },
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: minutes * 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, timedOut: r.error !== undefined && /ETIMEDOUT/.test(String(r.error)), seconds: (Date.now() - began) / 1000 };
}

export const tail = (text: string, n = 6): string => text.trim().split('\n').slice(-n).join(' | ').replace(/\s+/g, ' ').slice(0, 500);

/** The names of the environment variables that hold a secret: those judge.json lists, and any it sets whose name says so. */
export function secretNames(j: JudgeJson): string[] {
  const named = new Set(j.start.secrets ?? []);
  if (j.payments?.secretEnv) named.add(j.payments.secretEnv);
  for (const name of [...Object.keys(j.start.env ?? {}), ...Object.keys(j.start.judgeEnv ?? {})]) if (/SECRET|TOKEN|PASSWORD|API_?KEY|PRIVATE/i.test(name)) named.add(name);
  return [...named];
}

/** A secret the judge plants in every app's environment, so that an app that gives away its whole environment is found even when it has no secret of its own. */
export const DECOY = 'JUDGE_PLANTED_SECRET';

export interface Started {
  env: Record<string, string>;
  /** The value each secret had in this run. */
  secrets: Record<string, string>;
}

/** The environment the app is started with. A secret that is given as `{secret}` (or not given a value) is a new random one; one given a value is that value. */
export function environment(j: JudgeJson, port: number, dataDir: string, withJudgeEnv: boolean): Started {
  const origin = `http://127.0.0.1:${port}`;
  const secrets: Record<string, string> = {};
  const random = () => randomBytes(24).toString('hex');
  const names = [...secretNames(j), DECOY];
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...(j.start.env ?? {}), ...(withJudgeEnv ? (j.start.judgeEnv ?? {}) : {}) })) values[k] = v;
  for (const name of names) if (values[name] === undefined) values[name] = '{secret}';
  const env: Record<string, string> = { NODE_ENV: 'production', TZ: 'Europe/London', HOST: '0.0.0.0', CUDA_VISIBLE_DEVICES: '' };
  for (const [k, v] of Object.entries(values)) {
    const secret = names.includes(k) ? random() : '';
    const text = fill(v, { origin, port: String(port), data: dataDir, secret });
    env[k] = text;
    if (names.includes(k)) secrets[k] = text;
  }
  env[j.start.port] = String(port);
  env[j.start.data] = dataDir;
  return { env, secrets };
}

export class AppProcess {
  child: ChildProcess | undefined;
  log = '';
  readonly dir: string;
  readonly port: number;
  startedInSeconds = 0;

  constructor(dir: string, port: number) {
    this.dir = dir;
    this.port = port;
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Starts it and waits until it answers (anything but a server error) at `ready`; throws a sentence when it does not within the time. */
  async start(j: JudgeJson, env: Record<string, string>, seconds: number): Promise<void> {
    this.log = '';
    const began = Date.now();
    this.child = spawn('nice', ['-n', '19', 'sh', '-c', `exec ${j.start.command}`], {
      cwd: this.dir,
      env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    this.child.stdout?.on('data', (d) => (this.log += d));
    this.child.stderr?.on('data', (d) => (this.log += d));
    const ready = j.start.ready ?? '/';
    while (Date.now() - began < seconds * 1000) {
      if (this.child.exitCode !== null) break;
      try {
        const r = await fetch(`${this.origin}${ready}`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
        await r.arrayBuffer();
        if (r.status < 500) {
          this.startedInSeconds = (Date.now() - began) / 1000;
          return;
        }
      } catch {}
      await sleep(150);
    }
    const said = tail(this.log);
    const exited = this.child.exitCode !== null;
    await this.stop();
    throw new Error(exited ? `the app stopped by itself${said ? `: ${said}` : ''}` : `the app did not answer at ${ready} within ${seconds} seconds${said ? `: ${said}` : ''}`);
  }

  async answering(): Promise<boolean> {
    try {
      const r = await fetch(`${this.origin}/`, { redirect: 'manual', signal: AbortSignal.timeout(1500) });
      await r.arrayBuffer();
      return true;
    } catch {
      return false;
    }
  }

  /** Asks it to stop (SIGTERM to its group) and says whether it was gone, and nothing answered on the port, within `seconds`; whatever is left is killed. */
  async stop(seconds = 10): Promise<{ stopped: boolean; took: number }> {
    const child = this.child;
    this.child = undefined;
    if (!child?.pid) return { stopped: true, took: 0 };
    const began = Date.now();
    const exited = new Promise<void>((r) => (child.exitCode !== null ? r() : child.once('exit', () => r())));
    const signal = (s: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, s);
      } catch {}
    };
    signal('SIGTERM');
    await Promise.race([exited, sleep(seconds * 1000)]);
    let clean = child.exitCode !== null || child.signalCode !== null;
    // the leader is gone: wait for the rest of its group and for the port to be free
    while (clean && Date.now() - began < seconds * 1000) {
      if (!(await this.answering())) break;
      await sleep(150);
    }
    if (clean && (await this.answering())) clean = false;
    signal('SIGKILL');
    return { stopped: clean, took: (Date.now() - began) / 1000 };
  }
}

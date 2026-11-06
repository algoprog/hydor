// Small tools for getting whisper.cpp and its models: a download that resumes and checks what arrived,
// unpacking, finding commands, and running one while reading its output.
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface Remote {
  url: string;
  /** Known up front for the files the app pins; checked once they are here. */
  bytes?: number;
  sha256?: string;
}

export async function sha256(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

/**
 * Downloads `r` to `dest`, resuming a partial download (`dest.part`), and checks its size and SHA-256
 * when they are known. `progress` gets the bytes as they come; the total is 0 while unknown.
 */
export async function fetchFile(r: Remote, dest: string, o: { signal: AbortSignal; progress: (done: number, total: number) => void }): Promise<void> {
  const name = path.basename(dest);
  if (fs.existsSync(dest)) return void o.progress(fs.statSync(dest).size, fs.statSync(dest).size);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let start = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (r.bytes && start > r.bytes) {
    fs.rmSync(part, { force: true });
    start = 0;
  }
  if (!r.bytes || start < r.bytes) {
    const res = await fetch(r.url, { headers: start ? { range: `bytes=${start}-` } : {}, signal: o.signal, redirect: 'follow' });
    if (res.status === 416 && start) {
      // The partial file is whole already, or not what the server has: the checks below tell.
    } else {
      if (!res.ok || !res.body) throw new Error(`${name}: the download answered ${res.status} ${res.statusText}`.trim());
      if (start && res.status !== 206) start = 0;
      const total = r.bytes ?? (Number(res.headers.get('content-length') ?? 0) ? Number(res.headers.get('content-length')) + start : 0);
      let done = start;
      o.progress(done, total);
      const count = new Transform({
        transform(chunk, _enc, cb) {
          done += chunk.length;
          o.progress(done, total);
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body as any), count, fs.createWriteStream(part, { flags: start ? 'a' : 'w' }), { signal: o.signal });
    }
  }
  const size = fs.statSync(part).size;
  if (r.bytes && size !== r.bytes) {
    fs.rmSync(part, { force: true });
    throw new Error(`${name} did not arrive whole (${size} of ${r.bytes} bytes); try again`);
  }
  if (r.sha256 && (await sha256(part)) !== r.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(`${name} arrived damaged (its checksum is wrong); try again`);
  }
  fs.renameSync(part, dest);
}

/** A command on the PATH (or a path that exists and runs). */
export function which(cmd: string): string | null {
  const dirs = cmd.includes('/') ? [''] : (process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin').split(':').concat(path.join(process.env.HOME ?? '', '.local/bin'));
  for (const d of dirs) {
    const p = d ? path.join(d, cmd) : cmd;
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return p;
    } catch {}
  }
  return null;
}

/** How a command ended: its exit code (137 when a signal ended it), its output (both streams), and whether `timeout` ended it. */
export interface RunResult {
  code: number;
  out: string;
  err: string;
  timedOut?: boolean;
}

/** Runs a command to its end: its exit code and output (both streams), killed after `timeout`. */
export function run(cmd: string, args: string[], o: { timeout?: number; cwd?: string; signal?: AbortSignal; env?: NodeJS.ProcessEnv; onLine?: (line: string) => void } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new Error('Cancelled'));
    const p = spawn(cmd, args, { cwd: o.cwd, env: o.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let rest = '';
    let timedOut = false;
    const line = (s: string) => {
      if (!o.onLine) return;
      rest += s;
      const lines = rest.split(/\r?\n|\r/);
      rest = lines.pop() ?? '';
      for (const l of lines) o.onLine(l);
    };
    p.stdout.on('data', (b: Buffer) => {
      const s = b.toString();
      if (out.length < 4 << 20) out += s;
      line(s);
    });
    p.stderr.on('data', (b: Buffer) => {
      const s = b.toString();
      if (err.length < 4 << 20) err += s;
      line(s);
    });
    const timer = o.timeout
      ? setTimeout(() => {
          timedOut = true;
          p.kill('SIGKILL');
        }, o.timeout)
      : null;
    const abort = () => p.kill('SIGKILL');
    o.signal?.addEventListener('abort', abort, { once: true });
    p.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code, sig) => {
      if (timer) clearTimeout(timer);
      o.signal?.removeEventListener('abort', abort);
      if (o.signal?.aborted) return reject(new Error('Cancelled'));
      resolve({ code: code ?? (sig ? 137 : 1), out, err, timedOut });
    });
  });
}

/** Unpacks a .tar.gz into `dir`, dropping its top folder. */
export function untar(file: string, dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) =>
    execFile('tar', ['-xzf', file, '-C', dir, '--strip-components=1'], { timeout: 10 * 60_000, maxBuffer: 4 << 20 }, (e, _o, err) =>
      e ? reject(new Error(`Could not unpack ${path.basename(file)}: ${(err || e.message).trim().split('\n').pop()}`)) : resolve(),
    ),
  );
}

export function dirSize(p: string): number {
  try {
    const st = fs.lstatSync(p);
    if (!st.isDirectory()) return st.isFile() ? st.size : 0;
    return fs.readdirSync(p).reduce((a, f) => a + dirSize(path.join(p, f)), 0);
  } catch {
    return 0;
  }
}

/** Free space where `dir` is (or would be), in bytes; Infinity when it cannot be told. */
export function freeBytes(dir: string): number {
  for (let d = dir; ; d = path.dirname(d)) {
    try {
      const s = fs.statfsSync(d);
      return s.bavail * s.bsize;
    } catch {}
    if (d === path.dirname(d)) return Infinity;
  }
}

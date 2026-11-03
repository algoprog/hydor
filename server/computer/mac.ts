// Computer use on the Mac itself, with the programs macOS has: screencapture for the screen (the main display, no
// sound), sips to scale it down to what models read well and make it a JPEG, osascript for the driver (driver.ts),
// and open for apps. Each runs as a child of the server, which runs in the Mac app, so macOS asks for (and checks)
// the app's permissions: Screen Recording to see, Accessibility to use the mouse and keyboard.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DRIVER, type DriverOut } from './driver.ts';
import { driverTimeout, fitSize, jpegSize, MAX_SIDE, pngSize, type Geometry, type Op } from './plan.ts';

/** Runs a program; its error is the last line it wrote (osascript's "execution error: …" without the code). */
function exec(cmd: string, args: string[], timeout: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, signal, maxBuffer: 8 << 20, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (!err) return resolve(String(stdout));
      if (signal?.aborted) return reject(new Error('Stopped'));
      if ((err as { code?: string }).code === 'ENOENT') return reject(new Error(`${path.basename(cmd)} is not on this computer (computer use needs macOS)`));
      const last = String(stderr || '').trim().split('\n').pop() || err.message;
      reject(new Error(last.replace(/^.*execution error:\s*/, '').replace(/^Error:\s*/, '').replace(/\s*\(-?\d+\)\s*$/, '').slice(0, 300)));
    });
  });
}

/** Runs the driver's steps. */
export async function drive(ops: Op[], signal?: AbortSignal): Promise<DriverOut> {
  const out = await exec('/usr/bin/osascript', ['-l', 'JavaScript', '-e', DRIVER, JSON.stringify(ops)], driverTimeout(ops), signal);
  try {
    return JSON.parse(out.trim() || '{}');
  } catch {
    throw new Error(`the driver answered “${out.trim().slice(0, 120)}”`);
  }
}

export interface Shot {
  jpeg: Buffer;
  geo: Geometry;
  /** The app in front, the pointer (in points) and how many displays there are. */
  app?: string;
  pos?: { x: number; y: number };
  displays?: number;
}

/** The main display, scaled down to MAX_SIDE on its longer side, as a JPEG; and where it is in points. */
export async function screenshot(signal?: AbortSignal): Promise<Shot> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'naget-screen-'));
  try {
    const png = path.join(dir, 'screen.png');
    const [, out] = await Promise.all([exec('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', png], 20_000, signal), drive([{ op: 'info' }], signal)]);
    const head = Buffer.alloc(24);
    let size: { width: number; height: number } | null = null;
    try {
      const fd = await fs.promises.open(png, 'r');
      await fd.read(head, 0, 24, 0);
      await fd.close();
      size = pngSize(head);
    } catch {}
    if (!size) throw new Error('screencapture made no picture (is the screen locked or asleep?)');
    const fit = fitSize(size.width, size.height);
    const jpg = path.join(dir, 'screen.jpg');
    const scale = fit.width !== size.width || fit.height !== size.height ? ['-Z', String(MAX_SIDE)] : [];
    await exec('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', ...scale, png, '--out', jpg], 20_000, signal);
    const jpeg = await fs.promises.readFile(jpg);
    const dims = jpegSize(jpeg) ?? fit;
    const d = out.info?.display;
    if (!d || !(d.w > 0 && d.h > 0)) throw new Error('could not read the size of the main display');
    return { jpeg, geo: { width: dims.width, height: dims.height, x: d.x, y: d.y, w: d.w, h: d.h }, app: out.info?.app, pos: out.info?.pos, displays: out.info?.displays };
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Opens (or brings forward) an app by its name. */
export async function openApp(name: string, signal?: AbortSignal): Promise<void> {
  await exec('/usr/bin/open', ['-a', name], 20_000, signal);
}

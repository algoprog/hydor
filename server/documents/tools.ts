// The programs documents use when they are here (pdftotext, LibreOffice), and where their helpers keep
// files (the app's data folder). Node built-ins only: Custom's own process uses this too.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** The app's data folder, worked out as the server does (server/config.ts). */
export function dataDir(): string {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.env.NAGET_DATA_DIR) return process.env.NAGET_DATA_DIR;
  const dir = path.join(os.homedir(), '.naget-agent');
  const older = path.join(os.homedir(), '.web-agent');
  return !fs.existsSync(dir) && fs.existsSync(older) ? older : dir;
}

const seen = new Map<string, { at: number; path: string | null }>();

/** A program on the PATH (or at one of `also`), looked up again after a minute. */
export function which(cmd: string, also: string[] = []): string | null {
  const hit = seen.get(cmd);
  if (hit && Date.now() - hit.at < 60_000) return hit.path;
  let found: string | null = null;
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];
  for (const c of [...dirs.filter(Boolean).map((d) => path.join(d, cmd)), ...also]) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
      if (fs.statSync(c).isFile()) {
        found = c;
        break;
      }
    } catch {}
  }
  seen.set(cmd, { at: Date.now(), path: found });
  return found;
}

export interface RunResult {
  ok: boolean;
  out: string;
  err: string;
}

export function run(cmd: string, args: string[], opts: { timeout: number; maxBuffer?: number; env?: NodeJS.ProcessEnv; cwd?: string }): Promise<RunResult> {
  return new Promise((resolve) =>
    execFile(cmd, args, { timeout: opts.timeout, maxBuffer: opts.maxBuffer ?? 64 << 20, env: opts.env, cwd: opts.cwd, encoding: 'utf8', killSignal: 'SIGKILL' }, (e, out, err) =>
      resolve({ ok: !e, out: String(out ?? ''), err: String(err ?? '') || (e ? e.message : '') }),
    ),
  );
}

// ---- LibreOffice ----------------------------------------------------------------------------------

export const soffice = () =>
  which('soffice', ['/usr/lib/libreoffice/program/soffice', '/opt/libreoffice/program/soffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice', '/snap/bin/libreoffice']) ?? which('libreoffice');

/** LibreOffice's own settings for the app: macros never run (documents are untrusted). */
function profile(): string {
  const dir = path.join(dataDir(), 'office', 'lo-profile');
  const xcu = path.join(dir, 'user', 'registrymodifications.xcu');
  if (!fs.existsSync(xcu)) {
    fs.mkdirSync(path.dirname(xcu), { recursive: true });
    const prop = (name: string, value: string) =>
      `<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="${name}" oor:op="fuse"><value>${value}</value></prop></item>`;
    fs.writeFileSync(
      xcu,
      `<?xml version="1.0" encoding="UTF-8"?>\n<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n${prop('MacroSecurityLevel', '3')}\n${prop('DisableMacrosExecution', 'true')}\n</oor:items>\n`,
    );
  }
  return dir;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Converts a document with LibreOffice (to "pdf", "docx"…) into `dest`, one conversion at a time (they
 * share LibreOffice's settings folder). It works on a copy in a folder of its own, so LibreOffice's
 * lock files never land beside the user's file.
 */
export function convert(file: string, to: string, dest: string, timeout = 120_000): Promise<string> {
  const job = queue.then(async () => {
    const bin = soffice();
    if (!bin) throw new Error('LibreOffice is not installed here');
    const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'naget-office-'));
    try {
      const input = path.join(work, `document${path.extname(file).toLowerCase() || '.bin'}`);
      await fs.promises.copyFile(file, input);
      const r = await run(bin, [`-env:UserInstallation=${pathToFileURL(profile()).href}`, '--headless', '--invisible', '--norestore', '--nolockcheck', '--nologo', '--nodefault', '--convert-to', to, '--outdir', work, input], {
        timeout,
        env: { ...process.env, SAL_USE_VCLPLUGIN: 'svp' },
        cwd: work,
      });
      const made = path.join(work, `document.${to.split(':')[0]}`);
      if (!fs.existsSync(made)) {
        const why = `${r.err}\n${r.out}`.trim().split('\n').filter(Boolean).pop();
        throw new Error(`LibreOffice could not convert it${why ? ` (${why.slice(0, 200)})` : ''}`);
      }
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(made, `${dest}.part`);
      await fs.promises.rename(`${dest}.part`, dest);
      return dest;
    } finally {
      await fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  });
  queue = job.catch(() => {});
  return job;
}

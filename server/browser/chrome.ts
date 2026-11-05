// Which Chromium the browser runs, and running it: a system Chrome or Chromium, else Playwright's
// cached one (the full browser before its headless shell), else Chrome for Testing, downloaded into
// the app's data folder when the user asks.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import type { ChromeDownload, ChromeInfo } from '../../shared/browser.ts';
import { config } from '../config.ts';
import { proxyArgs } from './proxy.ts';

export const BROWSER_DIR = path.join(config.dataDir, 'browser');
const CFT_DIR = path.join(BROWSER_DIR, 'chrome');

const exists = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

function onPath(name: string): string | null {
  for (const d of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!d) continue;
    const p = path.join(d, name);
    if (exists(p)) return p;
  }
  return null;
}

/** A folder's entries matching a pattern, newest revision first. */
function entries(dir: string, re: RegExp): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => re.test(n))
      .sort((a, b) => Number(b.match(/(\d+)$/)?.[1] ?? 0) - Number(a.match(/(\d+)$/)?.[1] ?? 0) || b.localeCompare(a));
  } catch {
    return [];
  }
}

const versions = new Map<string, string>();
function versionOf(bin: string): string | undefined {
  return versions.get(bin);
}
/** Reads each browser's version once (in the background: `chrome --version` takes a moment). */
function readVersion(bin: string) {
  if (versions.has(bin)) return;
  versions.set(bin, '');
  execFile(bin, ['--version'], { timeout: 10_000 }, (err, out) => {
    const v = !err ? /(\d+\.\d+\.\d+\.\d+)/.exec(String(out))?.[1] : undefined;
    versions.set(bin, v ?? '');
  });
}

function systemChromes(): ChromeInfo[] {
  const out: ChromeInfo[] = [];
  const add = (p: string | null, label: string) => p && exists(p) && !out.some((c) => c.path === p) && out.push({ path: p, source: 'system', label });
  if (process.platform === 'darwin') {
    add('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'Google Chrome');
    add('/Applications/Chromium.app/Contents/MacOS/Chromium', 'Chromium');
    add(path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), 'Google Chrome');
  } else if (process.platform === 'win32') {
    for (const base of [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean) as string[])
      add(path.join(base, 'Google/Chrome/Application/chrome.exe'), 'Google Chrome');
  } else {
    for (const [n, label] of [
      ['google-chrome-stable', 'Google Chrome'],
      ['google-chrome', 'Google Chrome'],
      ['chromium', 'Chromium'],
      ['chromium-browser', 'Chromium'],
    ] as const)
      add(onPath(n), label);
    add('/opt/google/chrome/chrome', 'Google Chrome');
    add('/snap/bin/chromium', 'Chromium');
  }
  return out;
}

function playwrightChromes(): ChromeInfo[] {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Caches/ms-playwright') : path.join(os.homedir(), '.cache/ms-playwright'));
  const full: ChromeInfo[] = [];
  const shell: ChromeInfo[] = [];
  for (const d of entries(root, /^chromium-\d+$/)) {
    const base = path.join(root, d);
    for (const p of [
      'chrome-linux64/chrome',
      'chrome-linux/chrome',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-win/chrome.exe',
      'chrome-win64/chrome.exe',
    ])
      if (exists(path.join(base, p))) {
        full.push({ path: path.join(base, p), source: 'playwright', label: `Playwright’s Chromium (${d.replace('chromium-', 'r')})` });
        break;
      }
  }
  for (const d of entries(root, /^chromium_headless_shell-\d+$/)) {
    const base = path.join(root, d);
    for (const p of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-win64/chrome-headless-shell.exe'])
      if (exists(path.join(base, p))) {
        shell.push({ path: path.join(base, p), source: 'playwright', label: `Playwright’s headless shell (${d.replace('chromium_headless_shell-', 'r')})`, shell: true });
        break;
      }
  }
  return [...full, ...shell];
}

/** Chrome for Testing as downloaded here, newest first. */
function downloadedChromes(): ChromeInfo[] {
  const out: ChromeInfo[] = [];
  for (const v of entries(CFT_DIR, /^\d+\.\d+\.\d+\.\d+$/).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
    for (const p of [
      'chrome-linux64/chrome',
      'chrome-linux-arm64/chrome',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-win64/chrome.exe',
    ]) {
      const f = path.join(CFT_DIR, v, p);
      if (exists(f)) {
        out.push({ path: f, source: 'downloaded', label: `Chrome for Testing ${v}`, version: v });
        break;
      }
    }
  }
  return out;
}

let found: { at: number; list: ChromeInfo[] } | null = null;

/** Every Chromium found, the best first: the system's, one downloaded here, Playwright's full one, its headless shell. */
export function findChromes(): ChromeInfo[] {
  if (found && Date.now() - found.at < 30_000) return found.list.map((c) => ({ ...c, version: c.version ?? (versionOf(c.path) || undefined) }));
  const pw = playwrightChromes();
  const list = [...systemChromes(), ...downloadedChromes(), ...pw.filter((c) => !c.shell), ...pw.filter((c) => c.shell)];
  for (const c of list) {
    readVersion(c.path);
    c.version ??= versionOf(c.path) || undefined;
  }
  found = { at: Date.now(), list };
  return list;
}

/** Looks again next time (one was downloaded). */
export const forgetChromes = () => (found = null);

/** The Chromium to run: the chosen one while it is there, else the best found. */
export function pickChrome(chosen: string): ChromeInfo | null {
  const all = findChromes();
  return (chosen && all.find((c) => c.path === chosen)) || all[0] || null;
}

// ---- running it -----------------------------------------------------------------------------------

/** Chromium binaries whose sandbox this system refuses (unprivileged user namespaces off, or root). */
const noSandbox = new Set<string>();
export const sandboxOff = () => noSandbox.size > 0;

export interface Launched {
  proc: ChildProcess;
  wsUrl: string;
}

/** A user agent without "HeadlessChrome" in it, which many sites turn away. */
export function plainUserAgent(ua: string): string {
  return ua.replace(/HeadlessChrome\//, 'Chrome/');
}

interface LaunchOpts {
  userDataDir: string;
  headless: boolean;
  shell?: boolean;
  /** The port of the app's proxy every connection goes through (proxy.ts). */
  proxy?: number;
  /**
   * Words at their fonts' own widths: Chromium on Linux otherwise rounds each letter's advance to a whole pixel, so a
   * PDF or picture made on a Linux server sets lines wider than the editor shows them on a Mac or Windows (or Word).
   */
  exactText?: boolean;
}

function args(o: LaunchOpts, sandbox: boolean): string[] {
  const a = [
    '--remote-debugging-port=0',
    `--user-data-dir=${o.userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-dev-shm-usage',
    '--disable-features=Translate,MediaRouter,OptimizationHints,AutofillServerCommunication,InterestFeedContentSuggestions',
    '--metrics-recording-only',
    '--password-store=basic',
    '--use-mock-keychain',
    '--mute-audio',
    '--force-color-profile=srgb',
    // WebRTC must not reveal or reach the local network either.
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--window-size=1280,800',
    ...(o.proxy ? proxyArgs(o.proxy) : []),
  ];
  if (o.headless || o.shell) a.push('--headless');
  if (o.exactText) a.push('--font-render-hinting=none');
  if (!sandbox) a.push('--no-sandbox');
  a.push('about:blank');
  return a;
}

function start(bin: string, o: LaunchOpts, sandbox: boolean): Promise<Launched> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args(o, sandbox), { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env } });
    let err = '';
    let done = false;
    const finish = (e: Error | null, url?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (e) {
        try {
          proc.kill('SIGKILL');
        } catch {}
        reject(e);
      } else resolve({ proc, wsUrl: url! });
    };
    const timer = setTimeout(() => finish(new Error(`The browser did not start in time${err ? `: ${err.trim().split('\n').pop()}` : ''}`)), 30_000);
    proc.stderr!.on('data', (d) => {
      const s = String(d);
      if (err.length < 20_000) err += s;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) finish(null, m[1]);
    });
    proc.on('error', (e) => finish(e));
    proc.on('exit', (code) => finish(Object.assign(new Error(`The browser stopped at once (${code ?? 'killed'})`), { stderr: err })));
  });
}

export async function launchChrome(c: ChromeInfo, o: Omit<LaunchOpts, 'shell'>): Promise<Launched> {
  fs.mkdirSync(o.userDataDir, { recursive: true, mode: 0o700 });
  const opts = { ...o, shell: c.shell };
  if (!noSandbox.has(c.path)) {
    try {
      return await start(c.path, opts, true);
    } catch (e) {
      const why = String((e as { stderr?: string }).stderr ?? '');
      // Ubuntu 23.10+ and containers often refuse the sandbox's user namespaces; so does running as root.
      if (!/sandbox|namespace|--no-sandbox|zygote/i.test(why)) throw new Error(`${(e as Error).message}${why ? `: ${lastLine(why)}` : ''}`);
      noSandbox.add(c.path);
      const line = why.split('\n').find((l) => /sandbox/i.test(l)) ?? why;
      console.warn(`[browser] Chrome's sandbox is not available here; running without it (${lastLine(line)})`);
    }
  }
  try {
    return await start(c.path, opts, false);
  } catch (e) {
    const why = String((e as { stderr?: string }).stderr ?? '');
    throw new Error(`${(e as Error).message}${why ? `: ${lastLine(why)}` : ''}`);
  }
}

const lastLine = (s: string) =>
  s
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .slice(-1)[0]
    ?.replace(/^\[[^\]]*\]\s*/, '')
    .slice(0, 300) ?? '';

// ---- Chrome for Testing ----------------------------------------------------------------------------

const CFT_INDEX = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';

function cftPlatform(): string | null {
  const a = process.arch;
  if (process.platform === 'linux') return a === 'x64' ? 'linux64' : a === 'arm64' ? 'linux-arm64' : null;
  if (process.platform === 'darwin') return a === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (process.platform === 'win32') return a === 'x64' ? 'win64' : 'win32';
  return null;
}

let download: ChromeDownload = { state: 'idle' };
export const downloadState = () => download;

/** Downloads the current stable Chrome for Testing into the data folder; `tell` hears its progress. */
export async function downloadChrome(tell: (d: ChromeDownload) => void): Promise<void> {
  if (download.state === 'running') return;
  const set = (d: ChromeDownload) => tell((download = d));
  set({ state: 'running', received: 0 });
  const zip = path.join(CFT_DIR, `download-${process.pid}.zip`);
  try {
    const plat = cftPlatform();
    if (!plat) throw new Error(`Chrome for Testing has no build for ${process.platform} ${process.arch}`);
    const idx = await (await fetch(CFT_INDEX, { signal: AbortSignal.timeout(30_000) })).json();
    const stable = idx?.channels?.Stable;
    const url = stable?.downloads?.chrome?.find((d: { platform: string }) => d.platform === plat)?.url;
    const version = String(stable?.version ?? '');
    if (!url || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) throw new Error('Could not find the current Chrome for Testing');
    if (!/^https:\/\/storage\.googleapis\.com\//.test(url)) throw new Error('Unexpected download address');
    fs.mkdirSync(CFT_DIR, { recursive: true, mode: 0o700 });
    const r = await fetch(url, { signal: AbortSignal.timeout(30 * 60_000) });
    if (!r.ok || !r.body) throw new Error(`The download failed (${r.status})`);
    const total = Number(r.headers.get('content-length')) || undefined;
    let received = 0;
    let last = 0;
    const body = Readable.fromWeb(r.body as any);
    body.on('data', (c: Buffer) => {
      received += c.length;
      if (Date.now() - last > 500) {
        last = Date.now();
        set({ state: 'running', received, total, version });
      }
    });
    await pipeline(body, fs.createWriteStream(zip, { mode: 0o600 }));
    const tmp = path.join(CFT_DIR, `${version}.part`);
    fs.rmSync(tmp, { recursive: true, force: true });
    await unzip(zip, tmp);
    fs.rmSync(path.join(CFT_DIR, version), { recursive: true, force: true });
    fs.renameSync(tmp, path.join(CFT_DIR, version));
    set({ state: 'done', received, total, version });
  } catch (e) {
    set({ state: 'failed', error: (e as Error).message });
  } finally {
    fs.rmSync(zip, { force: true });
  }
}

/** Unpacks a zip file (stored or deflated entries, with their Unix modes and links) into `dest`. */
export async function unzip(file: string, dest: string): Promise<void> {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 66_000);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error('Not a zip file');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff || count === 0xffff) throw new Error('Zip64 archives are not supported');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);
    const root = path.resolve(dest);
    fs.mkdirSync(root, { recursive: true });
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged zip file');
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const ext = cd.readUInt32LE(p + 38);
      const local = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      const out = path.resolve(root, name);
      if (out !== root && !out.startsWith(root + path.sep)) throw new Error(`Unsafe path in zip: ${name}`);
      const mode = (ext >>> 16) & 0xffff;
      if (name.endsWith('/')) {
        fs.mkdirSync(out, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, local);
      const start = local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (method !== 0 && method !== 8) throw new Error(`Unsupported zip compression in ${name}`);
      const read = (): NodeJS.ReadableStream => {
        const raw = compSize ? fs.createReadStream(file, { start, end: start + compSize - 1 }) : Readable.from([]);
        return method === 8 ? raw.pipe(zlib.createInflateRaw()) : raw;
      };
      if ((mode & 0o170000) === 0o120000) {
        const chunks: Buffer[] = [];
        for await (const c of read() as AsyncIterable<Buffer>) chunks.push(c);
        const target = Buffer.concat(chunks).toString('utf8');
        const resolved = path.resolve(path.dirname(out), target);
        if (!resolved.startsWith(root + path.sep)) throw new Error(`Unsafe link in zip: ${name}`);
        fs.rmSync(out, { force: true });
        fs.symlinkSync(target, out);
        continue;
      }
      await pipeline(read(), fs.createWriteStream(out, { mode: mode & 0o777 ? mode & 0o755 : 0o644 }));
    }
  } finally {
    fs.closeSync(fd);
  }
}

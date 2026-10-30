// File explorer / editor backend: listing with git decorations, reading, atomic writes,
// trash-backed deletes, content and name search (ripgrep), and resumable chunked uploads.
import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { HttpError } from './auth.ts';
import { bundledRg, config } from './config.ts';

const RG = bundledRg ?? 'rg';
const MAX_TEXT = 10 * 1024 * 1024;
const TRASH = path.join(config.dataDir, 'trash');

export interface FsEntry {
  name: string;
  path: string;
  type: 'dir' | 'file' | 'symlink' | 'other';
  size: number;
  mtime: number;
  /** Git status letter: M modified, A added, D deleted, U untracked, R renamed, C conflict. */
  git?: string;
  /** Symlink points at a directory. */
  dirLink?: boolean;
}

export function resolvePath(p: string | undefined): string {
  let s = String(p ?? '').trim();
  if (!s) return config.defaultCwd;
  if (s === '~' || s.startsWith('~/')) s = path.join(os.homedir(), s.slice(1));
  return path.resolve(s);
}

function exec(cmd: string, args: string[], opts: { cwd?: string; timeout?: number; maxBuffer?: number } = {}): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout ?? 10_000, maxBuffer: opts.maxBuffer ?? 32 << 20 }, (err, stdout) =>
      resolve({ stdout: String(stdout ?? ''), code: err ? ((err as any).code ?? 1) : 0 }),
    );
  });
}

// ---- git decorations -----------------------------------------------------------

const gitCache = new Map<string, { at: number; root: string | null; status: Map<string, string> }>();

function findGitRoot(dir: string): string | null {
  let d = dir;
  for (let i = 0; i < 64; i++) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

async function gitStatus(dir: string): Promise<{ root: string | null; status: Map<string, string> }> {
  const root = findGitRoot(dir);
  if (!root) return { root: null, status: new Map() };
  const hit = gitCache.get(root);
  if (hit && Date.now() - hit.at < 2500) return hit;
  const { stdout, code } = await exec('git', ['-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], { timeout: 8000 });
  const status = new Map<string, string>();
  if (code === 0) {
    const parts = stdout.split('\0');
    for (let i = 0; i < parts.length; i++) {
      const rec = parts[i];
      if (rec.length < 4) continue;
      const xy = rec.slice(0, 2);
      const file = rec.slice(3);
      let letter = xy.includes('U') || xy === 'AA' || xy === 'DD' ? 'C' : xy === '??' ? 'U' : xy.includes('A') ? 'A' : xy.includes('D') ? 'D' : xy.includes('R') ? 'R' : 'M';
      if (xy[0] === 'R' || xy[0] === 'C') i++; // rename source follows
      status.set(path.join(root, file), letter);
      // Mark parent folders as containing changes.
      let parent = path.dirname(path.join(root, file));
      while (parent.length >= root.length && !status.has(parent)) {
        status.set(parent, '•');
        if (parent === root) break;
        parent = path.dirname(parent);
      }
    }
  }
  const entry = { at: Date.now(), root, status };
  gitCache.set(root, entry);
  return entry;
}

export function invalidateGit(p: string) {
  const root = findGitRoot(fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p));
  if (root) gitCache.delete(root);
}

// ---- listing / reading -------------------------------------------------------------

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export async function listDir(dirIn: string, opts: { hidden?: boolean; dirsOnly?: boolean } = {}) {
  const dir = resolvePath(dirIn);
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    throw new HttpError(err.code === 'ENOENT' ? 404 : err.code === 'EACCES' ? 403 : 400, `${err.code}: ${dir}`);
  }
  const { root, status } = opts.dirsOnly ? { root: null, status: new Map<string, string>() } : await gitStatus(dir);
  const out: FsEntry[] = [];
  for (const e of ents.slice(0, 20_000)) {
    if (!opts.hidden && e.name.startsWith('.') && e.name !== '.github') continue;
    const p = path.join(dir, e.name);
    let type: FsEntry['type'] = e.isDirectory() ? 'dir' : e.isFile() ? 'file' : e.isSymbolicLink() ? 'symlink' : 'other';
    let size = 0;
    let mtime = 0;
    let dirLink = false;
    try {
      const st = await fs.promises.stat(p);
      size = st.size;
      mtime = Math.floor(st.mtimeMs);
      if (type === 'symlink' && st.isDirectory()) dirLink = true;
    } catch {}
    if (opts.dirsOnly && type !== 'dir' && !dirLink) continue;
    out.push({ name: e.name, path: p, type, size, mtime, git: status.get(p), dirLink: dirLink || undefined });
  }
  out.sort((a, b) => {
    const ad = a.type === 'dir' || a.dirLink ? 0 : 1;
    const bd = b.type === 'dir' || b.dirLink ? 0 : 1;
    return ad - bd || collator.compare(a.name, b.name);
  });
  return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), gitRoot: root, entries: out };
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

export async function readFile(fileIn: string) {
  const file = resolvePath(fileIn);
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(file);
  } catch {
    throw new HttpError(404, `Not found: ${file}`);
  }
  if (st.isDirectory()) throw new HttpError(400, 'That is a folder');
  const base = { path: file, size: st.size, mtime: Math.floor(st.mtimeMs), mode: st.mode };
  // Notebooks carry their plots inline, so they get the larger write limit.
  if (st.size > (file.endsWith('.ipynb') ? 40 * 1024 * 1024 : MAX_TEXT)) return { ...base, binary: false, tooLarge: true, content: null as string | null };
  const buf = await fs.promises.readFile(file);
  if (looksBinary(buf)) return { ...base, binary: true, tooLarge: false, content: null as string | null };
  return { ...base, binary: false, tooLarge: false, content: buf.toString('utf8') };
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  txt: 'text/plain; charset=utf-8',
  json: 'application/json',
  html: 'text/plain; charset=utf-8',
};

export function mimeFor(file: string): string {
  return MIME[path.extname(file).slice(1).toLowerCase()] ?? 'application/octet-stream';
}

/** Web pages and what they load, served as themselves: only ever inside a sandboxed page (see /view). */
const PAGE_MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  map: 'application/json',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  wasm: 'application/wasm',
  csv: 'text/csv; charset=utf-8',
  xml: 'application/xml',
};

export function pageMimeFor(file: string): string {
  return PAGE_MIME[path.extname(file).slice(1).toLowerCase()] ?? mimeFor(file);
}

// ---- writing -------------------------------------------------------------------

export async function writeFile(fileIn: string, content: string, o: { expectedMtime?: number; create?: boolean }) {
  const file = resolvePath(fileIn);
  let mode = 0o644;
  let exists = false;
  try {
    const st = await fs.promises.stat(file);
    exists = true;
    mode = st.mode & 0o7777;
    if (o.create) throw new HttpError(409, 'A file with that name already exists');
    if (o.expectedMtime && Math.floor(st.mtimeMs) !== o.expectedMtime) {
      throw new HttpError(409, 'The file changed on disk since you opened it');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
  }
  if (!exists) await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  await fs.promises.writeFile(tmp, content, { mode });
  await fs.promises.rename(tmp, file);
  invalidateGit(file);
  const st = await fs.promises.stat(file);
  return { path: file, mtime: Math.floor(st.mtimeMs), size: st.size };
}

export async function makeDir(dirIn: string) {
  const dir = resolvePath(dirIn);
  if (fs.existsSync(dir)) throw new HttpError(409, 'That name is already taken');
  await fs.promises.mkdir(dir, { recursive: true });
  return { path: dir };
}

async function moveAcross(from: string, to: string) {
  try {
    await fs.promises.rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.cp(from, to, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    await fs.promises.rm(from, { recursive: true, force: true });
  }
}

export async function renamePath(fromIn: string, toIn: string) {
  const from = resolvePath(fromIn);
  const to = resolvePath(toIn);
  if (from === to) return { path: to };
  if (!fs.existsSync(from)) throw new HttpError(404, 'Not found');
  if (fs.existsSync(to)) throw new HttpError(409, `${path.basename(to)} already exists there`);
  if (to.startsWith(from + path.sep)) throw new HttpError(400, 'Cannot move a folder into itself');
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await moveAcross(from, to);
  invalidateGit(from);
  invalidateGit(to);
  return { path: to };
}

/** Moves to ~/.web-agent/trash; returns where it went. */
export async function deletePath(pIn: string) {
  const p = resolvePath(pIn);
  if (p === '/' || p === os.homedir()) throw new HttpError(400, 'Refusing to delete that');
  if (!fs.existsSync(p) && !fs.lstatSync(p, { throwIfNoEntry: false })) throw new HttpError(404, 'Not found');
  await fs.promises.mkdir(TRASH, { recursive: true });
  const dest = path.join(TRASH, `${new Date().toISOString().replace(/[:.]/g, '-')}-${path.basename(p)}`);
  try {
    await fs.promises.rename(p, dest);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    await fs.promises.rm(p, { recursive: true, force: true });
    invalidateGit(p);
    return { trashed: null };
  }
  invalidateGit(p);
  return { trashed: dest };
}

// ---- search ----------------------------------------------------------------------

export interface TextMatch {
  path: string;
  line: number;
  text: string;
  ranges: [number, number][];
}

export function searchText(rootIn: string, q: string, o: { regex?: boolean; caseSensitive?: boolean; glob?: string; hidden?: boolean }): Promise<{ matches: TextMatch[]; truncated: boolean }> {
  const root = resolvePath(rootIn);
  const args = ['--json', '--max-count', '50', '--max-filesize', '4M', '--max-columns', '400'];
  if (!o.regex) args.push('--fixed-strings');
  args.push(o.caseSensitive ? '--case-sensitive' : '--smart-case');
  if (o.hidden) args.push('--hidden');
  if (o.glob) for (const g of o.glob.split(',').map((s) => s.trim()).filter(Boolean)) args.push('--glob', g);
  args.push('--', q, root);
  return new Promise((resolve) => {
    const proc = spawn(RG, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const matches: TextMatch[] = [];
    let buf = '';
    let truncated = false;
    const timer = setTimeout(() => {
      truncated = true;
      proc.kill();
    }, 15_000);
    proc.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (!line.startsWith('{"type":"match"')) continue;
        try {
          const m = JSON.parse(line).data;
          const text: string = m.lines?.text ?? '';
          matches.push({
            path: m.path?.text ?? '',
            line: m.line_number,
            text: text.replace(/\n$/, '').slice(0, 400),
            ranges: (m.submatches ?? []).map((s: any) => [Buffer.from(text).subarray(0, s.start).toString().length, Buffer.from(text).subarray(0, s.end).toString().length]),
          });
        } catch {}
        if (matches.length >= 1000) {
          truncated = true;
          proc.kill();
          break;
        }
      }
    });
    proc.on('close', () => {
      clearTimeout(timer);
      resolve({ matches, truncated });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ matches, truncated });
    });
  });
}

const fileListCache = new Map<string, { at: number; files: string[] }>();

async function listAllFiles(root: string): Promise<string[]> {
  const hit = fileListCache.get(root);
  if (hit && Date.now() - hit.at < 30_000) return hit.files;
  const { stdout } = await exec(RG, ['--files', '--hidden', '--glob', '!.git', '--max-depth', '25'], { cwd: root, timeout: 15_000, maxBuffer: 128 << 20 });
  const files = stdout.split('\n').filter(Boolean).slice(0, 400_000);
  fileListCache.set(root, { at: Date.now(), files });
  return files;
}

/** Fuzzy file-name search (subsequence match, shorter and basename matches first). */
export async function findFiles(rootIn: string, q: string, limit = 60): Promise<string[]> {
  const root = resolvePath(rootIn);
  const files = await listAllFiles(root);
  const needle = q.toLowerCase().replace(/\s+/g, '');
  if (!needle) return files.slice(0, limit).map((f) => path.join(root, f));
  const scored: [number, string][] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    let pos = -1;
    let score = 0;
    let ok = true;
    for (const ch of needle) {
      const next = lower.indexOf(ch, pos + 1);
      if (next < 0) {
        ok = false;
        break;
      }
      score += next - pos - 1;
      pos = next;
    }
    if (!ok) continue;
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    if (base.includes(needle)) score -= 1000;
    scored.push([score + f.length / 10, f]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, f]) => path.join(root, f));
}

// ---- uploads ---------------------------------------------------------------------

function partPath(dest: string, id: string) {
  return path.join(path.dirname(dest), `.${path.basename(dest)}.${id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)}.upload`);
}

export async function existing(pathsIn: string[]): Promise<string[]> {
  return pathsIn.map(resolvePath).filter((p) => fs.existsSync(p));
}

/**
 * Appends one chunk of an upload. The file is assembled under a hidden name next to the
 * destination and renamed into place when the last chunk arrives.
 */
export async function uploadChunk(body: Readable, q: { path: string; id: string; offset: number; total: number; final: boolean; overwrite: boolean }) {
  const dest = resolvePath(q.path);
  if (!q.id) throw new HttpError(400, 'Missing upload id');
  const part = partPath(dest, q.id);
  if (q.offset === 0) {
    if (fs.existsSync(dest) && !q.overwrite) throw new HttpError(409, `${path.basename(dest)} already exists`);
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) throw new HttpError(409, `${path.basename(dest)} is a folder`);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(part, '');
  } else {
    const have = fs.statSync(part, { throwIfNoEntry: false })?.size;
    if (have !== q.offset) throw new HttpError(409, `Upload out of step (have ${have ?? 0} bytes)`);
  }
  const out = fs.createWriteStream(part, { flags: 'a' });
  try {
    await pipeline(body, out);
  } catch (e) {
    // The browser cancelled or the connection dropped: keep the part so it can resume or be discarded.
    throw new HttpError(499, `Upload interrupted: ${(e as Error).message}`);
  }
  const size = fs.statSync(part).size;
  if (q.final) {
    if (q.total >= 0 && size !== q.total) throw new HttpError(400, `Upload incomplete (${size} of ${q.total} bytes)`);
    await fs.promises.rename(part, dest);
    invalidateGit(dest);
    return { done: true, path: dest, size };
  }
  return { done: false, size };
}

export async function cancelUpload(destIn: string, id: string) {
  fs.rmSync(partPath(resolvePath(destIn), id), { force: true });
}

/** Removes upload leftovers older than a day under the given folders. */
export function sweepParts(dirs: string[]) {
  const cutoff = Date.now() - 24 * 3600_000;
  for (const d of dirs) {
    try {
      for (const n of fs.readdirSync(d)) {
        if (!n.endsWith('.upload')) continue;
        const p = path.join(d, n);
        if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
      }
    } catch {}
  }
}

export async function gitDiff(fileIn: string): Promise<string> {
  const file = resolvePath(fileIn);
  const root = findGitRoot(path.dirname(file));
  if (!root) return '';
  const { stdout } = await exec('git', ['-C', root, 'diff', '--no-color', 'HEAD', '--', file], { timeout: 8000 });
  return stdout;
}

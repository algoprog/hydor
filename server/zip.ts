// Files and folders as one .zip, made as it downloads: each file deflated as it is read, its sizes written
// after its data (so nothing is read twice), names in UTF-8. Without ZIP64, so up to 4 GB and 65,535 entries;
// zipPlan says so before anything is sent.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { HttpError } from './auth.ts';

export interface ZipEntry {
  /** Its path inside the zip, with / between folders. */
  name: string;
  /** The file on disk; none for a folder. */
  abs?: string;
  dir: boolean;
  mtime: number;
  mode: number;
  size: number;
}

/** Folders tools make, and can make again, that a download leaves out. */
const SKIP = new Set(['.git', 'node_modules']);
const MAX_BYTES = 4_000_000_000;
const MAX_ENTRIES = 65_000;

/**
 * What a zip of `paths` holds: each file under its own name, each folder with everything in it (but .git and
 * node_modules), and the name to give the zip (the one folder or file's, else the folder they are in).
 */
export async function zipPlan(paths: string[]): Promise<{ entries: ZipEntry[]; name: string }> {
  if (!paths.length) throw new HttpError(400, 'Which files?');
  const entries: ZipEntry[] = [];
  let bytes = 0;
  const used = new Set<string>();
  const add = (e: ZipEntry) => {
    if (entries.length >= MAX_ENTRIES) throw new HttpError(413, `Too many files for one zip (more than ${MAX_ENTRIES.toLocaleString('en')})`);
    bytes += e.size;
    if (bytes > MAX_BYTES) throw new HttpError(413, 'Too big for one zip (more than 4 GB): download the files in smaller parts');
    entries.push(e);
  };
  const walk = async (abs: string, name: string) => {
    let list: fs.Dirent[];
    try {
      list = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of list.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(abs, d.name);
      const n = `${name}/${d.name}`;
      if (d.isDirectory()) {
        if (SKIP.has(d.name)) continue;
        const st = await fs.promises.stat(p).catch(() => null);
        if (!st) continue;
        add({ name: n, dir: true, mtime: st.mtimeMs, mode: st.mode, size: 0 });
        await walk(p, n);
      } else if (d.isFile()) {
        const st = await fs.promises.stat(p).catch(() => null);
        if (!st || !(await readable(p))) continue;
        add({ name: n, abs: p, dir: false, mtime: st.mtimeMs, mode: st.mode, size: st.size });
      }
    }
  };
  for (const abs of paths) {
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st) throw new HttpError(404, `Not found: ${abs}`);
    // Two things of the same name (from different folders) each keep theirs.
    let top = path.basename(abs) || 'files';
    for (let i = 2; used.has(top); i++) top = `${path.basename(abs)} ${i}`;
    used.add(top);
    if (st.isDirectory()) {
      add({ name: top, dir: true, mtime: st.mtimeMs, mode: st.mode, size: 0 });
      await walk(abs, top);
    } else if (st.isFile()) add({ name: top, abs, dir: false, mtime: st.mtimeMs, mode: st.mode, size: st.size });
  }
  const one = paths.length === 1 ? path.basename(paths[0]) : path.basename(path.dirname(paths[0])) || 'files';
  return { entries, name: `${one.replace(/\.zip$/i, '') || 'files'}.zip` };
}

const readable = (p: string) =>
  fs.promises.access(p, fs.constants.R_OK).then(
    () => true,
    () => false,
  );

/** A time as the zip format keeps it (local time, to two seconds). */
function dosTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  if (d.getFullYear() < 1980) return { time: 0, date: (1 << 5) | 1 };
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** The zip's bytes, in order: each entry's header, its data and sizes, then the directory at the end. */
export async function* zipStream(entries: ZipEntry[]): AsyncGenerator<Buffer> {
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.dir ? `${e.name}/` : e.name, 'utf8');
    const { time, date } = dosTime(e.mtime);
    // UTF-8 names; a file's sizes and checksum come after its data.
    const flags = e.dir ? 0x0800 : 0x0808;
    const method = e.dir ? 0 : 8;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(flags, 6);
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt16LE(name.length, 26);
    const at = offset;
    yield Buffer.concat([head, name]);
    offset += head.length + name.length;
    let crc = 0;
    let csize = 0;
    let usize = 0;
    if (e.abs) {
      const deflate = zlib.createDeflateRaw({ level: 6 });
      const src = fs.createReadStream(e.abs);
      src.on('data', (c) => {
        crc = zlib.crc32(c as Buffer, crc);
        usize += c.length;
      });
      src.on('error', (err) => deflate.destroy(err));
      src.pipe(deflate);
      for await (const c of deflate) {
        csize += (c as Buffer).length;
        yield c as Buffer;
      }
      const tail = Buffer.alloc(16);
      tail.writeUInt32LE(0x08074b50, 0);
      tail.writeUInt32LE(crc >>> 0, 4);
      tail.writeUInt32LE(csize, 8);
      tail.writeUInt32LE(usize, 12);
      yield tail;
      offset += csize + tail.length;
    }
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    // Made on Unix (so the permissions below count), by zip 2.0.
    c.writeUInt16LE((3 << 8) | 20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(csize, 20);
    c.writeUInt32LE(usize, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE((((e.mode & 0xffff) << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38);
    c.writeUInt32LE(at, 42);
    central.push(Buffer.concat([c, name]));
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  yield dir;
  yield end;
}

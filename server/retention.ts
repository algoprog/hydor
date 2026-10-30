// What the app keeps on disk for itself. Attachments are copies made for sending a message (the
// transcripts keep what the agents saw), so they go after a while, oldest first past a size cap.
import fs from 'node:fs';
import path from 'node:path';

const DAY = 86400_000;

interface Entry {
  file: string;
  size: number;
  mtime: number;
}

function walk(dir: string, out: Entry[], depth = 0) {
  let names: fs.Dirent[];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const d of names) {
    const p = path.join(dir, d.name);
    if (d.isDirectory() && depth < 2) walk(p, out, depth + 1);
    else if (d.isFile()) {
      try {
        const st = fs.statSync(p);
        out.push({ file: p, size: st.size, mtime: st.mtimeMs });
      } catch {}
    }
  }
}

/** Deletes uploads older than `keepDays`, then the oldest ones while the rest is over `maxBytes`. */
export function sweepUploads(dir: string, keepDays: number, maxBytes: number): { removed: number; freed: number } {
  const all: Entry[] = [];
  walk(dir, all);
  all.sort((a, b) => a.mtime - b.mtime);
  const cutoff = Date.now() - keepDays * DAY;
  let total = all.reduce((n, e) => n + e.size, 0);
  let removed = 0;
  let freed = 0;
  for (const e of all) {
    if (e.mtime >= cutoff && total <= maxBytes) break;
    try {
      fs.rmSync(e.file, { force: true });
      removed++;
      freed += e.size;
      total -= e.size;
    } catch {}
  }
  // Per-message folders left empty.
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const p = path.join(dir, d);
    try {
      if (fs.statSync(p).isDirectory() && !fs.readdirSync(p).length) fs.rmdirSync(p);
    } catch {}
  }
  return { removed, freed };
}

type Json = Record<string, any>;

export interface FoundImage {
  mime: string;
  data?: Buffer;
  path?: string;
}

const EXT_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/** Images in a transcript line, in order: Claude's base64 blocks, Codex's data URLs and local paths. */
export function imagesIn(v: unknown, out: FoundImage[] = []): FoundImage[] {
  if (Array.isArray(v)) {
    for (const x of v) imagesIn(x, out);
  } else if (v && typeof v === 'object') {
    const o = v as Json;
    const url = typeof o.image_url === 'string' ? o.image_url : typeof o.url === 'string' ? o.url : null;
    if (o.type === 'image' && o.source?.type === 'base64' && typeof o.source.data === 'string') {
      out.push({ mime: String(o.source.media_type ?? 'image/png'), data: Buffer.from(o.source.data, 'base64') });
    } else if ((o.type === 'input_image' || o.type === 'image') && url?.startsWith('data:')) {
      const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
      if (m) out.push({ mime: m[1], data: Buffer.from(m[2], 'base64') });
    } else if ((o.type === 'localImage' || o.type === 'local_image') && typeof o.path === 'string') {
      out.push({ mime: EXT_MIME[o.path.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png', path: o.path });
    } else {
      for (const k of Object.keys(o)) if (typeof o[k] === 'object') imagesIn(o[k], out);
    }
  }
  return out;
}

/** The whole line that starts at `offset` (transcript lines with images can be megabytes). */
export async function readLineAt(file: string, offset: number, max = 64 << 20): Promise<string | null> {
  const fh = await fs.promises.open(file, 'r');
  try {
    const parts: Buffer[] = [];
    let at = offset;
    let len = 0;
    const buf = Buffer.allocUnsafe(1 << 20);
    for (;;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, at);
      if (bytesRead <= 0) break;
      const nl = buf.subarray(0, bytesRead).indexOf(10);
      parts.push(Buffer.from(buf.subarray(0, nl < 0 ? bytesRead : nl)));
      len += nl < 0 ? bytesRead : nl;
      if (nl >= 0 || len > max) break;
      at += bytesRead;
    }
    return len > max ? null : Buffer.concat(parts).toString('utf8');
  } finally {
    await fh.close();
  }
}

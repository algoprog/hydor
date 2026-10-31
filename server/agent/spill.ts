// Long tool output, kept whole in the session's own folder: the model gets its start and its end and the
// file's path, and reads the rest with read_file (offset, limit) or searches it with grep, instead of the
// middle being lost. Files older than a week are removed when Custom starts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Saves text in the session's folder (under `kind`: out, pages, docs…) and returns the file's path. */
export function keep(dir: string, kind: string, label: string, text: string | Buffer, ext = '.txt'): string {
  const folder = path.join(dir, kind);
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const name = `${label.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'output'}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}${ext}`;
  const file = path.join(folder, name);
  fs.writeFileSync(file, text, { mode: 0o600 });
  return file;
}

/** Whole lines from the start of `lines` within `budget` characters (a single long line is cut). */
function take(lines: string[], budget: number): string[] {
  const out: string[] = [];
  let n = 0;
  for (const l of lines) {
    if (n + l.length + 1 > budget) {
      if (!out.length) out.push(`${l.slice(0, budget)}…`);
      break;
    }
    out.push(l);
    n += l.length + 1;
  }
  return out;
}

/**
 * `text` as it is when it fits in `max` characters; else its start and end (`tail` is the end's share:
 * most of it for a command, whose errors come last; none for a page) with the rest saved to a file.
 */
export function spill(text: string, o: { dir: string; max: number; label: string; tail?: number; kind?: string }): string {
  if (text.length <= o.max) return text;
  let file = '';
  try {
    file = keep(o.dir, o.kind ?? 'out', o.label, text);
  } catch {}
  const lines = text.split('\n');
  const room = Math.max(400, o.max - 400);
  const tailShare = o.tail ?? 0.6;
  const head = take(lines, Math.floor(room * (1 - tailShare)));
  const tail = tailShare > 0 ? take([...lines].reverse(), Math.floor(room * tailShare)).reverse() : [];
  const firstHidden = head.length + 1;
  const lastHidden = lines.length - tail.length;
  const where = file
    ? `The whole of it (${lines.length} lines) is saved in ${file}: read any part with read_file (offset, limit), or search it with grep.`
    : `(${lines.length} lines in all; it could not be saved for reading later.)`;
  if (!tail.length) return `${head.join('\n')}\n\n… [lines ${firstHidden}–${lines.length} not shown] …\n${where} The next part starts at offset=${firstHidden}.`;
  return `${head.join('\n')}\n\n… [lines ${firstHidden}–${lastHidden} of ${lines.length} not shown] …\n\n${tail.join('\n')}\n\n${where}`;
}

/** Removes kept files older than a week (images, which the conversation shows again, after a month), and folders left empty. */
export function sweep(stateDir: string, days = 7) {
  let sessions: fs.Dirent[] = [];
  try {
    sessions = fs.readdirSync(stateDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const s of sessions) {
    if (!s.isDirectory()) continue;
    const dir = path.join(stateDir, s.name);
    for (const kind of ['out', 'pages', 'docs', 'images', 'procs']) {
      const folder = path.join(dir, kind);
      const cutoff = Date.now() - (kind === 'images' ? days * 4 : days) * 86_400_000;
      let files: string[] = [];
      try {
        files = fs.readdirSync(folder);
      } catch {
        continue;
      }
      for (const f of files) {
        const p = path.join(folder, f);
        try {
          if (fs.statSync(p).mtimeMs < cutoff) fs.rmSync(p, { force: true });
        } catch {}
      }
      try {
        fs.rmdirSync(folder);
      } catch {}
    }
    try {
      fs.rmdirSync(dir);
    } catch {}
  }
}

// The app keeps every conversation, whatever the agent's own program does with it: Claude Code deletes its
// transcripts after 30 days unless told otherwise, and any program or person may delete one. Each transcript the
// indexer sees gets a hard link in the data folder (no second copy on disk: the same file under two names; a copy
// where the two folders are on different disks), and a transcript that disappears comes back from it. Deleting a
// session in the app (or the yearly clean-up of inactive ones) deletes its kept link first.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Where a transcript under one of the agents' history folders is kept; null for one under none of them. */
export function keptPath(file: string, roots: string[], keptDir: string): string | null {
  const root = roots.find((r) => file.startsWith(r.replace(/\/+$/, '') + path.sep));
  if (!root) return null;
  const tag = crypto.createHash('sha1').update(root.replace(/\/+$/, '')).digest('hex').slice(0, 10);
  return path.join(keptDir, tag, path.relative(root, file));
}

/** Keeps a transcript (once, or again when it was replaced by a new file or, as a copy, has grown). */
export function keep(file: string, kept: string): void {
  let st: fs.Stats;
  let ks: fs.Stats | null = null;
  try {
    st = fs.statSync(file);
    if (!st.isFile()) return;
  } catch {
    return;
  }
  try {
    ks = fs.statSync(kept);
  } catch {}
  // The same file under both names, or a copy that is as long as the transcript.
  if (ks && (ks.ino === st.ino || (ks.size === st.size && ks.mtimeMs >= st.mtimeMs))) return;
  fs.mkdirSync(path.dirname(kept), { recursive: true });
  if (ks) fs.rmSync(kept, { force: true });
  try {
    fs.linkSync(file, kept);
  } catch {
    // Another disk (or a file system without links): a copy instead.
    const tmp = `${kept}.${process.pid}.tmp`;
    fs.copyFileSync(file, tmp);
    fs.renameSync(tmp, kept);
  }
}

/** Puts a transcript that disappeared back where it was, from its kept link. True when it did. */
export function restore(file: string, kept: string): boolean {
  if (fs.existsSync(file) || !fs.existsSync(kept)) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fs.linkSync(kept, file);
    } catch {
      fs.copyFileSync(kept, file);
    }
    return true;
  } catch {
    return false;
  }
}

/** Forgets a transcript's kept link (and a Claude session's folder of subagents beside it), before the transcript is deleted. */
export function forget(kept: string): void {
  fs.rmSync(kept, { force: true });
  if (kept.endsWith('.jsonl')) fs.rmSync(kept.slice(0, -'.jsonl'.length), { recursive: true, force: true });
}

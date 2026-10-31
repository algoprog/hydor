// What Custom's own file edits changed, per turn, so "Edit from here" can put the files back. Before
// an edit tool runs the file is read; when the tool changed it, its earlier content is kept (once per
// turn and file) beside the session's state: <state>/<session>.files/index.jsonl, and one copy per
// distinct content, named by its hash. Changes made by commands are not followed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SnapRecord {
  /** The app's id for the turn's prompt. */
  turn: string;
  path: string;
  /** The content before the turn changed it (by hash), or null when the file did not exist. */
  blob: string | null;
  ts: number;
}

/** Files larger than this are not kept. */
const MAX = 20_000_000;

export const snapDir = (stateDir: string, session: string) => path.join(stateDir, `${session.replace(/[^\w-]/g, '')}.files`);

/** The file's bytes, null when there is no file, undefined when it cannot be kept (a folder, too big). */
function read(file: string): Buffer | null | undefined {
  try {
    const st = fs.statSync(file);
    return st.isFile() && st.size <= MAX ? fs.readFileSync(file) : undefined;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? null : undefined;
  }
}

const noted = new Set<string>();

/** Call before an edit tool runs, and what it returns after: a change is recorded then. */
export function beforeEdit(dir: string, turn: string | undefined, file: string): () => void {
  if (!turn) return () => {};
  const before = read(file);
  return () => {
    const k = `${dir}\0${turn}\0${file}`;
    if (before === undefined || noted.has(k)) return;
    const after = read(file);
    if (after === undefined || (before === null ? after === null : after !== null && before.equals(after))) return;
    noted.add(k);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      let blob: string | null = null;
      if (before) {
        blob = crypto.createHash('sha256').update(before).digest('hex');
        const p = path.join(dir, blob);
        if (!fs.existsSync(p)) fs.writeFileSync(p, before, { mode: 0o600 });
      }
      const rec: SnapRecord = { turn, path: file, blob, ts: Date.now() };
      fs.appendFileSync(path.join(dir, 'index.jsonl'), JSON.stringify(rec) + '\n', { mode: 0o600 });
    } catch {}
  };
}

export function snapRecords(dir: string): SnapRecord[] {
  let text = '';
  try {
    text = fs.readFileSync(path.join(dir, 'index.jsonl'), 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').flatMap((l) => {
    try {
      const r = JSON.parse(l);
      return typeof r?.turn === 'string' && typeof r.path === 'string' ? [r as SnapRecord] : [];
    } catch {
      return [];
    }
  });
}

/** Puts the files the given turns changed back as they were before the first of them. */
export function restoreSnapshots(dir: string, turns: Set<string>): { restored: string[]; failed: string[] } {
  const first = new Map<string, SnapRecord>();
  for (const r of snapRecords(dir)) if (turns.has(r.turn) && !first.has(r.path)) first.set(r.path, r);
  const restored: string[] = [];
  const failed: string[] = [];
  for (const r of first.values()) {
    try {
      if (r.blob === null) fs.rmSync(r.path, { force: true });
      else {
        const data = fs.readFileSync(path.join(dir, r.blob));
        fs.mkdirSync(path.dirname(r.path), { recursive: true });
        fs.writeFileSync(r.path, data);
      }
      restored.push(r.path);
    } catch {
      failed.push(r.path);
    }
  }
  return { restored, failed };
}

/** Gives a fork the records of the turns it keeps, with their contents. */
export function copySnapshots(from: string, to: string, turns: Set<string>) {
  const recs = snapRecords(from).filter((r) => turns.has(r.turn));
  if (!recs.length) return;
  fs.mkdirSync(to, { recursive: true, mode: 0o700 });
  for (const r of recs) {
    if (!r.blob || fs.existsSync(path.join(to, r.blob))) continue;
    try {
      fs.linkSync(path.join(from, r.blob), path.join(to, r.blob));
    } catch {
      try {
        fs.copyFileSync(path.join(from, r.blob), path.join(to, r.blob));
      } catch {}
    }
  }
  fs.writeFileSync(path.join(to, 'index.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
}

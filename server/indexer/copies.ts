// A session's transcript in more than one place: Claude Code's history of one session can sit in two accounts' folders
// at once (one a move between accounts left behind, or one put back from its kept link). The index keeps one path for
// each session, so reading every copy rewrote that row from each in turn, on every pass: the whole of each transcript
// read again every few seconds, and the session (with every other one alike) sent to every page as changed.
import fs from 'node:fs';
import path from 'node:path';

const UUID_TAIL = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/;

/** The session a transcript is of, by its name alone, as the index names it; null for a Codex rollout named without its thread. */
export function sessionKeyOf(f: { path: string; agent: string }): string | null {
  if (f.agent === 'claude' || f.agent === 'acp') return `${f.agent}:${path.basename(f.path, '.jsonl')}`;
  const id = f.path.match(UUID_TAIL)?.[1];
  return id ? `${f.agent}:${id}` : null;
}

/**
 * One transcript for each session: of its copies, the one written last; of copies alike (often the same file under two
 * names), the one the index already has (`indexed`, the path of a session's row), so that nothing changes from one pass
 * to the next. Files whose session cannot be told by their name all stay.
 */
export function onePerSession<F extends { path: string; agent: string; mtime: number }>(files: F[], indexed: (key: string) => string | undefined): F[] {
  const keys = new Map<F, string>();
  const chosen = new Map<string, F>();
  for (const f of files) {
    const key = sessionKeyOf(f);
    if (!key) continue;
    keys.set(f, key);
    const cur = chosen.get(key);
    if (!cur || f.mtime > cur.mtime || (f.mtime === cur.mtime && cur.path !== indexed(key) && f.path === indexed(key))) chosen.set(key, f);
  }
  return files.filter((f) => !keys.has(f) || chosen.get(keys.get(f)!) === f);
}

/**
 * The index's rows whose transcript is gone: not listed, not there now (put there since the listing), and not put back
 * from the app's own link (`putBack`). A row whose session is listed in another place moved there (to another account)
 * as the row was read: it is neither gone nor put back where it was, which would leave a second copy behind, one the next
 * move back would find in its way.
 */
export function goneRows<R extends { key: string; path: string }>(rows: R[], files: { path: string; agent: string }[], putBack: (file: string) => boolean, exists: (file: string) => boolean = fs.existsSync): R[] {
  const known = new Set(files.map((f) => f.path));
  const listed = new Set(files.map((f) => sessionKeyOf(f)));
  return rows.filter((r) => !known.has(r.path) && !exists(r.path) && !listed.has(r.key) && !putBack(r.path));
}

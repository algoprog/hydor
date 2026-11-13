// The documents a turn made: GET /api/fs/made lists the documents (reports, PDFs, Word, Excel and PowerPoint files, LaTeX,
// notebooks, Markdown) under a folder that were last changed within a span of time. The conversation shows them as cards
// under the turn's reply, whether or not the agent handed them over (web/src/features/session/TurnDocs.tsx).
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { isMadeDoc } from '../../shared/documents.ts';
import { HttpError } from '../auth.ts';
import { resolvePath } from '../files.ts';

export interface MadeDoc {
  path: string;
  size: number;
  mtime: number;
  /** When the file was created, where the file system says (not every one does). */
  born?: number;
}

const MAX_DEPTH = 6;
const MAX_ENTRIES = 8000;
const MAX_FILES = 300;
const MAX_SPAN = 400 * 86400_000;
const SKIP = new Set(['node_modules', '__pycache__', 'venv', 'site-packages', 'bower_components']);

/** The documents under `dir` last changed from `since` to `until` (ms), newest first. */
export async function findMade(dir: string, since: number, until: number): Promise<MadeDoc[]> {
  const found: MadeDoc[] = [];
  let looked = 0;
  // Breadth first, so that a deep tree does not use up the look before the folders near the top are seen.
  let level = [dir];
  for (let depth = 0; level.length && depth <= MAX_DEPTH && looked < MAX_ENTRIES; depth++) {
    const next: string[] = [];
    for (const d of level) {
      if (looked >= MAX_ENTRIES) break;
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(d, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (++looked > MAX_ENTRIES) break;
        const p = path.join(d, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && !SKIP.has(e.name)) next.push(p);
        } else if (e.isFile() && isMadeDoc(e.name)) {
          const st = await fs.promises.stat(p).catch(() => null);
          if (!st?.isFile() || st.mtimeMs < since || st.mtimeMs > until) continue;
          found.push({ path: p, size: st.size, mtime: Math.round(st.mtimeMs), ...(st.birthtimeMs > 0 ? { born: Math.round(st.birthtimeMs) } : {}) });
        }
      }
    }
    level = next;
  }
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_FILES);
}

export function madeRoutes(app: FastifyInstance) {
  app.get('/api/fs/made', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    if (q.since == null || q.since === '' || q.until == null || q.until === '') throw new HttpError(400, 'since and until are needed');
    const since = Number(q.since);
    const until = Number(q.until);
    if (!Number.isFinite(since) || !Number.isFinite(until)) throw new HttpError(400, 'since and until are times in milliseconds');
    const from = Math.max(since, until - MAX_SPAN);
    return { files: await findMade(resolvePath(q.dir), from, until) };
  });
}

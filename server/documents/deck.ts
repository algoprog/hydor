// A PowerPoint file's slides for the file viewer, which draws them with the slides runtime as the editor draws its
// decks: the file read by the app's own importer (pages/pptx-import.ts) and kept as a deck is kept (keepDeck), so
// its pictures are pictures the app keeps (each once, by its hash, going a day after nothing shows them) and fetched
// one by one, its videos are videos the app keeps, and what the viewer gets stays small. Each version of a file is read
// once: one read in the last hour, or being read, is answered from memory.
//   GET /api/documents/deck?path=   → DeckPreview { deck, notes, pages }
import fs from 'node:fs';
import { isDeckFile, type DeckPreview } from '../../shared/documents.ts';
import type { Deck } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { resolvePath } from '../files.ts';
import { deckFromPptx } from '../pages/pptx-import.ts';
import { keepDeck } from '../pages/slides.ts';
import { soffice } from './tools.ts';

/** The largest file shown as slides (the importer takes PowerPoint files as large: their videos come along). */
const MAX_FILE = 200 * 1024 * 1024;
/** How long a version read stays in memory (well within the day its pictures are kept without a deck), and how many do. */
const KEEP_MS = 60 * 60_000;
const KEEP_N = 12;

const read = new Map<string, { at: number; job: Promise<{ deck: Deck; notes: string[] }> }>();

/** The deck a PowerPoint file is, for the file viewer. */
export async function deckPreview(db: DB, fileIn: string | undefined): Promise<DeckPreview> {
  const file = resolvePath(fileIn);
  if (!isDeckFile(file)) throw new HttpError(415, 'Only PowerPoint files (.pptx, .pptm, .ppsx, .potx) show as slides');
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st?.isFile()) throw new HttpError(404, 'Not found');
  if (st.size > MAX_FILE) throw new HttpError(413, `It is over ${MAX_FILE / 1024 / 1024} MB, too large to show as slides`);
  const now = Date.now();
  for (const [k, v] of read) if (now - v.at > KEEP_MS) read.delete(k);
  const key = `${file}\0${st.size}\0${st.mtimeMs}`;
  let got = read.get(key);
  if (!got) {
    const job = fs.promises.readFile(file).then(async (buf) => {
      const imported = await deckFromPptx(buf, db);
      return { deck: keepDeck(db, imported.model).deck, notes: imported.notes };
    });
    got = { at: now, job };
    read.set(key, got);
    // One that failed is read again next time (the file may be whole by then).
    job.catch(() => read.get(key) === got && read.delete(key));
    while (read.size > KEEP_N) read.delete(read.keys().next().value!);
  }
  try {
    const { deck, notes } = await got.job;
    return { deck, notes, pages: !!soffice() };
  } catch (e) {
    if (e instanceof HttpError && e.status === 413) throw e;
    throw new HttpError(422, `Its slides could not be read: ${(e as Error).message.replace(/\.$/, '')}`);
  }
}

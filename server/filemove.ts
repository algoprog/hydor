// Moving a file the way a move between folders does, for the app taking a file in by its path (the desktop app's drops
// on the Library): renamed when it stays on its disk; onto another disk, copied, the copy checked against the original
// (its size and the hash of its bytes), and only then the original removed, so nothing is lost if the copy fails. The
// place it goes to is claimed first (an empty file made only where nothing is), so two files given the same free name
// at once never write over each other.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** The SHA-256 of a file's bytes, in hex. */
export async function fileHash(file: string): Promise<string> {
  const h = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

const taken = (p: string) => !!fs.lstatSync(p, { throwIfNoEntry: false });

/**
 * A name in `dir` for `name` that nothing has, claimed with an empty file: itself, else "name copy.ext",
 * "name copy 2.ext"… (as Files names copies). Returns its path.
 */
export async function claimName(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 0; i < 10_000; i++) {
    const p = path.join(dir, i === 0 ? name : `${stem} copy${i > 1 ? ` ${i}` : ''}${ext}`);
    if (taken(p)) continue;
    try {
      await (await fs.promises.open(p, 'wx')).close();
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('No free name for it there');
}

/** How a move went: renamed on its disk, or copied to another (`kept`: the copy is whole but the original could not be removed). */
export type Moved = 'renamed' | 'copied' | 'kept';

/**
 * Moves the file `from` to `to`, a place claimed for it (claimName: an empty file of ours, which it takes the place of).
 * Throws when the copy to another disk did not come out whole: the original then stays, and the claimed place goes.
 */
export async function moveWhole(from: string, to: string): Promise<Moved> {
  try {
    await fs.promises.rename(from, to);
    return 'renamed';
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') {
      await dropClaim(to);
      throw e;
    }
  }
  const st = await fs.promises.stat(from);
  try {
    await fs.promises.copyFile(from, to);
    const whole = (await fs.promises.stat(to)).size === st.size && (await fileHash(from)) === (await fileHash(to));
    if (!whole) throw new Error('The copy did not come out whole, so the file stays where it was');
    // As a move keeps it: when it was last changed.
    await fs.promises.utimes(to, st.atime, st.mtime).catch(() => {});
  } catch (e) {
    await fs.promises.rm(to, { force: true });
    throw e;
  }
  try {
    await fs.promises.rm(from);
    return 'copied';
  } catch {
    return 'kept';
  }
}

/** A claimed place that was not used: removed while it is still the empty file claimName made. */
export async function dropClaim(p: string) {
  const st = fs.lstatSync(p, { throwIfNoEntry: false });
  if (st?.isFile() && st.size === 0) await fs.promises.rm(p, { force: true });
}

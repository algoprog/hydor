// Several copies of the digest may run for one wiki at once (a build or rebuild reads a few sources in parallel). What
// they must not do together, they do one after the other, here, with async locks kept for each wiki root:
//   · An article is read, its new text is asked of the helper, and it is written back: that is minutes of waiting
//     between reading and writing, so two sources that bear on the same article would each write a text made from the
//     old one, and the later write would drop the earlier one. `withArticleLocks` makes the whole of it one step for
//     each article it touches (locks taken in path order, so two sources never wait on each other); articles that no
//     two sources share are written in parallel as before.
//   · A new article's path is chosen by looking for a free one: two sources making an article of the same title would
//     choose the same path. `claimPath` chooses and reserves it in one step (nothing waits between), and the digest
//     lets it go when it is done with the article.
// Everything else the digest writes (index.md, log.md, a kept source, an area, a file's front matter) is read and
// written back in one step with nothing awaited between, in this process (core.ts: applyWikiChanges), so those cannot
// interleave; they are computed from what is on disk when they run, so the last of them always shows every article.
import { freePath } from './write.ts';

const tails = new Map<string, Promise<void>>();
const key = (root: string, article: string) => `${root}\n${article}`;

/** Runs `fn` once it holds the locks of all `articles` (wiki paths) of the wiki at `root`; they are released when it ends. */
export async function withArticleLocks<T>(root: string, articles: string[], fn: () => Promise<T>): Promise<T> {
  const mine = [...new Set(articles)].sort();
  const releases: (() => void)[] = [];
  try {
    for (const a of mine) {
      const k = key(root, a);
      const before = tails.get(k) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const tail = before.then(() => gate);
      tails.set(k, tail);
      // The map holds a lock's last waiter only while someone waits: it is dropped when the last one is done.
      void tail.then(() => {
        if (tails.get(k) === tail) tails.delete(k);
      });
      releases.push(release);
      await before;
    }
    return await fn();
  } finally {
    for (const r of releases) r();
  }
}

/** Whether any article lock is held or awaited (a test looks that none leaks). */
export const lockedArticles = () => tails.size;

const claimed = new Map<string, Set<string>>();

/** The paths reserved now in a wiki: what a new article must not take. */
export const claimedPaths = (root: string): Set<string> => claimed.get(root) ?? new Set();

/** A free path for a new article, reserved for the caller until `releasePaths`. Nothing is awaited between choosing and reserving. */
export function claimPath(root: string, title: string, taken: Set<string>): string {
  const set = claimed.get(root) ?? new Set<string>();
  claimed.set(root, set);
  const p = freePath(root, title, new Set([...taken, ...set]));
  set.add(p);
  return p;
}

export function releasePaths(root: string, paths: string[]): void {
  const set = claimed.get(root);
  if (!set) return;
  for (const p of paths) set.delete(p);
  if (!set.size) claimed.delete(root);
}

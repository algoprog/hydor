// The files and folders a wiki article names, found the way memory's notes find theirs (server/memory/anchors.ts):
// one resolver for both, so a note and an article about the same code are anchored to the same paths. An article
// keeps more anchors than a note, since it covers more.
import { clearGitCache, gitHead as headOf, resolvePaths as pathsIn } from '../../memory/anchors.ts';

/** Anchors an article keeps at most. */
export const MAX_ANCHORS = 30;

/** A repository's commit now (its HEAD), null outside git or before the first commit. */
export const gitHead = (root: string): Promise<string | null> => headOf(root);

/** The repo-relative paths (tracked files, and folders ending in "/") a text names, at most MAX_ANCHORS. */
export const resolvePaths = (root: string, text: string): Promise<string[]> => pathsIn(root, text, MAX_ANCHORS);

/** Forgets what was kept of git's answers (the tests change repositories under it). */
export const forgetFileLists = (): void => clearGitCache();

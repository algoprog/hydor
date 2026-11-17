// The digest's queue of documents while the server runs (digest/index.ts sets it): Update now reads a project's
// waiting documents through it. A module of its own, so what uses it does not import the routes' module.
import type { Digest } from './digest.ts';

let current: Digest | null = null;
export const setDigestQueue = (d: Digest | null) => (current = d);
export const digestQueue = (): Digest | null => current;

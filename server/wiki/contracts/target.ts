// Resolve a project contract target without creating its wiki during preview.
import type { RunCtx } from '../../features/types.ts';
import { wikiFeatureEnabled } from '../access.ts';
import { prospectiveProjectWikiRoot, wikiSpaceOfSession } from '../roots.ts';
import { wikiTarget } from '../tools.ts';

/** Preview can name an absent project wiki but cannot create it or use the shared wiki. */
export function contractTarget(ctx: RunCtx): string {
  if (!wikiFeatureEnabled(ctx.deps.db, ctx.key, ctx.cwd, 'contracts')) throw new Error('Wiki contracts are off for this chat');
  const space = wikiSpaceOfSession(ctx.deps.db, ctx.key, ctx.cwd);
  if (!space) throw new Error('This session has no project wiki');
  const root = prospectiveProjectWikiRoot(ctx.deps.db, space);
  if (!root) throw new Error('This session has no project wiki');
  return root;
}

/** Create the previously previewed wiki only after the user accepted the exact contract. */
export function createContractTarget(ctx: RunCtx, expected: string): string {
  if (contractTarget(ctx) !== expected) throw new Error('Wiki target changed; review again');
  const root = wikiTarget(ctx);
  if (root !== expected || contractTarget(ctx) !== expected) throw new Error('Wiki target changed; review again');
  return root;
}

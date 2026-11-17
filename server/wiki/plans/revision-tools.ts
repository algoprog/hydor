// Review and approve a single version-preserving change to an existing plan.
import type { RunCtx, RunTool } from '../../features/types.ts';
import { fillForm } from '../../guide/form.ts';
import { refreshWikiKnowledge } from '../knowledge/index.ts';
import { applyRevision, previewRevision } from './revision.ts';
import { wikiSpaceOfSession } from '../roots.ts';

/** Offer a non-mutating preview and a separately confirmed revision of one active plan. */
export function revisionTools(resolveTarget: (ctx: RunCtx, args: Record<string, any>) => string, guardProject?: (ctx: RunCtx, root: string) => Promise<unknown>, guardRevision?: (ctx: RunCtx, root: string, args: Record<string, any>) => void): RunTool[] {
  const properties = {
    path: { type: 'string', description: 'The existing active plan path under output/projects.' },
    content: { type: 'string', description: 'The complete proposed updated plan text; retain stable IDs and existing authorization.' },
    expectedSha256: { type: 'string', description: 'The current plan hash returned by wiki_read.' },
    reason: { type: 'string', description: 'A concise reason for the substantive plan change.' },
    authorization: { type: 'string', description: 'A reference to the originating user request; this does not itself authorize execution.' },
    mode: { type: 'string', enum: ['plan', 'execution'], description: 'Use execution only to update one identified embedded register without changing the rest of the plan.' },
  };
  return [
    {
      name: 'wiki_plan_revision_preview',
      description: 'Preview a plan revision, or use mode execution to update only an identified embedded execution register. Shows exact before and after; writes nothing.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties, required: ['path', 'content', 'expectedSha256', 'reason', 'authorization'] },
      async run(args, ctx) { const root = resolveTarget(ctx, args); guardRevision?.(ctx, root, args); return JSON.stringify(previewRevision(root, args as unknown as Parameters<typeof previewRevision>[1])); },
    },
    {
      name: 'wiki_plan_revise',
      description: 'Ask for approval of the exact plan or execution-register preview; preserve the old revision and reject concurrent edits. Approval does not authorize implementation.',
      inputSchema: { type: 'object', properties: { ...properties, sha256: { type: 'string', description: 'The preview hash.' } }, required: ['path', 'content', 'expectedSha256', 'reason', 'authorization', 'sha256'] },
      async run(args, ctx) {
        const target = resolveTarget(ctx, args);
        const input = args as unknown as Parameters<typeof previewRevision>[1];
        guardRevision?.(ctx, target, args);
        const before = previewRevision(target, input);
        if (before.sha256 !== args.sha256) throw new Error('Plan preview changed; review it again');
        const execution = args.mode === 'execution';
        const decision = await fillForm(ctx, { title: execution ? 'Revise execution register' : 'Revise project plan', message: `Wiki: ${target}\nFile: ${before.path}\nRevision: ${before.revision} → ${before.revision + 1}\nSnapshot: ${before.snapshot}\nReason: ${before.reason}\nAuthorization source: ${before.authorization}\n\nPrevious content:\n${before.original}\n\nProposed content:\n${before.content}\n\nThis approves the ${execution ? 'execution register' : 'plan'} change only; implementation requires a separate instruction.`, submit: 'Revise', schema: { properties: { confirmed: { type: 'boolean', title: execution ? 'Revise this exact execution register' : 'Revise this exact plan' } }, required: ['confirmed'] } });
        if (!decision.ok || decision.content.confirmed !== true) return 'Not saved';
        if (resolveTarget(ctx, args) !== target) throw new Error('Wiki target changed; review the preview again');
        guardRevision?.(ctx, target, args);
        const current = previewRevision(target, input);
        if (current.sha256 !== before.sha256) throw new Error('Plan preview changed; review it again');
        const gitIgnore = await guardProject?.(ctx, target);
        // Recheck project access and feature settings after asynchronous preparation.
        if (resolveTarget(ctx, args) !== target) throw new Error('Wiki target or feature setting changed; review again');
        guardRevision?.(ctx, target, args);
        const result = applyRevision(target, input, before.sha256);
        refreshWikiKnowledge(ctx.deps.db, target);
        // Reuse the existing project Memory refresh event after an approved change.
        ctx.deps.broadcast?.({ t: 'feature', id: 'wiki', data: { space: wikiSpaceOfSession(ctx.deps.db, ctx.key, ctx.cwd) } });
        return JSON.stringify({ ...result, gitIgnore, implementation: 'not authorized by plan revision' });
      },
    },
  ];
}

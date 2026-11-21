// Review and approve a single version-preserving change to an existing plan.
import type { RunCtx, RunTool } from '../../features/types.ts';
import { fillForm } from '../../guide/form.ts';
import { refreshWikiKnowledge } from '../knowledge/index.ts';
import { applyRevision, previewRevision } from './revision.ts';
import { wikiSpaceOfSession } from '../roots.ts';

/** Offer a non-mutating preview and a separately confirmed revision of one active plan. */
export function revisionTools(resolveTarget: (ctx: RunCtx) => string, guardProject?: (ctx: RunCtx, root: string) => Promise<unknown>): RunTool[] {
  const properties = {
    path: { type: 'string', description: 'The existing active plan path under output/projects.' },
    content: { type: 'string', description: 'The complete updated plan text. Keep every work item id and the execution register. The app sets document_id, document_kind, revision, revision_date and the change fields itself: you need not write them.' },
    expectedSha256: { type: 'string', description: 'The current plan hash returned by wiki_read.' },
    reason: { type: 'string', description: 'A concise reason for the substantive plan change.' },
    authorization: { type: 'string', description: 'A reference to the originating user request; this does not itself authorize execution.' },
  };
  return [
    {
      name: 'wiki_plan_revision_preview',
      description: 'Preview an update to an existing active project plan. Shows exact before and after, the identity and version, and where the old version will be kept. It writes nothing. It never authorizes implementation.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties, required: ['path', 'content', 'expectedSha256', 'reason', 'authorization'] },
      async run(args, ctx) { return JSON.stringify(previewRevision(resolveTarget(ctx), args as unknown as Parameters<typeof previewRevision>[1])); },
    },
    {
      name: 'wiki_plan_revise',
      description: 'Ask for approval of the exact previous plan revision preview and apply it only after confirmation. The old version is kept as a snapshot (ordinary files with its checksum); a plan changed meanwhile is refused. Plan approval does not authorize execution.',
      inputSchema: { type: 'object', properties: { ...properties, sha256: { type: 'string', description: 'The preview hash.' } }, required: ['path', 'content', 'expectedSha256', 'reason', 'authorization', 'sha256'] },
      async run(args, ctx) {
        const target = resolveTarget(ctx);
        const input = args as unknown as Parameters<typeof previewRevision>[1];
        const before = previewRevision(target, input);
        if (before.sha256 !== args.sha256) throw new Error('Plan preview changed; review it again');
        const decision = await fillForm(ctx, { title: 'Revise project plan', message: `Wiki: ${target}\nFile: ${before.path}\nRevision: ${before.revision} → ${before.revision + 1}\nSnapshot: ${before.snapshot}\nReason: ${before.reason}\nAuthorization source: ${before.authorization}\n\nPrevious content:\n${before.original}\n\nProposed content:\n${before.content}\n\nThis approves the plan change only; implementation requires a separate instruction.`, submit: 'Revise', schema: { properties: { confirmed: { type: 'boolean', title: 'Revise this exact plan' } }, required: ['confirmed'] } });
        if (!decision.ok || decision.content.confirmed !== true) return 'Not saved';
        if (resolveTarget(ctx) !== target) throw new Error('Wiki target changed; review the preview again');
        const current = previewRevision(target, input);
        if (current.sha256 !== before.sha256) throw new Error('Plan preview changed; review it again');
        const gitIgnore = await guardProject?.(ctx, target);
        const result = applyRevision(target, input, before.sha256);
        refreshWikiKnowledge(ctx.deps.db, target);
        // Reuse the existing project Memory refresh event after an approved change.
        ctx.deps.broadcast?.({ t: 'feature', id: 'wiki', data: { space: wikiSpaceOfSession(ctx.deps.db, ctx.key, ctx.cwd) } });
        return JSON.stringify({ ...result, gitIgnore, implementation: 'not authorized by plan revision' });
      },
    },
  ];
}

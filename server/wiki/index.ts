// Native wiki capability, with Hydor's own search and session mechanisms rather than parallel implementations.
import type { Feature } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { sessionMemoryOn } from '../memory/store.ts';
import { wikiSettings } from './settings/settings.ts';
import { lessonsTools } from './lessons/tools.ts';
import { guardProject, wikiTarget, wikiTools } from './tools.ts';
import { deactivateProjectWikiKnowledge, ensureWikiKnowledge } from './knowledge/index.ts';
import { spaceOfSession } from '../knowledge/scope.ts';
import { allSpaces } from '../spaces/index.ts';
import { projectOfFolder } from '../spaces/found.ts';
import fs from 'node:fs';
import os from 'node:os';
import type { RunCtx } from '../features/types.ts';

const INSTRUCTIONS = [
  'An LLM Wiki is enabled. Use wiki_status to resolve its active root and wiki_read to inspect its index and relevant files.',
  'For an authorized document file, use wiki_ingest_document to preserve its original bytes and extract its text with Hydor. For text or web sources use existing web tools and wiki_ingest_text. Preserve original sources and provenance.',
  'Incrementally compile new sources into linked Markdown articles: read each affected article first, cite exact raw source paths in frontmatter, use wiki_write with its expected hash, and update relevant indexes and log.md. Do not reprocess unchanged sources unnecessarily.',
  'Use Hydor knowledge_search and knowledge_read for indexed knowledge rather than creating another search system. Check results and source citations; do not assume a project wiki is indexed merely because its folder exists.',
  'Use wiki_check for basic structural and source checks. Archives and retired documents remain excluded. Sessions and lesson previews are operational evidence, not automatically approved wiki knowledge. Use the separate lessons approval flow for session-derived lessons; never use general ingestion or article writing to bypass it.',
].join(' ');

/** Supply workflow instructions and tools to every agent only while the capability is enabled. */
export const wiki: Feature = {
  id: 'wiki',
  tools: (ctx) => wikiSettings(ctx.deps.db).enabled && !confidentialRun(ctx) ? [...wikiTools(), ...(sessionMemoryOn(ctx.deps.db, ctx.key) ? lessonsTools((c) => wikiTarget(c), guardProject) : [])] : [],
  spawn: (s, d) => {
    const settings = wikiSettings(d.db);
    if (!settings.enabled || s.extra.confidential) return undefined;
    // A broken or unavailable wiki must not prevent an otherwise usable session from starting.
    try { if (settings.hubPath) ensureWikiKnowledge(d.db, { root: settings.hubPath, space: null }); } catch (e) { console.warn(`[wiki] shared index unavailable: ${(e as Error).message}`); }
    const space = spaceOfSession(d.db, s.extra);
    try {
      if (space) deactivateProjectWikiKnowledge(d.db, space);
      const match = projectOfFolder(allSpaces(d.db), s.cwd, os.homedir());
      if (space && match?.id === space) {
        const ctx = { key: s.key ?? '', runId: s.runId, agent: s.agent, cwd: s.cwd, deps: d } as RunCtx;
        const root = wikiTarget(ctx);
        let hub: string | null = null;
        try { if (settings.hubPath) hub = fs.realpathSync(settings.hubPath); } catch { /* A missing shared hub does not hide an accessible project wiki. */ }
        if (root !== hub) ensureWikiKnowledge(d.db, { root, space });
      }
    } catch (e) { console.warn(`[wiki] project index unavailable: ${(e as Error).message}`); }
    return { instructions: [INSTRUCTIONS] };
  },
};

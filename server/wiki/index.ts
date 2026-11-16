// Wiki memory: the project's articles (with sources, kept from its documents and its work), as part of memory.
import type { Feature, RunCtx } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { sessionMemoryOn } from '../memory/store.ts';
import { lessonsTools } from './lessons/tools.ts';
import { guardProject, wikiTarget, wikiTools } from './tools.ts';
import { deactivateProjectWikiKnowledge, ensureWikiKnowledge } from './knowledge/index.ts';
import { wikiMemoryOn, wikiRoot, wikiSpaceOfSession } from './roots.ts';

const INSTRUCTIONS = [
  'Wiki memory is on: this project keeps articles (wiki/…) with their sources (raw/…), made from its documents and its work. It is one part of memory, beside memory notes (recall, remember: short facts) and documents (knowledge_search, knowledge_read: the files themselves).',
  'Look in the wiki when a question may be answered by what the project has kept: wiki_read index.md, then the articles it names. Cite the articles you use.',
  'To keep something: wiki_ingest_document or wiki_ingest_text save a source (never with passwords or keys); then read the articles it touches, update or add them with wiki_write (give the sha256 you read), cite the source in their frontmatter, and note it in index.md and log.md. Do not redo sources that have not changed.',
  'wiki_check finds missing sources and broken links. Lessons from a session are kept only through wiki_lessons_preview and wiki_lessons_save, which ask the user.',
].join(' ');

/** Supply workflow instructions and tools to an agent only while wiki memory is on for its project. */
export const wiki: Feature = {
  id: 'wiki',
  tools: (ctx) => !confidentialRun(ctx) && wikiMemoryOn(ctx.deps.db, wikiSpaceOfSession(ctx.deps.db, ctx.key, ctx.cwd))
    ? [...wikiTools(), ...(sessionMemoryOn(ctx.deps.db, ctx.key) ? lessonsTools((c: RunCtx) => wikiTarget(c), guardProject) : [])]
    : [],
  spawn: (s, d) => {
    if (s.extra.confidential) return undefined;
    const space = wikiSpaceOfSession(d.db, s.key ?? '', s.cwd);
    // Wiki knowledge: each wiki that exists is bound as its project's (or the shared) documents and stays bound; off unbinds it.
    for (const sp of space ? [space, null] : [null]) {
      try {
        const root = wikiMemoryOn(d.db, sp) ? wikiRoot(d.db, sp) : null;
        if (root) ensureWikiKnowledge(d.db, { root, space: sp });
        else if (sp) deactivateProjectWikiKnowledge(d.db, sp);
      } catch (e) {
        // A broken or unavailable wiki must not prevent an otherwise usable session from starting.
        console.warn(`[wiki] index unavailable: ${(e as Error).message}`);
      }
    }
    if (!wikiMemoryOn(d.db, space)) return undefined;
    // Custom's own agent asks the app for compaction checkpoints only when this is set.
    return { instructions: [INSTRUCTIONS], env: sessionMemoryOn(d.db, s.key ?? '') ? { HYDOR_WIKI_EVENTS: '1' } : undefined };
  },
};

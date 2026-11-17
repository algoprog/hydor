// Wiki memory: the project's articles (with sources, kept from its documents and its work), as part of memory.
import type { Feature, RunCtx } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { sessionMemoryOn } from '../memory/store.ts';
import { lessonsTools } from './lessons/tools.ts';
import { guardProject, projectWikiTarget, wikiTarget, wikiTools } from './tools.ts';
import { planTools } from './plans/tools.ts';
import { revisionTools } from './plans/revision-tools.ts';
import { wikiChatEnabled, wikiEnabledForSession } from './access.ts';
import { LANGS } from '../../shared/i18n.ts';
import { userLang } from '../language/index.ts';
import { deactivateProjectWikiKnowledge, ensureWikiKnowledge } from './knowledge/index.ts';
import { wikiMemoryOn, wikiRoot, wikiSpaceOfSession } from './roots.ts';
import { areasLine } from './areas/tend.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById } from '../spaces/index.ts';
import { wikiHasArticles } from './has-articles.ts';

/**
 * What every agent is told while wiki memory is on and the wiki has an article: that it is there and how to look in it. A project
 * whose wiki is empty says nothing of it (an agent would look for what is not there), unless the session waits for a build of it
 * (extra.memoryBuild), which will have something in it by the time its agent gets the first message.
 */
const LOOK =
  'Wiki memory is on: this project keeps articles (wiki/…) with their sources (raw/…), made from its documents and its work, beside memory notes (recall, remember: short facts) and documents (knowledge_search, knowledge_read: the files themselves). Look in the wiki when a question may be answered by what the project has kept: wiki_read index.md, which lists the articles by area (wiki/areas/<area>.md is an area’s hub: what it covers, its key facts and its articles), or wiki_search (words and meaning, exact text or a pattern; each result says its article, section and lines, which wiki_read opens with section or lines). Cite the articles you use.';

/**
 * How to use its tools, as guides: every agent gets them with its instructions, and Custom only while one of their
 * tools is offered in full, so a model of a small context is not given them on every turn (features/types.ts).
 */
const KEEP =
  'To keep something in the wiki: wiki_ingest_document or wiki_ingest_text save a source (never with passwords or keys); then read the articles it touches, update or add them with wiki_write (give the sha256 you read), cite the source in their frontmatter, and note it in index.md and log.md. Do not redo sources that have not changed.';
const CHECK = 'wiki_check finds missing sources and broken links. Lessons from a session are kept only through wiki_lessons_preview and wiki_lessons_save, which ask the user.';
const PLANS =
  'Use wiki_plan_preview to review adoption of an existing plan and wiki_plan_revision_preview and wiki_plan_revise to continue a plan without losing prior revisions. Approval of a plan change does not authorize implementation. Plans (output/projects/) are changed only with these tools: wiki_write cannot write there. Record what was done, deployed or accepted in output/evidence/<plan>/<name>.md with wiki_write.';
const KEEP_TOOLS = ['wiki_ingest_document', 'wiki_ingest_text', 'wiki_write'];
const CHECK_TOOLS = ['wiki_check', 'wiki_lessons_preview', 'wiki_lessons_save'];
const PLAN_TOOLS = ['wiki_plan_adopt', 'wiki_plan_preview', 'wiki_plan_revision_preview', 'wiki_plan_revise'];

/** Supply workflow instructions and tools to an agent only while wiki memory is on for its project. */
export const wiki: Feature = {
  id: 'wiki',
  tools: (ctx) => !confidentialRun(ctx) && wikiEnabledForSession(ctx.deps.db, ctx.key, ctx.cwd)
    ? [...wikiTools(), ...planTools(projectWikiTarget, guardProject), ...revisionTools(projectWikiTarget, guardProject), ...(sessionMemoryOn(ctx.deps.db, ctx.key) ? lessonsTools((c: RunCtx) => wikiTarget(c), guardProject) : [])]
    : [],
  spawn: (s, d) => {
    if (!wikiChatEnabled(d.db, s.extra)) return undefined;
    // A new Codex session has no key yet: the project picked for it on the start page is its project, wherever it works.
    const picked = !s.key && typeof s.extra.space === 'string' ? spaceById(d.db, s.extra.space) : null;
    const space = picked?.id ?? wikiSpaceOfSession(d.db, s.key ?? '', s.cwd);
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
    const language = LANGS.find((item) => item.id === userLang(d.db))!.english;
    const write = `Write new wiki articles, source notes, lessons, plans and execution records in ${language}, unless the user requests another language. Preserve original sources and established document language.`;
    // The wiki's areas, in one line that changes only when they do (not for a model of a small context).
    let areas: string | null = null;
    // A session that waits for its project's memory to be built (extra.memoryBuild, set while it is created and cleared when its first message goes) is told too.
    let has = s.extra?.memoryBuild === true || (!!s.key && sessionExtra(d.db, s.key).memoryBuild === true);
    try {
      const root = wikiRoot(d.db, space);
      has ||= wikiHasArticles(root);
      if (!s.lean && root) areas = areasLine(root);
    } catch {
      /* a wiki that cannot be read gives no line */
    }
    return {
      instructions: [...(has ? [LOOK] : []), ...(areas ? [areas] : [])],
      guides: [
        { tools: KEEP_TOOLS, text: `${KEEP} ${write}` },
        { tools: CHECK_TOOLS, text: CHECK },
        { tools: PLAN_TOOLS, text: PLANS },
      ],
      env: sessionMemoryOn(d.db, s.key ?? '') ? { HYDOR_WIKI_EVENTS: '1' } : undefined,
    };
  },
};

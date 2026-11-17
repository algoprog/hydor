// Native wiki tools use Hydor's existing agent and knowledge tools for synthesis and search.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RunCtx, RunTool } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { guardWikiFolder } from './settings/gitignore.ts';
import { claimsToBePlan, EVIDENCE_AREA, inEvidenceArea, inPlansArea, PLANS_AREA } from './plans/area.ts';
import { applyWikiChanges, checkOrigin, checkWiki, ingestWikiDocument, ingestWikiSource, readWiki, redirectOf, wikiHash } from './core.ts';
import { readWikiPart } from './sections.ts';
import { wikiSearchTool } from './search-tool.ts';
import { isHubPath } from './areas/registry.ts';
import { areasOfArticle, withAreas, writeIndex } from './digest/write.ts';
import { ensureWikiKnowledge, refreshWikiKnowledge } from './knowledge/index.ts';
import { namedWikiRoot, wikiMemoryOn, wikiRoot, wikiSpaceOfSession } from './roots.ts';
import { otherProject } from '../memory/across.ts';
import { wikiSettings } from './settings/settings.ts';
import { wikiEnabledForSession } from './access.ts';
import { inSession } from '../documents/index.ts';
import { canRead, extractText } from '../documents/extract.ts';
import { isSecret } from '../agent/permissions.ts';
import { redactSecrets, secretIn } from '../memory/secrets.ts';
import { userLang, wordsForLang } from '../language/index.ts';
import { isLang } from '../../shared/i18n.ts';

/** Use the existing language catalog, with an explicit supported language taking precedence. */
function sourceWords(ctx: RunCtx, requested: unknown): (text: string) => string {
  return wordsForLang(isLang(requested) ? requested : userLang(ctx.deps.db));
}

/** Read a bounded regular source without following symlinks or reading known secret paths. */
function documentBytes(file: string): Buffer {
  const absolute = path.resolve(file);
  let part = path.parse(absolute).root;
  for (const name of absolute.slice(part.length).split(path.sep).filter(Boolean)) {
    if (['.archive', '.history', '.git'].includes(name.toLowerCase())) throw new Error('Archived and Git-internal paths are excluded');
    part = path.join(part, name);
    if (isSecret(part) || fs.lstatSync(part).isSymbolicLink()) throw new Error('Secret and symbolic-link paths are excluded');
  }
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size < 1 || st.size > 20 * 1024 * 1024) throw new Error('Document must be a regular file of at most 20 MiB');
    const data = Buffer.alloc(st.size + 1);
    let used = 0;
    while (used < data.length) {
      const n = fs.readSync(fd, data, used, data.length - used, used);
      if (!n) break;
      used += n;
    }
    if (used !== st.size) throw new Error('Document changed while being read');
    return data.subarray(0, used);
  } finally { fs.closeSync(fd); }
}

const OFF = 'Wiki memory is off for this project: turn it on in its Settings tab, or for all projects in Settings → Memory → Wiki memory';
const EMPTY = 'The wiki is still empty: nothing has been kept in it yet.';

/**
 * The folder the session's wiki tools work in, only ever one that roots.ts resolves (inside the hub or the session's
 * project): the project's wiki (the shared wiki outside a project), or with `name` the shared wiki ("hub") or a wiki
 * registered in it. Null while that wiki's folder does not exist and `create` is not given.
 */
function resolveTarget(ctx: RunCtx, name: string | undefined, create: boolean): string | null {
  if (confidentialRun(ctx)) throw new Error('Wiki memory is unavailable in confidential sessions');
  const db = ctx.deps.db;
  const space = wikiSpaceOfSession(db, ctx.key, ctx.cwd);
  if (!wikiMemoryOn(db, space)) throw new Error(OFF);
  if (!wikiEnabledForSession(db, ctx.key, ctx.cwd)) throw new Error('Wiki memory is off for this chat');
  if (!name) {
    return wikiRoot(db, space, { create });
  }
  if (!wikiMemoryOn(db, null)) throw new Error('The shared wiki is off in Settings → Memory → Wiki memory');
  if (name === 'hub') return wikiRoot(db, null, { create });
  return namedWikiRoot(db, name);
}

/**
 * Another project's wiki, to read only: by its name, when it does not keep itself to itself and has wiki memory on
 * (for it and for this chat). Null while nothing has been written to it. The tools that write never take it.
 */
function otherWikiRoot(ctx: RunCtx, wiki: unknown, project: string): { root: string | null; name: string } | undefined {
  if (!project.trim()) return undefined;
  if (confidentialRun(ctx)) throw new Error('Wiki memory is unavailable in confidential sessions');
  if (wiki) throw new Error('Give project or wiki, not both');
  const db = ctx.deps.db;
  const t = otherProject(db, ctx.key, ctx.cwd, project);
  // This project's own wiki: as the tool always worked.
  if (!t) return undefined;
  // This project's own switch counts too, as it does for its own wiki: it may have been turned off since the session started.
  if (!wikiEnabledForSession(db, ctx.key, ctx.cwd)) throw new Error('Wiki memory is off for this chat or project');
  if (!wikiMemoryOn(db, t.id)) throw new Error(`Wiki memory is off for the project “${t.name}”`);
  return { root: wikiRoot(db, t.id, { create: false }), name: t.name };
}

/** A wiki to write in: made when it is the first time. */
export function wikiTarget(ctx: RunCtx, name?: string): string {
  const root = resolveTarget(ctx, name, true);
  if (!root) throw new Error('This wiki is not available');
  return root;
}

/** A wiki to read: null while nothing has been written to it. */
export function wikiReadTarget(ctx: RunCtx, name?: string): string | null {
  return resolveTarget(ctx, name, false);
}

/** Plan adoption requires the session's existing project wiki and never falls back to the shared hub. */
export function projectWikiTarget(ctx: RunCtx): string {
  const space = wikiSpaceOfSession(ctx.deps.db, ctx.key, ctx.cwd);
  if (!space) throw new Error('This session has no project wiki');
  const root = wikiReadTarget(ctx);
  if (!root) throw new Error('This session has no project wiki');
  return root;
}

/** After a write: the project's (or the shared) wiki is its knowledge, searched again, and the pages refresh. */
function wrote(ctx: RunCtx, root: string): void {
  const db = ctx.deps.db;
  const space = wikiSpaceOfSession(db, ctx.key, ctx.cwd);
  let owner: string | null = null;
  try {
    for (const sp of [space, null]) {
      if (!wikiMemoryOn(db, sp) || wikiRoot(db, sp) !== root) continue;
      ensureWikiKnowledge(db, { root, space: sp });
      owner = sp;
      break;
    }
  } catch (e) { console.warn(`[wiki] knowledge binding unavailable: ${(e as Error).message}`); }
  refreshWikiKnowledge(db, root);
  ctx.deps.broadcast?.({ t: 'feature', id: 'wiki', data: { space: owner } });
}

/** Add the project's wiki folder to its .gitignore, only where Settings allow it (folder wikis, Git repositories). */
export async function guardProject(ctx: RunCtx, root: string): Promise<{ changed: boolean; tracked: boolean } | undefined> {
  const db = ctx.deps.db;
  const space = wikiSpaceOfSession(db, ctx.key, ctx.cwd);
  const guarded = await guardWikiFolder(db, space, root);
  // A session switch can change while the Git guard waits for filesystem work.
  if (!wikiEnabledForSession(db, ctx.key, ctx.cwd)) throw new Error('Wiki memory is off for this chat');
  return guarded;
}

/** Agent tools deliberately resolve roots server-side rather than accepting arbitrary filesystem roots. */
export function wikiTools(): RunTool[] {
  const wikiArg = { type: 'string', description: 'Optional: "hub" (the shared wiki) or the name of a wiki registered in it. Leave out for this project’s wiki.' };
  const projectArg = { type: 'string', description: 'Optional: another project’s wiki, by that project’s name (memory_search says which project a result is from). Read only: a project that keeps itself to itself, or has wiki memory off, is refused.' };
  return [
    {
      name: 'wiki_status',
      description: 'Where this project’s wiki memory is (its folder) and whether anything is kept in it yet. Wiki memory is the project’s articles with their sources, kept from its documents and its work; memory notes (recall, remember) and documents (knowledge_search) are the other parts of memory. With `project` it says where another project’s wiki is (read only).',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { wiki: wikiArg, project: projectArg } },
      async run(a, ctx) {
        const other = otherWikiRoot(ctx, a.wiki, String(a.project ?? ''));
        if (other) return JSON.stringify({ project: other.name, root: other.root, empty: other.root === null, readOnly: true });
        const root = wikiReadTarget(ctx, a.wiki);
        return JSON.stringify({ root, empty: root === null, settings: wikiSettings(ctx.deps.db) });
      },
    },
    {
      name: 'wiki_read',
      description: 'Read one active article, source, project plan or execution evidence (wiki/…, raw/…, output/projects/…, output/evidence/…, index.md, log.md) with its exact SHA-256. index.md lists the articles by area; wiki/areas/<area>.md is an area’s hub (what it covers, its key facts, its articles). With `section` (a heading’s text or its slug) it reads just that section, its subsections included; with `lines` ("40-80", or "40") just those lines; both come numbered, as wiki_search says where a result is. An article merged into another, or gone when the wiki was rebuilt, is followed to where it went (redirectedFrom says so). Hidden folders, retired documents and links out of the wiki are not readable. With `project` it reads that other project’s wiki (read only).',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          section: { type: 'string', description: 'Optional: read only the section with this heading (its text or slug, case aside; "Methods › Data" for a subsection), with its subsections.' },
          lines: { type: 'string', description: 'Optional: read only these lines, "40-80" or "40" (numbered).' },
          wiki: wikiArg,
          project: projectArg,
        },
        required: ['path'],
      },
      async run(a, ctx) {
        const other = otherWikiRoot(ctx, a.wiki, String(a.project ?? ''));
        const root = other ? other.root : wikiReadTarget(ctx, a.wiki);
        if (!root) return JSON.stringify({ empty: true, note: EMPTY });
        return JSON.stringify(readWikiPart(root, String(a.path ?? ''), { section: a.section, lines: a.lines }));
      },
    },
    wikiSearchTool((ctx) => wikiReadTarget(ctx)),
    {
      name: 'wiki_ingest_text',
      description: 'Keep a text source (and where it came from) in the wiki, exactly as given, as a source to write articles from. The text and the origin must hold no passwords, keys or tokens. The same text and origin are kept once; another origin gets its own note. Then write or update the articles that use it, with wiki_write.',
      inputSchema: { type: 'object', properties: { content: { type: 'string' }, origin: { type: 'string' }, wiki: wikiArg, language: { type: 'string', description: 'Optional explicit supported language for generated metadata.' } }, required: ['content', 'origin'] },
      async run(a, ctx) {
        const root = wikiTarget(ctx, a.wiki);
        const guard = await guardProject(ctx, root);
        // A concurrent settings change must not redirect a write after its target was resolved.
        if (wikiReadTarget(ctx, a.wiki) !== root) throw new Error('Wiki target changed; review the preview again');
        const result = ingestWikiSource(root, String(a.content ?? ''), String(a.origin ?? ''), sourceWords(ctx, a.language));
        wrote(ctx, root);
        return JSON.stringify({ ...result, gitIgnore: guard, note: 'Update the relevant articles and the index, and record this in log.md, with wiki_write. If existing is true, skip recompiling unless needed.' });
      },
    },
    {
      name: 'wiki_ingest_document',
      description: 'Keep a document file (PDF, Word and others Hydor reads) in the wiki as a source: its exact bytes, and its text as a Markdown note to write articles from. Not for files with secrets, links or over 20 MiB. Returns the note’s path and any limit of the text extraction.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, origin: { type: 'string' }, wiki: wikiArg, language: { type: 'string', description: 'Optional explicit supported language for generated metadata.' } }, required: ['path'] },
      async run(a, ctx) {
        const root = wikiTarget(ctx, a.wiki);
        const file = inSession(ctx.cwd, String(a.path ?? ''));
        if (!canRead(file)) throw new Error('This file is not a document type supported by Hydor');
        const suppliedOrigin = typeof a.origin === 'string' && !!a.origin.trim();
        const origin = suppliedOrigin ? a.origin.trim() : `file:${redactSecrets(file)}#${wikiHash(file).slice(0, 16)}`;
        if (suppliedOrigin) checkOrigin(origin);
        else if (/[\r\n\0]/.test(origin)) throw new Error('Source origin contains invalid text');
        const bytes = documentBytes(file);
        const ext = path.extname(file).slice(1).toLowerCase();
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-document-'));
        try {
          // Parse a private immutable copy so the preserved bytes and the extracted text have the same source.
          const copy = path.join(temporary, `source.${ext}`);
          fs.writeFileSync(copy, bytes, { mode: 0o600, flag: 'wx' });
          const extracted = await extractText(copy);
          if (!extracted) throw new Error('Document could not be read');
          if (secretIn(extracted.text) || (extracted.note && secretIn(extracted.note))) throw new Error('The extracted document may contain credentials; review it before ingestion');
          const guard = await guardProject(ctx, root);
          if (wikiReadTarget(ctx, a.wiki) !== root) throw new Error('Wiki target changed; review the preview again');
          const result = ingestWikiDocument(root, bytes, ext, origin, extracted, sourceWords(ctx, a.language));
          wrote(ctx, root);
          return JSON.stringify({ ...result, gitIgnore: guard, format: extracted.format, extractionNote: extracted.note, note: 'Original bytes are unchanged; the Markdown source note is extracted text and may be incomplete.' });
        } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      },
    },
    {
      name: 'wiki_write',
      description: 'Write one article (wiki/…; not the areas’ hubs in wiki/areas/, which Hydor keeps from their articles), execution evidence (output/evidence/<plan>/<name>.md: what was done, deployed or accepted, with evidence or blockers), index.md or log.md after reading it with wiki_read and giving its exact SHA-256, or null for a new file. Plans (output/projects/…) cannot be written here at all: they have their own tools (wiki_plan_preview and wiki_plan_adopt, wiki_plan_revision_preview and wiki_plan_revise). Raw sources and hidden files cannot be written here. On a conflict read again; never overwrite blindly.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, expectedSha256: { type: ['string', 'null'] }, wiki: wikiArg }, required: ['path', 'content', 'expectedSha256'] },
      async run(a, ctx) {
        if (typeof a.path !== 'string' || typeof a.content !== 'string' || !(a.expectedSha256 === null || (typeof a.expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(a.expectedSha256)))) throw new Error('Give path, content, and the exact expected SHA-256 or null');
        // Raw inputs and lesson captures have dedicated workflows, never a generic write shortcut.
        if (a.path.split(/[\\/]/)[0].toLowerCase() === 'raw') throw new Error('Use the source or lessons workflow to create raw material');
        // The plans area (output/projects/, and output/ but for its evidence folder) is the plan tools' alone: whatever the
        // file is called, whatever its header says, no generic write creates or changes anything there.
        if (inPlansArea(a.path)) throw new Error(`Plans (${PLANS_AREA}/) are adopted with wiki_plan_preview and wiki_plan_adopt and changed with wiki_plan_revision_preview and wiki_plan_revise, which show the exact text, ask the user and keep earlier revisions. wiki_write cannot write there. Record what was done, deployed or accepted in ${EVIDENCE_AREA}/<plan>/<name>.md.`);
        if (inEvidenceArea(a.path) && claimsToBePlan(a.content)) throw new Error(`A plan is not written in ${EVIDENCE_AREA}/: use the plan tools`);
        // Hubs are kept from their articles; an article merged into another is a redirect that stays one.
        if (isHubPath(a.path)) throw new Error('Hubs are kept by Hydor from their articles: change the articles instead');
        const root = wikiTarget(ctx, a.wiki);
        const article = /^wiki\/.+\.md$/i.test(a.path);
        let content = a.content;
        if (article) {
          let cur: { content: string; sha256: string } | null = null;
          try {
            cur = readWiki(root, a.path);
          } catch {
            /* a new article */
          }
          const to = cur && redirectOf(cur.content);
          if (to) throw new Error(`${a.path} was merged into ${to}: read and write ${to} instead`);
          // An article keeps the areas it was in when the new text names none (the wiki's upkeep places a new one).
          const had = cur && cur.sha256 === a.expectedSha256 ? areasOfArticle(cur.content) : [];
          if (had.length && !areasOfArticle(content).length) content = withAreas(content, had);
        }
        const guard = await guardProject(ctx, root);
        if (wikiReadTarget(ctx, a.wiki) !== root) throw new Error('Wiki target changed; review the preview again');
        const result = applyWikiChanges(root, [{ path: a.path, content, expectedSha256: a.expectedSha256 }]);
        // The index lists every article (by area): it follows each article written.
        if (article) await writeIndex(root).catch((e) => console.warn(`[wiki] index: ${(e as Error).message}`));
        wrote(ctx, root);
        return JSON.stringify({ ...result, sha256: wikiHash(Buffer.from(content)), gitIgnore: guard });
      },
    },
    {
      name: 'wiki_check',
      description: 'Check the wiki’s articles: that the sources they list and the links between them exist. A basic structure check.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { wiki: wikiArg } },
      async run(a, ctx) {
        const root = wikiReadTarget(ctx, a.wiki);
        return JSON.stringify(root ? checkWiki(root) : { checked: 0, issues: [], truncated: false, empty: true });
      },
    },
  ];
}

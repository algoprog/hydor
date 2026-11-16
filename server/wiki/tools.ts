// Native wiki tools use Hydor's existing agent and knowledge tools for synthesis and search.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RunCtx, RunTool } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { guardWikiFolder } from './settings/gitignore.ts';
import { applyWikiChanges, checkOrigin, checkWiki, ingestWikiDocument, ingestWikiSource, readWiki, wikiHash } from './core.ts';
import { ensureWikiKnowledge, refreshWikiKnowledge } from './knowledge/index.ts';
import { namedWikiRoot, wikiMemoryOn, wikiRoot, wikiSpaceOfSession } from './roots.ts';
import { wikiSettings } from './settings/settings.ts';
import { inSession } from '../documents/index.ts';
import { canRead, extractText } from '../documents/extract.ts';
import { isSecret } from '../agent/permissions.ts';
import { redactSecrets, secretIn } from '../memory/secrets.ts';

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
  if (!name) return wikiRoot(db, space, { create });
  if (!wikiMemoryOn(db, null)) throw new Error('The shared wiki is off in Settings → Memory → Wiki memory');
  if (name === 'hub') return wikiRoot(db, null, { create });
  return namedWikiRoot(db, name);
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
  return guardWikiFolder(db, wikiSpaceOfSession(db, ctx.key, ctx.cwd), root);
}

/** Agent tools deliberately resolve roots server-side rather than accepting arbitrary filesystem roots. */
export function wikiTools(): RunTool[] {
  const wikiArg = { type: 'string', description: 'Optional: "hub" (the shared wiki) or the name of a wiki registered in it. Leave out for this project’s wiki.' };
  return [
    {
      name: 'wiki_status',
      description: 'Where this project’s wiki memory is (its folder) and whether anything is kept in it yet. Wiki memory is the project’s articles with their sources, kept from its documents and its work; memory notes (recall, remember) and documents (knowledge_search) are the other parts of memory.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { wiki: wikiArg } },
      async run(a, ctx) {
        const root = wikiReadTarget(ctx, a.wiki);
        return JSON.stringify({ root, empty: root === null, settings: wikiSettings(ctx.deps.db) });
      },
    },
    {
      name: 'wiki_read',
      description: 'Read one article or source of the wiki (wiki/…, raw/…, index.md, log.md) with its exact SHA-256. Hidden folders, retired documents and links out of the wiki are not readable.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, wiki: wikiArg }, required: ['path'] },
      async run(a, ctx) {
        const root = wikiReadTarget(ctx, a.wiki);
        if (!root) return JSON.stringify({ empty: true, note: EMPTY });
        return JSON.stringify(readWiki(root, String(a.path ?? '')));
      },
    },
    {
      name: 'wiki_ingest_text',
      description: 'Keep a text source (and where it came from) in the wiki, exactly as given, as a source to write articles from. The text and the origin must hold no passwords, keys or tokens. The same text and origin are kept once; another origin gets its own note. Then write or update the articles that use it, with wiki_write.',
      inputSchema: { type: 'object', properties: { content: { type: 'string' }, origin: { type: 'string' }, wiki: wikiArg }, required: ['content', 'origin'] },
      async run(a, ctx) {
        const root = wikiTarget(ctx, a.wiki);
        const guard = await guardProject(ctx, root);
        const result = ingestWikiSource(root, String(a.content ?? ''), String(a.origin ?? ''));
        wrote(ctx, root);
        return JSON.stringify({ ...result, gitIgnore: guard, note: 'Update the relevant articles and the index, and record this in log.md, with wiki_write. If existing is true, skip recompiling unless needed.' });
      },
    },
    {
      name: 'wiki_ingest_document',
      description: 'Keep a document file (PDF, Word and others Hydor reads) in the wiki as a source: its exact bytes, and its text as a Markdown note to write articles from. Not for files with secrets, links or over 20 MiB. Returns the note’s path and any limit of the text extraction.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, origin: { type: 'string' }, wiki: wikiArg }, required: ['path'] },
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
          const result = ingestWikiDocument(root, bytes, ext, origin, extracted);
          wrote(ctx, root);
          return JSON.stringify({ ...result, gitIgnore: guard, format: extracted.format, extractionNote: extracted.note, note: 'Original bytes are unchanged; the Markdown source note is extracted text and may be incomplete.' });
        } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      },
    },
    {
      name: 'wiki_write',
      description: 'Write one article (wiki/…/*.md), index.md or log.md of the wiki, after reading it with wiki_read: give the SHA-256 of the version you read, or null for a new file. Nothing else can be written (not sources in raw/, not hidden or settings files). On a conflict read again; never overwrite blindly. Cite the sources an article is kept from in its frontmatter and link related articles.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, expectedSha256: { type: ['string', 'null'] }, wiki: wikiArg }, required: ['path', 'content', 'expectedSha256'] },
      async run(a, ctx) {
        if (typeof a.path !== 'string' || typeof a.content !== 'string' || !(a.expectedSha256 === null || (typeof a.expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(a.expectedSha256)))) throw new Error('Give path, content, and the exact expected SHA-256 or null');
        // Raw inputs and lesson captures have dedicated workflows, never a generic write shortcut.
        if (a.path.split(/[\\/]/)[0].toLowerCase() === 'raw') throw new Error('Use the source or lessons workflow to create raw material');
        const root = wikiTarget(ctx, a.wiki);
        const guard = await guardProject(ctx, root);
        const result = applyWikiChanges(root, [{ path: a.path, content: a.content, expectedSha256: a.expectedSha256 }]);
        wrote(ctx, root);
        return JSON.stringify({ ...result, gitIgnore: guard });
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

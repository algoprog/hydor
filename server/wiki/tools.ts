// Native wiki tools use Hydor's existing agent and knowledge tools for synthesis and search.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RunCtx, RunTool } from '../features/types.ts';
import { confidentialRun } from '../confidential/index.ts';
import { allSpaces } from '../spaces/index.ts';
import { projectOfFolder } from '../spaces/found.ts';
import { wikiSettings } from './settings/settings.ts';
import { ignoreProjectWiki } from './settings/gitignore.ts';
import { applyWikiChanges, checkWiki, ingestWikiDocument, ingestWikiSource, readWiki, resolveWiki, wikiHash } from './core.ts';
import { refreshWikiKnowledge } from './knowledge/index.ts';
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

/** Find the session's own project, matching Hydor's existing project association. */
function project(ctx: RunCtx): string | undefined {
  const found = projectOfFolder(allSpaces(ctx.deps.db), ctx.cwd, os.homedir())?.folder;
  if (found) return found;
  // A session may use an existing project folder before Hydor has registered it as a space.
  const local = path.resolve(ctx.cwd, wikiSettings(ctx.deps.db).projectPath);
  return fs.existsSync(local) || binding(ctx.cwd) ? ctx.cwd : undefined;
}

/** Read only the conventional explicit local wiki binding, never interpret instructions as executable input. */
export function binding(folder: string): string | undefined {
  const file = path.join(folder, 'AGENTS.md');
  if (!fs.existsSync(file)) return undefined;
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.size > 128 * 1024) return undefined;
  const text = fs.readFileSync(file, 'utf8');
  const m = /^\s*-\s*Wiki:\s*`([^`\r\n]+)`/im.exec(text);
  if (!m) return undefined;
  const spec = m[1].replace(/\/_index\.md$/, '');
  if (!spec || spec.includes('\0') || spec.split(/[\\/]/).some((x) => x === '..' || ['.archive', '.history'].includes(x.toLowerCase()))) throw new Error('Invalid project wiki binding');
  return spec;
}

/** Resolve one configured active wiki; explicit named selection is restricted to the user's registry. */
export function wikiTarget(ctx: RunCtx, name?: string): string {
  if (confidentialRun(ctx)) throw new Error('Wiki operations are unavailable in confidential sessions');
  const settings = wikiSettings(ctx.deps.db);
  if (!settings.enabled) throw new Error('LLM Wiki is off in Settings → Memory');
  const folder = project(ctx);
  const projectWiki = folder ? binding(folder) ?? settings.projectPath : undefined;
  // A project wiki is selected only if it exists; a declared binding fails closed if unavailable.
  const declared = folder ? binding(folder) : undefined;
  const localExists = folder && projectWiki && fs.existsSync(path.resolve(folder, projectWiki));
  const selected = name || (declared || localExists ? undefined : 'hub');
  if (!settings.hubPath && (selected || !folder)) throw new Error('Set a wiki hub path in Settings → Memory');
  return resolveWiki({ hub: settings.hubPath || folder!, cwd: folder || ctx.cwd, projectWiki, name: selected });
}

/** Apply the configured Git guard only when an operation actually writes a project wiki. */
export async function guardProject(ctx: RunCtx, root: string): Promise<{ changed: boolean; tracked: boolean } | undefined> {
  const folder = project(ctx);
  if (!folder || !wikiSettings(ctx.deps.db).gitIgnore) return undefined;
  const rel = path.relative(path.resolve(folder), root);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return undefined;
  return ignoreProjectWiki(folder, root, true);
}

/** Agent tools deliberately resolve roots server-side rather than accepting arbitrary filesystem roots. */
export function wikiTools(): RunTool[] {
  return [
    {
      name: 'wiki_status',
      description: 'Resolve the configured active wiki for this project or a registered wiki name. Never invent a wiki path. This only reads settings and metadata.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { wiki: { type: 'string', description: 'Optional registry name, or hub.' } } },
      async run(a, ctx) { return JSON.stringify({ root: wikiTarget(ctx, a.wiki), settings: wikiSettings(ctx.deps.db) }); },
    },
    {
      name: 'wiki_read',
      description: 'Read one active Markdown or text file in the selected wiki and return its exact SHA-256. Archives, retired documents, traversal and symlinks are excluded.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, wiki: { type: 'string' } }, required: ['path'] },
      async run(a, ctx) { return JSON.stringify(readWiki(wikiTarget(ctx, a.wiki), String(a.path ?? ''))); },
    },
    {
      name: 'wiki_ingest_text',
      description: 'Preserve an explicitly requested external text source and origin in the selected wiki. Never use this tool to bypass the separate lessons-learned preview and approval flow. Returns the raw Markdown note and byte-exact original path. Use Hydor web and document tools to obtain source text; do not store credentials in origins. Repeating the same content and origin does not rewrite it; a distinct origin gets its own note. Then compile into existing articles with provenance.',
      inputSchema: { type: 'object', properties: { content: { type: 'string' }, origin: { type: 'string' }, wiki: { type: 'string' } }, required: ['content', 'origin'] },
      async run(a, ctx) {
        const root = wikiTarget(ctx, a.wiki);
        const guard = await guardProject(ctx, root);
        const result = ingestWikiSource(root, String(a.content ?? ''), String(a.origin ?? ''));
        refreshWikiKnowledge(ctx.deps.db, root);
        return JSON.stringify({ ...result, gitIgnore: guard, note: 'Update relevant wiki articles and indexes and record this ingestion in log.md with conflict-checked writes. If existing is true, skip recompilation unless needed.' });
      },
    },
    {
      name: 'wiki_ingest_document',
      description: 'Preserve the exact bytes of an explicitly authorized PDF, Word or other supported document and extract a Markdown source note using Hydor’s document reader. The path is resolved as read_document does. Rejects secret paths, symbolic links and files over 20 MiB. Returns original and note paths, source hash, extraction format and any limitation; compile articles from the note.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, origin: { type: 'string' }, wiki: { type: 'string' } }, required: ['path'] },
      async run(a, ctx) {
        const root = wikiTarget(ctx, a.wiki);
        const file = inSession(ctx.cwd, String(a.path ?? ''));
        if (!canRead(file)) throw new Error('This file is not a document type supported by Hydor');
        const suppliedOrigin = typeof a.origin === 'string' && !!a.origin.trim();
        const origin = suppliedOrigin ? a.origin.trim() : `file:${redactSecrets(file)}#${wikiHash(file).slice(0, 16)}`;
        if ((suppliedOrigin && secretIn(origin)) || /[\r\n\0]/.test(origin)) throw new Error('Source origin contains sensitive or invalid text');
        if (/^https?:\/\//i.test(origin)) {
          const url = new URL(origin);
          if (url.username || url.password || [...url.searchParams.keys()].some((key) => /token|secret|password|key|signature|auth/i.test(key))) throw new Error('Remove credentials from the source URL');
        }
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
          refreshWikiKnowledge(ctx.deps.db, root);
          return JSON.stringify({ ...result, gitIgnore: guard, format: extracted.format, extractionNote: extracted.note, note: 'Original bytes are unchanged; the Markdown source note is extracted text and may be incomplete.' });
        } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      },
    },
    {
      name: 'wiki_write',
      description: 'Write one explicitly authorized wiki file after reading it with wiki_read. Supply the exact sha256 of the version read, or null only for a new file. Existing raw sources are immutable. On conflict reread; never silently overwrite. Cite exact raw sources in compiled article frontmatter and link related articles.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, expectedSha256: { type: ['string', 'null'] }, wiki: { type: 'string' } }, required: ['path', 'content', 'expectedSha256'] },
      async run(a, ctx) {
        if (typeof a.path !== 'string' || typeof a.content !== 'string' || !(a.expectedSha256 === null || (typeof a.expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(a.expectedSha256)))) throw new Error('Give path, content, and the exact expected SHA-256 or null');
        // Raw inputs and lesson captures have dedicated workflows, never a generic write shortcut.
        if (a.path.split(/[\\/]/)[0].toLowerCase() === 'raw') throw new Error('Use the source or lessons workflow to create raw material');
        const root = wikiTarget(ctx, a.wiki);
        const guard = await guardProject(ctx, root);
        const result = applyWikiChanges(root, [{ path: a.path, content: a.content, expectedSha256: a.expectedSha256 }]);
        refreshWikiKnowledge(ctx.deps.db, root);
        return JSON.stringify({ ...result, gitIgnore: guard });
      },
    },
    {
      name: 'wiki_check',
      description: 'Check active wiki Markdown files, local links and simple source lists. This is a basic structural check, not a complete nvk audit.',
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { wiki: { type: 'string' } } },
      async run(a, ctx) { return JSON.stringify(checkWiki(wikiTarget(ctx, a.wiki))); },
    },
  ];
}

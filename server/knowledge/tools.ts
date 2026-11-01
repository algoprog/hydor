// What every session's agent has for the knowledge bases: knowledge_search (passages about a question, each
// with its source to cite), knowledge_read (more of a document) and knowledge_list (what is in them).
import { citation } from '../../shared/knowledge.ts';
import type { DB } from '../db.ts';
import type { RunTool } from '../features/types.ts';
import { meaningOn } from '../memory/embed.ts';
import { searchKnowledge, type SearchMode } from './search.ts';
import { baseRow, baseRows, baseView, chunkById, chunksOf, docByPath, docById, docsOf } from './store.ts';

const MAX_READ = 14_000;

/** The bases with documents in them, as agents are told of them. */
export function filled(db: DB): { id: string; name: string; docs: number }[] {
  return baseRows(db)
    .map((b) => ({ id: b.id, name: b.name, docs: (db.prepare("select count(*) as n from kb_docs where base = ? and status = 'indexed'").get(b.id) as { n: number }).n }))
    .filter((b) => b.docs > 0);
}

export function knowledgeInstructions(db: DB): string | null {
  const bases = filled(db);
  if (!bases.length) return null;
  return [
    `Knowledge bases: the user added their own documents for you to search: ${bases.map((b) => `${b.name} (${b.docs} document${b.docs === 1 ? '' : 's'})`).join(', ')}.`,
    'When a question may be answered from them, search there first with knowledge_search, before the web or memory, and read more of a document with knowledge_read.',
    'Answer from what the passages say, and cite each one you use as [file, page or part] with its path; say so when they do not answer it.',
  ].join(' ');
}

const SEARCH: RunTool = {
  name: 'knowledge_search',
  description: [
    "Search the user's knowledge bases (documents and folders they added on the Knowledge page) for passages about a question.",
    'mode: auto (by words and by meaning, the default), words (the words themselves), meaning (what it means, in other words or languages), exact (this exact text, or a /regular expression/, as grep would).',
    'Each passage comes with its file, page or part, and path: cite them. knowledge_read gives more of a document around a passage.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The question or the words to find; in quotes or as /pattern/ for exact text.' },
      mode: { type: 'string', enum: ['auto', 'words', 'meaning', 'exact'] },
      base: { type: 'string', description: 'Only this knowledge base (its name); all of them when left out.' },
      limit: { type: 'number', description: 'How many passages (default 8, at most 25).' },
    },
    required: ['query'],
  },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const query = String(a.query ?? '').trim();
    if (!query) throw new Error('query is empty');
    if (!baseRows(db).length) return 'The user has no knowledge bases yet (they add documents on the Knowledge page).';
    const mode = (['auto', 'words', 'meaning', 'exact'] as const).includes(a.mode) ? (a.mode as SearchMode) : undefined;
    const r = await searchKnowledge(db, { query, mode, bases: a.base ? [String(a.base)] : undefined, limit: Math.min(Number(a.limit) || 8, 25) });
    const byWordsOnly = mode !== 'exact' && mode !== 'words' && !r.meaning ? ` (by words only: search by meaning is ${meaningOn(db) ? 'not running yet' : 'off'})` : '';
    if (!r.hits.length) return `Nothing in the knowledge bases matches that${byWordsOnly}. Try other words${mode === 'exact' ? '' : ', or mode: "exact" for a name or a number'}.`;
    const head = `${r.hits.length} passage${r.hits.length === 1 ? '' : 's'} from the user's knowledge bases${byWordsOnly}. Cite each one you use as [file, page or part] with its path.`;
    const body = r.hits.map((h, i) => `[${i + 1}] ${citation(h)} · ${h.baseName} · ${h.ref}\n${h.path}\n${h.text}`);
    return [head, ...body].join('\n\n');
  },
};

const READ: RunTool = {
  name: 'knowledge_read',
  description: [
    'Read more of a document in a knowledge base: the passages around one knowledge_search found (give its ref, like kb:123),',
    'or a document by its path, from its start or from a passage number. Each passage is marked with its number and its page or part.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      ref: { type: 'string', description: 'A passage knowledge_search found, like kb:123: the passages around it.' },
      path: { type: 'string', description: 'A document by its path, to read from the start (or from `from`).' },
      from: { type: 'number', description: 'The passage number to start at (1 is the first).' },
      count: { type: 'number', description: 'How many passages (default 6, at most 30).' },
    },
  },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const db = ctx.deps.db;
    let doc: ReturnType<typeof docById>;
    let from = Math.max(0, (Number(a.from) || 1) - 1);
    const count = Math.max(1, Math.min(Number(a.count) || 6, 30));
    if (a.ref) {
      const c = chunkById(db, Number(String(a.ref).replace(/^kb:/, '')));
      if (!c) throw new Error('No such passage: knowledge_search gives the refs');
      doc = docById(db, c.doc);
      if (!a.from) from = Math.max(0, c.seq - 1);
    } else if (a.path) doc = docByPath(db, String(a.path));
    else throw new Error('Give a ref (from knowledge_search) or a path');
    if (!doc) throw new Error('That document is not in a knowledge base');
    const rows = chunksOf(db, doc.id, from, count);
    if (!rows.length) return `${doc.title} has ${doc.passages} passages; there is nothing from passage ${from + 1}.`;
    let out = `${doc.title} (${doc.path}), passages ${from + 1}–${from + rows.length} of ${doc.passages}:\n`;
    let part: string | null = null;
    for (const r of rows) {
      const head = r.part && r.part !== part ? ` · ${r.part}` : '';
      part = r.part;
      out += `\n[${r.seq + 1}${head}]\n${r.text}\n`;
      if (out.length > MAX_READ) break;
    }
    const next = from + rows.length;
    if (next < doc.passages) out += `\n(More from passage ${next + 1}: knowledge_read with path and from: ${next + 1}.)`;
    return out.slice(0, MAX_READ + 400);
  },
};

const LIST: RunTool = {
  name: 'knowledge_list',
  description: "The user's knowledge bases and what is in them: their folders and documents.",
  inputSchema: { type: 'object', properties: { base: { type: 'string', description: 'A knowledge base by its name: its documents.' } } },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const rows = baseRows(db);
    if (!rows.length) return 'The user has no knowledge bases yet (they add documents on the Knowledge page).';
    if (a.base) {
      const b = rows.find((x) => x.name.toLowerCase() === String(a.base).toLowerCase() || x.id === a.base);
      if (!b) return `No knowledge base is called that. There are: ${rows.map((x) => x.name).join(', ')}.`;
      const docs = docsOf(db, baseRow(db, b.id).id, { limit: 300 }).filter((d) => d.status === 'indexed');
      return `${b.name}: ${docs.length} document${docs.length === 1 ? '' : 's'}${docs.length >= 300 ? ' (the first 300)' : ''}\n${docs.map((d) => `- ${d.path} (${d.passages} passages)`).join('\n')}`;
    }
    return rows
      .map((r) => {
        const v = baseView(db, r);
        const folders = v.sources.filter((s) => s.kind === 'folder').map((s) => s.path);
        return `- ${v.name}: ${v.docs} documents, ${v.passages} passages${folders.length ? `; folders: ${folders.join(', ')}` : ''}${v.description ? ` (${v.description})` : ''}`;
      })
      .join('\n');
  },
};

export const knowledgeTools = (): RunTool[] => [SEARCH, READ, LIST];

// Knowledge bases: documents and folders the user adds once (the Knowledge page) for every agent to search,
// by words (the full-text index, ranked by BM25), by meaning (local embeddings, when search by meaning is on)
// or for exact text, with each passage citing where it came from. What the server and the pages share.

export interface KnowledgeSource {
  id: string;
  /** Files dropped on the page (kept in the app's data folder), or a folder on this computer, read where it is. */
  kind: 'files' | 'folder';
  path: string;
  name: string;
  addedAt: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  sources: KnowledgeSource[];
  /** Where files dropped on the page go (its own folder in the data folder). */
  filesDir: string;
  docs: number;
  passages: number;
  /** Passages with a vector for search by meaning (while it is on). */
  embedded: number;
  /** Documents that could not be read, and why. */
  errors: { path: string; error: string }[];
  /** Being read now: documents done of those found. */
  indexing?: { done: number; total: number };
  indexedAt?: number;
}

export interface KnowledgeDoc {
  id: number;
  base: string;
  path: string;
  title: string;
  format: string;
  size: number;
  passages: number;
  status: 'indexed' | 'error' | 'empty';
  error?: string;
  indexedAt: number;
}

/** A passage found: the text, the document and the part of it (a page, slide, sheet or heading) to cite. */
export interface KnowledgeHit {
  /** "kb:<id>", what knowledge_read takes. */
  ref: string;
  base: string;
  baseName: string;
  docId: number;
  path: string;
  title: string;
  part?: string;
  text: string;
  score: number;
  /** Found by its words, its meaning, or the exact text. */
  by: ('words' | 'meaning' | 'exact')[];
}

export interface KnowledgeState {
  bases: KnowledgeBase[];
  /** Search by meaning is on (Settings → Memory); without it, words and exact text only. */
  meaning: boolean;
}

/** File types read into a knowledge base besides documents (PDF, Office, OpenDocument, EPUB, CSV, RTF): text and code. */
export const TEXT_EXTS = [
  'md', 'mdx', 'markdown', 'txt', 'text', 'rst', 'org', 'tex', 'log', 'html', 'htm', 'xml', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'rb', 'php', 'sh', 'bash', 'sql', 'r', 'scala', 'lua', 'vue', 'svelte',
];

/** How a passage is cited: the file's name, and the page, slide or part. */
export const citation = (h: Pick<KnowledgeHit, 'title' | 'part'>) => (h.part ? `${h.title}, ${h.part.replace(/^Page (\d+)$/, 'p. $1')}` : h.title);

/** The passages in knowledge_search's answer (each "[n] citation · base · kb:id", its path, its text), for the conversation's view of it. */
export function parseKnowledge(text: string): { cite: string; base: string; ref: string; path: string; text: string }[] {
  const out: { cite: string; base: string; ref: string; path: string; text: string }[] = [];
  let cur: (typeof out)[number] | null = null;
  let pathNext = false;
  for (const line of text.split('\n')) {
    const h = /^\[\d+\] (.+) · (.+?) · (kb:\d+)$/.exec(line);
    if (h) {
      if (cur) out.push(cur);
      cur = { cite: h[1], base: h[2], ref: h[3], path: '', text: '' };
      pathNext = true;
    } else if (cur && pathNext) {
      cur.path = line.trim();
      pathNext = false;
    } else if (cur) cur.text += `${cur.text ? '\n' : ''}${line}`;
  }
  if (cur) out.push(cur);
  return out.map((h) => ({ ...h, text: h.text.trim() }));
}

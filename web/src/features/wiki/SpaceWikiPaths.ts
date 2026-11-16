// Safe wiki-relative link and frontmatter helpers for the read-only project wiki view, and the view as the pages read it.
import type { ProjectWikiView } from '../../../../shared/wiki.ts';

/** The view as the server sends it, or an older server's (status disabled / missing), as the view the pages draw. */
export function normalizeWikiView(raw: unknown): ProjectWikiView {
  const r = (raw ?? {}) as Omit<Partial<ProjectWikiView>, 'status'> & { status?: string };
  const status = r.status === 'disabled' ? 'off' : r.status === 'missing' ? 'empty' : r.status === 'off' || r.status === 'empty' || r.status === 'ready' || r.status === 'error' ? r.status : 'error';
  return { ...r, status, on: typeof r.on === 'boolean' ? r.on : status !== 'off', inherited: r.inherited !== false };
}

/** Resolve only relative links inside the wiki; external and absolute links keep their normal behavior. */
export function wikiRelative(from: string, href: string): string | null {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return null;
  let clean: string;
  try { clean = decodeURIComponent(href.split(/[?#]/, 1)[0]); } catch { return null; }
  if (!clean || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(clean) || clean.includes('\\') || clean.includes('\0')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else parts.push(part);
  }
  const target = parts.join('/');
  return /\.md$/i.test(target) ? target : null;
}

/** Read the common YAML sources list without treating frontmatter as Markdown content. */
export function wikiDocument(content: string): { body: string; sources: string[] } {
  const front = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(content);
  if (!front) return { body: content, sources: [] };
  const sources: string[] = [];
  let reading = false;
  for (const line of front[1].split(/\r?\n/)) {
    const start = /^sources:\s*(.*)$/.exec(line);
    if (start) {
      reading = true;
      const inline = /^\[(.*)\]\s*$/.exec(start[1]);
      if (inline) sources.push(...inline[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean));
      continue;
    }
    if (reading && /^\S/.test(line)) reading = false;
    const item = reading && /^\s+-\s+(.+?)\s*$/.exec(line);
    if (item) sources.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
  }
  return { body: content.slice(front[0].length), sources };
}

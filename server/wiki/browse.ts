// Read-only browsing of an already resolved active wiki; the common reader enforces file boundaries.
import fs from 'node:fs';
import path from 'node:path';
import { readWiki } from './core.ts';
import { wikiFileActive } from './knowledge/bindings.ts';

export interface WikiEntry { path: string; title: string; updated?: number; summary?: string }

/** A frontmatter field's one-line value, without its quotes ("Bob's guide" stays whole); empty when it is not there. */
function frontValue(content: string, key: string): string {
  const front = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
  const value = front && new RegExp(`^${key}\\s*:[ \\t]*(.+?)[ \\t]*$`, 'im').exec(front)?.[1];
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
    try { return String(JSON.parse(value)).trim(); } catch { /* not JSON: take it as written */ }
  }
  const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
  return (quoted ? quoted[2] : value).trim();
}

/** The `title:` of a document's frontmatter, without its quotes ("Bob's guide" stays whole). */
export function titleOf(content: string): string {
  return frontValue(content, 'title');
}

/** The `summary:` of a document's frontmatter, unquoted, cut to 200 characters; empty without one. */
export function summaryOf(content: string): string {
  const text = frontValue(content, 'summary').replace(/\s+/g, ' ');
  return text.length > 200 ? `${text.slice(0, 199).trimEnd()}…` : text;
}

/** List active Markdown articles and source notes, without opening hidden or linked directories. */
export function browseWiki(root: string): { articles: WikiEntry[]; sources: WikiEntry[]; plans: WikiEntry[]; truncated: boolean } {
  const articles: WikiEntry[] = [];
  const sources: WikiEntry[] = [];
  const plans: WikiEntry[] = [];
  let visited = 0;
  let truncated = false;
  const visit = (relative: string, out: WikiEntry[]) => {
    const dir = path.join(root, relative);
    // Never enter a nested content area through a symlinked ancestor.
    let ancestor = root;
    for (const part of relative.split('/')) {
      ancestor = path.join(ancestor, part);
      if (!fs.existsSync(ancestor) || fs.lstatSync(ancestor).isSymbolicLink()) return;
    }
    if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink() || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > 5000) { truncated = true; return; }
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) visit(name, out);
      else if (entry.isFile() && /\.md$/i.test(entry.name) && entry.name !== '_index.md') {
        try {
          if (!wikiFileActive(root, path.join(root, name))) continue;
          const document = readWiki(root, name);
          const summary = summaryOf(document.content);
          out.push({ path: name, title: titleOf(document.content) || entry.name.replace(/\.md$/i, ''), updated: Math.round(fs.statSync(path.join(root, name)).mtimeMs), ...(summary ? { summary } : {}) });
        } catch {
          // Inactive, inaccessible or unsafe documents are not listed.
        }
      }
    }
  };
  visit('wiki', articles);
  visit('raw', sources);
  visit('output/projects', plans);
  visit('output/evidence', plans);
  return { articles, sources, plans, truncated };
}

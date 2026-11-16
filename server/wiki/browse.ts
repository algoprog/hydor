// Read-only browsing of an already resolved active wiki; the common reader enforces file boundaries.
import fs from 'node:fs';
import path from 'node:path';
import { readWiki } from './core.ts';
import { wikiFileActive } from './knowledge/bindings.ts';

export interface WikiEntry { path: string; title: string }

/** List active Markdown articles and source notes, without opening hidden or linked directories. */
export function browseWiki(root: string): { articles: WikiEntry[]; sources: WikiEntry[]; truncated: boolean } {
  const articles: WikiEntry[] = [];
  const sources: WikiEntry[] = [];
  let visited = 0;
  let truncated = false;
  const visit = (relative: string, out: WikiEntry[]) => {
    const dir = path.join(root, relative);
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
          const match = /^---\s*\r?\n[\s\S]*?^title\s*:\s*["']?([^\r\n"']+)/im.exec(document.content);
          out.push({ path: name, title: match?.[1]?.trim() || entry.name.replace(/\.md$/i, '') });
        } catch {
          // Inactive, inaccessible or unsafe documents are not listed.
        }
      }
    }
  };
  visit('wiki', articles);
  visit('raw', sources);
  return { articles, sources, truncated };
}

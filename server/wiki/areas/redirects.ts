// Redirects: an article folded or merged into another keeps its file as a stub (`redirect: <path>` and one line saying
// where it went), so every path keeps working: memory notes that point at it, links in other articles, an agent's
// wiki_read (which follows one hop). Its earlier text is kept in the wiki's history first. The index, hubs, search and
// areas leave stubs out (knowledge/bindings.ts: wikiFileActive).
import path from 'node:path';
import { readWiki, redirectOf } from '../core.ts';
import { snapshotArticle } from '../digest/history.ts';
import { readOrNull, splitFront, titleOfArticle, writeFile } from '../digest/write.ts';
import type { Area } from './registry.ts';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const plain = (s: string) => s.replace(/[\[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

/** A stub's text: front matter (its title, where it went, when) and one line with a link there. */
export function redirectStub(o: { from: string; to: string; title: string; toTitle: string; now: number; what?: 'merged' | 'area' | 'rebuilt' }): string {
  const link = encodeURI(path.posix.relative(path.posix.dirname(o.from), o.to));
  const line =
    o.what === 'area'
      ? `This area's articles are now in [${plain(o.toTitle)}](${link}) (since ${day(o.now)}).`
      : o.what === 'rebuilt'
        ? o.to === 'index.md'
          ? `The wiki was rebuilt from its sources on ${day(o.now)}, and no new article matches this one closely: see [the index](${link}). The earlier wiki is archived and can be restored.`
          : `The wiki was rebuilt from its sources on ${day(o.now)}: what this article said is now in [${plain(o.toTitle)}](${link}). The earlier wiki is archived and can be restored.`
        : `This article was merged into [${plain(o.toTitle)}](${link}) on ${day(o.now)}. Its earlier text is kept in the wiki's history.`;
  return `---\ntitle: ${JSON.stringify(plain(o.title))}\nredirect: ${o.to}\nupdated: ${day(o.now)}\n---\n\n# ${plain(o.title)}\n\n${line}\n`;
}

/**
 * Turns an article into a redirect to `to`, only while it holds `expect` (the text that went into the other article):
 * its text is kept as a snapshot first. False when it changed meanwhile (it is left as it is).
 */
export async function redirectArticle(root: string, o: { from: string; to: string; toTitle: string; expect: string; now: number; why: string }): Promise<boolean> {
  const title = titleOfArticle(o.expect, path.posix.basename(o.from, '.md'));
  let kept = false;
  return writeFile(root, o.from, (cur) => {
    if (cur !== o.expect) return null;
    if (!kept) {
      snapshotArticle(root, o.from, cur, o.now, { source: o.why });
      kept = true;
    }
    return redirectStub({ from: o.from, to: o.to, title, toTitle: o.toTitle, now: o.now });
  });
}

/** A removed area's hub becomes a redirect to the hub of the area that took its articles, or to index.md. */
export async function redirectHub(root: string, area: Area, to: string, now: number): Promise<void> {
  const from = `wiki/areas/${area.id}.md`;
  const cur = readOrNull(root, from);
  if (!cur || redirectOf(cur.content) != null) return;
  const toTitle = to === 'index.md' ? 'the index' : titleOfArticle(readOrNull(root, to)?.content ?? '', path.posix.basename(to, '.md'));
  snapshotArticle(root, from, cur.content, now, { source: `area ${area.name} removed` });
  await writeFile(root, from, (text) => (text === cur.content ? redirectStub({ from, to, title: area.name, toTitle, now, what: 'area' }) : null));
}

/** A document as wiki_read gives it: a redirect is followed one hop, and says so. */
export function readFollowing(root: string, rel: string): { path: string; content: string; sha256: string; redirectedFrom?: string; note?: string } {
  const doc = readWiki(root, rel);
  const to = redirectOf(doc.content);
  if (!to || to === rel) return doc;
  try {
    const target = readWiki(root, to);
    const rebuilt = /rebuilt from its sources/.test(doc.content);
    return { ...target, redirectedFrom: rel, note: rebuilt ? `${rel} is gone since the wiki was rebuilt from its sources: this is ${to}, which holds what it said. The earlier wiki is archived.` : `${rel} was merged into ${to}: this is ${to}. Its earlier text is kept in the wiki's history.` };
  } catch {
    return { ...doc, note: `${rel} points to ${to}, which is not there.` };
  }
}

/** Whether a file is a redirect stub (its body is only where it went). */
export const isRedirect = (text: string) => redirectOf(text) != null;

/** The title a stub keeps (the article's own), for the update lists. */
export const stubTitle = (text: string, fallback: string) => titleOfArticle(text, fallback) || splitFront(text).body.split('\n')[0] || fallback;

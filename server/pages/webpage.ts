// A web page saved to the Library from the user's own browser (the Browser's Save): a document of its readable text, with
// the address it came from and its site's name kept on the page (PageInfo.source), so the Library shows it as a Web page
// and can open the original. It is a Library item like the rest (agents read it as they read the others); what the user's
// browsing keeps beside it (history, bookmarks, downloads) is never copied here.
import { normalizeDoc } from '../../shared/docs.ts';
import type { PageInfo } from '../../shared/pages.ts';
import type { Deps } from '../features/types.ts';
import { shownUrl } from '../browser/outline.ts';
import { spaceChoice } from '../spaces/choice.ts';
import { describeLater } from './describe.ts';
import { placeFor } from './folders.ts';
import { refreshThumbs } from './thumbs.ts';
import { createPage } from './store.ts';

/** The address as kept with the page: no sign-in in it, no #fragment. */
export function sourceUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.username = '';
    u.password = '';
    u.hash = '';
    return u.href;
  } catch {
    return raw;
  }
}

/** A site's name for the Library's card: its host without a leading "www." (a file: address: its file name's folder, empty). */
export function siteOf(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === 'file:' ? 'This computer' : u.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/**
 * The Markdown a saved page is made of: its title, a line saying where and when it was saved from (a secret in the address
 * is hidden, as in a copy for Ask about this page), what was selected when there was something, then the page's text.
 */
export function webPageMarkdown(p: { title: string; url: string; at?: number; selected?: string; text: string }): string {
  const title = (p.title || 'Untitled page').replace(/\s+/g, ' ').trim();
  const day = new Date(p.at ?? Date.now()).toISOString().slice(0, 10);
  const out = [`# ${title}`, '', `Saved from ${shownUrl(sourceUrl(p.url))} on ${day}`, ''];
  const sel = p.selected?.trim();
  if (sel) out.push('## What you selected', '', ...sel.split('\n').map((l) => `> ${l}`), '');
  out.push(p.text.trim() || '(The page has no text.)', '');
  return out.join('\n');
}

/** Makes the document: in a project and folder (none: not in a project), then the Library hears of it, its picture is taken and the helper describes it. */
export function saveWebPage(d: Deps, o: { title: string; url: string; selected?: string; text: string; space?: unknown; folder?: unknown }): PageInfo {
  const title = (o.title || '').replace(/\s+/g, ' ').trim() || siteOf(o.url) || 'Web page';
  const doc = normalizeDoc({ markdown: webPageMarkdown({ ...o, title }) });
  const page = createPage(d.db, {
    title,
    kind: 'doc',
    model: doc,
    by: 'made',
    source: { url: sourceUrl(o.url), site: siteOf(o.url) },
    ...placeFor(d.db, o.folder, spaceChoice(d.db, o.space ?? null)),
  });
  d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  refreshThumbs(d, [page.id]);
  if (!page.description) describeLater(d, page.id);
  return page;
}

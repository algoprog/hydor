// The highlights' routes (under /api/browser/browsing/, which agents are refused: highlights are the user's own). Making one
// marks what is selected in one of your tabs; the rest is a private list of them, by page and in all.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { BROWSING_KEY } from '../../shared/browser.ts';
import { highlightKey } from '../../shared/highlights.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { addHighlight, getHighlight, listHighlights, pageCount, pageHighlights, removeHighlight, setNote } from './highlights.ts';
import { selectScript, removeScript } from './highlights-page.ts';
import { HighlightsLive } from './highlights-live.ts';
import { browserOf } from './session.ts';
import type { Tab } from './tab.ts';

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, any>;

export function highlightRoutes(d: Deps, live: HighlightsLive, open: (url: string) => Promise<Tab>) {
  const { app, db } = d;
  const own = (tab: string) => browserOf(BROWSING_KEY)?.tabs.find((t) => t.targetId === tab && !t.closed);

  /** Highlights: one page's (`url`), or every one, newest first (`q`, `before`, `limit`). */
  app.get('/api/browser/browsing/highlights', async (req) => {
    const { url, q, before, limit } = req.query as Record<string, string | undefined>;
    if (url) return { highlights: pageHighlights(db, url), count: pageCount(db, url) };
    const n = before === undefined || before === '' ? undefined : Number(before);
    if (n !== undefined && !Number.isFinite(n)) throw new HttpError(400, 'before should be a time in milliseconds');
    return { highlights: listHighlights(db, { q: q ?? '', before: n, limit: limit === undefined || limit === '' ? undefined : Number(limit) }) };
  });

  /** Highlights what is selected in one of your tabs: the words are marked on the page and kept. */
  app.post('/api/browser/browsing/highlights', async (req) => {
    const tab = B(req).tab;
    if (typeof tab !== 'string') throw new HttpError(400, 'Send the tab (its id) to highlight in');
    const t = own(tab);
    if (!t) throw new HttpError(404, 'No such tab');
    if (!highlightKey(t.url)) throw new HttpError(409, 'Highlights are for web pages and files');
    const id = crypto.randomUUID();
    let r: { error?: string; text?: string; prefix?: string; suffix?: string } | undefined;
    try {
      r = await t.evaluate(selectScript(id));
    } catch (e) {
      throw new HttpError(502, `The page could not be marked: ${(e as Error).message}`);
    }
    if (!r || r.error || !r.text) throw new HttpError(409, r?.error || 'Select some words on the page first');
    let h;
    try {
      h = addHighlight(db, { id, url: t.url, title: t.title, text: r.text, prefix: r.prefix, suffix: r.suffix });
    } catch (e) {
      await t.evaluate(removeScript(id)).catch(() => {});
      throw new HttpError(409, (e as Error).message);
    }
    if (!h) {
      await t.evaluate(removeScript(id)).catch(() => {});
      throw new HttpError(409, 'Those words cannot be highlighted');
    }
    return { highlight: h, count: pageCount(db, t.url) };
  });

  /** A highlight's note. */
  app.patch('/api/browser/browsing/highlights/:id', async (req) => {
    const note = B(req).note;
    if (typeof note !== 'string') throw new HttpError(400, 'Send the note as text (empty takes it away)');
    const h = setNote(db, P(req).id, note);
    if (!h) throw new HttpError(404, 'No such highlight');
    void live.noted(h);
    return { highlight: h };
  });

  /** Takes a highlight away, and its marks from the pages open now. */
  app.delete('/api/browser/browsing/highlights/:id', async (req) => {
    const h = removeHighlight(db, P(req).id);
    if (h) await live.removed(h);
    return { removed: !!h };
  });

  /** Opens a highlight's page in your Browser (the tab it is open in, or a new one) and scrolls to the words. */
  app.post('/api/browser/browsing/highlights/:id/open', async (req) => {
    const h = getHighlight(db, P(req).id);
    if (!h) throw new HttpError(404, 'No such highlight');
    const b = browserOf(BROWSING_KEY);
    const there = b?.tabs.find((t) => !t.closed && highlightKey(t.url) === h.key);
    let t: Tab;
    if (b && there) {
      b.setActive(there);
      b.changed();
      t = there;
    } else t = await open(h.url);
    live.focus(t.targetId, h.id);
    await t.waitLoad(5000).catch(() => {});
    void live.show(t, h.id);
    return { view: browserOf(BROWSING_KEY)?.view() };
  });
}

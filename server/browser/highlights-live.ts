// Highlights on the pages open in your own tabs: when a page has finished loading (and again a moment later, and later
// still, for a page that builds its content after it loads) the highlights saved for it are found by their words and marked,
// and when one is deleted or its note changes, its marks in the open tabs follow. Only your own tabs: an agent's tab in your
// browsing is another browser (session.ts) and never gets your marks.
import { highlightKey, type PageHighlight } from '../../shared/highlights.ts';
import type { DB } from '../db.ts';
import { pageHighlights } from './highlights.ts';
import { applyScript, noteScript, removeScript, scrollScript } from './highlights-page.ts';

/** When, after a page has loaded, its highlights are looked for again (ms): at once, then for content that came later. */
export const APPLY_AT = [0, 1200, 4000];

/** What this needs of a tab (server/browser/tab.ts Tab). */
export interface LiveTab {
  targetId: string;
  url: string;
  closed?: boolean;
  evaluate<T>(expression: string): Promise<T>;
}

interface Seen {
  key: string | null;
  loading: boolean;
  /** When its page last finished loading, as the view said. */
  loadedAt?: number;
  applied: boolean;
}

export class HighlightsLive {
  private seenTabs = new Map<string, Seen>();
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private focusOf = new Map<string, string>();

  constructor(
    private db: DB,
    private tabs: () => LiveTab[],
    private at: number[] = APPLY_AT,
  ) {}

  /** The view of your browsing changed: pages that have just loaded, or are another page now, get their highlights. */
  seen(view: { open: boolean; tabs: { id: string; url: string; loading?: boolean; loadedAt?: number }[] }) {
    if (!view.open) {
      for (const id of [...this.seenTabs.keys()]) this.forget(id);
      return;
    }
    const live = new Set<string>();
    for (const t of view.tabs) {
      live.add(t.id);
      const key = highlightKey(t.url);
      const loading = t.loading === true;
      const prev = this.seenTabs.get(t.id);
      let applied = prev?.applied ?? false;
      // Another page, a page that started loading, or one that loaded again between two looks (a quick reload).
      if (!prev || prev.key !== key || (loading && !prev.loading) || (!loading && t.loadedAt !== undefined && t.loadedAt !== prev.loadedAt)) {
        applied = false;
        // Another page: the pass for the last one is over.
        if (prev) this.clearTimers(t.id);
      }
      if (key && !loading && !applied) {
        applied = true;
        this.schedule(t.id);
      }
      this.seenTabs.set(t.id, { key, loading, loadedAt: t.loadedAt, applied });
    }
    for (const id of [...this.seenTabs.keys()]) if (!live.has(id)) this.forget(id);
  }

  /** Scroll to this highlight once its tab has it marked. */
  focus(tab: string, id: string) {
    this.focusOf.set(tab, id);
    // Not for ever: a page that never shows it is left where it is.
    setTimeout(() => this.focusOf.get(tab) === id && this.focusOf.delete(tab), 15_000).unref?.();
  }

  /** Marks a tab's page's highlights now (and scrolls to `focus`). Whether any were marked. */
  async applyTo(tab: LiveTab, focus?: string): Promise<boolean> {
    if (tab.closed) return false;
    const list = pageHighlights(this.db, tab.url);
    if (!list.length) return false;
    const run = () => tab.evaluate<{ ids: string[]; shown: boolean }>(applyScript(list, focus));
    let r: { ids: string[]; shown: boolean } | undefined;
    try {
      r = await run();
    } catch {
      // The page moved on under the script (a new document): once more, in its new world.
      try {
        r = await run();
      } catch {
        return false;
      }
    }
    if (r?.shown && focus && this.focusOf.get(tab.targetId) === focus) this.focusOf.delete(tab.targetId);
    return !!r?.ids?.length;
  }

  /** The open tabs showing this page of yours. */
  private showing(key: string): LiveTab[] {
    return this.tabs().filter((t) => !t.closed && highlightKey(t.url) === key);
  }

  /** A highlight is gone: its marks go from the open tabs. */
  async removed(h: PageHighlight) {
    await Promise.all(this.showing(h.key).map((t) => t.evaluate(removeScript(h.id)).catch(() => {})));
  }

  /** A note changed. */
  async noted(h: PageHighlight) {
    await Promise.all(this.showing(h.key).map((t) => t.evaluate(noteScript(h.id, h.note)).catch(() => {})));
  }

  /** Scrolls an open tab to a highlight, marking it first when it is not marked yet. */
  async show(tab: LiveTab, id: string): Promise<boolean> {
    if (await this.applyTo(tab, id)) return true;
    return tab.evaluate<boolean>(scrollScript(id)).catch(() => false);
  }

  private schedule(tab: string) {
    this.clearTimers(tab);
    const timers = this.at.map((ms) =>
      setTimeout(() => {
        const t = this.tabs().find((x) => x.targetId === tab);
        if (t) void this.applyTo(t, this.focusOf.get(tab));
      }, ms),
    );
    this.timers.set(tab, timers);
  }

  private clearTimers(tab: string) {
    for (const t of this.timers.get(tab) ?? []) clearTimeout(t);
    this.timers.delete(tab);
  }

  private forget(tab: string) {
    this.clearTimers(tab);
    this.seenTabs.delete(tab);
    this.focusOf.delete(tab);
  }

  /** Stops everything it has waiting (for a test, or when the browser stops). */
  stop() {
    for (const id of [...this.seenTabs.keys()]) this.forget(id);
  }
}

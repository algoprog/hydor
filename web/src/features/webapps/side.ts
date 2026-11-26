// What decides which web app is beside a session's conversation, without drawing anything: read from the conversation's own record (its tool
// calls), so it is there after a page reload, unless the person closed it. Pure, so a script tests it (side-test.ts).
import type { TimelineItem } from '@shared/types';

/** What a webapp_* call said about the app: the id the tools end their answer with ("[web app <id>]"). */
export const webAppOf = (out: string): string | null => /\[web app ([0-9a-f]{16})\]/.exec(out)?.[1] ?? null;

/** What a conversation's own record says is beside it: the app the newest web app call (that did not fail) was about, and that call's id. */
export function latestWebApp(items: readonly TimelineItem[] | undefined): { item: string; app: string } | null {
  for (let i = (items?.length ?? 0) - 1; i >= 0; i--) {
    const it = items![i];
    if (it.kind !== 'tool' || !/(?:^|__)webapp_[a-z]+$/.test(it.tool.name) || it.tool.status === 'error') continue;
    const app = webAppOf(it.tool.output ?? '');
    if (app) return { item: it.id, app };
  }
  return null;
}

/**
 * The app to show beside a conversation: the one the person opened by hand, else the one its newest web app call was about (so it is there after
 * a reload, from the conversation's own record), unless they closed it. Only the page's own state is for the first; the record is the second's.
 */
export function webSideTarget(explicit: string | undefined, latest: { item: string; app: string } | null, closed: string | undefined): string | null {
  if (explicit) return explicit;
  return latest && closed !== latest.item ? latest.app : null;
}


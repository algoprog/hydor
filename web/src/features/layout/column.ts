/**
 * The column beside the rail that a page has, if any (SideColumn.tsx): the sessions' on the start page, in a session
 * and in its review; the Library's; the Apps page's; Settings'; the Browser's own tab column, which the page draws itself. Every other
 * page uses the whole width. All of them read `useUI.sideOpen`, so Ctrl+B and the Hide and Show sidebar buttons mean the
 * column of the page you are on. The Library's and the Apps page's index only (its places, Connected apps included): a page, a picture or an app opened from them is shown whole.
 */
export type Column = 'sessions' | 'library' | 'apps' | 'settings' | 'browser';

export function columnOf(loc: string): Column | null {
  if (loc === '/' || loc.startsWith('/s/') || loc.startsWith('/review/')) return 'sessions';
  // /pages is the Library's old address: it goes to /library at once.
  if (loc === '/library' || loc === '/pages') return 'library';
  // The Apps page: the gallery and Connected apps; an app, its runs and the builder (/apps/<id>…) use the whole width.
  if (loc === '/apps' || loc === '/apps/connected') return 'apps';
  if (loc === '/settings') return 'settings';
  if (loc === '/browser') return 'browser';
  return null;
}

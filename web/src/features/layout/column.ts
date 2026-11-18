/**
 * The column beside the rail that a page has, if any (SideColumn.tsx): the sessions' on the start page, in a session
 * and in its review; the Library's; Settings'; the Browser's own tab column, which the page draws itself. Every other
 * page uses the whole width. All of them read `useUI.sideOpen`, so Ctrl+B and the Hide and Show sidebar buttons mean the
 * column of the page you are on. The Library's index only: a page or a picture opened from it is shown whole.
 */
export type Column = 'sessions' | 'library' | 'settings' | 'browser';

export function columnOf(loc: string): Column | null {
  if (loc === '/' || loc.startsWith('/s/') || loc.startsWith('/review/')) return 'sessions';
  // /pages is the Library's old address: it goes to /library at once.
  if (loc === '/library' || loc === '/pages') return 'library';
  if (loc === '/settings') return 'settings';
  if (loc === '/browser') return 'browser';
  return null;
}

/**
 * The column beside the rail that a page has, if any (SideColumn.tsx): the sessions' on the start page, in a session
 * and in its review; the Apps page's; Settings'; the Agents page's (also on an agent's page); Help's topics; the
 * Browser's own tab column, which the page draws itself. Every other page uses the whole width (Projects and Shared
 * knowledge too: a project's details are a window over the page, not a page). All of them read
 * `useUI.sideOpen`, so Ctrl+B and the Hide and Show sidebar buttons mean the column of the page you are on. The Apps
 * page's index only (its places, Connected apps included): an app opened from it is shown whole.
 */
export type Column = 'sessions' | 'apps' | 'settings' | 'agents' | 'help' | 'browser';

export function columnOf(loc: string): Column | null {
  if (loc === '/' || loc.startsWith('/s/') || loc.startsWith('/review/')) return 'sessions';
  // The Apps page: the gallery and Connected apps; an app, its runs and the builder (/apps/<id>…) use the whole width.
  if (loc === '/apps' || loc === '/apps/connected') return 'apps';
  if (loc === '/settings') return 'settings';
  // Agents: the list and each agent's own page.
  if (loc === '/agents' || loc.startsWith('/agents/')) return 'agents';
  // Help: the guide's home and its topics.
  if (loc === '/guide' || loc.startsWith('/guide/')) return 'help';
  if (loc === '/browser') return 'browser';
  return null;
}

/**
 * Pages that draw their own column beside the rail (the Browser's tabs, the Library's folders): the shell shows the
 * rail but not the sessions sidebar there. They read `useUI.sideOpen` themselves, so Ctrl+B and the sidebar button
 * still mean their column. The Library's index only: a page or a picture opened from it is shown whole, with the sidebar.
 */
export function ownColumn(loc: string): boolean {
  // /pages is the Library's old address: it goes to /library at once.
  return loc === '/browser' || loc === '/library' || loc === '/pages';
}

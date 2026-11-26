// Where a strip of tabs that scrolls sideways (the Data page's tables, on a phone) has to be scrolled to for the chosen tab to be in
// view: where it already is when the tab is whole in view, else the least that shows it whole, with a little room on its side.
export function scrollForTab(strip: { scrollLeft: number; clientWidth: number; scrollWidth: number }, tab: { offsetLeft: number; offsetWidth: number }, room = 12): number {
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const from = tab.offsetLeft - room;
  const to = tab.offsetLeft + tab.offsetWidth + room;
  let left = strip.scrollLeft;
  if (from < left) left = from;
  else if (to > left + strip.clientWidth) left = to - strip.clientWidth;
  return Math.min(max, Math.max(0, Math.round(left)));
}

// How many of the address bar's rows fit under it, and which go when they do not (Omnibox.tsx).

/** The least rows of each source (your pages, the search engine's suggestions) that stay when the list is cut to fit. */
const KEEP = 2;

/**
 * At most `n` rows: what you typed (always first) stays; when the rest has to be cut, the side with more rows loses its
 * last ones first (the engine's suggestions on a tie, as they come after your pages), and each side that is there keeps
 * at least two. Where even that does not fit, the end goes.
 */
export function fitRows<T extends { id: string; kind: string }>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  const lead = rows.filter((r) => r.id === 'typed');
  const pages = rows.filter((r) => r.id !== 'typed' && r.kind !== 'search');
  const searches = rows.filter((r) => r.id !== 'typed' && r.kind === 'search');
  let total = lead.length + pages.length + searches.length;
  while (total > n) {
    const side = searches.length >= pages.length ? searches : pages;
    const other = side === searches ? pages : searches;
    const cut = side.length > KEEP ? side : other.length > KEEP ? other : side.length >= other.length ? side : other;
    if (!cut.length) break;
    cut.pop();
    total--;
  }
  const keep = new Set([...lead, ...pages, ...searches]);
  return rows.filter((r) => keep.has(r));
}

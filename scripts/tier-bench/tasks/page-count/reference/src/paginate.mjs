// Pagination helpers. Pages are numbered from 1.

/**
 * How many pages are needed to show `total` items, `perPage` on each page.
 * 0 items need 0 pages. `perPage` must be a positive integer (RangeError otherwise);
 * `total` must be a non-negative integer (RangeError otherwise).
 */
export function pageCount(total, perPage) {
  checkArgs(total, perPage);
  return Math.ceil(total / perPage);
}

/**
 * The items on page `page` (counting from 1) when each page holds `perPage` items.
 * The last page may be shorter. A page below 1 or above the last page gives an empty array.
 * `perPage` must be a positive integer (RangeError otherwise).
 */
export function pageSlice(items, page, perPage) {
  checkArgs(items.length, perPage);
  if (!Number.isInteger(page) || page < 1 || page > pageCount(items.length, perPage)) return [];
  return items.slice((page - 1) * perPage, page * perPage);
}

function checkArgs(total, perPage) {
  if (!Number.isInteger(perPage) || perPage < 1) throw new RangeError('perPage must be a positive integer');
  if (!Number.isInteger(total) || total < 0) throw new RangeError('total must be a non-negative integer');
}

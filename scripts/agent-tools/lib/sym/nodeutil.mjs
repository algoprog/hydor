// Small helpers shared by the per-language declaration modules.

export const sameNode = (a, b) => a && b && a.id === b.id;

// last row of a node; a node ending at column 0 of a later row really ends on the previous row
export function endRowOf(n) {
  const e = n.endPosition;
  return e.column === 0 && e.row > n.startPosition.row ? e.row - 1 : e.row;
}

// Like endRowOf, but ignores trailing comment children (Python blocks swallow them).
export function trueEndRow(n) {
  let cur = n;
  for (;;) {
    let last = null;
    for (let i = cur.childCount - 1; i >= 0; i--) {
      const c = cur.child(i);
      if (c.type === 'comment' || c.isExtra && c.type.includes('comment')) continue;
      last = c;
      break;
    }
    if (!last) break;
    cur = last;
  }
  const e = cur.endPosition;
  return e.column === 0 && e.row > cur.startPosition.row ? e.row - 1 : e.row;
}

// Walk back over directly attached siblings (attributes/decorators and adjacent comments).
// isAttr(node) -> true for decorators / attributes; isComment(node) -> comment-like nodes.
export function attachedStart(node, isAttr, isComment, endFn = endRowOf) {
  let start = node.startPosition.row;
  let cur = node;
  for (;;) {
    const prev = cur.previousSibling;
    if (!prev) break;
    const attr = isAttr(prev);
    const com = !attr && isComment(prev);
    if (!attr && !com) break;
    if (endFn(prev) < start - 1) break; // blank line between
    if (com) {
      const pp = prev.previousSibling;
      // a comment trailing the previous statement on the same row does not belong to us
      if (pp && pp.endPosition.row === prev.startPosition.row && !isAttr(pp) && !isComment(pp)) break;
    }
    start = Math.min(start, prev.startPosition.row);
    cur = prev;
  }
  return start;
}

export function firstNonTrivia(node, skip) {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (!skip(c)) return c;
  }
  return null;
}

// How a text file is indented: with tabs, or with spaces and how many. Read from the file's own lines (the editor keeps
// to what the file does), and shown in the file editor's status bar, where it can be changed.

export interface Indent {
  kind: 'spaces' | 'tabs';
  /** The width of one level: the spaces in it, or what a tab is drawn as. */
  size: number;
}

/** What a file with nothing to go by is indented with. */
export const DEFAULT_INDENT: Indent = { kind: 'spaces', size: 2 };

/**
 * The indentation the first 500 indented lines of the text use: tabs when more lines start with a tab than with
 * spaces; else the step by which the spaces deepen between one line and the next (the commonest one, 2 to 8), else 2.
 */
export function detectIndent(text: string): Indent {
  let tabs = 0;
  let spaces = 0;
  const steps = new Map<number, number>();
  let prev = 0;
  let seen = 0;
  let from = 0;
  while (from < text.length && seen < 500) {
    let end = text.indexOf('\n', from);
    if (end < 0) end = text.length;
    const c = text.charCodeAt(from);
    if (end > from && c === 9) {
      tabs++;
      seen++;
    } else if (c === 32) {
      let n = 0;
      while (from + n < end && text.charCodeAt(from + n) === 32) n++;
      // A line of spaces only, or a doc comment's one-space lead, tells nothing.
      if (from + n < end && !(n === 1 && text.charCodeAt(from + n) === 42)) {
        spaces++;
        seen++;
        const d = Math.abs(n - prev);
        if (d >= 2 && d <= 8) steps.set(d, (steps.get(d) ?? 0) + 1);
        prev = n;
      }
    } else if (end > from) prev = 0;
    from = end + 1;
  }
  if (tabs > spaces) return { kind: 'tabs', size: 4 };
  if (!spaces) return DEFAULT_INDENT;
  let best = 0;
  let count = 0;
  for (const [d, n] of steps) if (n > count || (n === count && d < best)) (best = d), (count = n);
  return { kind: 'spaces', size: best || 2 };
}

import { picturesOnly } from './markdown-pictures';

/**
 * A reply still coming, cut into its top-level blocks (components/Markdown.tsx), so the finished ones are drawn once and
 * only the last, where the words arrive, is read again with each of them: the whole reply was, twenty times a second
 * (55 ms each time at 32 KB). A cut is made at a blank line outside code and display maths, and not before a line that
 * may go on the block above (indented, or a list's next item: a list stays one list), nor between pictures: a paragraph
 * of only pictures and what may become one next (a line starting with "!") stay one block, so the grid they make
 * (components/markdown-pictures.ts) forms as they arrive and does not come apart when the reply ends. Joined by line
 * breaks, the blocks are the text again.
 */
export function streamBlocks(src: string): string[] {
  const lines = src.split('\n');
  const out: string[] = [];
  let start = 0;
  let fence: string | null = null;
  let maths = false;
  for (let i = 0; i < lines.length; i++) {
    // Inside a quote or a list, a line starts with "> " or spaces.
    const t = lines[i].replace(/^(?:[ \t]*>)*[ \t]*/, '');
    if (fence) {
      const close = /^(`{3,}|~{3,})\s*$/.exec(t)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = null;
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(t)?.[1];
    if (open) {
      fence = open;
      continue;
    }
    if (t.startsWith('$$') && (t.match(/\$\$/g)?.length ?? 0) % 2 === 1) maths = !maths;
    if (maths || lines[i].trim() || i + 1 >= lines.length) continue;
    const next = lines[i + 1];
    if (!next.trim() || /^[ \t]/.test(next) || /^([-*+]|\d{1,9}[.)])([ \t]|$)/.test(next)) continue;
    if (/^!/.test(next.trimStart()) && picturesOnly(paragraphBefore(lines, start, i))) continue;
    if (lines.slice(start, i + 1).some((l) => l.trim())) {
      out.push(lines.slice(start, i + 1).join('\n'));
      start = i + 1;
    }
  }
  out.push(lines.slice(start).join('\n'));
  return out;
}

/** The paragraph that ends before the blank line `at` (not before `start`). */
function paragraphBefore(lines: string[], start: number, at: number): string {
  let end = at;
  while (end > start && !lines[end - 1].trim()) end--;
  let from = end;
  while (from > start && lines[from - 1].trim()) from--;
  return lines.slice(from, end).join('\n');
}

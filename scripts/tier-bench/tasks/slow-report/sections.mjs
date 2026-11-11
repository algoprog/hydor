// Cuts a report into its six sections at the heading lines: each one runs from its heading to the next (the blank
// line that ends it included). A section whose heading is missing is null.
import { HEADINGS } from './datasets.mjs';

export function splitSections(report) {
  const starts = [];
  let from = 0;
  for (const heading of HEADINGS) {
    const at = report.indexOf(heading, from);
    // A heading starts a line: the first one at the very start, the others after a blank line.
    const ok = at === 0 || (at > 1 && report.slice(at - 2, at) === '\n\n');
    starts.push(at >= 0 && ok ? at : -1);
    if (at >= 0 && ok) from = at + heading.length;
  }
  return starts.map((start, i) => {
    if (start < 0) return null;
    const next = starts.slice(i + 1).find((s) => s >= 0);
    return report.slice(start, next ?? report.length);
  });
}

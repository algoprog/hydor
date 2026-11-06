// Where Add puts a new block (Put it: after the part picked, inside it, or at the end of the page), and how a request
// to an agent says it. Apart from AddPanel.tsx so that it can be used (and tested) without the editor's components.
import type { EdSel } from '../frame';

export type Where = 'after' | 'inside' | 'end';

/** Where a block made with AI goes, in words for the agent: after the part picked, inside it, or at the end of the page. */
export function blockPlace(where: Where, sel: EdSel | null): string {
  if (!sel || sel.tag === 'body' || where === 'end') return 'at the end of the page';
  const part = `the ${sel.name.toLowerCase()}${sel.snippet ? ` “${sel.snippet}”` : ''} (\`${sel.selector}\`)`;
  return where === 'inside' && sel.holds ? `inside ${part}, at its end` : `after ${part}`;
}

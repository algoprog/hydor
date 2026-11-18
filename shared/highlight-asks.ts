// What "Ask an agent about these" says to an agent about the highlights you made on a page (Library → Highlights, and the
// Browser's Highlights panel): the page's address and title, each highlighted passage in quotes with the note you put on
// it. It goes to agents as your own message, so its words are not translated (scripts/i18n-extract.mjs leaves this file out).
import type { PageHighlight } from './highlights.ts';

const one = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The message that starts a session about the highlights of one page. */
export function highlightsAsk(page: { url: string; title: string }, highlights: Pick<PageHighlight, 'text' | 'note'>[]): string {
  const lines = [`I highlighted ${highlights.length === 1 ? 'a passage' : `${highlights.length} passages`} on this page: ${page.title ? `“${one(page.title)}” ` : ''}${page.url}`, ''];
  for (const h of highlights) {
    lines.push(`> ${one(h.text)}`);
    if (h.note.trim()) lines.push(`My note: ${one(h.note)}`);
    lines.push('');
  }
  lines.push('Read the page if you need its context, then tell me what these passages say together and what is worth looking into further.');
  return lines.join('\n');
}

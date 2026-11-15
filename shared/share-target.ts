// Share to Hydor: what another app shared with the installed web app (server/share-target.ts keeps it), and how it
// fills the start page's message box: the words with the link, and the files among the attachments.

/** A share as the server kept it: its title, words and link as the other app gave them, and the files saved for it. */
export interface Shared {
  id: string;
  title?: string;
  text?: string;
  url?: string;
  files: { path: string; name: string; size: number }[];
  at: number;
}

/**
 * The message box's words for a share: the title (when the words do not hold it already: a page's title from a
 * browser), the words, then the link (when the words do not hold it already: many apps put it in both); and its files.
 */
export function boxOf(s: Pick<Shared, 'title' | 'text' | 'url' | 'files'>): { prompt: string; files: Shared['files'] } {
  const title = (s.title ?? '').trim();
  const text = (s.text ?? '').trim();
  const url = (s.url ?? '').trim();
  const parts: string[] = [];
  if (title && !text.includes(title) && title !== url) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return { prompt: parts.join('\n'), files: s.files };
}

/** What the start page says when a share did not reach the server (the address it opens with: /?share=signed-out…). */
export const SHARE_TROUBLE: Record<string, string> = {
  'signed-out': 'What you shared did not reach Hydor: you were signed out. Sign in, then share it again.',
  'too-big': 'What you shared is too big: a message can carry up to 25 MB of files.',
  failed: 'What you shared did not reach Hydor: share it again.',
};

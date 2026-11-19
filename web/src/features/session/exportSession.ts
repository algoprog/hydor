// A conversation out of the chat, from the session's menu (Export): a Markdown file to download, the same Markdown on
// the clipboard, or a document kept. The server writes the Markdown (server/session-export.ts: answer cards as
// text and tables, diagrams and maths as written), so the `hydor` command gets the same.
import { ApiError, enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { toast, toastError, useToasts } from '../../lib/store';

const exportUrl = (key: string) => mu(`/api/sessions/${enc(key)}/export?format=md`);

/** Downloads the conversation as `<title>.md` (the server names it). */
export function downloadMarkdown(key: string) {
  const a = document.createElement('a');
  a.href = exportUrl(key);
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** The conversation's Markdown, from the server. */
async function markdownOf(key: string): Promise<string> {
  const r = await fetch(exportUrl(key), { credentials: 'same-origin' });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      msg = ((await r.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(msg, r.status);
  }
  return r.text();
}

/**
 * Copies the conversation as Markdown. The clipboard is asked for at once, with the text still coming (Safari allows a
 * copy only while the click is fresh); where that cannot be, the text is copied once it is here.
 */
export async function copyMarkdown(key: string) {
  const text = markdownOf(key);
  try {
    let copied = false;
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write)
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
        copied = true;
      } catch {
        // The text itself failed (said below), or the clipboard would not take it so: as plain text then.
      }
    if (!copied) await navigator.clipboard.writeText(await text);
    toast('Copied the conversation as Markdown', 'ok');
  } catch (e) {
    toastError(e);
  }
}

/** Makes a kept document of the conversation; the toast opens it. */
export async function saveToLibrary(key: string) {
  try {
    const r = await post<{ page: { id: string }; notes?: string[] }>(`/api/sessions/${enc(key)}/export/doc`);
    useToasts.getState().push('ok', 'Saved as a document', { label: 'Open', run: () => go(`/pages/${r.page.id}`) }, r.notes?.length ? r.notes.join(' ') : undefined);
  } catch (e) {
    toastError(e);
  }
}

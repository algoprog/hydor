// Codex (the agent of OpenAI's ChatGPT app) cites files in its replies with a directive of its own, which the ChatGPT app
// shows as a chip with the file's name:
//   :codex-file-citation{path="/Users/me/.codex/.chatgpt-projects/g-p-…/sources/Week 3 slides.pdf" purpose="source"}
// Here each becomes a link to the file, which opens in the app's file viewer, drawn as a file chip (Markdown.tsx); read
// aloud, just the file's name. Directives inside code are left as they are.

/** The title a file citation's link carries, so the page draws it as a chip. */
export const FILE_CITATION = 'file-citation';

const DIRECTIVE = /:codex-file-citation\{([^{}\n]*)\}/g;
const ATTR = /([A-Za-z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^\s"'}]+))/g;

/** A directive's attributes: key="value", key='value' or key=value. */
export function directiveAttrs(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(ATTR)) out[m[1]] = m[2] != null ? m[2].replace(/\\(.)/g, '$1') : (m[3] ?? m[4] ?? '');
  return out;
}

/**
 * A path as a file:// address that keeps every character of the file's name: "%", "#", "?", spaces and the rest are
 * encoded, so "Group Activity #4.pdf" and "Cai%20notes.pdf" open as they are named. `line` points at a line of it.
 */
export const fileHref = (path: string, line?: number) => `file://${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;

/** Text outside code spans and fenced blocks given to `fn`, code left as it is. */
function outsideCode(src: string, fn: (s: string) => string): string {
  let out = '';
  let at = 0;
  for (const m of src.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g)) {
    out += fn(src.slice(at, m.index)) + m[0];
    at = m.index! + m[0].length;
  }
  return out + fn(src.slice(at));
}

interface FileCite {
  path: string;
  name: string;
  line?: number;
}

function cite(body: string): FileCite | null {
  const a = directiveAttrs(body);
  const path = (a.path ?? a.file ?? a.absolute_file_path ?? '').trim();
  if (!path) return null;
  const line = Number(a.line_range_start ?? a.start_line ?? a.line ?? /^\d+/.exec(a.lines ?? a.line_range ?? '')?.[0]) || undefined;
  return { path, name: path.split(/[\\/]/).filter(Boolean).pop() ?? path, line };
}

const escapeMd = (s: string) => s.replace(/([\\`*_[\]<>])/g, '\\$1');

/** Codex's file citations in a reply as Markdown links to the files, titled FILE_CITATION. */
export function codexCitations(text: string): string {
  if (!text.includes(':codex-file-citation{')) return text;
  return outsideCode(text, (part) =>
    part.replace(DIRECTIVE, (all, body: string) => {
      const c = cite(body);
      return c ? `[${escapeMd(c.name)}${c.line ? ` (line ${c.line})` : ''}](<${fileHref(c.path, c.line)}> "${FILE_CITATION}")` : all;
    }),
  );
}

/** Codex's file citations as the files' names alone (a reply read aloud, or shown as plain text). */
export function plainCodexCitations(text: string): string {
  if (!text.includes(':codex-file-citation{')) return text;
  return text.replace(DIRECTIVE, (all, body: string) => cite(body)?.name ?? all);
}

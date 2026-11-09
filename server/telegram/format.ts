// An agent's reply as Telegram shows it: its Markdown in the few HTML tags Telegram reads (bold, italic, struck,
// code, preformatted, links and quotes), cut into messages of the length Telegram takes, never through a code block.
// What Telegram still refuses goes as plain text (plainText).

/** Telegram takes 4096 characters a message; what the tags add is left room for. */
export const MESSAGE_CHARS = 3600;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s: string) => esc(s).replace(/"/g, '&quot;');

/** One line's inline Markdown: `code`, **bold**, *italic*, ~~struck~~ and [links](https://…). */
function inline(text: string): string {
  const kept: string[] = [];
  const keep = (html: string) => `\u0000${kept.push(html) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_, c: string) => keep(`<code>${esc(c)}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => keep(`<a href="${attr(u)}">${esc(t)}</a>`));
  s = esc(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/__([^_\n]+)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]);
}

/** Markdown as Telegram's HTML: headings bold, list markers as bullets, quotes and tables kept whole. */
export function telegramHtml(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+.#-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !new RegExp(`^\\s*${fence[1][0] === '`' ? '`' : '~'}{${fence[1].length},}\\s*$`).test(lines[i]); i++) body.push(lines[i]);
      const lang = fence[2] ? ` class="language-${attr(fence[2])}"` : '';
      out.push(`<pre><code${lang}>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // A table, as it reads in a fixed-width font.
      const rows: string[] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim());
      i--;
      out.push(`<pre>${esc(rows.join('\n'))}</pre>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quoted.push(inline(lines[i].replace(/^\s*>\s?/, '')));
      i--;
      out.push(`<blockquote>${quoted.join('\n')}</blockquote>`);
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      out.push(`<b>${inline(heading[1])}</b>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('──────────');
      continue;
    }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (item) {
      out.push(`${item[1]}• ${inline(item[2])}`);
      continue;
    }
    out.push(inline(line));
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Markdown without its marks, for when Telegram refuses the HTML. */
export function plainText(md: string): string {
  return md
    .replace(/^\s*(`{3,}|~{3,})[^\n]*$/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Markdown cut into parts of at most `max` characters, at blank lines between paragraphs; a code block too long for
 * one goes in several, each fenced again. Each part converts on its own (telegramHtml).
 */
export function chunks(md: string, max = MESSAGE_CHARS): string[] {
  const blocks: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let cur: string[] = [];
  const flush = () => {
    const b = cur.join('\n').trim();
    if (b) blocks.push(b);
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[i]);
    if (fence) {
      flush();
      const open = lines[i];
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*(`{3,}|~{3,})\s*$/.test(lines[i]); i++) body.push(lines[i]);
      // Fenced again in pieces that fit, line by line (a line longer than a message is cut).
      let piece: string[] = [];
      const room = max - open.length - 8;
      const out = () => {
        if (piece.length) blocks.push(`${open}\n${piece.join('\n')}\n${fence[1]}`);
        piece = [];
      };
      for (const l of body) {
        for (let at = 0; at < Math.max(1, l.length); at += room) {
          const part = l.slice(at, at + room);
          if (piece.join('\n').length + part.length + 1 > room) out();
          piece.push(part);
        }
      }
      out();
      continue;
    }
    if (!lines[i].trim()) flush();
    else cur.push(lines[i]);
  }
  flush();
  // Paragraphs put together while they fit; one longer than a message is cut at its lines, or its words.
  const parts: string[] = [];
  let now = '';
  const add = (b: string) => {
    if (!now) now = b;
    else if (now.length + 2 + b.length <= max) now += `\n\n${b}`;
    else (parts.push(now), (now = b));
  };
  for (const b of blocks) {
    if (b.length <= max) {
      add(b);
      continue;
    }
    let rest = b;
    while (rest.length > max) {
      let cut = rest.lastIndexOf('\n', max);
      if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
      if (cut < max / 2) cut = max;
      add(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) add(rest);
  }
  if (now) parts.push(now);
  return parts;
}

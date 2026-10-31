// A reply as plain words, for reading aloud: markdown's marks and code left out, split into parts
// short enough for every browser's speech synthesis.

/** A reply as it should sound: no code, no markdown marks, links by their words, a pause at each line's end. */
export function speakable(md: string): string {
  const s = md
    .replace(/\r\n?/g, '\n')
    // Fenced code (an unfinished block runs to the end), maths blocks, HTML comments.
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm, '\n')
    .replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Images go; links and HTML keep their words; addresses keep their host.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, ' ')
    .replace(/https?:\/\/(?:www\.)?([^\s/)>\]]+)[^\s)>\]]*/g, '$1')
    // Inline code keeps its text; emphasis loses its marks (not the underscores inside words).
    .replace(/`+([^`\n]+)`+/g, '$1')
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](?=\S)([^*_\n]*?\S)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const lines: string[] = [];
  for (let line of s.split('\n')) {
    // Table rules and horizontal rules go; table cells are read in a row.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) continue;
    line = line
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*(>\s?)+/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '')
      .replace(/^\s*\||\|\s*$/g, '')
      .replace(/\s*\|\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!/[\p{L}\p{N}]/u.test(line)) continue;
    lines.push(/[.!?:;,…。！？]$/.test(line) ? line : `${line}.`);
  }
  return lines.join(' ');
}

/** Parts of about a sentence or two, none longer than `max` characters. */
export function parts(text: string, max = 220): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of text.match(/[^.!?。！？]+(?:[.!?。！？]+|$)\s*/g) ?? [text]) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      for (const w of s.match(new RegExp(`[^]{1,${max}}(?=\\s|$)`, 'g')) ?? [s]) out.push(w.trim());
      continue;
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

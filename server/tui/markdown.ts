// Markdown drawn for a terminal: headings bold, lists with their bullets and numbers hanging, quotes with a bar, `code`
// in the accent colour, fenced code set apart and never re-wrapped, links as their words with the address after them,
// tables aligned when they fit (left as written when they do not), everything else wrapped by words to the width.
// Text is drawn a chunk at a time (chunks are what blank lines part, outside code), so a reply still streaming can
// show its finished chunks for good and only its last one is drawn again.
import { strWidth, wrap, type Paint } from './term.ts';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** Whether a line closes a fenced block opened with `fence`. */
const closes = (line: string, fence: string) => {
  const f = FENCE.exec(line);
  return !!f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.trim().slice(f[1].length).trim();
};

/** The text's chunks: the parts between blank lines, a fenced block of code kept whole with its blank lines. */
export function chunksOf(md: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence: string | null = null;
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      cur.push(line);
      if (closes(line, fence)) fence = null;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      fence = f[1];
      cur.push(line);
      continue;
    }
    if (!line.trim()) {
      if (cur.length) out.push(cur.join('\n'));
      cur = [];
      continue;
    }
    cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/**
 * How much of a text still being written is finished: the length of its start made of whole chunks, each ended by a
 * blank line outside code (a line counts once its newline has come). 0 while there is none.
 */
export function finishedLength(md: string): number {
  let fence: string | null = null;
  let pos = 0;
  let cut = 0;
  let inChunk = false;
  for (let nl = md.indexOf('\n'); nl >= 0; nl = md.indexOf('\n', pos)) {
    const line = md.slice(pos, nl);
    if (fence) {
      if (closes(line, fence)) fence = null;
    } else if (FENCE.test(line)) {
      fence = FENCE.exec(line)![1];
      inChunk = true;
    } else if (!line.trim()) {
      if (inChunk) cut = nl + 1;
      inChunk = false;
    } else inChunk = true;
    pos = nl + 1;
  }
  return cut;
}

// ---- inline ----------------------------------------------------------------------------------------

/** Inline Markdown as styled text: code, bold, italics, strikes, links and pictures, escapes. */
export function inline(s: string, p: Paint): string {
  const codes: string[] = [];
  // Code first, so nothing inside it is read as Markdown.
  let t = s.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, _t, c: string) => {
    codes.push(c.trim() ? c.replace(/^ (.*) $/, '$1') : c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = t
    // Pictures, then links: their words, the address after them (once, when the words are not the address).
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt: string, url: string) => `${alt ? `${alt} ` : ''}${p.dim(`(picture: ${url})`)}`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, words: string, url: string) => (words === url || `mailto:${words}` === url ? p.underline(url) : `${words} ${p.dim(`(${url})`)}`))
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, (_, url: string) => p.underline(url))
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, (_, _m, x: string) => p.bold(x))
    .replace(/(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])/g, (_, a: string, x: string) => `${a}${p.italic(x)}`)
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, (_, a: string, x: string) => `${a}${p.italic(x)}`)
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, (_, x: string) => p.dim(x))
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i: string) => p.accent(codes[Number(i)]));
}

// ---- blocks ----------------------------------------------------------------------------------------

const BULLET = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** A row of a table's cells, `|` inside code and escaped ones left in. */
function cells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  let code = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (c === '`') {
      code = !code;
      cur += c;
    } else if (c === '|' && !code) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

/** A table's lines, aligned when they fit in the width; as written otherwise. */
function table(lines: string[], width: number, p: Paint): string[] {
  const head = cells(lines[0]);
  const aligns = cells(lines[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'c' : c.endsWith(':') ? 'r' : 'l'));
  const body = lines.slice(2).map(cells);
  const rows = [head, ...body].map((r) => head.map((_, i) => inline(r[i] ?? '', p)));
  const widths = head.map((_, i) => Math.max(1, ...rows.map((r) => strWidth(r[i]))));
  const total = widths.reduce((a, b) => a + b, 0) + (widths.length - 1) * 3;
  if (total > width) return lines.map((l) => l);
  const cell = (s: string, i: number) => {
    const room = widths[i] - strWidth(s);
    const a = aligns[i] ?? 'l';
    return a === 'r' ? ' '.repeat(room) + s : a === 'c' ? ' '.repeat(room >> 1) + s + ' '.repeat(room - (room >> 1)) : s + ' '.repeat(room);
  };
  const line = (r: string[]) => r.map(cell).join(p.dim(' │ ')).replace(/\s+$/, '');
  return [line(rows[0].map((c) => p.bold(c))), p.dim(widths.map((w) => '─'.repeat(w)).join('─┼─')), ...rows.slice(1).map(line)];
}

/** One chunk's lines. */
function chunk(text: string, width: number, p: Paint): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  const endPara = () => {
    if (!para.length) return;
    // A line break where the line ends with two spaces or a backslash; else the lines are one paragraph.
    const joined = para.map((l, k) => (k < para.length - 1 && (/ {2,}$/.test(l) || /\\$/.test(l)) ? `${l.replace(/(\\| +)$/, '')}\n` : `${l.trim()} `)).join('').trim();
    const lead = /^\s*/.exec(para[0])![0];
    out.push(...wrap(inline(joined, p), width, { first: lead, indent: lead }));
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (fence) {
      endPara();
      const mark = fence[2];
      const code: string[] = [];
      i++;
      while (i < lines.length && !closes(lines[i], mark)) code.push(lines[i++]);
      i++;
      if (fence[3]) out.push(p.dim(`  ${fence[3]}`));
      // Code as it is: never wrapped, so what is copied runs.
      for (const c of code) out.push(`  ${c.replace(/\t/g, '  ')}`);
      continue;
    }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      endPara();
      const words = inline(h[2], p);
      out.push(...wrap(h[1].length <= 2 ? p.bold(p.underline(words)) : p.bold(words), width));
      i++;
      continue;
    }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line) && !para.length) {
      out.push(p.dim('─'.repeat(Math.min(width, 40))));
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      endPara();
      const quoted: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
      for (const l of chunk(quoted.join('\n'), width - 2, p)) out.push(`${p.dim('│')} ${l}`);
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      endPara();
      const rows = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(lines[i++]);
      out.push(...table(rows, width, p));
      continue;
    }
    const b = BULLET.exec(line);
    if (b && !(para.length && /^\d/.test(b[2]) && b[1].length === 0 && para.length > 0 && !BULLET.test(para[para.length - 1]))) {
      endPara();
      const depth = Math.floor(b[1].replace(/\t/g, '    ').length / 2);
      const mark = /\d/.test(b[2]) ? b[2] : ['•', '◦', '▪'][depth % 3];
      const lead = '  '.repeat(depth);
      const item: string[] = [b[4]];
      i++;
      // Lines that carry on the item (not a new item, a fence or a heading).
      while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !/^\s{0,3}(`{3,}|~{3,}|#{1,6}\s|>)/.test(lines[i])) item.push(lines[i++].trim());
      const head = `${lead}${/\d/.test(mark) ? mark : p.accent(mark)} `;
      out.push(...wrap(inline(item.join(' '), p), width, { first: head, indent: ' '.repeat(strWidth(head)) }));
      continue;
    }
    para.push(line);
    i++;
  }
  endPara();
  return out;
}

/** Markdown as terminal lines `width` columns wide (code lines may be wider: they are never wrapped). */
export function renderMarkdown(md: string, width: number, p: Paint): string[] {
  const out: string[] = [];
  for (const c of chunksOf(md)) {
    if (out.length) out.push('');
    out.push(...chunk(c, width, p));
  }
  return out;
}

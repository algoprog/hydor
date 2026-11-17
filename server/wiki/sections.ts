// Reading part of a wiki file: a section by its heading (its subsections included) or a range of lines, with the
// line numbers wiki_search gives. Pure text functions, plus `readWikiPart` which wiki_read calls.
import { readFollowing } from './areas/redirects.ts';

export interface Heading {
  level: number;
  text: string;
  /** The headings above it and itself: "Methods › Data". */
  path: string;
  slug: string;
  /** 1-based line of the heading, and of the last line of its section (subsections included). */
  line: number;
  end: number;
}

/** The text of a file as lines (a final newline does not make an empty last line). */
export function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** A heading's slug as GitHub writes it: lower case, punctuation gone, spaces to hyphens. */
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** What a heading says, without Markdown marks around links and emphasis. */
const plain = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();

/** The headings of a file (not those inside code fences, nor the front matter), each with the lines its section covers. */
export function headingsOf(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  let i = 0;
  // Front matter is not a section: a `# comment` in it is not a heading.
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
    if (close > 0) i = close + 1;
  }
  const stack: string[] = [];
  const seen = new Map<string, number>();
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0].repeat(3);
      else if (f[1][0] === fence[0]) fence = null;
      continue;
    }
    if (fence) continue;
    const h = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    if (!h) continue;
    const level = h[1].length;
    const text = plain(h[2]);
    if (!text) continue;
    stack.length = level - 1;
    for (let k = 0; k < level - 1; k++) stack[k] ??= '';
    stack[level - 1] = text;
    const base = slugOf(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ level, text, path: stack.filter(Boolean).join(' › '), slug: n ? `${base}-${n}` : base, line: i + 1, end: lines.length });
  }
  // A section runs to the line before the next heading of its level or higher; trailing blank lines are not part of it.
  for (let k = 0; k < out.length; k++) {
    let end = lines.length;
    for (let j = k + 1; j < out.length; j++) {
      if (out[j].level <= out[k].level) {
        end = out[j].line - 1;
        break;
      }
    }
    while (end > out[k].line && !lines[end - 1].trim()) end--;
    out[k].end = end;
  }
  return out;
}

/** What to call a section so that wiki_read's `section` finds it: its own text when no other heading has it, else its path. */
export function sectionName(all: Heading[], h: Heading): string {
  return all.filter((x) => x.text.toLowerCase() === h.text.toLowerCase()).length > 1 ? h.path : h.text;
}

const norm = (s: string) => plain(s.replace(/^#{1,6}\s+/, '')).toLowerCase().replace(/\s*(?:›|»|>|\/)\s*/g, ' › ');

/** The headings a `section` input names: its text, its slug or its path ("Methods › Data"), case aside. */
export function findSections(all: Heading[], name: string): Heading[] {
  const q = norm(name);
  if (!q) return [];
  const slug = slugOf(q);
  const byText = all.filter((h) => h.text.toLowerCase() === q);
  if (byText.length) return byText;
  const byPath = all.filter((h) => h.path.toLowerCase() === q || h.path.toLowerCase().endsWith(` › ${q}`));
  if (byPath.length) return byPath;
  return all.filter((h) => h.slug === slug || slugOf(h.text) === slug);
}

/** The lines of a `lines` input: "40-80", "40", "40-" (to the end), with a hyphen or a dash. */
export function parseLines(spec: unknown, total: number): { from: number; to: number } {
  const s = String(spec ?? '')
    .trim()
    .replace(/[–—]|\.\./g, '-');
  const m = /^(\d+)(?:\s*-\s*(\d*))?$/.exec(s);
  if (!m) throw new Error(`lines must be a range like "40-80" or one line like "40" (got “${s.slice(0, 40)}”)`);
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : m[2] === '' ? total : Number(m[2]);
  if (from < 1) throw new Error('Line numbers start at 1');
  if (to < from) throw new Error(`lines “${s}” ends before it starts`);
  if (from > total) throw new Error(total === 1 ? `The file has 1 line: line ${from} is past its end` : `The file has ${total} lines: line ${from} is past its end`);
  return { from, to: Math.min(to, total) };
}

/** Lines with their numbers, as grep prints them (`40: text`). */
export function numbered(lines: string[], from: number, to: number): string {
  const width = String(to).length;
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${String(n).padStart(width)}: ${lines[n - 1]}`);
  return out.join('\n');
}

/** The target of a redirect stub: core.ts's, the one rule for every reader. */
export { redirectOf } from './core.ts';

export interface PartInput {
  section?: unknown;
  lines?: unknown;
}

/**
 * What wiki_read answers: the whole file as readWiki gives it, or with `section` that section (its subsections
 * included) or with `lines` that range, numbered. A redirect stub is followed once, and the answer says so. The
 * sha256 is always that of the whole file, as wiki_write needs it.
 */
export function readWikiPart(root: string, relative: string, input: PartInput = {}): Record<string, unknown> {
  const hasSection = input.section !== undefined && input.section !== null && String(input.section).trim() !== '';
  const hasLines = input.lines !== undefined && input.lines !== null && String(input.lines).trim() !== '';
  if (hasSection && hasLines) throw new Error('Give section or lines, not both');
  // A redirect stub is followed once, with what happened to the article (merged, or the wiki rebuilt): areas/redirects.ts.
  const read = readFollowing(root, relative);
  const base: Record<string, unknown> = { path: read.path, ...(read.redirectedFrom ? { redirectedFrom: read.redirectedFrom } : {}), ...(read.note ? { note: read.note } : {}) };
  if (!hasSection && !hasLines) return { ...base, content: read.content, sha256: read.sha256 };
  const lines = linesOf(read.content);
  if (hasLines) {
    const { from, to } = parseLines(input.lines, lines.length);
    return { ...base, sha256: read.sha256, lines: `${from}-${to}`, totalLines: lines.length, content: numbered(lines, from, to), note: [read.note, 'Lines are numbered; sha256 is the whole file’s.'].filter(Boolean).join(' ') };
  }
  const all = headingsOf(lines);
  const found = findSections(all, String(input.section));
  if (!found.length) {
    const list = all.length ? all.map((h) => `${'  '.repeat(h.level - 1)}${'#'.repeat(h.level)} ${h.text} (line ${h.line})`).join('\n') : '(it has no headings)';
    throw new Error(`No section “${String(input.section).trim().slice(0, 80)}” in ${read.path}. Its headings:\n${list}`);
  }
  const h = found[0];
  const others = found.slice(1);
  return {
    ...base,
    sha256: read.sha256,
    section: h.path,
    lines: `${h.line}-${h.end}`,
    totalLines: lines.length,
    content: numbered(lines, h.line, h.end),
    note: `Section “${h.path}”, its subsections included; lines are numbered and sha256 is the whole file’s.${others.length ? ` ${others.length} other heading${others.length === 1 ? '' : 's'} have this text (${others.map((o) => `“${o.path}”`).join(', ')}): name one by its path.` : ''}`,
  };
}

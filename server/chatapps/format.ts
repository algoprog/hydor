// An agent's reply as Discord and Slack show it. Discord reads most of Markdown itself (so only what it lacks changes:
// tables, deep headings, rules) in messages of 2,000 characters; Slack has its own mrkdwn (one asterisk for bold,
// links as <url|text>, & < > escaped) in section blocks of 3,000. Both are cut to fit by `chunks`, never through a code block.
import { chunks, plainText } from '../telegram/format.ts';

export { chunks, plainText };

/** Discord takes 2,000 characters a message; room is left for a word at the end of a long reply. */
export const DISCORD_CHARS = 1900;
/** A Slack section block's text takes 3,000 characters. */
export const SLACK_CHARS = 2500;

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+.#-]*)/;
const closing = (fence: string) => new RegExp(`^\\s*${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`);
const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);

/** A table's lines without its line of dashes. */
function table(lines: string[], i: number): { rows: string[]; end: number } {
  const rows: string[] = [];
  for (; i < lines.length && isRow(lines[i]); i++) if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim());
  return { rows, end: i };
}

/** Markdown for Discord: tables in a code block, headings deeper than three as the third, rules as a line, "+" lists as "-". */
export function discordMarkdown(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      out.push(line);
      for (i++; i < lines.length && !closing(fence[1]).test(lines[i]); i++) out.push(lines[i]);
      out.push(i < lines.length ? lines[i] : fence[1]);
      continue;
    }
    if (isRow(line)) {
      const t = table(lines, i);
      out.push('```', ...t.rows, '```');
      i = t.end - 1;
      continue;
    }
    if (isRule(line)) out.push('──────');
    else out.push(line.replace(/^(\s{0,3})#{4,6}\s+/, '$1### ').replace(/^(\s*)\+\s+/, '$1- '));
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line's inline Markdown as mrkdwn. */
function inline(text: string): string {
  const kept: string[] = [];
  const keep = (s: string) => `\u0000${kept.push(s) - 1}\u0000`;
  let s = text.replace(/`([^`\n]+)`/g, (_, c: string) => keep(`\`${esc(c)}\``));
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => keep(`<${u.replace(/[<>|]/g, '')}|${esc(t).replace(/\|/g, '¦')}>`));
  s = esc(s);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_, t: string) => keep(`*${t}*`)).replace(/__([^_\n]+)__/g, (_, t: string) => keep(`*${t}*`));
  s = s.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1_$2_');
  s = s.replace(/~~([^~\n]+)~~/g, '~$1~');
  // Kept pieces may hold others (bold around code): put back until none is left.
  for (let n = 0; n < 4 && s.includes('\u0000'); n++) s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]);
  return s;
}

/** Markdown as Slack's mrkdwn. */
export function slackMrkdwn(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      for (i++; i < lines.length && !closing(fence[1]).test(lines[i]); i++) body.push(esc(lines[i]));
      out.push('```', ...body, '```');
      continue;
    }
    if (isRow(line)) {
      const t = table(lines, i);
      out.push('```', ...t.rows.map(esc), '```');
      i = t.end - 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      out.push(`> ${inline(line.replace(/^\s*>\s?/, ''))}`);
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      out.push(`*${inline(heading[1]).replace(/(^|[^\\])\*/g, '$1')}*`);
      continue;
    }
    if (isRule(line)) {
      out.push('──────');
      continue;
    }
    const item = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    out.push(item ? `${item[1]}• ${inline(item[2])}` : inline(line));
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

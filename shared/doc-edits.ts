// Small changes to a document that an agent makes without sending all of it (save_doc's edits), made on the document's
// Markdown as get_page gives it: words found and replaced, a section written again or taken out (a heading and what
// follows it, up to the next heading of its level or a higher one), words put after a section or before it, and words
// added at the end. The server makes them, then saves the Markdown as it saves a whole document sent back (the blocks
// that did not change keep their ids, comments and suggested changes); a draft makes them as the call comes in
// (page-drafts.ts), with the change being written as far as it has come.
import { docMarkdown, type Doc } from './docs.ts';
import type { JsonPath } from './partial-json.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** What an edit says, by the field that names it. */
export const DOC_EDIT_KINDS = ['find', 'section', 'after', 'before', 'append'] as const;

/** A heading's words as they are compared: no marks, no attributes, one space, any case. */
const plain = (s: string) =>
  s
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/\s*\{[^}]*\}\s*$/, '')
    .replace(/<[^>]+>/g, '')
    // Markdown's escapes (a heading starting "1\." so it is not read as a list) say the same words.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~=<>$])/g, '$1')
    .replace(/[*_`~=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

interface Heading {
  line: number;
  level: number;
  text: string;
}

/** The headings of Markdown (outside code blocks), by line. */
function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) fence = !fence;
    if (fence) return;
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(l);
    if (m) out.push({ line: i, level: m[1].length, text: m[2] });
  });
  return out;
}

/** The lines a section takes: its heading, up to the next heading of its level or a higher one. */
function sectionOf(lines: string[], words: string): { from: number; to: number } | string {
  const all = headings(lines);
  const want = plain(words);
  // Its words as they are; else without the numbers before them ("3. Pricing" asked as "Pricing", or the other way).
  const bare = (s: string) => s.replace(/^(?:[0-9]+(?:\.[0-9]+)*|[ivxlc]+)[.)]?\s+/, '');
  let hits = all.filter((h) => plain(h.text) === want);
  if (!hits.length) hits = all.filter((h) => bare(plain(h.text)) === bare(want));
  if (hits.length > 1) return `${hits.length} headings read “${words}”: change one of them with find and replace instead`;
  if (!hits.length) {
    const list = all
      .slice(0, 15)
      .map((h) => `“${plain(h.text)}”`)
      .join(', ');
    return `there is no heading “${words}” in the document${list ? ` (its headings: ${list}${all.length > 15 ? '…' : ''})` : ' (it has no headings)'}`;
  }
  const h = hits[0];
  const next = all.find((x) => x.line > h.line && x.level <= h.level);
  return { from: h.line, to: next ? next.line : lines.length };
}

/** Markdown put between two parts, a blank line on each side (as blocks are written). */
const join = (a: string, mid: string, b: string) => [a.replace(/\s+$/, ''), mid.replace(/^\s+|\s+$/g, ''), b.replace(/^\s+/, '')].filter(Boolean).join('\n\n');

export interface DocEditsOut {
  markdown: string;
  /** Where the change being written has come to in `markdown` (-1: none being written). */
  at: number;
}

/**
 * The Markdown of `base` with `edits` made, in order. With `partial` (a draft: the place in the edits where the call's
 * text stopped, [index, field…]), an edit not written whole is made as far as it has come, and the others that cannot
 * be made are passed over; without it, an edit that cannot be made is an error that says why, for the agent.
 */
export function applyDocEdits(base: Doc, edits: unknown[], o: { partial?: JsonPath | null } = {}): DocEditsOut | null {
  const draft = o.partial !== undefined;
  const openAt = draft && o.partial?.length ? (o.partial[0] as number) : -1;
  let md = docMarkdown(base, { comments: true });
  let at = -1;
  const fail = (i: number, why: string) => {
    if (!draft) throw new Error(`edits[${i}]: ${why}.`);
  };
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    if (!isObj(e)) {
      fail(i, 'each edit is an object: {"find", "replace"}, {"section", "markdown"}, {"after", "markdown"}, {"before", "markdown"} or {"append"}');
      continue;
    }
    const open = i === openAt;
    // While a field is still being written, what it names is not known yet: only the words it puts are.
    const writing = (k: string) => open && o.partial!.length > 1 && o.partial![1] === k;
    if (typeof e.find === 'string') {
      if (writing('find') || !e.find) {
        if (!e.find) fail(i, 'find is empty');
        continue;
      }
      if (typeof e.replace !== 'string') {
        fail(i, 'find needs replace: the words to put in their place ("" takes them out)');
        continue;
      }
      const n = md.split(e.find).length - 1;
      if (!n) {
        fail(i, `these words are not in the document as get_page gives it: “${e.find.slice(0, 160)}” (copy them exactly, marks and all)`);
        continue;
      }
      if (n > 1 && e.all !== true) {
        fail(i, `“${e.find.slice(0, 120)}” is in the document ${n} times: give more of the words around it, or "all": true to change every one`);
        continue;
      }
      if (e.all === true && !open) md = md.split(e.find).join(e.replace);
      else {
        const k = md.indexOf(e.find);
        md = md.slice(0, k) + e.replace + md.slice(k + e.find.length);
        if (open) at = k + e.replace.length;
      }
      continue;
    }
    const words = (typeof e.markdown === 'string' ? e.markdown : typeof e.text === 'string' ? e.text : null) as string | null;
    if (typeof e.append === 'string' || (e.append === true && words !== null)) {
      const add = typeof e.append === 'string' ? e.append : words!;
      const head = md.replace(/\s+$/, '');
      md = join(head, add, '');
      if (open) at = md.length;
      continue;
    }
    for (const k of ['section', 'after', 'before'] as const) {
      if (typeof e[k] !== 'string') continue;
      if (writing(k)) break;
      if (words === null) {
        fail(i, `${k} needs markdown: ${k === 'section' ? 'the section written again, its heading too ("" takes it out)' : 'the words to put there'}`);
        break;
      }
      const lines = md.split('\n');
      const s = sectionOf(lines, e[k] as string);
      if (typeof s === 'string') {
        fail(i, s);
        break;
      }
      const a = lines.slice(0, k === 'after' ? s.to : s.from).join('\n');
      const b = lines.slice(k === 'before' ? s.from : s.to).join('\n');
      md = join(a, words, b);
      if (open) at = join(a, words, '').length;
      break;
    }
    if (!DOC_EDIT_KINDS.some((k) => k in e) && !draft) fail(i, 'say what it does: find (with replace), section, after or before (with markdown), or append');
  }
  return { markdown: md, at };
}

/** For the agent: what save_doc's edits are and how to write them. */
export const DOC_EDITS_HELP =
  'To change part of a saved document without sending all of it, give its id and edits instead of markdown, made in order on the Markdown get_page gives: {"find": "words as they are", "replace": "new words"} ("all": true for every time they appear; else they must appear once), {"section": "a heading’s words", "markdown": "the section written again, its heading too"} ("" takes the section out: the heading and what follows it, up to the next heading of its level or a higher one), {"after": "a heading’s words", "markdown": "…"} (at the end of that section) or {"before": "a heading’s words", "markdown": "…"}, and {"append": "markdown at the end"}. The user watches each save come in: write a long document in steps, a section or a few at a time (start with its title and first section, then append the next), rather than in one long call.';

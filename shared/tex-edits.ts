// Small changes to a LaTeX document that an agent makes without sending a whole file (save_latex's edits), in a file of
// it (main.tex unless said): words found and replaced, a section written again or taken out (its \section, \chapter…
// command and what follows it, up to the next one of its level or a higher one, or the bibliography, \appendix or
// \end{document}, which stay), words put after a section or before it, and words added at the end (before
// \end{document}). The server makes them on the version's files, then saves as it saves files sent back; a draft makes
// them as the call comes in (page-drafts.ts).
import type { JsonPath } from './partial-json.ts';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The main file's name, as the editor and get_page show it. */
const MAIN = 'main.tex';

/** LaTeX's sectioning commands, outermost first: a section ends at the next of its level or an outer one. */
const LEVELS = ['part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'];

interface Head {
  at: number;
  level: number;
  title: string;
}

/** A section's title as it is compared: no commands' backslashes or braces, one space, any case. */
const plain = (s: string) =>
  s
    .replace(/\\[a-zA-Z]+\*?/g, ' ')
    .replace(/[{}$~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** The sectioning commands of a file's text (not in % comments), with their titles (a balanced {…} after them). */
function heads(text: string): Head[] {
  const out: Head[] = [];
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]]*\]\s*)?\{/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if (/(^|[^\\])%/.test(text.slice(lineStart, m.index))) continue;
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < text.length && depth; i++) {
      if (text[i] === '\\') i++;
      else if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
    }
    out.push({ at: m.index, level: LEVELS.indexOf(m[1]), title: text.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

/**
 * Where the body of a document's text ends after `from`: its bibliography, \appendix, back matter or \end{document} (not
 * in % comments); the text's end when it has none.
 */
function bodyEnd(text: string, from: number): number {
  const re = /\\(?:end\{document\}|appendix\b|backmatter\b|bibliography(?:style)?\s*\{|printbibliography\b|begin\{thebibliography\})/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const lineStart = text.lastIndexOf('\n', m.index) + 1;
    if (!/(^|[^\\])%/.test(text.slice(lineStart, m.index))) return m.index;
  }
  return text.length;
}

/**
 * Where a section is in a file's text, from its command to the next one of its level or an outer one, or where the
 * body ends (the bibliography, \appendix or \end{document}: a section rewritten keeps them).
 */
function sectionOf(text: string, title: string): { from: number; to: number } | string {
  const all = heads(text);
  const want = plain(title.replace(/^\s*\\[a-z]+\*?\s*\{([\s\S]*)\}\s*$/, '$1'));
  const hits = all.filter((h) => plain(h.title) === want);
  if (hits.length > 1) return `${hits.length} sections are titled “${title}”: change one of them with find and replace instead`;
  if (!hits.length) {
    const list = all
      .slice(0, 15)
      .map((h) => `“${plain(h.title)}”`)
      .join(', ');
    return `there is no section “${title}” in it${list ? ` (its sections: ${list}${all.length > 15 ? '…' : ''})` : ' (it has none)'}`;
  }
  const h = hits[0];
  const next = all.find((x) => x.at > h.at && x.level <= h.level);
  const to = Math.min(next ? next.at : text.length, bodyEnd(text, h.at + 1));
  return { from: h.at, to };
}

/**
 * Text put between two parts of a file, on lines of its own, a blank line after it when more follows; and where its
 * words end (for a draft's mark).
 */
function between(a: string, mid: string, b: string): { text: string; end: number } {
  const head = a && !a.endsWith('\n') ? `${a}\n` : a;
  const body = mid.replace(/^\s+/, '').replace(/\s+$/, '');
  if (!body) return { text: head + b, end: head.length };
  return { text: head + body + (b ? '\n\n' : '\n') + b.replace(/^\n+/, ''), end: head.length + body.length };
}

export interface TexEditsOut {
  /** The files as they then are, by name (main.tex for the main file). */
  files: Map<string, string>;
  /** The file being written to and where in it the words have come (a draft; null when none is being written). */
  at: { file: string; at: number } | null;
}

/**
 * The files of a document (`files`: main.tex and the others, by name) with `edits` made, in order. With `partial` (a
 * draft: the place in the edits where the call's text stopped), an edit not written whole is made as far as it has come
 * and others that cannot be made are passed over; without it, an edit that cannot be made is an error that says why.
 */
export function applyTexEdits(files: Map<string, string>, edits: unknown[], o: { partial?: JsonPath | null } = {}): TexEditsOut {
  const draft = o.partial !== undefined;
  const openAt = draft && o.partial?.length ? (o.partial[0] as number) : -1;
  const out = new Map(files);
  let at: TexEditsOut['at'] = null;
  const fail = (i: number, why: string) => {
    if (!draft) throw new Error(`edits[${i}]: ${why}.`);
  };
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i];
    if (!isObj(e)) {
      fail(i, 'each edit is an object: {"find", "replace"}, {"section", "text"}, {"after", "text"}, {"before", "text"} or {"append"}, with "file" when it is not main.tex');
      continue;
    }
    const open = i === openAt;
    const writing = (k: string) => open && o.partial!.length > 1 && o.partial![1] === k;
    const name = typeof e.file === 'string' && e.file.trim() ? e.file.trim().replace(/^\.\//, '') : MAIN;
    if (writing('file')) continue;
    const text = out.get(name);
    if (text === undefined) {
      fail(i, `there is no file ${name} (its files: ${[...out.keys()].join(', ')})`);
      continue;
    }
    if (typeof e.find === 'string') {
      if (writing('find') || !e.find) {
        if (!e.find) fail(i, 'find is empty');
        continue;
      }
      if (typeof e.replace !== 'string') {
        fail(i, 'find needs replace: the text to put in its place ("" takes it out)');
        continue;
      }
      const n = text.split(e.find).length - 1;
      if (!n) {
        fail(i, `this text is not in ${name}: “${e.find.slice(0, 160)}” (copy it exactly as get_page gives it)`);
        continue;
      }
      if (n > 1 && e.all !== true) {
        fail(i, `“${e.find.slice(0, 120)}” is in ${name} ${n} times: give more of the text around it, or "all": true to change every one`);
        continue;
      }
      if (e.all === true && !open) out.set(name, text.split(e.find).join(e.replace));
      else {
        const k = text.indexOf(e.find);
        out.set(name, text.slice(0, k) + e.replace + text.slice(k + e.find.length));
        if (open) at = { file: name, at: k + e.replace.length };
      }
      continue;
    }
    const words = typeof e.text === 'string' ? e.text : typeof e.source === 'string' ? e.source : null;
    if (typeof e.append === 'string' || (e.append === true && words !== null)) {
      const add = typeof e.append === 'string' ? e.append : words!;
      // At the end of the document: before \end{document} where the file has it.
      const end = text.lastIndexOf('\\end{document}');
      const k = end >= 0 ? end : text.length;
      const head = text.slice(0, k).replace(/\s*$/, '\n\n');
      const tail = end >= 0 ? `\n\n${text.slice(k)}` : '';
      out.set(name, head + add.replace(/^\s+/, '') + tail);
      if (open) at = { file: name, at: head.length + add.replace(/^\s+/, '').length };
      continue;
    }
    let done = false;
    for (const k of ['section', 'after', 'before'] as const) {
      if (typeof e[k] !== 'string') continue;
      done = true;
      if (writing(k)) break;
      if (words === null) {
        fail(i, `${k} needs text: ${k === 'section' ? 'the section written again, its \\section{…} too ("" takes it out)' : 'what to put there'}`);
        break;
      }
      const s = sectionOf(text, e[k] as string);
      if (typeof s === 'string') {
        fail(i, s.replace('in it', `in ${name}`));
        break;
      }
      const j = between(text.slice(0, k === 'after' ? s.to : s.from), words, text.slice(k === 'before' ? s.from : s.to));
      out.set(name, j.text);
      if (open) at = { file: name, at: j.end };
      break;
    }
    if (!done && !draft) fail(i, 'say what it does: find (with replace), section, after or before (with text), or append');
  }
  return { files: out, at };
}

/** For the agent: what save_latex's edits are and how to write them. */
export const TEX_EDITS_HELP =
  'To change part of a saved document without sending whole files, give its id and edits, made in order on its files as get_page gives them (main.tex unless "file" says another): {"find": "text as it is", "replace": "new text"} ("all": true for every time it appears; else it must appear once), {"section": "a section’s title", "text": "the section written again, its \\\\section{…} too"} ("" takes it out: up to the next section of its level or a higher one, or the bibliography, \\appendix or \\end{document}, which stay), {"after": "a section’s title", "text": "…"} (at its end) or {"before": "…", "text": "…"}, and {"append": "text at the end, before \\\\end{document}"}. The user watches each save come in: write a long document in steps, a section or a few at a time, rather than in one long call.';

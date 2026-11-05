// Folding a LaTeX file from the gutter (and Fold all, Unfold all): an environment from its \begin to its \end, a
// section down to the next heading of its level or above, the preamble down to \begin{document}, and a { group that
// runs over lines. \begin{document} itself does not fold (Fold all would fold the whole text into one line).
import { foldService } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { uncommented } from '@shared/latex';

const LEVELS: Record<string, number> = { part: 0, chapter: 1, section: 2, subsection: 3, subsubsection: 4, paragraph: 5, subparagraph: 6 };
const HEADING = /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*[[{]/;
/** Where a section's text ends without a heading: the end of the document, its back matter. */
const STOP = /^\s*\\(end\s*\{document\}|appendix\b|backmatter\b|bibliography\b|printbibliography\b|begin\s*\{thebibliography\})/;
const MAX_LINES = 20_000;

function sectionFold(state: EditorState, lineNo: number, level: number): { from: number; to: number } | null {
  const doc = state.doc;
  let end = Math.min(doc.lines, lineNo + MAX_LINES);
  for (let n = lineNo + 1; n <= Math.min(doc.lines, lineNo + MAX_LINES); n++) {
    const t = doc.line(n).text;
    const m = HEADING.exec(t);
    if ((m && LEVELS[m[1]] <= level) || STOP.test(t)) {
      end = n - 1;
      break;
    }
  }
  while (end > lineNo && !doc.line(end).text.trim()) end--;
  return end > lineNo ? { from: doc.line(lineNo).to, to: doc.line(end).to } : null;
}

function envFold(state: EditorState, lineNo: number, at: number, env: string): { from: number; to: number } | null {
  const doc = state.doc;
  let depth = 0;
  const re = /\\(begin|end)\s*\{([^{}]+)\}/g;
  for (let n = lineNo; n <= Math.min(doc.lines, lineNo + MAX_LINES); n++) {
    const text = uncommented(doc.line(n).text);
    re.lastIndex = n === lineNo ? at : 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[2] !== env) continue;
      depth += m[1] === 'begin' ? 1 : -1;
      if (depth === 0) {
        if (n === lineNo) return null;
        const end = doc.line(n);
        // Up to the \end, which stays on view after the fold.
        return { from: doc.line(lineNo).to, to: end.from + m.index };
      }
    }
  }
  return null;
}

/** A { left open on the line, closed on a later one. */
function groupFold(state: EditorState, lineNo: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.line(lineNo);
  const text = uncommented(line.text);
  let depth = 0;
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (c === '}') depth = Math.max(0, depth - 1);
  }
  if (depth === 0 || open < 0) return null;
  // The first { still open at the line's end, then where it closes.
  let d = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '{') d++;
    else if (c === '}') d--;
  }
  for (let n = lineNo + 1; n <= Math.min(doc.lines, lineNo + 2000); n++) {
    const t = uncommented(doc.line(n).text);
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '\\') i++;
      else if (c === '{') d++;
      else if (c === '}' && --d === 0) return { from: line.from + open + 1, to: doc.line(n).from + i };
    }
  }
  return null;
}

export const texFolding = foldService.of((state, from) => {
  const line = state.doc.lineAt(from);
  const text = uncommented(line.text);
  const h = HEADING.exec(text);
  if (h) return sectionFold(state, line.number, LEVELS[h[1]]);
  if (/^\s*\\documentclass/.test(text)) {
    for (let n = line.number + 1; n <= Math.min(state.doc.lines, line.number + MAX_LINES); n++) {
      if (/^\s*\\begin\s*\{document\}/.test(state.doc.line(n).text)) return n - 1 > line.number ? { from: line.to, to: state.doc.line(n - 1).to } : null;
    }
    return null;
  }
  const b = /\\begin\s*\{([^{}]+)\}/.exec(text);
  if (b && b[1].trim() !== 'document') {
    const r = envFold(state, line.number, b.index, b[1]);
    if (r) return r;
  }
  return groupFold(state, line.number);
});

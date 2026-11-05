// Check spelling (View → Check spelling) in the LaTeX editor: the browser's own spelling check, in the source, with
// what is not words left out where it can be: commands, the names a command takes (labels, references, citations,
// environments, packages, files, addresses) and maths. Comments are checked, being words.
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { texSpans } from './scan';

const skip = Decoration.mark({ attributes: { spellcheck: 'false' } });
/** Commands whose braced argument is a name, not words. */
const NAMES =
  /\\(?:label|ref|eqref|pageref|autoref|cref|Cref|nameref|cite\w*|parencite|textcite|autocite|nocite|begin|end|usepackage|RequirePackage|documentclass|includegraphics|input|include|subfile|bibliography|bibliographystyle|addbibresource|url|href|usetheme|usecolortheme|usetikzlibrary|newcommand|renewcommand|newenvironment|newtheorem|setlength|setcounter|pagestyle|thispagestyle|color|textcolor|definecolor|lstinputlisting)\*?\s*(?:\[[^\]\n]*\]\s*)?\{[^{}\n]*\}/g;

function build(view: EditorView): DecorationSet {
  const ranges: [number, number][] = [];
  const spans = view.state.field(texSpans);
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const m of text.matchAll(NAMES)) ranges.push([from + m.index!, from + m.index! + m[0].length]);
    for (const m of text.matchAll(/\\[A-Za-z@]+\*?/g)) ranges.push([from + m.index!, from + m.index! + m[0].length]);
    for (const s of spans) if (s.to >= from && s.from <= to) ranges.push([Math.max(from, s.from), Math.min(to, s.to)]);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const b = new RangeSetBuilder<Decoration>();
  let cur: [number, number] | null = null;
  for (const r of ranges) {
    if (cur && r[0] <= cur[1]) cur[1] = Math.max(cur[1], r[1]);
    else {
      if (cur && cur[1] > cur[0]) b.add(cur[0], cur[1], skip);
      cur = [r[0], r[1]];
    }
  }
  if (cur && cur[1] > cur[0]) b.add(cur[0], cur[1], skip);
  return b.finish();
}

const plugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

/** The browser's spelling check on the source, commands and maths left out. */
export const spellCheck: Extension = [texSpans, EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'off', autocapitalize: 'off' }), plugin];

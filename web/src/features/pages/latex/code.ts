// A LaTeX document's source in CodeMirror: the app's own editor (lib/codemirror: its colours, keys, find bar), with
// what writing LaTeX wants on top. Ctrl+Enter typesets, Ctrl+B and Ctrl+I make the words picked bold or italic,
// \ref, \cite, \includegraphics and \input complete from the document's own labels, bibliography, pictures and files,
// the typesetting's errors and warnings are marked at their lines, and snippets leave places to fill in (Tab goes on
// to the next).
import { snippet, startCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { EditorSelection, EditorState, Prec, StateEffect } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { createEditor, type EditorHandle } from '../../../lib/codemirror';

/** What the document offers to complete with. */
export interface Words {
  labels: string[];
  keys: string[];
  pictures: string[];
  files: string[];
}

export interface CodeHooks {
  onChange: (text: string) => void;
  onSave: () => void;
  onCompile: () => void;
  /** The cursor moved or the text changed: the line it is on, and the lines picked (none when nothing is). */
  onCursor: (c: { line: number; from: number; to: number; picked: boolean }) => void;
  words: () => Words;
}

export interface Issue {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface Code {
  handle: EditorHandle;
  view: EditorView;
  /** Marks a typesetting's errors and warnings at their lines (the others go). */
  mark: (issues: Issue[]) => void;
  /** A snippet at the cursor, on lines of its own when `block`: its ${fields} to fill in, Tab to the next. */
  insert: (template: string, block?: boolean) => void;
  /** The words picked put between `before` and `after` (or `placeholder` there, picked, to type over). */
  wrap: (before: string, after: string, placeholder: string) => void;
  /** The lines picked, from and to (1-based), and their text. */
  picked: () => { from: number; to: number; text: string; empty: boolean };
  /** Text put in place of what is picked (a list of the lines picked, say), the cursor after it. */
  replacePicked: (text: string) => void;
  goto: (line: number) => void;
  focus: () => void;
  destroy: () => void;
}

/** The language a file is shown in: LaTeX for TeX's own files (and a bibliography), plain text for data. */
const pathFor = (name: string) => (/\.(tex|ltx|sty|cls|clo|def|fd|cfg|bbl|bib|tikz|pgf)$/i.test(name) ? 'source.tex' : name);

/** Completions inside \cite{…}, \ref{…}, \includegraphics{…} and \input{…}: what the document has of each. */
function completer(words: () => Words) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const m = ctx.matchBefore(/\\([A-Za-z]*(?:cite|ref)[A-Za-z]*|includegraphics|input|include|subfile|bibliography)\*?(?:\[[^\]\n]*\])*\{[^{}\n]*$/);
    if (!m) return null;
    const cmd = /^\\([A-Za-z]+)/.exec(m.text)![1];
    const arg = /\{([^{}]*)$/.exec(m.text)![1];
    const cut = Math.max(arg.lastIndexOf(','), -1) + 1;
    const lead = /^\s*/.exec(arg.slice(cut))![0].length;
    const from = m.to - arg.length + cut + lead;
    const w = words();
    const list = /cite/i.test(cmd)
      ? w.keys
      : /ref/i.test(cmd)
        ? w.labels
        : cmd === 'includegraphics'
          ? w.pictures
          : cmd === 'bibliography'
            ? w.files.filter((f) => f.endsWith('.bib')).map((f) => f.slice(0, -4))
            : w.files.filter((f) => /\.(tex|ltx)$/.test(f)).map((f) => f.replace(/\.tex$/, ''));
    if (!list.length) return null;
    return { from, options: [...new Set(list)].map((label) => ({ label, type: /cite/i.test(cmd) ? 'text' : 'constant' })), validFor: /^[^,{}\s]*$/ };
  };
}

export async function mountCode(parent: HTMLElement, o: { text: string; name: string; dark: boolean; phone: boolean; readOnly?: boolean; hooks: CodeHooks }): Promise<Code> {
  const hooks = o.hooks;
  const handle = await createEditor(parent, { doc: o.text, path: pathFor(o.name), dark: o.dark, wrap: true, phone: o.phone, readOnly: o.readOnly, onChange: (d) => hooks.onChange(d), onSave: () => hooks.onSave() });
  const view = handle.view;

  const picked = () => {
    const r = view.state.selection.main;
    const a = view.state.doc.lineAt(r.from);
    // A selection that ends at the start of a line does not take that line in.
    const bEnd = r.to > r.from && view.state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to;
    const b = view.state.doc.lineAt(Math.max(r.from, bEnd));
    return { from: a.number, to: b.number, text: view.state.sliceDoc(r.from, r.to), empty: r.empty };
  };

  const wrap = (before: string, after: string, placeholder: string) => {
    if (o.readOnly) return;
    const r = view.state.selection.main;
    const inner = r.empty ? placeholder : view.state.sliceDoc(r.from, r.to);
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: before + inner + after },
      selection: EditorSelection.range(r.from + before.length, r.from + before.length + inner.length),
      scrollIntoView: true,
      userEvent: 'input',
    });
    view.focus();
  };

  const extra = [
    Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', preventDefault: true, run: () => (hooks.onCompile(), true) },
        { key: 'Mod-b', preventDefault: true, run: () => (wrap('\\textbf{', '}', 'bold'), true) },
        { key: 'Mod-i', preventDefault: true, run: () => (wrap('\\emph{', '}', 'italic'), true) },
      ]),
    ),
    EditorState.languageData.of(() => [{ autocomplete: completer(hooks.words) }]),
    lintGutter(),
    EditorView.updateListener.of((u) => {
      if (!u.selectionSet && !u.docChanged) return;
      const p = picked();
      hooks.onCursor({ line: u.state.doc.lineAt(u.state.selection.main.head).number, from: p.from, to: p.to, picked: !p.empty });
    }),
  ];
  view.dispatch({ effects: StateEffect.appendConfig.of(extra) });

  return {
    handle,
    view,
    mark: (issues) => {
      const doc = view.state.doc;
      const diags: Diagnostic[] = [];
      for (const x of issues) {
        if (!(x.line >= 1 && x.line <= doc.lines)) continue;
        const l = doc.line(x.line);
        diags.push({ from: l.from, to: Math.max(l.from, l.to), severity: x.severity, message: x.message });
      }
      view.dispatch(setDiagnostics(view.state, diags));
    },
    insert: (template, block) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      let from = r.from;
      let to = r.to;
      let t = template;
      if (block) {
        // On lines of its own: a line break before it when the cursor is not at a line's start, after when not at its end.
        const a = view.state.doc.lineAt(from);
        const b = view.state.doc.lineAt(to);
        if (view.state.sliceDoc(a.from, from).trim()) t = `\n${t}`;
        if (view.state.sliceDoc(to, b.to).trim()) t = `${t}\n`;
        else to = b.to;
      }
      snippet(t)(view, null, from, to);
      view.focus();
      if (/\\(cite|ref|eqref)\{\$\{/.test(template)) startCompletion(view);
    },
    wrap,
    picked,
    replacePicked: (text) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      const a = view.state.doc.lineAt(r.from);
      const b = view.state.doc.lineAt(r.to > r.from && view.state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to);
      view.dispatch({ changes: { from: a.from, to: b.to, insert: text }, selection: { anchor: a.from + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    goto: (line) => handle.gotoLine(line),
    focus: () => view.focus(),
    destroy: () => handle.destroy(),
  };
}

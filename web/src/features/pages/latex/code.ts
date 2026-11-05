// A LaTeX document's source in CodeMirror: the app's own editor (lib/codemirror: its colours, keys, find bar), with
// what writing LaTeX wants on top. Ctrl+Enter typesets; Ctrl+B and Ctrl+I make the words picked bold or italic (and
// plain again), Ctrl+/ comments lines out and back. Typing \ offers commands, \begin{ environments (the \end goes in
// too, as it does when Enter follows a \begin{…} typed by hand), \usepackage{ packages, and \ref, \cite,
// \includegraphics and \input the document's own labels, bibliography, pictures and files; brackets and $ close
// themselves. Environments, sections, the preamble and { groups fold. The formula the cursor is in shows drawn in a
// card by its line. Visual mode (visual.ts) shows the source as a document, and Check spelling has the browser check
// its words (spell.ts). The typesetting's errors and warnings are marked at their lines, and what is sure to fail
// (a \begin without its \end, a brace or a $ left open: shared/latex-check.ts) where it is, a moment after typing.
import { snippet, startCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { redo, selectAll, toggleComment, undo } from '@codemirror/commands';
import { foldAll, indentUnit, unfoldAll } from '@codemirror/language';
import { gotoLine } from '@codemirror/search';
import { lintGutter, setDiagnostics, type Diagnostic } from '@codemirror/lint';
import { Compartment, EditorSelection, EditorState, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { texCheck } from '@shared/latex-check';
import { tr } from '../../../i18n/runtime';
import { createEditor, type EditorHandle } from '../../../lib/codemirror';
import { commandSource, environmentSource, packageSource, type DocDefs } from './complete';
import { texFolding } from './fold';
import { mathPreview } from './mathpreview';
import { braced, inMathAt } from './scan';
import { spellCheck } from './spell';
import { visualMode } from './visual';

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
  /** The packages, class and definitions of the document, for completions. */
  defs: () => DocDefs;
  /** The classes and packages this TeX has ("amsmath.sty"), when known. */
  installed: () => Set<string> | null;
  /** The document's macros, for KaTeX. */
  macros: () => Record<string, string>;
  /** A picture's address by the name \includegraphics gives it, or null. */
  picture: (name: string) => string | null;
  /** Ctrl+F (and Ctrl+H, to replace): the editor's find bar. */
  onFind: (replace: boolean) => void;
  /** The text changed: where the comments' words are now. */
  onCommentsMoved: (list: CommentRange[]) => void;
  /** Ctrl+Alt+M: a comment on the words picked. */
  onComment: () => void;
}

/** Where a comment's words are in the file; `active`: the one picked. */
export interface CommentRange {
  id: string;
  from: number;
  to: number;
  active?: boolean;
}

export interface Issue {
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface Code {
  handle: EditorHandle;
  view: EditorView;
  /** Marks a typesetting's errors and warnings at their lines (the others go), beside the quick checks' problems. */
  mark: (issues: Issue[]) => void;
  /** A snippet at the cursor, on lines of its own when `block`: its ${fields} to fill in, Tab to the next. */
  insert: (template: string, block?: boolean) => void;
  /** The words picked put between `before` and `after` (or `placeholder` there, picked, to type over). */
  wrap: (before: string, after: string, placeholder: string) => void;
  /** \cmd{…} round the words picked, or taken away when they are in one already (Ctrl+B for \textbf). */
  toggle: (cmd: string, placeholder: string) => void;
  /** The formatting commands (\textbf, \emph…) taken out of what is picked, their words kept. */
  clearFormat: () => void;
  /** The lines picked, from and to (1-based), and their text. */
  pickedLines: () => { from: number; to: number; text: string; empty: boolean };
  /** Text put in place of what is picked (a list of the lines picked, say), the cursor after it. */
  replacePicked: (text: string) => void;
  /** Plain text in place of what is picked, the cursor after it. */
  insertText: (text: string) => void;
  /** Plain text on lines of its own at the cursor, the cursor after it. */
  insertBlock: (text: string) => void;
  /** Lines commented out with %, or back in (Ctrl+/). */
  comment: () => void;
  undo: () => void;
  redo: () => void;
  /** Go to line: CodeMirror's own small box. */
  gotoLine: () => void;
  selectAll: () => void;
  /** Whether the cursor is in maths. */
  inMath: () => boolean;
  /** The text, and where the cursor is in it (or what is picked: from, to). */
  text: () => string;
  cursor: () => number;
  picked: () => { from: number; to: number; text: string; empty: boolean };
  /** A part of the text changed (undone as one), the cursor after it. */
  replaceRange: (from: number, to: number, text: string) => void;
  /** The comments' words marked (open ones), moved with the text as it changes. */
  setComments: (list: CommentRange[]) => void;
  /** The find bar's matches marked, the current one apart. */
  markFound: (ranges: { s: number; e: number }[], current: number) => void;
  /** A part of the text picked and scrolled to, the focus left where it is. */
  select: (from: number, to: number) => void;
  /** A part of the text changed, the focus left where it is (the find bar's Replace). */
  replaceQuiet: (from: number, to: number, text: string) => void;
  setVisual: (on: boolean) => void;
  setSpell: (on: boolean) => void;
  foldAll: () => void;
  unfoldAll: () => void;
  goto: (line: number) => void;
  focus: () => void;
  destroy: () => void;
}

/** The language a file is shown in: LaTeX for TeX's own files (and a bibliography), plain text for data. */
const pathFor = (name: string) => (/\.(tex|ltx|sty|cls|clo|def|fd|cfg|bbl|bib|tikz|pgf)$/i.test(name) ? 'source.tex' : name);
const isTex = (name: string) => /\.(tex|ltx|sty|cls)$/i.test(name);

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

// What the find bar found: marked as CodeMirror's own search marks them.
const found = StateEffect.define<{ ranges: { s: number; e: number }[]; current: number }>();
const foundMark = Decoration.mark({ class: 'cm-searchMatch' });
const currentMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' });
const foundField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(found)) {
        const len = tr.state.doc.length;
        d = Decoration.set(
          e.value.ranges.filter((r) => r.e > r.s && r.e <= len).map((r, i) => (i === e.value.current ? currentMark : foundMark).range(r.s, r.e)),
          true,
        );
      }
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// The words comments are on: marked, and moved with the text (what is typed at their ends stays out of them).
const setCommentRanges = StateEffect.define<CommentRange[]>();
const commentMark = Decoration.mark({ class: 'cm-tex-commented' });
const commentActive = Decoration.mark({ class: 'cm-tex-commented cm-tex-commented-active' });
const commentField = StateField.define<{ list: CommentRange[]; deco: DecorationSet }>({
  create: () => ({ list: [], deco: Decoration.none }),
  update(v, tr) {
    let list = v.list;
    if (tr.docChanged && list.length) list = list.map((c) => ({ ...c, from: tr.changes.mapPos(c.from, 1), to: Math.max(tr.changes.mapPos(c.from, 1), tr.changes.mapPos(c.to, -1)) }));
    for (const e of tr.effects) if (e.is(setCommentRanges)) list = e.value.map((c) => ({ ...c, from: Math.min(c.from, tr.state.doc.length), to: Math.min(Math.max(c.from, c.to), tr.state.doc.length) }));
    if (list === v.list) return v;
    return {
      list,
      deco: Decoration.set(
        list.filter((c) => c.to > c.from).map((c) => (c.active ? commentActive : commentMark).range(c.from, c.to)),
        true,
      ),
    };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});
const commentTheme = EditorView.baseTheme({
  '.cm-tex-commented': { backgroundColor: 'color-mix(in srgb, #f5b400 22%, transparent)', borderBottom: '2px solid color-mix(in srgb, #f5b400 70%, transparent)' },
  '.cm-tex-commented-active': { backgroundColor: 'color-mix(in srgb, #f5b400 40%, transparent)' },
});

/** The commands Clear formatting takes away. */
const FORMATS = /\\(textbf|textit|textsl|emph|underline|uline|texttt|textsc|textsf|textrm|textsuperscript|textsubscript|textnormal)\s*\{/g;

export async function mountCode(parent: HTMLElement, o: { text: string; name: string; dark: boolean; phone: boolean; readOnly?: boolean; visual?: boolean; spell?: boolean; hooks: CodeHooks }): Promise<Code> {
  const hooks = o.hooks;
  const handle = await createEditor(parent, { doc: o.text, path: pathFor(o.name), dark: o.dark, wrap: true, phone: o.phone, readOnly: o.readOnly, onChange: (d) => hooks.onChange(d), onSave: () => hooks.onSave() });
  const view = handle.view;
  const tex = isTex(o.name);
  const visualC = new Compartment();
  const spellC = new Compartment();
  const visualExt = () => visualMode({ macros: hooks.macros, picture: hooks.picture });

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

  const toggle = (cmd: string, placeholder: string) => {
    if (o.readOnly) return;
    const st = view.state;
    const r = st.selection.main;
    const open = `\\${cmd}{`;
    const done = (spec: Parameters<EditorView['dispatch']>[0]) => {
      view.dispatch(spec);
      view.focus();
    };
    // The words picked are all that a \cmd{…} holds: the command goes.
    if (!r.empty && st.sliceDoc(r.from - open.length, r.from) === open && st.sliceDoc(r.to, r.to + 1) === '}') {
      return done({
        changes: [
          { from: r.from - open.length, to: r.from },
          { from: r.to, to: r.to + 1 },
        ],
        selection: EditorSelection.range(r.from - open.length, r.to - open.length),
        userEvent: 'input',
      });
    }
    // What is picked is a \cmd{…}, whole.
    const sel = st.sliceDoc(r.from, r.to);
    if (sel.startsWith(open) && braced(sel, open.length - 1)?.end === sel.length) {
      const inner = sel.slice(open.length, -1);
      return done({ changes: { from: r.from, to: r.to, insert: inner }, selection: EditorSelection.range(r.from, r.from + inner.length), userEvent: 'input' });
    }
    // Nothing picked, in a \cmd{…}: the command goes, the cursor stays by the same letter.
    if (r.empty) {
      const back = Math.max(0, r.head - 3000);
      const text = st.sliceDoc(back, Math.min(st.doc.length, r.head + 3000));
      const at = r.head - back;
      let best: { s: number; e: number } | null = null;
      for (let i = text.lastIndexOf(open, at - 1); i >= 0; i = i > 0 ? text.lastIndexOf(open, i - 1) : -1) {
        const g = braced(text, i + open.length - 1);
        if (g && g.end > at && i + open.length <= at) {
          best = { s: i, e: g.end };
          break;
        }
      }
      if (best) {
        const s = back + best.s;
        const e = back + best.e;
        return done({
          changes: [
            { from: s, to: s + open.length },
            { from: e - 1, to: e },
          ],
          selection: { anchor: r.head - open.length },
          userEvent: 'input',
        });
      }
    }
    wrap(open, '}', placeholder);
  };

  const clearFormat = () => {
    if (o.readOnly) return;
    const r = view.state.selection.main;
    if (r.empty) return;
    let t = view.state.sliceDoc(r.from, r.to);
    for (let guard = 0; guard < 200; guard++) {
      FORMATS.lastIndex = 0;
      const m = FORMATS.exec(t);
      if (!m) break;
      const g = braced(t, m.index + m[0].length - 1);
      if (!g) break;
      t = t.slice(0, m.index) + g.text + t.slice(g.end);
    }
    view.dispatch({ changes: { from: r.from, to: r.to, insert: t }, selection: EditorSelection.range(r.from, r.from + t.length), userEvent: 'input' });
    view.focus();
  };

  /** Enter after a \begin{…} typed by hand: its \end{…} goes in under it (an item too, for a list), when it has none. */
  const autoEnd = (v: EditorView) => {
    const st = v.state;
    const r = st.selection.main;
    if (!r.empty || o.readOnly) return false;
    const line = st.doc.lineAt(r.head);
    const before = line.text.slice(0, r.head - line.from);
    if (line.text.slice(r.head - line.from).trim()) return false;
    const m = /\\begin\s*\{([A-Za-z@*]+)\}(?:\s*\[[^\]]*\])?(?:\s*\{[^{}]*\})*\s*$/.exec(before);
    if (!m) return false;
    const env = m[1];
    const esc = env.replace('*', '\\*');
    const all = st.doc.toString();
    const opened = all.match(new RegExp(`\\\\begin\\s*\\{${esc}\\}`, 'g'))?.length ?? 0;
    const closed = all.match(new RegExp(`\\\\end\\s*\\{${esc}\\}`, 'g'))?.length ?? 0;
    if (opened <= closed) return false;
    const indent = /^\s*/.exec(line.text)![0];
    const unit = st.facet(indentUnit);
    const first = `${indent}${unit}${env === 'itemize' || env === 'enumerate' ? '\\item ' : ''}`;
    v.dispatch({ changes: { from: r.head, insert: `\n${first}\n${indent}\\end{${env}}` }, selection: { anchor: r.head + 1 + first.length }, scrollIntoView: true, userEvent: 'input' });
    return true;
  };

  const languageData = [
    { autocomplete: completer(hooks.words) },
    ...(tex ? [{ autocomplete: commandSource(hooks.defs) }, { autocomplete: environmentSource(hooks.defs) }, { autocomplete: packageSource(hooks.installed) }] : []),
    // $ pairs up as brackets do; quotes do not (an apostrophe is a letter here).
    { closeBrackets: { brackets: ['(', '[', '{', '$'], before: ')]}:;>$' } },
  ];
  // The typesetting's errors and warnings (by line), and the quick checks of the text as it is now.
  let texIssues: Issue[] = [];
  let checkTimer: ReturnType<typeof setTimeout> | undefined;
  const showIssues = () => {
    const doc = view.state.doc;
    const diags: Diagnostic[] = [];
    for (const x of texIssues) {
      if (!(x.line >= 1 && x.line <= doc.lines)) continue;
      const l = doc.line(x.line);
      diags.push({ from: l.from, to: Math.max(l.from, l.to), severity: x.severity, message: x.message });
    }
    if (tex && doc.length < 3_000_000) for (const c of texCheck(doc.toString())) diags.push({ from: c.from, to: Math.min(doc.length, c.to), severity: 'warning', message: tr(c.message) });
    view.dispatch(setDiagnostics(view.state, diags));
  };

  const extra = [
    Prec.highest(
      keymap.of([
        { key: 'Mod-Enter', preventDefault: true, run: () => (hooks.onCompile(), true) },
        { key: 'Mod-b', preventDefault: true, run: () => (toggle('textbf', 'bold'), true) },
        { key: 'Mod-i', preventDefault: true, run: () => (toggle('textit', 'italic'), true) },
        { key: 'Mod-f', preventDefault: true, run: () => (hooks.onFind(false), true) },
        { key: 'Mod-h', preventDefault: true, run: () => (hooks.onFind(true), true) },
        { key: 'Mod-g', preventDefault: true, run: () => (hooks.onFind(false), true) },
        { key: 'Mod-Alt-m', preventDefault: true, run: () => (hooks.onComment(), true) },
        { key: 'F3', preventDefault: true, run: () => (hooks.onFind(false), true) },
        ...(tex ? [{ key: 'Enter', run: autoEnd }] : []),
      ]),
    ),
    // Made once: completions are told apart by their source, so a new one each time would never show.
    EditorState.languageData.of(() => languageData),
    lintGutter(),
    foundField,
    commentField,
    commentTheme,
    tex ? [texFolding, mathPreview(hooks.macros)] : [],
    visualC.of(o.visual && tex ? visualExt() : []),
    spellC.of(o.spell ? spellCheck : []),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        const list = u.state.field(commentField).list;
        if (list.length) hooks.onCommentsMoved(list);
      }
      if (u.docChanged && tex) {
        clearTimeout(checkTimer);
        checkTimer = setTimeout(showIssues, 700);
      }
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
      texIssues = issues;
      showIssues();
    },
    insert: (template, block) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      const from = r.from;
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
    toggle,
    clearFormat,
    pickedLines: picked,
    picked: () => {
      const r = view.state.selection.main;
      return { from: r.from, to: r.to, text: view.state.sliceDoc(r.from, r.to), empty: r.empty };
    },
    markFound: (ranges, current) => view.dispatch({ effects: found.of({ ranges, current }) }),
    setComments: (list) => view.dispatch({ effects: setCommentRanges.of(list) }),
    select: (from, to) => view.dispatch({ selection: EditorSelection.range(from, to), effects: EditorView.scrollIntoView(from, { y: 'center' }) }),
    replaceQuiet: (from, to, text) => {
      if (!o.readOnly) view.dispatch({ changes: { from, to, insert: text }, userEvent: 'input.replace' });
    },
    replacePicked: (text) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      const a = view.state.doc.lineAt(r.from);
      const b = view.state.doc.lineAt(r.to > r.from && view.state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to);
      view.dispatch({ changes: { from: a.from, to: b.to, insert: text }, selection: { anchor: a.from + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    insertText: (text) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      view.dispatch({ changes: { from: r.from, to: r.to, insert: text }, selection: { anchor: r.from + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    insertBlock: (text) => {
      if (o.readOnly) return;
      const r = view.state.selection.main;
      const a = view.state.doc.lineAt(r.from);
      const b = view.state.doc.lineAt(r.to);
      const pre = view.state.sliceDoc(a.from, r.from).trim() ? '\n' : '';
      const post = view.state.sliceDoc(r.to, b.to).trim() ? '\n' : '';
      const from = pre ? r.from : a.from;
      const to = post ? r.to : b.to;
      const insert = `${pre}${text}${post}`;
      view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + pre.length + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    comment: () => {
      if (!o.readOnly) toggleComment(view);
      view.focus();
    },
    undo: () => {
      undo(view);
      view.focus();
    },
    redo: () => {
      redo(view);
      view.focus();
    },
    gotoLine: () => {
      gotoLine(view);
    },
    selectAll: () => {
      selectAll(view);
      view.focus();
    },
    inMath: () => inMathAt(view.state, view.state.selection.main.head),
    text: () => view.state.doc.toString(),
    cursor: () => view.state.selection.main.head,
    replaceRange: (from, to, text) => {
      if (o.readOnly) return;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true, userEvent: 'input' });
      view.focus();
    },
    setVisual: (on) => view.dispatch({ effects: visualC.reconfigure(on && tex ? visualExt() : []) }),
    setSpell: (on) => view.dispatch({ effects: spellC.reconfigure(on ? spellCheck : []) }),
    foldAll: () => {
      foldAll(view);
      view.focus();
    },
    unfoldAll: () => {
      unfoldAll(view);
      view.focus();
    },
    goto: (line) => handle.gotoLine(line),
    focus: () => view.focus(),
    destroy: () => {
      clearTimeout(checkTimer);
      handle.destroy();
    },
  };
}

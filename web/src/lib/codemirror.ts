// CodeMirror 6 setup, loaded on demand by the file editor.
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';

export interface EditorHandle {
  view: EditorView;
  setDark: (dark: boolean) => void;
  setWrap: (wrap: boolean) => void;
  setDoc: (doc: string) => void;
  gotoLine: (line: number) => void;
  destroy: () => void;
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg)', color: 'var(--fg)' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--fg-3)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-2)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-2) 60%, transparent)' },
});

const darkTweaks = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)' },
    '.cm-gutters': { backgroundColor: 'var(--bg)', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--bg-2)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
  },
  { dark: true },
);

export async function createEditor(
  parent: HTMLElement,
  o: { doc: string; path: string; dark: boolean; wrap: boolean; readOnly?: boolean; onChange: (doc: string) => void; onSave: () => void },
): Promise<EditorHandle> {
  const theme = new Compartment();
  const wrap = new Compartment();
  const lang = new Compartment();
  const base = o.path.split('/').pop() ?? '';
  const desc = LanguageDescription.matchFilename(languages, base);
  const support = desc ? await desc.load().catch(() => null) : null;
  const themeExt = (dark: boolean) => (dark ? [oneDark, darkTweaks] : [lightTheme, syntaxHighlighting(defaultHighlightStyle, { fallback: true })]);

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: o.doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => (o.onSave(), true) },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        EditorState.readOnly.of(!!o.readOnly),
        lang.of(support ?? []),
        theme.of(themeExt(o.dark)),
        wrap.of(o.wrap ? EditorView.lineWrapping : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) o.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    view,
    setDark: (dark) => view.dispatch({ effects: theme.reconfigure(themeExt(dark)) }),
    setWrap: (w) => view.dispatch({ effects: wrap.reconfigure(w ? EditorView.lineWrapping : []) }),
    setDoc: (doc) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } }),
    gotoLine: (line) => {
      const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}

// ---- notebook cells ------------------------------------------------------------------------------

export interface CellEditorHandle {
  view: EditorView;
  setDark: (dark: boolean) => void;
  focus: (at: number | 'start' | 'end') => void;
  destroy: () => void;
}

const cellTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '13px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { padding: '8px 0' },
  '.cm-line': { padding: '0 12px' },
});
const cellDark = EditorView.theme({ '&': { backgroundColor: 'transparent' } }, { dark: true });

/**
 * A notebook cell's editor: it grows with its text, runs on Shift/Ctrl/Alt+Enter, leaves on Escape,
 * moves to the cell above or below past its first or last line, and completes from the kernel on Tab.
 */
export async function createCellEditor(
  parent: HTMLElement,
  o: {
    doc: string;
    lang: string;
    dark: boolean;
    onChange: (doc: string) => void;
    onRun: (how: 'stay' | 'next' | 'insert') => void;
    onEscape: () => void;
    onSave: () => void;
    onEdge: (dir: -1 | 1) => boolean;
    complete?: (code: string, pos: number) => Promise<{ from: number; to: number; options: string[] } | null>;
  },
): Promise<CellEditorHandle> {
  const theme = new Compartment();
  const desc = LanguageDescription.matchLanguageName(languages, o.lang, true);
  const support = desc ? await desc.load().catch(() => null) : null;
  const themeExt = (dark: boolean) => (dark ? [oneDark, darkTweaks, cellTheme, cellDark] : [lightTheme, cellTheme, syntaxHighlighting(defaultHighlightStyle, { fallback: true })]);
  const atEdge = (v: EditorView, dir: -1 | 1) => {
    const { head, empty } = v.state.selection.main;
    if (!empty) return false;
    const line = v.state.doc.lineAt(head).number;
    return dir < 0 ? line === 1 : line === v.state.doc.lines;
  };
  const complete = o.complete;
  const kernelSource = async (ctx: CompletionContext) => {
    const r = complete ? await complete(ctx.state.doc.toString(), ctx.pos).catch(() => null) : null;
    if (!r?.options.length) return null;
    return { from: r.from, to: r.to, options: r.options.map((label) => ({ label })), filter: false };
  };
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: o.doc,
      extensions: [
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: complete ? [kernelSource] : undefined, activateOnTyping: false }),
        highlightSelectionMatches(),
        keymap.of([
          ...completionKeymap,
          { key: 'Shift-Enter', run: () => (o.onRun('next'), true) },
          { key: 'Mod-Enter', run: () => (o.onRun('stay'), true) },
          { key: 'Alt-Enter', run: () => (o.onRun('insert'), true) },
          { key: 'Escape', run: () => (o.onEscape(), true) },
          { key: 'Mod-s', preventDefault: true, run: () => (o.onSave(), true) },
          { key: 'ArrowUp', run: (v) => atEdge(v, -1) && o.onEdge(-1) },
          { key: 'ArrowDown', run: (v) => atEdge(v, 1) && o.onEdge(1) },
          // Tab after a name asks the kernel for completions; anywhere else it indents.
          { key: 'Tab', run: (v) => !!complete && /[\w.)\]'"]$/.test(v.state.sliceDoc(Math.max(0, v.state.selection.main.head - 1), v.state.selection.main.head)) && startCompletion(v) },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        support ?? [],
        o.lang === 'markdown' ? EditorView.lineWrapping : [],
        theme.of(themeExt(o.dark)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) o.onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    setDark: (dark) => view.dispatch({ effects: theme.reconfigure(themeExt(dark)) }),
    focus: (at) => {
      const pos = at === 'start' ? 0 : at === 'end' ? view.state.doc.length : Math.min(at, view.state.doc.length);
      view.dispatch({ selection: { anchor: pos } });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}

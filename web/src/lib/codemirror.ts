// CodeMirror 6 setup, loaded on demand by the file editor.
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, startCompletion, type CompletionContext } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyField, historyKeymap, indentWithTab } from '@codemirror/commands';
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
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField, Transaction } from '@codemirror/state';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import {
  crosshairCursor,
  Decoration,
  type DecorationSet,
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
import { tr } from '../i18n/runtime';

export interface EditorHandle {
  view: EditorView;
  setDark: (dark: boolean) => void;
  setWrap: (wrap: boolean) => void;
  /**
   * Puts in the text as it is now on disk: only the part that differs changes, so the place you read, the cursor and
   * the scroll stay. `flash`, for a change that came in by itself: those lines show tinted for a moment, and it is not
   * something to undo (Reload, which discards yours, is).
   */
  setDoc: (doc: string, o?: { flash?: boolean }) => void;
  gotoLine: (line: number) => void;
  /** Opens the find bar: phones have no keyboard shortcut for it. */
  find: () => void;
  /** The editor as it is: its text, selection and undo history as JSON, and how far it is scrolled, to be put back with `restore`. */
  snapshot: () => EditorSnapshot;
  destroy: () => void;
}

/** What `createEditor` can put back of an editor that was taken down: the undo history, the selection and the scroll. */
export interface EditorSnapshot {
  state: unknown;
  scroll: number;
}

// Where two themes style the same thing, the one listed first in an editor's extensions wins.

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--bg)', color: 'var(--fg)' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--fg-3)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-2)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-2) 60%, transparent)' },
});

// Dark: the app's own colours (a custom theme's too), with One Dark's for the code itself.
const darkTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'var(--bg)', color: 'var(--fg-2)' },
    '.cm-content': { caretColor: 'var(--accent)' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)',
    },
    '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--fg-3)', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--bg-2)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-2) 60%, transparent)' },
    '.cm-selectionMatch': { backgroundColor: 'var(--accent-soft)' },
    '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', outline: '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--fg) 16%, transparent)' },
    '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'color-mix(in srgb, var(--err) 30%, transparent)' },
    '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-2)', border: 'none', color: 'var(--fg-2)' },
    '.cm-tooltip': { border: '1px solid var(--line)', backgroundColor: 'var(--elevated)', color: 'var(--fg)' },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: 'var(--line)', borderBottomColor: 'var(--line)' },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: 'var(--elevated)', borderBottomColor: 'var(--elevated)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--bg-3)', color: 'var(--fg)' },
  },
  { dark: true },
);
const darkExt = [darkTheme, syntaxHighlighting(oneDarkHighlightStyle)];
const lightExt = [lightTheme, syntaxHighlighting(defaultHighlightStyle, { fallback: true })];

// The find bar in the app's style: CodeMirror draws its buttons and fields at 70% of the code's size.
const panelTheme = EditorView.theme({
  '.cm-panels': { backgroundColor: 'var(--bg-1)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-panel.cm-search': { padding: '6px 40px 6px 10px', fontFamily: 'var(--font-sans)' },
  '.cm-textfield': { fontSize: '13px', color: 'var(--fg)', backgroundColor: 'var(--bg)', border: '1px solid var(--line-2)', borderRadius: '8px', padding: '4px 8px' },
  '.cm-textfield:focus': { outline: 'none', borderColor: 'color-mix(in srgb, var(--accent) 70%, transparent)' },
  '.cm-button': { fontSize: '12.5px', color: 'var(--fg-2)', backgroundColor: 'var(--bg-2)', backgroundImage: 'none', border: 'none', borderRadius: '8px', padding: '4px 10px' },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--bg-3)' },
  '.cm-panel.cm-search label': { fontSize: '12.5px', color: 'var(--fg-2)' },
  '.cm-panel.cm-search [name=close]': { top: '6px', right: '8px', width: '28px', height: '28px', borderRadius: '8px', color: 'var(--fg-3)', fontSize: '20px', lineHeight: '1' },
});
/**
 * The words CodeMirror draws itself (its search panel, Go to line, folding, completions), as the app writes them,
 * in the language it is shown in: the page's translation leaves the editor alone.
 */
const PHRASES: Record<string, string> = {
  Find: 'Find',
  Replace: 'Replace',
  next: 'Next',
  previous: 'Previous',
  all: 'All',
  'match case': 'Match case',
  regexp: 'Regex',
  'by word': 'Whole word',
  replace: 'Replace',
  'replace all': 'Replace all',
  close: 'Close',
  'current match': 'current match',
  'on line': 'on line',
  'replaced $ matches': 'replaced $ matches',
  'replaced match on line $': 'replaced match on line $',
  'Go to line': 'Go to line',
  go: 'Go',
  'folded code': 'folded code',
  unfold: 'Unfold',
  'Fold line': 'Fold line',
  'Unfold line': 'Unfold line',
  'Folded lines': 'Folded lines',
  'Unfolded lines': 'Unfolded lines',
  Completions: 'Completions',
  Diagnostics: 'Diagnostics',
  'No diagnostics': 'No diagnostics',
  'Control character': 'Control character',
  'Selection deleted': 'Selection deleted',
};
const phrases = () => EditorState.phrases.of(Object.fromEntries(Object.entries(PHRASES).map(([k, v]) => [k, tr(v)])));

// Phones: the last line clear of the home bar, and the find bar in three rows big enough to tap (find and
// its buttons, replace and its buttons, the options) rather than six.
const phoneTheme = EditorView.theme({
  '.cm-content': { paddingBottom: 'calc(var(--safe-bottom) + 16px)' },
  '.cm-line': { paddingRight: '10px' },
  '.cm-panel.cm-search': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: '8px 46px 8px 10px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': { margin: '0' },
  '.cm-panel.cm-search br': { display: 'none' },
  '.cm-panel.cm-search .cm-textfield': { flex: '1 1 110px', minWidth: '0', minHeight: '34px' },
  '.cm-panel.cm-search .cm-button': { minHeight: '34px', padding: '4px 9px' },
  '.cm-panel.cm-search label': { order: '1', display: 'inline-flex', alignItems: 'center', minHeight: '30px', marginRight: '8px' },
  '.cm-panel.cm-search [name=close]': { top: '9px', width: '32px', height: '32px' },
});

// Lines changed from outside (an agent, a terminal): tinted for a moment as they come in.
const flashOn = StateEffect.define<{ from: number; to: number }>();
const flashOff = StateEffect.define<null>();
const flashLine = Decoration.line({ class: 'cm-changed-line' });
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(flashOff)) deco = Decoration.none;
      if (e.is(flashOn)) {
        const b = new RangeSetBuilder<Decoration>();
        const doc = tr.state.doc;
        const first = doc.lineAt(Math.min(e.value.from, doc.length)).number;
        const last = doc.lineAt(Math.min(e.value.to, doc.length)).number;
        for (let n = first; n <= last && n - first < 2000; n++) b.add(doc.line(n).from, doc.line(n).from, flashLine);
        deco = b.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const flashTheme = EditorView.baseTheme({
  '.cm-changed-line': { backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)', transition: 'background-color 0.6s' },
});

/** The one span where two texts differ: the same start and end are left as they are. */
function diffSpan(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let end = 0;
  while (end < max - start && a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)) end++;
  return { from: start, to: a.length - end, insert: b.slice(start, b.length - end) };
}

/** `phone`: no fold markers (too small to tap), no completions popping up while typing (Return would take one). */
export async function createEditor(
  parent: HTMLElement,
  o: { doc: string; path: string; dark: boolean; wrap: boolean; phone?: boolean; readOnly?: boolean; restore?: EditorSnapshot; onChange: (doc: string) => void; onSave: () => void },
): Promise<EditorHandle> {
  const theme = new Compartment();
  const wrap = new Compartment();
  const lang = new Compartment();
  const base = o.path.split('/').pop() ?? '';
  const desc = LanguageDescription.matchFilename(languages, base);
  const support = desc ? await desc.load().catch(() => null) : null;
  const themeExt = (dark: boolean) => (dark ? darkExt : lightExt);

  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    o.phone ? [] : foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: !o.phone }),
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
    o.phone ? phoneTheme : [],
    panelTheme,
    phrases(),
    theme.of(themeExt(o.dark)),
    wrap.of(o.wrap ? EditorView.lineWrapping : []),
    flashField,
    flashTheme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) o.onChange(u.state.doc.toString());
    }),
  ];
  // An editor put back keeps its undo history and selection, when its text is still the text it was taken down with.
  let state: EditorState | null = null;
  const saved = o.restore?.state as { doc?: string } | undefined;
  if (saved && saved.doc === o.doc) {
    try {
      state = EditorState.fromJSON(saved, { extensions }, { history: historyField });
    } catch {}
  }
  const view = new EditorView({ parent, state: state ?? EditorState.create({ doc: o.doc, extensions }) });
  if (state && o.restore?.scroll) {
    const top = o.restore.scroll;
    requestAnimationFrame(() => (view.scrollDOM.scrollTop = top));
  }

  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  return {
    view,
    setDark: (dark) => view.dispatch({ effects: theme.reconfigure(themeExt(dark)) }),
    setWrap: (w) => view.dispatch({ effects: wrap.reconfigure(w ? EditorView.lineWrapping : []) }),
    setDoc: (doc, so) => {
      const d = diffSpan(view.state.doc.toString(), doc);
      if (!d) return;
      view.dispatch({
        changes: d,
        annotations: so?.flash ? [Transaction.addToHistory.of(false)] : [],
        effects: so?.flash ? flashOn.of({ from: d.from, to: d.from + d.insert.length }) : [],
      });
      if (so?.flash) {
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => view.dispatch({ effects: flashOff.of(null) }), 2500);
      }
    },
    gotoLine: (line) => {
      const l = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
      view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: 'center' }) });
      view.focus();
    },
    find: () => openSearchPanel(view),
    snapshot: () => ({ state: view.state.toJSON({ history: historyField }), scroll: view.scrollDOM.scrollTop }),
    destroy: () => (clearTimeout(flashTimer), view.destroy()),
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
  // The cell's own theme first, so its box shows through.
  const themeExt = (dark: boolean) => [cellTheme, dark ? darkExt : lightExt];
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
        phrases(),
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
        flashField,
        flashTheme,
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

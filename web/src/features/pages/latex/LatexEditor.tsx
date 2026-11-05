// A LaTeX document to write and typeset, as in Overleaf: its source beside its typeset pages. The source is in
// CodeMirror, a tab per file (main.tex, a bibliography, chapters; add, rename and delete them), with its pictures in
// a tab of their own (add them from the device or drop them in; each with the name \includegraphics gives it), shown
// as code or, in Visual mode, as a document while you type (headings, bold words, maths drawn, pictures, lists). It is
// typeset on this computer as you type (a moment after you stop; Ctrl+Enter at once, and that can be the only way),
// with the engine picked (pdfLaTeX, XeLaTeX, LuaLaTeX); its errors and warnings show under the source, each going to
// its line, with TeX's log a click away. The menus (Edit, Insert, Format, View, Tools, and Search the menus) hold what
// it can do: headings, lists, figures, tables made in a grid, equations, symbols, references found on the web by DOI,
// arXiv id or title, folding, spelling, a word count, versions compared, the pages presented. An outline goes to a
// section, a double click on a page goes to its source and Show in the PDF the other way. On a phone, Source and
// Preview are two tabs and the menus are behind one button. Changes stay unsaved until Save (Ctrl+S), as a page's do.
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BookPlus,
  Bold,
  ChevronDown,
  Copy,
  ExternalLink,
  FilePlus,
  FileUp,
  FoldVertical,
  Footprints,
  Heading,
  History,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Keyboard,
  Link2,
  MessageSquare,
  MessageSquarePlus,
  List,
  ListOrdered,
  ListTree,
  LocateFixed,
  Moon,
  Omega,
  Pencil,
  Play,
  Plus,
  Presentation,
  Quote,
  Redo2,
  RemoveFormatting,
  ScrollText,
  Search,
  Sigma,
  Sparkles,
  SpellCheck,
  SquareFunction,
  Table2,
  Trash2,
  Underline,
  Undo2,
  UnfoldVertical,
  WholeWord,
} from 'lucide-react';
import {
  cleanTexName,
  engineLabel,
  headingAt,
  TEX_ENGINES,
  TEX_MAIN,
  texOutline,
  type TexCompiled,
  type TexDoc,
  type TexEngine,
  type TexHeading,
  type TexIssue,
  type TexSetup,
} from '@shared/latex';
import { newCommentId } from '@shared/comments';
import { addBibEntry } from '@shared/latex-bib';
import { blankTable, tableAt, tableTex, type TexTable } from '@shared/latex-table';
import type { TexReference } from '@shared/latex-bib';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Segmented, Throbber, useConfirm } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import { findIn, replaceAllIn, replacementOf, type Match } from '../common/find';
import { FindBar, useFind } from '../common/FindBar';
import { MenuBar, type MenuDef, type MenuEntry } from '../common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import type { AskScope, ModelEditorProps } from '../kinds';
import { addFileFromDevice, addPicture, assetUrl, chooseFiles, FILE_ACCEPT, freeName, pdfUrl, PICTURE_ACCEPT, placeOf, texSetup, typeset } from './api';
import { mountCode, type Code } from './code';
import { CommentsPanel, type CommentDraft } from './CommentsPanel';
import { CompareDialog } from './Compare';
import { docDefs, type DocDefs } from './complete';
import { NameDialog, OutlineList, Problems, where } from './parts';
import { Preview, type Flash } from './Preview';
import { ReferencesDialog } from './References';
import { texMacros } from './scan';
import { docWords, makeSnippet, SAMPLE_BIB, withBibliography, withPackages, type SnipId } from './snippets';
import { rememberSymbol, SymbolsPanel } from './Symbols';
import { symInsert, type Sym } from './symbols';
import { TableEditor } from './TableEditor';
import { MAX_VISUAL } from './visual';
import { WordCountDialog } from './WordCount';

const AUTO_KEY = 'wa.tex.auto';
const OUTLINE_KEY = 'wa.tex.outline';
const MODE_KEY = 'wa.tex.mode';
const SPELL_KEY = 'wa.tex.spell';
const DARK_PAGES_KEY = 'wa.tex.darkpages';
const COMMENTS_KEY = 'wa.tex.comments';
/** The Pictures tab, among the files'. */
const PICTURES = '#pictures';

const isDark = () => document.documentElement.classList.contains('dark');

const NO_DEFS: DocDefs = { packages: new Set(), commands: [], environments: [] };
const EMPTY_TABLE = blankTable();

/** The keyboard shortcuts dialog's lists. */
const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Typesetting',
    items: [
      ['Ctrl+Enter', 'Recompile now'],
      ['Ctrl+S', 'Save'],
    ],
  },
  {
    title: 'Writing',
    items: [
      ['Ctrl+B', 'Bold, or plain again'],
      ['Ctrl+I', 'Italic, or plain again'],
      ['Ctrl+/', 'Comment lines out, or back in'],
      ['Ctrl+Alt+M', 'A comment on the words picked'],
      ['Ctrl+Space', 'Show what can be typed here'],
      ['Tab', 'The next place to fill in'],
      ['Enter', 'After a \\begin{…}: its \\end{…} goes in too'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Ctrl+F', 'Find'],
      ['Ctrl+H', 'Find and replace'],
      ['Enter / Shift+Enter', 'In the find bar: the next match, or the one before'],
      ['Ctrl+D', 'Pick the next of the same words too'],
      ['Alt+↑ / Alt+↓', 'Move the lines up or down'],
      ['Ctrl+Shift+K', 'Delete the line'],
      ['Ctrl+] / Ctrl+[', 'Indent more or less'],
      ['Ctrl+Alt+G', 'Go to a line'],
    ],
  },
  {
    title: 'Folding',
    items: [
      ['Ctrl+Shift+[', 'Fold here'],
      ['Ctrl+Shift+]', 'Unfold here'],
      ['Ctrl+Alt+[', 'Fold all'],
      ['Ctrl+Alt+]', 'Unfold all'],
    ],
  },
  {
    title: 'Menus and pages',
    items: [
      ['Alt+/', 'Search the menus'],
      ['→ / ←', 'Presenting the pages: the next or the one before'],
      ['Esc', 'Presenting the pages: stop'],
    ],
  },
];

/** A file's text in the model (main.tex included). */
const textIn = (d: TexDoc, name: string) => (name === TEX_MAIN ? d.main : (d.files.find((f) => f.name === name)?.text ?? ''));

/** The model with a file's text changed (the same model when it is the same text). */
function withText(d: TexDoc, name: string, text: string): TexDoc {
  if (name === TEX_MAIN) return d.main === text ? d : { ...d, main: text };
  const i = d.files.findIndex((f) => f.name === name);
  if (i < 0 || d.files[i].text === text) return d;
  const files = d.files.slice();
  files[i] = { ...files[i], text };
  return { ...d, files };
}

/** References to `from` in the document's TeX (\includegraphics, \input, \include, \bibliography) made to name `to`. */
function renameRefs(d: TexDoc, from: string, to: string): TexDoc {
  const stem = (n: string) => n.replace(/\.(tex|bib)$/i, '');
  const fix = (t: string) =>
    t.replace(/(\\(?:includegraphics\*?|input|include|subfile|bibliography)\s*(?:\[[^\]]*\]\s*)?\{)([^{}]*)(\})/g, (all, a: string, arg: string, b: string) => {
      const parts = arg.split(',').map((p) => {
        const n = p.trim().replace(/^\.\//, '');
        if (n === from) return p.replace(n, to);
        if (n === stem(from) && stem(from) !== from) return p.replace(n, stem(to));
        return p;
      });
      const next = parts.join(',');
      return next === arg ? all : `${a}${next}${b}`;
    });
  return { ...d, main: fix(d.main), files: d.files.map((f) => (/\.(tex|ltx)$/i.test(f.name) ? { ...f, text: fix(f.text) } : f)) };
}

/** The smallest change that turns `a` into `b` (so the cursor and what is picked stay where they were). */
function diff(a: string, b: string) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  return { from: s, to: a.length - e, insert: b.slice(s, b.length - e) };
}


/** Where the cursor is: its line, and the lines picked (from, to) when something is. */
interface Cursor {
  line: number;
  from: number;
  to: number;
  picked: boolean;
}
const START: Cursor = { line: 1, from: 1, to: 1, picked: false };

/** What an agent asked now could be about: the whole document, the file, the section the cursor is in, the lines picked. */
function scopesFor(file: string, cursor: Cursor, heading: TexHeading | null): AskScope[] {
  const out: AskScope[] = [{ id: 'doc', label: tr('The whole document'), lead: '' }];
  if (file === PICTURES) return out;
  if (file !== TEX_MAIN) out.push({ id: 'file', label: `${tr('This file')}: ${file}`, lead: `In ${file}: ` });
  if (heading) {
    const t = heading.title.length > 40 ? `${heading.title.slice(0, 39)}…` : heading.title;
    out.push({ id: 'section', label: `${tr('This section')}: ${t}`, lead: `In the section “${heading.title}” (${heading.file}, line ${heading.line}): ` });
  }
  if (cursor.picked) {
    const lines = cursor.from === cursor.to ? `line ${cursor.from}` : `lines ${cursor.from}–${cursor.to}`;
    out.push({ id: 'lines', label: cursor.from === cursor.to ? tr(`Line ${cursor.from}`) : tr(`Lines ${cursor.from}–${cursor.to}`), lead: `In ${file}, ${lines}: ` });
  }
  return out;
}

export function LatexEditor({ doc, pageId, layout, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef, file: onDisk }: ModelEditorProps<TexDoc>) {
  const [model, setModel] = useState<TexDoc | null>(doc?.model ?? null);
  // The model as the latest change left it (changes made before it is drawn again build on it).
  const live = useRef<TexDoc | null>(model);
  const setM = (m: TexDoc | null) => {
    live.current = m;
    setModel(m);
  };
  const [saved, setSaved] = useState<TexDoc | null>(doc?.model ?? null);
  const [saving, setSaving] = useState(false);
  // A file opened from Files starts on itself (a chapter of the document that reads it).
  const first = onDisk?.open && (onDisk.open === TEX_MAIN || doc?.model.files.some((f) => f.name === onDisk.open)) ? onDisk.open : TEX_MAIN;
  const [file, setFile] = useState(first);
  // The files whose editors are open (kept while the editor is, so each keeps its own undo and place).
  const [opened, setOpened] = useState<string[]>([first]);
  /** A file's name as the tabs show it: main.tex is the document's own file's, for a file opened from Files. */
  const label = (n: string) => (n === TEX_MAIN && onDisk ? onDisk.main : n);
  const [epoch, setEpoch] = useState(0);
  const [result, setResult] = useState<TexCompiled | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(() => localStorage.getItem(AUTO_KEY) !== '0');
  const [setup, setSetup] = useState<TexSetup | null>(null);
  const [pane, setPane] = useState<'source' | 'preview'>('source');
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_KEY) === '1');
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [menu, setMenu] = useState<'engine' | 'compile' | 'add' | 'file' | 'outline' | 'symbols' | null>(null);
  // Code or Visual, Check spelling, Dark pages: remembered on this device.
  const [mode, setMode] = useState<'code' | 'visual'>(() => (localStorage.getItem(MODE_KEY) === 'visual' ? 'visual' : 'code'));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [spell, setSpell] = useState(() => localStorage.getItem(SPELL_KEY) === '1');
  const spellRef = useRef(spell);
  spellRef.current = spell;
  const [darkPages, setDarkPages] = useState(() => localStorage.getItem(DARK_PAGES_KEY) === '1');
  const [dark, setDark] = useState(isDark);
  const [presentAsk, setPresentAsk] = useState(0);
  const [dialog, setDialog] = useState<'refs' | 'count' | 'compare' | 'keys' | null>(null);
  // Comments: the panel beside the source (remembered), the one picked, and a new one being written.
  const [commentsOpen, setCommentsOpen] = useState(() => localStorage.getItem(COMMENTS_KEY) === '1');
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [draft, setDraft] = useState<CommentDraft | null>(null);
  // Find and replace (Ctrl+F, Ctrl+H): the shared bar, over the file in view.
  const find = useFind();
  const findRef = useRef(find);
  findRef.current = find;
  const [found, setFound] = useState<{ list: Match[]; current: number }>({ list: [], current: -1 });
  /** Where the next match is looked for after a replace (just after what went in). */
  const findFrom = useRef<number | null>(null);
  /** The table editor: the table, and where it was read from when it is one of the document's. */
  const [tableAsk, setTableAsk] = useState<{ table: TexTable; at: { file: string; from: number; to: number } | null } | null>(null);
  const [naming, setNaming] = useState<{ kind: 'new' | 'rename-file' | 'rename-picture'; from?: string } | null>(null);
  const [cursor, setCursor] = useState<Cursor>(START);
  // Where the cursor is in each file (the scopes follow the file in view).
  const cursors = useRef(new Map<string, Cursor>());
  const fileRef = useRef(file);
  fileRef.current = file;
  useEffect(() => setCursor(cursors.current.get(file) ?? START), [file]);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [split, setSplit] = useState(0.5);
  const [width, setWidth] = useState(1200);
  const [confirm, confirmNode] = useConfirm();
  const root = useRef<HTMLDivElement>(null);
  const splitBox = useRef<HTMLDivElement>(null);
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const codes = useRef(new Map<string, Code>());
  const mounting = useRef(new Set<string>());
  // Counts editors made, so what depends on them is drawn again.
  const [made, setMade] = useState(0);
  /** What to do once a file's editor is there (an insertion asked for before it was). */
  const afterMount = useRef(new Map<string, (c: Code) => void>());
  const lastTex = useRef(TEX_MAIN);
  const anchors = {
    engine: useRef<HTMLButtonElement>(null),
    compile: useRef<HTMLButtonElement>(null),
    add: useRef<HTMLButtonElement>(null),
    file: useRef<HTMLButtonElement>(null),
    outline: useRef<HTMLButtonElement>(null),
    symbols: useRef<HTMLButtonElement>(null),
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [!model]);
  const wide = width >= 900 && layout !== 'sheet';
  const roomy = width >= 640;
  const dirty = !!model && model !== saved && !readOnly;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem(AUTO_KEY, auto ? '1' : '0');
  }, [auto]);
  useEffect(() => {
    localStorage.setItem(OUTLINE_KEY, outlineOpen ? '1' : '0');
  }, [outlineOpen]);
  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
    for (const c of codes.current.values()) c.setVisual(mode === 'visual');
  }, [mode]);
  useEffect(() => {
    localStorage.setItem(SPELL_KEY, spell ? '1' : '0');
    for (const c of codes.current.values()) c.setSpell(spell);
  }, [spell]);
  useEffect(() => {
    localStorage.setItem(DARK_PAGES_KEY, darkPages ? '1' : '0');
  }, [darkPages]);
  useEffect(() => {
    texSetup().then(setSetup, () => {});
  }, []);

  // Another document, or the agent's new version while nothing was changed here: start from it.
  useEffect(() => {
    if (!doc || dirtyRef.current) return;
    setM(doc.model);
    setSaved(doc.model);
    setEpoch((e) => e + 1);
    const keep = file === PICTURES || file === TEX_MAIN || doc.model.files.some((f) => f.name === file) ? file : TEX_MAIN;
    setFile(keep);
    setOpened([keep === PICTURES ? TEX_MAIN : keep]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  const change = (f: (d: TexDoc) => TexDoc) => {
    const d = live.current;
    if (!d || readOnly) return;
    const n = f(d);
    if (n !== d) setM(n);
  };

  // ---- what the editors ask of the document (worked out once a change) -------------------------------------------
  const defsCache = useRef<{ d: TexDoc | null; defs: DocDefs; macros: Record<string, string> }>({ d: null, defs: NO_DEFS, macros: {} });
  const known = () => {
    const d = live.current;
    if (d && defsCache.current.d !== d) {
      const texts = [{ name: TEX_MAIN, text: d.main }, ...d.files];
      defsCache.current = { d, defs: docDefs(texts), macros: texMacros(texts.filter((f) => /\.(tex|ltx|sty|cls)$/i.test(f.name)).map((f) => f.text)) };
    }
    return defsCache.current;
  };
  const defsOf = () => known().defs;
  const macrosOf = () => known().macros;
  const installedRef = useRef<Set<string> | null>(null);
  installedRef.current = useMemo(() => (setup?.installed ? new Set(setup.installed) : null), [setup]);
  /** A picture of the document by the name \includegraphics gives it (its extension may be left out). */
  const pictureOf = (name: string): string | null => {
    const pics = live.current?.pictures ?? [];
    const n = name.trim().replace(/^\.\//, '');
    const p = pics.find((x) => x.name === n) ?? pics.find((x) => x.name.replace(/\.(png|jpe?g)$/i, '') === n.replace(/\.(png|jpe?g|pdf)$/i, ''));
    if (!p) return null;
    return p.src.startsWith('naget-asset:') ? assetUrl(p.src) : p.src.startsWith('data:image/') ? p.src : null;
  };

  // ---- the files' editors ---------------------------------------------------------------------------------------
  const destroyCodes = () => {
    for (const c of codes.current.values()) c.destroy();
    codes.current.clear();
    mounting.current.clear();
    cursors.current.clear();
  };
  useEffect(() => destroyCodes, []);
  useEffect(() => destroyCodes(), [epoch]);

  const markCode = (name: string, c: Code) => {
    const r = resultRef.current;
    if (!r) return c.mark([]);
    const of = (list: TexIssue[], severity: 'error' | 'warning') =>
      list.filter((x) => x.file === name && x.line).map((x) => ({ line: x.line!, severity, message: x.hint ? `${x.message}\n${x.hint}` : x.message }));
    c.mark([...of(r.errors, 'error'), ...of(r.warnings, 'warning')]);
  };
  useEffect(() => {
    for (const [name, c] of codes.current) markCode(name, c);
  }, [result]);

  // Each file opened gets its editor once its place is on the page.
  useEffect(() => {
    for (const name of opened) {
      const host = hosts.current.get(name);
      const had = codes.current.get(name);
      if (had && host && !host.contains(had.view.dom)) {
        had.destroy();
        codes.current.delete(name);
      }
      if (!host || codes.current.has(name) || mounting.current.has(name) || !live.current) continue;
      mounting.current.add(name);
      const at = epoch;
      void mountCode(host, {
        text: textIn(live.current, name),
        name,
        dark: isDark(),
        phone: matchMedia('(pointer: coarse)').matches,
        readOnly,
        hooks: {
          onChange: (text) => change((d) => withText(d, name, text)),
          onSave: () => void saveRef.current(),
          onCompile: () => void runRef.current(true),
          onCursor: (c) => {
            cursors.current.set(name, c);
            if (fileRef.current === name) setCursor(c);
          },
          words: () => docWords(live.current ?? doc!.model),
          defs: defsOf,
          installed: () => installedRef.current,
          macros: macrosOf,
          picture: pictureOf,
          onFind: (replace) => findRef.current.show(replace && !readOnly),
          onCommentsMoved: (list) =>
            change((d) =>
              d.comments?.some((c) => c.file === name)
                ? {
                    ...d,
                    comments: d.comments.map((c) => {
                      const m = c.file === name ? list.find((x) => x.id === c.id) : undefined;
                      return m && (m.from !== c.from || m.to !== c.to) ? { ...c, from: m.from, to: m.to } : c;
                    }),
                  }
                : d,
            ),
          onComment: () => addCommentRef.current(),
        },
        visual: modeRef.current === 'visual',
        spell: spellRef.current,
      }).then((c) => {
        mounting.current.delete(name);
        if (at !== epochRef.current || !hosts.current.get(name)?.isConnected) return c.destroy();
        codes.current.set(name, c);
        setMade((n) => n + 1);
        markCode(name, c);
        const after = afterMount.current.get(name);
        afterMount.current.delete(name);
        if (after) after(c);
      });
    }
  });
  const epochRef = useRef(epoch);
  epochRef.current = epoch;
  useEffect(() => {
    const mo = new MutationObserver(() => {
      for (const c of codes.current.values()) c.handle.setDark(isDark());
      setDark(isDark());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const open = (name: string) => {
    if (name !== PICTURES) {
      if (!opened.includes(name)) setOpened((o) => [...o, name]);
      if (/\.(tex|ltx)$/i.test(name)) lastTex.current = name;
    }
    setFile(name);
    setMenu(null);
    if (!wide) setPane('source');
  };
  /** A file's editor, shown, once it is there: in a moment, or when it comes. */
  const withCode = (name: string, f: (c: Code) => void) => {
    open(name);
    const c = codes.current.get(name);
    // Shown first (it may have been hidden), then what is asked of it.
    if (c) requestAnimationFrame(() => f(c));
    else afterMount.current.set(name, f);
  };
  const goTo = (name: string, line: number) => {
    const known = name === TEX_MAIN || live.current?.files.some((f) => f.name === name);
    if (known) withCode(name, (c) => c.goto(line));
  };
  /** A file changed by the editor (in its editor when it has one, so Undo takes it back). */
  const editFile = (name: string, f: (text: string) => string) => {
    const c = codes.current.get(name);
    if (c) {
      const cur = c.view.state.doc.toString();
      const next = f(cur);
      if (next !== cur) c.view.dispatch({ changes: diff(cur, next), userEvent: 'input' });
    } else change((d) => withText(d, name, f(textIn(d, name))));
  };

  // ---- typesetting ------------------------------------------------------------------------------------------------
  const typesetFor = useRef<TexDoc | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const lastGood = useRef<string | undefined>(undefined);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const run = async (now = false) => {
    const m = live.current;
    if (!m) return;
    if (running.current) {
      again.current = true;
      return;
    }
    if (!now && m === typesetFor.current) return;
    running.current = true;
    typesetFor.current = m;
    setBusy(true);
    try {
      const r = await typeset(m, lastGood.current, onDisk?.folder);
      if (!alive.current) return;
      setResult(r);
      if (r.pdf && !r.errors.length) lastGood.current = r.key;
    } catch (e) {
      if (alive.current) toastError(e);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
      if (again.current && alive.current) {
        again.current = false;
        if (live.current !== typesetFor.current) void run();
      }
    }
  };
  const runRef = useRef(run);
  runRef.current = run;
  // As you type: a moment after you stop (at once for a document just opened or an engine just picked).
  const quick = useRef(true);
  useEffect(() => {
    if (!model || model === typesetFor.current || (!auto && !quick.current)) return;
    const t = setTimeout(() => void runRef.current(), quick.current ? 0 : 1100);
    quick.current = false;
    return () => clearTimeout(t);
  }, [model, auto]);
  useEffect(() => {
    quick.current = true;
  }, [doc?.key]);

  // ---- saving -------------------------------------------------------------------------------------------------------
  const save = async (): Promise<boolean> => {
    const m = live.current;
    if (!m || !onSave || saving || readOnly) return false;
    setSaving(true);
    try {
      if (await onSave(m)) {
        setSaved(m);
        return true;
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
    return false;
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  if (saveNowRef) saveNowRef.current = () => (dirtyRef.current ? saveRef.current() : Promise.resolve(true));
  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The document goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    setM(saved);
    setEpoch((e) => e + 1);
    const keep = file === PICTURES || file === TEX_MAIN || saved?.files.some((f) => f.name === file) ? file : TEX_MAIN;
    setFile(keep);
    setOpened([keep === PICTURES ? TEX_MAIN : keep]);
  };

  // Keys that work anywhere in the editor (CodeMirror has its own for its text).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      if (a?.closest('.cm-editor')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      } else if (mod && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        findRef.current.show(e.key.toLowerCase() === 'h');
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        void runRef.current(true);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // ---- find and replace ---------------------------------------------------------------------------------------------------
  const codeInView = () => (file === PICTURES ? null : (codes.current.get(file) ?? null));
  // The words, the switches or the file changed: the matches again, and the first one from the cursor on is gone to.
  useEffect(() => {
    const c = codeInView();
    if (!find.open || !c) {
      for (const x of codes.current.values()) x.markFound([], -1);
      setFound({ list: [], current: -1 });
      return;
    }
    const list = findIn(c.text(), find.query, find.options, 5000);
    const from = c.picked().from;
    let current = list.findIndex((m) => m.s >= from);
    if (current < 0 && list.length) current = 0;
    setFound({ list, current });
    c.markFound(list, current);
    if (current >= 0) c.select(list[current].s, list[current].e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.open, find.query, find.options, file]);
  // The text changed (typed, or replaced from the bar): the matches again, the current one kept by its place.
  useEffect(() => {
    const c = codeInView();
    if (!find.open || !c) return;
    const list = findIn(c.text(), find.query, find.options, 5000);
    const after = findFrom.current;
    findFrom.current = null;
    const from = after ?? c.picked().from;
    let current = list.findIndex((m) => m.s >= from);
    if (current < 0 && list.length) current = after === null ? list.length - 1 : 0;
    setFound({ list, current });
    c.markFound(list, current);
    if (after !== null && current >= 0) c.select(list[current].s, list[current].e);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);
  useEffect(() => {
    if (!find.open) codeInView()?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.open]);
  const findGo = (d: number) => {
    const c = codeInView();
    const n = found.list.length;
    if (!c || !n) return;
    const current = found.current < 0 ? (d > 0 ? 0 : n - 1) : (found.current + d + n) % n;
    setFound((f) => ({ ...f, current }));
    c.markFound(found.list, current);
    c.select(found.list[current].s, found.list[current].e);
  };
  const replaceOne = () => {
    const c = codeInView();
    const m = found.list[found.current];
    if (!c || !m || readOnly) return;
    const rep = replacementOf(c.text(), m, find.query, find.replacement, find.options);
    findFrom.current = m.s + rep.length;
    c.replaceQuiet(m.s, m.e, rep);
  };
  const replaceAll = () => {
    if (!codeInView() || readOnly) return;
    const r = replaceAllIn(codeInView()!.text(), find.query, find.replacement, find.options);
    if (!r.count) return;
    editFile(file, () => r.text);
    toast(`Replaced ${r.count} time${r.count === 1 ? '' : 's'}`, 'ok');
  };

  // ---- comments -----------------------------------------------------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem(COMMENTS_KEY, commentsOpen ? '1' : '0');
    // The comments take room from the source: it gets more of the width while they show.
    if (commentsOpen) setSplit((x) => Math.max(x, 0.6));
  }, [commentsOpen]);
  // The open comments' words marked in each file's editor: again when comments come or go, or another one is picked.
  const commentsKey = `${(model?.comments ?? []).map((c) => `${c.id}:${c.file}:${c.resolved ? 1 : 0}`).join('|')}#${activeComment}#${epoch}#${doc?.key}#${made}`;
  useEffect(() => {
    for (const [name, c] of codes.current) c.setComments((live.current?.comments ?? []).filter((x) => x.file === name && !x.resolved).map((x) => ({ id: x.id, from: x.from, to: x.to, active: x.id === activeComment })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsKey]);
  // The cursor in a comment's words picks it.
  useEffect(() => {
    const c = codes.current.get(file);
    if (!c || !model?.comments?.length) return;
    const pos = c.cursor();
    const hit = model.comments.find((x) => x.file === file && !x.resolved && pos >= x.from && pos <= x.to && x.to > x.from);
    if (hit && hit.id !== activeComment) setActiveComment(hit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);
  /** A comment on the words picked (or the line the cursor is on), written in the panel. */
  const addComment = () => {
    setMenu(null);
    if (readOnly || onDisk || file === PICTURES) return;
    const c = codes.current.get(file);
    if (!c) return;
    let { from, to } = c.picked();
    if (from === to) {
      const line = c.view.state.doc.lineAt(from);
      from = line.from + (line.text.length - line.text.trimStart().length);
      to = line.to;
    }
    const quote = c.text().slice(from, to).trim().slice(0, 500);
    setDraft({ file, from, to, quote });
    setCommentsOpen(true);
  };
  const addCommentRef = useRef(addComment);
  addCommentRef.current = addComment;
  const setComments = (f: (cs: NonNullable<TexDoc['comments']>) => NonNullable<TexDoc['comments']>) => change((d) => ({ ...d, comments: f(d.comments ?? []) }));
  const draftDone = (text: string) => {
    const dr = draft;
    if (!dr) return;
    const id = newCommentId();
    setComments((cs) => [...cs, { id, by: 'user', text, at: Date.now(), quote: dr.quote || undefined, file: dr.file, from: dr.from, to: dr.to }]);
    setDraft(null);
    setActiveComment(id);
  };
  const pickComment = (x: NonNullable<TexDoc['comments']>[number]) => {
    setActiveComment(x.id);
    withCode(x.file, (c) => c.select(x.from, x.to));
  };
  const commentsPanel = (className?: string) =>
    model && (
      <CommentsPanel
        comments={model.comments ?? []}
        file={file}
        label={label}
        active={activeComment}
        draft={draft}
        readOnly={readOnly}
        onAdd={addComment}
        onDraftDone={draftDone}
        onDraftCancel={() => setDraft(null)}
        onPick={pickComment}
        onReply={(id, text) => setComments((cs) => cs.map((c) => (c.id === id ? { ...c, replies: [...(c.replies ?? []), { id: newCommentId(), by: 'user', text, at: Date.now() }] } : c)))}
        onResolve={(id, resolved) => setComments((cs) => cs.map((c) => (c.id === id ? { ...c, resolved: resolved || undefined } : c)))}
        onEdit={(id, text) => setComments((cs) => cs.map((c) => (c.id === id ? { ...c, text } : c)))}
        onDelete={(id) => setComments((cs) => cs.filter((c) => c.id !== id))}
        onOpenFile={(name) => open(name)}
        className={className}
      />
    );
  const openCount = model?.comments?.filter((c) => !c.resolved).length ?? 0;

  // ---- what an agent is asked about ------------------------------------------------------------------------------------
  const settled = useDeferredValue(model);
  const outline = useMemo(() => (settled ? texOutline(settled) : []), [settled]);
  const heading = file === PICTURES ? null : headingAt(outline, file, cursor.line);
  const scopes = useMemo(() => scopesFor(file, cursor, heading), [file, cursor, heading]);
  const scopesKey = JSON.stringify(scopes);
  useEffect(() => {
    onScopes?.(scopes);
  }, [scopesKey]);
  const askHere = () => {
    if (!onAsk) return;
    const s = scopes[scopes.length - 1];
    onAsk(s.lead || 'In this LaTeX document: ');
  };
  const askFix = () => {
    const r = resultRef.current;
    if (!onAsk || !r) return;
    const list = r.errors
      .slice(0, 6)
      .map((x) => `${where(x) ? `${where(x)}: ` : ''}${x.message}`)
      .join('; ');
    onAsk(`Fix the errors LaTeX reports (${list}): `);
  };

  // ---- inserting --------------------------------------------------------------------------------------------------------
  const target = () => (file !== PICTURES && /\.(tex|ltx|sty|cls)$/i.test(file) ? file : lastTex.current);
  const pictureNames = () => live.current?.pictures.map((p) => p.name) ?? [];
  const allNames = () => (live.current ? [TEX_MAIN, ...live.current.files.map((f) => f.name), ...live.current.pictures.map((p) => p.name)] : []);

  const addPictures = async (list: File[]): Promise<string[]> => {
    const added: string[] = [];
    for (const f of list) {
      try {
        const p = await addPicture(f, [...allNames(), ...added]);
        change((d) => ({ ...d, pictures: [...d.pictures, p] }));
        added.push(p.name);
      } catch (e) {
        toastError(e);
      }
    }
    return added;
  };
  const choosePictures = async () => {
    setMenu(null);
    const files = await chooseFiles(PICTURE_ACCEPT);
    if (files.length) toast(files.length === 1 ? 'Adding the picture…' : `Adding ${files.length} pictures…`);
    return addPictures(files);
  };
  const addFiles = async (list: File[]) => {
    for (const f of list) {
      try {
        const x = await addFileFromDevice(f, allNames());
        change((d) => ({ ...d, files: [...d.files, x] }));
        open(x.name);
      } catch (e) {
        toastError(e);
      }
    }
  };

  const insert = async (id: SnipId, o: { picture?: string } = {}) => {
    setMenu(null);
    if (readOnly || !live.current) return;
    const name = target();
    let picture = o.picture;
    if (id === 'figure' && !picture) {
      picture = live.current.pictures[0]?.name ?? (await choosePictures())[0];
      if (!picture) return;
    }
    let key: string | undefined;
    if (id === 'cite') {
      key = docWords(live.current).keys[0];
      if (!key) {
        // No bibliography yet: refs.bib with an entry to start from, read at the document's end.
        const bib = freeName('refs.bib', allNames());
        change((d) => ({ ...d, files: [...d.files, { name: bib, text: SAMPLE_BIB }] }));
        editFile(TEX_MAIN, (t) => withBibliography(t, bib));
        key = 'knuth1984';
        toast(`Added ${bib}, with an entry to start from`, 'ok');
      }
    }
    withCode(name, (c) => {
      if (id === 'bold') return c.toggle('textbf', 'bold');
      if (id === 'italic') return c.toggle('textit', 'italic');
      const p = c.pickedLines();
      const made = makeSnippet(id, p.empty ? '' : p.text, { picture, key, labels: docWords(live.current ?? model!).labels });
      if (made.needs) editFile(TEX_MAIN, (t) => withPackages(t, made.needs!));
      if (made.block && !p.empty && (id === 'itemize' || id === 'enumerate' || id === 'description' || id === 'align')) {
        // The lines picked become the list's items: the whole lines go.
        c.replacePicked('');
      }
      c.insert(made.template, made.block);
    });
  };

  /** The words picked (or a placeholder) made into something by the code (a format, a size): in the file in view. */
  const onCode = (f: (c: Code) => void, needs?: string[]) => {
    setMenu(null);
    if (readOnly || !live.current) return;
    if (needs) editFile(TEX_MAIN, (t) => withPackages(t, needs));
    withCode(target(), f);
  };

  /** A symbol at the cursor: in $…$ when the cursor is not in maths; its package loaded. The panel stays, for the next. */
  const insertSymbol = (s: Sym) => {
    if (readOnly || !live.current) return;
    rememberSymbol(s);
    if (s[2] && !defsOf().packages.has(s[2])) editFile(TEX_MAIN, (t) => withPackages(t, [s[2]!]));
    const put = (c: Code) => {
      const t = symInsert(s);
      c.insert(c.inMath() ? t : `$${t}$`);
    };
    // In the file in view, the panel stays open; another file is opened for it.
    const name = target();
    const c = codes.current.get(name);
    if (c && name === file) put(c);
    else withCode(name, put);
  };

  /** The table editor: for a new table, or the one the cursor is in (`edit`). */
  const openTable = (edit: boolean) => {
    setMenu(null);
    if (readOnly) return;
    const name = target();
    const c = codes.current.get(name);
    if (edit && c) {
      const found = tableAt(c.text(), c.cursor());
      if ('why' in found) return toast(found.why);
      return setTableAsk({ table: found.table, at: { file: name, from: found.from, to: found.to } });
    }
    setTableAsk({ table: blankTable(), at: null });
  };
  const tableDone = (t: TexTable) => {
    const ask = tableAsk;
    setTableAsk(null);
    if (!ask) return;
    if (ask.at) {
      const at = ask.at;
      withCode(at.file, (c) => {
        const text = c.text();
        const line = text.lastIndexOf('\n', at.from - 1) + 1;
        const indent = /^[ \t]*/.exec(text.slice(line))![0];
        const made = tableTex(t, indent);
        if (made.needs.length) editFile(TEX_MAIN, (x) => withPackages(x, made.needs));
        c.replaceRange(at.from, at.to, made.text.slice(indent.length));
      });
    } else
      onCode((c) => {
        const made = tableTex(t);
        if (made.needs.length) editFile(TEX_MAIN, (x) => withPackages(x, made.needs));
        c.insertBlock(made.text);
      });
  };
  /** Whether the cursor is in a table the grid can read (for Edit this table). */
  const inTable = useMemo(() => {
    const c = codes.current.get(file);
    if (!c || !/\.(tex|ltx)$/i.test(file)) return false;
    const text = c.text();
    return text.includes('tabular') && 'table' in tableAt(text, c.cursor());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, cursor, model]);

  // ---- references --------------------------------------------------------------------------------------------------------
  /** The bibliography references go in: the one in view, the one the document names, its first, or a new refs.bib. */
  const bibTarget = (): { name: string; fresh: boolean } => {
    const d = live.current;
    if (!d) return { name: 'refs.bib', fresh: true };
    if (file.endsWith('.bib') && d.files.some((f) => f.name === file)) return { name: file, fresh: false };
    for (const t of [d.main, ...d.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.text)])
      for (const m of t.matchAll(/\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g))
        for (const part of m[1].split(',')) {
          const n = part.trim().replace(/^\.\//, '');
          const name = n.endsWith('.bib') ? n : `${n}.bib`;
          if (d.files.some((f) => f.name === name)) return { name, fresh: false };
        }
    const any = d.files.find((f) => f.name.endsWith('.bib'));
    return any ? { name: any.name, fresh: false } : { name: freeName('refs.bib', allNames()), fresh: true };
  };
  const [refsTarget, setRefsTarget] = useState<{ name: string; fresh: boolean; cite: boolean }>({ name: 'refs.bib', fresh: true, cite: true });
  const openRefs = () => {
    setMenu(null);
    if (readOnly) return;
    setRefsTarget({ ...bibTarget(), cite: !file.endsWith('.bib') });
    setDialog('refs');
  };
  const addReference = (e: TexReference, cite: boolean) => {
    const t = bibTarget();
    if (t.fresh) {
      change((d) => ({ ...d, files: [...d.files, { name: t.name, text: '' }] }));
      editFile(TEX_MAIN, (x) => withBibliography(x, t.name));
    }
    let key = '';
    editFile(t.name, (text) => {
      const r = addBibEntry(text, e.bibtex);
      key = r.key;
      return r.text;
    });
    if (!key) return toast('That entry could not be read');
    setRefsTarget((x) => ({ ...x, name: t.name, fresh: false }));
    if (cite) {
      withCode(target(), (c) => {
        const before = c.text().slice(Math.max(0, c.cursor() - 1), c.cursor());
        c.insertText(`${before && !/\s|\{|~/.test(before) ? '~' : ''}\\cite{${key}}`);
      });
      toast(`Cited ${key}, added to ${t.name}`, 'ok');
    } else toast(`Added ${key} to ${t.name}`, 'ok');
  };

  // ---- files and pictures ----------------------------------------------------------------------------------------------
  const nameProblem = (name: string, kind: 'file' | 'picture', from?: string): string | null => {
    const clean = cleanTexName(name, kind);
    if (!clean) return kind === 'file' ? 'Letters, digits, - _ . and / between folders, and an extension LaTeX reads (.tex, .bib, .sty…)' : 'Letters, digits, - _ . and / between folders, ending in .png or .jpg';
    if (clean === TEX_MAIN || allNames().some((n) => n.toLowerCase() === clean.toLowerCase() && n !== from)) return 'The document has a file of that name';
    return null;
  };
  const renameFile = (from: string, to: string) => {
    codes.current.get(from)?.destroy();
    codes.current.delete(from);
    // The editors of the files whose references change start again from their new text.
    for (const [n, c] of codes.current)
      if (n !== from) {
        c.destroy();
        codes.current.delete(n);
      }
    change((d) => renameRefs({ ...d, files: d.files.map((f) => (f.name === from ? { ...f, name: to } : f)) }, from, to));
    setOpened((o) => o.map((n) => (n === from ? to : n)));
    if (file === from) setFile(to);
    if (lastTex.current === from) lastTex.current = to;
  };
  const deleteFile = async (name: string) => {
    setMenu(null);
    if (!(await confirm({ title: `Delete ${name}?`, body: 'It goes from the document (an older version still has it).', confirm: 'Delete', danger: true }))) return;
    codes.current.get(name)?.destroy();
    codes.current.delete(name);
    setOpened((o) => o.filter((n) => n !== name));
    if (file === name) setFile(TEX_MAIN);
    if (lastTex.current === name) lastTex.current = TEX_MAIN;
    change((d) => ({ ...d, files: d.files.filter((f) => f.name !== name) }));
  };
  const renamePicture = (from: string, to: string) => {
    for (const c of codes.current.values()) c.destroy();
    codes.current.clear();
    change((d) => renameRefs({ ...d, pictures: d.pictures.map((p) => (p.name === from ? { ...p, name: to } : p)) }, from, to));
  };
  const removePicture = async (name: string) => {
    if (!(await confirm({ title: `Remove ${name}?`, body: 'The document no longer has it; where \\includegraphics names it, typesetting says so.', confirm: 'Remove', danger: true }))) return;
    change((d) => ({ ...d, pictures: d.pictures.filter((p) => p.name !== name) }));
  };

  // Files dropped in: pictures (and a figure for each where the cursor is, when dropped on the source), other files as files.
  const onDrop = async (e: React.DragEvent) => {
    const list = [...e.dataTransfer.files];
    if (!list.length || readOnly) return;
    e.preventDefault();
    const pics = list.filter((f) => f.type.startsWith('image/') || /\.pdf$/i.test(f.name));
    const texts = list.filter((f) => !pics.includes(f));
    const onCode = !!(e.target as HTMLElement).closest?.('.cm-editor');
    const added = await addPictures(pics);
    if (onCode) for (const p of added) await insert('figure', { picture: p });
    if (added.length && !onCode) toast(added.length === 1 ? `${added[0]} added under Pictures` : `${added.length} pictures added`, 'ok');
    await addFiles(texts);
  };

  // ---- the layout ---------------------------------------------------------------------------------------------------------
  const onDividerDown = (e: React.PointerEvent) => {
    const box = splitBox.current;
    if (!box) return;
    e.preventDefault();
    const rect = box.getBoundingClientRect();
    const move = (ev: PointerEvent) => setSplit(Math.min(0.75, Math.max(0.25, (ev.clientX - rect.left) / rect.width)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (!model)
    return (
      <div ref={root} className="flex h-full items-center justify-center bg-bg text-fg-3">
        <Throbber size={28} />
      </div>
    );

  const engine = model.engine;
  const engineChip = (
    <Button ref={anchors.engine} size="sm" variant="ghost" onClick={() => setMenu(menu === 'engine' ? null : 'engine')} disabled={readOnly} className={cx('shrink-0 gap-1 px-2', menu === 'engine' && 'bg-bg-2 text-fg')}>
      {engineLabel(engine)}
      <ChevronDown size={12} className="opacity-60" />
    </Button>
  );
  const compileButtons = (
    <div className="flex shrink-0 items-center">
      <Button
        size="sm"
        variant="primary"
        icon={busy ? <Throbber className="h-3.5 w-3.5" /> : <Play size={14} />}
        onClick={() => void run(true)}
        title="Recompile (Ctrl+Enter)"
        aria-label="Recompile"
        className="rounded-r-none"
      >
        {roomy ? 'Recompile' : ''}
      </Button>
      <Button ref={anchors.compile} size="sm" variant="primary" aria-label="Typesetting options" onClick={() => setMenu(menu === 'compile' ? null : 'compile')} className="rounded-l-none border-l border-accent-fg/25 px-1.5">
        <ChevronDown size={14} />
      </Button>
    </div>
  );
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-line" />;
  const code = codes.current.get(file);

  const showInPdf = async () => {
    const r = resultRef.current;
    if (!r?.pdf || file === PICTURES) return;
    try {
      const at = await placeOf(r.key, file, cursor.line);
      if (!at) return toast('That line has nothing on the pages');
      if (!wide) setPane('preview');
      setFlash({ ...at, n: Date.now() });
    } catch (e) {
      toastError(e);
    }
  };
  const pickEngine = (id: TexEngine) => {
    setMenu(null);
    const why = setup?.notes[id];
    if (why && id !== engine) toast(why);
    if (id === engine) return;
    quick.current = true;
    change((d) => ({ ...d, engine: id }));
  };
  const openPdf = () => {
    setMenu(null);
    if (result?.pdf) window.open(pdfUrl(result.key), '_blank', 'noreferrer');
  };
  const switchMode = (m: 'code' | 'visual') => {
    setMode(m);
    const c = codes.current.get(file);
    if (m === 'visual' && c && c.text().length > MAX_VISUAL) toast('This file is too long for Visual: it shows as code');
    c?.focus();
  };
  /** The lines picked put in an environment (center, flushleft…), or an empty one at the cursor. */
  const inEnv = (env: string) =>
    onCode((c) => {
      const p = c.pickedLines();
      if (p.empty) return c.insert(`\\begin{${env}}\n  \${}\n\\end{${env}}`, true);
      const d = c.view.state.doc;
      const lines = Array.from({ length: p.to - p.from + 1 }, (_, i) => d.line(p.from + i).text).join('\n');
      c.replacePicked(`\\begin{${env}}\n${lines}\n\\end{${env}}`);
    });
  const fmt = (cmd: string) => () => onCode((c) => c.toggle(cmd, 'words'));
  const canCompare = !onDisk && !!pageId;
  // A file of this computer keeps its files only: comments are for documents in the Library.
  const canComment = !onDisk;

  const menus: MenuDef[] = [
    {
      label: 'Edit',
      items: [
        { label: 'Undo', icon: <Undo2 size={14} />, keys: 'Ctrl+Z', disabled: !code || readOnly, run: () => code?.undo() },
        { label: 'Redo', icon: <Redo2 size={14} />, keys: 'Ctrl+Shift+Z', disabled: !code || readOnly, run: () => code?.redo() },
        '-',
        { label: 'Find and replace', icon: <Search size={14} />, keys: 'Ctrl+H', also: 'search find', disabled: !code, run: () => find.show(!readOnly) },
        { label: 'Go to line', keys: 'Ctrl+Alt+G', disabled: !code, run: () => code?.gotoLine() },
        { label: 'Select all', keys: 'Ctrl+A', disabled: !code, run: () => code?.selectAll() },
        '-',
        { label: 'Comment or uncomment', keys: 'Ctrl+/', also: 'percent', disabled: !code || readOnly, run: () => code?.comment() },
      ],
    },
    {
      label: 'Insert',
      items: readOnly
        ? [{ label: 'An older version cannot be changed', disabled: true }]
        : [
            {
              label: 'Heading',
              icon: <Heading size={14} />,
              items: [
                { label: 'Part', run: () => void insert('part') },
                { label: 'Chapter', run: () => void insert('chapter') },
                { label: 'Section heading', run: () => void insert('section') },
                { label: 'Subsection heading', run: () => void insert('subsection') },
                { label: 'Subsubsection heading', run: () => void insert('subsubsection') },
                { label: 'Paragraph heading', run: () => void insert('paragraph') },
              ],
            },
            { label: 'Bulleted list', icon: <List size={14} />, also: 'itemize', run: () => void insert('itemize') },
            { label: 'Numbered list', icon: <ListOrdered size={14} />, also: 'enumerate', run: () => void insert('enumerate') },
            '-',
            { label: 'Table', icon: <Table2 size={14} />, also: 'tabular grid', run: () => openTable(false) },
            inTable && { label: 'Edit this table', icon: <Table2 size={14} />, also: 'tabular grid', run: () => openTable(true) },
            { label: 'Figure with a picture', icon: <ImageIcon size={14} />, also: 'includegraphics image', run: () => void insert('figure') },
            '-',
            { label: 'Equation', icon: <Sigma size={14} />, also: 'maths formula', run: () => void insert('equation') },
            { label: 'Aligned equations', icon: <SquareFunction size={14} />, also: 'align maths', run: () => void insert('align') },
            { label: 'Symbol', icon: <Omega size={14} />, also: 'greek maths character arrow', run: () => setMenu('symbols') },
            '-',
            { label: 'Reference', icon: <BookPlus size={14} />, also: 'doi arxiv bibliography bibtex crossref paper', run: openRefs },
            { label: 'Citation', icon: <BookOpen size={14} />, also: 'cite', run: () => void insert('cite') },
            { label: 'Cross-reference', icon: <LocateFixed size={14} />, also: 'ref label', run: () => void insert('ref') },
            canComment && { label: 'Comment', icon: <MessageSquarePlus size={14} />, keys: 'Ctrl+Alt+M', also: 'note review', disabled: file === PICTURES, run: addComment },
            {
              label: 'More',
              items: [
                { label: 'Footnote', icon: <Footprints size={14} />, run: () => void insert('footnote') },
                { label: 'Link', icon: <Link2 size={14} />, also: 'url href', run: () => void insert('link') },
                { label: 'Description list', also: 'description', run: () => void insert('description') },
                { label: 'Quotation', icon: <Quote size={14} />, run: () => void insert('quote') },
                { label: 'Text exactly as typed', also: 'verbatim code', run: () => void insert('verbatim') },
                { label: 'Proof', also: 'amsthm', run: () => void insert('proof') },
                { label: 'Table of contents', also: 'toc', run: () => void insert('toc') },
                { label: 'Page break', also: 'new page', run: () => void insert('newpage') },
              ],
            },
          ],
    },
    {
      label: 'Format',
      items: [
        { label: 'Bold', icon: <Bold size={14} />, keys: 'Ctrl+B', disabled: readOnly, run: fmt('textbf') },
        { label: 'Italic', icon: <Italic size={14} />, keys: 'Ctrl+I', disabled: readOnly, run: fmt('textit') },
        { label: 'Emphasis', disabled: readOnly, also: 'emph', run: fmt('emph') },
        { label: 'Underline', icon: <Underline size={14} />, disabled: readOnly, run: fmt('underline') },
        { label: 'Typewriter', disabled: readOnly, also: 'monospace texttt', run: fmt('texttt') },
        { label: 'Small capitals', disabled: readOnly, also: 'textsc', run: fmt('textsc') },
        { label: 'Superscript', disabled: readOnly, run: fmt('textsuperscript') },
        { label: 'Subscript', disabled: readOnly, run: fmt('textsubscript') },
        '-',
        {
          label: 'Text size',
          disabled: readOnly,
          items: (
            [
              ['Tiny', 'tiny'],
              ['Small', 'small'],
              ['Large', 'large'],
              ['Larger', 'Large'],
              ['Largest', 'LARGE'],
              ['Huge', 'huge'],
            ] as const
          ).map(([label, cmd]) => ({ label, run: () => onCode((c) => c.wrap(`{\\${cmd} `, '}', 'words')) })),
        },
        {
          label: 'Alignment',
          disabled: readOnly,
          items: [
            { label: 'Centred', run: () => inEnv('center') },
            { label: 'Aligned left', run: () => inEnv('flushleft') },
            { label: 'Aligned right', run: () => inEnv('flushright') },
          ],
        },
        {
          label: 'Text colour',
          disabled: readOnly,
          also: 'color xcolor',
          items: (
            [
              ['Red', 'red'],
              ['Blue', 'blue'],
              ['Green', 'green!50!black'],
              ['Orange', 'orange'],
              ['Grey', 'gray'],
            ] as const
          ).map(([label, colour]) => ({ label, run: () => onCode((c) => c.wrap(`\\textcolor{${colour}}{`, '}', 'words'), ['xcolor']) })),
        },
        '-',
        { label: 'Comment or uncomment', keys: 'Ctrl+/', disabled: !code || readOnly, run: () => code?.comment() },
        { label: 'Clear formatting', icon: <RemoveFormatting size={14} />, disabled: readOnly, run: () => onCode((c) => c.clearFormat()) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Code', checked: mode === 'code', also: 'source', run: () => switchMode('code') },
        { label: 'Visual', checked: mode === 'visual', also: 'visual editor rich text', run: () => switchMode('visual') },
        '-',
        { label: 'Outline', icon: <ListTree size={14} />, checked: wide ? outlineOpen : undefined, also: 'sections headings', run: () => (wide ? setOutlineOpen((o) => !o) : setMenu('outline')) },
        canComment && { label: 'Comments', icon: <MessageSquare size={14} />, checked: commentsOpen, also: 'review notes', run: () => setCommentsOpen((x) => !x) },
        { label: 'Check spelling', icon: <SpellCheck size={14} />, checked: spell, also: 'spell', run: () => setSpell((x) => !x) },
        { label: 'Fold all', icon: <FoldVertical size={14} />, keys: 'Ctrl+Alt+[', disabled: !code, also: 'collapse', run: () => code?.foldAll() },
        { label: 'Unfold all', icon: <UnfoldVertical size={14} />, keys: 'Ctrl+Alt+]', disabled: !code, also: 'expand', run: () => code?.unfoldAll() },
        '-',
        setup?.sync !== false && { label: 'Show this line in the PDF', icon: <LocateFixed size={14} />, disabled: !result?.pdf || file === PICTURES, also: 'synctex', run: () => void showInPdf() },
        { label: 'Dark pages', icon: <Moon size={14} />, checked: darkPages && dark, disabled: !dark, also: 'night invert', run: () => setDarkPages((x) => !x) },
        { label: 'Present the pages', icon: <Presentation size={14} />, disabled: !result?.pdf, also: 'full screen slides', run: () => setPresentAsk((n) => n + 1) },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Recompile now', icon: <Play size={14} />, keys: 'Ctrl+Enter', also: 'typeset compile', run: () => void run(true) },
        { label: 'Recompile as you type', checked: auto, also: 'auto compile', run: () => setAuto((a) => !a) },
        { label: 'Typeset with', also: 'engine', disabled: readOnly, items: TEX_ENGINES.map((x) => ({ label: x.label, checked: engine === x.id, run: () => pickEngine(x.id) })) },
        '-',
        { label: 'Word count', icon: <WholeWord size={14} />, also: 'words texcount', run: () => setDialog('count') },
        canCompare && { label: 'Compare versions', icon: <History size={14} />, also: 'diff history changes', run: () => setDialog('compare') },
        '-',
        { label: 'Show the log', icon: <ScrollText size={14} />, disabled: !result?.log, run: () => setLogOpen(true) },
        { label: 'Open the PDF', icon: <ExternalLink size={14} />, disabled: !result?.pdf, run: openPdf },
        !!onAsk && !readOnly && !!result?.errors.length && { label: 'Ask the agent to fix them', icon: <Sparkles size={14} />, also: 'errors', run: askFix },
        '-',
        { label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, also: 'keys', run: () => setDialog('keys') },
      ] as MenuEntry[],
    },
  ];

  const toolbar = (
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
      {!wide && (
        <>
          {compileButtons}
          {engineChip}
          {sep}
        </>
      )}
      <div className="shrink-0">
        <Segmented
          size="sm"
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'code', label: 'Code' },
            { value: 'visual', label: 'Visual' },
          ]}
        />
      </div>
      {!readOnly && (
        <>
          {sep}
          <IconButton label="Bold (Ctrl+B)" size="sm" onClick={() => void insert('bold')}>
            <Bold size={15} />
          </IconButton>
          <IconButton label="Italic (Ctrl+I)" size="sm" onClick={() => void insert('italic')}>
            <Italic size={15} />
          </IconButton>
          <IconButton ref={anchors.symbols} label="Symbols" size="sm" active={menu === 'symbols'} onClick={() => setMenu(menu === 'symbols' ? null : 'symbols')}>
            <Omega size={15} />
          </IconButton>
          <IconButton label="Equation" size="sm" onClick={() => void insert('equation')}>
            <Sigma size={15} />
          </IconButton>
          <IconButton label="Figure with a picture" size="sm" onClick={() => void insert('figure')}>
            <ImagePlus size={15} />
          </IconButton>
        </>
      )}
      {sep}
      <IconButton
        ref={anchors.outline}
        label="Outline"
        size="sm"
        active={wide ? outlineOpen : menu === 'outline'}
        onClick={() => (wide ? setOutlineOpen((o) => !o) : setMenu(menu === 'outline' ? null : 'outline'))}
      >
        <ListTree size={15} />
      </IconButton>
      {canComment && (
        <IconButton label="Comments" size="sm" active={commentsOpen} onClick={() => setCommentsOpen((x) => !x)} className="relative">
          <MessageSquare size={15} />
          {openCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-3.5 rounded-full bg-accent px-1 text-[9.5px] leading-3.5 font-semibold text-accent-fg tabular-nums">{openCount}</span>}
        </IconButton>
      )}
      <IconButton label="Find and replace (Ctrl+F)" size="sm" disabled={!code} active={find.open} onClick={() => (find.open ? find.close() : find.show())}>
        <Search size={15} />
      </IconButton>
      {setup?.sync !== false && (
        <IconButton label="Show this line in the PDF" size="sm" disabled={!result?.pdf || file === PICTURES} onClick={() => void showInPdf()}>
          <LocateFixed size={15} />
        </IconButton>
      )}
      {onAsk && (
        <>
          {sep}
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} className="text-accent" />} onClick={askHere} className="shrink-0">
            {cursor.picked && file !== PICTURES ? 'Ask the agent about these lines' : 'Ask the agent'}
          </Button>
        </>
      )}
    </div>
  );

  const tabCls = (on: boolean) =>
    cx('relative flex h-9 shrink-0 items-center gap-1 px-2.5 text-[12.5px] transition-colors', on ? 'font-medium text-fg' : 'text-fg-3 hover:text-fg-2');
  const fileTabs = (
    <div role="tablist" className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-line bg-bg px-1 [&::-webkit-scrollbar]:hidden">
      {[TEX_MAIN, ...model.files.map((f) => f.name)].map((n) => (
        <div key={n} className="flex shrink-0 items-center">
          <button type="button" role="tab" aria-selected={file === n} onClick={() => open(n)} className={tabCls(file === n)} translate="no">
            {label(n)}
            {file === n && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
          </button>
          {file === n && n !== TEX_MAIN && !readOnly && (
            <IconButton ref={anchors.file} label="This file" size="sm" active={menu === 'file'} onClick={() => setMenu(menu === 'file' ? null : 'file')} className="-ml-1.5 h-6 w-6">
              <ChevronDown size={13} />
            </IconButton>
          )}
        </div>
      ))}
      <button type="button" role="tab" aria-selected={file === PICTURES} onClick={() => open(PICTURES)} className={tabCls(file === PICTURES)}>
        <ImageIcon size={13} />
        Pictures
        {model.pictures.length > 0 && <span className="rounded bg-bg-2 px-1 text-[11px] font-normal text-fg-3 tabular-nums">{model.pictures.length}</span>}
        {file === PICTURES && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
      </button>
      {!readOnly && (
        <IconButton ref={anchors.add} label="Add a file or a picture" size="sm" active={menu === 'add'} onClick={() => setMenu(menu === 'add' ? null : 'add')} className="ml-0.5">
          <Plus size={14} />
        </IconButton>
      )}
    </div>
  );

  const pictures = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
      {!model.pictures.length ? (
        <div className="mx-auto max-w-sm py-8 text-center text-[13px] leading-relaxed text-fg-3">
          <p>
            {onDisk?.folder
              ? 'The pictures in its folder are typeset as they are. Pictures added here (PNG, JPEG or PDF, or dropped here) go into the folder when you save, by the name \\includegraphics gives them.'
              : 'No pictures yet. Add PNG, JPEG or PDF pictures, or drop them here; each goes by the name \\includegraphics gives it.'}
          </p>
          {!readOnly && (
            <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => void choosePictures()} className="mt-3">
              Add a picture
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {model.pictures.map((p) => (
              <figure key={p.name} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
                <div className="flex h-28 items-center justify-center bg-bg-2 p-2">
                  <img src={assetUrl(p.src)} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                </div>
                <figcaption className="flex min-w-0 flex-col gap-1 p-2">
                  <span translate="no" title={p.name} className="truncate font-mono text-[11.5px] text-fg">
                    {p.name}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {!readOnly && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => void insert('figure', { picture: p.name })}>
                        Insert
                      </Button>
                    )}
                    <span className="flex-1" />
                    <IconButton
                      label="Copy its name"
                      size="sm"
                      onClick={() =>
                        void navigator.clipboard?.writeText(p.name).then(
                          () => toast('Name copied', 'ok'),
                          () => toast(p.name),
                        )
                      }
                    >
                      <Copy size={13} />
                    </IconButton>
                    {!readOnly && (
                      <>
                        <IconButton label="Rename" size="sm" onClick={() => setNaming({ kind: 'rename-picture', from: p.name })}>
                          <Pencil size={13} />
                        </IconButton>
                        <IconButton label="Remove" size="sm" onClick={() => void removePicture(p.name)}>
                          <Trash2 size={13} />
                        </IconButton>
                      </>
                    )}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
          {!readOnly && (
            <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={() => void choosePictures()} className="mt-3">
              Add a picture
            </Button>
          )}
        </>
      )}
    </div>
  );

  const source = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {fileTabs}
      {file.endsWith('.bib') && !readOnly && (
        <div className="flex h-9 shrink-0 items-center border-b border-line bg-bg px-1.5">
          <Button size="sm" variant="ghost" icon={<BookPlus size={14} />} className="h-7 min-w-0 px-2 text-[12.5px]" onClick={openRefs}>
            <span className="truncate">Find a reference by DOI, arXiv id or title</span>
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {opened.map((n) => (
            <div
              key={`${epoch}:${n}`}
              ref={(el) => {
                if (el) hosts.current.set(n, el);
                else if (hosts.current.get(n)?.isConnected === false) hosts.current.delete(n);
              }}
              translate="no"
              className={cx('absolute inset-0 overflow-hidden bg-bg [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[12.5px]', file === n ? 'block' : 'hidden')}
            />
          ))}
          {file === PICTURES && <div className="absolute inset-0 flex flex-col bg-bg">{pictures}</div>}
          {find.open && file !== PICTURES && (
            <div className="absolute top-2 right-3 z-20 w-[min(440px,calc(100%-24px))]">
              <FindBar find={find} count={found.list.length} index={found.current} onNext={() => findGo(1)} onPrev={() => findGo(-1)} onReplace={readOnly ? undefined : replaceOne} onReplaceAll={readOnly ? undefined : replaceAll} />
            </div>
          )}
        </div>
        {/* Comments beside the source where there is room (a sheet on a phone, below). */}
        {canComment && commentsOpen && roomy && file !== PICTURES && commentsPanel('w-64 shrink-0 border-l border-line bg-panel')}
      </div>
      <Problems
        result={result}
        open={problemsOpen}
        onToggle={() => setProblemsOpen((o) => !o)}
        onGo={(x) => x.file && x.line && goTo(x.file, x.line)}
        onLog={() => setLogOpen(true)}
        onAsk={onAsk && !readOnly ? askFix : undefined}
        name={label}
      />
    </div>
  );

  const preview = (
    <Preview
      result={result}
      busy={busy}
      setup={setup}
      flash={flash}
      className="min-h-0 flex-1"
      onSource={(f, line) => {
        goTo(f, line);
        if (!wide) setPane('source');
      }}
      onProblems={() => {
        setProblemsOpen(true);
        setPane('source');
      }}
      darkPages={darkPages && dark}
      presentAsk={presentAsk}
    />
  );

  const fileMenuName = file !== PICTURES && file !== TEX_MAIN ? file : null;

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 flex-col bg-bg"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && !readOnly && e.preventDefault()}
      onDrop={(e) => void onDrop(e)}
    >
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 shrink items-center gap-1.5">{lead}</div>
          {/* The menus beside the title, where the header has room for them; one button where it hasn't. */}
          <MenuBar menus={menus} compact={roomy ? 'auto' : true} />
        </div>
        {!wide && (
          <Segmented
            size="sm"
            value={pane}
            onChange={setPane}
            options={[
              { value: 'source', label: 'Source' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        )}
        {wide && engineChip}
        {wide && compileButtons}
        {tail}
      </div>
      {band}
      {toolbar}
      <div className="relative flex min-h-0 flex-1">
        {wide && outlineOpen && (
          <aside className="w-56 shrink-0 overflow-y-auto overscroll-contain border-r border-line bg-panel">
            <div className="px-3 pt-2.5 pb-1 text-[11.5px] font-medium text-fg-3">Outline</div>
            <OutlineList outline={outline} current={heading} onGo={(h) => goTo(h.file, h.line)} />
          </aside>
        )}
        {/* Both stay (each keeps its place, its editors and its pictures); on a phone, one shows at a time. */}
        <div ref={splitBox} className="flex min-w-0 flex-1">
          <div className={cx('flex min-h-0 min-w-0 flex-col', !wide && 'flex-1', !wide && pane !== 'source' && 'hidden')} style={wide ? { width: `${split * 100}%` } : undefined}>
            {source}
          </div>
          {wide && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Drag to share the width"
              onPointerDown={onDividerDown}
              onDoubleClick={() => setSplit(0.5)}
              className="w-1.5 shrink-0 cursor-col-resize border-x border-line bg-panel transition-colors hover:bg-bg-3"
            />
          )}
          <div className={cx('flex min-h-0 min-w-0 flex-1', !wide && pane !== 'preview' && 'hidden')}>{preview}</div>
        </div>
      </div>
      {dirty && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      <Popover anchor={anchors.symbols} open={menu === 'symbols'} onClose={() => setMenu(null)} width={340} title="Symbols">
        <SymbolsPanel onPick={insertSymbol} />
      </Popover>
      <Popover anchor={anchors.engine} open={menu === 'engine'} onClose={() => setMenu(null)} width={300} title="Typeset with">
        {TEX_ENGINES.map((x) => {
          const why = setup?.notes[x.id];
          return (
            <MenuItem key={x.id} checked={engine === x.id} onClick={() => pickEngine(x.id)}>
              <span className={cx(why && 'text-fg-3')}>{x.label}</span>
              <span className="ml-2 text-[12px] text-fg-3">{why ? 'not on this computer' : x.hint}</span>
            </MenuItem>
          );
        })}
      </Popover>
      <Popover anchor={anchors.compile} open={menu === 'compile'} onClose={() => setMenu(null)} align="end" width={260} title="Typesetting">
        <MenuItem icon={<Play size={14} />} hint="Ctrl+Enter" onClick={() => (setMenu(null), void run(true))}>
          Recompile now
        </MenuItem>
        <MenuItem icon={<span className="h-3.5 w-3.5" />} checked={auto} onClick={() => setAuto((a) => !a)}>
          Recompile as you type
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<ScrollText size={14} />} disabled={!result?.log} onClick={() => (setMenu(null), setLogOpen(true))}>
          Show the log
        </MenuItem>
        <MenuItem icon={<ExternalLink size={14} />} disabled={!result?.pdf} onClick={openPdf}>
          Open the PDF
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.add} open={menu === 'add'} onClose={() => setMenu(null)} width={240} title="Add">
        <MenuItem icon={<FilePlus size={14} />} onClick={() => (setMenu(null), setNaming({ kind: 'new' }))}>
          A new file
        </MenuItem>
        <MenuItem
          icon={<FileUp size={14} />}
          onClick={() => {
            setMenu(null);
            void chooseFiles(FILE_ACCEPT).then(addFiles);
          }}
        >
          A file from this device
        </MenuItem>
        <MenuItem
          icon={<ImagePlus size={14} />}
          onClick={() => {
            setFile(PICTURES);
            void choosePictures();
          }}
        >
          A picture
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.file} open={menu === 'file' && !!fileMenuName} onClose={() => setMenu(null)} width={200}>
        <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), setNaming({ kind: 'rename-file', from: fileMenuName! }))}>
          Rename
        </MenuItem>
        <MenuItem icon={<Trash2 size={14} />} danger onClick={() => void deleteFile(fileMenuName!)}>
          Delete
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.outline} open={menu === 'outline' && !wide} onClose={() => setMenu(null)} width={300} title="Outline">
        <OutlineList outline={outline} current={heading} onGo={(h) => (setMenu(null), goTo(h.file, h.line))} />
      </Popover>

      <NameDialog
        open={naming?.kind === 'new'}
        title="A new file"
        initial={freeName('chapter.tex', allNames())}
        hint="A chapter (.tex, read with \input), a bibliography (.bib), a style (.sty)…; folders with /: chapters/intro.tex."
        check={(n) => nameProblem(n, 'file')}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          const name = cleanTexName(n, 'file')!;
          setNaming(null);
          change((d) => ({ ...d, files: [...d.files, { name, text: '' }] }));
          open(name);
        }}
      />
      <NameDialog
        open={naming?.kind === 'rename-file'}
        title="Rename the file"
        initial={naming?.from ?? ''}
        hint="Where the document names it (\input, \include, \bibliography), the new name goes too."
        check={(n) => nameProblem(n, 'file', naming?.from)}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          const from = naming!.from!;
          setNaming(null);
          const to = cleanTexName(n, 'file')!;
          if (to !== from) renameFile(from, to);
        }}
      />
      <NameDialog
        open={naming?.kind === 'rename-picture'}
        title="Rename the picture"
        initial={naming?.from ?? ''}
        hint="Where \includegraphics names it, the new name goes too."
        check={(n) => nameProblem(n, 'picture', naming?.from)}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          const from = naming!.from!;
          setNaming(null);
          const to = cleanTexName(n, 'picture')!;
          if (to !== from) renamePicture(from, to);
        }}
      />
      <Dialog
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title="TeX’s log"
        width={900}
        footer={
          <>
            <Button
              variant="ghost"
              icon={<Copy size={14} />}
              onClick={() =>
                void navigator.clipboard?.writeText(result?.log ?? '').then(
                  () => toast('The log is copied', 'ok'),
                  () => {},
                )
              }
            >
              Copy
            </Button>
            <Button variant="primary" onClick={() => setLogOpen(false)}>
              Close
            </Button>
          </>
        }
      >
        <pre translate="no" className="font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-words text-fg-2">
          {result?.log || '—'}
        </pre>
      </Dialog>
      <TableEditor open={!!tableAsk} initial={tableAsk?.table ?? EMPTY_TABLE} editing={!!tableAsk?.at} onClose={() => setTableAsk(null)} onDone={tableDone} />
      <ReferencesDialog open={dialog === 'refs'} onClose={() => setDialog(null)} onPick={addReference} bib={refsTarget.name} fresh={refsTarget.fresh} canCite={refsTarget.cite} />
      <WordCountDialog open={dialog === 'count'} onClose={() => setDialog(null)} doc={model} file={file === PICTURES ? TEX_MAIN : file} label={label} />
      {canCompare && dialog === 'compare' && (
        <CompareDialog
          open
          onClose={() => setDialog(null)}
          pageId={pageId}
          current={model}
          dirty={dirty}
          readOnly={readOnly}
          label={label}
          onRestore={(name, text, version) => {
            if (name === TEX_MAIN || live.current?.files.some((f) => f.name === name)) editFile(name, () => text);
            else change((d) => ({ ...d, files: [...d.files, { name, text }] }));
            toast(`${label(name)} is as it was in version ${version} (not saved yet)`, 'ok');
          }}
        />
      )}
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => setDialog(null)} groups={SHORTCUTS} />
      <Dialog
        open={canComment && commentsOpen && !roomy && file !== PICTURES}
        onClose={() => {
          setCommentsOpen(false);
          setDraft(null);
        }}
        title="Comments"
        width={520}
      >
        {commentsPanel('-mx-3 max-h-[70dvh]')}
      </Dialog>
      {confirmNode}
    </div>
  );
}

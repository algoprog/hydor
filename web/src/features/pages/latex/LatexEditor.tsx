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
// A document of more than one file has its files as a tree on the left (FileTree.tsx; View → Files, remembered on this
// device; a sheet on a phone), beside the Outline in the same panel: the tab row then lists the files you have open,
// each closable, and a picture or a file TeX takes from the folder opens in the source's place to look at.
// While an agent writes a new version (live.ts), its source shows as it comes, read-only, with the agent's caret where
// its words arrive (the file it writes brought into view); it is typeset once it is saved.
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BookPlus,
  Bold,
  CheckCheck,
  ChevronDown,
  Copy,
  Eraser,
  ExternalLink,
  FilePen,
  FoldVertical,
  FolderTree,
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
  Tag,
  Table2,
  Trash2,
  Underline,
  Undo2,
  WandSparkles,
  UnfoldVertical,
  WholeWord,
  X,
} from 'lucide-react';
import {
  cleanTexComments,
  cleanTexName,
  engineLabel,
  headingAt,
  mergeTexComments,
  TEX_ENGINES,
  TEX_MAIN,
  texChangeOps,
  texOutline,
  type TexChange,
  type TexComment,
  type TexCompiled,
  type TexDoc,
  type TexEngine,
  type TexHeading,
  type TexIssue,
  type TexSetup,
} from '@shared/latex';
import { newCommentId } from '@shared/comments';
import { texDocUses, texFileKind, texIsUsed, texMoveFiles, type TexUses } from '@shared/latex-files';
import { addBibEntry } from '@shared/latex-bib';
import { blankTable, tableAt, tableTex, type TexTable } from '@shared/latex-table';
import type { TexReference } from '@shared/latex-bib';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Segmented, Throbber, useConfirm } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import { findIn, replacementOf, type Match } from '../common/find';
import { FindBar, useFind } from '../common/FindBar';
import { MenuBar, type MenuDef, type MenuEntry } from '../common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import type { AskScope, ModelEditorProps } from '../kinds';
import { useOwnScroll } from '../live';
import { mu } from '../../../lib/machine';
import { addFileFromDevice, addPicture, assetUrl, chooseFiles, clearTypesetting, FILE_ACCEPT, freeName, nameVersion, pdfUrl, PICTURE_ACCEPT, placeOf, texSetup, typeset } from './api';
import { api, enc } from '../../../lib/api';
import { VERSION_NAME_MAX, type PageVersion } from '@shared/pages';
import { ChangesList } from './ChangesList';
import { mountCode, type Code } from './code';
import { CommentsPanel, type CommentDraft } from './CommentsPanel';
import { CompareDialog } from './Compare';
import { FileTree, FileView, kindIcon, NewButton, type TreeActions, type TreeEntry } from './FileTree';
import { docDefs, type DocDefs } from './complete';
import { NameDialog, OutlineList, Problems, where } from './parts';
import { paperItems, PaperTools, type PaperAsk } from './PaperTools';
import { Preview, type Flash } from './Preview';
import { ReferencesDialog } from './References';
import { texMacros } from './scan';
import { docWords, makeSnippet, SAMPLE_BIB, withBibliography, withPackages, type SnipId } from './snippets';
import { rememberSymbol, SymbolsPanel } from './SymbolsPanel';
import { symInsert, type Sym } from './symbols';
import { TableEditor } from './TableEditor';
import { ToolRow, type RowTool } from './ToolRow';
import { MAX_VISUAL } from './visual';
import { WordCountDialog } from './WordCount';
import { useLatexAi } from './ai';
import { savedKeys, saveKeys, type KeysMode } from './keys';
import { docLabels } from '@shared/latex-ai';
import { bibKeys } from '@shared/latex-bib';
import { tidyTex } from '@shared/latex-tidy';
import { renameCites } from '@shared/latex-bibtidy';
import { BibTidyDialog } from './BibTidy';

const AUTO_KEY = 'wa.tex.auto';
const DRAFT_KEY = 'wa.tex.draft';
const HALT_KEY = 'wa.tex.halt';
/** The left panel: Files or Outline, or none ('none'); not set: the files of a document of more than one, else none. */
const PANEL_KEY = 'wa.tex.panel';
/** Before the panel had Files: whether the Outline showed. */
const OUTLINE_KEY = 'wa.tex.outline';
const MODE_KEY = 'wa.tex.mode';
const SPELL_KEY = 'wa.tex.spell';
const DARK_PAGES_KEY = 'wa.tex.darkpages';
const COMMENTS_KEY = 'wa.tex.comments';
/** The Pictures tab, among the files' (a document of one file). */
const PICTURES = '#pictures';
/** A picture of the document, and a file TeX takes from the folder, open to look at: views, not files' editors. */
const PIC = '#pic:';
const DISK = '#disk:';
/** A view in the source's place that is no file's text: the Pictures tab, a picture, a file of the folder. */
const isView = (k: string) => k.startsWith('#');
/** The file a view shows (a file's own name for a file). */
const viewName = (k: string) => (k.startsWith(PIC) ? k.slice(PIC.length) : k.startsWith(DISK) ? k.slice(DISK.length) : k);
const NO_USES: NonNullable<NonNullable<ModelEditorProps<TexDoc>['file']>['uses']> = [];

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
      ['Ctrl+K', 'Write with AI at the cursor'],
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
  if (isView(file)) return out;
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

export function LatexEditor({ doc, pageId, layout, readOnly: readOnlyProp, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef, file: onDisk, live: agent }: ModelEditorProps<TexDoc>) {
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
  // Draft (pictures as boxes) and Stop on the first error: typesetting's options, kept on this device.
  const [opts, setOpts] = useState(() => ({ draft: localStorage.getItem(DRAFT_KEY) === '1', halt: localStorage.getItem(HALT_KEY) === '1' }));
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [setup, setSetup] = useState<TexSetup | null>(null);
  const [pane, setPane] = useState<'source' | 'preview'>('source');
  // The left panel, Files or Outline: as last chosen on this device; never chosen, the files of a document of more than one.
  const [panelPick, setPanelPick] = useState<'files' | 'outline' | 'none' | null>(() => {
    const p = localStorage.getItem(PANEL_KEY);
    return p === 'files' || p === 'outline' || p === 'none' ? p : null;
  });
  const diskUses = onDisk?.uses ?? NO_USES;
  // The tree on a phone or in a narrow window: a sheet from the bottom.
  const [filesSheet, setFilesSheet] = useState(false);
  // Folders made here that nothing is in yet (a folder is there while something is in it).
  const [madeFolders, setMadeFolders] = useState<string[]>([]);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [menu, setMenu] = useState<'engine' | 'compile' | 'file' | 'outline' | 'symbols' | null>(null);
  // Code or Visual, Check spelling, Dark pages: remembered on this device.
  const [mode, setMode] = useState<'code' | 'visual'>(() => (localStorage.getItem(MODE_KEY) === 'visual' ? 'visual' : 'code'));
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [spell, setSpell] = useState(() => localStorage.getItem(SPELL_KEY) === '1');
  const spellRef = useRef(spell);
  spellRef.current = spell;
  const [darkPages, setDarkPages] = useState(() => localStorage.getItem(DARK_PAGES_KEY) === '1');
  // View → Keys: Normal, Vim or Emacs, kept on this device.
  const [keys, setKeys] = useState<KeysMode>(savedKeys);
  const keysRef = useRef(keys);
  keysRef.current = keys;
  /** The editor's AI (ai.tsx), for what the files' editors ask of it (Ctrl+K, a picture pasted). */
  const aiRef = useRef<ReturnType<typeof useLatexAi> | null>(null);
  const [dark, setDark] = useState(isDark);
  const [presentAsk, setPresentAsk] = useState(0);
  const [dialog, setDialog] = useState<'refs' | 'count' | 'compare' | 'keys' | 'bib' | null>(null);
  const [nameAsk, setNameAsk] = useState(false);
  // Tools → Check before submitting and Your paper.
  const [paperAsk, setPaperAsk] = useState<PaperAsk>(null);
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
  const [naming, setNaming] = useState<{ kind: 'new' | 'new-folder' | 'rename-file' | 'rename-picture' | 'rename-folder'; from?: string; folder?: string } | null>(null);
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
  const dirty = !!model && model !== saved && !readOnlyProp;
  // An agent's version being written shows in place of the source (read-only, its words arriving where its caret is;
  // typeset once it is saved), unless there are changes here not saved: those are left as they are.
  const liveTex = agent && !dirty ? agent.model : null;
  const liveOn = !!liveTex;
  const readOnly = !!readOnlyProp || liveOn;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem(AUTO_KEY, auto ? '1' : '0');
  }, [auto]);
  // A document of more than one file (pictures, and the files TeX takes from the folder, count): its files show as a tree.
  const multi = !!model && model.files.length + model.pictures.length + diskUses.length + madeFolders.length > 0;
  const panel: 'files' | 'outline' | null = panelPick === 'none' ? null : (panelPick ?? (multi ? 'files' : localStorage.getItem(OUTLINE_KEY) === '1' ? 'outline' : null));
  const showPanel = (p: 'files' | 'outline' | null) => {
    setPanelPick(p ?? 'none');
    localStorage.setItem(PANEL_KEY, p ?? 'none');
  };
  const togglePanel = (p: 'files' | 'outline') => showPanel(panel === p ? null : p);
  /** The tree is in view beside the source: the tab row then lists only the files open. */
  const treeShown = wide && panel === 'files';
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
    saveKeys(keys);
    for (const c of codes.current.values()) c.setKeys(keys);
  }, [keys]);
  useEffect(() => {
    texSetup().then(setSetup, () => {});
  }, []);

  /** The tabs that stay for another version of the document: those it still has, with the one in view. */
  const keepTabs = (o: string[], d: TexDoc, keep: string) => {
    const left = o.filter((k) => k !== PICTURES && has(d, k));
    const k = keep === PICTURES ? TEX_MAIN : keep;
    return left.includes(k) ? left : [...left, k];
  };
  /** Whether a document still has what a tab shows: a file, a picture, a file of the folder, the Pictures tab. */
  const has = (d: TexDoc, k: string) =>
    k === PICTURES || k === TEX_MAIN || (k.startsWith(PIC) ? d.pictures.some((p) => p.name === viewName(k)) : k.startsWith(DISK) ? diskUses.some((u) => u.name === viewName(k)) : d.files.some((f) => f.name === k));
  // Another document, or the agent's new version while nothing was changed here: start from it (the file in view at the
  // same place, as the agent's version being written was read).
  const keepPlace = useRef<{ file: string; line: number } | null>(null);
  useEffect(() => {
    if (!doc || dirtyRef.current) return;
    const shown = codes.current.get(file);
    keepPlace.current = shown ? { file, line: shown.topLine() } : null;
    setM(doc.model);
    setSaved(doc.model);
    setEpoch((e) => e + 1);
    const keep = has(doc.model, file) ? file : TEX_MAIN;
    setFile(keep);
    // The tabs open stay open, those the new version still has (their editors start again from it).
    setOpened((o) => keepTabs(o, doc.model, keep));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  const change = (f: (d: TexDoc) => TexDoc) => {
    const d = live.current;
    if (!d || readOnly) return;
    const n = f(d);
    if (n !== d) setM(n);
  };

  // ---- what the editors ask of the document (worked out once a change) -------------------------------------------
  const defsCache = useRef<{ d: TexDoc | null; defs: DocDefs; macros: Record<string, string>; refs: { labels: Set<string>; keys: Set<string> | null } | null }>({ d: null, defs: NO_DEFS, macros: {}, refs: null });
  const known = () => {
    const d = live.current;
    if (d && defsCache.current.d !== d) {
      const texts = [{ name: TEX_MAIN, text: d.main }, ...d.files];
      const tex = texts.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.text);
      defsCache.current = { d, defs: docDefs(texts), macros: texMacros(texts.filter((f) => /\.(tex|ltx|sty|cls)$/i.test(f.name)).map((f) => f.text)), refs: refsOf(d, tex) };
    }
    return defsCache.current;
  };
  const defsOf = () => known().defs;
  const macrosOf = () => known().macros;
  /**
   * What the quick check of references knows: every label of the document's files, and its bibliographies' keys when
   * they are all its own (\bibliography names only its .bib files, or \bibitem makes them); none when sources TeX takes
   * from the folder may define more.
   */
  function refsOf(d: TexDoc, tex: string[]): { labels: Set<string>; keys: Set<string> | null } | null {
    if (diskUses.some((u) => u.kind === 'tex')) return null;
    const names = tex.flatMap((t) => [...t.matchAll(/\\(?:bibliography|addbibresource)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)].flatMap((m) => m[1].split(',').map((x) => x.trim().replace(/^\.\//, ''))));
    const bibs = names.map((n) => (n.endsWith('.bib') ? n : `${n}.bib`));
    const own = bibs.length > 0 && bibs.every((b) => d.files.some((f) => f.name === b));
    const items = tex.flatMap((t) => [...t.matchAll(/\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/g)].map((m) => m[1].trim()));
    const keys = own || (!bibs.length && items.length) ? new Set([...items, ...bibs.flatMap((b) => bibKeys(d.files.find((f) => f.name === b)?.text ?? ''))]) : null;
    return { labels: docLabels(tex), keys };
  }
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
    for (const name of opened.filter((n) => !isView(n))) {
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
        // Its own setting: an agent's version shows read-only by itself (setLive), and the file is editable after.
        readOnly: !!readOnlyProp,
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
          // The file's tracked changes as its editor has them now, in the document beside the other files'.
          onTracked: (list) =>
            change((d) => {
              const next = [...(d.changes ?? []).filter((c) => c.file !== name), ...list.map((c) => ({ ...c, file: name }))];
              return next.length || d.changes ? { ...d, changes: next.length ? next : undefined } : d;
            }),
          onWrite: () => aiRef.current?.openWrite(),
          onPictures: (files) => !!aiRef.current?.pictures(files),
          refs: () => known().refs,
        },
        visual: modeRef.current === 'visual',
        spell: spellRef.current,
        keys: keysRef.current,
      }).then((c) => {
        mounting.current.delete(name);
        if (at !== epochRef.current || !hosts.current.get(name)?.isConnected) return c.destroy();
        codes.current.set(name, c);
        setMade((n) => n + 1);
        markCode(name, c);
        const place = keepPlace.current;
        if (place?.file === name) {
          keepPlace.current = null;
          if (place.line > 1) c.showLine(place.line);
        }
        const d = live.current;
        if (d?.track) c.setTrack(true);
        const mine = (d?.changes ?? []).filter((x) => x.file === name);
        if (mine.length) c.setTracked(mine);
        const after = afterMount.current.get(name);
        afterMount.current.delete(name);
        if (after) after(c);
      });
    }
  });
  const epochRef = useRef(epoch);
  epochRef.current = epoch;

  // The agent's version as it comes, in each file open (its caret in the file being written, brought into view unless
  // a file was picked or the source scrolled here lately); each file's own text again once it is saved, or failed.
  const pickedAt = useRef(0);
  const ownScroll = useOwnScroll(root);
  const mark = liveOn && agent?.mark?.kind === 'tex' ? agent.mark : null;
  useEffect(() => {
    if (mark && mark.file !== file && performance.now() - pickedAt.current > 4000 && (mark.file === TEX_MAIN || model?.files.some((f) => f.name === mark.file))) {
      if (!opened.includes(mark.file)) setOpened((o) => [...o, mark.file]);
      setFile(mark.file);
    }
  }, [mark?.file]);
  // The version it was shown over: when another comes in its place (the agent's, saved), the files mount again with it,
  // the agent's text shown until then (not the old one for a moment).
  const liveOver = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (liveTex) liveOver.current = doc?.key;
    const saved = !liveTex && liveOver.current !== undefined && liveOver.current !== doc?.key;
    for (const [name, c] of codes.current) {
      if (liveTex) c.setLive(textIn(liveTex, name), mark?.file === name ? mark.at : undefined, !ownScroll());
      else if (!saved) c.setLive(null);
    }
  }, [liveTex, made, epoch]);
  useEffect(() => {
    const mo = new MutationObserver(() => {
      for (const c of codes.current.values()) c.handle.setDark(isDark());
      setDark(isDark());
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  const open = (name: string) => {
    pickedAt.current = performance.now();
    if (name !== PICTURES) {
      if (!opened.includes(name)) setOpened((o) => [...o, name]);
      if (/\.(tex|ltx)$/i.test(name)) lastTex.current = name;
    }
    setFile(name);
    setMenu(null);
    setFilesSheet(false);
    if (!wide) setPane('source');
  };
  /** A file of the tree opened: a file's text in its editor, a picture or a file of the folder to look at. */
  const openEntry = (name: string) => {
    const d = live.current;
    if (!d) return;
    if (name === TEX_MAIN || d.files.some((f) => f.name === name)) open(name);
    else if (d.pictures.some((p) => p.name === name)) open(PIC + name);
    else if (diskUses.some((u) => u.name === name)) open(DISK + name);
  };
  /** A tab closed (its file's editor with it); the one beside it shows when it was in view. The last one stays. */
  const closeTab = (k: string) => {
    const i = opened.indexOf(k);
    const rest = opened.filter((x) => x !== k);
    if (i < 0 || !rest.length) return;
    if (!isView(k)) {
      codes.current.get(k)?.destroy();
      codes.current.delete(k);
    }
    setOpened(rest);
    if (file === k) setFile(rest[Math.min(i, rest.length - 1)]);
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
      const r = await typeset(m, lastGood.current, onDisk?.folder, undefined, { draft: optsRef.current.draft, halt: optsRef.current.halt });
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
  // Draft or Stop on the first error changed: kept on this device, and typeset again at once.
  const optsFirst = useRef(true);
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, opts.draft ? '1' : '0');
    localStorage.setItem(HALT_KEY, opts.halt ? '1' : '0');
    if (optsFirst.current) optsFirst.current = false;
    else void runRef.current(true);
  }, [opts]);
  /** Clear the cached files: what was kept of the typesettings goes, and the next starts afresh (no .aux or .bbl carried). */
  const clearCache = async () => {
    setMenu(null);
    const keys = [resultRef.current?.key, lastGood.current].filter((k): k is string => !!k);
    lastGood.current = undefined;
    typesetFor.current = null;
    try {
      if (keys.length) await clearTypesetting(keys);
      toast('The cached files are cleared: it typesets afresh', 'ok');
    } catch (e) {
      toastError(e);
    }
    void runRef.current(true);
  };
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
    const keep = saved && has(saved, file) ? file : TEX_MAIN;
    setFile(keep);
    setOpened((o) => (saved ? keepTabs(o, saved, keep) : [TEX_MAIN]));
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
  const codeInView = () => (isView(file) ? null : (codes.current.get(file) ?? null));
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
    const c = codeInView();
    if (!c || readOnly) return;
    // One change for each match (not one from the first to the last), so what is between them keeps its comments and
    // Track changes marks each word replaced; Undo takes them all back at once.
    const text = c.text();
    const list = findIn(text, find.query, find.options, Number.MAX_SAFE_INTEGER);
    if (!list.length) return;
    c.view.dispatch({ changes: list.map((m) => ({ from: m.s, to: m.e, insert: replacementOf(text, m, find.query, find.replacement, find.options) })), userEvent: 'input.replace.all' });
    toast(`Replaced ${list.length} time${list.length === 1 ? '' : 's'}`, 'ok');
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
    if (readOnly || isView(file)) return;
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
  // A file's comments as the app kept them when it came (what comments coming in later are merged against).
  const keptComments = useRef<TexComment[]>(doc?.model.comments ?? []);
  useEffect(() => {
    keptComments.current = doc?.model.comments ?? [];
  }, [doc?.key]);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  // A file's comments changed elsewhere (an agent answered one): in with the user's own, placed on their words as the
  // text is here; nothing to save when nothing was changed here.
  useEffect(() => {
    const inc = onDisk?.comments;
    const d = live.current;
    if (!inc || !d) return;
    const theirs = cleanTexComments(inc.list, d);
    const merged = mergeTexComments(keptComments.current, d.comments ?? [], theirs);
    keptComments.current = theirs;
    if (JSON.stringify(merged) === JSON.stringify(d.comments ?? [])) return;
    const next: TexDoc = { ...d, comments: merged.length ? merged : undefined };
    if (d === savedRef.current) setSaved(next);
    setM(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDisk?.comments?.n]);
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
        review={
          canTrack && (
            <ChangesList
              changes={model.changes ?? []}
              file={file}
              label={label}
              track={tracking}
              active={activeChange}
              readOnly={readOnly}
              onPick={pickChange}
              onAccept={(id) => decide([id], true)}
              onReject={(id) => decide([id], false)}
              onAll={(accept) => decide(null, accept)}
              onOpenFile={(name) => open(name)}
            />
          )
        }
        className={className}
      />
    );
  const openCount = model?.comments?.filter((c) => !c.resolved).length ?? 0;

  // ---- tracked changes ----------------------------------------------------------------------------------------------------
  // Kept with a document of the Library (a file of this computer keeps only its text).
  const canTrack = !onDisk;
  const tracking = !!model?.track;
  const [activeChange, setActiveChange] = useState<string | null>(null);
  useEffect(() => {
    for (const c of codes.current.values()) c.setTrack(tracking && canTrack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, made]);
  const toggleTrack = () => {
    if (readOnly || !canTrack) return;
    const on = !live.current?.track;
    change((d) => ({ ...d, track: on || undefined }));
    // What is marked shows beside the source, where there is room for it (a sheet over the source would be in the way).
    if (on && roomy) setCommentsOpen(true);
    toast(on ? 'Track changes is on: what you type and delete is marked' : 'Track changes is off', 'ok');
  };
  /** Changes accepted or rejected (`ids`: those, or null for all): in a file's editor, so Undo takes it back, else in the document. */
  const decide = (ids: string[] | null, accept: boolean) => {
    const d = live.current;
    if (!d || readOnly) return;
    const picked = (d.changes ?? []).filter((c) => !ids || ids.includes(c.id));
    for (const name of new Set(picked.map((c) => c.file))) {
      const mine = picked.filter((c) => c.file === name).map((c) => c.id);
      const c = codes.current.get(name);
      if (c) (accept ? c.acceptChanges : c.rejectChanges)(mine);
      else
        change((x) => {
          const n = texChangeOps(
            x,
            mine.map((id) => ({ id, [accept ? 'accept' : 'reject']: true })),
          );
          return n.comments?.length ? { ...n, comments: cleanTexComments(n.comments, n) } : n;
        });
    }
    if (!ids && picked.length) toast(accept ? `Accepted ${picked.length} change${picked.length === 1 ? '' : 's'}` : `Rejected ${picked.length} change${picked.length === 1 ? '' : 's'}`, 'ok');
  };
  const pickChange = (x: TexChange) => {
    setActiveChange(x.id);
    withCode(x.file, (c) => c.pickChange(x.id));
  };
  const changeCount = model?.changes?.length ?? 0;

  // ---- what an agent is asked about ------------------------------------------------------------------------------------
  const settled = useDeferredValue(model);
  const outline = useMemo(() => (settled ? texOutline(settled) : []), [settled]);

  // ---- the files tree: what the document uses, as TeX reads it (shared/latex-files.ts) ----------------------------------
  const usesCache = useRef<NonNullable<Parameters<typeof texDocUses>[1]>['cache']>(new Map());
  const uses: TexUses | null = useMemo(
    () => (settled ? texDocUses(settled, { others: diskUses.map((u) => u.name), alias: onDisk?.main, cache: usesCache.current }) : null),
    [settled, diskUses, onDisk?.main],
  );
  // A file of this computer's document: the files it came with were found used from the folder, also through what is
  // read only there (a style that reads a chapter), which this reading cannot see.
  const cameWith = useMemo(() => new Set(onDisk ? (doc?.model.files ?? []).map((f) => f.name) : []), [doc?.key]);
  const entries = useMemo((): TreeEntry[] => {
    if (!model) return [];
    const used = (n: string) => !uses || texIsUsed(uses, n) || cameWith.has(n);
    const own = new Set([...model.files.map((f) => f.name), ...model.pictures.map((p) => p.name)]);
    return [
      ...model.files.map((f): TreeEntry => ({ name: f.name, kind: texFileKind(f.name), where: 'text', used: used(f.name) })),
      ...model.pictures.map((p): TreeEntry => ({ name: p.name, kind: 'picture', where: 'picture', used: used(p.name) })),
      // What TeX takes from the folder was found used when the file was opened (also through its styles, which are not read here).
      ...diskUses.filter((u) => !own.has(u.name)).map((u): TreeEntry => ({ name: u.name, kind: u.kind, where: 'folder', used: true, size: u.size })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.files, model?.pictures, uses, diskUses, cameWith]);
  const readingOrder = useMemo(() => (uses ? [...uses.used.keys()] : []), [uses]);
  // A picture or a file of the folder in view that the document no longer has: its main file in its place.
  useEffect(() => {
    if (!model || !(file.startsWith(PIC) || file.startsWith(DISK)) || has(model, file)) return;
    setOpened((o) => {
      const left = o.filter((k) => has(model, k));
      return left.length ? left : [TEX_MAIN];
    });
    setFile(TEX_MAIN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.pictures, diskUses, file]);
  const heading = isView(file) ? null : headingAt(outline, file, cursor.line);
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
  const target = () => (!isView(file) && /\.(tex|ltx|sty|cls)$/i.test(file) ? file : lastTex.current);
  /** Every name the project has (the files TeX takes from the folder too): a new file may have none of them. */
  const allNames = () => (live.current ? [TEX_MAIN, ...live.current.files.map((f) => f.name), ...live.current.pictures.map((p) => p.name), ...diskUses.map((u) => u.name)] : []);
  /** A name in a folder ("figures/" + "plot.png"), another number when one there has it; null when it would be too long or deep. */
  const nameIn = (folder: string, name: string, kind: 'file' | 'picture', taken: string[]): string | null => {
    const n = folder ? freeName(folder + name, taken) : name;
    if (cleanTexName(n, kind) === n) return n;
    toast(`${n} is too long or too deep in folders for a document`);
    return null;
  };

  const addPictures = async (list: File[], folder = ''): Promise<string[]> => {
    const added: string[] = [];
    for (const f of list) {
      try {
        const p = await addPicture(f, [...allNames(), ...added]);
        const name = nameIn(folder, p.name, 'picture', [...allNames(), ...added]);
        if (!name) continue;
        change((d) => ({ ...d, pictures: [...d.pictures, { ...p, name }] }));
        added.push(name);
      } catch (e) {
        toastError(e);
      }
    }
    return added;
  };
  const choosePictures = async (folder = '') => {
    setMenu(null);
    const files = await chooseFiles(PICTURE_ACCEPT);
    if (files.length) toast(files.length === 1 ? 'Adding the picture…' : `Adding ${files.length} pictures…`);
    return addPictures(files, folder);
  };
  const addFiles = async (list: File[], folder = '') => {
    for (const f of list) {
      try {
        const x = await addFileFromDevice(f, allNames());
        const name = nameIn(folder, x.name, 'file', allNames());
        if (!name) continue;
        change((d) => ({ ...d, files: [...d.files, { ...x, name }] }));
        open(name);
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
      let p = c.pickedLines();
      // What does not take in the words picked goes after them, so they stay: a citation or a cross-reference after
      // the words, a table of contents, a page break, or a figure for several lines, after those lines.
      const after = id === 'cite' || id === 'ref' ? 'words' : id === 'toc' || id === 'newpage' || (id === 'figure' && p.text.includes('\n')) ? 'lines' : null;
      if (after && !p.empty) {
        const end = after === 'words' ? c.view.state.selection.main.to : c.view.state.doc.line(p.to).to;
        c.view.dispatch({ selection: { anchor: end } });
        p = c.pickedLines();
      }
      const at = c.cursor();
      const made = makeSnippet(id, p.empty ? '' : p.text, { picture, key, labels: docWords(live.current ?? model!).labels, prev: c.text().slice(Math.max(0, at - 1), at) });
      if (made.needs) editFile(TEX_MAIN, (t) => withPackages(t, made.needs!));
      // The lines picked are in it (a list's items, a quotation's lines): the whole lines go, it goes in their place.
      if (made.block && made.lines && !p.empty) c.replacePicked('');
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
  /** A reference added to the bibliography (and cited at the cursor): its key, '' when the entry could not be read. */
  const addReference = (e: TexReference, cite: boolean): string => {
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
    if (!key) {
      toast('That entry could not be read');
      return '';
    }
    setRefsTarget((x) => ({ ...x, name: t.name, fresh: false }));
    if (cite) {
      withCode(target(), (c) => {
        const before = c.text().slice(Math.max(0, c.cursor() - 1), c.cursor());
        c.insertText(`${before && !/\s|\{|~/.test(before) ? '~' : ''}\\cite{${key}}`);
      });
      toast(`Cited ${key}, added to ${t.name}`, 'ok');
    } else toast(`Added ${key} to ${t.name}`, 'ok');
    return key;
  };

  // ---- files and pictures ----------------------------------------------------------------------------------------------
  const nameProblem = (name: string, kind: 'file' | 'picture', from?: string): string | null => {
    const clean = cleanTexName(name, kind);
    if (!clean) return kind === 'file' ? 'Letters, digits, - _ . and / between folders, and an extension LaTeX reads (.tex, .bib, .sty…)' : 'Letters, digits, - _ . and / between folders, ending in .png or .jpg';
    if (clean === TEX_MAIN || allNames().some((n) => n.toLowerCase() === clean.toLowerCase() && n !== from)) return 'The document has a file of that name';
    if (allNames().some((n) => n.toLowerCase().startsWith(`${clean.toLowerCase()}/`))) return 'There is a folder of that name';
    return null;
  };
  /** A folder's path as typed ("chapters", "parts/one/"), with its slash; what is wrong with it, or null. `from`: the folder renamed. */
  const folderOfName = (raw: string) => `${raw.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '')}/`;
  const folderProblem = (raw: string, from?: string): string | null => {
    const path = folderOfName(raw);
    const probe = `${path}x.tex`;
    if (path === '/' || cleanTexName(probe, 'file') !== probe) return 'Letters, digits, - _ . and / between folders';
    if (from && path === from) return null;
    if (from && path.startsWith(from)) return 'A folder cannot go inside itself';
    const low = path.toLowerCase();
    if (allNames().some((n) => `${n.toLowerCase()}/` === low)) return 'The document has a file of that name';
    if (allNames().some((n) => n.toLowerCase().startsWith(low)) || madeFolders.some((m) => m.toLowerCase() === low)) return 'There is a folder of that name';
    return null;
  };
  /**
   * Files, pictures and folders renamed or moved (from → to): the references to them follow them (shared/latex-files.ts),
   * and their comments and tracked changes go with them. The editors of the files whose text changes start again from it.
   */
  const moveFiles = (moves: [string, string][]) => {
    const map = new Map(moves.filter(([a, b]) => a !== b));
    if (!map.size || readOnly) return;
    for (const c of codes.current.values()) c.destroy();
    codes.current.clear();
    change((d) => texMoveFiles(d, [...map]));
    const key = (k: string) => (k.startsWith(PIC) ? PIC + (map.get(viewName(k)) ?? viewName(k)) : isView(k) ? k : (map.get(k) ?? k));
    setOpened((o) => o.map(key));
    setFile((f) => key(f));
    if (map.has(lastTex.current)) lastTex.current = map.get(lastTex.current)!;
  };
  const renameFile = (from: string, to: string) => moveFiles([[from, to]]);
  const renamePicture = (from: string, to: string) => moveFiles([[from, to]]);
  /** What a folder holds: the files and pictures under it. */
  const inFolder = (path: string) => {
    const d = live.current;
    return d ? [...d.files.map((f) => f.name), ...d.pictures.map((p) => p.name)].filter((n) => n.startsWith(path)) : [];
  };
  const renameFolder = (from: string, to: string) => {
    const moves = inFolder(from).map((n): [string, string] => [n, to + n.slice(from.length)]);
    const bad = moves.find(([n, t]) => cleanTexName(t, live.current?.pictures.some((p) => p.name === n) ? 'picture' : 'file') !== t);
    if (bad) return toast(`${bad[1]} would be too long or too deep in folders for a document`);
    setMadeFolders((m) => m.map((x) => (x.startsWith(from) ? to + x.slice(from.length) : x)));
    moveFiles(moves);
  };
  /** Files and folders dragged into a folder ("" the top): each by its own name there; one whose name is taken there stays. */
  const moveInto = (names: string[], folder: string) => {
    const d = live.current;
    if (!d || readOnly) return;
    const moves: [string, string][] = [];
    for (const n of names) {
      if (n.endsWith('/')) {
        const to = `${folder}${n.slice(0, -1).split('/').pop()}/`;
        moves.push(...inFolder(n).map((x): [string, string] => [x, to + x.slice(n.length)]));
        setMadeFolders((m) => m.map((x) => (x.startsWith(n) ? to + x.slice(n.length) : x)));
      } else moves.push([n, folder + n.split('/').pop()]);
    }
    const leaving = new Set(moves.map(([a]) => a));
    const taken = new Set(allNames().filter((x) => !leaving.has(x)).map((x) => x.toLowerCase()));
    const fine = moves.filter(([a, t]) => !taken.has(t.toLowerCase()) && cleanTexName(t, d.pictures.some((p) => p.name === a) ? 'picture' : 'file') === t);
    if (fine.length < moves.length) toast(fine.length ? 'Some were not moved: a file of their name is there, or the folders would go too deep' : 'Not moved: a file of that name is there, or the folders would go too deep');
    moveFiles(fine);
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
  const removePicture = async (name: string) => {
    if (!(await confirm({ title: `Remove ${name}?`, body: 'The document no longer has it; where \\includegraphics names it, typesetting says so.', confirm: 'Remove', danger: true }))) return;
    setOpened((o) => o.filter((n) => n !== PIC + name));
    if (file === PIC + name) setFile(TEX_MAIN);
    change((d) => ({ ...d, pictures: d.pictures.filter((p) => p.name !== name) }));
  };
  /** A folder deleted, with the files and pictures in it (an older version still has them). */
  const deleteFolder = async (path: string) => {
    const gone = inFolder(path);
    if (gone.length) {
      const n = gone.length;
      if (!(await confirm({ title: `Delete the folder ${path.slice(0, -1)}?`, body: `Its ${n === 1 ? 'file goes' : `${n} files go`} from the document (an older version still has ${n === 1 ? 'it' : 'them'}).`, confirm: 'Delete', danger: true }))) return;
    }
    const doomed = new Set(gone);
    for (const n of gone) {
      codes.current.get(n)?.destroy();
      codes.current.delete(n);
    }
    setOpened((o) => {
      const left = o.filter((k) => !doomed.has(viewName(k)));
      return left.length ? left : [TEX_MAIN];
    });
    if (doomed.has(viewName(file))) setFile(TEX_MAIN);
    if (doomed.has(lastTex.current)) lastTex.current = TEX_MAIN;
    setMadeFolders((m) => m.filter((x) => !x.startsWith(path)));
    change((d) => ({ ...d, files: d.files.filter((f) => !doomed.has(f.name)), pictures: d.pictures.filter((p) => !doomed.has(p.name)) }));
  };
  /** New things from the tree's + or a folder's ⋯, into `folder` ("" the top). */
  const onNew: TreeActions['onNew'] = (what, folder) => {
    if (readOnly) return;
    if (what === 'file') setNaming({ kind: 'new', folder });
    else if (what === 'folder') setNaming({ kind: 'new-folder', folder });
    else if (what === 'device') void chooseFiles(FILE_ACCEPT).then((l) => addFiles(l, folder));
    else
      void choosePictures(folder).then((added) => {
        // Shown where they are, to put in a figure.
        if (added[0]) open(PIC + added[0]);
      });
  };

  // Files dropped in: pictures (and a figure for each where the cursor is, when dropped on the source), other files as files.
  const onDrop = async (e: React.DragEvent) => {
    const list = [...e.dataTransfer.files];
    if (!list.length || readOnly) return;
    e.preventDefault();
    const pics = list.filter((f) => f.type.startsWith('image/') || /\.pdf$/i.test(f.name));
    const texts = list.filter((f) => !pics.includes(f));
    const onCode = !!(e.target as HTMLElement).closest?.('.cm-editor');
    // Pictures dropped on the source: a figure each (under figures/), or their LaTeX (it asks which).
    if (onCode && pics.length && pics.every((f) => f.type.startsWith('image/')) && aiRef.current?.pictures(pics)) return void (await addFiles(texts));
    const added = await addPictures(pics, onCode ? 'figures/' : '');
    if (onCode) for (const p of added) await insert('figure', { picture: p });
    if (added.length && !onCode) toast(added.length === 1 ? (multi ? `${added[0]} added` : `${added[0]} added under Pictures`) : `${added.length} pictures added`, 'ok');
    await addFiles(texts);
  };
  /** Files from the device dropped on a folder of the tree: pictures and files into it. */
  const dropInto = async (list: File[], folder: string) => {
    if (readOnly) return;
    const pics = list.filter((f) => f.type.startsWith('image/') || /\.pdf$/i.test(f.name));
    const added = await addPictures(pics, folder);
    if (added.length) toast(added.length === 1 ? `${added[0]} added` : `${added.length} pictures added`, 'ok');
    await addFiles(
      list.filter((f) => !pics.includes(f)),
      folder,
    );
  };
  const treeActions: TreeActions = {
    onOpen: openEntry,
    onNew,
    onRename: (n) => setNaming({ kind: n.endsWith('/') ? 'rename-folder' : live.current?.pictures.some((p) => p.name === n) ? 'rename-picture' : 'rename-file', from: n }),
    onDelete: (n) => void (n.endsWith('/') ? deleteFolder(n) : live.current?.pictures.some((p) => p.name === n) ? removePicture(n) : deleteFile(n)),
    onMove: moveInto,
    onDropFiles: (list, folder) => void dropInto(list, folder),
  };

  // ---- AI (ai.tsx) --------------------------------------------------------------------------------------------------------
  const ai = useLatexAi({
    readOnly,
    target,
    codeOf: (name) => codes.current.get(name) ?? null,
    withCode,
    editFile,
    live: () => live.current,
    tracking: tracking && canTrack,
    canTrack,
    picked: cursor.picked && !isView(file),
    heading,
    label,
    macros: macrosOf,
    result: () => resultRef.current,
    addReference,
    showChanges: () => setCommentsOpen(true),
    asFigures: async (files) => {
      // A picture pasted from the clipboard is "image.png": it goes in as pasted.png (pasted-2.png…).
      const named = files.map((f) => (/^image\.\w+$/i.test(f.name) ? new File([f], f.name.replace(/^image/i, 'pasted'), { type: f.type }) : f));
      const added = await addPictures(named, 'figures/');
      for (const p of added) await insert('figure', { picture: p });
    },
  });
  aiRef.current = ai;

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
  const code = codes.current.get(file);

  const showInPdf = async () => {
    const r = resultRef.current;
    if (!r?.pdf || isView(file)) return;
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
  /** Edit → Tidy the source (shared/latex-tidy.ts): the lines picked, or the whole file; line by line, never tracked. */
  const tidySource = () => {
    const c = codes.current.get(file);
    if (!c || readOnly) return;
    const text = c.text();
    const p = c.pickedLines();
    const r = tidyTex(text, p.empty ? {} : { from: p.from, to: p.to });
    if (!r.lines) return toast('The source is tidy already');
    const before = text.split('\n');
    const after = r.text.split('\n');
    const edits: { from: number; to: number; insert: string }[] = [];
    let pos = 0;
    before.forEach((l, i) => {
      if (l !== after[i]) edits.push({ from: pos, to: pos + l.length, insert: after[i] });
      pos += l.length + 1;
    });
    c.edit(edits, { quiet: true });
    toast(r.tables ? tr(`Tidied ${r.lines} line${r.lines === 1 ? '' : 's'}; ${r.tables} table${r.tables === 1 ? '' : 's'} lined up`) : tr(`Tidied ${r.lines} line${r.lines === 1 ? '' : 's'}`), 'ok');
  };
  const canCompare = !onDisk && !!pageId;
  /** Tidy the bibliography: the .bib in view, else the one the document reads. */
  const [bibTidy, setBibTidy] = useState('');
  const openBibTidy = () => {
    setMenu(null);
    const t = file.endsWith('.bib') ? { name: file, fresh: false } : bibTarget();
    if (t.fresh) return toast('The document has no bibliography of its own yet');
    setBibTidy(t.name);
    setDialog('bib');
  };
  /** Tools → Name this version: the latest version (saved first when there are changes) named, for Compare versions and Versions. */
  const nameThisVersion = async (name: string) => {
    setNameAsk(false);
    if (!pageId || (dirty && !(await save()))) return;
    try {
      const v = (await api<{ versions: PageVersion[] }>(`/api/pages/${enc(pageId)}`)).versions[0]?.version;
      if (!v) return;
      await nameVersion(pageId, v, name);
      toast(tr(`Version ${v} is named “${name}”`), 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  // Documents in the Library keep their comments; a file of this computer has its comments kept by the app.
  const canComment = true;

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
        { label: 'Tidy the source', also: 'format indent align table columns latexindent prettify', disabled: !code || readOnly || !/\.(tex|ltx|sty|cls)$/i.test(file), run: tidySource },
        ...(ai.editItems.length ? ['-' as const, ...ai.editItems] : []),
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
            { label: 'Reference from the web', icon: <BookPlus size={14} />, also: 'doi arxiv bibliography bibtex crossref paper', run: openRefs },
            { label: 'Citation', icon: <BookOpen size={14} />, also: 'cite', run: () => void insert('cite') },
            { label: 'Cross-reference', icon: <LocateFixed size={14} />, also: 'ref label', run: () => void insert('ref') },
            canComment && { label: 'Comment', icon: <MessageSquarePlus size={14} />, keys: 'Ctrl+Alt+M', also: 'note review', disabled: isView(file), run: addComment },
            '-',
            ...ai.insertItems,
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
        { label: 'Files', icon: <FolderTree size={14} />, checked: wide ? panel === 'files' : undefined, also: 'tree project folders chapters pictures', run: () => (wide ? togglePanel('files') : setFilesSheet(true)) },
        { label: 'Outline', icon: <ListTree size={14} />, checked: wide ? panel === 'outline' : undefined, also: 'sections headings', run: () => (wide ? togglePanel('outline') : setMenu('outline')) },
        canComment && { label: 'Comments', icon: <MessageSquare size={14} />, checked: commentsOpen, also: 'review notes', run: () => setCommentsOpen((x) => !x) },
        { label: 'Check spelling', icon: <SpellCheck size={14} />, checked: spell, also: 'spell', run: () => setSpell((x) => !x) },
        {
          label: 'Keys',
          icon: <Keyboard size={14} />,
          also: 'vim emacs keybindings keymap',
          items: (
            [
              ['normal', 'Normal'],
              ['vim', 'Vim'],
              ['emacs', 'Emacs'],
            ] as const
          ).map(([id, label]) => ({ label, checked: keys === id, run: () => setKeys(id) })),
        },
        { label: 'Fold all', icon: <FoldVertical size={14} />, keys: 'Ctrl+Alt+[', disabled: !code, also: 'collapse', run: () => code?.foldAll() },
        { label: 'Unfold all', icon: <UnfoldVertical size={14} />, keys: 'Ctrl+Alt+]', disabled: !code, also: 'expand', run: () => code?.unfoldAll() },
        '-',
        setup?.sync !== false && { label: 'Show this line in the PDF', icon: <LocateFixed size={14} />, disabled: !result?.pdf || isView(file), also: 'synctex', run: () => void showInPdf() },
        { label: 'Dark pages', icon: <Moon size={14} />, checked: darkPages && dark, disabled: !dark, also: 'night invert', run: () => setDarkPages((x) => !x) },
        { label: 'Present the pages', icon: <Presentation size={14} />, disabled: !result?.pdf, also: 'full screen slides', run: () => setPresentAsk((n) => n + 1) },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Recompile now', icon: <Play size={14} />, keys: 'Ctrl+Enter', also: 'typeset compile', run: () => void run(true) },
        { label: 'Recompile as you type', checked: auto, also: 'auto compile', run: () => setAuto((a) => !a) },
        { label: 'Draft: pictures as boxes', checked: opts.draft, also: 'fast compile draft mode images', run: () => setOpts((o) => ({ ...o, draft: !o.draft })) },
        { label: 'Stop on the first error', checked: opts.halt, also: 'halt on error compile', run: () => setOpts((o) => ({ ...o, halt: !o.halt })) },
        { label: 'Clear the cached files', also: 'aux bbl cache fresh compile', run: () => void clearCache() },
        { label: 'Typeset with', also: 'engine', disabled: readOnly, items: TEX_ENGINES.map((x) => ({ label: x.label, checked: engine === x.id, run: () => pickEngine(x.id) })) },
        '-',
        ...paperItems({ ask: setPaperAsk, readOnly, canAsk: !!onAsk, canArxiv: !!pageId && !onDisk }),
        '-',
        ...ai.toolsItems,
        { label: 'Tidy the bibliography', icon: <BookPlus size={14} />, disabled: readOnly || !model.files.some((f) => f.name.endsWith('.bib')), also: 'bibtex sort duplicates keys doi unused clean', run: openBibTidy },
        { label: 'Word count', icon: <WholeWord size={14} />, also: 'words texcount', run: () => setDialog('count') },
        canCompare && { label: 'Compare versions', icon: <History size={14} />, also: 'diff history changes', run: () => setDialog('compare') },
        canCompare && { label: 'Name this version', icon: <Tag size={14} />, disabled: readOnly, also: 'history named version milestone label', run: () => setNameAsk(true) },
        '-',
        canTrack && { label: 'Track changes', icon: <FilePen size={14} />, checked: tracking, disabled: readOnly, also: 'review suggest suggestions tracked revisions', run: toggleTrack },
        canTrack && { label: 'Accept all changes', icon: <CheckCheck size={14} />, disabled: readOnly || !changeCount, also: 'tracked review', run: () => decide(null, true) },
        canTrack && { label: 'Reject all changes', icon: <X size={14} />, disabled: readOnly || !changeCount, also: 'tracked review', run: () => decide(null, false) },
        '-',
        { label: 'Show the log', icon: <ScrollText size={14} />, disabled: !result?.log, run: () => setLogOpen(true) },
        { label: 'Open the PDF', icon: <ExternalLink size={14} />, disabled: !result?.pdf, run: openPdf },
        !!onAsk && { label: 'Ask the agent', icon: <Sparkles size={14} />, also: 'lines section question help', run: askHere },
        !!onAsk && !readOnly && !!result?.errors.length && { label: 'Ask the agent to fix them', icon: <Sparkles size={14} />, also: 'errors', run: askFix },
        '-',
        { label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, also: 'keys', run: () => setDialog('keys') },
      ] as MenuEntry[],
    },
  ];

  // The toolbar: what fits the row, the most used first (the rest folds away, all of it in the menus too). Where the
  // source and the pages do not fit side by side, the row starts with the switch between them and Recompile; over
  // the pages it holds only those.
  const askLabel = cursor.picked && !isView(file) ? 'Ask the agent about these lines' : 'Ask the agent';
  const overPages = !wide && pane === 'preview';
  const tools: RowTool[] = ([
    !wide && {
      id: 'pane',
      rank: 0,
      group: 'pane',
      node: (
        <Segmented
          size="sm"
          value={pane}
          onChange={setPane}
          options={[
            { value: 'source', label: 'LaTeX source' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
      ),
    },
    !wide && { id: 'compile', rank: 1, group: 'compile', node: compileButtons },
    !wide && { id: 'engine', rank: 12, group: 'compile', node: engineChip },
    !overPages && {
      id: 'mode',
      rank: 8,
      group: 'mode',
      node: (
        <Segmented
          size="sm"
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'code', label: 'Code' },
            { value: 'visual', label: 'Visual' },
          ]}
        />
      ),
    },
    !overPages &&
      !readOnly && {
        id: 'bold',
        rank: 2,
        group: 'insert',
        node: (
          <IconButton label="Bold (Ctrl+B)" size="sm" onClick={() => void insert('bold')}>
            <Bold size={15} />
          </IconButton>
        ),
      },
    !overPages &&
      !readOnly && {
        id: 'italic',
        rank: 3,
        group: 'insert',
        node: (
          <IconButton label="Italic (Ctrl+I)" size="sm" onClick={() => void insert('italic')}>
            <Italic size={15} />
          </IconButton>
        ),
      },
    !overPages &&
      !readOnly && {
        id: 'symbols',
        rank: 5,
        group: 'insert',
        node: (
          <IconButton ref={anchors.symbols} label="Symbols" size="sm" active={menu === 'symbols'} onClick={() => setMenu(menu === 'symbols' ? null : 'symbols')}>
            <Omega size={15} />
          </IconButton>
        ),
      },
    !overPages &&
      !readOnly && {
        id: 'equation',
        rank: 4,
        group: 'insert',
        node: (
          <IconButton label="Equation" size="sm" onClick={() => void insert('equation')}>
            <Sigma size={15} />
          </IconButton>
        ),
      },
    !overPages &&
      !readOnly && {
        id: 'figure',
        rank: 6,
        group: 'insert',
        node: (
          <IconButton label="Figure with a picture" size="sm" onClick={() => void insert('figure')}>
            <ImagePlus size={15} />
          </IconButton>
        ),
      },
    !overPages && {
      id: 'outline',
      rank: 11,
      group: 'view',
      node: (
        <IconButton
          ref={anchors.outline}
          label="Outline"
          size="sm"
          active={wide ? panel === 'outline' : menu === 'outline'}
          onClick={() => (wide ? togglePanel('outline') : setMenu(menu === 'outline' ? null : 'outline'))}
        >
          <ListTree size={15} />
        </IconButton>
      ),
    },
    !overPages &&
      canComment && {
        id: 'comments',
        rank: 10,
        group: 'view',
        node: (
          <IconButton label="Comments" size="sm" active={commentsOpen} onClick={() => setCommentsOpen((x) => !x)} className="relative">
            <MessageSquare size={15} />
            {openCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-3.5 rounded-full bg-accent px-1 text-[9.5px] leading-3.5 font-semibold text-accent-fg tabular-nums">{openCount}</span>}
          </IconButton>
        ),
      },
    !overPages && {
      id: 'find',
      rank: 9,
      group: 'view',
      node: (
        <IconButton label="Find and replace (Ctrl+F)" size="sm" disabled={!code} active={find.open} onClick={() => (find.open ? find.close() : find.show())}>
          <Search size={15} />
        </IconButton>
      ),
    },
    !overPages &&
      setup?.sync !== false && {
        id: 'showpdf',
        rank: 13,
        group: 'view',
        node: (
          <IconButton label="Show this line in the PDF" size="sm" disabled={!result?.pdf || isView(file)} onClick={() => void showInPdf()}>
            <LocateFixed size={15} />
          </IconButton>
        ),
      },
    !overPages &&
      !!onAsk && {
        id: 'ask',
        rank: 7,
        group: 'ask',
        node: (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} className="text-accent" />} onClick={askHere} className="shrink-0">
            {askLabel}
          </Button>
        ),
        small: (
          <IconButton label={askLabel} size="sm" onClick={askHere}>
            <Sparkles size={15} className="text-accent" />
          </IconButton>
        ),
      },
    !overPages && ai.toolbar,
  ] as (RowTool | false)[]).filter((t): t is RowTool => !!t);
  const toolbar = (
    // While an agent's version shows, the toolbar stays where it is, out of use.
    <div inert={liveOn} className={cx('flex h-11 shrink-0 items-center border-b border-line bg-panel px-2', liveOn && 'opacity-45')}>
      <ToolRow tools={tools} className="flex-1" />
    </div>
  );

  const tabCls = (on: boolean) =>
    cx('relative flex h-9 shrink-0 items-center gap-1 px-2.5 text-[12.5px] transition-colors', on ? 'font-medium text-fg' : 'text-fg-3 hover:text-fg-2');
  /** A tab's name: its file's own name, with its folders when another tab open has the same name. */
  const tabName = (k: string) => {
    const full = isView(k) ? viewName(k) : label(k);
    const base = full.split('/').pop()!;
    return opened.some((o) => o !== k && (isView(o) ? viewName(o) : label(o)).split('/').pop() === base) ? full : base;
  };
  // A document of more than one file: the files open, each closable (the tree has them all), and Files where it is not in view.
  const fileTabs = multi ? (
    <div role="tablist" className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-line bg-bg px-1 [&::-webkit-scrollbar]:hidden">
      {!treeShown && (
        <Button size="sm" variant="ghost" icon={<FolderTree size={14} />} onClick={() => (wide ? showPanel('files') : setFilesSheet(true))} className="mr-0.5 h-7 shrink-0 px-2 text-[12.5px]">
          Files
        </Button>
      )}
      {opened.map((k) => (
        <div key={k} className="group/tab flex shrink-0 items-center">
          <button type="button" role="tab" aria-selected={file === k} onClick={() => open(k)} title={isView(k) ? viewName(k) : label(k)} className={tabCls(file === k)} translate="no">
            {isView(k) && <span className="text-fg-3">{kindIcon(texFileKind(viewName(k)), 13)}</span>}
            {tabName(k)}
            {file === k && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
          </button>
          {opened.length > 1 && (
            <IconButton label="Close" size="sm" onClick={() => closeTab(k)} className={cx('-ml-1.5 h-6 w-6', file === k ? '' : 'opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 pointer-coarse:hidden')}>
              <X size={12} />
            </IconButton>
          )}
        </div>
      ))}
      {!treeShown && !readOnly && <NewButton onNew={onNew} className="ml-0.5" />}
    </div>
  ) : (
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
      {!readOnly && <NewButton onNew={onNew} className="ml-0.5" />}
    </div>
  );

  // A picture or a file of the folder, in the source's place.
  const viewed = isView(file) && file !== PICTURES ? (entries.find((e) => e.name === viewName(file)) ?? null) : null;
  const dir = onDisk?.dir ?? onDisk?.folder;
  const fromDir = (n: string) => (dir ? `${dir}/${n}` : undefined);
  const pictureUrl = (n: string) => {
    const p = model.pictures.find((x) => x.name === n);
    return p ? (p.src.startsWith('naget-asset:') ? assetUrl(p.src) : p.src) : undefined;
  };
  const fileView = viewed && (
    <FileView
      key={viewed.name}
      entry={viewed}
      url={viewed.where === 'picture' ? pictureUrl(viewed.name) : viewed.kind === 'picture' && fromDir(viewed.name) ? mu(`/api/fs/raw?path=${encodeURIComponent(fromDir(viewed.name)!)}`) : undefined}
      textPath={viewed.where === 'folder' && viewed.kind !== 'picture' ? fromDir(viewed.name) : undefined}
      usedAt={uses?.used.get(viewed.name)}
      label={label}
      readOnly={readOnly}
      onGo={goTo}
      onInsert={() => void insert('figure', { picture: viewed.name })}
      onRename={() => setNaming({ kind: 'rename-picture', from: viewed.name })}
      onRemove={() => void removePicture(viewed.name)}
    />
  );
  const tree = (className?: string) => (
    <FileTree entries={entries} main={label(TEX_MAIN)} order={readingOrder} folders={madeFolders} current={file === PICTURES ? '' : viewName(file)} readOnly={readOnly} actions={treeActions} className={className} />
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
          <span className="flex-1" />
          <Button size="sm" variant="ghost" icon={<WandSparkles size={14} />} className="h-7 shrink-0 px-2 text-[12.5px]" onClick={openBibTidy}>
            Tidy
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {opened
            .filter((n) => !isView(n))
            .map((n) => (
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
          {fileView && <div className="absolute inset-0 flex flex-col bg-bg">{fileView}</div>}
          {find.open && !isView(file) && (
            <div className="absolute top-2 right-3 z-20 w-[min(440px,calc(100%-24px))]">
              <FindBar find={find} count={found.list.length} index={found.current} onNext={() => findGo(1)} onPrev={() => findGo(-1)} onReplace={readOnly ? undefined : replaceOne} onReplaceAll={readOnly ? undefined : replaceAll} />
            </div>
          )}
          {/* What AI made, to accept or leave (a rewrite, LaTeX written or read from a picture, a fix). */}
          {!isView(file) && ai.card}
        </div>
        {/* Proofreading, or the comments, beside the source where there is room (a sheet on a phone, below). */}
        {roomy && !isView(file) && ai.side()}
        {canComment && commentsOpen && roomy && !isView(file) && !ai.proofOpen && commentsPanel('w-64 shrink-0 border-l border-line bg-panel')}
      </div>
      <Problems
        result={result}
        open={problemsOpen}
        onToggle={() => setProblemsOpen((o) => !o)}
        onGo={(x) => x.file && x.line && goTo(x.file, x.line)}
        onLog={() => setLogOpen(true)}
        onAsk={onAsk && !readOnly ? askFix : undefined}
        name={label}
        ai={{ help: ai.problems.help, explain: ai.problems.explain, fix: readOnly ? undefined : ai.problems.fix }}
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

  const fileMenuName = !isView(file) && file !== TEX_MAIN ? file : null;

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
          {/* The menus beside the title, where the header has room for them; one button where it hasn't, which the
              title gives way to (the switch between the source and the pages is in the toolbar then). */}
          <MenuBar menus={menus} compact={roomy ? 'auto' : true} className={roomy ? undefined : 'shrink-0'} />
        </div>
        {wide && engineChip}
        {wide && compileButtons}
        {tail}
      </div>
      {band}
      {toolbar}
      <div className="relative flex min-h-0 flex-1">
        {/* One panel on the left: the files tree or the outline, a tab each. */}
        {wide && panel && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
            <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-line pr-1 pl-1.5">
              <button
                type="button"
                aria-pressed={panel === 'files'}
                onClick={() => showPanel('files')}
                className={cx('h-7 rounded-md px-2 text-[12.5px] transition-colors', panel === 'files' ? 'bg-bg-2 font-medium text-fg' : 'text-fg-3 hover:text-fg-2')}
              >
                Files
              </button>
              <button
                type="button"
                aria-pressed={panel === 'outline'}
                onClick={() => showPanel('outline')}
                className={cx('h-7 rounded-md px-2 text-[12.5px] transition-colors', panel === 'outline' ? 'bg-bg-2 font-medium text-fg' : 'text-fg-3 hover:text-fg-2')}
              >
                Outline
              </button>
              <span className="flex-1" />
              {panel === 'files' && !readOnly && <NewButton onNew={onNew} />}
            </div>
            {panel === 'files' ? (
              tree('min-h-0 flex-1')
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <OutlineList outline={outline} current={heading} onGo={(h) => goTo(h.file, h.line)} />
              </div>
            )}
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
      <Popover anchor={anchors.compile} open={menu === 'compile'} onClose={() => setMenu(null)} align="end" width={270} title="Typesetting">
        <MenuItem icon={<Play size={14} />} hint="Ctrl+Enter" onClick={() => (setMenu(null), void run(true))}>
          Recompile now
        </MenuItem>
        <MenuItem icon={<span className="h-3.5 w-3.5" />} checked={auto} onClick={() => setAuto((a) => !a)}>
          Recompile as you type
        </MenuItem>
        <MenuItem icon={<span className="h-3.5 w-3.5" />} checked={opts.draft} onClick={() => setOpts((o) => ({ ...o, draft: !o.draft }))}>
          Draft: pictures as boxes
        </MenuItem>
        <MenuItem icon={<span className="h-3.5 w-3.5" />} checked={opts.halt} onClick={() => setOpts((o) => ({ ...o, halt: !o.halt }))}>
          Stop on the first error
        </MenuItem>
        <MenuItem icon={<Eraser size={14} />} onClick={() => void clearCache()}>
          Clear the cached files
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<ScrollText size={14} />} disabled={!result?.log} onClick={() => (setMenu(null), setLogOpen(true))}>
          Show the log
        </MenuItem>
        <MenuItem icon={<ExternalLink size={14} />} disabled={!result?.pdf} onClick={openPdf}>
          Open the PDF
        </MenuItem>
        {/* How long the last one took, and the most one may take. */}
        <p className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-fg-3">
          {[result?.ms ? tr(`Typeset in ${(result.ms / 1000).toFixed(1)} s`) : '', setup?.timeLimit ? tr(`at most ${setup.timeLimit} s`) : ''].filter(Boolean).join(' · ')}
        </p>
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
        initial={freeName(`${naming?.folder ?? ''}chapter.tex`, allNames())}
        hint="A chapter (.tex, read with \input), a bibliography (.bib), a style (.sty)…; folders with /: chapters/intro.tex."
        check={(n) => nameProblem(n, 'file')}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          const name = cleanTexName(n, 'file')!;
          setNaming(null);
          change((d) => ({ ...d, files: [...d.files, { name, text: '' }] }));
          // Its editor takes the keys at once, to write in it.
          withCode(name, (c) => c.focus());
        }}
      />
      <NameDialog
        open={naming?.kind === 'new-folder'}
        title="A new folder"
        initial={naming?.folder ?? ''}
        hint="Folders inside it with /: figures/plots. It is kept once something is in it."
        check={(n) => folderProblem(n)}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          setNaming(null);
          const path = folderOfName(n);
          setMadeFolders((m) => [...m, path]);
          if (!wide) setFilesSheet(true);
        }}
      />
      <NameDialog
        open={naming?.kind === 'rename-folder'}
        title="Rename the folder"
        initial={naming?.from?.replace(/\/$/, '') ?? ''}
        hint="The files in it keep their names. Where the document names them (\input, \includegraphics…), their new place goes too."
        check={(n) => folderProblem(n, naming?.from)}
        onClose={() => setNaming(null)}
        onDone={(n) => {
          const from = naming!.from!;
          setNaming(null);
          const to = folderOfName(n);
          if (to !== from) renameFolder(from, to);
        }}
      />
      <NameDialog
        open={naming?.kind === 'rename-file'}
        title="Rename the file"
        initial={naming?.from ?? ''}
        hint="Where the document names it (\input, \include, \bibliography), the new name goes too. A folder with /: chapters/intro.tex."
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
      <WordCountDialog open={dialog === 'count'} onClose={() => setDialog(null)} doc={model} file={isView(file) ? TEX_MAIN : file} label={label} />
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
      {ai.dialogs}
      {dialog === 'bib' && (
        <BibTidyDialog
          open
          onClose={() => setDialog(null)}
          doc={model}
          bib={bibTidy}
          label={label}
          onApply={(text, renames) => {
            setDialog(null);
            editFile(bibTidy, () => text);
            if (Object.keys(renames).length) for (const n of [TEX_MAIN, ...model.files.filter((f) => /\.(tex|ltx)$/i.test(f.name)).map((f) => f.name)]) editFile(n, (t) => renameCites(t, renames));
            toast(tr(`${label(bibTidy)} is tidy`), 'ok');
          }}
        />
      )}
      <NameDialog
        open={nameAsk}
        title="Name this version"
        initial=""
        hint={dirty ? 'Your changes are saved first. The name shows in Compare versions and Versions, and a named version is kept past the newest 40.' : 'The name shows in Compare versions and Versions, and a named version is kept past the newest 40.'}
        check={(n) => (n.length > VERSION_NAME_MAX ? tr(`At most ${VERSION_NAME_MAX} characters`) : null)}
        onClose={() => setNameAsk(false)}
        onDone={(n) => void nameThisVersion(n)}
      />
      {/* Proofreading on a phone: a sheet from the bottom. */}
      {!roomy && ai.proofOpen && <div className="fixed inset-x-0 bottom-0 z-40 flex h-[60dvh] border-t border-line pb-[var(--safe-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">{ai.side('w-full')}</div>}
      <PaperTools
        ask={paperAsk}
        onClose={() => setPaperAsk(null)}
        doc={model}
        pageId={pageId}
        onDisk={onDisk}
        base={lastGood.current}
        dirty={dirty}
        save={save}
        readOnly={readOnly}
        canComment={canComment}
        label={label}
        onAsk={onAsk}
        goTo={goTo}
        editFile={editFile}
        setComments={setComments}
        showComments={() => setCommentsOpen(true)}
      />
      <Dialog
        open={filesSheet && !treeShown}
        onClose={() => setFilesSheet(false)}
        title={
          <span className="flex items-center gap-2">
            Files
            {!readOnly && <NewButton onNew={onNew} />}
          </span>
        }
        width={520}
      >
        {tree('-mx-3 max-h-[70dvh]')}
      </Dialog>
      <Dialog
        open={canComment && commentsOpen && !roomy && !isView(file)}
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

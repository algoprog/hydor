// A LaTeX document to write and typeset, as in Overleaf: its source beside its typeset pages. The source is in
// CodeMirror, a tab per file (main.tex, a bibliography, chapters; add, rename and delete them), with its pictures in
// a tab of their own (add them from the device or drop them in; each with the name \includegraphics gives it). It is
// typeset on this computer as you type (a moment after you stop; Ctrl+Enter at once, and that can be the only way),
// with the engine picked (pdfLaTeX, XeLaTeX, LuaLaTeX); its errors and warnings show under the source, each going to
// its line, with TeX's log a click away. An Insert menu puts snippets at the cursor, an outline goes to a section, a
// double click on a page goes to its source and Show in the PDF the other way. On a phone, Source and Preview are
// two tabs. Changes stay unsaved until Save (Ctrl+S), as a page's do.
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bold,
  BookOpen,
  ChevronDown,
  Copy,
  ExternalLink,
  FilePlus,
  FileUp,
  Footprints,
  Heading1,
  Heading2,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  LocateFixed,
  Pencil,
  Play,
  Plus,
  ScrollText,
  Search,
  Sigma,
  Sparkles,
  SquareFunction,
  Table2,
  Trash2,
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
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Segmented, Throbber, useConfirm } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { toast, toastError } from '../../../lib/store';
import type { AskScope, ModelEditorProps } from '../kinds';
import { addFileFromDevice, addPicture, assetUrl, chooseFiles, FILE_ACCEPT, freeName, pdfUrl, PICTURE_ACCEPT, placeOf, texSetup, typeset } from './api';
import { mountCode, type Code } from './code';
import { NameDialog, OutlineList, Problems, where } from './parts';
import { Preview, type Flash } from './Preview';
import { docWords, makeSnippet, SAMPLE_BIB, SNIPPETS, withBibliography, withPackages, type SnipId } from './snippets';

const AUTO_KEY = 'wa.tex.auto';
const OUTLINE_KEY = 'wa.tex.outline';
/** The Pictures tab, among the files'. */
const PICTURES = '#pictures';

const isDark = () => document.documentElement.classList.contains('dark');

const SNIP_ICONS: Record<SnipId, ReactNode> = {
  section: <Heading1 size={14} />,
  subsection: <Heading2 size={14} />,
  bold: <Bold size={14} />,
  italic: <Italic size={14} />,
  itemize: <List size={14} />,
  enumerate: <ListOrdered size={14} />,
  figure: <ImageIcon size={14} />,
  table: <Table2 size={14} />,
  equation: <Sigma size={14} />,
  align: <SquareFunction size={14} />,
  cite: <BookOpen size={14} />,
  footnote: <Footprints size={14} />,
  link: <Link2 size={14} />,
};

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

export function LatexEditor({ doc, layout, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef, file: onDisk }: ModelEditorProps<TexDoc>) {
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
  const [menu, setMenu] = useState<'insert' | 'engine' | 'compile' | 'add' | 'file' | 'outline' | null>(null);
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
  const [, setMade] = useState(0);
  /** What to do once a file's editor is there (an insertion asked for before it was). */
  const afterMount = useRef(new Map<string, (c: Code) => void>());
  const lastTex = useRef(TEX_MAIN);
  const anchors = { insert: useRef<HTMLButtonElement>(null), engine: useRef<HTMLButtonElement>(null), compile: useRef<HTMLButtonElement>(null), add: useRef<HTMLButtonElement>(null), file: useRef<HTMLButtonElement>(null), outline: useRef<HTMLButtonElement>(null) };

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
        },
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
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        void runRef.current(true);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

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
      if (id === 'bold') return c.wrap('\\textbf{', '}', 'bold');
      if (id === 'italic') return c.wrap('\\emph{', '}', 'italic');
      const p = c.picked();
      const made = makeSnippet(id, p.empty ? '' : p.text, { picture, key, labels: docWords(live.current ?? model!).labels });
      if (made.needs) editFile(TEX_MAIN, (t) => withPackages(t, made.needs!));
      if (made.block && !p.empty && (id === 'itemize' || id === 'enumerate' || id === 'align')) {
        // The lines picked become the list's items: the whole lines go.
        c.replacePicked('');
      }
      c.insert(made.template, made.block);
    });
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
  const toolbar = (
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
      {!wide && (
        <>
          {compileButtons}
          {engineChip}
          {sep}
        </>
      )}
      {!readOnly && (
        <>
          <Button ref={anchors.insert} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMenu(menu === 'insert' ? null : 'insert')} className={cx('shrink-0', menu === 'insert' && 'bg-bg-3')}>
            Insert
          </Button>
          <IconButton label="Bold (Ctrl+B)" size="sm" onClick={() => void insert('bold')}>
            <Bold size={15} />
          </IconButton>
          <IconButton label="Italic (Ctrl+I)" size="sm" onClick={() => void insert('italic')}>
            <Italic size={15} />
          </IconButton>
          <IconButton label="Section heading" size="sm" onClick={() => void insert('section')}>
            <Heading1 size={15} />
          </IconButton>
          <IconButton label="Equation" size="sm" onClick={() => void insert('equation')}>
            <Sigma size={15} />
          </IconButton>
          <IconButton label="Figure with a picture" size="sm" onClick={() => void insert('figure')}>
            <ImagePlus size={15} />
          </IconButton>
          {sep}
        </>
      )}
      <IconButton
        ref={anchors.outline}
        label="Outline"
        size="sm"
        active={wide ? outlineOpen : menu === 'outline'}
        onClick={() => (wide ? setOutlineOpen((o) => !o) : setMenu(menu === 'outline' ? null : 'outline'))}
      >
        <ListTree size={15} />
      </IconButton>
      <IconButton label="Find and replace (Ctrl+F)" size="sm" disabled={!code} onClick={() => code?.handle.find()}>
        <Search size={15} />
      </IconButton>
      {setup?.sync !== false && (
        <IconButton
          label="Show this line in the PDF"
          size="sm"
          disabled={!result?.pdf || file === PICTURES}
          onClick={async () => {
            const r = resultRef.current;
            if (!r?.pdf) return;
            try {
              const at = await placeOf(r.key, file, cursor.line);
              if (!at) return toast('That line has nothing on the pages');
              if (!wide) setPane('preview');
              setFlash({ ...at, n: Date.now() });
            } catch (e) {
              toastError(e);
            }
          }}
        >
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
      <div className="relative min-h-0 flex-1">
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
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        {!wide && (
          <Segmented
            size="sm"
            value={pane}
            onChange={setPane}
            options={[
              { value: 'source', label: 'Code' },
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

      <Popover anchor={anchors.insert} open={menu === 'insert'} onClose={() => setMenu(null)} width={260} title="Insert">
        {SNIPPETS.map((s) => (
          <MenuItem key={s.id} icon={SNIP_ICONS[s.id]} hint={<span className="font-mono">{s.hint}</span>} onClick={() => void insert(s.id)}>
            {s.label}
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={anchors.engine} open={menu === 'engine'} onClose={() => setMenu(null)} width={300} title="Typeset with">
        {TEX_ENGINES.map((x) => {
          const why = setup?.notes[x.id];
          return (
            <MenuItem
              key={x.id}
              checked={engine === x.id}
              onClick={() => {
                setMenu(null);
                if (why && x.id !== engine) toast(why);
                if (x.id === engine) return;
                quick.current = true;
                change((d) => ({ ...d, engine: x.id as TexEngine }));
              }}
            >
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
        <MenuItem
          icon={<ExternalLink size={14} />}
          disabled={!result?.pdf}
          onClick={() => {
            setMenu(null);
            if (result?.pdf) window.open(pdfUrl(result.key), '_blank', 'noreferrer');
          }}
        >
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
      {confirmNode}
    </div>
  );
}

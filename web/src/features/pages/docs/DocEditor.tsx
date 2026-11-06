// A document to read and edit as in Word or Google Docs: its sheet of paper (its size and margins; on a phone the
// words fill the screen's width), edited in place (engine.ts), with the menus (Edit, View, Insert, Format, Tools,
// and Search the menus) beside its title and the toolbar over it (menu.tsx, Toolbar.tsx), its headings beside it on a wide screen
// (folded away on a narrow one) to go to, and the words it has in a quiet corner (a click there counts them all). A
// page break shows as a gap between two sheets, the header and footer on each sheet's margins. A picture picked gets
// handles to size it and a bar for its alignment, caption and description, and changes with AI (Picture.tsx); Insert and
// "/" put in pictures made with AI, drawings (SVG) and plots (a table's cells their data), the app's AI tools' dialogs
// (features/images/studio) asking what to make and showing what it costs; a table, handles on its
// columns' borders. Words picked offer to comment on them or ask the agent about them; comments show beside the page
// on a wide screen, level with their words, or in a panel (CommentsView.tsx). "/" at a line's start opens a menu of
// what to put there (Slash.tsx); Ctrl+F finds and Ctrl+H replaces (finding.ts); equations are written in a box with
// their preview. The page around is told what an agent asked now would be about (the whole document, the section
// the caret is in, the words picked). Changes stay unsaved until Save (Ctrl+S), as a page's do; the paper, margins,
// font and size are under Page setup. While an agent writes a new version (live.ts), it shows as it comes, read-only,
// with the agent's caret where its words arrive, kept in view (AgentCaret.tsx).
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileCog, Link2, ListTree, MessageSquare, MessageSquarePlus, Sparkles, Unlink } from 'lucide-react';
import { columnMm, paperOf, docHeadings, docWords, FONTS, MARGINS, PAPERS, runsText, sectionOf, wordCount, wordsText, type Doc, type ImageBlock, type Run, type TableBlock } from '@shared/docs';
import { newCommentId, openComments, type Comment } from '@shared/comments';
import { changesOf, compareDocs, suggestionColor } from '@shared/doc-changes';
import { api, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { toast, toastError, useUI } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { LOCALE } from '../../../i18n/locale';
import { Button, cx, IconButton, Popover, Segmented, useConfirm, useMediaQuery } from '../../../components/ui';
import { loadModelVersion, type AskScope, type ModelEditorProps } from '../kinds';
import type { PageVersion } from '@shared/pages';
import { SIGNATURE_WIDTH_MM } from '@shared/signatures';
import { choosePicture, pictureFromUrl, uploadPicture } from '../pictures';
import { choosePhoto } from '../FreePhotos';
import { csvOf, editPicture, makeDrawing, makePicture, makePlot } from '../../images/studio';
import type { EditorHandle } from '../../mediaedit/host';
import { editKept } from '../../mediaedit/open';
import { NumInput } from '../slides/controls';
import { Select } from '../studio/fields';
import { CharPicker } from '../common/CharPicker';
import { FindBar, useFind } from '../common/FindBar';
import { loadKatex, texHtmlNow } from '../common/katex';
import { MenuBar } from '../common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import { inputCls } from '../../../components/ui';
import { openTypes } from '../types';
import { AgentCaret } from './AgentCaret';
import { BlockHandle } from './BlockHandle';
import { CommentsColumn, CommentsPanel, type CommentActions, type Draft, type Extra } from './CommentsView';
import { CompareView, VersionsDialog } from './Compare';
import { editorCss, paperPx, useDocFonts } from './css';
import { BandsDialog, EquationBox, SpacingDialog, WordCountDialog, type Counts } from './Dialogs';
import { DocEngine, type AtomClick, type SelState } from './engine';
import { useDocFind } from './finding';
import { docMenus, PAGE_NUMBERS, type Zoom } from './menu';
import { fixDoc, runsBetween, sameDoc, type Pos } from './ops';
import { GAP, Paging, type Layout } from './paging';
import { Bands, Sheets } from './PaperSheets';
import { Picked } from './Picture';
import { SuggestionCard } from './Suggestions';
import { slashAt, slashItems, slashLayout, slashMatches, SlashMenu } from './Slash';
import { ColumnHandles, printDoc } from './TableTools';
import { Toolbar } from './Toolbar';
import { EndNotes, NoteBox, noteRoom, PageNotes } from './Notes';
import { CiteBox, CiteDialog, withSource } from './Citations';
import { putAfter } from './ai/WriteBox';
import { BIB_TITLES } from '@shared/doc-cite';
import { citeItems, citeOf, normalizeBlocks, type CiteStyle, type Source } from '@shared/docs';
import type { Pos as DocPos } from './ops';
import { useDocAi } from './ai/useDocAi';

// Insert → Signature: the saved signatures and the pad, loaded when first opened.
const InsertSignature = lazy(() => import('../../signatures/InsertSignature').then((m) => ({ default: m.InsertSignature })));

const OUTLINE_KEY = 'wa.docs.outline';
const VIEW_KEY = 'wa.docs.view';
/** The comments' column beside the page, and the room around it. */
const COLUMN = 280;

/** Where a picture of a document shows from in the app (whose own pages load no picture from the web). */
const pictureSrc = (s: string) =>
  s.startsWith('naget-asset:') ? mu(`/api/pages/assets/${s.slice('naget-asset:'.length)}`) : /^https?:/i.test(s) ? mu(`/api/pages/picture?url=${encodeURIComponent(s)}`) : s;

/** A picture from the web (or inside pasted words) kept by the app: its kept source. */
const takeIn = (src: string) => post<{ src: string }>('/api/pages/assets', src.startsWith('data:') ? { data: src } : { url: src }).then((r) => r.src);

const short = (s: string, n = 48) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Maths as KaTeX draws it, once it has loaded (until then, its LaTeX, quietly). */
const drawMath = (tex: string, display: boolean) => texHtmlNow(tex, display) ?? `<span class="nd-math-wait">${tex.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</span>`;

/** Where a section made with AI goes, in words for the agent: after the section the caret is in, unless its kind belongs elsewhere. */
function sectionPlace(doc: Doc, index: number): string | undefined {
  const sec = sectionOf(doc, index);
  return sec ? `after the section “${short(sec.text, 80)}” (where the cursor is), unless this kind of section belongs elsewhere in the document` : undefined;
}

/** What an agent asked now would be about: the document, the section the caret is in, the words or the picture picked. */
function scopesOf(doc: Doc, st: SelState): AskScope[] {
  const out: AskScope[] = [{ id: 'doc', label: tr('The whole document'), lead: '' }];
  const sec = sectionOf(doc, st.index);
  const where = sec ? ` (in the section “${short(sec.text, 80)}”)` : '';
  if (sec) out.push({ id: 'section', label: `${tr('This section')}: ${short(sec.text, 40)}`, lead: `In the section “${short(sec.text, 80)}”: ` });
  if (st.picked?.type === 'image') {
    const p = st.picked as ImageBlock;
    const what = p.caption || p.alt;
    // Its source too, for the picture tools (edit_image, generate_image…) to work from it.
    const src = p.src?.startsWith('naget-asset:') ? ` (${p.src})` : '';
    out.push({ id: 'picture', label: tr('The picture picked'), lead: `About the picture${what ? ` “${short(what, 80)}”` : ''}${src}${where}: ` });
  } else if (st.text.trim()) out.push({ id: 'words', label: tr('The words picked'), lead: `About the words “${short(st.text, 160)}”${where}: ` });
  return out;
}

interface ViewPrefs {
  zoom: Zoom;
  spell: boolean;
  count: boolean;
  comments: boolean;
  /** Suggest as I type (the helper model's next words, grey after the caret): off unless turned on. */
  ghost: boolean;
}

function loadView(): ViewPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
    if (v && typeof v === 'object')
      return { zoom: v.zoom === 'fit' || (typeof v.zoom === 'number' && v.zoom >= 0.25 && v.zoom <= 4) ? v.zoom : 1, spell: v.spell !== false, count: v.count !== false, comments: v.comments !== false, ghost: v.ghost === true };
  } catch {}
  return { zoom: 1, spell: true, count: true, comments: true, ghost: false };
}

/** The editor's keys, for the shortcuts dialog. */
const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Common',
    items: [
      ['Ctrl+S', 'Save'],
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z', 'Redo'],
      ['Ctrl+F', 'Find'],
      ['Ctrl+H', 'Find and replace'],
      ['Ctrl+P', 'Print'],
      ['Ctrl+Shift+V', 'Paste without formatting'],
      ['Ctrl+Shift+C', 'Word count'],
      ['Ctrl+/', 'Keyboard shortcuts'],
      ['Alt+/', 'Search the menus'],
    ],
  },
  {
    title: 'Text',
    items: [
      ['Ctrl+B', 'Bold'],
      ['Ctrl+I', 'Italic'],
      ['Ctrl+U', 'Underline'],
      ['Ctrl+Shift+X', 'Strikethrough'],
      ['Ctrl+.', 'Superscript'],
      ['Ctrl+,', 'Subscript'],
      ['Ctrl+K', 'Link'],
      ['Ctrl+J', 'Write with AI (Space on an empty line too)'],
      ['Ctrl+\\', 'Clear the formatting'],
      ['Ctrl+Alt+M', 'Comment'],
      ['Ctrl+Alt+F', 'Footnote'],
      ['Ctrl+Alt+Shift+X', 'Suggesting, or editing again'],
    ],
  },
  {
    title: 'Paragraphs',
    items: [
      ['Ctrl+Alt+0', 'Normal text'],
      ['Ctrl+Alt+1', 'Heading 1'],
      ['Ctrl+Alt+2', 'Heading 2'],
      ['Ctrl+Alt+3', 'Heading 3'],
      ['Ctrl+Alt+4', 'Heading 4'],
      ['Ctrl+Shift+7', 'Numbered list'],
      ['Ctrl+Shift+8', 'Bulleted list'],
      ['Ctrl+Shift+9', 'Checklist'],
      ['Ctrl+Shift+L', 'Align left'],
      ['Ctrl+Shift+E', 'Centre'],
      ['Ctrl+Shift+R', 'Align right'],
      ['Ctrl+Shift+J', 'Justify'],
      ['Tab', 'More indent (in a table: the next cell)'],
      ['Shift+Tab', 'Less indent'],
      ['Ctrl+Enter', 'A page break'],
      ['Shift+Enter', 'A new line in the same paragraph'],
    ],
  },
  {
    title: 'Typed at the start of a line',
    items: [
      ['/', 'The menu of what to put there'],
      ['# Space', 'Heading 1 (## for Heading 2…)'],
      ['- Space', 'Bulleted list'],
      ['1. Space', 'Numbered list'],
      ['[] Space', 'Checklist'],
      ['> Space', 'Quote'],
      ['--- Enter', 'A line across'],
      ['``` Enter', 'Code'],
    ],
  },
];

/** A place words are typed in. */
const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text') || (t instanceof HTMLElement && t.isContentEditable);

export function DocEditor({ doc, pageId, layout, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onRequest, onScopes, saveNowRef, live }: ModelEditorProps<Doc>) {
  const [model, setModel] = useState<Doc | null>(() => (doc?.model ? fixDoc(doc.model) : live?.model ? fixDoc(live.model) : null));
  const [saved, setSaved] = useState<Doc | null>(model);
  const [st, setSt] = useState<SelState | null>(null);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState<{ url: string; text: string } | null>(null);
  const [menu, setMenu] = useState<'page' | 'outline' | 'url' | null>(null);
  const [url, setUrl] = useState('');
  const [outlineOpen, setOutlineOpen] = useState(() => localStorage.getItem(OUTLINE_KEY) !== '0');
  const [view, setView] = useState<ViewPrefs>(loadView);
  const [width, setWidth] = useState(1200);
  const [words, setWords] = useState(0);
  const [float, setFloat] = useState<{ ask?: { x: number; y: number }; link?: { x: number; y: number } } | null>(null);
  const [dialog, setDialog] = useState<'count' | 'spacing' | 'bands' | 'keys' | 'signature' | null>(null);
  const [counts, setCounts] = useState<Counts & { picked: boolean }>({ words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0, pages: 1, picked: false });
  const [panel, setPanel] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  // Whether the Ask about this document panel shows (the AI hook's, mirrored for the layout worked out before it runs).
  const [askOpen, setAskOpen] = useState(false);
  // Editing (changes are made) or Suggesting (changes are suggested, as Google Docs' Suggesting and Word's Track changes).
  const [mode, setMode] = useState<'edit' | 'suggest'>('edit');
  // The document compared with a version (Tools → Compare with a version, or an older version opened from the
  // Library's Versions, compared with the latest), and the list of versions to pick one from.
  const [compare, setCompare] = useState<{ version: number; at?: number; merged: Doc; from: 'tools' | 'versions' } | null>(null);
  const [versions, setVersions] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tops, setTops] = useState<Map<string, number>>(new Map());
  const [eq, setEq] = useState<{ kind: 'block'; id: string; tex: string } | { kind: 'run'; at: Pos; tex: string } | { kind: 'new'; inline: boolean } | null>(null);
  const [chars, setChars] = useState<{ kind: 'insert' } | { kind: 'icon'; id: string } | null>(null);
  // A footnote's words being changed in their box (`undo`: a new one's mark goes again when it is left empty).
  const [note, setNote] = useState<{ id: string; undo?: Doc } | null>(null);
  // A citation's box (clicked), and the dialog that finds a source to cite (`add`: for the citation clicked).
  const [cite, setCite] = useState<{ at: DocPos; t: string } | null>(null);
  const [citeFind, setCiteFind] = useState<{ add?: { at: DocPos; t: string } } | null>(null);
  /** Words being typed beside the page (a comment, a reply, an edit of one). */
  const [noting, setNoting] = useState(false);
  // The picture editors opened from this document: once it closes, what they save goes to the Library instead.
  const pictureEditors = useRef(new Set<EditorHandle>());
  useEffect(() => () => pictureEditors.current.forEach((h) => h.detach()), []);
  // An agent's version being written shows in place of this one (read-only, its words arriving where its mark is),
  // unless there are changes here not saved: those are left as they are. A comment, an equation, a link or another
  // change still being made here holds it back until it is done.
  const making = noting || !!note || !!cite || !!citeFind || !!draft || !!eq || !!chars || !!linking || menu === 'page' || menu === 'url' || dialog === 'bands' || dialog === 'spacing';
  const liveDoc = live && !making && !(!!model && !!saved && model !== saved) ? live.model : null;
  const liveOn = !!liveDoc;
  /** What the page shows: the document, or the agent's version being written. */
  const shownDoc = liveDoc ?? model;
  // A comment box that went while typed in (its panel closed, say) holds nothing back.
  useEffect(() => {
    if (noting && !typing(document.activeElement)) setNoting(false);
  });
  const [spot, setSpot] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [slash, setSlash] = useState<{ key: string; from: number; query: string; index: number } | null>(null);
  const [slashPos, setSlashPos] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const [math, setMath] = useState(0);
  const [hoverTable, setHoverTable] = useState<string | null>(null);
  const [pageLayout, setPageLayout] = useState<Layout | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const find = useFind();
  const root = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const engine = useRef<DocEngine | null>(null);
  const paging = useRef<Paging | null>(null);
  const zoomRef = useRef(1);
  const linkRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLButtonElement>(null);
  const outlineRef = useRef<HTMLButtonElement>(null);
  const commentsRef = useRef<HTMLButtonElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const askChip = useRef<HTMLDivElement>(null);
  const dismissed = useRef('');
  const fonts = useDocFonts(shownDoc);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const phone = layout === 'sheet' || width < 640;
  // The app's ? sits in the window's bottom right corner while its sidebar is hidden (Shell's HelpButton): the save
  // bar's buttons and the word count keep clear of it.
  const helpShown = useUI((s) => !s.sideOpen && !s.panelOpen);
  const roomy = useMediaQuery('(min-width: 900px)');
  const corner = helpShown && roomy && !phone;
  const wideOutline = width >= 1100 && layout !== 'sheet';
  const outlineW = wideOutline && outlineOpen ? 220 : 0;
  const comments: Comment[] = model?.comments ?? [];
  const shownComments = showResolved ? comments : openComments(comments);
  // The suggested changes, each as it shows beside the page.
  const changes = useMemo(() => (model?.suggestions?.length ? changesOf(model) : []), [model]);
  const ppx = shownDoc ? paperPx(shownDoc) : 794;
  // The comments beside the page where there is room for them, else in a panel.
  const columnFits = !phone && width - outlineW - (askOpen ? 340 : 0) >= ppx * (typeof view.zoom === 'number' ? Math.min(1, view.zoom) : 1) + COLUMN + 24 + 48;
  const column = columnFits && view.comments && (shownComments.length > 0 || changes.length > 0 || !!draft);
  const panelW = !phone && panel && !columnFits ? 320 : 0;
  const askW = !phone && askOpen ? 340 : 0;
  const room = width - outlineW - panelW - askW - (column ? COLUMN + 24 : 0) - 48;
  // Fit the width: the paper as wide as there is room for; else as large as asked, or (no room for it) the words
  // filling the width, as on a phone.
  const want = view.zoom === 'fit' ? Math.min(3, room / ppx) : view.zoom;
  const narrow = !!model && (phone || room < ppx * Math.min(want, 1) || want < 0.4);
  const zoom = narrow ? 1 : want;
  const setPrefs = (p: Partial<ViewPrefs>) => {
    const next = { ...view, ...p };
    setView(next);
    localStorage.setItem(VIEW_KEY, JSON.stringify(next));
  };

  const dirty = !!model && !!saved && model !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty]);
  useEffect(() => {
    localStorage.setItem(OUTLINE_KEY, outlineOpen ? '1' : '0');
  }, [outlineOpen]);

  const save = async (): Promise<boolean> => {
    const e = engine.current;
    // Not while an agent's version shows (Ctrl+S would keep that, as far as it has come): there is nothing of yours to save then.
    if (!e || !onSave || saving || readOnly || liveOn) return false;
    const d = e.kept;
    setSaving(true);
    try {
      if (await onSave(d)) {
        setSaved(d);
        return true;
      }
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
    return false;
  };
  const saveNow = useRef(save);
  saveNow.current = save;
  if (saveNowRef) saveNowRef.current = () => (dirtyRef.current ? saveNow.current() : Promise.resolve(true));
  const stRef = useRef(st);
  stRef.current = st;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly || liveOn;
  // What the engine's keys and clicks ask of the editor (kept current: the engine is made once).
  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false);
  const atoms = useRef<(a: AtomClick) => void>(() => {});

  // The page's engine, once there is a document to show.
  useLayoutEffect(() => {
    if (!paper.current || !model || engine.current) return;
    engine.current = new DocEngine(paper.current, model, {
      readOnly: !!readOnly,
      src: pictureSrc,
      breakLabel: tr('Page break'),
      tocHint: tr('Headings you add show here, to go to them.'),
      bibHint: tr('The sources the document cites show here, in its citation style.'),
      math: drawMath,
      onChange: (d) => {
        setModel(d);
        paging.current?.changed(d);
      },
      onDrawn: (ids) => paging.current?.drawn(ids),
      onState: (s) => setSt(s),
      onKey: (e) => keys.current(e),
      onAtom: (a) => atoms.current(a),
      upload: (f) => {
        toast(tr('Adding the picture…'));
        return uploadPicture(f);
      },
      takeIn: (s) => takeIn(s),
      onError: toastError,
    });
    setSt(engine.current.state());
    // Each page's footnotes at its foot: the words end over them.
    paging.current = new Paging(engine.current, {
      zoom: () => zoomRef.current,
      onLayout: setPageLayout,
      notes: () => {
        const d = engine.current?.doc;
        return d ? noteRoom(d, { width: ((paperOf(d.page).w - 2 * d.page.margin) * 96) / 25.4 }) : null;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!model]);
  useEffect(
    () => () => {
      paging.current?.destroy();
      engine.current?.destroy();
    },
    [],
  );
  useEffect(() => {
    engine.current?.setReadOnly(!!readOnly);
  }, [readOnly]);
  useEffect(() => {
    engine.current?.setSuggesting(mode === 'suggest' && !readOnly ? { by: 'user' } : null);
  }, [mode, readOnly, !!engine.current]);
  useEffect(() => {
    if (engine.current) engine.current.root.spellcheck = view.spell;
  }, [view.spell, !!engine.current]);

  // KaTeX, once a document with maths opens: its equations drawn again with it.
  const hasMath = !!model && JSON.stringify(model.blocks).includes('"math"');
  useEffect(() => {
    if (!hasMath || math) return;
    let alive = true;
    void loadKatex().then(() => {
      if (!alive) return;
      engine.current?.redrawMath();
      setMath(1);
    });
    return () => {
      alive = false;
    };
  }, [hasMath, math]);

  // Another document, or another version of it, while nothing was changed here: start from it.
  useEffect(() => {
    if (!doc) return;
    const m = fixDoc(doc.model);
    const e = engine.current;
    if (!e) {
      setModel(m);
      setSaved(m);
      return;
    }
    if (dirtyRef.current) return;
    // The version just saved from here: it stays as it is (the caret and the history with it).
    if (sameDoc(m, e.kept)) return setSaved(e.kept);
    // Blocks that hold what they held keep their place on the page (an agent's version changed a few of them).
    e.load(m, true);
    paging.current?.reload();
    setModel(e.doc);
    setSaved(e.doc);
    setSt(e.state());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  // The agent's version as it comes, drawn where it changed (the document's own again once it is saved, or failed);
  // its caret placed once it is drawn.
  const [drawnLive, setDrawnLive] = useState(0);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.preview(liveDoc);
    paging.current?.changed(e.doc);
    if (liveDoc) setDrawnLive((n) => n + 1);
  }, [liveDoc, !!engine.current]);

  // An older version opened from the Library's Versions (its key ends in :v<n>): shown with what changed since it, the
  // latest saved version fetched to compare with (the band over the editor brings it back, or leaves it).
  const olderVersion = readOnly ? Number(/:v(\d+)$/.exec(doc?.key ?? '')?.[1]) || 0 : 0;
  useEffect(() => {
    if (!olderVersion || !doc) return setCompare((c) => (c?.from === 'versions' ? null : c));
    let alive = true;
    api<{ model: Doc; versions: PageVersion[] }>(`/api/pages/${encodeURIComponent(pageId)}`).then(
      (r) => {
        if (!alive) return;
        const at = r.versions.find((v) => v.version === olderVersion)?.createdAt;
        setCompare({ version: olderVersion, at, merged: compareDocs(fixDoc(doc.model), fixDoc(r.model), { by: 'user', at: Date.now() }, 'v'), from: 'versions' });
      },
      () => {},
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  // The editor's keys from the toolbar's and the find bar's fields too: save, find, print, the shortcuts.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return;
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      if (globalKey(e)) e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // The words it has, a moment after each change; while an agent writes, those shown, counted once a second at most.
  const wordsAt = useRef(0);
  useEffect(() => {
    const d = shownDoc;
    if (!d) return;
    const wait = liveOn ? Math.max(0, 1000 - (performance.now() - wordsAt.current)) : 400;
    const t = setTimeout(() => {
      wordsAt.current = performance.now();
      setWords(docWords(d));
    }, wait);
    return () => clearTimeout(t);
  }, [shownDoc]);

  // What an agent asked now would be about, told as the caret moves.
  const lastScopes = useRef('');
  useEffect(() => {
    if (!model || !st || !onScopes) return;
    const s = scopesOf(model, st);
    const key = JSON.stringify(s);
    if (key === lastScopes.current) return;
    lastScopes.current = key;
    onScopes(s);
  }, [st, model?.blocks]);

  // The words on pages of the paper (not on a phone or in a narrow window): laid out again whole when what they are
  // laid out with changes (fonts arrive, maths is drawn, the paper, its margins, the document's font or size).
  zoomRef.current = zoom;
  const geometry = `${narrow}:${zoom}:${fonts}:${math}:${shownDoc?.page.size}:${shownDoc?.page.margin}:${shownDoc?.font}:${shownDoc?.size}`;
  useLayoutEffect(() => {
    const pg = paging.current;
    if (!pg) return;
    pg.setOn(!narrow);
    if (!narrow) pg.run(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, !!engine.current]);

  const tick = `${width}:${fonts}:${narrow}:${zoom}:${math}:${column}:${panelW}:${pageLayout?.n ?? 0}`;

  // The chips by the words picked (comment on them, ask the agent about them), and the bar of the link the caret is in.
  useLayoutEffect(() => {
    const h = host.current;
    if (!st || !h) return setFloat(null);
    const hr = h.getBoundingClientRect();
    const out: { ask?: { x: number; y: number }; link?: { x: number; y: number } } = {};
    const s = window.getSelection();
    if ((onAsk || !readOnly) && !st.collapsed && st.text.trim() && s?.rangeCount && paper.current?.contains(s.anchorNode)) {
      const r = s.getRangeAt(0).getBoundingClientRect();
      // Centred over the words, as far in as its own width needs (it is cut off at the page's edge otherwise).
      const half = (askChip.current?.offsetWidth ?? 260) / 2 + 4;
      if (r.width || r.height) out.ask = { x: Math.min(Math.max(r.left - hr.left + r.width / 2, half), hr.width - half), y: phone ? r.bottom - hr.top + 10 : r.top - hr.top - 8 };
    }
    if (st.collapsed && st.link && !readOnly) {
      const a = engine.current?.linkElement();
      if (a) {
        const r = a.getBoundingClientRect();
        out.link = { x: Math.max(8, r.left - hr.left), y: r.bottom - hr.top + 6 };
      }
    }
    setFloat(out.ask || out.link ? out : null);
  }, [st, tick]);

  // The comment picked follows the caret into the words of one; a suggestion, into what it changes.
  useEffect(() => {
    if (st?.cm.length && !st.cm.includes(active ?? '')) setActive(st.cm.find((id) => comments.some((c) => c.id === id && (showResolved || !c.resolved))) ?? active);
    else if (st?.sg.length && !st.sg.includes(active ?? '')) setActive(st.sg[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.cm.join(), st?.sg.join()]);

  // Where each comment's words are down the page, for the column beside it.
  useLayoutEffect(() => {
    const h = host.current;
    const p = paper.current;
    if (!h || !p || !model) return;
    const hr = h.getBoundingClientRect();
    if (column) {
      const next = new Map<string, number>();
      for (const c of shownComments) {
        const el = p.querySelector(`[data-cm~="${CSS.escape(c.id)}"]`);
        if (el) next.set(c.id, el.getBoundingClientRect().top - hr.top);
      }
      for (const c of changes) {
        const el = p.querySelector(`[data-s="${CSS.escape(c.id)}"]`);
        if (el) next.set(c.id, el.getBoundingClientRect().top - hr.top);
      }
      setTops((old) => (old.size === next.size && [...next].every(([k, v]) => Math.abs((old.get(k) ?? -1) - v) < 1) ? old : next));
    }
  }, [model, tick, column, showResolved, active, changes]);

  // "/" typed at a line's start, or after a space: its menu, narrowed as more is typed.
  useEffect(() => {
    const e = engine.current;
    if (!e || !st || readOnly) return setSlash(null);
    const b = e.before_();
    const m = b ? slashAt(b.text) : null;
    if (!b || !m) return setSlash(null);
    const key = `${b.at.b}:${b.at.c?.join() ?? ''}:${m.from}`;
    if (dismissed.current === key) return setSlash(null);
    setSlash((s) => ({ key, from: m.from, query: m.query, index: s?.key === key && s.query === m.query ? s.index : 0 }));
  }, [st]);
  useLayoutEffect(() => {
    const r = slash ? engine.current?.caretRect() : null;
    const h = host.current?.getBoundingClientRect();
    if (!r || !h) return setSlashPos(null);
    setSlashPos({ x: Math.max(4, Math.min(r.left - h.left, h.width - slashBox.width - 4)), top: r.top - h.top, bottom: r.bottom - h.top });
  }, [slash?.key, slash?.query, tick]);

  const found = useDocFind(engine.current, model, find, host.current, tick);
  const heads = useMemo(() => (shownDoc ? docHeadings(shownDoc) : []), [shownDoc?.blocks]);
  const current = model && st ? sectionOf(model, st.index)?.id : undefined;
  const css = useMemo(() => (shownDoc ? editorCss(shownDoc, { narrow, hints: { title: tr('Title'), body: tr('Start writing') } }) : ''), [shownDoc?.page, shownDoc?.font, shownDoc?.size, narrow]);
  // The comments' marks: open ones in yellow, the one picked stronger; resolved ones not at all.
  // The suggestions' marks in the colour of who suggested each, the one picked shaded.
  const marks = useMemo(
    () =>
      [
        ...comments
          .filter((c) => !c.resolved || (showResolved && c.id === active))
          .map((c) => `.nd-ed [data-cm~="${CSS.escape(c.id)}"]{background:${c.id === active ? 'rgba(251,188,4,.5)' : 'rgba(251,188,4,.22)'};border-bottom:2px solid rgba(251,188,4,.8)}`),
        ...(model?.suggestions ?? []).map((x) => `.nd-ed [data-s="${CSS.escape(x.id)}"]{--sc:${suggestionColor(x)}}`),
        active && model?.suggestions?.some((x) => x.id === active) ? `.nd-ed :is(ins,del,span)[data-s="${CSS.escape(active)}"]{background:color-mix(in srgb,var(--sc) 14%,transparent)}` : '',
      ].join('\n'),
    [comments, active, showResolved, model?.suggestions],
  );

  // The AI that writes with you: its box at the caret, its runs over the whole document, its suggestions as you type, its panel.
  const ai = useDocAi({ engine: engine.current, st, doc: model, title: doc?.title ?? '', host, width, readOnly: !!readOnly || liveOn || !!compare, ghostOn: view.ghost, tick });
  useEffect(() => setAskOpen(ai.ask), [ai.ask]);

  if (!model) return <div className="flex h-full items-center justify-center text-fg-3">…</div>;

  const e = engine.current;
  const slashList =
    e && slash
      ? slashMatches(
          slashItems(e, {
            picture: () => void pickPicture(),
            aiPicture: () => void aiPicture(),
            drawing: () => void drawing(),
            plot: () => void plot(),
            signature: () => setDialog('signature'),
            equation: () => openEquation(false),
            today: () => today(),
            ai: readOnly ? undefined : () => ai.write(),
          }),
          slash.query,
        )
      : [];
  const slashOpen = !!slash && slashList.length > 0 && !!slashPos;
  const slashBox = slashLayout(slashList.length, (host.current?.clientWidth ?? width) - 8);

  /** A place over the page for a box to open by (the caret, or a block). */
  const spotAt = (r: DOMRect | null | undefined) => {
    const h = host.current?.getBoundingClientRect();
    if (!r || !h) return setSpot({ x: 40, y: 40, w: 1, h: 1 });
    setSpot({ x: r.left - h.left, y: r.top - h.top, w: Math.max(1, r.width), h: Math.max(1, r.height) });
  };
  function today() {
    engine.current?.typeText(new Date().toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }));
  }
  function openEquation(inline: boolean) {
    spotAt(engine.current?.caretRect());
    setEq({ kind: 'new', inline });
  }
  const pickSlash = (k: number) => {
    const it = slashList[k];
    if (!it || !e || !slash) return;
    dismissed.current = '';
    e.cutBack(slash.from);
    setSlash(null);
    it.run();
  };
  // The engine's keys first: the "/" menu's, then the editor's own.
  keys.current = (ev) => {
    if (slashOpen && slash) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const n = slashList.length;
        setSlash({ ...slash, index: (slash.index + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n });
        return true;
      }
      // Across the two columns.
      if ((ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') && slashBox.rows < slashList.length) {
        ev.preventDefault();
        const j = slash.index + (ev.key === 'ArrowRight' ? slashBox.rows : -slashBox.rows);
        if (j >= 0 && j < slashList.length) setSlash({ ...slash, index: j });
        return true;
      }
      if (ev.key === 'Enter' || ev.key === 'Tab') {
        ev.preventDefault();
        pickSlash(slash.index);
        return true;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        dismissed.current = slash.key;
        setSlash(null);
        return true;
      }
    }
    if (ai.onKey(ev)) return true;
    if (globalKey(ev)) {
      ev.preventDefault();
      return true;
    }
    return false;
  };
  atoms.current = (a) => {
    const en = engine.current;
    if (!en || readOnlyRef.current) return;
    if (a.kind === 'math') {
      const b = en.doc.blocks.find((x) => x.id === a.id);
      if (b?.type !== 'math') return;
      spotAt(en.elementOf(a.id)?.getBoundingClientRect());
      setEq({ kind: 'block', id: a.id, tex: b.tex });
    } else if (a.kind === 'mathRun') {
      spotAt(en.caretRect());
      setEq({ kind: 'run', at: a.at, tex: a.tex });
    } else if (a.kind === 'mark') {
      spotAt(a.rect);
      if (a.k === 'fn') setNote({ id: a.t });
      else if (a.k === 'cite') setCite({ at: a.at, t: a.t });
    } else if (a.kind === 'icon') {
      spotAt(en.elementOf(a.id)?.getBoundingClientRect());
      setChars({ kind: 'icon', id: a.id });
    }
  };
  /** Insert → Footnote: a mark at the caret, its note's words written in its box. */
  function addFootnote() {
    const en = engine.current;
    if (!en || readOnlyRef.current || en.picked) return;
    const undo = en.mark();
    let id = '';
    do id = `n${Math.random().toString(36).slice(2, 8)}`;
    while (en.doc.notes?.some((n) => n.id === id));
    if (!en.insertRun({ t: id, fn: true }, (d) => ({ ...d, notes: [...(d.notes ?? []), { id, runs: [] }] }))) return;
    spotAt(en.caretRect());
    setNote({ id, undo });
  }
  /** A source cited at the caret (a new one goes into the document's sources), or added to the citation clicked. */
  const citeSource = (s: Source | string) => {
    const en = engine.current;
    if (!en) return;
    let d = en.doc;
    let key = typeof s === 'string' ? s : '';
    if (typeof s !== 'string') ({ doc: d, key } = withSource(en.doc, s));
    const add = citeFind?.add;
    setCiteFind(null);
    if (add) {
      const items = citeItems(add.t);
      if (!items.some((x) => x.key === key)) items.push({ key });
      en.setAtom(add.at, citeOf(items), d);
    } else en.insertRun({ t: key, cite: true }, () => d);
    en.refocusSoon();
  };
  /** Format → Citation style: every citation and the bibliography in it. */
  const citeStyle = (c: CiteStyle) => {
    const en = engine.current;
    if (!en) return;
    const { cite: _c, ...rest } = en.doc;
    en.change(c === 'apa' ? rest : { ...rest, cite: c });
  };
  /** Insert → Bibliography: its heading and its list (drawn from the sources cited), after the caret's paragraph. */
  const addBibliography = () => {
    const en = engine.current;
    if (!en || readOnlyRef.current) return;
    putAfter(en, normalizeBlocks([{ h1: tr(BIB_TITLES[en.doc.cite ?? 'apa']) }, { type: 'bib' }], {}, new Set(en.doc.blocks.map((b) => b.id))));
  };
  /** A footnote's words kept (none: a new one goes again), or the footnote taken out. */
  const noteDone = (runs: Run[]) => {
    const en = engine.current;
    if (!en || !note) return setNote(null);
    if (!runs.some((r) => r.t.trim()) && note.undo) en.undoTo(note.undo);
    else en.change({ ...en.doc, notes: (en.doc.notes ?? []).map((n) => (n.id === note.id ? { ...n, runs } : n)) });
    setNote(null);
    en.refocusSoon();
  };
  const noteRemove = () => {
    const en = engine.current;
    if (!en || !note) return setNote(null);
    const at = en.findAtom('fn', note.id);
    if (at) en.setAtom(at, null);
    setNote(null);
    en.refocusSoon();
  };
  /** Keys the editor has wherever its focus is: true when one was. */
  function globalKey(ev: KeyboardEvent): boolean {
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod) return false;
    const k = ev.key.toLowerCase();
    const ro = readOnlyRef.current;
    if (k === 's' && !ev.shiftKey && !ev.altKey) return void saveNow.current(), true;
    if (k === 'f' && !ev.shiftKey && !ev.altKey) return find.show(false), true;
    if (k === 'h' && !ev.shiftKey && !ev.altKey && !ro) return find.show(true), true;
    if (k === 'p' && !ev.shiftKey && !ev.altKey) return void print(), true;
    if ((k === '/' || ev.code === 'Slash') && !ev.altKey && !ev.shiftKey) return setDialog('keys'), true;
    if (ev.code === 'KeyC' && ev.shiftKey && !ev.altKey) return openCount(), true;
    if (ev.code === 'KeyM' && ev.altKey && !ro) return startComment(), true;
    if (ev.code === 'KeyF' && ev.altKey && !ev.shiftKey && !ro) return addFootnote(), true;
    if (ev.code === 'KeyX' && ev.altKey && ev.shiftKey && !ro) return setMode((m) => (m === 'suggest' ? 'edit' : 'suggest')), true;
    if (k === 'k' && !ev.shiftKey && !ev.altKey && !ro && engine.current?.root.contains(document.activeElement)) {
      setLinking({ url: stRef.current?.link ?? '', text: '' });
      return true;
    }
    return false;
  }

  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The document goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    if (!e || !saved) return;
    e.load(saved);
    paging.current?.reload();
    setModel(e.doc);
    setSaved(e.doc);
  };
  async function pickPicture() {
    const f = await choosePicture();
    if (f && engine.current) await engine.current.addPictures([f]);
  }
  const replacePicture = async (id: string) => {
    const f = await choosePicture();
    if (!f || !e) return;
    try {
      toast(tr('Adding the picture…'));
      const p = await uploadPicture(f);
      e.image(id, { src: p.src });
    } catch (err) {
      toastError(err);
    }
  };
  const pictureUrl = async (u: string) => {
    if (!e) return;
    try {
      const p = await pictureFromUrl(u);
      e.insert([e.picture(p.src, p.w)]);
    } catch (err) {
      toastError(err);
    }
  };
  /** How wide a picture made with AI goes in: a wide one across the text, another half as wide (its handles size it after). */
  const madeWidth = (p: { w: number; h: number }) => {
    const d = engine.current?.doc ?? model;
    const text = d ? (columnMm(d.page) * 96) / 25.4 : 600;
    return p.w / Math.max(1, p.h) >= 1.3 ? text : text / 2;
  };
  /** A picture made with AI, a drawing or a plot, put in at the caret (after the table it is in: a cell holds only words). */
  const putMade = (p: { src: string; w: number; h: number; prompt?: string } | null, o: { after?: string; px?: number } = {}) => {
    const en = engine.current;
    if (!p || !en) return;
    const b = en.state().block;
    const t = o.after ?? (b?.type === 'table' ? b.id : undefined);
    if (t && en.doc.blocks.some((x) => x.id === t)) en.setPicked(t);
    const pic = en.picture(p.src, o.px ?? madeWidth(p));
    en.insert([p.prompt ? { ...pic, alt: p.prompt.replace(/\s+/g, ' ').slice(0, 300) } : pic]);
  };
  /** A free photo at the caret (after the table it is in), its credit as its caption where its licence asks for one. */
  const freePhoto = async () => {
    const use = await choosePhoto();
    const en = engine.current;
    if (!use || !en) return;
    const b = en.state().block;
    if (b?.type === 'table' && en.doc.blocks.some((x) => x.id === b.id)) en.setPicked(b.id);
    const pic = en.picture(use.src, madeWidth(use));
    en.insert([{ ...pic, alt: use.photo.title.slice(0, 300), ...(use.photo.attribution ? { caption: use.credit.slice(0, 1000) } : {}) }]);
  };
  /** A picture made with AI; a picture picked is offered to follow (the dialog can drop it). */
  const aiPicture = async () => {
    const b = engine.current?.state().picked;
    putMade(await makePicture({ kind: 'picture', refs: b?.type === 'image' && b.src.startsWith('naget-asset:') ? [b.src] : undefined }));
  };
  const drawing = async () => putMade(await makeDrawing({ kind: 'illustration' }));
  /** A plot: of the table the caret is in (its cells the data, the plot after it), else of data given in the dialog. */
  const plot = async () => {
    const en = engine.current;
    if (!en) return;
    const b = en.state().block;
    const t = b?.type === 'table' ? b : null;
    const data = t ? csvOf(t.rows.map((r) => r.map((c) => runsText(c.runs)))) : undefined;
    const p = await makePlot({ data, dataFrom: t ? 'From the table' : undefined, theme: { font: en.doc.font, fg: '#202124' }, w: 720 });
    // As wide as it was drawn for (it was made for the text's width).
    putMade(p, { after: t?.id, px: p?.w });
  };
  /** The picture changed with AI, its background taken out or part of it erased, in its place (one step to undo). */
  const changePicture = async (id: string, mode: 'change' | 'cutout' | 'erase') => {
    const b = engine.current?.doc.blocks.find((x) => x.id === id);
    if (b?.type !== 'image') return;
    const p = await editPicture({ src: b.src, mode });
    if (p && engine.current?.doc.blocks.some((x) => x.id === id)) engine.current.image(id, { src: p.src });
  };
  /** Edit picture: the picture in the picture editor, in a tab of its own; saved, the new picture takes its place (one step to undo). */
  const openPicture = (id: string) => {
    const b = engine.current?.doc.blocks.find((x) => x.id === id);
    if (b?.type !== 'image' || !b.src) return;
    const h = editKept(b.src, {
      title: b.alt || b.caption || 'Picture',
      label: doc?.title || 'The document',
      put: (r) => {
        if (r.src && engine.current?.doc.blocks.some((x) => x.id === id)) engine.current.image(id, { src: r.src });
      },
    });
    pictureEditors.current.add(h);
  };
  const askPicture = () => {
    if (!onAsk || !st || !model) return;
    const s = scopesOf(model, st).find((x) => x.id === 'picture');
    if (s) onAsk(s.lead);
  };
  async function print() {
    const en = engine.current;
    if (!en) return;
    try {
      await printDoc(en.doc, doc?.title ?? 'Document');
    } catch (err) {
      toastError(err);
    }
  }
  function openCount() {
    const en = engine.current;
    if (!en) return;
    const [s, z] = en.range();
    const picked = !(s.b === z.b && s.o === z.o && (s.c?.join() ?? '') === (z.c?.join() ?? ''));
    let text = '';
    let paragraphs = 0;
    if (picked) {
      text = wordsText(runsBetween(en.doc, s, z));
      paragraphs = Math.max(1, new Set([s.b, z.b]).size);
    } else {
      const parts: string[] = [];
      for (const b of en.doc.blocks) {
        if (b.type === 'p' || b.type === 'li') {
          const t = wordsText(b.runs);
          if (t.trim()) paragraphs++;
          parts.push(t);
        } else if (b.type === 'table') for (const r of b.rows) for (const c of r) parts.push(wordsText(c.runs));
      }
      text = parts.join('\n');
    }
    const w = wordCount(text);
    const plain = text.replace(/⁣/g, '');
    // Pages: as many as the words are laid out on (the layout worked out now, for the last change), else as many as
    // a page's worth of words make (on a phone, where there are no pages); the words picked, the pages they run over.
    let pages = 1;
    const pg = paging.current;
    if (pg && !narrow) {
      pg.run();
      const count = pg.layout?.count ?? 1;
      pages = count;
      if (picked) {
        const a = pg.pageOfBlock(s.b) ?? 0;
        const b = pg.pageOfBlock(z.b) ?? a;
        pages = Math.max(1, b - a + 1);
      }
    } else pages = Math.max(1, Math.ceil(docWords(en.doc) / 450));
    if (picked && (!pg || narrow)) pages = Math.max(1, Math.round((w / Math.max(1, docWords(en.doc))) * pages));
    setCounts({ words: w, chars: plain.replace(/\n/g, '').length, charsNoSpaces: plain.replace(/\s/g, '').length, paragraphs, pages, picked });
    setDialog('count');
  }

  // ---- comparing with a version ----------------------------------------------------------------------------------------
  const compareWith = async (v: PageVersion) => {
    setVersions(false);
    const en = engine.current;
    if (!en) return;
    try {
      const old = await loadModelVersion<Doc>(encodeURIComponent(pageId), v.version);
      setCompare({ version: v.version, at: v.createdAt, merged: compareDocs(fixDoc(old.model), en.doc, { by: 'user', at: Date.now() }, 'v'), from: 'tools' });
    } catch (err) {
      toastError(err);
    }
  };
  /** The version brought back, as the Library does it (a new version on top); changes not saved here go first. */
  const restoreVersion = async () => {
    if (!compare) return;
    if (dirty && !(await confirm({ title: 'Restore this version?', body: 'Your changes that are not saved yet are dropped, and this version comes back as the latest.', confirm: 'Restore', danger: true }))) return;
    try {
      const r = await post<{ page: { version: number } }>(`/api/pages/${encodeURIComponent(pageId)}/versions/${compare.version}/restore`);
      if (dirty && engine.current && saved) {
        engine.current.load(saved);
        paging.current?.reload();
        setModel(engine.current.doc);
      }
      toast(`Version ${compare.version} is back, as version ${r.page.version}`, 'ok');
      setCompare(null);
    } catch (err) {
      toastError(err);
    }
  };

  // ---- comments ------------------------------------------------------------------------------------------------------
  const setComments = (list: Comment[], gone?: string) => engine.current?.setComments(list, gone);
  const ca: CommentActions = {
    active,
    readOnly: readOnly || liveOn,
    focus: (id) => {
      setActive(id);
      if (!engine.current?.revealComment(id)) toast(tr('The words this comment was on are gone.'));
    },
    reply: (id, text) => setComments(comments.map((c) => (c.id === id ? { ...c, replies: [...(c.replies ?? []), { id: newCommentId(), by: 'user', text, at: Date.now() }] } : c))),
    resolve: (id, resolved) => {
      setComments(comments.map((c) => (c.id === id ? (resolved ? { ...c, resolved: true } : (({ resolved: _r, ...x }) => x)(c)) : c)));
      if (resolved && active === id) setActive(null);
    },
    edit: (id, text) => setComments(comments.map((c) => (c.id === id ? { ...c, text } : c))),
    remove: (id) => {
      setComments(
        comments.filter((c) => c.id !== id),
        id,
      );
      if (active === id) setActive(null);
    },
  };
  function startComment() {
    const en = engine.current;
    // The selection as it is now: the state the page was told of lags a frame behind keys (Shift+→, then Ctrl+Alt+M).
    const s = en?.state();
    if (!en || readOnlyRef.current || !s) return;
    if (s.collapsed || !s.text.trim()) return void toast(tr('Pick the words to comment on first.'));
    const r = en.caretRect();
    const h = host.current?.getBoundingClientRect();
    setDraft({ y: r && h ? r.top - h.top : 0, quote: s.text.slice(0, 500) });
    if (!columnFits) setPanel(true);
    else if (!view.comments) setPrefs({ comments: true });
  }
  const addDraft = (text: string) => {
    const en = engine.current;
    if (!en || !draft) return;
    const c: Comment = { id: newCommentId(), by: 'user', text, at: Date.now(), quote: draft.quote };
    if (!en.addComment(c)) toast(tr('Pick the words to comment on first.'));
    else {
      setActive(c.id);
      // The words stay marked; the caret goes after them.
      const [, z] = en.range();
      en.place({ a: z, f: z }, false);
    }
    setDraft(null);
  };
  const askComments = onAsk
    ? () => {
        const open = openComments(comments);
        const list = open.map((c) => `${c.id}${c.quote ? ` on “${short(c.quote, 60)}”` : ''}: ${short(c.text, 200)}`).join('; ');
        onAsk(`Answer the open comments in this document (make the changes they ask for, then reply to each and resolve it): ${list}`);
      }
    : undefined;

  // ---- the menus --------------------------------------------------------------------------------------------------------
  const menus =
    e && st
      ? docMenus({
          engine: e,
          st,
          doc: model,
          outline: wideOutline ? outlineOpen : menu === 'outline',
          toggleOutline: () => {
            if (wideOutline) return setOutlineOpen((o) => !o);
            if (phone) spotAt(host.current?.getBoundingClientRect());
            setMenu(menu === 'outline' ? null : 'outline');
          },
          zoom: view.zoom,
          setZoom: (z) => setPrefs({ zoom: z }),
          spell: view.spell,
          setSpell: (on) => setPrefs({ spell: on }),
          showCount: view.count,
          setShowCount: (on) => setPrefs({ count: on }),
          comments: columnFits ? view.comments : panel,
          toggleComments: () => (columnFits ? setPrefs({ comments: !view.comments }) : setPanel((p) => !p)),
          resolved: showResolved,
          toggleResolved: () => setShowResolved((r) => !r),
          find: (r) => find.show(r),
          comment: startComment,
          picture: () => void pickPicture(),
          pictureUrl: () => setMenu('url'),
          aiPicture: () => void aiPicture(),
          freePhoto: () => void freePhoto(),
          drawing: () => void drawing(),
          plot: () => void plot(),
          aiSection: onRequest && !readOnly ? () => openTypes({ kind: 'section', at: sectionPlace(model, st.index), onDone: onRequest }) : undefined,
          signature: () => setDialog('signature'),
          footnote: () => addFootnote(),
          citation: () => setCiteFind({}),
          bibliography: addBibliography,
          citeStyle,
          link: () => setLinking({ url: st.link ?? '', text: '' }),
          equation: openEquation,
          chars: () => {
            spotAt(e.caretRect());
            setChars({ kind: 'insert' });
          },
          calloutIcon: () => {
            if (st.block?.type !== 'p') return;
            spotAt(e.elementOf(st.block.id)?.getBoundingClientRect());
            setChars({ kind: 'icon', id: st.block.id });
          },
          bands: () => setDialog('bands'),
          pageNumbers: (k) => {
            if (k === null) {
              const strip = (b: Doc['header']) => (b && /\{pages?\}/i.test(b.text) ? (b.text.replace(/(Page\s*)?\{page\}(\s*of\s*\{pages\})?/gi, '').trim() ? { ...b, text: b.text.replace(/(Page\s*)?\{page\}(\s*of\s*\{pages\})?/gi, '').trim() } : null) : b);
              e.setBands({ header: strip(model.header), footer: strip(model.footer) });
              return;
            }
            const p = PAGE_NUMBERS[k];
            // The words go into the document, in the language the app is read in ({page} and {pages} kept as they are).
            const text = p.text === 'Page {page} of {pages}' ? tr('Page {page} of {pages}') : p.text;
            e.setBands({ [p.where]: { text, ...(p.align ? { align: p.align } : {}) } });
          },
          pageSetup: () => {
            if (phone) spotAt(host.current?.getBoundingClientRect());
            setMenu('page');
          },
          spacing: () => setDialog('spacing'),
          wordCount: openCount,
          shortcuts: () => setDialog('keys'),
          print: () => void print(),
          paste: (plain) => {
            void (async () => {
              try {
                const items = await navigator.clipboard.read();
                const dt = new DataTransfer();
                for (const it of items) for (const type of it.types) if (type === 'text/html' || type === 'text/plain') dt.setData(type, await (await it.getType(type)).text());
                e.paste(dt, plain);
              } catch {
                toast(tr('Press Ctrl+V to paste here.'));
              }
            })();
          },
          copy: (cut) => {
            if (!document.execCommand(cut ? 'cut' : 'copy')) toast(tr('Press Ctrl+C to copy.'));
          },
          painter: () => (e.paint ? e.stopPaint() : e.startPaint(false)),
          today,
          mode,
          setMode,
          suggestions: changes.length,
          resolveAll: (accept) => e.resolve(null, accept),
          compare: () => setVersions(true),
          readOnly: !!readOnly || !!compare || liveOn,
          ai: readOnly ? undefined : ai,
          ghost: view.ghost,
          setGhost: readOnly ? undefined : (on) => setPrefs({ ghost: on }),
        })
      : [];

  const outline = (
    <nav className="space-y-px p-2" translate="no">
      {heads.length ? (
        heads.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => {
              setMenu(null);
              e?.focusBlock(h.id);
            }}
            className={cx(
              'block w-full truncate rounded-md py-1 pr-2 text-left text-[12.5px] transition-colors hover:bg-bg-2 hover:text-fg',
              h.id === current ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2',
              h.level <= 1 && 'font-medium',
            )}
            style={{ paddingLeft: 8 + Math.max(0, h.level - 1) * 12 }}
          >
            {h.text}
          </button>
        ))
      ) : (
        <p translate="yes" className="px-2 py-1 text-[12.5px] leading-relaxed text-fg-3">
          Headings you add show here, to go to them.
        </p>
      )}
    </nav>
  );

  const pageSetup = (
    <div className="space-y-3 p-3">
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Paper size</div>
        <Segmented
          size="sm"
          value={model.page.size}
          onChange={(v) => e?.setDoc({ page: { ...model.page, size: v } })}
          options={(Object.keys(PAPERS) as (keyof typeof PAPERS)[]).map((k) => ({ value: k, label: PAPERS[k].label }))}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Margins</div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={String(MARGINS.find((m) => Math.abs(m.mm - model.page.margin) < 0.05)?.mm ?? '')}
            onChange={(v) => e?.setDoc({ page: { ...model.page, margin: Number(v) } })}
            options={MARGINS.map((m) => ({ value: String(m.mm), label: m.label }))}
          />
          <NumInput value={model.page.margin} onChange={(v) => e?.setDoc({ page: { ...model.page, margin: v } })} min={5} max={60} step={1} unit="mm" label="Margins" className="w-[84px] shrink-0" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[12px] text-fg-3">Font</div>
          <Select value={model.font} title="The document’s font" onChange={(v) => e?.setDoc({ font: v })} options={FONTS.map((f) => ({ value: f.name, label: f.name, style: { fontFamily: f.css } }))} />
        </div>
        <div className="w-[96px] shrink-0 space-y-1.5">
          <div className="text-[12px] text-fg-3">Size</div>
          <NumInput value={model.size} onChange={(v) => e?.setDoc({ size: v })} min={6} max={72} step={0.5} unit="pt" label="The document’s size" className="w-full" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="space-y-1.5">
          <div className="text-[12px] text-fg-3">Orientation</div>
          <Segmented
            size="sm"
            value={model.page.orient ?? 'portrait'}
            onChange={(v) => {
              const { orient: _o, ...page } = model.page;
              e?.setDoc({ page: v === 'landscape' ? { ...page, orient: 'landscape' } : page });
            }}
            options={[
              { value: 'portrait', label: 'Portrait' },
              { value: 'landscape', label: 'Landscape' },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <div className="text-[12px] text-fg-3">Columns</div>
          <Segmented
            size="sm"
            value={String(model.page.cols ?? 1)}
            onChange={(v) => {
              const { cols: _c, ...page } = model.page;
              e?.setDoc({ page: v === '1' ? page : { ...page, cols: Number(v) as 2 | 3 } });
            }}
            options={['1', '2', '3'].map((k) => ({ value: k, label: k }))}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Page colour</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {['#ffffff', '#fffdf5', '#fef7e0', '#f1f3f4', '#e8f0fe', '#e6f4ea', '#fce8e6'].map((c) => (
            <button
              key={c}
              type="button"
              title={c === '#ffffff' ? tr('White') : c}
              aria-label={c === '#ffffff' ? tr('White') : c}
              onClick={() => {
                const { color: _c, ...page } = model.page;
                e?.setDoc({ page: c === '#ffffff' ? page : { ...page, color: c } });
              }}
              style={{ background: c }}
              className={cx('h-6 w-6 rounded-full border border-black/15', (model.page.color ?? '#ffffff') === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
            />
          ))}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]" title={tr('Another colour')}>
            <input type="color" value={model.page.color ?? '#ffffff'} onChange={(ev) => e?.setDoc({ page: { ...model.page, color: ev.target.value } })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] text-fg-3">Watermark</div>
        <div className="flex gap-1.5">
          <input
            value={model.mark?.text ?? ''}
            onChange={(ev) => {
              const en = engine.current;
              if (!en) return;
              const { mark: _m, ...rest } = en.doc;
              const text = ev.target.value.slice(0, 60);
              en.change(text.trim() ? { ...rest, mark: { text } } : rest, 'mark');
            }}
            placeholder={model.mark?.src ? tr('A picture') : 'DRAFT'}
            aria-label="The watermark's words"
            className={cx(inputCls, 'h-8 min-w-0 flex-1')}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void (async () => {
                const f = await choosePicture();
                const en = engine.current;
                if (!f || !en) return;
                try {
                  const p = await uploadPicture(f);
                  const { mark: _m, ...rest } = en.doc;
                  en.change({ ...rest, mark: { src: p.src } });
                } catch (err) {
                  toastError(err);
                }
              })()
            }
          >
            Picture
          </Button>
          {model.mark && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const en = engine.current;
                if (!en) return;
                const { mark: _m, ...rest } = en.doc;
                en.change(rest);
              }}
            >
              None
            </Button>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => (setMenu(null), setDialog('bands'))} className="w-full justify-start">
        Header and footer
      </Button>
      <p className="text-[11.5px] leading-relaxed text-fg-3">Headings and the title are sized from the document’s size. The PDF and Word files are set up the same way.</p>
    </div>
  );

  const sp = st?.block && (st.block.type === 'p' || st.block.type === 'li') ? st.block : null;
  const hoverT = hoverTable ? (model.blocks.find((b) => b.id === hoverTable && b.type === 'table') as TableBlock | undefined) : undefined;
  const caretT = st?.block?.type === 'table' ? st.block : undefined;
  const handlesFor = !readOnly && !narrow ? (caretT ?? hoverT) : undefined;
  // Each suggested change's card, beside the page with the comments: Accept, Reject and replies.
  const sgById = new Map((model.suggestions ?? []).map((x) => [x.id, x]));
  const resolveOne = (id: string, accept: boolean) => {
    e?.resolve(id, accept);
    if (active === id) setActive(null);
  };
  const replyTo = (id: string, text: string) =>
    e?.setSuggestions((model.suggestions ?? []).map((x) => (x.id === id ? { ...x, replies: [...(x.replies ?? []), { id: newCommentId(), by: 'user' as const, text, at: Date.now() }] } : x)));
  const extra: Extra[] = changes.map((c) => ({
    id: c.id,
    top: tops.get(c.id),
    node: (
      <SuggestionCard
        change={c}
        sg={sgById.get(c.id)}
        color={suggestionColor(sgById.get(c.id))}
        active={active === c.id}
        readOnly={readOnly || liveOn}
        onFocus={() => {
          setActive(c.id);
          e?.revealSuggestion(c.id);
        }}
        onAccept={() => resolveOne(c.id, true)}
        onReject={() => resolveOne(c.id, false)}
        onReply={(t) => replyTo(c.id, t)}
      />
    ),
  }));
  // Words typed in a comment, a reply or an edit of one (not yet made) hold the agent's version back (noting).
  const notes = {
    onFocus: (ev: React.FocusEvent<HTMLDivElement>) => setNoting(typing(ev.target)),
    onBlur: (ev: React.FocusEvent<HTMLDivElement>) => setNoting(typing(ev.relatedTarget) && ev.currentTarget.contains(ev.relatedTarget as Node)),
  };
  const panelBody = (
    <div className="contents" {...notes}>
      <CommentsPanel
        comments={shownComments}
        all={comments}
        extra={extra}
        showResolved={showResolved}
        setShowResolved={setShowResolved}
        draft={draft}
        onDraft={addDraft}
        onCancelDraft={() => setDraft(null)}
        onAsk={askComments}
        onClose={() => (setPanel(false), setDraft(null))}
        a={ca}
      />
    </div>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg">
      <style>{`${css}\n${marks}\n${ai.css}\n.nd-ed.nd-painting,.nd-ed.nd-painting *{cursor:copy!important}\n::highlight(nd-find){background-color:rgba(255,213,79,.55)}\n::highlight(nd-find-now){background-color:#ff9632;color:#000}\n.nd-math-wait{font-family:${'ui-monospace,monospace'};color:#80868b;font-size:.9em}`}</style>
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 shrink items-center gap-1.5">{lead}</div>
          {/* The menus beside the title, where the header has room for them; one button where it hasn't. */}
          {st && e && <MenuBar menus={readOnly || compare || liveOn ? menus.filter((m) => m.label === 'View' || m.label === 'Tools') : menus} compact={phone ? true : 'auto'} className={phone ? 'shrink-0' : undefined} />}
        </div>
        {(comments.length > 0 || changes.length > 0 || panel) && (
          <button
            ref={commentsRef}
            type="button"
            title="Comments"
            aria-label="Comments"
            onClick={() => (columnFits ? setPrefs({ comments: !view.comments }) : setPanel((p) => !p))}
            className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-fg-2 hover:bg-bg-2 hover:text-fg', (columnFits ? view.comments : panel) && 'bg-bg-2 text-fg')}
          >
            <MessageSquare size={16} />
            {openComments(comments).length + changes.length > 0 && <span className="tabular-nums">{openComments(comments).length + changes.length}</span>}
          </button>
        )}
        {/* On a phone the outline is in View: the header has no room for its button beside the title and the page's own. */}
        {!phone && (
          <IconButton
            ref={outlineRef}
            label={wideOutline ? (outlineOpen ? 'Hide the outline' : 'Show the outline') : 'Outline'}
            active={wideOutline ? outlineOpen : menu === 'outline'}
            onClick={() => (wideOutline ? setOutlineOpen((o) => !o) : setMenu(menu === 'outline' ? null : 'outline'))}
          >
            <ListTree size={16} />
          </IconButton>
        )}
        {/* On a phone, Page setup is in the Format menu: the title keeps its room. */}
        {!readOnly && !phone && (
          <IconButton ref={pageRef} label="Page setup" active={menu === 'page'} disabled={liveOn} onClick={() => setMenu(menu === 'page' ? null : 'page')}>
            <FileCog size={16} />
          </IconButton>
        )}
        {tail}
      </div>
      {band}
      {st && e && !readOnly && !compare && (
        // While an agent's version shows, the toolbar stays where it is, out of use.
        <div inert={liveOn} className={cx('flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden', liveOn && 'opacity-45')}>
          <Toolbar
            engine={e}
            st={st}
            doc={model}
            linking={linking}
            setLinking={setLinking}
            linkRef={linkRef}
            onComment={startComment}
            slim={!phone && width < 820}
            suggesting={mode === 'suggest'}
            onSuggesting={(on) => setMode(on ? 'suggest' : 'edit')}
            onPlot={readOnly ? undefined : () => void plot()}
            onAi={readOnly ? undefined : () => ai.write()}
          />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        {wideOutline && outlineOpen && (
          <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-line bg-panel">
            <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Outline</div>
            {outline}
          </aside>
        )}
        <div ref={scroller} className={cx('min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain', narrow ? 'bg-white' : 'bg-bg-2')}>
          <div className={narrow ? 'min-h-full' : 'px-6 pt-6 pb-[40vh]'}>
            <div
              ref={host}
              className={cx('relative mx-auto', narrow && 'min-h-full')}
              style={{ width: narrow ? '100%' : ppx * zoom + (column ? COLUMN + 24 : 0) }}
              onMouseMove={(ev) => {
                const t = (ev.target as HTMLElement).closest?.('table.nd-table') as HTMLElement | null;
                const id = t?.dataset.b ?? null;
                if (id !== hoverTable && (id || !(ev.target as HTMLElement).closest?.('[data-keeps-editing]'))) setHoverTable(id);
              }}
            >
              {/* The sheets behind the words, on pages; each one's header and footer over them. */}
              {!narrow && pageLayout && <Sheets layout={pageLayout} zoom={zoom} width={ppx * zoom} doc={shownDoc ?? model} src={pictureSrc} />}
              <div
                ref={paper}
                className="nd-ed nd-doc"
                style={
                  narrow
                    ? undefined
                    : {
                        ...(zoom !== 1 ? { zoom } : {}),
                        ...(column ? { marginLeft: 0 } : {}),
                        // In columns the flow is longer than its pages (each column a page of it, shown in its place): the pages' height is the editor's.
                        ...(pageLayout ? { minHeight: pageLayout.count * pageLayout.pageH + (pageLayout.count - 1) * GAP, ...((model.page.cols ?? 1) > 1 ? { height: pageLayout.count * pageLayout.pageH + (pageLayout.count - 1) * GAP } : {}) } : {}),
                      }
                }
              />
              {!narrow && pageLayout && <Bands layout={pageLayout} zoom={zoom} doc={shownDoc ?? model} readOnly={readOnly || liveOn} onOpen={() => setDialog('bands')} />}
              {!narrow && pageLayout && e && (
                <PageNotes
                  layout={pageLayout}
                  zoom={zoom}
                  doc={shownDoc ?? model}
                  refs={e.refs}
                  textW={((paperOf(model.page).w - 2 * model.page.margin) * 96) / 25.4}
                  onOpen={(id, r) => !readOnly && !liveOn && (spotAt(r), setNote({ id }))}
                />
              )}
              {narrow && e && <EndNotes doc={shownDoc ?? model} refs={e.refs} onOpen={(id, r) => !readOnly && !liveOn && (spotAt(r), setNote({ id }))} />}
              {st?.picked && e && st.picked.type !== 'math' && (
                <Picked engine={e} block={st.picked} host={host} tick={tick} readOnly={readOnly} onReplace={(id) => void replacePicture(id)} onAi={(id, mode) => void changePicture(id, mode)} onEdit={openPicture} onAsk={onAsk ? askPicture : undefined} />
              )}
              {handlesFor && e && <ColumnHandles engine={e} table={handlesFor} host={host} tick={`${tick}:${model.blocks.length}`} />}
              {e && !readOnly && !liveOn && !narrow && <BlockHandle engine={e} host={host} paper={paper} tick={model.blocks} />}
              {ai.overlay}
              {liveOn && e && <AgentCaret engine={e} mark={live!.mark} host={host} scroller={scroller} tick={`${drawnLive}:${pageLayout?.n ?? 0}:${zoom}:${narrow}`} />}
              {found.boxes.map((b, k) => (
                <span key={k} className="pointer-events-none absolute rounded-[2px]" style={{ left: b.x, top: b.y, width: b.w, height: b.h, background: b.now ? 'rgba(255,150,50,.55)' : 'rgba(255,213,79,.45)' }} />
              ))}
              {float?.ask && (
                <div
                  ref={askChip}
                  data-keeps-editing
                  onMouseDown={(ev) => ev.preventDefault()}
                  className="absolute z-20 flex h-8 items-center overflow-hidden rounded-full border border-line bg-elevated text-[12.5px] font-medium text-fg shadow-lg"
                  style={{ left: float.ask.x, top: float.ask.y, transform: `translate(-50%, ${phone ? '0' : '-100%'})` }}
                >
                  {!readOnly && (
                    <button type="button" onClick={startComment} className="flex h-full items-center gap-1.5 px-3 hover:bg-bg-2">
                      <MessageSquarePlus size={13} className="text-fg-2" />
                      Comment
                    </button>
                  )}
                  {!readOnly && onAsk && <span className="h-4 w-px bg-line" />}
                  {onAsk && (
                    <button
                      type="button"
                      onClick={() => {
                        const s = st && scopesOf(model, st).find((x) => x.id === 'words');
                        if (s) onAsk(s.lead);
                      }}
                      className="flex h-full items-center gap-1.5 px-3 hover:bg-bg-2"
                    >
                      <Sparkles size={13} className="text-accent" />
                      Ask the agent about it
                    </button>
                  )}
                </div>
              )}
              {float?.link && st?.link && (
                <div
                  data-keeps-editing
                  onMouseDown={(ev) => ev.target instanceof HTMLAnchorElement || ev.preventDefault()}
                  className="absolute z-20 flex max-w-[min(420px,calc(100%-16px))] items-center gap-1 rounded-xl border border-line bg-elevated py-1 pr-1 pl-2.5 shadow-lg"
                  style={{ left: float.link.x, top: float.link.y }}
                >
                  <a href={st.link} target="_blank" rel="noopener noreferrer" translate="no" className="min-w-0 truncate text-[12.5px] text-accent hover:underline">
                    {st.link.replace(/^mailto:/i, '')}
                  </a>
                  <IconButton label="Open the link" size="sm" onClick={() => window.open(st.link!, '_blank', 'noopener,noreferrer')}>
                    <ExternalLink size={14} />
                  </IconButton>
                  <IconButton label="Change the link" size="sm" onClick={() => setLinking({ url: st.link ?? '', text: '' })}>
                    <Link2 size={14} />
                  </IconButton>
                  <IconButton label="Remove the link" size="sm" onClick={() => e?.link(null)}>
                    <Unlink size={14} />
                  </IconButton>
                </div>
              )}
              {slashOpen && slashPos && (
                <SlashMenu
                  items={slashList}
                  index={Math.min(slash!.index, slashList.length - 1)}
                  at={slashPos}
                  bound={scroller.current?.getBoundingClientRect().bottom ?? window.innerHeight}
                  rows={slashBox.rows}
                  width={slashBox.width}
                  onPick={pickSlash}
                  onHover={(k) => setSlash((s) => (s ? { ...s, index: k } : s))}
                />
              )}
              {column && (
                <div className="contents" {...notes}>
                  <CommentsColumn
                    comments={shownComments}
                    tops={tops}
                    extra={extra}
                    draft={draft}
                    onDraft={addDraft}
                    onCancelDraft={() => setDraft(null)}
                    onAsk={askComments}
                    a={ca}
                    left={ppx * zoom + 24}
                    width={COLUMN}
                  />
                </div>
              )}
              <div ref={spotRef} className="pointer-events-none absolute" style={spot ? { left: spot.x, top: spot.y, width: spot.w, height: spot.h } : { left: 0, top: 0, width: 1, height: 1 }} />
            </div>
          </div>
        </div>
        {panelW > 0 && <aside className="w-[320px] shrink-0 border-l border-line bg-panel">{panelBody}</aside>}
        {ai.panel && (phone ? <div className="absolute inset-0 z-30 bg-panel">{ai.panel}</div> : <aside className="w-[340px] shrink-0 border-l border-line bg-panel">{ai.panel}</aside>)}
        {compare && (
          <CompareView
            merged={compare.merged}
            version={compare.version}
            at={compare.at}
            src={pictureSrc}
            math={drawMath}
            phone={phone}
            onRestore={compare.from === 'tools' ? () => void restoreVersion() : undefined}
            onBack={() => setCompare(null)}
            backLabel={compare.from === 'versions' ? 'This version as it was' : undefined}
          />
        )}
        {phone && panel && <div className="absolute inset-0 z-30 bg-panel">{panelBody}</div>}
        {ai.bar && <div className={cx('absolute right-3 z-30', find.open ? 'top-14' : 'top-2')}>{ai.bar}</div>}
        {find.open && (
          <div className="absolute top-2 right-3 z-30 max-w-[calc(100%-24px)]" data-keeps-editing>
            <FindBar
              find={{
                ...find,
                close: () => {
                  find.close();
                  found.select();
                },
              }}
              count={found.count}
              index={found.index}
              onNext={found.next}
              onPrev={found.prev}
              onReplace={readOnly ? undefined : found.replace}
              onReplaceAll={readOnly ? undefined : found.replaceAll}
            />
          </div>
        )}
        {view.count && (
          <button
            type="button"
            onClick={openCount}
            title="Word count"
            className="absolute right-3 bottom-1.5 rounded-md bg-bg/80 px-1.5 text-[11px] text-fg-3 tabular-nums hover:text-fg"
            style={{ right: panelW ? panelW + 12 : corner ? 64 : 12 }}
          >
            {`${words.toLocaleString(LOCALE)} word${words === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      {dirty && !readOnly && (
        <div className={cx('flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]', corner && 'pr-16')}>
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
      <Popover anchor={phone ? spotRef : pageRef} open={menu === 'page'} onClose={() => (setMenu(null), e?.refocusSoon())} align="end" width={340} title="Page setup">
        {pageSetup}
      </Popover>
      <Popover anchor={phone ? spotRef : outlineRef} open={menu === 'outline' && !wideOutline} onClose={() => (setMenu(null), e?.refocusSoon())} align="end" width={280} title="Outline">
        <div className="max-h-[min(60vh,440px)] overflow-y-auto">{outline}</div>
      </Popover>
      <Popover anchor={linkRef} open={menu === 'url'} onClose={() => (setMenu(null), e?.refocusSoon())} width={300} title="A picture from the web">
        <form
          className="space-y-2 p-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            const u = url.trim();
            setMenu(null);
            setUrl('');
            if (u) void pictureUrl(u);
          }}
        >
          <p className="text-[12px] text-fg-3">The picture’s own address (it ends in .jpg, .png…). The app keeps a copy in the document.</p>
          <input autoFocus value={url} onChange={(ev) => setUrl(ev.target.value)} placeholder="https://…" className={inputCls} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" type="submit" disabled={!url.trim()}>
              Add it
            </Button>
          </div>
        </form>
      </Popover>
      <Popover anchor={spotRef} open={!!eq} onClose={() => (setEq(null), e?.refocusSoon())} width={360} title="Equation">
        {eq && (
          <EquationBox
            initial={eq.kind === 'new' ? '' : eq.tex}
            display={eq.kind === 'block' || (eq.kind === 'new' && !eq.inline)}
            onCancel={() => (setEq(null), e?.refocusSoon())}
            onRemove={eq.kind === 'block' ? () => (e?.setMath(eq.id, ''), setEq(null)) : eq.kind === 'run' ? () => (e?.setMathRun(eq.at, ''), setEq(null)) : undefined}
            onDone={(tex) => {
              if (!e || !tex.trim()) return setEq(null);
              if (eq.kind === 'block') e.setMath(eq.id, tex);
              else if (eq.kind === 'run') e.setMathRun(eq.at, tex);
              else if (eq.inline) e.insertMathRun(tex);
              else {
                e.insertMath(tex);
                e.setPicked(null);
              }
              setEq(null);
              e?.refocusSoon();
              void loadKatex().then(() => setMath((m) => m || 1));
            }}
          />
        )}
      </Popover>
      <Popover anchor={spotRef} open={!!note} onClose={() => (note?.undo && !model.notes?.find((n) => n.id === note.id)?.runs.length ? noteDone([]) : setNote(null), e?.refocusSoon())} width={340} title="Footnote">
        {note && (
          <NoteBox
            key={note.id}
            runs={model.notes?.find((n) => n.id === note.id)?.runs ?? []}
            number={e?.refs.note(note.id) ?? 0}
            onDone={noteDone}
            onCancel={() => (note.undo && !model.notes?.find((n) => n.id === note.id)?.runs.length ? noteDone([]) : setNote(null), e?.refocusSoon())}
            onRemove={noteRemove}
          />
        )}
      </Popover>
      <Popover anchor={spotRef} open={!!cite} onClose={() => (setCite(null), e?.refocusSoon())} width={360} title="Citation">
        {cite && (
          <CiteBox
            key={`${cite.at.b}:${cite.at.o}`}
            t={cite.t}
            doc={model}
            onChange={(t) => (e?.setAtom(cite.at, t), setCite(null), e?.refocusSoon())}
            onAdd={() => (setCiteFind({ add: cite }), setCite(null))}
            onRemove={() => (e?.setAtom(cite.at, null), setCite(null), e?.refocusSoon())}
          />
        )}
      </Popover>
      <CiteDialog open={!!citeFind} doc={model} onClose={() => (setCiteFind(null), e?.refocusSoon())} onCite={citeSource} onStyle={citeStyle} />
      <Popover anchor={spotRef} open={!!chars} onClose={() => (setChars(null), e?.refocusSoon())} width={340} title={chars?.kind === 'icon' ? 'The callout’s emoji' : 'Special characters'}>
        {chars && (
          <CharPicker
            kinds={chars.kind === 'icon' ? ['emoji'] : undefined}
            onPick={(ch) => {
              if (chars.kind === 'icon') e?.callout(chars.id, { icon: ch });
              else e?.typeText(ch);
              setChars(null);
              e?.refocusSoon();
            }}
          />
        )}
      </Popover>
      <WordCountDialog open={dialog === 'count'} onClose={() => (setDialog(null), e?.refocusSoon())} counts={counts} picked={counts.picked} showCount={view.count} setShowCount={(on) => setPrefs({ count: on })} />
      <SpacingDialog open={dialog === 'spacing'} onClose={() => (setDialog(null), e?.refocusSoon())} value={{ lh: sp?.lh, sb: sp?.sb, sa: sp?.sa }} onApply={(v) => e?.spacing(v)} />
      <BandsDialog open={dialog === 'bands'} onClose={() => (setDialog(null), e?.refocusSoon())} header={model.header} footer={model.footer} titlePage={model.titlePage} onApply={(v) => e?.setBands(v)} />
      <VersionsDialog open={versions} pageId={pageId} onClose={() => (setVersions(false), e?.refocusSoon())} onPick={(v) => void compareWith(v)} />
      {ai.dialogs}
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => (setDialog(null), e?.refocusSoon())} groups={SHORTCUTS} />
      {dialog === 'signature' && (
        <Suspense fallback={null}>
          <InsertSignature
            open
            onClose={() => (setDialog(null), e?.refocusSoon())}
            onInsert={(p) => {
              if (!e) return;
              // Sized for a signature line (initials smaller), on the left as a signature is; its handles size it after.
              const b = e.picture(p.src, (SIGNATURE_WIDTH_MM[p.kind] * 96) / 25.4);
              e.insert([{ ...b, align: 'left', alt: tr(p.kind === 'initials' ? 'Initials' : 'Signature') }]);
            }}
          />
        </Suspense>
      )}
      {confirmNode}
    </div>
  );
}

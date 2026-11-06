// A slide deck to edit and present, as in PowerPoint or Google Slides: the slides down the side (or across under
// the slide on a phone) to pick, drag into order, copy and skip; the slide itself to edit (SlideCanvas), zoomed and
// scrolled, with a grid, rulers and guides; menus (Edit, View, Insert, Format, Arrange, Slide, Tools, and Search the
// menus) and a toolbar of the most used (new slides from layouts, text, shapes, pictures, lines and arrows, tables,
// charts, the format painter, how words look); a side panel for the part picked, the animations, the slide and the
// theme (Inspector); speaker notes under the slide; Find and replace across the slides and notes; every slide at once
// (Grid); and Present: the slideshow, or the presenter's view with the audience's window. Changes stay unsaved until
// Save (Ctrl+S), as a page's do; Undo and Redo go back and forth. While an agent writes a new version (live.ts), it
// shows as it comes, read-only: the slide being written on view, a box round the part its words arrive in. A deck is
// made for the web (custom code, web pages, quizzes, 3D, the web's effects) unless it is made PowerPoint compatible
// (Theme → Made for, or Tools); its live parts run in frames of their own, in the slideshow, and here once Run is pressed. The AI tools
// (images/studio) make pictures, drawings, plots and videos for it, change a picture picked, make a chart a plot and
// a slide's background: each result lands as an uploaded one does, or takes the place of what it changed, one step to undo.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChartScatter,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  CornerDownRight,
  Crop,
  Eraser,
  Grid2x2,
  Group as GroupIcon,
  Image as ImageIcon,
  ImageMinus,
  LayoutTemplate,
  Link2,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  MonitorPlay,
  MoveRight,
  Paintbrush,
  PenTool,
  PieChart,
  Play,
  Plus,
  Presentation,
  Redo2,
  Scissors,
  Shapes,
  Shrink,
  SlidersHorizontal,
  Sparkles,
  Spline,
  Table2,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  WandSparkles,
} from 'lucide-react';
import { hexColor, isWebDeck, keptVideo, newId, reconnect, slideTitle, SHAPES, turnedBox, videoSrc, videoStart, type ChartEl, type Deck, type El, type ImageEl, type LayoutId, type TextEl, type VideoEl } from '@shared/slides';
import { csvOf, editPicture, makeDrawing, makePicture, makePlot, makeVideo } from '../../images/studio';
import type { EditorHandle } from '../../mediaedit/host';
import { editKeptVideo } from '../../mediaedit/video/open';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, useConfirm } from '../../../components/ui';
import { FindBar, useFind } from '../common/FindBar';
import { isMod, keyLabel } from '../common/keys';
import { MenuBar } from '../common/menus';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import { Inspector, INSPECTOR_TABS, SHAPE_NAMES, ShapeIcon, type InspectorTab } from './Inspector';
import {
  addEls,
  addSlide,
  align,
  chart,
  codePart,
  connector,
  copies,
  distribute,
  duplicateSlides,
  embedAddress,
  embedPart,
  findEl,
  groupEls,
  HISTORY_MAX,
  htmlPart,
  image,
  line,
  lookOf,
  moveSlide,
  onSlide,
  partName,
  pickedOf,
  quizPart,
  removeEls,
  removeSlides,
  restack,
  scene3dPart,
  scorePart,
  setAnim,
  setEls,
  setSlide,
  shape,
  table,
  textBox,
  topOf,
  toWebFormat,
  ungroup,
  withLook,
  W,
  heightOf,
  type History,
  type Look,
} from './ops';
import type { AskScope, ModelDoc, ModelEditorProps } from '../kinds';
import { tr } from '../../../i18n/runtime';
import { Presenter, Slideshow } from './Present';
import { choosePicture as chooseFile, uploadPicture as upload } from '../pictures';
import { useDeckFonts } from './rt';
import { SlideCanvas, type CanvasHandle, type CellSel, type CommentPin, type FindMark, type GridOpts } from './SlideCanvas';
import { LayoutGrid, Strip } from './Strip';
import { textActions, TextBar } from './TextBar';
import { slidesMenus, type RichKind } from './SlidesMenus';
import { FormatDialog } from './FormatDialog';
import { IconPicker, type IconDef } from './IconPicker';
import { FooterDialog } from './FooterDialog';
import { NotesField } from './Notes';
import { findInDeck, replaceAllInDeck, replaceHit } from './find';
import { exportFile } from '../exportFile';
import { chooseModel, chooseVideo, fetchVideoStill, firstFrame, isVideoFile, uploadModel, uploadVideo } from './media';
import { SlideComments } from './SlideComments';

export type SlidesDoc = ModelDoc<Deck>;

/** Parts copied (or cut), to paste on another slide or in another deck while the app is open. */
let clip: El[] | null = null;
/** A part's look copied (Copy the look), to put on others. */
let lookClip: Look | null = null;

const PRESET_KEY = 'wa.slides.notes';
const GRID_KEY = 'wa.slides.grid';
const RULERS_KEY = 'wa.slides.rulers';

/** What an agent asked now could be about: this slide, every slide, the parts picked. */
function scopesFor(index: number, title: string, parts: string[]): AskScope[] {
  const n = index + 1;
  const t = title ? ` (“${title.length > 40 ? `${title.slice(0, 39)}…` : title}”)` : '';
  const out: AskScope[] = [
    { id: 'slide', label: `${tr('This slide')} · ${n}`, lead: `On slide ${n}${t}: ` },
    { id: 'all', label: tr('Every slide'), lead: 'On every slide: ' },
  ];
  if (parts.length) out.push({ id: 'part', label: `${tr('What’s picked')}: ${parts.join(', ')}`, lead: `On slide ${n}, the ${parts.map((x) => x.replace(/^(\w)/, (c) => c.toLowerCase())).join(' and the ')}: ` });
  return out;
}

/** A deck's colours as the AI tools take them (#hex): its accent, then its charts' colours. */
const colorsOf = (d: Deck) => [...new Set([d.theme.accent, ...d.theme.colors].map((c) => `#${hexColor(c, d.theme).hex}`))].slice(0, 6);

/** The look a plot is drawn in: the deck's colours and font. */
const plotTheme = (d: Deck) => ({ colors: colorsOf(d), fg: `#${hexColor(d.theme.fg, d.theme).hex}`, bg: `#${hexColor(d.theme.bg, d.theme).hex}`, font: d.theme.font });

/** A chart's numbers as CSV: its labels down the side, a column for each series. */
const chartCsv = (c: ChartEl) => csvOf([[c.title?.trim() || 'Label', ...c.series.map((s) => s.name)], ...c.labels.map((l, i) => [l, ...c.series.map((s) => String(s.values[i] ?? ''))])]);

const savedGrid = (): GridOpts => {
  try {
    const g = JSON.parse(localStorage.getItem(GRID_KEY) ?? 'null');
    if (g && typeof g === 'object') return { show: !!g.show, snap: !!g.snap, size: [10, 20, 40, 80].includes(g.size) ? g.size : 40 };
  } catch {}
  return { show: false, snap: false, size: 40 };
};

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Slides',
    items: [
      ['Ctrl+M', 'A new slide'],
      ['PageDown / PageUp', 'The next or the previous slide'],
      ['F5 / Ctrl+Enter', 'Present from the beginning'],
      ['Shift+F5', 'Present from this slide'],
      ['Ctrl+S', 'Save'],
    ],
  },
  {
    title: 'Parts of a slide',
    items: [
      ['Ctrl+C / Ctrl+X / Ctrl+V', 'Copy, cut, paste'],
      ['Ctrl+D', 'Duplicate'],
      ['Delete', 'Delete'],
      ['Ctrl+A', 'Select all'],
      ['Arrow keys', 'Move it a pixel (with Shift: ten)'],
      ['Enter', 'Change its words; into a group'],
      ['Esc', 'Pick nothing; out of a group'],
      ['Ctrl+G', 'Group'],
      ['Ctrl+Shift+G', 'Ungroup'],
      ['Ctrl+↑ / Ctrl+↓', 'Bring forward, send backward'],
      ['Ctrl+Shift+↑ / Ctrl+Shift+↓', 'Bring to front, send to back'],
      ['Ctrl+Shift+C / Ctrl+Shift+V', 'Copy the look, paste the look'],
      ['Ctrl+Alt+M', 'A comment on it (or on the slide)'],
      ['Alt', 'While dragging: no snapping'],
      ['Shift', 'While dragging: straight across or down; while sizing: keep or lose its shape'],
    ],
  },
  {
    title: 'Words',
    items: [
      ['Ctrl+B / Ctrl+I / Ctrl+U', 'Bold, italic, underline'],
      ['Ctrl+Shift+. / Ctrl+Shift+,', 'Bigger text, smaller text'],
      ['Tab / Shift+Tab', 'A level deeper, a level up'],
      ['Esc', 'Done changing the words'],
    ],
  },
  {
    title: 'Viewing',
    items: [
      ['Ctrl+Alt+= / Ctrl+Alt+-', 'Zoom in, zoom out'],
      ['Ctrl+Alt+0', 'Fit the slide'],
      ['Ctrl+scroll', 'Zoom where the pointer is'],
      ['Ctrl+F', 'Find'],
      ['Ctrl+H', 'Find and replace'],
      ['Alt+/', 'Search the menus'],
      ['Ctrl+/', 'Keyboard shortcuts'],
    ],
  },
  {
    title: 'Slideshow',
    items: [
      ['Right arrow / Space / Enter', 'Next'],
      ['Left arrow / Backspace', 'Previous'],
      ['A number, then Enter', 'Go to that slide'],
      ['B / W', 'A black or white screen'],
      ['G', 'Every slide'],
      ['L', 'Laser pointer'],
      ['P', 'Pen'],
      ['E', 'Erase the drawings'],
      ['C', 'Live captions'],
      ['Esc', 'End the slideshow'],
    ],
  },
];

export function SlidesEditor({
  doc,
  pageId,
  layout,
  readOnly: readOnlyProp,
  onSave,
  lead,
  tail,
  band,
  savedNote,
  onDirty,
  onAsk,
  onScopes,
  saveNowRef,
  startPresent,
  live: agent,
}: ModelEditorProps<Deck> & {
  /** Opens presenting at once (the library's Present). */
  startPresent?: boolean;
}) {
  const [own, setDeck] = useState<Deck | null>(doc?.model ?? null);
  // The deck as the latest change left it (changes made one after another, before it is drawn again, build on it).
  const live = useRef<Deck | null>(own);
  const setD = (n: Deck | null) => {
    live.current = n;
    setDeck(n);
  };
  const [saved, setSaved] = useState<Deck | null>(doc?.model ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  /** A comment being written (on a part of the slide, or the slide). */
  const [adding, setAdding] = useState<{ el?: string } | null>(null);
  // An agent's version being written shows in place of the deck (read-only, the slide being written in view), unless
  // there are changes here not saved: those are left as they are. Words being typed here (in a text box or a comment)
  // hold it back until they are done. The deck itself stays as it is underneath.
  const liveDeck = agent && !editing && !adding && !(!!own && own !== saved) ? agent.model : null;
  const liveOn = !!liveDeck;
  const deck = liveDeck ?? own;
  const readOnly = !!readOnlyProp || liveOn;
  const [hist, setHist] = useState<History>({ past: [], future: [] });
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [scope, setScope] = useState<string[]>([]);
  const [tab, setTab] = useState<InspectorTab>('format');
  const [view, setView] = useState<'edit' | 'grid'>('edit');
  const [present, setPresent] = useState<{ from: number; presenter: boolean } | null>(startPresent ? { from: 0, presenter: false } : null);
  const [menu, setMenu] = useState<'slide' | 'shape' | 'line' | 'picture' | 'present' | 'context' | null>(null);
  const [ctxAt, setCtxAt] = useState<{ x: number; y: number } | null>(null);
  const [notesOpen, setNotesOpen] = useState(() => localStorage.getItem(PRESET_KEY) !== '0');
  const [drawer, setDrawer] = useState<'open' | 'closed'>('closed');
  const [saving, setSaving] = useState(false);
  const [urlAsk, setUrlAsk] = useState<{ replace?: string } | null>(null);
  const [url, setUrl] = useState('');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [grid, setGridState] = useState<GridOpts>(savedGrid);
  const [rulers, setRulersState] = useState(() => localStorage.getItem(RULERS_KEY) === '1');
  const [painter, setPainter] = useState<{ look: Look; keep: boolean } | null>(null);
  const [cropping, setCropping] = useState<string | null>(null);
  const [iconAsk, setIconAsk] = useState<{ replace?: string; start: 'icons' | 'emoji' } | null>(null);
  const [videoAsk, setVideoAsk] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  /** Asked for a web page's address (Insert → Interactive → Web page). */
  const [embedAsk, setEmbedAsk] = useState<{ web?: boolean } | null>(null);
  const [embedUrl, setEmbedUrl] = useState('');
  /** The dialog before the deck is made PowerPoint compatible. */
  const [compatAsk, setCompatAsk] = useState(false);
  /** The live part (custom code, a web page, 3D) running in place, until something else is picked. */
  const [running, setRunning] = useState<string | null>(null);
  /** An animation whose starting part (a click on which plays it) is being picked on the slide. */
  const [pickFor, setPickFor] = useState<string | null>(null);
  /** A video from this device on its way to the app: how much of it went (0–1), shown over the slide. */
  const [sending, setSending] = useState<number | null>(null);
  /** The thread picked in the Comments tab. */
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [footerOpen, setFooterOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [cellSel, setCellSel] = useState<CellSel | null>(null);
  const [texFocus, setTexFocus] = useState(0);
  const [confirm, confirmNode] = useConfirm();
  const find = useFind();
  const [findAt, setFindAt] = useState(-1);
  const canvas = useRef<CanvasHandle>(null);
  const root = useRef<HTMLDivElement>(null);
  const anchors = { slide: useRef<HTMLButtonElement>(null), shape: useRef<HTMLButtonElement>(null), line: useRef<HTMLButtonElement>(null), picture: useRef<HTMLButtonElement>(null), present: useRef<HTMLButtonElement>(null) };
  const ctxRef = useRef<HTMLDivElement>(null);
  const fonts = useDeckFonts(deck);
  const [width, setWidth] = useState(1200);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const wide = width >= 900 && layout !== 'sheet';
  const mid = width >= 640 && layout !== 'sheet';
  const dirty = !!own && own !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]);
  useEffect(() => localStorage.setItem(PRESET_KEY, notesOpen ? '1' : '0'), [notesOpen]);
  const setGrid = (g: Partial<GridOpts>) =>
    setGridState((old) => {
      const next = { ...old, ...g };
      localStorage.setItem(GRID_KEY, JSON.stringify(next));
      return next;
    });
  const setRulers = (on: boolean) => {
    setRulersState(on);
    localStorage.setItem(RULERS_KEY, on ? '1' : '0');
  };

  // Another deck, or the agent's new version while nothing was changed here: start from it (before it is drawn, so the
  // one it replaces never shows again for a moment). Words being typed in a text box keep it waiting until they are done:
  // then they are a change here, left as it is, or there are none and it comes in.
  const taken = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!doc || doc.key === taken.current) return;
    if (dirtyRef.current || editing) return;
    taken.current = doc.key;
    setD(doc.model);
    setSaved(doc.model);
    setHist({ past: [], future: [] });
    setCur((c) => Math.min(c, doc.model.slides.length - 1));
    setSel((s) => s.filter((id) => doc.model.slides.some((x) => pickedOf(x, [id]).length)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key, !!editing, dirty]);

  const index = deck ? Math.min(cur, deck.slides.length - 1) : 0;
  const slide = deck?.slides[index];
  // The slide being written stays in view, unless a slide was picked here in the last few seconds.
  const pickedAt = useRef(0);
  // While an agent's version shows, the toolbar and the panel (out of use) stay as they were: nothing in them draws again.
  const held = useRef<Record<string, ReactNode>>({});
  const hold = (k: string, node: ReactNode) => {
    if (!liveOn || !(k in held.current)) held.current[k] = node;
    return held.current[k];
  };
  const mark = liveOn && agent?.mark?.kind === 'slides' ? agent.mark : null;
  useEffect(() => {
    if (!mark || performance.now() - pickedAt.current < 4000) return;
    setCur(mark.slide);
  }, [mark?.slide, agent?.n]);
  useEffect(() => {
    if (liveOn) setSel([]);
  }, [liveOn]);
  // Another slide: out of any group, no cells or crop.
  useEffect(() => {
    setScope([]);
    setCellSel(null);
    setCropping(null);
  }, [index]);

  useEffect(() => {
    if (!deck || !slide) return;
    onScopes?.(scopesFor(index, slideTitle(slide), pickedOf(slide, sel).map(partName)));
  }, [deck, index, sel]);

  /** A change to the deck: kept for Undo (changes of one kind in a row go back together). */
  const change = (next: Deck | ((d: Deck) => Deck), key?: string) => {
    const d = live.current;
    if (readOnly || !d) return;
    const n0 = typeof next === 'function' ? next(d) : next;
    if (n0 === d) return;
    // A part moved, sized or turned takes the connectors stuck to it along.
    let along = false;
    const slides = n0.slides.map((s, i) => {
      if (s === d.slides[i]) return s;
      const r = reconnect(s);
      if (r !== s) along = true;
      return r;
    });
    const n = along ? { ...n0, slides } : n0;
    const now = Date.now();
    setHist((h) => {
      const same = !!key && h.last?.key === key && now - h.last.at < 1200;
      return { past: same ? h.past : [...h.past, d].slice(-HISTORY_MAX), future: [], last: key ? { key, at: now } : undefined };
    });
    setD(n);
  };
  /** What is picked, less the parts the deck no longer has on this slide (an Undo took them away). */
  const keepPicked = (d: Deck) => setSel((s) => s.filter((id) => pickedOf(d.slides[Math.min(cur, d.slides.length - 1)], [id]).length));
  const undo = () => {
    // Words being changed in place are kept first; the next Undo takes them back.
    if (editing) return canvas.current?.stopEditing();
    if (readOnly) return;
    const d = live.current;
    if (!hist.past.length || !d) return;
    setHist({ past: hist.past.slice(0, -1), future: [d, ...hist.future] });
    setD(hist.past[hist.past.length - 1]);
    keepPicked(hist.past[hist.past.length - 1]);
  };
  const redo = () => {
    const d = live.current;
    if (!hist.future.length || !d || readOnly) return;
    const [next, ...rest] = hist.future;
    setHist({ past: [...hist.past, d], future: rest });
    setD(next);
    keepPicked(next);
  };

  const save = async (): Promise<boolean> => {
    if (!deck || !onSave || saving || liveOn) return false;
    // Words being changed in place go in first.
    const got = canvas.current?.readText();
    let d = live.current ?? deck;
    if (got) {
      d = setEls(d, index, [got.id], (e) => ({ ...e, paras: got.paras }) as El);
      setD(d);
    }
    setSaving(true);
    try {
      if (await onSave(d)) {
        setSaved(d);
        return true;
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
    return false;
  };
  const saveNow = useRef(save);
  saveNow.current = save;
  if (saveNowRef) saveNowRef.current = () => (dirtyRef.current ? saveNow.current() : Promise.resolve(true));

  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The slides go back to how they were saved.', confirm: 'Discard', danger: true }))) return;
    canvas.current?.stopEditing();
    setD(saved);
    setHist({ past: [], future: [] });
    setSel([]);
  };

  // ---- Find and replace --------------------------------------------------------------------------------
  const hits = useMemo(() => (find.open && deck ? findInDeck(deck, find.query, find.options) : []), [deck, find.open, find.query, find.options]);
  const findKey = `${find.open}|${find.query}|${JSON.stringify(find.options)}`;
  const lastKey = useRef('');
  useEffect(() => {
    if (lastKey.current !== findKey) {
      // Asked anew: the first match from this slide on.
      lastKey.current = findKey;
      const from = hits.findIndex((h) => h.slide >= index);
      setFindAt(hits.length ? (from < 0 ? 0 : from) : -1);
    } else setFindAt((i) => (hits.length ? Math.min(Math.max(i, 0), hits.length - 1) : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hits]);
  const hit = findAt >= 0 ? hits[findAt] : undefined;
  // The match on view: its slide, and its notes open when it is in them.
  useEffect(() => {
    if (!hit) return;
    if (hit.slide !== index) {
      canvas.current?.stopEditing();
      setCur(hit.slide);
      setSel([]);
      setView('edit');
    }
    if (hit.where === 'notes') {
      if (wide) setNotesOpen(true);
      else {
        setTab('notes' as InspectorTab);
        setDrawer('open');
      }
    }
    // In a chart, an equation, a quiz, a score or code: it is picked, so the side panel shows its numbers, its LaTeX or its words.
    if ((hit.where === 'chart' || hit.where === 'tex' || hit.where === 'words') && hit.id && deck) {
      setSel([topOf(deck.slides[hit.slide], hit.id)?.id ?? hit.id]);
      setTab('format');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit?.slide, hit?.where, hit?.s, hit?.id, hit?.para]);
  const marks: FindMark[] = hits
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.slide === index && h.where !== 'notes')
    .map(({ h, i }) => ({ id: h.id!, para: h.para, cell: h.cell, chart: h.where === 'chart' ? h.t : undefined, tex: h.where === 'tex' || undefined, whole: h.where === 'words' || undefined, s: h.s, e: h.e, current: i === findAt }));
  const noteMarks = hits
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.slide === index && h.where === 'notes')
    .map(({ h, i }) => ({ s: h.s, e: h.e, current: i === findAt }));
  const findStep = (by: 1 | -1) => hits.length && setFindAt((i) => (i + by + hits.length) % hits.length);
  const replaceOne = () => {
    if (!hit || !deck) return;
    canvas.current?.stopEditing();
    change((d) => replaceHit(d, hit, find.query, find.replacement, find.options));
  };
  const replaceAll = () => {
    if (!deck) return;
    canvas.current?.stopEditing();
    const r = replaceAllInDeck(live.current ?? deck, find.query, find.replacement, find.options);
    if (!r.count) return;
    change(r.deck);
    toast(r.count === 1 ? 'Replaced 1' : `Replaced ${r.count}`, 'ok');
  };

  // ---- adding things -------------------------------------------------------------------------------------
  const put = (els: El[], o: { web?: boolean } = {}) => {
    if (!deck) return;
    canvas.current?.stopEditing();
    setScope([]);
    // A part of the web format put in a PowerPoint compatible deck takes it to the web format, in the same step.
    change((d) => addEls(o.web ? toWebFormat(d) : d, index, els));
    setSel(els.map((e) => e.id));
    setTab('format');
    setView('edit');
  };
  const newSlide = (l: LayoutId, after = index) => {
    if (!deck) return;
    canvas.current?.stopEditing();
    const r = addSlide(deck, after, l);
    change(r.deck);
    setCur(r.at);
    setSel([]);
    setMenu(null);
  };
  const pickPicture = async () => {
    const f = await chooseFile();
    if (!f) return null;
    try {
      toast('Adding the picture…');
      return await upload(f);
    } catch (e) {
      toastError(e);
      return null;
    }
  };
  const addPicture = async () => {
    setMenu(null);
    const p = await pickPicture();
    if (p && deck) put([image(deck, p.src, p.w, p.h)]);
  };
  const replacePicture = async (id: string) => {
    const p = await pickPicture();
    if (p) change((d) => setEls(d, index, [id], (e) => ({ ...e, src: p.src, crop: undefined }) as El));
  };
  const pictureFromUrl = async () => {
    const u = url.trim();
    const target = urlAsk;
    setUrlAsk(null);
    setUrl('');
    if (!u || !deck) return;
    try {
      const r = await post<{ src: string }>('/api/pages/assets', { url: /^https?:\/\//i.test(u) ? u : `https://${u}` });
      const size = await new Promise<{ w: number; h: number }>((ok) => {
        const i = new Image();
        i.onload = () => ok({ w: i.naturalWidth || 800, h: i.naturalHeight || 600 });
        i.onerror = () => ok({ w: 800, h: 600 });
        i.src = `/api/pages/assets/${r.src.slice('naget-asset:'.length)}`;
      });
      if (target?.replace) change((d) => setEls(d, index, [target.replace!], (e) => ({ ...e, src: r.src, crop: undefined }) as El));
      else put([image(deck, r.src, size.w, size.h)]);
    } catch (e) {
      toastError(e);
    }
  };
  const centred = (w: number, h: number) => ({ x: Math.round((W - w) / 2), y: Math.round(((deck ? heightOf(deck) : 720) - h) / 2), w, h });
  const putIcon = (ic: IconDef) => {
    if (!deck) return;
    const replace = iconAsk?.replace;
    if (replace) return change((d) => setEls(d, index, [replace], (e) => ({ ...e, icon: ic.name, paths: ic.paths }) as El));
    put([{ id: newId(), type: 'icon', icon: ic.name, paths: ic.paths, ...centred(160, 160) }]);
  };
  const putEmoji = (ch: string) => {
    if (!deck) return;
    const t = textBox(deck);
    put([{ ...t, ...centred(200, 200), paras: [{ runs: [{ t: ch }], align: 'center' }], size: 140, align: 'center', valign: 'middle', role: undefined, ph: undefined, fit: 'none', pad: 0 } as TextEl]);
  };
  const putEquation = () => {
    if (!deck) return;
    put([{ id: newId(), type: 'math', tex: 'e^{i\\pi} + 1 = 0', ...centred(560, 140) }]);
    setTexFocus((n) => n + 1);
    if (!wide) setDrawer('open');
  };
  /** A YouTube or Vimeo video put on the slide, with its still (fetched and kept by the server; without one when it can't be had). */
  const putOnlineVideo = async (address: string) => {
    const src = videoSrc(address);
    if (!src) return;
    const start = videoStart(address);
    toast('Adding the video…');
    const poster = await fetchVideoStill(address);
    if (!live.current) return;
    put([{ id: newId(), type: 'video', src, ...(poster ? { poster } : {}), ...(start ? { start } : {}), ...centred(800, 450) }]);
  };
  const putVideo = () => {
    const address = videoUrl.trim();
    if (!videoSrc(address) || !deck) return;
    setVideoAsk(false);
    setVideoUrl('');
    void putOnlineVideo(address);
  };
  /** A video from this device on the slide: kept by the app with the deck, its first frame its still, as large as fits 800×450. */
  const putVideoFile = async (file: File) => {
    if (!live.current || sending !== null) return;
    setSending(0);
    try {
      const [frame, src] = await Promise.all([firstFrame(file), uploadVideo(file, setSending)]);
      const poster = frame ? (await post<{ src: string }>('/api/pages/assets', { data: frame.data }).catch(() => null))?.src : undefined;
      const k = frame ? Math.min(800 / frame.w, 450 / frame.h) : 1;
      const w = frame ? Math.max(40, Math.round(frame.w * k)) : 800;
      const h = frame ? Math.max(40, Math.round(frame.h * k)) : 450;
      const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 60);
      if (live.current) put([{ id: newId(), type: 'video', src, ...(poster ? { poster } : {}), ...(name ? { name } : {}), ...centred(w, h) }]);
    } catch (e) {
      toastError(e);
    } finally {
      setSending(null);
    }
  };
  const pickVideoFile = async () => {
    const f = await chooseVideo();
    if (!f) return;
    if (!isVideoFile(f)) return toast('That is not a video a slide takes: an MP4, MOV or WebM file');
    await putVideoFile(f);
  };

  // ---- the AI tools -------------------------------------------------------------------------------------------
  // A tool's dialog may stay open a while (a video takes minutes): what it made lands where the editor is then.
  const putRef = useRef(put);
  putRef.current = put;
  /** The slide a part is on now (it may have moved since the tool was opened), or -1. */
  const slideOf = (d: Deck, id: string) => d.slides.findIndex((s) => !!findEl(s.els, id));
  /** A picture made with AI, or a drawing (SVG): on the slide as an uploaded picture lands, its words its description. */
  const aiPicture = async (tool: 'picture' | 'drawing') => {
    const d = live.current;
    if (!d) return;
    const p = tool === 'picture' ? await makePicture({ kind: 'picture', theme: { colors: colorsOf(d) } }) : await makeDrawing({ kind: 'illustration', colors: colorsOf(d) });
    if (!p || !live.current) return;
    const img = image(live.current, p.src, p.w, p.h);
    putRef.current([p.prompt ? { ...img, alt: p.prompt.replace(/\s+/g, ' ').slice(0, 300) } : img]);
  };
  /**
   * A plot: of the chart picked (its series the data; the plot takes its place), or of data given in the dialog. In a
   * web deck, the version that moves goes in as custom code, its picture shown where it cannot run.
   */
  const aiPlot = async (chartId?: string) => {
    const d = live.current;
    if (!d) return;
    const at = chartId ? slideOf(d, chartId) : -1;
    const found = at >= 0 && chartId ? findEl(d.slides[at].els, chartId) : undefined;
    const chart = found?.type === 'chart' ? found : undefined;
    const web = isWebDeck(d);
    const box = chart ? { w: Math.round(chart.w), h: Math.round(chart.h) } : { w: 800, h: 480 };
    const p = await makePlot({ data: chart ? chartCsv(chart) : undefined, dataFrom: chart ? 'From the chart' : undefined, theme: plotTheme(d), ...box, interactive: web || undefined });
    const now = live.current;
    if (!p || !now) return;
    const img = image(now, p.src, p.w, p.h);
    const made = (place: { x: number; y: number; w: number; h: number }, id = newId()): El =>
      // The plot that moves answers the pointer (its values on hover), so it takes it in the slideshow.
      web && p.html ? { id, type: 'html', html: p.html, poster: p.src, name: 'Plot', interactive: true, ...place } : { ...img, id, ...place, fit: 'contain', ...(p.prompt ? { alt: p.prompt.replace(/\s+/g, ' ').slice(0, 300) } : {}) };
    if (chart) {
      // In the chart's place, by its id: its animations and comments stay with it.
      return change((d2) => {
        const i = slideOf(d2, chart.id);
        return i < 0 ? d2 : setEls(d2, i, [chart.id], (e) => made({ x: e.x, y: e.y, w: e.w, h: e.h }, e.id));
      });
    }
    putRef.current([made({ x: img.x, y: img.y, w: img.w, h: img.h })]);
  };
  /** A video made with AI (from the picture picked, if one is), on the slide on view when it is done and inserted. */
  const aiVideo = async () => {
    const d = live.current;
    if (!d) return;
    const pic = picked.length === 1 && picked[0].type === 'image' && picked[0].src.startsWith('naget-asset:') ? picked[0].src : undefined;
    const v = await makeVideo({ aspect: d.ratio, first: pic });
    if (!v || !live.current) return;
    const k = v.w && v.h ? Math.min(800 / v.w, 450 / v.h) : 1;
    const w = v.w && v.h ? Math.max(40, Math.round(v.w * k)) : 800;
    const h = v.w && v.h ? Math.max(40, Math.round(v.h * k)) : 450;
    putRef.current([{ id: newId(), type: 'video', src: v.src, ...(v.poster ? { poster: v.poster } : {}), ...centred(w, h) }]);
  };
  /** The picture changed with AI, its background taken out, or part of it erased: in its place, one step to undo. */
  const aiEdit = async (id: string, mode: 'change' | 'cutout' | 'erase') => {
    const d = live.current;
    const at = d ? slideOf(d, id) : -1;
    const el = d && at >= 0 ? findEl(d.slides[at].els, id) : undefined;
    if (el?.type !== 'image' || !el.src) return;
    const p = await editPicture({ src: el.src, mode });
    if (!p) return;
    change((d2) => {
      const i = slideOf(d2, id);
      return i < 0 ? d2 : setEls(d2, i, [id], (e) => ({ ...e, src: p.src }) as El);
    });
  };
  /** Video editors opened from this deck: told when it closes, so their Save keeps the video in the Library instead. */
  const videoTabs = useRef<EditorHandle[]>([]);
  useEffect(() => () => videoTabs.current.forEach((t) => t.detach()), []);
  const changeRef = useRef(change);
  changeRef.current = change;
  /**
   * The video picked (one the app keeps) in the video editor, in a tab of its own: the new video and its still take its
   * place, one step to undo; one of a new shape (cropped to 9:16, turned) as large as fits in its box, in the middle.
   */
  const editVideo = (id: string) => {
    const d = live.current;
    const at = d ? slideOf(d, id) : -1;
    const el = d && at >= 0 ? findEl(d.slides[at].els, id) : undefined;
    if (el?.type !== 'video' || !keptVideo(el.src)) return;
    const tab = editKeptVideo(el.src, {
      title: el.name || tr(`Slide ${at + 1}`),
      label: doc?.title || tr('The deck'),
      put: (r) => {
        if (!r.src && !r.poster) return;
        changeRef.current((d2) => {
          const i = slideOf(d2, id);
          return i < 0
            ? d2
            : setEls(d2, i, [id], (e) => {
                const v = e as VideoEl;
                const ratio = r.w && r.h ? r.w / r.h : 0;
                const fit = ratio && r.src && r.src !== v.src && Math.abs(ratio - v.w / v.h) > 0.02 ? Math.min(v.w, v.h * ratio) : 0;
                const box = fit ? { x: Math.round(v.x + (v.w - fit) / 2), y: Math.round(v.y + (v.h - fit / ratio) / 2), w: Math.round(fit), h: Math.round(fit / ratio) } : {};
                return { ...v, ...(r.src ? { src: r.src } : {}), ...(r.poster ? { poster: r.poster } : {}), ...box } as El;
              });
        });
      },
    });
    videoTabs.current = [...videoTabs.current.filter((t) => t.id !== tab.id), tab];
  };
  /** A background made with AI for the slide on view, in its shape. */
  const aiBackground = async () => {
    const d = live.current;
    if (!d) return;
    const sid = d.slides[index]?.id;
    const p = await makePicture({ kind: 'background', aspect: d.ratio, theme: { colors: colorsOf(d) } });
    if (!p || !sid) return;
    change((d2) => {
      const i = d2.slides.findIndex((s) => s.id === sid);
      return i < 0 ? d2 : setSlide(d2, i, (s) => ({ ...s, bg: { ...(s.bg ?? {}), image: p.src } }));
    });
  };

  // ---- the web format ------------------------------------------------------------------------------------------
  /** A web format part: in a PowerPoint compatible deck, it asks first (the deck then leaves PowerPoint compatibility). */
  const putRich = async (kind: RichKind) => {
    if (!deck) return;
    const toWeb = !isWebDeck(deck);
    if (
      toWeb &&
      !(await confirm({
        title: 'Use the web format?',
        body: 'Custom code, web pages, quizzes and 3D are the web format’s. The deck stops being PowerPoint compatible: its PowerPoint file gets them as pictures.',
        confirm: 'Use the web format',
      }))
    )
      return;
    const d = live.current ?? deck;
    if (kind === 'embed') return setEmbedAsk({ web: toWeb });
    if (kind === 'html') {
      put([htmlPart(d)], { web: toWeb });
      // Its code, to change, in the side panel.
      if (!wide) setDrawer('open');
      return;
    }
    put([kind === 'quiz' ? quizPart(d, tr) : kind === 'score' ? scorePart(d, tr) : scene3dPart(d)], { web: toWeb });
  };
  const putEmbed = () => {
    const url = embedAddress(embedUrl);
    if (!url || !live.current) return;
    const web = !!embedAsk?.web;
    setEmbedAsk(null);
    setEmbedUrl('');
    put([embedPart(live.current, url)], { web });
  };
  /** PowerPoint compatible on (after the dialog), or off: back to the web format, which loses nothing. */
  const setCompatible = (on: boolean) => {
    if (on) return setCompatAsk(true);
    change((d) => toWebFormat(d));
    toast('The deck is in the web format: Insert → Interactive has custom code, web pages, quizzes and 3D', 'ok');
  };
  // Something else picked, another slide: the live part running in place stops.
  useEffect(() => {
    if (running && !(sel.length === 1 && sel[0] === running)) setRunning(null);
  }, [sel, index, running]);
  // Another slide, or the panel's other tabs: no part is being picked for an animation.
  useEffect(() => setPickFor(null), [index, tab]);
  /** The part clicked on the slide starts the animation being set up (the part it moves may start its own). */
  const pickTrigger = (id: string | null) => {
    const anim = pickFor;
    setPickFor(null);
    const s = live.current?.slides[index];
    if (!anim || !id || !s?.anims?.some((x) => x.id === anim)) return;
    change((d) => setAnim(d, index, anim, { on: 'tap', trigger: topOf(s, id)?.id ?? id }));
  };
  /** A video from this device for a slide's background, kept with the deck: its source (null: none, or it failed). */
  const pickBgVideo = async (): Promise<string | null> => {
    const f = await chooseVideo();
    if (!f) return null;
    if (!isVideoFile(f)) {
      toast('That is not a video a slide takes: an MP4, MOV or WebM file');
      return null;
    }
    if (sending !== null) return null;
    setSending(0);
    try {
      return await uploadVideo(f, setSending);
    } catch (e) {
      toastError(e);
      return null;
    } finally {
      setSending(null);
    }
  };
  /** A 3D model (a .glb, or a .gltf with its files) from this device, kept with the deck: its source (null: none, or it failed). */
  const pickModel = async (): Promise<string | null> => {
    const files = await chooseModel();
    if (!files.length) return null;
    try {
      toast('Adding the model…');
      return await uploadModel(files);
    } catch (e) {
      toastError(e);
      return null;
    }
  };

  // ---- copy and paste ---------------------------------------------------------------------------------------
  const picked = pickedOf(slide, sel);
  const copy = () => {
    if (!picked.length || !slide) return;
    // A part of a group goes as it shows on the slide.
    clip = picked.map((e) => onSlide(slide, e));
    toast(picked.length === 1 ? 'Copied' : `${picked.length} parts copied`, 'ok');
  };
  const cut = () => {
    if (!picked.length) return;
    copy();
    change((d) => removeEls(d, index, sel));
    setSel([]);
  };
  const paste = () => {
    if (!clip?.length) return;
    const fresh = copies(clip, slide?.els.some((e) => clip!.some((c) => c.x === e.x && c.y === e.y)) ? 24 : 0);
    put(fresh);
  };
  const duplicate = () => {
    if (!picked.length) return;
    // Copies of parts in a group stay in it.
    if (scope.length) {
      const fresh = copies(picked);
      change((d) => setEls(d, index, [scope[scope.length - 1]], (g) => (g.type === 'group' ? { ...g, els: [...g.els, ...fresh] } : g)));
      setSel(fresh.map((e) => e.id));
      return;
    }
    put(copies(picked));
  };
  const remove = () => {
    if (!sel.length) return;
    change((d) => removeEls(d, index, sel));
    setSel([]);
  };

  // ---- groups, looks, arranging -------------------------------------------------------------------------
  const group = () => {
    if (!deck || sel.length < 2) return;
    const r = groupEls(live.current ?? deck, index, sel);
    if (!r) return toast('Parts in different groups can’t be grouped together');
    change(r.deck);
    setSel([r.id]);
  };
  const unGroup = (id?: string) => {
    const g = id ?? (picked.length === 1 && picked[0].type === 'group' ? picked[0].id : null);
    if (!deck || !g) return;
    const r = ungroup(live.current ?? deck, index, g);
    if (!r) return;
    change(r.deck);
    setSel(r.ids);
  };
  const copyLook = () => {
    if (picked.length !== 1) return;
    lookClip = lookOf(picked[0]);
    toast('The look is copied', 'ok');
  };
  const pasteLook = () => {
    if (!lookClip || !sel.length) return;
    const look = lookClip;
    change((d) => setEls(d, index, sel, (e) => withLook(e, look)));
  };
  const startPainter = (keep: boolean) => {
    if (painter && !keep) return setPainter(null);
    if (picked.length !== 1) return;
    setPainter({ look: lookOf(picked[0]), keep });
  };
  const paint = (id: string | null) => {
    if (!painter) return;
    if (id) change((d) => setEls(d, index, [id], (e) => withLook(e, painter.look)));
    if (!painter.keep || !id) setPainter(null);
  };
  const restackSel = (how: 'front' | 'back' | 'forward' | 'backward') => sel.length && change((d) => restack(d, index, sel, how));
  const alignSel = (how: Parameters<typeof align>[3]) => sel.length && change((d) => align(d, index, sel, how));
  const turn = (by: number) => sel.length && change((d) => setEls(d, index, sel, (e) => (e.type === 'line' ? e : { ...e, rot: ((((e.rot ?? 0) + by) % 360) + 360) % 360 || undefined })));
  const flip = (axis: 'h' | 'v') => sel.length && change((d) => setEls(d, index, sel, (e) => (e.type === 'image' ? ({ ...e, [axis === 'h' ? 'flipH' : 'flipV']: !(axis === 'h' ? e.flipH : e.flipV) || undefined } as El) : e)));
  const zoomBy = (f: number) => {
    const el = root.current?.querySelector<HTMLElement>('[data-slide-canvas]');
    const now = zoom === 'fit' ? (el ? Number(el.dataset.k) || 1 : 1) : zoom;
    const next = Math.max(0.1, Math.min(4, Math.round(now * f * 100) / 100));
    setZoom(next);
  };
  const crop = (id: string | null, keep?: boolean) => {
    if (id) {
      setCropping(id);
      return;
    }
    canvas.current?.endCrop(!!keep);
  };
  const addGuide = (axis: 'x' | 'y') => {
    if (!deck) return;
    setRulers(true);
    const at = axis === 'x' ? Math.round(W / 2) : Math.round(heightOf(deck) / 2);
    change((d) => {
      const list = [...new Set([...(d.guides?.[axis] ?? []), at])].sort((a, b) => a - b);
      return { ...d, guides: { ...(d.guides ?? {}), [axis]: list } };
    });
  };

  // ---- comments ----------------------------------------------------------------------------------------------
  /** Comment: on the part picked (one), else on the slide, in the Comments tab. */
  const startComment = () => {
    if (readOnly || !slide) return;
    canvas.current?.stopEditing();
    setAdding(picked.length === 1 ? { el: picked[0].id } : {});
    setTab('comments' as InspectorTab);
    if (!wide) setDrawer('open');
  };

  // ---- keys ---------------------------------------------------------------------------------------------------
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const layered = useRef(false);
  keys.current = (e: KeyboardEvent) => {
    if (!deck || present) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const mod = isMod(e);
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      void save();
      return;
    }
    // A menu or a popover open over the editor (opened with the mouse, the focus still here) takes the keys: Esc closes
    // it alone, and the arrows do not move what is picked behind it.
    if (layered.current) return;
    // Find, replace and the shortcuts, from the words being changed too.
    if (mod && !e.altKey && (k === 'f' || k === 'h') && (!typing || t?.isContentEditable)) {
      e.preventDefault();
      find.show(k === 'h' && !readOnly);
      return;
    }
    if (mod && (e.key === '/' || e.code === 'Slash') && !e.altKey) {
      e.preventDefault();
      setKeysOpen(true);
      return;
    }
    if (mod && e.altKey && !e.shiftKey && e.code === 'KeyM' && !readOnly) {
      e.preventDefault();
      startComment();
      return;
    }
    if (typing) return;
    if (mod && e.altKey && (e.key === '=' || e.key === '+' || e.code === 'Equal')) return (e.preventDefault(), zoomBy(1.25));
    if (mod && e.altKey && (e.key === '-' || e.code === 'Minus')) return (e.preventDefault(), zoomBy(0.8));
    if (mod && e.altKey && (e.key === '0' || e.code === 'Digit0')) return (e.preventDefault(), setZoom('fit'));
    if (mod && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'F5' || (mod && e.key === 'Enter')) {
      e.preventDefault();
      setPresent({ from: e.shiftKey ? index : 0, presenter: false });
      return;
    }
    if (readOnly) {
      if (e.key === 'ArrowDown' || e.key === 'PageDown') setCur((c) => Math.min(deck.slides.length - 1, c + 1));
      if (e.key === 'ArrowUp' || e.key === 'PageUp') setCur((c) => Math.max(0, c - 1));
      return;
    }
    if (mod && e.shiftKey && k === 'c') return (e.preventDefault(), copyLook());
    if (mod && e.shiftKey && k === 'v') return (e.preventDefault(), pasteLook());
    if (mod && k === 'g') return (e.preventDefault(), e.shiftKey ? unGroup() : group());
    if (mod && k === 'c') return (e.preventDefault(), copy());
    if (mod && k === 'x') return (e.preventDefault(), cut());
    if (mod && k === 'v' && clip) return (e.preventDefault(), paste());
    if (mod && k === 'd') return (e.preventDefault(), duplicate());
    if (mod && k === 'a') {
      e.preventDefault();
      const lv = scope.length ? pickedOf(slide, [scope[scope.length - 1]])[0] : null;
      setSel(lv?.type === 'group' ? lv.els.map((x) => x.id) : (slide?.els.map((x) => x.id) ?? []));
      return;
    }
    if (mod && k === 'm') return (e.preventDefault(), newSlide('content'));
    if (mod && textEls.length && (k === 'b' || k === 'i' || k === 'u')) {
      e.preventDefault();
      text?.toggle(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
      return;
    }
    if (mod && e.shiftKey && textEls.length && (e.key === '>' || e.key === '.' || e.key === '<' || e.key === ',')) {
      e.preventDefault();
      text?.grow(e.key === '>' || e.key === '.' ? 2 : -2);
      return;
    }
    if (mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && sel.length) {
      e.preventDefault();
      restackSel(e.key === 'ArrowUp' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward');
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (sel.length) {
        e.preventDefault();
        remove();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (pickFor) setPickFor(null);
      else if (painter) setPainter(null);
      else if (cellSel) setCellSel(null);
      else if (scope.length) {
        // Out of the group: it is picked.
        setSel([scope[scope.length - 1]]);
        setScope(scope.slice(0, -1));
      } else if (sel.length) setSel([]);
      return;
    }
    if (e.key === 'Enter' && picked.length === 1) {
      const p = picked[0];
      if (p.type === 'text' || p.type === 'shape') {
        e.preventDefault();
        setEditing(p.id);
        return;
      }
      if (p.type === 'group' && p.els.length) {
        e.preventDefault();
        setScope([...scope, p.id]);
        setSel([p.els[0].id]);
        return;
      }
    }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (!sel.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setCur((c) => Math.min(deck.slides.length - 1, c + 1));
        else setCur((c) => Math.max(0, c - 1));
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      change((d) => setEls(d, index, sel, (x) => (x.lock ? x : { ...x, x: x.x + dx, y: x.y + dy })), 'nudge');
      return;
    }
    if (e.key === 'PageDown') setCur((c) => Math.min(deck.slides.length - 1, c + 1));
    if (e.key === 'PageUp') setCur((c) => Math.max(0, c - 1));
  };
  useEffect(() => {
    // Whether a menu or popover was open as the key came, noted before anything handles it: by the time the editor
    // hears of the key, Escape has closed it already.
    const mark = () => {
      layered.current = !!document.querySelector('body > [role=dialog]');
    };
    const on = (e: KeyboardEvent) => {
      // Keys belong to this editor while it holds the focus (or nothing else does).
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      keys.current(e);
    };
    window.addEventListener('keydown', mark, true);
    window.addEventListener('keydown', on);
    return () => {
      window.removeEventListener('keydown', mark, true);
      window.removeEventListener('keydown', on);
    };
  }, []);
  // Pictures pasted or dropped become parts of the slide.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (readOnly || present) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        upload(file)
          .then((p) => live.current && put([image(live.current, p.src, p.w, p.h)]))
          .catch(toastError);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && !clip && live.current) {
        e.preventDefault();
        // A YouTube or Vimeo address pasted is the video.
        if (text.trim().length < 300 && videoSrc(text.trim())) {
          void putOnlineVideo(text.trim());
          return;
        }
        const t = textBox(live.current);
        put([{ ...t, paras: text.split('\n').map((l) => ({ runs: [{ t: l }] })) }]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const onDrop = async (e: React.DragEvent) => {
    const video = [...e.dataTransfer.files].find(isVideoFile);
    if (video && !readOnly && deck) {
      e.preventDefault();
      return void putVideoFile(video);
    }
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (!file || readOnly || !deck) return;
    e.preventDefault();
    try {
      const p = await upload(file);
      put([image(deck, p.src, p.w, p.h)]);
    } catch (err) {
      toastError(err);
    }
  };

  const textEls = picked.filter((e): e is Extract<El, { type: 'text' | 'shape' }> => e.type === 'text' || e.type === 'shape');
  const showText = textEls.length > 0 && textEls.length === picked.length;
  const textArgs = deck && showText ? { deck, index, els: textEls, editing: !!editing && textEls.some((x) => x.id === editing), canvas, change } : null;
  const text = textArgs ? textActions(textArgs) : null;

  if (!deck || !slide) return <div className="flex h-full items-center justify-center text-fg-3">…</div>;

  const stripAct = {
    pick: (i: number) => {
      canvas.current?.stopEditing();
      pickedAt.current = performance.now();
      setCur(i);
      setSel([]);
      setView('edit');
    },
    move: (from: number, to: number) => {
      change((d) => moveSlide(d, from, to));
      setCur(to);
    },
    add: (after: number, l: LayoutId) => newSlide(l, after),
    duplicate: (i: number) => {
      const r = duplicateSlides(deck, [i]);
      change(r.deck);
      setCur(r.at);
    },
    remove: (i: number) => {
      change((d) => removeSlides(d, [i]));
      setCur((c) => Math.max(0, Math.min(c > i ? c - 1 : c, deck.slides.length - 2)));
      setSel([]);
    },
    toggleHidden: (i: number) => change((d) => setSlide(d, i, (s) => ({ ...s, hidden: !s.hidden || undefined }))),
  };

  const openPanel = (t: InspectorTab) => {
    setTab(t);
    if (!wide) setDrawer('open');
  };
  const one = picked.length === 1 ? picked[0] : null;
  const openComments = deck.slides.reduce((a, s) => a + (s.comments ?? []).filter((c) => !c.resolved).length, 0);
  // The marks of the slide's open comments: one at the corner of each part with some, one where each of the slide's own is.
  const pins: CommentPin[] = [];
  for (const c of slide.comments ?? []) {
    if (c.resolved) continue;
    const part = c.el ? findEl(slide.els, c.el) : undefined;
    const b = part ? turnedBox(onSlide(slide, part)) : null;
    const at = b ? { x: b.x + b.w, y: b.y } : { x: c.x ?? W - 40, y: c.y ?? 40 };
    const key = part ? `el:${part.id}` : `at:${Math.round(at.x)},${Math.round(at.y)}`;
    const pin = pins.find((p) => p.key === key);
    if (pin) pin.ids.push(c.id);
    else pins.push({ key, x: at.x, y: at.y, ids: [c.id], active: false });
  }
  for (const p of pins) p.active = !!activeComment && p.ids.includes(activeComment);
  const web = isWebDeck(deck);
  const menus = slidesMenus({
    readOnly,
    web,
    setCompatible,
    wide,
    pageLayout: layout === 'page',
    picked,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    canPaste: !!clip?.length,
    hasLook: !!lookClip,
    painting: !!painter,
    zoom,
    grid,
    rulers,
    notesOpen,
    gridView: view === 'grid',
    hidden: !!slide.hidden,
    text,
    undo,
    redo,
    cut,
    copy,
    paste,
    duplicate,
    remove,
    selectAll: () => setSel(slide.els.map((x) => x.id)),
    find: (replace) => find.show(replace),
    copyLook,
    pasteLook,
    painter: () => startPainter(false),
    setZoom,
    zoomBy,
    setGrid,
    setRulers,
    addGuide,
    clearGuides: () =>
      change((d) => {
        const { guides: _g, ...rest } = d;
        return rest;
      }),
    hasGuides: !!deck.guides,
    setNotes: setNotesOpen,
    setGridView: (on) => {
      canvas.current?.stopEditing();
      setView(on ? 'grid' : 'edit');
    },
    newSlide: () => setMenu('slide'),
    textBox: () => put([textBox(deck)]),
    shape: () => setMenu('shape'),
    picture: () => void addPicture(),
    pictureUrl: () => setUrlAsk({}),
    line: (arrow) => put([line(deck, arrow)]),
    connector: (elbow) => put([connector(deck, index, elbow, picked)]),
    table: () => put([table(deck)]),
    chart: () => put([chart(deck)]),
    icon: () => setIconAsk({ start: 'icons' }),
    emoji: () => setIconAsk({ start: 'emoji' }),
    equation: putEquation,
    code: () => put([codePart(deck)]),
    rich: (kind) => void putRich(kind),
    aiPicture: readOnly ? undefined : () => void aiPicture('picture'),
    aiDrawing: readOnly ? undefined : () => void aiPicture('drawing'),
    aiPlot: readOnly ? undefined : () => void aiPlot(),
    aiVideo: readOnly ? undefined : () => void aiVideo(),
    aiEdit: readOnly ? undefined : (mode) => one && void aiEdit(one.id, mode),
    aiPlotChart: readOnly ? undefined : () => one && void aiPlot(one.id),
    editVideo: readOnly ? undefined : () => one && editVideo(one.id),
    running: !!one && running === one.id,
    run: () => one && setRunning(running === one.id ? null : one.id),
    video: () => setVideoAsk(true),
    videoFile: () => void pickVideoFile(),
    footer: () => setFooterOpen(true),
    comment: startComment,
    crop: () => one && crop(one.id),
    resetPicture: () => one && change((d) => setEls(d, index, [one.id], (e) => ({ ...e, crop: undefined, adjust: undefined }) as El)),
    editTex: () => {
      openPanel('format');
      setTexFocus((n) => n + 1);
    },
    replaceIcon: () => one && setIconAsk({ replace: one.id, start: 'icons' }),
    formatPanel: () => openPanel('format'),
    group,
    ungroup: () => unGroup(),
    restack: restackSel,
    align: alignSel,
    spread: (axis) => change((d) => distribute(d, index, sel, axis)),
    turn,
    flip,
    lock: () => one && change((d) => setEls(d, index, [one.id], (e) => ({ ...e, lock: !e.lock || undefined }))),
    duplicateSlide: () => stripAct.duplicate(index),
    deleteSlide: () => stripAct.remove(index),
    skipSlide: () => stripAct.toggleHidden(index),
    openTab: (t) => openPanel(t),
    // Exports are made from what is saved: changes are saved first.
    slidePicture: readOnly
      ? undefined
      : () =>
          void (async () => {
            if (dirtyRef.current && !(await saveNow.current())) return;
            await exportFile(pageId, 'png', { slide: index + 1 });
          })().catch(toastError),
    present: (from) => setPresent({ from: from === 'start' ? 0 : index, presenter: from === 'presenter' }),
    shortcuts: () => setKeysOpen(true),
    ask: onAsk ? () => onAsk(`On slide ${index + 1}${slideTitle(slide) ? ` (“${slideTitle(slide)}”)` : ''}: `) : undefined,
  });

  const insertBar = !readOnlyProp && (
    <>
      <IconButton label={`Undo (${keyLabel('Ctrl+Z')})`} size="sm" disabled={!hist.past.length} onClick={undo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton label={`Redo (${keyLabel('Ctrl+Shift+Z')})`} size="sm" disabled={!hist.future.length} onClick={redo}>
        <Redo2 size={15} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <Button ref={anchors.slide} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMenu(menu === 'slide' ? null : 'slide')} className="shrink-0">
        {mid ? 'New slide' : ''}
      </Button>
      <IconButton label="Text box" size="sm" onClick={() => put([textBox(deck)])}>
        <Type size={15} />
      </IconButton>
      <IconButton ref={anchors.shape} label="Shape" size="sm" active={menu === 'shape'} onClick={() => setMenu(menu === 'shape' ? null : 'shape')}>
        <Shapes size={15} />
      </IconButton>
      <IconButton ref={anchors.picture} label="Picture" size="sm" active={menu === 'picture'} onClick={() => setMenu(menu === 'picture' ? null : 'picture')}>
        <ImageIcon size={15} />
      </IconButton>
      <IconButton ref={anchors.line} label="Line or arrow" size="sm" active={menu === 'line'} onClick={() => setMenu(menu === 'line' ? null : 'line')}>
        <MoveRight size={15} />
      </IconButton>
      <IconButton label="Table" size="sm" onClick={() => put([table(deck)])}>
        <Table2 size={15} />
      </IconButton>
      <IconButton label="Chart" size="sm" onClick={() => put([chart(deck)])}>
        <PieChart size={15} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton
        label="Format painter: click a part to give it this look (double-click: for several)"
        size="sm"
        active={!!painter}
        disabled={!painter && picked.length !== 1}
        onClick={() => startPainter(false)}
        onDoubleClick={() => startPainter(true)}
      >
        <Paintbrush size={15} />
      </IconButton>
    </>
  );

  const canvasArea = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onDrop}>
      <div className="relative min-h-0 flex-1">
        <SlideCanvas
          ref={canvas}
          deck={deck}
          index={index}
          sel={sel}
          onSel={(ids) => {
            setSel(ids);
            if (ids.length && !wide && drawer === 'closed' && layout !== 'sheet') setDrawer('open');
          }}
          editing={editing}
          onEditing={setEditing}
          change={change}
          fonts={fonts}
          readOnly={readOnly}
          agent={mark ? (mark.el ?? '') : null}
          onMenu={(at) => {
            setCtxAt(at);
            setMenu('context');
          }}
          onReplaceImage={(id) => void replacePicture(id)}
          onChartData={(id) => {
            setSel([id]);
            openPanel('format');
          }}
          onOpen={(id) => {
            setSel([id]);
            const el = pickedOf(slide, [id])[0];
            if (el?.type === 'icon') setIconAsk({ replace: id, start: 'icons' });
            else {
              openPanel('format');
              if (el?.type === 'math') setTexFocus((n) => n + 1);
            }
          }}
          zoom={zoom}
          onZoom={setZoom}
          scope={scope}
          onScope={setScope}
          grid={grid}
          rulers={rulers}
          painting={!!painter}
          onPaint={paint}
          cropping={cropping}
          onCropping={setCropping}
          marks={marks}
          cellSel={cellSel}
          onCellSel={setCellSel}
          pins={pins}
          onPin={(ids) => {
            setActiveComment(ids[0]);
            openPanel('comments' as InspectorTab);
          }}
          running={running}
          onRun={(id) => setRunning(id)}
          picking={!!pickFor}
          onPick={pickTrigger}
        />
        {zoom !== 'fit' && (
          <button
            type="button"
            onClick={() => setZoom('fit')}
            title="Fit the slide"
            aria-label="Fit the slide"
            className="absolute right-3 bottom-3 z-10 flex items-center gap-1.5 rounded-full border border-line bg-elevated px-2.5 py-1 text-[12px] text-fg-2 tabular-nums shadow-sm hover:text-fg"
          >
            {`${Math.round(zoom * 100)}%`}
            <Shrink size={12} />
          </button>
        )}
        {(sending !== null || painter || scope.length > 0 || cropping || pickFor) && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-elevated px-3 py-1 text-[12px] text-fg-2 tabular-nums shadow-sm">
            {sending !== null
              ? `Adding the video… ${Math.round(sending * 100)}%`
              : pickFor
                ? 'Click the part that starts it; Esc to stop'
                : cropping
                ? 'Cropping: Enter keeps it, Esc does not'
                : painter
                  ? painter.keep
                    ? 'Format painter: click parts to give them the look; Esc when done'
                    : 'Format painter: click a part to give it the look'
                  : 'In a group: Esc to leave it'}
          </div>
        )}
        {find.open && (
          <div className={cx('absolute z-20', mid ? 'top-2 right-2' : 'inset-x-2 top-2')}>
            <FindBar
              find={find}
              count={hits.length}
              index={findAt}
              onNext={() => findStep(1)}
              onPrev={() => findStep(-1)}
              onReplace={readOnly ? undefined : replaceOne}
              onReplaceAll={readOnly ? undefined : replaceAll}
              className={mid ? undefined : 'w-full'}
              extra={
                hit?.where === 'notes' ? (
                  <span className="text-fg-3">This one is in the speaker notes.</span>
                ) : hit?.where === 'chart' ? (
                  <span className="text-fg-3">This one is in a chart.</span>
                ) : hit?.where === 'tex' ? (
                  <span className="text-fg-3">This one is in an equation’s LaTeX.</span>
                ) : hit?.where === 'words' ? (
                  <span className="text-fg-3">{hit.field === 'code' ? 'This one is in code.' : hit.field === 'score' ? 'This one is in a quiz score.' : 'This one is in a quiz.'}</span>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
      {wide && (
        <div className="shrink-0 border-t border-line bg-panel">
          <button type="button" onClick={() => setNotesOpen((o) => !o)} className="flex h-8 w-full items-center gap-1.5 px-3 text-[12px] font-medium text-fg-3 hover:text-fg-2">
            {notesOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            Speaker notes
            {!notesOpen && slide.notes && <span className="min-w-0 truncate font-normal">· {slide.notes.split('\n')[0]}</span>}
          </button>
          {notesOpen && <NotesField value={slide.notes ?? ''} readOnly={readOnly} marks={noteMarks} onChange={(v) => change((d) => setSlide(d, index, (s) => ({ ...s, notes: v || undefined })), `notes:${slide.id}`)} className="h-[88px]" />}
        </div>
      )}
    </div>
  );

  const inspector = (
    <Inspector
      tab={tab}
      deck={deck}
      index={index}
      sel={sel}
      onSel={setSel}
      change={change}
      fonts={fonts}
      pickPicture={pickPicture}
      onReplaceImage={(id) => void replacePicture(id)}
      onPreview={() => setPresent({ from: index, presenter: false })}
      onAsk={onAsk}
      cropping={cropping}
      onCrop={crop}
      onIcon={(id) => setIconAsk({ replace: id, start: 'icons' })}
      onGroup={group}
      onUngroup={(id) => unGroup(id)}
      onFooter={() => setFooterOpen(true)}
      cellSel={cellSel}
      onCellSel={setCellSel}
      texFocus={texFocus}
      running={running}
      onRun={setRunning}
      pickVideo={pickBgVideo}
      pickModel={pickModel}
      onCompatible={setCompatible}
      onAiEdit={(id, mode) => void aiEdit(id, mode)}
      onPlotChart={(id) => void aiPlot(id)}
      onEditVideo={readOnly ? undefined : (id) => editVideo(id)}
      onAiBackground={() => void aiBackground()}
      picking={pickFor}
      onPickTrigger={setPickFor}
    />
  );

  const tabs = (
    <div role="tablist" className="flex min-w-0 flex-1 items-center overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {[...INSPECTOR_TABS, ...(wide ? [] : [{ value: 'notes' as const, label: 'Notes' }]), { value: 'comments' as const, label: 'Comments' }].map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={tab === t.value}
          // The comments' tab is its mark and how many are open: the row keeps to its width.
          title={t.value === 'comments' ? 'Comments' : undefined}
          aria-label={t.value === 'comments' ? 'Comments' : undefined}
          onClick={() => {
            setTab(t.value as InspectorTab);
            if (!wide) setDrawer('open');
          }}
          className={cx('relative flex h-10 shrink-0 items-center px-1.5 text-[13px] font-medium transition-colors', tab === t.value ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
        >
          {t.value === 'comments' ? (
            <span className="relative flex px-0.5">
              <MessageSquare size={16} />
              {openComments > 0 && (
                <span className="absolute -top-1.5 left-2.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-[15px] font-semibold text-accent-fg tabular-nums">{openComments}</span>
              )}
            </span>
          ) : (
            t.label
          )}
          {tab === t.value && (wide || drawer === 'open') && <span className="absolute inset-x-1.5 -bottom-px h-[2px] rounded-full bg-fg" />}
        </button>
      ))}
    </div>
  );

  const commentsPanel = (
    <SlideComments
      deck={deck}
      index={index}
      readOnly={readOnly}
      adding={adding}
      onAdd={startComment}
      onAdded={(id) => {
        setAdding(null);
        setActiveComment(id);
      }}
      change={change}
      active={activeComment}
      onActive={setActiveComment}
      onGo={(i, el) => {
        canvas.current?.stopEditing();
        setCur(i);
        setView('edit');
        // A part in a group: the group is what is picked on the slide.
        setSel(el ? [topOf(deck.slides[i], el)?.id ?? el] : []);
      }}
      onAsk={onAsk}
    />
  );

  const notesPanel = <NotesField value={slide.notes ?? ''} readOnly={readOnly} marks={noteMarks} onChange={(v) => change((d) => setSlide(d, index, (s) => ({ ...s, notes: v || undefined })), `notes:${slide.id}`)} className="h-full min-h-[120px]" />;

  const presentButtons = (
    <div className="flex shrink-0 items-center">
      <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => setPresent({ from: index, presenter: false })} className={cx(mid && 'rounded-r-none')}>
        {mid ? 'Present' : ''}
      </Button>
      {mid && (
        <Button ref={anchors.present} size="sm" variant="primary" aria-label="More ways to present" onClick={() => setMenu(menu === 'present' ? null : 'present')} className="rounded-l-none border-l border-accent-fg/25 px-1.5">
          <ChevronDown size={14} />
        </Button>
      )}
    </div>
  );

  return (
    <div ref={root} data-keys="b" data-keys-idle="b" className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 shrink items-center gap-1.5">{lead}</div>
          <MenuBar menus={menus} compact={layout === 'sheet' ? true : 'auto'} />
        </div>
        {layout === 'page' && mid && (
          <Segmented
            size="sm"
            value={view}
            onChange={(v) => {
              canvas.current?.stopEditing();
              setView(v);
            }}
            options={[
              { value: 'edit', label: <span title="One slide"><Presentation size={14} /></span> },
              { value: 'grid', label: <span title="Every slide"><Grid2x2 size={14} /></span> },
            ]}
          />
        )}
        {presentButtons}
        {tail}
      </div>
      {band}
      {!readOnlyProp && (
        <div inert={liveOn} className={cx('flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden', liveOn && 'opacity-45')}>
          {hold(
            'bar',
            <>
              {insertBar}
              {textArgs && view === 'edit' && (
                <>
                  <span className="mx-1 h-5 w-px shrink-0 bg-line" />
                  <TextBar {...textArgs} />
                </>
              )}
            </>,
          )}
        </div>
      )}
      <div className={cx('relative flex min-h-0 flex-1', wide ? 'flex-row' : 'flex-col')}>
        {view === 'grid' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Strip deck={deck} cur={index} fonts={fonts} act={stripAct} layout="grid" />
          </div>
        ) : (
          <>
            {wide && (
              <div className="w-[190px] shrink-0 overflow-y-auto border-r border-line bg-panel">
                <Strip deck={deck} cur={index} fonts={fonts} act={stripAct} layout="side" live={!!mark && mark.slide === index} />
                {!readOnly && (
                  <button type="button" onClick={() => newSlide('content', deck.slides.length - 1)} className="mx-auto mb-4 flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg">
                    <Plus size={13} />A slide
                  </button>
                )}
              </div>
            )}
            {canvasArea}
            {!wide && (
              <div className="shrink-0 border-t border-line bg-panel">
                <Strip deck={deck} cur={index} fonts={fonts} act={stripAct} layout="bottom" live={!!mark && mark.slide === index} />
              </div>
            )}
            {!readOnlyProp && (
              <aside inert={liveOn} className={cx('flex min-h-0 shrink-0 flex-col bg-panel', liveOn && 'opacity-45', wide ? 'w-[300px] border-l border-line' : cx('border-t border-line', drawer === 'open' ? 'h-[min(46%,420px)] min-h-[180px]' : 'pb-[var(--safe-bottom)]'))}>
                <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-1">
                  {hold('tabs', tabs)}
                  {!wide && (
                    <IconButton label={drawer === 'open' ? 'Fold the panel' : 'Open the panel'} size="sm" onClick={() => setDrawer(drawer === 'open' ? 'closed' : 'open')}>
                      {drawer === 'open' ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </IconButton>
                  )}
                </div>
                {(wide || drawer === 'open') && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{hold('panel', (tab as string) === 'notes' ? notesPanel : (tab as string) === 'comments' ? commentsPanel : inspector)}</div>}
              </aside>
            )}
          </>
        )}
      </div>
      {dirty && !readOnly && (
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

      <Popover anchor={anchors.slide} open={menu === 'slide'} onClose={() => setMenu(null)} width={380} title="A new slide">
        <LayoutGrid deck={deck} fonts={fonts} onPick={(l) => newSlide(l)} />
      </Popover>
      <Popover anchor={anchors.shape} open={menu === 'shape'} onClose={() => setMenu(null)} width={244} title="Shape">
        <div className="grid grid-cols-5 gap-1 p-1.5">
          {SHAPES.map((k) => (
            <button
              key={k}
              type="button"
              title={SHAPE_NAMES[k]}
              aria-label={SHAPE_NAMES[k]}
              onClick={() => {
                setMenu(null);
                put([shape(deck, k)]);
              }}
              className="grid h-10 place-items-center rounded-lg text-accent hover:bg-bg-2"
            >
              <ShapeIcon kind={k} size={22} />
            </button>
          ))}
        </div>
      </Popover>
      <Popover anchor={anchors.line} open={menu === 'line'} onClose={() => setMenu(null)} width={220}>
        <MenuItem icon={<Minus size={14} />} onClick={() => (setMenu(null), put([line(deck, false)]))}>
          Straight line
        </MenuItem>
        <MenuItem icon={<MoveRight size={14} />} onClick={() => (setMenu(null), put([line(deck, true)]))}>
          Arrow
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Spline size={14} />} onClick={() => (setMenu(null), put([connector(deck, index, false, picked)]))}>
          Straight connector
        </MenuItem>
        <MenuItem icon={<CornerDownRight size={14} />} onClick={() => (setMenu(null), put([connector(deck, index, true, picked)]))}>
          Elbow connector
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.picture} open={menu === 'picture'} onClose={() => setMenu(null)} width={230}>
        <MenuItem icon={<ImageIcon size={14} />} onClick={() => void addPicture()}>
          From this device
        </MenuItem>
        <MenuItem icon={<Link2 size={14} />} onClick={() => (setMenu(null), setUrlAsk({}))}>
          From a web address
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<WandSparkles size={14} />} onClick={() => (setMenu(null), void aiPicture('picture'))}>
          Make with AI
        </MenuItem>
        <MenuItem icon={<PenTool size={14} />} onClick={() => (setMenu(null), void aiPicture('drawing'))}>
          Drawing (SVG)
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.present} open={menu === 'present'} onClose={() => setMenu(null)} align="end" width={250}>
        <MenuItem icon={<Play size={14} />} onClick={() => (setMenu(null), setPresent({ from: 0, presenter: false }))}>
          From the beginning
        </MenuItem>
        <MenuItem icon={<Play size={14} />} onClick={() => (setMenu(null), setPresent({ from: index, presenter: false }))}>
          From this slide
        </MenuItem>
        <MenuItem icon={<MonitorPlay size={14} />} onClick={() => (setMenu(null), setPresent({ from: index, presenter: true }))}>
          Presenter view, with notes
        </MenuItem>
      </Popover>
      <div ref={ctxRef} className="pointer-events-none fixed h-px w-px" style={{ left: ctxAt?.x ?? -10, top: ctxAt?.y ?? -10 }} />
      <Popover anchor={ctxRef} open={menu === 'context'} onClose={() => setMenu(null)} width={230}>
        {picked.length > 0 && !readOnly && (
          <>
            <MenuItem icon={<Scissors size={14} />} hint={keyLabel('Ctrl+X')} onClick={() => (setMenu(null), cut())}>
              Cut
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} hint={keyLabel('Ctrl+C')} onClick={() => (setMenu(null), copy())}>
              Copy
            </MenuItem>
          </>
        )}
        {clip && !readOnly && (
          <MenuItem icon={<Clipboard size={14} />} hint={keyLabel('Ctrl+V')} onClick={() => (setMenu(null), paste())}>
            Paste
          </MenuItem>
        )}
        {picked.length > 0 && !readOnly && (
          <>
            <MenuItem icon={<Copy size={14} />} hint={keyLabel('Ctrl+D')} onClick={() => (setMenu(null), duplicate())}>
              Duplicate
            </MenuItem>
            {picked.length > 1 && (
              <MenuItem icon={<GroupIcon size={14} />} hint={keyLabel('Ctrl+G')} onClick={() => (setMenu(null), group())}>
                Group
              </MenuItem>
            )}
            {one?.type === 'group' && (
              <MenuItem icon={<Ungroup size={14} />} hint={keyLabel('Ctrl+Shift+G')} onClick={() => (setMenu(null), unGroup())}>
                Ungroup
              </MenuItem>
            )}
            {one?.type === 'image' && !!(one as ImageEl).src && (
              <>
                <MenuItem icon={<Crop size={14} />} onClick={() => (setMenu(null), crop(one.id))}>
                  Crop the picture
                </MenuItem>
                <MenuItem icon={<WandSparkles size={14} />} onClick={() => (setMenu(null), void aiEdit(one.id, 'change'))}>
                  Change with AI
                </MenuItem>
                <MenuItem icon={<ImageMinus size={14} />} onClick={() => (setMenu(null), void aiEdit(one.id, 'cutout'))}>
                  Remove the background
                </MenuItem>
                <MenuItem icon={<Eraser size={14} />} onClick={() => (setMenu(null), void aiEdit(one.id, 'erase'))}>
                  Erase part of it
                </MenuItem>
              </>
            )}
            {one?.type === 'video' && !!keptVideo((one as VideoEl).src) && (
              <MenuItem icon={<SlidersHorizontal size={14} />} onClick={() => (setMenu(null), editVideo(one.id))}>
                Edit video
              </MenuItem>
            )}
            {one?.type === 'chart' && (
              <MenuItem icon={<ChartScatter size={14} />} onClick={() => (setMenu(null), void aiPlot(one.id))}>
                Make a plot of this
              </MenuItem>
            )}
            <MenuItem icon={<Paintbrush size={14} />} disabled={!one} onClick={() => (setMenu(null), startPainter(false))}>
              Format painter
            </MenuItem>
            {picked.length === 1 && (
              <MenuItem icon={<MessageSquarePlus size={14} />} hint={keyLabel('Ctrl+Alt+M')} onClick={() => (setMenu(null), startComment())}>
                Comment
              </MenuItem>
            )}
            {onAsk && picked.length === 1 && (
              <MenuItem icon={<Sparkles size={14} />} onClick={() => (setMenu(null), onAsk(`On slide ${index + 1}, the ${partName(picked[0]).replace(/^(\w)/, (c) => c.toLowerCase())}: `))}>
                Ask the agent about it
              </MenuItem>
            )}
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(null), remove())}>
              Delete
            </MenuItem>
          </>
        )}
        {!picked.length && (
          <>
            {!readOnly && (
              <MenuItem icon={<LayoutTemplate size={14} />} onClick={() => setMenu('slide')}>
                A new slide
              </MenuItem>
            )}
            {!readOnly && (
              <MenuItem icon={<MessageSquarePlus size={14} />} hint={keyLabel('Ctrl+Alt+M')} onClick={() => (setMenu(null), startComment())}>
                Comment
              </MenuItem>
            )}
            {onAsk && (
              <MenuItem icon={<Sparkles size={14} />} onClick={() => (setMenu(null), onAsk(`On slide ${index + 1}${slideTitle(slide) ? ` (“${slideTitle(slide)}”)` : ''}: `))}>
                Ask the agent about this slide
              </MenuItem>
            )}
            <MenuItem icon={<Play size={14} />} onClick={() => (setMenu(null), setPresent({ from: index, presenter: false }))}>
              Present from this slide
            </MenuItem>
          </>
        )}
      </Popover>
      {urlAsk && (
        <Popover anchor={anchors.picture} open onClose={() => setUrlAsk(null)} width={320} title="A picture from the web">
          <form
            className="space-y-2 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void pictureFromUrl();
            }}
          >
            <p className="text-[12px] text-fg-3">The picture’s own address (it ends in .jpg, .png…). The app keeps a copy in the deck.</p>
            <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={inputCls} />
            <div className="flex justify-end">
              <Button size="sm" variant="primary" type="submit" disabled={!url.trim()}>
                Add it
              </Button>
            </div>
          </form>
        </Popover>
      )}
      <IconPicker open={!!iconAsk} onClose={() => setIconAsk(null)} start={iconAsk?.start ?? 'icons'} title={iconAsk?.replace ? 'Another icon' : 'Insert an icon'} onIcon={putIcon} onEmoji={iconAsk?.replace ? undefined : putEmoji} />
      <Dialog
        open={videoAsk}
        onClose={() => setVideoAsk(false)}
        title="A video"
        width={460}
        footer={
          <Button size="sm" variant="primary" disabled={!videoSrc(videoUrl.trim())} onClick={putVideo}>
            Add it
          </Button>
        }
      >
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            putVideo();
          }}
        >
          <p className="text-[12.5px] text-fg-3">The address of a video on YouTube or Vimeo. Its picture shows on the slide; it plays when clicked in the slideshow.</p>
          <input
            autoFocus
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              putVideo();
            }}
            placeholder="https://www.youtube.com/watch?v=…"
            aria-label="The video’s address"
            className={inputCls}
          />
          {videoUrl.trim() && !videoSrc(videoUrl.trim()) && <p className="text-[12px] text-err">That is not a YouTube or Vimeo address.</p>}
        </form>
      </Dialog>
      <Dialog
        open={!!embedAsk}
        onClose={() => setEmbedAsk(null)}
        title="A web page"
        width={460}
        footer={
          <Button size="sm" variant="primary" disabled={!embedAddress(embedUrl)} onClick={putEmbed}>
            Add it
          </Button>
        }
      >
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            putEmbed();
          }}
        >
          <p className="text-[12.5px] text-fg-3">A page’s address, or the embed code a site gives. It shows on the slide and takes clicks in the slideshow. Only sites that let others show them in a frame appear.</p>
          <input
            autoFocus
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              putEmbed();
            }}
            placeholder="https://…"
            aria-label="The page’s address"
            translate="no"
            className={inputCls}
          />
          {embedUrl.trim() && !embedAddress(embedUrl) && <p className="text-[12px] text-err">A web address that starts with https://.</p>}
        </form>
      </Dialog>
      <FormatDialog
        open={compatAsk}
        deck={deck}
        onClose={() => setCompatAsk(false)}
        onConfirm={(next) => {
          setCompatAsk(false);
          canvas.current?.stopEditing();
          setRunning(null);
          change(next);
          toast('The deck is PowerPoint compatible', 'ok');
        }}
      />
      <FooterDialog open={footerOpen} onClose={() => setFooterOpen(false)} deck={deck} index={index} change={change} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} groups={SHORTCUTS} />
      {present && !present.presenter && <Slideshow deck={deck} from={present.from} onClose={() => setPresent(null)} />}
      {present?.presenter && <Presenter deck={deck} from={present.from} pageId={pageId} onClose={() => setPresent(null)} />}
      {confirmNode}
    </div>
  );
}

/** Loads a version's model (an older one on view, of a deck, a document or a spreadsheet). */

// A diagram of the Library in its editor, as draw.io: the shapes on the left (drawn as they will be, a search that finds
// Lucide's icons too), the page in the middle (diagram canvas: pan, zoom, pick, move with guides, resize, turn, connect
// with the blue arrows, words typed in place), the format panel on the right (style, text, arrange; a connector's line
// and ends; the page and its layout), the pages as tabs at the foot. Menus hold everything (Edit, View, Insert,
// Arrange, Format), with their keys; a right click holds what fits where it was made; a double click on empty space
// adds a shape there. Changes stay unsaved until Save (Ctrl+S), as a page's do; Undo and Redo step through them. Copy
// and paste go between diagrams and windows, and take draw.io's shapes, Mermaid, pictures and words. While an agent
// writes a new version it shows as it comes, read-only, the shape being written marked and kept in view.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Copy,
  Download,
  Eye,
  Grid3x3,
  Image as ImageIcon,
  Keyboard,
  LayoutTemplate,
  Maximize,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Search,
  Shapes,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Workflow,
  X,
} from 'lucide-react';
import { CONTAINER_KINDS, isEdge, isShape, newDiagram, newId, normalizeDiagram, ROW_KINDS, type Diagram, type DiagramEdge, type DiagramItem, type DiagramPage, type DiagramShape } from '@shared/diagram';
import { KINDS, pageBox } from '@shared/diagram-shapes';
import { alignShapes, boundsOf, cloneItems, distributeShapes, groupItems, matchSize, moveItems, movingSet, removeItems, reorder, ungroupItems, updateItems, expandGroups } from '@shared/diagram-ops';
import { relayoutPage } from '@shared/diagram-edits';
import { specPage, type LayoutKind } from '@shared/diagram-spec';
import type { PaletteEntry } from '@shared/diagram-palette';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, useConfirm } from '../../../components/ui';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import type { AskScope, ModelEditorProps } from '../kinds';
import { MenuBar, type MenuDef } from '../common/menus';
import { FindBar, useFind } from '../common/FindBar';
import { findIn, replaceAllIn } from '../common/find';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import { IconPicker } from '../slides/IconPicker';
import { saveBlob } from '../exportFile';
import { addBeside, DiagramCanvas, makeShape, withEdge, type CanvasApi, type View } from './DiagramCanvas';
import { FormatPanel } from './FormatPanel';
import { iconsNow, loadIcons, ShapePanel, type Pick } from './ShapePanel';
import { assetUrl, copyItems, dataUrlOf, inflateRaw, pngBlob, readPaste, svgText } from './clip';

/** Whether the app is dark now, followed as it changes. */
function useDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

const PREFS = 'hydor.diagram.view';
const prefs = (): { snap: boolean; grid: boolean; shapes: boolean; format: boolean } => {
  try {
    return { snap: true, grid: true, shapes: true, format: true, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
  } catch {
    return { snap: true, grid: true, shapes: true, format: true };
  }
};

/** A picture file as a kept picture of the app (its source, naget-asset:…). */
async function keepPicture(f: Blob): Promise<string> {
  const data = await dataUrlOf(f);
  return (await post<{ src: string }>('/api/pages/assets', { data })).src;
}

/** Picks a file of this device. */
const pickFile = (accept: string) =>
  new Promise<File | null>((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.click();
  });

const QUICK: { label: string; entry: PaletteEntry }[] = [
  { label: 'Rectangle', entry: { id: 'q.rect', label: 'Rectangle', shape: 'rect' } },
  { label: 'Rounded rectangle', entry: { id: 'q.rounded', label: 'Rounded rectangle', shape: 'rounded' } },
  { label: 'Ellipse', entry: { id: 'q.ellipse', label: 'Ellipse', shape: 'ellipse' } },
  { label: 'Decision', entry: { id: 'q.diamond', label: 'Decision', shape: 'diamond', text: 'Decision?' } },
  { label: 'Start or end', entry: { id: 'q.term', label: 'Start or end', shape: 'terminator', text: 'Start' } },
  { label: 'Data', entry: { id: 'q.data', label: 'Data', shape: 'parallelogram' } },
  { label: 'Database', entry: { id: 'q.db', label: 'Database', shape: 'cylinder' } },
  { label: 'Document', entry: { id: 'q.doc', label: 'Document', shape: 'document' } },
  { label: 'Cloud', entry: { id: 'q.cloud', label: 'Cloud', shape: 'cloud' } },
  { label: 'Sticky note', entry: { id: 'q.sticky', label: 'Sticky note', shape: 'sticky' } },
  { label: 'Text', entry: { id: 'q.text', label: 'Text', shape: 'text', text: 'Text' } },
  { label: 'Group box', entry: { id: 'q.box', label: 'Group box', shape: 'container', text: 'Group' } },
];

export function DiagramEditor({ doc, layout, readOnly: readOnlyProp, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef, live }: ModelEditorProps<Diagram>) {
  const dark = useDark();
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<CanvasApi>(null);
  const [width, setWidth] = useState(1200);
  const narrow = width < 860 || layout !== 'page';
  const [d, setDState] = useState<Diagram>(() => doc?.model ?? newDiagram());
  const dRef = useRef(d);
  const saved = useRef<Diagram>(d);
  const hist = useRef<{ past: Diagram[]; future: Diagram[]; key: string; at: number }>({ past: [], future: [], key: '', at: 0 });
  const [, rerender] = useState(0);
  const [pi, setPi] = useState(0);
  const [sel, setSelState] = useState<string[]>([]);
  const selRef = useRef(sel);
  const views = useRef(new Map<string, View>());
  const [view, setView] = useState<View>({ x: 60, y: 60, k: 1 });
  const p0 = useMemo(prefs, []);
  const [snap, setSnap] = useState(p0.snap);
  const [showGrid, setShowGrid] = useState(p0.grid);
  // Beside a conversation or on a phone the panels would cover the page: closed until asked for.
  const [showShapes, setShowShapes] = useState(p0.shapes && layout === 'page');
  const [showFormat, setShowFormat] = useState(p0.format && layout === 'page');
  const [saving, setSaving] = useState(false);
  const [ctx, setCtx] = useState<{ x: number; y: number; hit: DiagramItem | null } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [quick, setQuick] = useState<{ x: number; y: number; at: { x: number; y: number } } | null>(null);
  const quickRef = useRef<HTMLDivElement>(null);
  const [iconFor, setIconFor] = useState<{ id?: string; at?: { x: number; y: number } } | null>(null);
  const [dialog, setDialog] = useState<null | 'mermaid' | 'export' | 'keys'>(null);
  const [mermaidText, setMermaidText] = useState('');
  const [tabMenu, setTabMenu] = useState<{ i: number; el: HTMLElement } | null>(null);
  const tabRef = useRef<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const find = useFind();
  const [findAt, setFindAt] = useState(0);
  const [confirm, confirmNode] = useConfirm();
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const pasteN = useRef(0);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    try {
      // The panels are remembered as they are on a page of their own, not beside a conversation.
      const prev = prefs();
      localStorage.setItem(PREFS, JSON.stringify({ snap, grid: showGrid, shapes: layout === 'page' ? showShapes : prev.shapes, format: layout === 'page' ? showFormat : prev.format }));
    } catch {}
  }, [snap, showGrid, showShapes, showFormat, layout]);
  // A window too narrow for them: the panels close when it first shows.
  const measured = useRef(false);
  useEffect(() => {
    if (measured.current || width === 1200) return;
    measured.current = true;
    if (width < 860) {
      setShowShapes(false);
      setShowFormat(false);
    }
  }, [width]);

  // ---- the model, its history, and saving ------------------------------------------------------------------------------
  const dirty = d !== saved.current;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const setSel = useCallback((ids: string[]) => {
    selRef.current = ids;
    setSelState(ids);
  }, []);

  // Another diagram, or a new version of it (the agent's) while nothing was changed here: start from it.
  const taken = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!doc || doc.key === taken.current || dirtyRef.current) return;
    const first = taken.current === undefined;
    taken.current = doc.key;
    dRef.current = doc.model;
    saved.current = doc.model;
    hist.current = { past: [], future: [], key: '', at: 0 };
    setDState(doc.model);
    setPi((i) => Math.min(i, doc.model.pages.length - 1));
    setSel(selRef.current.filter((id) => doc.model.pages.some((p) => p.items.some((it) => it.id === id))));
    if (first) requestAnimationFrame(() => canvas.current?.fit(null, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key, dirty]);

  // An agent's version being written shows in place of the diagram (read-only), unless there are changes here not saved.
  const liveD = live && !dirty ? live.model : null;
  const shownD = liveD ?? d;
  const readOnly = !!readOnlyProp || !!liveD;
  const pageIx = Math.min(pi, shownD.pages.length - 1);
  const page = shownD.pages[pageIx];
  const mark = liveD && live?.mark?.kind === 'diagram' ? live.mark : null;
  useEffect(() => {
    if (!mark) return;
    if (mark.page !== pageIx && mark.page < shownD.pages.length) setPi(mark.page);
    if (mark.item) {
      const b = boundsOf(shownD.pages[mark.page] ?? page, new Set([mark.item]));
      if (b) requestAnimationFrame(() => canvas.current?.show(b));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.item, mark?.page, live?.n]);
  // While a new diagram is being written: fitted to it as it grows.
  useEffect(() => {
    if (liveD && !mark?.item && live?.n && live.n % 4 === 1) requestAnimationFrame(() => canvas.current?.fit(null, 1));
  }, [live?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback((next: Diagram, key?: string) => {
    if (next === dRef.current) return;
    const h = hist.current;
    const now = Date.now();
    if (!(key && h.key === key && now - h.at < 1500)) {
      h.past.push(dRef.current);
      if (h.past.length > 200) h.past.shift();
    }
    h.future = [];
    h.key = key ?? '';
    h.at = now;
    dRef.current = next;
    setDState(next);
  }, []);
  const pageRef = useRef(pageIx);
  pageRef.current = pageIx;
  const change = useCallback(
    (f: (p: DiagramPage) => DiagramPage, key?: string) => {
      const cur = dRef.current;
      const i = Math.min(pageRef.current, cur.pages.length - 1);
      const np = f(cur.pages[i]);
      if (np === cur.pages[i]) return;
      commit({ ...cur, pages: cur.pages.map((p, j) => (j === i ? np : p)) }, key);
    },
    [commit],
  );
  const changeDiagram = useCallback((f: (x: Diagram) => Diagram, key?: string) => commit(f(dRef.current), key), [commit]);
  const undo = () => {
    const h = hist.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(dRef.current);
    h.key = '';
    dRef.current = prev;
    setDState(prev);
    rerender((n) => n + 1);
  };
  const redo = () => {
    const h = hist.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(dRef.current);
    h.key = '';
    dRef.current = next;
    setDState(next);
    rerender((n) => n + 1);
  };

  const save = async (): Promise<boolean> => {
    if (!onSave || saving) return false;
    setSaving(true);
    try {
      const model = normalizeDiagram(dRef.current);
      const ok = await onSave(model);
      if (ok) {
        saved.current = dRef.current;
        rerender((n) => n + 1);
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
    if (!(await confirm({ title: 'Discard your changes?', body: 'The diagram goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    hist.current.past.push(dRef.current);
    dRef.current = saved.current;
    setDState(saved.current);
    setSel([]);
  };

  // ---- the view of each page ------------------------------------------------------------------------------------------
  const pageId = page?.id;
  const lastPage = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pageId || pageId === lastPage.current) return;
    if (lastPage.current) views.current.set(lastPage.current, view);
    lastPage.current = pageId;
    const v = views.current.get(pageId);
    if (v) setView(v);
    else requestAnimationFrame(() => canvas.current?.fit(null, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // ---- doing things to what is picked ---------------------------------------------------------------------------------
  const selSet = useMemo(() => new Set(sel), [sel]);
  const picked = useMemo(() => page.items.filter((it) => selSet.has(it.id)), [page, selSet]);
  const pickedShapes = picked.filter(isShape);
  const can = !readOnly;
  const del = () => {
    if (!can || !sel.length) return;
    change((p) => removeItems(p, new Set(sel)));
    setSel([]);
  };
  const selectAll = () => setSel(page.items.map((it) => it.id));
  /** What a copy takes: the items picked, their groups', what their containers hold, and connectors among them. */
  const copySet = (p: DiagramPage) => {
    const ids = movingSet(p, sel);
    for (const id of expandGroups(p, sel)) ids.add(id);
    return p.items.filter((it) => ids.has(it.id));
  };
  const copy = async (cut = false) => {
    if (!sel.length) return;
    await copyItems(copySet(page));
    pasteN.current = 0;
    if (cut && can) del();
    else toast(tr(cut ? 'Cut' : 'Copied'));
  };
  const placeItems = (items: DiagramItem[], at?: { x: number; y: number }) => {
    const shapesNow = new Map(page.items.filter(isShape).map((s) => [s.id, s]));
    let dx = 20;
    let dy = 20;
    if (at) {
      const b = boundsOf({ ...page, items }, new Set(items.map((x) => x.id)));
      if (b) {
        dx = at.x - (b.x + b.w / 2);
        dy = at.y - (b.y + b.h / 2);
      }
    } else {
      pasteN.current += 1;
      dx = dy = 20 * pasteN.current;
    }
    const copies = cloneItems(items, Math.round(dx), Math.round(dy), shapesNow);
    change((p) => ({ ...p, items: [...p.items, ...copies] }));
    setSel(copies.map((c) => c.id));
  };
  const duplicate = () => {
    if (!can || !sel.length) return;
    pasteN.current = 0;
    placeItems(copySet(page));
  };
  const insertText = (text: string, at: { x: number; y: number }) => {
    const s = makeShape('text', at, { text });
    const fit = specPage({ nodes: [{ id: 'x', shape: 'text', text }], edges: [], layout: 'none' }).page.items[0] as DiagramShape;
    s.w = fit.w;
    s.h = fit.h;
    s.x = Math.round(at.x - s.w / 2);
    s.y = Math.round(at.y - s.h / 2);
    change((p) => ({ ...p, items: [...p.items, s] }));
    setSel([s.id]);
  };
  /** Shapes from Mermaid text, or a draw.io file's: put beside what the page holds, picked. */
  const addPage = (items: DiagramItem[], at?: { x: number; y: number }) => {
    if (!items.length) return;
    const b = boundsOf(page, new Set(page.items.map((x) => x.id)));
    const nb = boundsOf({ ...page, items }, new Set(items.map((x) => x.id)));
    const dx = at && nb ? at.x - (nb.x + nb.w / 2) : b && nb ? b.x + b.w + 80 - nb.x : 0;
    const dy = at && nb ? at.y - (nb.y + nb.h / 2) : b && nb ? b.y - nb.y : 0;
    const moved = moveItems({ ...page, items }, new Set(items.map((x) => x.id)), Math.round(dx), Math.round(dy)).items;
    const ids = new Set(page.items.map((x) => x.id));
    // Ids clash with those of the page: made anew.
    const fresh = moved.some((x) => ids.has(x.id)) ? cloneItems(moved, 0, 0) : moved;
    change((p) => ({ ...p, items: [...p.items, ...fresh] }));
    setSel(fresh.map((x) => x.id));
    requestAnimationFrame(() => {
      const nb2 = boundsOf({ ...page, items: fresh }, new Set(fresh.map((x) => x.id)));
      if (nb2) canvas.current?.show(nb2);
    });
  };
  const fromMermaid = async (text: string, at?: { x: number; y: number }): Promise<boolean> => {
    try {
      const { mermaidSpec } = await import('@shared/diagram-mermaid');
      const m = mermaidSpec(text);
      await loadIcons();
      const r = specPage(m.page, { icon: iconsNow()?.iconPaths, font: d.font });
      addPage(r.page.items, at);
      if (m.notes.length || r.notes.length) toast([...m.notes, ...r.notes].join(' '));
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const fromDrawio = async (input: string | Uint8Array, asPages: boolean) => {
    try {
      const { drawioToDiagram } = await import('@shared/diagram-drawio');
      const r = await drawioToDiagram(input, { inflate: inflateRaw });
      if (asPages && r.diagram.pages.length > 1) {
        const pages = r.diagram.pages.map((p) => ({ ...p, id: newId('p') }));
        changeDiagram((x) => ({ ...x, pages: [...x.pages, ...pages] }));
        setPi(dRef.current.pages.length - pages.length);
      } else addPage(r.diagram.pages[0]?.items ?? []);
      if (r.notes.length) toast(r.notes.join(' '));
    } catch (e) {
      toastError(e);
    }
  };
  const paste = async (e?: ClipboardEvent, at?: { x: number; y: number }) => {
    if (!can) return;
    const got = await readPaste(e);
    if (!got) return toast(tr('Nothing to paste: copy shapes first (Ctrl+C).'));
    const where = at ?? canvas.current?.middle() ?? { x: 0, y: 0 };
    if (got.kind === 'items') return placeItems(got.items, at);
    if (got.kind === 'image') {
      try {
        const src = await keepPicture(got.blob);
        const img = new Image();
        img.src = assetUrl(src);
        await img.decode().catch(() => {});
        const k = Math.min(1, 480 / Math.max(img.naturalWidth || 240, img.naturalHeight || 160));
        const s = makeShape('image', where, { src, w: Math.round((img.naturalWidth || 240) * k), h: Math.round((img.naturalHeight || 160) * k) });
        change((p) => ({ ...p, items: [...p.items, s] }));
        setSel([s.id]);
      } catch (err) {
        toastError(err);
      }
      return;
    }
    const text = got.text.trim();
    if (/<mxGraphModel|<mxfile|%3CmxGraphModel/i.test(text)) return fromDrawio(text, false);
    if (/^\s*(%%.*\n\s*)*(flowchart|graph|mindmap|classDiagram|erDiagram|stateDiagram(-v2)?|sequenceDiagram)\b/.test(text)) return void fromMermaid(text, at);
    insertText(text.slice(0, 4000), where);
  };

  const order = (how: 'front' | 'back' | 'forward' | 'backward') => sel.length && change((p) => reorder(p, expandGroups(p, sel), how));
  const act = {
    align: (how: Parameters<typeof alignShapes>[2]) => change((p) => alignShapes(p, new Set(sel), how)),
    distribute: (axis: 'x' | 'y') => change((p) => distributeShapes(p, new Set(sel), axis)),
    order,
    group: () => change((p) => groupItems(p, new Set(sel))),
    ungroup: () => change((p) => ungroupItems(p, new Set(sel))),
    layout: (kind: LayoutKind) => {
      change((p) => relayoutPage(p, kind));
      requestAnimationFrame(() => canvas.current?.fit(null, 1));
    },
    icon: () => setIconFor({ id: sel[0] }),
    picture: async () => {
      const f = await pickFile('image/*');
      if (!f) return;
      try {
        const src = await keepPicture(f);
        change((p) => updateItems(p, new Set(sel), (it) => (isShape(it) ? { ...it, src } : it)));
      } catch (e) {
        toastError(e);
      }
    },
    matchSize: (how: 'w' | 'h' | 'both') => change((p) => matchSize(p, sel, how)),
  };

  /** Something of the shapes panel put on the page: at a point, or in the middle of what shows. */
  const insert = async (pk: Pick, at?: { x: number; y: number }) => {
    if (!can) return;
    const e = pk.entry;
    const where = at ?? canvas.current?.middle() ?? { x: 0, y: 0 };
    if (e.edge) {
      const ed: DiagramEdge = { id: newId('e'), type: 'edge', from: { x: Math.round(where.x - 60), y: Math.round(where.y) }, to: { x: Math.round(where.x + 60), y: Math.round(where.y) }, ...(e.edge.route ? { route: e.edge.route } : {}), ...(e.edge.style ? { style: { ...e.edge.style } } : {}) };
      change((p) => ({ ...p, items: [...p.items, ed] }));
      setSel([ed.id]);
      return;
    }
    const kind = e.shape ?? 'rect';
    let icon = pk.icon;
    if (kind === 'icon' && !icon && e.icon) {
      await loadIcons();
      icon = iconsNow()?.iconPaths(e.icon) ?? undefined;
    }
    if (kind === 'image' && !at) {
      const f = await pickFile('image/*');
      if (!f) return;
      try {
        const src = await keepPicture(f);
        const s = makeShape('image', where, { src });
        change((p) => ({ ...p, items: [...p.items, s] }));
        setSel([s.id]);
      } catch (err) {
        toastError(err);
      }
      return;
    }
    // Nothing given where to put it, and something already there: beside what is picked, else a little apart.
    let pt = where;
    if (!at && pickedShapes.length === 1) {
      const b = pageBox(pickedShapes[0]);
      pt = { x: b.x + b.w + 40 + (e.w ?? KINDS[kind].w) / 2, y: b.y + b.h / 2 };
    }
    const s = makeShape(kind, pt, {
      ...(e.w ? { w: e.w } : {}),
      ...(e.h ? { h: e.h } : {}),
      ...(e.text ? { text: e.text } : {}),
      ...(e.rows ? { rows: [...e.rows] } : {}),
      ...(e.style ? { style: { ...e.style } } : {}),
      ...(icon && e.icon ? { icon: { name: e.icon, paths: icon } } : {}),
    });
    if (snap && d.grid) {
      s.x = Math.round(s.x / d.grid) * d.grid;
      s.y = Math.round(s.y / d.grid) * d.grid;
    }
    // Dropped in a container: put in it.
    let parent: string | undefined;
    for (const it of page.items) if (isShape(it) && CONTAINER_KINDS.has(it.shape) && !CONTAINER_KINDS.has(kind)) {
      const b = pageBox(it);
      if (pt.x > b.x && pt.x < b.x + b.w && pt.y > b.y && pt.y < b.y + b.h) parent = it.id;
    }
    if (parent) s.parent = parent;
    change((p) => ({ ...p, items: CONTAINER_KINDS.has(kind) ? [s, ...p.items] : [...p.items, s] }));
    setSel([s.id]);
  };

  // A drag from the shapes panel: a picture of it follows the pointer, and where it is let go over the page, it goes.
  const dragged = useRef(false);
  const startDrag = (pk: Pick, ev: React.PointerEvent) => {
    if (!can) return;
    const x0 = ev.clientX;
    const y0 = ev.clientY;
    dragged.current = false;
    const move = (e: PointerEvent) => {
      if (!dragged.current && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      dragged.current = true;
      setGhost({ x: e.clientX, y: e.clientY, label: pk.entry.label });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setGhost(null);
      if (!dragged.current) return;
      const el = canvas.current?.el();
      const r = el?.getBoundingClientRect();
      if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) void insert(pk, canvas.current!.toPage(e.clientX, e.clientY));
      // The click that follows a drag is not another insert.
      setTimeout(() => (dragged.current = false), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---- pages ----------------------------------------------------------------------------------------------------------
  const addNewPage = () => {
    const n = dRef.current.pages.length + 1;
    changeDiagram((x) => ({ ...x, pages: [...x.pages, { id: newId('p'), name: `${tr('Page')} ${n}`, items: [] }] }));
    setPi(n - 1);
    setSel([]);
  };
  const dupPage = (i: number) => {
    const src = dRef.current.pages[i];
    const copyItemsOf = cloneItems(src.items, 0, 0);
    changeDiagram((x) => ({ ...x, pages: [...x.pages.slice(0, i + 1), { ...src, id: newId('p'), name: `${src.name} (${tr('copy')})`, items: copyItemsOf }, ...x.pages.slice(i + 1)] }));
    setPi(i + 1);
  };
  const delPage = async (i: number) => {
    if (dRef.current.pages.length < 2) return;
    const p = dRef.current.pages[i];
    if (p.items.length && !(await confirm({ title: tr(`Delete the page “${p.name}”?`), body: 'What is on it goes with it (Undo brings it back).', confirm: 'Delete', danger: true }))) return;
    changeDiagram((x) => ({ ...x, pages: x.pages.filter((_, j) => j !== i) }));
    setPi(Math.max(0, Math.min(i, dRef.current.pages.length - 1)));
    setSel([]);
  };
  const movePage = (i: number, to: number) => {
    if (to < 0 || to >= dRef.current.pages.length) return;
    changeDiagram((x) => {
      const pages = [...x.pages];
      const [p] = pages.splice(i, 1);
      pages.splice(to, 0, p);
      return { ...x, pages };
    });
    setPi(to);
  };
  const goPage = (i: number) => {
    setPi(i);
    setSel([]);
  };

  // ---- find -----------------------------------------------------------------------------------------------------------
  const matches = useMemo(() => {
    if (!find.open || !find.query) return [] as string[];
    const out: string[] = [];
    for (const it of page.items) {
      const words = [it.text ?? '', ...(isShape(it) ? (it.rows ?? []) : [it.fromText ?? '', it.toText ?? ''])].join('\n');
      if (findIn(words, find.query, find.options, 1).length) out.push(it.id);
    }
    return out;
  }, [find.open, find.query, find.options, page]);
  useEffect(() => setFindAt(0), [find.query]);
  const goMatch = (i: number) => {
    if (!matches.length) return;
    const j = ((i % matches.length) + matches.length) % matches.length;
    setFindAt(j);
    setSel([matches[j]]);
    const b = boundsOf(page, new Set([matches[j]]));
    if (b) canvas.current?.show(b);
  };
  const replaceIn = (all: boolean) => {
    if (!can || !find.query) return;
    const targets = all ? new Set(matches) : new Set(matches[findAt] ? [matches[findAt]] : []);
    let n = 0;
    change((p) =>
      updateItems(p, targets, (it) => {
        const rep = (t?: string) => {
          if (!t) return t;
          const r = replaceAllIn(t, find.query, find.replacement, find.options);
          n += r.count;
          return r.text;
        };
        return isShape(it) ? { ...it, text: rep(it.text), rows: it.rows?.map((r) => rep(r) ?? r) } : { ...it, text: rep(it.text), fromText: rep(it.fromText), toText: rep(it.toText) };
      }),
    );
    if (all) toast(tr(`Replaced ${n}`));
  };

  // ---- keys -----------------------------------------------------------------------------------------------------------
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const a = document.activeElement as HTMLElement | null;
    if (a && a !== document.body && !root.current?.contains(a)) return;
    const typing = !!a?.closest('input,textarea,select,[contenteditable="true"]');
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      if (typing) a?.blur();
      setTimeout(() => void saveNow.current(), 0);
      return;
    }
    if (typing) return;
    if (mod && k === 'f') {
      e.preventDefault();
      find.show(false);
      return;
    }
    if (mod && k === 'h') {
      e.preventDefault();
      find.show(true);
      return;
    }
    if (mod && (k === '/' || k === '?')) {
      e.preventDefault();
      setDialog('keys');
      return;
    }
    if (mod && (k === '=' || k === '+')) {
      e.preventDefault();
      canvas.current?.zoomBy(1.2);
      return;
    }
    if (mod && k === '-') {
      e.preventDefault();
      canvas.current?.zoomBy(1 / 1.2);
      return;
    }
    if (mod && k === '0') {
      e.preventDefault();
      setView((v) => ({ ...v, k: 1 }));
      return;
    }
    if (mod && e.shiftKey && k === 'h') {
      e.preventDefault();
      canvas.current?.fit();
      return;
    }
    if (mod && k === 'a') {
      e.preventDefault();
      selectAll();
      return;
    }
    if (mod && k === 'c') {
      e.preventDefault();
      void copy(false);
      return;
    }
    if (e.key === 'Escape') {
      if (find.open) find.close();
      else setSel([]);
      return;
    }
    if (readOnly) return;
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
    if (mod && k === 'x') {
      e.preventDefault();
      void copy(true);
      return;
    }
    if (mod && k === 'd') {
      e.preventDefault();
      duplicate();
      return;
    }
    if (mod && k === 'g') {
      e.preventDefault();
      if (e.shiftKey) act.ungroup();
      else act.group();
      return;
    }
    if (mod && (e.key === ']' || e.key === '}')) {
      e.preventDefault();
      order(e.shiftKey ? 'front' : 'forward');
      return;
    }
    if (mod && (e.key === '[' || e.key === '{')) {
      e.preventDefault();
      order(e.shiftKey ? 'back' : 'backward');
      return;
    }
    if (mod && e.shiftKey && k === 'l') {
      e.preventDefault();
      change((p) => updateItems(p, new Set(sel), (it) => ({ ...it, locked: it.locked ? undefined : true }) as DiagramItem));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      del();
      return;
    }
    if (e.key.startsWith('Arrow') && sel.length) {
      e.preventDefault();
      const step = e.shiftKey ? (d.grid || 10) : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      change((p) => moveItems(p, movingSet(p, sel), dx, dy), 'nudge');
      return;
    }
    if ((e.key === 'Enter' || e.key === 'F2') && sel.length === 1) {
      e.preventDefault();
      canvas.current?.edit(sel[0]);
      return;
    }
    // Typing on a picked shape writes over its words, as draw.io does.
    if (!mod && !e.altKey && e.key.length === 1 && sel.length === 1 && e.key !== ' ') {
      const it = page.items.find((x) => x.id === sel[0]);
      if (it && !(isShape(it) && (it.shape === 'image' || (it.shape === 'icon' && !it.text)))) {
        e.preventDefault();
        canvas.current?.edit(it.id, 'text', { text: e.key });
      }
    }
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    const onPaste = (e: ClipboardEvent) => {
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      if (a?.closest('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault();
      void paste(e);
    };
    window.addEventListener('keydown', on);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('paste', onPaste);
    };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what an agent could be asked about ---------------------------------------------------------------------------
  const scopesTo = useRef(onScopes);
  scopesTo.current = onScopes;
  useEffect(() => {
    const t = setTimeout(() => {
      const scopes: AskScope[] = [{ id: 'diagram', label: tr('The whole diagram'), lead: '' }];
      if (shownD.pages.length > 1) scopes.push({ id: 'page', label: `${tr('This page')}: ${page.name}`, lead: `On the page “${page.name}”: ` });
      if (picked.length) {
        const names = picked.slice(0, 4).map((it) => (it.text ? `${it.id} (“${it.text.replace(/\s+/g, ' ').slice(0, 40)}”)` : it.id));
        const n = picked.length;
        scopes.push({
          id: 'picked',
          label: n === 1 ? tr(isEdge(picked[0]) ? 'The picked connector' : 'The picked shape') : tr(`The ${n} picked items`),
          lead: `About ${n === 1 ? 'the item' : 'the items'} ${names.join(', ')}${n > 4 ? ` and ${n - 4} more` : ''}${shownD.pages.length > 1 ? ` on the page “${page.name}”` : ''}: `,
        });
      }
      scopesTo.current?.(scopes);
    }, 150);
    return () => clearTimeout(t);
  }, [picked, page.name, shownD.pages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const askAbout = () => {
    if (!onAsk) return;
    const names = picked.slice(0, 6).map((it) => (it.text ? `${it.id} (“${it.text.replace(/\s+/g, ' ').slice(0, 40)}”)` : it.id));
    onAsk(picked.length ? `About ${picked.length === 1 ? 'the item' : 'the items'} ${names.join(', ')}: ` : '');
  };

  // ---- files made here --------------------------------------------------------------------------------------------------
  const [exp, setExp] = useState({ format: 'png' as 'png' | 'svg', scale: 2, transparent: false, dark: false, only: false });
  const exportNow = async () => {
    try {
      const o = { only: exp.only && sel.length ? new Set(movingSet(page, sel)) : undefined, dark: exp.dark, transparent: exp.transparent, scale: exp.format === 'png' ? exp.scale : 1 };
      const base = (doc?.title ?? 'diagram').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'diagram';
      const name = shownD.pages.length > 1 ? `${base} - ${page.name}` : base;
      if (exp.format === 'svg') saveBlob(new Blob([(await svgText(shownD, page, o)).svg], { type: 'image/svg+xml' }), `${name}.svg`);
      else saveBlob(await pngBlob(shownD, page, o), `${name}.png`);
      setDialog(null);
    } catch (e) {
      toastError(e);
    }
  };
  const copyPicture = async () => {
    try {
      const blob = await pngBlob(shownD, page, { only: sel.length ? new Set(movingSet(page, sel)) : undefined, scale: 2 });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast(tr('Copied as a picture'));
    } catch (e) {
      toastError(e);
    }
  };

  // ---- menus --------------------------------------------------------------------------------------------------------------
  const h = hist.current;
  const one = picked.length === 1 ? picked[0] : null;
  const menus: MenuDef[] = [
    {
      label: 'Edit',
      items: [
        { label: 'Undo', keys: 'Ctrl+Z', disabled: !can || !h.past.length, run: undo },
        { label: 'Redo', keys: 'Ctrl+Shift+Z', disabled: !can || !h.future.length, run: redo },
        '-',
        { label: 'Cut', keys: 'Ctrl+X', disabled: !can || !sel.length, run: () => void copy(true) },
        { label: 'Copy', keys: 'Ctrl+C', disabled: !sel.length, run: () => void copy(false) },
        { label: 'Paste', keys: 'Ctrl+V', disabled: !can, run: () => void paste() },
        { label: 'Duplicate', keys: 'Ctrl+D', disabled: !can || !sel.length, run: duplicate },
        { label: 'Delete', keys: 'Delete', disabled: !can || !sel.length, run: del },
        '-',
        { label: 'Select all', keys: 'Ctrl+A', run: selectAll },
        { label: 'Select the shapes', run: () => setSel(page.items.filter(isShape).map((x) => x.id)) },
        { label: 'Select the connectors', run: () => setSel(page.items.filter(isEdge).map((x) => x.id)) },
        '-',
        { label: 'Edit the words', keys: 'Enter', disabled: !can || !one, run: () => one && canvas.current?.edit(one.id) },
        { label: 'Find and replace', keys: 'Ctrl+F', also: 'search', run: () => find.show(false) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom in', keys: 'Ctrl+=', run: () => canvas.current?.zoomBy(1.2) },
        { label: 'Zoom out', keys: 'Ctrl+-', run: () => canvas.current?.zoomBy(1 / 1.2) },
        { label: 'Actual size', keys: 'Ctrl+0', run: () => setView((v) => ({ ...v, k: 1 })) },
        { label: 'Fit the page', keys: 'Ctrl+Shift+H', run: () => canvas.current?.fit() },
        { label: 'Fit what is picked', disabled: !sel.length, run: () => canvas.current?.fit(boundsOf(page, new Set(sel)), 2) },
        '-',
        { label: 'Grid', checked: showGrid, run: () => setShowGrid(!showGrid) },
        { label: 'Snap to the grid and guides', checked: snap, run: () => setSnap(!snap) },
        '-',
        { label: 'Shapes panel', checked: showShapes, run: () => setShowShapes(!showShapes) },
        { label: 'Format panel', checked: showFormat, run: () => setShowFormat(!showFormat) },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'Text', disabled: !can, run: () => void insert({ entry: QUICK[10].entry }) },
        { label: 'Sticky note', disabled: !can, run: () => void insert({ entry: QUICK[9].entry }) },
        { label: 'Icon…', disabled: !can, also: 'lucide symbol', run: () => setIconFor({}) },
        { label: 'Picture…', disabled: !can, also: 'image photo', run: () => void insert({ entry: { id: 'pic', label: 'Picture', shape: 'image' } }) },
        { label: 'Group box', disabled: !can, also: 'container', run: () => void insert({ entry: QUICK[11].entry }) },
        { label: 'Table', disabled: !can, run: () => void insert({ entry: { id: 'tbl', label: 'Table', shape: 'table', rows: ['Name | Role', 'Ada | Engineer', 'Grace | Admiral'] } }) },
        '-',
        { label: 'From Mermaid…', disabled: !can, also: 'code text diagram', run: () => setDialog('mermaid') },
        {
          label: 'From a draw.io file…',
          disabled: !can,
          also: 'import diagrams.net',
          run: () =>
            void pickFile('.drawio,.dio,.xml,.svg,.png').then(async (f) => {
              if (!f) return;
              await fromDrawio(/\.png$/i.test(f.name) ? new Uint8Array(await f.arrayBuffer()) : await f.text(), true);
            }),
        },
        '-',
        { label: 'Page', disabled: !can, run: addNewPage },
      ],
    },
    {
      label: 'Arrange',
      items: [
        { label: 'Bring to front', keys: 'Ctrl+Shift+]', disabled: !can || !sel.length, run: () => order('front') },
        { label: 'Bring forward', keys: 'Ctrl+]', disabled: !can || !sel.length, run: () => order('forward') },
        { label: 'Send backward', keys: 'Ctrl+[', disabled: !can || !sel.length, run: () => order('backward') },
        { label: 'Send to back', keys: 'Ctrl+Shift+[', disabled: !can || !sel.length, run: () => order('back') },
        '-',
        {
          label: 'Align',
          disabled: !can || pickedShapes.length < 2,
          items: [
            { label: 'Left edges', run: () => act.align('left') },
            { label: 'Centres', run: () => act.align('center') },
            { label: 'Right edges', run: () => act.align('right') },
            { label: 'Tops', run: () => act.align('top') },
            { label: 'Middles', run: () => act.align('middle') },
            { label: 'Bottoms', run: () => act.align('bottom') },
          ],
        },
        {
          label: 'Space out',
          disabled: !can || pickedShapes.length < 3,
          also: 'distribute',
          items: [
            { label: 'Across', run: () => act.distribute('x') },
            { label: 'Down', run: () => act.distribute('y') },
          ],
        },
        { label: 'Same size', disabled: !can || pickedShapes.length < 2, run: () => act.matchSize('both') },
        '-',
        { label: 'Group', keys: 'Ctrl+G', disabled: !can || sel.length < 2, run: act.group },
        { label: 'Ungroup', keys: 'Ctrl+Shift+G', disabled: !can || !picked.some((x) => x.group), run: act.ungroup },
        { label: picked.length && picked.every((x) => x.locked) ? 'Unlock' : 'Lock', keys: 'Ctrl+Shift+L', disabled: !can || !sel.length, run: () => change((p) => updateItems(p, new Set(sel), (it) => ({ ...it, locked: it.locked ? undefined : true }) as DiagramItem)) },
        '-',
        {
          label: 'Layout',
          disabled: !can || !page.items.length,
          also: 'arrange automatically tidy',
          items: [
            { label: 'Flow down', run: () => act.layout('down') },
            { label: 'Flow right', run: () => act.layout('right') },
            { label: 'Tree', run: () => act.layout('tree') },
            { label: 'Tree across', run: () => act.layout('tree-right') },
            { label: 'Mind map', run: () => act.layout('mindmap') },
            { label: 'Rings', run: () => act.layout('radial') },
            { label: 'Circle', run: () => act.layout('circle') },
            { label: 'Grid', run: () => act.layout('grid') },
          ],
        },
      ],
    },
    {
      label: 'File',
      items: [
        { label: 'Download as a picture…', also: 'export png svg', run: () => setDialog('export') },
        { label: 'Copy as a picture', also: 'png clipboard', run: () => void copyPicture() },
        '-',
        { label: 'Keyboard shortcuts', keys: 'Ctrl+/', run: () => setDialog('keys') },
      ],
    },
  ];

  const shortcuts: ShortcutGroup[] = [
    {
      title: 'Shapes',
      items: [
        ['Enter / F2', 'Edit the words'],
        ['Delete', 'Delete'],
        ['Ctrl+D', 'Duplicate'],
        ['Ctrl+G', 'Group'],
        ['Ctrl+Shift+G', 'Ungroup'],
        ['Ctrl+Shift+L', 'Lock or unlock'],
        ['Arrow', 'Nudge'],
        ['Shift+Arrow', 'Nudge by the grid'],
        ['Ctrl+] / Ctrl+[', 'Forward or backward'],
        ['Ctrl+Shift+] / Ctrl+Shift+[', 'To the front or back'],
      ],
    },
    {
      title: 'With the mouse',
      items: [
        ['Shift+Click', 'Pick more'],
        ['Alt+Drag', 'Drag a copy'],
        ['Shift+Drag', 'Move straight across or down'],
        ['Space+Drag', 'Pan'],
        ['Ctrl+Wheel', 'Zoom'],
      ],
    },
    {
      title: 'Edit',
      items: [
        ['Ctrl+Z', 'Undo'],
        ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
        ['Ctrl+C', 'Copy'],
        ['Ctrl+X', 'Cut'],
        ['Ctrl+V', 'Paste'],
        ['Ctrl+A', 'Select all'],
        ['Ctrl+F', 'Find'],
        ['Ctrl+H', 'Find and replace'],
        ['Ctrl+S', 'Save'],
      ],
    },
    {
      title: 'View',
      items: [
        ['Ctrl+=', 'Zoom in'],
        ['Ctrl+-', 'Zoom out'],
        ['Ctrl+0', 'Actual size'],
        ['Ctrl+Shift+H', 'Fit the page'],
        ['Ctrl+/', 'Keyboard shortcuts'],
      ],
    },
  ];

  // ---- drawing it all -------------------------------------------------------------------------------------------------
  const srcOf = useCallback((s: string) => assetUrl(s), []);
  const zoomPct = Math.round(view.k * 100);
  const toolbar = (
    <div inert={!!liveD} className={cx('flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-1.5 py-1', liveD && 'opacity-45')}>
      <IconButton label="Shapes panel" active={showShapes} onClick={() => setShowShapes(!showShapes)}>
        <PanelLeft size={16} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton label="Undo" disabled={!can || !h.past.length} onClick={undo}>
        <Undo2 size={16} />
      </IconButton>
      <IconButton label="Redo" disabled={!can || !h.future.length} onClick={redo}>
        <Redo2 size={16} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton label="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.2)}>
        <Minus size={16} />
      </IconButton>
      <button type="button" title="Actual size" onClick={() => setView((v) => ({ ...v, k: 1 }))} className="h-8 w-12 shrink-0 rounded-lg text-[12px] text-fg-2 tabular-nums hover:bg-bg-2">
        {zoomPct}%
      </button>
      <IconButton label="Zoom in" onClick={() => canvas.current?.zoomBy(1.2)}>
        <Plus size={16} />
      </IconButton>
      <IconButton label="Fit the page" onClick={() => canvas.current?.fit()}>
        <Maximize size={15} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton label="Text" disabled={!can} onClick={() => void insert({ entry: QUICK[10].entry })}>
        <Type size={16} />
      </IconButton>
      <IconButton label="Sticky note" disabled={!can} onClick={() => void insert({ entry: QUICK[9].entry })}>
        <StickyNote size={16} />
      </IconButton>
      <IconButton label="Icon" disabled={!can} onClick={() => setIconFor({})}>
        <Shapes size={16} />
      </IconButton>
      <IconButton label="Picture" disabled={!can} onClick={() => void insert({ entry: { id: 'pic', label: 'Picture', shape: 'image' } })}>
        <ImageIcon size={16} />
      </IconButton>
      <IconButton label="Delete" disabled={!can || !sel.length} onClick={del}>
        <Trash2 size={16} />
      </IconButton>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" />
      <IconButton label="Grid" active={showGrid} onClick={() => setShowGrid(!showGrid)}>
        <Grid3x3 size={16} />
      </IconButton>
      <IconButton label="Layout" disabled={!can || !page.items.length} onClick={() => act.layout('down')}>
        <Workflow size={16} />
      </IconButton>
      <IconButton label="Find" onClick={() => find.show(false)}>
        <Search size={16} />
      </IconButton>
      <IconButton label="Download as a picture" onClick={() => setDialog('export')}>
        <Download size={16} />
      </IconButton>
      {onAsk && (
        <IconButton label="Ask the agent about it" disabled={readOnly} onClick={askAbout}>
          <Sparkles size={16} className="text-accent" />
        </IconButton>
      )}
      <span className="flex-1" />
      <IconButton label="Format panel" active={showFormat} onClick={() => setShowFormat(!showFormat)}>
        <PanelRight size={16} />
      </IconButton>
    </div>
  );

  const shapesPanel = showShapes && !liveD && (
    <div className={cx('flex min-h-0 w-[212px] shrink-0 flex-col border-r border-line bg-panel', narrow && 'absolute inset-y-0 left-0 z-20 shadow-xl')}>
      <ShapePanel dark={dark} onPick={(pk) => !dragged.current && void insert(pk)} onDrag={startDrag} className="h-full" />
    </div>
  );
  const formatPanel = showFormat && (
    <div className={cx('min-h-0 w-[264px] shrink-0 overflow-y-auto border-l border-line bg-panel', narrow && 'absolute inset-y-0 right-0 z-20 shadow-xl')}>
      <FormatPanel d={shownD} page={page} sel={sel} readOnly={readOnly} change={change} changeDiagram={changeDiagram} snap={snap} onSnap={setSnap} showGrid={showGrid} onShowGrid={setShowGrid} act={act} />
    </div>
  );

  const tabs = (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto border-t border-line bg-panel px-1.5">
      {shownD.pages.map((p, i) =>
        renaming === i ? (
          <input
            key={p.id}
            autoFocus
            defaultValue={p.name}
            translate="no"
            maxLength={80}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== p.name) changeDiagram((x) => ({ ...x, pages: x.pages.map((q, j) => (j === i ? { ...q, name: v } : q)) }));
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
            className="h-7 w-32 shrink-0 rounded-md border border-accent/60 bg-bg px-2 text-[12.5px] outline-none"
          />
        ) : (
          <button
            key={p.id}
            type="button"
            translate="no"
            onClick={() => goPage(i)}
            onDoubleClick={() => can && setRenaming(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              tabRef.current = e.currentTarget;
              setTabMenu({ i, el: e.currentTarget });
            }}
            className={cx('h-7 max-w-[180px] shrink-0 truncate rounded-md px-2.5 text-[12.5px] transition-colors', i === pageIx ? 'bg-bg font-medium text-fg shadow-[0_0_0_1px_var(--color-line)]' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
          >
            {p.name}
          </button>
        ),
      )}
      {can && (
        <IconButton label="Add a page" size="sm" onClick={addNewPage}>
          <Plus size={14} />
        </IconButton>
      )}
      <span className="flex-1" />
      <span className="shrink-0 pr-1 text-[11.5px] text-fg-3">
        {sel.length ? tr(sel.length === 1 ? '1 picked' : `${sel.length} picked`) : tr(`${page.items.filter(isShape).length} shapes`)}
      </span>
    </div>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg" data-i18n="diagram">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 shrink items-center gap-1.5">{lead}</div>
          <MenuBar menus={menus} compact={narrow ? true : 'auto'} />
        </div>
        {tail}
      </div>
      {band}
      {liveD && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-1.5 text-[12.5px] text-fg-2">
          <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />
          An agent is drawing a new version. It shows here as it comes.
        </div>
      )}
      {toolbar}
      <div className="relative flex min-h-0 flex-1">
        {shapesPanel}
        <div className="relative min-w-0 flex-1">
          <DiagramCanvas
            ref={canvas}
            diagram={shownD}
            page={page}
            sel={liveD ? [] : sel}
            onSel={setSel}
            readOnly={readOnly}
            dark={dark}
            view={view}
            onView={setView}
            onChange={(p) => change(() => p)}
            onMenu={(at, hit) => setCtx({ ...at, hit })}
            onQuickAdd={(at, p) => !readOnly && setQuick({ x: at.x, y: at.y, at: p })}
            mark={mark?.item}
            src={srcOf}
            snap={snap}
            showGrid={showGrid}
            found={find.open ? new Set(matches) : undefined}
            touch={layout === 'sheet'}
          />
          {!page.items.length && !liveD && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-2xl border border-dashed border-line-2 bg-panel/90 px-5 py-4 text-center text-[13px] leading-relaxed text-fg-2">
                <MousePointer2 size={18} className="mx-auto mb-1.5 text-fg-3" />
                Drag shapes in from the left, or double-click to add one. Point at a shape and drag one of its blue arrows to connect it.
                {onAsk && ' Or ask an agent to draw it for you.'}
              </div>
            </div>
          )}
          {find.open && (
            <div className="absolute top-2 right-3 z-30 max-sm:right-2 max-sm:left-2">
              <FindBar find={find} count={matches.length} index={matches.length ? findAt : -1} onNext={() => goMatch(findAt + 1)} onPrev={() => goMatch(findAt - 1)} onReplace={can ? () => replaceIn(false) : undefined} onReplaceAll={can ? () => replaceIn(true) : undefined} />
            </div>
          )}
        </div>
        {formatPanel}
      </div>
      {tabs}
      {dirty && !readOnlyProp && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void discard()} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      {ghost && (
        <div className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-1/2 rounded-md border border-accent/60 bg-accent-soft px-2 py-1 text-[12px] font-medium text-fg shadow-lg" style={{ left: ghost.x, top: ghost.y }}>
          {ghost.label}
        </div>
      )}
      {/* The right-click menu. */}
      <div ref={ctxRef} className="pointer-events-none fixed h-px w-px" style={{ left: ctx?.x ?? -10, top: ctx?.y ?? -10 }} />
      <Popover anchor={ctxRef} open={!!ctx} onClose={() => setCtx(null)} width={230}>
        {ctx && (
          <div onMouseDown={(e) => e.preventDefault()}>
            {ctx.hit ? (
              <>
                {can && (
                  <MenuItem hint="Enter" onClick={() => (setCtx(null), canvas.current?.edit(ctx.hit!.id, isShape(ctx.hit!) && ROW_KINDS.has(ctx.hit!.shape) ? 'rows' : 'text'))}>
                    Edit the words
                  </MenuItem>
                )}
                {can && <MenuItem hint="Ctrl+X" onClick={() => (setCtx(null), void copy(true))}>Cut</MenuItem>}
                <MenuItem icon={<Copy size={14} />} hint="Ctrl+C" onClick={() => (setCtx(null), void copy(false))}>
                  Copy
                </MenuItem>
                {can && <MenuItem hint="Ctrl+D" onClick={() => (setCtx(null), duplicate())}>Duplicate</MenuItem>}
                {can && <MenuSep />}
                {can && <MenuItem onClick={() => (setCtx(null), order('front'))}>Bring to front</MenuItem>}
                {can && <MenuItem onClick={() => (setCtx(null), order('back'))}>Send to back</MenuItem>}
                {can && sel.length > 1 && <MenuItem onClick={() => (setCtx(null), act.group())}>Group</MenuItem>}
                {can && picked.some((x) => x.group) && <MenuItem onClick={() => (setCtx(null), act.ungroup())}>Ungroup</MenuItem>}
                {can && isShape(ctx.hit) && (
                  <MenuItem
                    onClick={() => {
                      setCtx(null);
                      const r = addBeside(page, ctx.hit as DiagramShape, 'e');
                      change(() => r.page);
                      setSel([r.id]);
                    }}
                  >
                    Add a shape joined to it
                  </MenuItem>
                )}
                {onAsk && !readOnly && (
                  <>
                    <MenuSep />
                    <MenuItem icon={<Sparkles size={14} className="text-accent" />} onClick={() => (setCtx(null), askAbout())}>
                      Ask the agent about it
                    </MenuItem>
                  </>
                )}
                {can && (
                  <>
                    <MenuSep />
                    <MenuItem icon={<Trash2 size={14} />} danger hint="Delete" onClick={() => (setCtx(null), del())}>
                      Delete
                    </MenuItem>
                  </>
                )}
              </>
            ) : (
              <>
                {can && (
                  <MenuItem hint="Ctrl+V" onClick={() => (setCtx(null), void paste(undefined, canvas.current?.toPage(ctx.x, ctx.y)))}>
                    Paste
                  </MenuItem>
                )}
                {can && (
                  <MenuItem
                    icon={<Plus size={14} />}
                    onClick={() => {
                      const r = canvas.current?.el()?.getBoundingClientRect();
                      setCtx(null);
                      if (r) setQuick({ x: ctx.x - r.left, y: ctx.y - r.top, at: canvas.current!.toPage(ctx.x, ctx.y) });
                    }}
                  >
                    Add a shape here
                  </MenuItem>
                )}
                <MenuItem hint="Ctrl+A" onClick={() => (setCtx(null), selectAll())}>
                  Select all
                </MenuItem>
                <MenuItem icon={<Maximize size={14} />} onClick={() => (setCtx(null), canvas.current?.fit())}>
                  Fit the page
                </MenuItem>
                {can && page.items.length > 0 && (
                  <MenuItem icon={<LayoutTemplate size={14} />} onClick={() => (setCtx(null), act.layout('down'))}>
                    Lay it out
                  </MenuItem>
                )}
              </>
            )}
          </div>
        )}
      </Popover>
      {/* A double click on empty space: a shape to add there. */}
      <div ref={quickRef} className="pointer-events-none fixed h-px w-px" style={{ left: quick ? (canvas.current?.el()?.getBoundingClientRect().left ?? 0) + quick.x : -10, top: quick ? (canvas.current?.el()?.getBoundingClientRect().top ?? 0) + quick.y : -10 }} />
      <Popover anchor={quickRef} open={!!quick} onClose={() => setQuick(null)} width={236} title="Add a shape">
        {quick && (
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {QUICK.map((q) => (
              <button
                key={q.entry.id}
                type="button"
                onClick={() => {
                  const at = quick.at;
                  setQuick(null);
                  void insert({ entry: q.entry }, at);
                }}
                className="rounded-md px-1 py-1.5 text-[11.5px] text-fg-2 hover:bg-bg-2 hover:text-fg"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
      </Popover>
      {/* A page tab's menu. */}
      <Popover anchor={tabRef} open={!!tabMenu} onClose={() => setTabMenu(null)} width={200}>
        {tabMenu && (
          <div>
            <MenuItem disabled={!can} onClick={() => (setTabMenu(null), setRenaming(tabMenu.i))}>
              Rename
            </MenuItem>
            <MenuItem disabled={!can} onClick={() => (setTabMenu(null), dupPage(tabMenu.i))}>
              Duplicate
            </MenuItem>
            <MenuItem disabled={!can || tabMenu.i === 0} onClick={() => (setTabMenu(null), movePage(tabMenu.i, tabMenu.i - 1))}>
              Move left
            </MenuItem>
            <MenuItem disabled={!can || tabMenu.i === shownD.pages.length - 1} onClick={() => (setTabMenu(null), movePage(tabMenu.i, tabMenu.i + 1))}>
              Move right
            </MenuItem>
            <MenuSep />
            <MenuItem danger disabled={!can || shownD.pages.length < 2} onClick={() => (setTabMenu(null), void delPage(tabMenu.i))}>
              Delete
            </MenuItem>
          </div>
        )}
      </Popover>
      <IconPicker
        open={!!iconFor}
        onClose={() => setIconFor(null)}
        title={iconFor?.id ? 'Change the icon' : 'Insert an icon'}
        onIcon={(ic) => {
          const target = iconFor;
          setIconFor(null);
          if (target?.id) change((p) => updateItems(p, new Set([target.id!]), (it) => (isShape(it) ? { ...it, shape: 'icon', icon: { name: ic.name, paths: ic.paths } } : it)));
          else void insert({ entry: { id: `icon.${ic.name}`, label: ic.name, shape: 'icon', icon: ic.name }, icon: ic.paths });
        }}
      />
      <Dialog
        open={dialog === 'mermaid'}
        onClose={() => setDialog(null)}
        title="Insert from Mermaid"
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!mermaidText.trim()} onClick={() => void fromMermaid(mermaidText).then((ok) => ok && (setDialog(null), setMermaidText('')))}>
              Insert
            </Button>
          </>
        }
      >
        <p className="mb-2 text-[13px] leading-relaxed text-fg-2">Paste a Mermaid flowchart, mind map, class, ER, state or sequence diagram. It becomes shapes and connectors you can change.</p>
        <textarea
          value={mermaidText}
          onChange={(e) => setMermaidText(e.target.value)}
          rows={12}
          spellCheck={false}
          translate="no"
          placeholder={'flowchart TD\n  A[Start] --> B{Is it ready?}\n  B -- Yes --> C[Ship it]\n  B -- No --> D[Fix it] --> B'}
          className="w-full resize-y rounded-xl border border-line bg-bg-1 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-accent/60"
        />
      </Dialog>
      <Dialog
        open={dialog === 'export'}
        onClose={() => setDialog(null)}
        title="Download as a picture"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Download size={14} />} onClick={() => void exportNow()}>
              Download
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <div className="flex gap-1.5">
            {(['png', 'svg'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setExp({ ...exp, format: f })} className={cx('h-8 flex-1 rounded-lg border text-[12.5px]', exp.format === f ? 'border-accent/60 bg-accent-soft font-medium' : 'border-line hover:bg-bg-2')}>
                {f === 'png' ? 'PNG' : 'SVG'}
              </button>
            ))}
          </div>
          {exp.format === 'png' && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-fg-3">Scale</span>
              {[1, 2, 3, 4].map((s) => (
                <button key={s} type="button" onClick={() => setExp({ ...exp, scale: s })} className={cx('h-7 w-10 rounded-md border text-[12.5px]', exp.scale === s ? 'border-accent/60 bg-accent-soft font-medium' : 'border-line hover:bg-bg-2')}>
                  {s}×
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-2 text-fg-2">
            <input type="checkbox" checked={exp.transparent} onChange={(e) => setExp({ ...exp, transparent: e.target.checked })} className="accent-[var(--accent)]" />
            See-through background
          </label>
          <label className="flex items-center gap-2 text-fg-2">
            <input type="checkbox" checked={exp.dark} onChange={(e) => setExp({ ...exp, dark: e.target.checked })} className="accent-[var(--accent)]" />
            Dark
          </label>
          <label className={cx('flex items-center gap-2 text-fg-2', !sel.length && 'opacity-50')}>
            <input type="checkbox" disabled={!sel.length} checked={exp.only && !!sel.length} onChange={(e) => setExp({ ...exp, only: e.target.checked })} className="accent-[var(--accent)]" />
            Only what is picked
          </label>
          <p className="flex items-center gap-1.5 text-[12px] text-fg-3">
            <Eye size={13} /> The page “<span translate="no">{page.name}</span>”. Export in the top bar makes a PDF or a draw.io file of the whole diagram.
          </p>
        </div>
      </Dialog>
      <ShortcutsDialog open={dialog === 'keys'} onClose={() => setDialog(null)} groups={shortcuts} />
      {confirmNode}
    </div>
  );
}

void X;
void Keyboard;
void KINDS;
void withEdge;

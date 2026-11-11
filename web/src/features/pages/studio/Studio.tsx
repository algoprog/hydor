// A page to use, change and save: the same in the panel beside a conversation, full screen on a phone, and
// at a page's own place in Pages. Three ways to look at it: the page itself (it runs), Edit (pick a part
// and change it: words, look, place; scripts held back meanwhile) and Code (its HTML, with the page beside
// it as you type). While an agent writes it, it shows as far as it came, growing. Changes stay unsaved
// until Save; Discard drops them. It shows pages as wide as there is room for; a tablet's or a phone's
// width is a choice for a while, not kept.
//
// Edit has an inspector with three tabs: Part (the part picked), Layers (the page's parts as a tree) and
// Page (the whole page's look). Beside the page when there is room, else a drawer under it that folds. Words
// are written in the page itself as in Notion (server/pages/writing.ts); what it asks for while you write (an
// emoji, a picture, a video, maths, an icon, a cover) is chosen in the app, beside where it was asked, and it is told
// the Library's pages, for links to them ("@").
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Code2, Eye, Keyboard, Monitor, PenLine, Plus, Redo2, Search, Smartphone, Tablet, Undo2, ZoomIn } from 'lucide-react';
import type { PageComment, PageCommentOp } from '@shared/page-comments';
import type { PagesEvent } from '@shared/pages';
import { api, enc, post } from '../../../lib/api';
import { useFeatureEvent } from '../../../lib/featureEvents';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, IconButton, MenuItem, Popover, Segmented, Throbber, useConfirm, useMediaQuery } from '../../../components/ui';
import type { EditorHandle } from '../../../lib/codemirror';
import { DeviceStage, EditFrame, PageFrame, StreamFrame, stepZoom, WIDTH_RANGE, withBase, ZOOMS, type AppBridge, type Device, type DroppedKind, type EdAsk, type EdLayer, type EdPage, type EdSel, type EditHandle, type EdState, type Pick, type Store, type Zoom } from '../frame';
import { FindBar, useFind } from '../common/FindBar';
import { ShortcutsDialog } from '../common/Shortcuts';
import { usePagesStore } from '../state';
import { openTypes } from '../types';
import type { MadeRequest } from '../types/requests';
import { AddPanel, blockPlace } from './AddPanel';
import { editorLabels } from './blocks';
import { InsertPopover, PAGE_SHORTCUTS } from './Inserts';
import { PartPanel, pictureData, type Ctx, type Media } from './Inspector';
import { LayersPanel } from './Layers';
import { PageComments, type PageCommentAi } from './PageComments';
import { blockWhere, commentsRequest } from '@shared/comment-asks';
import type { CommentAi } from '../common/commentAi';
import { PagePanel } from './PagePanel';
import { uploadVideo } from '../slides/media';
import { keepPageFile, usePageAi } from './pageAi';
import { BlockAskPopover } from './BlockAsks';
import { importInto, useCrumbs } from './pageTools';
import { isDesignHtml } from '@shared/design';
import { DesignEdit } from '../design/DesignEdit';
import { editPagePicture, editPageVideo } from '../design/pageMedia';

export type StudioMode = 'view' | 'edit' | 'code';

export interface StudioDoc {
  /** Changes when it is another page (or another version of it). */
  key: string;
  title: string;
  html: string;
  /** An HTML file's folder, for its relative addresses. */
  base?: string;
  /** A saved page's storage; a shown page keeps what it stores while on screen. */
  store: Store;
  /** A template's screen: window.hydor.app for it, in Use (the editor holds its scripts back). */
  app?: AppBridge;
}

const isDark = () => document.documentElement.classList.contains('dark');
const DEVICES: { value: Device; label: string; icon: ReactNode }[] = [
  { value: 'desktop', label: 'Computer', icon: <Monitor size={14} /> },
  { value: 'tablet', label: 'Tablet', icon: <Tablet size={14} /> },
  { value: 'phone', label: 'Phone', icon: <Smartphone size={14} /> },
];
const MEDIA_OF: Record<Device, Media> = { desktop: '', tablet: 'tablet', phone: 'phone' };
type Tab = 'part' | 'layers' | 'page' | 'comments';
const TABS: { value: Tab; label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'layers', label: 'Layers' },
  { value: 'page', label: 'Page' },
];

/** A part copied in the editor, to paste here or in another page while the app is open. */
let clipboard: { html: string; name: string } | null = null;

/** How wide an element is, as it changes. */
function useWidthOf<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** The HTML, with the editor's colours and keys: it saves on Ctrl+S. */
function CodePane({ html, onChange, onSave, className }: { html: string; onChange: (v: string) => void; onSave: () => void; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef({ onChange, onSave });
  cb.current = { onChange, onSave };
  useEffect(() => {
    let alive = true;
    let handle: EditorHandle | null = null;
    import('../../../lib/codemirror').then(async ({ createEditor }) => {
      if (!alive || !host.current) return;
      handle = await createEditor(host.current, {
        doc: html,
        path: 'page.html',
        dark: isDark(),
        wrap: true,
        phone: matchMedia('(pointer: coarse)').matches,
        onChange: (d) => cb.current.onChange(d),
        onSave: () => cb.current.onSave(),
      });
      if (!alive) handle.destroy();
    });
    const mo = new MutationObserver(() => handle?.setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      alive = false;
      mo.disconnect();
      handle?.destroy();
    };
    // The editor keeps its own text from here on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={host} className={cx('min-h-0 overflow-hidden [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono [&_.cm-scroller]:text-[12.5px]', className)} />;
}

/** The HTML coming in, as the agent writes it, kept at its end. */
function StreamCode({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        follow.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
      }}
      translate="no"
      className="h-full overflow-auto bg-bg px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2"
    >
      {text}
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
    </pre>
  );
}

/** A width of its own for the page's view, in pixels (empty: the device's); kept in range. */
function WidthField({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [v, setV] = useState(value ? String(value) : '');
  useEffect(() => setV(value ? String(value) : ''), [value]);
  const commit = () => {
    const n = parseInt(v, 10);
    if (!v.trim()) onChange(null);
    else if (Number.isFinite(n)) onChange(Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, n)));
    else setV(value ? String(value) : '');
  };
  return (
    <input
      aria-label="Width in pixels"
      title={`The page's width in pixels, ${WIDTH_RANGE.min} to ${WIDTH_RANGE.max} (empty: the device's)`}
      inputMode="numeric"
      value={v}
      placeholder="Width"
      onChange={(e) => setV(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-7 w-[62px] min-w-0 rounded-lg border border-line bg-bg-1 px-2 text-center text-[12px] text-fg tabular-nums outline-none placeholder:text-fg-3 focus:border-accent/60"
    />
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

export function Studio({
  doc,
  draft,
  layout,
  readOnly,
  onSave,
  onPick,
  lead,
  tail,
  band,
  saveLabel = 'Save',
  savedNote,
  onDirty,
  initialMode,
  onAsk,
  onRequest,
  saveNowRef,
  pageId,
  commentAi,
}: {
  doc: StudioDoc | null;
  /** An agent is writing it: what came so far. */
  draft?: { text: string; done: boolean } | null;
  layout: 'panel' | 'page' | 'sheet';
  readOnly?: boolean;
  /** Saves the HTML; false when it did not. */
  onSave?: (html: string) => Promise<boolean>;
  onPick?: (p: Pick) => void;
  /** The bar's start (a title, a way back) and end (the container's own buttons). */
  lead?: ReactNode;
  tail?: ReactNode;
  /** Under the bar: an older version on view, say. */
  band?: ReactNode;
  saveLabel?: string;
  /** Under the save bar: who hears of the change. */
  savedNote?: string;
  /** Told whether there are changes not saved. */
  onDirty?: (dirty: boolean) => void;
  /** How it opens: Edit for a blank page just made, say. */
  initialMode?: StudioMode;
  /** Puts a note on the part picked in the message box: the editor's "Ask the agent". */
  onAsk?: (text: string) => void;
  /** A request about the page made in the gallery (a block made with AI): Add offers it when this is given. */
  onRequest?: (r: MadeRequest) => void;
  /** Saves now, if there are changes (before an agent is asked about the page): false when it did not. */
  saveNowRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  /** A page of the Library: comments on its blocks (kept by the app, outside the page) show in Edit's Comments tab. */
  pageId?: string;
  /** Resolve with AI on its comments (common/commentAi.tsx); left out, they offer none. */
  commentAi?: CommentAi;
}) {
  const [mode, setMode] = useState<StudioMode>(initialMode ?? 'view');
  const [device, setDevice] = useState<Device>('desktop');
  // The view of the page: its zoom (Fit, or 50 to 200 %), and a width of its own (kept for a while, like the device, not saved).
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [custom, setCustom] = useState<number | null>(null);
  const [zoomMenu, setZoomMenu] = useState(false);
  // Find and replace in the page's words (Ctrl+F, Ctrl+H): the bar asks, the page marks and counts.
  const find = useFind();
  const findRef = useRef(find);
  findRef.current = find;
  const [found, setFound] = useState({ count: 0, index: -1 });
  const zoomRef = useRef<HTMLButtonElement>(null);
  // Changed HTML not saved yet (from Code, or the editor's when it was left); null: the page as it is.
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeView, setCodeView] = useState(0);
  const [ed, setEd] = useState<EdState>({ dirty: false, canUndo: false, canRedo: false });
  const [sel, setSel] = useState<EdSel | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>('part');
  const [ctx, setCtx] = useState<Ctx>({ scope: 'self', state: '' });
  const [layers, setLayers] = useState<EdLayer | null>(null);
  const [page, setPage] = useState<EdPage | null>(null);
  const [clip, setClip] = useState(clipboard);
  const [wordsOn, setWordsOn] = useState(false);
  const [menuOn, setMenuOn] = useState(false);
  // The drawer under the page (where there is no room beside it): folded at first, open once a part is picked, until folded again.
  const [drawer, setDrawer] = useState<'open' | 'closed' | null>(null);
  const [shell, shellWidth] = useWidthOf<HTMLDivElement>();
  const beside = shellWidth >= 760;
  const [epoch, setEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  // What the editor in the page asked for (an emoji, a picture…), and the keyboard shortcuts.
  const [asking, setAsking] = useState<EdAsk | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [streamCode, setStreamCode] = useState(false);
  const editRef = useRef<EditHandle>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const deviceRef = useRef<HTMLButtonElement>(null);
  const [deviceMenu, setDeviceMenu] = useState(false);
  // Room for the three screen sizes as buttons; else one button with a menu.
  const roomy = useMediaQuery('(min-width: 1180px)');
  const labels = useMemo(() => editorLabels(), []);
  // The Library's pages, for links to them ("@" in the page): the editor gets them as it starts and as they change.
  const library = usePagesStore((s) => s.pages);
  useEffect(() => {
    if (!usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(() => {});
  }, []);
  const pageRefs = useMemo(() => (library ?? []).filter((p) => !p.app).map((p) => ({ id: p.id, title: p.title, kind: p.kind ?? 'page', icon: p.icon ?? '' })), [library]);
  const pageRefsRef = useRef(pageRefs);
  pageRefsRef.current = pageRefs;
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('pages', pageRefs);
  }, [pageRefs, mode]);

  // Comments on the page's blocks (a page of the Library's): kept by the app outside the page, shown in Edit, beside it.
  const [comments, setComments] = useState<PageComment[]>([]);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState<{ on: PageComment['on']; quote: string } | null>(null);
  const loadComments = useCallback(() => (pageId ? api<{ comments: PageComment[] }>(`/api/pages/${enc(pageId)}/comments`).then((r) => setComments(r.comments)) : Promise.resolve()), [pageId]);
  useEffect(() => {
    setComments([]);
    loadComments().catch(() => {});
  }, [loadComments]);
  // An agent answered (save_page), or another window changed them.
  useFeatureEvent('pages', (e) => {
    const d = e.data as PagesEvent | null;
    if (pageId && d?.what === 'comments' && d.id === pageId) loadComments().catch(() => {});
  });
  const commentOps = async (ops: PageCommentOp[]) => {
    if (!pageId) return null;
    const r = await post<{ comments: PageComment[]; added: string[] }>(`/api/pages/${enc(pageId)}/comments`, { ops });
    setComments(r.comments);
    return r;
  };
  // The editor marks the blocks they are on, and outlines the one picked here.
  // Resolve with AI (common/commentAi.tsx): each comment by the words it is on, or its block's.
  const askAi = (list: PageComment[]) => {
    if (!commentAi || !list.length) return;
    const where = (c: PageComment) => (c.quote?.trim() || !c.on?.words ? undefined : blockWhere(c.on.words));
    commentAi.ask(
      commentsRequest(
        list.map((c) => ({ c, where: where(c) })),
        'page',
      ),
      list.map((c) => c.id),
    );
  };
  /** The new comment written, on the block (and words) picked; `ai`: and sent to an agent at once, once it is kept. */
  const addComment = (text: string, ai = false) => {
    const d = commentDraft;
    setCommentDraft(null);
    commentOps([{ text, on: d?.on, quote: d?.quote }])
      .then((r) => {
        const id = r?.added[0];
        if (!id) return;
        setActiveComment(id);
        const c = r.comments.find((x) => x.id === id);
        if (ai && c) askAi([c]);
      })
      .catch(toastError);
  };
  const pageAi: PageCommentAi | undefined =
    commentAi && !readOnly && pageId
      ? {
          busy: commentAi.busy,
          one: (id) => askAi(comments.filter((c) => c.id === id)),
          all: () => askAi(comments.filter((c) => !c.resolved && !commentAi.busy.has(c.id))),
          draft: (text) => addComment(text, true),
        }
      : undefined;
  const commentMarks = useMemo(() => comments.map((c) => ({ id: c.id, on: c.on, resolved: !!c.resolved, n: 1 + (c.replies?.length ?? 0) })), [comments]);
  const marksRef = useRef(commentMarks);
  marksRef.current = commentMarks;
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('comments', commentMarks);
  }, [commentMarks, mode]);
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('commentShow', activeComment);
  }, [activeComment, mode]);
  const openComments = commentMarks.filter((c) => !c.resolved).length;
  const [confirm, confirmNode] = useConfirm();
  const writing = !!draft && !draft.done;
  const html = pending ?? doc?.html ?? '';
  // A design (fixed-size artboards: shared/design.ts) is edited as in Canva, by the design editor.
  const design = useMemo(() => isDesignHtml(html), [html]);
  const dirty = (pending !== null && pending !== doc?.html) || (mode === 'edit' && ed.dirty) || (mode === 'code' && code !== (pending ?? doc?.html ?? ''));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]);
  // Closing the browser's tab or reloading it with changes not saved: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);

  // Another page (or the agent saved a new version while nothing was changed): start from it.
  const docKey = doc?.key;
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (savedRef.current !== null && savedRef.current === doc.html) {
      savedRef.current = null;
      return;
    }
    if (dirtyRef.current) return;
    setPending(null);
    setEpoch((e) => e + 1);
    if (mode === 'code') {
      setCode(doc.html);
      setCodeView((v) => v + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);
  const media = MEDIA_OF[device];
  const zoomBy = (op: 'in' | 'out' | 'fit') => setZoom((z) => stepZoom(z, op));
  // Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel over the page zoom its view, not the whole app (the page's frame says so, through onZoom).
  useEffect(() => {
    const el = shell.current;
    if (!el || mode === 'code' || design) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !el.offsetParent) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input,textarea,select,[contenteditable="true"],.cm-editor')) return;
      if (mode === 'edit' && !e.shiftKey && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) {
        e.preventDefault();
        findRef.current.show(e.key.toLowerCase() === 'h');
        return;
      }
      const op = e.key === '0' ? 'fit' : e.key === '-' || e.key === '_' ? 'out' : e.key === '=' || e.key === '+' ? 'in' : null;
      if (!op) return;
      e.preventDefault();
      zoomBy(op);
    };
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 'in' : 'out');
    };
    window.addEventListener('keydown', onKey);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      el.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, design]);
  // Where the inspector's changes go; another part picked starts at the part itself again.
  const selKey = sel ? sel.path.join('.') : '';
  useEffect(() => setCtx({ scope: 'self', state: '' }), [selKey]);
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('ctx', { ...ctx, media });
  }, [ctx, media, mode]);
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('layers', tab === 'layers');
  }, [tab, mode]);
  useEffect(() => {
    if (sel && drawer === null) setDrawer('open');
  }, [!!sel]);

  // The page's words are searched as the bar's words change; the marks go when it closes or Edit is left.
  useEffect(() => {
    if (mode !== 'edit') return;
    if (find.open) editRef.current?.cmd('find', { query: find.query, opts: find.options });
    else {
      editRef.current?.cmd('findClear');
      setFound({ count: 0, index: -1 });
    }
  }, [find.open, find.query, find.options, mode]);
  useEffect(() => {
    if (mode !== 'edit' && find.open) find.close();
  }, [mode]);

  /** What is being changed now, as HTML. */
  const current = async (): Promise<string> => {
    if (mode === 'edit' && editRef.current) return editRef.current.html();
    if (mode === 'code') return code;
    return html;
  };

  const switchTo = async (m: StudioMode) => {
    if (m === mode || !doc) return;
    try {
      // Nothing changed in the editor: the page as written (the editor gives back the same page, but laid out its own way).
      const h = mode === 'edit' && !ed.dirty ? html : await current();
      if (h !== doc.html) setPending(h);
      if (m === 'code') {
        setCode(h);
        setCodeView((v) => v + 1);
      }
      setSel(null);
      setPage(null);
      setLayers(null);
      setMenuOn(false);
      setMode(m);
    } catch (e) {
      toastError(e);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!doc || !onSave || saving) return false;
    setSaving(true);
    try {
      const h = await current();
      savedRef.current = h;
      if (await onSave(h)) {
        setPending(null);
        if (mode === 'code') setCode(h);
        editRef.current?.saved();
        // The comments keep the places of their blocks in the page as saved (found again by them next time).
        if (mode === 'edit' && marksRef.current.length && editRef.current)
          editRef.current
            .anchors()
            .then((list) => (list.length ? commentOps(list.map(({ id, on }) => ({ id, on }))) : null))
            .catch(() => {});
        setEd((s) => ({ ...s, dirty: false }));
        return true;
      }
      savedRef.current = null;
    } catch (e) {
      savedRef.current = null;
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
    if (!(await confirm({ title: 'Discard your changes?', body: 'The page goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    setPending(null);
    setCode(doc?.html ?? '');
    setCodeView((v) => v + 1);
    setEd({ dirty: false, canUndo: false, canRedo: false });
    setSel(null);
    setPage(null);
    setLayers(null);
    setMenuOn(false);
    setEpoch((e) => e + 1);
  };

  // Typing in Code shows in the page a moment later.
  const [shown, setShown] = useState<{ html: string; n: number } | null>(null);
  useEffect(() => {
    if (mode !== 'code') return setShown(null);
    const t = window.setTimeout(() => setShown((s) => (s?.html === code ? s : { html: code, n: (s?.n ?? 0) + 1 })), 600);
    return () => window.clearTimeout(t);
  }, [code, mode]);

  const cmd = (c: string, arg?: unknown) => editRef.current?.cmd(c, arg);
  /**
   * The menu's Paste: what the system clipboard holds (HTML and words), read here because the page's frame may not, and handed back
   * to be pasted where the caret or the part picked is. Where the browser will not let it be read, the part copied in this page goes in
   * and the keys are suggested.
   */
  const readClipboard = async (plain: boolean) => {
    let html = '';
    let text = '';
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
        if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
      }
    } catch {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast('Your browser would not let the page read the clipboard: press Ctrl+V to paste', 'info');
      }
    }
    cmd('pasteData', { html, text, plain });
  };
  /**
   * A file dropped on the page, made into its block: a picture is made small enough to live in the page; a video is kept by the app
   * (it can take a while: a note says so); a PDF, a sound or any other file is kept for pages (up to 50 MB). Each goes where it was dropped.
   */
  const keepDropped = async (id: string, f: File, what: DroppedKind) => {
    try {
      if (what === 'picture') return cmd('fill', { id, src: await pictureData(f) });
      if (what === 'video') {
        toast(`Adding ${f.name}…`, 'info');
        const kept = await uploadVideo(f, () => {});
        const r = await post<{ url: string }>('/api/pages/video-address', { src: kept });
        return cmd('fill', { id, file: r.url });
      }
      cmd('fill', { id, ...(await keepPageFile(f)) });
    } catch (e) {
      toastError(e);
    }
  };
  // The AI on the page, and a database's AI column and files (pageAi.ts).
  const ai = usePageAi(cmd, pageId);
  // Where the page is in the Library, for its breadcrumbs (pageTools.ts).
  const crumbs = useCrumbs(pageId, doc?.title ?? '');
  const crumbsRef = useRef(crumbs);
  crumbsRef.current = crumbs;
  useEffect(() => {
    if (mode === 'edit') editRef.current?.cmd('crumbs', crumbs);
  }, [crumbs, mode]);
  const side = layout === 'page';

  /** The agent is told which part is meant, in the message box; changes not saved yet are saved first, so it sees them. */
  const ask = async () => {
    if (!onAsk || !sel || !doc) return;
    if (dirty && !(await save())) return;
    const words = sel.snippet ? ` “${sel.snippet}”` : '';
    onAsk(`On the page “${doc.title}”, the ${sel.name.toLowerCase()}${words} (\`${sel.selector}\`): `);
    toast('In your message box: say what to change', 'ok');
  };

  let body: ReactNode;
  if (writing || (!doc && draft)) {
    body = streamCode ? (
      <StreamCode text={draft!.text} />
    ) : (
      <DeviceStage device={device} zoom={zoom} width={custom}>
        <StreamFrame html={draft!.text} base={doc?.base} />
      </DeviceStage>
    );
  } else if (!doc) {
    body = (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={28} />
      </div>
    );
  } else if (mode === 'edit' && design) {
    body = (
      <DesignEdit
        key={epoch}
        editRef={editRef}
        html={html}
        base={doc.base}
        title={doc.title}
        store={doc.store}
        onState={setEd}
        onSave={() => void saveRef.current()}
        onAsk={
          onAsk
            ? (text) =>
                void (async () => {
                  if (dirtyRef.current && !(await saveRef.current())) return;
                  onAsk(text);
                })()
            : undefined
        }
      />
    );
  } else if (mode === 'edit') {
    const crumbs = tab === 'part' && sel && (
      <div className="flex min-h-8 shrink-0 items-center gap-1 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden">
        {sel.crumbs.slice(-4).map((c, i, all) => (
          <span key={c.path.join('.')} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className="text-fg-3">›</span>}
            <button
              type="button"
              onClick={() => cmd('select', c.path)}
              className={cx('rounded-md px-1.5 py-0.5 text-[12px] transition-colors hover:bg-bg-2', i === all.length - 1 ? 'font-semibold text-fg' : 'text-fg-3')}
            >
              {c.name}
            </button>
          </span>
        ))}
      </div>
    );
    const panel =
      tab === 'comments' && pageId ? (
        <PageComments
          comments={comments}
          active={activeComment}
          draft={commentDraft}
          readOnly={readOnly}
          onAdd={() => cmd('comment')}
          onDraftDone={(text) => addComment(text)}
          onDraftCancel={() => setCommentDraft(null)}
          onPick={(id) => setActiveComment(id)}
          onReply={(id, text) => void commentOps([{ id, reply: text }]).catch(toastError)}
          onResolve={(id, resolved) => void commentOps([resolved ? { id, resolve: true } : { id, reopen: true }]).catch(toastError)}
          onEdit={(id, text) => void commentOps([{ id, edit: text }]).catch(toastError)}
          onDelete={(id) => void commentOps([{ id, delete: true }]).catch(toastError)}
          ai={pageAi}
        />
      ) : tab === 'layers' ? (
        <LayersPanel tree={layers} sel={sel} cmd={cmd} />
      ) : tab === 'page' ? (
        <PagePanel page={page} palette={palette} cmd={cmd} media={media} onError={toastError} />
      ) : sel ? (
        <PartPanel
          sel={sel}
          palette={palette}
          fonts={page?.fonts ?? []}
          cmd={cmd}
          ctx={ctx}
          onCtx={setCtx}
          media={media}
          clip={clip}
          onAsk={onAsk ? () => void ask() : undefined}
          onError={toastError}
          onPageTab={() => setTab('page')}
          base={doc.base}
          pageHtml={() => editRef.current?.html() ?? Promise.resolve('')}
          title={doc.title}
        />
      ) : (
        <p className="px-3 py-2 text-[12.5px] leading-relaxed text-fg-3">
          Click a part of the page to change it, and click it again to write in it: Enter makes the next block, and / in an empty one lists the blocks to add. Drag a block by the ⋮⋮ beside it to move it, or click the ⋮⋮ for its menu.
        </p>
      );
    // Folded, only the tabs show; a tab opens it. While words are changed in the page, or a block's menu is open there, it makes room.
    const folded = !beside && (drawer !== 'open' || wordsOn || menuOn);
    body = (
      <div className={cx('flex h-full min-h-0', beside ? 'flex-row' : 'flex-col')}>
        <div className="relative min-h-0 min-w-0 flex-1">
          <DeviceStage device={device} zoom={zoom} width={custom}>
            <EditFrame
              key={epoch}
              ref={editRef}
              html={html}
              base={doc.base}
              title={doc.title}
              labels={labels}
              onSel={setSel}
              onState={setEd}
              onPalette={setPalette}
              onSave={() => void saveRef.current()}
              onReady={() => {
                editRef.current?.cmd('ctx', { ...ctx, media });
                editRef.current?.cmd('layers', tab === 'layers');
                editRef.current?.cmd('caps', { ask: !!onAsk, comment: !!pageId && !readOnly, ai: !readOnly });
                editRef.current?.cmd('comments', marksRef.current);
                editRef.current?.cmd('pages', pageRefsRef.current);
                editRef.current?.cmd('crumbs', crumbsRef.current);
                if (clipboard) editRef.current?.cmd('clip', { html: clipboard.html });
              }}
              onLayers={setLayers}
              onPage={setPage}
              onCopied={(c) => {
                clipboard = { html: c.html, name: c.name };
                setClip(clipboard);
                toast(c.name ? `${c.name} copied` : 'Copied', 'ok');
                // The frame puts it on the system clipboard itself when it can; else it is written from here (HTML and words),
                // so that it pastes in other apps and other pages' tabs too.
                if (!c.system && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined')
                  void navigator.clipboard
                    .write([new ClipboardItem({ 'text/html': new Blob([`<div data-hydor-parts="1">${c.html}</div>`], { type: 'text/html' }), 'text/plain': new Blob([c.text], { type: 'text/plain' }) })])
                    .catch(() => {});
              }}
              onClipRead={(plain) => void readClipboard(plain)}
              onFocusField={(field) => {
                // Description (a picture's): the part's tab, and its field.
                setTab('part');
                setDrawer('open');
                window.setTimeout(() => document.querySelector<HTMLElement>(`aside [aria-label="${field === 'alt' ? 'Description' : field}"]`)?.focus(), 160);
              }}
              onZoom={zoomBy}
              onFind={(replace) => find.show(replace && !readOnly)}
              onFound={(count, index) => setFound({ count, index })}
              onEditing={setWordsOn}
              onMenu={setMenuOn}
              store={doc.store}
              onComment={(c) => {
                // Comment, in the page: a new one is written beside it, on that block (and words).
                setCommentDraft(c);
                setActiveComment(null);
                setTab('comments');
                if (!beside) setDrawer('open');
              }}
              onCommentOpen={(id) => {
                setActiveComment(id);
                setTab('comments');
                if (!beside) setDrawer('open');
              }}
              onAsk={setAsking}
              onFile={(id, f, what) => void keepDropped(id, f, what)}
              onAgent={() => void ask()}
              onKeys={() => setKeysOpen(true)}
              onAi={ai.onAi}
              onAiStop={ai.onAiStop}
              onDbAi={ai.onDbAi}
              onUpload={ai.onUpload}
              onDesign={(d) => {
                // The picked picture's (or video's) Edit, on its bar in the page.
                if (d.what !== 'action' || !sel) return;
                if (d.action === 'editPicture') void editPagePicture({ sel, cmd, base: doc.base, pageHtml: () => editRef.current?.html() ?? Promise.resolve(''), title: doc.title });
                if (d.action === 'editVideo') editPageVideo({ sel, cmd, title: doc.title });
              }}
            />
          </DeviceStage>
          {find.open && (
            <div className="absolute top-2 right-3 z-20">
              <FindBar
                find={find}
                count={found.count}
                index={found.index}
                onNext={() => cmd('find', { query: find.query, opts: find.options, step: 1 })}
                onPrev={() => cmd('find', { query: find.query, opts: find.options, step: -1 })}
                onReplace={readOnly ? undefined : () => cmd('findReplace', { query: find.query, opts: find.options, replacement: find.replacement, all: false })}
                onReplaceAll={readOnly ? undefined : () => cmd('findReplace', { query: find.query, opts: find.options, replacement: find.replacement, all: true })}
              />
            </div>
          )}
          <InsertPopover ask={asking} frame={() => editRef.current?.frame() ?? null} answer={(payload) => cmd('fill', payload)} cmd={cmd} onClose={() => setAsking(null)} onError={toastError} />
          <BlockAskPopover ask={asking} frame={() => editRef.current?.frame() ?? null} answer={(payload) => cmd('fill', payload)} onClose={() => setAsking(null)} onError={toastError} />
        </div>
        <aside className={cx('flex min-h-0 shrink-0 flex-col bg-panel', beside ? 'w-[320px] border-l border-line' : cx('border-t border-line', folded ? 'pb-[var(--safe-bottom)]' : 'h-[min(48%,440px)] min-h-[200px]'))}>
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-1">
            <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5">
              {(pageId ? [...TABS, { value: 'comments' as const, label: 'Comments' }] : TABS).map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.value}
                  onClick={() => {
                    setTab(t.value);
                    if (folded) setDrawer('open');
                  }}
                  className={cx('relative flex h-10 shrink-0 items-center gap-1 px-2.5 text-[13px] font-medium transition-colors', tab === t.value ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
                >
                  {t.label}
                  {t.value === 'comments' && openComments > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-[11px] leading-4 font-semibold text-accent tabular-nums">{openComments}</span>}
                  {tab === t.value && !folded && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
                </button>
              ))}
            </div>
            {tab === 'part' && sel && folded && <span className="min-w-0 truncate text-[12.5px] font-medium text-fg-2">{sel.name}</span>}
            {!beside && (
              <IconButton label={folded ? 'Open the inspector' : 'Fold the inspector'} size="sm" onClick={() => setDrawer(folded ? 'open' : 'closed')}>
                {folded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </IconButton>
            )}
          </div>
          {!folded && (
            <>
              {crumbs}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1">{panel}</div>
            </>
          )}
        </aside>
      </div>
    );
  } else if (mode === 'code') {
    body = (
      <div className={cx('flex h-full min-h-0', side ? 'flex-row' : 'flex-col')}>
        <CodePane key={`${epoch}:${codeView}`} html={code} onChange={setCode} onSave={() => void saveRef.current()} className={cx('min-h-0 flex-1 bg-bg', side ? 'border-r border-line' : 'border-b border-line')} />
        <div className={cx('relative min-h-0', side ? 'flex-1' : 'h-[45%]')}>
          <DeviceStage device={device} zoom={zoom} width={custom}>
            <PageFrame key={`${doc.key}:code:${shown?.n ?? 0}`} html={withBase(shown?.html ?? code, doc.base)} title={doc.title} store={doc.store} app={doc.app} />
          </DeviceStage>
        </div>
      </div>
    );
  } else {
    body = (
      <DeviceStage device={device} zoom={zoom} width={custom}>
        <PageFrame key={`${doc.key}:${epoch}:${pending === null ? 'saved' : pending.length}`} html={withBase(html, doc.base)} title={doc.title} store={doc.store} onPick={onPick} app={doc.app} />
      </DeviceStage>
    );
  }

  return (
    <div ref={shell} data-i18n="pages" className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        {writing && layout !== 'panel' ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3">
            <span className="breathe h-1.5 w-1.5 rounded-full bg-busy" />
            Writing · {kb(new Blob([draft!.text]).size)}
          </span>
        ) : null}
        {writing ? (
          <Segmented
            size="sm"
            value={streamCode ? 'code' : 'view'}
            onChange={(v) => setStreamCode(v === 'code')}
            options={[
              { value: 'view', label: <Eye size={14} aria-label="The page" /> },
              { value: 'code', label: <Code2 size={14} aria-label="Its code" /> },
            ]}
          />
        ) : (
          doc &&
          !readOnly && (
            <Segmented
              size="sm"
              value={mode}
              onChange={(m) => void switchTo(m)}
              options={[
                { value: 'view', label: layout === 'page' ? 'Use' : <Eye size={14} aria-label="Use the page" /> },
                { value: 'edit', label: layout === 'page' ? 'Edit' : <PenLine size={14} aria-label="Edit" /> },
                { value: 'code', label: layout === 'page' ? 'Code' : <Code2 size={14} aria-label="Code" /> },
              ]}
            />
          )
        )}
        {layout === 'page' && roomy && !design && (
          <Segmented
            size="sm"
            value={custom ? ('' as Device) : device}
            onChange={(d) => (setDevice(d), setCustom(null))}
            options={DEVICES.map((d) => ({ value: d.value, label: <span title={d.label}>{d.icon}</span> }))}
          />
        )}
        {layout === 'page' && roomy && !design && <WidthField value={custom} onChange={setCustom} />}
        {(layout === 'panel' || (layout === 'page' && !roomy)) && !design && (
          <>
            <IconButton ref={deviceRef} label={custom ? `As ${custom} pixels wide` : `As on a ${DEVICES.find((d) => d.value === device)!.label.toLowerCase()}`} size="sm" active={deviceMenu} onClick={() => setDeviceMenu((o) => !o)}>
              {DEVICES.find((d) => d.value === device)!.icon}
            </IconButton>
            <Popover anchor={deviceRef} open={deviceMenu} onClose={() => setDeviceMenu(false)} align="end" width={190}>
              {DEVICES.map((d) => (
                <MenuItem key={d.value} icon={d.icon} onClick={() => (setDevice(d.value), setCustom(null), setDeviceMenu(false))}>
                  <span className={cx(device === d.value && !custom && 'font-semibold text-fg')}>{d.label}</span>
                </MenuItem>
              ))}
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="text-[12.5px] text-fg-2">Width</span>
                <WidthField value={custom} onChange={setCustom} />
                <span className="text-[12px] text-fg-3">px</span>
              </div>
            </Popover>
          </>
        )}
        {!design && doc && mode !== 'code' && (
          <>
            <Button ref={zoomRef} size="sm" variant="ghost" icon={<ZoomIn size={14} />} onClick={() => setZoomMenu((o) => !o)} title="Zoom (Ctrl+wheel, Ctrl+= and Ctrl+-, Ctrl+0 for Fit)">
              <span className="tabular-nums">{zoom === 'fit' ? 'Fit' : `${zoom}%`}</span>
            </Button>
            <Popover anchor={zoomRef} open={zoomMenu} onClose={() => setZoomMenu(false)} align="end" width={150}>
              {(['fit', ...ZOOMS] as Zoom[]).map((z) => (
                <MenuItem key={z} onClick={() => (setZoom(z), setZoomMenu(false))}>
                  <span className={cx('tabular-nums', zoom === z && 'font-semibold text-fg')}>{z === 'fit' ? 'Fit' : `${z}%`}</span>
                </MenuItem>
              ))}
            </Popover>
          </>
        )}
        {tail}
      </div>
      {band}
      {mode === 'edit' && doc && !writing && !design && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
          <Button ref={addRef} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding((a) => !a)}>
            Add
          </Button>
          <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!ed.canUndo} onClick={() => cmd('undo')}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!ed.canRedo} onClick={() => cmd('redo')}>
            <Redo2 size={14} />
          </IconButton>
          {media && (
            <span
              className="ml-1 shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11.5px] font-medium text-accent"
              title={media === 'phone' ? 'Changes are for screens 600 px wide or narrower' : 'Changes are for screens 900 px wide or narrower'}
            >
              {media === 'phone' ? 'For phones' : 'For tablets'}
            </span>
          )}
          <span className="ml-1 min-w-0 flex-1 truncate text-[12px] text-fg-3 max-sm:hidden">
            {sel?.multi
              ? `${sel.multi} blocks picked`
              : sel
                ? sel.computed.position === 'sticky'
                  ? 'Drag it to where it should stick on the screen, ↑ and ↓ nudge it; right-click for more'
                  : sel.computed.position && sel.computed.position !== 'static'
                    ? 'Drag it to move it, the arrow keys nudge it, the handles size it; right-click for more'
                    : sel.wordy
                      ? 'Click it again to write in it, type / for blocks; right-click for more'
                      : 'Drag the handle to move it in the page, the handles to size it; right-click, then Place freely, to put it anywhere'
                : 'Click a part of the page, and again to write in it'}
          </span>
          <IconButton label="Find and replace (Ctrl+F)" size="sm" active={find.open} onClick={() => (find.open ? find.close() : find.show())} className="ml-auto">
            <Search size={15} />
          </IconButton>
          <IconButton label="Keyboard shortcuts (Ctrl+Shift+/)" size="sm" onClick={() => setKeysOpen(true)}>
            <Keyboard size={15} />
          </IconButton>
          <AddPanel anchor={addRef} open={adding} onClose={() => setAdding(false)} sel={sel} cmd={cmd} app={doc.app?.info} onAi={onRequest && !readOnly ? (where) => openTypes({ kind: 'block', at: blockPlace(where, sel), onDone: onRequest }) : undefined} onImport={readOnly ? undefined : (where) => importInto(cmd, where)} />
          <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} groups={PAGE_SHORTCUTS} />
        </div>
      )}
      <div className="relative min-h-0 flex-1">{body}</div>
      {dirty && !writing && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={discard} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
        </div>
      )}
      {confirmNode}
    </div>
  );
}

// A slide deck to edit and present, as in PowerPoint or Google Slides: the slides down the side (or across under
// the slide on a phone) to pick, drag into order, copy and skip; the slide itself to edit (SlideCanvas); a toolbar
// to add slides from layouts and parts (text, shapes, pictures, lines and arrows, tables, charts) and to style
// words; a side panel for the part picked, the animations, the slide and the theme (Inspector); speaker notes
// under the slide; every slide at once (Grid); and Present: the slideshow, or the presenter's view with the
// audience's window. Changes stay unsaved until Save (Ctrl+S), as a page's do; Undo and Redo go back and forth.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Grid2x2,
  Image as ImageIcon,
  LayoutTemplate,
  Minus,
  MonitorPlay,
  MoveRight,
  PieChart,
  Play,
  Plus,
  Presentation,
  Redo2,
  Scissors,
  Shapes,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Undo2,
  Link2,
} from 'lucide-react';
import { slideTitle, SHAPES, type Deck, type El, type LayoutId } from '@shared/slides';
import { post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { Button, cx, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, useConfirm } from '../../../components/ui';
import { Inspector, INSPECTOR_TABS, SHAPE_NAMES, ShapeIcon, type InspectorTab } from './Inspector';
import {
  addEls,
  addSlide,
  chart,
  copies,
  duplicateSlides,
  HISTORY_MAX,
  image,
  line,
  moveSlide,
  partName,
  removeEls,
  removeSlides,
  setEls,
  setSlide,
  shape,
  table,
  textBox,
  type History,
} from './ops';
import type { AskScope, ModelDoc, ModelEditorProps } from '../kinds';
import { tr } from '../../../i18n/runtime';
import { Presenter, Slideshow } from './Present';
import { choosePicture as chooseFile, uploadPicture as upload } from '../pictures';
import { useDeckFonts } from './rt';
import { SlideCanvas, type CanvasHandle } from './SlideCanvas';
import { LayoutGrid, Strip } from './Strip';
import { TextBar } from './TextBar';

export type SlidesDoc = ModelDoc<Deck>;

/** Parts copied (or cut), to paste on another slide or in another deck while the app is open. */
let clip: El[] | null = null;

const PRESET_KEY = 'wa.slides.notes';

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

export function SlidesEditor({
  doc,
  pageId,
  layout,
  readOnly,
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
}: ModelEditorProps<Deck> & {
  /** Opens presenting at once (the library's Present). */
  startPresent?: boolean;
}) {
  const [deck, setDeck] = useState<Deck | null>(doc?.model ?? null);
  // The deck as the latest change left it (changes made one after another, before it is drawn again, build on it).
  const live = useRef<Deck | null>(deck);
  const setD = (n: Deck | null) => {
    live.current = n;
    setDeck(n);
  };
  const [saved, setSaved] = useState<Deck | null>(doc?.model ?? null);
  const [hist, setHist] = useState<History>({ past: [], future: [] });
  const [cur, setCur] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
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
  const [confirm, confirmNode] = useConfirm();
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
  const dirty = !!deck && deck !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]);
  useEffect(() => localStorage.setItem(PRESET_KEY, notesOpen ? '1' : '0'), [notesOpen]);

  // Another deck, or the agent's new version while nothing was changed here: start from it.
  useEffect(() => {
    if (!doc) return;
    if (dirtyRef.current) return;
    setD(doc.model);
    setSaved(doc.model);
    setHist({ past: [], future: [] });
    setCur((c) => Math.min(c, doc.model.slides.length - 1));
    setSel((s) => s.filter((id) => doc.model.slides.some((x) => x.els.some((e) => e.id === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  const index = deck ? Math.min(cur, deck.slides.length - 1) : 0;
  const slide = deck?.slides[index];

  useEffect(() => {
    if (!deck || !slide) return;
    onScopes?.(scopesFor(index, slideTitle(slide), slide.els.filter((e) => sel.includes(e.id)).map(partName)));
  }, [deck, index, sel]);

  /** A change to the deck: kept for Undo (changes of one kind in a row go back together). */
  const change = (next: Deck | ((d: Deck) => Deck), key?: string) => {
    const d = live.current;
    if (readOnly || !d) return;
    const n = typeof next === 'function' ? next(d) : next;
    if (n === d) return;
    const now = Date.now();
    setHist((h) => {
      const same = !!key && h.last?.key === key && now - h.last.at < 1200;
      return { past: same ? h.past : [...h.past, d].slice(-HISTORY_MAX), future: [], last: key ? { key, at: now } : undefined };
    });
    setD(n);
  };
  const undo = () => {
    // Words being changed in place are kept first; the next Undo takes them back.
    if (editing) return canvas.current?.stopEditing();
    const d = live.current;
    if (!hist.past.length || !d) return;
    setHist({ past: hist.past.slice(0, -1), future: [d, ...hist.future] });
    setD(hist.past[hist.past.length - 1]);
  };
  const redo = () => {
    const d = live.current;
    if (!hist.future.length || !d) return;
    const [next, ...rest] = hist.future;
    setHist({ past: [...hist.past, d], future: rest });
    setD(next);
  };

  const save = async (): Promise<boolean> => {
    if (!deck || !onSave || saving) return false;
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

  // ---- adding things -------------------------------------------------------------------------------------
  const put = (els: El[]) => {
    if (!deck) return;
    canvas.current?.stopEditing();
    change((d) => addEls(d, index, els));
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
    if (p) change((d) => setEls(d, index, [id], (e) => ({ ...e, src: p.src }) as El));
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
      if (target?.replace) change((d) => setEls(d, index, [target.replace!], (e) => ({ ...e, src: r.src }) as El));
      else put([image(deck, r.src, size.w, size.h)]);
    } catch (e) {
      toastError(e);
    }
  };

  // ---- copy and paste ---------------------------------------------------------------------------------------
  const picked = slide ? slide.els.filter((e) => sel.includes(e.id)) : [];
  const copy = () => {
    if (!picked.length) return;
    clip = picked.map((e) => ({ ...e }));
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
    put(copies(picked));
  };
  const remove = () => {
    if (!sel.length) return;
    change((d) => removeEls(d, index, sel));
    setSel([]);
  };

  // ---- keys ---------------------------------------------------------------------------------------------------
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (!deck || present) return;
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (typing) return;
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
    if (mod && k === 'c') return (e.preventDefault(), copy());
    if (mod && k === 'x') return (e.preventDefault(), cut());
    if (mod && k === 'v' && clip) return (e.preventDefault(), paste());
    if (mod && k === 'd') return (e.preventDefault(), duplicate());
    if (mod && k === 'a') {
      e.preventDefault();
      setSel(slide?.els.map((x) => x.id) ?? []);
      return;
    }
    if (mod && k === 'm') return (e.preventDefault(), newSlide('content'));
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (sel.length) {
        e.preventDefault();
        remove();
      }
      return;
    }
    if (e.key === 'Escape') {
      if (sel.length) setSel([]);
      return;
    }
    if (e.key === 'Enter' && picked.length === 1 && (picked[0].type === 'text' || picked[0].type === 'shape')) {
      e.preventDefault();
      setEditing(picked[0].id);
      return;
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
    const on = (e: KeyboardEvent) => {
      // Keys belong to this editor while it holds the focus (or nothing else does).
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      keys.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
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
        const t = textBox(live.current);
        put([{ ...t, paras: text.split('\n').map((l) => ({ runs: [{ t: l }] })) }]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  const onDrop = async (e: React.DragEvent) => {
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

  if (!deck || !slide) return <div className="flex h-full items-center justify-center text-fg-3">…</div>;

  const textEls = picked.filter((e): e is Extract<El, { type: 'text' | 'shape' }> => e.type === 'text' || e.type === 'shape');
  const showText = textEls.length > 0 && textEls.length === picked.length;
  const stripAct = {
    pick: (i: number) => {
      canvas.current?.stopEditing();
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

  const insertBar = !readOnly && (
    <>
      <IconButton label="Undo (Ctrl+Z)" size="sm" disabled={!hist.past.length} onClick={undo}>
        <Undo2 size={15} />
      </IconButton>
      <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" disabled={!hist.future.length} onClick={redo}>
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
          onMenu={(at) => {
            setCtxAt(at);
            setMenu('context');
          }}
          onReplaceImage={(id) => void replacePicture(id)}
          onChartData={(id) => {
            setSel([id]);
            setTab('format');
            if (!wide) setDrawer('open');
          }}
        />
      </div>
      {wide && (
        <div className="shrink-0 border-t border-line bg-panel">
          <button type="button" onClick={() => setNotesOpen((o) => !o)} className="flex h-8 w-full items-center gap-1.5 px-3 text-[12px] font-medium text-fg-3 hover:text-fg-2">
            {notesOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            Speaker notes
            {!notesOpen && slide.notes && <span className="min-w-0 truncate font-normal">· {slide.notes.split('\n')[0]}</span>}
          </button>
          {notesOpen && (
            <textarea
              value={slide.notes ?? ''}
              readOnly={readOnly}
              onChange={(e) => change((d) => setSlide(d, index, (s) => ({ ...s, notes: e.target.value || undefined })), `notes:${slide.id}`)}
              placeholder={tr('What to say on this slide: you see it in the presenter’s view.')}
              translate="no"
              className="block h-[88px] w-full resize-none bg-transparent px-3 pb-2 text-[13px] leading-relaxed outline-none placeholder:text-fg-3"
            />
          )}
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
    />
  );

  const tabs = (
    <div role="tablist" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
      {[...INSPECTOR_TABS, ...(wide ? [] : [{ value: 'notes' as const, label: 'Notes' }])].map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={tab === t.value}
          onClick={() => {
            setTab(t.value as InspectorTab);
            if (!wide) setDrawer('open');
          }}
          className={cx('relative h-10 shrink-0 px-2.5 text-[13px] font-medium transition-colors', tab === t.value ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
        >
          {t.label}
          {tab === t.value && (wide || drawer === 'open') && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
        </button>
      ))}
    </div>
  );

  const notesPanel = (
    <textarea
      value={slide.notes ?? ''}
      readOnly={readOnly}
      onChange={(e) => change((d) => setSlide(d, index, (s) => ({ ...s, notes: e.target.value || undefined })), `notes:${slide.id}`)}
      placeholder={tr('What to say on this slide: you see it in the presenter’s view.')}
      translate="no"
      className="block h-full min-h-[120px] w-full resize-none bg-transparent px-3 py-2 text-[13.5px] leading-relaxed outline-none placeholder:text-fg-3"
    />
  );

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
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
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
      {!readOnly && (
        <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
          {insertBar}
          {showText && view === 'edit' && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-line" />
              <TextBar deck={deck} index={index} els={textEls} editing={!!editing && textEls.some((x) => x.id === editing)} canvas={canvas} change={change} />
            </>
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
                <Strip deck={deck} cur={index} fonts={fonts} act={stripAct} layout="side" />
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
                <Strip deck={deck} cur={index} fonts={fonts} act={stripAct} layout="bottom" />
              </div>
            )}
            {!readOnly && (
              <aside className={cx('flex min-h-0 shrink-0 flex-col bg-panel', wide ? 'w-[300px] border-l border-line' : cx('border-t border-line', drawer === 'open' ? 'h-[min(46%,420px)] min-h-[180px]' : 'pb-[var(--safe-bottom)]'))}>
                <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-1.5 pl-1">
                  {tabs}
                  {!wide && (
                    <IconButton label={drawer === 'open' ? 'Fold the panel' : 'Open the panel'} size="sm" onClick={() => setDrawer(drawer === 'open' ? 'closed' : 'open')}>
                      {drawer === 'open' ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    </IconButton>
                  )}
                </div>
                {(wide || drawer === 'open') && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{(tab as string) === 'notes' ? notesPanel : inspector}</div>}
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
      <Popover anchor={anchors.line} open={menu === 'line'} onClose={() => setMenu(null)} width={180}>
        <MenuItem icon={<Minus size={14} />} onClick={() => (setMenu(null), put([line(deck, false)]))}>
          Straight line
        </MenuItem>
        <MenuItem icon={<MoveRight size={14} />} onClick={() => (setMenu(null), put([line(deck, true)]))}>
          Arrow
        </MenuItem>
      </Popover>
      <Popover anchor={anchors.picture} open={menu === 'picture'} onClose={() => setMenu(null)} width={230}>
        <MenuItem icon={<ImageIcon size={14} />} onClick={() => void addPicture()}>
          From this device
        </MenuItem>
        <MenuItem icon={<Link2 size={14} />} onClick={() => (setMenu(null), setUrlAsk({}))}>
          From a web address
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
      <Popover anchor={ctxRef} open={menu === 'context'} onClose={() => setMenu(null)} width={220}>
        {picked.length > 0 && !readOnly && (
          <>
            <MenuItem icon={<Scissors size={14} />} hint="Ctrl+X" onClick={() => (setMenu(null), cut())}>
              Cut
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} hint="Ctrl+C" onClick={() => (setMenu(null), copy())}>
              Copy
            </MenuItem>
          </>
        )}
        {clip && !readOnly && (
          <MenuItem icon={<Clipboard size={14} />} hint="Ctrl+V" onClick={() => (setMenu(null), paste())}>
            Paste
          </MenuItem>
        )}
        {picked.length > 0 && !readOnly && (
          <>
            <MenuItem icon={<Copy size={14} />} hint="Ctrl+D" onClick={() => (setMenu(null), duplicate())}>
              Duplicate
            </MenuItem>
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
      {present && !present.presenter && <Slideshow deck={deck} from={present.from} onClose={() => setPresent(null)} />}
      {present?.presenter && <Presenter deck={deck} from={present.from} pageId={pageId} onClose={() => setPresent(null)} />}
      {confirmNode}
    </div>
  );
}

/** Loads a version's model (an older one on view, of a deck, a document or a spreadsheet). */

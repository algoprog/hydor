// The picture editor, in a tab of its own (host.tsx): the picture, zoomed and moved about, and its tools: Crop (a
// shape, turns, flips, straightening), Adjust, Filters, Markup (pen, highlighter, arrows, lines, boxes, ovals, words,
// blurred or pixelated areas, emoji: each movable and deletable until saved) and AI (background removed, something
// erased, changed with words, the picture expanded). Every step can be undone and done again; holding Compare shows
// the picture as it was opened. Save puts it back where it came from (or into the Library), at the size and kind of
// file picked; Save a copy keeps it as well. The screen works on a smaller copy; the file is made from the whole.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Crop, Ellipsis, Maximize, Minus, Palette, PenLine, Plus, Redo2, RotateCcw, SlidersHorizontal, Sparkles, SplitSquareHorizontal, Undo2 } from 'lucide-react';
import {
  cropOfShape,
  cropSize,
  CROP_SHAPES,
  flipRecipe,
  formatOfMime,
  formatOfName,
  IMAGE_FORMATS,
  isPlain,
  MARK_FONTS,
  moveMark,
  scaleMark,
  textMetrics,
  turnRecipe,
  uprightSize,
  type Adjust,
  type CropShape,
  type ImageFormat,
  type ImageRecipe,
  type Mark,
  type Saved,
} from '@shared/mediaedit';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Throbber, useIsMobile } from '../../components/ui';
import { toast, toastError } from '../../lib/store';
import { AiPanel, useAiTools, type AiHost } from './AiPanel';
import { keepKeys, type EditorProps } from './host';
import { AdjustPanel, CropPanel, FiltersPanel, MarkupPanel, styleFor, TEXT_BACKS, type MarkStyle, type MarkTool } from './panels';
import { CropBox, PictureView, type Gesture, type ViewHandle, type ViewT } from './PictureView';
import { blobData, flatten, loadSource, makeFile, markAt, markBox, markSize, newBaseId, putLook, seeThrough, shrink, uprightCanvas, type Base } from './render';
import { saveImage, savePlans } from './save';

type Tool = 'crop' | 'adjust' | 'filters' | 'markup' | 'ai';
const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'crop', label: 'Crop', icon: <Crop size={16} /> },
  { id: 'adjust', label: 'Adjust', icon: <SlidersHorizontal size={16} /> },
  { id: 'filters', label: 'Filters', icon: <Palette size={16} /> },
  { id: 'markup', label: 'Markup', icon: <PenLine size={16} /> },
  { id: 'ai', label: 'AI', icon: <Sparkles size={16} /> },
];

/** The screen's copy of the picture, and a smaller one while a slider moves. */
const PREVIEW_SIDE = 2048;
const FAST_SIDE = 900;
const STEPS = 80;

interface Snap {
  base: Base;
  recipe: ImageRecipe;
}

interface Start {
  base: Base;
  mime: string;
  note?: string;
}

export function ImageEditor(p: EditorProps) {
  const [start, setStart] = useState<Start | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setStart(null);
    setError(null);
    loadSource(p.o.src).then(
      (s) => alive && setStart({ base: { id: newBaseId(), canvas: s.canvas, w: s.w, h: s.h }, mime: s.mime, note: s.note }),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [p.o.src]);
  if (!start)
    return (
      <div className="flex h-full min-h-0 flex-col bg-bg">
        {p.lead && <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-1.5 pt-[var(--safe-top)]">{p.lead}</div>}
        <div className="flex min-h-0 flex-1 items-center justify-center text-fg-3">
          {error ? (
            <Empty title="That picture could not be opened">
              <span>{error}</span>
              <span className="mt-3 block">
                <Button size="sm" variant="secondary" onClick={p.close}>
                  Close
                </Button>
              </span>
            </Empty>
          ) : (
            <Throbber size={28} />
          )}
        </div>
      </div>
    );
  return <Editing key={start.base.id} {...p} start={start} />;
}

/** A word for a mark's kind, for the hint under the markup tools. */
const HINTS: Record<MarkTool, string> = {
  move: 'Drag a mark to move it; its × deletes it. Drag elsewhere to move the picture.',
  pen: 'Drag on the picture to draw.',
  highlighter: 'Drag over what to highlight.',
  arrow: 'Drag from where the arrow starts to what it points at.',
  line: 'Drag from one end of the line to the other.',
  rect: 'Drag across what to frame.',
  ellipse: 'Drag across what to circle.',
  text: 'Tap where the words go, then type.',
  blur: 'Drag across what to hide: a face, a number plate, a name.',
  pixelate: 'Drag across what to hide: a face, a number plate, a name.',
  emoji: 'Pick one, then tap where it goes.',
};

let markIds = 0;
const newMarkId = () => `m${Date.now().toString(36)}${(++markIds).toString(36)}`;

const lookKey = (r: ImageRecipe) => JSON.stringify([r.adjust ?? null, r.filter ?? null, (r.marks ?? []).filter((m) => m.type === 'blur' || m.type === 'pixelate')]);
const geoKey = (r: ImageRecipe) => `${r.rotate ?? 0}|${r.flipH ? 1 : 0}|${r.flipV ? 1 : 0}|${r.straighten ?? 0}`;

function Editing({ o, active, detached, setDirty, done, lead, start }: EditorProps & { start: Start }) {
  const phone = useIsMobile();
  const root = useRef<HTMLDivElement>(null);
  // Laid out by its own width: narrow (a phone, or a small window beside the sidebar) has its panel below the picture
  // and its tools along the bottom; compact names its tools by their icons alone.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const r = () => setWidth(el.clientWidth);
    r();
    const ro = new ResizeObserver(r);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const mobile = phone || (width > 0 && width < 680);
  const compact = !mobile && width > 0 && width < 1040;
  const view = useRef<ViewHandle>(null);
  // The steps, kept in a ref too, so a step and what follows it read the newest at once.
  const hist = useRef<{ list: Snap[]; at: number }>({ list: [{ base: start.base, recipe: {} }], at: 0 });
  const [, rerender] = useState(0);
  const cur = hist.current.list[hist.current.at];
  const liveRef = useRef<ImageRecipe | null>(null);
  const [live, setLiveState] = useState<ImageRecipe | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const recipe = live ?? cur.recipe;
  const base = cur.base;
  const saved = useRef<Snap>(hist.current.list[0]);
  const [tool, setToolState] = useState<Tool>('crop');
  const [comparing, setComparing] = useState(false);
  const [cropShape, setCropShape] = useState<CropShape>('free');
  const [markTool, setMarkTool] = useState<MarkTool>('pen');
  const long0 = Math.max(start.base.w, start.base.h);
  const [style, setStyleState] = useState<MarkStyle>(() => styleFor(long0));
  const [picked, setPicked] = useState<string | null>(null);
  const [writing, setWriting] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const ai = useAiTools();
  const [aiBusy, setAiBusy] = useState(false);

  const fileTo = o.to && 'file' in o.to ? o.to.file : null;
  const own = (fileTo ? formatOfName(fileTo) : null) ?? formatOfMime(start.mime);
  const [format, setFormat] = useState<ImageFormat>(own ?? 'png');
  const [quality, setQuality] = useState(90);
  const [outW, setOutW] = useState<number | null>(null);
  const [saving, setSaving] = useState<'main' | 'copy' | null>(null);
  const plans = savePlans(o, detached, format);

  // ---- steps ----
  const setLive = (r: ImageRecipe | null) => {
    liveRef.current = r;
    setLiveState(r);
  };
  const commit = useCallback((r: ImageRecipe, b?: Base) => {
    window.clearTimeout(timer.current);
    const h = hist.current;
    const snap = { base: b ?? h.list[h.at].base, recipe: r };
    const list = [...h.list.slice(0, h.at + 1), snap].slice(-STEPS);
    hist.current = { list, at: list.length - 1 };
    liveRef.current = null;
    setLiveState(null);
    rerender((n) => n + 1);
  }, []);
  /** A change shown at once and kept as a step when it rests (a slider moving). */
  const preview = (r: ImageRecipe) => {
    setLive(r);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(r), 450);
  };
  const flush = () => {
    if (liveRef.current) commit(liveRef.current);
  };
  const now = () => liveRef.current ?? hist.current.list[hist.current.at].recipe;
  const step = (d: number) => {
    flush();
    const h = hist.current;
    const at = Math.max(0, Math.min(h.list.length - 1, h.at + d));
    if (at === h.at) return;
    hist.current = { ...h, at };
    setPicked(null);
    setWriting(null);
    ai.setStrokes([]);
    rerender((n) => n + 1);
  };
  const canUndo = hist.current.at > 0;
  const canRedo = hist.current.at < hist.current.list.length - 1;
  const dirty = cur !== saved.current || !!live;
  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setTool = (t: Tool) => {
    flush();
    if (writing) setWriting(null);
    setPicked(null);
    ai.setStrokes([]);
    setToolState(t);
  };

  // ---- what shows ----
  const U = uprightSize(base.w, base.h, recipe.rotate);
  const crop = recipe.crop ?? { x: 0, y: 0, w: U.w, h: U.h };
  const cropping = tool === 'crop' && !comparing;
  const small = useMemo(() => shrink(base.canvas, PREVIEW_SIDE), [base]);
  const fastSmall = useMemo(() => shrink(small, FAST_SIDE), [small]);
  const original = useMemo(() => shrink(start.base.canvas, PREVIEW_SIDE), [start.base]);
  const fast = !!live && (lookKey(live) !== lookKey(cur.recipe) || geoKey(live) !== geoKey(cur.recipe));
  const lk = lookKey(recipe);
  const gk = geoKey(recipe);
  const ck = cropping ? 'all' : `${crop.x},${crop.y},${crop.w},${crop.h}`;
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (comparing) return setPhoto(original);
    const id = requestAnimationFrame(() => {
      const src = fast ? fastSmall : small;
      const k = src.width / base.w;
      const r = now();
      const c = uprightCanvas(src, base.w, base.h, r, k, !cropping);
      putLook(c, r, k, cropping ? { x: 0, y: 0 } : { x: r.crop?.x ?? 0, y: r.crop?.y ?? 0 });
      setPhoto(c);
    });
    return () => cancelAnimationFrame(id);
  }, [base, small, fastSmall, original, lk, gk, ck, fast, comparing, cropping]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = comparing ? { w: start.base.w, h: start.base.h, at: { x: 0, y: 0 } } : cropping ? { w: U.w, h: U.h, at: { x: 0, y: 0 } } : { w: crop.w, h: crop.h, at: { x: crop.x, y: crop.y } };
  const marks = comparing ? [] : (recipe.marks ?? []).filter((m) => m.id !== writing);
  const pickedMark = (recipe.marks ?? []).find((m) => m.id === picked) ?? null;

  // The filters' small copies: the picture as turned and cropped, before its look.
  const thumb = useMemo(() => {
    if (tool !== 'filters') return null;
    const tiny = shrink(small, 200);
    const r: ImageRecipe = { ...cur.recipe, adjust: undefined, filter: undefined, marks: undefined };
    const c = uprightCanvas(tiny, base.w, base.h, r, tiny.width / base.w, true);
    // Square, from its middle, as the cells show it.
    const s = Math.min(c.width, c.height);
    const sq = document.createElement('canvas');
    sq.width = sq.height = Math.max(1, Math.round(Math.min(120, s)));
    sq.getContext('2d')!.drawImage(c, (c.width - s) / 2, (c.height - s) / 2, s, s, 0, 0, sq.width, sq.height);
    return sq;
  }, [tool, small, base, gk, ck]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- focus and keys ----
  useEffect(() => {
    if (!active) return;
    const el = root.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [active]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = !!(e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]');
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 's') {
      e.preventDefault();
      void save('main');
    } else if (!typing && mod && k === 'z') {
      e.preventDefault();
      step(e.shiftKey ? 1 : -1);
    } else if (!typing && mod && k === 'y') {
      e.preventDefault();
      step(1);
    } else if (!typing && (k === 'delete' || k === 'backspace') && picked) {
      e.preventDefault();
      removeMark(picked);
    } else if (!typing && k === 'escape' && picked) setPicked(null);
    keepKeys(e);
  };

  // ---- crop ----
  const ratioOf = (s: CropShape): number | null => (s === 'free' ? null : s === 'original' ? U.w / U.h : (CROP_SHAPES.find((x) => x.id === s)?.ratio ?? null));
  const pickShape = (s: CropShape) => {
    setCropShape(s);
    const r = now();
    if (s === 'free') return;
    if (s === 'original') return commit({ ...r, crop: undefined });
    const ratio = ratioOf(s)!;
    commit({ ...r, crop: cropOfShape(U.w, U.h, ratio) });
  };
  const setCrop = (b: { x: number; y: number; w: number; h: number }, end: boolean) => {
    const whole = b.x <= 0 && b.y <= 0 && b.w >= U.w && b.h >= U.h;
    const r = { ...now(), crop: whole ? undefined : b };
    if (end) commit(r);
    else setLive(r);
  };
  const turn = (dir: 1 | -1) => commit(turnRecipe(now(), base.w, base.h, dir, markSize));
  const flip = (axis: 'h' | 'v') => commit(flipRecipe(now(), base.w, base.h, axis, markSize));
  const geometryChanged = !!(recipe.rotate || recipe.flipH || recipe.flipV || recipe.straighten || recipe.crop);
  const resetGeometry = () => {
    // Undone a step at a time, so the marks stay where they were drawn.
    let r: ImageRecipe = { ...now(), straighten: undefined, crop: undefined };
    if (r.flipH) r = flipRecipe(r, base.w, base.h, 'h', markSize);
    if (r.flipV) r = flipRecipe(r, base.w, base.h, 'v', markSize);
    for (let i = 0; i < 3 && r.rotate; i++) r = turnRecipe(r, base.w, base.h, 1, markSize);
    delete r.straighten;
    delete r.crop;
    setCropShape('free');
    commit(r);
  };

  // ---- look ----
  const setAdjust = (k: keyof Adjust, v: number) => {
    const r = now();
    const a = { ...(r.adjust ?? {}), [k]: v };
    if (!v) delete a[k];
    preview({ ...r, adjust: Object.keys(a).length ? a : undefined });
  };

  // ---- marks ----
  const upright = (x: number, y: number) => [x + frame.at.x, y + frame.at.y] as const;
  const removeMark = (id: string) => {
    const r = now();
    const left = (r.marks ?? []).filter((m) => m.id !== id);
    setPicked(null);
    setWriting(null);
    commit({ ...r, marks: left.length ? left : undefined });
  };
  const putMarks = (list: Mark[], end: boolean) => {
    const r = { ...now(), marks: list.length ? list : undefined };
    if (end) commit(r);
    else setLive(r);
  };
  /** A style changed: kept for what is drawn next, and given to the mark picked. */
  const setStyle = (s: Partial<MarkStyle>) => {
    const next = { ...style, ...s };
    setStyleState(next);
    const m = pickedMark;
    if (!m) return;
    const r = now();
    const changed = styled(m, s, next);
    if (changed !== m) commit({ ...r, marks: (r.marks ?? []).map((x) => (x.id === m.id ? changed : x)) });
  };
  const styled = (m: Mark, s: Partial<MarkStyle>, st: MarkStyle): Mark => {
    let out: Mark = m;
    if (s.color && 'color' in out) out = { ...out, color: s.color } as Mark;
    if (s.width !== undefined && (out.type === 'pen' || out.type === 'arrow' || out.type === 'line' || out.type === 'rect' || out.type === 'ellipse')) out = { ...out, width: s.width };
    if (s.hiWidth !== undefined && out.type === 'highlighter') out = { ...out, width: s.hiWidth };
    if (out.type === 'text') {
      if (s.font) out = { ...out, font: s.font };
      if (s.size !== undefined) out = { ...out, size: s.size };
      if (s.back !== undefined) out = { ...out, bg: TEXT_BACKS.find((b) => b.id === st.back)?.color };
    }
    if (s.strength !== undefined && (out.type === 'blur' || out.type === 'pixelate')) out = { ...out, strength: s.strength };
    if (out.type === 'emoji') {
      if (s.emoji) out = { ...out, emoji: s.emoji };
      if (s.emojiSize !== undefined) out = { ...out, size: s.emojiSize };
    }
    return out;
  };

  const pressMarkup = (fx: number, fy: number, _e: PointerEvent, t: ViewT): Gesture | null => {
    const [x, y] = upright(fx, fy);
    const list = now().marks ?? [];
    const slop = 8 / t.z;
    // A picked box's corner: resizes it.
    const sel = list.find((m) => m.id === picked);
    if (sel && (sel.type === 'rect' || sel.type === 'ellipse' || sel.type === 'blur' || sel.type === 'pixelate')) {
      const cs = [
        ['nw', sel.x, sel.y],
        ['ne', sel.x + sel.w, sel.y],
        ['sw', sel.x, sel.y + sel.h],
        ['se', sel.x + sel.w, sel.y + sel.h],
      ] as const;
      const hit = cs.find(([, cx, cy]) => Math.hypot(cx - x, cy - y) <= slop * 1.6);
      if (hit) {
        const [c] = hit;
        const fixed = { x: c[1] === 'w' ? sel.x + sel.w : sel.x, y: c[0] === 'n' ? sel.y + sel.h : sel.y };
        const sized = (mx: number, my: number): Mark => {
          const [ux, uy] = upright(mx, my);
          return { ...sel, x: Math.min(fixed.x, ux), y: Math.min(fixed.y, uy), w: Math.max(2, Math.abs(ux - fixed.x)), h: Math.max(2, Math.abs(uy - fixed.y)) };
        };
        return {
          move: (mx, my) =>
            putMarks(
              list.map((m) => (m.id === sel.id ? sized(mx, my) : m)),
              false,
            ),
          up: (mx, my) =>
            putMarks(
              list.map((m) => (m.id === sel.id ? sized(mx, my) : m)),
              true,
            ),
        };
      }
    }
    const hit = markAt(list, x, y, slop);
    if (markTool === 'move' || (hit && hit.id === picked)) {
      if (!hit) {
        setPicked(null);
        return null;
      }
      setPicked(hit.id ?? null);
      let moved = false;
      const at = (mx: number, my: number) => {
        const [ux, uy] = upright(mx, my);
        return list.map((m) => (m.id === hit.id ? moveMark(m, (px, py) => [px + ux - x, py + uy - y]) : m));
      };
      return {
        move: (mx, my) => {
          moved = true;
          putMarks(at(mx, my), false);
        },
        up: (mx, my) => {
          if (moved) putMarks(at(mx, my), true);
          else if (hit.type === 'text') setWriting(hit.id ?? null);
        },
      };
    }
    const id = newMarkId();
    if (markTool === 'text') {
      const m: Mark = {
        id,
        type: 'text',
        x,
        y: y - textMetrics(style.size).line / 2,
        text: '',
        size: style.size,
        color: style.color,
        font: style.font,
        ...(TEXT_BACKS.find((b) => b.id === style.back)?.color ? { bg: TEXT_BACKS.find((b) => b.id === style.back)!.color } : {}),
      };
      putMarks([...list, m], false);
      setPicked(id);
      setWriting(id);
      return { move: () => {}, up: () => {} };
    }
    if (markTool === 'emoji') {
      const m: Mark = { id, type: 'emoji', x: x - style.emojiSize / 2, y: y - style.emojiSize / 2, emoji: style.emoji, size: style.emojiSize };
      putMarks([...list, m], true);
      setPicked(id);
      return { move: () => {}, up: () => {} };
    }
    const make = (mx: number, my: number, pts?: number[]): Mark => {
      const [ux, uy] = upright(mx, my);
      switch (markTool) {
        case 'pen':
        case 'highlighter':
          return { id, type: markTool, pts: pts ?? [x, y], color: style.color, width: markTool === 'highlighter' ? style.hiWidth : style.width };
        case 'arrow':
        case 'line':
          return { id, type: markTool, x1: x, y1: y, x2: ux, y2: uy, color: style.color, width: style.width };
        case 'rect':
        case 'ellipse':
          return { id, type: markTool, x: Math.min(x, ux), y: Math.min(y, uy), w: Math.abs(ux - x), h: Math.abs(uy - y), color: style.color, width: style.width };
        default:
          return { id, type: markTool === 'pixelate' ? 'pixelate' : 'blur', x: Math.min(x, ux), y: Math.min(y, uy), w: Math.abs(ux - x), h: Math.abs(uy - y), strength: style.strength };
      }
    };
    const pts: number[] = [x, y];
    let last = make(fx, fy, pts);
    putMarks([...list, last], false);
    return {
      move: (mx, my) => {
        if (markTool === 'pen' || markTool === 'highlighter') {
          const [ux, uy] = upright(mx, my);
          pts.push(Math.round(ux * 10) / 10, Math.round(uy * 10) / 10);
        }
        last = make(mx, my, [...pts]);
        putMarks([...list, last], false);
      },
      up: (mx, my) => {
        if (markTool !== 'pen' && markTool !== 'highlighter') last = make(mx, my);
        const b = markBox(last);
        // Too small to mean anything: a slip, not a mark (a dot of the pen is one).
        const tiny = markTool !== 'pen' && markTool !== 'highlighter' && Math.max(b.w, b.h) * t.z < 6;
        if (tiny) return putMarks(list, false);
        putMarks([...list, last], true);
        setPicked(id);
      },
    };
  };

  const press = (fx: number, fy: number, e: PointerEvent, t: ViewT): Gesture | null => {
    if (comparing) return null;
    if (tool === 'markup') {
      if (writing) {
        // A press outside the words being written ends them.
        setWriting(null);
        endWriting(writing);
        return null;
      }
      return pressMarkup(fx, fy, e, t);
    }
    return null;
  };
  const endWriting = (id: string) => {
    const r = now();
    const m = (r.marks ?? []).find((x) => x.id === id);
    if (m && m.type === 'text' && !m.text.trim()) {
      const left = (r.marks ?? []).filter((x) => x.id !== id);
      setPicked(null);
      return commit({ ...r, marks: left.length ? left : undefined });
    }
    commit(r);
  };

  // ---- AI ----
  const aiHost: AiHost = {
    flat: () => flatten(base, now()),
    apply: (c, opt) => {
      const r = now();
      const off = { x: r.crop?.x ?? 0, y: r.crop?.y ?? 0 };
      const cs = cropSize(r, base.w, base.h);
      const place = opt?.place ?? { x: 0, y: 0 };
      const k = opt?.place ? 1 : c.width / cs.w;
      // The marks go on with the picture: its crop's corner is the new picture's top left (an expansion's place added).
      const kept = (r.marks ?? [])
        .filter((m) => m.type !== 'blur' && m.type !== 'pixelate')
        .map((m) =>
          scaleMark(
            moveMark(m, (x, y) => [x - off.x + place.x, y - off.y + place.y]),
            k,
          ),
        );
      if (format === 'jpeg' && seeThrough(c)) setFormat('png');
      setPicked(null);
      setOutW(null);
      commit(kept.length ? { marks: kept } : {}, { id: newBaseId(), canvas: c, w: c.width, h: c.height });
    },
  };

  // ---- saving ----
  const cs = cropSize(recipe, base.w, base.h);
  const outH = outW ? Math.max(1, Math.round((outW * cs.h) / cs.w)) : cs.h;
  const save = async (which: 'main' | 'copy') => {
    const plan = which === 'main' ? plans.main : plans.copy;
    if (!plan || saving) return;
    if (writing) {
      const id = writing;
      setWriting(null);
      endWriting(id);
    }
    flush();
    const r: ImageRecipe = { ...now(), ...(outW && outW !== cs.w ? { resize: { w: outW, h: outH } } : {}) };
    const snap = hist.current.list[hist.current.at];
    setSaving(which);
    try {
      // A frame first, so "Saving" shows before the picture is made.
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      const made = await makeFile(snap.base, r, format, quality);
      const data = await blobData(made.blob);
      const ans = await saveImage({ data, to: plan.to, ...(made.made !== format ? { format, quality } : {}) });
      saved.current = snap;
      rerender((n) => n + 1);
      if (ans.note) toast(ans.note);
      const result: Saved = { kind: 'image', src: ans.src, media: ans.media, path: ans.path, w: ans.w, h: ans.h, mime: ans.mime, replaced: ans.replaced, ...('asset' in plan.to ? { data } : {}) };
      if (which === 'copy') toast(ans.path ? `Saved a copy beside it: ${ans.path.split(/[\\/]/).pop()}` : 'Saved a copy in your Library', 'ok');
      else await done(result);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(null);
    }
  };

  // ---- the screen ----
  const panel = (
    <>
      {start.note && <p className="mb-3 rounded-lg bg-bg-2 px-3 py-2 text-[12px] leading-snug text-fg-3">{start.note}</p>}
      {tool === 'crop' && (
        <CropPanel
          shape={cropShape}
          pictureRatio={U.w / U.h}
          onShape={pickShape}
          onTurn={turn}
          onFlip={flip}
          straighten={recipe.straighten ?? 0}
          onStraighten={(v) => preview({ ...now(), straighten: v || undefined })}
          onReset={resetGeometry}
          changed={geometryChanged}
        />
      )}
      {tool === 'adjust' && <AdjustPanel adjust={recipe.adjust ?? {}} onChange={setAdjust} onReset={() => commit({ ...now(), adjust: undefined })} />}
      {tool === 'filters' && (
        <FiltersPanel
          row={mobile}
          thumb={thumb}
          adjust={recipe.adjust ?? {}}
          filter={recipe.filter}
          onPick={(id) => commit({ ...now(), filter: id ? { id } : undefined })}
          onStrength={(v) => {
            const f = now().filter;
            if (f) preview({ ...now(), filter: v >= 100 ? { id: f.id } : { id: f.id, strength: v } });
          }}
        />
      )}
      {tool === 'markup' && (
        <MarkupPanel tool={markTool} onTool={(t) => (setMarkTool(t), setPicked(null))} style={style} onStyle={setStyle} picked={pickedMark} onDelete={() => picked && removeMark(picked)} long={Math.max(base.w, base.h)} hint={HINTS[markTool]} />
      )}
      {tool === 'ai' && <AiPanel ai={ai} host={aiHost} onBusy={setAiBusy} />}
    </>
  );

  const writingMark = writing ? (recipe.marks ?? []).find((m) => m.id === writing) : null;
  const overlay = (t: ViewT) => (
    <>
      {cropping && <CropBox t={t} crop={crop} frame={U} ratio={ratioOf(cropShape)} onChange={setCrop} />}
      {writingMark && writingMark.type === 'text' && (
        <Words
          t={t}
          mark={writingMark}
          at={frame.at}
          onChange={(text) =>
            putMarks(
              (now().marks ?? []).map((m) => (m.id === writingMark.id && m.type === 'text' ? { ...m, text } : m)),
              false,
            )
          }
          onDone={() => {
            const id = writingMark.id!;
            setWriting(null);
            endWriting(id);
          }}
        />
      )}
    </>
  );

  const busy = !!saving || aiBusy;
  const undoRedo = (
    <>
      <IconButton label="Undo" disabled={!canUndo || busy} onClick={() => step(-1)}>
        <Undo2 size={17} />
      </IconButton>
      <IconButton label="Redo" disabled={!canRedo || busy} onClick={() => step(1)}>
        <Redo2 size={17} />
      </IconButton>
      <IconButton
        label="Hold to compare with the original"
        active={comparing}
        disabled={busy}
        onPointerDown={(e) => {
          e.preventDefault();
          setComparing(true);
        }}
        onPointerUp={() => setComparing(false)}
        onPointerLeave={() => setComparing(false)}
        onPointerCancel={() => setComparing(false)}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setComparing(true)}
        onKeyUp={() => setComparing(false)}
      >
        <SplitSquareHorizontal size={17} />
      </IconButton>
    </>
  );

  return (
    <div
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        const el = root.current;
        if (el && !(e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable="true"]') && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
      }}
      className="flex h-full min-h-0 flex-col bg-bg outline-none"
    >
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-12 items-center gap-1 px-1.5 sm:px-3">
          {lead}
          {mobile ? (
            <span translate="no" className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">
              {o.title}
            </span>
          ) : (
            <>
              <div role="tablist" aria-label="Tools" className="flex items-center gap-0.5">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tool === t.id}
                    disabled={busy && tool !== t.id}
                    onClick={() => setTool(t.id)}
                    title={compact ? t.label : undefined}
                    aria-label={compact ? t.label : undefined}
                    className={cx('flex h-8 items-center gap-1.5 rounded-lg text-[13px] font-medium transition-colors disabled:opacity-40', compact ? 'px-2' : 'px-2.5', tool === t.id ? 'bg-bg-2 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
                  >
                    {t.icon}
                    {!compact && t.label}
                  </button>
                ))}
              </div>
              <span className="min-w-0 flex-1" />
            </>
          )}
          {undoRedo}
          {!mobile && <MoreMenu onFit={() => view.current?.fit()} onActual={() => view.current?.actual()} onReset={() => (setCropShape('free'), commit({}, start.base))} canReset={!(cur.base === start.base && isPlain(cur.recipe))} busy={busy} />}
          {!mobile && !compact && plans.copy && (
            <Button size="sm" variant="secondary" className="ml-1" disabled={busy} onClick={() => void save('copy')}>
              {saving === 'copy' ? 'Saving' : plans.copy.label}
            </Button>
          )}
          <SaveButton
            label={saving === 'main' ? 'Saving' : plans.main.label}
            disabled={busy}
            onSave={() => void save('main')}
            options={
              <SaveOptions
                w={outW ?? cs.w}
                h={outH}
                full={cs}
                onWidth={setOutW}
                format={format}
                onFormat={setFormat}
                quality={quality}
                onQuality={setQuality}
                says={[plans.main.says, plans.copy?.says].filter(Boolean).join(' ')}
                copy={(mobile || compact) && plans.copy ? { label: plans.copy.label, run: () => void save('copy') } : null}
                busy={busy}
              />
            }
          />
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PictureView
            ref={view}
            className="absolute inset-0"
            photo={photo}
            frame={frame}
            marks={marks}
            outline={tool === 'markup'}
            selected={tool === 'markup' && !writing ? pickedMark : null}
            onDelete={picked ? () => removeMark(picked) : undefined}
            onPress={press}
            onDoubleClick={(x, y) => {
              if (tool !== 'markup') return view.current?.fit();
              const [ux, uy] = upright(x, y);
              const hit = markAt(now().marks ?? [], ux, uy, 8 / zoom);
              if (hit?.type === 'text') {
                setPicked(hit.id ?? null);
                setWriting(hit.id ?? null);
              }
            }}
            strokes={tool === 'ai' ? ai.strokes : undefined}
            brush={tool === 'ai' && ai.painting && !aiBusy ? ai.brush : undefined}
            onStrokes={ai.setStrokes}
            cursor={tool === 'markup' && markTool !== 'move' ? 'crosshair' : 'grab'}
            onZoom={setZoom}
          >
            {overlay}
          </PictureView>
          {!mobile && (
            <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-xl border border-line bg-elevated/95 p-0.5 shadow-sm">
              <IconButton label="Zoom out" size="sm" onClick={() => view.current?.zoomBy(1 / 1.25)}>
                <Minus size={14} />
              </IconButton>
              <button type="button" onClick={() => view.current?.actual()} title="Actual size" className="tnum h-7 min-w-12 rounded-lg px-1 text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg">
                {Math.round(zoom * 100)}%
              </button>
              <IconButton label="Zoom in" size="sm" onClick={() => view.current?.zoomBy(1.25)}>
                <Plus size={14} />
              </IconButton>
              <IconButton label="Fit to screen" size="sm" onClick={() => view.current?.fit()}>
                <Maximize size={13} />
              </IconButton>
            </div>
          )}
          {comparing && <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/65 px-2.5 py-1 text-[12px] font-medium text-white">The original</span>}
        </div>
        {!mobile && <aside className={cx('shrink-0 overflow-y-auto border-l border-line bg-panel p-4', compact ? 'w-[280px]' : 'w-[312px]')}>{panel}</aside>}
      </div>
      {mobile && (
        <>
          <div className="max-h-[38dvh] min-h-[7.5rem] shrink-0 overflow-y-auto border-t border-line bg-panel px-3 py-3">{panel}</div>
          <nav role="tablist" aria-label="Tools" className="flex shrink-0 border-t border-line bg-bg pb-[var(--safe-bottom)]">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tool === t.id}
                disabled={busy && tool !== t.id}
                onClick={() => setTool(t.id)}
                className={cx('flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium disabled:opacity-40', tool === t.id ? 'text-accent' : 'text-fg-3')}
              >
                {t.icon}
                <span className="max-w-full truncate">{t.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}

/** Words being written in place, over the picture: as large and in the colour they will be. */
function Words({ t, mark, at, onChange, onDone }: { t: ViewT; mark: Extract<Mark, { type: 'text' }>; at: { x: number; y: number }; onChange: (text: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // After the press that made it has done with the focus (it would take it back to the editor).
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const f = MARK_FONTS.find((x) => x.id === (mark.font ?? 'sans')) ?? MARK_FONTS[0];
  const { line, pad } = textMetrics(mark.size);
  const b = markBox(mark.text ? mark : { ...mark, text: 'M' });
  return (
    <textarea
      ref={ref}
      data-over
      value={mark.text}
      wrap="off"
      spellCheck={false}
      aria-label="The words"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onDone();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute resize-none overflow-hidden rounded-[4px] border border-dashed border-white/90 outline-none shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
      style={{
        left: t.ox + (mark.x - at.x) * t.z,
        top: t.oy + (mark.y - at.y) * t.z,
        width: Math.max(b.w * t.z + 24, 60),
        height: Math.max(b.h * t.z, line * t.z) + 2,
        padding: pad * t.z,
        font: `${f.id === 'heavy' ? 400 : 600} ${mark.size * t.z}px ${f.css}`,
        lineHeight: `${line * t.z}px`,
        color: mark.color,
        background: mark.bg ?? 'transparent',
        caretColor: mark.color,
      }}
    />
  );
}

function MoreMenu({ onFit, onActual, onReset, canReset, busy }: { onFit: () => void; onActual: () => void; onReset: () => void; canReset: boolean; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton ref={ref} label="More" active={open} onClick={() => setOpen((x) => !x)}>
        <Ellipsis size={17} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={240}>
        <MenuItem icon={<Maximize size={14} />} onClick={() => (setOpen(false), onFit())}>
          Fit to screen
        </MenuItem>
        <MenuItem icon={<span className="text-[10px] font-semibold">1:1</span>} onClick={() => (setOpen(false), onActual())}>
          Actual size
        </MenuItem>
        <MenuItem icon={<RotateCcw size={14} />} disabled={!canReset || busy} onClick={() => (setOpen(false), onReset())}>
          Back to the original
        </MenuItem>
      </Popover>
    </>
  );
}

/** Save, with its options behind the arrow beside it: the size, the kind of file and its quality. */
function SaveButton({ label, disabled, onSave, options }: { label: string; disabled: boolean; onSave: () => void; options: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <div className="ml-1 flex shrink-0">
      <Button size="sm" variant="primary" className="rounded-r-none pr-2.5" disabled={disabled} onClick={onSave}>
        {label}
      </Button>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((x) => !x)}
        aria-label="How it is saved"
        title="How it is saved"
        className="flex h-8 items-center rounded-r-[10px] border-l border-black/15 bg-accent px-1.5 text-accent-fg transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-45"
      >
        <ChevronDown size={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={320} title="How it is saved" className="p-3">
        {options}
      </Popover>
    </div>
  );
}

function SaveOptions({
  w,
  h,
  full,
  onWidth,
  format,
  onFormat,
  quality,
  onQuality,
  says,
  copy,
  busy,
}: {
  w: number;
  h: number;
  full: { w: number; h: number };
  onWidth: (w: number | null) => void;
  format: ImageFormat;
  onFormat: (f: ImageFormat) => void;
  quality: number;
  onQuality: (q: number) => void;
  says: string;
  copy: { label: string; run: () => void } | null;
  busy: boolean;
}) {
  const num = (v: string, of: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? Math.min(8192, n) : of;
  };
  const input = 'h-8 w-full min-w-0 rounded-lg border border-line-2 bg-bg-1 px-2 text-[13px] tnum outline-none focus:border-accent/60';
  return (
    <div className="space-y-3.5">
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-fg-3">Size, in pixels</div>
        <div className="flex items-center gap-2">
          <input className={input} inputMode="numeric" aria-label="Width" value={w} onChange={(e) => onWidth(num(e.target.value, w) === full.w ? null : num(e.target.value, w))} />
          <span className="text-fg-3">×</span>
          <input className={input} inputMode="numeric" aria-label="Height" value={h} onChange={(e) => onWidth(Math.round((num(e.target.value, h) * full.w) / full.h))} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 0.75, 0.5, 0.25].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onWidth(k === 1 ? null : Math.max(1, Math.round(full.w * k)))}
              className={cx('h-7 rounded-lg border px-2 text-[12px]', Math.round(full.w * k) === w ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
            >
              {k === 1 ? 'Full size' : `${k * 100}%`}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[12px] font-medium text-fg-3">Kind of file</div>
        <div className="grid grid-cols-3 gap-1.5">
          {IMAGE_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFormat(f.id)}
              aria-pressed={format === f.id}
              className={cx('h-8 rounded-lg border text-[13px]', format === f.id ? 'border-accent bg-accent-soft text-fg' : 'border-line text-fg-2 hover:bg-bg-2')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-[12px] leading-snug text-fg-3">
          {format === 'png' ? 'PNG keeps every pixel and see-through parts; the file is larger.' : format === 'jpeg' ? 'JPEG suits photos and makes small files; see-through parts become white.' : 'WebP makes small files and keeps see-through parts.'}
        </p>
      </div>
      {format !== 'png' && <QualitySlider value={quality} onChange={onQuality} />}
      <p className="border-t border-line pt-2.5 text-[12px] leading-snug text-fg-3">{says}</p>
      {copy && (
        <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={copy.run}>
          {copy.label}
        </Button>
      )}
    </div>
  );
}

function QualitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center text-[12.5px]">
        <span className="flex-1 text-fg-2">Quality</span>
        <span className="tnum text-fg">{value}</span>
      </span>
      <input type="range" min={30} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Quality" className="mt-1 block h-5 w-full accent-[var(--accent)]" />
    </label>
  );
}

// The picture on its stage: on a quiet backdrop, a checkerboard behind its see-through parts, fitted to the room or
// zoomed (Ctrl/⌘ with the wheel, a pinch, the Zoom tool, the keys) and moved (the wheel, Space held, the Hand tool, the
// middle button, two fingers). The layers are put together small for the screen (at most 2048 pixels across, half that
// while something is dragged with adjustment layers in the picture), and, zoomed in, the part in view again at its real
// pixels once the view rests. Over it: the rulers and guides (dragged out of the rulers, dragged back to take them
// away), the grid, the selection's marching ants, what the tool in use shows (a marquee, a lasso, the crop's box with
// its thirds, a free transform's handles, the picked mark's outline, the gradient's line, the AI tools' paint, the clone
// stamp's source), the brush's ring at the pointer, and the box words are written in.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MARK_FONTS, straightenZoom, textMetrics, type Mark } from '@shared/mediaedit';
import { cx } from '../../../components/ui';
import { markBox } from '../render';
import { renderDoc } from './compose';
import { activeLayer, layerOf } from './doc';
import { PAINT_TOOLS, type PictureEd } from './editor';
import { doubleClick, handlesOf, HANDLES, pickedOutline, press, xformCorners, type Gesture, type Pt, type ViewT } from './interact';

const PREVIEW = 2048;
const FAST = 1024;
const MIN_Z = 0.01;
const MAX_Z = 64;
const RULER = 18;

export const useEd = (ed: PictureEd) => useSyncExternalStore(ed.subscribe.bind(ed), () => ed.version);

/** The app's colours as the canvas needs them (read from the page, so both themes follow). */
function themeColors() {
  const s = getComputedStyle(document.documentElement);
  const v = (k: string, f: string) => s.getPropertyValue(k).trim() || f;
  return { c1: v('--bg-2', '#1b1f27'), c2: v('--bg-3', '#242a34'), line: v('--line-2', '#3a4150'), fg3: v('--fg-3', '#8f99ab'), accent: v('--accent', '#8aa8ff'), panel: v('--bg-1', '#13161c') };
}

export function View({ ed, onCursor, onZoom, bigHeal, className }: { ed: PictureEd; onCursor?: (p: Pt | null, color: string | null) => void; onZoom?: (z: number) => void; bigHeal?: Parameters<PictureEd['endStroke']>[0]; className?: string }) {
  useEd(ed);
  const box = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const topRuler = useRef<HTMLCanvasElement>(null);
  const leftRuler = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<{ z: number | 'fit'; ox: number; oy: number }>({ z: 'fit', ox: 0, oy: 0 });
  const [ring, setRing] = useState<Pt | null>(null);
  const [gestureOn, setGestureOn] = useState(false);
  const doc = ed.doc;
  const r = ed.rulers ? RULER : 0;
  const W = Math.max(0, size.w - r);
  const H = Math.max(0, size.h - r);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const f = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    f();
    const ro = new ResizeObserver(f);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = W < 500 ? 12 : 32;
  const fitZ = W && H ? Math.max(MIN_Z, Math.min((W - pad * 2) / doc.w, (H - pad * 2) / doc.h, 8)) : 1;
  const t: ViewT = view.z === 'fit' ? { z: fitZ, ox: r + (W - doc.w * fitZ) / 2, oy: r + (H - doc.h * fitZ) / 2 } : { z: view.z, ox: view.ox, oy: view.oy };
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => onZoom?.(t.z), [t.z, onZoom]);
  // A new canvas size is fitted again.
  const shape = `${doc.w}x${doc.h}`;
  useEffect(() => setView({ z: 'fit', ox: 0, oy: 0 }), [shape]);

  const zoomAt = useCallback((f: number, sx: number, sy: number) => {
    const c = tRef.current;
    const z = Math.max(MIN_Z, Math.min(MAX_Z, c.z * f));
    setView({ z, ox: sx - ((sx - c.ox) / c.z) * z, oy: sy - ((sy - c.oy) / c.z) * z });
  }, []);
  useEffect(() => {
    ed.view = {
      fit: () => setView({ z: 'fit', ox: 0, oy: 0 }),
      actual: () => {
        const c = tRef.current;
        zoomAt(1 / c.z, r + W / 2, r + H / 2);
      },
      zoomBy: (f, at) => zoomAt(f, at?.[0] ?? r + W / 2, at?.[1] ?? r + H / 2),
      zoom: () => tRef.current.z,
    };
  }, [ed, zoomAt, W, H, r]);

  // ---- the picture, put together --------------------------------------------------------------------------------
  const fx = doc.layers.some((l) => l.visible && (l.kind === 'adjust' || (l.kind === 'mark' && (l.mark.type === 'blur' || l.mark.type === 'pixelate'))));
  const fast = fx && (gestureOn || ed.dragging);
  const k = Math.min(1, (fast ? FAST : PREVIEW) / Math.max(doc.w, doc.h));
  const comp = useRef<{ pv: number; k: number; c: HTMLCanvasElement } | null>(null);
  const detail = useRef<{ pv: number; k: number; r: { x: number; y: number; w: number; h: number }; c: HTMLCanvasElement } | null>(null);
  const [, redrawn] = useState(0);
  if (!comp.current || comp.current.pv !== ed.pv || comp.current.k !== k) {
    comp.current = { pv: ed.pv, k, c: renderDoc(doc, { region: { x: 0, y: 0, w: doc.w, h: doc.h }, scale: k, live: ed.live, out: comp.current?.k === k ? comp.current.c : undefined }) };
  }
  // Zoomed in, the part in view at its real pixels, once the view rests.
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  useEffect(() => {
    if (fast || ed.comparing || ed.crop || t.z * dpr <= k * 1.15) return;
    const id = window.setTimeout(() => {
      const c = tRef.current;
      const x0 = Math.max(0, Math.floor((r - c.ox) / c.z));
      const y0 = Math.max(0, Math.floor((r - c.oy) / c.z));
      const x1 = Math.min(doc.w, Math.ceil((r + W - c.ox) / c.z));
      const y1 = Math.min(doc.h, Math.ceil((r + H - c.oy) / c.z));
      if (x1 <= x0 || y1 <= y0) return;
      let kd = Math.min(1, c.z * dpr);
      const n = (x1 - x0) * (y1 - y0) * kd * kd;
      if (n > 8e6) kd *= Math.sqrt(8e6 / n);
      const reg = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      detail.current = { pv: ed.pv, k: kd, r: reg, c: renderDoc(ed.doc, { region: reg, scale: kd, live: ed.live }) };
      redrawn((n2) => n2 + 1);
    }, 140);
    return () => window.clearTimeout(id);
  }, [ed.pv, t.z, t.ox, t.oy, W, H, fast, ed.comparing, ed.crop, k]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- drawing ------------------------------------------------------------------------------------------------------
  const colors = useRef<ReturnType<typeof themeColors> | null>(null);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  useEffect(() => {
    colors.current = themeColors();
  }, [dark]);

  useEffect(() => {
    const c = base.current;
    if (!c || !size.w || !size.h) return;
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
    }
    const g = c.getContext('2d')!;
    const th = (colors.current ??= themeColors());
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fw = doc.w * t.z;
    const fh = doc.h * t.z;
    g.save();
    if (ed.crop?.angle) {
      // The straightening shown: the picture turned about its middle, larger so no corner is empty.
      const s = straightenZoom(doc.w, doc.h, ed.crop.angle);
      g.beginPath();
      g.rect(t.ox, t.oy, fw, fh);
      g.clip();
      g.translate(t.ox + fw / 2, t.oy + fh / 2);
      g.rotate((ed.crop.angle * Math.PI) / 180);
      g.scale(s, s);
      g.translate(-(t.ox + fw / 2), -(t.oy + fh / 2));
    }
    // The checkerboard behind see-through parts.
    const cell = 8;
    g.fillStyle = th.c1;
    g.fillRect(t.ox, t.oy, fw, fh);
    g.fillStyle = th.c2;
    g.beginPath();
    const x0 = Math.max(t.ox, 0);
    const y0 = Math.max(t.oy, 0);
    const x1 = Math.min(t.ox + fw, size.w);
    const y1 = Math.min(t.oy + fh, size.h);
    for (let y = y0 - ((y0 - t.oy) % cell); y < y1; y += cell)
      for (let x = x0 - ((x0 - t.ox) % cell) + ((Math.floor((y - t.oy) / cell) % 2) * cell); x < x1; x += cell * 2) g.rect(x, y, Math.min(cell, x1 - x), Math.min(cell, y1 - y));
    g.fill();
    const src = ed.comparing ? ed.original : comp.current!.c;
    g.imageSmoothingEnabled = (src.width / doc.w) * t.z * dpr < 2.5;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, t.ox, t.oy, fw, fh);
    const dt = detail.current;
    if (dt && dt.pv === ed.pv && !ed.comparing && !ed.crop && t.z * dpr > k * 1.15) {
      g.imageSmoothingEnabled = dt.k * 1.5 > t.z * dpr ? true : t.z * dpr / dt.k < 3;
      g.drawImage(dt.c, t.ox + dt.r.x * t.z, t.oy + dt.r.y * t.z, dt.r.w * t.z, dt.r.h * t.z);
    }
    g.restore();
    // A faint line round the canvas, so a see-through picture's edge shows.
    g.strokeStyle = th.line;
    g.lineWidth = 1;
    g.strokeRect(Math.round(t.ox) - 0.5, Math.round(t.oy) - 0.5, Math.round(fw) + 1, Math.round(fh) + 1);
  });

  // The overlay: drawn every frame while the ants march, else when something changes.
  const drawOver = useCallback(
    (time: number) => {
      const c = over.current;
      if (!c || !size.w) return;
      if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
        c.width = Math.round(size.w * dpr);
        c.height = Math.round(size.h * dpr);
      }
      const g = c.getContext('2d')!;
      const th = (colors.current ??= themeColors());
      const tt = tRef.current;
      const d = ed.doc;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, c.width, c.height);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const S = (x: number, y: number): Pt => [x * tt.z + tt.ox, y * tt.z + tt.oy];
      const fw = d.w * tt.z;
      const fh = d.h * tt.z;
      if (ed.grid && !ed.comparing) {
        // Lines at a round number of pixels, about 40 screen pixels apart or more.
        const step = niceStep(40 / tt.z);
        g.strokeStyle = 'rgba(127,127,127,0.28)';
        g.lineWidth = 1;
        g.beginPath();
        for (let x = step; x < d.w; x += step) {
          const sx = Math.round(tt.ox + x * tt.z) + 0.5;
          g.moveTo(sx, tt.oy);
          g.lineTo(sx, tt.oy + fh);
        }
        for (let y = step; y < d.h; y += step) {
          const sy = Math.round(tt.oy + y * tt.z) + 0.5;
          g.moveTo(tt.ox, sy);
          g.lineTo(tt.ox + fw, sy);
        }
        g.stroke();
      }
      if (ed.showGuides) {
        g.strokeStyle = th.accent;
        g.lineWidth = 1;
        g.beginPath();
        for (const x of ed.guides.v) {
          const sx = Math.round(tt.ox + x * tt.z) + 0.5;
          g.moveTo(sx, 0);
          g.lineTo(sx, size.h);
        }
        for (const y of ed.guides.h) {
          const sy = Math.round(tt.oy + y * tt.z) + 0.5;
          g.moveTo(0, sy);
          g.lineTo(size.w, sy);
        }
        g.stroke();
      }
      // The selection's marching ants.
      if (d.sel && !ed.comparing) {
        const step = Math.max(1, Math.floor(1 / tt.z / 1.5));
        const lines = ed.outline(step);
        g.lineWidth = 1;
        g.beginPath();
        for (const p of lines) {
          const [ax, ay] = S(p[0], p[1]);
          g.moveTo(Math.round(ax) + 0.5, Math.round(ay) + 0.5);
          for (let i = 2; i + 1 < p.length; i += 2) {
            const [bx, by] = S(p[i], p[i + 1]);
            g.lineTo(Math.round(bx) + 0.5, Math.round(by) + 0.5);
          }
        }
        g.strokeStyle = '#ffffff';
        g.setLineDash([]);
        g.stroke();
        g.strokeStyle = '#000000';
        g.setLineDash([4, 4]);
        g.lineDashOffset = -Math.floor(time / 80) % 8;
        g.stroke();
        g.setLineDash([]);
      }
      const o = ed.overlay;
      const dashed = (draw: () => void) => {
        g.lineWidth = 1;
        g.setLineDash([]);
        g.strokeStyle = '#ffffff';
        draw();
        g.stroke();
        g.setLineDash([4, 4]);
        g.strokeStyle = '#000000';
        draw();
        g.stroke();
        g.setLineDash([]);
      };
      if (o.marquee) {
        const [ax, ay] = S(o.marquee.box.x, o.marquee.box.y);
        const w = o.marquee.box.w * tt.z;
        const h = o.marquee.box.h * tt.z;
        dashed(() => {
          g.beginPath();
          if (o.marquee!.kind === 'rect') g.rect(Math.round(ax) + 0.5, Math.round(ay) + 0.5, Math.round(w), Math.round(h));
          else g.ellipse(ax + w / 2, ay + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
        });
      }
      const path = (pts: number[], close: boolean, extra?: Pt) => () => {
        g.beginPath();
        for (let i = 0; i + 1 < pts.length; i += 2) {
          const [x, y] = S(pts[i], pts[i + 1]);
          if (i) g.lineTo(x, y);
          else g.moveTo(x, y);
        }
        if (extra) g.lineTo(...S(extra[0], extra[1]));
        if (close) g.closePath();
      };
      if (o.lasso) dashed(path(o.lasso, false));
      if (o.poly) {
        dashed(path(o.poly.pts, false, o.poly.at));
        const [fx0, fy0] = S(o.poly.pts[0], o.poly.pts[1]);
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#000000';
        g.beginPath();
        g.arc(fx0, fy0, 4, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      if (o.gradient) {
        const a = S(...o.gradient.a);
        const b = S(...o.gradient.b);
        dashed(() => {
          g.beginPath();
          g.moveTo(...a);
          g.lineTo(...b);
        });
      }
      if (o.cloneAt) {
        const [x, y] = S(...o.cloneAt);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - 8, y);
        g.lineTo(x + 8, y);
        g.moveTo(x, y - 8);
        g.lineTo(x, y + 8);
        g.stroke();
      }
      // The AI tools' paint: what will change, in pink.
      if (ed.aiStrokes.length) {
        g.save();
        g.globalAlpha = 0.55;
        g.strokeStyle = '#ec4899';
        g.fillStyle = '#ec4899';
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const s of ed.aiStrokes) {
          g.lineWidth = s.size * tt.z;
          g.beginPath();
          if (s.pts.length <= 2) {
            const [x, y] = S(s.pts[0], s.pts[1]);
            g.arc(x, y, (s.size * tt.z) / 2, 0, Math.PI * 2);
            g.fill();
            continue;
          }
          path(s.pts, false)();
          g.stroke();
        }
        g.restore();
      }
      // The crop: outside it dimmed, its box, its thirds and handles.
      if (ed.crop) {
        const b = ed.crop.box;
        const [ax, ay] = S(b.x, b.y);
        const w = b.w * tt.z;
        const h = b.h * tt.z;
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.beginPath();
        g.rect(tt.ox, tt.oy, fw, fh);
        g.rect(ax + w, ay, -w, h);
        g.fill('evenodd');
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = 1;
        g.strokeRect(Math.round(ax) + 0.5, Math.round(ay) + 0.5, Math.round(w), Math.round(h));
        g.strokeStyle = 'rgba(255,255,255,0.4)';
        g.beginPath();
        for (const f of [1 / 3, 2 / 3]) {
          g.moveTo(ax + w * f, ay);
          g.lineTo(ax + w * f, ay + h);
          g.moveTo(ax, ay + h * f);
          g.lineTo(ax + w, ay + h * f);
        }
        g.stroke();
        const hs = handlesOf({ x: ax, y: ay, w, h });
        g.fillStyle = '#ffffff';
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        for (const kk of HANDLES) {
          const [x, y] = hs[kk];
          const corner = kk.length === 2;
          g.beginPath();
          g.rect(x - (corner ? 5 : kk === 'n' || kk === 's' ? 9 : 2.5), y - (corner ? 5 : kk === 'e' || kk === 'w' ? 9 : 2.5), corner ? 10 : kk === 'n' || kk === 's' ? 18 : 5, corner ? 10 : kk === 'e' || kk === 'w' ? 18 : 5);
          g.fill();
          g.stroke();
        }
      }
      // A free transform's box and handles; a picked mark's outline.
      const cs = xformCorners(ed) ?? pickedOutline(ed);
      if (cs && !ed.comparing && !ed.writing) {
        const sc = cs.map((p) => S(p[0], p[1]));
        g.strokeStyle = th.accent;
        g.lineWidth = 1.25;
        g.setLineDash(ed.xform ? [] : [5, 3]);
        g.beginPath();
        sc.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
        g.closePath();
        g.stroke();
        g.setLineDash([]);
        if (ed.xform) {
          const pts = [...sc, ...sc.map((p, i) => [(p[0] + sc[(i + 1) % 4][0]) / 2, (p[1] + sc[(i + 1) % 4][1]) / 2] as Pt)];
          g.fillStyle = '#ffffff';
          g.strokeStyle = th.accent;
          for (const [x, y] of pts) {
            g.beginPath();
            g.rect(x - 4, y - 4, 8, 8);
            g.fill();
            g.stroke();
          }
        }
      }
    },
    [ed, size.w, size.h, dpr],
  );
  useEffect(() => {
    let raf = 0;
    const loop = (time: number) => {
      drawOver(time);
      if (ed.doc.sel) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  // Rulers: canvas pixels along the top and the left.
  useEffect(() => {
    if (!ed.rulers) return;
    const th = (colors.current ??= themeColors());
    for (const [ref, across] of [
      [topRuler, true],
      [leftRuler, false],
    ] as const) {
      const c = ref.current;
      if (!c) continue;
      const len = across ? size.w : size.h;
      c.width = Math.round(len * dpr);
      c.height = Math.round(RULER * dpr);
      const g = c.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = th.panel;
      g.fillRect(0, 0, len, RULER);
      g.strokeStyle = th.line;
      g.fillStyle = th.fg3;
      g.font = '9px ui-sans-serif, system-ui, sans-serif';
      g.textBaseline = 'top';
      const step = niceStep(60 / t.z);
      const o = across ? t.ox : t.oy;
      const first = Math.floor(-o / t.z / step) * step;
      g.beginPath();
      for (let v = first; v * t.z + o < len; v += step / 5) {
        const s = Math.round(v * t.z + o) + 0.5;
        const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        g.moveTo(s, major ? 0 : RULER - 5);
        g.lineTo(s, RULER);
        if (major) g.fillText(String(Math.round(v)), s + 2, 2);
      }
      g.moveTo(0, RULER - 0.5);
      g.lineTo(len, RULER - 0.5);
      g.stroke();
    }
  });

  // ---- pointers ------------------------------------------------------------------------------------------------------
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<{ d: number; mx: number; my: number; z: number; ox: number; oy: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const guideDrag = useRef<{ axis: 'v' | 'h'; i: number } | null>(null);
  const space = useRef(false);
  const aiStroke = useRef<{ size: number; pts: number[] } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rc = box.current!.getBoundingClientRect();
    return [e.clientX - rc.left, e.clientY - rc.top];
  };
  const toDoc = (s: Pt): Pt => {
    const c = tRef.current;
    return [(s[0] - c.ox) / c.z, (s[1] - c.oy) / c.z];
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')) space.current = true;
    };
    const up = (e: KeyboardEvent) => void (e.code === 'Space' && (space.current = false));
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);

  /** A guide near the pointer (to drag it), when guides show. */
  const guideAt = (s: Pt): { axis: 'v' | 'h'; i: number } | null => {
    if (!ed.showGuides) return null;
    const c = tRef.current;
    const v = ed.guides.v.findIndex((x) => Math.abs(x * c.z + c.ox - s[0]) <= 3);
    if (v >= 0) return { axis: 'v', i: v };
    const h = ed.guides.h.findIndex((y) => Math.abs(y * c.z + c.oy - s[1]) <= 3);
    return h >= 0 ? { axis: 'h', i: h } : null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-over]')) return;
    const s = local(e);
    pointers.current.set(e.pointerId, s);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      // A second finger: what the first began stops, and the two zoom and move the picture.
      gesture.current = null;
      aiStroke.current = null;
      panning.current = null;
      const [a, b] = [...pointers.current.values()];
      const c = tRef.current;
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, z: c.z, ox: c.ox, oy: c.oy };
      return;
    }
    if (pointers.current.size > 2) return;
    const c = tRef.current;
    // Out of a ruler: a new guide.
    if (ed.rulers && (s[0] < RULER || s[1] < RULER)) {
      const axis = s[1] < RULER && s[0] >= RULER ? 'h' : 'v';
      const p = toDoc(s);
      const list = axis === 'v' ? ed.guides.v : ed.guides.h;
      list.push(Math.round(axis === 'v' ? p[0] : p[1]));
      ed.showGuides = true;
      guideDrag.current = { axis, i: list.length - 1 };
      ed.emit(false);
      return;
    }
    if (e.button === 1 || e.button === 2 || space.current) {
      panning.current = { x: s[0], y: s[1], ox: c.ox, oy: c.oy };
      return;
    }
    if (e.button !== 0) return;
    const g0 = (ed.tool === 'move' || ed.tool === 'hand') && guideAt(s);
    if (g0) {
      guideDrag.current = g0;
      return;
    }
    const p = toDoc(s);
    if (ed.aiPaint) {
      aiStroke.current = { size: ed.aiBrush / c.z, pts: [p[0], p[1]] };
      ed.aiStrokes = [...ed.aiStrokes, aiStroke.current];
      ed.emit(false);
      return;
    }
    const g = press(ed, p, e.nativeEvent, c, { bigHeal });
    if (g === 'pan') panning.current = { x: s[0], y: s[1], ox: c.ox, oy: c.oy };
    else if (g) {
      gesture.current = g;
      setGestureOn(true);
    }
  };

  const lastCursor = useRef(0);
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = local(e);
    const p = toDoc(s);
    if (e.pointerType === 'mouse') setRing(s);
    const now = performance.now();
    if (onCursor && now - lastCursor.current > 50) {
      lastCursor.current = now;
      const inside = p[0] >= 0 && p[1] >= 0 && p[0] < ed.doc.w && p[1] < ed.doc.h;
      let color: string | null = null;
      if (inside && comp.current) {
        const cc = comp.current;
        const d = cc.c.getContext('2d')!.getImageData(Math.min(cc.c.width - 1, Math.floor(p[0] * cc.k)), Math.min(cc.c.height - 1, Math.floor(p[1] * cc.k)), 1, 1).data;
        if (d[3]) color = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      }
      onCursor(inside ? [Math.floor(p[0]), Math.floor(p[1])] : null, color);
    }
    if (ed.tool === 'lasso-poly' && ed.overlay.poly && !pointers.current.size) {
      ed.overlay = { ...ed.overlay, poly: { ...ed.overlay.poly, at: p } };
      drawOver(performance.now());
    }
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, s);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const pc = pinch.current;
      const z = Math.max(MIN_Z, Math.min(MAX_Z, (pc.z * Math.hypot(a[0] - b[0], a[1] - b[1])) / pc.d));
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      setView({ z, ox: mx - ((pc.mx - pc.ox) / pc.z) * z, oy: my - ((pc.my - pc.oy) / pc.z) * z });
      return;
    }
    if (guideDrag.current) {
      const gd = guideDrag.current;
      const list = gd.axis === 'v' ? ed.guides.v : ed.guides.h;
      list[gd.i] = Math.round(gd.axis === 'v' ? p[0] : p[1]);
      return drawOver(performance.now());
    }
    if (panning.current) {
      const pn = panning.current;
      const c = tRef.current;
      setView({ z: c.z, ox: pn.ox + s[0] - pn.x, oy: pn.oy + s[1] - pn.y });
      return;
    }
    if (aiStroke.current) {
      const co = e.nativeEvent.getCoalescedEvents?.();
      for (const ev of co?.length ? co : [e.nativeEvent]) {
        const q = toDoc(local(ev));
        aiStroke.current.pts.push(q[0], q[1]);
      }
      return drawOver(performance.now());
    }
    const g = gesture.current;
    if (!g) return;
    const co = e.nativeEvent.getCoalescedEvents?.();
    const evs = co?.length && PAINT_TOOLS.includes(ed.tool) ? co : [e.nativeEvent];
    for (const ev of evs) g.move(toDoc(local(ev)), ev);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const had = pointers.current.delete(e.pointerId);
    if (!had) return;
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    panning.current = null;
    const s = local(e);
    if (guideDrag.current) {
      const gd = guideDrag.current;
      guideDrag.current = null;
      // Dragged back onto the ruler, or off the stage: the guide goes.
      if (s[0] < RULER || s[1] < RULER || s[0] > size.w || s[1] > size.h) (gd.axis === 'v' ? ed.guides.v : ed.guides.h).splice(gd.i, 1);
      ed.emit(false);
      return;
    }
    if (aiStroke.current) {
      aiStroke.current = null;
      ed.emit(false);
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setGestureOn(false);
    g?.up(toDoc(s), e.nativeEvent);
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = local(e);
      if (e.ctrlKey || e.metaKey) {
        // A trackpad's pinch comes as the wheel with Ctrl.
        zoomAt(Math.exp(-e.deltaY * 0.01), s[0], s[1]);
        return;
      }
      const c = tRef.current;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      setView({ z: c.z, ox: c.ox - dx, oy: c.oy - dy });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  // ---- what shows over it -------------------------------------------------------------------------------------------
  const paintTool = PAINT_TOOLS.includes(ed.tool) && !ed.crop && !ed.xform;
  const brushPx = ed.aiPaint ? ed.aiBrush : paintTool ? ed.opts.size * t.z : 0;
  const cursor = ed.busy
    ? 'progress'
    : panning.current
      ? 'grabbing'
      : ed.tool === 'hand' || space.current
        ? 'grab'
        : ed.tool === 'zoom'
          ? 'zoom-in'
          : ed.tool === 'text'
            ? 'text'
            : ed.tool === 'move' && !ed.crop
              ? 'move'
              : brushPx > 3
                ? 'none'
                : 'crosshair';
  const writing = ed.writing ? layerOf(doc, ed.writing) : null;
  void activeLayer;
  return (
    <div
      ref={box}
      className={cx('touch-none overflow-hidden select-none', className)}
      style={{ cursor, background: 'var(--bg-1)' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        setRing(null);
        onCursor?.(null, null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-over]')) return;
        doubleClick(ed, toDoc(local(e)), tRef.current);
      }}
    >
      <canvas ref={base} className="absolute inset-0 h-full w-full" />
      <canvas ref={over} className="pointer-events-none absolute inset-0 h-full w-full" />
      {ed.rulers && (
        <>
          <canvas ref={topRuler} className="absolute top-0 left-0 h-[18px] w-full" />
          <canvas ref={leftRuler} className="absolute top-0 left-0 w-[18px] origin-top-left" style={{ height: RULER, width: size.h, transform: `translateX(${RULER}px) rotate(90deg)` }} />
          <span aria-hidden className="absolute top-0 left-0 h-[18px] w-[18px] border-r border-b border-line bg-bg-1" />
        </>
      )}
      {writing?.kind === 'mark' && writing.mark.type === 'text' && <Words key={writing.id} t={t} mark={writing.mark} onChange={(text) => ed.setMark(writing.id, { ...(writing.mark as Extract<Mark, { type: 'text' }>), text }, 'Add words', false)} onDone={() => ed.endWriting()} />}
      {ring && brushPx > 3 && !panning.current && <span aria-hidden className="pointer-events-none absolute rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,.55)]" style={{ left: ring[0], top: ring[1], width: brushPx, height: brushPx, transform: 'translate(-50%,-50%)' }} />}
      {ed.comparing && <span className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/65 px-2.5 py-1 text-[12px] font-medium text-white">The original</span>}
    </div>
  );
}

/** A round step for lines and ticks: 1, 2 or 5 times a power of ten, at least `min`. */
function niceStep(min: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, min))));
  for (const m of [1, 2, 5, 10]) if (m * p >= min) return Math.max(1, m * p);
  return Math.max(1, 10 * p);
}

/** Words being written in place, over the picture: as large and in the colour they will be. */
function Words({ t, mark, onChange, onDone }: { t: ViewT; mark: Extract<Mark, { type: 'text' }>; onChange: (text: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // After the press that made it has done with the focus.
    const id = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
    return () => window.clearTimeout(id);
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
      className="absolute resize-none overflow-hidden rounded-[4px] border border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] outline-none"
      style={{
        left: t.ox + mark.x * t.z,
        top: t.oy + mark.y * t.z,
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

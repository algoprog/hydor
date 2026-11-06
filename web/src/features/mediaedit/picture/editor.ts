// The picture editor's working state and everything it does, apart from how it is shown: the history of documents
// (doc.ts), the tool in use and its settings, the foreground and background colours, what is being done with the pointer
// (a stroke, a marquee, a crop, a free transform), and every action of the menus and panels (layers, selections, edits,
// the picture's size and turns, adjustments, what the AI tools bring back, the file saved). The screen (React) listens
// and draws it again when it changes.
import { blendOp, type BlendMode } from '@shared/blend';
import { autoEnhance, histogramOf, moveMark, straightenZoom, type CropShape, type FontId, type LookSettings, type Mark } from '@shared/mediaedit';
import { blobData, loadImage } from '../render';
import { flattenDoc, layerBox, markBounds, renderDoc, type Live } from './compose';
import {
  activeLayer,
  adjustLayer,
  canvasOf,
  copyCanvas,
  freshName,
  History,
  indexOf,
  layerOf,
  markLayer,
  newLayerId,
  patchesOf,
  Pixels,
  rasterLayer,
  shrinkTo,
  tilesOf,
  withLayer,
  type AdjustLayer,
  type Doc,
  type Layer,
  type MarkLayer,
  type Patch,
  type RasterLayer,
  type Sel,
} from './doc';
import { allMask, combineMasks, featherMask, growMask, invertMask, maskBounds, maskBytes, maskOutline, moveMask, shrinkMask, trimMask, type Box, type Mask, type MaskOp } from './mask';
import { healFill } from './heal';
import { bucketFill, freeStrokeBuffer, gradientCanvas, layOn, selCanvas, Stroke, type GradientKind, type SelClip, type StrokeKind } from './paint';

export type ToolId =
  | 'move'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'lasso-poly'
  | 'wand'
  | 'crop'
  | 'eyedropper'
  | 'heal'
  | 'brush'
  | 'clone'
  | 'eraser'
  | 'gradient'
  | 'bucket'
  | 'dodge'
  | 'burn'
  | 'text'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'shape-line'
  | 'shape-arrow'
  | 'shape-pen'
  | 'shape-highlighter'
  | 'shape-emoji'
  | 'hide-blur'
  | 'hide-pixelate'
  | 'hand'
  | 'zoom';

export const PAINT_TOOLS: ToolId[] = ['brush', 'eraser', 'clone', 'heal', 'dodge', 'burn'];
export const SELECT_TOOLS: ToolId[] = ['marquee-rect', 'marquee-ellipse', 'lasso', 'lasso-poly', 'wand'];

/** Every tool's settings (the painting tools share their brush). */
export interface Opts {
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  exposure: number;
  tolerance: number;
  contiguous: boolean;
  sampleAll: boolean;
  selMode: MaskOp;
  feather: number;
  gradient: GradientKind;
  toClear: boolean;
  font: FontId;
  textSize: number;
  back: 'none' | 'dark' | 'light';
  width: number;
  fill: boolean;
  hiWidth: number;
  hideStrength: number;
  emoji: string;
  emojiSize: number;
  cropShape: CropShape;
  autoSelect: boolean;
}

export const TEXT_BACKS: Record<Opts['back'], string | undefined> = { none: undefined, dark: '#000000b3', light: '#ffffffd9' };

export function defaultOpts(long: number): Opts {
  return {
    size: Math.max(4, Math.round(long / 40)),
    hardness: 80,
    opacity: 100,
    flow: 100,
    exposure: 35,
    tolerance: 32,
    contiguous: true,
    sampleAll: false,
    selMode: 'replace',
    feather: 0,
    gradient: 'linear',
    toClear: false,
    font: 'sans',
    textSize: Math.max(14, Math.round(long / 16)),
    back: 'none',
    width: Math.max(2, Math.round(long / 220)),
    fill: false,
    hiWidth: Math.max(8, Math.round(long / 35)),
    hideStrength: 60,
    emoji: '👍',
    emojiSize: Math.max(24, Math.round(long / 7)),
    cropShape: 'free',
    autoSelect: false,
  };
}

/** What a layer's settings may be changed to (each kind takes its own). */
export interface LayerPatch {
  name?: string;
  visible?: boolean;
  opacity?: number;
  blend?: BlendMode;
  locked?: boolean;
  angle?: number;
  clip?: boolean;
  mask?: Sel | null;
}

/** The crop tool at work: the box kept, and how far the picture is straightened (degrees). */
export interface CropSession {
  box: Box;
  angle: number;
}

/** A free transform at work: the layer, its box when it began, and how it is moved, sized and turned about its middle. */
export interface XformSession {
  id: string;
  box: Box;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  angle: number;
}

/** What a tool shows over the picture while it works (the View draws it). */
export interface Overlay {
  marquee?: { kind: 'rect' | 'ellipse'; box: Box };
  lasso?: number[];
  /** A polygon lasso's points so far, and where the pointer is. */
  poly?: { pts: number[]; at?: [number, number] };
  gradient?: { a: [number, number]; b: [number, number] };
  /** The clone stamp's source, and where the brush is (to show where it takes from). */
  cloneAt?: [number, number];
}

/** A brush stroke over the picture for the AI tools (in the canvas's pixels). */
export interface AiStroke {
  size: number;
  pts: number[];
}

/** What the screen lends the editor: its zoom and where the picture is. */
export interface ViewApi {
  fit(): void;
  actual(): void;
  zoomBy(f: number, at?: [number, number]): void;
  zoom(): number;
}

const affineOf = (x: XformSession) => {
  const cx = x.box.x + x.box.w / 2;
  const cy = x.box.y + x.box.h / 2;
  const t = (x.angle * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // translate(cx + tx, cy + ty) · rotate · scale · translate(−cx, −cy)
  const a = c * x.sx;
  const b = s * x.sx;
  const cc = -s * x.sy;
  const d = c * x.sy;
  return [a, b, cc, d, cx + x.tx - (a * cx + cc * cy), cy + x.ty - (b * cx + d * cy)] as [number, number, number, number, number, number];
};
export { affineOf };

/** A mark moved by a map of points, its sizes and widths made `k` times larger. */
function mapMark(m: Mark, f: (x: number, y: number) => [number, number], k: number): Mark {
  const moved = moveMark(m, f);
  if (moved.type === 'text' || moved.type === 'emoji') return { ...moved, size: Math.max(4, Math.round(moved.size * k)) };
  if ('width' in moved) return { ...moved, width: Math.max(1, moved.width * k) };
  return moved;
}

/** A canvas made a size, smoothly (halved step by step when much smaller). */
export function resample(c: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  let src = c;
  if (W < c.width / 2 && H < c.height / 2) src = shrinkTo(c, Math.max(W / c.width, H / c.height) * 1.5);
  const out = canvasOf(W, H);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, W, H);
  return out;
}

/** A mask made another size (each new pixel from the nearest old one). */
function resampleMask(m: Mask, sx: number, sy: number): Mask {
  const w = Math.max(1, Math.round(m.w * sx));
  const h = Math.max(1, Math.round(m.h * sy));
  const out: Mask = { x: Math.round(m.x * sx), y: Math.round(m.y * sy), w, h, data: new Uint8Array(w * h) };
  for (let y = 0; y < h; y++) {
    const yy = Math.min(m.h - 1, Math.floor((y + 0.5) / sy));
    for (let x = 0; x < w; x++) out.data[y * w + x] = m.data[yy * m.w + Math.min(m.w - 1, Math.floor((x + 0.5) / sx))];
  }
  return out;
}

/** A mask's pixels moved by a map of whole pixels (a quarter turn, a flip) into a picture `W` × `H`. */
function mapMaskPixels(m: Mask, W: number, H: number, f: (x: number, y: number) => [number, number]): Mask {
  const corners = [f(m.x, m.y), f(m.x + m.w, m.y + m.h)];
  const x0 = Math.min(corners[0][0], corners[1][0]);
  const y0 = Math.min(corners[0][1], corners[1][1]);
  const w = Math.abs(corners[1][0] - corners[0][0]);
  const h = Math.abs(corners[1][1] - corners[0][1]);
  const out: Mask = { x: x0, y: y0, w, h, data: new Uint8Array(w * h) };
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const [X, Y] = f(m.x + x + 0.5, m.y + y + 0.5);
      const ix = Math.floor(X) - x0;
      const iy = Math.floor(Y) - y0;
      if (ix >= 0 && iy >= 0 && ix < w && iy < h) out.data[iy * w + ix] = m.data[y * m.w + x];
    }
  void W;
  void H;
  return out;
}

export class PictureEd {
  hist: History;
  tool: ToolId = 'move';
  opts: Opts;
  fg = '#000000';
  bg = '#ffffff';
  recent: string[] = [];
  live: Live = {};
  overlay: Overlay = {};
  crop: CropSession | null = null;
  xform: XformSession | null = null;
  /** The mark layer whose words are being written. */
  writing: string | null = null;
  aiStrokes: AiStroke[] = [];
  /** The AI tools' brush is out (Erase or Change with AI, painting where). */
  aiPaint = false;
  aiBrush = 44;
  /** Where the clone stamp takes from (Alt+click), and its offset once a stroke has begun. */
  cloneSrc: [number, number] | null = null;
  cloneOffset: [number, number] | null = null;
  guides: { v: number[]; h: number[] } = { v: [], h: [] };
  rulers = false;
  grid = false;
  showGuides = true;
  comparing = false;
  /** Something that takes a while is under way (an AI tool, a file): what it is. */
  busy: string | null = null;
  view: ViewApi | null = null;
  /** A panel to bring forward, and a count so asking twice does too. */
  focus: { panel: string; n: number } | null = null;
  /** A section of the Adjustments panel asked to show (Levels…, Curves…). */
  adjustAsk: { section: string; n: number } | null = null;
  /** The AI panel asked to start on something (from a menu): its mode. */
  aiAsk: { mode: string; n: number } | null = null;
  /** What was copied (Copy, Cut), with where it was on the canvas. */
  clip: { canvas: HTMLCanvasElement; x: number; y: number } | null = null;
  /** The last selection dropped, for Reselect. */
  lastSel: Sel | null = null;
  version = 0;
  /** Bumped when what the picture looks like changes (not what is drawn over it): the screen puts it together again. */
  pv = 0;
  private listeners = new Set<() => void>();
  private continuing: string | null = null;
  private selClipCache: { sel: Sel; clip: SelClip } | null = null;

  constructor(
    doc: Doc,
    /** The picture as it was opened, small: shown while Compare is held. */
    readonly original: HTMLCanvasElement,
    readonly toast: (text: string, error?: boolean) => void,
  ) {
    this.hist = new History(doc);
    this.opts = defaultOpts(Math.max(doc.w, doc.h));
  }

  get doc(): Doc {
    return this.hist.doc;
  }

  // ---- telling the screen -----------------------------------------------------------------------------------------

  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => void this.listeners.delete(f);
  }
  /** The screen told of a change; `picture` false when only what is drawn over the picture changed. */
  emit(picture = true) {
    if (picture) this.pv++;
    this.version++;
    for (const f of this.listeners) f();
  }
  /** A slider or a drag is going on (the screen works faster, smaller). */
  get dragging() {
    return !!this.continuing || !!this.stroke;
  }

  // ---- steps --------------------------------------------------------------------------------------------------------

  /**
   * A change: a step of its own (`label` in History), or, while `done` is false, the same step changed again as a
   * slider or a drag goes on (one step when it ends).
   */
  change(label: string, doc: Doc, done = true, o: { patches?: Patch[]; bytes?: number } = {}) {
    if (this.continuing === label && !o.patches) this.hist.replace(doc);
    else this.hist.push(label, doc, o);
    this.continuing = done ? null : label;
    this.emit();
  }
  /** The step of a change that went on (a drag) is over. */
  settle() {
    this.continuing = null;
  }
  undo() {
    this.endSessions(false);
    if (!this.hist.canUndo) return;
    this.hist.goTo(this.hist.at - 1);
    this.continuing = null;
    this.emit();
  }
  redo() {
    this.endSessions(false);
    if (!this.hist.canRedo) return;
    this.hist.goTo(this.hist.at + 1);
    this.continuing = null;
    this.emit();
  }
  goTo(i: number) {
    this.endSessions(false);
    this.hist.goTo(i);
    this.continuing = null;
    this.emit();
  }
  /** Crops and transforms under way: applied (`apply`) or dropped; words being written: kept. */
  endSessions(apply: boolean) {
    if (this.crop) (apply ? this.commitCrop() : this.cancelCrop());
    if (this.xform) (apply ? this.commitTransform() : this.cancelTransform());
    if (this.writing) this.endWriting();
    this.overlay = {};
  }

  // ---- tools and colours ----------------------------------------------------------------------------------------------

  setTool(t: ToolId) {
    if (t === this.tool) return;
    this.endSessions(true);
    this.tool = t;
    this.aiPaint = false;
    if (t === 'crop') this.startCrop();
    this.emit();
  }
  setOpts(p: Partial<Opts>) {
    this.opts = { ...this.opts, ...p };
    // A style changed with a mark layer picked: the mark takes it (as the Markup tools did).
    const l = activeLayer(this.doc);
    if (l?.kind === 'mark') {
      const m = this.styled(l.mark, p);
      if (m !== l.mark) this.change('Change the mark', withLayer(this.doc, l.id, (x) => ({ ...(x as MarkLayer), mark: m })), true);
    }
    this.emit();
  }
  private styled(m: Mark, p: Partial<Opts>): Mark {
    let out = m;
    if (p.width !== undefined && (out.type === 'pen' || out.type === 'arrow' || out.type === 'line' || out.type === 'rect' || out.type === 'ellipse')) out = { ...out, width: p.width };
    if (p.hiWidth !== undefined && out.type === 'highlighter') out = { ...out, width: p.hiWidth };
    if (p.fill !== undefined && (out.type === 'rect' || out.type === 'ellipse')) out = p.fill ? { ...out, fill: this.bg } : { ...out, fill: undefined };
    if (out.type === 'text') {
      if (p.font) out = { ...out, font: p.font };
      if (p.textSize !== undefined) out = { ...out, size: p.textSize };
      if (p.back !== undefined) out = { ...out, bg: TEXT_BACKS[p.back] };
    }
    if (p.hideStrength !== undefined && (out.type === 'blur' || out.type === 'pixelate')) out = { ...out, strength: p.hideStrength };
    if (out.type === 'emoji') {
      if (p.emoji) out = { ...out, emoji: p.emoji };
      if (p.emojiSize !== undefined) out = { ...out, size: p.emojiSize };
    }
    return out;
  }
  setFg(c: string, done = true) {
    this.fg = c;
    if (done) this.remember(c);
    const l = activeLayer(this.doc);
    if (l?.kind === 'mark' && 'color' in l.mark && l.mark.color !== c) this.change('Change the colour', withLayer(this.doc, l.id, (x) => ({ ...(x as MarkLayer), mark: { ...(x as MarkLayer).mark, color: c } as Mark })), done);
    this.emit();
  }
  setBg(c: string, done = true) {
    this.bg = c;
    if (done) this.remember(c);
    this.emit();
  }
  private remember(c: string) {
    this.recent = [c, ...this.recent.filter((x) => x !== c)].slice(0, 14);
  }
  swapColors() {
    [this.fg, this.bg] = [this.bg, this.fg];
    this.emit();
  }
  resetColors() {
    this.fg = '#000000';
    this.bg = '#ffffff';
    this.emit();
  }
  /** Brush size up or down a step ([ and ]). */
  brushStep(dir: 1 | -1) {
    const s = this.opts.size;
    const step = s < 10 ? 1 : s < 50 ? 5 : s < 200 ? 10 : 50;
    this.opts = { ...this.opts, size: Math.max(1, Math.min(2000, s + dir * step)) };
    this.emit();
  }
  showPanel(panel: string) {
    this.focus = { panel, n: (this.focus?.n ?? 0) + 1 };
    this.emit(false);
  }
  openAdjust(section: string) {
    this.adjustAsk = { section, n: (this.adjustAsk?.n ?? 0) + 1 };
    this.showPanel('adjust');
  }
  askAi(mode: string) {
    this.aiAsk = { mode, n: (this.aiAsk?.n ?? 0) + 1 };
    this.showPanel('ai');
  }

  // ---- layers -------------------------------------------------------------------------------------------------------

  pickLayer(id: string | null) {
    if (this.doc.active === id) return;
    this.endSessions(true);
    // Which layer is picked is not a step of its own: the step shown changes in place.
    this.hist.replace({ ...this.doc, active: id });
    this.emit(false);
  }
  /** A layer put in the stack above the picked one (or at the top), and picked. */
  addLayer(l: Layer, label: string, bytes = 0, below = false, done = true) {
    const d = this.doc;
    const i = d.active ? indexOf(d, d.active) : d.layers.length - 1;
    const at = below ? Math.max(0, i) : i + 1;
    const layers = [...d.layers.slice(0, at), l, ...d.layers.slice(at)];
    this.continuing = null;
    this.change(label, { ...d, layers, active: l.id }, done, { bytes });
  }
  newLayer() {
    const d = this.doc;
    const px = new Pixels(canvasOf(d.w, d.h));
    this.addLayer(rasterLayer(freshName(d, 'Layer'), px), 'New layer', px.bytes);
  }
  /** A new adjustment layer over the picked one, its mask the selection. */
  newAdjustment(look: LookSettings = {}, name = 'Adjustments') {
    const d = this.doc;
    const l = adjustLayer(freshName(d, name), look, d.sel);
    this.addLayer(l, 'New adjustment layer');
    return l;
  }
  /** A picture added as a layer, in the middle of the canvas (or at `at`), made smaller to fit when it is larger. */
  addPicture(c: HTMLCanvasElement, name: string, at?: { x: number; y: number }) {
    const d = this.doc;
    let src = c;
    const k = Math.min(1, (d.w * 0.95) / c.width, (d.h * 0.95) / c.height);
    if (k < 1 && !at) src = resample(c, c.width * k, c.height * k);
    const px = new Pixels(src);
    const x = at ? Math.round(at.x) : Math.round((d.w - src.width) / 2);
    const y = at ? Math.round(at.y) : Math.round((d.h - src.height) / 2);
    this.addLayer(rasterLayer(freshName(d, name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Picture'), px, x, y), 'Add a picture', px.bytes);
  }
  duplicateLayer() {
    const d = this.doc;
    const l = activeLayer(d);
    if (!l) return;
    if (d.sel && l.kind === 'raster') return this.layerViaCopy(false);
    const copy: Layer = l.kind === 'raster' ? { ...l, id: newLayerId(), name: `${l.name} copy`, px: new Pixels(copyCanvas(l.px.canvas)) } : { ...l, id: newLayerId(), name: `${l.name} copy` };
    this.addLayer(copy, 'Duplicate layer', copy.kind === 'raster' ? copy.px.bytes : 0);
  }
  /** The selected pixels of the picked layer (or of all, `merged`) as a canvas the size of the selection's box, and where it is. */
  private selectedPixels(merged: boolean): { canvas: HTMLCanvasElement; x: number; y: number } | null {
    const d = this.doc;
    const s = d.sel;
    const box = s ? { x: s.x, y: s.y, w: s.w, h: s.h } : { x: 0, y: 0, w: d.w, h: d.h };
    const c = canvasOf(box.w, box.h);
    const g = c.getContext('2d')!;
    if (merged) g.drawImage(renderDoc(d, { region: box, scale: 1 }), 0, 0);
    else {
      const l = activeLayer(d);
      if (!l) return null;
      if (l.kind === 'raster') g.drawImage(l.px.canvas, box.x - l.x, box.y - l.y, box.w, box.h, 0, 0, box.w, box.h);
      else g.drawImage(renderDoc(d, { region: box, scale: 1, only: l.id }), 0, 0);
    }
    if (s) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(selCanvas(s), 0, 0);
    }
    return { canvas: c, x: box.x, y: box.y };
  }
  layerViaCopy(cut: boolean) {
    const d = this.doc;
    const l = activeLayer(d);
    const got = this.selectedPixels(false);
    if (!got || !l) return;
    if (cut && l.kind === 'raster' && d.sel) this.clearSelected('Layer via cut');
    const px = new Pixels(got.canvas);
    this.addLayer(rasterLayer(freshName(this.doc, 'Layer'), px, got.x, got.y), cut ? 'Layer via cut' : 'Layer via copy', px.bytes);
  }
  deleteLayer(id?: string) {
    const d = this.doc;
    const l = layerOf(d, id ?? d.active);
    if (!l) return;
    if (d.layers.length === 1) return this.toast('A picture keeps at least one layer.');
    const i = indexOf(d, l.id);
    const layers = d.layers.filter((x) => x.id !== l.id);
    this.change('Delete layer', { ...d, layers, active: layers[Math.max(0, i - 1)]?.id ?? null });
  }
  setLayer(id: string, p: LayerPatch, label: string, done = true) {
    this.change(label, withLayer(this.doc, id, (l) => ({ ...l, ...(p as object) }) as Layer), done);
  }
  setLook(id: string, look: LookSettings, done: boolean, label = 'Adjust') {
    this.change(label, withLayer(this.doc, id, (l) => (l.kind === 'adjust' ? { ...l, look } : l)), done);
  }
  /** The layer at index `from` moved to `to` (bottom first). */
  moveLayer(from: number, to: number) {
    const d = this.doc;
    if (from === to || from < 0 || to < 0 || from >= d.layers.length || to >= d.layers.length) return;
    const layers = [...d.layers];
    const [l] = layers.splice(from, 1);
    layers.splice(to, 0, l);
    this.change('Arrange layers', { ...d, layers });
  }
  arrange(how: 'front' | 'forward' | 'backward' | 'back') {
    const d = this.doc;
    if (!d.active) return;
    const i = indexOf(d, d.active);
    const n = d.layers.length - 1;
    this.moveLayer(i, how === 'front' ? n : how === 'back' ? 0 : Math.max(0, Math.min(n, i + (how === 'forward' ? 1 : -1))));
  }
  /** The picked layer and the one under it as one pixel layer (as they look together). */
  mergeDown() {
    const d = this.doc;
    const i = d.active ? indexOf(d, d.active) : -1;
    if (i < 1) return this.toast('There is no layer under it to merge with.');
    const top = d.layers[i];
    const under = d.layers[i - 1];
    const both = { ...d, layers: [{ ...under, visible: true }, { ...top, visible: true }] } as Doc;
    const boxes = [layerBox(under), layerBox(top)].filter((b): b is Box => !!b);
    const all = boxes.length ? boxes.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x), h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y) })) : { x: 0, y: 0, w: d.w, h: d.h };
    const region = top.kind === 'adjust' || under.kind === 'adjust' ? { x: 0, y: 0, w: d.w, h: d.h } : all;
    const c = renderDoc(both, { region, scale: 1 });
    const px = new Pixels(c);
    const merged: RasterLayer = { ...rasterLayer(under.name, px, region.x, region.y), opacity: 1, blend: 'normal' };
    const layers = [...d.layers.slice(0, i - 1), merged, ...d.layers.slice(i + 1)];
    this.change('Merge down', { ...d, layers, active: merged.id }, true, { bytes: px.bytes });
  }
  mergeVisible() {
    const d = this.doc;
    const c = flattenDoc(d);
    const px = new Pixels(c);
    const merged = rasterLayer('Merged', px);
    const layers = [...d.layers.filter((l) => !l.visible), merged];
    this.change('Merge visible', { ...d, layers, active: merged.id }, true, { bytes: px.bytes });
  }
  flatten() {
    const d = this.doc;
    const c = flattenDoc(d);
    const px = new Pixels(c);
    const l = rasterLayer('Background', px);
    this.change('Flatten', { ...d, layers: [l], active: l.id }, true, { bytes: px.bytes });
  }

  // ---- selections ---------------------------------------------------------------------------------------------------

  setSel(m: Mask | null, label: string, op: MaskOp = 'replace') {
    const d = this.doc;
    const next = combineMasks(d.sel, m, op);
    if (!next && !d.sel) return this.emit();
    if (d.sel && !next) this.lastSel = d.sel;
    this.change(label, { ...d, sel: next ? trimMask(next) : null }, true, { bytes: maskBytes(next) });
  }
  selectAll() {
    this.setSel(allMask(this.doc.w, this.doc.h), 'Select all');
  }
  deselect() {
    if (this.doc.sel) this.setSel(null, 'Deselect');
  }
  reselect() {
    if (this.lastSel) this.setSel(this.lastSel, 'Reselect');
  }
  invertSelection() {
    const d = this.doc;
    this.setSel(invertMask(d.sel, d.w, d.h), 'Invert the selection');
  }
  featherSelection(r: number) {
    const d = this.doc;
    if (d.sel) this.setSel(featherMask(d.sel, r, d.w, d.h), 'Feather');
  }
  growSelection(r: number) {
    const d = this.doc;
    if (d.sel) this.setSel(growMask(d.sel, r, d.w, d.h), 'Grow');
  }
  shrinkSelection(r: number) {
    const d = this.doc;
    if (d.sel) this.setSel(shrinkMask(d.sel, r, d.w, d.h), 'Shrink');
  }
  /** The picked layer's pixels as the selection (where they are not see-through). */
  selectLayerPixels() {
    const d = this.doc;
    const l = activeLayer(d);
    if (!l || l.kind === 'adjust') return;
    const box = layerBox(l)!;
    const c = renderDoc(d, { region: box, scale: 1, only: l.id });
    const a = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data;
    const m: Mask = { x: Math.round(box.x), y: Math.round(box.y), w: c.width, h: c.height, data: new Uint8Array(c.width * c.height) };
    for (let i = 0; i < m.data.length; i++) m.data[i] = a[i * 4 + 3];
    this.setSel(this.inside(m), 'Select the layer’s pixels');
  }
  /** A mask cut to the canvas. */
  inside(m: Mask | null): Mask | null {
    if (!m) return null;
    const d = this.doc;
    return combineMasks(allMask(d.w, d.h), m, 'intersect');
  }
  /** The selection as a canvas, to keep paint inside it (made once per selection). */
  selClip(): SelClip | null {
    const s = this.doc.sel;
    if (!s) return null;
    if (this.selClipCache?.sel !== s) this.selClipCache = { sel: s, clip: { canvas: selCanvas(s), x: s.x, y: s.y } };
    return this.selClipCache.clip;
  }
  /** The selection's outline (for the marching ants), looked at as finely as the screen needs. */
  outlineCache: { sel: Sel; step: number; lines: number[][] } | null = null;
  outline(step: number): number[][] {
    const s = this.doc.sel;
    if (!s) return [];
    if (this.outlineCache?.sel !== s || this.outlineCache.step !== step) this.outlineCache = { sel: s, step, lines: maskOutline(s, step) };
    return this.outlineCache.lines;
  }

  // ---- editing pixels -------------------------------------------------------------------------------------------------

  /** The picked layer, when it is pixels (painting, filling and the AI tools need one). */
  rasterActive(): RasterLayer | null {
    const l = activeLayer(this.doc);
    return l?.kind === 'raster' ? l : null;
  }
  /** A pixel layer to paint on: the picked one, or a new one made above it (words and shapes are not painted on). */
  paintTarget(): RasterLayer | null {
    const l = activeLayer(this.doc);
    if (l?.locked) {
      this.toast('That layer is locked: unlock it in Layers to change it.');
      return null;
    }
    if (l?.kind === 'raster') return l;
    this.newLayer();
    return this.rasterActive();
  }
  /** The selected pixels of the picked layer cleared to see-through. */
  clearSelected(label = 'Clear') {
    const d = this.doc;
    const l = this.rasterActive();
    if (!l || !d.sel) return;
    if (l.locked) return this.toast('That layer is locked: unlock it in Layers to change it.');
    const s = d.sel;
    const area = { x: s.x - l.x, y: s.y - l.y, w: s.w, h: s.h };
    const patches = patchesOf(l.px, tilesOf(area, l.px.w, l.px.h));
    const g = l.px.ctx();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.selClip()!.canvas, area.x, area.y);
    g.restore();
    l.px.touch(area);
    this.change(label, d, true, { patches });
  }
  /** Delete: the selected pixels cleared, or with nothing selected the picked mark (or adjustment) taken away. */
  deleteKey() {
    const d = this.doc;
    if (d.sel) return this.clearSelected();
    const l = activeLayer(d);
    if (l && l.kind !== 'raster') this.deleteLayer(l.id);
  }
  /** The selection (or the whole layer) filled with a colour. */
  fill(color: string, alpha = 1) {
    const l = this.paintTarget();
    if (!l) return;
    const d = this.doc;
    const c = canvasOf(l.px.w, l.px.h);
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    const clip = this.selClip();
    let area: Box = { x: 0, y: 0, w: l.px.w, h: l.px.h };
    if (clip) {
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(clip.canvas, clip.x - l.x, clip.y - l.y);
      const x0 = Math.max(0, clip.x - l.x);
      const y0 = Math.max(0, clip.y - l.y);
      area = { x: x0, y: y0, w: Math.min(l.px.w, clip.x - l.x + clip.canvas.width) - x0, h: Math.min(l.px.h, clip.y - l.y + clip.canvas.height) - y0 };
      if (area.w <= 0 || area.h <= 0) return;
    }
    const patches = layOn(l, c, alpha, area);
    this.change('Fill', this.doc === d ? d : this.doc, true, { patches });
  }
  /** The selection's outline drawn in a colour, `width` pixels wide. */
  strokeSelection(width: number, color: string) {
    const d = this.doc;
    if (!d.sel) return;
    const l = this.paintTarget();
    if (!l) return;
    const lines = maskOutline(d.sel);
    const c = canvasOf(l.px.w, l.px.h);
    const g = c.getContext('2d')!;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineJoin = 'round';
    g.beginPath();
    for (const p of lines) {
      g.moveTo(p[0] - l.x, p[1] - l.y);
      for (let i = 2; i + 1 < p.length; i += 2) g.lineTo(p[i] - l.x, p[i + 1] - l.y);
      g.closePath();
    }
    g.stroke();
    const s = d.sel;
    const area = { x: s.x - l.x - width, y: s.y - l.y - width, w: s.w + 2 * width, h: s.h + 2 * width };
    const patches = layOn(l, c, 1, { x: Math.max(0, area.x), y: Math.max(0, area.y), w: Math.min(l.px.w, area.x + area.w) - Math.max(0, area.x), h: Math.min(l.px.h, area.y + area.h) - Math.max(0, area.y) });
    this.change('Stroke', this.doc, true, { patches });
  }
  copy(merged = false) {
    const got = this.selectedPixels(merged);
    if (!got) return;
    this.clip = got;
    // The system's clipboard too, where the browser lets a page write a picture to it.
    got.canvas.toBlob((b) => {
      if (!b || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return;
      navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => {});
    }, 'image/png');
    this.toast(merged ? 'Copied what shows' : 'Copied');
  }
  cut() {
    if (!this.doc.sel) return this.toast('Select a part first: Cut takes out what is selected.');
    this.copy(false);
    this.clearSelected('Cut');
  }
  /** What was copied here, as a new layer where it was. */
  pasteHere() {
    const c = this.clip;
    if (!c) return this.toast('Nothing has been copied yet: copy a part of a picture, or a picture from elsewhere.');
    const px = new Pixels(copyCanvas(c.canvas));
    this.addLayer(rasterLayer(freshName(this.doc, 'Layer'), px, c.x, c.y), 'Paste', px.bytes);
  }

  // ---- strokes (the View drives them) ---------------------------------------------------------------------------------

  stroke: Stroke | null = null;
  beginStroke(kind: StrokeKind, x: number, y: number): boolean {
    const l = this.paintTarget();
    if (!l) return false;
    let source: { canvas: HTMLCanvasElement; dx: number; dy: number } | undefined;
    if (kind === 'clone') {
      if (!this.cloneSrc) {
        this.toast('Alt+click where to copy from first.');
        return false;
      }
      // The offset is set by the first stroke after the source is picked, then kept (aligned).
      const off = this.cloneOffset ?? [this.cloneSrc[0] - x, this.cloneSrc[1] - y];
      this.cloneOffset = off;
      const src = this.opts.sampleAll ? copyCanvas(flattenDoc(this.doc)) : copyCanvas(l.px.canvas);
      // In the layer's pixels: the flattened picture is in the canvas's.
      source = this.opts.sampleAll ? { canvas: src, dx: off[0] + l.x, dy: off[1] + l.y } : { canvas: src, dx: off[0], dy: off[1] };
    }
    const size = this.opts.size;
    this.stroke = new Stroke(kind, l, { size, hardness: this.opts.hardness, opacity: kind === 'dodge' || kind === 'burn' ? this.opts.exposure : kind === 'heal' ? 100 : this.opts.opacity, flow: this.opts.flow, color: this.fg }, this.selClip(), source);
    this.stroke.to(x, y);
    this.live = { ...this.live, stroke: this.stroke.live };
    this.emit();
    return true;
  }
  strokeTo(x: number, y: number) {
    if (!this.stroke) return;
    this.stroke.to(x, y);
    if (this.stroke.kind === 'clone' && this.cloneOffset) this.overlay = { ...this.overlay, cloneAt: [x + this.cloneOffset[0], y + this.cloneOffset[1]] };
    this.emit();
  }
  /** The stroke laid down: a step. A large area to heal goes to the eraser on this computer instead (`bigHeal`). */
  endStroke(bigHeal?: (layer: RasterLayer, hole: Mask) => void) {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.live = { ...this.live, stroke: undefined };
    this.overlay = { ...this.overlay, cloneAt: undefined };
    const label = { brush: 'Brush', eraser: 'Eraser', clone: 'Clone stamp', dodge: 'Dodge', burn: 'Burn', heal: 'Spot healing' }[s.kind];
    if (s.kind === 'heal' && bigHeal && s.bbox && s.area > 160 * 160) {
      const b = s.bbox;
      const hole = { x: b.x + s.layer.x, y: b.y + s.layer.y, w: b.w, h: b.h, data: s.holeIn(b) };
      s.clear();
      this.emit();
      return bigHeal(s.layer, hole);
    }
    const patches = s.commit();
    if (patches.length) this.change(label, this.doc, true, { patches });
    else this.emit();
    if (this.doc.w * this.doc.h > 24_000_000) freeStrokeBuffer();
  }

  /** The gradient dragged from `a` to `b`: shown (`done` false) or laid on the layer. */
  gradientTo(a: [number, number], b: [number, number], done: boolean) {
    const l = done ? this.rasterActive() : this.paintTarget();
    if (!l) return;
    const to = this.opts.toClear ? `${this.fg.slice(0, 7)}00` : this.bg;
    const c = gradientCanvas(l, this.opts.gradient, a, b, this.fg, to, this.selClip());
    if (!done) {
      this.overlay = { ...this.overlay, gradient: { a, b } };
      this.live = { ...this.live, stroke: { layer: l.id, canvas: c, op: 'source-over', alpha: this.opts.opacity / 100 } };
      return this.emit();
    }
    this.overlay = { ...this.overlay, gradient: undefined };
    this.live = { ...this.live, stroke: undefined };
    const s = this.doc.sel;
    const area = s ? { x: Math.max(0, s.x - l.x), y: Math.max(0, s.y - l.y), w: 0, h: 0 } : { x: 0, y: 0, w: l.px.w, h: l.px.h };
    if (s) {
      area.w = Math.min(l.px.w, s.x - l.x + s.w) - area.x;
      area.h = Math.min(l.px.h, s.y - l.y + s.h) - area.y;
    }
    if (area.w <= 0 || area.h <= 0) return this.emit();
    const patches = layOn(l, c, this.opts.opacity / 100, area);
    this.change('Gradient', this.doc, true, { patches });
  }
  bucket(x: number, y: number) {
    const l = this.paintTarget();
    if (!l) return;
    const patches = bucketFill(l, x, y, { tolerance: this.opts.tolerance, contiguous: this.opts.contiguous, color: this.fg, alpha: this.opts.opacity / 100, sel: this.doc.sel });
    if (patches) this.change('Paint bucket', this.doc, true, { patches });
  }
  /** The colour at a point: what shows there (or the picked layer's own), as #rrggbb. */
  sample(x: number, y: number, layerOnly = false): string | null {
    const d = this.doc;
    if (x < 0 || y < 0 || x >= d.w || y >= d.h) return null;
    const l = activeLayer(d);
    const c = renderDoc(d, { region: { x: Math.floor(x), y: Math.floor(y), w: 1, h: 1 }, scale: 1, ...(layerOnly && l ? { only: l.id } : {}) });
    const p = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, 1, 1).data;
    if (p[3] === 0) return null;
    return `#${[p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // ---- marks ----------------------------------------------------------------------------------------------------------

  /** A new mark as a layer of its own (a shape, a line, words, an emoji, a hidden area). */
  addMark(m: Mark, label: string, name: string, done = true): MarkLayer {
    const l = markLayer(freshName(this.doc, name), m);
    this.addLayer(l, label, 0, false, done);
    return l;
  }
  setMark(id: string, m: Mark, label: string, done: boolean) {
    this.change(label, withLayer(this.doc, id, (l) => (l.kind === 'mark' ? { ...l, mark: m } : l)), done);
  }
  startWriting(id: string) {
    this.writing = id;
    this.live = { ...this.live, hide: id };
    this.emit();
  }
  /** Words written: kept, or (none) their layer taken away. */
  endWriting() {
    const id = this.writing;
    this.writing = null;
    this.live = { ...this.live, hide: undefined };
    const l = layerOf(this.doc, id);
    if (l?.kind === 'mark' && l.mark.type === 'text' && !l.mark.text.trim()) {
      const layers = this.doc.layers.filter((x) => x.id !== id);
      this.hist.replace({ ...this.doc, layers, active: layers[layers.length - 1]?.id ?? null });
    }
    this.settle();
    this.emit();
  }

  // ---- moving and transforming ---------------------------------------------------------------------------------------

  /** A layer moved by (dx, dy) from where it was (`from`: the document when the drag began). */
  moveLayerBy(from: Doc, id: string, dx: number, dy: number, done: boolean) {
    const l = layerOf(from, id);
    if (!l) return;
    if (l.locked) return this.toast('That layer is locked: unlock it in Layers to move it.');
    let next: Layer = l;
    if (l.kind === 'raster') next = { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) };
    else if (l.kind === 'mark') next = { ...l, mark: moveMark(l.mark, (x, y) => [Math.round((x + dx) * 10) / 10, Math.round((y + dy) * 10) / 10]) };
    else if (l.mask) next = { ...l, mask: moveMask(l.mask, dx, dy) };
    this.change('Move', { ...from, layers: from.layers.map((x) => (x.id === id ? next : x)) }, done);
  }
  startTransform() {
    const d = this.doc;
    const l = activeLayer(d);
    if (!l || l.kind === 'adjust') return this.toast('Pick a pixel, words or shape layer to transform it.');
    if (l.locked) return this.toast('That layer is locked: unlock it in Layers to transform it.');
    this.endSessions(true);
    const box = layerBox(l)!;
    this.xform = { id: l.id, box: l.kind === 'mark' ? markBoundsUnturned(l) : box, tx: 0, ty: 0, sx: 1, sy: 1, angle: 0 };
    this.live = { ...this.live, transform: { layer: l.id, m: affineOf(this.xform) } };
    this.tool = 'move';
    this.emit();
  }
  setTransform(p: Partial<XformSession>) {
    if (!this.xform) return;
    this.xform = { ...this.xform, ...p };
    this.live = { ...this.live, transform: { layer: this.xform.id, m: affineOf(this.xform) } };
    this.emit();
  }
  cancelTransform() {
    this.xform = null;
    this.live = { ...this.live, transform: undefined };
    this.emit();
  }
  commitTransform() {
    const x = this.xform;
    this.xform = null;
    this.live = { ...this.live, transform: undefined };
    if (!x) return;
    const d = this.doc;
    const l = layerOf(d, x.id);
    const m = affineOf(x);
    const same = !x.tx && !x.ty && x.sx === 1 && x.sy === 1 && !x.angle;
    if (!l || same) return this.emit();
    if (l.kind === 'raster') {
      const corners = [
        [l.x, l.y],
        [l.x + l.px.w, l.y],
        [l.x, l.y + l.px.h],
        [l.x + l.px.w, l.y + l.px.h],
      ].map(([X, Y]) => [m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]]);
      const x0 = Math.floor(Math.min(...corners.map((c) => c[0])));
      const y0 = Math.floor(Math.min(...corners.map((c) => c[1])));
      const x1 = Math.ceil(Math.max(...corners.map((c) => c[0])));
      const y1 = Math.ceil(Math.max(...corners.map((c) => c[1])));
      if ((x1 - x0) * (y1 - y0) > 60_000_000) return this.toast('That would make the layer too large.');
      const c = canvasOf(x1 - x0, y1 - y0);
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.setTransform(m[0], m[1], m[2], m[3], m[4] - x0, m[5] - y0);
      g.drawImage(l.px.canvas, l.x, l.y);
      const px = new Pixels(c);
      this.change('Free transform', withLayer(d, l.id, () => ({ ...l, px, x: x0, y: y0 })), true, { bytes: px.bytes });
      return;
    }
    if (l.kind === 'mark') {
      const cx = x.box.x + x.box.w / 2;
      const cy = x.box.y + x.box.h / 2;
      const k = Math.sqrt(Math.abs(x.sx * x.sy));
      // Sized about its middle and moved; the turn goes into its angle.
      const f = (X: number, Y: number): [number, number] => [cx + x.tx + (X - cx) * x.sx, cy + x.ty + (Y - cy) * x.sy];
      let mark = mapMark(l.mark, f, k);
      if (mark.type === 'text' || mark.type === 'emoji') {
        // Words and emoji are sized from their top left: put their middle where it went.
        const b0 = markBoundsUnturned({ ...l, mark: l.mark });
        const b1 = markBoundsUnturned({ ...l, mark });
        const [mx, my] = f(b0.x + b0.w / 2, b0.y + b0.h / 2);
        mark = moveMark(mark, (X, Y) => [X + mx - (b1.x + b1.w / 2), Y + my - (b1.y + b1.h / 2)]);
      }
      this.change('Free transform', withLayer(d, l.id, () => ({ ...l, mark, angle: Math.round((((l.angle + x.angle) % 360) + 360) % 360 * 10) / 10 })));
    }
  }

  // ---- the picture: crop, turns, sizes ------------------------------------------------------------------------------

  startCrop() {
    const d = this.doc;
    this.crop = { box: { x: 0, y: 0, w: d.w, h: d.h }, angle: 0 };
    this.emit();
  }
  setCrop(p: Partial<CropSession>) {
    if (!this.crop) return;
    this.crop = { ...this.crop, ...p };
    this.emit(false);
  }
  cancelCrop() {
    this.crop = null;
    this.emit();
  }
  commitCrop() {
    const c = this.crop;
    this.crop = null;
    if (!c) return;
    const d = this.doc;
    const b = { x: Math.round(c.box.x), y: Math.round(c.box.y), w: Math.max(1, Math.round(c.box.w)), h: Math.max(1, Math.round(c.box.h)) };
    if (!c.angle && b.x === 0 && b.y === 0 && b.w === d.w && b.h === d.h) return this.emit();
    let doc = d;
    let bytes = 0;
    if (c.angle) {
      const r = this.straightened(d, c.angle);
      doc = r.doc;
      bytes = r.bytes;
    }
    this.change(c.angle ? 'Straighten and crop' : 'Crop', this.shifted(doc, -b.x, -b.y, b.w, b.h), true, { bytes });
  }
  cropToSelection() {
    const s = this.doc.sel;
    const b = s ? maskBounds(s) : null;
    if (!b) return this.toast('Select a part first: the picture is cropped to it.');
    this.change('Crop to selection', { ...this.shifted(this.doc, -b.x, -b.y, b.w, b.h), sel: null });
  }
  /** Every layer moved by (dx, dy) on a canvas of a new size (the selection too). */
  private shifted(d: Doc, dx: number, dy: number, w: number, h: number): Doc {
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') return { ...l, x: l.x + dx, y: l.y + dy };
      if (l.kind === 'mark') return { ...l, mark: moveMark(l.mark, (x, y) => [x + dx, y + dy]) };
      return l.mask ? { ...l, mask: moveMask(l.mask, dx, dy) } : l;
    });
    const sel = d.sel ? trimMask(combineMasks(allMask(w, h), moveMask(d.sel, dx, dy), 'intersect') ?? allMask(1, 1)) : null;
    return { ...d, w, h, layers, sel: sel && maskBounds(sel) ? sel : null };
  }
  /** Every layer turned by `deg` about the canvas's middle and made larger so no corner is empty (the crop's straightening). */
  private straightened(d: Doc, deg: number): { doc: Doc; bytes: number } {
    const s = straightenZoom(d.w, d.h, deg);
    const t = (deg * Math.PI) / 180;
    const cx = d.w / 2;
    const cy = d.h / 2;
    const f = (x: number, y: number): [number, number] => [cx + ((x - cx) * Math.cos(t) - (y - cy) * Math.sin(t)) * s, cy + ((x - cx) * Math.sin(t) + (y - cy) * Math.cos(t)) * s];
    let bytes = 0;
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') {
        const c = canvasOf(d.w, d.h);
        const g = c.getContext('2d')!;
        g.imageSmoothingQuality = 'high';
        g.translate(cx, cy);
        g.rotate(t);
        g.scale(s, s);
        g.translate(-cx, -cy);
        g.drawImage(l.px.canvas, l.x, l.y);
        const px = new Pixels(c);
        bytes += px.bytes;
        return { ...l, px, x: 0, y: 0 };
      }
      if (l.kind === 'mark') return { ...l, mark: mapMark(l.mark, f, s), angle: l.angle + deg };
      return { ...l, mask: null };
    });
    return { doc: { ...d, layers, sel: null }, bytes };
  }
  /** The whole picture turned a quarter (clockwise: 1) or flipped: every layer with it, words staying upright. */
  turn(dir: 1 | -1) {
    const d = this.doc;
    const W = d.h;
    const H = d.w;
    const f = (x: number, y: number): [number, number] => (dir === 1 ? [d.h - y, x] : [y, d.w - x]);
    let bytes = 0;
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') {
        const c = canvasOf(l.px.h, l.px.w);
        const g = c.getContext('2d')!;
        if (dir === 1) g.setTransform(0, 1, -1, 0, l.px.h, 0);
        else g.setTransform(0, -1, 1, 0, 0, l.px.w);
        g.drawImage(l.px.canvas, 0, 0);
        const px = new Pixels(c);
        bytes += px.bytes;
        const [ax, ay] = f(l.x, l.y);
        const [bx, by] = f(l.x + l.px.w, l.y + l.px.h);
        return { ...l, px, x: Math.round(Math.min(ax, bx)), y: Math.round(Math.min(ay, by)) };
      }
      if (l.kind === 'mark') return { ...l, mark: uprightMoved(l, f) };
      return l.mask ? { ...l, mask: mapMaskPixels(l.mask, W, H, f) } : l;
    });
    this.change(dir === 1 ? 'Turn right' : 'Turn left', { ...d, w: W, h: H, layers, sel: null }, true, { bytes });
  }
  flip(axis: 'h' | 'v') {
    const d = this.doc;
    const f = (x: number, y: number): [number, number] => (axis === 'h' ? [d.w - x, y] : [x, d.h - y]);
    let bytes = 0;
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') {
        const c = canvasOf(l.px.w, l.px.h);
        const g = c.getContext('2d')!;
        if (axis === 'h') g.setTransform(-1, 0, 0, 1, l.px.w, 0);
        else g.setTransform(1, 0, 0, -1, 0, l.px.h);
        g.drawImage(l.px.canvas, 0, 0);
        const px = new Pixels(c);
        bytes += px.bytes;
        return { ...l, px, x: axis === 'h' ? d.w - l.x - l.px.w : l.x, y: axis === 'v' ? d.h - l.y - l.px.h : l.y };
      }
      if (l.kind === 'mark') return { ...l, mark: uprightMoved(l, f), angle: -l.angle };
      return l.mask ? { ...l, mask: mapMaskPixels(l.mask, d.w, d.h, f) } : l;
    });
    this.change(axis === 'h' ? 'Mirror' : 'Upside down', { ...d, layers, sel: null }, true, { bytes });
  }
  /** Image size: every layer made larger or smaller with the canvas. */
  imageSize(w: number, h: number) {
    const d = this.doc;
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    if (W === d.w && H === d.h) return;
    const sx = W / d.w;
    const sy = H / d.h;
    const k = Math.sqrt(sx * sy);
    let bytes = 0;
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') {
        const px = new Pixels(resample(l.px.canvas, l.px.w * sx, l.px.h * sy));
        bytes += px.bytes;
        return { ...l, px, x: Math.round(l.x * sx), y: Math.round(l.y * sy) };
      }
      if (l.kind === 'mark') return { ...l, mark: mapMark(l.mark, (x, y) => [x * sx, y * sy], k) };
      return l.mask ? { ...l, mask: resampleMask(l.mask, sx, sy) } : l;
    });
    this.change('Image size', { ...d, w: W, h: H, layers, sel: d.sel ? resampleMask(d.sel, sx, sy) : null }, true, { bytes });
  }
  /**
   * Canvas size: room added (or taken) on the sides `anchor` says (0, 1 or 2 across and down: where the picture stays),
   * see-through or filled with `color` (the bottom pixel layer made larger to hold it).
   */
  canvasSize(w: number, h: number, anchor: [number, number], color: string | null) {
    const d = this.doc;
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    if (W === d.w && H === d.h) return;
    const dx = Math.round(((W - d.w) * anchor[0]) / 2);
    const dy = Math.round(((H - d.h) * anchor[1]) / 2);
    let doc = this.shifted(d, dx, dy, W, H);
    let bytes = 0;
    if (color) {
      const c = canvasOf(W, H);
      const g = c.getContext('2d')!;
      g.fillStyle = color;
      g.fillRect(0, 0, W, H);
      const bottom = doc.layers[0];
      if (bottom?.kind === 'raster' && bottom.opacity === 1 && bottom.blend === 'normal') {
        g.drawImage(bottom.px.canvas, bottom.x, bottom.y);
        const px = new Pixels(c);
        doc = { ...doc, layers: [{ ...bottom, px, x: 0, y: 0 }, ...doc.layers.slice(1)] };
        bytes = px.bytes;
      } else {
        const px = new Pixels(c);
        doc = { ...doc, layers: [rasterLayer('Canvas colour', px), ...doc.layers] };
        bytes = px.bytes;
      }
    }
    this.change('Canvas size', doc, true, { bytes });
  }

  // ---- looks -----------------------------------------------------------------------------------------------------------

  /** The adjustment layer the Adjustments panel changes: the picked one, or none yet. */
  lookTarget(): AdjustLayer | null {
    const l = activeLayer(this.doc);
    return l?.kind === 'adjust' ? l : null;
  }
  /**
   * A look changed: on the picked adjustment layer, or on a new one made over the picked layer (its mask the selection),
   * as Photoshop's adjustment layers are.
   */
  look(f: (l: LookSettings) => LookSettings, done: boolean, label = 'Adjust') {
    const t = this.lookTarget();
    if (t) return this.setLook(t.id, f(t.look), done, label);
    // The first change makes the layer: one step with it.
    const d = this.doc;
    const n = adjustLayer(freshName(d, 'Adjustments'), f({}), d.sel);
    const i = d.active ? indexOf(d, d.active) : d.layers.length - 1;
    const layers = [...d.layers.slice(0, i + 1), n, ...d.layers.slice(i + 1)];
    this.continuing = null;
    this.change(label, { ...d, layers, active: n.id }, done);
  }
  autoEnhance() {
    const d = this.doc;
    const k = Math.min(1, 512 / Math.max(d.w, d.h));
    const c = renderDoc(d, { region: { x: 0, y: 0, w: d.w, h: d.h }, scale: k });
    const h = histogramOf(c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height).data);
    const e = autoEnhance(h);
    const t = adjustLayer(freshName(d, 'Auto enhance'), { adjust: { vibrance: e.vibrance, ...(e.contrast ? { contrast: e.contrast } : {}) }, ...(e.levels ? { levels: e.levels } : {}) }, d.sel);
    this.addLayer(t, 'Auto enhance');
  }

  /** A spot healed here: what is under `hole` (in the canvas's pixels) filled from around it, on a pixel layer. */
  healHere(layer: RasterLayer, hole: Mask) {
    const px = layer.px;
    const m = Math.max(8, Math.round(Math.max(hole.w, hole.h) / 2));
    const r = { x: Math.max(0, hole.x - layer.x - m), y: Math.max(0, hole.y - layer.y - m), w: 0, h: 0 };
    r.w = Math.min(px.w, hole.x - layer.x + hole.w + m) - r.x;
    r.h = Math.min(px.h, hole.y - layer.y + hole.h + m) - r.y;
    if (r.w <= 0 || r.h <= 0) return;
    const hd = new Uint8Array(r.w * r.h);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const hx = x + r.x + layer.x - hole.x;
        const hy = y + r.y + layer.y - hole.y;
        if (hx >= 0 && hy >= 0 && hx < hole.w && hy < hole.h) hd[y * r.w + x] = hole.data[hy * hole.w + hx];
      }
    const patches = patchesOf(px, tilesOf(r, px.w, px.h));
    const g = px.ctx();
    const d = g.getImageData(r.x, r.y, r.w, r.h);
    healFill(d.data, r.w, r.h, hd);
    g.putImageData(d, r.x, r.y);
    px.touch(r);
    this.change('Spot healing', this.doc, true, { patches });
  }
  /** A part of a pixel layer replaced (at its pixels `x`, `y`): one step. */
  putRegion(layer: RasterLayer, x: number, y: number, c: HTMLCanvasElement, label: string) {
    const r = { x, y, w: c.width, h: c.height };
    const patches = patchesOf(layer.px, tilesOf(r, layer.px.w, layer.px.h));
    const g = layer.px.ctx();
    g.clearRect(x, y, c.width, c.height);
    g.drawImage(c, x, y);
    layer.px.touch(r);
    this.change(label, this.doc, true, { patches });
  }

  // ---- what the AI tools bring back --------------------------------------------------------------------------------------

  /** A layer's pixels in place of what they were (a background taken out, something erased): one step. */
  replacePixels(id: string, c: HTMLCanvasElement, label: string) {
    const px = new Pixels(c);
    this.change(label, withLayer(this.doc, id, (l) => (l.kind === 'raster' ? { ...l, px } : l)), true, { bytes: px.bytes });
  }
  /** A picture the AI tools made, as a new layer over the picked one (at `at`, the canvas's top left by default). */
  addMade(c: HTMLCanvasElement, name: string, at = { x: 0, y: 0 }) {
    const px = new Pixels(c);
    this.addLayer(rasterLayer(freshName(this.doc, name), px, at.x, at.y), name, px.bytes);
  }
  /** The canvas made larger for an expansion (the picture at `place` in it), the new picture under everything. */
  expand(c: HTMLCanvasElement, place: { W: number; H: number; x: number; y: number }) {
    const d = this.shifted(this.doc, place.x, place.y, place.W, place.H);
    const px = new Pixels(c);
    const l = rasterLayer(freshName(d, 'Expanded with AI'), px);
    this.change('Expand the picture', { ...d, layers: [l, ...d.layers] }, true, { bytes: px.bytes });
  }
  /** The picture made `k` times larger: its pixel layers in `made` (by id), the rest made larger with it. */
  upscaled(k: number, made: Map<string, HTMLCanvasElement>) {
    const d = this.doc;
    let bytes = 0;
    const layers = d.layers.map((l): Layer => {
      if (l.kind === 'raster') {
        const c = made.get(l.id) ?? resample(l.px.canvas, l.px.w * k, l.px.h * k);
        const px = new Pixels(c);
        bytes += px.bytes;
        return { ...l, px, x: Math.round(l.x * k), y: Math.round(l.y * k) };
      }
      if (l.kind === 'mark') return { ...l, mark: mapMark(l.mark, (x, y) => [x * k, y * k], k) };
      return l.mask ? { ...l, mask: resampleMask(l.mask, k, k) } : l;
    });
    this.change(`Make it ${k}× larger`, { ...d, w: Math.round(d.w * k), h: Math.round(d.h * k), layers, sel: null }, true, { bytes });
  }

  // ---- the file -----------------------------------------------------------------------------------------------------

  /** The picture as a file: put together at its whole size, made the size asked, of its kind (a JPEG on white). */
  async file(format: 'png' | 'jpeg' | 'webp', quality: number, size?: { w: number; h: number }): Promise<{ blob: Blob; w: number; h: number; mime: string; made: 'png' | 'jpeg' | 'webp'; data: string }> {
    const d = this.doc;
    let c = flattenDoc(d);
    if (size && (size.w !== c.width || size.h !== c.height)) c = resample(c, size.w, size.h);
    if (format === 'jpeg') {
      const white = canvasOf(c.width, c.height);
      const g = white.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, white.width, white.height);
      g.drawImage(c, 0, 0);
      c = white;
    }
    const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, mime, format === 'png' ? undefined : Math.max(0.01, Math.min(1, quality / 100))));
    if (!blob) throw new Error('The picture could not be made: it may be too large for this browser');
    const made = blob.type === mime ? format : blob.type === 'image/jpeg' ? 'jpeg' : blob.type === 'image/webp' ? 'webp' : 'png';
    return { blob, w: c.width, h: c.height, mime: blob.type || mime, made, data: await blobData(blob) };
  }

  /** Whether the picture is as it was opened (nothing to save). */
  get untouched() {
    return this.hist.at === 0;
  }
  /** Layers that blend: for the menus' ticks. */
  blendOf(l: Layer | null): BlendMode {
    return l?.blend ?? 'normal';
  }
}

/** A mark's box before its turn. */
export function markBoundsUnturned(l: MarkLayer): Box {
  return markBounds({ ...l, angle: 0 });
}

/** A mark moved by a map of points (a turn, a flip), words and emoji by their middle, so they stay upright. */
function uprightMoved(l: MarkLayer, f: (x: number, y: number) => [number, number]): Mark {
  const m = l.mark;
  if (m.type !== 'text' && m.type !== 'emoji') return moveMark(m, f);
  const b = markBoundsUnturned(l);
  const [cx, cy] = f(b.x + b.w / 2, b.y + b.h / 2);
  return moveMark(m, (x, y) => [x + cx - (b.x + b.w / 2), y + cy - (b.y + b.h / 2)]);
}

/** A picture file (or a dropped or pasted one) read into a canvas. */
export async function canvasOfFile(f: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(f);
  try {
    const img = await loadImage(url);
    const c = canvasOf(img.naturalWidth || 1024, img.naturalHeight || 768);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { blendOp };

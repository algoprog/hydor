// The slides editor's side panel, in four tabs. Format: the part picked (its place and size, its words' look, its
// fill and border, a shape's kind, a picture's fit, crop and colours, a line's ends and path, a table's or a chart's look and
// numbers, an icon's colour, an equation's LaTeX, a video's address and how it plays, a group's parts, a link; code,
// and the web format's parts: WebParts.tsx) or the parts picked lined up, spread and grouped. Animate: the slide's
// animations in their order, each one's effect, start, timing and direction, and a new one for the part picked (in a
// web deck its own effects too, a part that starts one when clicked, effects that keep going, words one by one, how
// they move), and every slide animated at once (AnimateAll.tsx). Slide: its background (in a web deck one that moves, or a video), its transition (Morph too), hidden or
// not, the footer. Theme: a ready-made look, or the deck's own colours and fonts, and the slides' shape.
import { useEffect, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChartScatter,
  Crop as CropIcon,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Group as GroupIcon,
  ImageMinus,
  ImagePlus,
  Lock,
  MousePointerClick,
  Play,
  Plus,
  Pointer,
  Sparkles,
  Trash2,
  Ungroup as UngroupIcon,
  Unlock,
  Video as VideoIcon,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  ANIM_DIR,
  ANIM_FX,
  BG_FX,
  CHART_KINDS,
  EASES,
  everyEl,
  FONTS,
  isWebDeck,
  RICH_ANIM_FX,
  RICH_TRANSITIONS,
  SHAPES,
  TEXT_FX,
  THEMES,
  TRANSITIONS,
  newId,
  scaleEls,
  slideH,
  videoSrc,
  videoStart,
  type Adjust,
  type Anim,
  type AnimFx,
  type BgFx,
  type ChartEl,
  type Deck,
  type Dir,
  type Ease,
  type El,
  type IconEl,
  type ImageEl,
  type LineEl,
  type MathEl,
  type ShapeKind,
  type Slide,
  type TableEl,
  type TextFx,
  type Theme,
  type TransitionFx,
  type VideoEl,
} from '@shared/slides';
import { Button, cx, MenuItem, Popover, Switch } from '../../../components/ui';
import { useTexHtml } from '../common/katex';
import { Choice, Select } from '../studio/fields';
import { ColorButton, Field, NumInput, Section, Swatches, Tool } from './controls';
import { addAnim, align, distribute, effectDur, transitionDur, dropMergesPast, fillCells, heightOf, mergeAt, mergeCells, moveAnim, onSlide, partName, pathTo, pickedOf, removeAnim, removeEls, restack, setAnim, setEls, setSlide, topOf, unmergeCell, W } from './ops';
import type { CellSel } from './SlideCanvas';
import { SlideThumb } from './Thumb';
import { fetchVideoStill } from './media';
import { CodeLook, EmbedLook, HoverField, HtmlLook, QuizLook, Scene3dLook, ScoreLook, TEXT_FX_NAMES } from './WebParts';
import { FX_NAMES, TR_NAMES } from './names';
import { AnimateEvery } from './AnimateAll';

export type InspectorTab = 'format' | 'animate' | 'slide' | 'theme';
export const INSPECTOR_TABS: { value: InspectorTab; label: string }[] = [
  { value: 'format', label: 'Format' },
  { value: 'animate', label: 'Animate' },
  { value: 'slide', label: 'Slide' },
  { value: 'theme', label: 'Theme' },
];

type Change = (d: Deck | ((d: Deck) => Deck), key?: string) => void;

interface Props {
  deck: Deck;
  index: number;
  sel: string[];
  onSel: (ids: string[]) => void;
  change: Change;
  fonts: number;
  /** A picture from the device, kept by the app: its source and size. */
  pickPicture: () => Promise<{ src: string; w: number; h: number } | null>;
  onReplaceImage: (id: string) => void;
  onPreview: () => void;
  onAsk?: (text: string) => void;
  /** Crop mode for a picture (null: none). */
  cropping?: string | null;
  onCrop?: (id: string | null, keep?: boolean) => void;
  /** Another icon in this one's place. */
  onIcon?: (id: string) => void;
  onGroup?: () => void;
  onUngroup?: (id: string) => void;
  onFooter?: () => void;
  /** The table cells picked together. */
  cellSel?: CellSel | null;
  onCellSel?: (s: CellSel | null) => void;
  /** The equation's LaTeX field takes the keys (it was just added, or double-clicked). */
  texFocus?: number;
  /** The live part running in place (custom code, a web page, 3D), and Run or Stop. */
  running?: string | null;
  onRun?: (id: string | null) => void;
  /** A video from this device, kept by the app (a slide's background video): its source. */
  pickVideo?: () => Promise<string | null>;
  /** A 3D model (GLB) from this device, kept by the app: its source. */
  pickModel?: () => Promise<string | null>;
  /** The part that starts an animation is picked on the slide: for that animation (null: none is being picked). */
  picking?: string | null;
  onPickTrigger?: (anim: string | null) => void;
  /** The deck made PowerPoint compatible (asked first, with what changes) or for the web again. */
  onCompatible?: (on: boolean) => void;
  /** The AI tools: a picture changed (with AI, its background out, part of it erased), a chart made a plot, the slide's background made. */
  onAiEdit?: (id: string, mode: 'change' | 'cutout' | 'erase') => void;
  onPlotChart?: (id: string) => void;
  onAiBackground?: () => void;
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  round: 'Rounded rectangle',
  ellipse: 'Oval',
  triangle: 'Triangle',
  rtriangle: 'Right triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star: 'Star',
  arrow: 'Arrow right',
  larrow: 'Arrow left',
  uarrow: 'Arrow up',
  darrow: 'Arrow down',
  chevron: 'Chevron',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  plus: 'Plus',
  heart: 'Heart',
  callout: 'Speech bubble',
};
export { SHAPE_NAMES };

/** A small picture of a shape kind, drawn as the slides draw it. */
export function ShapeIcon({ kind, size = 18 }: { kind: ShapeKind; size?: number }) {
  const w = 24;
  const h = kind === 'arrow' || kind === 'larrow' || kind === 'chevron' || kind === 'parallelogram' || kind === 'rect' || kind === 'round' || kind === 'callout' || kind === 'trapezoid' ? 16 : 24;
  const d = SHAPE_PATHS(kind, w - 2, h - 2);
  return (
    <svg width={size} height={size} viewBox="-1 -1 26 26" aria-hidden>
      <g transform={`translate(0 ${(24 - h) / 2})`}>
        {kind === 'rect' && <rect x="0" y="0" width={w - 2} height={h - 2} fill="currentColor" />}
        {kind === 'round' && <rect x="0" y="0" width={w - 2} height={h - 2} rx="4" fill="currentColor" />}
        {kind === 'ellipse' && <ellipse cx={(w - 2) / 2} cy={(h - 2) / 2} rx={(w - 2) / 2} ry={(h - 2) / 2} fill="currentColor" />}
        {d && <path d={d} fill="currentColor" />}
      </g>
    </svg>
  );
}

/** The outline of each shape for its icon (the runtime draws the slides' own). */
function SHAPE_PATHS(kind: ShapeKind, w: number, h: number): string {
  const p = (pts: number[][]) => `M${pts.map((x) => x.join(',')).join('L')}Z`;
  const ss = Math.min(w, h);
  switch (kind) {
    case 'triangle':
      return p([[w / 2, 0], [w, h], [0, h]]);
    case 'rtriangle':
      return p([[0, 0], [w, h], [0, h]]);
    case 'diamond':
      return p([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon':
      return p([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
    case 'hexagon':
      return p([[0, h / 2], [ss * 0.25, 0], [w - ss * 0.25, 0], [w, h / 2], [w - ss * 0.25, h], [ss * 0.25, h]]);
    case 'octagon': {
      const c = ss * 0.29;
      return p([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]);
    }
    case 'star': {
      const pts: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.382 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([w / 2 + (w / 2) * r * Math.cos(a), h * 0.525 + h * 0.525 * r * Math.sin(a)]);
      }
      return p(pts);
    }
    case 'arrow':
      return p([[0, h * 0.25], [w - h / 2, h * 0.25], [w - h / 2, 0], [w, h / 2], [w - h / 2, h], [w - h / 2, h * 0.75], [0, h * 0.75]]);
    case 'larrow':
      return p([[w, h * 0.25], [h / 2, h * 0.25], [h / 2, 0], [0, h / 2], [h / 2, h], [h / 2, h * 0.75], [w, h * 0.75]]);
    case 'uarrow':
      return p([[w * 0.25, h], [w * 0.25, w / 2], [0, w / 2], [w / 2, 0], [w, w / 2], [w * 0.75, w / 2], [w * 0.75, h]]);
    case 'darrow':
      return p([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h - w / 2], [w, h - w / 2], [w / 2, h], [0, h - w / 2], [w * 0.25, h - w / 2]]);
    case 'chevron':
      return p([[0, 0], [w - h / 2, 0], [w, h / 2], [w - h / 2, h], [0, h], [h / 2, h / 2]]);
    case 'parallelogram':
      return p([[ss * 0.25, 0], [w, 0], [w - ss * 0.25, h], [0, h]]);
    case 'trapezoid':
      return p([[0, h], [ss * 0.25, 0], [w - ss * 0.25, 0], [w, h]]);
    case 'plus': {
      const c = ss * 0.3;
      return p([[c, 0], [w - c, 0], [w - c, c], [w, c], [w, h - c], [w - c, h - c], [w - c, h], [c, h], [c, h - c], [0, h - c], [0, c], [c, c]]);
    }
    case 'heart':
      return `M${w / 2},${h * 0.25}C${w * 0.45},${h * 0.05} ${w * 0.05},${h * 0.02} ${w * 0.02},${h * 0.32}C0,${h * 0.55} ${w * 0.3},${h * 0.72} ${w / 2},${h}C${w * 0.7},${h * 0.72} ${w},${h * 0.55} ${w * 0.98},${h * 0.32}C${w * 0.95},${h * 0.02} ${w * 0.55},${h * 0.05} ${w / 2},${h * 0.25}Z`;
    case 'callout':
      return `M2,0H${w - 2}Q${w},0 ${w},2V${h * 0.8 - 2}Q${w},${h * 0.8} ${w - 2},${h * 0.8}H${w * 0.33}L${w * 0.2},${h}L${w * 0.17},${h * 0.8}H2Q0,${h * 0.8} 0,${h * 0.8 - 2}V2Q0,0 2,0Z`;
  }
  return '';
}

// ---- Format ------------------------------------------------------------------------------------------------

function Arrange({ deck, index, ids, change }: { deck: Deck; index: number; ids: string[]; change: Change }) {
  const many = ids.length > 1;
  const al = (how: Parameters<typeof align>[3]) => change((d) => align(d, index, ids, how));
  const inGroup = !many && !!pathTo(deck.slides[index].els, ids[0])?.length;
  return (
    <Section title={many ? 'Line them up' : inGroup ? 'In its group' : 'On the slide'}>
      <div className="flex flex-wrap items-center gap-0.5">
        <Tool label={many ? 'Left edges' : 'To the left'} onClick={() => al('left')}>
          <AlignStartVertical size={15} />
        </Tool>
        <Tool label={many ? 'Centres across' : 'In the middle, across'} onClick={() => al('center')}>
          <AlignCenterVertical size={15} />
        </Tool>
        <Tool label={many ? 'Right edges' : 'To the right'} onClick={() => al('right')}>
          <AlignEndVertical size={15} />
        </Tool>
        <Tool label={many ? 'Tops' : 'To the top'} onClick={() => al('top')}>
          <AlignStartHorizontal size={15} />
        </Tool>
        <Tool label={many ? 'Middles' : 'In the middle, down'} onClick={() => al('middle')}>
          <AlignCenterHorizontal size={15} />
        </Tool>
        <Tool label={many ? 'Bottoms' : 'To the bottom'} onClick={() => al('bottom')}>
          <AlignEndHorizontal size={15} />
        </Tool>
        {ids.length > 2 && (
          <>
            <Tool label="Spread evenly across" onClick={() => change((d) => distribute(d, index, ids, 'h'))}>
              <AlignHorizontalSpaceAround size={15} />
            </Tool>
            <Tool label="Spread evenly down" onClick={() => change((d) => distribute(d, index, ids, 'v'))}>
              <AlignVerticalSpaceAround size={15} />
            </Tool>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <Tool label="To the front" onClick={() => change((d) => restack(d, index, ids, 'front'))}>
          <ArrowUpToLine size={15} />
        </Tool>
        <Tool label="Bring forward" onClick={() => change((d) => restack(d, index, ids, 'forward'))}>
          <ArrowUp size={15} />
        </Tool>
        <Tool label="Send backward" onClick={() => change((d) => restack(d, index, ids, 'backward'))}>
          <ArrowDown size={15} />
        </Tool>
        <Tool label="To the back" onClick={() => change((d) => restack(d, index, ids, 'back'))}>
          <ArrowDownToLine size={15} />
        </Tool>
      </div>
    </Section>
  );
}

/**
 * A part's place and size, as it is on the slide: a part in a group shows where it is on the slide (its groups' places
 * and turns added), and a place or turn typed there is taken back through them, so the part goes there on the slide.
 */
function Place({ el, slide, set, H }: { el: El; slide: Slide; set: (patch: Partial<El>, key?: string) => void; H: number }) {
  const groups = pathTo(slide.els, el.id) ?? [];
  const shown = groups.length ? onSlide(slide, el) : el;
  // The groups' turns add up: a step on the slide is that much less turned in the part's own group.
  const turn = groups.reduce((a, g) => a + (g.rot ?? 0), 0);
  const back = (dx: number, dy: number) => {
    const a = (-turn * Math.PI) / 180;
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const r2 = (v: number) => Math.round(v * 100) / 100;
  if (el.type === 'line' && shown.type === 'line') {
    // Its start moved (its end stays), or its end.
    const moveEnd = (which: 'from' | 'to', x: number, y: number) => {
      const [lx, ly] = back(x - (which === 'from' ? shown.x : shown.x + shown.w), y - (which === 'from' ? shown.y : shown.y + shown.h));
      set(which === 'from' ? { x: r2(el.x + lx), y: r2(el.y + ly), w: r2(el.w - lx), h: r2(el.h - ly) } : { w: r2(el.w + lx), h: r2(el.h + ly) }, 'place');
    };
    return (
      <Section title="Place">
        <Field label="From">
          <NumInput label="X" value={r2(shown.x)} onChange={(x) => moveEnd('from', x, shown.y)} unit="x" />
          <NumInput label="Y" value={r2(shown.y)} onChange={(y) => moveEnd('from', shown.x, y)} unit="y" />
        </Field>
        <Field label="To">
          <NumInput label="X" value={r2(shown.x + shown.w)} onChange={(x) => moveEnd('to', x, shown.y + shown.h)} unit="x" />
          <NumInput label="Y" value={r2(shown.y + shown.h)} onChange={(y) => moveEnd('to', shown.x + shown.w, y)} unit="y" />
        </Field>
      </Section>
    );
  }
  const moveTo = (x: number, y: number) => {
    const [lx, ly] = back(x - shown.x, y - shown.y);
    set({ x: r2(el.x + lx), y: r2(el.y + ly) }, 'place');
  };
  return (
    <Section title="Place and size">
      <Field label="Position">
        <NumInput label="From the left" value={r2(shown.x)} onChange={(x) => moveTo(x, shown.y)} min={-W} max={W * 2} unit="x" />
        <NumInput label="From the top" value={r2(shown.y)} onChange={(y) => moveTo(shown.x, y)} min={-H} max={H * 2} unit="y" />
      </Field>
      <Field label="Size">
        <NumInput label="Width" value={el.w} onChange={(w) => set({ w }, 'place')} min={4} max={W * 3} unit="w" />
        <NumInput label="Height" value={el.h} onChange={(h) => set({ h }, 'place')} min={4} max={H * 3} unit="h" />
      </Field>
      <Field label="Turn">
        <NumInput label="Degrees" value={r2(((((shown.rot ?? 0) % 360) + 360) % 360))} onChange={(rot) => set({ rot: ((((rot - turn) % 360) + 360) % 360) || undefined }, 'place')} min={-360} max={360} unit="°" />
        <NumInput label="See-through (%)" value={Math.round((1 - (el.opacity ?? 1)) * 100)} onChange={(v) => set({ opacity: v > 0 ? Math.max(0, 1 - v / 100) : undefined }, 'place')} min={0} max={100} unit="%" />
      </Field>
    </Section>
  );
}

function TextLook({ el, theme, set, web }: { el: Extract<El, { type: 'text' | 'shape' }>; theme: Theme; set: (patch: Partial<El>, key?: string) => void; web?: boolean }) {
  return (
    <Section title="Words">
      <Field label="Font">
        <Select
          value={el.font ?? ''}
          onChange={(v) => set({ font: v || undefined })}
          options={[{ value: '', label: el.role === 'title' || el.role === 'quote' || el.role === 'big' ? `Headings (${theme.headFont})` : `Body (${theme.font})` }, { value: 'head', label: `Headings (${theme.headFont})` }, { value: 'body', label: `Body (${theme.font})` }, ...FONTS.map((f) => ({ value: f.name, label: f.name }))]}
        />
      </Field>
      <Field label="Size">
        <NumInput label="Size" value={el.size} onChange={(size) => set({ size }, 'size')} min={6} max={400} step={2} buttons />
        <ColorButton value={el.color} theme={theme} onChange={(color) => set({ color })} label="Colour" />
      </Field>
      <Field label="Up and down">
        <Choice
          value={el.valign ?? 'top'}
          onChange={(valign) => set({ valign })}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
          ]}
        />
      </Field>
      <Field label="Line spacing">
        <NumInput label="Line spacing" value={el.lh ?? (el.role === 'title' ? 1.1 : 1.2)} onChange={(lh) => set({ lh }, 'lh')} min={0.6} max={4} step={0.05} unit="×" />
        <NumInput label="Space after a paragraph" value={el.gap ?? 0} onChange={(gap) => set({ gap: gap || undefined }, 'gap')} min={0} max={200} step={2} unit="px" />
      </Field>
      <Field label="Inside">
        <NumInput label="Space around the words" value={el.pad ?? 10} onChange={(pad) => set({ pad }, 'pad')} min={0} max={200} step={2} unit="px" />
        <NumInput label="Letter spacing" value={el.ls ?? 0} onChange={(ls) => set({ ls: ls || undefined }, 'ls')} min={-0.2} max={1} step={0.01} unit="em" />
      </Field>
      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
        <span className="min-w-0 flex-1">Smaller words when they don’t fit</span>
        <Switch label="Smaller words when they don’t fit" on={el.fit === 'shrink'} onChange={(on) => set({ fit: on ? 'shrink' : 'none' })} />
      </label>
      {web && (
        <Field label="Text effect">
          <Select value={el.textFx ?? ''} onChange={(v) => set({ textFx: (v || undefined) as TextFx | undefined })} options={[{ value: '', label: 'None' }, ...TEXT_FX.map((f) => ({ value: f, label: TEXT_FX_NAMES[f] }))]} title="Text effect" />
        </Field>
      )}
    </Section>
  );
}

function BoxLook({ el, theme, set, web }: { el: Extract<El, { type: 'text' | 'shape' }>; theme: Theme; set: (patch: Partial<El>, key?: string) => void; web?: boolean }) {
  const grad = !!el.fill2;
  return (
    <>
      {el.type === 'shape' && (
        <Section title="Shape">
          <div className="grid grid-cols-10 gap-0.5">
            {SHAPES.map((k) => (
              <button
                key={k}
                type="button"
                title={SHAPE_NAMES[k]}
                aria-label={SHAPE_NAMES[k]}
                onClick={() => set({ shape: k } as Partial<El>)}
                className={cx('grid h-7 place-items-center rounded-md text-fg-2 hover:bg-bg-2', el.shape === k && 'bg-accent-soft text-accent')}
              >
                <ShapeIcon kind={k} size={17} />
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="Fill">
        <Swatches value={el.fill === 'transparent' ? undefined : el.fill} theme={theme} none="No fill" onChange={(fill) => set({ fill: fill ?? 'transparent', ...(fill ? {} : { fill2: undefined }) })} />
        {el.fill && el.fill !== 'transparent' && (
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Fade into another colour</span>
            <Switch label="Fade into another colour" on={grad} onChange={(on) => set({ fill2: on ? 'bg' : undefined, angle: on ? (el.angle ?? 135) : undefined })} />
          </label>
        )}
        {grad && (
          <Field label="Into">
            <ColorButton value={el.fill2} theme={theme} onChange={(fill2) => set({ fill2: fill2 ?? 'bg' })} label="Second colour" />
            <NumInput label="Direction" value={el.angle ?? 180} onChange={(angle) => set({ angle }, 'angle')} min={0} max={360} step={15} unit="°" />
          </Field>
        )}
        {web && (
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Frosted glass</span>
            <Switch label="Frosted glass: what is under it shows through, blurred" on={!!el.glass} onChange={(glass) => set({ glass: glass || undefined })} />
          </label>
        )}
      </Section>
      <Section title="Border">
        <Swatches value={el.line} theme={theme} none="No border" onChange={(line) => set({ line, lineW: line ? (el.lineW ?? 2) : undefined })} />
        {el.line && (
          <Field label="Width">
            <NumInput label="Width" value={el.lineW ?? 2} onChange={(lineW) => set({ lineW }, 'lineW')} min={0.5} max={40} step={0.5} unit="px" />
            <Select
              value={el.dash ?? 'solid'}
              className="w-[96px]"
              onChange={(v) => set({ dash: v === 'solid' ? undefined : (v as 'dash' | 'dot') })}
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'dash', label: 'Dashes' },
                { value: 'dot', label: 'Dots' },
              ]}
            />
          </Field>
        )}
        {(el.type === 'text' || el.shape === 'rect' || el.shape === 'round') && (
          <Field label="Corners">
            <NumInput label="Corner radius" value={el.radius ?? (el.type === 'shape' && el.shape === 'round' ? Math.round(Math.min(el.w, el.h) * 0.16) : 0)} onChange={(radius) => set({ radius }, 'radius')} min={0} max={1000} unit="px" />
          </Field>
        )}
        <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
          <span className="min-w-0 flex-1">Shadow</span>
          <Switch label="Shadow" on={!!el.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })} />
        </label>
      </Section>
    </>
  );
}

/** A slider with its number, for a picture's colours. */
function Slider({ label, value, min, max, onChange, unit = '' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <Field label={label}>
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--accent)]" aria-label={label} />
      <span className="w-10 shrink-0 text-right text-[12px] text-fg-3 tabular-nums">{`${value}${unit}`}</span>
    </Field>
  );
}

function PictureColours({ el, set }: { el: ImageEl; set: (patch: Partial<El>, key?: string) => void }) {
  const a = el.adjust ?? {};
  const adj = (patch: Partial<Adjust>) => {
    const next: Adjust = { ...a, ...patch };
    if (!next.bright) delete next.bright;
    if (!next.contrast) delete next.contrast;
    if (next.sat === undefined || next.sat === 100) delete next.sat;
    if (!next.gray) delete next.gray;
    if (!next.blur) delete next.blur;
    set({ adjust: Object.keys(next).length ? next : undefined } as Partial<El>, 'adjust');
  };
  const changed = !!el.adjust || el.opacity !== undefined;
  return (
    <Section
      title="Colours"
      aside={
        changed && (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => set({ adjust: undefined, opacity: undefined } as Partial<El>)}>
            Reset
          </Button>
        )
      }
    >
      <Slider label="Brightness" value={a.bright ?? 0} min={-100} max={100} onChange={(bright) => adj({ bright })} />
      <Slider label="Contrast" value={a.contrast ?? 0} min={-100} max={100} onChange={(contrast) => adj({ contrast })} />
      <Slider label="Saturation" value={a.sat ?? 100} min={0} max={200} onChange={(sat) => adj({ sat })} unit="%" />
      <Slider label="Blur" value={a.blur ?? 0} min={0} max={40} onChange={(blur) => adj({ blur })} unit="px" />
      <Slider label="See-through" value={Math.round((1 - (el.opacity ?? 1)) * 100)} min={0} max={100} onChange={(v) => set({ opacity: v > 0 ? Math.max(0, 1 - v / 100) : undefined }, 'opacity')} unit="%" />
      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
        <span className="min-w-0 flex-1">Black and white</span>
        <Switch label="Black and white" on={!!a.gray} onChange={(gray) => adj({ gray })} />
      </label>
    </Section>
  );
}

function PictureLook({
  el,
  theme,
  set,
  onReplace,
  cropping,
  onCrop,
  onAi,
}: {
  el: ImageEl;
  theme: Theme;
  set: (patch: Partial<El>, key?: string) => void;
  onReplace: () => void;
  cropping?: boolean;
  onCrop?: (id: string | null, keep?: boolean) => void;
  onAi?: (id: string, mode: 'change' | 'cutout' | 'erase') => void;
}) {
  const aiRef = useRef<HTMLButtonElement>(null);
  const [ai, setAi] = useState(false);
  return (
    <Section title="Picture">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" icon={<ImagePlus size={14} />} onClick={onReplace}>
          Another picture
        </Button>
        {onAi && el.src && !cropping && (
          <Button ref={aiRef} size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={() => setAi((o) => !o)}>
            Change it with AI
          </Button>
        )}
        {onCrop && el.src && !cropping && (
          <Button size="sm" variant="secondary" icon={<CropIcon size={14} />} onClick={() => onCrop(el.id)}>
            Crop
          </Button>
        )}
        {onCrop && el.crop && !cropping && (
          <Button size="sm" variant="ghost" onClick={() => set({ crop: undefined } as Partial<El>)}>
            Uncrop
          </Button>
        )}
      </div>
      {onAi && (
        <Popover anchor={aiRef} open={ai} onClose={() => setAi(false)} width={240} title="Change it with AI">
          {(
            [
              ['change', 'Change with AI', <WandSparkles key="c" size={14} />],
              ['cutout', 'Remove the background', <ImageMinus key="b" size={14} />],
              ['erase', 'Erase part of it', <Eraser key="e" size={14} />],
            ] as const
          ).map(([mode, label, icon]) => (
            <MenuItem
              key={mode}
              icon={icon}
              onClick={() => {
                setAi(false);
                onAi(el.id, mode);
              }}
            >
              {label}
            </MenuItem>
          ))}
        </Popover>
      )}
      {cropping && onCrop && (
        <div className="space-y-2 rounded-lg bg-bg-1 p-2 text-[12px] text-fg-3">
          <p>Drag the frame’s edges and corners, or the picture under it.</p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="primary" onClick={() => onCrop(null, true)}>
              Done
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onCrop(null, false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!el.crop && (
        <Field label="Fit">
          <Choice
            value={el.fit ?? 'cover'}
            onChange={(fit) => set({ fit: fit === 'cover' ? undefined : fit })}
            options={[
              { value: 'cover', label: 'Fill', title: 'Fills the box, cropped' },
              { value: 'contain', label: 'Whole', title: 'All of it, inside the box' },
              { value: 'fill', label: 'Stretch', title: 'Stretched to the box' },
            ]}
          />
        </Field>
      )}
      <Field label="Corners">
        <NumInput label="Corner radius" value={el.radius ?? 0} onChange={(radius) => set({ radius: radius || undefined }, 'radius')} min={0} max={1000} unit="px" />
        <Tool label="Flip across" on={!!el.flipH} onClick={() => set({ flipH: !el.flipH || undefined })}>
          <FlipHorizontal2 size={15} />
        </Tool>
        <Tool label="Flip down" on={!!el.flipV} onClick={() => set({ flipV: !el.flipV || undefined })}>
          <FlipVertical2 size={15} />
        </Tool>
      </Field>
      <Field label="Border">
        <ColorButton value={el.line} theme={theme} none="No border" onChange={(line) => set({ line, lineW: line ? (el.lineW ?? 3) : undefined })} label="Border colour" />
        {el.line && <NumInput label="Border width" value={el.lineW ?? 3} onChange={(lineW) => set({ lineW }, 'lineW')} min={0.5} max={40} step={0.5} unit="px" />}
      </Field>
      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
        <span className="min-w-0 flex-1">Shadow</span>
        <Switch label="Shadow" on={!!el.shadow} onChange={(shadow) => set({ shadow: shadow || undefined })} />
      </label>
      <Field label="Describe it" top>
        <textarea
          value={el.alt ?? ''}
          onChange={(e) => set({ alt: e.target.value || undefined }, 'alt')}
          onKeyDown={(e) => e.stopPropagation()}
          rows={2}
          placeholder="For people who can’t see it"
          className="w-full min-w-0 resize-none rounded-lg border border-line bg-bg-1 px-2 py-1.5 text-[12.5px] outline-none focus:border-accent/60"
        />
      </Field>
    </Section>
  );
}

function LineLook({ el, theme, set }: { el: LineEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void }) {
  const caps = [
    { value: 'none', label: 'None' },
    { value: 'arrow', label: 'Arrow' },
    { value: 'dot', label: 'Dot' },
  ];
  return (
    <Section title="Line or arrow">
      <Field label="Colour">
        <ColorButton value={el.color ?? 'fg'} theme={theme} onChange={(color) => set({ color })} label="Line colour" />
        <NumInput label="Width" value={el.width} onChange={(width) => set({ width }, 'width')} min={0.5} max={60} step={0.5} unit="px" />
      </Field>
      <Field label="Style">
        <Select
          value={el.dash ?? 'solid'}
          onChange={(v) => set({ dash: v === 'solid' ? undefined : (v as 'dash' | 'dot') })}
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dash', label: 'Dashes' },
            { value: 'dot', label: 'Dots' },
          ]}
        />
      </Field>
      <Field label="Starts with">
        <Select value={el.start ?? 'none'} onChange={(v) => set({ start: v === 'none' ? undefined : (v as 'arrow' | 'dot') })} options={caps} />
      </Field>
      <Field label="Ends with">
        <Select value={el.end ?? 'none'} onChange={(v) => set({ end: v === 'none' ? undefined : (v as 'arrow' | 'dot') })} options={caps} />
      </Field>
      <Field label="Path">
        <Choice
          value={el.route ?? 'straight'}
          onChange={(v) => set({ route: v === 'elbow' ? 'elbow' : undefined } as Partial<El>)}
          options={[
            { value: 'straight', label: 'Straight' },
            { value: 'elbow', label: 'Elbow' },
          ]}
        />
      </Field>
      <p className="text-[11.5px] leading-snug text-fg-3">
        {el.from || el.to ? 'Its ends stay on the parts they are stuck to as those move; drag an end away to free it.' : 'Drag an end onto a part to stick it to the middle of one of its sides.'}
      </p>
    </Section>
  );
}

function TableLook({ el, theme, set, cellSel, onCellSel }: { el: TableEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void; cellSel?: CellSel | null; onCellSel?: (s: CellSel | null) => void }) {
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  const rows = el.rows;
  const cs = cellSel?.id === el.id ? cellSel : null;
  const many = !!cs && (cs.r0 !== cs.r1 || cs.c0 !== cs.c1);
  const merged = cs ? mergeAt(el, cs.r0, cs.c0) : undefined;
  const replace = (t: TableEl) => set({ rows: t.rows, merges: t.merges, fills: t.fills } as Partial<El>);
  return (
    <Section title="Table">
      <p className="text-[12px] leading-snug text-fg-3">Double-click a cell to type in it; Tab goes to the next one. Shift-click another cell to pick the cells between.</p>
      {cs && (
        <div className="space-y-1.5 rounded-lg bg-bg-1 p-2">
          <div className="text-[12px] text-fg-2">{many ? `${(Math.abs(cs.r1 - cs.r0) + 1) * (Math.abs(cs.c1 - cs.c0) + 1)} cells picked` : 'One cell picked'}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {many && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const t = mergeCells(el, cs.r0, cs.c0, cs.r1, cs.c1);
                  replace(t);
                  // The merged cell is what is picked now.
                  const m = t.merges?.find((x) => x.r === Math.min(cs.r0, cs.r1) && x.c === Math.min(cs.c0, cs.c1));
                  if (m) onCellSel?.({ id: el.id, r0: m.r, c0: m.c, r1: m.r, c1: m.c });
                }}
              >
                Merge cells
              </Button>
            )}
            {merged && !many && (
              <Button size="sm" variant="secondary" onClick={() => replace(unmergeCell(el, cs.r0, cs.c0))}>
                Unmerge cells
              </Button>
            )}
            <ColorButton value={el.fills?.[`${cs.r0},${cs.c0}`]} theme={theme} none="The table’s own" onChange={(fill) => replace(fillCells(el, cs.r0, cs.c0, cs.r1, cs.c1, fill))} label="Cell fill" />
          </div>
        </div>
      )}
      <Field label="Number of rows">
        <span className="min-w-6 text-center text-[12.5px] tabular-nums">{rows.length}</span>
        <Tool label="One row fewer" disabled={rows.length < 2} onClick={() => set({ ...dropMergesPast({ ...el, rows: rows.slice(0, -1) }), h: Math.max(20, el.h - el.h / rows.length) } as Partial<El>)}>
          <span className="text-[15px]">−</span>
        </Tool>
        <Tool label="One more row" disabled={rows.length >= 40} onClick={() => set({ rows: [...rows, Array(cols).fill('')], h: el.h + el.h / rows.length })}>
          <Plus size={14} />
        </Tool>
      </Field>
      <Field label="Number of columns">
        <span className="min-w-6 text-center text-[12.5px] tabular-nums">{cols}</span>
        <Tool label="One column fewer" disabled={cols < 2} onClick={() => set({ ...dropMergesPast({ ...el, rows: rows.map((r) => r.slice(0, cols - 1)) }), cols: undefined, aligns: undefined } as Partial<El>)}>
          <span className="text-[15px]">−</span>
        </Tool>
        <Tool label="One more column" disabled={cols >= 12} onClick={() => set({ rows: rows.map((r) => [...r, '']), cols: undefined, aligns: undefined })}>
          <Plus size={14} />
        </Tool>
      </Field>
      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
        <span className="min-w-0 flex-1">The first row is a header</span>
        <Switch label="The first row is a header" on={!!el.head} onChange={(head) => set({ head: head || undefined })} />
      </label>
      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
        <span className="min-w-0 flex-1">Every other row shaded</span>
        <Switch label="Every other row shaded" on={!!el.band} onChange={(band) => set({ band: band || undefined })} />
      </label>
      <Field label="Text">
        <NumInput label="Size" value={el.size} onChange={(size) => set({ size }, 'size')} min={6} max={200} step={1} buttons />
        <ColorButton value={el.color} theme={theme} onChange={(color) => set({ color })} label="Colour" />
      </Field>
      {el.head && (
        <Field label="Header row">
          <ColorButton value={el.fill ?? 'accent'} theme={theme} onChange={(fill) => set({ fill })} label="Header fill" />
          <ColorButton value={el.headColor ?? 'accentFg'} theme={theme} onChange={(headColor) => set({ headColor })} label="Header words" />
        </Field>
      )}
    </Section>
  );
}

function ChartLook({ el, theme, set, onPlot }: { el: ChartEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void; onPlot?: (id: string) => void }) {
  const KINDS: Record<string, string> = { column: 'Column chart', bar: 'Bar chart', line: 'Line chart', area: 'Area chart', pie: 'Pie chart', doughnut: 'Doughnut chart' };
  const pie = el.kind === 'pie' || el.kind === 'doughnut';
  const series = pie ? el.series.slice(0, 1) : el.series;
  const setCell = (si: number, li: number, v: string) => {
    const n = Number(v.replace(',', '.'));
    set({ series: el.series.map((s, k) => (k === si ? { ...s, values: el.labels.map((_, j) => (j === li ? (Number.isFinite(n) ? n : 0) : (s.values[j] ?? 0))) } : s)) }, `chart:${si}:${li}`);
  };
  const cell = 'h-7 w-full min-w-0 rounded-md border border-line bg-bg-1 px-1.5 text-[12px] outline-none focus:border-accent/60';
  return (
    <>
      <Section title="Chart">
        <Field label="Kind">
          <Select value={el.kind} onChange={(kind) => set({ kind: kind as ChartEl['kind'] })} options={CHART_KINDS.map((k) => ({ value: k, label: KINDS[k] }))} />
        </Field>
        <Field label="Title">
          <input value={el.title ?? ''} onChange={(e) => set({ title: e.target.value || undefined }, 'title')} onKeyDown={(e) => e.stopPropagation()} placeholder="None" className={cell} />
        </Field>
        <Field label="Text">
          <NumInput label="Size" value={el.size} onChange={(size) => set({ size }, 'size')} min={6} max={120} buttons />
          <ColorButton value={el.color} theme={theme} onChange={(color) => set({ color })} label="Colour" />
        </Field>
        {(
          [
            ['legend', 'A legend'],
            ['values', pie ? 'Each slice’s share' : 'Each value on the chart'],
            ...(pie ? [] : [['stacked', 'Stacked'] as const, ['grid', 'Grid lines'] as const]),
          ] as [keyof ChartEl, string][]
        ).map(([k, label]) => (
          <label key={k} className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">{label}</span>
            <Switch label={label} on={!!el[k]} onChange={(v) => set({ [k]: v || undefined } as Partial<El>)} />
          </label>
        ))}
      </Section>
      <Section title="Data">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0.5 text-[12px]">
            <thead>
              <tr>
                <th className="w-[38%]" />
                {series.map((s, si) => (
                  <th key={si} className="min-w-[72px] align-bottom font-normal">
                    {/* Its colour and Remove over its name, which has the column's whole width. */}
                    {!pie && (
                      <div className="flex items-center justify-between gap-0.5">
                        <ColorButton value={s.color ?? `c${(si % 6) + 1}`} theme={theme} onChange={(color) => set({ series: el.series.map((x, k) => (k === si ? { ...x, color } : x)) })} label="Its colour" className="h-6 min-w-6 px-0.5" />
                        {el.series.length > 1 && (
                          <button type="button" title="Remove this series" aria-label="Remove this series" onClick={() => set({ series: el.series.filter((_, k) => k !== si) })} className="grid h-6 w-6 place-items-center text-fg-3 hover:text-err">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    )}
                    <input
                      value={s.name}
                      aria-label="The series’ name"
                      onChange={(e) => set({ series: el.series.map((x, k) => (k === si ? { ...x, name: e.target.value } : x)) }, `chart:name:${si}`)}
                      onKeyDown={(e) => e.stopPropagation()}
                      translate="no"
                      className={cx(cell, 'font-medium')}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {el.labels.map((l, li) => (
                <tr key={li}>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <input
                        value={l}
                        aria-label="Label"
                        onChange={(e) => set({ labels: el.labels.map((x, k) => (k === li ? e.target.value : x)) }, `chart:label:${li}`)}
                        onKeyDown={(e) => e.stopPropagation()}
                        className={cell}
                      />
                      {el.labels.length > 1 && (
                        <button
                          type="button"
                          title="Remove this row"
                          aria-label="Remove this row"
                          onClick={() => set({ labels: el.labels.filter((_, k) => k !== li), series: el.series.map((s) => ({ ...s, values: s.values.filter((_, k) => k !== li) })) })}
                          className="text-fg-3 hover:text-err"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                  {series.map((s, si) => (
                    <td key={si}>
                      <input defaultValue={String(s.values[li] ?? 0)} key={`${s.values[li]}`} inputMode="decimal" aria-label="Value" onBlur={(e) => setCell(si, li, e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && (e.target as HTMLInputElement).blur())} className={cx(cell, 'text-right tabular-nums')} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => set({ labels: [...el.labels, `Item ${el.labels.length + 1}`], series: el.series.map((s) => ({ ...s, values: [...s.values, 0] })) })}>
            A row
          </Button>
          {!pie && el.series.length < 12 && (
            <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => set({ series: [...el.series, { name: `Series ${el.series.length + 1}`, values: el.labels.map(() => 0) }] })}>
              A series
            </Button>
          )}
        </div>
        {onPlot && (
          <>
            <Button size="sm" variant="secondary" icon={<ChartScatter size={14} />} onClick={() => onPlot(el.id)}>
              Make a plot of this
            </Button>
            <p className="text-[11.5px] leading-snug text-fg-3">Any kind of plot of these numbers, drawn by code an agent writes; it takes the chart’s place.</p>
          </>
        )}
      </Section>
    </>
  );
}

function IconLook({ el, theme, set, onIcon }: { el: IconEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void; onIcon?: (id: string) => void }) {
  return (
    <Section title="Icon">
      {onIcon && (
        <Button size="sm" variant="secondary" onClick={() => onIcon(el.id)}>
          Another icon
        </Button>
      )}
      <Swatches value={el.color ?? 'accent'} theme={theme} onChange={(color) => set({ color: color ?? 'accent' } as Partial<El>)} />
      <Field label="Line width">
        <NumInput label="Line width" value={el.lineW ?? 2} onChange={(lineW) => set({ lineW: lineW === 2 ? undefined : lineW } as Partial<El>, 'lineW')} min={0.25} max={6} step={0.25} />
      </Field>
    </Section>
  );
}

/** Pieces of LaTeX to put in at the caret, with what they look like. */
const TEX_BITS: [string, string, string?][] = [
  ['\\frac{a}{b}', 'Fraction'],
  ['\\sqrt{x}', 'Square root'],
  ['x^{2}', 'Power'],
  ['x_{i}', 'Below'],
  ['\\sum_{i=1}^{n}', 'Sum'],
  ['\\int_{a}^{b}', 'Integral'],
  ['\\lim_{x \\to 0}', 'Limit'],
  ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'Matrix', '\\begin{pmatrix} a \\\\ c \\end{pmatrix}'],
  ['\\alpha', 'α'],
  ['\\pi', 'π'],
  ['\\infty', '∞'],
  ['\\leq', '≤'],
  ['\\neq', '≠'],
  ['\\times', '×'],
];

function TexBit({ tex, label, shown, onPick }: { tex: string; label: string; shown?: string; onPick: () => void }) {
  const html = useTexHtml(shown ?? tex, false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="grid h-9 min-w-9 place-items-center overflow-hidden rounded-lg border border-line px-1 text-[12px] text-fg hover:border-accent/50 hover:bg-accent-soft"
    >
      {html ? <span translate="no" className="pointer-events-none origin-center scale-[.8]" dangerouslySetInnerHTML={{ __html: html }} /> : label}
    </button>
  );
}

function MathLook({ el, theme, set, focus }: { el: MathEl; theme: Theme; set: (patch: Partial<El>, key?: string) => void; focus?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focus || !ref.current) return;
    ref.current.focus();
    ref.current.select();
  }, [focus]);
  const put = (bit: string) => {
    const t = ref.current;
    if (!t) return;
    const s = t.selectionStart ?? el.tex.length;
    const e = t.selectionEnd ?? s;
    const tex = el.tex.slice(0, s) + bit + el.tex.slice(e);
    set({ tex } as Partial<El>, 'tex');
    requestAnimationFrame(() => {
      t.focus();
      t.setSelectionRange(s + bit.length, s + bit.length);
    });
  };
  return (
    <Section title="Equation">
      <textarea
        ref={ref}
        value={el.tex}
        onChange={(e) => set({ tex: e.target.value.slice(0, 4000) } as Partial<El>, 'tex')}
        onKeyDown={(e) => e.stopPropagation()}
        rows={3}
        spellCheck={false}
        translate="no"
        aria-label="The equation in LaTeX"
        placeholder="E = mc^2"
        className="w-full min-w-0 resize-y rounded-lg border border-line bg-bg-1 px-2 py-1.5 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent/60"
      />
      <div className="flex flex-wrap gap-1">
        {TEX_BITS.map(([tex, label, shown]) => (
          <TexBit key={tex} tex={tex} label={label} shown={shown} onPick={() => put(tex)} />
        ))}
      </div>
      <Field label="Colour">
        <ColorButton value={el.color ?? 'fg'} theme={theme} onChange={(color) => set({ color } as Partial<El>)} label="Colour" />
        <Choice
          value={el.align ?? 'center'}
          onChange={(a) => set({ align: a === 'center' ? undefined : a } as Partial<El>)}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
        />
      </Field>
    </Section>
  );
}

function VideoLook({ el, set }: { el: VideoEl; set: (patch: Partial<El>, key?: string) => void }) {
  // A video the app keeps (from a device) has no address to change; an online one is changed by its address.
  const kept = !videoSrc(el.src);
  const [url, setUrl] = useState(kept ? '' : el.src.includes('vimeo') ? `https://vimeo.com/${el.src.split('/').pop()}` : `https://www.youtube.com/watch?v=${el.src.split('/').pop()}`);
  const bad = !kept && !videoSrc(url);
  // Another video, another still: the old one goes at once, the new one comes when the server has it (the last asked wins).
  const asked = useRef('');
  return (
    <Section title="Video">
      {kept ? (
        <p className="text-[12px] leading-snug text-fg-3">A video from a device, kept with the deck.</p>
      ) : (
        <input
          value={url}
          onChange={(e) => {
            const address = e.target.value;
            setUrl(address);
            const src = videoSrc(address);
            if (!src || src === el.src) return;
            set({ src, poster: undefined, ...(videoStart(address) ? { start: videoStart(address) } : {}) } as Partial<El>, 'video');
            asked.current = src;
            void fetchVideoStill(address).then((poster) => poster && asked.current === src && set({ poster } as Partial<El>, 'video'));
          }}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="The video’s address"
          placeholder="https://www.youtube.com/watch?v=…"
          translate="no"
          className={cx('h-8 w-full rounded-lg border bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60', bad ? 'border-err' : 'border-line')}
        />
      )}
      {bad && <p className="text-[11.5px] text-err">A YouTube or Vimeo address.</p>}
      <Field label="Starts at">
        <NumInput label="Seconds into the video" value={el.start ?? 0} onChange={(start) => set({ start: Math.round(start) || undefined } as Partial<El>, 'start')} min={0} max={86400} unit="s" />
      </Field>
      {(
        [
          ['autoplay', 'Plays when the slide shows'],
          ['muted', 'Without sound'],
          ['loop', 'Plays again from the start'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
          <span className="min-w-0 flex-1">{label}</span>
          <Switch label={label} on={!!el[k]} onChange={(v) => set({ [k]: v || undefined } as Partial<El>)} />
        </label>
      ))}
      <p className="text-[11.5px] leading-snug text-fg-3">
        {kept ? 'It plays in the slideshow when clicked, and goes into PowerPoint as its own video.' : 'It plays in the slideshow when clicked; in PowerPoint it is its picture, linked to the video.'}
      </p>
    </Section>
  );
}

function FormatTab({ deck, index, sel, change, onSel, onReplaceImage, onAsk, cropping, onCrop, onIcon, onGroup, onUngroup, cellSel, onCellSel, texFocus, running, onRun, pickPicture, pickModel, onAiEdit, onPlotChart }: Props) {
  const slide = deck.slides[index];
  const web = isWebDeck(deck);
  const els = pickedOf(slide, sel);
  const H = heightOf(deck);
  if (!els.length)
    return (
      <div className="space-y-2 px-3 py-3 text-[12.5px] leading-relaxed text-fg-3">
        <p>Click a part of the slide to change it; Shift-click or drag across the slide to pick several.</p>
        <p>Double-click words to change them, a picture to crop it, a group to pick a part of it, a table’s cell to type in it.</p>
      </div>
    );
  if (els.length > 1)
    return (
      <>
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">{els.length} parts picked</span>
          {onGroup && (
            <Button size="sm" variant="secondary" icon={<GroupIcon size={14} />} onClick={onGroup}>
              Group them
            </Button>
          )}
        </div>
        <Arrange deck={deck} index={index} ids={sel} change={change} />
        <Section title="Remove">
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} className="text-err" onClick={() => (change((d) => removeEls(d, index, sel)), onSel([]))}>
            Delete them
          </Button>
        </Section>
      </>
    );
  const el = els[0];
  // A group sized from the panel sizes its parts with it.
  const set = (patch: Partial<El>, key?: string) =>
    change(
      (d) => setEls(d, index, [el.id], (e) => (e.type === 'group' && (patch.w !== undefined || patch.h !== undefined) ? ({ ...e, ...patch, els: scaleEls(e.els, (patch.w ?? e.w) / e.w, (patch.h ?? e.h) / e.h) } as El) : ({ ...e, ...patch } as El))),
      key ? `${key}:${el.id}` : undefined,
    );
  return (
    <>
      <div className="flex items-center gap-1.5 px-3 pt-3">
        <input
          value={el.name ?? ''}
          placeholder={partName(el)}
          aria-label="Its name"
          onChange={(e) => set({ name: e.target.value || undefined }, 'name')}
          onKeyDown={(e) => e.stopPropagation()}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 text-[13px] font-semibold outline-none placeholder:text-fg hover:border-line focus:border-accent/60"
        />
        <Tool label={el.lock ? 'Unlock it' : 'Lock it in place'} on={!!el.lock} onClick={() => set({ lock: !el.lock || undefined })}>
          {el.lock ? <Lock size={14} /> : <Unlock size={14} />}
        </Tool>
        <Tool label="Delete" onClick={() => (change((d) => removeEls(d, index, [el.id])), onSel([]))}>
          <Trash2 size={14} />
        </Tool>
      </div>
      {onAsk && el.type !== 'html' && (
        <div className="px-3 pt-2">
          <Button
            size="sm"
            variant="secondary"
            icon={<Sparkles size={14} />}
            className="w-full justify-center"
            onClick={() => onAsk(`On slide ${index + 1}, the ${partName(el).replace(/^(\w)/, (c) => c.toLowerCase())}: `)}
          >
            Ask the agent about it
          </Button>
        </div>
      )}
      {el.type === 'group' && (
        <Section title="Group">
          <p className="text-[12px] leading-snug text-fg-3">{`${el.els.length} parts that move as one. Double-click one to change it on its own.`}</p>
          {onUngroup && (
            <Button size="sm" variant="secondary" icon={<UngroupIcon size={14} />} onClick={() => onUngroup(el.id)}>
              Ungroup
            </Button>
          )}
        </Section>
      )}
      {(el.type === 'text' || el.type === 'shape') && <TextLook el={el} theme={deck.theme} set={set} web={web} />}
      {(el.type === 'text' || el.type === 'shape') && <BoxLook el={el} theme={deck.theme} set={set} web={web} />}
      {el.type === 'image' && <PictureLook el={el} theme={deck.theme} set={set} onReplace={() => onReplaceImage(el.id)} cropping={cropping === el.id} onCrop={onCrop} onAi={onAiEdit} />}
      {el.type === 'image' && el.src && <PictureColours el={el} set={set} />}
      {el.type === 'line' && <LineLook el={el} theme={deck.theme} set={set} />}
      {el.type === 'table' && <TableLook el={el} theme={deck.theme} set={set} cellSel={cellSel} onCellSel={onCellSel} />}
      {el.type === 'chart' && <ChartLook el={el} theme={deck.theme} set={set} onPlot={onPlotChart} />}
      {el.type === 'icon' && <IconLook el={el} theme={deck.theme} set={set} onIcon={onIcon} />}
      {el.type === 'math' && <MathLook el={el} theme={deck.theme} set={set} focus={texFocus} />}
      {el.type === 'video' && <VideoLook key={el.id} el={el} set={set} />}
      {el.type === 'code' && <CodeLook el={el} set={set} />}
      {el.type === 'html' && (
        <HtmlLook
          el={el}
          set={set}
          running={running === el.id}
          onRun={(id) => onRun?.(id)}
          onAsk={onAsk ? () => onAsk(`On slide ${index + 1}, the ${partName(el).replace(/^(\w)/, (c) => c.toLowerCase())}: `) : undefined}
          pickPicture={pickPicture}
        />
      )}
      {el.type === 'embed' && <EmbedLook key={el.id} el={el} set={set} pickPicture={pickPicture} />}
      {el.type === 'quiz' && <QuizLook el={el} theme={deck.theme} set={set} />}
      {el.type === 'score' && <ScoreLook el={el} theme={deck.theme} set={set} />}
      {el.type === 'scene3d' && <Scene3dLook el={el} theme={deck.theme} set={set} pickModel={pickModel ?? (async () => null)} pickPicture={pickPicture} />}
      <Place el={el} slide={slide} set={set} H={H} />
      <Arrange deck={deck} index={index} ids={[el.id]} change={change} />
      {web && <HoverField el={el} set={set} />}
      <Section title="Link">
        <input
          value={el.link ?? ''}
          onChange={(e) => set({ link: e.target.value.trim() || undefined }, 'link')}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="https://… or #3 for slide 3"
          className="h-8 w-full rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60"
        />
        <p className="text-[11.5px] text-fg-3">Clicked in the slideshow, it opens the address or goes to the slide.</p>
      </Section>
    </>
  );
}

// ---- Animate -----------------------------------------------------------------------------------------------

const TYPE_NAMES: Record<Anim['type'], string> = { in: 'Comes in', em: 'Stands out', out: 'Goes out' };
const ON_NAMES: Record<Anim['on'], string> = { click: 'On a click', with: 'With the one before', after: 'After the one before', tap: 'When a part is clicked' };
// The side a part comes in from, or goes out to.
const DIR_NAMES: Record<Dir, string> = { left: 'The left', right: 'The right', up: 'The top', down: 'The bottom' };

// How an effect speeds up and slows down (the web format).
const EASE_NAMES: Record<Ease, string> = { smooth: 'Smoothly', spring: 'With a spring', bounce: 'With a bounce', linear: 'Steadily', snap: 'Snappily' };

/** The effects a kind of animation offers a part: PowerPoint's, and in a web deck the web format's that suit it. */
function effectsFor(type: Anim['type'], el: El | undefined, web: boolean): AnimFx[] {
  if (!web) return ANIM_FX[type];
  const words = !!el && (el.type === 'text' || el.type === 'shape');
  const lines = !!el && (el.type === 'line' || el.type === 'shape' || el.type === 'icon');
  return [...ANIM_FX[type], ...RICH_ANIM_FX[type].filter((fx) => (fx === 'typewriter' || fx === 'count' ? words : fx === 'draw' ? lines : true))];
}

function AnimateTab({ deck, index, sel, change, onSel, onPreview, picking, onPickTrigger }: Props) {
  const slide = deck.slides[index];
  const web = isWebDeck(deck);
  const [type, setType] = useState<Anim['type']>('in');
  const [open, setOpen] = useState<string | null>(null);
  const anims = slide.anims ?? [];
  // A part of a group moves with its group: the group is what is animated.
  const target = sel.length === 1 ? topOf(slide, sel[0]) : undefined;
  const text = target && (target.type === 'text' || target.type === 'shape') && target.paras.length > 1;
  let clicks = 0;
  return (
    <>
      <AnimateEvery deck={deck} index={index} change={change} />
      <Section title="Add an animation">
        {target ? (
          <>
            <p className="truncate text-[12px] text-fg-3">For {partName(target)}</p>
            <Choice
              value={type}
              onChange={setType}
              options={(['in', 'em', 'out'] as const).map((t) => ({ value: t, label: TYPE_NAMES[t] }))}
            />
            <div className={cx('grid gap-1', web ? 'grid-cols-3' : 'grid-cols-4')}>
              {effectsFor(type, target, web).map((fx) => (
                <button
                  key={fx}
                  type="button"
                  title={FX_NAMES[fx]}
                  onClick={() => {
                    const id = newId();
                    change((d) => addAnim(d, index, { el: target.id, type, fx, on: 'click', dur: effectDur(fx), delay: 0, ...(ANIM_DIR.includes(fx) ? { dir: fx === 'float' ? 'up' : 'left' } : {}), ...(text && type === 'in' && fx !== 'typewriter' ? { byPara: true } : {}) }, id));
                    setOpen(id);
                  }}
                  className="min-h-8 rounded-lg border border-line px-1 py-1 text-[12px] leading-tight text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft hover:text-fg"
                >
                  {FX_NAMES[fx]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-fg-3">Pick a part of the slide to animate it.</p>
        )}
      </Section>
      <Section
        title="In order"
        aside={
          anims.length > 0 && (
            <Button size="sm" variant="ghost" icon={<Play size={13} />} onClick={onPreview} className="h-7">
              Play
            </Button>
          )
        }
      >
        {!anims.length && <p className="text-[12.5px] text-fg-3">Nothing on this slide moves yet.</p>}
        <div className="space-y-1">
          {anims.map((a, k) => {
            const el = slide.els.find((e) => e.id === a.el);
            if (a.on === 'click') clicks++;
            const isOpen = open === a.id;
            const set = (patch: Partial<Anim>) => change((d) => setAnim(d, index, a.id, patch), `anim:${a.id}`);
            const trigger = a.on === 'tap' && a.trigger ? slide.els.find((e) => e.id === a.trigger) : undefined;
            const words = !!el && (el.type === 'text' || el.type === 'shape');
            // The parts a click on which could start it: the one it moves first (a click on it runs its own), then the slide's others.
            const triggers = [...slide.els.filter((e) => e.id === a.el), ...slide.els.filter((e) => e.id !== a.el)];
            return (
              <div key={a.id} className={cx('rounded-lg border', isOpen ? 'border-accent/40 bg-bg-1' : 'border-line')}>
                <div className="flex items-center gap-1 py-1 pr-1 pl-2">
                  <span className="flex w-6 shrink-0 items-center justify-center text-[11px] font-semibold text-fg-3" title={a.on === 'tap' ? `${ON_NAMES.tap}: ${trigger ? partName(trigger) : '—'}` : ON_NAMES[a.on]}>
                    {a.on === 'click' ? (
                      <span className="flex items-center gap-0.5">
                        <MousePointerClick size={11} />
                        {clicks}
                      </span>
                    ) : a.on === 'tap' ? (
                      <Pointer size={13} />
                    ) : a.on === 'with' ? (
                      '＝'
                    ) : (
                      '↳'
                    )}
                  </span>
                  <button type="button" onClick={() => (setOpen(isOpen ? null : a.id), el && onSel([el.id]))} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[12.5px] text-fg">
                      {FX_NAMES[a.fx]} · {TYPE_NAMES[a.type].toLowerCase()}
                      {a.loop ? ' · ∞' : ''}
                    </span>
                    <span translate="no" className="block truncate text-[11.5px] text-fg-3">
                      {el ? partName(el) : '—'}
                    </span>
                  </button>
                  <Tool label="Earlier" disabled={k === 0} onClick={() => change((d) => moveAnim(d, index, a.id, -1))} className="h-7 min-w-7">
                    <ArrowUp size={13} />
                  </Tool>
                  <Tool label="Later" disabled={k === anims.length - 1} onClick={() => change((d) => moveAnim(d, index, a.id, 1))} className="h-7 min-w-7">
                    <ArrowDown size={13} />
                  </Tool>
                  <Tool label="Remove" onClick={() => change((d) => removeAnim(d, index, a.id))} className="h-7 min-w-7">
                    <X size={13} />
                  </Tool>
                </div>
                {isOpen && (
                  <div className="space-y-1.5 border-t border-line px-2 py-2">
                    <Field label="Effect">
                      <Select
                        value={a.fx}
                        onChange={(fx) => set({ fx: fx as AnimFx, ...(ANIM_DIR.includes(fx as AnimFx) ? { dir: a.dir ?? 'left' } : { dir: undefined }) })}
                        options={[...new Set([...effectsFor(a.type, el, web), a.fx])].map((f) => ({ value: f, label: FX_NAMES[f] }))}
                      />
                    </Field>
                    {ANIM_DIR.includes(a.fx) && (
                      <Field label={a.type === 'out' ? 'To' : 'From'}>
                        <Select value={a.dir ?? 'left'} onChange={(dir) => set({ dir: dir as Dir })} options={(['left', 'right', 'up', 'down'] as Dir[]).map((x) => ({ value: x, label: DIR_NAMES[x] }))} />
                      </Field>
                    )}
                    <Field label="Starts">
                      <Select
                        value={a.on}
                        onChange={(on) => set(on === 'tap' ? { on: 'tap', byPara: undefined, trigger: a.trigger && triggers.some((e) => e.id === a.trigger) ? a.trigger : (triggers.find((e) => e.id !== a.el) ?? triggers[0])?.id } : { on: on as Anim['on'], trigger: undefined })}
                        options={(web || a.on === 'tap' ? (['click', 'with', 'after', 'tap'] as const) : (['click', 'with', 'after'] as const)).map((x) => ({ value: x, label: ON_NAMES[x] }))}
                      />
                    </Field>
                    {a.on === 'tap' && (
                      <>
                        <Field label="The part">
                          <Select
                            value={a.trigger ?? ''}
                            onChange={(trigger) => set({ trigger: trigger || undefined })}
                            options={[{ value: '', label: 'Pick one' }, ...triggers.map((e) => ({ value: e.id, label: e.id === a.el ? `${partName(e)} (itself)` : partName(e) }))]}
                            title="The part a click on which starts it"
                          />
                          {onPickTrigger && (
                            <Tool label={picking === a.id ? 'Picking it on the slide: Esc to stop' : 'Pick it on the slide'} on={picking === a.id} onClick={() => onPickTrigger(picking === a.id ? null : a.id)}>
                              <MousePointerClick size={15} />
                            </Tool>
                          )}
                        </Field>
                        <p className="text-[11.5px] leading-snug text-fg-3">In the slideshow, each click on that part plays it again, outside the slide’s clicks.</p>
                      </>
                    )}
                    <Field label="Timing">
                      <NumInput label="How long" value={a.dur / 1000} onChange={(v) => set({ dur: Math.round(v * 1000) })} min={0} max={20} step={0.1} unit="s" />
                      <NumInput label="Wait first" value={a.delay / 1000} onChange={(v) => set({ delay: Math.round(v * 1000) })} min={0} max={60} step={0.1} unit="s" />
                    </Field>
                    {web && (
                      <Field label="It moves">
                        <Select value={a.ease ?? 'smooth'} onChange={(ease) => set({ ease: ease === 'smooth' ? undefined : (ease as Ease) })} options={EASES.map((x) => ({ value: x, label: EASE_NAMES[x] }))} title="How it speeds up and slows down" />
                      </Field>
                    )}
                    {web && words && (
                      <Field label="Words">
                        <Select
                          value={a.by ?? ''}
                          onChange={(by) => set({ by: (by || undefined) as Anim['by'], ...(by ? { byPara: undefined } : {}) })}
                          options={[
                            { value: '', label: 'All at once' },
                            { value: 'word', label: 'Word by word' },
                            { value: 'letter', label: 'Letter by letter' },
                          ]}
                          title="How the words come"
                        />
                      </Field>
                    )}
                    {web && a.type === 'em' && (
                      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
                        <span className="min-w-0 flex-1">Keep going</span>
                        <Switch label="Keep going, again and again" on={!!a.loop} onChange={(loop) => set({ loop: loop || undefined })} />
                      </label>
                    )}
                    {el && (el.type === 'text' || el.type === 'shape') && el.paras.length > 1 && !a.by && a.on !== 'tap' && (
                      <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
                        <span className="min-w-0 flex-1">A paragraph at a time</span>
                        <Switch label="A paragraph at a time" on={!!a.byPara} onChange={(byPara) => set({ byPara: byPara || undefined })} />
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

// ---- Slide ----------------------------------------------------------------------------------------------------


/** What a video the deck keeps is called: the name of a video part that plays it. */
const videoName = (d: Deck, src: string) => {
  for (const s of d.slides) for (const e of everyEl(s.els)) if (e.type === 'video' && e.src === src && e.name) return e.name;
  return undefined;
};

/** The web format's moving backgrounds, by name. */
const BG_FX_NAMES: Record<BgFx, string> = { aurora: 'Northern lights', particles: 'Drifting specks', stars: 'Starry sky', waves: 'Waves', mesh: 'Colour mesh', grid: 'Moving grid', bokeh: 'Soft lights' };

/** A still of a moving background in the deck's theme, to pick it by. */
function BgFxThumb({ deck, fx, fonts }: { deck: Deck; fx: BgFx | undefined; fonts: number }) {
  const sample = useRef<{ key: string; deck: Deck } | null>(null);
  const key = `${fx ?? ''}|${deck.ratio}`;
  if (!sample.current || sample.current.key !== key) sample.current = { key, deck: { ...deck, footer: undefined, slides: [{ id: `bgfx-${fx ?? 'none'}`, els: [], ...(fx ? { bg: { fx } } : {}) }] } };
  const d = sample.current.deck;
  return <SlideThumb deck={d} index={0} slide={d.slides[0]} theme={deck.theme} width={60} fonts={fonts} />;
}

function SlideTab({ deck, index, change, pickPicture, onFooter, pickVideo, fonts, onAiBackground }: Props) {
  const slide = deck.slides[index];
  const t = deck.theme;
  const web = isWebDeck(deck);
  const [sending, setSending] = useState(false);
  // The videos the deck keeps already (its video parts'), to put one behind a slide too.
  const kept = [...new Set(deck.slides.flatMap((s) => everyEl(s.els).flatMap((e) => (e.type === 'video' && e.src.startsWith('naget-video:') ? [e.src] : []))).concat(deck.slides.flatMap((s) => (s.bg?.video ? [s.bg.video] : []))))];
  const bg = slide.bg ?? {};
  const setBg = (patch: Partial<NonNullable<Slide['bg']>> | null) =>
    change((d) =>
      setSlide(d, index, (s) => {
        const next = patch === null ? undefined : { ...(s.bg ?? {}), ...patch };
        const clean = next && Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
        const { bg: _b, ...rest } = s;
        return clean && Object.keys(clean).length ? { ...rest, bg: clean } : rest;
      }),
    );
  const tr = slide.transition ?? { fx: 'none' as TransitionFx };
  const setTr = (patch: Partial<NonNullable<Slide['transition']>>, all = false) =>
    change((d) => ({
      ...d,
      slides: d.slides.map((s, i) => {
        if (!all && i !== index) return s;
        const next = { ...(all ? tr : (s.transition ?? { fx: 'none' as TransitionFx })), ...patch };
        const { transition: _t, ...rest } = s;
        return next.fx === 'none' && !next.auto ? rest : { ...rest, transition: next };
      }),
    }));
  return (
    <>
      <Section title="Background">
        <Swatches value={bg.color} theme={t} none="The theme’s" onChange={(color) => setBg({ color, ...(color ? {} : { to: undefined, angle: undefined }) })} />
        {bg.color && (
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Fade into another colour</span>
            <Switch label="Fade into another colour" on={!!bg.to} onChange={(on) => setBg({ to: on ? 'soft' : undefined, angle: on ? (bg.angle ?? 135) : undefined })} />
          </label>
        )}
        {bg.to && (
          <Field label="Into">
            <ColorButton value={bg.to} theme={t} onChange={(to) => setBg({ to: to ?? 'bg' })} label="Second colour" />
            <NumInput label="Direction" value={bg.angle ?? 180} onChange={(angle) => setBg({ angle })} min={0} max={360} step={15} unit="°" />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            icon={<ImagePlus size={14} />}
            onClick={async () => {
              const p = await pickPicture();
              if (p) setBg({ image: p.src });
            }}
          >
            {bg.image ? 'Another picture' : 'A picture'}
          </Button>
          {onAiBackground && (
            <Button size="sm" variant="secondary" icon={<WandSparkles size={14} />} onClick={onAiBackground}>
              Make with AI
            </Button>
          )}
          {bg.image && (
            <Button size="sm" variant="ghost" onClick={() => setBg({ image: undefined, dim: undefined })}>
              No picture
            </Button>
          )}
        </div>
        {(bg.image || (web && bg.video)) && (
          <Field label="Darker">
            <input type="range" min={0} max={0.8} step={0.05} value={bg.dim ?? 0} onChange={(e) => setBg({ dim: Number(e.target.value) || undefined })} className="w-full accent-[var(--accent)]" aria-label="Darker" />
          </Field>
        )}
        {web && (
          <>
            <div className="pt-1 text-[12px] text-fg-3">Moving background</div>
            <div className="grid grid-cols-4 gap-1">
              {[undefined, ...BG_FX].map((fx) => (
                <button
                  key={fx ?? 'none'}
                  type="button"
                  title={fx ? BG_FX_NAMES[fx] : 'None'}
                  aria-label={fx ? BG_FX_NAMES[fx] : 'No moving background'}
                  aria-pressed={bg.fx === fx}
                  onClick={() => setBg({ fx })}
                  className={cx('overflow-hidden rounded-md border text-left transition-colors', bg.fx === fx ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
                >
                  <BgFxThumb deck={deck} fx={fx} fonts={fonts} />
                  <span className="line-clamp-2 block min-h-[2.4em] px-1 py-0.5 text-[10.5px] leading-tight text-fg-2">{fx ? BG_FX_NAMES[fx] : 'None'}</span>
                </button>
              ))}
            </div>
            <p className="text-[11.5px] leading-snug text-fg-3">It moves in the slideshow, in the theme’s colours; here and in pictures of the slide it is still.</p>
            <div className="pt-1 text-[12px] text-fg-3">A video behind it</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {pickVideo && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<VideoIcon size={14} />}
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    try {
                      const src = await pickVideo();
                      if (src) setBg({ video: src });
                    } finally {
                      setSending(false);
                    }
                  }}
                >
                  {sending ? 'Adding the video…' : bg.video ? 'Another video' : 'From this device'}
                </Button>
              )}
              {kept.filter((v) => v !== bg.video).length > 0 && (
                <Select
                  value=""
                  className="w-[150px]"
                  title="A video the deck has already"
                  onChange={(video) => video && setBg({ video })}
                  options={[{ value: '', label: 'One in this deck' }, ...kept.filter((v) => v !== bg.video).map((v, i) => ({ value: v, label: videoName(deck, v) ?? `Video ${i + 1}` }))]}
                />
              )}
              {bg.video && (
                <Button size="sm" variant="ghost" onClick={() => setBg({ video: undefined })}>
                  No video
                </Button>
              )}
            </div>
            {bg.video && <p className="text-[11.5px] leading-snug text-fg-3">It plays without sound, again and again, behind the slide in the slideshow; here it is its first picture.</p>}
          </>
        )}
        {(bg.color || bg.image || bg.fx || bg.video) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" variant="ghost" onClick={() => change((d) => ({ ...d, slides: d.slides.map((s) => ({ ...s, bg: slide.bg })) }))}>
              Use on every slide
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBg(null)}>
              Back to the theme’s
            </Button>
          </div>
        )}
      </Section>
      <Section title="Transition">
        <p className="text-[12px] leading-snug text-fg-3">How this slide comes in, in the slideshow.</p>
        <div className="grid grid-cols-4 gap-1">
          {(web ? [...TRANSITIONS, ...RICH_TRANSITIONS] : TRANSITIONS).map((fx) => (
            <button
              key={fx}
              type="button"
              onClick={() => setTr({ fx, ...(fx === 'push' || fx === 'wipe' || fx === 'cover' ? { dir: tr.dir ?? 'right' } : { dir: undefined }), dur: fx === 'none' ? undefined : fx === 'morph' ? Math.max(tr.dur ?? 1000, 800) : (tr.dur ?? transitionDur(fx)) })}
              title={TR_NAMES[fx]}
              className={cx('h-8 truncate rounded-lg border px-1 text-[12px] transition-colors', tr.fx === fx ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-2 hover:bg-bg-1')}
            >
              {TR_NAMES[fx]}
            </button>
          ))}
        </div>
        {(tr.fx === 'push' || tr.fx === 'wipe' || tr.fx === 'cover') && (
          <Field label="From">
            <Select value={tr.dir ?? 'right'} onChange={(dir) => setTr({ dir: dir as Dir })} options={(['right', 'left', 'down', 'up'] as Dir[]).map((x) => ({ value: x, label: x === 'right' ? 'The right' : x === 'left' ? 'The left' : x === 'down' ? 'The bottom' : 'The top' }))} />
          </Field>
        )}
        {tr.fx === 'morph' && <p className="text-[12px] leading-snug text-fg-3">What this slide shares with the one before glides into place: duplicate a slide, then move, size, turn or recolour its parts.</p>}
        {tr.fx !== 'none' && (
          <Field label="How long">
            <NumInput label="How long" value={(tr.dur ?? 600) / 1000} onChange={(v) => setTr({ dur: Math.round(v * 1000) })} min={0.1} max={5} step={0.1} unit="s" />
          </Field>
        )}
        <Field label="Goes on">
          <Select
            value={tr.auto ? 'auto' : 'click'}
            onChange={(v) => setTr({ auto: v === 'auto' ? 5 : undefined })}
            options={[
              { value: 'click', label: 'On a click' },
              { value: 'auto', label: 'By itself' },
            ]}
          />
          {!!tr.auto && <NumInput label="Seconds before it goes on" value={tr.auto} onChange={(auto) => setTr({ auto: auto || undefined })} min={0.5} max={3600} step={0.5} unit="s" className="w-[90px]" />}
        </Field>
        <Button size="sm" variant="ghost" onClick={() => setTr({}, true)}>
          Use on every slide
        </Button>
      </Section>
      <Section title="In the slideshow">
        <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
          <span className="min-w-0 flex-1">Skip this slide</span>
          <Switch label="Skip this slide" on={!!slide.hidden} onChange={(hidden) => change((d) => setSlide(d, index, (s) => ({ ...s, hidden: hidden || undefined })))} />
        </label>
      </Section>
      <Section title="Footer">
        <p className="text-[12px] leading-snug text-fg-3">
          {deck.footer
            ? [deck.footer.num && 'Slide numbers', deck.footer.text?.trim() && 'Footer words', deck.footer.date && 'The date'].filter(Boolean).join(' · ') + (deck.footer.skipTitle ? ' · Not on the title slide' : '')
            : 'No slide numbers or footer.'}
        </p>
        {onFooter && (
          <Button size="sm" variant="secondary" onClick={onFooter}>
            Slide numbers and footer
          </Button>
        )}
        {deck.footer && (
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Leave it off this slide</span>
            <Switch label="Leave it off this slide" on={!!slide.nofooter} onChange={(off) => change((d) => setSlide(d, index, (s) => ({ ...s, nofooter: off || undefined })))} />
          </label>
        )}
      </Section>
    </>
  );
}

// ---- Theme ------------------------------------------------------------------------------------------------

const SAMPLE = (theme: Theme): Deck => ({
  v: 1,
  ratio: '16:9',
  theme,
  slides: [
    {
      id: 'sample',
      els: [
        { id: 't', type: 'text', x: 80, y: 220, w: 1120, h: 170, paras: [{ runs: [{ t: 'Aa' }] }], role: 'title', size: 150, bold: true, valign: 'bottom', lh: 1 },
        { id: 'b', type: 'shape', shape: 'round', x: 90, y: 420, w: 120, h: 14, fill: 'accent', radius: 7, paras: [{ runs: [{ t: '' }] }], size: 20 },
        { id: 's', type: 'text', x: 80, y: 460, w: 1120, h: 80, paras: [{ runs: [{ t: theme.headFont === theme.font ? theme.font : `${theme.headFont} · ${theme.font}` }] }], size: 44, color: 'muted' },
      ],
    },
  ],
});

function ThemeTab({ deck, change, fonts, onCompatible }: Props) {
  const web = isWebDeck(deck);
  const t = deck.theme;
  const setT = (patch: Partial<Theme>) => change((d) => ({ ...d, theme: { ...d.theme, ...patch, id: undefined } }), 'theme');
  const colors: [keyof Theme, string][] = [
    ['bg', 'Background'],
    ['fg', 'Text'],
    ['head', 'Headings'],
    ['muted', 'Quiet text'],
    ['accent', 'Accent'],
    ['accentFg', 'On the accent'],
    ['soft', 'Soft fill'],
  ];
  const ratio = (r: Deck['ratio']) =>
    change((d) => {
      if (d.ratio === r) return d;
      const k = slideH(r) / slideH(d.ratio);
      return { ...d, ratio: r, slides: d.slides.map((s) => ({ ...s, els: s.els.map((e) => ({ ...e, y: Math.round(e.y * k), h: Math.round(e.h * k) })) })) };
    });
  return (
    <>
      <Section title="Ready-made">
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((p) => {
            const own: Theme = { id: p.id, bg: p.bg, fg: p.fg, head: p.head, muted: p.muted, accent: p.accent, accentFg: p.accentFg, soft: p.soft, colors: [...p.colors], font: p.font, headFont: p.headFont };
            const sample = SAMPLE(own);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => change((d) => ({ ...d, theme: own }))}
                className={cx('overflow-hidden rounded-lg border text-left transition-colors', t.id === p.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-line-2')}
              >
                <SlideThumb deck={sample} index={0} slide={sample.slides[0]} theme={own} width={132} fonts={fonts} />
                <span className="block truncate px-2 py-1 text-[12px] text-fg-2">{p.label}</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Colours">
        {colors.map(([k, label]) => (
          <Field key={k} label={label}>
            <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-line-2" style={{ background: String(t[k]) }} title={label}>
              <input type="color" value={String(t[k]).slice(0, 7)} onChange={(e) => setT({ [k]: e.target.value } as Partial<Theme>)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label} />
            </label>
            <span translate="no" className="font-mono text-[11.5px] text-fg-3">
              {String(t[k])}
            </span>
          </Field>
        ))}
        <Field label="Charts">
          {t.colors.map((c, i) => (
            <label key={i} className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line-2" style={{ background: c }} title={`Colour ${i + 1}`}>
              <input type="color" value={c.slice(0, 7)} onChange={(e) => setT({ colors: t.colors.map((x, k) => (k === i ? e.target.value : x)) })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`Colour ${i + 1}`} />
            </label>
          ))}
        </Field>
      </Section>
      <Section title="Fonts">
        <Field label="Headings">
          <Select value={t.headFont} onChange={(headFont) => setT({ headFont })} options={FONTS.map((f) => ({ value: f.name, label: f.name }))} />
        </Field>
        <Field label="Body">
          <Select value={t.font} onChange={(font) => setT({ font })} options={FONTS.map((f) => ({ value: f.name, label: f.name }))} />
        </Field>
      </Section>
      <Section title="Slide shape">
        <Choice
          value={deck.ratio}
          onChange={ratio}
          options={[
            { value: '16:9', label: 'Wide (16:9)' },
            { value: '4:3', label: 'Standard (4:3)' },
          ]}
        />
      </Section>
      <Section title="Made for">
        <Choice
          value={web ? 'web' : 'pptx'}
          onChange={(v) => (v === 'pptx') === web && onCompatible?.(v === 'pptx')}
          options={[
            { value: 'web', label: 'The web', title: 'Everything: custom code, quizzes, 3D, the web’s effects' },
            { value: 'pptx', label: 'PowerPoint', title: 'PowerPoint compatible: only what PowerPoint has' },
          ]}
        />
        <p className="text-[11.5px] leading-snug text-fg-3">
          {web
            ? 'Custom code, quizzes, 3D and the web’s effects; its PowerPoint file has them as pictures or PowerPoint’s nearest.'
            : 'PowerPoint compatible: only what PowerPoint has, so its PowerPoint file keeps everything.'}
        </p>
        {web && (
          <label className="flex min-h-8 items-center gap-2 text-[12.5px] text-fg-2">
            <span className="min-w-0 flex-1">Progress bar in the slideshow</span>
            <Switch label="Progress bar in the slideshow" on={!!deck.progress} onChange={(on) => change((d) => ({ ...d, progress: on || undefined }))} />
          </label>
        )}
      </Section>
    </>
  );
}

export function Inspector(p: Props & { tab: InspectorTab }) {
  if (p.tab === 'animate') return <AnimateTab {...p} />;
  if (p.tab === 'slide') return <SlideTab {...p} />;
  if (p.tab === 'theme') return <ThemeTab {...p} />;
  return <FormatTab {...p} />;
}

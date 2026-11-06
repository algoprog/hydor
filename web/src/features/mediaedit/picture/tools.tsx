// The picture editor's tools as the rail shows them (in Photoshop's groups and with its keys), and the options bar of
// the tool in use: the brush's size, hardness, opacity and flow; how a selection is made (new, added, taken away,
// crossed), its feather, the wand's tolerance; the crop's shape, straightening and turns, applied or cancelled; a free
// transform's size and turn; words' font, size and what is behind them; a shape's line and fill; an emoji; how hidden an
// area is; the zoom.
import { useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bandage,
  Blend,
  Brush,
  Check as CheckIcon,
  Circle,
  CircleDashed,
  Crop,
  Droplets,
  Eraser,
  Flame,
  Grid3x3,
  Hand,
  Highlighter,
  Lasso,
  LassoSelect,
  Maximize,
  Minus,
  Move,
  PaintBucket,
  PenLine,
  Pipette,
  RotateCcw,
  RotateCw,
  Smile,
  Square,
  SquareDashed,
  Stamp,
  Sun,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  Type,
  Wand2,
  X,
  ZoomIn,
} from 'lucide-react';
import { CROP_SHAPES, MARK_FONTS, type CropShape, type FontId } from '@shared/mediaedit';
import { Button, IconButton, Popover } from '../../../components/ui';
import { Check, ColorButton, MiniSelect, OptionsBar, OptionsLabel, OptionsSep, ScrubNumber, Seg, type RailGroup } from '../shell';
import type { PictureEd, ToolId } from './editor';
import { cropOfShape, cropRatio } from './interact';
import { EmojiGrid } from './panels';
import { useEd } from './View';

export const TOOL_GROUPS: RailGroup[] = [
  { id: 'move', tools: [{ id: 'move', label: 'Move', icon: <Move size={17} />, keys: 'V' }] },
  {
    id: 'marquee',
    tools: [
      { id: 'marquee-rect', label: 'Rectangle select', icon: <SquareDashed size={17} />, keys: 'M' },
      { id: 'marquee-ellipse', label: 'Ellipse select', icon: <CircleDashed size={17} />, keys: 'M' },
    ],
  },
  {
    id: 'lasso',
    tools: [
      { id: 'lasso', label: 'Lasso', icon: <Lasso size={17} />, keys: 'L' },
      { id: 'lasso-poly', label: 'Polygon lasso', icon: <LassoSelect size={17} />, keys: 'L' },
    ],
  },
  { id: 'wand', tools: [{ id: 'wand', label: 'Magic wand', icon: <Wand2 size={17} />, keys: 'W' }] },
  { id: 'crop', tools: [{ id: 'crop', label: 'Crop', icon: <Crop size={17} />, keys: 'C' }] },
  { id: 'eyedropper', tools: [{ id: 'eyedropper', label: 'Eyedropper', icon: <Pipette size={17} />, keys: 'I' }] },
  { id: 'heal', gap: true, tools: [{ id: 'heal', label: 'Spot healing brush', icon: <Bandage size={17} />, keys: 'J' }] },
  { id: 'brush', tools: [{ id: 'brush', label: 'Brush', icon: <Brush size={17} />, keys: 'B' }] },
  { id: 'clone', tools: [{ id: 'clone', label: 'Clone stamp', icon: <Stamp size={17} />, keys: 'S' }] },
  { id: 'eraser', tools: [{ id: 'eraser', label: 'Eraser', icon: <Eraser size={17} />, keys: 'E' }] },
  {
    id: 'fill',
    tools: [
      { id: 'gradient', label: 'Gradient', icon: <Blend size={17} />, keys: 'G' },
      { id: 'bucket', label: 'Paint bucket', icon: <PaintBucket size={17} />, keys: 'G' },
    ],
  },
  {
    id: 'tone',
    tools: [
      { id: 'dodge', label: 'Dodge (lighten)', icon: <Sun size={17} />, keys: 'O' },
      { id: 'burn', label: 'Burn (darken)', icon: <Flame size={17} />, keys: 'O' },
    ],
  },
  { id: 'text', gap: true, tools: [{ id: 'text', label: 'Text', icon: <Type size={17} />, keys: 'T' }] },
  {
    id: 'shape',
    tools: [
      { id: 'shape-rect', label: 'Rectangle', icon: <Square size={17} />, keys: 'U' },
      { id: 'shape-ellipse', label: 'Oval', icon: <Circle size={17} />, keys: 'U' },
      { id: 'shape-line', label: 'Straight line', icon: <Minus size={17} className="-rotate-45" />, keys: 'U' },
      { id: 'shape-arrow', label: 'Arrow', icon: <ArrowUpRight size={17} />, keys: 'U' },
      { id: 'shape-pen', label: 'Freehand line', icon: <PenLine size={17} />, keys: 'U' },
      { id: 'shape-highlighter', label: 'Highlighter', icon: <Highlighter size={17} />, keys: 'U' },
      { id: 'shape-emoji', label: 'Emoji', icon: <Smile size={17} />, keys: 'U' },
    ],
  },
  {
    id: 'hide',
    tools: [
      { id: 'hide-blur', label: 'Blur an area', icon: <Droplets size={17} /> },
      { id: 'hide-pixelate', label: 'Pixelate an area', icon: <Grid3x3 size={17} /> },
    ],
  },
  { id: 'hand', gap: true, tools: [{ id: 'hand', label: 'Hand', icon: <Hand size={17} />, keys: 'H' }] },
  { id: 'zoom', tools: [{ id: 'zoom', label: 'Zoom', icon: <ZoomIn size={17} />, keys: 'Z' }] },
];

export const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => ({ ...t, group: g.id })));

/** The tool a key picks: the group's own key cycles through its tools (Shift+key in Photoshop; here the key again). */
export function toolForKey(key: string, current: ToolId): ToolId | null {
  const k = key.toUpperCase();
  const group = TOOL_GROUPS.find((g) => g.tools.some((t) => t.keys === k));
  if (!group) return null;
  const i = group.tools.findIndex((t) => t.id === current);
  return (i >= 0 ? group.tools[(i + 1) % group.tools.length].id : group.tools[0].id) as ToolId;
}

/** What each tool does, for the options bar's hint. */
const HINTS: Partial<Record<ToolId, string>> = {
  move: 'Drag to move the picked layer; a click on words or a shape picks it.',
  'marquee-rect': 'Drag to select. Shift adds to the selection, Alt takes away.',
  'marquee-ellipse': 'Drag to select. Shift adds to the selection, Alt takes away.',
  lasso: 'Drag round what to select.',
  'lasso-poly': 'Click each corner; click the first one, double-click or press Enter to close.',
  wand: 'Click a colour to select it and what is near it.',
  eyedropper: 'Click to take a colour; Alt+click for the background colour.',
  heal: 'Paint over a spot: it is filled from around it.',
  clone: 'Alt+click where to copy from, then paint where it goes.',
  gradient: 'Drag across the picture: from the foreground colour to the background colour.',
  bucket: 'Click to fill an area of one colour with the foreground colour.',
  text: 'Click where the words go, then type.',
  'shape-emoji': 'Pick one, then click where it goes.',
  'hide-blur': 'Drag across what to hide: a face, a number plate, a name.',
  'hide-pixelate': 'Drag across what to hide: a face, a number plate, a name.',
  hand: 'Drag to move around the picture.',
  zoom: 'Click to zoom in; Alt+click to zoom out.',
};

const SEL_MODES = [
  { value: 'replace' as const, label: 'New', title: 'A new selection' },
  { value: 'add' as const, label: 'Add', title: 'Add to the selection (Shift)' },
  { value: 'subtract' as const, label: 'Take away', title: 'Take away from the selection (Alt)' },
  { value: 'intersect' as const, label: 'Cross', title: 'Only where both are (Shift+Alt)' },
];

const BACKS = [
  { value: 'none' as const, label: 'Nothing' },
  { value: 'dark' as const, label: 'Dark' },
  { value: 'light' as const, label: 'Light' },
];

export function ToolOptions({ ed, mobile }: { ed: PictureEd; mobile?: boolean }) {
  useEd(ed);
  const o = ed.opts;
  const t = ed.tool;
  const set = ed.setOpts.bind(ed);
  const long = Math.max(ed.doc.w, ed.doc.h);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const size = <ScrubNumber label="Size" value={o.size} min={1} max={Math.max(500, Math.round(long / 2))} unit="px" width={64} onChange={(v) => set({ size: v })} title="Brush size ([ and ])" />;
  const hard = <ScrubNumber label="Hardness" value={o.hardness} min={0} max={100} unit="%" width={56} onChange={(v) => set({ hardness: v })} />;
  const opacity = <ScrubNumber label="Opacity" value={o.opacity} min={1} max={100} unit="%" width={56} onChange={(v) => set({ opacity: v })} />;
  const flow = <ScrubNumber label="Flow" value={o.flow} min={1} max={100} unit="%" width={56} onChange={(v) => set({ flow: v })} />;
  const tol = <ScrubNumber label="Tolerance" value={o.tolerance} min={0} max={255} width={48} onChange={(v) => set({ tolerance: v })} />;
  const hint = HINTS[t] && !mobile ? <span className="ml-1 truncate text-[12px] text-fg-3">{HINTS[t]}</span> : null;
  let body: React.ReactNode = null;

  if (ed.crop) {
    const turn = (f: () => void) => {
      ed.cancelCrop();
      f();
      ed.startCrop();
    };
    body = (
      <>
        <MiniSelect
          label="Shape"
          value={o.cropShape}
          options={CROP_SHAPES.map((s) => ({ value: s.id, label: s.label }))}
          onChange={(v) => {
            set({ cropShape: v as CropShape });
            ed.setCrop({ box: cropOfShape(ed.doc.w, ed.doc.h, v === 'free' ? null : v === 'original' ? ed.doc.w / ed.doc.h : (CROP_SHAPES.find((s) => s.id === v)?.ratio ?? null)) });
          }}
          width={120}
        />
        <ScrubNumber label="Straighten" value={ed.crop.angle} min={-45} max={45} step={0.5} unit="°" width={64} onChange={(v) => ed.setCrop({ angle: v })} />
        <OptionsSep />
        <IconButton label="Turn left" size="sm" onClick={() => turn(() => ed.turn(-1))}>
          <RotateCcw size={15} />
        </IconButton>
        <IconButton label="Turn right" size="sm" onClick={() => turn(() => ed.turn(1))}>
          <RotateCw size={15} />
        </IconButton>
        <IconButton label="Mirror" size="sm" onClick={() => turn(() => ed.flip('h'))}>
          <TrianglesCenterlineDashedVertical size={15} />
        </IconButton>
        <IconButton label="Upside down" size="sm" onClick={() => turn(() => ed.flip('v'))}>
          <TrianglesCenterlineDashedHorizontal size={15} />
        </IconButton>
        <OptionsSep />
        <Button size="sm" variant="primary" className="h-7" icon={<CheckIcon size={14} />} onClick={() => (ed.commitCrop(), ed.setTool('move'))}>
          Apply the crop
        </Button>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => (ed.cancelCrop(), ed.setTool('move'))}>
          Cancel
        </Button>
        {!mobile && <span className="ml-1 truncate text-[12px] text-fg-3">{cropRatio(ed) ? 'Drag the box or its corners; Enter applies.' : 'Drag the box, its sides or corners; Enter applies, Esc cancels.'}</span>}
      </>
    );
  } else if (ed.xform) {
    const x = ed.xform;
    body = (
      <>
        <OptionsLabel>Free transform</OptionsLabel>
        <ScrubNumber label="W" value={Math.round(x.sx * 100)} min={1} max={2000} unit="%" width={60} onChange={(v) => ed.setTransform({ sx: v / 100 })} />
        <ScrubNumber label="H" value={Math.round(x.sy * 100)} min={1} max={2000} unit="%" width={60} onChange={(v) => ed.setTransform({ sy: v / 100 })} />
        <ScrubNumber label="Turn" value={x.angle} min={-360} max={360} step={0.5} unit="°" width={62} onChange={(v) => ed.setTransform({ angle: v })} />
        <OptionsSep />
        <Button size="sm" variant="primary" className="h-7" icon={<CheckIcon size={14} />} onClick={() => ed.commitTransform()}>
          Apply
        </Button>
        <IconButton label="Cancel (Esc)" size="sm" onClick={() => ed.cancelTransform()}>
          <X size={15} />
        </IconButton>
        {!mobile && <span className="ml-1 truncate text-[12px] text-fg-3">Corners size it (Shift: freely), sides stretch it, outside a corner turns it; Enter applies.</span>}
      </>
    );
  } else
    switch (t) {
      case 'move':
        body = (
          <>
            <Check on={o.autoSelect} onChange={(v) => set({ autoSelect: v })} title="A click picks the layer under the pointer">
              Auto-select
            </Check>
            <Button size="sm" variant="secondary" className="h-7" onClick={() => ed.startTransform()}>
              Free transform
            </Button>
            {hint}
          </>
        );
        break;
      case 'marquee-rect':
      case 'marquee-ellipse':
      case 'lasso':
      case 'lasso-poly':
      case 'wand':
        body = (
          <>
            <Seg value={o.selMode} options={SEL_MODES} onChange={(v) => set({ selMode: v })} />
            {t === 'wand' ? (
              <>
                {tol}
                <Check on={o.contiguous} onChange={(v) => set({ contiguous: v })} title="Only what touches the colour clicked">
                  Touching
                </Check>
                <Check on={o.sampleAll} onChange={(v) => set({ sampleAll: v })}>
                  All layers
                </Check>
                <Button size="sm" variant="secondary" className="h-7" onClick={() => ed.askAi('subject')}>
                  Select the subject
                </Button>
              </>
            ) : (
              <ScrubNumber label="Feather" value={o.feather} min={0} max={250} unit="px" width={58} onChange={(v) => set({ feather: v })} />
            )}
            {hint}
          </>
        );
        break;
      case 'brush':
      case 'eraser':
      case 'clone':
        body = (
          <>
            {size}
            {hard}
            {opacity}
            {flow}
            {t === 'clone' && (
              <Check on={o.sampleAll} onChange={(v) => set({ sampleAll: v })}>
                All layers
              </Check>
            )}
            {t === 'brush' && <ColorButton value={ed.fg} label="Colour" onChange={(c, done) => ed.setFg(c, done)} size={22} />}
            {hint}
          </>
        );
        break;
      case 'heal':
        body = (
          <>
            {size}
            {!mobile && <span className="ml-1 truncate text-[12px] text-fg-3">Paint over a spot: it is filled from around it; a larger area goes to the eraser on this computer when it is set up.</span>}
          </>
        );
        break;
      case 'dodge':
      case 'burn':
        body = (
          <>
            {size}
            {hard}
            <ScrubNumber label="Exposure" value={o.exposure} min={1} max={100} unit="%" width={56} onChange={(v) => set({ exposure: v })} />
          </>
        );
        break;
      case 'gradient':
        body = (
          <>
            <Seg
              value={o.gradient}
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' },
              ]}
              onChange={(v) => set({ gradient: v })}
            />
            <Check on={o.toClear} onChange={(v) => set({ toClear: v })}>
              To see-through
            </Check>
            {opacity}
            {hint}
          </>
        );
        break;
      case 'bucket':
        body = (
          <>
            {tol}
            <Check on={o.contiguous} onChange={(v) => set({ contiguous: v })}>
              Touching
            </Check>
            {opacity}
            <ColorButton value={ed.fg} label="Colour" onChange={(c, done) => ed.setFg(c, done)} size={22} />
            {hint}
          </>
        );
        break;
      case 'text':
        body = (
          <>
            <MiniSelect label="Font" value={o.font} options={MARK_FONTS.map((f) => ({ value: f.id, label: f.label }))} onChange={(v) => set({ font: v as FontId })} width={124} />
            <ScrubNumber label="Size" value={o.textSize} min={6} max={1200} unit="px" width={64} onChange={(v) => set({ textSize: v })} />
            <ColorButton value={ed.fg} label="Colour" onChange={(c, done) => ed.setFg(c, done)} size={22} />
            <OptionsLabel>Behind</OptionsLabel>
            <Seg value={o.back} options={BACKS} onChange={(v) => set({ back: v })} />
            {hint}
          </>
        );
        break;
      case 'shape-rect':
      case 'shape-ellipse':
      case 'shape-line':
      case 'shape-arrow':
      case 'shape-pen':
        body = (
          <>
            <ColorButton value={ed.fg} label="Colour" alpha onChange={(c, done) => ed.setFg(c, done)} size={22} />
            <ScrubNumber label="Thickness" value={o.width} min={1} max={400} unit="px" width={60} onChange={(v) => set({ width: v })} />
            {(t === 'shape-rect' || t === 'shape-ellipse') && (
              <Check on={o.fill} onChange={(v) => set({ fill: v })} title="Filled with the background colour">
                Filled
              </Check>
            )}
            {hint}
          </>
        );
        break;
      case 'shape-highlighter':
        body = (
          <>
            <ColorButton value={ed.fg} label="Colour" onChange={(c, done) => ed.setFg(c, done)} size={22} />
            <ScrubNumber label="Thickness" value={o.hiWidth} min={2} max={600} unit="px" width={60} onChange={(v) => set({ hiWidth: v })} />
          </>
        );
        break;
      case 'shape-emoji':
        body = (
          <>
            <button ref={emojiRef} type="button" onClick={() => setEmojiOpen((x) => !x)} className="flex h-7 items-center rounded-md border border-line-2 bg-bg-1 px-2 text-[16px]" aria-label="Emoji">
              {o.emoji}
            </button>
            <Popover anchor={emojiRef} open={emojiOpen} onClose={() => setEmojiOpen(false)} width={280} title="Emoji">
              <div className="p-1">
                <EmojiGrid value={o.emoji} onPick={(e) => (set({ emoji: e }), setEmojiOpen(false))} />
              </div>
            </Popover>
            <ScrubNumber label="Size" value={o.emojiSize} min={8} max={2000} unit="px" width={64} onChange={(v) => set({ emojiSize: v })} />
            {hint}
          </>
        );
        break;
      case 'hide-blur':
      case 'hide-pixelate':
        body = (
          <>
            <ScrubNumber label="How hidden" value={o.hideStrength} min={20} max={100} width={48} onChange={(v) => set({ hideStrength: v })} />
            {hint}
          </>
        );
        break;
      case 'hand':
      case 'zoom':
      case 'eyedropper':
        body = (
          <>
            <Button size="sm" variant="secondary" className="h-7" icon={<Maximize size={13} />} onClick={() => ed.view?.fit()}>
              Fit on screen
            </Button>
            <Button size="sm" variant="secondary" className="h-7" onClick={() => ed.view?.actual()}>
              Actual size
            </Button>
            {hint}
          </>
        );
        break;
    }
  return <OptionsBar className={mobile ? 'border-t border-b-0' : undefined}>{body}</OptionsBar>;
}

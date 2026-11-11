// The format panel beside a diagram, as draw.io's: for the shapes picked, their look (ready-made looks, fill, line,
// corners, shadow, drawn by hand), their words (font, size, colour, where they sit) and their place (position, size,
// turn, flip, order, lining up, spacing out, grouping, lock), their kind and what they hold (a class's rows, an icon, a
// picture, a link, a note); for connectors, their line, course and ends; with nothing picked, the page (its name and
// colour), the whole diagram's grid, font and hand-drawn look, a look for every shape, and laying the page out again.
import type { ReactNode } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeftRight,
  BetweenHorizontalStart,
  Bold,
  BringToFront,
  ChevronsDown,
  ChevronsUp,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  ImageUp,
  Italic,
  Lock,
  LockOpen,
  PaintBucket,
  Brush,
  RotateCw,
  SendToBack,
  Shapes,
  Spline,
  Underline,
  Ungroup,
  Waypoints,
} from 'lucide-react';
import { CONTAINER_KINDS, FONTS, isEdge, isShape, ROW_KINDS, SHAPE_KINDS, STYLE_SETS, type ArrowKind, type Dash, type Diagram, type DiagramEdge, type DiagramItem, type DiagramPage, type DiagramShape, type DiagramStyle, type LabelPos, type RouteKind, type ShapeKind } from '@shared/diagram';
import { KINDS, lookOf } from '@shared/diagram-shapes';
import { setRoute, swapEnds } from '@shared/diagram-ops';
import type { LayoutKind } from '@shared/diagram-spec';
import { cx } from '../../../components/ui';
import { Field, NumInput, Section, Tool } from '../slides/controls';
import { ArrowPick, Choices, ColourButton, DashPick } from './controls';
import { withRows } from './DiagramCanvas';

export interface FormatActions {
  align: (how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distribute: (axis: 'x' | 'y') => void;
  order: (how: 'front' | 'back' | 'forward' | 'backward') => void;
  group: () => void;
  ungroup: () => void;
  layout: (kind: LayoutKind) => void;
  icon: () => void;
  picture: () => void;
  matchSize: (how: 'w' | 'h' | 'both') => void;
  /** Takes the look of the item picked, to put on others (Ctrl+Alt+C). */
  copyStyle: () => void;
  /** Puts the look taken on what is picked (Ctrl+Alt+V). */
  pasteStyle: () => void;
  /** A look was taken. */
  canPasteStyle: boolean;
}

interface Props {
  d: Diagram;
  page: DiagramPage;
  sel: string[];
  readOnly: boolean;
  narrow?: boolean;
  /** A change to the page (`key`: changes of the same kind in a row are one step of Undo). */
  change: (f: (p: DiagramPage) => DiagramPage, key?: string) => void;
  changeDiagram: (f: (d: Diagram) => Diagram, key?: string) => void;
  snap: boolean;
  onSnap: (on: boolean) => void;
  showGrid: boolean;
  onShowGrid: (on: boolean) => void;
  act: FormatActions;
}

const KIND_LABEL: Partial<Record<ShapeKind, string>> = {
  rect: 'Rectangle',
  rounded: 'Rounded rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  cylinder: 'Cylinder',
  cloud: 'Cloud',
  document: 'Document',
  note: 'Note',
  terminator: 'Start or end',
  predefined: 'Predefined process',
  sticky: 'Sticky note',
  text: 'Text',
  callout: 'Speech bubble',
  cube: 'Cube',
  step: 'Step',
  chevron: 'Arrow box',
  star: 'Star',
  octagon: 'Octagon',
  pentagon: 'Pentagon',
  card: 'Card',
  'manual-input': 'Manual input',
  'manual-operation': 'Manual operation',
  delay: 'Delay',
  display: 'Display',
  'stored-data': 'Stored data',
  'multi-document': 'Documents',
  'off-page': 'Off-page link',
  container: 'Group box',
  swimlane: 'Swimlane',
  lane: 'Horizontal lane',
  class: 'Class',
  entity: 'Entity',
  table: 'Table',
  actor: 'Actor',
  icon: 'Icon',
  image: 'Picture',
};
/** The kinds a shape may be changed to: those that hold words like it. */
const CHANGE_TO: ShapeKind[] = ['rect', 'rounded', 'ellipse', 'diamond', 'terminator', 'parallelogram', 'hexagon', 'trapezoid', 'cylinder', 'document', 'note', 'card', 'cloud', 'callout', 'cube', 'step', 'chevron', 'predefined', 'manual-input', 'manual-operation', 'delay', 'display', 'stored-data', 'multi-document', 'off-page', 'triangle', 'octagon', 'pentagon', 'star', 'sticky', 'text'];

const LABEL_POS: { value: LabelPos; label: string }[] = [
  { value: 'inside', label: 'Inside' },
  { value: 'below', label: 'Below' },
  { value: 'above', label: 'Above' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const LAYOUT_CHOICES: { value: LayoutKind; label: string }[] = [
  { value: 'down', label: 'Flow down' },
  { value: 'right', label: 'Flow right' },
  { value: 'tree', label: 'Tree' },
  { value: 'tree-right', label: 'Tree across' },
  { value: 'mindmap', label: 'Mind map' },
  { value: 'radial', label: 'Rings' },
  { value: 'circle', label: 'Circle' },
  { value: 'grid', label: 'Grid' },
];

/** A style changed by a patch: undefined in it takes that part away. */
function patched(st: DiagramStyle | undefined, patch: Partial<DiagramStyle>): DiagramStyle | undefined {
  const out: Record<string, unknown> = { ...st };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? (out as DiagramStyle) : undefined;
}

export function FormatPanel({ d, page, sel, readOnly, change, changeDiagram, snap, onSnap, showGrid, onShowGrid, act }: Props) {
  const items = sel.map((id) => page.items.find((x) => x.id === id)).filter((x): x is DiagramItem => !!x);
  const shapes = items.filter(isShape);
  const edges = items.filter(isEdge);
  const first = items[0];
  const ids = new Set(items.map((x) => x.id));
  const setStyle = (patch: Partial<DiagramStyle>, key?: string, only?: 'shape' | 'edge') =>
    change(
      (p) => ({
        ...p,
        items: p.items.map((it) => {
          if (!ids.has(it.id) || (only && it.type !== only)) return it;
          const style = patched(it.style, patch);
          const out = { ...it, style } as DiagramItem;
          if (!style) delete out.style;
          return out;
        }),
      }),
      key,
    );
  const setShapes = (f: (s: DiagramShape) => DiagramShape, key?: string) => change((p) => ({ ...p, items: p.items.map((it) => (ids.has(it.id) && isShape(it) ? f(it) : it)) }), key);
  const setEdges = (f: (e: DiagramEdge) => DiagramEdge, key?: string) => change((p) => ({ ...p, items: p.items.map((it) => (ids.has(it.id) && isEdge(it) ? f(it) : it)) }), key);
  const look: DiagramStyle = first && isShape(first) ? lookOf(first) : (first?.style ?? {});

  if (!items.length) return <PagePanel d={d} page={page} readOnly={readOnly} change={change} changeDiagram={changeDiagram} snap={snap} onSnap={onSnap} showGrid={showGrid} onShowGrid={onShowGrid} act={act} />;

  const lock = items.every((x) => x.locked);
  const textual = shapes.some((s) => s.text !== undefined || !CONTAINER_KINDS.has(s.shape)) || edges.length > 0;
  const one = shapes.length === 1 && items.length === 1 ? shapes[0] : null;
  const blocks: ReactNode[] = [];
  if (shapes.length) {
    blocks.push(
      <Section key="looks" title="Style">
        <div className="grid grid-cols-8 gap-1">
          {STYLE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={s.label}
              disabled={readOnly}
              onClick={() => setStyle({ fill: s.fill, stroke: s.stroke, color: s.color }, undefined, 'shape')}
              className={cx('h-6 rounded-md border-[1.5px] text-[10px] font-semibold', look.fill === s.fill && look.stroke === s.stroke && 'ring-2 ring-accent ring-offset-1 ring-offset-panel')}
              style={{ background: s.fill, borderColor: s.stroke, color: s.color ?? '#1f2328' }}
            >
              Aa
            </button>
          ))}
        </div>
        <Field label="Fill">
          <ColourButton label="Fill" value={look.fill} none onChange={(v) => setStyle({ fill: v }, undefined, 'shape')} />
          <label className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <input type="checkbox" disabled={readOnly} checked={!!look.gradient} onChange={(e) => setStyle({ gradient: e.target.checked ? '#ffffff' : undefined }, undefined, 'shape')} className="accent-[var(--accent)]" />
            Gradient
          </label>
          {look.gradient && <ColourButton label="Gradient" value={look.gradient} onChange={(v) => setStyle({ gradient: v ?? '#ffffff' }, undefined, 'shape')} />}
        </Field>
        <Field label="Line">
          <ColourButton label="Line" value={look.stroke} none onChange={(v) => setStyle({ stroke: v }, undefined, 'shape')} />
          <NumInput label="Line width" value={look.width ?? 1.5} min={0} max={20} step={0.5} unit="px" className="w-[84px]" onChange={(v) => setStyle({ width: v }, 'width', 'shape')} />
        </Field>
        <DashPick value={look.dash ?? 'solid'} onChange={(v: Dash) => setStyle({ dash: v === 'solid' ? undefined : v }, undefined, 'shape')} />
        {shapes.some((s) => s.shape === 'rect' || s.shape === 'rounded' || s.shape === 'container' || s.shape === 'entity') && (
          <Field label="Corners">
            <NumInput label="Corner radius" value={look.radius ?? (first && isShape(first) && first.shape === 'rounded' ? 10 : 0)} min={0} max={200} unit="px" className="w-[84px]" onChange={(v) => setStyle({ radius: v }, 'radius', 'shape')} />
          </Field>
        )}
        <Field label="Opacity">
          <input type="range" min={10} max={100} step={5} disabled={readOnly} value={look.opacity ?? 100} onChange={(e) => setStyle({ opacity: Number(e.target.value) === 100 ? undefined : Number(e.target.value) }, 'opacity')} className="min-w-0 flex-1 accent-[var(--accent)]" />
          <span className="w-9 text-right text-[12px] text-fg-3 tabular-nums">{look.opacity ?? 100}%</span>
        </Field>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5 text-[12.5px] text-fg-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" disabled={readOnly} checked={!!look.shadow} onChange={(e) => setStyle({ shadow: e.target.checked || undefined }, undefined, 'shape')} className="accent-[var(--accent)]" />
            Shadow
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" disabled={readOnly} checked={!!look.sketch} onChange={(e) => setStyle({ sketch: e.target.checked || undefined })} className="accent-[var(--accent)]" />
            Drawn by hand
          </label>
        </div>
      </Section>,
    );
  }
  if (edges.length) {
    const e0 = edges[0];
    const st = e0.style ?? {};
    blocks.push(
      <Section key="line" title="Connector">
        <Field label="Line">
          <ColourButton label="Line" value={st.stroke} onChange={(v) => setStyle({ stroke: v }, undefined, 'edge')} />
          <NumInput label="Line width" value={st.width ?? 1.5} min={0.5} max={20} step={0.5} unit="px" className="w-[84px]" onChange={(v) => setStyle({ width: v }, 'width', 'edge')} />
        </Field>
        <DashPick value={st.dash ?? 'solid'} onChange={(v: Dash) => setStyle({ dash: v === 'solid' ? undefined : v }, undefined, 'edge')} />
        <Field label="Course">
          <Choices<RouteKind>
            value={e0.route ?? 'orthogonal'}
            onChange={(r) => change((p) => setRoute(p, ids, r))}
            options={[
              { value: 'orthogonal', label: 'Right angles', icon: <Waypoints size={14} /> },
              { value: 'straight', label: 'Straight', icon: <span className="block h-px w-4 rotate-[-30deg] bg-current" /> },
              { value: 'curved', label: 'Curved', icon: <Spline size={14} /> },
            ]}
          />
        </Field>
        <Field label="Ends">
          <ArrowPick label="Start" start value={(st.start ?? 'none') as ArrowKind} onChange={(k) => setStyle({ start: k === 'none' ? undefined : k }, undefined, 'edge')} />
          <ArrowPick label="End" value={(st.end ?? 'arrow') as ArrowKind} onChange={(k) => setStyle({ end: k === 'arrow' ? undefined : k }, undefined, 'edge')} />
          <Tool label="Swap the ends" onClick={() => change((p) => swapEnds(p, ids))}>
            <ArrowLeftRight size={15} />
          </Tool>
        </Field>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5 text-[12.5px] text-fg-2">
          {(e0.route ?? 'orthogonal') === 'orthogonal' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" disabled={readOnly} checked={(st.radius ?? 8) > 0} onChange={(e) => setStyle({ radius: e.target.checked ? undefined : 0 }, undefined, 'edge')} className="accent-[var(--accent)]" />
              Rounded bends
            </label>
          )}
          <label className="flex items-center gap-1.5">
            <input type="checkbox" disabled={readOnly} checked={!!st.flow} onChange={(e) => setStyle({ flow: e.target.checked || undefined }, undefined, 'edge')} className="accent-[var(--accent)]" />
            Flowing
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" disabled={readOnly} checked={!!st.sketch} onChange={(e) => setStyle({ sketch: e.target.checked || undefined }, undefined, 'edge')} className="accent-[var(--accent)]" />
            Drawn by hand
          </label>
        </div>
        {edges.some((x) => x.points?.length) && (
          <button type="button" disabled={readOnly} onClick={() => setEdges((x) => ({ ...x, points: undefined }))} className="text-[12.5px] font-medium text-accent hover:underline">
            Take out its bends
          </button>
        )}
        {edges.length === 1 && (
          <Field label="Near ends">
            <input
              value={e0.fromText ?? ''}
              disabled={readOnly}
              placeholder="Start"
              onChange={(ev) => setEdges((x) => ({ ...x, fromText: ev.target.value || undefined }), 'fromText')}
              className="h-8 w-0 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60"
            />
            <input
              value={e0.toText ?? ''}
              disabled={readOnly}
              placeholder="End"
              onChange={(ev) => setEdges((x) => ({ ...x, toText: ev.target.value || undefined }), 'toText')}
              className="h-8 w-0 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60"
            />
          </Field>
        )}
      </Section>,
    );
  }
  if (textual) {
    const fontOf = look.font ?? d.font ?? 'sans';
    blocks.push(
      <Section key="text" title="Text">
        <Field label="Font">
          <select
            value={fontOf}
            disabled={readOnly}
            onChange={(e) => setStyle({ font: e.target.value === (d.font ?? 'sans') ? undefined : (e.target.value as DiagramStyle['font']) })}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-1.5 text-[12.5px] outline-none focus:border-accent/60"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-1">
          <NumInput label="Font size" value={look.size ?? (shapes.length ? 14 : 13)} min={6} max={200} unit="px" className="mr-1 w-[72px]" onChange={(v) => setStyle({ size: v }, 'size')} />
          <Tool label="Bold" on={!!look.bold} onClick={() => setStyle({ bold: look.bold ? undefined : true })}>
            <Bold size={15} />
          </Tool>
          <Tool label="Italic" on={!!look.italic} onClick={() => setStyle({ italic: look.italic ? undefined : true })}>
            <Italic size={15} />
          </Tool>
          <Tool label="Underline" on={!!look.underline} onClick={() => setStyle({ underline: look.underline ? undefined : true })}>
            <Underline size={15} />
          </Tool>
          <ColourButton label="Text colour" value={look.color} onChange={(v) => setStyle({ color: v })} icon={<span className="text-[13px] font-semibold">A</span>} />
        </div>
        {shapes.length > 0 && (
          <>
            <Field label="Align">
              <Choices
                value={look.align ?? 'center'}
                onChange={(v) => setStyle({ align: v === 'center' ? undefined : v }, undefined, 'shape')}
                options={[
                  { value: 'left', label: 'Left', icon: <AlignStartVertical size={14} /> },
                  { value: 'center', label: 'Centre', icon: <AlignCenterVertical size={14} /> },
                  { value: 'right', label: 'Right', icon: <AlignEndVertical size={14} /> },
                ]}
              />
              <Choices
                value={look.valign ?? 'middle'}
                onChange={(v) => setStyle({ valign: v === 'middle' ? undefined : v }, undefined, 'shape')}
                options={[
                  { value: 'top', label: 'Top', icon: <AlignStartHorizontal size={14} /> },
                  { value: 'middle', label: 'Middle', icon: <AlignCenterHorizontal size={14} /> },
                  { value: 'bottom', label: 'Bottom', icon: <AlignEndHorizontal size={14} /> },
                ]}
              />
            </Field>
            <Field label="Words">
              <select
                value={look.label ?? 'inside'}
                disabled={readOnly}
                onChange={(e) => setStyle({ label: e.target.value as LabelPos }, undefined, 'shape')}
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-1.5 text-[12.5px] outline-none focus:border-accent/60"
              >
                {LABEL_POS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
      </Section>,
    );
  }
  if (one) {
    const s = one;
    blocks.push(
      <Section key="shape" title="Shape">
        {!ROW_KINDS.has(s.shape) && !CONTAINER_KINDS.has(s.shape) && s.shape !== 'icon' && s.shape !== 'image' && (
          <Field label="Kind">
            <select
              value={CHANGE_TO.includes(s.shape) ? s.shape : ''}
              disabled={readOnly}
              onChange={(e) => setShapes((x) => ({ ...x, shape: e.target.value as ShapeKind }))}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-1.5 text-[12.5px] outline-none focus:border-accent/60"
            >
              {!CHANGE_TO.includes(s.shape) && <option value="">{KIND_LABEL[s.shape] ?? s.shape}</option>}
              {CHANGE_TO.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k] ?? k}
                </option>
              ))}
            </select>
          </Field>
        )}
        {s.shape === 'icon' && (
          <button type="button" disabled={readOnly} onClick={act.icon} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
            <Shapes size={14} /> Change the icon
          </button>
        )}
        {s.shape === 'image' && (
          <button type="button" disabled={readOnly} onClick={act.picture} className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
            <ImageUp size={14} /> {s.src ? 'Replace the picture' : 'Choose a picture'}
          </button>
        )}
        {ROW_KINDS.has(s.shape) && (
          <label className="block space-y-1">
            <span className="text-[12px] text-fg-3">{s.shape === 'table' ? 'Rows (cells apart by |)' : 'Rows (--- draws a line)'}</span>
            <textarea
              value={(s.rows ?? []).join('\n')}
              disabled={readOnly}
              rows={Math.min(10, Math.max(3, (s.rows ?? []).length + 1))}
              onChange={(e) => setShapes((x) => withRows(x, e.target.value.split('\n')), 'rows')}
              spellCheck={false}
              translate="no"
              className="w-full resize-y rounded-lg border border-line bg-bg-1 px-2 py-1.5 font-mono text-[12px] outline-none focus:border-accent/60"
            />
          </label>
        )}
        <Field label="Link">
          <input
            value={s.link ?? ''}
            disabled={readOnly}
            placeholder="https://…"
            translate="no"
            onChange={(e) => setShapes((x) => ({ ...x, link: e.target.value.trim() || undefined }), 'link')}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60"
          />
        </Field>
        <Field label="Note" top>
          <textarea
            value={s.note ?? ''}
            disabled={readOnly}
            rows={2}
            placeholder="Shown when it is pointed at"
            onChange={(e) => setShapes((x) => ({ ...x, note: e.target.value || undefined }), 'note')}
            className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-bg-1 px-2 py-1 text-[12.5px] outline-none focus:border-accent/60"
          />
        </Field>
      </Section>,
    );
  }
  blocks.push(
    <Section key="arrange" title="Arrange">
      {one && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumInput label="Left" value={one.x} unit="x" onChange={(v) => setShapes((x) => ({ ...x, x: v }), 'x')} />
            <NumInput label="Top" value={one.y} unit="y" onChange={(v) => setShapes((x) => ({ ...x, y: v }), 'y')} />
            <NumInput label="Width" value={one.w} min={2} max={100000} unit="w" onChange={(v) => setShapes((x) => ({ ...x, w: v }), 'w')} />
            <NumInput label="Height" value={one.h} min={2} max={100000} unit="h" onChange={(v) => setShapes((x) => ({ ...x, h: v }), 'h')} />
          </div>
          <Field label="Turn">
            <NumInput label="Turn" value={one.rot ?? 0} min={0} max={359} unit="°" className="w-[80px]" onChange={(v) => setShapes((x) => ({ ...x, rot: v ? v % 360 : undefined }), 'rot')} />
            <Tool label="Turn 90°" onClick={() => setShapes((x) => ({ ...x, rot: ((x.rot ?? 0) + 90) % 360 || undefined }))}>
              <RotateCw size={15} />
            </Tool>
            <Tool label="Flip across" on={!!one.flipH} onClick={() => setShapes((x) => ({ ...x, flipH: x.flipH ? undefined : true }))}>
              <FlipHorizontal2 size={15} />
            </Tool>
            <Tool label="Flip down" on={!!one.flipV} onClick={() => setShapes((x) => ({ ...x, flipV: x.flipV ? undefined : true }))}>
              <FlipVertical2 size={15} />
            </Tool>
          </Field>
        </>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Tool label="Bring to front" onClick={() => act.order('front')}>
          <BringToFront size={15} />
        </Tool>
        <Tool label="Bring forward" onClick={() => act.order('forward')}>
          <ChevronsUp size={15} />
        </Tool>
        <Tool label="Send backward" onClick={() => act.order('backward')}>
          <ChevronsDown size={15} />
        </Tool>
        <Tool label="Send to back" onClick={() => act.order('back')}>
          <SendToBack size={15} />
        </Tool>
        <span className="mx-0.5 h-5 w-px bg-line" />
        {items.length > 1 && (
          <Tool label="Group" onClick={act.group}>
            <Group size={15} />
          </Tool>
        )}
        {items.some((x) => x.group) && (
          <Tool label="Ungroup" onClick={act.ungroup}>
            <Ungroup size={15} />
          </Tool>
        )}
        <Tool label={lock ? 'Unlock' : 'Lock'} on={lock} onClick={() => change((p) => ({ ...p, items: p.items.map((it) => (ids.has(it.id) ? ({ ...it, locked: lock ? undefined : true } as DiagramItem) : it)) }))}>
          {lock ? <Lock size={15} /> : <LockOpen size={15} />}
        </Tool>
        {items.length === 1 && (
          <Tool label="Copy style" onClick={act.copyStyle}>
            <Brush size={15} />
          </Tool>
        )}
        <Tool label="Paste style" disabled={!act.canPasteStyle} onClick={act.pasteStyle}>
          <PaintBucket size={15} />
        </Tool>
      </div>
      {shapes.length > 1 && (
        <>
          <div className="flex flex-wrap items-center gap-1">
            <Tool label="Align left edges" onClick={() => act.align('left')}>
              <AlignStartVertical size={15} />
            </Tool>
            <Tool label="Align centres" onClick={() => act.align('center')}>
              <AlignCenterVertical size={15} />
            </Tool>
            <Tool label="Align right edges" onClick={() => act.align('right')}>
              <AlignEndVertical size={15} />
            </Tool>
            <Tool label="Align tops" onClick={() => act.align('top')}>
              <AlignStartHorizontal size={15} />
            </Tool>
            <Tool label="Align middles" onClick={() => act.align('middle')}>
              <AlignCenterHorizontal size={15} />
            </Tool>
            <Tool label="Align bottoms" onClick={() => act.align('bottom')}>
              <AlignEndHorizontal size={15} />
            </Tool>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {shapes.length > 2 && (
              <>
                <Tool label="Space out across" onClick={() => act.distribute('x')}>
                  <AlignHorizontalDistributeCenter size={15} />
                </Tool>
                <Tool label="Space out down" onClick={() => act.distribute('y')}>
                  <AlignVerticalDistributeCenter size={15} />
                </Tool>
              </>
            )}
            <button type="button" onClick={() => act.matchSize('both')} className="flex h-8 items-center gap-1 rounded-lg px-2 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
              <BetweenHorizontalStart size={14} /> Same size
            </button>
          </div>
        </>
      )}
    </Section>,
  );
  return <div inert={readOnly} className={cx('min-h-0', readOnly && 'opacity-60')}>{blocks}</div>;
}

function PagePanel({ d, page, readOnly, change, changeDiagram, snap, onSnap, showGrid, onShowGrid, act }: Omit<Props, 'sel' | 'narrow'>) {
  const shapeIds = new Set(page.items.filter(isShape).filter((s) => !CONTAINER_KINDS.has(s.shape) && s.shape !== 'text' && s.shape !== 'icon' && s.shape !== 'image' && s.shape !== 'sticky').map((s) => s.id));
  return (
    <div inert={readOnly} className={cx(readOnly && 'opacity-60')}>
      <Section title="Page">
        <Field label="Name">
          <input
            value={page.name}
            translate="no"
            maxLength={80}
            onChange={(e) => change((p) => ({ ...p, name: e.target.value || p.name }), 'pagename')}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 text-[12.5px] outline-none focus:border-accent/60"
          />
        </Field>
        <Field label="Background">
          <ColourButton label="Background" value={page.background} onChange={(v) => change((p) => ({ ...p, background: v && v !== 'none' ? v : undefined }))} />
        </Field>
      </Section>
      <Section title="Diagram">
        <div className="space-y-1.5 text-[12.5px] text-fg-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showGrid} onChange={(e) => onShowGrid(e.target.checked)} className="accent-[var(--accent)]" />
            Show the grid
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={snap} onChange={(e) => onSnap(e.target.checked)} className="accent-[var(--accent)]" />
            Snap to the grid and guides
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!d.sketch} onChange={(e) => changeDiagram((x) => ({ ...x, sketch: e.target.checked || undefined }))} className="accent-[var(--accent)]" />
            Draw it all by hand
          </label>
        </div>
        <Field label="Grid">
          <NumInput label="Grid size" value={d.grid ?? 10} min={0} max={100} unit="px" className="w-[84px]" onChange={(v) => changeDiagram((x) => ({ ...x, grid: Math.round(v) }), 'grid')} />
        </Field>
        <Field label="Font">
          <select
            value={d.font ?? 'sans'}
            onChange={(e) => changeDiagram((x) => ({ ...x, font: e.target.value === 'sans' ? undefined : (e.target.value as Diagram['font']) }))}
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-1.5 text-[12.5px] outline-none focus:border-accent/60"
          >
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>
      <Section title="Every shape">
        <div className="grid grid-cols-8 gap-1">
          {STYLE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              aria-label={s.label}
              disabled={!shapeIds.size}
              onClick={() => change((p) => ({ ...p, items: p.items.map((it) => (shapeIds.has(it.id) && isShape(it) ? { ...it, style: { ...it.style, fill: s.fill, stroke: s.stroke, ...(s.color ? { color: s.color } : {}) } } : it)) }))}
              className="h-6 rounded-md border-[1.5px] text-[10px] font-semibold disabled:opacity-40"
              style={{ background: s.fill, borderColor: s.stroke, color: s.color ?? '#1f2328' }}
            >
              Aa
            </button>
          ))}
        </div>
      </Section>
      <Section title="Layout">
        <p className="text-[12px] leading-snug text-fg-3">Places every shape again from what joins what.</p>
        <div className="grid grid-cols-2 gap-1">
          {LAYOUT_CHOICES.map((l) => (
            <button key={l.value} type="button" disabled={!page.items.length} onClick={() => act.layout(l.value)} className="h-8 rounded-lg border border-line px-2 text-left text-[12.5px] text-fg-2 hover:border-line-2 hover:bg-bg-2 hover:text-fg disabled:opacity-40">
              {l.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

void SHAPE_KINDS;
void KINDS;

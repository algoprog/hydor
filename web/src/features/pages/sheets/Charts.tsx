// Charts over the grid (Insert → Chart), drawn from their cells as they are now: each between its two corners, each on a
// cell, so it moves and stretches with its cells as rows and columns go in or out, change size or hide; a click picks it
// (its handles size it, a drag moves it, Delete removes it, a double click opens its panel), and the chart panel changes
// it: its kind (column, bar, line, area, pie, doughnut, scatter), its cells (a range, or several split by commas), series
// in columns or rows, the first row and column as names and labels, its title, legend, axes' titles and colours. A range
// it cannot draw from says why, in the chart's place and under its range in the panel.
import { memo, useMemo, useRef, useState } from 'react';
import { ChartArea, ChartBar, ChartColumn, ChartColumnBig, ChartLine, ChartNoAxesColumnIncreasing, ChartPie, ChartScatter, Donut, Hexagon, Orbit, Trash2 } from 'lucide-react';
import { chartBox, cleanChartRange, chartParts, COL_W, ROW_H, type Calc, type ChartCorner, type SheetChart, type SheetChartKind, type Workbook } from '@shared/sheets';
import { chartData, chartProblem, chartSvg, CHART_COLORS, seriesAxis, seriesType } from '@shared/sheet-chart';
import { tr } from '../../../i18n/runtime';
import { Button, cx, Segmented, Switch } from '../../../components/ui';
import type { GridGeo } from './Grid';
import { indexAt } from './ops';
import { Row, SidePanel, smallInput } from './Panel';
import { ColorTool } from './Toolbar';

export const KINDS: { kind: SheetChartKind; label: string; icon: React.ReactNode }[] = [
  { kind: 'column', label: 'Column chart', icon: <ChartColumn size={18} /> },
  { kind: 'bar', label: 'Bar chart', icon: <ChartBar size={18} /> },
  { kind: 'line', label: 'Line chart', icon: <ChartLine size={18} /> },
  { kind: 'area', label: 'Area chart', icon: <ChartArea size={18} /> },
  { kind: 'pie', label: 'Pie chart', icon: <ChartPie size={18} /> },
  { kind: 'doughnut', label: 'Doughnut chart', icon: <Donut size={18} /> },
  { kind: 'scatter', label: 'Scatter chart', icon: <ChartScatter size={18} /> },
  { kind: 'combo', label: 'Combo chart (columns and a line)', icon: <ChartColumnBig size={18} /> },
  { kind: 'histogram', label: 'Histogram', icon: <ChartNoAxesColumnIncreasing size={18} /> },
  { kind: 'bubble', label: 'Bubble chart', icon: <Orbit size={18} /> },
  { kind: 'radar', label: 'Radar chart', icon: <Hexagon size={18} /> },
];

/** One chart drawn at its size (px at 100%): its SVG made again only when the chart, its size or the workbook changes. */
const ChartBody = memo(function ChartBody({ book, calc, si, chart, rev, w, h }: { book: Workbook; calc: Calc; si: number; chart: SheetChart; rev: number; w: number; h: number }) {
  void rev;
  const svg = chartSvg(chart, chartData(book, calc, si, chart), Math.max(40, w), Math.max(30, h), undefined, { problem: chartProblem(book, chart), say: tr });
  return <div className="pointer-events-none h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
});

/** The grid's places as a chart's corners take them: where a column or row starts and how wide or tall it is, past the grid's end too. */
function geoOf(geo: GridGeo) {
  const { colOff, rowOff, z } = geo;
  const nc = colOff.length - 1;
  const nr = rowOff.length - 1;
  const left = (c: number) => (c <= nc ? colOff[c] : colOff[nc] + (c - nc) * COL_W * z);
  const top = (r: number) => (r <= nr ? rowOff[r] : rowOff[nr] + (r - nr) * ROW_H * z);
  return { left, top, colW: (c: number) => left(c + 1) - left(c), rowH: (r: number) => top(r + 1) - top(r) };
}

/** The corner a point of the grid falls on (px from A1's corner, at the grid's zoom), and where in that cell at 100%. */
function cornerOn(geo: GridGeo, x: number, y: number): ChartCorner {
  const c = indexAt(geo.colOff, Math.max(0, x));
  const r = indexAt(geo.rowOff, Math.max(0, y));
  const dx = Math.round(Math.max(0, x - geo.colOff[c]) / geo.z);
  const dy = Math.round(Math.max(0, y - geo.rowOff[r]) / geo.z);
  return { cell: `${refCol(c)}${r + 1}`, ...(dx ? { dx } : {}), ...(dy ? { dy } : {}) };
}
const refCol = (c: number): string => (c < 26 ? String.fromCharCode(65 + c) : refCol(Math.floor(c / 26) - 1) + String.fromCharCode(65 + (c % 26)));

type Box = { x: number; y: number; w: number; h: number };
type Drag = { id: string; mode: 'move' | 'size'; edge: string; x0: number; y0: number; start: Box; pid: number };

/** The sheet's charts, over the grid from A1's corner, each between its corners as the grid draws its cells. */
export function ChartLayer({
  book,
  calc,
  si,
  charts,
  rev,
  geo,
  picked,
  readOnly,
  onPick,
  onChange,
  onOpen,
}: {
  book: Workbook;
  calc: Calc;
  si: number;
  charts: SheetChart[];
  rev: number;
  geo: GridGeo;
  picked: string | null;
  readOnly?: boolean;
  onPick: (id: string | null) => void;
  onChange: (c: SheetChart) => void;
  onOpen: (id: string) => void;
}) {
  // A chart being moved or sized: where it is now (px at the grid's zoom).
  const [live, setLive] = useState<{ id: string; box: Box } | null>(null);
  const drag = useRef<Drag | null>(null);
  const g = geoOf(geo);
  const z = geo.z;
  const begin = (e: React.PointerEvent, c: SheetChart, box: Box, mode: 'move' | 'size', edge = '') => {
    e.stopPropagation();
    e.preventDefault();
    onPick(c.id);
    if (readOnly) return;
    drag.current = { id: c.id, mode, edge, x0: e.clientX, y0: e.clientY, start: box, pid: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    const s = d.start;
    if (d.mode === 'move') return setLive({ id: d.id, box: { ...s, x: Math.max(0, Math.round(s.x + dx)), y: Math.max(0, Math.round(s.y + dy)) } });
    let { x, y, w, h } = s;
    const minW = 160 * z;
    const minH = 120 * z;
    if (d.edge.includes('e')) w = Math.max(minW, Math.round(s.w + dx));
    if (d.edge.includes('s')) h = Math.max(minH, Math.round(s.h + dy));
    if (d.edge.includes('w')) {
      w = Math.max(minW, Math.round(s.w - dx));
      x = Math.max(0, s.x + s.w - w);
    }
    if (d.edge.includes('n')) {
      h = Math.max(minH, Math.round(s.h - dy));
      y = Math.max(0, s.y + s.h - h);
    }
    setLive({ id: d.id, box: { x, y, w, h } });
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    const c = charts.find((x) => x.id === d.id);
    const b = live?.id === d.id ? live.box : null;
    // Let go: its corners are the cells it now sits between.
    if (c && b && (b.x !== d.start.x || b.y !== d.start.y || b.w !== d.start.w || b.h !== d.start.h)) onChange({ ...c, from: cornerOn(geo, b.x, b.y), to: cornerOn(geo, b.x + b.w, b.y + b.h) });
    setLive(null);
  };
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  return (
    <>
      {charts.map((c) => {
        const at = chartBox(c, g, z);
        const box = live?.id === c.id ? live.box : at;
        // Its rows or columns all hidden: it hides with them.
        if (box.w < 1 || box.h < 1) return null;
        const on = picked === c.id;
        return (
          <div
            key={c.id}
            data-own
            translate="no"
            role="img"
            aria-label={c.title || 'Chart'}
            onPointerDown={(e) => begin(e, c, at, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => ((drag.current = null), setLive(null))}
            onDoubleClick={(e) => (e.stopPropagation(), onOpen(c.id))}
            className={cx('absolute touch-none rounded-lg border bg-panel text-fg shadow-sm', on ? 'border-accent ring-2 ring-accent/30' : 'border-line', !readOnly && 'cursor-move')}
            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
          >
            <ChartBody book={book} calc={calc} si={si} chart={c} rev={rev} w={Math.round(box.w / z)} h={Math.round(box.h / z)} />
            {on &&
              !readOnly &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => begin(e, c, at, 'size', h)}
                  className="absolute h-2.5 w-2.5 rounded-sm border-2 border-accent bg-panel"
                  style={{
                    left: h.includes('w') ? -5 : h.includes('e') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
                    top: h.includes('n') ? -5 : h.includes('s') ? 'calc(100% - 5px)' : 'calc(50% - 5px)',
                    cursor: `${h}-resize`,
                  }}
                />
              ))}
          </div>
        );
      })}
    </>
  );
}

/** The chart panel: what a chart draws and how. */
export function ChartPanel({ book, calc, si, chart, narrow, onChange, onDelete, onClose }: { book: Workbook; calc?: Calc; si?: number; chart: SheetChart; narrow: boolean; onChange: (c: SheetChart) => void; onDelete: () => void; onClose: () => void }) {
  const [range, setRange] = useState(chart.range);
  // Words typed that are no range are not taken; a range in parts that cannot be drawn is, and says why.
  const typed = cleanChartRange(range);
  const usable = !!typed && !!chartParts(typed);
  const problem = chartProblem(book, chart);
  const set = (patch: Partial<SheetChart>) => {
    const next = { ...chart, ...patch };
    for (const k of Object.keys(patch) as (keyof SheetChart)[]) if (patch[k] === undefined || patch[k] === '') delete next[k];
    onChange(next);
  };
  const pie = chart.kind === 'pie' || chart.kind === 'doughnut';
  const colors = useMemo(() => Array.from({ length: pie ? 6 : 4 }, (_, i) => chart.colors?.[i] ?? CHART_COLORS[i]), [chart.colors, pie]);
  return (
    <SidePanel
      title="Chart"
      narrow={narrow}
      onClose={onClose}
      footer={
        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onDelete} className="mr-auto text-err">
          Delete the chart
        </Button>
      }
    >
      <div className="py-1.5">
        <Row label="Kind">
          <div className="grid grid-cols-6 gap-1">
            {KINDS.map((k) => (
              <button
                key={k.kind}
                type="button"
                title={k.label}
                aria-label={k.label}
                aria-pressed={chart.kind === k.kind}
                onClick={() => set({ kind: k.kind })}
                className={cx('grid h-9 place-items-center rounded-lg', chart.kind === k.kind ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-bg-2')}
              >
                {k.icon}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Data range">
          <input
            value={range}
            onChange={(e) => setRange(e.target.value)}
            onBlur={() => {
              if (usable) set({ range: typed });
              setRange(usable ? typed : chart.range);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Data range"
            spellCheck={false}
            translate="no"
            className={cx(smallInput, !usable && 'border-err')}
          />
          {!usable ? (
            <p className="mt-1.5 text-[12px] leading-snug text-fg-3">Give a range such as A1:C9, or several split by commas, such as A1:A7,F1:F7 (Ctrl+click cells to pick more than one).</p>
          ) : (
            problem && <p className="mt-1.5 text-[12px] leading-snug text-err">{problem}</p>
          )}
        </Row>
        <Row label="Series">
          <Segmented<'cols' | 'rows'>
            size="sm"
            value={chart.by === 'rows' ? 'rows' : 'cols'}
            onChange={(v) => set({ by: v === 'rows' ? 'rows' : undefined })}
            options={[
              { value: 'cols', label: 'In columns' },
              { value: 'rows', label: 'In rows' },
            ]}
          />
          <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
            {chart.by === 'rows' ? 'First column as names' : 'First row as names'}
            <Switch label="Names" on={chart.names !== false} onChange={(on) => set({ names: on })} />
          </label>
          <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
            {chart.kind === 'scatter' ? (chart.by === 'rows' ? 'First row as X values' : 'First column as X values') : chart.by === 'rows' ? 'First row as labels' : 'First column as labels'}
            <Switch label="Labels" on={chart.labels !== false} onChange={(on) => set({ labels: on })} />
          </label>
          {(chart.kind === 'column' || chart.kind === 'bar' || chart.kind === 'area' || chart.kind === 'combo') && (
            <>
              <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                Stacked
                <Switch label="Stacked" on={!!chart.stacked} onChange={(on) => set({ stacked: on || undefined, percent: on ? chart.percent : undefined })} />
              </label>
              <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                100% stacked
                <Switch label="100% stacked" on={!!chart.percent} onChange={(on) => set({ percent: on || undefined, stacked: on || chart.stacked || undefined })} />
              </label>
            </>
          )}
          <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
            Data labels
            <Switch label="Data labels" on={!!chart.values} onChange={(on) => set({ values: on || undefined })} />
          </label>
          {chart.kind === 'histogram' && (
            <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
              Bins
              <input type="number" min={2} max={100} value={chart.bins ?? ''} placeholder="Automatic" onChange={(e) => set({ bins: e.target.value ? Math.max(2, Math.min(100, Math.round(Number(e.target.value)))) : undefined })} aria-label="Bins" className={cx(smallInput, 'w-[110px]')} />
            </label>
          )}
        </Row>
        {!pie && chart.kind !== 'histogram' && <SeriesOpts book={book} calc={calc} si={si} chart={chart} set={set} />}
        {!pie && (
          <Row label="Axis minimum and maximum">
            <div className="flex gap-1.5">
              <input type="number" value={chart.min ?? ''} placeholder="Automatic" onChange={(e) => set({ min: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label="Axis minimum" className={cx(smallInput, 'min-w-0 flex-1')} />
              <input type="number" value={chart.max ?? ''} placeholder="Automatic" onChange={(e) => set({ max: e.target.value === '' ? undefined : Number(e.target.value) })} aria-label="Axis maximum" className={cx(smallInput, 'min-w-0 flex-1')} />
            </div>
          </Row>
        )}
        <Row label="Title">
          <input value={chart.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="No title" aria-label="Title" translate="no" className={smallInput} />
        </Row>
        {!pie && (
          <Row label="Axis titles">
            <div className="flex flex-col gap-1.5">
              <input value={chart.xTitle ?? ''} onChange={(e) => set({ xTitle: e.target.value })} placeholder={chart.kind === 'bar' ? 'Vertical axis' : 'Horizontal axis'} aria-label="Horizontal axis title" translate="no" className={smallInput} />
              <input value={chart.yTitle ?? ''} onChange={(e) => set({ yTitle: e.target.value })} placeholder={chart.kind === 'bar' ? 'Horizontal axis' : 'Vertical axis'} aria-label="Vertical axis title" translate="no" className={smallInput} />
            </div>
          </Row>
        )}
        <Row label="Legend">
          <select value={chart.legend ?? 'auto'} onChange={(e) => set({ legend: e.target.value === 'auto' ? undefined : (e.target.value as SheetChart['legend']) })} aria-label="Legend" className={smallInput}>
            <option value="auto">Automatic</option>
            <option value="bottom">At the bottom</option>
            <option value="top">At the top</option>
            <option value="right">At the right</option>
            <option value="none">None</option>
          </select>
        </Row>
        <Row label="Colours">
          <div className="flex flex-wrap gap-1">
            {colors.map((col, i) => (
              <ColorTool
                key={i}
                label={pie ? `Slice ${i + 1}` : `Series ${i + 1}`}
                icon={<span className="h-4 w-4 rounded-full border border-line-2" style={{ background: col }} />}
                value={col}
                none="Automatic"
                onPick={(c) => {
                  const list = [...colors];
                  list[i] = c ?? CHART_COLORS[i];
                  set({ colors: list.every((x, j) => x === CHART_COLORS[j]) ? undefined : list });
                }}
              />
            ))}
          </div>
        </Row>
      </div>
    </SidePanel>
  );
}

/** Each series' own way: columns or a line (combo), the second axis at the right, a trendline. */
function SeriesOpts({ book, calc, si, chart, set }: { book: Workbook; calc?: Calc; si?: number; chart: SheetChart; set: (patch: Partial<SheetChart>) => void }) {
  const names = useMemo(() => (calc && si !== undefined ? (chartData(book, calc, si, chart)?.series.map((x) => x.name) ?? []) : []), [book, calc, si, chart]);
  if (!names.length) return null;
  const xy = chart.kind === 'scatter' || chart.kind === 'bubble' || chart.kind === 'radar';
  const setOne = (i: number, patch: Partial<NonNullable<SheetChart['series']>[number]>) => {
    const list = Array.from({ length: Math.max(names.length, chart.series?.length ?? 0) }, (_, j) => ({ ...(chart.series?.[j] ?? {}) }));
    const next = { ...list[i], ...patch };
    for (const k of Object.keys(patch) as (keyof typeof next)[]) if (patch[k] === undefined) delete next[k];
    list[i] = next;
    while (list.length && !Object.keys(list[list.length - 1]).length) list.pop();
    set({ series: list.length ? list : undefined });
  };
  return (
    <Row label="Each series">
      <div className="space-y-2">
        {names.slice(0, 12).map((n, i) => (
          <div key={i} className="rounded-lg border border-line p-2">
            <div translate="no" className="mb-1.5 truncate text-[12.5px] font-medium">
              {n}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(chart.kind === 'combo' || chart.kind === 'column' || chart.kind === 'line') && (
                <select value={seriesType(chart, i)} onChange={(e) => setOne(i, { type: e.target.value as 'column' | 'line' })} aria-label="Drawn as" className={cx(smallInput, 'h-7.5 w-auto text-[12px]')}>
                  <option value="column">Columns</option>
                  <option value="line">Line</option>
                </select>
              )}
              {!xy && chart.kind !== 'bar' && (
                <select value={seriesAxis(chart, i)} onChange={(e) => setOne(i, { axis: e.target.value === '2' ? 2 : undefined })} aria-label="Axis" className={cx(smallInput, 'h-7.5 w-auto text-[12px]')}>
                  <option value="1">Left axis</option>
                  <option value="2">Right axis</option>
                </select>
              )}
              {chart.kind !== 'radar' && chart.kind !== 'bubble' && (
                <select value={chart.series?.[i]?.trend ?? ''} onChange={(e) => setOne(i, { trend: (e.target.value || undefined) as 'linear' | 'exp' | undefined })} aria-label="Trendline" className={cx(smallInput, 'h-7.5 w-auto text-[12px]')}>
                  <option value="">No trendline</option>
                  <option value="linear">Linear trendline</option>
                  <option value="exp">Exponential trendline</option>
                </select>
              )}
            </div>
          </div>
        ))}
      </div>
    </Row>
  );
}

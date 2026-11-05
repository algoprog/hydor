// Charts over the grid (Insert → Chart), drawn from their cells as they are now: each floats where it was put, a click
// picks it (its handles size it, a drag moves it, Delete removes it, a double click opens its panel), and the chart
// panel changes it: its kind (column, bar, line, area, pie, doughnut, scatter), its cells, series in columns or rows,
// the first row and column as names and labels, its title, legend, axes' titles and colours.
import { memo, useMemo, useRef, useState } from 'react';
import { ChartArea, ChartBar, ChartColumn, ChartLine, ChartPie, ChartScatter, Donut, Trash2 } from 'lucide-react';
import { cleanSource, type Calc, type SheetChart, type SheetChartKind, type Workbook } from '@shared/sheets';
import { chartData, chartSvg, CHART_COLORS } from '@shared/sheet-chart';
import { Button, cx, Segmented, Switch } from '../../../components/ui';
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
];

/** One chart drawn: its SVG made again only when the chart or the workbook changes. */
const ChartBody = memo(function ChartBody({ book, calc, si, chart, rev }: { book: Workbook; calc: Calc; si: number; chart: SheetChart; rev: number }) {
  void rev;
  const svg = chartSvg(chart, chartData(book, calc, si, chart), chart.w, chart.h);
  return <div className="pointer-events-none h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
});

type Drag = { id: string; mode: 'move' | 'size'; edge: string; x0: number; y0: number; start: SheetChart; pid: number };

/** The sheet's charts, over the grid from A1's corner, at the grid's zoom. */
export function ChartLayer({
  book,
  calc,
  si,
  charts,
  rev,
  zoom,
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
  zoom: number;
  picked: string | null;
  readOnly?: boolean;
  onPick: (id: string | null) => void;
  onChange: (c: SheetChart) => void;
  onOpen: (id: string) => void;
}) {
  const [live, setLive] = useState<SheetChart | null>(null);
  const drag = useRef<Drag | null>(null);
  const begin = (e: React.PointerEvent, c: SheetChart, mode: 'move' | 'size', edge = '') => {
    e.stopPropagation();
    e.preventDefault();
    onPick(c.id);
    if (readOnly) return;
    drag.current = { id: c.id, mode, edge, x0: e.clientX, y0: e.clientY, start: c, pid: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = (e.clientX - d.x0) / zoom;
    const dy = (e.clientY - d.y0) / zoom;
    const s = d.start;
    if (d.mode === 'move') return setLive({ ...s, x: Math.max(0, Math.round(s.x + dx)), y: Math.max(0, Math.round(s.y + dy)) });
    let { x, y, w, h } = s;
    if (d.edge.includes('e')) w = Math.max(160, Math.round(s.w + dx));
    if (d.edge.includes('s')) h = Math.max(120, Math.round(s.h + dy));
    if (d.edge.includes('w')) {
      w = Math.max(160, Math.round(s.w - dx));
      x = Math.max(0, s.x + s.w - w);
    }
    if (d.edge.includes('n')) {
      h = Math.max(120, Math.round(s.h - dy));
      y = Math.max(0, s.y + s.h - h);
    }
    setLive({ ...s, x, y, w, h });
  };
  const end = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (live && (live.x !== d.start.x || live.y !== d.start.y || live.w !== d.start.w || live.h !== d.start.h)) onChange(live);
    setLive(null);
  };
  const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  return (
    <>
      {charts.map((c0) => {
        const c = live?.id === c0.id ? live : c0;
        const on = picked === c.id;
        return (
          <div
            key={c.id}
            data-own
            translate="no"
            role="img"
            aria-label={c.title || 'Chart'}
            onPointerDown={(e) => begin(e, c0, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => ((drag.current = null), setLive(null))}
            onDoubleClick={(e) => (e.stopPropagation(), onOpen(c.id))}
            className={cx('absolute touch-none rounded-lg border bg-panel text-fg shadow-sm', on ? 'border-accent ring-2 ring-accent/30' : 'border-line', !readOnly && 'cursor-move')}
            style={{ left: c.x * zoom, top: c.y * zoom, width: c.w * zoom, height: c.h * zoom }}
          >
            <ChartBody book={book} calc={calc} si={si} chart={c} rev={rev} />
            {on &&
              !readOnly &&
              HANDLES.map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => begin(e, c0, 'size', h)}
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
export function ChartPanel({ chart, narrow, onChange, onDelete, onClose }: { chart: SheetChart; narrow: boolean; onChange: (c: SheetChart) => void; onDelete: () => void; onClose: () => void }) {
  const [range, setRange] = useState(chart.range);
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
          <div className="grid grid-cols-7 gap-1">
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
              const r = cleanSource(range);
              if (r) set({ range: r });
              else setRange(chart.range);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Data range"
            spellCheck={false}
            translate="no"
            className={cx(smallInput, !cleanSource(range) && 'border-err')}
          />
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
          {(chart.kind === 'column' || chart.kind === 'bar' || chart.kind === 'area') && (
            <label className="mt-2 flex items-center justify-between gap-2 text-[13px]">
              Stacked
              <Switch label="Stacked" on={!!chart.stacked} onChange={(on) => set({ stacked: on || undefined })} />
            </label>
          )}
        </Row>
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

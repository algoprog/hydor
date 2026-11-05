// The spreadsheet editor's toolbar, one row that scrolls sideways when narrow: Undo and Redo; how numbers show
// (General, Number, Percent, Currency, Date, Text) with fewer or more decimals; type size; bold, italic, underline,
// struck through; text and fill colours; alignment and wrapping; what stays in view (freeze); sorting; and rows and
// columns to put in or take out. Its buttons keep the focus where it was (a cell being typed into stays so).
import { useRef, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownAZ,
  ArrowDownZA,
  Baseline,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Bold,
  ChevronDown,
  DecimalsArrowLeft,
  DecimalsArrowRight,
  Italic,
  PaintBucket,
  Redo2,
  Rows3,
  Snowflake,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  WrapText,
} from 'lucide-react';
import { colName, type CellStyle, type NumFmt } from '@shared/sheets';
import { cx, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { Tool } from '../slides/controls';

export const SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36];

/** A short palette: greys, strong colours, soft ones. */
const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#efefef', '#ffffff',
  '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad',
  '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9',
];

const sep = <span className="mx-1 h-5 w-px shrink-0 bg-line" />;

/** A toolbar button that opens a short menu under it. */
function MenuTool(p: { label: string; icon?: ReactNode; text?: ReactNode; width?: number; active?: boolean; children: (close: () => void) => ReactNode }) {
  const { label, icon, text, width = 236, children, active } = p;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg',
          (open || active) && 'bg-bg-2 text-fg',
        )}
      >
        {icon}
        {text}
        <ChevronDown size={12} className="text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={width} title={label}>
        <div onMouseDown={(e) => e.preventDefault()}>{children(() => setOpen(false))}</div>
      </Popover>
    </>
  );
}

/** A colour: a button with a bar of the colour under its icon, and a palette (or any colour) to pick from. */
export function ColorTool({ label, icon, value, onPick, none }: { label: string; icon: ReactNode; value: string | undefined; onPick: (c: string | undefined) => void; none: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className={cx('relative flex h-8 min-w-8 shrink-0 flex-col items-center justify-center rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2')}
      >
        {icon}
        <span className="mt-0.5 h-[3px] w-4 rounded-full border border-line-2" style={{ background: value ?? 'transparent' }} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={236} title={label}>
        <div className="p-2" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <button
            type="button"
            onClick={() => (onPick(undefined), setOpen(false))}
            className={cx('mb-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-bg-2', !value && 'bg-bg-2')}
          >
            <span className="relative h-4 w-4 overflow-hidden rounded-full border border-line-2 bg-white">
              <span className="absolute top-1/2 left-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-err" />
            </span>
            {none}
          </button>
          <div className="grid grid-cols-7 gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                onClick={() => (onPick(c), setOpen(false))}
                style={{ background: c }}
                className={cx('h-6 w-6 rounded-full border border-line-2', value === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
              />
            ))}
          </div>
          <label className="mt-2 flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-fg-2 hover:bg-bg-2">
            <span className="relative h-4 w-4 overflow-hidden rounded-full border border-line-2 bg-[conic-gradient(#f44,#fd4,#4d4,#4df,#44f,#f4f,#f44)]">
              <input type="color" value={value ?? '#000000'} onChange={(e) => onPick(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            </span>
            Another colour
          </label>
        </div>
      </Popover>
    </>
  );
}

export interface ToolbarProps {
  style: CellStyle | undefined;
  /** The active cell's row and column, and the selection's rows and columns (for the menus' words). */
  r: number;
  c: number;
  nRows: number;
  nCols: number;
  canUndo: boolean;
  canRedo: boolean;
  narrow: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onStyle: (set: Partial<CellStyle>) => void;
  onFormat: (fmt: NumFmt, cur?: string) => void;
  onDecimals: (step: 1 | -1) => void;
  onFreeze: (rows: number, cols: number) => void;
  freeze: { rows?: number; cols?: number } | undefined;
  onSort: (asc: boolean) => void;
  onInsert: (axis: 'row' | 'col', after: boolean) => void;
  onDelete: (axis: 'row' | 'col') => void;
}

const FORMATS: { fmt: NumFmt; cur?: string; label: string; hint: string }[] = [
  { fmt: 'general', label: 'Automatic', hint: '1000.5' },
  { fmt: 'number', label: 'Number', hint: '1,000.50' },
  { fmt: 'percent', label: 'Percent', hint: '10%' },
  { fmt: 'currency', label: 'Currency ($)', hint: '$1,000.50', cur: '$' },
  { fmt: 'currency', label: 'Currency (€)', hint: '€1,000.50', cur: '€' },
  { fmt: 'currency', label: 'Currency (£)', hint: '£1,000.50', cur: '£' },
  { fmt: 'date', label: 'Date', hint: '2026-01-31' },
  { fmt: 'text', label: 'Text', hint: 'as typed' },
];

const FMT_SHORT: Record<NumFmt, string> = { general: '123', number: '1.0', percent: '%', currency: '$', accounting: '$', scientific: '1E', date: 'Date', time: 'Time', datetime: 'Date', duration: 'Time', text: 'Text' };

export function Toolbar(p: ToolbarProps) {
  const s = p.style;
  const fmt = s?.fmt ?? 'general';
  const cur = fmt === 'currency' ? (s?.cur ?? '$') : undefined;
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
      <Tool label="Undo (Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo}>
        <Undo2 size={15} />
      </Tool>
      <Tool label="Redo (Ctrl+Shift+Z)" onClick={p.onRedo} disabled={!p.canRedo}>
        <Redo2 size={15} />
      </Tool>
      {sep}
      <MenuTool label="How numbers show" text={<span className="min-w-[2ch] font-medium tabular-nums">{fmt === 'currency' ? cur : FMT_SHORT[fmt]}</span>} width={250}>
        {(close) =>
          FORMATS.map((f) => (
            <MenuItem key={f.label} checked={fmt === f.fmt && (f.fmt !== 'currency' || cur === f.cur)} hint={f.hint} onClick={() => (p.onFormat(f.fmt, f.cur), close())}>
              {f.label}
            </MenuItem>
          ))
        }
      </MenuTool>
      <Tool label="Fewer decimals" onClick={() => p.onDecimals(-1)}>
        <DecimalsArrowLeft size={16} />
      </Tool>
      <Tool label="More decimals" onClick={() => p.onDecimals(1)}>
        <DecimalsArrowRight size={16} />
      </Tool>
      {sep}
      <MenuTool label="Type size" text={<span className="min-w-[2ch] tabular-nums">{s?.size ?? 10}</span>} width={120}>
        {(close) =>
          SIZES.map((n) => (
            <MenuItem key={n} checked={(s?.size ?? 10) === n} onClick={() => (p.onStyle({ size: n === 10 ? undefined : n }), close())}>
              {n}
            </MenuItem>
          ))
        }
      </MenuTool>
      {sep}
      <Tool label="Bold (Ctrl+B)" on={!!s?.b} onClick={() => p.onStyle({ b: !s?.b || undefined })}>
        <Bold size={15} />
      </Tool>
      <Tool label="Italic (Ctrl+I)" on={!!s?.i} onClick={() => p.onStyle({ i: !s?.i || undefined })}>
        <Italic size={15} />
      </Tool>
      <Tool label="Underline (Ctrl+U)" on={!!s?.u} onClick={() => p.onStyle({ u: !s?.u || undefined })}>
        <Underline size={15} />
      </Tool>
      <Tool label="Strikethrough" on={!!s?.s} onClick={() => p.onStyle({ s: !s?.s || undefined })}>
        <Strikethrough size={15} />
      </Tool>
      <ColorTool label="Text colour" icon={<Baseline size={15} />} value={s?.color} none="Automatic" onPick={(c) => p.onStyle({ color: c })} />
      <ColorTool label="Fill colour" icon={<PaintBucket size={15} />} value={s?.fill} none="No fill" onPick={(c) => p.onStyle({ fill: c })} />
      {sep}
      <Tool label="Align left" on={s?.align === 'left'} onClick={() => p.onStyle({ align: s?.align === 'left' ? undefined : 'left' })}>
        <AlignLeft size={15} />
      </Tool>
      <Tool label="Align centre" on={s?.align === 'center'} onClick={() => p.onStyle({ align: s?.align === 'center' ? undefined : 'center' })}>
        <AlignCenter size={15} />
      </Tool>
      <Tool label="Align right" on={s?.align === 'right'} onClick={() => p.onStyle({ align: s?.align === 'right' ? undefined : 'right' })}>
        <AlignRight size={15} />
      </Tool>
      <Tool label="Wrap words in the cell" on={!!s?.wrap} onClick={() => p.onStyle({ wrap: !s?.wrap || undefined })}>
        <WrapText size={15} />
      </Tool>
      {sep}
      <MenuTool label="Keep in view (freeze)" icon={<Snowflake size={15} />} active={!!(p.freeze?.rows || p.freeze?.cols)} width={250}>
        {(close) => (
          <>
            <MenuItem checked={!p.freeze?.rows && !p.freeze?.cols} onClick={() => (p.onFreeze(0, 0), close())}>
              Nothing frozen
            </MenuItem>
            <MenuItem checked={p.freeze?.rows === 1 && !p.freeze?.cols} onClick={() => (p.onFreeze(1, 0), close())}>
              The first row
            </MenuItem>
            <MenuItem checked={!p.freeze?.rows && p.freeze?.cols === 1} onClick={() => (p.onFreeze(0, 1), close())}>
              The first column
            </MenuItem>
            <MenuItem disabled={p.r + 1 > 50} onClick={() => (p.onFreeze(p.r + 1, p.freeze?.cols ?? 0), close())}>
              {`Rows up to ${p.r + 1}`}
            </MenuItem>
            <MenuItem disabled={p.c + 1 > 20} onClick={() => (p.onFreeze(p.freeze?.rows ?? 0, p.c + 1), close())}>
              {`Columns up to ${colName(p.c)}`}
            </MenuItem>
          </>
        )}
      </MenuTool>
      <Tool label="Sort A to Z, by this column" onClick={() => p.onSort(true)}>
        <ArrowDownAZ size={16} />
      </Tool>
      <Tool label="Sort Z to A, by this column" onClick={() => p.onSort(false)}>
        <ArrowDownZA size={16} />
      </Tool>
      {sep}
      <MenuTool label="Rows and columns" icon={<Rows3 size={15} />} text={p.narrow ? undefined : <span>Rows and columns</span>} width={250}>
        {(close) => (
          <>
            <MenuItem icon={<BetweenHorizontalStart size={14} />} onClick={() => (p.onInsert('row', false), close())}>
              {p.nRows === 1 ? 'Insert a row above' : `Insert ${p.nRows} rows above`}
            </MenuItem>
            <MenuItem icon={<BetweenHorizontalStart size={14} />} onClick={() => (p.onInsert('row', true), close())}>
              {p.nRows === 1 ? 'Insert a row below' : `Insert ${p.nRows} rows below`}
            </MenuItem>
            <MenuItem icon={<BetweenVerticalStart size={14} />} onClick={() => (p.onInsert('col', false), close())}>
              {p.nCols === 1 ? 'Insert a column left' : `Insert ${p.nCols} columns left`}
            </MenuItem>
            <MenuItem icon={<BetweenVerticalStart size={14} />} onClick={() => (p.onInsert('col', true), close())}>
              {p.nCols === 1 ? 'Insert a column right' : `Insert ${p.nCols} columns right`}
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (p.onDelete('row'), close())}>
              {p.nRows === 1 ? 'Delete this row' : `Delete ${p.nRows} rows`}
            </MenuItem>
            <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (p.onDelete('col'), close())}>
              {p.nCols === 1 ? 'Delete this column' : `Delete ${p.nCols} columns`}
            </MenuItem>
          </>
        )}
      </MenuTool>
    </div>
  );
}

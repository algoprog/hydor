// The spreadsheet editor's toolbar, one row that scrolls sideways when narrow: the menus first when it is given them (the
// editor puts them beside its title instead, as one Menus button where the title bar has no room), then the most used: Undo and Redo; how
// numbers show, with fewer or more decimals; type size; bold, italic, struck through and the text's colour; the fill,
// borders and merging; alignment and wrapping; and the filter. Everything else is in the menus. Its buttons keep the
// focus where it was (a cell being typed into stays so).
import { useRef, useState, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, DecimalsArrowLeft, DecimalsArrowRight, DollarSign, Italic, PaintRoller, ListFilter, PaintBucket, Percent, Redo2, Sigma, Strikethrough, TableCellsMerge, Undo2, WrapText } from 'lucide-react';
import { type BorderKind, type CellStyle, type NumFmt } from '@shared/sheets';
import { cx, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { MenuBar, type MenuDef } from '../common/menus';
import { Tool } from '../slides/controls';
import type { BorderWhere } from './tools';

export const SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36];

/** A short palette: greys, strong colours, soft ones. */
export const PALETTE = [
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
        className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', (open || active) && 'bg-bg-2 text-fg')}
      >
        {icon}
        {text}
        <ChevronDown size={12} className="text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={width} title={label}>
        <div onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>{children(() => setOpen(false))}</div>
      </Popover>
    </>
  );
}

/** Colours to pick from: none, a palette, or any colour. */
export function Palette({ value, onPick, none }: { value: string | undefined; onPick: (c: string | undefined) => void; none: string }) {
  return (
    <div className="p-2" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
      <button type="button" onClick={() => onPick(undefined)} className={cx('mb-2 flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-bg-2', !value && 'bg-bg-2')}>
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
            onClick={() => onPick(c)}
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
        <Palette value={value} none={none} onPick={(c) => (onPick(c), setOpen(false))} />
      </Popover>
    </>
  );
}

/** A small picture of a border choice: the cell's lines faint, the ones it draws solid. */
export function BorderIcon({ where }: { where: BorderWhere }) {
  const drawn: Record<BorderWhere, string[]> = { all: ['t', 'b', 'l', 'r', 'h', 'v'], inner: ['h', 'v'], h: ['h'], v: ['v'], outer: ['t', 'b', 'l', 'r'], top: ['t'], bottom: ['b'], left: ['l'], right: ['r'], none: [] };
  const sides: [string, string][] = [
    ['t', 'M2 2H14'],
    ['b', 'M2 14H14'],
    ['l', 'M2 2V14'],
    ['r', 'M14 2V14'],
    ['h', 'M2 8H14'],
    ['v', 'M8 2V14'],
  ];
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {sides.map(([k, d]) => {
        const on = drawn[where].includes(k);
        return <path key={k} d={d} stroke="currentColor" strokeWidth={on ? 1.8 : 1} strokeOpacity={on ? 1 : 0.3} strokeDasharray={on ? undefined : '1.5 1.5'} />;
      })}
    </svg>
  );
}

export const BORDER_WHERE: { where: BorderWhere; label: string }[] = [
  { where: 'all', label: 'All borders' },
  { where: 'inner', label: 'Inner borders' },
  { where: 'h', label: 'Horizontal borders' },
  { where: 'v', label: 'Vertical borders' },
  { where: 'outer', label: 'Outer borders' },
  { where: 'left', label: 'Left border' },
  { where: 'top', label: 'Top border' },
  { where: 'right', label: 'Right border' },
  { where: 'bottom', label: 'Bottom border' },
  { where: 'none', label: 'Clear borders' },
];

export const BORDER_KINDS_SHOWN: { kind: BorderKind; label: string }[] = [
  { kind: 'thin', label: 'Thin line' },
  { kind: 'medium', label: 'Medium line' },
  { kind: 'thick', label: 'Thick line' },
  { kind: 'dashed', label: 'Dashed line' },
  { kind: 'dotted', label: 'Dotted line' },
  { kind: 'double', label: 'Double line' },
];

/** What a border kind looks like, drawn. */
export const LineSample = ({ kind }: { kind: BorderKind }) => (
  <span className="block w-6" style={{ borderTop: `${kind === 'medium' ? 2 : kind === 'thick' || kind === 'double' ? 3 : 1}px ${kind === 'dashed' ? 'dashed' : kind === 'dotted' ? 'dotted' : kind === 'double' ? 'double' : 'solid'} currentColor` }} />
);

/** Colours a border may be drawn in (automatic: the text's). */
export const BORDER_COLORS = [undefined, '#000000', '#666666', '#c0392b', '#e67e22', '#27ae60', '#2980b9', '#8e44ad'];

/** The borders popover: where they go, the kind of line, its colour. */
function BordersTool({ line, onLine, onBorders }: { line: { kind: BorderKind; color?: string }; onLine: (l: { kind: BorderKind; color?: string }) => void; onBorders: (where: BorderWhere) => void }) {
  return (
    <MenuTool label="Borders" icon={<BorderIcon where="all" />} width={252}>
      {(close) => (
        <div className="p-1">
          <div className="grid grid-cols-5 gap-1">
            {BORDER_WHERE.map((b) => (
              <button key={b.where} type="button" title={b.label} aria-label={b.label} onClick={() => (onBorders(b.where), close())} className="grid h-9 place-items-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg">
                <BorderIcon where={b.where} />
              </button>
            ))}
          </div>
          <div className="mt-2 mb-1 px-1 text-[11.5px] font-medium text-fg-3">Line</div>
          <div className="grid grid-cols-6 gap-1">
            {BORDER_KINDS_SHOWN.map((k) => (
              <button
                key={k.kind}
                type="button"
                title={k.label}
                aria-label={k.label}
                aria-pressed={line.kind === k.kind}
                onClick={() => onLine({ ...line, kind: k.kind })}
                className={cx('grid h-8 place-items-center rounded-lg', line.kind === k.kind ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-bg-2')}
              >
                <LineSample kind={k.kind} />
              </button>
            ))}
          </div>
          <div className="mt-2 mb-1 px-1 text-[11.5px] font-medium text-fg-3">Colour</div>
          <div className="grid grid-cols-8 gap-1 px-0.5 pb-0.5">
            {BORDER_COLORS.map((c) => (
              <button
                key={c ?? 'auto'}
                type="button"
                title={c ?? 'Automatic'}
                aria-label={c ?? 'Automatic'}
                onClick={() => onLine({ ...line, color: c })}
                className={cx('grid h-6 w-6 place-items-center rounded-full border border-line-2 text-[10px] text-fg-3', line.color === c && 'ring-2 ring-accent ring-offset-1 ring-offset-elevated')}
                style={{ background: c }}
              >
                {!c && 'A'}
              </button>
            ))}
          </div>
        </div>
      )}
    </MenuTool>
  );
}

export interface ToolbarProps {
  /** The menus, as one Menus button at the toolbar's start (where the title bar has no room for their names). */
  menus?: MenuDef[];
  style: CellStyle | undefined;
  readOnly?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  narrow: boolean;
  /** The selection is (in) merged cells. */
  merged: boolean;
  filtered: boolean;
  /** The line borders are drawn with. */
  line: { kind: BorderKind; color?: string };
  onLine: (l: { kind: BorderKind; color?: string }) => void;
  onUndo: () => void;
  onRedo: () => void;
  onStyle: (set: Partial<CellStyle>) => void;
  onFormat: (fmt: NumFmt | 'custom', cur?: string) => void;
  /** The $ and % buttons. */
  onToggleFormat: (fmt: 'currency' | 'percent') => void;
  /** The format painter: copy the look of the cell picked onto what is picked next (`keep`: a double click, it stays on). */
  painting: boolean;
  onPainter: (keep: boolean) => void;
  /** The Σ button: a function of the numbers beside the cell. */
  onAutoSum: (fn: string) => void;
  onDecimals: (step: 1 | -1) => void;
  onBorders: (where: BorderWhere) => void;
  onMerge: (how: 'all' | 'across' | 'down' | 'none') => void;
  onFilter: () => void;
}

/** How numbers show, as the toolbar's list and Format → Number offer them. */
export const FORMATS: { fmt: NumFmt | 'custom'; cur?: string; label: string; hint: string }[] = [
  { fmt: 'general', label: 'Automatic', hint: '1000.5' },
  { fmt: 'text', label: 'Plain text', hint: 'as typed' },
  { fmt: 'number', label: 'Number', hint: '1,000.50' },
  { fmt: 'percent', label: 'Percent', hint: '10.50%' },
  { fmt: 'scientific', label: 'Scientific', hint: '1.01E+03' },
  { fmt: 'accounting', label: 'Accounting', hint: '$ (1,000.50)' },
  { fmt: 'currency', label: 'Currency ($)', hint: '$1,000.50', cur: '$' },
  { fmt: 'currency', label: 'Currency (€)', hint: '€1,000.50', cur: '€' },
  { fmt: 'currency', label: 'Currency (£)', hint: '£1,000.50', cur: '£' },
  { fmt: 'date', label: 'Date', hint: '2026-11-05' },
  { fmt: 'time', label: 'Time', hint: '14:30:00' },
  { fmt: 'datetime', label: 'Date and time', hint: '2026-11-05 14:30' },
  { fmt: 'duration', label: 'Duration', hint: '26:30:00' },
  { fmt: 'custom', label: 'Custom number format', hint: '' },
];

/** What AutoSum offers (Insert → AutoSum has the same). */
export const AUTOSUMS = [
  { fn: 'SUM', label: 'Sum' },
  { fn: 'AVERAGE', label: 'Average' },
  { fn: 'COUNT', label: 'Count numbers' },
  { fn: 'MAX', label: 'Max' },
  { fn: 'MIN', label: 'Min' },
];

const FMT_SHORT: Record<NumFmt, string> = { general: '123', number: '1.0', percent: '%', currency: '$', accounting: '$', scientific: '1E', date: 'Date', time: 'Time', datetime: 'Date', duration: 'Time', text: 'Text' };

const ALIGNS: { set: Partial<CellStyle>; label: string; icon?: ReactNode }[] = [
  { set: { align: 'left' }, label: 'Align left', icon: <AlignLeft size={14} /> },
  { set: { align: 'center' }, label: 'Align centre', icon: <AlignCenter size={14} /> },
  { set: { align: 'right' }, label: 'Align right', icon: <AlignRight size={14} /> },
  { set: { valign: 'top' }, label: 'Align to the top' },
  { set: { valign: 'middle' }, label: 'Align to the middle' },
  { set: { valign: 'bottom' }, label: 'Align to the bottom' },
];

export function Toolbar(p: ToolbarProps) {
  const s = p.style;
  const fmt = s?.code ? 'custom' : (s?.fmt ?? 'general');
  const cur = s?.fmt === 'currency' ? (s?.cur ?? '$') : undefined;
  const menuBar = p.menus && <MenuBar menus={p.menus} compact className="shrink-0" />;
  if (p.readOnly) return menuBar ? <div className="flex h-11 shrink-0 items-center gap-0.5 border-b border-line bg-panel px-2">{menuBar}</div> : null;
  return (
    <div className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-panel px-2 [&::-webkit-scrollbar]:hidden">
      {menuBar}
      {menuBar && sep}
      <Tool label="Undo (Ctrl+Z)" onClick={p.onUndo} disabled={!p.canUndo}>
        <Undo2 size={15} />
      </Tool>
      <Tool label="Redo (Ctrl+Shift+Z)" onClick={p.onRedo} disabled={!p.canRedo}>
        <Redo2 size={15} />
      </Tool>
      {sep}
      <MenuTool label="How numbers show" text={<span className="min-w-[2ch] font-medium tabular-nums">{fmt === 'custom' ? '0.0' : fmt === 'currency' ? cur : FMT_SHORT[fmt]}</span>} width={268}>
        {(close) =>
          FORMATS.map((f) => (
            <MenuItem key={f.label} checked={f.fmt === 'custom' ? fmt === 'custom' : fmt === f.fmt && (f.fmt !== 'currency' || cur === f.cur)} hint={f.hint || undefined} onClick={() => (p.onFormat(f.fmt, f.cur), close())}>
              {f.label}
            </MenuItem>
          ))
        }
      </MenuTool>
      <button
        type="button"
        title="Format painter: copy the look of the cells picked onto others (double-click to paint several times)"
        aria-label="Format painter"
        aria-pressed={p.painting}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => p.onPainter(false)}
        onDoubleClick={() => p.onPainter(true)}
        className={cx('flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', p.painting && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent')}
      >
        <PaintRoller size={15} />
      </button>
      {sep}
      <Tool label="Format as currency (Ctrl+Shift+4)" on={fmt === 'currency'} onClick={() => p.onToggleFormat('currency')}>
        <DollarSign size={15} />
      </Tool>
      <Tool label="Format as percent (Ctrl+Shift+5)" on={fmt === 'percent'} onClick={() => p.onToggleFormat('percent')}>
        <Percent size={15} />
      </Tool>
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
      <Tool label="Strikethrough (Alt+Shift+5)" on={!!s?.s} onClick={() => p.onStyle({ s: !s?.s || undefined })}>
        <Strikethrough size={15} />
      </Tool>
      <ColorTool label="Text colour" icon={<Baseline size={15} />} value={s?.color} none="Automatic" onPick={(c) => p.onStyle({ color: c })} />
      {sep}
      <ColorTool label="Fill colour" icon={<PaintBucket size={15} />} value={s?.fill} none="No fill" onPick={(c) => p.onStyle({ fill: c })} />
      <BordersTool line={p.line} onLine={p.onLine} onBorders={p.onBorders} />
      <MenuTool label="Merge cells" icon={<TableCellsMerge size={15} />} active={p.merged} width={220}>
        {(close) => (
          <>
            <MenuItem onClick={() => (p.onMerge('all'), close())}>Merge all</MenuItem>
            <MenuItem onClick={() => (p.onMerge('across'), close())}>Merge horizontally</MenuItem>
            <MenuItem onClick={() => (p.onMerge('down'), close())}>Merge vertically</MenuItem>
            <MenuSep />
            <MenuItem disabled={!p.merged} onClick={() => (p.onMerge('none'), close())}>
              Unmerge
            </MenuItem>
          </>
        )}
      </MenuTool>
      {sep}
      <MenuTool label="Alignment" icon={s?.align === 'center' ? <AlignCenter size={15} /> : s?.align === 'right' ? <AlignRight size={15} /> : <AlignLeft size={15} />} width={220}>
        {(close) =>
          ALIGNS.map((a, i) => {
            const on = a.set.align ? s?.align === a.set.align : s?.valign === a.set.valign || (a.set.valign === 'middle' && !s?.valign);
            return (
              <div key={a.label}>
                {i === 3 && <MenuSep />}
                <MenuItem icon={a.icon} checked={on} onClick={() => (p.onStyle(on && a.set.align ? { align: undefined } : a.set.valign === 'middle' ? { valign: undefined } : a.set), close())}>
                  {a.label}
                </MenuItem>
              </div>
            );
          })
        }
      </MenuTool>
      <Tool label="Wrap words in the cell" on={!!s?.wrap} onClick={() => p.onStyle({ wrap: !s?.wrap || undefined })}>
        <WrapText size={15} />
      </Tool>
      {sep}
      <MenuTool label="AutoSum (Alt+=)" icon={<Sigma size={15} />} width={200}>
        {(close) => AUTOSUMS.map((f) => (
          <MenuItem key={f.fn} hint={f.fn === 'SUM' ? 'Alt+=' : undefined} onClick={() => (p.onAutoSum(f.fn), close())}>
            {f.label}
          </MenuItem>
        ))}
      </MenuTool>
      <Tool label={p.filtered ? 'Remove the filter' : 'Create a filter'} on={p.filtered} onClick={p.onFilter}>
        <ListFilter size={15} />
      </Tool>
    </div>
  );
}

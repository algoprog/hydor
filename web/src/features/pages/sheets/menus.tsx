// The spreadsheet editor's menus (Edit, View, Insert, Format, Data, Tools), as the shared menu bar shows them and
// Search the menus finds them, built from what the editor can do now: what is picked, what the sheet has (a filter,
// hidden rows, merges), and the active cell's look. Each list is kept short enough for a small window; longer ones
// (number formats, fonts, borders) open in the menu's place.
import {
  ArrowDownAZ,
  ArrowDownZA,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Calendar,
  ChartColumn,
  ClipboardPaste,
  Copy,
  Eraser,
  Eye,
  Keyboard,
  ListFilter,
  MessageSquarePlus,
  MessagesSquare,
  Omega,
  Paintbrush,
  Redo2,
  RemoveFormatting,
  Scissors,
  Search,
  Sigma,
  Snowflake,
  Sparkles,
  MessageCircleQuestionMark,
  RefreshCw,
  WandSparkles,
  Eraser as Broom,
  ChartNoAxesCombined,
  Split,
  SquareCheck,
  SquareChevronDown,
  SquareKanban,
  Star,
  StickyNote,
  TableCellsMerge,
  Trash2,
  Undo2,
  ZoomIn,
} from 'lucide-react';
import { CELL_FONTS, colName, type BorderKind, type CellStyle, type NumFmt } from '@shared/sheets';
import type { MenuDef, MenuEntry } from '../common/menus';
import { BORDER_KINDS_SHOWN, BORDER_WHERE, BorderIcon, FORMATS, SIZES } from './Toolbar';
import type { BorderWhere, PasteHow } from './tools';

/** The date formats offered besides the plain one, as codes. */
export const DATE_CODES: { code?: string; label: string; hint: string }[] = [
  { label: 'Date', hint: '2026-11-05' },
  { code: 'dd/mm/yyyy', label: 'Day, month, year', hint: '05/11/2026' },
  { code: 'mm/dd/yyyy', label: 'Month, day, year', hint: '11/05/2026' },
  { code: 'd mmm yyyy', label: 'Day and short month', hint: '5 Nov 2026' },
  { code: 'dddd, d mmmm yyyy', label: 'Weekday and month', hint: 'Thursday, 5 November 2026' },
];

export const ZOOMS = [50, 75, 90, 100, 110, 125, 150, 175, 200];

/** What the menus need of the editor: its state and its actions. */
export interface MenuCtx {
  readOnly?: boolean;
  style: CellStyle | undefined;
  nRows: number;
  nCols: number;
  /** The active cell's column letters, for "Sort sheet by column B". */
  col: string;
  canUndo: boolean;
  canRedo: boolean;
  filtered: boolean;
  merged: boolean;
  freeze: { rows?: number; cols?: number } | undefined;
  r: number;
  c: number;
  hiddenRows: boolean;
  hiddenCols: boolean;
  zoom: number;
  formulas: boolean;
  note: boolean;
  line: { kind: BorderKind; color?: string };
  onAsk?: () => void;
  undo(): void;
  redo(): void;
  copy(cut: boolean): void;
  paste(): void;
  pasteSpecial(how: PasteHow): void;
  find(replace: boolean): void;
  fill(down: boolean): void;
  clear(all?: boolean): void;
  selectAll(): void;
  setFreeze(rows: number, cols: number): void;
  setZoom(z: number): void;
  setFormulas(on: boolean): void;
  showAll(axis: 'row' | 'col'): void;
  insert(axis: 'row' | 'col', after: boolean): void;
  remove(axis: 'row' | 'col'): void;
  hide(axis: 'row' | 'col'): void;
  chart(): void;
  checkbox(): void;
  dropdown(): void;
  rating(): void;
  date(): void;
  noteEdit(): void;
  /** A comment on the active cell (its thread, where it has one), and the panel of all the sheet's comments. */
  comment(): void;
  comments(): void;
  func(name: string): void;
  chars(): void;
  addSheet(): void;
  setStyle(set: Partial<CellStyle>): void;
  setFormat(fmt: NumFmt | 'custom', cur?: string): void;
  setCode(code: string | undefined): void;
  borders(where: BorderWhere): void;
  setLine(l: { kind: BorderKind; color?: string }): void;
  merge(how: 'all' | 'across' | 'down' | 'none'): void;
  conditional(): void;
  sortRange(): void;
  sortSheet(asc: boolean): void;
  toggleFilter(): void;
  validation(): void;
  dups(): void;
  summary(): void;
  split(): void;
  trim(): void;
  shortcuts(): void;
  expand(): void;
  /** The rows as a Kanban board, grouped by a dropdown column. */
  board: boolean;
  toggleBoard(): void;
  /** While the board shows: whether the sheet opens on it, and the switch for that (kept with the sheet). */
  boardOpens?: boolean;
  boardOpen(): void;
  /** The AI tools: a formula written or explained, Fill with AI, a table made, Analyze and Clean up, and the AI cells. */
  ai?: {
    formula(): void;
    explain?: () => void;
    fill(): void;
    table(): void;
    analyze(): void;
    clean(): void;
    /** Whether the workbook has AI cells; how many wait for an answer. */
    cells: boolean;
    refresh(): void;
    waiting: number;
    askWaiting(): void;
  };
}

const FUNCS = ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN', 'IF', 'SUMIF', 'COUNTIF', 'VLOOKUP', 'XLOOKUP', 'ROUND', 'CONCAT', 'TODAY'];

export function sheetMenus(m: MenuCtx): MenuDef[] {
  const s = m.style;
  const ro = !!m.readOnly;
  const pasteSpecial: MenuEntry = !ro && {
    label: 'Paste special',
    icon: <ClipboardPaste size={14} />,
    items: [
      { label: 'Values only', keys: 'Ctrl+Shift+V', run: () => m.pasteSpecial('values') },
      { label: 'Formats only', run: () => m.pasteSpecial('formats') },
      { label: 'Formulas only', run: () => m.pasteSpecial('formulas') },
      { label: 'Transposed', also: 'rows columns swap turn', run: () => m.pasteSpecial('transposed') },
    ],
  };
  const edit: MenuDef = {
    label: 'Edit',
    items: [
      !ro && { label: 'Undo', icon: <Undo2 size={14} />, keys: 'Ctrl+Z', disabled: !m.canUndo, run: m.undo },
      !ro && { label: 'Redo', icon: <Redo2 size={14} />, keys: 'Ctrl+Shift+Z', disabled: !m.canRedo, run: m.redo },
      '-',
      !ro && { label: 'Cut', icon: <Scissors size={14} />, keys: 'Ctrl+X', run: () => m.copy(true) },
      { label: 'Copy', icon: <Copy size={14} />, keys: 'Ctrl+C', run: () => m.copy(false) },
      !ro && { label: 'Paste', icon: <ClipboardPaste size={14} />, keys: 'Ctrl+V', run: m.paste },
      pasteSpecial,
      '-',
      { label: ro ? 'Find' : 'Find and replace', icon: <Search size={14} />, keys: ro ? 'Ctrl+F' : 'Ctrl+H', also: 'search', run: () => m.find(!ro) },
      '-',
      !ro && { label: 'Fill down', keys: 'Ctrl+D', run: () => m.fill(true) },
      !ro && { label: 'Fill right', keys: 'Ctrl+R', run: () => m.fill(false) },
      !ro && { label: 'Clear', icon: <Eraser size={14} />, keys: 'Delete', also: 'delete values', run: () => m.clear() },
      { label: 'Select all', keys: 'Ctrl+A', run: m.selectAll },
    ],
  };
  const view: MenuDef = {
    label: 'View',
    items: [
      {
        label: 'Freeze',
        icon: <Snowflake size={14} />,
        also: 'keep in view',
        items: [
          { label: 'Nothing frozen', checked: !m.freeze?.rows && !m.freeze?.cols, run: () => m.setFreeze(0, 0) },
          { label: 'The first row', checked: m.freeze?.rows === 1 && !m.freeze?.cols, run: () => m.setFreeze(1, 0) },
          { label: 'The first column', checked: !m.freeze?.rows && m.freeze?.cols === 1, run: () => m.setFreeze(0, 1) },
          { label: `Rows up to ${m.r + 1}`, disabled: m.r + 1 > 50, run: () => m.setFreeze(m.r + 1, m.freeze?.cols ?? 0) },
          { label: `Columns up to ${colName(m.c)}`, disabled: m.c + 1 > 20, run: () => m.setFreeze(m.freeze?.rows ?? 0, m.c + 1) },
        ],
      },
      {
        label: 'Zoom',
        icon: <ZoomIn size={14} />,
        items: ZOOMS.map((z) => ({ label: `${z}%`, checked: Math.round(m.zoom * 100) === z, run: () => m.setZoom(z / 100) })),
      },
      { label: 'Show formulas', icon: <Sigma size={14} />, keys: 'Ctrl+`', checked: m.formulas, run: () => m.setFormulas(!m.formulas) },
      { label: 'Comments', icon: <MessagesSquare size={14} />, also: 'discussion threads resolve', run: m.comments },
      { label: 'Kanban board', icon: <SquareKanban size={14} />, also: 'cards lanes group by status', checked: m.board, run: m.toggleBoard },
      m.board && !ro && { label: 'Open the sheet on its board', also: 'kanban view start', checked: !!m.boardOpens, run: m.boardOpen },
      '-',
      m.hiddenRows && { label: 'Show all hidden rows', icon: <Eye size={14} />, run: () => m.showAll('row') },
      m.hiddenCols && { label: 'Show all hidden columns', icon: <Eye size={14} />, run: () => m.showAll('col') },
    ],
  };
  const insert: MenuDef = {
    label: 'Insert',
    items: [
      !ro && { label: m.nRows === 1 ? 'Row above' : `${m.nRows} rows above`, icon: <BetweenHorizontalStart size={14} />, also: 'insert row', run: () => m.insert('row', false) },
      !ro && { label: m.nRows === 1 ? 'Row below' : `${m.nRows} rows below`, icon: <BetweenHorizontalStart size={14} />, also: 'insert row', run: () => m.insert('row', true) },
      !ro && { label: m.nCols === 1 ? 'Column left' : `${m.nCols} columns left`, icon: <BetweenVerticalStart size={14} />, also: 'insert column', run: () => m.insert('col', false) },
      !ro && { label: m.nCols === 1 ? 'Column right' : `${m.nCols} columns right`, icon: <BetweenVerticalStart size={14} />, also: 'insert column', run: () => m.insert('col', true) },
      '-',
      !ro && { label: 'Chart', icon: <ChartColumn size={14} />, also: 'graph plot', run: m.chart },
      !ro && { label: 'Checkbox', icon: <SquareCheck size={14} />, also: 'tick box', run: m.checkbox },
      !ro && { label: 'Dropdown', icon: <SquareChevronDown size={14} />, also: 'list options select chips', run: m.dropdown },
      !ro && { label: 'Rating', icon: <Star size={14} />, also: 'stars', run: m.rating },
      !ro && { label: 'Date', icon: <Calendar size={14} />, also: 'calendar picker', run: m.date },
      !ro && { label: m.note ? 'Edit note' : 'Note', icon: <StickyNote size={14} />, keys: 'Shift+F2', also: 'memo', run: m.noteEdit },
      !ro && { label: 'Comment', icon: <MessageSquarePlus size={14} />, keys: 'Ctrl+Alt+M', also: 'discussion thread reply', run: m.comment },
      !ro && { label: 'Function', icon: <Sigma size={14} />, also: 'formula', items: FUNCS.map((f) => ({ label: f, run: () => m.func(f) })) },
      !ro && m.ai && { label: 'Formula with AI', icon: <Sparkles size={14} />, also: 'write a formula ai assistant describe words', run: m.ai.formula },
      !ro && m.ai && { label: 'Table made with AI', icon: <WandSparkles size={14} />, also: 'generate table ai list template', run: m.ai.table },
      !ro && { label: 'Special character', icon: <Omega size={14} />, also: 'emoji symbol', run: m.chars },
      !ro && { label: 'Sheet', also: 'add a sheet tab', run: m.addSheet },
    ],
  };
  const fmtItems: MenuEntry[] = FORMATS.flatMap((f): MenuEntry[] => {
    if (f.fmt === 'date')
      return [
        {
          label: 'Date',
          also: 'day month year',
          items: DATE_CODES.map((d) => ({ label: d.label, keys: undefined, also: d.hint, checked: s?.fmt === 'date' && (s.code ?? undefined) === d.code, run: () => (d.code ? m.setCode(d.code) : m.setFormat('date')) })),
        },
      ];
    if (f.fmt === 'currency' && f.cur !== '$') return [];
    if (f.fmt === 'currency')
      return [{ label: 'Currency', items: FORMATS.filter((x) => x.fmt === 'currency').map((x) => ({ label: x.label, also: x.hint, checked: s?.fmt === 'currency' && (s.cur ?? '$') === x.cur && !s.code, run: () => m.setFormat('currency', x.cur) })) }];
    return [{ label: f.label, also: f.hint, checked: f.fmt === 'custom' ? !!s?.code : (s?.fmt ?? 'general') === f.fmt && !s?.code, run: () => m.setFormat(f.fmt, f.cur) }];
  });
  const format: MenuDef = {
    label: 'Format',
    items: ro
      ? []
      : [
          { label: 'Number', also: 'number format currency percent date', items: fmtItems },
          {
            label: 'Text',
            also: 'bold italic underline strikethrough',
            items: [
              { label: 'Bold', keys: 'Ctrl+B', checked: !!s?.b, run: () => m.setStyle({ b: !s?.b || undefined }) },
              { label: 'Italic', keys: 'Ctrl+I', checked: !!s?.i, run: () => m.setStyle({ i: !s?.i || undefined }) },
              { label: 'Underline', keys: 'Ctrl+U', checked: !!s?.u, run: () => m.setStyle({ u: !s?.u || undefined }) },
              { label: 'Strikethrough', keys: 'Alt+Shift+5', checked: !!s?.s, run: () => m.setStyle({ s: !s?.s || undefined }) },
            ],
          },
          {
            label: 'Font',
            also: 'typeface',
            items: [{ label: 'Default font', checked: !s?.font, run: () => m.setStyle({ font: undefined }) }, ...Object.keys(CELL_FONTS).map((f) => ({ label: f, checked: s?.font === f, run: () => m.setStyle({ font: f }) }))],
          },
          { label: 'Type size', also: 'font size', items: SIZES.map((n) => ({ label: `${n}`, checked: (s?.size ?? 10) === n, run: () => m.setStyle({ size: n === 10 ? undefined : n }) })) },
          {
            label: 'Alignment',
            also: 'align left centre right top middle bottom vertical',
            items: [
              { label: 'Align left', checked: s?.align === 'left', run: () => m.setStyle({ align: 'left' }) },
              { label: 'Align centre', checked: s?.align === 'center', run: () => m.setStyle({ align: 'center' }) },
              { label: 'Align right', checked: s?.align === 'right', run: () => m.setStyle({ align: 'right' }) },
              '-',
              { label: 'Align to the top', checked: s?.valign === 'top', run: () => m.setStyle({ valign: 'top' }) },
              { label: 'Align to the middle', checked: !s?.valign || s.valign === 'middle', run: () => m.setStyle({ valign: undefined }) },
              { label: 'Align to the bottom', checked: s?.valign === 'bottom', run: () => m.setStyle({ valign: 'bottom' }) },
            ],
          },
          { label: 'Wrap words in the cell', also: 'wrapping', checked: !!s?.wrap, run: () => m.setStyle({ wrap: !s?.wrap || undefined }) },
          {
            label: 'Rotation',
            also: 'turn tilt text angle',
            items: [
              { label: 'No rotation', checked: !s?.rot, run: () => m.setStyle({ rot: undefined }) },
              { label: 'Tilt up', checked: s?.rot === 45, run: () => m.setStyle({ rot: 45 }) },
              { label: 'Tilt down', checked: s?.rot === -45, run: () => m.setStyle({ rot: -45 }) },
              { label: 'Rotate up', checked: s?.rot === 90, run: () => m.setStyle({ rot: 90 }) },
              { label: 'Rotate down', checked: s?.rot === -90, run: () => m.setStyle({ rot: -90 }) },
            ],
          },
          {
            label: 'Borders',
            also: 'lines',
            items: [
              ...BORDER_WHERE.map((b) => ({ label: b.label, icon: <BorderIcon where={b.where} />, run: () => m.borders(b.where) })),
              '-' as const,
              { label: 'Border line', items: BORDER_KINDS_SHOWN.map((k) => ({ label: k.label, checked: m.line.kind === k.kind, run: () => m.setLine({ ...m.line, kind: k.kind }) })) },
            ],
          },
          {
            label: 'Merge cells',
            icon: <TableCellsMerge size={14} />,
            items: [
              { label: 'Merge all', run: () => m.merge('all') },
              { label: 'Merge horizontally', run: () => m.merge('across') },
              { label: 'Merge vertically', run: () => m.merge('down') },
              { label: 'Unmerge', disabled: !m.merged, run: () => m.merge('none') },
            ],
          },
          {
            label: 'Rows and columns',
            also: 'hide show',
            items: [
              { label: m.nRows === 1 ? 'Hide row' : `Hide ${m.nRows} rows`, run: () => m.hide('row') },
              { label: m.nCols === 1 ? 'Hide column' : `Hide ${m.nCols} columns`, run: () => m.hide('col') },
              { label: 'Show all hidden rows', disabled: !m.hiddenRows, run: () => m.showAll('row') },
              { label: 'Show all hidden columns', disabled: !m.hiddenCols, run: () => m.showAll('col') },
              '-',
              { label: m.nRows === 1 ? 'Delete row' : `Delete ${m.nRows} rows`, icon: <Trash2 size={14} />, run: () => m.remove('row') },
              { label: m.nCols === 1 ? 'Delete column' : `Delete ${m.nCols} columns`, icon: <Trash2 size={14} />, run: () => m.remove('col') },
            ],
          },
          { label: 'Conditional formatting', icon: <Paintbrush size={14} />, also: 'colour scale data bars highlight rules', run: m.conditional },
          { label: 'Clear formatting', icon: <RemoveFormatting size={14} />, keys: 'Ctrl+\\', run: () => m.clear(true) },
        ],
  };
  const data: MenuDef = {
    label: 'Data',
    items: ro
      ? []
      : [
          { label: 'Sort range', icon: <ArrowDownAZ size={14} />, also: 'order several columns', run: m.sortRange },
          { label: `Sort sheet by column ${m.col}, A to Z`, icon: <ArrowDownAZ size={14} />, run: () => m.sortSheet(true) },
          { label: `Sort sheet by column ${m.col}, Z to A`, icon: <ArrowDownZA size={14} />, run: () => m.sortSheet(false) },
          '-',
          { label: m.filtered ? 'Remove the filter' : 'Create a filter', icon: <ListFilter size={14} />, keys: 'Ctrl+Shift+L', run: m.toggleFilter },
          { label: 'Data validation', icon: <SquareCheck size={14} />, also: 'rules dropdown list checkbox allowed values', run: m.validation },
          '-',
          { label: 'Remove duplicates', also: 'unique', run: m.dups },
          { label: 'Split text to columns', icon: <Split size={14} />, also: 'separate comma', run: m.split },
          { label: 'Trim spaces', also: 'whitespace', run: m.trim },
          { label: 'Summarize by', icon: <Sigma size={14} />, also: 'pivot table group totals', run: m.summary },
          m.ai && '-',
          m.ai && { label: 'Fill with AI', icon: <Sparkles size={14} />, keys: 'Ctrl+E', also: 'flash fill pattern examples autofill', run: m.ai.fill },
          m.ai && { label: 'Clean up the data', icon: <Broom size={14} />, also: 'tidy spaces duplicates spellings dates numbers as text', run: m.ai.clean },
          m.ai && { label: 'Analyze the data', icon: <ChartNoAxesCombined size={14} />, also: 'explore insights questions ai charts pivot suggestions', run: m.ai.analyze },
          m.ai?.cells && { label: 'Refresh AI cells', icon: <RefreshCw size={14} />, also: 'ai function ask again answers', run: m.ai.refresh },
          !!m.ai?.waiting && { label: `Ask the ${m.ai.waiting === 1 ? 'AI cell that waits' : `${m.ai.waiting} AI cells that wait`}`, icon: <Sparkles size={14} />, run: m.ai.askWaiting },
        ],
  };
  const tools: MenuDef = {
    label: 'Tools',
    items: [
      { label: 'Expand row', also: 'record card form', keys: 'Space', run: m.expand },
      !ro && m.ai && { label: 'Analyze the data', icon: <ChartNoAxesCombined size={14} />, also: 'explore insights questions ai', run: m.ai.analyze },
      m.ai?.explain && { label: 'Explain this formula', icon: <MessageCircleQuestionMark size={14} />, also: 'what does it do ai', run: m.ai.explain },
      { label: 'Keyboard shortcuts', icon: <Keyboard size={14} />, keys: 'Ctrl+/', run: m.shortcuts },
      m.onAsk && '-',
      m.onAsk && { label: 'Ask the agent about it', icon: <Sparkles size={14} />, run: m.onAsk },
    ],
  };
  return ro ? [edit, view, tools] : [edit, view, insert, format, data, tools];
}

// The documents editor's menus, in the shared menu bar: Edit, View, Insert, Format and Tools hold everything the
// editor does, each with its keys, and Search the menus finds any of them by its words. Lists inside a menu (a
// picture, a table's size, zoom, line spacing, a table's cells…) open in the menu's place. What a menu does is the
// engine's, or the editor's (a dialog, a panel): this file only says what is where.
import {
  ChartScatter,
  CheckCheck,
  GitCompareArrows,
  FilePenLine,
  ListX,
  PencilLine,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BookOpenText,
  CalendarDays,
  ClipboardPaste,
  Copy,
  Eraser,
  FileCog,
  Hash,
  Heading,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Keyboard,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Lightbulb,
  MessageSquarePlus,
  Minus,
  Omega,
  PaintRoller,
  PanelTop,
  PenTool,
  Pilcrow,
  Printer,
  Redo2,
  Scissors,
  Search,
  SeparatorHorizontal,
  Sigma,
  Signature,
  Sparkles,
  SpellCheck,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  TableOfContents,
  Trash2,
  Type,
  Undo2,
  WandSparkles,
  WholeWord,
  ZoomIn,
} from 'lucide-react';
import { CALLOUT_TINTS, LINE_SPACINGS, PARA_STYLES, STYLES, type Doc } from '@shared/docs';
import type { MenuDef, MenuEntry } from '../common/menus';
import type { DocEngine, SelState } from './engine';

/** How large the page shows: a share of its size, or as wide as there is room. */
export type Zoom = number | 'fit';
export const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2];

/** Page numbers as the Insert menu offers them: where they go and what they say. */
export const PAGE_NUMBERS: { label: string; where: 'header' | 'footer'; text: string; align?: 'center' | 'right' }[] = [
  { label: 'At the bottom, in the middle', where: 'footer', text: '{page}', align: 'center' },
  { label: 'At the bottom, on the right', where: 'footer', text: '{page}', align: 'right' },
  { label: 'At the top, on the right', where: 'header', text: '{page}', align: 'right' },
  { label: '“Page 1 of 9” at the bottom', where: 'footer', text: 'Page {page} of {pages}', align: 'center' },
];

/** Cell fills the Table menu offers. */
const FILLS: [string, string][] = [
  ['#f1f3f4', 'Grey'],
  ['#e8f0fe', 'Blue'],
  ['#e6f4ea', 'Green'],
  ['#fef7e0', 'Yellow'],
  ['#fce8e6', 'Red'],
  ['#f3e8fd', 'Purple'],
];
const TINTS: Record<string, string> = { '#fef7e0': 'Yellow', '#e8f0fe': 'Blue', '#e6f4ea': 'Green', '#fce8e6': 'Red', '#f3e8fd': 'Purple', '#f1f3f4': 'Grey' };

export interface DocMenuCtx {
  engine: DocEngine;
  st: SelState;
  doc: Doc;
  outline: boolean;
  toggleOutline: () => void;
  zoom: Zoom;
  setZoom: (z: Zoom) => void;
  spell: boolean;
  setSpell: (on: boolean) => void;
  showCount: boolean;
  setShowCount: (on: boolean) => void;
  comments: boolean;
  toggleComments: () => void;
  resolved: boolean;
  toggleResolved: () => void;
  find: (replace: boolean) => void;
  comment: () => void;
  picture: () => void;
  pictureUrl: () => void;
  /** Insert → Picture → A picture made with AI, and A drawing (SVG). */
  aiPicture: () => void;
  drawing: () => void;
  /** Insert → Plot: from the table the caret is in, if it is in one. */
  plot: () => void;
  /** Insert → Section made with AI: the gallery of kinds (a summary, a risks table…), where the editor can ask an agent. */
  aiSection?: () => void;
  /** Insert → Signature: a saved one, or one drawn there. */
  signature: () => void;
  link: () => void;
  equation: (inline: boolean) => void;
  chars: () => void;
  calloutIcon: () => void;
  bands: () => void;
  pageNumbers: (k: number | null) => void;
  pageSetup: () => void;
  spacing: () => void;
  wordCount: () => void;
  shortcuts: () => void;
  print: () => void;
  paste: (plain: boolean) => void;
  copy: (cut: boolean) => void;
  painter: () => void;
  today: () => void;
  /** Editing, or Suggesting (changes suggested). */
  mode: 'edit' | 'suggest';
  setMode: (m: 'edit' | 'suggest') => void;
  /** How many suggested changes there are. */
  suggestions: number;
  resolveAll: (accept: boolean) => void;
  /** Compare with a version: the list of versions to pick one from. */
  compare: () => void;
  /** An older version on view: nothing changes it. */
  readOnly?: boolean;
}

/** The editor's menus, for what is where the caret is now. */
export function docMenus(c: DocMenuCtx): MenuDef[] {
  const { engine: e, st } = c;
  const t = st.block?.type === 'table' ? st.block : null;
  const inCallout = st.block?.type === 'p' && st.block.style === 'callout' ? st.block : null;
  const sp = st.block && (st.block.type === 'p' || st.block.type === 'li') ? st.block : null;
  const lh = sp?.lh;
  const cellOf = t && st.cell ? t.rows[st.cell[0]]?.[st.cell[1]] : null;
  const merged = !!cellOf && !!(cellOf.rs || cellOf.cs);
  const many = !!st.cells && (st.cells.a[0] !== st.cells.f[0] || st.cells.a[1] !== st.cells.f[1]);

  const edit: MenuEntry[] = [
    { label: 'Undo', icon: <Undo2 size={15} />, keys: 'Ctrl+Z', disabled: !st.canUndo, run: () => e.undo() },
    { label: 'Redo', icon: <Redo2 size={15} />, keys: 'Ctrl+Shift+Z', disabled: !st.canRedo, run: () => e.redo() },
    '-',
    { label: 'Cut', icon: <Scissors size={15} />, keys: 'Ctrl+X', disabled: st.collapsed && !st.picked, run: () => c.copy(true) },
    { label: 'Copy', icon: <Copy size={15} />, keys: 'Ctrl+C', disabled: st.collapsed && !st.picked, run: () => c.copy(false) },
    { label: 'Paste', icon: <ClipboardPaste size={15} />, keys: 'Ctrl+V', run: () => c.paste(false) },
    { label: 'Paste without formatting', icon: <ClipboardPaste size={15} />, keys: 'Ctrl+Shift+V', also: 'plain text', run: () => c.paste(true) },
    '-',
    { label: 'Select all', keys: 'Ctrl+A', run: () => document.execCommand('selectAll') },
    { label: 'Find', icon: <Search size={15} />, keys: 'Ctrl+F', also: 'search', run: () => c.find(false) },
    { label: 'Find and replace', icon: <Search size={15} />, keys: 'Ctrl+H', also: 'search replace', run: () => c.find(true) },
  ];

  const view: MenuEntry[] = [
    { label: 'Outline', icon: <ListTree size={15} />, checked: c.outline, also: 'headings navigation', run: c.toggleOutline },
    { label: 'Comments', icon: <MessageSquarePlus size={15} />, checked: c.comments, run: c.toggleComments },
    { label: 'Show resolved comments', checked: c.resolved, run: c.toggleResolved },
    {
      label: 'Editing or suggesting',
      icon: <FilePenLine size={15} />,
      also: 'mode track changes review',
      items: [
        { label: 'Edit directly', icon: <PencilLine size={15} />, checked: c.mode === 'edit', disabled: c.readOnly, also: 'editing mode', run: () => c.setMode('edit') },
        { label: 'Suggest changes', icon: <FilePenLine size={15} />, keys: 'Ctrl+Alt+Shift+X', checked: c.mode === 'suggest', disabled: c.readOnly, also: 'suggesting mode track changes', run: () => c.setMode('suggest') },
      ],
    },
    '-',
    {
      label: 'Zoom',
      icon: <ZoomIn size={15} />,
      items: [...ZOOMS.map((z) => ({ label: `${Math.round(z * 100)}%`, checked: c.zoom === z, run: () => c.setZoom(z) })), '-' as const, { label: 'Fit the width', checked: c.zoom === 'fit', run: () => c.setZoom('fit') }],
    },
    '-',
    { label: 'Check spelling', icon: <SpellCheck size={15} />, checked: c.spell, also: 'spellcheck', run: () => c.setSpell(!c.spell) },
    { label: 'Show the word count while typing', icon: <WholeWord size={15} />, checked: c.showCount, run: () => c.setShowCount(!c.showCount) },
  ];

  const tableSizes: MenuEntry[] = [
    [1, 2],
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 4],
    [8, 4],
  ].map(([r, k]) => ({ label: `${k} × ${r}`, also: 'table grid', run: () => e.insertTable(r, k) }));

  const insert: MenuEntry[] = [
    !!c.aiSection && { label: 'Section made with AI', icon: <Sparkles size={15} />, also: 'ai agent write generate section summary introduction conclusion faq glossary references table', disabled: c.readOnly, run: c.aiSection },
    {
      label: 'Picture',
      icon: <ImageIcon size={15} />,
      items: [
        { label: 'A picture from this device', icon: <ImageIcon size={15} />, run: c.picture },
        { label: 'A picture from the web', icon: <Link2 size={15} />, run: c.pictureUrl },
        { label: 'A picture made with AI', icon: <WandSparkles size={15} />, also: 'generate ai image illustration icon background photo', disabled: c.readOnly, run: c.aiPicture },
        { label: 'A drawing (SVG)', icon: <PenTool size={15} />, also: 'svg vector icon logo diagram', disabled: c.readOnly, run: c.drawing },
      ],
    },
    { label: 'Signature', icon: <Signature size={15} />, also: 'sign signing initials autograph handwriting', disabled: c.readOnly, run: c.signature },
    { label: 'Table', icon: <Table2 size={15} />, also: 'grid', items: tableSizes },
    { label: 'Plot', icon: <ChartScatter size={15} />, also: 'chart graph data matplotlib histogram scatter', disabled: c.readOnly, run: c.plot },
    { label: 'Link', icon: <Link2 size={15} />, keys: 'Ctrl+K', run: c.link },
    { label: 'Comment', icon: <MessageSquarePlus size={15} />, keys: 'Ctrl+Alt+M', disabled: !st.text.trim(), run: c.comment },
    '-',
    {
      label: 'Equation',
      icon: <Sigma size={15} />,
      also: 'maths math formula latex',
      items: [
        { label: 'An equation on its own line', icon: <Sigma size={15} />, run: () => c.equation(false) },
        { label: 'Maths among the words', icon: <Sigma size={15} />, run: () => c.equation(true) },
      ],
    },
    { label: 'Special characters', icon: <Omega size={15} />, also: 'emoji symbols', run: c.chars },
    { label: 'Callout', icon: <Lightbulb size={15} />, also: 'note box', run: () => e.style('callout') },
    { label: 'Table of contents', icon: <TableOfContents size={15} />, also: 'toc headings', run: () => e.insertToc() },
    '-',
    { label: 'A line across', icon: <Minus size={15} />, also: 'horizontal rule divider', run: () => e.insertAtom('hr') },
    { label: 'A page break', icon: <SeparatorHorizontal size={15} />, keys: 'Ctrl+Enter', run: () => e.insertAtom('pagebreak') },
    { label: "Today's date", icon: <CalendarDays size={15} />, run: c.today },
    '-',
    { label: 'Header and footer', icon: <PanelTop size={15} />, also: 'header footer', run: c.bands },
    {
      label: 'Page numbers',
      icon: <Hash size={15} />,
      items: [...PAGE_NUMBERS.map((p, k) => ({ label: p.label, run: () => c.pageNumbers(k) })), '-' as const, { label: 'No page numbers', run: () => c.pageNumbers(null) }],
    },
  ];

  const text: MenuEntry[] = [
    { label: 'Bold', keys: 'Ctrl+B', checked: st.on.b, run: () => e.toggle('b') },
    { label: 'Italic', keys: 'Ctrl+I', checked: st.on.i, run: () => e.toggle('i') },
    { label: 'Underline', keys: 'Ctrl+U', checked: st.on.u, run: () => e.toggle('u') },
    { label: 'Strikethrough', icon: <Strikethrough size={15} />, keys: 'Ctrl+Shift+X', checked: st.on.s, run: () => e.toggle('s') },
    { label: 'Superscript', icon: <Superscript size={15} />, keys: 'Ctrl+.', checked: st.on.sup, run: () => e.toggle('sup') },
    { label: 'Subscript', icon: <Subscript size={15} />, keys: 'Ctrl+,', checked: st.on.sub, run: () => e.toggle('sub') },
    { label: 'Code', checked: st.on.code, also: 'monospace', run: () => e.toggle('code') },
    '-',
    { label: 'UPPERCASE', also: 'capital letters case', run: () => e.setCase('upper') },
    { label: 'lowercase', also: 'small letters case', run: () => e.setCase('lower') },
    { label: 'Title Case', also: 'capitalise case', run: () => e.setCase('title') },
    { label: 'Sentence case', also: 'case', run: () => e.setCase('sentence') },
  ];

  const spacing: MenuEntry[] = [
    ...LINE_SPACINGS.map((v) => ({ label: v === 1 ? 'Single' : v === 2 ? 'Double' : String(v), checked: lh === v, also: 'line spacing', run: () => e.spacing({ lh: v }) })),
    '-',
    sp?.sb ? { label: 'Remove space before paragraph', run: () => e.spacing({ sb: 0 }) } : { label: 'Add space before paragraph', run: () => e.spacing({ sb: 12 }) },
    sp?.sa === 0 ? { label: 'Add space after paragraph', run: () => e.spacing({ sa: 12 }) } : { label: 'Remove space after paragraph', run: () => e.spacing({ sa: 0 }) },
    '-',
    { label: 'Custom spacing', run: c.spacing },
    { label: 'As the style has it', disabled: lh === undefined && sp?.sb === undefined && sp?.sa === undefined, also: 'reset spacing', run: () => e.spacing({ lh: undefined, sb: undefined, sa: undefined }) },
  ];

  const table: MenuEntry[] = t
    ? [
        { label: 'Insert a row above', run: () => e.table('rowAbove') },
        { label: 'Insert a row below', run: () => e.table('rowBelow') },
        { label: 'Insert a column on the left', run: () => e.table('colLeft') },
        { label: 'Insert a column on the right', run: () => e.table('colRight') },
        '-',
        { label: 'Merge cells', disabled: !many, run: () => e.mergeCells() },
        { label: 'Unmerge cells', disabled: !merged, run: () => e.unmergeCell() },
        {
          label: 'Cell colour',
          items: [{ label: 'No colour', checked: !cellOf?.fill, run: () => e.cells({ fill: undefined }) }, ...FILLS.map(([v, l]) => ({ label: l, checked: cellOf?.fill === v, also: 'fill shading', run: () => e.cells({ fill: v }) }))],
        },
        {
          label: 'Vertical alignment',
          items: [
            { label: 'At the top of the cell', checked: !cellOf?.va, run: () => e.cells({ va: undefined }) },
            { label: 'In the middle of the cell', checked: cellOf?.va === 'middle', run: () => e.cells({ va: 'middle' }) },
            { label: 'At the bottom of the cell', checked: cellOf?.va === 'bottom', run: () => e.cells({ va: 'bottom' }) },
          ],
        },
        { label: 'Header row', checked: !!t.head, run: () => e.table('head') },
        { label: 'Make a plot of this table', icon: <ChartScatter size={15} />, also: 'chart graph', disabled: c.readOnly, run: c.plot },
        '-',
        { label: 'Delete the row', run: () => e.table('delRow') },
        { label: 'Delete the column', run: () => e.table('delCol') },
        { label: 'Delete the table', icon: <Trash2 size={15} />, danger: true, run: () => e.table('delTable') },
      ]
    : [];

  const format: MenuEntry[] = [
    { label: 'Text', icon: <Type size={15} />, items: text },
    { label: 'Paragraph styles', icon: <Heading size={15} />, items: PARA_STYLES.map((k) => ({ label: STYLES[k].label, checked: st.style === k && !st.list, run: () => e.style(k) })) },
    {
      label: 'Align and indent',
      icon: <AlignLeft size={15} />,
      items: [
        { label: 'Align left', icon: <AlignLeft size={15} />, keys: 'Ctrl+Shift+L', checked: st.align === 'left', run: () => e.align('left') },
        { label: 'Centre', icon: <AlignCenter size={15} />, keys: 'Ctrl+Shift+E', checked: st.align === 'center', run: () => e.align('center') },
        { label: 'Align right', icon: <AlignRight size={15} />, keys: 'Ctrl+Shift+R', checked: st.align === 'right', run: () => e.align('right') },
        { label: 'Justify', icon: <AlignJustify size={15} />, keys: 'Ctrl+Shift+J', checked: st.align === 'justify', run: () => e.align('justify') },
        '-',
        { label: 'Less indent', icon: <IndentDecrease size={15} />, keys: 'Shift+Tab', run: () => e.indent(-1) },
        { label: 'More indent', icon: <IndentIncrease size={15} />, keys: 'Tab', run: () => e.indent(1) },
      ],
    },
    { label: 'Line and paragraph spacing', icon: <Pilcrow size={15} />, also: 'line height', items: spacing },
    {
      label: 'Bullets and numbering',
      icon: <List size={15} />,
      items: [
        { label: 'Bulleted list', icon: <List size={15} />, keys: 'Ctrl+Shift+8', checked: st.list === 'bullet', run: () => e.list('bullet') },
        { label: 'Numbered list', icon: <ListOrdered size={15} />, keys: 'Ctrl+Shift+7', checked: st.list === 'number', run: () => e.list('number') },
        { label: 'Checklist', icon: <ListChecks size={15} />, keys: 'Ctrl+Shift+9', checked: st.list === 'check', run: () => e.list('check') },
      ],
    },
    t && { label: 'Table', icon: <Table2 size={15} />, items: table },
    inCallout && {
      label: 'Callout',
      icon: <Lightbulb size={15} />,
      items: [
        { label: 'Another emoji', run: c.calloutIcon },
        '-' as const,
        ...CALLOUT_TINTS.map((v) => ({ label: TINTS[v] ?? v, checked: (inCallout.tint ?? CALLOUT_TINTS[0]) === v, also: 'callout colour tint', run: () => e.callout(inCallout.id, { tint: v }) })),
      ],
    },
    '-',
    { label: 'Format painter', icon: <PaintRoller size={15} />, checked: !!e.paint, also: 'copy formatting', run: c.painter },
    { label: 'Clear the formatting', icon: <Eraser size={15} />, keys: 'Ctrl+\\', run: () => e.clear() },
    '-',
    { label: 'Page setup', icon: <FileCog size={15} />, also: 'paper margins font size', run: c.pageSetup },
  ];

  const tools: MenuEntry[] = [
    { label: 'Word count', icon: <BookOpenText size={15} />, keys: 'Ctrl+Shift+C', also: 'characters pages reading time', run: c.wordCount },
    { label: 'Keyboard shortcuts', icon: <Keyboard size={15} />, keys: 'Ctrl+/', run: c.shortcuts },
    '-',
    { label: 'Accept all suggestions', icon: <CheckCheck size={15} />, disabled: !c.suggestions || c.readOnly, also: 'track changes review', run: () => c.resolveAll(true) },
    { label: 'Reject all suggestions', icon: <ListX size={15} />, disabled: !c.suggestions || c.readOnly, also: 'track changes review', run: () => c.resolveAll(false) },
    { label: 'Compare with a version', icon: <GitCompareArrows size={15} />, also: 'versions history diff changes since restore', run: c.compare },
    '-',
    { label: 'Format painter', icon: <PaintRoller size={15} />, checked: !!e.paint, run: c.painter },
    { label: 'Print', icon: <Printer size={15} />, keys: 'Ctrl+P', run: c.print },
  ];

  return [
    { label: 'Edit', items: edit },
    { label: 'View', items: view },
    { label: 'Insert', items: insert },
    { label: 'Format', items: format },
    { label: 'Tools', items: tools },
  ];
}

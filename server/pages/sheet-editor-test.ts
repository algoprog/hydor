// Script tests for the spreadsheet editor's model and files: number formats (accounting, scientific, times, Excel's
// own codes and their colours), borders, fonts and turned words, notes, merged cells, hidden rows and columns, a
// filter, conditional formatting, rules for what cells take (lists, checkboxes, ratings, numbers), charts; how they
// are checked when they come in, how they follow rows and columns put in or taken out, what they make of the cells
// (sheet-rules.ts), the workbook's own page, and Excel files written and read back with all of them. Then through
// the routes: save_sheet with them, get_page, and the export. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/sheet-editor-test.ts
//   DATA_DIR=/tmp/hydor-test-sheet-editor node dist/dev/sheet-editor-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps, RunCtx } from '../features/types.ts';
import { accountingParts, adjustForDelete, adjustForInsert, bookOutline, bookText, chartBox, cleanBorder, codeColor, computeBook, formatValue, inputText, normalizeBook, parseInput, renameSheet, sheetSizes, type Workbook } from '../../shared/sheets.ts';
import { allowed, CondFormats, filterHidden, hiddenRows, listOptions, Merges, Rules } from '../../shared/sheet-rules.ts';
import { chartData, chartProblem, chartSvg } from '../../shared/sheet-chart.ts';
import { bookForAgent, bookPage, csvOfBook, importBook, xlsxOfBook } from './sheets.ts';
import { delimitedFile } from './filemodel.ts';
import { Zip } from '../documents/zip.ts';
import { zipParts } from './ooxml.ts';
import { pages } from './index.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};

const bookOutlineOf = (b: Workbook) => bookOutline(b, computeBook(b));

// ---- number formats ------------------------------------------------------------------------------------------
{
  ok(formatValue(1234.5, { fmt: 'accounting' }) === '$ 1,234.50' && formatValue(-12, { fmt: 'accounting' }) === '$ (12.00)' && formatValue(0, { fmt: 'accounting' }) === '$ -', 'Accounting: the sign apart, negatives in brackets, zero a dash');
  ok(accountingParts(5, { fmt: 'accounting', cur: '€' })[0] === '€', 'and its sign is the currency’s');
  ok(formatValue(12345.678, { fmt: 'scientific' }) === '1.23E+04' && formatValue(12345.678, { fmt: 'scientific', dp: 0 }) === '1E+04', 'Scientific, with its decimals');
  ok(formatValue(0.6042, { fmt: 'time' }) === '14:30:03' && formatValue(46000.5, { fmt: 'datetime' }) === '2025-12-09 12:00:00' && formatValue(1.104166, { fmt: 'duration' }) === '26:30:00', 'Time, Date and time, Duration');
  ok(parseInput('26:30', 'duration').v === 26.5 / 24, 'a duration typed past a day is hours');
  ok(inputText({ v: 26.5 / 24, s: { fmt: 'duration' } }) === '26:30:00', 'and it is typed again as it shows');
  const n = normalizeBook({ sheets: [{ name: 'F', cells: { A1: { v: 46000, s: { fmt: 'dd/mm/yyyy' } }, A2: { v: -5, s: { code: '#,##0.00;[Red]-#,##0.00' } }, A3: { v: 3, s: { fmt: '#,##0.00' } }, A4: { v: 0.5, s: { code: '0.0%' } } } }] }).sheets[0]
    .cells;
  ok(n.A1.s?.fmt === 'date' && n.A1.s.code === 'dd/mm/yyyy' && formatValue(46000, n.A1.s) === '09/12/2025', 'a date code is kept and shows the date its way');
  ok(n.A2.s?.code && formatValue(-5, n.A2.s) === '-5.00' && codeColor(-5, n.A2.s.code) === '#ff0000' && codeColor(5, n.A2.s.code) === undefined, 'a code with [Red] for negatives is kept, and colours them');
  ok(n.A3.s?.fmt === 'number' && !n.A3.s.code, 'a code a plain format shows the same way is not kept');
  ok(n.A4.s?.fmt === 'percent' && n.A4.s.dp === 1 && !n.A4.s.code, '0.0% is a percent with one decimal');
}

// ---- styles: borders, fonts, turned words ---------------------------------------------------------------------
{
  ok(cleanBorder('thick red') === 'thick #ff0000' && cleanBorder('thin') === 'thin' && cleanBorder('none') === undefined && cleanBorder('#123456') === 'thin #123456', 'borders are a kind and a colour');
  const b = normalizeBook({
    sheets: [
      {
        name: 'S',
        cells: { A1: { v: 'x', s: { border: 'thin', font: 'georgia', rot: 45 } }, B2: { v: 1, s: { bb: 'double #0000ff', font: 'Comic Sans' } } },
        styles: { 'C3:D4': { outline: 'medium' } },
      },
    ],
  }).sheets[0];
  const a1 = b.cells.A1.s!;
  ok(a1.bt === 'thin' && a1.br === 'thin' && a1.bb === 'thin' && a1.bl === 'thin' && a1.font === 'Georgia' && a1.rot === 45, 'border sets all four sides; fonts by name in any case; words turned');
  ok(b.cells.B2.s?.bb === 'double #0000ff' && !b.cells.B2.s.font, 'a font not on the list is not kept');
  ok(b.cells.C3.s?.bt === 'medium' && b.cells.C3.s.bl === 'medium' && !b.cells.C3.s.br && b.cells.D4.s?.bb === 'medium' && b.cells.D4.s.br === 'medium', 'an outline goes round a range’s edge only');
}

// ---- the sheet's other parts, as they come in ----------------------------------------------------------------
const rows = [
  ['Task', 'Owner', 'Hours', 'Status', 'Done', 'Stars'],
  ['Plan', 'Ann', 4, 'Open', false, 3],
  ['Build', 'Bo', 12, 'Doing', false, 4],
  ['Test', 'Ann', 6, 'Done', true, 5],
  ['Ship', 'Cy', 2, 'Done', true, 2],
  ['Total', '', '=SUM(C2:C5)', '', '', ''],
];
const raw = {
  sheets: [
    {
      name: 'Work',
      rows,
      header: true,
      merges: ['A7:C7', 'A7:B7', 'D1'],
      hidden: { rows: [9], cols: ['H'] },
      notes: { B3: 'Bo is away in May', Z9: 'Far off' },
      filter: { range: 'A1:F5', cols: { D: { hide: ['Done'] }, Z: { hide: ['x'] } } },
      conditional: [
        { range: 'C2:C5', when: { op: '>', value: 5 }, style: { fill: '#fce8e6', b: true } },
        { range: 'C2:C5', scale: ['#ffffff', '#ff0000'] },
        { range: 'F2:F5', bar: '#638ec6' },
        { range: 'A2:A5', when: { op: 'formula', a: '=$C2>10' }, style: { color: '#0000ff' } },
        { range: 'B2:B5', when: { op: 'dup' }, style: { i: true } },
        { range: 'Q1', when: { op: 'gt' }, style: { b: true } },
      ],
      validation: [
        { range: 'D2:D20', list: ['Open', { v: 'Doing', color: '#fff2cc' }, { v: 'Done', color: 'green' }, 'open'] },
        { range: 'E2:E20', checkbox: true },
        { range: 'F2:F20', rating: 5 },
        { range: 'C2:C20', type: 'number', when: { op: 'between', a: 0, b: 100 }, reject: true },
        { range: 'G2:G20', source: 'Lists!A1:A3' },
        { range: 'H2', type: 'length' },
      ],
      charts: [
        { kind: 'column', range: 'A1:C5', title: 'Hours', at: 'H2' },
        { kind: 'nonsense', range: 'A1:A3' },
        { kind: 'pie', range: 'nope' },
      ],
    },
    { name: 'Lists', rows: [['Red'], ['Green'], ['Red'], ['Blue']] },
  ],
};
const book = normalizeBook(raw);
const sh = book.sheets[0];
{
  ok(JSON.stringify(sh.merges) === '["A7:C7"]', 'merges: two cells or more, none over another');
  ok(sh.rows?.[8]?.hidden && sh.cols?.[7]?.hidden, 'hidden rows and columns, as an agent names them');
  ok(sh.cells.B3.note === 'Bo is away in May' && sh.cells.Z9?.note === 'Far off' && sh.cells.B3.v === 'Bo', 'notes on cells, even empty ones');
  ok(sh.filter?.range === 'A1:F5' && sh.filter.cols?.D?.hide?.[0] === 'Done' && !sh.filter.cols?.Z, 'a filter keeps its columns within its range');
  ok(
    sh.conditional?.length === 5 && sh.conditional[0].when?.op === 'gt' && sh.conditional[0].when.a === '5' && sh.conditional[1].scale?.max.color === '#ff0000',
    'conditional formatting: conditions by their signs, scales, bars; one that says nothing goes',
  );
  ok(sh.validation?.length === 5 && sh.validation[0].options?.length === 3 && sh.validation[0].options[2].color === '#008000', 'a list’s options once each, with colours');
  ok(sh.validation?.[3].reject === true && sh.validation[3].when?.op === 'between' && sh.validation[4].source === 'Lists!A1:A3', 'numbers between, rejecting; a list from a range');
  ok(sh.charts?.length === 3 && sh.charts[0].from.cell === 'H2' && sh.charts[1].kind === 'column' && sh.charts[2].range === 'nope', 'charts: placed at a cell; an unknown kind is a column chart; one of words that are no range stays, to say why');
  const again = normalizeBook(JSON.parse(bookText(book)));
  ok(bookText(again) === bookText(book), 'kept and read back, the workbook is the same');
  ok(normalizeBook({ sheets: [{ name: 'Old', cells: { A1: 1 } }] }).sheets[0].merges === undefined, 'a workbook without them has none');
}

// ---- what the rules make of the cells ------------------------------------------------------------------------
{
  const calc = computeBook(book);
  const hid = filterHidden(sh, 0, calc);
  ok(hid.has(3) && hid.has(4) && !hid.has(1) && !hid.has(0), 'the filter hides the rows whose status is Done, never its header');
  ok(hiddenRows(sh, 0, calc).has(8), 'rows hidden by hand are hidden too');
  ok(calc.get(sh.id, 'C6') === 24, 'formulas still count the rows a filter hides');
  const cf = new CondFormats(sh, 0, calc);
  ok(cf.at(2, 2)?.style?.b && cf.at(2, 2)?.scale === '#ff0000' && !cf.at(4, 2)?.style, 'a condition gives its look, and the colour scale shows with it');
  ok(cf.at(1, 0)?.style === undefined && cf.at(2, 0)?.style?.color === '#0000ff', 'a formula written for the first cell is worked out for each');
  ok(cf.at(1, 1)?.style?.i && !cf.at(2, 1)?.style, 'duplicates are found across the range');
  const bar = cf.at(3, 5)?.bar;
  ok(bar && bar.from === 0 && bar.to === 1, 'the largest value’s data bar is full');
  const rules = new Rules(sh);
  const at = (r: number, c: number) => ({ r, c, r0: 1, c0: c });
  ok(rules.at(2, 3)?.rule.type === 'list' && allowed(calc, 0, rules.at(2, 3)!.rule, 'Doing', 'Doing', at(2, 3)) && !allowed(calc, 0, rules.at(2, 3)!.rule, 'Nope', 'Nope', at(2, 3)), 'a list allows its options only');
  ok(allowed(calc, 0, rules.at(1, 4)!.rule, false, 'FALSE', at(1, 4)) && !allowed(calc, 0, rules.at(1, 4)!.rule, 'x', 'x', at(1, 4)), 'a checkbox holds TRUE or FALSE');
  ok(!allowed(calc, 0, rules.at(1, 2)!.rule, 150, '150', at(1, 2)) && allowed(calc, 0, rules.at(1, 2)!.rule, 50, '50', at(1, 2)), 'a number between');
  ok(
    listOptions(calc, 0, rules.at(1, 6)!.rule)
      .map((o) => o.v)
      .join(',') === 'Red,Green',
    'a list from a range takes its values once each',
  );
  const m = new Merges(sh.merges);
  ok(m.at(6, 1)?.c2 === 2 && JSON.stringify(m.grow({ r1: 5, c1: 1, r2: 6, c2: 1 })) === JSON.stringify({ r1: 5, c1: 0, r2: 6, c2: 2 }), 'a selection grows to whole merges');
  const data = chartData(book, calc, 0, sh.charts![0])!;
  ok(
    data.labels.join(',') === 'Plan,Build' && data.series.length === 1 && data.series[0].name === 'Hours' && data.series[0].values[1] === 12,
    'a chart reads labels down the first column and names along the first row, without a column of words or the rows the filter hides',
  );
  const svg = chartSvg(sh.charts![0], data, 480, 300);
  ok(svg.startsWith('<svg') && svg.includes('Hours') && (svg.match(/<rect /g)?.length ?? 0) === 2 && !svg.includes('<script'), 'and draws as SVG, its words escaped');
  ok(chartSvg({ ...sh.charts![0], title: '<img src=x>' }, data, 300, 200).includes('&#60;img'), 'a title is words, never markup');
  const words = chartData(book, calc, 0, { ...sh.charts![0], range: 'A1:A5' });
  ok(chartSvg(sh.charts![0], words, 300, 200).includes('No numbers to draw'), 'a chart of words only says it has no numbers to draw');
}

// ---- rows and columns put in and taken out -----------------------------------------------------------------------
{
  const ins = adjustForInsert(book, sh.id, 'row', 0, 2).sheets[0];
  ok(ins.merges?.[0] === 'A9:C9' && ins.filter?.range === 'A3:F7' && ins.conditional?.[0].range === 'C4:C7' && ins.conditional[3].when?.a === '=$C4>10', 'rows put in above move merges, the filter and rules (their formulas too)');
  ok(ins.charts?.[0].range === 'A3:C7' && ins.charts[0].from.cell === 'H4' && ins.validation?.[4].source === 'Lists!A1:A3', 'a chart’s cells move, and so does the chart; another sheet’s list stays');
  const insCol = adjustForInsert(book, sh.id, 'col', 1, 1).sheets[0];
  ok(insCol.filter?.cols?.E?.hide?.[0] === 'Done' && !insCol.filter.cols.D, 'a column put in moves a filter’s column');
  const del = adjustForDelete(book, sh.id, 'col', 3, 1).sheets[0];
  ok(!del.filter?.cols?.D && del.filter?.range === 'A1:E5', 'a filtered column taken out takes its filter along');
  const delRows = adjustForDelete(book, sh.id, 'row', 6, 1).sheets[0];
  ok(!delRows.merges, 'a merged row taken out takes its merge');
  const lists = book.sheets[1].id;
  const renamed = renameSheet(book, lists, 'Options');
  ok(renamed.sheets[0].validation?.[4].source === 'Options!A1:A3', 'a list’s sheet renamed is followed');
  const delLists = adjustForDelete(book, lists, 'row', 0, 5).sheets[0];
  ok(!delLists.validation?.some((v) => v.source), 'a list whose cells went is dropped');
}

// ---- charts on cells, of ranges in parts ------------------------------------------------------------------------
{
  const base = { name: 'C', rows: [['Month', 'Units', 'Sales', 'Costs'], ['Jan', 1, 10, 4], ['Feb', 2, 20, 5], ['Mar', 3, 30, 6], ['Apr', 4, 40, 7]] };
  const cb = normalizeBook({ sheets: [{ ...base, charts: [{ range: 'A1:A5,C1:D5', at: 'F2:K12', title: 'Parts' }, { range: ['A1:A5', 'C1:C4'] }, { range: 'A1:B5', x: 420, y: 48, w: 480, h: 300 }] }] });
  const [c1, c2, c3] = cb.sheets[0].charts!;
  ok(c1.from.cell === 'F2' && c1.to.cell === 'L13' && c1.range === 'A1:A5,C1:D5', 'a chart over a range of cells has its corners on them (the far one past the last cell)');
  ok(c3.from.cell === 'E3' && c3.from.dx === 20 && !c3.from.dy && c3.to.cell === 'J15' && !c3.to.dx && c3.to.dy === 12, 'a chart kept in px before is put on the cells it was drawn over');
  const calc = computeBook(cb);
  const d1 = chartData(cb, calc, 0, c1)!;
  ok(d1.labels.join() === 'Jan,Feb,Mar,Apr' && d1.series.map((x) => x.name).join() === 'Sales,Costs' && d1.series[1].values.join() === '4,5,6,7' && d1.series[0].ref.c1 === 2, 'a range in parts: the labels from one part, the values from the others, the column between left out');
  const why = chartProblem(cb, c2);
  ok(why?.includes('not as long as each other') && chartData(cb, calc, 0, c2) === null && chartSvg(c2, null, 400, 300, undefined, { problem: why }).includes('not as long'), 'parts of different lengths: the chart says why, in its place');
  ok(chartProblem(cb, { ...c1, range: 'A1:A5,Other!C1:C5' })?.includes('different sheets') && chartProblem(cb, { ...c1, range: 'Nope!A1:B3' })?.includes('no sheet named') && chartProblem(cb, c3) === null, 'and so do parts on two sheets, and a sheet that is not there');
  // Rows and columns in and out: the chart moves with its cells, and stretches with those under it.
  const id = cb.sheets[0].id;
  const above = adjustForInsert(cb, id, 'row', 0, 2).sheets[0].charts![0];
  const inside = adjustForInsert(cb, id, 'row', 5, 3).sheets[0].charts![0];
  const cols = adjustForInsert(cb, id, 'col', 2, 1).sheets[0].charts![0];
  ok(above.from.cell === 'F4' && above.to.cell === 'L15' && above.range === 'A3:A7,C3:D7', 'rows put in above move it down, its range with it');
  ok(inside.from.cell === 'F2' && inside.to.cell === 'L16', 'rows put in under its top stretch it');
  ok(cols.from.cell === 'G2' && cols.range === 'A1:A5,D1:E5', 'a column put in before it moves it right');
  const gone = adjustForDelete(cb, id, 'row', 1, 2).sheets[0].charts![0];
  ok(gone.from.cell === 'F2' && !gone.from.dy && gone.to.cell === 'L11', 'rows taken out from under its top: its top goes to the row after them, it shrinks');
  const all = adjustForDelete(cb, id, 'row', 0, 20).sheets[0].charts;
  ok(all === undefined, 'the rows of all its cells taken out: it goes with them');
  const lone = normalizeBook({ sheets: [{ ...base, charts: [{ range: 'A1:C5', at: 'F8:K12' }] }] });
  const shrunk = adjustForDelete(lone, lone.sheets[0].id, 'row', 6, 30).sheets[0].charts![0];
  ok(shrunk.from.cell === 'F7' && shrunk.to.cell === 'L12', 'the rows it sat on all taken out: it keeps its size from the row after them');
  // Hidden rows and columns fold it; sizes stretch it.
  const hid = normalizeBook({ sheets: [{ ...base, hidden: { rows: ['3:6'] }, heights: { 8: 48 }, charts: [{ range: 'A1:C5', at: 'F2:K12' }] }] }).sheets[0];
  const box0 = chartBox(hid.charts![0], sheetSizes({ ...hid, rows: undefined }));
  const box1 = chartBox(hid.charts![0], sheetSizes(hid));
  ok(box0.h === 11 * 24 && box1.h === 11 * 24 - 4 * 24 + 24, 'rows hidden under it fold it, a taller row stretches it');
  // Excel: two-cell anchors, the series pointing at each part.
  const z = new Zip(xlsxOfBook(cb, 'C'));
  const dr = z.text('xl/drawings/drawing1.xml') ?? '';
  const ch1 = z.text('xl/charts/chart1.xml') ?? '';
  ok(dr.includes('<xdr:twoCellAnchor editAs="twoCell"><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row>') && dr.includes('<xdr:to><xdr:col>11</xdr:col>') && (dr.match(/<xdr:twoCellAnchor/g)?.length ?? 0) === 2, 'Excel: each chart anchored by its two cells, the one that cannot draw left out');
  ok(ch1.includes('<c:f>C!$A$2:$A$5</c:f>') && ch1.includes('<c:f>C!$C$2:$C$5</c:f>') && ch1.includes('<c:f>C!$D$2:$D$5</c:f>') && !ch1.includes('$B$'), 'its series point at each part, the labels at the first');
  const cr = importBook(xlsxOfBook(cb, 'C'), 'C.xlsx').book.sheets[0].charts!;
  ok(cr.length === 2 && cr[0].range === 'A1:A5,C1:D5' && cr[0].from.cell === 'F2' && cr[0].to.cell === 'L13' && cr[1].range === 'A1:B5', 'read back: a range in parts, on the same cells');
  const words = normalizeBook({ sheets: [{ name: 'W', rows: [['Task', 'Owner', 'Hours'], ['Plan', 'Ann', 4], ['Build', 'Bo', 12]], charts: [{ range: 'A1:C3' }] }] });
  ok(importBook(xlsxOfBook(words, 'W'), 'W.xlsx').book.sheets[0].charts?.[0].range === 'A1:C3', 'a chart of a table with a column of words in it comes back as the one range it was');
  const page = bookPage(cb, 'C', 'viewer');
  ok(page.includes(`left:${42 + 500}px;top:${22 + 24}px;width:${6 * 100}px;height:${11 * 24}px`) && page.includes('not as long as each other'), 'the page draws each chart between its cells, and says why one cannot draw');
}

// ---- the Kanban board, kept with the sheet ----------------------------------------------------------------------------
{
  const kb = normalizeBook({
    sheets: [
      {
        name: 'K',
        rows: [['Task', 'Id', 'Hours', 'Status'], ['Plan', 1, 4, 'Open'], ['Build', 2, 12, 'Doing']],
        validation: [{ range: 'D2:D20', list: ['Open', 'Doing', 'Done'] }],
        board: { by: 'Status', fields: ['Hours', 'Id', 'Nope', 'D'], lanes: ['Done', 'Open', 'done', ''], open: true },
      },
      { name: 'L', rows: [['x']], board: { by: 'Nothing' } },
    ],
  });
  const bd = kb.sheets[0].board;
  ok(JSON.stringify(bd) === JSON.stringify({ at: 'A1', by: 'D', fields: ['B', 'C'], lanes: ['Done', 'Open'], open: true }) && !kb.sheets[1].board, 'a board: its column and fields by header (Id is a header before it is a column), lanes once each, opening on it; none without a column');
  ok(JSON.stringify(normalizeBook(JSON.parse(bookText(kb))).sheets[0].board) === JSON.stringify(bd), 'kept and read back as it was');
  const moved = adjustForInsert(kb, kb.sheets[0].id, 'col', 1, 1).sheets[0].board;
  const rowsIn = adjustForInsert(kb, kb.sheets[0].id, 'row', 0, 2).sheets[0].board;
  ok(moved?.by === 'E' && moved.fields?.join() === 'C,D' && rowsIn?.at === 'A3', 'columns put in move its columns, rows its table');
  ok(!adjustForDelete(kb, kb.sheets[0].id, 'col', 3, 1).sheets[0].board && JSON.stringify(adjustForDelete(kb, kb.sheets[0].id, 'col', 1, 1).sheets[0].board?.fields) === '["B"]', 'the column it groups by taken out takes it; a field’s column taken out, the field');
  ok(bookForAgent(bookText(kb)).includes('a Kanban board of the table at A1 grouped by column D, which the sheet opens on'), 'get_page says it has a board');
}

// ---- comments: threads on cells -----------------------------------------------------------------------------------
{
  const at = Date.UTC(2026, 10, 5, 10, 0);
  const cm = normalizeBook({
    sheets: [
      {
        name: 'C',
        rows: [['Item', 'Cost'], ['Rent', 900], ['Food', 300]],
        notes: { B3: 'Rough guess' },
        comments: [
          { id: 'k1', cell: 'B2', text: 'Is this per month?', by: 'user', at, replies: [{ id: 'k1r', by: 'agent', text: 'Yes, monthly.', at: at + 60_000 }] },
          { id: 'k2', cell: 'b3', text: 'Too low?', at, resolved: true },
          { id: 'k3', cell: 'B2', text: 'And the deposit?', at: at + 120_000 },
          { cell: 'nope', text: 'x' },
          { id: 'k4', cell: 'A9', text: '' },
        ],
      },
      { name: 'D', rows: [['x']], comments: [{ id: 'k1', cell: 'A1', text: 'Same id elsewhere' }] },
    ],
  });
  const [s1, s2] = cm.sheets;
  ok(s1.comments?.length === 2 && s1.comments[0].cell === 'B2' && s1.comments[0].replies?.length === 2 && s1.comments[0].replies[1].text === 'And the deposit?' && s1.comments[1].cell === 'B3' && s1.comments[1].resolved === true, 'comments: one thread a cell (a second joins it), on cells only, with words');
  ok(s2.comments?.[0].id !== 'k1', 'and an id not twice in the workbook');
  const ins = adjustForInsert(cm, s1.id, 'row', 1, 1).sheets[0].comments!;
  const del = adjustForDelete(cm, s1.id, 'row', 1, 1).sheets[0].comments!;
  ok(ins[0].cell === 'B3' && ins[1].cell === 'B4' && del.length === 1 && del[0].cell === 'B2', 'a comment follows its cell; one whose row is taken out goes');
  ok(bookOutlineOf(cm).includes('2 comments (1 open)'), 'the outline counts them');
  // Excel: threaded comments, their plain copies, and a note beside a comment as one note.
  const z = new Zip(xlsxOfBook(cm, 'C'));
  const tc = z.text('xl/threadedComments/threadedComment1.xml') ?? '';
  const legacy = z.text('xl/comments1.xml') ?? '';
  ok(tc.includes('<threadedComment ref="B2" dT="2026-11-05T10:00:00.000" personId="{6F1C3A2B-0000-4000-8000-0000000000A1}"') && /parentId="\{00000001-0000-4000-8000-000000000001\}"><text>Yes, monthly.<\/text>/.test(tc) && !tc.includes('ref="B3"'), 'threaded comments with their replies, a cell with a note left to the note');
  ok(legacy.includes('xr:uid="{00000001-0000-4000-8000-000000000001}"') && legacy.includes('<author>tc={00000001-0000-4000-8000-000000000001}</author>') && legacy.includes('[Threaded comment]') && legacy.includes('Rough guess\n\nComment:\n    Too low?'), 'their plain copies for programs that know only notes; a note and a comment on one cell as one note');
  ok((z.text('[Content_Types].xml') ?? '').includes('threadedcomments+xml') && z.has('xl/persons/person.xml') && (z.text('xl/_rels/workbook.xml.rels') ?? '').includes('relationships/person') && (z.text('xl/worksheets/_rels/sheet1.xml.rels') ?? '').includes('relationships/threadedComment'), 'with the people who wrote them, linked as Excel links them');
  const back = importBook(xlsxOfBook(cm, 'C'), 'C.xlsx');
  const bc = back.book.sheets[0].comments ?? [];
  ok(bc.length === 1 && bc[0].cell === 'B2' && bc[0].text === 'Is this per month?' && bc[0].by === 'user' && bc[0].at === at && bc[0].replies?.[0].by === 'agent' && bc[0].replies[1].text === 'And the deposit?', 'read back: the thread, who wrote each part and when');
  ok(back.book.sheets[0].cells.B3.note?.startsWith('Rough guess') && !back.book.sheets[0].cells.B2.note && back.loses?.length === 0, 'the note with a comment comes back as a note; a thread’s plain copy is no note');
  // A file with a threaded comment's plain copy only (no thread part): the thread comes from its words.
  const plain = zipParts(z.names().filter((n) => !n.includes('threadedComment') && !n.includes('persons')).map((name) => ({ name, data: z.read(name)! })));
  const pc = importBook(plain, 'P.xlsx').book.sheets[0].comments ?? [];
  ok(pc.length === 1 && pc[0].text === 'Is this per month?' && pc[0].replies?.map((r) => r.text).join('|') === 'Yes, monthly.|And the deposit?', 'a plain copy alone comes back as its thread');
  // Someone named (a comment from another person's Excel file) keeps their name both ways, their words as written.
  const nb = normalizeBook({ sheets: [{ name: 'N', rows: [['a']], comments: [{ id: 'n1', cell: 'A1', text: 'Check this', by: 'user', author: 'Maria Lopez', at, replies: [{ id: 'n1r', by: 'user', author: 'Sam Lee', text: 'Done', at: at + 1 }, { id: 'n1s', by: 'agent', text: 'Noted', at: at + 2 }] }] }] });
  const nz = new Zip(xlsxOfBook(nb, 'N'));
  ok((nz.text('xl/persons/person.xml') ?? '').includes('displayName="Maria Lopez"') && (nz.text('xl/persons/person.xml') ?? '').includes('displayName="Sam Lee"'), 'named authors are people of the Excel file');
  const nr = importBook(xlsxOfBook(nb, 'N'), 'N.xlsx').book.sheets[0].comments ?? [];
  ok(nr[0]?.author === 'Maria Lopez' && nr[0].text === 'Check this' && nr[0].replies?.[0].author === 'Sam Lee' && nr[0].replies[0].text === 'Done' && nr[0].replies[1].by === 'agent' && !nr[0].replies[1].author, 'read back: each keeps their name, their words without it');
}

// ---- Excel files: written and read back ---------------------------------------------------------------------------
{
  const calc = computeBook(book);
  const x = xlsxOfBook(book, 'Work');
  const z = new Zip(x);
  const sheet1 = z.text('xl/worksheets/sheet1.xml') ?? '';
  ok(/<autoFilter ref="A1:F5"><filterColumn colId="3"><filters><filter val="Doing"\/><filter val="Open"\/><\/filters>/.test(sheet1), 'the filter is an autoFilter with the values it shows');
  ok(/<row r="4"[^>]*hidden="1"/.test(sheet1) && /<row r="9"[^>]*hidden="1"/.test(sheet1) && /<col min="8" max="8"[^>]*hidden="1"/.test(sheet1), 'its hidden rows (and those by hand) and columns are hidden');
  ok(sheet1.includes('<mergeCell ref="A7:C7"/>') && sheet1.includes('<conditionalFormatting sqref="C2:C5"><cfRule type="cellIs" dxfId="0" priority="1" operator="greaterThan"><formula>5</formula>'), 'merges and conditional formatting');
  ok(sheet1.includes('type="colorScale"') && sheet1.includes('type="dataBar"') && sheet1.includes('type="expression"') && sheet1.includes('type="duplicateValues"'), 'colour scales, data bars, formulas, duplicates');
  ok(
    sheet1.includes("<formula1>'Hydor lists'!$A$1:$A$3</formula1>") && sheet1.includes('&quot;TRUE,FALSE&quot;') && sheet1.includes('promptTitle="Rating"') && sheet1.includes('<formula1>Lists!$A$1:$A$3</formula1>'),
    'lists (one with coloured chips on the hidden sheet of lists), checkboxes, ratings and a list from a range as data validation',
  );
  ok(
    sheet1.indexOf('<autoFilter') < sheet1.indexOf('<mergeCells') &&
      sheet1.indexOf('<mergeCells') < sheet1.indexOf('<conditionalFormatting') &&
      sheet1.indexOf('<dataValidations') < sheet1.indexOf('<pageMargins') &&
      sheet1.indexOf('<drawing') > sheet1.indexOf('<pageMargins'),
    'in the order Excel wants them',
  );
  ok(
    // Three looks of its rules, and two of its list's coloured options (Doing, Done), as Excel shows them.
    (z.text('xl/styles.xml') ?? '').includes('<dxfs count="5">') && z.has('xl/comments1.xml') && z.has('xl/drawings/vmlDrawing1.vml') && z.has('xl/charts/chart1.xml') && z.has('xl/drawings/drawing1.xml'),
    'with dxfs, comments and their VML, a drawing and its chart',
  );
  ok((z.text('xl/charts/chart1.xml') ?? '').includes('<c:f>Work!$C$2:$C$5</c:f>') && (z.text('[Content_Types].xml') ?? '').includes('drawingml.chart+xml'), 'the chart’s series point at the cells');
  ok((z.text('xl/workbook.xml') ?? '').includes('_xlnm._FilterDatabase'), 'and the filter’s hidden name is there');
  const back = importBook(x, 'Work.xlsx');
  const b = back.book.sheets[0];
  ok(back.loses?.length === 0, 'read back, nothing is lost');
  ok(JSON.stringify(b.merges) === '["A7:C7"]' && b.rows?.[8]?.hidden && !b.rows?.[3]?.hidden && b.cols?.[7]?.hidden, 'merges and hidden rows come back; the filter’s rows are not hidden by hand');
  ok(b.filter?.range === 'A1:F5' && b.filter.cols?.D?.hide?.join() === 'Done', 'the filter comes back, hiding what it hid');
  ok(JSON.stringify(b.conditional) === JSON.stringify(sh.conditional), 'conditional formatting comes back as it was');
  ok(JSON.stringify(b.validation) === JSON.stringify(sh.validation), 'rules for cells come back, lists with their chips’ colours');
  ok(back.book.sheets.length === 2 && !back.book.sheets.some((s) => s.name.startsWith('Hydor lists')), 'and the hidden sheet that kept those colours is no sheet of the workbook');
  // Lists Excel cannot hold in a rule: options with commas or quotes, or longer than 255 characters in all.
  const long = Array.from({ length: 40 }, (_, i) => `Option number ${i + 1}`);
  const listBook = normalizeBook({
    sheets: [
      { name: 'L', rows: [['Size'], ['Small, cheap']], validation: [{ range: 'A2:A9', list: ['Small, cheap', 'Big "deluxe"', '10', 'Plain'] }, { range: 'B2:B9', list: long }, { range: 'C2:C9', list: ['Yes', 'No'] }] },
      { name: 'Hydor lists', rows: [['mine']] },
    ],
  });
  const lx = new Zip(xlsxOfBook(listBook, 'L'));
  const wbx = lx.text('xl/workbook.xml') ?? '';
  const l1 = lx.text('xl/worksheets/sheet1.xml') ?? '';
  ok(/<sheet name="Hydor lists \(2\)" sheetId="3" state="hidden"/.test(wbx) && l1.includes("<formula1>'Hydor lists (2)'!$A$1:$A$4</formula1>") && l1.includes("<formula1>'Hydor lists (2)'!$B$1:$B$40</formula1>") && l1.includes('<formula1>&quot;Yes,No&quot;</formula1>'), 'they go on a hidden sheet of lists (beside one of the same name), a list that fits stays in its rule');
  ok(/<c r="A3"[^>]*><v>10<\/v><\/c>/.test(lx.text('xl/worksheets/sheet3.xml') ?? ''), 'an option that is a number is written as one, so typed numbers match it');
  const lb = importBook(xlsxOfBook(listBook, 'L'), 'L.xlsx').book;
  ok(lb.sheets.length === 2 && lb.sheets[1].name === 'Hydor lists' && lb.sheets[0].validation?.[0].options?.map((o) => o.v).join('|') === 'Small, cheap|Big "deluxe"|10|Plain' && lb.sheets[0].validation?.[1].options?.length === 40 && !lb.sheets[0].validation?.[0].source, 'and come back whole as lists of options');
  ok(b.cells.B3.note === 'Bo is away in May' && b.cells.Z9?.note === 'Far off', 'notes come back');
  ok(
    b.charts?.length === 2 && b.charts[0].kind === 'column' && b.charts[0].range === 'A1:C5' && b.charts[0].title === 'Hours' && JSON.stringify([b.charts[0].from, b.charts[0].to]) === JSON.stringify([sh.charts![0].from, sh.charts![0].to]),
    'charts come back, on the same cells (the one that cannot draw is left out of the file)',
  );
  const styled = normalizeBook({
    sheets: [{ name: 'S', cells: { A1: { v: -3, s: { code: '#,##0;[Red]-#,##0', border: 'thick #ff0000', font: 'Verdana', rot: -30 } }, A2: { v: 46000, s: { fmt: 'datetime' } }, A3: { v: 3, s: { fmt: 'accounting', cur: '€' } } } }],
  });
  const sb = importBook(xlsxOfBook(styled, 'S'), 'S.xlsx').book.sheets[0].cells;
  ok(sb.A1.s?.code === '#,##0;[Red]-#,##0' && sb.A1.s.bt === 'thick #ff0000' && sb.A1.s.font === 'Verdana' && sb.A1.s.rot === -30, 'a code, borders, a font and turned words come back from Excel');
  ok(sb.A2.s?.fmt === 'datetime' && sb.A3.s?.fmt === 'accounting' && sb.A3.s.cur === '€', 'and the new formats too');
  // What saving an Excel file loses, said only of what it has: links, groups, icon sets, names, macros, rich words, pictures.
  const parts = z.names().map((name) => ({ name, data: z.read(name)! }));
  const edit = (name: string, f: (x: string) => string) => parts.map((q) => (q.name === name ? { name, data: f(q.data.toString()) } : q));
  let more = edit('xl/worksheets/sheet1.xml', (x) => x.replace('<row r="2"', '<row r="2" outlineLevel="1"').replace('<pageMargins', '<hyperlinks><hyperlink ref="A2:B3" display="x"/></hyperlinks><pageMargins'));
  more = more.map((q) => (q.name === 'xl/workbook.xml' ? { name: q.name, data: q.data.toString().replace('</definedNames>', '<definedName name="Rate">Work!$C$2</definedName><definedName name="Ext">[1]Sheet1!$C$2</definedName></definedNames>') } : q));
  more = more.map((q) => (q.name === 'xl/sharedStrings.xml' ? { name: q.name, data: q.data.toString().replace('<si><t>Task</t></si>', '<si><r><rPr><b/></rPr><t>Ta</t></r><r><t>sk</t></r></si>') } : q));
  more = more.map((q) => (q.name === 'xl/drawings/drawing1.xml' ? { name: q.name, data: q.data.toString().replace('</xdr:wsDr>', '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="9" name="Box"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr/></xdr:sp><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>') } : q));
  more.push({ name: 'xl/vbaProject.bin', data: Buffer.from('x') });
  const got = importBook(zipParts(more), 'Work.xlsm');
  const lost = got.loses ?? [];
  ok(got.book.names?.some((n) => n.name === 'Rate' && n.ref === 'Work!$C$2') && !got.book.names?.some((n) => n.name === 'Ext'), 'a name of the workbook is kept; one pointing into another file is not');
  ok(['groups', 'hyperlinks', 'names', 'rich', 'shapes', 'macros'].every((k) => lost.includes(k)) && !lost.includes('charts') && !lost.includes('pictures'), `what an Excel file loses is said: ${lost.join(', ')}`);
  void calc;
}

// ---- OpenDocument files: merged cells, rules, notes ---------------------------------------------------------------
{
  const NS =
    'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:calcext="urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0" xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"';
  const content =
    `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS} office:version="1.3"><office:body><office:spreadsheet>` +
    '<table:content-validations>' +
    '<table:content-validation table:name="val1" table:condition="of:cell-content-is-in-list(&quot;Open&quot;;&quot;Doing&quot;;&quot;Done, really&quot;)" table:allow-empty-cell="true" table:base-cell-address="Work.B2"><table:error-message table:message-type="stop" table:display="true"/></table:content-validation>' +
    '<table:content-validation table:name="val2" table:condition="of:cell-content-is-in-list([$Lists.$A$1:.$A$3])" table:allow-empty-cell="true" table:base-cell-address="Work.C2"><table:error-message table:message-type="warning" table:display="true"/></table:content-validation>' +
    '<table:content-validation table:name="val3" table:condition="of:cell-content-is-whole-number() and cell-content-is-between(1;10)" table:allow-empty-cell="true" table:base-cell-address="Work.D2"/>' +
    '</table:content-validations><table:table table:name="Work"><table:table-column table:number-columns-repeated="4"/>' +
    '<table:table-row><table:table-cell table:number-columns-spanned="2" table:number-rows-spanned="1" office:value-type="string"><text:p>Title</text:p></table:table-cell><table:covered-table-cell/>' +
    '<table:table-cell office:value-type="string"><text:p>Size</text:p><office:annotation><text:p>Check this</text:p></office:annotation></table:table-cell><table:table-cell office:value-type="float" office:value="7"><text:p>7</text:p></table:table-cell></table:table-row>' +
    '<table:table-row table:number-rows-repeated="3"><table:table-cell/><table:table-cell table:content-validation-name="val1"/><table:table-cell table:content-validation-name="val2"/><table:table-cell table:content-validation-name="val3" office:value-type="float" office:value="5"><text:p>5</text:p></table:table-cell></table:table-row>' +
    '<table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="4"/></table:table-row>' +
    '<calcext:conditional-formats>' +
    '<calcext:conditional-format calcext:target-range-address="Work.D2:Work.D4"><calcext:condition calcext:apply-style-name="Good" calcext:value="&gt;3" calcext:base-cell-address="Work.D2"/></calcext:conditional-format>' +
    '<calcext:conditional-format calcext:target-range-address="Work.D2:Work.D4"><calcext:color-scale><calcext:color-scale-entry calcext:value="0" calcext:type="minimum" calcext:color="#ff0000"/><calcext:color-scale-entry calcext:value="0" calcext:type="maximum" calcext:color="#00ff00"/></calcext:color-scale></calcext:conditional-format>' +
    '<calcext:conditional-format calcext:target-range-address="Work.B2:Work.B4"><calcext:condition calcext:apply-style-name="Mine" calcext:value="begins-with(&quot;Do&quot;)" calcext:base-cell-address="Work.B2"/></calcext:conditional-format>' +
    '<calcext:conditional-format calcext:target-range-address="Work.A2:Work.A4"><calcext:data-bar calcext:positive-color="#2a6099"/></calcext:conditional-format>' +
    '</calcext:conditional-formats></table:table>' +
    '<table:table table:name="Lists"><table:table-row><table:table-cell office:value-type="string"><text:p>Red</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell office:value-type="string"><text:p>Green</text:p></table:table-cell></table:table-row></table:table>' +
    '</office:spreadsheet></office:body></office:document-content>';
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS}><office:styles><style:style style:name="Mine" style:family="table-cell"><style:table-cell-properties fo:background-color="#ffeeaa"/><style:text-properties fo:color="#aa5500" fo:font-weight="bold"/></style:style></office:styles></office:document-styles>`;
  const ods = zipParts([
    { name: 'mimetype', data: 'application/vnd.oasis.opendocument.spreadsheet' },
    { name: 'content.xml', data: content },
    { name: 'styles.xml', data: styles },
  ]);
  const o = importBook(ods, 'Rules.ods').book.sheets[0];
  ok(JSON.stringify(o.merges) === '["A1:B1"]' && o.cells.A1.v === 'Title' && o.cells.C1.note === 'Check this' && o.cells.C1.v === 'Size', 'an .ods file brings in its merged cells and notes');
  const [v1, v2, v3] = o.validation ?? [];
  ok(v1?.range === 'B2:B4' && v1.options?.map((x) => x.v).join('|') === 'Open|Doing|Done, really' && v1.reject === true, 'and a validation list, rejecting');
  ok(v2?.range === 'C2:C4' && v2.source === 'Lists!A1:A3' && !v2.reject && v3?.type === 'number' && v3.when?.op === 'between' && v3.when.a === '1' && v3.when.b === '10', 'a list from a range, warning; whole numbers between');
  const cf = o.conditional ?? [];
  ok(cf.length === 4 && cf[0].when?.op === 'gt' && cf[0].when.a === '3' && cf[0].style?.fill === '#ccffcc' && cf[1].scale?.max.color === '#00ff00', 'and its conditional formatting: a value compared, in LibreOffice’s own look; a colour scale');
  ok(cf[2].when?.op === 'starts' && cf[2].when.a === 'Do' && cf[2].style?.fill === '#ffeeaa' && cf[2].style.b === true && cf[3].bar?.color === '#2a6099', 'text it starts with, in the file’s own style; data bars');
}

// ---- arrays that spill ----------------------------------------------------------------------------------------------
{
  const b = normalizeBook({
    sheets: [
      {
        name: 'A',
        rows: [
          ['Name', 'Team', 'Score'],
          ['Ann', 'Red', 7],
          ['Bo', 'Blue', 3],
          ['Cy', 'Red', 9],
          ['Di', 'Blue', 5],
        ],
        cells: {
          E1: '=SEQUENCE(3,2,10,5)',
          H1: '=SORT(A2:C5,3,-1)',
          L1: '=FILTER(A2:A5,C2:C5>4)',
          M1: '=UNIQUE(B2:B5)',
          N1: '=SUM(L1:L5)',
          O1: '=COUNTA(L1:L5)',
          P1: '=SORTBY(A2:A5,B2:B5,1,C2:C5,-1)',
          Q1: '=FILTER(A2:A5,C2:C5>100,"none")',
          R1: '=SEQUENCE(3)',
          R2: 'in the way',
          S1: '=M2&"!"',
        },
      },
    ],
  });
  const calc = computeBook(b);
  const id = b.sheets[0].id;
  const g = (k: string) => calc.get(id, k);
  ok(g('E1') === 10 && g('F1') === 15 && g('E2') === 20 && g('F3') === 35, 'SEQUENCE spills rows and columns from its cell');
  ok(g('H1') === 'Cy' && g('J1') === 9 && g('H4') === 'Bo' && g('J4') === 3, 'SORT spills the rows by a column, highest first');
  ok(g('L1') === 'Ann' && g('L2') === 'Cy' && g('L3') === 'Di' && g('L4') === null, 'FILTER keeps the rows whose test holds');
  ok(g('M1') === 'Red' && g('M2') === 'Blue' && g('M3') === null, 'UNIQUE gives each value once');
  ok(g('N1') === 0 && g('O1') === 3, 'what spilled counts in other formulas');
  ok(g('P1') === 'Di' && g('P2') === 'Bo' && g('P3') === 'Cy' && g('P4') === 'Ann', 'SORTBY sorts by other ranges in turn');
  ok(g('Q1') === 'none', 'FILTER with nothing left gives what it is told to');
  ok((g('R1') as { code?: string })?.code === '#SPILL!' && g('R3') === null, 'an array with no room to spill is #SPILL!');
  ok(g('S1') === 'Blue!', 'a spilled cell is read like any other');
  ok(calc.spillsOf(0).length === 5 && calc.shownExtent(0).rows === 5 && calc.extent(0).rows === 5, 'the arrays spilled are known, each with its cells');
  const x = new Zip(xlsxOfBook(b, 'A')).text('xl/worksheets/sheet1.xml') ?? '';
  ok(x.includes('<f t="array" ref="E1:F3">SEQUENCE(3,2,10,5)</f>') || x.includes('<f t="array" ref="E1:F3">_xlfn.SEQUENCE(3,2,10,5)</f>'), 'in Excel, a spilling formula is an array formula over the cells it fills');
  ok(x.includes('_xlfn._xlws.SORT(') && /<c r="F3"[^>]*><v>35<\/v><\/c>/.test(x), 'with its prefix, and the values it spilled cached in their cells');
  const back = importBook(xlsxOfBook(b, 'A'), 'A.xlsx').book.sheets[0];
  ok(back.cells.E1?.f === 'SEQUENCE(3,2,10,5)' && !back.cells.F3 && back.cells.H1?.f === 'SORT(A2:C5,3,-1)' && !back.cells.I2, 'read back, the formulas spill again (their cells left empty for them)');
  const csv = csvOfBook(b);
  ok(csv.split('\r\n')[0].includes('10,15') && csv.includes('Cy,Red,9'), 'a CSV has what spilled');
  ok(bookPage(b, 'A', 'viewer').includes('>35<'), 'and so does the workbook’s page');
  const file = Buffer.from('Name,Score\nAnn,3\nBo,5\n');
  const fromFile = normalizeBook({ sheets: [{ name: 'S', rows: [['Name', 'Score'], ['Ann', 3], ['Bo', 5]], cells: { D1: '=SEQUENCE(3)', E1: '=FILTER(A2:A3,B2:B3>4,"none")' } }] });
  ok(delimitedFile(fromFile, file, 'csv').data.toString() === 'Name,Score,,1,Bo\nAnn,3,,2,\nBo,5,,3,\n', 'a CSV saved back from Files writes what spilled, in the cells it fills');
}

// ---- the workbook's own page --------------------------------------------------------------------------------------
{
  const html = bookPage(book, 'Work', 'viewer');
  ok(html.includes('rowspan') === false && html.includes('colspan="3"'), 'a merged row is one cell across');
  ok(!html.includes('>Test<') && !html.includes('>Ship<') && html.includes('>Plan<'), 'rows the filter hides are not on it');
  ok(html.includes('class="nb-cb">☐') && html.includes('nb-stars') && html.includes('nb-chip'), 'checkboxes, stars and chips as in the editor');
  ok(html.includes('title="Bo is away in May"') && html.includes('<svg') && html.includes('nb-chart'), 'notes, and the chart over the grid');
  const print = bookPage(book, 'Work', 'print');
  ok(print.includes('nb-charts') && print.includes('<svg'), 'printed, the charts come after the table');
  const evil = normalizeBook({ sheets: [{ name: 'E', cells: { A1: { v: 'x', note: '"><script>alert(1)</script>' } }, charts: [{ range: 'A1', title: '</svg><script>x</script>' }] }] });
  const e = bookPage(evil, 'E', 'viewer');
  ok(!e.includes('<script>alert') && !e.includes('</svg><script>'), 'a note’s and a chart’s words are escaped');
  const told = bookForAgent(bookText(book));
  ok(told.includes('a filter on A1:F5') && told.includes('5 conditional formatting rules') && told.includes('3 charts (column of A1:C5 on H2:') && told.includes('merged: A7:C7'), 'get_page tells an agent what else a sheet has');
}

// ---- through the routes ------------------------------------------------------------------------------------------
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-sheet-editor-test-')));
  const db = openDb(path.join(tmp, 'test.db'));
  const app = Fastify({ bodyLimit: 40 * 1024 * 1024 });
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_r, b, done) => {
    try {
      done(null, String(b).trim() ? JSON.parse(String(b)) : {});
    } catch (e) {
      done(e as Error, undefined);
    }
  });
  app.setErrorHandler((err: Error & { status?: number; statusCode?: number }, _req, reply) => reply.code(err.status ?? err.statusCode ?? 500).send({ error: err.message }));
  const deps = { app, db, sessions: { deliverOrQueue: async () => {} }, broadcast: () => {}, toSubscribers() {}, publicBase: () => 'https://naget.example' } as unknown as Deps;
  pages.routes!(deps);
  await app.ready();
  const ctx = { runId: 'run1', key: 'claude:s1', agent: 'claude', cwd: tmp, deps } as RunCtx;
  const tools = Object.fromEntries(pages.tools!(ctx).map((t) => [t.name, t]));
  const req = (method: 'GET' | 'POST', url: string, body?: unknown) => app.inject({ method, url, payload: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', host: 'app.test' } });
  const made = await tools.save_sheet.run({ title: 'Work', ...raw }, ctx);
  const text = typeof made === 'string' ? made : made.text;
  const id = /\(page ([a-f0-9]{10})/.exec(text ?? '')?.[1] ?? '';
  ok(id, 'save_sheet takes merges, filters, rules, notes and charts');
  if (!id) console.log(text);
  const gotPage = await req('GET', `/api/pages/${id}`);
  const model = gotPage.json().model as Workbook;
  if (!model) console.log(gotPage.statusCode, gotPage.body.slice(0, 300));
  ok(model.sheets[0].charts?.length === 3 && model.sheets[0].validation?.length === 5 && model.sheets[0].cells.B3.note, 'and keeps them');
  ok(text.includes('cannot draw from nope'), 'and says which chart cannot draw, and why');
  const got = await tools.get_page.run({ id }, ctx);
  ok((typeof got === 'string' ? got : got.text).includes('"conditional":['), 'get_page gives them back as kept');
  const xlsx = await req('GET', `/api/pages/${id}/export?format=xlsx`);
  ok(xlsx.statusCode === 200 && xlsx.rawPayload.subarray(0, 2).toString() === 'PK', 'the Excel export works with all of them');
  const changed = structuredClone(model);
  changed.sheets[0].merges = ['B8:C8'];
  const r = await req('POST', `/api/pages/${id}/versions`, { model: changed, base: 1 });
  ok(r.json().page?.version === 2 && (await req('GET', `/api/pages/${id}`)).json().model.sheets[0].merges[0] === 'B8:C8', 'the editor’s changes to them are saved as a version');
  // Comments through the tools: an agent answers and adds them; the threads it sends back are left as they were.
  const withComments = structuredClone(model);
  withComments.sheets[0].comments = [{ id: 'u1', cell: 'C3', by: 'user', text: 'Why 12 hours?', at: 1_790_000_000_000 }];
  await req('POST', `/api/pages/${id}/versions`, { model: withComments, base: 2 });
  const listed = await tools.get_page.run({ id }, ctx);
  const listedText = typeof listed === 'string' ? listed : listed.text;
  ok(listedText.includes('- u1 · open · Work!C3 · the user') && listedText.includes('"reply"'), 'get_page lists the comments, and how to answer them');
  const forged = { ...raw, sheets: raw.sheets.map((x, i) => (i ? x : { ...x, comments: [{ id: 'u1', cell: 'C3', by: 'user', text: 'Forged' }] })) };
  const answered = await tools.save_sheet.run({ id, title: 'Work', ...forged, comments: [{ id: 'u1', reply: 'Building takes longest.', resolve: true }, { sheet: 'Lists', cell: 'A2', text: 'Is Green still sold?' }, { id: 'zz', reply: 'x' }] }, ctx);
  const answeredText = typeof answered === 'string' ? answered : answered.text;
  const after = (await req('GET', `/api/pages/${id}`)).json().model as Workbook;
  const u1 = after.sheets[0].comments?.[0];
  ok(u1?.text === 'Why 12 hours?' && u1.by === 'user' && u1.resolved === true && u1.replies?.[0].by === 'agent' && u1.replies[0].text === 'Building takes longest.', 'save_sheet answers and resolves a comment, its words as the user wrote them');
  ok(after.sheets[1].comments?.[0].by === 'agent' && after.sheets[1].comments[0].cell === 'A2' && answeredText.includes('There is no comment zz'), 'and adds one of the agent’s, saying what it could not do');
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

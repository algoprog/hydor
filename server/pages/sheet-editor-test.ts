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
import { accountingParts, adjustForDelete, adjustForInsert, bookText, cleanBorder, codeColor, computeBook, formatValue, inputText, normalizeBook, parseInput, renameSheet, type Workbook } from '../../shared/sheets.ts';
import { allowed, CondFormats, filterHidden, hiddenRows, listOptions, Merges, Rules } from '../../shared/sheet-rules.ts';
import { chartData, chartSvg } from '../../shared/sheet-chart.ts';
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
  ok(sh.charts?.length === 2 && sh.charts[0].x === 700 && sh.charts[0].y === 24 && sh.charts[1].kind === 'column', 'charts: placed at a cell; an unknown kind is a column chart; one of no cells goes');
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
  ok(ins.charts?.[0].range === 'A3:C7' && ins.validation?.[4].source === 'Lists!A1:A3', 'a chart’s cells move; another sheet’s list stays');
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
    sheet1.includes('<formula1>&quot;Open,Doing,Done&quot;</formula1>') && sheet1.includes('&quot;TRUE,FALSE&quot;') && sheet1.includes('promptTitle="Rating"') && sheet1.includes('<formula1>Lists!$A$1:$A$3</formula1>'),
    'lists, checkboxes, ratings and a list from a range as data validation',
  );
  ok(
    sheet1.indexOf('<autoFilter') < sheet1.indexOf('<mergeCells') &&
      sheet1.indexOf('<mergeCells') < sheet1.indexOf('<conditionalFormatting') &&
      sheet1.indexOf('<dataValidations') < sheet1.indexOf('<pageMargins') &&
      sheet1.indexOf('<drawing') > sheet1.indexOf('<pageMargins'),
    'in the order Excel wants them',
  );
  ok(
    (z.text('xl/styles.xml') ?? '').includes('<dxfs count="3">') && z.has('xl/comments1.xml') && z.has('xl/drawings/vmlDrawing1.vml') && z.has('xl/charts/chart1.xml') && z.has('xl/drawings/drawing1.xml'),
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
  ok(JSON.stringify(b.validation?.map((v) => ({ ...v, options: v.options?.map((o) => o.v) }))) === JSON.stringify(sh.validation?.map((v) => ({ ...v, options: v.options?.map((o) => o.v) }))), 'rules for cells come back (lists without their colours)');
  ok(b.cells.B3.note === 'Bo is away in May' && b.cells.Z9?.note === 'Far off', 'notes come back');
  ok(b.charts?.length === 2 && b.charts[0].kind === 'column' && b.charts[0].range === 'A1:C5' && b.charts[0].title === 'Hours' && Math.abs(b.charts[0].x - 700) < 2, 'charts come back, where they were');
  const styled = normalizeBook({
    sheets: [{ name: 'S', cells: { A1: { v: -3, s: { code: '#,##0;[Red]-#,##0', border: 'thick #ff0000', font: 'Verdana', rot: -30 } }, A2: { v: 46000, s: { fmt: 'datetime' } }, A3: { v: 3, s: { fmt: 'accounting', cur: '€' } } } }],
  });
  const sb = importBook(xlsxOfBook(styled, 'S'), 'S.xlsx').book.sheets[0].cells;
  ok(sb.A1.s?.code === '#,##0;[Red]-#,##0' && sb.A1.s.bt === 'thick #ff0000' && sb.A1.s.font === 'Verdana' && sb.A1.s.rot === -30, 'a code, borders, a font and turned words come back from Excel');
  ok(sb.A2.s?.fmt === 'datetime' && sb.A3.s?.fmt === 'accounting' && sb.A3.s.cur === '€', 'and the new formats too');
  // What saving an Excel file loses, said only of what it has: links, groups, icon sets, names, macros, rich words, pictures.
  const parts = z.names().map((name) => ({ name, data: z.read(name)! }));
  const edit = (name: string, f: (x: string) => string) => parts.map((q) => (q.name === name ? { name, data: f(q.data.toString()) } : q));
  let more = edit('xl/worksheets/sheet1.xml', (x) => x.replace('<row r="2"', '<row r="2" outlineLevel="1"').replace('<pageMargins', '<hyperlinks><hyperlink ref="A2" display="x"/></hyperlinks><pageMargins'));
  more = more.map((q) => (q.name === 'xl/workbook.xml' ? { name: q.name, data: q.data.toString().replace('</definedNames>', '<definedName name="Rate">Work!$C$2</definedName></definedNames>') } : q));
  more = more.map((q) => (q.name === 'xl/sharedStrings.xml' ? { name: q.name, data: q.data.toString().replace('<si><t>Task</t></si>', '<si><r><rPr><b/></rPr><t>Ta</t></r><r><t>sk</t></r></si>') } : q));
  more = more.map((q) => (q.name === 'xl/drawings/drawing1.xml' ? { name: q.name, data: q.data.toString().replace('</xdr:wsDr>', '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="9" name="Box"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr/></xdr:sp><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>') } : q));
  more.push({ name: 'xl/vbaProject.bin', data: Buffer.from('x') });
  const lost = importBook(zipParts(more), 'Work.xlsm').loses ?? [];
  ok(['groups', 'hyperlinks', 'names', 'rich', 'shapes', 'macros'].every((k) => lost.includes(k)) && !lost.includes('charts') && !lost.includes('pictures'), `what an Excel file loses is said: ${lost.join(', ')}`);
  void calc;
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
  ok(told.includes('a filter on A1:F5') && told.includes('5 conditional formatting rules') && told.includes('2 charts') && told.includes('merged: A7:C7'), 'get_page tells an agent what else a sheet has');
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
  ok(model.sheets[0].charts?.length === 2 && model.sheets[0].validation?.length === 5 && model.sheets[0].cells.B3.note, 'and keeps them');
  const got = await tools.get_page.run({ id }, ctx);
  ok((typeof got === 'string' ? got : got.text).includes('"conditional":['), 'get_page gives them back as kept');
  const xlsx = await req('GET', `/api/pages/${id}/export?format=xlsx`);
  ok(xlsx.statusCode === 200 && xlsx.rawPayload.subarray(0, 2).toString() === 'PK', 'the Excel export works with all of them');
  const changed = structuredClone(model);
  changed.sheets[0].merges = ['B8:C8'];
  const r = await req('POST', `/api/pages/${id}/versions`, { model: changed, base: 1 });
  ok(r.json().page?.version === 2 && (await req('GET', `/api/pages/${id}`)).json().model.sheets[0].merges[0] === 'B8:C8', 'the editor’s changes to them are saved as a version');
  await app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

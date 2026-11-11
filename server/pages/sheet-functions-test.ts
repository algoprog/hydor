// Script tests for the spreadsheet's newer functions and what goes with them (shared/sheets.ts): LET and LAMBDA (and
// the functions that call one: MAP, REDUCE, SCAN, BYROW, BYCOL, MAKEARRAY), arrays stacked, taken, dropped, picked
// and wrapped, words split and found by regular expressions, the statistics and fits, the working-day functions, the
// AI function's answers kept by what they were asked, links, pictures and sparklines in cells, named ranges (in
// formulas, and following rows, columns and sheets), and formulas as Excel's files write them. Values are those Excel
// (or Google Sheets, for its own functions) gives. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/pages/sheet-functions-test.ts
//   DATA_DIR=/tmp/hydor-test-sheet-functions node dist/dev/sheet-functions-test.js
import {
  adjustForDelete,
  adjustForInsert,
  adjustForMove,
  adjustForMoveLines,
  aiKey,
  bookText,
  CellError,
  computeBook,
  excelFormula,
  FUNCTION_NAMES,
  formulaFromFile,
  isRangeName,
  normalizeBook,
  renameName,
  renameSheet,
  type Scalar,
  type Workbook,
} from '../../shared/sheets.ts';
import { bookPage, importBook, xlsxOfBook } from './sheets.ts';
import { addGroup, foldGroup, guardOf, protectionAt, removeGroup, spansOf } from '../../shared/sheet-groups.ts';
import { chartData, chartSvg, histogramOf } from '../../shared/sheet-chart.ts';
import '../../shared/sheet-rules.ts';
import { dependents, goalSeek, precedents } from '../../shared/sheet-whatif.ts';
import { pivotSheet, pivotValues } from '../../shared/sheet-pivot.ts';
import { Zip } from '../documents/zip.ts';
import { FUNCTION_INFO } from '../../web/src/features/pages/sheets/functions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let failed = 0;
let passed = 0;
const ok = (cond: unknown, what: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${what}`);
  }
};
const near = (a: Scalar, b: number, tol = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const err = (v: Scalar) => (v instanceof CellError ? v.code : null);

/** A one-sheet workbook of these cells, worked out: what a cell shows, and the array a formula spilled. */
function sheet(cells: Record<string, unknown>, extra: Partial<Workbook> & Record<string, unknown> = {}) {
  const book = normalizeBook({ sheets: [{ name: 'Sheet1', cells }], ...extra });
  const calc = computeBook(book, { now: new Date(Date.UTC(2026, 10, 6, 12)) });
  const id = book.sheets[0].id;
  return {
    book,
    calc,
    v: (cell: string) => calc.get(id, cell),
    /** The values a formula spilled from its cell, row by row. */
    spill: (cell: string) => {
      calc.get(id, cell);
      const at = calc.spillsOf(0).find((s) => `${String.fromCharCode(65 + s.c)}${s.r + 1}` === cell);
      return at ? at.sp.d.map((x) => (x instanceof CellError ? x.code : x)) : null;
    },
    dims: (cell: string) => {
      calc.get(id, cell);
      const at = calc.spillsOf(0).find((s) => `${String.fromCharCode(65 + s.c)}${s.r + 1}` === cell);
      return at ? `${at.sp.h}x${at.sp.w}` : null;
    },
  };
}
const one = (f: string, cells: Record<string, unknown> = {}) => sheet({ ...cells, Z1: `=${f}` }).v('Z1');
const arr = (f: string, cells: Record<string, unknown> = {}) => sheet({ ...cells, Z1: `=${f}` }).spill('Z1');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- LET, LAMBDA and the functions that call one ---------------------------------------------------------------------
{
  ok(one('LET(x, 5, y, x*2, x+y)') === 15, 'LET names values and works the last part out with them');
  ok(one('LET(r, A1:A3, SUM(r)*2)', { A1: 1, A2: 2, A3: 3 }) === 12, 'LET names a range');
  ok(one('LAMBDA(x, x*2)(5)') === 10 && one('LAMBDA(x, y, x+y)(2, 3)') === 5, 'a LAMBDA called where it is made');
  ok(err(one('LAMBDA(x, x*2)')) === '#CALC!', 'a LAMBDA never called is #CALC!');
  ok(one('LET(f, LAMBDA(x, x+1), f(f(1)))') === 3, 'a LAMBDA LET names is called by its name');
  ok(one('LAMBDA(a, b, IF(ISOMITTED(b), "none", b))(1)') === 'none', 'ISOMITTED tells an argument left out');
  ok(err(one('LAMBDA(x, x)(1, 2)')) === '#VALUE!', 'a LAMBDA called with too many arguments is #VALUE!');
  ok(same(arr('MAP(A1:A3, LAMBDA(v, v*10))', { A1: 1, A2: 2, A3: 3 }), [10, 20, 30]), 'MAP works a LAMBDA on each value');
  ok(same(arr('MAP({1,2}, {10,20}, LAMBDA(a, b, a+b))'), [11, 22]), 'MAP over two arrays');
  ok(one('REDUCE(0, A1:A3, LAMBDA(acc, v, acc+v))', { A1: 1, A2: 2, A3: 3 }) === 6, 'REDUCE adds each value to a total');
  ok(same(arr('REDUCE("", {"a","b"}, LAMBDA(acc, v, VSTACK(acc, v)))'), ['', 'a', 'b']), 'REDUCE may build an array');
  ok(same(arr('SCAN(0, {1,2,3}, LAMBDA(a, v, a+v))'), [1, 3, 6]), 'SCAN spills each step');
  ok(same(arr('BYROW(A1:B2, LAMBDA(r, SUM(r)))', { A1: 1, B1: 2, A2: 3, B2: 4 }), [3, 7]), 'BYROW: one result a row');
  ok(same(arr('BYCOL(A1:B2, LAMBDA(c, MAX(c)))', { A1: 1, B1: 2, A2: 3, B2: 4 }), [3, 4]), 'BYCOL: one result a column');
  const m = sheet({ A1: '=MAKEARRAY(2, 3, LAMBDA(r, c, r*c))' });
  ok(same(m.spill('A1'), [1, 2, 3, 2, 4, 6]) && m.dims('A1') === '2x3', 'MAKEARRAY');
}

// ---- arrays stacked, taken, picked, wrapped ---------------------------------------------------------------------------
{
  ok(same(arr('VSTACK({1,2},{3,4})'), [1, 2, 3, 4]) && same(arr('VSTACK({1,2},{3})'), [1, 2, 3, '#N/A']), 'VSTACK, padded with #N/A');
  ok(same(arr('HSTACK({1;2},{3;4})'), [1, 3, 2, 4]), 'HSTACK');
  const g = '{1,2,3;4,5,6}';
  ok(same(arr(`TAKE(${g}, 1)`), [1, 2, 3]) && same(arr(`TAKE(${g}, -1)`), [4, 5, 6]) && same(arr(`TAKE(${g},,2)`), [1, 2, 4, 5]), 'TAKE from the start, the end, or columns');
  ok(same(arr(`DROP(${g}, 1)`), [4, 5, 6]) && same(arr(`DROP(${g},,-1)`), [1, 2, 4, 5]), 'DROP');
  ok(err(one(`TAKE(${g}, 0)`)) === '#CALC!', 'TAKE of none is #CALC!');
  ok(same(arr(`CHOOSECOLS(${g}, 1, 3)`), [1, 3, 4, 6]) && same(arr(`CHOOSECOLS(${g}, -1)`), [3, 6]), 'CHOOSECOLS, negative from the end');
  ok(same(arr(`CHOOSEROWS(${g}, 2)`), [4, 5, 6]) && err(one(`CHOOSEROWS(${g}, 3)`)) === '#VALUE!', 'CHOOSEROWS');
  ok(same(arr('TOCOL({1,2;3,4})'), [1, 2, 3, 4]) && same(arr('TOCOL({1,2;3,4},,TRUE)'), [1, 3, 2, 4]), 'TOCOL by rows or by columns');
  ok(same(arr('TOROW(A1:B2, 1)', { A1: 1, B2: 4 }), [1, 4]), 'TOROW leaves blanks out with ignore 1');
  ok(same(arr('WRAPROWS({1,2,3,4,5}, 2)'), [1, 2, 3, 4, 5, '#N/A']) && sheet({ A1: '=WRAPROWS({1,2,3,4,5}, 2)' }).dims('A1') === '3x2', 'WRAPROWS');
  ok(same(arr('WRAPCOLS({1,2,3,4,5}, 2)'), [1, 3, 5, 2, 4, '#N/A']), 'WRAPCOLS');
  ok(same(arr('EXPAND({1,2;3,4}, 3, 3, 0)'), [1, 2, 0, 3, 4, 0, 0, 0, 0]), 'EXPAND, padded');
  ok(same(arr('TRANSPOSE({1,2,3})'), [1, 2, 3]) && sheet({ A1: '=TRANSPOSE({1,2,3})' }).dims('A1') === '3x1', 'TRANSPOSE');
  ok(same(arr('ARRAYFORMULA(A1:A3*2)', { A1: 1, A2: 2, A3: 3 }), [2, 4, 6]), 'ARRAYFORMULA spills arithmetic on ranges');
  ok(same(arr('ARRAYFORMULA(LEN(A1:A2))', { A1: 'ab', A2: 'abcd' }), [2, 4]), 'a function of one value works on each in an array formula');
  ok(one('SUM(LEN(A1:A2))', { A1: 'ab', A2: 'abcd' }) === 6, 'and inside SUM');
  ok(one('LEN(A1:A2)', { A1: 'ab', A2: 'abcd' }) === 2, 'outside them, a range gives its first value as before');
  ok(same(arr('FREQUENCY({1,2,2,5,8}, {2,5})'), [3, 1, 1]), 'FREQUENCY');
}

// ---- words: split, before and after, regular expressions ---------------------------------------------------------------
{
  ok(same(arr('TEXTSPLIT("a,b,c", ",")'), ['a', 'b', 'c']), 'TEXTSPLIT into columns');
  const t = sheet({ A1: '=TEXTSPLIT("a,b;c,d", ",", ";")' });
  ok(same(t.spill('A1'), ['a', 'b', 'c', 'd']) && t.dims('A1') === '2x2', 'TEXTSPLIT into columns and rows');
  ok(same(arr('TEXTSPLIT("a,,b", ",",, TRUE)'), ['a', 'b']), 'TEXTSPLIT leaving empty ones out');
  ok(one('TEXTBEFORE("Red riding hood", " ")') === 'Red' && one('TEXTAFTER("Red riding hood", " ")') === 'riding hood', 'TEXTBEFORE and TEXTAFTER');
  ok(one('TEXTAFTER("Red riding hood", " ", -1)') === 'hood' && one('TEXTBEFORE("a-b-c", "-", 2)') === 'a-b', 'their instance, from the end too');
  ok(err(one('TEXTBEFORE("abc", "x")')) === '#N/A' && one('TEXTBEFORE("abc", "x",,,, "none")') === 'none', 'not found: #N/A or what is said');
  ok(one('TEXTAFTER("ID: 42", "id: ",, 1)') === '42', 'ignoring case');
  ok(same(arr('SPLIT("1,2,3", ",")'), [1, 2, 3]), 'SPLIT gives numbers as numbers');
  ok(same(arr('SPLIT("a, b", ", ")'), ['a', 'b']) && same(arr('SPLIT("a, b", ", ", FALSE)'), ['a', 'b']), 'SPLIT at each character, or at the whole delimiter');
  ok(one('JOIN("-", {1,2,3})') === '1-2-3', 'JOIN');
  ok(one('REGEXMATCH("abc123", "\\d+")') === true && one('REGEXMATCH("abc", "\\d")') === false, 'REGEXMATCH');
  ok(one('REGEXTEST("ABC", "abc", 1)') === true && one('REGEXTEST("ABC", "abc")') === false, 'REGEXTEST, case or not');
  ok(one('REGEXEXTRACT("abc123def", "\\d+")') === '123', 'REGEXEXTRACT the first match');
  ok(same(arr('REGEXEXTRACT("Order 42-X", "(\\d+)-(\\w)")'), ['42', 'X']), 'REGEXEXTRACT its groups when the pattern has some');
  ok(same(arr('REGEXEXTRACT("a1 b22 c3", "\\d+", 1)'), ['1', '22', '3']), 'REGEXEXTRACT every match');
  ok(err(one('REGEXEXTRACT("abc", "\\d")')) === '#N/A', 'no match: #N/A');
  ok(one('REGEXREPLACE("a1b2", "\\d", "#")') === 'a#b#' && one('REGEXREPLACE("a1b2", "\\d", "#", 2)') === 'a1b#', 'REGEXREPLACE all, or one');
  ok(one('REGEXREPLACE("2026-11-06", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1")') === '06/11/2026', 'REGEXREPLACE with groups');
  ok(err(one('REGEXMATCH("a", "(")')) === '#VALUE!', 'a pattern that cannot be read is #VALUE!');
}

// ---- statistics, fits and dates ------------------------------------------------------------------------------------
{
  ok(near(one('PERCENTILE({1,2,3,4}, 0.25)'), 1.75) && near(one('PERCENTILE.EXC({1,2,3,4}, 0.25)'), 1.25), 'PERCENTILE and PERCENTILE.EXC');
  ok(near(one('QUARTILE({1,2,3,4,5,6,7,8}, 1)'), 2.75) && near(one('QUARTILE.EXC({1,2,3,4,5,6,7,8}, 1)'), 2.25), 'QUARTILE and QUARTILE.EXC');
  ok(one('RANK(3, {1,3,3,5})') === 2 && one('RANK(3, {1,3,3,5}, 1)') === 2 && one('RANK.AVG(3, {1,3,3,5})') === 2.5, 'RANK, RANK.AVG');
  ok(near(one('PERCENTRANK({1,2,3,4,5}, 4)'), 0.75) && near(one('PERCENTRANK.EXC({1,2,3,4,5}, 4)'), 0.666), 'PERCENTRANK');
  ok(near(one('FORECAST(30, {6,7,9,15,21}, {20,28,31,38,40})'), 10.607253) && near(one('FORECAST.LINEAR(30, {6,7,9,15,21}, {20,28,31,38,40})'), 10.607253), 'FORECAST (Excel’s example)');
  ok(near(one('SLOPE({2,3,9,1,8,7,5}, {6,5,11,7,5,4,4})'), 0.305556), 'SLOPE (Excel’s example)');
  ok(near(one('INTERCEPT({2,3,9,1,8}, {6,5,11,7,5})'), 0.0483871), 'INTERCEPT (Excel’s example)');
  ok(near(one('CORREL({3,2,4,5,6}, {9,7,12,15,17})'), 0.997054) && near(one('PEARSON({9,7,5,3,1}, {10,6,1,5,3})'), 0.699379), 'CORREL and PEARSON (Excel’s examples)');
  ok(near(one('RSQ({2,3,9,1,8,7,5}, {6,5,11,7,5,4,4})'), 0.05795, 1e-4) && near(one('STEYX({2,3,9,1,8,7,5}, {6,5,11,7,5,4,4})'), 3.305719), 'RSQ and STEYX (Excel’s examples)');
  ok(near(one('COVARIANCE.P({3,2,4,5,6}, {9,7,12,15,17})'), 5.2) && near(one('COVARIANCE.S({2,4,8}, {5,11,12})'), 9.666666667), 'COVARIANCE.P and .S (Excel’s examples)');
  ok(same(arr('TREND({2,4,6}, {1,2,3}, {4,5})'), [8, 10]), 'TREND at new x');
  const fit = arr('LINEST({1,3,2,5,4}, {1,2,3,4,5}, TRUE, TRUE)') as number[];
  ok(
    !!fit && near(fit[0], 0.8) && near(fit[1], 0.6) && near(fit[2], 0.34641) && near(fit[3], 1.1489125) && near(fit[4], 0.64) && near(fit[5], 1.095445) && near(fit[6], 5.333333) && fit[7] === 3 && near(fit[8], 6.4) && near(fit[9], 3.6),
    'LINEST with its statistics',
  );
  const two = arr('LINEST({7;10;13;20}, {1,2;2,3;3,4;5,7})') as number[];
  ok(!!two && two.length === 3, 'LINEST of two variables gives three coefficients');
  ok(near(arr('GROWTH({2,4,8}, {1,2,3}, {4})')?.[0] as number, 16) || near(one('GROWTH({2,4,8}, {1,2,3}, 4)'), 16), 'GROWTH');
  const s = sheet({ A1: 2, A2: true, A3: 'x', B1: '=AVERAGEA(A1:A3)', B2: '=STDEVA(A1:A3)', B3: '=VARPA(A1:A3)', B4: '=MAXA(A1:A3)' });
  ok(s.v('B1') === 1 && near(s.v('B2'), 1) && near(s.v('B3'), 2 / 3) && s.v('B4') === 2, 'the A functions count words as 0 and TRUE as 1');
  ok(near(one('DEVSQ(4,5,8,7,11,4,3)'), 48) && near(one('GEOMEAN(4,5,8,7,11,4,3)'), 5.476987), 'DEVSQ and GEOMEAN (Excel’s examples)');
  ok(one('NETWORKDAYS(DATE(2026,1,1), DATE(2026,1,31))') === 22 && one('NETWORKDAYS.INTL(DATE(2026,1,1), DATE(2026,1,31), 11)') === 27, 'NETWORKDAYS and .INTL with Sundays off');
  ok(one('NETWORKDAYS.INTL(DATE(2026,1,1), DATE(2026,1,31), "0000011")') === 22, 'a weekend as seven 0s and 1s');
  ok(one('WORKDAY(DATE(2026,1,2), 1)') === one('DATE(2026,1,5)') && one('WORKDAY.INTL(DATE(2026,1,2), 1, 11)') === one('DATE(2026,1,3)'), 'WORKDAY and .INTL');
  ok(one('EDATE(DATE(2026,1,31), 1)') === one('DATE(2026,2,28)') && one('EOMONTH(DATE(2026,1,15), 0)') === one('DATE(2026,1,31)'), 'EDATE and EOMONTH');
  ok(one('MAXIFS(B1:B3, A1:A3, "a")', { A1: 'a', A2: 'b', A3: 'a', B1: 4, B2: 9, B3: 6 }) === 6, 'MAXIFS');
}

// ---- AI answers kept by what was asked -----------------------------------------------------------------------------
{
  const cells = { A1: 'Paris', B1: '=AI("Which country is this city in?", A1)' };
  const s = sheet(cells);
  ok(err(s.v('B1')) === '#BUSY!', 'an AI cell without its answer is #BUSY!');
  const asks = s.calc.aiAsks();
  ok(asks.length === 1 && asks[0].cell === 'B1' && asks[0].prompt === 'Which country is this city in?' && asks[0].context[0] === 'Paris', 'it asks its prompt with its cells’ values');
  const key = asks[0].key;
  ok(key === aiKey('Which country is this city in?', ['Paris']), 'its key is its prompt and values');
  const answered = sheet(cells, { ai: { [key]: 'France' } });
  ok(answered.v('B1') === 'France' && answered.calc.aiAsks().length === 0, 'with its answer kept, it shows it and asks nothing');
  const moved = sheet({ ...cells, A1: 'Rome' }, { ai: { [key]: 'France' } });
  ok(err(moved.v('B1')) === '#BUSY!' && moved.calc.aiAsks().length === 1, 'its cell changed: asked again');
  ok(sheet({ ...cells, C1: '=AI("Which country is this city in?", A1)' }, { ai: { [key]: 'France' } }).v('C1') === 'France', 'another cell asking the same shares the answer');
  ok(err(sheet({ A1: '=1/0', B1: '=AI("x", A1)' }).v('B1')) === '#DIV/0!', 'an error among its cells is its error, asked nothing');
  const text = bookText(answered.book);
  ok(text.includes('"ai":{') && normalizeBook(JSON.parse(text)).ai?.[key] === 'France', 'the answers are kept with the workbook');
}

// ---- links, pictures and sparklines in cells -------------------------------------------------------------------------
{
  const s = sheet({
    A1: '=HYPERLINK("https://example.com", "Site")',
    A2: { v: 'Docs', link: 'example.com/docs' },
    A3: '=IMAGE("https://example.com/cat.png", "A cat")',
    A4: '=IMAGE("https://example.com/cat.png", 2)',
    A5: '=SPARKLINE({1,3,2,5}, {"charttype","column";"color","red"})',
    A6: { v: 'x', link: 'javascript:alert(1)' },
  });
  ok(s.v('A1') === 'Site' && s.calc.special(0, 0, 0)?.kind === 'link', 'HYPERLINK shows its label and links');
  const l = s.calc.special(0, 1, 0);
  ok(l?.kind === 'link' && l.url === 'https://example.com/docs', 'a cell’s own link, a bare address as https');
  const im = s.calc.special(0, 2, 0);
  ok(s.v('A3') === 'A cat' && im?.kind === 'image' && im.alt === 'A cat' && im.fit === 'fit', 'IMAGE as Excel writes it');
  const im2 = s.calc.special(0, 3, 0);
  ok(im2?.kind === 'image' && im2.fit === 'fill', 'IMAGE with Google Sheets’ mode');
  const sp = s.calc.special(0, 4, 0);
  ok(sp?.kind === 'spark' && sp.type === 'column' && sp.color === '#ff0000' && same(sp.values, [1, 3, 2, 5]), 'SPARKLINE’s numbers and options');
  ok(!s.book.sheets[0].cells.A6.link, 'a link that is no web address is not kept');
}

// ---- named ranges ------------------------------------------------------------------------------------------------------
{
  const names = [
    { name: 'Rate', ref: "Sheet1!$B$1" },
    { name: 'Sales', ref: 'Sheet1!$A$2:$A$4' },
    { name: 'Double', ref: 'LAMBDA(x, x*2)' },
  ];
  const s = sheet({ B1: 0.5, A2: 10, A3: 20, A4: 30, C1: '=A2*Rate', C2: '=SUM(Sales)', C3: '=Double(21)', C4: '=rate*2', C5: '=Nope*2' }, { names });
  ok(s.v('C1') === 5 && s.v('C2') === 60 && s.v('C3') === 42 && s.v('C4') === 1, 'names in formulas: a cell, a range, a LAMBDA, in any case');
  ok(err(s.v('C5')) === '#NAME?', 'a name that is not there is #NAME?');
  ok(isRangeName('TaxRate') && !isRangeName('A1') && !isRangeName('TRUE') && !isRangeName('R1C1') && !isRangeName('1x'), 'what may be a name');
  const kept = normalizeBook(JSON.parse(bookText(s.book)));
  ok(kept.names?.length === 3 && kept.names[0].ref === 'Sheet1!$B$1', 'names are kept with the workbook');
  const id = s.book.sheets[0].id;
  const down = adjustForInsert(s.book, id, 'row', 0, 2);
  ok(down.names?.find((n) => n.name === 'Rate')?.ref === 'Sheet1!$B$3' && down.names?.find((n) => n.name === 'Sales')?.ref === 'Sheet1!$A$4:$A$6', 'rows put in above: names follow their cells');
  const cut = adjustForDelete(s.book, id, 'row', 2, 1);
  ok(cut.names?.find((n) => n.name === 'Sales')?.ref === 'Sheet1!$A$2:$A$3', 'a row taken out of a named range shrinks it');
  const renamed = renameSheet(s.book, id, 'Prices');
  ok(renamed.names?.find((n) => n.name === 'Rate')?.ref === 'Prices!$B$1', 'a sheet renamed: names that point at it follow');
  const rn = renameName(s.book, 'rate', 'TaxRate');
  ok(rn.names?.some((n) => n.name === 'TaxRate') && rn.sheets[0].cells.C1.f === 'A2*TaxRate' && rn.sheets[0].cells.C4.f === 'TaxRate*2', 'a name renamed: the formulas that use it follow');
  const scoped = sheet({ B1: 2, C1: '=Rate*10' }, { names: [{ name: 'Rate', ref: '1' }, { name: 'Rate', ref: 'Sheet1!$B$1', sheet: 'Sheet1' }] });
  ok(scoped.v('C1') === 20, 'a sheet’s own name goes before the workbook’s');
}

// ---- formulas as Excel's files write them ---------------------------------------------------------------------------
{
  const sh = new Set(['sheet1']);
  ok(excelFormula('LET(x,1,x+1)', sh) === '_xlfn.LET(_xlpm.x,1,_xlpm.x+1)', 'LET: the function prefixed, its names as _xlpm');
  ok(excelFormula('LAMBDA(x,x*2)(A1)', sh) === '_xlfn.LAMBDA(_xlpm.x,_xlpm.x*2)(A1)', 'LAMBDA called where it is made');
  ok(excelFormula('LET(f,LAMBDA(x,x+1),f(2))', sh) === '_xlfn.LET(_xlpm.f,_xlfn.LAMBDA(_xlpm.x,_xlpm.x+1),_xlpm.f(2))', 'a LAMBDA LET names, called');
  ok(excelFormula('Rate*LET(x,1,x)', sh, new Set(['rate'])) === 'Rate*_xlfn.LET(_xlpm.x,1,_xlpm.x)', 'a named range stays as it is');
  ok(excelFormula('JOIN("-",A1:A3)', sh) === '_xlfn.TEXTJOIN("-",FALSE,A1:A3)', 'JOIN as TEXTJOIN');
  ok(excelFormula('REGEXMATCH(A1,"a")', sh) === '_xlfn.REGEXTEST(A1,"a")', 'REGEXMATCH as REGEXTEST');
  ok(excelFormula('SPLIT(A1,",")', sh) === '_xlfn.TEXTSPLIT(A1,",",,TRUE)' && excelFormula('SPLIT(A1,", ")', sh) === '_xlfn.TEXTSPLIT(A1,{","," "},,TRUE)', 'SPLIT as TEXTSPLIT');
  ok(excelFormula('ARRAYFORMULA(A1:A3*2)', sh) === '(A1:A3*2)', 'ARRAYFORMULA left off');
  ok(excelFormula('REGEXEXTRACT(A1,"(\\d+)")', sh) === '_xlfn.REGEXEXTRACT(A1,"(\\d+)",2)', 'REGEXEXTRACT with groups says so');
  ok(excelFormula('IMAGE("https://x/y.png",2)', sh) === '_xlfn.IMAGE("https://x/y.png","",1)', 'IMAGE’s mode as its sizing');
  ok(excelFormula('AI("x",A1)', sh) === null && excelFormula('SPARKLINE(A1:A3)', sh) === null, 'AI and SPARKLINE: none in Excel');
  ok(excelFormula('VSTACK(A1:A2,B1:B2)+Other!A1', sh) === '_xlfn.VSTACK(A1:A2,B1:B2)+#REF!', 'newer functions prefixed; a sheet not there #REF!');
  ok(formulaFromFile('_xlfn.LET(_xlpm.x,1,_xlpm.x+1)') === 'LET(x,1,x+1)' && formulaFromFile('_xlfn.LET(_xlpm.f,_xlfn.LAMBDA(_xlpm.x,_xlpm.x+1),_xlpm.f(2))') === 'LET(f,LAMBDA(x,x+1),f(2))', 'and read back without them');
}

// ---- Excel files: names, links, AI cells, the newer functions --------------------------------------------------------
{
  const s = sheet(
    {
      A1: 0.2,
      A2: { v: 'Site', link: 'https://example.com/a?b=1&c=2' },
      A3: { v: 'There', link: "#'Sheet1'!A1" },
      B1: '=LET(x, A1, x*Rate)',
      B2: '=AI("Say hi", A1)',
      B3: '=VSTACK(1, 2)',
      C1: '=JOIN("-", A1, A1)',
    },
    { names: [{ name: 'Rate', ref: 'Sheet1!$A$1' }], ai: { [aiKey('Say hi', ['0.2'])]: 'Hi' } },
  );
  s.book.sheets[0].noGrid = true;
  const buf = xlsxOfBook(s.book, 'T', s.calc);
  const z = new Zip(buf);
  const sx = z.text('xl/worksheets/sheet1.xml') ?? '';
  const wb = z.text('xl/workbook.xml') ?? '';
  ok(sx.includes('_xlfn.LET(_xlpm.x, A1, _xlpm.x*Rate)'), 'LET written as Excel writes it, the name Rate as it is');
  ok(/<c r="B2"[^>]*t="s"><v>\d+<\/v><\/c>/.test(sx) && !sx.includes('AI('), 'an AI cell written as its answer');
  ok(sx.includes('_xlfn.TEXTJOIN(&quot;-&quot;,FALSE, A1, A1)') && sx.includes('_xlfn.VSTACK'), 'JOIN as TEXTJOIN, VSTACK prefixed');
  ok(/<definedName name="Rate">Sheet1!\$A\$1<\/definedName>/.test(wb), 'the named range in the workbook');
  ok(sx.includes('showGridLines="0"') && /<hyperlink ref="A2" r:id="rId\d+"\/>/.test(sx) && sx.includes(`location="'Sheet1'!A1"`), 'links and hidden grid lines in the sheet');
  const back = importBook(buf, 'T.xlsx').book;
  const c = back.sheets[0].cells;
  ok(back.names?.[0]?.name === 'Rate' && c.B1.f === 'LET(x, A1, x*Rate)' && c.A2.link === 'https://example.com/a?b=1&c=2' && c.A3.link === "#'Sheet1'!A1" && back.sheets[0].noGrid === true, 'and read back: names, LET, links, hidden grid lines');
  ok(near(computeBook(back).get(back.sheets[0].id, 'B1'), 0.04), 'the name works in the file read back');
}

// ---- groups of rows and columns, protected cells ---------------------------------------------------------------------
{
  const b = normalizeBook({ sheets: [{ name: 'G', cells: { A1: 1 }, groups: [{ range: '2:9' }, '4:5', { range: 'C:E' }, { range: '9x' }], protect: [{ range: 'A1:B2' }, { range: 'D1', warn: true, note: 'Totals' }] }] });
  const sh = b.sheets[0];
  ok(sh.groups?.length === 3 && sh.groups[1].range === '4:5', 'groups as kept: rows and columns, a broken one left out');
  const sp = spansOf(sh);
  ok(sp.rows.length === 2 && sp.rows.find((x) => x.a === 3)?.level === 2 && sp.cols[0].a === 2 && sp.cols[0].b === 4, 'a group inside another is a level deeper');
  ok(addGroup(sh, 'row', 2, 3) === null && addGroup(sh, 'row', 5, 7)?.length === 4, 'a group may not cross another, but may sit inside one');
  ok(removeGroup(sh, 'row', 3, 4)?.length === 2, 'ungrouped: the group there');
  const folded = foldGroup(sh, 0, true);
  ok(folded.rows?.[1]?.hidden && folded.rows?.[8]?.hidden && folded.groups?.[0].hidden, 'folded: its rows hidden');
  const inner = foldGroup({ ...sh, ...folded, groups: folded.groups!.map((g, i) => (i === 1 ? { ...g, hidden: true } : g)) }, 0, false);
  ok(!inner.rows?.[1]?.hidden && inner.rows?.[3]?.hidden && inner.rows?.[4]?.hidden, 'shown again: but the rows of a folded group inside it');
  const down = adjustForInsert(b, sh.id, 'row', 0, 1).sheets[0];
  ok(down.groups?.[0].range === '3:10' && down.protect?.[0].range === 'A2:B3', 'rows put in above: groups and protected ranges follow');
  ok(protectionAt(sh, 0, 0)?.range === 'A1:B2' && protectionAt(sh, 0, 3)?.warn && protectionAt(sh, 5, 5) === null, 'which cells are protected');
  ok(!!guardOf(sh, [[1, 1]]).refuse && !!guardOf(sh, [[0, 3]]).warn && !guardOf(sh, [[9, 9]]).refuse, 'a change refused, warned of, or let through');
  const whole = { ...sh, protect: [{ except: 'B2:B9' }] };
  ok(protectionAt(whole, 0, 0) !== null && protectionAt(whole, 3, 1) === null, 'a whole sheet but the cells it leaves open');
  const x = xlsxOfBook({ v: 1, sheets: [{ ...sh, groups: [{ range: '2:9' }, { range: '4:5', hidden: true }, { range: 'C:E' }], rows: { 3: { hidden: true }, 4: { hidden: true } }, protect: [{ except: 'B2:B9' }] }] }, 'G');
  const sx = new Zip(x).text('xl/worksheets/sheet1.xml') ?? '';
  ok(/<row r="4"[^>]*hidden="1"[^>]*outlineLevel="2"/.test(sx) && sx.includes('outlineLevelRow="2"') && /<col min="3" max="3"[^>]*outlineLevel="1"/.test(sx), 'Excel: rows and columns with their outline levels');
  ok(sx.includes('<sheetProtection sheet="1"') && sx.includes('<protectedRange sqref="B2:B9"'), 'Excel: a protected sheet, its open cells as ranges to edit');
  const back = importBook(x, 'G.xlsx').book.sheets[0];
  ok(back.groups?.some((g) => g.range === '2:9') && back.groups?.some((g) => g.range === '4:5' && g.hidden) && back.groups?.some((g) => g.range === 'C:E'), 'and read back: the groups, folded or not');
  ok(back.protect?.[0]?.except === 'B2:B9' && !back.protect[0].range, 'and the sheet’s protection');
}

// ---- charts: combo, histogram, bubble, radar, 100% stacked, trendlines, labels, axis limits, a second axis ----------------
{
  const rows = [['Month', 'Sales', 'Margin', 'Size'], ['Jan', 120, 0.2, 5], ['Feb', 150, 0.25, 9], ['Mar', 90, 0.15, 3], ['Apr', 200, 0.3, 12]];
  const b = normalizeBook({
    sheets: [
      {
        name: 'C',
        rows,
        charts: [
          { kind: 'combo', range: 'A1:C5', at: 'F2:L16', series: [{}, { type: 'line', axis: 2, trend: 'linear' }], values: true, min: 0, max: 250 },
          { kind: 'histogram', range: 'B1:B5', at: 'F18:L30', bins: 3 },
          { kind: 'bubble', range: 'B1:D5', at: 'N2:T16' },
          { kind: 'radar', range: 'A1:B5', at: 'N18:T30' },
          { kind: 'column', range: 'A1:C5', at: 'F32:L44', stacked: 'percent' },
        ],
      },
    ],
  });
  const ch = b.sheets[0].charts!;
  ok(ch[0].kind === 'combo' && ch[0].series?.[1]?.type === 'line' && ch[0].series[1].axis === 2 && ch[0].series[1].trend === 'linear' && ch[0].values && ch[0].min === 0 && ch[0].max === 250, 'a combo chart’s options kept');
  ok(ch[1].kind === 'histogram' && ch[1].bins === 3 && ch[4].percent && ch[4].stacked, 'a histogram’s bins, a 100% stacked chart');
  const calc = computeBook(b);
  const svg = (i: number) => chartSvg(ch[i], chartData(b, calc, 0, ch[i]), 480, 300);
  const combo = svg(0);
  ok((combo.match(/<rect /g) ?? []).length >= 4 && combo.includes('stroke-dasharray="5 4"') && combo.includes('>150<'), 'combo: columns, a line, its trendline dashed, the values written');
  const hg = histogramOf([1, 2, 2, 3, 9, 10], 3);
  ok(same(hg.counts, [4, 0, 2]) && hg.labels.length === 3, 'a histogram’s bins');
  ok((svg(1).match(/<rect /g) ?? []).length >= 3, 'a histogram drawn');
  ok((svg(2).match(/<circle /g) ?? []).length === 4, 'a bubble chart: a bubble a row');
  ok(svg(3).includes('Z" fill=') && svg(3).includes('>Feb<'), 'a radar chart: a shape round its labels');
  ok(svg(4).includes('>100%<'), 'a 100% stacked chart’s axis in percents');
  const x = new Zip(xlsxOfBook(b, 'C'));
  const part = (n: number) => x.text(`xl/charts/chart${n}.xml`) ?? '';
  ok(part(1).includes('<c:barChart>') && part(1).includes('<c:lineChart>') && part(1).includes('<c:axId val="50010004"/>') && part(1).includes('<c:trendlineType val="linear"/>') && part(1).includes('<c:showVal val="1"/>') && part(1).includes('<c:max val="250"/>'), 'Excel: a combo with a second axis, a trendline, values and an axis maximum');
  ok(part(2).includes('<c:gapWidth val="0"/>') && part(2).includes('<c:numLit>'), 'Excel: a histogram as columns of its bins');
  ok(part(3).includes('<c:bubbleChart>') && part(3).includes('<c:bubbleSize>') && part(4).includes('<c:radarChart>') && part(5).includes('percentStacked'), 'Excel: bubbles, radar, 100% stacked');
  const back = importBook(xlsxOfBook(b, 'C'), 'C.xlsx').book.sheets[0].charts ?? [];
  const k = back.map((c) => c.kind).join(',');
  ok(k.includes('combo') && k.includes('bubble') && k.includes('radar'), `read back: ${k}`);
  const cb = back.find((c) => c.kind === 'combo');
  ok(cb?.series?.[1]?.type === 'line' && cb.series[1].axis === 2 && cb.series[1].trend === 'linear' && cb.values && cb.max === 250, 'and the combo’s options');
  ok(back.find((c) => c.kind === 'column')?.percent === true, 'and 100% stacked');
}

// ---- goal seek, traces, pivot tables ---------------------------------------------------------------------------------
{
  // A loan: what rate makes the payment 500?
  const g = sheet({ A1: 0.05, A2: 60, A3: 25000, B1: '=-PMT(A1/12, A2, A3)', C1: '=B1*A2', D1: '=SUM(A1:A3)' });
  const r = goalSeek(g.book, 0, 'B1', 500, 'A1');
  ok(!!r && r.reached && Math.abs(r.value - 0.07420) < 1e-4, `goal seek finds the rate (${r?.value})`);
  const sq = goalSeek(sheet({ A1: 1, B1: '=A1*A1' }).book, 0, 'B1', 49, 'A1');
  ok(!!sq && sq.reached && Math.abs(Math.abs(sq.value) - 7) < 1e-6, 'goal seek: a square');
  ok(precedents(g.book, 0, 'B1').length === 3 && precedents(g.book, 0, 'D1')[0].x.r2 === 2, 'trace precedents: the cells a formula uses');
  const deps = dependents(g.book, 0, 'A2').map((d) => d.cell).sort();
  ok(same(deps, ['B1', 'C1', 'D1']), 'trace dependents: the formulas that use a cell');
  const t = sheet({
    A1: 'Region', B1: 'Kind', C1: 'Sales',
    A2: 'North', B2: 'Tea', C2: 10,
    A3: 'South', B3: 'Tea', C3: 20,
    A4: 'North', B4: 'Coffee', C4: 5,
    A5: 'North', B5: 'Tea', C5: 7,
    A6: 'West', B6: 'Coffee', C6: 100,
  });
  const def = { source: 'Sheet1!A1:C6', rows: ['A'], cols: 'B', values: [{ col: 'C', fn: 'sum' as const }], filters: [{ col: 'A', hide: ['West'] }] };
  const p = pivotSheet(t.book, t.calc, def, 'Pivot');
  ok(!!p && p.pivot?.cols === 'B' && p.cells.A2.v === 'North' && p.cells.A3.v === 'South' && p.cells.A4.v === 'Total', 'a pivot table: a row a region, then the totals');
  const both = normalizeBook({ sheets: [t.book.sheets[0], { ...p!, id: 'pv' }] });
  const pc = computeBook(both);
  const val = (cell: string) => pc.get('pv', cell);
  // Columns: Coffee then Tea; West left out by the filter (its row stays, with nothing counted).
  ok(p!.cells.B1.v === 'Sum of Sales · Coffee' && val('B2') === 5 && val('C2') === 17 && val('C3') === 20, 'its values, by region and kind');
  const westRow = Object.entries(p!.cells).find(([, c]) => c.v === 'West')?.[0];
  ok(!westRow && val('B4') === 5, 'the filter leaves West out, and its sales from the totals');
  ok(same(pivotValues(t.book, t.calc, def, 'A'), ['North', 'South', 'West']), 'a column’s values, for its filter');
  const kept = normalizeBook(JSON.parse(bookText(both)));
  ok(kept.sheets[1].pivot?.filters?.[0].hide[0] === 'West', 'its settings are kept with its sheet');
}

// ---- print and PDF setup ----------------------------------------------------------------------------------------------
{
  const b = normalizeBook({ sheets: [{ name: 'P', rows: [['Item', 'Cost', 'Note'], ['Tea', 3, 'keep'], ['Cake', 5, 'far away'], ['Jam', 2, 'x']], print: { orient: 'landscape', area: 'A2:B3', titles: 1, grid: false, fit: 'page' } }] });
  ok(b.sheets[0].print?.orient === 'landscape' && b.sheets[0].print.area === 'A2:B3' && b.sheets[0].print.titles === 1 && b.sheets[0].print.grid === false, 'a print setup as kept');
  const page = bookPage(b, 'P', 'print');
  ok(page.includes('nb-land') && page.includes('nb-nogrid') && page.includes('>Tea<') && page.includes('>Item<') && !page.includes('far away') && !page.includes('>Jam<'), 'printed: across, no lines, the print area under its header row');
  const sx = new Zip(xlsxOfBook(b, 'P')).text('xl/worksheets/sheet1.xml') ?? '';
  const wb = new Zip(xlsxOfBook(b, 'P')).text('xl/workbook.xml') ?? '';
  ok(sx.includes('orientation="landscape"') && sx.includes('fitToHeight="1"') && !sx.includes('gridLines="1"') && wb.includes('_xlnm.Print_Area') && wb.includes('P!$A$2:$B$3'), 'Excel: its page setup and print area');
  const back = importBook(xlsxOfBook(b, 'P'), 'P.xlsx').book.sheets[0].print;
  ok(back?.orient === 'landscape' && back.area === 'A2:B3' && back.grid === false && back.fit === 'page', 'and read back');
}

// ---- cells and lines moved (Cut and Paste, drag) ---------------------------------------------------------------------
{
  const mk = () =>
    normalizeBook({
      sheets: [
        { name: 'Sheet1', cells: { A1: 5, A2: 7, A3: '=A1+A2', B1: '=SUM(A1:A2)', B2: '=SUM(A1:A3)', C1: '=Sheet2!A1', D1: { v: 1, s: { b: true }, note: 'n' }, E1: '=$A$1*2' }, conditional: [{ range: 'A1:A2', when: { op: 'gt', a: '3' }, style: { fill: '#ff0000' } }], charts: [{ range: 'A1:A2', kind: 'column', from: { cell: 'G1' }, to: { cell: 'L9' } }] },
        { name: 'Sheet2', cells: { A1: 9, B1: '=Sheet1!A1+Sheet1!A2', B2: '=Sheet1!A1:A2' } },
      ],
      names: [{ name: 'Pair', ref: 'Sheet1!$A$1:$A$2' }],
    });
  const b0 = mk();
  const [s1, s2] = b0.sheets.map((s) => s.id);
  // Cut A1:A2 and paste at F1 on the same sheet.
  const m = adjustForMove(b0, { sheet: s1, x: { r1: 0, c1: 0, r2: 1, c2: 0 } }, { sheet: s1, r: 0, c: 5 });
  const c = computeBook(m);
  const cells = m.sheets[0].cells;
  ok(!cells.A1 && !cells.A2 && cells.F1?.v === 5 && cells.F2?.v === 7, 'cut: the cells leave and arrive where they go');
  ok(cells.A3.f === 'F1+F2', 'cut: a formula on the cells that moved follows them');
  ok(cells.B1.f === 'SUM(F1:F2)' && c.get(s1, 'B1') === 12, 'cut: a range all of whose cells moved follows, and still adds them up');
  ok(cells.B2.f === 'SUM(A1:A3)', 'cut: a range only partly moved stays');
  ok(cells.E1.f === '$F$1*2' && c.get(s1, 'E1') === 10, 'cut: a fixed ($) reference follows too');
  ok(m.sheets[1].cells.B1.f === 'Sheet1!F1+Sheet1!F2' && c.get(s2, 'B1') === 12 && m.sheets[1].cells.B2.f === 'Sheet1!F1:F2', 'cut: formulas on other sheets follow');
  ok(cells.D1.s?.b && cells.D1.note === 'n', 'cut: cells outside stay as they were');
  ok(m.names?.[0].ref === 'Sheet1!$F$1:$F$2', 'cut: named ranges follow');
  ok(m.sheets[0].conditional?.[0].range === 'F1:F2', 'cut: a rule covering just the cells follows them');
  ok(m.sheets[0].charts?.[0].range === 'F1:F2', 'cut: a chart’s range follows');
  // Cut onto another sheet.
  const x = adjustForMove(b0, { sheet: s1, x: { r1: 0, c1: 0, r2: 2, c2: 0 } }, { sheet: s2, r: 4, c: 1 });
  const xc = computeBook(x);
  ok(x.sheets[1].cells.B5?.v === 5 && x.sheets[1].cells.B7?.f === 'B5+B6', 'cut to another sheet: cells arrive, formulas among them follow');
  ok(x.sheets[0].cells.B1.f === 'SUM(Sheet2!B5:B6)' && xc.get(s1, 'B1') === 12, 'cut to another sheet: references from the old sheet name the new one');
  ok(x.sheets[1].cells.B1.f === 'B5+B6' && xc.get(s2, 'B1') === 12, 'cut to another sheet: and from the new one');
  ok(x.sheets[0].cells.C1.f === 'Sheet2!A1', 'cut to another sheet: other references stay');
  const carried = adjustForMove(b0, { sheet: s1, x: { r1: 0, c1: 1, r2: 0, c2: 1 } }, { sheet: s2, r: 8, c: 0 });
  ok(carried.sheets[1].cells.A9.f === 'SUM(Sheet1!A1:A2)', 'cut to another sheet: a formula carried keeps pointing at the cells it did');
  // Over what was there, with comments.
  const withNotes = normalizeBook({ sheets: [{ name: 'S', cells: { A1: 1, B1: 'old', C1: '=B1' }, comments: [{ id: 'c1', cell: 'A1', by: 'person', text: 'hi', at: 1 }, { id: 'c2', cell: 'B1', by: 'person', text: 'gone', at: 1 }] }] });
  const over = adjustForMove(withNotes, { sheet: withNotes.sheets[0].id, x: { r1: 0, c1: 0, r2: 0, c2: 0 } }, { sheet: withNotes.sheets[0].id, r: 0, c: 1 });
  ok(over.sheets[0].cells.B1.v === 1 && !over.sheets[0].cells.A1 && over.sheets[0].cells.C1.f === 'B1', 'cut over a cell: it is replaced (what pointed there now finds the new one)');
  ok(over.sheets[0].comments?.length === 1 && over.sheets[0].comments[0].cell === 'B1' && over.sheets[0].comments[0].id === 'c1', 'cut: a comment goes with its cell, the one it lands on is replaced');
  ok(adjustForMove(b0, { sheet: s1, x: { r1: 0, c1: 0, r2: 0, c2: 0 } }, { sheet: s1, r: 0, c: 0 }) === b0, 'cut onto itself changes nothing');

  // Whole rows moved.
  const rows = normalizeBook({ sheets: [{ name: 'R', cells: { A1: 'a', A2: 'b', A3: 'c', A4: 'd', B1: '=A1', B4: '=SUM(A1:A4)', C1: '=A2' }, rows: { 1: { h: 40 } } }] });
  const rid = rows.sheets[0].id;
  const down = adjustForMoveLines(rows, rid, 'row', 1, 1, 4);
  const dc = down.sheets[0].cells;
  ok(dc.A1.v === 'a' && dc.A2.v === 'c' && dc.A3.v === 'd' && dc.A4.v === 'b', 'rows moved down: the row goes, those between close up');
  ok(dc.C1.f === 'A4' && dc.B3.f === 'SUM(A1:A3)' && down.sheets[0].rows?.[3]?.h === 40 && !down.sheets[0].rows?.[1], 'rows moved: formulas follow, and so does its height');
  const up = adjustForMoveLines(rows, rid, 'row', 2, 2, 0);
  ok(up.sheets[0].cells.A1.v === 'c' && up.sheets[0].cells.A2.v === 'd' && up.sheets[0].cells.A3.v === 'a' && up.sheets[0].cells.B3.f === 'A3' && up.sheets[0].cells.B2.f === 'SUM(A3:A4)', 'rows moved up: formulas follow, a range keeps the rows that stayed');
  ok(adjustForMoveLines(rows, rid, 'row', 1, 2, 2) === rows, 'rows moved to where they are changes nothing');
  const cols = normalizeBook({ sheets: [{ name: 'C', cells: { A1: 1, B1: 2, C1: 3, D1: '=A1+C1' }, cols: { 0: { w: 200 } } }] });
  const left = adjustForMoveLines(cols, cols.sheets[0].id, 'col', 0, 1, 3);
  ok(left.sheets[0].cells.A1.v === 2 && left.sheets[0].cells.C1.v === 1 && left.sheets[0].cells.D1.f === 'C1+B1' && left.sheets[0].cols?.[2]?.w === 200, 'columns moved right: formulas follow');
  ok(computeBook(left).get(cols.sheets[0].id, 'D1') === 4, 'and still work out');
}

// ---- functions added later: SUBTOTAL, money, statistics, number systems, text, Google Sheets' own ----------------------------
{
  const one = (formula: string, cells: Record<string, unknown> = {}) => sheet({ ...cells, Z1: `=${formula}` }).v('Z1');
  const col = (name: string, xs: unknown[], at = 0) => Object.fromEntries(xs.map((x, i) => [`${name}${i + 1 + at}`, x]));
  // SUBTOTAL: 1 to 11 leave out the rows a filter hides, 101 to 111 those hidden by hand too; other SUBTOTALs inside are left out.
  const nums = { ...col('A', ['n', 1, 2, 3, 4, 5]), A7: '=SUBTOTAL(9,A2:A6)' };
  ok(one('SUBTOTAL(9,A2:A6)', nums) === 15 && one('SUBTOTAL(9,A2:A7)', nums) === 15, 'SUBTOTAL: a sum, a SUBTOTAL inside its range left out');
  ok(one('SUBTOTAL(1,A2:A6)', nums) === 3 && one('SUBTOTAL(2,A2:A6)', nums) === 5 && one('SUBTOTAL(3,A2:A6)', nums) === 5 && one('SUBTOTAL(4,A2:A6)', nums) === 5 && one('SUBTOTAL(5,A2:A6)', nums) === 1 && one('SUBTOTAL(6,A2:A6)', nums) === 120, 'SUBTOTAL: average, count, counta, max, min, product');
  ok(near(one('SUBTOTAL(10,A2:A6)', nums), 2.5) && near(one('SUBTOTAL(11,A2:A6)', nums), 2) && near(one('SUBTOTAL(7,A2:A6)', nums), Math.sqrt(2.5)) && near(one('SUBTOTAL(8,A2:A6)', nums), Math.sqrt(2)), 'SUBTOTAL: variance and deviation, sample and population');
  ok(err(one('SUBTOTAL(12,A2:A6)', nums)) === '#VALUE!', 'SUBTOTAL: a function number that is none is #VALUE!');
  const hid = sheet({ ...nums, Z1: '=SUBTOTAL(9,A2:A6)' });
  const withHidden = normalizeBook({ sheets: [{ name: 'S', cells: { ...nums, Z1: '=SUBTOTAL(9,A2:A6)', Z2: '=SUBTOTAL(109,A2:A6)', Z3: '=SUBTOTAL(103,A2:A6)' }, rows: { 2: { hidden: true } }, filter: { range: 'A1:A6', cols: { A: { hide: ['4'] } } } }] });
  const hc = computeBook(withHidden);
  const hid0 = withHidden.sheets[0].id;
  ok(hc.get(hid0, 'Z1') === 11 && hc.get(hid0, 'Z2') === 9 && hc.get(hid0, 'Z3') === 3 && hid.v('Z1') === 15, 'SUBTOTAL: a filter hides rows for 9; hand-hidden rows too for 109; counts the same way');
  ok(one('COUNTUNIQUE(A1:A5,6)', col('A', [1, 2, 2, 'a', 'A'])) === 4 && one('COUNTUNIQUE(A1:A3)', col('A', [1, null, 1])) === 1, 'COUNTUNIQUE counts what is different, not what is empty');

  // Dates.
  ok(near(one('YEARFRAC(DATE(2012,1,1),DATE(2012,7,30))'), 0.58055556, 1e-7) && near(one('YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),3)'), 211 / 365) && near(one('YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),1)'), 211 / 366) && near(one('YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),2)'), 211 / 360) && near(one('YEARFRAC(DATE(2012,7,30),DATE(2012,1,1),4)'), 0.58055556, 1e-7), 'YEARFRAC: its five bases, either way round');
  ok(near(one('YEARFRAC(DATE(2010,3,1),DATE(2012,3,1),1)'), 731 / ((365 + 365 + 366) / 3)) && err(one('YEARFRAC(DATE(2012,1,1),DATE(2012,7,30),5)')) === '#NUM!', 'YEARFRAC: years apart by their average length; a basis that is none is #NUM!');
  ok(one('DAYS360(DATE(2011,1,30),DATE(2011,2,1))') === 1 && one('DAYS360(DATE(2011,1,1),DATE(2011,12,31))') === 360 && one('DAYS360(DATE(2011,1,31),DATE(2011,3,31),TRUE)') === 60 && one('DAYS360(DATE(2011,3,31),DATE(2011,1,31))') === -60, 'DAYS360: the American and the European way');

  // Money (the examples in Excel's own help).
  const flows = { ...col('A', [-10000, 2750, 4250, 3250, 2750]), ...col('B', [39448, 39508, 39751, 39859, 39904]) };
  ok(near(one('XNPV(0.09,A1:A5,B1:B5)', flows), 2086.647602, 1e-7) && near(one('XIRR(A1:A5,B1:B5)', flows), 0.373362535, 1e-6), 'XNPV and XIRR as Excel’s examples');
  ok(err(one('XIRR(A2:A3,B2:B3)', flows)) === '#NUM!' && err(one('XNPV(0.1,A1:A2,C1:C2)', { ...flows, C1: 39508, C2: 39448 })) === '#NUM!', 'XIRR with no loss, XNPV with dates before the first: #NUM!');
  ok(near(one('MIRR(A1:A6,0.1,0.12)', col('A', [-120000, 39000, 30000, 21000, 37000, 46000])), 0.126094, 1e-5) && err(one('MIRR(A1:A2,0.1,0.1)', col('A', [1, 2]))) === '#DIV/0!', 'MIRR as Excel’s example; with no loss #DIV/0!');
  ok(one('SLN(30000,7500,10)') === 2250 && err(one('SLN(1,0,0)')) === '#DIV/0!', 'SLN');
  const db = [186083.33, 259639.42, 176814.44, 120410.64, 81999.64, 55841.76, 15845.1];
  ok(db.every((x, i) => near(one(`DB(1000000,100000,6,${i + 1},7)`), x, 1e-7)), 'DB: the seven periods of Excel’s example');
  ok(near(one('DDB(2400,300,10,1,2)'), 480) && near(one('DDB(2400,300,10,10)'), 22.1225, 1e-4) && near(one('DDB(2400,300,120,1,2)'), 40) && err(one('DDB(2400,300,10,11)')) === '#NUM!', 'DDB as Excel’s examples');
  ok(near(one('CUMIPMT(0.09/12,360,125000,13,24,0)'), -11135.23213, 1e-8) && near(one('CUMPRINC(0.09/12,360,125000,13,24,0)'), -934.1071, 1e-6) && err(one('CUMIPMT(0.09/12,360,125000,0,24,0)')) === '#NUM!', 'CUMIPMT and CUMPRINC as Excel’s examples');
  ok(near(one('EFFECT(0.0525,4)'), 0.053543, 1e-5) && near(one('NOMINAL(0.053543,4)'), 0.0525, 1e-4) && err(one('EFFECT(0.05,0)')) === '#NUM!', 'EFFECT and NOMINAL');

  // The normal distribution, skew, kurtosis, counting.
  ok(near(one('NORM.DIST(42,40,1.5,TRUE)'), 0.908789, 1e-6) && near(one('NORM.DIST(42,40,1.5,FALSE)'), 0.10934, 1e-4) && near(one('NORM.S.DIST(1.333333,TRUE)'), 0.908789, 1e-6) && near(one('NORM.S.DIST(0)'), 0.5) && near(one('NORM.S.DIST(0,FALSE)'), 0.3989422804), 'NORM.DIST and NORM.S.DIST');
  ok(near(one('NORM.INV(0.908789,40,1.5)'), 42, 1e-5) && near(one('NORM.S.INV(0.975)'), 1.959963984540054, 1e-12) && near(one('NORM.S.INV(0.5)'), 0) && near(one('NORM.S.INV(0.0001)'), -3.719016485455709, 1e-10) && err(one('NORM.S.INV(1)')) === '#NUM!' && err(one('NORM.DIST(1,0,0,TRUE)')) === '#NUM!', 'NORM.INV and NORM.S.INV, to full precision, even in the tails');
  ok(near(one('NORMSDIST(-8)'), 6.220960574271785e-16, 1e-9) && near(one('NORM.S.DIST(5)'), 0.9999997133484281, 1e-12), 'the tails of the normal distribution');
  const sk = col('A', [3, 4, 5, 2, 3, 4, 5, 6, 4, 7]);
  ok(near(one('SKEW(A1:A10)', sk), 0.359543, 1e-5) && near(one('KURT(A1:A10)', sk), -0.151799, 1e-5) && err(one('SKEW(A1:A2)', sk)) === '#DIV/0!' && err(one('KURT(A1:A3)', sk)) === '#DIV/0!', 'SKEW and KURT as Excel’s examples');
  ok(one('COMBIN(8,2)') === 28 && one('COMBIN(52,5)') === 2598960 && one('PERMUT(100,3)') === 970200 && err(one('COMBIN(3,5)')) === '#NUM!', 'COMBIN and PERMUT');
  ok(near(one('TRIMMEAN(A1:A11,0.2)', col('A', [4, 5, 6, 7, 2, 3, 4, 5, 1, 2, 3])), 3.777778, 1e-6) && err(one('TRIMMEAN(A1:A3,1)', sk)) === '#NUM!', 'TRIMMEAN as Excel’s example');

  // Words, numbers.
  ok(one('FORMULATEXT(A1)', { A1: '=SUM(1,2)' }) === '=SUM(1,2)' && err(one('FORMULATEXT(A1)', { A1: 5 })) === '#N/A', 'FORMULATEXT, and #N/A for a cell with none');
  ok(one('ISURL("https://example.com/a?b=1")') === true && one('ISURL("www.example.com")') === true && one('ISURL("nope")') === false && one('ISEMAIL("a.b@x.org")') === true && one('ISEMAIL("a@b")') === false && one('ISURL(5)') === false, 'ISURL and ISEMAIL');
  ok(near(one('NUMBERVALUE("2.500,27",",",".")'), 2500.27) && near(one('NUMBERVALUE("3.5%")'), 0.035) && one('NUMBERVALUE("1,234.5")') === 1234.5 && one('NUMBERVALUE("")') === 0 && err(one('NUMBERVALUE("abc")')) === '#VALUE!', 'NUMBERVALUE');
  ok(one('DOLLAR(1234.567,2)') === '$1,234.57' && one('DOLLAR(-1234.567,-2)') === '($1,200)' && one('DOLLAR(99.888)') === '$99.89', 'DOLLAR');
  ok(one('UNICODE("A")') === 65 && one('UNICODE("€")') === 8364 && one('UNICHAR(9731)') === '☃' && err(one('UNICHAR(0)')) === '#VALUE!' && err(one('UNICODE("")')) === '#VALUE!', 'UNICODE and UNICHAR');
  ok(one('ROMAN(499)') === 'CDXCIX' && one('ROMAN(499,1)') === 'LDVLIV' && one('ROMAN(499,2)') === 'XDIX' && one('ROMAN(499,3)') === 'VDIV' && one('ROMAN(499,4)') === 'ID' && one('ROMAN(1999)') === 'MCMXCIX' && one('ROMAN(0)') === '' && one('ROMAN(499,FALSE)') === 'ID' && err(one('ROMAN(4000)')) === '#VALUE!', 'ROMAN: its forms, as Excel’s example');
  ok(one('ARABIC("LVII")') === 57 && one('ARABIC("mcmxii")') === 1912 && one('ARABIC("-IV")') === -4 && one('ARABIC("")') === 0 && err(one('ARABIC("ABC")')) === '#VALUE!', 'ARABIC');
  ok(one('DEC2BIN(9,4)') === '1001' && one('DEC2BIN(-100)') === '1110011100' && err(one('DEC2BIN(512)')) === '#NUM!' && err(one('DEC2BIN(9,2)')) === '#NUM!' && one('BIN2DEC(1100100)') === 100 && one('BIN2DEC("1110011100")') === -100 && err(one('BIN2DEC("102")')) === '#NUM!', 'DEC2BIN and BIN2DEC, negatives in ten digits');
  ok(one('DEC2HEX(100,4)') === '0064' && one('DEC2HEX(-54)') === 'FFFFFFFFCA' && one('HEX2DEC("A5")') === 165 && one('HEX2DEC("FFFFFFFF5B")') === -165 && one('DEC2OCT(58)') === '72' && one('OCT2DEC(7777777000)') === -512 && one('OCT2DEC(144)') === 100, 'DEC2HEX, HEX2DEC, DEC2OCT and OCT2DEC');
  ok(one('ENCODEURL("a b&c=é!")') === 'a%20b%26c%3D%C3%A9%21', 'ENCODEURL');
  const lifted = sheet({ A1: '=ARRAYFORMULA(DEC2BIN({1;2;3}))' });
  ok(same(lifted.spill('A1'), ['1', '10', '11']), 'the number system functions work on each value of an array');

  // Google Sheets' FLATTEN and SORTN.
  const fl = sheet({ ...col('A', [1, 3]), ...col('B', [2, 4]), D1: '=FLATTEN(A1:B2)' });
  ok(same(fl.spill('D1'), [1, 2, 3, 4]), 'FLATTEN: a range as one column, row by row');
  const sn = { A1: 'b', B1: 2, A2: 'a', B2: 1, A3: 'c', B3: 3, A4: 'a', B4: 1 };
  ok(same(sheet({ ...sn, D1: '=SORTN(A1:B4,2)' }).spill('D1'), ['a', 1, 'a', 1]) && same(sheet({ ...sn, D1: '=SORTN(A1:B4,2,2)' }).spill('D1'), ['a', 1, 'b', 2]) && same(sheet({ ...sn, D1: '=SORTN(A1:B4,1,1)' }).spill('D1'), ['a', 1, 'a', 1]) && same(sheet({ ...sn, D1: '=SORTN(A1:B4,2,0,2,FALSE)' }).spill('D1'), ['c', 3, 'b', 2]), 'SORTN: the first rows, ties kept or not, duplicates left out, another column and order');

  // In Excel's files.
  const names = new Set<string>();
  ok(excelFormula('NORM.S.DIST(1,TRUE)+NORM.DIST(1,0,1,TRUE)+ARABIC("V")+ENCODEURL(A1)', names) === '_xlfn.NORM.S.DIST(1,TRUE)+_xlfn.NORM.DIST(1,0,1,TRUE)+_xlfn.ARABIC("V")+_xlfn.ENCODEURL(A1)', 'Excel: the functions it added in 2010 and 2013 written with their prefix');
  ok(excelFormula('XIRR(A1:A5,B1:B5)+SUBTOTAL(9,A1:A5)+DB(1,1,1,1)+YEARFRAC(A1,B1)', names) === 'XIRR(A1:A5,B1:B5)+SUBTOTAL(9,A1:A5)+DB(1,1,1,1)+YEARFRAC(A1,B1)', 'Excel: the older ones as they are');
  ok(excelFormula('COUNTUNIQUE(A1:A5)', names) === null && excelFormula('SORTN(A1:A5)', names) === null && excelFormula('ISURL(A1)', names) === null, 'Excel: Google Sheets’ own functions are written as the values they show');
  ok(formulaFromFile('_xlfn.NORM.S.DIST(1,TRUE)+_xlfn.FORMULATEXT(A1)') === 'NORM.S.DIST(1,TRUE)+FORMULATEXT(A1)', 'and read back from a file');
  const book = normalizeBook({ sheets: [{ name: 'X', cells: { A1: 1, A2: '=NORM.S.INV(0.9)', A3: '=COUNTUNIQUE(A1:A2)', A4: '=DEC2HEX(255)' } }] });
  const back = importBook(xlsxOfBook(book, 'X', computeBook(book)), 'X.xlsx').book.sheets[0].cells;
  ok(back.A2.f === 'NORM.S.INV(0.9)' && back.A3.f === undefined && back.A3.v === 2 && back.A4.f === 'DEC2HEX(255)', 'an Excel file kept: the formulas Excel knows stay formulas, Google Sheets’ own become their values');
  ok(FUNCTION_NAMES.length >= 286, 'the list of functions has all the newer ones');
  const bare = FUNCTION_NAMES.filter((n) => !FUNCTION_INFO[n]);
  ok(bare.length === 0, `every function has its help (missing: ${bare.join(', ')})`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

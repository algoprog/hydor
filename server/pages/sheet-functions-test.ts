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
  aiKey,
  bookText,
  CellError,
  computeBook,
  excelFormula,
  formulaFromFile,
  isRangeName,
  normalizeBook,
  renameName,
  renameSheet,
  type Scalar,
  type Workbook,
} from '../../shared/sheets.ts';
import { importBook, xlsxOfBook } from './sheets.ts';
import { Zip } from '../documents/zip.ts';

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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

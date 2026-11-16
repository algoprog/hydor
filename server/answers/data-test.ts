// Script tests for answer cards that read their data from a Library spreadsheet or a data file: the filter language,
// sums and counts by group, sort and limit (shared/answer-ui/data-ref.ts), each card's data worked out in its own shape
// (table, chart, stats, ranking, map-values, distribution), and what the server reads (data.ts): a spreadsheet's range
// with its headings or a whole tab, CSV, TSV, JSON, JSONL and GeoJSON files in the session's folders and nowhere else,
// a confidential session's spreadsheet kept from other sessions, the limits, what is kept and when it is read again,
// and the route. Build and run with a scratch folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/answers/data-test.ts
//   DATA_DIR=/tmp/hydor-test-answers-data node dist/dev/data-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { compareCells, parseWhere, RefError, REF_LIMITS, refProblems, resolveRef, runQuery, parseMeasure, tableOf, type Cell, type DataTable } from '../../shared/answer-ui/data-ref.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { addVersion, createPage, initPages } from '../pages/store.ts';
import { createSpace } from '../spaces/index.ts';
import { cardData, dataRoutes, dropKept, keptSources, type CardData } from './data.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-answers-data-test-')));
const db = openDb(path.join(tmp, 'test.db'));
initPages(db);

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** A shop's sales, a row a month and region. */
const SALES: Cell[][] = [
  ['Month', 'Region', 'Revenue', 'Refunds', 'Orders'],
  ['2026-07', 'EU', 1200, 40, 30],
  ['2026-07', 'US', 2100, 90, 51],
  ['2026-08', 'EU', 1350, 25, 33],
  ['2026-08', 'US', 1980, 60, 47],
  ['2026-09', 'EU', 1500, 30, 36],
  ['2026-09', 'US', 2400, 80, 58],
  ['2026-09', 'Asia', 600, null, 14],
  ['2026-10', 'EU', 1650, 20, 40],
  ['2026-10', 'US', 2600, 70, 61],
  ['2026-10', 'Asia', 900, 10, 21],
];
const sales = tableOf(SALES);
const rowsWhere = (t: DataTable, w: string) => {
  const f = parseWhere(t, w);
  return Array.from({ length: t.rows }, (_, i) => i).filter(f);
};

/** A session of its own folder (and project), as the app keeps one. */
function session(key: string, cwd: string, extra: Record<string, unknown> = {}) {
  db.prepare('insert or replace into app_sessions (key, agent, cwd, extra, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(key, 'claude', cwd, JSON.stringify(extra), Date.now(), Date.now());
}
const message = async (p: Promise<unknown>): Promise<{ status: number; text: string }> => {
  try {
    await p;
  } catch (e) {
    return { status: e instanceof HttpError ? e.status : 0, text: (e as Error).message };
  }
  assert.fail('it should have been refused');
};

// ---- the engine ---------------------------------------------------------------------------------------------------

test('the filter: comparisons, lists, words, empties, ranges, and, or, not and brackets, without running anything', () => {
  assert.deepEqual(rowsWhere(sales, "Region = 'EU'"), [0, 2, 4, 7]);
  assert.deepEqual(rowsWhere(sales, "region = 'eu' and Revenue > 1300"), [2, 4, 7], 'headings and words in any case');
  assert.deepEqual(rowsWhere(sales, "Region in ('Asia', 'EU') and not Month < '2026-09'"), [4, 6, 7, 9]);
  assert.deepEqual(rowsWhere(sales, 'Refunds is empty'), [6]);
  assert.deepEqual(rowsWhere(sales, 'Refunds is not empty and Refunds <= 20'), [7, 9]);
  assert.deepEqual(rowsWhere(sales, 'Month between 2026-08 and 2026-09 and Region != "US"'), [2, 4, 6], 'a month written without quotes, double quotes');
  assert.deepEqual(rowsWhere(sales, "(Region = 'US' or Region = 'Asia') and Orders >= 50"), [1, 5, 8]);
  assert.deepEqual(rowsWhere(sales, "Region contains 'si' or Region starts with 'u'"), [1, 3, 5, 6, 8, 9]);
  assert.deepEqual(rowsWhere(sales, "Region not in ('US', 'EU')"), [6, 9]);
  assert.deepEqual(rowsWhere(sales, ''), sales.rows ? Array.from({ length: sales.rows }, (_, i) => i) : []);
  const spaced = tableOf([['Order date', 'Paid'], ['2026-01-02', 'yes'], ['2026-02-03', '']]);
  assert.deepEqual(rowsWhere(spaced, "[Order date] >= '2026-02-01'"), [1], 'a heading with spaces in brackets');
  assert.deepEqual(rowsWhere(spaced, '`Order date` < 2026-02-01 and Paid'), [0], 'in backquotes; a column alone is a test of whether it holds something');
  assert.throws(() => parseWhere(sales, "Regoin = 'EU'"), (e: Error) => e instanceof RefError && /No column called “Regoin”.*Month, Region, Revenue/.test(e.message), 'a column that is not there lists those that are');
  assert.throws(() => parseWhere(sales, "Region = 'EU"), /not closed/);
  assert.throws(() => parseWhere(sales, "Region = 'EU' Revenue > 3"), /join conditions with and or or/);
  assert.throws(() => parseWhere(sales, 'Region in EU'), /list in brackets/);
  assert.throws(() => parseWhere(sales, "Region = 'x'; process.exit(1)"), RefError, 'nothing else is read, nor run');
  assert.ok(compareCells(2, 10) < 0 && compareCells('b', 'A') > 0 && compareCells(null, 1) > 0 && compareCells('10', 9) > 0);
});

test('sums, counts and the rest by group, after the filter; sort and limit; labels with as', () => {
  const m = (s: string) => parseMeasure(sales, s);
  const r = runQuery(sales, { where: "Region != 'Asia'", groupBy: ['Region'], measures: [m('Region'), m('sum(Revenue)'), m('count()'), m('avg(Orders) as Average orders'), m('max(Month)')] });
  assert.deepEqual(r.rows, [
    ['EU', 5700, 4, 34.75, '2026-10'],
    ['US', 9080, 4, 54.25, '2026-10'],
  ]);
  assert.equal(r.matched, 8);
  assert.deepEqual(
    r.measures.map((x) => x.label),
    ['Region', 'Revenue', 'Count', 'Average orders', 'Month (highest)'],
  );
  const top = runQuery(sales, { groupBy: ['Month'], measures: [m('Month'), m('sum(Revenue)')], sort: ['-sum(Revenue)'], limit: 2 });
  assert.deepEqual(top.rows, [
    ['2026-10', 5150],
    ['2026-09', 4500],
  ]);
  assert.equal(top.total, 4, 'how many there were before the limit');
  const by = runQuery(sales, { measures: [m('Region'), m('Revenue')], sort: ['Region', 'Revenue desc'], limit: 3 });
  assert.deepEqual(by.rows, [
    ['Asia', 900],
    ['Asia', 600],
    ['EU', 1650],
  ]);
  const whole = runQuery(sales, { measures: [m('count(Refunds)'), m('distinct(Region)'), m('median(Revenue)'), m('first(Month)'), m('last(Revenue)'), m('min(Refunds)')] });
  assert.deepEqual(whole.rows, [[9, 3, 1575, '2026-07', 900, 10]]);
  const none = runQuery(sales, { where: "Region = 'Mars'", measures: [m('sum(Revenue)'), m('count()')] });
  assert.deepEqual(none.rows, [[0, 0]], 'nothing matched: a sum of nothing');
  assert.throws(() => m('total()'), /needs a column/);
  assert.throws(() => m('stddev(Revenue)'), /not a sum or a count/);
});

// ---- each card from a reference -----------------------------------------------------------------------------------

test('a table: the columns named (or all), with types from the source, totals, the rows asked for', () => {
  const r = resolveRef('table', { title: 'By region', from: { sheet: 'x' }, columns: ['Region', 'sum(Revenue) as Revenue', { key: 'count()', label: 'Months' }], groupBy: 'Region', sort: '-Revenue', totals: ['Revenue'] }, sales);
  assert.deepEqual(r.data.columns, [
    { key: 'Region', label: 'Region' },
    { key: 'Revenue', label: 'Revenue', type: 'number' },
    { key: 'Months', label: 'Months', type: 'number' },
  ]);
  assert.deepEqual(r.data.rows, [
    { Region: 'US', Revenue: 9080, Months: 4 },
    { Region: 'EU', Revenue: 5700, Months: 4 },
    { Region: 'Asia', Revenue: 1500, Months: 2 },
  ]);
  assert.deepEqual(r.data.totals, ['Revenue']);
  assert.equal(r.data.title, 'By region');
  for (const k of ['from', 'groupBy', 'sort']) assert.ok(!(k in r.data), `${k} is gone`);
  const all = resolveRef('table', { from: 'Shop', limit: 4 }, sales);
  assert.deepEqual(
    (all.data.columns as { key: string }[]).map((c) => c.key),
    ['Month', 'Region', 'Revenue', 'Refunds', 'Orders'],
  );
  assert.equal((all.data.rows as unknown[]).length, 4);
  assert.deepEqual([all.shown, all.total], [4, 10], 'how many of how many');
  const money = resolveRef('table', { from: 'x', columns: ['Item', 'Price'] }, { ...tableOf([['Item', 'Price'], ['Mug', 18]]), columns: [tableOf([['Item'], ['Mug']]).columns[0], { name: 'Price', nums: new Float64Array([18]), hint: { type: 'money', currency: '€' } }] });
  assert.deepEqual((money.data.columns as unknown[])[1], { key: 'Price', label: 'Price', type: 'money', currency: '€' }, 'money as the spreadsheet formats it');
});

test('a chart: labels along x, a series for each y, or for each value of groupBy', () => {
  const r = resolveRef('chart', { title: 'Revenue', kind: 'bar', from: 'x', x: 'Month', y: ['sum(Revenue)', 'sum(Refunds) as Refunds'] }, sales);
  assert.deepEqual(r.data.x, ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(r.data.series, [
    { name: 'Revenue', values: [3300, 3330, 4500, 5150] },
    { name: 'Refunds', values: [130, 85, 110, 100] },
  ]);
  assert.equal(r.data.kind, 'bar');
  const split = resolveRef('chart', { kind: 'line', from: 'x', x: 'Month', y: 'Revenue', groupBy: 'Region' }, sales);
  assert.deepEqual(split.data.x, ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(split.data.series, [
    { name: 'EU', values: [1200, 1350, 1500, 1650] },
    { name: 'US', values: [2100, 1980, 2400, 2600] },
    { name: 'Asia', values: [null, null, 600, 900] },
  ]);
  const pie = resolveRef('chart', { kind: 'pie', from: 'x', x: 'Region', y: 'sum(Orders)', sort: '-sum(Orders)', limit: 2 }, sales);
  assert.deepEqual(pie.data.x, ['US', 'EU']);
  assert.deepEqual(pie.data.series, [{ name: 'Orders', values: [217, 139] }]);
  assert.deepEqual([pie.shown, pie.total], [2, 3]);
  const scatter = resolveRef('chart', { kind: 'scatter', from: 'x', x: 'Orders', y: 'Revenue', label: 'Month', groupBy: 'Region' }, sales);
  const series = scatter.data.series as { name: string; values: { x: number; y: number; label: string }[] }[];
  assert.deepEqual(
    series.map((s) => s.name),
    ['EU', 'US', 'Asia'],
  );
  assert.deepEqual(series[2].values, [
    { x: 14, y: 600, label: '2026-09' },
    { x: 21, y: 900, label: '2026-10' },
  ]);
  assert.equal(scatter.data.x_label, 'Orders');
  assert.throws(() => resolveRef('chart', { from: 'x', x: 'sum(Revenue)', y: 'Orders' }, sales), /x is the column of labels/);
});

test('key figures: each a sum or count of its rows; with by, the latest group’s, its trend and its change', () => {
  const r = resolveRef(
    'stats',
    {
      title: 'Shop',
      from: 'x',
      where: "Region != 'Asia'",
      stats: [
        { label: 'Revenue', value: 'sum(Revenue)', by: 'Month', prefix: '$' },
        { label: 'EU orders', value: 'sum(Orders)', where: "Region = 'EU'" },
        { label: 'Refunds', value: 'sum(Refunds)', by: 'Month', change: 'diff', good: 'down' },
        { label: 'Typed in', value: 42 },
      ],
    },
    sales,
  );
  const [rev, eu, ref, typed] = r.data.stats as Record<string, unknown>[];
  assert.equal(rev.value, 4250);
  assert.deepEqual(rev.trend, [3300, 3330, 3900, 4250]);
  assert.equal(rev.change, 9);
  assert.equal(rev.change_unit, '%');
  assert.equal(rev.note, '2026-10', 'which group the value is');
  assert.ok(!('by' in rev) && !('where' in eu));
  assert.equal(eu.value, 139, 'the card’s filter and its own');
  assert.equal(ref.value, 90);
  assert.equal(ref.change, -20, 'a difference instead of a percentage');
  assert.equal(typed.value, 42, 'a number typed in stays');
  const last = resolveRef('stats', { from: 'x', stats: [{ label: 'Latest revenue', value: 'Revenue' }] }, sales);
  assert.equal((last.data.stats as Record<string, unknown>[])[0].value, 900, 'a column alone: its last value');
});

test('a ranking: an item for each name, highest first, the top ten unless said', () => {
  const r = resolveRef('ranking', { title: 'Regions', from: 'x', items: { name: 'Region', value: 'sum(Revenue)', detail: 'max(Month)' } }, sales);
  assert.deepEqual(r.data.items, [
    { name: 'US', value: 9080, detail: '2026-10' },
    { name: 'EU', value: 5700, detail: '2026-10' },
    { name: 'Asia', value: 1500, detail: '2026-10' },
  ]);
  assert.equal(r.data.metric, 'Revenue');
  const rows = resolveRef('ranking', { from: 'x', items: { name: 'Month', value: 'Revenue' }, limit: 2 }, sales);
  assert.deepEqual(rows.data.items, [
    { name: '2026-10', value: 2600 },
    { name: '2026-09', value: 2400 },
  ]);
});

test('values on a map: a point for each place, at its latitude and longitude, highest first', () => {
  const t = tableOf([
    ['Store', 'Lat', 'Lon', 'Sales'],
    ['Portland', 45.52, -122.68, 120],
    ['Seattle', 47.61, -122.33, 90],
    ['Portland', 45.52, -122.68, 40],
    ['Nowhere', null, null, 5],
  ]);
  const r = resolveRef('map-values', { from: 'x', points: { name: 'Store', lat: 'Lat', lng: 'Lon', value: 'sum(Sales)' }, unit: 'orders' }, t);
  assert.deepEqual(r.data.points, [
    { name: 'Portland', lat: 45.52, lng: -122.68, value: 160 },
    { name: 'Seattle', lat: 47.61, lng: -122.33, value: 90 },
  ]);
  assert.match(r.notes.join(' '), /1 rows without a place/);
  const guessed = resolveRef('map-values', { from: 'x', points: { name: 'Store', value: 'Sales' } }, t);
  assert.equal((guessed.data.points as unknown[]).length, 3, 'Lat and Lon found by their headings');
});

test('a distribution: a column’s numbers, by group as box plots; past 50,000, counted in bins', () => {
  const r = resolveRef('distribution', { from: 'x', values: 'Revenue', groupBy: 'Region', marks: [{ value: 1000, label: 'Target' }] }, sales);
  assert.deepEqual(r.data.values, [1200, 2100, 1350, 1980, 1500, 2400, 600, 1650, 2600, 900]);
  assert.deepEqual(r.data.groups, [
    { name: 'EU', values: [1200, 1350, 1500, 1650] },
    { name: 'US', values: [2100, 1980, 2400, 2600] },
    { name: 'Asia', values: [600, 900] },
  ]);
  assert.deepEqual(r.data.marks, [{ value: 1000, label: 'Target' }]);
  const big = tableOf([['x', 'g'], ...Array.from({ length: 60_000 }, (_, i): Cell[] => [i % 100, i % 2 ? 'odd' : 'even'])]);
  const b = resolveRef('distribution', { from: 'x', values: 'x', groupBy: 'g' }, big);
  assert.ok(!('values' in b.data) && Array.isArray(b.data.bins), 'bins instead of 60,000 values');
  assert.equal((b.data.bins as { count: number }[]).reduce((n, x) => n + x.count, 0), 60_000, 'every value counted');
  const g = b.data.groups as { values: number[] }[];
  assert.ok(g.every((x) => x.values.length === 25_000), 'each group an even sample');
  assert.equal(Math.min(...g[0].values), 0);
  assert.equal(Math.max(...g[0].values), 98, 'its lowest and highest kept');
  assert.throws(() => resolveRef('distribution', { from: 'x', values: 'sum(Revenue)' }, sales), /as they are/);
});

test('a reference is checked by its form: the specs’ examples pass, mistakes are named', () => {
  assert.deepEqual(refProblems('chart', { from: { sheet: 'Shop numbers', range: 'Sales!A1:D400' }, x: 'Month', y: 'sum(Revenue)', groupBy: 'Region', where: "Region = 'EU'" }), []);
  assert.match(refProblems('chart', { from: {}, x: 'Month' }).join(' '), /from names no spreadsheet or file/);
  assert.match(refProblems('table', { from: 'a.csv', columns: ['stddev(Revenue)'] }).join(' '), /not a sum or a count/);
  assert.match(refProblems('table', { from: 'a.csv', where: "Region = 'EU" }).join(' '), /where: .*not closed/);
  assert.match(refProblems('ranking', { from: 'a.csv', items: { value: 'sum(x)' } }).join(' '), /the column of names/);
  assert.match(refProblems('gauge', { from: 'a.csv' }).join(' '), /takes no reference/);
  assert.throws(() => resolveRef('gauge', { from: 'x' }, sales), /cannot read from a spreadsheet/);
});

// ---- where the data comes from --------------------------------------------------------------------------------------

const folder = path.join(tmp, 'work');
const project = path.join(tmp, 'project');
const elsewhere = path.join(tmp, 'elsewhere');
for (const d of [folder, project, elsewhere, path.join(folder, 'data')]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(folder, 'data', 'sales.csv'), `﻿Month,Region,Revenue,Note\n2026-09,EU,"1,500","Back to school, busy"\n2026-09,US,$2400,\n2026-10,EU,1650,"He said ""wow"""\r\n2026-10,US,2600,\n\n`);
fs.writeFileSync(path.join(folder, 'visits.tsv'), 'Day\tVisits\tRate\nMon\t120\t2.5%\nTue\t140\t3%\n');
fs.writeFileSync(path.join(folder, 'events.jsonl'), '{"kind":"signup","ms":120}\n{"kind":"login","ms":40}\nnot json\n{"kind":"signup","ms":200,"extra":{"plan":"pro"}}\n');
fs.writeFileSync(path.join(folder, 'cities.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Athens', people: 3_100_000 }, geometry: { type: 'Point', coordinates: [23.73, 37.98] } }] }));
fs.writeFileSync(path.join(folder, 'wrapped.json'), JSON.stringify({ updated: '2026-11-01', results: [{ team: 'A', score: 3 }, { team: 'B', score: 5 }] }));
fs.writeFileSync(path.join(folder, 'columns.json'), JSON.stringify({ x: [1, 2, 3], y: [10, 20, 30] }));
fs.writeFileSync(path.join(project, 'budget.csv'), 'Item,Cost\nRent,1850\nFood,610\n');
fs.writeFileSync(path.join(elsewhere, 'secret.csv'), 'Key,Value\npassword,hunter2\n');
fs.writeFileSync(path.join(folder, 'book.xlsx'), 'PK');
fs.symlinkSync(path.join(elsewhere, 'secret.csv'), path.join(folder, 'link.csv'));
const space = createSpace(db, { name: 'Shop', folder: project });
session('claude:s1', folder, { space: space.id });
session('claude:other', elsewhere);

const shop = createPage(db, {
  title: 'Shop numbers',
  kind: 'sheet',
  by: 'agent',
  model: {
    sheets: [
      { name: 'Notes', rows: [['Read me first']] },
      {
        name: 'Sales',
        header: true,
        rows: [['Day', 'Region', 'Revenue', 'Share'], ['2026-10-01', 'EU', '$1,200.50', '12%'], ['2026-10-02', 'US', '$2,000', '30%'], [], ['2026-10-03', 'EU', '$900', '8%'], ['', '', '=SUM(C2:C5)', '']],
      },
    ],
    names: [{ name: 'Totals', ref: 'Sales!C2:C6' }],
  },
});

test('a spreadsheet’s range: its first row the headings, dates as written, money as formatted, empty rows left out, formulas worked out', async () => {
  dropKept();
  const r = await cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Sales!A1:C5' } }, { session: 'claude:s1' });
  assert.deepEqual(r.data.columns, [
    { key: 'Day', label: 'Day', type: 'date' },
    { key: 'Region', label: 'Region' },
    { key: 'Revenue', label: 'Revenue', type: 'money', currency: '$' },
  ]);
  assert.deepEqual(r.data.rows, [
    { Day: '2026-10-01', Region: 'EU', Revenue: 1200.5 },
    { Day: '2026-10-02', Region: 'US', Revenue: 2000 },
    { Day: '2026-10-03', Region: 'EU', Revenue: 900 },
  ]);
  assert.deepEqual(r.source, { kind: 'sheet', id: shop.id, name: 'Shop numbers', tab: 'Sales', range: 'A1:C5', version: 1 });
  assert.equal(r.rows, 3);
  assert.ok(r.readAt > 0 && r.readAt <= Date.now());
  const whole = await cardData(db, 'stats', { from: { sheet: shop.id, tab: 'sales' }, stats: [{ label: 'Total', value: 'sum(Revenue)' }, { label: 'Days', value: 'count(Day)' }] }, {});
  assert.deepEqual(
    (whole.data.stats as { value: number }[]).map((s) => s.value),
    [8201, 3],
    'a whole tab by id, the formula’s row counted (as the sheet shows it); no session needed for the Library',
  );
  assert.equal(whole.source.kind === 'sheet' && whole.source.range, 'A1:D6');
  const tab = await cardData(db, 'table', { from: { sheet: 'shop NUMBERS', range: 'Sales' } }, {});
  assert.equal((tab.data.rows as unknown[]).length, 4, 'a tab named as the range, the spreadsheet in any case');
  const first = await cardData(db, 'table', { from: 'Shop numbers' }, {});
  assert.deepEqual(first.data.columns, [{ key: 'Read me first', label: 'Read me first' }], 'the first tab when none is named');
  const named = await cardData(db, 'stats', { from: { sheet: 'Shop numbers', range: 'Totals' }, stats: [{ label: 'n', value: 'count()' }] }, {});
  assert.equal(named.source.kind === 'sheet' && named.source.range, 'C2:C6', 'a named range');
  const pct = await cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Sales!D1:D3' } }, {});
  assert.deepEqual((pct.data.columns as unknown[])[0], { key: 'Share', label: 'Share', type: 'percent' });
  assert.deepEqual(pct.data.rows, [{ Share: 0.12 }, { Share: 0.3 }]);
});

test('a missing spreadsheet, tab, range or column: a plain message', async () => {
  let m = await message(cardData(db, 'table', { from: { sheet: 'Shop numberz' } }, {}));
  assert.equal(m.status, 404);
  assert.match(m.text, /no spreadsheet called “Shop numberz” in the Library/);
  m = await message(cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Costs!A1:B4' } }, {}));
  assert.match(m.text, /no tab called “Costs”\. Its tabs: Notes, Sales/);
  m = await message(cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Sales!Z50:Z60' } }, {}));
  assert.match(m.text, /is empty/);
  m = await message(cardData(db, 'chart', { from: { sheet: 'Shop numbers', range: 'Sales' }, x: 'Day', y: 'sum(Revenu)' }, {}));
  assert.equal(m.status, 400);
  assert.match(m.text, /No column called “Revenu” in Shop numbers · Sales\. Its columns: Day, Region, Revenue, Share/);
  createPage(db, { title: 'Meeting notes', kind: 'doc', by: 'agent', model: { blocks: [{ type: 'p', text: 'Hi' }] } });
  m = await message(cardData(db, 'table', { from: { sheet: 'Meeting notes' } }, {}));
  assert.match(m.text, /not a spreadsheet/);
  m = await message(cardData(db, 'gauge', { from: { sheet: 'Shop numbers' } }, {}));
  assert.match(m.text, /cannot read from a spreadsheet/);
  m = await message(cardData(db, 'table', { title: 'No source' }, {}));
  assert.match(m.text, /names no source/);
});

test('files in the session’s folder and its project’s: CSV, TSV, JSON, JSONL, GeoJSON', async () => {
  dropKept();
  const csv = await cardData(db, 'chart', { kind: 'bar', from: { file: 'data/sales.csv' }, x: 'Month', y: 'sum(Revenue)', where: "Region = 'EU'" }, { session: 'claude:s1' });
  assert.deepEqual(csv.data.x, ['2026-09', '2026-10']);
  assert.deepEqual(csv.data.series, [{ name: 'Revenue', values: [1500, 1650] }], 'quoted numbers with commas');
  assert.equal(csv.source.kind === 'file' && csv.source.path, path.join(folder, 'data', 'sales.csv'));
  assert.equal(csv.rows, 4, 'the empty line at its end left out');
  const quoted = await cardData(db, 'table', { from: 'data/sales.csv', columns: ['Note', 'Revenue'] }, { session: 'claude:s1' });
  assert.deepEqual(
    (quoted.data.rows as Record<string, unknown>[]).map((r) => r.Note),
    ['Back to school, busy', null, 'He said "wow"', null],
  );
  assert.equal((quoted.data.rows as Record<string, unknown>[])[1].Revenue, 2400, 'an amount with its currency sign');
  assert.deepEqual((quoted.data.columns as unknown[])[1], { key: 'Revenue', label: 'Revenue', type: 'money', currency: '$' });
  const tsv = await cardData(db, 'table', { from: { file: 'visits.tsv' } }, { session: 'claude:s1' });
  assert.deepEqual(tsv.data.rows, [
    { Day: 'Mon', Visits: 120, Rate: 2.5 },
    { Day: 'Tue', Visits: 140, Rate: 3 },
  ]);
  assert.deepEqual((tsv.data.columns as unknown[])[2], { key: 'Rate', label: 'Rate', type: 'number', unit: '%' });
  const jsonl = await cardData(db, 'ranking', { from: { file: path.join(folder, 'events.jsonl') }, items: { name: 'kind', value: 'avg(ms)' } }, { session: 'claude:s1' });
  assert.deepEqual(jsonl.data.items, [
    { name: 'signup', value: 160 },
    { name: 'login', value: 40 },
  ]);
  const nested = await cardData(db, 'table', { from: 'events.jsonl', columns: ['extra.plan'], where: 'extra.plan is not empty' }, { session: 'claude:s1' });
  assert.deepEqual(nested.data.rows, [{ 'extra.plan': 'pro' }], 'an object’s fields one level down');
  const geo = await cardData(db, 'map-values', { from: 'cities.geojson', points: { name: 'name', value: 'people' } }, { session: 'claude:s1' });
  assert.deepEqual(geo.data.points, [{ name: 'Athens', lat: 37.98, lng: 23.73, value: 3_100_000 }]);
  const wrapped = await cardData(db, 'table', { from: 'wrapped.json' }, { session: 'claude:s1' });
  assert.deepEqual(wrapped.data.rows, [
    { team: 'A', score: 3 },
    { team: 'B', score: 5 },
  ]);
  const cols = await cardData(db, 'chart', { from: 'columns.json', kind: 'line', x: 'x', y: 'y' }, { session: 'claude:s1' });
  assert.deepEqual(cols.data.series, [{ name: 'y', values: [10, 20, 30] }]);
  const proj = await cardData(db, 'table', { from: { file: path.join(project, 'budget.csv') } }, { session: 'claude:s1' });
  assert.equal((proj.data.rows as unknown[]).length, 2, 'a file of the session’s project');
});

test('nothing outside those folders: other folders, links out of them, files with no session, and only data files', async () => {
  let m = await message(cardData(db, 'table', { from: { file: path.join(elsewhere, 'secret.csv') } }, { session: 'claude:s1' }));
  assert.equal(m.status, 403);
  assert.match(m.text, /secret\.csv is outside the folders this conversation works in/);
  m = await message(cardData(db, 'table', { from: { file: '../elsewhere/secret.csv' } }, { session: 'claude:s1' }));
  assert.equal(m.status, 403, 'nor by ../');
  m = await message(cardData(db, 'table', { from: { file: 'link.csv' } }, { session: 'claude:s1' }));
  assert.equal(m.status, 403, 'nor by a link that leads out');
  m = await message(cardData(db, 'table', { from: { file: '/etc/passwd.csv' } }, { session: 'claude:s1' }));
  assert.equal(m.status, 404);
  m = await message(cardData(db, 'table', { from: { file: '/etc/hostname' } }, { session: 'claude:s1' }));
  assert.equal(m.status, 403, 'any file outside, whatever its kind');
  m = await message(cardData(db, 'table', { from: { file: 'data/sales.csv' } }, {}));
  assert.equal(m.status, 403);
  assert.match(m.text, /only in the conversation it belongs to/);
  m = await message(cardData(db, 'table', { from: { file: path.join(folder, 'data', 'sales.csv') } }, { session: 'claude:other' }));
  assert.equal(m.status, 403, 'another session’s folder is not this one’s');
  m = await message(cardData(db, 'table', { from: { file: 'book.xlsx' } }, { session: 'claude:s1' }));
  assert.match(m.text, /not a file a card reads: give a CSV, TSV, JSON or JSONL file/);
  m = await message(cardData(db, 'table', { from: { file: 'nothing.csv' } }, { session: 'claude:s1' }));
  assert.equal(m.status, 404);
});

test('too big: a file over 50 MB (a JSON file over 20 MB) is refused unread; past 1,000,000 rows the rest is left out', async () => {
  const big = path.join(folder, 'huge.csv');
  fs.writeFileSync(big, 'a,b\n');
  fs.truncateSync(big, REF_LIMITS.fileBytes + 1);
  let m = await message(cardData(db, 'table', { from: 'huge.csv' }, { session: 'claude:s1' }));
  assert.equal(m.status, 413);
  assert.match(m.text, /up to 50 MB/);
  const bigJson = path.join(folder, 'huge.json');
  fs.writeFileSync(bigJson, '[');
  fs.truncateSync(bigJson, REF_LIMITS.jsonBytes + 1);
  m = await message(cardData(db, 'table', { from: 'huge.json' }, { session: 'claude:s1' }));
  assert.match(m.text, /JSON file of up to 20 MB/);
  fs.rmSync(big);
  fs.rmSync(bigJson);
  const rows = REF_LIMITS.rows;
  REF_LIMITS.rows = 1000;
  try {
    fs.writeFileSync(path.join(folder, 'long.csv'), `n\n${Array.from({ length: 1500 }, (_, i) => i).join('\n')}\n`);
    const r = await cardData(db, 'stats', { from: 'long.csv', stats: [{ label: 'Rows', value: 'count()' }] }, { session: 'claude:s1' });
    assert.equal((r.data.stats as { value: number }[])[0].value, 1000);
    assert.equal(r.rows, 1000);
    assert.match(r.notes[0], /Only the first 1,000 rows of the source are read/);
  } finally {
    REF_LIMITS.rows = rows;
  }
});

test('a confidential session’s spreadsheet: only its own cards (or another confidential session’s) read it', async () => {
  session('claude:secret', folder, { confidential: true, memory: false });
  session('claude:secret2', folder, { confidential: true, memory: false });
  createPage(db, { title: 'Payroll', kind: 'sheet', by: 'agent', sessionKey: 'claude:secret', model: { sheets: [{ name: 'Pay', rows: [['Name', 'Pay'], ['Ann', 5000]] }] } });
  const ask = (at: { session?: string }) => cardData(db, 'stats', { from: 'Payroll', stats: [{ label: 'Total', value: 'sum(Pay)' }] }, at);
  const m = await message(ask({ session: 'claude:s1' }));
  assert.equal(m.status, 403);
  assert.match(m.text, /made in a confidential session/);
  assert.equal((await message(ask({}))).status, 403, 'nor with no session');
  assert.equal(((await ask({ session: 'claude:secret' })).data.stats as { value: number }[])[0].value, 5000);
  assert.equal(((await ask({ session: 'claude:secret2' })).data.stats as { value: number }[])[0].value, 5000);
});

test('kept: a card drawn twice reads once; a spreadsheet saved since, or a file changed, is read again', async () => {
  dropKept();
  const card = { from: { sheet: 'Shop numbers', range: 'Sales' }, stats: [{ label: 'Total', value: 'sum(Revenue)' }] };
  const a = await cardData(db, 'stats', card, {});
  const b = await cardData(db, 'stats', card, {});
  assert.ok(!a.cached && b.cached, 'the second time, kept');
  assert.equal(b.readAt, a.readAt);
  const other = await cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Sales' }, columns: ['Region'] }, {});
  assert.ok(!other.cached && other.readAt === a.readAt, 'another card of the same source: worked out anew, read once');
  assert.equal(keptSources(), 1);
  // Two at once: one read.
  dropKept();
  const [x, y] = await Promise.all([cardData(db, 'stats', card, {}), cardData(db, 'table', { from: { sheet: 'Shop numbers', range: 'Sales' } }, {})]);
  assert.equal(x.readAt, y.readAt);
  addVersion(db, shop.id, { by: 'edit', model: { sheets: [{ name: 'Notes', rows: [['x']] }, { name: 'Sales', rows: [['Day', 'Region', 'Revenue'], ['2026-11-01', 'EU', 5]] }] } });
  const c = (await cardData(db, 'stats', card, {})) as CardData;
  assert.ok(!c.cached);
  assert.equal((c.data.stats as { value: number }[])[0].value, 5, 'the saved version');
  assert.equal(c.source.kind === 'sheet' && c.source.version, 2);
  const f = path.join(folder, 'visits.tsv');
  const t1 = await cardData(db, 'stats', { from: 'visits.tsv', stats: [{ label: 'Visits', value: 'sum(Visits)' }] }, { session: 'claude:s1' });
  fs.writeFileSync(f, 'Day\tVisits\nMon\t1\n');
  fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));
  const t2 = await cardData(db, 'stats', { from: 'visits.tsv', stats: [{ label: 'Visits', value: 'sum(Visits)' }] }, { session: 'claude:s1' });
  assert.ok(!t2.cached);
  assert.deepEqual(
    [t1, t2].map((t) => (t.data.stats as { value: number }[])[0].value),
    [260, 1],
  );
});

test('the route: POST /api/answers/data with the card and where it is drawn', async () => {
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
  });
  dataRoutes({ app, db } as unknown as Deps);
  const ok = await app.inject({ method: 'POST', url: '/api/answers/data', payload: { ui: 'chart', data: { kind: 'bar', from: 'data/sales.csv', x: 'Region', y: 'sum(Revenue)' }, session: 'claude:s1' } });
  assert.equal(ok.statusCode, 200);
  const body = ok.json();
  assert.deepEqual(body.data.x, ['EU', 'US']);
  assert.equal(body.source.name, 'sales.csv');
  const bad = await app.inject({ method: 'POST', url: '/api/answers/data', payload: { ui: 'table', data: { from: { sheet: 'Nope' } } } });
  assert.equal(bad.statusCode, 404);
  assert.match(bad.json().error, /no spreadsheet called “Nope”/);
  await app.close();
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).stack ?? (e as Error).message}`);
  }
}
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
process.exit(failed ? 1 : 0);

// The parts of an Excel file a sheet's rules and extras become, and come back from (sheets.ts writes and reads the rest
// of the workbook): merged cells; a filter (autoFilter: the values each column shows, or the condition it keeps, with
// the rows it hides written as hidden); conditional formatting, its looks in the styles' dxfs; data validation (lists
// of options or of a range's values, checkboxes as a TRUE,FALSE list, ratings as whole numbers from 0, numbers,
// dates, lengths of words, formulas; a list Excel cannot hold in its rule, or whose chips have colours, on a hidden sheet
// of lists the rule points at, each chip's colour its cell's fill); notes, as comments with the VML drawing Excel shows
// them by, and comments as Excel's threaded comments (with their plain copies, for programs that know only notes); and
// charts, as a drawing of chart parts whose series point at the cells, their values cached for programs that do not
// work them out.
import {
  chartParts,
  cleanChartRange,
  cleanSource,
  colIndex,
  colName,
  cornerAt,
  cornerXY,
  dateText,
  fileFormula,
  formulaFromFile,
  keyOf,
  numText,
  parseDate,
  parseInput,
  parseRange,
  parseRef,
  quoteSheet,
  rangeName,
  rectsOf,
  refName,
  replaceNames,
  sheetSizes,
  sourceOf,
  uniqueSheetName,
  type Calc,
  type Cell,
  type ChartCorner,
  type Cond,
  textOn,
  type CondRule,
  type CondStyle,
  type FilterCol,
  type ListOption,
  type Rect,
  type ScalePoint,
  type Sheet,
  type SheetChart,
  type SheetChartKind,
  type SheetComment,
  type SheetFilter,
  type Validation,
  type Workbook,
} from '../../shared/sheets.ts';
import { chartData, CHART_COLORS, type ChartData } from '../../shared/sheet-chart.ts';
import { newCommentId } from '../../shared/comments.ts';
import { columnValues } from '../../shared/sheet-rules.ts';
import { all, att, kid, kids, parseXml, textOf, type El } from '../documents/xml.ts';
import { esc, XML_HEAD } from './ooxml.ts';
import { officeFont } from './word-fonts.ts';

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const xnum = (n: number) => (Object.is(n, -0) ? '0' : String(n));
const quoted = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** A sheet's merged cells. */
export const mergesXml = (sh: Sheet) => (sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '');

// ---- values in rules ------------------------------------------------------------------------------------------------

/** The formulas date words stand for. */
const DATE_WORD_XL: Record<string, string> = { today: 'TODAY()', tomorrow: 'TODAY()+1', yesterday: 'TODAY()-1', week: 'TODAY()-7', month: 'EDATE(TODAY(),-1)', year: 'EDATE(TODAY(),-12)' };

/** A condition's value as an Excel formula: a number, TRUE or FALSE, words in quotes, a date's day number, or a formula as written. */
function xlValue(a: string | undefined, names: Set<string>, date = false): string {
  if (a === undefined) return '""';
  if (a.startsWith('=')) return fileFormula(a.slice(1), names);
  if (date) {
    const w = DATE_WORD_XL[a.toLowerCase()];
    if (w) return w;
    const d = parseDate(a);
    if (d !== null) return xnum(Math.floor(d));
  }
  const t = parseInput(a);
  if (typeof t.v === 'number') return xnum(t.v);
  if (typeof t.v === 'boolean') return t.v ? 'TRUE' : 'FALSE';
  return quoted(String(t.v ?? a));
}

/** A value from a file's rule as a condition keeps it: a number, words, or "=" and a formula. */
function fromXl(f: string | undefined, names: Map<string, string>, date = false): string | undefined {
  if (f === undefined) return undefined;
  const t = f.trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?$/i.test(t)) return date ? dateText(Number(t)) : numText(Number(t));
  const q = /^"((?:[^"]|"")*)"$/.exec(t);
  if (q) return q[1].replace(/""/g, '"');
  if (/^(TRUE|FALSE)$/i.test(t)) return t.toUpperCase();
  return `=${replaceNames(formulaFromFile(t), names)}`;
}

const XL_OP: Partial<Record<Cond['op'], string>> = { eq: 'equal', neq: 'notEqual', gt: 'greaterThan', gte: 'greaterThanOrEqual', lt: 'lessThan', lte: 'lessThanOrEqual', between: 'between', notBetween: 'notBetween' };
const OP_XL: Record<string, Cond['op']> = Object.fromEntries(Object.entries(XL_OP).map(([k, v]) => [v, k as Cond['op']]));

// ---- the filter ---------------------------------------------------------------------------------------------------

/** A column's condition as Excel's custom filters, where they can say it. */
function customFilter(w: Cond): string {
  const wild = (s: string | undefined) => esc((s ?? '').replace(/[*?~]/g, '~$&'));
  const val = (s: string | undefined) => {
    const t = parseInput(s ?? '');
    return esc(typeof t.v === 'number' ? xnum(t.v) : (s ?? ''));
  };
  const one = (op: string, v: string) => `<customFilter${op === 'equal' ? '' : ` operator="${op}"`} val="${v}"/>`;
  switch (w.op) {
    case 'empty':
      return '<filters blank="1"/>';
    case 'notEmpty':
      return `<customFilters>${one('notEqual', ' ')}</customFilters>`;
    case 'contains':
      return `<customFilters>${one('equal', `*${wild(w.a)}*`)}</customFilters>`;
    case 'notContains':
      return `<customFilters>${one('notEqual', `*${wild(w.a)}*`)}</customFilters>`;
    case 'starts':
      return `<customFilters>${one('equal', `${wild(w.a)}*`)}</customFilters>`;
    case 'ends':
      return `<customFilters>${one('equal', `*${wild(w.a)}`)}</customFilters>`;
    case 'is':
      return `<customFilters>${one('equal', wild(w.a))}</customFilters>`;
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return w.a?.startsWith('=') ? '' : `<customFilters>${one(XL_OP[w.op]!, val(w.a))}</customFilters>`;
    case 'between':
      return `<customFilters and="1">${one('greaterThanOrEqual', val(w.a))}${one('lessThanOrEqual', val(w.b))}</customFilters>`;
    case 'notBetween':
      return `<customFilters>${one('lessThan', val(w.a))}${one('greaterThan', val(w.b))}</customFilters>`;
    case 'dateIs':
    case 'before':
    case 'after': {
      const a = (w.a ?? '').toLowerCase();
      if (w.op === 'dateIs' && (a === 'today' || a === 'yesterday' || a === 'tomorrow')) return `<dynamicFilter type="${a}"/>`;
      const d = parseDate(w.a ?? '');
      if (d === null) return '';
      return w.op === 'dateIs'
        ? `<customFilters and="1">${one('greaterThanOrEqual', xnum(Math.floor(d)))}${one('lessThan', xnum(Math.floor(d) + 1))}</customFilters>`
        : `<customFilters>${one(w.op === 'before' ? 'lessThan' : 'greaterThan', xnum(Math.floor(d)))}</customFilters>`;
    }
  }
  return '';
}

/** A sheet's filter as autoFilter: the values each column shows (or its condition); the rows it hides are written hidden besides. */
export function filterXml(sh: Sheet, si: number, calc: Calc): string {
  const f = sh.filter;
  const x = f ? parseRange(f.range) : null;
  if (!f || !x) return '';
  const cols = Object.entries(f.cols ?? {})
    .map(([k, fc]) => [colIndex(k), fc] as const)
    .filter(([c]) => c >= x.c1 && c <= x.c2)
    .sort((a, b) => a[0] - b[0]);
  const parts = cols.map(([c, fc]) => {
    const id = c - x.c1;
    if (fc.hide?.length) {
      const hidden = new Set(fc.hide.map((h) => h.toLowerCase()));
      const shown = columnValues(sh, si, calc, x, c).filter((v) => !hidden.has(v.v.toLowerCase()));
      const blank = shown.some((v) => v.v === '');
      return `<filterColumn colId="${id}"><filters${blank ? ' blank="1"' : ''}>${shown
        .filter((v) => v.v !== '')
        .map((v) => `<filter val="${esc(v.v)}"/>`)
        .join('')}</filters></filterColumn>`;
    }
    const cf = fc.when ? customFilter(fc.when) : '';
    return cf ? `<filterColumn colId="${id}">${cf}</filterColumn>` : '';
  });
  return `<autoFilter ref="${rangeName(x)}">${parts.join('')}</autoFilter>`;
}

/** A file's autoFilter as a filter: the values a column shows become those it hides (of what the column holds). */
export function readFilter(xml: string, cellText: (r: number, c: number) => string): SheetFilter | null {
  const m = /<(?:\w+:)?autoFilter\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?autoFilter>)/.exec(xml);
  if (!m) return null;
  const el = parseXml(m[0]).root;
  const x = parseRange(att(el, 'ref') ?? '');
  if (!x) return null;
  const out: SheetFilter = { range: rangeName(x) };
  const cols: Record<string, FilterCol> = {};
  for (const fcEl of kids(el, 'filterColumn')) {
    const c = x.c1 + Number(att(fcEl, 'colId') ?? -1);
    if (c < x.c1 || c > x.c2) continue;
    const fc: FilterCol = {};
    const filters = kid(fcEl, 'filters');
    const custom = kid(fcEl, 'customFilters');
    const dynamic = kid(fcEl, 'dynamicFilter');
    if (filters) {
      const shown = new Set(kids(filters, 'filter').map((f) => (att(f, 'val') ?? '').toLowerCase()));
      const blank = att(filters, 'blank') === '1' || att(filters, 'blank') === 'true';
      if (!shown.size && blank) fc.when = { op: 'empty' };
      else {
        const hide = new Set<string>();
        for (let r = x.r1 + 1; r <= x.r2; r++) {
          const t = cellText(r, c);
          if (t === '' ? !blank : !shown.has(t.toLowerCase())) hide.add(t);
        }
        if (hide.size) fc.hide = [...hide].slice(0, 5000);
      }
    } else if (custom) {
      const list = kids(custom, 'customFilter').map((f) => ({ op: att(f, 'operator') ?? 'equal', v: att(f, 'val') ?? '' }));
      const and = att(custom, 'and') === '1' || att(custom, 'and') === 'true';
      const plain = (v: string) => v.replace(/~([*?~])/g, '$1');
      if (list.length === 2 && and && list[0].op === 'greaterThanOrEqual' && list[1].op === 'lessThanOrEqual') fc.when = { op: 'between', a: list[0].v, b: list[1].v };
      else if (list.length === 2 && !and && list[0].op === 'lessThan' && list[1].op === 'greaterThan') fc.when = { op: 'notBetween', a: list[0].v, b: list[1].v };
      else if (list.length >= 1) {
        const { op, v } = list[0];
        const wild = /^\*.*\*$/.test(v) && v.length > 1 ? 'mid' : v.endsWith('*') && !v.endsWith('~*') ? 'start' : v.startsWith('*') ? 'end' : '';
        if (op === 'notEqual' && v === ' ') fc.when = { op: 'notEmpty' };
        else if (op === 'equal' && wild === 'mid') fc.when = { op: 'contains', a: plain(v.slice(1, -1)) };
        else if (op === 'notEqual' && wild === 'mid') fc.when = { op: 'notContains', a: plain(v.slice(1, -1)) };
        else if (op === 'equal' && wild === 'start') fc.when = { op: 'starts', a: plain(v.slice(0, -1)) };
        else if (op === 'equal' && wild === 'end') fc.when = { op: 'ends', a: plain(v.slice(1)) };
        else if (op === 'equal' && !/^-?[\d.]+$/.test(v)) fc.when = { op: 'is', a: plain(v) };
        else if (OP_XL[op]) fc.when = { op: OP_XL[op], a: v };
      }
    } else if (dynamic) {
      const t = att(dynamic, 'type');
      if (t === 'today' || t === 'yesterday' || t === 'tomorrow') fc.when = { op: 'dateIs', a: t };
      else if (t === 'aboveAverage' || t === 'belowAverage') continue;
    }
    if (fc.hide || fc.when) cols[colName(c)] = fc;
  }
  if (Object.keys(cols).length) out.cols = cols;
  return out;
}

// ---- conditional formatting ---------------------------------------------------------------------------------------

/** The looks of conditional formatting, each written once (styles.xml's dxfs). */
export class Dxfs {
  list: string[] = [];
  add(s: CondStyle): number {
    const font = s.b || s.i || s.u || s.s || s.color ? `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.s ? '<strike/>' : ''}${s.u ? '<u/>' : ''}${s.color ? `<color rgb="${argb(s.color)}"/>` : ''}</font>` : '';
    const fill = s.fill ? `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.fill)}"/><bgColor rgb="${argb(s.fill)}"/></patternFill></fill>` : '';
    const xml = `<dxf>${font}${fill}</dxf>`;
    const i = this.list.indexOf(xml);
    return i >= 0 ? i : this.list.push(xml) - 1;
  }
  xml(): string {
    return this.list.length ? `<dxfs count="${this.list.length}">${this.list.join('')}</dxfs>` : '<dxfs count="0"/>';
  }
}

/** A rule's condition as a cfRule (its first cell's name for the formulas Excel writes with some of them). */
function cfRule(w: Cond, dxf: number, priority: number, tl: string, names: Set<string>): string {
  const head = (type: string, more = '') => `<cfRule type="${type}" dxfId="${dxf}" priority="${priority}"${more}>`;
  const f = (x: string) => `<formula>${esc(x)}</formula>`;
  const q = quoted(w.a ?? '');
  switch (w.op) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return `${head('cellIs', ` operator="${XL_OP[w.op]}"`)}${f(xlValue(w.a, names))}</cfRule>`;
    case 'between':
    case 'notBetween':
      return `${head('cellIs', ` operator="${XL_OP[w.op]}"`)}${f(xlValue(w.a, names))}${f(xlValue(w.b, names))}</cfRule>`;
    case 'is':
      return `${head('cellIs', ' operator="equal"')}${f(w.a?.startsWith('=') ? xlValue(w.a, names) : q)}</cfRule>`;
    case 'contains':
      return `${head('containsText', ` operator="containsText" text="${esc(w.a ?? '')}"`)}${f(`NOT(ISERROR(SEARCH(${q},${tl})))`)}</cfRule>`;
    case 'notContains':
      return `${head('notContainsText', ` operator="notContains" text="${esc(w.a ?? '')}"`)}${f(`ISERROR(SEARCH(${q},${tl}))`)}</cfRule>`;
    case 'starts':
      return `${head('beginsWith', ` operator="beginsWith" text="${esc(w.a ?? '')}"`)}${f(`LEFT(${tl},LEN(${q}))=${q}`)}</cfRule>`;
    case 'ends':
      return `${head('endsWith', ` operator="endsWith" text="${esc(w.a ?? '')}"`)}${f(`RIGHT(${tl},LEN(${q}))=${q}`)}</cfRule>`;
    case 'empty':
      return `${head('containsBlanks')}${f(`LEN(TRIM(${tl}))=0`)}</cfRule>`;
    case 'notEmpty':
      return `${head('notContainsBlanks')}${f(`LEN(TRIM(${tl}))>0`)}</cfRule>`;
    case 'dateIs':
    case 'before':
    case 'after': {
      const a = (w.a ?? '').toLowerCase();
      if (w.op === 'dateIs') {
        if (a === 'today') return `${head('timePeriod', ' timePeriod="today"')}${f(`FLOOR(${tl},1)=TODAY()`)}</cfRule>`;
        if (a === 'yesterday') return `${head('timePeriod', ' timePeriod="yesterday"')}${f(`FLOOR(${tl},1)=TODAY()-1`)}</cfRule>`;
        if (a === 'tomorrow') return `${head('timePeriod', ' timePeriod="tomorrow"')}${f(`FLOOR(${tl},1)=TODAY()+1`)}</cfRule>`;
        if (a === 'week') return `${head('timePeriod', ' timePeriod="last7Days"')}${f(`AND(TODAY()-FLOOR(${tl},1)<=6,FLOOR(${tl},1)<=TODAY())`)}</cfRule>`;
        if (a === 'month' || a === 'year') return `${head('expression')}${f(`AND(FLOOR(${tl},1)>=${DATE_WORD_XL[a]},FLOOR(${tl},1)<=TODAY())`)}</cfRule>`;
        return `${head('expression')}${f(`FLOOR(${tl},1)=${xlValue(w.a, names, true)}`)}</cfRule>`;
      }
      return `${head('expression')}${f(`AND(ISNUMBER(${tl}),FLOOR(${tl},1)${w.op === 'before' ? '<' : '>'}${xlValue(w.a, names, true)})`)}</cfRule>`;
    }
    case 'formula':
      return `${head('expression')}${f(xlValue(w.a, names))}</cfRule>`;
    case 'dup':
      return `${head('duplicateValues')}</cfRule>`;
    case 'unique':
      return `${head('uniqueValues')}</cfRule>`;
    case 'top':
    case 'bottom':
      return `${head('top10', `${w.b === '%' ? ' percent="1"' : ''}${w.op === 'bottom' ? ' bottom="1"' : ''} rank="${Number(w.a ?? 10) || 10}"`)}</cfRule>`;
    case 'above':
    case 'below':
      return `${head('aboveAverage', w.op === 'below' ? ' aboveAverage="0"' : '')}</cfRule>`;
  }
  return '';
}

const cfvo = (p: ScalePoint, place: 'min' | 'mid' | 'max') => {
  const at = p.at ?? (place === 'mid' ? 'pctile' : place);
  const type = at === 'pct' ? 'percent' : at === 'pctile' ? 'percentile' : at;
  return `<cfvo type="${type}"${at === 'min' || at === 'max' ? '' : ` val="${xnum(p.v ?? 50)}"`}/>`;
};

/**
 * The colours of a list's options, as conditional formatting Excel shows: a cell holding a coloured option filled with
 * its colour (the editor draws it as a chip of that colour), after the sheet's own rules.
 */
export function listColorRules(sh: Sheet): CondRule[] {
  return (sh.validation ?? []).flatMap((v) => (v.type === 'list' ? (v.options ?? []).filter((o) => o.color).map((o) => ({ range: v.range, when: { op: 'is' as const, a: o.v }, style: { fill: o.color, color: textOn(o.color!) } })) : []));
}

/** Whether a rule read from a file is one listColorRules wrote for a list of the sheet's (so not a rule of its own). */
export const isListColor = (rule: CondRule, lists: Validation[]) =>
  rule.when?.op === 'is' &&
  !!rule.style?.fill &&
  Object.keys(rule.style).every((k) => k === 'fill' || k === 'color') &&
  lists.some((v) => v.type === 'list' && v.range === rule.range && (v.options ?? []).some((o) => !!o.color && o.v === rule.when!.a && o.color === rule.style!.fill && (rule.style!.color ?? textOn(o.color)) === textOn(o.color)));

/** A sheet's conditional formatting, in its rules' order (their priorities), and its lists' colours after them. */
export function condXml(sh: Sheet, dxfs: Dxfs, names: Set<string>): string {
  let priority = 0;
  return [...(sh.conditional ?? []), ...listColorRules(sh)]
    .map((rule) => {
      const first = rectsOf(rule.range)[0];
      if (!first) return '';
      priority++;
      let inner = '';
      if (rule.scale) {
        const pts: [ScalePoint, 'min' | 'mid' | 'max'][] = [[rule.scale.min, 'min'], ...(rule.scale.mid ? [[rule.scale.mid, 'mid'] as [ScalePoint, 'mid']] : []), [rule.scale.max, 'max']];
        inner = `<cfRule type="colorScale" priority="${priority}"><colorScale>${pts.map(([p, k]) => cfvo(p, k)).join('')}${pts.map(([p]) => `<color rgb="${argb(p.color)}"/>`).join('')}</colorScale></cfRule>`;
      } else if (rule.bar) inner = `<cfRule type="dataBar" priority="${priority}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="${argb(rule.bar.color)}"/></dataBar></cfRule>`;
      else if (rule.when && rule.style) inner = cfRule(rule.when, dxfs.add(rule.style), priority, refName(first.r1, first.c1), names);
      return inner ? `<conditionalFormatting sqref="${rule.range.split(',').join(' ')}">${inner}</conditionalFormatting>` : '';
    })
    .join('');
}

/** A file's dxfs (in styles.xml) as looks conditional formatting gives. */
export function readDxfs(stylesXml: string | null, colorOf: (el: El | undefined) => string | null): CondStyle[] {
  if (!stylesXml) return [];
  const m = /<(?:\w+:)?dxfs\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?dxfs>)/.exec(stylesXml);
  if (!m) return [];
  return kids(parseXml(m[0]).root, 'dxf').map((d) => {
    const s: CondStyle = {};
    const font = kid(d, 'font');
    const on = (el: El | undefined) => !!el && !['0', 'false'].includes(att(el, 'val') ?? '1');
    if (on(kid(font, 'b'))) s.b = true;
    if (on(kid(font, 'i'))) s.i = true;
    if (on(kid(font, 'strike'))) s.s = true;
    if (kid(font, 'u') && att(kid(font, 'u'), 'val') !== 'none') s.u = true;
    const color = colorOf(kid(font, 'color'));
    if (color) s.color = color;
    const pf = kid(kid(d, 'fill'), 'patternFill');
    const fill = colorOf(kid(pf, 'bgColor')) ?? colorOf(kid(pf, 'fgColor'));
    if (fill) s.fill = fill;
    return s;
  });
}

/** A file's conditional formatting as rules, in their priorities' order (what this cannot show is left out). */
export function readConditional(xml: string, dxfs: CondStyle[], names: Map<string, string>, colorOf: (el: El | undefined) => string | null): CondRule[] {
  const found: { p: number; rule: CondRule }[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?conditionalFormatting\b[\s\S]*?<\/(?:\w+:)?conditionalFormatting>/g)) {
    const el = parseXml(m[0]).root;
    const range = (att(el, 'sqref') ?? '')
      .split(/\s+/)
      .filter((x) => parseRange(x))
      .slice(0, 20)
      .join(',');
    if (!range) continue;
    for (const r of kids(el, 'cfRule')) {
      const type = att(r, 'type') ?? '';
      const fs = kids(r, 'formula').map((f) => textOf(f));
      const style = dxfs[Number(att(r, 'dxfId') ?? -1)];
      const p = Number(att(r, 'priority') ?? 1e6);
      const rule = ruleOf(type, r, fs, style, range, names, colorOf);
      if (rule) found.push({ p, rule });
    }
  }
  return found
    .sort((a, b) => a.p - b.p)
    .map((x) => x.rule)
    .slice(0, 100);
}

/** A date condition as cfRule writes it in a formula (before or after a day, on a day, within the last month or year), back as that condition; null for another formula. */
function dateRule(f: string, range: string): Cond | null {
  const first = rectsOf(range)[0];
  if (!first) return null;
  const x = refName(first.r1, first.c1);
  const day = (s: string) => Object.entries(DATE_WORD_XL).find(([, v]) => v === s)?.[0] ?? (/^\d+$/.test(s) ? dateText(Number(s)) : null);
  const t = f.trim();
  let m = new RegExp(`^AND\\(ISNUMBER\\(${x}\\),FLOOR\\(${x},1\\)([<>])(.+)\\)$`).exec(t);
  if (m) {
    const a = day(m[2]);
    return a ? { op: m[1] === '<' ? 'before' : 'after', a } : null;
  }
  m = new RegExp(`^FLOOR\\(${x},1\\)=(.+)$`).exec(t);
  if (m) {
    const a = day(m[1]);
    return a ? { op: 'dateIs', a } : null;
  }
  m = new RegExp(`^AND\\(FLOOR\\(${x},1\\)>=EDATE\\(TODAY\\(\\),-(1|12)\\),FLOOR\\(${x},1\\)<=TODAY\\(\\)\\)$`).exec(t);
  return m ? { op: 'dateIs', a: m[1] === '1' ? 'month' : 'year' } : null;
}

function ruleOf(type: string, r: El, fs: string[], style: CondStyle | undefined, range: string, names: Map<string, string>, colorOf: (el: El | undefined) => string | null): CondRule | null {
  if (type === 'colorScale') {
    const cs = kid(r, 'colorScale');
    const vos = kids(cs, 'cfvo');
    const cols = kids(cs, 'color').map((c) => colorOf(c));
    const point = (i: number, place: 'min' | 'mid' | 'max'): ScalePoint | null => {
      const color = cols[i];
      if (!color) return null;
      const t = att(vos[i], 'type') ?? place;
      const at = t === 'percent' ? 'pct' : t === 'percentile' ? 'pctile' : t === 'num' ? 'num' : t === 'max' ? 'max' : 'min';
      const v = Number(att(vos[i], 'val'));
      const def = place === 'mid' ? 'pctile' : place;
      const out: ScalePoint = { color };
      if (at !== def || (at === 'pctile' && v !== 50)) out.at = at;
      if ((at === 'num' || at === 'pct' || at === 'pctile') && Number.isFinite(v) && !(at === 'pctile' && v === 50 && def === 'pctile')) out.v = v;
      return out;
    };
    const three = vos.length >= 3;
    const min = point(0, 'min');
    const max = point(three ? 2 : 1, 'max');
    const mid = three ? point(1, 'mid') : null;
    return min && max ? { range, scale: { min, ...(mid ? { mid } : {}), max } } : null;
  }
  if (type === 'dataBar') {
    const color = colorOf(kid(kid(r, 'dataBar'), 'color')) ?? '#638ec6';
    return { range, bar: { color } };
  }
  if (!style || !Object.keys(style).length) return null;
  const op = att(r, 'operator') ?? '';
  const text = att(r, 'text');
  let when: Cond | null = null;
  switch (type) {
    case 'cellIs': {
      const o = OP_XL[op] ?? (op ? null : 'between');
      if (!o) break;
      const a = fromXl(fs[0], names);
      const quotedWords = /^"/.test((fs[0] ?? '').trim());
      if (o === 'eq' && quotedWords) when = { op: 'is', a: a ?? '' };
      else if (o === 'between' || o === 'notBetween') when = a !== undefined && fs[1] !== undefined ? { op: o, a, b: fromXl(fs[1], names)! } : null;
      else if (a !== undefined) when = { op: o, a };
      break;
    }
    case 'containsText':
      when = text !== undefined ? { op: 'contains', a: text } : null;
      break;
    case 'notContainsText':
      when = text !== undefined ? { op: 'notContains', a: text } : null;
      break;
    case 'beginsWith':
      when = text !== undefined ? { op: 'starts', a: text } : null;
      break;
    case 'endsWith':
      when = text !== undefined ? { op: 'ends', a: text } : null;
      break;
    case 'containsBlanks':
      when = { op: 'empty' };
      break;
    case 'notContainsBlanks':
      when = { op: 'notEmpty' };
      break;
    case 'timePeriod': {
      const t = att(r, 'timePeriod');
      const word = t === 'today' || t === 'yesterday' || t === 'tomorrow' ? t : t === 'last7Days' ? 'week' : t === 'lastMonth' || t === 'thisMonth' ? 'month' : null;
      when = word ? { op: 'dateIs', a: word } : null;
      break;
    }
    case 'expression':
      when = fs[0] ? (dateRule(fs[0], range) ?? { op: 'formula', a: `=${replaceNames(formulaFromFile(fs[0]), names)}` }) : null;
      break;
    case 'duplicateValues':
      when = { op: 'dup' };
      break;
    case 'uniqueValues':
      when = { op: 'unique' };
      break;
    case 'top10': {
      const bottom = att(r, 'bottom') === '1';
      when = { op: bottom ? 'bottom' : 'top', a: String(Number(att(r, 'rank') ?? 10) || 10), ...(att(r, 'percent') === '1' ? { b: '%' } : {}) };
      break;
    }
    case 'aboveAverage':
      when = { op: att(r, 'aboveAverage') === '0' ? 'below' : 'above' };
      break;
  }
  return when ? { range, when, style } : null;
}

// ---- data validation ----------------------------------------------------------------------------------------------

/** A range written fixed ($A$1:$A$9), on its sheet when it names one. */
const fixedRef = (source: string): string => {
  const m = /^(.*!)?([A-Z]{1,3})(\d+)(?::([A-Z]{1,3})(\d+))?$/.exec(source);
  if (!m) return source;
  return `${m[1] ?? ''}$${m[2]}$${m[3]}${m[4] ? `:$${m[4]}$${m[5]}` : ''}`;
};

// ---- lists on a sheet of their own ------------------------------------------------------------------------------

/** The hidden sheet a file keeps lists on that its rules cannot hold (and their chips' colours, as the cells' fills). */
export const LISTS_SHEET = 'Hydor lists';
/** That sheet's name as a file writes it, or as it is beside a sheet of that name ("Hydor lists (2)"). */
export const isListsSheet = (name: string) => /^Hydor lists( \(\d+\))?$/.test(name);

/**
 * The lists a file's rules cannot hold in their own words (Excel's hold at most 255 characters, no commas or quotes
 * in an option) and those whose chips have colours: each in a column of a hidden sheet, an option a cell (a number
 * as a number, so typed numbers match), its chip's colour the cell's fill; the rule points at its column.
 */
export function listsSheet(book: Workbook): { sheet: Sheet | null; ref: Map<Validation, string> } {
  const ref = new Map<Validation, string>();
  const cells: Record<string, Cell> = {};
  const name = uniqueSheetName(LISTS_SHEET, book.sheets.map((s) => s.name));
  let col = 0;
  for (const sh of book.sheets)
    for (const v of sh.validation ?? []) {
      if (v.type !== 'list' || !v.options?.length || col >= 16_384) continue;
      if (!v.options.some((o) => o.color || /[",]/.test(o.v)) && v.options.map((o) => o.v).join(',').length <= 255) continue;
      v.options.forEach((o, r) => {
        const n = Number(o.v);
        cells[refName(r, col)] = { v: o.v.trim() && String(n) === o.v ? n : o.v, ...(o.color ? { s: { fill: o.color } } : {}) };
      });
      ref.set(v, `${quoteSheet(name)}!$${colName(col)}$1:$${colName(col)}$${v.options.length}`);
      col++;
    }
  return { sheet: col ? { id: 'lists', name, cells } : null, ref };
}

/** A list rule's options from the hidden sheet a file of this app's keeps them on (their colours from the cells' fills), or null. */
export function listFromSheet(source: string, sheets: { name: string; cells: Record<string, Cell> }[]): ListOption[] | null {
  const src = sourceOf(source);
  const on = src?.sheet ? sheets.find((s) => s.name.toLowerCase() === src.sheet!.toLowerCase()) : undefined;
  if (!src || !on) return null;
  const out: ListOption[] = [];
  for (let r = src.x.r1; r <= Math.min(src.x.r2, src.x.r1 + 499); r++) {
    const cell = on.cells[refName(r, src.x.c1)];
    const v = typeof cell?.v === 'number' ? numText(cell.v) : typeof cell?.v === 'string' ? cell.v : typeof cell?.v === 'boolean' ? (cell.v ? 'TRUE' : 'FALSE') : '';
    if (v.trim()) out.push(cell?.s?.fill ? { v, color: cell.s.fill } : { v });
  }
  return out.length ? out : null;
}

/** A rule for what cells take as a dataValidation (a checkbox as a TRUE,FALSE list, a rating as a whole number from 0); `lists`: where the lists on their own sheet are. */
function validationOne(v: Validation, names: Set<string>, lists?: Map<Validation, string>): string {
  const sqref = v.range.split(',').join(' ');
  const base = `allowBlank="1" showErrorMessage="1"${v.reject ? '' : ' errorStyle="warning"'} sqref="${sqref}"`;
  const f = (n: 1 | 2, x: string) => `<formula${n}>${esc(x)}</formula${n}>`;
  const cond = (type: string, w: Cond | undefined, date: boolean, anyLo: string, anyHi: string) => {
    if (!w) return `<dataValidation type="${type}" operator="between" ${base}>${f(1, anyLo)}${f(2, anyHi)}</dataValidation>`;
    const two = w.op === 'between' || w.op === 'notBetween';
    return `<dataValidation type="${type}"${w.op === 'between' ? '' : ` operator="${XL_OP[w.op] ?? 'equal'}"`} ${base}>${f(1, xlValue(w.a, names, date))}${two ? f(2, xlValue(w.b, names, date)) : ''}</dataValidation>`;
  };
  switch (v.type) {
    case 'list': {
      if (v.source) return `<dataValidation type="list" ${base}>${f(1, fileFormula(fixedRef(v.source), names))}</dataValidation>`;
      const own = lists?.get(v);
      if (own) return `<dataValidation type="list" ${base}>${f(1, fileFormula(own, names))}</dataValidation>`;
      // Excel's own lists hold at most 255 characters, without commas or quotes in an option.
      const items: string[] = [];
      let len = 0;
      for (const o of v.options ?? []) {
        if (/[",]/.test(o.v)) continue;
        if (len + o.v.length + 1 > 255) break;
        items.push(o.v);
        len += o.v.length + 1;
      }
      return items.length ? `<dataValidation type="list" ${base}>${f(1, `"${items.join(',')}"`)}</dataValidation>` : '';
    }
    case 'checkbox':
      return `<dataValidation type="list" ${base}>${f(1, '"TRUE,FALSE"')}</dataValidation>`;
    case 'rating': {
      const max = v.max ?? 5;
      return `<dataValidation type="whole" operator="between" ${base} showInputMessage="1" promptTitle="Rating" prompt="${esc(`From 0 to ${max} stars`)}">${f(1, '0')}${f(2, String(max))}</dataValidation>`;
    }
    case 'number':
      return cond('decimal', v.when, false, '-1E+307', '1E+307');
    case 'date':
      return cond('date', v.when, true, '1', '2958465');
    case 'length':
      return cond('textLength', v.when, false, '0', '32767');
    case 'formula':
      return v.when?.a ? `<dataValidation type="custom" ${base}>${f(1, xlValue(v.when.a, names))}</dataValidation>` : '';
  }
  return '';
}

export function validationXml(sh: Sheet, names: Set<string>, lists?: Map<Validation, string>): string {
  const list = (sh.validation ?? []).map((v) => validationOne(v, names, lists)).filter(Boolean);
  return list.length ? `<dataValidations count="${list.length}">${list.join('')}</dataValidations>` : '';
}

/** A file's data validation as rules (lists, checkboxes, ratings, numbers, dates, lengths, formulas). */
export function readValidation(xml: string, names: Map<string, string>): Validation[] {
  const m = /<(?:\w+:)?dataValidations\b[\s\S]*?<\/(?:\w+:)?dataValidations>/.exec(xml);
  if (!m) return [];
  const out: Validation[] = [];
  for (const d of kids(parseXml(m[0]).root, 'dataValidation')) {
    const range = (att(d, 'sqref') ?? '')
      .split(/\s+/)
      .filter((x) => parseRange(x))
      .slice(0, 20)
      .join(',');
    if (!range) continue;
    const type = att(d, 'type') ?? 'none';
    const f1 = textOf(kid(d, 'formula1')).trim();
    const f2 = kid(d, 'formula2') ? textOf(kid(d, 'formula2')).trim() : undefined;
    const reject = att(d, 'showErrorMessage') === '1' && (att(d, 'errorStyle') ?? 'stop') === 'stop';
    const op = att(d, 'operator') ?? 'between';
    const when = (date: boolean): Cond | undefined => {
      const o = OP_XL[op];
      if (!o) return undefined;
      const a = fromXl(f1, names, date);
      if (a === undefined) return undefined;
      return o === 'between' || o === 'notBetween' ? (f2 !== undefined ? { op: o, a, b: fromXl(f2, names, date)! } : undefined) : { op: o, a };
    };
    let v: Validation | null = null;
    if (type === 'list') {
      const q = /^"([\s\S]*)"$/.exec(f1);
      if (q) {
        const items = q[1]
          .replace(/""/g, '"')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        if (
          items.length === 2 &&
          items
            .map((x) => x.toUpperCase())
            .sort()
            .join(',') === 'FALSE,TRUE'
        )
          v = { range, type: 'checkbox' };
        else if (items.length) v = { range, type: 'list', options: items.slice(0, 500).map((x): ListOption => ({ v: x })) };
      } else {
        const source = cleanSource(replaceNames(formulaFromFile(f1), names).replace(/\$/g, ''));
        if (source) v = { range, type: 'list', source };
      }
    } else if (type === 'whole' && att(d, 'promptTitle') === 'Rating' && op === 'between' && f1 === '0' && f2 && /^\d+$/.test(f2)) {
      v = { range, type: 'rating', ...(Number(f2) !== 5 ? { max: Math.min(10, Number(f2)) } : {}) };
    } else if (type === 'whole' || type === 'decimal') {
      const w = when(false);
      const any = op === 'between' && /^-?1E\+?307$/i.test(f1);
      v = { range, type: 'number', ...(w && !any ? { when: w } : {}) };
    } else if (type === 'date') {
      const w = when(true);
      v = { range, type: 'date', ...(w && !(op === 'between' && f1 === '1' && f2 === '2958465') ? { when: w } : {}) };
    } else if (type === 'textLength') {
      const w = when(false);
      if (w) v = { range, type: 'length', when: w };
    } else if (type === 'custom' && f1) v = { range, type: 'formula', when: { op: 'formula', a: `=${replaceNames(formulaFromFile(f1), names)}` } };
    if (v) {
      if (reject) v.reject = true;
      out.push(v);
    }
    if (out.length >= 100) break;
  }
  return out;
}

// ---- notes ------------------------------------------------------------------------------------------------------------

const NS_TC = 'http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments';
const on = (v: string | undefined) => v !== undefined && v !== '0' && v !== 'false';
/** Excel's people for threaded comments: the user and agents (their comments read back as theirs by these names). */
const PERSONS = { user: { id: '{6F1C3A2B-0000-4000-8000-0000000000A1}', name: 'User' }, agent: { id: '{6F1C3A2B-0000-4000-8000-0000000000A2}', name: 'Agent' } };
/** Someone named who wrote a comment (one that came from a file): an id made from the name, the same each time. */
function personId(name: string): string {
  let a = 0x811c9dc5;
  let b = 0;
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = (Math.imul(b, 31) + c) >>> 0;
  }
  return `{6F1C3A2B-0000-4000-9000-${(a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0').slice(0, 4)).toUpperCase()}}`;
}
/** The names of those other than you and agents who wrote a workbook's comments and replies. */
export function namedAuthors(book: Workbook): string[] {
  const out = new Set<string>();
  for (const sh of book.sheets) for (const c of sh.comments ?? []) for (const x of [c, ...(c.replies ?? [])]) if (x.author) out.add(x.author);
  return [...out];
}
/** The workbook's people part, for its threaded comments: the user, agents and everyone named (`named`). */
export const personsXml = (named: string[] = []) =>
  `${XML_HEAD}<personList xmlns="${NS_TC}" xmlns:x="${NS_MAIN}">${[...Object.values(PERSONS), ...named.map((name) => ({ id: personId(name), name }))]
    .map((p) => `<person displayName="${esc(p.name)}" id="${p.id}" userId="${esc(p.name)}" providerId="None"/>`)
    .join('')}</personList>`;

/** The words Excel's own files put in a threaded comment's plain copy, for programs that know only notes. */
const THREAD_HEAD =
  '[Threaded comment]\n\nYour version of Excel allows you to read this threaded comment; however, any edits to it will get removed if the file is opened in a newer version of Excel. Learn more: https://go.microsoft.com/fwlink/?linkid=870924\n\n';
/** Words as a comment's text: marked to keep the spaces at their ends where they have them, as Excel's own files are (only there: ECMA-376's schema has no xml:space on them). */
const tXml = (s: string) => `<t${/^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''}>${esc(s)}</t>`;

/** A thread as words: its comment and replies, as a plain copy has them. */
const threadWords = (c: SheetComment) => `Comment:\n    ${c.text.replace(/\n/g, '\n    ')}${(c.replies ?? []).map((r) => `\nReply:\n    ${r.text.replace(/\n/g, '\n    ')}`).join('')}`;

/**
 * A sheet's notes and comments as Excel keeps them: the comments part (a note's words; a comment's plain copy, linked
 * to its thread), the VML drawing that shows them (Excel needs both), and the threaded comments part (each comment and
 * its replies, by User or Agent, resolved or not). A cell with a note and a comment too keeps both as one note, the
 * thread's words after the note's (Excel holds one or the other on a cell). `n`: the sheet's number from 1.
 */
export function commentsXml(sh: Sheet, n: number): { comments: string; vml: string; threaded: string | null } | null {
  const notes = Object.entries(sh.cells).filter(([, c]) => c.note);
  const threads = new Map((sh.comments ?? []).map((c) => [c.cell, c] as const));
  const cells = [...new Set([...notes.map(([k]) => k), ...threads.keys()])].sort((a, b) => keyOf(a) - keyOf(b)).slice(0, 10_000);
  if (!cells.length) return null;
  let g = 0;
  const guid = () => `{${n.toString(16).padStart(8, '0').toUpperCase()}-0000-4000-8000-${(++g).toString(16).padStart(12, '0').toUpperCase()}}`;
  const authors = ['Hydor'];
  const list: string[] = [];
  const tc: string[] = [];
  const stamp = (at: number) => new Date(at).toISOString().replace(/Z$/, '');
  for (const k of cells) {
    const note = sh.cells[k]?.note;
    const c = threads.get(k);
    if (c && !note) {
      const id = guid();
      authors.push(`tc=${id}`);
      list.push(`<comment ref="${k}" authorId="${authors.length - 1}" shapeId="0" xr:uid="${id}"><text>${tXml(THREAD_HEAD + threadWords(c))}</text></comment>`);
      const who = (x: { by: 'user' | 'agent'; author?: string }) => (x.author ? personId(x.author) : PERSONS[x.by].id);
      tc.push(`<threadedComment ref="${k}" dT="${stamp(c.at)}" personId="${who(c)}" id="${id}"${c.resolved ? ' done="1"' : ''}><text>${esc(c.text)}</text></threadedComment>`);
      for (const r of c.replies ?? []) tc.push(`<threadedComment ref="${k}" dT="${stamp(r.at)}" personId="${who(r)}" id="${guid()}" parentId="${id}"><text>${esc(r.text)}</text></threadedComment>`);
    } else {
      const words = note && c ? `${note}\n\n${threadWords(c)}` : (note ?? '');
      list.push(`<comment ref="${k}" authorId="0"><text><r>${tXml(words)}</r></text></comment>`);
    }
  }
  const comments =
    `${XML_HEAD}<comments xmlns="${NS_MAIN}"${tc.length ? ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="xr" xmlns:xr="http://schemas.microsoft.com/office/spreadsheetml/2014/revision"' : ''}>` +
    `<authors>${authors.map((a) => `<author>${esc(a)}</author>`).join('')}</authors><commentList>${list.join('')}</commentList></comments>`;
  const shapes = cells
    .map((k, i) => {
      const p = parseRef(k)!;
      return (
        `<v:shape id="_x0000_s${n * 1024 + 1 + i}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:160pt;height:64pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">` +
        '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>' +
        `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${p.c + 1}, 15, ${Math.max(0, p.r - 1)}, 2, ${p.c + 3}, 15, ${p.r + 3}, 16</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${p.r}</x:Row><x:Column>${p.c}</x:Column></x:ClientData></v:shape>`
      );
    })
    .join('');
  const vml =
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${n}"/></o:shapelayout>` +
    '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' +
    `${shapes}</xml>`;
  const threaded = tc.length ? `${XML_HEAD}<ThreadedComments xmlns="${NS_TC}" xmlns:x="${NS_MAIN}">${tc.join('')}</ThreadedComments>` : null;
  return { comments, vml, threaded };
}

/** A file's people by id: their names (persons part). */
export function readPersons(xml: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (xml) for (const p of all(parseXml(xml).root, 'person')) if (att(p, 'id')) out.set(att(p, 'id')!, att(p, 'displayName') ?? '');
  return out;
}

/**
 * A sheet's threaded comments part as comments: each thread on its cell with its replies (by when they were written),
 * resolved or not; Agent's are an agent's, User's yours, and anyone else's keep their name (author).
 */
export function readThreaded(xml: string | null, persons: Map<string, string>): SheetComment[] {
  if (!xml) return [];
  const all2 = all(parseXml(xml).root, 'threadedComment');
  const at = (t: string | undefined) => {
    const ms = t ? Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`) : NaN;
    return Number.isFinite(ms) ? ms : Date.now();
  };
  const who = (id: string | undefined): { by: 'user' | 'agent'; name: string } => {
    const name = persons.get(id ?? '') ?? '';
    return { by: name === PERSONS.agent.name ? 'agent' : 'user', name: name === PERSONS.agent.name || name === PERSONS.user.name ? '' : name };
  };
  const words = (el: El) => {
    const w = who(att(el, 'personId'));
    return { by: w.by, text: textOf(kid(el, 'text')).trim(), ...(w.name.trim() ? { author: w.name.trim().slice(0, 80) } : {}) };
  };
  const roots = new Map<string, SheetComment>();
  for (const el of all2) {
    const ref = att(el, 'ref')?.replace(/\$/g, '').toUpperCase();
    const id = att(el, 'id');
    if (!ref || !id || att(el, 'parentId') || !parseRef(ref)) continue;
    const w = words(el);
    if (!w.text) continue;
    roots.set(id, { id: newCommentId(), cell: ref, by: w.by, ...(w.author ? { author: w.author } : {}), text: w.text.slice(0, 4000), at: at(att(el, 'dT')), ...(on(att(el, 'done')) ? { resolved: true } : {}) });
  }
  for (const el of all2) {
    const root = roots.get(att(el, 'parentId') ?? '');
    const w = root ? words(el) : null;
    if (!root || !w?.text) continue;
    root.replies = [...(root.replies ?? []), { id: newCommentId(), by: w.by, ...(w.author ? { author: w.author } : {}), text: w.text.slice(0, 4000), at: at(att(el, 'dT')) }].sort((a, b) => a.at - b.at).slice(0, 50);
  }
  return [...roots.values()];
}

/** A threaded comment's plain copy (where a file has no thread for it) as the thread it was: its comment and replies. */
function threadFromWords(ref: string, words: string): SheetComment | null {
  const parts = words.split(/\n(?=(?:Comment|Reply):\s*\n)/).slice(1);
  const texts = parts.map((p) => p.replace(/^(?:Comment|Reply):\s*\n/, '').replace(/^ {4}/gm, '').trim()).filter(Boolean);
  if (!texts.length) return null;
  const now = Date.now();
  return { id: newCommentId(), cell: ref, by: 'user', text: texts[0], at: now, ...(texts.length > 1 ? { replies: texts.slice(1).map((t) => ({ id: newCommentId(), by: 'user' as const, text: t, at: now })) } : {}) };
}

/**
 * A file's comments part: notes by cell name, and threads of comments from plain copies of threaded comments whose
 * thread the file lacks (`threaded`: the cells whose threads it has, which their plain copies leave alone).
 */
export function readNotes(xml: string | null, threaded: Set<string> = new Set()): { notes: Map<string, string>; threads: SheetComment[] } {
  const notes = new Map<string, string>();
  const threads: SheetComment[] = [];
  if (!xml) return { notes, threads };
  for (const c of all(parseXml(xml).root, 'comment')) {
    const ref = att(c, 'ref')?.replace(/\$/g, '').toUpperCase();
    const t = kid(c, 'text');
    if (!ref || !t || threaded.has(ref)) continue;
    // Each run's words; Excel puts the author's name first in a bold run ("Sam:"), kept as written.
    const words = all(t, 't')
      .map((x) => textOf(x))
      .join('')
      .trim();
    if (/^\[Threaded comment\]/.test(words)) {
      const th = threadFromWords(ref, words);
      if (th) threads.push(th);
    } else if (words) notes.set(ref, words);
  }
  return { notes, threads };
}

// ---- charts -----------------------------------------------------------------------------------------------------------

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const emu = (px: number) => Math.round(px * 9525);

/**
 * A sheet's charts as a drawing part: each anchored by its two corners on cells (Excel's "move and size with cells"),
 * where in each cell (no further than the cell reaches). `rid(i)`: the relationship of its chart part.
 */
export function drawingXml(sh: Sheet, charts: SheetChart[], rid: (i: number) => string): string {
  const g = sheetSizes(sh, undefined, true);
  const corner = (tag: 'from' | 'to', k: ChartCorner) => {
    const p = parseRef(k.cell)!;
    const dx = Math.min(k.dx ?? 0, g.colW(p.c));
    const dy = Math.min(k.dy ?? 0, g.rowH(p.r));
    return `<xdr:${tag}><xdr:col>${p.c}</xdr:col><xdr:colOff>${emu(dx)}</xdr:colOff><xdr:row>${p.r}</xdr:row><xdr:rowOff>${emu(dy)}</xdr:rowOff></xdr:${tag}>`;
  };
  const anchors = charts.map(
    (ch, i) =>
      `<xdr:twoCellAnchor editAs="twoCell">${corner('from', ch.from)}${corner('to', ch.to)}` +
      `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${esc(ch.title || `Chart ${i + 1}`)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
      `<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid(i)}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
  );
  return `${XML_HEAD}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}">${anchors.join('')}</xdr:wsDr>`;
}

const fixedRect = (sheet: string, x: Rect) => `${quoteSheet(sheet)}!$${colName(x.c1)}$${x.r1 + 1}${x.r1 === x.r2 && x.c1 === x.c2 ? '' : `:$${colName(x.c2)}$${x.r2 + 1}`}`;

/** A chart as a chart part: its series pointing at its cells, with their values and names cached. */
export function chartXml(book: Workbook, chart: SheetChart, data: ChartData | null, names: Set<string>): string {
  const sheet = data ? book.sheets[data.si].name : '';
  const tx = (size: number, bold = false) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size * 100}" b="${bold ? 1 : 0}"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const rich = (t: string, size: number) => `<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${size * 100}" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="${size * 100}" b="1"/><a:t>${esc(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
  const titleOf = (t: string | undefined, size: number) => (t ? `<c:title>${rich(t, size)}<c:overlay val="0"/></c:title>` : '');
  const colorOf = (i: number) => (chart.colors?.[i] ?? CHART_COLORS[i % CHART_COLORS.length]).slice(1).toUpperCase();
  const pie = chart.kind === 'pie' || chart.kind === 'doughnut';
  const series = (data?.series ?? []).slice(0, pie ? 1 : 50);
  const labels = data?.labels ?? [];
  const strCache = (vals: string[]) => `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('')}</c:strCache>`;
  const numCache = (vals: (number | null)[]) => `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v === null ? '' : `<c:pt idx="${i}"><c:v>${xnum(v)}</c:v></c:pt>`)).join('')}</c:numCache>`;
  const ref = (x: Rect) => esc(fileFormula(fixedRect(sheet, x), names));
  const cat = data?.labelRef ? `<c:cat><c:strRef><c:f>${ref(data.labelRef)}</c:f>${strCache(labels)}</c:strRef></c:cat>` : '';
  const xVal = data?.labelRef ? `<c:xVal><c:numRef><c:f>${ref(data.labelRef)}</c:f>${numCache(labels.map((l) => (Number.isFinite(Number(l.replace(/,/g, ''))) && l.trim() ? Number(l.replace(/,/g, '')) : null)))}</c:numRef></c:xVal>` : '';
  const serTx = (s: ChartData['series'][number]) =>
    s.nameAt ? `<c:tx><c:strRef><c:f>${ref({ r1: s.nameAt.r, c1: s.nameAt.c, r2: s.nameAt.r, c2: s.nameAt.c })}</c:f>${strCache([s.name])}</c:strRef></c:tx>` : `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>`;
  const val = (s: ChartData['series'][number], tag = 'val') => `<c:${tag}><c:numRef><c:f>${ref(s.ref)}</c:f>${numCache(s.values)}</c:numRef></c:${tag}>`;
  const solid = (hex: string) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
  const axes = '<c:axId val="50010001"/><c:axId val="50010002"/>';
  const grouping = chart.stacked ? 'stacked' : 'standard';
  let plot = '';
  if (pie) {
    const s = series[0];
    const pts = labels.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/>${solid(colorOf(i))}</c:dPt>`).join('');
    const ser = s ? `<c:ser><c:idx val="0"/><c:order val="0"/>${serTx(s)}${pts}${cat}${val(s)}</c:ser>` : '';
    plot = chart.kind === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>` : `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  } else if (chart.kind === 'column' || chart.kind === 'bar') {
    const sers = series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serTx(s)}${solid(colorOf(i))}<c:invertIfNegative val="0"/>${cat}${val(s)}</c:ser>`).join('');
    plot = `<c:barChart><c:barDir val="${chart.kind === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${chart.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/>${chart.stacked ? '<c:overlap val="100"/>' : ''}${axes}</c:barChart>`;
  } else if (chart.kind === 'line') {
    const sers = series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serTx(s)}<c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${colorOf(i)}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/>${solid(colorOf(i))}</c:marker>${cat}${val(s)}<c:smooth val="0"/></c:ser>`,
      )
      .join('');
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>`;
  } else if (chart.kind === 'area') {
    const sers = series
      .map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serTx(s)}<c:spPr><a:solidFill><a:srgbClr val="${colorOf(i)}"><a:alpha val="${chart.stacked ? 85000 : 40000}"/></a:srgbClr></a:solidFill></c:spPr>${cat}${val(s)}</c:ser>`)
      .join('');
    plot = `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>`;
  } else {
    const sers = series
      .map(
        (s, i) =>
          `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${serTx(s)}<c:spPr><a:ln w="19050"><a:noFill/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/>${solid(colorOf(i))}</c:marker>${xVal}${val(s, 'yVal')}<c:smooth val="0"/></c:ser>`,
      )
      .join('');
    plot = `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${sers}${axes}</c:scatterChart>`;
  }
  if (!pie) {
    const horiz = chart.kind === 'bar';
    const grid = '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>';
    const first =
      chart.kind === 'scatter'
        ? `<c:valAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>${titleOf(chart.xTitle, 10)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${tx(9)}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`
        : `<c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="${horiz ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'l' : 'b'}"/>${titleOf(chart.xTitle, 10)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${tx(9)}<c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
    plot += `${first}<c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'b' : 'l'}"/>${grid}${titleOf(chart.yTitle, 10)}<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${tx(9)}<c:crossAx val="50010001"/><c:crosses val="${horiz ? 'max' : 'autoZero'}"/><c:crossBetween val="${chart.kind === 'scatter' ? 'midCat' : 'between'}"/></c:valAx>`;
  }
  const legendAt = chart.legend ?? (pie || series.length > 1 ? 'bottom' : 'none');
  const legend = legendAt === 'none' ? '' : `<c:legend><c:legendPos val="${legendAt === 'right' ? 'r' : legendAt === 'top' ? 't' : 'b'}"/><c:overlay val="0"/>${tx(9)}</c:legend>`;
  const title = chart.title ? `${titleOf(chart.title, 14)}<c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  // On a white card with a thin line round it and rounded corners, its words in the cells' font, as the editor draws a chart.
  const frame = `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E0DA"/></a:solidFill></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="${officeFont('Inter')}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  return `${XML_HEAD}<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="1"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>${frame}</c:chartSpace>`;
}

/**
 * The charts of a sheet's drawing part, each from its chart part (`chartOf`: a relationship's chart XML): what this can
 * draw of them, with their corners on cells (an anchor by one cell or by a place in px is found on the cells it covers,
 * at the sizes `w` and `h` give, a hidden column or row 0).
 */
export function readCharts(drawing: string, chartOf: (rid: string) => string | null, sheetName: string, w: (c: number) => number, h: (r: number) => number): SheetChart[] {
  const out: SheetChart[] = [];
  const root = parseXml(drawing).root;
  const g = { colW: w, rowH: h, left: (c: number) => sum(c, w), top: (r: number) => sum(r, h) };
  for (const a of [...kids(root, 'oneCellAnchor'), ...kids(root, 'twoCellAnchor'), ...kids(root, 'absoluteAnchor')]) {
    const chartEl = all(a, 'chart').find((x) => Object.keys(x.a).some((k) => k.endsWith(':id')));
    const rid = chartEl ? Object.entries(chartEl.a).find(([k]) => k.endsWith(':id'))?.[1] : undefined;
    const xml = rid ? chartOf(rid) : null;
    if (!xml) continue;
    const num = (el: El | undefined, n: string) => Number(textOf(kid(el, n)) || 0) || 0;
    const cornerOf = (el: El): ChartCorner => {
      const dx = Math.round(num(el, 'colOff') / 9525);
      const dy = Math.round(num(el, 'rowOff') / 9525);
      return { cell: refName(Math.min(num(el, 'row'), 1_048_575), Math.min(num(el, 'col'), 16_383)), ...(dx > 0 ? { dx } : {}), ...(dy > 0 ? { dy } : {}) };
    };
    const fromEl = kid(a, 'from');
    const toEl = kid(a, 'to');
    const pos = kid(a, 'pos');
    const ext = kid(a, 'ext');
    const from: ChartCorner = fromEl ? cornerOf(fromEl) : cornerAt(Number(att(pos, 'x') ?? 0) / 9525, Number(att(pos, 'y') ?? 0) / 9525, w, h);
    let to: ChartCorner;
    if (toEl) to = cornerOf(toEl);
    else {
      const p0 = cornerXY(from, g);
      to = cornerAt(p0.x + (Number(att(ext, 'cx') ?? 0) / 9525 || 480), p0.y + (Number(att(ext, 'cy') ?? 0) / 9525 || 300), w, h);
    }
    // A far corner before the first (a file that says so): the chart gets a size of its own from the first.
    if (parseRef(to.cell)!.r < parseRef(from.cell)!.r || parseRef(to.cell)!.c < parseRef(from.cell)!.c) {
      const p0 = cornerXY(from, g);
      to = cornerAt(p0.x + 480, p0.y + 300, w, h);
    }
    const c = chartFrom(xml, sheetName);
    if (c) out.push({ ...c, id: `c${out.length + 1}`, from, to });
    if (out.length >= 20) break;
  }
  return out;
}

/** The sizes of the first `n` columns (or rows), added. */
const sum = (n: number, size: (i: number) => number) => {
  let s = 0;
  for (let i = 0; i < Math.min(n, 1_048_576); i++) s += size(i);
  return s;
};

/** What a chart part draws, as a chart over the sheet's cells: its kind, the range its series cover, its words. */
function chartFrom(xml: string, sheetName: string): Omit<SheetChart, 'id' | 'from' | 'to'> | null {
  const root = parseXml(xml).root;
  const plotArea = all(root, 'plotArea')[0];
  if (!plotArea) return null;
  const kinds: [string, SheetChartKind][] = [
    ['barChart', 'column'],
    ['bar3DChart', 'column'],
    ['lineChart', 'line'],
    ['line3DChart', 'line'],
    ['areaChart', 'area'],
    ['area3DChart', 'area'],
    ['pieChart', 'pie'],
    ['pie3DChart', 'pie'],
    ['doughnutChart', 'doughnut'],
    ['scatterChart', 'scatter'],
  ];
  const found = kinds.map(([n, k]) => [kid(plotArea, n), k] as const).find(([el]) => !!el);
  if (!found) return null;
  const [plot, k0] = found;
  const kind: SheetChartKind = k0 === 'column' && att(kid(plot!, 'barDir'), 'val') === 'bar' ? 'bar' : k0;
  // The cells its series use, on one sheet.
  const refs: { sheet?: string; x: Rect; what: 'name' | 'cat' | 'val' }[] = [];
  const add = (el: El | undefined, what: 'name' | 'cat' | 'val') => {
    const f = textOf(all(el, 'f')[0]).trim();
    if (!f) return;
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(f);
    const x = parseRange((m ? m[3] : f).replace(/\$/g, ''));
    if (x) refs.push({ sheet: m ? (m[1] ?? m[2]).replace(/''/g, "'") : undefined, x, what });
  };
  const sers = kids(plot!, 'ser');
  const colors: string[] = [];
  for (const s of sers) {
    add(kid(s, 'tx'), 'name');
    add(kid(s, 'cat') ?? kid(s, 'xVal'), 'cat');
    add(kid(s, 'val') ?? kid(s, 'yVal'), 'val');
    // Its colour: its own fill or line's, else its markers' (a scatter's points, drawn without a line).
    const rgb = att(all(kid(s, 'spPr'), 'srgbClr')[0] ?? all(kid(kid(s, 'marker'), 'spPr'), 'srgbClr')[0], 'val');
    if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) colors.push(`#${rgb.toLowerCase()}`);
  }
  const vals = refs.filter((r) => r.what === 'val');
  if (!vals.length) return null;
  const sheet = vals[0].sheet;
  const same = refs.filter((r) => (r.sheet ?? '').toLowerCase() === (sheet ?? '').toLowerCase());
  const byRows = vals.every((r) => r.x.r1 === r.x.r2) && vals.some((r) => r.x.c1 !== r.x.c2);
  // Its cells in parts: the labels' column (row) first, then each series' one, as far as their names and values go;
  // columns (rows) side by side make one part, so a chart of one block of cells has one range, as before.
  const lines: number[] = [];
  const line = (x: Rect) => {
    for (let i = byRows ? x.r1 : x.c1; i <= (byRows ? x.r2 : x.c2) && lines.length < 60; i++) if (!lines.includes(i)) lines.push(i);
  };
  for (const r of same) if (r.what === 'cat') line(r.x);
  for (const r of vals) if ((r.sheet ?? '').toLowerCase() === (sheet ?? '').toLowerCase()) line(r.x);
  const lo = Math.min(...same.map((r) => (byRows ? r.x.c1 : r.x.r1)));
  const hi = Math.max(...same.map((r) => (byRows ? r.x.c2 : r.x.r2)));
  const runs: [number, number][] = [];
  for (const i of lines) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  const onOwn = !sheet || sheet.toLowerCase() === sheetName.toLowerCase();
  const range = cleanChartRange(runs.map(([a, b]) => `${onOwn ? '' : `${quoteSheet(sheet!)}!`}${rangeName(byRows ? { r1: a, c1: lo, r2: b, c2: hi } : { r1: lo, c1: a, r2: hi, c2: b })}`).join(','));
  if (!range || !chartParts(range)) return null;
  const words = (el: El | undefined) =>
    all(el, 't')
      .map((t) => textOf(t))
      .join('')
      .trim() || undefined;
  const title = words(kid(all(root, 'chart')[0], 'title'));
  const axes = [...kids(plotArea, 'catAx'), ...kids(plotArea, 'valAx'), ...kids(plotArea, 'dateAx')];
  const axisTitle = (pos: string[]) =>
    words(
      kid(
        axes.find((ax) => pos.includes(att(kid(ax, 'axPos'), 'val') ?? '')),
        'title',
      ),
    );
  const legendEl = all(root, 'legend')[0];
  const lp = att(kid(legendEl, 'legendPos'), 'val');
  const out: Omit<SheetChart, 'id' | 'from' | 'to'> = { kind, range };
  if (byRows) out.by = 'rows';
  out.labels = refs.some((r) => r.what === 'cat');
  out.names = refs.some((r) => r.what === 'name');
  if (title) out.title = title.slice(0, 200);
  out.legend = !legendEl ? 'none' : lp === 'r' || lp === 'l' ? 'right' : lp === 't' ? 'top' : 'bottom';
  const xt = axisTitle(kind === 'bar' ? ['l', 'r'] : ['b', 't']);
  const yt = axisTitle(kind === 'bar' ? ['b', 't'] : ['l', 'r']);
  if (xt) out.xTitle = xt.slice(0, 200);
  if (yt) out.yTitle = yt.slice(0, 200);
  if (['stacked', 'percentStacked'].includes(att(kid(plot!, 'grouping'), 'val') ?? '')) out.stacked = true;
  if (colors.length && kind !== 'pie' && kind !== 'doughnut' && colors.some((c, i) => c !== CHART_COLORS[i % CHART_COLORS.length])) out.colors = colors.slice(0, 12);
  return out;
}

/** A chart's series and labels, as the editor draws them. */
export const dataOf = (book: Workbook, calc: Calc, si: number, chart: SheetChart) => chartData(book, calc, si, chart);

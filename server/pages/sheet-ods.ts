// What an OpenDocument spreadsheet (.ods) has besides its cells, as a workbook here keeps it (sheets.ts reads the cells
// and calls these): its merged cells, its data validation (lists of options or of a range's values, numbers between or
// past a value, words of a length; rejected or warned of), conditional formatting as LibreOffice writes it (a cell's
// value compared, text it holds, duplicates, the top or bottom values, above or below the average, a formula; colour
// scales and data bars), each rule's look from the cell style it names, and notes (annotations). What is not simple
// (icon sets, rules on several sheets at once) is left out. Nothing here becomes markup: values become words and
// formulas the model checks again (normalizeBook).
import { formulaFromFile, rangeName, type CondRule, type CondStyle, type Rect, type ScalePoint, type Validation } from '../../shared/sheets.ts';
import { all, att, kid, kids, type El } from '../documents/xml.ts';

type Obj = Record<string, unknown>;

/** An OpenDocument cell's words: its paragraphs, spaces (text:s) and tabs kept, its note (an annotation) left out. */
export function odfText(el: El): string {
  let s = '';
  for (const x of el.c) {
    if (typeof x === 'string') s += x;
    else if (x.n === 's') s += ' '.repeat(Math.min(1000, Number(att(x, 'c') ?? 1) || 1));
    else if (x.n === 'tab') s += '\t';
    else if (x.n === 'line-break') s += '\n';
    else if (x.n !== 'annotation') s += odfText(x);
  }
  return s;
}

/** An OpenDocument formula as Excel writes one: "of:=SUM([.A1:.B2];[$Data.C3])" is "SUM(A1:B2,Data!C3)". */
export function odfFormula(f: string): string {
  const body = f.replace(/^[a-z]+:/i, '').replace(/^=/, '');
  return body
    .split(/("(?:[^"]|"")*")/)
    .map((part, i) => {
      if (i % 2) return part;
      return part
        .replace(/\[([^\]]+)\]/g, (_m, ref: string) => {
          let sheet = '';
          const cells = ref.split(':').map((p) => {
            const dot = p.lastIndexOf('.');
            const sh = p.slice(0, dot).replace(/^\$/, '');
            if (sh) sheet = sh.replace(/^'(.*)'$/, '$1').replace(/''/g, "'");
            return p.slice(dot + 1);
          });
          return `${sheet ? `${quoteName(sheet)}!` : ''}${cells.join(':')}`;
        })
        .replace(/;/g, ',');
    })
    .join('');
}
const quoteName = (n: string) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(n) && !/^[A-Za-z]{1,3}\d+$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`);

/** A cell's address as OpenDocument writes it ("Sheet1.C2", "$'My sheet'.$C$2", ".C2"): its sheet, row and column. */
function odfCell(s: string): { sheet?: string; r: number; c: number } | null {
  const m = /^(?:\$?('(?:[^']|'')*'|[^.']*)\.)?\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(s.trim());
  if (!m) return null;
  const c = [...m[2].toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const sheet = m[1] ? m[1].replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : undefined;
  return { ...(sheet ? { sheet } : {}), r: Number(m[3]) - 1, c };
}

/** Ranges as OpenDocument writes them ("Sheet1.C2:Sheet1.C6 Sheet1.E2"), as a rule keeps them ("C2:C6,E2"). */
function odfRanges(s: string): string {
  const out: string[] = [];
  for (const part of s.trim().split(/\s+/)) {
    const [a, b] = part.split(':');
    const p = odfCell(a);
    const q = b ? odfCell(b) : p;
    if (!p || !q) continue;
    out.push(rangeName({ r1: Math.min(p.r, q.r), c1: Math.min(p.c, q.c), r2: Math.max(p.r, q.r), c2: Math.max(p.c, q.c) }));
  }
  return out.slice(0, 20).join(',');
}

/** Rectangles side by side made one (rows of a column one under another, then columns of a row side by side). */
export function joinRects(list: Rect[]): Rect[] {
  const join = (rs: Rect[], down: boolean): Rect[] => {
    const groups = new Map<string, Rect[]>();
    for (const x of rs) {
      const k = down ? `${x.c1}:${x.c2}` : `${x.r1}:${x.r2}`;
      const g = groups.get(k);
      if (g) g.push({ ...x });
      else groups.set(k, [{ ...x }]);
    }
    const out: Rect[] = [];
    for (const g of groups.values()) {
      g.sort((a, b) => (down ? a.r1 - b.r1 : a.c1 - b.c1));
      let last: Rect | null = null;
      for (const x of g) {
        if (last && (down ? x.r1 <= last.r2 + 1 : x.c1 <= last.c2 + 1)) {
          if (down) last.r2 = Math.max(last.r2, x.r2);
          else last.c2 = Math.max(last.c2, x.c2);
        } else out.push((last = x));
      }
    }
    return out;
  };
  return join(join(list, true), false);
}

// ---- data validation ----------------------------------------------------------------------------------------------

/** A value in a validation's condition: words in quotes, a number, or a formula (with "="). */
function odfValue(v: string): string {
  const t = v.trim();
  const q = /^"((?:[^"]|"")*)"$/.exec(t);
  if (q) return q[1].replace(/""/g, '"');
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?$/i.test(t)) return t;
  return `=${formulaFromFile(odfFormula(t))}`;
}

/** The arguments of a call in a condition ("between(1;10)"), split at its own ; or , (not those in quotes or brackets). */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && (ch === '(' || ch === '[')) depth++;
    if (!quoted && (ch === ')' || ch === ']')) depth--;
    if (!quoted && !depth && (ch === ';' || ch === ',')) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

/** A comparison as a condition keeps it: "cell-content()>=5" and its kin. */
function compareOf(s: string): { op: string; a: string; b?: string } | null {
  const between = /(not-)?between\((.*)\)\s*$/.exec(s);
  if (between) {
    const [a, b] = args(between[2]);
    return a !== undefined && b !== undefined ? { op: between[1] ? 'notBetween' : 'between', a: odfValue(a), b: odfValue(b) } : null;
  }
  const m = /(>=|<=|!=|<>|=|>|<)\s*(.+)$/.exec(s);
  if (!m) return null;
  const op = { '>=': 'gte', '<=': 'lte', '!=': 'neq', '<>': 'neq', '=': 'eq', '>': 'gt', '<': 'lt' }[m[1]]!;
  return { op, a: odfValue(m[2]) };
}

/** A content-validation's rule (lists, numbers, lengths of words), without its range, or null. */
function validationOf(el: El): Omit<Validation, 'range'> | null {
  const cond = (att(el, 'condition') ?? '').replace(/^[a-z]+:/i, '');
  const msg = kid(el, 'error-message');
  const reject = (att(msg, 'display') ?? 'true') === 'true' && (att(msg, 'message-type') ?? 'stop') === 'stop';
  const extra = reject ? { reject: true } : {};
  const list = /^cell-content-is-in-list\((.*)\)\s*$/.exec(cond);
  if (list) {
    const items = args(list[1]);
    if (items.length === 1 && !/^"/.test(items[0])) {
      // A range's values: [$Lists.$A$1:.$A$9] or Lists.A1:A9.
      const f = formulaFromFile(odfFormula(/^\[.*\]$/.test(items[0]) ? items[0] : `[${items[0]}]`)).replace(/\$/g, '');
      return { type: 'list', source: f, ...extra };
    }
    const options = items.map((x) => odfValue(x)).filter((x) => x && !x.startsWith('='));
    return options.length ? { type: 'list', options: options.slice(0, 500).map((v) => ({ v })), ...extra } : null;
  }
  const length = /^cell-content-text-length(?:-is-(not-)?between\((.*)\)|\(\)\s*(.*))$/.exec(cond);
  if (length) {
    const when = length[2] !== undefined ? compareOf(`${length[1] ? 'not-' : ''}between(${length[2]})`) : compareOf(length[3] ?? '');
    return when ? { type: 'length', when: when as Validation['when'], ...extra } : null;
  }
  const num = /^cell-content-is-(whole|decimal)-number\(\)(?:\s+and\s+(.*))?$/.exec(cond) ?? /^cell-content-is-(date)\(\)(?:\s+and\s+(.*))?$/.exec(cond);
  if (num) {
    const rest = num[2] ? num[2].replace(/^cell-content-is-/, '').replace(/^cell-content\(\)/, '') : '';
    const when = rest ? compareOf(rest) : null;
    return { type: num[1] === 'date' ? 'date' : 'number', ...(when ? { when: when as Validation['when'] } : {}), ...extra };
  }
  return null;
}

/** A table's validations by name (`table:content-validations` in the content's body). */
export function odsValidations(content: El): Map<string, Omit<Validation, 'range'>> {
  const out = new Map<string, Omit<Validation, 'range'>>();
  for (const el of all(content, 'content-validation')) {
    const name = att(el, 'name');
    const v = name ? validationOf(el) : null;
    if (name && v) out.set(name, v);
  }
  return out;
}

// ---- conditional formatting --------------------------------------------------------------------------------------

/** LibreOffice's own styles for conditional formatting, as its template draws them (a file may leave them out). */
const LO_STYLES: Record<string, CondStyle> = {
  Good: { color: '#006600', fill: '#ccffcc' },
  Bad: { color: '#cc0000', fill: '#ffcccc' },
  Neutral: { color: '#996600', fill: '#ffffcc' },
  Accent: { b: true },
  Error: { b: true, color: '#ffffff', fill: '#cc0000' },
  Warning: { color: '#cc0000' },
};

/** The looks of a file's cell styles by name (its own and its automatic ones), as conditional formatting gives them. */
export function odsCondStyles(...roots: (El | null)[]): Map<string, CondStyle> {
  const out = new Map<string, CondStyle>();
  for (const root of roots)
    for (const st of all(root ?? undefined, 'style')) {
      if (att(st, 'family') !== 'table-cell') continue;
      const name = att(st, 'name');
      if (!name) continue;
      const tp = kid(st, 'text-properties');
      const cp = kid(st, 'table-cell-properties');
      const s: CondStyle = {};
      if (att(tp, 'font-weight') === 'bold') s.b = true;
      if (att(tp, 'font-style') === 'italic') s.i = true;
      if ((att(tp, 'text-underline-style') ?? 'none') !== 'none') s.u = true;
      if ((att(tp, 'text-line-through-style') ?? 'none') !== 'none') s.s = true;
      const color = att(tp, 'color');
      if (color && /^#[0-9a-f]{6}$/i.test(color)) s.color = color.toLowerCase();
      const bg = att(cp, 'background-color');
      if (bg && /^#[0-9a-f]{6}$/i.test(bg)) s.fill = bg.toLowerCase();
      if (Object.keys(s).length) out.set(name, s);
    }
  return out;
}

/** A condition's words (calcext:value) as a condition here: ">5", "between(1,10)", "duplicate", "begins-with(\"x\")"… */
function condOf(v: string): Obj | null {
  const t = v.trim();
  const call = /^([a-z-]+)\((.*)\)$/.exec(t);
  const name = call ? call[1] : t;
  const a = call ? args(call[2]) : [];
  switch (name) {
    case 'duplicate':
      return { op: 'dup' };
    case 'unique':
      return { op: 'unique' };
    case 'above-average':
    case 'above-equal-average':
      return { op: 'above' };
    case 'below-average':
    case 'below-equal-average':
      return { op: 'below' };
    case 'top-elements':
    case 'bottom-elements':
    case 'top-percent':
    case 'bottom-percent':
      return { op: name.startsWith('top') ? 'top' : 'bottom', a: a[0] ?? '10', ...(name.endsWith('percent') ? { b: '%' } : {}) };
    case 'begins-with':
    case 'ends-with':
    case 'contains-text':
    case 'not-contains-text':
      return a[0] === undefined ? null : { op: { 'begins-with': 'starts', 'ends-with': 'ends', 'contains-text': 'contains', 'not-contains-text': 'notContains' }[name], a: odfValue(a[0]) };
    case 'formula-is':
      return call ? { op: 'formula', a: `=${formulaFromFile(odfFormula(call[2]))}` } : null;
    case 'between':
    case 'not-between':
      return a.length === 2 ? { op: name === 'between' ? 'between' : 'notBetween', a: odfValue(a[0]), b: odfValue(a[1]) } : null;
  }
  return compareOf(t);
}

/** A colour scale's point: the lowest or highest value, a number, a percent of the way, or a percentile. */
function pointOf(el: El): ScalePoint | null {
  const color = att(el, 'color');
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  const type = att(el, 'type') ?? '';
  const v = Number(att(el, 'value') ?? 0);
  const at = type === 'minimum' ? 'min' : type === 'maximum' ? 'max' : type === 'number' ? 'num' : type === 'percent' ? 'pct' : type === 'percentile' ? 'pctile' : null;
  if (!at) return null;
  return { color: color.toLowerCase(), at, ...(at === 'num' || at === 'pct' || at === 'pctile' ? { v } : {}) };
}

/** A table's conditional formatting as LibreOffice writes it (calcext:conditional-formats): rules in order. */
export function odsConditional(table: El, styles: Map<string, CondStyle>): CondRule[] {
  const out: CondRule[] = [];
  for (const cf of all(table, 'conditional-format')) {
    const range = odfRanges(att(cf, 'target-range-address') ?? '');
    if (!range) continue;
    for (const x of kids(cf)) {
      if (x.n === 'condition') {
        const when = condOf(att(x, 'value') ?? '');
        const style = styles.get(att(x, 'apply-style-name') ?? '') ?? LO_STYLES[att(x, 'apply-style-name') ?? ''];
        if (when && style) out.push({ range, when: when as unknown as CondRule['when'], style });
      } else if (x.n === 'color-scale') {
        const pts = kids(x, 'color-scale-entry').flatMap((e) => pointOf(e) ?? []);
        if (pts.length >= 2) out.push({ range, scale: { min: pts[0], ...(pts.length > 2 ? { mid: pts[1] } : {}), max: pts[pts.length - 1] } });
      } else if (x.n === 'data-bar') {
        const color = att(x, 'positive-color');
        out.push({ range, bar: { color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#638ec6' } });
      } else if (x.n === 'date-is') {
        const date = att(x, 'date') ?? '';
        const style = styles.get(att(x, 'style') ?? '') ?? LO_STYLES[att(x, 'style') ?? ''];
        if (style && ['today', 'yesterday', 'tomorrow'].includes(date)) out.push({ range, when: { op: 'dateIs', a: date }, style });
      }
    }
  }
  return out.slice(0, 100);
}

/** A note on a cell (office:annotation): its paragraphs' words, without who wrote it and when. */
export function odsNote(cell: El): string | undefined {
  const a = kid(cell, 'annotation');
  if (!a) return undefined;
  const t = kids(a, 'p').map(odfText).join('\n').trim();
  return t || undefined;
}

// An answer UI's data as text, for when the card itself cannot go along: as plain text (a card's Copy as text) and as
// Markdown (a conversation exported as a file or a saved document: server/session-export.ts). The Markdown keeps
// what can be kept: tables as tables (a data table, a comparison, a chart's numbers, a decision matrix, a versus card,
// any list of short records), pictures as pictures, code as code, and the rest as headed lists of label and value.
// Shared: the pages copy a card with it and the server exports with it.
import { REF_UIS, refSource } from './data-ref.ts';

type Data = Record<string, unknown>;

const isObj = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const empty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);

/** A field's name as words: "change_unit" → "Change unit". */
export const humanize = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/[_-]+/g, ' ');

/** The data as plain text: a title, then label: value lines, lists as points, nested parts indented. */
export function answerText(data: unknown, title?: string): string {
  const out: string[] = [];
  const walk = (v: unknown, pad: string, label?: string) => {
    const head = label ? `${pad}${humanize(label)}: ` : pad;
    if (v === null || v === undefined || v === '') return;
    if (!isObj(v) && !Array.isArray(v)) return void out.push(`${head}${typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)}`);
    if (Array.isArray(v)) {
      if (label) out.push(`${pad}${humanize(label)}:`);
      for (const x of v) {
        if (!isObj(x) && !Array.isArray(x)) out.push(`${pad}- ${String(x)}`);
        else if (isObj(x)) {
          const nameKey = NAME_KEYS.find((k) => str(x[k]));
          out.push(`${pad}- ${nameKey ? str(x[nameKey]) : ''}`.trimEnd());
          for (const [k, y] of Object.entries(x)) if (k !== nameKey) walk(y, `${pad}  `, k);
        } else walk(x, `${pad}  `);
      }
      return;
    }
    if (label) out.push(`${pad}${humanize(label)}:`);
    for (const [k, y] of Object.entries(v)) if (k !== 'ui') walk(y, label ? `${pad}  ` : pad, k);
  };
  const d = isObj(data) ? data : {};
  out.push(str(d.title) || title || '');
  const { title: _t, ...rest } = d;
  walk(rest, '');
  return out.filter((l, i) => l || i).join('\n').trim();
}

// ---- Markdown ------------------------------------------------------------------------------------------------------

/** The fields that name a record, in the order tried. */
const NAME_KEYS = ['name', 'title', 'label', 'text', 'q', 'question', 'item', 'claim', 'term', 'group', 'heading', 'date'];
/** Fields only for how a card looks (a dot's colour, a map's position), left out of the text. */
const LOOK_KEYS = new Set(['ui', 'tone', 'lat', 'lng', 'lon', 'zoom', 'color', 'colour']);
/** Fields that hold a picture's address. */
const PIC_KEY = /^(image|images|photo|photos|picture|pictures|poster|thumbnail|thumb|cover|logo|avatar|still|stills)$/i;
/** Fields that hold a page's address. */
const LINK_KEY = /^(url|href|link|website|page|source_url|map_url|pdf|trailer|video)$/i;
/** Fields of prose, written as paragraphs of their own rather than as "Label: value". */
const PROSE_KEY = /^(text|body|intro|summary|description|verdict|note|notes|caveat|recommendation|answer|explain|explanation|why|conclusion|tldr|lede|content|markdown|md)$/i;
const ADDRESS = /^(https?:|\/|~\/|file:|data:image\/)/i;

/** A value fit for one line (a table's cell, a list's item): its line breaks as spaces, a table's bars escaped. */
const inline = (s: string, cell = false) => {
  const one = s.replace(/\r?\n+/g, cell ? '<br>' : ' ').trim();
  return cell ? one.replace(/\|/g, '\\|') : one;
};

/** A picture, as Markdown. */
const pic = (src: string, alt = '') => `![${alt.replace(/[[\]]/g, '')}](${/\s/.test(src) ? `<${src}>` : src})`;

/** A scalar as words: yes/no as ✓/✗, numbers as written, an address as a link, a picture as a picture (in `key`'s field). */
function scalar(v: unknown, key = '', alt = ''): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  const s = String(v);
  if (PIC_KEY.test(key) && ADDRESS.test(s)) return pic(s, alt);
  if (LINK_KEY.test(key) && /^https?:\/\//i.test(s)) return `<${s}>`;
  return s;
}

/** A Markdown table: its header, then its rows (cells written already). */
function table(head: string[], rows: string[][]): string[] {
  if (!rows.length) return [];
  const w = Math.max(head.length, ...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: w }, (_, i) => inline(r[i] ?? '', true) || ' ');
  return [`| ${pad(head).join(' | ')} |`, `| ${Array.from({ length: w }, () => '---').join(' | ')} |`, ...rows.map((r) => `| ${pad(r).join(' | ')} |`)];
}

/** A number as it reads with its unit, its prefix, or as a percent. */
function amount(v: unknown, o: { unit?: unknown; prefix?: unknown; type?: unknown; currency?: unknown } = {}): string {
  if (typeof v !== 'number') return v === undefined ? '' : scalar(v);
  if (o.type === 'percent') return `${+(v * 100).toFixed(2)}%`;
  const p = str(o.prefix) || (o.type === 'money' && str(o.currency) ? `${str(o.currency)} ` : '');
  const u = str(o.unit);
  return `${p}${v.toLocaleString('en-US', { maximumFractionDigits: 6 })}${u ? (/^[%°]/.test(u) ? u : ` ${u}`.replace(/^  /, ' ')) : ''}`;
}

/** The UIs whose data is a table by its own shape: each written as one. Null when the data is not that shape after all. */
const TABLES: Record<string, (d: Data) => string[] | null> = {
  table(d) {
    const cols = (Array.isArray(d.columns) ? d.columns : []).filter(isObj);
    const rows = (Array.isArray(d.rows) ? d.rows : []).filter(isObj);
    if (!cols.length || !rows.length) return null;
    const cell = (c: Data, r: Data) => {
      const v = r[str(c.key)];
      if (c.type === 'image' && typeof v === 'string' && v) return pic(v);
      if (c.type === 'link' && typeof v === 'string' && /^https?:/i.test(v)) return `<${v}>`;
      if (c.type === 'rating' && typeof v === 'number') return `${v}/5`;
      return typeof v === 'number' ? amount(v, c) : scalar(v);
    };
    const out = rows.map((r) => cols.map((c) => cell(c, r)));
    const totals = Array.isArray(d.totals) ? d.totals.map(str) : [];
    if (totals.length)
      out.push(
        cols.map((c, i) => {
          if (!totals.includes(str(c.key))) return i ? '' : '**Total**';
          const sum = rows.reduce((a, r) => a + (typeof r[str(c.key)] === 'number' ? (r[str(c.key)] as number) : 0), 0);
          return `**${amount(sum, c)}**`;
        }),
      );
    return table(
      cols.map((c) => str(c.label) || humanize(str(c.key))),
      out,
    );
  },
  comparison(d) {
    const items = (Array.isArray(d.items) ? d.items : []).filter(isObj);
    const rows = (Array.isArray(d.rows) ? d.rows : []).filter(isObj);
    if (!items.length || !rows.length) return null;
    const out = table(
      ['', ...items.map((it) => str(it.name))],
      rows.map((r) => [`**${str(r.label)}**`, ...items.map((_, i) => amount((Array.isArray(r.values) ? r.values : [])[i] ?? null, r))]),
    );
    const w = typeof d.winner === 'number' ? items[d.winner] : undefined;
    return w ? [...out, '', `**Pick:** ${str(w.name)}`] : out;
  },
  chart(d) {
    const series = (Array.isArray(d.series) ? d.series : []).filter(isObj);
    if (!series.length) return null;
    const unit = { unit: d.unit, prefix: d.prefix };
    if (d.kind === 'scatter') {
      const rows = series.flatMap((s) => (Array.isArray(s.values) ? s.values : []).filter(isObj).map((p) => [str(s.name), str(p.label), amount(p.x), amount(p.y, unit)]));
      return table(['Series', 'Point', str(d.x_label) || 'x', str(d.y_label) || 'y'], rows);
    }
    const x = Array.isArray(d.x) ? d.x : [];
    const n = Math.max(x.length, ...series.map((s) => (Array.isArray(s.values) ? s.values.length : 0)));
    return table(
      [str(d.x_label), ...series.map((s) => str(s.name))],
      Array.from({ length: n }, (_, i) => [scalar(x[i] ?? i + 1), ...series.map((s) => amount((Array.isArray(s.values) ? s.values : [])[i] ?? null, unit))]),
    );
  },
  'decision-matrix'(d) {
    const options = Array.isArray(d.options) ? d.options.map(str) : [];
    const criteria = (Array.isArray(d.criteria) ? d.criteria : []).filter(isObj);
    if (!options.length || !criteria.length) return null;
    const scores = (c: Data) => (Array.isArray(c.scores) ? c.scores : []);
    const weight = (c: Data) => (typeof c.weight === 'number' ? c.weight : 1);
    const totals = options.map((_, i) => criteria.reduce((a, c) => a + weight(c) * (typeof scores(c)[i] === 'number' ? (scores(c)[i] as number) : 0), 0));
    return table(
      ['Criterion', 'Weight', ...options],
      [...criteria.map((c) => [str(c.name), String(weight(c)), ...options.map((_, i) => scalar(scores(c)[i] ?? null))]), ['**Weighted total**', '', ...totals.map((t) => `**${t}**`)]],
    );
  },
  versus(d) {
    const l = isObj(d.left) ? d.left : {};
    const r = isObj(d.right) ? d.right : {};
    const rows = (Array.isArray(d.rows) ? d.rows : []).filter(isObj);
    if (!rows.length) return null;
    const mark = (row: Data, side: string) => (row.winner === side ? ' ✓' : '');
    return table(
      ['', str(l.name), str(r.name)],
      rows.map((row) => [`**${str(row.label)}**`, amount(row.left, row) + mark(row, 'left'), amount(row.right, row) + mark(row, 'right')]),
    );
  },
};
/** What each of those tables holds already, so it is not written again below it. */
const TABLE_KEYS: Record<string, string[]> = {
  table: ['columns', 'rows', 'totals', 'sort'],
  comparison: ['items', 'rows', 'winner'],
  chart: ['series', 'x', 'kind', 'unit', 'prefix', 'x_label', 'y_label', 'min', 'max', 'stacked'],
  'decision-matrix': ['options', 'criteria'],
  versus: ['left', 'right', 'rows'],
};

/** A record whose fields are all one line each (a row of a table). */
const flat = (o: Data) => Object.values(o).every((x) => !isObj(x) && !Array.isArray(x));

/** A list of records as a table, when they are short records of a few fields; else null. */
function recordsTable(list: Data[]): string[] | null {
  if (!list.length || !list.every(flat)) return null;
  const keys = [...new Set(list.flatMap((r) => Object.keys(r)))].filter((k) => !LOOK_KEYS.has(k));
  if (keys.length > 6 || keys.includes('code') || list.some((r) => Object.values(r).some((x) => typeof x === 'string' && (x.length > 90 || x.includes('\n'))))) return null;
  return table(
    keys.map(humanize),
    list.map((r) => keys.map((k) => scalar(r[k], k, str(r.name) || str(r.title)))),
  );
}

/** Code, fenced (with a longer fence when it holds one), indented by `pad`. */
const fenced = (code: string, lang: string, pad: string) => {
  const ticks = '`'.repeat(Math.max(3, ...[...code.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
  return [`${pad}${ticks}${lang}`, ...code.replace(/\n$/, '').split('\n').map((l) => `${pad}${l}`), `${pad}${ticks}`];
};

/** A record's fields as list items under it, indented by `pad`. */
function fields(o: Data, pad: string, out: string[], skip: string[] = []) {
  const alt = str(o.name) || str(o.title) || str(o.label);
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k) || LOOK_KEYS.has(k) || empty(v)) continue;
    if (k === 'code' && typeof v === 'string') {
      out.push(...fenced(v, str(o.lang) || str(o.language), pad));
      continue;
    }
    if (k === 'lang' && typeof o.code === 'string') continue;
    if (!isObj(v) && !Array.isArray(v)) {
      const s = scalar(v, k, alt);
      out.push(PIC_KEY.test(k) && s.startsWith('![') ? `${pad}${s}` : `${pad}- ${humanize(k)}: ${inline(s)}`);
      continue;
    }
    if (Array.isArray(v) && v.every((x) => !isObj(x) && !Array.isArray(x))) {
      if (PIC_KEY.test(k)) out.push(...v.map((x) => `${pad}${scalar(x, k, alt)}`));
      else if (v.every((x) => String(x).length <= 30) && v.join(', ').length <= 100) out.push(`${pad}- ${humanize(k)}: ${v.map((x) => inline(scalar(x))).join(', ')}`);
      else {
        out.push(`${pad}- ${humanize(k)}:`);
        for (const x of v) out.push(`${pad}  - ${inline(scalar(x))}`);
      }
      continue;
    }
    out.push(`${pad}- ${humanize(k)}:`);
    list(Array.isArray(v) ? v : [v], `${pad}  `, out);
  }
}

/** A list: each record a point named by its name (or title…), its other fields under it; plain values as points. */
function list(v: unknown[], pad: string, out: string[]) {
  for (const x of v) {
    if (empty(x)) continue;
    if (Array.isArray(x)) list(x, pad, out);
    else if (isObj(x)) {
      const nameKey = NAME_KEYS.find((k) => typeof x[k] === 'string' && x[k]);
      const name = nameKey ? inline(str(x[nameKey])) : '';
      out.push(`${pad}- ${name ? (nameKey === 'text' || nameKey === 'claim' ? name : `**${name}**`) : ''}`.trimEnd());
      fields(x, `${pad}  `, out, nameKey ? [nameKey] : []);
    } else out.push(`${pad}- ${inline(scalar(x))}`);
  }
}

/** One of the card's top fields, as Markdown blocks. */
function block(k: string, v: unknown, out: string[]) {
  if (empty(v)) return;
  const gap = () => out.length && out[out.length - 1] !== '' && out.push('');
  gap();
  if (!isObj(v) && !Array.isArray(v)) {
    const s = scalar(v, k);
    if (PIC_KEY.test(k) && s.startsWith('![')) out.push(s);
    else if (k === 'code' && typeof v === 'string') out.push(...fenced(v, '', ''));
    else if (PROSE_KEY.test(k) || (typeof v === 'string' && v.length > 100)) out.push(PROSE_KEY.test(k) && /^(verdict|recommendation|answer|tldr|conclusion)$/i.test(k) ? `**${humanize(k)}:** ${s}` : s);
    else out.push(`**${humanize(k)}:** ${inline(s)}`);
    return;
  }
  out.push(`**${humanize(k)}**`, '');
  if (Array.isArray(v)) {
    if (PIC_KEY.test(k) && v.every((x) => typeof x === 'string')) return void out.push(...v.map((x) => scalar(x, k)));
    const rows = v.every(isObj) ? recordsTable(v as Data[]) : null;
    if (rows) out.push(...rows);
    else list(v, '', out);
  } else fields(v, '', out);
}

/**
 * An answer card as Markdown: its title in bold, then its data (`name` is the UI it is, which some write as a table of
 * their own shape). Its title is the data's, else `fallback` (the UI's own name).
 */
export function answerMarkdown(name: string, data: unknown, fallback?: string): string {
  const d = isObj(data) ? data : Array.isArray(data) ? { items: data } : {};
  const out: string[] = [];
  const title = str(d.title) || str(d.subject) || str(d.location) || fallback || '';
  if (title) out.push(`**${inline(title)}**`);
  // A card that reads its numbers from a spreadsheet or a file (data-ref.ts) says where: they are read when it is shown.
  const src = REF_UIS.has(name) ? refSource(d.from) : null;
  if (src) {
    const where = src.file ? `the file ${src.file}` : `the spreadsheet “${src.sheet}”${src.range ? ` (${src.range})` : src.tab ? ` (${src.tab})` : ''}`;
    out.push(...(out.length ? [''] : []), `_Its numbers are read from ${inline(where)} each time it is shown._`);
    if (str(d.note)) out.push('', str(d.note));
    return out.join('\n').trim();
  }
  const own = TABLES[name]?.(d) ?? null;
  const skip = new Set(['ui', 'title', ...(str(d.title) ? [] : str(d.subject) ? ['subject'] : str(d.location) ? ['location'] : []), ...(own ? TABLE_KEYS[name] : [])]);
  if (own) {
    if (out.length) out.push('');
    out.push(...own);
  }
  for (const [k, v] of Object.entries(d)) if (!skip.has(k)) block(k, v, out);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

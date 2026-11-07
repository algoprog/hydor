// An app's view: how its answer looks, and what you can do there. The agent that builds an app designs it once,
// as part of the app: elements (templates of HTML, each with its own CSS, that values fill each time one shows),
// pages (tabs, and detail pages reached from them) made of blocks that place elements and say what fills them,
// and events (what a click on an element does: go to a page, tick something off, ask the agent, run a flow, run
// it again with changed answers, start another app, keep a record, copy…). A run's page shows its answer in the
// view; pages marked "app" show on the app's own page, with what it keeps.
//
// Templates use the names a task does: {{result.days}}, {{inputs.city}}, {{.}} (the item itself) and, in an
// element drawn for each item, its fields by name ({{title}}). {{#x}}…{{/x}} draws its text for each item of a
// list (or once, when x has a value), {{^x}}…{{/x}} only when x is empty, and {{x|format}} shows a value one way
// (|date, |number, |count, |join, |markdown…). data-event="name" on anything makes a click on it an event.
//
// The engine (uiEngine) is one function that uses only its arguments and the language's own globals: the server
// checks views and tries them with a run's values with it, and the page kit sends its source into the sandboxed
// frame where views are drawn (server/pages/kit.ts).
import type { AppRecipe } from './apps.ts';
import { cleanLibs } from './app-media.ts';

// ---- the format -------------------------------------------------------------------------------------------------

export interface AppUi {
  /** Its pages, in order: a tab each (the first opens first), and detail pages (tab: false) reached by events. */
  pages: UiPage[];
  /** Its own elements, by name: what its blocks draw. */
  elements?: Record<string, UiElement>;
  /** What a click on an element with data-event="name" does: its actions, one after another. */
  events?: Record<string, UiAction[]>;
  /** CSS for the whole view (its own classes, @keyframes, fonts). */
  style?: string;
  /**
   * Its widgets, by name: elements drawn by a script of their own (a 3D scene, a chart library, a game, an editor),
   * placed by blocks as elements are. Each is a module whose default export draws into an element it is given.
   */
  widgets?: Record<string, UiWidget>;
  /**
   * The libraries its widgets import, at exact versions from npm (loaded from jsDelivr): what they import by
   * ("three", "chart.js/auto", "leaflet/dist/leaflet.css" for a stylesheet) → the version ("0.170.0").
   */
  libs?: Record<string, string>;
}

/**
 * A widget: an ES module (`code`) whose default export draws it, `export default function (el, value, view) { … }`:
 * el is the element to draw in, value what fills it (the block's data, as for an element), and view what it may do
 * (view.with, view.theme, view.lang, view.asset(name), view.media(src), view.event(name, item), view.set(name, value),
 * view.state, view.resize()). It may return a function that cleans up. It imports what libs names.
 */
export interface UiWidget {
  code: string;
  /** Its style, for what it draws (& for the widget itself). */
  css?: string;
  /** What it shows, in a line. */
  description?: string;
  /** Its height while it has none of its own (CSS: "360px", "60vh"); 320px unless set. */
  height?: string;
}

/** A custom element: HTML with {{values}}, drawn again whenever what fills it changes. */
export interface UiElement {
  html: string;
  /** Its style: rules for what is inside it (h3 { … }), & for the element itself. */
  css?: string;
  /** What it shows, in a line (for whoever changes the view next). */
  description?: string;
}

export interface UiPage {
  id: string;
  title: string;
  /** Where it shows: a run's page (its answer and its form's answers; the default), or the app's own page ("app"). */
  on?: 'run' | 'app';
  /** false: no tab of its own, reached by an event ({ do: "page" }). */
  tab?: boolean;
  /** Shown only when this value is there ("result.red_flags", "!state.picked", "result.flags|count|over:2"). */
  if?: string;
  blocks: UiBlock[];
}

export interface UiBlock {
  /** A heading over it. */
  title?: string;
  /** One of the view's elements, or a built-in one (BUILTIN_ELEMENTS). */
  element?: string;
  /** Or a template of its own, for this place only. */
  html?: string;
  /** Or text with {{values}}, written in Markdown. */
  text?: string;
  /** What fills it: a value's name ("result.days", "inputs", "data.items", "state.picked", "page.item"). */
  data?: string;
  /** Drawn once for each item of the list `data` names. */
  each?: boolean;
  /** Only the items that match: { "topic": "{{state.topic}}" } (an empty value matches all). Records the app keeps take what a find takes. */
  where?: Record<string, unknown>;
  /** The field to put them in order by, "-field" for the highest or latest first. */
  sort?: string;
  /** At most this many. */
  limit?: number;
  /** How the items sit: one under another (list), cards side by side (grid), or in a line that wraps (row). */
  layout?: 'list' | 'grid' | 'row';
  /** Its share of the page's width; blocks that are not full sit side by side on a wide screen. */
  width?: 'full' | 'half' | 'third' | 'two-thirds';
  /** What shows when there is nothing to draw. */
  empty?: string;
  /** Shown only when this value is there (as a page's if). */
  if?: string;
  /** A built-in element's settings (a table's columns, a chart's label and value, a form's flow…). */
  with?: Record<string, unknown>;
}

export type UiActionKind = (typeof UI_ACTIONS)[number]['value'];

/** One thing an event does. Its texts and values take {{names}}: {{item}} (what the element was filled with), {{event.x}} (data-x of what was clicked, or a form's field x), and every name a template takes. */
export interface UiAction {
  do: UiActionKind;
  /** Asks before it goes on ("Remove {{item.title}}?"); no stops the event. */
  confirm?: string;
  /** page: the page to go to; its item ({{page.item}} there). */
  page?: string;
  item?: unknown;
  /** set, toggle: the value's name in the view's state ("picked", "done.@key"); run: the name its run goes by there (as). */
  name?: string;
  value?: unknown;
  /** set, toggle: kept with the run (or the app), so it is there next time. */
  keep?: boolean;
  /** ask, say, copy: the text. */
  text?: string;
  /** run: one of its flows ("run" is the main one). */
  flow?: string;
  /** run, again, start: the answers (again: only those that change). */
  inputs?: Record<string, unknown>;
  /** run: the name the run goes by in the view's state ({{state.<as>.result}}, {{state.<as>.working}}). */
  as?: string;
  /** start: another app, by its id or address, or a ready-made one ("tpl:deep-research"). */
  app?: string;
  /** data: what to do to the records of `collection`. */
  op?: 'add' | 'update' | 'remove';
  collection?: string;
  /** data add: the record; update: what changes. */
  record?: Record<string, unknown>;
  /** data update, remove: the record's id ("{{item.id}}"). */
  id?: string;
  /** open: an address (a page of this app, or the web). */
  url?: string;
}

export const UI_ACTIONS = [
  { value: 'page', label: 'Go to a page', remote: false },
  { value: 'back', label: 'Go back', remote: false },
  { value: 'set', label: 'Set a value', remote: false },
  { value: 'toggle', label: 'Tick or untick', remote: false },
  { value: 'say', label: 'Say something', remote: false },
  { value: 'copy', label: 'Copy text', remote: false },
  { value: 'open', label: 'Open an address', remote: false },
  { value: 'ask', label: 'Ask the agent', remote: true },
  { value: 'run', label: 'Run a flow', remote: true },
  { value: 'again', label: 'Run it again', remote: true },
  { value: 'start', label: 'Start another app', remote: true },
  { value: 'data', label: 'Change what it keeps', remote: true },
] as const;

/** Elements every view has, by name; the view's own may not take these names. */
export const BUILTIN_ELEMENTS = [
  { value: 'text', hint: 'The block’s text, in Markdown, with {{values}}' },
  { value: 'markdown', hint: 'A value written in Markdown' },
  { value: 'list', hint: 'A list, as points (with: label, the field of each row to show)' },
  { value: 'checklist', hint: 'A list to tick off, the ticks kept with the run (with: label)' },
  { value: 'table', hint: 'Rows as a table (with: columns, the fields to show)' },
  { value: 'chart', hint: 'Rows as bars (with: label and value, the fields to draw)' },
  { value: 'image', hint: 'A picture, or several side by side: an address, a file the app keeps, or asset:<name> (with: caption, fit: cover|contain, height, columns)' },
  { value: 'video', hint: 'A video: a file, an address of one, or a YouTube or Vimeo link (with: poster, height)' },
  { value: 'audio', hint: 'A sound or a recording, to play (with: caption)' },
  { value: 'map', hint: 'Places on a map, from rows with a latitude and longitude (with: lat, lng, label, popup, line: true to join them in order, zoom, height)' },
  { value: 'plot', hint: 'A chart drawn with Plotly, 2D or 3D, from rows (with: kind line|bar|scatter|area|pie|histogram|heatmap|scatter3d|surface|line3d, x, y, z, series, title, height), or a Plotly figure { data, layout } as its value' },
  { value: 'answer', hint: 'The whole answer, as the plain card shows it' },
  { value: 'form', hint: 'A form that runs one of its flows (with: flow); the app’s own page' },
  { value: 'runs', hint: 'Its latest runs (with: flow, limit); the app’s own page' },
  { value: 'chat', hint: 'A conversation with its agent; the app’s own page' },
] as const;
const BUILTIN = new Set<string>(BUILTIN_ELEMENTS.map((e) => e.value));

/** The names a view's values start from. */
export const UI_ROOTS = ['result', 'inputs', 'run', 'app', 'state', 'page', 'data', 'last', 'item', 'event', 'today', 'now'] as const;

export const UI_LIMITS = { pages: 12, blocks: 40, elements: 40, events: 60, actions: 8, html: 40_000, css: 20_000, style: 40_000, total: 300_000, state: 64 * 1024, stateKeys: 500, widgets: 12, code: 60_000 };

export const UI_FORMATS = [
  { value: 'date', hint: '2026-11-20 as Fri, Nov 20, 2026' },
  { value: 'shortdate', hint: 'Nov 20' },
  { value: 'longdate', hint: 'November 20, 2026' },
  { value: 'day', hint: 'The day of the month: 20' },
  { value: 'month', hint: 'The month, short: Nov' },
  { value: 'weekday', hint: 'Friday' },
  { value: 'weekday:short', hint: 'Fri' },
  { value: 'year', hint: '2026' },
  { value: 'time', hint: 'The time of a date and time' },
  { value: 'ago', hint: '3 days ago' },
  { value: 'number', hint: '1250.5 as 1,250.5' },
  { value: 'percent', hint: '0.25 as 25%' },
  { value: 'plus:n', hint: 'A number with n added' },
  { value: 'times:n', hint: 'A number times n' },
  { value: 'upper', hint: 'IN CAPITALS' },
  { value: 'lower', hint: 'in small letters' },
  { value: 'slug', hint: 'For a class name: “Very high” as very-high' },
  { value: 'initials', hint: 'Ana Silva as AS' },
  { value: 'short:n', hint: 'At most n characters, then …' },
  { value: 'host', hint: 'A link as its site: example.com' },
  { value: 'url', hint: 'A value to put in an address' },
  { value: 'count', hint: 'How many items' },
  { value: 'first', hint: 'The first item' },
  { value: 'last', hint: 'The last item' },
  { value: 'take:n', hint: 'The first n items' },
  { value: 'join:sep', hint: 'Items as one text (", " unless given)' },
  { value: 'split:sep', hint: 'Text as items: by lines and semicolons, or by sep' },
  { value: 'unique:field', hint: 'Each value of a field once' },
  { value: 'sort:field', hint: 'Items in order of a field (-field: highest first)' },
  { value: 'where:field=value', hint: 'The items whose field is that value (!= for the others)' },
  { value: 'sum:field', hint: 'A field’s numbers added up' },
  { value: 'is:x', hint: 'Yes when the value is x' },
  { value: 'not:x', hint: 'Yes when it is not x' },
  { value: 'has:x', hint: 'Yes when the text has x in it, or the list has x' },
  { value: 'over:n', hint: 'Yes when the number is over n' },
  { value: 'under:n', hint: 'Yes when the number is under n' },
  { value: 'empty', hint: 'Yes when there is nothing' },
  { value: 'or:text', hint: 'The text, when the value is empty' },
  { value: 'yesno', hint: 'true as Yes' },
  { value: 'markdown', hint: 'Text written in Markdown, as formatted text' },
  { value: 'lines', hint: 'Text with its line breaks kept' },
  { value: 'json', hint: 'The value as JSON' },
] as const;

const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
const ELEMENT = /^[a-z][a-z0-9-]{0,39}$/;

// ---- the engine -------------------------------------------------------------------------------------------------

/** A value's place in the view: what an element was filled with, and where in its list. */
export interface UiFrame {
  v: unknown;
  /** Its place in a list: index from 0, key (its id, else its place in the list as it came). */
  meta?: { index: number; number: number; first: boolean; last: boolean; key: string; count: number };
  /** What a block drew this element for ({{item}}). */
  item?: boolean;
}

/** What a template sees: the view's names (result, inputs, state…), the values around it, and how to write dates and numbers. */
export interface UiScope {
  root: Record<string, unknown>;
  stack: UiFrame[];
  lang?: string;
  /** The app's words for Yes and No. */
  words?: { yes?: string; no?: string };
  /** Told each name a template uses that means nothing here (to check a view with a run's values). */
  miss?: (name: string) => void;
}

export type UiNode = string | { t: 'v'; x: string } | { t: 's'; inv: boolean; x: string; kids: UiNode[] };

export type UiEngine = ReturnType<typeof uiEngine>;

/**
 * The template engine: parse, draw (HTML, its values escaped), fill text (an action's text, as a task fills its
 * prompt), values with formats, rules, and Markdown. Self-contained: its source is sent into the frame as it is.
 */
export function uiEngine() {
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const given = (v: unknown): boolean => {
    if (v === null || v === undefined || v === false || v === 0) return false;
    if (typeof v === 'string') return !!v.trim() && v.trim().toLowerCase() !== 'no';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v as object).length > 0;
    return true;
  };
  /** "$1,250.50", "€120" → a number; null when it is not one. */
  const num = (v: unknown): number | null => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const s = v.trim().replace(/^[$€£¥]\s*/, '').replace(/\s*(?:[$€£¥%]|usd|eur|gbp)$/i, '').replace(/(\d)[,_ ](?=\d{3}\b)/g, '$1');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  /** The first number in a text ("390–480 EUR" → 390, "about 2.5 h" → 2.5). */
  const firstNum = (v: unknown): number | null => {
    const n = num(v);
    if (n !== null) return n;
    const m = /-?\d[\d,]*(?:\.\d+)?/.exec(String(v ?? ''));
    return m ? Number(m[0].replace(/,/g, '')) : null;
  };
  /** How two values compare, for putting them in order: as numbers, as dates (2026-11-20), by the number in them ("€120"), or as text. */
  const order = (a: unknown, b: unknown): number => {
    const m = num(a);
    const n = num(b);
    if (m !== null && n !== null) return m - n;
    const iso = /^\d{4}-\d{2}(-\d{2})?([ T]\d{2}:\d{2})?/;
    if (typeof a === 'string' && typeof b === 'string' && iso.test(a) && iso.test(b)) return a < b ? -1 : a > b ? 1 : 0;
    const p = firstNum(a);
    const q = firstNum(b);
    if (p !== null && q !== null && p !== q) return p - q;
    return String(a ?? '').localeCompare(String(b ?? ''));
  };
  const yes = (s: UiScope) => s.words?.yes ?? 'Yes';
  const no = (s: UiScope) => s.words?.no ?? 'No';
  /** A value as a line of text, as a page shows it. */
  const show = (v: unknown, s: UiScope): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'boolean') return v ? yes(s) : no(s);
    if (Array.isArray(v)) return v.map((x) => (isObj(x) ? Object.values(x).map((y) => show(y, s)).filter(Boolean).join(' · ') : show(x, s))).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  /** A value as text for a message: lists as lines, rows as "a · b" lines, a record as "name: value" lines. */
  const asText = (v: unknown, s: UiScope): string => {
    if (Array.isArray(v)) return v.map((x) => `- ${isObj(x) ? Object.values(x).map((y) => show(y, s)).filter(Boolean).join(' · ') : show(x, s)}`).join('\n');
    if (isObj(v))
      return Object.entries(v)
        .map(([k, x]) => `${k}: ${show(x, s)}`)
        .join('\n');
    return show(v, s);
  };
  const same = (a: unknown, b: unknown) => {
    const x = num(a);
    const y = num(b);
    if (x !== null && y !== null) return x === y;
    if (typeof a === 'boolean' || typeof b === 'boolean') return given(a) === given(b);
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  };

  // ---- names -----------------------------------------------------------------------------------------------------

  /** "result.days[0].area" → ["result", "days", 0, "area"]; "." → ["."]; "@key" as itself; null when it is not a name. */
  const readPath = (p: string): (string | number)[] | null => {
    const t = String(p ?? '').trim();
    if (t === '.' || t === 'this') return ['.'];
    const out: (string | number)[] = [];
    for (const [i, part] of t.split('.').entries()) {
      // A name starts with a letter (or @, for @index and the like); the parts after it may be keys (a record's id, a place in a list).
      const m = (i ? /^(@?[\w-]+)((?:\[-?\d+\])*)$/ : /^(@?[A-Za-z_][\w-]*)((?:\[-?\d+\])*)$/).exec(part);
      if (!m) return null;
      out.push(/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]);
      for (const n of m[2].matchAll(/\[(-?\d+)\]/g)) out.push(Number(n[1]));
    }
    return out.length ? out : null;
  };

  const metaOf = (s: UiScope) => {
    for (let i = s.stack.length - 1; i >= 0; i--) if (s.stack[i].meta) return s.stack[i].meta!;
    return null;
  };

  /** A value by its name: the item's own fields first, then the view's names. */
  const lookup = (path: string, s: UiScope): { found: boolean; value: unknown } => {
    const parts = readPath(path);
    if (!parts) return { found: false, value: undefined };
    const [head, ...rest] = parts;
    let v: unknown;
    if (head === '.') v = s.stack.length ? s.stack[s.stack.length - 1].v : s.root;
    else if (typeof head === 'string' && head.startsWith('@')) {
      const m = metaOf(s);
      const k = head.slice(1);
      if (!m || !own(m, k)) return { found: false, value: undefined };
      v = (m as Record<string, unknown>)[k];
    } else if (head === 'item' && s.stack.some((f) => f.item)) {
      v = [...s.stack].reverse().find((f) => f.item)!.v;
    } else {
      let hit = false;
      for (let i = s.stack.length - 1; i >= 0 && !hit; i--) {
        const f = s.stack[i].v;
        if (isObj(f) && own(f, String(head))) {
          v = f[String(head)];
          hit = true;
        }
      }
      if (!hit) {
        if (!own(s.root, String(head))) return { found: false, value: undefined };
        v = s.root[String(head)];
      }
    }
    // Found: every part of the name is there (a value that is there may be empty).
    let found = true;
    for (const k0 of rest) {
      if (v === null || v === undefined) {
        found = false;
        break;
      }
      let k: string | number = k0;
      if (k === '@key') k = metaOf(s)?.key ?? '';
      const i = typeof k === 'number' ? k : /^\d+$/.test(k) ? Number(k) : null;
      if (Array.isArray(v) && i !== null) {
        if (i >= v.length || i < -v.length) found = false;
        v = v.at(i);
      } else if (isObj(v)) {
        if (!own(v, String(k))) found = false;
        v = v[String(k)];
      } else {
        found = false;
        v = undefined;
      }
    }
    return { found, value: v };
  };

  // ---- formats ---------------------------------------------------------------------------------------------------

  const HTML = (html: string) => ({ __html: html });
  const isHtml = (v: unknown): v is { __html: string } => isObj(v) && typeof v.__html === 'string';
  const textOf = (v: unknown, s: UiScope) => (isHtml(v) ? v.__html : show(v, s));
  const dateOf = (v: unknown): Date | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
    const t = String(v ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00`);
    if (!/\d{4}/.test(t)) return null;
    const d = new Date(t.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const dfmt = (v: unknown, s: UiScope, o: Intl.DateTimeFormatOptions) => {
    const d = dateOf(v);
    if (!d) return show(v, s);
    try {
      return new Intl.DateTimeFormat(s.lang || 'en', o).format(d);
    } catch {
      return d.toDateString();
    }
  };
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v]);
  const field = (x: unknown, f: string) => (f && isObj(x) ? x[f] : x);
  const argValue = (a: string, s: UiScope): unknown => (a.startsWith('$') ? lookup(a.slice(1), s).value : a);
  type Fmt = (v: unknown, a: string, s: UiScope) => unknown;
  const F: Record<string, Fmt> = {
    date: (v, _a, s) => dfmt(v, s, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
    shortdate: (v, _a, s) => dfmt(v, s, { day: 'numeric', month: 'short' }),
    longdate: (v, _a, s) => dfmt(v, s, { day: 'numeric', month: 'long', year: 'numeric' }),
    day: (v, _a, s) => dfmt(v, s, { day: 'numeric' }),
    month: (v, _a, s) => dfmt(v, s, { month: 'short' }),
    weekday: (v, a, s) => dfmt(v, s, { weekday: a === 'short' ? 'short' : 'long' }),
    year: (v, _a, s) => dfmt(v, s, { year: 'numeric' }),
    time: (v, _a, s) => dfmt(v, s, { hour: 'numeric', minute: '2-digit' }),
    ago: (v, _a, s) => {
      const d = dateOf(v);
      if (!d) return show(v, s);
      const secs = (d.getTime() - Date.now()) / 1000;
      const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [3600, 'minute'], [86400, 'hour'], [604800, 'day'], [2629800, 'week'], [31557600, 'month'], [Infinity, 'year']];
      const div: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2629800, year: 31557600 };
      const unit = steps.find(([lim]) => Math.abs(secs) < lim)![1];
      try {
        return new Intl.RelativeTimeFormat(s.lang || 'en', { numeric: 'auto' }).format(Math.round(secs / div[unit]), unit);
      } catch {
        return d.toDateString();
      }
    },
    number: (v, _a, s) => {
      const n = num(v);
      if (n === null) return v;
      try {
        return n.toLocaleString(s.lang || 'en', { maximumFractionDigits: 2 });
      } catch {
        return String(n);
      }
    },
    percent: (v, _a, s) => {
      const n = num(v);
      if (n === null) return v;
      try {
        return (n * 100).toLocaleString(s.lang || 'en', { maximumFractionDigits: 1 }) + '%';
      } catch {
        return `${Math.round(n * 1000) / 10}%`;
      }
    },
    plus: (v, a, s) => {
      const n = firstNum(v);
      const b = num(argValue(a, s)) ?? 0;
      return n === null ? v : Math.round((n + b) * 1e6) / 1e6;
    },
    times: (v, a, s) => {
      const n = firstNum(v);
      const b = num(argValue(a, s));
      return n === null || b === null ? v : Math.round(n * b * 1e6) / 1e6;
    },
    upper: (v, _a, s) => show(v, s).toUpperCase(),
    lower: (v, _a, s) => show(v, s).toLowerCase(),
    slug: (v, _a, s) =>
      show(v, s)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    initials: (v, _a, s) =>
      show(v, s)
        .split(/[\s\-_.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join(''),
    short: (v, a, s) => {
      const t = show(v, s);
      const n = Math.max(1, num(a) ?? 80);
      return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
    },
    host: (v, _a, s) => {
      try {
        return new URL(show(v, s)).hostname.replace(/^www\./, '');
      } catch {
        return show(v, s);
      }
    },
    url: (v, _a, s) => encodeURIComponent(show(v, s)),
    count: (v) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : given(v) ? 1 : 0),
    first: (v) => (Array.isArray(v) ? v[0] : v),
    last: (v) => (Array.isArray(v) ? v[v.length - 1] : v),
    take: (v, a) => list(v).slice(0, Math.max(0, num(a) ?? 3)),
    join: (v, a, s) =>
      list(v)
        .map((x) => show(x, s))
        .filter(Boolean)
        .join(a ? a.replace(/\\n/g, '\n') : ', '),
    split: (v, a) => {
      if (Array.isArray(v)) return v;
      const t = String(v ?? '');
      return (a ? t.split(a) : t.split(/\n|;\s*/))
        .map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
        .filter(Boolean);
    },
    unique: (v, a, s) => {
      const out: unknown[] = [];
      for (const x of list(v)) {
        const y = field(x, a);
        if (!given(y) && y !== 0) continue;
        if (!out.some((z) => same(z, y))) out.push(typeof y === 'string' ? y.trim() : show(y, s));
      }
      return out;
    },
    sort: (v, a) => {
      const desc = a.startsWith('-');
      const f = a.replace(/^-/, '');
      return [...list(v)].sort((x, y) => (desc ? -1 : 1) * order(field(x, f), field(y, f)));
    },
    where: (v, a, s) => {
      const m = /^([^!=]+)(!?=)(.*)$/.exec(a);
      if (!m) return list(v);
      const want = argValue(m[3].trim(), s);
      // An empty value to match against matches all (a filter not picked yet).
      if (!given(want) && want !== 0 && want !== false) return list(v);
      return list(v).filter((x) => same(field(x, m[1].trim()), want) === (m[2] === '='));
    },
    sum: (v, a) => list(v).reduce((t: number, x) => t + (firstNum(field(x, a)) ?? 0), 0),
    is: (v, a, s) => same(v, argValue(a, s)),
    not: (v, a, s) => !same(v, argValue(a, s)),
    has: (v, a, s) => {
      const w = argValue(a, s);
      return Array.isArray(v) ? v.some((x) => same(x, w)) : show(v, s).toLowerCase().includes(show(w, s).toLowerCase());
    },
    over: (v, a, s) => {
      const n = firstNum(v);
      const b = num(argValue(a, s));
      return n !== null && b !== null && n > b;
    },
    under: (v, a, s) => {
      const n = firstNum(v);
      const b = num(argValue(a, s));
      return n !== null && b !== null && n < b;
    },
    empty: (v) => !given(v),
    or: (v, a, s) => (given(v) || v === 0 ? v : argValue(a, s)),
    yesno: (v, _a, s) => (given(v) ? yes(s) : no(s)),
    markdown: (v, _a, s) => HTML(md(textOf(v, s))),
    lines: (v, _a, s) => HTML(esc(textOf(v, s)).replace(/\n/g, '<br>')),
    json: (v) => JSON.stringify(v ?? null),
  };

  /** "result.days|count|over:2" → its value; `ok` false when a name or a format means nothing here. */
  const evaluate = (expr: string, s: UiScope): unknown => {
    const parts = String(expr ?? '').split('|');
    const path = parts[0].trim();
    const r = lookup(path, s);
    if (!r.found) s.miss?.(path);
    let v = r.value;
    for (const p of parts.slice(1)) {
      const i = p.indexOf(':');
      const name = (i < 0 ? p : p.slice(0, i)).trim();
      const arg = i < 0 ? '' : p.slice(i + 1);
      const f = F[name];
      if (!f) {
        s.miss?.(`|${name}`);
        continue;
      }
      try {
        v = f(isHtml(v) ? v.__html : v, arg, s);
      } catch {
        v = '';
      }
    }
    return v;
  };

  /** A rule as a page's or a block's `if`: a value that must be there; "!" in front: one that must not. */
  const test = (rule: string, s: UiScope): boolean => {
    const t = String(rule ?? '').trim();
    if (!t) return true;
    return t.startsWith('!') ? !given(evaluate(t.slice(1), s)) : given(evaluate(t, s));
  };

  // ---- templates -------------------------------------------------------------------------------------------------

  const cache = new Map<string, { nodes: UiNode[]; error?: string }>();
  /** A template's parts: text, {{values}} and {{#sections}}; error says what does not close or what is not a name. */
  const parse = (src: string): { nodes: UiNode[]; error?: string } => {
    const key = String(src ?? '');
    const hit = cache.get(key);
    if (hit) return hit;
    const root: UiNode[] = [];
    const open: { x: string; kids: UiNode[] }[] = [];
    let kids = root;
    let error: string | undefined;
    // A format's text keeps its spaces ({{tags|join: · }}); names do not.
    const re = /\{\{\s*([#^/]?)\s*([^{}]*?)\}\}/g;
    let at = 0;
    for (const m of key.matchAll(re)) {
      if (m.index! > at) kids.push(key.slice(at, m.index));
      at = m.index! + m[0].length;
      const [, sig] = m;
      const body = m[2].includes('|') ? m[2].replace(/^\s+/, '') : m[2].trim();
      const path = body.split('|')[0].trim();
      if (!readPath(path)) {
        error ??= `{{${sig}${body}}} is not a value's name`;
        kids.push(m[0]);
        continue;
      }
      if (sig === '#' || sig === '^') {
        const node: UiNode = { t: 's', inv: sig === '^', x: body, kids: [] };
        kids.push(node);
        open.push({ x: path, kids });
        kids = node.kids;
      } else if (sig === '/') {
        const top = open.pop();
        if (!top || top.x !== path) {
          error ??= top ? `{{/${path}}} closes {{#${top.x}}}: close it with {{/${top.x}}} first` : `{{/${path}}} closes nothing`;
          if (top) open.push(top);
          continue;
        }
        kids = top.kids;
      } else kids.push({ t: 'v', x: body });
    }
    if (at < key.length) kids.push(key.slice(at));
    if (open.length) error ??= `{{#${open[open.length - 1].x}}} is never closed (end it with {{/${open[open.length - 1].x}}})`;
    const out = { nodes: root, ...(error ? { error } : {}) };
    if (cache.size > 500) cache.clear();
    cache.set(key, out);
    return out;
  };

  const keyOf = (item: unknown, i: number) => (isObj(item) && (typeof item.id === 'string' || typeof item.id === 'number') && String(item.id) ? String(item.id) : String(i));

  /** Draws parts: HTML (values escaped, |markdown and |lines as HTML) or text (values as text, for a message). */
  const draw = (nodes: UiNode[], s: UiScope, html: boolean): string => {
    let out = '';
    for (const n of nodes) {
      if (typeof n === 'string') out += n;
      else if (n.t === 'v') {
        const v = evaluate(n.x, s);
        out += isHtml(v) ? (html ? v.__html : v.__html.replace(/<[^>]*>/g, '')) : html ? esc(show(v, s)) : asText(v, s);
      } else {
        const v = evaluate(n.x, s);
        const items = Array.isArray(v) ? v : null;
        if (n.inv) {
          if (!given(v)) out += draw(n.kids, s, html);
        } else if (items) {
          items.forEach((item, i) => {
            s.stack.push({ v: item, meta: { index: i, number: i + 1, first: i === 0, last: i === items.length - 1, key: keyOf(item, i), count: items.length } });
            try {
              out += draw(n.kids, s, html);
            } finally {
              s.stack.pop();
            }
          });
        } else if (isObj(v) && given(v)) {
          s.stack.push({ v });
          try {
            out += draw(n.kids, s, html);
          } finally {
            s.stack.pop();
          }
        } else if (given(v)) out += draw(n.kids, s, html);
      }
    }
    return out;
  };

  /** A template drawn as HTML. */
  const render = (tpl: string, s: UiScope): string => {
    const p = parse(tpl);
    return draw(p.nodes, s, true);
  };

  /** Text with {{values}}, as an action's text: lists as lines, nothing escaped. */
  const fill = (tpl: string, s: UiScope): string => {
    const p = parse(tpl);
    return draw(p.nodes, s, false).trim();
  };

  /** An action's value: one {{name}} alone keeps its value as it is (a list stays a list); other text is filled; objects and lists each part. */
  const valueOf = (v: unknown, s: UiScope): unknown => {
    if (typeof v === 'string') {
      const one = /^\s*\{\{\s*([^#^/{}][^{}]*?)\s*\}\}\s*$/.exec(v);
      if (one) {
        const x = evaluate(one[1], s);
        return isHtml(x) ? x.__html : (x ?? '');
      }
      return fill(v, s);
    }
    if (Array.isArray(v)) return v.map((x) => valueOf(x, s));
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valueOf(x, s)]));
    return v;
  };

  // ---- Markdown ---------------------------------------------------------------------------------------------------

  /** Inline Markdown on escaped text: code, links (web and mail only), bold, italics. */
  const inline = (t: string): string => {
    const codes: string[] = [];
    let s = esc(t).replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${codes.push(c) - 1}\u0000`);
    s = s.replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_m, a: string, u: string) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${a}</a>`);
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_m, b: string, u: string) => `${b}<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a?: string, b?: string) => `<strong>${a ?? b}</strong>`);
    s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)|(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, (_m, a?: string, b?: string, c?: string, d?: string) => `${a ?? c}<em>${b ?? d}</em>`);
    return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  };

  /** Markdown as HTML: headings, lists, quotes, tables, code, rules and paragraphs (line breaks kept). Everything in it is escaped first. */
  function md(src: string): string {
    const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];
    let i = 0;
    const isList = (l: string) => /^\s*(?:[-*•+]|\d+[.)])\s+/.test(l);
    const isTable = (k: number) => lines[k].includes('|') && k + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[k + 1]);
    const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        i++;
        continue;
      }
      if (/^\s*```/.test(l)) {
        const body: string[] = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
        continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(l.trim());
      if (h) {
        const n = Math.min(6, h[1].length + 1);
        out.push(`<h${n}>${inline(h[2].replace(/\s+#+$/, ''))}</h${n}>`);
        i++;
        continue;
      }
      if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(l)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (/^\s*>/.test(l)) {
        const body: string[] = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push(`<blockquote>${md(body.join('\n'))}</blockquote>`);
        continue;
      }
      if (isTable(i)) {
        const head = cells(l);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push(`<div class="n-ui-scroll"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_c, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (isList(l)) {
        const ordered = /^\s*\d+[.)]\s+/.test(l);
        const items: string[] = [];
        while (i < lines.length && (isList(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
          if (isList(lines[i])) items.push(lines[i].replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, ''));
          else items[items.length - 1] += `\n${lines[i].trim()}`;
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((x) => `<li>${inline(x).replace(/\n/g, '<br>')}</li>`).join('')}</${tag}>`);
        continue;
      }
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|>)/.test(lines[i]) && !isList(lines[i]) && !/^\s*(?:---+|\*\*\*+)\s*$/.test(lines[i]) && !(para.length && isTable(i))) para.push(lines[i++].trim());
      if (!para.length) {
        // A line no rule above took (a table without its separator): as a paragraph of its own.
        para.push(lines[i++].trim());
      }
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  return { parse, render, fill, valueOf, evaluate, test, lookup, given, esc, md, show, asText, keyOf, num, firstNum, order, same, readPath, formats: Object.keys(F) };
}

// ---- tidying a view ----------------------------------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** A value given to an action or a block: text, numbers, yes and no, and lists and records of them, kept small. */
function plain(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.slice(0, 4000);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  if (depth > 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => plain(x, depth + 1));
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .slice(0, 40)
        .map(([k, x]) => [k.slice(0, 60), plain(x, depth + 1)])
        .filter(([, x]) => x !== undefined),
    );
  return undefined;
}

function cleanAction(raw: unknown, where: string, errors: string[]): UiAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${where}: each action is an object like { "do": "page", "page": "days" }`);
    return null;
  }
  const r = raw as Record<string, unknown>;
  const kind = UI_ACTIONS.find((k) => k.value === r.do);
  if (!kind) {
    errors.push(`${where}: “${String(r.do ?? '')}” is not an action (${UI_ACTIONS.map((k) => k.value).join(', ')})`);
    return null;
  }
  const a: UiAction = { do: kind.value };
  const s = (k: keyof UiAction, max: number) => {
    const v = str(r[k], max);
    if (v) (a as unknown as Record<string, unknown>)[k] = v;
  };
  s('confirm', 300);
  switch (a.do) {
    case 'page':
      s('page', 40);
      if (!a.page) errors.push(`${where}: name the page to go to (page)`);
      if (r.item !== undefined) a.item = plain(r.item);
      break;
    case 'set':
    case 'toggle':
      s('name', 120);
      if (!a.name) errors.push(`${where}: name the value (name), like "picked" or "done.@key"`);
      if (a.do === 'set') a.value = r.value === undefined ? null : plain(r.value);
      if (r.keep === true) a.keep = true;
      break;
    case 'say':
    case 'copy':
    case 'ask':
      s('text', 4000);
      if (!a.text) errors.push(`${where}: give the text (text)`);
      break;
    case 'open':
      s('url', 2000);
      if (!a.url) errors.push(`${where}: give the address (url)`);
      break;
    case 'run':
      s('flow', 40);
      a.flow ||= 'run';
      s('as', 40);
      if (r.inputs !== undefined) a.inputs = plain(r.inputs) as Record<string, unknown>;
      break;
    case 'again':
      if (r.inputs !== undefined) a.inputs = plain(r.inputs) as Record<string, unknown>;
      break;
    case 'start':
      s('app', 80);
      if (!a.app) errors.push(`${where}: name the app to start (app: its id or address, or "tpl:<id>" for a ready-made one)`);
      if (r.inputs !== undefined) a.inputs = plain(r.inputs) as Record<string, unknown>;
      break;
    case 'data': {
      const op = r.op === 'add' || r.op === 'update' || r.op === 'remove' ? r.op : null;
      if (!op) errors.push(`${where}: say what to do to the records (op: add, update or remove)`);
      else a.op = op;
      s('collection', 40);
      if (!a.collection) errors.push(`${where}: name the list of records (collection)`);
      if (r.record !== undefined) a.record = plain(r.record) as Record<string, unknown>;
      s('id', 200);
      if ((op === 'update' || op === 'remove') && !a.id) errors.push(`${where}: say which record (id), like "{{item.id}}"`);
      if ((op === 'add' || op === 'update') && (!a.record || typeof a.record !== 'object')) errors.push(`${where}: give the record's fields (record)`);
      break;
    }
  }
  return a;
}

function cleanBlock(raw: unknown, where: string, errors: string[]): UiBlock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${where}: each block is an object like { "element": "day-card", "data": "result.days", "each": true }`);
    return null;
  }
  const r = raw as Record<string, unknown>;
  const b: UiBlock = {};
  const title = str(r.title, 120);
  if (title) b.title = title;
  const element = str(r.element, 40);
  const html = typeof r.html === 'string' ? r.html.slice(0, UI_LIMITS.html) : '';
  const text = str(r.text, 20_000);
  const kinds = [element, html.trim(), text].filter(Boolean).length;
  if (kinds !== 1) errors.push(kinds ? `${where}: give one of element, html or text, not more` : `${where}: say what it draws: an element, html of its own, or text`);
  if (element) b.element = element;
  else if (html.trim()) b.html = html;
  else if (text) b.text = text;
  const data = str(r.data, 200);
  if (data) b.data = data;
  if (r.each === true) b.each = true;
  if (r.where && typeof r.where === 'object' && !Array.isArray(r.where)) b.where = plain(r.where) as Record<string, unknown>;
  const sort = str(r.sort, 60);
  if (sort) b.sort = sort;
  const limit = typeof r.limit === 'number' ? r.limit : typeof r.limit === 'string' ? Number(r.limit) : NaN;
  if (Number.isFinite(limit) && limit > 0) b.limit = Math.min(1000, Math.round(limit));
  if (r.layout === 'list' || r.layout === 'grid' || r.layout === 'row') b.layout = r.layout;
  if (r.width === 'full' || r.width === 'half' || r.width === 'third' || r.width === 'two-thirds') b.width = r.width;
  const empty = str(r.empty, 300);
  if (empty) b.empty = empty;
  const iff = str(r.if, 200);
  if (iff) b.if = iff;
  if (r.with && typeof r.with === 'object' && !Array.isArray(r.with)) b.with = plain(r.with) as Record<string, unknown>;
  if (b.each && !b.data) errors.push(`${where}: a block drawn for each item says which list (data)`);
  return b;
}

/**
 * A view from anything (the builder, an agent, a file): pages with their blocks, elements, events, within bounds;
 * errors say, in words, what to fix (a save stops on them). The checks against the rest of the app (what its
 * answer gives, its flows, what it keeps) are checkUi's.
 */
export function cleanUi(raw: unknown): { ui?: AppUi; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Its view (“ui”) is an object: { "pages": [...], "elements": {...}, "events": {...} }'] };
  const r = raw as Record<string, unknown>;
  const ui: AppUi = { pages: [] };
  // Elements.
  if (r.elements !== undefined) {
    if (!r.elements || typeof r.elements !== 'object' || Array.isArray(r.elements)) errors.push('Its view’s elements are a map of names to { "html": "…", "css": "…" }');
    else {
      const entries = Object.entries(r.elements as Record<string, unknown>);
      if (entries.length > UI_LIMITS.elements) errors.push(`A view has at most ${UI_LIMITS.elements} elements`);
      const els: Record<string, UiElement> = {};
      for (const [name, v] of entries.slice(0, UI_LIMITS.elements)) {
        if (!ELEMENT.test(name)) {
          errors.push(`Element “${name.slice(0, 40)}”: a name is small letters, digits and -, starting with a letter (“day-card”)`);
          continue;
        }
        if (BUILTIN.has(name)) {
          errors.push(`Element “${name}”: that name is a built-in element's (${[...BUILTIN].join(', ')})`);
          continue;
        }
        const o = (typeof v === 'string' ? { html: v } : v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
        const html = typeof o.html === 'string' ? o.html : '';
        if (!html.trim()) {
          errors.push(`Element “${name}”: give its html`);
          continue;
        }
        if (html.length > UI_LIMITS.html) errors.push(`Element “${name}”: its html is over ${UI_LIMITS.html.toLocaleString('en-US')} characters`);
        const css = typeof o.css === 'string' ? o.css : '';
        if (css.length > UI_LIMITS.css) errors.push(`Element “${name}”: its css is over ${UI_LIMITS.css.toLocaleString('en-US')} characters`);
        const el: UiElement = { html: html.slice(0, UI_LIMITS.html) };
        if (css.trim()) el.css = css.slice(0, UI_LIMITS.css);
        const description = str(o.description, 300);
        if (description) el.description = description;
        els[name] = el;
      }
      if (Object.keys(els).length) ui.elements = els;
    }
  }
  // Pages.
  if (!Array.isArray(r.pages) || !r.pages.length) errors.push('Its view needs pages: [{ "id": "main", "title": "…", "blocks": [...] }]');
  else {
    if (r.pages.length > UI_LIMITS.pages) errors.push(`A view has at most ${UI_LIMITS.pages} pages`);
    const ids = new Set<string>();
    for (const [i, p0] of r.pages.slice(0, UI_LIMITS.pages).entries()) {
      const p = (p0 && typeof p0 === 'object' && !Array.isArray(p0) ? p0 : {}) as Record<string, unknown>;
      const id = str(p.id, 40) || `page${i + 1}`;
      const where = `Page “${id}”`;
      if (!NAME.test(id)) errors.push(`${where}: an id is a letter, then letters, digits, - or _`);
      if (ids.has(id)) errors.push(`${where}: two pages have that id`);
      ids.add(id);
      const page: UiPage = { id, title: str(p.title, 80) || id, blocks: [] };
      if (p.on === 'app') page.on = 'app';
      else if (p.on !== undefined && p.on !== 'run') errors.push(`${where}: on is "run" (a run's page, the default) or "app" (the app's own page)`);
      if (p.tab === false) page.tab = false;
      const iff = str(p.if, 200);
      if (iff) page.if = iff;
      const blocks = Array.isArray(p.blocks) ? p.blocks : [];
      if (!blocks.length) errors.push(`${where}: give it blocks (what it shows)`);
      if (blocks.length > UI_LIMITS.blocks) errors.push(`${where}: at most ${UI_LIMITS.blocks} blocks a page`);
      for (const [j, b] of blocks.slice(0, UI_LIMITS.blocks).entries()) {
        const block = cleanBlock(b, `${where}, block ${j + 1}`, errors);
        if (block) page.blocks.push(block);
      }
      ui.pages.push(page);
    }
    if (ui.pages.length && ui.pages.every((p) => p.tab === false)) errors.push('Its view needs a page with a tab of its own (not every page tab: false)');
  }
  // Events.
  if (r.events !== undefined) {
    if (!r.events || typeof r.events !== 'object' || Array.isArray(r.events)) errors.push('Its view’s events are a map of names to actions: { "open_day": [{ "do": "page", "page": "day", "item": "{{item}}" }] }');
    else {
      const entries = Object.entries(r.events as Record<string, unknown>);
      if (entries.length > UI_LIMITS.events) errors.push(`A view has at most ${UI_LIMITS.events} events`);
      const evs: Record<string, UiAction[]> = {};
      for (const [name, v] of entries.slice(0, UI_LIMITS.events)) {
        if (!NAME.test(name)) {
          errors.push(`Event “${name.slice(0, 40)}”: a name is a letter, then letters, digits, - or _`);
          continue;
        }
        const list = Array.isArray(v) ? v : [v];
        if (!list.length) errors.push(`Event “${name}”: give it an action`);
        if (list.length > UI_LIMITS.actions) errors.push(`Event “${name}”: at most ${UI_LIMITS.actions} actions`);
        evs[name] = list
          .slice(0, UI_LIMITS.actions)
          .map((x, k) => cleanAction(x, `Event “${name}”${list.length > 1 ? `, action ${k + 1}` : ''}`, errors))
          .filter((x): x is UiAction => !!x);
      }
      if (Object.keys(evs).length) ui.events = evs;
    }
  }
  if (typeof r.style === 'string' && r.style.trim()) {
    if (r.style.length > UI_LIMITS.style) errors.push(`Its view’s style is over ${UI_LIMITS.style.toLocaleString('en-US')} characters`);
    ui.style = r.style.slice(0, UI_LIMITS.style);
  }
  // Widgets: elements drawn by a script of their own.
  if (r.widgets !== undefined) {
    if (!r.widgets || typeof r.widgets !== 'object' || Array.isArray(r.widgets)) errors.push('Its view’s widgets are a map of names to { "code": "export default function (el, value, view) { … }" }');
    else {
      const entries = Object.entries(r.widgets as Record<string, unknown>);
      if (entries.length > UI_LIMITS.widgets) errors.push(`A view has at most ${UI_LIMITS.widgets} widgets`);
      const ws: Record<string, UiWidget> = {};
      for (const [name, v] of entries.slice(0, UI_LIMITS.widgets)) {
        const where = `Widget “${name.slice(0, 40)}”`;
        if (!ELEMENT.test(name)) {
          errors.push(`${where}: a name is small letters, digits and -, starting with a letter (“globe”)`);
          continue;
        }
        if (BUILTIN.has(name) || ui.elements?.[name]) {
          errors.push(`${where}: an element has that name already`);
          continue;
        }
        const o = (typeof v === 'string' ? { code: v } : v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
        const code = typeof o.code === 'string' ? o.code : '';
        if (!code.trim()) {
          errors.push(`${where}: give its code, a module: export default function (el, value, view) { … }`);
          continue;
        }
        if (code.length > UI_LIMITS.code) errors.push(`${where}: its code is over ${UI_LIMITS.code.toLocaleString('en-US')} characters`);
        if (!/\bexport\s+default\b|\bexport\s*\{[^}]*\bdefault\b/.test(code)) errors.push(`${where}: its code exports the function that draws it: export default function (el, value, view) { … }`);
        const w: UiWidget = { code: code.slice(0, UI_LIMITS.code) };
        const css = typeof o.css === 'string' ? o.css : '';
        if (css.length > UI_LIMITS.css) errors.push(`${where}: its css is over ${UI_LIMITS.css.toLocaleString('en-US')} characters`);
        if (css.trim()) w.css = css.slice(0, UI_LIMITS.css);
        const description = str(o.description, 300);
        if (description) w.description = description;
        const height = str(o.height, 20);
        if (height) {
          if (/^\d{1,4}(\.\d+)?(px|vh|em|rem|%)$/.test(height)) w.height = height;
          else errors.push(`${where}: its height is a CSS length, like "360px" or "60vh"`);
        }
        ws[name] = w;
      }
      if (Object.keys(ws).length) ui.widgets = ws;
    }
  }
  const libs = cleanLibs(r.libs);
  errors.push(...libs.errors);
  if (libs.libs) {
    if (!ui.widgets) errors.push('Its view loads libraries (libs) but has no widgets to use them');
    ui.libs = libs.libs;
  }
  if (JSON.stringify(ui).length > UI_LIMITS.total) errors.push(`Its view is over ${UI_LIMITS.total.toLocaleString('en-US')} characters in all: keep it smaller`);
  return ui.pages.length ? { ui, errors } : { errors };
}

// ---- checking a view against its app ------------------------------------------------------------------------------

/** The templates and texts of a view, each with where it is (for checks and for the words to translate). */
function templatesOf(ui: AppUi): { where: string; tpl: string; html: boolean }[] {
  const out: { where: string; tpl: string; html: boolean }[] = [];
  for (const [name, el] of Object.entries(ui.elements ?? {})) out.push({ where: `Element “${name}”`, tpl: el.html, html: true });
  for (const p of ui.pages)
    p.blocks.forEach((b, j) => {
      const where = `Page “${p.id}”, block ${j + 1}`;
      if (b.html) out.push({ where, tpl: b.html, html: true });
      if (b.text) out.push({ where, tpl: b.text, html: false });
      if (b.title) out.push({ where, tpl: b.title, html: false });
      if (b.empty) out.push({ where, tpl: b.empty, html: false });
    });
  for (const [name, acts] of Object.entries(ui.events ?? {}))
    for (const a of acts) for (const k of ['text', 'confirm', 'url', 'name', 'id'] as const) if (typeof a[k] === 'string') out.push({ where: `Event “${name}”`, tpl: a[k]!, html: false });
  return out;
}

/** The event names a template sends (data-event="…"). */
export function eventsIn(html: string): string[] {
  return [...new Set([...String(html ?? '').matchAll(/\bdata-event\s*=\s*["']?([^"'\s>]+)/g)].map((m) => m[1]))];
}

/** The value names a template uses ({{x}}, {{#x}}), without their formats. */
export function namesIn(tpl: string): string[] {
  return [...new Set([...String(tpl ?? '').matchAll(/\{\{\s*[#^]?\s*([^{}|/][^{}|]*?)\s*(?:\|[^{}]*)?\}\}/g)].map((m) => m[1].trim()))];
}

/**
 * What is wrong with a view (errors) and what may surprise (warnings), against the app it is part of: elements
 * and pages it names, templates that do not close, values its answer and form do not give, flows and lists it
 * does not have, events no element sends or that send nothing.
 */
export function checkUi(r: Pick<AppRecipe, 'ui' | 'answer' | 'fields' | 'flow' | 'flows' | 'data' | 'prompt'>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ui = r.ui;
  if (!ui) return { errors, warnings };
  const E = uiEngine();
  const els = ui.elements ?? {};
  const pages = new Set(ui.pages.map((p) => p.id));
  const events = ui.events ?? {};
  const answer = new Set(r.answer.map((f) => f.id));
  const fields = new Set(r.fields.map((f) => f.id));
  const flows = new Set(['run', ...Object.keys(r.flows ?? {})]);
  const collections = new Set(Object.keys(r.data ?? {}));
  for (const t of templatesOf(ui)) {
    const p = E.parse(t.tpl);
    if (p.error) errors.push(`${t.where}: ${p.error}`);
    for (const f of [...t.tpl.matchAll(/\{\{[^{}]*\}\}/g)].flatMap((m) => m[0].split('|').slice(1).map((x) => x.replace(/\}\}$/, '').split(':')[0].trim())))
      if (f && !E.formats.includes(f)) errors.push(`${t.where}: |${f} is not a format (${E.formats.join(', ')})`);
  }
  // The names a view's values start from, where its pages show.
  const checkName = (name: string, where: string, on: 'run' | 'app') => {
    const parts = E.readPath(name.replace(/^!/, '').split('|')[0].trim());
    if (!parts) return;
    const [head, second] = parts;
    if (head === 'result' && typeof second === 'string' && answer.size && !answer.has(second)) warnings.push(`${where}: {{result.${second}}}: its answer has no field “${second}” (${[...answer].join(', ')})`);
    if (head === 'inputs' && typeof second === 'string' && !fields.has(second)) warnings.push(`${where}: {{inputs.${second}}}: its form has no question “${second}”`);
    if (head === 'data' && typeof second === 'string' && !collections.has(second)) errors.push(`${where}: data.${second}: it keeps no list “${second}”${collections.size ? ` (it keeps ${[...collections].join(', ')})` : ''}`);
    if (on === 'app' && (head === 'result' || head === 'inputs' || head === 'run')) warnings.push(`${where}: the app's own page has no run: use {{last.${String(head)}…}} (its latest run) for ${String(head)}`);
  };
  const used = new Set<string>();
  const sent = new Set<string>();
  for (const [name, el] of Object.entries(els)) for (const ev of eventsIn(el.html)) sent.add(ev);
  for (const page of ui.pages) {
    const on = page.on ?? 'run';
    if (page.if) checkName(page.if, `Page “${page.id}”`, on);
    page.blocks.forEach((b, j) => {
      const where = `Page “${page.id}”, block ${j + 1}`;
      if (b.element) {
        if (!BUILTIN.has(b.element) && !els[b.element] && !ui.widgets?.[b.element]) errors.push(`${where}: there is no element “${b.element}” (its elements: ${[...Object.keys(els), ...Object.keys(ui.widgets ?? {})].join(', ') || 'none yet'}; built in: ${[...BUILTIN].join(', ')})`);
        else used.add(b.element);
        if (b.element === 'map' && b.each) warnings.push(`${where}: a map draws a whole list at once: leave out each`);
        if (b.element === 'plot' && b.each) warnings.push(`${where}: a plot draws a whole list (or a figure) at once: leave out each`);
        if ((b.element === 'form' || b.element === 'runs') && typeof b.with?.flow === 'string' && !flows.has(b.with.flow)) errors.push(`${where}: it has no flow “${b.with.flow}” (${[...flows].join(', ')})`);
        if ((b.element === 'form' || b.element === 'runs' || b.element === 'chat') && on !== 'app') warnings.push(`${where}: a ${b.element} shows on the app's own page only (a page with on: "app")`);
      }
      if (b.html) for (const ev of eventsIn(b.html)) sent.add(ev);
      if (b.data) checkName(b.data, where, on);
      if (b.if) checkName(b.if, where, on);
      for (const t of [b.html, b.text]) if (t) for (const n of namesIn(t)) checkName(n, where, on);
      if (b.element && els[b.element]) for (const n of namesIn(els[b.element].html)) if (!b.data || /^(result|inputs|run|data|last)\b/.test(n)) checkName(n, `${where} (${b.element})`, on);
    });
  }
  for (const name of Object.keys(els)) if (!used.has(name)) warnings.push(`Element “${name}” is on no page`);
  // A widget may also be placed by a template (<n-widget name="…">).
  const placed = Object.values(els).map((e) => e.html).concat(ui.pages.flatMap((p) => p.blocks.map((b) => b.html ?? ''))).join('\n');
  for (const name of Object.keys(ui.widgets ?? {})) if (!used.has(name) && !new RegExp(`<n-widget[^>]*name=["']?${name}\\b`).test(placed)) warnings.push(`Widget “${name}” is on no page`);
  for (const ev of sent) if (!events[ev] && !ev.startsWith('@')) warnings.push(`Its elements send the event “${ev}”, which does nothing: add it to events`);
  const oneTask = !r.flow;
  for (const [name, acts] of Object.entries(events)) {
    if (!sent.has(name)) warnings.push(`Event “${name}”: no element sends it (data-event="${name}")`);
    for (const a of acts) {
      if (a.do === 'page' && a.page && !pages.has(a.page)) errors.push(`Event “${name}”: there is no page “${a.page}” (${[...pages].join(', ')})`);
      if (a.do === 'run' && a.flow && !flows.has(a.flow)) errors.push(`Event “${name}”: it has no flow “${a.flow}” (${[...flows].join(', ')})`);
      if (a.do === 'data' && a.collection && !collections.has(a.collection)) errors.push(`Event “${name}”: it keeps no list “${a.collection}”${collections.size ? ` (it keeps ${[...collections].join(', ')})` : ''}`);
      if (a.do === 'ask' && !oneTask) warnings.push(`Event “${name}”: a run with steps takes no follow-ups, so ask does nothing there: use again (run it again with changed answers) or run (one of its flows)`);
      if (a.do === 'again' && a.inputs) for (const k of Object.keys(a.inputs)) if (!fields.has(k)) errors.push(`Event “${name}”: its form has no question “${k}”`);
      if (a.do === 'run' && a.inputs && a.flow) {
        const want = a.flow === 'run' ? fields : new Set((r.flows?.[a.flow]?.inputs ?? []).map((f) => f.id));
        for (const k of Object.keys(a.inputs)) if (!want.has(k)) errors.push(`Event “${name}”: the flow “${a.flow}” takes no “${k}”`);
      }
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/**
 * Every name a view's templates use that its values do not have, for a run (to say what to fix after a try):
 * the run's page drawn with its answer and its form's answers.
 */
export function missingIn(ui: AppUi, values: { result?: Record<string, unknown> | null; inputs?: Record<string, unknown> }): string[] {
  const E = uiEngine();
  const missing = new Set<string>();
  const root: Record<string, unknown> = { result: values.result ?? {}, inputs: values.inputs ?? {}, run: {}, app: {}, state: {}, page: {}, data: {}, last: {}, event: {}, today: '', now: '' };
  for (const page of ui.pages) {
    if (page.on === 'app') continue;
    const miss = (n: string) => (/^(state|page|event|data|last|item|@)/.test(n) || n.startsWith('|') ? undefined : missing.add(`${page.id}: {{${n}}}`));
    for (const b of page.blocks) {
      // What a click opens or sets is not there before the click.
      if (/^(page|state|event|data|last)\b/.test(b.data ?? '')) continue;
      const scope: UiScope = { root, stack: [], miss };
      const v = b.data ? E.evaluate(b.data, scope) : undefined;
      const tpl = b.html ?? (b.element ? ui.elements?.[b.element]?.html : undefined) ?? b.text;
      if (!tpl) continue;
      const items = b.each ? (Array.isArray(v) ? v : []) : [v];
      for (const [i, item] of items.slice(0, 3).entries())
        E.render(tpl, { ...scope, stack: b.data ? [{ v: item, item: true, ...(b.each ? { meta: { index: i, number: i + 1, first: i === 0, last: i === items.length - 1, key: E.keyOf(item, i), count: items.length } } : {}) }] : [] });
    }
  }
  return [...missing].slice(0, 30);
}

// ---- words to translate (the ready-made apps' views) --------------------------------------------------------------

/** The pieces of a template that are words: the text between its tags, outside {{…}}; values become {0}, {1}… */
function pieces(tpl: string, html: boolean): { at: number; end: number; text: string; refs: string[] }[] {
  const out: { at: number; end: number; text: string; refs: string[] }[] = [];
  const add = (from: number, to: number) => {
    const raw = tpl.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!body) return;
    // Sections inside a piece of text split it: each side is a piece of its own.
    let at = 0;
    for (const m of body.matchAll(/\{\{\s*[#^/][^{}]*\}\}/g)) {
      pieceOf(from + lead + at, body.slice(at, m.index));
      at = m.index! + m[0].length;
    }
    pieceOf(from + lead + at, body.slice(at));
  };
  const pieceOf = (from: number, raw: string) => {
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (!t) return;
    const refs: string[] = [];
    const text = t.replace(/\{\{[^{}]*\}\}/g, (m) => `{${refs.push(m) - 1}}`);
    // Only what reads as words: letters outside the values, not CSS or code.
    if (!/[A-Za-z]{2}/.test(text.replace(/\{\d+\}/g, '')) || /^[\w.-]+$/.test(text) && !/\s/.test(text) && text.length < 3) return;
    out.push({ at: from + lead, end: from + lead + t.length, text, refs });
  };
  if (!html) {
    add(0, tpl.length);
    return out;
  }
  // HTML: text between tags, never inside <style> or <script>.
  const re = /<(style|script)\b[\s\S]*?<\/\1\s*>|<[^>]*>/gi;
  let at = 0;
  for (const m of tpl.matchAll(re)) {
    add(at, m.index!);
    at = m.index! + m[0].length;
  }
  add(at, tpl.length);
  return out;
}

/** The words of a view (titles, texts, its elements' text, what its events say), as the dictionaries list them ("Day {0}"). */
export function uiTexts(ui: AppUi | undefined): string[] {
  if (!ui) return [];
  const out = new Set<string>();
  for (const p of ui.pages) out.add(p.title);
  for (const p of ui.pages)
    for (const b of p.blocks) {
      if (b.title) for (const x of pieces(b.title, false)) out.add(x.text);
      if (b.empty) for (const x of pieces(b.empty, false)) out.add(x.text);
      if (b.text) for (const x of pieces(b.text, false)) out.add(x.text);
      if (b.html) for (const x of pieces(b.html, true)) out.add(x.text);
      for (const k of ['placeholder', 'submit'] as const) if (typeof b.with?.[k] === 'string') out.add(b.with[k] as string);
    }
  for (const el of Object.values(ui.elements ?? {})) for (const x of pieces(el.html, true)) out.add(x.text);
  for (const acts of Object.values(ui.events ?? {}))
    for (const a of acts) for (const k of ['text', 'confirm'] as const) if (a[k] && a.do !== 'copy' && a.do !== 'ask') for (const x of pieces(a[k]!, false)) out.add(x.text);
  // Words in attributes people see: placeholders, titles, labels.
  const attrs = [...Object.values(ui.elements ?? {}).map((e) => e.html), ...ui.pages.flatMap((p) => p.blocks.map((b) => b.html ?? ''))];
  for (const h of attrs) for (const m of h.matchAll(/\b(?:placeholder|title|aria-label|alt)\s*=\s*"([^"{}]*[A-Za-z]{2}[^"{}]*)"/g)) out.add(m[1].trim());
  return [...out].filter(Boolean);
}

/** A template with its words in another language, where `tr` has them ({0} kept as the values it stands for). */
function translateTpl(tpl: string, html: boolean, tr: (s: string) => string): string {
  let out = '';
  let at = 0;
  for (const p of pieces(tpl, html)) {
    const t = tr(p.text);
    if (t === p.text) continue;
    out += tpl.slice(at, p.at) + t.replace(/\{(\d+)\}/g, (m, i: string) => p.refs[Number(i)] ?? m);
    at = p.end;
  }
  out += tpl.slice(at);
  if (html) out = out.replace(/\b(placeholder|title|aria-label|alt)(\s*=\s*")([^"{}]*[A-Za-z]{2}[^"{}]*)"/g, (m, a: string, eq: string, v: string) => `${a}${eq}${tr(v.trim())}"`);
  return out;
}

/** A view in another language: what uiTexts lists, through `tr` (the app's dictionary). */
export function translateUi(ui: AppUi, tr: (s: string) => string): AppUi {
  const t = (s: string | undefined, html = false) => (s === undefined ? undefined : translateTpl(s, html, tr));
  return {
    ...ui,
    pages: ui.pages.map((p) => ({
      ...p,
      title: tr(p.title),
      blocks: p.blocks.map((b) => ({
        ...b,
        ...(b.title ? { title: t(b.title) } : {}),
        ...(b.empty ? { empty: t(b.empty) } : {}),
        ...(b.text ? { text: t(b.text) } : {}),
        ...(b.html ? { html: t(b.html, true) } : {}),
        ...(b.with ? { with: Object.fromEntries(Object.entries(b.with).map(([k, v]) => [k, typeof v === 'string' && ['placeholder', 'submit'].includes(k) ? tr(v) : v])) } : {}),
      })),
    })),
    ...(ui.elements ? { elements: Object.fromEntries(Object.entries(ui.elements).map(([k, e]) => [k, { ...e, html: t(e.html, true)! }])) } : {}),
    ...(ui.events
      ? { events: Object.fromEntries(Object.entries(ui.events).map(([k, acts]) => [k, acts.map((a) => ({ ...a, ...(a.text && a.do !== 'copy' && a.do !== 'ask' ? { text: t(a.text) } : {}), ...(a.confirm ? { confirm: t(a.confirm) } : {}) }))])) }
      : {}),
  };
}

// ---- a view to start from ------------------------------------------------------------------------------------------

/** A view made from an app's answer, to start from: one page, a block for each answer field, in the built-in elements. */
export function defaultUi(r: Pick<AppRecipe, 'answer' | 'name'>): AppUi {
  const blocks: UiBlock[] = r.answer.map((f) =>
    f.type === 'table'
      ? { title: f.label, element: 'table', data: `result.${f.id}` }
      : f.type === 'list'
        ? { title: f.label, element: 'list', data: `result.${f.id}` }
        : f.type === 'markdown'
          ? { title: f.label, element: 'markdown', data: `result.${f.id}` }
          : { title: f.label, text: `{{result.${f.id}}}` },
  );
  return { pages: [{ id: 'main', title: r.name || 'Answer', blocks: blocks.length ? blocks : [{ element: 'answer' }] }] };
}

/** Whether a view has pages for where it shows: a run's page, or the app's own. */
export const pagesFor = (ui: AppUi | undefined, on: 'run' | 'app') => (ui?.pages ?? []).filter((p) => (p.on ?? 'run') === on);

/** A view as a public page shows it: a run's pages, and only what a click does there (nothing kept, run or changed). */
export function localUi(ui: AppUi | undefined): AppUi | undefined {
  if (!ui) return undefined;
  const pages = pagesFor(ui, 'run');
  if (!pages.length) return undefined;
  const remote = new Set<string>(UI_ACTIONS.filter((a) => a.remote).map((a) => a.value));
  const events: Record<string, UiAction[]> = {};
  for (const [k, acts] of Object.entries(ui.events ?? {})) {
    const left = acts.filter((a) => !remote.has(a.do)).map(({ keep: _keep, ...a }) => a);
    if (left.length) events[k] = left;
  }
  const { events: _all, ...rest } = ui;
  return { ...rest, pages, ...(Object.keys(events).length ? { events } : {}) };
}

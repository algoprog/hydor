// A database block for pages (the page editor's, as Notion's): a table whose columns have kinds (text, a number, a select
// with coloured options, several of them, a date, a checkbox, a URL, an email, a phone number, a formula over the row's
// other columns, when the row was made and last changed, files and pictures, and an AI column the helper model fills),
// its rows sorted, filtered, grouped and summed up in a footer; or the same rows as a board of cards in lanes by a select
// column, a gallery of cards with a picture, a list, a calendar by a date column, or a timeline from a start to an end
// date. Each row opens as a page of its own: its title, its columns, and blocks of its own (kept as Markdown). A CSV file
// brings rows in, and the rows go out as one. The block in the page (div.n-db) gives its name (data-db), its title and
// its first columns and rows (data-schema); what it holds from then on is kept with the page's own data (hydor.storage,
// under "n-db:<name>"), changed by whoever uses the page, in Use and in Edit alike, so it stays on every device and through
// the page's versions. It is drawn in a shadow root of its own: its look apart from the page's, and nothing of it in the
// page's HTML. Where nothing would keep a change (a published copy, a page saved as a file, a picture of the page) it is
// shown as it is, read-only.
//
// A chart (figure.n-chart) is drawn here too: from a database of the page (its rows grouped by a column, its numbers summed
// or counted, drawn again as they change) or from a small table of its own (data-chart).
//
// It also turns Markdown into the page editor's blocks (and blocks back into Markdown): a row's own page, the AI's answers
// in the editor, and pages brought in from Markdown or Notion use it.
//
// pageDatabases runs in the browser (its source is sent as text, as the kit's scripts are: it uses only its arguments and
// the browser's globals), and on the server, which reads and changes a page's databases for agents with the same
// normalizing (nothing from a page or an agent becomes markup: words are put in as text, colours come from a list).

/** What keeps a database: the page's storage (or a stand-in for it). */
export interface DbStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
}

export type DbKind = 'text' | 'number' | 'select' | 'multi' | 'date' | 'check' | 'link' | 'email' | 'phone' | 'formula' | 'created' | 'edited' | 'files' | 'ai';

export type DbView = 'table' | 'board' | 'gallery' | 'list' | 'calendar' | 'timeline';

export interface DbOption {
  id: string;
  name: string;
  color: string;
}

/** How an AI column fills its cells (shared/page-ai.ts DbAiHow), and with what. */
export interface DbAiCfg {
  how: 'summarize' | 'extract' | 'classify' | 'translate' | 'custom';
  /** extract: what to take out; custom: what the column holds; translate: which column. */
  prompt?: string;
  /** translate: the language. */
  lang?: string;
  /** classify: the options, comma separated. */
  options?: string;
}

export interface DbCol {
  id: string;
  name: string;
  kind: DbKind;
  /** A select's (or multi-select's) options, in their order. */
  options?: DbOption[];
  /** A formula's expression: prop("Price") * prop("Count"), if(prop("Done"), "✓", "…"). */
  formula?: string;
  /** An AI column: how the helper model fills it. */
  ai?: DbAiCfg;
}

/** A file or a picture in a Files & pictures cell. */
export interface DbFile {
  name: string;
  /** A data: address (a small file inside the page's data) or the app's address of a file kept for pages (/pg/file/…). */
  src: string;
  type?: string;
  size?: number;
}

export interface DbRow {
  id: string;
  /** Its values by column id: text, a number, an option's id, option ids, a date (YYYY-MM-DD), true, an address, files. */
  cells: Record<string, unknown>;
  /** When it was made and last changed (milliseconds): the Created and Last edited columns. */
  created?: number;
  edited?: number;
  /** Its own page's blocks, as Markdown. */
  page?: string;
}

export interface DbFilter {
  col: string;
  op: string;
  value?: unknown;
}

export interface DbState {
  v: 1;
  title: string;
  cols: DbCol[];
  rows: DbRow[];
  view: DbView;
  sort: { col: string; dir: 'asc' | 'desc' } | null;
  filters: DbFilter[];
  /** The board's lanes: a select column's id. */
  group: string | null;
  /** The table's rows grouped by a column (its id), and the groups folded. */
  groupBy?: string | null;
  folded?: string[];
  /** The table's footer: a calculation for each column, by its id (sum, avg, count…). */
  calc?: Record<string, string>;
  /** The calendar's date column, and the timeline's start and end ones (ids). */
  dateCol?: string | null;
  start?: string | null;
  end?: string | null;
  /** The gallery's pictures: a Files & pictures (or URL) column's id. */
  cover?: string | null;
}

/** What a chart is drawn from (figure.n-chart's data-chart). */
export interface ChartCfg {
  type: 'bar' | 'line' | 'area' | 'pie';
  title?: string;
  /** A database of the page (its name), its rows grouped by the column `x`, the columns `y` summed (or counted). */
  db?: string;
  x?: string;
  y?: string[];
  how?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  /** Or a small table of its own: a header row, then a row for each label with its numbers. */
  rows?: (string | number)[][];
}

/** What a database asks of the app around it beyond its keeper (the editor gives them; a page in Use, some). */
export interface DbAppHooks {
  /** An AI column's cell, from the helper model (shared/page-ai.ts DbAiAsk). Only in the editor, where no page script runs. */
  ai?: (ask: { how: string; prompt?: string; lang?: string; options?: string[]; column: string; row: Record<string, string> }) => Promise<{ value: string; cost?: number; model?: string }>;
  /** A file to save on this device (a CSV): a page's frame can't download by itself. */
  download?: (name: string, mime: string, text: string) => void;
  /** A file for a Files & pictures cell, kept by the app (its address); without it, small files go inside the page's data. */
  upload?: (file: File) => Promise<{ src: string; name: string; type?: string; size?: number }>;
}

export interface PageDatabases {
  /** A database from what a block or an agent says (columns and rows by names too), checked and complete. */
  normalize(v: unknown, title?: string): DbState;
  /**
   * Changes as an agent gives them: { title, cols (the columns: kept by name, new ones added, the rest gone), rows (all
   * of them anew), add (rows), update ([{ id, …values }]), remove (row ids), view and its settings }; values by column
   * name or id.
   */
  change(state: DbState, ch: unknown): DbState;
  /** A value as words (an option's name, a date, ✓). */
  text(col: DbCol, v: unknown): string;
  /** A row's value of a column, worked out where the column computes it (a formula, when it was made or changed). */
  value(state: DbState, row: DbRow, col: DbCol): unknown;
  /** The same, as words. */
  cellText(state: DbState, row: DbRow, col: DbCol): string;
  /** A formula worked out for a row: its value as words, or why it can't be. */
  formula(state: DbState, row: DbRow, expr: string): { text: string; value: unknown; error?: string };
  /** A calculation of a column over rows (the table's footer): its words, or '' for none. */
  calculate(state: DbState, rows: DbRow[], col: DbCol, how: string): string;
  /** The rows (those a view shows, or all) as a CSV file's text. */
  csv(state: DbState, rows?: DbRow[]): string;
  /** Rows from a CSV file's text added: its columns matched by name, new ones made. */
  fromCsv(state: DbState, text: string): { state: DbState; added: number; newCols: number };
  /** Markdown as the page editor's blocks (HTML of its own making: words are words). */
  md(text: string): string;
  /** Blocks back as Markdown (in a browser). */
  mdOf(el: Node, max?: number): string;
  /** Draws a database (or a chart) in its block, kept by `store` (`edit`: in the editor, where a keeper that doesn't answer leaves it to read, saying where it changes). */
  mount(host: Element, o: { store: DbStore | null; labels?: Record<string, string> | null; readOnly?: boolean; edit?: boolean } & DbAppHooks): void;
  /** What a block drawn here holds now (null for one not drawn, or not yet read from its keeper): a copy of it starts with it. */
  stateOf(host: Element): DbState | null;
  /**
   * Draws every database and chart of the page as it is read (and those its scripts add), kept by the page's storage
   * (hydor.storage), or by `seed` (stored values by key, as JSON text) where there is none; read-only without an app
   * around the page.
   */
  run(labels?: Record<string, string> | null, seed?: Record<string, string> | null, o?: { readOnly?: boolean }): void;
  words: Record<string, string>;
}

export function pageDatabases(): PageDatabases {
  const KINDS: DbKind[] = ['text', 'number', 'select', 'multi', 'date', 'check', 'link', 'email', 'phone', 'files', 'formula', 'created', 'edited', 'ai'];
  const VIEWS: DbView[] = ['table', 'board', 'gallery', 'list', 'calendar', 'timeline'];
  const COLORS = ['default', 'grey', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const HEX: Record<string, string> = { default: '#8c8a85', grey: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const MAX_ROWS = 2000;
  const MAX_COLS = 30;
  const MAX_OPTS = 60;
  /** A row's own page, at most (characters of Markdown). */
  const MAX_PAGE = 40_000;
  /** A file inside the page's data (a data: address), at most. */
  const MAX_INLINE = 400_000;
  const AI_HOWS = ['summarize', 'extract', 'classify', 'translate', 'custom'];
  /** The words it shows, in English: the app gives them in its language. */
  const WORDS: Record<string, string> = {
    untitled: 'Untitled database',
    table: 'Table',
    // (not "Board": the dictionaries have that word as a leaderboard)
    board: 'Board view',
    gallery: 'Gallery',
    list: 'List',
    calendar: 'Calendar',
    timeline: 'Timeline',
    sort: 'Sort',
    filter: 'Filter',
    newRow: 'New',
    oneRow: '1 row',
    nRows: '{n} rows',
    nOfRows: '{n} of {m} rows',
    kText: 'Text',
    kNumber: 'Number',
    kSelect: 'Select',
    kMulti: 'Multi-select',
    kDate: 'Date',
    kCheck: 'Checkbox',
    kLink: 'URL',
    kEmail: 'Email',
    kPhone: 'Phone',
    kFiles: 'Files & pictures',
    kFormula: 'Formula',
    kCreated: 'Created time',
    kEdited: 'Last edited time',
    kAi: 'AI column',
    colName: 'Column name',
    kind: 'Kind',
    options: 'Options',
    addOption: 'Add an option',
    newOption: 'New option',
    sortAsc: 'Sort ascending',
    sortDesc: 'Sort descending',
    noSort: 'No sort',
    filterBy: 'Filter by it',
    moveLeft: 'Move left',
    moveRight: 'Move right',
    delCol: 'Delete the column',
    addCol: 'Add a column',
    newCol: 'Column',
    delRow: 'Delete the row',
    addFilter: 'Add a filter',
    remove: 'Remove',
    clear: 'Clear',
    groupBy: 'Group by',
    group: 'Group',
    noGroup: 'No grouping',
    noValue: 'No value',
    needSelect: 'A board groups its cards by a select column’s options.',
    addSelect: 'Add a select column',
    status: 'Status',
    untitledRow: 'Untitled',
    open: 'Open the link',
    openRow: 'Open as a page',
    full: 'This database is full: some of the change could not be kept.',
    failed: 'The change could not be kept',
    unread: 'Its rows could not be read',
    inUse: 'Its rows can be changed in Use.',
    opContains: 'contains',
    opNotContains: 'doesn’t contain',
    opIs: 'is',
    opIsNot: 'is not',
    opHas: 'has',
    opHasNot: 'doesn’t have',
    opEmpty: 'is empty',
    opFilled: 'is not empty',
    opBefore: 'is before',
    opAfter: 'is after',
    opChecked: 'is ticked',
    opUnchecked: 'is not ticked',
    cDefault: 'No colour',
    cGrey: 'Grey',
    cBrown: 'Brown',
    cOrange: 'Orange',
    cYellow: 'Yellow',
    cGreen: 'Green',
    cBlue: 'Blue',
    cPurple: 'Purple',
    cPink: 'Pink',
    cRed: 'Red',
    // the footer's calculations
    calculate: 'Calculate',
    calcNone: 'None',
    calcCount: 'Count all',
    calcValues: 'Count values',
    calcEmpty: 'Count empty',
    calcUnique: 'Count unique values',
    calcPctEmpty: 'Percent empty',
    calcPctFilled: 'Percent not empty',
    calcSum: 'Sum',
    calcAvg: 'Average',
    calcMedian: 'Median',
    calcMin: 'Min',
    calcMax: 'Max',
    calcRange: 'Range',
    calcChecked: 'Checked',
    calcUnchecked: 'Unchecked',
    calcPctChecked: 'Percent checked',
    calcEarliest: 'Earliest date',
    calcLatest: 'Latest date',
    calcSpan: 'Date range',
    nDays: '{n} days',
    // the views' own settings
    byDate: 'By',
    needDate: 'A calendar shows the rows on their dates: it needs a date column.',
    needDates: 'A timeline draws each row from its start date to its end date: it needs a date column.',
    addDate: 'Add a date column',
    from: 'From',
    to: 'To',
    today: 'Today',
    prevMonth: 'The month before',
    nextMonth: 'The month after',
    noDates: 'Rows without a date',
    picture: 'Card picture',
    none: 'None',
    // more, and CSV
    more: 'More',
    importCsv: 'Import a CSV',
    exportCsv: 'Export as CSV',
    imported: 'Added {n} rows from {file}',
    badCsv: 'That file has no rows to bring in',
    // a formula
    formula: 'Formula',
    formulaHelp: 'Use prop("Column") for a column’s value, numbers, "words", + − × ÷, comparisons, and if(), round(), concat(), dateBetween(), now()…',
    formulaEmpty: 'Write a formula',
    result: 'For the first row',
    done: 'Done',
    // files
    addFile: 'Add a file',
    tooBig: 'That file is too big to keep in the page: at most {n}.',
    // an AI column
    ai: 'AI',
    aiHow: 'What it fills in',
    aiSummarize: 'A summary of the row',
    aiExtract: 'Something taken out of the row',
    aiClassify: 'One of a few options',
    aiTranslate: 'A translation',
    aiCustom: 'What you ask for',
    aiPrompt: 'What to take out, or what it should hold',
    aiLang: 'Into which language',
    aiOptions: 'The options, with commas between them',
    aiFillAll: 'Fill every row',
    aiFillEmpty: 'Fill the empty rows',
    aiFillOne: 'Fill this cell with AI',
    aiAgain: 'Fill it again',
    aiCost: 'Each row is one request to the helper model (Settings → Models). It fills only when you ask.',
    aiInEdit: 'AI columns are filled in Edit.',
    aiFilling: 'Filling {n} of {m}…',
    aiFilled: 'Filled {n} rows',
    aiStop: 'Stop',
    aiFailed: 'The AI could not fill it',
    // a row's own page
    rowPage: 'Write in the row’s own page…',
    close: 'Close',
    prevRow: 'The row before',
    nextRow: 'The row after',
    // charts
    chartNoData: 'Nothing to draw yet.',
    chartNoDb: 'The database this chart is drawn from is not on the page.',
    chartCount: 'Count',
  };

  // ---- what a database is, checked -----------------------------------------------------------------------------------
  const str = (v: unknown, n: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, n) : typeof v === 'number' && Number.isFinite(v) ? String(v).slice(0, n) : '');
  const uid = (p: string, used: Set<string>) => {
    let id = '';
    do id = `${p}${Math.random().toString(36).slice(2, 8)}`;
    while (used.has(id));
    used.add(id);
    return id;
  };
  const ID = /^[\w-]{1,24}$/;
  const kindOf = (k: unknown): DbKind => {
    const s = String(k ?? '').toLowerCase();
    if ((KINDS as string[]).includes(s)) return s as DbKind;
    const alias: Record<string, DbKind> = {
      'multi-select': 'multi',
      multiselect: 'multi',
      tags: 'multi',
      checkbox: 'check',
      boolean: 'check',
      url: 'link',
      'e-mail': 'email',
      mail: 'email',
      tel: 'phone',
      telephone: 'phone',
      'phone number': 'phone',
      number: 'number',
      num: 'number',
      title: 'text',
      string: 'text',
      status: 'select',
      'created time': 'created',
      created_time: 'created',
      createdtime: 'created',
      'last edited time': 'edited',
      last_edited_time: 'edited',
      'last edited': 'edited',
      updated: 'edited',
      file: 'files',
      'files & media': 'files',
      'files & pictures': 'files',
      media: 'files',
      pictures: 'files',
      images: 'files',
      attachments: 'files',
      'ai column': 'ai',
      'ai autofill': 'ai',
    };
    return alias[s] ?? 'text';
  };
  /** Kinds whose values are worked out, never written in. */
  const computed = (k: DbKind) => k === 'formula' || k === 'created' || k === 'edited';
  const optionsOf = (v: unknown): DbOption[] => {
    const out: DbOption[] = [];
    const used = new Set<string>();
    for (const x of Array.isArray(v) ? v.slice(0, MAX_OPTS) : []) {
      const o = (typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
      const name = str(o?.name, 60).trim();
      if (!o || !name || out.some((y) => y.name.toLowerCase() === name.toLowerCase())) continue;
      const id = typeof o.id === 'string' && ID.test(o.id) && !used.has(o.id) ? o.id : uid('o', used);
      used.add(id);
      out.push({ id, name, color: COLORS.includes(String(o.color)) ? String(o.color) : COLORS[(out.length + 1) % COLORS.length] });
    }
    return out;
  };
  /** A select's option for a value (its id, or its name: a new name makes a new option, unless `add` is false). */
  const optionFor = (col: DbCol, v: unknown, add = true): string | null => {
    const s = str(v, 60).trim();
    if (!s) return null;
    const opts = (col.options ??= []);
    const o = opts.find((x) => x.id === s) ?? opts.find((x) => x.name.toLowerCase() === s.toLowerCase());
    if (o) return o.id;
    if (!add || opts.length >= MAX_OPTS) return null;
    const n = { id: uid('o', new Set(opts.map((x) => x.id))), name: s, color: COLORS[(opts.length + 1) % COLORS.length] };
    opts.push(n);
    return n.id;
  };
  /** A file's address a page may show: a data: address of no more than MAX_INLINE, an address of the app's files, or the web's. */
  const fileSrc = (v: unknown): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (/^data:[\w.+/-]{1,80};base64,[A-Za-z0-9+/=]+$/.test(s)) return s.length <= MAX_INLINE * 1.4 ? s : '';
    if (/^\/pg\/file\/[\w-]{8,80}\/[\w-]{8,80}(\/[^\s"'<>\\]{1,200})?$/.test(s)) return s;
    return /^https:\/\/[^\s"'<>\\]{1,1800}$/.test(s) ? s : '';
  };
  const filesOf = (v: unknown): DbFile[] => {
    const list = Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : typeof v === 'string' && v.trim() ? v.split(/\s*,\s*/) : [];
    const out: DbFile[] = [];
    for (const x of list.slice(0, 20)) {
      const o = (typeof x === 'string' ? { src: x } : x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
      const src = fileSrc(o?.src);
      if (!o || !src) continue;
      const name = str(o.name, 120).trim() || decodeURIComponent((/[^/]+$/.exec(src.split('?')[0])?.[0] ?? 'file').slice(0, 120)).replace(/^data:.*/, 'file');
      const type = str(o.type, 80);
      const size = typeof o.size === 'number' && Number.isFinite(o.size) && o.size >= 0 ? Math.round(o.size) : undefined;
      out.push({ name, src, ...(type ? { type } : {}), ...(size !== undefined ? { size } : {}) });
    }
    return out;
  };
  /** A value as its column keeps it, or undefined for none (`add`: a select's new names make options). */
  const cellOf = (col: DbCol, v: unknown, add = true): unknown => {
    if (v === null || v === undefined) return undefined;
    switch (col.kind) {
      case 'number': {
        const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim().replace(/\s/g, '').replace(',', '.')) : NaN;
        return Number.isFinite(n) ? n : undefined;
      }
      case 'check':
        return v === true || v === 1 || (typeof v === 'string' && /^(true|yes|y|x|✓|1|on|done)$/i.test(v.trim())) ? true : undefined;
      case 'date': {
        const s = str(v, 40).trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        const d = s ? new Date(s) : null;
        return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
      }
      case 'select':
        return optionFor(col, Array.isArray(v) ? v[0] : v, add) ?? undefined;
      case 'multi': {
        const list = (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [])
          .slice(0, MAX_OPTS)
          .map((x) => optionFor(col, x, add))
          .filter((x): x is string => !!x);
        return list.length ? [...new Set(list)] : undefined;
      }
      case 'link': {
        const s = str(v, 2000).trim();
        return s || undefined;
      }
      case 'email': {
        const s = str(v, 200).trim().replace(/^mailto:/i, '');
        return s || undefined;
      }
      case 'phone': {
        const s = str(v, 60).trim().replace(/^tel:/i, '');
        return s || undefined;
      }
      case 'files': {
        const f = filesOf(v);
        return f.length ? f : undefined;
      }
      case 'formula':
      case 'created':
      case 'edited':
        return undefined;
      default: {
        const s = str(v, 4000);
        return s ? s : undefined;
      }
    }
  };
  const dateText = (ms: number, time = true) => {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString(undefined, time ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return d.toISOString().slice(0, time ? 16 : 10).replace('T', ' ');
    }
  };
  const text = (col: DbCol, v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (col.kind === 'select') return col.options?.find((o) => o.id === v)?.name ?? '';
    if (col.kind === 'multi')
      return (Array.isArray(v) ? v : [])
        .map((id) => col.options?.find((o) => o.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    if (col.kind === 'check') return v ? '✓' : '';
    if (col.kind === 'files') return (Array.isArray(v) ? (v as DbFile[]) : []).map((f) => f.name).join(', ');
    if ((col.kind === 'created' || col.kind === 'edited') && typeof v === 'number') return dateText(v);
    if (col.kind === 'formula') return valueWords(v);
    return String(v);
  };
  const OPS: Record<DbKind, string[]> = {
    text: ['contains', 'notContains', 'empty', 'filled'],
    link: ['contains', 'notContains', 'empty', 'filled'],
    email: ['contains', 'notContains', 'empty', 'filled'],
    phone: ['contains', 'notContains', 'empty', 'filled'],
    ai: ['contains', 'notContains', 'empty', 'filled'],
    files: ['contains', 'notContains', 'empty', 'filled'],
    formula: ['contains', 'notContains', 'eq', 'ne', 'gt', 'lt', 'empty', 'filled'],
    number: ['eq', 'ne', 'gt', 'lt', 'empty', 'filled'],
    select: ['is', 'isNot', 'empty', 'filled'],
    multi: ['has', 'hasNot', 'empty', 'filled'],
    date: ['is', 'before', 'after', 'empty', 'filled'],
    created: ['is', 'before', 'after'],
    edited: ['is', 'before', 'after'],
    check: ['checked', 'unchecked'],
  };
  const cleanAi = (v: unknown): DbAiCfg => {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    const how = (AI_HOWS.includes(String(o.how)) ? String(o.how) : 'summarize') as DbAiCfg['how'];
    const prompt = str(o.prompt, 600).trim();
    const lang = str(o.lang, 40).trim();
    const options = Array.isArray(o.options) ? o.options.map((x) => str(x, 60).trim()).filter(Boolean).join(', ') : str(o.options, 600).trim();
    return { how, ...(prompt ? { prompt } : {}), ...(lang ? { lang } : {}), ...(options ? { options } : {}) };
  };
  const stamp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? Math.round(v) : undefined);
  const normalize = (v: unknown, title0 = '', addAll = false): DbState => {
    const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
    const cols: DbCol[] = [];
    const used = new Set<string>();
    for (const x of Array.isArray(o.cols) ? o.cols.slice(0, MAX_COLS) : []) {
      const c = (typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
      if (!c) continue;
      const kind = kindOf(c.kind);
      const id = typeof c.id === 'string' && ID.test(c.id) && !used.has(c.id) ? c.id : uid('c', used);
      used.add(id);
      const col: DbCol = { id, name: str(c.name, 60).trim() || WORDS.newCol, kind };
      if (kind === 'select' || kind === 'multi') col.options = optionsOf(c.options);
      if (kind === 'formula') col.formula = str(c.formula, 2000);
      if (kind === 'ai') col.ai = cleanAi(c.ai);
      cols.push(col);
    }
    if (!cols.length) cols.push({ id: 'name', name: 'Name', kind: 'text' });
    const byName = new Map(cols.map((c) => [c.name.toLowerCase(), c]));
    const rows: DbRow[] = [];
    const rowIds = new Set<string>();
    for (const x of Array.isArray(o.rows) ? o.rows.slice(0, MAX_ROWS) : []) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
      const r = x as Record<string, unknown>;
      const flat = !(r.cells && typeof r.cells === 'object' && !Array.isArray(r.cells));
      const src = (flat ? r : r.cells) as Record<string, unknown>;
      const id = typeof r.id === 'string' && ID.test(r.id) && !rowIds.has(r.id) ? r.id : uid('r', rowIds);
      rowIds.add(id);
      const cells: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(src)) {
        if (flat && (k === 'id' || k === 'cells' || k === '$page' || k === 'created' || k === 'edited' || (k === 'page' && !byName.has('page')))) continue;
        // (values kept by column id name existing options; values by name, an agent's or a block's, may make new ones)
        const byId = cols.find((c) => c.id === k);
        const col = byId ?? byName.get(k.toLowerCase());
        if (!col) continue;
        const cell = cellOf(col, val, addAll || flat || !byId);
        if (cell !== undefined) cells[col.id] = cell;
      }
      const row: DbRow = { id, cells };
      const created = stamp(r.created);
      const edited = stamp(r.edited);
      if (created) row.created = created;
      if (edited) row.edited = edited;
      const page = str(flat ? (r.$page ?? (byName.has('page') ? undefined : r.page)) : r.page, MAX_PAGE);
      if (page.trim()) row.page = page;
      rows.push(row);
    }
    const colIds = new Set(cols.map((c) => c.id));
    const colNamed = (x: unknown) => (typeof x === 'string' ? (cols.find((c) => c.id === x) ?? byName.get(x.toLowerCase())) : undefined);
    const s = o.sort as Record<string, unknown> | null | undefined;
    const sortCol = s && typeof s === 'object' ? colNamed(s.col) : undefined;
    const filters: DbFilter[] = [];
    for (const f of Array.isArray(o.filters) ? o.filters.slice(0, 12) : []) {
      if (!f || typeof f !== 'object') continue;
      const col = cols.find((c) => c.id === (f as DbFilter).col);
      const op = String((f as DbFilter).op ?? '');
      if (!col || !OPS[col.kind].includes(op)) continue;
      const fv = (f as DbFilter).value;
      filters.push({ col: col.id, op, ...(fv !== undefined && fv !== null && fv !== '' ? { value: typeof fv === 'number' ? fv : str(fv, 200) } : {}) });
    }
    const g = colNamed(o.group);
    const group = g && g.kind === 'select' ? g.id : null;
    const gb = colNamed(o.groupBy);
    const groupBy = gb && gb.kind !== 'files' && gb.kind !== 'ai' ? gb.id : null;
    const calc: Record<string, string> = {};
    if (o.calc && typeof o.calc === 'object' && !Array.isArray(o.calc))
      for (const [k, h] of Object.entries(o.calc as Record<string, unknown>)) {
        const col = colNamed(k);
        if (col && typeof h === 'string' && CALCS.includes(h) && calcsFor(col.kind).includes(h)) calc[col.id] = h;
      }
    const dated = (x: unknown) => {
      const c = colNamed(x);
      return c && (c.kind === 'date' || c.kind === 'created' || c.kind === 'edited') ? c.id : null;
    };
    const cv = colNamed(o.cover);
    const view = VIEWS.includes(o.view as DbView) ? (o.view as DbView) : 'table';
    const folded = Array.isArray(o.folded) ? o.folded.map((x) => str(x, 80)).filter(Boolean).slice(0, 100) : [];
    const out: DbState = {
      v: 1,
      title: str(o.title, 120).trim() || str(title0, 120).trim(),
      cols,
      rows,
      view,
      sort: sortCol ? { col: sortCol.id, dir: s?.dir === 'desc' ? 'desc' : 'asc' } : null,
      filters,
      group,
    };
    if (groupBy) out.groupBy = groupBy;
    if (folded.length && groupBy) out.folded = folded;
    if (Object.keys(calc).length) out.calc = calc;
    const dc = dated(o.dateCol);
    const st = dated(o.start);
    const en = dated(o.end);
    if (dc) out.dateCol = dc;
    if (st) out.start = st;
    if (en) out.end = en;
    if (cv && (cv.kind === 'files' || cv.kind === 'link')) out.cover = cv.id;
    void colIds;
    return out;
  };
  const change = (state: DbState, ch0: unknown): DbState => {
    const ch = (ch0 && typeof ch0 === 'object' ? ch0 : {}) as Record<string, unknown>;
    let s: DbState = normalize(JSON.parse(JSON.stringify(state)));
    const now = Date.now();
    if (typeof ch.title === 'string') s.title = str(ch.title, 120).trim();
    if (Array.isArray(ch.cols)) {
      // The columns as given: one of the same name keeps its id (and its values), its kind and options as given.
      const cols = ch.cols.map((x) => {
        const c = (typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        const was = s.cols.find((y) => y.id === c.id || y.name.toLowerCase() === str(c.name, 60).trim().toLowerCase());
        if (!was) return c;
        const kind = c.kind === undefined ? was.kind : kindOf(c.kind);
        const options =
          c.options === undefined
            ? was.options
            : [...(was.options ?? []).filter((o) => (c.options as unknown[]).some((n) => (typeof n === 'string' ? n : (n as DbOption)?.name)?.toLowerCase?.() === o.name.toLowerCase())), ...(c.options as unknown[])];
        return { ...c, id: was.id, kind, options, formula: c.formula === undefined ? was.formula : c.formula, ai: c.ai === undefined ? was.ai : c.ai };
      });
      // Values move with their columns; a column whose kind changes takes them as words, kept where they fit.
      const rows = s.rows.map((r) => ({
        ...r,
        cells: Object.fromEntries(
          s.cols.flatMap((was) => {
            const now = cols.find((c) => (c as { id?: string }).id === was.id) as Record<string, unknown> | undefined;
            if (!now || r.cells[was.id] === undefined) return [];
            const v = r.cells[was.id];
            const sameKind = kindOf(now.kind) === was.kind;
            return [[was.id, sameKind && was.kind !== 'select' && was.kind !== 'multi' ? v : was.kind === 'multi' && kindOf(now.kind) === 'multi' ? (v as string[]).map((id) => was.options?.find((o) => o.id === id)?.name ?? id) : text(was, v)]];
          }),
        ),
      }));
      // (a column of another kind now: its values, as words, make its options)
      s = normalize({ ...s, cols, rows }, '', true);
    }
    if (Array.isArray(ch.rows)) s = normalize({ ...s, rows: ch.rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? { created: now, edited: now, ...(r as object) } : r)) });
    if (Array.isArray(ch.add)) s = normalize({ ...s, rows: [...s.rows, ...ch.add.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? { created: now, edited: now, ...(r as object) } : r))] });
    if (Array.isArray(ch.update)) {
      const byName = new Map(s.cols.map((c) => [c.name.toLowerCase(), c]));
      for (const u0 of ch.update) {
        const u = (u0 && typeof u0 === 'object' ? u0 : {}) as Record<string, unknown>;
        const row = s.rows.find((r) => r.id === u.id);
        if (!row) continue;
        for (const [k, v] of Object.entries(u)) {
          if (k === 'id') continue;
          if (k === '$page' || (k === 'page' && !byName.has('page'))) {
            const p = str(v, MAX_PAGE);
            if (p.trim()) row.page = p;
            else delete row.page;
            continue;
          }
          const col = s.cols.find((c) => c.id === k) ?? byName.get(k.toLowerCase());
          if (!col) continue;
          const cell = cellOf(col, v);
          if (cell === undefined) delete row.cells[col.id];
          else row.cells[col.id] = cell;
        }
        row.edited = now;
      }
      s = normalize(s);
    }
    if (Array.isArray(ch.remove)) {
      const gone = new Set(ch.remove.map(String));
      s = { ...s, rows: s.rows.filter((r) => !gone.has(r.id)) };
    }
    // The view, and its settings, by column names too.
    const set: Record<string, unknown> = {};
    for (const k of ['view', 'group', 'groupBy', 'calc', 'dateCol', 'start', 'end', 'cover', 'sort', 'filters'] as const) if (ch[k] !== undefined) set[k] = ch[k];
    if (Object.keys(set).length) {
      const filters = Array.isArray(set.filters)
        ? (set.filters as unknown[]).map((f) => {
            const x = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
            const col = s.cols.find((c) => c.id === x.col || c.name.toLowerCase() === String(x.col ?? '').toLowerCase());
            return { ...x, col: col?.id ?? x.col };
          })
        : undefined;
      s = normalize({ ...s, ...set, ...(filters ? { filters } : {}) });
    }
    return s;
  };

  // ---- formulas (a column worked out from the row's other columns) ---------------------------------------------------------
  type Val = number | string | boolean | Date | null | Val[];
  type Tok = { t: 'n'; v: number } | { t: 's'; v: string } | { t: 'id'; v: string } | { t: 'p'; v: string } | { t: 'op'; v: string };
  type Node =
    | { k: 'lit'; v: Val }
    | { k: 'prop'; name: string }
    | { k: 'call'; f: string; args: Node[] }
    | { k: 'un'; op: string; a: Node }
    | { k: 'bin'; op: string; a: Node; b: Node }
    | { k: 'if'; c: Node; a: Node; b: Node };
  const lex = (src: string): Tok[] => {
    const out: Tok[] = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (/[0-9.]/.test(c) && /[0-9]/.test(src[i + 1] ?? c)) {
        const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i))!;
        out.push({ t: 'n', v: Number(m[0]) });
        i += m[0].length;
        continue;
      }
      if (c === '"' || c === '“' || c === "'") {
        const close = c === '“' ? '”' : c;
        let j = i + 1;
        let s = '';
        while (j < src.length && src[j] !== close && !(c === '“' && src[j] === '"')) {
          if (src[j] === '\\' && j + 1 < src.length) {
            s += src[j + 1] === 'n' ? '\n' : src[j + 1];
            j += 2;
          } else s += src[j++];
        }
        if (j >= src.length) throw new Error('A text is not closed: end it with "');
        out.push({ t: 's', v: s });
        i = j + 1;
        continue;
      }
      if (c === '{') {
        const j = src.indexOf('}', i);
        if (j < 0) throw new Error('A {column} is not closed');
        out.push({ t: 'p', v: src.slice(i + 1, j).trim() });
        i = j + 1;
        continue;
      }
      if (/[\p{L}_]/u.test(c)) {
        const m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))!;
        out.push({ t: 'id', v: m[0] });
        i += m[0].length;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
        out.push({ t: 'op', v: two });
        i += 2;
        continue;
      }
      if ('+-*/%^()<>!,?:=×÷−'.includes(c)) {
        out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c === '=' ? '==' : c });
        i++;
        continue;
      }
      throw new Error(`“${c}” can’t be used here`);
    }
    return out;
  };
  const FUNCS = new Set([
    'prop', 'if', 'ifs', 'empty', 'not', 'and', 'or', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'pow', 'min', 'max', 'sum', 'mean', 'average', 'avg', 'median', 'length', 'lower', 'upper', 'trim',
    'concat', 'join', 'contains', 'replace', 'replaceAll', 'slice', 'format', 'toNumber', 'now', 'today', 'dateAdd', 'dateSubtract', 'dateBetween', 'formatDate', 'year', 'month', 'day', 'date', 'week', 'hour', 'minute', 'sign', 'mod', 'at', 'first', 'last', 'count', 'unique', 'includes', 'repeat', 'style',
  ]);
  const parse = (src: string, names: Set<string>): Node => {
    const toks = lex(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v;
    const isWord = (v: string) => peek()?.t === 'id' && peek()!.v.toLowerCase() === v;
    const need = (v: string) => {
      if (!isOp(v)) throw new Error(`“${v}” is missing`);
      p++;
    };
    const primary = (): Node => {
      const t = toks[p++];
      if (!t) throw new Error('The formula stops too soon');
      if (t.t === 'n') return { k: 'lit', v: t.v };
      if (t.t === 's') return { k: 'lit', v: t.v };
      if (t.t === 'p') return { k: 'prop', name: t.v };
      if (t.t === 'op' && t.v === '(') {
        const e = expr();
        need(')');
        return e;
      }
      if (t.t === 'id') {
        const w = t.v.toLowerCase();
        if (w === 'true' || w === 'false') return { k: 'lit', v: w === 'true' };
        if (isOp('(')) {
          p++;
          const args: Node[] = [];
          if (!isOp(')')) {
            do args.push(expr());
            while (isOp(',') && ++p);
          }
          need(')');
          const f = [...FUNCS].find((x) => x.toLowerCase() === w);
          if (!f) throw new Error(`There is no function “${t.v}”`);
          if (f === 'prop') {
            if (args.length !== 1 || args[0].k !== 'lit' || typeof args[0].v !== 'string') throw new Error('prop() takes a column’s name in quotes: prop("Price")');
            return { k: 'prop', name: args[0].v };
          }
          return { k: 'call', f, args };
        }
        // A column's name written bare, when it is one word.
        if ([...names].some((n) => n.toLowerCase() === w)) return { k: 'prop', name: t.v };
        throw new Error(`“${t.v}” is not a column: write prop("${t.v}")`);
      }
      throw new Error(`“${t.v}” can’t be used here`);
    };
    const unary = (): Node => {
      if (isOp('-')) {
        p++;
        return { k: 'un', op: '-', a: unary() };
      }
      if (isOp('!') || isWord('not')) {
        p++;
        return { k: 'un', op: '!', a: unary() };
      }
      return primary();
    };
    const power = (): Node => {
      const a = unary();
      if (isOp('^')) {
        p++;
        return { k: 'bin', op: '^', a, b: power() };
      }
      return a;
    };
    const level = (next: () => Node, ops: string[], words: Record<string, string> = {}) => (): Node => {
      let a = next();
      for (;;) {
        const t = peek();
        const op = t?.t === 'op' && ops.includes(t.v) ? t.v : t?.t === 'id' && words[t.v.toLowerCase()] ? words[t.v.toLowerCase()] : null;
        if (!op) return a;
        p++;
        a = { k: 'bin', op, a, b: next() };
      }
    };
    const mul = level(power, ['*', '/', '%']);
    const add = level(mul, ['+', '-']);
    const cmp = level(add, ['<', '<=', '>', '>=']);
    const eq = level(cmp, ['==', '!=']);
    const and = level(eq, ['&&'], { and: '&&' });
    const or = level(and, ['||'], { or: '||' });
    const expr = (): Node => {
      const c = or();
      if (isOp('?')) {
        p++;
        const a = expr();
        need(':');
        return { k: 'if', c, a, b: expr() };
      }
      return c;
    };
    if (!toks.length) throw new Error('The formula is empty');
    const e = expr();
    if (p < toks.length) throw new Error(`“${(toks[p] as { v: unknown }).v}” is not in place`);
    return e;
  };
  const compiled = new Map<string, Node | Error>();
  const compile = (src: string, names: Set<string>): Node => {
    const key = `${src}\u0000${[...names].join('\u0001')}`;
    let c = compiled.get(key);
    if (!c) {
      try {
        c = parse(src, names);
      } catch (e) {
        c = e as Error;
      }
      if (compiled.size > 400) compiled.clear();
      compiled.set(key, c);
    }
    if (c instanceof Error) throw c;
    return c;
  };
  const isEmpty = (v: Val) => v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v));
  const asNum = (v: Val): number => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v instanceof Date ? v.getTime() : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : NaN);
  const asBool = (v: Val): boolean => (Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v !== '' : typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : !!v);
  const asDate = (v: Val): Date | null => {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string' && v) {
      const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  };
  const numWords = (n: number) => {
    if (!Number.isFinite(n)) return '';
    try {
      return n.toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2 });
    } catch {
      return String(Math.round(n * 100) / 100);
    }
  };
  /** A formula's value as words. */
  const valueWords = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return numWords(v);
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (v instanceof Date) return dateText(v.getTime(), !!(v.getHours() || v.getMinutes()));
    if (Array.isArray(v)) return v.map(valueWords).join(', ');
    return String(v);
  };
  const UNITS: Record<string, number> = { years: 365.25 * 864e5, months: 30.44 * 864e5, weeks: 7 * 864e5, days: 864e5, hours: 36e5, minutes: 6e4 };
  const unitOf = (u: Val) => {
    const s = String(u ?? 'days').toLowerCase();
    return Object.keys(UNITS).find((k) => k === s || k.slice(0, -1) === s) ?? 'days';
  };
  const addTo = (d: Date, n: number, unit: string): Date => {
    const x = new Date(d.getTime());
    if (unit === 'years') x.setFullYear(x.getFullYear() + n);
    else if (unit === 'months') x.setMonth(x.getMonth() + n);
    else x.setTime(x.getTime() + n * UNITS[unit]);
    return x;
  };
  /** A column's value as a formula sees it (an option's name, a date, a list of names). */
  const formulaValue = (s: DbState, row: DbRow, col: DbCol, depth: number): Val => {
    if (col.kind === 'formula') return depth > 6 ? null : calcFormula(s, row, col.formula ?? '', depth + 1).value;
    if (col.kind === 'created') return row.created ? new Date(row.created) : null;
    if (col.kind === 'edited') return row.edited ? new Date(row.edited) : row.created ? new Date(row.created) : null;
    const v = row.cells[col.id];
    if (v === undefined || v === null) return col.kind === 'check' ? false : col.kind === 'number' ? null : col.kind === 'multi' || col.kind === 'files' ? [] : '';
    if (col.kind === 'number') return typeof v === 'number' ? v : null;
    if (col.kind === 'check') return v === true;
    if (col.kind === 'date') return asDate(String(v));
    if (col.kind === 'select') return col.options?.find((o) => o.id === v)?.name ?? '';
    if (col.kind === 'multi') return (Array.isArray(v) ? v : []).map((id) => col.options?.find((o) => o.id === id)?.name ?? '').filter(Boolean);
    if (col.kind === 'files') return (Array.isArray(v) ? (v as DbFile[]) : []).map((f) => f.name);
    return String(v);
  };
  const call = (f: string, a: Val[]): Val => {
    const nums = () => a.flat(2).map(asNum).filter((x) => !Number.isNaN(x));
    const n0 = asNum(a[0] ?? null);
    switch (f) {
      case 'empty':
        return isEmpty(a[0] ?? null);
      case 'not':
        return !asBool(a[0] ?? null);
      case 'and':
        return a.every(asBool);
      case 'or':
        return a.some(asBool);
      case 'abs':
        return Math.abs(n0);
      case 'sign':
        return Math.sign(n0);
      case 'round': {
        const k = 10 ** Math.max(0, Math.min(10, Math.round(asNum(a[1] ?? 0) || 0)));
        return Math.round(n0 * k) / k;
      }
      case 'floor':
        return Math.floor(n0);
      case 'ceil':
        return Math.ceil(n0);
      case 'sqrt':
        return Math.sqrt(n0);
      case 'pow':
        return n0 ** asNum(a[1] ?? 1);
      case 'mod':
        return n0 % asNum(a[1] ?? 1);
      case 'min':
        return nums().length ? Math.min(...nums()) : null;
      case 'max':
        return nums().length ? Math.max(...nums()) : null;
      case 'sum':
        return nums().reduce((x, y) => x + y, 0);
      case 'mean':
      case 'average':
      case 'avg': {
        const l = nums();
        return l.length ? l.reduce((x, y) => x + y, 0) / l.length : null;
      }
      case 'median': {
        const l = nums().sort((x, y) => x - y);
        return l.length ? (l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2) : null;
      }
      case 'count':
        return a.flat(2).filter((x) => !isEmpty(x as Val)).length;
      case 'length':
        return Array.isArray(a[0]) ? a[0].length : valueWords(a[0] ?? '').length;
      case 'lower':
        return valueWords(a[0] ?? '').toLowerCase();
      case 'upper':
        return valueWords(a[0] ?? '').toUpperCase();
      case 'trim':
        return valueWords(a[0] ?? '').trim();
      case 'concat':
        return a.every(Array.isArray) && a.length ? (a as Val[][]).flat() : a.map(valueWords).join('');
      case 'join':
        return (Array.isArray(a[0]) ? a[0] : [a[0] ?? '']).map(valueWords).join(a[1] === undefined ? ', ' : valueWords(a[1]));
      case 'contains':
      case 'includes':
        return Array.isArray(a[0]) ? a[0].some((x) => valueWords(x).toLowerCase() === valueWords(a[1] ?? '').toLowerCase()) : valueWords(a[0] ?? '').toLowerCase().includes(valueWords(a[1] ?? '').toLowerCase());
      case 'replace':
        return valueWords(a[0] ?? '').replace(valueWords(a[1] ?? ''), valueWords(a[2] ?? ''));
      case 'replaceAll':
        return valueWords(a[0] ?? '').split(valueWords(a[1] ?? '')).join(valueWords(a[2] ?? ''));
      case 'slice': {
        if (Array.isArray(a[0])) return a[0].slice(asNum(a[1] ?? 0) || 0, a[2] === undefined ? undefined : asNum(a[2]));
        return valueWords(a[0] ?? '').slice(asNum(a[1] ?? 0) || 0, a[2] === undefined ? undefined : asNum(a[2]));
      }
      case 'repeat':
        return valueWords(a[0] ?? '').repeat(Math.max(0, Math.min(200, Math.floor(asNum(a[1] ?? 0)) || 0)));
      case 'at':
        return Array.isArray(a[0]) ? (a[0][Math.floor(asNum(a[1] ?? 0))] ?? null) : valueWords(a[0] ?? '').charAt(Math.floor(asNum(a[1] ?? 0)));
      case 'first':
        return Array.isArray(a[0]) ? (a[0][0] ?? null) : (a[0] ?? null);
      case 'last':
        return Array.isArray(a[0]) ? (a[0][a[0].length - 1] ?? null) : (a[0] ?? null);
      case 'unique':
        return Array.isArray(a[0]) ? [...new Map(a[0].map((x) => [valueWords(x), x])).values()] : (a[0] ?? null);
      case 'format':
        return valueWords(a[0] ?? '');
      case 'style':
        return a[0] ?? null;
      case 'toNumber': {
        if (a[0] instanceof Date) return a[0].getTime();
        const x = asNum(typeof a[0] === 'string' ? a[0].replace(/[^\d.,-]/g, '').replace(',', '.') : (a[0] ?? null));
        return Number.isNaN(x) ? null : x;
      }
      case 'now':
        return new Date();
      case 'today': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
      }
      case 'date': {
        if (a.length >= 3) return new Date(asNum(a[0]), asNum(a[1]) - 1, asNum(a[2]));
        const d = asDate(a[0] ?? null);
        return d ? d.getDate() : null;
      }
      case 'dateAdd':
      case 'dateSubtract': {
        const d = asDate(a[0] ?? null);
        if (!d) return null;
        return addTo(d, (f === 'dateSubtract' ? -1 : 1) * (asNum(a[1] ?? 0) || 0), unitOf(a[2] ?? 'days'));
      }
      case 'dateBetween': {
        const x = asDate(a[0] ?? null);
        const y = asDate(a[1] ?? null);
        if (!x || !y) return null;
        const u = unitOf(a[2] ?? 'days');
        if (u === 'months' || u === 'years') {
          const m = (x.getFullYear() - y.getFullYear()) * 12 + (x.getMonth() - y.getMonth()) - (x.getDate() < y.getDate() ? 1 : 0);
          return u === 'years' ? Math.trunc(m / 12) : m;
        }
        return Math.trunc((x.getTime() - y.getTime()) / UNITS[u]);
      }
      case 'formatDate': {
        const d = asDate(a[0] ?? null);
        if (!d) return '';
        const f2 = a[1] === undefined ? '' : valueWords(a[1]);
        if (!f2) return dateText(d.getTime(), false);
        const pad = (x: number) => String(x).padStart(2, '0');
        const mon = (style: 'short' | 'long') => {
          try {
            return d.toLocaleDateString(undefined, { month: style });
          } catch {
            return String(d.getMonth() + 1);
          }
        };
        return f2.replace(/YYYY|MMMM|MMM|MM|DD|HH|mm/g, (t) => (t === 'YYYY' ? String(d.getFullYear()) : t === 'MMMM' ? mon('long') : t === 'MMM' ? mon('short') : t === 'MM' ? pad(d.getMonth() + 1) : t === 'DD' ? pad(d.getDate()) : t === 'HH' ? pad(d.getHours()) : pad(d.getMinutes())));
      }
      case 'year':
        return asDate(a[0] ?? null)?.getFullYear() ?? null;
      case 'month': {
        const d = asDate(a[0] ?? null);
        return d ? d.getMonth() + 1 : null;
      }
      case 'day': {
        const d = asDate(a[0] ?? null);
        return d ? d.getDay() || 7 : null;
      }
      case 'week': {
        const d = asDate(a[0] ?? null);
        if (!d) return null;
        const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const day = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - day);
        return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
      }
      case 'hour':
        return asDate(a[0] ?? null)?.getHours() ?? null;
      case 'minute':
        return asDate(a[0] ?? null)?.getMinutes() ?? null;
      default:
        throw new Error(`There is no function “${f}”`);
    }
  };
  const evaluate = (n: Node, s: DbState, row: DbRow, depth: number): Val => {
    switch (n.k) {
      case 'lit':
        return n.v;
      case 'prop': {
        const col = s.cols.find((c) => c.name.toLowerCase() === n.name.toLowerCase()) ?? s.cols.find((c) => c.id === n.name);
        if (!col) throw new Error(`There is no column “${n.name}”`);
        return formulaValue(s, row, col, depth);
      }
      case 'if':
        return asBool(evaluate(n.c, s, row, depth)) ? evaluate(n.a, s, row, depth) : evaluate(n.b, s, row, depth);
      case 'un': {
        const a = evaluate(n.a, s, row, depth);
        return n.op === '-' ? -asNum(a) : !asBool(a);
      }
      case 'call': {
        if (n.f === 'if') return asBool(evaluate(n.args[0] ?? { k: 'lit', v: false }, s, row, depth)) ? (n.args[1] ? evaluate(n.args[1], s, row, depth) : null) : n.args[2] ? evaluate(n.args[2], s, row, depth) : null;
        if (n.f === 'ifs') {
          for (let i = 0; i + 1 < n.args.length; i += 2) if (asBool(evaluate(n.args[i], s, row, depth))) return evaluate(n.args[i + 1], s, row, depth);
          return n.args.length % 2 ? evaluate(n.args[n.args.length - 1], s, row, depth) : null;
        }
        return call(n.f, n.args.map((x) => evaluate(x, s, row, depth)));
      }
      case 'bin': {
        if (n.op === '&&') return asBool(evaluate(n.a, s, row, depth)) && asBool(evaluate(n.b, s, row, depth));
        if (n.op === '||') return asBool(evaluate(n.a, s, row, depth)) || asBool(evaluate(n.b, s, row, depth));
        const a = evaluate(n.a, s, row, depth);
        const b = evaluate(n.b, s, row, depth);
        switch (n.op) {
          case '+':
            if (typeof a === 'string' || typeof b === 'string') return valueWords(a) + valueWords(b);
            if (a instanceof Date && typeof b === 'number') return new Date(a.getTime() + b * 864e5);
            return asNum(a) + asNum(b);
          case '-':
            if (a instanceof Date && b instanceof Date) return Math.round((a.getTime() - b.getTime()) / 864e5);
            if (a instanceof Date && typeof b === 'number') return new Date(a.getTime() - b * 864e5);
            return asNum(a) - asNum(b);
          case '*':
            return asNum(a) * asNum(b);
          case '/':
            return asNum(b) === 0 ? null : asNum(a) / asNum(b);
          case '%':
            return asNum(a) % asNum(b);
          case '^':
            return asNum(a) ** asNum(b);
          case '==':
          case '!=': {
            const same = a instanceof Date || b instanceof Date ? asDate(a)?.getTime() === asDate(b)?.getTime() : typeof a === 'number' || typeof b === 'number' ? asNum(a) === asNum(b) : valueWords(a) === valueWords(b);
            return n.op === '==' ? same : !same;
          }
          default: {
            const x = a instanceof Date || b instanceof Date ? (asDate(a)?.getTime() ?? NaN) : typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : asNum(a);
            const y = a instanceof Date || b instanceof Date ? (asDate(b)?.getTime() ?? NaN) : typeof a === 'string' && typeof b === 'string' ? 0 : asNum(b);
            return n.op === '<' ? x < y : n.op === '<=' ? x <= y : n.op === '>' ? x > y : x >= y;
          }
        }
      }
    }
  };
  /** A formula worked out for a row. */
  const calcFormula = (s: DbState, row: DbRow, src: string, depth = 0): { value: Val; error?: string } => {
    if (!src.trim()) return { value: null };
    try {
      const v = evaluate(compile(src, new Set(s.cols.map((c) => c.name))), s, row, depth);
      return { value: typeof v === 'number' && !Number.isFinite(v) ? null : v };
    } catch (e) {
      return { value: null, error: String((e as Error)?.message ?? e) };
    }
  };
  /** A row's value of a column, worked out where it is computed. */
  const value = (s: DbState, row: DbRow, col: DbCol): unknown => {
    if (col.kind === 'formula') {
      const v = calcFormula(s, row, col.formula ?? '').value;
      return v === '' ? null : v;
    }
    if (col.kind === 'created') return row.created;
    if (col.kind === 'edited') return row.edited ?? row.created;
    return row.cells[col.id];
  };
  const cellText = (s: DbState, row: DbRow, col: DbCol): string => text(col, value(s, row, col));

  // ---- sorting and filtering ----------------------------------------------------------------------------------------
  const rankOf = (v: unknown): number | string | null => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.getTime();
    return valueWords(v).toLowerCase();
  };
  const rank = (s: DbState, row: DbRow, col: DbCol): number | string | null => {
    const v = value(s, row, col);
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return null;
    if (col.kind === 'number' || col.kind === 'created' || col.kind === 'edited') return typeof v === 'number' ? v : null;
    if (col.kind === 'check') return v ? 1 : 0;
    if (col.kind === 'select') return col.options?.findIndex((o) => o.id === v) ?? null;
    if (col.kind === 'multi') return col.options?.findIndex((o) => o.id === (v as string[])[0]) ?? null;
    if (col.kind === 'formula') return rankOf(v);
    if (col.kind === 'files') return text(col, v).toLowerCase();
    return String(v).toLowerCase();
  };
  const sorted = (s: DbState, rows: DbRow[]) => {
    const col = s.sort ? s.cols.find((c) => c.id === s.sort!.col) : null;
    if (!col) return rows;
    const k = s.sort!.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = rank(s, a, col);
      const y = rank(s, b, col);
      // (empty ones last, either way)
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * k;
    });
  };
  const dayOf = (v: unknown) => (typeof v === 'number' ? new Date(v - new Date(v).getTimezoneOffset() * 6e4).toISOString().slice(0, 10) : String(v ?? ''));
  const passes = (s: DbState, r: DbRow) =>
    s.filters.every((f) => {
      const col = s.cols.find((c) => c.id === f.col);
      if (!col) return true;
      const v = value(s, r, col);
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      const words = text(col, v).toLowerCase();
      const want = f.value === undefined ? '' : String(f.value);
      // A condition still without its value lets every row through (as it is being written).
      if (want === '' && !['empty', 'filled', 'checked', 'unchecked'].includes(f.op)) return true;
      const num = typeof v === 'number' ? v : col.kind === 'formula' ? asNum(v as Val) : NaN;
      switch (f.op) {
        case 'empty':
          return empty;
        case 'filled':
          return !empty;
        case 'contains':
          return words.includes(want.toLowerCase());
        case 'notContains':
          return !words.includes(want.toLowerCase());
        case 'eq':
          return want !== '' && num === Number(want);
        case 'ne':
          return want === '' || num !== Number(want);
        case 'gt':
          return want !== '' && Number.isFinite(num) && num > Number(want);
        case 'lt':
          return want !== '' && Number.isFinite(num) && num < Number(want);
        case 'is':
          return col.kind === 'created' || col.kind === 'edited' ? dayOf(v) === want : v === want;
        case 'isNot':
          return v !== want;
        case 'has':
          return Array.isArray(v) && v.includes(want);
        case 'hasNot':
          return !Array.isArray(v) || !v.includes(want);
        case 'before':
          return !empty && want !== '' && dayOf(v) < want;
        case 'after':
          return !empty && want !== '' && dayOf(v) > want;
        case 'checked':
          return v === true;
        case 'unchecked':
          return v !== true;
        default:
          return true;
      }
    });

  // ---- calculations (the table's footer) ---------------------------------------------------------------------------------
  const CALCS = ['count', 'values', 'empty', 'unique', 'pctEmpty', 'pctFilled', 'sum', 'avg', 'median', 'min', 'max', 'range', 'checked', 'unchecked', 'pctChecked', 'earliest', 'latest', 'span'];
  const calcsFor = (k: DbKind): string[] => {
    const base = ['count', 'values', 'empty', 'unique', 'pctEmpty', 'pctFilled'];
    if (k === 'number' || k === 'formula') return [...base, 'sum', 'avg', 'median', 'min', 'max', 'range'];
    if (k === 'check') return ['count', 'checked', 'unchecked', 'pctChecked'];
    if (k === 'date' || k === 'created' || k === 'edited') return [...base, 'earliest', 'latest', 'span'];
    return base;
  };
  const calculate = (s: DbState, rows: DbRow[], col: DbCol, how: string): string => {
    const vals = rows.map((r) => value(s, r, col));
    const filled = vals.filter((v) => !(v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)));
    const pct = (n: number) => (rows.length ? `${Math.round((n / rows.length) * 1000) / 10}%` : '0%');
    const nums = vals.map((v) => (typeof v === 'number' ? v : col.kind === 'formula' ? asNum(v as Val) : NaN)).filter((x) => Number.isFinite(x));
    const days = vals.map((v) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`).getTime() : v instanceof Date ? v.getTime() : NaN)).filter((x) => Number.isFinite(x));
    const timed = col.kind === 'created' || col.kind === 'edited';
    switch (how) {
      case 'count':
        return String(rows.length);
      case 'values':
        return String(filled.length);
      case 'empty':
        return String(rows.length - filled.length);
      case 'unique':
        return String(new Set(rows.map((r) => cellText(s, r, col)).filter(Boolean)).size);
      case 'pctEmpty':
        return pct(rows.length - filled.length);
      case 'pctFilled':
        return pct(filled.length);
      case 'sum':
        return numWords(nums.reduce((a, b) => a + b, 0));
      case 'avg':
        return nums.length ? numWords(nums.reduce((a, b) => a + b, 0) / nums.length) : '';
      case 'median': {
        const l = [...nums].sort((a, b) => a - b);
        return l.length ? numWords(l.length % 2 ? l[(l.length - 1) / 2] : (l[l.length / 2 - 1] + l[l.length / 2]) / 2) : '';
      }
      case 'min':
        return nums.length ? numWords(Math.min(...nums)) : '';
      case 'max':
        return nums.length ? numWords(Math.max(...nums)) : '';
      case 'range':
        return nums.length ? numWords(Math.max(...nums) - Math.min(...nums)) : '';
      case 'checked':
        return String(vals.filter((v) => v === true).length);
      case 'unchecked':
        return String(vals.filter((v) => v !== true).length);
      case 'pctChecked':
        return pct(vals.filter((v) => v === true).length);
      case 'earliest':
        return days.length ? dateText(Math.min(...days), timed) : '';
      case 'latest':
        return days.length ? dateText(Math.max(...days), timed) : '';
      case 'span':
        return days.length ? (WORDS.nDays as string).replace('{n}', String(Math.round((Math.max(...days) - Math.min(...days)) / 864e5))) : '';
      default:
        return '';
    }
  };

  // ---- CSV in and out ---------------------------------------------------------------------------------------------------
  const csvCell = (v: string) => (/[",\n\r;]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = (s: DbState, rows: DbRow[] = s.rows): string => {
    const out = [s.cols.map((c) => csvCell(c.name)).join(',')];
    for (const r of rows)
      out.push(
        s.cols
          .map((c) => {
            const v = value(s, r, c);
            if (c.kind === 'check') return v === true ? 'Yes' : 'No';
            if (c.kind === 'created' || c.kind === 'edited') return typeof v === 'number' ? new Date(v).toISOString() : '';
            if (c.kind === 'files') return csvCell(((v as DbFile[] | undefined) ?? []).map((f) => (f.src.startsWith('data:') ? f.name : f.src)).join(', '));
            if (c.kind === 'formula') return csvCell(v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v) : valueWords(v));
            if (c.kind === 'number') return typeof v === 'number' ? String(v) : '';
            return csvCell(text(c, v));
          })
          .join(','),
      );
    return `${out.join('\r\n')}\r\n`;
  };
  /** A CSV file's rows (quotes, doubled quotes and line breaks in them; commas, semicolons or tabs between cells). */
  const csvRows = (t0: string): string[][] => {
    const t = t0.replace(/^﻿/, '');
    const first = t.split(/\r?\n/, 1)[0] ?? '';
    const count = (ch: string) => first.split(ch).length - 1;
    const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) {
        if (c === '"') {
          if (t[i + 1] === '"') {
            cell += '"';
            i++;
          } else q = false;
        } else cell += c;
      } else if (c === '"' && !cell) q = true;
      else if (c === sep) {
        row.push(cell);
        cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
      if (rows.length > MAX_ROWS + 1) break;
    }
    if (cell || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.some((x) => x.trim()));
  };
  /** The kind a new column from a CSV file takes, from its values. */
  const guessKind = (vals: string[]): DbKind => {
    const v = vals.map((x) => x.trim()).filter(Boolean);
    if (!v.length) return 'text';
    if (v.every((x) => /^-?[\d\s]*[.,]?\d+$/.test(x))) return 'number';
    if (v.every((x) => /^(yes|no|true|false|✓|x|)$/i.test(x))) return 'check';
    if (v.every((x) => /^\d{4}-\d{2}-\d{2}/.test(x) || /^[A-Z][a-z]+ \d{1,2}, \d{4}/.test(x))) return 'date';
    if (v.every((x) => /^https?:\/\//i.test(x))) return 'link';
    if (v.every((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x))) return 'email';
    const distinct = new Set(v.map((x) => x.toLowerCase()));
    if (v.length >= 4 && distinct.size <= Math.max(2, Math.min(12, v.length / 2)) && v.every((x) => x.length <= 40)) return v.some((x) => x.includes(',')) ? 'multi' : 'select';
    return 'text';
  };
  const fromCsv = (s0: DbState, t: string): { state: DbState; added: number; newCols: number } => {
    const rows = csvRows(t);
    const head = rows.shift() ?? [];
    if (!head.length || !rows.length) return { state: s0, added: 0, newCols: 0 };
    let s = normalize(JSON.parse(JSON.stringify(s0)));
    // A database left as it starts (empty rows, its first columns unused) takes the file's columns instead of keeping its own.
    const blank = s.rows.every((r) => !Object.keys(r.cells).length && !r.page);
    if (blank) s.rows = [];
    let newCols = 0;
    const cols = [...s.cols];
    const at: (DbCol | null)[] = head.map((h, i) => {
      const name = str(h, 60).trim() || `${WORDS.newCol} ${i + 1}`;
      const found = cols.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (found) return computed(found.kind) ? null : found;
      if (cols.length >= MAX_COLS) return null;
      const kind = guessKind(rows.map((r) => r[i] ?? ''));
      const col: DbCol = { id: uid('c', new Set(cols.map((c) => c.id))), name, kind, ...(kind === 'select' || kind === 'multi' ? { options: [] } : {}) };
      cols.push(col);
      newCols++;
      return col;
    });
    // (a blank database's own first columns, unused by the file, go)
    if (blank) {
      const usedIds = new Set(at.filter(Boolean).map((c) => c!.id));
      const kept = cols.filter((c) => usedIds.has(c.id));
      if (kept.length) cols.splice(0, cols.length, ...kept);
    }
    s.cols = cols;
    const now = Date.now();
    let added = 0;
    for (const r of rows) {
      if (s.rows.length >= MAX_ROWS) break;
      const cells: Record<string, unknown> = {};
      at.forEach((col, i) => {
        if (!col) return;
        const v = col.kind === 'check' ? /^(yes|true|✓|x|1)$/i.test((r[i] ?? '').trim()) || undefined : r[i];
        const cell = cellOf(col, v);
        if (cell !== undefined) cells[col.id] = cell;
      });
      s.rows.push({ id: uid('r', new Set(s.rows.map((x) => x.id))), cells, created: now, edited: now });
      added++;
    }
    s = normalize(s);
    return { state: s, added, newCols };
  };

  // ---- Markdown, as the page editor's blocks ------------------------------------------------------------------------------
  const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SAFE_URL = /^(https?:\/\/|mailto:|\/pages\/[\w-]{1,40}$|#[\w-]{1,80}$)/i;
  /** A line's inline marks: `code`, [links](https://…), **bold**, *italic*, ~~struck~~; everything else words. */
  const inline = (t: string): string => {
    const parts = t.split(/(`[^`\n]+`)/);
    return parts
      .map((p, i) => {
        if (i % 2) return `<code>${escHtml(p.slice(1, -1))}</code>`;
        let h = escHtml(p);
        h = h.replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_m, alt: string) => alt);
        h = h.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, words: string, url: string) => {
          const u = url.replace(/&amp;/g, '&');
          return SAFE_URL.test(u) ? `<a href="${escHtml(u)}">${words}</a>` : words;
        });
        h = h.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_m, u: string) => `<a href="${u}">${u}</a>`);
        h = h.replace(/\*\*(?=\S)([^*]+?)\*\*/g, '<strong>$1</strong>').replace(/__(?=\S)([^_]+?)__/g, '<strong>$1</strong>');
        h = h.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?=\S)([^_\n]+?)_(?![_\w])/g, '$1<em>$2</em>');
        h = h.replace(/~~(?=\S)([^~]+?)~~/g, '<s>$1</s>');
        return h;
      })
      .join('');
  };
  const LANG_OK = /^[\w+#-]{1,20}$/;
  const md = (src: string): string => {
    const lines = String(src ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ')
      .split('\n');
    const out: string[] = [];
    let i = 0;
    const isTable = (l: string) => /^\s*\|.*\|\s*$/.test(l);
    const isRule = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(\[[ xX]\]\s+)?(.*)$/;
    const cellsOf = (l: string) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
    const special = (l: string) => /^\s*(#{1,6}\s|```|~~~|>|(-{3,}|\*{3,}|_{3,})\s*$)/.test(l) || ITEM.test(l) || isTable(l);
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) {
        i++;
        continue;
      }
      const fence = /^\s*(```|~~~)\s*([\w+#-]*)\s*$/.exec(l);
      if (fence) {
        const body: string[] = [];
        i++;
        while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++]);
        i++;
        const lang = LANG_OK.test(fence[2]) ? fence[2].toLowerCase() : '';
        out.push(`<pre class="n-code"${lang ? ` data-lang="${escHtml(lang)}"` : ''}>${escHtml(body.join('\n')) || '<br>'}</pre>`);
        continue;
      }
      const h = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
      if (h) {
        const n = Math.min(h[1].length, 6);
        out.push(`<h${n}>${inline(h[2])}</h${n}>`);
        i++;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
        out.push('<hr>');
        i++;
        continue;
      }
      if (isTable(l) && i + 1 < lines.length && isRule(lines[i + 1])) {
        const head = cellsOf(l);
        i += 2;
        const body: string[][] = [];
        while (i < lines.length && isTable(lines[i])) body.push(cellsOf(lines[i++]));
        out.push(`<div class="n-scroll"><table class="n-tbl"><thead><tr>${head.map((c) => `<th>${inline(c) || '<br>'}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${head.map((_c, k) => `<td>${inline(r[k] ?? '') || '<br>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (/^\s*>/.test(l)) {
        const body: string[] = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        // "> 💡 words": a callout, as the editor makes one.
        const icon = /^(\p{Extended_Pictographic}️?)\s+/u.exec(body[0] ?? '');
        if (icon) out.push(`<div class="n-callout"><span class="n-callout-icon">${escHtml(icon[1])}</span><div class="n-callout-text">${body.map((b, k) => inline(k ? b : b.slice(icon[0].length))).join('<br>')}</div></div>`);
        else out.push(`<blockquote>${body.map(inline).join('<br>')}</blockquote>`);
        continue;
      }
      if (ITEM.test(l)) {
        // Lists, nested by how far their items stand in.
        type Item = { depth: number; ordered: boolean; todo: boolean; checked: boolean; words: string };
        const items: Item[] = [];
        const base = /^(\s*)/.exec(l)![1].length;
        while (i < lines.length) {
          const m = ITEM.exec(lines[i]);
          if (!m) {
            // (a line that goes on from the item before)
            if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length && !special(lines[i])) {
              items[items.length - 1].words += ` ${lines[i].trim()}`;
              i++;
              continue;
            }
            break;
          }
          const ind = Math.max(0, m[1].length - base);
          items.push({ depth: Math.min(6, Math.floor(ind / 2)), ordered: /\d/.test(m[2]), todo: !!m[3], checked: /x/i.test(m[3] ?? ''), words: m[4] });
          i++;
        }
        const build = (from: number, depth: number): [string, number] => {
          let html = '';
          let k = from;
          let open: string | null = null;
          while (k < items.length && items[k].depth >= depth) {
            const it = items[k];
            if (it.depth > depth) {
              // (an item standing further in with no item before it at this level)
              const [sub, next] = build(k, it.depth);
              html += sub;
              k = next;
              continue;
            }
            const tag = it.todo ? 'ul class="n-todo"' : it.ordered ? 'ol' : 'ul';
            if (open !== tag) {
              if (open) html += open.startsWith('ol') ? '</ol>' : '</ul>';
              html += `<${tag}>`;
              open = tag;
            }
            k++;
            let sub = '';
            if (k < items.length && items[k].depth > depth) [sub, k] = build(k, items[k].depth);
            html += it.todo ? `<li><input type="checkbox"${it.checked ? ' checked' : ''}><span>${inline(it.words) || '<br>'}</span>${sub}</li>` : `<li>${inline(it.words) || '<br>'}${sub}</li>`;
          }
          if (open) html += open.startsWith('ol') ? '</ol>' : '</ul>';
          return [html, k];
        };
        out.push(build(0, 0)[0]);
        continue;
      }
      // A picture alone on its line.
      const pic = /^\s*!\[([^\]\n]*)\]\(((?:https:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)[^)\s]+)\)\s*$/.exec(l);
      if (pic) {
        out.push(`<img class="n-pic" src="${escHtml(pic[2])}" alt="${escHtml(pic[1])}">`);
        i++;
        continue;
      }
      // A paragraph: its lines up to a blank one or another block.
      const para: string[] = [l.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !special(lines[i])) para.push(lines[i++].trim());
      out.push(`<p>${para.map(inline).join(' ')}</p>`);
    }
    return out.join('');
  };
  /** Blocks (an element and what is in it, or a fragment) as Markdown, at most `max` characters. */
  const mdOf = (root: Node, max = 200_000): string => {
    const SKIP = /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|N-EDITOR-UI|SVG|BUTTON|SELECT|TEXTAREA)$/;
    const inl = (n: Node): string => {
      if (n.nodeType === 3) return (n as Text).data.replace(/​/g, '').replace(/\s+/g, ' ');
      if (n.nodeType !== 1) return '';
      const el = n as Element;
      if (SKIP.test(el.tagName) || el.hasAttribute('data-n-own')) return '';
      const kids = () => [...el.childNodes].map(inl).join('');
      switch (el.tagName) {
        case 'BR':
          return '\n';
        case 'STRONG':
        case 'B': {
          const k = kids();
          return k.trim() ? `**${k.trim()}**` : k;
        }
        case 'EM':
        case 'I': {
          const k = kids();
          return k.trim() ? `*${k.trim()}*` : k;
        }
        case 'S':
        case 'DEL':
        case 'STRIKE':
          return `~~${kids()}~~`;
        case 'CODE':
          return `\`${(el.textContent ?? '').replace(/`/g, "'")}\``;
        case 'A': {
          const href = el.getAttribute('href') ?? '';
          const k = kids();
          return href && !href.startsWith('javascript:') && k.trim() ? `[${k.trim()}](${href})` : k;
        }
        case 'IMG':
          return '';
        case 'INPUT':
          return '';
        case 'UL':
        case 'OL':
          return '';
        default:
          return kids();
      }
    };
    const out: string[] = [];
    let size = 0;
    const push = (s: string) => {
      if (size > max) return;
      out.push(s);
      size += s.length + 2;
    };
    const ownWords = (el: Element) =>
      [...el.childNodes]
        .filter((c) => !(c.nodeType === 1 && /^(UL|OL)$/.test((c as Element).tagName)))
        .map(inl)
        .join('')
        .trim();
    const list = (el: Element, depth: number, acc: string[]) => {
      let n = Number(el.getAttribute('start')) || 1;
      const todo = el.classList.contains('n-todo');
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue;
        const box = li.querySelector(':scope > input[type=checkbox]');
        const mark = todo || box ? `- [${box?.hasAttribute('checked') || (box as HTMLInputElement | null)?.checked ? 'x' : ' '}] ` : el.tagName === 'OL' ? `${n++}. ` : '- ';
        const held = li.classList.contains('n-block') ? li.firstElementChild : null;
        acc.push(`${'  '.repeat(depth)}${mark}${(held ? inl(held) : ownWords(li)).replace(/\n/g, ' ')}`);
        for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') list(sub, depth + 1, acc);
      }
      return acc;
    };
    const block = (el: Element) => {
      if (SKIP.test(el.tagName) || el.hasAttribute('data-n-own')) return;
      const t = el.tagName;
      if (/^H[1-6]$/.test(t)) return push(`${'#'.repeat(Number(t[1]))} ${inl(el).trim()}`);
      if (t === 'P') {
        const w = inl(el).trim();
        if (w) push(w);
        return;
      }
      if (t === 'UL' || t === 'OL') return push(list(el, 0, []).join('\n'));
      if (t === 'BLOCKQUOTE') return push(inl(el).trim().split('\n').map((x) => `> ${x}`).join('\n'));
      if (t === 'PRE') {
        const lang = el.getAttribute('data-lang') ?? (/language-([\w+#-]+)/.exec(el.querySelector('code')?.className ?? '')?.[1] ?? '');
        return push(`\`\`\`${lang}\n${(el.textContent ?? '').replace(/\n$/, '')}\n\`\`\``);
      }
      if (t === 'HR') return push('---');
      if (t === 'TABLE') {
        const rows = [...el.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inl(c).trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')));
        if (!rows.length) return;
        const w = Math.max(...rows.map((r) => r.length));
        const fill = (r: string[]) => `| ${[...r, ...Array(w - r.length).fill('')].join(' | ')} |`;
        return push([fill(rows[0]), `|${' --- |'.repeat(w)}`, ...rows.slice(1).map(fill)].join('\n'));
      }
      if (t === 'IMG') {
        const alt = el.getAttribute('alt') ?? '';
        const src = el.getAttribute('src') ?? '';
        return push(`![${alt}](${/^https:\/\//.test(src) ? src : ''})`);
      }
      if (el.classList.contains('n-callout')) {
        const icon = el.querySelector(':scope > .n-callout-icon')?.textContent?.trim() ?? '';
        const words = inl(el.querySelector(':scope > .n-callout-text') ?? el).trim();
        return push(`> ${icon ? `${icon} ` : ''}${words.replace(/\n/g, '\n> ')}`);
      }
      if (t === 'DETAILS') {
        const sum = el.querySelector(':scope > summary');
        if (sum) push(`**${inl(sum).trim()}**`);
        for (const c of el.children) if (c !== sum) block(c);
        return;
      }
      if (el.classList.contains('n-db')) return push(`(a database: ${el.getAttribute('data-title') ?? el.getAttribute('data-db') ?? ''})`);
      if (el.classList.contains('n-toc') || el.classList.contains('n-cover') || el.classList.contains('n-icon')) return;
      if (el.classList.contains('n-math')) return push(`$$${el.getAttribute('data-tex') ?? ''}$$`);
      // Anything else: its blocks, or its words.
      const kids = [...el.children];
      if (kids.length && kids.some((k) => !/^(SPAN|A|STRONG|EM|B|I|CODE|BR|S|MARK|SMALL|SUB|SUP|U|IMG)$/.test(k.tagName))) {
        for (const c of el.childNodes) {
          if (c.nodeType === 1) block(c as Element);
          else if (c.nodeType === 3 && (c as Text).data.trim()) push((c as Text).data.trim());
        }
      } else {
        const w = inl(el).trim();
        if (w) push(w);
      }
    };
    if (root.nodeType === 1 && /^(P|H[1-6]|LI|SUMMARY|TD|TH|SPAN|A|DIV)$/.test((root as Element).tagName) && !(root as Element).querySelector('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,table,blockquote,div')) {
      const w = (root as Element).tagName === 'LI' ? ownWords(root as Element) : inl(root).trim();
      return w.slice(0, max);
    }
    for (const c of root.childNodes) {
      if (c.nodeType === 1) block(c as Element);
      else if (c.nodeType === 3 && (c as Text).data.trim()) push((c as Text).data.trim());
    }
    return out
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max);
  };

  // ---- drawing it -------------------------------------------------------------------------------------------------------
  const ICON: Record<string, string> = {
    text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    number: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
    select: '<circle cx="12" cy="12" r="9"/><path d="m8.5 11 3.5 3.5 3.5-3.5"/>',
    multi: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    date: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    email: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    files: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    formula: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
    created: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    edited: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    ai: '<path d="m12 3-1.9 5.8L4 10.6l5.6 2.1L12 19l2-6.3 6-2.1-6-1.8z"/><path d="M5 3v4"/><path d="M3 5h4"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 4v16"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    gallery: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    list: '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
    timeline: '<path d="M3 6h10"/><path d="M8 12h11"/><path d="M5 18h9"/>',
    sort: '<path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    group: '<rect x="3" y="3" width="18" height="6" rx="1.5"/><rect x="3" y="13" width="18" height="8" rx="1.5"/>',
    more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    del: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
    out: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    open: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    tick: '<path d="M20 6 9 17l-5-5"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 15h.01"/><path d="M12 15h.01"/><path d="M16 15h.01"/><path d="M8 19h8"/>',
  };
  const NS = 'http://www.w3.org/2000/svg';
  const icon = (k: string, size = 14) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', String(size));
    s.setAttribute('height', String(size));
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    // (the icons' own drawings: constant, never from the page)
    s.innerHTML = ICON[k] ?? '';
    return s;
  };
  type Kid = Node | string | null | undefined | false;
  const h = (tag: string, attrs: Record<string, unknown> = {}, ...kids: Kid[]): HTMLElement => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else if (k === 'checked') (el as HTMLInputElement).checked = !!v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(k);
    return el;
  };
  /** Puts parts in, those there are (a part that does not apply is null). */
  const put = (el: Element, ...kids: (Node | null | undefined | false)[]) => el.append(...kids.filter((k): k is Node => !!k));
  const STYLE = `
:host{display:block}
.db{font:inherit;color:inherit;--ln:color-mix(in srgb,currentColor 14%,transparent);--soft:color-mix(in srgb,currentColor 5%,transparent);--mute:color-mix(in srgb,currentColor 58%,transparent);--hover:color-mix(in srgb,currentColor 8%,transparent)}
button{font:inherit;color:inherit}
.head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;margin:0 0 .5em}
.title{flex:1 1 160px;min-width:0;box-sizing:border-box;margin:0;padding:2px 4px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;font-size:1.15em;font-weight:650;outline:none}
.title:focus{background:var(--hover)}
.tabs,.tools{display:flex;flex-wrap:wrap;align-items:center;gap:2px}
.b{all:unset;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border-radius:7px;color:var(--mute);font-size:.86em;cursor:pointer;white-space:nowrap;box-sizing:border-box}
.b:hover,.b.on{background:var(--hover);color:inherit}
.b.on{font-weight:600}
.b.set{color:var(--n-accent,inherit)}
.b:disabled{cursor:default}
.b:disabled:hover{background:none;color:var(--mute)}
.b.ic{padding:0;width:26px;justify-content:center}
.b:focus-visible,.cell:focus-visible,.pill:focus-visible{outline:2px solid var(--n-accent,currentColor);outline-offset:-2px}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:.94em;table-layout:auto}
th,td{border-top:1px solid var(--ln);border-bottom:1px solid var(--ln);padding:0;vertical-align:middle;text-align:left}
th+th,td+td{border-left:1px solid var(--ln)}
th{font-weight:500;color:var(--mute)}
th .b{width:100%;height:32px;border-radius:0;padding:0 8px;justify-content:flex-start;font-size:.95em}
th.end,td.end{width:30px;border-left:0}
td.end .b{visibility:hidden;width:28px;padding:0;justify-content:center}
tr:hover td.end .b,td.end .b:focus-visible{visibility:visible}
@media (hover:none){td.end .b{visibility:visible}}
.cell{all:unset;box-sizing:border-box;display:block;width:100%;min-width:90px;min-height:34px;padding:6px 8px;color:inherit;cursor:text}
.cell[type=date]{min-width:130px}
.cell[type=date]:invalid:not(:focus){color:transparent}
.cell[type=date]::-webkit-calendar-picker-indicator{opacity:0;cursor:pointer}
.cell[type=date]:hover::-webkit-calendar-picker-indicator,.cell[type=date]:focus::-webkit-calendar-picker-indicator{opacity:.6}
td:first-child .cell{min-width:180px}
.cell[type=url],td.wide .cell{min-width:150px}
.cell:focus{background:var(--hover)}
.cell.ro{cursor:auto;white-space:pre-wrap;overflow-wrap:anywhere}
.cell.ro a{color:var(--n-accent,inherit)}
.cell.calc{color:var(--mute);min-width:110px}
.cell.err{color:var(--n-err,#d44c47)}
.check{display:flex;align-items:center;justify-content:center;min-height:34px;min-width:44px}
.check input{width:16px;height:16px;margin:0;accent-color:var(--n-accent,currentColor)}
.check.ro input{pointer-events:none}
.link{display:flex;align-items:center}
.link .b{flex:none;width:26px;padding:0;justify-content:center}
.ttl{position:relative;display:flex;align-items:center}
.ttl .cell{flex:1}
.ttl .opn{position:absolute;right:4px;top:50%;margin-top:-12px;height:24px;padding:0 6px;background:var(--pop);border:1px solid var(--ln);visibility:hidden;font-size:.78em}
tr:hover .ttl .opn,.ttl .opn:focus-visible{visibility:visible}
@media (hover:none){.ttl .opn{visibility:visible}}
.pills{all:unset;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;min-width:110px;min-height:34px;padding:5px 8px;cursor:pointer}
.pills:hover{background:var(--hover)}
.pills.ro{cursor:auto}
.pills.ro:hover{background:none}
.pill{display:inline-flex;align-items:center;max-width:100%;padding:1px 7px;border-radius:5px;font-size:.88em;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.files{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:120px;min-height:34px;padding:4px 8px;box-sizing:border-box}
.file{all:unset;display:inline-flex;align-items:center;gap:4px;max-width:180px;padding:1px 6px 1px 2px;border-radius:5px;background:var(--hover);font-size:.84em;line-height:1.6;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file img{width:18px;height:18px;border-radius:3px;object-fit:cover}
.ai{display:flex;align-items:center}
.ai .cell{flex:1}
.aib{flex:none;width:26px;padding:0;justify-content:center;color:var(--n-accent,inherit)}
.spin{display:inline-block;width:12px;height:12px;border:2px solid var(--ln);border-top-color:var(--n-accent,currentColor);border-radius:50%;animation:sp 1s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.foot{display:flex;align-items:center;gap:8px;padding:4px 0}
.count{color:var(--mute);font-size:.82em;margin-left:auto}
.note{color:var(--mute);font-size:.86em;padding:6px 2px}
.say{color:var(--mute);font-size:.84em;padding:4px 2px}
.err{color:var(--n-err,#d44c47);font-size:.84em;padding:4px 2px}
tfoot td{border-bottom:0}
tfoot .b{width:100%;border-radius:0;justify-content:flex-end;height:30px;font-size:.84em}
tfoot .b .cl{opacity:0}
tfoot tr:hover .b .cl,tfoot .b.set .cl{opacity:1}
.cv{color:inherit;font-weight:600}
.calc-ro{display:block;text-align:right;padding:6px 8px;font-size:.84em;color:var(--mute)}
tr.gh td{background:var(--soft);border-left:0}
.ghi{display:flex;align-items:center;gap:6px;min-height:32px;padding:0 4px;font-size:.88em}
.ghi .n{color:var(--mute)}
.vs{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 6px}
.lbl2{color:var(--mute);font-size:.84em}
.vs select,.fl select,.fl input{box-sizing:border-box;height:28px;max-width:170px;padding:0 6px;border:1px solid var(--ln);border-radius:6px;background:var(--pop);color:inherit;font:inherit;font-size:.86em}
.lanes{display:flex;gap:10px;align-items:flex-start;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
.lane{flex:0 0 250px;min-width:0;border-radius:10px;background:var(--soft);padding:6px}
.lane.drop{outline:2px solid var(--n-accent,currentColor);outline-offset:-2px}
.lh{display:flex;align-items:center;gap:6px;padding:2px 4px 6px;font-size:.86em;color:var(--mute)}
.card{position:relative;margin:0 0 6px;padding:8px 10px;border-radius:8px;background:var(--pop);border:1px solid var(--ln);box-shadow:0 1px 2px rgba(0,0,0,.06);cursor:grab;touch-action:pan-y}
.card.ghost{position:fixed;z-index:10;pointer-events:none;box-shadow:0 10px 28px rgba(0,0,0,.25);opacity:.95}
.card.away{opacity:.35}
.ct{font-weight:600;overflow-wrap:anywhere}
.cp{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;font-size:.88em;color:var(--mute)}
.fields{display:grid;grid-template-columns:minmax(70px,auto) 1fr;gap:2px 8px;align-items:center;margin-top:6px;cursor:default}
.fields .lbl{color:var(--mute);font-size:.84em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fields .check{justify-content:flex-start;min-width:0;padding-left:8px}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.gc{all:unset;display:flex;flex-direction:column;min-width:0;border-radius:10px;border:1px solid var(--ln);background:var(--pop);overflow:hidden;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.gc:hover{border-color:color-mix(in srgb,currentColor 28%,transparent)}
.gc:focus-visible{outline:2px solid var(--n-accent,currentColor)}
.gp{height:118px;background:var(--soft);display:grid;place-items:center;color:var(--mute)}
.gp img{width:100%;height:100%;object-fit:cover;display:block}
.gb{padding:8px 10px;display:flex;flex-direction:column;gap:4px;min-width:0}
.gt{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gv{font-size:.82em;color:var(--mute);display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.gv>span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gnew{display:grid;place-items:center;min-height:120px;border:1px dashed var(--ln);border-radius:10px;color:var(--mute);cursor:pointer;background:none;font:inherit}
.gnew:hover{background:var(--hover);color:inherit}
.li{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:4px 8px;border-bottom:1px solid var(--ln);cursor:pointer}
.li:hover{background:var(--hover)}
.li .lt{flex:1;min-width:0;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.li .lv{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;font-size:.82em;color:var(--mute);max-width:60%}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border-top:1px solid var(--ln);border-left:1px solid var(--ln)}
.cw{padding:4px 6px;font-size:.78em;color:var(--mute);border-right:1px solid var(--ln);border-bottom:1px solid var(--ln)}
.cd{position:relative;min-height:92px;padding:3px;border-right:1px solid var(--ln);border-bottom:1px solid var(--ln);box-sizing:border-box;min-width:0}
.cd.out{background:var(--soft)}
.cd.drop{outline:2px solid var(--n-accent,currentColor);outline-offset:-2px}
.cn{display:inline-grid;place-items:center;min-width:22px;height:22px;font-size:.8em;color:var(--mute);border-radius:11px}
.cd.today .cn{background:var(--n-accent,#c00);color:var(--n-accent-fg,#fff);font-weight:700}
.chip{all:unset;box-sizing:border-box;display:block;width:100%;margin:2px 0;padding:2px 6px;border-radius:5px;background:var(--pop);border:1px solid var(--ln);font-size:.8em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;touch-action:pan-y}
.chip.ghost{position:fixed;z-index:10;pointer-events:none;width:auto;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.cd .add{position:absolute;right:3px;top:3px;height:22px;width:22px;padding:0;justify-content:center;visibility:hidden}
.cd:hover .add{visibility:visible}
@media (hover:none){.cd .add{visibility:visible}}
.mo{font-weight:650;min-width:120px;text-align:center}
.tl{display:grid;grid-template-columns:minmax(110px,170px) 1fr;border:1px solid var(--ln);border-radius:8px;overflow:hidden}
.tln{border-right:1px solid var(--ln);min-width:0}
.tln>div,.tlr{height:34px;box-sizing:border-box;border-bottom:1px solid var(--ln)}
.tln>div{display:flex;align-items:center;padding:0 8px;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.tln>div:hover{background:var(--hover)}
.tln>.th,.tlh{height:40px;background:var(--soft);cursor:default}
.tlt{overflow-x:auto;-webkit-overflow-scrolling:touch;min-width:0}
.tli{position:relative}
.tlh{position:relative;border-bottom:1px solid var(--ln);box-sizing:border-box}
.tlm{position:absolute;top:3px;font-size:.74em;font-weight:600;white-space:nowrap;padding-left:4px}
.tld{position:absolute;bottom:3px;font-size:.68em;color:var(--mute);text-align:center}
.tlr{position:relative}
.tlg{position:absolute;top:0;bottom:0;border-left:1px solid var(--ln);opacity:.5}
.tlnow{position:absolute;top:0;bottom:0;border-left:2px solid var(--n-err,#d44c47);opacity:.7;pointer-events:none}
.bar{position:absolute;top:6px;height:22px;box-sizing:border-box;border-radius:6px;background:color-mix(in srgb,var(--n-accent,#337ea9) 30%,transparent);border:1px solid color-mix(in srgb,var(--n-accent,#337ea9) 60%,transparent);font-size:.78em;line-height:20px;padding:0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:grab;touch-action:pan-y}
.bar .rz{position:absolute;right:0;top:0;bottom:0;width:7px;cursor:ew-resize}
.pop{position:fixed;z-index:20;display:flex;flex-direction:column;box-sizing:border-box;min-width:220px;max-width:calc(100vw - 12px);padding:4px;border-radius:12px;background:var(--pop);border:1px solid var(--ln);box-shadow:0 10px 32px rgba(0,0,0,.22);font-size:.9em;overflow-y:auto}
.pop>*{flex:none}
.row{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;min-height:30px;padding:0 8px;border-radius:7px;cursor:pointer;white-space:nowrap}
.row:hover,.row:focus-visible{background:var(--hover)}
.row .ri{display:grid;place-items:center;width:18px;color:var(--mute);flex:none}
.row .rl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.row.danger{color:var(--n-err,#d44c47)}
.row.danger .ri{color:inherit}
.sep{height:1px;margin:4px 6px;background:var(--ln)}
.ph{padding:6px 8px 4px;color:var(--mute);font-size:.84em;font-weight:600}
.hint{padding:2px 8px 6px;color:var(--mute);font-size:.8em;white-space:normal;max-width:300px;line-height:1.35}
.in{all:unset;box-sizing:border-box;width:100%;height:30px;padding:0 8px;border-radius:7px;background:var(--hover);color:inherit}
textarea.in{height:auto;min-height:64px;padding:6px 8px;font-family:var(--n-mono,ui-monospace,monospace);font-size:.92em;white-space:pre-wrap}
.fl{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px 4px}
.opt{display:flex;align-items:center;gap:6px;padding:3px 4px}
.opt .in{height:28px}
.sw{display:flex;flex-wrap:wrap;gap:3px;padding:0 4px 4px 30px}
.sw button{all:unset;width:18px;height:18px;border-radius:5px;cursor:pointer;box-sizing:border-box;border:1px solid var(--ln)}
.sw button.on{outline:2px solid var(--n-accent,currentColor);outline-offset:1px}
.scrim{position:fixed;inset:0;z-index:14;background:rgba(0,0,0,.28)}
.peek{position:fixed;top:0;right:0;bottom:0;z-index:15;box-sizing:border-box;width:min(640px,100vw);padding:10px 18px 40px;background:var(--pop);border-left:1px solid var(--ln);box-shadow:-12px 0 40px rgba(0,0,0,.2);overflow-y:auto;overscroll-behavior:contain}
.pkb{display:flex;align-items:center;gap:2px;margin:0 -8px 8px}
.pkt{all:unset;box-sizing:border-box;display:block;width:100%;margin:6px 0 10px;font-size:1.7em;font-weight:700;line-height:1.2}
.pkp{display:grid;grid-template-columns:minmax(110px,32%) 1fr;gap:2px 8px;align-items:center}
.pkl{display:flex;align-items:center;gap:6px;min-height:34px;color:var(--mute);font-size:.88em;overflow:hidden;white-space:nowrap}
.pkp .check{justify-content:flex-start;padding-left:8px}
.pkx{height:1px;margin:14px 0;background:var(--ln)}
.pkd{min-height:160px;outline:none;line-height:1.6}
.pkd:empty::before{content:attr(data-ph);color:var(--mute);pointer-events:none}
.pkd h1{font-size:1.5em;margin:.6em 0 .2em}.pkd h2{font-size:1.25em;margin:.6em 0 .2em}.pkd h3{font-size:1.1em;margin:.6em 0 .2em}
.pkd p{margin:.25em 0}
.pkd blockquote{margin:.4em 0;padding:0 0 0 12px;border-left:3px solid currentColor}
.pkd pre{padding:8px 10px;border-radius:8px;background:var(--soft);white-space:pre-wrap}
.pkd ul.n-todo{list-style:none;padding-left:4px}
.pkd ul.n-todo li{display:flex;gap:8px;align-items:baseline}
.pkd table{width:auto}.pkd td,.pkd th{padding:4px 8px;border:1px solid var(--ln)}
.lb{position:fixed;inset:0;z-index:25;display:grid;place-items:center;background:rgba(0,0,0,.7)}
.lb img{max-width:92vw;max-height:88vh;border-radius:8px}
@media (pointer:coarse){.b{height:34px}.row{min-height:40px}.cell,.pills,.check{min-height:40px}.in{height:36px}.sw button{width:26px;height:26px}}
@media print{.tabs,.tools,.fl,.vs,.foot .b,th.end,td.end,.ttl .opn,.aib,.cd .add{display:none}.scroll,.lanes,.tlt{overflow:visible}.lanes{flex-wrap:wrap}.lane,.card,tr,.gc{break-inside:avoid}.db .cell,.db .pills{min-width:0}}
`;
  const mounted = new WeakSet<Element>();
  /** What each block drawn holds, once its keeper said. */
  const states = new WeakMap<Element, () => DbState>();
  const pillStyle = (color: string) => `background:color-mix(in srgb,${HEX[color] ?? HEX.default} 22%,transparent);color:color-mix(in srgb,${HEX[color] ?? HEX.default} 70%,currentColor)`;
  const isPic = (f: DbFile) => /^image\//.test(f.type ?? '') || /^data:image\//.test(f.src) || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(f.name + ' ' + f.src.split('?')[0]);
  /** The day a date cell holds, as a Date at its midnight here. */
  const dayDate = (v: string) => new Date(`${v}T00:00:00`);
  const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const mount: PageDatabases['mount'] = (host, o) => {
    if (mounted.has(host) || !(host as HTMLElement).attachShadow) return;
    if (host.classList.contains('n-chart')) return chart(host, o);
    mounted.add(host);
    const labels = o.labels ?? {};
    const L = (k: string) => (typeof labels[k] === 'string' ? labels[k] : WORDS[k]);
    const store = o.store;
    let readOnly = !!o.readOnly || !store;
    /** Why its rows can't be changed here, when its keeper did not give them. */
    let note = '';
    const name = /^[\w-]{1,40}$/.test(host.getAttribute('data-db') ?? '') ? host.getAttribute('data-db')! : 'db';
    const key = `n-db:${name}`;
    let first: unknown = {};
    try {
      first = JSON.parse(host.getAttribute('data-schema') || '{}');
    } catch {}
    let state = normalize(first, host.getAttribute('data-title') ?? '');
    const root = (host as HTMLElement).attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    // Everything of its own is inside this wrapper (the page editor leaves the presses and keys there to it): what is drawn
    // again as it changes, and its menus, which stay open meanwhile.
    const body = h('div');
    const layer = h('div');
    const wrap = h('div', { class: 'db', 'data-db-ui': '' }, body, layer);
    root.append(style, wrap);
    // Its menus take the page's own background, light or dark, whatever the page looks like.
    const paintBg = () => {
      let c = '';
      for (let x: Element | null = host; x && !c; x = x.parentElement) {
        const b = getComputedStyle(x).backgroundColor;
        if (b && b !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(b)) c = b;
      }
      wrap.style.setProperty('--pop', c || '#fff');
    };
    paintBg();
    new MutationObserver(paintBg).observe(document.documentElement, { attributes: true, attributeFilter: ['data-n-theme', 'class', 'style'] });
    let error = '';
    /** What it says for a moment: rows brought in, cells filled by the AI. */
    let said = '';
    let pop: HTMLElement | null = null;
    let openCard: string | null = null;
    /** The row open as a page of its own. */
    let peek: string | null = null;
    /** The month the calendar shows (its first day). */
    let month = new Date();
    month = new Date(month.getFullYear(), month.getMonth(), 1);
    /** The cells the AI is filling now, and whether a run of them was stopped. */
    const filling = new Set<string>();
    let fillRun: { done: number; of: number; stop: boolean; cost: number } | null = null;
    let timer = 0;
    const save = () => {
      if (readOnly) return;
      clearTimeout(timer);
      timer = window.setTimeout(keep, 250);
    };
    /** What it holds, to its keeper (a moment after a change, so typing is kept as one; at once as the page goes away). */
    const keep = () => {
      timer = 0;
      if (JSON.stringify(state).length > 500_000) {
        error = L('full');
        return draw();
      }
      store!.set(key, state).then(
        () => {
          if (error) ((error = ''), draw());
        },
        (e: unknown) => {
          error = `${L('failed')}: ${String((e as Error)?.message ?? e)}`;
          draw();
        },
      );
    };
    addEventListener('pagehide', () => timer && (clearTimeout(timer), keep()));
    /** Charts of the page drawn from it follow it. */
    const tellCharts = () => dispatchEvent(new CustomEvent('n-db', { detail: { name, state } }));
    /** Changes that move rows or columns: kept, and drawn again (the cell written in keeps the caret). */
    const changed = () => {
      save();
      draw();
      drawPeek();
      tellCharts();
    };
    /** A row changed: when it last was. */
    const touch = (row: DbRow) => {
      row.edited = Date.now();
    };
    const colOf = (id: string | null | undefined) => state.cols.find((c) => c.id === id);
    /** A date for reading, as this device writes dates (12 Nov 2026). */
    const dateWords = (v: string) => {
      const d = dayDate(v);
      return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const kindWord = (k: DbKind) => L(`k${k[0].toUpperCase()}${k.slice(1)}`);
    const colourWord = (c: string) => L(c === 'default' ? 'cDefault' : `c${c[0].toUpperCase()}${c.slice(1)}`);
    const opWord = (op: string) => L(`op${op[0].toUpperCase()}${op.slice(1)}`) ?? op;
    const OP_SIGNS: Record<string, string> = { eq: '=', ne: '≠', gt: '>', lt: '<' };
    /** The column a row's title is in: the first text column (else the first). */
    const titleCol = () => state.cols.find((c) => c.kind === 'text') ?? state.cols[0];
    const titleOf = (r: DbRow) => cellText(state, r, titleCol()) || L('untitledRow');
    /** A value as it shows beside a title (on a card, a list's line): pills, a date, words. */
    const shownValue = (r: DbRow, c: DbCol): Node[] => {
      const v = value(state, r, c);
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return [];
      if (c.kind === 'select' || c.kind === 'multi') return pills(c, v);
      if (c.kind === 'date' && typeof v === 'string') return [h('span', {}, dateWords(v))];
      if (c.kind === 'check') return v === true ? [h('span', {}, `✓ ${c.name}`)] : [];
      if (c.kind === 'files') return [h('span', {}, `${(v as DbFile[]).length} · ${c.name}`)];
      return [h('span', {}, cellText(state, r, c))];
    };

    // ---- a menu of its own, beside what opened it -------------------------------------------------------------------
    const closePop = () => {
      pop?.remove();
      pop = null;
    };
    const openPop = (at: Element, fill: (p: HTMLElement) => void) => {
      closePop();
      const p = h('div', { class: 'pop', role: 'menu' });
      pop = p;
      layer.append(p);
      fill(p);
      const r = at.getBoundingClientRect();
      p.style.maxHeight = `${innerHeight - 12}px`;
      const w = p.offsetWidth;
      const ht = p.offsetHeight;
      const below = innerHeight - r.bottom - 10;
      const top = ht <= below ? r.bottom + 4 : r.top - ht - 4 >= 6 ? r.top - ht - 4 : Math.max(6, innerHeight - ht - 6);
      p.style.top = `${top}px`;
      p.style.left = `${Math.max(6, Math.min(r.left, innerWidth - w - 6))}px`;
      // (on a touch screen, not its field: that would bring up the keyboard for a menu that may only be tapped in)
      (p.querySelector(matchMedia('(pointer: coarse)').matches ? 'button' : 'input,textarea,button') as HTMLElement | null)?.focus({ preventScroll: true });
    };
    const refill = (fill: (p: HTMLElement) => void) => {
      if (!pop) return;
      pop.replaceChildren();
      fill(pop);
    };
    root.addEventListener('pointerdown', (e) => {
      if (pop && !e.composedPath().includes(pop)) closePop();
    });
    document.addEventListener('pointerdown', (e) => {
      if (pop && !e.composedPath().includes(host)) closePop();
    });
    root.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Escape' && pop) {
        e.stopPropagation();
        closePop();
      } else if (k === 'Escape' && peek) {
        e.stopPropagation();
        closePeek();
      }
    });
    const item = (ic: string, label: string, run: () => void, o2: { on?: boolean; danger?: boolean; more?: boolean } = {}) =>
      h(
        'button',
        { class: `row${o2.danger ? ' danger' : ''}`, type: 'button', role: 'menuitem', onclick: run },
        h('span', { class: 'ri' }, ic ? icon(ic) : null),
        h('span', { class: 'rl' }, label),
        o2.on ? icon('tick') : o2.more ? icon('right') : null,
      );

    // ---- files: a picture made small enough, or a file kept by the app --------------------------------------------------
    const asData = (f: Blob) =>
      new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => fail(new Error('The file could not be read'));
        r.readAsDataURL(f);
      });
    const smaller = async (f: File): Promise<string> => {
      const src = await asData(f);
      if (f.type === 'image/svg+xml' || f.type === 'image/gif') return src;
      const img = new Image();
      await new Promise<void>((ok, fail) => {
        img.onload = () => ok();
        img.onerror = () => fail(new Error('That picture could not be read'));
        img.src = src;
      });
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight, 1));
      if (k === 1 && src.length <= MAX_INLINE * 1.37) return src;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.82);
    };
    const addFiles = async (row: DbRow, col: DbCol, list: File[]) => {
      const now = (Array.isArray(row.cells[col.id]) ? (row.cells[col.id] as DbFile[]) : []).slice();
      for (const f of list.slice(0, 10)) {
        try {
          if (o.upload) {
            const up = await o.upload(f);
            now.push({ name: up.name || f.name, src: up.src, type: up.type ?? f.type, size: up.size ?? f.size });
            continue;
          }
          const src = /^image\//.test(f.type) ? await smaller(f) : f.size <= MAX_INLINE ? await asData(f) : '';
          if (!src || src.length > MAX_INLINE * 1.4) {
            error = L('tooBig').replace('{n}', `${Math.round(MAX_INLINE / 1000)} KB`);
            continue;
          }
          now.push({ name: f.name.slice(0, 120), src, type: /^image\//.test(f.type) ? 'image/jpeg' : f.type, size: f.size });
        } catch (e) {
          error = String((e as Error)?.message ?? e);
        }
      }
      if (now.length) row.cells[col.id] = filesOf(now);
      touch(row);
      changed();
    };
    const pickFiles = (row: DbRow, col: DbCol) => {
      const i = h('input', { type: 'file', multiple: true }) as HTMLInputElement;
      i.addEventListener('change', () => void addFiles(row, col, [...(i.files ?? [])]));
      i.click();
    };
    const openFile = (f: DbFile) => {
      if (f.src.startsWith('data:image/')) {
        const lb = h('div', { class: 'lb', onclick: () => lb.remove() }, h('img', { src: f.src, alt: f.name }));
        layer.append(lb);
        return;
      }
      if (f.src.startsWith('data:')) return o.download?.(f.name, f.type ?? 'application/octet-stream', f.src);
      window.open(f.src, '_blank', 'noopener');
    };
    const fileChips = (row: DbRow, col: DbCol): HTMLElement => {
      const list = Array.isArray(row.cells[col.id]) ? (row.cells[col.id] as DbFile[]) : [];
      const box = h('div', { class: 'files' });
      for (const f of list)
        box.append(
          h(
            'span',
            { class: 'file' },
            h('button', { class: 'file', type: 'button', title: f.name, onclick: () => openFile(f) }, isPic(f) ? h('img', { src: f.src, alt: '' }) : icon('files', 12), f.name),
            readOnly
              ? null
              : h(
                  'button',
                  {
                    class: 'b ic',
                    type: 'button',
                    title: L('remove'),
                    'aria-label': L('remove'),
                    onclick: () => {
                      const rest = list.filter((x) => x !== f);
                      if (rest.length) row.cells[col.id] = rest;
                      else delete row.cells[col.id];
                      touch(row);
                      changed();
                    },
                  },
                  icon('x', 11),
                ),
          ),
        );
      if (!readOnly) box.append(h('button', { class: 'b ic', type: 'button', title: L('addFile'), 'aria-label': L('addFile'), onclick: () => pickFiles(row, col) }, icon('plus', 13)));
      // Files dropped on the cell.
      if (!readOnly) {
        box.addEventListener('dragover', (e) => (e as DragEvent).dataTransfer?.types.includes('Files') && e.preventDefault());
        box.addEventListener('drop', (e) => {
          const files = [...((e as DragEvent).dataTransfer?.files ?? [])];
          if (!files.length) return;
          e.preventDefault();
          e.stopPropagation();
          void addFiles(row, col, files);
        });
      }
      return box;
    };

    // ---- an AI column's cells, filled by the helper model through the app ------------------------------------------------
    const aiAsk = (row: DbRow, col: DbCol) => {
      const cfg = col.ai ?? { how: 'summarize' as const };
      const cells = Object.fromEntries(
        state.cols
          .filter((c) => c !== col)
          .map((c) => [c.name, cellText(state, row, c)])
          .filter(([, v]) => v),
      );
      if (row.page) cells[L('rowPage').replace(/…$/, '')] = row.page.slice(0, 3000);
      return { how: cfg.how, prompt: cfg.prompt, lang: cfg.lang, options: cfg.options ? cfg.options.split(',').map((x) => x.trim()).filter(Boolean) : undefined, column: col.name, row: cells as Record<string, string> };
    };
    const fillOne = async (row: DbRow, col: DbCol): Promise<number> => {
      if (!o.ai || readOnly) return 0;
      const k = `${row.id}:${col.id}`;
      filling.add(k);
      draw();
      try {
        const r = await o.ai(aiAsk(row, col));
        const v = String(r.value ?? '').trim();
        if (v) row.cells[col.id] = v.slice(0, 4000);
        else delete row.cells[col.id];
        touch(row);
        save();
        return r.cost ?? 0;
      } finally {
        filling.delete(k);
        draw();
        drawPeek();
      }
    };
    const fillAll = async (col: DbCol, onlyEmpty: boolean) => {
      if (!o.ai || fillRun) return;
      const rows = shown().filter((r) => !onlyEmpty || !String(r.cells[col.id] ?? '').trim());
      fillRun = { done: 0, of: rows.length, stop: false, cost: 0 };
      said = '';
      error = '';
      draw();
      const queue = rows.slice();
      const worker = async () => {
        while (queue.length && fillRun && !fillRun.stop) {
          const r = queue.shift()!;
          try {
            fillRun.cost += await fillOne(r, col);
            fillRun.done++;
          } catch (e) {
            error = `${L('aiFailed')}: ${String((e as Error)?.message ?? e)}`;
            if (fillRun) fillRun.stop = true;
          }
          draw();
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      const ran = fillRun;
      fillRun = null;
      if (ran && ran.done) said = `${L('aiFilled').replace('{n}', String(ran.done))}${ran.cost > 0 ? ` · $${ran.cost < 0.01 ? ran.cost.toPrecision(2) : ran.cost.toFixed(2)}` : ''}`;
      changed();
    };

    // ---- a cell of a row, written in where it is ------------------------------------------------------------------------
    const pills = (col: DbCol, v: unknown) => {
      const ids = col.kind === 'multi' ? (Array.isArray(v) ? (v as string[]) : []) : v ? [v as string] : [];
      return ids.flatMap((id) => {
        const opt = col.options?.find((x) => x.id === id);
        return opt ? [h('span', { class: 'pill', style: pillStyle(opt.color) }, opt.name)] : [];
      });
    };
    const optionsMenu = (row: DbRow, col: DbCol, at: Element) => {
      const fill = (p: HTMLElement) => {
        const cur = row.cells[col.id];
        const q = h('input', { class: 'in', placeholder: L('newOption'), 'aria-label': L('newOption') }) as HTMLInputElement;
        q.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !q.value.trim()) return;
          e.preventDefault();
          const id = optionFor(col, q.value.trim());
          if (!id) return;
          if (col.kind === 'multi') row.cells[col.id] = [...new Set([...((cur as string[]) ?? []), id])];
          else row.cells[col.id] = id;
          touch(row);
          changed();
          if (col.kind === 'multi') refill(fill);
          else closePop();
        });
        p.append(q);
        for (const opt of col.options ?? []) {
          const on = col.kind === 'multi' ? Array.isArray(cur) && cur.includes(opt.id) : cur === opt.id;
          p.append(
            h(
              'button',
              {
                class: 'row',
                type: 'button',
                role: 'menuitemcheckbox',
                'aria-checked': on ? 'true' : 'false',
                onclick: () => {
                  if (col.kind === 'multi') {
                    const list = Array.isArray(cur) ? (cur as string[]) : [];
                    const next = on ? list.filter((x) => x !== opt.id) : [...list, opt.id];
                    if (next.length) row.cells[col.id] = next;
                    else delete row.cells[col.id];
                    touch(row);
                    changed();
                    refill(fill);
                  } else {
                    if (on) delete row.cells[col.id];
                    else row.cells[col.id] = opt.id;
                    touch(row);
                    closePop();
                    changed();
                  }
                },
              },
              h('span', { class: 'pill', style: pillStyle(opt.color) }, opt.name),
              h('span', { class: 'rl' }),
              on ? icon('tick') : null,
            ),
          );
        }
        if (cur !== undefined)
          p.append(
            h('div', { class: 'sep' }),
            item('x', L('clear'), () => {
              delete row.cells[col.id];
              touch(row);
              closePop();
              changed();
            }),
          );
      };
      openPop(at, fill);
    };
    /** Where a cell is, so a drawing again puts the caret back in it. */
    const cellKey = (row: DbRow, col: DbCol) => `${row.id}:${col.id}`;
    const hrefOf = (col: DbCol, v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : '';
      if (!s) return '';
      if (col.kind === 'email') return /^[^\s@]+@[^\s@]+$/.test(s) ? `mailto:${s}` : '';
      if (col.kind === 'phone') return /^[+\d][\d\s().-]{2,}$/.test(s) ? `tel:${s.replace(/[^\d+]/g, '')}` : '';
      return /^(https?:\/\/|mailto:)/i.test(s) ? s : '';
    };
    const cell = (row: DbRow, col: DbCol): HTMLElement => {
      const v = row.cells[col.id];
      const k = cellKey(row, col);
      if (col.kind === 'check')
        return h(
          readOnly ? 'span' : 'label',
          { class: `check${readOnly ? ' ro' : ''}` },
          h('input', {
            type: 'checkbox',
            checked: v === true,
            // (only to read, it keeps its colours: not greyed, as a disabled box is, but not to be pressed)
            tabindex: readOnly ? '-1' : undefined,
            'aria-disabled': readOnly ? 'true' : undefined,
            onclick: readOnly ? (e: Event) => e.preventDefault() : undefined,
            'data-k': k,
            onchange: (e: Event) => {
              if ((e.target as HTMLInputElement).checked) row.cells[col.id] = true;
              else delete row.cells[col.id];
              touch(row);
              changed();
            },
          }),
        );
      // Worked out, never written in: a formula, when the row was made or last changed.
      if (computed(col.kind)) {
        const err = col.kind === 'formula' ? calcFormula(state, row, col.formula ?? '').error : undefined;
        return h('div', { class: `cell ro${err ? ' err' : ''}`, title: err ?? undefined }, err ? '⚠' : cellText(state, row, col));
      }
      if (col.kind === 'files') return fileChips(row, col);
      // Only to read (a page saved as a file, a PDF, a published copy): the words, which wrap, and a link that opens.
      if (readOnly) {
        if (col.kind === 'select' || col.kind === 'multi') return h('div', { class: 'pills ro' }, ...pills(col, v));
        const words = col.kind === 'date' && typeof v === 'string' ? dateWords(v) : text(col, v);
        const href = col.kind === 'link' || col.kind === 'email' || col.kind === 'phone' ? hrefOf(col, v) : '';
        return h('div', { class: 'cell ro' }, href ? h('a', { href, target: '_blank', rel: 'noopener' }, words) : words);
      }
      if (col.kind === 'select' || col.kind === 'multi') return h('button', { class: 'pills', type: 'button', 'aria-label': col.name, 'data-k': k, onclick: (e: Event) => optionsMenu(row, col, e.currentTarget as Element) }, ...pills(col, v));
      const input = h('input', {
        class: 'cell',
        type: col.kind === 'date' ? 'date' : col.kind === 'link' ? 'url' : col.kind === 'email' ? 'email' : col.kind === 'phone' ? 'tel' : 'text',
        inputmode: col.kind === 'number' ? 'decimal' : undefined,
        // (an empty date shows nothing until it is written in, not the browser's mm/dd/yyyy)
        required: col.kind === 'date' ? true : undefined,
        value: v === undefined ? '' : String(v),
        readonly: readOnly,
        'aria-label': col.name,
        'data-k': k,
        spellcheck: col.kind === 'text' || col.kind === 'ai' ? undefined : 'false',
      }) as HTMLInputElement;
      // Words kept as they are typed; the rows sorted or filtered by them only once the cell is left.
      input.addEventListener('input', () => {
        const x = cellOf(col, input.value);
        if (x === undefined) delete row.cells[col.id];
        else row.cells[col.id] = x;
        touch(row);
        save();
      });
      input.addEventListener('change', () => {
        if (col.kind === 'number' && input.value.trim() && row.cells[col.id] === undefined) input.value = '';
        if (state.sort?.col === col.id || state.filters.some((f) => f.col === col.id) || state.groupBy === col.id || state.view !== 'table' || state.cols.some((c) => c.kind === 'formula' || c.kind === 'edited') || state.calc?.[col.id]) {
          draw();
          drawPeek();
        }
        tellCharts();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
      if (col.kind === 'ai') {
        const busy = filling.has(k);
        return h(
          'div',
          { class: 'ai' },
          input,
          o.ai
            ? h('button', { class: 'b aib', type: 'button', title: v ? L('aiAgain') : L('aiFillOne'), 'aria-label': L('aiFillOne'), disabled: busy || !!fillRun, onclick: () => void fillOne(row, col).catch((e) => ((error = `${L('aiFailed')}: ${String((e as Error)?.message ?? e)}`), draw())) }, busy ? h('span', { class: 'spin' }) : icon('ai', 13))
            : null,
        );
      }
      if (col.kind !== 'link' && col.kind !== 'email' && col.kind !== 'phone') return input;
      const href = hrefOf(col, v);
      return h('div', { class: 'link' }, input, href ? h('button', { class: 'b', type: 'button', title: L('open'), 'aria-label': L('open'), onclick: () => window.open(href, '_blank', 'noopener') }, icon('out', 13)) : null);
    };

    // ---- a column's menu: its name, kind, options, formula, AI; sorting, filtering, moving, deleting it ----------------------
    const colMenu = (col: DbCol, at: Element) => {
      const main = (p: HTMLElement) => {
        const name = h('input', { class: 'in', value: col.name, placeholder: L('colName'), 'aria-label': L('colName') }) as HTMLInputElement;
        name.addEventListener('change', () => {
          col.name = name.value.trim().slice(0, 60) || col.name;
          changed();
        });
        name.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), name.blur(), closePop()));
        const i = state.cols.indexOf(col);
        put(
          p,
          name,
          h('div', { class: 'sep' }),
          item(col.kind, `${L('kind')}: ${kindWord(col.kind)}`, () => refill(kinds), { more: true }),
          col.kind === 'select' || col.kind === 'multi' ? item('select', L('options'), () => refill(opts), { more: true }) : null,
          col.kind === 'formula' ? item('formula', L('formula'), () => refill(formula), { more: true }) : null,
          col.kind === 'ai' ? item('ai', L('aiHow'), () => refill(aiCfg), { more: true }) : null,
          col.kind === 'ai' && o.ai ? item('ai', L('aiFillAll'), () => (closePop(), void fillAll(col, false))) : null,
          col.kind === 'ai' && o.ai ? item('ai', L('aiFillEmpty'), () => (closePop(), void fillAll(col, true))) : null,
          h('div', { class: 'sep' }),
          item('up', L('sortAsc'), () => ((state.sort = { col: col.id, dir: 'asc' }), closePop(), changed())),
          item('down', L('sortDesc'), () => ((state.sort = { col: col.id, dir: 'desc' }), closePop(), changed())),
          item('filter', L('filterBy'), () => {
            state.filters.push({ col: col.id, op: OPS[col.kind][0] });
            changed();
            filterMenu(body.querySelector('[data-a=filter]') ?? at);
          }),
          i > 0 ? item('left', L('moveLeft'), () => (state.cols.splice(i - 1, 0, ...state.cols.splice(i, 1)), closePop(), changed())) : null,
          i < state.cols.length - 1 ? item('right', L('moveRight'), () => (state.cols.splice(i + 1, 0, ...state.cols.splice(i, 1)), closePop(), changed())) : null,
          state.cols.length > 1
            ? item(
                'del',
                L('delCol'),
                () => {
                  state.cols.splice(i, 1);
                  for (const r of state.rows) delete r.cells[col.id];
                  state = normalize(state);
                  closePop();
                  changed();
                },
                { danger: true },
              )
            : null,
        );
      };
      const kinds = (p: HTMLElement) => {
        p.append(
          item('left', L('kind'), () => refill(main)),
          h('div', { class: 'sep' }),
        );
        for (const k of KINDS)
          p.append(
            item(
              k,
              kindWord(k),
              () => {
                if (k !== col.kind)
                  state = change(state, {
                    cols: state.cols.map((c) => (c.id === col.id ? { ...c, kind: k, options: k === 'select' || k === 'multi' ? (c.options ?? []) : undefined, formula: k === 'formula' ? (c.formula ?? '') : undefined, ai: k === 'ai' ? (c.ai ?? { how: 'summarize' }) : undefined } : c)),
                  });
                closePop();
                changed();
                const now = colOf(col.id);
                // A formula or an AI column is set up right away.
                if (now && k !== col.kind && (k === 'formula' || k === 'ai')) {
                  const th = [...body.querySelectorAll('th .b')].find((b) => b.textContent === now.name);
                  if (th) colMenu(now, th);
                  if (th) refill(k === 'formula' ? formulaFor(now) : aiCfgFor(now));
                }
              },
              { on: k === col.kind },
            ),
          );
      };
      const formulaFor = (c: DbCol) => (p: HTMLElement) => {
        const ta = h('textarea', { class: 'in', rows: '3', placeholder: 'prop("Price") * prop("Count")', 'aria-label': L('formula'), spellcheck: 'false' }, c.formula ?? '') as HTMLTextAreaElement;
        const out = h('div', { class: 'hint' });
        const show = () => {
          const r0 = state.rows[0];
          const r = r0 ? calcFormula(state, r0, ta.value) : { value: null as Val, error: undefined as string | undefined };
          out.textContent = !ta.value.trim() ? L('formulaHelp') : r.error ? `⚠ ${r.error}` : `${L('result')}: ${valueWords(r.value) || '—'}`;
        };
        ta.addEventListener('input', show);
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.preventDefault(), done());
        });
        const done = () => {
          c.formula = ta.value.slice(0, 2000);
          closePop();
          changed();
        };
        p.append(item('left', L('formula'), () => refill(main)), h('div', { class: 'sep' }), h('div', { class: 'fl' }, ta), out, h('div', { class: 'fl' }, h('button', { class: 'b set', type: 'button', onclick: done }, icon('tick', 13), L('done'))));
        show();
      };
      const formula = formulaFor(col);
      const aiCfgFor = (c: DbCol) => (p: HTMLElement) => {
        const cfg = (c.ai ??= { how: 'summarize' });
        const fieldOf = (k: 'prompt' | 'lang' | 'options', ph: string) => {
          const x = h('input', { class: 'in', value: cfg[k] ?? '', placeholder: ph, 'aria-label': ph }) as HTMLInputElement;
          x.addEventListener('change', () => {
            const v = x.value.trim().slice(0, 600);
            if (v) cfg[k] = v;
            else delete cfg[k];
            changed();
          });
          return h('div', { class: 'fl' }, x);
        };
        p.append(item('left', L('aiHow'), () => refill(main)), h('div', { class: 'sep' }));
        for (const how of AI_HOWS as DbAiCfg['how'][])
          p.append(
            item(
              '',
              L(`ai${how[0].toUpperCase()}${how.slice(1)}`),
              () => {
                cfg.how = how;
                changed();
                refill(aiCfgFor(c));
              },
              { on: cfg.how === how },
            ),
          );
        if (cfg.how === 'extract' || cfg.how === 'custom' || cfg.how === 'translate') p.append(fieldOf('prompt', L('aiPrompt')));
        if (cfg.how === 'translate') p.append(fieldOf('lang', L('aiLang')));
        if (cfg.how === 'classify') p.append(fieldOf('options', L('aiOptions')));
        p.append(h('div', { class: 'hint' }, o.ai ? L('aiCost') : `${L('aiCost')} ${L('aiInEdit')}`));
        if (o.ai) p.append(h('div', { class: 'sep' }), item('ai', L('aiFillAll'), () => (closePop(), void fillAll(c, false))), item('ai', L('aiFillEmpty'), () => (closePop(), void fillAll(c, true))));
      };
      const aiCfg = aiCfgFor(col);
      const opts = (p: HTMLElement) => {
        const c = colOf(col.id);
        if (!c) return closePop();
        p.append(
          item('left', L('options'), () => refill(main)),
          h('div', { class: 'sep' }),
        );
        for (const opt of c.options ?? []) {
          const name = h('input', { class: 'in', value: opt.name, 'aria-label': L('options') }) as HTMLInputElement;
          name.addEventListener('change', () => {
            const n = name.value.trim().slice(0, 60);
            if (n && !(c.options ?? []).some((x) => x !== opt && x.name.toLowerCase() === n.toLowerCase())) opt.name = n;
            changed();
          });
          p.append(
            h(
              'div',
              { class: 'opt' },
              h('span', { class: 'pill', style: pillStyle(opt.color) }, ' '),
              name,
              h(
                'button',
                {
                  class: 'b',
                  type: 'button',
                  title: L('remove'),
                  'aria-label': L('remove'),
                  onclick: () => {
                    c.options = (c.options ?? []).filter((x) => x !== opt);
                    for (const r of state.rows) {
                      const v = r.cells[c.id];
                      if (v === opt.id) delete r.cells[c.id];
                      else if (Array.isArray(v)) r.cells[c.id] = v.filter((x) => x !== opt.id);
                    }
                    state = normalize(state);
                    changed();
                    refill(opts);
                  },
                },
                icon('x', 13),
              ),
            ),
            h(
              'div',
              { class: 'sw' },
              ...COLORS.map((cl) =>
                h('button', {
                  type: 'button',
                  class: cl === opt.color ? 'on' : '',
                  title: colourWord(cl),
                  'aria-label': colourWord(cl),
                  style: `background:${HEX[cl]}`,
                  onclick: () => {
                    opt.color = cl;
                    changed();
                    refill(opts);
                  },
                }),
              ),
            ),
          );
        }
        const add = h('input', { class: 'in', placeholder: L('addOption'), 'aria-label': L('addOption') }) as HTMLInputElement;
        add.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !add.value.trim()) return;
          e.preventDefault();
          optionFor(c, add.value.trim());
          changed();
          refill(opts);
          (pop?.querySelector('input:last-of-type') as HTMLInputElement | null)?.focus();
        });
        p.append(h('div', { class: 'opt' }, icon('plus'), add));
      };
      openPop(at, main);
    };
    const addColumn = () => {
      const used = new Set(state.cols.map((c) => c.id));
      state.cols.push({ id: uid('c', used), name: `${L('newCol')} ${state.cols.length + 1}`, kind: 'text' });
      changed();
    };

    // ---- sorting, filtering, grouping, and more, from the bar over it ------------------------------------------------------
    const sortMenu = (at: Element) =>
      openPop(at, (p) => {
        p.append(h('div', { class: 'ph' }, L('sort')));
        for (const c of state.cols) {
          const on = state.sort?.col === c.id;
          p.append(
            item(
              on && state.sort!.dir === 'desc' ? 'down' : 'up',
              c.name,
              () => {
                state.sort = on ? (state.sort!.dir === 'asc' ? { col: c.id, dir: 'desc' } : null) : { col: c.id, dir: 'asc' };
                closePop();
                changed();
              },
              { on },
            ),
          );
        }
        if (state.sort)
          p.append(
            h('div', { class: 'sep' }),
            item('x', L('noSort'), () => ((state.sort = null), closePop(), changed())),
          );
      });
    const filterMenu = (at: Element) => {
      const fill = (p: HTMLElement) => {
        p.append(h('div', { class: 'ph' }, L('filter')));
        state.filters.forEach((f, i) => {
          const col = colOf(f.col)!;
          const colSel = h('select', { 'aria-label': L('filter') }, ...state.cols.map((c) => h('option', { value: c.id, selected: c.id === f.col ? true : undefined }, c.name))) as HTMLSelectElement;
          colSel.addEventListener('change', () => {
            const c2 = colOf(colSel.value)!;
            state.filters[i] = { col: c2.id, op: OPS[c2.kind][0] };
            changed();
            refill(fill);
          });
          const opSel = h('select', { 'aria-label': L('filter') }, ...OPS[col.kind].map((op) => h('option', { value: op, selected: op === f.op ? true : undefined }, OP_SIGNS[op] ?? opWord(op)))) as HTMLSelectElement;
          opSel.addEventListener('change', () => {
            f.op = opSel.value;
            changed();
            refill(fill);
          });
          let val: HTMLElement | null = null;
          const needs = !['empty', 'filled', 'checked', 'unchecked'].includes(f.op);
          if (needs && (col.kind === 'select' || col.kind === 'multi')) {
            val = h('select', { 'aria-label': L('filter') }, h('option', { value: '' }, '—'), ...(col.options ?? []).map((o2) => h('option', { value: o2.id, selected: o2.id === f.value ? true : undefined }, o2.name)));
            val.addEventListener('change', () => {
              f.value = (val as HTMLSelectElement).value || undefined;
              changed();
            });
          } else if (needs) {
            const dated = col.kind === 'date' || col.kind === 'created' || col.kind === 'edited';
            val = h('input', { type: dated ? 'date' : col.kind === 'number' || (col.kind === 'formula' && /^(eq|ne|gt|lt)$/.test(f.op)) ? 'number' : 'text', value: f.value === undefined ? '' : String(f.value), 'aria-label': L('filter') });
            val.addEventListener('input', () => {
              const x = (val as HTMLInputElement).value;
              f.value = x === '' ? undefined : x;
              save();
            });
            val.addEventListener('change', () => draw());
          }
          p.append(
            h(
              'div',
              { class: 'fl' },
              colSel,
              opSel,
              val,
              h(
                'button',
                {
                  class: 'b',
                  type: 'button',
                  title: L('remove'),
                  'aria-label': L('remove'),
                  onclick: () => {
                    state.filters.splice(i, 1);
                    changed();
                    refill(fill);
                  },
                },
                icon('x', 13),
              ),
            ),
          );
        });
        p.append(
          item('plus', L('addFilter'), () => {
            const c = state.cols[0];
            state.filters.push({ col: c.id, op: OPS[c.kind][0] });
            changed();
            refill(fill);
          }),
        );
      };
      openPop(at, fill);
    };
    const groupMenu = (at: Element) =>
      openPop(at, (p) => {
        p.append(h('div', { class: 'ph' }, L('groupBy')));
        p.append(item('x', L('noGroup'), () => ((state.groupBy = null), (state.folded = []), closePop(), changed()), { on: !state.groupBy }));
        for (const c of state.cols.filter((x) => x.kind !== 'files' && x.kind !== 'ai'))
          p.append(item(c.kind, c.name, () => ((state.groupBy = c.id), (state.folded = []), closePop(), changed()), { on: state.groupBy === c.id }));
      });
    const importCsv = () => {
      const i = h('input', { type: 'file', accept: '.csv,.tsv,text/csv,text/tab-separated-values,text/plain' }) as HTMLInputElement;
      i.addEventListener('change', () => {
        const f = i.files?.[0];
        if (!f) return;
        f.text().then(
          (t) => {
            const r = fromCsv(state, t);
            if (!r.added) {
              error = L('badCsv');
              return draw();
            }
            state = r.state;
            error = '';
            said = L('imported').replace('{n}', String(r.added)).replace('{file}', f.name);
            changed();
          },
          (e: unknown) => ((error = String((e as Error)?.message ?? e)), draw()),
        );
      });
      i.click();
    };
    const moreMenu = (at: Element) =>
      openPop(at, (p) => {
        if (!readOnly) p.append(item('upload', L('importCsv'), () => (closePop(), importCsv())));
        if (o.download) p.append(item('download', L('exportCsv'), () => (closePop(), o.download!(`${(state.title || L('untitled')).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'database'}.csv`, 'text/csv', csv(state, shown())))));
      });

    // ---- the rows shown: filtered, sorted ---------------------------------------------------------------------------------
    const shown = () =>
      sorted(
        state,
        state.rows.filter((r) => passes(state, r)),
      );
    const addRow = (cells: Record<string, unknown> = {}, focus = true) => {
      const now = Date.now();
      const row: DbRow = { id: uid('r', new Set(state.rows.map((r) => r.id))), cells, created: now, edited: now };
      if (state.rows.length >= MAX_ROWS) return;
      state.rows.push(row);
      changed();
      // The new row's first cell takes the caret.
      if (focus) (body.querySelector(`[data-k="${row.id}:${state.cols[0].id}"]`) as HTMLElement | null)?.focus();
      return row;
    };
    const removeRow = (row: DbRow) => {
      state.rows = state.rows.filter((r) => r !== row);
      if (openCard === row.id) openCard = null;
      if (peek === row.id) closePeek();
      changed();
    };

    // ---- the table: grouped, with a calculation under each column ---------------------------------------------------------
    /** Which group a row is in, by a column: its value as a key, and how the group is named. */
    const groupOf = (c: DbCol, r: DbRow): string => {
      const v = value(state, r, c);
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '';
      if (c.kind === 'select') return String(v);
      if (c.kind === 'multi') return String((v as string[])[0] ?? '');
      if (c.kind === 'check') return v === true ? 'yes' : '';
      if (c.kind === 'created' || c.kind === 'edited') return dayOf(v);
      if (c.kind === 'date') return String(v);
      return cellText(state, r, c);
    };
    const groupsOf = (c: DbCol, rows: DbRow[]): { key: string; label: Node[] }[] => {
      const keys = [...new Set(rows.map((r) => groupOf(c, r)))];
      if (c.kind === 'select' || c.kind === 'multi') {
        const order = (c.options ?? []).map((x) => x.id);
        keys.sort((a, b) => (a ? order.indexOf(a) : 1e9) - (b ? order.indexOf(b) : 1e9));
      } else keys.sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b, undefined, { numeric: true })));
      return keys.map((key) => ({
        key,
        label: !key
          ? [h('span', { class: 'n' }, c.kind === 'check' ? `✗ ${c.name}` : L('noValue'))]
          : c.kind === 'select' || c.kind === 'multi'
            ? pills(c, key)
            : c.kind === 'check'
              ? [h('span', {}, `✓ ${c.name}`)]
              : c.kind === 'date' || c.kind === 'created' || c.kind === 'edited'
                ? [h('span', {}, dateWords(key))]
                : [h('span', {}, key)],
      }));
    };
    /** A new row's value of the column the table is grouped by, for its group. */
    const inGroup = (c: DbCol, key: string): Record<string, unknown> => (!key || computed(c.kind) ? {} : { [c.id]: c.kind === 'check' ? true : c.kind === 'multi' ? [key] : key });
    const calcCell = (c: DbCol, rows: DbRow[]) => {
      const how = state.calc?.[c.id];
      const val = how ? calculate(state, rows, c, how) : '';
      const short = how ? L(`calc${how[0].toUpperCase()}${how.slice(1)}`) : '';
      if (readOnly) return h('td', {}, how ? h('span', { class: 'calc-ro' }, `${short} `, h('span', { class: 'cv' }, val)) : null);
      return h(
        'td',
        {},
        h(
          'button',
          { class: `b${how ? ' set' : ''}`, type: 'button', title: L('calculate'), onclick: (e: Event) => calcMenu(c, e.currentTarget as Element) },
          how ? h('span', { class: 'cl' }, short) : h('span', { class: 'cl' }, L('calculate')),
          how ? h('span', { class: 'cv' }, val) : null,
        ),
      );
    };
    const calcMenu = (c: DbCol, at: Element) =>
      openPop(at, (p) => {
        p.append(h('div', { class: 'ph' }, `${L('calculate')} · ${c.name}`));
        p.append(
          item(
            '',
            L('calcNone'),
            () => {
              if (state.calc) delete state.calc[c.id];
              closePop();
              changed();
            },
            { on: !state.calc?.[c.id] },
          ),
        );
        for (const how of calcsFor(c.kind))
          p.append(
            item(
              '',
              L(`calc${how[0].toUpperCase()}${how.slice(1)}`),
              () => {
                state.calc = { ...(state.calc ?? {}), [c.id]: how };
                closePop();
                changed();
              },
              { on: state.calc?.[c.id] === how },
            ),
          );
      });
    const rowEl = (r: DbRow) =>
      h(
        'tr',
        {},
        ...state.cols.map((c, i) =>
          h(
            'td',
            c.kind === 'text' ? { class: 'wide' } : {},
            i === 0 ? h('div', { class: 'ttl' }, cell(r, c), h('button', { class: 'b opn', type: 'button', title: L('openRow'), 'aria-label': L('openRow'), onclick: () => openPeek(r.id) }, icon('open', 12))) : cell(r, c),
          ),
        ),
        readOnly ? null : h('td', { class: 'end' }, h('button', { class: 'b', type: 'button', title: L('delRow'), 'aria-label': L('delRow'), onclick: () => removeRow(r) }, icon('x', 13))),
      );
    const table = () => {
      const rows = shown();
      const head = h(
        'tr',
        {},
        ...state.cols.map((c) =>
          h(
            'th',
            { scope: 'col' },
            h(
              'button',
              { class: 'b', type: 'button', disabled: readOnly, onclick: (e: Event) => colMenu(c, e.currentTarget as Element) },
              icon(c.kind, 13),
              h('span', {}, c.name),
              state.sort?.col === c.id ? icon(state.sort.dir === 'desc' ? 'down' : 'up', 12) : null,
            ),
          ),
        ),
        readOnly ? null : h('th', { class: 'end' }, h('button', { class: 'b', type: 'button', title: L('addCol'), 'aria-label': L('addCol'), onclick: addColumn }, icon('plus', 13))),
      );
      const n = state.cols.length + (readOnly ? 0 : 1);
      const gcol = colOf(state.groupBy);
      const bodies: HTMLElement[] = [];
      if (!gcol) bodies.push(h('tbody', {}, ...rows.map(rowEl)));
      else
        for (const g of groupsOf(gcol, rows)) {
          const mine = rows.filter((r) => groupOf(gcol, r) === g.key);
          const fkey = `${gcol.id}:${g.key}`;
          const folded = (state.folded ?? []).includes(fkey);
          bodies.push(
            h(
              'tbody',
              {},
              h(
                'tr',
                { class: 'gh' },
                h(
                  'td',
                  { colspan: String(n) },
                  h(
                    'div',
                    { class: 'ghi' },
                    h(
                      'button',
                      {
                        class: 'b ic',
                        type: 'button',
                        'aria-expanded': folded ? 'false' : 'true',
                        onclick: () => {
                          const f = new Set(state.folded ?? []);
                          if (f.has(fkey)) f.delete(fkey);
                          else f.add(fkey);
                          state.folded = [...f];
                          changed();
                        },
                      },
                      icon(folded ? 'right' : 'down', 13),
                    ),
                    ...g.label,
                    h('span', { class: 'n' }, String(mine.length)),
                    readOnly ? null : h('button', { class: 'b ic', type: 'button', title: L('newRow'), 'aria-label': L('newRow'), onclick: () => addRow(inGroup(gcol, g.key)) }, icon('plus', 13)),
                  ),
                ),
              ),
              ...(folded ? [] : mine.map(rowEl)),
            ),
          );
        }
      const calcs = state.cols.some((c) => state.calc?.[c.id]) || !readOnly ? h('tfoot', {}, h('tr', {}, ...state.cols.map((c) => calcCell(c, rows)), readOnly ? null : h('td', { class: 'end' }))) : null;
      return h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, head), ...bodies, calcs));
    };

    // ---- the board: a lane for each option of its select column, cards dragged between them ----------------------------
    const board = () => {
      const groupCol = colOf(state.group) ?? state.cols.find((c) => c.kind === 'select');
      if (!groupCol)
        return h(
          'div',
          { class: 'note' },
          L('needSelect'),
          ' ',
          readOnly
            ? null
            : h(
                'button',
                {
                  class: 'b set',
                  type: 'button',
                  onclick: () => {
                    const used = new Set(state.cols.map((c) => c.id));
                    const id = uid('c', used);
                    state.cols.push({ id, name: L('status'), kind: 'select', options: [] });
                    state.group = id;
                    changed();
                  },
                },
                icon('plus', 13),
                L('addSelect'),
              ),
        );
      const title = titleCol();
      const rows = shown();
      const lanes: { id: string | null; name: string; color: string }[] = [...(groupCol.options ?? []).map((x) => ({ id: x.id, name: x.name, color: x.color })), { id: null, name: L('noValue'), color: 'default' }].filter(
        // (the lane of cards without a value, to drop one in, when there is something to drop)
        (l) => l.id || !readOnly || rows.some((r) => r.cells[groupCol.id] === undefined),
      );
      const laneEls: { el: HTMLElement; id: string | null }[] = [];
      const card = (r: DbRow) => {
        const extra = state.cols.filter((c) => c !== title && c !== groupCol && cellText(state, r, c));
        const el = h(
          'div',
          { class: 'card', 'data-row': r.id, tabindex: '0' },
          h('div', { class: 'ct' }, cellText(state, r, title) || L('untitledRow')),
          extra.length && openCard !== r.id ? h('div', { class: 'cp' }, ...extra.flatMap((c) => shownValue(r, c))) : null,
          openCard === r.id
            ? h(
                'div',
                { class: 'fields' },
                ...state.cols.flatMap((c) => [h('span', { class: 'lbl' }, c.name), cell(r, c)]),
                h('span', {}),
                h('button', { class: 'b', type: 'button', onclick: () => openPeek(r.id) }, icon('open', 13), L('openRow')),
                readOnly ? null : h('span', {}),
                readOnly ? null : h('button', { class: 'b', type: 'button', onclick: () => removeRow(r) }, icon('del', 13), L('delRow')),
              )
            : null,
        );
        el.addEventListener('keydown', (e) => {
          if (e.target === el && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openCard = openCard === r.id ? null : r.id;
            draw();
          }
        });
        // A press and a move drags the card to another lane (and among its cards); a press alone opens it.
        el.addEventListener('pointerdown', (e) => {
          const pe = e as PointerEvent;
          if (pe.button !== 0 || (e.composedPath()[0] as Element).closest?.('input,button,select,label,.fields')) return;
          const x0 = pe.clientX;
          const y0 = pe.clientY;
          const r0 = el.getBoundingClientRect();
          let ghost: HTMLElement | null = null;
          let over: { lane: string | null; before: string | null } | null = null;
          const move = (m: PointerEvent) => {
            if (readOnly) return;
            if (!ghost) {
              if (Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
              ghost = el.cloneNode(true) as HTMLElement;
              ghost.classList.add('ghost');
              ghost.style.width = `${r0.width}px`;
              layer.append(ghost);
              el.classList.add('away');
            }
            ghost.style.left = `${m.clientX - (x0 - r0.left)}px`;
            ghost.style.top = `${m.clientY - (y0 - r0.top)}px`;
            over = null;
            for (const l of laneEls) {
              const b = l.el.getBoundingClientRect();
              const on = m.clientX >= b.left && m.clientX <= b.right;
              l.el.classList.toggle('drop', on);
              if (!on) continue;
              const cards = [...l.el.querySelectorAll<HTMLElement>('.card:not(.ghost)')].filter((c) => c !== el);
              const next = cards.find((c) => m.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
              over = { lane: l.id, before: next?.dataset.row ?? null };
            }
          };
          const up = () => {
            removeEventListener('pointermove', move, true);
            removeEventListener('pointerup', up, true);
            removeEventListener('pointercancel', up, true);
            for (const l of laneEls) l.el.classList.remove('drop');
            ghost?.remove();
            el.classList.remove('away');
            if (!ghost) {
              openCard = openCard === r.id ? null : r.id;
              return draw();
            }
            if (!over) return;
            if (over.lane) r.cells[groupCol.id] = over.lane;
            else delete r.cells[groupCol.id];
            touch(r);
            // Its place among the cards: before the one it was dropped on (the rows' own order, when no sort is set).
            const all = state.rows.filter((x) => x !== r);
            const at = over.before ? all.findIndex((x) => x.id === over!.before) : -1;
            all.splice(at < 0 ? all.length : at, 0, r);
            state.rows = all;
            changed();
          };
          addEventListener('pointermove', move, true);
          addEventListener('pointerup', up, true);
          addEventListener('pointercancel', up, true);
        });
        return el;
      };
      const groupSel = h('select', { 'aria-label': L('groupBy') }, ...state.cols.filter((c) => c.kind === 'select').map((c) => h('option', { value: c.id, selected: c.id === groupCol.id ? true : undefined }, c.name))) as HTMLSelectElement;
      groupSel.addEventListener('change', () => {
        state.group = groupSel.value;
        changed();
      });
      return h(
        'div',
        {},
        h('div', { class: 'fl' }, h('span', { class: 'note' }, L('groupBy')), groupSel),
        h(
          'div',
          { class: 'lanes' },
          ...lanes.map((lane) => {
            const mine = rows.filter((r) => (r.cells[groupCol.id] ?? null) === lane.id);
            const el = h(
              'div',
              { class: 'lane' },
              h('div', { class: 'lh' }, h('span', { class: 'pill', style: pillStyle(lane.color) }, lane.name), h('span', {}, String(mine.length))),
              ...mine.map(card),
              readOnly
                ? null
                : h(
                    'button',
                    {
                      class: 'b',
                      type: 'button',
                      onclick: () => {
                        // A new card opens, its title ready to type.
                        const r = addRow(lane.id ? { [groupCol.id]: lane.id } : {}, false);
                        if (!r) return;
                        openCard = r.id;
                        draw();
                        (body.querySelector(`[data-k="${r.id}:${title.id}"]`) as HTMLElement | null)?.focus();
                      },
                    },
                    icon('plus', 13),
                    L('newRow'),
                  ),
            );
            laneEls.push({ el, id: lane.id });
            return el;
          }),
        ),
      );
    };

    // ---- a gallery: a card for each row, with a picture -------------------------------------------------------------------
    const pictureOf = (r: DbRow): string => {
      const c = colOf(state.cover);
      if (!c) return '';
      const v = r.cells[c.id];
      if (c.kind === 'files') return (Array.isArray(v) ? (v as DbFile[]) : []).find(isPic)?.src ?? '';
      if (c.kind === 'link' && typeof v === 'string' && /^https:\/\/\S+\.(png|jpe?g|gif|webp|avif|svg)(\?\S*)?$/i.test(v)) return v;
      return '';
    };
    const others = (r: DbRow, n: number) =>
      state.cols
        .filter((c) => c !== titleCol() && c.kind !== 'files')
        .flatMap((c) => shownValue(r, c))
        .slice(0, n);
    const gallery = () => {
      const covers = state.cols.filter((c) => c.kind === 'files' || c.kind === 'link');
      const sel = h('select', { 'aria-label': L('picture') }, h('option', { value: '' }, L('none')), ...covers.map((c) => h('option', { value: c.id, selected: c.id === state.cover ? true : undefined }, c.name))) as HTMLSelectElement;
      sel.addEventListener('change', () => {
        state.cover = sel.value || null;
        changed();
      });
      const pics = !!colOf(state.cover);
      return h(
        'div',
        {},
        covers.length ? h('div', { class: 'vs' }, h('span', { class: 'lbl2' }, L('picture')), sel) : null,
        h(
          'div',
          { class: 'gal' },
          ...shown().map((r) => {
            const src = pictureOf(r);
            return h(
              'button',
              { class: 'gc', type: 'button', onclick: () => openPeek(r.id) },
              pics ? h('div', { class: 'gp' }, src ? h('img', { src, alt: '', loading: 'lazy' }) : icon('gallery', 22)) : null,
              h('div', { class: 'gb' }, h('div', { class: 'gt' }, titleOf(r)), h('div', { class: 'gv' }, ...others(r, 4))),
            );
          }),
          readOnly ? null : h('button', { class: 'gnew', type: 'button', onclick: () => { const r = addRow({}, false); if (r) openPeek(r.id); } }, icon('plus', 16), L('newRow')),
        ),
      );
    };

    // ---- a list: a line for each row ------------------------------------------------------------------------------------
    const list = () =>
      h(
        'div',
        {},
        ...shown().map((r) => h('button', { class: 'li', type: 'button', onclick: () => openPeek(r.id) }, h('span', { class: 'lt' }, titleOf(r)), h('span', { class: 'lv' }, ...others(r, 3)))),
        readOnly ? null : h('button', { class: 'b', type: 'button', onclick: () => { const r = addRow({}, false); if (r) openPeek(r.id); } }, icon('plus', 13), L('newRow')),
      );

    // ---- a calendar: the rows on their days, a month at a time ------------------------------------------------------------
    const dateCols = () => state.cols.filter((c) => c.kind === 'date');
    const needDate = (words: string) =>
      h(
        'div',
        { class: 'note' },
        words,
        ' ',
        readOnly
          ? null
          : h(
              'button',
              {
                class: 'b set',
                type: 'button',
                onclick: () => {
                  const id = uid('c', new Set(state.cols.map((c) => c.id)));
                  state.cols.push({ id, name: L('kDate'), kind: 'date' });
                  changed();
                },
              },
              icon('plus', 13),
              L('addDate'),
            ),
      );
    const colSelect = (cols: DbCol[], cur: string | null | undefined, label: string, set: (id: string) => void) => {
      const sel = h('select', { 'aria-label': label }, ...cols.map((c) => h('option', { value: c.id, selected: c.id === cur ? true : undefined }, c.name))) as HTMLSelectElement;
      sel.addEventListener('change', () => (set(sel.value), changed()));
      return sel;
    };
    /** A row's chip dragged to another day (or among the timeline's days): the day it lands on, from the pointer. */
    const dragChip = (e: PointerEvent, el: HTMLElement, r: DbRow, dayAt: (x: number, y: number) => string | null, onDrop: (day: string) => void) => {
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      let day: string | null = null;
      const move = (m: PointerEvent) => {
        if (readOnly) return;
        if (!ghost) {
          if (Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
          ghost = el.cloneNode(true) as HTMLElement;
          ghost.classList.add('ghost');
          layer.append(ghost);
        }
        ghost.style.left = `${m.clientX + 6}px`;
        ghost.style.top = `${m.clientY + 6}px`;
        day = dayAt(m.clientX, m.clientY);
        for (const c of body.querySelectorAll('.cd')) c.classList.toggle('drop', (c as HTMLElement).dataset.day === day);
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        removeEventListener('pointercancel', up, true);
        ghost?.remove();
        for (const c of body.querySelectorAll('.cd.drop')) c.classList.remove('drop');
        if (!ghost) return openPeek(r.id);
        if (day) onDrop(day);
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
      addEventListener('pointercancel', up, true);
    };
    const calendar = () => {
      const c = colOf(state.dateCol) ?? dateCols()[0];
      if (!c) return needDate(L('needDate'));
      const y = month.getFullYear();
      const m = month.getMonth();
      const start = new Date(y, m, 1 - ((new Date(y, m, 1).getDay() + 6) % 7));
      const days: Date[] = [];
      for (let d = new Date(start); days.length < 42; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
        days.push(d);
        if (days.length % 7 === 0 && d.getMonth() !== m && d > new Date(y, m, 1)) break;
      }
      const today = isoDay(new Date());
      const rows = shown();
      const byDay = new Map<string, DbRow[]>();
      for (const r of rows) {
        const v = r.cells[c.id];
        if (typeof v === 'string') byDay.set(v, [...(byDay.get(v) ?? []), r]);
      }
      let label = '';
      try {
        label = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      } catch {
        label = `${y}-${m + 1}`;
      }
      const wk = (i: number) => {
        try {
          return new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' });
        } catch {
          return String(i + 1);
        }
      };
      const go = (n: number) => {
        month = n ? new Date(y, m + n, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        draw();
      };
      const dayAt = (x: number, yy: number) => {
        for (const cd of body.querySelectorAll<HTMLElement>('.cd')) {
          const b = cd.getBoundingClientRect();
          if (x >= b.left && x <= b.right && yy >= b.top && yy <= b.bottom) return cd.dataset.day ?? null;
        }
        return null;
      };
      return h(
        'div',
        {},
        h(
          'div',
          { class: 'vs' },
          h('span', { class: 'lbl2' }, L('byDate')),
          colSelect(dateCols(), c.id, L('byDate'), (id) => (state.dateCol = id)),
          h('span', { style: 'flex:1' }),
          h('button', { class: 'b ic', type: 'button', title: L('prevMonth'), 'aria-label': L('prevMonth'), onclick: () => go(-1) }, icon('left', 14)),
          h('span', { class: 'mo' }, label),
          h('button', { class: 'b ic', type: 'button', title: L('nextMonth'), 'aria-label': L('nextMonth'), onclick: () => go(1) }, icon('right', 14)),
          h('button', { class: 'b', type: 'button', onclick: () => go(0) }, L('today')),
        ),
        h(
          'div',
          { class: 'cal' },
          ...[0, 1, 2, 3, 4, 5, 6].map((i) => h('div', { class: 'cw' }, wk(i))),
          ...days.map((d) => {
            const iso = isoDay(d);
            return h(
              'div',
              { class: `cd${d.getMonth() !== m ? ' out' : ''}${iso === today ? ' today' : ''}`, 'data-day': iso },
              h('span', { class: 'cn' }, String(d.getDate())),
              readOnly ? null : h('button', { class: 'b add', type: 'button', title: L('newRow'), 'aria-label': L('newRow'), onclick: () => { const r = addRow({ [c.id]: iso }, false); if (r) openPeek(r.id); } }, icon('plus', 12)),
              ...(byDay.get(iso) ?? []).map((r) => {
                const chip = h('button', { class: 'chip', type: 'button', title: titleOf(r) }, titleOf(r));
                chip.addEventListener('pointerdown', (e) => dragChip(e as PointerEvent, chip, r, dayAt, (day) => ((r.cells[c.id] = day), touch(r), changed())));
                chip.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPeek(r.id)));
                return chip;
              }),
            );
          }),
        ),
      );
    };

    // ---- a timeline: each row a bar from its start date to its end date ---------------------------------------------------
    const timeline = () => {
      const ds = dateCols();
      const sc = colOf(state.start) ?? ds[0];
      if (!sc) return needDate(L('needDates'));
      const ec = colOf(state.end) ?? ds[1] ?? sc;
      const rows = shown();
      const span = (r: DbRow): [Date, Date] | null => {
        const a = r.cells[sc.id];
        if (typeof a !== 'string') return null;
        const b = r.cells[ec.id];
        const s = dayDate(a);
        const e = typeof b === 'string' && b >= a ? dayDate(b) : s;
        return [s, e];
      };
      const dated = rows.filter((r) => span(r));
      const undated = rows.filter((r) => !span(r));
      const DAY = 26;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      let from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      let to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 28);
      for (const r of dated) {
        const [s, e] = span(r)!;
        if (s < from) from = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 3);
        if (e > to) to = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 7);
      }
      const n = Math.min(400, Math.round((to.getTime() - from.getTime()) / 864e5) + 1);
      const dayIndex = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - from.getTime()) / 864e5);
      const width = n * DAY;
      const head = h('div', { class: 'tlh', style: `width:${width}px` });
      for (let i = 0; i < n; i++) {
        const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
        if (d.getDate() === 1 || i === 0) {
          let mname = '';
          try {
            mname = d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
          } catch {
            mname = `${d.getFullYear()}-${d.getMonth() + 1}`;
          }
          head.append(h('span', { class: 'tlm', style: `left:${i * DAY}px` }, mname));
        }
        head.append(h('span', { class: 'tld', style: `left:${i * DAY}px;width:${DAY}px` }, String(d.getDate())));
      }
      const grid = (el: HTMLElement) => {
        for (let i = 0; i < n; i++) {
          const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
          if (d.getDay() === 1) el.append(h('span', { class: 'tlg', style: `left:${i * DAY}px` }));
        }
        const t = dayIndex(now);
        if (t >= 0 && t < n) el.append(h('span', { class: 'tlnow', style: `left:${t * DAY + DAY / 2}px` }));
        return el;
      };
      const lines = dated.map((r) => {
        const [s, e] = span(r)!;
        const a = dayIndex(s);
        const b = dayIndex(e);
        const bar = h('div', { class: 'bar', style: `left:${a * DAY + 2}px;width:${(b - a + 1) * DAY - 4}px`, title: titleOf(r), tabindex: '0', role: 'button' }, titleOf(r), readOnly || ec === sc ? null : h('span', { class: 'rz' }));
        bar.addEventListener('keydown', (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), openPeek(r.id)));
        bar.addEventListener('pointerdown', (ev) => {
          const pe = ev as PointerEvent;
          if (pe.button !== 0) return;
          const resize = !!(pe.composedPath()[0] as Element).closest?.('.rz');
          const x0 = pe.clientX;
          let moved = 0;
          const left0 = a * DAY + 2;
          const w0 = (b - a + 1) * DAY - 4;
          const move = (m: PointerEvent) => {
            if (readOnly) return;
            const dx = m.clientX - x0;
            if (!moved && Math.abs(dx) < 5) return;
            moved = Math.round(dx / DAY) || (moved ? moved : 0);
            if (resize) bar.style.width = `${Math.max(DAY - 4, w0 + dx)}px`;
            else bar.style.left = `${left0 + dx}px`;
          };
          const up = (m: PointerEvent) => {
            removeEventListener('pointermove', move, true);
            removeEventListener('pointerup', up, true);
            removeEventListener('pointercancel', up, true);
            const days = Math.round((m.clientX - x0) / DAY);
            if (Math.abs(m.clientX - x0) < 5) return openPeek(r.id);
            if (readOnly || !days) return draw();
            const shift = (d: Date, k: number) => isoDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + k));
            if (resize) r.cells[ec.id] = shift(e, Math.max(-(b - a), days));
            else {
              r.cells[sc.id] = shift(s, days);
              if (ec !== sc && typeof r.cells[ec.id] === 'string') r.cells[ec.id] = shift(e, days);
            }
            touch(r);
            changed();
          };
          addEventListener('pointermove', move, true);
          addEventListener('pointerup', up as EventListener, true);
          addEventListener('pointercancel', up as EventListener, true);
        });
        return grid(h('div', { class: 'tlr', style: `width:${width}px` }, bar));
      });
      const names = h('div', { class: 'tln' }, h('div', { class: 'th' }), ...dated.map((r) => h('div', { title: titleOf(r), onclick: () => openPeek(r.id) }, titleOf(r))));
      const track = h('div', { class: 'tlt' }, h('div', { class: 'tli', style: `width:${width}px` }, head, ...lines));
      // The timeline opens on today.
      requestAnimationFrame(() => {
        if (track.isConnected && !track.dataset.at) {
          track.dataset.at = '1';
          track.scrollLeft = Math.max(0, dayIndex(now) * DAY - 3 * DAY);
        }
      });
      return h(
        'div',
        {},
        h('div', { class: 'vs' }, h('span', { class: 'lbl2' }, L('from')), colSelect(ds, sc.id, L('from'), (id) => (state.start = id)), h('span', { class: 'lbl2' }, L('to')), colSelect(ds, ec.id, L('to'), (id) => (state.end = id))),
        dated.length ? h('div', { class: 'tl' }, names, track) : null,
        undated.length ? h('div', { class: 'say' }, `${L('noDates')}: `, ...undated.slice(0, 30).flatMap((r, i) => [i ? ', ' : '', h('button', { class: 'b', type: 'button', onclick: () => openPeek(r.id) }, titleOf(r))])) : null,
        readOnly ? null : h('button', { class: 'b', type: 'button', onclick: () => { const r = addRow({ [sc.id]: isoDay(now) }, false); if (r) openPeek(r.id); } }, icon('plus', 13), L('newRow')),
      );
    };

    // ---- a row's own page (Notion's side peek): its title, its columns, and blocks of its own --------------------------------
    let peekEl: HTMLElement | null = null;
    let peekProps: HTMLElement | null = null;
    let peekTitle: HTMLInputElement | null = null;
    let pageTimer = 0;
    const closePeek = () => {
      if (pageTimer) (clearTimeout(pageTimer), (pageTimer = 0), keepPage?.());
      peek = null;
      peekEl?.remove();
      layer.querySelector('.scrim')?.remove();
      peekEl = peekProps = peekTitle = null;
      keepPage = null;
    };
    let keepPage: (() => void) | null = null;
    const drawPeek = () => {
      const r = state.rows.find((x) => x.id === peek);
      if (!peek || !peekProps) return;
      if (!r) return closePeek();
      const t = titleCol();
      if (peekTitle && root.activeElement !== peekTitle) peekTitle.value = cellText(state, r, t);
      const focus = (root.activeElement as HTMLElement | null)?.dataset?.k;
      peekProps.replaceChildren(...state.cols.filter((c) => c !== t).flatMap((c) => [h('div', { class: 'pkl' }, icon(c.kind, 13), c.name), cell(r, c)]));
      if (focus) (peekProps.querySelector(`[data-k="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    };
    /** Markdown typed at a line's start in the row's page: "# ", "- ", "1. ", "[] ", "> " make that kind of block. */
    const pageMarks = (ed: HTMLElement, e: KeyboardEvent) => {
      const s = (root as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? getSelection();
      if (!s || !s.rangeCount || !s.isCollapsed) return false;
      const rg = s.getRangeAt(0);
      let blk: Node | null = rg.startContainer;
      while (blk && blk.parentNode !== ed && !(blk.nodeType === 1 && /^(LI|P|H[1-6]|BLOCKQUOTE|DIV)$/.test((blk as Element).tagName) && (blk as Element).parentElement === ed)) blk = blk.parentNode;
      if (!blk) return false;
      const pre = document.createRange();
      pre.selectNodeContents(blk);
      pre.setEnd(rg.startContainer, rg.startOffset);
      const typed = pre.toString();
      if (e.key !== ' ' || !/^(#{1,3}|[-*]|1\.|\[\]|>)$/.test(typed)) return false;
      e.preventDefault();
      pre.deleteContents();
      const cmd = typed.startsWith('#') ? ['formatBlock', `h${typed.length}`] : typed === '>' ? ['formatBlock', 'blockquote'] : typed === '1.' ? ['insertOrderedList', ''] : typed === '[]' ? ['todo', ''] : ['insertUnorderedList', ''];
      if (cmd[0] === 'todo') {
        const ul = h('ul', { class: 'n-todo' }, h('li', {}, h('input', { type: 'checkbox' }), h('span', {}, h('br'))));
        (blk as ChildNode).replaceWith(ul);
        const span = ul.querySelector('span')!;
        const c = document.createRange();
        c.setStart(span, 0);
        c.collapse(true);
        s.removeAllRanges();
        s.addRange(c);
      } else document.execCommand(cmd[0], false, cmd[1]);
      return true;
    };
    const openPeek = (id: string) => {
      const r = state.rows.find((x) => x.id === id);
      if (!r) return;
      closePop();
      if (peek) closePeek();
      peek = id;
      const t = titleCol();
      const all = shown();
      const i = all.findIndex((x) => x.id === id);
      const step = (k: number) => {
        const n2 = all[i + k];
        if (n2) openPeek(n2.id);
      };
      peekTitle = h('input', { class: 'pkt', value: cellText(state, r, t), placeholder: L('untitledRow'), 'aria-label': t.name, readonly: readOnly || computed(t.kind) || undefined }) as HTMLInputElement;
      peekTitle.addEventListener('input', () => {
        const x = cellOf(t, peekTitle!.value);
        if (x === undefined) delete r.cells[t.id];
        else r.cells[t.id] = x;
        touch(r);
        save();
      });
      peekTitle.addEventListener('change', () => draw());
      peekProps = h('div', { class: 'pkp' });
      const ed = h('div', { class: 'pkd', 'data-ph': readOnly ? '' : L('rowPage') });
      ed.innerHTML = md(r.page ?? '');
      if (!readOnly) {
        ed.setAttribute('contenteditable', 'true');
        keepPage = () => {
          const words = mdOf(ed, MAX_PAGE).trim();
          if (words) r.page = words;
          else delete r.page;
          touch(r);
          save();
        };
        ed.addEventListener('input', () => {
          clearTimeout(pageTimer);
          pageTimer = window.setTimeout(() => ((pageTimer = 0), keepPage?.()), 400);
        });
        ed.addEventListener('keydown', (e) => {
          if (pageMarks(ed, e as KeyboardEvent)) ed.dispatchEvent(new Event('input'));
        });
        ed.addEventListener('paste', (e) => {
          const t2 = (e as ClipboardEvent).clipboardData?.getData('text/plain') ?? '';
          e.preventDefault();
          document.execCommand('insertText', false, t2);
        });
        ed.addEventListener('change', (e) => {
          const x = e.target as HTMLInputElement;
          if (x.type === 'checkbox') x.toggleAttribute('checked', x.checked);
          ed.dispatchEvent(new Event('input'));
        });
      } else ed.addEventListener('click', (e) => (e.target as Element).closest?.('input') && e.preventDefault());
      const scrim = h('div', { class: 'scrim', onclick: closePeek });
      peekEl = h(
        'div',
        { class: 'peek', role: 'dialog', 'aria-label': titleOf(r) },
        h(
          'div',
          { class: 'pkb' },
          h('button', { class: 'b ic', type: 'button', title: L('prevRow'), 'aria-label': L('prevRow'), disabled: i <= 0, onclick: () => step(-1) }, icon('up', 14)),
          h('button', { class: 'b ic', type: 'button', title: L('nextRow'), 'aria-label': L('nextRow'), disabled: i < 0 || i >= all.length - 1, onclick: () => step(1) }, icon('down', 14)),
          h('span', { style: 'flex:1' }),
          readOnly ? null : h('button', { class: 'b ic', type: 'button', title: L('delRow'), 'aria-label': L('delRow'), onclick: () => removeRow(r) }, icon('del', 14)),
          h('button', { class: 'b ic', type: 'button', title: L('close'), 'aria-label': L('close'), onclick: closePeek }, icon('x', 15)),
        ),
        peekTitle,
        peekProps,
        h('div', { class: 'pkx' }),
        ed,
      );
      layer.append(scrim, peekEl);
      drawPeek();
      if (!readOnly && !cellText(state, r, t)) peekTitle.focus({ preventScroll: true });
    };

    // ---- the whole of it ------------------------------------------------------------------------------------------------
    const draw = () => {
      const focus = (root.activeElement as HTMLElement | null)?.dataset?.k;
      const n = state.rows.length;
      const m = shown().length;
      const count = m === n ? (n === 1 ? L('oneRow') : L('nRows').replace('{n}', String(n))) : L('nOfRows').replace('{n}', String(m)).replace('{m}', String(n));
      const title = (readOnly ? h('div', { class: 'title' }, state.title) : h('input', { class: 'title', value: state.title, placeholder: L('untitled'), 'aria-label': L('untitled') })) as HTMLInputElement;
      title.addEventListener('input', () => {
        state.title = title.value.slice(0, 120);
        save();
      });
      title.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), title.blur()));
      const view = (v: DbView) =>
        h(
          'button',
          {
            class: `b${state.view === v ? ' on' : ''}`,
            type: 'button',
            'aria-pressed': state.view === v ? 'true' : 'false',
            onclick: () => {
              state.view = v;
              openCard = null;
              changed();
            },
          },
          icon(v, 13),
          L(v),
        );
      const sortCol = colOf(state.sort?.col);
      const groupCol = colOf(state.groupBy);
      body.replaceChildren();
      const views: Record<DbView, () => HTMLElement> = { table, board, gallery, list, calendar, timeline };
      put(
        body,
        h(
          'div',
          { class: 'head' },
          title,
          h('div', { class: 'tabs' }, ...VIEWS.map(view)),
          h(
            'div',
            { class: 'tools' },
            h('button', { class: `b${sortCol ? ' set' : ''}`, type: 'button', 'data-a': 'sort', onclick: (e: Event) => sortMenu(e.currentTarget as Element) }, icon('sort', 13), sortCol ? `${L('sort')}: ${sortCol.name}` : L('sort')),
            h(
              'button',
              { class: `b${state.filters.length ? ' set' : ''}`, type: 'button', 'data-a': 'filter', onclick: (e: Event) => filterMenu(e.currentTarget as Element) },
              icon('filter', 13),
              state.filters.length ? `${L('filter')} · ${state.filters.length}` : L('filter'),
            ),
            state.view === 'table' ? h('button', { class: `b${groupCol ? ' set' : ''}`, type: 'button', 'data-a': 'group', onclick: (e: Event) => groupMenu(e.currentTarget as Element) }, icon('group', 13), groupCol ? `${L('group')}: ${groupCol.name}` : L('group')) : null,
            !readOnly || o.download ? h('button', { class: 'b ic', type: 'button', 'data-a': 'more', title: L('more'), 'aria-label': L('more'), onclick: (e: Event) => moreMenu(e.currentTarget as Element) }, icon('more', 15)) : null,
          ),
        ),
        views[state.view](),
        h('div', { class: 'foot' }, readOnly || state.view !== 'table' ? null : h('button', { class: 'b', type: 'button', onclick: () => addRow() }, icon('plus', 13), L('newRow')), h('span', { class: 'count' }, count)),
        fillRun ? h('div', { class: 'say' }, h('span', { class: 'spin' }), ' ', L('aiFilling').replace('{n}', String(fillRun.done + 1 > fillRun.of ? fillRun.of : fillRun.done + 1)).replace('{m}', String(fillRun.of)), ' ', h('button', { class: 'b', type: 'button', onclick: () => fillRun && (fillRun.stop = true) }, L('aiStop'))) : null,
        said && !fillRun ? h('div', { class: 'say' }, said) : null,
        note ? h('div', { class: 'note' }, note) : null,
        error ? h('div', { class: 'err', role: 'alert' }, error) : null,
      );
      if (focus) (body.querySelector(`[data-k="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    };
    // Drawn once its keeper says what it holds (a database new to the page starts as its block says): nothing shows rows
    // it is about to replace, or keeps a change made to them. A keeper that can't say leaves it as its block says, to read.
    if (!store) {
      states.set(host, () => state);
      draw();
    } else
      store.get(key).then(
        (v) => {
          if (v && typeof v === 'object') state = normalize(v, state.title);
          states.set(host, () => state);
          draw();
          tellCharts();
        },
        (e: unknown) => {
          readOnly = true;
          note = o.edit ? L('inUse') : `${L('unread')}: ${String((e as Error)?.message ?? e)}`;
          draw();
        },
      );
  };

  // ---- charts: a database's numbers (or a small table's) drawn as bars, lines, an area or a pie ------------------------------
  const CHART_TYPES = ['bar', 'line', 'area', 'pie'];
  const chartCfg = (v: unknown): ChartCfg => {
    const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
    const type = (CHART_TYPES.includes(String(o.type)) ? String(o.type) : 'bar') as ChartCfg['type'];
    const how = (['sum', 'avg', 'count', 'min', 'max'].includes(String(o.how)) ? String(o.how) : 'sum') as ChartCfg['how'];
    const cfg: ChartCfg = { type, how };
    const title = str(o.title, 120).trim();
    if (title) cfg.title = title;
    const db = str(o.db, 40);
    if (/^[\w-]{1,40}$/.test(db)) cfg.db = db;
    const x = str(o.x, 60).trim();
    if (x) cfg.x = x;
    const y = (Array.isArray(o.y) ? o.y : typeof o.y === 'string' ? [o.y] : []).map((c) => str(c, 60).trim()).filter(Boolean).slice(0, 6);
    if (y.length) cfg.y = y;
    if (!cfg.db && Array.isArray(o.rows))
      cfg.rows = o.rows.slice(0, 60).map((r) => (Array.isArray(r) ? r.slice(0, 8).map((c) => (typeof c === 'number' && Number.isFinite(c) ? c : str(c, 60))) : [])).filter((r) => r.length);
    return cfg;
  };
  /** What a chart shows: its labels, and a series of numbers for each. */
  const chartData = (cfg: ChartCfg, s: DbState | null): { labels: string[]; series: { name: string; values: number[] }[] } => {
    if (!cfg.db) {
      const rows = cfg.rows ?? [];
      const head = (rows[0] ?? []).map((c) => String(c));
      const body = rows.slice(1);
      const series = head.slice(1).map((name, k) => ({ name, values: body.map((r) => (typeof r[k + 1] === 'number' ? (r[k + 1] as number) : Number(String(r[k + 1] ?? '').replace(',', '.')) || 0)) }));
      return { labels: body.map((r) => String(r[0] ?? '')), series };
    }
    if (!s) return { labels: [], series: [] };
    const find = (n?: string) => (n ? s.cols.find((c) => c.name.toLowerCase() === n.toLowerCase() || c.id === n) : undefined);
    const xc = find(cfg.x) ?? s.cols.find((c) => c.kind === 'select') ?? s.cols[0];
    const ys = (cfg.y ?? []).map(find).filter((c): c is DbCol => !!c);
    const rows = s.rows.filter((r) => passes(s, r));
    const keyOf = (r: DbRow) => {
      const v = value(s, r, xc);
      if (xc.kind === 'multi') return text(xc, Array.isArray(v) ? (v as string[]).slice(0, 1) : v) || WORDS.noValue;
      if (xc.kind === 'date' && typeof v === 'string') return v;
      return cellText(s, r, xc) || WORDS.noValue;
    };
    let keys = [...new Set(rows.map(keyOf))];
    if (xc.kind === 'select' || xc.kind === 'multi') {
      const order = (xc.options ?? []).map((o) => o.name);
      keys.sort((a, b) => (order.includes(a) ? order.indexOf(a) : 1e9) - (order.includes(b) ? order.indexOf(b) : 1e9));
    } else if (xc.kind === 'date' || xc.kind === 'number') keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    keys = keys.slice(0, 40);
    const agg = (list: number[]) => {
      if (!list.length) return 0;
      if (cfg.how === 'avg') return list.reduce((a, b) => a + b, 0) / list.length;
      if (cfg.how === 'min') return Math.min(...list);
      if (cfg.how === 'max') return Math.max(...list);
      return list.reduce((a, b) => a + b, 0);
    };
    const series = (ys.length && cfg.how !== 'count' ? ys : [null]).map((yc) => ({
      name: yc ? yc.name : WORDS.chartCount,
      values: keys.map((k) => {
        const mine = rows.filter((r) => keyOf(r) === k);
        if (!yc) return mine.length;
        return agg(mine.map((r) => asNum((value(s, r, yc) ?? null) as Val)).filter((x) => Number.isFinite(x)));
      }),
    }));
    return { labels: keys.map((k) => (xc.kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(k) ? dateText(dayDate(k).getTime(), false) : k)), series };
  };
  const PALETTE = ['#4f7fd9', '#3aa3a0', '#e0913b', '#c4569c', '#7d6ad6', '#5aa05a'];
  /** A round step for an axis: 1, 2, 2.5 or 5 times a power of ten. */
  const niceStep = (span: number, n: number) => {
    const raw = span / Math.max(1, n);
    const p = 10 ** Math.floor(Math.log10(raw || 1));
    return ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
  };
  const drawChart = (cfg: ChartCfg, d: ReturnType<typeof chartData>, width: number, colours: string[]): string => {
    const W = Math.max(240, Math.round(width));
    const H = cfg.type === 'pie' ? 220 : 240;
    const t = escHtml;
    const col = (i: number) => colours[i % colours.length];
    if (!d.labels.length || !d.series.length) return '';
    if (cfg.type === 'pie') {
      const vals = d.series[0].values.map((v) => Math.max(0, v));
      const total = vals.reduce((a, b) => a + b, 0) || 1;
      const r = 86;
      const cx = 110;
      const cy = 110;
      let a0 = -Math.PI / 2;
      const arcs = vals.map((v, i) => {
        const a1 = a0 + (v / total) * Math.PI * 2;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (a: number, rr: number) => `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
        const path = v >= total ? `M${p(0, r)}A${r} ${r} 0 1 1 ${p(Math.PI, r)}A${r} ${r} 0 1 1 ${p(0, r)}Z` : `M${p(a0, r)}A${r} ${r} 0 ${large} 1 ${p(a1, r)}L${p(a1, r * 0.58)}A${r * 0.58} ${r * 0.58} 0 ${large} 0 ${p(a0, r * 0.58)}Z`;
        a0 = a1;
        return `<path d="${path}" fill="${col(i)}"><title>${t(d.labels[i])}: ${t(numWords(v))}</title></path>`;
      });
      const legend = d.labels
        .slice(0, 14)
        .map((l, i) => `<g transform="translate(240 ${20 + i * 20})"><rect width="11" height="11" rx="2" fill="${col(i)}"/><text x="18" y="10" font-size="12" fill="currentColor">${t(l.slice(0, 40))} · ${Math.round((vals[i] / total) * 100)}%</text></g>`)
        .join('');
      return `<svg viewBox="0 0 ${Math.max(W, 420)} ${H}" width="100%" height="${H}" role="img" aria-label="${t(cfg.title ?? '')}">${arcs.join('')}${legend}</svg>`;
    }
    const all = d.series.flatMap((s) => s.values);
    const lo = Math.min(0, ...all);
    const hi = Math.max(0, ...all);
    const step = niceStep(hi - lo || 1, 4);
    const top = Math.ceil(hi / step) * step || step;
    const bottom = Math.floor(lo / step) * step;
    const L0 = 46;
    const R0 = 10;
    const T0 = 10;
    const B0 = 34;
    const iw = W - L0 - R0;
    const ih = H - T0 - B0;
    const y = (v: number) => T0 + ih - ((v - bottom) / (top - bottom || 1)) * ih;
    let g = '';
    for (let v = bottom; v <= top + step / 2; v += step) g += `<line x1="${L0}" x2="${W - R0}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L0 - 6}" y="${(y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="currentColor" fill-opacity=".65">${t(numWords(Math.round(v * 1e6) / 1e6))}</text>`;
    const n = d.labels.length;
    const band = iw / n;
    const every = Math.max(1, Math.ceil((n * 64) / iw));
    d.labels.forEach((l, i) => {
      if (i % every) return;
      g += `<text x="${(L0 + band * i + band / 2).toFixed(1)}" y="${H - B0 + 16}" font-size="11" text-anchor="middle" fill="currentColor" fill-opacity=".75">${t(l.length > 14 ? `${l.slice(0, 13)}…` : l)}</text>`;
    });
    if (cfg.type === 'bar') {
      const k = d.series.length;
      const bw = Math.max(2, Math.min(48, (band * 0.72) / k));
      d.series.forEach((s, si) =>
        s.values.forEach((v, i) => {
          const x = L0 + band * i + band / 2 - (bw * k) / 2 + si * bw;
          const y0 = y(Math.max(0, v));
          const hgt = Math.abs(y(v) - y(0));
          g += `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(0.5, hgt).toFixed(1)}" rx="2" fill="${col(si)}"><title>${t(d.labels[i])} · ${t(s.name)}: ${t(numWords(v))}</title></rect>`;
        }),
      );
    } else {
      d.series.forEach((s, si) => {
        const pts = s.values.map((v, i) => [L0 + band * i + band / 2, y(v)] as const);
        const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
        if (cfg.type === 'area' && pts.length) g += `<path d="${line}L${pts[pts.length - 1][0].toFixed(1)} ${y(Math.max(0, bottom)).toFixed(1)}L${pts[0][0].toFixed(1)} ${y(Math.max(0, bottom)).toFixed(1)}Z" fill="${col(si)}" fill-opacity=".18"/>`;
        g += `<path d="${line}" fill="none" stroke="${col(si)}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
        pts.forEach(([px, py], i) => (g += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.2" fill="${col(si)}"><title>${t(d.labels[i])} · ${t(s.name)}: ${t(numWords(s.values[i]))}</title></circle>`));
      });
    }
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${t(cfg.title ?? '')}">${g}</svg>`;
  };
  const CHART_STYLE = `:host{display:block}.ch{font:inherit;color:inherit;font-size:13px}.ct{font-weight:650;margin:0 0 6px;font-size:1.05em}.lg{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;font-size:.88em;opacity:.8}.lg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}.nt{opacity:.6;font-size:.9em;padding:18px 0;text-align:center;border:1px dashed color-mix(in srgb,currentColor 20%,transparent);border-radius:10px}svg{display:block;overflow:visible}`;
  const chart = (host: Element, o: { store: DbStore | null; labels?: Record<string, string> | null }) => {
    mounted.add(host);
    const labels = o.labels ?? {};
    const L = (k: string) => (typeof labels[k] === 'string' ? labels[k] : WORDS[k]);
    const root = (host as HTMLElement).attachShadow({ mode: 'open' });
    const box = h('div', { class: 'ch' });
    const style = document.createElement('style');
    style.textContent = CHART_STYLE;
    root.append(style, box);
    let cfg = chartCfg({});
    let s: DbState | null = null;
    let missing = false;
    const read = () => {
      try {
        cfg = chartCfg(JSON.parse(host.getAttribute('data-chart') || '{}'));
      } catch {
        cfg = chartCfg({});
      }
    };
    const colours = () => {
      const cs = getComputedStyle(host);
      return PALETTE.map((p, i) => cs.getPropertyValue(`--n-c${i + 1}`).trim() || p);
    };
    const draw = () => {
      const d = chartData(cfg, s);
      const svg = missing ? '' : drawChart(cfg, d, (host as HTMLElement).clientWidth || 600, colours());
      box.innerHTML = '';
      if (cfg.title) box.append(h('div', { class: 'ct' }, cfg.title));
      if (!svg) box.append(h('div', { class: 'nt' }, missing ? L('chartNoDb') : L('chartNoData')));
      else {
        const t = document.createElement('template');
        t.innerHTML = svg;
        box.append(t.content);
        if (cfg.type !== 'pie' && d.series.length > 1) {
          const c = colours();
          box.append(h('div', { class: 'lg' }, ...d.series.map((x, i) => h('span', {}, h('i', { style: `background:${c[i % c.length]}` }), x.name))));
        }
      }
    };
    const load = () => {
      read();
      missing = false;
      if (!cfg.db) {
        s = null;
        return draw();
      }
      const block = document.querySelector(`.n-db[data-db="${cfg.db}"]`);
      const drawn = block ? stateOf(block) : null;
      if (drawn) {
        s = drawn;
        return draw();
      }
      const fallback = () => {
        if (!block) {
          missing = true;
          return draw();
        }
        try {
          s = normalize(JSON.parse(block.getAttribute('data-schema') || '{}'), block.getAttribute('data-title') ?? '');
        } catch {
          s = null;
        }
        draw();
      };
      if (!o.store) return fallback();
      o.store.get(`n-db:${cfg.db}`).then((v) => {
        if (v && typeof v === 'object') {
          s = normalize(v);
          draw();
        } else fallback();
      }, fallback);
    };
    addEventListener('n-db', (e) => {
      const d = (e as CustomEvent).detail as { name?: string; state?: DbState } | null;
      if (!d || d.name !== cfg.db || !d.state) return;
      s = d.state;
      missing = false;
      draw();
    });
    new MutationObserver(load).observe(host, { attributes: true, attributeFilter: ['data-chart'] });
    let w = 0;
    new ResizeObserver(() => {
      const now = (host as HTMLElement).clientWidth;
      if (Math.abs(now - w) > 8) {
        w = now;
        draw();
      }
    }).observe(host);
    new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-n-theme'] });
    load();
  };

  const runAll: PageDatabases['run'] = (labels, seed, o = {}) => {
    const W = window as unknown as { hydor?: { storage?: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<unknown> }; download?: (name: string, mime: string, text: string) => void } };
    // The page's storage as the kit gave it, taken before the page's own scripts could take the name; else the seed.
    const st = W.hydor?.storage;
    const download = W.hydor?.download;
    const mem = new Map(Object.entries(seed ?? {}));
    const store: DbStore = st
      ? { get: (k) => st.get(k), set: (k, v) => st.set(k, v) }
      : {
          get: async (k) => (mem.has(k) ? JSON.parse(mem.get(k)!) : null),
          set: async (k, v) => void mem.set(k, JSON.stringify(v)),
        };
    // Without an app around the page nothing keeps a change: what it holds is shown as it is.
    const readOnly = o.readOnly ?? window.parent === window;
    const all = () => {
      for (const el of document.querySelectorAll('.n-db')) mount(el, { store, labels, readOnly, ...(download ? { download } : {}) });
      // (charts after the databases they are drawn from)
      for (const el of document.querySelectorAll('.n-chart')) mount(el, { store, labels, readOnly });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
    else all();
    // Databases a page's own script puts in later.
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && ((n as Element).matches('.n-db,.n-chart') || (n as Element).querySelector('.n-db,.n-chart'))))) all();
    }).observe(document.documentElement, { childList: true, subtree: true });
  };

  const stateOf: PageDatabases['stateOf'] = (host) => {
    const s = states.get(host);
    return s ? normalize(JSON.parse(JSON.stringify(s()))) : null;
  };

  const formula: PageDatabases['formula'] = (s, row, expr) => {
    const r = calcFormula(s, row, expr);
    return { text: valueWords(r.value), value: r.value, ...(r.error ? { error: r.error } : {}) };
  };

  return { normalize, change, text, value, cellText, formula, calculate, csv, fromCsv, md, mdOf, mount, stateOf, run: runAll, words: WORDS };
}

/** A function's source in a <script>: nothing in it may end the element or open an HTML comment there. */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The databases' source, for a script in a page. */
export const PAGE_DB_SRC = scriptSafe(pageDatabases.toString());

/** Whether a page has parts the databases' script draws: a database, or a chart. */
export const hasDbParts = (html: string) => /\bn-(db|chart)\b/.test(html);

/** The script that draws a page's databases and charts (in Use, in a picture of it, a PDF, a published copy, a page saved as a file). */
export const pageDbScript = (labels?: Record<string, string> | null, seed?: Record<string, string> | null) =>
  `<script>(${PAGE_DB_SRC})().run(${JSON.stringify(labels ?? null).replace(/</g, '\\u003c')}, ${JSON.stringify(seed ?? null).replace(/</g, '\\u003c')})</script>`;

/** The storage key a database keeps what it holds under. */
export const dbKey = (name: string) => `n-db:${name}`;

/** Markdown as the page editor's blocks (the server's imports use it). */
export const markdownBlocks = (md: string) => pageDatabases().md(md);

const unescape = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The databases a page's HTML has: each block's name, title and first columns and rows (as its data-schema says). */
export function dbBlocks(html: string): { name: string; title: string; schema: unknown }[] {
  const out: { name: string; title: string; schema: unknown }[] = [];
  for (const m of html.matchAll(/<div\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/\bclass\s*=\s*("[^"]*\bn-db\b[^"]*"|'[^']*\bn-db\b[^']*')/i.test(tag)) continue;
    const attr = (n: string) => {
      const a = new RegExp(`\\b${n}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
      return a ? unescape(a[2] ?? a[3] ?? '') : '';
    };
    const name = attr('data-db');
    if (!/^[\w-]{1,40}$/.test(name) || out.some((x) => x.name === name)) continue;
    let schema: unknown = {};
    try {
      schema = JSON.parse(attr('data-schema') || '{}');
    } catch {}
    out.push({ name, title: attr('data-title'), schema });
  }
  return out;
}

/** A page's databases as an agent reads them in get_page (`stored`: what the page keeps, as JSON text by key), and how to change them. */
export function dbsForAgent(html: string, stored: Record<string, string>): string {
  const blocks = dbBlocks(html);
  if (!blocks.length) return '';
  const D = pageDatabases();
  const lines: string[] = ['Databases (tables of the page’s own data: whoever uses the page adds and changes their rows):'];
  for (const b of blocks) {
    let raw: unknown = b.schema;
    try {
      if (stored[dbKey(b.name)]) raw = JSON.parse(stored[dbKey(b.name)]);
    } catch {}
    const s = D.normalize(raw, b.title);
    const name = (id: string | null | undefined) => s.cols.find((c) => c.id === id)?.name;
    const settings = [
      s.sort ? `sorted by ${name(s.sort.col)} ${s.sort.dir}` : '',
      s.view === 'board' && s.group ? `lanes by ${name(s.group)}` : '',
      s.groupBy ? `grouped by ${name(s.groupBy)}` : '',
      s.view === 'calendar' && s.dateCol ? `by ${name(s.dateCol)}` : '',
      s.view === 'timeline' && s.start ? `from ${name(s.start)} to ${name(s.end ?? s.start)}` : '',
      s.view === 'gallery' && s.cover ? `pictures from ${name(s.cover)}` : '',
      s.calc && Object.keys(s.calc).length ? `footer: ${Object.entries(s.calc).map(([k, v]) => `${name(k)} ${v}`).join(', ')}` : '',
    ].filter(Boolean);
    const colWords = (c: (typeof s.cols)[number]) =>
      `${c.name} (${c.kind}${c.options?.length ? `: ${c.options.map((o) => o.name).join(', ')}` : ''}${c.kind === 'formula' ? `: ${c.formula ?? ''}` : ''}${c.kind === 'ai' && c.ai ? `: ${c.ai.how}${c.ai.prompt ? ` “${c.ai.prompt}”` : ''}${c.ai.lang ? ` into ${c.ai.lang}` : ''}${c.ai.options ? ` [${c.ai.options}]` : ''}` : ''})`;
    lines.push(
      `- ${b.name}${s.title ? ` “${s.title}”` : ''} · ${s.rows.length} row${s.rows.length === 1 ? '' : 's'} · ${s.view} view${settings.length ? ` · ${settings.join(' · ')}` : ''}`,
      `  columns: ${s.cols.map(colWords).join(' · ')}`,
      ...s.rows.slice(0, 300).map((r) => `  ${r.id}: ${s.cols.map((c) => `${c.name}=${JSON.stringify(D.cellText(s, r, c))}`).join(', ')}${r.page ? ` · its page: ${JSON.stringify(r.page.length > 300 ? `${r.page.slice(0, 300)}…` : r.page)}` : ''}`),
      ...(s.rows.length > 300 ? [`  … and ${s.rows.length - 300} more rows`] : []),
    );
  }
  lines.push(
    'To change a database, save_page with this id and databases: {"<name>": {"add": [{"<column>": value, …}], "update": [{"id": "<row id>", "<column>": value}], "remove": ["<row id>"]}} (also "rows" to set all of them, "cols" for the columns, "title", "view": table|board|gallery|list|calendar|timeline, "groupBy", "calc": {"<column>": "sum"|"avg"|"count"|…}, "dateCol", "start", "end", "cover"); values by column name: text, a number, an option’s name (new names become options), a list of names for multi-select, "YYYY-MM-DD" for a date, true for a ticked checkbox, an address for a URL, an email or a phone number, [{"name","src"}] for files (https addresses); "page": Markdown for a row’s own page. Formula, created and edited columns are worked out, never set; an AI column’s cells are words you may write (page_action fill_column has the helper model fill them).',
  );
  return lines.join('\n');
}

// A database block for pages (the page editor's, as Notion's): a table whose columns have kinds (text, a number, a select
// with coloured options, several of them, a date, a checkbox, a link), its rows sorted and filtered, or a board of cards
// in lanes by a select column, cards dragged between them. The block in the page (div.n-db) gives its name (data-db), its
// title and its first columns and rows (data-schema); what it holds from then on is kept with the page's own data
// (hydor.storage, under "n-db:<name>"), changed by whoever uses the page, in Use and in Edit alike, so it stays on every
// device and through the page's versions. It is drawn in a shadow root of its own: its look apart from the page's, and
// nothing of it in the page's HTML. Where nothing would keep a change (a published copy, a page saved as a file, a
// picture of the page) it is shown as it is, read-only.
//
// pageDatabases runs in the browser (its source is sent as text, as the kit's scripts are: it uses only its arguments and
// the browser's globals), and on the server, which reads and changes a page's databases for agents with the same
// normalizing (nothing from a page or an agent becomes markup: words are put in as text, colours come from a list).

/** What keeps a database: the page's storage (or a stand-in for it). */
export interface DbStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
}

export type DbKind = 'text' | 'number' | 'select' | 'multi' | 'date' | 'check' | 'link';

export interface DbOption {
  id: string;
  name: string;
  color: string;
}

export interface DbCol {
  id: string;
  name: string;
  kind: DbKind;
  /** A select's (or multi-select's) options, in their order. */
  options?: DbOption[];
}

export interface DbRow {
  id: string;
  /** Its values by column id: text, a number, an option's id, option ids, a date (YYYY-MM-DD), true, an address. */
  cells: Record<string, unknown>;
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
  view: 'table' | 'board';
  sort: { col: string; dir: 'asc' | 'desc' } | null;
  filters: DbFilter[];
  /** The board's lanes: a select column's id. */
  group: string | null;
}

export interface PageDatabases {
  /** A database from what a block or an agent says (columns and rows by names too), checked and complete. */
  normalize(v: unknown, title?: string): DbState;
  /**
   * Changes as an agent gives them: { title, cols (the columns: kept by name, new ones added, the rest gone), rows (all
   * of them anew), add (rows), update ([{ id, …values }]), remove (row ids) }; values by column name or id.
   */
  change(state: DbState, ch: unknown): DbState;
  /** A value as words (an option's name, a date, ✓). */
  text(col: DbCol, v: unknown): string;
  /** Draws a database in its block, kept by `store` (`edit`: in the editor, where a keeper that doesn't answer leaves it to read, saying where it changes). */
  mount(host: Element, o: { store: DbStore | null; labels?: Record<string, string> | null; readOnly?: boolean; edit?: boolean }): void;
  /** What a block drawn here holds now (null for one not drawn, or not yet read from its keeper): a copy of it starts with it. */
  stateOf(host: Element): DbState | null;
  /**
   * Draws every database of the page as it is read (and those its scripts add), kept by the page's storage
   * (hydor.storage), or by `seed` (stored values by key, as JSON text) where there is none; read-only without an app
   * around the page.
   */
  run(labels?: Record<string, string> | null, seed?: Record<string, string> | null, o?: { readOnly?: boolean }): void;
  words: Record<string, string>;
}

export function pageDatabases(): PageDatabases {
  const KINDS: DbKind[] = ['text', 'number', 'select', 'multi', 'date', 'check', 'link'];
  const COLORS = ['default', 'grey', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  const HEX: Record<string, string> = { default: '#8c8a85', grey: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const MAX_ROWS = 2000;
  const MAX_COLS = 30;
  const MAX_OPTS = 60;
  /** The words it shows, in English: the app gives them in its language. */
  const WORDS: Record<string, string> = {
    untitled: 'Untitled database',
    table: 'Table',
    // (not "Board": the dictionaries have that word as a leaderboard)
    board: 'Board view',
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
    kLink: 'Link',
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
    noValue: 'No value',
    needSelect: 'A board groups its cards by a select column’s options.',
    addSelect: 'Add a select column',
    status: 'Status',
    untitledRow: 'Untitled',
    open: 'Open the link',
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
    const alias: Record<string, DbKind> = { 'multi-select': 'multi', multiselect: 'multi', tags: 'multi', checkbox: 'check', boolean: 'check', url: 'link', number: 'number', num: 'number', title: 'text', string: 'text', status: 'select' };
    return alias[s] ?? 'text';
  };
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
      default: {
        const s = str(v, 4000);
        return s ? s : undefined;
      }
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
    return String(v);
  };
  const OPS: Record<DbKind, string[]> = {
    text: ['contains', 'notContains', 'empty', 'filled'],
    link: ['contains', 'notContains', 'empty', 'filled'],
    number: ['eq', 'ne', 'gt', 'lt', 'empty', 'filled'],
    select: ['is', 'isNot', 'empty', 'filled'],
    multi: ['has', 'hasNot', 'empty', 'filled'],
    date: ['is', 'before', 'after', 'empty', 'filled'],
    check: ['checked', 'unchecked'],
  };
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
      cols.push(col);
    }
    if (!cols.length) cols.push({ id: 'name', name: 'Name', kind: 'text' });
    const byName = new Map(cols.map((c) => [c.name.toLowerCase(), c]));
    const rows: DbRow[] = [];
    const rowIds = new Set<string>();
    for (const x of Array.isArray(o.rows) ? o.rows.slice(0, MAX_ROWS) : []) {
      if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
      const r = x as Record<string, unknown>;
      const src = (r.cells && typeof r.cells === 'object' && !Array.isArray(r.cells) ? r.cells : r) as Record<string, unknown>;
      const id = typeof r.id === 'string' && ID.test(r.id) && !rowIds.has(r.id) ? r.id : uid('r', rowIds);
      rowIds.add(id);
      const cells: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(src)) {
        if (src === r && (k === 'id' || k === 'cells')) continue;
        // (values kept by column id name existing options; values by name, an agent's or a block's, may make new ones)
        const byId = cols.find((c) => c.id === k);
        const col = byId ?? byName.get(k.toLowerCase());
        if (!col) continue;
        const cell = cellOf(col, val, addAll || src === r || !byId);
        if (cell !== undefined) cells[col.id] = cell;
      }
      rows.push({ id, cells });
    }
    const colIds = new Set(cols.map((c) => c.id));
    const s = o.sort as Record<string, unknown> | null | undefined;
    const sortCol = s && typeof s === 'object' ? (cols.find((c) => c.id === s.col) ?? byName.get(String(s.col ?? '').toLowerCase())) : undefined;
    const filters: DbFilter[] = [];
    for (const f of Array.isArray(o.filters) ? o.filters.slice(0, 12) : []) {
      if (!f || typeof f !== 'object') continue;
      const col = cols.find((c) => c.id === (f as DbFilter).col);
      const op = String((f as DbFilter).op ?? '');
      if (!col || !OPS[col.kind].includes(op)) continue;
      const fv = (f as DbFilter).value;
      filters.push({ col: col.id, op, ...(fv !== undefined && fv !== null && fv !== '' ? { value: typeof fv === 'number' ? fv : str(fv, 200) } : {}) });
    }
    const g = typeof o.group === 'string' ? (cols.find((c) => c.id === o.group) ?? byName.get(o.group.toLowerCase())) : undefined;
    const group = g && g.kind === 'select' ? g.id : null;
    return {
      v: 1,
      title: str(o.title, 120).trim() || str(title0, 120).trim(),
      cols,
      rows,
      view: o.view === 'board' ? 'board' : 'table',
      sort: sortCol ? { col: sortCol.id, dir: s?.dir === 'desc' ? 'desc' : 'asc' } : null,
      filters,
      group,
    };
  };
  const change = (state: DbState, ch0: unknown): DbState => {
    const ch = (ch0 && typeof ch0 === 'object' ? ch0 : {}) as Record<string, unknown>;
    let s: DbState = normalize(JSON.parse(JSON.stringify(state)));
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
        return { ...c, id: was.id, kind, options };
      });
      // Values move with their columns; a column whose kind changes takes them as words, kept where they fit.
      const rows = s.rows.map((r) => ({
        id: r.id,
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
    if (Array.isArray(ch.rows)) s = normalize({ ...s, rows: ch.rows });
    if (Array.isArray(ch.add)) s = normalize({ ...s, rows: [...s.rows, ...ch.add] });
    if (Array.isArray(ch.update)) {
      const byName = new Map(s.cols.map((c) => [c.name.toLowerCase(), c]));
      for (const u0 of ch.update) {
        const u = (u0 && typeof u0 === 'object' ? u0 : {}) as Record<string, unknown>;
        const row = s.rows.find((r) => r.id === u.id);
        if (!row) continue;
        for (const [k, v] of Object.entries(u)) {
          if (k === 'id') continue;
          const col = s.cols.find((c) => c.id === k) ?? byName.get(k.toLowerCase());
          if (!col) continue;
          const cell = cellOf(col, v);
          if (cell === undefined) delete row.cells[col.id];
          else row.cells[col.id] = cell;
        }
      }
      s = normalize(s);
    }
    if (Array.isArray(ch.remove)) {
      const gone = new Set(ch.remove.map(String));
      s = { ...s, rows: s.rows.filter((r) => !gone.has(r.id)) };
    }
    return s;
  };

  // ---- sorting and filtering ----------------------------------------------------------------------------------------
  const rank = (col: DbCol, v: unknown): number | string | null => {
    if (v === undefined || v === null || (Array.isArray(v) && !v.length)) return null;
    if (col.kind === 'number') return typeof v === 'number' ? v : null;
    if (col.kind === 'check') return v ? 1 : 0;
    if (col.kind === 'select') return col.options?.findIndex((o) => o.id === v) ?? null;
    if (col.kind === 'multi') return col.options?.findIndex((o) => o.id === (v as string[])[0]) ?? null;
    return String(v).toLowerCase();
  };
  const sorted = (s: DbState, rows: DbRow[]) => {
    const col = s.sort ? s.cols.find((c) => c.id === s.sort!.col) : null;
    if (!col) return rows;
    const k = s.sort!.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const x = rank(col, a.cells[col.id]);
      const y = rank(col, b.cells[col.id]);
      // (empty ones last, either way)
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * k;
    });
  };
  const passes = (s: DbState, r: DbRow) =>
    s.filters.every((f) => {
      const col = s.cols.find((c) => c.id === f.col);
      if (!col) return true;
      const v = r.cells[col.id];
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      const words = text(col, v).toLowerCase();
      const want = f.value === undefined ? '' : String(f.value);
      // A condition still without its value lets every row through (as it is being written).
      if (want === '' && !['empty', 'filled', 'checked', 'unchecked'].includes(f.op)) return true;
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
          return want !== '' && Number(v) === Number(want);
        case 'ne':
          return want === '' || Number(v) !== Number(want);
        case 'gt':
          return want !== '' && typeof v === 'number' && v > Number(want);
        case 'lt':
          return want !== '' && typeof v === 'number' && v < Number(want);
        case 'is':
          return col.kind === 'date' ? v === want : v === want;
        case 'isNot':
          return v !== want;
        case 'has':
          return Array.isArray(v) && v.includes(want);
        case 'hasNot':
          return !Array.isArray(v) || !v.includes(want);
        case 'before':
          return !empty && want !== '' && String(v) < want;
        case 'after':
          return !empty && want !== '' && String(v) > want;
        case 'checked':
          return v === true;
        case 'unchecked':
          return v !== true;
        default:
          return true;
      }
    });

  // ---- drawing it -------------------------------------------------------------------------------------------------------
  const ICON: Record<string, string> = {
    text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    number: '<path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="M16 3l-2 18"/>',
    select: '<circle cx="12" cy="12" r="9"/><path d="m8.5 11 3.5 3.5 3.5-3.5"/>',
    multi: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    date: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    check: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 4v16"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    sort: '<path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    del: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/>',
    out: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    tick: '<path d="M20 6 9 17l-5-5"/>',
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
.tabs,.tools{display:flex;align-items:center;gap:2px}
.b{all:unset;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 8px;border-radius:7px;color:var(--mute);font-size:.86em;cursor:pointer;white-space:nowrap;box-sizing:border-box}
.b:hover,.b.on{background:var(--hover);color:inherit}
.b.on{font-weight:600}
.b.set{color:var(--n-accent,inherit)}
.b:disabled{cursor:default}
.b:disabled:hover{background:none;color:var(--mute)}
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
.check{display:flex;align-items:center;justify-content:center;min-height:34px;min-width:44px}
.check input{width:16px;height:16px;margin:0;accent-color:var(--n-accent,currentColor)}
.check.ro input{pointer-events:none}
.link{display:flex;align-items:center}
.link .b{flex:none;width:26px;padding:0;justify-content:center}
.pills{all:unset;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;min-width:110px;min-height:34px;padding:5px 8px;cursor:pointer}
.pills:hover{background:var(--hover)}
.pills.ro{cursor:auto}
.pills.ro:hover{background:none}
.pill{display:inline-flex;align-items:center;max-width:100%;padding:1px 7px;border-radius:5px;font-size:.88em;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.foot{display:flex;align-items:center;gap:8px;padding:4px 0}
.count{color:var(--mute);font-size:.82em;margin-left:auto}
.note{color:var(--mute);font-size:.86em;padding:6px 2px}
.err{color:var(--n-err,#d44c47);font-size:.84em;padding:4px 2px}
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
.in{all:unset;box-sizing:border-box;width:100%;height:30px;padding:0 8px;border-radius:7px;background:var(--hover);color:inherit}
.fl{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:3px 4px}
.fl select,.fl input{box-sizing:border-box;height:28px;max-width:150px;padding:0 6px;border:1px solid var(--ln);border-radius:6px;background:var(--pop);color:inherit;font:inherit;font-size:.92em}
.opt{display:flex;align-items:center;gap:6px;padding:3px 4px}
.opt .in{height:28px}
.sw{display:flex;flex-wrap:wrap;gap:3px;padding:0 4px 4px 30px}
.sw button{all:unset;width:18px;height:18px;border-radius:5px;cursor:pointer;box-sizing:border-box;border:1px solid var(--ln)}
.sw button.on{outline:2px solid var(--n-accent,currentColor);outline-offset:1px}
@media (pointer:coarse){.b{height:34px}.row{min-height:40px}.cell,.pills,.check{min-height:40px}.in{height:36px}.sw button{width:26px;height:26px}}
@media print{.tabs,.tools,.fl,.foot .b,th.end,td.end{display:none}.scroll,.lanes{overflow:visible}.lanes{flex-wrap:wrap}.lane,.card,tr{break-inside:avoid}.db .cell,.db .pills{min-width:0}}
`;
  const mounted = new WeakSet<Element>();
  /** What each block drawn holds, once its keeper said. */
  const states = new WeakMap<Element, () => DbState>();
  const pillStyle = (color: string) => `background:color-mix(in srgb,${HEX[color] ?? HEX.default} 22%,transparent);color:color-mix(in srgb,${HEX[color] ?? HEX.default} 70%,currentColor)`;

  const mount: PageDatabases['mount'] = (host, o) => {
    if (mounted.has(host) || !(host as HTMLElement).attachShadow) return;
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
    let pop: HTMLElement | null = null;
    let openCard: string | null = null;
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
    /** Changes that move rows or columns: kept, and drawn again (the cell written in keeps the caret). */
    const changed = () => {
      save();
      draw();
    };
    const colOf = (id: string | null | undefined) => state.cols.find((c) => c.id === id);
    /** A date for reading, as this device writes dates (12 Nov 2026). */
    const dateWords = (v: string) => {
      const d = new Date(`${v}T00:00:00`);
      return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    };
    const kindWord = (k: DbKind) => L(`k${k === 'multi' ? 'Multi' : k === 'check' ? 'Check' : k[0].toUpperCase() + k.slice(1)}`);
    const colourWord = (c: string) => L(c === 'default' ? 'cDefault' : `c${c[0].toUpperCase()}${c.slice(1)}`);
    const opWord = (op: string) => L(`op${op[0].toUpperCase()}${op.slice(1)}`) ?? op;
    const OP_SIGNS: Record<string, string> = { eq: '=', ne: '≠', gt: '>', lt: '<' };

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
      (p.querySelector(matchMedia('(pointer: coarse)').matches ? 'button' : 'input,button') as HTMLElement | null)?.focus({ preventScroll: true });
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
                    changed();
                    refill(fill);
                  } else {
                    if (on) delete row.cells[col.id];
                    else row.cells[col.id] = opt.id;
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
              closePop();
              changed();
            }),
          );
      };
      openPop(at, fill);
    };
    /** Where a cell is, so a drawing again puts the caret back in it. */
    const cellKey = (row: DbRow, col: DbCol) => `${row.id}:${col.id}`;
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
              changed();
            },
          }),
        );
      // Only to read (a page saved as a file, a PDF, a published copy): the words, which wrap, and a link that opens.
      if (readOnly) {
        if (col.kind === 'select' || col.kind === 'multi') return h('div', { class: 'pills ro' }, ...pills(col, v));
        const words = col.kind === 'date' && typeof v === 'string' ? dateWords(v) : text(col, v);
        const href = col.kind === 'link' && typeof v === 'string' && /^(https?:\/\/|mailto:)/i.test(v) ? v : '';
        return h('div', { class: 'cell ro' }, href ? h('a', { href, target: '_blank', rel: 'noopener' }, words) : words);
      }
      if (col.kind === 'select' || col.kind === 'multi') return h('button', { class: 'pills', type: 'button', 'aria-label': col.name, 'data-k': k, onclick: (e: Event) => optionsMenu(row, col, e.currentTarget as Element) }, ...pills(col, v));
      const input = h('input', {
        class: 'cell',
        type: col.kind === 'date' ? 'date' : col.kind === 'link' ? 'url' : 'text',
        inputmode: col.kind === 'number' ? 'decimal' : undefined,
        // (an empty date shows nothing until it is written in, not the browser's mm/dd/yyyy)
        required: col.kind === 'date' ? true : undefined,
        value: v === undefined ? '' : String(v),
        readonly: readOnly,
        'aria-label': col.name,
        'data-k': k,
        spellcheck: col.kind === 'text' ? undefined : 'false',
      }) as HTMLInputElement;
      // Words kept as they are typed; the rows sorted or filtered by them only once the cell is left.
      input.addEventListener('input', () => {
        const x = cellOf(col, input.value);
        if (x === undefined) delete row.cells[col.id];
        else row.cells[col.id] = x;
        save();
      });
      input.addEventListener('change', () => {
        if (col.kind === 'number' && input.value.trim() && row.cells[col.id] === undefined) input.value = '';
        if (state.sort?.col === col.id || state.filters.some((f) => f.col === col.id)) draw();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
      if (col.kind !== 'link') return input;
      const href = typeof v === 'string' && /^(https?:\/\/|mailto:)/i.test(v) ? v : '';
      return h('div', { class: 'link' }, input, href ? h('button', { class: 'b', type: 'button', title: L('open'), 'aria-label': L('open'), onclick: () => window.open(href, '_blank', 'noopener') }, icon('out', 13)) : null);
    };

    // ---- a column's menu: its name, kind, options; sorting, filtering, moving, deleting it --------------------------------
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
                if (k !== col.kind) state = change(state, { cols: state.cols.map((c) => (c.id === col.id ? { ...c, kind: k, options: k === 'select' || k === 'multi' ? (c.options ?? []) : undefined } : c)) });
                closePop();
                changed();
              },
              { on: k === col.kind },
            ),
          );
      };
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
              h('span', { class: 'pill', style: pillStyle(opt.color) }, '\u00a0'),
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

    // ---- sorting and filtering, from the bar over it ----------------------------------------------------------------------
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
            val = h('input', { type: col.kind === 'date' ? 'date' : col.kind === 'number' ? 'number' : 'text', value: f.value === undefined ? '' : String(f.value), 'aria-label': L('filter') });
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

    // ---- the rows shown: filtered, sorted ---------------------------------------------------------------------------------
    const shown = () =>
      sorted(
        state,
        state.rows.filter((r) => passes(state, r)),
      );
    const addRow = (cells: Record<string, unknown> = {}) => {
      const row = { id: uid('r', new Set(state.rows.map((r) => r.id))), cells };
      if (state.rows.length >= MAX_ROWS) return;
      state.rows.push(row);
      changed();
      // The new row's first cell takes the caret.
      (body.querySelector(`[data-k="${row.id}:${state.cols[0].id}"]`) as HTMLElement | null)?.focus();
      return row;
    };
    const removeRow = (row: DbRow) => {
      state.rows = state.rows.filter((r) => r !== row);
      if (openCard === row.id) openCard = null;
      changed();
    };

    // ---- the table ------------------------------------------------------------------------------------------------------
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
      const body = rows.map((r) =>
        h(
          'tr',
          {},
          ...state.cols.map((c) => h('td', c.kind === 'text' ? { class: 'wide' } : {}, cell(r, c))),
          readOnly ? null : h('td', { class: 'end' }, h('button', { class: 'b', type: 'button', title: L('delRow'), 'aria-label': L('delRow'), onclick: () => removeRow(r) }, icon('x', 13))),
        ),
      );
      return h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, head), h('tbody', {}, ...body)));
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
      const title = state.cols.find((c) => c.kind === 'text') ?? state.cols[0];
      const rows = shown();
      const lanes: { id: string | null; name: string; color: string }[] = [...(groupCol.options ?? []).map((x) => ({ id: x.id, name: x.name, color: x.color })), { id: null, name: L('noValue'), color: 'default' }].filter(
        // (the lane of cards without a value, to drop one in, when there is something to drop)
        (l) => l.id || !readOnly || rows.some((r) => r.cells[groupCol.id] === undefined),
      );
      const laneEls: { el: HTMLElement; id: string | null }[] = [];
      const card = (r: DbRow) => {
        const extra = state.cols.filter((c) => c !== title && c !== groupCol && text(c, r.cells[c.id]));
        const el = h(
          'div',
          { class: 'card', 'data-row': r.id, tabindex: '0' },
          h('div', { class: 'ct' }, text(title, r.cells[title.id]) || L('untitledRow')),
          extra.length && openCard !== r.id
            ? h('div', { class: 'cp' }, ...extra.flatMap((c) => (c.kind === 'select' || c.kind === 'multi' ? pills(c, r.cells[c.id]) : [h('span', {}, c.kind === 'date' ? dateWords(String(r.cells[c.id])) : text(c, r.cells[c.id]))])))
            : null,
          openCard === r.id
            ? h(
                'div',
                { class: 'fields' },
                ...state.cols.flatMap((c) => [h('span', { class: 'lbl' }, c.name), cell(r, c)]),
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
                        const r = addRow(lane.id ? { [groupCol.id]: lane.id } : {});
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
      const view = (v: 'table' | 'board') =>
        h(
          'button',
          {
            class: `b${state.view === v ? ' on' : ''}`,
            type: 'button',
            'aria-pressed': state.view === v ? 'true' : 'false',
            onclick: () => {
              state.view = v;
              changed();
            },
          },
          icon(v, 13),
          L(v),
        );
      const sortCol = colOf(state.sort?.col);
      body.replaceChildren();
      put(
        body,
        h(
          'div',
          { class: 'head' },
          title,
          h('div', { class: 'tabs' }, view('table'), view('board')),
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
          ),
        ),
        state.view === 'board' ? board() : table(),
        h('div', { class: 'foot' }, readOnly || state.view === 'board' ? null : h('button', { class: 'b', type: 'button', onclick: () => addRow() }, icon('plus', 13), L('newRow')), h('span', { class: 'count' }, count)),
        note ? h('div', { class: 'note' }, note) : null,
        error ? h('div', { class: 'err', role: 'alert' }, error) : null,
      );
      if (focus) (body.querySelector(`[data-k="${CSS.escape(focus)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    };
    // Drawn once its keeper says what it holds (a database new to the page starts as its block says): nothing shows rows
    // it is about to replace, or keeps a change made to them. A keeper that can't say leaves it as its block says, to read.
    if (!store) draw();
    else
      store.get(key).then(
        (v) => {
          if (v && typeof v === 'object') state = normalize(v, state.title);
          states.set(host, () => state);
          draw();
        },
        (e: unknown) => {
          readOnly = true;
          note = o.edit ? L('inUse') : `${L('unread')}: ${String((e as Error)?.message ?? e)}`;
          draw();
        },
      );
  };

  const run: PageDatabases['run'] = (labels, seed, o = {}) => {
    const W = window as unknown as { hydor?: { storage?: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<unknown> } } };
    // The page's storage as the kit gave it, taken before the page's own scripts could take the name; else the seed.
    const st = W.hydor?.storage;
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
      for (const el of document.querySelectorAll('.n-db')) mount(el, { store, labels, readOnly });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
    else all();
    // Databases a page's own script puts in later.
    new MutationObserver((ms) => {
      if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && ((n as Element).matches('.n-db') || (n as Element).querySelector('.n-db'))))) all();
    }).observe(document.documentElement, { childList: true, subtree: true });
  };

  const stateOf: PageDatabases['stateOf'] = (host) => {
    const s = states.get(host);
    return s ? normalize(JSON.parse(JSON.stringify(s()))) : null;
  };

  return { normalize, change, text, mount, stateOf, run, words: WORDS };
}

/** A function's source in a <script>: nothing in it may end the element or open an HTML comment there. */
const scriptSafe = (src: string) => src.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** The databases' source, for a script in a page. */
export const PAGE_DB_SRC = scriptSafe(pageDatabases.toString());

/** The script that draws a page's databases (in Use, in a picture of it, a PDF, a published copy, a page saved as a file). */
export const pageDbScript = (labels?: Record<string, string> | null, seed?: Record<string, string> | null) =>
  `<script>(${PAGE_DB_SRC})().run(${JSON.stringify(labels ?? null).replace(/</g, '\\u003c')}, ${JSON.stringify(seed ?? null).replace(/</g, '\\u003c')})</script>`;

/** The storage key a database keeps what it holds under. */
export const dbKey = (name: string) => `n-db:${name}`;

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
    lines.push(
      `- ${b.name}${s.title ? ` “${s.title}”` : ''} · ${s.rows.length} row${s.rows.length === 1 ? '' : 's'} · ${s.view} view${s.sort ? ` · sorted by ${s.cols.find((c) => c.id === s.sort!.col)?.name} ${s.sort.dir}` : ''}`,
      `  columns: ${s.cols.map((c) => `${c.name} (${c.kind}${c.options?.length ? `: ${c.options.map((o) => o.name).join(', ')}` : ''})`).join(' · ')}`,
      ...s.rows.slice(0, 300).map((r) => `  ${r.id}: ${s.cols.map((c) => `${c.name}=${JSON.stringify(D.text(c, r.cells[c.id]))}`).join(', ')}`),
      ...(s.rows.length > 300 ? [`  … and ${s.rows.length - 300} more rows`] : []),
    );
  }
  lines.push(
    'To change a database, save_page with this id and databases: {"<name>": {"add": [{"<column>": value, …}], "update": [{"id": "<row id>", "<column>": value}], "remove": ["<row id>"]}} (also "rows" to set all of them, "cols" for the columns, "title"); values by column name: text, a number, an option’s name (new names become options), a list of names for multi-select, "YYYY-MM-DD" for a date, true for a ticked checkbox, an address for a link.',
  );
  return lines.join('\n');
}

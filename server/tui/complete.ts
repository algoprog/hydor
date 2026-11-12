// The live completion menu of the chat's input line, as pure functions the chat draws with: a loose match of what is
// typed against a text (letters in order, with the places that count marked), what the text before the cursor is
// completing (a /command, a value after one, an @file), the items for each, and the menu's rows (a highlighted row,
// matched letters in the accent colour, a dim hint, a window that scrolls). The chat keeps the state and the keys.
import { graphemes, graphemeWidth, pad, strWidth, truncate, type Paint } from './term.ts';

// ---- loose matching ---------------------------------------------------------------------------------------

export interface Match {
  score: number;
  /** Where in the text the typed letters were found (indexes into the string). */
  hits: number[];
}

/** Whether a letter starts a word: after / - _ . or a space, or a capital after a small letter. */
function wordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if ('/-_. '.includes(prev)) return true;
  return prev !== prev.toUpperCase() && text[i] !== text[i].toLowerCase();
}

/** One try, the letters taken in order from `start` on. */
function attempt(q: string, text: string, lower: string, start: number): Match | null {
  const hits: number[] = [];
  let at = start;
  for (const ch of q) {
    const i = lower.indexOf(ch, at);
    if (i < 0) return null;
    hits.push(i);
    at = i + 1;
  }
  let score = 0;
  let run = 0;
  hits.forEach((i, k) => {
    let b = 10;
    if (i === 0) b += 20;
    else if (wordStart(text, i)) b += 12;
    if (k > 0 && i === hits[k - 1] + 1) {
      run++;
      b += 6 + Math.min(run, 4) * 3;
    } else {
      run = 0;
      if (k > 0) score -= Math.min(i - hits[k - 1] - 1, 10) * 1.5;
    }
    if (text[i] === q[k]) b += 0.5;
    score += b;
  });
  score -= Math.min(hits[0], 15) * 0.5;
  // Everything typed is the whole text: that is what was meant.
  if (hits.length === text.length) score += 30;
  score -= text.length * 0.05;
  return { score: Math.round(score), hits };
}

/**
 * A case-insensitive match of the letters of `query`, in order, anywhere in `text`: null when they are not all there.
 * The score is higher for a match at the start, at the start of words and in runs, lower for letters skipped and for
 * long texts. An empty query matches everything with score 0.
 */
export function fuzzy(query: string, text: string): Match | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, hits: [] };
  // Letter by letter, so the indexes stay those of the text (a few capitals lower to more than one letter).
  const lower = Array.from(text, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join('');
  let best: Match | null = null;
  // Each place the first letter is can start the match; the best of the first few wins.
  let tries = 0;
  for (let s = lower.indexOf(q[0]); s >= 0 && tries < 12; s = lower.indexOf(q[0], s + 1), tries++) {
    const m = attempt(q, text, lower, s);
    if (!m) break;
    if (!best || m.score > best.score) best = m;
  }
  return best;
}

// ---- items ----------------------------------------------------------------------------------------------

export interface Item {
  /** What the row shows and what is matched (after `skip` characters). */
  label: string;
  hint?: string;
  /** A command's arguments, shown dim after its name in the label column. */
  args?: string;
  /** What accepting it puts in (a file: its path after the @). */
  value: string;
  kind: 'command' | 'value' | 'file' | 'dir' | 'history';
  /** Characters at the start of the label that are not matched (the / of a command). */
  skip?: number;
  /** A command that cannot run without an argument. */
  needsArg?: boolean;
  /** A number shown before the label (a picker's). */
  num?: string;
}

export interface Ranked {
  item: Item;
  hits: number[];
}

/** The items that match, best first (the order they came in for ties); with no query all of them as they are. `byHint`: a hint's words can match too, below the names (not for commands: a word that is no command's name goes to the agent as it is). */
export function rank(items: Item[], query: string, byHint = true): Ranked[] {
  if (!query.trim()) return items.map((item) => ({ item, hits: [] }));
  const out: { r: Ranked; score: number; i: number }[] = [];
  items.forEach((item, i) => {
    const skip = item.skip ?? 0;
    const m = fuzzy(query, item.label.slice(skip));
    if (m) return out.push({ r: { item, hits: m.hits.map((h) => h + skip) }, score: m.score, i });
    // Its hint can match too (a model's label, an agent's description), below those that match by name.
    const h = byHint && item.hint ? fuzzy(query, item.hint) : null;
    if (h) out.push({ r: { item, hits: [] }, score: h.score - 100, i });
  });
  return out.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.r);
}

/** The items that match, in the order they came in, with the matched letters marked (files: the server's order is the ranking). */
export function filterKeep(items: Item[], query: string): Ranked[] {
  return items.map((item) => ({ item, hits: query.trim() ? (fuzzy(query, item.label)?.hits ?? []) : [] }));
}

/** Whether an argument text (`[name|auto]`, `<title>`) names one that cannot be left out. */
export function argsRequired(args?: string): boolean {
  return !!args && /\S/.test(args.replace(/\[[^\]]*\]/g, ''));
}

/** The chat's own commands and the program's, the chat's first, nobody twice. */
export function commandItems(own: { name: string; args?: string; what: string }[], prog: { name: string; description?: string; argumentHint?: string }[] = []): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const c of own) {
    seen.add(c.name);
    out.push({ label: `/${c.name}`, args: c.args, hint: c.what, value: `/${c.name}`, kind: 'command', skip: 1, needsArg: argsRequired(c.args) });
  }
  for (const c of prog) {
    const name = c.name.replace(/^\//, '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ label: `/${name}`, args: c.argumentHint, hint: c.description, value: `/${name}`, kind: 'command', skip: 1, needsArg: argsRequired(c.argumentHint) });
  }
  return out;
}

/** A message of history as one row: its line breaks as ↵. */
export const oneRow = (s: string) => s.replace(/\s*\n\s*/g, '↵');

/** Earlier messages, newest first, each once, those the typed letters are found in. */
export function historyItems(history: string[], query: string): Ranked[] {
  const seen = new Set<string>();
  const out: Ranked[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (seen.has(h)) continue;
    seen.add(h);
    const label = oneRow(h);
    const m = fuzzy(query, label);
    if (m) out.push({ item: { label, value: h, kind: 'history' }, hits: m.hits });
  }
  return out;
}

// ---- what is being completed ---------------------------------------------------------------------------------

export type Context = { kind: 'commands'; from: number; query: string } | { kind: 'values'; cmd: string; from: number; query: string } | { kind: 'files'; from: number; query: string }
  /** After `/hydor `: the words before the one being typed (an area, a verb, arguments, options) and that word. */
  | { kind: 'hydor'; from: number; before: string[]; query: string };

/** The commands that take a value from a list. */
export const VALUE_COMMANDS = ['model', 'mode', 'effort', 'agent', 'helpers', 'open'];

/** What the text before the cursor is completing, and where that starts; null when nothing. */
export function contextOf(before: string): Context | null {
  let m: RegExpExecArray | null;
  if ((m = /^\/(\S*)$/.exec(before))) return { kind: 'commands', from: 0, query: m[1] };
  if ((m = new RegExp(`^/(${VALUE_COMMANDS.join('|')})[ \\t]+(\\S*)$`).exec(before))) return { kind: 'values', cmd: m[1], from: before.length - m[2].length, query: m[2] };
  if ((m = /^\/hydor[ \t]+([^\n]*)$/.exec(before))) {
    const words = m[1].split(/\s+/);
    const query = words.pop() ?? '';
    return { kind: 'hydor', from: before.length - query.length, before: words, query };
  }
  if ((m = /(?:^|\s)@(\S*)$/.exec(before))) return { kind: 'files', from: before.length - m[1].length - 1, query: m[1] };
  return null;
}

/** Whether an @ query is a folder to list (empty, ending in /, or a path from the root, home or a parent) rather than words to find files by. */
export const listsFolder = (q: string) => q === '' || q.endsWith('/') || /^(\/|~\/|\.\.?\/)/.test(q);

// ---- the rows ----------------------------------------------------------------------------------------------------

/** The first row of a window of `rows` over `total` that keeps `sel` showing, from where the window was. */
export function windowTop(total: number, sel: number, top: number, rows: number): number {
  if (total <= rows) return 0;
  if (sel < top) return sel;
  if (sel >= top + rows) return sel - rows + 1;
  return Math.min(top, total - rows);
}

/** A label with its matched letters in the accent colour (and the folder part of a file dim). */
function styled(label: string, hits: Set<number>, kind: Item['kind'], sel: boolean, p: Paint): string {
  const dirEnd = kind === 'file' || kind === 'dir' ? label.replace(/\/$/, '').lastIndexOf('/') + 1 : 0;
  let out = '';
  let run = '';
  let cls = '';
  let pos = 0;
  const flush = () => {
    if (!run) return;
    let s = cls === 'hit' ? p.accent(run) : cls === 'dir' ? p.dim(run) : run;
    if (sel) s = p.bold(s);
    out += s;
    run = '';
  };
  for (const g of graphemes(label)) {
    const c = hits.has(pos) ? 'hit' : pos < dirEnd ? 'dir' : '';
    if (c !== cls) flush();
    cls = c;
    run += g;
    pos += g.length;
  }
  flush();
  return out;
}

/** A label cut to `w` columns with … where it was cut (its matched letters past the cut dropped). */
function cutLabel(label: string, w: number): string {
  if (strWidth(label) <= w) return label;
  let out = '';
  let n = 0;
  for (const g of graphemes(label)) {
    const gw = graphemeWidth(g);
    if (n + gw > w - 1) break;
    out += g;
    n += gw;
  }
  return `${out}…`;
}

export interface MenuOpts {
  items: Ranked[];
  sel: number;
  top: number;
  /** How many items show at most (a row more says how many are left). */
  rows: number;
  width: number;
  p: Paint;
  /** The widest a label may be (28 for names; wider for files and messages). */
  maxLabel?: number;
  /** A line for when there is nothing to show. */
  empty?: string;
}

/**
 * The menu as rows, none wider than `width - 1`: ❯ and the label bold on the selected row, the rest indented the same,
 * labels padded to the widest shown, hints dim and cut to fit, and a last dim row saying how many more there are.
 */
export function menuRows(o: MenuOpts): string[] {
  const { p, width } = o;
  if (!o.items.length) return o.empty ? [truncate(`  ${p.dim(o.empty)}`, width - 1)] : [];
  const top = windowTop(o.items.length, o.sel, o.top, o.rows);
  const shown = o.items.slice(top, top + o.rows);
  const numW = Math.max(0, ...shown.map((r) => r.item.num?.length ?? 0));
  const cap = Math.max(8, Math.min(o.maxLabel ?? 28, width - 6 - (numW ? numW + 1 : 0)));
  // The label column: the name, and a command's arguments dim after it (cut first when they do not fit).
  const cols = shown.map((r) => {
    const lab = cutLabel(r.item.label, cap);
    const room = cap - strWidth(lab) - 1;
    return { lab, args: r.item.args && room >= 2 ? cutLabel(r.item.args, room) : '' };
  });
  const labelW = Math.min(cap, Math.max(...cols.map((c) => strWidth(c.lab) + (c.args ? 1 + strWidth(c.args) : 0))));
  const rows = shown.map((r, i) => {
    const sel = top + i === o.sel;
    const { lab, args } = cols[i];
    const label = pad(styled(lab, new Set(lab === r.item.label ? r.hits : r.hits.filter((h) => h < lab.length - 1)), r.item.kind, sel, p) + (args ? ` ${p.dim(args)}` : ''), labelW);
    const num = numW ? `${p.dim((r.item.num ?? '').padStart(numW))} ` : '';
    const hint = r.item.hint ? `   ${p.dim(r.item.hint)}` : '';
    return truncate(`${sel ? p.accent('❯') : ' '} ${num}${label}${hint}`.replace(/\s+$/, ''), width - 1);
  });
  const more = o.items.length - shown.length;
  if (more > 0) rows.push(truncate(`  ${p.dim(`↑↓ ${more} more`)}`, width - 1));
  return rows;
}

// Boards: a kind of kept page that keeps answer cards (shared/answer-ui) in a grid, each pinned from a reply (its
// toolbar's … → Pin to a board) or put there by an agent (save_board). A card keeps the answer UI's name and its data as
// the ```ui block held it when it was pinned (inline JSON, or a reference the block reads its data from), so the board
// draws it with the same view as the reply did. What the server and the pages share: the format, its sizes, and the
// checks a card passes before it is kept.
//
// The board as it is kept (server/pages/boards.ts writes it a card a line, so two versions read as a diff of lines):
//   { "format": 1, "cap"?: 5 | null, "cards": [BoardCard, …] }   the cards in their order on the board (the first at the
//   top left); cap: the board's monthly spending cap for its cards' refreshes (left out: $5; null: off)
// A board's title and description are the page's, as every kind's are (shared/pages.ts PageInfo). How cards refresh
// themselves is in shared/board-refresh.ts.
import { answerUi, type AnswerUiSpec } from './answer-ui/index.ts';
import { cleanCap, cleanRefresh, RefreshError, type CardRefresh } from './board-refresh.ts';

export type { CardRefresh } from './board-refresh.ts';

/** A card's size on the board: S, M, L or Wide. */
export type CardSize = 's' | 'm' | 'l' | 'wide';
export const CARD_SIZES: CardSize[] = ['s', 'm', 'l', 'wide'];
/** How many of the board's 12 columns a card of each size spans on a computer (a phone shows one column). */
export const CARD_SPAN: Record<CardSize, number> = { s: 3, m: 4, l: 6, wide: 12 };
/** What the board's Size menu calls each. */
export const SIZE_LABEL: Record<CardSize, string> = { s: 'S', m: 'M', l: 'L', wide: 'Wide' };

/** Where a card came from: the reply it was pinned from (its session and the turn's place in it), an app's run, a task's run. */
export interface CardSource {
  /** The session of the reply it was pinned from. */
  session?: string;
  /** The reply's place in its session (its timeline item's seq), to open the conversation there. */
  at?: number;
  /** The session's (or the app's, the task's) title when it was pinned, to show without asking. */
  title?: string;
  /** The folder of the session, for pictures the card names by a path in it. */
  cwd?: string;
  /** An app's run whose follow-up held it (its id: /apps/runs/<id>). */
  run?: string;
  /** A scheduled task whose run held it (its id). */
  task?: string;
}

export interface BoardCard {
  /** Its id on the board: c and letters and digits. */
  id: string;
  /** The answer UI that draws it, by its name in the catalog (shared/answer-ui): "chart", "weather"… */
  ui: string;
  /** Its data: the ```ui block's JSON, as it was when it was pinned (inline, or a `from` reference it reads its data from). */
  data: Record<string, unknown>;
  /** Its title on the board; left out, the data's own title, else the UI's name (cardTitle). */
  title?: string;
  size: CardSize;
  /** When it was pinned (or added by an agent). */
  pinnedAt: number;
  /** Who put it there: the user pinning it, or an agent (save_board). */
  by?: 'user' | 'agent';
  from?: CardSource;
  /** How it refreshes itself: the question asked again, when, on which tier (shared/board-refresh.ts). */
  refresh?: CardRefresh;
  /** When its data was last made anew (a refresh, or an agent's change of its data). */
  refreshedAt?: number;
}

export interface Board {
  format: 1;
  /** The monthly spending cap for its cards' refreshes, in dollars: left out, $5; null, off (shared/board-refresh.ts boardCap). */
  cap?: number | null;
  cards: BoardCard[];
}

/** How many cards a board holds, how large a card's data may be (as JSON), a title's length, a refresh setting's size. */
export const BOARD_LIMITS = { cards: 100, data: 256 * 1024, title: 120, refresh: 4096 };

export const newBoard = (): Board => ({ format: 1, cards: [] });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A new card's id. */
export function newCardId(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)];
  return `c${s}`;
}
const CARD_ID = /^c[a-z0-9]{4,24}$/;

/** The size a card of a UI starts at when none is asked for: wide for what runs across, small for one number or tool. */
export function defaultSize(ui: string): CardSize {
  if (/^(gantt|week|itinerary|timeline|calendar|activity|table|comparison|decision-matrix|map-values|places|directions|roadmap|agenda|kanban|bracket)$/.test(ui)) return 'wide';
  if (/^(chart|results|ranking|weather|stats|breakdown|distribution|waterfall|portfolio|elevation|graph|news|products|media|gallery|flights|stays|listings|jobs|standings|fixtures|network)$/.test(ui)) return 'l';
  if (/^(countdown|qr|definition|timers|world-clock|currency|unit-converter|picker|formula|color-palette|callout|quote|contact)$/.test(ui)) return 's';
  return 'm';
}

/** A card's title as the board shows it: its own, else its data's title, else the UI's name. */
export function cardTitle(c: Pick<BoardCard, 'title' | 'data' | 'ui'>): string {
  return c.title?.trim() || str(c.data?.title).trim() || answerUi(c.ui)?.title || c.ui;
}

// ---- checking a card's data against its UI's type -----------------------------------------------------------------

/** What a field of a UI's type is, roughly: enough to tell a field left out or given as the wrong kind of thing. */
type FieldType = { t: 'string' } | { t: 'number' } | { t: 'boolean' } | { t: 'array' } | { t: 'object' } | { t: 'enum'; of: string[] } | { t: 'any' };
export interface ShapeField {
  name: string;
  optional: boolean;
  type: FieldType;
}

const TONES = ['good', 'warn', 'bad', 'info', 'neutral'];
const STRINGY = new Set(['string', 'md', 'url', 'image', 'date', 'time', 'datetime']);

/** A text split at a character outside any brackets. */
function splitTop(text: string, at: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && at.includes(ch)) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

/** A type's text read as one of FieldType's (unions of plain kinds read as the loosest of them; a named type as any). */
function typeOf(text: string): FieldType {
  const t = text.trim().replace(/,$/, '').trim();
  if (!t) return { t: 'any' };
  // A union at the top: literal words make an enum; parts of one kind that kind; else any.
  const parts = splitTop(t, '|').map((p) => p.trim());
  if (parts.length > 1) {
    if (parts.every((p) => /^"[^"]*"$/.test(p))) return { t: 'enum', of: parts.map((p) => p.slice(1, -1)) };
    const kinds = new Set(parts.map((p) => typeOf(p).t));
    return kinds.size === 1 ? typeOf(parts[0]) : { t: 'any' };
  }
  // A list: X[] (of objects, of words, of numbers…).
  if (/\[\]$/.test(t)) return { t: 'array' };
  if (t.startsWith('{')) return { t: 'object' };
  if (/^"[^"]*"$/.test(t)) return { t: 'enum', of: [t.slice(1, -1)] };
  if (t === 'tone') return { t: 'enum', of: TONES };
  if (STRINGY.has(t)) return { t: 'string' };
  if (t === 'number') return { t: 'number' };
  if (t === 'boolean') return { t: 'boolean' };
  return { t: 'any' };
}

/** The objects a shape's text gives at its top, each as its inside: one, or several it may be instead ("or …"), not `Name = {…}`. */
function topObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      // A named type (`Fact = { … }`) is part of the type, not another shape of it.
      if (depth === 0 && !/=\s*$/.test(text.slice(Math.max(0, i - 40), i))) from = i;
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && from >= 0) {
        out.push(text.slice(from + 1, i));
        from = -1;
      }
    }
  }
  return out;
}

const shapes = new Map<string, ShapeField[][]>();

/**
 * The top-level fields of a UI's type (its `shape`), each with whether it may be left out and roughly what it is: a list
 * for each shape its data may take (most have one; pros-cons may be one subject's or several options').
 */
export function shapeFields(spec: AnswerUiSpec): ShapeField[][] {
  const known = shapes.get(spec.id);
  if (known) return known;
  // Its notes (// … to the end of a line) are words, not type.
  const text = spec.shape.replace(/\/\/[^\n]*/g, '');
  const all = topObjects(text).map((body) => {
    // Its entries: split at line breaks and commas outside any brackets; a line that is no `name?: type` goes on with
    // the type before it.
    const out: { name: string; optional: boolean; text: string }[] = [];
    for (const part of splitTop(body, '\n,')) {
      const t = part.trim();
      if (!t) continue;
      const m = /^([A-Za-z_$][\w$]*)(\?)?\s*:([\s\S]*)$/.exec(t);
      if (m) out.push({ name: m[1], optional: !!m[2], text: m[3] });
      else if (out.length) out[out.length - 1].text += ` ${t}`;
    }
    return out.map((f) => ({ name: f.name, optional: f.optional, type: typeOf(f.text) }));
  });
  shapes.set(spec.id, all.length ? all : [[]]);
  return shapes.get(spec.id)!;
}

const kindWord = (v: unknown) => (Array.isArray(v) ? 'a list' : isObj(v) ? 'an object' : typeof v === 'string' ? 'words' : typeof v === 'number' ? 'a number' : typeof v === 'boolean' ? 'true or false' : String(v));
const WANT: Record<FieldType['t'], string> = { string: 'words', number: 'a number', boolean: 'true or false', array: 'a list', object: 'an object', enum: '', any: '' };

/**
 * What is wrong with a card's data for its UI, as plain sentences (none: it fits): a field its type needs that is left
 * out, a field of the wrong kind (a list given as words…), or a word that is not one of those it takes. Data that reads
 * from a reference (`from`) may leave out what the reference brings.
 */
export function dataProblems(spec: AnswerUiSpec, data: Record<string, unknown>): string[] {
  const ref = data.from !== undefined && data.from !== null;
  let best: string[] | null = null;
  // The shape it fits best: none wrong, else the fewest.
  for (const fields of shapeFields(spec)) {
    const out = problemsWith(fields, data, ref);
    if (!best || out.length < best.length) best = out;
    if (!out.length) break;
  }
  return best ?? [];
}

function problemsWith(fields: ShapeField[], data: Record<string, unknown>, ref: boolean): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const v = data[f.name];
    if (v === undefined || v === null) {
      if (!f.optional && !ref) out.push(`${f.name} is missing`);
      continue;
    }
    const t = f.type;
    const ok =
      t.t === 'any' ||
      (t.t === 'string' && (typeof v === 'string' || typeof v === 'number')) ||
      (t.t === 'number' && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))) ||
      (t.t === 'boolean' && typeof v === 'boolean') ||
      (t.t === 'array' && Array.isArray(v)) ||
      (t.t === 'object' && isObj(v)) ||
      (t.t === 'enum' && typeof v === 'string' && t.of.includes(v));
    if (ok) continue;
    if (t.t === 'enum') out.push(`${f.name} is “${typeof v === 'string' ? v : kindWord(v)}”, but it takes ${t.of.map((x) => `“${x}”`).join(', ')}`);
    else out.push(`${f.name} should be ${WANT[t.t]}, not ${kindWord(v)}`);
  }
  return out;
}

// ---- a card as it is kept -----------------------------------------------------------------------------------------

/** Why a card was refused, said plainly (the agent or the person reads it). */
export class CardError extends Error {}

/** The answer UI a name means, or a plain refusal naming it. */
export function mustUi(name: unknown): AnswerUiSpec {
  const n = str(name).trim();
  if (!n) throw new CardError('A card needs ui: the name of an answer UI (find_ui lists them), such as "chart" or "weather".');
  const spec = answerUi(n);
  if (!spec) throw new CardError(`There is no answer UI called “${n.slice(0, 60)}”: find_ui finds the one that fits, by what it shows or by name.`);
  return spec;
}

/** A card's data as given: an object, its JSON text, or a list (taken as its items, as a reply's block is). */
function dataOf(v: unknown, label: string): Record<string, unknown> {
  let d = v;
  if (typeof d === 'string') {
    try {
      d = JSON.parse(d);
    } catch {
      throw new CardError(`${label}: its data is not JSON. Give the object the \`\`\`ui block holds.`);
    }
  }
  if (Array.isArray(d)) d = { items: d };
  if (!isObj(d) || !Object.keys(d).length) throw new CardError(`${label}: its data is empty. Give the object the \`\`\`ui block holds.`);
  const bytes = new TextEncoder().encode(JSON.stringify(d)).length;
  if (bytes > BOARD_LIMITS.data) throw new CardError(`${label}: its data is ${Math.round(bytes / 1024)} KB, more than a card holds (${BOARD_LIMITS.data / 1024} KB).`);
  return d;
}

const cleanTitle = (v: unknown) => {
  const s = str(v)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, BOARD_LIMITS.title);
  return s || undefined;
};

function cleanFrom(v: unknown): CardSource | undefined {
  if (!isObj(v)) return undefined;
  const o: CardSource = {};
  if (str(v.session).trim()) o.session = str(v.session).trim().slice(0, 200);
  if (Number.isInteger(v.at) && (v.at as number) >= 0) o.at = v.at as number;
  if (str(v.title).trim()) o.title = cleanTitle(v.title);
  if (str(v.cwd).trim()) o.cwd = str(v.cwd).trim().slice(0, 1000);
  if (str(v.run).trim()) o.run = str(v.run).trim().slice(0, 100);
  if (str(v.task).trim()) o.task = str(v.task).trim().slice(0, 100);
  return Object.keys(o).length ? o : undefined;
}

/**
 * A card as it is kept: its UI known (by its name, or another name agents write for it), its data an object of a size a
 * card holds, its title, size, id and source made sound. `strict` (an agent's card) also checks the data against the
 * UI's type (dataProblems); a card pinned from a reply is kept as it drew there. Throws CardError, said plainly.
 */
export function checkCard(input: unknown, o: { strict?: boolean; label?: string; now?: number } = {}): BoardCard {
  const label = o.label ?? 'The card';
  if (!isObj(input)) throw new CardError(`${label} is not an object: give {ui, data, title?, size?}.`);
  const spec = mustUi(input.ui);
  const data = dataOf(input.data, `${label} (${spec.id})`);
  if (o.strict) {
    const bad = dataProblems(spec, data);
    if (bad.length) throw new CardError(`${label} (${spec.id}): its data does not fit the ${spec.id} UI: ${bad.slice(0, 4).join('; ')}. find_ui with names ["${spec.id}"] gives the data it takes.`);
  }
  const size = CARD_SIZES.includes(input.size as CardSize) ? (input.size as CardSize) : defaultSize(spec.id);
  const card: BoardCard = {
    id: CARD_ID.test(str(input.id)) ? str(input.id) : newCardId(),
    ui: spec.id,
    data,
    size,
    pinnedAt: typeof input.pinnedAt === 'number' && Number.isFinite(input.pinnedAt) && input.pinnedAt > 0 ? Math.round(input.pinnedAt) : (o.now ?? Date.now()),
  };
  const title = cleanTitle(input.title);
  if (title) card.title = title;
  if (input.by === 'user' || input.by === 'agent') card.by = input.by;
  const from = cleanFrom(input.from);
  if (from) card.from = from;
  if (isObj(input.refresh)) {
    const bytes = new TextEncoder().encode(JSON.stringify(input.refresh)).length;
    if (bytes > BOARD_LIMITS.refresh) throw new CardError(`${label}: its refresh setting is more than ${BOARD_LIMITS.refresh / 1024} KB.`);
    try {
      const r = cleanRefresh(input.refresh);
      if (r) card.refresh = r;
    } catch (e) {
      if (e instanceof RefreshError) throw new CardError(`${label}: ${e.message}`);
      throw e;
    }
  }
  if (typeof input.refreshedAt === 'number' && Number.isFinite(input.refreshedAt) && input.refreshedAt > 0) card.refreshedAt = Math.round(input.refreshedAt);
  return card;
}

/** A board as it is kept: its cards checked (each its own id), at most BOARD_LIMITS.cards of them. */
export function checkBoard(input: unknown, o: { strict?: boolean } = {}): Board {
  let b = input;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      throw new CardError('The board is not JSON.');
    }
  }
  if (!isObj(b)) throw new CardError('A board is an object with a list of cards: {cards: [{ui, data, title?, size?}]}.');
  if (b.format !== undefined && b.format !== 1) throw new CardError(`Board format ${String(b.format)} is not known here.`);
  const list = b.cards === undefined ? [] : b.cards;
  if (!Array.isArray(list)) throw new CardError('cards: a list of cards, each {ui, data, title?, size?}.');
  if (list.length > BOARD_LIMITS.cards) throw new CardError(`A board holds at most ${BOARD_LIMITS.cards} cards (it has ${list.length}): make another board for the rest.`);
  const seen = new Set<string>();
  const cards = list.map((c, i) => {
    const card = checkCard(c, { strict: o.strict, label: `Card ${i + 1}` });
    while (seen.has(card.id)) card.id = newCardId();
    seen.add(card.id);
    return card;
  });
  let cap: number | null | undefined;
  try {
    cap = cleanCap(b.cap);
  } catch (e) {
    if (e instanceof RefreshError) throw new CardError(e.message);
    throw e;
  }
  return { format: 1, ...(cap !== undefined ? { cap } : {}), cards };
}

/** The board's text as it is kept: a card a line, so two versions read as a diff of lines. */
export function boardText(b: Board): string {
  const empty = JSON.stringify({ format: 1, ...(b.cap !== undefined ? { cap: b.cap } : {}), cards: [] });
  if (!b.cards.length) return `${empty}\n`;
  return `${empty.slice(0, -2)}\n${b.cards.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`;
}

/** A card moved from one place in the order to another. */
export function moveCard(b: Board, from: number, to: number): Board {
  if (from === to || from < 0 || from >= b.cards.length) return b;
  const cards = [...b.cards];
  const [c] = cards.splice(from, 1);
  cards.splice(Math.max(0, Math.min(cards.length, to)), 0, c);
  return { ...b, cards };
}

/** A card's fields changed (its title, its size, how it refreshes: undefined stops it), by its id. */
export const changeCard = (b: Board, id: string, change: Partial<Pick<BoardCard, 'title' | 'size' | 'refresh'>>): Board => ({
  ...b,
  cards: b.cards.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...change };
    if (!next.title?.trim()) delete next.title;
    if ('refresh' in change && !change.refresh) delete next.refresh;
    return next;
  }),
});

/** The board's monthly cap for refreshes changed (a number of dollars; null: off; undefined: back to the default). */
export const setBoardCap = (b: Board, cap: number | null | undefined): Board => {
  const next: Board = { ...b, cap };
  if (cap === undefined) delete next.cap;
  return next;
};

export const removeCard = (b: Board, id: string): Board => ({ ...b, cards: b.cards.filter((c) => c.id !== id) });

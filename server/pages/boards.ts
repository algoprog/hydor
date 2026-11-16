// Boards kept in the Library: answer cards (shared/answer-ui) in a grid, each pinned from a reply or put there by an
// agent (save_board), kept a card a line (shared/boards.ts says the format and checks each card). The board page draws
// the cards with the replies' own views (web/src/features/pages/board); its own page here, made without them, shows
// each card's title and its data as text and tables in the same grid: what its picture in the Library, a PDF and a web
// page of it are made from. An agent is told it card by card, with each card's id, UI, size and data.
import { blockHtml, docCss, listInfo, normalizeDoc } from '../../shared/docs.ts';
import { answerMarkdown } from '../../shared/answer-ui/text.ts';
import { answerUi } from '../../shared/answer-ui/index.ts';
import {
  BOARD_LIMITS,
  boardText,
  CARD_SIZES,
  CARD_SPAN,
  CardError,
  cardTitle,
  checkBoard,
  checkCard,
  newBoard,
  SIZE_LABEL,
  type Board,
  type BoardCard,
  type CardSize,
} from '../../shared/boards.ts';
import { HttpError } from '../auth.ts';

/** The longest a board may be as text. */
export const MAX_BOARD = 8 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A card or a board refused, as the API says it (400, in plain words). */
function plain<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof CardError) throw new HttpError(400, e.message);
    throw e;
  }
}

/** What a board keeps: checked (each card's UI known, its data an object a card holds), as its text. */
export function keepBoard(input: unknown, o: { strict?: boolean } = {}): { board: Board; text: string } {
  const board = plain(() => checkBoard(input, o));
  const text = boardText(board);
  if (Buffer.byteLength(text) > MAX_BOARD) throw new HttpError(413, `The board is over ${MAX_BOARD / 1024 / 1024} MB: take some cards off, or make another board.`);
  return { board, text };
}

/** A board as kept (read as it was written: a card whose UI the app no longer has still shows its data). */
export function readBoard(text: string): Board {
  const b = JSON.parse(text) as Partial<Board>;
  return { format: 1, cards: Array.isArray(b.cards) ? b.cards.filter(isObj) : [] };
}

export const freshBoard = (): Board => newBoard();

// ---- its own page ----------------------------------------------------------------------------------------

/** Markdown as the Library's documents show it (headings, lists, tables, pictures, links). */
function markdownHtml(md: string): string {
  if (!md.trim()) return '';
  try {
    const d = normalizeDoc({ markdown: md });
    const { labels } = listInfo(d.blocks);
    return d.blocks.map((b, i) => blockHtml(b, labels[i], { src: (s) => s })).join('');
  } catch {
    return `<p>${esc(md)}</p>`;
  }
}

/** A card's data as Markdown, without the title its tile shows above it. */
function cardBody(c: BoardCard): string {
  const spec = answerUi(c.ui);
  const md = answerMarkdown(spec?.id ?? c.ui, c.data, spec?.title);
  return md.replace(/^\*\*[^\n]*\*\*\n*/, '');
}

const PAGE_CSS = `
:root{color-scheme:light;--fg:#1d1d1b;--muted:#6b6a65;--line:#e4e3dd;--card:#fff;--bg:#f6f5f1;--accent:#2a78d6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1280px;margin:0 auto;padding:28px 28px 44px}
.bd-head{margin:0 0 18px}
.bd-title{font-size:22px;font-weight:650;letter-spacing:-.01em;margin:0}
.bd-desc{color:var(--muted);margin:4px 0 0}
.bd-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px;align-items:start}
.bd-card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;min-width:0;overflow:hidden}
.bd-card h2{font-size:14.5px;font-weight:620;margin:0 0 2px}
.bd-kind{font-size:11.5px;color:var(--muted);margin:0 0 8px}
.bd-body{font-size:13px;overflow-wrap:anywhere}
.bd-body > :first-child{margin-top:0}
.bd-body table{border-collapse:collapse;width:100%;font-size:12.5px}
.bd-body th,.bd-body td{border-bottom:1px solid var(--line);padding:3px 6px;text-align:left;vertical-align:top}
.bd-body img{max-width:100%;height:auto;border-radius:8px}
.bd-empty{color:var(--muted);border:1px dashed var(--line);border-radius:14px;padding:28px;text-align:center}
@media (max-width:720px){.bd-grid{grid-template-columns:1fr}.bd-card{grid-column:1/-1!important}main{padding:18px 14px 32px}}
@media print{body{background:#fff}main{max-width:none;padding:0}.bd-card{break-inside:avoid-page}}
`;

/** Its picture in the Library: each card a tile of its size in the grid, with its title and kind, large enough to read small. */
const STILL_CSS = `
body{font-size:26px}
main{max-width:none;padding:44px 48px}
.bd-title{font-size:44px}
.bd-grid{gap:22px}
.bd-card{border-radius:22px;padding:24px 28px;min-height:190px;border-width:2px}
.bd-card.bd-wide{min-height:130px}
.bd-card h2{font-size:30px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bd-kind{font-size:22px;margin:6px 0 0}
.bd-bar{height:12px;border-radius:6px;background:var(--line);margin-top:22px;width:70%}
.bd-bar+.bd-bar{width:45%;margin-top:12px}
.bd-empty{font-size:30px;padding:60px}
`;

/**
 * Its own page: each card's title and its data as text and tables, in the board's grid (a phone's one column). still:
 * the first cards as tiles of their sizes with their titles and kinds, for its picture in the Library; print: every
 * card, to a PDF.
 */
export function boardPage(board: Board, title: string, mode: 'viewer' | 'print' | 'still', description = ''): string {
  const cards = mode === 'still' ? board.cards.slice(0, 12) : board.cards;
  const tiles = cards
    .map((c) => {
      const spec = answerUi(c.ui);
      const size = CARD_SIZES.includes(c.size as CardSize) ? c.size : 'm';
      const head = `<h2>${esc(cardTitle(c))}</h2><p class="bd-kind">${esc(spec?.title ?? c.ui)}</p>`;
      if (mode === 'still') return `<section class="bd-card${size === 'wide' ? ' bd-wide' : ''}" style="grid-column:span ${CARD_SPAN[size]}">${head}<div class="bd-bar"></div><div class="bd-bar"></div></section>`;
      return `<section class="bd-card" style="grid-column:span ${CARD_SPAN[size]}">${head}<div class="bd-body">${markdownHtml(cardBody(c))}</div></section>`;
    })
    .join('\n');
  const md = docCss(normalizeDoc({ markdown: '' }), '.bd-body');
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'">`,
    '<meta name="generator" content="Hydor boards">',
    `<style>${PAGE_CSS}\n${md}${mode === 'still' ? `\n${STILL_CSS}\nbody{overflow:hidden}` : ''}</style></head><body>`,
    `<main translate="no"><header class="bd-head"><h1 class="bd-title">${esc(title)}</h1>${description && mode !== 'still' ? `<p class="bd-desc">${esc(description)}</p>` : ''}</header>`,
    cards.length ? `<div class="bd-grid">${tiles}</div>` : '<div class="bd-empty">No cards yet. Pin any answer card from a reply: its … menu → Pin to a board.</div>',
    '</main></body></html>',
  ].join('\n');
}

/** The board as Markdown: each card under its title, its data as text and tables (a conversation's export does the same). */
export function boardMarkdown(board: Board, title: string): string {
  const parts = board.cards.map((c) => `## ${cardTitle(c)}\n\n${cardBody(c)}`.trim());
  return `# ${title}\n\n${parts.join('\n\n') || '_No cards yet._'}\n`;
}

// ---- for agents ------------------------------------------------------------------------------------------

const CUT = 3_000;

/** What get_page tells an agent: each card in order, with its id, UI, size, where it came from and its data. */
export function boardForAgent(text: string): string {
  const b = readBoard(text);
  let budget = 120_000;
  const parts: string[] = [];
  b.cards.forEach((c, i) => {
    if (budget <= 0) return;
    const data = JSON.stringify(c.data);
    const from = c.from?.session ? ` · from session ${c.from.session}${c.from.title ? ` (“${c.from.title}”)` : ''}` : c.from?.run ? ` · from app run ${c.from.run}` : '';
    const refresh = c.refresh ? ` · refresh ${JSON.stringify(c.refresh)}` : '';
    const s = `--- card ${i + 1} · id ${c.id} · ${c.ui} · ${SIZE_LABEL[c.size] ?? c.size} · “${cardTitle(c)}” · pinned ${new Date(c.pinnedAt).toISOString()} by ${c.by ?? 'the user'}${from}${refresh}\n${data.length > CUT ? `${data.slice(0, CUT)}… (cut: ${data.length} characters)` : data}`;
    budget -= s.length;
    parts.push(s);
  });
  if (budget <= 0) parts.push(`… (cut: the board has ${b.cards.length} cards)`);
  return [
    `A board of answer cards, ${b.cards.length} card${b.cards.length === 1 ? '' : 's'} in their order on it (the first at the top left), each with its id, the answer UI that draws it, its size (S, M, L or Wide) and its data as the \`\`\`ui block held it.`,
    parts.join('\n\n') || '(No cards yet.)',
    'To change it: save_board with this id: cards to add more (each {ui, data, title?, size?}, checked against its UI as find_ui says), change ([{id, title?, size?, data?}]), remove ([ids]) and order ([ids] in their new order). A card’s data is a copy of what was pinned: to bring it up to date, give its new data in change.',
  ].join('\n\n');
}

// ---- what save_board does ------------------------------------------------------------------------------------

export const SAVE_BOARD_DESCRIPTION = [
  'Keep answer cards on a board in the user’s Library: a page of cards in a grid (the same cards as ```ui blocks draw in replies: charts, stats, weather, tables, checklists…) that they come back to, instead of asking for the same thing again ("this week’s sales", "my reading streak").',
  'Offer one when the user wants to keep answers together, and use it when they ask ("pin this to my Shop board", "make me a board of my GPU usage, my experiments and the weather").',
  'The user pins cards themselves from a reply (a card’s … → Pin to a board); you add them here.',
  'Make a board with title and cards; add to one with id (get_page lists boards) or board (its name: a new board of that name is made when there is none).',
  'Each card is {ui: an answer UI’s name, data: its data, the JSON object a ```ui block of it holds, title?: its title on the board (its data’s title when left out), size?: s|m|l|wide (S a quarter of the width on a computer, M a third, L a half, Wide all of it; one column on a phone)}.',
  'Call find_ui first for the UIs you use (names or what they show): each card’s data is checked against its UI’s type as find_ui gives it, and a card that does not fit is refused, saying why.',
  'With id: change ([{id, title?, size?, data?}]), remove ([card ids]) and order ([card ids], the new order) change the cards it has; cards adds new ones at the end (or at: their place from 1).',
  'A card keeps a copy of its data as it was given: to bring one up to date, give its new data in change.',
  `Give each new board a description (under 100 words): the Library shows it and its search finds the board by it.`,
].join(' ');

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    ui: { type: 'string', description: 'The answer UI that draws it, by its name (find_ui): "chart", "stats", "weather"…' },
    data: { type: 'object', description: 'Its data: the JSON object a ```ui block of that UI holds.' },
    title: { type: 'string', description: 'Its title on the board; left out, its data’s title.' },
    size: { type: 'string', enum: CARD_SIZES, description: 's, m, l or wide: a quarter, a third, a half or the whole width on a computer.' },
  },
  required: ['ui', 'data'],
};

export const SAVE_BOARD_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved board’s id (get_page lists them), to change it or add to it.' },
    board: { type: 'string', description: 'Instead of id: a board by its name ("Shop"); a new board of that name is made when there is none.' },
    title: { type: 'string', description: 'A new board’s name ("Shop", "This week"); with id, a new name for it.' },
    cards: { type: 'array', items: CARD_SCHEMA, description: `Cards to put on it, in order (at most ${BOARD_LIMITS.cards} on a board).` },
    at: { type: 'number', description: 'With id: where the new cards go, from 1 (at the end when left out).' },
    change: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, size: { type: 'string', enum: CARD_SIZES }, data: { type: 'object' } }, required: ['id'] },
      description: 'With id: cards to change, by their ids (get_page lists them): a new title, size or data.',
    },
    remove: { type: 'array', items: { type: 'string' }, description: 'With id: cards to take off, by their ids.' },
    order: { type: 'array', items: { type: 'string' }, description: 'With id: the cards’ ids in their new order (those left out keep their places after them).' },
  },
};

/** An agent's save_board on a board as it is (`prev`: none for a new one): the board it makes, and what it did, said. */
export function agentBoard(prev: Board | null, a: Record<string, unknown>, from: BoardCard['from']): { board: Board; said: string[] } {
  return plain(() => {
    const board: Board = prev ? { format: 1, cards: [...prev.cards] } : newBoard();
    const said: string[] = [];
    const known = (id: unknown, what: string) => {
      const i = board.cards.findIndex((c) => c.id === String(id));
      if (i < 0) throw new CardError(`${what}: the board has no card ${JSON.stringify(id)} (get_page lists its cards and their ids).`);
      return i;
    };
    if (Array.isArray(a.remove) && a.remove.length) {
      if (!prev) throw new CardError('remove changes a saved board: give its id.');
      const ids = new Set(a.remove.map(String));
      for (const id of ids) known(id, 'remove');
      board.cards = board.cards.filter((c) => !ids.has(c.id));
      said.push(`took off ${ids.size} card${ids.size === 1 ? '' : 's'}`);
    }
    if (Array.isArray(a.change) && a.change.length) {
      if (!prev) throw new CardError('change changes a saved board: give its id.');
      for (const ch of a.change) {
        if (!isObj(ch)) throw new CardError('change: each is {id, title?, size?, data?}.');
        const i = known(ch.id, 'change');
        const c = board.cards[i];
        if (ch.size !== undefined && !CARD_SIZES.includes(ch.size as CardSize)) throw new CardError(`Card ${c.id}: size is s, m, l or wide.`);
        const next = checkCard({ ...c, ...(ch.title !== undefined ? { title: ch.title } : {}), ...(ch.size !== undefined ? { size: ch.size } : {}), ...(ch.data !== undefined ? { data: ch.data } : {}) }, { strict: ch.data !== undefined, label: `Card ${c.id}` });
        if (ch.data !== undefined) next.refreshedAt = Date.now();
        board.cards[i] = next;
      }
      said.push(`changed ${a.change.length} card${a.change.length === 1 ? '' : 's'}`);
    }
    if (Array.isArray(a.order) && a.order.length) {
      if (!prev) throw new CardError('order changes a saved board: give its id.');
      const ids = a.order.map(String);
      for (const id of ids) known(id, 'order');
      const first = ids.map((id) => board.cards.find((c) => c.id === id)!);
      board.cards = [...first, ...board.cards.filter((c) => !ids.includes(c.id))];
      said.push('put the cards in their new order');
    }
    if (a.cards !== undefined) {
      if (!Array.isArray(a.cards)) throw new CardError('cards: a list of cards, each {ui, data, title?, size?}.');
      const now = Date.now();
      const added = a.cards.map((c, i) => {
        const card = checkCard(isObj(c) ? { ...c, id: undefined, pinnedAt: undefined, refresh: undefined, refreshedAt: undefined } : c, { strict: true, label: `Card ${i + 1} of cards`, now });
        card.by = 'agent';
        if (from) card.from = from;
        return card;
      });
      if (board.cards.length + added.length > BOARD_LIMITS.cards)
        throw new CardError(`A board holds at most ${BOARD_LIMITS.cards} cards: it has ${board.cards.length}, and ${added.length} more would be too many. Make another board, or take some off (remove).`);
      const at = Number.isInteger(a.at) && (a.at as number) >= 1 ? Math.min(board.cards.length, (a.at as number) - 1) : board.cards.length;
      board.cards.splice(at, 0, ...added);
      if (added.length) said.push(`added ${added.map((c) => `“${cardTitle(c)}” (${c.ui}, ${SIZE_LABEL[c.size]})`).join(', ')}`);
    }
    // Each card its own id.
    const seen = new Set<string>();
    for (const c of board.cards) {
      while (seen.has(c.id)) c.id = `${c.id}x`;
      seen.add(c.id);
    }
    return { board, said };
  });
}

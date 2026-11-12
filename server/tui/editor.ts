// The chat's input line, an editor of its own in raw mode: the bytes a terminal sends turned into keys (arrows, Home
// and End in their several spellings, Alt and Ctrl with arrows, a paste between bracketed-paste marks arriving whole
// with its line breaks), and the text with its cursor changed by them (by characters as people see them, by words,
// across lines; history with ↑ and ↓; Enter sends, Alt+Enter, Ctrl+J or a `\` before Enter add a line). It is laid
// out in rows a width wide, the cursor's row and column with it, so the screen can put the cursor there, and after
// the cursor the grey rest of an earlier message that starts with the text.
import { graphemes, graphemeWidth, strWidth, type Paint } from './term.ts';

/** Keys that are only their name. */
export type Named =
  | 'enter'
  | 'newline'
  | 'tab'
  | 'shift-tab'
  | 'backspace'
  | 'delete'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'home'
  | 'end'
  | 'word-left'
  | 'word-right'
  | 'delete-word-back'
  | 'delete-word-fwd'
  | 'kill-end'
  | 'kill-start'
  | 'escape'
  | 'ctrl-c'
  | 'ctrl-d'
  | 'ctrl-l'
  | 'ctrl-r'
  | 'ctrl-z'
  | 'page-up'
  | 'page-down';

export type Key = { name: 'text'; text: string } | { name: 'paste'; text: string } | { name: Named };

const CTRL: Record<string, Named> = {
  '\r': 'enter',
  '\n': 'newline',
  '\t': 'tab',
  '\x7f': 'backspace',
  '\x08': 'backspace',
  '\x01': 'home',
  '\x05': 'end',
  '\x02': 'left',
  '\x06': 'right',
  '\x0b': 'kill-end',
  '\x15': 'kill-start',
  '\x17': 'delete-word-back',
  '\x03': 'ctrl-c',
  '\x04': 'ctrl-d',
  '\x0c': 'ctrl-l',
  '\x12': 'ctrl-r',
  '\x10': 'up',
  '\x0e': 'down',
  '\x1a': 'ctrl-z',
};

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

/** Turns what the terminal sends into keys; a paste may come over several reads. */
export class KeyReader {
  private paste: string | null = null;

  feed(s: string): Key[] {
    const out: Key[] = [];
    let i = 0;
    // Without bracketed paste, a paste is many characters with line breaks inside them in one read (a line and its
    // Enter in one read is typed, or sent by a program).
    if (this.paste === null && !s.includes('\x1b') && /[\r\n][^\r\n]/.test(s) && /[^\r\n]/.test(s)) {
      return [{ name: 'paste', text: s.replace(/\r\n?/g, '\n').replace(/\n$/, '') }];
    }
    let text = '';
    const flush = () => {
      if (text) out.push({ name: 'text', text });
      text = '';
    };
    while (i < s.length) {
      if (this.paste !== null) {
        const end = s.indexOf(PASTE_END, i);
        if (end < 0) {
          this.paste += s.slice(i);
          return out;
        }
        this.paste += s.slice(i, end);
        out.push({ name: 'paste', text: this.paste.replace(/\r\n?/g, '\n') });
        this.paste = null;
        i = end + PASTE_END.length;
        continue;
      }
      const c = s[i];
      if (c === '\x1b') {
        flush();
        if (s.startsWith(PASTE_START, i)) {
          this.paste = '';
          i += PASTE_START.length;
          continue;
        }
        const [key, len] = escape(s, i);
        if (key) out.push(key);
        i += len;
        continue;
      }
      const named = CTRL[c];
      if (named) {
        flush();
        out.push({ name: named });
        i++;
        continue;
      }
      if (c < ' ') {
        i++;
        continue;
      }
      text += c;
      i++;
    }
    flush();
    return out;
  }
}

/** An escape sequence at `i`: the key it is (or none, for one that means nothing here) and its length. */
function escape(s: string, i: number): [Key | null, number] {
  const next = s[i + 1];
  if (next === undefined) return [{ name: 'escape' }, 1];
  if (next === '[') {
    // CSI: parameters, then a final byte.
    let j = i + 2;
    while (j < s.length && !(s.charCodeAt(j) >= 0x40 && s.charCodeAt(j) <= 0x7e)) j++;
    const params = s.slice(i + 2, j);
    const fin = s[j];
    const len = j - i + 1;
    const mod = Number(params.split(';')[1] ?? 1);
    const alt = mod === 3 || mod === 4 || mod === 7 || mod === 8;
    const ctrl = mod === 5 || mod === 6 || mod === 7 || mod === 8;
    switch (fin) {
      case 'A':
        return [{ name: 'up' }, len];
      case 'B':
        return [{ name: 'down' }, len];
      case 'C':
        return [{ name: alt || ctrl ? 'word-right' : 'right' }, len];
      case 'D':
        return [{ name: alt || ctrl ? 'word-left' : 'left' }, len];
      case 'H':
        return [{ name: 'home' }, len];
      case 'F':
        return [{ name: 'end' }, len];
      case 'Z':
        return [{ name: 'shift-tab' }, len];
      case 'u': {
        // The kitty keyboard protocol: Enter with Shift or Alt adds a line.
        const [code, m] = params.split(';').map(Number);
        if (code === 13) return [{ name: m && m > 1 ? 'newline' : 'enter' }, len];
        if (code === 27) return [{ name: 'escape' }, len];
        return [null, len];
      }
      case '~': {
        const n = Number(params.split(';')[0]);
        if (n === 1 || n === 7) return [{ name: 'home' }, len];
        if (n === 4 || n === 8) return [{ name: 'end' }, len];
        if (n === 3) return [{ name: ctrl ? 'delete-word-fwd' : 'delete' }, len];
        if (n === 5) return [{ name: 'page-up' }, len];
        if (n === 6) return [{ name: 'page-down' }, len];
        if (n === 13 || n === 27) return [{ name: n === 13 ? 'newline' : 'escape' }, len];
        return [null, len];
      }
      default:
        return [null, len];
    }
  }
  if (next === 'O') {
    const fin = s[i + 2];
    const map: Record<string, Named> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };
    return [fin && map[fin] ? { name: map[fin] } : null, fin ? 3 : 2];
  }
  if (next === '\r' || next === '\n') return [{ name: 'newline' }, 2];
  if (next === '\x7f' || next === '\x08') return [{ name: 'delete-word-back' }, 2];
  if (next === 'b' || next === 'B') return [{ name: 'word-left' }, 2];
  if (next === 'f' || next === 'F') return [{ name: 'word-right' }, 2];
  if (next === 'd') return [{ name: 'delete-word-fwd' }, 2];
  if (next === '\x1b') return [{ name: 'escape' }, 1];
  // Alt with another key: nothing here.
  return [null, 2];
}

// ---- the text and its cursor ------------------------------------------------------------------------

/** Where the character before `i` starts (a character as people see it). */
function before(text: string, i: number): number {
  if (i <= 0) return 0;
  const gs = graphemes(text.slice(Math.max(0, i - 16), i));
  return i - (gs[gs.length - 1]?.length ?? 1);
}

/** Where the character at `i` ends. */
function after(text: string, i: number): number {
  if (i >= text.length) return text.length;
  return i + (graphemes(text.slice(i, i + 16))[0]?.length ?? 1);
}

const isSpace = (c: string) => /\s/.test(c);

/** The start of the word before `i` (spaces first, then the word). */
function wordBefore(text: string, i: number): number {
  let j = i;
  while (j > 0 && isSpace(text[j - 1])) j--;
  while (j > 0 && !isSpace(text[j - 1])) j--;
  return j;
}

/** The end of the word after `i`. */
function wordAfter(text: string, i: number): number {
  let j = i;
  while (j < text.length && isSpace(text[j])) j++;
  while (j < text.length && !isSpace(text[j])) j++;
  return j;
}

export type EditResult = 'submit' | 'changed' | 'history' | null;

export class LineEditor {
  text = '';
  cursor = 0;
  private at = -1;
  private draft = '';

  constructor(public history: string[] = []) {}

  set(text: string, cursor = text.length) {
    this.text = text;
    this.cursor = Math.max(0, Math.min(cursor, text.length));
  }

  clear() {
    this.set('');
    this.at = -1;
  }

  /** Puts text in at the cursor. */
  insert(s: string) {
    this.text = this.text.slice(0, this.cursor) + s + this.text.slice(this.cursor);
    this.cursor += s.length;
  }

  /** Replaces the text between `from` and the cursor (a completion). */
  replaceBefore(from: number, s: string) {
    this.text = this.text.slice(0, from) + s + this.text.slice(this.cursor);
    this.cursor = from + s.length;
  }

  /** The line the cursor is on: its start and end. */
  private lineBounds(): [number, number] {
    const start = this.text.lastIndexOf('\n', this.cursor - 1) + 1;
    const nl = this.text.indexOf('\n', this.cursor);
    return [start, nl < 0 ? this.text.length : nl];
  }

  /** Moves a line up or down, keeping the column as near as it can; false at the first or last line. */
  private moveLine(dir: -1 | 1): boolean {
    const [start, end] = this.lineBounds();
    const col = this.cursor - start;
    if (dir < 0) {
      if (start === 0) return false;
      const prevStart = this.text.lastIndexOf('\n', start - 2) + 1;
      this.cursor = Math.min(prevStart + col, start - 1);
    } else {
      if (end >= this.text.length) return false;
      const nextEnd = this.text.indexOf('\n', end + 1);
      this.cursor = Math.min(end + 1 + col, nextEnd < 0 ? this.text.length : nextEnd);
    }
    return true;
  }

  /** History: back (older) or forward; the line being written is kept to come back to. */
  private recall(dir: -1 | 1): boolean {
    if (!this.history.length) return false;
    if (dir < 0) {
      if (this.at === -1) {
        this.draft = this.text;
        this.at = this.history.length - 1;
      } else if (this.at > 0) this.at--;
      else return false;
      this.set(this.history[this.at]);
      return true;
    }
    if (this.at === -1) return false;
    if (this.at < this.history.length - 1) {
      this.at++;
      this.set(this.history[this.at]);
    } else {
      this.at = -1;
      this.set(this.draft);
    }
    return true;
  }

  /** Remembers a sent line (not twice in a row), keeping the last `max`. */
  remember(line: string, max = 500) {
    const t = line.trim() ? line : '';
    if (t && this.history[this.history.length - 1] !== t) this.history.push(t);
    if (this.history.length > max) this.history.splice(0, this.history.length - max);
    this.at = -1;
  }

  /** What a key does to the text: 'submit' for Enter on a line to send. */
  apply(k: Key): EditResult {
    const t = this.text;
    const c = this.cursor;
    switch (k.name) {
      case 'text':
        this.insert(k.text);
        return 'changed';
      case 'paste':
        this.insert(k.text.replace(/\t/g, '  '));
        return 'changed';
      case 'enter':
        // A `\` before Enter at the end of a line: a new line instead.
        if (c > 0 && t[c - 1] === '\\' && (c === t.length || t[c] === '\n')) {
          this.text = t.slice(0, c - 1) + '\n' + t.slice(c);
          return 'changed';
        }
        return 'submit';
      case 'newline':
        this.insert('\n');
        return 'changed';
      case 'backspace':
        if (!c) return null;
        this.text = t.slice(0, before(t, c)) + t.slice(c);
        this.cursor = before(t, c);
        return 'changed';
      case 'delete':
        if (c >= t.length) return null;
        this.text = t.slice(0, c) + t.slice(after(t, c));
        return 'changed';
      case 'left':
        this.cursor = before(t, c);
        return 'changed';
      case 'right':
        this.cursor = after(t, c);
        return 'changed';
      case 'home':
        this.cursor = this.lineBounds()[0];
        return 'changed';
      case 'end':
        this.cursor = this.lineBounds()[1];
        return 'changed';
      case 'word-left':
        this.cursor = wordBefore(t, c);
        return 'changed';
      case 'word-right':
        this.cursor = wordAfter(t, c);
        return 'changed';
      case 'delete-word-back': {
        const j = wordBefore(t, c);
        this.text = t.slice(0, j) + t.slice(c);
        this.cursor = j;
        return 'changed';
      }
      case 'delete-word-fwd':
        this.text = t.slice(0, c) + t.slice(wordAfter(t, c));
        return 'changed';
      case 'kill-end': {
        const end = this.lineBounds()[1];
        this.text = t.slice(0, c) + t.slice(end === c && c < t.length ? c + 1 : end);
        return 'changed';
      }
      case 'kill-start': {
        const start = this.lineBounds()[0];
        this.text = t.slice(0, start) + t.slice(c);
        this.cursor = start;
        return 'changed';
      }
      case 'up':
        if (this.moveLine(-1)) return 'changed';
        return this.recall(-1) ? 'history' : null;
      case 'down':
        if (this.moveLine(1)) return 'changed';
        return this.recall(1) ? 'history' : null;
      default:
        return null;
    }
  }
}

// ---- the grey suggestion from history ------------------------------------------------------------------------------

/** The rest of the newest earlier message that starts with the text (one line of 2 or more characters, the cursor at its end), or ''. */
export function ghostOf(text: string, cursor: number, history: string[]): string {
  if (cursor !== text.length || text.length < 2 || text.includes('\n')) return '';
  for (let i = history.length - 1; i >= 0; i--) if (history[i].length > text.length && history[i].startsWith(text)) return history[i].slice(text.length);
  return '';
}

/** The next word of a suggestion (the spaces before it with it); all of it when there is only space left. */
export function ghostWord(ghost: string): string {
  return /^\s*\S+/.exec(ghost)?.[0] ?? ghost;
}

// ---- laying it out ----------------------------------------------------------------------------------

export interface Layout {
  rows: string[];
  cursorRow: number;
  cursorCol: number;
}

/**
 * The text as rows `width` columns wide (each row at most width - 1, so the terminal never wraps one), the first after
 * `prompt` and the rest after as many spaces; the cursor's row and column. At most `maxRows` rows show, around the
 * cursor, with a dim line saying how many more there are. `ghost`: the rest of an earlier message, shown dim after the
 * cursor at the end of one line of text (cut to the row; the cursor stays where it is).
 */
export function layout(text: string, cursor: number, width: number, o: { prompt: string; placeholder?: string; maxRows?: number; ghost?: string; p: Paint }): Layout {
  const promptW = strWidth(o.prompt);
  const indent = ' '.repeat(promptW);
  const room = Math.max(4, width - 1 - promptW);
  const rows: string[] = [];
  let cursorRow = 0;
  let cursorCol = promptW;
  if (!text && o.placeholder) {
    return { rows: [o.prompt + o.p.dim(truncateTo(o.placeholder, room))], cursorRow: 0, cursorCol: promptW };
  }
  let pos = 0;
  const lines = text.split('\n');
  lines.forEach((line) => {
    let row = '';
    let w = 0;
    const lead = () => (rows.length === 0 ? o.prompt : indent);
    let i = pos;
    const gs = graphemes(line);
    let placed = false;
    for (const g of gs) {
      const gw = graphemeWidth(g);
      if (w + gw > room) {
        rows.push(lead() + row);
        row = '';
        w = 0;
      }
      if (i === cursor && !placed) {
        cursorRow = rows.length;
        cursorCol = promptW + w;
        placed = true;
      }
      row += g;
      w += gw;
      i += g.length;
    }
    if (!placed && cursor === pos + line.length) {
      // At the line's end: on a new row when this one is full.
      if (w >= room) {
        rows.push(lead() + row);
        row = '';
        w = 0;
      }
      cursorRow = rows.length;
      cursorCol = promptW + w;
    }
    rows.push(lead() + row);
    pos += line.length + 1;
  });
  if (o.ghost && cursor === text.length && lines.length === 1) {
    // After the cursor, on its row only.
    const cut = truncateTo(o.ghost.replace(/\n/g, '↵'), width - 1 - cursorCol);
    if (cut) rows[cursorRow] += o.p.dim(cut);
  }
  const max = o.maxRows ?? 12;
  if (rows.length <= max) return { rows, cursorRow, cursorCol };
  // A window around the cursor, with how much is above and below it.
  const show = max - 1;
  let top = Math.max(0, Math.min(cursorRow - Math.floor(show / 2), rows.length - show));
  const shown = rows.slice(top, top + show);
  const above = top;
  const below = rows.length - top - show;
  const note = o.p.dim(`${indent}${[above ? `${above} more above` : '', below ? `${below} more below` : ''].filter(Boolean).join(' · ')}`);
  if (above && !below) {
    shown.unshift(note);
    top--;
    return { rows: shown.slice(0, max), cursorRow: cursorRow - top, cursorCol };
  }
  shown.push(note);
  return { rows: shown, cursorRow: cursorRow - top, cursorCol };
}

function truncateTo(s: string, w: number): string {
  let out = '';
  let n = 0;
  for (const g of graphemes(s)) {
    const gw = graphemeWidth(g);
    if (n + gw > w) break;
    out += g;
    n += gw;
  }
  return out;
}

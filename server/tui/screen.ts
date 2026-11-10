// The chat's screen: the terminal's own scrollback, with one region at the bottom redrawn while the agent works (what
// is still streaming, the step under way, a card waiting for you, the input line). Lines printed above it stay as
// they are. Each redraw is one write, inside synchronized output and with the cursor hidden, rewriting the region's
// rows in place; rows are kept a column short of the width so the terminal never wraps one. On a resize the region's
// old rows are counted again at the new width (terminals that reflow move them) before it is drawn again. The
// terminal is taken into raw mode with bracketed paste on, and given back as it was on every way out.
import { strWidth, truncate } from './term.ts';

export interface Cursor {
  row: number;
  col: number;
}

export class Screen {
  /** The widths of the region's rows as last drawn, and the row the cursor was left on. */
  private drawn: number[] = [];
  private cursorRow = 0;
  private cursorCol = 0;
  private region: string[] = [];
  private cursor: Cursor | null = null;
  private width: number;

  constructor(private out: NodeJS.WriteStream) {
    this.width = out.columns || 80;
  }

  get columns() {
    return this.out.columns || 80;
  }

  get rows() {
    return this.out.rows || 24;
  }

  /** Lines printed for good above the region (which is drawn again under them). */
  print(lines: string[]) {
    if (!lines.length) return;
    this.draw(lines, true);
  }

  /** The region drawn again with these rows, the cursor at `cursor` (hidden when null). */
  render(region: string[], cursor: Cursor | null) {
    this.region = region;
    this.cursor = cursor;
    this.draw([], false);
  }

  /** The terminal changed size: the region is drawn again at the new width. */
  resized() {
    const w = this.columns;
    if (w < this.width) {
      // Rows that were wider than the new width now take more rows (terminals that reflow): count them so.
      let above = 0;
      for (let i = 0; i < this.cursorRow; i++) above += Math.max(1, Math.ceil((this.drawn[i] ?? 0) / w));
      this.cursorRow = above + Math.floor(this.cursorCol / w);
    }
    this.width = w;
    this.draw([], true);
  }

  /** Takes the region away (before leaving, or before a program of its own takes the terminal). */
  clear() {
    let s = '\x1b[?25l';
    if (this.cursorRow > 0) s += `\x1b[${this.cursorRow}A`;
    s += '\r\x1b[J\x1b[?25h';
    this.out.write(s);
    this.drawn = [];
    this.cursorRow = 0;
  }

  /** Forgets the region (it is no longer on the screen: the screen was cleared). */
  forget() {
    this.drawn = [];
    this.cursorRow = 0;
  }

  private draw(perm: string[], clearFirst: boolean) {
    const width = this.columns;
    const height = this.rows;
    let rows = this.region.map((l) => (strWidth(l) > width - 1 ? truncate(l, width - 1) : l));
    let cursor = this.cursor;
    // Never taller than the screen: the bottom rows (where the input is) stay.
    if (rows.length > height - 1) {
      const cut = rows.length - (height - 1);
      rows = rows.slice(cut);
      if (cursor) cursor = { row: Math.max(0, cursor.row - cut), col: cursor.col };
    }
    let s = '\x1b[?2026h\x1b[?25l';
    if (this.cursorRow > 0) s += `\x1b[${this.cursorRow}A`;
    s += '\r';
    if (clearFirst || perm.length) s += '\x1b[J';
    for (const l of perm) s += `${l}\x1b[0m\n`;
    rows.forEach((l, i) => {
      s += `\x1b[2K${l}\x1b[0m`;
      if (i < rows.length - 1) s += '\n';
    });
    s += '\x1b[J';
    const last = Math.max(0, rows.length - 1);
    if (cursor && rows.length) {
      const up = last - cursor.row;
      if (up > 0) s += `\x1b[${up}A`;
      s += '\r';
      if (cursor.col > 0) s += `\x1b[${Math.min(cursor.col, width - 1)}C`;
      s += '\x1b[?25h';
      this.cursorRow = cursor.row;
      this.cursorCol = Math.min(cursor.col, width - 1);
    } else {
      this.cursorRow = last;
      this.cursorCol = strWidth(rows[last] ?? '');
    }
    s += '\x1b[?2026l';
    this.out.write(s);
    this.drawn = rows.map((r) => strWidth(r));
  }
}

/**
 * Takes the terminal for the chat: raw mode, bracketed paste on. The function it returns gives it back (the cursor
 * shown, paste marks off, raw mode off); it runs on every way out too: the process ending, SIGTERM and SIGHUP, a crash.
 */
export function takeTerminal(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): () => void {
  let given = false;
  const give = () => {
    if (given) return;
    given = true;
    try {
      stdout.write('\x1b[?2004l\x1b[?25h\x1b[?2026l\x1b[0m');
    } catch {}
    try {
      if (stdin.isTTY) stdin.setRawMode(false);
    } catch {}
    stdin.pause();
  };
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  stdout.write('\x1b[?2004h');
  process.on('exit', give);
  for (const sig of ['SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      give();
      process.exit(sig === 'SIGTERM' ? 143 : 129);
    });
  }
  process.once('uncaughtException', (e) => {
    give();
    process.stderr.write(`\n${(e as Error).stack ?? e}\n`);
    process.exit(1);
  });
  process.once('unhandledRejection', (e) => {
    give();
    process.stderr.write(`\n${(e as Error)?.stack ?? e}\n`);
    process.exit(1);
  });
  return give;
}

/** Hands the terminal back for a moment (Ctrl+Z), then takes it again when the shell brings the chat back. */
export function suspend(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream, onBack: () => void) {
  stdout.write('\x1b[?2004l\x1b[?25h');
  if (stdin.isTTY) stdin.setRawMode(false);
  process.once('SIGCONT', () => {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdout.write('\x1b[?2004h');
    onBack();
  });
  process.kill(process.pid, 'SIGTSTP');
}

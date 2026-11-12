// A small picker for commands that run on their own at a prompt (`hydor projects show` with no project): a list with
// ↑↓ to move, typing to filter, Enter to pick, Esc to back out. It draws on stderr (so what the command prints can go
// to a file) and needs a terminal; the pure parts (the state, its keys, its lines) are separate so they can be checked
// without one. The chat has its own picker, built into its screen.
import type { PickItem } from './areas/kit.ts';
import { UsageError } from './areas/kit.ts';
import { KeyReader, type Key } from './editor.ts';
import { takeTerminal } from './screen.ts';
import { asciify, asciiWanted, graphemes, strWidth, truncate, type Paint } from './term.ts';

export interface PickerState {
  items: PickItem[];
  filter: string;
  /** The row chosen, among the items that fit the filter. */
  index: number;
}

/** The items whose label or hint holds every word of the filter (any case). */
export function visible(s: PickerState): PickItem[] {
  const words = s.filter.toLowerCase().split(/\s+/).filter(Boolean);
  return s.items.filter((i) => words.every((w) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(w)));
}

/** A key's effect on the state: 'pick' (Enter on a row), 'cancel', or nothing more to do. */
export function pickerKey(s: PickerState, key: Key, rows = 10): 'pick' | 'cancel' | null {
  const n = visible(s).length;
  const refilter = () => (s.index = 0);
  switch (key.name) {
    case 'enter':
      return n ? 'pick' : null;
    case 'escape':
    case 'ctrl-c':
    case 'ctrl-d':
      return 'cancel';
    case 'up':
      if (n) s.index = (s.index - 1 + n) % n;
      return null;
    case 'down':
    case 'tab':
      if (n) s.index = (s.index + 1) % n;
      return null;
    case 'page-up':
      s.index = Math.max(0, s.index - rows);
      return null;
    case 'page-down':
      s.index = Math.min(Math.max(0, n - 1), s.index + rows);
      return null;
    case 'home':
      s.index = 0;
      return null;
    case 'end':
      s.index = Math.max(0, n - 1);
      return null;
    case 'backspace':
      s.filter = graphemes(s.filter).slice(0, -1).join('');
      return (refilter(), null);
    case 'kill-start':
    case 'delete-word-back':
      s.filter = '';
      return (refilter(), null);
    case 'text':
    case 'paste':
      s.filter += key.text.replace(/[\r\n]+/g, ' ');
      return (refilter(), null);
    default:
      return null;
  }
}

/** The picker as lines: the title, the filter, a window of rows with the chosen one marked, and the keys. */
export function pickerLines(s: PickerState, title: string, p: Paint, width: number, rows = 10, ascii = false): string[] {
  const list = visible(s);
  const top = Math.max(0, Math.min(s.index - Math.floor(rows / 2), list.length - rows));
  const shown = list.slice(top, top + rows);
  const out = [p.bold(title), `${p.accent('›')} ${s.filter}${p.dim(s.filter ? '' : 'type to filter')}`];
  for (const [i, it] of shown.entries()) {
    const on = top + i === s.index;
    out.push(`${on ? p.accent('❯') : ' '} ${on ? p.bold(it.label) : it.label}${it.hint ? `  ${p.dim(it.hint)}` : ''}`);
  }
  if (!list.length) out.push(p.dim('  Nothing fits.'));
  else if (list.length > top + shown.length) out.push(p.dim(`  … ${list.length - top - shown.length} more`));
  out.push(p.dim('↑↓ move · type to filter · Enter picks · Esc cancels'));
  // In ASCII mode the symbols are mapped first, so the widths are those of what is drawn.
  return (ascii ? out.map(asciify) : out).map((l) => (strWidth(l) > width - 1 ? truncate(l, width - 1, ascii ? '...' : '…') : l));
}

/** Picks from a list on the terminal: the chosen item's value, or null when the person backs out. */
export function pickInTerminal(title: string, items: PickItem[], p: Paint, o: { stdin?: NodeJS.ReadStream; out?: NodeJS.WriteStream } = {}): Promise<string | null> {
  const stdin = o.stdin ?? process.stdin;
  const out = o.out ?? process.stderr;
  if (!stdin.isTTY || !out.isTTY) throw new UsageError('There is no terminal to pick on: give it as a word instead');
  const give = takeTerminal(stdin, out);
  const keys = new KeyReader();
  const state: PickerState = { items, filter: '', index: 0 };
  const ascii = asciiWanted(process.env, process.platform, out);
  let drawn = 0;
  const clear = () => {
    if (drawn) out.write(`\r${drawn > 1 ? `\x1b[${drawn - 1}A` : ''}\x1b[J`);
    drawn = 0;
  };
  const draw = () => {
    clear();
    const lines = pickerLines(state, title, p, out.columns || 80, Math.max(3, Math.min(10, (out.rows || 24) - 5)), ascii);
    out.write(lines.join('\n'));
    drawn = lines.length;
  };
  return new Promise((resolve) => {
    const finish = (value: string | null) => {
      stdin.off('data', on);
      clear();
      give();
      resolve(value);
    };
    const on = (chunk: string | Buffer) => {
      for (const key of keys.feed(String(chunk))) {
        const r = pickerKey(state, key);
        if (r === 'cancel') return finish(null);
        if (r === 'pick') return finish(visible(state)[state.index].value);
      }
      draw();
    };
    stdin.on('data', on);
    draw();
  });
}

// Command-line suggestions in the browser terminals. While a shell waits for a command, the likeliest
// rest of what you are typing shows in grey after the cursor: → or End takes it, Ctrl+→ one word.
// Ctrl+Space lists more: earlier commands (the ones run in this folder first), what fits the word
// being typed (branches, scripts, folders…), and a command a model writes from a plain description
// typed at the prompt. Nothing runs by itself: a pick only goes onto the line.
//
// The shell's line is read from the screen: the prompt ends where the cursor stood when you began
// typing, and the server says whether a shell (not vim, not python) is what is waiting.
import type { IDisposable, Terminal } from '@xterm/xterm';
import { api, post } from '../../lib/api';
import { useUI } from '../../lib/store';

export type SuggestKind = 'history' | 'agent' | 'branch' | 'script' | 'target' | 'host' | 'dir' | 'file' | 'subcommand' | 'ask' | 'ai';

export interface Suggestion {
  /** The whole line once picked. */
  text: string;
  /** What the list shows. */
  label: string;
  kind: SuggestKind;
  why?: string;
}

export interface GhostView {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  letterSpacing: number;
}

export interface MenuView {
  items: Suggestion[];
  sel: number;
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  /** Waiting to learn what the terminal runs. */
  busy?: boolean;
  /** A model is writing a command. */
  asking?: boolean;
  error?: string;
}

export interface SuggestView {
  ghost: GhostView | null;
  menu: MenuView | null;
}

interface HistoryEntry {
  cmd: string;
  cwd?: string;
  n: number;
  ts: number;
  src: 'typed' | 'shell' | 'agent';
}

// ---- history, shared by every terminal on the page -----------------------------------------------

let history: HistoryEntry[] = [];
let loadedAt = 0;
let loading = false;

function loadHistory() {
  if (loading || Date.now() - loadedAt < 120_000) return;
  loading = true;
  api<{ entries: HistoryEntry[] }>('/api/terminal-history')
    .then((r) => {
      history = r.entries;
      loadedAt = Date.now();
    })
    .catch(() => {})
    .finally(() => (loading = false));
}

function remember(cmd: string, cwd: string) {
  if (/^\s/.test(cmd) || !cmd.trim()) return;
  history.unshift({ cmd: cmd.trim(), cwd, n: 1, ts: Date.now(), src: 'typed' });
  post('/api/terminal-history', { cmd, cwd }).catch(() => {});
}

/** Earlier commands that start with the line, likeliest first: run here before elsewhere, recent and often before old. */
function fromHistory(line: string, cwd: string, limit: number): Suggestion[] {
  const now = Date.now();
  const best = new Map<string, { score: number; src: HistoryEntry['src'] }>();
  for (const e of history) {
    if (e.cmd.length <= line.length || !e.cmd.startsWith(line)) continue;
    const days = Math.max(0, now - e.ts) / 86_400_000;
    const score = (e.cwd === cwd ? 2.5 : 1) * (1 / (1 + days / 3)) * (1 + 0.5 * Math.log2(1 + e.n)) * (e.src === 'agent' ? 0.7 : 1);
    const b = best.get(e.cmd);
    if (!b || score > b.score) best.set(e.cmd, { score, src: e.src });
  }
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([cmd, b]) => ({ text: cmd, label: cmd, kind: b.src === 'agent' ? 'agent' : 'history' }));
}

// Keys that begin a command line: text (typed or pasted), Tab, Backspace, or ↑↓ through the history.
// Anything else the terminal sends (its replies to tmux's queries, focus changes, mouse) is not typing.
const TYPING = /^([^\x00-\x1f\x7f]+|\t|\x7f|\x1b\[[AB]|\x1bO[AB]|\x1b\[200~[\s\S]*\x1b\[201~)$/;

let charWidths: Record<string, number> = {};
function charWidth(font: string): number {
  if (charWidths[font]) return charWidths[font];
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  ctx.font = font;
  return (charWidths[font] = ctx.measureText('W').width);
}

export class Suggester {
  /** Where the prompt ends: its row (in the whole buffer), column and text. */
  private prompt: { row: number; col: number; text: string } | null = null;
  /** A new line is due: the next key typed marks where the prompt ends. */
  private fresh = true;
  private gen = 0;
  private ctx: { shell: boolean; program: string; cwd: string } | null = null;
  private ctxAt = 0;
  private compLine: string | null = null;
  private comps: { line: string; items: Suggestion[] } | null = null;
  private compTimer = 0;
  private menuOpen = false;
  private sel = 0;
  private ai: { line: string; items?: Suggestion[]; busy?: boolean; error?: string } | null = null;
  private current: { line: string; atEnd: boolean; ghost: Suggestion | null; items: Suggestion[] } | null = null;
  private memo: { key: string; ghost: Suggestion | null; items: Suggestion[] } | null = null;
  private last = '';
  private raf = 0;
  private subs: IDisposable[] = [];
  private unsub: () => void;

  constructor(
    private t: Terminal,
    private id: string,
    private box: HTMLElement,
    private send: (s: string) => void,
    private onView: (v: SuggestView) => void,
  ) {
    loadHistory();
    this.subs.push(
      t.onRender(() => this.schedule()),
      t.onScroll(() => this.schedule()),
      t.onResize(() => this.schedule()),
    );
    t.attachCustomKeyEventHandler((e) => this.onKey(e));
    this.unsub = useUI.subscribe((s, p) => s.termSuggest !== p.termSuggest && this.schedule());
  }

  dispose() {
    this.subs.forEach((s) => s.dispose());
    this.unsub();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.compTimer);
  }

  /** Everything typed, before it goes to the shell. */
  input(d: string) {
    if (/[\r\n]/.test(d)) {
      const r = d === '\r' ? this.read() : null;
      if (r && this.ctx?.shell) remember(r.line, this.ctx.cwd);
      return this.newLine();
    }
    // Ctrl+C, Ctrl+D, Ctrl+Z: whatever comes next starts afresh.
    if (d === '\x03' || d === '\x04' || d === '\x1a') return this.newLine();
    if (!TYPING.test(d)) return;
    if (this.fresh) this.learn();
    else if (!this.ctx?.shell && Date.now() - this.ctxAt > 1500) this.fetchContext();
  }

  /** A key from the phone key bar; true when it was used here. */
  key(seq: string): boolean {
    if (this.menuOpen && this.current) {
      if (seq === '\x1b[B') return (this.move(1), true);
      if (seq === '\x1b[A') return (this.move(-1), true);
      if (seq === '\t') return (this.choose(this.sel), true);
      if (seq === '\x1b') return (this.close(), true);
    }
    if (seq === '\x1b[C' && this.current?.ghost && this.current.atEnd) return (this.accept(false), true);
    return false;
  }

  toggle() {
    if (this.menuOpen) return this.close();
    if (this.fresh) this.learn();
    this.menuOpen = true;
    this.sel = 0;
    this.ai = null;
    this.memo = null;
    this.schedule();
  }

  /** Picks an item of the list (a click or tap). */
  pick(i: number) {
    this.choose(i);
    this.t.focus();
  }

  /** The screen was drawn afresh (a reconnect): learn the prompt again. */
  restart() {
    this.newLine();
  }

  private newLine() {
    this.fresh = true;
    this.prompt = null;
    this.ctx = null;
    this.gen++;
    this.menuOpen = false;
    this.ai = null;
    this.schedule();
  }

  private learn() {
    const b = this.t.buffer.active;
    const row = b.baseY + b.cursorY;
    this.prompt = { row, col: b.cursorX, text: b.getLine(row)?.translateToString(false, 0, b.cursorX) ?? '' };
    this.fresh = false;
    this.fetchContext();
  }

  private fetchContext() {
    const gen = this.gen;
    this.ctxAt = Date.now();
    api<{ shell: boolean; program: string; cwd: string }>(`/api/terminals/${this.id}/context`)
      .then((c) => {
        if (gen !== this.gen) return;
        this.ctx = c;
        this.memo = null;
        this.schedule();
      })
      .catch(() => {});
  }

  /** The command typed so far, and whether the cursor is at its end; null when it cannot be told. */
  private read(): { line: string; atEnd: boolean } | null {
    const p = this.prompt;
    if (!p || this.fresh) return null;
    const b = this.t.buffer.active;
    const cur = b.baseY + b.cursorY;
    let start = cur;
    while (start > 0 && b.getLine(start)?.isWrapped) start--;
    if (start !== p.row) {
      // The prompt was drawn again (completions listed above it, the screen cleared): find it by its text.
      const first = b.getLine(start)?.translateToString(false, 0, p.col) ?? '';
      if (!p.text.trim() || first !== p.text) return null;
      p.row = start;
    }
    if (cur === start && b.cursorX < p.col) return null;
    let line = '';
    let after = '';
    for (let r = start; ; r++) {
      const l = b.getLine(r);
      if (!l || (r > start && !l.isWrapped)) break;
      const from = r === start ? p.col : 0;
      if (r < cur) line += l.translateToString(false, from);
      else if (r === cur) {
        line += l.translateToString(false, from, b.cursorX);
        after += l.translateToString(true, b.cursorX);
      } else after += l.translateToString(true);
    }
    return { line, atEnd: !after.trim() };
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.update();
    });
  }

  private update() {
    const b = this.t.buffer.active;
    // The setting turns off the grey text only; Ctrl+Space still lists suggestions.
    const asYouType = useUI.getState().termSuggest !== false;
    const r = this.ctx?.shell && b.viewportY === b.baseY ? this.read() : null;
    if (!r || !this.ctx) {
      this.current = null;
      if (this.ctx && !this.ctx.shell) this.menuOpen = false;
      return this.emit({ ghost: null, menu: this.menuOpen ? this.menuView([], true) : null });
    }
    if (this.ai && this.ai.line !== r.line && !this.ai.busy) this.ai = null;
    this.requestCompletions(r.line);
    const comps = this.comps?.line === r.line ? this.comps.items : [];
    const key = `${r.line}\0${r.atEnd}\0${comps.length}\0${this.menuOpen}\0${asYouType}`;
    if (this.memo?.key !== key) {
      const hist = fromHistory(r.line, this.ctx.cwd, this.menuOpen ? 8 : 1);
      // fish suggests by itself; an empty line gets no grey text.
      const ghost = asYouType && r.atEnd && r.line.trim() && this.ctx.program !== 'fish' ? (hist[0] ?? (/\S$/.test(r.line) ? comps[0] : undefined)) ?? null : null;
      const items: Suggestion[] = [];
      if (this.menuOpen) {
        const seen = new Set<string>();
        for (const s of [...hist, ...comps.slice(0, 10)]) if (!seen.has(s.text) && items.length < 12) (seen.add(s.text), items.push(s));
        if (r.line.trim().length >= 3) items.push({ text: r.line, label: r.line.trim(), kind: 'ask' });
      }
      this.memo = { key, ghost: ghost && ghost.text.startsWith(r.line) && ghost.text.length > r.line.length ? ghost : null, items };
    }
    const items = this.ai ? (this.ai.items ?? []) : this.memo.items;
    this.sel = Math.max(0, Math.min(this.sel, items.length - 1));
    this.current = { line: r.line, atEnd: r.atEnd, ghost: this.memo.ghost, items };
    const g = this.memo.ghost && !this.menuOpen ? this.ghostView(this.memo.ghost.text.slice(r.line.length)) : null;
    this.emit({ ghost: g, menu: this.menuOpen ? this.menuView(items) : null });
  }

  private emit(v: SuggestView) {
    const s = JSON.stringify(v);
    if (s === this.last) return;
    this.last = s;
    this.onView(v);
  }

  private requestCompletions(line: string) {
    if (this.compLine === line) return;
    this.compLine = line;
    clearTimeout(this.compTimer);
    // Only the words after a command, or a path, have anything to complete.
    if (!/\S\s/.test(line) && !/\//.test(line)) {
      this.comps = { line, items: [] };
      return;
    }
    this.compTimer = window.setTimeout(() => {
      api<{ items: Suggestion[] }>(`/api/terminals/${this.id}/complete?line=${encodeURIComponent(line)}`)
        .then((r) => {
          this.comps = { line, items: r.items };
          this.schedule();
        })
        .catch(() => {});
    }, 140);
  }

  private metrics() {
    const screen = this.box.querySelector<HTMLElement>('.xterm-screen');
    if (!screen) return null;
    const sr = screen.getBoundingClientRect();
    const br = this.box.getBoundingClientRect();
    const cellW = sr.width / this.t.cols;
    const cellH = sr.height / this.t.rows;
    const font = `${this.t.options.fontSize ?? 13}px ${this.t.options.fontFamily}`;
    return { left: sr.left - br.left, top: sr.top - br.top, cellW, cellH, ls: cellW - charWidth(font) };
  }

  private ghostView(text: string): GhostView | null {
    const m = this.metrics();
    const b = this.t.buffer.active;
    const room = this.t.cols - b.cursorX;
    if (!m || room <= 0 || !text) return null;
    return { text: text.slice(0, room), left: m.left + b.cursorX * m.cellW, top: m.top + b.cursorY * m.cellH, width: room * m.cellW, height: m.cellH, letterSpacing: m.ls };
  }

  private menuView(items: Suggestion[], waiting = false): MenuView {
    const m = this.metrics();
    const b = this.t.buffer.active;
    const W = this.box.clientWidth;
    const H = this.box.clientHeight;
    const width = Math.min(520, W - 16);
    const rowTop = m ? m.top + b.cursorY * m.cellH : H / 2;
    const cellH = m?.cellH ?? 16;
    const left = Math.max(8, Math.min((m?.left ?? 0) + (this.prompt?.col ?? 0) * (m?.cellW ?? 8) - 8, W - width - 8));
    const below = H - (rowTop + cellH);
    const place = below >= 200 || below >= rowTop ? { top: rowTop + cellH + 4 } : { bottom: H - rowTop + 4 };
    return { items, sel: this.sel, left, width, ...place, busy: waiting, asking: this.ai?.busy, error: this.ai?.error };
  }

  private onKey(e: KeyboardEvent): boolean {
    const down = e.type === 'keydown';
    const mods = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'Space') {
      // Not at a shell prompt (vim, a REPL): the key is theirs.
      if (this.ctx && !this.ctx.shell) return true;
      if (down) this.toggle();
      return false;
    }
    if (this.menuOpen && this.current && !mods && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      if (down) {
        if (e.key === 'ArrowDown') this.move(1);
        else if (e.key === 'ArrowUp') this.move(-1);
        else if (e.key === 'Escape') this.close();
        else this.choose(this.sel);
      }
      return false;
    }
    if (this.menuOpen && e.key === 'Escape') {
      if (down) this.close();
      return false;
    }
    const c = this.current;
    if (c?.ghost && c.atEnd && !this.menuOpen && !e.metaKey && !e.shiftKey) {
      if (!e.ctrlKey && !e.altKey && (e.key === 'ArrowRight' || e.key === 'End')) {
        if (down) this.accept(false);
        return false;
      }
      if ((e.ctrlKey || e.altKey) && e.key === 'ArrowRight') {
        if (down) this.accept(true);
        return false;
      }
    }
    return true;
  }

  private move(d: number) {
    const n = this.current?.items.length ?? 0;
    if (!n) return;
    this.sel = (this.sel + d + n) % n;
    this.update();
  }

  private close() {
    this.menuOpen = false;
    this.ai = null;
    this.memo = null;
    this.schedule();
  }

  /** Takes the grey text, or its next word. */
  private accept(word: boolean) {
    const c = this.current;
    if (!c?.ghost) return;
    let rest = c.ghost.text.slice(c.line.length);
    if (word) rest = /^\s*[^\s/]+\/?/.exec(rest)?.[0] ?? rest;
    this.send(rest);
  }

  private choose(i: number) {
    const c = this.current;
    const s = c?.items[i];
    if (!c || !s) return;
    if (s.kind === 'ask') return this.ask(c.line);
    // The rest of the line when it carries on from what is typed; otherwise the line is replaced (Ctrl+E, Ctrl+U).
    if (c.atEnd && s.text.startsWith(c.line)) this.send(s.text.slice(c.line.length));
    else this.send('\x05\x15' + s.text);
    this.close();
  }

  private ask(line: string) {
    this.ai = { line, busy: true };
    this.sel = 0;
    this.schedule();
    post<{ commands: { command: string; why: string }[] }>(`/api/terminals/${this.id}/ask`, { text: line })
      .then((r) => {
        if (this.ai?.line !== line) return;
        this.ai = { line, items: r.commands.map((x) => ({ text: x.command, label: x.command, kind: 'ai', why: x.why })), error: r.commands.length ? undefined : 'No command came back. Try other words.' };
        this.schedule();
      })
      .catch((e) => {
        if (this.ai?.line !== line) return;
        this.ai = { line, error: (e as Error).message };
        this.schedule();
      });
  }
}

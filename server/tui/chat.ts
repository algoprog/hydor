// The chat: a conversation with an agent in the terminal's own scrollback (no full-screen mode: what was said stays
// above, selectable, over SSH and in tmux too). What is final is printed once; one region at the bottom is redrawn
// while the agent works: what still streams, the step under way, helpers at work, a card waiting for you (an
// approval, a question, a form), queued messages, a status line with a spinner, and the input line. Enter sends (a
// new session with the first message, then into it; queued while the agent works), slash commands change things or
// show them. With stdout not a terminal there is no region and no colour: each line typed is sent, the conversation
// printed as it becomes final.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Assistant } from '../../shared/assistants.ts';
import type { AppField } from '../../shared/apps.ts';
import type { AgentCatalog, AgentUsage, ApprovalRequest, Question, SessionSummary, TimelineItem } from '../../shared/types.ts';
import type { Opts } from './args.ts';
import { enc, type Conn } from './client.ts';
import { conversationLines, openBrowser, resolveKey, sessionLines, shortKey, statusWord, tierLines, usageLines, whyNoReply } from './commands.ts';
import { KeyReader, layout, LineEditor, type Key } from './editor.ts';
import { approvalBody, approvalKeys, approvalLines, approvalNeedsApp, choiceLine, INDENT, isDeny, itemLines, modelLabel, runningLine, stepLines, textLines, tierName, type Look } from './lines.ts';
import { busy, historyLines, Printer, SessionView } from './session.ts';
import { Screen, suspend, takeTerminal } from './screen.ts';
import { catalogOf, findAssistant, modeFor, modeLabel, newStartId, planStart, programName, startBody, tiersOf, type Boot, type Plan, type TiersState } from './start.ts';
import { colorWanted, elapsed, makePaint, money, tildify, truncate, wrap } from './term.ts';

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

/** The chat's own commands, for /help and Tab. */
const SLASH: { name: string; args?: string; what: string }[] = [
  { name: 'help', what: 'these commands and the keys' },
  { name: 'new', args: '[message]', what: 'a new session here' },
  { name: 'sessions', what: 'pick a session to carry on' },
  { name: 'model', args: '[name|auto]', what: 'the model (a list without a name)' },
  { name: 'effort', args: '[level]', what: 'how hard it thinks' },
  { name: 'mode', args: '[ask|edits|plan|full]', what: 'what it may do without asking' },
  { name: 'agent', args: '[name]', what: 'work as one of your agents' },
  { name: 'helpers', args: '[n]', what: 'the helpers (child sessions), or one’s conversation' },
  { name: 'tiers', what: 'which model each tier means' },
  { name: 'usage', what: 'plan usage and limits' },
  { name: 'cost', what: 'what this session and its helpers cost' },
  { name: 'stop', what: 'stop the turn' },
  { name: 'rename', args: '<title>', what: 'rename the session' },
  { name: 'open', what: 'its address in the web app' },
  { name: 'quit', what: 'leave (the session goes on in the app)' },
];

type Ui =
  | { kind: 'input' }
  | { kind: 'pick'; title: string; items: { label: string; hint?: string; value: string }[]; onPick: (v: string) => void | Promise<void> }
  | { kind: 'question'; a: ApprovalRequest; qi: number; picks: Record<string, { picks: string[]; other: string }> }
  | { kind: 'form'; a: ApprovalRequest; fi: number; values: Record<string, string> };

/** A question's answer as one string (QuestionForm.tsx answerOf): several picks joined with `sep`, your own words after them. */
export function answerOf(q: Question, p: { picks: string[]; other: string } | undefined, sep: string): string {
  if (!p) return '';
  const other = p.other.trim();
  if (!q.multiSelect) return other || (p.picks[0] ?? '');
  const vals = q.options.map((o) => o.label).filter((l) => p.picks.includes(l));
  if (other) vals.push(other);
  return vals.join(sep);
}

/** Where the input line's history is kept: the last 500 lines, one JSON string a line. */
async function historyFile(): Promise<string> {
  const { config } = await import('../config.ts');
  return path.join(config.dataDir, 'terminal-history');
}

function readHistory(file: string): string[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return String(JSON.parse(l));
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .slice(-500);
  } catch {
    return [];
  }
}

function keepHistory(file: string, line: string, all: string[]) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (all.length >= 500 && Math.random() < 0.1) fs.writeFileSync(file, all.slice(-500).map((l) => JSON.stringify(l)).join('\n') + '\n', { mode: 0o600 });
    else fs.appendFileSync(file, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch {}
}

export class Chat {
  private look: Look;
  private screen: Screen | null;
  private editor: LineEditor;
  private keys = new KeyReader();
  private view: SessionView | null = null;
  private printer: Printer;
  private plan!: Plan;
  private cat: AgentCatalog = { models: [], modes: [], defaultMode: '' };
  private prog: { agent: Plan['agent']; acpAgent?: string } = { agent: 'claude' };
  private tiers: TiersState | null = null;
  private ui: Ui = { kind: 'input' };
  private shown = new Set<string>();
  private pending: TimelineItem[] = [];
  private starting = 0;
  private notice: { text: string; until: number } | null = null;
  private quitArmed = 0;
  private completions: string[] = [];
  private frame = 0;
  private spinner: NodeJS.Timeout | null = null;
  private holding = false;
  private giveBack: (() => void) | null = null;
  private done!: (code: number) => void;
  private histFile = '';
  private busyAsk = false;
  /** A message sent: the turns ended and the items there were then, to tell a turn that ends with no reply. */
  private expect: { len: number; at: number; timer?: NodeJS.Timeout } | null = null;

  constructor(
    private conn: Conn,
    private o: Opts,
    private boot: Boot,
    private plain: boolean,
  ) {
    const out = process.stdout;
    this.look = { p: makePaint(!plain && colorWanted(out, o.noColor)), width: out.columns || 100, home: boot.home, verbose: o.verbose, thinking: o.thinking };
    this.screen = plain ? null : new Screen(out);
    this.editor = new LineEditor();
    this.printer = new Printer(this.look);
  }

  // ---- starting --------------------------------------------------------------------------------------------

  async run(key?: string, message?: string): Promise<number> {
    this.histFile = await historyFile();
    this.editor.history = readHistory(this.histFile);
    this.tiers = await tiersOf(this.conn);
    this.plan = await planStart(this.conn, this.o, this.boot, this.tiers);
    this.prog = { agent: this.plan.agent, acpAgent: this.plan.acpAgent };
    this.cat = await catalogOf(this.conn, this.prog.agent, this.prog.acpAgent);
    this.look.cwd = this.plan.cwd;
    this.look.models = this.cat.models;
    const ended = new Promise<number>((r) => (this.done = r));
    if (key) await this.openView(key, true);
    else this.write(this.headerLines());
    if (this.plain) this.plainInput();
    else {
      this.giveBack = takeTerminal(process.stdin, process.stdout);
      process.stdin.on('data', (d: string) => this.onData(d));
      process.stdout.on('resize', () => {
        this.look.width = process.stdout.columns || 100;
        this.screen!.resized();
        this.render();
      });
      process.on('SIGINT', () => this.ctrlC());
      this.render();
    }
    if (message) void this.submit(message);
    return ended;
  }

  /** The head of a new chat: the app, its version, the folder, the program, model and mode. */
  private headerLines(): string[] {
    const { p, width } = this.look;
    const s = this.view?.summary;
    const where = tildify(s?.cwd ?? this.plan.cwd ?? this.boot.defaultCwd, this.boot.home);
    const model = this.view ? modelLabel(this.view.live?.model ?? s?.model, this.cat.models) : this.plan.model ? modelLabel(this.plan.model, this.cat.models) : (this.cat.models.find((m) => m.isDefault)?.label ?? '');
    const mode = modeLabel(this.view ? (this.view.live?.mode ?? s?.prefs?.mode) : this.plan.mode, this.cat);
    const who = [this.plan.assistant && this.plan.assistant.id !== 'general' && !this.view ? this.plan.assistant.name : '', programName(this.prog.agent, this.prog.acpAgent, this.boot.acpAgents), model, mode].filter(Boolean).join(' · ');
    const left = ` ${p.bold(p.accent('HYDΩR'))} ${p.dim(this.conn.version)}   ${where}   ${who}`;
    const right = p.dim('/help');
    const gap = Math.max(2, width - 1 - [left, right].reduce((a, x) => a + truncate(x, width).length - (x.length - x.replace(/\x1b\[[0-9;]*m/g, '').length), 0));
    const head = truncate(left, width - 7) + ' '.repeat(Math.max(2, Math.min(gap, width))) + right;
    const lines = [truncate(head, width - 1), p.dim('─'.repeat(Math.max(10, width - 1)))];
    if (!this.conn.local) lines.splice(1, 0, p.dim(` on ${this.conn.base}`));
    return lines;
  }

  /** Follows a session: its conversation so far (the last turns, with `history`), then what comes. */
  private async openView(key: string, history: boolean) {
    this.view?.close();
    this.holding = true;
    const view = new SessionView(this.conn, key, { limit: 600, poll: 5000 });
    this.view = view;
    view.on('change', () => this.update());
    try {
      await view.open();
    } catch (e) {
      this.holding = false;
      this.view = null;
      this.say(this.look.p.red(`Could not open it: ${(e as Error).message}`));
      return;
    }
    const s = view.summary;
    if (s && (s.agent !== this.prog.agent || (s.acpAgent ?? undefined) !== this.prog.acpAgent)) {
      this.prog = { agent: s.agent, acpAgent: s.acpAgent };
      this.cat = await catalogOf(this.conn, s.agent, s.acpAgent);
      this.look.models = this.cat.models;
    }
    if (s?.cwd) this.look.cwd = s.cwd;
    if (history) {
      // Another session: printed from its history on, by a printer of its own.
      this.printer = new Printer(this.look);
      const lines = [...this.headerLines(), p(this.look).bold(s?.title || '(untitled)'), ''];
      lines.push(...historyLines(view.items, view.notes, this.look, { turns: 3 }));
      this.write(lines);
      this.printer.skipAll(view);
      // Cards already waiting show again below.
    }
    this.holding = false;
    this.update();
  }

  // ---- drawing ---------------------------------------------------------------------------------------------

  /** Lines printed for good (above the region, or to stdout when there is none). */
  private write(lines: string[]) {
    if (!lines.length) return;
    if (this.screen) this.screen.print(lines);
    else process.stdout.write(`${lines.join('\n')}\n`);
  }

  /** A line of the chat's own (a command's answer), with a blank line before it. */
  private say(...lines: string[]) {
    this.write(this.printer.aside(lines));
    this.render();
  }

  /** A short note in the region for a few seconds ("Ctrl+C again to leave", an error). */
  private flash(text: string, ms = 4000) {
    this.notice = { text, until: Date.now() + ms };
    if (this.plain) process.stderr.write(`${text}\n`);
    this.render();
    setTimeout(() => this.render(), ms + 50).unref?.();
  }

  /** New final lines printed, cards that came printed, and the region drawn again. */
  private update() {
    if (this.holding || !this.view) return this.render();
    const view = this.view;
    const { lines, pending } = this.printer.take(view);
    this.pending = pending;
    const out = [...lines];
    for (const a of view.overlay.approvals) {
      if (this.shown.has(a.id)) continue;
      this.shown.add(a.id);
      const card = approvalLines(a, this.look);
      const why = approvalNeedsApp(a);
      if (why) card.push(`${INDENT}  ${this.look.p.yellow(`${why}: answer it in the app, ${this.conn.url(view.key)}`)}`);
      out.push(...this.printer.aside(card));
      if (a.kind === 'question' && a.questions?.length) this.ui = { kind: 'question', a, qi: 0, picks: {} };
      else if (a.form?.fields.length) this.ui = { kind: 'form', a, fi: 0, values: Object.fromEntries(a.form.fields.map((f) => [f.id, f.default ?? ''])) };
      if (this.plain) out.push(...this.cardPrompt());
    }
    // A card answered elsewhere (the web app, or the turn ended) goes away here too.
    if ((this.ui.kind === 'question' || this.ui.kind === 'form') && !view.overlay.approvals.some((a) => a.id === (this.ui as { a: ApprovalRequest }).a.id)) this.ui = { kind: 'input' };
    this.write(out);
    this.checkReply();
    this.tickSpinner();
    this.render();
  }

  /**
   * A message of yours that came to nothing a few seconds on (a usage limit, an error at its start: the agent may
   * answer so fast it never shows as working): a line saying why.
   */
  private checkReply() {
    const view = this.view;
    const e = this.expect;
    if (!view || !e || busy(view.live) || this.starting) return;
    if (view.items.slice(e.len).some((i) => i.kind === 'assistant' || i.kind === 'turn' || i.kind === 'system') || view.overlay.items.some((i) => i.kind === 'assistant')) {
      this.expect = null;
      return;
    }
    const wait = e.at + 3000 - Date.now();
    if (wait > 0) {
      if (!e.timer) e.timer = setTimeout(() => ((e.timer = undefined), this.checkReply()), wait + 50);
      return;
    }
    this.expect = null;
    void whyNoReply(this.conn, view, this.prog.agent).then((why) => {
      if (this.view === view) this.say(`${INDENT}${this.look.p.red('✗')} ${this.look.p.red(why)}`);
    });
  }

  private working(): boolean {
    return this.starting > 0 || busy(this.view?.live);
  }

  private tickSpinner() {
    const on = !this.plain && (this.working() || !!this.view?.helpersWorking().length);
    if (on && !this.spinner) {
      this.spinner = setInterval(() => {
        this.frame = (this.frame + 1) % SPIN.length;
        this.render();
      }, 100);
    } else if (!on && this.spinner) {
      clearInterval(this.spinner);
      this.spinner = null;
    }
  }

  /** The region's rows: the work under way, helpers, a card's choices, the queue, the status line, the input. */
  private render() {
    if (!this.screen) return;
    const look = { ...this.look, width: this.screen.columns };
    const { p, width } = look;
    const height = this.screen.rows;
    const rows: string[] = [''];
    const view = this.view;
    const frame = SPIN[this.frame];
    // What is under way.
    if (view && this.pending.length) {
      const live: string[] = [];
      for (const it of this.pending) {
        if (it.kind === 'assistant') {
          const rest = this.printer.rest(it);
          if (rest.trim()) live.push(...textLines(rest, look));
        } else if (it.kind === 'tool') live.push(it.tool.status === 'running' || it.tool.status === 'pending' ? runningLine(it, look, frame) : stepLines(it, look)[0]);
        else if (it.kind === 'thinking') {
          const head = it.text.trim().match(/^\*\*(.+?)\*\*/)?.[1];
          live.push(truncate(`${INDENT}${p.dim(`∴ Thinking${head ? ` · ${head}` : ''}${it.ts ? ` · ${elapsed(it.ts)}` : ''}`)}`, width));
        } else live.push(...itemLines(it, look));
      }
      const max = Math.max(3, Math.floor(height / 2) - 4);
      rows.push(...(live.length > max ? [p.dim(`${INDENT}…`), ...live.slice(-(max - 1))] : live));
    }
    if (view) {
      const helpers = view.helpersWorking();
      if (helpers.length) rows.push(truncate(`${INDENT}${p.accent('◆')} ${p.dim(`${helpers.length === 1 ? '1 helper works' : `${helpers.length} helpers work`}: ${helpers.map((h) => h.note.title).join(' · ')}`)}`, width));
    }
    rows.push(...this.cardRows(look));
    for (const q of (view?.summary?.queue ?? []).slice(0, 3)) rows.push(truncate(`${INDENT}${p.dim(`⧗ queued: ${q.text.replace(/\s+/g, ' ')}`)}`, width));
    if ((view?.summary?.queue?.length ?? 0) > 3) rows.push(`${INDENT}${p.dim(`⧗ and ${view!.summary!.queue!.length - 3} more`)}`);
    if (this.working()) {
      const l = view?.live;
      const waiting = l?.status === 'waiting' || !!view?.overlay.approvals.length;
      const word = this.starting ? 'Starting' : waiting ? 'Needs you' : l?.status === 'starting' ? 'Starting' : l?.status === 'stopping' ? 'Stopping' : 'Working';
      const since = l?.turnStartedAt ?? (this.starting || undefined);
      const left = waiting ? `${p.yellow('◌')} ${p.yellow(word)}` : `${p.accent(frame)} ${word}`;
      rows.push(truncate(`${left}${p.dim(`${since ? ` · ${elapsed(since)}` : ''} · esc to stop`)}`, width));
    } else if (view?.helpersWorking().length) rows.push(truncate(`${p.accent(frame)} ${p.dim('Helpers at work: their replies wake the agent')}`, width));
    if (this.notice && this.notice.until > Date.now()) rows.push(truncate(`${INDENT}${this.notice.text}`, width));
    if (this.completions.length) rows.push(...wrap(p.dim(this.completions.join('  ')), width - 1, { first: INDENT, indent: INDENT }).slice(0, 3));
    const placeholder = this.placeholder();
    const lay = layout(this.editor.text, this.editor.cursor, width, { prompt: `${p.accent('›')} `, placeholder, maxRows: Math.max(3, Math.floor(height / 3)), p });
    const top = rows.length;
    rows.push(...lay.rows);
    this.screen.render(rows, { row: top + lay.cursorRow, col: lay.cursorCol });
  }

  private placeholder(): string {
    const a = this.view?.overlay.approvals[0];
    if (this.ui.kind === 'pick') return 'Its number, then Enter · Esc to cancel';
    if (this.ui.kind === 'question') return 'A number picks · your own words, then Enter · Esc skips';
    if (this.ui.kind === 'form') return 'Your answer, then Enter · Esc declines';
    if (a) return 'A key above answers · or say what to do instead, then Enter';
    if (this.working()) return 'Queue a message: it goes when the turn ends';
    return this.view ? 'Message the agent · /help' : 'What should the agent do? · /help';
  }

  /** The rows of the card waiting for you: an approval's choices, a question, a form's field, a list to pick from. */
  private cardRows(look: Look): string[] {
    const { p, width } = look;
    const ui = this.ui;
    if (ui.kind === 'pick') {
      const out = [truncate(`${INDENT}${p.bold(ui.title)}`, width)];
      const room = Math.max(3, this.screen!.rows - 8);
      ui.items.slice(0, room).forEach((it, i) => out.push(truncate(`${INDENT}  ${p.accent(String(i + 1).padStart(2))}  ${it.label}${it.hint ? p.dim(`  ${it.hint}`) : ''}`, width)));
      if (ui.items.length > room) out.push(`${INDENT}  ${p.dim(`… ${ui.items.length - room} more`)}`);
      return out;
    }
    if (ui.kind === 'question') {
      const q = ui.a.questions![ui.qi];
      const pick = ui.picks[q.id] ?? { picks: [], other: '' };
      const n = ui.a.questions!.length;
      const head = `${n > 1 ? p.dim(`${ui.qi + 1}/${n} `) : ''}${q.header ? p.dim(`${q.header}: `) : ''}${p.bold(q.question)}`;
      const out = wrap(head, width, { first: `${INDENT}${p.yellow('?')} `, indent: `${INDENT}  ` });
      q.options.forEach((opt, i) => {
        const on = pick.picks.includes(opt.label);
        const mark = q.multiSelect ? (on ? p.accent('[x] ') : p.dim('[ ] ')) : '';
        out.push(truncate(`${INDENT}  ${p.accent(String(i + 1))} ${mark}${opt.label}${opt.description ? p.dim(` · ${opt.description}`) : ''}`, width));
      });
      out.push(`${INDENT}  ${p.dim(q.multiSelect ? 'Numbers pick (again to unpick) · Enter goes on · or type your own answer' : 'A number picks · or type your own answer, then Enter')}`);
      return out;
    }
    if (ui.kind === 'form') {
      const f = ui.a.form!.fields[ui.fi];
      const n = ui.a.form!.fields.length;
      const out = wrap(`${n > 1 ? p.dim(`${ui.fi + 1}/${n} `) : ''}${p.bold(f.label)}${f.required ? p.dim(' (needed)') : ''}${f.help ? p.dim(` · ${f.help}`) : ''}`, width, { first: `${INDENT}${p.yellow('☐')} `, indent: `${INDENT}  ` });
      for (const [i, c] of choicesOf(f).entries()) out.push(truncate(`${INDENT}  ${p.accent(String(i + 1))} ${c}`, width));
      if (f.type === 'file') out.push(`${INDENT}  ${p.dim('The path of a file on this computer')}`);
      if (f.default) out.push(`${INDENT}  ${p.dim(`Enter keeps: ${f.default.replace(/\n/g, ', ')}`)}`);
      return out;
    }
    const a = this.view?.overlay.approvals[0];
    if (!a || approvalNeedsApp(a)) return [];
    return [choiceLine(a, look)];
  }

  /** In plain mode: what to type to answer the card now waiting. */
  private cardPrompt(): string[] {
    const a = this.view?.overlay.approvals[0];
    if (!a) return [];
    if (this.ui.kind === 'question' || this.ui.kind === 'form') return this.cardRows(this.look);
    return [choiceLine(a, this.look), `${INDENT}  Type a key and Enter, or what to do instead.`];
  }

  // ---- keys ------------------------------------------------------------------------------------------------

  private onData(d: string) {
    for (const k of this.keys.feed(d)) void this.onKey(k);
  }

  private async onKey(k: Key) {
    if (k.name !== 'tab') this.completions = [];
    if (k.name !== 'ctrl-c') this.quitArmed = 0;
    const empty = !this.editor.text;
    // Single keys that answer what waits, while nothing is typed.
    if (k.name === 'text' && empty && k.text.length === 1 && this.singleKey(k.text)) return;
    switch (k.name) {
      case 'ctrl-c':
        return this.ctrlC();
      case 'ctrl-d':
        if (empty) return this.quit(0);
        this.editor.apply({ name: 'delete' });
        return this.render();
      case 'escape':
        return this.escape();
      case 'ctrl-l':
        process.stdout.write('\x1b[H\x1b[2J');
        this.screen!.forget();
        return this.render();
      case 'ctrl-z':
        this.screen!.clear();
        suspend(process.stdin, process.stdout, () => {
          this.screen!.forget();
          this.render();
        });
        return;
      case 'tab':
        return this.complete();
      case 'enter': {
        const r = this.editor.apply(k);
        if (r !== 'submit') return this.render();
        const text = this.editor.text;
        this.editor.clear();
        await this.enter(text);
        return this.render();
      }
      default:
        this.editor.apply(k);
        return this.render();
    }
  }

  /** A key alone that picks or answers (y, n, a digit); true when it did. */
  private singleKey(c: string): boolean {
    const ui = this.ui;
    if (ui.kind === 'pick') {
      const n = Number(c);
      if (ui.items.length <= 9 && n >= 1 && n <= ui.items.length) {
        this.ui = { kind: 'input' };
        void Promise.resolve(ui.onPick(ui.items[n - 1].value)).catch((e) => this.flash(this.look.p.red((e as Error).message)));
        this.render();
        return true;
      }
      return false;
    }
    if (ui.kind === 'question') {
      const q = ui.a.questions![ui.qi];
      const n = Number(c);
      if (!(n >= 1 && n <= q.options.length)) return false;
      const label = q.options[n - 1].label;
      const cur = ui.picks[q.id] ?? { picks: [], other: '' };
      if (q.multiSelect) {
        ui.picks[q.id] = { ...cur, picks: cur.picks.includes(label) ? cur.picks.filter((x) => x !== label) : [...cur.picks, label] };
        this.render();
      } else {
        ui.picks[q.id] = { picks: [label], other: '' };
        void this.nextQuestion();
      }
      return true;
    }
    if (ui.kind === 'form') {
      const f = ui.a.form!.fields[ui.fi];
      const cs = choicesOf(f);
      const n = Number(c);
      if (!cs.length || !(n >= 1 && n <= cs.length)) return false;
      if (f.type === 'choice' && f.multi) {
        const cur = (ui.values[f.id] ?? '').split('\n').filter(Boolean);
        ui.values[f.id] = (cur.includes(cs[n - 1]) ? cur.filter((x) => x !== cs[n - 1]) : [...cur, cs[n - 1]]).join('\n');
        this.flash(this.look.p.dim(`Picked: ${ui.values[f.id].replace(/\n/g, ', ') || 'none'} · Enter goes on`));
      } else {
        ui.values[f.id] = cs[n - 1];
        void this.nextField();
      }
      return true;
    }
    const a = this.view?.overlay.approvals[0];
    if (!a || approvalNeedsApp(a)) return false;
    const hit = approvalKeys(a).find((x) => x.key === c.toLowerCase());
    if (!hit) return false;
    void this.answer(a, hit.option.id);
    return true;
  }

  /** Enter: an answer to what waits, a slash command, or a message. */
  private async enter(text: string) {
    const ui = this.ui;
    const t = text.trim();
    if (ui.kind === 'pick') {
      if (!t) return;
      const n = Number(t);
      const it = ui.items[n - 1] ?? ui.items.find((x) => x.value.toLowerCase() === t.toLowerCase() || x.label.toLowerCase() === t.toLowerCase());
      if (!it) return this.flash(this.look.p.yellow(`Pick one of 1 to ${ui.items.length}`));
      this.ui = { kind: 'input' };
      try {
        await ui.onPick(it.value);
      } catch (e) {
        this.flash(this.look.p.red((e as Error).message));
      }
      return;
    }
    if (ui.kind === 'question') {
      const q = ui.a.questions![ui.qi];
      const cur = ui.picks[q.id] ?? { picks: [], other: '' };
      if (t) {
        // A number (or several, for a question with many picks) picks; anything else is your own answer.
        const nums = t.split(/[\s,]+/).map(Number);
        if (nums.every((n) => n >= 1 && n <= q.options.length)) ui.picks[q.id] = { picks: nums.map((n) => q.options[n - 1].label), other: '' };
        else ui.picks[q.id] = { picks: q.multiSelect ? cur.picks : [], other: t };
      } else if (!cur.picks.length && !cur.other) return this.flash(this.look.p.yellow('Pick one, or type your own answer'));
      return this.nextQuestion();
    }
    if (ui.kind === 'form') {
      const f = ui.a.form!.fields[ui.fi];
      if (t) {
        const cs = choicesOf(f);
        const n = Number(t);
        ui.values[f.id] = cs.length && n >= 1 && n <= cs.length ? cs[n - 1] : t;
      }
      if (f.required && !ui.values[f.id]?.trim()) return this.flash(this.look.p.yellow('It is needed'));
      if (f.type === 'number' && ui.values[f.id] && !/^[-+]?(\d[\d,_ ]*\.?\d*|\.\d+)$/.test(ui.values[f.id].replace(/^[$€£¥]\s*/, ''))) return this.flash(this.look.p.yellow('A number, please'));
      return this.nextField();
    }
    const a = this.view?.overlay.approvals[0];
    if (a && t && !approvalNeedsApp(a)) {
      // Words with an approval waiting: deny it with them (what to do instead).
      const no = a.options.find(isDeny);
      if (no) return this.answer(a, no.id, t);
    }
    if (!t) return;
    this.editor.remember(text);
    keepHistory(this.histFile, text, this.editor.history);
    if (t.startsWith('/') && !t.startsWith('//')) return this.slash(t);
    return this.submit(text.replace(/^\/\//, '/'));
  }

  private ctrlC() {
    if (this.ui.kind === 'pick') {
      this.ui = { kind: 'input' };
      return this.render();
    }
    if (this.view && busy(this.view.live)) {
      void this.stopTurn();
      return;
    }
    if (this.editor.text) {
      this.editor.clear();
      return this.render();
    }
    if (this.quitArmed && Date.now() - this.quitArmed < 3000) return this.quit(0);
    this.quitArmed = Date.now();
    this.flash(this.look.p.dim('Ctrl+C again to leave'), 3000);
  }

  private escape() {
    if (this.completions.length) return this.render();
    if (this.ui.kind === 'pick') {
      this.ui = { kind: 'input' };
      return this.render();
    }
    if (this.ui.kind === 'question' || this.ui.kind === 'form') {
      const a = this.ui.a;
      const no = a.options.find(isDeny);
      this.ui = { kind: 'input' };
      if (no) void this.answer(a, no.id);
      return this.render();
    }
    if (this.view && busy(this.view.live)) void this.stopTurn();
  }

  private async stopTurn() {
    if (!this.view) return;
    try {
      await this.conn.api('POST', `/api/sessions/${enc(this.view.key)}/interrupt`, {});
      this.flash(this.look.p.dim('Stopping its turn…'), 2000);
    } catch (e) {
      this.flash(this.look.p.red((e as Error).message));
    }
  }

  private quit(code: number) {
    if (this.spinner) clearInterval(this.spinner);
    this.screen?.clear();
    const key = this.view?.key;
    const s = this.view?.summary;
    this.view?.close();
    this.conn.close();
    if (key && !this.plain) process.stdout.write(`${this.look.p.dim(`Carry on with: hydor resume ${s?.agent === 'claude' ? shortKey(s) : key}`)}\n`);
    this.giveBack?.();
    this.done(code);
  }

  // ---- answering ---------------------------------------------------------------------------------------------

  private async answer(a: ApprovalRequest, optionId: string, message?: string, extra: { answers?: Record<string, string>; form?: Record<string, string> } = {}) {
    if (!this.view || this.busyAsk) return;
    this.busyAsk = true;
    const { p } = this.look;
    try {
      await this.conn.api('POST', `/api/sessions/${enc(this.view.key)}/approvals/${enc(a.id)}`, approvalBody(a, optionId, { message, ...extra }));
      const opt = a.options.find((x) => x.id === optionId);
      const deny = opt ? isDeny(opt) : false;
      const words = extra.answers && Object.keys(extra.answers).length ? Object.values(extra.answers).filter(Boolean).join(' · ') : (opt?.label ?? optionId);
      this.write(this.printer.aside([truncate(`${INDENT}${deny ? p.yellow('✗') : p.green('✓')} ${p.dim(`${words}${message ? `: ${message}` : ''}`)}`, this.look.width)]));
      this.ui = { kind: 'input' };
    } catch (e) {
      this.flash(p.red(`It was not answered: ${(e as Error).message}`));
    } finally {
      this.busyAsk = false;
      this.render();
    }
  }

  private async nextQuestion() {
    const ui = this.ui;
    if (ui.kind !== 'question') return;
    if (ui.qi + 1 < ui.a.questions!.length) {
      this.ui = { ...ui, qi: ui.qi + 1 };
      return this.render();
    }
    const sep = this.prog.agent === 'claude' ? ', ' : '\n';
    const answers = Object.fromEntries(ui.a.questions!.map((q) => [q.id, answerOf(q, ui.picks[q.id], sep)]));
    const yes = ui.a.options.find((o) => !isDeny(o));
    await this.answer(ui.a, yes?.id ?? 'answer', undefined, { answers });
  }

  private async nextField() {
    const ui = this.ui;
    if (ui.kind !== 'form') return;
    const fields = ui.a.form!.fields;
    if (ui.fi + 1 < fields.length) {
      this.ui = { ...ui, fi: ui.fi + 1 };
      return this.render();
    }
    const form = { ...ui.values };
    // Files go ahead of the answer, which then names where each went.
    const files = fields.filter((f) => f.type === 'file' && form[f.id]);
    if (files.length) {
      try {
        const up = await this.conn.api<{ files: { path: string }[] }>('POST', '/api/uploads', { files: files.map((f) => ({ name: path.basename(form[f.id]), data: fs.readFileSync(path.resolve(form[f.id])).toString('base64') })) });
        files.forEach((f, i) => (form[f.id] = up.files[i]?.path ?? ''));
      } catch (e) {
        return this.flash(this.look.p.red(`The file could not go: ${(e as Error).message}`));
      }
    }
    const yes = ui.a.options.find((o) => o.id === 'accept') ?? ui.a.options.find((o) => !isDeny(o));
    await this.answer(ui.a, yes?.id ?? 'accept', undefined, { form });
  }

  // ---- sending -------------------------------------------------------------------------------------------------

  /** A message: the first starts the session; one while the agent works is queued. */
  async submit(text: string) {
    const { p } = this.look;
    if (!this.view) {
      this.write(this.printer.echo(text));
      this.starting = Date.now();
      this.tickSpinner();
      this.render();
      try {
        const { key } = await this.conn.api<{ key: string }>('POST', '/api/sessions', startBody(this.plan, text, newStartId()), { timeoutMs: 120_000 });
        this.expect = { len: 0, at: Date.now() };
        await this.openView(key, false);
      } catch (e) {
        this.say(p.red(`It did not start: ${(e as Error).message}`));
      } finally {
        this.starting = 0;
        this.tickSpinner();
        this.render();
      }
      return;
    }
    const key = this.view.key;
    try {
      if (busy(this.view.live)) {
        // It shows under the work as queued until it goes.
        await this.conn.api('POST', `/api/sessions/${enc(key)}/queue`, { text });
        void this.view.refresh().catch(() => {});
      } else {
        this.write(this.printer.echo(text));
        this.starting = Date.now();
        this.tickSpinner();
        this.render();
        const len = this.view.items.length;
        await this.conn.api('POST', `/api/sessions/${enc(key)}/message`, { text });
        this.expect = { len, at: Date.now() };
      }
    } catch (e) {
      this.flash(p.red((e as Error).message));
    } finally {
      this.starting = 0;
      this.render();
    }
  }

  // ---- slash commands -----------------------------------------------------------------------------------------

  private pick(title: string, items: { label: string; hint?: string; value: string }[], onPick: (v: string) => void | Promise<void>) {
    if (!items.length) return this.flash(this.look.p.yellow('Nothing to pick from'));
    if (this.plain) this.write([this.look.p.bold(title), ...items.map((it, i) => `  ${i + 1}  ${it.label}${it.hint ? `  ${it.hint}` : ''}`)]);
    this.ui = { kind: 'pick', title, items, onPick };
    this.render();
  }

  private async slash(line: string) {
    const [, name, rest = ''] = /^\/(\S+)\s*([\s\S]*)$/.exec(line) ?? [];
    const arg = rest.trim();
    const { p } = this.look;
    const view = this.view;
    const key = view?.key;
    try {
      switch (name) {
        case 'help':
        case '?':
          return this.say(...helpLines(this.look));
        case 'quit':
        case 'exit':
        case 'q':
          return this.quit(0);
        case 'new':
          view?.close();
          this.view = null;
          this.pending = [];
          this.ui = { kind: 'input' };
          this.printer = new Printer(this.look);
          this.write(['', ...this.headerLines()]);
          if (arg) await this.submit(arg);
          return this.render();
        case 'sessions': {
          const { sessions } = await this.conn.api<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=60');
          const list = sessions.filter((s) => !s.extra?.parent).slice(0, 20);
          return this.pick(
            'Carry on with which session?',
            list.map((s) => ({ label: truncate(s.title || s.firstPrompt || '(untitled)', 60), hint: [statusWord(s, p), tildify(s.cwd, this.boot.home)].filter(Boolean).join(' · '), value: s.key })),
            (k) => this.openView(k, true),
          );
        }
        case 'model':
          return this.setModel(arg);
        case 'effort':
          return this.setEffort(arg);
        case 'mode':
          return this.setMode(arg);
        case 'agent':
          return this.setAgent(arg);
        case 'helpers':
          return this.helpers(arg);
        case 'tiers':
          return this.say(...(await tierLines(this.conn, this.look, this.tiers ? await this.conn.api<TiersState>('GET', '/api/models/tiers') : undefined)));
        case 'usage': {
          const u = await this.conn.api<{ claude?: AgentUsage; codex?: AgentUsage }>('GET', '/api/usage');
          return this.say(...usageLines(u, this.look));
        }
        case 'cost': {
          if (!view) return this.say(p.dim('Nothing spent yet: no session.'));
          await view.refresh();
          const own = view.summary?.stats.costUsd ?? 0;
          const hs = [...view.helpers.values()];
          const theirs = hs.reduce((a, h) => a + (h.summary?.stats.costUsd ?? 0), 0);
          const lines = [`This session: ${money(own) || '$0.00'}`];
          if (hs.length) lines.push(`Its ${hs.length === 1 ? 'helper' : `${hs.length} helpers`}: ${money(theirs) || '$0.00'}`, `Together: ${money(own + theirs) || '$0.00'}`);
          return this.say(...lines.map((l) => `${INDENT}${l}`));
        }
        case 'stop':
          return this.stopTurn();
        case 'rename':
          if (!key) return this.flash(p.yellow('No session to rename yet'));
          if (!arg) return this.flash(p.yellow('Give the title: /rename <title>'));
          await this.conn.api('POST', `/api/sessions/${enc(key)}/rename`, { title: arg });
          return this.say(`${INDENT}Renamed: ${arg}`);
        case 'open':
          if (!key) return this.say(`${INDENT}${this.conn.url()}`);
          if (arg === 'browser') openBrowser(this.conn.url(key));
          return this.say(`${INDENT}${this.conn.url(key)}`);
        default:
          // The program's own commands go to it as they are.
          return this.submit(line);
      }
    } catch (e) {
      this.flash(p.red((e as Error).message));
    }
  }

  private async setModel(arg: string) {
    const { p } = this.look;
    const apply = async (m: string) => {
      if (m === 'auto' && !this.tiers?.team) return this.flash(p.yellow('This Hydor has no Automatic yet: pick a model'));
      if (this.view) {
        if (m === 'auto') return this.flash(p.yellow('Automatic picks a model as a session starts: /new starts one with it'));
        await this.conn.api('POST', `/api/sessions/${enc(this.view.key)}/config`, { model: m });
      }
      this.plan.model = m;
      this.say(`${INDENT}Model: ${modelLabel(m, this.cat.models)}`);
    };
    if (arg) return apply(arg);
    const items = [...(this.tiers?.team && !this.view ? [{ label: 'Automatic', hint: 'picked by the job, from your tiers', value: 'auto' }] : []), ...this.cat.models.map((m) => ({ label: m.label, hint: [m.value, m.isDefault ? 'default' : ''].filter(Boolean).join(' · '), value: m.value }))];
    this.pick('Which model?', items, apply);
  }

  private currentModel() {
    const m = this.view?.live?.model ?? this.view?.summary?.model ?? this.plan.model;
    return this.cat.models.find((x) => x.value === m || x.resolved === m) ?? this.cat.models.find((x) => x.isDefault);
  }

  private async setEffort(arg: string) {
    const apply = async (e: string) => {
      if (this.view) await this.conn.api('POST', `/api/sessions/${enc(this.view.key)}/config`, { effort: e });
      this.plan.effort = e;
      this.say(`${INDENT}Effort: ${e}`);
    };
    if (arg) return apply(arg);
    const efforts = this.currentModel()?.efforts ?? [];
    if (!efforts.length) return this.flash(this.look.p.yellow('This model has no efforts to pick'));
    this.pick('How hard should it think?', efforts.map((e) => ({ label: e, value: e })), apply);
  }

  private async setMode(arg: string) {
    const apply = async (m: string) => {
      const mode = modeFor(m, this.prog.agent, this.prog.acpAgent)!;
      if (this.view) await this.conn.api('POST', `/api/sessions/${enc(this.view.key)}/config`, { mode });
      this.plan.mode = mode;
      this.say(`${INDENT}Mode: ${modeLabel(mode, this.cat)}`);
    };
    if (arg) return apply(arg);
    this.pick('What may it do without asking?', this.cat.modes.map((m) => ({ label: m.label, hint: m.description, value: m.value })), apply);
  }

  private async setAgent(arg: string) {
    const apply = async (id: string) => {
      const a = await findAssistant(this.conn, id);
      if (this.view) await this.conn.api('PUT', `/api/assistants/session/${enc(this.view.key)}`, { id: a.id });
      else this.plan.assistant = a;
      this.say(`${INDENT}Works as ${a.name}${this.view ? ' from the next message on' : ''}`);
    };
    if (arg) return apply(arg);
    const { assistants } = await this.conn.api<{ assistants: Assistant[] }>('GET', '/api/assistants');
    this.pick('Work as which agent?', assistants.map((a) => ({ label: a.name, hint: truncate(a.description ?? '', 50), value: a.id })), apply);
  }

  private async helpers(arg: string) {
    const { p } = this.look;
    const view = this.view;
    const hs = view ? [...view.helpers.values()] : [];
    if (!hs.length) return this.say(p.dim(`${INDENT}No helpers in this session.`));
    if (arg) {
      const h = hs[Number(arg) - 1] ?? hs.find((x) => x.key === arg || x.note.title.toLowerCase().startsWith(arg.toLowerCase()));
      if (!h) return this.flash(p.yellow(`No helper ${arg}: /helpers lists them`));
      return this.say(...(await conversationLines(this.conn, h.key, this.look, { turns: 3 })));
    }
    await view!.refresh();
    const lines = hs.map((h, i) => {
      const s = h.summary;
      const state = s ? statusWord(s, p) || p.dim(h.replaced ? 'Stepped up' : 'Done') : p.dim('…');
      return truncate(`${INDENT}${p.accent(String(i + 1))}  ${state}  ${h.note.title}${p.dim(` · ${[h.note.label, h.note.tier ? tierName(h.note.tier) : '', money(s?.stats.costUsd)].filter(Boolean).join(' · ')}`)}`, this.look.width);
    });
    this.say(...lines, p.dim(`${INDENT}/helpers <n> shows one’s conversation`));
  }

  // ---- completion ----------------------------------------------------------------------------------------------

  private async complete() {
    const ed = this.editor;
    const before = ed.text.slice(0, ed.cursor);
    let word = '';
    let from = ed.cursor;
    let cands: string[] = [];
    let m: RegExpExecArray | null;
    if ((m = /^\/(\S*)$/.exec(before))) {
      word = `/${m[1]}`;
      from = 0;
      cands = [...SLASH.map((c) => `/${c.name}`), ...(this.cat.commands ?? []).map((c) => `/${c.name.replace(/^\//, '')}`)].filter((c) => c.startsWith(word));
    } else if ((m = /^\/model\s+(\S*)$/.exec(before))) {
      word = m[1];
      from = ed.cursor - word.length;
      cands = [...(this.tiers?.team ? ['auto'] : []), ...this.cat.models.map((x) => x.value)].filter((c) => c.startsWith(word));
    } else if ((m = /(?:^|\s)@(\S*)$/.exec(before))) {
      word = m[1];
      from = ed.cursor - word.length;
      cands = await this.pathCandidates(word);
    } else return;
    cands = [...new Set(cands)];
    if (!cands.length) return;
    if (cands.length === 1) {
      const c = cands[0];
      ed.replaceBefore(from, c + (c.endsWith('/') ? '' : ' '));
      return this.render();
    }
    // Several: as much as they share, and the list under the line.
    let common = cands[0];
    for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
    if (common.length > word.length) ed.replaceBefore(from, common);
    this.completions = cands.slice(0, 40).map((c) => c.replace(/^.*\/(?=[^/]+\/?$)/, ''));
    this.render();
  }

  /** Files and folders after `@`, relative to the session's folder. */
  private async pathCandidates(word: string): Promise<string[]> {
    const cwd = this.view?.summary?.cwd ?? this.plan.cwd ?? this.boot.defaultCwd;
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const base = word.slice(slash + 1);
    const dir = dirPart.startsWith('/') ? dirPart : dirPart.startsWith('~/') ? path.join(this.boot.home, dirPart.slice(2)) : path.join(cwd, dirPart);
    try {
      const r = await this.conn.api<{ entries: { name: string; type: string; dirLink?: boolean }[] }>('GET', `/api/fs/list?path=${encodeURIComponent(dir)}${base.startsWith('.') ? '&hidden=1' : ''}`);
      return r.entries.filter((e) => e.name.startsWith(base)).map((e) => `${dirPart}${e.name}${e.type === 'dir' || e.dirLink ? '/' : ''}`);
    } catch {
      return [];
    }
  }

  // ---- plain mode -----------------------------------------------------------------------------------------------

  /** With stdout not a terminal: a line typed is a message (or an answer to what waits). */
  private plainInput() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
    rl.on('line', async (line) => {
      const t = line.trim();
      if (t.length === 1 && this.singleKey(t)) return;
      await this.enter(line);
    });
    rl.on('close', () => {
      // Input ended: wait for the work to settle, then leave.
      const wait = setInterval(() => {
        if (!this.view || (!this.working() && this.view.settled())) {
          clearInterval(wait);
          this.quit(0);
        }
      }, 500);
    });
  }
}

/** A form field's choices: a choice's options, or Yes and No. */
function choicesOf(f: AppField): string[] {
  if (f.type === 'choice') return f.options ?? [];
  if (f.type === 'yesno') return ['Yes', 'No'];
  return [];
}

const p = (look: Look) => look.p;

/** /help: the commands and the keys, wrapped to the width. */
function helpLines(look: Look): string[] {
  const { p: c, width } = look;
  const w = Math.max(...SLASH.map((s) => `/${s.name}${s.args ? ` ${s.args}` : ''}`.length)) + 2;
  const rows = SLASH.flatMap((s) => {
    const head = `/${s.name}${s.args ? ` ${s.args}` : ''}`;
    return wrap(c.dim(s.what), width - 1, { first: `${INDENT}${c.accent(`/${s.name}`)}${s.args ? ` ${c.dim(s.args)}` : ''}${' '.repeat(w - head.length)}`, indent: INDENT + ' '.repeat(w) });
  });
  const keys = [
    'Any other /command goes to the agent as it is (Tab lists them).',
    'Enter sends. Alt+Enter, Ctrl+J or a \\ before Enter adds a line. ↑ and ↓ go through earlier messages. Tab completes /commands, @files and models.',
    'Esc or Ctrl+C stops the turn. Ctrl+C clears the line; twice, it leaves (so does Ctrl+D). Ctrl+L clears the screen.',
    'While the agent works, Enter queues your message. A card waiting for you: y, n or its number answers it; words deny it with them.',
  ];
  return [...rows, '', ...keys.flatMap((k) => wrap(c.dim(k), width - 1, { first: INDENT, indent: INDENT }))];
}

/** `hydor`, `hydor chat`, `hydor -c`, `hydor resume [key]`: the chat. */
export async function chatCommand(conn: Conn, o: Opts, boot: Boot, message?: string): Promise<number> {
  const plain = !process.stdout.isTTY;
  let key: string | undefined;
  if (o.cmd === 'resume' && o.args[0]) key = await resolveKey(conn, o.args[0]);
  else if (o.continue) {
    const cwd = o.cwd ? path.resolve(o.cwd) : process.cwd();
    const { sessions } = await conn.api<{ sessions: SessionSummary[] }>('GET', `/api/sessions?limit=20&cwd=${encodeURIComponent(cwd)}`);
    const s = sessions.filter((x) => !x.extra?.parent).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (s) key = s.key;
    else process.stderr.write(`No session in ${tildify(cwd, boot.home)} yet: starting a new one.\n`);
  } else if (o.cmd === 'resume') {
    const { sessions } = await conn.api<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=60');
    const list = sessions.filter((s) => !s.extra?.parent).slice(0, 20);
    if (!list.length) process.stderr.write('No sessions yet: starting a new one.\n');
    else {
      const look: Look = { p: makePaint(colorWanted(process.stderr, o.noColor)), width: process.stderr.columns || 100, home: boot.home };
      const lines = sessionLines(list, look);
      process.stderr.write(`${lines.map((l, i) => `${String(i + 1).padStart(3)}  ${l}`).join('\n')}\n`);
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const a = await new Promise<string>((r) => rl.question('Which one? (its number) ', (x) => (rl.close(), r(x.trim()))));
      const n = Number(a);
      if (!(n >= 1 && n <= list.length)) return 2;
      key = list[n - 1].key;
    }
  }
  const chat = new Chat(conn, o, boot, plain);
  const words = (o.cmd === 'resume' ? o.args.slice(1) : o.args).join(' ').trim();
  return chat.run(key, message ?? (words || undefined));
}

export { p as paintOf };

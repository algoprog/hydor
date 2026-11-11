// The chat: a conversation with an agent in the terminal's own scrollback (no full-screen mode: what was said stays
// above, selectable, over SSH and in tmux too). What is final is printed once; one region at the bottom is redrawn
// while the agent works: what still streams, the step under way, helpers at work, a card waiting for you (an
// approval, a question, a form), queued messages, a status line with a spinner, and the input line between two rules
// with a status line under it (the folder and branch, the model, the mode; the cost). Enter sends (a new session with
// the first message, then into it; queued while the agent works), slash commands change things or show them. A menu
// under the input opens by itself while a /command, a value after one or an @file is typed (complete.ts), Ctrl+R
// searches earlier messages, the newest earlier message that starts like the line shows grey after it, and `!command`
// runs a shell command with the terminal handed over. With stdout not a terminal there is no region and no colour:
// each line typed is sent, the conversation printed as it becomes final.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { agentMode, type Assistant } from '../../shared/assistants.ts';
import type { AppField } from '../../shared/apps.ts';
import type { AgentCatalog, AgentUsage, ApprovalRequest, Question, SessionSummary, TimelineItem } from '../../shared/types.ts';
import type { Opts } from './args.ts';
import { enc, spentOf, type Conn } from './client.ts';
import { conversationLines, openBrowser, resolveKey, sessionLines, shortKey, statusWord, tierLines, usageLines, whyNoReply } from './commands.ts';
import { commandItems, contextOf, filterKeep, historyItems, listsFolder, menuRows, rank, windowTop, type Context, type Item, type Ranked } from './complete.ts';
import { ghostOf, ghostWord, KeyReader, layout, LineEditor, type Key } from './editor.ts';
import { approvalBody, approvalKeys, approvalLines, approvalNeedsApp, choiceLine, INDENT, isDeny, itemLines, LOGO, logo, modelLabel, runningLine, shimmer, stepLines, textLines, tierName, type Look } from './lines.ts';
import { backgroundEnd, busy, historyLines, lastReply, Printer, SessionView } from './session.ts';
import { Screen, suspend, takeTerminal } from './screen.ts';
import { catalogOf, findAssistant, modeFor, modeLabel, modeRisk, newStartId, planStart, programName, startBody, tiersOf, type Boot, type Plan, type TiersState } from './start.ts';
import { colorLevel, colorWanted, elapsed, gradientAt, makePaint, money, pad, strWidth, tildify, truncate, wrap, type Paint } from './term.ts';

const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const rgbHex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** The chat's own commands, for /help and the completion menu. */
const SLASH: { name: string; args?: string; what: string }[] = [
  { name: 'help', what: 'these commands and the keys' },
  { name: 'keys', what: 'just the keys' },
  { name: 'new', args: '[message]', what: 'a new session here' },
  { name: 'sessions', what: 'pick a session to carry on' },
  { name: 'resume', what: 'the same as /sessions' },
  { name: 'model', args: '[name|auto]', what: 'the model (a list without a name)' },
  { name: 'effort', args: '[level]', what: 'how hard it thinks' },
  { name: 'mode', args: '[ask|edits|plan|full]', what: 'what it may do without asking' },
  { name: 'agent', args: '[name]', what: 'work as one of your agents' },
  { name: 'helpers', args: '[n]', what: 'the helpers (child sessions), or one’s conversation' },
  { name: 'tiers', what: 'which model each tier means' },
  { name: 'usage', what: 'plan usage and limits' },
  { name: 'cost', what: 'what this session and its helpers cost' },
  { name: 'copy', what: 'copy the agent’s last reply' },
  { name: 'clear', what: 'clear the screen' },
  { name: 'stop', what: 'stop the turn, and the helpers in the background' },
  { name: 'rename', args: '<title>', what: 'rename the session' },
  { name: 'open', args: '[browser]', what: 'its address in the web app' },
  { name: 'quit', what: 'leave (the session goes on in the app)' },
];

type Ui =
  | { kind: 'input' }
  | { kind: 'pick'; title: string; items: Item[]; sel: number; onPick: (v: string) => void | Promise<void>; onCancel?: () => void }
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
  /** The completion menu: what the text before the cursor is completing and its rows (null when closed). */
  private menu: { ctx: Context | { kind: 'history' }; items: Ranked[]; sel: number; loading?: boolean } | null = null;
  /** The text the menu was closed at with Esc: it stays closed until the text changes. */
  private closedText: string | null = null;
  /** Ctrl+R: the menu is over earlier messages. */
  private hist = false;
  private fileSeq = 0;
  private fileTimer: NodeJS.Timeout | null = null;
  private assistants: Assistant[] | null = null;
  /** The folder's git branch, asked once for each folder the session is in. */
  private git = { cwd: '', branch: '' };
  /** A shell command of yours has the terminal. */
  private shelling = false;
  /** The head of the chat was printed (a new chat's, or a session's carried on). */
  private welcomed = false;
  private frame = 0;
  /** The menu's first visible row. */
  private menuTop = 0;
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
    const level = colorLevel(out, o.noColor);
    this.look = { p: makePaint(!plain && level > 0, level || undefined), width: out.columns || 100, home: boot.home, verbose: o.verbose, thinking: o.thinking };
    this.screen = plain ? null : new Screen(out);
    this.editor = new LineEditor();
    this.printer = new Printer(this.look);
  }

  // ---- starting --------------------------------------------------------------------------------------------

  async run(key?: string, message?: string, o: { pickSession?: boolean } = {}): Promise<number> {
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
    else if (!o.pickSession) this.write(await this.welcome());
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
    if (o.pickSession && !key && !this.plain) {
      // `hydor resume` with no session named: the sessions to pick from; Esc leaves a new chat here.
      await this.slash('/sessions');
      if (this.ui.kind !== 'pick' && !this.view && !this.welcomed) this.write(await this.welcome());
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

  /** The folder the session is in (the one a new session starts in before there is one). */
  private cwd(): string | undefined {
    return this.view?.summary?.cwd ?? this.plan.cwd ?? this.boot.defaultCwd;
  }

  /** The model and the mode now, as named, with what the mode allows. */
  private current(): { model: string; mode: string; risk: ReturnType<typeof modeRisk> } {
    const s = this.view?.summary;
    const model = this.view ? modelLabel(this.view.live?.model ?? s?.model, this.cat.models) : this.plan.model ? modelLabel(this.plan.model, this.cat.models) : (this.cat.models.find((m) => m.isDefault)?.label ?? '');
    const raw = this.view ? (this.view.live?.mode ?? s?.prefs?.mode) : this.plan.mode;
    return { model, mode: modeLabel(raw, this.cat), risk: modeRisk(raw ?? this.cat.defaultMode) };
  }

  /** Asks the server once for the folder's git branch (again when the folder changes). */
  private async loadGit() {
    const cwd = this.cwd();
    if (!cwd || this.git.cwd === cwd) return;
    this.git = { cwd, branch: '' };
    try {
      const r = await this.conn.api<{ info: { branch?: string } | null }>('GET', `/api/git/repo-info?path=${encodeURIComponent(cwd)}`, undefined, { timeoutMs: 5000 });
      if (this.git.cwd === cwd) this.git.branch = r.info?.branch ?? '';
    } catch {}
  }

  /** The head of a chat: a box with the app, its version, the folder and branch, the program, model and mode (the session's title for one carried on), and a line of hints. */
  private async welcome(title?: string): Promise<string[]> {
    const { p } = this.look;
    this.welcomed = true;
    if (this.plain) return [...this.headerLines(), ...(title ? [p.bold(title)] : [])];
    await this.loadGit();
    const width = this.screen!.columns;
    const c = this.current();
    const lines = [`${logo(p)} ${p.dim(this.conn.version)}`];
    if (title) lines.push(p.bold(title));
    lines.push(`${tildify(this.cwd(), this.boot.home)}${this.git.branch ? `  ${p.accent(`⎇ ${this.git.branch}`)}` : ''}`);
    const who = [this.plan.assistant && this.plan.assistant.id !== 'general' && !this.view ? this.plan.assistant.name : '', programName(this.prog.agent, this.prog.acpAgent, this.boot.acpAgents), c.model].filter(Boolean);
    lines.push([...who, c.mode ? paintMode(c.mode, c.risk, p) : ''].filter(Boolean).join(p.dim(' · ')));
    if (!this.conn.local) lines.push(p.dim(`on ${this.conn.base}`));
    const boxW = Math.min(width - 1, Math.max(40, Math.max(...lines.map((l) => strWidth(l))) + 4));
    const edge = (s: string) => p.dim(p.accent(s));
    const out = [edge(`╭${'─'.repeat(boxW - 2)}╮`)];
    for (const l of lines) out.push(`${edge('│')} ${pad(truncate(l, boxW - 4), boxW - 4)} ${edge('│')}`);
    out.push(edge(`╰${'─'.repeat(boxW - 2)}╯`));
    // The hints that fit, whole ones only.
    const hints = ['/ commands', '@ files', '! shell', '↑ history', 'Ctrl+R search', '/help'];
    while (hints.length > 1 && INDENT.length + hints.join(' · ').length > width - 1) hints.pop();
    out.push(`${INDENT}${p.dim(hints.join(' · '))}`);
    return out;
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
      const lines = [...(await this.welcome(s?.title || '(untitled)')), ''];
      lines.push(...historyLines(view.items, view.notes, this.look, { turns: 3 }));
      // What comes next brings its own blank line.
      while (lines[lines.length - 1] === '') lines.pop();
      this.write(lines);
      this.printer.skipAll(view);
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
    const on = !this.plain && (this.working() || !!this.view?.helpersWorking().length || !!this.view?.background().length);
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
    const view = this.view;
    const frame = SPIN[this.frame];
    // A blank row after the conversation, unless the work under way goes on from its last steps.
    const first = this.pending[0];
    const rows: string[] = view && first && (first.kind === 'tool' || first.kind === 'thinking') && this.printer.afterSteps() ? [] : [''];
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
      const bg = view.background();
      if (bg.length) rows.push(truncate(`${INDENT}${p.accent('◆')} ${p.dim(backgroundWords(bg))}`, width));
    }
    rows.push(...this.cardRows(look));
    for (const q of (view?.summary?.queue ?? []).slice(0, 3)) rows.push(truncate(`${INDENT}${p.dim(`⧗ queued: ${q.text.replace(/\s+/g, ' ')}`)}`, width));
    if ((view?.summary?.queue?.length ?? 0) > 3) rows.push(`${INDENT}${p.dim(`⧗ and ${view!.summary!.queue!.length - 3} more`)}`);
    if (this.working()) {
      const l = view?.live;
      const waiting = l?.status === 'waiting' || !!view?.overlay.approvals.length;
      const word = this.starting ? 'Starting' : waiting ? 'Needs you' : l?.status === 'starting' ? 'Starting' : l?.status === 'stopping' ? 'Stopping' : 'Working';
      const since = l?.turnStartedAt ?? (this.starting || undefined);
      // The spinner shades across the logo's colours, frame by frame, and a brighter band sweeps the word.
      const t = 1 - Math.abs((2 * this.frame) / SPIN.length - 1);
      const spin = p.level >= 2 ? p.hex(frame, rgbHex(gradientAt(LOGO, t))) : p.accent(frame);
      const left = waiting ? `${p.yellow('◌')} ${shimmer(word, p, Date.now(), true)}` : `${spin} ${shimmer(word, p)}`;
      rows.push(truncate(`${left}${p.dim(`${since ? ` · ${elapsed(since)}` : ''} · esc to stop`)}`, width));
    } else if (view?.helpersWorking().length) rows.push(truncate(`${p.accent(frame)} ${p.dim('Helpers at work: their replies wake the agent')}`, width));
    else if (view?.background().length) rows.push(truncate(`${p.accent(frame)} ${p.dim('At work in the background: each one that ends wakes the agent · /stop stops them')}`, width));
    if (this.notice && this.notice.until > Date.now()) rows.push(truncate(`${INDENT}${this.notice.text}`, width));
    // The input between two rules, then the status line (the menu or a list to pick from takes its place).
    const rule = p.dim('─'.repeat(Math.max(1, width - 1)));
    rows.push(rule);
    const ed = this.editor;
    const shell = this.ui.kind === 'input' && ed.text.startsWith('!');
    const ghost = this.ui.kind === 'input' && !this.menu && !this.hist ? ghostOf(ed.text, ed.cursor, ed.history) : '';
    const lay = layout(ed.text, ed.cursor, width, { prompt: `${shell ? p.yellow('!') : p.accent('›')} `, placeholder: this.placeholder(), maxRows: Math.max(3, Math.floor(height / 3)), ghost, p });
    const top = rows.length;
    rows.push(...lay.rows, rule);
    rows.push(...this.footer(look));
    if (this.git.cwd !== (this.cwd() ?? '') && this.cwd()) void this.loadGit().then(() => this.render());
    this.screen.render(rows, { row: top + lay.cursorRow, col: lay.cursorCol });
  }

  /** The rows under the input: a list to pick from, the completion menu, or the status line. */
  private footer(look: Look): string[] {
    const { p, width } = look;
    const ui = this.ui;
    if (ui.kind === 'pick') {
      const v = this.pickView(ui);
      return [truncate(`${INDENT}${p.bold(ui.title)}`, width - 1), ...menuRows({ items: v.items, sel: v.sel, top: this.menuTop, rows: Math.max(3, this.screen!.rows - 8), width, p, maxLabel: Math.max(28, Math.floor(width / 2)), empty: 'Nothing matches' })];
    }
    const m = this.menu;
    if (m && ui.kind === 'input') {
      const files = m.ctx.kind === 'files' || m.ctx.kind === 'history';
      const out = menuRows({ items: m.items, sel: m.sel, top: this.menuTop, rows: this.menuRowCount(), width, p, maxLabel: files ? width : 28, empty: m.ctx.kind === 'history' ? 'No earlier message matches' : m.loading ? 'Searching…' : m.ctx.kind === 'files' ? 'No file matches' : undefined });
      if (out.length) return out;
    }
    const c = this.current();
    const cost = money(this.view?.summary?.stats.costUsd);
    const where = tildify(this.cwd(), this.boot.home);
    const left = `${INDENT}${p.dim(`${where}${this.git.branch ? ` ⎇ ${this.git.branch}` : ''}${c.model ? ` · ${c.model}` : ''}${c.mode ? ' · ' : ''}`)}${c.mode ? paintMode(c.mode, c.risk, p) : ''}`;
    const right = p.dim(`${cost ? `${cost} · ` : ''}/help`);
    // The right part goes when there is no room for it.
    if (strWidth(left) + strWidth(right) + 3 > width - 1) return [truncate(left, width - 1)];
    return [`${left}${' '.repeat(width - 1 - strWidth(left) - strWidth(right) - 1)}${right}`];
  }

  private placeholder(): string {
    const a = this.view?.overlay.approvals[0];
    if (this.hist) return 'Search earlier messages · ↑↓ · Enter puts one in the input · Esc';
    if (this.ui.kind === 'pick') return 'Type to filter · ↑↓ · Enter picks · Esc cancels';
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
    if (k.name !== 'ctrl-c') this.quitArmed = 0;
    const empty = !this.editor.text;
    // Keys that answer what waits, while nothing is typed: one at a time, even when several come in one read
    // (quick typing, a slow link); the first that is not one starts the line.
    if (k.name === 'text' && empty && !this.hist) {
      let i = 0;
      while (i < k.text.length && !this.editor.text && this.singleKey(k.text[i])) i++;
      if (i === k.text.length) return;
      if (i > 0) k = { name: 'text', text: k.text.slice(i) };
    }
    if (this.ui.kind === 'pick' && this.moveKey(k)) return;
    if (this.menuOpen() && this.menuKey(k)) return;
    // The grey suggestion from history: → or End takes it, Alt+→ its next word.
    if ((k.name === 'right' || k.name === 'end' || k.name === 'word-right') && this.ui.kind === 'input' && !this.menu && !this.hist) {
      const ghost = ghostOf(this.editor.text, this.editor.cursor, this.editor.history);
      if (ghost) {
        this.editor.insert(k.name === 'word-right' ? ghostWord(ghost) : ghost);
        return this.afterEdit();
      }
    }
    switch (k.name) {
      case 'ctrl-c':
        return this.ctrlC();
      case 'ctrl-d':
        if (empty) return this.quit(0);
        this.editor.apply({ name: 'delete' });
        return this.afterEdit();
      case 'escape':
        return this.escape();
      case 'ctrl-l':
        return this.clearScreen();
      case 'ctrl-r':
        if (this.ui.kind !== 'input') return;
        this.hist = true;
        return this.afterEdit();
      case 'ctrl-z':
        this.screen!.clear();
        suspend(process.stdin, process.stdout, () => {
          this.screen!.forget();
          this.render();
        });
        return;
      case 'tab':
        return this.openMenu();
      case 'enter': {
        if (this.ui.kind === 'pick') return this.pickEnter();
        if (this.hist) {
          // No earlier message matches: Enter closes the search, it does not send what was typed to look for.
          this.closeMenu();
          return this.render();
        }
        const r = this.editor.apply(k);
        if (r !== 'submit') return this.afterEdit();
        return this.runLine(this.editor.text);
      }
      default: {
        const r = this.editor.apply(k);
        // A message brought back from history is not completed as it comes.
        if (r === 'history') this.closedText = this.editor.text;
        if (this.ui.kind === 'pick') {
          this.ui.sel = 0;
          this.menuTop = 0;
        }
        return this.afterEdit();
      }
    }
  }

  /** Sends the line in the input (and clears it), as Enter does. */
  private async runLine(text: string) {
    this.editor.clear();
    this.menu = null;
    this.hist = false;
    this.closedText = null;
    await this.enter(text);
    this.render();
  }

  /** The menu is drawn again for what the text now is, and the region with it. */
  private afterEdit() {
    this.refreshMenu();
    this.render();
  }

  private clearScreen() {
    if (this.plain) return;
    process.stdout.write('\x1b[H\x1b[2J');
    this.screen!.forget();
    this.render();
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
    if (!this.plain && text.startsWith('!')) {
      this.editor.remember(text);
      keepHistory(this.histFile, text, this.editor.history);
      return this.shell(text.slice(1).trim());
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
    if (this.shelling) return;
    if (this.ui.kind === 'pick') return this.cancelPick();
    if (this.view && busy(this.view.live)) {
      void this.stopTurn();
      return;
    }
    if (this.editor.text || this.hist) {
      this.editor.clear();
      this.hist = false;
      this.closedText = null;
      return this.afterEdit();
    }
    if (this.quitArmed && Date.now() - this.quitArmed < 3000) return this.quit(0);
    this.quitArmed = Date.now();
    this.flash(this.look.p.dim('Ctrl+C again to leave'), 3000);
  }

  private escape() {
    if (this.ui.kind === 'pick') return this.cancelPick();
    // The menu closes (the turn goes on) and stays closed until the text changes.
    if (this.menu || this.hist) {
      this.closeMenu();
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

  /** Stops the turn; with `background`, what works in the background too (the session's and its helpers'). */
  private async stopTurn(background = false) {
    const view = this.view;
    if (!view) return;
    const tasks = background ? view.background() : [];
    try {
      if (busy(view.live)) await this.conn.api('POST', `/api/sessions/${enc(view.key)}/interrupt`, {});
      await Promise.all(tasks.map(({ key, task }) => this.conn.api('POST', `/api/sessions/${enc(key)}/tasks/${encodeURIComponent(task.id)}/stop`, {})));
      if (busy(view.live) || tasks.length) this.flash(this.look.p.dim(tasks.length ? 'Stopping it, and its helpers in the background…' : 'Stopping its turn…'), 2000);
      else this.flash(this.look.p.dim('Nothing is working'), 2000);
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

  private pick(title: string, items: { label: string; hint?: string; value: string }[], onPick: (v: string) => void | Promise<void>, onCancel?: () => void) {
    if (!items.length) return this.flash(this.look.p.yellow('Nothing to pick from'));
    if (this.plain) this.write([this.look.p.bold(title), ...items.map((it, i) => `  ${i + 1}  ${it.label}${it.hint ? `  ${it.hint}` : ''}`)]);
    this.ui = { kind: 'pick', title, items: items.map((it, i) => ({ ...it, kind: 'value' as const, num: String(i + 1) })), sel: 0, onPick, onCancel };
    this.menu = null;
    this.menuTop = 0;
    this.render();
  }

  /** What a list to pick from shows now: its items the typed letters are found in (all, with the one a typed number names highlighted, for a number), and the highlighted one. */
  private pickView(ui: Extract<Ui, { kind: 'pick' }>): { items: Ranked[]; sel: number } {
    const t = this.editor.text.trim();
    const n = Number(t);
    if (/^\d+$/.test(t) && n >= 1 && n <= ui.items.length) return { items: ui.items.map((item) => ({ item, hits: [] })), sel: n - 1 };
    const items = rank(ui.items, t);
    return { items, sel: Math.min(ui.sel, Math.max(0, items.length - 1)) };
  }

  /** Enter in a list: the highlighted one is picked. */
  private async pickEnter() {
    const ui = this.ui;
    if (ui.kind !== 'pick') return;
    const v = this.pickView(ui);
    const r = v.items[v.sel];
    if (!r) return this.flash(this.look.p.yellow('Nothing matches'));
    this.editor.clear();
    this.ui = { kind: 'input' };
    this.menuTop = 0;
    try {
      await ui.onPick(r.item.value);
    } catch (e) {
      this.flash(this.look.p.red((e as Error).message));
    }
    this.render();
  }

  private cancelPick() {
    const ui = this.ui;
    if (ui.kind !== 'pick') return;
    this.ui = { kind: 'input' };
    this.editor.clear();
    this.menuTop = 0;
    ui.onCancel?.();
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
          this.write(['', ...(await this.welcome())]);
          if (arg) await this.submit(arg);
          return this.render();
        case 'sessions':
        case 'resume': {
          const { sessions } = await this.conn.api<{ sessions: SessionSummary[] }>('GET', '/api/sessions?limit=60');
          const list = sessions.filter((s) => !s.extra?.parent).slice(0, 20);
          return this.pick(
            'Carry on with which session?',
            list.map((s) => ({ label: truncate(s.title || s.firstPrompt || '(untitled)', 60), hint: [statusWord(s, p), tildify(s.cwd, this.boot.home)].filter(Boolean).join(' · '), value: s.key })),
            (k) => this.openView(k, true),
            // Leaving the list with Esc in a chat that has shown no head yet: a new chat here.
            () => {
              if (!this.view && !this.welcomed) void this.welcome().then((l) => (this.write(l), this.render()));
            },
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
          const hs = [...view.helpers.values()];
          // As the server adds it up (tokens at their price until the agent's own figure lands); an older server: the sessions' own figures.
          const spent = await spentOf(this.conn, view.key);
          const own = spent ? spent.ownUsd : (view.summary?.stats.costUsd ?? 0);
          const theirs = spent ? spent.childrenUsd : hs.reduce((a, h) => a + (h.summary?.stats.costUsd ?? 0), 0);
          const lines = [`This session: ${money(own) || '$0.00'}`];
          if (hs.length) lines.push(`Its ${hs.length === 1 ? 'helper' : `${hs.length} helpers`}: ${money(theirs) || '$0.00'}`, `Together: ${money(own + theirs) || '$0.00'}`);
          return this.say(...lines.map((l) => `${INDENT}${l}`));
        }
        case 'copy':
          return this.copyReply();
        case 'clear':
          return this.clearScreen();
        case 'keys':
          return this.say(...keyLines(this.look));
        case 'stop':
          return this.stopTurn(true);
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
    // Claude Code's own helpers in the background: those running, then the background tasks that ended.
    const running = view?.background() ?? [];
    const ended = (view?.items ?? []).flatMap((i) => (i.kind === 'system' ? [backgroundEnd(i.text)].filter((x) => !!x) : [])) as { status: string; what: string }[];
    const bgLines = [
      ...running.map(({ key, task }) => truncate(`${INDENT}${p.accent('·')}  ${p.accent('Running')}  ${task.description}${p.dim(` · in the background${key !== view!.key ? ` of ${view!.helpers.get(key)?.note.title ?? 'a helper'}` : ''}${task.startedAt ? ` · ${elapsed(task.startedAt)}` : ''}`)}`, this.look.width)),
      ...ended.map((e) => truncate(`${INDENT}${p.dim('·')}  ${e.status === 'completed' ? p.green('Finished') : e.status === 'failed' ? p.red('Failed') : p.yellow(e.status === 'killed' ? 'Stopped' : e.status[0].toUpperCase() + e.status.slice(1))}  ${e.what.split('\n')[0]}${p.dim(' · in the background')}`, this.look.width)),
    ];
    if (!hs.length && !bgLines.length) return this.say(p.dim(`${INDENT}No helpers in this session.`));
    if (!hs.length) return this.say(...bgLines);
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
    this.say(...lines, ...bgLines, p.dim(`${INDENT}/helpers <n> shows one’s conversation`));
  }

  // ---- the completion menu -------------------------------------------------------------------------------------

  /** The menu is open, with something to choose and nothing still on its way. */
  private menuOpen(): boolean {
    return !!this.menu && !this.menu.loading && this.menu.items.length > 0 && this.ui.kind === 'input';
  }

  private menuRowCount(): number {
    return Math.max(3, Math.min(8, (this.screen?.rows ?? 24) - 12));
  }

  /** Closes the menu (and the history search); it stays closed until the text changes. */
  private closeMenu() {
    this.closedText = this.editor.text;
    this.hist = false;
    this.menu = null;
    this.fileSeq++;
  }

  private setMenu(ctx: Context | { kind: 'history' }, items: Ranked[], loading = false) {
    this.menu = { ctx, items, sel: 0, loading };
    this.menuTop = 0;
  }

  /** Opens, updates or closes the menu for what the text before the cursor is completing. */
  private refreshMenu() {
    const ed = this.editor;
    if (this.plain || this.ui.kind !== 'input') {
      this.menu = null;
      return;
    }
    if (this.hist) return this.setMenu({ kind: 'history' }, historyItems(ed.history, ed.text));
    if (this.closedText !== null) {
      if (this.closedText === ed.text) {
        this.menu = null;
        return;
      }
      this.closedText = null;
    }
    const ctx = contextOf(ed.text.slice(0, ed.cursor));
    if (!ctx) {
      this.menu = null;
      this.fileSeq++;
      return;
    }
    if (ctx.kind === 'commands') return this.setMenu(ctx, rank(commandItems(SLASH, this.cat.commands), ctx.query));
    if (ctx.kind === 'values') {
      const items = this.valueItems(ctx.cmd);
      return this.setMenu(ctx, items ? rank(items, ctx.query) : [], !items);
    }
    this.fileMenu(ctx);
  }

  /** Tab: opens the menu (the commands, on an empty line) where it was closed or not yet open. */
  private openMenu() {
    if (this.ui.kind !== 'input' || this.menuOpen()) return;
    if (!this.editor.text) this.editor.insert('/');
    this.closedText = null;
    this.hist = false;
    this.afterEdit();
  }

  /** The keys the menu takes while it is open; false for any other. */
  private menuKey(k: Key): boolean {
    if (this.moveKey(k)) return true;
    if (k.name === 'ctrl-r' && this.hist) return this.move(1);
    if (k.name === 'tab' || k.name === 'enter') {
      void this.acceptMenu(k.name === 'enter');
      return true;
    }
    return false;
  }

  private moveKey(k: Key): boolean {
    if (k.name === 'up' || k.name === 'shift-tab') return this.move(-1);
    if (k.name === 'down') return this.move(1);
    return false;
  }

  /** The highlight a row up or down, round the ends, the window with it. */
  private move(d: number): boolean {
    const ui = this.ui;
    if (ui.kind === 'pick') {
      const v = this.pickView(ui);
      const n = v.items.length;
      if (!n) return true;
      // The arrows take over from a number typed.
      if (/^\d+$/.test(this.editor.text.trim())) this.editor.clear();
      ui.sel = (v.sel + d + n) % n;
      this.menuTop = windowTop(n, ui.sel, this.menuTop, Math.max(3, this.screen!.rows - 8));
    } else if (this.menu) {
      const n = this.menu.items.length;
      if (!n) return true;
      this.menu.sel = (this.menu.sel + d + n) % n;
      this.menuTop = windowTop(n, this.menu.sel, this.menuTop, this.menuRowCount());
    }
    this.render();
    return true;
  }

  /**
   * Accepts the highlighted row. Tab puts it in (a space after it, but not after a folder, whose contents then show);
   * Enter does too, but a command that needs no argument runs at once, and a value runs its command.
   */
  private async acceptMenu(run: boolean) {
    const m = this.menu;
    const ed = this.editor;
    const it = m?.items[m.sel]?.item;
    if (!m || !it) return;
    if (m.ctx.kind === 'history') {
      // In the input to change or send, not sent.
      ed.set(it.value);
      this.hist = false;
      this.menu = null;
      this.closedText = ed.text;
      return this.render();
    }
    const ctx = m.ctx;
    this.closedText = null;
    if (ctx.kind === 'commands') {
      if (run && !it.needsArg) return this.runLine(it.value);
      ed.replaceBefore(ctx.from, `${it.value} `);
    } else if (ctx.kind === 'values') {
      if (run) return this.runLine(`/${ctx.cmd} ${it.value}`);
      ed.replaceBefore(ctx.from, `${it.value} `);
    } else ed.replaceBefore(ctx.from, it.kind === 'dir' ? `@${it.value}` : `@${it.value} `);
    this.afterEdit();
  }

  /** What follows a command that takes one of a list, as rows; null while the list is still coming. */
  private valueItems(cmd: string): Item[] | null {
    const item = (label: string, hint: string | undefined, value = label): Item => ({ label, hint, value, kind: 'value' });
    switch (cmd) {
      case 'model':
        return [...(this.tiers?.team && !this.view ? [item('auto', 'Automatic · picked by the job, from your tiers')] : []), ...this.cat.models.map((m) => item(m.value, [m.label, m.isDefault ? 'default' : ''].filter(Boolean).join(' · ')))];
      case 'mode': {
        const out: Item[] = [];
        const seen = new Set<string>();
        for (const w of ['ask', 'edits', 'plan', 'full'] as const) {
          const native = agentMode(w, this.prog.agent, this.prog.acpAgent);
          if (!native) continue;
          seen.add(native);
          out.push(item(w, this.cat.modes.find((m) => m.value === native)?.label ?? native));
        }
        // The program's own names are taken as they are too.
        for (const m of this.cat.modes) if (!seen.has(m.value)) out.push(item(m.value, m.label));
        return out;
      }
      case 'effort':
        return (this.currentModel()?.efforts ?? []).map((e) => item(e, this.currentModel()?.defaultEffort === e ? 'default' : undefined));
      case 'agent':
        if (!this.assistants) {
          void this.conn.api<{ assistants: Assistant[] }>('GET', '/api/assistants').then(
            (r) => {
              this.assistants = r.assistants;
              this.refreshMenu();
              this.render();
            },
            () => (this.assistants = []),
          );
          return null;
        }
        return this.assistants.map((a) => item(a.name, truncate(a.description ?? '', 60), a.id));
      case 'helpers':
        return [...(this.view?.helpers.values() ?? [])].map((h, i) => item(String(i + 1), h.note.title));
      case 'open':
        return [item('browser', 'open it in your browser')];
      default:
        return [];
    }
  }

  /** The files after `@`: asked for after a short wait (what arrives out of order is dropped); a folder's contents at once. */
  private fileMenu(ctx: Extract<Context, { kind: 'files' }>) {
    const prev = this.menu?.ctx.kind === 'files' ? this.menu.items : [];
    this.menu = { ctx, items: prev, sel: 0, loading: true };
    this.menuTop = 0;
    const seq = ++this.fileSeq;
    if (this.fileTimer) clearTimeout(this.fileTimer);
    const go = async () => {
      let items: Ranked[] = [];
      try {
        items = await this.fileItems(ctx.query);
      } catch {}
      if (seq !== this.fileSeq || this.menu?.ctx.kind !== 'files') return;
      this.setMenu(ctx, items);
      this.render();
    };
    if (listsFolder(ctx.query)) void go();
    else this.fileTimer = setTimeout(() => void go(), 80);
  }

  /** Files the words are found in (the server's order is the ranking), or a folder's entries, relative to the session's folder. */
  private async fileItems(query: string): Promise<Ranked[]> {
    const cwd = this.cwd() ?? this.boot.home;
    if (!listsFolder(query)) {
      const r = await this.conn.api<{ files: string[] }>('GET', `/api/fs/find?root=${encodeURIComponent(cwd)}&q=${encodeURIComponent(query)}`);
      return filterKeep(
        r.files.map((f) => {
          const rel = path.relative(cwd, f);
          const v = rel.startsWith('..') ? f : rel;
          return { label: v, value: v, kind: 'file' as const };
        }),
        query,
      );
    }
    const slash = query.lastIndexOf('/');
    const dirPart = slash >= 0 ? query.slice(0, slash + 1) : '';
    const base = query.slice(slash + 1);
    const dir = dirPart.startsWith('/') ? dirPart : dirPart.startsWith('~/') ? path.join(this.boot.home, dirPart.slice(2)) : path.join(cwd, dirPart);
    const r = await this.conn.api<{ entries: { name: string; type: string; dirLink?: boolean }[] }>('GET', `/api/fs/list?path=${encodeURIComponent(dir)}${base.startsWith('.') ? '&hidden=1' : ''}`);
    const entries = r.entries
      .map((e) => ({ e, dir: e.type === 'dir' || !!e.dirLink }))
      .sort((a, b) => Number(b.dir) - Number(a.dir) || a.e.name.localeCompare(b.e.name))
      .slice(0, 400)
      .map(({ e, dir }) => {
        const v = `${dirPart}${e.name}${dir ? '/' : ''}`;
        return { label: v, value: v, kind: (dir ? 'dir' : 'file') as Item['kind'], skip: dirPart.length };
      });
    return rank(entries, base);
  }

  // ---- shell commands and the clipboard ----------------------------------------------------------------------------

  /** `!command`: it runs in the session's folder with the terminal handed over (so programs that ask or draw work), then the chat takes it back. */
  private async shell(cmd: string) {
    const { p } = this.look;
    if (!cmd) return this.flash(p.dim('!command runs it here, in the session’s folder'));
    if (!this.conn.here) return this.flash(p.yellow('Shell commands need this computer’s Hydor'));
    this.write(this.printer.aside([p.dim(`$ ${cmd}`)]));
    const screen = this.screen!;
    screen.clear();
    this.shelling = true;
    const stdin = process.stdin;
    stdin.pause();
    stdin.setRawMode(false);
    process.stdout.write('\x1b[?2004l');
    const code = await new Promise<number>((resolve) => {
      try {
        const child = spawn(cmd, { shell: true, cwd: this.cwd() ?? process.cwd(), stdio: 'inherit' });
        child.on('error', (e) => (process.stderr.write(`${e.message}\n`), resolve(127)));
        child.on('close', (c, sig) => resolve(c ?? (sig ? 128 + (os.constants.signals[sig] ?? 0) : 1)));
      } catch (e) {
        process.stderr.write(`${(e as Error).message}\n`);
        resolve(127);
      }
    });
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?2004h');
    // Output that did not end its line: the region starts on a line of its own.
    if (!(await this.atLineStart())) process.stdout.write('\r\n');
    screen.forget();
    this.shelling = false;
    if (code) this.write([p.red(`exit ${code}`)]);
    this.render();
  }

  /** Whether the cursor is in the first column (asked of the terminal; yes when it does not answer). */
  private atLineStart(): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (v: boolean) => {
        clearTimeout(timer);
        process.stdin.off('data', on);
        resolve(v);
      };
      const on = (d: string) => {
        const m = /\x1b\[\d+;(\d+)R/.exec(d);
        if (m) done(m[1] === '1');
      };
      const timer = setTimeout(() => done(true), 250);
      process.stdin.on('data', on);
      process.stdout.write('\x1b[6n');
    });
  }

  /** /copy: the agent's last reply to the clipboard (the terminal's own way, which reaches this computer over SSH and tmux too; with a server here, the system's too). */
  private async copyReply() {
    const { p } = this.look;
    const text = this.view ? lastReply(this.view.merged()) : '';
    if (!text) return this.flash(p.yellow('No reply to copy yet'));
    if (this.plain) return this.flash(p.yellow('Copying needs a terminal'));
    process.stdout.write(osc52(text));
    if (this.conn.here) await toClipboard(text);
    const n = text.split('\n').length;
    this.flash(p.dim(`Copied the last reply (${n} ${n === 1 ? 'line' : 'lines'})`));
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

/** A mode's name in the colour of what it allows: red when the agent acts without asking, the accent colour for plan, dim for the rest. */
function paintMode(label: string, risk: 'full' | 'plan' | 'other', p: Paint): string {
  return risk === 'full' ? p.red(label) : risk === 'plan' ? p.accent(label) : p.dim(label);
}

/** What works in the background, in a line: "At work in the background: Check the docs", "2 helpers at work in the background: …". */
function backgroundWords(list: { task: { description: string; startedAt?: number } }[]): string {
  const what = list.map((x) => x.task.description.replace(/\s+/g, ' ')).join(' · ');
  if (list.length === 1) return `At work in the background: ${what}${list[0].task.startedAt ? ` · ${elapsed(list[0].task.startedAt)}` : ''}`;
  return `${list.length} helpers at work in the background: ${what}`;
}

/** A form field's choices: a choice's options, or Yes and No. */
function choicesOf(f: AppField): string[] {
  if (f.type === 'choice') return f.options ?? [];
  if (f.type === 'yesno') return ['Yes', 'No'];
  return [];
}


/** The terminal's own copy (OSC 52), wrapped for tmux to pass it on when the chat runs inside tmux. */
function osc52(text: string): string {
  const seq = `\x1b]52;c;${Buffer.from(text).toString('base64')}\x07`;
  return process.env.TMUX ? `\x1bPtmux;${seq.replace(/\x1b/g, '\x1b\x1b')}\x1b\\` : seq;
}

/** The system's clipboard, by whichever program is there (pbcopy, wl-copy, xclip, xsel, clip.exe); true when one took it. */
async function toClipboard(text: string): Promise<boolean> {
  const tries: [string, string[]][] = [['pbcopy', []], ['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']], ['clip.exe', []]];
  for (const [cmd, args] of tries) {
    const ok = await new Promise<boolean>((resolve) => {
      try {
        const c = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
        const timer = setTimeout(() => (c.kill(), resolve(false)), 2000);
        c.on('error', () => (clearTimeout(timer), resolve(false)));
        c.on('close', (code) => (clearTimeout(timer), resolve(code === 0)));
        c.stdin.on('error', () => {});
        c.stdin.end(text);
      } catch {
        resolve(false);
      }
    });
    if (ok) return true;
  }
  return false;
}

/** The keys, for /help and /keys: [the key, what it does]. */
const KEYS: [string, string][] = [
  ['Enter', 'send (queued while the agent works)'],
  ['Alt+Enter / Ctrl+J', 'a new line (so does a \\ before Enter)'],
  ['Tab', 'open the menu; accept the highlighted row'],
  ['↑ ↓', 'move in the menu, or go through earlier messages'],
  ['→', 'take the grey suggestion (Alt+→: one word)'],
  ['Ctrl+R', 'search earlier messages'],
  ['Esc', 'close the menu, or stop the turn'],
  ['Ctrl+C', 'clear the line, or stop the turn; twice leaves'],
  ['Ctrl+D', 'leave, on an empty line'],
  ['Ctrl+L', 'clear the screen'],
  ['Ctrl+Z', 'suspend (fg brings it back)'],
];

/** Rows of a key or command and what it does, in two columns, the second wrapped under itself. */
function twoColumns(rows: { head: string; plain: string; what: string }[], look: Look): string[] {
  const { p, width } = look;
  const w = Math.max(...rows.map((r) => strWidth(r.plain))) + 2;
  return rows.flatMap((r) => wrap(p.dim(r.what), width - 1, { first: `${INDENT}${r.head}${' '.repeat(w - strWidth(r.plain))}`, indent: INDENT + ' '.repeat(w) }));
}

/** /keys: the keys. */
function keyLines(look: Look): string[] {
  const { p } = look;
  return [`${INDENT}${p.bold('Keys')}`, ...twoColumns(KEYS.map(([k, what]) => ({ head: p.accent(k), plain: k, what })), look)];
}

/** /help: the commands, the keys, and the rest, each under a heading. */
function helpLines(look: Look): string[] {
  const { p } = look;
  const cmds = SLASH.map((s) => ({ head: `${p.accent(`/${s.name}`)}${s.args ? ` ${p.dim(s.args)}` : ''}`, plain: `/${s.name}${s.args ? ` ${s.args}` : ''}`, what: s.what }));
  const also = [
    { head: p.accent('@file'), plain: '@file', what: 'mention a file: the agent reads it (the menu finds it as you type)' },
    { head: p.accent('!command'), plain: '!command', what: 'run it here, in the folder: the agent does not see it' },
    { head: p.accent('/other'), plain: '/other', what: 'any other /command goes to the agent as it is' },
    { head: p.accent('y n 1'), plain: 'y n 1', what: 'answer a card that waits; words deny it with them' },
  ];
  return [`${INDENT}${p.bold('Commands')}`, ...twoColumns(cmds, look), '', ...keyLines(look), '', `${INDENT}${p.bold('Also')}`, ...twoColumns(also, look)];
}

/** `hydor`, `hydor chat`, `hydor -c`, `hydor resume [key]`: the chat. */
export async function chatCommand(conn: Conn, o: Opts, boot: Boot, message?: string): Promise<number> {
  const plain = !process.stdout.isTTY;
  let key: string | undefined;
  let pickSession = false;
  if (o.cmd === 'resume' && o.args[0]) key = await resolveKey(conn, o.args[0]);
  else if (o.continue) {
    const cwd = o.cwd ? path.resolve(o.cwd) : process.cwd();
    const { sessions } = await conn.api<{ sessions: SessionSummary[] }>('GET', `/api/sessions?limit=20&cwd=${encodeURIComponent(cwd)}`);
    const s = sessions.filter((x) => !x.extra?.parent).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    if (s) key = s.key;
    else process.stderr.write(`No session in ${tildify(cwd, boot.home)} yet: starting a new one.\n`);
  } else if (o.cmd === 'resume' && !plain) {
    // No session named, in a terminal: the chat opens with the sessions to pick from.
    pickSession = true;
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
  return chat.run(key, message ?? (words || undefined), { pickSession });
}


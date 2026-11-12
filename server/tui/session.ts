// One session as the terminal follows it: its timeline (loaded, then kept current by `items` events by their place,
// reloaded after a gap or a reset), its live state and overlay (`live` events: what still streams, steps changed in
// place, approvals), its notes (subagents starting, tiers) and its subagents' summaries (`sessions` events, and a look now
// and then). The Printer turns it into lines printed once and never changed: an item is printed when it is final (a
// streaming text's finished chunks as they finish); what is still under way is left for the redrawn region.
import { EventEmitter } from 'node:events';
import { childReplyOf, type ChildNote } from '../../shared/children.ts';
import type { SessionNote } from '../../shared/features.ts';
import type { BackgroundTask, LiveOverlay, LiveState, ServerEvent, SessionSummary, TimelineItem, TimelinePage, ToolItem, TurnItem } from '../../shared/types.ts';
import { enc, type Conn } from './client.ts';
import { finishedLength } from './markdown.ts';
import { foldedLine, INDENT, itemLines, noteLines, promptLines, textLines, turnLines, type Look } from './lines.ts';

export const EMPTY_OVERLAY: LiveOverlay = { items: [], patches: {}, approvals: [] };

/** Whether a session's agent is at work (or waiting for you in the middle of a turn). */
export const busy = (l: LiveState | null | undefined) => !!l && (l.status === 'starting' || l.status === 'working' || l.status === 'waiting' || l.status === 'stopping');

/** The timeline with the live overlay over it, as the web app merges them (Timeline.tsx mergeOverlay). */
export function mergeOverlay(items: TimelineItem[], ov?: LiveOverlay): TimelineItem[] {
  if (!ov || (!ov.items.length && !Object.keys(ov.patches).length)) return items;
  const ids = new Set(items.map((i) => i.id));
  const merged = items.map((i): TimelineItem => {
    if (i.kind !== 'tool') return i;
    const p = ov.patches[i.id];
    if (p) return { ...i, tool: { ...i.tool, ...p } };
    if (i.tool.status === 'running') {
      const o = ov.items.find((x) => x.id === i.id);
      if (o?.kind === 'tool' && o.tool.liveOutput) return { ...i, tool: { ...i.tool, liveOutput: o.tool.liveOutput } };
    }
    return i;
  });
  // A step still streaming (no transcript copy yet) takes its patches too: waiting its turn, when it really started.
  const extra = ov.items
    .filter((i) => !ids.has(i.id) && !savedCopy(items, i))
    .map((i): TimelineItem => (i.kind === 'tool' && ov.patches[i.id] ? { ...i, tool: { ...i.tool, ...ov.patches[i.id] } } : i))
    .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return extra.length ? [...merged, ...extra] : merged;
}

/** The transcript's copy of a message the agent was sent (the server matches them by their words, within 5 s). */
function savedCopy(items: TimelineItem[], o: TimelineItem): TimelineItem | undefined {
  if (o.kind !== 'user') return;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== 'user') continue;
    if ((it.ts ?? 0) < (o.ts ?? 0) - 5000) return;
    if (it.text.trim() === o.text.trim()) return it;
  }
}

/** A subagent as its lead knows it: its card, its summary, and how many of its turns have reported back. */
export interface Helper {
  key: string;
  note: ChildNote;
  summary: SessionSummary | null;
  /** Turns it began (finding it counts as one) and replies its lead got. */
  turns: number;
  replies: number;
  /** When it stopped working with a reply still to come. */
  idleSince?: number;
  /** Stepped up: another subagent took over its job, and its reply never comes. */
  replaced?: boolean;
}

/** How long a subagent's reply may take to reach its lead after it stopped working (the reply may be summarized, or checked). */
const REPLY_GRACE_MS = 120_000;

export class SessionView extends EventEmitter {
  items: TimelineItem[] = [];
  start = 0;
  live: LiveState | null = null;
  overlay: LiveOverlay = EMPTY_OVERLAY;
  summary: SessionSummary | null = null;
  notes: SessionNote[] = [];
  helpers = new Map<string, Helper>();
  loaded = false;
  /** Turns that ended since following began (the agent went from working to not). */
  turnsEnded = 0;
  private loading: Promise<void> | null = null;
  private early: ServerEvent[] = [];
  private poller: NodeJS.Timeout | null = null;
  private onEvent = (e: ServerEvent) => this.handle(e);
  private onUp = () => void this.reload();

  constructor(
    private conn: Conn,
    public key: string,
    private o: { limit?: number; poll?: number } = {},
  ) {
    super();
  }

  /** Subscribes and loads: the timeline, the live state, the notes and the subagents. */
  async open() {
    const ev = this.conn.events();
    ev.on('event', this.onEvent);
    ev.on('up', this.onUp);
    ev.sub(this.key);
    await this.reload();
    if (this.o.poll) {
      this.poller = setInterval(() => void this.refresh().catch(() => {}), this.o.poll);
      this.poller.unref?.();
    }
  }

  close() {
    const ev = this.conn.events();
    ev.off('event', this.onEvent);
    ev.off('up', this.onUp);
    ev.unsub(this.key);
    if (this.poller) clearInterval(this.poller);
  }

  /** Loads it all again (after a reconnect, a reset or a gap). */
  reload(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const [one, page, notes] = await Promise.all([
          this.conn.api<{ summary: SessionSummary | null; live: LiveState | null; overlay: LiveOverlay }>('GET', `/api/sessions/${enc(this.key)}`),
          this.conn.api<TimelinePage>('GET', `/api/sessions/${enc(this.key)}/timeline?limit=${this.o.limit ?? 2000}&whole=1`),
          this.conn.api<{ notes: SessionNote[] }>('GET', `/api/sessions/${enc(this.key)}/notes`).catch(() => ({ notes: [] as SessionNote[] })),
        ]);
        this.setLive(one.live, one.overlay ?? EMPTY_OVERLAY);
        if (one.summary) this.summary = one.summary;
        this.items = page.items;
        this.start = page.start;
        this.notes = notes.notes;
        for (const n of this.notes) this.noteHelper(n);
        this.loaded = true;
        for (const e of this.early.splice(0)) this.handle(e);
        await this.refreshHelpers();
      } finally {
        this.loading = null;
      }
      this.emit('change');
    })();
    return this.loading;
  }

  /** A look at the session and its subagents now (as the socket would have told, in case it did not). */
  async refresh() {
    const one = await this.conn.api<{ summary: SessionSummary | null; live: LiveState | null; overlay: LiveOverlay }>('GET', `/api/sessions/${enc(this.key)}`);
    if (one.summary) this.summary = one.summary;
    this.setLive(one.live, one.overlay ?? EMPTY_OVERLAY);
    await this.refreshHelpers();
    this.emit('change');
  }

  private async refreshHelpers() {
    await Promise.all(
      [...this.helpers.values()].map(async (h) => {
        try {
          const r = await this.conn.api<{ summary: SessionSummary | null; live: LiveState | null }>('GET', `/api/sessions/${enc(h.key)}`);
          if (r.summary) this.setHelper(h, { ...r.summary, live: r.live });
        } catch {}
      }),
    );
  }

  private setLive(live: LiveState | null, overlay: LiveOverlay) {
    if (busy(this.live) && !busy(live)) this.turnsEnded++;
    this.live = live;
    this.overlay = overlay;
  }

  private setHelper(h: Helper, s: SessionSummary) {
    const was = busy(h.summary?.live);
    const now = busy(s.live);
    if (!was && now && h.summary) h.turns++;
    if (was && !now) h.idleSince = Date.now();
    h.summary = s;
  }

  /** A note: a subagent's card makes it one of the subagents. */
  private noteHelper(n: SessionNote) {
    if (n.kind !== 'child') return;
    const c = n.data as ChildNote;
    if (!c?.child) return;
    if (c.steppedFrom) {
      const old = this.helpers.get(c.steppedFrom.key);
      if (old) old.replaced = true;
    }
    if (this.helpers.has(c.child)) return;
    const replies = this.items.filter((i) => i.kind === 'user' && childReplyOf(i.text)?.key === c.child).length;
    this.helpers.set(c.child, { key: c.child, note: c, summary: null, turns: 1, replies });
    void this.conn
      .api<{ summary: SessionSummary | null; live: LiveState | null }>('GET', `/api/sessions/${enc(c.child)}`)
      .then((r) => {
        const h = this.helpers.get(c.child);
        if (h && r.summary) this.setHelper(h, { ...r.summary, live: r.live });
        this.emit('change');
      })
      .catch(() => {});
  }

  /** A reply from a subagent in the lead's conversation. */
  private countReply(it: TimelineItem) {
    if (it.kind !== 'user') return;
    const r = childReplyOf(it.text);
    const h = r && this.helpers.get(r.key);
    if (h) {
      h.replies++;
      h.idleSince = undefined;
    }
  }

  private handle(e: ServerEvent) {
    if (e.t === 'sessions') {
      let changed = false;
      for (const s of e.upsert) {
        if (s.key === this.key) {
          this.summary = s;
          changed = true;
        }
        const h = this.helpers.get(s.key);
        if (h) {
          this.setHelper(h, s);
          changed = true;
        }
      }
      if (changed) this.emit('change');
      return;
    }
    if (!('key' in e) || e.key !== this.key) return;
    if (!this.loaded && (e.t === 'items' || e.t === 'note')) {
      this.early.push(e);
      return;
    }
    if (e.t === 'live') {
      this.setLive(e.live, e.overlay ?? EMPTY_OVERLAY);
      this.emit('change');
    } else if (e.t === 'items') {
      if (e.reset) {
        void this.reload();
        return;
      }
      const seen = new Set(this.items.map((i) => i.id));
      for (const it of e.items) {
        const i = it.seq - this.start;
        if (i < 0) continue;
        if (i < this.items.length) this.items[i] = it;
        else if (i === this.items.length) this.items.push(it);
        else {
          // A gap: something was missed; load it all again.
          void this.reload();
          return;
        }
        if (!seen.has(it.id)) this.countReply(it);
      }
      this.emit('change');
    } else if (e.t === 'note') {
      if (e.removed) this.notes = this.notes.filter((n) => n.id !== e.note.id);
      else {
        const at = this.notes.findIndex((n) => n.id === e.note.id);
        if (at >= 0) this.notes[at] = e.note;
        else this.notes.push(e.note);
        this.noteHelper(e.note);
      }
      this.emit('change');
    }
  }

  /** The conversation as it shows: the timeline with what is still streaming over it. */
  merged(): TimelineItem[] {
    return mergeOverlay(this.items, this.overlay);
  }

  /** Whether an item is only in the overlay (not yet in the transcript). */
  isOverlay(id: string): boolean {
    return !this.items.some((i) => i.id === id);
  }

  /** Subagents at work, and those whose reply is still on its way to the lead. */
  helpersWorking(): Helper[] {
    return [...this.helpers.values()].filter((h) => !h.replaced && busy(h.summary?.live));
  }

  helpersOwed(now = Date.now()): Helper[] {
    return [...this.helpers.values()].filter((h) => !h.replaced && !busy(h.summary?.live) && h.turns > h.replies && (!h.idleSince || now - h.idleSince < REPLY_GRACE_MS));
  }

  /** A subagent waiting for you (an approval or a question in its own session). */
  helperWaiting(): Helper | undefined {
    return [...this.helpers.values()].find((h) => h.summary?.live?.status === 'waiting' || (h.summary?.live?.pendingApprovals ?? 0) > 0);
  }

  /** Messages waiting in its queue (not held after a stop). */
  queued(): number {
    return this.summary?.queueHeld ? 0 : (this.summary?.queue?.length ?? 0);
  }

  /**
   * The subagents at work in the background now (Claude Code's own, kind "local_agent"): the session's, then each
   * subagent's. The agent ended its turn with them running and is woken as each one ends, so the work is not done. A
   * command left running in the background ("local_bash", such as a dev server) may never end: it does not count.
   */
  background(): { key: string; task: BackgroundTask }[] {
    const out: { key: string; task: BackgroundTask }[] = [];
    for (const t of this.live?.backgroundTasks ?? []) if (backgroundHelper(t)) out.push({ key: this.key, task: t });
    for (const h of this.helpers.values()) {
      if (h.replaced) continue;
      for (const t of h.summary?.live?.backgroundTasks ?? []) if (backgroundHelper(t)) out.push({ key: h.key, task: t });
    }
    return out;
  }

  /**
   * Whether the work is done: its turn ended, no subagent works or owes a reply, nothing works in the background (its
   * own or a subagent's), and nothing waits in its queue.
   */
  settled(): boolean {
    return !busy(this.live) && !this.helpersWorking().length && !this.helpersOwed().length && !this.background().length && !this.queued();
  }

  /**
   * The end of the latest turn, when it has ended: no message (yours or a subagent's) came after it, nor the end of a
   * task in the background (which wakes the agent for another turn).
   */
  lastTurn(): TurnItem | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.kind === 'turn') return it;
      if (it.kind === 'user' || (it.kind === 'system' && backgroundEnd(it.text))) return undefined;
    }
  }
}

/** A subagent of Claude Code's own at work in the background (not a command left running there). */
export const backgroundHelper = (t: BackgroundTask) => (t.kind ?? '').includes('agent') && t.status === 'running';

/** A notice that a task in the background ended ("Background task completed: Check the docs"): how, and what it was. */
export function backgroundEnd(text: string): { status: string; what: string } | null {
  const m = /^Background task (\w+): ([\s\S]*)$/.exec(text.trim());
  return m ? { status: m[1], what: m[2].trim() } : null;
}

/** What the app or the program put in the conversation, not the person: a command such as "/model …" (a step up to Max leaves one) and what it printed, a note. */
const aside = (it: TimelineItem) => it.kind === 'user' && (it.meta === 'slash' || it.meta === 'command-output' || it.meta === 'note');

/** The agent's last reply: its text after its last step in the latest turn (several texts in a row, together). */
export function lastReply(items: TimelineItem[]): string {
  const out: string[] = [];
  let i = items.length - 1;
  while (i >= 0 && (items[i].kind === 'turn' || items[i].kind === 'system' || items[i].kind === 'thinking' || aside(items[i]))) i--;
  for (; i >= 0; i--) {
    const it = items[i];
    if (it.kind === 'assistant') {
      if (it.text.trim()) out.unshift(it.text.trim());
    } else if (it.kind === 'thinking') continue;
    else break;
  }
  return out.join('\n\n');
}

// ---- printing --------------------------------------------------------------------------------------------

/** The app's own step that starts a subagent: its card (the note) says it already. */
const HIDDEN_STEP = /(^|__)start_child_session$/;

/** Whether an item will not change any more, so it can be printed. A step in the background is printed as it starts. */
export function final(it: TimelineItem): boolean {
  if (it.kind === 'assistant' || it.kind === 'thinking') return !it.streaming;
  if (it.kind === 'tool') return !(it.tool.status === 'running' || it.tool.status === 'pending' || it.tool.status === 'waiting') || (!!it.tool.background && it.tool.status !== 'waiting');
  return true;
}

type Group = 'prompt' | 'text' | 'step' | 'turn';

/**
 * What is printed for good, once: each item when it is final, in order (an item still under way holds back those
 * after it, for the region), a streaming text's finished chunks as they finish, notes as they come. `brief` prints
 * steps, subagents and notes only (a run's progress).
 */
export class Printer {
  private printed = new Set<string>();
  private streamed = new Map<string, number>();
  private notesSeen = new Set<string>();
  private echoes: string[] = [];
  private last: Group | null = null;
  /** Subagents started in the turn under way, for its end line. */
  private turnHelpers: string[] = [];

  constructor(
    public look: Look,
    private o: { brief?: boolean } = {},
  ) {}

  /** Your own message, printed as you sent it: its copy in the conversation is not printed again. */
  echo(text: string): string[] {
    this.echoes.push(text.trim());
    this.turnHelpers = [];
    return this.block('prompt', promptLines(text, this.look));
  }

  /** Lines printed outside the conversation (a command's answer): the next block keeps its blank line. */
  aside(lines: string[]): string[] {
    if (!lines.length) return [];
    this.last = 'turn';
    return ['', ...lines];
  }

  /** Everything there now counts as printed (history shown another way, or not at all). */
  skipAll(view: SessionView) {
    for (const it of view.merged()) if (final(it)) this.printed.add(it.id);
    for (const n of view.notes) this.notesSeen.add(n.id);
    this.last = 'turn';
  }

  private block(g: Group, lines: string[]): string[] {
    if (!lines.length) return [];
    const gap = this.last !== null && !(g === 'step' && this.last === 'step');
    this.last = g;
    return gap ? ['', ...lines] : lines;
  }

  private groupOf(it: TimelineItem): Group {
    if (it.kind === 'assistant') return 'text';
    if (it.kind === 'turn') return 'turn';
    if (it.kind === 'user' && !childReplyOf(it.text) && !it.peer && it.meta !== 'note' && it.meta !== 'command-output') return 'prompt';
    return 'step';
  }

  /** Whether a message is one you sent from here (printed already); its first copy only. */
  private echoed(it: TimelineItem): boolean {
    if (it.kind !== 'user') return false;
    const t = it.text.trim();
    const at = this.echoes.findIndex((e) => e === t || t.startsWith(e) || (e.length > 20 && e.startsWith(t)));
    if (at < 0) return false;
    this.echoes.splice(at, 1);
    return true;
  }

  /** The lines of an item that has become final. */
  private finalLines(it: TimelineItem, view: SessionView): string[] {
    if (it.kind === 'tool' && HIDDEN_STEP.test(it.tool.name)) return [];
    if (this.o.brief && (it.kind === 'assistant' || it.kind === 'thinking' || (it.kind === 'user' && this.groupOf(it) === 'prompt'))) return [];
    if (it.kind === 'assistant') {
      const had = this.streamed.get(it.id) ?? 0;
      this.streamed.delete(it.id);
      if (had) {
        const rest = it.text.slice(had);
        return rest.trim() ? textLines(rest, this.look) : [];
      }
    }
    if (it.kind === 'turn') {
      const costs = this.turnHelpers.map((k) => view.helpers.get(k)?.summary?.stats.costUsd ?? 0);
      const lines = turnLines(it, this.look, { helpers: this.turnHelpers.length, costUsd: this.turnHelpers.length ? (it.costUsd ?? 0) + costs.reduce((a, b) => a + b, 0) : undefined });
      this.turnHelpers = [];
      return lines;
    }
    if (it.kind === 'user' && this.groupOf(it) === 'prompt') this.turnHelpers = [];
    return itemLines(it, this.look);
  }

  /** New lines to print for good, and the items still under way (shown in the region). */
  take(view: SessionView): { lines: string[]; pending: TimelineItem[] } {
    const out: string[] = [];
    const pending: TimelineItem[] = [];
    // Notes first: they come as they happen.
    for (const n of view.notes) {
      if (this.notesSeen.has(n.id)) continue;
      this.notesSeen.add(n.id);
      if (n.kind === 'child') this.turnHelpers.push((n.data as ChildNote).child);
      const lines = noteLines(n, this.look);
      if (lines) out.push(...this.block('step', lines));
    }
    let held = false;
    for (const it of view.merged()) {
      if (this.printed.has(it.id)) continue;
      if (held) {
        pending.push(it);
        continue;
      }
      if (this.echoed(it)) {
        this.printed.add(it.id);
        // Its copy in the transcript (another id) is one we printed too.
        if (view.isOverlay(it.id) && it.kind === 'user') this.echoes.push(it.text.trim());
        continue;
      }
      if (final(it)) {
        const lines = this.finalLines(it, view);
        // The rest of a text whose start is printed: a blank line after it, as between its chunks.
        if (lines.length) out.push(...this.block(this.groupOf(it), lines));
        this.printed.add(it.id);
        if (it.kind === 'user' && view.isOverlay(it.id)) this.echoes.push(it.text.trim());
        continue;
      }
      if (it.kind === 'assistant' && !this.o.brief) {
        // Its finished chunks now; the rest stays in the region.
        const done = finishedLength(it.text);
        const had = this.streamed.get(it.id) ?? 0;
        if (done > had) {
          const lines = textLines(it.text.slice(had, done), this.look);
          if (lines.length) out.push(...(had ? ['', ...lines] : this.block('text', lines)));
          this.streamed.set(it.id, done);
        }
      }
      held = true;
      pending.push(it);
    }
    return { lines: out, pending };
  }

  /** Whether the last lines printed were steps (the region's steps then follow them with no blank line). */
  afterSteps(): boolean {
    return this.last === 'step';
  }

  /** What is left of a streaming text for the region (its unfinished end). */
  rest(it: TimelineItem): string {
    if (it.kind !== 'assistant') return '';
    return it.text.slice(this.streamed.get(it.id) ?? 0);
  }
}

// ---- history ---------------------------------------------------------------------------------------------

/** A conversation as lines: each turn's messages, its work folded into a line (each step with -v), its reply, its end. */
export function historyLines(items: TimelineItem[], notes: SessionNote[], look: Look, o: { turns?: number } = {}): string[] {
  // Turns: from a message of yours (or a subagent's reply, or a notice that started it) to its end.
  const turns: TimelineItem[][] = [];
  let cur: TimelineItem[] = [];
  for (const it of items) {
    if (it.kind === 'user' && cur.some((x) => x.kind !== 'user')) {
      turns.push(cur);
      cur = [];
    }
    cur.push(it);
    if (it.kind === 'turn') {
      turns.push(cur);
      cur = [];
    }
  }
  if (cur.length) turns.push(cur);
  const byAnchor = new Map<string, SessionNote[]>();
  for (const n of notes) if (n.anchor) byAnchor.set(n.anchor, [...(byAnchor.get(n.anchor) ?? []), n]);
  const shown = o.turns ? turns.slice(-o.turns) : turns;
  const out: string[] = [];
  const skipped = turns.length - shown.length;
  if (skipped > 0) out.push(look.p.dim(`… ${skipped} earlier ${skipped === 1 ? 'turn' : 'turns'}`), '');
  for (const t of shown) {
    // The reply: the texts after the last step.
    let a = t.length;
    while (a > 0 && (t[a - 1].kind === 'turn' || t[a - 1].kind === 'system')) a--;
    // What opened it: your message, a subagent's reply, or a task in the background that ended and woke the agent.
    let u = 0;
    while (u < t.length && (t[u].kind === 'user' || (t[u].kind === 'system' && !!backgroundEnd((t[u] as { text: string }).text)))) u++;
    let r = a;
    while (r > u && (t[r - 1].kind === 'assistant' || t[r - 1].kind === 'thinking')) r--;
    const lead = t.slice(0, u);
    const work = t.slice(u, r);
    const blocks: string[][] = [];
    for (const u of lead) blocks.push(itemLines(u, look));
    const noteLs = t.flatMap((x) => byAnchor.get(x.id) ?? []).flatMap((n) => noteLines(n, look) ?? []);
    if (look.verbose) {
      const steps = work.flatMap((x) => (x.kind === 'assistant' ? ['', ...itemLines(x, look), ''] : itemLines(x, look)));
      if (steps.length || noteLs.length) blocks.push([...noteLs, ...steps]);
    } else {
      const folded = foldedLine(work, look);
      if (folded.length || noteLs.length) blocks.push([...noteLs, ...folded]);
    }
    const reply = t.slice(Math.max(r, u), a).filter((x) => x.kind === 'assistant' && x.text.trim());
    for (const x of reply) blocks.push(itemLines(x, look));
    for (const x of t.slice(a)) if (x.kind === 'turn' || x.kind === 'system') blocks.push(itemLines(x, look));
    for (const b of blocks) {
      if (!b.length) continue;
      if (out.length && out[out.length - 1] !== '') out.push('');
      out.push(...b);
    }
  }
  return out.filter((l, i, all) => !(l === '' && (i === 0 || all[i - 1] === '')));
}


import { createContext, Fragment, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Check, ChevronRight, FileDiff, FilePen, FilePlus2, FileText, FileX, Info, X } from 'lucide-react';
import type { Agent, ApprovalRequest, ExternalState, FileChange, LiveOverlay, LiveState, SystemItem, TimelineItem, ToolItem, TurnItem, UserItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { sentPicturesOf, useSentPictures, type SentPictures } from '../../lib/attachments';
import { basename, compact, dirname, duration, prettyPath } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { useApp, useSessions, useTimeline } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Throbber } from '../../components/ui';
import { ApprovalCard } from './Approval';
import { AgentIcon } from '../../components/AgentIcon';
import { QuoteSelection } from './QuoteSelection';
import { AssistantBlock, hiddenThought, SessionCtx, StepLine, stepsIcon, summarize, SystemRow, ThinkingRow, ToolRow, UNFOLD, UserBubble, WorkTime } from './items';
import { noteLike, noteTitle, partsOf, plainText, type Part } from './outline';
import { toolView } from '../registry';
import { LooseNotes, TurnNotes, useSessionNotes } from './Notes';
import type { SessionNote } from '@shared/features';
import { runEndedNotice } from '@shared/apps';
import { LOCALE } from '../../i18n/locale';

/**
 * Custom works with Hydor's loading mark; other agents keep their own animation. `name`: an agent of Settings → More
 * agents by name, for a session not in the list yet (one starting); otherwise the session's own.
 */
function WorkingIcon({ agent, name, size, spinning, className }: { agent: Agent; name?: string; size: number; spinning?: boolean; className?: string }) {
  const { sessionKey } = useContext(SessionCtx);
  const own = useSessions((s) => (sessionKey ? s.byKey[sessionKey]?.acpName : undefined));
  const n = name ?? own;
  if (agent === 'acp' && (n === 'Custom' || n === 'Console') && spinning) return <Throbber size={size} className={className} />;
  return <AgentIcon agent={agent} name={n} size={size} spinning={spinning} className={className} />;
}

/**
 * What the head of a turn under way says: the agent at work (or waiting for you), where, and for how long. A session
 * you just started shows it from the moment you press Start (StartingSession.tsx), so its page never changes look.
 */
export function LiveHead({ agent, name, live }: { agent: Agent; name?: string; live: LiveInfo }) {
  const waiting = live.status === 'waiting';
  return (
    <>
      <WorkingIcon agent={agent} name={name} size={15} spinning={!waiting} className={waiting ? 'breathe' : undefined} />
      <span className={cx('font-medium', waiting ? 'text-warn' : 'text-busy')}>
        {waiting ? 'Waiting for you' : live.status === 'starting' ? 'Starting' : 'Working'}
        {live.where ? ` in ${live.where}` : ''}
      </span>
      <WorkTime since={live.since} before={live.worked} className="text-fg-3" />
    </>
  );
}

export function mergeOverlay(items: TimelineItem[], ov?: LiveOverlay): TimelineItem[] {
  if (!ov || (!ov.items.length && !Object.keys(ov.patches).length)) return items;
  const ids = new Set(items.map((i) => i.id));
  const merged = items.map((i): TimelineItem => {
    if (i.kind !== 'tool') return i;
    const p = ov.patches[i.id];
    if (p) return { ...i, tool: { ...i.tool, ...p } };
    // A command still running in the transcript gets the live output from the overlay copy.
    if (i.tool.status === 'running') {
      const o = ov.items.find((x) => x.id === i.id);
      if (o?.kind === 'tool' && o.tool.liveOutput) return { ...i, tool: { ...i.tool, liveOutput: o.tool.liveOutput } };
    }
    return i;
  });
  // A message the transcript has under an id of its own shows once: the server drops its copy a moment later.
  const extra = ov.items.filter((i) => !ids.has(i.id) && !savedCopy(items, i)).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return extra.length ? [...merged, ...extra] : merged;
}

/** The transcript's copy of a message the agent was sent, as the server matches them (server/agents/live.ts, prune). */
function savedCopy(items: TimelineItem[], o: TimelineItem): TimelineItem | undefined {
  if (o.kind !== 'user') return;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== 'user') continue;
    if ((it.ts ?? 0) < (o.ts ?? 0) - 5000) return;
    if (it.text.trim() === o.text.trim()) return it;
  }
}

/** Whether the reader is following the conversation as it comes (not reading further up). */
const FollowCtx = createContext<() => boolean>(() => true);

// ---- turns ---------------------------------------------------------------------------------

/**
 * One exchange: what you said, the agent's work (steps and in-between notes), and the
 * reply it ended on. A message sent while it works opens the next one.
 */
interface Segment {
  id: string;
  prompt?: UserItem;
  /** The app run whose end the prompt told the agent of (use_app): the prompt shows no bubble, the run's card shows after the reply. */
  runEnded?: string;
  /** A notice that started the agent without a prompt (a background task finished). */
  notice?: SystemItem;
  work: TimelineItem[];
  answer: TimelineItem[];
  /** Open questions: shown outside the folded work. */
  attention: TimelineItem[];
  end?: TurnItem;
  /** By the id of a call the reply shows, the turn's other calls that made the same (`same`), and the first of them all. */
  same: Map<string, { first: string; others: ToolItem[] }>;
}

const isOpenQuestion = (it: TimelineItem) =>
  it.kind === 'tool' && it.tool.category === 'question' && (it.tool.status === 'running' || it.tool.status === 'pending' || it.tool.status === 'waiting') && !Object.keys(it.tool.answers ?? {}).length;

/** Where one of the app's own tools shows (registry.tsx): with the reply, outside the fold, or in the work. */
const placeOf = (it: TimelineItem) => (it.kind === 'tool' ? toolView(it.tool.name, it.tool)?.place : undefined);

/** A call that came to nothing: it failed, was declined, or was stopped. */
const cameToNothing = (i: ToolItem) => i.tool.status === 'error' || i.tool.status === 'declined' || i.tool.status === 'interrupted';

/**
 * Of a turn's calls that make the same thing (the saves of one page, by `same` in registry.tsx): the newest that did
 * not come to nothing, which the reply shows, and the others, which stay steps of the work.
 */
function newestOfSame(items: TimelineItem[]): { hidden: Set<string>; same: Segment['same'] } {
  const groups = new Map<string, ToolItem[]>();
  for (const it of items) {
    const k = it.kind === 'tool' ? toolView(it.tool.name, it.tool)?.same?.(it.tool) : undefined;
    if (k) groups.set(k, [...(groups.get(k) ?? []), it as ToolItem]);
  }
  const hidden = new Set<string>();
  const same: Segment['same'] = new Map();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const lead = g.filter((i) => !cameToNothing(i)).pop() ?? g[g.length - 1];
    const others = g.filter((i) => i !== lead);
    for (const i of others) hidden.add(i.id);
    same.set(lead.id, { first: g[0].id, others });
  }
  return { hidden, same };
}

function segment(items: TimelineItem[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  const open = (id: string) => {
    cur = { id, work: [], answer: [], attention: [], same: new Map() };
    out.push(cur);
    return cur;
  };
  for (const it of items) {
    if (it.kind === 'user' && it.meta !== 'note' && it.meta !== 'command-output') {
      const seg = open(`seg:${it.id}`);
      seg.prompt = it;
      const run = runEndedNotice(it.text ?? '');
      if (run !== null) seg.runEnded = run;
      continue;
    }
    if (it.kind === 'turn') {
      (cur ?? open(`seg:${it.id}`)).end = it;
      cur = null;
      continue;
    }
    if (!cur) {
      const seg = open(`seg:${it.id}`);
      if (it.kind === 'system') {
        seg.notice = it;
        continue;
      }
    }
    cur!.work.push(it);
  }
  for (const s of out) {
    s.attention = s.work.filter((i) => isOpenQuestion(i) || placeOf(i) === 'attention');
    if (s.attention.length) s.work = s.work.filter((i) => !s.attention.includes(i));
    // Pages the agent showed (and what else the app's tools put with a reply) belong with it, outside the folded work;
    // a page saved several times, once: its newest version. Its earlier saves stay steps of the work.
    const withReply = s.work.filter((it) => placeOf(it) === 'answer');
    const { hidden, same } = newestOfSame(withReply);
    // Its card stays where the page first came, whichever save it shows.
    const at = new Map([...same].map(([lead, g]) => [g.first, withReply.find((it) => it.id === lead)!]));
    const pages = withReply.flatMap((it) => (at.has(it.id) ? [at.get(it.id)!] : hidden.has(it.id) || same.has(it.id) ? [] : [it]));
    s.same = same;
    if (pages.length) s.work = s.work.filter((it) => !pages.includes(it));
    // The reply is what the agent wrote after its last step.
    let last = -1;
    s.work.forEach((it, i) => {
      if (it.kind === 'tool' || (it.kind === 'thinking' && !hiddenThought(it))) last = i;
    });
    s.answer = [...pages, ...s.work.filter((it, i) => i > last && it.kind === 'assistant')];
    if (s.answer.length > pages.length) s.work = s.work.filter((it, i) => !(i > last && it.kind === 'assistant'));
  }
  return out;
}

/**
 * The reply's items, with the later calls of a tool that shows them together (`many`) in its first one's `more`, and
 * the turn's other calls that made the same as one (`same`) in its `more`. `key` stays the same while a page is saved
 * again: its card stays in place and shows the new version.
 */
function together(items: TimelineItem[], same: Segment['same']): { key: string; item: TimelineItem; more?: ToolItem[] }[] {
  const out: { key: string; item: TimelineItem; more?: ToolItem[] }[] = [];
  const first = new Map<string, { key: string; item: TimelineItem; more?: ToolItem[] }>();
  for (const it of items) {
    const lead = it.kind === 'tool' && toolView(it.tool.name, it.tool)?.many ? first.get(it.tool.name) : undefined;
    if (lead) (lead.more ??= []).push(it as ToolItem);
    else {
      const s = same.get(it.id);
      const e = { key: s?.first ?? it.id, item: it, ...(s ? { more: s.others } : {}) };
      if (it.kind === 'tool' && toolView(it.tool.name, it.tool)?.many) first.set(it.tool.name, e);
      out.push(e);
    }
  }
  return out;
}

/** A file a turn changed: totals plus each edit, for the diff. */
interface FileEntry {
  path: string;
  added: number;
  removed: number;
  created: boolean;
  deleted: boolean;
  movedTo?: string;
  edits: { itemId: string; change: FileChange }[];
}

function workStats(items: TimelineItem[]) {
  let commands = 0;
  let steps = 0;
  let added = 0;
  let removed = 0;
  const files = new Map<string, FileEntry>();
  for (const it of items) {
    if (it.kind !== 'tool') continue;
    steps++;
    if (it.tool.category === 'command') commands++;
    for (const f of (it.tool.files ?? []) as FileChange[]) {
      const cur = files.get(f.path) ?? { path: f.path, added: 0, removed: 0, created: f.op === 'create', deleted: false, edits: [] };
      cur.added += f.added;
      cur.removed += f.removed;
      cur.deleted = f.op === 'delete';
      if (f.op === 'move' && f.movePath) cur.movedTo = f.movePath;
      cur.edits.push({ itemId: it.id, change: f });
      files.set(f.path, cur);
      added += f.added;
      removed += f.removed;
    }
  }
  return { commands, steps, added, removed, files };
}

const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86400_000) return 'Yesterday';
  return d.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

/** The day the conversation's turns below it are from, on a line across it ("Yesterday", "Today"); none over a conversation all from today. */
export function DayLine({ day }: { day: string }) {
  return (
    <div className="flex items-center gap-3 text-[12px] font-medium text-fg-3">
      <span className="h-px flex-1 bg-line" />
      {day}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

const isActive = (i: TimelineItem) => (i.kind === 'tool' && (i.tool.status === 'running' || i.tool.status === 'pending')) || (i.kind === 'thinking' && !!i.streaming);

/** Where a part of the work stands: done, under way, waiting for you, or where a stopped or failed turn ended. */
type PartState = 'done' | 'now' | 'waiting' | 'stopped' | 'failed';

/** A part's mark on the outline's line: a check when done, a dot while under way. */
function Marker({ state }: { state: PartState }) {
  return (
    <span
      className={cx(
        'relative z-[1] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-bg',
        state === 'now' ? 'border-busy' : state === 'waiting' || state === 'stopped' ? 'border-warn' : state === 'failed' ? 'border-err' : 'border-line-2 text-fg-3',
      )}
    >
      {state === 'done' && <Check size={9} strokeWidth={3.2} />}
      {state === 'now' && <span className="h-1.5 w-1.5 rounded-full bg-busy" />}
      {state === 'waiting' && <span className="h-1.5 w-1.5 rounded-full bg-warn" />}
      {state === 'stopped' && <span className="h-1.5 w-1.5 rounded-[1px] bg-warn" />}
      {state === 'failed' && <X size={9} strokeWidth={3.2} className="text-err" />}
    </span>
  );
}

/** A part's steps, opened: each on its line, as the agent took them. */
function PartSteps({ items, sessionKey }: { items: TimelineItem[]; sessionKey: string }) {
  const shown = items.filter((i) => !hiddenThought(i));
  if (!shown.length) return null;
  return (
    <div className="-ml-2 space-y-0.5">
      {shown.map((it) => (
        <div key={it.id}>
          {it.kind === 'tool' ? (
            it.tool.category === 'plan' ? (
              <div className="rounded-xl border border-line bg-bg-1 p-1">
                <ToolRow item={it} sessionKey={sessionKey} inWork />
              </div>
            ) : (
              <ToolRow item={it} sessionKey={sessionKey} inWork />
            )
          ) : it.kind === 'thinking' ? (
            <ThinkingRow item={it} />
          ) : it.kind === 'system' ? (
            <SystemRow item={it} />
          ) : it.kind === 'user' ? (
            <UserBubble item={it} />
          ) : it.kind === 'assistant' ? (
            <AssistantBlock item={it} note quiet />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** What a part's line says: its note in a few words, else what its steps did ("Ran 3 commands"), with their count and changes. */
function usePartSum(part: Part) {
  return useMemo(() => {
    const tools = part.items.filter((i): i is ToolItem => i.kind === 'tool');
    const sum = summarize(tools);
    const said = part.notes.map((n) => n.text).join('\n');
    const thought = part.items.reduce((ms, i) => ms + (i.kind === 'thinking' && !hiddenThought(i) ? (i.durationMs ?? 0) : 0), 0);
    const own = said ? noteTitle(said) : '';
    const title = own || (tools.length ? sum.text : thought >= 1000 ? `Thought for ${duration(thought)}` : 'Thought');
    // The whole note when the line shows it cut short; a line of steps says it all.
    return { tools, sum, title, own: !!own, about: said ? plainText(said).slice(0, 300) : undefined };
  }, [part.notes, part.items]);
}

/** A part of the work on one line; opened, its note in full and every step. Find in this session opens it on a match. */
const PartLine = memo(function PartLine({ part, state, open, onToggle, sessionKey }: { part: Part; state: PartState; open: boolean; onToggle: (id: string) => void; sessionKey: string }) {
  const { tools, sum, title, own, about } = usePartSum(part);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const unfold = () => onToggle(part.id);
    el.addEventListener(UNFOLD, unfold);
    return () => el.removeEventListener(UNFOLD, unfold);
  }, [open, onToggle, part.id]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => onToggle(part.id)}
        aria-expanded={open}
        data-seq={open ? undefined : part.notes[0]?.seq}
        title={about}
        className="group flex min-h-8 w-full items-center gap-2.5 rounded-lg py-1 pr-2 text-left transition-colors hover:bg-bg-2"
      >
        <Marker state={state} />
        <span translate={own ? 'no' : undefined} className={cx('min-w-0 flex-1 truncate text-[13.5px]', open ? 'text-fg' : 'text-fg-2 group-hover:text-fg')}>
          {title}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[12px] text-fg-3">
          <DiffStat added={sum.added} removed={sum.removed} compact />
          {tools.length > 0 && <span className="tnum">{tools.length === 1 ? '1 step' : `${tools.length} steps`}</span>}
          <ChevronRight size={14} className={cx('transition-transform duration-200', open && 'rotate-90')} />
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 pt-0.5 pb-2 pl-[26px]">
          {part.notes.map((n) => (
            <AssistantBlock key={n.id} item={n} note quiet />
          ))}
          <PartSteps items={part.items} sessionKey={sessionKey} />
        </div>
      )}
    </>
  );
});

/**
 * The part under way: its note in full, and under it the step being taken now (or the agent at work between steps),
 * which opens the part's steps so far.
 */
function NowPart({ part, state, open, onToggle, sessionKey, agent, live }: { part: Part; state: PartState; open: boolean; onToggle: (id: string) => void; sessionKey: string; agent: Agent; live: LiveInfo }) {
  const { tools, sum } = usePartSum(part);
  const shown = part.items.filter((i) => !hiddenThought(i));
  const active = shown.filter(isActive);
  const waitingOn = state === 'waiting' ? [...tools].reverse().find((t) => t.tool.status === 'waiting' || t.tool.status === 'pending') : undefined;
  const now = open ? undefined : (active[active.length - 1] ?? waitingOn);
  const done = tools.filter((i) => !isActive(i)).length;
  const writing = part.notes.some((n) => n.streaming);
  const busy = state === 'now';
  const Icon = stepsIcon(tools);
  const line = now || shown.length > 0 || (busy && !writing);
  // Its mark sits 16px down, where a part's line has it, so the marks keep their spacing to the last; the note's first
  // line (13.5px type at 1.55) is centred on it, as a part's words are.
  return (
    <div className="flex gap-2.5">
      <span className="pt-2">
        <Marker state={state} />
      </span>
      <div className={cx('min-w-0 flex-1', part.notes.length > 0 && 'pt-[5.5px]')}>
        {part.notes.map((n) => (
          <AssistantBlock key={n.id} item={n} note quiet />
        ))}
        {line && (
          <button
            type="button"
            onClick={() => shown.length && onToggle(part.id)}
            aria-expanded={shown.length ? open : undefined}
            className={cx(
              'group -ml-2 flex min-h-8 w-[calc(100%+0.5rem)] items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-fg-3 transition-colors',
              shown.length > 0 && 'hover:bg-bg-2 hover:text-fg-2',
            )}
          >
            {now ? (
              <StepLine item={now} />
            ) : open ? (
              <>
                <Icon size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate">{sum.text}</span>
              </>
            ) : (
              <>
                {busy ? <WorkingIcon agent={agent} size={14} spinning className="shrink-0" /> : <Icon size={14} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{busy ? (live.note ?? '') : sum.text}</span>
              </>
            )}
            {!open && done > 0 && (now || busy) && <span className="shrink-0 text-[11.5px] text-fg-3">{done} done</span>}
            {shown.length > 0 && <ChevronRight size={14} className={cx('shrink-0 transition-transform duration-200', open && 'rotate-90')} />}
          </button>
        )}
        {open && (
          <div className="pb-1">
            <PartSteps items={part.items} sessionKey={sessionKey} />
          </div>
        )}
      </div>
    </div>
  );
}

export interface LiveInfo {
  status: string;
  since?: number;
  /** The turns before this one, their lengths added up (ms). */
  worked?: number;
  where?: string;
  note?: string;
}

/** How many of a turn's parts show, its latest, before "Show N earlier parts": fewer while it runs. */
const PARTS_LIVE = 6;
const PARTS_DONE = 10;

/**
 * Everything the agent did on the way to its reply, as an outline (outline.ts): a part for each note it wrote, on one
 * line with a check, its steps folded under it; the part under way shows its note and the step being taken now. A
 * long turn shows its latest parts, the rest a click away; while it runs, the window only moves on while the reader
 * follows the end, so parts above someone reading never disappear.
 */
function Outline({
  items,
  sessionKey,
  agent,
  live,
  status,
  replying,
  fresh,
}: {
  items: TimelineItem[];
  sessionKey: string;
  agent: Agent;
  live: LiveInfo | null;
  status?: string;
  /** The reply is coming under the outline: its work is done. */
  replying?: boolean;
  fresh: (id: string) => boolean;
}) {
  const parts = useMemo(() => partsOf(items).filter((p) => p.notes.length > 0 || p.items.some((i) => !hiddenThought(i))), [items]);
  const following = useContext(FollowCtx);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) =>
      setOpened((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );
  const [all, setAll] = useState(false);
  const keep = live ? PARTS_LIVE : PARTS_DONE;
  const from = useRef<number | null>(null);
  if (from.current === null) from.current = Math.max(0, parts.length - keep);
  if (live && !all && following()) from.current = Math.max(from.current, parts.length - keep);
  // A button for one or two lines would save nothing.
  const hidden = all || Math.min(from.current, parts.length) < 3 ? 0 : Math.min(from.current, parts.length);
  const shown = hidden ? parts.slice(hidden) : parts;
  const running = !!live && (live.status === 'working' || live.status === 'starting');
  const stateOf = (i: number): PartState => {
    if (i < parts.length - 1 || (live && replying)) return 'done';
    if (live) return running ? 'now' : 'waiting';
    return status === 'interrupted' ? 'stopped' : status === 'failed' ? 'failed' : 'done';
  };
  if (!parts.length) return null;
  return (
    <div className="mt-1 pl-2">
      {hidden > 0 && (
        <button onClick={() => setAll(true)} className="-ml-1 rounded-md px-1 py-1 text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2">
          {`Show ${hidden} earlier parts`}
        </button>
      )}
      <ol>
        {shown.map((p, k) => {
          const i = hidden + k;
          const state = stateOf(i);
          const isLast = i === parts.length - 1;
          return (
            <li
              key={p.id}
              className={cx(
                'relative',
                // The outline's line, from this part's mark to the next one's.
                !isLast && 'after:absolute after:top-4 after:-bottom-4 after:left-[7.5px] after:w-px after:bg-line',
                fresh(p.id) && 'anim-in',
              )}
            >
              {isLast && live && !replying ? (
                <NowPart part={p} state={state} open={opened.has(p.id)} onToggle={toggle} sessionKey={sessionKey} agent={agent} live={live} />
              ) : (
                <PartLine part={p} state={state} open={opened.has(p.id)} onToggle={toggle} sessionKey={sessionKey} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** One changed file's edits from this turn, with the full diff a click away when it was cut. */
function FileDiffs({ f, sessionKey }: { f: FileEntry; sessionKey: string }) {
  const [full, setFull] = useState<Record<number, FileChange>>({});
  const loadFull = async (i: number) => {
    try {
      const it = await api<TimelineItem>(`/api/sessions/${enc(sessionKey)}/items/${enc(f.edits[i].itemId)}`);
      const ch = it.kind === 'tool' ? it.tool.files?.find((x) => x.path === f.path) : undefined;
      if (ch) setFull((m) => ({ ...m, [i]: ch }));
    } catch {}
  };
  return (
    <div className="space-y-2 px-3 pt-1 pb-3">
      {f.edits.map((e, i) => {
        const ch = full[i] ?? e.change;
        return (
          <div key={i} className="overflow-hidden rounded-xl border border-line bg-bg">
            {f.edits.length > 1 && (
              <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] text-fg-3">
                Edit {i + 1} of {f.edits.length}
                <span className="flex-1" />
                <DiffStat added={ch.added} removed={ch.removed} />
              </div>
            )}
            {ch.diff ? <DiffView diff={ch.diff} /> : <div className="px-3 py-2 text-[12.5px] text-fg-3">No diff was recorded for this edit.</div>}
            {ch.diffTruncated && !full[i] && (
              <button onClick={() => loadFull(i)} className="w-full border-t border-line py-1.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
                Load the full diff
              </button>
            )}
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" icon={<FileText size={14} />} onClick={() => openFile(f.path)}>
          Open file
        </Button>
      </div>
    </div>
  );
}

/** Every file a turn changed, under its reply; a file opens its diff in place. */
function TurnChanges({ files, sessionKey }: { files: FileEntry[]; sessionKey: string }) {
  const { cwd } = useContext(SessionCtx);
  const home = useApp((s) => s.boot?.home);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const MAX = 5;
  const shown = all ? files : files.slice(0, MAX);
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
        <FileDiff size={15} className="shrink-0 text-fg-3" />
        <span className="font-medium">{plural(files.length, 'file')} changed</span>
        <DiffStat added={added} removed={removed} compact />
      </div>
      <div className="border-t border-line">
        {shown.map((f) => {
          const rel = prettyPath(f.path, cwd, home);
          const dir = rel.includes('/') ? dirname(rel) : '';
          const isOpen = open === f.path;
          return (
            <div key={f.path} className="border-b border-line last:border-0">
              <button
                onClick={() => setOpen(isOpen ? null : f.path)}
                title={f.path}
                className={cx('flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-bg-2', isOpen && 'bg-bg-1')}
              >
                {f.deleted ? (
                  <FileX size={15} className="shrink-0 text-del" />
                ) : f.created ? (
                  <FilePlus2 size={15} className="shrink-0 text-add" />
                ) : (
                  <FilePen size={15} className="shrink-0 text-fg-3" />
                )}
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span className="shrink-0 truncate text-[13.5px] text-fg">{basename(f.path)}</span>
                  {f.movedTo && <span className="truncate text-[12px] text-fg-3">→ {basename(f.movedTo)}</span>}
                  {dir && <span className="min-w-0 truncate text-[12px] text-fg-3">{dir}</span>}
                </span>
                {f.deleted ? <span className="shrink-0 text-[12px] text-del">deleted</span> : f.created && <span className="shrink-0 text-[12px] text-fg-3">new</span>}
                <DiffStat added={f.added} removed={f.removed} compact />
                <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform duration-200', isOpen && 'rotate-90')} />
              </button>
              {isOpen && <FileDiffs f={f} sessionKey={sessionKey} />}
            </div>
          );
        })}
      </div>
      {files.length > MAX && (
        <button onClick={() => setAll((a) => !a)} className="w-full border-t border-line px-4 py-2 text-left text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2">
          {all ? 'Show fewer' : `Show ${plural(files.length - MAX, 'more file')}`}
        </button>
      )}
    </div>
  );
}

/** The ids of a turn's items: notes anchored to any of them show with it. */
function segIds(seg: Segment): Set<string> {
  const ids = new Set<string>([seg.id]);
  for (const it of [seg.prompt, seg.notice, ...seg.work, ...seg.attention, ...seg.answer, seg.end]) if (it) ids.add(it.id);
  return ids;
}

/** The newest text of the last turn: the agent's latest note or reply, else your message. */
function newestText(segs: Segment[]): TimelineItem | undefined {
  const s = segs[segs.length - 1];
  const said = s ? [...s.work, ...s.answer].filter((i) => i.kind === 'assistant') : [];
  return said[said.length - 1] ?? s?.prompt;
}

/** Where an element starts in the scroller's content: its place in the layout (an item rising in does not move it). */
function topIn(el: HTMLElement, sc: HTMLElement): number {
  let y = 0;
  for (let e: HTMLElement | null = el; e && e !== sc; e = e.offsetParent as HTMLElement | null) y += e.offsetTop;
  return y;
}

/** How far below the top of the view a text it holds sits: clear of the fade under the header. */
const HOLD_AT = 24;

const SegmentView = memo(function SegmentView({
  seg,
  sessionKey,
  agent,
  live,
  isNew,
  fresh,
  notes,
  sent,
}: {
  seg: Segment;
  sessionKey: string;
  agent: Agent;
  live: LiveInfo | null;
  isNew: boolean;
  fresh: (id: string) => boolean;
  /** The session's notes (each shows with the turn of its anchor). */
  notes: SessionNote[];
  /** The prompt's pictures as sent from this page, while it cannot show its own. */
  sent?: SentPictures;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? !!live;
  const following = useContext(FollowCtx);
  // A finished turn folds its work away, unless the reader is in the middle of it.
  const wasLive = useRef(!!live);
  useLayoutEffect(() => {
    if (wasLive.current && !live && open === null && !following()) setOpen(true);
    wasLive.current = !!live;
  }, [!!live]);
  const visibleWork = seg.work.filter((i) => !hiddenThought(i));
  const stats = useMemo(() => workStats(seg.work), [seg.work]);
  // While the agent works, what it writes after its last step is mostly a note on what it does next: it shows in the
  // outline as the part under way, and takes the reply's place when the turn ends there, or as soon as it reads as a
  // reply (long, or in parts of its own).
  const running = !!live && (live.status === 'working' || live.status === 'starting');
  const { work, replyItems } = useMemo(() => {
    const said = seg.answer.filter((a): a is Extract<TimelineItem, { kind: 'assistant' }> => a.kind === 'assistant');
    if (!running || !said.length || !noteLike(said.map((a) => a.text).join('\n'))) return { work: seg.work, replyItems: seg.answer };
    return { work: [...seg.work, ...said], replyItems: seg.answer.filter((a) => a.kind !== 'assistant') };
  }, [seg.work, seg.answer, running]);
  const answer = useMemo(() => together(replyItems, seg.same), [replyItems, seg.same]);
  const first = seg.prompt?.ts ?? seg.notice?.ts ?? seg.work[0]?.ts;
  const lastItem = [...seg.work, ...seg.answer].reverse().find((i) => i.ts);
  const took = seg.end?.durationMs ?? (first && lastItem?.ts && lastItem.ts > first ? lastItem.ts - first : 0);
  const status = seg.end?.status;
  const tk = seg.end?.tokens;
  const parts: string[] = [];
  // Files changed are summed up in the card under the reply.
  if (stats.commands) parts.push(plural(stats.commands, 'command'));
  if (!parts.length && stats.steps) parts.push(plural(stats.steps, 'step'));
  const onlyThought = !stats.steps && visibleWork.every((i) => i.kind === 'thinking');
  const verbLine = status === 'interrupted' ? 'Stopped' : status === 'failed' ? 'Failed' : onlyThought ? 'Thought' : 'Worked';
  const head = live
    ? null
    : `${verbLine}${took >= 1000 ? `${status === 'interrupted' || status === 'failed' ? ' after' : ' for'} ${duration(took)}` : ''}`;

  return (
    <section className={cx('tl-seg space-y-2', isNew && !seg.prompt && 'anim-in')}>
      {seg.prompt && seg.runEnded === undefined && <UserBubble item={seg.prompt} arrive={isNew && !seg.prompt.peer} sent={sent} />}
      {seg.notice && (
        <div className="flex items-center gap-2 px-2 pt-2 text-[12.5px] text-fg-3">
          <Info size={13} className="shrink-0" />
          <span className="min-w-0 truncate">{seg.notice.text}</span>
        </div>
      )}
      {(visibleWork.length > 0 || live) && (
        <div className={cx(isNew && seg.prompt && 'anim-in [animation-delay:140ms]')}>
          <button
            onClick={() => setOpen(!expanded)}
            title={tk ? `${tk.input.toLocaleString()} input · ${(tk.cacheRead ?? 0).toLocaleString()} cached · ${tk.output.toLocaleString()} output tokens` : undefined}
            className="group flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-[13.5px] transition-colors hover:bg-bg-2"
          >
            {!live && <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform duration-200 group-hover:text-fg-2', expanded && 'rotate-90')} />}
            {live ? (
              <LiveHead agent={agent} live={live} />
            ) : (
              <>
                <span className={cx('shrink-0 font-medium', status === 'interrupted' ? 'text-warn' : status === 'failed' ? 'text-err' : 'text-fg-2')}>{head}</span>
                {parts.length > 0 && <span className="min-w-0 truncate text-fg-3">· {parts.join(', ')}</span>}
              </>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12px] text-fg-3">
              {tk && !live && <span className="hidden sm:inline">{compact(tk.input + (tk.cacheRead ?? 0) + tk.output)} tokens</span>}
              {live && <ChevronRight size={15} className={cx('transition-transform duration-200', expanded && 'rotate-90')} />}
            </span>
          </button>
          {expanded && (
            <Outline items={work} sessionKey={sessionKey} agent={agent} live={live} status={status} replying={replyItems.some((a) => a.kind === 'assistant' && a.streaming)} fresh={fresh} />
          )}
        </div>
      )}
      {seg.attention.map((q) => (
        <div key={q.id} className="anim-in">
          {q.kind === 'tool' && <ToolRow item={q} sessionKey={sessionKey} />}
        </div>
      ))}
      {answer.map(({ key, item: a, more }) => (
        <div key={key} className={cx(fresh(key) && 'anim-in')}>
          {a.kind === 'assistant' && <AssistantBlock item={a} />}
          {a.kind === 'tool' && <ToolRow item={a} sessionKey={sessionKey} more={more} />}
        </div>
      ))}
      {notes.length > 0 && <TurnNotes notes={notes} ids={segIds(seg)} sessionKey={sessionKey} />}
      {!live && stats.files.size > 0 && <TurnChanges files={[...stats.files.values()]} sessionKey={sessionKey} />}
      {notes.length > 0 && <TurnNotes notes={notes} ids={segIds(seg)} sessionKey={sessionKey} after />}
    </section>
  );
});

export function Timeline({
  sessionKey,
  agent,
  live,
  overlay,
  external,
}: {
  sessionKey: string;
  agent: Agent;
  live: LiveState | null;
  overlay?: LiveOverlay;
  /** Set when the session runs in VS Code or a terminal instead of here. */
  external?: ExternalState | null;
}) {
  const tl = useTimeline((s) => s.byKey[sessionKey]);
  const worked = useSessions((s) => s.byKey[sessionKey]?.stats?.workMs);
  const loadEarlier = useTimeline((s) => s.loadEarlier);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [showLatest, setShowLatest] = useState(false);
  // The conversation has scrolled under the header: a fade there. Likewise above the message box while more of it is below.
  const [under, setUnder] = useState(false);
  const [below, setBelow] = useState(false);
  // The end moves without a scroll too (a text held near the top growing past the screen, content changing size).
  const fadeBelow = () => {
    const el = scroller.current;
    if (el) setBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  };
  // Follow the end until the reader scrolls up by their own hand; follow again once they come
  // back down to it. New output, late layout and reconnects never take over the scroll.
  // While following, a new text (your message, the agent's note or reply) that starts low on the screen comes up
  // to near its top, and the view holds it there as it grows below (`lead`, `offset` px from the top), so a long
  // answer reads from its start. It holds there only once what is below it fills the screen: until then the view
  // shows the end, with no empty room under the conversation, and the text rises as it grows.
  const stick = useRef(true);
  const lead = useRef<{ id: string; offset: number } | null>(null);
  // What the follow needs from the last render, for the resize observer too.
  const turn = useRef({ busy: false, asks: 0 });
  const seen = useRef<TimelineItem | undefined>(undefined);
  /** The newest text, when it showed as one (not as a note in the outline) at the last render. */
  const shownText = useRef<string | null>(null);
  const loading = useRef(true);
  const dir = useRef(0);
  const touchY = useRef<number | null>(null);
  const dragging = useRef(false);
  const lastTop = useRef(0);
  // Scrolls this code makes, so they are not taken for the reader's own (the value it set, read back).
  const ownTop = useRef<number | null>(null);
  // The reader scrolled up by their own hand since the last page of older messages: one more may load.
  const armed = useRef(false);
  // When the next page may load: a touch or a run of wheel events is one gesture, and loads one page.
  const touching = useRef(false);
  const settle = useRef(0);
  const gesture = useRef(0);
  const loadedIn = useRef(-1);
  const nextLoadAt = useRef(0);
  const lastWheel = useRef(0);
  useEffect(() => () => clearTimeout(settle.current), []);
  // Where the reader is while not following the end: the first conversation block in view and its
  // distance from the top. Content that changes above it (older messages arriving, a step unfolding,
  // code highlighting late) leaves them on the same line; the browser's own anchoring is off, so it
  // never adds a second correction.
  const anchor = useRef<{ id: string | null; offset: number; fromBottom: number } | null>(null);
  const setTop = (top: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = top;
    ownTop.current = el.scrollTop;
  };
  const capture = () => {
    const sc = scroller.current;
    if (!sc) return (anchor.current = null);
    const fromBottom = sc.scrollHeight - sc.scrollTop;
    const blocks = content.current?.querySelectorAll<HTMLElement>(':scope > [data-seg]');
    if (!blocks?.length) return (anchor.current = { id: null, offset: 0, fromBottom });
    // The first block that reaches into view (blocks are in order, so a binary search finds it).
    let lo = 0;
    let hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (blocks[mid].offsetTop + blocks[mid].offsetHeight > sc.scrollTop) hi = mid;
      else lo = mid + 1;
    }
    // A first block that starts mid-turn joins the turn before it once that loads: hold on to the next one.
    let el: HTMLElement | undefined = blocks[lo];
    while (el && el.dataset.partial) el = blocks[++lo];
    // No block to hold on to (one long turn fills the view): keep the distance from the end instead.
    anchor.current = el ? { id: el.dataset.seg!, offset: el.offsetTop - sc.scrollTop, fromBottom } : { id: null, offset: 0, fromBottom };
  };
  const restore = () => {
    const sc = scroller.current;
    const a = anchor.current;
    if (!sc || !a) return;
    const el = a.id ? content.current?.querySelector<HTMLElement>(`:scope > [data-seg="${CSS.escape(a.id)}"]`) : null;
    const want = el ? el.offsetTop - a.offset : sc.scrollHeight - a.fromBottom;
    if (Math.abs(sc.scrollTop - want) > 0.5) setTop(want);
  };
  const textEl = (id: string) => content.current?.querySelector<HTMLElement>(`[data-text="${CSS.escape(id)}"]`) ?? null;
  // A card to answer (a form, a question) that the end would cut off at its top shows from its top instead: its title,
  // what it asks and its first fields in view, the rest a scroll away. Not one the reader went past with Latest.
  const pastCard = useRef<string | null>(null);
  const cardTop = (sc: HTMLElement): number | null => {
    if (!turn.current.asks) return null;
    const card = content.current?.querySelector<HTMLElement>('[id^="approval-"]');
    if (!card || card.id === pastCard.current) return null;
    const at = Math.max(0, topIn(card, sc) - HOLD_AT);
    return sc.scrollHeight - sc.clientHeight > at ? at : null;
  };
  // An app's answer (its card, under the reply of the turn that ran it) that the end would cut off at its top shows from
  // the agent's words about it, or from its own top while there are none yet: the answer reads from its start, the rest
  // a scroll away. Not one the reader went past, with Latest or scrolling on down by hand (`shownAt`: where it was shown).
  const pastResult = useRef<string | null>(null);
  const shownAt = useRef<{ id: string; at: number } | null>(null);
  // The view holds a card's top (to answer, or an app's answer) short of the end: Latest stays to go on down.
  const held = useRef(false);
  const lastCard = () => {
    const segs = content.current?.querySelectorAll<HTMLElement>(':scope > [data-seg]');
    const seg = segs?.[segs.length - 1];
    const cards = seg?.querySelectorAll<HTMLElement>('[data-app-card]');
    const card = cards?.[cards.length - 1];
    return seg && card ? { seg, card } : null;
  };
  const resultTop = (sc: HTMLElement): number | null => {
    const last = lastCard();
    if (!last || last.card.dataset.appCard === pastResult.current) return null;
    const cardAt = topIn(last.card, sc);
    // The agent's reply in this turn (its texts, not your message nor its notes between steps), above the card.
    const words = [...last.seg.querySelectorAll<HTMLElement>(':scope>section>div>[data-text]')].find((t) => topIn(t, sc) < cardAt);
    const at = Math.max(0, (words ? topIn(words, sc) : cardAt) - HOLD_AT);
    if (sc.scrollHeight - sc.clientHeight <= at) return null;
    shownAt.current = { id: last.card.dataset.appCard!, at };
    return at;
  };
  // While following: the text the view holds stays in place, or the end stays in view. `came`, a text that just
  // came, becomes the one held (near the top if it starts below the top third, else where it is), unless the reader
  // may still be in the one held now: it runs on below the screen.
  const follow = (came?: string) => {
    const sc = scroller.current;
    if (!sc) return;
    const view = sc.clientHeight;
    let el = lead.current && textEl(lead.current.id);
    if (lead.current && !el) {
      // Gone (your message took the transcript's id, or the steps it was among folded away): the last turn's newest text shown.
      const segs = content.current?.querySelectorAll<HTMLElement>(':scope > [data-seg]');
      const texts = segs?.[segs.length - 1]?.querySelectorAll<HTMLElement>('[data-text]');
      el = texts?.[texts.length - 1] ?? null;
      lead.current = el ? { id: el.dataset.text!, offset: lead.current.offset } : null;
    }
    let top = el && lead.current ? topIn(el, sc) - lead.current.offset : sc.scrollTop;
    const reading = () => !!el && topIn(el, sc) + el.offsetHeight - top > view;
    const f = came && came !== lead.current?.id ? textEl(came) : null;
    const y = f ? topIn(f, sc) - top : -1;
    if (f && y >= 0 && !reading()) {
      lead.current = { id: came!, offset: y > view / 3 ? HOLD_AT : y };
      el = f;
      top = topIn(f, sc) - lead.current.offset;
    }
    const h = sc.scrollHeight;
    if (el) {
      // While the agent works, what came after a text read to its end (steps, a card to answer) may run past the
      // screen: then the end is what to follow.
      const last = content.current?.lastElementChild as HTMLElement | null;
      const end = last ? last.offsetTop + last.offsetHeight : h;
      if (!(turn.current.busy && end - top > view && (!reading() || turn.current.asks))) {
        // Short of a screen below it, the end decides: the text sits where the conversation puts it.
        held.current = false;
        setTop(Math.min(top, h - view));
        // More below the held text: Latest goes there.
        setShowLatest(sc.scrollHeight - sc.scrollTop - view > 80);
        return;
      }
      lead.current = null;
    }
    // The end, or the top of a card to answer, or of an app's answer, that the end would cut off.
    const at = cardTop(sc) ?? resultTop(sc);
    held.current = at != null;
    if (at != null) {
      setTop(at);
      setShowLatest(true);
      return;
    }
    setTop(sc.scrollHeight);
    setShowLatest(false);
  };
  const unstick = () => {
    stick.current = false;
    dir.current = -1;
  };
  // Reading on down from a text the view holds, by hand: it stops following there (and follows again back at the end).
  const down = (moved = false) => {
    dir.current = 1;
    const el = scroller.current;
    if (stick.current && lead.current && el && (moved || el.scrollHeight - el.scrollTop - el.clientHeight > 1)) stick.current = false;
  };
  const toEnd = (smooth = false) => {
    stick.current = true;
    held.current = false;
    dir.current = 1;
    anchor.current = null;
    lead.current = null;
    // Latest goes to the very end, past a card shown from its top.
    pastCard.current = content.current?.querySelector<HTMLElement>('[id^="approval-"]')?.id ?? null;
    pastResult.current = lastCard()?.card.dataset.appCard ?? null;
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const following = () => stick.current;
  const merged = useMemo(() => mergeOverlay(tl?.items ?? [], overlay), [tl?.items, overlay]);
  const segs = useMemo(() => segment(merged), [merged]);
  // Pictures sent from this page, in their messages until those show their own (lib/attachments.ts).
  const sentList = useSentPictures((s) => s.byKey[sessionKey]);
  const sent = useMemo(() => sentPicturesOf(sentList, merged, tl?.items.length ?? 0), [sentList, merged, tl?.items.length]);
  const loaded = useSessionNotes(sessionKey);
  // An app run that ended after its call stopped waiting: its card shows under the reply to that news, not above it.
  const notes = useMemo(() => {
    const moved = new Map(segs.filter((s) => s.runEnded).map((s) => [s.runEnded!, s.id]));
    if (!moved.size) return loaded;
    return loaded.map((n) => {
      const run = (n.data as { run?: unknown } | null)?.run;
      const to = n.kind === 'app-run' && typeof run === 'string' ? moved.get(run) : undefined;
      return to ? { ...n, anchor: to } : n;
    });
  }, [loaded, segs]);
  const noteIds = useMemo(() => new Set(segs.flatMap((s) => [...segIds(s)])), [segs]);
  const approvals: ApprovalRequest[] = overlay?.approvals ?? [];
  const here = !!live && live.status !== 'exited' && live.status !== 'error';
  const ext = here ? null : (external ?? null);
  const working = here ? live!.status === 'working' || live!.status === 'starting' || live!.status === 'waiting' : !!ext && ext.status !== 'idle';
  const liveInfo: LiveInfo | null = !working
    ? null
    : ext
      ? { status: ext.status, since: ext.since, worked, where: ext.client, note: ext.detail === 'input needed' ? undefined : ext.detail }
      : { status: live!.status, since: live!.turnStartedAt, worked };

  // Only what arrives after the first load animates in; opening a session does not replay it all.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    known.current = null;
  }, [sessionKey]);
  if (!known.current && tl && !tl.loading && tl.items.length) known.current = new Set(tl.items.map((i) => i.id));
  // Nor does a message the transcript now has under another id: its copy was on screen already.
  for (const o of overlay?.items ?? []) {
    const copy = known.current && savedCopy(tl?.items ?? [], o);
    if (copy) known.current!.add(copy.id);
  }
  const fresh = (id: string) => !!known.current && !known.current.has(id);

  // Follow new output while the reader is following; anywhere else, keep their place (before the paint).
  const landed = useRef<string | null>(null);
  useLayoutEffect(() => {
    turn.current = { busy: working, asks: approvals.length };
    // A text is new when it comes while the session is open, not with its opening or a reload; until it has
    // opened, nothing is held.
    const newest = newestText(segs);
    // A text comes when it first shows as one: a reply that began as a note in the outline (outline.ts, noteLike) comes
    // when it takes its place.
    const showsAs = newest && textEl(newest.id) ? newest.id : null;
    const came = landed.current === sessionKey && !loading.current && (newest?.id !== seen.current?.id || (!!showsAs && showsAs !== shownText.current)) ? newest?.id : undefined;
    seen.current = newest;
    shownText.current = showsAs;
    loading.current = !!tl?.loading;
    if (landed.current !== sessionKey) {
      lead.current = null;
    }
    if (stick.current) follow(came);
    else restore();
    fadeBelow();
  }, [merged, overlay?.approvals, working, tl?.start, tl?.loading]);

  // Opening a session lands at its end, once; a reload after a reconnect keeps your place.
  useEffect(() => {
    if (!tl || tl.loading || landed.current === sessionKey) return;
    landed.current = sessionKey;
    stick.current = true;
    dir.current = 0;
    anchor.current = null;
    armed.current = false;
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (!el) return;
      const at = cardTop(el) ?? resultTop(el);
      held.current = at != null;
      setTop(at ?? el.scrollHeight);
      if (at != null) setShowLatest(true);
    });
  }, [sessionKey, tl?.loading]);

  // Sending a message brings the view back to the end; the message comes up near the top as it shows. (Shown
  // first, ahead of the answer to sending it, it is already held there.)
  useEffect(() => {
    const f = () => {
      if (!(stick.current && seen.current?.kind === 'user' && lead.current?.id === seen.current.id)) toEnd();
    };
    window.addEventListener('wa:follow', f);
    return () => window.removeEventListener('wa:follow', f);
  }, []);

  // Code and maths highlight late, so content keeps growing after a render; while following,
  // keep up with it. (The content is there once the first page is: watch from then. A session just started
  // shows your message from the live copy while its transcript loads, so it never blinks to a loading mark.)
  const shown = !!tl && !(tl.loading && !tl.items.length && !overlay?.items.length);
  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stick.current) follow();
      else restore();
      fadeBelow();
    });
    ro.observe(el);
    // So does the view itself changing size: the message box growing a line, the keyboard opening.
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, [sessionKey, shown]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop;
    setUnder(top > 2);
    const own = ownTop.current !== null && Math.abs(top - ownTop.current) < 2;
    ownTop.current = null;
    // Reading on down past an app's answer shown from its top, by hand: it is not brought back to its top.
    if (!own && shownAt.current && top > shownAt.current.at + 8) pastResult.current = shownAt.current.id;
    const dist = el.scrollHeight - top - el.clientHeight;
    setBelow(dist > 2);
    // Dragging the scrollbar counts as the reader's own scroll.
    if (dragging.current) {
      if (top < lastTop.current - 1) unstick();
      else if (top > lastTop.current + 1) down(true);
    }
    // Only the view actually moving up by the reader's hand (momentum after a swipe included) may load
    // another page: wheel events at the very top move nothing, so they never pile up pages.
    if (!own && !stick.current && top < lastTop.current - 1) armed.current = true;
    if (dist < 24 && dir.current >= 0) {
      if (!stick.current) lead.current = null;
      stick.current = true;
      anchor.current = null;
    }
    lastTop.current = top;
    if (!stick.current && !own) capture();
    setShowLatest((!stick.current || !!lead.current || held.current) && dist > 80);
    if (armed.current && top < 400) maybeLoad();
  };

  // Older messages near the top: a page once the view is still, one page per gesture, with a pause
  // between pages, and only after the reader moved up by their own hand. On phones the momentum of a
  // flick keeps scrolling after the finger lifts; content landing mid-flick fights it (the view snaps
  // back to the top and asks for the next page, and the next), so nothing lands until it is over.
  // At the very top, "Show earlier messages" loads more.
  const maybeLoad = () => {
    clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = scroller.current;
      const t = useTimeline.getState().byKey[sessionKey];
      // A finger still on the glass: lifting it asks again.
      if (!el || touching.current) return;
      if (!armed.current || el.scrollTop >= 400 || !t || t.start <= 0 || t.loadingEarlier) return;
      if (gesture.current === loadedIn.current || Date.now() < nextLoadAt.current) return;
      armed.current = false;
      loadedIn.current = gesture.current;
      stick.current = false;
      capture();
      loadEarlier(sessionKey).finally(() => (nextLoadAt.current = Date.now() + 800));
    }, 250);
  };

  if (!shown) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-3">
        <Throbber size={34} />
      </div>
    );
  }

  let prevDay = '';
  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-hidden
        className={cx('pointer-events-none absolute inset-x-0 top-0 z-[2] h-8 bg-gradient-to-b from-bg via-bg/60 to-transparent transition-opacity duration-300', under ? 'opacity-100' : 'opacity-0')}
      />
      {/* A pixel inside each fade's edge: where the header ends (or the message box starts) between device pixels, the
          scroller's edge and the fade round to different rows, and a line of the conversation would show past the fade. */}
      <div
        ref={scroller}
        onScroll={onScroll}
        onWheel={(e) => {
          // A pause between wheel events starts a new gesture (a trackpad's momentum is one run).
          if (e.timeStamp - lastWheel.current > 300) gesture.current++;
          lastWheel.current = e.timeStamp;
          if (e.deltaY < 0) {
            unstick();
            // At the top nothing moves, so a pull there counts: still one page for the whole gesture.
            if (scroller.current && scroller.current.scrollTop < 400) {
              armed.current = true;
              maybeLoad();
            }
          } else if (e.deltaY > 0) down();
        }}
        onTouchStart={(e) => {
          touching.current = true;
          gesture.current++;
          touchY.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={() => {
          touching.current = false;
          if (armed.current) maybeLoad();
        }}
        onTouchCancel={() => (touching.current = false)}
        onTouchMove={(e) => {
          const y = e.touches[0]?.clientY;
          if (y == null) return;
          // Finger moving down scrolls the history up.
          if (touchY.current != null && y > touchY.current + 2) {
            unstick();
            // Pulling down at the top: one page once the finger lifts and the view is still.
            if (scroller.current && scroller.current.scrollTop < 400) armed.current = true;
          }
          else if (touchY.current != null && y < touchY.current - 2) down();
          touchY.current = y;
        }}
        onPointerDown={(e) => {
          if (e.target === scroller.current) {
            dragging.current = true;
            gesture.current++;
          }
        }}
        onKeyDown={(e) => {
          gesture.current++;
          if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') unstick();
          else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'End' || e.key === ' ') down();
        }}
        className="absolute inset-x-0 top-px bottom-px overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none] [scrollbar-gutter:stable_both-edges]"
      >
        <QuoteSelection />
        <FollowCtx.Provider value={following}>
          {/* As wide as the message box under it (800px at most, 12px in from the sides on a phone, 24px on wider
              screens), so the two line up. A scrollbar that takes room gets it on both sides, to keep them centred alike. */}
          <div ref={content} className="mx-auto w-full max-w-[848px] space-y-8 px-3 pt-6 pb-10 sm:px-6">
            {tl.start > 0 && (
              // The same height loading or not, so swapping the two moves nothing below.
              <div className="flex h-7 items-center justify-center text-[12.5px] text-fg-3">
                {tl.loadingEarlier ? (
                  <Throbber />
                ) : (
                  <button
                    className="rounded-lg px-2.5 py-1 transition-colors hover:bg-bg-2 hover:text-fg"
                    onClick={() => {
                      stick.current = false;
                      capture();
                      loadEarlier(sessionKey);
                    }}
                  >
                    Show earlier messages
                  </button>
                )}
              </div>
            )}
            {tl.error && <div className="text-[13px] text-err">{tl.error}</div>}
            {!merged.length && !working && <div className="py-20 text-center text-[14px] text-fg-3">No messages yet. Say what you want done below.</div>}
            {segs.map((seg, i) => {
              const ts = seg.prompt?.ts ?? seg.notice?.ts ?? seg.work[0]?.ts ?? seg.answer[0]?.ts;
              const day = ts ? dayLabel(ts) : '';
              // A conversation that is all from today needs no "Today" over it: the line shows where days change.
              const divider = day && day !== prevDay && !(day === 'Today' && !prevDay && tl.start === 0);
              if (day) prevDay = day;
              const isLast = i === segs.length - 1;
              // The day line sits beside the block, not in it: when older turns of the same day arrive and
              // the line moves up to them, the block the reader is on stays put.
              return (
                <Fragment key={seg.id}>
                  {divider && <DayLine day={day} />}
                  <div data-seg={seg.id} data-partial={i === 0 && tl.start > 0 && !seg.prompt ? '1' : undefined}>
                    <SegmentView
                      seg={seg}
                      sessionKey={sessionKey}
                      agent={agent}
                      live={isLast ? liveInfo : null}
                      isNew={fresh(seg.prompt?.id ?? seg.notice?.id ?? seg.work[0]?.id ?? seg.id)}
                      fresh={fresh}
                      notes={notes}
                      sent={seg.prompt && sent.get(seg.prompt.id)}
                    />
                  </div>
                </Fragment>
              );
            })}
            {notes.length > 0 && <LooseNotes notes={notes} known={noteIds} sessionKey={sessionKey} complete={tl.start === 0} />}
            {working && !segs.length && (
              <div className="flex items-center gap-2.5 px-2 text-[13.5px] text-busy">
                <WorkingIcon agent={agent} size={15} spinning /> Starting…
              </div>
            )}
            {approvals.length > 0 && (
              <div className="-mt-4 space-y-3">
                {approvals.map((a) => (
                  <ApprovalCard key={a.id} a={a} sessionKey={sessionKey} agent={agent} id={`approval-${a.id}`} />
                ))}
              </div>
            )}
          </div>
        </FollowCtx.Provider>
      </div>
      <div
        aria-hidden
        className={cx('pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-8 bg-gradient-to-t from-bg via-bg/60 to-transparent transition-opacity duration-300', below ? 'opacity-100' : 'opacity-0')}
      />
      {showLatest && (
        <button
          onClick={() => toEnd(true)}
          className="anim-pop absolute bottom-3 left-1/2 z-[3] flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-elevated px-3.5 text-[12.5px] text-fg-2 shadow-lg transition-colors hover:text-fg"
        >
          <ArrowDown size={13} /> Latest
        </button>
      )}
    </div>
  );
}

import { createContext, Fragment, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronRight, FileDiff, FilePen, FilePlus2, FileText, FileX, Info } from 'lucide-react';
import type { Agent, ApprovalRequest, ExternalState, FileChange, LiveOverlay, LiveState, SystemItem, TimelineItem, ToolItem, TurnItem, UserItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { basename, compact, dirname, duration, prettyPath } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { useApp, useTimeline } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Dots } from '../../components/ui';
import { ApprovalCard } from './Approval';
import { AgentIcon } from '../../components/AgentIcon';
import { QuoteSelection } from './QuoteSelection';
import { AssistantBlock, Elapsed, hiddenThought, SessionCtx, stepsIcon, summarize, SystemRow, ThinkingRow, ToolRow, UserBubble } from './items';
import { HtmlPage, isPageTool } from './HtmlPage';

type Block = { kind: 'item'; item: TimelineItem } | { kind: 'group'; id: string; items: TimelineItem[] };

const STANDALONE = new Set(['todo', 'question', 'plan']);

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
  const extra = ov.items.filter((i) => !ids.has(i.id)).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return extra.length ? [...merged, ...extra] : merged;
}

function blocks(items: TimelineItem[]): Block[] {
  const out: Block[] = [];
  let cur: TimelineItem[] = [];
  const flush = () => {
    if (cur.length) out.push({ kind: 'group', id: `g:${cur[0].id}`, items: cur });
    cur = [];
  };
  for (const it of items) {
    // A page an agent showed is part of its answer, not a step to fold away.
    if ((it.kind === 'tool' && !STANDALONE.has(it.tool.category) && !isPageTool(it.tool.name)) || it.kind === 'thinking') cur.push(it);
    else {
      flush();
      out.push({ kind: 'item', item: it });
    }
  }
  flush();
  return out;
}

/** Whether the reader is following the end of the timeline (not reading further up). */
const FollowCtx = createContext<() => boolean>(() => true);

// ---- turns ---------------------------------------------------------------------------------

/**
 * One exchange: what you said, the agent's work (steps and in-between notes), and the
 * reply it ended on. A message sent while it works opens the next one.
 */
interface Segment {
  id: string;
  prompt?: UserItem;
  /** A notice that started the agent without a prompt (a background task finished). */
  notice?: SystemItem;
  work: TimelineItem[];
  answer: TimelineItem[];
  /** Open questions: shown outside the folded work. */
  attention: TimelineItem[];
  end?: TurnItem;
}

const isOpenQuestion = (it: TimelineItem) =>
  it.kind === 'tool' && it.tool.category === 'question' && (it.tool.status === 'running' || it.tool.status === 'pending' || it.tool.status === 'waiting') && !Object.keys(it.tool.answers ?? {}).length;

function segment(items: TimelineItem[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  const open = (id: string) => {
    cur = { id, work: [], answer: [], attention: [] };
    out.push(cur);
    return cur;
  };
  for (const it of items) {
    if (it.kind === 'user' && it.meta !== 'note' && it.meta !== 'command-output') {
      open(`seg:${it.id}`).prompt = it;
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
    s.attention = s.work.filter(isOpenQuestion);
    if (s.attention.length) s.work = s.work.filter((i) => !isOpenQuestion(i));
    // Pages the agent showed belong with its reply, outside the folded work.
    const pages = s.work.filter((it) => it.kind === 'tool' && isPageTool(it.tool.name));
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

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (ts >= start) return 'Today';
  if (ts >= start - 86400_000) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const isActive = (i: TimelineItem) => (i.kind === 'tool' && (i.tool.status === 'running' || i.tool.status === 'pending')) || (i.kind === 'thinking' && !!i.streaming);

/**
 * A run of steps between two notes, in a quiet box apart from the prose: one line saying what was
 * done ("Ran 3 commands, read 2 files"), the step in progress under it, every step a click away.
 */
const Group = memo(function Group({ b, sessionKey }: { b: Extract<Block, { kind: 'group' }>; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  const visible = b.items.filter((i) => !hiddenThought(i));
  const tools = visible.filter((i): i is ToolItem => i.kind === 'tool');
  const current = visible.filter(isActive);
  const done = tools.filter((i) => !isActive(i));
  if (!visible.length) return null;
  const row = (it: TimelineItem) => <div key={it.id}>{it.kind === 'tool' ? <ToolRow item={it} sessionKey={sessionKey} /> : it.kind === 'thinking' ? <ThinkingRow item={it} /> : null}</div>;
  // Thoughts on their own stay a quiet line.
  if (!tools.length) return <div className="px-1">{visible.map(row)}</div>;
  // A single step is its own box.
  if (visible.length === 1) return <div className="rounded-xl border border-line bg-bg-1 p-1">{row(visible[0])}</div>;
  const sum = summarize(done);
  const Icon = stepsIcon(done);
  const head = done.length > 0;
  return (
    <div className="rounded-xl border border-line bg-bg-1">
      {head && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13px] text-fg-3 transition-colors hover:text-fg-2"
        >
          <Icon size={14} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{sum.text}</span>
          <DiffStat added={sum.added} removed={sum.removed} compact />
          <ChevronRight size={14} className={cx('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        </button>
      )}
      {(open || !head || current.length > 0) && (
        <div className={cx('p-1', head && 'border-t border-line', open && 'anim-expand')}>{(open || !head ? visible : current).map(row)}</div>
      )}
    </div>
  );
});

/**
 * A quiet mark at the end of a running turn's work, so its newest end shows the agent is still at it
 * when the header (which has the words and the time) is scrolled away. It only fills gaps: hidden
 * while the last row already shows what is happening, and when there is nothing above it but the header.
 */
function StillWorking({ agent, note }: { agent: Agent; note?: string }) {
  return (
    <div className="anim-in flex min-h-7 items-center gap-2.5 px-1 text-[12.5px] text-fg-3">
      <AgentIcon agent={agent} size={14} className="spin-gentle" />
      {note && <span className="min-w-0 truncate">{note}</span>}
    </div>
  );
}

/** Whether a block shows anything (a run of only hidden thoughts does not). */
const visibleBlock = (b: Block) => b.kind !== 'group' || b.items.some((i) => !hiddenThought(i));

/** Whether the last visible row already shows the live status. */
function tailShowsStatus(items: TimelineItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (hiddenThought(it)) continue;
    if (it.kind === 'thinking' || it.kind === 'assistant') return !!it.streaming;
    if (it.kind === 'tool') return it.tool.status === 'running' || it.tool.status === 'pending' || it.tool.status === 'waiting';
    return false;
  }
  return false;
}

interface LiveInfo {
  status: string;
  since?: number;
  where?: string;
  note?: string;
}

/** Everything the agent did on the way to its reply: notes, steps and thoughts, in order. */
function WorkLog({
  items,
  sessionKey,
  agent,
  live,
  fresh,
  replying,
}: {
  items: TimelineItem[];
  sessionKey: string;
  agent: Agent;
  live: LiveInfo | null;
  fresh: (id: string) => boolean;
  /** The reply is streaming under the log: it shows the agent is at work. */
  replying?: boolean;
}) {
  const bl = useMemo(() => blocks(items), [items]);
  const following = useContext(FollowCtx);
  // A long running turn shows its latest steps, earlier ones a click away. The window only
  // moves on while the reader follows the end: steps above someone reading never disappear.
  const LIVE_TAIL = 8;
  const [all, setAll] = useState(false);
  const from = useRef<number | null>(null);
  if (from.current === null) from.current = live ? Math.max(0, bl.length - LIVE_TAIL) : 0;
  if (live && !all && following()) from.current = Math.max(from.current, bl.length - LIVE_TAIL);
  const hidden = all ? 0 : Math.min(from.current, bl.length);
  const shown = hidden ? bl.slice(hidden) : bl;
  return (
    <div className="anim-expand mt-2 space-y-3">
      {hidden > 0 && (
        <button onClick={() => setAll(true)} className="-ml-2 rounded-md px-2 py-1 text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2">
          Show earlier work
        </button>
      )}
      {shown.map((b) => {
        const id = b.kind === 'group' ? b.id : b.item.id;
        return (
          <div key={id} className={cx(fresh(b.kind === 'group' ? b.items[0].id : b.item.id) && 'anim-in')}>
            {b.kind === 'group' ? (
              <Group b={b} sessionKey={sessionKey} />
            ) : b.item.kind === 'assistant' ? (
              <AssistantBlock item={b.item} note />
            ) : b.item.kind === 'user' ? (
              <UserBubble item={b.item} />
            ) : b.item.kind === 'system' ? (
              <SystemRow item={b.item} />
            ) : b.item.kind === 'tool' ? (
              b.item.tool.category === 'plan' ? (
                <div className="rounded-xl border border-line bg-bg-1 p-1">
                  <ToolRow item={b.item} sessionKey={sessionKey} />
                </div>
              ) : (
                <ToolRow item={b.item} sessionKey={sessionKey} />
              )
            ) : null}
          </div>
        );
      })}
      {live && (live.status === 'working' || live.status === 'starting') && shown.some(visibleBlock) && !replying && !tailShowsStatus(items) && <StillWorking agent={agent} note={live.note} />}
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
    <div className="anim-expand space-y-2 px-3 pt-1 pb-3">
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

const SegmentView = memo(function SegmentView({
  seg,
  sessionKey,
  agent,
  live,
  isNew,
  fresh,
}: {
  seg: Segment;
  sessionKey: string;
  agent: Agent;
  live: LiveInfo | null;
  isNew: boolean;
  fresh: (id: string) => boolean;
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
    <section className={cx('tl-seg space-y-2', isNew && 'anim-in')}>
      {seg.prompt && <UserBubble item={seg.prompt} />}
      {seg.notice && (
        <div className="flex items-center gap-2 px-2 pt-2 text-[12.5px] text-fg-3">
          <Info size={13} className="shrink-0" />
          <span className="min-w-0 truncate">{seg.notice.text}</span>
        </div>
      )}
      {(visibleWork.length > 0 || live) && (
        <div>
          <button
            onClick={() => setOpen(!expanded)}
            title={tk ? `${tk.input.toLocaleString()} input · ${(tk.cacheRead ?? 0).toLocaleString()} cached · ${tk.output.toLocaleString()} output tokens` : undefined}
            className="group flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-[13.5px] transition-colors hover:bg-bg-2"
          >
            {!live && <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform duration-200 group-hover:text-fg-2', expanded && 'rotate-90')} />}
            {live ? (
              <>
                <AgentIcon agent={agent} size={15} className={live.status === 'waiting' ? 'breathe' : 'spin-gentle'} />
                <span className={cx('font-medium', live.status === 'waiting' ? 'text-warn' : 'text-busy')}>
                  {live.status === 'waiting' ? 'Waiting for you' : live.status === 'starting' ? 'Starting' : 'Working'}
                  {live.where ? ` in ${live.where}` : ''}
                </span>
                {live.since && (
                  <span className="tnum text-fg-3">
                    · <Elapsed since={live.since} />
                  </span>
                )}
              </>
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
            <WorkLog items={seg.work} sessionKey={sessionKey} agent={agent} live={live} fresh={fresh} replying={seg.answer.some((a) => a.kind === 'assistant' && a.streaming)} />
          )}
        </div>
      )}
      {seg.attention.map((q) => (
        <div key={q.id} className="anim-in">
          {q.kind === 'tool' && <ToolRow item={q} sessionKey={sessionKey} />}
        </div>
      ))}
      {seg.answer.map((a) => (
        <div key={a.id} className={cx(fresh(a.id) && 'anim-in')}>
          {a.kind === 'assistant' && <AssistantBlock item={a} />}
          {a.kind === 'tool' && <HtmlPage item={a} />}
        </div>
      ))}
      {!live && stats.files.size > 0 && <TurnChanges files={[...stats.files.values()]} sessionKey={sessionKey} />}
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
  const loadEarlier = useTimeline((s) => s.loadEarlier);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [showLatest, setShowLatest] = useState(false);
  // Follow the end until the reader scrolls up by their own hand; follow again once they come
  // back down to it. New output, late layout and reconnects never take over the scroll.
  const stick = useRef(true);
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
  const unstick = () => {
    stick.current = false;
    dir.current = -1;
  };
  const toEnd = (smooth = false) => {
    stick.current = true;
    dir.current = 1;
    anchor.current = null;
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const following = () => stick.current;
  const merged = useMemo(() => mergeOverlay(tl?.items ?? [], overlay), [tl?.items, overlay]);
  const segs = useMemo(() => segment(merged), [merged]);
  const approvals: ApprovalRequest[] = overlay?.approvals ?? [];
  const here = !!live && live.status !== 'exited' && live.status !== 'error';
  const ext = here ? null : (external ?? null);
  const working = here ? live!.status === 'working' || live!.status === 'starting' || live!.status === 'waiting' : !!ext && ext.status !== 'idle';
  const liveInfo: LiveInfo | null = !working
    ? null
    : ext
      ? { status: ext.status, since: ext.since, where: ext.client, note: ext.detail === 'input needed' ? undefined : ext.detail }
      : { status: live!.status, since: live!.turnStartedAt };

  // Only what arrives after the first load animates in; opening a session does not replay it all.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    known.current = null;
  }, [sessionKey]);
  if (!known.current && tl && !tl.loading && tl.items.length) known.current = new Set(tl.items.map((i) => i.id));
  const fresh = (id: string) => !!known.current && !known.current.has(id);

  // Follow new output while the reader is at the end; anywhere else, keep their place (before the paint).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) setTop(el.scrollHeight);
    else restore();
  }, [merged, overlay?.approvals, working, tl?.start]);

  // Opening a session lands at its end, once; a reload after a reconnect keeps your place.
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (!tl || tl.loading || landed.current === sessionKey) return;
    landed.current = sessionKey;
    stick.current = true;
    dir.current = 0;
    anchor.current = null;
    armed.current = false;
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) setTop(el.scrollHeight);
    });
  }, [sessionKey, tl?.loading]);

  // Sending a message brings the view back to the end.
  useEffect(() => {
    const f = () => toEnd();
    window.addEventListener('wa:follow', f);
    return () => window.removeEventListener('wa:follow', f);
  }, []);

  // Code and maths highlight late, so content keeps growing after a render; stay at the end
  // while following.
  useEffect(() => {
    const el = content.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const sc = scroller.current;
      if (sc && stick.current) setTop(sc.scrollHeight);
      else restore();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sessionKey, !!tl]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const top = el.scrollTop;
    const own = ownTop.current !== null && Math.abs(top - ownTop.current) < 2;
    ownTop.current = null;
    const dist = el.scrollHeight - top - el.clientHeight;
    // Dragging the scrollbar counts as the reader's own scroll.
    if (dragging.current) {
      if (top < lastTop.current - 1) unstick();
      else if (top > lastTop.current + 1) dir.current = 1;
    }
    // Only the view actually moving up by the reader's hand (momentum after a swipe included) may load
    // another page: wheel events at the very top move nothing, so they never pile up pages.
    if (!own && !stick.current && top < lastTop.current - 1) armed.current = true;
    if (dist < 24 && dir.current >= 0) {
      stick.current = true;
      anchor.current = null;
    }
    lastTop.current = top;
    if (!stick.current && !own) capture();
    setShowLatest(!stick.current && dist > 80);
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

  if (!tl || (tl.loading && !tl.items.length)) {
    return (
      <div className="flex flex-1 items-center justify-center text-fg-3">
        <Dots />
      </div>
    );
  }

  let prevDay = '';
  return (
    <div className="relative min-h-0 flex-1">
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
          } else if (e.deltaY > 0) dir.current = 1;
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
          else if (touchY.current != null && y < touchY.current - 2) dir.current = 1;
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
          else if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'End' || e.key === ' ') dir.current = 1;
        }}
        className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none]"
      >
        <QuoteSelection />
        <FollowCtx.Provider value={following}>
          <div ref={content} className="mx-auto w-full max-w-[780px] space-y-8 px-4 pt-6 pb-10 sm:px-6">
            {tl.start > 0 && (
              // The same height loading or not, so swapping the two moves nothing below.
              <div className="flex h-7 items-center justify-center text-[12.5px] text-fg-3">
                {tl.loadingEarlier ? (
                  <Dots />
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
              const divider = day && day !== prevDay;
              if (day) prevDay = day;
              const isLast = i === segs.length - 1;
              // The day line sits beside the block, not in it: when older turns of the same day arrive and
              // the line moves up to them, the block the reader is on stays put.
              return (
                <Fragment key={seg.id}>
                  {divider && (
                    <div className="flex items-center gap-3 text-[12px] font-medium text-fg-3">
                      <span className="h-px flex-1 bg-line" />
                      {day}
                      <span className="h-px flex-1 bg-line" />
                    </div>
                  )}
                  <div data-seg={seg.id} data-partial={i === 0 && tl.start > 0 && !seg.prompt ? '1' : undefined}>
                    <SegmentView seg={seg} sessionKey={sessionKey} agent={agent} live={isLast ? liveInfo : null} isNew={fresh(seg.prompt?.id ?? seg.notice?.id ?? seg.work[0]?.id ?? seg.id)} fresh={fresh} />
                  </div>
                </Fragment>
              );
            })}
            {working && !segs.length && (
              <div className="flex items-center gap-2.5 px-2 text-[13.5px] text-busy">
                <AgentIcon agent={agent} size={15} className="spin-gentle" /> Starting…
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
      {showLatest && (
        <button
          onClick={() => toEnd(true)}
          className="anim-pop absolute bottom-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-elevated px-3.5 text-[12.5px] text-fg-2 shadow-lg transition-colors hover:text-fg"
        >
          <ArrowDown size={13} /> Latest
        </button>
      )}
    </div>
  );
}

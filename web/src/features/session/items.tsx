import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  AlertTriangle,
  Bot,
  Brain,
  Check,
  ChevronRight,
  CircleDashed,
  CircleSlash,
  Clock,
  FilePen,
  FilePlus2,
  FileText,
  GitFork,
  Globe,
  Info,
  ListChecks,
  Map as MapIcon,
  MessageCircleQuestion,
  Octagon,
  Pencil,
  Plug,
  Search,
  Inbox,
  Send,
  SquareTerminal,
  Wrench,
  XCircle,
} from 'lucide-react';
import { RUN_WHY, splitRunMessage, type RunMessage } from '@shared/automations';
import { childReplyOf } from '@shared/children';
import type { FileChange, HandoffInfo, Question, TimelineItem, ToolInfo, ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { confirmResume, takeoverDialog } from '../../lib/activity';
import { sentPicturesShown, splitAttachedFiles, type SentPictures } from '../../lib/attachments';
import { basename, clockTime, compact, duration, stripAnsi, tildify } from '../../lib/format';
import { langFromPath } from '../../lib/highlight';
import { openFile, openSession } from '../../lib/nav';
import { toastError, useApp, useLive, useSessions } from '../../lib/store';
import { CodeBlock, CopyButton, Markdown, useSmoothText } from '../../components/Markdown';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, useConfirm } from '../../components/ui';
import { allAnswered, answerOf, QuestionForm, type Picks } from './QuestionForm';
import { openLightbox } from '../../components/Lightbox';
import { commandLabel, commandLine } from '../../lib/commands';
import { toolView } from '../registry';
import { mu } from '../../lib/machine';
import { ReadAloudButton } from '../voice/ReadAloud';
import { TriggerIcon } from '../automations/parts';
import { ChildReplyRow } from '../children/ChildReply';

/** The session's folder (paths inside it are shown relative to it) and a way to show its changes. */
/** `fork(at)`: start a new session from this one, up to the transcript entry `at` (Claude) or all of it. */
export const SessionCtx = createContext<{ sessionKey?: string; cwd?: string; openChanges?: (path?: string) => void; fork?: (at?: string) => void }>({});

const imageUrl = (key: string, at: number, n: number) => mu(`/api/sessions/${enc(key)}/image?at=${at}&n=${n}`);

/**
 * A message's images, read from its transcript line; a click opens them large. `sent`: its pictures as sent from
 * this page (lib/attachments.ts), shown until its own have loaded in their place.
 */
function MessageImages({ item, sent }: { item: Extract<TimelineItem, { kind: 'user' }>; sent?: SentPictures }) {
  const { sessionKey } = useContext(SessionCtx);
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const at = item.imageAt;
  // Its own pictures load and decode out of sight first, then take the place of these without a blank moment.
  useEffect(() => {
    if (!sent || sent.done || at == null || !sessionKey) return;
    let gone = false;
    const own = sent.urls.map((_, n) => {
      const img = new Image();
      img.src = imageUrl(sessionKey, at, n);
      return img.decode();
    });
    // Not there (yet): these stay.
    Promise.all(own).then(() => gone || sentPicturesShown(sessionKey, sent.id), () => {});
    return () => {
      gone = true;
    };
  }, [sent, at, sessionKey]);
  if (!item.images) return null;
  const srcs = sent && !sent.done ? sent.urls : at != null && sessionKey ? Array.from({ length: item.images }, (_, n) => imageUrl(sessionKey, at, n)) : null;
  if (!srcs) return <div className="text-[12px] text-fg-3">{item.images} image{item.images > 1 ? 's' : ''} attached</div>;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {srcs.map((src, n) =>
        failed.has(n) ? (
          <span key={n} className="flex h-20 w-24 items-center justify-center rounded-xl border border-dashed border-line-2 px-2 text-center text-[11px] text-fg-3">
            Image no longer available
          </span>
        ) : (
          <button key={n} type="button" onClick={() => openLightbox(srcs.map((s, i) => ({ src: s, name: `Image ${i + 1}` })), n)} className="cursor-zoom-in" aria-label={`Show image ${n + 1} large`}>
            <img
              src={src}
              // Sent from here: in memory already, and a lazy one would show a frame late.
              loading={sent ? undefined : 'lazy'}
              alt=""
              onError={() => setFailed((f) => new Set(f).add(n))}
              className="h-24 max-w-[220px] rounded-xl border border-line object-cover transition-opacity hover:opacity-90"
            />
          </button>
        ),
      )}
    </div>
  );
}

/** Empty thinking blocks shorter than this are left out of the timeline. */
export const MIN_SILENT_THOUGHT_MS = 3000;

export function hiddenThought(i: TimelineItem): boolean {
  return i.kind === 'thinking' && !i.text.trim() && !i.streaming && (i.durationMs ?? 0) < MIN_SILENT_THOUGHT_MS;
}

// ---- small pieces ---------------------------------------------------------------

function useTick(active: boolean, ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

export function Elapsed({ since }: { since?: number }) {
  useTick(!!since);
  if (!since) return null;
  return <span className="tnum">{duration(Date.now() - since)}</span>;
}

function PathLink({ path, className }: { path: string; className?: string }) {
  const home = useApp((s) => s.boot?.home);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openFile(path);
      }}
      className={cx('min-w-0 truncate text-left font-mono text-[12px] text-accent hover:underline', className)}
      title={path}
    >
      {tildify(path, home)}
    </button>
  );
}

function OutputBlock({ text, live, truncated, onFull, className }: { text?: string; live?: boolean; truncated?: boolean; onFull?: () => void; className?: string }) {
  const clean = useMemo(() => stripAnsi(text ?? ''), [text]);
  if (!clean && !live) return null;
  return (
    <div className={cx('relative overflow-hidden rounded-lg border border-line', className)}>
      <div className="absolute top-1 right-1 z-[1] opacity-0 transition-opacity group-hover/out:opacity-100">
        <CopyButton text={clean} />
      </div>
      <pre className="term-out group/out max-h-[360px] overflow-auto px-3 py-2">
        {clean}
        {live && <span className="caret" />}
      </pre>
      {truncated && onFull && (
        <button onClick={onFull} className="w-full border-t border-line bg-bg-1 py-1 text-[11.5px] text-fg-3 hover:bg-bg-3 hover:text-fg">
          Load full output
        </button>
      )}
    </div>
  );
}

function FileChanges({ files, truncated, onFull }: { files: FileChange[]; truncated?: boolean; onFull?: () => void }) {
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={f.path + i} className="overflow-hidden rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-bg-1 px-2.5 py-1.5">
            {f.op === 'create' ? <FilePlus2 size={13} className="shrink-0 text-add" /> : <FilePen size={13} className="shrink-0 text-fg-3" />}
            <PathLink path={f.path} className="flex-1" />
            {f.op === 'move' && f.movePath && <span className="truncate text-[11px] text-fg-3">→ {basename(f.movePath)}</span>}
            {f.op === 'delete' && <span className="text-[11px] text-del">deleted</span>}
            <DiffStat added={f.added} removed={f.removed} />
          </div>
          {f.diff ? <DiffView diff={f.diff} /> : <div className="px-3 py-2 text-[12px] text-fg-3">No diff recorded</div>}
          {f.diffTruncated && onFull && (
            <button onClick={onFull} className="w-full border-t border-line bg-bg-1 py-1 text-[11.5px] text-fg-3 hover:bg-bg-3">
              Load the full diff
            </button>
          )}
        </div>
      ))}
      {truncated && !files.some((f) => f.diffTruncated) && onFull && (
        <button onClick={onFull} className="text-[11.5px] text-fg-3 hover:text-fg">
          Load full details
        </button>
      )}
    </div>
  );
}

// ---- tools -------------------------------------------------------------------------

const CAT_ICON: Record<string, typeof Wrench> = {
  command: SquareTerminal,
  edit: FilePen,
  read: FileText,
  search: Search,
  web: Globe,
  task: Bot,
  todo: ListChecks,
  question: MessageCircleQuestion,
  plan: MapIcon,
  mcp: Plug,
  message: Send,
  other: Wrench,
};

/** A step as its capability presents it (registry.tsx): the kind it counts as, its verb and title. */
function shown(t: ToolInfo): ToolInfo & { verb?: string } {
  const s = toolView(t.name, t)?.step?.(t);
  return s ? { ...t, category: s.category ?? t.category, title: s.title ?? t.title, verb: s.verb } : t;
}

/** The icon for a run of steps: its most common kind. */
export function stepsIcon(items: TimelineItem[]): typeof Wrench {
  const n = new Map<string, number>();
  for (const it of items) {
    if (it.kind !== 'tool') continue;
    const c = shown(it.tool).category;
    n.set(c, (n.get(c) ?? 0) + 1);
  }
  let best = 'other';
  for (const [c, k] of n) if (k > (n.get(best) ?? 0)) best = c;
  return CAT_ICON[best] ?? Wrench;
}

export function verb(t: ToolInfo): string {
  const running = t.status === 'running' || t.status === 'pending';
  switch (t.category) {
    case 'command':
      if (t.name === 'BashOutput' || t.name === 'TaskOutput' || t.name === 'KillShell' || t.name === 'TaskStop' || t.name === 'write_stdin' || t.title.startsWith('Check on')) return '';
      return running ? 'Running' : 'Ran';
    case 'edit':
      if (t.files?.length === 1 && t.files[0].op === 'create') return running ? 'Creating' : 'Created';
      if (t.files?.length === 1 && t.files[0].op === 'delete') return 'Deleted';
      return running ? 'Editing' : 'Edited';
    case 'read':
      return running ? 'Reading' : 'Read';
    case 'search':
      return running ? 'Searching' : 'Searched';
    case 'web':
      return t.name === 'WebFetch' ? (running ? 'Fetching' : 'Fetched') : running ? 'Searching the web' : 'Searched the web';
    case 'task':
      return t.name === 'Agent' || t.name === 'Task' ? 'Subagent' : '';
    case 'mcp':
      return running ? 'Calling' : 'Called';
    default:
      return '';
  }
}

function toolTitle(t: ToolInfo, home?: string, cwd?: string): string {
  if (t.category === 'edit' || t.category === 'read') {
    if (cwd && t.title.startsWith(cwd + '/')) return t.title.slice(cwd.length + 1);
    return tildify(t.title, home);
  }
  return t.title;
}

function StatusIcon({ t }: { t: ToolInfo }) {
  if (t.status === 'running' || t.status === 'pending') return <span className="mx-1 h-1.5 w-1.5 shrink-0 rounded-full bg-busy" aria-label="Running" />;
  if (t.status === 'error') return <XCircle size={14} className="text-err" />;
  if (t.status === 'declined') return <CircleSlash size={14} className="text-warn" />;
  if (t.status === 'interrupted') return <Octagon size={13} className="text-warn" />;
  if (t.status === 'waiting') return <CircleDashed size={14} className="text-warn" />;
  return null;
}

export function ToolDetail({ t, item, sessionKey }: { t: ToolInfo; item: ToolItem; sessionKey: string }) {
  const [full, setFull] = useState<ToolInfo | null>(null);
  const tool = full ?? t;
  const loadFull = async () => {
    try {
      const it = await api<TimelineItem>(`/api/sessions/${enc(sessionKey)}/items/${enc(item.id)}`);
      if (it.kind === 'tool') setFull({ ...it.tool, liveOutput: t.liveOutput });
    } catch {}
  };
  const input = tool.input as Record<string, any> | undefined;
  return (
    <div className="space-y-2 pt-1.5 pb-2 pl-7">
      {tool.auto && <div className="text-[12px] text-fg-3">{tool.auto}</div>}
      {tool.category === 'command' && (
        <>
          <div className="code-block">
            <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-[11px] text-fg-3">
              <span className="font-mono">{tool.cwd ? tildify(tool.cwd) : 'shell'}</span>
              {tool.background && <span className="rounded bg-bg-3 px-1.5">background{tool.taskId ? ` · ${tool.taskId}` : ''}</span>}
              <span className="flex-1" />
              {tool.exitCode != null && <span className={tool.exitCode === 0 ? 'text-ok' : 'text-err'}>exit {tool.exitCode}</span>}
              {tool.durationMs != null && <span>{duration(tool.durationMs)}</span>}
              <CopyButton text={tool.title} />
            </div>
            <pre className="!py-2 whitespace-pre-wrap">
              <code>{tool.title}</code>
            </pre>
          </div>
          {tool.subtitle && <div className="text-[12px] text-fg-3">{tool.subtitle}</div>}
          <OutputBlock text={tool.liveOutput && !tool.output ? tool.liveOutput : tool.output} live={tool.status === 'running' && !!tool.liveOutput} truncated={tool.truncated && !full} onFull={loadFull} />
          {tool.files && <FileChanges files={tool.files} />}
        </>
      )}
      {tool.category === 'edit' && (tool.files?.length ? <FileChanges files={tool.files} truncated={tool.truncated && !full} onFull={loadFull} /> : <OutputBlock text={tool.output} />)}
      {tool.category === 'edit' && tool.error && <div className="text-[12px] text-err">{tool.error}</div>}
      {tool.category === 'read' && (
        <>
          <div className="flex items-center gap-2 text-[12px] text-fg-3">
            <PathLink path={tool.title} />
            {tool.subtitle && <span>· {tool.subtitle}</span>}
          </div>
          {tool.output && <CodeBlock code={tool.output.replace(/^\s*\d+\t/gm, '')} lang={langFromPath(tool.title)} maxHeight={320} />}
        </>
      )}
      {tool.category === 'message' && tool.output && <Markdown text={tool.output} className="!text-[13.5px] !text-fg-2" />}
      {(tool.category === 'search' || tool.category === 'mcp' || tool.category === 'other') && (
        <>
          {input && Object.keys(input).length > 0 && <CodeBlock code={JSON.stringify(input, null, 2)} lang="json" maxHeight={240} />}
          <OutputBlock text={tool.output} truncated={tool.truncated && !full} onFull={loadFull} />
        </>
      )}
      {tool.category === 'web' && (
        <>
          {/^https?:\/\//.test(tool.title) && (
            <a href={tool.title} target="_blank" rel="noopener noreferrer" className="block truncate text-[12px] text-accent hover:underline">
              {tool.title}
            </a>
          )}
          {tool.output && (
            <div className="max-h-[360px] overflow-auto rounded-lg border border-line px-3 py-2">
              <Markdown text={tool.output} className="!text-[13px]" />
            </div>
          )}
        </>
      )}
      {tool.category === 'task' && (
        <>
          {input?.prompt && (
            <details className="rounded-lg border border-line px-3 py-2 text-[12.5px]">
              <summary className="cursor-pointer text-fg-3">Task given</summary>
              <div className="mt-2 whitespace-pre-wrap text-fg-2">{String(input.prompt)}</div>
            </details>
          )}
          {tool.output && (
            <div className="max-h-[480px] overflow-auto rounded-lg border border-line px-3 py-2">
              <Markdown text={tool.output} className="!text-[13.5px]" />
            </div>
          )}
        </>
      )}
      {tool.category === 'plan' && input?.plan && (
        <div className="rounded-lg border border-line px-3 py-2">
          <Markdown text={String(input.plan)} />
        </div>
      )}
      {tool.error && tool.category !== 'edit' && tool.category !== 'command' && <div className="text-[12px] text-err">{tool.error}</div>}
    </div>
  );
}

/** A step on one line: what it is, then how it went. A row's button, or a folded box's only line. */
export function ToolLine({ item }: { item: ToolItem }) {
  const t = shown(item.tool);
  const home = useApp((s) => s.boot?.home);
  const { cwd } = useContext(SessionCtx);
  const Icon = CAT_ICON[t.category] ?? Wrench;
  const running = t.status === 'running' || t.status === 'pending';
  const v = t.verb ?? verb(t);
  const added = t.files?.reduce((a, f) => a + f.added, 0) ?? 0;
  const removed = t.files?.reduce((a, f) => a + f.removed, 0) ?? 0;
  // A command reads by what it is for ("Run the tests"); the command itself follows, quieter.
  const cmd = t.category === 'command';
  const line = useMemo(() => (cmd ? commandLine(t.title) : ''), [cmd, t.title]);
  const label = useMemo(() => (cmd ? t.label || (v ? commandLabel(t.title) : undefined) : undefined), [cmd, t.label, t.title, v]);
  return (
    <>
        <Icon size={14} className={cx('shrink-0', t.status === 'error' ? 'text-err' : running ? 'text-busy' : 'text-fg-3')} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
          {label ? (
            <>
              <span className={cx('max-w-full shrink-0 truncate', running ? 'shine' : 'text-fg-2')}>{label}</span>
              <span className="hidden min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-3 sm:block">{line}</span>
            </>
          ) : (
            <>
              {v && <span className={cx('shrink-0', running ? 'text-fg' : 'text-fg-3')}>{v}</span>}
              <span className={cx('min-w-0 truncate', (cmd || t.category === 'search') && 'font-mono text-[12px]', running ? 'shine' : 'text-fg-2')}>
                {(cmd ? line : toolTitle(t, home, cwd)) || t.name}
              </span>
              {t.subtitle && !cmd && <span className="hidden min-w-0 shrink truncate text-[12px] text-fg-3 sm:inline">{t.subtitle}</span>}
            </>
          )}
        </span>
        {t.background && <span className="shrink-0 rounded-md bg-bg-2 px-1.5 text-[11px] text-fg-3">background</span>}
        {t.auto && (
          <span title={t.auto} className={cx('shrink-0 rounded-md px-1.5 text-[11px]', t.status === 'error' ? 'bg-err/10 text-err' : 'bg-accent/10 text-accent')}>
            Auto
          </span>
        )}
        <DiffStat added={added} removed={removed} />
        {t.exitCode != null && t.exitCode !== 0 && <span className="shrink-0 font-mono text-[11px] text-err">exit {t.exitCode}</span>}
        {running ? (
          <span className="shrink-0 text-[11px] text-fg-3">
            <Elapsed since={item.ts} />
          </span>
        ) : (
          t.durationMs != null && t.durationMs >= 1500 && <span className="tnum shrink-0 text-[11px] text-fg-3">{duration(t.durationMs)}</span>
        )}
        <StatusIcon t={t} />
    </>
  );
}

/** The step under way, as the one line of a folded box of steps. */
export function StepLine({ item }: { item: TimelineItem }) {
  if (item.kind === 'tool') return <ToolLine item={item} />;
  if (item.kind !== 'thinking') return null;
  const head = item.text.trim().match(/^\*\*(.+?)\*\*/)?.[1];
  return (
    <>
      <Brain size={14} className="shrink-0 text-busy" />
      <span className="shine shrink-0 text-[13px]">Thinking</span>
      {head && <span className="min-w-0 truncate text-[12.5px] text-fg-3">· {head}</span>}
      <span className="flex-1" />
      {item.ts && (
        <span className="shrink-0 text-[11px] text-fg-3">
          <Elapsed since={item.ts} />
        </span>
      )}
    </>
  );
}

export const ToolRow = memo(function ToolRow({
  item,
  sessionKey,
  forceOpen,
  trailing,
  more,
  inWork,
}: {
  item: ToolItem;
  sessionKey: string;
  forceOpen?: boolean;
  trailing?: ReactNode;
  more?: ToolItem[];
  /** Among the steps of the work, where what shows with the reply (a page saved again later in the turn) is a step too. */
  inWork?: boolean;
}) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const isOpen = open || !!forceOpen;

  // The app's own tools (show_html, web_search…) show as their capability draws them (registry.tsx).
  const view = toolView(t.name, t);
  if (view && !(inWork && view.place === 'answer')) return <view.Row item={item} sessionKey={sessionKey} more={more} />;
  if (t.category === 'todo') return <TodoCard t={t} sessionKey={sessionKey} />;
  if (t.category === 'question') return <QuestionCard t={t} sessionKey={sessionKey} />;

  return (
    <div className="tl-item">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', isOpen && 'bg-bg-2')}
      >
        <ToolLine item={item} />
        {trailing}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', isOpen && 'rotate-90 opacity-100')} />
      </button>
      {isOpen && <ToolDetail t={t} item={item} sessionKey={sessionKey} />}
    </div>
  );
});

// How far each plan item has got (by session and text), and since when: an item that gets done while
// the page is open pops its check and draws a line through itself; one already done when shown
// does not (a session opening renders all its plans at once, within the same moment).
const RANK: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 };
const planSeen = new Map<string, { rank: number; at: number }>();
function justDone(key: string, status: string, now: number): boolean {
  const rank = RANK[status] ?? 0;
  const prev = planSeen.get(key);
  if (!prev || rank > prev.rank) planSeen.set(key, { rank, at: now });
  return rank === 2 && !!prev && prev.rank < 2 && now - prev.at > 500;
}

function TodoCard({ t, sessionKey }: { t: ToolInfo; sessionKey: string }) {
  const todos = t.todos ?? [];
  const done = todos.filter((x) => x.status === 'completed').length;
  // Kept for the length of the animation, whatever renders in between.
  const fresh = useRef(new Map<string, number>());
  const now = performance.now();
  const anim = todos.map((x) => {
    if (justDone(`${sessionKey}|${x.text}`, x.status, now)) fresh.current.set(x.text, now);
    const at = fresh.current.get(x.text);
    return at != null && now - at < 1000;
  });
  return (
    <div className="tl-item my-2 rounded-2xl border border-line bg-bg-1 px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[12.5px] text-fg-3">
        <ListChecks size={15} />
        <span className="font-medium text-fg-2">{t.title === 'Plan' || t.name === 'update_plan' ? 'Plan' : 'To-dos'}</span>
        <span>
          {done}/{todos.length}
        </span>
        {t.subtitle && <span className="truncate">· {t.subtitle}</span>}
      </div>
      <ul className="space-y-1">
        {todos.map((x, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13.5px]">
            <span
              className={cx(
                'mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
                x.status === 'completed' ? 'border-ok bg-ok text-bg' : x.status === 'in_progress' ? 'border-busy' : 'border-line-2',
                anim[i] && 'anim-pop-in',
              )}
            >
              {x.status === 'completed' && <Check size={9} strokeWidth={3.5} className={anim[i] ? 'anim-draw' : undefined} />}
              {x.status === 'in_progress' && <span className="anim-pop-in h-1.5 w-1.5 rounded-full bg-busy" />}
            </span>
            <span className={cx(x.status === 'completed' && (anim[i] ? 'strike-in text-fg-3' : 'text-fg-3 line-through'), x.status === 'in_progress' && 'font-medium')}>{x.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionCard({ t, sessionKey }: { t: ToolInfo; sessionKey: string }) {
  const qs = t.questions ?? [];
  const answers = t.answers ?? {};
  const answerFor = (q: Question) => answers[q.question] ?? answers[q.id];
  const answered = qs.some((q) => answerFor(q));
  const open = !answered && qs.length > 0 && (t.status === 'running' || t.status === 'pending' || t.status === 'waiting');
  const client = useSessions((x) => (open ? x.byKey[sessionKey]?.external?.client : undefined));
  const liveStatus = useLive((x) => (open ? x.byKey[sessionKey]?.live?.status : undefined));
  const pending = useLive((x) => (open ? (x.byKey[sessionKey]?.live?.pendingApprovals ?? 0) : 0));
  const [picks, setPicks] = useState<Picks>({});
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const here = !!liveStatus && liveStatus !== 'exited' && liveStatus !== 'error';
  // Open in another client: Claude Code can be moved here to answer; Codex can't.
  const takeover = !!client && sessionKey.startsWith('claude:');

  // Nobody can answer in place any more (the agent stopped, or it waits in another client):
  // the answer goes in as the next message.
  const send = async () => {
    if (!allAnswered(qs, picks) || busy || (client && !takeover)) return;
    const s = useSessions.getState().byKey[sessionKey];
    if (takeover ? !s || !(await confirm(takeoverDialog(s))) : !here && s && !(await confirmResume(s))) return;
    setBusy(true);
    try {
      const text = qs.map((q) => `${q.question}\n→ ${answerOf(q, picks[q.id], ', ')}`).join('\n\n');
      await post(`/api/sessions/${enc(sessionKey)}/${takeover ? 'takeover' : 'message'}`, { text });
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const head = (label: string, tone = 'text-fg-2') => (
    <div className="mb-1.5 flex items-center gap-2 text-[12px] text-fg-3">
      <MessageCircleQuestion size={14} className={open ? 'text-warn' : undefined} />
      <span className={cx('font-medium', tone)}>{label}</span>
    </div>
  );

  if (open && here && pending > 0) {
    return (
      <div className="tl-item my-2 rounded-2xl border border-line bg-bg-1 px-4 py-3">
        {head('Asked you')}
        {qs.map((q) => (
          <div key={q.id} className="text-[13px]">
            {q.question}
          </div>
        ))}
        <div className="mt-1 text-[12px] text-fg-3">Answer in the card below.</div>
      </div>
    );
  }

  if (open) {
    return (
      <div className="tl-item my-3 rounded-2xl border border-warn/40 bg-panel px-4 py-4 shadow-[0_0_0_4px_color-mix(in_srgb,var(--warn)_8%,transparent)]">
        {head(client ? `Asked you in ${client}` : 'Asked you', 'text-fg')}
        <QuestionForm questions={qs} value={picks} onChange={setPicks} disabled={busy || (!!client && !takeover)} onSubmit={send} />
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {client && !takeover ? (
            <span className="text-[12px] text-fg-3">Waiting in {client}: answer it there.</span>
          ) : (
            <>
              <Button size="sm" variant="primary" disabled={busy || !allAnswered(qs, picks)} onClick={send}>
                {takeover ? 'Answer here' : here ? 'Send answer' : 'Resume and answer'}
              </Button>
              <span className="text-[11.5px] text-fg-3">
                {takeover
                  ? `Ends the session in ${client} and continues it here with your answer.`
                  : here
                    ? 'Sent as your next message.'
                    : 'The session stopped while asking; your answer resumes it.'}
              </span>
            </>
          )}
        </div>
        {confirmNode}
      </div>
    );
  }

  return (
    <div className="tl-item my-2 rounded-2xl border border-line bg-bg-1 px-4 py-3">
      {head('Asked you')}
      {qs.length ? (
        qs.map((q) => (
          <div key={q.id} className="mb-1 text-[13px]">
            <div className="text-fg">{q.question}</div>
            {answerFor(q) ? (
              <div className="mt-0.5 flex items-center gap-1.5 text-fg-2">
                <Check size={12} className="shrink-0 text-ok" />
                {answerFor(q)}
              </div>
            ) : (
              <div className="mt-0.5 text-[12px] text-fg-3">{q.options.map((o) => o.label).join(' · ')}</div>
            )}
          </div>
        ))
      ) : (
        <div className="text-[13px]">{t.title}</div>
      )}
      {!answered && qs.length > 0 && <div className="mt-1 text-[12px] text-fg-3">Not answered</div>}
    </div>
  );
}

// ---- thinking ------------------------------------------------------------------------

export function ThinkingRow({ item }: { item: Extract<TimelineItem, { kind: 'thinking' }> }) {
  const [open, setOpen] = useState(false);
  const text = item.text.trim();
  const label = item.streaming ? 'Thinking' : item.durationMs && item.durationMs >= 1000 ? `Thought for ${duration(item.durationMs)}` : 'Thought';
  const head = text.match(/^\*\*(.+?)\*\*/)?.[1];
  if (hiddenThought(item)) return null;
  return (
    <div className="tl-item">
      <button onClick={() => text && setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left', text && 'hover:bg-bg-2')}>
        <Brain size={14} className={cx('shrink-0', item.streaming ? 'text-busy' : 'text-fg-3')} />
        <span className={cx('shrink-0 text-[13px]', item.streaming ? 'shine' : 'text-fg-3')}>{label}</span>
        {head && !open && <span className="min-w-0 truncate text-[12.5px] text-fg-3">· {head}</span>}
        <span className="flex-1" />
        {item.streaming && item.ts && (
          <span className="shrink-0 text-[11px] text-fg-3">
            <Elapsed since={item.ts} />
          </span>
        )}
        {text && <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />}
      </button>
      {open && text && (
        <div className="mt-1 mb-2 ml-[17px] border-l border-line-2 pl-4 text-fg-2">
          <Markdown text={text} className="!text-[13.5px] !text-fg-2" />
        </div>
      )}
    </div>
  );
}

// ---- messages --------------------------------------------------------------------------

/** Codex's VS Code extension puts the editor's open tabs in front of the prompt. */
function splitIdeContext(text: string): { context: string; request: string } | null {
  if (!text.startsWith('# Context from my IDE setup')) return null;
  const i = text.indexOf('## My request');
  if (i < 0) return null;
  return { context: text.slice(0, i).trim(), request: text.slice(i).replace(/^## My request[^\n]*\n?/, '').trim() };
}

/** The conversation a session started with, carried over from another agent's session. */
function HandoffCard({ h }: { h: HandoffInfo }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <div className="rounded-2xl border border-line bg-bg-1 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          <AgentIcon agent={h.agent} size={14} />
          <span className="text-fg-2">
            Continued from {agentName(h.agent)}
            {h.title && <span className="text-fg"> · {h.title}</span>}
          </span>
          <span className="flex-1" />
          {h.key && (
            <button onClick={() => openSession(h.key!)} className="text-accent hover:underline">
              Open that session
            </button>
          )}
        </div>
        <button onClick={() => setOpen((o) => !o)} className="mt-1 text-[12px] text-fg-3 transition-colors hover:text-fg">
          {open ? 'Hide' : 'Show'} the {h.messages} message{h.messages === 1 ? '' : 's'} carried over{h.omitted ? ` (${h.omitted} older left out)` : ''}
        </button>
        {open && <pre className="mt-2 max-h-[50vh] overflow-auto rounded-lg bg-bg px-3 py-2 font-mono text-[12px] whitespace-pre-wrap text-fg-2">{h.context}</pre>}
      </div>
    </div>
  );
}

/** A message another session sent this one: who sent it and how it starts, the text a click away. */
function PeerMessage({ item }: { item: Extract<TimelineItem, { kind: 'user' }> }) {
  const [open, setOpen] = useState(false);
  const p = item.peer!;
  const head = useMemo(() => {
    const l = item.text.split('\n').find((x) => x.trim()) ?? '';
    return l.replace(/^\s*(#+|[-*+>]|\d+[.)])\s+/, '').replace(/[*_`]/g, '').trim();
  }, [item.text]);
  return (
    <div className="tl-item">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <Inbox size={14} className="shrink-0 text-accent" />
        <span className="max-w-[60%] shrink-0 truncate text-[13px] text-fg-2">
          From <span className="font-medium text-fg">{p.name || 'another session'}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3">{!open && head && `· ${head}`}</span>
        <span className="shrink-0 text-[11px] text-fg-3">{clockTime(item.ts)}</span>
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">
          <div className="mb-1 text-[11.5px] text-fg-3">
            {p.mode && <span className="mr-1.5 rounded bg-bg-2 px-1.5 py-px">{p.mode}</span>}
            from another Claude session
          </div>
          <Markdown text={item.text} breaks className="!text-[13.5px] !leading-relaxed !text-fg-2" />
        </div>
      )}
    </div>
  );
}

/**
 * The message a scheduled task's run started with, as one line: the task and how often it runs. Its
 * prompt is a click away, with what the app added for the run (the time, report_outcome, its notes).
 */
function RunMessageRow({ item, run }: { item: Extract<TimelineItem, { kind: 'user' }>; run: RunMessage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <TriggerIcon trigger={run.trigger} size={14} className="!text-accent" />
        <span className="max-w-[70%] shrink-0 truncate text-[13px] text-fg-2">
          {run.trigger === 'test' ? 'Test run of' : 'Scheduled task'} <span className="font-medium text-fg">{run.task}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3">· {run.trigger === 'schedule' ? run.when : RUN_WHY[run.trigger]}</span>
        <span className="shrink-0 text-[11px] text-fg-3">{clockTime(item.ts)}</span>
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[15px] border-l border-accent/30 pl-4">
          <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">{run.body}</div>
          <div className="mt-2.5 text-[11.5px] text-fg-3">Added by the app for this run:</div>
          <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-bg-1 px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-fg-3">{run.preamble}</pre>
        </div>
      )}
    </div>
  );
}

/** A message of yours longer than this many lines folds to its first six (`max-h-[6lh]` below) until opened. */
const FOLD_PAST = 9;
/** Find in this session sends this to a message it shows, so a folded one opens on what was found. */
export const UNFOLD = 'wa:unfold';

/** Whether an element's text runs past `lines` lines, measured again whenever its width changes. */
function useRunsPast(ref: RefObject<HTMLElement | null>, lines: number, text: string): boolean {
  const [past, setPast] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Folded, the box is cut short, but its scrollHeight is still the whole text's.
    const measure = () => setPast(el.scrollHeight > (lines + 0.5) * (parseFloat(getComputedStyle(el).lineHeight) || 24));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, lines, text]);
  return past;
}

/** The box an element scrolls in. */
function scrollBox(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
  return null;
}

/** `sent`: its pictures as sent from this page, while it cannot show its own (lib/attachments.ts). */
export const UserBubble = memo(function UserBubble({ item, arrive, sent }: { item: Extract<TimelineItem, { kind: 'user' }>; arrive?: boolean; sent?: SentPictures }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const { sessionKey } = useContext(SessionCtx);
  // Your own messages in sessions this app can drive (not ones only open elsewhere).
  const canEdit = useSessions((x) => {
    const s = sessionKey ? x.byKey[sessionKey] : undefined;
    return !!s && !s.external && (s.agent !== 'acp' || s.acpAgent === 'console') && !item.meta && !item.peer;
  });
  const [showContext, setShowContext] = useState(false);
  const parsed = useMemo(() => {
    const { text, files } = splitAttachedFiles(item.text);
    const ide = splitIdeContext(text);
    return { text: ide ? ide.request : text, files, context: ide?.context, run: splitRunMessage(item.text), child: childReplyOf(item.text) };
  }, [item.text]);
  // A long message shows its first lines, the rest a click away; it folds again after.
  const long = useRunsPast(body, FOLD_PAST, parsed.text);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const open = () => flushSync(() => setExpanded(true));
    el.addEventListener(UNFOLD, open);
    return () => el.removeEventListener(UNFOLD, open);
  }, []);
  if (item.peer) return <PeerMessage item={item} />;
  if (parsed.run) return <RunMessageRow item={item} run={parsed.run} />;
  if (parsed.child) return <ChildReplyRow item={item} reply={parsed.child} />;
  if (item.meta === 'slash') {
    return (
      <div className="tl-item flex justify-end">
        <span className="rounded-lg bg-bg-2 px-2.5 py-1 font-mono text-[12.5px] text-fg-2">{item.text}</span>
      </div>
    );
  }
  if (item.meta === 'command-output' || item.meta === 'note') {
    return (
      <details className="tl-item rounded-lg px-2 py-1 text-[12.5px]">
        <summary className="cursor-pointer text-fg-3 transition-colors hover:text-fg-2">{item.meta === 'note' ? 'Message from the harness' : 'Command output'}</summary>
        <pre className="term-out mt-2 max-h-80 overflow-auto rounded-lg px-3 py-2">{item.text}</pre>
      </details>
    );
  }
  const { text, files, context } = parsed;
  // Folding a message read on past its top brings it back into view, so it is not left above the screen.
  const fold = () => {
    const el = root.current;
    const box = el && scrollBox(el);
    if (el && box && el.getBoundingClientRect().top < box.getBoundingClientRect().top) el.scrollIntoView({ block: 'start' });
    setExpanded(false);
  };
  return (
    <>
      {item.handoff && <HandoffCard h={item.handoff} />}
      <div ref={root} data-seq={item.seq} data-text={item.id} className={cx('tl-item group/u flex scroll-mt-6 flex-col items-end gap-1.5', arrive && 'anim-msg-in')}>
        {item.images ? <MessageImages item={item} sent={sent} /> : null}
        {(text || files.length > 0 || context) && (
          // Short ones keep to their words; a long one is as wide as the message box, and lines up with it.
          // (A session just started shows it the same way while it starts: StartingSession.tsx.)
          <div className="max-w-full rounded-[20px] bg-bg-2 px-4 py-2.5">
            {text && (
              <div
                ref={body}
                translate="no"
                data-quote
                className={cx(
                  'text-[15px] leading-relaxed break-words whitespace-pre-wrap',
                  long && !expanded && 'max-h-[6lh] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%_-_2lh),transparent)]',
                )}
              >
                {text}
              </div>
            )}
            {files.length > 0 && (
              <div className={cx('flex flex-wrap gap-1.5', text && 'mt-2')}>
                {files.map((f) => (
                  <button key={f} onClick={() => openFile(f)} title={f} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-bg-1 px-2 py-1 text-[12px] text-fg-2 transition-colors hover:text-fg">
                    <FileText size={12} className="shrink-0" />
                    <span className="truncate">{basename(f)}</span>
                  </button>
                ))}
              </div>
            )}

            {(long || context) && (
              <div className="mt-1 flex gap-3">
                {long && (
                  <button onClick={() => (expanded ? fold() : setExpanded(true))} aria-expanded={expanded} className="text-[12.5px] text-fg-3 transition-colors hover:text-fg">
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
                {context && (
                  <button onClick={() => setShowContext((v) => !v)} className="text-[12.5px] text-fg-3 transition-colors hover:text-fg">
                    {showContext ? 'Hide editor context' : 'Editor context'}
                  </button>
                )}
              </div>
            )}
            {context && showContext && <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-bg-1 px-3 py-2 font-mono text-[12px] whitespace-pre-wrap text-fg-3">{context}</pre>}
          </div>
        )}
        {editing ? (
          <EditFromHere item={item} initial={text} onDone={() => setEditing(false)} />
        ) : (
          <div className={cx('mt-1 mr-2 flex items-center gap-1.5 text-[11.5px] text-fg-3 transition-opacity', item.meta !== 'queued' && 'opacity-0 group-hover/u:opacity-100 focus-within:opacity-100')}>
            {item.meta === 'queued' && <span>sent while working ·</span>}
            {canEdit && (
              <>
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded px-1 transition-colors hover:text-fg" title="Go back to just before this message and send something else">
                  <Pencil size={11} /> Edit from here
                </button>
                <span>·</span>
              </>
            )}
            <span>{clockTime(item.ts)}</span>
          </div>
        )}
      </div>
    </>
  );
});

/**
 * "Edit from here": new text for one of your messages. The conversation goes back to just before it
 * and continues in a copy (the current session is archived); the files can go back too.
 */
function EditFromHere({ item, initial, onDone }: { item: Extract<TimelineItem, { kind: 'user' }>; initial: string; onDone: () => void }) {
  const { sessionKey } = useContext(SessionCtx);
  const s = useSessions((x) => (sessionKey ? x.byKey[sessionKey] : undefined));
  const [text, setText] = useState(initial);
  const [restore, setRestore] = useState(false);
  const [busy, setBusy] = useState(false);
  const custom = s?.agent === 'acp' && s.acpAgent === 'console';
  const canRestore = s?.agent === 'claude' || custom || !!s?.worktree;
  const send = async () => {
    if (!sessionKey || !text.trim()) return;
    setBusy(true);
    try {
      const r = await post<{ key: string }>(`/api/sessions/${enc(sessionKey)}/rewind`, { itemId: item.id, text, restoreFiles: restore });
      onDone();
      openSession(r.key);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };
  return (
    <div className="w-full space-y-2.5 rounded-2xl border border-accent/40 bg-panel p-3">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onDone();
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={Math.min(10, Math.max(2, text.split('\n').length))}
        className="w-full resize-y bg-transparent text-[15px] leading-relaxed outline-none"
      />
      <label className={cx('flex items-start gap-2 text-[12.5px]', canRestore ? 'text-fg-2' : 'text-fg-3')} title={canRestore ? undefined : 'Codex sessions can put files back only when they work in a worktree'}>
        <input type="checkbox" checked={restore} disabled={!canRestore} onChange={(e) => setRestore(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
        <span>
          Put the files back as they were before this message
          {!canRestore && <span className="block text-[11.5px]">Only for Codex sessions in a worktree.</span>}
          {custom && !s?.worktree && <span className="block text-[11.5px] text-fg-3">The files Custom’s own edits changed; what commands changed stays.</span>}
        </span>
      </label>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[11.5px] text-fg-3">Continues in a copy of the conversation up to here; this one is archived.</span>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={send} disabled={busy || !text.trim()}>
          {busy ? 'Going back…' : 'Send from here'}
        </Button>
      </div>
    </div>
  );
}

/** A reply; `note` for the agent's in-between notes inside a turn's work (they read the same: they are what people read). */
export const AssistantBlock = memo(function AssistantBlock({ item, note }: { item: Extract<TimelineItem, { kind: 'assistant' }>; note?: boolean }) {
  const { text, revealing } = useSmoothText(item.text, !!item.streaming);
  const { fork } = useContext(SessionCtx);
  return (
    <div data-seq={item.seq} data-text={item.id} data-quote className="tl-item group relative">
      <Markdown text={text} streaming={revealing} breaks className={cx(!note && item.phase === 'commentary' && '!text-fg-2')} />
      {!item.streaming && (
        <div className="absolute -top-1 -right-1 flex opacity-0 transition-opacity group-hover:opacity-100">
          {fork && item.entry && !note && (
            <button
              type="button"
              title="Fork from this reply: a new session with the conversation up to here"
              aria-label="Fork from this reply"
              onClick={() => fork(item.entry)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
            >
              <GitFork size={13} />
            </button>
          )}
          <ReadAloudButton id={item.id} text={item.text} />
          <CopyButton text={item.text} label="Copy message" />
        </div>
      )}
    </div>
  );
});

export function SystemRow({ item }: { item: Extract<TimelineItem, { kind: 'system' }> }) {
  const [open, setOpen] = useState(false);
  const Icon = item.peer ? Inbox : item.level === 'error' ? AlertTriangle : item.level === 'warn' ? Octagon : Info;
  return (
    <div className="tl-item">
      <button
        onClick={() => item.detail && setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12.5px]',
          item.level === 'error' ? 'text-err' : item.level === 'warn' ? 'text-warn' : 'text-fg-3',
          item.detail && 'hover:bg-bg-2',
        )}
      >
        <Icon size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 break-words">{item.text}</span>
        {item.detail && <ChevronRight size={12} className={cx('shrink-0 transition-transform', open && 'rotate-90')} />}
      </button>
      {open && item.detail && (
        <div className="mt-1 ml-6 max-h-96 overflow-auto rounded-lg border border-line px-3 py-2">
          <Markdown text={item.detail} className="!text-[13px]" />
        </div>
      )}
    </div>
  );
}

export function TurnRow({ item }: { item: Extract<TimelineItem, { kind: 'turn' }> }) {
  const tk = item.tokens;
  const parts: ReactNode[] = [];
  if (item.durationMs) parts.push(<span key="d">{duration(item.durationMs)}</span>);
  if (tk && (tk.input || tk.output)) parts.push(<span key="t" title={`${tk.input.toLocaleString()} in · ${(tk.cacheRead ?? 0).toLocaleString()} cached · ${tk.output.toLocaleString()} out`}>{compact(tk.input + (tk.cacheRead ?? 0))} in · {compact(tk.output)} out</span>);
  if (item.costUsd) parts.push(<span key="c">${item.costUsd.toFixed(2)}</span>);
  return (
    <div className="tl-item flex items-center gap-3 py-2 text-[11.5px] text-fg-3">
      <span className="h-px flex-1 bg-line" />
      <span className="flex items-center gap-1.5">
        {item.status === 'interrupted' ? <Octagon size={11} className="text-warn" /> : item.status === 'failed' ? <XCircle size={11} className="text-err" /> : <Clock size={11} />}
        {item.status !== 'completed' && <span>{item.status}</span>}
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {(i > 0 || item.status !== 'completed') && <span>·</span>}
            {p}
          </span>
        ))}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** One-line summary of a collapsed run of steps: "Ran 3 commands, made 2 edits, read 4 files". */
export function summarize(items: TimelineItem[]): { text: string; added: number; removed: number } {
  let commands = 0;
  let edits = 0;
  let reads = 0;
  let searches = 0;
  let messages = 0;
  let other = 0;
  let added = 0;
  let removed = 0;
  for (const it of items) {
    if (it.kind !== 'tool') continue;
    const c = shown(it.tool).category;
    if (c === 'command') commands++;
    else if (c === 'edit') edits++;
    else if (c === 'read') reads++;
    else if (c === 'search' || c === 'web') searches++;
    else if (c === 'message') messages++;
    else other++;
    for (const f of it.tool.files ?? []) {
      added += f.added;
      removed += f.removed;
    }
  }
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`;
  const p: string[] = [];
  if (commands) p.push(`ran ${n(commands, 'command')}`);
  if (edits) p.push(`made ${n(edits, 'edit')}`);
  if (reads) p.push(`read ${n(reads, 'file')}`);
  if (searches) p.push(`searched ${n(searches, 'time')}`);
  if (messages) p.push(`sent ${n(messages, 'message')}`);
  if (other) p.push(n(other, 'other step'));
  const text = p.join(', ');
  return { text: text ? text[0].toUpperCase() + text.slice(1) : 'Thinking', added, removed };
}

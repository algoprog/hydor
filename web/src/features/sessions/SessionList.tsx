import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useRoute } from 'wouter';
import { AlarmClock, Archive, CheckCheck, ChevronRight, Folder, Pencil, Pin, PinOff, SquarePen, Target, Trash2 } from 'lucide-react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SearchHit, SessionSummary } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { basename, markRuns, tildify, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { activityOf, inBackground, isBusy, isWorking } from '../../lib/activity';
import { toastError, useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { DiffStat } from '../../components/DiffView';
import { cx, IconButton, Throbber, MenuItem, Popover, useConfirm, useMediaQuery } from '../../components/ui';
import { Elapsed } from '../session/items';
import { newSessionIn } from '../files/actions';
import { SpaceMark, startInSpace } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { ACTIVE_MS, GROUP_ROWS, groupSessions, isFolded, lastActivityAt, unpickedFolders, type GroupKind, type SessionGroup } from './groups';
import { setFlags, settle } from '../../lib/flags';
import { SnoozeItems } from './SnoozeMenu';
import { PrBadge } from '../session/PullRequest';
import { ChildNest, nestChildren } from '../children/Nest';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';

/**
 * Active sessions keep their places: newest to become active on top, then fixed. Working,
 * waiting and finishing a turn never reorder them.
 */
const activeSince = new Map<string, number>();
export function sortActive(list: SessionSummary[]): SessionSummary[] {
  const now = Date.now();
  for (const s of list) if (!activeSince.has(s.key)) activeSince.set(s.key, s.live?.startedAt ?? s.external?.since ?? now);
  return [...list].sort((a, b) => activeSince.get(b.key)! - activeSince.get(a.key)! || (b.createdAt ?? 0) - (a.createdAt ?? 0) || a.key.localeCompare(b.key));
}
/** Forget sessions that stopped, so becoming active again puts them back on top. */
function pruneActive(active: Set<string>) {
  for (const k of activeSince.keys()) if (!active.has(k)) activeSince.delete(k);
}

/** The folder a session works in, as a short name ("~" for the home folder). */
export function folderName(cwd: string | undefined, home?: string): string {
  if (!cwd) return '';
  if (home && cwd === home) return '~';
  return basename(cwd) || '/';
}

/** One line on what a session is doing: "Working · 2m 10s", "Needs you", "Open in VS Code". */
export function ActivityText({ s, className }: { s: SessionSummary; className?: string }) {
  const a = activityOf(s);
  if (!a) return null;
  const where = a.kind === 'external' ? ` in ${a.client}` : '';
  if (isBusy(a)) {
    const since = a.kind === 'external' ? s.external?.since : s.live?.turnStartedAt;
    return (
      <span className={cx('flex min-w-0 items-center gap-1 text-busy', className)}>
        <span className="truncate">{a.status === 'starting' ? 'Starting' : `Working${where}`}</span>
        {since ? (
          <span className="tnum shrink-0">
            · <Elapsed since={since} />
          </span>
        ) : null}
      </span>
    );
  }
  if (a.status === 'waiting') return <span className={cx('truncate text-warn', className)}>{`Needs you${where}`}</span>;
  if (a.status === 'stopping') return <span className={cx('truncate text-fg-3', className)}>Stopping…</span>;
  if (inBackground(a)) return <span className={cx('truncate text-busy', className)}>{`Working${where} · ${a.background} in background`}</span>;
  return <span className={cx('truncate text-fg-3', className)}>{a.kind === 'external' ? `Open${where}` : 'Ready'}</span>;
}

/** A coloured dot for sessions that are running: blue working, amber waiting, green ready. */
export function StatusDot({ s, className }: { s: SessionSummary; className?: string }) {
  const a = activityOf(s);
  if (!a) return null;
  const tone = isWorking(a) ? 'bg-busy' : a.status === 'waiting' ? 'bg-warn' : a.kind === 'external' ? 'bg-fg-3' : 'bg-ok';
  return <span className={cx('inline-block h-2 w-2 shrink-0 rounded-full', tone, isWorking(a) && 'breathe', className)} aria-hidden />;
}

/** Rows of these groups keep the order you drag them into; the others go newest first. */
const orderable = (kind: GroupKind) => kind === 'active' || kind === 'pinned';
const PIN_ZONE = 'zone:pin';
/** A drop ends with a click on the row under the pointer; that click is ignored. */
let lastDragEnd = 0;

/** Rows you dragged keep their places; ones never dragged come first, in their usual order. */
function byManualOrder(list: SessionSummary[], usual: (l: SessionSummary[]) => SessionSummary[]): SessionSummary[] {
  const ranked = list.filter((s) => s.order != null).sort((a, b) => a.order! - b.order! || a.key.localeCompare(b.key));
  return [...usual(list.filter((s) => s.order == null)), ...ranked];
}

function RenameInput({ s, onDone }: { s: SessionSummary; onDone: () => void }) {
  const [v, setV] = useState(s.title);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone();
    const t = v.trim();
    if (!save || !t || t === s.title) return;
    useSessions.getState().upsert([{ ...s, title: t }]);
    post(`/api/sessions/${enc(s.key)}/rename`, { title: t }).catch(toastError);
  };
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <input
      autoFocus
      value={v}
      maxLength={200}
      aria-label="Session title"
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onClick={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      className="h-6 min-w-0 flex-1 rounded-md border border-accent/60 bg-bg-1 px-1.5 text-[13.5px] text-fg outline-none"
    />
  );
}

interface RowProps {
  s: SessionSummary;
  active: boolean;
  home?: string;
  renaming: boolean;
  onRename: (key: string | null) => void;
  onMenu: (s: SessionSummary, el: HTMLElement) => void;
  /** Touch screens: a delete button at the row's end. */
  onDelete?: (s: SessionSummary) => void;
  /** Near the top: always drawn, so the list is ready the moment it shows (the drawer opening). */
  eager?: boolean;
  /** In a space's or a folder's group, which names the folder. */
  place?: boolean;
}

/** Asking before a session is deleted: its transcript goes, for every app that shows it. */
export const deleteDialog = (s: SessionSummary) => ({
  title: 'Delete this session?',
  body: <>The transcript is removed from disk ({agentName(s.agent, s.acpName)} history included), so it disappears from the CLI and VS Code too. This cannot be undone.</>,
  confirm: 'Delete',
  danger: true,
});

/** What a row shows; also the floating copy while it is dragged. */
const RowBody = memo(function RowBody({
  s,
  active,
  home,
  renaming,
  onRename,
  onDelete,
  lifted,
  place,
}: Pick<RowProps, 's' | 'active' | 'home' | 'onDelete' | 'place'> & { renaming?: boolean; onRename?: RowProps['onRename']; lifted?: boolean }) {
  const a = activityOf(s);
  const running = !!a;
  // A turn finished since the session was last looked at.
  const unread = !active && !!s.doneAt && s.doneAt > (s.seenAt ?? 0) && !(a && (isWorking(a) || a.status === 'waiting'));
  return (
    <span
      className={cx(
        'group flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors',
        lifted ? 'bg-bg-2 shadow-lg ring-1 ring-line-2' : active ? 'bg-bg-3' : 'hover:bg-bg-2',
      )}
    >
      <span className="relative mt-[3px] shrink-0">
        <AgentIcon agent={s.agent} name={s.acpName} size={15} />
        <StatusDot s={s} className={cx('absolute -right-0.5 -bottom-0.5 ring-2', active ? 'ring-bg-3' : 'ring-sidebar group-hover:ring-bg-2')} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {renaming && onRename ? (
            <RenameInput s={s} onDone={() => onRename(null)} />
          ) : (
            <span
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRename?.(s.key);
              }}
              className={cx('min-w-0 flex-1 truncate text-[13.5px]', active || unread ? 'font-medium text-fg' : 'text-fg')}
              translate="no"
            >
              {s.title}
            </span>
          )}
          {unread && !renaming && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Finished since you last looked" />}
          {s.pr && !renaming && <PrBadge pr={s.pr} />}
          {s.goal && !renaming && (
            <span title={`Goal: ${s.goal.objective}`} className="shrink-0">
              <Target size={11} className={s.goal.status === 'active' ? 'text-accent' : 'text-warn'} />
            </span>
          )}
          {s.pinned && !renaming && <Pin size={11} className="shrink-0 text-fg-3" />}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-3">
          {unread && a && !isWorking(a) && !inBackground(a) ? (
            <span className="min-w-0 truncate text-ok">Done · {timeAgo(s.doneAt)}</span>
          ) : running ? (
            <ActivityText s={s} className="min-w-0" />
          ) : place ? (
            // Its group names the folder; a worktree's branch says which copy of it.
            s.worktree && (
              <span className="min-w-0 truncate" translate="no">
                {s.worktree.branch}
              </span>
            )
          ) : (
            <span className="min-w-0 truncate" translate="no">
              {folderName(s.cwd, home) || '—'}
            </span>
          )}
          {!running && (place && !s.worktree ? <span className="shrink-0">{timeAgo(s.updatedAt)}</span> : <span className="shrink-0">· {timeAgo(s.updatedAt)}</span>)}
          <span className="flex-1" />
          {!running && <DiffStat added={s.stats.linesAdded} removed={s.stats.linesRemoved} className="text-[11px] opacity-75" compact />}
        </span>
      </span>
      {onDelete && !renaming && (
        <button
          type="button"
          aria-label="Delete session"
          title="Delete session"
          // Its own tap: not the row's (open, or pick up to drag).
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(s);
          }}
          className="-my-1 -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center self-center rounded-lg text-fg-3 transition-colors active:bg-bg-3 active:text-err"
        >
          <Trash2 size={15} />
        </button>
      )}
    </span>
  );
});

interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  attrs: HTMLAttributes<HTMLDivElement>;
  lifted: boolean;
}

function RowShell({ s, active, home, renaming, onRename, onMenu, onDelete, eager, place, drag }: RowProps & { drag: DragBits }) {
  return (
    <div
      ref={drag.ref}
      style={drag.style}
      {...drag.attrs}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (renaming || Date.now() - lastDragEnd < 300) return;
        openSession(s.key);
      }}
      onKeyDown={(e) => {
        if (renaming) return;
        if (e.key === 'Enter') openSession(s.key);
        else if (e.key === 'F2') onRename(s.key);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(s, e.currentTarget);
      }}
      className={cx(
        // Rows further down are drawn only as they come near (a long list scrolls without that work);
        // the first ones always are, or they would appear a moment late when the closed drawer opens.
        // Their stand-in is a row's exact height, so drawing one never changes the list's height (Safari
        // keeps no scroll anchor: rows above that grew as they were drawn moved what was on screen).
        'cursor-default rounded-[10px] outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-accent/50',
        !eager && '[contain-intrinsic-size:auto_56.25px] [content-visibility:auto]',
        drag.lifted && 'opacity-40',
      )}
    >
      <RowBody s={s} active={active} home={home} renaming={renaming} onRename={onRename} onDelete={onDelete} place={place} />
    </div>
  );
}

const SortableRow = memo(function SortableRow(p: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.s.key, disabled: p.renaming });
  return (
    <RowShell
      {...p}
      drag={{ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition }, attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLDivElement>) }, lifted: isDragging }}
    />
  );
});

/** A dated row: it can be dropped on Pinned to pin it, but dated groups keep their order. */
const DraggableRow = memo(function DraggableRow(p: RowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.s.key, disabled: p.renaming });
  return <RowShell {...p} drag={{ ref: setNodeRef, attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLDivElement>) }, lifted: isDragging }} />;
});

function PinZone({ hot }: { hot: boolean }) {
  const { setNodeRef } = useDroppable({ id: PIN_ZONE });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'anim-expand mx-2 mb-3 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed text-[12.5px] transition-colors',
        hot ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line-2 text-fg-3',
      )}
    >
      <Pin size={13} /> Drop here to pin
    </div>
  );
}

function SearchResults({ q }: { q: string }) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const home = useApp((s) => s.boot?.home);
  useEffect(() => {
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      api<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => setHits(r.hits))
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  if (!hits) return <div className="flex justify-center py-8 text-fg-3">{busy && <Throbber />}</div>;
  if (!hits.length) return <div className="px-3 py-8 text-center text-[13px] text-fg-3">No sessions match “{q}”.</div>;
  return (
    <div className="space-y-0.5 px-2 pb-3">
      <div className="px-2.5 pt-1 pb-1.5 text-[12px] text-fg-3">{hits.length} results</div>
      {hits.map((h) => (
        <button key={h.key + h.kind} onClick={() => openSession(h.key)} className="flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-bg-2">
          <AgentIcon agent={h.agent} size={15} className="mt-[3px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px]">{h.title}</span>
            {h.snippet ? (
              <span className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-3">
                {markRuns(h.snippet).map((r, i) =>
                  r.hit ? (
                    <mark key={i} className="rounded bg-accent/20 px-0.5 text-fg">
                      {r.text}
                    </mark>
                  ) : (
                    <span key={i}>{r.text}</span>
                  ),
                )}
              </span>
            ) : (
              <span className="mt-0.5 block truncate text-[12px] text-fg-3">
                {folderName(h.cwd, home)} · {timeAgo(h.updatedAt)}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

/** A turn finished since the session was last looked at. */
const unreadOf = (s: SessionSummary) => !!s.doneAt && s.doneAt > (s.seenAt ?? 0);
/** Space and folder groups showing all their sessions, kept while the list redraws. */
const shownWhole = new Set<string>();

/** A space's or a folder's heading: it folds the group away; its pen starts a new session there. */
function PlaceHead({ g, folded, home, onFold }: { g: SessionGroup; folded: boolean; home?: string; onFold: () => void }) {
  const unread = folded && g.items.some(unreadOf);
  return (
    <div className="group/head sticky top-0 z-[1] flex items-center gap-0.5 bg-sidebar pt-1 pb-0.5">
      <button
        type="button"
        aria-expanded={!folded}
        title={g.space ? `The ${g.space.name} space: its sessions, files and memory, in ${tildify(g.space.folder, home)}` : tildify(g.path, home)}
        onClick={(e) => {
          // On a phone a tap on a button in the list closes the drawer (it opened a session); this one stays.
          e.stopPropagation();
          onFold();
        }}
        className="flex h-7 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg max-md:h-8"
      >
        <span className="flex w-[15px] shrink-0 justify-center">{g.space ? <SpaceMark s={g.space} size={14} /> : <Folder size={14} className="text-fg-3" />}</span>
        <span className="min-w-0 truncate" translate="no">
          {g.label}
        </span>
        {folded && <span className="tnum -ml-1 shrink-0 text-[11.5px] font-normal text-fg-3">{g.items.length}</span>}
        {unread && <span className="-ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Finished since you last looked" />}
        <ChevronRight size={12} className={cx('-ml-1 shrink-0 text-fg-3 transition-transform duration-200', !folded && 'rotate-90')} />
      </button>
      <IconButton
        size="sm"
        label={`New session in ${g.label}`}
        onClick={() => (g.space ? startInSpace(g.space) : newSessionIn(g.path!))}
        // On hover with a mouse; always on touch screens.
        className="opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
      >
        <SquarePen size={13} />
      </IconButton>
    </div>
  );
}

/**
 * Sessions grouped Active, Pinned, then by space and by folder (./groups.ts), the rest by day; a search
 * query shows matching sessions instead. Active and Pinned keep the order you drag them into; a session
 * from the other groups dropped on Pinned is pinned there. A space's or a folder's group shows its newest
 * few until asked for more, and folds away from its heading. Double-click a title (or F2, or right-click →
 * Rename) to rename it.
 */
export function SessionList({ query }: { query: string }) {
  const { byKey, order, loaded } = useSessions();
  const filter = useUI((s) => s.agentFilter);
  const spaceFilter = useUI((s) => s.spaceFilter);
  const home = useApp((s) => s.boot?.home);
  const [, params] = useRoute('/s/:key');
  const activeKey = params?.key ? decodeURIComponent(params.key) : null;
  const coarse = useMediaQuery('(pointer: coarse)');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<SessionSummary | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const menuAnchor = useRef<HTMLElement | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overGroup, setOverGroup] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));

  // Child sessions sit under their parent (folded), when it is listed too.
  const shown = (s: SessionSummary) => (filter === 'all' || s.agent === filter) && (!spaceFilter || s.extra?.space === spaceFilter);
  const nest = useMemo(() => nestChildren(byKey, (s) => !s.archived && shown(s)), [byKey, filter, spaceFilter]);
  // Spaces and the folders you picked have groups of their own; how you fold them is kept for this machine.
  const byFolder = useUI((s) => s.groupByFolder);
  const folds = useUI((s) => s.groupFolds);
  const spaces = useSpaces();
  const defaultCwd = useApp((s) => s.boot?.defaultCwd);
  const autoFolders = useApp((s) => s.boot?.autoFolders);
  const unpicked = useMemo(() => unpickedFolders(home, defaultCwd, autoFolders), [home, defaultCwd, autoFolders]);
  const [, redraw] = useState(0);
  const [groupTime, setGroupTime] = useState(Date.now);

  const groups = useMemo(() => {
    const listed = order.map((k) => byKey[k]).filter((s): s is SessionSummary => !!s && !s.archived && shown(s) && !nest.under.has(s.key));
    // The list showing one space: its sessions go by day.
    const out = groupSessions(listed, { now: new Date(), byFolder: byFolder && !spaceFilter, spaces, unpicked });
    const snz = out.find((g) => g.kind === 'snoozed');
    if (snz) snz.items.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0));
    const act = out.find((g) => g.kind === 'active');
    pruneActive(new Set(act?.items.map((s) => s.key) ?? []));
    if (act) act.items = byManualOrder(act.items, sortActive);
    const pin = out.find((g) => g.kind === 'pinned');
    if (pin) pin.items = byManualOrder(pin.items, (l) => l);
    for (const g of out) g.keys = g.items.map((s) => s.key);
    return out;
  }, [byKey, order, filter, spaceFilter, nest, byFolder, spaces, unpicked, groupTime]);

  // Move sessions out of Active even when no new session events arrive.
  useEffect(() => {
    const active = groups.find((g) => g.kind === 'active');
    if (!active?.items.length) return;
    const expiresAt = Math.min(...active.items.map((s) => lastActivityAt(s) + ACTIVE_MS));
    const timer = setTimeout(() => setGroupTime(Date.now()), Math.max(1, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [groups]);

  const groupOf = useMemo(() => {
    const m = new Map<string, 'active' | 'pinned' | 'dated'>();
    for (const g of groups) for (const s of g.items) m.set(s.key, g.kind === 'active' || g.kind === 'pinned' ? g.kind : 'dated');
    return m;
  }, [groups]);
  const keysOf = (kind: 'active' | 'pinned') => groups.find((g) => g.kind === kind)?.keys ?? [];
  /** Folds a group or opens it; the 200 changed last are kept. */
  const fold = (g: SessionGroup) => {
    const all = useUI.getState().groupFolds;
    const shut = isFolded(g, all, Date.now());
    const { [g.id]: _, ...rest } = all;
    useUI.getState().set({ groupFolds: { ...Object.fromEntries(Object.entries(rest).slice(-199)), [g.id]: !shut } });
  };

  // Active or Pinned: the nearest row of the same group. A dated row: only a Pinned row or the pin zone right under the pointer.
  const collision: CollisionDetection = (args) => {
    const from = groupOf.get(String(args.active.id));
    if (from === 'dated') return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === PIN_ZONE || groupOf.get(String(c.id)) === 'pinned') });
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => groupOf.get(String(c.id)) === from) });
  };

  /** Saves a group's order (top to bottom); `pinKey` is a dated session being pinned into it. */
  const saveOrder = (keys: string[], pinKey?: string) => {
    const st = useSessions.getState();
    st.upsert(keys.flatMap((k, i) => (st.byKey[k] ? [{ ...st.byKey[k], order: i + 1, ...(k === pinKey ? { pinned: true } : {}) }] : [])));
    const pinned = pinKey ? post(`/api/sessions/${enc(pinKey)}/flags`, { pinned: true }) : Promise.resolve();
    pinned.then(() => post('/api/sessions/order', { keys })).catch(toastError);
  };

  const setFlag = (s: SessionSummary, f: { pinned?: boolean; archived?: boolean }) => setFlags(s, f);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    setDragKey(null);
    setOverGroup(null);
    if (!over) return;
    const key = String(active.id);
    const from = groupOf.get(key);
    const to = over.id === PIN_ZONE ? 'pinned' : groupOf.get(String(over.id));
    if (from && from === to && from !== 'dated') {
      const keys = keysOf(from);
      const a = keys.indexOf(key);
      const b = keys.indexOf(String(over.id));
      if (a >= 0 && b >= 0 && a !== b) saveOrder(arrayMove(keys, a, b));
    } else if (from === 'dated' && to === 'pinned') {
      const keys = keysOf('pinned');
      let at = 0;
      if (over.id !== PIN_ZONE) {
        at = Math.max(0, keys.indexOf(String(over.id)));
        const r = active.rect.current.translated;
        if (r && r.top + r.height / 2 > over.rect.top + over.rect.height / 2) at += 1;
      }
      saveOrder([...keys.slice(0, at), key, ...keys.slice(at)], key);
    }
  };

  const onRename = useCallback((key: string | null) => setRenaming(key), []);
  const onMenu = useCallback(
    (s: SessionSummary, el: HTMLElement) => {
      if (coarse) return; // a long press on a phone picks the row up; rename from the session's ⋯ menu there
      menuAnchor.current = el;
      setMenu(s);
    },
    [coarse],
  );

  // The open session, read when a delete goes through: a handler that changed with it redrew every row
  // each time you moved to another session.
  const openKey = useRef(activeKey);
  useEffect(() => {
    openKey.current = activeKey;
  }, [activeKey]);
  const onDelete = useCallback(
    async (s: SessionSummary) => {
      if (!(await confirm(deleteDialog(s)))) return;
      try {
        await del(`/api/sessions/${enc(s.key)}`);
        if (s.key === openKey.current) go('/');
      } catch (e) {
        toastError(e);
      }
    },
    [confirm],
  );

  if (query.trim()) return <SearchResults q={query.trim()} />;
  if (!loaded) {
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  }
  if (!groups.length) return <div className="px-4 py-10 text-center text-[13px] text-fg-3">No sessions yet.</div>;

  const dragging = dragKey ? byKey[dragKey] : null;
  const datedDrag = !!dragKey && groupOf.get(dragKey) === 'dated';
  // No Pinned group yet: dragging a dated session shows where to drop it to pin it.
  const zoneAt = datedDrag && !groups.some((g) => g.kind === 'pinned') ? (groups[0]?.kind === 'active' ? 1 : 0) : -1;
  // What each group shows: a space's or a folder's newest few (all once asked, none while folded), and the session open.
  const now = Date.now();
  const shut = new Set(groups.filter((g) => (g.kind === 'space' || g.kind === 'folder') && isFolded(g, folds, now)).map((g) => g.id));
  const shownRows = groups.map((g) => {
    if (g.kind !== 'space' && g.kind !== 'folder') return g.items;
    const rows = shut.has(g.id) ? [] : shownWhole.has(g.id) ? g.items : g.items.slice(0, GROUP_ROWS);
    const open = activeKey ? g.items.find((s) => s.key === activeKey) : undefined;
    return open && !rows.includes(open) ? [...rows, open] : rows;
  });
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => {
        setDragKey(String(active.id));
        setMenu(null);
      }}
      onDragOver={({ over }) => setOverGroup(!over ? null : over.id === PIN_ZONE ? 'pinned' : (groupOf.get(String(over.id)) ?? null))}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragKey(null);
        setOverGroup(null);
      }}
      accessibility={{ screenReaderInstructions: { draggable: 'Drag to move this session. Active and Pinned keep the order you set; drop a session on Pinned to pin it.' } }}
    >
      {/* Touches that land on the list may pick a row up (lib/dragTouch). */}
      <div ref={touchDragArea}>
        {groups.map((g, i) => {
          const sortable = orderable(g.kind);
          const place = g.kind === 'space' || g.kind === 'folder';
          const visible = shownRows[i];
          const before = shownRows.slice(0, i).reduce((n, x) => n + x.length, 0);
          const rows = visible.map((s, k) => {
            const p: RowProps = { s, active: s.key === activeKey, home, renaming: renaming === s.key, onRename, onMenu, onDelete: coarse ? onDelete : undefined, eager: before + k < 30, place };
            const row = sortable ? <SortableRow key={s.key} {...p} /> : <DraggableRow key={s.key} {...p} />;
            const kids = nest.byParent.get(s.key);
            if (!kids) return row;
            return (
              <Fragment key={s.key}>
                {row}
                <ChildNest parent={s.key} kids={kids} activeKey={activeKey} row={(c, active) => <RowBody s={c} active={active} home={home} />} />
              </Fragment>
            );
          });
          const shutNow = place && shut.has(g.id);
          // Rows left out, or all of them shown since asked: a line to show them, or fewer again.
          const more = g.items.length - visible.length;
          const whole = shownWhole.has(g.id);
          return (
            <Fragment key={g.id}>
              {i === zoneAt && <PinZone hot={overGroup === 'pinned'} />}
              <div className={cx('px-2 transition-colors', shutNow && !visible.length ? 'pb-1' : 'pb-3', datedDrag && g.kind === 'pinned' && overGroup === 'pinned' && 'rounded-xl bg-accent/[0.06]')}>
                {place ? (
                  <PlaceHead g={g} folded={shutNow} home={home} onFold={() => fold(g)} />
                ) : (
                  <div className="sticky top-0 z-[1] bg-sidebar px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-fg-3">{g.label}</div>
                )}
                {sortable ? (
                  <SortableContext items={g.keys} strategy={verticalListSortingStrategy}>
                    {rows}
                  </SortableContext>
                ) : (
                  rows
                )}
                {place && !shutNow && (whole ? g.items.length > GROUP_ROWS : more > 0) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!shownWhole.delete(g.id)) shownWhole.add(g.id);
                      redraw((n) => n + 1);
                    }}
                    className="flex h-7 w-full items-center rounded-lg pl-[35px] text-left text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2 max-md:h-8"
                  >
                    {whole ? 'Show fewer' : `Show ${more} more`}
                  </button>
                )}
              </div>
            </Fragment>
          );
        })}
        {zoneAt === groups.length && <PinZone hot={overGroup === 'pinned'} />}
      </div>
      {confirmNode}
      {createPortal(<DragOverlay dropAnimation={null}>{dragging ? <RowBody s={dragging} active={false} home={home} lifted /> : null}</DragOverlay>, document.body)}
      <Popover anchor={menuAnchor} open={!!menu} onClose={() => (setMenu(null), setSnoozing(false))} width={snoozing ? 240 : 190}>
        {menu && snoozing && <SnoozeItems s={menu} onDone={() => (setMenu(null), setSnoozing(false))} />}
        {menu && !snoozing && (
          <>
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => {
                setRenaming(menu.key);
                setMenu(null);
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              icon={menu.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              onClick={() => {
                setFlag(menu, { pinned: !menu.pinned });
                setMenu(null);
              }}
            >
              {menu.pinned ? 'Unpin' : 'Pin'}
            </MenuItem>
            {menu.snoozedUntil ? (
              <SnoozeItems s={menu} onDone={() => setMenu(null)} />
            ) : (
              <MenuItem icon={<AlarmClock size={14} />} onClick={() => setSnoozing(true)}>
                Snooze
              </MenuItem>
            )}
            {!isBusy(activityOf(menu)) && (
              <MenuItem
                icon={<CheckCheck size={14} />}
                onClick={() => {
                  settle(menu);
                  setMenu(null);
                }}
              >
                Settle
              </MenuItem>
            )}
            <MenuItem
              icon={<Archive size={14} />}
              onClick={() => {
                setFlag(menu, { archived: true });
                setMenu(null);
              }}
            >
              Archive
            </MenuItem>
          </>
        )}
      </Popover>
    </DndContext>
  );
}

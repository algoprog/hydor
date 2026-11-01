import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useRoute } from 'wouter';
import { AlarmClock, Archive, CheckCheck, Pencil, Pin, PinOff, Target, Trash2 } from 'lucide-react';
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
import { basename, dayGroup, markRuns, timeAgo } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { activityOf, inBackground, isBusy, isWorking } from '../../lib/activity';
import { toastError, useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { DiffStat } from '../../components/DiffView';
import { cx, Throbber, MenuItem, Popover, useConfirm, useMediaQuery } from '../../components/ui';
import { Elapsed } from '../session/items';
import { setFlags, settle } from '../../lib/flags';
import { SnoozeItems } from './SnoozeMenu';
import { PrBadge } from '../session/PullRequest';
import { ChildNest, nestChildren } from '../children/Nest';
import { AreaTouchSensor, touchDragArea } from '../../lib/dragTouch';

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

/** Rows of these groups keep the order you drag them into; the others go by date. */
const orderable = (label: string) => label === 'Active' || label === 'Pinned';
const PIN_ZONE = 'zone:pin';
/** A drop ends with a click on the row under the pointer; that click is ignored. */
let lastDragEnd = 0;
// Made once: new settings on each render gave every row new drag handlers, so each update of the list
// (four a second while an agent works) redrew all of its rows.
const MOUSE = { activationConstraint: { distance: 6 } };
// Touch: hold a moment to pick a row up, so a swipe still scrolls the list.
const TOUCH = { activationConstraint: { delay: 250, tolerance: 8 } };

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
}: Pick<RowProps, 's' | 'active' | 'home' | 'onDelete'> & { renaming?: boolean; onRename?: RowProps['onRename']; lifted?: boolean }) {
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
          ) : (
            <span className="min-w-0 truncate">{folderName(s.cwd, home) || '—'}</span>
          )}
          {!running && <span className="shrink-0">· {timeAgo(s.updatedAt)}</span>}
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

function RowShell({ s, active, home, renaming, onRename, onMenu, onDelete, eager, drag }: RowProps & { drag: DragBits }) {
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
      <RowBody s={s} active={active} home={home} renaming={renaming} onRename={onRename} onDelete={onDelete} />
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

/**
 * Sessions grouped Active, Pinned, then by day; a search query shows matching sessions instead.
 * Active and Pinned keep the order you drag them into; a dated session dropped on Pinned is pinned
 * there. Double-click a title (or F2, or right-click → Rename) to rename it.
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
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(AreaTouchSensor, TOUCH));

  // Child sessions sit under their parent (folded), when it is listed too.
  const shown = (s: SessionSummary) => (filter === 'all' || s.agent === filter) && (!spaceFilter || s.extra?.space === spaceFilter);
  const nest = useMemo(() => nestChildren(byKey, (s) => !s.archived && shown(s)), [byKey, filter, spaceFilter]);

  const groups = useMemo(() => {
    const out: { label: string; items: SessionSummary[]; keys: string[] }[] = [];
    const now = new Date();
    for (const key of order) {
      const s = byKey[key];
      if (!s || s.archived) continue;
      if (!shown(s)) continue;
      if (nest.under.has(key)) continue;
      // Snoozed ones wait at the bottom until their time (or until they need you).
      const label = s.snoozedUntil && s.snoozedUntil > now.getTime() ? 'Snoozed' : activityOf(s) ? 'Active' : s.pinned ? 'Pinned' : dayGroup(s.updatedAt, now);
      let g = out.find((x) => x.label === label);
      if (!g) out.push((g = { label, items: [], keys: [] }));
      g.items.push(s);
    }
    const rank = (l: string) => (l === 'Active' ? 0 : l === 'Pinned' ? 1 : l === 'Snoozed' ? 3 : 2);
    const snz = out.find((g) => g.label === 'Snoozed');
    if (snz) snz.items.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0));
    const act = out.find((g) => g.label === 'Active');
    pruneActive(new Set(act?.items.map((s) => s.key) ?? []));
    if (act) act.items = byManualOrder(act.items, sortActive);
    const pin = out.find((g) => g.label === 'Pinned');
    if (pin) pin.items = byManualOrder(pin.items, (l) => l);
    for (const g of out) g.keys = g.items.map((s) => s.key);
    return out.sort((a, b) => rank(a.label) - rank(b.label));
  }, [byKey, order, filter, spaceFilter, nest]);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const s of g.items) m.set(s.key, orderable(g.label) ? g.label : 'dated');
    return m;
  }, [groups]);
  const keysOf = (label: string) => groups.find((g) => g.label === label)?.keys ?? [];

  // Active or Pinned: the nearest row of the same group. A dated row: only a Pinned row or the pin zone right under the pointer.
  const collision: CollisionDetection = (args) => {
    const from = groupOf.get(String(args.active.id));
    if (from === 'dated') return pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id === PIN_ZONE || groupOf.get(String(c.id)) === 'Pinned') });
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
    const to = over.id === PIN_ZONE ? 'Pinned' : groupOf.get(String(over.id));
    if (from && from === to && orderable(from)) {
      const keys = keysOf(from);
      const a = keys.indexOf(key);
      const b = keys.indexOf(String(over.id));
      if (a >= 0 && b >= 0 && a !== b) saveOrder(arrayMove(keys, a, b));
    } else if (from === 'dated' && to === 'Pinned') {
      const keys = keysOf('Pinned');
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
  const zoneAt = datedDrag && !groups.some((g) => g.label === 'Pinned') ? (groups[0]?.label === 'Active' ? 1 : 0) : -1;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => {
        setDragKey(String(active.id));
        setMenu(null);
      }}
      onDragOver={({ over }) => setOverGroup(!over ? null : over.id === PIN_ZONE ? 'Pinned' : (groupOf.get(String(over.id)) ?? null))}
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
          const sortable = orderable(g.label);
          const before = groups.slice(0, i).reduce((n, x) => n + x.items.length, 0);
          const rows = g.items.map((s, k) => {
            const p: RowProps = { s, active: s.key === activeKey, home, renaming: renaming === s.key, onRename, onMenu, onDelete: coarse ? onDelete : undefined, eager: before + k < 30 };
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
          return (
            <Fragment key={g.label}>
              {i === zoneAt && <PinZone hot={overGroup === 'Pinned'} />}
              <div className={cx('px-2 pb-3 transition-colors', datedDrag && g.label === 'Pinned' && overGroup === 'Pinned' && 'rounded-xl bg-accent/[0.06]')}>
                <div className="sticky top-0 z-[1] bg-sidebar px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-fg-3">{g.label}</div>
                {sortable ? (
                  <SortableContext items={g.keys} strategy={verticalListSortingStrategy}>
                    {rows}
                  </SortableContext>
                ) : (
                  rows
                )}
              </div>
            </Fragment>
          );
        })}
        {zoneAt === groups.length && <PinZone hot={overGroup === 'Pinned'} />}
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

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRoute } from 'wouter';
import { AlarmClock, Archive, CheckCheck, ChevronRight, Ellipsis, Folder, Pencil, Pin, PinOff, SquarePen, Target, Trash2 } from 'lucide-react';
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
  type Modifier,
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
import { cx, IconButton, Throbber, MenuItem, MenuSep, Popover, useConfirm, useMediaQuery } from '../../components/ui';
import { Elapsed } from '../session/items';
import { newSessionIn } from '../files/actions';
import { SpaceMark, startInSpace } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { ACTIVE_MS, GROUP_ROWS, groupSessions, hasBackgroundWork, isFolded, isChatgptProjectFolder, isPlaceKind, lastActivityAt, unpickedFolders, type GroupKind, type SessionGroup } from './groups';
import { setFlags, settle } from '../../lib/flags';
import { SnoozeItems } from './SnoozeMenu';
import { PrBadge } from '../session/PullRequest';
import { ChildNest, nestChildren } from '../children/Nest';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../lib/dragTouch';
import { setPlaceOrder, useToolOrder } from '../layout/toolOrder';

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

/** What the home folder is called where a session's folder is named (translated, unlike folders' own names). */
export const HOME_FOLDER = 'Home folder';

/** What a folder the Codex app made for a ChatGPT project is called when Codex does not say the project's name. */
export const CHATGPT_PROJECT = 'ChatGPT project';

/** The folder a session works in, as a short name ("Home folder" for the home folder). */
export function folderName(cwd: string | undefined, home?: string): string {
  if (!cwd) return '';
  const dir = cwd.replace(/\/+$/, '');
  if (home && dir === home.replace(/\/+$/, '')) return HOME_FOLDER;
  // A Codex project's folder goes by the project's name; a ChatGPT project's folder the Codex app made is named only by an id.
  const named = useApp.getState().boot?.folderNames?.[dir];
  if (named) return named;
  if (isChatgptProjectFolder(dir)) return CHATGPT_PROJECT;
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
/** A space's or a folder's group: under Projects, with a heading that folds it, and dragged by that heading. */
const isPlace = (g: SessionGroup) => isPlaceKind(g.kind);
const PIN_ZONE = 'zone:pin';
/** A space's or a folder's group being dragged: its id after this. */
const PLACE = 'place:';
/** Where the group picked up was as the pointer took it, before the groups folded to their headings. */
let pickedAt: { left: number; top: number } | null = null;
/** The copy that follows the pointer stays under it, though the list closes up as a group is picked up (the groups
 * fold to their headings, which moves it): it is placed by where the group is now, and moved by the pointer since. */
const stayUnderPointer: Modifier = ({ transform, active, activeNodeRect }) =>
  pickedAt && activeNodeRect && String(active?.id).startsWith(PLACE)
    ? { ...transform, x: transform.x + pickedAt.left - activeNodeRect.left, y: transform.y + pickedAt.top - activeNodeRect.top }
    : transform;
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
  /** A right-click on the row (on a computer). */
  onMenu: (s: SessionSummary, el: HTMLElement) => void;
  /** The row's ⋯: its menu, by the button. */
  onMore: (s: SessionSummary, el: HTMLElement) => void;
  /** Its menu is open. */
  menuOpen: boolean;
  /** A touch screen: the ⋯ always shows at the row's end (on a computer, only while the pointer is on the row). */
  touch: boolean;
  /** Near the top: always drawn, so the list is ready the moment it shows (the drawer opening). */
  eager?: boolean;
  /** In a space's or a folder's group, which names the folder. */
  place?: boolean;
  /** In the Pinned group, which says so: no pin mark. */
  inPinned?: boolean;
}

/** Asking before a session is deleted: its transcript goes, for every app that shows it. */
export const deleteDialog = (s: SessionSummary) => ({
  title: 'Delete this session?',
  body: <>The transcript is removed from disk ({agentName(s.agent, s.acpName)} history included), so it disappears from the CLI and VS Code too. This cannot be undone.</>,
  confirm: 'Delete',
  danger: true,
});

/** The end of a row's text fades out under its ⋯ (on a computer, while it shows). */
const FADE = '[mask-image:linear-gradient(to_left,transparent_26px,black_54px)]';
const HOVER_FADE = 'group-hover:[mask-image:linear-gradient(to_left,transparent_26px,black_54px)] group-focus-within:[mask-image:linear-gradient(to_left,transparent_26px,black_54px)]';

/**
 * What a row shows; also the floating copy while it is dragged. Two lines: the title, then what the agent is doing,
 * or the folder and when it was last active. In a space's or a folder's group, which names the folder, one line:
 * the title, then the time, or what the agent is doing.
 */
const RowBody = memo(function RowBody({
  s,
  active,
  home,
  renaming,
  onRename,
  onMore,
  menuOpen,
  touch,
  lifted,
  place,
  inPinned,
}: Pick<RowProps, 's' | 'active' | 'home' | 'place' | 'inPinned'> & {
  renaming?: boolean;
  onRename?: RowProps['onRename'];
  onMore?: RowProps['onMore'];
  menuOpen?: boolean;
  touch?: boolean;
  lifted?: boolean;
}) {
  const a = activityOf(s);
  const running = !!a;
  // A turn finished since the session was last looked at.
  const unread = !active && !!s.doneAt && s.doneAt > (s.seenAt ?? 0) && !(a && (isWorking(a) || a.status === 'waiting'));
  const where = folderName(s.cwd, home);
  // On a computer the ⋯ shows over the row's end while the pointer is on the row, or while its menu is open.
  const overlay = !!onMore && !touch && !renaming;
  const fade = overlay && (menuOpen ? FADE : HOVER_FADE);
  const title =
    renaming && onRename ? (
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
    );
  const marks = !renaming && (
    <>
      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Finished since you last looked" />}
      {s.pr && <PrBadge pr={s.pr} />}
      {s.goal && (
        <span title={`Goal: ${s.goal.objective}`} className="shrink-0">
          <Target size={11} className={s.goal.status === 'active' ? 'text-accent' : 'text-warn'} />
        </span>
      )}
      {/* In the Pinned group, which says so already, it needs no mark. */}
      {s.pinned && !inPinned && <Pin size={11} className="shrink-0 text-fg-3" />}
    </>
  );
  const more = onMore && !renaming && (
    <button
      type="button"
      aria-label="Session menu"
      title="Session menu"
      aria-haspopup="menu"
      aria-expanded={!!menuOpen}
      // Its own press: not the row's (open it, or pick it up to drag).
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onMore(s, e.currentTarget);
      }}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors',
        touch
          ? cx('-my-1 -mr-1.5 h-9 w-9 self-center active:bg-bg-3 active:text-fg', menuOpen && 'bg-bg-3 text-fg')
          : cx('absolute top-1/2 right-1.5 h-7 w-7 -translate-y-1/2 hover:bg-fg/10 hover:text-fg focus-visible:opacity-100', menuOpen ? 'text-fg opacity-100' : 'opacity-0 group-hover:opacity-100'),
      )}
    >
      <Ellipsis size={touch ? 17 : 15} />
    </button>
  );
  const icon = (
    <span className={cx('relative shrink-0', !place && 'mt-[3px]')}>
      <AgentIcon agent={s.agent} name={s.acpName} size={15} />
      <StatusDot s={s} className={cx('absolute -right-0.5 -bottom-0.5 ring-2', active ? 'ring-bg-3' : menuOpen ? 'ring-bg-2' : 'ring-sidebar group-hover:ring-bg-2')} />
    </span>
  );
  const row = cx(
    'group relative flex w-full gap-2.5 rounded-[10px] px-2.5 text-left transition-colors',
    lifted ? 'bg-bg-2 shadow-lg ring-1 ring-line-2' : active ? 'bg-bg-3' : menuOpen ? 'bg-bg-2' : 'hover:bg-bg-2',
  );

  if (place) {
    // A turn running or waiting says so; ready, or stopped, the time (its dot says it is ready).
    const doing = a && (isBusy(a) || inBackground(a) || a.status === 'waiting' || a.status === 'stopping');
    return (
      <span className={cx(row, 'items-center py-2')}>
        {icon}
        <span className={cx('flex min-w-0 flex-1 items-center gap-1.5', fade)}>
          {title}
          {marks}
          {!renaming &&
            (doing ? (
              <ActivityText s={s} className="ml-1 max-w-[55%] shrink-0 text-[12px]" />
            ) : (
              <span className="ml-1 flex shrink-0 items-center gap-1 text-[12px] text-fg-3">
                {/* A worktree's branch says which copy of the folder. */}
                {s.worktree && (
                  <>
                    <span className="max-w-[90px] truncate" translate="no">
                      {s.worktree.branch}
                    </span>
                    <span aria-hidden>·</span>
                  </>
                )}
                <span>{timeAgo(s.updatedAt)}</span>
              </span>
            ))}
        </span>
        {more}
      </span>
    );
  }

  return (
    <span className={cx(row, 'items-start py-[7px]')}>
      {icon}
      <span className={cx('min-w-0 flex-1', fade)}>
        <span className="flex items-center gap-1.5">
          {title}
          {marks}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-fg-3">
          {unread && a && !isWorking(a) && !inBackground(a) ? (
            <span className="min-w-0 truncate text-ok">Done · {timeAgo(s.doneAt)}</span>
          ) : running ? (
            <ActivityText s={s} className="min-w-0" />
          ) : (
            <>
              <span className="min-w-0 truncate" translate={where === HOME_FOLDER || where === CHATGPT_PROJECT ? undefined : 'no'}>
                {where || '—'}
              </span>
              <span className="shrink-0" aria-hidden>
                ·
              </span>
              <span className="shrink-0">{timeAgo(s.updatedAt)}</span>
            </>
          )}
          <span className="flex-1" />
          {!running && <DiffStat added={s.stats.linesAdded} removed={s.stats.linesRemoved} className="text-[11px] opacity-70" compact />}
        </span>
      </span>
      {more}
    </span>
  );
});

interface DragBits {
  ref: (el: HTMLElement | null) => void;
  style?: CSSProperties;
  attrs: HTMLAttributes<HTMLDivElement>;
  lifted: boolean;
}

function RowShell({ s, active, home, renaming, onRename, onMenu, onMore, menuOpen, touch, eager, place, inPinned, drag }: RowProps & { drag: DragBits }) {
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
        !eager && (place ? '[contain-intrinsic-size:auto_36.25px] [content-visibility:auto]' : '[contain-intrinsic-size:auto_52.25px] [content-visibility:auto]'),
        drag.lifted && 'opacity-40',
      )}
    >
      <RowBody s={s} active={active} home={home} renaming={renaming} onRename={onRename} onMore={onMore} menuOpen={menuOpen} touch={touch} place={place} inPinned={inPinned} />
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

/** What picks a space's or a folder's group up: its heading. */
interface PlaceHandle {
  ref: (el: HTMLElement | null) => void;
  attrs: HTMLAttributes<HTMLButtonElement>;
}

/** A space's or a folder's heading: it folds the group away, and drags it to another place among them; its pen starts a new session there. */
function PlaceHead({ g, folded, home, onFold, handle, lifted }: { g: SessionGroup; folded: boolean; home?: string; onFold?: () => void; handle?: PlaceHandle; lifted?: boolean }) {
  const unread = folded && g.items.some(unreadOf);
  return (
    <div data-tip="groups" className={cx('group/head flex items-center gap-0.5 py-0.5', lifted ? 'rounded-lg bg-bg-2 shadow-lg ring-1 ring-line-2' : 'sticky top-0 z-[1] bg-sidebar')}>
      <button
        type="button"
        ref={handle?.ref}
        {...handle?.attrs}
        aria-expanded={!folded}
        title={g.space ? `The ${g.space.name} project: its sessions, files and memory, in ${tildify(g.space.folder, home)}` : tildify(g.path, home)}
        onClick={(e) => {
          // On a phone a tap on a button in the list closes the drawer (it opened a session); this one stays.
          e.stopPropagation();
          // A drop ends with a click on the heading under the pointer.
          if (Date.now() - lastDragEnd < 300) return;
          onFold?.();
        }}
        className="flex h-7 min-w-0 flex-1 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium text-fg-2 transition-colors select-none [-webkit-touch-callout:none] hover:bg-bg-2 hover:text-fg max-md:h-8"
      >
        <span className="flex w-[15px] shrink-0 justify-center">{g.space ? <SpaceMark s={g.space} size={14} /> : <Folder size={14} className="text-fg-3" />}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate" translate="no">
            {g.label}
          </span>
          {folded && <span className="tnum shrink-0 text-[11.5px] font-normal text-fg-3">{g.items.length}</span>}
          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" title="Finished since you last looked" />}
          <ChevronRight size={12} className={cx('shrink-0 text-fg-3 transition-transform duration-200', !folded && 'rotate-90')} />
        </span>
      </button>
      {!lifted && (
        <IconButton
          size="sm"
          label={`New session in ${g.label}`}
          onClick={() => (g.space ? startInSpace(g.space) : newSessionIn(g.path!))}
          // On hover with a mouse; always on touch screens.
          className="opacity-0 group-hover/head:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100"
        >
          <SquarePen size={13} />
        </IconButton>
      )}
    </div>
  );
}

/** A space's or a folder's group, which its heading drags to another place among the others. */
function SortablePlace({ id, className, children }: { id: string; className?: string; children: (handle: PlaceHandle) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: PLACE + id });
  return (
    <div ref={setNodeRef} data-place={id} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx(className, isDragging && 'opacity-40')}>
      {children({ ref: setActivatorNodeRef, attrs: { ...attributes, ...(listeners as HTMLAttributes<HTMLButtonElement>) } })}
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
  /** Opened by a row's ⋯ (it lines up with the button's end), or by a right-click on the row (under its start). */
  const [menuByButton, setMenuByButton] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  // A space's or a folder's group being dragged (its id): meanwhile they all show as their headings alone.
  const [dragPlace, setDragPlace] = useState<string | null>(null);
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
  const folderNames = useApp((s) => s.boot?.folderNames);
  const [, redraw] = useState(0);
  const [groupTime, setGroupTime] = useState(Date.now);
  // The order you dragged the spaces' and folders' groups into, the same on every device.
  const places = useToolOrder((s) => s.places);

  const groups = useMemo(() => {
    const listed = order.map((k) => byKey[k]).filter((s): s is SessionSummary => !!s && !s.archived && shown(s) && !nest.under.has(s.key));
    // The list showing one space: its sessions go by day.
    const out = groupSessions(listed, { now: new Date(), byFolder: byFolder && !spaceFilter, spaces, unpicked, places, names: folderNames });
    const snz = out.find((g) => g.kind === 'snoozed');
    if (snz) snz.items.sort((a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0));
    const act = out.find((g) => g.kind === 'active');
    pruneActive(new Set(act?.items.map((s) => s.key) ?? []));
    if (act) act.items = byManualOrder(act.items, sortActive);
    const pin = out.find((g) => g.kind === 'pinned');
    if (pin) pin.items = byManualOrder(pin.items, (l) => l);
    for (const g of out) g.keys = g.items.map((s) => s.key);
    return out;
  }, [byKey, order, filter, spaceFilter, nest, byFolder, spaces, unpicked, places, groupTime, folderNames]);

  // Move sessions out of Active even when no new session events arrive.
  useEffect(() => {
    const active = groups.find((g) => g.kind === 'active');
    // Scheduled resumes stay Active until the server clears them, even if their reset time passes; sessions with
    // background tasks stay while those run (their end changes the session, which groups the list again).
    const expiring = active?.items.filter((s) => s.resumeAt == null && !hasBackgroundWork(s)) ?? [];
    if (!expiring.length) return;
    const expiresAt = Math.min(...expiring.map((s) => lastActivityAt(s) + ACTIVE_MS));
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

  // A space's or a folder's group: the nearest of those groups. Active or Pinned: the nearest row of the same group.
  // A dated row: only a Pinned row or the pin zone right under the pointer.
  const collision: CollisionDetection = (args) => {
    if (String(args.active.id).startsWith(PLACE)) return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(PLACE)) });
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

  /** A space's or a folder's group dropped among the others: the groups shown in their new order, then any the list leaves out now. */
  const dropPlace = (from: string, to: string) => {
    const ids = groups.filter(isPlace).map((g) => g.id);
    const a = ids.indexOf(from);
    const b = ids.indexOf(to);
    if (a < 0 || b < 0 || a === b) return;
    const moved = arrayMove(ids, a, b);
    setPlaceOrder([...moved, ...places.filter((id) => !moved.includes(id))]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDragEnd = Date.now();
    setDragKey(null);
    setDragPlace(null);
    setOverGroup(null);
    if (!over) return;
    if (String(active.id).startsWith(PLACE)) {
      if (String(over.id).startsWith(PLACE)) dropPlace(String(active.id).slice(PLACE.length), String(over.id).slice(PLACE.length));
      return;
    }
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
      if (coarse) return; // a long press on a phone picks the row up; its ⋯ has the menu there
      menuAnchor.current = el;
      setMenuByButton(false);
      setSnoozing(false);
      setMenu(s);
    },
    [coarse],
  );
  // The ⋯ again, with its menu open, closes it.
  const onMore = useCallback((s: SessionSummary, el: HTMLElement) => {
    menuAnchor.current = el;
    setMenuByButton(true);
    setSnoozing(false);
    setMenu((m) => (m?.key === s.key ? null : s));
  }, []);

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
  const draggingPlace = dragPlace ? groups.find((g) => g.id === dragPlace) : undefined;
  const datedDrag = !!dragKey && groupOf.get(dragKey) === 'dated';
  // No Pinned group yet: dragging a dated session shows where to drop it to pin it.
  const zoneAt = datedDrag && !groups.some((g) => g.kind === 'pinned') ? (groups[0]?.kind === 'active' ? 1 : 0) : -1;
  // What each group shows: a space's or a folder's newest few (all once asked, none while folded), and the session open.
  // While one of those groups is dragged, they all show as their headings alone.
  const now = Date.now();
  const shut = new Set(groups.filter((g) => isPlace(g) && (!!dragPlace || isFolded(g, folds, now))).map((g) => g.id));
  const shownRows = groups.map((g) => {
    if (!isPlace(g)) return g.items;
    if (dragPlace) return [];
    const rows = shut.has(g.id) ? [] : shownWhole.has(g.id) ? g.items : g.items.slice(0, GROUP_ROWS);
    const open = activeKey ? g.items.find((s) => s.key === activeKey) : undefined;
    return open && !rows.includes(open) ? [...rows, open] : rows;
  });
  // Each group's frame and contents; the spaces' and folders' groups (one run of them, under Projects) drag among
  // themselves by their headings.
  const items = groups.map((g, i) => {
    const sortable = orderable(g.kind);
    const place = isPlace(g);
    const visible = shownRows[i];
    const before = shownRows.slice(0, i).reduce((n, x) => n + x.length, 0);
    const rows = visible.map((s, k) => {
      const p: RowProps = {
        s,
        active: s.key === activeKey,
        home,
        renaming: renaming === s.key,
        onRename,
        onMenu,
        onMore,
        menuOpen: menu?.key === s.key,
        touch: coarse,
        eager: before + k < 30,
        place,
        inPinned: g.kind === 'pinned',
      };
      const row = sortable ? <SortableRow key={s.key} {...p} /> : <DraggableRow key={s.key} {...p} />;
      const kids = nest.byParent.get(s.key);
      if (!kids) return row;
      return (
        <Fragment key={s.key}>
          {row}
          <ChildNest
            parent={s.key}
            kids={kids}
            activeKey={activeKey}
            row={(c, active) => <RowBody s={c} active={active} home={home} onMore={onMore} menuOpen={menu?.key === c.key} touch={coarse} place={place} />}
          />
        </Fragment>
      );
    });
    const shutNow = place && shut.has(g.id);
    // Rows left out, or all of them shown since asked: a line to show them, or fewer again.
    const more = g.items.length - visible.length;
    const whole = shownWhole.has(g.id);
    // Folded spaces and folders close up into a list of them.
    const prev = groups[i - 1];
    const afterPlace = !!prev && isPlace(prev);
    const frame = cx(
      'px-2 transition-colors',
      i > 0 && (!place ? 'mt-2' : afterPlace && !shut.has(prev.id) && 'mt-1.5'),
      !shutNow && 'pb-1',
      datedDrag && g.kind === 'pinned' && overGroup === 'pinned' && 'rounded-xl bg-accent/[0.06]',
    );
    const body = (handle?: PlaceHandle) => (
      <>
        {place ? (
          <PlaceHead g={g} folded={shutNow} home={home} onFold={() => fold(g)} handle={handle} />
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
      </>
    );
    return { g, i, frame, body };
  });
  type Item = (typeof items)[number];
  const listed: ({ kind: 'one'; item: Item } | { kind: 'places'; first: number; items: Item[] })[] = [];
  for (const it of items) {
    const last = listed[listed.length - 1];
    if (!isPlace(it.g)) listed.push({ kind: 'one', item: it });
    else if (last?.kind === 'places') last.items.push(it);
    else listed.push({ kind: 'places', first: it.i, items: [it] });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => {
        const id = String(active.id);
        if (id.startsWith(PLACE)) {
          const el = [...document.querySelectorAll<HTMLElement>('[data-place]')].find((x) => x.dataset.place === id.slice(PLACE.length));
          const r = el?.getBoundingClientRect();
          pickedAt = r ? { left: r.left, top: r.top } : null;
          setDragPlace(id.slice(PLACE.length));
        } else setDragKey(id);
        setMenu(null);
      }}
      onDragOver={({ over }) => setOverGroup(!over ? null : over.id === PIN_ZONE ? 'pinned' : (groupOf.get(String(over.id)) ?? null))}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragKey(null);
        setDragPlace(null);
        setOverGroup(null);
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable: 'Drag to move this session. Active and Pinned keep the order you set; drop a session on Pinned to pin it. Drag a project or folder by its name to move its group.',
        },
      }}
    >
      {/* Touches that land on the list may pick a row (or a group's heading) up (lib/dragTouch). */}
      <div ref={touchDragArea}>
        {listed.map((part) =>
          part.kind === 'places' ? (
            <Fragment key={`places:${part.first}`}>
              <div className={cx('px-[18px] pt-1.5 pb-1 text-[12px] font-medium text-fg-3', part.first > 0 && 'mt-2')}>Projects</div>
              <SortableContext items={part.items.map((x) => PLACE + x.g.id)} strategy={verticalListSortingStrategy}>
                {part.items.map((x) => (
                  <SortablePlace key={x.g.id} id={x.g.id} className={x.frame}>
                    {(handle) => x.body(handle)}
                  </SortablePlace>
                ))}
              </SortableContext>
            </Fragment>
          ) : (
            <Fragment key={part.item.g.id}>
              {part.item.i === zoneAt && <PinZone hot={overGroup === 'pinned'} />}
              <div className={part.item.frame}>{part.item.body()}</div>
            </Fragment>
          ),
        )}
        {zoneAt === groups.length && <PinZone hot={overGroup === 'pinned'} />}
      </div>
      {confirmNode}
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[stayUnderPointer]}>
          {dragging ? <RowBody s={dragging} active={false} home={home} lifted /> : draggingPlace ? <PlaceHead g={draggingPlace} folded home={home} lifted /> : null}
        </DragOverlay>,
        document.body,
      )}
      <Popover anchor={menuAnchor} open={!!menu} onClose={() => (setMenu(null), setSnoozing(false))} width={snoozing ? 240 : 190} align={menuByButton ? 'end' : 'start'}>
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
            <MenuSep />
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                setMenu(null);
                void onDelete(menu);
              }}
            >
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
    </DndContext>
  );
}

// The subagents one turn started, as ONE compact card in the conversation, whoever runs them: Hydor subagents (child
// sessions, ChildGroup) or the session's own program's (Claude Code, Codex; ProgramCards). One subagent is a single line.
// Several have a header (what they are, what they share, how many are at work, wait for you, finished or failed) that folds
// and unfolds a list of rows: open while any is at work or waits for you, folded once all have ended, unless you chose.
// A row is a state dot, a title, how it stands and a way in, with Stop on it while it runs; a menu on the header stops
// them all. Long lists show the first five at work and "Show more"; what finished folds into one line while others work.
import { useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, CircleStop, MoreHorizontal } from 'lucide-react';
import { usd } from '@shared/budget';
import { cx, IconButton, MenuItem, Popover } from '../../components/ui';
import { ago } from '../../lib/format';
import { groupCounts, groupOrder, isLiveState, needsLine, type WorkState } from '../../lib/work';
import { Elapsed } from '../session/items';
import { StateDot } from '../session/WorkRow';

/** At most this many live rows show before "Show more". */
const LIVE_LIMIT = 6;
/** How many of them show then. */
const LIVE_SHOWN = 5;

export interface GroupRow {
  id: string;
  /** Written by an agent: not translated. */
  title: string;
  state: WorkState;
  /** While it runs: its time so far. */
  startedAt?: number;
  /** Once it is done: "6 min ago". */
  endedAt?: number;
  /** What this row has that the group's shared line does not. */
  meta?: ReactNode;
  /** In US dollars (Hydor subagents). */
  cost?: number;
  /** On hover over the row. */
  hint?: string;
  /** In place of the usual words for how it stands (a Hydor subagent that was removed: "Removed"). */
  status?: ReactNode;
  /** Without it there is nowhere to go: the row cannot be opened. */
  onOpen?: () => void;
  /** Only while it runs and can be stopped from here. */
  onStop?: () => void;
}

/** How a row stands, in words: its time while it works, "Needs you", "6 min ago", "Stopped", "Failed". */
function Status({ row, hideOnHover }: { row: GroupRow; hideOnHover?: boolean }) {
  const cls = cx('shrink-0 text-[12px] tnum whitespace-nowrap', hideOnHover && 'group-hover/row:hidden');
  if (row.status) return <span className={cls}>{row.status}</span>;
  switch (row.state) {
    case 'running':
      return <span className={cx(cls, row.startedAt ? 'text-fg-3' : 'text-busy')}>{row.startedAt ? <Elapsed since={row.startedAt} /> : 'Working'}</span>;
    case 'needs':
      return <span className={cx(cls, 'text-warn')}>Needs you</span>;
    case 'done':
      return <span className={cx(cls, 'text-fg-3')}>{row.endedAt ? ago(row.endedAt) : 'Done'}</span>;
    case 'stopped':
      return <span className={cx(cls, 'text-fg-3')}>Stopped</span>;
    default:
      return <span className={cx(cls, 'text-err')}>Failed</span>;
  }
}

/**
 * Stop, on a row: it takes the place of the time while the row is hovered or has the keyboard's focus (everywhere on a
 * screen that cannot hover). Until then it is out of the row's flow and clipped away, but still reachable by keyboard
 * (display: none would take it out of the tab order).
 */
function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button
      type="button"
      aria-label="Stop this subagent"
      title="Stop this subagent"
      onClick={onStop}
      className="absolute mr-1 inline-flex h-6 w-px shrink-0 items-center gap-1 overflow-hidden rounded-md px-1.5 text-[12px] font-medium whitespace-nowrap text-fg-2 transition-colors [clip-path:inset(50%)] hover:bg-err/10 hover:text-err group-hover/row:static group-hover/row:w-auto group-hover/row:overflow-visible group-hover/row:[clip-path:none] focus-visible:static focus-visible:w-auto focus-visible:overflow-visible focus-visible:[clip-path:none] [@media(hover:none)]:static [@media(hover:none)]:w-auto [@media(hover:none)]:overflow-visible [@media(hover:none)]:[clip-path:none]"
    >
      <CircleStop size={13} />
      <span className="max-sm:hidden">Stop</span>
    </button>
  );
}

/** The right end of a row: how it stands, what it cost, and the arrow, kept together at the right (Stop takes the time's place on hover). */
function End({ row }: { row: GroupRow }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2.5">
      <Status row={row} hideOnHover={!!row.onStop} />
      {row.cost ? <span className="tnum hidden shrink-0 text-[12px] text-fg-3 sm:inline">{usd(row.cost)}</span> : null}
      {row.onOpen && <ChevronRight size={14} className="shrink-0 text-fg-3" />}
    </span>
  );
}

function Row({ row }: { row: GroupRow }) {
  const live = isLiveState(row.state);
  return (
    <div className="group/row relative mx-1 flex h-[30px] items-center rounded-lg hover:bg-bg-2">
      <button type="button" onClick={row.onOpen} disabled={!row.onOpen} title={row.hint} className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left">
        <StateDot state={row.state} />
        <span translate="no" className={cx('min-w-0 truncate text-[13px]', live ? 'text-fg' : 'text-fg-2')}>
          {row.title}
        </span>
        {row.meta && <span className="hidden max-w-[40%] min-w-0 items-center gap-1 truncate text-[12px] text-fg-3 sm:inline-flex">{row.meta}</span>}
        <End row={row} />
      </button>
      {row.onStop && <StopButton onStop={row.onStop} />}
    </div>
  );
}

/** A line of the list that is a button: "Show 3 more", and the finished ones folded. */
const lineCls = 'mx-1 flex h-7 w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2.5 text-left text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2';

/** What the header says of the rows: how many need you, work, are done, stopped or failed, each in its own tone. */
function Summary({ states }: { states: WorkState[] }) {
  const parts = groupCounts(states);
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] whitespace-nowrap">
      {parts.map((c, i) => (
        <span key={c.state} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-fg-3">·</span>}
          {c.state === 'needs' ? (
            <span className="text-warn">{needsLine(c.n)}</span>
          ) : c.state === 'running' ? (
            <span className="text-busy">{`${c.n} working`}</span>
          ) : c.state === 'done' ? (
            <span className="text-fg-3">{`${c.n} done`}</span>
          ) : c.state === 'stopped' ? (
            <span className="text-fg-3">{`${c.n} stopped`}</span>
          ) : (
            <span className="text-err">{`${c.n} failed`}</span>
          )}
        </span>
      ))}
    </span>
  );
}

export function SubagentGroup({
  icon,
  label,
  kindHint,
  shared,
  single,
  singleIcon,
  rows,
  onStopAll,
  stopAllCount = 0,
}: {
  /** The program's or agent's mark, turning while any row runs. */
  icon: ReactNode;
  /** "6 Claude Code subagents". */
  label: string;
  /** On hover over the label: who runs them. */
  kindHint?: string;
  /** What every row shares, after the label ("Sonnet 5.5", "Explore · Haiku 5.5"). */
  shared?: ReactNode;
  /** For a group of one: its whole kind line. */
  single?: ReactNode;
  /** For a group of one: its icon, with its status dot. */
  singleIcon?: ReactNode;
  rows: GroupRow[];
  /** Present when at least one row can be stopped from here. */
  onStopAll?: () => void;
  /** How many rows it stops. */
  stopAllCount?: number;
}) {
  const listId = useId();
  // null: the group goes by its rows (open while any works or waits for you); a click on the header decides it until the card goes.
  const [open, setOpen] = useState<boolean | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [endedOpen, setEndedOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const card = 'mt-3 overflow-hidden rounded-2xl border border-line bg-panel';

  if (rows.length === 1) {
    const row = rows[0]!;
    return (
      <div className={cx(card, 'group/row relative flex h-[38px] items-center')}>
        <button type="button" onClick={row.onOpen} disabled={!row.onOpen} title={row.hint} className="flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left transition-colors enabled:hover:bg-bg-2">
          {singleIcon}
          <span translate="no" className="min-w-0 truncate text-[13.5px] font-medium text-fg">
            {row.title}
          </span>
          {single && <span className="hidden min-w-0 items-center gap-1.5 truncate text-[12px] text-fg-3 sm:inline-flex">{single}</span>}
          <End row={row} />
        </button>
        {row.onStop && <StopButton onStop={row.onStop} />}
      </div>
    );
  }

  const states = rows.map((r) => r.state);
  const anyLive = states.some(isLiveState);
  const isOpen = open ?? anyLive;
  const order = groupOrder(rows);
  const liveRows = showAll || order.live.length <= LIVE_LIMIT ? order.live : order.live.slice(0, LIVE_SHOWN);
  const hidden = order.live.length - liveRows.length;
  return (
    <div className={card}>
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => setOpen(!isOpen)}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 text-left transition-colors hover:bg-bg-2"
        >
          <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', isOpen && 'rotate-90')} />
          <span className="shrink-0">{icon}</span>
          <span title={kindHint} className="min-w-0 truncate text-[13px] font-medium text-fg sm:shrink-0">
            {label}
          </span>
          {shared && (
            <span className="hidden min-w-0 items-center gap-1.5 text-[12px] text-fg-3 sm:flex">
              <span>·</span>
              <span className="flex min-w-0 items-center gap-1.5 truncate">{shared}</span>
            </span>
          )}
          <Summary states={states} />
        </button>
        {onStopAll && (
          <>
            <IconButton ref={menuRef} size="sm" label="More" className="mr-1" onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={15} />
            </IconButton>
            <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end">
              <MenuItem
                danger
                icon={<CircleStop size={15} />}
                onClick={() => {
                  setMenu(false);
                  onStopAll();
                }}
              >
                {`Stop ${stopAllCount} subagent${stopAllCount === 1 ? '' : 's'}`}
              </MenuItem>
            </Popover>
          </>
        )}
      </div>
      {isOpen && (
        <div id={listId} className="pb-1">
          {liveRows.map((r) => (
            <Row key={r.id} row={r} />
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className={cx(lineCls, 'pl-7')}>
              {`Show ${hidden} more`}
            </button>
          )}
          {order.failed.map((r) => (
            <Row key={r.id} row={r} />
          ))}
          {order.ended.length > 0 &&
            (anyLive ? (
              <>
                <button type="button" aria-expanded={endedOpen} onClick={() => setEndedOpen((o) => !o)} className={lineCls}>
                  <span className="flex w-2 shrink-0 justify-center text-ok">
                    <Check size={13} className="shrink-0" />
                  </span>
                  {/* One line that truncates as a whole: the count, then (not translated) the titles. */}
                  <span className="min-w-0 flex-1 truncate">
                    <span>{`${order.ended.length} finished`}</span>
                    <span translate="no">{`: ${order.ended.map((r) => r.title).join(', ')}`}</span>
                  </span>
                  <ChevronRight size={13} className={cx('ml-auto shrink-0 transition-transform duration-200', endedOpen && 'rotate-90')} />
                </button>
                {endedOpen && order.ended.map((r) => <Row key={r.id} row={r} />)}
              </>
            ) : (
              order.ended.map((r) => <Row key={r.id} row={r} />)
            ))}
        </div>
      )}
    </div>
  );
}

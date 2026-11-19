// A board (shared/boards.ts): the answer cards pinned to it, each drawn by the same view as in a reply
// (CardView), in a grid that lays out by the room it has: twelve columns on a computer, where S, M, L and Wide span 3,
// 4, 6 and 12 of them; six on a narrower window (S and M half of it); one on a phone. Each card has its title and where it
// came from above it (or, for a card that keeps itself up to date, when it was updated, what a refresh costs and how often:
// Refresh.tsx), and on hover (a tap on a phone) its Size, Full screen and "…": Refresh now, Keep it up to date…, Rename,
// Move up and down, Save as picture, Open the conversation, Remove. A title the card draws as its own heading shows once,
// in the card. Cards are dragged by their handle to reorder them on a computer. The bar has Refresh all and the board's
// monthly cap for refreshes; a board whose refreshes reached it says so at the top.
//
// Every change is saved at once as a new version (versions on each change, as every page keeps them): the change is
// made here at once, then kept in order, one after another; when the board was saved meanwhile (an agent added a card),
// the change is made again on the newest version and kept on top of it, so nothing either did is lost.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, MouseSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, CalendarClock, CircleSlash, Ellipsis, Expand, GripVertical, ImageDown, MessageSquareText, Pencil, Pin, RefreshCw, Trash2 } from 'lucide-react';
import { answerUi } from '@shared/answer-ui';
import { cardTitle, changeCard, newBoard, removeCard, setBoardCap, SIZE_LABEL, CARD_SIZES, type Board, type BoardCard, type CardSize } from '@shared/boards';
import { allOn, type BoardRefreshState, type CardRefresh } from '@shared/board-refresh';
import type { PageInfo } from '@shared/pages';
import { CardView } from '../../../components/answer/AnswerUi';
import { CardFullScreen, cardPicture, picturable, savePicture } from '../../../components/answer/CardTools';
import { cx, IconButton, inputCls, MenuItem, MenuSep, Popover, useIsMobile } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { api, ApiError, enc, post } from '../../../lib/api';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../../lib/dragTouch';
import { ago } from '../../../lib/format';
import { viaLink } from '../../../lib/machine';
import { go, sessionPath } from '../../../lib/nav';
import { toastError, useSessions, useToasts } from '../../../lib/store';
import { saveBlob } from '../exportFile';
import type { ModelEditorProps } from '../kinds';
import { CapBand, CapButton, PausedBand, readsSource, refreshable, refreshBoard, refreshCard, RefreshDialog, RefreshMeta, RefreshProblem, useBoardRefresh } from './Refresh';

/** How many of the grid's columns each size spans: of six on a narrower window, of twelve on a computer (one on a phone). */
const SPAN: Record<CardSize, string> = {
  s: '@xl:col-span-3 @4xl:col-span-3',
  m: '@xl:col-span-3 @4xl:col-span-4',
  l: '@xl:col-span-6 @4xl:col-span-6',
  wide: '@xl:col-span-6 @4xl:col-span-12',
};
/** What the Size menu says of each, beside its letter. */
const SIZE_HINT: Record<CardSize, string> = { s: 'A quarter of the width', m: 'A third of the width', l: 'Half the width', wide: 'The whole width' };

const sizeOf = (c: BoardCard): CardSize => (CARD_SIZES.includes(c.size) ? c.size : 'm');

/** A change to the board: made here at once, and again on the newest version when it was saved meanwhile. */
type Op = (b: Board) => Board;

/** Where a card came from, as its line says it and Open the conversation opens it. */
function useSource(c: BoardCard): { label: string; open: () => void } | null {
  const live = useSessions((s) => (c.from?.session ? s.byKey[c.from.session]?.title : undefined));
  const f = c.from;
  if (!f || viaLink) return null;
  if (f.session) return { label: live || f.title || tr('a conversation'), open: () => go(`${sessionPath(f.session!)}${f.at !== undefined ? `?at=${f.at}` : ''}`) };
  if (f.run) return { label: f.title || tr('an app’s run'), open: () => go(`/apps/runs/${encodeURIComponent(f.run!)}`) };
  if (f.task) return { label: f.title || tr('a scheduled task'), open: () => go(`/settings?s=tasks&task=${encodeURIComponent(f.task!)}`) };
  return null;
}

/** What a card's refreshes need from its board: what they are doing, and what starts or sets them (none: read only). */
export interface Refreshes {
  state: BoardRefreshState | null;
  /** Refresh now, Try again. */
  now?: (c: BoardCard) => void;
  /** Keep it up to date… */
  settings?: (c: BoardCard) => void;
  /** Stop refreshing. */
  stop?: (c: BoardCard) => void;
}

interface TileProps {
  card: BoardCard;
  pageId: string;
  first: boolean;
  last: boolean;
  readOnly: boolean;
  phone: boolean;
  run: (op: Op) => void;
  onRemove: (c: BoardCard) => void;
  refreshes?: Refreshes;
}

const sameWords = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Whether a card draws its title as its own heading (its first heading reads the same): then the board's line above it
 * shows only when it was pinned or updated, and the controls. Watched as the card draws (a view may come a little later).
 */
function useDrawsTitle(el: React.RefObject<HTMLDivElement | null>, title: string): boolean {
  const [same, setSame] = useState(false);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const look = () => {
      const h = node.querySelector('.aui-h3, h1, h2, h3');
      setSame(!!h && sameWords(h.textContent ?? '', title));
    };
    look();
    const mo = new MutationObserver(look);
    mo.observe(node, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, [el, title]);
  return same;
}

/** One card on the board: its title and source above it, its tools on hover, the card itself drawn by its UI's view. */
function Tile({ card, pageId, first, last, readOnly, phone, run, onRemove, refreshes }: TileProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: readOnly || phone });
  const title = cardTitle(card);
  const size = sizeOf(card);
  const src = useSource(card);
  const el = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<'more' | 'size' | null>(null);
  const [full, setFull] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(title);
  const [pictures, setPictures] = useState(false);
  // Its title once: in the card, when the card draws it as its heading.
  const drawsTitle = useDrawsTitle(el, title);
  const rs = refreshes?.state?.cards[card.id];
  const meta = <RefreshMeta card={card} s={rs} state={refreshes?.state ?? null} guest={viaLink} />;
  const refreshing = !!(card.refresh || rs?.running || rs?.last);
  const canRefresh = !readOnly && !!refreshes?.now && refreshable(card);
  // What the views read of where they are: a card on a board keeps its own state on this device (ticks, answers).
  const info = useMemo(() => ({ done: true, keep: `board:${pageId}:${card.id}`, cwd: card.from?.cwd, board: pageId }), [pageId, card.id, card.from?.cwd]);
  const look = () => setPictures(picturable(el.current));
  const rename = () => {
    setRenaming(false);
    const t = name.trim();
    if (t === title) return;
    // Back to the card's own title when emptied (or set to it).
    const own = (typeof card.data.title === 'string' && card.data.title.trim()) || answerUi(card.ui)?.title || card.ui;
    run((b) => changeCard(b, card.id, { title: t && t !== own ? t : undefined }));
  };
  const move = (d: -1 | 1) => {
    setMenu(null);
    run((b) => {
      const i = b.cards.findIndex((c) => c.id === card.id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= b.cards.length) return b;
      const cards = [...b.cards];
      [cards[i], cards[j]] = [cards[j], cards[i]];
      return { ...b, cards };
    });
  };
  const drawn = <CardView name={card.ui} data={card.data} info={info} />;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('group/tile relative min-w-0', SPAN[size], isDragging && 'z-20')}
      onPointerEnter={look}
      onFocus={look}
      data-card={card.id}
    >
      <div className="mb-1.5 flex min-h-9 items-start gap-1 px-0.5">
        {!readOnly && !phone && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            title={tr('Drag to move it')}
            aria-label={tr('Move')}
            className="-ml-1 mt-0.5 inline-flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-fg-3 opacity-0 transition-opacity group-hover/tile:opacity-100 hover:text-fg focus-visible:opacity-100 active:cursor-grabbing"
          >
            <GripVertical size={14} />
          </button>
        )}
        <div className={cx('min-w-0 flex-1', drawsTitle && !renaming && 'self-center')}>
          {renaming ? (
            <input
              autoFocus
              value={name}
              maxLength={120}
              aria-label={tr('Its title')}
              onChange={(e) => setName(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) rename();
                if (e.key === 'Escape') (setName(title), setRenaming(false));
              }}
              translate="no"
              className={cx(inputCls, 'h-7.5 text-[13.5px] font-semibold')}
            />
          ) : drawsTitle ? null : (
            <h3 translate="no" className="truncate text-[13.5px] leading-5 font-semibold tracking-tight text-fg" onDoubleClick={readOnly ? undefined : () => (setName(title), setRenaming(true))}>
              {title}
            </h3>
          )}
          <div className="flex min-w-0 items-center gap-1 text-[11.5px] leading-4 text-fg-3">
            {refreshing ? (
              meta
            ) : (
              <>
                <span className="shrink-0">{`Pinned ${ago(card.pinnedAt)}`}</span>
                {src && (
                  <>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">from</span>
                    <button type="button" onClick={src.open} translate="no" className="min-w-0 truncate text-left underline-offset-2 hover:text-fg-2 hover:underline">
                      {src.label}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {!readOnly && (
            <button
              ref={sizeRef}
              type="button"
              title={tr('Size')}
              aria-label={tr('Size')}
              aria-haspopup="menu"
              onClick={() => setMenu(menu === 'size' ? null : 'size')}
              className={cx('inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11.5px] font-semibold text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg', menu === 'size' && 'bg-bg-3 text-fg')}
            >
              {SIZE_LABEL[size]}
            </button>
          )}
          <IconButton label="Full screen" size="sm" onClick={() => setFull(true)}>
            <Expand size={14} />
          </IconButton>
          <IconButton ref={moreRef} label="More" size="sm" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
            <Ellipsis size={15} />
          </IconButton>
        </div>
      </div>
      {!readOnly && refreshes?.now && <RefreshProblem card={card} s={rs} onTry={() => refreshes.now!(card)} />}
      <div className="md">
        <div ref={el} className={cx('aui relative', isDragging && 'pointer-events-none opacity-80')} data-ui={card.ui} translate="no">
          {drawn}
        </div>
      </div>
      <Popover anchor={sizeRef} open={menu === 'size'} onClose={() => setMenu(null)} align="end" width={230} title={tr('Size')}>
        {CARD_SIZES.map((s) => (
          <MenuItem key={s} checked={s === size} hint={tr(SIZE_HINT[s])} onClick={() => (setMenu(null), s !== size && run((b) => changeCard(b, card.id, { size: s })))}>
            {SIZE_LABEL[s]}
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={230}>
        {canRefresh && (
          <MenuItem icon={<RefreshCw size={14} />} disabled={!!rs?.running} onClick={() => (setMenu(null), card.refresh || card.from?.session || card.from?.task ? refreshes!.now!(card) : refreshes!.settings?.(card))}>
            {rs?.running ? 'Refreshing…' : 'Refresh now'}
          </MenuItem>
        )}
        {!readOnly && refreshes?.settings && !readsSource(card) && (
          <MenuItem icon={<CalendarClock size={14} />} onClick={() => (setMenu(null), refreshes.settings!(card))}>
            Keep it up to date…
          </MenuItem>
        )}
        {!readOnly && refreshes?.stop && card.refresh && (
          <MenuItem icon={<CircleSlash size={14} />} onClick={() => (setMenu(null), refreshes.stop!(card))}>
            Stop refreshing
          </MenuItem>
        )}
        {!readOnly && refreshes?.settings && !readsSource(card) && <MenuSep />}
        {!readOnly && (
          <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), setName(title), setRenaming(true))}>
            Rename
          </MenuItem>
        )}
        {!readOnly && !(first && last) && (
          <>
            <MenuItem icon={<ArrowUp size={14} />} disabled={first} onClick={() => move(-1)}>
              Move up
            </MenuItem>
            <MenuItem icon={<ArrowDown size={14} />} disabled={last} onClick={() => move(1)}>
              Move down
            </MenuItem>
          </>
        )}
        {pictures && (
          <MenuItem icon={<ImageDown size={14} />} onClick={() => (setMenu(null), el.current && void savePicture(el.current, title))}>
            Save as picture
          </MenuItem>
        )}
        {src && (
          <MenuItem icon={<MessageSquareText size={14} />} onClick={() => (setMenu(null), src.open())}>
            {card.from?.session ? 'Open the conversation' : card.from?.run ? 'Open the app’s run' : 'Open the scheduled task'}
          </MenuItem>
        )}
        {!readOnly && (
          <>
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (setMenu(null), onRemove(card))}>
              Remove
            </MenuItem>
          </>
        )}
      </Popover>
      {full && (
        <CardFullScreen title={title} uiId={card.ui} pictures={pictures} onClose={() => setFull(false)}>
          {drawn}
        </CardFullScreen>
      )}
    </div>
  );
}

/** A board with no cards yet: how to fill it. */
function EmptyBoard({ readOnly }: { readOnly: boolean }) {
  return (
    <div className="mx-auto mt-8 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-dashed border-line-2 px-6 py-10 text-center sm:mt-14">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-2xl bg-bg-2 text-fg-3">
        <Pin size={20} />
      </span>
      <h2 className="text-[15px] font-semibold tracking-tight text-fg">No cards yet</h2>
      {readOnly ? (
        <p className="text-[13px] leading-relaxed text-fg-3">This board has no cards.</p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-fg-2">Pin any answer card from a reply: its … menu → Pin to a board.</p>
          <p className="text-[12.5px] leading-relaxed text-fg-3">Or ask an agent to make the cards for you, with Ask at the top: “Add my GPU usage and the weather.”</p>
        </>
      )}
    </div>
  );
}

/**
 * The board's cards in their grid. `run` keeps a change (none: read-only, an older version or a shared link's).
 * `gridRef` gives the grid's element, for a picture of the whole board.
 */
export function BoardGrid({ board, pageId, run, phone, gridRef, refreshes }: { board: Board; pageId: string; run?: (op: Op) => void; phone: boolean; gridRef?: React.Ref<HTMLDivElement>; refreshes?: Refreshes }) {
  const readOnly = !run;
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const ids = useMemo(() => board.cards.map((c) => c.id), [board.cards]);
  const end = ({ active, over }: DragEndEvent) => {
    if (!run || !over || active.id === over.id) return;
    const a = String(active.id);
    const o = String(over.id);
    // By their ids, so it holds on the newest version too.
    run((b) => {
      const i = b.cards.findIndex((c) => c.id === a);
      const j = b.cards.findIndex((c) => c.id === o);
      if (i < 0 || j < 0) return b;
      const cards = [...b.cards];
      const [c] = cards.splice(i, 1);
      cards.splice(j, 0, c);
      return { ...b, cards };
    });
  };
  const remove = (card: BoardCard) => {
    if (!run) return;
    const at = board.cards.findIndex((c) => c.id === card.id);
    run((b) => removeCard(b, card.id));
    // Taken off at once, and put back with Undo.
    useToasts.getState().push('ok', tr(`Took “${cardTitle(card)}” off the board`), {
      label: tr('Undo'),
      run: () =>
        run((b) => {
          if (b.cards.some((c) => c.id === card.id)) return b;
          const cards = [...b.cards];
          cards.splice(Math.min(Math.max(0, at), cards.length), 0, card);
          return { ...b, cards };
        }),
    });
  };
  if (!board.cards.length) return <EmptyBoard readOnly={readOnly} />;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className="@container">
          <div
            ref={(node) => {
              touchDragArea(node);
              if (typeof gridRef === 'function') gridRef(node);
              else if (gridRef) (gridRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            className="grid grid-cols-1 items-start gap-x-4 gap-y-6 @xl:grid-cols-6 @4xl:grid-cols-12"
          >
            {board.cards.map((c, i) => (
              <Tile key={c.id} card={c} pageId={pageId} first={i === 0} last={i === board.cards.length - 1} readOnly={readOnly} phone={phone} run={run ?? (() => {})} onRemove={remove} refreshes={refreshes} />
            ))}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

/** The board as a picture: the grid as it shows, in the theme it shows in, when no card in it holds a frame (a map, a figure). */
async function boardPicture(el: HTMLElement, title: string) {
  try {
    const blob = await cardPicture(el);
    saveBlob(blob, `${title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 80) || 'board'}.png`);
  } catch (e) {
    toastError(e);
  }
}

export function BoardEditor({ doc, pageId, layout, readOnly, lead, tail, band }: ModelEditorProps<Board>) {
  const phone = useIsMobile() || layout === 'sheet';
  const given = doc?.model ?? null;
  const [board, setBoard] = useState<Board>(() => given ?? newBoard());
  // The board as it is kept (after this editor's own saves) and its version: what the next change is saved over.
  const kept = useRef<{ board: Board; version?: number }>({ board: given ?? newBoard(), version: doc?.version });
  const pending = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const grid = useRef<HTMLDivElement>(null);
  const [picture, setPicture] = useState(false);
  // Whether the board can be a picture: once its cards have drawn (a map or a figure comes in its own time), and again on hover.
  useEffect(() => {
    const t = setTimeout(() => setPicture(picturable(grid.current)), 1200);
    return () => clearTimeout(t);
  }, [board]);
  // Another version (or another board): as it is kept, unless changes made here are still being saved (they make a newer one).
  useEffect(() => {
    if (pending.current) return;
    const b = doc?.model ?? newBoard();
    kept.current = { board: b, version: doc?.version };
    setBoard(b);
  }, [doc?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keeps a change: here at once, then saved after those before it, made again on the newest version when there is one. */
  const run = (op: Op) => {
    setBoard((b) => op(b));
    pending.current++;
    queue.current = queue.current.then(async () => {
      const save = async (over: Board, base: number | undefined) => {
        const model = op(over);
        const r = await post<{ page: PageInfo }>(`/api/pages/${enc(pageId)}/versions`, { model, ...(base ? { base } : {}) });
        kept.current = { board: model, version: r.page.version };
      };
      try {
        try {
          await save(kept.current.board, kept.current.version);
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 409) throw e;
          // Saved meanwhile (an agent added a card): this change on the newest version.
          const r = await api<{ page: PageInfo; model: Board }>(`/api/pages/${enc(pageId)}`);
          await save(r.model ?? newBoard(), r.page.version);
        }
      } catch (e) {
        toastError(e);
        if (pending.current === 1) setBoard(kept.current.board);
      } finally {
        pending.current--;
      }
    });
  };

  // Cards that keep themselves up to date: what their refreshes are doing, and what starts or sets them (Refresh.tsx).
  const live = !readOnly && !viaLink;
  const anyRefresh = board.cards.some((c) => c.refresh);
  const { state, reload } = useBoardRefresh(pageId, live && board.cards.length > 0);
  const [setting, setSetting] = useState<string | null>(null);
  const [capOpen, setCapOpen] = useState(false);
  const [all, setAll] = useState(false);
  const settingCard = setting ? board.cards.find((c) => c.id === setting) : undefined;
  const refreshes = useMemo(
    () =>
      live
        ? {
            state,
            now: (c: BoardCard) => void refreshCard(pageId, c.id, reload),
            settings: (c: BoardCard) => setSetting(c.id),
            stop: (c: BoardCard) => run((b) => changeCard(b, c.id, { refresh: undefined })),
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, state, pageId, reload],
  );
  const saveRefresh = (c: BoardCard, r: CardRefresh, now: boolean) => {
    setSetting(null);
    run((b) => changeCard(b, c.id, { refresh: r }));
    // Refreshed once the setting is kept (its question is the one just written).
    if (now) void queue.current.then(() => refreshCard(pageId, c.id, reload));
  };
  const busy = !!state && Object.values(state.cards).some((c) => c.running);
  // Opened from Schedules' pencil (?card=…): that card's settings, once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !live) return;
    const id = new URLSearchParams(location.search).get('card');
    if (id && board.cards.some((c) => c.id === id)) {
      asked.current = true;
      setSetting(id);
    }
  }, [board.cards, live]);

  const count = board.cards.length;
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-i18n="board">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        {!phone && count > 0 && <span className="shrink-0 px-1 text-[12px] text-fg-3">{count === 1 ? '1 card' : `${count} cards`}</span>}
        {live && anyRefresh && (
          <>
            <CapButton board={board} state={state} open={capOpen} setOpen={setCapOpen} compact={phone} onCap={(cap) => run((b) => setBoardCap(b, cap))} />
            {phone ? (
              <IconButton label="Refresh all" disabled={all} onClick={() => (setAll(true), void refreshBoard(pageId, () => (setAll(false), reload())))}>
                <RefreshCw size={16} className={cx((all || busy) && 'animate-spin')} />
              </IconButton>
            ) : (
              <button
                type="button"
                disabled={all}
                onClick={() => (setAll(true), void refreshBoard(pageId, () => (setAll(false), reload())))}
                title={tr('Refresh every card that keeps itself up to date, now')}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg disabled:opacity-60"
              >
                <RefreshCw size={14} className={cx((all || busy) && 'animate-spin')} />
                Refresh all
              </button>
            )}
          </>
        )}
        {count > 0 && (
          <span onPointerEnter={() => setPicture(picturable(grid.current))} onFocus={() => setPicture(picturable(grid.current))}>
            <IconButton
              label={picture ? 'Save the board as a picture' : 'Save the board as a picture (not while a card holds a map, a figure or a player)'}
              disabled={!picture}
              onClick={() => grid.current && void boardPicture(grid.current, doc?.title ?? 'Board')}
            >
              <ImageDown size={16} />
            </IconButton>
          </span>
        )}
        {tail}
      </div>
      {band}
      {live && state && anyRefresh && <CapBand state={state} onRaise={() => setCapOpen(true)} />}
      {live && <PausedBand board={board} state={state} onAllOn={() => run((b) => allOn(b))} />}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[1600px] px-3 pt-4 pb-[max(24px,var(--safe-bottom))] sm:px-6 sm:pt-5">
          <BoardGrid board={board} pageId={pageId} run={readOnly ? undefined : run} phone={phone} gridRef={grid} refreshes={refreshes} />
        </div>
      </div>
      {settingCard && (
        <RefreshDialog
          card={settingCard}
          pageId={pageId}
          board={board}
          state={state}
          onClose={() => setSetting(null)}
          onSave={(r, now) => saveRefresh(settingCard, r, now)}
          onStop={() => (setSetting(null), run((b) => changeCard(b, settingCard.id, { refresh: undefined })))}
        />
      )}
    </div>
  );
}

// A table's rows as a Kanban board, as Airtable shows them (View → Kanban board): a column for each option of a dropdown
// column (and one for rows without one), a card for each row the filter shows, its first cell as its title and the
// fields chosen under it (Fields: the first few, else). Drag a card to another lane to change its row's option, a lane
// by its name to put the lanes in another order; click a card to open the row as a card; "Add a row" puts a new row
// under the table, in that lane. What it groups by, the fields and the lanes' order are kept with the sheet.
import { useMemo, useRef, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { Check, GripVertical, Plus, SlidersHorizontal, X } from 'lucide-react';
import { colName, formatValue, refName, textOn, type Calc, type ListOption, type Rect, type Sheet } from '@shared/sheets';
import { isTicked, type Rules } from '@shared/sheet-rules';
import { AreaTouchSensor, MOUSE_DRAG, TOUCH_DRAG, touchDragArea } from '../../../lib/dragTouch';
import { Button, cx, IconButton, Popover } from '../../../components/ui';
import { smallInput } from './Panel';

export interface BoardProps {
  sheet: Sheet;
  si: number;
  calc: Calc;
  rev: number;
  rules: Rules;
  /** The table: its header row first. */
  block: Rect;
  hidden: Set<number>;
  /** The column the board groups by, and the dropdown columns it may group by. */
  by: number;
  choices: { c: number; options: ListOption[] }[];
  /** The columns its cards show (none said: the first few), and its lanes' order (the options' values). */
  fields?: number[];
  lanes?: string[];
  readOnly?: boolean;
  onBy: (c: number) => void;
  onFields: (cols: number[]) => void;
  onLanes: (order: string[]) => void;
  onMove: (r: number, value: string) => void;
  onOpen: (r: number) => void;
  onAdd: (value: string) => void;
  onClose: () => void;
}

const NONE = '\u0000';

function Card({ id, children, onOpen }: { id: string; children: React.ReactNode; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} onClick={onOpen} className={cx('cursor-pointer rounded-xl border border-line bg-panel p-2.5 text-left shadow-sm select-none hover:border-line-2', isDragging && 'opacity-40')}>
      {children}
    </div>
  );
}

/** A lane's name, which drags the lane to another place. */
function LaneHead({ id, children, readOnly }: { id: string; children: React.ReactNode; readOnly?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lane:${id}`, disabled: readOnly });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cx('group/lane mb-2 flex items-center gap-2 px-1 select-none', !readOnly && 'cursor-grab', isDragging && 'opacity-40')}>
      {children}
      {!readOnly && <GripVertical size={13} className="ml-auto text-fg-3 opacity-0 group-hover/lane:opacity-100" aria-hidden />}
    </div>
  );
}

function Lane({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cx('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-xl p-1.5', isOver ? 'bg-accent-soft' : 'bg-bg-2/50')}>
      {children}
    </div>
  );
}

export function Board(p: BoardProps) {
  const { sheet, si, calc, block, by } = p;
  const [dragging, setDragging] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const fieldsBtn = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(useSensor(MouseSensor, MOUSE_DRAG), useSensor(AreaTouchSensor, TOUCH_DRAG));
  const shown = (r: number, c: number) => {
    const cell = sheet.cells[refName(r, c)];
    return cell && (cell.v !== undefined || cell.f !== undefined) ? formatValue(calc.value(si, r, c), cell.s) : '';
  };
  const head = (c: number) => shown(block.r1, c) || colName(c);
  const choice = p.choices.find((x) => x.c === by);
  // The lanes: the options in their order, other values the rows hold, and rows with none.
  const lanes = useMemo(() => {
    const out: { key: string; label: string; color?: string; rows: number[] }[] = (choice?.options ?? []).map((o) => ({ key: o.v.toLowerCase(), label: o.v, color: o.color, rows: [] }));
    const none: { key: string; label: string; color?: string; rows: number[] } = { key: NONE, label: '', rows: [] };
    // A row of the table with nothing in it (left by Remove duplicates, say) is no card.
    const empty = (r: number) => {
      for (let c = block.c1; c <= block.c2; c++) {
        const v = calc.value(si, r, c);
        if (v !== null && v !== '') return false;
      }
      return true;
    };
    for (let r = block.r1 + 1; r <= block.r2; r++) {
      if (p.hidden.has(r) || empty(r)) continue;
      const v = shown(r, by).trim();
      if (!v) {
        none.rows.push(r);
        continue;
      }
      let lane = out.find((l) => l.key === v.toLowerCase());
      if (!lane) out.push((lane = { key: v.toLowerCase(), label: v, rows: [] }));
      lane.rows.push(r);
    }
    // In the order kept with the sheet, those it names first; the rest as their options come; no value last.
    const order = (p.lanes ?? []).map((x) => x.toLowerCase());
    const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
    const sorted = out.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l.key) - rank(b.l.key) || a.i - b.i);
    return [...sorted.map((x) => x.l), none];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, si, calc, p.rev, block, by, choice, p.hidden, p.lanes]);
  // The columns a card may show (all but its title's and the one it groups by), and those it shows: the ones chosen, else up to four.
  const others = useMemo(() => {
    const out: number[] = [];
    for (let c = block.c1 + 1; c <= block.c2; c++) if (c !== by) out.push(c);
    return out;
  }, [block, by]);
  const fields = useMemo(() => (p.fields ? p.fields.filter((c) => others.includes(c)) : others.slice(0, 4)), [p.fields, others]);
  const card = (r: number) => (
    <>
      <div translate="no" className="mb-1 truncate text-[13.5px] font-medium text-fg">
        {shown(r, block.c1) || `Row ${r + 1}`}
      </div>
      {fields.map((c) => {
        const rule = p.rules.any ? p.rules.at(r, c)?.rule : undefined;
        const t = shown(r, c);
        if (!t && rule?.type !== 'checkbox') return null;
        return (
          <div key={c} className="flex items-baseline gap-1.5 text-[12px] leading-snug">
            <span translate="no" className="max-w-[45%] shrink-0 truncate text-fg-3">
              {head(c)}
            </span>
            <span translate="no" className="min-w-0 truncate text-fg-2">
              {rule?.type === 'checkbox' ? (isTicked(calc.value(si, r, c)) ? '☑' : '☐') : rule?.type === 'rating' ? '★'.repeat(Math.max(0, Math.min(10, Number(t) || 0))) : t}
            </span>
          </div>
        );
      })}
    </>
  );
  const onStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (!e.over || p.readOnly) return;
    const id = String(e.active.id);
    const lane = lanes.find((l) => l.key === e.over!.id);
    if (!lane) return;
    if (id.startsWith('lane:')) {
      // A lane dropped on another takes its place (no value stays last).
      const from = lanes.findIndex((l) => l.key === id.slice(5));
      const to = lanes.indexOf(lane);
      if (from < 0 || from === to || lanes[from].key === NONE || lane.key === NONE) return;
      const order = lanes.filter((l) => l.key !== NONE).map((l) => l.label);
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      return p.onLanes(order);
    }
    const r = Number(id);
    if (lane.rows.includes(r)) return;
    p.onMove(r, lane.key === NONE ? '' : lane.label);
  };
  const lanePicked = dragging?.startsWith('lane:') ? lanes.find((l) => `lane:${l.key}` === dragging) : undefined;
  const cardPicked = dragging && !dragging.startsWith('lane:') ? Number(dragging) : null;
  const chip = (l: { key: string; label: string; color?: string }) =>
    l.key === NONE ? (
      <span className="text-[13px] text-fg-3 italic">No value</span>
    ) : (
      <span translate="no" className="truncate rounded-full px-2.5 text-[12.5px] leading-[1.7] font-medium" style={l.color ? { background: l.color, color: textOn(l.color) } : { background: 'var(--bg-2)' }}>
        {l.label}
      </span>
    );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-[12.5px] whitespace-nowrap text-fg-3">Group by</span>
        <select value={by} onChange={(e) => p.onBy(Number(e.target.value))} aria-label="Group by" translate="no" className={smallInput} style={{ width: 'auto', minWidth: 160 }}>
          {p.choices.map((x) => (
            <option key={x.c} value={x.c}>
              {head(x.c)}
            </option>
          ))}
        </select>
        <Button ref={fieldsBtn} size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={() => setPicking((x) => !x)}>
          Fields
        </Button>
        <Popover anchor={fieldsBtn} open={picking} onClose={() => setPicking(false)} width={260} title="Fields">
          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {others.map((c) => {
              const on = fields.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  disabled={p.readOnly}
                  onClick={() => p.onFields(on ? fields.filter((x) => x !== c) : [...fields, c].sort((a, b) => a - b))}
                  className="flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-fg hover:bg-bg-2 disabled:opacity-60"
                >
                  <span className={cx('grid h-4 w-4 shrink-0 place-items-center rounded border', on ? 'border-accent bg-accent text-accent-fg' : 'border-fg-3')}>{on && <Check size={11} strokeWidth={3} />}</span>
                  <span translate="no" className="min-w-0 flex-1 truncate">
                    {head(c)}
                  </span>
                </button>
              );
            })}
          </div>
        </Popover>
        <span className="flex-1" />
        <IconButton label="Back to the grid" size="sm" onClick={p.onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDragging(null)}>
        <div ref={touchDragArea} className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {lanes.map((l) => (
            <section key={l.key} className="flex w-[264px] shrink-0 flex-col">
              <LaneHead id={l.key} readOnly={p.readOnly || l.key === NONE}>
                {chip(l)}
                <span className="text-[12px] text-fg-3 tabular-nums">{l.rows.length}</span>
              </LaneHead>
              <Lane id={l.key}>
                {l.rows.map((r) => (
                  <Card key={r} id={String(r)} onOpen={() => p.onOpen(r)}>
                    {card(r)}
                  </Card>
                ))}
                {!p.readOnly && (
                  <button type="button" onClick={() => p.onAdd(l.key === NONE ? '' : l.label)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg">
                    <Plus size={14} />
                    Add a row
                  </button>
                )}
              </Lane>
            </section>
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {cardPicked !== null && <div className="w-[252px] rounded-xl border border-accent bg-panel p-2.5 shadow-lg">{card(cardPicked)}</div>}
          {lanePicked && <div className="flex w-[264px] items-center gap-2 rounded-xl border border-accent bg-panel px-2 py-1.5 shadow-lg">{chip(lanePicked)}</div>}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

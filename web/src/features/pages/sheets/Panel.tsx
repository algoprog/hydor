// What the spreadsheet editor opens beside its grid and over its cells. A side panel (conditional formatting, the rules
// for what cells take, a chart): on a computer a column at the grid's right, as tall as it; on a phone a sheet from the
// bottom over the grid, which stays to pick cells in above it. The pickers a cell opens: a list's options (with their
// colours, a find field, typing picks) and a calendar for a date.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { dateSerial, serialParts, textOn, type ListOption } from '@shared/sheets';
import { LOCALE } from '../../../i18n/locale';
import { cx, IconButton, inputCls } from '../../../components/ui';

export function SidePanel({ title, narrow, onClose, children, footer }: { title: ReactNode; narrow: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const head = (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3.5">
      <div className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{title}</div>
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X size={16} />
      </IconButton>
    </div>
  );
  if (narrow)
    return createPortal(
      <div role="dialog" data-sheet-panel className="fixed inset-x-0 bottom-0 z-50 flex max-h-[min(72dvh,560px)] flex-col rounded-t-[20px] border border-b-0 border-line bg-elevated pb-[var(--safe-bottom)] shadow-lg">
        {head}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2">{footer}</div>}
      </div>,
      document.body,
    );
  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-line bg-panel">
      {head}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2">{footer}</div>}
    </aside>
  );
}

/** A label over a field in a panel. */
export function Row({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cx('px-3.5 py-2', className)}>
      {label && <div className="mb-1.5 text-[12px] font-medium text-fg-3">{label}</div>}
      {children}
    </div>
  );
}

export const smallInput = cx(inputCls, 'h-8.5 rounded-lg px-2.5 text-[13px]');

/** A list cell's options to pick from: a find field (typing filters them, Enter picks the first), each option's chip. */
export function ListPicker({ options, value, onPick, onClose }: { options: ListOption[]; value: string; onPick: (v: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus({ preventScroll: true }), []);
  const shown = useMemo(() => (q ? options.filter((o) => o.v.toLowerCase().includes(q.toLowerCase())) : options), [q, options]);
  return (
    <div className="flex max-h-[340px] flex-col" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
      <input
        ref={field}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && shown[0]) onPick(shown[0].v);
          else if (e.key === 'Escape') onClose();
        }}
        placeholder="Find an option"
        aria-label="Find an option"
        className={cx(smallInput, 'mb-1')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.map((o) => (
          <button key={o.v} type="button" onClick={() => onPick(o.v)} className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] hover:bg-bg-2', o.v.toLowerCase() === value.toLowerCase() && 'bg-bg-2')}>
            <span translate="no" className="min-w-0 truncate rounded-full px-2 leading-[1.5]" style={o.color ? { background: o.color, color: textOn(o.color) } : undefined}>
              {o.v}
            </span>
            {o.v.toLowerCase() === value.toLowerCase() && <Check size={14} className="ml-auto shrink-0 text-accent" />}
          </button>
        ))}
        {!shown.length && <div className="px-2 py-2 text-[12.5px] text-fg-3">No option has those words</div>}
        {value && (
          <button type="button" onClick={() => onPick('')} className="mt-1 flex h-8 w-full items-center rounded-lg px-2 text-left text-[13px] text-fg-3 hover:bg-bg-2">
            Clear the cell
          </button>
        )}
      </div>
    </div>
  );
}

/** A month's days to pick a date from (a day number as Excel counts them), today marked. */
export function DatePicker({ value, onPick }: { value: number | null; onPick: (serial: number) => void }) {
  const today = new Date();
  const start = value !== null && value > 0 ? serialParts(value) : { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
  const [ym, setYm] = useState({ y: start.y, m: start.m });
  const first = new Date(Date.UTC(ym.y, ym.m - 1, 1));
  // Weeks start on Monday.
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(ym.y, ym.m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const picked = value !== null && value > 0 ? serialParts(value) : null;
  const isToday = (d: number) => ym.y === today.getFullYear() && ym.m === today.getMonth() + 1 && d === today.getDate();
  const step = (n: number) => setYm((x) => ({ y: x.y + Math.floor((x.m - 1 + n) / 12), m: ((((x.m - 1 + n) % 12) + 12) % 12) + 1 }));
  const names = [...Array(7).keys()].map((i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(LOCALE, { weekday: 'narrow', timeZone: 'UTC' }));
  return (
    <div className="w-[248px] p-1" onMouseDown={(e) => e.preventDefault()}>
      <div className="mb-1 flex items-center">
        <IconButton label="The month before" size="sm" onClick={() => step(-1)}>
          <ChevronLeft size={15} />
        </IconButton>
        <div className="flex-1 text-center text-[13px] font-medium">{first.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
        <IconButton label="The month after" size="sm" onClick={() => step(1)}>
          <ChevronRight size={15} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {names.map((n, i) => (
          <div key={i} className="py-1 text-[11px] text-fg-3">
            {n}
          </div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <span key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => onPick(dateSerial(ym.y, ym.m, d) + (value !== null && value > 0 ? value - Math.floor(value) : 0))}
              className={cx(
                'h-8 rounded-lg text-[12.5px] tabular-nums hover:bg-bg-2',
                picked && picked.y === ym.y && picked.m === ym.m && picked.d === d ? 'bg-accent font-semibold text-accent-fg hover:bg-accent' : isToday(d) ? 'font-semibold text-accent' : 'text-fg',
              )}
            >
              {d}
            </button>
          ),
        )}
      </div>
      <button type="button" onClick={() => onPick(dateSerial(today.getFullYear(), today.getMonth() + 1, today.getDate()))} className="mt-1 h-8 w-full rounded-lg text-[12.5px] text-accent hover:bg-bg-2">
        Today
      </button>
    </div>
  );
}

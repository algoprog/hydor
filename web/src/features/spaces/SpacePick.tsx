// Picking a space for something kept in the Library (a page, a picture, a video): a short menu of the spaces, with
// "No space" last, the session's own space first and marked. Keep buttons show it only when there are spaces (with
// none, they keep at once); the Library's More → Move to a space and the New dialog use it too.
import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown, LibraryBig, Search } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { cx, MenuItem, MenuLabel, MenuSep, Popover } from '../../components/ui';
import { useSessions } from '../../lib/store';
import { SpaceMark } from './parts';
import { useSpaces } from './state';

/** Past this many spaces the menu gets a box to find one by name, so it stays short. */
const FIND_PAST = 8;

/** The space a session is in, when it still exists. */
export function useSessionSpace(sessionKey?: string): string | null {
  const id = useSessions((s) => (sessionKey ? s.byKey[sessionKey]?.extra?.space : undefined));
  const spaces = useSpaces();
  return typeof id === 'string' && spaces?.some((x) => x.id === id) ? id : null;
}

/** The choices, as menu items: the suggested space first, the others by when they were last at work, then No space. */
function Choices({ value, suggest, onPick, list }: { value?: string | null; suggest?: string | null; onPick: (id: string | null) => void; list: Space[] }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const low = q.trim().toLowerCase();
    const l = list.filter((s) => !low || s.name.toLowerCase().includes(low));
    return suggest ? [...l.filter((s) => s.id === suggest), ...l.filter((s) => s.id !== suggest)] : l;
  }, [list, q, suggest]);
  return (
    <>
      {list.length > FIND_PAST && (
        <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-lg bg-bg-2 px-2.5">
          <Search size={13} className="shrink-0 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a space" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
        </label>
      )}
      <div className={cx(list.length > FIND_PAST && 'max-h-[260px] overflow-y-auto')}>
        {shown.map((s) => (
          <MenuItem key={s.id} icon={<SpaceMark s={s} size={16} />} checked={value === s.id} hint={s.id === suggest ? 'This session’s' : undefined} onClick={() => onPick(s.id)}>
            <span translate="no">{s.name}</span>
          </MenuItem>
        ))}
        {!shown.length && <div className="px-3 py-2 text-[12.5px] text-fg-3">No space’s name has that in it</div>}
      </div>
      <MenuSep />
      <MenuItem icon={<LibraryBig size={15} />} checked={value === null} onClick={() => onPick(null)}>
        No space
      </MenuItem>
    </>
  );
}

/**
 * The menu under a button that asks which space something goes in. `value`: where it is now (to move it); `suggest`:
 * the session's space, first. Picking closes it.
 */
export function SpaceMenu({
  anchor,
  open,
  onClose,
  onPick,
  title = 'Keep it in',
  value,
  suggest,
  align = 'end',
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  onPick: (space: string | null) => void;
  title?: string;
  value?: string | null;
  suggest?: string | null;
  align?: 'start' | 'end';
}) {
  const spaces = useSpaces();
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} width={250}>
      <MenuLabel>{title}</MenuLabel>
      <Choices
        list={spaces ?? []}
        value={value}
        suggest={suggest}
        onPick={(id) => {
          onClose();
          onPick(id);
        }}
      />
    </Popover>
  );
}

/**
 * A Keep button's click: with spaces, the menu that asks which one (the session's first); with none, it keeps at
 * once. `keep(space)` does the keeping: null for no space.
 */
export function useKeepIn(sessionKey: string | undefined, keep: (space: string | null) => void) {
  const spaces = useSpaces();
  const suggest = useSessionSpace(sessionKey);
  const anchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const ask = (el: HTMLElement | null) => {
    if (!spaces?.length) return keep(null);
    anchor.current = el;
    setOpen(true);
  };
  const menu: ReactNode = <SpaceMenu anchor={anchor} open={open} onClose={() => setOpen(false)} onPick={keep} suggest={suggest} />;
  return { ask, menu };
}

/** A form's choice of space: a button saying where it goes, and the menu to change it. */
export function SpaceSelect({ value, onChange, className }: { value: string | null; onChange: (space: string | null) => void; className?: string }) {
  const spaces = useSpaces();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cur = spaces?.find((s) => s.id === value);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-9 max-w-full min-w-0 items-center gap-2 rounded-[10px] border border-line bg-bg-1 pr-2.5 pl-2.5 text-[13.5px] transition-colors hover:border-line-2', className)}
      >
        {cur ? <SpaceMark s={cur} size={18} /> : <LibraryBig size={16} className="shrink-0 text-fg-3" />}
        <span translate={cur ? 'no' : undefined} className="min-w-0 flex-1 truncate text-left">
          {cur ? cur.name : 'No space'}
        </span>
        <ChevronDown size={14} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="start" width={250}>
        <Choices
          list={spaces ?? []}
          value={value}
          onPick={(id) => {
            setOpen(false);
            onChange(id);
          }}
        />
      </Popover>
    </>
  );
}

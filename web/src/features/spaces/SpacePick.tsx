// Picking a space for something kept (a page, a picture, a video): a short menu of the spaces, with
// "No space" last, the session's own space first and marked. Keep buttons show it only when there are spaces (with
// none, they keep at once); a kept thing's Move to another project and the New dialog use it too. A space whose folder
// has folders offers them as well (FolderPick.tsx).
import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Ban, ChevronDown, Search } from 'lucide-react';
import type { Space } from '@shared/spaces';
import { cx, MenuItem, MenuLabel, MenuSep, Popover } from '../../components/ui';
import { useSessions } from '../../lib/store';
import { FolderStep, ProjectRow, useSubfolders } from './FolderPick';
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

/**
 * The choices, as menu items: the suggested space first, the others by when they were last at work, then No space.
 * `head` goes above them; a project's folders take the whole menu's place, `head` too. `at`: the project a thing being
 * moved is in, whose top is then a folder to move it to like the others.
 */
function Choices({
  value,
  suggest,
  at,
  onPick,
  list,
  head,
}: {
  value?: string | null;
  suggest?: string | null;
  at?: string | null;
  onPick: (id: string | null, dir?: string) => void;
  list: Space[];
  head?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [into, setInto] = useState<Space | null>(null);
  const shown = useMemo(() => {
    const low = q.trim().toLowerCase();
    const l = list.filter((s) => !low || s.name.toLowerCase().includes(low));
    return suggest ? [...l.filter((s) => s.id === suggest), ...l.filter((s) => s.id !== suggest)] : l;
  }, [list, q, suggest]);
  const folders = useSubfolders(shown.map((s) => s.folder));
  if (into) return <FolderStep project={into} onBack={() => setInto(null)} onPick={(dir) => onPick(into.id, dir ?? (into.id === at ? into.folder : undefined))} />;
  return (
    <>
      {head}
      {list.length > FIND_PAST && (
        <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-lg bg-bg-2 px-2.5">
          <Search size={13} className="shrink-0 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
        </label>
      )}
      <div className={cx(list.length > FIND_PAST && 'max-h-[260px] overflow-y-auto')}>
        {shown.map((s) => (
          <ProjectRow key={s.id} folders={folders(s.folder)} onFolders={() => setInto(s)}>
            <MenuItem icon={<SpaceMark s={s} size={16} />} checked={value === s.id} hint={s.id === suggest ? 'This session’s' : undefined} onClick={() => onPick(s.id)}>
              <span translate="no">{s.name}</span>
            </MenuItem>
          </ProjectRow>
        ))}
        {!shown.length && <div className="px-3 py-2 text-[12.5px] text-fg-3">No project’s name has that in it</div>}
      </div>
      <MenuSep />
      <MenuItem icon={<Ban size={15} />} checked={value === null} onClick={() => onPick(null)}>
        No project
      </MenuItem>
    </>
  );
}

/**
 * The menu under a button that asks which space something goes in. `value`: where it is now (to move it); `suggest`:
 * the session's space, first. Picking closes it. `dir`: the folder picked in the project's folder, if one was (to
 * move it within the project it is in, the project's own folder too).
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
  onPick: (space: string | null, dir?: string) => void;
  title?: string;
  value?: string | null;
  suggest?: string | null;
  align?: 'start' | 'end';
}) {
  const spaces = useSpaces();
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align={align} width={250}>
      <Choices
        head={<MenuLabel>{title}</MenuLabel>}
        list={spaces ?? []}
        value={value}
        at={value}
        suggest={suggest}
        onPick={(id, dir) => {
          onClose();
          onPick(id, dir);
        }}
      />
    </Popover>
  );
}

/**
 * A Keep button's click: with spaces, the menu that asks which one (the session's first); with none, it keeps at
 * once. `keep(space, dir)` does the keeping: null for no space; `dir`, a folder picked in its folder.
 */
export function useKeepIn(sessionKey: string | undefined, keep: (space: string | null, dir?: string) => void) {
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

/** A form's choice of space: a button saying where it goes (`dir`: a folder in the project's), and the menu to change it. */
export function SpaceSelect({ value, dir, onChange, className }: { value: string | null; dir?: string; onChange: (space: string | null, dir?: string) => void; className?: string }) {
  const spaces = useSpaces();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cur = spaces?.find((s) => s.id === value);
  // The folder as its way from the project's: "reports/2026".
  const within = cur && dir?.startsWith(`${cur.folder}/`) ? dir.slice(cur.folder.length + 1) : null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('flex h-9 max-w-full min-w-0 items-center gap-2 rounded-[10px] border border-line bg-bg-1 pr-2.5 pl-2.5 text-[13.5px] transition-colors hover:border-line-2', className)}
      >
        {cur ? <SpaceMark s={cur} size={18} /> : <Ban size={16} className="shrink-0 text-fg-3" />}
        <span translate={cur ? 'no' : undefined} title={within ? `${cur!.name} / ${within}` : undefined} className="min-w-0 flex-1 truncate text-left">
          {cur ? cur.name : 'No project'}
          {within && <span className="text-fg-3"> / {within}</span>}
        </span>
        <ChevronDown size={14} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="start" width={250}>
        <Choices
          list={spaces ?? []}
          value={value}
          onPick={(id, to) => {
            setOpen(false);
            onChange(id, to);
          }}
        />
      </Popover>
    </>
  );
}

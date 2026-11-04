// Where you are and where you can go on the Files page. The steps of the folder's path (Home › code › shop),
// each one a click away and a place to drop rows on; the last opens a field to go to any folder. And the
// places: the files opened lately, home, folders you pinned, your spaces' folders, the folders sessions worked
// in lately, and the trash. Each folder among them takes rows (and files from the computer) dropped on it.
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Clock, Folder, FolderOpen, House, Pin, Search, Trash2, X } from 'lucide-react';
import { FolderFinder, useRecentFolders } from '../../components/FolderPicker';
import { cx, MenuItem, Popover } from '../../components/ui';
import { basename, dirname, inside, isWinPath, joinPath, pathParts, sepOf, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { dropInto, takesDrop } from './actions';
import { useFolderLead } from './ItemMenu';
import { setPinned, usePinned } from './prefs';

export type Place = 'folder' | 'recent' | 'trash' | 'search';

/** Drag-over and drop for a folder that takes rows and files: `on` while something is over it. */
function useDropOn(dir: string | null, after?: () => void) {
  const [on, setOn] = useState(false);
  if (!dir) return { on: false, props: {} };
  return {
    on,
    props: {
      onDragOver: (e: DragEvent) => takesDrop(e) && !on && setOn(true),
      onDragLeave: (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setOn(false),
      onDrop: (e: DragEvent) => {
        setOn(false);
        void dropInto(e, dir, after);
      },
    },
  };
}

/** One step of the path, a button to go there that takes drops. */
/** `bare`: its icon alone (home's house), its name as its title. */
function Step({ dir, label, icon, onDir, after, last, bare }: { dir: string; label: string; icon?: ReactNode; onDir: (d: string) => void; after?: () => void; last?: boolean; bare?: boolean }) {
  const drop = useDropOn(last ? null : dir, after);
  return (
    <button
      type="button"
      onClick={() => onDir(dir)}
      title={bare ? label : dir}
      aria-label={bare ? label : undefined}
      {...drop.props}
      className={cx(
        'flex h-7 max-w-[14rem] min-w-0 shrink-0 items-center gap-1.5 rounded-md px-1.5 text-[13px] transition-colors hover:bg-bg-2 max-sm:h-8',
        last ? 'font-medium text-fg' : 'text-fg-3 hover:text-fg',
        drop.on && 'bg-accent/15 text-fg ring-1 ring-accent/50',
      )}
    >
      {icon}
      {!bare && (
        <span translate="no" className="truncate">
          {label}
        </span>
      )}
    </button>
  );
}

/**
 * Home › code › shop, from `base` (a space's folder, by its name) or else from home (or the top folder,
 * for folders outside home). Long paths fold their middle into a step that lists them. The last step
 * opens a field to go to any folder.
 */
export function Crumbs({
  dir,
  onDir,
  base,
  after,
  className,
}: {
  dir: string;
  onDir: (d: string) => void;
  base?: { path: string; label: string; icon?: ReactNode };
  after?: () => void;
  className?: string;
}) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [find, setFind] = useState(false);
  const [fold, setFold] = useState(false);
  const findRef = useRef<HTMLButtonElement>(null);
  const foldRef = useRef<HTMLButtonElement>(null);
  const lead = useFolderLead((p) => (setFind(false), onDir(p)), dir);
  // The computer: / , or on Windows the folder's drive (C:\).
  const root = isWinPath(dir) ? `${dir.slice(0, 2)}\\` : '/';
  const top =
    base && inside(dir, base.path)
      ? base
      : home && inside(dir, home)
        ? { path: home, label: 'Home folder', icon: <House size={14} /> }
        : { path: root, label: 'Computer', icon: <Folder size={14} /> };
  const rest = dir === top.path ? [] : pathParts(dir).slice(pathParts(top.path).length);
  // Home shows as its house alone, once the path goes on from it.
  const steps = [
    { dir: top.path, label: top.label, icon: top.icon, bare: top.path === home && rest.length > 0 },
    ...rest.map((n, i) => ({ dir: joinPath(top.path, rest.slice(0, i + 1).join(sepOf(dir))), label: n, icon: undefined as ReactNode, bare: false })),
  ];
  // Five or more: the first, a fold with those between, and the last two.
  const folded = steps.length > 4 ? steps.slice(1, -2) : [];
  const shown = folded.length ? [steps[0], null, ...steps.slice(-2)] : steps;
  const sep = <ChevronRight size={13} className="shrink-0 text-fg-3/60" />;
  return (
    <nav aria-label="Where this folder is" className={cx('flex min-w-0 items-center gap-0.5', className)}>
      {shown.map((s, i) => {
        const last = i === shown.length - 1;
        return (
          <span key={s ? s.dir : '…'} className={cx('flex items-center gap-0.5', last ? 'min-w-0' : 'shrink-0')}>
            {i > 0 && sep}
            {!s ? (
              <button
                ref={foldRef}
                type="button"
                onClick={() => setFold((o) => !o)}
                aria-label="The folders between"
                className="flex h-7 shrink-0 items-center rounded-md px-1.5 text-[13px] text-fg-3 hover:bg-bg-2 hover:text-fg"
              >
                …
              </button>
            ) : last && base ? (
              // In a space's own files, the steps stay inside the space.
              <Step dir={s.dir} label={s.label} icon={s.icon} onDir={() => {}} last />
            ) : last ? (
              <span className="flex min-w-0 items-center">
                <Step dir={s.dir} label={s.label} icon={s.icon} onDir={() => setFind(true)} last />
                <button
                  ref={findRef}
                  type="button"
                  onClick={() => setFind((o) => !o)}
                  aria-label="Go to another folder"
                  title="Go to another folder"
                  className="flex h-7 w-5 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg"
                >
                  <ChevronDown size={13} />
                </button>
              </span>
            ) : (
              <Step dir={s.dir} label={s.label} icon={s.icon} onDir={onDir} after={after} bare={s.bare} />
            )}
          </span>
        );
      })}
      <Popover anchor={foldRef} open={fold} onClose={() => setFold(false)} width={260} title="The folders between">
        {folded.map((s) => (
          <MenuItem key={s.dir} icon={<Folder size={14} />} onClick={() => (setFold(false), onDir(s.dir))}>
            <span translate="no">{s.label}</span>
          </MenuItem>
        ))}
      </Popover>
      <Popover anchor={findRef} open={find} onClose={() => setFind(false)} width={340} title="Go to a folder">
        <FolderFinder value={dir} onPick={(p) => (setFind(false), onDir(p))} lead={lead} autoFocus anchor={findRef} />
      </Popover>
    </nav>
  );
}

function PlaceRow({
  icon,
  label,
  title,
  active,
  onClick,
  drop,
  after,
  onUnpin,
}: {
  icon: ReactNode;
  label: string;
  title?: string;
  active?: boolean;
  onClick: () => void;
  drop?: string;
  after?: () => void;
  onUnpin?: () => void;
}) {
  const d = useDropOn(drop ?? null, after);
  return (
    <div
      className={cx('group flex items-center rounded-lg transition-colors', active ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg', d.on && 'bg-accent/15 ring-1 ring-accent/50')}
      {...d.props}
    >
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-current={active ? 'page' : undefined}
        className="flex h-8 min-w-0 flex-1 items-center gap-2.5 px-2.5 text-left text-[13.5px] max-md:h-11 max-md:text-[15px]"
      >
        <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{icon}</span>
        <span translate="no" className="min-w-0 truncate">
          {label}
        </span>
      </button>
      {onUnpin && (
        <button
          type="button"
          onClick={onUnpin}
          aria-label={`Unpin ${label}`}
          title="Unpin from Places"
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-fg-3 opacity-0 group-hover:opacity-100 hover:bg-bg-3 hover:text-fg max-md:hidden"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

const Label = ({ children }: { children: ReactNode }) => <div className="px-2.5 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">{children}</div>;

/**
 * The places, as a column beside the folder (or a sheet on a phone). `place` and `dir` say which is open.
 * `onFind`: Go to a folder, found by name or typed as a path (from the row, its anchor).
 */
export function Places({
  place,
  dir,
  onDir,
  onPlace,
  onFind,
  after,
}: {
  place: Place;
  dir: string;
  onDir: (d: string) => void;
  onPlace: (p: 'recent' | 'trash') => void;
  onFind?: (el: HTMLElement) => void;
  after?: () => void;
}) {
  const findRef = useRef<HTMLDivElement>(null);
  const boot = useApp((s) => s.boot);
  const home = boot?.home ?? '';
  const spaces = useSpaces();
  const pins = usePinned() ?? [];
  const recent = useRecentFolders(true) ?? [];
  const here = (p: string) => place === 'folder' && dir === p;
  const listed = new Set([home, ...pins, ...(spaces ?? []).map((s) => s.folder)]);
  const others = boot?.defaultCwd && !listed.has(boot.defaultCwd) ? [boot.defaultCwd] : [];
  for (const p of others) listed.add(p);
  const lately = recent.filter((p) => !listed.has(p)).slice(0, 4);
  return (
    <div className="px-2 py-2">
      {onFind && (
        <div ref={findRef}>
          <PlaceRow icon={<Search size={15} />} label="Go to a folder" onClick={() => findRef.current && onFind(findRef.current)} />
        </div>
      )}
      <PlaceRow icon={<Clock size={15} />} label="Recent files" active={place === 'recent'} onClick={() => onPlace('recent')} />
      <PlaceRow icon={<House size={15} />} label="Home folder" title={home} active={here(home)} onClick={() => onDir(home)} drop={home} after={after} />
      {others.map((p) => (
        <PlaceRow key={p} icon={<FolderOpen size={15} />} label={basename(p)} title={tildify(p, home)} active={here(p)} onClick={() => onDir(p)} drop={p} after={after} />
      ))}
      {pins.length > 0 && (
        <>
          <Label>Pinned</Label>
          {pins.map((p) => (
            <PlaceRow
              key={p}
              icon={<Pin size={14} />}
              label={basename(p) || p}
              title={tildify(p, home)}
              active={here(p)}
              onClick={() => onDir(p)}
              drop={p}
              after={after}
              onUnpin={() => void setPinned(p, false)}
            />
          ))}
        </>
      )}
      {!!spaces?.length && (
        <>
          <Label>Projects</Label>
          {spaces.slice(0, 8).map((s) => (
            <PlaceRow
              key={s.id}
              icon={<SpaceMark s={s} size={15} />}
              label={s.name}
              title={tildify(s.folder, home)}
              active={here(s.folder)}
              onClick={() => onDir(s.folder)}
              drop={s.folder}
              after={after}
            />
          ))}
          {spaces.length > 8 && <PlaceRow icon={<span className="text-[13px]">…</span>} label="All projects" onClick={() => go('/spaces')} />}
        </>
      )}
      {lately.length > 0 && (
        <>
          <Label>Sessions worked in</Label>
          {lately.map((p) => (
            <PlaceRow key={p} icon={<Folder size={14} />} label={basename(p) || p} title={tildify(p, home)} active={here(p)} onClick={() => onDir(p)} drop={p} after={after} />
          ))}
        </>
      )}
      <div className="mt-3 border-t border-line pt-2">
        <PlaceRow icon={<Trash2 size={15} />} label="Trash" active={place === 'trash'} onClick={() => onPlace('trash')} />
      </div>
    </div>
  );
}

/** The folder above, unless this is the top one. */
export const upOf = (dir: string) => (dir === '/' ? null : dirname(dir));

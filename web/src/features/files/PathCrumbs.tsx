// The path above an open file: each folder in it goes to that folder on the Files page (with the next step of the path
// picked there), and the file's name shows it in its folder. A long path folds its middle into a "…" that lists the
// folders between; on a phone the folder's path is one button that lists the folders to go to. Over a file in the
// file pop-up (FilePeek), going anywhere closes it first, asking about changes not saved.
import { useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Folder, FolderOpen, House } from 'lucide-react';
import { cx, MenuItem, MenuSep, Popover } from '../../components/ui';
import { basename, dirname, inside, isWinPath, joinPath, pathParts, sepOf, tildify } from '../../lib/format';
import { useFilePeek } from '../../lib/nav';
import { useApp } from '../../lib/store';
import { goFolder } from './actions';
import { Step } from './Places';

/** Opens a folder on the Files page with `select` picked, once a file pop-up over the page (if any) has closed; stays if its changes are kept. */
async function visit(dir: string, select: string) {
  const leave = useFilePeek.getState().leave;
  if (leave && !(await leave())) return;
  goFolder(dir, select);
}

export function PathCrumbs({ path, className, after, compact }: { path: string; className?: string; after?: ReactNode; compact?: boolean }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [fold, setFold] = useState(false);
  const foldRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const dir = dirname(path);
  // The first step: home when the file is inside it, else the computer's top (/, or on Windows the file's drive).
  const top =
    home && inside(dir, home)
      ? { path: home, label: 'Home folder', icon: <House size={14} /> }
      : { path: isWinPath(dir) ? `${dir.slice(0, 2)}\\` : '/', label: 'Computer', icon: <Folder size={14} /> };
  const rest = dir === top.path ? [] : pathParts(dir).slice(pathParts(top.path).length);
  const folders = rest.map((n, i) => ({ dir: joinPath(top.path, rest.slice(0, i + 1).join(sepOf(dir))), label: n }));
  // Each step, with the one after it (the file at the end): what is picked in the folder it goes to.
  const steps = [{ dir: top.path, label: top.label }, ...folders].map((s, i, all) => ({ ...s, next: all[i + 1]?.dir ?? path }));
  const go = (s: { dir: string; next: string }) => {
    setFold(false);
    void visit(s.dir, s.next);
  };
  const showInFolder = () => {
    setFold(false);
    void visit(dir, path);
  };

  if (compact) {
    return (
      <div className={cx('flex min-w-0 items-center gap-1.5', className)}>
        {/* Cut at its start: the folders nearest the file say the most. */}
        <button
          ref={menuRef}
          type="button"
          onClick={() => setFold((o) => !o)}
          title={path}
          aria-label="Go to a folder"
          aria-haspopup="menu"
          aria-expanded={fold}
          className="min-w-0 truncate rounded text-left font-mono text-[11.5px] text-fg-3 hover:text-fg"
        >
          <span dir="rtl" translate="no" className="block truncate text-left">
            <span dir="ltr">{tildify(dir, home)}</span>
          </span>
        </button>
        {after}
        <Popover anchor={menuRef} open={fold} onClose={() => setFold(false)} width={300} title="Go to a folder">
          {[...steps].reverse().map((s) => (
            <MenuItem key={s.dir} icon={<Folder size={14} />} onClick={() => go(s)}>
              <span translate="no" className="break-all">
                {tildify(s.dir, home)}
              </span>
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem icon={<FolderOpen size={14} />} onClick={showInFolder}>
            Show in its folder
          </MenuItem>
        </Popover>
      </div>
    );
  }

  // The first step, a fold with the folders before the last two (when more than two lie between), the last two, the file.
  const folded = folders.length > 2 ? steps.slice(1, -2) : [];
  const shown = folded.length ? [steps[0], null, ...steps.slice(-2)] : steps;
  const sep = <ChevronRight size={13} className="shrink-0 text-fg-3/60" />;
  return (
    <nav aria-label="Where this file is" className={cx('flex min-w-0 items-center gap-0.5', className)}>
      {shown.map((s, i) => (
        <span key={s ? s.dir : '…'} className={cx('flex items-center gap-0.5', s && i > 0 ? 'min-w-0 shrink' : 'shrink-0')}>
          {i > 0 && sep}
          {!s ? (
            <button
              ref={foldRef}
              type="button"
              onClick={() => setFold((o) => !o)}
              aria-label="The folders between"
              className="flex h-7 shrink-0 items-center rounded-md px-1.5 text-[13px] text-fg-3 hover:bg-bg-2 hover:text-fg max-sm:h-8"
            >
              …
            </button>
          ) : (
            <Step dir={s.dir} label={s.label} icon={i === 0 ? top.icon : undefined} bare={i === 0} onDir={() => go(s)} fit={i > 0} />
          )}
        </span>
      ))}
      {sep}
      <span className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={showInFolder}
          title="Show in its folder"
          translate="no"
          className="h-7 min-w-0 truncate rounded-md px-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-bg-2 max-sm:h-8"
        >
          {basename(path)}
        </button>
        {after}
      </span>
      <Popover anchor={foldRef} open={fold} onClose={() => setFold(false)} width={260} title="The folders between">
        {folded.map((s) => (
          <MenuItem key={s.dir} icon={<Folder size={14} />} onClick={() => go(s)}>
            <span translate="no">{s.label}</span>
          </MenuItem>
        ))}
      </Popover>
    </nav>
  );
}

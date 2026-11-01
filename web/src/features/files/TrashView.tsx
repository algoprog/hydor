// Two places of the Files page that are not folders. Trash: what was deleted, the last first, with where it
// came from; Put back returns it there (beside what took its place, if anything did), or into a folder you
// pick; Delete for good, and Empty the trash, delete for good. Recent files: those opened lately, in this
// browser, each with its folder.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Clock, Ellipsis, Folder, Trash2, Undo2 } from 'lucide-react';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, Empty, IconButton, MenuBack, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { api, post } from '../../lib/api';
import { basename, bytes, dirname, tildify } from '../../lib/format';
import { toastError, useApp, useToasts } from '../../lib/store';
import { FileIcon } from '../documents/fileTypes';
import { goFolder, itemOf, type Item } from './actions';
import { changedWhen } from './FolderView';
import { ItemMenu, useFolderLead } from './ItemMenu';
import { forgetRecent, useFilesPrefs } from './prefs';

interface TrashItem {
  name: string;
  path: string;
  from?: string;
  at: number;
  dir: boolean;
  size: number;
}

/** A row's icon: a folder, or its kind's tile. */
const RowIcon = ({ name, dir }: { name: string; dir: boolean }) =>
  dir ? <Folder size={20} className="shrink-0 text-accent/80" fill="currentColor" fillOpacity={0.14} /> : <FileIcon path={name} size={22} className="rounded-md" />;

export function TrashView() {
  const home = useApp((s) => s.boot?.home);
  const mobile = useIsMobile();
  const [list, setList] = useState<TrashItem[] | null>(null);
  const [dirName, setDirName] = useState('');
  const [menu, setMenu] = useState<{ t: TrashItem; sub?: boolean } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLElement | null>(null);
  const load = useCallback(() => void api<{ dir: string; items: TrashItem[] }>('/api/fs/trash').then((r) => (setList(r.items), setDirName(r.dir)), toastError), []);
  useEffect(load, [load]);
  const lead = useFolderLead((p) => menu && void putBack(menu.t, p), null);

  const putBack = async (t: TrashItem, into?: string) => {
    setMenu(null);
    try {
      const r = await post<{ path: string }>('/api/fs/trash/restore', { path: t.path, ...(into ? { into } : {}) });
      useToasts.getState().push('ok', `Put ${t.name} back in ${basename(dirname(r.path)) || '/'}`, { label: 'Show', run: () => goFolder(dirname(r.path), r.path) });
    } catch (e) {
      toastError(e);
    }
    load();
  };
  const forGood = async (t: TrashItem) => {
    setMenu(null);
    if (!(await confirm({ title: `Delete ${t.name} for good?`, body: 'It can’t be put back afterwards.', confirm: 'Delete for good', danger: true }))) return;
    await post('/api/fs/trash/delete', { path: t.path }).catch(toastError);
    load();
  };
  const empty = async () => {
    if (!list?.length) return;
    if (
      !(await confirm({
        title: 'Empty the trash?',
        body: list.length === 1 ? 'The one thing in it is deleted for good.' : `The ${list.length} things in it are deleted for good.`,
        confirm: 'Empty the trash',
        danger: true,
      }))
    )
      return;
    await post('/api/fs/trash/empty').catch(toastError);
    load();
  };
  const size = (list ?? []).reduce((n, t) => n + t.size, 0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 max-md:h-12">
        <Trash2 size={15} className="shrink-0 text-fg-3" />
        {/* Each part its own element, so each is translated on its own. */}
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          <span>Trash</span>
          {list && list.length > 0 && (
            <span className="font-normal text-fg-3">
              {' · '}
              <span>{list.length === 1 ? '1 thing' : `${list.length} things`}</span>
              {size ? `, ${bytes(size)}` : ''}
            </span>
          )}
        </span>
        {!!list?.length && (
          <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void empty()}>
            Empty the trash
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {!list ? (
          <div className="flex justify-center py-12 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : !list.length ? (
          <Empty icon={<Trash2 size={20} />} title="The trash is empty">
            What you delete in Files waits here until you empty the trash, so you can put it back.
          </Empty>
        ) : (
          <>
            {list.map((t) => (
              <div key={t.path} className="group flex min-h-12 items-center gap-3 px-3 py-1.5 hover:bg-bg-2 max-md:min-h-14 sm:px-4">
                <RowIcon name={t.name} dir={t.dir} />
                <div className="min-w-0 flex-1">
                  <div translate="no" className="truncate text-[13.5px] max-md:text-[15px]">
                    {t.name}
                  </div>
                  <div className="truncate text-[12px] text-fg-3" title={t.from}>
                    {t.from ? (
                      <>
                        <span>Deleted from</span> {dirname(t.from) === home ? <span>Home folder</span> : <span translate="no">{tildify(dirname(t.from), home)}</span>}
                      </>
                    ) : (
                      <span>Where it was is not known</span>
                    )}
                    {' · '}
                    <span>{changedWhen(t.at)}</span>
                    {!t.dir && t.size ? ` · ${bytes(t.size)}` : ''}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Undo2 size={14} />}
                  onClick={(e) => {
                    if (t.from) return void putBack(t);
                    anchor.current = e.currentTarget;
                    setMenu({ t, sub: true });
                  }}
                >
                  <span className="max-sm:hidden">Put back</span>
                </Button>
                <IconButton
                  label={`More for ${t.name}`}
                  onClick={(e) => {
                    anchor.current = e.currentTarget;
                    setMenu({ t });
                  }}
                >
                  <Ellipsis size={16} />
                </IconButton>
              </div>
            ))}
            <div className="px-4 pt-3 text-[12px] text-fg-3" title={dirName}>
              <span>Kept in</span> <span translate="no">{tildify(dirName, home)}</span>
              {!mobile && <span>, until you empty the trash</span>}.
            </div>
          </>
        )}
      </div>
      <Popover anchor={anchor} open={!!menu} onClose={() => setMenu(null)} align="end" width={menu?.sub ? 330 : 240} title={menu?.t.name}>
        {menu?.sub ? (
          <>
            <MenuBack onClick={() => (menu.t.from ? setMenu({ t: menu.t }) : setMenu(null))}>Put it in</MenuBack>
            <FolderFinder value={null} onPick={(p) => void putBack(menu.t, p)} lead={lead} autoFocus anchor={anchor} />
          </>
        ) : (
          menu && (
            <>
              {menu.t.from && (
                <MenuItem icon={<Undo2 size={14} />} onClick={() => void putBack(menu.t)}>
                  Put back
                </MenuItem>
              )}
              <MenuItem icon={<ArchiveRestore size={14} />} submenu onClick={() => setMenu({ t: menu.t, sub: true })}>
                Put it in another folder
              </MenuItem>
              <MenuSep />
              <MenuItem danger icon={<Trash2 size={14} />} onClick={() => void forGood(menu.t)}>
                Delete for good
              </MenuItem>
            </>
          )
        )}
      </Popover>
      {confirmNode}
    </div>
  );
}

/** The files opened lately (in this browser), each with its folder; those gone say so and can be cleared. */
export function RecentView({ onFile }: { onFile: (path: string) => void }) {
  const home = useApp((s) => s.boot?.home);
  const recent = useFilesPrefs((s) => s.recent);
  const [stats, setStats] = useState<Record<string, { exists: boolean; size?: number; mtime?: number }>>({});
  const [menu, setMenu] = useState<Item | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const key = recent.join('\n');
  useEffect(() => {
    let alive = true;
    Promise.all(
      recent.map((p) =>
        api<{ exists: boolean; size?: number; mtime?: number }>(`/api/fs/stat?path=${encodeURIComponent(p)}`).then(
          (s) => [p, s] as const,
          () => [p, { exists: true }] as const,
        ),
      ),
    ).then((l) => alive && setStats(Object.fromEntries(l)));
    return () => {
      alive = false;
    };
  }, [key]);
  const gone = recent.filter((p) => stats[p] && !stats[p].exists);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 max-md:h-12">
        <Clock size={15} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">Recent files</span>
        {gone.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => gone.forEach((p) => forgetRecent(p))}>
            Clear those gone
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-8">
        {!recent.length ? (
          <Empty icon={<Clock size={20} />} title="No files opened yet">
            Files you open here show up in this list, the last first, so they are easy to get back to.
          </Empty>
        ) : (
          recent.map((p) => {
            const st = stats[p];
            const missing = st && !st.exists;
            return (
              <div
                key={p}
                onClick={() => !missing && onFile(p)}
                className={'group flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-bg-2 max-md:min-h-14 sm:px-4' + (missing ? ' opacity-55' : '')}
              >
                <RowIcon name={p} dir={false} />
                <div className="min-w-0 flex-1">
                  <div translate="no" className="truncate text-[13.5px] max-md:text-[15px]">
                    {basename(p)}
                  </div>
                  <div className="truncate text-[12px] text-fg-3" title={p}>
                    {missing ? (
                      <span>No longer there</span>
                    ) : (
                      <>
                        <span translate="no">{tildify(dirname(p), home)}</span>
                        {st?.mtime ? (
                          <>
                            {' · '}
                            <span>changed</span> <span>{changedWhen(st.mtime)}</span>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
                {!missing && (
                  <IconButton
                    label={`More for ${basename(p)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      anchor.current = e.currentTarget;
                      setMenu(itemOf(p, false, st?.size));
                    }}
                    className="opacity-0 group-hover:opacity-100 max-md:opacity-100"
                  >
                    <Ellipsis size={16} />
                  </IconButton>
                )}
              </div>
            );
          })
        )}
      </div>
      <ItemMenu items={menu ? [menu] : []} anchor={anchor} open={!!menu} onClose={() => setMenu(null)} onOpen={(it) => onFile(it.path)} showFolder />
    </div>
  );
}

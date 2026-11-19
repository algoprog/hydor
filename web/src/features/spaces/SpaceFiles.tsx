// A project's Files tab: its folder, and each folder it works with besides, in the Files page's own view (tiles with
// pictures, or the list; pick several, drag, upload, the menus). The folders show as chips over it, with one to attach
// another folder of yours, where it is; a chip's × leaves a folder out (the folder itself stays as it is). Files open
// in a window over the page. At the top of the project's own folder what was kept in the project (pages, documents,
// slides, designs, pictures, videos, sounds: pages/kept.tsx) comes in the same view, after the folders and before the
// files, each opening in its own editor; New there also makes those. Files and folders dropped anywhere on the tab are
// uploaded into the folder shown.
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { ExternalLink, Folder, Plus, X } from 'lucide-react';
import { MAX_FOLDERS, type Space } from '@shared/spaces';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, cx, Popover } from '../../components/ui';
import { enc, patch } from '../../lib/api';
import { basename, tildify } from '../../lib/format';
import { go, openProject, useFilePeek, useProjectWindow } from '../../lib/nav';
import { toastError, useApp, useToasts } from '../../lib/store';
import { dropInto, goFolder, takesDrop } from '../files/actions';
import { FolderView } from '../files/FolderView';
import { KeptThings, useKept } from '../pages/kept';
import { SpaceMark } from './parts';
import { loadSpaces } from './state';

export function SpaceFiles({ s, onSaved }: { s: Space; onSaved: (next: Space) => void }) {
  const home = useApp((x) => x.boot?.home);
  const roots = [s.folder, ...(s.folders ?? [])];
  const under = (p: string, r: string) => p === r || p.startsWith(`${r}/`);
  // The folder the window's Files shows (its `dir`), when it is one of the project's.
  const asked = useProjectWindow((x) => (x.at?.id === s.id ? x.at.dir : undefined));
  const dir = asked && roots.some((r) => under(asked, r)) ? asked : s.folder;
  // The folder it is in: the space's own, else the one it works with that holds it (the deepest, if nested).
  const root = under(dir, s.folder) ? s.folder : (roots.filter((r) => under(dir, r)).sort((a, b) => b.length - a.length)[0] ?? s.folder);
  const [attach, setAttach] = useState(false);
  const attachRef = useRef<HTMLButtonElement>(null);
  const kept = useKept(s.id);
  // The kept things come at the top of the project's own folder, not in its subfolders or the other folders it works with.
  const extra = useMemo(() => (dir === s.folder && kept?.length ? { titles: kept.map((k) => k.title), render: (o: { grid: boolean; filter: string }) => <KeptThings items={kept} {...o} /> } : undefined), [dir, s.folder, kept]);
  // Files dropped on the tab outside the view (over the chips) go into the folder shown too.
  const [over, setOver] = useState(false);
  const open = (d: string) => openProject(s.id, 'files', { dir: d === s.folder ? undefined : d });

  const save = async (folders: string[]) => {
    try {
      const next = await patch<Space>(`/api/projects/${enc(s.id)}`, { folders });
      onSaved(next);
      loadSpaces();
      return next;
    } catch (e) {
      toastError(e);
      return null;
    }
  };
  const add = async (p: string) => {
    setAttach(false);
    if (roots.some((r) => under(p, r))) return open(p);
    if (await save([...(s.folders ?? []), p])) open(p);
  };
  const leave = async (p: string) => {
    const was = s.folders ?? [];
    if (!(await save(was.filter((x) => x !== p)))) return;
    if (root === p) open(s.folder);
    useToasts.getState().push('ok', `${s.name} no longer works with ${basename(p)}`, { label: 'Undo', run: () => void save(was) });
  };

  const chip = 'flex h-8 max-w-[16rem] min-w-0 shrink-0 items-center gap-1.5 rounded-full border pl-2.5 text-[13px] transition-colors';
  return (
    <div
      className={cx('flex h-full min-h-0 flex-col gap-3', over && 'rounded-xl outline-2 outline-offset-2 outline-accent/50 outline-dashed')}
      onDragOver={(e: DragEvent) => {
        if (!e.dataTransfer.types.includes('Files') || !takesDrop(e)) return;
        if (!over) setOver(true);
      }}
      onDragLeave={(e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      // A drop on the folder view below is its own (it stops there): the outline goes all the same.
      onDropCapture={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        setOver(false);
        if (e.dataTransfer.types.includes('Files')) void dropInto(e, dir);
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => open(s.folder)}
          title={tildify(s.folder, home)}
          className={cx(chip, 'pr-3', root === s.folder ? 'border-accent/40 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2')}
        >
          <SpaceMark s={s} size={15} />
          <span translate="no" className="min-w-0 truncate">
            {s.name}
          </span>
        </button>
        {(s.folders ?? []).map((p) => (
          <span key={p} className={cx(chip, 'pr-1', root === p ? 'border-accent/40 bg-accent-soft text-fg' : 'border-line bg-bg-1 text-fg-2 hover:bg-bg-2')}>
            <button type="button" onClick={() => open(p)} title={tildify(p, home)} className="flex min-w-0 items-center gap-1.5">
              <Folder size={14} className="shrink-0 text-fg-3" />
              <span translate="no" className="min-w-0 truncate">
                {basename(p) || p}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void leave(p)}
              aria-label={`Leave out ${basename(p)}`}
              title="Leave it out (the folder stays as it is)"
              className="rounded-full p-1 text-fg-3 hover:bg-bg-3 hover:text-fg"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {(s.folders?.length ?? 0) < MAX_FOLDERS && (
          <Button ref={attachRef} size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setAttach((o) => !o)}>
            Attach a folder
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => goFolder(dir)} className="max-sm:hidden">
          Open in Files
        </Button>
        <Popover anchor={attachRef} open={attach} onClose={() => setAttach(false)} width={340} title="A folder it works with">
          <div className="px-1 pb-1.5 text-[12.5px] leading-snug text-fg-3">It stays where it is: the project’s sessions work with it, and its files show here.</div>
          <FolderFinder value={null} onPick={(p) => void add(p)} autoFocus anchor={attachRef} />
        </Popover>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-panel">
        <FolderView
          dir={dir}
          onDir={open}
          base={{ path: root, label: root === s.folder ? s.name : basename(root) || root, icon: root === s.folder ? <SpaceMark s={s} size={15} /> : <Folder size={14} /> }}
          onFile={(p) => useFilePeek.setState({ file: { path: p } })}
          onSearch={(q) => go(`/search?q=${enc(q)}&in=${enc(dir)}`)}
          embedded
          project={s.id}
          extra={extra}
        />
      </div>
    </div>
  );
}

// Knowledge bases on the pages that hold them (Spaces → Shared knowledge, and each space's Knowledge tab): a
// drop zone for files and folders (copied into the app), a base's card (its folders on this computer, read
// where they are and kept up to date, its documents, what could not be read, moving it to a space), and a
// search the way agents do.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, FolderInput, FolderPlus, Library, MemoryStick, MoreHorizontal, RefreshCw, RotateCw, Search, Trash2, TriangleAlert, Upload, X } from 'lucide-react';
import type { KnowledgeBase, KnowledgeDoc, KnowledgeHit, KnowledgeState } from '@shared/knowledge';
import { citation } from '@shared/knowledge';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, MenuBack, MenuItem, Popover, Throbber, useConfirm } from '../../components/ui';
import { api, del, enc, patch, post, put } from '../../lib/api';
import { ago, bytes, tildify } from '../../lib/format';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openFile } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { entriesFromDrop, pickedFromInput, startUpload, walkEntries, type PickedFile } from '../../lib/upload';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';

/** The bases and whether search by meaning is on, kept up to date. */
export function useKnowledge(): [KnowledgeState | null, () => void] {
  const [st, setSt] = useState<KnowledgeState | null>(null);
  const load = useCallback(() => void api<KnowledgeState>('/api/knowledge').then(setSt, toastError), []);
  useEffect(load, [load]);
  useFeatureEvent('knowledge', load);
  // While search by meaning sets itself up or starts, look again every few seconds: nothing else says how far it got.
  const busy = st?.meaningHeld?.why === 'setting-up' || st?.meaningHeld?.why === 'starting';
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [busy, load]);
  return [st, load];
}

/** Uploads files into a base's own folder, then has it read them. */
export async function addFiles(b: KnowledgeBase, picked: PickedFile[]) {
  if (!picked.length) return;
  await startUpload(b.filesDir, picked, [], () => void post(`/api/knowledge/${enc(b.id)}/scan`).catch(toastError));
}

/** A drop zone for files and folders (from the computer the page is on), with a button to choose files. */
export function DropFiles({ onFiles, big }: { onFiles: (p: PickedFile[]) => void; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        // Entries are readable only during the drop.
        const entries = entriesFromDrop(e.dataTransfer);
        void walkEntries(entries).then((r) => onFiles(r.files), toastError);
      }}
      className={cx('flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-center transition-colors', big ? 'px-4 py-10' : 'px-3 py-4', over ? 'border-accent bg-accent-soft' : 'border-line-2 bg-bg-1')}
    >
      <Upload size={big ? 22 : 17} className="text-fg-3" />
      <div className="text-[13.5px] text-fg-2">
        Drop documents or a folder here, or{' '}
        <button type="button" onClick={() => input.current?.click()} className="font-medium text-accent hover:underline">
          choose files
        </button>{' '}
        <span className="max-sm:hidden">
          or a{' '}
          <button type="button" onClick={() => folderInput.current?.click()} className="font-medium text-accent hover:underline">
            folder
          </button>
        </span>
      </div>
      <div className="text-[12px] text-fg-3">PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, text and web pages</div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) onFiles(pickedFromInput(e.target.files));
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...({ webkitdirectory: '' } as object)}
        onChange={(e) => {
          if (e.target.files) onFiles(pickedFromInput(e.target.files));
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** What a base holds, in a line: documents, passages, how far search by meaning has come, or how far reading has. */
function Counts({ b, meaning }: { b: KnowledgeBase; meaning: boolean }) {
  const parts = [`${b.docs} document${b.docs === 1 ? '' : 's'}`, `${b.passages.toLocaleString()} passage${b.passages === 1 ? '' : 's'}`];
  // 0% only while none has its vector yet: the first of a big base's passages show as 1%.
  const pct = b.embedded ? Math.max(1, Math.floor((b.embedded / b.passages) * 100)) : 0;
  if (meaning && b.passages) parts.push(b.embedded >= b.passages ? 'ready to search by meaning' : `${pct}% ready to search by meaning`);
  return (
    <div className="text-[12.5px] text-fg-3">
      {b.indexing ? (
        <span className="text-fg-2">
          Reading {b.indexing.done} of {b.indexing.total}… ·{' '}
        </span>
      ) : null}
      {parts.join(' · ')}
      {b.indexedAt && !b.indexing ? ` · read ${ago(b.indexedAt)}` : ''}
    </div>
  );
}

function Docs({ b }: { b: KnowledgeBase }) {
  const [docs, setDocs] = useState<KnowledgeDoc[] | null>(null);
  const load = useCallback(() => void api<{ docs: KnowledgeDoc[] }>(`/api/knowledge/${enc(b.id)}/docs`).then((r) => setDocs(r.docs), toastError), [b.id]);
  useEffect(load, [load, b.docs, b.passages, b.indexing?.done]);
  if (!docs) return <Throbber size={18} />;
  if (!docs.length) return <div className="text-[12.5px] text-fg-3">Nothing read yet.</div>;
  const own = (d: KnowledgeDoc) => d.path.startsWith(`${b.filesDir}/`);
  return (
    <div className="max-h-[320px] divide-y divide-line overflow-y-auto rounded-lg border border-line">
      {docs.map((d) => (
        <div key={d.id} className="group flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]">
          <FileText size={13} className={cx('shrink-0', d.status === 'error' ? 'text-err' : 'text-fg-3')} />
          <button type="button" onClick={() => openFile(d.path)} className="min-w-0 flex-1 truncate text-left hover:underline" title={d.path}>
            {own(d) ? d.path.slice(b.filesDir.length + 1) : tildify(d.path)}
          </button>
          <span className={cx('shrink-0', d.status === 'indexed' ? 'text-fg-3' : 'text-err')} title={d.error}>
            {d.status === 'indexed' ? `${d.passages} · ${bytes(d.size)}` : d.status === 'empty' ? 'no text' : 'could not read'}
          </span>
          {own(d) && (
            <IconButton label="Remove" size="sm" className="opacity-0 group-hover:opacity-100 max-sm:opacity-100" onClick={() => void del(`/api/knowledge/${enc(b.id)}/docs/${d.id}`).then(load, toastError)}>
              <X size={13} />
            </IconButton>
          )}
        </div>
      ))}
    </div>
  );
}

/** A base: its folders, a drop zone, its documents, and a menu to read it again, rename, move or delete it. */
export function BaseCard({ b, meaning }: { b: KnowledgeBase; meaning: boolean }) {
  const [confirm, confirmNode] = useConfirm();
  const spaces = useSpaces();
  const menuRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<false | 'main' | 'move'>(false);
  const [folder, setFolder] = useState(false);
  const [rename, setRename] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const folders = b.sources.filter((s) => s.kind === 'folder');
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: `Delete ${b.name}?`, body: 'Its passages go, and the files dropped into it with them. Folders on this computer stay as they are.', confirm: 'Delete', danger: true }))) return;
    await del(`/api/knowledge/${enc(b.id)}`).catch(toastError);
  };
  /** Into a space (its sessions alone search it then), or out of one to be shared. */
  const move = async (space: string | null, name: string) => {
    setMenu(false);
    try {
      await patch(`/api/knowledge/${enc(b.id)}`, { space });
      toast(space ? `${b.name} moved to ${name}` : `${b.name} is shared now`);
    } catch (e) {
      toastError(e);
    }
  };
  const here = spaces?.find((s) => s.id === b.space);
  return (
    <section className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          <Library size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold">{b.name}</div>
          <Counts b={b} meaning={meaning} />
        </div>
        <IconButton ref={menuRef} label="More" onClick={() => setMenu((o) => (o ? false : 'main'))}>
          <MoreHorizontal size={16} />
        </IconButton>
        <Popover anchor={menuRef} open={!!menu} onClose={() => setMenu(false)} align="end" width={230}>
          {menu === 'move' ? (
            <>
              <MenuBack onClick={() => setMenu('main')}>Move to</MenuBack>
              <MenuItem icon={<Library size={14} />} checked={!here} onClick={() => void (here ? move(null, '') : setMenu(false))}>
                Shared knowledge
              </MenuItem>
              {(spaces ?? []).map((s) => (
                <MenuItem key={s.id} icon={<SpaceMark s={s} size={14} />} checked={here?.id === s.id} onClick={() => void (here?.id === s.id ? setMenu(false) : move(s.id, s.name))}>
                  {s.name}
                </MenuItem>
              ))}
            </>
          ) : (
            <>
              <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setMenu(false), void post(`/api/knowledge/${enc(b.id)}/scan`).catch(toastError))}>
                Read again now
              </MenuItem>
              <MenuItem icon={<BookOpen size={14} />} onClick={() => (setMenu(false), setRename(true))}>
                Rename
              </MenuItem>
              {(!!spaces?.length || !!here) && (
                <MenuItem icon={<FolderInput size={14} />} submenu onClick={() => setMenu('move')}>
                  Move to
                </MenuItem>
              )}
              <MenuItem icon={<Trash2 size={14} />} danger onClick={() => void remove()}>
                Delete
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
      <DropFiles onFiles={(p) => void addFiles(b, p).catch(toastError)} />
      <div className="flex flex-wrap items-center gap-1.5">
        {folders.map((s) => (
          <span key={s.id} className="flex h-7 min-w-0 items-center gap-1.5 rounded-full bg-bg-2 pr-1 pl-2.5 text-[12.5px]" title={s.path}>
            <span className="min-w-0 truncate">{tildify(s.path)}</span>
            <button type="button" aria-label={`Stop reading ${s.name}`} onClick={() => void del(`/api/knowledge/${enc(b.id)}/sources/${enc(s.id)}`).catch(toastError)} className="rounded-full p-0.5 text-fg-3 hover:bg-bg-3 hover:text-fg">
              <X size={12} />
            </button>
          </span>
        ))}
        <Button ref={folderRef} size="sm" variant="ghost" icon={<FolderPlus size={14} />} onClick={() => setFolder((o) => !o)}>
          Add a folder on this computer
        </Button>
        <Popover anchor={folderRef} open={folder} onClose={() => setFolder(false)} width={340} title="A folder to read, and keep up to date">
          <FolderFinder
            value={null}
            autoFocus
            anchor={folderRef}
            onPick={(p) => {
              setFolder(false);
              void post(`/api/knowledge/${enc(b.id)}/folders`, { path: p }).catch(toastError);
            }}
          />
        </Popover>
        {b.docs > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setShowDocs((o) => !o)}>
            {showDocs ? 'Hide the documents' : 'Show the documents'}
          </Button>
        )}
      </div>
      {b.errors.length > 0 && (
        <div className="rounded-lg bg-err/8 px-3 py-2 text-[12.5px] text-err">
          {b.errors.length} document{b.errors.length === 1 ? '' : 's'} could not be read: {b.errors.slice(0, 3).map((e) => `${e.path.split('/').pop()} (${e.error})`).join('; ')}
        </div>
      )}
      {showDocs && <Docs b={b} />}
      <RenameDialog b={b} open={rename} onClose={() => setRename(false)} />
      {confirmNode}
    </section>
  );
}

function RenameDialog({ b, open, onClose }: { b: KnowledgeBase; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(b.name);
  useEffect(() => {
    if (open) setName(b.name);
  }, [open, b.name]);
  const save = () => void patch(`/api/knowledge/${enc(b.id)}`, { name }).then(onClose, toastError);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename the knowledge base"
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()} />
    </Dialog>
  );
}

/**
 * A search the way agents do: by words and meaning, or for exact text in quotes or as /pattern/. In what a
 * session in `space` searches (null: one in no space, so the shared knowledge alone).
 */
export function TrySearch({ space }: { space: string | null }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<{ hits: KnowledgeHit[]; meaning: boolean } | null>(null);
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setR(await post('/api/knowledge/search', { query: q, limit: 10, space }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="Try a search, as agents do: a question, or “exact words” in quotes"
          className={cx(inputCls, 'pl-9')}
        />
        {busy && <Throbber size={16} className="absolute top-1/2 right-3 -translate-y-1/2" />}
      </div>
      {r &&
        (r.hits.length ? (
          <div className="space-y-1.5">
            {r.hits.map((h) => (
              <button key={h.ref} type="button" onClick={() => openFile(h.path)} className="block w-full rounded-lg border border-line bg-panel px-3 py-2 text-left transition-colors hover:bg-bg-2">
                <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium">
                  <FileText size={13} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 truncate">{citation(h)}</span>
                  <span className="shrink-0 font-normal text-fg-3">
                    · {h.baseName} · by {h.by.join(' and ')}
                  </span>
                </div>
                <div className="mt-1 line-clamp-3 text-[12.5px] text-fg-2">{h.text.replace(/^#+\s.*\n+/, '')}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-1 text-[12.5px] text-fg-3">Nothing matches that.</div>
        ))}
    </div>
  );
}

/**
 * Search by meaning is on, but these bases' passages wait for their vectors: why (it is setting itself up, starting,
 * short of memory, or it stopped), so a percentage that does not move says what it waits for.
 */
export function MeaningWait({ st, bases }: { st: KnowledgeState; bases: KnowledgeBase[] }) {
  const h = st.meaningHeld;
  if (!st.meaning || !h || !bases.some((b) => b.embedded < b.passages)) return null;
  const gb = (mb?: number) => ((mb ?? 0) / 1024).toFixed(1);
  return (
    <div className={cx('flex items-start gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[12.5px] leading-snug', h.why === 'failed' ? 'text-warn' : 'text-fg-2')}>
      {h.why === 'failed' ? <TriangleAlert size={14} className="mt-0.5 shrink-0" /> : h.why === 'memory' ? <MemoryStick size={14} className="mt-0.5 shrink-0 text-fg-3" /> : <Throbber size={14} className="mt-0.5 shrink-0" />}
      <div className="min-w-0">
        {h.why === 'failed' ? (
          <span>Search by meaning stopped, so agents find these passages by their words alone: {h.detail ?? 'it could not start'}</span>
        ) : h.why === 'memory' ? (
          <span>
            Search by meaning is waiting for memory: {gb(h.freeMb)} GB free, it needs {gb(h.needMb)} GB. Until then agents find these passages by their words; it tries again every few minutes.
          </span>
        ) : h.why === 'starting' ? (
          <span>Search by meaning is starting: {h.detail ?? 'Loading the model'}. The passages get their vectors next.</span>
        ) : (
          <span>Search by meaning is setting itself up on this computer: {h.detail ?? 'Getting ready'}. The passages get their vectors once it is ready.</span>
        )}
        {h.why === 'failed' && (
          <>
            {' '}
            <button type="button" onClick={() => void put('/api/memory', { retry: true }).catch(toastError)} className="inline-flex items-center gap-1 font-medium text-fg-2 underline-offset-2 hover:underline">
              <RotateCw size={12} /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Search by meaning is off: where to turn it on. */
export function MeaningHint() {
  return (
    <div className="rounded-lg bg-bg-2 px-3 py-2 text-[12.5px] text-fg-2">
      Agents find passages by their words. To find them by what they mean too (in other words, or other languages), turn on search by meaning in{' '}
      <button type="button" onClick={() => go('/settings?s=memory')} className="font-medium text-accent hover:underline">
        Settings → Memory
      </button>
      ; it runs on this computer.
    </div>
  );
}

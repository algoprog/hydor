// The Knowledge page: your documents, for every agent to search. Drop files or a folder onto a knowledge
// base (they are copied into the app), or add a folder on this computer (read where it is and kept up to
// date); try a search the way agents do; see what each base holds and what could not be read.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FileText, FolderPlus, Library, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, X } from 'lucide-react';
import type { KnowledgeBase, KnowledgeDoc, KnowledgeHit, KnowledgeState } from '@shared/knowledge';
import { citation } from '@shared/knowledge';
import { FolderFinder } from '../../components/FolderPicker';
import { Button, cx, Dialog, Empty, IconButton, inputCls, MenuItem, Popover, Throbber, useConfirm } from '../../components/ui';
import { api, del, enc, patch, post } from '../../lib/api';
import { bytes, tildify, timeAgo } from '../../lib/format';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openFile } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { entriesFromDrop, pickedFromInput, startUpload, walkEntries, type PickedFile } from '../../lib/upload';
import { PageHeader } from '../layout/PageHeader';

/** Uploads files into a base's own folder, then has it read them. */
async function addFiles(b: KnowledgeBase, picked: PickedFile[]) {
  if (!picked.length) return;
  await startUpload(b.filesDir, picked, [], () => void post(`/api/knowledge/${enc(b.id)}/scan`).catch(toastError));
}

/** A drop zone for files and folders (from the computer the page is on), with a button to choose files. */
function DropFiles({ onFiles, big }: { onFiles: (p: PickedFile[]) => void; big?: boolean }) {
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
  if (meaning && b.passages) parts.push(b.embedded >= b.passages ? 'ready to search by meaning' : `${Math.floor((b.embedded / b.passages) * 100)}% ready to search by meaning`);
  return (
    <div className="text-[12.5px] text-fg-3">
      {b.indexing ? (
        <span className="text-fg-2">
          Reading {b.indexing.done} of {b.indexing.total}… ·{' '}
        </span>
      ) : null}
      {parts.join(' · ')}
      {b.indexedAt && !b.indexing ? ` · read ${timeAgo(b.indexedAt)}` : ''}
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

function BaseCard({ b, meaning }: { b: KnowledgeBase; meaning: boolean }) {
  const [confirm, confirmNode] = useConfirm();
  const menuRef = useRef<HTMLButtonElement>(null);
  const folderRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const [folder, setFolder] = useState(false);
  const [rename, setRename] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const folders = b.sources.filter((s) => s.kind === 'folder');
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: `Delete ${b.name}?`, body: 'Its passages go, and the files dropped into it with them. Folders on this computer stay as they are.', confirm: 'Delete', danger: true }))) return;
    await del(`/api/knowledge/${enc(b.id)}`).catch(toastError);
  };
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
        <IconButton ref={menuRef} label="More" onClick={() => setMenu((o) => !o)}>
          <MoreHorizontal size={16} />
        </IconButton>
        <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={220}>
          <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setMenu(false), void post(`/api/knowledge/${enc(b.id)}/scan`).catch(toastError))}>
            Read again now
          </MenuItem>
          <MenuItem icon={<BookOpen size={14} />} onClick={() => (setMenu(false), setRename(true))}>
            Rename
          </MenuItem>
          <MenuItem icon={<Trash2 size={14} />} danger onClick={() => void remove()}>
            Delete
          </MenuItem>
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

/** A search the way agents do: by words and meaning, or for exact text in quotes or as /pattern/. */
function TrySearch() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<{ hits: KnowledgeHit[]; meaning: boolean } | null>(null);
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setR(await post('/api/knowledge/search', { query: q, limit: 10 }));
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

export function KnowledgePage() {
  const [st, setSt] = useState<KnowledgeState | null>(null);
  const load = useCallback(() => void api<KnowledgeState>('/api/knowledge').then(setSt, toastError), []);
  useEffect(load, [load]);
  useFeatureEvent('knowledge', load);
  const newBase = async () => {
    try {
      await post('/api/knowledge', { name: st?.bases.length ? 'New knowledge base' : 'My documents' });
      load();
    } catch (e) {
      toastError(e);
    }
  };
  /** Files dropped before there is any base: one is made for them. */
  const firstFiles = async (picked: PickedFile[]) => {
    try {
      const b = await post<KnowledgeBase>('/api/knowledge', { name: 'My documents' });
      await addFiles(b, picked);
      load();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Knowledge"
        sub="Your documents, for every agent to search and cite"
        actions={
          !!st?.bases.length && (
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => void newBase()}>
              <span className="max-sm:hidden">New knowledge base</span>
              <span className="sm:hidden">New</span>
            </Button>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[880px] space-y-5 px-3 py-5 sm:px-6">
          {!st ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !st.bases.length ? (
            <div className="space-y-4">
              <Empty icon={<Library size={22} />} title="Add your documents once">
                Contracts, manuals, notes, papers, a whole folder: every agent can then search them, by their words or by what they mean, and cites the file and page it read.
              </Empty>
              <DropFiles big onFiles={(p) => void firstFiles(p)} />
              <div className="text-center">
                <Button variant="ghost" icon={<FolderPlus size={14} />} onClick={() => void newBase()}>
                  Start with a folder on this computer instead
                </Button>
              </div>
            </div>
          ) : (
            <>
              <TrySearch />
              {!st.meaning && (
                <div className="rounded-lg bg-bg-2 px-3 py-2 text-[12.5px] text-fg-2">
                  Agents find passages by their words. To find them by what they mean too (in other words, or other languages), turn on search by meaning in{' '}
                  <button type="button" onClick={() => go('/settings?s=memory')} className="font-medium text-accent hover:underline">
                    Settings → Memory
                  </button>
                  ; it runs on this computer.
                </div>
              )}
              {st.bases.map((b) => (
                <BaseCard key={b.id} b={b} meaning={st.meaning} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

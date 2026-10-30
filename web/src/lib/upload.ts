// Chunked, cancellable uploads into the file tree (drag & drop, file and folder pickers).
import { create } from 'zustand';
import { post } from './api';
import { joinPath } from './format';
import { mu } from './machine';

const CHUNK = 32 * 1024 * 1024; // well under Cloudflare's 100 MB request limit

export interface PickedFile {
  file: File;
  rel: string;
}

export interface UploadItem {
  id: string;
  rel: string;
  dest: string;
  size: number;
  sent: number;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled' | 'skipped';
  error?: string;
}

export interface UploadBatch {
  id: string;
  dir: string;
  items: UploadItem[];
  status: 'checking' | 'conflict' | 'running' | 'done' | 'cancelled' | 'error';
  conflicts: string[];
  emptyDirs: string[];
  startedAt: number;
}

interface Store {
  batches: UploadBatch[];
  update: (id: string, fn: (b: UploadBatch) => UploadBatch) => void;
  dismiss: (id: string) => void;
}

export const useUploads = create<Store>((set) => ({
  batches: [],
  update: (id, fn) => set((s) => ({ batches: s.batches.map((b) => (b.id === id ? fn(b) : b)) })),
  dismiss: (id) => set((s) => ({ batches: s.batches.filter((b) => b.id !== id) })),
}));

const files = new Map<string, File>();
const controllers = new Map<string, { xhr: XMLHttpRequest | null; cancelled: boolean; overwrite: boolean; onDone?: () => void }>();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/** Must run synchronously inside the drop handler: entries are only readable during the event. */
export function entriesFromDrop(dt: DataTransfer): FileSystemEntry[] {
  const out: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const e = item.webkitGetAsEntry?.();
    if (e) out.push(e);
  }
  return out;
}

export async function walkEntries(entries: FileSystemEntry[]): Promise<{ files: PickedFile[]; emptyDirs: string[] }> {
  const out: PickedFile[] = [];
  const emptyDirs: string[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file: f, rel: prefix + f.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let total = 0;
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        total += batch.length;
        for (const e of batch) await walk(e, `${prefix}${entry.name}/`);
      }
      if (!total) emptyDirs.push(`${prefix}${entry.name}`);
    }
  };
  for (const e of entries) await walk(e, '');
  return { files: out, emptyDirs };
}

export function pickedFromInput(list: FileList): PickedFile[] {
  return Array.from(list).map((f) => ({ file: f, rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name }));
}

export async function startUpload(dir: string, picked: PickedFile[], emptyDirs: string[] = [], onDone?: () => void): Promise<void> {
  if (!picked.length && !emptyDirs.length) return;
  const id = rid();
  const items: UploadItem[] = picked.map((p) => {
    const itemId = rid();
    files.set(itemId, p.file);
    return { id: itemId, rel: p.rel, dest: joinPath(dir, p.rel), size: p.file.size, sent: 0, status: 'queued' };
  });
  const batch: UploadBatch = { id, dir, items, status: 'checking', conflicts: [], emptyDirs, startedAt: Date.now() };
  useUploads.setState((s) => ({ batches: [...s.batches, batch] }));
  controllers.set(id, { xhr: null, cancelled: false, overwrite: false, onDone });
  try {
    const { existing } = await post<{ existing: string[] }>('/api/fs/exists', { paths: items.map((i) => i.dest) });
    if (existing.length) {
      useUploads.getState().update(id, (b) => ({ ...b, status: 'conflict', conflicts: existing }));
      return;
    }
  } catch {
    // If the check fails, the server still refuses to overwrite.
  }
  run(id);
}

/** Answer for files that already exist: replace them, skip them, or cancel everything. */
export function resolveConflict(id: string, choice: 'replace' | 'skip' | 'cancel') {
  const c = controllers.get(id);
  if (!c) return;
  if (choice === 'cancel') return cancelUpload(id);
  if (choice === 'replace') c.overwrite = true;
  else {
    useUploads.getState().update(id, (b) => {
      const skip = new Set(b.conflicts);
      return { ...b, items: b.items.map((i) => (skip.has(i.dest) ? { ...i, status: 'skipped' } : i)) };
    });
  }
  run(id);
}

export function cancelUpload(id: string) {
  const c = controllers.get(id);
  if (c) {
    c.cancelled = true;
    c.xhr?.abort();
  }
  useUploads.getState().update(id, (b) => ({
    ...b,
    status: 'cancelled',
    items: b.items.map((i) => (i.status === 'queued' || i.status === 'uploading' ? { ...i, status: 'cancelled' } : i)),
  }));
}

function sendChunk(c: { xhr: XMLHttpRequest | null }, url: string, blob: Blob, onProgress: (n: number) => void): Promise<{ done: boolean; size: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    c.xhr = xhr;
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      c.xhr = null;
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.error ?? `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('cancelled'));
    xhr.send(blob);
  });
}

async function run(id: string) {
  const c = controllers.get(id)!;
  const store = useUploads.getState();
  store.update(id, (b) => ({ ...b, status: 'running' }));
  const batch = useUploads.getState().batches.find((b) => b.id === id)!;
  for (const d of batch.emptyDirs) await post('/api/fs/mkdir', { path: joinPath(batch.dir, d) }).catch(() => {});
  let failed = false;
  for (const item of batch.items) {
    if (c.cancelled) break;
    if (item.status === 'skipped') continue;
    const file = files.get(item.id)!;
    const setItem = (p: Partial<UploadItem>) =>
      useUploads.getState().update(id, (b) => ({ ...b, items: b.items.map((i) => (i.id === item.id ? { ...i, ...p } : i)) }));
    setItem({ status: 'uploading', sent: 0 });
    try {
      let offset = 0;
      do {
        const end = Math.min(file.size, offset + CHUNK);
        const final = end >= file.size;
        const q = new URLSearchParams({ path: item.dest, id: item.id, offset: String(offset), total: String(file.size), final: final ? '1' : '0', overwrite: c.overwrite ? '1' : '0' });
        const base = offset;
        await sendChunk(c, mu(`/api/fs/upload?${q}`), file.slice(offset, end), (n) => setItem({ sent: base + n }));
        offset = end;
        setItem({ sent: offset });
      } while (offset < file.size);
      setItem({ status: 'done', sent: file.size });
    } catch (e) {
      const msg = (e as Error).message;
      if (c.cancelled || msg === 'cancelled') {
        setItem({ status: 'cancelled' });
        fetch(mu(`/api/fs/upload?${new URLSearchParams({ path: item.dest, id: item.id })}`), { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
        break;
      }
      failed = true;
      setItem({ status: 'error', error: msg });
    } finally {
      files.delete(item.id);
    }
  }
  if (!c.cancelled) useUploads.getState().update(id, (b) => ({ ...b, status: failed ? 'error' : 'done' }));
  c.onDone?.();
  controllers.delete(id);
  // Finished batches fade out of the panel on their own.
  if (!failed && !c.cancelled) setTimeout(() => useUploads.getState().dismiss(id), 6000);
}

// Adding a plugin that does not come with the app: from a Git link (GitHub and the like), a .zip file, or a
// folder on this computer. It is looked at first (what it gives agents, what it needs, the plugins it brings
// along), then added; the job's steps show while its packages install. And a new plugin of your own.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileArchive, FolderOpen, Link2, Upload } from 'lucide-react';
import type { PluginJob, PluginPreview, PluginView } from '@shared/plugins';
import { post } from '../../lib/api';
import { toast, toastError, useApp } from '../../lib/store';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, Segmented, Throbber } from '../../components/ui';
import { JobView, PluginTile } from './parts';
import { PluginSummary } from './PluginDetail';

type From = 'link' | 'file' | 'folder';

const readBase64 = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(r.error ?? new Error('The file could not be read'));
    r.readAsDataURL(f);
  });

export function AddPluginDialog({
  from: initial,
  titles,
  jobs,
  onClose,
  onAdded,
}: {
  from: From;
  titles: Record<string, string>;
  jobs: Record<string, PluginJob>;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const home = useApp((s) => s.boot?.home) ?? '/';
  const [from, setFrom] = useState<From>(initial);
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [subdir, setSubdir] = useState('');
  const [more, setMore] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [folder, setFolder] = useState(home);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PluginPreview | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const job = jobId ? Object.values(jobs).find((j) => j.id === jobId) : undefined;
  useEffect(() => {
    if (job?.state === 'done' && preview) {
      toast(`${preview.view.title} is on for every agent`, 'ok');
      onAdded(preview.view.name);
    }
  }, [job?.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const look = async () => {
    setBusy(true);
    try {
      const body =
        from === 'link'
          ? { url: url.trim(), ref: ref.trim() || undefined, subdir: subdir.trim() || undefined }
          : from === 'file'
            ? { file: { name: file!.name, data: await readBase64(file!) } }
            : { path: folder };
      setPreview(await post<PluginPreview>('/api/plugins/inspect', body));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await post<{ job: PluginJob }>('/api/plugins/install', { token: preview.token });
      setJobId(r.job.id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const ready = from === 'link' ? !!url.trim() : from === 'file' ? !!file : !!folder;
  const p: PluginView | undefined = preview?.view;
  return (
    <Dialog
      open
      onClose={onClose}
      width={680}
      title={p ? `Add ${p.title}?` : 'Add a plugin'}
      footer={
        job ? (
          <Button onClick={onClose}>{job.state === 'running' ? 'Close: it carries on' : 'Close'}</Button>
        ) : preview ? (
          <>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={add} disabled={busy || !!preview.unavailable.length}>
              {busy ? <Throbber /> : preview.replaces ? 'Replace it' : 'Add'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={look} disabled={!ready || busy}>
              {busy ? <Throbber /> : 'Look at it'}
            </Button>
          </>
        )
      }
    >
      {job && p ? (
        <div className="space-y-3 pb-2">
          <JobView job={job} title={p.title} />
        </div>
      ) : preview && p ? (
        <div className="space-y-4 pb-2">
          <div className="flex items-start gap-3">
            <PluginTile p={p} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span translate="no" className="text-[15px] font-semibold">
                  {p.title}
                </span>
                {p.version && <span className="text-[12.5px] text-fg-3">{p.version}</span>}
                {p.author && <span className="text-[12.5px] text-fg-3" translate="no">by {p.author}</span>}
              </div>
              {p.description && (
                <p translate="no" className="mt-0.5 text-[13.5px] leading-relaxed text-fg-2">
                  {p.description}
                </p>
              )}
            </div>
          </div>
          {preview.unavailable.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-err/35 bg-err/5 px-3.5 py-2.5 text-[13px]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-err" />
              <span>It needs plugins this app does not have: {preview.unavailable.join(', ')}. Add those first.</span>
            </div>
          )}
          {preview.brings.length > 0 && <p className="text-[13px] text-fg-2">It needs {preview.brings.map((n) => titles[n] ?? n).join(', ')}, which come with the app: they are added first.</p>}
          {preview.replaces && <p className="text-[13px] text-warn">A plugin with this name is here already: adding replaces it (its data stays).</p>}
          <PluginSummary p={p} titles={titles} />
          <p className="flex items-start gap-2 rounded-xl bg-bg-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-fg-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
            Plugins run programs on this computer as you, and every agent gets their instructions. Add only plugins from people you trust.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <Segmented
            size="sm"
            value={from}
            onChange={setFrom}
            options={[
              { value: 'link', label: 'From a link', icon: <Link2 size={13} /> },
              { value: 'file', label: 'From a file', icon: <FileArchive size={13} /> },
              { value: 'folder', label: 'From a folder', icon: <FolderOpen size={13} /> },
            ]}
          />
          {from === 'link' ? (
            <div className="space-y-2">
              <input className={cx(inputCls, 'font-mono text-[13px]')} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ready && look()} placeholder="owner/repo, or https://github.com/owner/repo" autoFocus spellCheck={false} />
              <p className="text-[12px] leading-snug text-fg-3">A Git repository holding a plugin (its plugin.json), or a link to its folder on GitHub. Plugins made for Claude Code work too.</p>
              {more ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input className={cx(inputCls, 'font-mono text-[13px]')} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Branch or tag (optional)" spellCheck={false} />
                  <input className={cx(inputCls, 'font-mono text-[13px]')} value={subdir} onChange={(e) => setSubdir(e.target.value)} placeholder="Folder inside it (optional)" spellCheck={false} />
                </div>
              ) : (
                <button type="button" onClick={() => setMore(true)} className="text-[12.5px] text-fg-3 hover:text-fg hover:underline">
                  A branch, or a folder inside the repository…
                </button>
              )}
            </div>
          ) : from === 'file' ? (
            <div>
              <button
                type="button"
                onClick={() => pick.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) setFile(f);
                }}
                className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[13px] text-fg-2 hover:bg-bg-1"
              >
                <Upload size={18} className="text-fg-3" />
                {file ? <span translate="no">{file.name}</span> : 'Choose or drop a plugin’s .zip'}
              </button>
              <input ref={pick} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <p className="mt-2 text-[12px] leading-snug text-fg-3">A plugin packed with Pack into a .zip, here or on another computer.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-fg-3">Folder</span>
                <FolderChip value={folder} onChange={setFolder} />
              </div>
              <p className="text-[12px] leading-snug text-fg-3">The plugin is used where it is: changes you make in its folder reach new sessions. Good for a plugin you are making.</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** A new plugin of your own: a name, then its editor. */
export function NewPluginDialog({ onClose, onMade }: { onClose: () => void; onMade: (name: string) => void }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const name = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const make = async () => {
    if (!name || busy) return;
    setBusy(true);
    try {
      await post<{ plugin: PluginView }>('/api/plugins/new', { name, title: title.trim(), description: desc.trim() });
      onMade(name);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      width={520}
      title="Make a plugin"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={make} disabled={!name || busy}>
            {busy ? <Throbber /> : 'Make it'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-1">
        <p className="text-[13px] leading-relaxed text-fg-2">
          A plugin bundles skills, tools and instructions, with what they need, so every agent gets them, and you can pack it into a .zip to share. Give it a name; you add what it holds next.
        </p>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">Name</span>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} placeholder="Trip tools" autoFocus />
          {name && name !== title && <span className="mt-1 block text-[11.5px] text-fg-3">Its id: {name}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">What it is for</span>
          <textarea className={cx(inputCls, 'h-20 resize-y py-2')} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Skills and tools for planning trips: packing lists, budgets, visas" />
        </label>
      </div>
    </Dialog>
  );
}

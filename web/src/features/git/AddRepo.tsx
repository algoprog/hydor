// Adding a repository to the Git page: a folder on this computer (a folder with none can start one), or a
// clone from a link (https, ssh or git@host:…) into a folder of its own, its progress shown as it comes. What
// is added stays on the list until you remove it.
import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Link2, Plus } from 'lucide-react';
import type { GitCloneJob, GitRepo } from '@shared/types';
import { api, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { toast, toastError, useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, inputCls, MenuItem, Popover } from '../../components/ui';
import { FailureBox } from './parts';

/** A clone's folder name from its address: …/shop-api.git → shop-api. */
const cloneName = (url: string) => (url.trim().replace(/[/\\]+$/, '').split(/[/:]/).pop() ?? '').replace(/\.git$/i, '') || 'repository';
/** The addresses a clone takes (the server checks again): https, ssh, git, or git@host:path. */
const urlOk = (u: string) => {
  const t = u.trim();
  if (!t || t.startsWith('-') || /\s/.test(t) || t.includes('::')) return false;
  return /^(https|ssh|git):\/\/[^/@\s]+(@[^/\s]+)?(:\d+)?\/.+/i.test(t) || /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:(?!\/\/)\S+$/.test(t);
};
const expand = (p: string, home: string) => (p === '~' ? home : p.startsWith('~/') ? home + p.slice(1) : p).replace(/(.)\/+$/, '$1');
/** What git is doing, in plain words. */
const PHASES: [RegExp, string][] = [
  [/Receiving/, 'Downloading'],
  [/Resolving/, 'Unpacking'],
  [/Updating files|Checking out/, 'Writing the files'],
  [/Counting|Compressing|Enumerating/, 'Getting ready on the remote'],
];
const phaseText = (j: GitCloneJob) => (j.phase ? (PHASES.find(([re]) => re.test(j.phase!))?.[1] ?? j.phase) : 'Starting');

/**
 * The Add button (a menu of the two ways), or (`buttons`) the two ways side by side, as an empty list shows
 * them. `onAdded` gets each repository added.
 */
export function AddRepo({ onAdded, compact, buttons }: { onAdded: (r: GitRepo) => void; compact?: boolean; buttons?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [dlg, setDlg] = useState<'folder' | 'clone' | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const dialogs = (
    <>
      <AddFolderDialog open={dlg === 'folder'} onClose={() => setDlg(null)} onAdded={onAdded} />
      <CloneDialog open={dlg === 'clone'} onClose={() => setDlg(null)} onAdded={onAdded} />
    </>
  );
  if (buttons)
    return (
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="secondary" icon={<FolderPlus size={14} />} onClick={() => setDlg('folder')}>
          Add a folder on this computer
        </Button>
        <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => setDlg('clone')}>
          Clone from a link
        </Button>
        {dialogs}
      </div>
    );
  return (
    <>
      <Button ref={ref} size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => setMenu((o) => !o)} title="Add a repository" aria-label="Add a repository" className={cx(compact && 'px-2')}>
        {!compact && 'Add'}
      </Button>
      <Popover anchor={ref} open={menu} onClose={() => setMenu(false)} align="end" width={270} title="Add a repository">
        <MenuItem icon={<FolderPlus size={14} />} onClick={() => (setMenu(false), setDlg('folder'))}>
          Add a folder on this computer
        </MenuItem>
        <MenuItem icon={<Link2 size={14} />} onClick={() => (setMenu(false), setDlg('clone'))}>
          Clone from a link
        </MenuItem>
      </Popover>
      {dialogs}
    </>
  );
}

function AddFolderDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (r: GitRepo) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [dir, setDir] = useState('');
  const [notRepo, setNotRepo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDir('');
      setNotRepo(null);
    }
  }, [open]);
  const add = async (init: boolean, p = dir) => {
    const path = expand(p.trim(), home);
    if (!path) return;
    setBusy(true);
    try {
      const r = await post<{ repo?: GitRepo; notRepo?: boolean; path: string }>('/api/git/repos', { path, init });
      if (r.notRepo) setNotRepo(r.path);
      else if (r.repo) {
        onAdded(r.repo);
        onClose();
        toast(init ? `Started a repository in ${r.repo.name}` : `Added ${r.repo.name}`, 'ok');
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a folder on this computer"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {notRepo ? (
            <Button variant="primary" disabled={busy} onClick={() => add(true, notRepo)} title="git init">
              {busy ? 'Starting…' : 'Start a repository here'}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || !dir.trim()} onClick={() => add(false)}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          )}
        </>
      }
    >
      {notRepo ? (
        // Above the field: its suggestions open below it.
        <div className="mb-3 rounded-xl bg-bg-1 px-3 py-2.5 text-[13px] leading-relaxed text-fg-2">
          <div>This folder isn’t a git repository yet. Start one there, and git keeps its history from your first commit.</div>
          <div translate="no" className="mt-1 truncate font-mono text-[12.5px] text-fg-3">
            {tildify(notRepo, home)}
          </div>
        </div>
      ) : (
        <p className="mb-3 text-[13px] leading-relaxed text-fg-3">A project’s folder: its repository joins the list. A folder git doesn’t keep yet can start a repository of its own.</p>
      )}
      <FolderPicker
        value={dir}
        onChange={(v) => {
          setDir(v);
          setNotRepo(null);
        }}
        onPick={(p) => void add(false, p)}
        autoFocus
      />
    </Dialog>
  );
}

function CloneDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (r: GitRepo) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const [url, setUrl] = useState('');
  const [dest, setDest] = useState('');
  const [touched, setTouched] = useState(false);
  const [base, setBase] = useState('~');
  const [job, setJob] = useState<GitCloneJob | null>(null);
  const [busy, setBusy] = useState(false);
  const added = useRef(onAdded);
  added.current = onAdded;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const running = job?.state === 'running';
  // Clones go in ~/code when there is one.
  useEffect(() => {
    if (!open || running) return;
    setUrl('');
    setDest('');
    setTouched(false);
    setJob(null);
    api<{ exists: boolean; dir?: boolean }>(`/api/fs/stat?path=${encodeURIComponent('~/code')}`).then(
      (s) => setBase(s.exists && s.dir ? '~/code' : '~'),
      () => {},
    );
  }, [open]);
  useEffect(() => {
    if (!touched) setDest(url.trim() ? `${base}/${cloneName(url)}` : '');
  }, [url, base, touched]);
  // How it goes, until it is done; it carries on (and joins the list) with the dialog closed.
  useEffect(() => {
    if (!job || job.state !== 'running') return;
    const t = window.setInterval(async () => {
      try {
        const j = await api<GitCloneJob>(`/api/git/clone/${job.id}`);
        setJob(j);
        if (j.state === 'done' && j.repo) {
          added.current(j.repo);
          toast(`Cloned ${j.repo.name}`, 'ok');
          closeRef.current();
        }
      } catch {}
    }, 700);
    return () => clearInterval(t);
  }, [job?.id, job?.state]);
  const start = async () => {
    setBusy(true);
    try {
      setJob(await post<GitCloneJob>('/api/git/clone', { url: url.trim(), dest: expand(dest.trim(), home) }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const ok = urlOk(url) && !!dest.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Clone from a link"
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {running ? 'Close (it carries on)' : 'Cancel'}
          </Button>
          <Button variant="primary" disabled={!ok || busy || running} onClick={start}>
            {running ? 'Cloning…' : job?.state === 'failed' ? 'Try again' : 'Clone'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">A copy of a repository from GitHub, GitLab or any git server, with its whole history, in a folder on this computer.</p>
      <label className="mb-1 block text-[12.5px] font-medium text-fg-2">Link</label>
      <input
        autoFocus
        value={url}
        disabled={running}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && ok && !running && void start()}
        placeholder="https://github.com/owner/project.git"
        aria-label="Link"
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cx(inputCls, 'font-mono text-[13px]')}
      />
      {url.trim() && !urlOk(url) && <div className="mt-1.5 text-[12px] text-warn">Use an https://, ssh:// or git@host:owner/project address.</div>}
      <label className="mt-3 mb-1 block text-[12.5px] font-medium text-fg-2">Where it goes</label>
      {running ? (
        <div translate="no" className="rounded-[10px] bg-bg-1 px-3 py-2 font-mono text-[13px] text-fg-2">
          {tildify(job!.dest, home)}
        </div>
      ) : (
        <FolderPicker
          value={dest}
          onChange={(v) => {
            setDest(v);
            setTouched(true);
          }}
        />
      )}
      <p className="mt-1.5 text-[12px] text-fg-3">A folder that doesn’t exist yet, or an empty one.</p>
      {job && job.state !== 'failed' && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-fg-2">
            <span>{phaseText(job)}</span>
            {job.percent != null && <span className="tnum text-fg-3">{job.percent}%</span>}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${job.percent ?? 4}%` }} />
          </div>
        </div>
      )}
      {job?.state === 'failed' && <FailureBox className="mt-4" title="The clone didn’t go through" output={job.output ?? ''} onClose={() => setJob(null)} />}
    </Dialog>
  );
}

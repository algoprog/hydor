// The repository's header controls. Sync: one button that gets what is new on the remote, brings it in and
// sends your commits up (Publish branch when the remote doesn't have the branch yet); when both sides moved on
// it asks how to put them together, in plain words. The line saying where the branch stands. And the ⋯ menu:
// fetch, pull or push alone, a terminal, the folder in Files, the path, the remotes, tags, and taking a
// repository you added off the list.
import { useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpFromLine, Check, Copy, Ellipsis, FolderOpen, GitMerge, Globe, Layers, Plus, SquareTerminal, Tag, Upload, X } from 'lucide-react';
import type { GitActionResult, GitRepoDetail, GitSyncResult } from '@shared/types';
import { del, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toastError } from '../../lib/store';
import { RefreshIcon } from '../../components/RefreshIcon';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Throbber, type useConfirm } from '../../components/ui';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { goFolder } from '../files/actions';
import { commits, copyText } from './parts';

type Apply = (r: GitActionResult, what: string, ok?: string) => boolean;
type Busy = 'sync' | 'fetch' | 'pull' | 'push' | 'publish' | null;

export interface SyncApi {
  busy: Busy;
  sync: (mode?: 'rebase' | 'merge') => Promise<void>;
  pull: (mode?: 'rebase' | 'merge') => Promise<void>;
  fetch: () => Promise<void>;
  push: () => Promise<void>;
  publish: () => Promise<void>;
  /** The question asked when both sides moved on. */
  node: ReactNode;
}

/** Sync and its parts, with the question for diverged branches. */
export function useSync(repo: GitRepoDetail | null, apply: Apply, onBusy: (b: boolean) => void): SyncApi {
  const [busy, setBusy] = useState<Busy>(null);
  const [diverged, setDiverged] = useState<{ ahead: number; behind: number; then: 'sync' | 'pull' } | null>(null);
  const run = async (kind: Exclude<Busy, null>, url: string, body: Record<string, unknown>, what: string, ok: (r: GitSyncResult) => string) => {
    if (!repo) return;
    setBusy(kind);
    onBusy(true);
    try {
      const r = await post<GitSyncResult>(url, { path: repo.path, ...body });
      if (r.diverged) {
        apply({ ...r, ok: true }, what);
        setDiverged({ ...r.diverged, then: kind === 'pull' ? 'pull' : 'sync' });
        return;
      }
      apply(r, what, r.ok ? ok(r) : undefined);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      onBusy(false);
    }
  };
  const synced = (r: GitSyncResult) => {
    if (r.published) return `Published ${r.repo.branch}`;
    const p = r.pulled ?? 0;
    const s = r.pushed ?? 0;
    if (p && s) return `Pulled ${commits(p)} and pushed ${commits(s)}`;
    if (p) return `Pulled ${commits(p)}`;
    if (s) return `Pushed ${commits(s)}`;
    return 'Up to date';
  };
  const api: SyncApi = {
    busy,
    sync: (mode) => run('sync', '/api/git/sync', { mode }, 'Sync', synced),
    pull: (mode) => run('pull', '/api/git/pull', { mode }, 'Pull', (r) => (r.pulled ? `Pulled ${commits(r.pulled)}` : 'Nothing to pull')),
    fetch: () => run('fetch', '/api/git/fetch', {}, 'Fetch', (r) => (r.repo.behind ? `Fetched · ${commits(r.repo.behind)} to pull` : 'Fetched · nothing to pull')),
    push: () => run('push', '/api/git/push', {}, 'Push', () => `Pushed ${commits(repo?.ahead ?? 0)}`),
    publish: () => run('publish', '/api/git/push', { publish: true }, 'Publish', (r) => `Published ${r.repo.branch}`),
    node: null,
  };
  const choose = (mode: 'rebase' | 'merge') => {
    const then = diverged?.then;
    setDiverged(null);
    void (then === 'pull' ? api.pull(mode) : api.sync(mode));
  };
  api.node = repo && diverged && (
    <Dialog open onClose={() => setDiverged(null)} title="Both sides have new commits" width={480} footer={<Button variant="ghost" onClick={() => setDiverged(null)}>Cancel</Button>}>
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        {diverged.then === 'sync'
          ? `${repo.branch} has ${commits(diverged.ahead)} that ${repo.upstream} doesn’t, and ${repo.upstream} has ${commits(diverged.behind)} that ${repo.branch} doesn’t. Put them together, and Sync then sends yours up:`
          : `${repo.branch} has ${commits(diverged.ahead)} that ${repo.upstream} doesn’t, and ${repo.upstream} has ${commits(diverged.behind)} that ${repo.branch} doesn’t. Put them together:`}
      </p>
      <div className="mt-3 space-y-2">
        <Choice icon={<Layers size={16} />} title="Put my commits on top" hint="git rebase" onClick={() => choose('rebase')}>
          {diverged.ahead === 1
            ? 'Your commit goes after theirs, as if you had made it later: one straight line of history.'
            : `Your ${diverged.ahead} commits go after theirs, as if you had made them later: one straight line of history.`}
        </Choice>
        <Choice icon={<GitMerge size={16} />} title="Merge" hint="git merge" onClick={() => choose('merge')}>
          A merge commit joins the two lines; every commit stays as it was.
        </Choice>
      </div>
      <p className="mt-3 text-[12.5px] text-fg-3">If both changed the same lines, it stops so you can settle them.</p>
    </Dialog>
  );
  return api;
}

function Choice({ icon, title, hint, children, onClick }: { icon: ReactNode; title: string; hint: string; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} title={hint} className="flex w-full items-start gap-3 rounded-xl border border-line-2 bg-bg-1 px-3.5 py-3 text-left transition-colors hover:border-accent/60 hover:bg-bg-2">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{children}</span>
      </span>
    </button>
  );
}

/** One button for the remote: Sync, or Publish branch when the remote doesn't have it yet. */
export function SyncButton({ repo, sync }: { repo: GitRepoDetail; sync: SyncApi }) {
  if (!repo.remote || !repo.branch) return null;
  if (!repo.upstream)
    return (
      <Button size="sm" variant="primary" icon={sync.busy === 'publish' ? <Throbber /> : <Upload size={14} />} disabled={!!sync.busy || !!repo.op} onClick={() => sync.publish()} title={`Put ${repo.branch} on ${repo.remote}, and keep it in step from now on`}>
        {sync.busy === 'publish' ? 'Publishing…' : 'Publish branch'}
      </Button>
    );
  const work = repo.ahead > 0 || repo.behind > 0;
  const up = repo.upstream;
  const title = repo.op
    ? 'Finish or stop the merge first'
    : repo.behind && repo.ahead
      ? `Bring in ${commits(repo.behind)} from ${up}, then send up ${commits(repo.ahead)}`
      : repo.behind
        ? `Bring in ${commits(repo.behind)} from ${up}`
        : repo.ahead
          ? `Send up ${commits(repo.ahead)} to ${up}`
          : `Look for anything new on ${up}`;
  return (
    <Button size="sm" variant={work ? 'primary' : 'secondary'} icon={<RefreshIcon size={14} busy={sync.busy === 'sync'} />} disabled={!!sync.busy || !!repo.op} onClick={() => sync.sync()} title={title}>
      {sync.busy === 'sync' ? 'Syncing…' : 'Sync'}
      {sync.busy !== 'sync' && repo.ahead > 0 && (
        <span className="tnum -mr-0.5 inline-flex items-center text-[12px] opacity-90">
          <ArrowUp size={12} />
          {repo.ahead}
        </span>
      )}
      {sync.busy !== 'sync' && repo.behind > 0 && (
        <span className="tnum -mr-0.5 inline-flex items-center text-[12px] opacity-90">
          <ArrowDown size={12} />
          {repo.behind}
        </span>
      )}
    </Button>
  );
}

/** Where the branch stands: "2 to push · 1 to pull · fetched 5m ago", "Not on the remote yet", "No remote". */
export function Standing({ repo, onRemotes }: { repo: GitRepoDetail; onRemotes: () => void }) {
  const dot = <span className="text-fg-3/50">·</span>;
  let body: ReactNode;
  if (!repo.remote)
    body = (
      <>
        <span>No remote</span>
        {dot}
        <button onClick={onRemotes} className="text-accent hover:underline">
          Add one
        </button>
      </>
    );
  else if (!repo.branch) body = <span>Not on a branch</span>;
  else if (!repo.upstream) body = <span>{repo.upstreamGone ? 'Not on the remote any more' : 'Not on the remote yet'}</span>;
  else
    body = (
      <>
        {repo.ahead > 0 && <span className="text-accent">{repo.ahead} to push</span>}
        {repo.ahead > 0 && repo.behind > 0 && dot}
        {repo.behind > 0 && <span className="text-warn">{repo.behind} to pull</span>}
        {!repo.ahead && !repo.behind && (
          <span className="inline-flex items-center gap-1 text-ok">
            <Check size={12} />
            Up to date
          </span>
        )}
        {dot}
        <span>{repo.fetchedAt ? `fetched ${ago(repo.fetchedAt)}` : 'never fetched'}</span>
      </>
    );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-3" title={repo.upstream ? `Tracks ${repo.upstream}` : undefined}>
      {body}
    </div>
  );
}

/** The ⋯ menu: the rest of what can be done with the repository as a whole. */
export function RepoMenu({
  repo,
  apply,
  sync,
  confirm,
  onRemotes,
  onRemoved,
}: {
  repo: GitRepoDetail;
  apply: Apply;
  sync: SyncApi;
  confirm: ReturnType<typeof useConfirm>[0];
  onRemotes: () => void;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const pushTags = async () => {
    close();
    try {
      apply(await post<GitActionResult>('/api/git/push-tags', { path: repo.path }), 'Push tags', 'Pushed the tags');
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    close();
    if (!(await confirm({ title: `Remove ${repo.name} from the list?`, body: 'Its folder stays as it is. You can add it again any time.', confirm: 'Remove' }))) return;
    try {
      await del(`/api/git/repos?path=${encodeURIComponent(repo.path)}`);
      onRemoved();
    } catch (e) {
      toastError(e);
    }
  };
  const canNet = !!repo.remote && !repo.op;
  return (
    <>
      <IconButton ref={ref} label="More" onClick={() => setOpen((o) => !o)} active={open}>
        <Ellipsis size={17} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={268} title={repo.name}>
        <MenuItem icon={<RefreshIcon size={14} />} hint={repo.fetchedAt ? ago(repo.fetchedAt) : undefined} disabled={!canNet || !!sync.busy} onClick={() => (close(), void sync.fetch())}>
          Fetch
        </MenuItem>
        <MenuItem icon={<ArrowDownToLine size={14} />} hint={repo.behind ? String(repo.behind) : undefined} disabled={!canNet || !repo.upstream || !!sync.busy} onClick={() => (close(), void sync.pull())}>
          Pull
        </MenuItem>
        <MenuItem icon={<ArrowUpFromLine size={14} />} hint={repo.ahead ? String(repo.ahead) : undefined} disabled={!canNet || !repo.upstream || !repo.ahead || !!sync.busy} onClick={() => (close(), void sync.push())}>
          Push
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<SquareTerminal size={14} />} onClick={() => (close(), void openTerminalAt(repo.path))}>
          Open a terminal here
        </MenuItem>
        <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), goFolder(repo.path))}>
          Show in Files
        </MenuItem>
        <MenuItem icon={<Copy size={14} />} onClick={() => (close(), copyText(repo.path, 'Copied the path'))}>
          Copy path
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Globe size={14} />} hint={repo.remotes.length ? String(repo.remotes.length) : 'none'} onClick={() => (close(), onRemotes())}>
          Remotes
        </MenuItem>
        {repo.tags > 0 && repo.remote && (
          <MenuItem icon={<Tag size={14} />} hint={String(repo.tags)} disabled={!!sync.busy} onClick={pushTags}>
            Push tags
          </MenuItem>
        )}
        {repo.manual && !repo.sessions && (
          <MenuItem icon={<X size={14} />} onClick={remove}>
            Remove from the list
          </MenuItem>
        )}
      </Popover>
    </>
  );
}

/** The remotes: each with its address; add one (the first is called origin). */
export function RemotesDialog({ repo, apply, open, onClose }: { repo: GitRepoDetail; apply: Apply; open: boolean; onClose: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const form = adding || !repo.remotes.length;
  const add = async () => {
    setBusy(true);
    try {
      const ok = apply(await post<GitActionResult>('/api/git/remote', { path: repo.path, name: name.trim() || (repo.remotes.length ? '' : 'origin'), url: url.trim() }), 'Add a remote', `Added ${name.trim() || 'origin'}`);
      if (ok) {
        setAdding(false);
        setName('');
        setUrl('');
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
      title="Remotes"
      width={520}
      footer={
        form ? (
          <>
            <Button variant="ghost" onClick={() => (repo.remotes.length ? setAdding(false) : onClose())}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || !url.trim() || (repo.remotes.length > 0 && !name.trim())} onClick={add}>
              {busy ? 'Adding…' : 'Add remote'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <p className="text-[13px] text-fg-3">A remote is where the repository is shared, such as GitHub: Sync gets and sends commits there.</p>
      {repo.remotes.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line">
          {repo.remotes.map((r, i) => (
            <div key={r.name} className={cx('flex items-center gap-3 px-3 py-2', i > 0 && 'border-t border-line')}>
              <Globe size={14} className="shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1">
                <span translate="no" className="block text-[13.5px] font-medium">
                  {r.name}
                </span>
                <span translate="no" className="block truncate font-mono text-[12px] text-fg-3" title={r.url}>
                  {r.url}
                </span>
              </span>
              <IconButton label="Copy the address" size="sm" onClick={() => copyText(r.url, 'Copied the address')}>
                <Copy size={13} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      {form ? (
        <div className="mt-3 space-y-2">
          {repo.remotes.length > 0 && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (such as upstream)" aria-label="Name" className={inputCls} autoFocus />}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && url.trim() && void add()}
            placeholder="https://github.com/you/project.git or git@github.com:you/project.git"
            aria-label="Address"
            spellCheck={false}
            autoCapitalize="none"
            className={cx(inputCls, 'font-mono text-[13px]')}
            autoFocus={!repo.remotes.length}
          />
          {!repo.remotes.length && <p className="text-[12.5px] text-fg-3">It is added as origin. Then Publish branch puts your branch there.</p>}
        </div>
      ) : (
        <Button size="sm" variant="ghost" icon={<Plus size={13} />} className="mt-2" onClick={() => setAdding(true)}>
          Add a remote
        </Button>
      )}
    </Dialog>
  );
}

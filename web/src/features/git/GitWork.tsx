// Working on a repository from the Git page: the branch menu (switch, create, clean up), the changes
// with their diffs and a commit box (a message can be drafted from the diff), stashes, and commits that
// open to show what they changed.
import { useEffect, useRef, useState } from 'react';
import { Archive, Check, ChevronRight, FileText, GitBranch, Plus, Sparkles, Trash2, Undo2 } from 'lucide-react';
import type { GitActionResult, GitBranch as Branch, GitCommit, GitCommitDetail, GitFileStatus, GitRepoDetail, GitStash } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, IconButton, inputCls, Popover, Throbber, useConfirm } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';

type Apply = (r: GitActionResult, action: string, ok?: string) => void;
const q = (path: string) => `path=${encodeURIComponent(path)}`;

// ---- branches ------------------------------------------------------------------------------------

export function BranchMenu({ repo, apply }: { repo: GitRepoDetail; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Branch[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) api<{ branches: Branch[] }>(`/api/git/branches?${q(repo.path)}`).then((r) => setList(r.branches), toastError);
  }, [open, repo.path, repo.branch]);
  const act = async (url: string, body: Record<string, unknown>, label: string, ok: string) => {
    setBusy(true);
    try {
      apply(await post<GitActionResult>(url, { path: repo.path, ...body }), label, ok);
      setOpen(false);
      setName('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const switchTo = async (b: string) => {
    if (repo.changed > 0 && !(await confirm({ title: `Switch to ${b}?`, body: 'Your uncommitted changes come along to it. If they clash with that branch, git refuses and nothing changes.', confirm: 'Switch' }))) return;
    void act('/api/git/switch', { branch: b }, 'Switch', `On ${b}`);
  };
  const remove = async (b: Branch) => {
    if (!(await confirm({ title: `Delete ${b.name}?`, body: 'It is merged into the current branch, so no commit is lost.', confirm: 'Delete', danger: true }))) return;
    void act('/api/git/branch-delete', { branch: b.name }, 'Delete branch', `Deleted ${b.name}`);
  };
  return (
    <>
      {confirmNode}
      <button ref={ref} onClick={() => setOpen((o) => !o)} className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-bg-2 px-2.5 font-medium transition-colors hover:bg-bg-3" title="Branches: switch, create, clean up">
        <GitBranch size={14} className="text-fg-3" />
        {repo.branch ?? 'detached HEAD'}
        <ChevronRight size={13} className={cx('text-fg-3 transition-transform', open ? '-rotate-90' : 'rotate-90')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320}>
        <form
          className="flex gap-1.5 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void act('/api/git/switch', { branch: name.trim(), create: true }, 'New branch', `On ${name.trim()}`);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New branch from here" className={cx(inputCls, 'h-8 min-w-0 flex-1 text-[13px]')} />
          <Button type="submit" size="sm" variant="secondary" disabled={!name.trim() || busy} icon={<Plus size={13} />}>
            Create
          </Button>
        </form>
        <div className="max-h-[50vh] overflow-y-auto">
          {!list && (
            <div className="flex justify-center py-3 text-fg-3">
              <Throbber />
            </div>
          )}
          {list?.map((b) => (
            <div key={b.name} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-2">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" disabled={busy || b.name === repo.branch} onClick={() => switchTo(b.name)}>
                <span className="w-3.5 shrink-0">{b.name === repo.branch && <Check size={14} className="text-accent" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{b.name}</span>
                  <span className="block truncate text-[11.5px] text-fg-3">
                    {timeAgo(b.ts)}
                    {b.track ? ` · ${b.track}` : ''}
                    {b.merged ? ' · merged' : ''}
                  </span>
                </span>
              </button>
              {b.merged && (
                <IconButton label={`Delete ${b.name}`} size="sm" onClick={() => remove(b)}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}

// ---- changes and committing ----------------------------------------------------------------------

const LABEL: Record<string, [string, string]> = {
  '??': ['New', 'text-add'],
  A: ['Added', 'text-add'],
  M: ['Modified', 'text-warn'],
  D: ['Deleted', 'text-del'],
  R: ['Renamed', 'text-info'],
  C: ['Copied', 'text-info'],
  U: ['Conflict', 'text-err'],
};
const label = (code: string) => (code === '??' ? LABEL['??'] : (LABEL[code.replace(/\./g, '')[0] ?? 'M'] ?? LABEL.M));
/** The paths a change touches (a rename: both). */
const paths = (f: GitFileStatus) => (f.from ? [f.from, f.path] : [f.path]);

function FileRow({ repo, f, picked, onPick, apply }: { repo: GitRepoDetail; f: GitFileStatus; picked: boolean; onPick: (v: boolean) => void; apply: Apply }) {
  const [open, setOpen] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const [text, tone] = label(f.code);
  useEffect(() => {
    if (open && diff == null) api<{ diff: string }>(`/api/git/diff?${q(repo.path)}&file=${encodeURIComponent(f.path)}`).then((r) => setDiff(r.diff), (e) => setDiff(`(${e.message})`));
  }, [open, diff, repo.path, f.path]);
  const discard = async () => {
    const isNew = f.code === '??';
    if (!(await confirm({ title: `${isNew ? 'Delete' : 'Discard changes to'} ${f.path}?`, body: isNew ? 'The new file is deleted. This cannot be undone.' : 'It goes back to how it was in the last commit. This cannot be undone.', confirm: isNew ? 'Delete' : 'Discard', danger: true })))
      return;
    try {
      apply(await post<GitActionResult>('/api/git/discard', { path: repo.path, file: f.path }), 'Discard', `${isNew ? 'Deleted' : 'Discarded changes to'} ${f.path}`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div>
      {confirmNode}
      <div className="flex items-center gap-2.5 px-3 py-1.5 max-md:py-2">
        <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} className="size-4 shrink-0 accent-[var(--accent)]" aria-label={`Include ${f.path}`} />
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
          <span className={cx('w-16 shrink-0 text-[12px]', tone)}>{text}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={f.path}>
            {f.from ? `${f.from} → ` : ''}
            {f.path}
          </span>
        </button>
        <IconButton label="Open the file" size="sm" onClick={() => openFile(`${repo.path}/${f.path}`)}>
          <FileText size={13} />
        </IconButton>
        <IconButton label={f.code === '??' ? 'Delete the new file' : 'Discard the changes'} size="sm" onClick={discard}>
          <Undo2 size={13} />
        </IconButton>
      </div>
      {open && (
        <div className="anim-expand border-t border-line bg-bg-1">
          {diff == null ? (
            <div className="flex justify-center py-3 text-fg-3">
              <Throbber />
            </div>
          ) : (
            <DiffView diff={diff} className="max-h-[60vh] overflow-auto text-[12px]" />
          )}
        </div>
      )}
    </div>
  );
}

export function Changes({ repo, apply }: { repo: GitRepoDetail; apply: Apply }) {
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const files = repo.files;
  const picked = files.filter((f) => !skip.has(f.path));
  const shown = all ? files : files.slice(0, 60);
  const chosen = picked.flatMap(paths);
  const draft = async () => {
    setBusy('message');
    try {
      setMessage((await post<{ message: string }>('/api/git/message', { path: repo.path, files: chosen })).message);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const commit = async (push: boolean) => {
    setBusy(push ? 'push' : 'commit');
    try {
      const r = await post<GitActionResult>('/api/git/commit', { path: repo.path, files: chosen, message, push });
      apply(r, push ? 'Commit and push' : 'Commit', `Committed ${picked.length === 1 ? picked[0].path : `${picked.length} files`}${push ? ' and pushed' : ''}`);
      if (r.ok) setMessage('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  if (!files.length) return <div className="px-1 py-2 text-[13px] text-fg-3">The working tree is clean.</div>;
  return (
    <div className="space-y-3">
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        <div className="flex items-center gap-2.5 bg-bg-1 px-3 py-1.5 text-[12px] text-fg-3">
          <input
            type="checkbox"
            checked={!skip.size}
            ref={(el) => {
              if (el) el.indeterminate = skip.size > 0 && skip.size < files.length;
            }}
            onChange={(e) => setSkip(e.target.checked ? new Set() : new Set(files.map((f) => f.path)))}
            className="size-4 accent-[var(--accent)]"
            aria-label="Include every file"
          />
          {picked.length} of {files.length} in the commit
        </div>
        {shown.map((f) => (
          <FileRow
            key={f.code + f.path}
            repo={repo}
            f={f}
            picked={!skip.has(f.path)}
            onPick={(v) =>
              setSkip((s) => {
                const n = new Set(s);
                if (v) n.delete(f.path);
                else n.add(f.path);
                return n;
              })
            }
            apply={apply}
          />
        ))}
        {files.length > shown.length && (
          <button onClick={() => setAll(true)} className="w-full px-3 py-2 text-left text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg-2">
            Show all {files.length.toLocaleString()} files
          </button>
        )}
      </div>
      <div className="rounded-xl border border-line bg-bg-1 p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={message.split('\n').length > 2 ? 5 : 2}
          placeholder="Commit message"
          className="w-full resize-y bg-transparent px-1.5 py-1 text-[13.5px] outline-none placeholder:text-fg-3"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" icon={busy === 'message' ? <Throbber /> : <Sparkles size={13} />} disabled={!!busy || !picked.length} onClick={draft} title="Draft a message from the changes picked">
            Write message
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!!busy || !picked.length || !message.trim()} onClick={() => commit(false)}>
            {busy === 'commit' ? 'Committing…' : 'Commit'}
          </Button>
          {repo.remote && (
            <Button size="sm" variant="primary" disabled={!!busy || !picked.length || !message.trim()} onClick={() => commit(true)}>
              {busy === 'push' ? 'Pushing…' : 'Commit & push'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Puts every change aside (new files too) in a stash. */
export function StashButton({ repo, apply }: { repo: GitRepoDetail; apply: Apply }) {
  const [busy, setBusy] = useState(false);
  if (!repo.files.length) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={busy ? <Throbber /> : <Archive size={13} />}
      disabled={busy}
      title="Put every change aside, to apply again later"
      onClick={async () => {
        setBusy(true);
        try {
          apply(await post<GitActionResult>('/api/git/stash', { path: repo.path, message: '' }), 'Stash', 'Stashed the changes');
        } catch (e) {
          toastError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      Stash
    </Button>
  );
}

export function Stashes({ repo, apply }: { repo: GitRepoDetail; apply: Apply }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const act = async (s: GitStash, action: 'apply' | 'pop' | 'drop') => {
    if (action === 'drop' && !(await confirm({ title: 'Drop this stash?', body: `“${s.message}” is deleted. This cannot be undone.`, confirm: 'Drop', danger: true }))) return;
    setBusy(s.ref + action);
    try {
      apply(await post<GitActionResult>(`/api/git/stash/${action}`, { path: repo.path, ref: s.ref }), action === 'drop' ? 'Drop stash' : 'Apply stash', action === 'drop' ? 'Dropped the stash' : action === 'pop' ? 'Applied and removed the stash' : 'Applied the stash');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {confirmNode}
      {repo.stashes.map((s) => (
        <div key={s.ref} className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px]" title={s.message}>
            {s.message}
          </span>
          <span className="text-[12px] text-fg-3">{timeAgo(s.ts)}</span>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act(s, 'pop')} title="Apply it and remove it from the list">
            Apply
          </Button>
          <IconButton label="Drop" size="sm" onClick={() => act(s, 'drop')}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

// ---- commits -------------------------------------------------------------------------------------

function CommitRow({ path, c, authors }: { path: string; c: GitCommit; authors: boolean }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<GitCommitDetail | null>(null);
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => {
    if (open && !d) api<GitCommitDetail>(`/api/git/show?${q(path)}&hash=${c.hash}`).then(setD, toastError);
  }, [open, d, path, c.hash]);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors hover:bg-bg-2">
        <ChevronRight size={12} className={cx('shrink-0 self-center text-fg-3 transition-transform', open && 'rotate-90')} />
        <code className="shrink-0 font-mono text-[12px] text-fg-3">{c.hash.slice(0, 7)}</code>
        <span className="min-w-0 flex-1 truncate text-[13.5px]" title={c.subject}>
          {c.subject}
        </span>
        {authors && <span className="hidden shrink-0 text-[12px] text-fg-3 sm:inline">{c.author}</span>}
        <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(c.ts)}</span>
      </button>
      {open && (
        <div className="anim-expand border-t border-line bg-bg-1 px-3 py-2.5">
          {!d ? (
            <div className="flex justify-center py-2 text-fg-3">
              <Throbber />
            </div>
          ) : (
            <>
              {d.message.includes('\n') && <pre className="mb-2 font-sans text-[12.5px] whitespace-pre-wrap text-fg-2">{d.message.split('\n').slice(1).join('\n').trim()}</pre>}
              <div className="text-[12px] text-fg-3">
                {d.author} · {new Date(d.ts).toLocaleString(LOCALE)} · {d.files.length} file{d.files.length === 1 ? '' : 's'}
              </div>
              <div className="mt-1.5 space-y-px">
                {d.files.map((f) => (
                  <div key={f.path}>
                    <button onClick={() => setFile(file === f.path ? null : f.path)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-bg-2">
                      <ChevronRight size={12} className={cx('shrink-0 text-fg-3 transition-transform', file === f.path && 'rotate-90')} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.path}</span>
                      <DiffStat added={f.added} removed={f.removed} compact />
                    </button>
                    {file === f.path && <DiffView diff={f.diff} className="anim-expand my-1 max-h-[60vh] overflow-auto rounded-lg border border-line text-[12px]" />}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CommitList({ path, commits, empty }: { path: string; commits: GitCommit[]; empty?: string }) {
  if (!commits.length) return empty ? <div className="px-1 py-2 text-[13px] text-fg-3">{empty}</div> : null;
  const authors = new Set(commits.map((c) => c.author)).size > 1;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {commits.map((c) => (
        <CommitRow key={c.hash} path={path} c={c} authors={authors} />
      ))}
    </div>
  );
}

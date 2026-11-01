// Branches: the one you are on first, then the others here (newest first), each with how it stands against
// its branch on the remote, its last commit and "merged" once its work is in yours; then, folded, the branches
// only the remote has. Each can be switched to, merged into yours, compared with yours, renamed, published or
// deleted (one not merged only after saying which commits would be lost).
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Cloud, Ellipsis, GitBranch, GitBranchPlus, GitCompare, GitMerge, PenLine, Search, Trash2, Upload } from 'lucide-react';
import type { GitActionResult, GitBranch as Branch, GitCommit } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, Dialog, Empty, IconButton, MenuItem, MenuSep, Popover, Throbber } from '../../components/ui';
import { switchTo } from './BranchSwitcher';
import type { RepoCtx } from './RepoView';
import { commits, NameDialog, short } from './parts';

type Data = { current: string | null; branches: Branch[]; remotes: Branch[] };

export function BranchesTab({ ctx }: { ctx: RepoCtx }) {
  const { repo, phone } = ctx;
  const [data, setData] = useState<Data | null>(null);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState(false);
  const [naming, setNaming] = useState<{ kind: 'new' } | { kind: 'rename'; b: Branch } | null>(null);
  const [compare, setCompare] = useState<Branch | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<Data>(`/api/git/branches?path=${encodeURIComponent(repo.path)}`).then(
      (r) => alive && setData(r),
      (e) => alive && toastError(e),
    );
    return () => {
      alive = false;
    };
  }, [repo.path, repo.head, repo.branch, repo.upstream, repo.fetchedAt, tick]);
  const reload = () => setTick((t) => t + 1);
  if (!data)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={26} />
      </div>
    );
  const text = q.trim().toLowerCase();
  const has = (b: Branch) => !text || b.name.toLowerCase().includes(text);
  const current = data.branches.find((b) => b.name === data.current);
  const others = data.branches.filter((b) => b.name !== data.current && has(b));
  const remoteOnly = data.remotes.filter((b) => !b.local && has(b));
  const act = async (url: string, body: Record<string, unknown>, what: string, ok: string) => {
    try {
      const done = ctx.apply(await post<GitActionResult>(url, { path: repo.path, ...body }), what, ok);
      reload();
      return done;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const many = data.branches.length + data.remotes.length > 8;
  return (
    <div className="h-full overflow-y-auto">
      <div className={cx('mx-auto max-w-[880px] pb-8', phone ? 'px-3 pt-3' : 'px-6 pt-4')}>
        <div className="mb-3 flex items-center gap-2">
          {many ? (
            <div className="relative min-w-0 flex-1">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Find a branch"
                aria-label="Find a branch"
                spellCheck={false}
                autoCapitalize="none"
                className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-md:h-10 max-md:text-[15px]"
              />
            </div>
          ) : (
            <span className="flex-1" />
          )}
          <Button size="sm" variant="secondary" icon={<GitBranchPlus size={14} />} onClick={() => setNaming({ kind: 'new' })} disabled={!!repo.op}>
            New branch
          </Button>
        </div>

        {current && !text && (
          <div className="mb-4 rounded-2xl border border-line bg-panel px-4 py-3">
            <div className="text-[11.5px] font-medium text-fg-3">You are on</div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <GitBranch size={15} className="shrink-0 text-accent" />
              <span translate="no" className="truncate text-[15px] font-semibold">
                {current.name}
              </span>
              <Track b={current} />
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
              <span translate="no" className="truncate">
                {current.subject}
              </span>
              <span className="shrink-0">·</span>
              <span className="shrink-0">{timeAgo(current.ts)}</span>
            </div>
          </div>
        )}

        {others.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-line">
            {others.map((b, i) => (
              <BranchRow key={b.name} ctx={ctx} b={b} current={data.current} first={i === 0} act={act} onRename={() => setNaming({ kind: 'rename', b })} onCompare={() => setCompare(b)} />
            ))}
          </div>
        ) : (
          !remoteOnly.length && (
            <Empty icon={<GitBranch size={20} />} title={text ? 'No branch by that name' : 'No other branches'}>
              {text ? undefined : 'A branch is a line of work of its own: make one to try something without touching this one.'}
            </Empty>
          )
        )}

        {remoteOnly.length > 0 && (
          <div className="mt-4">
            <button onClick={() => setRemote((o) => !o)} className="flex h-8 items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-fg-2 hover:text-fg" aria-expanded={remote || !!text}>
              <ChevronRight size={14} className={cx('text-fg-3', (remote || text) && 'rotate-90')} />
              Only on the remote
              <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] font-normal text-fg-3">{remoteOnly.length}</span>
            </button>
            {(remote || !!text) && (
              <div className="mt-1 overflow-hidden rounded-xl border border-line">
                {remoteOnly.map((b, i) => (
                  <div key={b.name} className={cx('flex items-center gap-3 px-3 py-2', i > 0 && 'border-t border-line')}>
                    <Cloud size={15} className="shrink-0 text-fg-3" />
                    <div className="min-w-0 flex-1">
                      <div translate="no" className="truncate text-[13.5px] font-medium">
                        {b.name}
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
                        <span translate="no" className="truncate">
                          {b.subject}
                        </span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">{timeAgo(b.ts)}</span>
                      </div>
                    </div>
                    <IconButton label={`Compare ${b.name} with ${data.current ?? 'this branch'}`} size="sm" onClick={() => setCompare(b)}>
                      <GitCompare size={14} />
                    </IconButton>
                    <Button size="sm" variant="ghost" disabled={!!repo.op} onClick={() => void switchTo(repo, ctx.apply, ctx.confirm, { name: b.name, remote: true }).then(reload)} title="Get it as a branch here, and switch to it">
                      Check out
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <NameDialog
        open={naming?.kind === 'new'}
        title="New branch"
        placeholder="Branch name, such as fix/checkout"
        confirm="Create and switch"
        onClose={() => setNaming(null)}
        done={async (name) => {
          const ok = await switchTo(repo, ctx.apply, ctx.confirm, { name, create: true });
          reload();
          return ok;
        }}
      >
        <p>{repo.branch ? `It starts from ${repo.branch} as it is now, and you switch to it.` : 'It starts from here, and you switch to it.'}</p>
        {repo.changed > 0 && <p className="mt-1">Your uncommitted changes come along.</p>}
      </NameDialog>
      <NameDialog
        open={naming?.kind === 'rename'}
        title={naming?.kind === 'rename' ? `Rename ${naming.b.name}` : 'Rename'}
        initial={naming?.kind === 'rename' ? naming.b.name : ''}
        placeholder="New name"
        confirm="Rename"
        onClose={() => setNaming(null)}
        done={(to) => (naming?.kind === 'rename' ? act('/api/git/branch-rename', { from: naming.b.name, to }, 'Rename', `Renamed it ${to}`) : Promise.resolve(false))}
      >
        {naming?.kind === 'rename' && naming.b.upstream ? `Its branch on the remote (${naming.b.upstream}) keeps its name.` : undefined}
      </NameDialog>
      <CompareDialog ctx={ctx} branch={compare} current={data.current} onClose={() => setCompare(null)} />
    </div>
  );
}

/** ↑2 ↓1 against its branch on the remote, "merged", "only here" or "gone from the remote". */
function Track({ b }: { b: Branch }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {b.merged && (
        <Badge tone="ok" className="max-md:hidden">
          merged
        </Badge>
      )}
      {!b.upstream && <Badge>only here</Badge>}
      {b.gone && <Badge tone="warn">gone from the remote</Badge>}
      {!!b.ahead && (
        <span className="tnum text-[11.5px] font-medium text-accent" title={`${commits(b.ahead)} not on ${b.upstream}`}>
          ↑{b.ahead}
        </span>
      )}
      {!!b.behind && (
        <span className="tnum text-[11.5px] font-medium text-warn" title={`${commits(b.behind)} on ${b.upstream} not here`}>
          ↓{b.behind}
        </span>
      )}
    </span>
  );
}

function BranchRow({
  ctx,
  b,
  current,
  first,
  act,
  onRename,
  onCompare,
}: {
  ctx: RepoCtx;
  b: Branch;
  current: string | null;
  first: boolean;
  act: (url: string, body: Record<string, unknown>, what: string, ok: string) => Promise<boolean>;
  onRename: () => void;
  onCompare: () => void;
}) {
  const { repo, confirm } = ctx;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);
  const here = current ?? 'this branch';
  const merge = async () => {
    close();
    const ok = await confirm({
      title: `Merge ${b.name} into ${here}?`,
      body: `Its work joins ${here}. If both changed the same lines, the merge stops so you can settle them (or stop it).`,
      confirm: 'Merge',
    });
    if (ok) await act('/api/git/merge', { branch: b.name }, 'Merge', `Merged ${b.name} into ${here}`);
  };
  const remove = async () => {
    close();
    if (b.merged) {
      const ok = await confirm({ title: `Delete ${b.name}?`, body: `Its work is in ${here} already, so nothing is lost.`, confirm: 'Delete', danger: true });
      if (ok) await act('/api/git/branch-delete', { branch: b.name }, 'Delete', `Deleted ${b.name}`);
      return;
    }
    let lost: GitCommit[] = [];
    try {
      lost = (await api<{ commits: GitCommit[] }>(`/api/git/branch-only?path=${encodeURIComponent(repo.path)}&branch=${encodeURIComponent(b.name)}`)).commits;
    } catch (e) {
      return toastError(e);
    }
    const ok = await confirm({
      title: lost.length ? `Delete ${b.name} and its ${commits(lost.length)}?` : `Delete ${b.name}?`,
      body: lost.length ? (
        <div className="space-y-2">
          <div>{lost.length === 1 ? 'This commit is on no other branch, here or on the remote: deleting the branch loses it.' : 'These commits are on no other branch, here or on the remote: deleting the branch loses them.'}</div>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-bg-1 px-3 py-2 text-[12.5px]">
            {lost.slice(0, 10).map((c) => (
              <li key={c.hash} className="flex gap-2">
                <code className="shrink-0 font-mono text-fg-3">{short(c.hash)}</code>
                <span translate="no" className="truncate">
                  {c.subject}
                </span>
              </li>
            ))}
            {lost.length > 10 && <li className="text-fg-3">{`and ${commits(lost.length - 10)} more`}</li>}
          </ul>
        </div>
      ) : (
        'Its commits are on other branches too, so nothing is lost.'
      ),
      confirm: lost.length ? 'Delete anyway' : 'Delete',
      danger: true,
    });
    if (ok) await act('/api/git/branch-delete', { branch: b.name, force: true }, 'Delete', `Deleted ${b.name}`);
  };
  return (
    <div className={cx('group flex items-center gap-3 px-3 py-2 max-md:py-2.5', !first && 'border-t border-line')}>
      <GitBranch size={15} className="shrink-0 text-fg-3" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span translate="no" className="truncate text-[13.5px] font-medium">
            {b.name}
          </span>
          <Track b={b} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
          <span translate="no" className="truncate">
            {b.subject}
          </span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{timeAgo(b.ts)}</span>
        </div>
      </div>
      <Button size="sm" variant="ghost" disabled={!!repo.op} onClick={() => void switchTo(repo, ctx.apply, confirm, { name: b.name })}>
        Switch
      </Button>
      <IconButton ref={ref} label={`More for ${b.name}`} size="sm" active={open} onClick={() => setOpen((o) => !o)}>
        <Ellipsis size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={260} title={b.name}>
        <MenuItem icon={<GitMerge size={14} />} disabled={!!repo.op || !current} onClick={merge}>
          {`Merge into ${here}`}
        </MenuItem>
        <MenuItem icon={<GitCompare size={14} />} onClick={() => (close(), onCompare())}>
          {`Compare with ${here}`}
        </MenuItem>
        {!b.upstream && repo.remote && (
          <MenuItem icon={<Upload size={14} />} onClick={() => (close(), void act('/api/git/push', { publish: true, branch: b.name }, 'Publish', `Published ${b.name}`))}>
            Publish
          </MenuItem>
        )}
        <MenuSep />
        <MenuItem icon={<PenLine size={14} />} onClick={() => (close(), onRename())}>
          Rename
        </MenuItem>
        <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
          Delete
        </MenuItem>
      </Popover>
    </div>
  );
}

/** What each of two branches has that the other lacks. */
function CompareDialog({ ctx, branch, current, onClose }: { ctx: RepoCtx; branch: Branch | null; current: string | null; onClose: () => void }) {
  const [d, setD] = useState<{ ahead: GitCommit[]; behind: GitCommit[] } | null>(null);
  useEffect(() => {
    setD(null);
    if (!branch) return;
    let alive = true;
    api<{ ahead: GitCommit[]; behind: GitCommit[] }>(`/api/git/compare?path=${encodeURIComponent(ctx.repo.path)}&branch=${encodeURIComponent(branch.name)}`).then(
      (r) => alive && setD(r),
      (e) => alive && (toastError(e), onClose()),
    );
    return () => {
      alive = false;
    };
  }, [branch, ctx.repo.path]);
  const here = current ?? 'this branch';
  const list = (title: string, cs: GitCommit[], empty: string) => (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
        {title}
        <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] font-normal text-fg-3">{cs.length >= 200 ? '200+' : cs.length}</span>
      </div>
      {cs.length ? (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
          {cs.map((c, i) => (
            <button
              key={c.hash}
              onClick={() => (onClose(), ctx.open({ tab: 'history', c: c.hash }, !ctx.wide))}
              className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-bg-2', i > 0 && 'border-t border-line')}
            >
              <code className="shrink-0 font-mono text-[12px] text-fg-3">{short(c.hash)}</code>
              <span translate="no" className="min-w-0 flex-1 truncate">
                {c.subject}
              </span>
              <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(c.ts)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-bg-1 px-3 py-2 text-[12.5px] text-fg-3">{empty}</div>
      )}
    </div>
  );
  return (
    <Dialog open={!!branch} onClose={onClose} title={branch ? `${branch.name} and ${here}` : ''} width={560} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {!d || !branch ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div className="space-y-4">
          {list(`On ${branch.name}, not on ${here}`, d.ahead, `Everything on ${branch.name} is on ${here} too.`)}
          {list(`On ${here}, not on ${branch.name}`, d.behind, `Everything on ${here} is on ${branch.name} too.`)}
        </div>
      )}
    </Dialog>
  );
}

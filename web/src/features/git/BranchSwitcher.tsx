// The branch you are on, as a chip that opens the switcher: a field that finds a branch (or names a new one),
// the branches here (the newest first), then those only the remote has, to check out. A few show at first;
// typing finds the rest, so the menu never needs scrolling. Switching with uncommitted changes asks first.
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Cloud, GitBranch, Plus, Search } from 'lucide-react';
import type { GitActionResult, GitBranch as Branch, GitRepoDetail } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { toastError } from '../../lib/store';
import { cx, MenuLabel, MenuSep, Popover, Throbber, type useConfirm } from '../../components/ui';
import { short } from './parts';

type Apply = (r: GitActionResult, what: string, ok?: string) => boolean;

/** Switches to a branch here, checks out one only the remote has, or makes a new one; asks first when changes would come along. */
export async function switchTo(
  repo: GitRepoDetail,
  apply: Apply,
  confirm: ReturnType<typeof useConfirm>[0],
  target: { name: string; remote?: boolean; create?: boolean; from?: string },
): Promise<boolean> {
  const name = target.remote ? target.name.slice(target.name.indexOf('/') + 1) : target.name;
  if (repo.changed > 0 && !target.create) {
    const ok = await confirm({
      title: `Switch to ${name}?`,
      body: 'Your uncommitted changes come along to it. If they clash with that branch, git refuses and nothing changes.',
      confirm: 'Switch',
    });
    if (!ok) return false;
  }
  try {
    return apply(
      await post<GitActionResult>('/api/git/switch', { path: repo.path, branch: target.name, create: !!target.create, track: !!target.remote, from: target.from }),
      target.create ? 'New branch' : 'Switch',
      target.create ? `On ${name}, a new branch` : `On ${name}`,
    );
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** Up to this many of each kind show before anything is typed. */
const FIRST_LOCAL = 7;
const FIRST_REMOTE = 3;

export function BranchSwitcher({ repo, apply, confirm }: { repo: GitRepoDetail; apply: Apply; confirm: ReturnType<typeof useConfirm>[0] }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ branches: Branch[]; remotes: Branch[] } | null>(null);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setHi(0);
    api<{ branches: Branch[]; remotes: Branch[] }>(`/api/git/branches?path=${encodeURIComponent(repo.path)}`).then(setData, toastError);
  }, [open, repo.path, repo.branch]);
  const text = q.trim();
  const has = (s: string) => s.toLowerCase().includes(text.toLowerCase());
  const locals = (data?.branches ?? []).filter((b) => !text || has(b.name));
  const remotes = (data?.remotes ?? []).filter((b) => !b.local && (!text || has(b.name)));
  const shownLocal = text ? locals.slice(0, 8) : locals.slice(0, FIRST_LOCAL);
  const shownRemote = text ? remotes.slice(0, Math.max(2, 10 - shownLocal.length)) : remotes.slice(0, FIRST_REMOTE);
  const more = locals.length - shownLocal.length + remotes.length - shownRemote.length;
  const exists = (data?.branches ?? []).some((b) => b.name === text);
  const canCreate = !!text && !exists && !/\s/.test(text) && !text.startsWith('-');
  type Row = { key: string; pick: () => void };
  const rows: Row[] = [
    ...shownLocal.map((b) => ({ key: `l:${b.name}`, pick: () => pick({ name: b.name }) })),
    ...shownRemote.map((b) => ({ key: `r:${b.name}`, pick: () => pick({ name: b.name, remote: true }) })),
    ...(canCreate ? [{ key: 'new', pick: () => pick({ name: text, create: true }) }] : []),
  ];
  const at = Math.min(hi, rows.length - 1);

  async function pick(t: { name: string; remote?: boolean; create?: boolean }) {
    if (!t.create && !t.remote && t.name === repo.branch) return setOpen(false);
    setOpen(false);
    setBusy(true);
    await switchTo(repo, apply, confirm, t);
    setBusy(false);
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) setHi((at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      rows[at]?.pick();
    }
  };
  const row = (key: string, children: React.ReactNode, onClick: () => void, title?: string) => {
    const i = rows.findIndex((r) => r.key === key);
    return (
      <button
        key={key}
        type="button"
        title={title}
        onClick={onClick}
        onMouseMove={() => i !== at && setHi(i)}
        className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] max-sm:h-11 max-sm:text-[14.5px]', i === at && 'bg-bg-2')}
      >
        {children}
      </button>
    );
  };
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        title={repo.branch ? 'Switch branch, or make a new one' : 'Not on a branch: pick one'}
        className={cx('inline-flex h-7.5 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg bg-bg-2 px-2.5 text-[13px] font-medium transition-colors hover:bg-bg-3 disabled:opacity-60', open && 'bg-bg-3')}
      >
        {busy ? <Throbber className="shrink-0" /> : <GitBranch size={14} className="shrink-0 text-fg-3" />}
        <span translate="no" className="truncate">
          {repo.branch ?? (repo.head ? `Detached at ${short(repo.head)}` : 'No branch yet')}
        </span>
        <ChevronDown size={13} className="shrink-0 text-fg-3" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340} title="Branches">
        <div className="relative mb-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => (setQ(e.target.value), setHi(0))}
            onKeyDown={onKey}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Find a branch, or name a new one"
            aria-label="Find a branch, or name a new one"
            className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-sm:h-11 max-sm:text-[15px]"
          />
        </div>
        {!data ? (
          <div className="flex justify-center py-3 text-fg-3">
            <Throbber />
          </div>
        ) : (
          <>
            {shownLocal.map((b) =>
              row(
                `l:${b.name}`,
                <>
                  <span className="flex w-4 shrink-0 justify-center">{b.name === repo.branch ? <Check size={14} className="text-accent" strokeWidth={2.5} /> : <GitBranch size={13} className="text-fg-3" />}</span>
                  <span translate="no" className="min-w-0 flex-1 truncate">
                    {b.name}
                  </span>
                  {!!b.ahead && <span className="tnum shrink-0 text-[11.5px] text-accent">↑{b.ahead}</span>}
                  {!!b.behind && <span className="tnum shrink-0 text-[11.5px] text-warn">↓{b.behind}</span>}
                  <span className="tnum w-9 shrink-0 text-right text-[11.5px] text-fg-3">{timeAgo(b.ts)}</span>
                </>,
                () => pick({ name: b.name }),
              ),
            )}
            {shownRemote.length > 0 && (
              <>
                <MenuLabel>Only on the remote</MenuLabel>
                {shownRemote.map((b) =>
                  row(
                    `r:${b.name}`,
                    <>
                      <span className="flex w-4 shrink-0 justify-center">
                        <Cloud size={13} className="text-fg-3" />
                      </span>
                      <span translate="no" className="min-w-0 flex-1 truncate">
                        {b.name}
                      </span>
                      <span className="tnum w-9 shrink-0 text-right text-[11.5px] text-fg-3">{timeAgo(b.ts)}</span>
                    </>,
                    () => pick({ name: b.name, remote: true }),
                    `Get ${b.name} as a branch here, and switch to it`,
                  ),
                )}
              </>
            )}
            {!rows.length && !canCreate && <div className="px-2.5 py-2 text-[12.5px] text-fg-3">{text ? 'No branch by that name' : 'No branches yet: make the first commit'}</div>}
            {more > 0 && <div className="px-2.5 py-1.5 text-[12px] text-fg-3">{text ? `${more} more: type more of the name` : `${more} more: type to find them`}</div>}
            {canCreate && (
              <Fragment>
                <MenuSep />
                {row(
                  'new',
                  <>
                    <span className="flex w-4 shrink-0 justify-center">
                      <Plus size={14} className="text-accent" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{`New branch “${text}” from here`}</span>
                  </>,
                  () => pick({ name: text, create: true }),
                  'Your uncommitted changes come along to it',
                )}
              </Fragment>
            )}
          </>
        )}
      </Popover>
    </>
  );
}

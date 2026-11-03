// The Git page. On the left, the repositories: those your sessions worked in and those you added (a folder on
// this computer, or a clone from a link), the most recently used first, each with its branch and small marks
// for files changed, commits to push and to pull. On the right, the repository picked (RepoView). In a window
// too narrow for both, the list folds into the page's title; on a phone the list is a page and a repository
// another, with a way back.
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, CloudDownload, GitBranch, Search, TriangleAlert } from 'lucide-react';
import type { GitRepo } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { RefreshIcon } from '../../components/RefreshIcon';
import { cx, Empty, IconButton, Popover, SheetsOnPhone, Throbber, useIsMobile } from '../../components/ui';
import { SystemHeader } from '../system/SystemHeader';
import { AddRepo } from './AddRepo';
import { repoUrl, useWidth } from './parts';
import { RepoView } from './RepoView';

/** What the list keeps of a repository (a detail has much more). */
const summary = (r: GitRepo): GitRepo => ({
  path: r.path,
  name: r.name,
  branch: r.branch,
  upstream: r.upstream,
  ahead: r.ahead,
  behind: r.behind,
  changed: r.changed,
  remote: r.remote,
  lastCommit: r.lastCommit,
  fetchedAt: r.fetchedAt,
  sessions: r.sessions,
  lastUsed: r.lastUsed,
  manual: r.manual,
  upstreamGone: r.upstreamGone,
  operation: r.operation,
  error: r.error,
});

function RepoRow({ r, active, onPick }: { r: GitRepo; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      aria-current={active ? 'page' : undefined}
      className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors max-md:py-3', active ? 'bg-bg-3' : 'hover:bg-bg-2 max-md:active:bg-bg-2')}
    >
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span translate="no" className="truncate text-[13.5px] font-medium max-md:text-[15px]">
            {r.name}
          </span>
          {r.operation && (
            <span className="shrink-0 rounded bg-err/15 px-1 text-[10.5px] font-medium text-err" title="A merge or rebase stopped on files that clash">
              {r.operation === 'rebase' ? 'Rebasing' : r.operation === 'merge' ? 'Merging' : 'Stopped'}
            </span>
          )}
          {r.error && <TriangleAlert size={12} className="shrink-0 text-err" aria-label="Git couldn’t read it" />}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
          <GitBranch size={11} className="shrink-0" />
          <span translate="no" className="truncate">
            {r.branch ?? 'detached'}
          </span>
          {r.changed > 0 && (
            <span className="tnum flex shrink-0 items-center gap-1 text-warn" title={r.changed === 1 ? '1 file changed' : `${r.changed} files changed`}>
              <span className="size-1.5 rounded-full bg-warn" />
              {r.changed}
            </span>
          )}
          {r.ahead > 0 && (
            <span className="tnum flex shrink-0 items-center text-accent" title={r.ahead === 1 ? '1 commit to push' : `${r.ahead} commits to push`}>
              <ArrowUp size={11} />
              {r.ahead}
            </span>
          )}
          {r.behind > 0 && (
            <span className="tnum flex shrink-0 items-center text-warn" title={r.behind === 1 ? '1 commit to pull' : `${r.behind} commits to pull`}>
              <ArrowDown size={11} />
              {r.behind}
            </span>
          )}
        </span>
      </span>
      {r.lastCommit && (
        <span className="tnum shrink-0 self-start pt-0.5 text-[11.5px] text-fg-3" title="The last commit">
          {timeAgo(r.lastCommit.ts)}
        </span>
      )}
    </button>
  );
}

/** The repositories, with a field to find one once there are more than a few. `limit`: how many show before typing. */
function RepoList({ repos, selected, onPick, limit, find }: { repos: GitRepo[]; selected: string | null; onPick: (p: string) => void; limit?: number; find?: boolean }) {
  const home = useApp((s) => s.boot?.home);
  const [q, setQ] = useState('');
  const text = q.trim().toLowerCase();
  const found = text ? repos.filter((r) => r.name.toLowerCase().includes(text) || tildify(r.path, home).toLowerCase().includes(text)) : repos;
  const shown = limit && !text ? found.slice(0, limit) : found;
  return (
    <div className="p-2">
      {(find || repos.length > 6) && (
        <div className="relative mb-1.5">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && found[0] && onPick(found[0].path)}
            autoFocus={find}
            placeholder="Find a repository"
            aria-label="Find a repository"
            spellCheck={false}
            className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-md:h-10 max-md:text-[15px]"
          />
        </div>
      )}
      <div className="space-y-px">
        {shown.map((r) => (
          <RepoRow key={r.path} r={r} active={r.path === selected} onPick={() => onPick(r.path)} />
        ))}
      </div>
      {text && !found.length && <div className="px-2.5 py-2 text-[12.5px] text-fg-3">No repository by that name</div>}
      {!text && found.length > shown.length && <div className="px-2.5 py-1.5 text-[12px] text-fg-3">{`${found.length - shown.length} more: type to find them`}</div>}
    </div>
  );
}

/** Repositories your sessions worked in and those you added, how each stands against its remote, and working on them. */
export function GitPage({ selected }: { selected: string | null }) {
  const mobile = useIsMobile();
  const [repos, setRepos] = useState<GitRepo[] | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'fetch' | null>(null);
  const [page, pageWidth] = useWidth<HTMLDivElement>();
  const fold = !mobile && pageWidth > 0 && pageWidth < 840;
  const [picker, setPicker] = useState(false);
  const titleRef = useRef<HTMLButtonElement>(null);

  const load = async (refresh = false) => {
    if (refresh) setBusy('refresh');
    try {
      setRepos((await api<{ repos: GitRepo[] }>(`/api/git/repos${refresh ? '?refresh=1' : ''}`)).repos);
    } catch (e) {
      toastError(e);
      setRepos((l) => l ?? []);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  // On a computer the most recently used repository opens when none is picked.
  useEffect(() => {
    if (!mobile && !selected && repos?.length) go(repoUrl(repos[0].path), true);
  }, [mobile, selected, repos]);

  const fetchAll = async () => {
    setBusy('fetch');
    try {
      setRepos((await post<{ repos: GitRepo[] }>('/api/git/fetch-all')).repos);
      toast('Fetched every remote', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const onChanged = (r: GitRepo) => setRepos((l) => (l ? (l.some((x) => x.path === r.path) ? l.map((x) => (x.path === r.path ? summary(r) : x)) : [summary(r), ...l]) : l));
  const onAdded = (r: GitRepo) => {
    setRepos((l) => [summary(r), ...(l ?? []).filter((x) => x.path !== r.path)]);
    go(repoUrl(r.path));
  };
  const onRemoved = (p: string) => {
    toast('Removed from the list', 'ok');
    const rest = (repos ?? []).filter((x) => x.path !== p);
    setRepos(rest);
    go(!mobile && rest.length ? repoUrl(rest[0].path) : '/git', true);
  };
  const pick = (p: string) => {
    setPicker(false);
    go(repoUrl(p));
  };
  const actions = (
    <>
      <AddRepo onAdded={onAdded} compact={mobile} />
      <IconButton label="Fetch every repository’s remote" onClick={fetchAll} disabled={!!busy}>
        {busy === 'fetch' ? <Throbber /> : <CloudDownload size={16} />}
      </IconButton>
      <IconButton label="Refresh" onClick={() => load(true)} disabled={!!busy}>
        <RefreshIcon size={15} busy={busy === 'refresh'} />
      </IconButton>
    </>
  );
  const empty = (
    <Empty icon={<GitBranch size={20} />} title="No repositories yet">
      Repositories show up here once a session works in one. Or add one yourself:
      <div className="mt-4">
        <AddRepo onAdded={onAdded} buttons />
      </div>
    </Empty>
  );
  const list = !repos ? (
    <div className="flex justify-center py-16 text-fg-3">
      <Throbber size={28} />
    </div>
  ) : !repos.length ? (
    empty
  ) : (
    <RepoList repos={repos} selected={selected} onPick={pick} />
  );

  if (mobile)
    return (
      <SheetsOnPhone.Provider value>
        {selected ? (
          <div className="h-full">
            <RepoView key={selected} path={selected} onChanged={onChanged} onBack={() => go('/git')} onRemoved={() => onRemoved(selected)} />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <SystemHeader tab="git" actions={actions} />
            <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
          </div>
        )}
      </SheetsOnPhone.Provider>
    );

  const current = repos?.find((r) => r.path === selected);
  const title = fold ? (
    <button ref={titleRef} type="button" onClick={() => setPicker((o) => !o)} className="-ml-1 flex max-w-full min-w-0 items-center gap-1 rounded-lg px-1 text-left hover:bg-bg-2" aria-label="Repositories">
      <span translate="no" className="truncate">
        {current?.name ?? 'Git'}
      </span>
      <ChevronDown size={15} className="shrink-0 text-fg-3" />
    </button>
  ) : (
    'Git'
  );
  return (
    <div ref={page} className="flex h-full min-h-0 flex-col">
      <SystemHeader
        tab="git"
        actions={
          fold ? (
            <>
              {title}
              {actions}
            </>
          ) : (
            actions
          )
        }
      />
      <div className="flex min-h-0 flex-1">
        {!fold && !!repos?.length && (
          <nav aria-label="Repositories" className="w-[248px] shrink-0 overflow-y-auto border-r border-line bg-bg-1">
            {list}
          </nav>
        )}
        <div className="min-w-0 flex-1">
          {selected ? (
            <RepoView key={selected} path={selected} onChanged={onChanged} onRemoved={() => onRemoved(selected)} />
          ) : repos && !repos.length ? (
            empty
          ) : (
            <div className="flex h-full items-center justify-center text-fg-3">
              <Throbber size={28} />
            </div>
          )}
        </div>
      </div>
      {fold && repos && (
        <Popover anchor={titleRef} open={picker} onClose={() => setPicker(false)} width={320} title="Repositories">
          <RepoList repos={repos} selected={selected} onPick={pick} limit={8} find />
        </Popover>
      )}
    </div>
  );
}

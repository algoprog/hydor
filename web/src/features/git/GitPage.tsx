import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, CloudDownload, FileText, GitBranch, GitCommitHorizontal, SquareTerminal, Upload, X } from 'lucide-react';
import type { GitActionResult, GitCommit, GitRepo, GitRepoDetail } from '@shared/types';
import { api, post } from '../../lib/api';
import { ago, tildify, timeAgo } from '../../lib/format';
import { go, openFile } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { Button, cx, Throbber, Empty, IconButton, useConfirm, useIsMobile } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { RefreshIcon } from '../../components/RefreshIcon';

const repoUrl = (p: string) => `/git?path=${encodeURIComponent(p)}`;
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** ↑3 ↓1, "Up to date" or "Local only": where a branch stands against its upstream. */
function SyncBadges({ r, size = 'sm' }: { r: GitRepo; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-6 px-2 text-[12.5px]' : 'h-5 px-1.5 text-[11.5px]';
  if (!r.branch) return <span className={cx('inline-flex items-center rounded-md bg-bg-2 text-fg-3', cls)}>Detached</span>;
  if (!r.upstream) return <span className={cx('inline-flex items-center rounded-md bg-bg-2 text-fg-3', cls)}>Local only</span>;
  if (!r.ahead && !r.behind)
    return (
      <span className={cx('inline-flex items-center gap-1 rounded-md bg-ok/10 text-ok', cls)}>
        <Check size={12} /> Up to date
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      {r.ahead > 0 && (
        <span className={cx('tnum inline-flex items-center gap-0.5 rounded-md bg-accent/12 font-medium text-accent', cls)} title={`${plural(r.ahead, 'commit')} to push`}>
          <ArrowUp size={12} />
          {r.ahead}
        </span>
      )}
      {r.behind > 0 && (
        <span className={cx('tnum inline-flex items-center gap-0.5 rounded-md bg-warn/12 font-medium text-warn', cls)} title={`${plural(r.behind, 'commit')} to pull`}>
          <ArrowDown size={12} />
          {r.behind}
        </span>
      )}
    </span>
  );
}

function RepoRow({ r, active }: { r: GitRepo; active: boolean }) {
  return (
    <button onClick={() => go(repoUrl(r.path))} className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors', active ? 'bg-bg-3' : 'hover:bg-bg-2')}>
      <GitBranch size={16} className="mt-0.5 shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{r.name}</span>
          <SyncBadges r={r} />
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-3">
          <span className="truncate">{r.branch ?? 'detached HEAD'}</span>
          {r.changed !== 0 && <span className="shrink-0">· {r.changed < 0 ? 'changes' : `${r.changed.toLocaleString()} changed`}</span>}
          {r.lastCommit && <span className="shrink-0">· {timeAgo(r.lastCommit.ts)}</span>}
        </span>
      </span>
    </button>
  );
}

function CommitList({ commits, empty }: { commits: GitCommit[]; empty?: string }) {
  if (!commits.length) return empty ? <div className="px-1 py-2 text-[13px] text-fg-3">{empty}</div> : null;
  const authors = new Set(commits.map((c) => c.author)).size > 1;
  return (
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
      {commits.map((c) => (
        <div key={c.hash} className="flex items-baseline gap-3 px-3 py-2">
          <code className="shrink-0 font-mono text-[12px] text-fg-3">{c.hash.slice(0, 7)}</code>
          <span className="min-w-0 flex-1 truncate text-[13.5px]" title={c.subject}>
            {c.subject}
          </span>
          {authors && <span className="hidden shrink-0 text-[12px] text-fg-3 sm:inline">{c.author}</span>}
          <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(c.ts)}</span>
        </div>
      ))}
    </div>
  );
}

const CODE_LABEL: Record<string, [string, string]> = {
  '??': ['New', 'text-add'],
  A: ['Added', 'text-add'],
  M: ['Modified', 'text-warn'],
  D: ['Deleted', 'text-del'],
  R: ['Renamed', 'text-info'],
  C: ['Copied', 'text-info'],
  U: ['Conflict', 'text-err'],
};

function fileLabel(code: string): [string, string] {
  if (code === '??') return CODE_LABEL['??'];
  const c = code.replace(/\./g, '')[0] ?? 'M';
  return CODE_LABEL[c] ?? CODE_LABEL.M;
}

function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center gap-2 px-1">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {count != null && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3">{count.toLocaleString()}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  );
}

function RepoDetail({ path, onChanged, onBack }: { path: string; onChanged: (r: GitRepo) => void; onBack?: () => void }) {
  const home = useApp((s) => s.boot?.home);
  const [repo, setRepo] = useState<GitRepoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ action: string; output: string } | null>(null);
  const [allFiles, setAllFiles] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  useEffect(() => {
    setRepo(null);
    setError(null);
    setFailure(null);
    setAllFiles(false);
    api<GitRepoDetail>(`/api/git/repo?path=${encodeURIComponent(path)}`)
      .then(setRepo)
      .catch((e) => setError(e.message));
  }, [path]);

  const run = async (action: 'fetch' | 'pull' | 'push', publish = false) => {
    const before = repo;
    setBusy(action);
    setFailure(null);
    try {
      const r = await post<GitActionResult>(`/api/git/${action}`, { path, publish });
      setRepo(r.repo);
      onChanged(r.repo);
      if (!r.ok) setFailure({ action, output: r.output });
      else if (action === 'fetch') toast(r.repo.behind ? `Fetched · ${plural(r.repo.behind, 'commit')} to pull` : 'Fetched · nothing to pull', 'ok');
      else if (action === 'pull') toast(`Pulled ${plural(before?.behind ?? 0, 'commit')}`, 'ok');
      else toast(publish ? `Published ${r.repo.branch}` : `Pushed ${plural(before?.ahead ?? 0, 'commit')}`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const push = async (publish: boolean) => {
    if (!repo) return;
    const n = repo.toPush.length;
    const ok = await confirm({
      title: publish ? `Publish ${repo.branch} to ${repo.remote}?` : `Push ${plural(repo.ahead, 'commit')} to ${repo.upstream}?`,
      body: (
        <div className="space-y-2">
          <div>
            {publish
              ? `This creates ${repo.remote}/${repo.branch} and sets it as the branch's upstream.`
              : 'Everything on this branch that the remote does not have goes up, including commits other sessions made.'}
          </div>
          {n > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg bg-bg-1 px-3 py-2 text-[12.5px]">
              {repo.toPush.slice(0, 12).map((c) => (
                <li key={c.hash} className="truncate">
                  <code className="mr-2 font-mono text-fg-3">{c.hash.slice(0, 7)}</code>
                  {c.subject}
                </li>
              ))}
              {repo.ahead > 12 && <li className="text-fg-3">and {plural(repo.ahead - 12, 'more commit')}</li>}
            </ul>
          )}
        </div>
      ),
      confirm: publish ? 'Publish' : 'Push',
    });
    if (ok) run('push', publish);
  };

  if (error) return <Empty title="Could not read this repository">{error}</Empty>;
  if (!repo)
    return (
      <div className="flex h-full items-center justify-center py-20 text-fg-3">
        <Throbber size={34} />
      </div>
    );

  const files = allFiles ? repo.files : repo.files.slice(0, 60);
  const canPublish = !repo.upstream && !!repo.remote && !!repo.branch;
  return (
    <div className="anim-fade mx-auto w-full max-w-[860px] px-4 py-6 sm:px-8">
      <div className="flex items-start gap-3">
        {onBack && (
          <IconButton label="All repositories" onClick={onBack} className="-ml-1">
            <ArrowLeft size={18} />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[20px] font-semibold tracking-tight">{repo.name}</h1>
          <div className="mt-0.5 truncate font-mono text-[12.5px] text-fg-3" title={repo.path}>
            {tildify(repo.path, home)}
          </div>
        </div>
        <IconButton label="Open a terminal here" onClick={() => openTerminalAt(repo.path)}>
          <SquareTerminal size={17} />
        </IconButton>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-bg-2 px-2.5 font-medium">
          <GitBranch size={14} className="text-fg-3" />
          {repo.branch ?? 'detached HEAD'}
        </span>
        <span className="text-fg-3">{repo.upstream ? `tracks ${repo.upstream}` : repo.remote ? 'not on the remote yet' : 'no remote'}</span>
        {repo.upstream && <SyncBadges r={repo} size="md" />}
      </div>

      {!repo.remote ? (
        <div className="mt-5 text-[13px] text-fg-3">
          This repository has no remote. Add one in a terminal (<code className="font-mono text-[12.5px] text-fg-2">git remote add origin &lt;url&gt;</code>
          ), then publish the branch from here.
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshIcon size={14} />} disabled={!!busy} onClick={() => run('fetch')}>
            {busy === 'fetch' ? 'Fetching…' : 'Fetch'}
          </Button>
          <Button
            size="sm"
            variant={repo.behind > 0 ? 'primary' : 'secondary'}
            icon={<CloudDownload size={14} />}
            disabled={!!busy || !repo.upstream || repo.behind === 0}
            title={!repo.upstream ? 'No upstream to pull from' : repo.behind === 0 ? 'Nothing to pull' : 'Fast-forward only: never makes a merge commit'}
            onClick={() => run('pull')}
          >
            {busy === 'pull' ? 'Pulling…' : repo.behind > 0 ? `Pull ${repo.behind}` : 'Pull'}
          </Button>
          {canPublish ? (
            <Button size="sm" variant="primary" icon={<Upload size={14} />} disabled={!!busy} onClick={() => push(true)}>
              {busy === 'push' ? 'Publishing…' : 'Publish branch'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant={repo.ahead > 0 ? 'primary' : 'secondary'}
              icon={<Upload size={14} />}
              disabled={!!busy || !repo.upstream || repo.ahead === 0}
              title={!repo.upstream ? 'No upstream to push to' : repo.ahead === 0 ? 'Nothing to push' : undefined}
              onClick={() => push(false)}
            >
              {busy === 'push' ? 'Pushing…' : repo.ahead > 0 ? `Push ${repo.ahead}` : 'Push'}
            </Button>
          )}
          <span className="text-[12px] text-fg-3">{repo.fetchedAt ? `Fetched ${ago(repo.fetchedAt)}` : 'Never fetched'}</span>
        </div>
      )}

      {failure && (
        <div className="anim-expand mt-4 rounded-xl border border-err/35 bg-err/5 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-err">{failure.action[0].toUpperCase() + failure.action.slice(1)} failed</span>
            {failure.action === 'pull' && <span className="text-fg-3">Merge or rebase in a terminal when the branches have diverged.</span>}
            <span className="flex-1" />
            <IconButton label="Dismiss" size="sm" onClick={() => setFailure(null)}>
              <X size={14} />
            </IconButton>
          </div>
          {failure.output && <pre className="term-out mt-2 max-h-48 overflow-auto rounded-lg px-3 py-2">{failure.output}</pre>}
        </div>
      )}

      {repo.upstream && (
        <>
          <Section title="To push" count={repo.ahead}>
            <CommitList commits={repo.toPush} empty={`Nothing to push: ${repo.upstream} has every commit on this branch.`} />
            {repo.ahead > repo.toPush.length && <div className="mt-1.5 px-1 text-[12px] text-fg-3">Showing the latest {repo.toPush.length}.</div>}
          </Section>
          <Section title="To pull" count={repo.behind}>
            <CommitList commits={repo.toPull} empty={repo.fetchedAt ? 'Nothing new on the remote since the last fetch.' : 'Fetch to see what is new on the remote.'} />
          </Section>
        </>
      )}

      <Section title="Changed files" count={repo.changed >= 0 ? repo.changed : undefined}>
        {repo.files.length ? (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {files.map((f) => {
              const [label, tone] = fileLabel(f.code);
              return (
                <button key={f.code + f.path} onClick={() => openFile(`${repo.path}/${f.path}`)} className="flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors hover:bg-bg-2">
                  <span className={cx('w-16 shrink-0 text-[12px]', tone)}>{label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={f.path}>
                    {f.from ? `${f.from} → ` : ''}
                    {f.path}
                  </span>
                  <FileText size={13} className="shrink-0 text-fg-3" />
                </button>
              );
            })}
            {repo.files.length > files.length && (
              <button onClick={() => setAllFiles(true)} className="w-full px-3 py-2 text-left text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg-2">
                Show all {repo.files.length.toLocaleString()} files
              </button>
            )}
          </div>
        ) : (
          <div className="px-1 py-2 text-[13px] text-fg-3">The working tree is clean.</div>
        )}
      </Section>

      <Section title="Recent commits">
        <CommitList commits={repo.recent} empty="No commits yet." />
      </Section>

      {repo.remotes.length > 0 && (
        <div className="mt-6 space-y-0.5 px-1 text-[12px] text-fg-3">
          {repo.remotes.map((r) => (
            <div key={r.name} className="truncate">
              <GitCommitHorizontal size={12} className="mr-1.5 inline" />
              {r.name} · <span className="font-mono">{r.url}</span>
            </div>
          ))}
        </div>
      )}
      {confirmNode}
    </div>
  );
}

/** Repositories the sessions worked in, how they stand against their remotes, and push/pull. */
export function GitPage({ selected }: { selected: string | null }) {
  const mobile = useIsMobile();
  const [repos, setRepos] = useState<GitRepo[] | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'fetch' | null>(null);

  const load = async (refresh = false) => {
    setBusy(refresh ? 'refresh' : null);
    try {
      const r = await api<{ repos: GitRepo[] }>(`/api/git/repos${refresh ? '?refresh=1' : ''}`);
      setRepos(r.repos);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const fetchAll = async () => {
    setBusy('fetch');
    try {
      const r = await post<{ repos: GitRepo[] }>('/api/git/fetch-all');
      setRepos(r.repos);
      toast('Fetched every remote', 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const onChanged = (r: GitRepo) => setRepos((l) => l?.map((x) => (x.path === r.path ? { ...x, ...r } : x)) ?? l);
  const actions = (
    <>
      <Button size="sm" variant="ghost" icon={<CloudDownload size={14} />} disabled={!!busy} onClick={fetchAll} title="Fetch every repository's remote">
        <span className="hidden sm:inline">{busy === 'fetch' ? 'Fetching…' : 'Fetch all'}</span>
      </Button>
      <IconButton label="Refresh" onClick={() => load(true)} disabled={!!busy}>
        <RefreshIcon size={15} busy={busy === 'refresh'} />
      </IconButton>
    </>
  );

  const list = !repos ? (
    <div className="flex justify-center py-16 text-fg-3">
      <Throbber size={28} />
    </div>
  ) : !repos.length ? (
    <Empty icon={<GitBranch size={20} />} title="No repositories yet">
      Repositories show up here once a session works in one.
    </Empty>
  ) : (
    <div className="space-y-0.5 p-2">
      {repos.map((r) => (
        <RepoRow key={r.path} r={r} active={r.path === selected} />
      ))}
    </div>
  );

  if (mobile) {
    if (selected) {
      return (
        <div className="h-full overflow-y-auto pt-[var(--safe-top)]">
          <RepoDetail path={selected} onChanged={onChanged} onBack={() => go('/git')} />
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Git" sub="Repositories your sessions worked in" actions={actions} />
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Git" sub="Repositories your sessions worked in" actions={actions} />
      <div className="flex min-h-0 flex-1">
        <div className="w-[340px] shrink-0 overflow-y-auto border-r border-line bg-bg-1">{list}</div>
        <div className="min-w-0 flex-1 overflow-y-auto">
          {selected ? (
            <RepoDetail key={selected} path={selected} onChanged={onChanged} />
          ) : (
            <Empty icon={<GitBranch size={20} />} title="Pick a repository">
              See what is waiting to be pushed or pulled, and the files that changed.
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}

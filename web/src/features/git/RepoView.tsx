// One repository: its name and folder, the branch (a switcher), one line on where it stands against the
// remote, one Sync button that does what is needed, and a ⋯ menu with the rest. Under them, when a merge or
// rebase stopped on files that clash, a banner that says so and offers the ways on. Then the tabs: Changes,
// History, Branches and Stashes. What is open in a tab (a file, a commit, a stash) is in the page's address,
// so Back goes where you were (on a phone each opens as a page of its own).
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, CircleAlert, Sparkles } from 'lucide-react';
import type { GitActionResult, GitOperationKind, GitRepo, GitRepoDetail } from '@shared/types';
import { api, post } from '../../lib/api';
import { tildify } from '../../lib/format';
import { tr } from '../../i18n/runtime';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { Button, cx, Empty, IconButton, Tabs, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { BranchSwitcher } from './BranchSwitcher';
import { BranchesTab } from './BranchesTab';
import { ChangesTab } from './ChangesTab';
import { HistoryTab } from './HistoryTab';
import { askAgent, FailureBox, repoUrl, TABS, useWidth, type Tab } from './parts';
import { RemotesDialog, RepoMenu, Standing, SyncButton, useSync } from './RepoHeader';
import { StashesTab } from './StashesTab';

/** What each tab gets: the repository, and the ways to change it and to move around in it. */
export interface RepoCtx {
  repo: GitRepoDetail;
  /** Shows the repository after an action, and its failure explained; returns whether it went through. */
  apply: (r: GitActionResult, what: string, ok?: string) => boolean;
  reload: () => Promise<void>;
  /** Wide enough for a list and what is picked in it side by side. */
  wide: boolean;
  phone: boolean;
  sel: { file: string | null; c: string | null; stash: string | null };
  /** Opens a tab, or something in it; `push` adds a step to Back (a page of its own). */
  open: (o: { tab?: Tab; file?: string | null; c?: string | null; stash?: string | null }, push?: boolean) => void;
  confirm: ReturnType<typeof useConfirm>[0];
}

export function RepoView({ path, onChanged, onBack, onRemoved }: { path: string; onChanged: (r: GitRepo) => void; onBack?: () => void; onRemoved: () => void }) {
  const phone = useIsMobile();
  const home = useApp((s) => s.boot?.home);
  const params = new URLSearchParams(useSearch());
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'changes';
  const sel = { file: params.get('file'), c: params.get('c'), stash: params.get('stash') };
  const [repo, setRepo] = useState<GitRepoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ title: string; output: string } | null>(null);
  const [remotes, setRemotes] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [box, width] = useWidth<HTMLDivElement>();
  const wide = !phone && width >= 640;
  const seq = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const busy = useRef(false);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const r = await api<GitRepoDetail>(`/api/git/repo?path=${encodeURIComponent(path)}`);
      if (n !== seq.current) return;
      setRepo(r);
      setError(null);
      changed.current(r);
    } catch (e) {
      if (n === seq.current) setError((e as Error).message);
    }
  }, [path]);

  useEffect(() => {
    setRepo(null);
    setError(null);
    setFailure(null);
    void load();
  }, [load]);

  // Agents work in these repositories: look again every 15 seconds while the page shows, and on coming back to it.
  useEffect(() => {
    const again = () => document.visibilityState === 'visible' && !busy.current && void load();
    const t = window.setInterval(again, 15_000);
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  }, [load]);

  const apply = useCallback((r: GitActionResult, what: string, ok?: string) => {
    seq.current++;
    setRepo(r.repo);
    changed.current(r.repo);
    if (r.ok) {
      setFailure(null);
      if (ok) toast(ok, 'ok');
    } else if (r.repo.op) {
      // The banner says what stopped and what to do.
      setFailure(null);
      toast('Stopped on files that clash: settle them, then Continue', 'error');
    } else setFailure({ title: `${what} didn’t go through`, output: r.output });
    return r.ok;
  }, []);

  const open = (o: { tab?: Tab; file?: string | null; c?: string | null; stash?: string | null }, push = false) => {
    const t = o.tab ?? tab;
    const keep = t === tab;
    go(repoUrl(path, { tab: t, file: 'file' in o ? o.file : keep ? sel.file : null, c: 'c' in o ? o.c : keep ? sel.c : null, stash: 'stash' in o ? o.stash : keep ? sel.stash : null }), !push);
  };

  const sync = useSync(repo, apply, (v) => (busy.current = v));
  /** A repository opened by its address that isn't on the list yet: add it, and show it. */
  const addIt = async () => {
    try {
      const r = await post<{ repo?: GitRepo; notRepo?: boolean }>('/api/git/repos', { path });
      if (r.notRepo) setError('This folder isn’t a git repository.');
      else {
        if (r.repo) changed.current(r.repo);
        await load();
      }
    } catch (e) {
      toastError(e);
    }
  };

  // One element throughout, loading or not: its width decides the layout.
  const frame = (children: React.ReactNode) => (
    <div ref={box} className={cx('flex h-full min-h-0 flex-col', phone && 'pt-[var(--safe-top)]')}>
      {confirmNode}
      {sync.node}
      {children}
    </div>
  );
  if (error && !repo)
    return frame(
      <>
        {onBack && (
          <IconButton label="All repositories" onClick={onBack} className="m-2">
            <ArrowLeft size={18} />
          </IconButton>
        )}
        <Empty icon={<CircleAlert size={20} />} title="Could not open this repository">
          {error}
          {/Not a repository from your sessions/.test(error) && (
            <div className="mt-4">
              <Button size="sm" variant="secondary" onClick={() => void addIt()}>
                Add it to the list
              </Button>
            </div>
          )}
        </Empty>
      </>,
    );
  if (!repo)
    return frame(
      <div className="flex flex-1 items-center justify-center text-fg-3">
        <Throbber size={34} />
      </div>,
    );

  const ctx: RepoCtx = { repo, apply, reload: load, wide, phone, sel, open, confirm };
  const tabs = [
    { value: 'changes' as const, label: 'Changes', count: repo.changed > 0 ? repo.changed.toLocaleString() : undefined },
    { value: 'history' as const, label: 'History' },
    { value: 'branches' as const, label: 'Branches' },
    { value: 'stashes' as const, label: 'Stashes', count: repo.stashes.length || undefined },
  ];
  return frame(
    <>
      <RemotesDialog repo={repo} apply={apply} open={remotes} onClose={() => setRemotes(false)} />
      <header className={cx('shrink-0', phone ? 'px-3 pt-2' : 'px-6 pt-4')}>
        <div className="flex items-start gap-2">
          {onBack && (
            <IconButton label="All repositories" onClick={onBack} className="-ml-1">
              <ArrowLeft size={18} />
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            <h1 translate="no" className="truncate text-[19px] leading-tight font-semibold tracking-tight max-md:text-[18px]">
              {repo.name}
            </h1>
            <div translate="no" className="mt-0.5 truncate font-mono text-[12px] text-fg-3" title={repo.path}>
              {tildify(repo.path, home)}
            </div>
          </div>
          <SyncButton repo={repo} sync={sync} />
          <RepoMenu repo={repo} apply={apply} sync={sync} confirm={confirm} onRemotes={() => setRemotes(true)} onRemoved={onRemoved} />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <BranchSwitcher repo={repo} apply={apply} confirm={confirm} />
          <Standing repo={repo} onRemotes={() => setRemotes(true)} />
        </div>
      </header>
      {(failure || repo.error) && (
        <div className={cx('shrink-0', phone ? 'px-3 pt-3' : 'px-6 pt-3')}>
          {failure ? (
            <FailureBox title={failure.title} output={failure.output} onClose={() => setFailure(null)} />
          ) : (
            <FailureBox title="Git couldn’t read this repository’s state" output={repo.error ?? ''} onClose={() => void load()} />
          )}
        </div>
      )}
      {repo.op && <Operation ctx={ctx} />}
      <Tabs value={tab} options={tabs} onChange={(t) => open({ tab: t })} className={cx('mt-2 shrink-0 border-b border-line', phone ? 'px-1.5' : 'px-4')} />
      <div className="min-h-0 flex-1">
        {tab === 'changes' ? <ChangesTab ctx={ctx} /> : tab === 'history' ? <HistoryTab ctx={ctx} /> : tab === 'branches' ? <BranchesTab ctx={ctx} /> : <StashesTab ctx={ctx} />}
      </div>
    </>,
  );
}

/** Whole sentences for a stopped operation (the translations take each as one). */
function opWords(kind: GitOperationKind, onto: string, branch: string, subject: string, n: number, files: string) {
  const fix = 'Resolve them: keep what each side meant, remove the conflict markers, and check that it still works (build and tests, if the project has them).';
  if (kind === 'merge')
    return {
      title: !n ? `Merging ${onto} into ${branch} is waiting to be finished` : n === 1 ? `Merging ${onto} into ${branch} stopped: 1 file clashes` : `Merging ${onto} into ${branch} stopped: ${n} files clash`,
      stop: 'Stop the merge',
      ask: `A merge of ${onto} into ${branch} stopped on conflicts in ${files}. ${fix} Don’t continue or stop the merge: tell me what you chose, and I’ll finish it from the Git page.`,
      git: 'git merge --abort',
    };
  if (kind === 'rebase')
    return {
      title: !n ? `Putting your commits on top of ${onto} is waiting to be finished` : n === 1 ? `Putting your commits on top of ${onto} stopped: 1 file clashes` : `Putting your commits on top of ${onto} stopped: ${n} files clash`,
      stop: 'Stop putting them on top',
      ask: `A rebase onto ${onto} stopped on conflicts in ${files}, applying “${subject}”. ${fix} Don’t continue or stop the rebase: tell me what you chose, and I’ll finish it from the Git page.`,
      git: 'git rebase --abort',
    };
  if (kind === 'revert')
    return {
      title: !n ? `Reverting “${subject}” is waiting to be finished` : n === 1 ? `Reverting “${subject}” stopped: 1 file clashes` : `Reverting “${subject}” stopped: ${n} files clash`,
      stop: 'Stop the revert',
      ask: `A revert of “${subject}” stopped on conflicts in ${files}. ${fix} Don’t continue or stop the revert: tell me what you chose, and I’ll finish it from the Git page.`,
      git: 'git revert --abort',
    };
  return {
    title: !n ? `Copying “${subject}” is waiting to be finished` : n === 1 ? `Copying “${subject}” stopped: 1 file clashes` : `Copying “${subject}” stopped: ${n} files clash`,
    stop: 'Stop copying it',
    ask: `A cherry-pick of “${subject}” stopped on conflicts in ${files}. ${fix} Don’t continue or stop the cherry-pick: tell me what you chose, and I’ll finish it from the Git page.`,
    git: 'git cherry-pick --abort',
  };
}

const STOP_Q: Record<GitOperationKind, string> = { merge: 'Stop the merge?', rebase: 'Stop putting them on top?', revert: 'Stop the revert?', 'cherry-pick': 'Stop copying it?' };

/** A merge, rebase, revert or copy of a commit that stopped on files that clash: what it is, the files, and the ways on. */
function Operation({ ctx }: { ctx: RepoCtx }) {
  const { repo, apply, confirm, phone } = ctx;
  const op = repo.op!;
  const [busy, setBusy] = useState<'continue' | 'abort' | null>(null);
  const left = op.conflicts.filter((c) => !c.resolved);
  const n = op.conflicts.length;
  const words = opWords(op.kind, op.onto ?? 'the other branch', repo.branch ?? 'this branch', op.stoppedAt?.subject ?? '', n, op.conflicts.map((c) => c.path).join(', ') || 'some files');
  const act = async (a: 'continue' | 'abort') => {
    if (a === 'abort' && !(await confirm({ title: STOP_Q[op.kind], body: 'Everything goes back to how it was before it began. What you changed to settle the files is lost.', confirm: words.stop, danger: true })))
      return;
    setBusy(a);
    try {
      apply(await post<GitActionResult>(`/api/git/${a}`, { path: repo.path }), a === 'continue' ? 'Continue' : words.stop, a === 'continue' ? 'Done' : 'Stopped: back to how it was');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className={cx('shrink-0', phone ? 'px-3 pt-3' : 'px-6 pt-3')}>
      <div className="rounded-xl border border-warn/40 bg-warn/8 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium">
              <span>{words.title}</span>
              {op.kind === 'rebase' && op.step && op.steps ? <span className="font-normal text-fg-3">{` · commit ${op.step} of ${op.steps}`}</span> : null}
            </div>
            <div className="mt-0.5 text-[12.5px] text-fg-2">
              {left.length
                ? 'Both sides changed the same lines. In each file, keep what should stay and remove the markers git added (<<<<<<<, =======, >>>>>>>), or ask an agent to.'
                : 'Every file is settled. Continue to finish.'}
            </div>
            {n > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {op.conflicts.map((c) => (
                  <button
                    key={c.path}
                    onClick={() => ctx.open({ tab: 'changes', file: c.path }, !ctx.wide)}
                    title={c.resolved ? 'Settled' : 'To settle'}
                    className={cx('inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2 text-[12.5px] transition-colors', c.resolved ? 'bg-ok/12 text-ok hover:bg-ok/20' : 'bg-bg-2 text-fg hover:bg-bg-3')}
                  >
                    {c.resolved ? <Check size={12} /> : <span className="size-1.5 shrink-0 rounded-full bg-err" />}
                    <span translate="no" className="truncate font-mono">
                      {c.path}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {left.length > 0 && (
                <Button size="sm" variant="secondary" icon={<Sparkles size={13} />} onClick={() => askAgent(tr(words.ask), repo.path)}>
                  Ask an agent to resolve them
                </Button>
              )}
              <Button size="sm" variant={left.length ? 'secondary' : 'primary'} disabled={!!busy || left.length > 0} title={left.length ? 'Settle every file first' : undefined} onClick={() => act('continue')}>
                {busy === 'continue' ? 'Continuing…' : 'Continue'}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} title={words.git} onClick={() => act('abort')}>
                {busy === 'abort' ? 'Stopping…' : words.stop}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

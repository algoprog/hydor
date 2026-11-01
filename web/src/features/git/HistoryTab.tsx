// History: the commits, newest first, with a graph of how the branches split and join, the branches and tags
// on each, who made it and when. This branch's history or every branch's; a search finds commits by words in
// their message, their author or their hash; more load on asking. A commit opens beside the list (on its own
// page on a phone): its whole message, author, date and hash, the files it changed with their diffs, and what
// can be done with it: explain it, revert it, start a branch or a tag there, or undo it while no remote has it.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Copy, Ellipsis, GitBranchPlus, GitCommitHorizontal, History, RotateCcw, Search, Sparkles, Tag, Undo2, X } from 'lucide-react';
import type { GitActionResult, GitCommitDetail, GitLogCommit } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, IconButton, MenuItem, MenuSep, Popover, Throbber } from '../../components/ui';
import { switchTo } from './BranchSwitcher';
import { GraphCell, layout } from './graph';
import type { RepoCtx } from './RepoView';
import { askAgent, BackBar, ChangedFiles, copyText, DiffLayoutSwitch, filesN, NameDialog, RefChip, short, SPLIT_MIN, useDiffLayout, usePref, useWidth } from './parts';

type Scope = 'branch' | 'all';
const PAGE = 100;
const full = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function HistoryTab({ ctx }: { ctx: RepoCtx }) {
  const { repo, wide, phone, sel, open } = ctx;
  const [scope, setScope] = usePref<Scope>('wa.git.scope', 'branch', ['branch', 'all']);
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const [data, setData] = useState<{ key: string; commits: GitLogCommit[]; more: boolean } | null>(null);
  const [more, setMore] = useState(false);
  const [scopeMenu, setScopeMenu] = useState(false);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const key = `${repo.path}\n${scope}\n${dq}`;
  const url = (skip: number) => `/api/git/log?path=${encodeURIComponent(repo.path)}&skip=${skip}&limit=${PAGE}${scope === 'all' ? '&all=1' : ''}${dq ? `&q=${encodeURIComponent(dq)}` : ''}`;
  // Asked again when HEAD or the branch moves; what is shown stays until the answer comes.
  useEffect(() => {
    let alive = true;
    api<{ commits: GitLogCommit[]; more: boolean }>(url(0)).then(
      (r) => alive && setData({ key, ...r }),
      (e) => alive && (toastError(e), setData({ key, commits: [], more: false })),
    );
    return () => {
      alive = false;
    };
  }, [key, repo.head, repo.branch, repo.tags]);
  const loadMore = async () => {
    if (!data) return;
    setMore(true);
    try {
      const r = await api<{ commits: GitLogCommit[]; more: boolean }>(url(data.commits.length));
      setData((d) => (d && d.key === key ? { key, commits: [...d.commits, ...r.commits.filter((c) => !d.commits.some((x) => x.hash === c.hash))], more: r.more } : d));
    } catch (e) {
      toastError(e);
    } finally {
      setMore(false);
    }
  };
  const list = data?.commits ?? [];
  const searching = !!dq;
  const rows = useMemo(() => (searching ? null : layout(list)), [list, searching]);
  const lanes = rows ? Math.min(8, Math.max(1, ...rows.map((r) => r.width))) : 0;
  const local = useMemo(() => new Set(repo.toPush.map((c) => c.hash)), [repo.toPush]);
  const shown = sel.c ?? (wide ? list[0]?.hash : null);
  const stale = !!data && data.key !== key;

  if (!wide && sel.c)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <CommitView ctx={ctx} hash={sel.c} onBack={() => open({ c: null })} />
      </div>
    );

  const height = phone ? 54 : 34;
  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-line px-2">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
            placeholder="Find a commit"
            aria-label="Find a commit by words, author or hash"
            title="Words in its message, its author, or its hash"
            spellCheck={false}
            className="h-8 w-full rounded-lg bg-bg-2 pr-7 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-md:h-10 max-md:text-[15px]"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear" className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-fg-3 hover:text-fg">
              <X size={13} />
            </button>
          )}
        </div>
        <button
          ref={scopeRef}
          onClick={() => setScopeMenu((o) => !o)}
          title="Whose history"
          className={cx('flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg max-md:h-10', scopeMenu && 'bg-bg-2')}
        >
          {scope === 'all' ? 'All branches' : 'This branch'}
          <ChevronDown size={12} className="text-fg-3" />
        </button>
        <Popover anchor={scopeRef} open={scopeMenu} onClose={() => setScopeMenu(false)} align="end" width={220} title="Whose history">
          <MenuItem checked={scope === 'branch'} onClick={() => (setScope('branch'), setScopeMenu(false))}>
            This branch
          </MenuItem>
          <MenuItem checked={scope === 'all'} onClick={() => (setScope('all'), setScopeMenu(false))}>
            All branches
          </MenuItem>
        </Popover>
      </div>
      <div className={cx('@container min-h-0 flex-1 overflow-y-auto', stale && 'opacity-60')}>
        {!data ? (
          <div className="flex justify-center py-10 text-fg-3">
            <Throbber size={26} />
          </div>
        ) : !list.length ? (
          searching ? (
            <Empty icon={<Search size={20} />} title="No commit matches">{`Nothing says “${dq}” in its message, author or hash.`}</Empty>
          ) : (
            <Empty icon={<History size={20} />} title="No commits yet">
              Commit your first changes from Changes.
            </Empty>
          )
        ) : (
          <>
            {list.map((c, i) => (
              <CommitRow key={c.hash} c={c} row={rows?.[i]} lanes={lanes} height={height} phone={phone} local={local.has(c.hash)} active={c.hash === shown && wide} onOpen={() => open({ c: c.hash }, !wide)} />
            ))}
            {data.more && (
              <div className="p-2">
                <Button size="sm" variant="ghost" className="w-full" disabled={more} onClick={loadMore}>
                  {more ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
  if (!wide) return listPane;
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[46%] max-w-[600px] min-w-[300px] shrink-0 border-r border-line">{listPane}</div>
      <div className="flex min-w-0 flex-1 flex-col">{shown ? <CommitView key={shown} ctx={ctx} hash={shown} /> : null}</div>
    </div>
  );
}

const CommitRow = memo(function CommitRow({
  c,
  row,
  lanes,
  height,
  phone,
  local,
  active,
  onOpen,
}: {
  c: GitLogCommit;
  row?: ReturnType<typeof layout>[number];
  lanes: number;
  height: number;
  phone: boolean;
  local: boolean;
  active: boolean;
  onOpen: () => void;
}) {
  const refs = c.refs.slice(0, phone ? 2 : 3);
  const extra = c.refs.length - refs.length;
  return (
    <button
      onClick={onOpen}
      style={{ height }}
      title={local ? 'Not on the remote yet' : undefined}
      className={cx('flex w-full items-center gap-1.5 pr-3 text-left', !row && 'pl-3', active ? 'bg-bg-3' : 'hover:bg-bg-2 max-md:active:bg-bg-2')}
    >
      {row && <GraphCell row={row} height={height} lanes={lanes} local={local} head={c.head} merge={c.parents.length > 1} />}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {refs.length > 0 && (
            <span className="flex max-w-[55%] min-w-0 shrink-0 items-center gap-1 overflow-hidden">
              {refs.map((r) => (
                <RefChip key={r.kind + r.name} r={r} />
              ))}
              {extra > 0 && <span className="shrink-0 text-[11px] text-fg-3">+{extra}</span>}
            </span>
          )}
          <span translate="no" className={cx('min-w-0 flex-1 truncate text-[13px] max-md:text-[14.5px]', c.parents.length > 1 && 'text-fg-2')}>
            {c.subject}
          </span>
        </span>
        {phone && (
          <span className="mt-0.5 flex items-center gap-1 text-[12px] text-fg-3">
            <span translate="no" className="truncate">
              {c.author}
            </span>
            <span>·</span>
            <span className="shrink-0">{timeAgo(c.ts)}</span>
          </span>
        )}
      </span>
      {!phone && (
        <>
          <span translate="no" className="w-28 shrink-0 truncate text-right text-[12px] text-fg-3 @max-[520px]:hidden">
            {c.author}
          </span>
          <span className="tnum min-w-9 shrink-0 text-right text-[12px] whitespace-nowrap text-fg-3" title={full.format(c.ts)}>
            {timeAgo(c.ts)}
          </span>
        </>
      )}
    </button>
  );
});

/** A commit: its message, who and when, its hash, the files it changed, and what can be done with it. */
function CommitView({ ctx, hash, onBack }: { ctx: RepoCtx; hash: string; onBack?: () => void }) {
  const { repo, apply, confirm, wide, open } = ctx;
  const [d, setD] = useState<GitCommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'branch' | 'tag' | null>(null);
  const [layoutPref, setLayout] = useDiffLayout();
  const [pane, paneWidth] = useWidth<HTMLDivElement>();
  const roomy = paneWidth >= SPLIT_MIN;
  const menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    api<GitCommitDetail>(`/api/git/show?path=${encodeURIComponent(repo.path)}&hash=${encodeURIComponent(hash)}`).then(
      (r) => alive && setD(r),
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [repo.path, hash, repo.head]);
  const [subject, ...rest] = (d?.message ?? '').split('\n');
  const body = rest.join('\n').trim();
  const close = () => setMenu(false);
  const act = async (url: string, body: Record<string, unknown>, what: string, ok: string) => {
    try {
      return apply(await post<GitActionResult>(url, { path: repo.path, ...body }), what, ok);
    } catch (e) {
      toastError(e);
      return false;
    }
  };
  const revert = async () => {
    close();
    if (!d) return;
    const ok = await confirm({
      title: `Revert “${subject}”?`,
      body:
        d.parents.length > 1
          ? 'A new commit undoes what this merge brought in. The merge itself stays in the history.'
          : 'A new commit undoes what this one changed. The commit itself stays in the history.',
      confirm: 'Revert',
    });
    if (ok) await act('/api/git/revert', { hash: d.hash }, 'Revert', `Reverted “${subject}”`);
  };
  const undo = async () => {
    close();
    if (!d) return;
    const ok = await confirm({ title: 'Undo the last commit?', body: 'The commit goes away, and what it changed goes back to Changes, ready to commit again.', confirm: 'Undo' });
    if (ok && (await act('/api/git/undo-commit', { hash: d.hash }, 'Undo', 'Undid the last commit: its changes are back in Changes'))) open({ tab: 'changes', c: null });
  };
  const explain = () => {
    close();
    if (d) askAgent(tr(`Explain what commit ${short(d.hash)} (“${subject}”) in this repository changed and why, in plain words: what it does for someone using the project, and anything in it worth a closer look.`), repo.path);
  };
  const canUndo = !!d && d.head && !d.pushed && !repo.op;
  const top = onBack ? (
    <BackBar label="History" onBack={onBack} />
  ) : null;
  if (error || !d)
    return (
      <>
        {top}
        <div ref={pane} className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <Empty icon={<GitCommitHorizontal size={20} />} title="Could not open this commit">
              {error}
            </Empty>
          ) : (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={26} />
            </div>
          )}
        </div>
      </>
    );
  return (
    <>
      {top}
      <div ref={pane} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cx('mx-auto max-w-[980px]', onBack ? 'px-3 py-3' : 'px-5 py-4')}>
          <div className="flex items-start gap-2">
            <h2 translate="no" className="min-w-0 flex-1 text-[16px] leading-snug font-semibold tracking-tight break-words">
              {subject}
            </h2>
            <Button size="sm" variant="ghost" icon={<Sparkles size={13} />} onClick={explain} title="Ask an agent to explain it" className="shrink-0">
              Explain
            </Button>
            <IconButton ref={menuRef} label="More for this commit" onClick={() => setMenu((o) => !o)} active={menu} className="shrink-0">
              <Ellipsis size={16} />
            </IconButton>
            <Popover anchor={menuRef} open={menu} onClose={close} align="end" width={250} title={short(d.hash)}>
              <MenuItem icon={<Sparkles size={14} />} onClick={explain}>
                Ask an agent to explain it
              </MenuItem>
              <MenuItem icon={<Copy size={14} />} onClick={() => (close(), copyText(d.hash, 'Copied the hash'))}>
                Copy hash
              </MenuItem>
              <MenuSep />
              <MenuItem icon={<GitBranchPlus size={14} />} onClick={() => (close(), setDialog('branch'))}>
                New branch from here
              </MenuItem>
              <MenuItem icon={<Tag size={14} />} onClick={() => (close(), setDialog('tag'))}>
                Tag this commit
              </MenuItem>
              <MenuSep />
              {canUndo && (
                <MenuItem icon={<Undo2 size={14} />} onClick={undo}>
                  Undo this commit
                </MenuItem>
              )}
              <MenuItem icon={<RotateCcw size={14} />} disabled={!!repo.op} onClick={revert}>
                Revert this commit
              </MenuItem>
            </Popover>
          </div>
          {body && (
            <pre translate="no" className="mt-2 font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">
              {body}
            </pre>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
            <span translate="no" className="text-fg-2" title={d.email}>
              {d.author}
            </span>
            <span>·</span>
            <span>{full.format(d.ts)}</span>
            <span>·</span>
            <button onClick={() => copyText(d.hash, 'Copied the hash')} title="Copy the whole hash" className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-1.5 font-mono text-[12px] text-fg-2 hover:bg-bg-3">
              {short(d.hash)}
              <Copy size={11} />
            </button>
            {!d.pushed && repo.remote && <span className="text-accent">Not on the remote yet</span>}
          </div>
          {(d.refs.length > 0 || d.parents.length > 1) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
              {d.refs.map((r) => (
                <RefChip key={r.kind + r.name} r={r} />
              ))}
              {d.parents.length > 1 && (
                <span className="flex items-center gap-1">
                  {`A merge of ${d.parents.length}:`}
                  {d.parents.map((p) => (
                    <button key={p} onClick={() => open({ c: p }, !wide)} className="font-mono text-fg-2 hover:text-accent hover:underline">
                      {short(p)}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}
          {canUndo && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-bg-1 px-3 py-2 text-[12.5px] text-fg-2">
              <span className="min-w-0 flex-1">The last commit, and no remote has it yet: you can still undo it.</span>
              <Button size="sm" variant="secondary" icon={<Undo2 size={13} />} onClick={undo}>
                Undo this commit
              </Button>
            </div>
          )}
          <div className="mt-4 mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium">{filesN(d.files.length)}</span>
            <span className="flex-1" />
            {roomy && d.files.length > 0 && <DiffLayoutSwitch value={layoutPref} onChange={setLayout} />}
          </div>
          <ChangedFiles key={d.hash} files={d.files} split={layoutPref === 'split' && roomy} />
        </div>
      </div>
      <NameDialog
        open={dialog === 'branch'}
        title="New branch from here"
        placeholder="Branch name, such as fix/checkout"
        confirm="Create and switch"
        onClose={() => setDialog(null)}
        done={(name) => switchTo(repo, apply, confirm, { name, create: true, from: d.hash })}
      >
        <p>{`It starts at “${subject}”, and you switch to it.`}</p>
        {repo.changed > 0 && <p className="mt-1">Your uncommitted changes come along.</p>}
      </NameDialog>
      <NameDialog
        open={dialog === 'tag'}
        title="Tag this commit"
        placeholder="Tag name, such as v1.2.0"
        note="A message (if it needs one)"
        confirm="Tag it"
        onClose={() => setDialog(null)}
        done={(name, note) => act('/api/git/tag', { name, hash: d.hash, message: note }, 'Tag', `Tagged it ${name}`)}
      >
        A tag marks this commit for good, such as a release. Push tags (in the ⋯ menu above) sends it to the remote.
      </NameDialog>
    </>
  );
}

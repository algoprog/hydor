// Stashes: changes put aside, to bring back later. Each with its message, the branch it was made on, when and
// how many files; one opens beside the list (on its own page on a phone) to what it holds, with Apply (it stays
// in the list), Apply and remove, and Drop. Stash changes asks for a message and whether new files go too.
import { useEffect, useState } from 'react';
import { PackageOpen, Trash2 } from 'lucide-react';
import type { GitActionResult, GitStash, GitStashDetail } from '@shared/types';
import { api, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, Empty, IconButton, inputCls, Switch, Throbber } from '../../components/ui';
import type { RepoCtx } from './RepoView';
import { BackBar, ChangedFiles, DiffLayoutSwitch, filesN, SPLIT_MIN, useDiffLayout, useWidth } from './parts';

/** Puts the uncommitted changes aside, with a message, new files too unless told otherwise. */
export function StashDialog({ ctx, open, onClose }: { ctx: RepoCtx; open: boolean; onClose: () => void }) {
  const { repo, apply } = ctx;
  const [message, setMessage] = useState('');
  const [untracked, setUntracked] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setMessage('');
  }, [open]);
  const hasNew = repo.files.some((f) => f.code === '??');
  const go = async () => {
    setBusy(true);
    try {
      if (apply(await post<GitActionResult>('/api/git/stash', { path: repo.path, message, untracked }), 'Stash', 'Put the changes aside')) onClose();
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
      title="Stash changes"
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !repo.files.length} onClick={go}>
            {busy ? 'Stashing…' : 'Stash'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-2">
        {repo.files.length === 1
          ? 'The file with changes goes back to how it was at the last commit; the changes wait under Stashes until you bring them back.'
          : `Your ${repo.files.length} files with changes go back to how they were at the last commit; the changes wait under Stashes until you bring them back.`}
      </p>
      <input autoFocus value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && void go()} placeholder="What these changes are (optional)" aria-label="Message" className={inputCls} />
      <label className={cx('mt-3 flex items-center gap-3 text-[13px]', !hasNew && 'opacity-50')}>
        <Switch on={untracked && hasNew} onChange={setUntracked} label="Take new files too" disabled={!hasNew} />
        <span className="min-w-0 flex-1">
          Take new files too
          <span className="block text-[12px] text-fg-3">{hasNew ? 'Files git doesn’t track yet go into the stash as well.' : 'There are no new files.'}</span>
        </span>
      </label>
    </Dialog>
  );
}

export function StashesTab({ ctx }: { ctx: RepoCtx }) {
  const { repo, wide, phone, sel, open } = ctx;
  const [stashing, setStashing] = useState(false);
  const list = repo.stashes;
  const current = list.find((s) => s.ref === sel.stash) ?? (wide ? list[0] : undefined);
  if (!wide && sel.stash && current)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <StashView key={current.ref + current.ts} ctx={ctx} s={current} onBack={() => open({ stash: null })} />
      </div>
    );
  const button = (
    <Button size="sm" variant="secondary" icon={<PackageOpen size={14} />} disabled={!repo.files.length || !!repo.op} onClick={() => setStashing(true)} title={repo.files.length ? undefined : 'Nothing to put aside: no changes'}>
      Stash changes
    </Button>
  );
  const dialog = <StashDialog ctx={ctx} open={stashing} onClose={() => setStashing(false)} />;
  if (!list.length)
    return (
      <div className="h-full overflow-y-auto">
        <Empty icon={<PackageOpen size={20} />} title="No stashes">
          A stash puts your uncommitted changes aside, so you can work on something else and bring them back later.
          <div className="mt-4">{button}</div>
        </Empty>
        {dialog}
      </div>
    );
  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-2.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-3">{list.length === 1 ? '1 stash' : `${list.length} stashes`}</span>
        {button}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {list.map((s) => (
          <button
            key={s.ref}
            onClick={() => open({ stash: s.ref }, !wide)}
            className={cx('flex w-full items-center gap-3 px-3 py-2 text-left max-md:py-3', current?.ref === s.ref && wide ? 'bg-bg-3' : 'hover:bg-bg-2')}
          >
            <PackageOpen size={15} className="shrink-0 text-fg-3" />
            <span className="min-w-0 flex-1">
              <span translate="no" className="block truncate text-[13.5px]">
                {s.message}
              </span>
              <Meta s={s} />
            </span>
          </button>
        ))}
      </div>
      {dialog}
    </div>
  );
  if (!wide) return listPane;
  return (
    <div className="flex h-full min-h-0">
      <div className={cx('shrink-0 border-r border-line', phone ? 'w-full' : 'w-[min(360px,42%)]')}>{listPane}</div>
      <div className="flex min-w-0 flex-1 flex-col">{current && <StashView key={current.ref + current.ts} ctx={ctx} s={current} />}</div>
    </div>
  );
}

function Meta({ s }: { s: GitStash }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
      {s.branch && (
        <>
          <span translate="no" className="truncate">{`on ${s.branch}`}</span>
          <span>·</span>
        </>
      )}
      <span className="shrink-0">{timeAgo(s.ts)}</span>
      {s.files != null && (
        <>
          <span>·</span>
          <span className="shrink-0">{filesN(s.files)}</span>
        </>
      )}
    </span>
  );
}

/** What a stash holds, and bringing it back or dropping it. */
function StashView({ ctx, s, onBack }: { ctx: RepoCtx; s: GitStash; onBack?: () => void }) {
  const { repo, apply, confirm } = ctx;
  const [d, setD] = useState<GitStashDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [layout, setLayout] = useDiffLayout();
  const [pane, paneWidth] = useWidth<HTMLDivElement>();
  const roomy = paneWidth >= SPLIT_MIN;
  useEffect(() => {
    let alive = true;
    api<GitStashDetail>(`/api/git/stash/show?path=${encodeURIComponent(repo.path)}&ref=${encodeURIComponent(s.ref)}`).then(
      (r) => alive && setD(r),
      (e) => alive && (toastError(e), setD({ ref: s.ref, files: [] })),
    );
    return () => {
      alive = false;
    };
  }, [repo.path, s.ref, s.ts]);
  const act = async (action: 'apply' | 'pop' | 'drop') => {
    if (action === 'drop' && !(await confirm({ title: 'Drop this stash?', body: `“${s.message}” is deleted, and what it holds with it. This can’t be undone.`, confirm: 'Drop', danger: true }))) return;
    setBusy(action);
    try {
      const ok = apply(
        await post<GitActionResult>(`/api/git/stash/${action}`, { path: repo.path, ref: s.ref }),
        action === 'drop' ? 'Drop the stash' : 'Apply the stash',
        action === 'drop' ? 'Dropped the stash' : action === 'pop' ? 'Brought the changes back and removed the stash' : 'Brought the changes back; the stash stays',
      );
      if (ok && action !== 'apply') ctx.open({ stash: null });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {onBack && <BackBar label="Stashes" onBack={onBack} />}
      <div ref={pane} className="min-h-0 flex-1 overflow-y-auto">
        <div className={cx('mx-auto max-w-[980px]', onBack ? 'px-3 py-3' : 'px-5 py-4')}>
          <h2 translate="no" className="text-[16px] leading-snug font-semibold tracking-tight break-words">
            {s.message}
          </h2>
          <div className="mt-1">
            <Meta s={s} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!!busy || !!repo.op} onClick={() => act('pop')} title="Bring the changes back, and take the stash off the list">
              {busy === 'pop' ? 'Applying…' : 'Apply and remove'}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!busy || !!repo.op} onClick={() => act('apply')} title="Bring the changes back, and keep the stash">
              {busy === 'apply' ? 'Applying…' : 'Apply'}
            </Button>
            <span className="flex-1" />
            <IconButton label="Drop this stash" onClick={() => act('drop')} disabled={!!busy}>
              <Trash2 size={15} />
            </IconButton>
          </div>
          <div className="mt-4 mb-2 flex items-center gap-2">
            <span className="text-[13px] font-medium">{d ? filesN(d.files.length) : ''}</span>
            <span className="flex-1" />
            {roomy && !!d?.files.length && <DiffLayoutSwitch value={layout} onChange={setLayout} />}
          </div>
          {!d ? (
            <div className="flex justify-center py-6 text-fg-3">
              <Throbber />
            </div>
          ) : (
            <ChangedFiles files={d.files} split={layout === 'split' && roomy} />
          )}
        </div>
      </div>
    </>
  );
}

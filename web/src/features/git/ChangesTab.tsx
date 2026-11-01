// Changes: every file changed since the last commit, each with a box that puts it in the next commit (all
// are in at first), its letter, its name and folder, and the lines added and removed. The file picked shows
// its diff beside the list (on its own page on a phone), unified or side by side, with Discard this part on
// each part. At the bottom of the list, the commit: a summary, an optional description, a draft written from
// the changes, and amending the last commit while no remote has it. A clean folder says so, calmly.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Ellipsis, EyeOff, FileText, FolderOpen, PackageOpen, Sparkles, Undo2 } from 'lucide-react';
import type { GitActionResult, GitFileStatus } from '@shared/types';
import { api, post } from '../../lib/api';
import { dirname, timeAgo } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Empty, IconButton, MenuItem, MenuSep, Popover, Throbber } from '../../components/ui';
import { goFolder } from '../files/actions';
import type { RepoCtx } from './RepoView';
import { BackBar, DiffLayoutSwitch, FileName, filesN, Letter, SPLIT_MIN, statusOf, useDiffLayout, useWidth } from './parts';
import { StashDialog } from './StashesTab';

// What you were writing and leaving out, per repository, kept while you look at other tabs.
const drafts = new Map<string, { summary: string; body: string; amend: boolean; filled?: string }>();
const skipped = new Map<string, Set<string>>();

/** The paths a change touches (a rename: both). */
const pathsOf = (f: GitFileStatus) => (f.from ? [f.from, f.path] : [f.path]);
const isNew = (f: GitFileStatus) => f.code === '??' || f.code[0] === 'A';

export function ChangesTab({ ctx }: { ctx: RepoCtx }) {
  const { repo, wide, sel, open } = ctx;
  const [skip, setSkipState] = useState<Set<string>>(() => skipped.get(repo.path) ?? new Set());
  const setSkip = (s: Set<string>) => {
    skipped.set(repo.path, s);
    setSkipState(s);
  };
  const [all, setAll] = useState(false);
  const [stashing, setStashing] = useState(false);
  const files = useMemo(() => [...repo.files].sort((a, b) => Number(!!b.conflict) - Number(!!a.conflict)), [repo.files]);
  const picked = files.filter((f) => !skip.has(f.path));
  const current = files.find((f) => f.path === sel.file) ?? (wide ? files[0] : undefined);
  const shown = all ? files : files.slice(0, 200);

  if (!files.length) return <Clean ctx={ctx} />;
  if (!wide && sel.file) {
    if (!current) return <Clean ctx={ctx} />;
    return (
      <div className="flex h-full min-h-0 flex-col">
        <FileDiff ctx={ctx} f={current} onBack={() => open({ file: null })} />
      </div>
    );
  }

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2.5 text-[12.5px] text-fg-3">
        {repo.op ? (
          <span className="min-w-0 flex-1 truncate">{`${filesN(files.length)} changed`}</span>
        ) : (
          <>
            <input
              type="checkbox"
              checked={!skip.size}
              ref={(el) => {
                if (el) el.indeterminate = skip.size > 0 && skip.size < files.length;
              }}
              onChange={(e) => setSkip(e.target.checked ? new Set() : new Set(files.map((f) => f.path)))}
              className="size-4 shrink-0 accent-[var(--accent)]"
              aria-label="Put every file in the commit"
              title="Put every file in the commit"
            />
            <span className="min-w-0 flex-1 truncate">{`${picked.length} of ${files.length} in the commit`}</span>
          </>
        )}
        {!repo.op && (
          <IconButton label="Put the changes aside (stash)" size="sm" onClick={() => setStashing(true)}>
            <PackageOpen size={14} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {shown.map((f) => (
          <FileRow
            key={f.code + f.path}
            ctx={ctx}
            f={f}
            active={!!current && current.path === f.path && wide}
            picked={!skip.has(f.path)}
            onPick={(v) => {
              const n = new Set(skip);
              if (v) n.delete(f.path);
              else n.add(f.path);
              setSkip(n);
            }}
          />
        ))}
        {files.length > shown.length && (
          <button onClick={() => setAll(true)} className="w-full px-3 py-2 text-left text-[12.5px] text-fg-3 hover:bg-bg-2 hover:text-fg-2">
            {`Show all ${files.length.toLocaleString()} files`}
          </button>
        )}
      </div>
      {!repo.op && <CommitBox ctx={ctx} picked={picked} />}
      <StashDialog ctx={ctx} open={stashing} onClose={() => setStashing(false)} />
    </div>
  );
  if (!wide) return list;
  return (
    <div className="flex h-full min-h-0">
      <div className="w-[min(340px,44%)] shrink-0 border-r border-line">{list}</div>
      <div className="flex min-w-0 flex-1 flex-col">{current && <FileDiff key={current.path} ctx={ctx} f={current} />}</div>
    </div>
  );
}

/** Every change committed: a calm word, and the last commit. */
function Clean({ ctx }: { ctx: RepoCtx }) {
  const c = ctx.repo.lastCommit;
  return (
    <div className="h-full overflow-y-auto">
      <Empty icon={<CheckCircle2 size={20} />} title="Nothing to commit">
        <p>Every change is committed.</p>
        {c && (
          <button onClick={() => ctx.open({ tab: 'history', c: c.hash })} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left hover:bg-bg-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] text-fg-3">The last commit</span>
              <span translate="no" className="block truncate text-[13.5px] text-fg">
                {c.subject}
              </span>
            </span>
            <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(c.ts)}</span>
          </button>
        )}
      </Empty>
    </div>
  );
}

function FileRow({ ctx, f, active, picked, onPick }: { ctx: RepoCtx; f: GitFileStatus; active: boolean; picked: boolean; onPick: (v: boolean) => void }) {
  const s = statusOf(f);
  return (
    <div
      onClick={() => ctx.open({ file: f.path }, !ctx.wide)}
      className={cx(
        'group flex h-9 cursor-pointer items-center gap-2 pr-1 pl-2.5 text-[13px] max-md:h-12 max-md:text-[14.5px]',
        active ? 'bg-bg-3' : 'hover:bg-bg-2 max-md:active:bg-bg-2',
      )}
    >
      {!ctx.repo.op && (
        <input
          type="checkbox"
          checked={picked}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onPick(e.target.checked)}
          className="size-4 shrink-0 accent-[var(--accent)] max-md:size-5"
          aria-label={`Put ${f.path} in the commit`}
        />
      )}
      <Letter s={s} />
      <FileName path={f.path} from={f.from} className="flex-1" />
      {f.binary ? <span className="shrink-0 text-[11.5px] text-fg-3">binary</span> : <DiffStat added={f.added ?? 0} removed={f.removed ?? 0} compact />}
      <FileMenu ctx={ctx} f={f} />
    </div>
  );
}

/** A file's ⋯: open it, show it in Files, put it back, or have git ignore it. */
function FileMenu({ ctx, f, always }: { ctx: RepoCtx; f: GitFileStatus; always?: boolean }) {
  const { repo, apply, confirm } = ctx;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const abs = `${repo.path}/${f.path.replace(/\/$/, '')}`;
  const fresh = isNew(f);
  const close = () => setOpen(false);
  const discard = async () => {
    close();
    const ok = await confirm({
      title: fresh ? `Delete ${f.path}?` : `Discard the changes to ${f.path}?`,
      body: fresh ? 'The new file is deleted. This can’t be undone.' : 'It goes back to how it was in the last commit. This can’t be undone.',
      confirm: fresh ? 'Delete' : 'Discard',
      danger: true,
    });
    if (!ok) return;
    try {
      apply(await post<GitActionResult>('/api/git/discard', { path: repo.path, files: pathsOf(f) }), 'Discard', fresh ? `Deleted ${f.path}` : `Discarded the changes to ${f.path}`);
    } catch (e) {
      toastError(e);
    }
  };
  const ignore = async () => {
    close();
    const tracked = f.code !== '??';
    if (tracked && !(await confirm({ title: `Stop tracking ${f.path}?`, body: 'Git stops keeping it (the next commit takes it out of the repository) and ignores it from now on. The file stays on this computer.', confirm: 'Stop tracking' }))) return;
    try {
      apply(await post<GitActionResult>('/api/git/ignore', { path: repo.path, file: f.path }), 'Ignore', tracked ? `Git stopped tracking ${f.path}` : `Git ignores ${f.path} now`);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <>
      <IconButton
        ref={ref}
        label={`More for ${f.path}`}
        size="sm"
        active={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cx(!always && !open && 'opacity-0 group-hover:opacity-100 max-md:opacity-100')}
      >
        <Ellipsis size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={250} title={f.path}>
        <div onClick={(e) => e.stopPropagation()}>
          {f.code[0] !== 'D' && f.code[1] !== 'D' && (
            <MenuItem icon={<FileText size={14} />} onClick={() => (close(), openFile(abs))}>
              Open the file
            </MenuItem>
          )}
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), goFolder(dirname(abs), abs))}>
            Show in Files
          </MenuItem>
          {!repo.op && (
            <>
              <MenuSep />
              <MenuItem icon={<Undo2 size={14} />} onClick={discard}>
                {fresh ? 'Delete the new file' : 'Discard the changes'}
              </MenuItem>
              <MenuItem icon={<EyeOff size={14} />} onClick={ignore}>
                {f.code === '??' ? 'Ignore it' : 'Stop tracking and ignore'}
              </MenuItem>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

/** The picked file's changes, unified or side by side; each part can be put back alone. */
function FileDiff({ ctx, f, onBack }: { ctx: RepoCtx; f: GitFileStatus; onBack?: () => void }) {
  const { repo, apply, confirm } = ctx;
  const [diff, setDiff] = useState<string | null>(null);
  const [layout, setLayout] = useDiffLayout();
  const [pane, paneWidth] = useWidth<HTMLDivElement>();
  const roomy = paneWidth >= SPLIT_MIN;
  const [busy, setBusy] = useState<number | null>(null);
  // Looked at again when the file changes (its line counts) or a commit is made.
  const stamp = `${f.code}:${f.added}:${f.removed}:${repo.head}`;
  useEffect(() => {
    let alive = true;
    const from = f.from ? `&from=${encodeURIComponent(f.from)}` : '';
    api<{ diff: string }>(`/api/git/diff?path=${encodeURIComponent(repo.path)}&file=${encodeURIComponent(f.path)}${from}`).then(
      (r) => alive && setDiff(r.diff),
      (e) => alive && setDiff(`(${(e as Error).message})`),
    );
    return () => {
      alive = false;
    };
  }, [repo.path, f.path, f.from, stamp]);
  const hunks = useMemo(() => {
    if (!diff) return [];
    const at = diff.search(/^@@ /m);
    return at < 0 ? [] : diff.slice(at).split(/^(?=@@ )/m);
  }, [diff]);
  const canPart = !isNew(f) && !repo.op && hunks.length > 1;
  const putBack = async (i: number) => {
    const ok = await confirm({ title: 'Discard this part of the changes?', body: 'These lines go back to how they were in the last commit; the rest of the file’s changes stay. This can’t be undone.', confirm: 'Discard', danger: true });
    if (!ok) return;
    setBusy(i);
    try {
      apply(await post<GitActionResult>('/api/git/discard-hunk', { path: repo.path, file: f.path, hunk: hunks[i] }), 'Discard', 'Discarded that part');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const abs = `${repo.path}/${f.path}`;
  const tools = (
    <>
      {roomy && <DiffLayoutSwitch value={layout} onChange={setLayout} />}
      {f.code[0] !== 'D' && f.code[1] !== 'D' && (
        <IconButton label="Open the file" size="sm" onClick={() => openFile(abs)}>
          <FileText size={14} />
        </IconButton>
      )}
      <FileMenu ctx={ctx} f={f} always />
    </>
  );
  return (
    <>
      {onBack ? (
        <BackBar label="Changes" onBack={onBack}>
          {tools}
        </BackBar>
      ) : (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
          <Letter s={statusOf(f)} />
          <FileName path={f.path} from={f.from} className="flex-1 text-[13px]" />
          {!f.binary && <DiffStat added={f.added ?? 0} removed={f.removed ?? 0} />}
          {tools}
        </div>
      )}
      {onBack && (
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-1.5 text-[14px]">
          <Letter s={statusOf(f)} />
          <FileName path={f.path} from={f.from} className="flex-1" />
          {!f.binary && <DiffStat added={f.added ?? 0} removed={f.removed ?? 0} />}
        </div>
      )}
      <div ref={pane} className="min-h-0 flex-1 overflow-auto">
        {f.conflict && (
          <div className="mx-3 mt-2.5 rounded-lg bg-err/8 px-3 py-2 text-[12.5px] text-fg-2">
            Both sides changed this file. Open it, keep what should stay between the markers (&lt;&lt;&lt;&lt;&lt;&lt;&lt; yours, ======= and &gt;&gt;&gt;&gt;&gt;&gt;&gt; theirs), and delete the markers.
          </div>
        )}
        {diff == null ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : f.binary ? (
          <div className="px-4 py-3 text-[12.5px] text-fg-3">A binary file: no lines to show.</div>
        ) : f.path.endsWith('/') ? (
          <div className="px-4 py-3 text-[12.5px] text-fg-3">A new folder: open it to see its files.</div>
        ) : (
          <DiffView
            diff={diff}
            split={layout === 'split' && roomy}
            className="text-[12px]"
            hunkAction={
              canPart
                ? (i) => (
                    <button
                      onClick={() => putBack(i)}
                      disabled={busy != null}
                      className="inline-flex h-5.5 items-center gap-1 rounded-md bg-bg-1 px-1.5 text-[11.5px] text-fg-3 ring-1 ring-line hover:text-fg disabled:opacity-50"
                    >
                      {busy === i ? <Throbber /> : <Undo2 size={11} />}
                      <span>Discard this part</span>
                    </button>
                  )
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}

/** The commit: a summary line, a description if wanted, a draft from the changes, Commit or Commit & push. */
function CommitBox({ ctx, picked }: { ctx: RepoCtx; picked: GitFileStatus[] }) {
  const { repo, apply } = ctx;
  const saved = drafts.get(repo.path);
  const [summary, setSummary] = useState(saved?.summary ?? '');
  const [body, setBody] = useState(saved?.body ?? '');
  const [amend, setAmend] = useState(saved?.amend ?? false);
  const filled = useRef(saved?.filled);
  const [busy, setBusy] = useState<'message' | 'commit' | 'push' | null>(null);
  const canAmend = !!repo.head && !repo.headPushed;
  const amending = amend && canAmend;
  useEffect(() => {
    drafts.set(repo.path, { summary, body, amend, filled: filled.current });
  }, [repo.path, summary, body, amend]);
  const message = body.trim() ? `${summary.trim()}\n\n${body.trim()}` : summary.trim();
  const chosen = picked.flatMap(pathsOf);
  const setMessage = (m: string) => {
    const [first, ...rest] = m.split('\n');
    setSummary(first.trim());
    setBody(rest.join('\n').trim());
  };
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
  // Amending starts from the last commit's message, when nothing is written yet.
  const toggleAmend = async (on: boolean) => {
    setAmend(on);
    if (on && !summary.trim() && !body.trim() && repo.head) {
      try {
        const d = await api<{ message: string }>(`/api/git/show?path=${encodeURIComponent(repo.path)}&hash=${repo.head}`);
        filled.current = d.message;
        setMessage(d.message);
      } catch {}
    } else if (!on && filled.current && message === filled.current.trim()) {
      filled.current = undefined;
      setSummary('');
      setBody('');
    }
  };
  const commit = async (push: boolean) => {
    setBusy(push ? 'push' : 'commit');
    try {
      const r = await post<GitActionResult>('/api/git/commit', { path: repo.path, files: chosen, message, push, amend: amending });
      const which = picked.length === 1 ? picked[0].path : filesN(picked.length);
      const ok = amending ? (push ? 'Amended the last commit and pushed' : 'Amended the last commit') : push ? `Committed ${which} and pushed` : `Committed ${which}`;
      if (apply(r, push ? 'Commit and push' : 'Commit', ok)) {
        setSummary('');
        setBody('');
        setAmend(false);
        filled.current = undefined;
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const ready = !busy && !!summary.trim() && (picked.length > 0 || amending);
  return (
    <div className="shrink-0 space-y-2 border-t border-line bg-bg-1 p-2.5 pb-[max(10px,var(--safe-bottom))]">
      <input
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && ready && void commit(false)}
        placeholder={amending ? 'Summary of the last commit' : 'Summary of the change'}
        aria-label="Summary"
        maxLength={300}
        className="h-9 w-full rounded-lg border border-line-2 bg-bg px-2.5 text-[13.5px] outline-none placeholder:text-fg-3 focus:border-accent/60 max-md:h-11 max-md:text-[15px]"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && ready && void commit(false)}
        placeholder="Description (if it needs one)"
        aria-label="Description"
        rows={body.split('\n').length > 2 ? 4 : 2}
        className="block w-full resize-none rounded-lg border border-line-2 bg-bg px-2.5 py-1.5 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60 max-md:text-[15px]"
      />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Button size="sm" variant="ghost" className="-ml-1.5" icon={busy === 'message' ? <Throbber /> : <Sparkles size={13} />} disabled={!!busy || !picked.length} onClick={draft} title="Draft a message from the changes picked">
          Write message
        </Button>
        <span className="flex-1" />
        {canAmend && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-fg-2" title="Change the last commit instead of making a new one (no remote has it yet)">
            <input type="checkbox" checked={amend} onChange={(e) => void toggleAmend(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
            Amend the last commit
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant={repo.remote ? 'secondary' : 'primary'} className="flex-1" disabled={!ready} onClick={() => commit(false)} title={`${picked.length === 1 ? '1 file' : filesN(picked.length)} (Ctrl+Enter)`}>
          {busy === 'commit' ? (amending ? 'Amending…' : 'Committing…') : amending ? 'Amend' : 'Commit'}
        </Button>
        {repo.remote && repo.branch && (
          <Button size="sm" variant="primary" className="flex-1" disabled={!ready} onClick={() => commit(true)} title={repo.upstream ? `Then push to ${repo.upstream}` : `Then publish ${repo.branch} to ${repo.remote}`}>
            {busy === 'push' ? 'Pushing…' : amending ? 'Amend & push' : 'Commit & push'}
          </Button>
        )}
      </div>
    </div>
  );
}


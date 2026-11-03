// The commits an agent made in a turn, under its reply: one small line ("2 commits · main · +120 −30") that
// opens to the list, and each commit opens to its message and diff.
import { useEffect, useState } from 'react';
import { ChevronRight, Copy, ExternalLink, GitCommitHorizontal } from 'lucide-react';
import type { CommitsNote as Data, TurnCommit } from '@shared/commits';
import type { SessionNote } from '@shared/features';
import type { GitCommitDetail } from '@shared/types';
import { DiffStat } from '../../components/DiffView';
import { Button, cx, Dialog, Empty, Throbber } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { useTimeline } from '../../lib/store';
import { ChangedFiles, commits as commitsN, copyText, DiffLayoutSwitch, filesN, repoUrl, short, SPLIT_MIN, useDiffLayout, useWidth } from './parts';

const full = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

export function CommitsNote({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as Data | null;
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<TurnCommit | null>(null);
  // A turn further up than the conversation has loaded shows its commits once it loads.
  const here = useTimeline((s) => {
    const tl = s.byKey[sessionKey];
    return !note.anchor || !tl || tl.start === 0 || tl.items.some((i) => i.id === note.anchor);
  });
  const list = d?.commits ?? [];
  if (!here || !list.length) return null;
  const added = list.reduce((n, c) => n + c.added, 0);
  const removed = list.reduce((n, c) => n + c.removed, 0);
  const branches = [...new Set(list.map((c) => c.branch).filter(Boolean))] as string[];
  // One commit opens straight to itself; several open to their list.
  const one = list.length === 1;
  return (
    <div className="px-1">
      <button
        onClick={() => (one ? setShown(list[0]) : setOpen((o) => !o))}
        aria-expanded={one ? undefined : open}
        className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-panel py-1 pr-2 pl-2.5 text-[12.5px] transition-colors hover:bg-bg-2"
      >
        <GitCommitHorizontal size={13} className="shrink-0 text-fg-3" />
        <span className="shrink-0 font-medium text-fg-2">{one ? 'Committed' : commitsN(list.length)}</span>
        {one ? (
          <span translate="no" className="min-w-0 truncate text-fg-3">
            · {list[0].subject}
          </span>
        ) : (
          branches.slice(0, 2).map((b) => (
            <span key={b} translate="no" className="hidden max-w-[10rem] shrink-0 truncate rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3 sm:inline">
              {b}
            </span>
          ))
        )}
        <DiffStat added={added} removed={removed} compact />
        <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', !one && open && 'rotate-90')} />
      </button>
      {!one && open && (
        <div className="mt-1.5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
          {list.map((c) => (
            <button key={c.hash} onClick={() => setShown(c)} className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left hover:bg-bg-2">
              <span translate="no" className="shrink-0 font-mono text-[11.5px] text-fg-3">
                {short(c.hash)}
              </span>
              <span translate="no" className="min-w-0 flex-1 truncate text-[13px] text-fg">
                {c.subject}
              </span>
              {c.branch && (
                <span translate="no" className="hidden max-w-[8rem] shrink-0 truncate rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3 sm:inline">
                  {c.branch}
                </span>
              )}
              <DiffStat added={c.added} removed={c.removed} compact />
            </button>
          ))}
        </div>
      )}
      {shown && <CommitDialog sessionKey={sessionKey} c={shown} onClose={() => setShown(null)} />}
    </div>
  );
}

// Below the turn's changed files: what was changed first, then how it was committed.
CommitsNote.afterChanges = true;

/** A commit the agent made: its whole message, who made it and when, and each file it changed with its diff. */
function CommitDialog({ sessionKey, c, onClose }: { sessionKey: string; c: TurnCommit; onClose: () => void }) {
  const [d, setD] = useState<GitCommitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layoutPref, setLayout] = useDiffLayout();
  const [box, width] = useWidth<HTMLDivElement>();
  const roomy = width >= SPLIT_MIN;
  useEffect(() => {
    let alive = true;
    api<GitCommitDetail>(`/api/commits/${encodeURIComponent(sessionKey)}/show?hash=${encodeURIComponent(c.hash)}`).then(
      (r) => alive && setD(r),
      (e) => alive && setError((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [sessionKey, c.hash]);
  const body = (d?.message ?? '').split('\n').slice(1).join('\n').trim();
  return (
    <Dialog
      open
      onClose={onClose}
      width={880}
      title={
        <span translate="no" className="min-w-0 break-words">
          {c.subject}
        </span>
      }
      footer={
        c.own ? (
          <Button size="sm" variant="secondary" icon={<ExternalLink size={13} />} onClick={() => (onClose(), go(repoUrl(c.repo, { tab: 'history', c: c.hash })))}>
            Open in Git
          </Button>
        ) : undefined
      }
    >
      <div ref={box} className="min-w-0">
        {body && (
          <pre translate="no" className="mb-2 font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">
            {body}
          </pre>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
          <span translate="no" className="text-fg-2" title={d?.email}>
            {d?.author ?? c.author}
          </span>
          <span>·</span>
          <span title={full.format(c.at)}>{timeAgo(c.at)}</span>
          <span>·</span>
          <button onClick={() => copyText(c.hash, 'Copied the hash')} title="Copy the whole hash" className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-1.5 font-mono text-[12px] text-fg-2 hover:bg-bg-3">
            {short(c.hash)}
            <Copy size={11} />
          </button>
          {c.branch && (
            <>
              <span>·</span>
              <span translate="no">{c.branch}</span>
            </>
          )}
          <span translate="no" className="min-w-0 truncate font-mono text-[11.5px]" title={c.repo}>
            {c.repo}
          </span>
        </div>
        <div className="mt-4 mb-2 flex items-center gap-2">
          <span className="text-[13px] font-medium">{filesN(d?.files.length ?? c.files)}</span>
          <span className="flex-1" />
          {roomy && !!d?.files.length && <DiffLayoutSwitch value={layoutPref} onChange={setLayout} />}
        </div>
        {error ? (
          <Empty icon={<GitCommitHorizontal size={20} />} title="Could not open this commit">
            {error}
          </Empty>
        ) : !d ? (
          <div className="flex justify-center py-8 text-fg-3">
            <Throbber size={24} />
          </div>
        ) : (
          <ChangedFiles key={d.hash} files={d.files} split={layoutPref === 'split' && roomy} />
        )}
      </div>
    </Dialog>
  );
}

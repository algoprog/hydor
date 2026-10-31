// A session's pull request: a badge for its state and checks, and a dialog that opens one (with a
// description a model can write), links one that exists, or shows how the linked one stands.
import { useEffect, useState } from 'react';
import { ExternalLink, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft, Sparkles } from 'lucide-react';
import type { PullRequestInfo, SessionSummary } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Throbber, inputCls } from '../../components/ui';
import { RefreshIcon } from '../../components/RefreshIcon';

const STATE: Record<PullRequestInfo['state'], { icon: typeof GitPullRequest; label: string; cls: string }> = {
  open: { icon: GitPullRequest, label: 'Open', cls: 'text-ok' },
  draft: { icon: GitPullRequestDraft, label: 'Draft', cls: 'text-fg-3' },
  merged: { icon: GitMerge, label: 'Merged', cls: 'text-codex' },
  closed: { icon: GitPullRequestClosed, label: 'Closed', cls: 'text-err' },
};

const CHECKS: Record<NonNullable<PullRequestInfo['checks']>, { label: string; cls: string }> = {
  pending: { label: 'checks running', cls: 'bg-busy' },
  success: { label: 'checks passed', cls: 'bg-ok' },
  failure: { label: 'checks failed', cls: 'bg-err' },
};

const hostName = (pr: PullRequestInfo) => (pr.provider === 'github' ? 'GitHub' : 'Gitea');

/** "#12" with the state's icon and colour, and a dot for the checks. */
export function PrBadge({ pr, className, onClick }: { pr: PullRequestInfo; className?: string; onClick?: () => void }) {
  const st = STATE[pr.state];
  const Icon = st.icon;
  const title = `${st.label} pull request #${pr.number}: ${pr.title}${pr.checks ? ` · ${CHECKS[pr.checks].label}` : ''}`;
  const body = (
    <>
      <Icon size={12} className={st.cls} />
      <span className="tabular-nums">#{pr.number}</span>
      {pr.checks && <span className={cx('h-1.5 w-1.5 rounded-full', CHECKS[pr.checks].cls)} />}
    </>
  );
  const cls = cx('inline-flex shrink-0 items-center gap-1 text-[11.5px] text-fg-3', className);
  return onClick ? (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cx(cls, 'rounded-md px-1 hover:bg-bg-3 hover:text-fg')}
    >
      {body}
    </button>
  ) : (
    <span title={title} className={cls}>
      {body}
    </span>
  );
}

interface Draft {
  head: string;
  base: string;
  remote: string;
  host?: { provider: 'github' | 'gitea'; web: string; owner: string; repo: string; login?: string };
  commits: { sha: string; subject: string }[];
  stat: { files: number; added: number; removed: number };
  dirty: number;
  pushed: boolean;
  existing?: PullRequestInfo;
}

export function PullRequestDialog({ s, open, onClose }: { s: SessionSummary; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={s.pr ? `Pull request #${s.pr.number}` : 'Open a pull request'} width={600}>
      {open && (s.pr ? <PrStatus s={s} pr={s.pr} onClose={onClose} /> : <PrCreate s={s} onClose={onClose} />)}
    </Dialog>
  );
}

function PrStatus({ s, pr, onClose }: { s: SessionSummary; pr: PullRequestInfo; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const st = STATE[pr.state];
  const Icon = st.icon;
  const refresh = async () => {
    setBusy(true);
    try {
      await post(`/api/sessions/${enc(s.key)}/pr/refresh`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4 text-[13.5px]">
      <div className="space-y-1.5 rounded-xl border border-line bg-bg-1 px-3.5 py-3">
        <div className="flex items-start gap-2">
          <Icon size={16} className={cx('mt-0.5 shrink-0', st.cls)} />
          <div className="min-w-0 flex-1 font-medium">{pr.title}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[12.5px] text-fg-3">
          <span className={st.cls}>{st.label}</span>
          <span>·</span>
          <span>
            {pr.repo} #{pr.number}
          </span>
          {pr.checks && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', CHECKS[pr.checks].cls)} />
                {CHECKS[pr.checks].label}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={pr.url} target="_blank" rel="noreferrer">
          <Button size="sm" variant="primary" icon={<ExternalLink size={13} />}>
            Open on {hostName(pr)}
          </Button>
        </a>
        <Button size="sm" variant="secondary" onClick={() => (onClose(), go(`/review/${enc(s.key)}`))}>
          Review the changes
        </Button>
        <Button size="sm" variant="ghost" icon={<RefreshIcon size={13} busy={busy} />} disabled={busy} onClick={refresh}>
          Check now
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => del(`/api/sessions/${enc(s.key)}/pr`).then(onClose, toastError)}>
          Unlink
        </Button>
      </div>
      <p className="text-[12px] leading-relaxed text-fg-3">The state and checks update every few minutes; you get a notice when it is merged or its checks finish.</p>
    </div>
  );
}

function PrCreate({ s, onClose }: { s: SessionSummary; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [commitAll, setCommitAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    api<Draft>(`/api/sessions/${enc(s.key)}/pr/draft`)
      .then((r) => {
        setD(r);
        // Without commits there is nothing to propose: the uncommitted work goes in.
        setCommitAll(!r.commits.length && r.dirty > 0);
        if (r.commits.length === 1) setTitle(r.commits[0].subject);
      })
      .catch((e) => setErr(e.message));
  }, [s.key]);

  const write = async () => {
    setWriting(true);
    try {
      const r = await post<{ title: string; body: string }>(`/api/sessions/${enc(s.key)}/pr/describe`);
      setTitle(r.title);
      setBody(r.body);
    } catch (e) {
      toastError(e);
    } finally {
      setWriting(false);
    }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await post<{ pr: PullRequestInfo }>(`/api/sessions/${enc(s.key)}/pr`, { title, body, draft, commitAll });
      toast(`Opened pull request #${r.pr.number}`, 'ok');
      window.open(r.pr.url, '_blank', 'noopener');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const link = async (u: string) => {
    setBusy(true);
    try {
      await post(`/api/sessions/${enc(s.key)}/pr/link`, { url: u });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (err)
    return (
      <div className="space-y-3 text-[13.5px]">
        <p className="leading-relaxed text-fg-2">{err}</p>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  if (!d)
    return (
      <div className="flex justify-center py-6 text-fg-3">
        <Throbber />
      </div>
    );
  const nothing = !d.commits.length && !(commitAll && d.dirty);
  return (
    <div className="space-y-3.5 text-[13.5px]">
      <div className="rounded-xl border border-line bg-bg-1 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-x-1.5 font-mono text-[12.5px]">
          <span className="text-fg">{d.head}</span>
          <span className="text-fg-3">→</span>
          <span className="text-fg">{d.base}</span>
          {d.host && (
            <span className="font-sans text-fg-3">
              {' '}
              on {d.host.owner}/{d.host.repo}
            </span>
          )}
        </div>
        <div className="mt-1 text-[12.5px] text-fg-3">
          {d.commits.length} commit{d.commits.length === 1 ? '' : 's'} · {d.stat.files} file{d.stat.files === 1 ? '' : 's'} (+{d.stat.added} −{d.stat.removed})
          {d.pushed ? ' · pushed' : ' · the branch is pushed when you open it'}
        </div>
      </div>
      {!d.host ? (
        <div className="space-y-2 rounded-xl border border-warn/30 bg-warn/8 px-3.5 py-3">
          <p className="leading-relaxed">No account covers this repository’s server yet. Add your GitHub account or Gitea server first.</p>
          <Button size="sm" variant="secondary" onClick={() => (onClose(), go('/settings?s=scm'))}>
            Settings → Source control
          </Button>
        </div>
      ) : d.existing ? (
        <div className="space-y-2 rounded-xl border border-line-2 px-3.5 py-3">
          <p className="leading-relaxed">
            This branch already has an open pull request: <span className="font-medium">#{d.existing.number}</span> {d.existing.title}
          </p>
          <Button size="sm" variant="primary" disabled={busy} onClick={() => link(d.existing!.url)}>
            Link it to this session
          </Button>
        </div>
      ) : (
        <>
          {d.dirty > 0 && (
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={commitAll} onChange={(e) => setCommitAll(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
              <span>
                Commit the {d.dirty} uncommitted change{d.dirty === 1 ? '' : 's'} first, with the title as the message
                <span className="block text-[12px] text-fg-3">Otherwise they stay out of the pull request.</span>
              </span>
            </label>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12.5px] font-medium text-fg-2">Title and description</span>
              <Button size="sm" variant="ghost" icon={writing ? undefined : <Sparkles size={13} />} disabled={writing || !d.commits.length} onClick={write} title={d.commits.length ? 'A model reads the commits and the diff and writes them' : 'Commit something first'}>
                {writing ? (
                  <span className="inline-flex items-center gap-2">
                    <Throbber /> Writing…
                  </span>
                ) : (
                  'Write it for me'
                )}
              </Button>
            </div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={cx(inputCls, 'text-[13.5px]')} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} placeholder="What it changes and why (Markdown)" className={cx(inputCls, 'h-auto py-2 text-[13px] leading-relaxed')} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} className="accent-[var(--accent)]" />
              Draft
            </label>
            <span className="flex-1" />
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<GitPullRequest size={14} />} disabled={busy || !title.trim() || nothing} onClick={create}>
              {busy ? 'Opening…' : 'Open pull request'}
            </Button>
          </div>
        </>
      )}
      <div className="border-t border-line pt-3 text-[12.5px] text-fg-3">
        {linking ? (
          <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), url.trim() && link(url))}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/12" className={cx(inputCls, 'h-8 text-[12.5px]')} autoFocus />
            <Button size="sm" variant="secondary" type="submit" disabled={busy || !url.trim()}>
              Link
            </Button>
          </form>
        ) : (
          <button className="hover:text-fg hover:underline" onClick={() => setLinking(true)}>
            Link a pull request that already exists…
          </button>
        )}
      </div>
    </div>
  );
}

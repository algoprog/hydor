// Reviewing what a session's branch changes: every file against the base (committed or not), each
// collapsible, with a "Viewed" mark that lasts until the file changes again. "Guide me" asks a model
// for a reading order with a note per file, kept for exactly these changes.
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ExternalLink, FileDiff, ListOrdered, Sparkles } from 'lucide-react';
import type { PullRequestInfo } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Button, cx, Throbber, Empty } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { PrBadge } from '../session/PullRequest';
import { RefreshIcon } from '../../components/RefreshIcon';

interface ReviewFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  added: number;
  removed: number;
  diff: string;
  binary?: boolean;
  uncommitted?: boolean;
  hash: string;
}

interface Guide {
  summary: string;
  steps: { path: string; note: string }[];
}

interface Review {
  head: string;
  base: string;
  files: ReviewFile[];
  uncommitted: number;
  guide?: Guide;
}

const STATUS: Record<ReviewFile['status'], { letter: string; cls: string; label: string }> = {
  added: { letter: 'A', cls: 'text-ok', label: 'added' },
  modified: { letter: 'M', cls: 'text-warn', label: 'changed' },
  deleted: { letter: 'D', cls: 'text-err', label: 'deleted' },
  renamed: { letter: 'R', cls: 'text-info', label: 'renamed' },
};

/** Files marked viewed, by path, with the version that was viewed. */
function useViewed(key: string) {
  const storeKey = `wa.viewed.${key}`;
  const [map, setMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) ?? '{}');
    } catch {
      return {};
    }
  });
  const set = (path: string, hash: string | null) =>
    setMap((m) => {
      const next = { ...m };
      if (hash) next[path] = hash;
      else delete next[path];
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [map, set] as const;
}

export function ReviewPage({ sessionKey }: { sessionKey: string }) {
  const s = useSessions((x) => x.byKey[sessionKey]);
  const [r, setR] = useState<Review | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [guided, setGuided] = useState(false);
  const [writing, setWriting] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [viewed, setViewed] = useViewed(sessionKey);

  const load = () => {
    setErr(null);
    api<Review>(`/api/sessions/${enc(sessionKey)}/review`)
      .then((x) => {
        setR(x);
        if (x.guide) setGuided(true);
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [sessionKey]);

  const guide = async () => {
    setWriting(true);
    try {
      const g = await post<{ guide: Guide }>(`/api/sessions/${enc(sessionKey)}/review/guide`);
      setR((x) => (x ? { ...x, guide: g.guide } : x));
      setGuided(true);
    } catch (e) {
      toastError(e);
    } finally {
      setWriting(false);
    }
  };

  const order = useMemo(() => {
    if (!r) return [];
    if (!guided || !r.guide) return r.files.map((f) => ({ f, note: '' }));
    const byPath = new Map(r.files.map((f) => [f.path, f]));
    return r.guide.steps.flatMap((st) => (byPath.has(st.path) ? [{ f: byPath.get(st.path)!, note: st.note }] : []));
  }, [r, guided]);

  const isViewed = (f: ReviewFile) => viewed[f.path] === f.hash;
  const done = r ? r.files.filter(isViewed).length : 0;
  const totals = r ? r.files.reduce((a, f) => ({ added: a.added + f.added, removed: a.removed + f.removed }), { added: 0, removed: 0 }) : null;
  const expanded = (f: ReviewFile) => open[f.path] ?? !isViewed(f);
  const jump = (path: string) => {
    setOpen((o) => ({ ...o, [path]: true }));
    requestAnimationFrame(() => document.getElementById(`rv-${path}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={s ? `Review: ${s.title}` : 'Review'}
        sub={r ? `${r.head} against ${r.base} · ${r.files.length} file${r.files.length === 1 ? '' : 's'}${r.uncommitted ? ` · ${r.uncommitted} not committed` : ''}` : 'What the session’s branch changes'}
        actions={
          <div className="flex items-center gap-1.5">
            {s?.pr && <PrLink pr={s.pr} />}
            <Button size="sm" variant="ghost" onClick={() => openSession(sessionKey)}>
              Session
            </Button>
          </div>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {err ? (
          <Empty icon={<FileDiff size={22} />} title="Nothing to review here">
            {err}
          </Empty>
        ) : !r ? (
          <div className="flex justify-center py-10 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : !r.files.length ? (
          <Empty icon={<FileDiff size={22} />} title="No changes">
            {r.head} has nothing beyond {r.base} yet.
          </Empty>
        ) : (
          <div className="mx-auto flex max-w-[1180px] gap-6 px-3 py-4 sm:px-6">
            <aside className="sticky top-4 hidden max-h-[calc(100dvh-140px)] w-[260px] shrink-0 self-start overflow-y-auto lg:block">
              <div className="mb-2 flex items-center gap-2 text-[12px] text-fg-3">
                <span className="flex-1">
                  {done} of {r.files.length} viewed
                </span>
                {totals && <DiffStat added={totals.added} removed={totals.removed} compact />}
              </div>
              <div className="mb-3 h-1 overflow-hidden rounded-full bg-bg-3">
                <div className="h-full rounded-full bg-ok transition-[width] duration-300" style={{ width: `${(done / r.files.length) * 100}%` }} />
              </div>
              {order.map(({ f }, i) => (
                <button key={f.path} onClick={() => jump(f.path)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[12.5px] hover:bg-bg-2" title={f.path}>
                  {guided && r.guide ? <span className="w-4 shrink-0 text-right text-[11px] text-fg-3 tabular-nums">{i + 1}</span> : <span className={cx('w-3 shrink-0 font-mono text-[11px]', STATUS[f.status].cls)}>{STATUS[f.status].letter}</span>}
                  <span className={cx('min-w-0 flex-1 truncate', isViewed(f) ? 'text-fg-3' : 'text-fg')}>{f.path.split('/').pop()}</span>
                  {isViewed(f) && <Check size={12} className="shrink-0 text-ok" />}
                </button>
              ))}
            </aside>
            <main className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {r.guide ? (
                  <div className="inline-flex rounded-[10px] bg-bg-2 p-0.5">
                    {[
                      { v: true, label: 'Guided order', icon: <ListOrdered size={13} /> },
                      { v: false, label: 'By path', icon: null },
                    ].map((o) => (
                      <button
                        key={String(o.v)}
                        onClick={() => setGuided(o.v)}
                        className={cx('inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium', guided === o.v ? 'bg-panel text-fg shadow-sm ring-1 ring-line' : 'text-fg-3 hover:text-fg')}
                      >
                        {o.icon}
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" icon={writing ? undefined : <Sparkles size={13} />} disabled={writing} onClick={guide}>
                    {writing ? (
                      <span className="inline-flex items-center gap-2">
                        <Throbber /> Reading the changes…
                      </span>
                    ) : (
                      'Guide me through it'
                    )}
                  </Button>
                )}
                <span className="flex-1" />
                <span className="text-[12px] text-fg-3 lg:hidden">
                  {done} of {r.files.length} viewed
                </span>
                <Button size="sm" variant="ghost" icon={<RefreshIcon size={13} />} onClick={load}>
                  Reload
                </Button>
              </div>
              {guided && r.guide?.summary && (
                <div className="rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-[13.5px] leading-relaxed">
                  <Prose text={r.guide.summary} />
                </div>
              )}
              {order.map(({ f, note }, i) => (
                <section key={f.path} id={`rv-${f.path}`} className="scroll-mt-4 overflow-hidden rounded-xl border border-line bg-panel">
                  {guided && note && (
                    <div className="flex gap-2.5 border-b border-line bg-bg-1 px-3.5 py-2.5 text-[13px] leading-relaxed text-fg-2">
                      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-fg">{i + 1}</span>
                      <span>
                        <Prose text={note} />
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button onClick={() => setOpen((o) => ({ ...o, [f.path]: !expanded(f) }))} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={expanded(f)}>
                      {expanded(f) ? <ChevronDown size={14} className="shrink-0 text-fg-3" /> : <ChevronRight size={14} className="shrink-0 text-fg-3" />}
                      <span className={cx('shrink-0 font-mono text-[11px]', STATUS[f.status].cls)} title={STATUS[f.status].label}>
                        {STATUS[f.status].letter}
                      </span>
                      <span className="min-w-0 truncate font-mono text-[12.5px] text-fg" title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}>
                        {f.oldPath ? `${f.oldPath} → ` : ''}
                        {f.path}
                      </span>
                      {f.uncommitted && <span className="shrink-0 rounded-md bg-warn/12 px-1.5 py-px text-[11px] text-warn">not committed</span>}
                    </button>
                    <DiffStat added={f.added} removed={f.removed} compact className="shrink-0 text-[12px]" />
                    <label className={cx('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[12px]', isViewed(f) ? 'text-ok' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}>
                      <input
                        type="checkbox"
                        checked={isViewed(f)}
                        onChange={(e) => {
                          setViewed(f.path, e.target.checked ? f.hash : null);
                          setOpen((o) => ({ ...o, [f.path]: !e.target.checked }));
                        }}
                        className="accent-[var(--ok)]"
                      />
                      Viewed
                    </label>
                  </div>
                  {expanded(f) && (f.binary ? <div className="border-t border-line px-3.5 py-2 text-[12.5px] text-fg-3">A binary file: no text changes to show.</div> : <DiffView diff={f.diff} className="border-t border-line" />)}
                </section>
              ))}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}

/** Text with `code` spans, as the guide writes file and function names. */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`\n]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={i} className="rounded bg-bg-3 px-1 py-px font-mono text-[12px]">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function PrLink({ pr }: { pr: PullRequestInfo }) {
  return (
    <a href={pr.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-fg-2 hover:bg-bg-2 hover:text-fg">
      <PrBadge pr={pr} />
      <ExternalLink size={12} />
    </a>
  );
}

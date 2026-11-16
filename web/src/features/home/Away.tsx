// While you were away: under the start page's message box, what happened since your last visit (GET /api/away,
// server/away). Folded to one line, what matters first ("1 needs you · 1 failed · 3 done · next: Morning brief at 07:30
// · Since yesterday 18:40"), each part of which opens it to those rows (on a phone the whole line opens it, and the time
// is in the opened header alone); open, it shows up to six rows,
// most important first: what waits on you (an approval or a held call answered right here, with the Inbox's own cards),
// sessions that finished (with a line of their last reply and the files they made), what ran by itself (with how it went
// and its cost), and what runs next today. It stays folded until you open it, and as you left it on this device. Mark
// all as seen clears it.
// With nothing to show, or on a machine whose older server has no such route, it is not there.
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleMinus, ChevronDown, ChevronRight, CalendarClock, FileText, Hand, History } from 'lucide-react';
import { AWAY_SHOWN, awayHasNews, type AwayBy, type AwayRow, type AwaySummary } from '@shared/away';
import { api, ApiError, post } from '../../lib/api';
import { activityOf } from '../../lib/activity';
import { basename, timeAgo, usd } from '../../lib/format';
import { machineBase } from '../../lib/machine';
import { go, openFile } from '../../lib/nav';
import { toastError, useSessions, useUI } from '../../lib/store';
import { LOCALE } from '../../i18n/locale';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, useIsMobile } from '../../components/ui';
import { ApprovalCard } from '../session/Approval';
import { OutboxCard } from '../outbox/OutboxCard';
import { useOutbox } from '../outbox/store';

const DAY = 86_400_000;
const hm = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });
const dayMonth = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });

/** "Since 09:15", "Since yesterday 18:40", "Since Monday 18:40", "Since 3 Nov". */
export function sinceText(t: number, now = Date.now()): string {
  const d = new Date(t);
  const n = new Date(now);
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  if (t >= today) return `Since ${hm.format(d)}`;
  if (t >= today - DAY) return `Since yesterday ${hm.format(d)}`;
  if (t >= today - 6 * DAY) return `Since ${weekday.format(d)} ${hm.format(d)}`;
  return `Since ${dayMonth.format(d)}`;
}

/** Your midnight, for what runs next today. */
const endOfToday = () => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

type Only = 'needs' | 'done' | 'failed' | null;
const fits = (r: AwayRow, only: Only) => !only || (only === 'needs' ? r.group === 'needs' : only === 'failed' ? r.outcome === 'failed' : r.group !== 'needs' && r.outcome === 'done');

/** The summary, asked for again as sessions finish or start waiting, as held calls come and go, and every few minutes. */
function useAway(): { sum: AwaySummary | null; reload: () => void } {
  const [sum, setSum] = useState<AwaySummary | null>(null);
  // An older server has no such route: asked no more.
  const gone = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(() => {
    if (gone.current) return;
    api<AwaySummary>(`/api/away?until=${endOfToday()}`).then(
      (s) => setSum(s && Array.isArray(s.rows) ? s : null),
      (e) => {
        if (e instanceof ApiError && e.status === 404) (gone.current = true), setSum(null);
      },
    );
  }, []);
  const reload = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 400);
  }, [load]);
  // What changes it: a turn ending (or seen), a session waiting on you, a call held or settled.
  const sig = useSessions((s) => {
    let at = 0;
    let waiting = 0;
    for (const k of s.order) {
      const x = s.byKey[k];
      if (!x) continue;
      at = Math.max(at, x.doneAt ?? 0, x.endedAt ?? 0, x.seenAt ?? 0);
      if (activityOf(x)?.status === 'waiting') waiting += 1 + (x.live?.pendingApprovals ?? 0);
    }
    return `${at}:${waiting}`;
  });
  const held = useOutbox((s) => s.version);
  // At once when the page opens; after that, a moment after what changes it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) (first.current = false), load();
    else reload();
  }, [sig, held, load, reload]);
  useEffect(() => {
    const back = () => document.visibilityState === 'visible' && reload();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 3 * 60_000);
    document.addEventListener('visibilitychange', back);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', back);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, reload]);
  return { sum, reload };
}

const BY: Record<AwayBy, string> = { task: 'Scheduled task', agent: 'Agent', app: 'App' };

function OutcomeIcon({ r }: { r: AwayRow }) {
  if (r.group === 'needs') return <Hand size={15} className="text-warn" />;
  if (r.outcome === 'failed') return <CircleAlert size={15} className="text-err" />;
  if (r.outcome === 'quiet') return <CircleMinus size={15} className="text-fg-3" />;
  return <CircleCheck size={15} className="text-ok" />;
}

const OUTCOME: Record<AwayRow['outcome'], string> = { waiting: 'Needs you', done: 'Done', failed: 'Failed', quiet: 'Nothing new' };

/** A row's small print: how it went, what ran it, its files, its cost, when. Only the session's name gives way when room is short. */
function Meta({ r }: { r: AwayRow }) {
  const parts: [ReactNode, boolean?][] = [];
  parts.push([<span className={cx(r.outcome === 'failed' ? 'text-err' : r.group === 'needs' ? 'text-warn' : r.outcome === 'done' ? 'text-ok' : undefined)}>{OUTCOME[r.outcome]}</span>]);
  if (r.group === 'ran' && r.by) parts.push([r.by === 'agent' && r.byName ? <span translate="no">{r.byName}</span> : <span>{BY[r.by]}</span>]);
  if (r.group === 'needs' && r.session)
    parts.push([
      <span translate="no" className="min-w-0 truncate">
        {r.session}
      </span>,
      true,
    ]);
  if (r.fileCount && !r.files?.length) parts.push([<span>{r.fileCount === 1 ? '1 file changed' : `${r.fileCount} files changed`}</span>]);
  if (r.costUsd) parts.push([<span className="tnum">{usd(r.costUsd)}</span>]);
  parts.push([<span>{timeAgo(r.at)}</span>]);
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12px] whitespace-nowrap text-fg-3">
      {parts.map(([p, gives], i) => (
        <span key={i} className={cx('flex items-center gap-1.5', gives ? 'min-w-0' : 'shrink-0')}>
          {i > 0 && <span aria-hidden>·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}

/** The files a session made, each opening in Files; how many more it made or changed. */
function Files({ r }: { r: AwayRow }) {
  if (!r.files?.length) return null;
  // Three named; the rest (more it made, and those it changed) counted.
  const more = (r.fileCount ?? r.files.length) - Math.min(3, r.files.length);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {r.files.slice(0, 3).map((f) => (
        <button
          key={f}
          type="button"
          title={f}
          onClick={(e) => (e.stopPropagation(), openFile(f))}
          className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-line bg-bg-1 px-1.5 py-0.5 text-[11.5px] text-fg-2 hover:border-line-2 hover:text-fg"
        >
          <FileText size={11} className="shrink-0 text-fg-3" />
          <span translate="no" className="truncate">
            {basename(f)}
          </span>
        </button>
      ))}
      {more > 0 && <span className="text-[11.5px] text-fg-3">{`+${more} more`}</span>}
    </span>
  );
}

function Row({ r, onDone }: { r: AwayRow; onDone: () => void }) {
  const [answering, setAnswering] = useState(false);
  const it = r.item;
  // What people and agents wrote (a session's title and reply, a task's name) stays as it is; what waits on you is told
  // in the app's words, as the Inbox tells it.
  const own = r.group !== 'needs';
  // Answered right here with the Inbox's own cards: an approval, question or form, or a held call.
  const inPlace = !!it && ((!!it.approval && !!it.key && !!it.agent) || !!it.outbox);
  return (
    <li className="border-b border-line last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => go(r.path)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(r.path))}
        className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-bg-2/60 max-sm:py-3"
      >
        <span className="mt-0.5 flex shrink-0">
          <OutcomeIcon r={r} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            {r.agent && r.group !== 'ran' && <AgentIcon agent={r.agent} name={r.acpName} size={13} className="shrink-0" />}
            <span translate={own ? 'no' : undefined} className="min-w-0 truncate text-[13.5px] font-medium text-fg">
              {r.title}
            </span>
          </span>
          {r.line && (
            <span translate={own ? 'no' : undefined} className="mt-0.5 block truncate text-[12.5px] text-fg-2">
              {r.line}
            </span>
          )}
          <Files r={r} />
          <span className="mt-0.5 block">
            <Meta r={r} />
          </span>
        </span>
        {inPlace ? (
          <Button size="sm" variant={answering ? 'ghost' : 'secondary'} className="shrink-0" onClick={(e) => (e.stopPropagation(), setAnswering((a) => !a))}>
            {answering ? 'Close' : 'Answer here'}
          </Button>
        ) : (
          <ChevronRight size={15} className="mt-0.5 shrink-0 text-fg-3" />
        )}
      </div>
      {answering && it && (
        <div className="px-3 pb-3">
          {it.outbox ? (
            <OutboxCard c={it.outbox} base={machineBase} onDone={onDone} />
          ) : it.approval && it.key && it.agent ? (
            <ApprovalCard a={it.approval} sessionKey={it.key} agent={it.agent} base={machineBase} onDone={onDone} />
          ) : null}
        </div>
      )}
    </li>
  );
}

/** One part of the folded line: a button on a computer, plain words on a phone (the whole line opens it there). */
function Part({ children, onClick, tone, title, plain }: { children: ReactNode; onClick?: () => void; tone?: string; title?: string; plain: boolean }) {
  if (plain || !onClick) return <span className={tone}>{children}</span>;
  return (
    <button type="button" title={title} onClick={(e) => (e.stopPropagation(), onClick())} className={cx(tone, 'rounded-md hover:text-fg hover:underline hover:underline-offset-2')}>
      {children}
    </button>
  );
}

export function Away() {
  const mobile = useIsMobile();
  const { sum, reload } = useAway();
  // Folded until you open it; open or folded, it stays as you left it on this device.
  const open = useUI((s) => s.awayOpen);
  const setOpen = (v: boolean) => useUI.getState().set({ awayOpen: v });
  const [only, setOnly] = useState<Only>(null);
  const [all, setAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  if (!sum || !awayHasNews(sum)) return null;
  const c = sum.counts;
  const show = (o: Only) => (setOnly(o), setAll(false), setOpen(true));
  const rows = sum.rows.filter((r) => fits(r, only));
  const shown = all ? rows : rows.slice(0, AWAY_SHOWN);
  const next = sum.next[0];
  const nextLine = next ? `next: ${next.name} at ${hm.format(next.at)}` : null;
  const markSeen = async () => {
    setClearing(true);
    try {
      await post('/api/away/seen', { at: sum.now });
      setOnly(null);
      reload();
    } catch (e) {
      toastError(e);
    } finally {
      setClearing(false);
    }
  };

  // What matters first, so a phone never cuts it: what needs you, what failed, what is done, what runs next; since when
  // last (on a phone only in the opened header).
  const parts: ReactNode[] = [];
  if (c.needs)
    parts.push(
      <Part key="needs" plain={mobile} onClick={() => show('needs')} title="Show what waits on you" tone="font-medium text-warn">
        {c.needs === 1 ? '1 needs you' : `${c.needs} need you`}
      </Part>,
    );
  if (c.failed)
    parts.push(
      <Part key="failed" plain={mobile} onClick={() => show('failed')} title="Show what failed" tone="text-err">
        {`${c.failed} failed`}
      </Part>,
    );
  if (c.done)
    parts.push(
      <Part key="done" plain={mobile} onClick={() => show('done')} title="Show what finished">
        {`${c.done} done`}
      </Part>,
    );
  if (nextLine)
    parts.push(
      <Part key="next" plain={mobile} onClick={() => go(next.path)} title="Open the task">
        {nextLine}
      </Part>,
    );
  if (!mobile)
    parts.push(
      <Part key="since" plain={mobile} onClick={() => show(null)} title="Show everything since your last visit" tone="text-fg-3">
        {sinceText(sum.since)}
      </Part>,
    );

  // One line of words, cut at its end when there is not room for all of it.
  const line = (
    <span className="block min-w-0 flex-1 truncate text-[12.5px] text-fg-2">
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="mx-1.5 text-fg-3">
              ·
            </span>
          )}
          {p}
        </Fragment>
      ))}
    </span>
  );

  return (
    <section aria-label="While you were away" className="anim-in mt-4 overflow-hidden rounded-xl border border-line bg-panel/60">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        title={open ? 'Fold' : 'While you were away: open'}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(!open))}
        className={cx('flex cursor-pointer items-center gap-2 px-3 text-left', mobile ? 'min-h-11 py-2' : 'py-2', open && 'border-b border-line')}
      >
        <History size={14} className="shrink-0 text-fg-3" />
        {open ? (
          // On a phone the time goes under the title, clear of Mark all as seen.
          <span className={cx('flex min-w-0 flex-1 text-[12.5px]', mobile ? 'flex-col' : 'items-center gap-1.5')}>
            <span className="shrink-0 font-medium text-fg">While you were away</span>
            {!mobile && (
              <span aria-hidden className="text-fg-3">
                ·
              </span>
            )}
            <span className="truncate text-fg-3">{sinceText(sum.since)}</span>
          </span>
        ) : (
          line
        )}
        {open && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-[12px]"
            disabled={clearing}
            title="Clear this list: what is in it counts as seen, and the sessions in it as opened"
            onClick={(e) => (e.stopPropagation(), void markSeen())}
          >
            Mark all as seen
          </Button>
        )}
        <ChevronDown size={15} className={cx('shrink-0 text-fg-3 transition-transform', !open && '-rotate-90')} />
      </div>
      {open && (
        <div>
          {only && (
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] text-fg-3">
              <span>{only === 'needs' ? 'What waits on you' : only === 'failed' ? 'What failed' : 'What finished'}</span>
              <button type="button" onClick={() => setOnly(null)} className="rounded-md px-1 text-accent hover:underline">
                Show all
              </button>
            </div>
          )}
          <ul>
            {shown.map((r) => (
              <Row key={r.id} r={r} onDone={reload} />
            ))}
          </ul>
          {rows.length > shown.length && (
            <button type="button" onClick={() => setAll(true)} className="w-full border-t border-line px-3 py-2 text-left text-[12.5px] text-fg-3 hover:bg-bg-2/60 hover:text-fg">
              {`Show ${rows.length - shown.length} more`}
            </button>
          )}
          {sum.next.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line px-3 py-2 text-[12.5px] text-fg-3">
              <CalendarClock size={14} className="shrink-0" />
              <span>Next today:</span>
              {sum.next.map((n, i) => (
                <span key={n.id} className="flex items-center gap-x-1.5">
                  {i > 0 && <span aria-hidden>·</span>}
                  <button type="button" onClick={() => go(n.path)} className="rounded-md text-fg-2 hover:text-fg hover:underline hover:underline-offset-2">
                    <span translate="no">{n.name}</span> <span className="tnum">{hm.format(n.at)}</span>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

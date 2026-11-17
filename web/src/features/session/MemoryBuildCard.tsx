// The card a new session in a project with no wiki memory shows first: whether to build the memory before the agent
// starts (what it would read, how long it takes), then the build's progress while the first message waits, and what to
// do when the build fails. The choices go to the session (POST /api/sessions/:key/approvals/memory-ask); the server
// holds the first message and starts the agent (server/wiki/ask.ts, sessions.ts).
import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { ApprovalRequest, MemoryAsk } from '@shared/types';
import { api, enc } from '../../lib/api';
import { money } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { cx } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { WikiJobProgress } from '../wiki/WikiJobProgress';

/** What a project has that the memory is built from, as pills: "38 sessions", "412 commits", "README, docs/". */
export function memoryPills(c: MemoryAsk['counts']): string[] {
  const n = (k: number, one: string, many: string) => (k === 1 ? one : many);
  return [
    c.sessions > 0 ? n(c.sessions, tr('1 session'), tr(`${c.sessions.toLocaleString()} sessions`)) : '',
    c.commits > 0 ? n(c.commits, tr('1 commit'), tr(`${c.commits.toLocaleString()} commits`)) : '',
    c.documents > 0 ? n(c.documents, tr('1 document'), tr(`${c.documents.toLocaleString()} documents`)) : '',
    c.notes > 0 ? n(c.notes, tr('1 note'), tr(`${c.notes.toLocaleString()} notes`)) : '',
    c.files.length ? c.files.map((f) => f.replace(/\.md$/i, '')).join(', ') : '',
  ].filter(Boolean);
}

/** How long it takes and what it costs, as one line. */
export function memoryLine(m: Pick<MemoryAsk, 'minutes' | 'helper'>): string {
  const min = Math.max(1, m.minutes);
  if (!m.helper.priced) return tr(`About ${min} min, then the agent starts. The rest builds in the background, on your Claude plan.`);
  if (!m.helper.usd) return tr(`About ${min} min, then the agent starts. The rest builds in the background, free on this computer.`);
  return tr(`About ${min} min, then the agent starts. The rest builds in the background, about ${money(m.helper.usd)} in all.`);
}

/** Full width and tall enough to tap on a phone (under 480 px, stacked); in a row on wider screens. */
const BTN = 'inline-flex min-h-11 w-full items-center justify-center rounded-[10px] px-4 text-[13.5px] font-medium transition duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 min-[480px]:min-h-9 min-[480px]:w-auto';
const PRIMARY = `${BTN} bg-accent text-accent-fg hover:opacity-90`;
const PLAIN = `${BTN} bg-bg-2 text-fg ring-1 ring-line-2 ring-inset hover:bg-bg-3`;

export function MemoryBuildCard({ a, sessionKey, id, base, onDone }: { a: ApprovalRequest; sessionKey: string; id?: string; base?: string; onDone?: () => void }) {
  const m = a.memory!;
  const [busy, setBusy] = useState(false);
  const choose = async (decision: string) => {
    setBusy(true);
    try {
      const r = await api<{ key?: string }>(`/api/sessions/${enc(sessionKey)}/approvals/${enc(a.id)}`, { method: 'POST', base, body: { decision } });
      // Started in a new session: its page opens, with the first message in it.
      if (r?.key) openSession(r.key);
      onDone?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const asking = m.state === 'asking';
  const failed = m.state === 'failed';
  const title = asking ? tr(`Build ${m.name}’s memory first?`) : failed && m.startFailed ? tr(`${m.name} did not start`) : failed ? tr(`Building ${m.name}’s memory did not finish`) : tr(`Building ${m.name}’s memory`);
  return (
    <div id={id} className={cx('anim-pop my-2 overflow-hidden rounded-xl border bg-panel', asking || failed ? 'border-warn/45 shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]' : 'border-line')}>
      <div className={cx('flex items-center gap-2 border-b border-line px-3 py-2', asking || failed ? 'bg-warn/8' : 'bg-bg-1')}>
        <BookOpen size={15} className={cx('shrink-0', asking || failed ? 'text-warn' : 'text-fg-2')} />
        <div className="min-w-0 flex-1 text-[13px] leading-snug font-medium" translate="no">
          {title}
        </div>
      </div>
      <div className="space-y-3 px-3 py-3">
        {asking && (
          <>
            <p className="text-[13.5px] leading-snug">
              No memory yet. With one, agents start out knowing the project’s decisions, what was tried and where things are. <b className="font-semibold">Recommended for large or ongoing projects.</b>
            </p>
            <div className="flex flex-wrap gap-1.5" translate="no">
              {memoryPills(m.counts).map((p) => (
                <span key={p} className="rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-fg-2">
                  {p}
                </span>
              ))}
            </div>
            <p className="text-[12.5px] leading-snug text-fg-3">{memoryLine(m)}</p>
            <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => choose('build')}>
                Build memory, then start
              </button>
              <button type="button" className={PLAIN} disabled={busy} onClick={() => choose('start')}>
                Start without memory
              </button>
            </div>
            <button type="button" disabled={busy} onClick={() => choose('never')} className="inline-flex min-h-11 w-full items-center justify-center text-[12.5px] text-accent hover:underline disabled:opacity-45 min-[480px]:min-h-0 min-[480px]:w-auto">
              Don’t ask for this project
            </button>
          </>
        )}
        {m.state === 'building' && (
          <>
            <WikiJobProgress project={m.project} variant="card" />
            <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
              <button type="button" className={PLAIN} disabled={busy} onClick={() => choose('now')}>
                Start now
              </button>
              <button type="button" className={cx(BTN, 'text-fg-2 hover:bg-bg-2 hover:text-fg')} disabled={busy} onClick={() => choose('stop')}>
                Stop building
              </button>
            </div>
          </>
        )}
        {failed && (
          <>
            <p className="text-[13.5px] leading-snug">
              {m.startFailed ? 'The agent stopped before it got your message and could not be started again. Start your message in a new session, or try again.' : 'The memory could not be built before the agent starts. You can try again, or start the agent without it.'}
            </p>
            {m.error && (
              <p className="text-[12.5px] leading-snug text-err" translate="no">
                {m.error}
              </p>
            )}
            <div className="flex flex-col gap-2 min-[480px]:flex-row min-[480px]:flex-wrap">
              <button type="button" className={PRIMARY} disabled={busy} onClick={() => choose(m.startFailed ? 'new' : 'retry')}>
                {m.startFailed ? 'Start in a new session' : 'Try again'}
              </button>
              <button type="button" className={PLAIN} disabled={busy} onClick={() => choose('now')}>
                {m.startFailed ? 'Try again' : 'Start anyway'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

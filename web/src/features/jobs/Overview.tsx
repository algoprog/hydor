// The four tiles over the Jobs page: how many jobs run and wait, when it should all be done, and how many finished today
// (with those that failed, a way to them). They count what the tag chips and the search leave.
import type { ReactNode } from 'react';
import type { JobsList } from '@shared/jobs';
import { cx } from '../../components/ui';
import { startOfDay } from './tags';
import { allDoneWords } from './words';

function Tile({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div title={title} className="flex h-14 min-w-0 flex-col justify-center rounded-lg border border-line bg-panel px-3">
      <div className="truncate text-[11.5px] leading-4 text-fg-3">{label}</div>
      <div className="tnum flex min-w-0 items-center gap-2 text-[18px] leading-6 font-semibold text-fg">{children}</div>
    </div>
  );
}

export function Overview({ list, now, capped, onFailed }: { list: JobsList; now: number; /** Only the latest finished jobs were read. */ capped: boolean; onFailed: () => void }) {
  const running = list.running.length;
  const queued = list.queued.length;
  const done = allDoneWords(list.allDoneAt, now);
  const today = startOfDay(now);
  const ended = list.ended.filter((j) => (j.endedAt ?? 0) >= today);
  const failed = ended.filter((j) => j.state === 'failed').length;
  // Every job read ended today, and there may be more: at least this many.
  const more = capped && ended.length > 0 && ended.length === list.ended.length;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label="Running">
        <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', running ? 'breathe bg-busy' : 'border border-fg-3')} />
        <span>{running}</span>
      </Tile>
      <Tile label="Queued">
        <span>{queued}</span>
      </Tile>
      <Tile label="All done" title={done ? undefined : running || queued ? 'Some of this work has no estimate, so there is no time for all of it.' : 'Nothing runs or waits.'}>
        {done ? <span className="truncate text-[15px]">{done}</span> : <span className="text-fg-3">—</span>}
      </Tile>
      <Tile label="Finished today">
        <span>{more ? `${ended.length}+` : ended.length}</span>
        {failed > 0 && (
          <button type="button" onClick={onFailed} className="min-w-0 truncate rounded text-[12.5px] font-medium text-err hover:underline">
            {`${failed} failed`}
          </button>
        )}
      </Tile>
    </div>
  );
}

// Read aloud: a speaker among a reply's actions, and while it reads, a bar above the message box to
// pause, resume or stop. Leaving the conversation stops it.
import { useEffect } from 'react';
import { AudioLines, Pause, Play, Square, Volume2 } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { cx, IconButton } from '../../components/ui';
import { canSpeak } from './prefs';
import { pauseReading, readAloud, resumeReading, stopReading, useReading } from './speech';

/** Beside a reply's copy button. `local`: a confidential session's reply, read only with a voice on this device. */
export function ReadAloudButton({ id, text, local }: { id: string; text: string; local?: boolean }) {
  const on = useReading((r) => r.id === id && r.status !== 'idle');
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      title={on ? 'Stop reading' : 'Read aloud'}
      aria-label={on ? 'Stop reading' : 'Read aloud'}
      aria-pressed={on}
      onClick={() => (on ? stopReading() : readAloud(id, text, local))}
      className={cx('inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-bg-3 hover:text-fg', on ? 'text-accent' : 'text-fg-3')}
    >
      {on ? <Square size={10} fill="currentColor" strokeWidth={0} /> : <Volume2 size={13} />}
    </button>
  );
}

/** Above the message box while a reply is read. */
export function ReadAloudDock(_: { s: SessionSummary }) {
  const r = useReading();
  useEffect(() => () => stopReading(), []);
  if (r.status === 'idle') return null;
  const paused = r.status === 'paused';
  return (
    <div
      role="status"
      className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-panel py-1 pr-1 pl-3 sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]"
    >
      <AudioLines size={15} className={cx('shrink-0 text-accent', !paused && 'animate-pulse motion-reduce:animate-none')} />
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-medium">{paused ? 'Paused' : 'Reading aloud'}</span>
        <span className="text-fg-3">
          {r.parts > 1 ? ` · ${r.part + 1} of ${r.parts}` : ''} · {r.preview}
        </span>
      </span>
      <IconButton label={paused ? 'Resume reading' : 'Pause reading'} size="sm" onClick={paused ? resumeReading : pauseReading}>
        {paused ? <Play size={14} /> : <Pause size={14} />}
      </IconButton>
      <IconButton label="Stop reading" size="sm" onClick={stopReading}>
        <Square size={11} fill="currentColor" strokeWidth={0} />
      </IconButton>
    </div>
  );
}

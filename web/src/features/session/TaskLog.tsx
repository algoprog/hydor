import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BackgroundTask, TaskLog } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { duration } from '../../lib/format';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, Throbber, useConfirm } from '../../components/ui';
import { Elapsed } from './items';

/** "Command", "Agent", "Monitor" for the CLI's task types (local_bash, local_agent, …). */
export function taskKind(kind?: string): string {
  const k = (kind ?? '').toLowerCase();
  if (k.includes('bash') || k.includes('shell') || k === 'command') return 'Command';
  if (k.includes('agent')) return 'Agent';
  if (k.includes('monitor')) return 'Monitor';
  if (k.includes('workflow')) return 'Workflow';
  return 'Task';
}

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Stops a background task once you say so: a long one's work would end with it. Resolves whether it was stopped. */
export function useStopTask(sessionKey: string) {
  const [confirm, node] = useConfirm();
  const stop = async (t: BackgroundTask): Promise<boolean> => {
    const ok = await confirm({
      title: 'Stop this background task?',
      body: (
        <>
          <b className="font-medium text-fg">{t.description}</b> stops now{t.startedAt ? `, after ${duration(Date.now() - t.startedAt)}` : ''}, and does not finish. What it has done so far stays.
        </>
      ),
      confirm: 'Stop task',
      danger: true,
    });
    if (!ok) return false;
    await post(`/api/sessions/${enc(sessionKey)}/tasks/${enc(t.id)}/stop`).catch(toastError);
    return true;
  };
  return { stop, node };
}

/** A background task in a list: its name (two lines at most) and how long it has run; it opens its output, and can be stopped. */
export function TaskRow({ t, onOpen, onStop, className }: { t: BackgroundTask; onOpen: () => void; onStop?: () => void; className?: string }) {
  return (
    <div className={cx('flex items-center gap-1 rounded-lg pr-1.5 transition-colors hover:bg-bg-2', className)}>
      <button className="min-w-0 flex-1 px-2.5 py-1.5 text-left" title="Show its output" onClick={onOpen}>
        <span className="line-clamp-2 text-[13px] leading-snug">{t.description}</span>
        <span className="mt-0.5 block text-[11.5px] text-fg-3">
          {taskKind(t.kind)}
          {t.startedAt ? (
            <>
              {' '}
              · <Elapsed since={t.startedAt} />
            </>
          ) : null}
        </span>
      </button>
      {onStop && (
        <button className="shrink-0 rounded-md px-2 py-1 text-[12px] text-fg-3 transition-colors hover:bg-err/10 hover:text-err" onClick={onStop}>
          Stop
        </button>
      )}
    </div>
  );
}

/** A background task's latest output, refreshed every few seconds while open. */
export function TaskLogDialog({ sessionKey, task, canStop, onClose }: { sessionKey: string; task: BackgroundTask; canStop: boolean; onClose: () => void }) {
  const [log, setLog] = useState<TaskLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const load = async () => {
      try {
        const l = await api<TaskLog>(`/api/sessions/${enc(sessionKey)}/tasks/${enc(task.id)}/log`);
        if (alive) {
          setLog(l);
          setError(null);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
      if (alive) timer = window.setTimeout(load, 2000);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionKey, task.id]);

  // The newest lines stay in view unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  const stopper = useStopTask(sessionKey);
  const empty = log && (log.kind === 'agent' ? !log.entries?.length : !log.text?.trim());
  return (
    <Dialog
      open
      onClose={onClose}
      title={task.description}
      width={780}
      footer={
        canStop && (
          <>
            <Button variant="ghost" className="text-err" onClick={() => stopper.stop(task).then((done) => done && onClose())}>
              Stop task
            </Button>
            {stopper.node}
          </>
        )
      }
    >
      <div className="mb-2 flex items-center gap-1.5 text-[12.5px] text-fg-3">
        <span>{taskKind(task.kind)}</span>
        {task.startedAt ? (
          <span>
            · running for <Elapsed since={task.startedAt} />
          </span>
        ) : null}
        {log?.truncated && <span>· latest output</span>}
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="term-out h-[min(60vh,560px)] overflow-auto rounded-xl px-3 py-2"
      >
        {!log ? (
          error ? (
            <span className="text-fg-3">{error}</span>
          ) : (
            <span className="text-fg-3">
              <Throbber />
            </span>
          )
        ) : empty ? (
          <span className="text-fg-3">{log.kind === 'agent' ? 'The agent has not done anything yet.' : 'No output yet.'}</span>
        ) : log.kind === 'agent' ? (
          // On a phone the time leads each entry's text, which then has the width; wider, the times are a column.
          log.entries!.map((e, i) => (
            <div key={i} className="py-px sm:flex sm:gap-3">
              {e.ts ? <span className="tnum mr-2 text-fg-3 sm:mr-0 sm:shrink-0">{clock(e.ts)}</span> : null}
              <span className="min-w-0">
                {e.tool && <span className={e.failed ? 'text-err' : 'text-accent'}>{e.tool} </span>}
                <span className={e.tool ? '' : 'text-fg'}>{e.text}</span>
              </span>
            </div>
          ))
        ) : (
          log.text
        )}
      </div>
    </Dialog>
  );
}

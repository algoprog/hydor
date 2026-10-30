import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BackgroundTask, TaskLog } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, Dialog, Dots } from '../../components/ui';
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

  const empty = log && (log.kind === 'agent' ? !log.entries?.length : !log.text?.trim());
  return (
    <Dialog
      open
      onClose={onClose}
      title={task.description}
      width={780}
      footer={
        canStop && (
          <Button variant="ghost" className="text-err" onClick={() => post(`/api/sessions/${enc(sessionKey)}/tasks/${enc(task.id)}/stop`).then(onClose, toastError)}>
            Stop task
          </Button>
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
              <Dots />
            </span>
          )
        ) : empty ? (
          <span className="text-fg-3">{log.kind === 'agent' ? 'The agent has not done anything yet.' : 'No output yet.'}</span>
        ) : log.kind === 'agent' ? (
          log.entries!.map((e, i) => (
            <div key={i} className="flex gap-3 py-px">
              <span className="tnum shrink-0 text-fg-3">{e.ts ? clock(e.ts) : ''}</span>
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

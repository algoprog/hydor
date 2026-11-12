import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Square, X } from 'lucide-react';
import type { BackgroundTask, TaskLog } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { duration } from '../../lib/format';
import { toastError, useSessions } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { Button, cx, IconButton, Sheet, Throbber, useConfirm } from '../../components/ui';
import { taskKindLabel, taskKindOf, taskState } from '../../lib/work';
import { Elapsed } from './items';
import { STATE_TONE, StateDot, TaskIcon, TaskKindText } from './WorkRow';
import { LOCALE } from '../../i18n/locale';

const clock = (ts: number) => new Date(ts).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Stops a background task once you say so: a long one's work would end with it. Resolves whether it was stopped. */
export function useStopTask(sessionKey: string) {
  const [confirm, node] = useConfirm();
  const stop = async (t: BackgroundTask): Promise<boolean> => {
    const ok = await confirm({
      title: taskKindOf(t.kind) === 'subagent' ? 'Stop this subagent?' : 'Stop this background task?',
      body: (
        <>
          <b className="font-medium text-fg">{t.description}</b> stops now{t.startedAt ? `, after ${duration(Date.now() - t.startedAt)}` : ''}, and does not finish. What it has done so far stays.
        </>
      ),
      confirm: taskKindOf(t.kind) === 'subagent' ? 'Stop subagent' : 'Stop task',
      danger: true,
    });
    if (!ok) return false;
    await post(`/api/sessions/${enc(sessionKey)}/tasks/${enc(t.id)}/stop`).catch(toastError);
    return true;
  };
  return { stop, node };
}

/**
 * What a list of background tasks needs to open one in its panel and to stop one: `open(task)` shows the panel, `stop(task)`
 * asks first, and `node` goes anywhere in the page. `tasks` is the list as it stands now, so the panel follows its task
 * (while it runs, when it ends), and keeps the last it saw if it leaves the list.
 */
export function useTaskPanel(sessionKey: string, canStop: boolean, tasks: BackgroundTask[]) {
  const [shown, setShown] = useState<BackgroundTask | null>(null);
  const stopper = useStopTask(sessionKey);
  const task = shown ? (tasks.find((t) => t.id === shown.id) ?? shown) : null;
  const node: ReactNode = (
    <>
      {stopper.node}
      {task && <TaskPanel sessionKey={sessionKey} task={task} canStop={canStop} onStop={() => void stopper.stop(task)} onClose={() => setShown(null)} />}
    </>
  );
  return { open: setShown, stop: (t: BackgroundTask) => void stopper.stop(t), node };
}

/** The pill of the panel's header: a state in the tones of the session header's own (blue working, green done, red failed). */
function StatePill({ task }: { task: BackgroundTask }) {
  const state = taskState(task);
  const label = state === 'running' ? 'Working' : state === 'done' ? 'Done' : state === 'stopped' ? 'Stopped' : state === 'failed' ? 'Failed' : 'Needs you';
  return (
    <span className={cx('inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 text-[12px] font-medium', STATE_TONE[state].text)}>
      <StateDot state={state} small />
      <span>{label}</span>
    </span>
  );
}

/**
 * A background task opened as a session opens: a panel over the right of the page (the whole screen on a phone), with a
 * header like a session's (its kind's icon, its title, its kind, how it stands, Stop while it runs) and under it what
 * it did: an agent's steps as the session's own timeline has them, a command's or monitor's output as a terminal shows it.
 * The latest is fetched every two seconds while it runs; the newest lines stay in view unless you scroll up.
 */
export function TaskPanel({ sessionKey, task, canStop, onStop, onClose }: { sessionKey: string; task: BackgroundTask; canStop: boolean; onStop: () => void; onClose: () => void }) {
  const [log, setLog] = useState<TaskLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const running = task.status === 'running';
  // Who runs a subagent task: the program of the session it belongs to ("Claude Code subagent").
  const program = useSessions((x) => {
    const s = x.byKey[sessionKey];
    return s ? agentName(s.agent, s.acpName) : undefined;
  });

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
      // Once it has ended, this one last look at what it left is the whole of it.
      if (alive && running) timer = window.setTimeout(load, 2000);
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [sessionKey, task.id, running]);

  // The newest lines stay in view unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  const empty = log && (log.kind === 'agent' ? !log.entries?.length : !log.text?.trim());
  return (
    <Sheet open onClose={onClose} label={taskKindLabel(task.kind, program)}>
      <div className="flex shrink-0 items-start gap-3 border-b border-line px-4 pt-[max(12px,var(--safe-top))] pb-3">
        <span className="mt-0.5 shrink-0 text-fg-2">
          <TaskIcon kind={task.kind} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div translate="no" className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
            {task.description}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-fg-3">
            <TaskKindText kind={task.kind} program={program} />
            <StatePill task={task} />
            {running && task.startedAt ? (
              <span>
                · <Elapsed since={task.startedAt} />
              </span>
            ) : null}
            {log?.truncated && <span>· latest output</span>}
          </div>
        </div>
        {canStop && running && (
          <Button size="sm" variant="ghost" className="shrink-0 text-err" icon={<Square size={12} />} onClick={onStop}>
            Stop
          </Button>
        )}
        <IconButton label="Close" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="min-h-0 flex-1 overflow-auto"
      >
        {!log ? (
          <div className="p-4 text-fg-3">{error ? error : <Throbber />}</div>
        ) : empty ? (
          <div className="p-4 text-[13px] text-fg-3">{log.kind === 'agent' ? 'The agent has not done anything yet.' : 'No output yet.'}</div>
        ) : log.kind === 'agent' ? (
          // Steps as the session's timeline has them: the tool in the accent colour, what it did, the time.
          <div className="space-y-0.5 p-2">
            {log.entries!.map((e, i) => (
              <div key={i} className="flex items-baseline gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-bg-2">
                {e.tool && <span className={cx('shrink-0 font-medium', e.failed ? 'text-err' : 'text-accent')}>{e.tool}</span>}
                <span translate="no" className={cx('min-w-0 flex-1 break-words whitespace-pre-wrap', e.tool ? 'text-fg-2' : 'text-fg')}>
                  {e.text}
                </span>
                {e.ts ? <span className="tnum shrink-0 text-[11px] text-fg-3">{clock(e.ts)}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <div translate="no" className="term-out min-h-full px-4 py-3">
            {log.text}
          </div>
        )}
      </div>
    </Sheet>
  );
}

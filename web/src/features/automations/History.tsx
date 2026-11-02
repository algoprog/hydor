// A task's runs, newest first: what started each, when, how it went (the agent's own report), its
// one-line summary, what it cost and its session; any run can go again with the same input. Below
// them, the notepad the runs keep, which you can read and change.
import { useEffect, useState } from 'react';
import { ExternalLink, NotebookPen, RotateCcw } from 'lucide-react';
import { TRIGGER_LABEL, type ScheduledTask, type TaskRun } from '@shared/automations';
import { api, enc, post, put } from '../../lib/api';
import { duration, money } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { Button, cx, IconButton, inputCls, Throbber } from '../../components/ui';
import { localTime, OutcomeBadge, TriggerIcon } from './parts';

function RunRow({ r, onRerun }: { r: TaskRun; onRerun: () => void }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const long = !!r.reply && r.reply.length > (r.summary?.length ?? 0) + 20;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <TriggerIcon trigger={r.trigger} className="mt-[3px]" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
          <OutcomeBadge status={r.status} />
          <span className="text-fg-2">{localTime(r.startedAt)}</span>
          <span className="text-fg-3">
            {TRIGGER_LABEL[r.trigger]}
            {r.endedAt ? ` · ${duration(r.endedAt - r.startedAt)}` : ''}
            {r.costUsd ? ` · ${money(r.costUsd)}` : ''}
          </span>
        </div>
        {(r.summary || r.error) && (
          <button type="button" disabled={!long} aria-expanded={long ? open : undefined} onClick={() => setOpen((o) => !o)} className={cx('mt-0.5 block w-full text-left text-[12.5px] leading-snug text-fg-2', !open && 'line-clamp-2', long && 'cursor-pointer hover:text-fg')}>
            {r.summary ?? r.error}
          </button>
        )}
        {open && r.reply && <Markdown text={r.reply} breaks className="anim-expand mt-1.5 rounded-lg border border-line px-3 py-2 !text-[13px]" />}
      </div>
      <div className="flex shrink-0 items-center">
        {r.appRun ? (
          <IconButton label="Open its run" size="sm" onClick={() => go(`/apps/runs/${enc(r.appRun!)}`)}>
            <ExternalLink size={13} />
          </IconButton>
        ) : (
          r.key && (
            <IconButton label="Open its session" size="sm" onClick={() => openSession(r.key!)}>
              <ExternalLink size={13} />
            </IconButton>
          )
        )}
        {r.hasInput && r.taskId && (
          <IconButton
            label="Run again with the same input"
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post(`/api/automations/runs/${enc(r.id)}/rerun`);
                toast('Running it again', 'ok');
                onRerun();
              } catch (e) {
                toastError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Throbber /> : <RotateCcw size={13} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}

function Notepad({ taskId }: { taskId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  useEffect(() => {
    api<{ text: string }>(`/api/automations/tasks/${enc(taskId)}/notes`)
      .then((r) => setText(r.text))
      .catch(() => setText(''));
  }, [taskId]);
  if (text === null) return null;
  return (
    <div className="mt-2 rounded-xl bg-bg-1 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <NotebookPen size={13} className="text-fg-3" />
        <span className="flex-1 text-[12px] font-medium text-fg-2">Notes its runs keep</span>
        {edit === null ? (
          <button type="button" onClick={() => setEdit(text)} className="text-[12px] text-accent hover:underline">
            Edit
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setEdit(null)} className="text-[12px] text-fg-3 hover:text-fg">
              Cancel
            </button>
            <Button
              size="sm"
              variant="primary"
              className="h-7"
              onClick={() =>
                put<{ text: string }>(`/api/automations/tasks/${enc(taskId)}/notes`, { text: edit })
                  .then((r) => (setText(r.text), setEdit(null)))
                  .catch(toastError)
              }
            >
              Save
            </Button>
          </>
        )}
      </div>
      {edit !== null ? (
        <textarea value={edit} onChange={(e) => setEdit(e.target.value)} rows={4} className={cx(inputCls, 'mt-2 h-auto py-1.5 font-mono text-[12px]')} />
      ) : (
        <p className={cx('mt-1 text-[12px] leading-relaxed whitespace-pre-wrap', text ? 'text-fg-2' : 'text-fg-3')}>{text || 'Empty. A run keeps what the next one should know here (what it reported, where it stopped).'}</p>
      )}
    </div>
  );
}

export function History({ task }: { task: ScheduledTask }) {
  const [runs, setRuns] = useState<TaskRun[] | null>(null);
  const load = () =>
    api<{ runs: TaskRun[] }>(`/api/automations/tasks/${enc(task.id)}/runs`)
      .then((r) => setRuns(r.runs))
      .catch(toastError);
  useEffect(() => {
    load();
    window.addEventListener('wa:tasks', load);
    return () => window.removeEventListener('wa:tasks', load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);
  return (
    <div className="anim-in mt-2 border-t border-line pt-1">
      {!runs ? (
        <div className="flex justify-center py-3 text-fg-3">
          <Throbber />
        </div>
      ) : runs.length ? (
        <div className="divide-y divide-line/60">
          {runs.map((r) => (
            <RunRow key={r.id} r={r} onRerun={load} />
          ))}
        </div>
      ) : (
        <p className="py-3 text-[12.5px] text-fg-3">No runs yet. Each run shows here with how it went, what it cost and its session.</p>
      )}
      <Notepad taskId={task.id} />
    </div>
  );
}

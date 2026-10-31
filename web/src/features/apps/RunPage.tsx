// One run's page: where it stands (live), its result as a card or table, the agent's reply, what was
// asked, and a link to the full session.
import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, MessageSquareText, RotateCcw, Square, Trash2 } from 'lucide-react';
import { isActive } from '@shared/apps';
import { api, del, enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, IconButton, Throbber, useConfirm } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { appPath, SOURCE_LABEL, useRunEvents, type RunDetail } from './api';
import { AppIcon } from './AppIcon';
import { RunsWith } from './AppPage';
import { RunBody } from './Result';

function Asked({ d }: { d: RunDetail }) {
  const [open, setOpen] = useState(false);
  const fields = d.recipe.fields.filter((f) => (d.run.inputs[f.id] ?? '').trim());
  if (!fields.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <h3 className="flex-1 text-[13.5px] font-semibold">What was asked</h3>
      </button>
      {open && (
        <dl className="mt-2 space-y-2">
          {fields.map((f) => (
            <div key={f.id}>
              <dt className="text-[12px] text-fg-3">{f.label}</dt>
              <dd className="text-[13.5px] break-words whitespace-pre-wrap">{f.type === 'file' ? d.run.inputs[f.id].split('/').pop() : d.run.inputs[f.id]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

export function RunPage({ id }: { id: string }) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [err, setErr] = useState('');
  const [ask, confirmNode] = useConfirm();
  const load = () => api<RunDetail>(`/api/apps/runs/${enc(id)}`).then(setD, (e) => setErr((e as Error).message));
  useEffect(() => {
    load();
  }, [id]);
  useRunEvents((run) => run.id === id && load());
  const active = d ? isActive(d.run.status) : false;
  // Steps and the reply come from the session: look again while it works.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [active, id]);
  if (err) return <Empty title="This run could not be opened">{err}</Empty>;
  const r = d?.run;
  const back = d ? (d.slug ? appPath(r!.app) : r!.app.startsWith('tpl:') ? appPath(r!.app) : '/apps') : '/apps';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            <IconButton label="Back to the app" size="sm" onClick={() => go(back)} className="-ml-1">
              <ArrowLeft size={17} />
            </IconButton>
            {d && <AppIcon icon={d.recipe.icon} color={d.recipe.color} size={26} />}
            <span className="truncate">{d?.recipe.name ?? 'Run'}</span>
          </span>
        }
        sub={r ? `${SOURCE_LABEL[r.source]}${r.row ? ` ${r.row}` : ''} · started ${ago(r.createdAt)}` : undefined}
        actions={
          r && (
            <>
              {r.key && (
                <Button size="sm" icon={<MessageSquareText size={14} />} onClick={() => openSession(r.key!)}>
                  <span className="max-sm:hidden">Open the session</span>
                  <span className="sm:hidden">Session</span>
                </Button>
              )}
              {active ? (
                <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => post(`/api/apps/runs/${enc(id)}/stop`).then(load, toastError)}>
                  Stop
                </Button>
              ) : (
                <IconButton
                  label="Remove from the list"
                  onClick={async () => {
                    if (!(await ask({ title: 'Remove this run?', body: 'It leaves the app’s list of runs. The session stays.', confirm: 'Remove', danger: true }))) return;
                    del(`/api/apps/runs/${enc(id)}`).then(() => go(back), toastError);
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!d ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="mx-auto max-w-[860px] space-y-3 px-4 py-5 sm:px-6">
            <RunBody
              run={d.run}
              progress={d.progress}
              answer={d.recipe.answer}
              name={d.recipe.name}
              statusExtra={<span className="max-sm:hidden"><RunsWith agent={d.recipe.agent} acpAgent={d.recipe.acpAgent} model={d.recipe.model} /></span>}
            />
            <Asked d={d} />
            {!active && (d.slug || r!.app.startsWith('tpl:')) && (
              <div className="flex justify-center pt-2">
                <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => go(`${appPath(r!.app)}?again=${enc(r!.id)}`)}>
                  Run again with these answers
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {confirmNode}
    </div>
  );
}

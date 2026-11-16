// An agent's versions (Versions, in its page's menu): each save that changed what it is, newest first, with who saved it,
// when, what changed and how its examples went with it. Pick one to compare it with another (the one before it, by
// default): its settings in sentences, its instructions side by side as a diff. Bring it back makes an earlier one the
// current one again, as a new version; its examples stay as they are now.
import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { agentChanges, VERSION_BY, VERSIONS_KEEP, type AgentVersion } from '@shared/agent-files';
import type { Assistant, AssistantsState } from '@shared/assistants';
import { api, enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { toast, toastError } from '../../lib/store';
import { DiffView, DiffStat } from '../../components/DiffView';
import { Button, cx, Dialog, inputCls, Throbber, useConfirm } from '../../components/ui';
import { lineDiff } from '../pages/latex/linediff';
import { useSpaces } from '../spaces/state';
import { useAssistants } from './state';

type Full = AgentVersion & { agent: Partial<Assistant> };

export function VersionsDialog({ a, all, open, onClose }: { a: Assistant; all: Assistant[]; open: boolean; onClose: () => void }) {
  const spaces = useSpaces();
  const [list, setList] = useState<AgentVersion[] | null>(null);
  const [got, setGot] = useState<Record<number, Full>>({});
  const [pick, setPick] = useState<number | null>(null);
  const [against, setAgainst] = useState<number | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const stamp = JSON.stringify(a);
  useEffect(() => {
    if (!open) return;
    setGot({});
    api<{ versions: AgentVersion[] }>(`/api/assistants/${enc(a.id)}/versions`).then(
      (r) => {
        setList(r.versions);
        setPick(r.versions[0]?.n ?? null);
        setAgainst(r.versions[1]?.n ?? null);
      },
      () => setList([]),
    );
  }, [open, a.id, stamp]);
  // The two compared, fetched once each.
  useEffect(() => {
    for (const n of [pick, against]) {
      if (n === null || got[n]) continue;
      api<{ version: Full }>(`/api/assistants/${enc(a.id)}/versions/${n}`).then((r) => setGot((g) => ({ ...g, [n]: r.version })), toastError);
    }
  }, [pick, against, a.id, got]);
  const name = (kind: 'agent' | 'project', id: string) => (kind === 'agent' ? all.find((x) => x.id === id)?.name : spaces?.find((s) => s.id === id)?.name) ?? id;
  const older = against !== null && pick !== null ? got[Math.min(pick, against)] : undefined;
  const newer = against !== null && pick !== null ? got[Math.max(pick, against)] : undefined;
  const changes = useMemo(() => (older && newer ? agentChanges(older.agent, newer.agent, name) : []), [older, newer]);
  const diff = useMemo(() => (older && newer ? lineDiff(older.agent.instructions ?? '', newer.agent.instructions ?? '', 'instructions') : null), [older, newer]);
  const now = list?.[0]?.n;
  const bring = async (n: number) => {
    if (
      !(await confirm({
        title: `Bring back version ${n}?`,
        body: 'It becomes the current version, saved as a new one: the version it has now stays in the list, to go back to. Its examples stay as they are.',
        confirm: 'Bring it back',
      }))
    )
      return;
    try {
      const r = await post<AssistantsState & { assistant: Assistant }>(`/api/assistants/${enc(a.id)}/versions/${n}/restore`);
      useAssistants.getState().set(r);
      toast(`Version ${n} is back, as the current one`, 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  const label = (v: AgentVersion) => `v${v.n} · ${v.n === now ? 'now' : ago(v.at)}`;
  return (
    <Dialog open={open} onClose={onClose} title={`Versions of ${a.name}`} width={940} part="agents">
      {!list ? (
        <Throbber className="mx-auto my-8 text-fg-3" />
      ) : !list.length ? (
        <div className="py-6 text-center text-[13.5px] text-fg-3">None yet: its next save that changes it is the first.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="mb-1.5 text-[12px] text-fg-3">{`Each save that changed it, newest first; the latest ${VERSIONS_KEEP} stay.`}</div>
            <ol className="max-h-[60vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {list.map((v, i) => (
                <li key={v.n}>
                  <button
                    type="button"
                    onClick={() => (setPick(v.n), setAgainst(list[i + 1]?.n ?? (v.n === now ? null : now!)))}
                    className={cx('flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-bg-2', pick === v.n && 'bg-accent-soft')}
                  >
                    <span className="w-8 shrink-0 pt-px font-mono text-[12px] text-fg-3">{`v${v.n}`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 block text-[13px] break-words" translate="no">
                        {v.line}
                      </span>
                      <span className="flex flex-wrap gap-x-2 text-[12px] text-fg-3">
                        <span>{VERSION_BY[v.by]}</span>
                        <span>{ago(v.at)}</span>
                        {v.n === now && <span className="text-accent">Now</span>}
                        {v.examples && <span className={v.examples.passed === v.examples.tried ? 'text-ok' : 'text-err'}>{`Examples: ${v.examples.passed} of ${v.examples.tried} passed`}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-fg-3">Compare</span>
              <select aria-label="A version" className={cx(inputCls, 'h-8 max-w-[11rem] py-0')} value={pick ?? ''} onChange={(e) => setPick(Number(e.target.value))}>
                {list.map((v) => (
                  <option key={v.n} value={v.n}>
                    {label(v)}
                  </option>
                ))}
              </select>
              <span className="text-fg-3">with</span>
              <select aria-label="Another version" className={cx(inputCls, 'h-8 max-w-[11rem] py-0')} value={against ?? ''} onChange={(e) => setAgainst(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">Nothing</option>
                {list
                  .filter((v) => v.n !== pick)
                  .map((v) => (
                    <option key={v.n} value={v.n}>
                      {label(v)}
                    </option>
                  ))}
              </select>
              <span className="flex-1" />
              {pick !== null && pick !== now && (
                <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} onClick={() => void bring(pick)}>
                  Bring it back
                </Button>
              )}
            </div>
            {against === null ? (
              <div className="rounded-xl border border-line bg-bg-1 px-4 py-3 text-[13px] text-fg-3">{pick === now ? 'This is the version it has now.' : 'Pick another version to compare it with.'}</div>
            ) : !older || !newer ? (
              <Throbber className="text-fg-3" />
            ) : (
              <>
                <section className="rounded-xl border border-line bg-panel px-4 py-3">
                  <h3 className="mb-1.5 text-[13px] font-semibold">{`From v${older.n} to v${newer.n}`}</h3>
                  {!changes.length ? (
                    <div className="text-[13px] text-fg-3">Nothing it is changed between these two.</div>
                  ) : (
                    <ul className="list-disc space-y-0.5 pl-5 text-[13px]" translate="no">
                      {changes.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  )}
                </section>
                {diff && diff.diff && (
                  <section className="rounded-xl border border-line bg-panel">
                    <div className="flex items-center gap-2 border-b border-line px-4 py-2">
                      <h3 className="flex-1 text-[13px] font-semibold">Instructions</h3>
                      <DiffStat added={diff.added} removed={diff.removed} />
                    </div>
                    <div className="max-h-[46vh] overflow-auto">
                      <DiffView diff={diff.diff} />
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {confirmNode}
    </Dialog>
  );
}

// A run's page (/system/experiments/<id>): its status and why, Stop, Run again, Copy the command; its log following
// live (newest at the bottom, Follow while it runs); its metrics over steps; what it ran from (commit, branch, the
// changes not committed, settings, seed, environment); what the agent on call saw and did, with its sessions; its
// folder in Files. A run kept on another machine is read through that machine.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, FolderOpen, MoreHorizontal, Play, RotateCcw, Square, Trash2, X } from 'lucide-react';
import type { MetricSeries, RunRecord } from '@shared/experiments';
import { api, ApiError } from '../../lib/api';
import { LOCALE } from '../../i18n/locale';
import { machinePath } from '../../lib/machine';
import { go, goFull, sessionPath, showInFiles } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { DiffView } from '../../components/DiffView';
import { Button, cx, Dialog, IconButton, MenuItem, MenuSep, Popover, Throbber, useConfirm } from '../../components/ui';
import { baseOf, copy, isActive, num, statusTone, statusWords, took, VIZ } from './api';
import { StepChart } from './Charts';

interface View {
  run: RunRecord;
  series: MetricSeries;
  log: string;
  logSize: number;
}

const EVENT_WORDS: Record<string, string> = {
  queued: 'In line',
  waiting: 'Waiting',
  started: 'Started',
  nan: 'NaN',
  oom: 'Out of memory',
  stall: 'Stalled',
  crash: 'Crashed',
  diverge: 'Diverging',
  agent: 'Agent on call',
  stopped: 'Stopped',
  done: 'Done',
  failed: 'Failed',
  note: 'Note',
};

const when = (t: number) => new Date(t).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function Block({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold text-fg">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 border-t border-line py-1.5 text-[12.5px] first:border-t-0 max-sm:grid-cols-[96px_1fr]">
      <div className="text-fg-3">{label}</div>
      <div className="min-w-0 break-words text-fg">{children}</div>
    </div>
  );
}

/** The log, newest at the bottom; it follows while the run goes (the newest kept in view unless you scroll up). */
function Log({ id, base, initial, size, going }: { id: string; base?: string; initial: string; size: number; going: boolean }) {
  const [text, setText] = useState(initial);
  const [follow, setFollow] = useState(true);
  const at = useRef(size);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    setText(initial);
    at.current = size;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!going || !follow) return;
    let alive = true;
    const t = window.setInterval(async () => {
      try {
        const r = await api<{ text: string; next: number }>(`/api/experiments/runs/${id}/log?from=${at.current}`, base !== undefined ? { base } : {});
        if (!alive || !r.text) return;
        at.current = r.next;
        // At most the last 400 KB is kept on the page.
        setText((x) => (x + r.text).slice(-400_000));
      } catch {}
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [id, base, going, follow]);
  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, follow]);
  return (
    <Block
      title="Log"
      right={
        going && (
          <label className="flex items-center gap-1.5 text-[12px] text-fg-2">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[var(--accent)]" />
            Follow
          </label>
        )
      }
    >
      <pre
        ref={box}
        translate="no"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight > 40 && follow && going) setFollow(false);
        }}
        className="max-h-[420px] min-h-[120px] overflow-auto rounded-xl border border-line bg-[var(--term-bg)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap text-[var(--term-fg)] [overflow-wrap:anywhere] max-sm:max-h-[60vh]"
      >
        {text || (going ? 'Nothing yet.' : 'Empty.')}
      </pre>
    </Block>
  );
}

export function RunView({ id, machine, onClose, onAgain, wide }: { id: string; machine?: string | null; onClose: () => void; onAgain: (r: RunRecord) => void; wide: boolean }) {
  const base = baseOf(machine);
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [allCharts, setAllCharts] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(
    (lines = 400) =>
      api<View>(`/api/experiments/runs/${id}?lines=${lines}`, base !== undefined ? { base } : {})
        .then((x) => {
          setV((prev) => (prev && lines === 0 ? { ...x, log: prev.log, logSize: prev.logSize } : x));
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'This run is no longer kept.' : (e as Error).message)),
    [id, base],
  );
  useEffect(() => {
    setV(null);
    load();
  }, [load]);
  const going = !!v && isActive(v.run);
  // Its record and metrics while it goes (the log follows by itself).
  useEffect(() => {
    if (!going) return;
    const t = window.setInterval(() => load(0), 5000);
    return () => window.clearInterval(t);
  }, [going, load]);
  useFeatureEvent('experiments', (e) => {
    const runs = (e.data as { runs?: string[] })?.runs;
    if (!machine && runs?.includes(id)) load(0);
  });

  const stop = async () => {
    try {
      await api(`/api/experiments/runs/${id}/stop`, { method: 'POST', body: {}, ...(base !== undefined ? { base } : {}) });
      load(0);
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: 'Delete this run’s record?', body: 'Its record, log, patch and metrics go. The files it made in its own folder stay.', confirm: 'Delete', danger: true }))) return;
    try {
      await api(`/api/experiments/runs/${id}`, { method: 'DELETE', ...(base !== undefined ? { base } : {}) });
      onClose();
    } catch (e) {
      toastError(e);
    }
  };
  /** Run again: New run filled in; a run kept on another machine goes there again. */
  const again = () => v && onAgain(machine ? { ...v.run, where: `m:${machine}`, machine: { id: machine, name: v.run.machine?.name ?? machine } } : v.run);
  const showPatch = async () => {
    try {
      const r = await api<{ patch: string | null }>(`/api/experiments/runs/${id}/patch`, base !== undefined ? { base } : {});
      setPatch(r.patch ?? '');
    } catch (e) {
      toastError(e);
    }
  };

  const head = (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 sm:px-3">
      <IconButton label={wide ? 'Close' : 'Back to the list'} onClick={onClose}>
        {wide ? <X size={16} /> : <ArrowLeft size={17} />}
      </IconButton>
      <div translate="no" className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
        {v?.run.name ?? ''}
      </div>
      {v && going && (
        <Button size="sm" variant="secondary" icon={<Square size={13} />} onClick={stop} disabled={!!v.run.stopping}>
          {v.run.stopping ? 'Stopping' : 'Stop'}
        </Button>
      )}
      {v && (
        <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={again} className="max-sm:hidden">
          Run again
        </Button>
      )}
      {v && (
        <>
          <IconButton ref={menuRef} label="More" onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={240}>
            <div className="sm:hidden">
              <MenuItem
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  setMenu(false);
                  again();
                }}
              >
                Run again
              </MenuItem>
            </div>
            <MenuItem
              icon={<Copy size={14} />}
              onClick={async () => {
                setMenu(false);
                toast((await copy(v.run.command)) ? 'Copied the command' : 'Could not copy');
              }}
            >
              Copy the command
            </MenuItem>
            {v.run.folder && !machine && !v.run.remote && (
              <MenuItem
                icon={<FolderOpen size={14} />}
                onClick={() => {
                  setMenu(false);
                  showInFiles(v.run.folder!);
                }}
              >
                Its folder in Files
              </MenuItem>
            )}
            {!going && (
              <>
                <MenuSep />
                <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
                  Delete the record
                </MenuItem>
              </>
            )}
          </Popover>
        </>
      )}
    </header>
  );

  if (error)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {head}
        <p className="p-6 text-[13.5px] text-fg-3">{error}</p>
      </div>
    );
  if (!v)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {head}
        <div className="flex flex-1 items-center justify-center text-fg-3">
          <Throbber />
        </div>
      </div>
    );

  const r = v.run;
  const metrics = Object.keys(v.series).filter((k) => v.series[k].length > 0);
  const shown = allCharts ? metrics : metrics.slice(0, 4);
  const sessionLink = (key: string) => (machine ? goFull(machinePath(machine, sessionPath(key))) : go(sessionPath(key)));
  const env = Object.entries(r.environment ?? {});
  return (
    <div className="flex h-full min-h-0 flex-col">
      {head}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] space-y-6 px-4 py-4 sm:px-5">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
              <span className={cx('h-2 w-2 shrink-0 rounded-full', statusTone(r.status))} />
              <span className="font-medium">{statusWords(r)}</span>
              {r.endedAt && r.startedAt && !going && <span className="text-fg-3">· after {took(r.endedAt - r.startedAt)}</span>}
              {r.exitCode !== undefined && r.exitCode !== null && !going && <span className="text-fg-3">· exit code {r.exitCode}</span>}
            </div>
            {r.why && <p className="text-[13px] leading-relaxed text-fg-2">{r.why}</p>}
            <p className="text-[12.5px] text-fg-3">
              {[
                machine ? r.machine?.name : null,
                // Where it ran: another machine or a cluster by its name, this computer in those words.
                machine || r.where?.startsWith('c:') || r.where?.startsWith('m:') ? r.host : 'This computer',
                r.gpuIds?.length ? `GPU ${r.gpuIds.join(', ')}` : r.gpus ? null : 'no GPU',
                r.startedAt ? `started ${when(r.startedAt)}` : `added ${when(r.createdAt)}`,
                r.group ? `experiment ${r.group}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          {metrics.length > 0 && (
            <Block
              title="Metrics"
              right={
                metrics.length > 4 && (
                  <button type="button" onClick={() => setAllCharts((a) => !a)} className="text-[12px] text-accent hover:underline">
                    {allCharts ? 'Fewer' : `All ${metrics.length}`}
                  </button>
                )
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {shown.map((k, i) => (
                  <div key={k} className="min-w-0 rounded-xl border border-line bg-panel px-3 pt-2 pb-1">
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <span translate="no" className="min-w-0 flex-1 truncate font-medium text-fg-2">
                        {k}
                      </span>
                      <span className="tnum font-semibold text-fg">{num(r.metrics?.last?.[k])}</span>
                      {r.metrics?.best?.[k] !== undefined && r.metrics.best[k] !== r.metrics?.last?.[k] && <span className="tnum text-fg-3">best {num(r.metrics.best[k])}</span>}
                    </div>
                    <StepChart series={[{ label: k, color: VIZ[i % VIZ.length], points: v.series[k] }]} height={110} />
                  </div>
                ))}
              </div>
            </Block>
          )}

          <Log id={id} base={base} initial={v.log} size={v.logSize} going={going} />

          <Block title="What it ran">
            <div className="rounded-xl border border-line bg-panel px-3 py-1">
              <Row label="Command">
                <code translate="no" className="font-mono text-[12px] break-all">
                  {r.command}
                </code>
              </Row>
              <Row label="Folder">
                <span translate="no" className="font-mono text-[12px] break-all">
                  {r.cwd}
                </span>
              </Row>
              {r.commit && (
                <Row label="Code">
                  <span translate="no" className="font-mono text-[12px]">
                    {r.commit.slice(0, 10)}
                  </span>
                  {r.branch && (
                    <span className="text-fg-3">
                      {' '}
                      on{' '}
                      <span translate="no" className="font-mono text-[12px] text-fg">
                        {r.branch}
                      </span>
                    </span>
                  )}
                  {r.dirty ? (
                    <>
                      <span className="text-fg-3"> · with changes not committed </span>
                      {r.patchPath && (
                        <button type="button" onClick={showPatch} className="text-accent hover:underline">
                          See the changes
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-fg-3"> · nothing changed since</span>
                  )}
                  {r.untracked ? <span className="text-fg-3"> · {r.untracked} files git does not track</span> : null}
                </Row>
              )}
              {r.params && Object.keys(r.params).length > 0 && (
                <Row label="Settings">
                  <span translate="no" className="font-mono text-[12px]">
                    {Object.entries(r.params)
                      .map(([k, x]) => `${k}=${x}`)
                      .join('  ')}
                  </span>
                </Row>
              )}
              {r.seed !== undefined && (
                <Row label="Seed">
                  <span className="tnum">{r.seed}</span>
                </Row>
              )}
              {env.length > 0 && (
                <Row label="Environment">
                  <span translate="no">{env.map(([k, x]) => `${k} ${x}`).join(' · ')}</span>
                </Row>
              )}
              {r.from && (
                <Row label="Again of">
                  <button type="button" onClick={() => go(`/system/experiments/${r.from}`)} className="font-mono text-[12px] text-accent hover:underline">
                    {r.from}
                  </button>
                </Row>
              )}
              {r.startedBy?.session && (
                <Row label="Started by">
                  <button type="button" onClick={() => sessionLink(r.startedBy!.session!)} className="text-accent hover:underline">
                    A session
                  </button>
                </Row>
              )}
            </div>
          </Block>

          {r.events && r.events.length > 0 && (
            <Block title="What happened">
              <ol className="space-y-1.5">
                {r.events.map((e, i) => (
                  <li key={i} className="flex gap-3 text-[12.5px]">
                    <span className="tnum w-[92px] shrink-0 text-fg-3">{when(e.at)}</span>
                    <span className={cx('w-[96px] shrink-0 font-medium', ['nan', 'oom', 'crash', 'failed', 'diverge'].includes(e.kind) ? 'text-err' : e.kind === 'stall' ? 'text-warn' : 'text-fg-2')}>{EVENT_WORDS[e.kind] ?? e.kind}</span>
                    <span className="min-w-0 flex-1 text-fg-2">
                      {e.text}
                      {e.session && (
                        <>
                          {' '}
                          <button type="button" onClick={() => sessionLink(e.session!)} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                            <Play size={11} /> Open its session
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </Block>
          )}
        </div>
      </div>
      <Dialog open={patch !== null} onClose={() => setPatch(null)} title="The changes it ran with" width={900}>
        {patch ? <DiffView diff={patch} /> : <p className="text-[13px] text-fg-3">The patch is no longer kept.</p>}
      </Dialog>
      {confirmNode}
    </div>
  );
}

// Running an app for each row of a CSV: pick the file, say which column fills which question (or one
// value for every row), see what it may cost, choose how many run at once, then follow the table of
// results as it fills in, and download it as CSV.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Download, FileSpreadsheet, Play, Square, X } from 'lucide-react';
import type { AppBatch, AppDef } from '@shared/apps';
import { cellText, isActive, parseCsv } from '@shared/apps';
import { api, enc, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { timeAgo } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, inputCls, Section, Segmented, Throbber } from '../../components/ui';
import { money, runPath, useRunEvents, type BatchDetail, type Estimate } from './api';
import { statusBadge } from './Gallery';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** A result cell as plain words: Markdown's marks left out. */
const plain = (v: unknown) =>
  cellText(v)
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
const SAME = '\u0000same';

/** The column that most looks like a field: the same name, or one name inside the other. */
function guess(f: { id: string; label: string }, header: string[]): string {
  const a = [norm(f.id), norm(f.label)];
  const hit = header.findIndex((h) => a.includes(norm(h)));
  if (hit >= 0) return String(hit);
  const near = header.findIndex((h) => norm(h) && a.some((x) => x && (x.includes(norm(h)) || norm(h).includes(x))));
  return near >= 0 ? String(near) : SAME;
}

function BatchView({ id, app, onClose }: { id: string; app: AppDef; onClose: () => void }) {
  const [d, setD] = useState<BatchDetail | null>(null);
  const load = () => api<BatchDetail>(`/api/apps/batches/${enc(id)}`).then(setD, toastError);
  useEffect(() => {
    load();
  }, [id]);
  // While it runs: each run's news, and a look every few seconds for the rest.
  useRunEvents((run) => run.batch === id && setD((x) => (x ? { ...x, runs: x.runs.map((r) => (r.id === run.id ? run : r)) } : x)));
  const running = d?.batch.status === 'running' || d?.runs.some((r) => isActive(r.status));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, id]);
  if (!d) return <Throbber className="mx-auto block text-[24px] text-fg-3" />;
  const done = d.runs.filter((r) => r.status === 'done').length;
  const failed = d.runs.filter((r) => r.status === 'failed' || r.status === 'stopped').length;
  const spent = d.runs.reduce((n, r) => n + (r.costUsd ?? 0), 0);
  const firstFields = app.fields.filter((f) => f.type !== 'file').slice(0, 2);
  const answer = app.answer.slice(0, 4);
  return (
    <Section
      title={d.batch.name || 'Rows'}
      sub={
        <span className="tnum">
          {done} of {d.batch.total} done{failed ? ` · ${failed} did not finish` : ''}
          {spent ? ` · ${money(spent)}` : ''} · {d.batch.concurrency} at a time
        </span>
      }
      actions={
        <div className="flex items-center gap-1.5">
          {running && (
            <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => post(`/api/apps/batches/${enc(id)}/stop`).then(load, toastError)}>
              Stop
            </Button>
          )}
          <a href={mu(`/api/apps/batches/${enc(id)}/csv`)} download className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium ring-1 ring-line-2 ring-inset hover:bg-bg-3">
            <Download size={14} />
            CSV
          </a>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      }
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-bg-3">
        <div className="h-full bg-ok transition-[width] duration-500" style={{ width: `${(100 * done) / Math.max(1, d.batch.total)}%` }} />
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-fg-3">
              <th className="border-b border-line py-2 pr-2 font-medium">#</th>
              {firstFields.map((f) => (
                <th key={f.id} className="border-b border-line px-2 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              <th className="border-b border-line px-2 py-2 font-medium">Status</th>
              {answer.map((f) => (
                <th key={f.id} className="border-b border-line px-2 py-2 font-medium">
                  {f.label}
                </th>
              ))}
              {!app.answer.length && <th className="border-b border-line px-2 py-2 font-medium">Reply</th>}
              <th className="border-b border-line py-2" />
            </tr>
          </thead>
          <tbody>
            {d.runs.map((r) => (
              <tr key={r.id} className="align-top hover:bg-bg-1">
                <td className="tnum border-b border-line py-2 pr-2 text-fg-3">{r.row}</td>
                {firstFields.map((f) => (
                  <td key={f.id} className="max-w-[180px] truncate border-b border-line px-2 py-2">
                    {r.inputs[f.id]}
                  </td>
                ))}
                <td className="border-b border-line px-2 py-2" title={r.error}>
                  {statusBadge(r)}
                </td>
                {r.status === 'failed' && r.error ? (
                  <td colSpan={Math.max(1, answer.length)} className="border-b border-line px-2 py-2 text-err">
                    <span className="line-clamp-2">{r.error}</span>
                  </td>
                ) : (
                  answer.map((f) => (
                    <td key={f.id} className="max-w-[220px] border-b border-line px-2 py-2">
                      <span className="line-clamp-2">{plain(r.result?.[f.id])}</span>
                    </td>
                  ))
                )}
                {!app.answer.length && (
                  <td className="max-w-[280px] border-b border-line px-2 py-2">
                    <span className="line-clamp-2">{r.reply ?? r.error}</span>
                  </td>
                )}
                <td className="border-b border-line py-2 text-right">
                  {r.status !== 'queued' && (
                    <button type="button" onClick={() => go(runPath(r.id))} className="rounded p-0.5 text-fg-3 hover:text-fg" aria-label="Open the run">
                      <ChevronRight size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function BatchTab({ app }: { app: AppDef }) {
  const [csv, setCsv] = useState<{ name: string; rows: string[][] } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [same, setSame] = useState<Record<string, string>>({});
  const [conc, setConc] = useState('2');
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [batches, setBatches] = useState<AppBatch[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const fields = app.fields;
  const header = csv?.rows[0] ?? [];
  const body = useMemo(() => (csv?.rows.slice(1) ?? []).filter((r) => r.some((x) => x.trim())), [csv]);

  const loadBatches = () => api<{ batches: AppBatch[] }>(`/api/apps/${enc(app.id)}/batches`).then((r) => setBatches(r.batches), () => {});
  useEffect(() => {
    loadBatches();
  }, [app.id]);
  useEffect(() => {
    if (!body.length) return setEst(null);
    api<Estimate>(`/api/apps/${enc(app.id)}/estimate?rows=${body.length}`).then(setEst, () => setEst(null));
  }, [body.length, app.id]);

  const read = async (f?: File | null) => {
    if (!f) return;
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return toastError(new Error('That file has no rows under its header'));
    setCsv({ name: f.name, rows });
    setMap(Object.fromEntries(fields.map((x) => [x.id, guess(x, rows[0])])));
    setSame(Object.fromEntries(fields.map((x) => [x.id, x.default ?? ''])));
  };

  const rowsOut = () =>
    body.map((r) => Object.fromEntries(fields.map((f) => [f.id, map[f.id] === SAME || map[f.id] === undefined ? (same[f.id] ?? '') : (r[Number(map[f.id])] ?? '')])));

  const start = async () => {
    setBusy(true);
    try {
      const r = await post<{ batch: AppBatch }>(`/api/apps/${enc(app.id)}/batches`, { rows: rowsOut(), concurrency: Number(conc), name: csv?.name });
      setCsv(null);
      setOpen(r.batch.id);
      loadBatches();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const missing = fields.filter((f) => f.required && (map[f.id] === SAME || map[f.id] === undefined) && !(same[f.id] ?? '').trim());

  return (
    <div className="mx-auto max-w-[960px] space-y-4 px-4 py-6 sm:px-6">
      {open && <BatchView key={open} id={open} app={app} onClose={() => (setOpen(null), loadBatches())} />}
      {!csv ? (
        <Section title="Run it for each row of a table" sub="One run per row of a CSV file: its columns fill the form. Results come back as a table you can download.">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              read(e.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-2 bg-bg-1 px-4 py-8 text-center"
          >
            <FileSpreadsheet size={26} className="text-fg-3" />
            <div className="text-[13.5px] text-fg-2">
              <button type="button" onClick={() => file.current?.click()} className="font-medium text-accent hover:underline">
                Choose a CSV file
              </button>{' '}
              <span className="max-sm:hidden">or drop it here</span>
            </div>
            <div className="text-[12px] text-fg-3">The first line names the columns · up to 500 rows</div>
            <input ref={file} type="file" accept=".csv,.tsv,text/csv,text/plain" hidden onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ''))} />
          </div>
        </Section>
      ) : (
        <Section
          title={csv.name}
          sub={`${body.length} row${body.length === 1 ? '' : 's'} · ${header.length} column${header.length === 1 ? '' : 's'}`}
          actions={
            <Button size="sm" variant="ghost" onClick={() => setCsv(null)}>
              Pick another
            </Button>
          }
        >
          <div className="space-y-2.5">
            <div className="text-[12.5px] font-medium text-fg-3">Which column answers each question</div>
            {fields.map((f) => (
              <div key={f.id} className="grid items-center gap-1.5 sm:grid-cols-[200px_1fr] sm:gap-3">
                <div className="truncate text-[13.5px]">
                  {f.label}
                  {f.required && <span className="text-err"> *</span>}
                </div>
                <div className="flex min-w-0 gap-2">
                  <select className={cx(inputCls, 'h-9 min-w-0 flex-1 text-[13.5px]')} value={map[f.id] ?? SAME} onChange={(e) => setMap((m) => ({ ...m, [f.id]: e.target.value }))}>
                    {header.map((h, i) => (
                      <option key={i} value={String(i)}>
                        Column: {h || `#${i + 1}`}
                      </option>
                    ))}
                    <option value={SAME}>The same for every row…</option>
                  </select>
                  {(map[f.id] ?? SAME) === SAME && (
                    <input className={cx(inputCls, 'h-9 min-w-0 flex-1 text-[13.5px]')} placeholder={f.options?.join(' / ') || 'Value'} value={same[f.id] ?? ''} onChange={(e) => setSame((s) => ({ ...s, [f.id]: e.target.value }))} />
                  )}
                </div>
              </div>
            ))}
            {fields.some((f) => f.type === 'file') && <div className="text-[12px] text-fg-3">A file question takes its cell as text: a path on this computer, or a web address.</div>}
          </div>

          {body.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-[12.5px] font-medium text-fg-3">The first rows, as the form will get them</div>
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[480px] border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[11.5px] text-fg-3">
                      {fields.map((f) => (
                        <th key={f.id} className="border-b border-line px-2 py-1.5 font-medium first:pl-0">
                          {f.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowsOut()
                      .slice(0, 3)
                      .map((r, i) => (
                        <tr key={i}>
                          {fields.map((f) => (
                            <td key={f.id} className="max-w-[200px] truncate border-b border-line px-2 py-1.5 first:pl-0">
                              {r[f.id] || <span className="text-fg-3">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4">
            <div className="min-w-[200px] flex-1 text-[13px] leading-snug">
              {est?.total != null ? (
                <>
                  About <b>{money(est.total)}</b> for {body.length} rows
                  <div className="text-[12px] text-fg-3">
                    From the last {est.from} run{est.from === 1 ? '' : 's'} ({money(est.perRun)} each){est.most ? ` · at most ${money(est.most)} with the cap of ${money(est.cap)} a run` : ''}
                  </div>
                </>
              ) : (
                <>
                  <span className="text-fg-2">{body.length} runs</span>
                  <div className="text-[12px] text-fg-3">{est?.most ? `At most ${money(est.most)} with the cap of ${money(est.cap)} a run. ` : ''}Run the template once to see what a run costs.</div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-fg-3">At once</span>
              <Segmented size="sm" value={conc} onChange={setConc} options={['1', '2', '3', '4', '6'].map((v) => ({ value: v, label: v }))} />
            </div>
            <Button variant="primary" icon={busy ? <Throbber /> : <Play size={13} fill="currentColor" />} disabled={busy || !body.length || missing.length > 0} onClick={start} className="max-sm:w-full">
              Run {body.length} row{body.length === 1 ? '' : 's'}
            </Button>
          </div>
          {missing.length > 0 && <div className="mt-2 text-[12px] text-err">Give a column or a value for {missing.map((f) => f.label).join(', ')}.</div>}
        </Section>
      )}

      {batches.filter((b) => b.id !== open).length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-medium text-fg-3">Earlier tables</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            {batches
              .filter((b) => b.id !== open)
              .map((b) => (
                <button key={b.id} type="button" onClick={() => setOpen(b.id)} className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-bg-1">
                  <FileSpreadsheet size={16} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px]">{b.name || 'Rows'}</span>
                    <span className="tnum block text-[12px] text-fg-3">
                      {b.done} of {b.total} done{b.failed ? ` · ${b.failed} did not finish` : ''} · {timeAgo(b.createdAt)} ago
                    </span>
                  </span>
                  <span className={cx('shrink-0 text-[12px]', b.status === 'running' ? 'text-info' : 'text-fg-3')}>{b.status === 'running' ? 'Running' : b.status === 'stopped' ? 'Stopped' : 'Finished'}</span>
                  <ChevronRight size={15} className="shrink-0 text-fg-3" />
                </button>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}


// Make a table: the runs picked (or an experiment's finished runs) as rows, by experiment or by one setting; the
// metrics as columns, each with which way is better; the baseline and the test. It shows as you choose; then Copy
// LaTeX, Copy Markdown, Download CSV, or Put it in a LaTeX document of the Library (in place of the table it made
// before there, else before \end{document}). A table is kept when you copy or place it, so the pre-submission check
// can work its numbers out again; Results tables lists them, and Work it out again takes the runs as they are now.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ClipboardCopy, Download, FileText, RefreshCw } from 'lucide-react';
import type { ResultsTable, ResultsTableSpec, RunRecord } from '@shared/experiments';
import { betterOf } from '@shared/experiments';
import { api, post } from '../../lib/api';
import { LOCALE } from '../../i18n/locale';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls, MenuItem, Popover, Throbber } from '../../components/ui';
import { copy, download, metricsOf } from './api';

type Test = 'auto' | 'welch' | 'paired' | 'bootstrap' | 'none';

export interface TableStart {
  /** The runs picked (this machine's). */
  runs?: RunRecord[];
  /** Or an experiment: its finished runs. */
  group?: string;
  /** Or a table made before. */
  table?: ResultsTable;
}

/** The table as it reads: mean ± std, the best in bold, a dagger where it is significantly better. */
function Preview({ t }: { t: ResultsTable }) {
  const cols = t.spec.columns;
  const digits = (ci: number) => {
    const d = cols[ci].digits;
    if (d !== undefined) return d;
    const big = Math.max(0, ...t.rows.map((r) => Math.abs(r.cells[ci]?.mean ?? 0)));
    return big < 1 ? 3 : big < 100 ? 2 : 1;
  };
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="tnum w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-fg-2">
              <th className="px-3 py-2 text-left font-medium">{t.spec.rows?.startsWith('param:') ? t.spec.rows.slice(6) : 'Method'}</th>
              {cols.map((c) => (
                <th key={c.metric} className="px-3 py-2 text-right font-medium whitespace-nowrap" translate="no">
                  {c.label || c.metric} {c.better === 'min' ? '↓' : '↑'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.key} className="border-t border-line first:border-t-0">
                <td className="px-3 py-1.5" translate="no">
                  {r.label}
                  <span className="ml-1.5 text-[11px] text-fg-3">{r.runs.length > 1 ? `${r.runs.length} runs` : ''}</span>
                </td>
                {r.cells.map((x, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-right whitespace-nowrap" title={x.p != null ? `p = ${x.p.toPrecision(3)}${x.pAdj != null ? `, ${x.pAdj.toPrecision(3)} after Holm’s correction` : ''}` : undefined}>
                    {x.mean === null ? (
                      <span className="text-fg-3">–</span>
                    ) : (
                      <>
                        <span className={x.best ? 'font-bold' : ''}>{x.mean.toFixed(digits(ci))}</span>
                        {x.n > 1 && x.std != null && <span className="text-fg-3"> ± {x.std.toFixed(digits(ci))}</span>}
                        {x.significant && <span className="text-accent"> †</span>}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.footnote && <p className="text-[12px] leading-relaxed text-fg-3">{t.footnote}</p>}
      {t.notes?.map((n) => (
        <p key={n} className="text-[12px] leading-relaxed text-warn">
          {n}
        </p>
      ))}
    </div>
  );
}

/** Put it in a LaTeX document: the Library's LaTeX documents, then the chosen one's files. */
function ToLatex({ onPick }: { onPick: (page: { id: string; title: string }, file: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<{ id: string; title: string; updatedAt?: number }[] | null>(null);
  const [doc, setDoc] = useState<{ id: string; title: string } | null>(null);
  const [files, setFiles] = useState<string[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setDoc(null);
    setFiles(null);
    api<{ pages: { id: string; title: string; kind?: string; updatedAt?: number }[] }>('/api/pages')
      .then((r) => setDocs(r.pages.filter((p) => p.kind === 'tex').sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))))
      .catch(() => setDocs([]));
  }, [open]);
  const choose = (d: { id: string; title: string }) => {
    setDoc(d);
    setFiles(null);
    api<{ model?: { files?: { name: string }[] } }>(`/api/pages/${d.id}`)
      .then((r) => {
        const list = ['main.tex', ...(r.model?.files ?? []).map((f) => f.name).filter((n) => /\.(tex|ltx)$/i.test(n))];
        if (list.length === 1) {
          setOpen(false);
          onPick(d, 'main.tex');
        } else setFiles(list);
      })
      .catch((e) => toastError(e));
  };
  return (
    <>
      <Button ref={ref} size="sm" variant="secondary" icon={<FileText size={14} />} onClick={() => setOpen((o) => !o)}>
        Put it in a LaTeX document
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} title="Put it in a LaTeX document" sheet>
        {doc && files ? (
          <>
            <MenuItem
              icon={<ChevronLeft size={15} />}
              onClick={() => {
                setFiles(null);
                setDoc(null);
              }}
            >
              <span className="font-medium" translate="no">
                {doc.title}
              </span>
            </MenuItem>
            {files.map((f) => (
              <MenuItem
                key={f}
                onClick={() => {
                  setOpen(false);
                  onPick(doc, f);
                }}
              >
                <span translate="no" className="font-mono text-[12.5px]">
                  {f}
                </span>
              </MenuItem>
            ))}
          </>
        ) : !docs ? (
          <div className="flex justify-center py-4 text-fg-3">
            <Throbber size={18} />
          </div>
        ) : docs.length ? (
          docs.slice(0, 30).map((d) => (
            <MenuItem key={d.id} icon={<FileText size={14} />} onClick={() => choose(d)}>
              <span translate="no">{d.title}</span>
            </MenuItem>
          ))
        ) : (
          <p className="px-2.5 py-2 text-[12.5px] leading-relaxed text-fg-3">There is no LaTeX document in the Library yet. Make one with New → LaTeX document there.</p>
        )}
      </Popover>
    </>
  );
}

export function TableDialog({ start, onClose }: { start: TableStart | null; onClose: () => void }) {
  const open = !!start;
  const runs = start?.runs ?? [];
  const [metrics, setMetrics] = useState<string[]>([]);
  const [chosen, setChosen] = useState<{ metric: string; better: 'max' | 'min' }[]>([]);
  const [rows, setRows] = useState('group');
  const [baseline, setBaseline] = useState('');
  const [test, setTest] = useState<Test>('auto');
  const [caption, setCaption] = useState('');
  const [table, setTable] = useState<ResultsTable | null>(null);
  const [saved, setSaved] = useState<{ key: string; t: ResultsTable } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [groupRuns, setGroupRuns] = useState<RunRecord[]>([]);
  const [group, setGroup] = useState('');
  const [groups, setGroups] = useState<{ name: string; done: number }[]>([]);

  // What it starts from: a table made before, or the runs' metrics (the first three).
  useEffect(() => {
    if (!start) return;
    setError(null);
    setTable(null);
    setSaved(null);
    if (start.table) {
      const s = start.table.spec;
      setChosen(s.columns.map((c) => ({ metric: c.metric, better: c.better })));
      setRows(s.rows ?? 'group');
      setBaseline(s.baseline ?? '');
      setTest(s.test ?? 'auto');
      setCaption(s.caption ?? '');
      setTable(start.table);
      setSaved({ key: JSON.stringify(s), t: start.table });
    } else {
      setChosen([]);
      setRows('group');
      setBaseline('');
      setTest('auto');
      setCaption('');
    }
    setGroupRuns([]);
    setGroup(start.group ?? '');
    // Opened for an experiment (or for none yet, from the search box): its finished runs, and the others to switch to.
    if (start.group !== undefined && !start.runs && !start.table)
      api<{ groups: { name: string; done: number }[] }>('/api/experiments/groups')
        .then((r) => {
          const list = r.groups.filter((g) => g.done > 0);
          setGroups(list);
          setGroup((g) => g || list[0]?.name || '');
        })
        .catch(() => setGroups([]));
  }, [start]);
  useEffect(() => {
    if (!group || start?.runs || start?.table) return;
    setChosen([]);
    api<{ runs: RunRecord[] }>(`/api/experiments/runs?group=${encodeURIComponent(group)}&status=done&limit=1000`)
      .then((r) => setGroupRuns(r.runs))
      .catch(() => setGroupRuns([]));
  }, [group, start]);
  const pool = start?.runs ?? groupRuns;
  useEffect(() => {
    const m = start?.table ? [...new Set([...start.table.spec.columns.map((c) => c.metric), ...metricsOf(pool)])] : metricsOf(pool);
    setMetrics(m);
    if (!start?.table && pool.length) setChosen((c) => (c.length ? c : m.slice(0, 3).map((metric) => ({ metric, better: betterOf(metric, pool[0]?.better) }))));
  }, [pool, start]);
  const settings = useMemo(() => [...new Set(pool.flatMap((r) => Object.keys(r.params ?? {})))].filter((k) => new Set(pool.map((r) => String(r.params?.[k]))).size > 1), [pool]);

  const spec = useMemo((): ResultsTableSpec | null => {
    if (!start || !chosen.length) return null;
    const base = start.table?.spec;
    return {
      ...(base?.runs ? { runs: base.runs } : base?.group ? { group: base.group } : start.runs ? { runs: start.runs.map((r) => r.id) } : { group }),
      rows: rows as ResultsTableSpec['rows'],
      columns: chosen.map((c) => ({ ...(base?.columns.find((x) => x.metric === c.metric) ?? {}), metric: c.metric, better: c.better })),
      ...(baseline ? { baseline } : {}),
      ...(test !== 'auto' ? { test } : {}),
      ...(caption.trim() ? { caption: caption.trim() } : {}),
      ...(base?.labels ? { labels: base.labels } : {}),
    };
  }, [start, group, chosen, rows, baseline, test, caption]);
  const key = spec ? JSON.stringify(spec) : '';

  // It shows as you choose (worked out on the server, not kept).
  useEffect(() => {
    if (!spec) return;
    if (saved?.key === key) return setTable(saved.t);
    let alive = true;
    const t = window.setTimeout(() => {
      post<{ table: ResultsTable }>('/api/experiments/tables/preview', spec)
        .then((r) => {
          if (!alive) return;
          setTable(r.table);
          setError(null);
        })
        .catch((e) => alive && setError((e as Error).message));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The table, kept (once per spec): what is copied or placed carries its id. */
  const keep = async (): Promise<ResultsTable> => {
    if (saved?.key === key) return saved.t;
    const r = await post<{ table: ResultsTable }>('/api/experiments/tables', spec);
    setSaved({ key, t: r.table });
    setTable(r.table);
    return r.table;
  };
  const act = async (fn: (t: ResultsTable) => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn(await keep());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const again = async () => {
    if (!saved) return;
    setBusy(true);
    try {
      const r = await post<{ table: ResultsTable; changed: boolean }>(`/api/experiments/tables/${saved.t.id}/recompute`);
      setSaved({ key, t: r.table });
      setTable(r.table);
      toast(r.changed ? 'Worked out again: some numbers changed' : 'Worked out again: the same numbers');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const rowKeys = table?.rows.map((r) => r.key) ?? [];
  const toggle = (m: string) => setChosen((c) => (c.some((x) => x.metric === m) ? c.filter((x) => x.metric !== m) : [...c, { metric: m, better: betterOf(m, pool[0]?.better) }]));

  return (
    <Dialog open={open} onClose={onClose} title={start?.table ? 'Results table' : 'Make a table'} width={860}>
      <div className="space-y-4 text-[13px]">
        {groups.length > 0 && !start?.runs && !start?.table && (
          <label className="block">
            <span className="mb-1 block text-fg-2">Experiment</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={cx(inputCls, 'h-9 text-[13px]')} translate="no">
              {groups.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {start && !start.runs && !start.table && !groups.length && !group && <p className="text-fg-3">No experiment has finished runs yet: when runs of one end, they make a table here.</p>}
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <div>
            <span className="mb-1 block text-fg-2">Columns: the metrics, and which way is better</span>
            <div className="flex flex-wrap gap-1.5">
              {metrics.map((m) => {
                const c = chosen.find((x) => x.metric === m);
                return (
                  <span key={m} className={cx('inline-flex h-8 items-center gap-1 rounded-lg border px-2', c ? 'border-accent/50 bg-accent-soft' : 'border-line')}>
                    <button type="button" onClick={() => toggle(m)} translate="no" className={cx('font-mono text-[12px]', c ? 'text-fg' : 'text-fg-3')}>
                      {m}
                    </button>
                    {c && (
                      <button
                        type="button"
                        title={c.better === 'min' ? 'Lower is better' : 'Higher is better'}
                        onClick={() => setChosen(chosen.map((x) => (x.metric === m ? { ...x, better: x.better === 'min' ? 'max' : 'min' } : x)))}
                        className="text-fg-2 hover:text-fg"
                      >
                        {c.better === 'min' ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                      </button>
                    )}
                  </span>
                );
              })}
              {!metrics.length && <span className="text-fg-3">These runs have no metrics.</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-fg-2">Rows</span>
              <select value={rows} onChange={(e) => setRows(e.target.value)} className={cx(inputCls, 'h-9 text-[13px]')}>
                <option value="group">By experiment</option>
                {settings.map((s) => (
                  <option key={s} value={`param:${s}`}>
                    By {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-fg-2">Baseline</span>
              <select value={baseline} onChange={(e) => setBaseline(e.target.value)} className={cx(inputCls, 'h-9 text-[13px]')}>
                <option value="">The first row</option>
                {rowKeys.map((k) => (
                  <option key={k} value={k} translate="no">
                    {table?.rows.find((r) => r.key === k)?.label ?? k}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block">
              <span className="mb-1 block text-fg-2">Test against the baseline</span>
              <select value={test} onChange={(e) => setTest(e.target.value as Test)} className={cx(inputCls, 'h-9 text-[13px]')}>
                <option value="auto">Pick for me (paired when the runs pair)</option>
                <option value="welch">Welch’s t-test over seeds</option>
                <option value="paired">Paired t-test (by seed or by example)</option>
                <option value="bootstrap">Paired bootstrap over examples</option>
                <option value="none">No test</option>
              </select>
            </label>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-fg-2">Caption</span>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Results on the test set." className={inputCls} />
        </label>
        {error ? (
          <p className="rounded-lg bg-err/10 px-3 py-2 leading-relaxed text-err">{error}</p>
        ) : table ? (
          <Preview t={table} />
        ) : chosen.length ? (
          <div className="flex justify-center py-6 text-fg-3">
            <Throbber />
          </div>
        ) : (
          <p className="text-fg-3">Choose the metrics to show.</p>
        )}
        {table && !error && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button size="sm" variant="primary" icon={<ClipboardCopy size={14} />} disabled={busy} onClick={() => act(async (t) => void toast((await copy(t.latex)) ? 'Copied the LaTeX' : 'Could not copy'))}>
              Copy LaTeX
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(async (t) => void toast((await copy(t.markdown)) ? 'Copied the Markdown' : 'Could not copy'))}>
              Copy Markdown
            </Button>
            <Button size="sm" variant="secondary" icon={<Download size={14} />} disabled={busy} onClick={() => act((t) => download(`results-${t.id}.csv`, t.csv, 'text/csv'))}>
              Download CSV
            </Button>
            <ToLatex
              onPick={(page, file) =>
                act(async (t) => {
                  const r = await post<{ replaced: boolean }>(`/api/experiments/tables/${t.id}/insert`, { page: page.id, file });
                  toast(r.replaced ? `Updated the table in ${page.title} (${file})` : `Put it in ${page.title} (${file})`);
                })
              }
            />
            {saved && start?.table && (
              <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} disabled={busy} onClick={again}>
                Work it out again
              </Button>
            )}
            {saved && <span className="ml-auto text-[11.5px] text-fg-3">Kept {new Date(saved.t.madeAt).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Results tables: those made before, the newest first; one opens to copy, place or work out again. */
export function TablesList({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (t: ResultsTable) => void }) {
  const [list, setList] = useState<ResultsTable[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setList(null);
    api<{ tables: ResultsTable[] }>('/api/experiments/tables')
      .then((r) => setList(r.tables))
      .catch(() => setList([]));
  }, [open]);
  const remove = async (id: string) => {
    try {
      await api(`/api/experiments/tables/${id}`, { method: 'DELETE' });
      setList((l) => l?.filter((t) => t.id !== id) ?? null);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Results tables" width={600}>
      {!list ? (
        <div className="flex justify-center py-8 text-fg-3">
          <Throbber />
        </div>
      ) : list.length ? (
        <div className="-mx-1 divide-y divide-line">
          {list.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-1 py-2">
              <button type="button" onClick={() => onOpen(t)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[13.5px] font-medium text-fg" translate="no">
                  {t.spec.caption || t.spec.group || `${t.rows.length} rows`}
                </div>
                <div className="truncate text-[12px] text-fg-3">
                  <span translate="no">{t.spec.columns.map((c) => c.metric).join(', ')}</span> · {t.rows.length} rows · {new Date(t.madeAt).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
              </button>
              <Button size="sm" variant="ghost" onClick={() => remove(t.id)}>
                Delete
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-[13px] leading-relaxed text-fg-3">No tables yet. Tick runs in the list and choose Make a table; one is kept when you copy it or put it in a document.</p>
      )}
      <div className="mt-3 text-[12px] leading-relaxed text-fg-3">
        A table put in a LaTeX document carries a line with its id, so{' '}
        <button type="button" className="text-accent hover:underline" onClick={() => go('/guide/experiments#results-tables-for-your-paper')}>
          the check before you submit
        </button>{' '}
        can work its numbers out again.
      </div>
    </Dialog>
  );
}

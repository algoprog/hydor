// A web app's Data: the tables of its own database to look through, read only, a page at a time, in the table the app's results use.
// Long values fold. Nothing here changes the data, and nothing the page types ever becomes a query: the server lists the tables
// and sends rows by their number.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { AnswerField } from '@shared/apps';
import type { WebApp, WebAppDataPage, WebAppDataTables } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { api, enc } from '../../lib/api';
import { cx, IconButton, Throbber } from '../../components/ui';
import { ResultTable } from '../apps/Result';
import { scrollForTab } from './tabs';

const PAGE = 25;
/** A cell shows this many characters before it folds. */
const FOLD = 140;
const NUMBER = /^(int|real|num|dec|float|doub)/i;
/** Tables a library or its migrations keep for themselves (their names start with _): after the app's own, and not the first one shown. */
const INTERNAL = /^_/;

/** The rows as the table component takes them: numbers as plain text (an id is not a quantity), cells by column. */
function asRows(p: WebAppDataPage): { f: AnswerField; rows: Record<string, unknown>[] } {
  const f: AnswerField = {
    id: p.table,
    label: p.table,
    type: 'table',
    columns: p.columns.map((c, i) => ({ id: `c${i}`, label: c.name, type: NUMBER.test(c.type) ? ('number' as const) : ('text' as const) })),
  };
  const rows = p.rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, typeof v === 'number' ? String(v) : v])));
  return { f, rows };
}

/** The app's own tables first, those of its libraries after them. */
const ordered = (t: WebAppDataTables) => [...t.tables.filter((x) => !INTERNAL.test(x.name)), ...t.tables.filter((x) => INTERNAL.test(x.name))];

export function Data({ app }: { app: WebApp }) {
  const [tables, setTables] = useState<WebAppDataTables | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<WebAppDataPage | null>(null);
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(false);
  const base = `/api/webapps/${enc(app.id)}/data`;
  const strip = useRef<HTMLDivElement>(null);

  const loadTables = useCallback(
    () =>
      api<WebAppDataTables>(base).then(
        (t) => {
          setTables(t);
          setError('');
          setName((cur) => (t.tables.some((x) => x.name === cur) ? cur : (ordered(t).find((x) => x.rows > 0) ?? ordered(t)[0])?.name ?? ''));
        },
        (e: Error) => setError(e.message),
      ),
    [base],
  );
  useEffect(() => void loadTables(), [loadTables]);

  useEffect(() => {
    if (!name) return setPage(null);
    const ctl = new AbortController();
    setLoading(true);
    api<WebAppDataPage>(`${base}/${enc(name)}?offset=${offset}&limit=${PAGE}`, { signal: ctl.signal }).then(
      (p) => {
        setPage(p);
        setPageError('');
        setLoading(false);
      },
      (e: Error) => {
        if (ctl.signal.aborted) return;
        setPageError(e.message);
        setLoading(false);
      },
    );
    return () => ctl.abort();
  }, [base, name, offset, tables]);

  // On a phone the strip of tables scrolls sideways: the chosen one (the first with rows, which can be the last in the strip) is brought into view.
  useEffect(() => {
    const el = strip.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && tab) el.scrollTo({ left: scrollForTab(el, tab) });
  }, [name, tables]);

  const shown = useMemo(() => (page ? asRows(page) : null), [page]);
  const pick = (n: string) => {
    setName(n);
    setOffset(0);
  };

  if (error)
    return (
      <div className="mx-auto max-w-[920px] px-4 py-5 sm:px-6 sm:py-6">
        <p translate="no" role="alert" className="rounded-2xl border border-err/35 bg-err/5 px-4 py-3 text-[13.5px] leading-relaxed text-fg-2">
          {error}
        </p>
      </div>
    );
  if (!tables)
    return (
      <div className="flex justify-center py-20 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  if (!tables.exists || !tables.tables.length)
    return (
      <div className="mx-auto max-w-[920px] px-4 py-5 sm:px-6 sm:py-6">
        <p className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center text-[13.5px] text-fg-3">{tables.exists ? 'Its database has no tables yet.' : 'No data yet: the app makes its database the first time it runs.'}</p>
      </div>
    );
  const current = tables.tables.find((t) => t.name === name);
  const total = page?.total ?? current?.rows ?? 0;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + PAGE, total);
  const pager =
    total > PAGE ? (
      <div className="flex items-center justify-end gap-2 text-[13px] text-fg-3">
        <span className="tnum">{tr(`${from}–${to} of ${total}`)}</span>
        <IconButton label="Previous rows" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
          <ChevronLeft size={16} />
        </IconButton>
        <IconButton label="Next rows" size="sm" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
    ) : null;
  return (
    // Wider than the other tabs: a table of the app's own can have many columns.
    <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-start gap-2">
        <div ref={strip} role="tablist" aria-label="Tables" className="relative flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap [&::-webkit-scrollbar]:hidden">
          {ordered(tables).map((t) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={t.name === name}
              onClick={() => pick(t.name)}
              className={cx('flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors', t.name === name ? 'bg-bg-3 font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
            >
              <span translate="no" className="truncate">
                {t.name}
              </span>
              <span className="tnum text-[11.5px] text-fg-3">{t.rows}</span>
            </button>
          ))}
        </div>
        <IconButton label="Refresh" size="sm" onClick={() => void loadTables()}>
          <RefreshCw size={14} />
        </IconButton>
      </div>

      {pager && <div className="mt-3">{pager}</div>}
      <div className="mt-3">
        {pageError ? (
          <p translate="no" role="alert" className="rounded-2xl border border-err/35 bg-err/5 px-4 py-3 text-[13.5px] text-fg-2">
            {pageError}
          </p>
        ) : !shown ? (
          <div className="flex justify-center py-12 text-fg-3">
            <Throbber size={22} />
          </div>
        ) : shown.rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center text-[13.5px] text-fg-3">This table is empty.</p>
        ) : (
          <div translate="no" className={cx('rounded-2xl border border-line bg-panel px-3 py-2 transition-opacity sm:px-4', loading && 'opacity-60')}>
            <ResultTable f={shown.f} rows={shown.rows} fold={FOLD} />
          </div>
        )}
      </div>

      {pager && <div className="mt-3">{pager}</div>}
      {page?.truncated && <p className="mt-2 text-right text-[12px] text-fg-3">Values longer than 2,000 characters are cut.</p>}
    </div>
  );
}

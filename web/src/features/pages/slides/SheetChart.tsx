// A chart from a spreadsheet of the Library (Google Slides' linked charts): Insert → Chart → From a spreadsheet picks
// the spreadsheet, a sheet of it and its cells (a table it finds there, or a range), its series down the columns or
// along the rows, and the kind of chart, drawn as it will be before it is put on the slide. The chart keeps where it came
// from (ChartEl.source); its Format panel says so and has Update from the spreadsheet, which reads its numbers again
// (the series keep the colours they were given).
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import { chartFromSheet, sheetTables } from '@shared/slides-sheet';
import { CHART_KINDS, newId, type ChartEl, type ChartKind, type ChartSource, type Deck, type El } from '@shared/slides';
import type { Workbook } from '@shared/sheets';
import { api, enc } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';
import { LOCALE } from '../../../i18n/locale';
import { Button, cx, Dialog } from '../../../components/ui';
import { Choice, Select } from '../studio/fields';
import { Field } from './controls';
import { LibraryPick } from './LibraryPick';
import { SlideThumb } from './Thumb';
import { heightOf, W } from './ops';

export const CHART_NAMES: Record<ChartKind, string> = { column: 'Column chart', bar: 'Bar chart', line: 'Line chart', area: 'Area chart', pie: 'Pie chart', doughnut: 'Doughnut chart' };

/** A spreadsheet of the Library as it is now: its name and its workbook. */
async function loadBook(page: string): Promise<{ title: string; book: Workbook }> {
  const r = await api<{ page: PageInfo; model: Workbook }>(`/api/pages/${enc(page)}`);
  if (r.page.kind !== 'sheet' || !r.model?.sheets) throw new Error('That is not a spreadsheet of the Library any more');
  return { title: r.page.title, book: r.model };
}

/** A chart's numbers read again from its spreadsheet: the chart as it is to be, or why not. */
export async function chartUpdated(el: ChartEl): Promise<ChartEl> {
  const src = el.source;
  if (!src) return el;
  const { title, book } = await loadBook(src.page);
  const r = chartFromSheet(book, src, el.kind);
  if ('error' in r) throw new Error(r.error);
  // Each series keeps the colour it was given, by its name (else its place).
  const series = r.series.map((s, i) => {
    const was = el.series.find((x) => x.name === s.name) ?? el.series[i];
    return was?.color ? { ...s, color: was.color } : s;
  });
  return { ...el, labels: r.labels, series, source: { ...src, title, at: Date.now() } };
}

/** The chart's Format panel: where its numbers come from, and Update from the spreadsheet. */
export function ChartSourceRow({ el, set }: { el: ChartEl; set: (patch: Partial<El>, key?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const src = el.source;
  if (!src) return null;
  const update = async () => {
    setBusy(true);
    try {
      const next = await chartUpdated(el);
      set({ labels: next.labels, series: next.series, source: next.source } as Partial<El>);
      toast(`Updated from “${next.source?.title ?? 'the spreadsheet'}”`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5 rounded-lg bg-bg-1 p-2">
      <p className="text-[12px] leading-snug text-fg-3">
        From{' '}
        <span translate="no" className="font-medium text-fg-2">
          “{src.title ?? 'a spreadsheet'}”
        </span>
        <span translate="no">{` · ${src.sheet} ${src.range}`}</span>
        {src.at ? ` · ${new Date(src.at).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
      </p>
      <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} disabled={busy} onClick={() => void update()}>
        {busy ? 'Updating…' : 'Update from the spreadsheet'}
      </Button>
    </div>
  );
}

/** Insert → Chart → From a spreadsheet. */
export function SheetChartDialog({ open, deck, onClose, onInsert }: { open: boolean; deck: Deck; onClose: () => void; onInsert: (el: ChartEl) => void }) {
  const [page, setPage] = useState<PageInfo | null>(null);
  const [got, setGot] = useState<{ title: string; book: Workbook } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState('');
  const [range, setRange] = useState('');
  const [by, setBy] = useState<'cols' | 'rows'>('cols');
  const [kind, setKind] = useState<ChartKind>('column');
  useEffect(() => {
    if (open) return;
    setPage(null);
    setGot(null);
    setError(null);
    setRange('');
  }, [open]);
  const pick = async (p: PageInfo) => {
    setPage(p);
    setGot(null);
    setError(null);
    try {
      const b = await loadBook(p.id);
      setGot(b);
      // Its largest table, to start from.
      const first = sheetTables(b.book, 1)[0];
      setSheet(first?.sheet ?? b.book.sheets[0]?.name ?? '');
      setRange(first?.range ?? '');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const tables = useMemo(() => (got ? sheetTables(got.book).filter((t) => t.sheet === sheet) : []), [got, sheet]);
  const cells = range.replace(/[\s$]/g, '').toUpperCase();
  const read = useMemo(() => (got && sheet && cells ? chartFromSheet(got.book, { sheet, range: cells, ...(by === 'rows' ? { by: 'rows' as const } : {}) }, kind) : null), [got, sheet, cells, by, kind]);
  const H = heightOf(deck);
  const chart: ChartEl | null =
    read && 'labels' in read && page
      ? {
          id: newId(),
          type: 'chart',
          x: Math.round((W - 820) / 2),
          y: Math.round((H - 460) / 2),
          w: 820,
          h: 460,
          kind,
          labels: read.labels,
          series: read.series,
          legend: true,
          grid: true,
          size: 18,
          source: { page: page.id, sheet, range: cells, ...(by === 'rows' ? { by: 'rows' } : {}), title: got?.title ?? page.title, at: Date.now() } satisfies ChartSource,
        }
      : null;
  const shown: Deck | null = chart ? { ...deck, footer: undefined, logo: undefined, slides: [{ id: 'preview', els: [{ ...chart, x: 40, y: 40, w: W - 80, h: H - 80 }] }] } : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="A chart from a spreadsheet"
      width={640}
      footer={
        <Button size="sm" variant="primary" disabled={!chart} onClick={() => chart && onInsert(chart)}>
          Insert the chart
        </Button>
      }
    >
      <div className="space-y-3">
        <LibraryPick kind="sheet" picked={page?.id ?? null} onPick={(p) => void pick(p)} empty="No spreadsheets in your Library yet." />
        {error && <p className="text-[12.5px] text-err">{error}</p>}
        {page && !got && !error && <p className="text-[12.5px] text-fg-3">Reading it…</p>}
        {got && (
          <div className="space-y-1.5">
            {got.book.sheets.length > 1 && (
              <Field label="Sheet">
                <Select
                  value={sheet}
                  onChange={(v) => {
                    setSheet(v);
                    setRange(sheetTables(got.book).find((t) => t.sheet === v)?.range ?? '');
                  }}
                  options={got.book.sheets.map((s) => ({ value: s.name, label: s.name }))}
                />
              </Field>
            )}
            {tables.length > 0 && (
              <Field label="Its tables" top>
                {tables.slice(0, 6).map((t) => (
                  <button
                    key={t.range}
                    type="button"
                    onClick={() => setRange(t.range)}
                    title={t.names.filter(Boolean).join(', ')}
                    className={cx('max-w-full truncate rounded-full border px-2.5 py-0.5 text-[12px]', cells === t.range ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line text-fg-2 hover:border-line-2')}
                  >
                    <span translate="no">{`${t.range}${t.names.some(Boolean) ? ` · ${t.names.filter(Boolean).slice(0, 3).join(', ')}` : ''}`}</span>
                  </button>
                ))}
              </Field>
            )}
            <Field label="Cells">
              <input
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="A1:D7"
                aria-label="The cells, as A1:D7"
                translate="no"
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg-1 px-2 font-mono text-[12.5px] outline-none focus:border-accent/60"
              />
            </Field>
            <Field label="Series">
              <Choice
                value={by}
                onChange={setBy}
                options={[
                  { value: 'cols', label: 'Down the columns' },
                  { value: 'rows', label: 'Along the rows' },
                ]}
              />
            </Field>
            <Field label="Kind">
              <Select value={kind} onChange={(v) => setKind(v as ChartKind)} options={CHART_KINDS.map((k) => ({ value: k, label: CHART_NAMES[k] }))} />
            </Field>
            {read && 'error' in read && <p className="text-[12.5px] text-err">{read.error}</p>}
            {shown && (
              <div className="overflow-hidden rounded-lg border border-line">
                <SlideThumb deck={shown} index={0} slide={shown.slides[0]} theme={shown.theme} width={Math.min(420, window.innerWidth - 72)} fonts={0} className="mx-auto" />
              </div>
            )}
            <p className="text-[11.5px] leading-snug text-fg-3">The chart keeps where it came from: its Format panel updates it when the spreadsheet changes.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

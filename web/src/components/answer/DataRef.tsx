// A card that reads its data from a Library spreadsheet or a data file (shared/answer-ui/data-ref.ts): the server works
// its data out (POST /api/answers/data, server/answers/data.ts) and the card's view draws it as it draws numbers typed in.
// Under it, a line says where they came from (a link that opens the spreadsheet or the file) and when they were read; a
// source that is gone, a range or a column that is not there, shows as a plain message in the card's place (the
// server's words, in the app's language: the card is translate="no", so they go through tr()).
//
// What came back is kept on this page for each card, so a card drawn again (scrolled back to, opened full screen) shows
// at once and asks again behind it. It asks again when a page of the Library is saved (the app says so: a spreadsheet
// may have changed; the server answers from what it keeps while it has not), when the app comes back into view (a file
// may have changed meanwhile), and with Read again.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, RefreshCw, Sheet } from 'lucide-react';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { api } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { goApp, openFile } from '../../lib/nav';
import { cx } from '../ui';
import { Card, fmtNum, isObj, str, type Data } from './kit';

export interface CardSource {
  kind: 'sheet' | 'file';
  /** A spreadsheet's page id, its name, tab and range. */
  id?: string;
  name: string;
  tab?: string;
  range?: string;
  /** A file's path. */
  path?: string;
}

export interface CardData {
  data: Data;
  source: CardSource;
  readAt: number;
  rows: number;
  matched: number;
  shown?: number;
  total?: number;
  notes: string[];
}

export interface CardState {
  /** The card's data, as its view draws it (the last that came, while it asks again). */
  got: CardData | null;
  error: string;
  loading: boolean;
  again: () => void;
}

/** What came back for each card on this page, by what was asked. */
const kept = new Map<string, CardData>();
const KEEP = 200;

/** Where a source's name (a spreadsheet's, as the server gives it) is said from while it is read. */
const sourceName = (data: Data): string => {
  const f = data.from;
  if (typeof f === 'string') return f;
  if (!isObj(f)) return '';
  return str(f.file ?? f.path) || [str(f.sheet ?? f.spreadsheet ?? f.id), str(f.range) || str(f.tab)].filter(Boolean).join(' · ');
};

/**
 * A reference card's data: asked for once its block is whole (`on`), from the session or board it is drawn in, and again
 * when the Library changes or the app comes back into view.
 */
export function useCardData(ui: string, data: Data, on: boolean, at: { session?: string; board?: string }): CardState {
  const body = on ? JSON.stringify({ ui, data, session: at.session, board: at.board }) : '';
  const [got, setGot] = useState<CardData | null>(() => (body ? (kept.get(body) ?? null) : null));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const ask = useCallback(() => {
    if (!body) return;
    const n = ++seq.current;
    setLoading(true);
    api<CardData>('/api/answers/data', { method: 'POST', body: JSON.parse(body) })
      .then((r) => {
        if (n !== seq.current) return;
        kept.delete(body);
        kept.set(body, r);
        if (kept.size > KEEP) kept.delete(kept.keys().next().value!);
        setGot(r);
        setError('');
      })
      .catch((e: Error) => {
        if (n !== seq.current) return;
        setError(e.message || tr('It could not be read.'));
      })
      .finally(() => n === seq.current && setLoading(false));
  }, [body]);
  useEffect(() => {
    setGot(body ? (kept.get(body) ?? null) : null);
    setError('');
    ask();
  }, [body, ask]);
  // A spreadsheet saved (any page of the Library: the server knows whether this one changed); a little later, once
  // for a burst of saves.
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useFeatureEvent('pages', ({ data: e }) => {
    if ((e as { what?: string })?.what !== 'pages' || !body) return;
    clearTimeout(later.current);
    later.current = setTimeout(ask, 400);
  });
  useEffect(() => {
    if (!body) return;
    const back = () => document.visibilityState === 'visible' && ask();
    document.addEventListener('visibilitychange', back);
    return () => {
      document.removeEventListener('visibilitychange', back);
      clearTimeout(later.current);
    };
  }, [body, ask]);
  return { got, error, loading, again: ask };
}

/** When something was read: its time today, else its day and time. */
function readAtText(ms: number): string {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  try {
    return new Intl.DateTimeFormat(LOCALE ?? navigator.language, today ? { hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

/** Opens a card's source: the spreadsheet in the Library, or the file in the file viewer. */
function openSource(s: CardSource) {
  if (s.kind === 'sheet' && s.id) goApp(`/pages/${s.id}`);
  else if (s.path) openFile(s.path);
}

/** The line under a card: where its data came from (a link to it), when it was read, how much of it shows, Read again. */
export function FromLine({ card, loading, again }: { card: CardData; loading: boolean; again: () => void }) {
  const s = card.source;
  const where = s.kind === 'sheet' ? [s.name, s.tab].filter(Boolean).join(' · ') : s.name;
  const Icon = s.kind === 'sheet' ? Sheet : FileText;
  return (
    <div data-aui-from className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1 text-[11.5px] text-fg-3">
      <Icon size={12} className="shrink-0" aria-hidden />
      <span>
        {tr('Data from')}{' '}
        <a
          href={s.kind === 'sheet' && s.id ? `/pages/${s.id}` : `/file?path=${encodeURIComponent(s.path ?? '')}`}
          onClick={(e) => {
            e.preventDefault();
            openSource(s);
          }}
          title={s.kind === 'sheet' ? (s.range ? `${where}!${s.range}` : where) : s.path}
          className="font-medium text-fg-2 hover:text-accent hover:underline"
        >
          {where}
        </a>
      </span>
      <span aria-hidden>·</span>
      <span>{tr('read at {0}').replace('{0}', readAtText(card.readAt))}</span>
      {card.shown !== undefined && card.total !== undefined && (
        <>
          <span aria-hidden>·</span>
          <span>{tr('{0} of {1} shown').replace('{0}', fmtNum(card.shown)).replace('{1}', fmtNum(card.total))}</span>
        </>
      )}
      <button type="button" onClick={again} title={tr('Read again')} aria-label={tr('Read again')} className="ml-0.5 grid h-5 w-5 place-items-center rounded hover:bg-bg-2 hover:text-fg">
        <RefreshCw size={11} className={cx(loading && 'animate-spin')} />
      </button>
      {card.notes.map((n, i) => (
        <span key={i} className="basis-full text-fg-3">
          {tr(n)}
        </span>
      ))}
    </div>
  );
}

/** The card's place while its data is read for the first time. */
export function Reading({ data }: { data: Data }) {
  const name = sourceName(data);
  return (
    <Card>
      {str(data.title) && <h3 className="aui-h3 mb-2">{str(data.title)}</h3>}
      <div className="breathe flex items-center gap-2 text-[13px] text-fg-3">
        <Sheet size={14} aria-hidden />
        {name ? tr('Reading {0}…').replace('{0}', name) : tr('Reading the data…')}
      </div>
    </Card>
  );
}

/** The card's place when its data could not be read: what went wrong, in words, and Try again. */
export function NotRead({ data, error, again, loading }: { data: Data; error: string; again: () => void; loading: boolean }) {
  return (
    <Card>
      {str(data.title) && <h3 className="aui-h3 mb-2">{str(data.title)}</h3>}
      <div role="status" className="text-[13px] text-fg-2">
        <div className="font-medium text-fg">{tr('This card could not read its data.')}</div>
        <div className="mt-0.5 text-fg-3">{tr(error)}</div>
      </div>
      <button type="button" onClick={again} disabled={loading} className="mt-2.5 inline-flex h-7 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12.5px] text-fg-2 hover:bg-bg-2 disabled:opacity-60">
        <RefreshCw size={12} className={cx(loading && 'animate-spin')} />
        {tr('Try again')}
      </button>
    </Card>
  );
}

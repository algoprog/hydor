// Parts of an agent's page beside its sentences: the inbox of an agent that keeps a conversation of its own (its
// messages, from you and other agents, each with its answer, and a box to send it one), and its history of results
// (a table with a row for each, a column for each field, and where each went).
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, FileText, MessageSquareText, Send, Table2 } from 'lucide-react';
import type { AnswerField } from '@shared/apps';
import { outputFields, RESULTS_KEEP, type AgentResult, type AgentResults, type Assistant, type InboxItem, type OutputKind, type ResultSent } from '@shared/assistants';
import { api, enc, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { onFeatureEvent } from '../../lib/featureEvents';
import { go, openSession } from '../../lib/nav';
import { LOCALE } from '../../i18n/locale';
import { toastError } from '../../lib/store';
import { Button, cx, inputCls, Throbber } from '../../components/ui';

const STATUS: Record<InboxItem['status'], { label: string; cls: string }> = {
  queued: { label: 'Waiting its turn', cls: 'text-fg-3' },
  sent: { label: 'With it now', cls: 'text-info' },
  answered: { label: 'Answered', cls: 'text-ok' },
  failed: { label: 'No answer', cls: 'text-err' },
};

/** Something that reloads when the server says this agent's inbox or results changed. */
function useReloading<T>(url: string, what: 'inbox' | 'results', id: string): [T | null, () => void] {
  const [v, setV] = useState<T | null>(null);
  const load = () => {
    api<T>(url).then(setV, () => {});
  };
  useEffect(() => {
    load();
    return onFeatureEvent('assistants', (e) => {
      if ((e.data as Record<string, unknown> | undefined)?.[what] === id) load();
    });
  }, [url]);
  return [v, load];
}

export function InboxPanel({ a }: { a: Assistant }) {
  const [st, reload] = useReloading<{ key: string | null; items: InboxItem[] }>(`/api/assistants/${enc(a.id)}/inbox`, 'inbox', a.id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await post(`/api/assistants/${enc(a.id)}/inbox`, { text });
      setText('');
      reload();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const conversation = async () => {
    try {
      openSession(st?.key ?? (await post<{ key: string }>(`/api/assistants/${enc(a.id)}/standing`)).key);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-[14px] font-semibold">Inbox</h3>
        <Button size="sm" variant="ghost" icon={<MessageSquareText size={14} />} onClick={() => void conversation()}>
          Its conversation
        </Button>
      </div>
      <div className="mb-3 text-[12.5px] text-fg-3">
        It keeps one conversation of its own. Messages from you and other agents go in one at a time, and each answer goes back to whoever sent it; its scheduled runs post there too.
      </div>
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && void send()}
          rows={2}
          placeholder={`A message for ${a.name}`}
          className={cx(inputCls, 'h-auto min-w-0 flex-1 resize-y py-2 leading-relaxed')}
        />
        <Button size="sm" variant="primary" icon={busy ? <Throbber size={13} /> : <Send size={14} />} disabled={!text.trim() || busy} onClick={() => void send()}>
          Send
        </Button>
      </div>
      <div className="mt-3 -mb-1 divide-y divide-line">
        {!st ? (
          <Throbber className="my-2 text-fg-3" />
        ) : !st.items.length ? (
          <div className="py-2 text-[13px] text-fg-3">Nothing yet.</div>
        ) : (
          st.items.slice(0, 12).map((m) => (
            <button key={m.id} type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="block w-full py-2 text-left">
              <div className="flex items-center gap-2 text-[12px]">
                <span translate={m.from.kind === 'user' ? undefined : 'no'} className="font-medium text-fg-2">
                  {m.from.kind === 'user' ? 'You' : m.from.name}
                </span>
                <span className={STATUS[m.status].cls}>{STATUS[m.status].label}</span>
                <span className="ml-auto text-fg-3">{timeAgo(m.createdAt)}</span>
              </div>
              <div translate="no" className={cx('mt-0.5 text-[13px] text-fg', open === m.id ? 'whitespace-pre-wrap' : 'truncate')}>
                {m.text}
              </div>
              {m.reply && (
                <div translate="no" className={cx('mt-1 border-l-2 border-line-2 pl-2 text-[12.5px] text-fg-2', open === m.id ? 'whitespace-pre-wrap' : 'line-clamp-2')}>
                  {m.reply}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}

const SENT: Record<OutputKind, string> = {
  file: 'File',
  library: 'Page',
  sheet: 'Spreadsheet',
  email: 'Email',
  webhook: 'Webhook',
  notify: 'Notification',
};

/** Stands for a field too long to keep in the history (server/assistants/results.ts). */
const CUT = 'Too long to keep here: see where it went.';

/** When a result came: the day and time, with the year when it is not this one. */
function when(at: number): string {
  const d = new Date(at);
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit' });
}

const firstLine = (s: string) =>
  (s.split('\n').find((l) => l.trim() && !/^\s*(#|\||---)/.test(l)) ?? s)
    .replace(/[#*`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

/** A field's value in a cell of the table: short, the whole of it in its row's details. */
function Brief({ f, v }: { f: AnswerField; v: unknown }) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return <span className="text-fg-3">—</span>;
  if (v === CUT) return <span className="text-fg-3 italic">Too long to keep</span>;
  if (f.type === 'number' && typeof v === 'number') return <span className="tabular-nums">{v.toLocaleString(LOCALE)}</span>;
  if (f.type === 'yesno' && typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>;
  if (f.type === 'url' && typeof v === 'string')
    return (
      <a href={v} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent hover:underline" translate="no">
        {v.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}
      </a>
    );
  if (f.type === 'list' && Array.isArray(v))
    return (
      <span translate="no" title={v.map(String).join('\n')}>
        {v.map(String).join(', ')}
      </span>
    );
  if (f.type === 'table' && Array.isArray(v)) return <span>{v.length === 1 ? '1 row' : `${v.length} rows`}</span>;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return (
    <span translate="no" title={s.length > 60 ? s.slice(0, 600) : undefined}>
      {firstLine(s)}
    </span>
  );
}

/** A field's value whole, in its row's details. */
function Whole({ f, v }: { f: AnswerField; v: unknown }) {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return <span className="text-fg-3">—</span>;
  if (f.type === 'list' && Array.isArray(v))
    return (
      <ul translate="no" className="list-disc pl-5">
        {v.map((x, i) => (
          <li key={i}>{String(x)}</li>
        ))}
      </ul>
    );
  if (f.type === 'table' && Array.isArray(v)) {
    const cols = f.columns?.length ? f.columns : Object.keys((v[0] as Record<string, unknown>) ?? {}).map((id) => ({ id, label: id }));
    return (
      <div className="overflow-x-auto">
        <table translate="no" className="text-[12.5px]">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.id} className="border-b border-line px-2 py-1 text-left font-medium text-fg-2">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(v as Record<string, unknown>[]).map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.id} className="border-b border-line px-2 py-1 align-top">
                    {r?.[c.id] === null || r?.[c.id] === undefined ? '' : typeof r[c.id] === 'boolean' ? (r[c.id] ? 'Yes' : 'No') : String(r[c.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (f.type === 'markdown' || f.type === 'text')
    return (
      <div translate="no" className="whitespace-pre-wrap">
        {String(v)}
      </div>
    );
  return <Brief f={f} v={v} />;
}

function Sent({ s }: { s: ResultSent }) {
  const label = SENT[s.kind] ?? s.kind;
  const cls = cx('inline-flex items-center gap-1 whitespace-nowrap', s.ok ? 'text-fg-3' : 'text-err');
  const icon = s.ok ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />;
  if (s.page && s.ok)
    return (
      <button
        type="button"
        title={s.detail}
        onClick={(e) => {
          e.stopPropagation();
          go(`/pages/${enc(s.page!)}`);
        }}
        className={cx(cls, 'hover:text-accent hover:underline')}
      >
        {icon}
        {label}
      </button>
    );
  return (
    <span title={s.detail} className={cls}>
      {icon}
      {label}
    </span>
  );
}

const PAGE = 50;

/**
 * The agent's history: a table with a row for each result it handed back, newest first, a column for each of its
 * fields, and where each went (and whether it got there); a row opens to the whole result. Older ones come in pages.
 */
export function ResultsPanel({ a }: { a: Assistant }) {
  const [st, reload] = useReloading<AgentResults>(`/api/assistants/${enc(a.id)}/results?limit=${PAGE}`, 'results', a.id);
  const [older, setOlder] = useState<AgentResult[]>([]);
  const [more, setMore] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  // A new first page (a new result came) starts the list again.
  useEffect(() => {
    setOlder([]);
    setMore(null);
  }, [st]);
  const fields = outputFields(a.output);
  const rows = [...(st?.results ?? []), ...older];
  const hasMore = more ?? st?.more ?? false;
  const loadOlder = async () => {
    const last = rows[rows.length - 1];
    if (!last?.id) return;
    setBusy(true);
    try {
      const r = await api<AgentResults>(`/api/assistants/${enc(a.id)}/results?limit=${PAGE}&before=${last.id}`);
      setOlder((o) => [...o, ...r.results]);
      setMore(r.more);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const made: { id: string; title: string; icon: ReactNode; kind: string }[] = [];
  if (st?.made.sheet) made.push({ ...st.made.sheet, icon: <Table2 size={13} />, kind: 'The spreadsheet its results go into' });
  if (st?.made.library) made.push({ ...st.made.library, icon: <FileText size={13} />, kind: 'The page it updates each run' });
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="flex-1 text-[14px] font-semibold">What it handed back</h3>
        {made.map((p) => (
          <button key={p.id} type="button" title={p.kind} onClick={() => go(`/pages/${enc(p.id)}`)} className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
            {p.icon}
            <span translate="no">{p.title}</span>
          </button>
        ))}
        <button type="button" onClick={reload} className="text-[12px] text-fg-3 hover:text-fg">
          {st ? (st.total === 1 ? '1 result' : `${st.total} results`) : ''}
        </button>
      </div>
      {!st ? (
        <Throbber className="text-fg-3" />
      ) : !rows.length ? (
        <div className="text-[13px] text-fg-3">Nothing yet. At the end of each task it hands back its result, checked, and it goes where its settings say. Each one is kept here, with where it went.</div>
      ) : (
        <>
          <div className="max-h-[520px] overflow-auto rounded-xl border border-line">
            <table className="w-full min-w-max border-collapse text-[13px]">
              <thead className="sticky top-0 z-[1] bg-panel">
                <tr className="text-left text-[12px] text-fg-3">
                  <th className="border-b border-line px-3 py-2 font-medium">When</th>
                  {fields.map((f) => (
                    <th key={f.id} translate="no" className="border-b border-line px-3 py-2 font-medium">
                      {f.label}
                    </th>
                  ))}
                  <th className="border-b border-line px-3 py-2 font-medium">Went to</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const k = r.id ?? r.at;
                  const isOpen = open === k;
                  return (
                    <Fragment key={k}>
                      <tr onClick={() => setOpen(isOpen ? null : k)} className={cx('cursor-pointer align-top hover:bg-bg-2', isOpen && 'bg-bg-2')}>
                        <td className="border-b border-line px-3 py-2 whitespace-nowrap text-fg-2">{when(r.at)}</td>
                        {fields.map((f) => (
                          <td key={f.id} className={cx('max-w-[260px] truncate border-b border-line px-3 py-2', f.type === 'number' && 'text-right')}>
                            <Brief f={f} v={r.value?.[f.id]} />
                          </td>
                        ))}
                        <td className="border-b border-line px-3 py-2">
                          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[12px]">
                            {r.sent.length ? r.sent.map((s, i) => <Sent key={i} s={s} />) : <span className="text-fg-3">The conversation</span>}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={fields.length + 2} className="border-b border-line bg-bg-1 px-3 py-3">
                            <div className="max-w-3xl space-y-3 whitespace-normal">
                              {fields.map((f) => (
                                <div key={f.id}>
                                  <div translate="no" className="mb-0.5 text-[12px] font-medium text-fg-2">
                                    {f.label}
                                  </div>
                                  <Whole f={f} v={r.value?.[f.id]} />
                                </div>
                              ))}
                              {r.sent.length > 0 && (
                                <div className="space-y-0.5 text-[12px]">
                                  {r.sent.map((s, i) => (
                                    <div key={i} className={s.ok ? 'text-fg-3' : 'text-err'}>
                                      <span className="font-medium">{SENT[s.kind] ?? s.kind}</span>
                                      {s.ok ? ': ' : ', not sent: '}
                                      <span translate="no">{s.detail}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button type="button" onClick={() => openSession(r.key)} className="inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
                                <MessageSquareText size={13} />
                                Open its session
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-fg-3">
            <span className="flex-1">{`Kept for a year, up to ${RESULTS_KEEP.count} results.`}</span>
            {hasMore && (
              <Button size="sm" variant="ghost" icon={busy ? <Throbber size={13} /> : undefined} disabled={busy} onClick={() => void loadOlder()}>
                Show older
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

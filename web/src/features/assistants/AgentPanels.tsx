// Parts of an agent's page beside its sentences: the inbox of an agent that keeps a conversation of its own (its
// messages, from you and other agents, each with its answer, and a box to send it one), and the results
// it handed back lately (where each went).
import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, MessageSquareText, Send } from 'lucide-react';
import type { AgentResult, Assistant, InboxItem } from '@shared/assistants';
import { api, enc, post } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { onFeatureEvent } from '../../lib/featureEvents';
import { openSession } from '../../lib/nav';
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

export function ResultsPanel({ a }: { a: Assistant }) {
  const [st] = useReloading<{ results: AgentResult[] }>(`/api/assistants/${enc(a.id)}/results`, 'results', a.id);
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <h3 className="mb-2 text-[14px] font-semibold">What it handed back</h3>
      {!st ? (
        <Throbber className="text-fg-3" />
      ) : !st.results.length ? (
        <div className="text-[13px] text-fg-3">Nothing yet. At the end of each task it hands back its result, checked, and it goes where its settings say.</div>
      ) : (
        <div className="-my-1 divide-y divide-line">
          {st.results.slice(0, 8).map((r) => (
            <div key={`${r.at}-${r.key}`} className="py-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => openSession(r.key)} translate="no" className="min-w-0 flex-1 truncate text-left text-[13px] hover:underline">
                  {r.line || '…'}
                </button>
                <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(r.at)}</span>
              </div>
              {r.sent.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                  {r.sent.map((s, i) => (
                    <span key={i} title={s.detail} className={cx('inline-flex items-center gap-1', s.ok ? 'text-fg-3' : 'text-err')}>
                      {s.ok ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
                      {s.kind === 'file' ? 'File' : s.kind === 'library' ? 'Library' : s.kind === 'webhook' ? 'Webhook' : 'Notification'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

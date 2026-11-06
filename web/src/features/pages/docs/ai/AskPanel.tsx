// Ask about this document (View → Ask about this document): a panel beside the page where questions are answered from
// what the document says, by the helper model, each answer with links to the passages it rests on (a click goes to
// the passage and marks it). The questions and answers stay while the document is open; nothing is kept.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageCircleQuestion, Square, X } from 'lucide-react';
import type { Doc } from '@shared/docs';
import { toastError } from '../../../../lib/store';
import { IconButton, Throbber } from '../../../../components/ui';
import { askDoc, costWords, plainOf } from './ai';

interface Turn {
  q: string;
  /** The passages as they were when it was asked (its answer's [P3] marks are theirs). */
  paras: { id: string; text: string }[];
  a?: string;
  cites?: string[];
  by?: string;
  short?: boolean;
}

/** The document's passages as the model gets them: each block with words, by its id. */
const passages = (d: Doc) => d.blocks.flatMap((b) => {
  const text = plainOf([b]).replace(/^#+\s/, '');
  return text.trim() ? [{ id: b.id, text: text.slice(0, 3000) }] : [];
});

/** An answer's words, its [P3] marks as links to their passages. */
function Answer({ text, ids, all, onGo }: { text: string; ids: string[]; all: { id: string }[]; onGo: (id: string) => void }) {
  const parts = text.split(/(\[P\s*\d+(?:\s*[,–-]\s*P?\s*\d+)*\])/gi);
  return (
    <div translate="no" className="text-[13px] leading-relaxed whitespace-pre-wrap text-fg">
      {parts.map((p, k) => {
        const m = /^\[P\s*(.*)\]$/i.exec(p);
        if (!m) return <span key={k}>{p}</span>;
        const nums = m[1].split(/\s*,\s*/).map((x) => Number(x.replace(/\D.*$/, '').replace(/\D/g, '')));
        return (
          <span key={k} className="whitespace-nowrap">
            {nums.map((n) => {
              const id = all[n - 1]?.id;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!id || !ids.includes(id)}
                  onClick={() => id && onGo(id)}
                  title="Go to this passage"
                  className="mx-0.5 inline-flex h-[18px] items-center rounded-md bg-accent-soft px-1.5 align-[1px] text-[11px] font-semibold text-accent hover:bg-accent hover:text-white disabled:opacity-50"
                >
                  ¶{n}
                </button>
              );
            })}
          </span>
        );
      })}
    </div>
  );
}

export function AskPanel({ doc, title, onGo, onClose }: { doc: Doc; title: string; onGo: (id: string) => void; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = useRef<AbortController | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => stop.current?.abort(), []);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [turns]);

  const send = async () => {
    const question = q.trim();
    if (!question || busy) return;
    const ac = new AbortController();
    stop.current = ac;
    setQ('');
    setBusy(true);
    const history = turns.filter((t) => t.a).slice(-4).map((t) => ({ q: t.q, a: t.a! }));
    const paragraphs = passages(doc);
    setTurns((t) => [...t, { q: question, paras: paragraphs }]);
    try {
      const r = await askDoc({ question, title, paragraphs, history }, ac.signal);
      setTurns((t) => t.map((x, k) => (k === t.length - 1 ? { ...x, a: r.answer, cites: r.cites, by: `${r.model ?? 'AI'}${costWords(r)}`, short: r.short } : x)));
    } catch (err) {
      if (!ac.signal.aborted) toastError(err);
      setTurns((t) => t.filter((x, k) => k !== t.length - 1 || x.a));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-keeps-editing>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <MessageCircleQuestion size={15} className="text-accent" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">Ask about this document</span>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {!turns.length && <p className="text-[12.5px] leading-relaxed text-fg-3">Ask anything about what this document says: “What does it decide about the budget?”, “Who is responsible for testing?”. The answers come from the document alone, with links to the passages they rest on.</p>}
        {turns.map((t, k) => (
          <div key={k} className="space-y-1.5">
            <div translate="no" className="ml-6 rounded-xl bg-bg-2 px-3 py-2 text-[13px] text-fg">
              {t.q}
            </div>
            {t.a ? (
              <div className="space-y-1">
                <Answer text={t.a} ids={t.cites ?? []} all={t.paras} onGo={onGo} />
                <div className="text-[11px] text-fg-3">
                  By {t.by}
                  {t.short ? ' · only the start of a long document was read' : ''}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
                <Throbber size={13} />
                Reading the document…
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <div className="flex items-end gap-1.5 rounded-xl border border-line bg-bg px-2.5 py-1.5 focus-within:border-accent">
          <textarea
            ref={input}
            rows={1}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about this document"
            aria-label="Your question"
            className="max-h-32 min-h-[24px] min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[13.5px] text-fg outline-none placeholder:text-fg-3"
          />
          {busy ? (
            <button type="button" title="Stop" aria-label="Stop" onClick={() => stop.current?.abort()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2">
              <Square size={11} fill="currentColor" strokeWidth={0} />
            </button>
          ) : (
            <button type="button" title="Ask" aria-label="Ask" disabled={!q.trim()} onClick={() => void send()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-35">
              <ArrowUp size={15} />
            </button>
          )}
        </div>
        <p className="px-1 pt-1 text-[11px] text-fg-3">Answered by the helper model (Settings → Models), from this document only.</p>
      </div>
    </div>
  );
}

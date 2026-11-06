// Write with AI (Insert → Write with AI, "/" then AI, Ctrl+J, or Space on an empty line), as Google Docs' Help me
// write and Notion AI have it: a box at the caret to say what to write ("a paragraph about…") or pick Continue
// writing, Summarize the document above, Draft a conclusion, Make a list of…, Make a table of…; for words picked,
// Explain, Summarize and Make a table from these words. The helper model writes it with the document as context; what
// it writes goes in at once (after the caret's paragraph, tinted) to Keep, Try again or Discard (one step to undo; a
// suggestion while suggesting). An explanation shows in the box, to add as a comment.
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, BookOpenText, Check, Copy, ListPlus, MessageSquarePlus, PenLine, RotateCcw, Sigma, Sparkles, Square, Table2, X } from 'lucide-react';
import { newCommentId } from '@shared/comments';
import type { Block, Doc } from '@shared/docs';
import { toast, toastError } from '../../../../lib/store';
import { cx, Throbber } from '../../../../components/ui';
import type { DocEngine } from '../engine';
import * as ops from '../ops';
import { aiBlocks, compose, contextAt, costWords, type ComposeKind } from './ai';

/** Blocks put in after the caret's paragraph (in its place when it is empty), as the editor puts in what is pasted. */
export function putAfter(e: DocEngine, blocks: Block[], at?: ops.Pos) {
  const [s] = e.range();
  const p = at ?? s;
  const b = ops.blockOf(e.doc, p.b);
  if (!p.c && b && ops.isText(b) && b.runs.length) {
    const end = { b: b.id, o: ops.lenOf(b.runs) };
    e.place({ a: end, f: end }, false);
    e.enter();
  } else if (p.c && b) {
    // In a table: after it.
    e.setPicked(b.id);
  }
  e.insert(blocks);
}

interface Asked {
  kind: ComposeKind;
  ask: string;
}

type Phase = { k: 'ask' } | { k: 'busy'; asked: Asked } | { k: 'done'; asked: Asked; mark: Doc; after: Doc; ids: string[]; by: string } | { k: 'said'; asked: Asked; text: string; by: string };

const QUICK: { kind: ComposeKind; label: string; icon: React.ReactNode; also?: string }[] = [
  { kind: 'continue', label: 'Continue writing', icon: <PenLine size={14} /> },
  { kind: 'summary', label: 'Summarize the document above', icon: <BookOpenText size={14} /> },
  { kind: 'conclusion', label: 'Draft a conclusion', icon: <Sigma size={14} /> },
];

export function WriteBox({
  engine,
  at,
  width,
  title,
  words,
  onClose,
  onTint,
}: {
  engine: DocEngine;
  /** Where the caret is, in the host's coordinates. */
  at: { x: number; top: number; bottom: number };
  width: number;
  title: string;
  /** The words picked (Explain, Summarize, Make a table from these words), or none. */
  words: string;
  onClose: () => void;
  /** The blocks the AI just put in, tinted until kept (none: none). */
  onTint: (ids: string[]) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ k: 'ask' });
  const [ask, setAsk] = useState('');
  const [kind, setKind] = useState<'write' | 'list' | 'table'>('write');
  const input = useRef<HTMLTextAreaElement>(null);
  const stop = useRef<AbortController | null>(null);
  // Where the caret was when the box opened: what is written goes there.
  const place = useRef(engine.range());
  useEffect(() => () => stop.current?.abort(), []);
  useEffect(() => {
    if (phase.k === 'ask') input.current?.focus();
  }, [phase.k]);

  const run = async (asked: Asked) => {
    stop.current?.abort();
    const ac = new AbortController();
    stop.current = ac;
    setPhase({ k: 'busy', asked });
    try {
      const [s, z] = place.current;
      const ctx = contextAt(engine.doc, s, title);
      const r = await compose({ kind: asked.kind, ask: asked.ask || undefined, ...ctx, ...(words ? { words } : {}) }, ac.signal);
      if (ac.signal.aborted) return;
      const by = `${r.model ?? 'AI'}${costWords(r)}`;
      if (asked.kind === 'explain') return setPhase({ k: 'said', asked, text: r.markdown, by });
      const blocks = aiBlocks(engine.doc, r.markdown);
      if (!blocks.length) throw new Error('The helper model gave no words back: try again');
      const mark = engine.mark();
      const had = new Set(engine.doc.blocks.map((b) => b.id));
      // After the words picked (their last paragraph), or at the caret.
      putAfter(engine, blocks, words ? z : s);
      const ids = engine.doc.blocks.filter((b) => !had.has(b.id)).map((b) => b.id);
      onTint(ids);
      setPhase({ k: 'done', asked, mark, after: engine.mark(), ids, by });
    } catch (err) {
      if (ac.signal.aborted) return;
      toastError(err);
      setPhase({ k: 'ask' });
    }
  };

  /** What the AI put in, taken out again (undone while nothing else changed since; else its blocks taken out, the rest kept). */
  const takeBack = (p: Extract<Phase, { k: 'done' }>) => {
    onTint([]);
    if (engine.mark() === p.after && engine.undoTo(p.mark)) return;
    let d = engine.doc;
    for (const id of p.ids) d = ops.removeBlock(d, id).doc;
    engine.change(d);
  };
  const close = () => {
    stop.current?.abort();
    onTint([]);
    onClose();
    engine.refocusSoon();
  };
  const submit = () => {
    const t = ask.trim();
    if (!t) return;
    void run({ kind, ask: t });
  };

  const busy = phase.k === 'busy';
  const box = Math.min(520, width - 8);
  const left = Math.max(4, Math.min(at.x - 24, width - box - 4));
  return (
    <div
      data-keeps-editing
      className="absolute z-30 overflow-hidden rounded-2xl border border-line bg-elevated shadow-xl"
      style={{ left, top: at.bottom + 8, width: box }}
      onMouseDown={(ev) => ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLButtonElement || ev.preventDefault()}
      onKeyDown={(ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') {
          ev.preventDefault();
          if (phase.k === 'done') takeBack(phase);
          close();
        } else if (ev.key === 'Enter' && phase.k === 'done') {
          ev.preventDefault();
          close();
        }
      }}
    >
      {phase.k === 'said' ? (
        <div className="p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-fg-3">
            <Sparkles size={13} className="text-accent" />
            Explanation
          </div>
          <div translate="no" className="max-h-[40vh] overflow-y-auto text-[13.5px] leading-relaxed whitespace-pre-wrap text-fg">
            {phase.text}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <ActionButton
              icon={<MessageSquarePlus size={14} />}
              onClick={() => {
                const [s, z] = place.current;
                engine.place({ a: s, f: z }, false);
                if (!engine.addComment({ id: newCommentId(), by: 'agent', text: phase.text.slice(0, 4000), at: Date.now(), quote: words.slice(0, 500) })) toast('Pick the words to comment on first.');
                close();
              }}
            >
              Add as a comment
            </ActionButton>
            <ActionButton
              icon={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard?.writeText(phase.text).then(() => toast('Copied', 'ok'));
              }}
            >
              Copy
            </ActionButton>
            <span className="min-w-0 flex-1 truncate text-right text-[11.5px] text-fg-3">By {phase.by}</span>
            <ActionButton icon={<X size={14} />} onClick={close}>
              Close
            </ActionButton>
          </div>
        </div>
      ) : phase.k === 'done' ? (
        <div className="flex flex-wrap items-center gap-1.5 p-2">
          <Sparkles size={14} className="ml-1 shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-2">Written by {phase.by}</span>
          <ActionButton primary icon={<Check size={14} />} onClick={close}>
            Keep
          </ActionButton>
          <ActionButton
            icon={<RotateCcw size={14} />}
            onClick={() => {
              takeBack(phase);
              void run(phase.asked);
            }}
          >
            Try again
          </ActionButton>
          <ActionButton
            icon={<X size={14} />}
            onClick={() => {
              takeBack(phase);
              close();
            }}
          >
            Discard
          </ActionButton>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
            {busy ? <Throbber size={15} className="mt-1 shrink-0" /> : <Sparkles size={15} className="mt-1 shrink-0 text-accent" />}
            <textarea
              ref={input}
              rows={1}
              value={busy ? '' : ask}
              disabled={busy}
              onChange={(ev) => setAsk(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  submit();
                }
              }}
              placeholder={busy ? 'Writing…' : kind === 'list' ? 'Make a list of…' : kind === 'table' ? 'Make a table of…' : words ? 'Say what to write about the words picked…' : 'Write a paragraph about…'}
              aria-label="What to write"
              className="min-h-[26px] min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[14px] leading-snug text-fg outline-none placeholder:text-fg-3 disabled:opacity-100"
            />
            {busy ? (
              <button type="button" title="Stop" aria-label="Stop" onClick={() => (stop.current?.abort(), setPhase({ k: 'ask' }))} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-2 hover:bg-bg-2 hover:text-fg">
                <Square size={11} fill="currentColor" strokeWidth={0} />
              </button>
            ) : (
              <button
                type="button"
                title="Write"
                aria-label="Write"
                disabled={!ask.trim()}
                onClick={submit}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-35"
              >
                <ArrowUp size={15} />
              </button>
            )}
          </div>
          {!busy && (
            <div className="border-t border-line p-1">
              {(words
                ? ([
                    { kind: 'explain', label: 'Explain', icon: <BookOpenText size={14} /> },
                    { kind: 'summarize', label: 'Summarize', icon: <Sigma size={14} /> },
                    { kind: 'tablify', label: 'Make a table from these words', icon: <Table2 size={14} /> },
                  ] as typeof QUICK)
                : QUICK
              ).map((q) => (
                <button key={q.kind} type="button" onClick={() => void run({ kind: q.kind, ask: ask.trim() })} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-fg hover:bg-bg-2">
                  <span className="text-fg-3">{q.icon}</span>
                  {q.label}
                </button>
              ))}
              {!words && (
                <>
                  <button type="button" onClick={() => (setKind('list'), input.current?.focus())} className={cx('flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-fg hover:bg-bg-2', kind === 'list' && 'bg-bg-2')}>
                    <span className="text-fg-3">
                      <ListPlus size={14} />
                    </span>
                    Make a list of…
                  </button>
                  <button type="button" onClick={() => (setKind('table'), input.current?.focus())} className={cx('flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-fg hover:bg-bg-2', kind === 'table' && 'bg-bg-2')}>
                    <span className="text-fg-3">
                      <Table2 size={14} />
                    </span>
                    Make a table of…
                  </button>
                </>
              )}
              <p className="px-2.5 pt-1 pb-1.5 text-[11.5px] leading-snug text-fg-3">The helper model writes it from the document (Settings → Models). Esc closes.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActionButton({ icon, children, onClick, primary }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-medium', primary ? 'bg-accent text-white hover:opacity-90' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
    >
      {icon}
      {children}
    </button>
  );
}

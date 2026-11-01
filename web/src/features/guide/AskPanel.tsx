// The panel beside the guide where an agent answers a question: a box to ask with who answers under it, then
// the conversation as a session shows it (steps, the answer, cards for changes), with its message box for more.
// The session is an ordinary one: the header opens it on its own page, or starts a new question.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, SquarePen, Sparkles, X } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { api, enc } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { toastError, useLive, useSessions, useTimeline } from '../../lib/store';
import { live as socket } from '../../lib/ws';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, IconButton, Throbber, useIsMobile } from '../../components/ui';
import { Composer } from '../session/Composer';
import { SessionCtx } from '../session/items';
import { Timeline } from '../session/Timeline';
import { FeatureDock } from '../registry';
import { askAgent, closeAsk, openAsk, useAsk, useAskRun } from './ask';
import { POPULAR } from './topics';

/** A question to start with: the box, who answers, and questions to pick from. */
function AskStart({ draft, topic, suggestions }: { draft: string; topic?: string; suggestions: string[] }) {
  const mobile = useIsMobile();
  const run = useAskRun();
  const [text, setText] = useState(draft);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText(draft);
    // On a phone the keyboard waits for a tap, unless a question was picked to change.
    if (!mobile || draft) requestAnimationFrame(() => ta.current?.focus());
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = (q = text) => {
    if (!q.trim()) return;
    askAgent(q, run, topic).catch(toastError);
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-5 pb-6">
      <h3 className="text-[17px] font-semibold tracking-tight">Ask anything about the app</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
        An agent answers from the guide, with links to the right place. It can also change a setting or set something up for you; you confirm each change on a card first.
      </p>
      <div className="mt-4 rounded-[18px] border border-line-2 bg-panel transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !mobile) {
              e.preventDefault();
              ask();
            }
          }}
          rows={3}
          placeholder="How do I…"
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14.5px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-fg-3" title="The agent and model picked last on the start page">
            <AgentIcon agent={run.agent} size={13} className="shrink-0" />
            <span className="truncate">{run.label}</span>
          </span>
          <button
            onClick={() => ask()}
            disabled={!text.trim()}
            aria-label="Ask"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-35"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
      {suggestions.length > 0 && (
        <>
          <div className="mt-6 mb-2 text-[12px] font-medium text-fg-3">{suggestions === POPULAR ? 'People often ask' : 'Try asking'}</div>
          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => (setText(s), ta.current?.focus())}
                className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-1 hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** The question asked, while its session starts. */
function Starting({ question }: { question: string }) {
  return (
    <div className="min-h-0 flex-1 px-4 pt-5">
      <div translate="no" className="ml-auto w-fit max-w-[85%] rounded-[18px] bg-bg-2 px-3.5 py-2 text-[14px] leading-relaxed">
        {question}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber size={16} /> Starting the agent
      </div>
    </div>
  );
}

/** The session's conversation, live, as its own page shows it. */
function Conversation({ sessionKey }: { sessionKey: string }) {
  const s = useSessions((x) => x.byKey[sessionKey]);
  const lv = useLive((x) => x.byKey[sessionKey]);
  useEffect(() => {
    api<{ summary: SessionSummary | null; live: any; overlay: any }>(`/api/sessions/${enc(sessionKey)}`)
      .then((r) => {
        if (r.summary) useSessions.getState().upsert([r.summary]);
        useLive.getState().set(sessionKey, r.live, r.overlay);
      })
      .catch(toastError);
    useTimeline.getState().load(sessionKey);
    const unsub = socket.sub(sessionKey);
    const off = socket.onStatus((up) => up && useTimeline.getState().load(sessionKey));
    return () => {
      unsub();
      off();
    };
  }, [sessionKey]);
  const summary = useMemo(() => {
    if (!s) return null;
    const liveState = lv?.live ?? s.live ?? null;
    return liveState !== s.live ? { ...s, live: liveState } : s;
  }, [s, lv?.live]);
  if (!summary)
    return (
      <div className="flex flex-1 items-center justify-center text-fg-3">
        <Throbber size={26} />
      </div>
    );
  return (
    <SessionCtx.Provider value={{ sessionKey, cwd: summary.cwd }}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Timeline sessionKey={sessionKey} agent={summary.agent} live={summary.live ?? null} overlay={lv?.overlay} external={summary.external} />
      </div>
      <FeatureDock s={summary} />
      <Composer s={summary} />
    </SessionCtx.Provider>
  );
}

export function AskPanel({ examples, className }: { examples: string[]; className?: string }) {
  const { key, pending, draft, topic } = useAsk();
  return (
    <div className={cx('flex h-full min-h-0 flex-col bg-bg', className)}>
      <div className="flex h-14 shrink-0 items-center gap-1.5 border-b border-line pr-2 pl-4">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">Ask an agent</h2>
        {key && (
          <>
            <IconButton label="New question" onClick={() => openAsk({ topic })}>
              <SquarePen size={16} />
            </IconButton>
            <IconButton label="Open as a session" onClick={() => openSession(key)}>
              <ArrowUpRight size={17} />
            </IconButton>
          </>
        )}
        <IconButton label="Close" onClick={closeAsk}>
          <X size={17} />
        </IconButton>
      </div>
      {key ? (
        <Conversation key={key} sessionKey={key} />
      ) : pending ? (
        <Starting question={pending} />
      ) : (
        <AskStart draft={draft} topic={topic} suggestions={examples.length ? examples : POPULAR} />
      )}
    </div>
  );
}

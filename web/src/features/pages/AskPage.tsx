// Asking an agent to change the page or deck open in Pages: say what should change, and where (this slide, every
// slide, the part picked, the whole page). Unsaved changes are saved first so the agent works on them. It starts a
// session with the agent picked last on the start page (`extra.page`: the agent is told which page it is and how to
// change it), its conversation beside the page (over it on a phone, folding away to watch the page change), and
// the page shows the agent's new version as soon as it is saved. Its conversation goes on there, or in Sessions.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ArrowUp, ArrowUpRight, Eye, SquarePen, Sparkles, X } from 'lucide-react';
import type { PageInfo } from '@shared/pages';
import { post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { cx, IconButton, Throbber, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Conversation } from '../guide/AskPanel';
import { useAskRun } from '../guide/ask';

/** Where a request is for: its words start the message ("On slide 3 (“Pricing”): "). */
export interface AskScope {
  id: string;
  label: string;
  lead: string;
}

interface AskState {
  /** The panel shows (for the page open). */
  open: boolean;
  /** Folded away on a phone, to watch the page. */
  folded: boolean;
  /** By page: the session asked, and the request while it starts. */
  byPage: Record<string, { key: string | null; pending?: string }>;
  draft: string;
  /** The scope picked, by its id. */
  scope: string;
}

export const usePageAsk = create<AskState>(() => ({ open: false, folded: false, byPage: {}, draft: '', scope: '' }));

/** Opens the panel: empty, or with words to send or change first (an "Ask the agent about it"). */
export function openPageAsk(o: { draft?: string; scope?: string } = {}) {
  usePageAsk.setState((s) => ({ open: true, folded: false, draft: o.draft ?? s.draft, scope: o.scope ?? s.scope }));
}
export const closePageAsk = () => usePageAsk.setState({ open: false });

type AskKind = 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook';
const EXAMPLES: Record<AskKind, string[]> = {
  slides: ['Make the titles shorter and clearer', 'Add a slide with a chart of these numbers', 'Use a darker theme', 'Write speaker notes for every slide', 'Add simple animations to the bullets'],
  page: ['Make it more colourful', 'Add a chart of the numbers', 'Make it easier to use on a phone', 'Fix any mistakes in the words'],
  doc: ['Fix the spelling and grammar', 'Make this section shorter and clearer', 'Add a summary at the top', 'Turn the list into a table', 'Write it in a friendlier tone'],
  sheet: ['Add a total row under the numbers', 'Add a column with each row’s share of the total', 'Sort by the date, newest first', 'Format the money columns as currency', 'Find any mistakes in the formulas'],
  tex: ['Fix the errors so it compiles', 'Add a table of the results', 'Make the abstract shorter', 'Number the equations and refer to them in the text', 'Add a bibliography with these sources'],
  notebook: ['Explain what this cell does', 'Fix the error in this cell', 'Add a chart of the results', 'Add a text cell before each section saying what it does', 'Make it run faster'],
};
const WHAT_CHANGES: Record<AskKind, string> = {
  slides: 'Say what to change, and an agent changes the slides. You see each change here as soon as it is saved.',
  page: 'Say what to change, and an agent changes the page. You see each change here as soon as it is saved.',
  doc: 'Say what to change, and an agent changes the document. You see each change here as soon as it is saved.',
  sheet: 'Say what to change, and an agent changes the spreadsheet. You see each change here as soon as it is saved.',
  tex: 'Say what to change, and an agent changes the LaTeX. You see each change here as soon as it is saved.',
  notebook: 'Ask about the notebook, or say what to change, and an agent answers or changes it. You see each change here as soon as it is saved.',
};
const PLACEHOLDER: Record<AskKind, string> = {
  slides: 'What should change on the slides?',
  page: 'What should change on the page?',
  doc: 'What should change in the document?',
  sheet: 'What should change in the spreadsheet?',
  tex: 'What should change in the document?',
  notebook: 'What should change, or what do you want to know?',
};

function Start({ page, scopes, beforeSend }: { page: PageInfo; scopes: AskScope[]; beforeSend: () => Promise<boolean> }) {
  const mobile = useIsMobile();
  const run = useAskRun();
  const { draft, scope } = usePageAsk();
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const cwd = useSessions((x) => (page.sessionKey ? x.byKey[page.sessionKey]?.cwd : undefined));
  const picked = scopes.find((s) => s.id === scope) ?? scopes[0];
  useEffect(() => {
    setText(draft);
    if (!mobile || draft) requestAnimationFrame(() => ta.current?.focus());
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      if (!(await beforeSend())) return;
      const prompt = `${picked?.lead ?? ''}${q}`;
      usePageAsk.setState((s) => ({ byPage: { ...s.byPage, [page.id]: { key: null, pending: prompt } }, draft: '' }));
      const r = await post<{ key: string }>('/api/sessions', {
        agent: run.agent,
        acpAgent: run.agent === 'acp' ? run.acp : undefined,
        prompt,
        model: run.model ?? undefined,
        account: run.account,
        cwd,
        extra: { page: page.id },
      });
      usePageAsk.setState((s) => ({ byPage: { ...s.byPage, [page.id]: { key: r.key } }, folded: mobile }));
    } catch (e) {
      usePageAsk.setState((s) => ({ byPage: { ...s.byPage, [page.id]: { key: null } }, draft: q }));
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const kind: AskKind = page.kind ?? 'page';
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        {WHAT_CHANGES[kind]}
      </p>
      {scopes.length > 1 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="What it is about">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={picked?.id === s.id}
              onClick={() => usePageAsk.setState({ scope: s.id })}
              className={cx(
                'max-w-full truncate rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                picked?.id === s.id ? 'border-accent/60 bg-accent-soft font-medium text-fg' : 'border-line text-fg-2 hover:border-line-2 hover:bg-bg-1',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-[18px] border border-line-2 bg-panel transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !mobile) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={PLACEHOLDER[kind]}
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14.5px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-fg-3" title="The agent and model picked last on the start page">
            <AgentIcon agent={run.agent} size={13} className="shrink-0" />
            <span className="truncate">{run.label}</span>
          </span>
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            aria-label="Ask"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-35"
          >
            {busy ? <Throbber size={15} /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
      <div className="mt-5 mb-2 text-[12px] font-medium text-fg-3">For example</div>
      <div className="space-y-1.5">
        {EXAMPLES[kind].map((s) => (
          <button
            key={s}
            onClick={() => (setText(tr(s)), ta.current?.focus())}
            className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-1 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Starting({ text }: { text: string }) {
  return (
    <div className="min-h-0 flex-1 px-4 pt-5">
      <div translate="no" className="ml-auto w-fit max-w-[85%] rounded-[18px] bg-bg-2 px-3.5 py-2 text-[14px] leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber size={16} /> Starting the agent
      </div>
    </div>
  );
}

/** The panel: the request box, then the conversation (with the scopes a click puts in the message box). */
export function PageAskPanel({ page, scopes, beforeSend, className }: { page: PageInfo; scopes: AskScope[]; beforeSend: () => Promise<boolean>; className?: string }) {
  const mobile = useIsMobile();
  const at = usePageAsk((s) => s.byPage[page.id]);
  const key = at?.key ?? null;
  return (
    <div className={cx('flex h-full min-h-0 flex-col bg-bg', className)}>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line pr-2 pl-4">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">Ask an agent</h2>
        {key && (
          <>
            <IconButton label="A new request" onClick={() => usePageAsk.setState((s) => ({ byPage: { ...s.byPage, [page.id]: { key: null } } }))}>
              <SquarePen size={16} />
            </IconButton>
            <IconButton label="Open as a session" onClick={() => openSession(key)}>
              <ArrowUpRight size={17} />
            </IconButton>
          </>
        )}
        {mobile && key && (
          <IconButton label="See the page" onClick={() => usePageAsk.setState({ folded: true })}>
            <Eye size={17} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={closePageAsk}>
          <X size={17} />
        </IconButton>
      </div>
      {key ? (
        <>
          {scopes.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-line px-3 py-2 [&::-webkit-scrollbar]:hidden">
              <span className="shrink-0 text-[12px] text-fg-3">About</span>
              {scopes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title="Put it in the message box"
                  onClick={() => composeInsert(s.lead, key)}
                  className="max-w-[220px] shrink-0 truncate rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-1"
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <Conversation key={key} sessionKey={key} />
        </>
      ) : at?.pending ? (
        <Starting text={at.pending} />
      ) : (
        <Start page={page} scopes={scopes} beforeSend={beforeSend} />
      )}
    </div>
  );
}

/** On a phone, while the panel is folded away: how the agent is doing, and a way back to it. */
export function PageAskPill({ page }: { page: PageInfo }) {
  const key = usePageAsk((s) => s.byPage[page.id]?.key ?? null);
  const live = useSessions((x) => (key ? x.byKey[key]?.live?.status : undefined));
  if (!key) return null;
  const working = live === 'working' || live === 'starting';
  return (
    <button
      type="button"
      onClick={() => usePageAsk.setState({ open: true, folded: false })}
      className="fixed bottom-[calc(16px+var(--safe-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-2 bg-elevated px-4 py-2 text-[13px] font-medium shadow-lg"
    >
      {working ? <span className="breathe h-2 w-2 rounded-full bg-busy" /> : <Sparkles size={14} className="text-accent" />}
      {working ? tr('The agent is working on it') : tr('The agent answered')}
    </button>
  );
}

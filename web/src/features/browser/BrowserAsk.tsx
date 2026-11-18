// Ask about the page you are on, in the right column beside it: say what you want to know and an agent answers from a
// copy of the page (a snapshot of what is on it: it cannot use the page itself), the conversation going on right there.
// It is a session like any other (Open as a session), one for each of your tabs; New question forgets this tab's.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ArrowUp, ExternalLink, Image as ImageIcon, Quote, RotateCcw, Sparkles, X } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import { enc, post } from '../../lib/api';
import { attachmentPayload, hostAttachment } from '../../lib/attachments';
import { MOD } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, IconButton, Throbber, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Conversation } from '../guide/AskPanel';
import { useAskRun, type AskRun } from '../guide/ask';
import { Starting } from '../pages/AskPage';
import { isWebPage } from './browsing';

/** What the question quotes at most, of words picked in a page. */
const QUOTE_MAX = 4000;

/** Words picked in a page (the right-click menu's Ask an agent), or a picture of it (a file of this computer), and the address they are on. */
interface Picked {
  text: string;
  url: string;
  /** A picture the page has (Ask about this image): the file the app read it into, and its name. */
  image?: { path: string; name: string };
}

interface BrowserAskState {
  /** By tab: the session asked (null while it starts), the question while it does, and the page's title at the time. */
  byTab: Record<string, { key: string | null; pending?: string; title?: string }>;
  /** By tab: the words picked in the page, until the question goes. */
  picked: Record<string, Picked | undefined>;
}

export const useBrowserAsk = create<BrowserAskState>(() => ({ byTab: {}, picked: {} }));

/** Remembers words picked in a tab for its next question. */
export const pickForAsk = (tab: string, p: Picked) => useBrowserAsk.setState((s) => ({ picked: { ...s.picked, [tab]: p } }));

const forget = (tab: string) => useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab]: { key: null } } }));

/** Asks the question about this tab's page: a snapshot of it goes to a new session with the agent the start page last had. */
export async function askAboutTab(tab: Pick<BrowserTab, 'id' | 'title' | 'url'>, question: string, run: AskRun): Promise<boolean> {
  const q = question.trim();
  if (!q) return false;
  const title = tab.title || tab.url;
  useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { key: null, pending: q, title } } }));
  try {
    const picked = useBrowserAsk.getState().picked[tab.id];
    const snap = await post<{ path: string; name: string }>(`/api/browser/browsing/tabs/${enc(tab.id)}/snapshot`);
    const about = [
      picked?.image ? `About the picture ${picked.image.name} (attached) on ${picked.url}.` : '',
      picked?.text ? `About this on ${picked.url}:\n“${picked.text.slice(0, QUOTE_MAX)}”` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const r = await post<{ key: string }>('/api/sessions', {
      agent: run.agent,
      acpAgent: run.agent === 'acp' ? run.acp : undefined,
      prompt: about ? `${q}\n\n${about}` : q,
      model: run.model ?? undefined,
      account: run.account,
      ...attachmentPayload([hostAttachment(snap.path, { name: snap.name }), ...(picked?.image ? [hostAttachment(picked.image.path, { name: picked.image.name })] : [])]),
    });
    useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { key: r.key, title } }, picked: { ...s.picked, [tab.id]: undefined } }));
    return true;
  } catch (e) {
    forget(tab.id);
    toastError(e);
    return false;
  }
}

const QUICK = ['Summarise', 'Key points', 'Explain it simply'];
const QUICK_IMAGE = ['Describe this picture', 'Read the text in it', 'Where is this from?'];
const QUICK_WORDS: Record<string, string> = {
  Summarise: 'Summarise this page in a few lines',
  'Key points': 'What are the key points of this page?',
  'Explain it simply': 'Explain what this page says in simple words',
  'Describe this picture': 'Describe this picture',
  'Read the text in it': 'Read out the text in this picture',
  'Where is this from?': 'Where might this picture be from, and what does it show?',
};

function Start({ tab }: { tab: BrowserTab }) {
  const mobile = useIsMobile();
  const run = useAskRun();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const picked = useBrowserAsk((s) => s.picked[tab.id]);
  const can = isWebPage(tab.url);
  useEffect(() => {
    if (!mobile) requestAnimationFrame(() => ta.current?.focus());
  }, [tab.id, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (q: string) => {
    if (!q.trim() || busy || !can) return;
    setBusy(true);
    const ok = await askAboutTab(tab, q, run);
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <div className="text-[13.5px] font-medium">{picked?.image ? 'What do you want to know about this picture?' : 'What do you want to know about this page?'}</div>
      <div translate="no" className="mt-0.5 truncate text-[12px] text-fg-3">
        {tab.title || tab.url}
      </div>
      {picked && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-bg-2 py-2 pr-1.5 pl-3">
          {picked.image ? <ImageIcon size={14} className="mt-1 shrink-0 text-fg-3" /> : <Quote size={14} className="mt-1 shrink-0 text-fg-3" />}
          <div translate="no" className="min-w-0 flex-1 py-0.5 text-[13px] leading-snug text-fg-2">
            {picked.image && <img src={hostAttachment(picked.image.path).url} alt={picked.image.name} className="mb-1 max-h-40 max-w-full rounded-lg border border-line object-contain" />}
            {picked.text && <div className="line-clamp-4">{picked.text}</div>}
            {picked.image && !picked.text && <div className="truncate text-[12px] text-fg-3">{picked.image.name}</div>}
          </div>
          <IconButton label="Leave it out" size="sm" onClick={() => useBrowserAsk.setState((s) => ({ picked: { ...s.picked, [tab.id]: undefined } }))}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <div className="mt-3 rounded-[14px] border border-line-2 bg-bg-2 transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={4}
          placeholder={can ? 'For example: what is this page about?' : 'Open a web page to ask about it'}
          aria-label="Your question about this page"
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-fg-3" title="The agent and model picked last on the start page">
            <AgentIcon agent={run.agent} size={13} className="shrink-0" />
            <span translate="no" className="truncate">
              {run.label}
            </span>
          </span>
          <Button size="sm" variant="primary" disabled={!text.trim() || busy || !can} onClick={() => void send(text)} title={`${MOD}Enter`} icon={busy ? <Throbber size={14} /> : <ArrowUp size={14} />}>
            Ask
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {(picked?.image ? QUICK_IMAGE : QUICK).map((w) => (
          <button
            key={w}
            disabled={!can || busy}
            onClick={() => void send(tr(QUICK_WORDS[w]))}
            className="rounded-full border border-line px-3 py-1 text-[12.5px] text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-2 hover:text-fg disabled:pointer-events-none disabled:opacity-45"
          >
            {w}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">The agent gets a copy of what is on the page. It cannot use the page itself.</p>
    </div>
  );
}

/** The right column's Ask: for the tab shown, its question box, then its conversation. */
export function BrowserAskPanel({ tab, onClose }: { tab: BrowserTab; onClose: () => void }) {
  const at = useBrowserAsk((s) => s.byTab[tab.id]);
  const key = at?.key ?? null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-1">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <Sparkles size={15} className="mr-1 shrink-0 text-accent" />
        <div className="shrink-0 text-[14px] font-semibold">Ask</div>
        <div translate="no" className="ml-1.5 min-w-0 flex-1 truncate text-[12.5px] text-fg-3">
          {at?.title || tab.title || tab.url}
        </div>
        {key && (
          <IconButton label="Open as a session" size="sm" onClick={() => openSession(key)}>
            <ExternalLink size={15} />
          </IconButton>
        )}
        {(key || at?.pending) && (
          <IconButton label="New question" size="sm" onClick={() => forget(tab.id)}>
            <RotateCcw size={15} />
          </IconButton>
        )}
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {key ? <Conversation key={key} sessionKey={key} /> : at?.pending ? <Starting text={at.pending} /> : <Start key={tab.id} tab={tab} />}
    </div>
  );
}

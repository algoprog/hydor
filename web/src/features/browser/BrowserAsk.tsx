// Ask, in the right column beside the page you are on, in two ways you pick at its top. Ask: say what you want to know,
// and an agent answers from a copy of the page (a snapshot of what is on it: it cannot use the page itself). Do: say what
// to do there, and an agent does it in a tab of its own at this page, with your sign-ins on the site and only the browser
// (HandOff.tsx), while you watch it in the page's place. Either way the conversation goes on right there; it is a session
// like any other (Open as a session), one for each of your tabs, and New question forgets this tab's. The way you picked
// is kept on this device, and the address bar's row for the page follows it.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ArrowUp, ChevronDown, ExternalLink, Image as ImageIcon, MonitorPlay, Quote, RotateCcw, ShieldCheck, Sparkles, WandSparkles, X } from 'lucide-react';
import type { BrowserTab } from '@shared/browser';
import { enc, post } from '../../lib/api';
import { attachmentPayload, hostAttachment } from '../../lib/attachments';
import { MOD } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, IconButton, MenuItem, Popover, Segmented, Throbber, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Conversation } from '../guide/AskPanel';
import { useAskRun, type AskRun } from '../guide/ask';
import { Starting } from '../pages/AskPage';
import { isWebPage } from './browsing';
import { lastWho, startDo, useRunFor, whoOf, type Who } from './HandOff';
import { useTextareaSuggest } from '../suggest/useTextareaSuggest';

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
  /** By tab: the session asked (null while it starts), the question while it does, the page's title at the time, and whether it was Do. */
  byTab: Record<string, { key: string | null; pending?: string; title?: string; do?: boolean }>;
  /** By tab: the words picked in the page, until the question goes. */
  picked: Record<string, Picked | undefined>;
}

export const useBrowserAsk = create<BrowserAskState>(() => ({ byTab: {}, picked: {} }));

/** Remembers words picked in a tab for its next question. */
export const pickForAsk = (tab: string, p: Picked) => useBrowserAsk.setState((s) => ({ picked: { ...s.picked, [tab]: p } }));

const forget = (tab: string) => useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab]: { key: null } } }));

/** Ask answers from a copy of the page; Do has an agent work in the page. */
export type AskMode = 'ask' | 'do';
const MODE_KEY = 'wa.browser.askMode';
const keptMode = (): AskMode => {
  try {
    return localStorage.getItem(MODE_KEY) === 'do' ? 'do' : 'ask';
  } catch {
    return 'ask';
  }
};
export const useAskMode = create<{ mode: AskMode }>(() => ({ mode: keptMode() }));
export function setAskMode(mode: AskMode) {
  useAskMode.setState({ mode });
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
}

/** A page an agent can be given to work in (Do): one of a website. */
export const canDoOn = (url: string | undefined) => !!url && /^https?:/i.test(url);

/** What the request says of the words or the picture picked in the page. */
function aboutPicked(p: Picked | undefined): string {
  return [p?.image ? `About the picture ${p.image.name} (attached) on ${p.url}.` : '', p?.text ? `About this on ${p.url}:\n“${p.text.slice(0, QUOTE_MAX)}”` : ''].filter(Boolean).join('\n\n');
}

/** Asks the question about this tab's page: a snapshot of it goes to a new session with the agent the start page last had. */
export async function askAboutTab(tab: Pick<BrowserTab, 'id' | 'title' | 'url'>, question: string, run: AskRun): Promise<boolean> {
  const q = question.trim();
  if (!q) return false;
  const title = tab.title || tab.url;
  useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { key: null, pending: q, title } } }));
  try {
    const picked = useBrowserAsk.getState().picked[tab.id];
    const snap = await post<{ path: string; name: string }>(`/api/browser/browsing/tabs/${enc(tab.id)}/snapshot`);
    const about = aboutPicked(picked);
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

/**
 * Has an agent do what was asked on this tab's page (Do): it gets a tab of its own there, with your sign-ins on the site
 * and only the browser, on Claude Code or Custom (`who`, else the one the start page last had). Words or a picture picked
 * in the page go with the request. The session's key, or null when it did not start (the reason is shown).
 */
export async function doOnTab(tab: Pick<BrowserTab, 'id' | 'title' | 'url'>, what: string, who: Who = lastWho(), run?: { model: string | null; account?: string }): Promise<string | null> {
  const q = what.trim();
  if (!q) return null;
  const title = tab.title || tab.url;
  useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { key: null, pending: q, title, do: true } } }));
  const picked = useBrowserAsk.getState().picked[tab.id];
  const about = aboutPicked(picked);
  const key = await startDo(tab.id, about ? `${q}\n\n${about}` : q, who, run, picked?.image ? attachmentPayload([hostAttachment(picked.image.path, { name: picked.image.name })]) : undefined);
  if (!key) {
    forget(tab.id);
    return null;
  }
  useBrowserAsk.setState((s) => ({ byTab: { ...s.byTab, [tab.id]: { key, title, do: true } }, picked: { ...s.picked, [tab.id]: undefined } }));
  return key;
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

/** In Do, the agent that does it: Claude Code or Custom (only these can be kept to one tab), on the model the start page last had for it. */
function DoAgent({ who, label, onPick }: { who: Who; label: string; onPick: (w: Who) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const pick = whoOf(who);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Only Claude Code and Custom can be kept to one tab"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-0.5 text-left text-[12px] text-fg-3 hover:text-fg-2"
      >
        <AgentIcon agent={pick.agent} name={pick.agent === 'acp' ? 'Custom' : undefined} size={13} className="shrink-0" />
        <span translate="no" className="truncate">
          {label}
        </span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={220} title="Agent">
        <MenuItem icon={<AgentIcon agent="claude" size={14} />} checked={who === 'claude'} onClick={() => (setOpen(false), onPick('claude'))}>
          Claude Code
        </MenuItem>
        <MenuItem icon={<AgentIcon agent="acp" name="Custom" size={14} />} checked={who === 'custom'} onClick={() => (setOpen(false), onPick('custom'))}>
          Custom
        </MenuItem>
      </Popover>
    </>
  );
}

function Start({ tab, onStarted }: { tab: BrowserTab; onStarted: (key: string) => void }) {
  const mobile = useIsMobile();
  const mode = useAskMode((s) => s.mode);
  const doing = mode === 'do';
  const run = useAskRun();
  const [who, setWho] = useState<Who>(lastWho);
  const pick = whoOf(who);
  const doRun = useRunFor(pick.agent, pick.acp);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const words = useTextareaSuggest(ta, { place: 'other', value: text });
  const picked = useBrowserAsk((s) => s.picked[tab.id]);
  const can = doing ? canDoOn(tab.url) : isWebPage(tab.url);
  useEffect(() => {
    if (!mobile) requestAnimationFrame(() => ta.current?.focus());
  }, [tab.id, picked, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (q: string) => {
    if (!q.trim() || busy || !can) return;
    setBusy(true);
    if (doing) {
      const key = await doOnTab(tab, q, who, doRun);
      setBusy(false);
      if (!key) return;
      setText('');
      onStarted(key);
      return;
    }
    const ok = await askAboutTab(tab, q, run);
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <Segmented<AskMode>
        size="sm"
        value={mode}
        onChange={setAskMode}
        options={[
          { value: 'ask', label: 'Ask', icon: <Sparkles size={13} /> },
          { value: 'do', label: 'Do', icon: <WandSparkles size={13} /> },
        ]}
      />
      <div className="mt-3 text-[13.5px] font-medium">{doing ? 'What should an agent do on this page?' : picked?.image ? 'What do you want to know about this picture?' : 'What do you want to know about this page?'}</div>
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
      <div className="relative mt-3 rounded-[14px] border border-line-2 bg-bg-2 transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (words.onKeyDown(e)) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={4}
          placeholder={doing ? (can ? 'For example: fill in the form with my details' : 'Open a page on a website to have it done there') : can ? 'For example: what is this page about?' : 'Open a web page to ask about it'}
          aria-label={doing ? 'What the agent should do on this page' : 'Your question about this page'}
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        {words.overlay}
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          {doing ? (
            <DoAgent who={who} label={doRun.label} onPick={setWho} />
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-fg-3" title="The agent and model picked last on the start page">
              <AgentIcon agent={run.agent} size={13} className="shrink-0" />
              <span translate="no" className="truncate">
                {run.label}
              </span>
            </span>
          )}
          <Button size="sm" variant="primary" disabled={!text.trim() || busy || !can} onClick={() => void send(text)} title={`${MOD}Enter`} icon={busy ? <Throbber size={14} /> : doing ? <WandSparkles size={14} /> : <ArrowUp size={14} />}>
            {doing ? 'Do it' : 'Ask'}
          </Button>
        </div>
      </div>
      {!doing && (
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
      )}
      {doing ? (
        <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-fg-3">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          <span>The agent gets this page in a tab of its own, with your sign-ins on this site and only the browser, and asks before it sends, posts, deletes or pays. You watch it work in the page’s place.</span>
        </p>
      ) : (
        <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">The agent gets a copy of what is on the page. It cannot use the page itself. Pick Do to have an agent work in the page.</p>
      )}
    </div>
  );
}

/**
 * The right column's Ask: for the tab shown, Ask or Do with its box, then its conversation. `onStarted`: Do started a
 * session in its own tab (the page shows it at work); `onWatch`: Watch it work, for a Do whose conversation shows here.
 */
export function BrowserAskPanel({ tab, onClose, onStarted, onWatch }: { tab: BrowserTab; onClose: () => void; onStarted: (key: string) => void; onWatch: (key: string) => void }) {
  const at = useBrowserAsk((s) => s.byTab[tab.id]);
  const key = at?.key ?? null;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-1">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        {at?.do ? <WandSparkles size={15} className="mr-1 shrink-0 text-accent" /> : <Sparkles size={15} className="mr-1 shrink-0 text-accent" />}
        <div className="shrink-0 text-[14px] font-semibold">Ask</div>
        <div translate="no" className="ml-1.5 min-w-0 flex-1 truncate text-[12.5px] text-fg-3">
          {at?.title || tab.title || tab.url}
        </div>
        {key && at?.do && (
          <IconButton label="Watch it work" size="sm" onClick={() => onWatch(key)}>
            <MonitorPlay size={15} />
          </IconButton>
        )}
        {key && (
          <IconButton label="Open as a session" size="sm" onClick={() => openSession(key)}>
            <ExternalLink size={15} />
          </IconButton>
        )}
        {(key || at?.pending) && (
          <IconButton label={at?.do ? 'New request' : 'New question'} size="sm" onClick={() => forget(tab.id)}>
            <RotateCcw size={15} />
          </IconButton>
        )}
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      {key ? <Conversation key={key} sessionKey={key} /> : at?.pending ? <Starting text={at.pending} /> : <Start key={tab.id} tab={tab} onStarted={onStarted} />}
    </div>
  );
}

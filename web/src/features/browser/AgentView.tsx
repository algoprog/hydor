// An agent's browser shown in your Browser page: the page column holds its tab (AgentBody), the box its address behind a
// chip that says whose it is (× goes back to your tabs), the bar's right part Stop, Take over or Hand back and Take back,
// and the right column its conversation, live, so you watch it work and can answer it without leaving.
import { useRef } from 'react';
import { ExternalLink, Hand, Square, Undo2, X } from 'lucide-react';
import { enc, post } from '../../lib/api';
import { activityOf, isBusy } from '../../lib/activity';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { Button, IconButton, useIsMobile } from '../../components/ui';
import { Conversation } from '../guide/AskPanel';
import { handBack, takeOver } from './Dock';
import { useBrowser } from './store';
import { activeTab, shownAddress, takeBack, useAgentBrowsers } from './browsing';
import { titleOf } from './AgentTabs';

/** The agent, and the words that say whose browser it is: its title. */
function useAgent(k: string) {
  const s = useSessions((x) => x.byKey[k]);
  const b = useAgentBrowsers((x) => x.browsers.find((y) => y.key === k));
  return { session: s, title: titleOf(b ?? { key: k, driver: 'agent', asks: 0, tabs: [] }, s?.title) };
}

/** The box while an agent's tab is shown: the chip (agent and its session's title, × to go back) and the tab's address. */
export function AgentBox({ k, onBack }: { k: string; onBack: () => void }) {
  const { session, title } = useAgent(k);
  const view = useBrowser((s) => s.views[k]);
  const url = shownAddress(activeTab(view)?.url);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-bg-2 pr-3 pl-1.5 ring-1 ring-line-2 focus-within:ring-accent/60">
      <span className="flex h-6 max-w-[55%] shrink-0 items-center gap-1.5 rounded-full bg-bg-3 pr-1 pl-2 text-[12px]">
        {session && <AgentIcon agent={session.agent} name={session.acpName} size={13} spinning={isBusy(activityOf(session))} />}
        <span translate="no" className="min-w-0 truncate">
          {session ? `${agentName(session.agent, session.acpName)} · ${title}` : title}
        </span>
        <button aria-label="Back to your tabs" title="Back to your tabs" onClick={onBack} className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-fg-3 hover:bg-bg-2 hover:text-fg">
          <X size={11} />
        </button>
      </span>
      <input
        ref={input}
        readOnly
        value={url}
        spellCheck={false}
        aria-label="Address"
        translate="no"
        onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), onBack())}
        className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-fg-2 outline-none"
      />
    </div>
  );
}

/** What you can do with the agent's browser, in the bar's right part. */
export function AgentBar({ k }: { k: string }) {
  const mobile = useIsMobile();
  const view = useBrowser((s) => s.views[k]);
  const { session } = useAgent(k);
  const b = useAgentBrowsers((x) => x.browsers.find((y) => y.key === k));
  const busy = isBusy(activityOf(session));
  const driving = view?.driver === 'user';
  const tab = activeTab(view);
  const from = view?.handedFrom ?? b?.handedFrom;
  return (
    <>
      {busy && (
        <Button size="sm" icon={<Square size={12} className="fill-current" />} title="Stop the agent" onClick={() => void post(`/api/sessions/${enc(k)}/interrupt`).catch(toastError)}>
          Stop
        </Button>
      )}
      {from && tab && (
        <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} onClick={() => void takeBack(tab.id)} title={`Your tab from ${from}`}>
          Take back
        </Button>
      )}
      {driving ? (
        <Button size="sm" variant="primary" onClick={() => void handBack(k)} title="Give the browser back to the agent">
          Hand back
        </Button>
      ) : (
        <Button size="sm" variant="primary" icon={<Hand size={14} />} onClick={() => void takeOver(k, mobile)} title="Use the browser yourself; the agent waits">
          Take over
        </Button>
      )}
      {session && (
        <IconButton label="Open the session" onClick={() => openSession(k)}>
          <ExternalLink size={16} />
        </IconButton>
      )}
    </>
  );
}

/** The model an agent session runs, as the app names it. */
function ModelName({ agent, model }: { agent: 'claude' | 'codex'; model?: string }) {
  const cat = useCatalog(agent);
  return <>{modelLabel(cat, model ?? null)}</>;
}

/** The right column while an agent's browser shows: its header and its conversation (without the live view of its browser: it is the page beside). */
export function AgentConversation({ k, onBack }: { k: string; onBack: () => void }) {
  const { session, title } = useAgent(k);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-bg-1">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3.5">
        {session && <AgentIcon agent={session.agent} name={session.acpName} size={16} spinning={isBusy(activityOf(session))} />}
        <div className="min-w-0 flex-1">
          <div translate="no" className="truncate text-[13.5px] leading-tight font-semibold">
            {title}
          </div>
          {session && (
            <div translate="no" className="truncate text-[11.5px] leading-tight text-fg-3">
              {agentName(session.agent, session.acpName)}
              {session.model && session.agent !== 'acp' && (
                <>
                  {' · '}
                  <ModelName agent={session.agent} model={session.model} />
                </>
              )}
            </div>
          )}
        </div>
        {session && (
          <IconButton label="Open the session" size="sm" onClick={() => openSession(k)}>
            <ExternalLink size={15} />
          </IconButton>
        )}
        <IconButton label="Back to your tabs" size="sm" onClick={onBack}>
          <X size={16} />
        </IconButton>
      </div>
      <Conversation key={k} sessionKey={k} docks={false} />
    </div>
  );
}

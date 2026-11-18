// Handing the page you are on to an agent to do something in it: Do this here (it gets that one tab, with your sign-ins
// on the site, only the browser, and asks before it sends, posts, deletes or pays). Asking about a page (a copy of its
// text; the agent cannot touch the page) is BrowserAsk.
import { useEffect, useState, type RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Agent } from '@shared/types';
import { post } from '../../lib/api';
import { MOD } from '../../lib/format';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { toastError, useApp } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { Button, cx, Popover, Segmented } from '../../components/ui';

/** The model and account an agent runs with, as the start page last had them (as Help's questions do). */
function useRunFor(agent: Agent, acp: string | null) {
  const boot = useApp((s) => s.boot);
  const cat = useCatalog(agent, acp ?? undefined);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const p = cat?.prefs ?? {};
  const model = (r.model !== undefined ? r.model : p.model) ?? (agent === 'codex' ? (cat?.models.find((x) => x.isDefault)?.value ?? null) : null);
  const account = (r.account !== undefined ? r.account : p.account) ?? '';
  const acct = boot?.accounts.some((a) => a.id === account && a.agent === agent) ? account : undefined;
  const acpName = agent === 'acp' ? boot?.acpAgents.find((a) => a.id === acp)?.name : undefined;
  return { agent, acp, model, account: acct, label: `${agentName(agent, acpName)} · ${modelLabel(cat, model)}` };
}

type Who = 'claude' | 'custom';

/** The agents that can be kept to one tab: Claude Code and Hydor's own agent, Custom. */
const whoOf = (w: Who): { agent: Agent; acp: string | null } => (w === 'claude' ? { agent: 'claude', acp: null } : { agent: 'acp', acp: 'console' });

/** Which of the two the start page last had (Claude Code unless it was Custom). */
export const lastWho = (): Who => {
  const last = lastAgent();
  return last.agent === 'acp' && last.acp === 'console' ? 'custom' : 'claude';
};

/**
 * Starts a session that gets this tab to do what was asked in it (the tab leaves your tabs for the agent's browser, until
 * you take it back), with the model and account the start page last had for that agent. The key of the session, or null
 * when it did not start (the reason is shown).
 */
export async function startDo(tab: string, prompt: string, who: Who = lastWho(), run?: { model: string | null; account?: string }): Promise<string | null> {
  const { agent, acp } = whoOf(who);
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const account = run ? run.account : useApp.getState().boot?.accounts.some((a) => a.id === r.account && a.agent === agent) ? r.account : undefined;
  try {
    const made = await post<{ key: string }>('/api/sessions', {
      agent,
      acpAgent: agent === 'acp' ? acp : undefined,
      prompt,
      model: (run ? run.model : r.model) ?? undefined,
      account,
      extra: { browserHandoff: { tab } },
    });
    return made.key;
  } catch (e) {
    toastError(e);
    return null;
  }
}

export function HandOffPopover({
  anchor,
  open,
  tab,
  title,
  onClose,
  onStarted,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  /** The tab handed over, and its title (for the words under the box). */
  tab: string;
  title: string;
  onClose: () => void;
  /** The session that got the tab. */
  onStarted: (key: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<Who>(lastWho);
  const pick = whoOf(who);
  const run = useRunFor(pick.agent, pick.acp);
  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    const key = await startDo(tab, q, who, run);
    setBusy(false);
    if (!key) return;
    onClose();
    onStarted(key);
  };

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={380} sheet title="Do this here">
      <div className="space-y-3 p-3">
        <div>
          <div className="mb-1.5 text-[13.5px] font-medium">What should an agent do on this page?</div>
          <div translate="no" className="mb-2 truncate text-[12px] text-fg-3">
            {title}
          </div>
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.preventDefault(), void send())}
            placeholder="For example: fill in the form with my details"
            aria-label="What the agent should do"
            className="w-full resize-none rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2 text-[14px] outline-none placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15"
          />
        </div>
        <div className="flex items-start gap-2 text-[12.5px] leading-snug text-fg-3">
          <ShieldCheck size={15} className="mt-px shrink-0" />
          <span>The agent gets this tab and your sign-ins on this site, only the browser, and asks before it sends, posts, deletes or pays.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] text-fg-3">Agent</span>
          <Segmented<Who>
            size="sm"
            value={who}
            onChange={setWho}
            options={[
              { value: 'claude', label: 'Claude Code' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={cx('min-w-0 truncate text-[12px] text-fg-3')} translate="no">
            {run.label}
          </span>
          <Button size="sm" variant="primary" disabled={!text.trim() || busy} onClick={() => void send()} title={`${MOD}Enter`}>
            {busy ? 'Starting…' : 'Start'}
          </Button>
        </div>
      </div>
    </Popover>
  );
}

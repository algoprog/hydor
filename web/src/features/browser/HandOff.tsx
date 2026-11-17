// Handing the page you are on to an agent: Ask about this page (it gets a copy of the page's text, and cannot touch
// the page) and Do this here (it gets that one tab, with your sign-ins on the site, only the browser, and asks before it
// sends, posts, deletes or pays).
import { useEffect, useState, type RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Agent } from '@shared/types';
import { enc, post } from '../../lib/api';
import { attachmentPayload, hostAttachment } from '../../lib/attachments';
import { MOD } from '../../lib/format';
import { openSession } from '../../lib/nav';
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

type Mode = 'ask' | 'do';
type Who = 'claude' | 'custom';

/** The agents that can be kept to one tab: Claude Code and Hydor's own agent, Custom. */
const whoOf = (w: Who): { agent: Agent; acp: string | null } => (w === 'claude' ? { agent: 'claude', acp: null } : { agent: 'acp', acp: 'console' });

export function HandOffPopover({
  anchor,
  open,
  mode,
  tab,
  title,
  onClose,
  onStarted,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  mode: Mode;
  /** The tab handed over, and its title (for the words under the box). */
  tab: string;
  title: string;
  onClose: () => void;
  /** Do this here: the session that got the tab. */
  onStarted: (key: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const last = lastAgent();
  const [who, setWho] = useState<Who>(last.agent === 'acp' && last.acp === 'console' ? 'custom' : 'claude');
  const pick = mode === 'do' ? whoOf(who) : last;
  const run = useRunFor(pick.agent, pick.acp);
  useEffect(() => {
    if (open) setText('');
  }, [open, mode]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      const base = { agent: run.agent, acpAgent: run.agent === 'acp' ? run.acp : undefined, prompt: q, model: run.model ?? undefined, account: run.account };
      if (mode === 'ask') {
        const snap = await post<{ path: string; name: string }>(`/api/browser/browsing/tabs/${enc(tab)}/snapshot`);
        const r = await post<{ key: string }>('/api/sessions', { ...base, ...attachmentPayload([hostAttachment(snap.path, { name: snap.name })]) });
        onClose();
        openSession(r.key);
      } else {
        const r = await post<{ key: string }>('/api/sessions', { ...base, extra: { browserHandoff: { tab } } });
        onClose();
        onStarted(r.key);
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={380} sheet title={mode === 'ask' ? 'Ask about this page' : 'Do this here'}>
      <div className="space-y-3 p-3">
        <div>
          <div className="mb-1.5 text-[13.5px] font-medium">{mode === 'ask' ? 'What do you want to know about this page?' : 'What should an agent do on this page?'}</div>
          <div translate="no" className="mb-2 truncate text-[12px] text-fg-3">
            {title}
          </div>
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.preventDefault(), void send())}
            placeholder={mode === 'ask' ? 'For example: sum this up in a few lines' : 'For example: fill in the form with my details'}
            aria-label={mode === 'ask' ? 'Your question about this page' : 'What the agent should do'}
            className="w-full resize-none rounded-[10px] border border-line-2 bg-bg-1 px-3 py-2 text-[14px] outline-none placeholder:text-fg-3 focus:border-accent/60 focus:ring-3 focus:ring-accent/15"
          />
        </div>
        {mode === 'do' ? (
          <>
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
          </>
        ) : (
          <div className="text-[12.5px] leading-snug text-fg-3">The agent gets a copy of what is on the page. It cannot use the page itself.</div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className={cx('min-w-0 truncate text-[12px] text-fg-3')} translate="no">
            {run.label}
          </span>
          <Button size="sm" variant="primary" disabled={!text.trim() || busy} onClick={() => void send()} title={`${MOD}Enter`}>
            {busy ? 'Starting…' : mode === 'ask' ? 'Ask' : 'Start'}
          </Button>
        </div>
      </div>
    </Popover>
  );
}

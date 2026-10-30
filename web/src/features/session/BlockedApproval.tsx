import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { Agent, ToolItem } from '@shared/types';
import { enc, post } from '../../lib/api';
import { toastError, useTimeline } from '../../lib/store';
import { Button } from '../../components/ui';

/**
 * Claude's auto-mode classifier (and its built-in safety check) refuses some commands outright, without
 * asking. This surfaces each refusal from the latest turn so you can approve it: approving moves the
 * session to Ask mode and re-sends the command, so it comes back as a normal approval prompt you tap —
 * the supported path, not a bypass. Only for sessions this app runs (Claude).
 */
export function BlockedApproval({ sessionKey, agent, running, mode }: { sessionKey: string; agent: Agent; running: boolean; mode: string | null }) {
  const items = useTimeline((x) => x.byKey[sessionKey]?.items);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setHandled(new Set()), [sessionKey]);

  const blocked = useMemo(() => {
    if (!running || agent !== 'claude' || !items?.length) return [] as ToolItem[];
    let lastUser = 0;
    for (let i = items.length - 1; i >= 0; i--)
      if (items[i].kind === 'user') {
        lastUser = i;
        break;
      }
    const out: ToolItem[] = [];
    for (let i = lastUser; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'tool' && it.tool.blocked && !handled.has(it.id)) out.push(it);
    }
    return out.slice(-3);
  }, [items, running, agent, handled]);

  if (!blocked.length) return null;

  const dismiss = (id: string) => setHandled((s) => new Set(s).add(id));

  const approve = async (it: ToolItem) => {
    setBusy(it.id);
    const cmd = (it.tool.title || it.tool.name || '').trim();
    try {
      // Auto mode is the one that refuses outright; Ask mode prompts instead, so the retry reaches you.
      if (mode === 'auto') await post(`/api/sessions/${enc(sessionKey)}/config`, { mode: 'default' });
      await post(`/api/sessions/${enc(sessionKey)}/message`, { text: `I approve this command — please run it now:\n\n\`\`\`\n${cmd}\n\`\`\`` });
      window.dispatchEvent(new Event('wa:follow'));
      dismiss(it.id);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-2 space-y-2">
      {blocked.map((it) => (
        <div key={it.id} className="anim-expand rounded-2xl border border-warn/30 bg-warn/8 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-warn" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px]">
                <span className="font-medium">{agentName(agent)} blocked a command</span>
                <span className="text-fg-2"> — {it.tool.blocked}. Approve to retry it in Ask mode, where you confirm each step.</span>
              </div>
              {it.tool.title && <pre className="term-out mt-2 max-h-28 overflow-auto rounded-lg px-3 py-2 text-[12px]">{it.tool.title}</pre>}
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy === it.id} onClick={() => dismiss(it.id)}>
              Dismiss
            </Button>
            <Button size="sm" variant="primary" disabled={busy === it.id} onClick={() => approve(it)}>
              {busy === it.id ? 'Approving…' : 'Approve & retry'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function agentName(a: Agent): string {
  return a === 'claude' ? 'Claude' : 'Codex';
}

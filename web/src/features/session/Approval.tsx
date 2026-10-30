import { useState } from 'react';
import { MessageCircleQuestion, ShieldAlert } from 'lucide-react';
import type { Agent, ApprovalRequest } from '@shared/types';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { CodeBlock, Markdown } from '../../components/Markdown';
import { DiffView } from '../../components/DiffView';
import { Button } from '../../components/ui';
import { Elapsed } from './items';
import { allAnswered, answerOf, QuestionForm, type Picks } from './QuestionForm';

function FileDetail({ detail }: { detail: string }) {
  // "path\n@@ … diff" blocks, possibly several, possibly led by a reason line.
  const blocks: { path: string; diff: string }[] = [];
  let lead = '';
  for (const line of detail.split('\n')) {
    if (line.startsWith('/') && !line.startsWith('//')) blocks.push({ path: line, diff: '' });
    else if (blocks.length) blocks[blocks.length - 1].diff += line + '\n';
    else lead += line + '\n';
  }
  return (
    <div className="space-y-2">
      {lead.trim() && <div className="text-[12.5px] text-fg-2">{lead.trim()}</div>}
      {blocks.map((b, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-line">
          <div className="truncate border-b border-line bg-bg-1 px-2.5 py-1 font-mono text-[11.5px] text-fg-2">{b.path}</div>
          <div className="max-h-[320px] overflow-auto">
            <DiffView diff={b.diff} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApprovalCard({ a, sessionKey, agent, id }: { a: ApprovalRequest; sessionKey: string; agent: Agent; id?: string }) {
  const [busy, setBusy] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [picks, setPicks] = useState<Picks>({});

  const respond = async (decision: string) => {
    setBusy(true);
    try {
      const answers: Record<string, string> = {};
      if (a.kind === 'question') {
        for (const q of a.questions ?? []) answers[q.id] = answerOf(q, picks[q.id], agent === 'claude' ? ', ' : '\n');
      }
      await post(`/api/sessions/${enc(sessionKey)}/approvals/${enc(a.id)}`, { decision, message: decision === 'deny' || decision === 'decline' ? msg : undefined, answers });
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const question = a.kind === 'question';
  const answeredAll = !question || allAnswered(a.questions ?? [], picks);

  return (
    <div id={id} className="anim-pop my-2 overflow-hidden rounded-xl border border-warn/45 bg-panel shadow-[0_0_0_3px_color-mix(in_srgb,var(--warn)_10%,transparent)]">
      <div className="flex items-center gap-2 border-b border-line bg-warn/8 px-3 py-2">
        {question ? <MessageCircleQuestion size={15} className="shrink-0 text-warn" /> : <ShieldAlert size={15} className="shrink-0 text-warn" />}
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.title}</div>
        <span className="shrink-0 text-[11px] text-fg-3">
          waiting <Elapsed since={a.createdAt} />
        </span>
      </div>
      <div className="space-y-3 px-3 py-3">
        {a.detail && a.kind === 'command' && <CodeBlock code={a.detail} lang="bash" maxHeight={260} className="!my-0" />}
        {a.detail && a.kind === 'file' && <FileDetail detail={a.detail} />}
        {a.detail && a.kind === 'plan' && (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-line px-3 py-2">
            <Markdown text={a.detail} />
          </div>
        )}
        {a.detail && (a.kind === 'tool' || a.kind === 'permissions' || a.kind === 'other') && (
          <pre className="term-out max-h-64 overflow-auto rounded-lg border border-line px-3 py-2">{a.detail}</pre>
        )}
        {question && <QuestionForm questions={a.questions ?? []} value={picks} onChange={setPicks} disabled={busy} onSubmit={() => answeredAll && !busy && respond('answer')} />}
        {denyOpen && (
          <textarea
            autoFocus
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            rows={2}
            placeholder="Optional: tell the agent what to do instead"
            className="w-full resize-none rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent/60"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {a.options.map((o) => {
            const deny = o.id === 'deny' || o.id === 'decline';
            if (deny && !denyOpen && !question) {
              return (
                <Button key={o.id} size="sm" variant="ghost" disabled={busy} onClick={() => setDenyOpen(true)}>
                  {o.label}…
                </Button>
              );
            }
            return (
              <Button
                key={o.id}
                size="sm"
                variant={o.style === 'primary' ? 'primary' : deny ? (question ? 'ghost' : 'danger') : 'secondary'}
                disabled={busy || (o.id === 'answer' && !answeredAll)}
                onClick={() => respond(o.id)}
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

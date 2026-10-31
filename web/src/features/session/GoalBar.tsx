// A goal the agent keeps working towards across turns (/goal): what it is and how it stands, above
// the composer, with Pause, Resume (Codex and Custom) and Clear. "Set a goal" asks for one.
import { useState } from 'react';
import { Target } from 'lucide-react';
import type { GoalInfo, SessionSummary } from '@shared/types';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Button, cx, Dialog, inputCls } from '../../components/ui';

const STATUS: Record<GoalInfo['status'], string> = {
  active: 'working on it',
  paused: 'paused',
  blocked: 'stuck: the agent needs you',
  limited: 'stopped at a usage or token limit',
};

function spent(g: GoalInfo): string {
  const parts: string[] = [];
  if (g.turns) parts.push(`checked ${g.turns} time${g.turns === 1 ? '' : 's'}`);
  if (g.seconds && g.seconds >= 60) parts.push(`${Math.round(g.seconds / 60)} min`);
  if (g.tokensUsed) parts.push(`${g.tokensUsed >= 1000 ? `${Math.round(g.tokensUsed / 1000)}k` : g.tokensUsed}${g.tokenBudget ? ` of ${Math.round(g.tokenBudget / 1000)}k` : ''} tokens`);
  return parts.join(' · ');
}

export function goalAction(key: string, action: 'set' | 'pause' | 'resume' | 'clear', objective?: string) {
  return post(`/api/sessions/${enc(key)}/goal`, { action, objective });
}

export function GoalBar({ s, className }: { s: SessionSummary; className?: string }) {
  const g = s.goal;
  const [busy, setBusy] = useState(false);
  if (!g) return null;
  const act = async (a: 'pause' | 'resume' | 'clear') => {
    setBusy(true);
    try {
      await goalAction(s.key, a);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const meta = spent(g);
  // Codex and Custom (the app's own loop) can pause a goal and pick it up again.
  const codex = s.agent === 'codex' || (s.agent === 'acp' && s.acpAgent === 'console');
  return (
    <div className={cx('anim-expand flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-2xl border border-line-2 bg-panel px-4 py-2.5 text-[13.5px]', className)} role="status">
      <Target size={15} className={cx('mt-0.5 shrink-0', g.status === 'active' ? 'text-accent' : 'text-warn')} />
      {/* The buttons move under the text when there is not room beside it. */}
      <div className="min-w-[min(100%,240px)] flex-1">
        <div>
          <span className="font-medium">Goal</span>
          <span className="text-fg-3">
            {' '}
            · {STATUS[g.status]}
            {meta && ` · ${meta}`}
          </span>
        </div>
        <div className="mt-0.5 line-clamp-3 text-fg-2">{g.objective}</div>
        {g.reason && (
          <div className={cx('mt-1 line-clamp-2 text-[12.5px]', g.status === 'active' ? 'text-fg-3' : 'text-warn')} title={g.reason}>
            {g.status === 'active' ? `Last check: ${g.reason}` : g.reason}
          </div>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {codex && g.status === 'active' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('pause')}>
            Pause
          </Button>
        )}
        {codex && g.status !== 'active' && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('resume')}>
            Resume
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('clear')} title="Stop working towards it">
          Clear
        </Button>
      </div>
    </div>
  );
}

/** Asks what the goal is; the agent then works until it holds. */
export function GoalDialog({ s, open, onClose }: { s: SessionSummary; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const set = async () => {
    setBusy(true);
    try {
      await goalAction(s.key, 'set', text.trim());
      setText('');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Set a goal"
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={set} disabled={busy || !text.trim()}>
            {busy ? 'Setting…' : 'Start working on it'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">
        {s.agent === 'codex'
          ? 'Codex keeps working, turn after turn, until it judges the goal done. You can pause or clear it any time.'
          : s.agent === 'acp'
            ? 'The agent keeps working, turn after turn; after each one the helper model checks the evidence and gives it the next step, until the goal holds. It pauses when it stops making progress. You can pause or clear it any time.'
            : 'Claude keeps working, turn after turn; after each one a quick check decides whether the goal holds yet. You can clear it any time.'}{' '}
        Say what “done” looks like, for example “npm test passes and the upload page handles 2 GB files”.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && set()}
        rows={4}
        autoFocus
        placeholder="The goal, as a condition that is true when the work is done"
        className={cx(inputCls, 'h-auto py-2 leading-relaxed')}
      />
    </Dialog>
  );
}

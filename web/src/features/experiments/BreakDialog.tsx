// Try to break it: before a result counts, an agent that did none of the work tries to explain the gain away. The
// result in one sentence (filled in from the picked runs), which of them is the baseline, and who runs it. Start
// opens a new session in the runs' folder, in a worktree of its own when they ran from a commit, whose agent looks
// for other explanations, runs controls in Experiments and reports what survived (the request is shared/break.ts's
// breakRequest; the method, the break-the-result skill).
import { useState } from 'react';
import { Hammer } from 'lucide-react';
import { breakRequest } from '@shared/break';
import type { RunRecord } from '@shared/experiments';
import { tr } from '../../i18n/runtime';
import { lastAgent, startSettings } from '../../lib/start';
import { startSession } from '../../lib/starting';
import { useApp } from '../../lib/store';
import { Button, cx, Dialog, inputCls } from '../../components/ui';
import { Field } from '../automations/parts';
import { useRun } from '../git/BisectDialog';
import { AgentPicker } from '../home/AgentPicker';
import { headlineOf } from './analysis';
import { num } from './api';

const nameOf = (r: RunRecord) => r.name ?? r.id;

/** The sentence the result starts as: the best of the others against the baseline, on the first number they share. */
function claimOf(runs: RunRecord[], baseline: RunRecord): { claim: string; metric?: string; run?: RunRecord } {
  const h = headlineOf(runs, baseline);
  if (!h) return { claim: '' };
  const gain = (h.better === 'max' ? 1 : -1) * (h.value - h.against);
  const words = tr(gain > 0 ? '{0} beats the baseline on {1}: {2} against {3}' : gain < 0 ? '{0} is behind the baseline on {1}: {2} against {3}' : '{0} matches the baseline on {1}: {2} against {3}');
  const values = [nameOf(h.run), h.metric, num(h.value), num(h.against)];
  return { claim: words.replace(/\{([0-3])\}/g, (_, i) => values[Number(i)]), metric: h.metric, run: h.run };
}

export function BreakDialog({ runs, onClose }: { runs: RunRecord[]; onClose: () => void }) {
  const acpList = useApp((s) => s.boot?.acpAgents);
  // Another machine's runs are read there: an agent started here could not.
  const mine = runs.filter((r) => !r.machine);
  const oldest = [...mine].sort((a, b) => a.createdAt - b.createdAt)[0] as RunRecord | undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const baseline = mine.find((r) => r.id === picked) ?? oldest;
  const filled = baseline ? claimOf(mine, baseline) : { claim: '' };
  // The sentence follows the baseline until you write your own.
  const [written, setWritten] = useState<string | null>(null);
  const claim = written ?? filled.claim;
  const [who, setWho] = useState(lastAgent);
  const run = useRun(who.agent, who.acp);
  const ready = mine.length > 1 && !!claim.trim();

  const start = () => {
    if (!ready || !baseline) return;
    // The folder of the run the claim is for; a run on a cluster or another machine has its folder there, not here.
    const from = filled.run ?? mine.find((r) => r !== baseline) ?? baseline;
    const cwd = !from.where || from.where === 'local' ? from.cwd : undefined;
    const prompt = breakRequest({
      claim,
      runs: mine.map((r) => ({ id: r.id, name: nameOf(r), group: r.group })),
      baseline: baseline.id,
      // Only while the sentence still names it: you may have written about another number.
      metric: filled.metric && claim.includes(filled.metric) ? filled.metric : undefined,
      cwd,
    });
    const s = startSettings();
    onClose();
    // The session's page opens at once; should it not start, the request waits in the start page's box.
    startSession(
      { agent: who.agent, acpName: run.acpName, title: prompt.slice(0, 300), text: prompt, atts: [], cwd: cwd ?? '' },
      async () => ({
        agent: who.agent,
        acpAgent: who.agent === 'acp' ? who.acp : undefined,
        prompt,
        model: run.model ?? undefined,
        mode: run.mode ?? undefined,
        account: run.account,
        cwd,
        // A commit says the folder is a git repository: the agent works on a copy of it.
        worktree: !!cwd && !!from.commit,
      }),
      { text: prompt, files: [], extra: {}, folder: cwd ? { cwd, over: JSON.stringify([s.cwd ?? null, s.task ?? null, s.space ?? null]) } : undefined, from: '' },
    );
  };

  return (
    <Dialog
      part="experiments"
      open
      onClose={onClose}
      width={500}
      title={
        <span className="flex items-center gap-2">
          <Hammer size={16} className="text-fg-3" />
          Try to break it
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start} disabled={!ready}>
            Start
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">An agent that did none of the work looks for other explanations, runs controls in Experiments and reports what survived. It works on a copy and asks before using much GPU time.</p>
      <div className="space-y-3">
        <Field label="The result to test">
          <textarea value={claim} onChange={(e) => setWritten(e.target.value)} rows={3} placeholder="Which run is better than the baseline, on what number, and by how much" className={cx(inputCls, 'h-auto py-1.5 text-[13.5px] leading-relaxed')} />
        </Field>
        <Field label="Baseline">
          <select value={baseline?.id ?? ''} onChange={(e) => setPicked(e.target.value)} translate="no" className={cx(inputCls, 'h-9 pr-8 text-[13.5px]')}>
            {mine.map((r) => (
              <option key={r.id} value={r.id}>
                {nameOf(r)}
              </option>
            ))}
          </select>
        </Field>
        {mine.length < runs.length && <p className="text-[12px] text-fg-3">Runs on other machines are left out: an agent here cannot read them.</p>}
        {mine.length < 2 && <p className="text-[12px] text-err">Pick at least two runs of this computer.</p>}
        <Field label="Run by">
          <div>
            <AgentPicker agent={who.agent} acpId={who.acp} acpList={acpList ?? []} onPick={(agent, acp) => setWho({ agent, acp })} />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

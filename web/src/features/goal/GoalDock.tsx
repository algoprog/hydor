// The goal's place above the message box. Without a goal the app's own loop drives it shows today's bar (a goal of the
// program's own: Claude Code's or Codex's /goal). With one it stacks, top to bottom: the rounds (when opened), the report
// of a goal that is over, the agreement of checks waiting for you, an open question, and the bar.
import { useState } from 'react';
import { goalOver } from '@shared/goals';
import type { SessionSummary } from '@shared/types';
import { GoalBar } from '../session/GoalBar';
import { Agreement } from './Agreement';
import { GoalBarCard, GoalBarLite } from './Bar';
import { Question } from './Question';
import { Report } from './Report';
import { Rounds } from './Rounds';
import { useGoal } from './state';
import { teamOf } from './words';

export function GoalDock({ s, className }: { s: SessionSummary; className?: string }) {
  const g = useGoal(s.key);
  const [rounds, setRounds] = useState(false);
  // Before the goal has loaded, the summary says enough for a bar; a goal of the program's own has no loop to load.
  if (!g) return s.goal?.app ? <GoalBarLite s={s} className={className} /> : s.goal ? <GoalBar s={s} className={className} /> : null;
  const over = goalOver(g.status);
  const gap = 'mb-2';
  return (
    <div data-i18n="goal" className={className}>
      {rounds && g.rounds.length > 0 && <Rounds g={g} onClose={() => setRounds(false)} className={gap} />}
      {over && <Report g={g} rounds={rounds} onRounds={() => setRounds((o) => !o)} className={gap} />}
      {g.status === 'agreeing' && <Agreement g={g} s={s} className={gap} />}
      {!over && g.question && <Question g={g} />}
      {!over && <GoalBarCard g={g} team={teamOf(s)} cwd={s.cwd ?? s.worktree?.path} rounds={rounds} onRounds={() => setRounds((o) => !o)} className={g.question ? 'mt-2' : undefined} />}
    </div>
  );
}

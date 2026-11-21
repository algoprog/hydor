// Development only (main.tsx loads it for /goal-preview in a dev server, never in a build): every sample goal
// (samples.ts) drawn in the dock as it shows above the message box, without the server. ?s=<sample id> picks one,
// ?rounds=1 opens the rounds, ?more=1 opens Give it more (on the limit sample), ?open=<n> opens that round's row, ?light=1 the light theme,
// ?helpers=2&swarm=1 shows a lead whose own turn has ended while 2 members are at work (the working-swarm sample does by itself), ?bare=1 leaves out the list of samples and ?zoom=0.8 draws smaller (for pictures of one state).
import { useEffect } from 'react';
import type { SessionSummary } from '@shared/types';
import { SessionCtx } from '../session/items';
import { GoalDock } from './GoalDock';
import { GoalMessage } from './GoalMessage';
import { samples } from './samples';
import { showGoal } from './state';

const KEY = 'claude:preview';

export default function GoalPreview() {
  const q = new URLSearchParams(location.search);
  const all = samples();
  const pick = all.find((x) => x.id === (q.get('s') ?? 'working')) ?? all[0];
  const g = { ...pick.goal, key: KEY };
  // The lead's own turn has ended while its subagents (a swarm's members) are at work: the bar says it waits for them.
  const swarm = q.get('swarm') ? q.get('swarm') === '1' : pick.id.startsWith('working-swarm');
  const helpers = q.has('helpers') ? Number(q.get('helpers')) : swarm ? 2 : 0;
  const s = {
    key: KEY,
    cwd: '/home/you/code/shop-app',
    worktree: g.undo ? { path: '/tmp/x', branch: 'goal/search-relevance', base: 'main', repo: '/home/you/code/shop-app' } : undefined,
    helpers: helpers || undefined,
    live: helpers ? { status: 'idle' } : undefined,
    extra: swarm ? { swarm: true } : undefined,
    goal: { objective: g.contract.objective, status: 'active', app: { state: g.status, round: g.round, rounds: g.contract.limits.rounds, holds: 3, of: g.contract.checks.length } },
  } as unknown as SessionSummary;
  showGoal(KEY, g);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !q.get('light'));
    document.documentElement.classList.toggle('light', !!q.get('light'));
    const zoom = Number(q.get('zoom'));
    if (zoom > 0) document.documentElement.style.setProperty('zoom', String(zoom));
    const t = setTimeout(() => {
      if (q.get('more')) [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Give it more'))?.click();
      if (q.get('rounds')) [...document.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Rounds ·'))?.click();
      const open = q.get('open');
      if (open)
        setTimeout(() => {
          const rows = [...document.querySelectorAll('li > button[aria-expanded]')] as HTMLButtonElement[];
          rows[Number(open)]?.click();
        }, 50);
    }, 100);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-dvh bg-bg p-3 text-fg sm:p-6">
      {!q.get('bare') && (
        <div className="mx-auto mb-4 flex max-w-[800px] flex-wrap gap-1.5 text-[12px]">
          {all.map((x) => (
            <a key={x.id} href={`?s=${x.id}`} className={x.id === pick.id ? 'rounded bg-accent px-2 py-0.5 text-accent-fg' : 'rounded bg-bg-2 px-2 py-0.5 text-fg-2'}>
              {x.label}
            </a>
          ))}
        </div>
      )}
      <SessionCtx.Provider value={{ sessionKey: KEY, openChanges: () => alert('Changes tab') }}>
        <div className="mx-auto max-w-[800px]">
          <GoalMessage ts={Date.now()} message={{ head: 'round 5 of 12', body: '[Goal · round 5 of 12]\nBuild on what holds.\n(This message is from the app’s goal loop, not typed by the user.)' }} />
          <div className="h-3" />
          <GoalDock s={s} />
        </div>
      </SessionCtx.Provider>
    </div>
  );
}

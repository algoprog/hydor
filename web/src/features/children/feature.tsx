// Child sessions: an agent hands parts of a job to new sessions (any agent or model here), and their
// replies come back to it. A card for each in the parent's conversation, children folded under their
// parent in the sidebar, a line in a child pointing back to its parent, and Settings → Child sessions.
import type { ReactNode } from 'react';
import { CornerDownRight, Minus, Network, Plus } from 'lucide-react';
import { MAX_RUNNING_LIMIT, SWARM_SIZE_LIMIT } from '@shared/children';
import { leadsSwarm } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { IconButton, Section } from '../../components/ui';
import { openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import type { WebFeature } from '../registry';
import { saveChildSettings, useChildSettingsState } from '../swarm/state';
import { ChildCard } from './ChildCard';
import { TierLine } from './TierLine';

/** In a child session, above the message box: where its replies go. */
function ParentDock({ s }: { s: SessionSummary }) {
  const parent = typeof s.extra?.parent === 'string' ? s.extra.parent : undefined;
  const p = useSessions((x) => (parent ? x.byKey[parent] : undefined));
  // A swarm's member: the swarm's own bar says where it reports.
  if (!parent || leadsSwarm(p?.extra)) return null;
  return (
    <div data-tip="children" className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <CornerDownRight size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        Child of <span className="text-fg">{p?.title ?? 'another session'}</span>
        <span className="max-sm:hidden">: its replies go back there</span>
      </span>
      {p && (
        <button type="button" onClick={() => openSession(parent)} className="shrink-0 font-medium text-accent hover:underline">
          Open parent
        </button>
      )}
    </div>
  );
}

/** A number set with − and +. */
function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-[10px] bg-bg-2 p-0.5">
      <IconButton size="sm" label="Fewer" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <Minus size={14} />
      </IconButton>
      <span className="tnum w-6 text-center text-[13.5px] font-medium">{value}</span>
      <IconButton size="sm" label="More" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}

function Setting({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-1">
      <div className="min-w-[200px] flex-1">
        <div className="text-[13.5px] text-fg">{label}</div>
        <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function ChildSettingsBody() {
  const st = useChildSettingsState();
  return (
    <div className="space-y-4">
      <Section title="Child sessions" sub="An agent can hand parts of a job to new sessions, with any agent or model here. They work at the same time, and each one's reply comes back to it.">
        <Setting label="Working at once, per session" hint="The agent waits for one to finish before it starts more.">
          {st && <Stepper value={st.maxRunning} max={MAX_RUNNING_LIMIT} onChange={(n) => saveChildSettings({ maxRunning: n })} />}
        </Setting>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-snug text-fg-3">
          <li>One level: a child session cannot start children of its own.</li>
          <li>A child never gets a freer mode than the session that started it.</li>
          <li>A session with a spending cap gives each child a share of what is left, and its cap covers them all.</li>
        </ul>
      </Section>
      <Section
        title="Swarm"
        sub="Turn on Swarm under Options when you start a session, and a lead agent sets a team on a hard problem, each member from its own angle: they share a board, message each other, and the lead checks the answer. Or pick Campaign there for one big change in many parts, each member in a worktree of its own."
      >
        <Setting label="Swarm size" hint="Members working at once in one swarm or campaign. Each costs about what one agent does; the lead starts more as some finish.">
          {st && <Stepper value={st.swarmSize} max={SWARM_SIZE_LIMIT} onChange={(n) => saveChildSettings({ swarmSize: n })} />}
        </Setting>
      </Section>
    </div>
  );
}

export const childrenFeature: WebFeature = {
  id: 'children',
  noteViews: { child: ChildCard, tier: TierLine },
  SessionDock: ParentDock,
  settings: [{ id: 'children', label: 'Child sessions', icon: Network, sub: 'Agents handing parts of a job to other agents, and swarms for hard problems', Body: ChildSettingsBody }],
};

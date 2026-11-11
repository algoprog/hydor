// Child sessions: an agent hands parts of a job to new sessions (any agent or model here), and their
// replies come back to it. A card for each in the parent's conversation, children folded under their
// parent in the sidebar, a line in a child pointing back to its parent, and Settings → Child sessions.
import { CornerDownRight, Network } from 'lucide-react';
import { MAX_RUNNING_LIMIT, SWARM_SIZE_LIMIT } from '@shared/children';
import { leadsSwarm } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { Throbber } from '../../components/ui';
import { Group, Row, Stack, Stepper } from '../settings/kit';
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

function ChildSettingsBody() {
  const st = useChildSettingsState();
  const wait = <Throbber className="text-fg-3" />;
  return (
    <Stack>
      <Group title="Child sessions" info="An agent can hand parts of a job to new sessions, with any agent or model here. They work at the same time, and each one’s reply comes back to it.">
        <Row
          label="Working at once, per session"
          hint="The agent waits for one to finish before it starts more"
          info={
            <ul className="list-disc space-y-1 pl-4">
              <li>One level: a child session cannot start children of its own.</li>
              <li>A child never gets a freer mode than the session that started it.</li>
              <li>A session with a spending cap gives each child a share of what is left, and its cap covers them all.</li>
            </ul>
          }
          control={st ? <Stepper label="Working at once, per session" value={st.maxRunning} min={1} max={MAX_RUNNING_LIMIT} onChange={(n) => saveChildSettings({ maxRunning: n })} /> : wait}
        />
      </Group>
      <Group
        title="Swarm"
        info="Turn on Swarm under Options when you start a session, and a lead agent sets a team on a hard problem, each member from its own angle: they share a board, message each other, and the lead checks the answer. Or pick Campaign there for one big change in many parts, each member in a worktree of its own."
      >
        <Row
          label="Swarm size"
          hint="Members working at once in one swarm or campaign"
          info="Each costs about what one agent does; the lead starts more as some finish."
          control={st ? <Stepper label="Swarm size" value={st.swarmSize} min={1} max={SWARM_SIZE_LIMIT} onChange={(n) => saveChildSettings({ swarmSize: n })} /> : wait}
        />
      </Group>
    </Stack>
  );
}

export const childrenFeature: WebFeature = {
  id: 'children',
  noteViews: { child: ChildCard, tier: TierLine },
  SessionDock: ParentDock,
  settings: [{ id: 'children', label: 'Child sessions', icon: Network, sub: 'Agents handing parts of a job to other agents, and swarms for hard problems', Body: ChildSettingsBody }],
};

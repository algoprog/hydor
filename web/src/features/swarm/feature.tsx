// Swarm mode: a session that leads a team of agents attacking a hard problem from different angles. On the
// start page, an option under Options; in the lead's session, a bar over the message box with how the swarm
// is doing and its board; in a member's, where its posts and report go. Its size is in Settings → Child
// sessions; members are child sessions, so they also nest under the lead in the sidebar.
import { useEffect, useRef, useState } from 'react';
import { Settings2, Users } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { leadsSwarm } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { go, openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import type { WebFeature } from '../registry';
import { BoardDialog, useMembers } from './Board';
import { loadBoard, useBoards, useChildSettingsState } from './state';

const DOCK = 'mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]';

/** In the lead's session: how many members work, how many are done, the posts so far, and the board. */
function LeadDock({ s }: { s: SessionSummary }) {
  const [open, setOpen] = useState(false);
  const members = useMembers(s.key);
  const posts = useBoards((x) => x.byKey[s.key]?.posts.length);
  useEffect(() => loadBoard(s.key), [s.key]);
  const working = members.filter((m) => isBusy(activityOf(m))).length;
  const done = members.length - working;
  return (
    <>
      <div className={DOCK}>
        <Users size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-fg-2">
          <span className="font-medium text-fg">Swarm</span>
          {members.length ? ` · ${working} working${done ? ` · ${done} done` : ''}` : ' · choosing its angles'}
          {posts ? ` · ${posts} post${posts === 1 ? '' : 's'}` : ''}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-medium text-accent hover:underline">
          Board
        </button>
      </div>
      <BoardDialog swarm={s.key} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** In a member's session: whose swarm it is in, where its posts and report go. */
function MemberDock({ lead }: { lead: SessionSummary }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={DOCK}>
        <Users size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-fg-2">
          In the swarm of <span className="text-fg">{lead.title}</span>
          <span className="max-sm:hidden">: its posts and report go there</span>
        </span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-medium text-accent hover:underline">
          Board
        </button>
        <button type="button" onClick={() => openSession(lead.key)} className="shrink-0 font-medium text-accent hover:underline">
          Lead
        </button>
      </div>
      <BoardDialog swarm={lead.key} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SwarmDock({ s }: { s: SessionSummary }) {
  const parent = typeof s.extra?.parent === 'string' ? s.extra.parent : undefined;
  const lead = useSessions((x) => (parent ? x.byKey[parent] : undefined));
  if (leadsSwarm(s.extra)) return <LeadDock s={s} />;
  if (lead && leadsSwarm(lead.extra)) return <MemberDock lead={lead} />;
  return null;
}

/** On the start page, under Options: one agent, or a swarm of them. Not kept for the next start: a swarm costs several times as much. */
function SwarmStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const size = useChildSettingsState()?.swarmSize;
  const on = leadsSwarm(value);
  const set = (swarm: true | undefined) => {
    // A swarm and a deep research both lead child sessions: one or the other.
    onChange(swarm ? { swarm, research: undefined } : { swarm });
    setOpen(false);
  };
  return (
    <>
      <SettingChip
        ref={ref}
        label="Swarm"
        icon={<Users size={14} />}
        value={on ? `On${size ? ` · ${size} at once` : ''}` : 'Off'}
        on={on}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={on ? `A lead agent and up to ${size ?? 'several'} members attack the task from different angles` : 'One agent works on the task'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title="Swarm">
        <OptionRow label="Off" hint="One agent works on the task" selected={!on} onClick={() => set(undefined)} />
        <OptionRow label="Swarm" hint={`Up to ${size ?? 'several'} agents at once, each from its own angle`} selected={on} onClick={() => set(true)} />
        <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] leading-snug text-fg-3">
          A lead agent splits the task into angles of attack and starts a member for each. They post what they find to a shared board, read each other’s posts and
          message each other; the lead steers, starts more as some finish, and checks the answer. For hard problems, like a proof or a stubborn bug: it costs several
          times what one agent does, and a spending cap keeps it in hand.
        </div>
        <MenuSep />
        <MenuItem
          icon={<Settings2 size={14} />}
          onClick={() => {
            setOpen(false);
            go('/settings?s=children');
          }}
        >
          Swarm size
        </MenuItem>
      </Popover>
    </>
  );
}

export const swarmFeature: WebFeature = {
  id: 'swarm',
  SessionDock: SwarmDock,
  StartOptions: SwarmStartOption,
};

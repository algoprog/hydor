// Swarm mode: a session that leads a team of agents, as a swarm attacking a hard problem from different angles,
// or as a campaign making one big change in many parts, each in a worktree of its own. On the start page, an
// option under Options; in the lead's session, a bar over the message box with how it is doing and its board; in
// a member's, where its posts and report go. Its size is in Settings → Subagents; members are child
// sessions, so they also nest under the lead in the sidebar.
import { useEffect, useRef, useState } from 'react';
import { Settings2, Users } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { partsTally, swarmMode, type SwarmMode } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { go, openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import type { WebFeature } from '../registry';
import { BoardDialog, useMembers } from './Board';
import { loadBoard, useBoards, useChildSettingsState } from './state';

const DOCK = 'mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]';

/** How a campaign stands, in a line: "12 of 40 parts done · 2 failed · 3 working". */
function CampaignLine({ swarm }: { swarm: string }) {
  const parts = useBoards((x) => x.byKey[swarm]?.parts);
  if (!parts?.length) return <> · planning its parts</>;
  const n = partsTally(parts);
  return (
    <>
      {` · ${n.done} of ${n.total} parts done`}
      {n.failed > 0 && <span className="text-err">{` · ${n.failed} failed`}</span>}
      {n.working > 0 && ` · ${n.working} working`}
    </>
  );
}

/** In the lead's session: how many members work, how many are done (a campaign: how its parts stand), and the board. */
function LeadDock({ s, mode }: { s: SessionSummary; mode: SwarmMode }) {
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
          {mode === 'campaign' ? (
            <>
              <span className="font-medium text-fg">Campaign</span>
              <CampaignLine swarm={s.key} />
            </>
          ) : (
            <>
              <span className="font-medium text-fg">Swarm</span>
              {members.length ? ` · ${working} working${done ? ` · ${done} done` : ''}` : ' · choosing its angles'}
              {posts ? ` · ${posts} post${posts === 1 ? '' : 's'}` : ''}
            </>
          )}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-medium text-accent hover:underline">
          Board
        </button>
      </div>
      <BoardDialog swarm={s.key} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** In a member's session: whose swarm or campaign it is in, where its posts and report go. */
function MemberDock({ lead, mode }: { lead: SessionSummary; mode: SwarmMode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={DOCK}>
        <Users size={14} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1 truncate text-fg-2">
          {mode === 'campaign' ? 'In the campaign of ' : 'In the swarm of '}
          <span translate="no" className="text-fg">
            {lead.title}
          </span>
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
  const own = swarmMode(s.extra);
  if (own) return <LeadDock s={s} mode={own} />;
  const theirs = swarmMode(lead?.extra);
  if (lead && theirs) return <MemberDock lead={lead} mode={theirs} />;
  return null;
}

/**
 * On the start page, under Options: one agent, a swarm of them on a hard problem, or a campaign for one big change
 * in many parts. Not kept for the next start: either costs several times as much.
 */
function SwarmStartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const size = useChildSettingsState()?.swarmSize;
  const mode = swarmMode(value);
  const set = (swarm: true | 'campaign' | undefined) => {
    // A swarm and a deep research both lead child sessions: one or the other.
    onChange(swarm ? { swarm, research: undefined } : { swarm });
    setOpen(false);
  };
  const atOnce = size ? ` · ${size} at once` : '';
  return (
    <>
      <SettingChip
        ref={ref}
        label="Swarm"
        icon={<Users size={14} />}
        value={mode === 'campaign' ? `Campaign${atOnce}` : mode ? `On${atOnce}` : 'Off'}
        on={!!mode}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={
          mode === 'campaign'
            ? `A lead agent splits one big change into parts, and up to ${size ?? 'several'} members do them at once, each in a worktree of its own`
            : mode
              ? `A lead agent and up to ${size ?? 'several'} members attack the task from different angles`
              : 'One agent works on the task'
        }
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} title="Swarm">
        <OptionRow label="Off" hint="One agent works on the task" selected={!mode} onClick={() => set(undefined)} />
        <OptionRow label="Swarm" hint={`Up to ${size ?? 'several'} agents at once, each from its own angle`} selected={mode === 'swarm'} onClick={() => set(true)} />
        <OptionRow label="Campaign" hint="One big change in parts, each in a worktree" selected={mode === 'campaign'} onClick={() => set('campaign')} />
        <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] leading-snug text-fg-3">
          A lead agent shares the work out and checks it; it costs several times what one agent does.
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

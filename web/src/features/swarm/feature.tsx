// Swarm mode: a session that leads a team of agents, as a swarm attacking a hard problem from different angles,
// or as a campaign making one big change in many parts, each in a worktree of its own. On the start page, an
// option under Options; in a session, its menu's Session settings → Swarm, to turn it on, off or to a campaign
// from the next message; in the lead's session, a bar over the message box with how it is doing and its board; in
// a member's, where its posts and report go. Its size is in Settings → Subagents; members are child
// sessions, so they also nest under the lead in the sidebar.
import { useEffect, useRef, useState } from 'react';
import { Settings2, Users } from 'lucide-react';
import { create } from 'zustand';
import { isConfidential } from '@shared/confidential';
import type { SessionExtra } from '@shared/features';
import { partsTally, swarmMode, type SwarmMode } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { Dialog, MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';
import { activityOf, isBusy } from '../../lib/activity';
import { enc, patch } from '../../lib/api';
import { go, openSession } from '../../lib/nav';
import { toast, toastError, useSessions } from '../../lib/store';
import type { WebFeature } from '../registry';
import { useCostlyMode } from '../tips/ModeExplainer';
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

function SwarmBar({ s }: { s: SessionSummary }) {
  const parent = typeof s.extra?.parent === 'string' ? s.extra.parent : undefined;
  const lead = useSessions((x) => (parent ? x.byKey[parent] : undefined));
  const own = swarmMode(s.extra);
  if (own) return <LeadDock s={s} mode={own} />;
  const theirs = swarmMode(lead?.extra);
  if (lead && theirs) return <MemberDock lead={lead} mode={theirs} />;
  return null;
}

function SwarmDock({ s }: { s: SessionSummary }) {
  return (
    <>
      <SwarmBar s={s} />
      <SwarmDialog s={s} />
    </>
  );
}

/**
 * Off, a swarm or a campaign: the start page's popover and a session's dialog both list these. Picked for the first
 * time, a swarm or a campaign is explained before it is on (what it is for, what it costs).
 */
function SwarmChoices({ mode, size, set }: { mode: SwarmMode | null; size?: number; set: (swarm: true | 'campaign' | undefined) => void }) {
  const { ask, dialog } = useCostlyMode();
  return (
    <>
      <OptionRow label="Off" hint="One agent works on the task" selected={!mode} onClick={() => set(undefined)} />
      <OptionRow label="Swarm" hint={`Up to ${size ?? 'several'} agents at once, each from its own angle`} selected={mode === 'swarm'} onClick={() => ask('swarm', () => set(true))} />
      <OptionRow label="Campaign" hint="One big change in parts, each in a worktree" selected={mode === 'campaign'} onClick={() => ask('campaign', () => set('campaign'))} />
      {dialog}
    </>
  );
}

/** The session whose Swarm dialog is open, if any (its menu opens it; its dock shows it, outliving the menu). */
const useSwarmDialog = create<{ key: string | null }>(() => ({ key: null }));

/** A session that may lead a swarm: not a confidential one, nor one another session started (a member, a researcher, a subagent). */
const canLead = (s: SessionSummary) => !isConfidential(s.extra) && typeof s.extra?.parent !== 'string';

/** The session menu's Session settings → Swarm: turns it on, off or to a campaign, from the next message. */
function SwarmMenuItem({ s, close }: { s: SessionSummary; close: () => void }) {
  if (!canLead(s)) return null;
  const mode = swarmMode(s.extra);
  return (
    <MenuItem icon={<Users size={15} />} hint={mode === 'campaign' ? 'Campaign' : mode ? 'On' : 'Off'} onClick={() => (close(), useSwarmDialog.setState({ key: s.key }))}>
      Swarm
    </MenuItem>
  );
}

/** In the message box's settings: Swarm, and what it is now; opens the same dialog. */
function SwarmOption({ s }: { s: SessionSummary }) {
  if (!canLead(s)) return null;
  const mode = swarmMode(s.extra);
  return <SettingChip label="Swarm" icon={<Users size={14} />} value={mode === 'campaign' ? 'Campaign' : mode ? 'On' : 'Off'} on={!!mode} onClick={() => useSwarmDialog.setState({ key: s.key })} />;
}

function SwarmDialog({ s }: { s: SessionSummary }) {
  const open = useSwarmDialog((x) => x.key === s.key);
  const size = useChildSettingsState()?.swarmSize;
  const mode = swarmMode(s.extra);
  const close = () => useSwarmDialog.setState({ key: null });
  const set = (swarm: true | 'campaign' | undefined) => {
    close();
    if ((swarm === 'campaign' ? 'campaign' : swarm ? 'swarm' : null) === mode) return;
    // A swarm and a deep research both lead child sessions: one or the other.
    patch(`/api/sessions/${enc(s.key)}/extra`, swarm ? { swarm, research: null } : { swarm: null })
      .then(() => toast(swarm === 'campaign' ? 'Campaign from your next message' : swarm ? 'Swarm from your next message' : 'One agent from your next message'))
      .catch(toastError);
  };
  return (
    <Dialog open={open} onClose={close} title="Swarm" width={400}>
      <div className="-mx-2">
        <SwarmChoices mode={mode} size={size} set={set} />
      </div>
      <p className="mt-2 text-[12.5px] leading-snug text-fg-3">
        A lead agent shares the work out and checks it; it costs several times what one agent does. A change takes effect from your next message, and the conversation carries on.
      </p>
    </Dialog>
  );
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
        <SwarmChoices mode={mode} size={size} set={set} />
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
  SessionMenu: SwarmMenuItem,
  SessionOptions: SwarmOption,
  sessionMenuPart: 'settings',
  StartOptions: SwarmStartOption,
};

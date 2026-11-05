// A session's menu (the … in its header). What you do most is on its main list; the rest is in three
// submenus that open in its place: Folder and code, Session settings and More. Features add their items
// through the registry, each saying which part they go in.
import { useState, type ReactNode, type RefObject } from 'react';
import { AlarmClock, Archive, ArrowRightLeft, CheckCheck, CircleEllipsis, Copy, FileDiff, FolderCode, FolderOpen, GitBranch, GitFork, GitPullRequest, Link2, Pencil, Pin, Shrink, SlidersHorizontal, Square, SquareTerminal, Target, Trash2 } from 'lucide-react';
import type { Agent, SessionSummary } from '@shared/types';
import { isConfidential } from '@shared/confidential';
import { del, enc, post } from '../../lib/api';
import { activityOf, isBusy } from '../../lib/activity';
import { setFlags, settle } from '../../lib/flags';
import { go } from '../../lib/nav';
import { toast, toastError, useUI } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { useCatalog } from '../../components/AgentPickers';
import { MenuBack, MenuItem, MenuSep, Popover, useConfirm } from '../../components/ui';
import { FeatureMenuItems } from '../registry';
import { deleteDialog } from '../sessions/SessionList';
import { SnoozeItems } from '../sessions/SnoozeMenu';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { continueIn, handoffName } from './Composer';
import { GoalDialog } from './GoalBar';
import { ShareDialog } from './ShareDialog';
import { WorktreeDialog } from './WorktreeDialog';

type Submenu = 'snooze' | 'code' | 'settings' | 'more';
type Shown = 'worktree' | 'goal' | 'share';

interface Actions {
  anchor: RefObject<HTMLElement | null>;
  close: () => void;
  /** Opens one of the dialogs the menu keeps (they stay after it closes). */
  show: (d: Shown) => void;
  confirm: ReturnType<typeof useConfirm>[0];
  onRename: () => void;
  onFork: () => void;
  onPullRequest: () => void;
  /** Custom has a model to run (Settings → Models), so a conversation can continue there. */
  customReady: boolean;
}

export function SessionMenu({ s, anchor, open, onClose, onRename, onFork, onPullRequest }: { s: SessionSummary; anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; onRename: () => void; onFork: () => void; onPullRequest: () => void }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const hide = () => setShown(null);
  // Known before the menu opens, so its items don't shift as it loads.
  const customReady = !!useCatalog('acp', 'console')?.models.length;
  return (
    <>
      {open && <MenuBody s={s} anchor={anchor} close={onClose} show={setShown} confirm={confirm} onRename={onRename} onFork={onFork} onPullRequest={onPullRequest} customReady={customReady} />}
      {confirmNode}
      {s.worktree && <WorktreeDialog s={s} open={shown === 'worktree'} onClose={hide} />}
      <GoalDialog s={s} open={shown === 'goal'} onClose={hide} />
      <ShareDialog s={s} open={shown === 'share'} onClose={hide} />
    </>
  );
}

/** There only while the menu is open, so it opens at its main list each time. */
function MenuBody({ s, anchor, close, show, confirm, onRename, onFork, onPullRequest, customReady }: { s: SessionSummary } & Actions) {
  // A submenu in the main list's place; coming back slides the other way.
  const [at, setAt] = useState<{ sub: Submenu | null; back?: boolean }>({ sub: null });
  const enter = (sub: Submenu) => setAt({ sub });
  const back = () => setAt({ sub: null, back: true });
  const running = !!s.live && s.live.status !== 'exited';
  const working = running && isBusy(activityOf(s));
  // Custom (the app's own agent) forks and keeps goals like Claude Code and Codex; other ACP agents do not.
  const custom = s.agent === 'acp' && s.acpAgent === 'console';
  // A confidential session stays on this computer: no read-only link, no pull request, no other agent.
  const closed = isConfidential(s.extra);
  // Claude Code and Codex hand the conversation to each other, and to Custom once it has a model (a Codex
  // session open elsewhere is read-only here).
  const handsOff = !closed && (s.agent === 'claude' || (s.agent === 'codex' && (running || !s.external)));
  const targets: { agent: Agent; acp?: string }[] = handsOff ? [{ agent: s.agent === 'claude' ? 'codex' : 'claude' }, ...(customReady ? [{ agent: 'acp' as const, acp: 'console' }] : [])] : [];
  const resumeCmd = s.agent === 'claude' ? `cd ${s.cwd ?? '~'} && claude --resume ${s.id}` : `codex resume ${s.id}`;

  let items: ReactNode;
  if (at.sub === 'snooze')
    items = (
      <>
        <MenuBack onClick={back}>Snooze until later</MenuBack>
        <SnoozeItems s={s} heading={false} onDone={close} />
      </>
    );
  else if (at.sub === 'code')
    items = (
      <>
        <MenuBack onClick={back}>Folder and code</MenuBack>
        {s.cwd && (
          <>
            <MenuItem icon={<FileDiff size={15} />} onClick={() => (close(), go(`/review/${enc(s.key)}`))}>
              Review the changes
            </MenuItem>
            {(!closed || s.pr) && (
              <MenuItem icon={<GitPullRequest size={15} />} onClick={() => (close(), onPullRequest())}>
                {s.pr ? `Pull request #${s.pr.number}` : 'Open a pull request'}
              </MenuItem>
            )}
          </>
        )}
        {s.worktree && (
          <MenuItem icon={<GitBranch size={15} />} onClick={() => (close(), show('worktree'))}>
            Worktree: {s.worktree.branch}
          </MenuItem>
        )}
        {s.cwd && (
          <>
            <MenuSep />
            <MenuItem icon={<FolderOpen size={15} />} onClick={() => (close(), useUI.getState().set({ explorerRoot: s.cwd! }), go('/files'))}>
              Browse the folder
            </MenuItem>
            <MenuItem icon={<SquareTerminal size={15} />} onClick={() => (close(), openTerminalAt(s.cwd!))}>
              Open a terminal here
            </MenuItem>
          </>
        )}
      </>
    );
  else if (at.sub === 'settings')
    items = (
      <>
        <MenuBack onClick={back}>Session settings</MenuBack>
        <FeatureMenuItems s={s} close={close} part="settings" />
      </>
    );
  else if (at.sub === 'more')
    items = (
      <>
        <MenuBack onClick={back}>More</MenuBack>
        <FeatureMenuItems s={s} close={close} part="more" />
        <MenuSep />
        {!s.external && s.agent !== 'acp' && (
          <MenuItem
            icon={<Shrink size={15} />}
            onClick={async () => {
              close();
              const ok = await confirm({ title: 'Compact the conversation?', body: <>{agentName(s.agent)} replaces the history so far with a summary, which frees context for what comes next.</>, confirm: 'Compact' });
              if (ok) post(`/api/sessions/${enc(s.key)}/compact`).then(() => toast('Compacting the conversation…'), toastError);
            }}
          >
            Compact the conversation
          </MenuItem>
        )}
        <MenuItem
          icon={<Copy size={15} />}
          onClick={() => {
            close();
            navigator.clipboard.writeText(resumeCmd).then(() => toast('Copied the resume command', 'ok'));
          }}
        >
          Copy the CLI resume command
        </MenuItem>
        {running && !working && (
          <MenuItem icon={<Square size={13} />} onClick={() => (close(), post(`/api/sessions/${enc(s.key)}/stop`).catch(toastError))}>
            Stop the agent process
          </MenuItem>
        )}
      </>
    );
  else
    items = (
      <>
        <MenuItem icon={<Pencil size={15} />} onClick={() => (close(), onRename())}>
          Rename
        </MenuItem>
        <MenuItem icon={<Pin size={15} />} onClick={() => (close(), setFlags(s, { pinned: !s.pinned }))}>
          {s.pinned ? 'Unpin' : 'Pin to the top'}
        </MenuItem>
        {s.snoozedUntil ? (
          <SnoozeItems s={s} onDone={close} />
        ) : (
          <MenuItem icon={<AlarmClock size={15} />} submenu onClick={() => enter('snooze')}>
            Snooze
          </MenuItem>
        )}
        {!working && (
          <MenuItem
            icon={<CheckCheck size={15} />}
            onClick={async () => {
              close();
              await settle(s);
              // Finished work in a worktree: offer to clear the folder away too.
              if (s.worktree) show('worktree');
            }}
          >
            Settle: done for now
          </MenuItem>
        )}
        <MenuSep />
        {!s.external && (s.agent !== 'acp' || custom) && (
          <MenuItem icon={<GitFork size={15} />} onClick={() => (close(), onFork())}>
            Fork
          </MenuItem>
        )}
        {targets.map((t) => (
          <MenuItem key={t.agent} icon={<ArrowRightLeft size={15} />} onClick={() => (close(), continueIn(s.key, t.agent, t.acp))}>
            Continue in {handoffName(t.agent)}
          </MenuItem>
        ))}
        {!s.goal && !s.external && (s.agent !== 'acp' || custom) && (
          <MenuItem icon={<Target size={15} />} onClick={() => (close(), show('goal'))}>
            Set a goal
          </MenuItem>
        )}
        <FeatureMenuItems s={s} close={close} part="main" />
        {!closed && (
          <MenuItem icon={<Link2 size={15} />} onClick={() => (close(), show('share'))}>
            Share a read-only link
          </MenuItem>
        )}
        <MenuSep />
        {(s.cwd || s.worktree) && (
          <MenuItem icon={<FolderCode size={15} />} submenu onClick={() => enter('code')}>
            Folder and code
          </MenuItem>
        )}
        <MenuItem icon={<SlidersHorizontal size={15} />} submenu onClick={() => enter('settings')}>
          Session settings
        </MenuItem>
        <MenuItem icon={<CircleEllipsis size={15} />} submenu onClick={() => enter('more')}>
          More
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Archive size={15} />} onClick={() => (close(), setFlags(s, { archived: !s.archived }))}>
          {s.archived ? 'Unarchive' : 'Archive'}
        </MenuItem>
        <MenuItem
          danger
          icon={<Trash2 size={15} />}
          onClick={async () => {
            close();
            if (!(await confirm(deleteDialog(s)))) return;
            try {
              await del(`/api/sessions/${enc(s.key)}`);
              go('/');
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Delete session
        </MenuItem>
      </>
    );
  // Wider for the snooze times, as in the sidebar's menu.
  return (
    <Popover anchor={anchor} open onClose={close} align="end" width={at.sub === 'snooze' ? 290 : 260}>
      <div key={at.sub ?? 'main'}>
        {items}
      </div>
    </Popover>
  );
}

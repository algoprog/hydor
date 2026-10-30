import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlarmClock, Archive, CheckCheck, ChevronLeft, ChevronRight, Copy, FileDiff, FilePen, FilePlus2, FileText, FolderOpen, GitBranch, GitFork, GitPullRequest, Link2, MoreHorizontal, PanelRight, Pencil, Pin, Play, Shrink, Square, SquareTerminal, Target, Trash2, UserRound, X } from 'lucide-react';
import type { BackgroundTask, FileChange, SessionSummary, ToolItem } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { activityLabel, activityOf, canTakeOver, confirmResume, inBackground, isBusy, isWorking, takeoverDialog } from '../../lib/activity';
import { ago, basename, compact, dirname, money, prettyPath, tildify } from '../../lib/format';
import { go, openFile, openSession, sessionPath } from '../../lib/nav';
import { toast, toastError, useApp, useLive, useSessions, useTimeline, useUI, type DetailsTab } from '../../lib/store';
import { live as socket } from '../../lib/ws';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { DiffStat, DiffView } from '../../components/DiffView';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, Dots, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Tabs, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { NavButton } from '../layout/PageHeader';
import { InstructionsDialog, instructionName } from '../settings/Instructions';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { Composer } from './Composer';
import { Elapsed, SessionCtx, ToolRow } from './items';
import { taskKind, TaskLogDialog } from './TaskLog';
import { Timeline } from './Timeline';
import { LimitBanner } from '../usage/LimitReset';
import { setFlags, settle } from '../../lib/flags';
import { SnoozeItems } from '../sessions/SnoozeMenu';
import { WorktreeDialog } from './WorktreeDialog';
import { GoalDialog } from './GoalBar';
import { PrBadge, PullRequestDialog } from './PullRequest';
import { ShareDialog } from './ShareDialog';
import { noteOpened } from '../palette/CommandPalette';
import { FindBar } from './FindBar';

function StatusPill({ s }: { s: SessionSummary }) {
  const a = activityOf(s);
  let label = 'Stopped';
  let tone = 'text-fg-3';
  let dot = 'bg-fg-3/60';
  if (a) {
    const where = a.kind === 'external' ? ` in ${a.client}` : '';
    if (isBusy(a)) [label, tone, dot] = [a.status === 'starting' ? 'Starting' : `Working${where}`, 'text-busy', 'bg-busy'];
    else if (a.status === 'waiting') [label, tone, dot] = [`Needs you${where}`, 'text-warn', 'bg-warn'];
    else if (a.status === 'stopping') [label, tone, dot] = ['Stopping', 'text-fg-3', 'bg-fg-3'];
    else if (inBackground(a)) [label, tone, dot] = [`Working${where} · ${a.background} in background`, 'text-busy', 'bg-busy'];
    else [label, tone, dot] = a.kind === 'external' ? [`Open${where}`, 'text-fg-2', 'bg-fg-3'] : ['Ready', 'text-ok', 'bg-ok'];
  }
  return (
    <span title={a ? activityLabel(a) : 'Not running'} className={cx('inline-flex h-5.5 max-w-[60%] min-w-0 shrink-0 items-center gap-1.5 rounded-full bg-bg-2 px-2 text-[12px] font-medium', tone)}>
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', dot, isWorking(a) && 'breathe')} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function Header({ s, detailsOpen, onDetails, onFork }: { s: SessionSummary; detailsOpen: boolean; onDetails: () => void; onFork: () => void }) {
  const home = useApp((x) => x.boot?.home);
  const cat = useCatalog(s.agent);
  const mobile = useIsMobile();
  const [menu, setMenu] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // The added account it runs as (Settings → Accounts), by name.
  const accountName = useApp((x) => (s.account ? x.boot?.accounts?.find((a) => a.id === s.account)?.name : undefined));
  const [prOpen, setPrOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [instructions, setInstructions] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(s.title);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const a = activityOf(s);
  const running = !!s.live && s.live.status !== 'exited';
  const working = running && isBusy(a);
  const elsewhere = a?.kind === 'external';
  const st = s.stats;

  const rename = async () => {
    setRenaming(false);
    if (title.trim() && title.trim() !== s.title) await post(`/api/sessions/${enc(s.key)}/rename`, { title: title.trim() }).catch(toastError);
  };
  const resumeCmd = s.agent === 'claude' ? `cd ${s.cwd ?? '~'} && claude --resume ${s.id}` : `codex resume ${s.id}`;
  const model = s.live?.model ?? s.model;

  let action: ReactNode = null;
  if (elsewhere) {
    if (canTakeOver(s))
      action = (
        <Button size="sm" variant="secondary" icon={<Play size={14} />} title={`End it in ${s.external?.client} and continue here`} onClick={async () => (await confirm(takeoverDialog(s))) && post(`/api/sessions/${enc(s.key)}/takeover`).catch(toastError)}>
          <span className="hidden sm:inline">Continue here</span>
        </Button>
      );
  } else if (working) {
    action = (
      <Button size="sm" variant="secondary" icon={<Square size={11} fill="currentColor" strokeWidth={0} />} onClick={() => post(`/api/sessions/${enc(s.key)}/interrupt`).catch(toastError)} title="Stop the current turn (Esc)">
        <span className="hidden sm:inline">Stop</span>
      </Button>
    );
  } else if (!running) {
    action = (
      <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={async () => (await confirmResume(s)) && post(`/api/sessions/${enc(s.key)}/start`).catch(toastError)}>
        <span className="hidden sm:inline">Resume</span>
      </Button>
    );
  }

  return (
    <header className="shrink-0 border-b border-line pt-[var(--safe-top)]">
      <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-5">
        <NavButton />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <AgentIcon agent={s.agent} name={s.acpName} size={16} />
            {renaming ? (
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={rename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                className="h-7 min-w-0 flex-1 rounded-lg border border-accent/60 bg-bg-1 px-2 text-[15px] font-semibold outline-none"
              />
            ) : (
              <button onDoubleClick={() => (setTitle(s.title), setRenaming(true))} className="min-w-0 truncate text-left text-[15px] font-semibold tracking-tight" title={`${s.title} (double-click to rename)`}>
                {s.title}
              </button>
            )}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-3">
            <StatusPill s={s} />
            {s.cwd && (
              <button className="min-w-0 truncate hover:text-fg" onClick={() => (useUI.getState().set({ explorerRoot: s.cwd! }), go('/files'))} title={s.cwd}>
                {tildify(s.cwd, home)}
              </button>
            )}
            {!mobile && s.gitBranch && s.gitBranch !== 'HEAD' && (
              <span className="flex shrink-0 items-center gap-1">
                · <GitBranch size={12} /> {s.gitBranch}
              </span>
            )}
            {s.pr && <PrBadge pr={s.pr} onClick={() => setPrOpen(true)} />}
            {!mobile && model && <span className="shrink-0">· {modelLabel(cat, model)}</span>}
            {accountName && <span className="flex shrink-0 items-center gap-1">· <UserRound size={12} /> {accountName}</span>}
          </div>
        </div>
        {action}
        <Button
          size="sm"
          variant="ghost"
          className={cx('px-2.5', detailsOpen && 'bg-bg-2 text-fg')}
          onClick={onDetails}
          title="Changes, commands and session info"
          icon={<PanelRight size={16} />}
        >
          {!mobile && (st.linesAdded || st.linesRemoved ? <DiffStat added={st.linesAdded} removed={st.linesRemoved} compact className="text-[12px]" /> : <span>Details</span>)}
        </Button>
        <IconButton ref={menuRef} label="Session menu" onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal size={18} />
        </IconButton>
        <Popover anchor={menuRef} open={menu} onClose={() => (setMenu(false), setSnoozing(false))} align="end" width={250}>
          {snoozing ? (
            <>
              <SnoozeItems s={s} onDone={() => (setMenu(false), setSnoozing(false))} />
              <MenuSep />
              <MenuItem icon={<ChevronLeft size={15} />} onClick={() => setSnoozing(false)}>
                Back
              </MenuItem>
            </>
          ) : (
          <>
          <MenuItem icon={<Pencil size={15} />} onClick={() => (setMenu(false), setTitle(s.title), setRenaming(true))}>
            Rename
          </MenuItem>
          <MenuItem icon={<Pin size={15} />} onClick={() => (setMenu(false), setFlags(s, { pinned: !s.pinned }))}>
            {s.pinned ? 'Unpin' : 'Pin to the top'}
          </MenuItem>
          {s.snoozedUntil ? (
            <SnoozeItems s={s} onDone={() => setMenu(false)} />
          ) : (
            <MenuItem icon={<AlarmClock size={15} />} onClick={() => setSnoozing(true)}>
              Snooze…
            </MenuItem>
          )}
          {!working && (
            <MenuItem
              icon={<CheckCheck size={15} />}
              onClick={async () => {
                setMenu(false);
                await settle(s);
                // Finished work in a worktree: offer to clear the folder away too.
                if (s.worktree) setWorktreeOpen(true);
              }}
            >
              Settle: done for now
            </MenuItem>
          )}
          {s.worktree && (
            <MenuItem icon={<GitBranch size={15} />} onClick={() => (setMenu(false), setWorktreeOpen(true))}>
              Worktree: {s.worktree.branch}
            </MenuItem>
          )}
          {!s.goal && !s.external && s.agent !== 'acp' && (
            <MenuItem icon={<Target size={15} />} onClick={() => (setMenu(false), setGoalOpen(true))}>
              Set a goal…
            </MenuItem>
          )}
          {s.cwd && (
            <MenuItem icon={<GitPullRequest size={15} />} onClick={() => (setMenu(false), setPrOpen(true))}>
              {s.pr ? `Pull request #${s.pr.number}` : 'Open a pull request…'}
            </MenuItem>
          )}
          {s.cwd && (
            <MenuItem icon={<FileDiff size={15} />} onClick={() => (setMenu(false), go(`/review/${enc(s.key)}`))}>
              Review the changes
            </MenuItem>
          )}
          <MenuItem icon={<Link2 size={15} />} onClick={() => (setMenu(false), setShareOpen(true))}>
            Share a read-only link…
          </MenuItem>
          {running && !working && (
            <MenuItem icon={<Square size={13} />} onClick={() => (setMenu(false), post(`/api/sessions/${enc(s.key)}/stop`).catch(toastError))}>
              Stop the agent process
            </MenuItem>
          )}
          <MenuSep />
          {s.cwd && (
            <MenuItem icon={<FolderOpen size={15} />} onClick={() => (setMenu(false), useUI.getState().set({ explorerRoot: s.cwd! }), go('/files'))}>
              Browse the folder
            </MenuItem>
          )}
          {s.cwd && (
            <MenuItem icon={<SquareTerminal size={15} />} onClick={() => (setMenu(false), openTerminalAt(s.cwd!))}>
              Open a terminal here
            </MenuItem>
          )}
          {s.cwd && s.agent !== 'acp' && (
            <MenuItem icon={<FileText size={15} />} onClick={() => (setMenu(false), setInstructions(true))}>
              Edit {instructionName(s.agent)}
            </MenuItem>
          )}
          {!s.external && s.agent !== 'acp' && (
            <MenuItem icon={<GitFork size={15} />} onClick={() => (setMenu(false), onFork())}>
              Fork…
            </MenuItem>
          )}
          {!s.external && s.agent !== 'acp' && (
            <MenuItem
              icon={<Shrink size={15} />}
              onClick={async () => {
                setMenu(false);
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
              setMenu(false);
              navigator.clipboard.writeText(resumeCmd).then(() => toast('Copied the resume command', 'ok'));
            }}
          >
            Copy the CLI resume command
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<Archive size={15} />} onClick={() => (setMenu(false), setFlags(s, { archived: !s.archived }))}>
            {s.archived ? 'Unarchive' : 'Archive'}
          </MenuItem>
          <MenuItem
            danger
            icon={<Trash2 size={15} />}
            onClick={async () => {
              setMenu(false);
              const ok = await confirm({
                title: 'Delete this session?',
                body: <>The transcript is removed from disk ({agentName(s.agent, s.acpName)} history included), so it disappears from the CLI and VS Code too. This cannot be undone.</>,
                confirm: 'Delete',
                danger: true,
              });
              if (!ok) return;
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
          )}
        </Popover>
      </div>
      {confirmNode}
      {s.worktree && <WorktreeDialog s={s} open={worktreeOpen} onClose={() => setWorktreeOpen(false)} />}
      <GoalDialog s={s} open={goalOpen} onClose={() => setGoalOpen(false)} />
      {s.cwd && <PullRequestDialog s={s} open={prOpen} onClose={() => setPrOpen(false)} />}
      <ShareDialog s={s} open={shareOpen} onClose={() => setShareOpen(false)} />
      {s.cwd && <InstructionsDialog agent={s.agent} cwd={s.cwd} open={instructions} onClose={() => setInstructions(false)} />}
    </header>
  );
}

/** Branches the conversation: a new session with the history (all of it, or up to one reply) and a new message. */
function ForkDialog({ s, at, onClose }: { s: SessionSummary; at: { at?: string } | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(''), [at]);
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r = await post<{ key: string }>(`/api/sessions/${enc(s.key)}/fork`, { text, at: at?.at });
      onClose();
      openSession(r.key);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={!!at}
      onClose={onClose}
      title={at?.at ? 'Fork from this reply' : 'Fork this session'}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<GitFork size={14} />} onClick={go} disabled={!text.trim() || busy}>
            {busy ? <Dots /> : 'Fork'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">
        A new {agentName(s.agent)} session starts with this conversation{at?.at ? ' up to that reply' : ''}, then the message below. This session stays as it is.
      </p>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            go();
          }
        }}
        placeholder="What should the fork try instead?"
        className={cx(inputCls, 'h-28 resize-y py-2')}
      />
    </Dialog>
  );
}

/** A fork links back to where it branched off (a Codex fork shows only what came after). */
function ForkedFrom({ s }: { s: SessionSummary }) {
  const parent = useSessions((x) => (s.forkFrom ? x.byKey[s.forkFrom] : undefined));
  if (!s.forkFrom) return null;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-1.5 text-[12.5px] text-fg-3 sm:px-6">
      <GitFork size={13} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        Forked from <span className="text-fg-2">{parent?.title ?? 'another session'}</span>
        {s.agent === 'codex' && ', where the earlier conversation is'}
      </span>
      <button onClick={() => go(sessionPath(s.forkFrom!))} className="shrink-0 text-accent hover:underline">
        Open
      </button>
    </div>
  );
}

/** The conversation went on in another agent's session. */
function MovedOn({ s }: { s: SessionSummary }) {
  const next = useSessions((x) => (s.handoffTo ? x.byKey[s.handoffTo] : undefined));
  if (!s.handoffTo) return null;
  const agent = s.handoffTo.startsWith('codex:') ? 'codex' : 'claude';
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <AgentIcon agent={agent} size={14} />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        This conversation continued in {agentName(agent)}
        {next?.title ? <span className="text-fg"> · {next.title}</span> : null}
      </span>
      <button onClick={() => go(sessionPath(s.handoffTo!))} className="shrink-0 text-accent hover:underline">
        Open
      </button>
    </div>
  );
}

// ---- details panel ---------------------------------------------------------------------

interface FileGroup {
  path: string;
  added: number;
  removed: number;
  edits: { itemId: string; ts?: number; change: FileChange }[];
}

function ChangesList({ s, version }: { s: SessionSummary; version: number }) {
  const home = useApp((x) => x.boot?.home);
  const [files, setFiles] = useState<FileGroup[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const focus = useUI((x) => x.detailsFocus);
  // A file chip under a reply opens its diff here.
  useEffect(() => {
    if (!focus || !files) return;
    setOpen(focus);
    useUI.getState().set({ detailsFocus: null });
    requestAnimationFrame(() => document.getElementById(`chg-${focus}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [focus, files]);
  useEffect(() => {
    api<{ files: FileGroup[] }>(`/api/sessions/${enc(s.key)}/changes`)
      .then((r) => setFiles(r.files))
      .catch(toastError);
  }, [s.key, version]);
  if (!files) return <div className="flex justify-center py-12 text-fg-3"><Dots /></div>;
  if (!files.length) return <Empty icon={<FilePen size={20} />} title="No file changes">Files the agent edits show up here with their diffs.</Empty>;
  const total = files.reduce((a, f) => [a[0] + f.added, a[1] + f.removed], [0, 0]);
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-fg-3">
        {files.length} file{files.length > 1 ? 's' : ''} changed
        <DiffStat added={total[0]} removed={total[1]} compact />
      </div>
      <div className="space-y-1">
        {files.map((f) => {
          const rel = prettyPath(f.path, s.cwd, home);
          const created = f.edits[0]?.change.op === 'create';
          return (
            <div key={f.path} id={`chg-${f.path}`} className={cx('rounded-xl transition-colors', open === f.path && 'bg-bg-1 ring-1 ring-line')}>
              <button onClick={() => setOpen((o) => (o === f.path ? null : f.path))} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-bg-2" title={f.path}>
                {created ? <FilePlus2 size={15} className="shrink-0 text-add" /> : <FilePen size={15} className="shrink-0 text-fg-3" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-fg">{basename(f.path)}</span>
                  <span className="block truncate text-[12px] text-fg-3">{dirname(rel) === '.' || !rel.includes('/') ? 'in the session folder' : dirname(rel)}</span>
                </span>
                <DiffStat added={f.added} removed={f.removed} compact />
                <ChevronRight size={14} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open === f.path && 'rotate-90')} />
              </button>
              {open === f.path && (
                <div className="anim-expand space-y-2 px-2.5 pb-3">
                  <div className="flex items-center gap-2 pt-1 text-[12px] text-fg-3">
                    {f.edits.length} edit{f.edits.length > 1 ? 's' : ''}
                    <span className="flex-1" />
                    <Button size="sm" variant="ghost" icon={<FolderOpen size={14} />} onClick={() => openFile(f.path)}>
                      Open
                    </Button>
                  </div>
                  {f.edits.map((e, i) => (
                    <div key={i} className="overflow-hidden rounded-lg border border-line bg-bg">
                      {f.edits.length > 1 && (
                        <div className="flex items-center gap-2 border-b border-line px-2.5 py-1 text-[11.5px] text-fg-3">
                          Edit {i + 1}
                          <span className="flex-1" />
                          <DiffStat added={e.change.added} removed={e.change.removed} />
                        </div>
                      )}
                      <DiffView diff={e.change.diff ?? ''} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommandsList({ s, version }: { s: SessionSummary; version: number }) {
  const [list, setList] = useState<ToolItem[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'failed' | 'bg'>('all');
  useEffect(() => {
    api<{ commands: ToolItem[] }>(`/api/sessions/${enc(s.key)}/commands`)
      .then((r) => setList(r.commands))
      .catch(toastError);
  }, [s.key, version]);
  if (!list) return <div className="flex justify-center py-12 text-fg-3"><Dots /></div>;
  if (!list.length) return <Empty icon={<SquareTerminal size={20} />} title="No commands">Shell commands the agent runs show up here with their output.</Empty>;
  const failed = list.filter((c) => c.tool.status === 'error').length;
  const bg = list.filter((c) => c.tool.background).length;
  const shown = list.filter((c) => (filter === 'failed' ? c.tool.status === 'error' : filter === 'bg' ? c.tool.background : true));
  return (
    <div className="p-3">
      <div className="mb-2 px-1">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${list.length}` },
            { value: 'failed', label: `Failed ${failed}` },
            { value: 'bg', label: `Background ${bg}` },
          ]}
        />
      </div>
      <div className="space-y-0.5">
        {[...shown].reverse().map((c) => (
          <ToolRow key={c.id} item={c} sessionKey={s.key} />
        ))}
      </div>
    </div>
  );
}

const SOURCES: Record<string, string> = {
  'claude-vscode': 'VS Code',
  vscode: 'VS Code',
  cli: 'Terminal',
  'sdk-cli': 'This app or another SDK client',
  'sdk-ts': 'An SDK client',
  'sdk-py': 'An SDK client',
  exec: 'codex exec',
  subagent: 'A sub-agent',
  'claude-desktop': 'Claude desktop',
};

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2 text-[13px]">
      <dt className="w-28 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-fg">{children}</dd>
    </div>
  );
}

function InfoPanel({ s }: { s: SessionSummary }) {
  const home = useApp((x) => x.boot?.home);
  const cat = useCatalog(s.agent);
  const lv = useLive((x) => x.byKey[s.key]?.live) ?? s.live;
  const st = s.stats;
  const a = activityOf(s);
  // Tasks of a session open elsewhere are listed, not stoppable from here.
  const here = !!lv && lv.status !== 'exited';
  const tasks = (here ? lv.backgroundTasks : s.external?.backgroundTasks) ?? [];
  const [logTask, setLogTask] = useState<BackgroundTask | null>(null);
  const ctx = lv?.contextTokens && lv?.contextWindow ? Math.round((lv.contextTokens / lv.contextWindow) * 100) : null;
  const resumeCmd = s.agent === 'claude' ? `cd ${s.cwd ?? '~'} && claude --resume ${s.id}` : `codex resume ${s.id}`;
  return (
    <div className="px-5 py-3">
      <dl className="divide-y divide-line">
        <InfoRow label="Agent">{agentName(s.agent, s.acpName)}</InfoRow>
        <InfoRow label="Status">{a ? activityLabel(a) : 'Stopped'}</InfoRow>
        {s.cwd && (
          <InfoRow label="Folder">
            <button className="text-left font-mono text-[12.5px] hover:text-accent" onClick={() => (useUI.getState().set({ explorerRoot: s.cwd! }), go('/files'))}>
              {tildify(s.cwd, home)}
            </button>
          </InfoRow>
        )}
        {s.gitBranch && s.gitBranch !== 'HEAD' && <InfoRow label="Branch">{s.gitBranch}</InfoRow>}
        <InfoRow label="Model">
          {modelLabel(cat, lv?.model ?? s.model)}
          {(lv?.effort ?? s.prefs?.effort) && <span className="text-fg-3"> · {lv?.effort ?? s.prefs?.effort} effort</span>}
        </InfoRow>
        {ctx != null && <InfoRow label="Context">{ctx}% of {compact(lv!.contextWindow)} tokens</InfoRow>}
        <InfoRow label="Started">{s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</InfoRow>
        <InfoRow label="Last active">{ago(s.updatedAt) || '—'}</InfoRow>
        <InfoRow label="Activity">
          {st.userMessages} prompts · {st.turns} turns · {st.toolCalls.toLocaleString()} tool calls · {st.commands.toLocaleString()} commands
        </InfoRow>
        <InfoRow label="Tokens">
          <span title={`${st.tokensIn.toLocaleString()} fresh input · ${st.tokensCached.toLocaleString()} cached · ${st.tokensOut.toLocaleString()} output`}>
            {compact(st.tokensIn + st.tokensCached)} in ({compact(st.tokensCached)} cached) · {compact(st.tokensOut)} out
          </span>
        </InfoRow>
        {st.costUsd ? <InfoRow label="API cost">{money(st.costUsd)}</InfoRow> : null}
        {st.genMs && st.genMs > 0 ? (
          <InfoRow label="Output speed">
            <span title={`${st.tokensOut.toLocaleString()} output tokens over ${Math.round(st.genMs / 1000).toLocaleString()} s of reply generation${s.agent === 'codex' ? ' (per turn, includes tool runs)' : ''}`}>
              {Math.round(st.tokensOut / (st.genMs / 1000)).toLocaleString()} tok/s avg
            </span>
          </InfoRow>
        ) : null}
        {s.source && <InfoRow label="Started from">{SOURCES[s.source] ?? s.source}</InfoRow>}
      </dl>
      {tasks.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-[12.5px] font-medium text-fg-3">Background tasks</div>
          <div className="space-y-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl bg-bg-1 pr-2 transition-colors hover:bg-bg-2">
                <button className="min-w-0 flex-1 px-3 py-2 text-left" title="Show its output" onClick={() => setLogTask(t)}>
                  <span className="block truncate text-[13px]">{t.description}</span>
                  <span className="block text-[11.5px] text-fg-3">
                    {taskKind(t.kind)}
                    {t.startedAt ? (
                      <>
                        {' '}
                        · <Elapsed since={t.startedAt} />
                      </>
                    ) : null}
                  </span>
                </button>
                {here && (
                  <Button size="sm" variant="ghost" className="text-err" onClick={() => post(`/api/sessions/${enc(s.key)}/tasks/${enc(t.id)}/stop`).catch(toastError)}>
                    Stop
                  </Button>
                )}
              </div>
            ))}
          </div>
          {logTask && <TaskLogDialog sessionKey={s.key} task={logTask} canStop={here} onClose={() => setLogTask(null)} />}
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1.5 text-[12.5px] font-medium text-fg-3">Continue in a terminal</div>
        <div className="flex items-center gap-2 rounded-xl bg-bg-1 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px]" title={resumeCmd}>
            {resumeCmd}
          </code>
          <CopyButton text={resumeCmd} />
        </div>
        <div className="mt-2 flex items-center gap-2 px-1 text-[11.5px] text-fg-3">
          <span className="truncate font-mono">{s.id}</span>
          <CopyButton text={s.id} label="Copy session id" />
        </div>
      </div>
    </div>
  );
}

function Details({ s, version, onClose }: { s: SessionSummary; version: number; onClose: () => void }) {
  const tab = useUI((x) => x.detailsTab);
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex h-14 shrink-0 items-end gap-1 border-b border-line pt-[var(--safe-top)] pr-2 pl-2">
        <Tabs<DetailsTab>
          value={tab}
          onChange={(t) => useUI.getState().set({ detailsTab: t })}
          options={[
            { value: 'changes', label: 'Changes', count: s.stats.filesChanged },
            { value: 'commands', label: 'Commands', count: s.stats.commands },
            { value: 'info', label: 'Info' },
          ]}
        />
        <span className="flex-1" />
        <IconButton label="Close" className="mb-2" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'changes' && <ChangesList s={s} version={version} />}
        {tab === 'commands' && <CommandsList s={s} version={version} />}
        {tab === 'info' && <InfoPanel s={s} />}
      </div>
    </div>
  );
}

export function SessionView({ sessionKey }: { sessionKey: string }) {
  const s = useSessions((x) => x.byKey[sessionKey]);
  const lv = useLive((x) => x.byKey[sessionKey]);
  const tl = useTimeline((x) => x.byKey[sessionKey]);
  const savedDetails = useUI((x) => x.detailsOpen);
  const wide = useMediaQuery('(min-width: 1280px)');
  const mobile = useIsMobile();
  // Desktop remembers the panel; on a phone it opens only when asked.
  const [phoneDetails, setPhoneDetails] = useState(false);
  const detailsOpen = mobile ? phoneDetails : savedDetails;
  const setDetails = (v: boolean) => (mobile ? setPhoneDetails(v) : useUI.getState().set({ detailsOpen: v }));
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
    api<{ summary: SessionSummary | null; live: any; overlay: any }>(`/api/sessions/${enc(sessionKey)}`)
      .then((r) => {
        if (r.summary) useSessions.getState().upsert([r.summary]);
        useLive.getState().set(sessionKey, r.live, r.overlay);
      })
      .catch(() => setMissing(true));
    useTimeline.getState().load(sessionKey);
    const unsub = socket.sub(sessionKey);
    // After a reconnect, refetch what was missed.
    const off = socket.onStatus((up) => up && useTimeline.getState().load(sessionKey));
    return () => {
      unsub();
      off();
    };
  }, [sessionKey]);

  const summary = useMemo(() => {
    if (!s) return null;
    const liveState = lv?.live ?? s.live ?? null;
    return liveState !== s.live ? { ...s, live: liveState } : s;
  }, [s, lv?.live]);

  useEffect(() => noteOpened(sessionKey), [sessionKey]);
  const [forking, setForking] = useState<{ at?: string } | null>(null);

  // Ctrl+F finds in this session's messages (editors and terminals keep their own).
  const [finding, setFinding] = useState(false);
  useEffect(() => {
    setFinding(false);
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'f' && !(e.target as HTMLElement)?.closest?.('.cm-editor, .xterm')) {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sessionKey]);

  // Looking at a session that finished since you last did marks it read (on every device).
  const unread = !!summary && (summary.doneAt ?? 0) > (summary.seenAt ?? 0);
  useEffect(() => {
    if (!unread) return;
    const mark = () => document.visibilityState === 'visible' && post(`/api/sessions/${enc(sessionKey)}/seen`).catch(() => {});
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [unread, sessionKey]);

  if (missing && !s) return <Empty title="Session not found">It may have been deleted.</Empty>;
  if (!summary) return <div className="flex h-full items-center justify-center text-fg-3"><Dots /></div>;
  const close = () => setDetails(false);
  const openChanges = (path?: string) => {
    useUI.getState().set({ detailsTab: 'changes', detailsFocus: path ?? null });
    setDetails(true);
  };
  const version = tl?.total ?? 0;

  return (
    <SessionCtx.Provider value={{ sessionKey, cwd: summary.cwd, openChanges, fork: summary.external ? undefined : (at) => setForking({ at }) }}>
      <div className="flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <Header s={summary} detailsOpen={detailsOpen} onDetails={() => setDetails(!detailsOpen)} onFork={() => setForking({})} />
          <ForkedFrom s={summary} />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {finding && <FindBar sessionKey={sessionKey} onClose={() => setFinding(false)} />}
            <Timeline sessionKey={sessionKey} agent={summary.agent} live={summary.live ?? null} overlay={lv?.overlay} external={summary.external} />
          </div>
          <LimitBanner agent={summary.agent} account={summary.account} className="mx-3 mb-2 sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]" />
          <MovedOn s={summary} />
          <Composer s={summary} />
          <ForkDialog s={summary} at={forking} onClose={() => setForking(null)} />
        </div>
        {detailsOpen &&
          (wide ? (
            <aside className="anim-slide-left w-[400px] shrink-0 border-l border-line">
              <Details s={summary} version={version} onClose={close} />
            </aside>
          ) : (
            <div className="anim-overlay fixed inset-0 z-40 flex justify-end bg-black/35" onPointerDown={(e) => e.target === e.currentTarget && close()}>
              <div className="anim-slide-left h-full w-full max-w-[440px] border-l border-line shadow-lg">
                <Details s={summary} version={version} onClose={close} />
              </div>
            </div>
          ))}
      </div>
    </SessionCtx.Provider>
  );
}

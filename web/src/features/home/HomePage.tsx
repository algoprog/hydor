import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { ArrowUp, ChevronRight, CircleHelp, FileText, GitBranch, MonitorUp, Paperclip } from 'lucide-react';
import { startTour } from '../tour/Tour';
import type { Agent } from '@shared/types';
import { api, post } from '../../lib/api';
import { activityOf } from '../../lib/activity';
import { attachmentPayload, canCaptureScreen, captureScreen, readAttachments, releaseAttachments, type Attachment } from '../../lib/attachments';
import { MOD, timeAgo } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toast, toastError, useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker, nextMode, useCatalog } from '../../components/AgentPickers';
import { AttachmentList } from '../../components/Attachments';
import { FolderChip } from '../../components/FolderPicker';
import { cx, IconButton, useIsMobile } from '../../components/ui';
import { InstructionsDialog, instructionName } from '../settings/Instructions';
import { NavButton } from '../layout/PageHeader';
import { ActivityText, folderName, sortActive } from '../sessions/SessionList';
import { TodayStrip } from '../stats/StatsPage';
import { LimitBanner } from '../usage/LimitReset';
import { useComposerMenu } from '../../components/ComposerMenu';
import { AccountPicker } from './AccountPicker';
import { AgentPicker } from './AgentPicker';
import { machineId } from '../../lib/machine';

function lastAgent(): Agent {
  try {
    const a = localStorage.getItem('wa.lastAgent');
    return a === 'codex' ? 'codex' : a?.startsWith('acp:') ? 'acp' : 'claude';
  } catch {
    return 'claude';
  }
}

/** Starts a session: pick the agent and folder, type the task, press Enter. */
/** A prompt link (/?prompt=…&agent=…&model=…&cwd=…) fills the box; it never starts anything by itself. */
function fromLink(search: string): { prompt?: string; agent?: Agent; model?: string; stripped: boolean } {
  const q = new URLSearchParams(search);
  const raw = q.get('prompt') ?? undefined;
  // Zero-width and direction-control characters can hide text from you but not from the agent.
  const prompt = raw?.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '');
  const agent = q.get('agent');
  return { prompt, agent: agent === 'claude' || agent === 'codex' ? agent : undefined, model: q.get('model') ?? undefined, stripped: !!raw && raw !== prompt };
}

function StartComposer({ initialCwd, link }: { initialCwd?: string; link?: ReturnType<typeof fromLink> }) {
  const boot = useApp((s) => s.boot);
  const explorerRoot = useUI((s) => s.explorerRoot);
  const mobile = useIsMobile();
  const [agent, setAgent] = useState<Agent>(() => link?.agent ?? lastAgent());
  // An ACP agent (Settings → More agents) when agent is 'acp'.
  const [acpId, setAcpId] = useState<string | null>(() => {
    try {
      const a = localStorage.getItem('wa.lastAgent');
      return a?.startsWith('acp:') ? a.slice(4) : null;
    } catch {
      return null;
    }
  });
  const acpList = useApp((s) => s.boot?.acpAgents);
  const cat = useCatalog(agent, acpId ?? undefined);
  const [cwd, setCwd] = useState('');
  const [instructions, setInstructions] = useState(false);
  const [text, setText] = useState(link?.prompt ?? '');
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  // In a git repository the session can get a worktree of its own: a branch and folder for this task.
  const [repo, setRepo] = useState<{ repo: string; branch: string } | null>(null);
  const [worktree, setWorktree] = useState(false);
  // Accounts added for this agent (Settings → Accounts); '' is the CLI's own sign-in.
  const allAccounts = useApp((s) => s.boot?.accounts);
  const accounts = useMemo(() => (allAccounts ?? []).filter((a) => a.agent === agent), [allAccounts, agent]);
  const [account, setAccount] = useState('');
  useEffect(() => {
    setRepo(null);
    if (!cwd) return;
    let alive = true;
    api<{ info: { repo: string; branch: string } | null }>(`/api/git/repo-info?path=${encodeURIComponent(cwd)}`)
      .then((r) => alive && setRepo(r.info))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cwd]);
  const ta = useRef<HTMLTextAreaElement>(null);
  const menu = useComposerMenu({ ta, setText, root: cwd || undefined, commands: cat?.commands });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialCwd) setCwd(initialCwd);
    else if (!cwd && boot) setCwd(explorerRoot ?? boot.defaultCwd);
  }, [initialCwd, boot, explorerRoot]);

  // A new agent starts from what it was last used with, or from the model just picked for it.
  const picked = useRef<{ agent: Agent; model: string | null } | null>(link?.model ? { agent: link.agent ?? lastAgent(), model: link.model } : null);
  useEffect(() => {
    const p = cat?.prefs ?? {};
    const pick = picked.current?.agent === agent ? picked.current : null;
    setModel(pick ? pick.model : (p.model ?? (agent === 'codex' ? (cat?.models.find((m) => m.isDefault)?.value ?? null) : null)));
    setEffort(p.effort ?? null);
    setMode(p.mode ?? cat?.defaultMode ?? null);
    setAccount(p.account ?? '');
  }, [agent, cat]);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 84), Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  const attach = async (files: FileList | File[]) => {
    const list = await readAttachments(files, atts);
    if (list.length) setAtts((l) => [...l, ...list]);
  };

  const start = async () => {
    if (busy || !cwd) return;
    setBusy(true);
    try {
      try {
        localStorage.setItem('wa.lastAgent', agent === 'acp' ? `acp:${acpId}` : agent);
      } catch {}
      const acct = accounts.some((a) => a.id === account) ? account : undefined;
      const r = await post<{ key: string }>('/api/sessions', {
        agent,
        acpAgent: agent === 'acp' ? acpId : undefined,
        cwd,
        prompt: text.trim(),
        model,
        effort: agent === 'acp' ? undefined : effort,
        mode,
        account: acct,
        worktree: !!repo && worktree,
        ...attachmentPayload(atts),
      });
      releaseAttachments(atts);
      setAtts([]);
      setText('');
      openSession(r.key);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const ready = !!cwd && !busy;
  return (
    <div>
      <div data-tour="start-bar" className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <AgentPicker
            agent={agent}
            acpId={acpId}
            acpList={acpList ?? []}
            onPick={(a, id) => {
              picked.current = null;
              setAcpId(id);
              setAgent(a);
            }}
          />
        </div>
        {cwd && (
          <div className="flex min-w-0 items-center gap-0.5">
            {accounts.length > 0 && agent !== 'acp' && <AccountPicker agent={agent} accounts={accounts} value={accounts.some((a) => a.id === account) ? account : ''} onChange={setAccount} />}
            {agent !== 'acp' && (
            <button
              type="button"
              onClick={() => setInstructions(true)}
              title={`Edit the ${instructionName(agent)} ${agent === 'claude' ? 'Claude Code' : 'Codex'} reads in this folder`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
            >
              <FileText size={14} className="text-fg-3" />
              {instructionName(agent)}
            </button>
            )}
            {repo && (
              <button
                type="button"
                onClick={() => setWorktree((w) => !w)}
                aria-pressed={worktree}
                title={worktree ? `A new branch and folder from ${repo.branch}, just for this session` : `Work in a new worktree: a branch and folder of its own, from ${repo.branch}`}
                className={cx(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors',
                  worktree ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
                )}
              >
                <GitBranch size={14} className={worktree ? undefined : 'text-fg-3'} />
                {worktree ? 'New worktree' : 'Worktree'}
              </button>
            )}
            <FolderChip value={cwd} onChange={setCwd} />
          </div>
        )}
      </div>
      {cwd && <InstructionsDialog agent={agent} cwd={cwd} open={instructions} onClose={() => setInstructions(false)} />}
      <LimitBanner agent={agent} account={accounts.some((a) => a.id === account) ? account : undefined} className="mb-3" />
      <div
        data-tour="composer"
        className="relative rounded-[22px] border border-line-2 bg-panel shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-colors focus-within:border-accent/50"
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          attach(e.dataTransfer.files);
        }}
      >
        {menu.node}
        <AttachmentList
          items={atts}
          onRemove={(a) => {
            releaseAttachments([a]);
            setAtts((l) => l.filter((x) => x !== a));
          }}
          className="px-4 pt-4"
        />
        <textarea
          ref={ta}
          value={text}
          autoFocus={!mobile}
          autoComplete="off"
          data-1p-ignore=""
          data-lpignore="true"
          onChange={(e) => {
            setText(e.target.value);
            menu.update();
          }}
          onClick={menu.update}
          onKeyUp={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') && menu.update()}
          onKeyDown={(e) => {
            if (menu.onKeyDown(e)) return;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (!mobile || e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              start();
            } else if (e.key === 'Tab' && e.shiftKey) {
              e.preventDefault();
              const m = nextMode(cat, mode);
              if (m) setMode(m);
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (!files.length) return;
            e.preventDefault();
            attach(files);
          }}
          placeholder="Describe a task, ask a question, or paste an error…"
          className="block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[15.5px] leading-relaxed outline-none placeholder:text-fg-3 focus-visible:outline-none"
        />
        <div className="flex items-center gap-1 px-2.5 pb-2.5">
          <div data-tour="pickers" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <ModelPicker
              agent={agent}
              acp={acpId ?? undefined}
              value={model}
              agents={agent === 'acp' ? undefined : ['claude', 'codex']}
              onChange={(v, a) => {
                if (a === agent) return setModel(v);
                picked.current = { agent: a, model: v };
                setAgent(a);
              }}
            />
            <EffortPicker agent={agent} acp={acpId ?? undefined} model={model} value={effort} onChange={setEffort} />
            <ModePicker agent={agent} acp={acpId ?? undefined} value={mode} onChange={setMode} />
          </div>
          {canCaptureScreen() && (
            <button
              className="shrink-0 rounded-lg p-2 text-fg-3 hover:bg-bg-2 hover:text-fg"
              onClick={async () => {
                const f = await captureScreen();
                if (f) attach([f]);
              }}
              title="Attach a screenshot of a screen, window or tab"
              aria-label="Attach a screenshot"
            >
              <MonitorUp size={17} />
            </button>
          )}
          <button className="shrink-0 rounded-lg p-2 text-fg-3 hover:bg-bg-2 hover:text-fg" onClick={() => fileRef.current?.click()} title="Attach files" aria-label="Attach files">
            <Paperclip size={17} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              if (e.target.files) await attach(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            onClick={start}
            disabled={!ready}
            title={`Start (Enter)`}
            aria-label="Start"
            className={cx(
              // A round arrow on phones, so the pickers beside it keep their labels.
              'group ml-0.5 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full pr-3 pl-3.5 text-[13.5px] font-medium transition duration-150 active:scale-95 max-md:w-9 max-md:px-0',
              ready ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-bg-3 text-fg-3',
            )}
          >
            <span className="max-md:hidden">{busy ? 'Starting…' : 'Start'}</span>
            <span className={cx('ico', ready && 'ico-rise')}>
              <ArrowUp size={16} strokeWidth={2.4} />
            </span>
          </button>
        </div>
      </div>
      {!mobile && (
        <div className="mt-2.5 text-center text-[12px] text-fg-3">
          Enter to start · Shift+Enter for a new line · Shift+Tab switches mode · {MOD}K finds a session
        </div>
      )}
    </div>
  );
}

/** Phones have no sidebar on screen: the latest sessions sit under the composer. */
function RecentSessions() {
  const { byKey, order } = useSessions();
  const home = useApp((s) => s.boot?.home);
  const all = order.map((k) => byKey[k]).filter((s) => s && !s.archived);
  const list = [...sortActive(all.filter((s) => activityOf(s))), ...all.filter((s) => !activityOf(s))].slice(0, 6);
  if (!list.length) return null;
  return (
    <div className="mt-10">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-fg-3">Recent</h2>
        <button className="flex items-center gap-0.5 text-[13px] text-fg-3 hover:text-fg" onClick={() => useUI.getState().set({ drawerOpen: true })}>
          All sessions <ChevronRight size={14} />
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        {list.map((s) => (
          <button key={s.key} onClick={() => openSession(s.key)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0 active:bg-bg-2">
            <AgentIcon agent={s.agent} name={s.acpName} size={16} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px]">{s.title}</span>
              <span className="mt-0.5 flex text-[12.5px] text-fg-3">
                {activityOf(s) ? <ActivityText s={s} /> : <span className="truncate">{folderName(s.cwd, home)} · {timeAgo(s.updatedAt)}</span>}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-fg-3" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const mobile = useIsMobile();
  const host = useApp((s) => s.boot?.host);
  const search = useSearch();
  const initialCwd = new URLSearchParams(search).get('cwd') ?? undefined;
  const link = useMemo(() => fromLink(search), [search]);
  useEffect(() => {
    if (link.stripped) toast('Invisible characters were removed from the linked prompt', 'error');
  }, [link]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center px-3 pt-[var(--safe-top)] sm:px-6">
        <NavButton />
        <span className="flex-1" />
        {/* Desktop has the ? in the bottom-right corner. */}
        {mobile && (
          <IconButton label="Take the tour" onClick={() => startTour()}>
            <CircleHelp size={19} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-12 sm:px-6">
          <div className={cx('anim-in text-center', mobile ? 'pt-3' : 'pt-[11vh]')}>
            <h1 className="text-[23px] font-semibold tracking-tight sm:text-[30px]">What should we work on?</h1>
            <p className="mt-1.5 text-[13.5px] text-fg-3 sm:mt-2 sm:text-[14.5px]">Start an agent in any folder on {machineId ? (host ?? 'this machine') : 'this machine'}: Claude Code, Codex, or any model.</p>
          </div>
          <div className="anim-in mt-6 [animation-delay:70ms] sm:mt-8">
            <StartComposer key={search} initialCwd={initialCwd} link={link} />
          </div>
          <div className="anim-in mt-5 flex justify-center [animation-delay:140ms] sm:mt-8">
            <TodayStrip />
          </div>
          {mobile && <RecentSessions />}
        </div>
      </div>
    </div>
  );
}

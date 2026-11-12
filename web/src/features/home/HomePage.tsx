import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { ArrowUp, ChevronRight, CircleHelp, GitBranch, MonitorUp, Paperclip, SlidersHorizontal } from 'lucide-react';
import { startTour } from '../tour/Tour';
import type { Agent, StartRun, StartSettings } from '@shared/types';
import type { SessionExtra } from '@shared/features';
import { usd } from '@shared/budget';
import { arenaOf } from '@shared/arena';
import { isConfidential } from '@shared/confidential';
import { AUTO_MODEL, tierProgram } from '@shared/tiers';
import { api } from '../../lib/api';
import { activityOf } from '../../lib/activity';
import { attachmentPayload, canCaptureScreen, captureScreen, readAttachments, releaseAttachments, type Attachment } from '../../lib/attachments';
import { keepStartDraft, startDraft } from '../../lib/drafts';
import { timeAgo } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { startSession, warmMemory } from '../../lib/starting';
import { agentKey, lastAgent, parseAgentKey, saveStart, startSettings } from '../../lib/start';
import { toast, useApp, useSessions, useUI } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { EffortPicker, findModel, modelLabel, ModelPicker, ModePicker, nextMode, useCatalog } from '../../components/AgentPickers';
import { AttachmentList } from '../../components/Attachments';
import { cx, IconButton, Popover, SettingChip, SettingLayout, SheetsOnPhone, Switch, useIsMobile } from '../../components/ui';
import { NavButton } from '../layout/PageHeader';
import { ActivityText, folderName, sortActive } from '../sessions/SessionList';
import { TodayStrip } from '../stats/StatsPage';
import { LimitBanner } from '../usage/LimitReset';
import { useComposerMenu } from '../../components/ComposerMenu';
import { AccountPicker } from './AccountPicker';
import { AgentPicker } from './AgentPicker';
import { ExploreButton } from './ExploreButton';
import { machineId } from '../../lib/machine';
import { FeatureComposerButtons, FeatureStartOptions } from '../registry';
import { taskFolderFor, useAssistantDefaults, useTaskFolder, WorkFolderChip } from '../assistants/start';
import { useTeam, useTierMap } from '../assistants/agentsState';
import { NewSpaceDialog } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import type { Space } from '@shared/spaces';
import { doneStartFiles, waitingStartFiles } from '../../lib/startFiles';
import { useConfidentialInfo } from '../confidential/state';

/** Custom, the app's own agent (its ACP id is still "console"): the one a confidential session runs on. */
const CUSTOM = 'console';

/** Starts a session: pick the agent and folder, type the task, press Enter. */
/** A prompt link (/?prompt=…&agent=…&model=…&cwd=…&confidential=1) fills the box; it never starts anything by itself. */
function fromLink(search: string): { prompt?: string; agent?: Agent; model?: string; assistant?: string; confidential?: boolean; stripped: boolean } {
  const q = new URLSearchParams(search);
  const raw = q.get('prompt') ?? undefined;
  // Zero-width and direction-control characters can hide text from you but not from the agent.
  const prompt = raw?.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '');
  const agent = q.get('agent');
  // An assistant to start as, by its id (the App builder, for Describe it on the New template page).
  const assistant = q.get('assistant');
  return {
    prompt,
    agent: agent === 'claude' || agent === 'codex' ? agent : undefined,
    model: q.get('model') ?? undefined,
    ...(assistant && /^[\w-]{1,80}$/.test(assistant) ? { assistant } : {}),
    ...(q.get('confidential') === '1' ? { confidential: true } : {}),
    stripped: !!raw && raw !== prompt,
  };
}

/** The start options kept as picks for next time (lib/start.ts); the others are this task's alone, kept with what is written. */
const PICKS = new Set(['assistant', 'connections', 'memory', 'capUsd', 'space', 'confidential']);
const ownOptions = (x: SessionExtra): SessionExtra => Object.fromEntries(Object.entries(x).filter(([k]) => !PICKS.has(k)));

/** The folder picked last, as one value: its path, a new task folder, the space. */
const folderOf = (s: StartSettings) => JSON.stringify([s.cwd ?? null, s.task ?? null, s.space ?? null]);

/** The start page's quieter settings, behind one chip that names those changed ("Max effort · Plan"), else "Options". */
function MoreOptions({ changed, title, children }: { changed: string[]; title: string; children: ReactNode }) {
  const mobile = useIsMobile();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingChip
        ref={ref}
        label="Options"
        icon={<SlidersHorizontal size={14} />}
        value={changed.length ? changed.join(' · ') : 'Options'}
        title={title}
        open={open}
        onClick={() => setOpen((o) => !o)}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={290} align="end" title="Options">
        <SettingLayout.Provider value="row">{children}</SettingLayout.Provider>
        {!mobile && <div className="mx-1.5 mt-1 border-t border-line px-1 pt-2 pb-1 text-[11.5px] text-fg-3">Shift+Tab in the message box switches permissions</div>}
      </Popover>
    </>
  );
}

/**
 * The start page's message box. It opens with what was picked here last time (kept on the server, so on
 * any device): the agent with its model, effort and permissions, the folder, the assistant, memory and a
 * spending cap. One row under the box shows who does the work, where and as which assistant; the rest
 * wait under Options, whose chip names any of them set away from the usual. What is written, attached
 * and set for this task alone waits in the box while you are on other pages (lib/drafts.ts).
 */
function StartComposer({ initialCwd, link, from }: { initialCwd?: string; link?: ReturnType<typeof fromLink>; from: string }) {
  const mobile = useIsMobile();
  const [saved] = useState(() => startSettings());
  // The box as it was left. A link's prompt takes its place, unless it was written from that link.
  const [{ draft, held }] = useState(() => {
    const d = startDraft();
    const ok = !!d && (!link?.prompt || d.from === from);
    return { draft: ok ? d : null, held: !!d && !ok };
  });
  // The folder a link opened the box in (?cwd=), or the draft's from one, while the folder picked last is the one it stood over.
  const [linkCwd, setLinkCwd] = useState(() => initialCwd ?? (draft?.folder?.over === folderOf(saved) ? draft.folder.cwd : undefined));
  const [linkOver] = useState(() => (initialCwd ? folderOf(saved) : (draft?.folder?.over ?? '')));
  const [first] = useState(() => (link?.agent ? { agent: link.agent, acp: null } : lastAgent()));
  const [agent, setAgent] = useState<Agent>(first.agent);
  // An ACP agent (Settings → More agents) when agent is 'acp'.
  const [acpId, setAcpId] = useState<string | null>(first.acp);
  const acpList = useApp((s) => s.boot?.acpAgents);
  const cat = useCatalog(agent, acpId ?? undefined);
  const [cwd, setCwd] = useState(() => linkCwd ?? saved.cwd ?? useUI.getState().explorerRoot ?? useApp.getState().boot?.defaultCwd ?? '');
  // Settings for the new session from the capabilities' start options (an assistant, memory off…).
  const [extra, setExtra] = useState<SessionExtra>(() => ({
    ...draft?.extra,
    ...(saved.memory === false ? { memory: false } : {}),
    ...(saved.capUsd ? { capUsd: saved.capUsd } : {}),
    ...(saved.confidential || link?.confidential ? { confidential: true as const } : {}),
    // The space picked last, while the folder is still its own.
    ...(saved.space && !linkCwd ? { space: saved.space } : {}),
    ...(link?.assistant ? { assistant: link.assistant } : {}),
  }));
  // Spaces: picked by name in the folder chip, each with its folder, assistant and guidelines.
  const spaces = useSpaces();
  const space = spaces?.find((s) => s.id === extra.space) ?? null;
  const [newSpace, setNewSpace] = useState(false);
  useEffect(() => {
    // A space deleted since it was picked: the folder stays, the space goes.
    if (spaces && extra.space && !space) setExtra((x) => ({ ...x, space: undefined }));
  }, [spaces, extra.space, space]);
  // A new task folder (Settings → Assistants) or the folder shown: as picked here, else as the assistant prefers (Coder works in projects).
  const [taskPick, setTaskPick] = useState<boolean | null>(() => (linkCwd ? false : (saved.task ?? null)));
  const folderPicked = useRef(!!linkCwd);
  const task = useTaskFolder(typeof extra.assistant === 'string' ? extra.assistant : undefined, taskPick);
  const [text, setText] = useState(() => (draft ? draft.text : (link?.prompt ?? '')));
  const [model, setModel] = useState<string | null>(null);
  const [effort, setEffort] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [atts, setAtts] = useState<Attachment[]>(() => draft?.files ?? []);

  // Kept as it changes, until the session starts. A link's prompt doesn't replace a draft written
  // elsewhere until something here changes.
  const own = JSON.stringify(ownOptions(extra));
  const opened = useRef(held ? { text, atts, own, linkCwd } : null);
  const sent = useRef(false);
  useEffect(() => {
    const o = opened.current;
    if (sent.current || (o && o.text === text && o.atts === atts && o.own === own && o.linkCwd === linkCwd)) return;
    opened.current = null;
    keepStartDraft({ text, files: atts, extra: JSON.parse(own), folder: linkCwd ? { cwd: linkCwd, over: linkOver } : undefined, from });
  }, [text, atts, own, linkCwd]);
  // In a git repository the session can get a worktree of its own: a branch and folder for this task.
  const [repo, setRepo] = useState<{ repo: string; branch: string } | null>(null);
  const [worktree, setWorktree] = useState(!!saved.worktree);
  // Accounts added for this agent (Settings → Accounts); '' is the CLI's own sign-in.
  const allAccounts = useApp((s) => s.boot?.accounts);
  const accounts = useMemo(() => (allAccounts ?? []).filter((a) => a.agent === agent), [allAccounts, agent]);
  const [account, setAccount] = useState('');
  const key = agentKey(agent, acpId);
  // Picks that land after the agent changes (an assistant's model and mode) belong to the new one.
  const keyNow = useRef(key);
  keyNow.current = key;
  const keepRun = (r: StartRun) => saveStart({ runs: { [keyNow.current]: r } });

  const chooseAgent = (a: Agent, id: string | null) => {
    setAcpId(id);
    setAgent(a);
    saveStart({ agent: agentKey(a, id) });
  };
  // The tour sets the agent to one of those picked there.
  useEffect(() => {
    const pick = (e: Event) => {
      const v = parseAgentKey(String((e as CustomEvent<string>).detail ?? ''));
      if (v) chooseAgent(v.agent, v.acp);
    };
    window.addEventListener('wa:agent', pick);
    return () => window.removeEventListener('wa:agent', pick);
  }, []);
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
  // Text from the capabilities' buttons (dictation) joins what is being written.
  const insertText = (t: string) => {
    if (!t) return;
    setText((cur) => (cur.trim() ? `${cur.replace(/\s*$/, '')} ${t}` : t));
    ta.current?.focus();
  };

  // Automatic: the tiers pick the model (Best's, and Max's if its agent steps up). Offered where the team is on and the
  // program has tiers (Custom once its Best names a model); a confidential session picks among this computer's models.
  const tiers = useTierMap();
  const team = useTeam();
  const prog = tierProgram(agent, acpId ?? undefined);
  const autoOn = !!team?.on && !!prog && !isConfidential(extra) && (prog !== 'console' || !!tiers?.console.best.model);
  // Each agent starts from what it last ran with here (else from its last session's), or from a link's model.
  const linked = useRef<{ agent: Agent; model: string } | null>(link?.model ? { agent: first.agent, model: link.model } : null);
  useEffect(() => {
    const r = startSettings().runs?.[key] ?? {};
    const p = cat?.prefs ?? {};
    const pick = linked.current?.agent === agent ? linked.current : null;
    if (pick && cat) linked.current = null;
    const last = pick ? pick.model : r.model !== undefined ? r.model : p.model;
    // No model picked (or the program's own default): Automatic where it is offered. Automatic kept from when it was: the default.
    const m = autoOn ? (last ?? AUTO_MODEL) : last === AUTO_MODEL ? null : last;
    // Codex's default must be named: unnamed, Codex takes config.toml's model, which a ChatGPT sign-in may not allow.
    setModel(m ?? (agent === 'codex' ? (cat?.models.find((x) => x.isDefault)?.value ?? null) : null));
    setEffort((r.effort !== undefined ? r.effort : p.effort) ?? null);
    const md = (r.mode !== undefined ? r.mode : p.mode) ?? null;
    setMode(md && (!cat || cat.modes.some((x) => x.value === md)) ? md : cat?.defaultMode || null);
    setAccount((r.account !== undefined ? r.account : p.account) ?? '');
  }, [agent, acpId, cat, autoOn]);
  // Confidential: Custom, with the best model on this computer (or the one picked, when it is one of them).
  const confidential = isConfidential(extra);
  const local = useConfidentialInfo();
  useEffect(() => {
    if (confidential && !(agent === 'acp' && acpId === CUSTOM)) chooseAgent('acp', CUSTOM);
  }, [confidential, agent, acpId]);
  useEffect(() => {
    if (!confidential || agent !== 'acp' || acpId !== CUSTOM || !cat || !local) return;
    const here = new Set(cat.models.filter((m) => m.local).map((m) => m.value));
    if (model && here.has(model)) return;
    const best = local.models.find((id) => here.has(id));
    if (best) (setModel(best), keepRun({ model: best }));
  }, [confidential, agent, acpId, cat, local, model]);
  // Picking an assistant sets the agent, model and mode it suggests (after the above, which it overrides).
  const pendingAcp = useRef<string | null>(null);
  useAssistantDefaults(typeof extra.assistant === 'string' ? extra.assistant : undefined, {
    agent,
    acpId,
    cat,
    setAgent: (a) => chooseAgent(a, a === 'acp' ? pendingAcp.current : null),
    setAcpId: (id) => void (pendingAcp.current = id),
    setModel: (m) => (setModel(m), keepRun({ model: m })),
    setMode: (m) => (setMode(m), keepRun({ mode: m })),
  });

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 84), Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);
  // What waited in the box (or a link's prompt) goes on from its end.
  useLayoutEffect(() => {
    const el = ta.current;
    if (el && document.activeElement === el) el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const attach = async (files: FileList | File[]) => {
    const list = await readAttachments(files, atts);
    if (list.length) setAtts((l) => [...l, ...list]);
  };
  // Files picked for a new session elsewhere (Files, a file's window, an agent's file card) join the box.
  useEffect(() => {
    const waiting = waitingStartFiles();
    if (!waiting.length) return;
    doneStartFiles();
    setAtts((l) => [...l, ...waiting.filter((w) => !l.some((a) => a.path === w.path))]);
    ta.current?.focus();
  }, []);

  const acct = accounts.some((a) => a.id === account) ? account : undefined;
  // The session's page opens at once, with your message, while the server starts the agent (lib/starting.ts).
  const starting = useRef(false);
  const start = () => {
    if (starting.current || !cwd || (confidential && local && !local.models.length)) return;
    starting.current = true;
    // Kept as it was used, the whole of it, for the next start.
    saveStart(
      {
        agent: key,
        runs: { [key]: { model, effort: agent === 'acp' ? undefined : effort, mode, account: acct ?? '' } },
        assistant: typeof extra.assistant === 'string' ? extra.assistant : undefined,
        task,
        cwd,
        space: space?.id ?? null,
        worktree,
        memory: extra.memory === false ? false : null,
        capUsd: typeof extra.capUsd === 'number' ? extra.capUsd : null,
        confidential: confidential ? true : null,
      },
      true,
    );
    const prompt = text.trim();
    const body = {
      agent,
      acpAgent: agent === 'acp' ? acpId : undefined,
      prompt,
      // The arena sets named models against each other: Automatic goes in as the model it would start on.
      model: model === AUTO_MODEL && arenaOf(extra) ? bestModel : model,
      effort: agent === 'acp' ? undefined : effort,
      mode,
      account: acct,
      worktree: !task && !!repo && worktree,
      ...(Object.keys(extra).length ? { extra } : {}),
      ...attachmentPayload(atts),
    };
    const inTask = task;
    // The box as it was sent: it gets it back should the session not start.
    const draft = { text, files: atts, extra: JSON.parse(own) as SessionExtra, folder: linkCwd ? { cwd: linkCwd, over: linkOver } : undefined, from };
    // What was written went with the session (its pictures with it, still shown in your message).
    sent.current = true;
    keepStartDraft(null, false);
    startSession(
      {
        agent,
        acpName: agent === 'acp' ? acpList?.find((a) => a.id === acpId)?.name : undefined,
        title: prompt.slice(0, 300) || 'New session',
        text: prompt,
        atts,
        cwd: inTask ? '' : cwd,
      },
      async () => ({ ...body, cwd: inTask ? await taskFolderFor(prompt) : cwd }),
      draft,
    );
  };

  /** A space picked: its folder, its assistant, and its guidelines for the session (the server adds them). */
  const pickSpace = (sp: Space) => {
    folderPicked.current = true;
    setLinkCwd(undefined);
    setCwd(sp.folder);
    setTaskPick(false);
    setExtra((x) => ({ ...x, space: sp.id, ...(sp.assistant ? { assistant: sp.assistant } : {}) }));
    saveStart({ cwd: sp.folder, task: false, space: sp.id, ...(sp.assistant ? { assistant: sp.assistant } : {}) });
  };

  // A capability's start option changed (the assistant, memory, a spending cap, Confidential): kept for next time.
  const onExtra = (o: Partial<SessionExtra>) => {
    const before = extra.assistant;
    // Swarm, deep research and the arena reach the web or other models: turning one on turns Confidential off.
    const p = (o.swarm || o.research || arenaOf(o as SessionExtra)) && confidential ? { ...o, confidential: undefined } : o;
    setExtra((x) => ({ ...x, ...p }));
    if ('memory' in p) saveStart({ memory: p.memory === false ? false : null });
    if ('capUsd' in p) saveStart({ capUsd: typeof p.capUsd === 'number' ? p.capUsd : null });
    if ('confidential' in p) saveStart({ confidential: p.confidential ? true : null });
    // The assistant picked (not the one the page opened with): its kind of folder too, unless one was picked here.
    if (typeof p.assistant === 'string' && before !== undefined && p.assistant !== before) {
      saveStart({ assistant: p.assistant });
      if (!folderPicked.current) (setTaskPick(null), saveStart({ task: null }));
    }
  };

  // On Automatic the effort is the Best model's to pick from; what Automatic comes to, for its line in the model menu.
  const bestModel = prog ? (tiers?.[prog].best.model ?? null) : null;
  const maxModel = prog ? (tiers?.[prog].max.model ?? null) : null;
  const effortModel = model === AUTO_MODEL ? bestModel : model;
  const autoHint = !autoOn
    ? undefined
    : team?.hard && maxModel && maxModel !== bestModel
      ? `${modelLabel(cat, bestModel)}, or ${modelLabel(cat, maxModel)} if the problem proves too hard`
      : modelLabel(cat, bestModel);
  // What the Options chip names: the settings under it that are not as usual.
  const levels = findModel(cat, effortModel)?.efforts ?? [];
  const effortOn = agent !== 'acp' && !!effort && (!cat || levels.length > 0) ? effort[0].toUpperCase() + effort.slice(1) : null;
  const modeOn = cat && mode && mode !== cat.defaultMode ? (cat.modes.find((m) => m.value === mode)?.label ?? null) : null;
  const acctOn = acct ? (accounts.find((a) => a.id === acct)?.name ?? null) : null;
  const capOn = typeof extra.capUsd === 'number' ? usd(extra.capUsd) : null;
  const changed = [confidential ? 'Confidential' : null, extra.swarm === true ? 'Swarm' : extra.swarm === 'campaign' ? 'Campaign' : null, extra.research ? 'Deep research' : null, arenaOf(extra) ? 'Arena' : null, effortOn && `${effortOn} effort`, modeOn, acctOn, extra.memory === false ? 'No memory' : null, capOn && `${capOn} cap`].filter((x): x is string => !!x);
  const modeNow = cat?.modes.find((m) => m.value === (mode ?? cat.defaultMode))?.label;
  // Whole lines where a word is a setting's state ("Memory: on"), so each translates as one.
  const optionsTitle = [
    confidential ? 'Confidential: on' : 'Confidential: off',
    agent !== 'acp' && (effortOn ? `Effort: ${effortOn}` : 'Effort: default'),
    modeNow && `Permissions: ${modeNow}`,
    acctOn && `Account: ${acctOn}`,
    extra.memory === false ? 'Memory: off' : 'Memory: on',
    capOn ? `Spending cap: ${capOn}` : 'Spending cap: none',
    extra.swarm === true ? 'Swarm: on' : extra.swarm === 'campaign' ? 'Swarm: campaign' : 'Swarm: off',
    extra.research ? 'Deep research: on' : 'Deep research: off',
    arenaOf(extra) ? 'Arena: on' : 'Arena: off',
  ]
    .filter(Boolean)
    .join('\n');

  // Confidential with no model on this computer can't start: its option says how to get one.
  const ready = !!cwd && !(confidential && local && !local.models.length);
  const iconBtn = 'shrink-0 rounded-lg p-2 text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg';
  return (
    <div>
      <NewSpaceDialog open={newSpace} onClose={() => setNewSpace(false)} onMade={pickSpace} />
      <LimitBanner agent={agent} account={acct} className="mb-3" />
      <div
        data-tour="composer"
        className={cx(
          'relative rounded-[22px] border bg-panel shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-colors',
          // Confidential: a calm tint, as in its session.
          confidential ? 'border-ok/45 focus-within:border-ok/70' : 'border-line-2 focus-within:border-accent/50',
        )}
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
          onFocus={warmMemory}
          onChange={(e) => {
            setText(e.target.value);
            menu.update();
            warmMemory();
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
              if (m) (setMode(m), keepRun({ mode: m }));
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
        <div className="flex items-center gap-0.5 px-2.5 pb-2.5">
          <button className={iconBtn} onClick={() => fileRef.current?.click()} title="Attach files" aria-label="Attach files">
            <Paperclip size={17} />
          </button>
          {canCaptureScreen() && (
            <button
              className={iconBtn}
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
          <FeatureComposerButtons insert={insertText} confidential={confidential} />
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
          <span className="flex-1" />
          <button
            onClick={start}
            disabled={!ready}
            title="Start (Enter)"
            aria-label="Start"
            className={cx(
              // A round arrow on phones.
              'group inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full pr-3 pl-3.5 text-[13.5px] font-medium transition duration-150 active:scale-95 max-md:w-9 max-md:px-0',
              ready ? 'bg-accent text-accent-fg' : 'bg-bg-3 text-fg-3',
              ready && 'hover:opacity-90',
            )}
          >
            <span className="max-md:hidden">Start</span>
            <span className={cx('ico', ready && 'ico-rise')}>
              <ArrowUp size={16} strokeWidth={2.4} />
            </span>
          </button>
        </div>
        {/* Who does the work, where and as which assistant; the rest under Options. Each opens from the bottom on a phone. */}
        <SettingLayout.Provider value="bare">
          <SheetsOnPhone.Provider value>
            <div data-tour="start-bar" className="flex flex-wrap items-center gap-0.5 rounded-b-[21px] border-t border-line bg-bg-1/70 px-2 py-1.5">
              <AgentPicker label="Runs on" agent={agent} acpId={acpId} acpList={acpList ?? []} onPick={chooseAgent} localOnly={confidential} />
              <ModelPicker label="Model" agent={agent} acp={acpId ?? undefined} value={model} onChange={(v) => (setModel(v), keepRun({ model: v }))} localOnly={confidential} auto={autoHint} />
              <WorkFolderChip
                value={cwd}
                task={task}
                note={!task && repo && worktree ? 'new worktree' : undefined}
                onFolder={(p) => {
                  folderPicked.current = true;
                  setLinkCwd(undefined);
                  setCwd(p);
                  setTaskPick(false);
                  setExtra((x) => ({ ...x, space: undefined }));
                  saveStart({ cwd: p, task: false, space: null });
                }}
                onTask={() => {
                  folderPicked.current = true;
                  setLinkCwd(undefined);
                  setTaskPick(true);
                  setExtra((x) => ({ ...x, space: undefined }));
                  saveStart({ task: true, space: null });
                }}
                space={space}
                spaces={spaces ?? []}
                onSpace={pickSpace}
                onNewSpace={() => setNewSpace(true)}
              >
                {!task && repo && (
                  <label
                    title={`A branch and folder of its own, from ${repo.branch}`}
                    className="flex h-8.5 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 hover:bg-bg-2 max-sm:h-11"
                  >
                    <GitBranch size={15} className="shrink-0 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                      New worktree <span className="text-[12px] text-fg-3">from {repo.branch}</span>
                    </span>
                    <Switch on={worktree} label="Work in a new worktree" onChange={(v) => (setWorktree(v), saveStart({ worktree: v }))} />
                  </label>
                )}
              </WorkFolderChip>
              <FeatureStartOptions part="lead" value={extra} cwd={cwd} onChange={onExtra} />
              <span data-tour="pickers" className="ml-auto flex min-w-0">
                <MoreOptions changed={changed} title={optionsTitle}>
                  <EffortPicker label="Effort" agent={agent} acp={acpId ?? undefined} model={effortModel} value={effort} onChange={(v) => (setEffort(v), keepRun({ effort: v }))} />
                  <ModePicker label="Permissions" agent={agent} acp={acpId ?? undefined} value={mode} onChange={(v) => (setMode(v), keepRun({ mode: v }))} />
                  {accounts.length > 0 && agent !== 'acp' && <AccountPicker agent={agent} accounts={accounts} value={acct ?? ''} onChange={(id) => (setAccount(id), keepRun({ account: id }))} />}
                  <FeatureStartOptions part="rest" value={extra} cwd={cwd} onChange={onExtra} />
                </MoreOptions>
              </span>
            </div>
          </SheetsOnPhone.Provider>
        </SettingLayout.Provider>
      </div>
      {!mobile && (
        <div data-tour="home-hint" className="mt-2.5 text-center text-[12px] text-fg-3">
          Enter to start · Shift+Enter for a new line
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
    <div data-tour="recent" className="mt-10">
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
              <span translate="no" className="block truncate text-[14.5px]">
                {s.title}
              </span>
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
  const booted = useApp((s) => !!s.boot);
  const host = useApp((s) => s.boot?.host);
  const search = useSearch();
  const initialCwd = new URLSearchParams(search).get('cwd') ?? undefined;
  const link = useMemo(() => fromLink(search), [search]);
  useEffect(() => {
    if (link.stripped) toast('Invisible characters were removed from the linked prompt', 'error');
  }, [link]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div data-tour="home-top" className="flex h-14 shrink-0 items-center gap-1.5 px-3 pt-[var(--safe-top)] sm:px-6">
        <NavButton />
        <span className="flex-1" />
        {/* Explore: the magazine made for you, one click away. */}
        <ExploreButton />
        {/* Desktop has the ? in the bottom-right corner. */}
        {mobile && (
          <IconButton label="Take the tour" onClick={() => startTour()}>
            <CircleHelp size={19} />
          </IconButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[760px] px-4 pb-12 sm:px-6">
          {/* The tour's parts (data-tour) sit inside these, which have an entrance of their own. */}
          <div className={cx('text-center', mobile ? 'pt-3' : 'pt-[11vh]')}>
            <div data-tour="home-title">
              <h1 className="text-[23px] font-semibold tracking-tight sm:text-[30px]">What should we work on?</h1>
              <p className="mt-1.5 text-[13.5px] text-fg-3 sm:mt-2 sm:text-[14.5px]">Start an agent in any folder on {machineId ? (host ?? 'this machine') : 'this machine'}: Claude Code, Codex, or any model.</p>
            </div>
          </div>
          <div className="mt-6 sm:mt-8">
            {/* It opens with the last picks, which come with the bootstrap. */}
            {booted ? <StartComposer key={search} initialCwd={initialCwd} link={link} from={search} /> : <div className="h-[200px]" />}
          </div>
          <div className="mt-5 flex justify-center sm:mt-8">
            <div data-tour="today">
              <TodayStrip />
            </div>
          </div>
          {mobile && <RecentSessions />}
        </div>
      </div>
    </div>
  );
}

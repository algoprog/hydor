import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRightLeft, ArrowUp, ChevronDown, MonitorUp, Paperclip, Plus, SlidersHorizontal, Square, X } from 'lucide-react';
import type { Agent, SessionSummary } from '@shared/types';
import { childReplyOf } from '@shared/children';
import { isConfidential } from '@shared/confidential';
import { enc, lostOnTheWay, post } from '../../lib/api';
import { warmMemory } from '../../lib/starting';
import { openSession } from '../../lib/nav';
import { toast, toastError, useLive, useTimeline } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { EffortPicker, modelLabel, ModelPicker, ModePicker, nextMode, useCatalog } from '../../components/AgentPickers';
import { cx, MenuItem, Popover, SettingLayout, SheetsOnPhone, useConfirm } from '../../components/ui';
import { activityOf, confirmResume, inBackground, takeoverDialog } from '../../lib/activity';
import { attachmentPayload, canCaptureScreen, captureScreen, readAttachments, releaseAttachments, releaseSentPictures, sendingPictures, type Attachment } from '../../lib/attachments';
import { clearDraft, draftFiles, draftText, keepDraftFiles, keepDraftText } from '../../lib/drafts';
import { QUOTE_EVENT, quoteBlock } from './QuoteSelection';
import { AttachmentList } from '../../components/Attachments';
import { BlockedApproval } from './BlockedApproval';
import { SessionMeters } from './SessionMeters';
import { stopWords, taskKindOf } from '../../lib/work';
import { stopEverything } from './WorkRow';
import { WorkTray } from './WorkTray';
import { useComposerMenu } from '../../components/ComposerMenu';
import { QueueList } from './QueueList';
import { GoalBar } from './GoalBar';
import { LimitBanner } from '../usage/LimitReset';
import { FeatureComposerButtons, FeatureSessionOptions } from '../registry';
import { SessionAccount } from './SessionAccount';
import { SessionAssistantPicker, useSessionAssistant } from '../assistants/AssistantPicker';
import { putText } from '../../lib/featureEvents';

const HANDOFF_EVENT = 'wa:handoff';
/** The session menu's "Continue in Codex": session `key`'s message box sets its next message to go to `agent` (`acp`: Custom's "console"). */
export function continueIn(key: string, agent: Agent, acp?: string) {
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: { key, agent, acp } }));
}
/** Who a conversation moves to, by name: Custom is "Custom Agent" there. */
export const handoffName = (agent: Agent) => (agent === 'acp' ? 'Custom Agent' : agentName(agent));

/** What Enter does while the agent works: queue the message for after the turn, or steer the turn with it. */
export type FollowUp = 'queue' | 'steer';
export function followUpPref(): FollowUp {
  try {
    return localStorage.getItem('wa.followUp') === 'queue' ? 'queue' : 'steer';
  } catch {
    return 'steer';
  }
}

/** What the box says while the agent works (also on a session's page while it starts: StartingSession.tsx). */
export function workingPlaceholder(touch: boolean): string {
  return followUpPref() === 'queue'
    ? `Queue a message for when this turn ends${touch ? '' : ' · Ctrl+Enter sends it now'}`
    : `Send a follow-up into the running turn${touch ? '' : ' · Ctrl+Enter queues it'}`;
}

/** A finger rather than a mouse: Enter makes a new line, and no keyboard shortcuts are offered. */
export const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/**
 * The assistant and the model, with the effort and permissions when they are not the usual, as one chip; those
 * four and the context in its menu (a sheet from the bottom on a phone), so the box shows little at once.
 */
function OptionsChip({ summary, title, warn, children }: { summary: string; title: string; warn?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <SheetsOnPhone.Provider value>
      <button
        ref={ref}
        type="button"
        title={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-line-2 px-3 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg',
          open && 'bg-bg-2 text-fg',
          warn && 'border-warn/40 text-warn hover:text-warn',
        )}
      >
        <SlidersHorizontal size={13} className="shrink-0" />
        <span className="truncate">{summary}</span>
        <ChevronDown size={12} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={290} prefer="above" title="Options">
        <SettingLayout.Provider value="row">{children}</SettingLayout.Provider>
      </Popover>
    </SheetsOnPhone.Provider>
  );
}

/** Attach files, or a screenshot where the browser can take one: one + button, its menu only when there are two. */
function AddButton({ onFiles, onScreen, disabled }: { onFiles: () => void; onScreen?: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const cls = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-50';
  if (!onScreen)
    return (
      <button type="button" className={cls} onClick={onFiles} disabled={disabled} title="Attach files" aria-label="Attach files">
        <Paperclip size={16} />
      </button>
    );
  return (
    <>
      <button ref={ref} type="button" className={cx(cls, open && 'bg-bg-2 text-fg')} onClick={() => setOpen((o) => !o)} disabled={disabled} title="Attach files or a screenshot" aria-label="Attach" aria-expanded={open}>
        <Plus size={18} className={cx('transition-transform duration-150', open && 'rotate-45')} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={220} prefer="above" sheet>
        <MenuItem icon={<Paperclip size={15} />} onClick={() => (setOpen(false), onFiles())}>
          Attach files
        </MenuItem>
        <MenuItem icon={<MonitorUp size={15} />} onClick={() => (setOpen(false), onScreen())}>
          Attach a screenshot
        </MenuItem>
      </Popover>
    </>
  );
}

/** How full the context is: a small ring and its percentage, amber above 85%. */
function ContextRing({ pct, title, disabled, onClick }: { pct: number; title: string; disabled?: boolean; onClick: () => void }) {
  const r = 7;
  const len = 2 * Math.PI * r;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-tip="context"
      title={title}
      aria-label={`${pct}% of the context in use`}
      className={cx('tnum inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] transition-colors hover:bg-bg-2 disabled:pointer-events-none', pct > 85 ? 'text-warn' : 'text-fg-3')}
    >
      <svg viewBox="0 0 18 18" width="15" height="15" className="-rotate-90" aria-hidden>
        <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
        <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${(len * Math.min(100, pct)) / 100} ${len}`} />
      </svg>
      {pct}%
    </button>
  );
}

/** The ring that turns on the box's Stop button while the agent is at work, or what it started is; still if the device asks for reduced motion. */
function WorkRing() {
  return (
    <svg viewBox="0 0 36 36" className="pointer-events-none absolute inset-0 h-full w-full animate-spin motion-reduce:animate-none" aria-hidden>
      <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="24 71" opacity="0.55" />
    </svg>
  );
}

/**
 * Messages waiting for the turn to end, each sendable now (into the turn), editable or removable. `hint`:
 * what the box suggests while the agent is free, where the page shows the session its own way (an app's result).
 */
export function Composer({ s, hint }: { s: SessionSummary; hint?: string }) {
  const key = s.key;
  const lv = useLive((x) => x.byKey[key]);
  const live = lv?.live ?? s.live ?? null;
  const running = !!live && live.status !== 'exited';
  const working = running && (live!.status === 'working' || live!.status === 'waiting' || live!.status === 'starting');
  // Open in VS Code or a terminal: a Claude session moves here on send (after asking);
  // a Codex one stays read-only until it is closed there.
  const ext = running ? null : (s.external ?? null);
  const takeover = !!ext && s.agent === 'claude';
  const locked = !!ext && !takeover;
  // Its turn is over but background tasks or subagents it started still run (the header says "Working · 2 in
  // background"): the ring keeps turning, around Send, since the agent takes messages as usual meanwhile.
  const activity = activityOf({ ...s, live });
  const background = !working && !ext && inBackground(activity);
  const [confirm, confirmNode] = useConfirm();
  const cat = useCatalog(s.agent, s.acpAgent);
  // Confidential: only models on this computer (server/confidential).
  const confidential = isConfidential(s.extra);
  // What was written and attached here and not sent waits for you (lib/drafts.ts).
  const [text, setText] = useState(() => draftText(key));
  const [atts, setAtts] = useState<Attachment[]>(() => draftFiles(key));
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<{ model?: string | null; effort?: string | null; mode?: string | null }>({});
  // "Continue in Codex" (or Claude Code, or Custom Agent) was picked: the next message continues the conversation there, in a new session.
  const [move, setMove] = useState<{ agent: Agent; acp?: string; model: string | null; effort?: string | null; mode?: string | null } | null>(null);
  const moveCat = useCatalog(move?.agent ?? s.agent, move ? move.acp : s.acpAgent);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menu = useComposerMenu({ ta, setText, root: s.cwd, commands: (move ? moveCat : cat)?.commands });
  // Text from elsewhere (dictation, a choice clicked in a page) joins what is being written.
  const insertText = (t: string) => {
    if (!t) return;
    setText((cur) => (cur.trim() ? `${cur.replace(/\s*$/, '')} ${t}` : t));
    ta.current?.focus();
  };
  // What the listener below needs fresh (it is set up once per session): the box as it is now, and the latest send.
  const now = useRef({ text, atts, busy, locked, move: !!move });
  now.current = { text, atts, busy, locked, move: !!move };
  const sendRef = useRef<(opposite?: boolean, override?: string) => Promise<void>>(async () => {});
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; key?: string; replace?: string; files?: Attachment[]; send?: boolean }>).detail;
      if (!d || (d.key && d.key !== key) || (!d.text && !d.replace && !d.files?.length)) return;
      // A follow-up's button: into an empty box that can send, it goes at once, as if Enter were pressed.
      const n = now.current;
      if (d.send && d.text.trim() && !d.replace && !d.files?.length && !n.text.trim() && !n.atts.length && !n.busy && !n.locked && !n.move) {
        void sendRef.current(false, d.text);
        return;
      }
      // A choice changed in a page: the new one takes the old one's place, if that is still there.
      setText((cur) => putText(cur, d.text, d.replace));
      // A picture of a part of a PDF asked about comes with its words (Files' reader).
      if (d.files?.length) setAtts((l) => [...l, ...d.files!.filter((f) => !l.some((x) => x.id === f.id))]);
      ta.current?.focus();
    };
    window.addEventListener('hydor:compose', on);
    return () => window.removeEventListener('hydor:compose', on);
  }, [key]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; agent: Agent; acp?: string }>).detail;
      if (d?.key !== key || d.agent === s.agent) return;
      // Its default model to start with; the box's model menu lists its others.
      setMove({ agent: d.agent, acp: d.acp, model: null });
      ta.current?.focus();
    };
    window.addEventListener(HANDOFF_EVENT, on);
    return () => window.removeEventListener(HANDOFF_EVENT, on);
  }, [key, s.agent]);
  // Up in an empty box walks back through this session's prompts; -1 is the draft.
  const [recall, setRecall] = useState(-1);
  const prompts = useTimeline((x) => x.byKey[key]?.items)
    ?.filter((i) => i.kind === 'user' && !i.meta && !i.peer && !childReplyOf(i.text))
    .map((i) => (i as { text: string }).text)
    .reverse();

  useEffect(() => {
    setText(draftText(key));
    setCfg({});
    setMove(null);
    setAtts(draftFiles(key));
  }, [key]);

  useEffect(() => {
    keepDraftText(key, text);
  }, [text, key]);
  useEffect(() => {
    keepDraftFiles(key, atts);
  }, [atts, key]);
  // The pictures its messages showed from here go with the box.
  useEffect(() => () => releaseSentPictures(key), [key]);

  // "Quote" on a selected part of a reply: it goes in the box as a quote, the caret after it.
  useEffect(() => {
    const onQuote = (e: Event) => {
      const q = quoteBlock(String((e as CustomEvent).detail ?? ''));
      setText((t) => (t.trim() ? `${t.replace(/\s*$/, '')}\n\n${q}` : q));
      requestAnimationFrame(() => {
        const el = ta.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    };
    window.addEventListener(QUOTE_EVENT, onQuote);
    return () => window.removeEventListener(QUOTE_EVENT, onQuote);
  }, []);

  // Fit the box to its text. Measuring collapses it for a moment: its frame holds its height meanwhile,
  // or the conversation above would get taller for that moment and its scroll position slip.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    const frame = el.parentElement;
    const scrolled = el.scrollTop;
    if (frame) frame.style.minHeight = `${frame.offsetHeight}px`;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
    el.scrollTop = scrolled;
    if (frame) frame.style.minHeight = '';
  }, [text]);

  // A stopped session resumes on the model it last used unless one is picked here.
  const model = cfg.model !== undefined ? cfg.model : (running ? live?.model : undefined) ?? s.prefs?.model ?? s.model ?? null;
  const effort = cfg.effort !== undefined ? cfg.effort : (running ? live?.effort : undefined) ?? s.prefs?.effort ?? null;
  const mode = cfg.mode !== undefined ? cfg.mode : (running ? live?.mode : undefined) ?? s.prefs?.mode ?? cat?.defaultMode ?? null;

  // The assistant the agent works as; switching it can set the model and mode too (the server has, then).
  const assistant = useSessionAssistant(s);
  const assistantSet = (p: { model?: string; mode?: string }) => setCfg((c) => ({ ...c, ...p }));

  const configure = async (p: { model?: string | null; effort?: string | null; mode?: string | null }) => {
    setCfg((c) => ({ ...c, ...p }));
    try {
      await post(`/api/sessions/${enc(key)}/config`, p);
    } catch (e) {
      toastError(e);
    }
  };

  const attach = async (files: FileList | File[]) => {
    const list = await readAttachments(files, atts);
    if (list.length) setAtts((l) => [...l, ...list]);
  };

  /** `opposite`: Ctrl/Cmd+Enter, which steers instead of queueing (or the other way round). */
  // The id a message goes with: the same each time it is sent again (its answer lost on the way, or Send pressed again
  // after an error), so the server sends it once; a new one once it went, or once what is sent changes.
  const sending = useRef<{ what: string; id: string } | null>(null);
  const send = async (opposite = false, override?: string) => {
    const t = (override ?? text).trim();
    if (move) return handOff(t);
    if ((!t && !atts.length) || busy || locked) return;
    if (takeover ? !(await confirm(takeoverDialog(s))) : !running && !(await confirmResume(s))) return;
    const queue = working && !takeover && (followUpPref() === 'queue') !== opposite;
    setBusy(true);
    // The message shows these pictures the moment it does, not once the agent has written it down (lib/attachments.ts).
    const went = sendingPictures(key, t, atts, queue);
    const what = `${takeover ? 'takeover' : queue ? 'queue' : 'message'}\u0000${t}\u0000${atts.map((a) => `${a.id}:${a.name}`).join('|')}`;
    if (sending.current?.what !== what) sending.current = { what, id: `send-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}` };
    const sendId = sending.current.id;
    try {
      // An answer lost on the way is asked for again, with the same id: the message goes once.
      for (let tries = 0; ; tries++) {
        try {
          await post(`/api/sessions/${enc(key)}/${takeover ? 'takeover' : queue ? 'queue' : 'message'}`, { text: t, ...attachmentPayload(atts), sendId });
          break;
        } catch (e) {
          if (!lostOnTheWay(e) || tries >= 2) throw e;
          await new Promise((r) => setTimeout(r, 1500 * (tries + 1)));
        }
      }
      sending.current = null;
      went(true);
      window.dispatchEvent(new Event('wa:follow'));
      // Also when the page was left while it went.
      clearDraft(key);
      setText('');
      // Its pictures went with it; the other files have nothing to release.
      setAtts([]);
    } catch (e) {
      went(false);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  sendRef.current = send;

  /** Continues the conversation in a new session of the other agent, which opens. */
  const handOff = async (t: string) => {
    if (!move || busy) return;
    setBusy(true);
    // Codex's default must be named: unnamed, Codex takes config.toml's model, which a ChatGPT sign-in may not allow.
    const model = move.model ?? (move.agent === 'codex' ? (moveCat?.models.find((m) => m.isDefault)?.value ?? null) : null);
    try {
      const r = await post<{ key: string }>(`/api/sessions/${enc(key)}/handoff`, { agent: move.agent, acpAgent: move.acp, model, effort: move.effort, mode: move.mode, text: t, ...attachmentPayload(atts) });
      // The new session opens at once, before this box could empty its draft.
      clearDraft(key);
      setText('');
      releaseAttachments(atts);
      setAtts([]);
      setMove(null);
      openSession(r.key);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  // Only the Stop button stops a turn: Esc closes what is open (the find bar, a menu, a list) and nothing more. It stops
  // what the session started too (its Hydor subagents and background tasks), which the tray above the box lists. Its program's
  // own subagents (running tasks too) count as subagents; the other running tasks are background tasks.
  const stopAll = () => void stopEverything(key);
  const runningTasks = (live?.backgroundTasks ?? []).filter((t) => t.status === 'running');
  const agentTasks = runningTasks.filter((t) => taskKindOf(t.kind) === 'subagent').length;
  const stops = stopWords(working, (activity?.helpers ?? 0) + agentTasks, runningTasks.length - agentTasks);
  const ctx = live?.contextTokens && live?.contextWindow ? Math.round((live.contextTokens / live.contextWindow) * 100) : null;
  const touch = isTouch();
  const canSend = (!!(text.trim() || atts.length) || !!move) && !busy && !locked;
  // The options chip: the assistant and the model, then the effort and permissions when they are not the usual.
  const on = move ? { c: moveCat, model: move.model, effort: move.effort, mode: move.mode } : { c: cat, model, effort, mode };
  const assistantOn = !move && assistant ? assistant.name : null;
  const effortOn = on.effort ? on.effort[0].toUpperCase() + on.effort.slice(1) : null;
  const modeOn = on.c && on.mode && on.mode !== on.c.defaultMode ? (on.c.modes.find((m) => m.value === on.mode)?.label ?? null) : null;
  const modeNow = on.c?.modes.find((m) => m.value === (on.mode ?? on.c?.defaultMode))?.label;
  const summary = [assistantOn, on.c ? modelLabel(on.c, on.model) : '…', effortOn, modeOn].filter(Boolean).join(' · ');
  // Running without asking: the chip turns amber, so it is not forgotten.
  const unguarded = on.mode === 'bypassPermissions' || on.mode === 'full';
  const optionsTitle = [
    assistantOn && `Assistant: ${assistantOn}`,
    `Model: ${on.c ? modelLabel(on.c, on.model) : '…'}`,
    effortOn ? `Effort: ${effortOn}` : 'Effort: default',
    modeNow && `Permissions: ${modeNow} (Shift+Tab cycles)`,
  ]
    .filter(Boolean)
    .join('\n');
  const compact = async () => {
    const ok = await confirm({ title: 'Compact the conversation?', body: <>The history so far becomes a summary, which frees context. {ctx}% is in use.</>, confirm: 'Compact' });
    if (ok) post(`/api/sessions/${enc(key)}/compact`).then(() => toast('Compacting the conversation…'), toastError);
  };

  return (
    <div className="shrink-0 px-3 pb-[max(10px,var(--safe-bottom))] sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-[800px]">
        <BlockedApproval sessionKey={key} agent={s.agent} running={running} mode={mode} />
        <LimitBanner agent={s.agent} account={s.account} className="mb-2" session={{ key, resumeAt: s.resumeAt, busy: working }} />
        <GoalBar s={s} className="mb-2" />
        <WorkTray key={key} s={s} />
        <QueueList s={s} />
        {move && (
          <div className="anim-pop mb-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]">
            <ArrowRightLeft size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Your next message continues this conversation in <span className="font-medium">{handoffName(move.agent)}</span> ({modelLabel(moveCat, move.model)}): a new session in this
              folder that starts with the conversation so far.
            </span>
            <button onClick={() => setMove(null)} className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Stay here" title="Stay here">
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className={cx(
            '@container relative rounded-[22px] border bg-panel shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-colors',
            // A confidential session's box has a calm tint, so it is plain where your words stay.
            confidential ? 'border-ok/45 focus-within:border-ok/70' : 'border-line-2 focus-within:border-accent/50',
          )}
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length || locked) return;
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
            rows={1}
            disabled={locked}
            autoComplete="off"
            autoCorrect="off"
            data-1p-ignore=""
            data-lpignore="true"
            data-form-type="other"
            onFocus={() => !running && warmMemory()}
            onChange={(e) => {
              setText(e.target.value);
              setRecall(-1);
              menu.update();
            }}
            onClick={menu.update}
            onKeyUp={(e) => (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') && menu.update()}
            onKeyDown={(e) => {
              if (menu.onKeyDown(e)) return;
              const el = e.currentTarget;
              // Earlier prompts: Up from an empty box (or one showing a recalled prompt, caret at the start).
              if (e.key === 'ArrowUp' && !e.shiftKey && prompts?.length && (!text || (recall >= 0 && el.selectionStart === 0))) {
                const i = Math.min(recall + 1, prompts.length - 1);
                if (i !== recall) {
                  e.preventDefault();
                  setRecall(i);
                  setText(prompts[i]);
                }
                return;
              }
              if (e.key === 'ArrowDown' && recall >= 0 && el.selectionStart === el.value.length) {
                e.preventDefault();
                const i = recall - 1;
                setRecall(i);
                setText(i >= 0 ? prompts![i] : '');
                return;
              }
              // Ctrl+S puts the draft aside; on an empty box it brings it back.
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                e.stopPropagation();
                const k = `wa.stash.${key}`;
                try {
                  if (text.trim()) {
                    localStorage.setItem(k, text);
                    setText('');
                    toast('Draft put aside · Ctrl+S in an empty box brings it back');
                  } else if (localStorage.getItem(k)) {
                    setText(localStorage.getItem(k)!);
                    localStorage.removeItem(k);
                  }
                } catch {}
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && (!touch || e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(!touch && (e.metaKey || e.ctrlKey));
              } else if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                if (move) {
                  const m = nextMode(moveCat, move.mode);
                  if (m) setMove({ ...move, mode: m });
                } else {
                  const m = nextMode(cat, mode);
                  if (m) configure({ mode: m });
                }
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              // A very long paste (a log, a file) goes in as an attachment rather than into the box.
              const pasted = e.clipboardData.getData('text/plain');
              if (!files.length && pasted.length >= 32_000) {
                e.preventDefault();
                attach([new File([pasted], `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.txt`, { type: 'text/plain' })]);
                toast(`Long paste attached as a file (${Math.round(pasted.length / 1000)}K characters)`);
                return;
              }
              if (!files.length) return;
              // The clipboard also carries the file's name as text: attach instead of pasting it.
              e.preventDefault();
              attach(files);
            }}
            placeholder={
              move
                ? `Message for ${handoffName(move.agent)}, or just send to continue`
                : locked
                ? `Open in ${ext!.client} — continue there, or close it there to resume here`
                : takeover
                  ? `Open in ${ext!.client} — sending moves it here`
                  : working
                    ? workingPlaceholder(touch)
                    : hint
                      ? hint
                      : running
                        ? `Message ${s.agent === 'claude' ? 'Claude' : s.agent === 'codex' ? 'Codex' : (s.acpName ?? 'the agent')}…`
                        : 'Message to resume this session…'
            }
            className="block max-h-[40vh] min-h-[48px] w-full resize-none bg-transparent px-5 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-fg-3 focus-visible:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1 px-2.5 pt-0.5 pb-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <AddButton
                onFiles={() => fileRef.current?.click()}
                onScreen={
                  canCaptureScreen()
                    ? async () => {
                        const f = await captureScreen();
                        if (f) attach([f]);
                      }
                    : undefined
                }
                disabled={locked}
              />
              {/* The assistant, model, effort and permissions: one chip, the four (and the context) in its menu. */}
              <OptionsChip summary={summary} title={optionsTitle} warn={unguarded}>
                {move ? (
                  <>
                    <ModelPicker label="Model" agent={move.agent} acp={move.acp} value={move.model} onChange={(v) => setMove({ ...move, model: v })} />
                    <EffortPicker label="Effort" agent={move.agent} acp={move.acp} model={move.model} value={move.effort} onChange={(v) => setMove({ ...move, effort: v })} />
                    <ModePicker label="Permissions" agent={move.agent} acp={move.acp} value={move.mode} onChange={(v) => setMove({ ...move, mode: v })} />
                  </>
                ) : (
                  <>
                    <SessionAssistantPicker s={s} label="Agent" onConfig={assistantSet} />
                    <ModelPicker label="Model" agent={s.agent} acp={s.acpAgent} value={model} onChange={(v) => configure({ model: v })} localOnly={confidential} />
                    <EffortPicker label="Effort" agent={s.agent} acp={s.acpAgent} model={model} value={effort} onChange={(v) => configure({ effort: v })} />
                    <ModePicker label="Permissions" agent={s.agent} acp={s.acpAgent} value={mode} onChange={(v) => configure({ mode: v })} />
                    <SessionAccount s={s} />
                    <FeatureSessionOptions s={s} />
                    {ctx != null && (
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void compact()}
                        title="Compact the conversation: the history so far becomes a summary, which frees context"
                        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg px-2.5 text-left text-[13.5px] transition-colors hover:bg-bg-2 disabled:opacity-50 max-sm:h-11 max-sm:text-[14.5px]"
                      >
                        <span className="shrink-0 text-fg-2">Context</span>
                        <span className={cx('tnum ml-auto min-w-0 truncate pl-3 font-medium', ctx > 85 ? 'text-warn' : 'text-fg')}>{ctx}% in use</span>
                        <span className="shrink-0 text-[12.5px] font-medium text-accent">Compact</span>
                      </button>
                    )}
                    <SessionMeters live={live} />
                  </>
                )}
              </OptionsChip>
            </div>
            {ctx != null && (
              <ContextRing
                pct={ctx}
                disabled={working}
                onClick={() => void compact()}
                title={`${ctx}% of the context in use (${live?.contextTokens?.toLocaleString()} of ${live?.contextWindow?.toLocaleString()} tokens) · click to compact`}
              />
            )}
            <FeatureComposerButtons s={s} insert={insertText} disabled={locked} />
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
            {(working || background) && (
              <button
                onClick={stopAll}
                title={['Stop', stops.note].filter(Boolean).join('\n')}
                aria-label={stops.label}
                className="anim-pop-in relative ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg transition duration-150 hover:opacity-90 active:scale-90"
              >
                {live?.status !== 'waiting' && <WorkRing />}
                <Square size={12} fill="currentColor" strokeWidth={0} />
              </button>
            )}
            {(!working || canSend) && (
              <button
                onClick={() => send()}
                disabled={!canSend}
                title={running ? 'Send (Enter)' : takeover ? `End it in ${ext!.client} and send here` : 'Resume and send'}
                aria-label="Send"
                className={cx('group ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full transition duration-200 active:scale-90', canSend ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-bg-3 text-fg-3')}
              >
                <span className={cx('ico', canSend && 'ico-rise')}>
                  <ArrowUp size={16} strokeWidth={2.4} />
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
      {confirmNode}
    </div>
  );
}

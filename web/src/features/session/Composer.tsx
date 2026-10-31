import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ArrowUp, ListTodo, MonitorUp, Paperclip, Square, X } from 'lucide-react';
import type { Agent, BackgroundTask, SessionSummary } from '@shared/types';
import { enc, post } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { toast, toastError, useLive, useTimeline } from '../../lib/store';
import { agentName } from '../../components/AgentIcon';
import { EffortPicker, modelLabel, ModelPicker, ModePicker, nextMode, useCatalog } from '../../components/AgentPickers';
import { cx, Popover, useConfirm } from '../../components/ui';
import { confirmResume, takeoverDialog } from '../../lib/activity';
import { attachmentPayload, canCaptureScreen, captureScreen, readAttachments, releaseAttachments, type Attachment } from '../../lib/attachments';
import { QUOTE_EVENT, quoteBlock } from './QuoteSelection';
import { AttachmentList } from '../../components/Attachments';
import { BlockedApproval } from './BlockedApproval';
import { SessionMeters } from './SessionMeters';
import { TaskLogDialog, TaskRow, useStopTask } from './TaskLog';
import { useComposerMenu } from '../../components/ComposerMenu';
import { QueueList } from './QueueList';
import { GoalBar } from './GoalBar';
import { LimitBanner } from '../usage/LimitReset';
import { FeatureComposerButtons } from '../registry';
import { putText } from '../../lib/featureEvents';

const draftKey = (k: string) => `wa.draft.${k}`;

const HANDOFF_EVENT = 'wa:handoff';
/** The session menu's "Continue in Codex…": session `key`'s message box sets its next message to go to `agent`. */
export function continueIn(key: string, agent: Agent) {
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT, { detail: { key, agent } }));
}

/** What Enter does while the agent works: queue the message for after the turn, or steer the turn with it. */
export type FollowUp = 'queue' | 'steer';
export function followUpPref(): FollowUp {
  try {
    return localStorage.getItem('wa.followUp') === 'queue' ? 'queue' : 'steer';
  } catch {
    return 'steer';
  }
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
  const [confirm, confirmNode] = useConfirm();
  const cat = useCatalog(s.agent, s.acpAgent);
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey(key)) ?? '';
    } catch {
      return '';
    }
  });
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<{ model?: string | null; effort?: string | null; mode?: string | null }>({});
  // "Continue in Codex…" (or Claude Code) was picked: the next message continues the conversation there, in a new session.
  const [move, setMove] = useState<{ agent: Agent; model: string | null; effort?: string | null; mode?: string | null } | null>(null);
  const moveCat = useCatalog(move?.agent ?? s.agent);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tasksRef = useRef<HTMLButtonElement>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [logTask, setLogTask] = useState<BackgroundTask | null>(null);
  const stopper = useStopTask(s.key);
  const menu = useComposerMenu({ ta, setText, root: s.cwd, commands: (move ? moveCat : cat)?.commands });
  // Text from elsewhere (dictation, a choice clicked in a page) joins what is being written.
  const insertText = (t: string) => {
    if (!t) return;
    setText((cur) => (cur.trim() ? `${cur.replace(/\s*$/, '')} ${t}` : t));
    ta.current?.focus();
  };
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; key?: string; replace?: string }>).detail;
      if (!d || (d.key && d.key !== key) || (!d.text && !d.replace)) return;
      // A choice changed in a page: the new one takes the old one's place, if that is still there.
      setText((cur) => putText(cur, d.text, d.replace));
      ta.current?.focus();
    };
    window.addEventListener('naget:compose', on);
    return () => window.removeEventListener('naget:compose', on);
  }, [key]);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; agent: Agent }>).detail;
      if (d?.key !== key || d.agent === s.agent) return;
      // Its default model to start with; the box's model menu lists its others.
      setMove({ agent: d.agent, model: null });
      ta.current?.focus();
    };
    window.addEventListener(HANDOFF_EVENT, on);
    return () => window.removeEventListener(HANDOFF_EVENT, on);
  }, [key, s.agent]);
  // Up in an empty box walks back through this session's prompts; -1 is the draft.
  const [recall, setRecall] = useState(-1);
  const prompts = useTimeline((x) => x.byKey[key]?.items)
    ?.filter((i) => i.kind === 'user' && !i.meta && !i.peer)
    .map((i) => (i as { text: string }).text)
    .reverse();

  useEffect(() => {
    try {
      setText(localStorage.getItem(draftKey(key)) ?? '');
    } catch {}
    setCfg({});
    setMove(null);
    setAtts((l) => (releaseAttachments(l), []));
  }, [key]);

  useEffect(() => {
    try {
      if (text) localStorage.setItem(draftKey(key), text);
      else localStorage.removeItem(draftKey(key));
    } catch {}
  }, [text, key]);

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
  const send = async (opposite = false) => {
    const t = text.trim();
    if (move) return handOff(t);
    if ((!t && !atts.length) || busy || locked) return;
    if (takeover ? !(await confirm(takeoverDialog(s))) : !running && !(await confirmResume(s))) return;
    const queue = working && !takeover && (followUpPref() === 'queue') !== opposite;
    setBusy(true);
    try {
      await post(`/api/sessions/${enc(key)}/${takeover ? 'takeover' : queue ? 'queue' : 'message'}`, { text: t, ...attachmentPayload(atts) });
      window.dispatchEvent(new Event('wa:follow'));
      setText('');
      releaseAttachments(atts);
      setAtts([]);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  /** Continues the conversation in a new session of the other agent, which opens. */
  const handOff = async (t: string) => {
    if (!move || busy) return;
    setBusy(true);
    // Codex's default must be named: unnamed, Codex takes config.toml's model, which a ChatGPT sign-in may not allow.
    const model = move.model ?? (move.agent === 'codex' ? (moveCat?.models.find((m) => m.isDefault)?.value ?? null) : null);
    try {
      const r = await post<{ key: string }>(`/api/sessions/${enc(key)}/handoff`, { agent: move.agent, model, effort: move.effort, mode: move.mode, text: t, ...attachmentPayload(atts) });
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

  const interrupt = () => post(`/api/sessions/${enc(key)}/interrupt`).catch(toastError);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && working && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        interrupt();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const tasks = (running ? live!.backgroundTasks : ext?.backgroundTasks) ?? [];
  const ctx = live?.contextTokens && live?.contextWindow ? Math.round((live.contextTokens / live.contextWindow) * 100) : null;
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const canSend = (!!(text.trim() || atts.length) || !!move) && !busy && !locked;

  return (
    <div className="shrink-0 px-3 pb-[max(10px,var(--safe-bottom))] sm:px-6 sm:pb-5">
      <div className="mx-auto max-w-[800px]">
        <BlockedApproval sessionKey={key} agent={s.agent} running={running} mode={mode} />
        <LimitBanner agent={s.agent} account={s.account} className="mb-2" session={{ key, resumeAt: s.resumeAt, busy: working }} />
        <GoalBar s={s} className="mb-2" />
        <QueueList s={s} />
        {move && (
          <div className="anim-pop mb-2 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]">
            <ArrowRightLeft size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              Your next message continues this conversation in <span className="font-medium">{agentName(move.agent)}</span> ({modelLabel(moveCat, move.model)}): a new session in this
              folder that starts with the conversation so far.
            </span>
            <button onClick={() => setMove(null)} className="shrink-0 rounded-md p-1 text-fg-3 hover:bg-bg-2 hover:text-fg" aria-label="Stay here" title="Stay here">
              <X size={14} />
            </button>
          </div>
        )}
        <div
          className="relative rounded-[22px] border border-line-2 bg-panel shadow-[0_8px_30px_rgba(0,0,0,0.10)] transition-colors focus-within:border-accent/50"
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
                ? `Message for ${agentName(move.agent)}, or just send to continue`
                : locked
                ? `Open in ${ext!.client} — continue there, or close it there to resume here`
                : takeover
                  ? `Open in ${ext!.client} — sending moves it here`
                  : working
                    ? followUpPref() === 'queue'
                      ? `Queue a message for when this turn ends${touch ? '' : ' · Ctrl+Enter sends it now'}`
                      : `Send a follow-up into the running turn${touch ? '' : ' · Ctrl+Enter queues it'}`
                    : hint
                      ? hint
                      : running
                        ? `Message ${s.agent === 'claude' ? 'Claude' : s.agent === 'codex' ? 'Codex' : (s.acpName ?? 'the agent')}…`
                        : 'Message to resume this session…'
            }
            className="block max-h-[40vh] min-h-[48px] w-full resize-none bg-transparent px-5 pt-3.5 pb-1 text-[15px] leading-relaxed outline-none placeholder:text-fg-3 focus-visible:outline-none disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1 px-2.5 pt-0.5 pb-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              {move ? (
                <>
                  <ModelPicker agent={move.agent} value={move.model} onChange={(v) => setMove({ ...move, model: v })} />
                  <EffortPicker agent={move.agent} model={move.model} value={move.effort} onChange={(v) => setMove({ ...move, effort: v })} />
                  <ModePicker agent={move.agent} value={move.mode} onChange={(v) => setMove({ ...move, mode: v })} />
                </>
              ) : (
                <>
                  <ModelPicker agent={s.agent} acp={s.acpAgent} value={model} onChange={(v) => configure({ model: v })} />
                  <EffortPicker agent={s.agent} acp={s.acpAgent} model={model} value={effort} onChange={(v) => configure({ effort: v })} />
                  <ModePicker agent={s.agent} acp={s.acpAgent} value={mode} onChange={(v) => configure({ mode: v })} />
                </>
              )}
              {tasks.length > 0 && (
                <>
                  <button
                    ref={tasksRef}
                    onClick={() => setTasksOpen((o) => !o)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-accent hover:bg-bg-2"
                    title="Background tasks"
                  >
                    <ListTodo size={13} />
                    {tasks.length}
                  </button>
                  <Popover anchor={tasksRef} open={tasksOpen} onClose={() => setTasksOpen(false)} width={340} prefer="above" sheet>
                    <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">Background tasks · {tasks.length}</div>
                    {tasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        t={t}
                        onOpen={() => {
                          setTasksOpen(false);
                          setLogTask(t);
                        }}
                        onStop={running ? () => void stopper.stop(t) : undefined}
                      />
                    ))}
                  </Popover>
                  {stopper.node}
                </>
              )}
            </div>
            <SessionMeters live={live} />
            {ctx != null && (
              <button
                type="button"
                disabled={working}
                onClick={async () => {
                  const ok = await confirm({ title: 'Compact the conversation?', body: <>The history so far becomes a summary, which frees context. {ctx}% is in use.</>, confirm: 'Compact' });
                  if (ok) post(`/api/sessions/${enc(key)}/compact`).then(() => toast('Compacting the conversation…'), toastError);
                }}
                className={cx('tnum mr-1 hidden rounded-md px-1 text-[11.5px] transition-colors hover:bg-bg-2 disabled:pointer-events-none sm:inline', ctx > 85 ? 'text-warn' : 'text-fg-3')}
                title={`${live?.contextTokens?.toLocaleString()} of ${live?.contextWindow?.toLocaleString()} context tokens · click to compact`}
              >
                {ctx}% context
              </button>
            )}
            {canCaptureScreen() && (
              <button
                className="rounded-lg p-2 text-fg-3 hover:bg-bg-2 hover:text-fg disabled:opacity-50"
                onClick={async () => {
                  const f = await captureScreen();
                  if (f) attach([f]);
                }}
                disabled={locked}
                title="Attach a screenshot of a screen, window or tab"
                aria-label="Attach a screenshot"
              >
                <MonitorUp size={17} />
              </button>
            )}
            <button className="rounded-lg p-2 text-fg-3 hover:bg-bg-2 hover:text-fg disabled:opacity-50" onClick={() => fileRef.current?.click()} disabled={locked} title="Attach files" aria-label="Attach files">
              <Paperclip size={17} />
            </button>
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
            {working && (
              <button
                onClick={interrupt}
                title="Stop (Esc)"
                aria-label="Stop the current turn"
                className="anim-pop-in ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full bg-fg text-bg transition duration-150 hover:opacity-85 active:scale-90"
              >
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
      {logTask && <TaskLogDialog sessionKey={key} task={logTask} canStop={running} onClose={() => setLogTask(null)} />}
    </div>
  );
}

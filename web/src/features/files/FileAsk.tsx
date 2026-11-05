// Asking an agent about the file open in Files, as Pages does for a page: say what to change (or ask about it), and
// an agent works on the file itself. Unsaved changes are saved first so the agent works on them. It starts a session
// in the file's folder with the agent picked last on the start page (`extra.file`: the agent is told which file it is),
// its conversation beside the file (over it on a phone, folding away to watch the file change). The editor takes in
// each change the agent writes as it lands (useWatchMs reads the file more often while an agent works), the changed
// lines tinted for a moment. The conversation goes on there, or in Sessions. A PDF's reader asks about a part of it
// (askAbout): the words picked, or a picture of an area, go with the request, or into the conversation's message box.
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { ArrowUp, ArrowUpRight, Eye, Quote, Sparkles, SquarePen, X } from 'lucide-react';
import { editorKindOf } from '@shared/documents';
import { post } from '../../lib/api';
import { readAttachments } from '../../lib/attachments';
import { draftFiles, draftText, keepDraftFiles, keepDraftText } from '../../lib/drafts';
import { putText } from '../../lib/featureEvents';
import { basename, dirname } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toastError, useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, cx, IconButton, Throbber, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { Conversation } from '../guide/AskPanel';
import { useAskRun } from '../guide/ask';
import { Starting } from '../pages/AskPage';
import { quoteBlock } from '../session/QuoteSelection';

/** A part of a PDF picked in its reader to ask about: its page, and its words or a picture of it (an area). */
export interface AskPick {
  page: number;
  text?: string;
  image?: { blob: Blob; base64: string; url: string };
}

interface FileAskState {
  /** The panel shows (beside whichever file is open). */
  open: boolean;
  /** Folded away on a phone, to watch the file. */
  folded: boolean;
  /** By file: the session asked, and the request while it starts. */
  byPath: Record<string, { key: string | null; pending?: string }>;
  /** By file: the part of a PDF picked to ask about, until the request goes. */
  picked: Record<string, AskPick | undefined>;
}

export const useFileAsk = create<FileAskState>(() => ({ open: false, folded: false, byPath: {}, picked: {} }));
export const openFileAsk = () => useFileAsk.setState({ open: true, folded: false });
export const closeFileAsk = () => useFileAsk.setState({ open: false });

/** A picked part as words to send: the page, then the words as a quote (or the picture's place). */
function pickBlock(p: AskPick, name: string): string {
  if (p.image) return `The part of page ${p.page} of ${name} in the picture${p.text ? ` (its words: “${p.text.slice(0, 600)}”)` : ''}.`;
  return `From page ${p.page} of ${name}:\n${quoteBlock(p.text ?? '').trimEnd()}`;
}

function setPick(path: string, p: AskPick | undefined) {
  const was = useFileAsk.getState().picked[path];
  if (was?.image && was.image.url !== p?.image?.url) URL.revokeObjectURL(was.image.url);
  useFileAsk.setState((s) => ({ picked: { ...s.picked, [path]: p } }));
}

/**
 * Asks about a part of a PDF (its reader's Ask): the panel opens with it beside the request; when a conversation about
 * the file is going on, the part goes into its message box instead (the words as a quote, a picture attached).
 */
export async function askAbout(path: string, p: AskPick) {
  const key = useFileAsk.getState().byPath[path]?.key;
  if (!key) {
    setPick(path, p);
    useFileAsk.setState({ open: true, folded: false });
    return;
  }
  const text = `${pickBlock(p, basename(path))}\n\n`;
  const files = p.image ? await readAttachments([new File([p.image.blob], `Page ${p.page}.png`, { type: 'image/png' })]) : [];
  if (p.image) URL.revokeObjectURL(p.image.url);
  // A box not open now finds it when it opens; one open takes it in at once.
  keepDraftText(key, putText(draftText(key), text));
  keepDraftFiles(key, [...draftFiles(key), ...files]);
  window.dispatchEvent(new CustomEvent('hydor:compose', { detail: { text, key, files } }));
  useFileAsk.setState({ open: true, folded: false });
}

/** How often an open file is read again for changes made elsewhere: every second while an agent is at work. */
export function useWatchMs(): number {
  const busy = useSessions((x) => Object.values(x.byKey).some((s) => s.live?.status === 'working' || s.live?.status === 'starting'));
  return busy ? 1000 : 3000;
}

type Kind = 'prose' | 'sheet' | 'code' | 'pdf';
const kindOf = (path: string): Kind => {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pdf';
  const ed = editorKindOf(path);
  if (ed === 'sheet') return 'sheet';
  if (ed || ['md', 'markdown', 'mdx', 'txt', 'rst', 'org', 'html', 'htm'].includes(ext)) return 'prose';
  return 'code';
};
const EXAMPLES: Record<Kind, string[]> = {
  prose: ['Fix the spelling and grammar', 'Make it shorter and clearer', 'Add a summary at the top', 'Turn the list into a table', 'What does this say, in a few lines?'],
  sheet: ['Add a total row under the numbers', 'Sort by the date, newest first', 'Find any mistakes in the numbers', 'What stands out in this data?'],
  code: ['Explain what this file does', 'Find and fix any bugs', 'Add comments where it is hard to follow', 'Make it simpler without changing what it does'],
  pdf: ['Sum up this paper in a few lines', 'What are its main findings?', 'Explain its method in plain words', 'What are its weak points?'],
};
/** A PDF with a part picked in its reader. */
const PICKED = ['Explain this passage', 'What does this equation say?', 'How does this compare with my approach?', 'Sum up this section'];

/** The button that opens the panel, for the file's toolbar. */
export function FileAskButton() {
  const mobile = useIsMobile();
  const open = useFileAsk((s) => s.open);
  const toggle = () => (open ? closeFileAsk() : openFileAsk());
  if (mobile)
    return (
      <IconButton label="Ask an agent" active={open} onClick={toggle}>
        <Sparkles size={17} className="text-accent" />
      </IconButton>
    );
  return (
    <Button size="sm" variant={open ? 'secondary' : 'ghost'} icon={<Sparkles size={13} className="text-accent" />} onClick={toggle} className="mx-0.5">
      Ask
    </Button>
  );
}

function Start({ path, beforeSend }: { path: string; beforeSend: () => Promise<boolean> }) {
  const mobile = useIsMobile();
  const run = useAskRun();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const pick = useFileAsk((s) => s.picked[path]);
  const kind = kindOf(path);
  useEffect(() => {
    if (!mobile) requestAnimationFrame(() => ta.current?.focus());
  }, [path, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    try {
      if (!(await beforeSend())) return;
      useFileAsk.setState((s) => ({ byPath: { ...s.byPath, [path]: { key: null, pending: q } } }));
      const r = await post<{ key: string }>('/api/sessions', {
        agent: run.agent,
        acpAgent: run.agent === 'acp' ? run.acp : undefined,
        prompt: pick ? `${q}\n\n${pickBlock(pick, basename(path))}` : q,
        images: pick?.image ? [{ mediaType: 'image/png', data: pick.image.base64, name: `Page ${pick.page}.png` }] : [],
        model: run.model ?? undefined,
        account: run.account,
        cwd: dirname(path),
        extra: { file: path },
      });
      setText('');
      if (pick) setPick(path, undefined);
      useFileAsk.setState((s) => ({ byPath: { ...s.byPath, [path]: { key: r.key } }, folded: mobile }));
    } catch (e) {
      useFileAsk.setState((s) => ({ byPath: { ...s.byPath, [path]: { key: null } } }));
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <p className="text-[13.5px] leading-relaxed text-fg-2">
        {kind === 'pdf' ? (
          <>Ask about {basename(path)}, or about the part you picked in it. An agent reads the file to answer.</>
        ) : (
          <>Say what to change in {basename(path)}, or ask about it. An agent works on the file, and you see each change here as soon as it is written.</>
        )}
      </p>
      {pick && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line bg-bg-1 py-2 pr-1.5 pl-3">
          {pick.image ? (
            <img src={pick.image.url} alt="" className="mt-0.5 max-h-28 max-w-[55%] shrink-0 rounded-md border border-line bg-white object-contain" />
          ) : (
            <Quote size={14} className="mt-1 shrink-0 text-fg-3" />
          )}
          <div className="min-w-0 flex-1 py-0.5">
            <div className="text-[11.5px] font-medium text-fg-3">{pick.image ? <>A part of page {pick.page}</> : <>Page {pick.page}</>}</div>
            {!pick.image && (
              <div translate="no" className="mt-0.5 line-clamp-4 text-[13px] leading-snug text-fg-2">
                {pick.text}
              </div>
            )}
          </div>
          <IconButton label="Leave it out" size="sm" onClick={() => setPick(path, undefined)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <div className="mt-3 rounded-[18px] border border-line-2 bg-panel transition-colors focus-within:border-accent/50">
        <textarea
          ref={ta}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !mobile) {
              e.preventDefault();
              void send();
            }
          }}
          rows={3}
          placeholder={kind === 'pdf' ? 'What would you like to know?' : 'What should change in the file?'}
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-[14.5px] leading-relaxed outline-none placeholder:text-fg-3"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] text-fg-3" title="The agent and model picked last on the start page">
            <AgentIcon agent={run.agent} size={13} className="shrink-0" />
            <span className="truncate">{run.label}</span>
          </span>
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            aria-label="Ask"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-35"
          >
            {busy ? <Throbber size={15} /> : <ArrowUp size={16} />}
          </button>
        </div>
      </div>
      <div className="mt-5 mb-2 text-[12px] font-medium text-fg-3">For example</div>
      <div className="space-y-1.5">
        {(kind === 'pdf' && pick ? PICKED : EXAMPLES[kind]).map((s) => (
          <button
            key={s}
            onClick={() => (setText(tr(s)), ta.current?.focus())}
            className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[13px] leading-snug text-fg-2 transition-colors hover:border-line-2 hover:bg-bg-1 hover:text-fg"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The panel: the request box, then the conversation. `beforeSend` saves the file's unsaved changes first. */
export function FileAskPanel({ path, beforeSend, className }: { path: string; beforeSend: () => Promise<boolean>; className?: string }) {
  const mobile = useIsMobile();
  const at = useFileAsk((s) => s.byPath[path]);
  const key = at?.key ?? null;
  return (
    <div className={cx('flex h-full min-h-0 flex-col bg-bg', className)}>
      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line pr-2 pl-4">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">Ask an agent</h2>
        {key && (
          <>
            <IconButton label="A new request" onClick={() => useFileAsk.setState((s) => ({ byPath: { ...s.byPath, [path]: { key: null } } }))}>
              <SquarePen size={16} />
            </IconButton>
            <IconButton label="Open as a session" onClick={() => openSession(key)}>
              <ArrowUpRight size={17} />
            </IconButton>
          </>
        )}
        {mobile && key && (
          <IconButton label="See the file" onClick={() => useFileAsk.setState({ folded: true })}>
            <Eye size={17} />
          </IconButton>
        )}
        <IconButton label="Close" onClick={closeFileAsk}>
          <X size={17} />
        </IconButton>
      </div>
      {key ? <Conversation key={key} sessionKey={key} /> : at?.pending ? <Starting text={at.pending} /> : <Start key={path} path={path} beforeSend={beforeSend} />}
    </div>
  );
}

/** On a phone, while the panel is folded away: how the agent is doing, and a way back to it. */
export function FileAskPill({ path }: { path: string }) {
  const key = useFileAsk((s) => s.byPath[path]?.key ?? null);
  const live = useSessions((x) => (key ? x.byKey[key]?.live?.status : undefined));
  if (!key) return null;
  const working = live === 'working' || live === 'starting';
  return (
    <button
      type="button"
      onClick={() => useFileAsk.setState({ open: true, folded: false })}
      className="fixed bottom-[calc(16px+var(--safe-bottom))] left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-2 bg-elevated px-4 py-2 text-[13px] font-medium shadow-lg"
    >
      {working ? <span className="breathe h-2 w-2 rounded-full bg-busy" /> : <Sparkles size={14} className="text-accent" />}
      {working ? tr('The agent is working on it') : tr('The agent answered')}
    </button>
  );
}

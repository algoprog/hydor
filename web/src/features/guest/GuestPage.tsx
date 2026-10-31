// A session shared with a read-only link (/g/<token>): the conversation as it happens, without the
// password, the sidebar or anything to type into. What a guest may see is decided by the server.
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FilePen, Globe, ListChecks, MessageSquareText, Search, Terminal, Wrench } from 'lucide-react';
import type { Agent, ToolItem, TimelineItem } from '@shared/types';
import { applyTheme } from '../../lib/theme';
import { duration } from '../../lib/format';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { DiffStat, DiffView } from '../../components/DiffView';
import { Logo } from '../../components/Logo';
import { Markdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import { HtmlPage, isPageTool } from '../session/HtmlPage';
import { mu } from '../../lib/machine';

interface GuestView {
  title: string;
  agent: Agent;
  /** An ACP agent's name (Settings → More agents). */
  acpName?: string;
  status: string;
  from: number;
  total: number;
  items: TimelineItem[];
}

const ICON: Record<string, typeof Wrench> = { command: Terminal, edit: FilePen, read: Search, search: Search, web: Globe, todo: ListChecks, message: MessageSquareText };

export default function GuestPage({ token }: { token: string }) {
  const [v, setV] = useState<GuestView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const items = useRef<TimelineItem[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTheme();
    let stop = false;
    let timer = 0;
    const pull = async (first: boolean) => {
      // The last few items can still change (a step finishing): fetch them again with anything new.
      const from = first ? 0 : Math.max(0, items.current.length - 30);
      try {
        const r = await fetch(mu(`/guest-api/${encodeURIComponent(token)}?from=${from}${first ? '&visit=1' : ''}`));
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'This link does not work');
        if (stop) return;
        items.current = [...items.current.slice(0, body.from), ...body.items];
        setV({ ...body, items: items.current });
        setErr(null);
        const busy = ['working', 'waiting', 'starting'].includes(body.status);
        timer = window.setTimeout(() => pull(false), busy ? 4000 : 30_000);
        if (first || busy) requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
      } catch (e) {
        if (stop) return;
        setErr((e as Error).message);
        if (!first) timer = window.setTimeout(() => pull(false), 30_000);
      }
    };
    pull(true);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [token]);

  useEffect(() => {
    if (v) document.title = `${v.title} · Naget Agent`;
  }, [v?.title]);

  const working = v && ['working', 'waiting', 'starting'].includes(v.status);
  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 border-b border-line pt-[var(--safe-top)]">
        <div className="mx-auto flex max-w-[860px] items-center gap-3 px-4 py-3">
          <Logo size={26} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {v && <AgentIcon agent={v.agent} name={v.acpName} size={15} />}
              <h1 className="truncate text-[15px] font-semibold tracking-tight">{v?.title ?? 'Shared session'}</h1>
            </div>
            <div className="text-[12px] text-fg-3">
              {v ? `${agentName(v.agent, v.acpName)} · read-only, shared from Naget Agent` : 'Naget Agent'}
              {working && <span className="text-busy"> · working now</span>}
            </div>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-3 px-4 py-5">
          {err && !v ? (
            <div className="py-16 text-center text-[14px] text-fg-3">{err}</div>
          ) : !v ? (
            <div className="flex justify-center py-16 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : (
            v.items.map((it) => <GuestItem key={it.id} it={it} />)
          )}
          {working && (
            <div className="flex items-center gap-2 px-1 text-[12.5px] text-busy">
              <Throbber /> Working
            </div>
          )}
          <div ref={end} />
        </div>
      </main>
    </div>
  );
}

function GuestItem({ it }: { it: TimelineItem }) {
  switch (it.kind) {
    case 'user':
      if (it.meta === 'note') return null;
      if (it.meta === 'command-output') return <div className="px-1 font-mono text-[12px] text-fg-3">{it.text}</div>;
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-bg-2 px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap">
            {it.text}
            {!!it.images && <div className="mt-1 text-[12px] text-fg-3">{it.images === 1 ? 'With an image' : `With ${it.images} images`}</div>}
          </div>
        </div>
      );
    case 'assistant':
      return <Markdown text={it.text} className="px-1 text-[15px]" />;
    case 'tool':
      return isPageTool(it.tool.name) ? <HtmlPage item={it} /> : <GuestTool it={it} />;
    case 'system':
      return <div className={cx('px-1 text-[12.5px]', it.level === 'error' ? 'text-err' : 'text-fg-3')}>{it.text}</div>;
    case 'turn':
      return (
        <div className="flex items-center gap-3 py-1 text-[11.5px] text-fg-3">
          <span className="h-px flex-1 bg-line" />
          {it.durationMs ? `Worked for ${duration(it.durationMs)}` : ''}
          <span className="h-px flex-1 bg-line" />
        </div>
      );
    default:
      return null;
  }
}

function GuestTool({ it }: { it: ToolItem }) {
  const t = it.tool;
  const [open, setOpen] = useState(false);
  const Icon = ICON[t.category] ?? Wrench;
  const files = t.files ?? [];
  const added = files.reduce((a, f) => a + f.added, 0);
  const removed = files.reduce((a, f) => a + f.removed, 0);
  const diffs = files.filter((f) => f.diff);
  return (
    <div>
      <button disabled={!diffs.length} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-[13px] enabled:hover:bg-bg-2">
        <Icon size={14} className={cx('shrink-0', t.status === 'error' ? 'text-err' : 'text-fg-3')} />
        <span className="min-w-0 flex-1 truncate text-fg-2">{t.title}</span>
        {(added > 0 || removed > 0) && <DiffStat added={added} removed={removed} />}
        {diffs.length > 0 && <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />}
      </button>
      {open && (
        <div className="mt-1 ml-7 space-y-2">
          {diffs.map((f) => (
            <div key={f.path} className="overflow-hidden rounded-lg border border-line">
              <div className="border-b border-line bg-bg-1 px-3 py-1 font-mono text-[12px] text-fg-2">{f.path}</div>
              <DiffView diff={f.diff!} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// read_document in the agent's folded work: "Read report.docx" like its other reads; open, the text it
// got (all of it, fetched when the first page of the timeline carried a shortened copy) and the file.
import { useEffect, useState } from 'react';
import { ChevronRight, FolderOpen, XCircle } from 'lucide-react';
import type { TimelineItem, ToolInfo, ToolItem } from '@shared/types';
import { api, enc } from '../../lib/api';
import { basename, duration } from '../../lib/format';
import { openFile } from '../../lib/nav';
import { useApp, useSessions } from '../../lib/store';
import { cx } from '../../components/ui';
import { FileIcon, resolveIn } from './fileTypes';

export const docPath = (t: ToolInfo): string | undefined => {
  const p = (t.input as { path?: unknown } | undefined)?.path;
  return typeof p === 'string' && p.trim() ? p.trim() : undefined;
};

export function ReadRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<string>();
  const cwd = useSessions((s) => s.byKey[sessionKey]?.cwd);
  const home = useApp((s) => s.boot?.home);
  const given = docPath(t);
  const path = given ? resolveIn(given, cwd, home) : undefined;
  const running = t.status === 'running' || t.status === 'pending';
  const failed = t.status === 'error';
  useEffect(() => {
    if (!open || !t.truncated || full !== undefined || running) return;
    let alive = true;
    api<TimelineItem>(`/api/sessions/${enc(sessionKey)}/items/${enc(item.id)}`).then(
      (it) => alive && it.kind === 'tool' && setFull(it.tool.output ?? ''),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [open, t.truncated, running, full, item.id, sessionKey]);
  const output = full ?? t.output ?? '';
  const head = output.split('\n')[0];
  return (
    <div className="tl-item">
      <button onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        {path ? <FileIcon path={path} size={18} className="!rounded-[5px]" /> : <span className="h-[18px] w-[18px] shrink-0" />}
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
          <span className={cx('shrink-0', running ? 'text-fg' : 'text-fg-3')}>{running ? 'Reading' : failed ? 'Could not read' : 'Read'}</span>
          <span className={cx('min-w-0 truncate', running ? 'shine' : 'text-fg-2')}>{path ? basename(path) : 'a document'}</span>
        </span>
        {!running && !failed && head.includes(' · ') && <span className="min-w-0 max-w-[40%] shrink truncate text-[11.5px] text-fg-3 max-sm:hidden">{head.split(' · ').slice(1).join(' · ')}</span>}
        {t.durationMs != null && t.durationMs >= 1500 && <span className="tnum shrink-0 text-[11px] text-fg-3 max-sm:hidden">{duration(t.durationMs)}</span>}
        {running && <span className="mx-1 h-1.5 w-1.5 shrink-0 rounded-full bg-busy" aria-label="Running" />}
        {failed && <XCircle size={14} className="shrink-0 text-err" />}
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <div className="space-y-2 pt-1.5 pb-2 pl-7">
          {path && (
            <button onClick={() => openFile(path)} className="flex min-w-0 items-center gap-1.5 text-[12px] text-accent hover:underline">
              <FolderOpen size={12} className="shrink-0" />
              <span className="truncate">Open {basename(path)}</span>
            </button>
          )}
          {output ? (
            <pre className={cx('term-out max-h-[360px] overflow-auto rounded-lg border border-line px-3 py-2 whitespace-pre-wrap', failed && 'text-err')}>{output}</pre>
          ) : (
            running && <div className="text-[12.5px] text-fg-3">Reading…</div>
          )}
        </div>
      )}
    </div>
  );
}

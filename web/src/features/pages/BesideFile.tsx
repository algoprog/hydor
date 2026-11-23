// A document that is a file (Markdown, a Word, Excel or PowerPoint file, a PDF, LaTeX, a notebook, a table), beside a
// session's conversation or over everything: the file as the file window shows it (FileView: its editor or its preview,
// which reads it again as an agent or a command changes it), under the panel's own top line. While an agent writes it
// whole as text (a Write call coming in, server/pages/drafts.ts), its text shows as it comes: Markdown as it will look,
// anything else as it is written. Once the call has run, the file itself takes its place.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { kindLabel } from '@shared/documents';
import type { PageDraft } from '@shared/pages';
import type { ItemStatus, TimelineItem } from '@shared/types';
import { basename, dirname } from '../../lib/format';
import { useLive, useTimeline } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import { FileIcon } from '../documents/fileTypes';
import { FileView } from '../files/FilesPage';
import { useDiscardGuard } from '../settings/Instructions';
import { useOwnScroll } from './live';
import { useDrafts } from './state';

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

/** How far back in a conversation a call that is being written is looked for. */
const LOOK_BACK = 400;
/** A call that came whole while this was open, whose step never shows in the conversation, stops counting as being written after this. */
const LOST_MS = 4000;

const statusIn = (items: TimelineItem[] | undefined, id: string): ItemStatus | undefined => {
  if (!items) return undefined;
  for (let i = items.length - 1; i >= 0 && i >= items.length - LOOK_BACK; i--) {
    const it = items[i];
    if (it.id === id) return it.kind === 'tool' ? it.tool.status : undefined;
  }
  return undefined;
};

/** How the call that writes the file stands: as the conversation has it, with what is known of it since. */
function useCallStatus(key: string, id: string | undefined): ItemStatus | undefined {
  const kept = useTimeline((x) => (id ? statusIn(x.byKey[key]?.items, id) : undefined));
  const live = useLive((x) => {
    const ov = id ? x.byKey[key]?.overlay : undefined;
    return ov ? (ov.patches?.[id!]?.status ?? (kept ? undefined : statusIn(ov.items, id!))) : undefined;
  });
  return live ?? kept;
}

/** The newest Write of this file in the session, as its call comes in. */
const newestDraft = (drafts: Record<string, PageDraft> | undefined, path: string): PageDraft | null => {
  let best: PageDraft | null = null;
  for (const d of Object.values(drafts ?? {})) if (d.tool === 'file' && d.path === path && (!best || d.startedAt > best.startedAt)) best = d;
  return best;
};

/** The text of a document as an agent writes it, kept at its end unless the reader scrolled away. */
function DraftText({ path, text }: { path: string; text: string }) {
  const md = /\.(md|markdown)$/i.test(path);
  // A Markdown document's own HTML, and the pictures beside it: as the file's preview shows it once it is written.
  const [mdHtml, setMdHtml] = useState<typeof import('../../components/markdownHtml') | null>(null);
  useEffect(() => {
    if (md && !mdHtml) import('../../components/markdownHtml').then(setMdHtml, () => {});
  }, [md, mdHtml]);
  const images = useMemo(() => mdHtml?.localImages(dirname(path)), [mdHtml, path]);
  const scroller = useRef<HTMLDivElement>(null);
  const own = useOwnScroll(scroller);
  useEffect(() => {
    const el = scroller.current;
    if (el && !own()) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <div ref={scroller} tabIndex={-1} className="h-full overflow-auto bg-bg outline-none">
      <div className="mx-auto max-w-[860px] px-5 py-6">
        {!text ? (
          <Throbber className="text-fg-3" />
        ) : md ? (
          mdHtml ? (
            <Markdown text={text} rehypeExtra={mdHtml.MD_HTML} resolveImage={images} baseDir={dirname(path)} />
          ) : (
            <Throbber className="text-fg-3" />
          )
        ) : (
          <pre translate="no" className="font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-fg-2">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * `layout`: beside the conversation (`panel`) or over everything (`page`, or `sheet` on a phone). `tail` draws the
 * buttons at the end of its top line, given a way to ask about changes not saved before it goes on (false: stay).
 * `onDirty` hears whether the file has changes not saved.
 */
export function SessionFile({
  sessionKey: key,
  path,
  layout,
  tail,
  onDirty,
}: {
  sessionKey: string;
  path: string;
  layout: 'panel' | 'sheet' | 'page';
  tail: (leave: () => Promise<boolean>) => ReactNode;
  onDirty?: (dirty: boolean) => void;
}) {
  const guard = useDiscardGuard();
  const dirty = useRef(false);
  const setDirty = useCallback(
    (d: boolean) => {
      dirty.current = d;
      guard.setDirty(d);
      onDirty?.(d);
    },
    [guard.setDirty, onDirty],
  );
  useEffect(() => {
    // Writes of it coming in now, when the panel opens mid-way.
    useDrafts.getState().load(key).catch(() => {});
  }, [key]);

  const draft = useDrafts((x) => newestDraft(x.byKey[key], path));
  const status = useCallStatus(key, draft?.id);
  // Each write of it, as it is first seen here: one that starts while the file has changes of yours not saved leaves
  // them on screen (the file then says it changed on disk), and one seen coming in is followed until its step has run.
  const seen = useRef<string | null>(null);
  const held = useRef<string | null>(null);
  const watched = useRef<string | null>(null);
  if (draft && seen.current !== draft.id) {
    seen.current = draft.id;
    if (dirty.current && !draft.done) held.current = draft.id;
  }
  if (draft && !draft.done) watched.current = draft.id;
  // Its call came whole while this watched, and its step is not in the conversation yet: for a moment, it is still on
  // its way to run. (One that was whole before this opened, its step nowhere near, was written long ago.)
  const [lost, setLost] = useState<string | null>(null);
  const waits = !!draft && draft.done && status === undefined && watched.current === draft.id;
  useEffect(() => {
    if (!waits || !draft) return;
    const t = setTimeout(() => setLost(draft.id), LOST_MS);
    return () => clearTimeout(t);
  }, [waits, draft?.id]);
  const running = status === 'running' || status === 'pending' || status === 'waiting';
  const writing = !!draft && held.current !== draft.id && (!draft.done || running || (waits && lost !== draft.id));
  // The file is read anew each time a write of it has run.
  const round = useRef(0);
  const was = useRef(writing);
  if (was.current !== writing) {
    if (!writing) round.current++;
    was.current = writing;
  }
  useEffect(() => {
    if (writing) setDirty(false);
  }, [writing, setDirty]);

  // What it is ("Markdown", "Word document"): where it is shows in the file's own line under this one.
  const sub = writing ? (!draft!.done ? `Writing · ${kb(draft!.text.length)}` : status === 'waiting' ? 'Waiting for your OK' : 'Saving…') : kindLabel(path);
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileIcon path={path} size={32} className={cx('rounded-lg', writing && 'opacity-80')} />
          <span className="min-w-0">
            <span translate="no" className="block truncate text-[13.5px] font-medium text-fg" title={path}>
              {basename(path)}
            </span>
            <span className="flex items-center gap-1.5 truncate text-[11.5px] text-fg-3">
              {writing && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
              <span className="truncate">{sub}</span>
            </span>
          </span>
        </div>
        {tail(guard.leave)}
      </div>
      <div className={cx('min-h-0 flex-1', layout === 'sheet' && 'pb-[var(--safe-bottom)]')}>
        {writing ? <DraftText path={path} text={draft!.text} /> : <FileView key={`${path}:${round.current}`} path={path} embedded narrow={layout === 'panel'} onDirty={setDirty} />}
      </div>
      {guard.node}
    </div>
  );
}

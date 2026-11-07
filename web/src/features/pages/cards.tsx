// The pages agents keep and publish, as they show in the conversation. save_page: the saved page
// itself, working (its storage is the page's own), with Open for Pages. publish_site: a card that
// needs the user, private or public link, Publish or Not now; then the link, or what happened.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppWindow, ChevronRight, Expand, ExternalLink, FileText, Globe, GlobeLock, NotebookText, PenLine, Presentation, Sheet, Sigma, Workflow } from 'lucide-react';
import type { PublishRequest, SiteVisibility } from '@shared/pages';
import type { ToolInfo, ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { bytes, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, IconButton, Segmented, Throbber, useMediaQuery } from '../../components/ui';
import { editPage, SmallPageCard, useOpensBeside, usePicks } from '../session/HtmlPage';
import { StepLine, ToolDetail } from '../session/items';
import { PageFrame, pageStore, StreamFrame, usePreviewMax } from './frame';
import { PageOverlay } from './overlay';
import { absolute, CANVAS_MEDIA, onScreen, requestRef, savedRef, useCanvas, useDrafts, usePagesStore } from './state';
import { openOver, showBeside } from './Canvas';

/** A line under a card while a call runs, or when it failed. */
function Note({ children }: { children: ReactNode }) {
  return <div className="tl-item my-1 flex items-center gap-2 px-1 text-[12.5px] text-fg-3">{children}</div>;
}

const failure = (item: ToolItem) => (item.tool.output ?? item.tool.error ?? '').slice(0, 300);

/** The icon square every card here leads with, as the file cards do. */
function Tile({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'muted' }) {
  return <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]', tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-3')}>{children}</span>;
}

// ---- get_page --------------------------------------------------------------------------------------

/** How get_page reads as a step: what the agent read of Pages. */
export function readPageStep(t: { status: string; input?: unknown }) {
  const id = (t.input as { id?: unknown } | undefined)?.id;
  const title = typeof id === 'string' && id ? usePagesStore.getState().pages?.find((p) => p.id === id)?.title : undefined;
  return {
    category: 'read' as const,
    verb: t.status === 'running' || t.status === 'pending' ? 'Reading' : 'Read',
    title: typeof id === 'string' && id ? (title ? `the page “${title}”` : 'a saved page') : 'the list of saved pages',
  };
}

const FORMAT_NAMES: Record<string, string> = { pdf: 'a PDF', docx: 'a Word document', pptx: 'a PowerPoint file', html: 'a web page' };

/** How export_page reads as a step: which page it saved as a file, and as what. */
export function exportPageStep(t: { status: string; input?: unknown }) {
  const a = (t.input ?? {}) as { id?: unknown; format?: unknown };
  const title = typeof a.id === 'string' ? usePagesStore.getState().pages?.find((p) => p.id === a.id)?.title : undefined;
  const as = typeof a.format === 'string' ? (FORMAT_NAMES[a.format] ?? a.format) : 'a file';
  return {
    category: 'edit' as const,
    verb: t.status === 'running' || t.status === 'pending' ? 'Saving' : 'Saved',
    title: `${title ? `“${title}”` : 'a page'} as ${as}`,
  };
}

/** How page_action reads as a step: what it did to which page (the editor's action, by its name). */
export function pageActionStep(t: ToolInfo) {
  const a = (t.input ?? {}) as { id?: unknown; action?: unknown };
  const title = /^Saved "(.+?)" \(page /.exec(t.output ?? '')?.[1] ?? (typeof a.id === 'string' ? usePagesStore.getState().pages?.find((p) => p.id === a.id)?.title : undefined);
  const what = typeof a.action === 'string' ? a.action.replace(/_/g, ' ') : 'a change';
  const running = t.status === 'running' || t.status === 'pending';
  return {
    category: 'edit' as const,
    verb: running ? 'Changing' : savedRef(t.output) ? 'Changed' : t.status === 'error' ? 'Could not change' : 'Looked at',
    title: `${title ? `“${title}”` : 'a page'} · ${what}`,
  };
}

/** A step of the work, opening to what it read. */
export function ReadPageRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button onClick={() => setOpen((o) => !o)} className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}>
        <StepLine item={item} />
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && <ToolDetail t={item.tool} item={item} sessionKey={sessionKey} />}
    </div>
  );
}

// ---- save_page -------------------------------------------------------------------------------------

type Ref = { id: string; version: number };

/** Of a turn's other saves of a page, the newest with a version to show: the card shows it while a new one is saved. */
function newestSaved(more?: ToolItem[]): { item: ToolItem; ref: Ref } | null {
  let best: { item: ToolItem; ref: Ref } | null = null;
  for (const m of more ?? []) {
    const ref = savedRef(m.tool.output);
    if (ref && (!best || ref.version > best.ref.version)) best = { item: m, ref };
  }
  return best;
}

/** How a save of a page reads among the steps of the work, where the reply shows a newer save of it. */
export function savedPageStep(t: ToolInfo) {
  const ref = savedRef(t.output);
  const a = (t.input ?? {}) as { title?: unknown };
  const title = /^Saved "(.+?)" \(page /.exec(t.output ?? '')?.[1] ?? (typeof a.title === 'string' && a.title.trim() ? a.title.trim() : undefined);
  const named = title ? `“${title}”` : 'the page';
  return {
    category: 'edit' as const,
    verb: t.status === 'running' || t.status === 'pending' || t.status === 'waiting' ? 'Saving' : ref ? 'Saved' : 'Could not save',
    title: ref ? `${named} · version ${ref.version}` : named,
  };
}

/**
 * A page an agent saved (save_page, or save_slides, save_doc, save_sheet, save_latex, save_diagram). Saved several times in a turn,
 * it has one card, at the newest save; the others come as `more`, and while a new save runs the card shows the version
 * before it. Only the page's newest version shows itself, working with its data: a card left behind by a newer one
 * (saved in a later turn, or by you) keeps to its title line.
 */
export function SavedPageCard({ item, sessionKey, more }: { item: ToolItem; sessionKey: string; more?: ToolItem[] }) {
  const own = savedRef(item.tool.output);
  const running = item.tool.status === 'running' || item.tool.status === 'pending';
  // Saved again: until the new version is in (the call may wait on your approval too), the version before it shows.
  const before = own || !(running || item.tool.status === 'waiting') ? null : newestSaved(more);
  const ref: Ref | null = own ?? before?.ref ?? null;
  const saving = !!before;
  const pages = usePagesStore((s) => s.pages);
  const info = ref ? pages?.find((p) => p.id === ref.id) : undefined;
  const draft = useDrafts((x) => x.byKey[sessionKey]?.[item.id]);
  const [page, setPage] = useState<{ title: string; html: string; v: string } | 'gone' | null>(null);
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const onPick = usePicks(sessionKey, full);
  const wide = useMediaQuery(CANVAS_MEDIA);
  const besideOpen = useCanvas((x) => !!x.open[sessionKey]);
  const fit = usePreviewMax();
  useOpensBeside(sessionKey, item);
  useEffect(() => {
    if (!pages) usePagesStore.getState().loadPages().catch(() => {});
  }, []);
  // The newest version, as far as the Library has said (it may not have heard of this one yet; while a save runs, it
  // may have heard of the version being saved, which the card shows once the call is done).
  const current = !!ref && (saving || !info || info.version <= ref.version);
  const v = ref ? `${ref.id}:${ref.version}` : '';
  useEffect(() => {
    if (!ref || !current) return;
    let alive = true;
    // The version shown so far stays until the next one is here.
    api<{ title: string; html: string }>(`/api/pages/${enc(ref.id)}/versions/${ref.version}`)
      .then((r) => alive && setPage({ title: r.title, html: r.html, v }))
      .catch(() => alive && setPage('gone'));
    return () => {
      alive = false;
    };
  }, [v, current]);
  const store = useMemo(() => (ref ? pageStore(ref.id) : null), [ref?.id]);
  const writing = !ref && item.tool.status !== 'error' && (!draft || !draft.done || running);
  const title = info?.title ?? (page && page !== 'gone' ? page.title : undefined) ?? draft?.title ?? 'Page';

  // A save names its kind; page_action's is the page's own, as the Library has it.
  const kind = /save_slides$/.test(item.tool.name) ? 'slides' : /save_doc$/.test(item.tool.name) ? 'doc' : /save_sheet$/.test(item.tool.name) ? 'sheet' : /save_latex$/.test(item.tool.name) ? 'tex' : /save_notebook$/.test(item.tool.name) ? 'notebook' : /save_diagram$/.test(item.tool.name) ? 'diagram' : /page_action$/.test(item.tool.name) ? (info?.kind ?? null) : null;
  const deck = kind !== null;
  // A deck stands whole: its slide is as tall as the card's width makes it (16:9), its buttons under it.
  const max = kind === 'slides' ? Math.max(fit, 900) : fit;
  const noun = kind === 'slides' ? 'the slides' : kind === 'doc' ? 'the document' : kind === 'sheet' ? 'the spreadsheet' : kind === 'tex' ? 'the LaTeX document' : kind === 'notebook' ? 'the notebook' : kind === 'diagram' ? 'the diagram' : 'the page';
  const status = saving ? ' · saving a new version…' : ref && !current ? ' · a newer one is there' : '';
  if (item.tool.status === 'error') return <Note>{`Could not save ${noun}`}: {failure(item)}</Note>;
  if (wide && besideOpen) {
    // What is being written, and how much of the call has come (nothing to count for an agent that hands over whole calls).
    const size = draft?.text ? ` · ${kb(draft.text.length)}` : '';
    const sub = writing
      ? kind === 'doc'
        ? `Writing the document${size}`
        : kind === 'slides'
          ? `Writing the slides${size}`
          : kind === 'sheet'
            ? `Writing the spreadsheet${size}`
            : kind === 'tex'
              ? `Writing the LaTeX document${size}`
              : kind === 'diagram'
                ? `Drawing the diagram${size}`
                : `Writing the page${size}`
      : `Saved in the Library · version ${ref?.version ?? 1}${status}`;
    return (
      <SmallPageCard
        sessionKey={sessionKey}
        item={item}
        title={title}
        sub={sub}
        writing={writing || saving}
        opens={before?.item.id ?? item.id}
        also={more?.map((m) => m.id)}
        pageId={current ? ref?.id : undefined}
      />
    );
  }
  if (writing && deck) {
    const label = kind === 'slides' ? 'Making the slides…' : kind === 'doc' ? 'Writing the document…' : kind === 'tex' ? 'Writing and typesetting the LaTeX…' : kind === 'notebook' ? 'Keeping the notebook…' : kind === 'diagram' ? 'Drawing the diagram…' : 'Making the spreadsheet…';
    // Where there is no room beside the conversation (a phone, a narrow window): a tap opens it over everything, to
    // watch it being written as the panel shows it. (Beside a page in the Library, that page is the one in view.)
    if (draft && kind !== 'notebook' && onScreen(sessionKey))
      return (
        <button
          type="button"
          onClick={() => showBeside(sessionKey, { kind: 'item', id: item.id }) || openOver(sessionKey, { kind: 'item', id: item.id })}
          className="tl-item my-1 flex min-h-9 items-center gap-2 px-1 text-left text-[12.5px] text-fg-3 hover:text-fg-2"
        >
          <Throbber /> {label}
          <span className="font-medium text-accent">Open</span>
        </button>
      );
    return (
      <Note>
        <Throbber /> {label}
      </Note>
    );
  }
  if (writing)
    return draft?.text ? (
      <div className="tl-item my-1.5 overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[13px]">
          <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />
          <span translate="no" className="min-w-0 flex-1 truncate font-medium text-fg-2">
            {title}
          </span>
          <span className="shrink-0 text-[12px] text-fg-3">Writing · {kb(draft.text.length)}</span>
        </div>
        <div style={{ height: Math.min(Math.max(height, 120), max) }} className="relative">
          <StreamFrame html={draft.text} title={title} onHeight={setHeight} />
        </div>
      </div>
    ) : (
      <Note>
        <Throbber /> Saving the page…
      </Note>
    );
  if (!ref)
    return (
      <Note>
        <Throbber /> Saving the page…
      </Note>
    );
  if (pages && !info) return <Note>This page was deleted from Pages.</Note>;
  const open = () => go(`/pages/${ref.id}`);
  const shown = current && page && page !== 'gone' ? page : null;
  return (
    <div className="tl-item my-1.5 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-3 py-2.5 pr-2 pl-2.5">
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Tile>
            {kind === 'slides' ? <Presentation size={19} strokeWidth={1.8} /> : kind === 'doc' ? <FileText size={19} strokeWidth={1.8} /> : kind === 'sheet' ? <Sheet size={19} strokeWidth={1.8} /> : kind === 'tex' ? <Sigma size={19} strokeWidth={1.8} /> : kind === 'notebook' ? <NotebookText size={19} strokeWidth={1.8} /> : kind === 'diagram' ? <Workflow size={19} strokeWidth={1.8} /> : <AppWindow size={19} strokeWidth={1.8} />}
          </Tile>
          <span className="min-w-0 flex-1">
            <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
              {title}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-fg-3">
              {saving && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
              <span className="min-w-0 truncate">
                {kind === 'slides' ? 'Slides in the Library' : kind === 'doc' ? 'A document in the Library' : kind === 'sheet' ? 'A spreadsheet in the Library' : kind === 'tex' ? 'LaTeX in the Library' : kind === 'notebook' ? 'A notebook in the Library' : kind === 'diagram' ? 'A diagram in the Library' : 'Saved in the Library'} · version {ref.version}
                {status}
              </span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="subtle" onClick={open} className="h-8 px-2.5">
            Open
          </Button>
          <IconButton label="Edit" onClick={() => editPage(sessionKey, { kind: 'page', id: ref.id })}>
            <PenLine size={15} />
          </IconButton>
          {shown && (
            <IconButton label="Full screen" onClick={() => setFull(true)}>
              <Expand size={16} />
            </IconButton>
          )}
        </div>
      </div>
      {!current ? null : page === 'gone' ? (
        <div className="border-t border-line px-3 py-2.5 text-[12.5px] text-fg-3">This version is no longer kept; Open shows the latest.</div>
      ) : !shown || !store ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-3 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div style={{ height: Math.min(Math.max(height, 60), max) }} className="relative border-t border-line transition-[height] duration-200">
          {!full && <PageFrame key={shown.v} html={shown.html} title={title} store={store} onHeight={setHeight} onPick={onPick} />}
          {height > max && !full && (
            // The page fades into the card under the button, so its words never run behind the button's.
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-panel via-panel/85 to-transparent pt-14 pb-3">
              <button
                onClick={() => setFull(true)}
                className="pointer-events-auto rounded-full border border-line-2 bg-bg-1 px-3.5 py-1.5 text-[12.5px] font-medium text-fg shadow-sm transition-colors hover:bg-bg-2"
              >
                See the whole page
              </button>
            </div>
          )}
        </div>
      )}
      {full && shown && store && (
        <PageOverlay title={title} onClose={() => setFull(false)}>
          <PageFrame key={shown.v} html={shown.html} title={title} store={store} onPick={onPick} fill />
        </PageOverlay>
      )}
    </div>
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`);

// ---- publish_site ----------------------------------------------------------------------------------

/** Where a request's content comes from, in a few words. */
export function sourceText(r: { kind: 'folder' | 'page'; folder?: string; pageTitle?: string; pageId?: string; files?: number; bytes?: number }, home?: string) {
  if (r.kind === 'page') return `the saved page “${r.pageTitle ?? r.pageId}”`;
  return `${tildify(r.folder ?? '', home)}${r.files != null ? ` · ${r.files} file${r.files === 1 ? '' : 's'}` : ''}${r.bytes ? ` · ${bytes(r.bytes)}` : ''}`;
}

export const VISIBILITY: { value: SiteVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Private link', hint: 'An unguessable link: only people you give it to can open it.' },
  { value: 'public', label: 'Public link', hint: 'A readable link made from its name: anyone may find and open it.' },
];

/** A published site's link, to copy or open. */
export function SiteLink({ path }: { path: string }) {
  const url = absolute(path);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[12px] text-fg-2" title={url}>
        {url}
      </code>
      <CopyButton text={url} label="Copy the link" />
      <a href={url} target="_blank" rel="noopener noreferrer" title="Open" aria-label="Open" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg">
        <ExternalLink size={13} />
      </a>
    </div>
  );
}

export function PublishCard({ item }: { item: ToolItem; sessionKey: string }) {
  const id = requestRef(item.tool.output);
  const home = useApp((s) => s.boot?.home);
  const req = usePagesStore((s) => (id ? s.requests[id] : undefined));
  const [missing, setMissing] = useState(false);
  const [vis, setVis] = useState<SiteVisibility>('private');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!id || req) return;
    api<{ request: PublishRequest }>(`/api/sites/requests/${enc(id)}`)
      .then((r) => usePagesStore.getState().setRequest(r.request))
      .catch(() => setMissing(true));
  }, [id]);
  const decide = async (yes: boolean) => {
    setBusy(true);
    try {
      const r = await post<{ request: PublishRequest }>(`/api/sites/requests/${enc(id!)}`, { publish: yes, visibility: vis });
      usePagesStore.getState().setRequest(r.request);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (item.tool.status === 'error') return <Note>Could not ask to publish: {failure(item)}</Note>;
  if (!id)
    return (
      <Note>
        <Throbber /> Asking to publish…
      </Note>
    );
  if (missing) return <Note>This request to publish is no longer here.</Note>;
  if (!req)
    return (
      <Note>
        <Throbber />
      </Note>
    );
  const open = req.status === 'open';
  const site = req.site;
  return (
    <div className={cx('tl-item my-1.5 overflow-hidden rounded-xl border bg-panel sm:max-w-[34rem]', open ? 'border-accent/45 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line')}>
      <div className="flex items-center gap-3 py-2.5 pr-3 pl-2.5">
        <Tile tone={req.status === 'declined' || req.status === 'failed' ? 'muted' : 'accent'}>
          {site?.visibility === 'private' ? <GlobeLock size={19} strokeWidth={1.8} /> : <Globe size={19} strokeWidth={1.8} />}
        </Tile>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {open ? `Publish “${req.name}”?` : req.status === 'published' ? `Published “${req.name}”` : req.status === 'failed' ? `“${req.name}” was not published` : `Not published: “${req.name}”`}
          </span>
          <span className="block truncate text-[12px] leading-4 text-fg-3" title={req.folder}>
            {site ? `${site.visibility === 'public' ? 'Public' : 'Private'} link · ` : ''}
            {sourceText(req, home)}
          </span>
        </span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<SiteVisibility> size="sm" value={vis} onChange={setVis} options={VISIBILITY.map((v) => ({ value: v.value, label: v.label }))} />
          </div>
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            {VISIBILITY.find((v) => v.value === vis)!.hint} It opens in a sandbox, apart from this app; unpublish it any time in the Library.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={<Globe size={14} />} disabled={busy} onClick={() => decide(true)}>
              Publish
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
              Not now
            </Button>
          </div>
        </div>
      )}
      {site && (
        <div className="border-t border-line px-3 py-2.5">
          <SiteLink path={site.path} />
        </div>
      )}
      {req.status === 'failed' && req.error && <div className="border-t border-line px-3 py-2.5 text-[12.5px] text-err">{req.error}</div>}
    </div>
  );
}

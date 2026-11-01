// The pages agents keep and publish, as they show in the conversation. save_page: the saved page
// itself, working (its storage is the page's own), with Open for Pages. publish_site: a card that
// needs the user, private or public link, Publish or Not now; then the link, or what happened.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppWindow, ChevronRight, Expand, ExternalLink, Globe, GlobeLock, PenLine } from 'lucide-react';
import type { PublishRequest, SiteVisibility } from '@shared/pages';
import type { ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { bytes, tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, IconButton, Segmented, Throbber, useMediaQuery } from '../../components/ui';
import { editPage, SmallPageCard, useOpensBeside, usePicks } from '../session/HtmlPage';
import { StepLine, ToolDetail } from '../session/items';
import { PageFrame, pageStore, previewStore, StreamFrame } from './frame';
import { PageOverlay } from './overlay';
import { absolute, CANVAS_MEDIA, requestRef, savedRef, useCanvas, useDrafts, usePagesStore } from './state';

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

export function SavedPageCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const ref = savedRef(item.tool.output);
  const pages = usePagesStore((s) => s.pages);
  const info = ref ? pages?.find((p) => p.id === ref.id) : undefined;
  const draft = useDrafts((x) => x.byKey[sessionKey]?.[item.id]);
  const [page, setPage] = useState<{ title: string; html: string } | 'gone' | null>(null);
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const onPick = usePicks(sessionKey, full);
  const wide = useMediaQuery(CANVAS_MEDIA);
  const besideOpen = useCanvas((x) => !!x.open[sessionKey]);
  useOpensBeside(sessionKey, item);
  useEffect(() => {
    if (!pages) usePagesStore.getState().loadPages().catch(() => {});
  }, []);
  useEffect(() => {
    if (!ref) return;
    let alive = true;
    api<{ title: string; html: string }>(`/api/pages/${enc(ref.id)}/versions/${ref.version}`)
      .then((v) => alive && setPage(v))
      .catch(() => alive && setPage('gone'));
    return () => {
      alive = false;
    };
  }, [ref?.id, ref?.version]);
  // The version this call saved works with the page's data; an older one shows it without changing it.
  const current = !!info && info.version === ref?.version;
  const store = useMemo(() => (ref ? (current ? pageStore(ref.id) : previewStore(ref.id)) : null), [ref?.id, current]);
  const writing = !ref && item.tool.status !== 'error' && (!draft || !draft.done || item.tool.status === 'running' || item.tool.status === 'pending');
  const title = info?.title ?? (page && page !== 'gone' ? page.title : undefined) ?? draft?.title ?? 'Page';

  if (item.tool.status === 'error') return <Note>Could not save the page: {failure(item)}</Note>;
  if (wide && besideOpen) {
    const sub = writing ? `Writing the page · ${kb(draft?.text.length ?? 0)}` : `Saved in Pages · version ${ref?.version ?? 1}${info && !current ? ' · a newer one is there' : ''}`;
    return <SmallPageCard sessionKey={sessionKey} item={item} title={title} sub={sub} writing={writing} />;
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
        <div style={{ height: Math.min(Math.max(height, 120), 560) }} className="relative">
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
  const frameKey = `${ref.id}:${ref.version}:${current}`;
  return (
    <div className="tl-item my-1.5 overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-3 py-2.5 pr-2 pl-2.5">
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Tile>
            <AppWindow size={19} strokeWidth={1.8} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
              {title}
            </span>
            <span className="block truncate text-[12px] leading-4 text-fg-3">
              Saved in Pages · version {ref.version}
              {info && !current ? ' · a newer one is there' : ''}
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
          {page && page !== 'gone' && (
            <IconButton label="Full screen" onClick={() => setFull(true)}>
              <Expand size={16} />
            </IconButton>
          )}
        </div>
      </div>
      {page === 'gone' ? (
        <div className="border-t border-line px-3 py-2.5 text-[12.5px] text-fg-3">This version is no longer kept; Open shows the latest.</div>
      ) : !page || !store ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-3 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div style={{ height: Math.min(Math.max(height, 60), 900) }} className="relative border-t border-line transition-[height] duration-200">
          {!full && <PageFrame key={frameKey} html={page.html} title={title} store={store} onHeight={setHeight} onPick={onPick} />}
          {height > 900 && !full && (
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
      {full && page && page !== 'gone' && store && (
        <PageOverlay title={title} onClose={() => setFull(false)}>
          <PageFrame key={frameKey} html={page.html} title={title} store={store} onPick={onPick} />
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
    <div className={cx('tl-item my-1.5 overflow-hidden rounded-xl border bg-panel sm:max-w-[34rem]', open ? 'anim-pop border-accent/45 shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line')}>
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
            {VISIBILITY.find((v) => v.value === vis)!.hint} It opens in a sandbox, apart from this app; unpublish it any time in Pages.
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

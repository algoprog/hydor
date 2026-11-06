// The Library's pages, each at its own place (/pages/<id>): a page to use, edit (visually or as code) and save, a deck
// to edit and present (/pages/<id>/show is the audience's window of a presentation), with versions (view one, bring
// it back), Export (PDF, Word, PowerPoint, a web page), the data it keeps, its own address for a phone's home screen,
// Publish, the space it is in, and Ask: an agent changes it while you watch. The Library itself is Library.tsx;
// /pages, its old address, opens it.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { AppDef } from '@shared/apps';
import { appInfo } from '@shared/app-manifest';
import { useLocation, useSearch } from 'wouter';
import {
  AppWindow,
  ArrowLeft,
  Copy,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  FolderInput,
  FolderTree,
  Globe,
  GlobeLock,
  History,
  Link2,
  Lock,
  LockOpen,
  Pencil,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { VERSION_LIMITS, type PageDataEntry, type PageInfo, type PageVersion } from '@shared/pages';
import type { Deck } from '@shared/slides';
import { api, del, enc, patch, post } from '../../lib/api';
import { ago, bytes } from '../../lib/format';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, Empty, IconButton, MenuItem, MenuLabel, MenuSep, Popover, Throbber, useConfirm, useIsMobile, useMediaQuery } from '../../components/ui';
import { BacklinksPopover, LockBand, lockPage, pageWords } from './PageExtras';
import { LOCALE } from '../../i18n/locale';
import { NavButton, PageHeader } from '../layout/PageHeader';
import { Library } from './Library';
import { PublishDialog, RenameDialog } from './parts';
import { SpaceMenu } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { pageStore, previewStore, type AppBridge } from './frame';
import { absolute, usePagesStore } from './state';
import { FolderMenu, moveToFolder, placeFolders, placeTopName } from './folders';
import { Studio, type StudioDoc } from './studio/Studio';
import { tr } from '../../i18n/runtime';
import { askNow, closePageAsk, openPageAsk, PageAskPanel, PageAskPill, usePageAsk } from './AskPage';
import { loadModelVersion, type AskScope } from './kinds';
import { useLiveDraft, usePageDraft } from './live';
import { EDITORS } from './editors';
import { exportFile, type ExportFormat } from './exportFile';
import { EXPORTS } from './exports';
import { AudienceView } from './slides/Present';

export function PagesRoute() {
  const [loc] = useLocation();
  const search = useSearch();
  const show = /^\/pages\/([a-f0-9]{10})\/show$/.exec(loc)?.[1];
  // The Library's old address (and its tabs, "New page"…) opens the Library.
  useEffect(() => {
    if (loc === '/pages') go(`/library${search ? `?${search}` : ''}`, true);
  }, [loc, search]);
  if (show) return <AudienceView id={show} />;
  const id = /^\/pages\/([a-f0-9]{10})$/.exec(loc)?.[1];
  // One view a page (key): what one page's view still does as it is left (saving it) never lands on the next one.
  return id ? <PageView key={id} id={id} /> : <Library />;
}

// ---- a page's own place ---------------------------------------------------------------------------

/** Its own address (for a phone's home screen) and publishing, in one place. */
function ShareMenu({ page, link, anchor, open, onClose, onPublish, onReset }: { page: PageInfo; link: string; anchor: RefObject<HTMLButtonElement | null>; open: boolean; onClose: () => void; onPublish: () => void; onReset: () => void }) {
  const url = absolute(link);
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={340}>
      <div className="space-y-2 p-2.5 text-[13px]">
        <div className="flex items-center gap-2 font-medium">
          <Smartphone size={15} className="text-fg-3" />
          On your phone
        </div>
        <p className="text-[12.5px] leading-relaxed text-fg-3">Its own address opens just the page, with its data, without signing in. Add it to the home screen: Safari’s Share → Add to Home Screen, or Chrome’s ⋮ → Add to Home screen.</p>
        <div className="flex items-center gap-1.5 rounded-lg border border-line bg-bg-1 px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={url}>
            {url}
          </code>
          <CopyButton text={url} label="Copy the address" />
          <a href={url} target="_blank" rel="noopener noreferrer" title="Open" aria-label="Open" className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg">
            <ExternalLink size={13} />
          </a>
        </div>
        <button type="button" onClick={onReset} className="text-[12px] text-fg-3 underline-offset-2 hover:text-fg-2 hover:underline">
          Give it a new address (the old one stops working)
        </button>
      </div>
      <MenuSep />
      <MenuItem icon={page.published ? <GlobeLock size={14} /> : <Globe size={14} />} onClick={onPublish}>
        {page.published ? 'Publish it again, at another link' : 'Publish at a link others can open'}
      </MenuItem>
      {page.published && (
        <MenuItem icon={<Globe size={14} />} onClick={() => (onClose(), go('/library?tab=published'))}>
          See where it is published
        </MenuItem>
      )}
    </Popover>
  );
}

/** What a page keeps (window.hydor.storage): each value, to look at, remove one, download or clear. */
function DataDialog({ page, open, onClose }: { page: PageInfo; open: boolean; onClose: () => void }) {
  const [list, setList] = useState<PageDataEntry[] | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = () =>
    api<{ entries: PageDataEntry[] }>(`/api/pages/${enc(page.id)}/data`)
      .then((r) => setList(r.entries))
      .catch(toastError);
  useEffect(() => {
    if (open) {
      setList(null);
      void load();
    }
  }, [open, page.id]);
  const remove = async (k: string) => {
    if (!(await confirm({ title: `Remove “${k}”?`, body: 'The page forgets this value. It can’t be undone.', confirm: 'Remove', danger: true }))) return;
    await post(`/api/pages/${enc(page.id)}/storage`, { op: 'remove', key: k }).catch(toastError);
    void load();
  };
  const clear = async () => {
    if (!(await confirm({ title: 'Forget everything this page keeps?', body: 'Every value goes. The page itself stays. This can’t be undone.', confirm: 'Forget it all', danger: true }))) return;
    await del(`/api/pages/${enc(page.id)}/data`).catch(toastError);
    void load();
  };
  const download = () => {
    const data = Object.fromEntries((list ?? []).map((e) => [e.key, e.value]));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}-data.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="What the page keeps"
      width={560}
      footer={
        <>
          {!!list?.length && (
            <Button variant="ghost" icon={<Trash2 size={14} />} onClick={clear} className="mr-auto text-err">
              Forget it all
            </Button>
          )}
          {!!list?.length && (
            <Button variant="secondary" icon={<Download size={14} />} onClick={download}>
              Download
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {confirmNode}
      {!list ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber />
        </div>
      ) : !list.length ? (
        <p className="py-2 text-[13.5px] text-fg-3">It keeps nothing yet. What you enter in it (a log, ticked boxes) shows here.</p>
      ) : (
        <div className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {list.map((e) => (
            <div key={e.key}>
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setShown(shown === e.key ? null : e.key)} className="min-w-0 flex-1 text-left">
                  <span translate="no" className="block truncate font-mono text-[12.5px] text-fg">
                    {e.key}
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-3">
                    {bytes(e.bytes)} · {ago(e.updatedAt)}
                  </span>
                </button>
                <IconButton label="Remove" size="sm" onClick={() => remove(e.key)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
              {shown === e.key && (
                <pre translate="no" className="max-h-60 overflow-auto border-t border-line bg-bg-1 px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap text-fg-2">
                  {JSON.stringify(e.value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// ---- making a page -------------------------------------------------------------------------------------

interface Loaded {
  page: PageInfo;
  /** A page's HTML, or another kind's model (a deck, a document, a spreadsheet). */
  html?: string;
  model?: unknown;
  versions: PageVersion[];
  link: string;
}

const BY: Record<PageVersion['by'], string> = { agent: 'by the agent', user: 'kept by you', restore: 'brought back', edit: 'changed by you', made: 'made by you' };

/**
 * Where a request to an agent is for: what the open editor offers (this slide, the section the caret is in, the
 * cells picked…), then the part "Ask the agent about it" named; a page of HTML: the whole page, or the part picked.
 */
/** A request's words as its chip shows them: without the ids and sources it carries for the agent ("On slide 3, the title: Pricing"). */
const chipOf = (lead: string) =>
  lead
    .replace(/\s*\(([^()]*?),\s*id [\w-]+\)/g, ' ($1)')
    .replace(/\s*\((?:id [\w-]+|\w+ part [^()]*|naget-(?:asset|video):[\w]+)\)/g, '')
    .replace(/: $/, '');

function scopesOf(page: PageInfo, fromEditor: AskScope[], part: string | null): AskScope[] {
  if (page.kind) return part ? [...fromEditor, { id: 'asked', label: chipOf(part), lead: part }] : fromEditor;
  const out: AskScope[] = [{ id: 'page', label: tr('The whole page'), lead: '' }];
  if (part) out.push({ id: 'part', label: `${tr('The part picked')}: ${part.replace(/^On the page “[^”]*”, the /, '').replace(/ \(`[^`]*`\): $/, '')}`, lead: part });
  return out;
}

function PageView({ id }: { id: string }) {
  const mobile = useIsMobile();
  const search = useSearch();
  const wideAsk = useMediaQuery('(min-width: 1100px)');
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An older version on view.
  const [old, setOld] = useState<{ version: number; title: string; html?: string; model?: unknown } | null>(null);
  const [menu, setMenu] = useState<'history' | 'more' | 'share' | 'export' | 'space' | 'folder' | 'links' | null>(null);
  // The Library's folders, for More → Move to a folder (loaded with the list, when it is not yet).
  const folders = usePagesStore((s) => s.folders);
  useEffect(() => {
    if (!usePagesStore.getState().folders) usePagesStore.getState().loadPages().catch(() => {});
  }, []);
  const spaces = useSpaces();
  const [dialog, setDialog] = useState<'rename' | 'publish' | 'data' | null>(null);
  const [scopes, setScopes] = useState<AskScope[]>([]);
  const [part, setPart] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const historyRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const saveFirst = useRef<(() => Promise<boolean>) | null>(null);
  // Leaving the page for another place in the app (another page, a session, Settings) saves what its editor holds
  // and has not saved yet, as Save does (the version before stays among its versions): nothing else would keep it.
  // Closing or reloading the tab asks first.
  const unsaved = useRef(false);
  const [dirty, setDirty] = useState(false);
  const leaving = useRef(false);
  useEffect(
    () => () => {
      leaving.current = true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      void saveFirst.current?.().catch(toastError);
    },
    [],
  );
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (unsaved.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  const ask = usePageAsk();
  const load = () =>
    api<Loaded>(`/api/pages/${enc(id)}`)
      .then((r) => {
        setData(r);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    setData(null);
    setOld(null);
    setPart(null);
    void load();
  }, [id]);
  useFeatureEvent('pages', ({ data: e }) => (e as { what?: string })?.what === 'pages' && load());
  const store = useMemo(() => (old ? previewStore(id) : pageStore(id)), [id, old]);
  // A template's screen works here as on its template's page: window.hydor.app, for that template.
  const [screenOf, setScreenOf] = useState<AppBridge | undefined>();
  const owner = data?.page.app;
  useEffect(() => {
    setScreenOf(undefined);
    if (!owner) return;
    api<{ app?: AppDef }>(`/api/apps/${enc(owner)}`).then(
      (r) => r.app && setScreenOf({ info: appInfo(r.app.id, r.app) }),
      () => {},
    );
  }, [owner]);
  const startMode = new URLSearchParams(search).get('mode');
  const startPresent = new URLSearchParams(search).get('present') === '1';
  const kind = data?.page.kind;
  const slides = kind === 'slides';
  // An agent saving a new version of it, from any session: shown as it comes (live.ts), unless an older version is on view.
  const draft = usePageDraft(kind ? id : undefined, { watch: !!kind });
  const live = useLiveDraft(kind === 'notebook' ? null : kind, data?.model, data?.page.version, old ? null : draft);
  // Said under the title while it is written, and while its version is being kept (a LaTeX document is typeset first).
  const writing = !old && !!kind && kind !== 'notebook' && ((!!draft && !draft.done && !draft.failed) || !!live);
  const keeping = writing && !!draft?.done;

  const viewVersion = async (v: number) => {
    setMenu(null);
    if (!data || v === data.page.version) return setOld(null);
    try {
      if (kind) setOld({ version: v, ...(await loadModelVersion(enc(id), v)) });
      else setOld({ version: v, ...(await api<{ title: string; html: string }>(`/api/pages/${enc(id)}/versions/${v}`)) });
    } catch (e) {
      toastError(e);
    }
  };
  const restore = async () => {
    if (!old) return;
    try {
      const r = await post<{ page: PageInfo }>(`/api/pages/${enc(id)}/versions/${old.version}/restore`);
      toast(`Version ${old.version} is back, as version ${r.page.version}`, 'ok');
      setOld(null);
      void load();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    setMenu(null);
    if (!data || !(await confirm({ title: `Delete “${data.page.title}”?`, body: 'Its versions, what it keeps and any published copy go with it.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(`/api/pages/${enc(id)}`);
      closePageAsk();
      go('/library');
    } catch (e) {
      toastError(e);
    }
  };
  const duplicate = async () => {
    setMenu(null);
    try {
      const r = await post<{ page: PageInfo }>(`/api/pages/${enc(id)}/copy`);
      go(`/pages/${r.page.id}`);
    } catch (e) {
      toastError(e);
    }
  };
  const download = async (format: ExportFormat) => {
    setMenu(null);
    if (!data) return;
    try {
      await exportFile(id, format, { version: old?.version, deck: slides ? ((old?.model ?? data.model) as Deck) : undefined });
    } catch (e) {
      toastError(e);
    }
  };
  const resetLink = async () => {
    setMenu(null);
    if (!(await confirm({ title: 'A new address?', body: 'The current address stops working, also on home screens it was added to.', confirm: 'New address' }))) return;
    try {
      const r = await post<{ link: string }>(`/api/pages/${enc(id)}/link`);
      setData((d) => (d ? { ...d, link: r.link } : d));
      toast('The page has a new address', 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  /** Saves a new version (a page's HTML, or a deck); a newer one saved meanwhile is asked about first. */
  const saveBody = async (body: { html: string } | { model: unknown }) => {
    if (!data) return false;
    try {
      await post(`/api/pages/${enc(id)}/versions`, { ...body, base: data.page.version });
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      // Left already: nobody to ask, and the newer version stays among the versions anyway.
      if (!leaving.current && !(await confirm({ title: 'A newer version is there', body: 'It was saved again while you changed it (by an agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' })))
        return false;
      await post(`/api/pages/${enc(id)}/versions`, { ...body, base: data.page.version, force: true });
    }
    toast(leaving.current ? `Saved your changes to “${data.page.title}”` : data.page.sessionKey ? 'Saved. The agent that made it sees your changes with your next message to it.' : 'Saved', 'ok');
    void load();
    return true;
  };

  if (error && !data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Library" />
        <Empty icon={<AppWindow size={22} />} title="This page is not here">
          {error}.{' '}
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go('/library')}>
            Back to the Library
          </button>
        </Empty>
      </div>
    );
  }
  const page = data?.page;
  const title = old?.title ?? page?.title ?? 'Page';
  const doc: StudioDoc | null = data && !kind ? { key: old ? `${id}:v${old.version}` : `${id}:${data.page.version}`, title, html: old?.html ?? data.html ?? '', store, app: screenOf } : null;
  const askOpen = ask.open && !!page;
  const askThis = (text?: string) => {
    if (text !== undefined) setPart(text);
    openPageAsk({ scope: text !== undefined ? (kind ? 'asked' : 'part') : undefined });
  };

  const lead = (
    <>
      {!mobile && <NavButton />}
      <IconButton label="The Library" onClick={() => (closePageAsk(), go('/library'))}>
        <ArrowLeft size={18} />
      </IconButton>
      <button type="button" className="ml-0.5 min-w-0 text-left" onClick={() => page && setDialog('rename')} title="Edit the title and description">
        <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {page && (
          <div className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-fg-3">
            {writing && <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />}
            <span className="min-w-0 truncate">
              {old ? `Version ${old.version} of ${page.version}` : keeping ? `Version ${page.version} · An agent is saving a new version` : writing ? `Version ${page.version} · An agent is writing a new version` : `Version ${page.version} · ${ago(page.updatedAt)}`}
              {page.storageBytes ? ` · keeps ${bytes(page.storageBytes)}` : ''}
            </span>
          </div>
        )}
      </button>
    </>
  );
  const tail = page && (
    <>
      <IconButton ref={historyRef} label="Versions" active={menu === 'history'} onClick={() => setMenu(menu === 'history' ? null : 'history')}>
        <History size={16} />
      </IconButton>
      {!mobile && (
        <Button ref={exportRef} size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setMenu(menu === 'export' ? null : 'export')} className={cx(menu === 'export' && 'bg-bg-3')}>
          Export
        </Button>
      )}
      {mobile ? (
        <IconButton ref={shareRef} label="Share" active={menu === 'share'} onClick={() => setMenu(menu === 'share' ? null : 'share')}>
          <Share2 size={16} />
        </IconButton>
      ) : (
        <Button ref={shareRef} size="sm" variant="secondary" icon={<Share2 size={14} />} onClick={() => setMenu(menu === 'share' ? null : 'share')} className={cx(menu === 'share' && 'bg-bg-3')}>
          Share
        </Button>
      )}
      {!old &&
        (mobile ? (
          <IconButton label="Ask an agent" active={askOpen} onClick={() => (askOpen ? closePageAsk() : askThis())}>
            <Sparkles size={16} />
          </IconButton>
        ) : (
          <Button size="sm" variant={askOpen ? 'secondary' : 'subtle'} icon={<Sparkles size={14} className="text-accent" />} onClick={() => (askOpen ? closePageAsk() : askThis())} className={cx(askOpen && 'bg-bg-3')}>
            Ask
          </Button>
        ))}
      <IconButton ref={moreRef} label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
        <Ellipsis size={16} />
      </IconButton>
    </>
  );
  // Changes not saved here are left as they are while an agent writes a new version: said once, under the bar.
  const band: ReactNode = writing && dirty && !old ? (
    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-accent-soft px-3 py-2 text-[12.5px] text-fg-2 sm:px-5">
      <span className="breathe h-1.5 w-1.5 shrink-0 rounded-full bg-busy" />
      <span className="min-w-0 flex-1">An agent is writing a new version. Your changes stay as they are here until you save them.</span>
    </div>
  ) : old && (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-accent-soft px-3 py-2 text-[12.5px] sm:px-5">
      <span className="min-w-0 flex-1 text-fg-2">An older version, as it was {ago(data?.versions.find((v) => v.version === old.version)?.createdAt)}. What it changes here is not kept.</span>
      <Button size="sm" variant="primary" onClick={restore} className="h-7">
        Bring it back
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOld(null)} className="h-7">
        Back to the latest
      </Button>
    </div>
  );
  // A page locked (PageExtras.tsx): only to use, and a band to unlock it.
  const locked = !kind && !!data?.page.locked && !old;
  const setLock = (on: boolean) => {
    setMenu(null);
    lockPage(id, on).then(() => load(), toastError);
  };
  const shownBand = band || (locked ? <LockBand onUnlock={() => setLock(false)} /> : null);
  const words = !kind && menu === 'more' && doc ? pageWords(doc.html) : null;
  const Editor = kind ? EDITORS[kind] : undefined;
  const editor = kind ? (
    Editor ? (
      <Editor
        key={id}
        doc={data?.model !== undefined ? { key: old ? `${id}:v${old.version}` : `${id}:${data.page.version}`, title, model: old?.model ?? data.model } : null}
        pageId={id}
        layout={mobile ? 'sheet' : 'page'}
        readOnly={!!old}
        onSave={(model) => saveBody({ model })}
        lead={lead}
        tail={tail}
        band={band}
        savedNote={page?.sessionKey ? 'the agent that made it sees your changes' : undefined}
        onAsk={(text) => askThis(text)}
        onRequest={old ? undefined : (r) => askNow(r.prompt, { page: id, make: r.make })}
        onScopes={setScopes}
        saveNowRef={saveFirst}
        onDirty={(d) => {
          unsaved.current = d;
          setDirty(d);
        }}
        startPresent={startPresent}
        live={live}
      />
    ) : (
      <Empty icon={<AppWindow size={22} />} title="This app cannot open it">
        It is a kind of page this version of the app does not know yet.
      </Empty>
    )
  ) : (
    <Studio
      key={id}
      doc={doc}
      layout={mobile ? 'sheet' : 'page'}
      readOnly={!!old || locked}
      onSave={(html) => saveBody({ html })}
      lead={lead}
      tail={tail}
      band={shownBand}
      initialMode={startMode === 'edit' || startMode === 'code' ? startMode : undefined}
      savedNote={page?.sessionKey ? 'the agent that made it sees your changes' : undefined}
      onAsk={(text) => askThis(text)}
      onRequest={old ? undefined : (r) => askNow(r.prompt, { page: id, make: r.make })}
      saveNowRef={saveFirst}
      pageId={old ? undefined : id}
    />
  );
  const allScopes = page ? scopesOf(page, scopes, part) : [];
  const panel = page && <PageAskPanel page={page} scopes={allScopes} beforeSend={() => saveFirst.current?.() ?? Promise.resolve(true)} className={wideAsk ? 'w-[400px] shrink-0 border-l border-line' : undefined} />;
  return (
    <div className="flex h-full min-h-0 flex-col pt-[var(--safe-top)]">
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{editor}</div>
        {askOpen && wideAsk && panel}
      </div>
      {askOpen && !wideAsk && !ask.folded && createPortal(<div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)]">{panel}</div>, document.body)}
      {page && ask.open && ask.folded && !wideAsk && <PageAskPill page={page} />}
      {data && (
        <>
          <Popover anchor={historyRef} open={menu === 'history'} onClose={() => setMenu(null)} align="end" width={290}>
            <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">Versions · the newest {VERSION_LIMITS.count} are kept</div>
            <div className="max-h-[min(60vh,420px)] overflow-y-auto">
              {data.versions.map((v) => (
                <button
                  key={v.version}
                  type="button"
                  onClick={() => viewVersion(v.version)}
                  className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-2', (old?.version ?? data.page.version) === v.version && 'bg-bg-2')}
                >
                  <span className="w-8 shrink-0 font-mono text-[12px] text-fg-3">v{v.version}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{v.version === data.page.version ? 'The latest' : v.title}</span>
                    <span className="block truncate text-[11.5px] text-fg-3">
                      {ago(v.createdAt)} · {v.who ? <span translate="no">{v.who}</span> : (BY[v.by] ?? v.by)}
                      {v.steps ? ` · ${v.steps} saves` : ''} · {bytes(v.bytes)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Popover>
          <Popover anchor={exportRef} open={menu === 'export'} onClose={() => setMenu(null)} align="end" width={240}>
            {EXPORTS(kind).map((x) => (
              <MenuItem key={x.format} icon={x.icon} onClick={() => void download(x.format)}>
                {x.label}
              </MenuItem>
            ))}
          </Popover>
          <ShareMenu
            page={data.page}
            link={data.link}
            anchor={shareRef}
            open={menu === 'share'}
            onClose={() => setMenu(null)}
            onPublish={() => {
              setMenu(null);
              setDialog('publish');
            }}
            onReset={resetLink}
          />
          <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={240}>
            {mobile && (
              <>
                <MenuLabel>Download as</MenuLabel>
                {EXPORTS(kind).map((x) => (
                  <MenuItem key={x.format} icon={x.icon} onClick={() => void download(x.format)}>
                    {x.label}
                  </MenuItem>
                ))}
                <MenuSep />
              </>
            )}
            {!kind && (
              <MenuItem icon={<Database size={14} />} onClick={() => (setMenu(null), setDialog('data'))}>
                What it keeps
              </MenuItem>
            )}
            {!kind && !old && (
              <MenuItem icon={data.page.locked ? <LockOpen size={14} /> : <Lock size={14} />} onClick={() => setLock(!data.page.locked)}>
                {data.page.locked ? 'Unlock the page' : 'Lock the page'}
              </MenuItem>
            )}
            {!kind && (
              <MenuItem icon={<Link2 size={14} />} onClick={() => setMenu('links')}>
                Linked from…
              </MenuItem>
            )}
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), setDialog('rename'))}>
              Edit the title and description
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} onClick={duplicate}>
              Duplicate
            </MenuItem>
            {!!spaces?.length && !data.page.app && (
              <MenuItem icon={<FolderInput size={14} />} hint={<span translate="no">{spaces.find((x) => x.id === data.page.space)?.name ?? ''}</span>} onClick={() => setMenu('space')}>
                Move to a project
              </MenuItem>
            )}
            {!data.page.app && placeFolders(folders, data.page.space ?? null).length > 0 && (
              <MenuItem icon={<FolderTree size={14} />} hint={<span translate="no">{folders?.find((f) => f.id === data.page.folder)?.name ?? ''}</span>} onClick={() => setMenu('folder')}>
                Move to a folder
              </MenuItem>
            )}
            <MenuItem
              icon={<ExternalLink size={14} />}
              onClick={() => {
                setMenu(null);
                window.open(absolute(data.link), '_blank', 'noopener,noreferrer');
              }}
            >
              Open in a new tab
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
              Delete
            </MenuItem>
            {words && (
              <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] text-fg-3">
                {words.words.toLocaleString(LOCALE)} words · {words.chars.toLocaleString(LOCALE)} characters · about {words.minutes} min to read
              </div>
            )}
          </Popover>
          {!kind && <BacklinksPopover pageId={id} anchor={moreRef} open={menu === 'links'} onClose={() => setMenu(null)} />}
          <SpaceMenu
            anchor={moreRef}
            open={menu === 'space'}
            onClose={() => setMenu(null)}
            title="Move it to"
            value={data.page.space ?? null}
            onPick={(space) => {
              if (space === (data.page.space ?? null)) return;
              patch(`/api/pages/${enc(id)}`, { space })
                .then(() => {
                  const name = spaces?.find((x) => x.id === space)?.name;
                  toast(name ? tr(`Moved to ${name}`) : 'Moved out of its project', 'ok');
                })
                .catch(toastError);
            }}
          />
          <FolderMenu
            anchor={moreRef}
            open={menu === 'folder'}
            onClose={() => setMenu(null)}
            folders={placeFolders(folders, data.page.space ?? null)}
            value={data.page.folder ?? null}
            topName={placeTopName(data.page.space ?? null, spaces)}
            onPick={(f) => void moveToFolder({ kind: 'page', id }, f, placeTopName(data.page.space ?? null, spaces))}
          />
          <RenameDialog page={data.page} open={dialog === 'rename'} onClose={() => setDialog(null)} />
          <PublishDialog page={data.page} open={dialog === 'publish'} onClose={() => setDialog(null)} />
          <DataDialog page={data.page} open={dialog === 'data'} onClose={() => setDialog(null)} />
        </>
      )}
      {confirmNode}
    </div>
  );
}

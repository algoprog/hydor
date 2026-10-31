// Pages (/pages): the pages kept from conversations and saved by agents, and the sites published from
// them or from a project's build. A page opens full screen (/pages/<id>) with its storage, its older
// versions (view one, bring it back), its own address for a phone's home screen, and Publish.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { AppWindow, ArrowLeft, Ellipsis, ExternalLink, Globe, GlobeLock, History, Pencil, Smartphone, Trash2, Upload } from 'lucide-react';
import { VERSION_LIMITS, type PageInfo, type PageVersion, type SiteInfo, type SiteVisibility } from '@shared/pages';
import { api, del, enc, patch, post } from '../../lib/api';
import { ago, basename, bytes, tildify } from '../../lib/format';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { FolderPicker } from '../../components/FolderPicker';
import { CopyButton } from '../../components/Markdown';
import { Button, cx, Dialog, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Tabs, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { NavButton, PageHeader } from '../layout/PageHeader';
import { SiteLink, VISIBILITY } from './cards';
import { PageFrame, pageStore, previewStore } from './frame';
import { absolute, usePagesStore } from './state';

export function PagesRoute() {
  const [loc] = useLocation();
  const id = /^\/pages\/([a-f0-9]{10})$/.exec(loc)?.[1];
  return id ? <PageView id={id} /> : <Library />;
}

// ---- shared bits ---------------------------------------------------------------------------------

const TONES = ['bg-accent-soft text-accent', 'bg-info/12 text-info', 'bg-ok/12 text-ok', 'bg-warn/12 text-warn', 'bg-claude/12 text-claude', 'bg-codex/12 text-codex'];

/** A page's square: its first letter, in a colour of its own. */
function Letter({ page, className }: { page: { id: string; title: string }; className?: string }) {
  const tone = TONES[parseInt(page.id.slice(0, 6), 16) % TONES.length];
  return (
    <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[16px] font-semibold', tone, className)}>
      {[...page.title.trim()][0]?.toUpperCase() ?? 'P'}
    </span>
  );
}

function RenameDialog({ page, open, onClose }: { page: PageInfo; open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(page.title);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setTitle(page.title);
  }, [open, page.title]);
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/pages/${enc(page.id)}`, { title });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename the page"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !title.trim()} onClick={save}>
            Rename
          </Button>
        </>
      }
    >
      <input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && save()} className={inputCls} />
    </Dialog>
  );
}

/** Publish a saved page, or (without one) a folder: a project's build. */
function PublishDialog({ page, open, onClose }: { page?: { id: string; title: string }; open: boolean; onClose: () => void }) {
  const [folder, setFolder] = useState('');
  const [name, setName] = useState('');
  const [vis, setVis] = useState<SiteVisibility>('private');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<SiteInfo | null>(null);
  useEffect(() => {
    if (!open) return;
    setDone(null);
    setFolder('');
    setName(page?.title ?? '');
  }, [open, page?.id]);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ site: SiteInfo }>('/api/sites', { pageId: page?.id, folder: page ? undefined : folder, name, visibility: vis });
      setDone(r.site);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={page ? `Publish “${page.title}”` : 'Publish a folder'}
      width={500}
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Globe size={14} />} disabled={busy || !name.trim() || (!page && !folder.trim())} onClick={submit}>
              Publish
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-2 text-[13.5px]">
          <p className="text-fg-2">“{done.name}” is published. Its link:</p>
          <SiteLink path={done.path} />
        </div>
      ) : (
        <div className="space-y-3.5 text-[13.5px]">
          {!page && (
            <label className="block space-y-1.5">
              <span className="text-[12.5px] font-medium text-fg-2">The folder: a built site with an index.html (dist/, build/ or out/)</span>
              <FolderPicker
                value={folder}
                onChange={(v) => {
                  setFolder(v);
                  if (!name.trim() || name === basename(folder.replace(/\/+$/, ''))) setName(basename(v.replace(/\/+$/, '')));
                }}
              />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium text-fg-2">Name</span>
            <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="My site" className={inputCls} />
          </label>
          <div className="space-y-1.5">
            <Segmented<SiteVisibility> size="sm" value={vis} onChange={setVis} options={VISIBILITY.map((v) => ({ value: v.value, label: v.label }))} />
            <p className="text-[12.5px] leading-relaxed text-fg-3">
              {VISIBILITY.find((v) => v.value === vis)!.hint}
              {page ? ' A published copy does not keep data: to use the page yourself on a phone, open it at its own address.' : ' It is served as it is on disk: a new build shows at once.'}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** A page's own address: open it on a phone, add it to the home screen. */
function OwnAddressDialog({ page, link, open, onClose, onReset }: { page: PageInfo; link: string; open: boolean; onClose: () => void; onReset: () => void }) {
  const url = absolute(link);
  return (
    <Dialog open={open} onClose={onClose} title="Its own address" width={500}>
      <div className="space-y-3 text-[13.5px] leading-relaxed">
        <p className="text-fg-2">“{page.title}” opens on its own at this address, with its data, on any device, without signing in to Naget Agent.</p>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[12px]" title={url}>
            {url}
          </code>
          <CopyButton text={url} label="Copy the address" />
        </div>
        <p className="text-fg-3">On an iPhone, open it in Safari, then Share → Add to Home Screen. On Android, open it in Chrome, then ⋮ → Add to Home screen.</p>
        <p className="text-fg-3">Anyone with the address can open the page and change what it keeps. A new address turns this one off.</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="primary" icon={<ExternalLink size={14} />} onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            Open
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            New address
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---- the library ----------------------------------------------------------------------------------

function PageRow({ page }: { page: PageInfo }) {
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [publish, setPublish] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const open = () => go(`/pages/${page.id}`);
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: `Delete “${page.title}”?`, body: 'Its versions, what it keeps and any published copy go with it.', confirm: 'Delete', danger: true }))) return;
    del(`/api/pages/${enc(page.id)}`).catch(toastError);
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-panel py-2.5 pr-2 pl-2.5 transition-colors hover:border-line-2">
      <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Letter page={page} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-5 font-medium text-fg">{page.title}</span>
          <span className="block truncate text-[12px] leading-4 text-fg-3">
            {ago(page.updatedAt)} · version {page.version}
            {page.storageBytes ? ` · keeps ${bytes(page.storageBytes)}` : ''}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button size="sm" variant="subtle" onClick={open} className="h-8 px-2.5">
          Open
        </Button>
        <IconButton ref={anchor} label="More" onClick={() => setMenu((m) => !m)} active={menu}>
          <Ellipsis size={16} />
        </IconButton>
      </div>
      <Popover anchor={anchor} open={menu} onClose={() => setMenu(false)} align="end" width={200}>
        <MenuItem
          icon={<Pencil size={14} />}
          onClick={() => {
            setMenu(false);
            setRename(true);
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          icon={<Globe size={14} />}
          onClick={() => {
            setMenu(false);
            setPublish(true);
          }}
        >
          Publish…
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
          Delete
        </MenuItem>
      </Popover>
      <RenameDialog page={page} open={rename} onClose={() => setRename(false)} />
      <PublishDialog page={page} open={publish} onClose={() => setPublish(false)} />
      {confirmNode}
    </div>
  );
}

function SiteRow({ site }: { site: SiteInfo }) {
  const home = useApp((s) => s.boot?.home);
  const [confirm, confirmNode] = useConfirm();
  const remove = async () => {
    if (!(await confirm({ title: `Unpublish “${site.name}”?`, body: 'Its link stops working at once. You can publish it again, under a new private link.', confirm: 'Unpublish', danger: true }))) return;
    del(`/api/sites/${enc(site.id)}`)
      .then(() => toast('Unpublished', 'ok'))
      .catch(toastError);
  };
  return (
    <div className="space-y-2 rounded-xl border border-line bg-panel py-2.5 pr-2 pl-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          {site.visibility === 'private' ? <GlobeLock size={19} strokeWidth={1.8} /> : <Globe size={19} strokeWidth={1.8} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] leading-5 font-medium text-fg">{site.name}</span>
          <span className="block truncate text-[12px] leading-4 text-fg-3" title={site.folder}>
            {site.visibility === 'public' ? 'Public' : 'Private'} link · {site.kind === 'page' ? `the page “${site.pageTitle ?? site.pageId}”` : tildify(site.folder ?? '', home)} · {ago(site.createdAt)}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={remove} className="h-8 px-2.5">
          Unpublish
        </Button>
      </div>
      <div className="pr-1 pl-[52px]">
        <SiteLink path={site.path} />
      </div>
      {confirmNode}
    </div>
  );
}

type Tab = 'saved' | 'published';

function Library() {
  const search = useSearch();
  const tab: Tab = new URLSearchParams(search).get('tab') === 'published' ? 'published' : 'saved';
  const pages = usePagesStore((s) => s.pages);
  const sites = usePagesStore((s) => s.sites);
  const [publish, setPublish] = useState(false);
  useEffect(() => {
    usePagesStore.getState().loadPages().catch(toastError);
    usePagesStore.getState().loadSites().catch(toastError);
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Pages"
        sub="Pages agents made for you, and what you published"
        actions={
          tab === 'published' && (
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setPublish(true)}>
              Publish a folder
            </Button>
          )
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={(t) => go(t === 'published' ? '/pages?tab=published' : '/pages', true)}
          options={[
            { value: 'saved', label: 'Saved', count: pages?.length },
            { value: 'published', label: 'Published', count: sites?.length },
          ]}
        />
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[920px] px-3 py-5 sm:px-6">
          {tab === 'saved' ? (
            !pages ? (
              <div className="flex justify-center py-10 text-fg-3">
                <Throbber size={28} />
              </div>
            ) : !pages.length ? (
              <Empty icon={<AppWindow size={22} />} title="No saved pages yet">
                Keep a page an agent shows you, or ask one to make you a small tool: a tracker, a calculator, a checklist. It lands here, keeps its data, and opens on your phone.
              </Empty>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {pages.map((p) => (
                  <PageRow key={p.id} page={p} />
                ))}
              </div>
            )
          ) : !sites ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !sites.length ? (
            <Empty icon={<Globe size={22} />} title="Nothing published">
              Publish a saved page, or a project’s build (its dist/ folder), at a private or a public link. Agents can ask to publish too; nothing goes out until you confirm.
            </Empty>
          ) : (
            <div className="space-y-2">
              {sites.map((s) => (
                <SiteRow key={s.id} site={s} />
              ))}
            </div>
          )}
        </div>
      </div>
      <PublishDialog open={publish} onClose={() => setPublish(false)} />
    </div>
  );
}

// ---- one page, full screen -------------------------------------------------------------------------

interface Loaded {
  page: PageInfo;
  html: string;
  versions: PageVersion[];
  link: string;
}

const BY: Record<PageVersion['by'], string> = { agent: 'by the agent', user: 'kept by you', restore: 'brought back' };

function PageView({ id }: { id: string }) {
  const mobile = useIsMobile();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An older version on view.
  const [old, setOld] = useState<{ version: number; title: string; html: string } | null>(null);
  const [menu, setMenu] = useState<'history' | 'more' | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'publish' | 'address' | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const historyRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
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
    load();
  }, [id]);
  useFeatureEvent('pages', ({ data: e }) => (e as { what?: string })?.what === 'pages' && load());
  const store = useMemo(() => (old ? previewStore(id) : pageStore(id)), [id, old]);

  const viewVersion = async (v: number) => {
    setMenu(null);
    if (!data || v === data.page.version) return setOld(null);
    try {
      setOld({ version: v, ...(await api<{ title: string; html: string }>(`/api/pages/${enc(id)}/versions/${v}`)) });
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
      load();
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    setMenu(null);
    if (!data || !(await confirm({ title: `Delete “${data.page.title}”?`, body: 'Its versions, what it keeps and any published copy go with it.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(`/api/pages/${enc(id)}`);
      go('/pages');
    } catch (e) {
      toastError(e);
    }
  };
  const resetLink = async () => {
    if (!(await confirm({ title: 'A new address?', body: 'The current address stops working, also on home screens it was added to.', confirm: 'New address' }))) return;
    try {
      const r = await post<{ link: string }>(`/api/pages/${enc(id)}/link`);
      setData((d) => (d ? { ...d, link: r.link } : d));
      toast('The page has a new address', 'ok');
    } catch (e) {
      toastError(e);
    }
  };

  if (error && !data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Pages" />
        <Empty icon={<AppWindow size={22} />} title="This page is not here">
          {error}. <button className="text-accent underline-offset-2 hover:underline" onClick={() => go('/pages')}>Back to Pages</button>
        </Empty>
      </div>
    );
  }
  const page = data?.page;
  const title = old?.title ?? page?.title ?? 'Page';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line bg-bg pt-[var(--safe-top)]">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:px-4">
          {!mobile && <NavButton />}
          <IconButton label="All pages" onClick={() => go('/pages')}>
            <ArrowLeft size={18} />
          </IconButton>
          {page && <Letter page={page} className="h-8 w-8 rounded-lg text-[14px] max-sm:hidden" />}
          <button type="button" className="ml-1 min-w-0 flex-1 text-left" onClick={() => page && setDialog('rename')} title="Rename">
            <h1 className="truncate text-[15.5px] font-semibold tracking-tight">{title}</h1>
            {page && (
              <div className="truncate text-[12px] text-fg-3">
                {old ? `Version ${old.version} of ${page.version}` : `Version ${page.version} · ${ago(page.updatedAt)}`}
                {page.storageBytes ? ` · keeps ${bytes(page.storageBytes)}` : ''}
              </div>
            )}
          </button>
          {page && (
            <div className="flex shrink-0 items-center gap-1">
              {mobile ? (
                <>
                  <IconButton ref={historyRef} label="Versions" active={menu === 'history'} onClick={() => setMenu(menu === 'history' ? null : 'history')}>
                    <History size={17} />
                  </IconButton>
                  <IconButton label="On a phone" onClick={() => setDialog('address')}>
                    <Smartphone size={17} />
                  </IconButton>
                  <IconButton label="Publish" onClick={() => setDialog('publish')}>
                    <Globe size={17} />
                  </IconButton>
                </>
              ) : (
                <>
                  <Button ref={historyRef} size="sm" variant="ghost" icon={<History size={14} />} onClick={() => setMenu(menu === 'history' ? null : 'history')} className={cx(menu === 'history' && 'bg-bg-2 text-fg')}>
                    Versions
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Smartphone size={14} />} onClick={() => setDialog('address')}>
                    On a phone
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Globe size={14} />} onClick={() => setDialog('publish')}>
                    Publish
                  </Button>
                </>
              )}
              <IconButton ref={moreRef} label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
                <Ellipsis size={16} />
              </IconButton>
            </div>
          )}
        </div>
      </header>
      {data && (
        <>
          <Popover anchor={historyRef} open={menu === 'history'} onClose={() => setMenu(null)} align="end" width={280}>
            <div className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-fg-3">Versions · the newest {VERSION_LIMITS.count} are kept</div>
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
                    {ago(v.createdAt)} · {BY[v.by]} · {bytes(v.bytes)}
                  </span>
                </span>
              </button>
            ))}
          </Popover>
          <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={210}>
            <MenuItem
              icon={<Pencil size={14} />}
              onClick={() => {
                setMenu(null);
                setDialog('rename');
              }}
            >
              Rename
            </MenuItem>
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
          </Popover>
          <RenameDialog page={data.page} open={dialog === 'rename'} onClose={() => setDialog(null)} />
          <PublishDialog page={data.page} open={dialog === 'publish'} onClose={() => setDialog(null)} />
          <OwnAddressDialog page={data.page} link={data.link} open={dialog === 'address'} onClose={() => setDialog(null)} onReset={resetLink} />
        </>
      )}
      {old && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-accent-soft px-3 py-2 text-[12.5px] sm:px-5">
          <span className="min-w-0 flex-1 text-fg-2">An older version, as it was {ago(data?.versions.find((v) => v.version === old.version)?.createdAt)}. What it changes here is not kept.</span>
          <Button size="sm" variant="primary" onClick={restore} className="h-7">
            Bring it back
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOld(null)} className="h-7">
            Back to the latest
          </Button>
        </div>
      )}
      <div className="relative min-h-0 flex-1 bg-white">
        {!data ? (
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <PageFrame key={old ? `${id}:v${old.version}` : `${id}:${data.page.version}`} html={old?.html ?? data.html} title={title} store={store} />
        )}
      </div>
      {confirmNode}
    </div>
  );
}

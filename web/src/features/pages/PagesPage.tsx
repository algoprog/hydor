// Pages (/pages): the pages kept from conversations, saved by agents and made here, each with its
// picture, and the sites published from them or from a project's build. A page opens at its own place
// (/pages/<id>) to use, edit (visually or as code) and save, with its versions (view one, bring it back),
// the data it keeps, its own address for a phone's home screen, and Publish.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLocation, useSearch } from 'wouter';
import {
  AppWindow,
  ArrowDownUp,
  ArrowLeft,
  Copy,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  Globe,
  GlobeLock,
  History,
  PenLine,
  Pencil,
  Plus,
  Search,
  Share2,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { VERSION_LIMITS, type PageDataEntry, type PageInfo, type PageVersion, type SiteInfo, type SiteVisibility } from '@shared/pages';
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
import { pageFile, pageStore, previewStore } from './frame';
import { absolute, usePagesStore } from './state';
import { Studio, type StudioDoc } from './studio/Studio';
import { STARTERS } from './templates';
import { tr } from '../../i18n/runtime';

export function PagesRoute() {
  const [loc] = useLocation();
  const id = /^\/pages\/([a-f0-9]{10})$/.exec(loc)?.[1];
  return id ? <PageView id={id} /> : <Library />;
}

// ---- shared bits ---------------------------------------------------------------------------------

const TONES = ['from-accent/25 to-accent/5 text-accent', 'from-info/25 to-info/5 text-info', 'from-ok/25 to-ok/5 text-ok', 'from-warn/25 to-warn/5 text-warn', 'from-claude/25 to-claude/5 text-claude', 'from-codex/25 to-codex/5 text-codex'];
const toneOf = (id: string) => TONES[parseInt(id.slice(0, 6), 16) % TONES.length];
const firstLetter = (title: string) => [...title.trim()][0]?.toUpperCase() ?? 'P';

/** A page's picture, or its first letter until the picture is ready. */
function Thumb({ page, className }: { page: PageInfo; className?: string }) {
  const ready = usePagesStore((s) => s.thumbs[page.id]) ?? page.thumb;
  const [failed, setFailed] = useState<string | null>(null);
  const show = ready && failed !== ready;
  return (
    <div className={cx('relative overflow-hidden bg-gradient-to-br', toneOf(page.id), className)}>
      {show ? (
        <img src={`/api/pages/${enc(page.id)}/thumb?v=${enc(ready)}`} alt="" loading="lazy" draggable={false} onError={() => setFailed(ready)} className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[34px] font-semibold opacity-80">{firstLetter(page.title)}</span>
      )}
    </div>
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
        <MenuItem icon={<Globe size={14} />} onClick={() => (onClose(), go('/pages?tab=published'))}>
          See where it is published
        </MenuItem>
      )}
    </Popover>
  );
}

/** What a page keeps (window.naget.storage): each value, to look at, remove one, download or clear. */
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

function NewPageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pick, setPick] = useState(STARTERS[0].id);
  const [title, setTitle] = useState(STARTERS[0].title);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPick(STARTERS[0].id);
    setTitle(STARTERS[0].title);
    setAsk('');
  }, [open]);
  const starter = STARTERS.find((s) => s.id === pick)!;
  const make = async () => {
    setBusy(true);
    try {
      const t = title.trim() || starter.title;
      const r = await post<{ page: PageInfo }>('/api/pages', { title: t, html: starter.html(t) });
      onClose();
      go(`/pages/${r.page.id}?mode=${pick === 'blank' ? 'edit' : 'view'}`);
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
      title="A new page"
      width={540}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={make}>
            Make it
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-[13.5px]">
        <div className="grid grid-cols-2 gap-2">
          {STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (title === starter.title || !title.trim()) setTitle(s.title);
                setPick(s.id);
              }}
              className={cx('rounded-xl border px-3 py-2.5 text-left transition-colors', pick === s.id ? 'border-accent/60 bg-accent-soft' : 'border-line hover:border-line-2 hover:bg-bg-1')}
            >
              <span className="block font-medium text-fg">{s.label}</span>
              <span className="block text-[12px] leading-snug text-fg-3">{s.hint}</span>
            </button>
          ))}
        </div>
        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-medium text-fg-2">Its name</span>
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} className={inputCls} />
        </label>
        <form
          className="space-y-1.5 border-t border-line pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask.trim()) return;
            onClose();
            go(`/?prompt=${enc(tr(`Make me a page and keep it in Pages: ${ask.trim()}`))}`);
          }}
        >
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg-2">
            <Sparkles size={13} className="text-accent" />
            Or describe it, and an agent makes it
          </span>
          <div className="flex gap-2">
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="A packing list for a week of hiking" className={cx(inputCls, 'min-w-0 flex-1')} />
            <Button type="submit" variant="secondary" disabled={!ask.trim()}>
              Ask
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

// ---- the library ----------------------------------------------------------------------------------

function PageCard({ page }: { page: PageInfo }) {
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const open = (mode?: string) => go(`/pages/${page.id}${mode ? `?mode=${mode}` : ''}`);
  const close = () => setMenu(false);
  const remove = async () => {
    close();
    if (!(await confirm({ title: `Delete “${page.title}”?`, body: 'Its versions, what it keeps and any published copy go with it.', confirm: 'Delete', danger: true }))) return;
    del(`/api/pages/${enc(page.id)}`).catch(toastError);
  };
  const duplicate = async () => {
    close();
    try {
      const r = await post<{ page: PageInfo }>(`/api/pages/${enc(page.id)}/copy`);
      toast(`Made “${r.page.title}”`, 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  const download = async () => {
    close();
    try {
      const r = await api<{ html: string }>(`/api/pages/${enc(page.id)}`);
      const url = URL.createObjectURL(new Blob([pageFile(r.html)], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${page.title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2">
      <button type="button" onClick={() => open()} className="block text-left" aria-label={page.title}>
        <Thumb page={page} className="aspect-[16/10] w-full border-b border-line" />
      </button>
      <div className="flex min-w-0 items-start gap-1 py-2 pr-1 pl-3">
        <button type="button" onClick={() => open()} className="min-w-0 flex-1 text-left">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {page.title}
          </span>
          <span className="flex items-center gap-1.5 truncate text-[12px] leading-4 text-fg-3">
            {ago(page.updatedAt)}
            {page.version > 1 && <span>· v{page.version}</span>}
            {page.published && <Globe size={11} className="shrink-0 text-accent" aria-label="Published" />}
            {page.storageBytes > 0 && <Database size={11} className="shrink-0" aria-label={`Keeps ${bytes(page.storageBytes)}`} />}
          </span>
        </button>
        <IconButton ref={anchor} label="More" size="sm" onClick={() => setMenu((m) => !m)} active={menu}>
          <Ellipsis size={15} />
        </IconButton>
      </div>
      <Popover anchor={anchor} open={menu} onClose={close} align="end" width={200}>
        <MenuItem icon={<PenLine size={14} />} onClick={() => (close(), open('edit'))}>
          Edit
        </MenuItem>
        <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setRename(true))}>
          Rename
        </MenuItem>
        <MenuItem icon={<Copy size={14} />} onClick={duplicate}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<Download size={14} />} onClick={download}>
          Download
        </MenuItem>
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
          Delete
        </MenuItem>
      </Popover>
      <RenameDialog page={page} open={rename} onClose={() => setRename(false)} />
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
    <div className="space-y-2.5 rounded-2xl border border-line bg-panel px-3.5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
          {site.visibility === 'private' ? <GlobeLock size={19} strokeWidth={1.8} /> : <Globe size={19} strokeWidth={1.8} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span translate="no" className="truncate text-[13.5px] leading-5 font-medium text-fg">
              {site.name}
            </span>
            <span className={cx('shrink-0 rounded-md px-1.5 text-[11px] leading-[18px] font-medium', site.visibility === 'public' ? 'bg-warn/12 text-warn' : 'bg-bg-2 text-fg-3')}>{site.visibility === 'public' ? 'Public' : 'Private'}</span>
          </span>
          <span className="block truncate text-[12px] leading-4 text-fg-3" title={site.folder}>
            {site.kind === 'page' ? `The page “${site.pageTitle ?? site.pageId}”` : tildify(site.folder ?? '', home)} · {ago(site.createdAt)}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={remove} className="h-8 px-2.5">
          Unpublish
        </Button>
      </div>
      <SiteLink path={site.path} />
      {confirmNode}
    </div>
  );
}

type Tab = 'saved' | 'published';
type Sort = 'changed' | 'name' | 'made';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'changed', label: 'Last changed' },
  { value: 'name', label: 'Name' },
  { value: 'made', label: 'Newest made' },
];

function Library() {
  const search = useSearch();
  const tab: Tab = new URLSearchParams(search).get('tab') === 'published' ? 'published' : 'saved';
  const pages = usePagesStore((s) => s.pages);
  const sites = usePagesStore((s) => s.sites);
  const [publish, setPublish] = useState(false);
  const [making, setMaking] = useState(false);
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('wa.pages.sort') as Sort) || 'changed');
  const [sortMenu, setSortMenu] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    usePagesStore.getState().loadPages().catch(toastError);
    usePagesStore.getState().loadSites().catch(toastError);
  }, []);
  // The search box's "New page" opens here with the dialog.
  const asked = new URLSearchParams(search).get('new') === '1';
  useEffect(() => {
    if (!asked) return;
    setMaking(true);
    go('/pages', true);
  }, [asked]);
  useEffect(() => localStorage.setItem('wa.pages.sort', sort), [sort]);
  const list = useMemo(() => {
    const q = find.trim().toLowerCase();
    const l = (pages ?? []).filter((p) => !q || p.title.toLowerCase().includes(q));
    if (sort === 'name') return [...l].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'made') return [...l].sort((a, b) => b.createdAt - a.createdAt);
    return l;
  }, [pages, find, sort]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Pages"
        sub="Small tools and pages agents made for you, and what you published"
        actions={
          tab === 'published' ? (
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setPublish(true)}>
              Publish a folder
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setMaking(true)}>
              New page
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
        <div className="mx-auto max-w-[1180px] px-3 py-4 sm:px-6 sm:py-5">
          {tab === 'saved' ? (
            !pages ? (
              <div className="flex justify-center py-10 text-fg-3">
                <Throbber size={28} />
              </div>
            ) : !pages.length ? (
              <Empty icon={<AppWindow size={22} />} title="No pages yet">
                <span className="block">Keep a page an agent shows you, ask one for a small tool (a tracker, a calculator, a checklist), or make one here. It keeps its data, and opens on your phone.</span>
                <span className="mt-3 inline-flex gap-2">
                  <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setMaking(true)}>
                    New page
                  </Button>
                </span>
              </Empty>
            ) : (
              <>
                {pages.length > 4 && (
                  <div className="mb-3.5 flex items-center gap-2">
                    <label className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 sm:max-w-[320px]">
                      <Search size={14} className="shrink-0 text-fg-3" />
                      <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a page" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
                      {find && (
                        <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <Button ref={sortRef} size="sm" variant="ghost" icon={<ArrowDownUp size={13} />} onClick={() => setSortMenu((m) => !m)}>
                      {SORTS.find((x) => x.value === sort)!.label}
                    </Button>
                    <Popover anchor={sortRef} open={sortMenu} onClose={() => setSortMenu(false)} width={180}>
                      {SORTS.map((x) => (
                        <MenuItem key={x.value} onClick={() => (setSort(x.value), setSortMenu(false))}>
                          <span className={cx(sort === x.value && 'font-semibold text-fg')}>{x.label}</span>
                        </MenuItem>
                      ))}
                    </Popover>
                  </div>
                )}
                {!list.length ? (
                  <p className="py-6 text-center text-[13px] text-fg-3">No page’s name has “{find}” in it.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] sm:gap-3.5">
                    {list.map((p) => (
                      <PageCard key={p.id} page={p} />
                    ))}
                  </div>
                )}
              </>
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
            <div className="mx-auto grid max-w-[920px] gap-2.5">
              {sites.map((s) => (
                <SiteRow key={s.id} site={s} />
              ))}
            </div>
          )}
        </div>
      </div>
      <PublishDialog open={publish} onClose={() => setPublish(false)} />
      <NewPageDialog open={making} onClose={() => setMaking(false)} />
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

const BY: Record<PageVersion['by'], string> = { agent: 'by the agent', user: 'kept by you', restore: 'brought back', edit: 'changed by you', made: 'made by you' };

function PageView({ id }: { id: string }) {
  const mobile = useIsMobile();
  const search = useSearch();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // An older version on view.
  const [old, setOld] = useState<{ version: number; title: string; html: string } | null>(null);
  const [menu, setMenu] = useState<'history' | 'more' | 'share' | null>(null);
  const [dialog, setDialog] = useState<'rename' | 'publish' | 'data' | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const historyRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
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
    void load();
  }, [id]);
  useFeatureEvent('pages', ({ data: e }) => (e as { what?: string })?.what === 'pages' && load());
  const store = useMemo(() => (old ? previewStore(id) : pageStore(id)), [id, old]);
  const startMode = new URLSearchParams(search).get('mode');

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
      go('/pages');
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
  const download = () => {
    setMenu(null);
    if (!data) return;
    const url = URL.createObjectURL(new Blob([pageFile(data.html)], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.page.title.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'page'}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const save = async (html: string) => {
    if (!data) return false;
    try {
      await post(`/api/pages/${enc(id)}/versions`, { html, base: data.page.version });
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      if (!(await confirm({ title: 'A newer version is there', body: 'The page was saved again while you changed it (by an agent, say). Save yours on top? The other stays among its versions.', confirm: 'Save on top' })))
        return false;
      await post(`/api/pages/${enc(id)}/versions`, { html, base: data.page.version, force: true });
    }
    toast(data.page.sessionKey ? 'Saved. The agent that made it sees your changes with your next message to it.' : 'Saved', 'ok');
    void load();
    return true;
  };

  if (error && !data) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="Pages" />
        <Empty icon={<AppWindow size={22} />} title="This page is not here">
          {error}.{' '}
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go('/pages')}>
            Back to Pages
          </button>
        </Empty>
      </div>
    );
  }
  const page = data?.page;
  const title = old?.title ?? page?.title ?? 'Page';
  const doc: StudioDoc | null = data ? { key: old ? `${id}:v${old.version}` : `${id}:${data.page.version}`, title, html: old?.html ?? data.html, store } : null;

  const lead = (
    <>
      {!mobile && <NavButton />}
      <IconButton label="All pages" onClick={() => go('/pages')}>
        <ArrowLeft size={18} />
      </IconButton>
      <button type="button" className="ml-0.5 min-w-0 text-left" onClick={() => page && setDialog('rename')} title="Rename">
        <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
          {title}
        </h1>
        {page && (
          <div className="truncate text-[11.5px] text-fg-3">
            {old ? `Version ${old.version} of ${page.version}` : `Version ${page.version} · ${ago(page.updatedAt)}`}
            {page.storageBytes ? ` · keeps ${bytes(page.storageBytes)}` : ''}
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
      {mobile ? (
        <IconButton ref={shareRef} label="Share" active={menu === 'share'} onClick={() => setMenu(menu === 'share' ? null : 'share')}>
          <Share2 size={16} />
        </IconButton>
      ) : (
        <Button ref={shareRef} size="sm" variant="secondary" icon={<Share2 size={14} />} onClick={() => setMenu(menu === 'share' ? null : 'share')} className={cx(menu === 'share' && 'bg-bg-3')}>
          Share
        </Button>
      )}
      <IconButton ref={moreRef} label="More" active={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
        <Ellipsis size={16} />
      </IconButton>
    </>
  );
  const band: ReactNode = old && (
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
  return (
    <div className="flex h-full min-h-0 flex-col pt-[var(--safe-top)]">
      <Studio
        key={id}
        doc={doc}
        layout={mobile ? 'sheet' : 'page'}
        readOnly={!!old}
        onSave={save}
        lead={lead}
        tail={tail}
        band={band}
        initialMode={startMode === 'edit' || startMode === 'code' ? startMode : undefined}
        savedNote={page?.sessionKey ? 'the agent that made it sees your changes' : undefined}
      />
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
                      {ago(v.createdAt)} · {BY[v.by] ?? v.by} · {bytes(v.bytes)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
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
          <Popover anchor={moreRef} open={menu === 'more'} onClose={() => setMenu(null)} align="end" width={220}>
            <MenuItem icon={<Database size={14} />} onClick={() => (setMenu(null), setDialog('data'))}>
              What it keeps
            </MenuItem>
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), setDialog('rename'))}>
              Rename
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} onClick={duplicate}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<Download size={14} />} onClick={download}>
              Download
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
          <DataDialog page={data.page} open={dialog === 'data'} onClose={() => setDialog(null)} />
        </>
      )}
      {confirmNode}
    </div>
  );
}

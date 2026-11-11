// Settings → Plugins. Plugins for every agent come first: the ones you added (on and off, with what they
// need), the ones that come with the app, a menu to add one from a link, a file or a folder, or to make
// your own. Claude Code's and Codex's own plugins, which only they use, have a tab each.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import { Bot, ChevronDown, FileArchive, FolderOpen, Link2, PenLine, Plus, Puzzle, Search, Sparkles, Trash2, X } from 'lucide-react';
import type { PluginJob, PluginList, PluginView } from '@shared/plugins';
import type { MarketplaceEntry, PluginEntry, SetupResult } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { compact } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Badge, Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { ClaudePluginsSettings } from '../settings/AgentSettings';
import { EmptyRow, Group, MoreMenu, Row, SectionActions, Stack } from '../settings/kit';
import { AddPluginDialog, NewPluginDialog } from './AddPlugin';
import { PluginDetail } from './PluginDetail';
import { PluginEditor } from './PluginEditor';
import { brings, JobView, pluginIcon, trouble } from './parts';

type Tab = 'every' | 'claude' | 'codex';

/** A plugin as a row: what it is, what it brings, what stops it, and its switch (or Add). */
function PluginRow({ p, titles, job, onOpen, onToggle, onAdd, onEdit }: { p: PluginView; titles: Record<string, string>; job?: PluginJob; onOpen: () => void; onToggle?: (on: boolean) => void; onAdd?: () => void; onEdit?: () => void }) {
  const t = trouble(p, titles);
  const running = job?.state === 'running';
  const Icon = pluginIcon(p);
  const made = brings(p);
  return (
    <Row
      icon={<Icon size={16} />}
      label={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <button type="button" onClick={onOpen} translate="no" className={cx('min-w-0 text-left font-medium hover:underline', p.installed && !p.enabled && 'text-fg-2')}>
            {p.title}
          </button>
          {p.version && <span className="text-[11.5px] text-fg-3">{p.version}</span>}
          {p.source.kind === 'folder' && p.source.mine && <Badge tone="ok">Yours</Badge>}
          {(p.source.kind === 'git' || p.source.kind === 'file' || (p.source.kind === 'folder' && !p.source.mine)) && <Badge>Added by you</Badge>}
        </span>
      }
      hint={
        <>
          {p.description && (
            <span translate={p.source.kind === 'builtin' ? undefined : 'no'} className="line-clamp-1">
              {p.description}
            </span>
          )}
          {(made || running || t) && (
            <span className="flex flex-wrap items-center gap-x-2 text-[11.5px]">
              {made && <span>{made}</span>}
              {running ? (
                <span className="inline-flex items-center gap-1 text-fg-2">
                  <Throbber className="h-3" /> {job!.steps.at(-1)?.label ?? 'Setting up'}…
                </span>
              ) : (
                t && <span className={t.tone === 'err' ? 'text-err' : t.tone === 'warn' ? 'text-warn' : 'text-fg-3'}>{t.text}</span>
              )}
            </span>
          )}
        </>
      }
      control={
        <>
          {onToggle && <Switch on={p.enabled} onChange={onToggle} label={p.enabled ? `Turn ${p.title} off` : `Turn ${p.title} on`} />}
          {onAdd && (
            <Button size="sm" variant="secondary" onClick={onAdd} disabled={running}>
              {running ? <Throbber /> : 'Add'}
            </Button>
          )}
          {onToggle && (
            <MoreMenu label={p.title} width={200}>
              {(close) => (
                <>
                  <MenuItem icon={<Puzzle size={14} />} onClick={() => (close(), onOpen())}>
                    Details
                  </MenuItem>
                  {onEdit && (
                    <MenuItem icon={<PenLine size={14} />} onClick={() => (close(), onEdit())}>
                      Change it
                    </MenuItem>
                  )}
                </>
              )}
            </MoreMenu>
          )}
        </>
      }
    />
  );
}

/** The section's main button: Add, with a menu of the ways to bring a plugin in. */
function AddMenu({ children }: { children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const at = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={at} size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setOpen((o) => !o)}>
        Add
        <ChevronDown size={13} className="-mr-0.5 opacity-70" />
      </Button>
      <Popover anchor={at} open={open} onClose={() => setOpen(false)} align="end" width={270}>
        {children(() => setOpen(false))}
      </Popover>
    </>
  );
}

function EveryAgent({ q }: { q: string }) {
  const search = useSearch();
  const [list, setList] = useState<PluginList | null>(null);
  const [jobs, setJobs] = useState<Record<string, PluginJob>>({});
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(search).get('plugin'));
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<'link' | 'file' | 'folder' | null>(null);
  const [making, setMaking] = useState(false);
  const [confirm, confirmNode] = useConfirm();

  const load = useCallback(
    () =>
      api<PluginList>('/api/plugins').then((l) => {
        setList(l);
        setJobs((j) => ({ ...j, ...Object.fromEntries(l.jobs.map((x) => [x.plugin, x])) }));
      }, toastError),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);
  useFeatureEvent('plugins', (e) => {
    const d = e as { job?: PluginJob; changed?: boolean };
    if (d.job) setJobs((j) => ({ ...j, [d.job!.plugin]: d.job! }));
    if (d.changed) load();
  });

  const all = useMemo(() => [...(list?.installed ?? []), ...(list?.available ?? [])], [list]);
  const titles = useMemo(() => Object.fromEntries(all.map((p) => [p.name, p.title])), [all]);
  const installedNames = useMemo(() => (list?.installed ?? []).map((p) => p.name), [list]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (p: PluginView) => words.every((w) => `${p.title} ${p.name} ${p.description ?? ''} ${p.keywords.join(' ')} ${p.skills.map((s) => s.name).join(' ')}`.toLowerCase().includes(w));
  const installed = (list?.installed ?? []).filter(match);
  const available = (list?.available ?? []).filter(match);

  const turn = async (p: PluginView, on: boolean) => {
    if (!on && p.dependents.length) {
      const names = p.dependents.map((d) => titles[d] ?? d).join(', ');
      const ok = await confirm({
        title: `Turn off ${p.title}?`,
        body: p.dependents.length === 1 ? `${names} needs it, and turns off too.` : `${names} need it, and turn off too.`,
        confirm: 'Turn off',
      });
      if (!ok) return;
    }
    setList((l) => l && { ...l, installed: l.installed.map((x) => (x.name === p.name ? { ...x, enabled: on } : x)) });
    try {
      const r = await post<{ on?: string[]; off?: string[] }>(`/api/plugins/${enc(p.name)}/${on ? 'enable' : 'disable'}`);
      const also = (r.on ?? r.off ?? []).filter((n) => n !== p.name).map((n) => titles[n] ?? n).join(', ');
      if (also) toast(on ? `Also turned on: ${also}` : `Also turned off: ${also}`, 'ok');
    } catch (e) {
      toastError(e);
    }
    load();
  };
  const add = async (p: PluginView) => {
    try {
      const r = await post<{ job: PluginJob }>('/api/plugins/install', { name: p.name });
      setJobs((j) => ({ ...j, [p.name]: r.job }));
    } catch (e) {
      toastError(e);
    }
  };
  const withAgent = () => go(`/?prompt=${encodeURIComponent('Help me make a plugin for Hydor that ')}`);

  const running = Object.values(jobs).filter((j) => j.state === 'running' || (j.state === 'failed' && Date.now() - (j.endedAt ?? 0) < 120_000));
  return (
    <Stack>
      <SectionActions>
        <AddMenu>
          {(close) => (
            <>
              <MenuItem icon={<Sparkles size={14} />} onClick={() => (close(), setMaking(true))}>
                Make a plugin
              </MenuItem>
              <MenuItem icon={<Bot size={14} />} onClick={() => (close(), withAgent())}>
                Make one with an agent
              </MenuItem>
              <MenuSep />
              <MenuItem icon={<Link2 size={14} />} onClick={() => (close(), setAdding('link'))}>
                From a link
              </MenuItem>
              <MenuItem icon={<FileArchive size={14} />} onClick={() => (close(), setAdding('file'))}>
                From a .zip file
              </MenuItem>
              <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), setAdding('folder'))}>
                From a folder
              </MenuItem>
            </>
          )}
        </AddMenu>
      </SectionActions>

      {running.map((j) => (
        <JobView key={j.id} job={j} title={titles[j.plugin]} />
      ))}

      <Group
        title={
          <>
            <span>Your plugins</span> {list && <span className="tnum font-normal text-fg-3">{list.installed.length}</span>}
          </>
        }
        info="Plugins work with every agent the app starts: Claude Code, Codex, Custom and the others. They use the open Agent Plugins format, and Claude Code’s plugins can be added here too, from their link."
      >
        {!list ? (
          <div className="flex justify-center px-4 py-6">
            <Throbber className="text-fg-3" />
          </div>
        ) : installed.length ? (
          installed.map((p) => <PluginRow key={p.name} p={p} titles={titles} job={jobs[p.name]} onOpen={() => setOpen(p.name)} onToggle={(on) => turn(p, on)} onEdit={p.editable ? () => setEditing(p.name) : undefined} />)
        ) : (
          <EmptyRow>{words.length ? 'None match.' : 'None yet. A plugin brings skills, tools and instructions to every agent: add one below, or make your own.'}</EmptyRow>
        )}
      </Group>

      {available.length > 0 && (
        <Group
          title={
            <>
              <span>Come with the app</span> <span className="tnum font-normal text-fg-3">{available.length}</span>
            </>
          }
        >
          {available.map((p) => (
            <PluginRow key={p.name} p={p} titles={titles} job={jobs[p.name]} onOpen={() => setOpen(p.name)} onAdd={() => add(p)} />
          ))}
        </Group>
      )}

      {open && (
        <PluginDetail
          name={open}
          titles={titles}
          installedNames={installedNames}
          job={jobs[open]}
          onClose={() => setOpen(null)}
          onEdit={(n) => (setOpen(null), setEditing(n))}
          onChanged={load}
        />
      )}
      {adding && (
        <AddPluginDialog
          from={adding}
          titles={titles}
          jobs={jobs}
          onClose={() => (setAdding(null), load())}
          onAdded={(n) => {
            setAdding(null);
            load();
            setOpen(n);
          }}
        />
      )}
      {making && (
        <NewPluginDialog
          onClose={() => setMaking(false)}
          onMade={(n) => {
            setMaking(false);
            load();
            setEditing(n);
          }}
        />
      )}
      {editing && (
        <PluginEditor
          name={editing}
          onClose={() => (setEditing(null), load())}
          onSaved={(job) => {
            if (job) setJobs((j) => ({ ...j, [job.plugin]: job }));
            load();
          }}
        />
      )}
      {confirmNode}
    </Stack>
  );
}

// ---- Codex's own plugins ---------------------------------------------------------------------------------

const PAGE = 40;

function CodexPlugins({ q }: { q: string }) {
  // The page size starts again with each new search.
  const [more, setMore] = useState({ q, n: PAGE });
  const limit = more.q === q ? more.n : PAGE;
  const setLimit = (f: (l: number) => number) => setMore({ q, n: f(limit) });
  const [adding, setAdding] = useState(false);
  const [data, setData] = useState<{ installed: PluginEntry[]; available: PluginEntry[]; marketplaces: MarketplaceEntry[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [market, setMarket] = useState('');
  const [confirm, confirmNode] = useConfirm();
  const seq = useRef(0);
  const load = useCallback(async (query: string, lim: number) => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const r = await api<typeof data>(`/api/setup/codex-plugins?q=${enc(query)}&limit=${lim}`);
      if (n === seq.current) setData(r);
    } catch (e) {
      if (n === seq.current) toastError(e);
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => load(q, limit), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, limit, load]);
  const act = async (action: 'add' | 'remove', p: PluginEntry) => {
    const ok = await confirm(
      action === 'add'
        ? { title: `Add ${p.name} to Codex?`, body: <>From {p.marketplace}, for every Codex session. Plugins can add skills, apps and MCP servers; add only plugins you trust.</>, confirm: 'Add' }
        : { title: `Remove ${p.name} from Codex?`, body: 'New Codex sessions stop loading it.', confirm: 'Remove', danger: true },
    );
    if (!ok) return;
    setBusy(p.id);
    try {
      const r = await post<SetupResult>(`/api/setup/codex-plugins/${action}`, { id: p.id });
      if (!r.ok) throw new Error(r.output.split('\n').filter(Boolean).at(-1) || `Could not ${action} ${p.name}`);
      toast(action === 'add' ? `Added ${p.name} to Codex` : `Removed ${p.name}`, 'ok');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };
  const marketAct = async (action: 'add' | 'remove' | 'upgrade', target: string) => {
    if (action === 'remove' && !(await confirm({ title: `Remove ${target}?`, body: 'Codex stops offering its plugins.', confirm: 'Remove', danger: true }))) return;
    setBusy(`market:${target}`);
    try {
      const r = await post<SetupResult>(`/api/setup/codex-marketplaces/${action}`, { target });
      if (!r.ok) throw new Error(r.output.split('\n').filter(Boolean).at(-1) || 'It did not work');
      toast(action === 'add' ? `Added ${target}` : action === 'upgrade' ? `Refreshed ${target}` : `Removed ${target}`, 'ok');
      if (action === 'add') (setMarket(''), setAdding(false));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };
  const addMarket = async () => {
    if (market.trim()) await marketAct('add', market.trim());
  };
  const row = (p: PluginEntry, action: 'add' | 'remove') => (
    <Row
      key={p.id}
      icon={<Puzzle size={16} />}
      label={
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span translate="no" className="font-medium">
            {p.name}
          </span>
          {p.marketplace && <Badge>{p.marketplace}</Badge>}
          {p.version && <span className="text-[11.5px] text-fg-3">{p.version}</span>}
          {!p.installed && p.installCount != null && <span className="text-[11.5px] text-fg-3">{compact(p.installCount)} installs</span>}
        </span>
      }
      hint={p.description && <span translate="no" className="line-clamp-1">{p.description}</span>}
      control={
        busy === p.id ? (
          <Throbber className="px-3 text-fg-3" />
        ) : action === 'remove' ? (
          <IconButton label="Remove" size="sm" onClick={() => act('remove', p)}>
            <Trash2 size={14} />
          </IconButton>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => act('add', p)} disabled={!!busy}>
            Add
          </Button>
        )
      }
    />
  );
  return (
    <Stack>
      <Group title="Added to Codex" hint="Only Codex sessions use these">
        {!data ? (
          <div className="flex justify-center px-4 py-6">
            <Throbber className="text-fg-3" />
          </div>
        ) : data.installed.length ? (
          data.installed.map((p) => row(p, 'remove'))
        ) : (
          <EmptyRow>None yet.</EmptyRow>
        )}
      </Group>
      <Group title="Find more" hint={data ? `${data.total.toLocaleString()} ${q ? 'matching' : 'in Codex’s marketplaces'}` : 'Loading Codex’s marketplaces…'}>
        {!data ? (
          <div className="flex justify-center px-4 py-6">
            <Throbber className="text-fg-3" />
          </div>
        ) : data.available.length ? (
          <div className={cx('divide-y divide-line transition-opacity', loading && 'opacity-60')}>
            {data.available.map((p) => row(p, 'add'))}
            {data.available.length < data.total && (
              <div className="flex justify-center px-4 py-2.5">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
                  {loading ? <Throbber /> : `Show more (${(data.total - data.available.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <EmptyRow>{q ? 'None match.' : 'Nothing to add: add a marketplace below.'}</EmptyRow>
        )}
      </Group>
      <Group
        title="Marketplaces"
        hint="Catalogs Codex adds plugins from"
        actions={
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setAdding(true)}>
            Add
          </Button>
        }
      >
        {!data ? (
          <div className="flex justify-center px-4 py-6">
            <Throbber className="text-fg-3" />
          </div>
        ) : data.marketplaces.length ? (
          data.marketplaces.map((m) => (
            <Row
              key={m.name}
              icon={<Link2 size={16} />}
              label={<span translate="no">{m.name}</span>}
              hint={m.source && <span translate="no" className="block truncate font-mono text-[12px]">{m.source}</span>}
              control={
                busy === `market:${m.name}` ? (
                  <Throbber className="px-3 text-fg-3" />
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => marketAct('upgrade', m.name)} disabled={!!busy}>
                      Refresh
                    </Button>
                    <IconButton label="Remove" size="sm" onClick={() => marketAct('remove', m.name)} disabled={!!busy}>
                      <Trash2 size={14} />
                    </IconButton>
                  </>
                )
              }
            />
          ))
        ) : (
          <EmptyRow>None yet.</EmptyRow>
        )}
      </Group>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a marketplace"
        width={460}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!market.trim() || !!busy} onClick={() => void addMarket()}>
              Add
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addMarket();
          }}
        >
          <input autoFocus className={cx(inputCls, 'font-mono text-[13px]')} value={market} onChange={(e) => setMarket(e.target.value)} placeholder="owner/repo, a git URL or a folder" spellCheck={false} />
        </form>
      </Dialog>
      {confirmNode}
    </Stack>
  );
}

export function PluginsSettings() {
  const [tab, setTab] = useState<Tab>('every');
  const [q, setQ] = useState('');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={tab}
          onChange={(t) => (setTab(t), setQ(''))}
          options={[
            { value: 'every', label: 'Every agent', icon: <Puzzle size={13} /> },
            { value: 'claude', label: 'Claude Code', icon: <AgentIcon agent="claude" size={13} /> },
            { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={13} /> },
          ]}
        />
        {tab !== 'claude' && (
          <div className="relative min-w-[10rem] flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQ('')}
              placeholder={tab === 'every' ? 'Search plugins' : 'Search Codex plugins'}
              className={cx(inputCls, 'h-8 pr-8 pl-9 text-[13px]')}
            />
            {q && (
              <span className="absolute top-1/2 right-1 -translate-y-1/2">
                <IconButton label="Clear search" size="sm" onClick={() => setQ('')}>
                  <X size={14} />
                </IconButton>
              </span>
            )}
          </div>
        )}
      </div>
      {tab === 'every' ? <EveryAgent q={q} /> : tab === 'claude' ? <ClaudePluginsSettings /> : <CodexPlugins q={q} />}
    </div>
  );
}

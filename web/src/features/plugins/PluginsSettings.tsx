// Settings → Plugins. Plugins for every agent come first: the ones you added (on and off, with what they
// need), the ones that come with the app, a menu to add one from a link, a file or a folder, or to make
// your own. Claude Code's and Codex's own plugins, which only they use, have a tab each.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Bot, ChevronDown, FileArchive, FolderOpen, Link2, Plus, Puzzle, Search, Sparkles, Trash2, X } from 'lucide-react';
import type { PluginJob, PluginList, PluginView } from '@shared/plugins';
import type { MarketplaceEntry, PluginEntry, SetupResult } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { compact } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { Badge, Button, cx, IconButton, inputCls, MenuItem, MenuSep, Popover, Section, Segmented, Switch, Throbber, useConfirm } from '../../components/ui';
import { ClaudePluginsSettings } from '../settings/AgentSettings';
import { AddPluginDialog, NewPluginDialog } from './AddPlugin';
import { PluginDetail } from './PluginDetail';
import { PluginEditor } from './PluginEditor';
import { brings, JobView, PluginTile, trouble } from './parts';

type Tab = 'every' | 'claude' | 'codex';

/** A plugin as a card: what it is, what it brings, what stops it, and its switch (or Add). */
function Card({ p, titles, job, onOpen, onToggle, onAdd }: { p: PluginView; titles: Record<string, string>; job?: PluginJob; onOpen: () => void; onToggle?: (on: boolean) => void; onAdd?: () => void }) {
  const t = trouble(p, titles);
  const running = job?.state === 'running';
  return (
    <div className={cx('flex items-start gap-3 px-3 py-3 transition-colors hover:bg-bg-1 sm:px-4', p.installed && !p.enabled && 'opacity-60')}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <PluginTile p={p} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span translate="no" className="truncate text-[14px] font-medium text-fg">
              {p.title}
            </span>
            {p.version && <span className="text-[11.5px] text-fg-3">{p.version}</span>}
            {p.source.kind === 'folder' && p.source.mine && <Badge tone="ok">Yours</Badge>}
            {(p.source.kind === 'git' || p.source.kind === 'file' || (p.source.kind === 'folder' && !p.source.mine)) && <Badge>Added by you</Badge>}
          </span>
          {p.description && (
            <span translate={p.source.kind === 'builtin' ? undefined : 'no'} className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-fg-3">
              {p.description}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] text-fg-3">
            {brings(p) && <span>{brings(p)}</span>}
            {running ? (
              <span className="inline-flex items-center gap-1 text-fg-2">
                <Throbber className="h-3" /> {job!.steps.at(-1)?.label ?? 'Setting up'}…
              </span>
            ) : (
              t && <span className={t.tone === 'err' ? 'text-err' : t.tone === 'warn' ? 'text-warn' : 'text-fg-3'}>{t.text}</span>
            )}
          </span>
        </span>
      </button>
      {onToggle && <Switch on={p.enabled} onChange={onToggle} label={p.enabled ? `Turn ${p.title} off` : `Turn ${p.title} on`} className="mt-2.5 shrink-0" />}
      {onAdd && (
        <Button size="sm" onClick={onAdd} disabled={running} className="mt-1.5 shrink-0">
          {running ? <Throbber /> : 'Add'}
        </Button>
      )}
    </div>
  );
}

function EveryAgent() {
  const search = useSearch();
  const [list, setList] = useState<PluginList | null>(null);
  const [jobs, setJobs] = useState<Record<string, PluginJob>>({});
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(() => new URLSearchParams(search).get('plugin'));
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<'link' | 'file' | 'folder' | null>(null);
  const [making, setMaking] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuAt = useRef<HTMLButtonElement>(null);
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
  const withAgent = () => {
    setMenu(false);
    go(`/?prompt=${encodeURIComponent('Help me make a plugin for Hydor that ')}`);
  };

  if (!list)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  const running = Object.values(jobs).filter((j) => j.state === 'running' || (j.state === 'failed' && Date.now() - (j.endedAt ?? 0) < 120_000));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQ('')} placeholder="Search plugins" className={cx(inputCls, 'pr-8 pl-9')} />
          {q && (
            <span className="absolute top-1/2 right-1 -translate-y-1/2">
              <IconButton label="Clear search" size="sm" onClick={() => setQ('')}>
                <X size={14} />
              </IconButton>
            </span>
          )}
        </div>
        <Button ref={menuAt} variant="primary" icon={<Plus size={15} />} onClick={() => setMenu((o) => !o)}>
          Add
          <ChevronDown size={14} className="-mr-1 opacity-70" />
        </Button>
        <Popover anchor={menuAt} open={menu} onClose={() => setMenu(false)} align="end" width={270}>
          <MenuItem icon={<Sparkles size={14} />} onClick={() => (setMenu(false), setMaking(true))}>
            Make a plugin
          </MenuItem>
          <MenuItem icon={<Bot size={14} />} onClick={withAgent}>
            Make one with an agent
          </MenuItem>
          <MenuSep />
          <MenuItem icon={<Link2 size={14} />} onClick={() => (setMenu(false), setAdding('link'))}>
            From a link
          </MenuItem>
          <MenuItem icon={<FileArchive size={14} />} onClick={() => (setMenu(false), setAdding('file'))}>
            From a .zip file
          </MenuItem>
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(false), setAdding('folder'))}>
            From a folder
          </MenuItem>
        </Popover>
      </div>

      {running.map((j) => (
        <JobView key={j.id} job={j} title={titles[j.plugin]} />
      ))}

      <section className="overflow-hidden rounded-2xl border border-line bg-panel">
        <header className="flex items-center gap-2 px-3 pt-3 pb-1.5 sm:px-4">
          <Puzzle size={15} className="text-fg-3" />
          <h3 className="flex-1 text-[13px] font-semibold text-fg-2">Your plugins</h3>
          <span className="tnum text-[12px] text-fg-3">{list.installed.length}</span>
        </header>
        {installed.length ? (
          <div className="divide-y divide-line">
            {installed.map((p) => (
              <Card key={p.name} p={p} titles={titles} job={jobs[p.name]} onOpen={() => setOpen(p.name)} onToggle={(on) => turn(p, on)} />
            ))}
          </div>
        ) : (
          <p className="px-4 pt-1 pb-4 text-[13px] leading-relaxed text-fg-3">
            {words.length ? 'None match.' : 'None yet. A plugin brings skills, tools and instructions to every agent at once: add one that comes with the app below, or make your own.'}
          </p>
        )}
      </section>

      {available.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-line bg-panel">
          <header className="flex items-center gap-2 px-3 pt-3 pb-1.5 sm:px-4">
            <Sparkles size={15} className="text-fg-3" />
            <h3 className="flex-1 text-[13px] font-semibold text-fg-2">Come with the app</h3>
            <span className="tnum text-[12px] text-fg-3">{available.length}</span>
          </header>
          <div className="divide-y divide-line">
            {available.map((p) => (
              <Card key={p.name} p={p} titles={titles} job={jobs[p.name]} onOpen={() => setOpen(p.name)} onAdd={() => add(p)} />
            ))}
          </div>
        </section>
      )}

      <p className="px-1 text-[12px] leading-relaxed text-fg-3">
        Plugins work with every agent the app starts: Claude Code, Codex, Custom and the others. They use the open Agent Plugins format, and Claude Code’s plugins can be added here too, from their
        link.
      </p>

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
    </div>
  );
}

// ---- Codex's own plugins ---------------------------------------------------------------------------------

const PAGE = 40;

function CodexPlugins() {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
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
      if (action === 'add') setMarket('');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      load(q, limit);
    }
  };
  const row = (p: PluginEntry, action: 'add' | 'remove') => (
    <div key={p.id} className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span translate="no" className="text-[14px] font-medium">
            {p.name}
          </span>
          {p.marketplace && <Badge>{p.marketplace}</Badge>}
          {p.version && <span className="text-[11.5px] text-fg-3">{p.version}</span>}
          {!p.installed && p.installCount != null && <span className="text-[11.5px] text-fg-3">{compact(p.installCount)} installs</span>}
        </div>
        {p.description && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-3">{p.description}</div>}
      </div>
      {busy === p.id ? (
        <Throbber className="px-3 text-fg-3" />
      ) : action === 'remove' ? (
        <IconButton label="Remove" size="sm" onClick={() => act('remove', p)}>
          <Trash2 size={14} />
        </IconButton>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => act('add', p)} disabled={!!busy}>
          Add
        </Button>
      )}
    </div>
  );
  return (
    <div className="space-y-4">
      <Section title="Added to Codex" sub="Only Codex sessions use these">
        {!data ? (
          <div className="flex justify-center py-4">
            <Throbber />
          </div>
        ) : data.installed.length ? (
          <div className="-my-1 divide-y divide-line">{data.installed.map((p) => row(p, 'remove'))}</div>
        ) : (
          <div className="text-[13px] text-fg-3">None yet.</div>
        )}
      </Section>
      <Section
        title="Find more"
        sub={data ? `${data.total.toLocaleString()} ${q ? 'matching' : 'in Codex’s marketplaces'}` : 'Loading Codex’s marketplaces…'}
        actions={<input value={q} onChange={(e) => (setQ(e.target.value), setLimit(PAGE))} placeholder="Search Codex plugins" className={cx(inputCls, 'h-8.5 w-full sm:w-64')} />}
      >
        {!data ? (
          <div className="flex justify-center py-4">
            <Throbber />
          </div>
        ) : data.available.length ? (
          <>
            <div className={cx('-my-1 divide-y divide-line transition-opacity', loading && 'opacity-60')}>{data.available.map((p) => row(p, 'add'))}</div>
            {data.available.length < data.total && (
              <div className="mt-3 flex justify-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE)} disabled={loading}>
                  {loading ? <Throbber /> : `Show more (${(data.total - data.available.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-[13px] text-fg-3">{q ? 'None match.' : 'Nothing to add: add a marketplace below.'}</div>
        )}
      </Section>
      <Section title="Marketplaces" sub="Catalogs Codex adds plugins from">
        {data?.marketplaces.map((m) => (
          <div key={m.name} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">{m.name}</div>
              {m.source && <div className="truncate font-mono text-[12px] text-fg-3">{m.source}</div>}
            </div>
            {busy === `market:${m.name}` ? (
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
            )}
          </div>
        ))}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (market.trim()) marketAct('add', market.trim());
          }}
        >
          <input className={cx(inputCls, 'h-8.5 font-mono text-[13px]')} value={market} onChange={(e) => setMarket(e.target.value)} placeholder="owner/repo, a git URL or a folder" spellCheck={false} />
          <Button size="sm" type="submit" disabled={!market.trim() || !!busy}>
            Add
          </Button>
        </form>
      </Section>
      {confirmNode}
    </div>
  );
}

export function PluginsSettings() {
  const [tab, setTab] = useState<Tab>('every');
  return (
    <div className="space-y-4">
      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'every', label: 'Every agent', icon: <Puzzle size={13} /> },
          { value: 'claude', label: 'Claude Code', icon: <AgentIcon agent="claude" size={13} /> },
          { value: 'codex', label: 'Codex', icon: <AgentIcon agent="codex" size={13} /> },
        ]}
      />
      {tab === 'every' ? <EveryAgent /> : tab === 'claude' ? <ClaudePluginsSettings /> : <CodexPlugins />}
    </div>
  );
}

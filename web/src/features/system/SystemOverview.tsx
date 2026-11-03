// System → Overview: this computer at a glance. How it is doing (processor, memory, disk, graphics), and a card
// for each of its tools with what is useful now: files you opened lately and a search, repositories with
// changes, the terminals running, the web apps you can preview. Each card opens its tab.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Clock, Cpu, File, FolderTree, GitBranch, HardDrive, House, MemoryStick, Microchip, MonitorSmartphone, Plus, Search, SquareTerminal, Trash2 } from 'lucide-react';
import type { GitRepo, SystemInfo, SystemSample } from '@shared/types';
import { api } from '../../lib/api';
import { ago, basename, dirname, pct, tildify } from '../../lib/format';
import { machineId } from '../../lib/machine';
import { filePath, go } from '../../lib/nav';
import { toastError, useApp, useSystemLive } from '../../lib/store';
import { live } from '../../lib/ws';
import { Meter, severityColor, useInterval } from '../../components/charts';
import { Button, cx, inputCls, Throbber } from '../../components/ui';
import { useFilesPrefs } from '../files/prefs';
import { searchUrl } from '../files/SearchView';
import { loadTerms, newTerminal, useTerms } from '../terminal/TerminalPanel';
import { SystemHeader } from './SystemHeader';

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

/** A card for one of System's tools: its title opens the tab. */
function Card({ icon, title, count, to, children, actions }: { icon: ReactNode; title: string; count?: ReactNode; to: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">{icon}</span>
        <button type="button" onClick={() => go(to)} className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <h2 className="truncate text-[14.5px] font-semibold group-hover:underline">{title}</h2>
          {count != null && <span className="tnum rounded-md bg-bg-2 px-1.5 text-[11.5px] text-fg-3">{count}</span>}
        </button>
        {actions}
        <Button size="sm" variant="ghost" onClick={() => go(to)} className="-mr-2 shrink-0">
          Open <ChevronRight size={14} className="-mr-1" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 px-2 pb-2">{children}</div>
    </section>
  );
}

function Item({ icon, title, sub, right, onClick }: { icon: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-bg-1">
      <span className="flex w-5 shrink-0 justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-fg">{title}</span>
        {sub && <span className="block truncate text-[11.5px] text-fg-3">{sub}</span>}
      </span>
      {right && <span className="shrink-0 text-[11.5px] text-fg-3">{right}</span>}
    </button>
  );
}

const Quiet = ({ children }: { children: ReactNode }) => <p className="px-2 py-3 text-[13px] leading-relaxed text-fg-3">{children}</p>;

/** How the computer is doing, in four meters; the whole strip opens Monitor. */
function Health() {
  const samples = useSystemLive((s) => s.samples);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  useEffect(() => {
    api<{ info: SystemInfo; history: SystemSample[] }>('/api/system')
      .then((r) => {
        setInfo(r.info);
        if (!useSystemLive.getState().samples.length) useSystemLive.getState().reset(r.history);
      })
      .catch(() => {});
    return live.sub('@system');
  }, []);
  const s = samples[samples.length - 1];
  if (!s || !info)
    return (
      <div className="flex h-[118px] items-center justify-center rounded-2xl border border-line bg-panel text-fg-3">
        <Throbber size={24} />
      </div>
    );
  const mem = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const root = info.mounts.find((m) => m.mount === '/') ?? [...info.mounts].sort((a, b) => b.size - a.size)[0];
  const disk = root?.size ? (root.used / root.size) * 100 : null;
  const gpu = s.gpus.length ? s.gpus.reduce((a, g) => a + g.util, 0) / s.gpus.length : null;
  const meters: { icon: ReactNode; label: string; value: number; sub: string }[] = [
    { icon: <Cpu size={13} />, label: 'Processor', value: s.cpu, sub: `${info.cores} threads · load ${s.load[0].toFixed(1)}` },
    { icon: <MemoryStick size={13} />, label: 'Memory', value: mem, sub: `${(s.mem.available / 2 ** 30).toFixed(1)} GB free` },
    ...(disk != null && root ? [{ icon: <HardDrive size={13} />, label: 'Disk', value: disk, sub: `${(root.avail / 2 ** 30).toFixed(0)} GB free` }] : []),
    ...(gpu != null ? [{ icon: <Microchip size={13} />, label: s.gpus.length > 1 ? `Graphics × ${s.gpus.length}` : 'Graphics', value: gpu, sub: s.gpus[0].name.replace('NVIDIA ', '') }] : []),
  ];
  return (
    <button type="button" onClick={() => go('/system/monitor')} className="block w-full rounded-2xl border border-line bg-panel px-4 py-3.5 text-left transition-colors hover:border-line-2" title="Open Monitor">
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-fg-3">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        <span translate="no" className="font-medium text-fg">
          {info.hostname}
        </span>
        <span className="truncate">
          {info.os} · up {uptime(info.uptime)}
        </span>
        <span className="flex-1" />
        <span className="hidden items-center gap-2 sm:flex">
          <ArrowDown size={11} /> {(s.net.rx / 1024).toFixed(0)} KB/s <ArrowUp size={11} /> {(s.net.tx / 1024).toFixed(0)} KB/s
        </span>
      </div>
      <div className={cx('grid gap-3', meters.length === 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
        {meters.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] text-fg-3">
              {m.icon}
              <span className="truncate">{m.label}</span>
              <span className="tnum ml-auto text-[15px] font-semibold text-fg" style={{ color: m.value >= 90 ? severityColor(m.value) : undefined }}>
                {pct(m.value)}
              </span>
            </div>
            <Meter percent={m.value} />
            <div className="mt-1 truncate text-[11.5px] text-fg-3">{m.sub}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

function FilesCard() {
  const home = useApp((s) => s.boot?.home) ?? '/';
  const recent = useFilesPrefs((s) => s.recent);
  const [q, setQ] = useState('');
  return (
    <Card icon={<FolderTree size={16} />} title="Files" to="/files">
      <form
        className="relative px-2 pb-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(searchUrl({ q: q.trim(), in: home }));
        }}
      >
        <Search size={14} className="pointer-events-none absolute top-1/2 left-4.5 -translate-y-1/2 text-fg-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find files and words in them" className={cx(inputCls, 'h-9 pl-8 text-[13.5px]')} />
      </form>
      {recent.length ? (
        recent.slice(0, 5).map((p) => (
          <Item key={p} icon={<File size={14} />} title={<span translate="no">{basename(p)}</span>} sub={<span translate="no">{tildify(dirname(p), home)}</span>} onClick={() => go(filePath(p))} />
        ))
      ) : (
        <Quiet>Files you open show here, to get back to them.</Quiet>
      )}
      <div className="flex flex-wrap gap-1.5 px-2 pt-1.5">
        {[
          { icon: <House size={13} />, label: 'Home folder', to: `/files?dir=${encodeURIComponent(home)}` },
          { icon: <Clock size={13} />, label: 'Recent files', to: '/files?place=recent' },
          { icon: <Trash2 size={13} />, label: 'Trash', to: '/files?place=trash' },
        ].map((x) => (
          <button key={x.label} type="button" onClick={() => go(x.to)} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-bg-2 px-2.5 text-[12px] text-fg-2 hover:bg-bg-3 hover:text-fg">
            {x.icon}
            {x.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function GitCard() {
  const home = useApp((s) => s.boot?.home) ?? '/';
  const [repos, setRepos] = useState<GitRepo[] | null>(null);
  useEffect(() => {
    api<{ repos: GitRepo[] }>('/api/git/repos').then(
      (r) => setRepos(r.repos),
      () => setRepos([]),
    );
  }, []);
  // Those with changes or commits to send first, then the ones used last.
  const list = [...(repos ?? [])].sort((a, b) => Number(b.changed > 0 || b.ahead > 0) - Number(a.changed > 0 || a.ahead > 0) || (b.lastUsed ?? 0) - (a.lastUsed ?? 0)).slice(0, 5);
  return (
    <Card icon={<GitBranch size={16} />} title="Git" count={repos?.length || undefined} to="/git">
      {!repos ? (
        <div className="flex justify-center py-6">
          <Throbber />
        </div>
      ) : list.length ? (
        list.map((r) => (
          <Item
            key={r.path}
            icon={<GitBranch size={14} />}
            title={<span translate="no">{r.name}</span>}
            sub={
              <span translate="no">
                {r.branch ?? 'detached'} · {tildify(r.path, home)}
              </span>
            }
            right={
              r.changed > 0 || r.ahead > 0 || r.behind > 0 ? (
                <span className="flex items-center gap-1.5">
                  {r.changed > 0 && <span className="text-warn">{r.changed} changed</span>}
                  {r.ahead > 0 && <span>↑{r.ahead}</span>}
                  {r.behind > 0 && <span>↓{r.behind}</span>}
                </span>
              ) : (
                'up to date'
              )
            }
            onClick={() => go(`/git?path=${encodeURIComponent(r.path)}`)}
          />
        ))
      ) : (
        <Quiet>Repositories show up here once a session works in one, or when you add one on the Git tab.</Quiet>
      )}
    </Card>
  );
}

function TerminalCard() {
  const home = useApp((s) => s.boot?.home) ?? '/';
  const terms = useTerms((s) => s.list);
  const loaded = useTerms((s) => s.loaded);
  useEffect(() => {
    loadTerms();
  }, []);
  const open = async () => {
    try {
      await newTerminal();
      go('/terminal');
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <Card
      icon={<SquareTerminal size={16} />}
      title="Terminal"
      count={terms.length || undefined}
      to="/terminal"
      actions={
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={open} className="shrink-0">
          New
        </Button>
      }
    >
      {!loaded ? (
        <div className="flex justify-center py-6">
          <Throbber />
        </div>
      ) : terms.length ? (
        terms.slice(-5).map((t) => (
          <Item
            key={t.id}
            icon={<SquareTerminal size={14} />}
            title={<span translate="no">{t.name || basename(t.cwd) || t.command}</span>}
            sub={<span translate="no">{tildify(t.cwd, home)}</span>}
            right={ago(t.createdAt)}
            onClick={() => (useTerms.setState({ active: t.id }), go('/terminal'))}
          />
        ))
      ) : (
        <Quiet>No shells running. Start one here: it keeps running when you leave the page.</Quiet>
      )}
    </Card>
  );
}

interface DevServer {
  port: number;
  program: string;
  command: string;
  cwd?: string;
  web?: boolean;
  title?: string;
  project?: string;
  framework?: string;
}

function PreviewCard() {
  const [servers, setServers] = useState<DevServer[] | null>(null);
  const load = () =>
    api<{ servers: DevServer[] }>('/api/preview').then(
      (r) => setServers(r.servers.filter((s) => s.web !== false)),
      () => setServers([]),
    );
  useEffect(() => {
    load();
  }, []);
  useInterval(load, 15_000);
  return (
    <Card icon={<MonitorSmartphone size={16} />} title="Preview" count={servers?.length || undefined} to="/preview">
      {!servers ? (
        <div className="flex justify-center py-6">
          <Throbber />
        </div>
      ) : servers.length ? (
        servers.slice(0, 5).map((s) => (
          <Item
            key={s.port}
            icon={<span className="tnum font-mono text-[10.5px]">:{s.port}</span>}
            title={<span translate="no">{s.title || s.project || s.program}</span>}
            sub={<span translate="no">{[s.framework, s.cwd].filter(Boolean).join(' · ') || s.command}</span>}
            onClick={() => go(`/preview?port=${s.port}`)}
          />
        ))
      ) : (
        <Quiet>No web apps running. Start a dev server (npm run dev, say), or ask an agent to, and look at it here from any device.</Quiet>
      )}
    </Card>
  );
}

export function SystemOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SystemHeader tab="overview" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-5 sm:px-6">
          <Health />
          <div className="grid gap-4 md:grid-cols-2">
            <FilesCard />
            <GitCard />
            <TerminalCard />
            {!machineId && <PreviewCard />}
          </div>
        </div>
      </div>
    </div>
  );
}

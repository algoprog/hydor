import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Bot, Cpu, Fan, Gauge, HardDrive, MemoryStick, Microchip, Network, NotebookText, Server, Thermometer, Zap } from 'lucide-react';
import type { KernelInfo, SystemInfo, SystemSample } from '@shared/types';
import { api, post } from '../../lib/api';
import { ago, basename, bytes, pct, rate, tildify } from '../../lib/format';
import { go, openFile, sessionPath } from '../../lib/nav';
import { AgentIcon } from '../../components/AgentIcon';
import { limitsText, useSessionResources } from './sessionUse';
import { toastError, useApp, useSystemLive } from '../../lib/store';
import { live } from '../../lib/ws';
import { CoreGrid, Legend, Meter, severityColor, Sparkline, TimeSeries, useInterval } from '../../components/charts';
import { SystemHeader } from './SystemHeader';
import { Button, cx, Throbber, Segmented, useConfirm } from '../../components/ui';

function Card({ icon, title, right, children, className }: { icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 rounded-2xl border border-line bg-panel p-4', className)}>
      <header className="mb-3 flex items-center gap-2">
        <span className="text-fg-3">{icon}</span>
        <h2 className="flex-1 text-[13px] font-semibold">{title}</h2>
        {right && <div className="text-[12px] text-fg-3">{right}</div>}
      </header>
      {children}
    </section>
  );
}

function Tile({ icon, label, value, sub, spark, sparkMax }: { icon: React.ReactNode; label: string; value: string; sub?: string; spark?: number[]; sparkMax?: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel px-4 pt-3 pb-2">
      <div className="flex items-center gap-1.5 text-[12px] text-fg-3">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[22px] leading-tight font-semibold tracking-tight">{value}</div>
      {sub && <div className="truncate text-[11.5px] text-fg-3">{sub}</div>}
      {spark && spark.length > 1 && (
        <div className="mt-1.5">
          <Sparkline values={spark} max={sparkMax} height={26} />
        </div>
      )}
    </div>
  );
}

function uptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

function ProcTable({ info }: { info: SystemInfo }) {
  const [by, setBy] = useState<'cpu' | 'mem' | 'gpu'>('cpu');
  const list = by === 'cpu' ? info.processes.byCpu : by === 'mem' ? info.processes.byMem : info.processes.gpu;
  return (
    <Card
      icon={<Server size={15} />}
      title="Processes"
      right={
        <Segmented
          size="sm"
          value={by}
          onChange={setBy}
          options={[
            { value: 'cpu', label: 'CPU' },
            { value: 'mem', label: 'Memory' },
            ...(info.processes.gpu.length ? [{ value: 'gpu' as const, label: 'GPU' }] : []),
          ]}
        />
      }
      className="lg:col-span-2"
    >
      <div className="overflow-x-auto">
        <table className="tnum w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-fg-3">
              <th className="py-1 pr-3 font-medium">Process</th>
              <th className="hidden py-1 pr-3 font-medium sm:table-cell">PID</th>
              <th className="hidden py-1 pr-3 font-medium sm:table-cell">User</th>
              <th className="py-1 pr-3 text-right font-medium">CPU</th>
              <th className="py-1 pr-3 text-right font-medium">Memory</th>
              {by === 'gpu' && <th className="py-1 text-right font-medium">VRAM</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.pid} className="border-t border-line" title={p.cmd}>
                <td className="max-w-[46vw] truncate py-1.5 pr-3 sm:max-w-[340px]">
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 hidden font-mono text-[11px] text-fg-3 sm:inline">{p.cmd.replace(/^\S*\//, '').slice(0, 80)}</span>
                </td>
                <td className="hidden py-1.5 pr-3 text-fg-3 sm:table-cell">{p.pid}</td>
                <td className="hidden py-1.5 pr-3 text-fg-3 sm:table-cell">{p.user}</td>
                <td className="py-1.5 pr-3 text-right">{p.cpu.toFixed(1)}%</td>
                <td className="py-1.5 pr-3 text-right">{bytes(p.rss)}</td>
                {by === 'gpu' && <td className="py-1.5 text-right">{bytes(p.gpuMem)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Each live session's programs (its agent's, the commands it runs, the servers it started): which session the computer is busy with. */
function SessionsCard() {
  const r = useSessionResources();
  if (!r?.measured || !r.sessions.length) return null;
  return (
    <Card
      icon={<Bot size={15} />}
      title="Sessions"
      right={
        <button onClick={() => go('/settings?s=general&find=Limit%20each%20session')} className="hover:text-fg-2 hover:underline">
          {limitsText(r.limits) || 'No limits'}
        </button>
      }
      className="lg:col-span-2"
    >
      <div className="overflow-x-auto">
        <table className="tnum w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-fg-3">
              <th className="py-1 pr-3 font-medium">Session</th>
              <th className="hidden py-1 pr-3 text-right font-medium sm:table-cell">Programs</th>
              <th className="py-1 pr-3 text-right font-medium">CPU</th>
              <th className="py-1 text-right font-medium">Memory</th>
            </tr>
          </thead>
          <tbody>
            {r.sessions.map((x) => (
              <tr key={x.key} className="cursor-pointer border-t border-line hover:bg-bg-2" onClick={() => go(sessionPath(x.key))} title={x.limits ? limitsText(x.limits) : undefined}>
                <td className="max-w-[46vw] truncate py-1.5 pr-3 sm:max-w-[420px]">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {x.agent && <AgentIcon agent={x.agent} size={13} />}
                    <span className="truncate font-medium" translate="no">
                      {x.title}
                    </span>
                    {!!x.stopped && <span className="shrink-0 text-[11px] text-warn">{x.stopped === 1 ? 'one stopped at its limit' : `${x.stopped} stopped at its limit`}</span>}
                  </span>
                </td>
                <td className="hidden py-1.5 pr-3 text-right text-fg-3 sm:table-cell">{x.procs}</td>
                <td className="py-1.5 pr-3 text-right">{x.cpu == null ? '—' : `${x.cpu.toFixed(1)}%`}</td>
                <td className="py-1.5 text-right">{bytes(x.memory)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const KERNEL_STATUS: Record<KernelInfo['status'], string> = { starting: 'starting', idle: 'idle', busy: 'running', restarting: 'restarting', dead: 'stopped' };

/** Notebook kernels keep running after their notebook is closed (holding memory, maybe a GPU); here they can be stopped. */
function NotebookKernels() {
  const home = useApp((s) => s.boot?.home);
  const [list, setList] = useState<KernelInfo[]>([]);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(() => {
    api<{ kernels: KernelInfo[] }>('/api/kernels')
      .then((r) => setList(r.kernels))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useInterval(load, 5000);
  if (!list.length) return null;
  const shutdown = async (k: KernelInfo) => {
    if (!(await confirm({ title: `Shut down the kernel of ${basename(k.notebook)}?`, body: 'Its variables are lost and its memory is freed.', confirm: 'Shut down', danger: true }))) return;
    await post(`/api/kernels/${k.id}/shutdown`).catch(toastError);
    load();
  };
  return (
    <Card icon={<NotebookText size={15} />} title="Notebook kernels" right={`${list.length} running`}>
      <div className="-my-1.5 divide-y divide-line">
        {list.map((k) => (
          <div key={k.id} className="flex items-center gap-3 py-2">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', k.status === 'idle' ? 'bg-ok' : k.status === 'dead' ? 'bg-err' : k.status === 'busy' ? 'bg-accent' : 'bg-warn')} />
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openFile(k.notebook)} title={k.notebook}>
              <div className="truncate text-[13px] font-medium text-fg hover:underline">{basename(k.notebook)}</div>
              <div className="truncate text-[11.5px] text-fg-3">
                {k.envName} · {KERNEL_STATUS[k.status]} · started {ago(k.startedAt)} · {tildify(k.notebook, home)}
              </div>
            </button>
            {k.rss != null && <span className="tnum shrink-0 text-[12px] text-fg-2">{bytes(k.rss)}</span>}
            <Button size="sm" variant="ghost" onClick={() => shutdown(k)}>
              Shut down
            </Button>
          </div>
        ))}
      </div>
      {confirmNode}
    </Card>
  );
}

/** System → Monitor: how this computer is doing, live (processor, memory, graphics, network, storage, sensors, processes, notebook kernels). */
export function MonitorPage() {
  const samples = useSystemLive((s) => s.samples);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const loadInfo = async (withHistory = false) => {
    try {
      const r = await api<{ info: SystemInfo; history: SystemSample[] }>('/api/system');
      setInfo(r.info);
      if (withHistory) useSystemLive.getState().reset(r.history);
    } catch {}
  };
  useEffect(() => {
    loadInfo(true);
    return live.sub('@system');
  }, []);
  useInterval(() => loadInfo(false), 5000);

  const s = samples[samples.length - 1];
  const times = useMemo(() => samples.map((x) => x.t), [samples]);
  const series = useMemo(
    () => ({
      cpu: samples.map((x) => x.cpu),
      mem: samples.map((x) => x.mem.used),
      rx: samples.map((x) => x.net.rx),
      tx: samples.map((x) => x.net.tx),
      rd: samples.map((x) => x.disk.read),
      wr: samples.map((x) => x.disk.write),
      gpu: samples.map((x) => (x.gpus.length ? x.gpus.reduce((a, g) => a + g.util, 0) / x.gpus.length : 0)),
    }),
    [samples],
  );

  if (!s || !info) {
    return (
      <div className="flex h-full items-center justify-center text-fg-3">
        <Throbber size={34} />
      </div>
    );
  }

  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const swapPct = s.swap.total ? (s.swap.used / s.swap.total) * 100 : 0;
  const cpuTemp = s.temps.find((t) => t.label.startsWith('CPU'));
  const gpuAvg = s.gpus.length ? s.gpus.reduce((a, g) => a + g.util, 0) / s.gpus.length : null;
  const vramUsed = s.gpus.reduce((a, g) => a + g.memUsed, 0);
  const vramTotal = s.gpus.reduce((a, g) => a + g.memTotal, 0);

  return (
    // "system": its words as this page means them (Memory: the computer's, not the agents' notes).
    <div data-i18n="system" className="flex h-full min-h-0 flex-col">
      <SystemHeader tab="monitor" />
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-col gap-0.5 text-[12.5px] text-fg-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-1.5">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
            <span translate="no" className="font-medium text-fg-2">
              {info.hostname}
            </span>
            <span>· up {uptime(info.uptime)}</span>
          </span>
          <span className="min-w-0 sm:truncate">
            <span className="hidden sm:inline">· </span>
            {info.cpuModel} · {info.cores} threads · {info.os} · {info.kernel}
          </span>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5 [&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1">
          <Tile icon={<Cpu size={13} />} label="CPU" value={pct(s.cpu)} sub={`load ${s.load.map((l) => l.toFixed(2)).join(' · ')}`} spark={series.cpu.slice(-60)} sparkMax={100} />
          <Tile icon={<MemoryStick size={13} />} label="Memory" value={pct(memPct)} sub={`${bytes(s.mem.used)} of ${bytes(s.mem.total)}`} spark={series.mem.slice(-60)} sparkMax={s.mem.total} />
          {s.gpus.length > 0 && <Tile icon={<Microchip size={13} />} label={`GPU × ${s.gpus.length}`} value={pct(gpuAvg)} sub={`${bytes(vramUsed)} of ${bytes(vramTotal)} VRAM`} spark={series.gpu.slice(-60)} sparkMax={100} />}
          <Tile icon={<Network size={13} />} label="Network" value={rate(s.net.rx)} sub={`↓ in · ↑ ${rate(s.net.tx)} out`} spark={series.rx.slice(-60)} />
          <Tile icon={<HardDrive size={13} />} label="Disk I/O" value={rate(s.disk.read + s.disk.write)} sub={`read ${rate(s.disk.read)} · write ${rate(s.disk.write)}`} spark={series.wr.slice(-60).map((v, i) => v + (series.rd.slice(-60)[i] ?? 0))} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card icon={<Cpu size={15} />} title="CPU" right={cpuTemp ? `${cpuTemp.value.toFixed(0)} °C` : undefined}>
            <TimeSeries series={[{ label: 'CPU', color: 'var(--viz-1)', values: series.cpu }]} times={times} max={100} format={(v) => `${Math.round(v)}%`} height={130} />
            <div className="mt-3 mb-1 text-[11.5px] text-fg-3">Per core</div>
            <CoreGrid cores={s.cores} />
          </Card>

          <Card icon={<MemoryStick size={15} />} title="Memory" right={`${bytes(s.mem.available)} available`}>
            <TimeSeries series={[{ label: 'Used', color: 'var(--viz-1)', values: series.mem }]} times={times} max={s.mem.total} format={(v) => bytes(v, 0)} height={130} ticks={2} />
            <div className="mt-3 space-y-2.5">
              <div>
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="text-fg-2">RAM</span>
                  <span className="tnum">
                    {bytes(s.mem.used)} / {bytes(s.mem.total)} · <span className="font-semibold">{pct(memPct)}</span>
                  </span>
                </div>
                <Meter percent={memPct} />
                <div className="mt-1 text-[11px] text-fg-3">{bytes(s.mem.cached)} cache · {bytes(s.mem.buffers)} buffers</div>
              </div>
              {s.swap.total > 0 && (
                <div>
                  <div className="mb-1 flex justify-between text-[12px]">
                    <span className="text-fg-2">Swap</span>
                    <span className="tnum">
                      {bytes(s.swap.used)} / {bytes(s.swap.total)} · <span className="font-semibold">{pct(swapPct)}</span>
                    </span>
                  </div>
                  <Meter percent={swapPct} />
                </div>
              )}
            </div>
          </Card>

          {s.gpus.map((g, gi) => {
            const memP = g.memTotal ? (g.memUsed / g.memTotal) * 100 : 0;
            const powP = g.powerLimit ? (g.power / g.powerLimit) * 100 : 0;
            return (
              <Card key={g.index} icon={<Microchip size={15} />} title={`GPU ${g.index} · ${g.name.replace('NVIDIA ', '')}`} right={`${g.pstate} · ${g.clock} MHz`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-[22px] font-semibold">{pct(g.util)}</span>
                  <span className="text-[12px] text-fg-3">utilization</span>
                </div>
                {/* On a phone the graphics cards stack into a long page: each shows its numbers, and the GPU tile above its line. */}
                <div className="hidden sm:block">
                  <TimeSeries series={[{ label: 'Utilization', color: 'var(--viz-1)', values: samples.map((x) => x.gpus[gi]?.util ?? null) }]} times={times} max={100} format={(v) => `${Math.round(v)}%`} height={96} ticks={2} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <div className="col-span-2">
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className="text-fg-2">VRAM</span>
                      <span className="tnum">
                        {bytes(g.memUsed)} / {bytes(g.memTotal)} · <span className="font-semibold">{pct(memP)}</span>
                      </span>
                    </div>
                    <Meter percent={memP} />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1 text-fg-2">
                        <Zap size={12} /> Power
                      </span>
                      <span className="tnum">
                        {g.power.toFixed(0)} / {g.powerLimit.toFixed(0)} W
                      </span>
                    </div>
                    <Meter percent={powP} />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1 text-fg-2">
                      <Thermometer size={12} /> {g.temp} °C
                    </span>
                    <span className="flex items-center gap-1 text-fg-3">
                      <Fan size={12} /> {g.fan == null ? 'n/a' : `${g.fan}%`}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}

          <Card icon={<Network size={15} />} title="Network">
            <div className="mb-2">
              <Legend
                items={[
                  { label: 'Download', color: 'var(--viz-1)', value: rate(s.net.rx) },
                  { label: 'Upload', color: 'var(--viz-2)', value: rate(s.net.tx) },
                ]}
              />
            </div>
            <TimeSeries
              series={[
                { label: 'Download', color: 'var(--viz-1)', values: series.rx },
                { label: 'Upload', color: 'var(--viz-2)', values: series.tx },
              ]}
              times={times}
              format={(v) => rate(v).replace(' ', '').replace('/s', '')}
              height={130}
            />
            <div className="mt-3 space-y-1">
              {Object.entries(s.net.ifaces).map(([name, v]) => (
                <div key={name} className="tnum flex items-center gap-2 text-[12px]">
                  <span className="w-24 truncate font-mono text-fg-2">{name}</span>
                  <span className="flex items-center gap-1 text-fg-3">
                    <ArrowDown size={11} /> {rate(v.rx)}
                  </span>
                  <span className="flex items-center gap-1 text-fg-3">
                    <ArrowUp size={11} /> {rate(v.tx)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card icon={<HardDrive size={15} />} title="Storage">
            <div className="mb-2">
              <Legend
                items={[
                  { label: 'Read', color: 'var(--viz-1)', value: rate(s.disk.read) },
                  { label: 'Write', color: 'var(--viz-2)', value: rate(s.disk.write) },
                ]}
              />
            </div>
            <TimeSeries
              series={[
                { label: 'Read', color: 'var(--viz-1)', values: series.rd },
                { label: 'Write', color: 'var(--viz-2)', values: series.wr },
              ]}
              times={times}
              format={(v) => rate(v).replace(' ', '').replace('/s', '')}
              height={110}
            />
            <div className="mt-3 space-y-2.5">
              {info.mounts.map((m) => {
                const p = m.size ? (m.used / m.size) * 100 : 0;
                return (
                  <div key={m.mount}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-fg">{m.mount}</span>
                        <span className="ml-1.5 text-[11px] text-fg-3">
                          {m.fstype} · {m.device.replace('/dev/', '')}
                        </span>
                      </span>
                      <span className="tnum shrink-0">
                        {bytes(m.avail)} free · <span className="font-semibold">{pct(p)}</span>
                      </span>
                    </div>
                    <Meter percent={p} />
                    <div className="mt-0.5 text-[11px] text-fg-3">
                      {bytes(m.used)} used of {bytes(m.size)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card icon={<Thermometer size={15} />} title="Sensors">
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {[...s.gpus.map((g) => ({ label: `GPU ${g.index}`, value: g.temp })), ...s.temps].map((t) => (
                <div key={t.label} className="flex items-center gap-2 text-[12.5px]">
                  <Gauge size={13} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1 truncate text-fg-2">{t.label}</span>
                  <span className={cx('tnum font-medium', t.value >= 85 && 'text-err')}>{t.value.toFixed(0)} °C</span>
                  <span className="h-1.5 w-14 shrink-0">
                    <Meter percent={Math.min(100, (t.value / 100) * 100)} height={6} color={severityColor(t.value >= 85 ? 95 : t.value >= 75 ? 80 : 10)} />
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <NotebookKernels />
          <SessionsCard />
          <ProcTable info={info} />
        </div>
      </div>
      </div>
    </div>
  );
}

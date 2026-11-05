// Host metrics for the System page: CPU, memory, GPUs, disks, network, sensors, processes.
// Samples every 2 s while someone is watching and keeps ten minutes of history.
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';

import type { GpuSample, ProcInfo, SystemInfo, SystemSample } from '../shared/types.ts';

const HISTORY = 300;
const SAMPLE_MS = 2000;
const read = (p: string) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

function run(cmd: string, args: string[], timeout = 4000): Promise<string> {
  return runResult(cmd, args, timeout).then((r) => r.out);
}

/** Output plus the error code, so a missing program can be told from one that failed once. */
function runResult(cmd: string, args: string[], timeout = 4000): Promise<{ out: string; code: string | number | null }> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (e, out) =>
        resolve({ out: String(out ?? ''), code: e ? ((e as NodeJS.ErrnoException).code ?? 'failed') : null }),
      );
    } catch (e) {
      // spawn throws synchronously on some errors (ENOMEM under memory pressure).
      resolve({ out: '', code: (e as NodeJS.ErrnoException).code ?? 'failed' });
    }
  });
}

// How long to stop asking nvidia-smi after it turns out not to be installed (a driver may be added later).
const NO_GPU_RECHECK_MS = 5 * 60_000;

const CLK = 100; // USER_HZ on Linux
const PAGE = 4096;
const VIRTUAL_IF = /^(lo|docker\d*|veth|br-|virbr|tun|tap|cni|flannel|kube)/;
const WHOLE_DISK = /^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|xvd[a-z]+|mmcblk\d+)$/;

export class SystemMonitor extends EventEmitter {
  history: SystemSample[] = [];
  private timer: NodeJS.Timeout | null = null;
  private watchers = 0;
  private lastPoll = 0;
  private prevCpu: number[][] | null = null;
  private prevNet: Record<string, [number, number]> | null = null;
  private prevDisk: [number, number] | null = null;
  private prevT = 0;
  private prevProc = new Map<number, number>();
  private prevProcT = 0;
  private users = new Map<number, string>();
  private info: SystemInfo | null = null;
  private infoAt = 0;
  // nvidia-smi is skipped until this time; set only when it is missing, never for a single failed call.
  private gpuOffUntil = 0;
  private get hasGpu() {
    return Date.now() >= this.gpuOffUntil;
  }

  /** A client started or stopped watching; sampling runs only while someone watches. */
  watch(delta: 1 | -1) {
    this.watchers = Math.max(0, this.watchers + delta);
    this.ensure();
  }

  poll() {
    this.lastPoll = Date.now();
    this.ensure();
  }

  private ensure() {
    const active = this.watchers > 0 || Date.now() - this.lastPoll < 30_000;
    if (active && !this.timer) {
      this.sample().catch(() => {});
      this.timer = setInterval(() => {
        if (this.watchers === 0 && Date.now() - this.lastPoll > 30_000) {
          clearInterval(this.timer!);
          this.timer = null;
          return;
        }
        this.sample().catch(() => {});
      }, SAMPLE_MS);
    }
  }

  private cpuTimes(): number[][] {
    // [total, idle] per line: cpu, cpu0, cpu1, ...
    return read('/proc/stat')
      .split('\n')
      .filter((l) => l.startsWith('cpu'))
      .map((l) => {
        const v = l.split(/\s+/).slice(1).map(Number);
        const idle = (v[3] ?? 0) + (v[4] ?? 0);
        const total = v.slice(0, 8).reduce((a, b) => a + b, 0);
        return [total, idle];
      });
  }

  private async gpus(): Promise<GpuSample[]> {
    if (!this.hasGpu) return [];
    const { out, code } = await runResult('nvidia-smi', [
      '--query-gpu=index,name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,power.limit,fan.speed,clocks.sm,pstate',
      '--format=csv,noheader,nounits',
    ]);
    if (!out.trim()) {
      // Not installed, or no driver: check again in a while. Anything else (a timeout while the
      // GPUs are busy, a driver hiccup, a failed spawn) only loses this one reading.
      if (code === 'ENOENT' || code === 9) this.gpuOffUntil = Date.now() + NO_GPU_RECHECK_MS;
      return [];
    }
    const num = (s: string) => {
      const n = Number(s.trim());
      return Number.isFinite(n) ? n : 0;
    };
    return out
      .trim()
      .split('\n')
      .map((l) => l.split(','))
      .map((f) => ({
        index: num(f[0]),
        name: (f[1] ?? '').trim(),
        util: num(f[2]),
        memUtil: num(f[3]),
        memUsed: num(f[4]) * 1024 * 1024,
        memTotal: num(f[5]) * 1024 * 1024,
        temp: num(f[6]),
        power: num(f[7]),
        powerLimit: num(f[8]),
        fan: /\d/.test(f[9] ?? '') ? num(f[9]) : null,
        clock: num(f[10]),
        pstate: (f[11] ?? '').trim(),
      }));
  }

  private temps(): { label: string; value: number }[] {
    const out: { label: string; value: number }[] = [];
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync('/sys/class/hwmon');
    } catch {
      return out;
    }
    for (const d of dirs) {
      const base = `/sys/class/hwmon/${d}`;
      const chip = read(`${base}/name`).trim();
      let files: string[] = [];
      try {
        files = fs.readdirSync(base).filter((f) => /^temp\d+_input$/.test(f));
      } catch {}
      for (const f of files) {
        const v = Number(read(`${base}/${f}`)) / 1000;
        if (!Number.isFinite(v) || v <= 0 || v > 150) continue;
        const label = read(`${base}/${f.replace('_input', '_label')}`).trim();
        const name = chip === 'k10temp' || chip === 'coretemp' ? `CPU ${label || ''}`.trim() : chip === 'nvme' ? `NVMe ${label || ''}`.trim() : `${chip} ${label}`.trim();
        out.push({ label: name, value: Math.round(v * 10) / 10 });
      }
    }
    return out;
  }

  async sample(): Promise<SystemSample> {
    const now = Date.now();
    const dt = this.prevT ? (now - this.prevT) / 1000 : 0;

    const cpu = this.cpuTimes();
    let total = 0;
    let cores: number[] = [];
    if (this.prevCpu && this.prevCpu.length === cpu.length) {
      const pct = cpu.map(([t, i], k) => {
        const [pt, pi] = this.prevCpu![k];
        const dT = t - pt;
        return dT > 0 ? Math.max(0, Math.min(100, (1 - (i - pi) / dT) * 100)) : 0;
      });
      total = pct[0];
      cores = pct.slice(1);
    } else cores = new Array(Math.max(0, cpu.length - 1)).fill(0);
    this.prevCpu = cpu;

    const mi: Record<string, number> = {};
    for (const l of read('/proc/meminfo').split('\n')) {
      const m = l.match(/^(\w+):\s+(\d+)/);
      if (m) mi[m[1]] = Number(m[2]) * 1024;
    }
    const mem = {
      total: mi.MemTotal ?? 0,
      available: mi.MemAvailable ?? 0,
      cached: (mi.Cached ?? 0) + (mi.SReclaimable ?? 0),
      buffers: mi.Buffers ?? 0,
      used: (mi.MemTotal ?? 0) - (mi.MemAvailable ?? 0),
    };
    const swap = { total: mi.SwapTotal ?? 0, used: (mi.SwapTotal ?? 0) - (mi.SwapFree ?? 0) };
    const la = read('/proc/loadavg').split(' ').map(Number);

    const netNow: Record<string, [number, number]> = {};
    for (const l of read('/proc/net/dev').split('\n').slice(2)) {
      const m = l.trim().match(/^([^:]+):\s*(.*)$/);
      if (!m) continue;
      const name = m[1].trim();
      if (VIRTUAL_IF.test(name)) continue;
      const f = m[2].split(/\s+/).map(Number);
      netNow[name] = [f[0], f[8]];
    }
    const ifaces: Record<string, { rx: number; tx: number }> = {};
    let rx = 0;
    let tx = 0;
    if (this.prevNet && dt > 0) {
      for (const [name, [r, t]] of Object.entries(netNow)) {
        const p = this.prevNet[name];
        if (!p) continue;
        const ir = Math.max(0, (r - p[0]) / dt);
        const it = Math.max(0, (t - p[1]) / dt);
        ifaces[name] = { rx: ir, tx: it };
        if (!name.startsWith('wg')) {
          rx += ir;
          tx += it;
        }
      }
    }
    this.prevNet = netNow;

    let rd = 0;
    let wr = 0;
    for (const l of read('/proc/diskstats').split('\n')) {
      const f = l.trim().split(/\s+/);
      if (f.length < 10 || !WHOLE_DISK.test(f[2])) continue;
      rd += Number(f[5]) * 512;
      wr += Number(f[9]) * 512;
    }
    const disk = this.prevDisk && dt > 0 ? { read: Math.max(0, (rd - this.prevDisk[0]) / dt), write: Math.max(0, (wr - this.prevDisk[1]) / dt) } : { read: 0, write: 0 };
    this.prevDisk = [rd, wr];
    this.prevT = now;

    const s: SystemSample = {
      t: now,
      cpu: Math.round(total * 10) / 10,
      cores: cores.map((c) => Math.round(c)),
      load: [la[0] || 0, la[1] || 0, la[2] || 0],
      mem,
      swap,
      gpus: await this.gpus(),
      net: { rx, tx, ifaces },
      disk,
      temps: this.temps(),
    };
    this.history.push(s);
    if (this.history.length > HISTORY) this.history.shift();
    this.emit('sample', s);
    return s;
  }

  private userName(uid: number): string {
    if (this.users.size === 0) {
      for (const l of read('/etc/passwd').split('\n')) {
        const f = l.split(':');
        if (f.length > 2) this.users.set(Number(f[2]), f[0]);
      }
    }
    return this.users.get(uid) ?? String(uid);
  }

  /** Per-process CPU from /proc deltas (ps only reports lifetime averages). */
  private async processes(): Promise<SystemInfo['processes']> {
    const now = Date.now();
    const dt = this.prevProcT ? (now - this.prevProcT) / 1000 : 0;
    const procs: (ProcInfo & { ticks: number; uid: number })[] = [];
    let pids: string[] = [];
    try {
      pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
    } catch {}
    const next = new Map<number, number>();
    for (const p of pids) {
      const stat = read(`/proc/${p}/stat`);
      if (!stat) continue;
      const close = stat.lastIndexOf(')');
      const name = stat.slice(stat.indexOf('(') + 1, close);
      const f = stat.slice(close + 2).split(' ');
      const ticks = Number(f[11]) + Number(f[12]);
      const rss = Number(f[21]) * PAGE;
      const pid = Number(p);
      next.set(pid, ticks);
      const prev = this.prevProc.get(pid);
      const cpu = dt > 0 && prev != null ? Math.max(0, ((ticks - prev) / CLK / dt) * 100) : 0;
      procs.push({ pid, name, cmd: '', user: '', cpu, rss, ticks, uid: -1 });
    }
    this.prevProc = next;
    this.prevProcT = now;
    const finish = (list: typeof procs) =>
      list.map((x) => {
        let uid = -1;
        const st = read(`/proc/${x.pid}/status`).match(/^Uid:\s+(\d+)/m);
        if (st) uid = Number(st[1]);
        const cmd = read(`/proc/${x.pid}/cmdline`).replace(/\0+$/, '').replace(/\0/g, ' ');
        return { pid: x.pid, name: x.name, cmd: cmd.slice(0, 300) || `[${x.name}]`, user: this.userName(uid), cpu: Math.round(x.cpu * 10) / 10, rss: x.rss };
      });
    const byCpu = finish([...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 12));
    const byMem = finish([...procs].sort((a, b) => b.rss - a.rss).slice(0, 12));
    let gpu: ProcInfo[] = [];
    if (this.hasGpu) {
      const out = await run('nvidia-smi', ['--query-compute-apps=pid,used_memory,process_name', '--format=csv,noheader,nounits']);
      const byPid = new Map<number, number>();
      for (const l of out.trim().split('\n')) {
        const f = l.split(',').map((s) => s.trim());
        if (f.length >= 2 && /^\d+$/.test(f[0])) byPid.set(Number(f[0]), (byPid.get(Number(f[0])) ?? 0) + Number(f[1]) * 1024 * 1024);
      }
      const found = procs.filter((p) => byPid.has(p.pid));
      gpu = finish(found)
        .map((p) => ({ ...p, gpuMem: byPid.get(p.pid) }))
        .sort((a, b) => (b.gpuMem ?? 0) - (a.gpuMem ?? 0))
        .slice(0, 12);
    }
    return { byCpu, byMem, gpu };
  }

  private async mounts(): Promise<SystemInfo['mounts']> {
    const seen = new Set<string>();
    const out: SystemInfo['mounts'] = [];
    for (const l of read('/proc/mounts').split('\n')) {
      const [device, mount, fstype] = l.split(' ');
      if (!device || !mount || !device.startsWith('/dev/') || seen.has(device)) continue;
      if (/^(squashfs|tmpfs|devtmpfs|overlay|efivarfs)$/.test(fstype) || mount.startsWith('/snap')) continue;
      seen.add(device);
      try {
        const st = await fs.promises.statfs(mount);
        const size = st.blocks * st.bsize;
        const avail = st.bavail * st.bsize;
        const free = st.bfree * st.bsize;
        out.push({ mount: mount.replace(/\\040/g, ' '), device, fstype, size, used: size - free, avail });
      } catch {}
    }
    return out.sort((a, b) => b.size - a.size);
  }

  async snapshot(): Promise<{ info: SystemInfo; history: SystemSample[] }> {
    this.poll();
    if (!this.history.length) {
      await this.sample();
      await new Promise((r) => setTimeout(r, 400));
      await this.sample();
    }
    if (!this.info || Date.now() - this.infoAt > 4000) {
      if (!this.prevProcT) {
        // Per-process CPU needs two readings.
        await this.processes();
        await new Promise((r) => setTimeout(r, 500));
      }
      const osRelease = read('/etc/os-release').match(/^PRETTY_NAME="?([^"\n]+)"?/m)?.[1] ?? os.type();
      this.info = {
        hostname: os.hostname(),
        os: osRelease,
        kernel: os.release(),
        uptime: os.uptime(),
        cpuModel: os.cpus()[0]?.model?.trim() ?? '',
        cores: os.cpus().length,
        mounts: await this.mounts(),
        processes: await this.processes(),
      };
      this.infoAt = Date.now();
    }
    return { info: this.info, history: this.history };
  }
}

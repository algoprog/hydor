// Clusters reached over SSH, with the server's own ssh (the user's ~/.ssh/config and keys, never a password prompt:
// BatchMode), one connection kept open per host (ControlMaster) so following runs is cheap. SLURM clusters you
// cannot install anything on: a batch script with the job's needs (#SBATCH lines), the cluster's setup lines and
// the command, submitted with sbatch, followed with squeue and sacct, its log read with tail, cancelled with
// scancel. Plain SSH machines: the run goes into tmux there (or nohup), as it does here. Whatever the login shell
// prints first (a banner, a module system's notes) is skipped: the scripts print a marker before their own output.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ClusterSpec, RunRecord } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { q } from './capture.ts';
import { RUNS_ROOT } from './records.ts';

// ---- the clusters you added --------------------------------------------------------------------------------

export function listClusters(db: DB): ClusterSpec[] {
  try {
    return JSON.parse(kvGet(db, 'experiments_clusters') ?? '[]');
  } catch {
    return [];
  }
}

const saveAll = (db: DB, list: ClusterSpec[]) => kvSet(db, 'experiments_clusters', JSON.stringify(list));

export function getCluster(db: DB, id: string): ClusterSpec | null {
  return listClusters(db).find((c) => c.id === id) ?? null;
}

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

/** A cluster from what the form sent, checked; with an id, the one it replaces. */
export function saveCluster(db: DB, b: Record<string, unknown>): ClusterSpec {
  const list = listClusters(db);
  const prev = typeof b.id === 'string' ? list.find((c) => c.id === b.id) : undefined;
  const name = text(b.name ?? prev?.name, 60);
  if (!name) throw new HttpError(400, 'Give the cluster a name');
  const host = text(b.host ?? prev?.host, 200);
  // A host from ~/.ssh/config, host or user@host: nothing ssh could take as an option.
  if (!/^[A-Za-z0-9_.@%:[\]-]{1,200}$/.test(host) || host.startsWith('-')) throw new HttpError(400, 'Give the SSH host, like hpc or me@login.cluster.edu (as you would type after ssh)');
  const kind = (b.kind ?? prev?.kind) === 'ssh' ? 'ssh' : 'slurm';
  const workdir = text(b.workdir ?? prev?.workdir, 300) || '~/hydor-runs';
  if (/[\n'"`$\\]/.test(workdir.replace(/^~/, ''))) throw new HttpError(400, 'The folder there is a plain path, like ~/hydor-runs or /scratch/me/runs');
  const word = (v: unknown, what: string) => {
    const s = text(v, 100);
    if (s && !/^[\w.,:@+-]+$/.test(s)) throw new HttpError(400, `The ${what} is one word, as SLURM writes it`);
    return s || undefined;
  };
  let id = prev?.id;
  if (!id) {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'cluster';
    id = base;
    for (let i = 2; list.some((c) => c.id === id); i++) id = `${base}-${i}`;
  }
  const c: ClusterSpec = {
    id,
    name,
    host,
    kind,
    workdir,
    ...(text(b.setup ?? prev?.setup, 4000) ? { setup: text(b.setup ?? prev?.setup, 4000) } : {}),
    ...(word(b.partition ?? prev?.partition, 'partition') ? { partition: word(b.partition ?? prev?.partition, 'partition') } : {}),
    ...(word(b.account ?? prev?.account, 'account') ? { account: word(b.account ?? prev?.account, 'account') } : {}),
    ...(prev?.checked && prev.host === host ? { checked: prev.checked } : {}),
  };
  saveAll(db, prev ? list.map((x) => (x.id === id ? c : x)) : [...list, c]);
  return c;
}

export function removeCluster(db: DB, id: string) {
  saveAll(
    db,
    listClusters(db).filter((c) => c.id !== id),
  );
}

export function noteCheck(db: DB, id: string, checked: ClusterSpec['checked']) {
  saveAll(
    db,
    listClusters(db).map((c) => (c.id === id ? { ...c, checked } : c)),
  );
}

// ---- ssh ---------------------------------------------------------------------------------------------------

export interface SshResult {
  code: number;
  /** What the script printed after its marker (the login's own output left out). */
  out: string;
  err: string;
}

/** Runs a bash script on a host (with stdin when given); what it printed after the marker. */
export type Ssh = (host: string, script: string, o?: { input?: string; timeoutMs?: number }) => Promise<SshResult>;

export const MARK = '@@hydor@@';

/** Where ssh keeps its shared connections: short paths (sockets have a limit of about 100 bytes). */
function controlDir(): string {
  const d = path.join(RUNS_ROOT, 'ssh');
  return d.length <= 60 ? d : path.join(os.tmpdir(), `hydor-ssh-${process.getuid?.() ?? 0}`);
}

const realSsh: Ssh = (host, script, o = {}) =>
  new Promise((resolve) => {
    const dir = controlDir();
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {}
    const remote = `bash -lc ${q(`printf '%s\\n' '${MARK}'; ${script}`)}`;
    const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', '-o', 'ControlMaster=auto', '-o', `ControlPath=${path.join(dir, '%C')}`, '-o', 'ControlPersist=10m', '--', host, remote];
    let out = '';
    let err = '';
    let p;
    try {
      p = spawn('ssh', args, { stdio: [o.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ code: 255, out: '', err: (e as Error).message });
    }
    const timer = setTimeout(() => p.kill('SIGKILL'), o.timeoutMs ?? 60_000);
    p.stdout!.setEncoding('utf8');
    p.stderr!.setEncoding('utf8');
    p.stdout!.on('data', (d: string) => {
      if (out.length < 8 << 20) out += d;
    });
    p.stderr!.on('data', (d: string) => {
      if (err.length < 64 << 10) err += d;
    });
    if (o.input !== undefined) p.stdin!.end(o.input);
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 255, out: '', err: (e as Error).message });
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      const at = out.indexOf(`${MARK}\n`);
      resolve({ code: code ?? 255, out: at >= 0 ? out.slice(at + MARK.length + 1) : '', err });
    });
  });

let ssh: Ssh = realSsh;

export const runSsh: Ssh = (host, script, o) => ssh(host, script, o);

/** For the tests: a stand-in for ssh. */
export function setSsh(fn: Ssh) {
  ssh = fn;
}

/** Why an SSH call failed, in words. */
export function sshWhy(r: SshResult): string {
  const e = r.err.trim().split('\n').filter(Boolean).pop() ?? '';
  if (/Permission denied|publickey/i.test(e)) return 'SSH refused the sign-in: this computer needs a key there that works without a password (ssh-copy-id), as BatchMode allows no prompts';
  if (/Could not resolve hostname/i.test(e)) return 'That host name is not known (check ~/.ssh/config)';
  if (/timed out|Connection refused|No route to host/i.test(e)) return `Could not reach it: ${e}`;
  if (/Host key verification failed/i.test(e)) return 'Its host key is not known yet: connect once with ssh from a terminal to accept it';
  return e || `ssh ended with exit code ${r.code}`;
}

// ---- a run's folder there ------------------------------------------------------------------------------------

/** The run's folder on the cluster (its absolute path is found with `cd … && pwd`). */
export const remoteDir = (c: ClusterSpec, id: string) => `${(c.workdir || '~/hydor-runs').replace(/\/+$/, '')}/${id}`;

/** A path for a remote script: ~ left for the shell to expand, the rest quoted. */
export const rq = (p: string) => (p === '~' ? '~' : p.startsWith('~/') ? `~/${q(p.slice(2))}` : q(p));

// ---- SLURM -----------------------------------------------------------------------------------------------------

/** A job's name for squeue: the run's name in a word. */
const jobName = (r: Pick<RunRecord, 'id' | 'name'>) =>
  `hydor-${
    (r.name ?? r.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || r.id
  }`;

/**
 * The batch script: the job's needs as #SBATCH lines, its output to the run's log, the cluster's setup lines, the
 * run's variables, then the command in its folder (`cwd` there, else the run's folder), and its exit code written
 * beside the log (for clusters where sacct says nothing).
 */
export function sbatchScript(o: { run: Pick<RunRecord, 'id' | 'name' | 'gpus' | 'cpus' | 'memGb' | 'hours' | 'partition'>; cluster: ClusterSpec; dir: string; cwd?: string; env: Record<string, string> }): string {
  const r = o.run;
  const lines = ['#!/bin/bash', `#SBATCH --job-name=${jobName(r)}`, `#SBATCH --output=${o.dir}/log.txt`, '#SBATCH --open-mode=append'];
  if (r.gpus && r.gpus > 0) lines.push(`#SBATCH --gres=gpu:${Math.round(r.gpus)}`);
  if (r.cpus && r.cpus > 0) lines.push(`#SBATCH --cpus-per-task=${Math.round(r.cpus)}`);
  if (r.memGb && r.memGb > 0) lines.push(`#SBATCH --mem=${Math.ceil(r.memGb)}G`);
  if (r.hours && r.hours > 0) lines.push(`#SBATCH --time=${Math.ceil(r.hours * 60)}`);
  const part = r.partition ?? o.cluster.partition;
  if (part) lines.push(`#SBATCH --partition=${part}`);
  if (o.cluster.account) lines.push(`#SBATCH --account=${o.cluster.account}`);
  lines.push('', `# Hydor's run ${r.id}.`);
  if (o.cluster.setup?.trim()) lines.push(o.cluster.setup.trim());
  lines.push(`cd -- ${o.cwd ? rq(o.cwd) : q(o.dir)} || { echo 1 > ${q(`${o.dir}/exit`)}; exit 1; }`);
  for (const [k, v] of Object.entries(o.env)) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) lines.push(`export ${k}=${q(v)}`);
  lines.push(`bash ${q(`${o.dir}/command.sh`)}`, 'code=$?', `echo $code > ${q(`${o.dir}/exit`)}`, 'exit $code', '');
  return lines.join('\n');
}

/** sbatch --parsable's answer: the job's id ("12345" or "12345;cluster"). */
export function parseSbatch(out: string): string | null {
  const m = /^(\d+)(?:;\S+)?\s*$/m.exec(out.trim());
  return m ? m[1] : null;
}

export interface SlurmState {
  state: string;
  reason?: string;
  elapsed?: string;
  nodes?: string;
  exitCode?: number;
  signal?: number;
}

/** squeue -h -o '%i|%T|%r|%M|%N': each job still in the queue, by id. */
export function parseSqueue(out: string): Map<string, SlurmState> {
  const m = new Map<string, SlurmState>();
  for (const l of out.split('\n')) {
    const f = l.trim().split('|');
    if (f.length < 2 || !/^\d+/.test(f[0])) continue;
    m.set(f[0].replace(/_.*$/, ''), { state: f[1], reason: f[2] && f[2] !== 'None' ? f[2] : undefined, elapsed: f[3], nodes: f[4] || undefined });
  }
  return m;
}

/** sacct -j <id> --format=State,ExitCode,Elapsed -P -n: the job's own line (the first), its state and exit code. */
export function parseSacct(out: string): SlurmState | null {
  const line = out
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  const [state, code, elapsed] = line.split('|');
  const [c, s] = (code ?? '').split(':').map(Number);
  return { state: (state ?? '').split(' ')[0], ...(Number.isFinite(c) ? { exitCode: c } : {}), ...(Number.isFinite(s) && s ? { signal: s } : {}), elapsed };
}

/** What a waiting job's reason in squeue means, in words. */
export function reasonWords(reason?: string): string {
  const r = reason ?? '';
  const known: [RegExp, string][] = [
    [/^Priority$/, 'other jobs come first'],
    [/^Resources$/, 'the cluster waits for the resources it asks for to be free'],
    [/^(QOS|Assoc)?MaxJobsPerUser|MaxJobs/i, 'you have as many jobs running as the cluster allows'],
    [/MaxGRES|MaxTRES|MaxCpu|MaxMem/i, 'you use as much of the cluster as your share allows'],
    [/^ReqNodeNotAvail|NodeDown|PartitionDown|PartitionInactive/i, 'the nodes it needs are not available now'],
    [/^Dependency/, 'it waits for another job'],
    [/^BeginTime/, 'it is set to start later'],
    [/^JobHeld/, 'it is held'],
    [/PartitionTimeLimit/, 'its time is over the partition’s limit: give it fewer hours'],
    [/^Reservation/, 'it waits for a reservation'],
  ];
  const hit = known.find(([re]) => re.test(r));
  return hit ? `${hit[1]} (${r})` : r ? `SLURM says: ${r}` : 'in the cluster’s queue';
}

/** A final SLURM state as a run's status, and why in words. */
export function endOfSlurm(s: SlurmState): { status: 'done' | 'failed' | 'stopped'; why?: string } {
  const st = s.state.toUpperCase();
  if (st === 'COMPLETED' && !s.exitCode) return { status: 'done' };
  if (st.startsWith('CANCELLED')) return { status: 'stopped', why: 'It was cancelled in the cluster’s queue' };
  if (st === 'TIMEOUT') return { status: 'failed', why: 'It ran out of the time it asked for (hours)' };
  if (st === 'OUT_OF_MEMORY') return { status: 'failed', why: 'It ran out of memory (the cluster stopped it): ask for more with memGb' };
  if (st === 'NODE_FAIL') return { status: 'failed', why: 'The node it ran on failed' };
  if (st === 'PREEMPTED') return { status: 'failed', why: 'A job with a higher priority took its place (preempted)' };
  return { status: 'failed', why: `It ended as ${st.toLowerCase()}${s.exitCode ? `, with exit code ${s.exitCode}` : ''}` };
}

/** Whether a SLURM state is one a job ends in. */
export const slurmEnded = (state: string) => !/^(PENDING|RUNNING|CONFIGURING|COMPLETING|SUSPENDED|REQUEUED|RESIZING|SIGNALING|STAGE_OUT)/i.test(state);

// ---- checking one ---------------------------------------------------------------------------------------------

/** Check: ssh host true, then sinfo (SLURM: its partitions) or nvidia-smi and tmux (plain SSH). */
export async function checkCluster(c: Pick<ClusterSpec, 'host' | 'kind'>): Promise<{ ok: boolean; text: string }> {
  const r = await runSsh(c.host, 'true', { timeoutMs: 30_000 });
  if (r.code !== 0) return { ok: false, text: sshWhy(r) };
  if (c.kind === 'slurm') {
    const s = await runSsh(c.host, "command -v sbatch >/dev/null || { echo NO_SBATCH; exit 0; }; sinfo -h -o '%P|%a|%D|%G' 2>&1 | head -n 40", { timeoutMs: 30_000 });
    if (s.out.includes('NO_SBATCH')) return { ok: false, text: 'SSH works, but sbatch is not there: is it a SLURM cluster (or does it need a module loaded in the setup lines)?' };
    const parts = s.out
      .split('\n')
      .map((l) => l.trim().split('|'))
      .filter((f) => f.length >= 3)
      .map((f) => `${f[0]}${f[1] && f[1] !== 'up' ? ` (${f[1]})` : ''}${f[3] && f[3] !== '(null)' ? ` · ${f[3]}` : ''}`);
    return { ok: true, text: parts.length ? `SSH and SLURM work. Partitions: ${[...new Set(parts)].slice(0, 12).join(', ')}` : 'SSH and SLURM work.' };
  }
  const g = await runSsh(c.host, 'command -v tmux >/dev/null && echo TMUX; nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader,nounits 2>/dev/null | head -n 16', { timeoutMs: 30_000 });
  const gpus = g.out
    .split('\n')
    .filter((l) => /^\d+,/.test(l))
    .map((l) => l.split(',')[1]?.trim());
  const tmux = g.out.includes('TMUX');
  return { ok: true, text: `SSH works. ${gpus.length ? `GPUs: ${gpus.length} (${[...new Set(gpus)].join(', ')})` : 'No NVIDIA GPUs found'}; ${tmux ? 'runs go into tmux there' : 'tmux is not there, so runs go in the background (nohup)'}.` };
}

/** A short random suffix, for files written while a run is set up there. */
export const tmpName = () => crypto.randomBytes(3).toString('hex');

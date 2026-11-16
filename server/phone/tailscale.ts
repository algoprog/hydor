// Tailscale on this computer, through its own `tailscale` command: where the command is, whether Tailscale runs and is
// signed in, this machine's name on the tailnet, and Tailscale Serve, which publishes a local port over HTTPS to the
// devices signed in to the same Tailscale account only. Funnel (Serve's public twin) is never used. Settings → App →
// Use on your phone reads and changes this through server/phone/index.ts; server/phone/phone-test.ts checks it
// against a fake `tailscale` command.
//
// Serve's command line changed in Tailscale 1.52 (November 2023): from then on `tailscale serve --bg --https=443
// <target>`, turned off with `tailscale serve --https=443 --set-path=/ off`; from 1.38 to 1.50, `tailscale serve
// https:443 / <target>` (always kept in the background), turned off with `tailscale serve https:443 / off`. When Serve
// or HTTPS certificates are not turned on in the tailnet, the command prints a link to turn them on, then waits or
// stops: the link is what matters, so the command is stopped as soon as it shows one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { TsState, TsStatus } from '../../shared/phone.ts';

export const DOWNLOAD_URL = 'https://tailscale.com/download';
/** Where HTTPS certificates and MagicDNS are turned on, when the command gives no link of its own. */
export const DNS_ADMIN_URL = 'https://login.tailscale.com/admin/dns';
/** The command a Linux user runs once, so Tailscale lets them change Serve without sudo. */
export const OPERATOR_COMMAND = 'sudo tailscale set --operator=$USER';
/** The HTTPS ports Serve is offered on: the usual one, then two others for when it is taken. */
export const SERVE_PORTS = [443, 8443, 10000];

/** Where installers put the command, beyond PATH (the desktop apps' server starts with a short PATH). */
export function usualPlaces(platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'darwin') return ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale'];
  if (platform === 'win32')
    return [env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432, 'C:\\Program Files']
      .filter((d): d is string => !!d)
      .map((d) => path.win32.join(d, 'Tailscale', 'tailscale.exe'));
  return ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/usr/sbin/tailscale', '/snap/bin/tailscale'];
}

const isFile = (f: string) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

/**
 * The `tailscale` command: TAILSCALE_BIN when it is set (and only it), else the first on PATH, else the first of the
 * usual places. Null when there is none.
 */
export function findTailscale(o: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; places?: string[] } = {}): string | null {
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  if (env.TAILSCALE_BIN) return isFile(env.TAILSCALE_BIN) ? env.TAILSCALE_BIN : null;
  const names = platform === 'win32' ? ['tailscale.exe'] : ['tailscale'];
  for (const dir of String(env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean)) for (const n of names) if (isFile(path.join(dir, n))) return path.join(dir, n);
  return (o.places ?? usualPlaces(platform, env)).find(isFile) ?? null;
}

export interface Ran {
  code: number | null;
  out: string;
  /** Stopped because what it printed matched `stopOn`, or ran out of time. */
  stopped: boolean;
  timedOut: boolean;
  /** It could not start at all (the file is not a program, say). */
  failed?: string;
}

/** Runs the command with nothing on its input, and gives back what it printed (output and errors together). */
export function runTailscale(bin: string, args: string[], o: { timeoutMs?: number; stopOn?: RegExp } = {}): Promise<Ran> {
  return new Promise((resolve) => {
    let out = '';
    let stopped = false;
    let timedOut = false;
    let done = false;
    const finish = (r: Ran) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' } });
    } catch (e) {
      return finish({ code: null, out: '', stopped: false, timedOut: false, failed: (e as Error).message });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, o.timeoutMs ?? 10_000);
    const take = (b: Buffer) => {
      // What it prints is small (status is asked without its peers); a cap only against something gone wrong.
      if (out.length < 4_000_000) out += b.toString();
      if (o.stopOn && !stopped && o.stopOn.test(out)) {
        stopped = true;
        // A moment more, so the rest of the line (the whole link) is in.
        setTimeout(() => child.kill(), 150);
      }
    };
    child.stdout?.on('data', take);
    child.stderr?.on('data', take);
    child.on('error', (e) => finish({ code: null, out, stopped, timedOut, failed: e.message }));
    child.on('close', (code) => finish({ code, out, stopped: stopped || timedOut, timedOut }));
  });
}

/** "1.76.6" from `tailscale version`'s first line; [major, minor] or null. */
export function parseVersion(text: string): { version: string; major: number; minor: number } | null {
  const first = String(text ?? '').trim().split(/\r?\n/)[0]?.trim() ?? '';
  const m = /^v?(\d+)\.(\d+)(?:\.\d+)?/.exec(first);
  return m ? { version: first.split(/\s/)[0], major: Number(m[1]), minor: Number(m[2]) } : null;
}

/** Serve's command line: 'new' from 1.52, 'old' from 1.38 to 1.50, 'none' before (no Serve). */
export function serveSyntax(v: { major: number; minor: number } | null): 'new' | 'old' | 'none' {
  if (!v) return 'new';
  if (v.major > 1 || (v.major === 1 && v.minor >= 52)) return 'new';
  if (v.major === 1 && v.minor >= 38) return 'old';
  return 'none';
}

/** The words that publish `target` (http://127.0.0.1:<port>) at HTTPS port `port` of this machine's tailnet name. */
export const serveArgs = (syntax: 'new' | 'old', port: number, target: string): string[] => (syntax === 'old' ? ['serve', `https:${port}`, '/', target] : ['serve', '--bg', `--https=${port}`, target]);
/** The words that undo exactly that: the handler at "/" of that port, and nothing else served. */
export const offArgs = (syntax: 'new' | 'old', port: number): string[] => (syntax === 'old' ? ['serve', `https:${port}`, '/', 'off'] : ['serve', `--https=${port}`, '--set-path=/', 'off']);

export type { TsState, TsStatus };

/** Reads `tailscale status --json` (and how it failed). */
export function parseStatus(ran: Ran): Omit<TsStatus, 'path' | 'version' | 'syntax'> {
  let j: any = null;
  try {
    const t = ran.out.trim();
    j = JSON.parse(t.slice(t.indexOf('{')));
  } catch {}
  if (!j || typeof j !== 'object') {
    if (/logged out|needs ?login|not logged in/i.test(ran.out)) return { state: 'signed-out' };
    if (/stopped|tailscale up/i.test(ran.out) && !/doesn.t appear to be running|failed to connect|connection refused|no such file/i.test(ran.out)) return { state: 'stopped' };
    return { state: 'not-running', detail: ran.failed ?? (ran.out.trim().split(/\r?\n/)[0]?.slice(0, 300) || undefined) };
  }
  const backend = String(j.BackendState ?? '');
  const dnsName = String(j.Self?.DNSName ?? '').replace(/\.$/, '') || undefined;
  const machine = String(j.Self?.HostName ?? '') || (dnsName ? dnsName.split('.')[0] : undefined);
  const tailnet = String(j.CurrentTailnet?.Name ?? '') || undefined;
  const certs: string[] = Array.isArray(j.CertDomains) ? j.CertDomains.map(String) : [];
  const magic = j.CurrentTailnet?.MagicDNSEnabled !== false;
  const base = { dnsName, machine, tailnet, https: !!dnsName && magic && certs.some((c) => c.replace(/\.$/, '') === dnsName), loginUrl: String(j.AuthURL ?? '') || undefined };
  if (backend === 'Running') return dnsName ? { state: 'ready', ...base } : { state: 'not-running', ...base, detail: 'Tailscale gave this computer no name on the tailnet.' };
  if (backend === 'NeedsLogin' || backend === 'NoState') return { state: 'signed-out', ...base };
  if (backend === 'NeedsMachineAuth') return { state: 'needs-approval', ...base };
  if (backend === 'Stopped') return { state: 'stopped', ...base };
  return { state: 'not-running', ...base, detail: backend ? `Tailscale is ${backend.toLowerCase()}.` : undefined };
}

/** One thing Serve publishes on this machine. */
export interface Served {
  port: number;
  /** The path it is mounted at ('/'), or '' for a TCP forwarder. */
  path: string;
  /** Where it goes: http://127.0.0.1:8790, a folder, text… */
  target: string;
  /** Funnel is on for it: anyone on the internet can reach it. */
  funnel: boolean;
  /** Only while the command that made it runs (`tailscale serve` without --bg). */
  foreground: boolean;
}

/** Reads `tailscale serve status --json`: what is published at this machine's name (Services of other names aside). */
export function parseServe(text: string, dnsName: string): Served[] {
  let j: any = null;
  try {
    const t = text.trim();
    j = t ? JSON.parse(t.slice(t.indexOf('{'))) : {};
  } catch {
    return [];
  }
  const out: Served[] = [];
  const one = (c: any, foreground: boolean) => {
    if (!c || typeof c !== 'object') return;
    for (const [hp, web] of Object.entries<any>(c.Web ?? {})) {
      const i = hp.lastIndexOf(':');
      const host = hp.slice(0, i);
      const port = Number(hp.slice(i + 1));
      if (host.replace(/\.$/, '') !== dnsName || !port) continue;
      for (const [p, h] of Object.entries<any>(web?.Handlers ?? {}))
        out.push({ port, path: p, target: String(h?.Proxy ?? h?.Path ?? (h?.Text !== undefined ? 'text' : '')), funnel: !!c.AllowFunnel?.[hp], foreground });
    }
    for (const [p, t] of Object.entries<any>(c.TCP ?? {})) if (t?.TCPForward) out.push({ port: Number(p), path: '', target: String(t.TCPForward), funnel: false, foreground });
  };
  one(j, false);
  for (const c of Object.values<any>(j.Foreground ?? {})) one(c, true);
  return out;
}

/** Whether a Serve target is this app (its port on this computer). */
export function pointsAt(target: string, port: number): boolean {
  const t = target.trim().replace(/\/+$/, '');
  return new RegExp(`^(?:https?://)?(?:127\\.0\\.0\\.1|localhost|\\[::1\\])?:?${port}$`).test(t) || t === String(port);
}

export type ProblemKind = 'enable' | 'operator' | 'port-taken' | 'failed';

/** Why `tailscale serve` did not publish, from what it printed. */
export function serveProblem(text: string, platform = process.platform): { kind: ProblemKind; link?: string } | null {
  const ours = (u: string) => {
    try {
      return new URL(u).hostname.endsWith('.ts.net');
    } catch {
      return true;
    }
  };
  // Every link but the machine's own address (which a successful serve prints): the one to turn Serve or HTTPS on.
  const links = [...text.matchAll(/https:\/\/[^\s"'<>]+/g)].map((m) => m[0].replace(/[.,;)]+$/, '')).filter((u) => !ours(u));
  if (links.length) return { kind: 'enable', link: links.find((u) => /\/f\//.test(u)) ?? links[0] };
  if (/\b(not enabled|is disabled|enable https|https certificates?)\b/i.test(text)) return { kind: 'enable' };
  if (platform !== 'win32' && /access denied|permission denied|--operator|operator|requires root|use 'sudo/i.test(text)) return { kind: 'operator' };
  if (/already (serving|exists|in use)|listener already/i.test(text)) return { kind: 'port-taken' };
  return text.trim() ? { kind: 'failed' } : null;
}

/** The text of what the command printed, short, for a message (no colour codes, one paragraph). */
export const said = (text: string) =>
  text
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 400);

/** Where Tailscale is on this computer and what it says (version, then status). */
export async function tailscaleStatus(o: { bin?: string | null } = {}): Promise<TsStatus> {
  const bin = o.bin === undefined ? findTailscale() : o.bin;
  if (!bin) return { state: 'missing' };
  const v = await runTailscale(bin, ['version'], { timeoutMs: 8000 });
  const ver = parseVersion(v.out);
  if (v.failed && !ver) return { state: 'not-running', path: bin, detail: v.failed };
  const syntax = serveSyntax(ver);
  const head = { path: bin, version: ver?.version, syntax };
  // Without the other devices of the tailnet: only this one's state is needed, and a big tailnet's list is long.
  const st = parseStatus(await runTailscale(bin, ['status', '--json', '--peers=false'], { timeoutMs: 8000 }));
  if (syntax === 'none' && st.state === 'ready') return { ...head, ...st, state: 'too-old' };
  return { ...head, ...st };
}

/** This computer's user name, for the operator command's $USER (shown as the person would type it). */
export const userName = () => {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER ?? '';
  }
};

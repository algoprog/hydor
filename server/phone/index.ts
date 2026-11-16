// Settings → App → Use on your phone: the app reachable from the person's own phone, privately, through Tailscale.
// It says where things stand (Tailscale found, running, signed in; this machine's name on the tailnet), publishes the
// app with Tailscale Serve over HTTPS to the devices signed in to the same Tailscale account only (never Funnel, which
// is public), adds that address to the ones the server accepts requests from (server/origins.ts), and keeps a record
// of what it did, so Stop serving undoes exactly that: the one handler it added, and the address if it added it.
// The password is asked as before. Agents get Serve only through a card each time (server/guide/api.ts).
//
// GET  /api/phone        where things stand
// POST /api/phone/serve  publish it ({ port?: 443 | 8443 | 10000 })
// POST /api/phone/stop   undo it
//
// server/phone/phone-test.ts checks every state against a fake `tailscale` command.
import type { FastifyInstance } from 'fastify';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { addOrigin, originListed, removeOrigin } from '../origins.ts';
import {
  DNS_ADMIN_URL,
  DOWNLOAD_URL,
  findTailscale,
  offArgs,
  OPERATOR_COMMAND,
  parseServe,
  pointsAt,
  runTailscale,
  said,
  serveArgs,
  serveProblem,
  SERVE_PORTS,
  tailscaleStatus,
  userName,
  type Served,
  type TsStatus,
} from './tailscale.ts';
import type { PhoneProblem, PhoneState } from '../../shared/phone.ts';

export type { PhoneProblem, PhoneState };

const KEY = 'phone_serve';

/** What Use on your phone did, so Stop serving can undo exactly that. */
export interface ServeRecord {
  /** The HTTPS port on the tailnet. */
  port: number;
  /** What it points at: this app, http://127.0.0.1:<its port>. */
  target: string;
  /** The address, https://<machine>.<tailnet>.ts.net[:port]. */
  url: string;
  /** Serve's command line it was made with ('new' from Tailscale 1.52, 'old' before). */
  syntax: 'new' | 'old';
  /** The address was added to the ones the server accepts (false: it was accepted already, so it stays). */
  originAdded: boolean;
  /** This page published it (false: it was published already, by hand, and this page took it on). */
  servedHere: boolean;
  at: number;
}

/** A problem as the API answers it: a sentence with the one thing to do (and its link or command in the sentence too, for agents and the command line). */
const problem = (status: number, message: string, p: PhoneProblem) => new HttpError(status, message, { problem: p });

const platformName = (p = process.platform): PhoneState['platform'] => (p === 'darwin' ? 'mac' : p === 'win32' ? 'windows' : 'linux');

export function addressOf(dnsName: string, port: number): string {
  return `https://${dnsName}${port === 443 ? '' : `:${port}`}`;
}

/** Why Tailscale is not ready to serve, in a sentence with what to do. */
export function notReadyText(ts: TsStatus, platform = process.platform): string {
  switch (ts.state) {
    case 'missing':
      return `Tailscale isn’t installed on this computer. Install it from ${DOWNLOAD_URL}, sign in, then check again.`;
    case 'not-running':
      return `Tailscale is installed but not running. Open the Tailscale app${platform === 'linux' ? ' (or start its service: sudo systemctl start tailscaled)' : ''}, then check again.${ts.detail ? ` It said: ${ts.detail}` : ''}`;
    case 'signed-out':
      return `Tailscale isn’t signed in on this computer. Sign in from the Tailscale app${platform === 'linux' ? ', or run tailscale up' : ''}, then check again.`;
    case 'stopped':
      return `Tailscale is turned off on this computer. Turn it on in the Tailscale app${platform === 'linux' ? ', or run tailscale up' : ''}, then check again.`;
    case 'needs-approval':
      return 'This computer waits for an admin of your tailnet to approve it, in Tailscale’s admin console (Machines). Then check again.';
    case 'too-old':
      return `This Tailscale (${ts.version}) is too old for Serve. Update it from ${DOWNLOAD_URL}, then check again.`;
    default:
      return '';
  }
}

export class Phone {
  /** One change at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: DB,
    /** This server's port. */
    private readonly port: number,
    private readonly o: { bin?: () => string | null; platform?: NodeJS.Platform } = {},
  ) {}

  private bin = () => (this.o.bin ? this.o.bin() : findTailscale());
  private get platform() {
    return this.o.platform ?? process.platform;
  }
  private get target() {
    return `http://127.0.0.1:${this.port}`;
  }

  record(): ServeRecord | null {
    try {
      const r = JSON.parse(kvGet(this.db, KEY) ?? 'null');
      return r && typeof r.port === 'number' ? (r as ServeRecord) : null;
    } catch {
      return null;
    }
  }

  private setRecord(r: ServeRecord | null) {
    kvSet(this.db, KEY, JSON.stringify(r));
  }

  /** What Serve publishes at this machine's name now. */
  private async served(bin: string, ts: TsStatus): Promise<Served[]> {
    const r = await runTailscale(bin, ['serve', 'status', '--json'], { timeoutMs: 8000 });
    return ts.dnsName ? parseServe(r.out, ts.dnsName) : [];
  }

  /** The handler that points at this app (kept in the background), if there is one. */
  private ours = (list: Served[], port?: number) => list.find((s) => !s.foreground && (port === undefined || s.port === port) && s.path === '/' && pointsAt(s.target, this.port));

  async state(): Promise<PhoneState> {
    const bin = this.bin();
    const ts = await tailscaleStatus({ bin });
    const rec = this.record();
    const base: PhoneState = {
      tailscale: ts,
      serving: null,
      taken: null,
      accepted: false,
      port: this.port,
      platform: platformName(this.platform),
      operatorCommand: OPERATOR_COMMAND.replace('$USER', userName() || '$USER'),
      download: DOWNLOAD_URL,
    };
    if (!bin || ts.state !== 'ready' || !ts.dnsName) return base;
    const list = await this.served(bin, ts);
    const mine = (rec && this.ours(list, rec.port)) ?? this.ours(list);
    if (mine) {
      const url = addressOf(ts.dnsName, mine.port);
      return { ...base, serving: { url, port: mine.port, servedHere: !!rec?.servedHere && rec.port === mine.port, funnel: mine.funnel, at: rec?.at }, accepted: originListed(url) };
    }
    const other = list.find((s) => s.port === 443);
    if (other) base.taken = { port: 443, target: other.target, free: SERVE_PORTS.find((p) => !list.some((s) => s.port === p)) ?? null };
    return base;
  }

  /** Publishes the app on the tailnet at HTTPS `port` (443 unless that is taken), and accepts its address. */
  serve(port = 443): Promise<PhoneState> {
    const run = this.queue.then(() => this.doServe(port));
    this.queue = run.catch(() => {});
    return run;
  }

  stop(): Promise<PhoneState> {
    const run = this.queue.then(() => this.doStop());
    this.queue = run.catch(() => {});
    return run;
  }

  private async doServe(port: number): Promise<PhoneState> {
    if (!SERVE_PORTS.includes(port)) throw new HttpError(400, `Serve takes port ${SERVE_PORTS.join(', ')}`);
    const bin = this.bin();
    const ts = await tailscaleStatus({ bin });
    if (!bin || ts.state !== 'ready' || !ts.dnsName || !ts.syntax || ts.syntax === 'none') throw problem(409, notReadyText(ts, this.platform), { kind: 'not-ready', link: ts.state === 'missing' || ts.state === 'too-old' ? DOWNLOAD_URL : undefined });
    const syntax = ts.syntax;
    const before = await this.served(bin, ts);
    const already = this.ours(before);
    if (already) {
      // Published already (by hand, or before): taken on as it is, with its address accepted.
      const url = addressOf(ts.dnsName, already.port);
      const rec = this.record();
      const originAdded = addOrigin(url) || (!!rec?.originAdded && rec.url === url);
      this.setRecord({ port: already.port, target: this.target, url, syntax, originAdded, servedHere: rec?.port === already.port ? rec.servedHere : false, at: rec?.at ?? Date.now() });
      return this.state();
    }
    const there = before.filter((s) => s.port === port);
    if (there.length) {
      const free = SERVE_PORTS.find((p) => !before.some((s) => s.port === p)) ?? null;
      throw problem(
        409,
        `Something else is already published at ${addressOf(ts.dnsName, port)} (${there[0].target || 'another service'}), so Hydor won’t replace it.${free ? ` Serve it on port ${free} instead.` : ' Stop that one first (tailscale serve status shows it).'}`,
        { kind: 'port-taken', port: free ?? undefined },
      );
    }
    const ran = await runTailscale(bin, serveArgs(syntax, port, this.target), { timeoutMs: 30_000, stopOn: /https:\/\/\S+\/f\/\S+\s|https:\/\/login\.\S+\s/ });
    const after = await this.served(bin, ts);
    const made = this.ours(after, port);
    if (!made) {
      const p = serveProblem(ran.out, this.platform) ?? { kind: 'failed' as const };
      if (p.kind === 'enable') {
        const link = p.link ?? DNS_ADMIN_URL;
        throw problem(409, `Serve and HTTPS certificates aren’t turned on in your tailnet yet. Turn them on at ${link} (one click, signed in to Tailscale), then press Serve it on my devices again.`, { kind: 'enable', link });
      }
      if (p.kind === 'operator') {
        const command = OPERATOR_COMMAND.replace('$USER', userName() || '$USER');
        throw problem(409, `Tailscale lets only its operator change Serve on Linux. Run this once in a terminal, then try again: ${command}`, { kind: 'operator', command });
      }
      if (p.kind === 'port-taken') throw problem(409, `Something else is already published at ${addressOf(ts.dnsName, port)}. Serve it on another port instead.`, { kind: 'port-taken', port: SERVE_PORTS.find((x) => x !== port && !after.some((s) => s.port === x)) });
      throw problem(502, `Tailscale didn’t publish the app${ran.timedOut ? ' (it took too long)' : ''}.${said(ran.out) ? ` It said: ${said(ran.out)}` : ''}`, { kind: 'failed' });
    }
    const url = addressOf(ts.dnsName, port);
    const originAdded = addOrigin(url);
    this.setRecord({ port, target: this.target, url, syntax, originAdded, servedHere: true, at: Date.now() });
    return this.state();
  }

  private async doStop(): Promise<PhoneState> {
    const rec = this.record();
    const bin = this.bin();
    const ts = await tailscaleStatus({ bin });
    const forget = () => {
      if (rec?.originAdded) removeOrigin(rec.url);
      this.setRecord(null);
    };
    if (!bin || ts.state !== 'ready' || !ts.dnsName) {
      // Tailscale gone from this computer: nothing is served, so only the address is left to take out. Signed out or
      // not running, what Serve keeps comes back with Tailscale, so it is turned off then.
      if (!rec || !bin) {
        forget();
        return this.state();
      }
      throw problem(409, `${notReadyText(ts, this.platform)} Then press Stop serving again: Tailscale has to be running to turn Serve off.`, { kind: 'not-ready' });
    }
    const list = await this.served(bin, ts);
    const mine = (rec && this.ours(list, rec.port)) ?? this.ours(list);
    if (!mine) {
      // Turned off already (by hand, or Tailscale forgot it): only the address is left to take out.
      forget();
      return this.state();
    }
    const syntax = rec?.syntax ?? (ts.syntax === 'old' ? 'old' : 'new');
    const ran = await runTailscale(bin, offArgs(syntax, mine.port), { timeoutMs: 20_000 });
    const still = this.ours(await this.served(bin, ts), mine.port);
    if (still) {
      const p = serveProblem(ran.out, this.platform);
      if (p?.kind === 'operator') {
        const command = OPERATOR_COMMAND.replace('$USER', userName() || '$USER');
        throw problem(409, `Tailscale lets only its operator change Serve on Linux. Run this once in a terminal, then try again: ${command}`, { kind: 'operator', command });
      }
      throw problem(502, `Tailscale didn’t stop serving the app.${said(ran.out) ? ` It said: ${said(ran.out)}` : ''}`, { kind: 'stop-failed' });
    }
    // Without a record this page never added the address, so it stays as it was.
    forget();
    return this.state();
  }
}

export function phoneRoutes(app: FastifyInstance, phone: Phone) {
  app.get('/api/phone', async () => phone.state());
  app.post('/api/phone/serve', async (req) => {
    const p = Number((req.body as { port?: unknown } | undefined)?.port ?? 443);
    return phone.serve(Number.isFinite(p) ? p : 443);
  });
  app.post('/api/phone/stop', async () => phone.stop());
}

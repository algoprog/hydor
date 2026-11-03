// Each browser's traffic goes through a small proxy of the app's own: a session's browser context has
// one, and so does each Chromium process (for what runs outside a session's context, and a named
// profile's sessions, which share one context). The request guard (guard.ts, CDP Fetch) sees pages,
// frames and workers' requests, but not WebSockets, and it looks a name up apart from Chromium, so a
// name that answers differently the second time (DNS rebinding) could slip past it. The proxy checks
// where each connection really goes: it looks the name up itself and connects to the very address it
// checked. Plain http comes as requests; https, wss and ws come as CONNECT tunnels.
import dns from 'node:dns/promises';
import http from 'node:http';
import net from 'node:net';
import { privateIp } from '../web/fetch.ts';
import { onList, type Policy } from './guard.ts';

export interface ProxyOpts {
  /** The rules now: read for every connection, so a changed setting or a newly allowed address counts at once. */
  policy(): Policy;
  /** This app's own port: never reachable on this machine. */
  appPort: number;
  /** A connection was refused (for the agent's next look at the page). */
  refused?(target: string, why: string): void;
}

/** What Chromium needs to send everything through a proxy, loopback addresses included. */
export const proxyArgs = (port: number) => [`--proxy-server=http://127.0.0.1:${port}`, '--proxy-bypass-list=<-loopback>'];
export const contextProxy = (port: number) => ({ proxyServer: `http://127.0.0.1:${port}`, proxyBypassList: '<-loopback>' });

const isLoopbackIp = (ip: string) => /^127\./.test(ip) || ip === '::1' || ip === '0.0.0.0' || ip === '::' || /^::ffff:(127\.|7f)/i.test(ip);
const named = (h: string) => h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local');

async function lookup(host: string): Promise<string[]> {
  if (net.isIP(host)) return [host];
  return (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
}

/** Where a connection to host:port may go (the addresses it was checked at), or why it may not. */
export async function destination(rawHost: string, port: number, p: Policy, appPort: number): Promise<{ ips: string[] } | { why: string }> {
  const host = rawHost.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || !(port > 0 && port < 65536)) return { why: 'not an address' };
  if (onList(host, String(port), p.block)) return { why: `${host} is on the list of blocked sites` };
  const ips = await lookup(host);
  if (!ips.length) return { why: `${host} does not resolve` };
  if (port === appPort && ips.some(isLoopbackIp)) return { why: 'that is Hydor itself' };
  // An address the session allowed (its own dev server), or no limits on private addresses.
  if (p.local.includes(`${host}:${port}`) || !p.blockPrivate) return { ips };
  if (named(host) || ips.some(privateIp)) return { why: `${host} is on this machine or its network` };
  return { ips };
}

/** Connects to the first of the addresses that answers. */
function dial(ips: string[], port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    let i = 0;
    const next = (err?: Error) => {
      if (i >= ips.length) return reject(err ?? new Error('no address'));
      const s = net.connect({ host: ips[i++], port });
      const timer = setTimeout(() => s.destroy(new Error('timed out')), 15_000);
      s.once('connect', () => {
        clearTimeout(timer);
        s.removeAllListeners('error');
        s.on('error', () => s.destroy());
        resolve(s);
      });
      s.once('error', (e) => {
        clearTimeout(timer);
        s.destroy();
        next(e);
      });
    };
    next();
  });
}

/** host:port of a CONNECT request ("example.com:443", "[::1]:8080"). */
export function splitTarget(t: string): { host: string; port: number } | null {
  const m = /^\[([0-9a-f:.]+)\]:(\d{1,5})$/i.exec(t) ?? /^([^:\s/]+):(\d{1,5})$/.exec(t);
  return m ? { host: m[1], port: Number(m[2]) } : null;
}

// Headers that belong to one hop (the browser to the proxy), not to the site.
const HOP = new Set(['connection', 'proxy-connection', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function endToEnd(raw: string[], keepUpgrade = false): string[] {
  const drop = new Set(HOP);
  for (let i = 0; i < raw.length; i += 2) if (raw[i].toLowerCase() === 'connection') for (const t of raw[i + 1].split(',')) drop.add(t.trim().toLowerCase());
  if (keepUpgrade) {
    drop.delete('upgrade');
    drop.delete('connection');
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 2) if (!drop.has(raw[i].toLowerCase())) out.push(raw[i], raw[i + 1]);
  return out;
}

const refuse = (socket: net.Socket, status: string, why: string) => {
  if (!socket.writable) return socket.destroy();
  socket.end(`HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(why)}\r\nConnection: close\r\n\r\n${why}`);
};

export class BrowserProxy {
  private server: http.Server;
  private sockets = new Set<net.Socket>();
  port = 0;

  private constructor(private o: ProxyOpts) {
    this.server = http.createServer((req, res) => void this.request(req, res));
    this.server.on('connect', (req, socket, head) => void this.tunnel(req, socket as net.Socket, head));
    this.server.on('upgrade', (req, socket, head) => void this.upgrade(req, socket as net.Socket, head));
    this.server.on('connection', (s) => this.track(s));
    this.server.on('clientError', (_e, s) => s.destroy());
  }

  /** A proxy on a free port of this machine's loopback address. */
  static async start(o: ProxyOpts): Promise<BrowserProxy> {
    const p = new BrowserProxy(o);
    await new Promise<void>((resolve, reject) => {
      p.server.once('error', reject);
      p.server.listen(0, '127.0.0.1', () => resolve());
    });
    p.port = (p.server.address() as net.AddressInfo).port;
    return p;
  }

  close() {
    this.server.close();
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  private track(s: net.Socket) {
    this.sockets.add(s);
    s.once('close', () => this.sockets.delete(s));
    s.on('error', () => s.destroy());
  }

  private async check(host: string, port: number, shown: string): Promise<string[] | string> {
    let d: { ips: string[] } | { why: string };
    try {
      d = await destination(host, port, this.o.policy(), this.o.appPort);
    } catch (e) {
      d = { why: (e as Error).message };
    }
    if ('ips' in d) return d.ips;
    this.o.refused?.(shown, d.why);
    return d.why;
  }

  /** https, wss and ws: a tunnel to the checked address. */
  private async tunnel(req: http.IncomingMessage, client: net.Socket, head: Buffer) {
    const t = splitTarget(String(req.url ?? ''));
    if (!t) return refuse(client, '400 Bad Request', 'Not a host and port');
    const ips = await this.check(t.host, t.port, `${t.host}:${t.port}`);
    if (typeof ips === 'string') return refuse(client, '403 Forbidden', ips);
    let up: net.Socket;
    try {
      up = await dial(ips, t.port);
    } catch (e) {
      return refuse(client, '502 Bad Gateway', (e as Error).message);
    }
    if (client.destroyed) return up.destroy();
    this.track(up);
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) up.write(head);
    up.pipe(client);
    client.pipe(up);
    client.once('close', () => up.destroy());
    up.once('close', () => client.destroy());
  }

  /** Plain http, as a request to the checked address. */
  private async request(req: http.IncomingMessage, res: http.ServerResponse) {
    let u: URL;
    try {
      u = new URL(String(req.url ?? ''));
      if (u.protocol !== 'http:') throw new Error();
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('This is a proxy');
      return;
    }
    const port = Number(u.port || 80);
    const ips = await this.check(u.hostname, port, u.href.slice(0, 200));
    if (typeof ips === 'string') {
      res.writeHead(403, { 'content-type': 'text/plain' }).end(ips);
      return;
    }
    let up: net.Socket;
    try {
      up = await dial(ips, port);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain' }).end((e as Error).message);
      return;
    }
    this.track(up);
    const out = http.request({ createConnection: () => up, method: req.method, path: `${u.pathname}${u.search}`, headers: endToEnd(req.rawHeaders) as unknown as http.OutgoingHttpHeaders, setHost: false });
    out.on('response', (r) => {
      res.writeHead(r.statusCode ?? 502, r.statusMessage, endToEnd(r.rawHeaders) as unknown as http.OutgoingHttpHeaders);
      r.pipe(res);
    });
    out.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(502, { 'content-type': 'text/plain' }).end('The site closed the connection')));
    res.once('close', () => out.destroy());
    req.pipe(out);
  }

  /** A WebSocket asked of the proxy as a request (Chromium tunnels them, but other clients may not). */
  private async upgrade(req: http.IncomingMessage, client: net.Socket, head: Buffer) {
    let u: URL;
    try {
      u = new URL(String(req.url ?? ''));
      if (u.protocol !== 'http:' && u.protocol !== 'ws:') throw new Error();
    } catch {
      return refuse(client, '400 Bad Request', 'This is a proxy');
    }
    const port = Number(u.port || 80);
    const ips = await this.check(u.hostname, port, u.href.slice(0, 200));
    if (typeof ips === 'string') return refuse(client, '403 Forbidden', ips);
    let up: net.Socket;
    try {
      up = await dial(ips, port);
    } catch (e) {
      return refuse(client, '502 Bad Gateway', (e as Error).message);
    }
    this.track(up);
    const h = endToEnd(req.rawHeaders, true);
    let text = `${req.method} ${u.pathname}${u.search} HTTP/1.1\r\n`;
    for (let i = 0; i < h.length; i += 2) text += `${h[i]}: ${h[i + 1]}\r\n`;
    up.write(`${text}\r\n`);
    if (head.length) up.write(head);
    up.pipe(client);
    client.pipe(up);
    client.once('close', () => up.destroy());
    up.once('close', () => client.destroy());
  }
}

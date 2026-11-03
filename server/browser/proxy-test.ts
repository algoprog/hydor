// Script tests for the browsers' proxy (proxy.ts), without a browser: what it lets through and what it
// refuses, tunnels, plain http with its headers, and WebSockets asked as requests.
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/proxy-test.ts && node dist/dev/proxy-test.js
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import type { Policy } from './guard.ts';
import { BrowserProxy, destination, splitTarget } from './proxy.ts';

let passed = 0;
const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

const listen = (s: http.Server) => new Promise<number>((r) => s.listen(0, '127.0.0.1', () => r((s.address() as net.AddressInfo).port)));
let hits = 0;
const site = http.createServer((req, res) => {
  hits++;
  res.writeHead(200, [['Set-Cookie', 'a=1'], ['Set-Cookie', 'b=2'], ['X-Path', String(req.url)], ['X-Host', String(req.headers.host)], ['X-Proxy-Header', String(req.headers['proxy-connection'] ?? '')]].flat() as unknown as http.OutgoingHttpHeaders);
  res.end('hello');
});
site.on('upgrade', (_req, socket) => {
  hits++;
  socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
});

const policy: Policy = { blockPrivate: true, allow: [], block: ['blocked.example'], local: [] };
const refused: string[] = [];

/** Sends a CONNECT and reads the proxy's status line. */
function connect(proxyPort: number, target: string): Promise<{ status: number; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const s = net.connect(proxyPort, '127.0.0.1', () => s.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`));
    let buf = '';
    s.on('data', function onData(d) {
      buf += d;
      if (!buf.includes('\r\n\r\n')) return;
      s.off('data', onData);
      resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(buf)?.[1] ?? 0), socket: s });
    });
    s.on('error', reject);
  });
}

async function main() {
  const port = await listen(site);
  const proxy = await BrowserProxy.start({ appPort: 65000, policy: () => policy, refused: (t, why) => refused.push(`${t} ${why}`) });

  test('targets: names, IPv4 and IPv6 with their ports', () => {
    assert.deepEqual(splitTarget('example.com:443'), { host: 'example.com', port: 443 });
    assert.deepEqual(splitTarget('[::1]:8080'), { host: '::1', port: 8080 });
    assert.equal(splitTarget('example.com'), null);
    assert.equal(splitTarget('a/b:80'), null);
  });

  test('destination: private addresses and names refused, allowed ones and public ones pass, Hydor itself never', async () => {
    assert.match(String((await destination('127.0.0.1', port, policy, 65000) as any).why), /on this machine/);
    assert.match(String((await destination('localhost', port, policy, 65000) as any).why), /on this machine/);
    assert.match(String((await destination('[::1]', port, policy, 65000) as any).why), /on this machine/);
    assert.match(String((await destination('10.1.2.3', 80, policy, 65000) as any).why), /on this machine/);
    assert.match(String((await destination('blocked.example', 443, policy, 65000) as any).why), /blocked sites/);
    assert.deepEqual(await destination('93.184.215.14', 443, policy, 65000), { ips: ['93.184.215.14'] });
    const allowed = { ...policy, local: [`127.0.0.1:${port}`, 'localhost:65000'] };
    assert.deepEqual(await destination('127.0.0.1', port, allowed, 65000), { ips: ['127.0.0.1'] });
    assert.match(String((await destination('localhost', 65000, allowed, 65000) as any).why), /Hydor itself/);
    assert.match(String((await destination('127.0.0.1', 65000, { ...policy, blockPrivate: false }, 65000) as any).why), /Hydor itself/);
    assert.deepEqual(await destination('10.1.2.3', 80, { ...policy, blockPrivate: false }, 65000), { ips: ['10.1.2.3'] });
  });

  test('a tunnel inward is refused before anything reaches it, and the refusal is told', async () => {
    hits = 0;
    refused.length = 0;
    const { status, socket } = await connect(proxy.port, `127.0.0.1:${port}`);
    socket.destroy();
    assert.equal(status, 403);
    assert.equal(hits, 0);
    assert.match(refused[0], new RegExp(`^127\\.0\\.0\\.1:${port} .*on this machine`));
  });

  test('an allowed tunnel carries the bytes both ways (a WebSocket through CONNECT)', async () => {
    policy.local = [`127.0.0.1:${port}`];
    hits = 0;
    const { status, socket } = await connect(proxy.port, `127.0.0.1:${port}`);
    assert.equal(status, 200);
    const reply = await new Promise<string>((resolve) => {
      let b = '';
      socket.on('data', (d) => (b += d));
      socket.on('close', () => resolve(b));
      socket.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`);
    });
    assert.match(reply, /^HTTP\/1\.1 101/);
    assert.equal(hits, 1);
    policy.local = [];
  });

  test('plain http: forwarded to the checked address, the site’s headers kept, the proxy’s own dropped', async () => {
    policy.local = [`127.0.0.1:${port}`];
    const r = await new Promise<http.IncomingMessage & { body: string }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: proxy.port, path: `http://127.0.0.1:${port}/page?q=1`, headers: { Host: `127.0.0.1:${port}`, 'Proxy-Connection': 'keep-alive' } }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(Object.assign(res, { body })));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body, 'hello');
    assert.deepEqual(r.headers['set-cookie'], ['a=1', 'b=2']);
    assert.equal(r.headers['x-path'], '/page?q=1');
    assert.equal(r.headers['x-host'], `127.0.0.1:${port}`);
    assert.equal(r.headers['x-proxy-header'], '');
    policy.local = [];
  });

  test('plain http inward is refused with the reason', async () => {
    hits = 0;
    const r = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: proxy.port, path: `http://localhost:${port}/`, headers: { Host: `localhost:${port}` } }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(r.status, 403);
    assert.match(r.body, /on this machine/);
    assert.equal(hits, 0);
  });

  test('a WebSocket asked as a request: refused inward, carried when allowed', async () => {
    const ask = () =>
      new Promise<string>((resolve) => {
        const s = net.connect(proxy.port, '127.0.0.1', () => s.write(`GET ws://127.0.0.1:${port}/live HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n`));
        let b = '';
        s.on('data', (d) => (b += d));
        s.on('close', () => resolve(b));
        s.on('error', () => resolve(b));
      });
    hits = 0;
    assert.match(await ask(), /^HTTP\/1\.1 403/);
    assert.equal(hits, 0);
    policy.local = [`127.0.0.1:${port}`];
    assert.match(await ask(), /^HTTP\/1\.1 101/);
    assert.equal(hits, 1);
    policy.local = [];
  });

  test('not a proxy request: turned away', async () => {
    const r = await new Promise<number>((resolve) => http.get({ host: '127.0.0.1', port: proxy.port, path: '/' }, (res) => (res.resume(), resolve(res.statusCode ?? 0))));
    assert.equal(r, 400);
  });

  for (const [name, fn] of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok   ${name}`);
    } catch (e) {
      console.log(`FAIL ${name}\n${(e as Error).stack}`);
      process.exitCode = 1;
    }
  }
  proxy.close();
  site.close();
  console.log(`\n${passed}/${tests.length} passed`);
}

void main();

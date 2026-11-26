// Previews behind Cloudflare: the address a page is given for them, and Hydor's server handing that port to the preview server. Run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/preview-test.ts && DATA_DIR=<scratch> node dist/dev/preview-test.js
import assert from 'node:assert/strict';
import http from 'node:http';
import type net from 'node:net';
import { carryPreviewPort, previewOriginFor } from './preview.ts';

const o = { origin: '', port: 8791, cfPort: 8443 };
const cf = { 'cf-ray': '8f1-AMS', 'cf-visitor': '{"scheme":"https"}', 'x-forwarded-proto': 'https' };

// Through Cloudflare over https: Hydor's own name on the port Cloudflare also carries.
assert.equal(previewOriginFor({ ...cf, host: 'dev.example.com' }, o), 'https://dev.example.com:8443');
assert.equal(previewOriginFor({ 'cf-visitor': '{"scheme":"https"}', host: 'dev.example.com' }, o), 'https://dev.example.com:8443', 'cf-visitor alone says https');
// PREVIEW_ORIGIN wins; not through Cloudflare, plain http, a local or numeric host, or the port turned off: none (the preview port as it is).
assert.equal(previewOriginFor({ ...cf, host: 'dev.example.com' }, { ...o, origin: 'https://preview.example.com' }), 'https://preview.example.com');
assert.equal(previewOriginFor({ host: 'dev.example.com', 'x-forwarded-proto': 'https' }, o), null);
assert.equal(previewOriginFor({ 'cf-ray': 'x', 'cf-visitor': '{"scheme":"http"}', host: 'dev.example.com' }, o), null);
for (const host of ['localhost:8790', '127.0.0.1:8790', 'shop.localhost', '[::1]:8790', '192.168.1.20', '', 'bad host'])
  assert.equal(previewOriginFor({ ...cf, host }, o), null, host);
assert.equal(previewOriginFor({ ...cf, host: 'dev.example.com' }, { ...o, cfPort: 0 }), null);
assert.equal(previewOriginFor({ ...cf, host: 'dev.example.com' }, { ...o, port: 0 }), null, 'previews off');

// The handover: what Cloudflare brings on that port goes to the preview server (requests and sockets); the rest stays Hydor's.
const said: string[] = [];
const listen = (s: http.Server) => new Promise<number>((resolve) => s.listen(0, '127.0.0.1', () => resolve((s.address() as net.AddressInfo).port)));
const hydor = http.createServer((req, res) => res.end(`hydor ${req.url}`));
hydor.on('upgrade', (_req, socket) => (said.push('hydor socket'), socket.destroy()));
const preview = http.createServer((req, res) => res.end(`preview ${req.url}`));
preview.on('upgrade', (_req, socket) => (said.push('preview socket'), socket.destroy()));
carryPreviewPort(hydor, preview, 8443);
const port = await listen(hydor);
const get = (headers: Record<string, string>, p = '/@vite/client') =>
  new Promise<string>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: p, headers, agent: false }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve(b));
      })
      .on('error', reject);
  });
const upgrade = (headers: Record<string, string>) =>
  new Promise<void>((resolve) => {
    const q = http.request({ host: '127.0.0.1', port, path: '/', headers: { ...headers, connection: 'upgrade', upgrade: 'websocket' }, agent: false });
    q.on('error', () => resolve());
    q.on('close', () => resolve());
    q.end();
  });
try {
  assert.equal(await get({ ...cf, host: 'dev.example.com:8443' }), 'preview /@vite/client');
  assert.equal(await get({ ...cf, host: 'dev.example.com' }), 'hydor /@vite/client');
  assert.equal(await get({ host: 'dev.example.com:8443' }), 'hydor /@vite/client', 'not through Cloudflare: Hydor its own');
  await upgrade({ ...cf, host: 'dev.example.com:8443' });
  await upgrade({ ...cf, host: 'dev.example.com' });
  assert.deepEqual(said, ['preview socket', 'hydor socket']);
  // No preview server (previews off) or the port turned off: nothing is handed over.
  const alone = http.createServer((req, res) => res.end(`alone ${req.url}`));
  carryPreviewPort(alone, null, 8443);
  carryPreviewPort(alone, preview, 0);
  const aport = await listen(alone);
  const r = await new Promise<string>((resolve) => http.get({ host: '127.0.0.1', port: aport, path: '/x', headers: { ...cf, host: 'dev.example.com:8443' }, agent: false }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b)); }));
  assert.equal(r, 'alone /x');
  await new Promise<void>((resolve) => alone.close(() => resolve()));
} finally {
  await new Promise<void>((resolve) => hydor.close(() => resolve()));
}
console.log('preview: the address behind Cloudflare and the handover of its port, ok');

// A saved page at its own address (/pg/<token>), for a phone's home screen: a small shell of the app's
// own (its manifest names the page and starts at this address) holding the page in the same sandboxed
// frame as everywhere else. The shell keeps the page's storage through /pg/<token>/storage; the
// signed token in the address is the permission, so it opens without the app's sign-in. The page
// itself never runs here: only in the frame, in an opaque origin.
import crypto from 'node:crypto';
import { STORAGE_LIMITS } from '../../shared/pages.ts';
import { scriptSafe } from './kit.ts';

/** The shell's script (it runs in the browser: only its argument and the browser's globals). */
function shell(cfg: { base: string; max: { key: number; value: number } }) {
  const frame = document.getElementById('page') as HTMLIFrameElement;
  const say = (msg: string) => {
    frame.remove();
    const p = document.createElement('p');
    p.className = 'msg';
    p.textContent = msg;
    document.body.append(p);
  };
  let page: { html: string; title: string } | null = null;
  let n = '';
  let ready = false;
  const show = () => {
    if (!page || !ready || !frame.contentWindow) return;
    ready = false;
    // window.crypto: this module's own `crypto` is Node's.
    n = [...window.crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    frame.contentWindow.postMessage({ type: 'wa-html-page', html: page.html, n, theme: dark ? 'dark' : 'light', max: cfg.max, fill: true }, '*');
  };
  fetch(`${cfg.base}/html`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This link no longer opens a page: it was reset or the page was deleted.' : 'The page could not be loaded.'))))
    .then((p) => {
      page = p;
      show();
    })
    .catch((e) => say(e.message));
  let busy = 0;
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== frame.contentWindow || e.origin !== 'null' || !d || typeof d !== 'object' || Array.isArray(d)) return;
    if (d.type === 'wa-html-ready') {
      ready = true;
      return show();
    }
    if (d.n !== n || d.type !== 'wa-store' || !Number.isInteger(d.id)) return;
    const reply = (m: { value?: unknown; error?: string }) => frame.contentWindow?.postMessage({ type: 'wa-store-reply', id: d.id, ...m }, '*');
    const keyOk = typeof d.key === 'string' && d.key.length > 0 && d.key.length <= cfg.max.key;
    if (!['get', 'set', 'remove', 'keys'].includes(d.op) || (d.op !== 'keys' && !keyOk)) return reply({ error: 'Not a storage call' });
    if (busy >= 16) return reply({ error: 'Too many storage calls at once' });
    const body = JSON.stringify({ op: d.op, key: d.key, value: d.value });
    if (body.length > cfg.max.value + 1024) return reply({ error: 'That value is too big' });
    busy++;
    fetch(`${cfg.base}/storage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        reply(r.ok ? { value: j.value ?? null } : { error: String(j.error ?? 'Storage failed') });
      })
      .catch(() => reply({ error: 'Storage is out of reach (offline?)' }))
      .finally(() => busy--);
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The shell for the page with this token, and the policy that lets only its own script run. */
export function shellPage(token: string, title: string): { html: string; csp: string } {
  const base = `/pg/${token}`;
  const script = `(${scriptSafe(shell.toString())})(${JSON.stringify({ base, max: { key: STORAGE_LIMITS.key, value: STORAGE_LIMITS.value } }).replace(/</g, '\\u003c')})`;
  const hash = crypto.createHash('sha256').update(script).digest('base64');
  const t = esc(title);
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${t}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<meta name="robots" content="noindex, nofollow">
<link rel="manifest" href="${base}/manifest.webmanifest">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3">
<style>html,body{margin:0;height:100%;background:#fff}@media (prefers-color-scheme:dark){html,body{background:#151412;color:#a39b8e}}iframe{position:fixed;inset:0;display:block;width:100%;height:100%;border:0}.msg{max-width:28rem;margin:0 auto;padding:48px 24px;font:15px/1.5 system-ui,sans-serif;color:#675f52;text-align:center}</style>
</head><body>
<iframe id="page" src="/htmlframe" title="${t}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals" allow="fullscreen"></iframe>
<script>${script}</script>
</body></html>`;
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${hash}'`,
    "connect-src 'self'",
    "frame-src 'self'",
    "img-src 'self' data:",
    "style-src 'unsafe-inline'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return { html, csp };
}

/** The web app manifest that makes the page an app of its own on a home screen. */
export function shellManifest(token: string, title: string) {
  const base = `/pg/${token}`;
  return {
    id: base,
    name: title,
    short_name: title.length > 24 ? `${title.slice(0, 23)}…` : title,
    start_url: base,
    scope: base,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

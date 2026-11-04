#!/usr/bin/env node
// The website, hydor.app: copies website/src into dist/website with the latest release's version and summary
// written into the page and the app's tour film beside it, and makes the docs (/docs) from the repository's
// Markdown (website/docs.mjs).
//
//   node website/build.mjs               build dist/website
//   node website/build.mjs --serve 4321  build, then serve it on http://localhost:4321 (Ctrl+C stops)
//   node website/build.mjs --deploy      build, then publish it on Cloudflare Pages (project "hydor", hydor.app);
//                                        needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocs } from './docs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'website/src');
const OUT = path.join(ROOT, 'dist/website');
const TOUR = path.join(ROOT, 'docs/media/hydor-intro.mp4');
const PROJECT = 'hydor';
const args = process.argv.slice(2);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The version people download: GitHub's latest release, else the one in package.json. */
async function latestVersion() {
  try {
    const r = await fetch('https://api.github.com/repos/algoprog/hydor/releases/latest', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'hydor-website-build' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const tag = (await r.json()).tag_name;
      if (tag) return tag.replace(/^v/, '');
    }
  } catch {}
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
}

/** A version's date and the line that sums it up, from its section in CHANGELOG.md, as plain text. */
function notes(version) {
  const md = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const m = md.match(new RegExp(`^## ${version.replace(/\./g, '\\.')} · (.+)\\n\\n([\\s\\S]+?)\\n\\n`, 'm'));
  if (!m) return { date: '', summary: 'See what changed in the latest release.' };
  const summary = m[2]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { date: m[1].trim(), summary };
}

async function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  const version = await latestVersion();
  const { date, summary } = notes(version);
  const index = path.join(OUT, 'index.html');
  const html = fs
    .readFileSync(index, 'utf8')
    .replaceAll('%VERSION%', esc(version))
    .replaceAll('%RELEASE_DATE%', esc(date))
    .replaceAll('%WHATS_NEW%', esc(summary));
  fs.writeFileSync(index, html);
  // Inline scripts run only by their hash (the Content-Security-Policy in _headers).
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  const headers = path.join(OUT, '_headers');
  fs.writeFileSync(headers, fs.readFileSync(headers, 'utf8').replace('%SCRIPT_HASHES%', hashes.join(' ')));
  // The tour film is the app's own (docs/media), not a copy kept here.
  fs.mkdirSync(path.join(OUT, 'media'), { recursive: true });
  fs.copyFileSync(TOUR, path.join(OUT, 'media/hydor-tour.mp4'));
  // The docs, from the Markdown in docs/ and the app's own parser and search; and every page in the sitemap.
  const docs = await buildDocs({ root: ROOT, out: OUT, indexHtml: html });
  const urls = ['/', '/docs/', ...docs].map((u) => `  <url><loc>https://hydor.app${u}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  console.log(`built ${path.relative(ROOT, OUT)} for Hydor ${version}${date ? ` (${date})` : ''}, with ${docs.length} docs pages`);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.json': 'application/json',
};

/** A small static server for looking at the site before it goes out, with byte ranges for the film. */
function serve(port) {
  http
    .createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(OUT, path.normalize(p));
      // As Cloudflare Pages does: /docs/start is docs/start.html, /docs is docs/index.html.
      if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file = `${file}.html`;
      else if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(OUT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': TYPES['.html'] });
        return fs.createReadStream(path.join(OUT, '404.html')).pipe(res);
      }
      const size = fs.statSync(file).size;
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : size - Number(range[2]);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(port, '127.0.0.1', () => console.log(`serving http://localhost:${port}`));
}

function deploy() {
  for (const k of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) if (!process.env[k]) throw new Error(`${k} is not set`);
  // From inside the built folder, so wrangler finds no functions/ or wrangler.toml of the app's.
  const r = spawnSync('npx', ['--yes', 'wrangler@4', 'pages', 'deploy', '.', `--project-name=${PROJECT}`, '--branch=main', '--commit-dirty=true'], {
    cwd: OUT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

await build();
if (args.includes('--deploy')) deploy();
if (args.includes('--serve')) serve(Number(args[args.indexOf('--serve') + 1]) || 4321);

// The website, hydor.app: copies website/src into dist/website with the latest release's version and summary
// written into the page and the app's tour film beside it, makes the docs (/docs) from the repository's Markdown
// (website/docs.mjs), and every page again in each of the app's languages (/de/, /es/, … from website/i18n/*.json,
// by website/i18n.mjs).
//
//   node website/build.mjs               build dist/website
//   node website/build.mjs --serve 4321  build, then serve it on http://localhost:4321 (Ctrl+C stops)
//   node website/build.mjs --extract     write website/i18n/strings.json: every English text the site shows, to translate
//   node website/build.mjs --deploy      build, then publish it on Cloudflare Pages (project "hydor", hydor.app);
//                                        needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleSearch, buildDocs, loadDocs } from './docs.mjs';
import { SITE, TAGS, dataBlock, detectScript, find, formatDate, headLinks, loadDict, localHref, makeTranslator, parseHtml, pathIn, relocate, scanCalls, serializeHtml, switcher, translateTree, wordCount } from './i18n.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'website/src');
const I18N = path.join(ROOT, 'website/i18n');
const DIST = path.join(ROOT, 'dist/website');
let OUT = DIST;
const TOUR = path.join(ROOT, 'docs/media/hydor-intro.mp4');
const PROJECT = 'hydor';
const args = process.argv.slice(2);

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The languages, as the app has them (shared/i18n.ts): English first, the others in the order of its pickers. */
async function loadLangs() {
  const quiet = process.listeners('warning');
  process.removeAllListeners('warning');
  try {
    return (await import(pathToFileURL(path.join(ROOT, 'shared/i18n.ts')).href)).LANGS;
  } finally {
    for (const l of quiet) process.on('warning', l);
  }
}

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

/** One of the site's own pages (index.html, 404.html) in a language: its words translated, its references made
 * root-absolute under a prefix, and what every page says about its languages put in. `shell` is the page before its
 * language menu and its version are written in (the docs take their header and footer from it). */
function sitePage(file, { lang, langs, tr, enPath, alternates, guideSlugs, data }) {
  const doc = parseHtml(fs.readFileSync(path.join(SRC, file), 'utf8'));
  const url = pathIn(lang, enPath ?? '/');
  translateTree(doc, tr, { lang, url });
  if (lang !== 'en') relocate(doc, { prefix: `/${lang}`, localHref: (h) => localHref(h, lang, guideSlugs) });
  const ogUrl = find(doc, (n) => n.tagName === 'meta' && n.attrs.some((a) => a.name === 'property' && a.value === 'og:url'));
  if (ogUrl) ogUrl.attrs.find((a) => a.name === 'content').value = SITE + url;
  const detect = lang === 'en' && alternates ? `<script>${detectScript(langs)}</script>` : '';
  const shell = serializeHtml(doc)
    .replace('<!--HEAD_TOP-->', detect)
    .replace('<!--HEAD_LANG-->', [headLinks({ lang, langs, enPath, alternates }), data].filter(Boolean).join('\n  '));
  const menu = switcher({ lang, langs, enPath, T: tr.T });
  return { shell, html: shell.replace('<!--LANG_SWITCH-->', menu) };
}

/** The texts main.js and the docs' search show, which are in their code and not in a page: a list of them, in order. */
function codeTexts() {
  const main = scanCalls(fs.readFileSync(path.join(SRC, 'main.js'), 'utf8'), 'website/src/main.js');
  const search = scanCalls(fs.readFileSync(path.join(ROOT, 'website/search.ts'), 'utf8'), 'website/search.ts');
  // The docs' pages need only the copy button's and the search box's.
  return { all: [...new Set([...main, ...search])], common: [...new Set(['Copy', 'Copied', ...search])] };
}

async function build({ extract = false } = {}) {
  OUT = extract ? fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-website-extract-')) : DIST;
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  for (const f of ['index.html', '404.html']) fs.rmSync(path.join(OUT, f));
  const version = extract ? JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version : await latestVersion();
  const { date, summary } = notes(version);
  const langs = await loadLangs();
  const docs = await loadDocs(ROOT);
  const texts = codeTexts();
  const record = new Set();
  const entries = new Map(); // English address → whether it has pages in the other languages
  const stats = [];

  for (const { id: lang } of langs) {
    if (extract && lang !== 'en') continue;
    const tr = makeTranslator(loadDict(I18N, lang), lang === 'en' ? record : null);
    const pre = lang === 'en' ? '' : `/${lang}`;
    const ids = langs.map((l) => l.id);
    const forPage = (T) => (keys) => Object.fromEntries(keys.map((k) => [k, T(k)]).filter(([k, v]) => v !== k));
    const dict = forPage(tr.T);
    const data = lang === 'en' ? '' : dataBlock({ lang: TAGS[lang], prefix: pre, t: dict(texts.all) });
    // The version and the release's date are written in after the translation: the summary is the English one.
    const finish = (h) =>
      h
        .replaceAll('%VERSION%', esc(version))
        .replaceAll('%RELEASE_DATE%', esc(formatDate(date, lang)))
        .replaceAll('%WHATS_NEW%', `<span lang="en">${esc(summary)}</span>`);

    const home = sitePage('index.html', { lang, langs, tr, enPath: '/', alternates: ids, guideSlugs: docs.guideSlugs, data });
    fs.mkdirSync(path.join(OUT, pre.slice(1)), { recursive: true });
    fs.writeFileSync(path.join(OUT, pre.slice(1), 'index.html'), finish(home.html));
    entries.set('/', true);
    const lost = sitePage('404.html', { lang, langs, tr, enPath: null, alternates: null, guideSlugs: docs.guideSlugs, data: '' });
    fs.writeFileSync(path.join(OUT, pre.slice(1), '404.html'), lost.html);

    const made = await buildDocs(docs, { out: OUT, lang, langs, tr, shellHtml: finish(home.shell), commonKeys: texts.common });
    if (lang === 'en') for (const k of texts.all) tr.get(k); // the texts in main.js and the search's code come last
    for (const m of made) entries.set(m.path, Boolean(m.alternates));
    stats.push({ lang, tr, pages: made.length + 2 });
  }

  await bundleSearch(ROOT, OUT);

  if (extract) {
    const keys = [...record];
    fs.mkdirSync(I18N, { recursive: true });
    fs.writeFileSync(path.join(I18N, 'strings.json'), JSON.stringify(Object.fromEntries(keys.map((k) => [k, k])), null, 2) + '\n');
    fs.rmSync(OUT, { recursive: true, force: true });
    console.log(`website/i18n/strings.json: ${keys.length} texts, about ${wordCount(keys)} words`);
    return;
  }

  // The tour film is the app's own (docs/media), not a copy kept here.
  fs.mkdirSync(path.join(OUT, 'media'), { recursive: true });
  fs.copyFileSync(TOUR, path.join(OUT, 'media/hydor-tour.mp4'));
  // Every page in the sitemap, with its alternates in the other languages.
  const urls = [...entries]
    .sort(([a], [b]) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)))
    .flatMap(([p, has]) => {
      const ls = has ? langs.map((l) => l.id) : ['en'];
      const alts = has ? [...ls.map((l) => `    <xhtml:link rel="alternate" hreflang="${TAGS[l]}" href="${SITE}${pathIn(l, p)}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${p}"/>`].join('\n') + '\n' : '';
      return ls.map((l) => `  <url>\n    <loc>${SITE}${pathIn(l, p)}</loc>\n${alts}  </url>`);
    })
    .join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
  const n = versionFiles();
  // Inline scripts run only by their hash (the Content-Security-Policy in _headers): every one on every page.
  const hashes = new Set();
  for (const f of fs.readdirSync(OUT, { recursive: true }).filter((f) => f.endsWith('.html')))
    for (const m of fs.readFileSync(path.join(OUT, f), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) hashes.add(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  const headers = path.join(OUT, '_headers');
  fs.writeFileSync(headers, fs.readFileSync(headers, 'utf8').replace('%SCRIPT_HASHES%', [...hashes].join(' ')));
  const pageCount = stats.reduce((a, s) => a + s.pages, 0);
  console.log(`built ${path.relative(ROOT, OUT)} for Hydor ${version}${date ? ` (${date})` : ''}: ${pageCount} pages in ${langs.length} languages, and ${n} pictures and films asked for by their hash`);
  for (const { lang, tr } of stats) {
    if (lang === 'en') continue;
    const done = [...record].filter((k) => tr.has(k) && !tr.refused.has(k)).length;
    console.log(`  ${lang}: ${done} of ${record.size} texts translated${tr.refused.size ? `, ${tr.refused.size} refused (placeholders differ from the English)` : ''}`);
    for (const k of tr.refused) console.log(`    refused: ${k.slice(0, 90)}`);
  }
  // Where strings.json is no longer what the site shows, the translators would work from a stale list.
  const file = path.join(I18N, 'strings.json');
  const listed = fs.existsSync(file) ? Object.keys(JSON.parse(fs.readFileSync(file, 'utf8'))) : [];
  if (listed.length !== record.size || listed.some((k) => !record.has(k))) console.log('  website/i18n/strings.json is out of date: run  node website/build.mjs --extract');
}

/** Every page asks for the pictures and the film with ?v= and a hash of what they hold. Cloudflare and browsers keep
 * /img/ and /media/ for a week (_headers), so a picture taken again under the same name would otherwise go on showing
 * the old one for that long (hydor.app showed the old layout's pictures for days after they were taken again). */
function versionFiles() {
  const hashes = new Map();
  const hashOf = (file) => {
    if (!hashes.has(file)) hashes.set(file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10));
    return hashes.get(file);
  };
  // In an attribute, a string or url(…): img/x.webp beside the page, or /img/x.webp and https://hydor.app/img/x.webp
  // from the site's root; one with a query already is left as it is.
  const ref = /(?<=["'(])(https:\/\/hydor\.app\/|\/)?((?:img|media|docs\/images)\/[\w.-]+\.(?:webp|jpe?g|png|gif|svg|avif|mp4|webm))(?![\w.?-])/g;
  const pages = fs.readdirSync(OUT, { recursive: true }).filter((f) => /\.(html|css|js)$/.test(f));
  for (const page of pages.map((f) => path.join(OUT, f))) {
    const text = fs.readFileSync(page, 'utf8');
    const next = text.replace(ref, (m, root, rel) => {
      const file = root ? path.join(OUT, rel) : path.join(path.dirname(page), rel);
      return fs.existsSync(file) ? `${m}?v=${hashOf(file)}` : m;
    });
    if (next !== text) fs.writeFileSync(page, next);
  }
  return hashes.size;
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
        // As Cloudflare Pages does: the nearest 404.html up the path (/de/nothing shows /de/404.html).
        let dir = path.dirname(file);
        while (dir.startsWith(OUT) && !fs.existsSync(path.join(dir, '404.html'))) dir = path.dirname(dir);
        res.writeHead(404, { 'content-type': TYPES['.html'] });
        return fs.createReadStream(path.join(dir.startsWith(OUT) ? dir : OUT, '404.html')).pipe(res);
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
    cwd: DIST,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

await build({ extract: args.includes('--extract') });
if (args.includes('--extract')) process.exit(0);
if (args.includes('--deploy')) deploy();
if (args.includes('--serve')) serve(Number(args[args.indexOf('--serve') + 1]) || 4321);

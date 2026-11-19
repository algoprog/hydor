#!/usr/bin/env node
// Checks the website's languages (website/i18n.mjs and the pages build.mjs makes of them):
//   node website/i18n-test.mjs            builds the site if dist/website is not there, then checks it
//   node website/i18n-test.mjs --build    builds it first
//
// 1. A translation's placeholders: the words in another order, the elements and attributes put back, a translation
//    with a placeholder missing refused.
// 2. The script that picks a language, run as a function against made-up browsers.
// 3. Every built page, parsed: each reference finds its file (under a prefix too), each page names its language,
//    canonical and alternates (which name it back), has the language menu, and every inline script is allowed by its hash.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { detectScript, makeTranslator, parseHtml, serializeHtml, translateTree } from './i18n.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist/website');
let failures = 0;
const ok = (cond, what) => {
  if (!cond) {
    failures++;
    console.log(`FAIL ${what}`);
  }
};

/* ---------- 1. Placeholders ---------- */
{
  const html = '<p>Read the <a href="/guide" class="g">guide <code>npm test</code></a> now<br>and <b>more</b> <span lang="grc">ὕδωρ</span></p><button aria-label="Close it"><svg></svg>Close</button><img alt="A cat">';
  const keys = new Set();
  translateTree(parseHtml(html), makeTranslator({}, keys), { lang: 'de', url: '/' });
  const [sentence] = [...keys];
  ok(sentence === 'Read the <0>guide <1>npm test</1></0> now<2/>and <3>more</3> <4>ὕδωρ</4>', `the key is ${sentence}`);
  ok(keys.has('Close') && keys.has('Close it') && keys.has('A cat'), 'a button, an aria-label and an alt are texts');
  const dict = {
    [sentence]: '<3>Mehr</3> und <2/> jetzt <0>die <1>kaputte Eingabe</1> Anleitung</0> lesen <4>x</4>',
    Close: 'Schließen',
    'Close it': 'Zu',
  };
  const tr = makeTranslator(dict);
  const doc = parseHtml(html);
  translateTree(doc, tr, { lang: 'de', url: '/' });
  const out = serializeHtml(doc);
  ok(out.includes('<b>Mehr</b> und <br> jetzt <a href="/guide" class="g">die <code>npm test</code> Anleitung</a> lesen <span lang="grc">ὕδωρ</span>'), `reordered, elements kept: ${out}`);
  ok(out.includes('aria-label="Zu"') && out.includes('<svg></svg>Schließen') && out.includes('alt="A cat"'), `attributes and icons: ${out}`);
  ok(out.includes('<html lang="de">'), 'the html element has the language');
  const bad = makeTranslator({ [sentence]: 'Nur Text' });
  const doc2 = parseHtml(html);
  translateTree(doc2, bad, { lang: 'de', url: '/' });
  ok(bad.refused.has(sentence) && serializeHtml(doc2).includes('Read the <a href="/guide"'), 'a translation without the placeholders is refused');
}

/* ---------- 2. Choosing the language ---------- */
{
  const langs = ['en', 'de', 'es', 'fr', 'pt', 'el', 'ja', 'zh'].map((id) => ({ id }));
  const code = detectScript(langs);
  const where = ({ languages, language = languages?.[0], saved, storage = 'ok', url = '/docs/projects?x=1#plans' }) => {
    const [pathname, rest = ''] = url.split('?');
    const [search = '', hash = ''] = rest.split('#');
    let to = null;
    const location = { pathname, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '', replace: (u) => (to = u) };
    const localStorage =
      storage === 'blocked'
        ? { getItem: () => { throw new Error('blocked'); } }
        : { getItem: (k) => (k === 'hydor.lang' ? saved ?? null : null) };
    const navigator = { languages, language };
    vm.runInNewContext(code, { navigator, localStorage, location });
    return to;
  };
  const cases = [
    [{ languages: ['en-US', 'de'] }, null, 'English first: stay'],
    [{ languages: ['de-DE', 'en'] }, '/de/docs/projects?x=1#plans', 'German, with query and hash'],
    [{ languages: ['pt-PT'] }, '/pt/docs/projects?x=1#plans', 'pt-PT is pt'],
    [{ languages: ['zh-TW'] }, '/zh/docs/projects?x=1#plans', 'zh-TW is zh'],
    [{ languages: ['sv', 'fr-CA'] }, '/fr/docs/projects?x=1#plans', 'the first language the site has'],
    [{ languages: ['sv', 'nb'] }, null, 'none of ours: stay'],
    [{ languages: ['EL'] }, '/el/docs/projects?x=1#plans', 'upper case'],
    [{ languages: ['en-GB'], saved: 'ja' }, '/ja/docs/projects?x=1#plans', 'saved wins'],
    [{ languages: ['de'], saved: 'en' }, null, 'saved English: stay'],
    [{ languages: ['de'], saved: 'nonsense' }, '/de/docs/projects?x=1#plans', 'an unknown saved value is ignored'],
    [{ languages: ['es'], storage: 'blocked' }, '/es/docs/projects?x=1#plans', 'storage blocked: still detects'],
    [{ languages: [], language: 'fr' }, '/fr/docs/projects?x=1#plans', 'no languages list: the language'],
    [{ languages: ['de'], url: '/' }, '/de/', 'the home page'],
    [{ languages: undefined, language: undefined }, null, 'no browser information: stay'],
  ];
  for (const [input, expected, what] of cases) {
    let got;
    try {
      got = where(input);
    } catch (e) {
      got = `threw ${e.message}`;
    }
    ok(got === expected, `detect: ${what}: expected ${expected}, got ${got}`);
  }
}

/* ---------- 3. The built site ---------- */
if (process.argv.includes('--build') || !fs.existsSync(path.join(OUT, 'index.html'))) {
  const r = spawnSync('node', [path.join(ROOT, 'website/build.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
{
  const LANG_TAGS = { de: 'de', es: 'es', fr: 'fr', pt: 'pt-BR', el: 'el', ja: 'ja', zh: 'zh-Hans' };
  const SITE = 'https://hydor.app';
  const files = fs.readdirSync(OUT, { recursive: true }).filter((f) => f.endsWith('.html'));
  const exists = (urlPath) => {
    const p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
    const f = path.join(OUT, p);
    if (!f.startsWith(OUT)) return false;
    for (const c of [f, `${f}.html`, path.join(f, 'index.html')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return true;
    return false;
  };
  const walk = (n, fn) => {
    for (const c of n.childNodes ?? []) {
      if (c.tagName) fn(c);
      walk(c, fn);
    }
  };
  const attr = (n, k) => n.attrs?.find((a) => a.name === k)?.value;
  const headers = fs.readFileSync(path.join(OUT, '_headers'), 'utf8');
  const pages = new Map(); // url path → { alternates }
  let refs = 0;
  for (const f of files) {
    const url = '/' + f.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
    const dir = url.split('/')[1];
    const lang = Object.hasOwn(LANG_TAGS, dir) ? dir : 'en';
    const text = fs.readFileSync(path.join(OUT, f), 'utf8');
    const doc = parse(text);
    const alternates = {};
    let canonical = null;
    let hasMenu = false;
    let htmlLang = null;
    walk(doc, (n) => {
      if (n.tagName === 'html') htmlLang = attr(n, 'lang');
      if (n.tagName === 'details' && /\blang\b/.test(attr(n, 'class') ?? '')) hasMenu = true;
      if (n.tagName === 'link' && attr(n, 'rel') === 'canonical') canonical = attr(n, 'href');
      if (n.tagName === 'link' && attr(n, 'rel') === 'alternate' && attr(n, 'hreflang')) alternates[attr(n, 'hreflang')] = attr(n, 'href');
      for (const k of ['href', 'src', 'poster', 'srcset', 'content']) {
        let v = attr(n, k);
        if (v === undefined || v === '') continue;
        if (k === 'content' && !(n.tagName === 'meta' && /^og:(url|image)$/.test(attr(n, 'property') ?? ''))) continue;
        if (k === 'srcset') v = v.split(',')[0].trim().split(' ')[0];
        if (/^(#|mailto:|data:|javascript:)/.test(v)) continue;
        if (v.startsWith(`${SITE}/`)) v = v.slice(SITE.length);
        else if (/^[a-z][a-z0-9+.-]*:/i.test(v)) continue;
        refs++;
        if (!v.startsWith('/')) {
          // Beside the page: fine for the English home page, which is at the root; under a prefix it would not be found.
          ok(path.dirname(f) === '.' && exists(`/${v}`), `${f}: ${n.tagName} ${k}="${v}" is relative: it would not be found from /${dir}/`);
          continue;
        }
        ok(exists(v), `${f}: ${n.tagName} ${k}="${v}" has no file`);
      }
      // inline scripts that run need their hash in the Content-Security-Policy
      if (n.tagName === 'script' && !attr(n, 'src') && !attr(n, 'type')) {
        const hash = `'sha256-${crypto.createHash('sha256').update(n.childNodes[0]?.value ?? '').digest('base64')}'`;
        ok(headers.includes(hash), `${f}: an inline script has no hash in _headers`);
      }
    });
    ok(htmlLang === (LANG_TAGS[lang] ?? 'en'), `${f}: lang is ${htmlLang}`);
    ok(hasMenu, `${f}: no language menu`);
    const is404 = f.endsWith('404.html');
    if (!is404) {
      ok(canonical === `${SITE}${url}`, `${f}: canonical ${canonical}`);
      pages.set(url, alternates);
      const detects = /localStorage\.getItem\('hydor\.lang'\)/.test(text.slice(0, text.indexOf('</head>')));
      const multi = Object.keys(alternates).length > 0;
      ok(detects === (lang === 'en' && multi), `${f}: the language script is ${detects ? 'there' : 'missing'} (english: ${lang === 'en'}, alternates: ${multi})`);
      if (multi) {
        ok(alternates['x-default'] === `${SITE}${lang === 'en' ? url : url.replace(`/${lang}`, '') || '/'}`, `${f}: x-default is ${alternates['x-default']}`);
        ok(Object.keys(alternates).length === 9, `${f}: ${Object.keys(alternates).length} alternates`);
      }
    } else {
      ok(/noindex/.test(text), `${f}: the 404 page is not noindex`);
    }
  }
  // Alternates name each other, and their pages are there.
  for (const [url, alternates] of pages)
    for (const [hreflang, href] of Object.entries(alternates)) {
      const p = href.slice(SITE.length);
      ok(exists(p), `${url}: alternate ${hreflang} ${p} has no file`);
      if (hreflang !== 'x-default') ok(pages.get(p)?.[hreflang] === href || p === url, `${p} does not name itself in ${hreflang}`);
      ok(pages.get(p)?.[LANG_TAGS[url.split('/')[1]] ?? 'en'] === `${SITE}${url}` || Object.keys(pages.get(p) ?? {}).length === 0, `${url}: ${p} does not name it back`);
    }
  const sitemap = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].slice(SITE.length));
  for (const l of locs) ok(exists(l), `sitemap: ${l} has no file`);
  ok(/xmlns:xhtml/.test(sitemap) && /hreflang="zh-Hans"/.test(sitemap), 'sitemap has its alternates');
  for (const d of Object.keys(LANG_TAGS)) ok(locs.includes(`/${d}/`) && locs.includes(`/${d}/docs/`), `sitemap lists /${d}/ and its docs`);
  for (const d of Object.keys(LANG_TAGS)) ok(exists(`/${d}/404`), `/${d}/404.html is there`);
  console.log(`${files.length} pages and ${refs} references checked, ${locs.length} addresses in the sitemap`);
}

console.log(failures ? `${failures} failed` : 'all good');
process.exit(failures ? 1 : 0);

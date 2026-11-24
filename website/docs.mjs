// The docs on hydor.app (/docs), made at build time from the Markdown the app and GitHub show: the guide
// (docs/guide/NN-topic.md, the app's Help), the documents in docs/ the README lists, and CHANGELOG.md. Nothing of
// them is copied into the website: change the Markdown, build the site again, and the pages follow.
//
// What is the app's own is used as it is: its guide parser (shared/guide.ts, so a section's address is the one
// the app gives it), Help's groups, icons and lines on each topic (web/src/features/guide/topics.ts), the
// Markdown renderer it uses (react-markdown with remark-gfm and rehype-raw), and Help's search
// (web/src/features/guide/search.ts), bundled for the browser into docs/search.js with an index of the sections.
//
// The guide is made in every language (/de/docs/…): each topic from docs/guide/<lang>/ where that translation is in
// step with the English one, else the English topic in an element of lang="en"; the docs' own words (navigation,
// headings, buttons) are T('…') texts, translated from website/i18n/<lang>.json (website/i18n.mjs). The other
// documents and the comparisons are made in English only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { TAGS, dataBlock, detectScript, esc, headLinks, makeTranslator, pathIn, switcher } from './i18n.mjs';

const REPO = 'https://github.com/algoprog/hydor';
/** The guide's section of things to ask an agent (web/src/features/guide/search.ts ASK_SECTION). */
const ASK_SECTION = 'ask-an-agent';

/** The documents beside the guide, in the groups the docs show them in; their titles are their own (# …), their
 * lines the README's ("## Documentation"). */
const MORE = [
  { title: 'Install and run', slugs: ['install', 'configuration', 'remote-access', 'machines'] },
  { title: 'Under the hood', slugs: ['features', 'how-it-works', 'how-memory-works', 'memory-internals', 'privacy', 'search-providers', 'development', 'release-notes'] },
];
/** A document whose page address differs from its file's name: the guide's own topic is called "memory", so the document
 * docs/memory.md is the page /docs/how-memory-works. */
const FILE_OF = { 'how-memory-works': 'memory' };
const MORE_ICONS = {
  install: 'Download',
  configuration: 'SlidersHorizontal',
  'remote-access': 'Globe',
  machines: 'Server',
  features: 'ListChecks',
  'how-it-works': 'Workflow',
  'how-memory-works': 'Brain',
  'memory-internals': 'Database',
  privacy: 'ShieldCheck',
  'search-providers': 'Search',
  development: 'Code',
  'release-notes': 'Newspaper',
};

/** A section's text without its figures and comments (HTML in the Markdown), which the search has no use for. */
const stripFigures = (md) => md.replace(/<figure>[\s\S]*?<\/figure>/g, '').replace(/<!--[\s\S]*?-->/g, '');

/** The app's own modules, TypeScript loaded as it is (Node strips the types). */
async function appModules(root) {
  const quiet = process.listeners('warning');
  process.removeAllListeners('warning');
  try {
    const guide = await import(pathToFileURL(path.join(root, 'shared/guide.ts')).href);
    const topics = await import(pathToFileURL(path.join(root, 'web/src/features/guide/topics.ts')).href);
    const lucide = await import('lucide-react');
    return { guide, topics, lucide };
  } finally {
    for (const l of quiet) process.on('warning', l);
  }
}

/** Every page: the guide's topics in Help's order, then the other documents. */
function pages(root, { guide, topics }) {
  const gdir = path.join(root, 'docs/guide');
  const files = fs
    .readdirSync(gdir)
    .filter((f) => /^\d+-[a-z0-9-]+\.md$/.test(f))
    .sort();
  const guidePages = topics.ordered(
    files.map((f) => {
      const md = fs.readFileSync(path.join(gdir, f), 'utf8');
      const t = guide.parseTopic(f, md);
      const look = topics.lookOf(t.id);
      return { slug: t.id, guide: true, file: `docs/guide/${f}`, topic: t, group: topics.GROUPS.find((g) => g.id === look.group).title, blurb: look.blurb, icon: look.icon };
    }),
  );
  // The README's list of documents: their lines.
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const lines = Object.fromEntries([...readme.matchAll(/^- \[[^\]]+\]\(docs\/([a-z0-9-]+)\.md\): (.+)$/gm)].map((m) => [m[1], m[2]]));
  const morePages = MORE.flatMap((g) =>
    g.slugs.map((slug) => {
      const file = slug === 'release-notes' ? 'CHANGELOG.md' : `docs/${FILE_OF[slug] ?? slug}.md`;
      const md = fs.readFileSync(path.join(root, file), 'utf8');
      const t = guide.parseTopic(`${slug}.md`, md);
      const blurb = lines[FILE_OF[slug] ?? slug] ?? (slug === 'release-notes' ? 'What changed in each version' : t.summary.replace(/[*`]/g, '').split(/(?<=[.:])\s/)[0]);
      return { slug, guide: false, file, topic: { ...t, id: slug }, group: g.title, blurb: blurb.charAt(0).toUpperCase() + blurb.slice(1), icon: null, iconName: MORE_ICONS[slug] };
    }),
  );
  return [...guidePages, ...morePages];
}

/** Where a link in a document goes on the site: one of its pages, a place in the app (no page for it), or out. `pre`
 * is the language's prefix ("/de", or "" for English): the guide's pages and the docs' hub are in every language,
 * the other documents only in English. */
function linkFor(href, file, hrefOfFile, pre) {
  if (!href || href.startsWith('#')) return { href };
  if (/^(https?:|mailto:)/.test(href)) return { href, out: true };
  if (href === '/guide' || href === '/guide/') return { href: `${pre}/docs/` };
  const g = /^\/guide\/([a-z0-9-]+)(#.*)?$/.exec(href);
  if (g) return { href: `${pre}/docs/${g[1]}${g[2] ?? ''}` };
  if (href.startsWith('/')) return { app: true };
  // A file of the repository, from the document's folder.
  const [p, hash = ''] = href.split('#');
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), p));
  if (rel === 'README.md') return { href: `${pre}/${hash ? `#${hash}` : ''}` };
  if (rel === 'docs/guide' || rel === 'docs/guide/' || rel === 'docs/guide/README.md') return { href: `${pre}/docs/` };
  const page = hrefOfFile.get(rel);
  if (page) return { href: `${page.guide ? pre : ''}${page.href}${hash ? `#${hash}` : ''}` };
  const isDir = p.endsWith('/') || !path.posix.extname(rel);
  return { href: `${REPO}/${isDir ? 'tree' : 'blob'}/main/${rel.replace(/\/$/, '')}${hash ? `#${hash}` : ''}`, out: true };
}

/** A table of four columns or more (the comparisons) cannot fit a phone: it is marked `stack`, and each body cell gets
 * its column's name (data-label), so a narrow screen shows every row as a card with each cell under its column's name
 * (style.css, `.table-wrap.stack`). Wide screens show the table as it is. */
function stackWide() {
  const text = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(text).join(''));
  const kids = (n, tag) => (n?.children ?? []).filter((c) => c.type === 'element' && c.tagName === tag);
  const walk = (n) => {
    if (n.type === 'element' && n.tagName === 'table') {
      const names = kids(kids(kids(n, 'thead')[0], 'tr')[0], 'th').map((th) => text(th).trim());
      if (names.length >= 4) {
        n.properties = { ...n.properties, className: [...(n.properties?.className ?? []), 'stack'] };
        for (const body of kids(n, 'tbody')) for (const tr of kids(body, 'tr')) kids(tr, 'td').forEach((td, i) => (td.properties = { ...td.properties, dataLabel: names[i] ?? '' }));
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  return (tree) => walk(tree);
}

/** A document's Markdown as the page's HTML: headings with the app's ids, its pictures as figures, links resolved. */
function renderDoc(md, { file, anchors, hrefOfFile, image, pre, T }) {
  let at = 0;
  const heading =
    (level) =>
    ({ node, children, ...rest }) => {
      const id = anchors[at++];
      return h(`h${level}`, { ...rest, id }, children, id ? h('a', { className: 'anchor', href: `#${id}`, 'aria-label': T('Link to this part') }, '#') : null);
    };
  const components = {
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    a: ({ node, href, children, ...rest }) => {
      const to = linkFor(href, file, hrefOfFile, pre);
      if (to.app) return h('span', { className: 'in-app', title: T('A place in the app') }, children);
      return h('a', { ...rest, href: to.href, ...(to.out ? { rel: 'noopener' } : {}) }, children);
    },
    // A picture on its own line: a figure, its words under it.
    p: ({ node, children, ...rest }) => {
      const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length === 1 && kids[0].tagName === 'img') {
        const { src, alt } = kids[0].properties;
        const url = image(src, file);
        if (!url) return null;
        return h('figure', { className: 'doc-figure' }, h('img', { srcSet: `${url} 2x`, src: url, alt: alt ?? '', loading: 'lazy', decoding: 'async' }), alt ? h('figcaption', null, alt) : null);
      }
      return h('p', rest, children);
    },
    // A <picture> with a dark and a light source (GitHub picks by the reader's theme): the site is dark, so its dark one.
    picture: ({ node }) => {
      const sources = node.children.filter((c) => c.tagName === 'source');
      const dark = sources.find((c) => /dark/.test(String(c.properties.media ?? ''))) ?? sources[0];
      const img = node.children.find((c) => c.tagName === 'img');
      const url = image(dark?.properties.srcSet ?? img?.properties.src, file);
      return url ? h('img', { src: url, alt: img?.properties.alt ?? '', loading: 'lazy', decoding: 'async' }) : null;
    },
    // A <figure> written in HTML, with its caption: the same figure as a picture on its own line.
    figure: ({ node, children }) => h('figure', { className: 'doc-figure' }, children),
    img: ({ node, src, alt }) => {
      const url = image(src, file);
      return url ? h('img', { src: url, alt: alt ?? '', loading: 'lazy' }) : null;
    },
    table: ({ node, ...rest }) => h('div', { className: /\bstack\b/.test(rest.className ?? '') ? 'table-wrap stack' : 'table-wrap' }, h('table', rest)),
    pre: ({ node, children, ...rest }) => {
      const lang = /language-([\w-]+)/.exec(node.children?.[0]?.properties?.className?.join(' ') ?? '')?.[1];
      return h(
        'div',
        { className: 'code', 'data-copy-wrap': '' },
        h(
          'div',
          { className: 'code-bar' },
          h('span', null, lang && lang !== 'text' ? lang : T('Code')),
          h('button', { className: 'copy', type: 'button', 'data-copy': '', 'aria-label': T('Copy') }, h('svg', { className: 'ic' }, h('use', { href: '#i-copy' })), h('span', null, T('Copy'))),
        ),
        h('pre', rest, children),
      );
    },
  };
  return renderToStaticMarkup(h(Markdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeRaw, stackWide], components }, md));
}

/** The parts every page shares, taken from the built home page of the language so they are written once: the icons,
 * the header and the footer, their links to the home page's parts made absolute (under the language's prefix). The
 * header's <!--LANG_SWITCH--> is for each page to fill in. */
function shellOf(indexHtml, pre) {
  const pick = (re) => {
    const m = re.exec(indexHtml);
    if (!m) throw new Error(`website/src/index.html: no ${re}`);
    return m[0];
  };
  // Links only (<a>): the icons' <use href="#i-…"> stay as they are.
  const abs = (s) => s.replace(/(<a\b[^>]*?\s)href="#top"/g, `$1href="${pre}/"`).replace(/(<a\b[^>]*?\s)href="#([a-z0-9-]+)"/g, `$1href="${pre}/#$2"`);
  return {
    sprite: pick(/<svg class="sprite"[\s\S]*?<\/svg>/),
    nav: abs(pick(/<header class="nav"[\s\S]*?<\/header>/)),
    footer: abs(pick(/<footer class="footer">[\s\S]*?<\/footer>/)),
    script: pick(/<script>document\.documentElement\.classList\.add\('js'\)<\/script>/),
  };
}

/** What a page says in its head: language, address, the alternates in other languages, the social-card tags. */
function head({ lang, langs, title, description, enPath, alternates, data }) {
  const detect = lang === 'en' && alternates ? `\n  <script>${detectScript(langs)}</script>` : '';
  return `<!doctype html>
<html lang="${TAGS[lang]}">
<head>
  <meta charset="utf-8" />${detect}
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  ${headLinks({ lang, langs, enPath, alternates })}
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Hydor" />
  <meta property="og:url" content="https://hydor.app${pathIn(lang, enPath)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="https://hydor.app/img/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/style.css" />
${data ? `  ${data}\n` : ''}`;
}

const svg = (Icon, size = 20) => (Icon ? renderToStaticMarkup(h(Icon, { size, strokeWidth: 1.8, 'aria-hidden': 'true' })) : '');

/** One page of the docs as the language shows it: the title and the words it carries (a guide topic in the language
 * where there is a translation in step with the English one, else English, marked as such). */
function viewOf(ctx, p, { lang, T }) {
  const { root, mods } = ctx;
  const file = path.basename(p.file);
  const view = { ...p, topic: p.topic, md: null, mdFile: p.file, fallback: false, english: lang !== 'en' && !p.guide, title: p.topic.title, group: T(p.group), blurb: T(p.blurb), href: `${lang === 'en' || !p.guide ? '' : `/${lang}`}/docs/${p.slug}` };
  if (!p.guide) {
    view.title = T(p.topic.title);
    return view;
  }
  if (lang !== 'en') {
    const f = path.join(root, 'docs/guide', lang, file);
    const md = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    const translated = md && mods.guide.translatedTopic(p.topic, file, md);
    if (translated) return { ...view, topic: translated, md, mdFile: `docs/guide/${lang}/${file}`, title: translated.title };
    view.fallback = true;
  }
  return view;
}

/** The list of every page down the side, the open one marked. */
function sideNav(views, current) {
  const groups = [];
  for (const v of views) {
    let g = groups.find((x) => x.title === v.group);
    if (!g) groups.push((g = { title: v.group, items: [] }));
    g.items.push(v);
  }
  return groups
    .map(
      (g) =>
        `<div class="side-group"><p>${esc(g.title)}</p><ul>${g.items
          .map((v) => `<li><a href="${v.href}"${v.slug === current ? ' aria-current="page"' : ''}${v.fallback ? ' lang="en"' : ''}${v.english ? ' hreflang="en"' : ''}>${esc(v.title)}</a></li>`)
          .join('')}</ul></div>`,
    )
    .join('');
}

const searchButton = (cls, T) =>
  `<button class="${cls}" type="button" data-search-open><svg class="ic"><use href="#i-search" /></svg><span>${esc(T('Search the docs'))}</span><kbd>Ctrl K</kbd></button>`;

function page(shell, { lang, langs, T, title, description, enPath, alternates, body, bodyClass, data }) {
  const nav = shell.nav.replace('<!--LANG_SWITCH-->', switcher({ lang, langs, enPath: alternates ? enPath : null, T }));
  return `${head({ lang, langs, title, description, enPath, alternates, data })}  ${shell.script}
  <script src="/main.js" defer></script>
  <script src="/docs/search.js" defer></script>
</head>
<body class="${bodyClass}">
  ${shell.sprite}
  <a class="skip" href="#main">${esc(T('Skip to content'))}</a>
  ${nav}
${body}
  ${shell.footer}
</body>
</html>
`;
}

/** The comparison pages (/compare): docs/compare/README.md is the overview, the other files one page each. They are
 * ordinary Markdown on GitHub, with relative links; here they take the site's own look. */
function comparePages(root, { guide }) {
  const dir = path.join(root, 'docs/compare');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const first = ['README.md', 'hermes-agent.md', 'pi.md', 'atomic-agent.md', 'openclaw.md'];
  files.sort((a, b) => (first.includes(a) ? first.indexOf(a) : first.length) - (first.includes(b) ? first.indexOf(b) : first.length) || a.localeCompare(b));
  return files.map((f) => {
    const md = fs.readFileSync(path.join(dir, f), 'utf8');
    const slug = f === 'README.md' ? '' : f.replace(/\.md$/, '');
    const t = guide.parseTopic(f, md);
    const blurb = t.summary
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*`]/g, '')
      .replace(/\s*Checked 10 November 2026\.?$/, '');
    return { file: `docs/compare/${f}`, href: slug ? `/compare/${slug}` : '/compare/', out: slug ? `compare/${slug}.html` : 'compare/index.html', topic: t, blurb };
  });
}

/** What each comparison page shows beside it: the pages of /compare, the open one marked. */
function compareSide(pages, current) {
  return `<div class="side-group"><p>Compare</p><ul>${pages
    .map((p) => `<li><a href="${p.href}"${p.href === current ? ' aria-current="page"' : ''}>${esc(p.href === '/compare/' ? 'All compared' : p.topic.title.replace(/^Hydor (?:and|vs) /, ''))}</a></li>`)
    .join('')}</ul></div><div class="side-group"><p>More</p><ul><li><a href="/docs/">Docs</a></li><li><a href="/docs/features">Everything Hydor does</a></li></ul></div>`;
}

/** The app's modules, every page of the docs and of /compare, read once for all the languages. */
export async function loadDocs(root) {
  const mods = await appModules(root);
  const all = pages(root, mods);
  for (const p of all) if (!p.icon) p.icon = mods.lucide[p.iconName] ?? mods.lucide.BookOpen;
  const compare = comparePages(root, mods);
  const hrefOfFile = new Map([...all.map((p) => [p.file, { href: `/docs/${p.slug}`, guide: p.guide }]), ...compare.map((p) => [p.file, { href: p.href, guide: false }])]);
  const guideSlugs = new Set(all.filter((p) => p.guide).map((p) => p.slug));
  return { root, mods, all, compare, hrefOfFile, guideSlugs };
}

/** What the search finds: each page's sections in plain words (not the API, as in the app's search box, nor the
 * release notes), for Help's own search. */
export async function bundleSearch(root, out) {
  await esbuild({
    entryPoints: [path.join(root, 'website/search.ts')],
    outfile: path.join(out, 'docs/search.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    alias: { '@shared': path.join(root, 'shared') },
    logLevel: 'warning',
  });
}

/**
 * The docs in one language, in out/<lang>/docs (English: out/docs): a page for each topic of the guide, from the
 * language's translation where there is one in step with the English topic (else the English one, in an element of
 * lang="en"), and the docs' first page, with its own search index. English also has the other documents and the
 * comparisons, which stay English: the other languages' pages link to them. Returns the pages made, as
 * { path (the English address), alternates (every language, or null) }.
 */
export async function buildDocs(ctx, { out, lang, langs, tr, shellHtml, commonKeys = [] }) {
  const { root, mods, all, compare, hrefOfFile } = ctx;
  const { guide, lucide } = mods;
  const { T, TH } = tr;
  const quiet = makeTranslator({}, null);
  const pre = lang === 'en' ? '' : `/${lang}`;
  const shell = shellOf(shellHtml, pre);
  const docsOut = path.join(out, pre.slice(1), 'docs');
  fs.mkdirSync(docsOut, { recursive: true });
  const sharedImages = path.join(out, 'docs/images');
  fs.mkdirSync(sharedImages, { recursive: true });
  const made = [];

  // The guide's pictures, the dark ones (the site is dark), copied as they are used.
  const image = (src, file) => {
    if (!src || /^(https?:|data:)/.test(src)) return null;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), src));
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) return null;
    const name = path.basename(rel);
    fs.copyFileSync(from, path.join(sharedImages, name));
    return `/docs/images/${name}`;
  };

  const views = all.map((p) => viewOf(ctx, p, { lang, T }));
  const alt = (v) => (v.guide ? langs.map((l) => l.id) : null);
  // What main.js and the search read in this language (English has no block: its texts are the ones in the code).
  const data = lang === 'en' ? '' : dataBlock({ lang: TAGS[lang], prefix: pre, t: Object.fromEntries(commonKeys.map((k) => [k, T(k)]).filter(([k, v]) => v !== k)) });

  // A page for each topic of the guide (English: of every document).
  views.forEach((v, i) => {
    if (lang !== 'en' && !v.guide) return;
    const t = v.topic;
    const md = v.md ?? fs.readFileSync(path.join(root, v.file), 'utf8');
    const bodyMd = md.replace(/^\s*# .*\n/, '');
    const html = renderDoc(bodyMd, { file: v.file, anchors: t.anchors, hrefOfFile, image, pre, T });
    const prev = views[i - 1];
    const next = views[i + 1];
    const en = v.fallback ? ' lang="en"' : '';
    const toc = t.sections.length > 1 ? `<nav class="doc-toc" aria-label="${esc(T('On this page'))}"><p>${esc(T('On this page'))}</p><ul${en}>${t.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul></nav>` : '';
    const label = (q, what) => `<span>${esc(what)}</span>${q.fallback ? `<span lang="en">${esc(q.title)}</span>` : esc(q.title)}`;
    const body = `  <div class="docs-shell">
    <aside class="docs-side" aria-label="${esc(T('Every page of the docs'))}">
      ${searchButton('side-search', T)}
      <nav>${sideNav(views, v.slug)}</nav>
    </aside>
    <main id="main" class="docs-main">
      <article class="doc">
        <p class="doc-crumbs"><a href="${pre}/docs/">${esc(T('Docs'))}</a><span>›</span>${esc(v.group)}</p>
        <header class="doc-head"><span class="doc-icon">${svg(v.icon, 22)}</span><h1${en}>${esc(t.title)}</h1></header>
        <div class="doc-body${v.slug === 'release-notes' ? ' notes' : ''}"${en}>
${html}
        </div>
        <nav class="doc-pager" aria-label="${esc(T('Other pages'))}">${prev ? `<a class="prev" href="${prev.href}">${label(prev, T('Previous'))}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.href}">${label(next, T('Next'))}</a>` : ''}</nav>
        <p class="doc-edit">${TH('<0>Change this page on GitHub</0> · the app\'s Help shows the same text', [`<a href="${REPO}/edit/main/${v.mdFile}" rel="noopener">`])}</p>
      </article>
      ${toc}
    </main>
  </div>`;
    fs.writeFileSync(
      path.join(docsOut, `${v.slug}.html`),
      page(shell, { lang, langs, T, title: T('{title} · Hydor docs', { title: v.title }), description: v.blurb || t.summary.slice(0, 160), enPath: `/docs/${v.slug}`, alternates: alt(v), body, bodyClass: 'docs', data }),
    );
    made.push({ path: `/docs/${v.slug}`, alternates: alt(v) });
  });

  // The docs' first page: a search box, and every page as a card, in Help's groups.
  const groups = [];
  for (const v of views) {
    let g = groups.find((x) => x.title === v.group);
    if (!g) groups.push((g = { title: v.group, items: [] }));
    g.items.push(v);
  }
  const home = `  <main id="main" class="docs-home">
    <section class="wrap docs-hero">
      <p class="eyebrow">${esc(T('Docs'))}</p>
      <h1>${esc(T('How can we help?'))}</h1>
      <p>${esc(T('Every part of Hydor, in plain words.'))}</p>
      ${searchButton('big-search', T)}
    </section>
    <div class="wrap">
${groups
  .map(
    (g) => `      <section class="docs-group">
        <h2>${esc(g.title)}</h2>
        <div class="docs-cards">${g.items
          .map((v) => `<a class="docs-card" href="${v.href}"${v.english ? ' hreflang="en"' : ''}><span class="doc-icon">${svg(v.icon, 20)}</span><b${v.fallback ? ' lang="en"' : ''}>${esc(v.title)}</b><span>${esc(v.blurb)}</span></a>`)
          .join('')}</div>
      </section>`,
  )
  .join('\n')}
    </div>
  </main>`;
  fs.writeFileSync(
    path.join(docsOut, 'index.html'),
    page(shell, {
      lang,
      langs,
      T,
      title: T('Hydor docs'),
      description: T('Every part of Hydor, in plain words, with search: the guide the app shows under Help, installation, remote access and more.'),
      enPath: '/docs/',
      alternates: langs.map((l) => l.id),
      body: home,
      bodyClass: 'docs docs-landing',
      data,
    }),
  );
  made.push({ path: '/docs/', alternates: langs.map((l) => l.id) });

  // The comparison pages (English only), in the same look as the docs, with the other pages of /compare down the side.
  if (lang === 'en') {
    const Q = quiet.T;
    fs.mkdirSync(path.join(out, 'compare'), { recursive: true });
    compare.forEach((p, i) => {
      const t = p.topic;
      const md = fs.readFileSync(path.join(root, p.file), 'utf8');
      const html = renderDoc(md.replace(/^\s*# .*\n/, ''), { file: p.file, anchors: t.anchors, hrefOfFile, image, pre, T: Q });
      // A page whose table has four columns or more (the overview, ChatGPT and Claude) gets the whole width; the date is the one the page says.
      const wide = p.href === '/compare/' || /^\|(?:[^|\n]*\|){4,}\s*$/m.test(md);
      const checked = /\bChecked (\d{1,2} [A-Z][a-z]+ \d{4})/.exec(md)?.[1] ?? '10 November 2026';
      const prev = compare[i - 1];
      const next = compare[i + 1];
      const label = (q) => esc(q.href === '/compare/' ? 'All compared' : q.topic.title);
      const toc = t.sections.length > 1 ? `<nav class="doc-toc" aria-label="On this page"><p>On this page</p><ul>${t.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul></nav>` : '';
      const body = `  <div class="docs-shell compare-shell${wide ? ' compare-wide' : ''}">
    <aside class="docs-side" aria-label="The comparisons">
      ${searchButton('side-search', Q)}
      <nav>${compareSide(compare, p.href)}</nav>
    </aside>
    <main id="main" class="docs-main">
      <article class="doc">
        <p class="doc-crumbs"><a href="/compare/">Compare</a>${p.href === '/compare/' ? '' : `<span>›</span>${esc(t.title.replace(/^Hydor (?:and|vs) /, ''))}`}</p>
        <header class="doc-head"><span class="doc-icon">${svg(lucide.Scale ?? lucide.BookOpen, 22)}</span><h1>${esc(t.title)}</h1></header>
        <div class="doc-body">
${html}
        </div>
        <nav class="doc-pager" aria-label="Other comparisons">${prev ? `<a class="prev" href="${prev.href}"><span>Previous</span>${label(prev)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.href}"><span>Next</span>${label(next)}</a>` : ''}</nav>
        <p class="doc-edit"><a href="${REPO}/edit/main/${p.file}" rel="noopener">Change this page on GitHub</a> · checked ${checked}</p>
      </article>
      ${toc}
    </main>
  </div>`;
      fs.writeFileSync(path.join(out, p.out), page(shell, { lang, langs, T: Q, title: `${t.title} · Hydor`, description: p.blurb.slice(0, 200), enPath: p.href, alternates: null, body, bodyClass: 'docs compare' }));
      made.push({ path: p.href, alternates: null });
    });
  }

  // The search's index: this language's sections (the English ones where a topic has no translation yet).
  const index = views
    .filter((v) => (lang === 'en' || v.guide) && !guide.AGENT_TOPICS.includes(v.slug) && v.slug !== 'release-notes')
    .map((v) => ({ id: v.slug, title: v.title, sections: v.topic.sections.filter((s) => s.id !== ASK_SECTION).map((s) => ({ id: s.id, title: s.title, text: guide.plainText(stripFigures(s.text)) })) }));
  fs.writeFileSync(path.join(docsOut, 'search.json'), JSON.stringify(index));
  return made;
}

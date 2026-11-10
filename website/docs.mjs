// The docs on hydor.app (/docs), made at build time from the Markdown the app and GitHub show: the guide
// (docs/guide/NN-topic.md, the app's Help), the documents in docs/ the README lists, and CHANGELOG.md. Nothing of
// them is copied into the website: change the Markdown, build the site again, and the pages follow.
//
// What is the app's own is used as it is: its guide parser (shared/guide.ts, so a section's address is the one
// the app gives it), Help's groups, icons and lines on each topic (web/src/features/guide/topics.ts), the
// Markdown renderer it uses (react-markdown with remark-gfm and rehype-raw), and Help's search
// (web/src/features/guide/search.ts), bundled for the browser into docs/search.js with an index of the sections.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const REPO = 'https://github.com/algoprog/hydor';
/** The guide's section of things to ask an agent (web/src/features/guide/search.ts ASK_SECTION). */
const ASK_SECTION = 'ask-an-agent';

/** The documents beside the guide, in the groups the docs show them in; their titles are their own (# …), their
 * lines the README's ("## Documentation"). */
const MORE = [
  { title: 'Install and run', slugs: ['install', 'configuration', 'remote-access', 'machines'] },
  { title: 'Under the hood', slugs: ['features', 'how-it-works', 'privacy', 'search-providers', 'development', 'release-notes'] },
];
const MORE_ICONS = {
  install: 'Download',
  configuration: 'SlidersHorizontal',
  'remote-access': 'Globe',
  machines: 'Server',
  features: 'ListChecks',
  'how-it-works': 'Workflow',
  privacy: 'ShieldCheck',
  'search-providers': 'Search',
  development: 'Code',
  'release-notes': 'Newspaper',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

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
      return { slug: t.id, file: `docs/guide/${f}`, topic: t, group: topics.GROUPS.find((g) => g.id === look.group).title, blurb: look.blurb, icon: look.icon };
    }),
  );
  // The README's list of documents: their lines.
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const lines = Object.fromEntries([...readme.matchAll(/^- \[[^\]]+\]\(docs\/([a-z0-9-]+)\.md\): (.+)$/gm)].map((m) => [m[1], m[2]]));
  const morePages = MORE.flatMap((g) =>
    g.slugs.map((slug) => {
      const file = slug === 'release-notes' ? 'CHANGELOG.md' : `docs/${slug}.md`;
      const md = fs.readFileSync(path.join(root, file), 'utf8');
      const t = guide.parseTopic(`${slug}.md`, md);
      const blurb = lines[slug] ?? (slug === 'release-notes' ? 'What changed in each version' : t.summary.replace(/[*`]/g, '').split(/(?<=[.:])\s/)[0]);
      return { slug, file, topic: { ...t, id: slug }, group: g.title, blurb: blurb.charAt(0).toUpperCase() + blurb.slice(1), icon: null, iconName: MORE_ICONS[slug] };
    }),
  );
  return [...guidePages, ...morePages];
}

/** Where a link in a document goes on the site: one of its pages, a place in the app (no page for it), or out. */
function linkFor(href, file, hrefOfFile) {
  if (!href || href.startsWith('#')) return { href };
  if (/^(https?:|mailto:)/.test(href)) return { href, out: true };
  if (href === '/guide' || href === '/guide/') return { href: '/docs/' };
  const g = /^\/guide\/([a-z0-9-]+)(#.*)?$/.exec(href);
  if (g) return { href: `/docs/${g[1]}${g[2] ?? ''}` };
  if (href.startsWith('/')) return { app: true };
  // A file of the repository, from the document's folder.
  const [p, hash = ''] = href.split('#');
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), p));
  if (rel === 'README.md') return { href: `/${hash ? `#${hash}` : ''}` };
  if (rel === 'docs/guide' || rel === 'docs/guide/' || rel === 'docs/guide/README.md') return { href: '/docs/' };
  const page = hrefOfFile.get(rel);
  if (page) return { href: `${page}${hash ? `#${hash}` : ''}` };
  const isDir = p.endsWith('/') || !path.posix.extname(rel);
  return { href: `${REPO}/${isDir ? 'tree' : 'blob'}/main/${rel.replace(/\/$/, '')}${hash ? `#${hash}` : ''}`, out: true };
}

/** A document's Markdown as the page's HTML: headings with the app's ids, its pictures as figures, links resolved. */
function renderDoc(md, { file, anchors, hrefOfFile, image }) {
  let at = 0;
  const heading =
    (level) =>
    ({ node, children, ...rest }) => {
      const id = anchors[at++];
      return h(`h${level}`, { ...rest, id }, children, id ? h('a', { className: 'anchor', href: `#${id}`, 'aria-label': 'Link to this part' }, '#') : null);
    };
  const components = {
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    h5: heading(5),
    h6: heading(6),
    a: ({ node, href, children, ...rest }) => {
      const to = linkFor(href, file, hrefOfFile);
      if (to.app) return h('span', { className: 'in-app', title: 'A place in the app' }, children);
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
    img: ({ node, src, alt }) => {
      const url = image(src, file);
      return url ? h('img', { src: url, alt: alt ?? '', loading: 'lazy' }) : null;
    },
    table: ({ node, ...rest }) => h('div', { className: 'table-wrap' }, h('table', rest)),
    pre: ({ node, children, ...rest }) => {
      const lang = /language-([\w-]+)/.exec(node.children?.[0]?.properties?.className?.join(' ') ?? '')?.[1];
      return h(
        'div',
        { className: 'code', 'data-copy-wrap': '' },
        h(
          'div',
          { className: 'code-bar' },
          h('span', null, lang && lang !== 'text' ? lang : 'Code'),
          h('button', { className: 'copy', type: 'button', 'data-copy': '', 'aria-label': 'Copy' }, h('svg', { className: 'ic' }, h('use', { href: '#i-copy' })), h('span', null, 'Copy')),
        ),
        h('pre', rest, children),
      );
    },
  };
  return renderToStaticMarkup(h(Markdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeRaw], components }, md));
}

/** The parts every page shares, taken from the built home page so they are written once: the icons, the header
 * and the footer, their links to the home page's parts made absolute. */
function shellOf(indexHtml) {
  const pick = (re) => {
    const m = re.exec(indexHtml);
    if (!m) throw new Error(`website/src/index.html: no ${re}`);
    return m[0];
  };
  // Links only (<a>): the icons' <use href="#i-…"> stay as they are.
  const abs = (s) => s.replace(/(<a\b[^>]*?\s)href="#top"/g, '$1href="/"').replace(/(<a\b[^>]*?\s)href="#([a-z0-9-]+)"/g, '$1href="/#$2"');
  return {
    sprite: pick(/<svg class="sprite"[\s\S]*?<\/svg>/),
    nav: abs(pick(/<header class="nav"[\s\S]*?<\/header>/)),
    footer: abs(pick(/<footer class="footer">[\s\S]*?<\/footer>/)),
    script: pick(/<script>document\.documentElement\.classList\.add\('js'\)<\/script>/),
  };
}

function head({ title, description, url }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="https://hydor.app${url}" />
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Hydor" />
  <meta property="og:url" content="https://hydor.app${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="https://hydor.app/img/og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/style.css" />
`;
}

const svg = (Icon, size = 20) => (Icon ? renderToStaticMarkup(h(Icon, { size, strokeWidth: 1.8, 'aria-hidden': 'true' })) : '');

/** The list of every page down the side, the open one marked. */
function sideNav(all, current) {
  const groups = [];
  for (const p of all) {
    let g = groups.find((x) => x.title === p.group);
    if (!g) groups.push((g = { title: p.group, items: [] }));
    g.items.push(p);
  }
  return groups
    .map(
      (g) =>
        `<div class="side-group"><p>${esc(g.title)}</p><ul>${g.items
          .map((p) => `<li><a href="/docs/${p.slug}"${p.slug === current ? ' aria-current="page"' : ''}>${esc(p.topic.title)}</a></li>`)
          .join('')}</ul></div>`,
    )
    .join('');
}

const searchButton = (cls) =>
  `<button class="${cls}" type="button" data-search-open><svg class="ic"><use href="#i-search" /></svg><span>Search the docs</span><kbd>Ctrl K</kbd></button>`;

function page(shell, { title, description, url, body, bodyClass }) {
  return `${head({ title, description, url })}  ${shell.script}
  <script src="/main.js" defer></script>
  <script src="/docs/search.js" defer></script>
</head>
<body class="${bodyClass}">
  ${shell.sprite}
  <a class="skip" href="#main">Skip to content</a>
  ${shell.nav}
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
    .map((p) => `<li><a href="${p.href}"${p.href === current ? ' aria-current="page"' : ''}>${esc(p.href === '/compare/' ? 'All compared' : p.topic.title.replace(/^Hydor and /, ''))}</a></li>`)
    .join('')}</ul></div><div class="side-group"><p>More</p><ul><li><a href="/docs/">Docs</a></li><li><a href="/docs/features">Everything Hydor does</a></li></ul></div>`;
}

export async function buildDocs({ root, out, indexHtml }) {
  const mods = await appModules(root);
  const { guide, lucide } = mods;
  const all = pages(root, mods);
  for (const p of all) if (!p.icon) p.icon = lucide[p.iconName] ?? lucide.BookOpen;
  const compare = comparePages(root, mods);
  const hrefOfFile = new Map([...all.map((p) => [p.file, `/docs/${p.slug}`]), ...compare.map((p) => [p.file, p.href])]);
  const shell = shellOf(indexHtml);
  const docsOut = path.join(out, 'docs');
  fs.mkdirSync(path.join(docsOut, 'images'), { recursive: true });

  // The guide's pictures, the dark ones (the site is dark), copied as they are used.
  const image = (src, file) => {
    if (!src || /^(https?:|data:)/.test(src)) return null;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), src));
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) return null;
    const name = path.basename(rel);
    fs.copyFileSync(from, path.join(docsOut, 'images', name));
    return `/docs/images/${name}`;
  };

  // A page for each document.
  all.forEach((p, i) => {
    const t = p.topic;
    const md = fs.readFileSync(path.join(root, p.file), 'utf8');
    const bodyMd = md.replace(/^\s*# .*\n/, '');
    const html = renderDoc(bodyMd, { file: p.file, anchors: t.anchors, hrefOfFile, image });
    const prev = all[i - 1];
    const next = all[i + 1];
    const toc = t.sections.length > 1 ? `<nav class="doc-toc" aria-label="On this page"><p>On this page</p><ul>${t.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul></nav>` : '';
    const body = `  <div class="docs-shell">
    <aside class="docs-side" aria-label="Every page of the docs">
      ${searchButton('side-search')}
      <nav>${sideNav(all, p.slug)}</nav>
    </aside>
    <main id="main" class="docs-main">
      <article class="doc">
        <p class="doc-crumbs"><a href="/docs/">Docs</a><span>›</span>${esc(p.group)}</p>
        <header class="doc-head"><span class="doc-icon">${svg(p.icon, 22)}</span><h1>${esc(t.title)}</h1></header>
        <div class="doc-body${p.slug === 'release-notes' ? ' notes' : ''}">
${html}
        </div>
        <nav class="doc-pager" aria-label="Other pages">${prev ? `<a class="prev" href="/docs/${prev.slug}"><span>Previous</span>${esc(prev.topic.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="/docs/${next.slug}"><span>Next</span>${esc(next.topic.title)}</a>` : ''}</nav>
        <p class="doc-edit"><a href="${REPO}/edit/main/${p.file}" rel="noopener">Change this page on GitHub</a> · the app's Help shows the same text</p>
      </article>
      ${toc}
    </main>
  </div>`;
    fs.writeFileSync(
      path.join(docsOut, `${p.slug}.html`),
      page(shell, { title: `${t.title} · Hydor docs`, description: p.blurb || t.summary.slice(0, 160), url: `/docs/${p.slug}`, body, bodyClass: 'docs' }),
    );
  });

  // The docs' first page: a search box, and every page as a card, in Help's groups.
  const groups = [];
  for (const p of all) {
    let g = groups.find((x) => x.title === p.group);
    if (!g) groups.push((g = { title: p.group, items: [] }));
    g.items.push(p);
  }
  const home = `  <main id="main" class="docs-home">
    <section class="wrap docs-hero">
      <p class="eyebrow">Docs</p>
      <h1>How can we help?</h1>
      <p>Every part of Hydor, in plain words: the same guide the app shows under Help.</p>
      ${searchButton('big-search')}
    </section>
    <div class="wrap">
${groups
  .map(
    (g) => `      <section class="docs-group">
        <h2>${esc(g.title)}</h2>
        <div class="docs-cards">${g.items
          .map((p) => `<a class="docs-card" href="/docs/${p.slug}"><span class="doc-icon">${svg(p.icon, 20)}</span><b>${esc(p.topic.title)}</b><span>${esc(p.blurb)}</span></a>`)
          .join('')}</div>
      </section>`,
  )
  .join('\n')}
    </div>
  </main>`;
  fs.writeFileSync(
    path.join(docsOut, 'index.html'),
    page(shell, { title: 'Hydor docs', description: 'Every part of Hydor, in plain words, with search: the guide the app shows under Help, installation, remote access and more.', url: '/docs/', body: home, bodyClass: 'docs docs-landing' }),
  );

  // The comparison pages, in the same look as the docs, with the other pages of /compare down the side.
  fs.mkdirSync(path.join(out, 'compare'), { recursive: true });
  compare.forEach((p, i) => {
    const t = p.topic;
    const md = fs.readFileSync(path.join(root, p.file), 'utf8');
    const html = renderDoc(md.replace(/^\s*# .*\n/, ''), { file: p.file, anchors: t.anchors, hrefOfFile, image });
    const prev = compare[i - 1];
    const next = compare[i + 1];
    const label = (q) => esc(q.href === '/compare/' ? 'All compared' : q.topic.title);
    const toc = t.sections.length > 1 ? `<nav class="doc-toc" aria-label="On this page"><p>On this page</p><ul>${t.sections.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul></nav>` : '';
    const body = `  <div class="docs-shell compare-shell${p.href === '/compare/' ? ' compare-wide' : ''}">
    <aside class="docs-side" aria-label="The comparisons">
      ${searchButton('side-search')}
      <nav>${compareSide(compare, p.href)}</nav>
    </aside>
    <main id="main" class="docs-main">
      <article class="doc">
        <p class="doc-crumbs"><a href="/compare/">Compare</a>${p.href === '/compare/' ? '' : `<span>›</span>${esc(t.title.replace(/^Hydor and /, ''))}`}</p>
        <header class="doc-head"><span class="doc-icon">${svg(lucide.Scale ?? lucide.BookOpen, 22)}</span><h1>${esc(t.title)}</h1></header>
        <div class="doc-body">
${html}
        </div>
        <nav class="doc-pager" aria-label="Other comparisons">${prev ? `<a class="prev" href="${prev.href}"><span>Previous</span>${label(prev)}</a>` : '<span></span>'}${next ? `<a class="next" href="${next.href}"><span>Next</span>${label(next)}</a>` : ''}</nav>
        <p class="doc-edit"><a href="${REPO}/edit/main/${p.file}" rel="noopener">Change this page on GitHub</a> · checked 10 November 2026</p>
      </article>
      ${toc}
    </main>
  </div>`;
    fs.writeFileSync(path.join(out, p.out), page(shell, { title: `${t.title} · Hydor`, description: p.blurb.slice(0, 200), url: p.href, body, bodyClass: 'docs compare' }));
  });

  // What the search finds: each page's sections in plain words (not the API, as in the app's search box, nor the
  // release notes), for Help's own search.
  const index = all
    .filter((p) => !guide.AGENT_TOPICS.includes(p.slug) && p.slug !== 'release-notes')
    .map((p) => ({ id: p.slug, title: p.topic.title, sections: p.topic.sections.filter((s) => s.id !== ASK_SECTION).map((s) => ({ id: s.id, title: s.title, text: guide.plainText(s.text) })) }));
  fs.writeFileSync(path.join(docsOut, 'search.json'), JSON.stringify(index));
  await esbuild({
    entryPoints: [path.join(root, 'website/search.ts')],
    outfile: path.join(docsOut, 'search.js'),
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    alias: { '@shared': path.join(root, 'shared') },
    logLevel: 'warning',
  });
  return [...all.map((p) => `/docs/${p.slug}`), ...compare.map((p) => p.href)];
}

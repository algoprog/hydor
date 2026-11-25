// The blog on hydor.app (/blog), made at build time from website/blog/posts/*.md, English only (like /compare):
//
//   /blog/            the blog's first page: the newest post as a wide card, the others in a grid
//   /blog/<slug>      a post
//   /blog/feed.xml    the Atom feed
//
// A post is a Markdown file with front matter (README.md, "Blog"): it is rendered with the same Markdown renderer as the
// docs (react-markdown with remark-gfm and rehype-raw) inside the shell of the home page (header, footer, icons:
// docs.mjs shellOf). A post's figures are HTML fragments in website/blog/figures/<slug>/<name>.html, put in where the
// Markdown has `<!-- figure: <name> -->` on a line of its own, verbatim: they never go through Markdown or React. Their
// styles and scripts (website/src/blog/<slug>.css and .js) and the shared ones (blog.css, blog.js) are linked from the
// page. Posts whose file name starts with `_` are drafts, built only with --drafts.
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { codeBlock, shellOf } from './docs.mjs';
import { SITE, esc, headLinks, makeTranslator, switcher } from './i18n.mjs';

const REPO = 'https://github.com/algoprog/hydor';
const BLOG_LINE = 'How Hydor works, why it is built the way it is, and what is new.';
const TITLE = 'Notes from Hydor';
const DEFAULT_OG = { path: '/img/og.jpg', width: 1200, height: 630 };
const RESERVED = new Set(['blog', 'feed', 'index']);

/* ---------- Posts ---------- */

/** "---\nkey: value\n…\n---\nbody" as { meta, body }. */
function frontMatter(text, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.replace(/^﻿/, ''));
  if (!m) throw new Error(`${file}: the post must start with front matter between two lines of ---`);
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`${file}: front matter line without a key: "${line}"`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

/** The posts in website/blog/posts, parsed, newest first (ties by `order`, lower first). */
function readPosts(root, { drafts, only }) {
  const dir = path.join(root, 'website/blog/posts');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  const slugs = files.map((f) => f.replace(/\.md$/, ''));
  if (only) for (const s of only) if (!slugs.includes(s)) throw new Error(`--posts ${s}: no website/blog/posts/${s}.md (there are: ${slugs.join(', ') || 'none'})`);
  const posts = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, '');
    const file = `website/blog/posts/${f}`;
    const draft = slug.startsWith('_');
    if (draft && !drafts) {
      if (only?.includes(slug)) throw new Error(`${file} is a draft: build it with --drafts`);
      continue;
    }
    if (only && !only.includes(slug)) continue;
    if (!/^_?[a-z0-9][a-z0-9-]*$/.test(slug) || RESERVED.has(slug)) throw new Error(`${file}: "${slug}" is not a usable address (lower case letters, digits and hyphens; not ${[...RESERVED].join(', ')})`);
    const { meta, body } = frontMatter(fs.readFileSync(path.join(dir, f), 'utf8'), file);
    for (const k of ['title', 'description', 'date', 'tags', 'cover', 'coverAlt']) if (!meta[k]) throw new Error(`${file}: front matter has no ${k}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || Number.isNaN(Date.parse(`${meta.date}T00:00:00Z`))) throw new Error(`${file}: date "${meta.date}" is not YYYY-MM-DD`);
    if (!meta.cover.startsWith('/')) throw new Error(`${file}: cover must be an address from the site's root (/img/blog/${slug}/cover.webp)`);
    if (meta.og && !meta.og.startsWith('/')) throw new Error(`${file}: og must be an address from the site's root`);
    if (/^# /m.test(stripCode(body))) throw new Error(`${file}: do not write an # title: the page has it from the front matter`);
    posts.push({
      slug,
      file,
      draft,
      title: meta.title,
      description: meta.description,
      date: meta.date,
      tags: meta.tags.split(',').map((t) => t.trim()).filter(Boolean),
      cover: meta.cover,
      coverAlt: meta.coverAlt,
      og: meta.og || null,
      order: meta.order === undefined ? 100 : Number(meta.order),
      body,
      href: `/blog/${slug}`,
    });
  }
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.order - b.order || a.slug.localeCompare(b.slug));
  return posts;
}

/** Markdown without its fenced code blocks (for finding lines that are not code). */
function stripCode(md) {
  return md.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
}

/** "24 November 2026", the way the site writes dates. */
const dateText = (iso) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** The words a reader reads: the Markdown without figures, HTML tags, pictures and code, over 230 a minute, at least 1. */
function readingMinutes(md) {
  const text = stripCode(md)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`\n]*`/g, ' ');
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.ceil(words / 230));
}

/* ---------- Pictures: their size, read from the file ---------- */

/** { width, height } of a WebP, PNG, JPEG or SVG file. */
export function imageSize(file) {
  const b = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const fail = () => {
    throw new Error(`${file}: cannot read the size of this ${ext} picture`);
  };
  if (b.length > 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const kind = b.toString('latin1', 12, 16);
    if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    fail();
  }
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) i += marker === 0xff ? 1 : 2;
      else i += 2 + b.readUInt16BE(i + 2);
    }
    fail();
  }
  const text = b.toString('utf8', 0, Math.min(b.length, 4096));
  if (/<svg[\s>]/.test(text)) {
    const tag = /<svg\b[^>]*>/.exec(text)?.[0] ?? '';
    const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(tag);
    if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
    const w = /\swidth\s*=\s*["']([\d.]+)(?:px)?["']/.exec(tag);
    const hh = /\sheight\s*=\s*["']([\d.]+)(?:px)?["']/.exec(tag);
    if (w && hh) return { width: Math.round(Number(w[1])), height: Math.round(Number(hh[1])) };
  }
  return fail();
}

/** A post's picture by its address on the site: its file in website/src and its size. */
function pictureOf(root, src, where) {
  const clean = src.split(/[?#]/)[0];
  if (!clean.startsWith('/')) throw new Error(`${where}: the picture "${src}" must be an address from the site's root (/img/…): the site allows no outside pictures`);
  const file = path.join(root, 'website/src', clean);
  if (!fs.existsSync(file)) throw new Error(`${where}: the picture ${clean} is not in website/src${clean}`);
  return { src: clean, ...imageSize(file) };
}

/* ---------- Markdown ---------- */

/** A heading's text as an address: lower case, letters, digits and hyphens kept, spaces to hyphens, the rest dropped. */
function slugOf(text, taken) {
  let id = text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!id) id = 'section';
  let n = 1;
  let out = id;
  while (taken.has(out)) out = `${id}-${++n}`;
  taken.add(out);
  return out;
}

const textOf = (n) => (n.type === 'text' ? n.value : (n.children ?? []).map(textOf).join(''));

/** Turns each `<!-- figure: name -->` line (outside code blocks) into a placeholder paragraph; returns the Markdown
 * and the names, in order. */
function takeFigures(md) {
  const names = [];
  let fence = null;
  const lines = md.split('\n').map((line) => {
    const f = /^\s*(```|~~~)/.exec(line);
    if (f) fence = fence ? (fence === f[1] ? null : fence) : f[1];
    if (fence || f) return line;
    const m = /^<!--\s*figure:\s*([\w-]+)\s*-->\s*$/.exec(line);
    if (!m) return line;
    names.push(m[1]);
    return `HYDORFIGURE${names.length - 1}X`;
  });
  return { md: lines.join('\n'), names };
}

/** A post's Markdown as the page's HTML, with the figures put in and the `##` headings listed. */
function renderPost(root, post) {
  const where = post.file;
  const { md, names } = takeFigures(post.body);
  const taken = new Set(['main', 'post-cta-title', 'post-more-title']); // ids the page has already
  const toc = [];
  const Q = makeTranslator({}, null).T;
  const picture = (src, alt, title) => {
    const p = pictureOf(root, src, where);
    const img = h('img', { src: p.src, alt: alt ?? '', loading: 'lazy', decoding: 'async', width: p.width, height: p.height });
    return title ? h('figure', { className: 'post-figure' }, img, h('figcaption', null, title)) : h('figure', { className: 'post-figure' }, img);
  };
  const heading =
    (level) =>
    ({ node, children, ...rest }) => {
      const text = textOf(node).trim();
      const id = slugOf(text, taken);
      if (level === 2) toc.push({ id, title: text });
      return h(`h${level}`, { ...rest, id }, children, h('a', { className: 'anchor', href: `#${id}`, 'aria-label': 'Link to this part' }, '#'));
    };
  const components = {
    h2: heading(2),
    h3: heading(3),
    h4: heading(4),
    a: ({ node, href, children, ...rest }) => {
      const out = /^(https?:)?\/\//.test(href ?? '') && !String(href).startsWith(`${SITE}/`);
      return h('a', { ...rest, href, ...(out ? { rel: 'noopener' } : {}) }, children);
    },
    // A picture on its own line: a figure with its title as the caption.
    p: ({ node, children, ...rest }) => {
      const kids = node.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
      if (kids.length === 1 && kids[0].tagName === 'img') {
        const { src, alt, title } = kids[0].properties;
        return picture(src, alt, title);
      }
      return h('p', rest, children);
    },
    img: ({ node, src, alt }) => {
      const p = pictureOf(root, src ?? '', where);
      return h('img', { src: p.src, alt: alt ?? '', loading: 'lazy', decoding: 'async', width: p.width, height: p.height });
    },
    table: ({ node, ...rest }) => h('div', { className: 'table-wrap' }, h('table', rest)),
    pre: codeBlock(Q),
  };
  let html = renderToStaticMarkup(h(Markdown, { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeRaw], components }, md));
  names.forEach((name, i) => {
    const file = path.join(root, 'website/blog/figures', post.slug, `${name}.html`);
    if (!fs.existsSync(file)) throw new Error(`${where}: the figure "${name}" has no file: website/blog/figures/${post.slug}/${name}.html`);
    const marker = `<p>HYDORFIGURE${i}X</p>`;
    if (!html.includes(marker)) throw new Error(`${where}: the figure line "${name}" is not on a line of its own, with a blank line before and after`);
    html = html.replace(marker, () => fs.readFileSync(file, 'utf8').trim());
  });
  return { html, toc, minutes: readingMinutes(post.body) };
}

/* ---------- Pages ---------- */

const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data, null, 2).replace(/</g, '\\u003c').replace(/\n/g, '\n  ')}</script>`;

const ICON_FEED = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none"/></svg>';

/** The top of a page: language, address, the social card, the blog's styles (the post's own too) and its scripts. */
function head({ langs, title, description, path: urlPath, type, image, extra = '', assets, draft }) {
  const img = image ?? DEFAULT_OG;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  ${headLinks({ lang: 'en', langs, enPath: urlPath, alternates: null })}
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />${draft ? '\n  <meta name="robots" content="noindex" />' : ''}
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="alternate" type="application/atom+xml" title="Hydor blog" href="/blog/feed.xml" />
  <meta property="og:type" content="${type}" />
  <meta property="og:site_name" content="Hydor" />
  <meta property="og:url" content="${SITE}${urlPath}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE}${img.path}" />${img.width ? `\n  <meta property="og:image:width" content="${img.width}" />\n  <meta property="og:image:height" content="${img.height}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />${extra}
  <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/style.css" />
${assets.css.map((f) => `  <link rel="stylesheet" href="${f}" />`).join('\n')}
`;
}

/** A page in the shell of the home page (the icons, the header with the language menu, the footer). */
function page(shell, { langs, headHtml, bodyClass, body, scripts }) {
  const T = makeTranslator({}, null).T;
  const nav = shell.nav.replace('<!--LANG_SWITCH-->', switcher({ lang: 'en', langs, enPath: null, T })).replaceAll('<a href="/blog/">Blog</a>', '<a href="/blog/" aria-current="page">Blog</a>');
  return `${headHtml}  ${shell.script}
  <script src="/main.js" defer></script>
  <script src="/docs/search.js" defer></script>
${scripts.map((f) => `  <script src="${f}" defer></script>`).join('\n')}
</head>
<body class="${bodyClass}">
  ${shell.sprite}
  <a class="skip" href="#main">Skip to content</a>
  ${nav}
${body}
  ${shell.footer}
</body>
</html>
`;
}

/** A post's pictures: its cover as the site has it, or the standard size where the file is not made yet. */
function coverOf(root, post, warn) {
  try {
    return pictureOf(root, post.cover, post.file);
  } catch (e) {
    if (!/is not in website\/src/.test(e.message)) throw e;
    warn(e.message);
    return { src: post.cover, width: 1600, height: 900, missing: true };
  }
}

const chips = (tags) => tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
const metaLine = (p) => `<time datetime="${p.date}">${dateText(p.date)}</time><span aria-hidden="true">·</span><span>${p.minutes} min read</span>`;

/** A post as a card: the cover, its tags, title, description and when. `featured` is the wide one. */
function card(p, { featured = false, level = 2 } = {}) {
  const c = p.coverInfo;
  return `<article class="post-card${featured ? ' featured' : ''}${p.draft ? ' is-draft' : ''}">
  <a class="post-card-link" href="${p.href}">
    <span class="post-card-cover"><img src="${c.src}" alt="" ${featured ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="${c.width}" height="${c.height}" /></span>
    <span class="post-card-body">
      <span class="post-tags">${p.draft ? '<span class="chip" style="--c: var(--amber)">Draft</span>' : ''}${chips(p.tags)}</span>
      <h${level} class="post-card-title">${esc(p.title)}</h${level}>
      <span class="post-card-text">${esc(p.description)}</span>
      <span class="post-meta">${metaLine(p)}</span>
    </span>
  </a>
</article>`;
}

/** The Atom feed. */
function feed(posts) {
  const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
  const updated = posts[0] ? `${posts[0].date}T00:00:00Z` : '2026-01-01T00:00:00Z';
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE}/blog/</id>
  <title>Hydor blog</title>
  <subtitle>${x(BLOG_LINE)}</subtitle>
  <link rel="alternate" type="text/html" href="${SITE}/blog/" />
  <link rel="self" type="application/atom+xml" href="${SITE}/blog/feed.xml" />
  <updated>${updated}</updated>
  <icon>${SITE}/favicon.svg</icon>
  <author><name>Hydor</name><uri>${SITE}/</uri></author>
${posts
  .map(
    (p) => `  <entry>
    <id>${SITE}${p.href}</id>
    <title>${x(p.title)}</title>
    <link rel="alternate" type="text/html" href="${SITE}${p.href}" />
    <published>${p.date}T00:00:00Z</published>
    <updated>${p.date}T00:00:00Z</updated>
    <summary>${x(p.description)}</summary>
  </entry>`,
  )
  .join('\n')}
</feed>
`;
}

/**
 * The blog in out/blog: the first page, a page for each post, and feed.xml. `shellHtml` is the English home page
 * (docs.mjs takes the header and footer from it). Returns the pages made for the sitemap (not the feed, not drafts),
 * as { path, alternates: null }.
 */
export async function buildBlog({ root, out, langs, shellHtml, drafts = false, only = null }) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const shell = shellOf(shellHtml, '');
  const posts = readPosts(root, { drafts, only });
  const blogOut = path.join(out, 'blog');
  fs.mkdirSync(blogOut, { recursive: true });

  // The posts' own files in the shared folder: kept for the posts built, left out for the others.
  const assetOf = (slug, ext) => (fs.existsSync(path.join(root, 'website/src/blog', `${slug}.${ext}`)) ? `/blog/${slug}.${ext}` : null);
  const known = new Set(fs.existsSync(path.join(root, 'website/blog/posts')) ? fs.readdirSync(path.join(root, 'website/blog/posts')).map((f) => f.replace(/\.md$/, '')) : []);
  for (const f of fs.readdirSync(blogOut)) {
    const m = /^(.+)\.(css|js)$/.exec(f);
    if (m && known.has(m[1]) && !posts.some((p) => p.slug === m[1])) fs.rmSync(path.join(blogOut, f));
  }

  for (const p of posts) {
    p.coverInfo = coverOf(root, p, warn);
    const r = renderPost(root, p);
    Object.assign(p, r);
  }

  // A post's page.
  posts.forEach((p, i) => {
    let ogImage = DEFAULT_OG;
    if (p.og) {
      try {
        const o = pictureOf(root, p.og, p.file);
        ogImage = { path: o.src, width: o.width, height: o.height };
      } catch (e) {
        if (!/is not in website\/src/.test(e.message)) throw e;
        warn(e.message);
        ogImage = { path: p.og, width: 1200, height: 630 };
      }
    }
    const assets = { css: ['/blog/blog.css', assetOf(p.slug, 'css')].filter(Boolean), js: ['/blog/blog.js', assetOf(p.slug, 'js')].filter(Boolean) };
    const others = posts.filter((q) => q !== p);
    const more = [...others.slice(i), ...others.slice(0, i)].slice(0, 2);
    const ld = jsonLd({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      image: `${SITE}${p.og ?? p.cover}`,
      url: `${SITE}${p.href}`,
      mainEntityOfPage: `${SITE}${p.href}`,
      author: { '@type': 'Organization', name: 'Hydor', url: `${SITE}/` },
      publisher: { '@type': 'Organization', name: 'Hydor', url: `${SITE}/` },
    });
    const extra = `\n  <meta property="article:published_time" content="${p.date}" />\n  ${ld}`;
    const headHtml = head({ langs, title: `${p.title} · Hydor blog`, description: p.description, path: p.href, type: 'article', image: ogImage, extra, assets, draft: p.draft });
    const c = p.coverInfo;
    const toc = p.toc.length > 1 ? `<aside class="post-toc"><nav aria-label="On this page"><p>On this page</p><ul>${p.toc.map((s) => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')}</ul></nav></aside>` : '';
    const body = `  <div class="read-progress" aria-hidden="true"><i></i></div>
  <main id="main" class="post-main">
    <article class="post-article">
      <header class="post-head">
        <p class="post-crumbs"><a href="/blog/">Blog</a><span aria-hidden="true">›</span><span>${esc(p.tags[0] ?? 'Post')}</span></p>
        <h1>${esc(p.title)}</h1>
        <p class="post-dek">${esc(p.description)}</p>
        <p class="post-meta">${metaLine(p)}<span class="post-tags">${chips(p.tags)}</span></p>
      </header>
      <figure class="post-cover">
        <div class="post-cover-glow" aria-hidden="true"></div>
        <img src="${c.src}" alt="${esc(p.coverAlt)}" fetchpriority="high" decoding="async" width="${c.width}" height="${c.height}" />
      </figure>
      <div class="post-layout">
        <div class="post-body" data-post-body>
${p.html}
        </div>
        ${toc}
      </div>
      <section class="post-cta" aria-labelledby="post-cta-title">
        <div class="post-cta-copy">
          <h2 id="post-cta-title">Hydor is free and open source</h2>
          <p>Run Claude Code, Codex or any model on your own computer, with one memory for all of them.</p>
        </div>
        <div class="post-cta-actions">
          <a class="btn btn-primary" href="/#download"><svg class="ic"><use href="#i-download" /></svg>Download Hydor</a>
          <a class="btn btn-ghost" href="/docs/">Read the docs</a>
          <a class="btn btn-ghost" href="${REPO}" rel="noopener"><svg class="ic"><use href="#i-github" /></svg>GitHub</a>
        </div>
      </section>${more.length ? `
      <section class="post-more" aria-labelledby="post-more-title">
        <h2 id="post-more-title">Keep reading</h2>
        <div class="post-grid">${more.map((q) => card(q, { level: 3 })).join('')}</div>
      </section>` : ''}
    </article>
  </main>`;
    fs.writeFileSync(path.join(blogOut, `${p.slug}.html`), page(shell, { langs, headHtml, bodyClass: 'blog post', body, scripts: assets.js }));
  });

  // The first page.
  {
    const assets = { css: ['/blog/blog.css'], js: ['/blog/blog.js'] };
    const ld = jsonLd({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Hydor blog', description: BLOG_LINE, url: `${SITE}/blog/`, publisher: { '@type': 'Organization', name: 'Hydor', url: `${SITE}/` } });
    const headHtml = head({ langs, title: 'Hydor blog', description: BLOG_LINE, path: '/blog/', type: 'website', extra: `\n  ${ld}`, assets });
    const [first, ...rest] = posts;
    const body = `  <main id="main" class="blog-main">
    <section class="blog-hero">
      <canvas class="water blog-water" aria-hidden="true" data-water></canvas>
      <div class="wrap blog-hero-in">
        <p class="eyebrow">Blog</p>
        <h1>${TITLE}</h1>
        <p class="blog-lede">${esc(BLOG_LINE)}</p>
        <a class="blog-feed" href="/blog/feed.xml">${ICON_FEED}<span>Atom feed</span></a>
      </div>
    </section>
    <div class="wrap blog-list">
${first ? `      ${card(first, { featured: true })}` : '      <p class="blog-empty">The first posts are on their way.</p>'}${rest.length ? `
      <div class="post-grid">${rest.map((q) => card(q)).join('')}</div>` : ''}
    </div>
  </main>`;
    fs.writeFileSync(path.join(blogOut, 'index.html'), page(shell, { langs, headHtml, bodyClass: 'blog blog-home', body, scripts: assets.js }));
  }

  const published = posts.filter((p) => !p.draft);
  fs.writeFileSync(path.join(blogOut, 'feed.xml'), feed(published));
  return { made: [{ path: '/blog/', alternates: null }, ...published.map((p) => ({ path: p.href, alternates: null }))], posts, warnings };
}

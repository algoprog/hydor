import { createContext, lazy, memo, Suspense, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeMath } from './markdown-math';
import { Check, Copy, FileText } from 'lucide-react';
import { highlight, resolveLang } from '../lib/highlight';
import { CITE_RUN, citedReply, citeNumbers, type Cited } from '@shared/citations';
import { codexCitations, FILE_CITATION } from '@shared/file-citations';
import { CiteChip, SourcesRow } from './Citations';
import { openLightbox } from './Lightbox';
import { cx } from './ui';
import { goApp, openFile } from '../lib/nav';
import { joinPath } from '../lib/format';
import { machineBase, mu } from '../lib/machine';
import { tr } from '../i18n/runtime';

/** While a reply comes, an equation shown apart that is not finished yet waits for its end (not drawn as an error meanwhile). */
function holdOpenMaths(src: string): string {
  const outside = src.replace(/```[\s\S]*?(```|$)|`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  const at = [...outside.matchAll(/\$\$/g)];
  return at.length % 2 ? src.slice(0, at[at.length - 1].index) : src;
}

function hastText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(hastText).join('');
}

export function CopyButton({ text, className, label = 'Copy' }: { text: string | (() => string); className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={async (e) => {
        e.stopPropagation();
        const t = typeof text === 'function' ? text() : text;
        try {
          await navigator.clipboard.writeText(t);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = t;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className={cx('inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg', className)}
    >
      {done ? <Check size={13} className="anim-pop-in anim-draw text-ok" /> : <Copy size={13} />}
    </button>
  );
}

/** A small button in the bar over a block (code, a diagram, a live block), beside its copy button. */
export function BarButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
    >
      {children}
    </button>
  );
}

/** Code, highlighted; `bare`: without its own frame and header (inside a block that has them: a diagram's code). */
export const CodeBlock = memo(function CodeBlock({ code, lang, maxHeight = 520, className, bare }: { code: string; lang?: string | null; maxHeight?: number; className?: string; bare?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const text = code.replace(/\n$/, '');
  useEffect(() => {
    let alive = true;
    setHtml(null);
    highlight(text, lang ?? null)
      .then((h) => alive && setHtml(h))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [text, lang]);
  const lines = useMemo(() => text.split('\n').length, [text]);
  const tall = lines > 28;
  return (
    <div className={cx(bare ? 'code-body group relative' : 'code-block group relative my-2', className)}>
      {!bare && (
        <div className="flex h-7 items-center gap-2 border-b border-line px-3 text-[11px] text-fg-3">
          <span className="font-mono">{resolveLang(lang) ?? lang ?? 'text'}</span>
          <span className="flex-1" />
          <CopyButton text={text} />
        </div>
      )}
      <div style={{ maxHeight: tall && !expanded ? maxHeight : undefined }} className={cx(tall && !expanded && 'overflow-hidden')}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre><code>{text}</code></pre>}
      </div>
      {tall && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full border-t border-line py-1 text-[11.5px] text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
        >
          {/* Through tr: inside a reply (.md) the page's own translation of text passes it by. */}
          {expanded ? tr('Show less') : tr('Show all {0} lines').replace('{0}', String(lines))}
        </button>
      )}
    </div>
  );
});

/** `a/./b/../c` → `a/c`. */
function normalizePath(p: string): string {
  const out: string[] = [];
  for (const part of p.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.' && (part || !out.length)) out.push(part);
  }
  return out.join('/') || '/';
}

/** The app's own pages, which a link to this site's address opens here rather than in a new tab. */
const APP_PAGE = /^\/(?:$|s\/|guide|settings|spaces|knowledge|apps|pages|inbox|usage|stats|arena|system|files|search|git|terminal|preview|answers|review\/)/;

/** A link to this app itself (an agent's, to /settings?s=memory): its path, else null. */
function appPath(h: string): string | null {
  if (!/^https?:\/\//i.test(h)) return null;
  try {
    const u = new URL(h);
    if (u.origin !== location.origin) return null;
    const p = u.pathname.slice(machineBase.length && u.pathname.startsWith(machineBase) ? machineBase.length : 0) || '/';
    return APP_PAGE.test(p) ? `${p}${u.search}${u.hash}` : null;
  } catch {
    return null;
  }
}

/**
 * Links: local paths open in the app's file viewer (a file an agent cites, from Codex's file citations, as a chip with
 * a file's icon); links to this app's own pages open here. In a document (`baseDir` set), relative links are files next
 * to it and `#section` links scroll to that heading. In the guide (`app`), `/…` links are the app's pages.
 */
function makeLink(baseDir?: string, app?: boolean): Components['a'] {
  return function Link({ href, title, children }) {
    const h = href ?? '';
    const own = app && h.startsWith('/') && !h.startsWith('//') ? h : appPath(h);
    if (own) {
      return (
        <a
          href={`${machineBase}${own}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            goApp(own);
          }}
        >
          {children}
        </a>
      );
    }
    if ((baseDir || app) && h.startsWith('#')) {
      return (
        <a
          href={h}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(decodeURIComponent(h.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {children}
        </a>
      );
    }
    const relative = !!baseDir && !!h && !/^[a-z][a-z0-9+.-]*:/i.test(h) && !h.startsWith('/') && !h.startsWith('#');
    if (relative || h.startsWith('/') || h.startsWith('file://')) {
      const raw = decodeURIComponent((relative ? joinPath(baseDir!, h) : h.replace(/^file:\/\//, '')).replace(/[?#].*$/, ''));
      const path = normalizePath(raw);
      const line = Number(/#L(\d+)/.exec(h)?.[1]) || undefined;
      const cited = title === FILE_CITATION;
      return (
        <a
          href={`${machineBase}/file?path=${encodeURIComponent(path)}`}
          title={cited ? path : (title ?? undefined)}
          onClick={(e) => {
            e.preventDefault();
            openFile(path, line);
          }}
        >
          {cited && <FileText size={13} className="mr-0.5 inline-block shrink-0 align-[-2px]" aria-hidden />}
          {children}
        </a>
      );
    }
    return (
      <a href={h} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  };
}

/**
 * GitHub-style ids on a document's headings, so `#quick-start` links land; or, given `ids`, those (the guide's
 * translations take the English headings' ids, one per heading below the title, in order).
 */
function rehypeHeadingIds(o?: { ids?: string[] }) {
  return (tree: any) => {
    const seen = new Map<string, number>();
    let at = 0;
    const visit = (node: any) => {
      for (const c of node.children ?? []) {
        if (o?.ids && c.type === 'element' && /^h[2-6]$/.test(c.tagName) && o.ids[at] !== undefined) {
          c.properties = { ...c.properties, id: o.ids[at++] };
        } else if (c.type === 'element' && /^h[1-6]$/.test(c.tagName) && !c.properties?.id) {
          const base = hastText(c)
            .toLowerCase()
            .trim()
            .replace(/[^\p{L}\p{N}\s_-]/gu, '')
            .replace(/\s/g, '-');
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          c.properties = { ...c.properties, id: n ? `${base}-${n}` : base };
        }
        visit(c);
      }
    };
    visit(tree);
  };
}

/**
 * What the blocks drawn in place need from the Markdown around them: its text as given to the parser (to tell a
 * finished block from one still coming), and, in an agent's reply (`rich`), its session.
 */
export interface MdInfo {
  src: string;
  streaming: boolean;
  /** An agent's reply: ```html live blocks run, and pictures show from the web and this computer. */
  rich: boolean;
  sessionKey?: string;
  /** The session's folder, for pictures given by a relative path. */
  cwd?: string;
  /** A confidential session's reply: nothing loads from the web for it (pictures there are links), and its live blocks stay code. */
  offline?: boolean;
}
export const MdCtx = createContext<MdInfo>({ src: '', streaming: false, rich: false });

// Loaded the first time a reply has one: Mermaid is big, the page frame is the Pages' own, and the answer UIs are many.
const MermaidBlock = lazy(() => import('./MermaidBlock'));
const HtmlBlock = lazy(() => import('./HtmlBlock'));
const AnswerUi = lazy(() => import('./answer/AnswerUi'));

/** The word after ```html that runs the block in place: ```html live (or render, preview…). Plain ```html stays code. */
const LIVE = /^(live|render|preview|show|run|widget|demo|interactive|figure|app)$/i;

/** Whether a fenced block is closed already: while a reply comes, its last block may still be arriving. */
function fenceClosed(src: string, pos: any): boolean {
  const a = pos?.start?.offset;
  const b = pos?.end?.offset;
  if (typeof a !== 'number' || typeof b !== 'number') return true;
  // Inside a quote or a list, the lines start with "> " or spaces.
  const lines = src
    .slice(a, b)
    .trimEnd()
    .split('\n')
    .map((l) => l.replace(/^(?:[ \t]*>)*[ \t]*/, ''));
  const open = /^(`{3,}|~{3,})/.exec(lines[0])?.[1];
  if (!open) return true;
  const close = lines.length > 1 ? /^(`{3,}|~{3,})\s*$/.exec(lines[lines.length - 1])?.[1] : undefined;
  return !!close && close[0] === open[0] && close.length >= open.length;
}

/**
 * A fenced block: a ```mermaid diagram drawn, and in a reply a ```ui <name> block drawn as that answer UI (its data as
 * JSON: components/answer) and a ```html live block run in place; otherwise code.
 */
function Pre({ node }: { node?: any }) {
  const md = useContext(MdCtx);
  const code = node?.children?.[0];
  const cls = String(code?.properties?.className?.[0] ?? '');
  const lang = /language-([^\s]+)/.exec(cls)?.[1];
  const text = hastText(code);
  const kind = lang?.toLowerCase();
  if (md.rich && (kind === 'ui' || kind?.startsWith('ui:'))) {
    const name = kind === 'ui' ? (String(code?.data?.meta ?? '').trim().split(/\s+/)[0] ?? '') : kind.slice(3);
    const done = !md.streaming || fenceClosed(md.src, node?.position);
    return (
      <Suspense fallback={<div className="aui-wait my-3" />}>
        <AnswerUi name={name} code={text} done={done} />
      </Suspense>
    );
  }
  if (kind === 'mermaid' || (md.rich && !md.offline && kind === 'html' && String(code?.data?.meta ?? '').split(/\s+/).some((w) => LIVE.test(w)))) {
    const done = !md.streaming || fenceClosed(md.src, node?.position);
    return <Suspense fallback={<CodeBlock code={text} lang={lang} />}>{kind === 'mermaid' ? <MermaidBlock code={text} done={done} /> : <HtmlBlock code={text} done={done} />}</Suspense>;
  }
  return <CodeBlock code={text} lang={lang} />;
}

/**
 * Where a picture in an agent's reply loads from: the web through this server (the app's pages load nothing from other
 * sites, and the site never sees who looks), a file of this computer (a path, absolute or from the session's folder),
 * or a data: address as it is. Null: it shows as a link.
 */
export function replyPicture(src: string, cwd?: string): string | null {
  const s = src.trim();
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return mu(`/api/pages/picture?url=${encodeURIComponent(s)}`);
  let file = s.replace(/^file:\/\//i, '').split(/[?#]/)[0];
  if (!file || /^[a-z][a-z0-9+.-]*:/i.test(file) || file.startsWith('//')) return null;
  try {
    file = decodeURIComponent(file);
  } catch {}
  if (!file.startsWith('/') && file !== '~' && !file.startsWith('~/')) {
    if (!cwd) return null;
    file = normalizePath(joinPath(cwd, file));
  }
  return mu(`/api/fs/raw?path=${encodeURIComponent(file)}`);
}

/** A picture in an agent's reply: fitted to the reply, opened large on a click, and a link when it cannot load. */
function ReplyPicture({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const { cwd, offline } = useContext(MdCtx);
  const from = String(src ?? '');
  // A confidential session's reply loads nothing from the web: such a picture is a link you may open.
  const url = useMemo(() => (offline && /^https?:\/\//i.test(from.trim()) ? null : replyPicture(from, cwd)), [from, cwd, offline]);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    const Link = plainLink;
    return <Link href={from}>{`${alt?.trim() || tr('Picture')} ↗`}</Link>;
  }
  const web = /^https?:\/\//i.test(from);
  return (
    <span className="md-figure">
      <img
        src={url}
        alt={alt ?? ''}
        title={title || undefined}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        onClick={(e) => {
          // A picture that is a link (to its source) follows the link.
          if ((e.currentTarget as HTMLElement).closest('a')) return;
          openLightbox([{ src: url, name: title || alt || undefined, href: web ? from : undefined }]);
        }}
        className="md-pic"
      />
      {title && <span className="md-caption">{title}</span>}
    </span>
  );
}

/**
 * The addresses a text may use: react-markdown's safe ones, and files of this computer (file://, which open in the app's
 * file viewer, never as the browser's own page), and for pictures data:image/… and a notebook's attachment:… too.
 */
function urlTransform(url: string, key: string): string {
  if (/^file:\/\//i.test(url)) return url;
  if (key === 'src' && /^(data:image\/|attachment:)/i.test(url)) return url;
  return defaultUrlTransform(url);
}

/** Links as the Markdown of a reply has them (local paths in the file viewer, the web in a new tab). */
const plainLink = makeLink()!;

const components: Components = {
  pre: Pre as Components['pre'],
  // Tables keep natural column widths and scroll sideways when they do not fit; long cells
  // wrap at a readable width instead of squeezing their neighbours.
  table({ children }) {
    return (
      <div className="md-table">
        <table>{children}</table>
      </div>
    );
  },
  th({ children, style }) {
    return (
      <th style={style}>
        <div className="md-cell">{children}</div>
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td style={style}>
        <div className="md-cell">{children}</div>
      </td>
    );
  },
};

const katexOpts = { throwOnError: false, strict: 'ignore' as const, output: 'html' as const };

/** A citing number's chip (remarkCites), and a link whose words are only a number ("[3](https://…)") as one too. */
function citeComponents(cites: Map<number, Cited>, link: Components['a']): Components {
  const Link = link!;
  return {
    sup({ node, children, ...props }: any) {
      const nums = String(props['data-cite'] ?? '')
        .split(',')
        .map(Number)
        .filter((n) => cites.has(n));
      if (!nums.length) return <sup {...props}>{children}</sup>;
      return <CiteChip sources={nums.map((n) => cites.get(n)!)} />;
    },
    a(props: any) {
      const words = hastText(props.node).trim();
      const n = /^\[?(\d{1,3})\]?$/.exec(words)?.[1];
      const href = String(props.href ?? '');
      if (n && /^https?:\/\//i.test(href)) {
        const known = cites.get(Number(n));
        return <CiteChip sources={[known && known.url === href ? known : { n: Number(n), title: '', url: href }]} />;
      }
      return <Link {...props} />;
    },
  };
}

/**
 * While text streams, each word becomes its own span: React keeps the spans it already
 * rendered, so only words that just arrived mount and fade in (see .sw in styles.css).
 * Code and maths are left whole.
 */
function rehypeStreamWords() {
  const skip = (n: any) => n.type === 'element' && (n.tagName === 'pre' || n.tagName === 'code' || (n.properties?.className ?? []).some((c: unknown) => String(c).startsWith('katex')));
  const visit = (node: any) => {
    if (!node.children) return;
    const out: any[] = [];
    for (const child of node.children) {
      if (child.type === 'text') {
        for (const part of String(child.value).split(/(\s+)/)) {
          if (!part) continue;
          out.push(/^\s+$/.test(part) ? { type: 'text', value: part } : { type: 'element', tagName: 'span', properties: { className: ['sw'] }, children: [{ type: 'text', value: part }] });
        }
      } else {
        if (!skip(child)) visit(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  return (tree: any) => visit(tree);
}

/**
 * Agents write for a terminal, where a line break starts a new line. In their replies it stays one (as
 * GitHub keeps them in comments) instead of joining the lines into one paragraph; documents keep
 * Markdown's own rule.
 */
function remarkLineBreaks() {
  const visit = (node: any) => {
    if (!node.children) return;
    const out: any[] = [];
    for (const child of node.children) {
      if (child.type === 'text' && child.value.includes('\n')) {
        child.value.split(/[ \t]*\r?\n/).forEach((part: string, i: number) => {
          if (i) out.push({ type: 'break' });
          if (part) out.push({ type: 'text', value: part });
        });
      } else {
        visit(child);
        out.push(child);
      }
    }
    node.children = out;
  };
  return (tree: any) => visit(tree);
}

/**
 * A reply's citing numbers ("[1][12]", "[3, 4]") as one chip each, for the numbers its sources have (shared/citations.ts);
 * not inside code, links or maths. The chip is a <sup data-cite="1,12"> that `sup` below draws.
 */
function remarkCites(o: { known: Set<number> }) {
  const SKIP = new Set(['link', 'linkReference', 'inlineCode', 'code', 'definition', 'math', 'inlineMath', 'html']);
  const visit = (node: any) => {
    if (!node.children || SKIP.has(node.type)) return;
    const out: any[] = [];
    for (const child of node.children) {
      if (child.type !== 'text' || !child.value.includes('[')) {
        visit(child);
        out.push(child);
        continue;
      }
      const v: string = child.value;
      let at = 0;
      for (const m of v.matchAll(CITE_RUN)) {
        const nums = citeNumbers(m[0]).filter((n) => o.known.has(n));
        if (!nums.length) continue;
        // The space before it goes: the chip keeps its own.
        const before = v.slice(at, m.index).replace(/[ \t]+$/, '');
        if (before) out.push({ type: 'text', value: before });
        out.push({ type: 'cite', data: { hName: 'sup', hProperties: { dataCite: nums.join(',') }, hChildren: [{ type: 'text', value: m[0] }] } });
        at = m.index! + m[0].length;
      }
      if (!at) out.push(child);
      else if (at < v.length) out.push({ type: 'text', value: v.slice(at) });
    }
    node.children = out;
  };
  return (tree: any) => visit(tree);
}

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any;
const remarkBreaks = [...remarkPlugins, remarkLineBreaks] as any;
const rehypePlugins = [[rehypeKatex, katexOpts]] as any;
const rehypeStreaming = [[rehypeKatex, katexOpts], rehypeStreamWords] as any;

/**
 * KaTeX's chemistry (\ce{H2O}, \pu{…}), loaded the first time a text has some: until then those show as written.
 * Each Markdown waiting for it draws again once it is in.
 */
let chem: 'no' | 'loading' | 'yes' = 'no';
const chemWaiting = new Set<() => void>();
function useChemistry(text: string) {
  const need = chem !== 'yes' && (text.includes('\\ce{') || text.includes('\\pu{'));
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!need) return;
    const f = () => redraw((n) => n + 1);
    chemWaiting.add(f);
    if (chem === 'no') {
      chem = 'loading';
      import('katex/contrib/mhchem')
        .then(() => {
          chem = 'yes';
          for (const g of chemWaiting) g();
        })
        .catch(() => (chem = 'no'));
    }
    return () => void chemWaiting.delete(f);
  }, [need]);
}

/**
 * `resolveImage` maps an image source to a URL that may load here, or null to show it as a link
 * (this page's policy blocks other sites' images). `rehypeExtra` runs first (documents and notebooks:
 * their HTML). `baseDir`: the folder of the document shown, for its relative links and #anchors.
 * `breaks`: a single line break stays one (what agents write). ```mermaid blocks are drawn as diagrams everywhere;
 * `rich` (an agent's reply) also runs ```html live blocks in place and shows its pictures (`resolveImage` aside).
 */
export const Markdown = memo(function Markdown({
  text,
  className,
  children,
  streaming,
  notebook,
  resolveImage,
  rehypeExtra,
  baseDir,
  breaks,
  app,
  headingIds,
  cites,
  rich,
  sessionKey,
  cwd,
  offline,
}: {
  text: string;
  className?: string;
  children?: ReactNode;
  streaming?: boolean;
  notebook?: boolean;
  resolveImage?: (src: string) => string | null;
  rehypeExtra?: any[];
  baseDir?: string;
  breaks?: boolean;
  /** The app's own text (the guide): `/…` links are its pages, and headings get ids for `#section` links. */
  app?: boolean;
  /** The ids its headings take, in order (a translated guide topic: the English ones). */
  headingIds?: string[];
  /** A reply's sources by the numbers it cites them by: each citing number shows as a chip that links to its page. */
  cites?: Map<number, Cited>;
  /** An agent's reply: ```html live blocks run in place, and its pictures show (from the web, through this server). */
  rich?: boolean;
  /** The reply's session: a live block's choices go to its message box. */
  sessionKey?: string;
  /** The session's folder: pictures given by a relative path are there. */
  cwd?: string;
  /** A confidential session's reply: nothing from the web (pictures there are links), live blocks stay code. */
  offline?: boolean;
}) {
  const src = useMemo(() => {
    const t = normalizeMath(codexCitations(text), !notebook);
    return streaming ? holdOpenMaths(t) : t;
  }, [text, notebook, streaming]);
  useChemistry(src);
  const info = useMemo<MdInfo>(() => ({ src, streaming: !!streaming, rich: !!rich, sessionKey, cwd, offline }), [src, streaming, rich, sessionKey, cwd, offline]);
  const comps = useMemo<Components>(() => {
    const base: Components = {
      ...components,
      a: makeLink(baseDir, app),
      ...(cites ? citeComponents(cites, makeLink(baseDir, app)) : {}),
    };
    if (resolveImage)
      return {
        ...base,
        img({ src: from, alt, width, height, align }: any) {
          const url = resolveImage(String(from ?? ''));
          // `align="left|right"` (old HTML that READMEs still use) floats the image beside the text.
          const float = align === 'left' || align === 'right' ? { float: align, margin: align === 'right' ? '0 0 8px 16px' : '0 16px 8px 0' } : undefined;
          if (url) return <img src={url} alt={alt ?? ''} width={width} height={height} style={float as React.CSSProperties | undefined} />;
          return (
            <a href={String(from ?? '')} target="_blank" rel="noopener noreferrer">
              {alt || 'image'} ↗
            </a>
          );
        },
      };
    return rich ? { ...base, img: ReplyPicture as Components['img'] } : base;
  }, [resolveImage, baseDir, app, cites, rich]);
  const remark = useMemo(() => {
    const list = breaks ? remarkBreaks : remarkPlugins;
    return cites?.size ? [...list, [remarkCites, { known: new Set(cites.keys()) }]] : list;
  }, [breaks, cites]);
  const rehype = useMemo(
    () => [...(rehypeExtra ?? []), ...(streaming ? rehypeStreaming : rehypePlugins), ...(baseDir || app ? [[rehypeHeadingIds, { ids: headingIds }]] : [])],
    [rehypeExtra, streaming, baseDir, app, headingIds],
  );
  return (
    <MdCtx.Provider value={info}>
      <div className={cx('md', className)}>
        <ReactMarkdown remarkPlugins={remark} rehypePlugins={rehype} components={comps} urlTransform={urlTransform}>
          {src}
        </ReactMarkdown>
        {children}
      </div>
    </MdCtx.Provider>
  );
});

/**
 * An agent's reply: the sources it cites as chips in its text and one Sources line under it, instead of the list it
 * ends with (shared/citations.ts). While it is still coming (`streaming`), the line waits for its end.
 */
export function ReplyMarkdown({ text, streaming, rich = true, ...rest }: Omit<Parameters<typeof Markdown>[0], 'cites'>) {
  const cited = useMemo(() => citedReply(text, { streaming }), [text, streaming]);
  const cites = useMemo(() => (cited.sources.length ? new Map(cited.sources.map((s) => [s.n, s])) : undefined), [cited]);
  return (
    <>
      <Markdown text={cited.body} cites={cites} streaming={streaming} rich={rich} {...rest} />
      {!streaming && cited.sources.length > 0 && <SourcesRow sources={cited.sources} />}
    </>
  );
}

/**
 * Text that arrives in bursts, revealed at an even pace a few words at a time, so it reads
 * like it is being written. Keeps going after the stream ends until it has caught up.
 */
export function useSmoothText(target: string, streaming: boolean): { text: string; revealing: boolean } {
  // What is already there when this mounts shows at once; only what arrives later is paced.
  const [shown, setShown] = useState(target);
  const pos = useRef(shown.length);
  const targetRef = useRef(target);
  targetRef.current = target;
  const behind = shown.length < target.length;
  // Replaced rather than extended (another reply): start over from the new text.
  useEffect(() => {
    if (!target.startsWith(shown)) {
      pos.current = target.length;
      setShown(target);
    }
  }, [target, shown]);
  useEffect(() => {
    if (!streaming && !behind) return;
    const t = setInterval(() => {
      const full = targetRef.current;
      if (pos.current >= full.length) {
        if (!streaming) clearInterval(t);
        return;
      }
      // Drain what is waiting in about a third of a second, at least ~60 characters a second.
      const backlog = full.length - pos.current;
      let end = pos.current + Math.max(3, Math.ceil(backlog / 7));
      // Whole words only: stop at the next space when it is close.
      const sp = full.indexOf(' ', end);
      if (sp !== -1 && sp - end < 24) end = sp;
      pos.current = Math.min(full.length, end);
      setShown(full.slice(0, pos.current));
    }, 50);
    return () => clearInterval(t);
  }, [streaming, behind]);
  if (!streaming && !behind) return { text: target, revealing: false };
  return { text: shown, revealing: true };
}

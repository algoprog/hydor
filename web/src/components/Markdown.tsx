import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Check, Copy } from 'lucide-react';
import { highlight, resolveLang } from '../lib/highlight';
import { CITE_RUN, citedReply, citeNumbers, type Cited } from '@shared/citations';
import { CiteChip, SourcesRow } from './Citations';
import { cx } from './ui';
import { goApp, openFile } from '../lib/nav';
import { joinPath } from '../lib/format';
import { machineBase } from '../lib/machine';

/**
 * Claude writes \(…\) and \[…\]; remark-math wants $…$ and $$…$$. A $ right before a digit is
 * money ("$4.70 per question"), not maths, so it is escaped, except in notebooks (`money` false),
 * where $ is always maths. Code is left alone.
 */
function normalizeMath(src: string, money = true): string {
  if (!src.includes('$') && !src.includes('\\(') && !src.includes('\\[')) return src;
  const parts = src.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p
            .replace(/(^|[^\\$])\$(?=\d)/g, (m, pre) => (money ? `${pre}\\$` : m))
            .replace(/\\\[([\s\S]+?)\\\]/g, (_m, x) => `\n$$\n${x.trim()}\n$$\n`)
            .replace(/\\\((.+?)\\\)/g, (_m, x) => `$${x}$`),
    )
    .join('');
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

export const CodeBlock = memo(function CodeBlock({ code, lang, maxHeight = 520, className }: { code: string; lang?: string | null; maxHeight?: number; className?: string }) {
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
    <div className={cx('code-block group relative my-2', className)}>
      <div className="flex h-7 items-center gap-2 border-b border-line px-3 text-[11px] text-fg-3">
        <span className="font-mono">{resolveLang(lang) ?? lang ?? 'text'}</span>
        <span className="flex-1" />
        <CopyButton text={text} />
      </div>
      <div style={{ maxHeight: tall && !expanded ? maxHeight : undefined }} className={cx(tall && !expanded && 'overflow-hidden')}>
        {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <pre><code>{text}</code></pre>}
      </div>
      {tall && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="w-full border-t border-line py-1 text-[11.5px] text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
        >
          {expanded ? 'Show less' : `Show all ${lines} lines`}
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
const APP_PAGE = /^\/(?:$|s\/|guide|settings|spaces|knowledge|apps|pages|inbox|usage|stats|arena|system|files|search|git|terminal|preview|review\/)/;

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
 * Links: local paths open in the app's file viewer; links to this app's own pages open here. In a document
 * (`baseDir` set), relative links are files next to it and `#section` links scroll to that heading. In the
 * guide (`app`), `/…` links are the app's pages.
 */
function makeLink(baseDir?: string, app?: boolean): Components['a'] {
  return function Link({ href, children }) {
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
      return (
        <a
          href={`${machineBase}/file?path=${encodeURIComponent(path)}`}
          onClick={(e) => {
            e.preventDefault();
            openFile(path, line);
          }}
        >
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

const components: Components = {
  pre({ node }) {
    const code = (node as any)?.children?.[0];
    const cls = String(code?.properties?.className?.[0] ?? '');
    const lang = /language-([^\s]+)/.exec(cls)?.[1];
    return <CodeBlock code={hastText(code)} lang={lang} />;
  },
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
 * `resolveImage` maps an image source to a URL that may load here, or null to show it as a link
 * (this page's policy blocks other sites' images). `rehypeExtra` runs first (documents and notebooks:
 * their HTML). `baseDir`: the folder of the document shown, for its relative links and #anchors.
 * `breaks`: a single line break stays one (what agents write).
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
}) {
  const src = useMemo(() => normalizeMath(text, !notebook), [text, notebook]);
  const comps = useMemo<Components>(() => {
    const base: Components = {
      ...components,
      a: makeLink(baseDir, app),
      ...(cites ? citeComponents(cites, makeLink(baseDir, app)) : {}),
    };
    return resolveImage
      ? {
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
        }
      : base;
  }, [resolveImage, baseDir, app, cites]);
  const remark = useMemo(() => {
    const list = breaks ? remarkBreaks : remarkPlugins;
    return cites?.size ? [...list, [remarkCites, { known: new Set(cites.keys()) }]] : list;
  }, [breaks, cites]);
  const rehype = useMemo(
    () => [...(rehypeExtra ?? []), ...(streaming ? rehypeStreaming : rehypePlugins), ...(baseDir || app ? [[rehypeHeadingIds, { ids: headingIds }]] : [])],
    [rehypeExtra, streaming, baseDir, app, headingIds],
  );
  return (
    <div className={cx('md', className)}>
      <ReactMarkdown remarkPlugins={remark} rehypePlugins={rehype} components={comps}>
        {src}
      </ReactMarkdown>
      {children}
    </div>
  );
});

/**
 * An agent's reply: the sources it cites as chips in its text and one Sources line under it, instead of the list it
 * ends with (shared/citations.ts). While it is still coming (`streaming`), the line waits for its end.
 */
export function ReplyMarkdown({ text, streaming, ...rest }: Omit<Parameters<typeof Markdown>[0], 'cites'>) {
  const cited = useMemo(() => citedReply(text, { streaming }), [text, streaming]);
  const cites = useMemo(() => (cited.sources.length ? new Map(cited.sources.map((s) => [s.n, s])) : undefined), [cited]);
  return (
    <>
      <Markdown text={cited.body} cites={cites} streaming={streaming} {...rest} />
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

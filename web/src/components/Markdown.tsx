import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Check, Copy } from 'lucide-react';
import { highlight, resolveLang } from '../lib/highlight';
import { cx } from './ui';
import { openFile } from '../lib/nav';
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
      {done ? <Check size={13} className="anim-pop text-ok" /> : <Copy size={13} />}
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

/**
 * Links: local paths open in the app's file viewer. In a document (`baseDir` set), relative links are
 * files next to it and `#section` links scroll to that heading.
 */
function makeLink(baseDir?: string): Components['a'] {
  return function Link({ href, children }) {
    const h = href ?? '';
    if (baseDir && h.startsWith('#')) {
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

/** GitHub-style ids on a document's headings, so `#quick-start` links land. */
function rehypeHeadingIds() {
  return (tree: any) => {
    const seen = new Map<string, number>();
    const visit = (node: any) => {
      for (const c of node.children ?? []) {
        if (c.type === 'element' && /^h[1-6]$/.test(c.tagName) && !c.properties?.id) {
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

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any;
const rehypePlugins = [[rehypeKatex, katexOpts]] as any;
const rehypeStreaming = [[rehypeKatex, katexOpts], rehypeStreamWords] as any;

/**
 * `resolveImage` maps an image source to a URL that may load here, or null to show it as a link
 * (this page's policy blocks other sites' images). `rehypeExtra` runs first (documents and notebooks:
 * their HTML). `baseDir`: the folder of the document shown, for its relative links and #anchors.
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
}: {
  text: string;
  className?: string;
  children?: ReactNode;
  streaming?: boolean;
  notebook?: boolean;
  resolveImage?: (src: string) => string | null;
  rehypeExtra?: any[];
  baseDir?: string;
}) {
  const src = useMemo(() => normalizeMath(text, !notebook), [text, notebook]);
  const comps = useMemo<Components>(
    () =>
      resolveImage
        ? {
            ...components,
            a: makeLink(baseDir),
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
        : { ...components, a: makeLink(baseDir) },
    [resolveImage, baseDir],
  );
  const rehype = useMemo(
    () => [...(rehypeExtra ?? []), ...(streaming ? rehypeStreaming : rehypePlugins), ...(baseDir ? [rehypeHeadingIds] : [])],
    [rehypeExtra, streaming, baseDir],
  );
  return (
    <div className={cx('md', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehype} components={comps}>
        {src}
      </ReactMarkdown>
      {children}
    </div>
  );
});

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

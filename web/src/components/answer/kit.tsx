// The parts answer UIs are made of (uis/*.tsx): what an agent's data is read with (leniently: a field may be missing or
// of the wrong kind, and while the reply streams most are), how numbers, money and dates are written (in the app's
// language), and the pieces every UI shares: Markdown in a field, pictures (from the web through this server, opened large
// on a click), chips in a tone, stars, deltas, meters, rings, label-value rows, segmented controls, buttons, a button that
// puts words in the message box, videos that play in place, state kept on this device, a clock that ticks.
//
// Every UI draws the agent's words as they are (the block is translate="no") and the app's own words through tr(), so
// they are in the app's language. A UI reads `done` (useAui) to hold back what only makes sense once its data is whole.
import { createContext, lazy, memo, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChevronDown, ExternalLink, MessageSquarePlus, Play, Star, Volume2 } from 'lucide-react';
import { videoEmbed } from '@shared/app-media';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';
import { composeInsert } from '../../lib/featureEvents';
import { mu } from '../../lib/machine';
import { toast } from '../../lib/store';
import { openLightbox } from '../Lightbox';
import { CopyButton, replyPicture } from '../Markdown';
import { normalizeMath } from '../markdown-math';
import { cx } from '../ui';

// ---- the block a UI is drawn in -------------------------------------------------------------------------------------

export interface AuiInfo {
  /** The reply's session: what a UI puts in the message box goes to its box. */
  sessionKey?: string;
  /** The session's folder, for pictures given by a relative path. */
  cwd?: string;
  /** A confidential session's reply: nothing loads from the web (pictures and videos are links, no map). */
  offline?: boolean;
  /** Its block is whole (false while the reply is still writing it). */
  done: boolean;
  /** What its kept state is filed under (its session and block); none while it streams. */
  keep: string;
  /** The gallery's example: there is no message box to put words in. */
  demo?: boolean;
}

export const AuiCtx = createContext<AuiInfo>({ done: true, keep: '' });
export const useAui = () => useContext(AuiCtx);

/** A UI: its data as the agent wrote it (whatever has arrived of it), and whether all of it has. */
export type AnswerUiView = ComponentType<{ data: Data; done: boolean }>;

// ---- reading the data -----------------------------------------------------------------------------------------------

export type Data = Record<string, any>;

export const isObj = (v: unknown): v is Data => !!v && typeof v === 'object' && !Array.isArray(v);
/** An object, or an empty one. */
export const obj = (v: unknown): Data => (isObj(v) ? v : {});
/** A list without its empty items, or an empty one. */
export const arr = <T = any,>(v: unknown): T[] => (Array.isArray(v) ? v.filter((x) => x !== undefined && x !== null) : []);
/** Text: a string as it is, a number as text, anything else empty. */
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** A number: a number, or text that is one ("1,250", "$40", "25%"); null otherwise. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^[$€£¥₹]\s*/, '').replace(/\s*%$/, '').replace(/(\d)[,_ ](?=\d{3}\b)/g, '$1');
  if (!/^[-+−]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s.replace('−', '-'));
  return Number.isFinite(n) ? n : null;
}
/** Yes or no: true, "true", "yes". */
export const yes = (v: unknown) => v === true || v === 1 || (typeof v === 'string' && /^(true|yes|y|✓)$/i.test(v.trim()));
/** An item given as words or as an object: its words (the first of `keys` that has some), else its text. */
export const textOf = (v: unknown, ...keys: string[]): string => {
  if (typeof v === 'string' || typeof v === 'number') return str(v);
  if (isObj(v)) for (const k of keys.length ? keys : ['text', 'title', 'name', 'label']) if (str(v[k])) return str(v[k]);
  return '';
};
/** A list of words given as a list, or as one text with commas. */
export const words = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => textOf(x)).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/\s*[,;]\s*/).filter(Boolean) : []);

// ---- writing numbers, money and dates --------------------------------------------------------------------------------

const lang = () => LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
const formats = new Map<string, Intl.NumberFormat>();
function numberFormat(o: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = JSON.stringify(o);
  let f = formats.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(lang(), o);
    } catch {
      f = new Intl.NumberFormat('en', { maximumFractionDigits: 2 });
    }
    formats.set(k, f);
  }
  return f;
}

/** A number as the app's language writes it (1,250.5); at most two decimals unless told. */
export const fmtNum = (n: number | null | undefined, o: Intl.NumberFormatOptions = {}): string => (n === null || n === undefined || !Number.isFinite(n) ? '' : numberFormat({ maximumFractionDigits: 2, ...o }).format(n));
/** A number written short: 1.2K, 3.4M. */
export const compact = (n: number | null | undefined): string => fmtNum(n, { notation: 'compact', maximumFractionDigits: 1 });
/** An amount of money in a currency (an ISO code, "USD"; a symbol is written before it as it is). */
export function fmtMoney(n: number | null | undefined, currency?: string, o: Intl.NumberFormatOptions = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const c = str(currency).trim();
  if (/^[A-Za-z]{3}$/.test(c)) {
    // Cents where an amount has them and its currency uses them, up to 100,000 (an invoice's €4,712.40); none on whole
    // amounts, nor on large ones, nor in a currency without them (¥).
    try {
      const minor = numberFormat({ style: 'currency', currency: c.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2;
      const digits = Number.isInteger(n) || Math.abs(n) >= 100_000 ? 0 : minor;
      const max = o.maximumFractionDigits ?? digits;
      return numberFormat({ style: 'currency', currency: c.toUpperCase(), ...o, minimumFractionDigits: Math.min(o.minimumFractionDigits ?? digits, max), maximumFractionDigits: max }).format(n);
    } catch {}
  }
  return `${c}${fmtNum(n, { maximumFractionDigits: 2, ...o })}`;
}
/** A number with what goes before and after it ("$", " km", "%"): a unit of letters takes a space, a sign does not. */
export function withUnit(n: number | null | undefined, unit?: string, prefix?: string, o?: Intl.NumberFormatOptions): string {
  const v = fmtNum(n, o);
  if (!v) return '';
  const u = str(unit);
  return `${str(prefix)}${v}${u ? (/^[%°′″‰]|^\s/.test(u) ? u : `\u202f${u}`) : ''}`;
}
/** 0.25 as 25%: a share as a percentage (a number above 1 is taken as one already). */
export const pct = (n: number | null | undefined, digits = 0): string => (n === null || n === undefined ? '' : `${fmtNum(Math.abs(n) <= 1 ? n * 100 : n, { maximumFractionDigits: digits })}%`);

/** A date or date and time as agents write them (2026-11-20, 2026-11-20T18:30): a day at noon, so no time zone moves it. */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return Number.isFinite(v) ? new Date(v) : null;
  const t = str(v).trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00`);
  if (/^\d{4}-\d{2}$/.test(t)) return new Date(`${t}-01T12:00:00`);
  if (!/\d{4}/.test(t)) return null;
  const d = new Date(t.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: { day: 'numeric', month: 'short' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  weekday: { weekday: 'short' },
  longWeekday: { weekday: 'long' },
  day: { day: 'numeric' },
  month: { month: 'short' },
  monthYear: { month: 'long', year: 'numeric' },
  dayMonth: { weekday: 'short', day: 'numeric', month: 'short' },
  time: { hour: 'numeric', minute: '2-digit' },
  dateTime: { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
};

/** A date as the app's language writes it, in a style; text that is not a date as it is. */
export function fmtDate(v: unknown, style: keyof typeof DATE_STYLES = 'medium'): string {
  const d = parseDate(v);
  if (!d) return str(v);
  try {
    return new Intl.DateTimeFormat(lang(), DATE_STYLES[style]).format(d);
  } catch {
    return d.toDateString();
  }
}
/** A time of day: "14:30" as the app's language writes it (2:30 PM), a date and time by its time. */
export function fmtTime(v: unknown): string {
  const t = str(v).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m) {
    const d = new Date(2000, 0, 1, Number(m[1]), Number(m[2]));
    return fmtDate(d, 'time');
  }
  return parseDate(t) && /T|\d:\d/.test(t) ? fmtDate(t, 'time') : t;
}
/** Minutes as "1 h 35 min" (numbers only; text as it is). */
export function fmtMinutes(v: unknown): string {
  const n = num(v);
  if (n === null) return str(v);
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

// ---- tones ---------------------------------------------------------------------------------------------------------

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'accent' | 'neutral';

/** A tone from the words agents use for one ("ok", "warning", "danger", "on track", "blocked"…); neutral otherwise. */
export function toneOf(v: unknown): Tone {
  const s = str(v).trim().toLowerCase();
  if (/^(good|ok|okay|success|pass|passed|go|green|positive|done|complete|completed|on[- ]track|up|healthy|operational|yes|safe|low risk|excellent|great|open)$/.test(s)) return 'good';
  if (/^(warn|warning|caution|careful|medium|amber|yellow|at[- ]risk|degraded|partial|moderate|fair|pending|maybe)$/.test(s)) return 'warn';
  if (/^(bad|error|danger|fail|failed|failing|no[- ]?go|critical|red|negative|blocked|down|outage|high risk|poor|closed|no|severe|stop)$/.test(s)) return 'bad';
  if (/^(info|note|blue|notice|neutral info|tip)$/.test(s)) return 'info';
  if (/^(accent|highlight|pick|best|primary|important)$/.test(s)) return 'accent';
  return 'neutral';
}

/** A tone's text and soft background (Tailwind classes). */
export const TONE: Record<Tone, string> = {
  good: 'text-ok bg-ok/12',
  warn: 'text-warn bg-warn/12',
  bad: 'text-err bg-err/12',
  info: 'text-info bg-info/12',
  accent: 'text-accent bg-accent-soft',
  neutral: 'text-fg-2 bg-bg-2',
};
/** A tone's solid colour (for a dot, a bar, a ring). */
export const TONE_FILL: Record<Tone, string> = { good: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--err)', info: 'var(--info)', accent: 'var(--accent)', neutral: 'var(--fg-3)' };

/** The colour of a series by its place: the house palette's eight hues, in their fixed order (never cycled past eight). */
export const seriesColor = (i: number) => `var(--viz-${(Math.max(0, i) % 8) + 1})`;

// ---- Markdown in a field --------------------------------------------------------------------------------------------

const remarkPlugins = [remarkGfm, [remarkMath, { singleDollarTextMath: true }]] as any;
const rehypePlugins = [[rehypeKatex, { throwOnError: false, strict: 'ignore', output: 'html' }]] as any;
const link = ({ href, children }: { href?: string; children?: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);
const blockParts = { a: link } as any;
const inlineParts = { a: link, p: ({ children }: { children?: ReactNode }) => <>{children}</> } as any;
/** Text with nothing Markdown would change: drawn as it is, without the parser. */
const PLAIN = /^[^*_`$\[\]<>#|~\\\n!]*$/;

/**
 * An agent's text in Markdown (bold, links, `code`, $maths$, lists): `inline` for a line inside something (no paragraph
 * around it). Plain words skip the parser.
 */
export const Md = memo(function Md({ text, inline, className }: { text: unknown; inline?: boolean; className?: string }) {
  const t = str(text);
  if (!t.trim()) return null;
  if (PLAIN.test(t) && !/^\s*([-+*]|\d+[.)])\s/.test(t)) return inline ? <span className={className}>{t}</span> : <p className={cx('aui-p', className)}>{t}</p>;
  const src = normalizeMath(t, true);
  return inline ? (
    <span className={cx('aui-md aui-md-inline', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={inlineParts}>
        {src.replace(/\n+/g, ' ')}
      </ReactMarkdown>
    </span>
  ) : (
    <div className={cx('aui-md', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={blockParts}>
        {src}
      </ReactMarkdown>
    </div>
  );
});

// ---- pictures --------------------------------------------------------------------------------------------------------

/** Where a picture loads from here (the web through this server, a file of this computer); null when it may not. */
export function usePicUrl(src: unknown): string | null {
  const { cwd, offline } = useAui();
  const from = str(src).trim();
  return useMemo(() => (!from || (offline && /^https?:\/\//i.test(from)) ? null : replyPicture(from, cwd)), [from, cwd, offline]);
}

/**
 * How long a picture that did not load waits before it is asked for again: a site that limits its rate (Wikimedia, when a
 * reply holds many of its pictures) answers again a little later, and this server forgets such a failure in 15 seconds.
 */
const PIC_RETRIES = [3_000, 16_000];

// Which pictures are failing now (waiting for a retry, or given up on): a Pic tells here, and what is laid out around a
// picture (a frame, a column, a gallery's cell) asks, so nothing stays behind as an empty box. Keyed by the address.
const failing = new Map<string, number>();
const watchers = new Set<() => void>();
let failRev = 0;
function markFailing(url: string, by: 1 | -1) {
  const n = (failing.get(url) ?? 0) + by;
  if (n > 0) failing.set(url, n);
  else failing.delete(url);
  failRev++;
  watchers.forEach((f) => f());
}
const watchFailing = (f: () => void) => {
  watchers.add(f);
  return () => void watchers.delete(f);
};

/**
 * For each of `srcs`: is there a picture to show (an address it may load from, and it has not failed)? A Pic draws
 * nothing for one that is not, so give what frames a picture a way to leave it out. A picture that failed is asked for
 * again after a while: keep its Pic in the tree (hide what is around it with `hidden`, do not remove it), and it comes
 * back by itself if the retry works. It is true while a picture is still loading.
 */
export function usePicsOk(srcs: unknown[]): boolean[] {
  const { cwd, offline } = useAui();
  useSyncExternalStore(watchFailing, () => failRev);
  return srcs.map((s) => {
    const from = str(s).trim();
    if (!from || (offline && /^https?:\/\//i.test(from))) return false;
    const url = replyPicture(from, cwd);
    return !!url && !failing.has(url);
  });
}

/** Is there a picture to show for `src` (see usePicsOk)? */
export function usePicOk(src: unknown): boolean {
  return usePicsOk([src])[0];
}

/**
 * What only makes sense with its picture (a frame, a column, a gallery's cell, an entry that is nothing but a picture):
 * `src` is that picture. It stays in the tree, so the picture's Pic inside keeps retrying, but it is hidden while there
 * is no picture to show (unless `keep`: it has other things in it, and only the picture is left out).
 */
export function WithPic({ src, as: Tag = 'div', keep, className, children, ...rest }: { src: unknown; as?: 'div' | 'li' | 'span' | 'figure' | 'button' | 'a'; keep?: boolean; className?: string; children: ReactNode } & Record<string, unknown>) {
  const ok = usePicOk(src);
  const T = Tag as 'div';
  return (
    <T {...rest} className={cx(className, !ok && !keep && 'hidden')}>
      {children}
    </T>
  );
}

/**
 * A picture: fitted to its box (`className` sizes it), opened large on a click (with the others of `group`, by their
 * addresses as given). Nothing at all when there is none or it cannot load (the picture appears if a retry works), so
 * what is laid out around it must not depend on it being there (usePicOk, WithPic).
 */
export function Pic({ src, alt, className, group, fit = 'cover', zoom = true }: { src: unknown; alt?: string; className?: string; group?: unknown[]; fit?: 'cover' | 'contain'; zoom?: boolean }) {
  const { cwd, offline } = useAui();
  const base = usePicUrl(src);
  // Each try has an address of its own, so the browser does not answer it with the failure it remembers.
  const [tries, setTries] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setTries(0);
    setFailed(false);
  }, [base]);
  useEffect(() => {
    if (!failed || !base) return;
    markFailing(base, 1);
    return () => markFailing(base, -1);
  }, [failed, base]);
  useEffect(() => {
    if (!failed || tries >= PIC_RETRIES.length || !base || base.startsWith('data:')) return;
    const t = setTimeout(() => {
      setTries((n) => n + 1);
      setFailed(false);
    }, PIC_RETRIES[tries]);
    return () => clearTimeout(t);
  }, [failed, tries, base]);
  const url = base && tries ? `${base}${base.includes('?') ? '&' : '?'}try=${tries}` : base;
  if (!url || failed) return null;
  const open = () => {
    const list = (group?.length ? group : [src]).map((s) => ({ from: str(s), url: offline && /^https?:/i.test(str(s)) ? null : replyPicture(str(s), cwd) })).filter((x): x is { from: string; url: string } => !!x.url);
    const at = Math.max(0, list.findIndex((x) => x.url === base));
    openLightbox(
      list.map((x) => ({ src: x.url, name: alt || undefined, href: /^https?:\/\//i.test(x.from) ? x.from : undefined })),
      at,
    );
  };
  return (
    <img
      src={url}
      alt={alt ?? ''}
      loading={tries ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      onClick={zoom ? open : undefined}
      className={cx('aui-pic', fit === 'contain' && 'aui-pic-contain', zoom && 'cursor-zoom-in', className)}
    />
  );
}

/** A name's initials: "Maya Okafor" → "MO", "Arsenal" → "A" (words in brackets left out). */
export function initials(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = [...(parts[0] ?? '')][0] ?? '';
  const last = parts.length > 1 ? ([...parts[parts.length - 1]][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** A person's picture, or their initials on a quiet disc (`className` sizes it), also when the picture cannot load. */
export function Avatar({ name, image, className }: { name: string; image?: unknown; className?: string }) {
  const ok = usePicOk(image);
  return (
    <>
      {str(image).trim() && <Pic src={image} alt={name} className={cx('shrink-0 rounded-full', className)} />}
      {!ok && (
        <span aria-hidden className={cx('grid shrink-0 place-items-center rounded-full bg-bg-2 font-semibold text-fg-2 select-none', className)}>
          {initials(name)}
        </span>
      )}
    </>
  );
}

// ---- small pieces ------------------------------------------------------------------------------------------------------

/** A chip: a short label in a tone (a tag, a status, a badge). */
export function Chip({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11.5px] leading-[1.35] font-medium', TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Stars for a rating out of `max` (5), filled to the tenth, with the number beside them unless `bare`. */
export function Stars({ value, max = 5, size = 13, bare, count }: { value: unknown; max?: number; size?: number; bare?: boolean; count?: unknown }) {
  const v = num(value);
  if (v === null) return null;
  const out = Math.max(1, Math.round(num(max) ?? 5));
  const share = Math.max(0, Math.min(1, v / out));
  const n = num(count);
  return (
    <span className="inline-flex items-center gap-1 align-middle" title={`${fmtNum(v, { maximumFractionDigits: 1 })} / ${out}`}>
      <span className="relative inline-flex" aria-hidden>
        <span className="inline-flex text-line-2">
          {Array.from({ length: Math.min(out, 10) }, (_, i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
          ))}
        </span>
        <span className="absolute inset-0 inline-flex overflow-hidden text-[#e8a317]" style={{ width: `${share * 100}%` }}>
          {Array.from({ length: Math.min(out, 10) }, (_, i) => (
            <Star key={i} size={size} fill="currentColor" strokeWidth={0} className="shrink-0" />
          ))}
        </span>
      </span>
      {!bare && <span className="text-[12px] font-medium text-fg-2 tabular-nums">{fmtNum(v, { maximumFractionDigits: 1 })}</span>}
      {n !== null && <span className="text-[12px] text-fg-3">({compact(n)})</span>}
    </span>
  );
}

/** A change: ▲ +3.2% in green when up is good (`good`: "up" unless "down"), red when it is bad. */
export function Delta({ value, unit = '', good = 'up', className }: { value: unknown; unit?: string; good?: 'up' | 'down' | 'none'; className?: string }) {
  const n = num(value);
  const t = str(value).trim();
  if (n === null && !t) return null;
  const sign = n === null ? (/^[-−▼↓]/.test(t) ? -1 : /^[+▲↑]/.test(t) ? 1 : 0) : Math.sign(n);
  const better = good === 'none' || sign === 0 ? 'neutral' : (sign > 0) === (good !== 'down') ? 'good' : 'bad';
  const shown = n === null ? t.replace(/^[▲▼↑↓]\s*/, '') : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtNum(Math.abs(n), { maximumFractionDigits: 2 })}${unit}`;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[12.5px] font-medium tabular-nums', better === 'good' ? 'text-ok' : better === 'bad' ? 'text-err' : 'text-fg-3', className)}>
      {sign > 0 ? '▲' : sign < 0 ? '▼' : ''}
      {shown}
    </span>
  );
}

/** A bar filled to `value` of `max`: progress, a share, a score. */
export function Meter({ value, max = 100, tone, color, className, thin }: { value: unknown; max?: number; tone?: Tone; color?: string; className?: string; thin?: boolean }) {
  const v = num(value) ?? 0;
  const m = num(max) || 100;
  const share = Math.max(0, Math.min(1, v / m));
  return (
    <span className={cx('block overflow-hidden rounded-full bg-bg-3', thin ? 'h-1.5' : 'h-2', className)} role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={m}>
      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${share * 100}%`, background: color ?? (tone ? TONE_FILL[tone] : 'var(--viz-1)') }} />
    </span>
  );
}

/** A ring filled to `value` of `max`, with what it says in the middle. */
export function Ring({ value, max = 100, size = 64, stroke = 6, tone, children }: { value: unknown; max?: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode }) {
  const v = num(value) ?? 0;
  const m = num(max) || 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = Math.max(0, Math.min(1, v / m));
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone ? TONE_FILL[tone] : 'var(--viz-1)'} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} className="transition-[stroke-dasharray] duration-500" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center leading-none">{children}</span>
    </span>
  );
}

/** Rows of a label and its value (a fact sheet's facts, a spec list). */
export function KeyValues({ rows, className, cols = 1 }: { rows: { label: unknown; value: unknown; note?: unknown }[]; className?: string; cols?: 1 | 2 }) {
  const list = rows.filter((r) => str(r.label) || str(r.value));
  if (!list.length) return null;
  return (
    <dl className={cx('grid gap-x-6', cols === 2 ? '@md:grid-cols-2' : '', className)}>
      {list.map((r, i) => (
        <div key={i} className="flex min-w-0 items-baseline justify-between gap-4 border-b border-line/70 py-1.5 text-[13.5px] last:border-b-0">
          <dt className="shrink-0 text-fg-3">{str(r.label)}</dt>
          <dd className="m-0 min-w-0 text-right font-medium text-fg">
            <Md text={r.value} inline />
            {str(r.note) && <span className="block text-[12px] font-normal text-fg-3">{str(r.note)}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A heading inside a UI. */
export function Section({ title, children, className, aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={cx('min-w-0', className)}>
      {(title || aside) && (
        <div className="mb-2 flex items-baseline justify-between gap-3">
          {title && <h4 className="aui-h4">{title}</h4>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** A UI's card: the panel it sits on. */
export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx('aui-card', pad && 'p-4 @lg:p-5', className)}>{children}</div>;
}

/** A UI's title, with a line under it and something on its right. */
export function Head({ title, sub, kicker, aside, className }: { title?: unknown; sub?: unknown; kicker?: unknown; aside?: ReactNode; className?: string }) {
  if (!str(title) && !str(sub) && !str(kicker) && !aside) return null;
  return (
    <div className={cx('mb-3 flex min-w-0 items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {str(kicker) && <div className="mb-0.5 text-[11.5px] font-semibold tracking-wide text-accent uppercase">{str(kicker)}</div>}
        {str(title) && <h3 className="aui-h3">{str(title)}</h3>}
        {str(sub) && <Md text={sub} className="mt-0.5 text-[13px] text-fg-3" inline />}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** Choices side by side, one picked: a segmented control. */
export function Seg<T extends string | number>({ options, value, onChange, className, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cx('inline-flex max-w-full overflow-x-auto rounded-lg bg-bg-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'shrink-0 rounded-md font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-[12px]' : 'px-2.5 py-1 text-[12.5px]',
            o.value === value ? 'bg-panel text-fg shadow-sm' : 'text-fg-3 hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A button inside a UI: plain, or `primary`. */
export function Btn({ children, onClick, primary, icon, className, disabled, title }: { children?: ReactNode; onClick?: () => void; primary?: boolean; icon?: ReactNode; className?: string; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        primary ? 'bg-accent text-accent-fg hover:opacity-90' : 'border border-line bg-panel text-fg hover:bg-bg-2',
        // An icon alone is a square; padding only around words (both utilities would otherwise fight over it).
        children ? 'px-3' : 'w-8',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Puts words in the session's message box (the user sends them, or changes them first); with `send`, an empty box sends them at once. */
export function useAsk(): (text: string, opts?: { send?: boolean }) => void {
  const { sessionKey, demo } = useAui();
  return useCallback(
    (text: string, opts?: { send?: boolean }) => {
      if (demo || !sessionKey) {
        toast(tr('In a conversation, this goes to your message box'), 'info');
        return;
      }
      composeInsert(text, sessionKey, undefined, opts);
    },
    [sessionKey, demo],
  );
}

/** A button that puts words in the message box ("Tell me more about …"). */
export function Ask({ text, children, className, primary }: { text: string; children?: ReactNode; className?: string; primary?: boolean }) {
  const ask = useAsk();
  return (
    <Btn primary={primary} icon={<MessageSquarePlus size={14} />} onClick={() => ask(text)} className={className} title={children ? undefined : tr('Ask about this')}>
      {children}
    </Btn>
  );
}

/** A link out, opening in a tab of its own. */
export function LinkOut({ url, children, className, icon = true }: { url: unknown; children?: ReactNode; className?: string; icon?: boolean }) {
  const u = str(url).trim();
  if (!/^https?:\/\//i.test(u) && !/^mailto:/i.test(u)) return children ? <span className={className}>{children}</span> : null;
  let host = u;
  try {
    host = new URL(u).hostname.replace(/^www\./, '');
  } catch {}
  return (
    <a href={u} target="_blank" rel="noopener noreferrer" className={cx('inline-flex min-w-0 items-center gap-1 text-accent hover:underline', className)}>
      <span className="truncate">{children ?? host}</span>
      {icon && <ExternalLink size={12} className="shrink-0 opacity-70" />}
    </a>
  );
}

/** A link's site: "example.com". */
export const hostOf = (url: unknown): string => {
  try {
    return new URL(str(url)).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The copy button of the replies, for a part of a UI. */
export function Copy({ text, label }: { text: string | (() => string); label?: string }) {
  return <CopyButton text={text} label={label ?? tr('Copy')} />;
}

/** The first `n` of a list, and a button that shows the rest. */
export function More<T>({ items, n = 6, render, className, more }: { items: T[]; n?: number; render: (x: T, i: number) => ReactNode; className?: string; more?: string }) {
  const [all, setAll] = useState(false);
  const shown = all || items.length <= n + 1 ? items : items.slice(0, n);
  return (
    <>
      <div className={className}>{shown.map(render)}</div>
      {shown.length < items.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
          <ChevronDown size={14} />
          {more ?? tr('Show all {0}').replace('{0}', String(items.length))}
        </button>
      )}
    </>
  );
}

// ---- videos ---------------------------------------------------------------------------------------------------------

/** A YouTube video's id, from any of its addresses. */
export const youTubeId = (url: string) => /youtube-nocookie\.com\/embed\/([\w-]{6,20})/.exec(videoEmbed(url) ?? '')?.[1] ?? null;

/**
 * A video: YouTube or Vimeo plays in place once clicked (until then a still, so a reply with several loads none of
 * them), a file on this computer plays here, any other address opens in a tab of its own.
 */
export function Video({ url, title, poster, start, className }: { url: unknown; title?: unknown; poster?: unknown; start?: number; className?: string }) {
  const { offline, cwd } = useAui();
  const u = str(url).trim();
  const [on, setOn] = useState(false);
  const embed = !offline ? videoEmbed(u) : null;
  const yt = embed ? youTubeId(u) : null;
  const still = usePicUrl(str(poster) || (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : ''));
  useEffect(() => setOn(false), [u]);
  if (!u) return null;
  if (embed) {
    const src = `${embed}${embed.includes('?') ? '&' : '?'}autoplay=1${start ? `&start=${Math.floor(start)}` : ''}`;
    return (
      <div className={cx('aui-video', className)}>
        {on ? (
          <iframe src={src} title={str(title) || tr('Video')} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 h-full w-full border-0" />
        ) : (
          <button type="button" onClick={() => setOn(true)} className="group/v absolute inset-0 grid h-full w-full place-items-center" aria-label={`${tr('Play')}${str(title) ? `: ${str(title)}` : ''}`}>
            {still && <img src={still} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
            <span className="relative grid h-12 w-12 place-items-center rounded-full bg-black/65 text-white shadow-lg transition-transform group-hover/v:scale-105">
              <Play size={20} fill="currentColor" className="ml-0.5" />
            </span>
          </button>
        )}
      </div>
    );
  }
  const local = !/^[a-z][a-z0-9+.-]*:/i.test(u) || /^file:/i.test(u);
  if (local) {
    const file = u.replace(/^file:\/\//i, '');
    const path = file.startsWith('/') || !cwd ? file : `${cwd.replace(/\/$/, '')}/${file}`;
    return <video src={mu(`/api/fs/raw?path=${encodeURIComponent(path)}`)} controls preload="metadata" className={cx('aui-video-file', className)} />;
  }
  return (
    <LinkOut url={u} className="text-[13px]">
      {str(title) || tr('Watch the video')}
    </LinkOut>
  );
}

// ---- maps and Plotly figures (in the pages' sandboxed frame, loaded when first needed) ---------------------------------

const MapFrame = lazy(() => import('./frames').then((m) => ({ default: m.MapFrame })));
const PlotFrame = lazy(() => import('./frames').then((m) => ({ default: m.PlotFrame })));

export interface MapPoint {
  lat: number;
  lng: number;
  name?: string;
  note?: string;
  /** What sizes its circle on a map of values (MapBox's `sized`). */
  value?: number;
}

/** Points with a latitude and longitude, from items that may call them lat/lng, latitude/longitude or lon (with `value`, each its number there). */
export function mapPoints(items: unknown[], label = 'name', note = 'note', value?: string): MapPoint[] {
  const out: MapPoint[] = [];
  for (const it of items) {
    const o = obj(it);
    const lat = num(o.lat ?? o.latitude);
    const lng = num(o.lng ?? o.lon ?? o.long ?? o.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const v = value ? num(o[value]) : null;
    out.push({ lat, lng, name: textOf(o[label] ?? o.name ?? o.title), note: str(o[note] ?? o.address), ...(v !== null ? { value: v } : {}) });
  }
  return out;
}

/**
 * A map with the points (numbered unless `numbered` is false), joined in order when `route`, pinned at the first and
 * last only when `ends` (a route's shape), or as circles sized by their `value` when `sized`; drawn once the block is
 * whole. Nothing in a confidential session (nothing loads from the web there).
 */
export function MapBox({ points, route, numbered = true, ends, sized, height = 320, className }: { points: MapPoint[]; route?: boolean; numbered?: boolean; ends?: boolean; sized?: boolean; height?: number; className?: string }) {
  const { offline, done } = useAui();
  if (offline || !points.length) return null;
  return (
    <div className={cx('aui-map', className)} style={{ height }}>
      {done ? (
        <Suspense fallback={null}>
          <MapFrame points={points} route={route} numbered={numbered} ends={ends} sized={sized} height={height} />
        </Suspense>
      ) : null}
    </div>
  );
}

/** A Plotly figure ({ data, layout }), in 2D or 3D, drawn once the block is whole. */
export function PlotBox({ figure, height = 380, className }: { figure: Data; height?: number; className?: string }) {
  const { offline, done } = useAui();
  if (offline || !arr(figure.data).length) return null;
  return (
    <div className={cx('aui-plot', className)} style={{ minHeight: height }}>
      {done ? (
        <Suspense fallback={null}>
          <PlotFrame figure={figure} height={height} />
        </Suspense>
      ) : null}
    </div>
  );
}

// ---- state kept on this device, the time, speech ------------------------------------------------------------------------

const KEPT_INDEX = 'hydor.aui:index';
const KEPT_MAX = 400;

/** Notes that a key was used now; past KEPT_MAX, the least recently used are forgotten. */
function touchKept(key: string) {
  try {
    const idx = JSON.parse(localStorage.getItem(KEPT_INDEX) ?? '{}') as Record<string, number>;
    idx[key] = Date.now();
    const keys = Object.keys(idx);
    if (keys.length > KEPT_MAX)
      for (const k of keys.sort((a, b) => idx[a] - idx[b]).slice(0, keys.length - KEPT_MAX)) {
        localStorage.removeItem(k);
        delete idx[k];
      }
    localStorage.setItem(KEPT_INDEX, JSON.stringify(idx));
  } catch {}
}

/**
 * A UI's state kept on this device (ticks on a checklist, a quiz's answers): like useState, and there again when the
 * conversation is opened again. Kept once the block is whole (while it streams, only in memory).
 */
export function useKept<T>(name: string, init: T): [T, (v: T | ((prev: T) => T)) => void] {
  const { keep } = useAui();
  const key = keep ? `hydor.aui:${keep}:${name}` : '';
  const read = (): T => {
    if (!key) return init;
    try {
      const s = localStorage.getItem(key);
      return s === null ? init : (JSON.parse(s) as T);
    } catch {
      return init;
    }
  };
  const [v, setV] = useState<T>(read);
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setV(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (x: T | ((prev: T) => T)) =>
      setV((prev) => {
        const next = typeof x === 'function' ? (x as (p: T) => T)(prev) : x;
        if (keyRef.current)
          try {
            localStorage.setItem(keyRef.current, JSON.stringify(next));
            touchKept(keyRef.current);
          } catch {}
        return next;
      }),
    [],
  );
  return [v, set];
}

/** The time now, again every `ms` (a clock, a countdown). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Says words aloud with the device's own voices, in a language ("el", "ja-JP"). */
export function speak(text: string, language?: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (language) {
      u.lang = language;
      const v = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith(language.toLowerCase()));
      if (v) u.voice = v;
    }
    synth.speak(u);
  } catch {}
}

/** A button that says words aloud. */
export function SpeakBtn({ text, lang: language, className }: { text: string; lang?: string; className?: string }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return null;
  return (
    <button type="button" onClick={() => speak(text, language)} title={tr('Listen')} aria-label={tr('Listen')} className={cx('inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg', className)}>
      <Volume2 size={14} />
    </button>
  );
}

/** Saves text as a file (a calendar entry, a CSV). */
export function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

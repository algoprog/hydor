// The answer UIs for writing (emails, alternatives to pick from, social posts, changes to a text): their views, by name (shared/answer-ui/writing.ts has what each takes).
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bookmark, ChartNoAxesColumn, Check, Copy as CopyIcon, Ellipsis, Globe, Heart, ImageIcon, Lightbulb, Mail, MessageCircle, MessageSquare, Repeat2, Send, Share, Share2, Star, ThumbsUp } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { arr, Avatar, Btn, Card, Chip, Copy, fmtNum, Head, isObj, Md, num, Pic, Ring, Seg, str, textOf, useAsk, useKept, words, type AnswerUiView, type Data } from '../kit';

// ---- shared pieces ---------------------------------------------------------------------------------------------------

async function copyText(t: string) {
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
}

/** A copy button with its words on it. */
function CopyBtn({ text, label }: { text: string | (() => string); label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Btn
      icon={ok ? <Check size={13} className="text-ok" /> : <CopyIcon size={13} />}
      onClick={() => {
        void copyText(typeof text === 'function' ? text() : text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      {label}
    </Btn>
  );
}

/** Letters as people count them: an emoji or an accented letter is one. */
function chars(s: string): number {
  try {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;
  } catch {
    return [...s].length;
  }
}

// ---- an email ----------------------------------------------------------------------------------------------------------

/** Markdown as plain text for a mail app: no stars or brackets, a link as its words and its address. */
function plainText(md: string): string {
  return md
    .replace(/\r\n?/g, '\n')
    .replace(/^```[^\n]*\n?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\((\S+?)(?:\s+"[^"]*")?\)/g, (_, t: string, u: string) => (t === u || `mailto:${t}` === u ? t : `${t} (${u})`))
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!$>~|])/g, '$1');
}

/** One line break in an email is a line break (Markdown would join the lines): "Thanks,\nAlex". */
const hardBreaks = (s: string) => s.replace(/([^\n])\n(?=[^\n])/g, '$1  \n');

const emails = (s: string) => s.match(/[^\s<>,;"()]+@[^\s<>,;"()]+\.[^\s<>,;"()]+/g) ?? [];

function mailto(to: string, cc: string, bcc: string, subject: string, body: string): string {
  const q = [
    emails(cc).length ? `cc=${encodeURIComponent(emails(cc).join(','))}` : '',
    emails(bcc).length ? `bcc=${encodeURIComponent(emails(bcc).join(','))}` : '',
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}` : '',
  ].filter(Boolean);
  return `mailto:${emails(to).map(encodeURIComponent).join(',')}${q.length ? `?${q.join('&')}` : ''}`;
}

function MailRow({ label, children, aside, strong }: { label: string; children: ReactNode; aside?: ReactNode; strong?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3 border-b border-line/70 py-2 text-[13.5px] last:border-b-0">
      <span className="w-14 shrink-0 text-[12.5px] text-fg-3">{label}</span>
      <span className={cx('min-w-0 flex-1 break-words', strong && 'font-semibold')}>{children}</span>
      {aside}
    </div>
  );
}

function Email({ data, done }: { data: Data; done: boolean }) {
  const main = {
    label: str(data.label) || tr('Draft'),
    subject: str(data.subject),
    body: str(data.body ?? data.text),
  };
  const versions = [
    main,
    ...arr(data.variants ?? data.versions)
      .filter(isObj)
      .map((v, i) => ({
        label: str(v.label ?? v.name) || String(i + 2),
        subject: str(v.subject) || main.subject,
        body: str(v.body ?? v.text),
      })),
  ];
  const [pick, setPick] = useKept<number>('version', 0);
  const at = Math.min(Math.max(0, num(pick) ?? 0), versions.length - 1);
  const v = versions[at];
  const to = str(data.to);
  const cc = str(data.cc);
  const bcc = str(data.bcc);
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 @lg:px-5">
        <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-fg-3">
          <Mail size={14} />
          {tr('Email draft')}
        </span>
        {versions.length > 1 && <Seg size="sm" options={versions.map((x, i) => ({ value: i, label: x.label }))} value={at} onChange={setPick} />}
      </div>
      <div className="px-4 @lg:px-5">
        {to && <MailRow label={tr('To')}>{to}</MailRow>}
        {cc && <MailRow label={tr('Cc')}>{cc}</MailRow>}
        {bcc && <MailRow label={tr('Bcc')}>{bcc}</MailRow>}
        {v.subject && (
          <MailRow label={tr('Subject')} strong aside={done ? <Copy text={v.subject} label={tr('Copy the subject')} /> : undefined}>
            {v.subject}
          </MailRow>
        )}
      </div>
      {v.body && (
        <div className="border-t border-line px-4 py-4 @lg:px-5">
          <Md text={hardBreaks(v.body)} className="text-[14px] text-fg" />
        </div>
      )}
      {done && (v.body || v.subject) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-bg-1 px-4 py-2.5 @lg:px-5">
          <a href={mailto(to, cc, bcc, v.subject, plainText(v.body))} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-accent-fg transition-opacity hover:opacity-90">
            <Send size={13} />
            {tr('Open in mail app')}
          </a>
          <CopyBtn text={() => plainText(v.body)} label={tr('Copy the text')} />
        </div>
      )}
    </Card>
  );
}

// ---- options to pick from --------------------------------------------------------------------------------------------

function Variants({ data, done }: { data: Data; done: boolean }) {
  const items = arr(data.items ?? data.options ?? data.variants)
    .map((x) => (isObj(x) ? x : { text: str(x) }))
    .filter((x) => textOf(x, 'text', 'title', 'name'));
  const limit = num(data.limit);
  const [picked, setPicked] = useKept<number | null>('picked', null);
  const ask = useAsk();
  return (
    <Card>
      <Head kicker={data.kind} title={data.title} aside={limit ? <Chip>{tr('Up to {0} characters').replace('{0}', fmtNum(limit))}</Chip> : undefined} />
      <ol className="m-0 list-none space-y-2 p-0">
        {items.map((it, i) => {
          const text = textOf(it, 'text', 'title', 'name');
          const n = chars(text);
          const over = limit !== null && n > limit;
          const chosen = picked === i;
          return (
            <li key={i} className={cx('flex gap-3 rounded-xl border px-3 py-2.5 transition-colors', chosen ? 'border-accent bg-accent-soft' : 'border-line')}>
              <span className={cx('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12px] font-semibold', chosen ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3')}>{chosen ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] leading-snug font-medium text-fg">{text}</div>
                {str(it.note) && <Md text={it.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {str(it.tag) && <Chip>{str(it.tag)}</Chip>}
                  <span className={cx('text-[11.5px] tabular-nums', over ? 'font-semibold text-err' : 'text-fg-3')}>{limit ? `${fmtNum(n)}/${fmtNum(limit)}` : tr('{0} characters').replace('{0}', fmtNum(n))}</span>
                </div>
              </div>
              {done && (
                <div className="flex shrink-0 items-start gap-1">
                  <span className="mt-1">
                    <Copy text={text} />
                  </span>
                  <Btn
                    primary={chosen}
                    className="h-7 px-2.5 text-[12px]"
                    onClick={() => {
                      setPicked(i);
                      ask(tr('Let’s go with this one: “{0}”').replace('{0}', text));
                    }}
                  >
                    {tr('Pick')}
                  </Btn>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- a social media post -------------------------------------------------------------------------------------------------

const URLS = /https?:\/\/[^\s]+/g;
/** Wide letters (Chinese, Japanese, Korean) and emoji count twice on X. */
const WIDE = /\p{Extended_Pictographic}|[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/** The length X gives a post: a link is 23, a wide letter or an emoji 2. */
function xLength(s: string): number {
  let n = 0;
  const rest = s.replace(URLS, () => ((n += 23), ''));
  try {
    for (const g of new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    }).segment(rest))
      n += WIDE.test(g.segment) ? 2 : 1;
  } catch {
    n += [...rest].length;
  }
  return n;
}
/** Mastodon counts a link as 23. */
const mastodonLength = (s: string) => {
  let n = 0;
  return [...s.replace(URLS, () => ((n += 23), ''))].length + n;
};

interface Platform {
  name: string;
  limit: number;
  count: (s: string) => number;
  thread: boolean;
  actions: LucideIcon[];
}

const PLATFORMS: Record<string, Platform> = {
  x: {
    name: 'X',
    limit: 280,
    count: xLength,
    thread: true,
    actions: [MessageCircle, Repeat2, Heart, ChartNoAxesColumn, Share],
  },
  threads: {
    name: 'Threads',
    limit: 500,
    count: (s) => [...s].length,
    thread: true,
    actions: [Heart, MessageCircle, Repeat2, Send],
  },
  bluesky: {
    name: 'Bluesky',
    limit: 300,
    count: chars,
    thread: true,
    actions: [MessageCircle, Repeat2, Heart, Ellipsis],
  },
  mastodon: {
    name: 'Mastodon',
    limit: 500,
    count: mastodonLength,
    thread: true,
    actions: [MessageCircle, Repeat2, Star, Bookmark, Ellipsis],
  },
  linkedin: {
    name: 'LinkedIn',
    limit: 3000,
    count: (s) => [...s].length,
    thread: false,
    actions: [ThumbsUp, MessageSquare, Repeat2, Send],
  },
  facebook: {
    name: 'Facebook',
    limit: 63206,
    count: (s) => [...s].length,
    thread: false,
    actions: [ThumbsUp, MessageCircle, Share2],
  },
  instagram: {
    name: 'Instagram',
    limit: 2200,
    count: (s) => [...s].length,
    thread: false,
    actions: [Heart, MessageCircle, Send],
  },
};

function platformOf(v: unknown): Platform {
  const s = str(v)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const key = s === 'twitter' || s === 'tweet' ? 'x' : s === 'ig' ? 'instagram' : s === 'fb' ? 'facebook' : s === 'bsky' ? 'bluesky' : s;
  return PLATFORMS[key] ?? PLATFORMS.x;
}

const TAGS = /(https?:\/\/[^\s]+|(?<![\w&])[#＃][\p{L}\p{N}_]+|(?<![\w])@[\w.]+(?:@[\w.-]+\w)?)/u;

/** A post's words as the platform shows them: links, #tags and @names in the accent, links shortened. */
function PostText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TAGS);
  return (
    <div className={cx('break-words whitespace-pre-wrap', className)}>
      {parts.map((t, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{t}</Fragment>;
        const short = /^https?:/i.test(t) ? t.replace(/^https?:\/\/(www\.)?/i, '').replace(/^(.{26}).+$/, '$1…') : t;
        return (
          <span key={i} className="text-accent">
            {short}
          </span>
        );
      })}
    </div>
  );
}

/** Long text folded after a few lines, with a button for the rest (as LinkedIn, Facebook and Instagram do). */
function Folded({ text, lead }: { text: string; lead?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 300 || text.split('\n').length > 5;
  return (
    <div className="text-[14px] leading-[1.45]">
      <div className={cx(long && !open && 'line-clamp-3')}>
        {lead}
        <PostText text={text} className="inline" />
      </div>
      {long && !open && (
        <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-fg-3 hover:text-fg">
          {tr('…more')}
        </button>
      )}
    </div>
  );
}

/** Under a post: its length against the platform's limit, a copy button, and the agent's advice for it. */
function PostTools({ text, p, note, done, actions }: { text: string; p: Platform; note: unknown; done: boolean; actions?: boolean }) {
  const n = p.count(text);
  const over = n > p.limit;
  return (
    <>
      <div className="mt-2 flex items-center gap-3">
        {actions && (
          <div className="flex min-w-0 flex-1 items-center gap-6 text-fg-3" aria-hidden>
            {p.actions.map((I, i) => (
              <I key={i} size={15} />
            ))}
          </div>
        )}
        {!actions && <span className="flex-1" />}
        <span className={cx('inline-flex items-center gap-1.5 text-[11.5px] tabular-nums', over ? 'font-semibold text-err' : 'text-fg-3')}>
          {p.limit <= 3000 && <Ring value={Math.min(n, p.limit)} max={p.limit} size={18} stroke={2.5} tone={over ? 'bad' : n > p.limit * 0.9 ? 'warn' : 'info'} />}
          {`${fmtNum(n)}/${fmtNum(p.limit)}`}
        </span>
        {done && text && <Copy text={text} />}
      </div>
      {str(note) && (
        <div className="mt-2 flex gap-1.5 rounded-lg bg-bg-1 px-2.5 py-1.5 text-[12.5px] text-fg-2">
          <Lightbulb size={13} className="mt-0.5 shrink-0 text-fg-3" />
          <Md text={note} inline />
        </div>
      )}
    </>
  );
}

interface Post {
  text: string;
  image: string;
  alt: string;
  note: unknown;
}

function SocialPost({ data, done }: { data: Data; done: boolean }) {
  const p = platformOf(data.platform);
  const a = isObj(data.author) ? data.author : { name: str(data.author) };
  const name = textOf(a, 'name', 'title') || textOf(a, 'handle');
  const raw = str(a.handle);
  const handle = raw && !raw.startsWith('@') && p !== PLATFORMS.linkedin && p !== PLATFORMS.facebook ? `@${raw}` : raw;
  const posts: Post[] = arr(data.posts ?? data.thread ?? data.items)
    .map((x) => (isObj(x) ? x : { text: str(x) }))
    .map((x) => ({
      text: str(x.text ?? x.body),
      image: str(x.image),
      alt: str(x.alt),
      note: x.note,
    }))
    .filter((x) => x.text || x.image);
  if (!posts.length && (str(data.text) || str(data.image)))
    posts.push({
      text: str(data.text),
      image: str(data.image),
      alt: str(data.alt),
      note: data.note,
    });
  const igName = (raw || name).replace(/^@/, '');
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2 text-[12.5px] font-medium text-fg-3">
        <span>
          {p.name}
          {posts.length > 1 ? ` · ${(p.thread ? tr('A thread of {0}') : tr('{0} posts')).replace('{0}', String(posts.length))}` : ''}
        </span>
      </div>
      {p.thread
        ? posts.map((post, i) => {
            const last = i === posts.length - 1;
            return (
              <div key={i} className="flex gap-3 px-4 pt-3">
                <div className="flex flex-col items-center">
                  <Avatar name={name} image={a.avatar} className="h-10 w-10 text-[13px]" />
                  {!last && <span className="mt-1 w-0.5 flex-1 rounded-full bg-line-2" aria-hidden />}
                </div>
                <div className={cx('min-w-0 flex-1', last ? 'pb-3' : 'pb-4')}>
                  <div className="flex min-w-0 items-baseline gap-1.5 text-[13.5px]">
                    <span className="truncate font-semibold">{name}</span>
                    {handle && <span className="truncate text-fg-3">{handle}</span>}
                    <span className="shrink-0 text-fg-3">· {tr('now')}</span>
                  </div>
                  {post.text && <PostText text={post.text} className="mt-0.5 text-[14px] leading-[1.45]" />}
                  {post.image && <Pic src={post.image} alt={post.alt} className="mt-2.5 aspect-[16/9] w-full rounded-2xl border border-line" />}
                  <PostTools text={post.text} p={p} note={post.note} done={done} actions />
                </div>
              </div>
            );
          })
        : posts.map((post, i) => (
            <div key={i} className={cx(i > 0 && 'border-t-4 border-bg-1')}>
              {p === PLATFORMS.instagram ? (
                <>
                  <div className="flex items-center gap-2.5 px-3 py-2.5">
                    <Avatar name={name} image={a.avatar} className="h-8 w-8 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{igName}</span>
                    <Ellipsis size={16} className="text-fg-3" aria-hidden />
                  </div>
                  {post.image ? (
                    <Pic src={post.image} alt={post.alt} className="aspect-square w-full" />
                  ) : (
                    <div className="grid aspect-[4/3] w-full place-items-center bg-bg-2 text-fg-3" aria-hidden>
                      <ImageIcon size={28} className="opacity-50" />
                    </div>
                  )}
                  <div className="px-3 pt-2.5 pb-3">
                    <div className="flex items-center gap-4 text-fg" aria-hidden>
                      {p.actions.map((I, k) => (
                        <I key={k} size={20} />
                      ))}
                      <Bookmark size={20} className="ml-auto" />
                    </div>
                    {post.text && (
                      <div className="mt-2">
                        <Folded text={post.text} lead={<span className="mr-1.5 font-semibold">{igName}</span>} />
                      </div>
                    )}
                    <PostTools text={post.text} p={p} note={post.note} done={done} />
                  </div>
                </>
              ) : (
                <>
                  <div className="px-4 pt-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar name={name} image={a.avatar} className={cx(p === PLATFORMS.linkedin ? 'h-12 w-12 text-[15px]' : 'h-10 w-10 text-[13px]')} />
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold">{name}</div>
                        {p === PLATFORMS.linkedin && (str(a.headline) || handle) && <div className="truncate text-[12px] text-fg-3">{str(a.headline) || handle}</div>}
                        <div className="flex items-center gap-1 text-[12px] text-fg-3">
                          {tr('now')} · <Globe size={11} aria-hidden />
                        </div>
                      </div>
                    </div>
                    {post.text && (
                      <div className="mt-2.5">
                        <Folded text={post.text} />
                      </div>
                    )}
                  </div>
                  {post.image && <Pic src={post.image} alt={post.alt} className="mt-3 aspect-[1.91/1] w-full" />}
                  <div className="mx-4 mt-3 flex justify-around border-t border-line py-2 text-fg-3" aria-hidden>
                    {p.actions.map((I, k) => (
                      <I key={k} size={17} />
                    ))}
                  </div>
                  <div className="px-4 pb-3">
                    <PostTools text={post.text} p={p} note={post.note} done={done} />
                  </div>
                </>
              )}
            </div>
          ))}
    </Card>
  );
}

// ---- changes to a text ------------------------------------------------------------------------------------------------

/** The longest common subsequence of two lists, as the steps from one to the other: [0, i, j] same, [-1, i] gone, [1, j] new. */
function diffKeys(a: string[], b: string[]): [number, number, number][] {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const out: [number, number, number][] = [];
  for (let i = 0; i < s; i++) out.push([0, i, i]);
  const n = a.length - s - e;
  const m = b.length - s - e;
  // Past a few million cells (two long texts that share little), what lies between is shown as replaced.
  if (n && m && n * m <= 3_000_000) {
    const w = m + 1;
    const dp = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = a[s + i] === b[s + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[s + i] === b[s + j]) out.push([0, s + i++, s + j++]);
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) out.push([-1, s + i++, -1]);
      else out.push([1, -1, s + j++]);
    }
    for (; i < n; i++) out.push([-1, s + i, -1]);
    for (; j < m; j++) out.push([1, -1, s + j]);
  } else {
    for (let i = 0; i < n; i++) out.push([-1, s + i, -1]);
    for (let j = 0; j < m; j++) out.push([1, -1, s + j]);
  }
  for (let k = 0; k < e; k++) out.push([0, a.length - e + k, b.length - e + k]);
  return out;
}

/** A piece of a word-by-word diff: the same in both (with each side's spacing), gone, or new. */
type Piece = { t: 0; a: string; b: string } | { t: -1 | 1; v: string };

/** Words (with the spaces after them) and marks, compared by the words alone. */
const TOKEN = /^\s+|(?:[\p{L}\p{N}\p{M}_]+(?:['’][\p{L}\p{N}\p{M}_]+)*|[^\s\p{L}\p{N}\p{M}_])\s*/gu;

function wordDiff(before: string, after: string): Piece[] {
  const A = before.match(TOKEN) ?? [];
  const B = after.match(TOKEN) ?? [];
  const runs: { same: boolean; a: string; b: string; n: number }[] = [];
  for (const [t, i, j] of diffKeys(
    A.map((x) => x.trim()),
    B.map((x) => x.trim()),
  )) {
    let last = runs[runs.length - 1];
    if (!last || last.same !== (t === 0)) runs.push((last = { same: t === 0, a: '', b: '', n: 0 }));
    if (t <= 0) last.a += A[i];
    if (t >= 0) last.b += B[j];
    last.n++;
  }
  // A short word or a mark alone between two changes reads better as part of one change.
  for (let k = 1; k < runs.length - 1; k++) if (runs[k].same && runs[k].n === 1 && runs[k].b.trim().length <= 3 && !runs[k - 1].same && !runs[k + 1].same) runs[k].same = false;
  const out: Piece[] = [];
  let del = '';
  let add = '';
  const flush = () => {
    if (del) out.push({ t: -1, v: del });
    if (add) out.push({ t: 1, v: add });
    del = add = '';
  };
  for (const r of runs) {
    if (r.same) {
      flush();
      out.push({ t: 0, a: r.a, b: r.b });
    } else {
      del += r.a;
      add += r.b;
    }
  }
  flush();
  return out;
}

const DEL = 'rounded-[3px] bg-[var(--del-bg)] text-del line-through decoration-1 [box-decoration-break:clone]';
const ADD = 'rounded-[3px] bg-[var(--add-bg)] text-add [box-decoration-break:clone]';
const DEL_STRONG = 'rounded-[2px] bg-[var(--del-strong)]';
const ADD_STRONG = 'rounded-[2px] bg-[var(--add-strong)]';

/** Prose with its changes marked: `side` "a" shows the old text and what went, "b" the new and what came, both when unset. */
function ProseDiff({ pieces, side }: { pieces: Piece[]; side?: 'a' | 'b' }) {
  return (
    <div className="text-[14px] leading-[1.75] break-words whitespace-pre-wrap">
      {pieces.map((p, i) =>
        p.t === 0 ? (
          <Fragment key={i}>{side === 'a' ? p.a : p.b}</Fragment>
        ) : p.t < 0 ? (
          side !== 'b' && (
            <del key={i} className={DEL}>
              {p.v}
            </del>
          )
        ) : (
          side !== 'a' && (
            <ins key={i} className={cx(ADD, 'no-underline')}>
              {p.v}
            </ins>
          )
        ),
      )}
    </div>
  );
}

interface Line {
  no: number;
  text: string;
}
type Block = { same: true; a: Line[]; b: Line[] } | { same: false; del: Line[]; add: Line[] };

function lineBlocks(before: string, after: string): Block[] {
  const A = before.replace(/\r\n?/g, '\n').split('\n');
  const B = after.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  for (const [t, i, j] of diffKeys(A, B)) {
    let last = blocks[blocks.length - 1];
    if (t === 0) {
      if (!last || !last.same) blocks.push((last = { same: true, a: [], b: [] }));
      if (last.same) {
        last.a.push({ no: i + 1, text: A[i] });
        last.b.push({ no: j + 1, text: B[j] });
      }
    } else {
      if (!last || last.same) blocks.push((last = { same: false, del: [], add: [] }));
      if (!last.same) (t < 0 ? last.del : last.add).push(t < 0 ? { no: i + 1, text: A[i] } : { no: j + 1, text: B[j] });
    }
  }
  return blocks;
}

/** A changed line, with the words that changed against its pair marked more strongly (when the two are alike). */
function LineText({ text, pair, side }: { text: string; pair?: string; side: 'a' | 'b' }) {
  const pieces = useMemo(() => {
    if (pair === undefined || text.length + pair.length > 2000) return null;
    const ps = wordDiff(side === 'a' ? text : pair, side === 'a' ? pair : text);
    const same = ps.reduce((n, p) => n + (p.t === 0 ? p.b.trim().length : 0), 0);
    return same / Math.max(1, Math.max(text.trim().length, pair.trim().length)) >= 0.4 ? ps : null;
  }, [text, pair, side]);
  if (!pieces) return <>{text || ' '}</>;
  return (
    <>
      {pieces.map((p, i) =>
        p.t === 0 ? (
          <Fragment key={i}>{side === 'a' ? p.a : p.b}</Fragment>
        ) : (side === 'a') === p.t < 0 ? (
          <span key={i} className={side === 'a' ? DEL_STRONG : ADD_STRONG}>
            {p.v}
          </span>
        ) : null,
      )}
    </>
  );
}

const CONTEXT = 3;
const NUM = 'w-[1%] px-2 text-right align-top whitespace-nowrap text-fg-3 select-none';
const CODE = 'px-2 align-top break-words whitespace-pre-wrap [overflow-wrap:anywhere]';

/** Unchanged lines away from any change fold into one row (opened on a click). */
function sameParts(b: { a: Line[]; b: Line[] }, first: boolean, last: boolean, open: boolean): { show: number[]; fold: number; at: number } {
  const n = b.a.length;
  const all = Array.from({ length: n }, (_, i) => i);
  if (open || n <= (first || last ? CONTEXT : CONTEXT * 2) + 1) return { show: all, fold: 0, at: -1 };
  if (first && last) return { show: all, fold: 0, at: -1 };
  if (first) return { show: all.slice(n - CONTEXT), fold: n - CONTEXT, at: 0 };
  if (last) return { show: all.slice(0, CONTEXT), fold: n - CONTEXT, at: CONTEXT };
  return {
    show: [...all.slice(0, CONTEXT), ...all.slice(n - CONTEXT)],
    fold: n - CONTEXT * 2,
    at: CONTEXT,
  };
}

function FoldRow({ count, cols, onOpen }: { count: number; cols: number; onOpen: () => void }) {
  return (
    <tr>
      <td colSpan={cols} className="border-y border-line/70 bg-bg-1 px-2 py-0.5">
        <button type="button" onClick={onOpen} className="w-full text-left text-[11.5px] text-fg-3 hover:text-fg">
          ⋯ {tr('{0} unchanged lines').replace('{0}', fmtNum(count))}
        </button>
      </td>
    </tr>
  );
}

function CodeDiff({ blocks, split }: { blocks: Block[]; split: boolean }) {
  const [opened, setOpened] = useState<Record<number, boolean>>({});
  const cols = 4;
  const rows: ReactNode[] = [];
  blocks.forEach((b, bi) => {
    if (b.same) {
      const { show, fold, at } = sameParts(b, bi === 0, bi === blocks.length - 1, !!opened[bi]);
      show.forEach((k, idx) => {
        if (fold && idx === at) rows.push(<FoldRow key={`f${bi}`} count={fold} cols={cols} onOpen={() => setOpened((o) => ({ ...o, [bi]: true }))} />);
        rows.push(
          split ? (
            <tr key={`${bi}:${k}`}>
              <td className={NUM}>{b.a[k].no}</td>
              <td className={cx(CODE, 'border-r border-line/70')}>{b.a[k].text || ' '}</td>
              <td className={NUM}>{b.b[k].no}</td>
              <td className={CODE}>{b.b[k].text || ' '}</td>
            </tr>
          ) : (
            <tr key={`${bi}:${k}`}>
              <td className={NUM}>{b.a[k].no}</td>
              <td className={NUM}>{b.b[k].no}</td>
              <td className="w-3 text-center align-top text-fg-3 select-none"> </td>
              <td className={CODE}>{b.b[k].text || ' '}</td>
            </tr>
          ),
        );
      });
      if (fold && at >= show.length) rows.push(<FoldRow key={`f${bi}`} count={fold} cols={cols} onOpen={() => setOpened((o) => ({ ...o, [bi]: true }))} />);
    } else if (split) {
      for (let k = 0; k < Math.max(b.del.length, b.add.length); k++) {
        const d = b.del[k];
        const a = b.add[k];
        rows.push(
          <tr key={`${bi}:${k}`}>
            <td className={cx(NUM, d && 'bg-[var(--del-bg)]')}>{d?.no}</td>
            <td className={cx(CODE, 'border-r border-line/70', d ? 'bg-[var(--del-bg)]' : 'bg-bg-1/60')}>{d && <LineText text={d.text} pair={a?.text} side="a" />}</td>
            <td className={cx(NUM, a && 'bg-[var(--add-bg)]')}>{a?.no}</td>
            <td className={cx(CODE, a ? 'bg-[var(--add-bg)]' : 'bg-bg-1/60')}>{a && <LineText text={a.text} pair={d?.text} side="b" />}</td>
          </tr>,
        );
      }
    } else {
      b.del.forEach((d, k) =>
        rows.push(
          <tr key={`${bi}:d${k}`} className="bg-[var(--del-bg)]">
            <td className={NUM}>{d.no}</td>
            <td className={NUM} />
            <td className="w-3 text-center align-top text-del select-none">−</td>
            <td className={CODE}>
              <LineText text={d.text} pair={b.add[k]?.text} side="a" />
            </td>
          </tr>,
        ),
      );
      b.add.forEach((a, k) =>
        rows.push(
          <tr key={`${bi}:a${k}`} className="bg-[var(--add-bg)]">
            <td className={NUM} />
            <td className={NUM}>{a.no}</td>
            <td className="w-3 text-center align-top text-add select-none">+</td>
            <td className={CODE}>
              <LineText text={a.text} pair={b.del[k]?.text} side="b" />
            </td>
          </tr>,
        ),
      );
    }
  });
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-code-bg">
      <table className={cx('w-full border-collapse font-mono text-[12.5px] leading-[1.6]', split && 'table-fixed')}>
        {split && (
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-10" />
            <col />
          </colgroup>
        )}
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

const PROSE = /^(|text|txt|plain|plaintext|prose|md|markdown|none)$/i;

function Diff({ data, done }: { data: Data; done: boolean }) {
  const before = str(data.before ?? data.old ?? data.original);
  const after = str(data.after ?? data.new ?? data.revised);
  const code = !PROSE.test(str(data.lang ?? data.language).trim());
  const [mode, setMode] = useKept<'inline' | 'split'>('mode', 'inline');
  const split = mode === 'split';
  const pieces = useMemo(() => (done && !code ? wordDiff(before, after) : []), [done, code, before, after]);
  const blocks = useMemo(() => (done && code ? lineBlocks(before, after) : []), [done, code, before, after]);
  const notes = arr(data.notes)
    .map((n) => textOf(n))
    .filter(Boolean);
  // What changed, in words (prose) or lines (code).
  let added = 0;
  let removed = 0;
  if (code) for (const b of blocks) if (!b.same) ((added += b.add.length), (removed += b.del.length));
  if (!code)
    for (const p of pieces) {
      if (p.t === 0) continue;
      const n = (p.v.match(/[\p{L}\p{N}]+/gu) ?? []).length || 1;
      if (p.t > 0) added += n;
      else removed += n;
    }
  const tools = done && (before || after) && (
    <div className="flex items-center gap-2">
      {(added > 0 || removed > 0) && (
        <span className="text-[12px] font-medium tabular-nums">
          <span className="text-add">+{fmtNum(added)}</span> <span className="text-del">−{fmtNum(removed)}</span>
        </span>
      )}
      <Seg
        size="sm"
        options={[
          { value: 'inline', label: tr('Inline') },
          { value: 'split', label: tr('Side by side') },
        ]}
        value={mode}
        onChange={setMode}
      />
      <Copy text={after} label={tr('Copy the new version')} />
    </div>
  );
  return (
    <Card>
      {(str(data.title) || tools) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">{str(data.title) && <h3 className="aui-h3">{str(data.title)}</h3>}</div>
          {tools}
        </div>
      )}
      {!done ? (
        (after || before) &&
        (code ? (
          <pre className="m-0 overflow-hidden rounded-xl border border-line bg-code-bg px-3 py-2 font-mono text-[12.5px] leading-[1.6] break-words whitespace-pre-wrap">{after || before}</pre>
        ) : (
          <div className="text-[14px] leading-[1.75] break-words whitespace-pre-wrap">{after || before}</div>
        ))
      ) : code ? (
        <CodeDiff blocks={blocks} split={split} />
      ) : split ? (
        <div className="grid gap-3 @xl:grid-cols-2">
          {(['a', 'b'] as const).map((side) => (
            <div key={side} className="min-w-0 rounded-xl border border-line px-3.5 py-2.5">
              <div className="mb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{side === 'a' ? tr('Before') : tr('After')}</div>
              <ProseDiff pieces={pieces} side={side} />
            </div>
          ))}
        </div>
      ) : (
        <ProseDiff pieces={pieces} />
      )}
      {notes.length > 0 && (
        <ul className="m-0 mt-3.5 list-none space-y-1.5 border-t border-line p-0 pt-3">
          {notes.map((n, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-fg-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <Md text={n} inline />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- a citation: its sources, and the styles that write them out ----------------------------------------------------------

/** A piece of a reference as a style writes it: words, in italics or not. */
interface Run {
  t: string;
  i?: boolean;
}

interface Person {
  family: string;
  given: string;
  /** An organisation (or a name of one word): written as it is, never turned into initials. */
  whole: boolean;
}

type SourceType = 'article' | 'book' | 'chapter' | 'conference' | 'web' | 'thesis' | 'report';

interface Source {
  type: SourceType;
  authors: Person[];
  title: string;
  container: string;
  year: string;
  month: number | null;
  day: number | null;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  place: string;
  editors: Person[];
  edition: number | null;
  number: string;
  degree: 'phd' | 'masters';
  doi: string;
  url: string;
  accessed: { y: number; m: number; d: number } | null;
}

const ORG_WORDS = /\b(organi[sz]ation|association|institute|university|society|committee|council|group|inc|ltd|llc|gmbh|corporation|company|department|agency|foundation|bank|office|board|cent(?:re|er)|commission|ministry|bureau|consortium|project|programme|program|collaboration|press|network|alliance|federation|union|service|authority|trust|museum|library|school|college|laborator(?:y|ies)|academ(?:y|ies)|nations)\b/i;
const PARTICLE = /^(van|von|de|del|della|der|den|da|di|du|dos|das|le|la|ter|ten|bin|ibn|al|el)$/i;

/** An author or editor as agents write one: "Last, First", "First Last", an organisation, or { family, given }. */
function personOf(v: unknown): Person | null {
  if (isObj(v)) {
    const family = str(v.family ?? v.last ?? v.surname);
    if (family) return { family, given: str(v.given ?? v.first), whole: false };
    v = v.name ?? v.literal;
  }
  const t = str(v).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (t.includes(',') && !ORG_WORDS.test(t)) {
    const k = t.indexOf(',');
    return { family: t.slice(0, k).trim(), given: t.slice(k + 1).trim(), whole: false };
  }
  const w = t.split(' ');
  if (w.length === 1 || w.length > 4 || ORG_WORDS.test(t)) return { family: t, given: '', whole: true };
  let k = w.length - 1;
  while (k > 1 && PARTICLE.test(w[k - 1])) k--;
  return { family: w.slice(k).join(' '), given: w.slice(0, k).join(' '), whole: false };
}

const peopleOf = (v: unknown): Person[] =>
  (Array.isArray(v) ? v : str(v) ? str(v).split(/\s*;\s*|\s+and\s+|\s+&\s+/) : [])
    .map(personOf)
    .filter((p): p is Person => !!p);

/** Given names as initials: "Ming-Wei" → "M.-W.", "J.R.R." → "J. R. R." (`spaced` false: "J.R.R."). */
function initialsOf(given: string, spaced = true): string {
  return given
    .replace(/\./g, '. ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w
        .split('-')
        .filter(Boolean)
        .map((h) => `${([...h.replace(/\.$/, '')][0] ?? '').toUpperCase()}.`)
        .join('-'),
    )
    .filter((x) => x.length > 1)
    .join(spaced ? ' ' : '');
}

const full = (p: Person) => (p.given ? `${p.given} ${p.family}` : p.family);
const inverted = (p: Person) => (p.given ? `${p.family}, ${p.given}` : p.family);
const familyFirst = (p: Person, spaced = true) => (p.given ? `${p.family}, ${initialsOf(p.given, spaced)}` : p.family);
const initialsFirst = (p: Person) => (p.given ? `${initialsOf(p.given)} ${p.family}` : p.family);

/** Names joined as English writes them: "A, B, and C" (`serial` false: "A, B and C"). */
function joinNames(names: string[], and = 'and', serial = true): string {
  if (names.length <= 1) return names.join('');
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}${serial ? ',' : ''} ${and} ${names[names.length - 1]}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const IEEE_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
const BIB_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const bareDoi = (d: string) => d.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '');
const doiUrl = (d: string) => `https://doi.org/${bareDoi(d)}`;
const ended = (s: string) => /[.?!]$/.test(s.trim());

/** Pages as a range with an en dash ("4171–4186"), or one page. */
const pagesFull = (p: string) => p.trim().replace(/\s*(?:--|[-–—])\s*/g, '–');
const pageWord = (p: string) => (/[–-]/.test(pagesFull(p)) ? 'pp.' : 'p.');

/**
 * A range written short, as MLA does (4171–86, 1103–04: two digits at least) and Chicago (4171–86, 1103–4, 1496–500;
 * all of them from a hundred, or a page under a hundred).
 */
function pagesShort(p: string, chicago: boolean): string {
  const m = /^(\d+)–(\d+)$/.exec(pagesFull(p));
  if (!m) return pagesFull(p);
  const [a, b] = [m[1], m[2]];
  const n = Number(a);
  if (Number(b) <= n || n < 100 || a.length !== b.length || (chicago && n % 100 === 0)) return `${a}–${b}`;
  for (let k = chicago && n % 100 < 10 ? 1 : 2; k < b.length; k++) if (a.slice(0, a.length - k) + b.slice(b.length - k) === b) return `${a}–${b.slice(b.length - k)}`;
  return `${a}–${b}`;
}

const MINOR = new Set(
  'a an the and but or nor for so yet as at by in of off on per to up via vs vs. v. from into onto over with than about above across after against along among around before behind below beneath beside between beyond despite down during except inside like near outside past since through throughout toward towards under underneath until upon within without'.split(
    ' ',
  ),
);

/** Prefixes that cannot stand alone: the part after their hyphen stays small in title case (Pre-training, Non-linear). */
const PREFIXES = new Set('anti bi co counter de extra hyper infra inter intra macro meta micro mid mis multi neo non post pre pro proto pseudo quasi re semi sub super trans tri ultra un'.split(' '));

/** A word in title case: its first letter capitalised, and those of the parts after its hyphens but small words and parts after a prefix. */
const capWord = (w: string) =>
  w
    .split('-')
    .map((part, k, all) => (k === 0 || (!PREFIXES.has(all[0].toLowerCase()) && !MINOR.has(part.toLowerCase())) ? part.replace(/\p{L}/u, (c) => c.toUpperCase()) : part))
    .join('-');

/**
 * A title in title case, as MLA and Chicago write it: every word capitalised but articles, prepositions and
 * conjunctions (the first and last word, and the first after a colon, always); words with capitals of their own (BERT,
 * iPhone) and numbers as they are; in a hyphenated word, its later parts too (Short-Term) unless after a prefix (Pre-training).
 */
function titleCase(s: string): string {
  const parts = s.split(/(\s+)/);
  let last = parts.length - 1;
  while (last > 0 && !parts[last].trim()) last--;
  let start = true;
  return parts
    .map((p, i) => {
      if (!p.trim()) return p;
      const first = start;
      start = /[:?!.—–]$/.test(p);
      if (/\p{Lu}/u.test(p.slice(1)) || /\d/.test(p)) return p;
      const bare = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.]+$/gu, '').toLowerCase();
      if (!first && i !== last && MINOR.has(bare)) return p.toLowerCase();
      return capWord(p);
    })
    .join('');
}

/** The month as a number, from 6, "6", "June" or "Jun". */
function monthOf(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n >= 1 && n <= 12 ? Math.round(n) : null;
  const t = str(v).trim().toLowerCase().slice(0, 3);
  const i = BIB_MONTHS.indexOf(t);
  return i >= 0 ? i + 1 : null;
}

function typeOf(v: unknown, d: Data): SourceType {
  const t = str(v).toLowerCase();
  if (/chapter|incollection|inbook|section/.test(t)) return 'chapter';
  if (/conf|proceed|symposium|workshop|inproceedings/.test(t)) return 'conference';
  if (/thesis|dissertation|phd|master/.test(t)) return 'thesis';
  if (/report|white ?paper|techreport/.test(t)) return 'report';
  if (/web|site|page|online|blog|url|post/.test(t)) return 'web';
  if (/book|monograph/.test(t)) return 'book';
  if (/article|journal|paper|magazine|newspaper/.test(t)) return 'article';
  return str(d.volume ?? d.issue) ? 'article' : str(d.container) ? 'chapter' : str(d.url) && !str(d.publisher) ? 'web' : 'book';
}

/** A source as agents write it, read leniently. */
function sourceOf(d: Data): Source {
  const date = str(d.date ?? d.published);
  const dm = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(date);
  const am = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str(d.accessed ?? d.retrieved));
  const edition = num(str(d.edition).replace(/(st|nd|rd|th)\b.*$/i, ''));
  const type = typeOf(d.type ?? d.kind, d);
  return {
    type,
    authors: peopleOf(d.authors ?? d.author),
    title: str(d.title).trim(),
    container: str(d.container ?? d.journal ?? d.booktitle ?? d.proceedings ?? d.website ?? d.site).trim(),
    year: str(d.year) || dm?.[1] || '',
    month: monthOf(d.month) ?? (dm?.[2] ? monthOf(dm[2]) : null),
    day: num(d.day) ?? (dm?.[3] ? Number(dm[3]) : null),
    volume: str(d.volume),
    issue: str(d.issue) || (type === 'article' ? str(d.number) : ''),
    pages: str(d.pages ?? d.page),
    publisher: str(d.publisher ?? d.university ?? d.institution ?? d.school),
    place: str(d.place ?? d.location ?? d.address ?? d.city),
    editors: peopleOf(d.editors ?? d.editor),
    edition: edition !== null && edition > 0 ? Math.round(edition) : null,
    number: type === 'article' ? '' : str(d.number ?? d.report_number),
    degree: /master|\bm\.?a\b|\bm\.?s/i.test(str(d.degree)) ? 'masters' : 'phd',
    doi: str(d.doi).trim(),
    url: /^https?:\/\//i.test(str(d.url).trim()) ? str(d.url).trim() : '',
    accessed: am ? { y: Number(am[1]), m: Number(am[2]), d: Number(am[3]) } : null,
  };
}

/** Builds a reference from its pieces: `end` closes what is there with a mark (unless it ends with one already). */
function refBuilder() {
  const runs: Run[] = [];
  const lastText = () => {
    for (let k = runs.length - 1; k >= 0; k--) if (runs[k].t.trim()) return runs[k].t.trimEnd();
    return '';
  };
  const b = {
    add(t: string, i = false) {
      if (t) runs.push(i ? { t, i } : { t });
      return b;
    },
    end(mark = '.') {
      const l = lastText();
      if (l && !ended(l)) runs.push({ t: mark });
      if (runs.length) runs.push({ t: ' ' });
      return b;
    },
    done(): Run[] {
      while (runs.length && !runs[runs.length - 1].t.trim()) runs.pop();
      if (runs.length && !runs[runs.length - 1].i) runs[runs.length - 1] = { t: runs[runs.length - 1].t.trimEnd() };
      return runs;
    },
  };
  return b;
}

const quote = (t: string, mark: string) => `“${t}${ended(t) ? '' : mark}”`;
const mdy = (a: { y: number; m: number; d: number }) => `${MONTHS[a.m - 1]} ${a.d}, ${a.y}`;

/** APA, 7th edition. */
function apa(s: Source): Run[] {
  const b = refBuilder();
  const names = s.authors.map((p) => familyFirst(p));
  const authors = names.length <= 1 ? names.join('') : names.length <= 20 ? `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}` : `${names.slice(0, 19).join(', ')}, . . . ${names[names.length - 1]}`;
  const date = s.type === 'web' && s.year && s.month ? `${s.year}, ${MONTHS[s.month - 1]}${s.day ? ` ${s.day}` : ''}` : s.year || 'n.d.';
  const italic = !['article', 'chapter', 'conference'].includes(s.type);
  const link = s.doi ? doiUrl(s.doi) : s.url;
  const title = () => {
    b.add(s.title, italic);
    if (s.type === 'book' && s.edition && s.edition > 1) b.add(` (${ordinal(s.edition)} ed.)`);
    if (s.type === 'report' && s.number) b.add(` (Report No. ${s.number})`);
    if (s.type === 'thesis') b.add(` [${s.degree === 'masters' ? 'Master’s thesis' : 'Doctoral dissertation'}${s.publisher ? `, ${s.publisher}` : ''}]`);
    b.end('.');
  };
  if (authors) {
    b.add(authors).end('.').add(`(${date})`).end('.');
    title();
  } else {
    title();
    b.add(`(${date})`).end('.');
  }
  if (s.type === 'article' && s.container) {
    b.add(s.container, true);
    if (s.volume) b.add(', ').add(s.volume, true);
    if (s.issue) b.add(`${s.volume ? '' : ', '}(${s.issue})`);
    if (s.pages) b.add(`, ${pagesFull(s.pages)}`);
    b.end('.');
  } else if ((s.type === 'chapter' || s.type === 'conference') && s.container) {
    b.add('In ');
    if (s.editors.length) {
      const eds = s.editors.map(initialsFirst);
      b.add(`${eds.length > 2 ? `${eds.slice(0, -1).join(', ')}, & ${eds[eds.length - 1]}` : eds.join(' & ')} (${eds.length > 1 ? 'Eds.' : 'Ed.'}), `);
    }
    b.add(s.container, true);
    const more = [s.edition && s.edition > 1 ? `${ordinal(s.edition)} ed.` : '', s.pages ? `${pageWord(s.pages)} ${pagesFull(s.pages)}` : ''].filter(Boolean);
    if (more.length) b.add(` (${more.join(', ')})`);
    b.end('.');
  }
  if (s.publisher && ['book', 'report', 'chapter', 'conference'].includes(s.type) && s.publisher !== authors) b.add(s.publisher).end('.');
  if (s.type === 'web' && s.container && s.container !== authors) b.add(s.container).end('.');
  if (link) b.add(s.type === 'web' && s.accessed ? `Retrieved ${mdy(s.accessed)}, from ${link}` : link);
  return b.done();
}

/** MLA, 9th edition. */
function mla(s: Source): Run[] {
  const b = refBuilder();
  const a = s.authors;
  const authors = a.length === 0 ? '' : a.length === 1 ? inverted(a[0]) : a.length === 2 ? `${inverted(a[0])}, and ${full(a[1])}` : `${inverted(a[0])}, et al.`;
  if (authors) b.add(authors).end('.');
  const title = titleCase(s.title);
  if (['article', 'chapter', 'conference', 'web'].includes(s.type)) b.add(quote(title, '.')).add(' ');
  else b.add(title, true).end('.');
  const parts: Run[] = [];
  if (s.type === 'thesis') {
    if (s.year) b.add(s.year).end('.');
    parts.push({ t: [s.publisher, s.degree === 'masters' ? 'MA thesis' : 'PhD dissertation'].filter(Boolean).join(', ') });
  } else {
    if (s.container && s.type !== 'book' && s.type !== 'report') parts.push({ t: titleCase(s.container), i: true });
    const e = s.editors;
    if (e.length) parts.push({ t: `edited by ${e.length > 2 ? `${full(e[0])} et al.` : e.map(full).join(' and ')}` });
    if (s.edition && s.edition > 1) parts.push({ t: `${ordinal(s.edition)} ed.` });
    if (s.volume) parts.push({ t: `vol. ${s.volume}` });
    if (s.issue) parts.push({ t: `no. ${s.issue}` });
    if (s.type === 'report' && s.number) parts.push({ t: `no. ${s.number}` });
    if (s.publisher && s.type !== 'article' && s.publisher !== authors) parts.push({ t: s.publisher });
    const date = s.year ? `${s.day && s.month ? `${s.day} ` : ''}${s.month ? `${MLA_MONTHS[s.month - 1]} ` : ''}${s.year}` : '';
    if (date) parts.push({ t: date });
    if (s.pages) parts.push({ t: `${pageWord(s.pages)} ${pagesShort(s.pages, false)}` });
  }
  const link = s.doi ? doiUrl(s.doi) : s.url.replace(/^https?:\/\//i, '');
  if (link) parts.push({ t: link });
  parts.forEach((p, k) => {
    if (k) b.add(', ');
    b.add(k === 0 && !p.i && !/^(https?:|www\.)/.test(p.t) ? p.t.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : p.t, p.i);
  });
  if (parts.length) b.end('.');
  if (s.type === 'web' && s.accessed) b.add(`Accessed ${s.accessed.d} ${MLA_MONTHS[s.accessed.m - 1]} ${s.accessed.y}`).end('.');
  return b.done();
}

/** Chicago, 17th edition, author-date. */
function chicago(s: Source): Run[] {
  const b = refBuilder();
  const a = s.authors.length > 10 ? s.authors.slice(0, 7) : s.authors;
  const names = a.map((p, i) => (i ? full(p) : inverted(p)));
  const authors = s.authors.length > 10 ? `${names.join(', ')}, et al.` : names.length === 2 ? `${names[0]}, and ${names[1]}` : joinNames(names);
  const title = titleCase(s.title);
  const putTitle = () => (['article', 'chapter', 'conference', 'web', 'thesis'].includes(s.type) ? b.add(quote(title, '.')).add(' ') : b.add(title, true).end('.'));
  if (authors) {
    b.add(authors).end('.').add(s.year || 'n.d.').end('.');
    putTitle();
  } else {
    putTitle();
    b.add(s.year || 'n.d.').end('.');
  }
  const where = [s.place, s.publisher].filter(Boolean).join(': ');
  if (s.type === 'article' && s.container) {
    b.add(titleCase(s.container), true);
    if (s.volume) b.add(` ${s.volume}`);
    if (s.issue) b.add(` (${s.issue})`);
    if (s.pages) b.add(`${s.volume || s.issue ? ':' : ','} ${pagesShort(s.pages, true)}`);
    b.end('.');
  } else if ((s.type === 'chapter' || s.type === 'conference') && s.container) {
    b.add('In ').add(titleCase(s.container), true);
    if (s.editors.length) b.add(`, edited by ${joinNames(s.editors.map(full))}`);
    if (s.pages) b.add(`, ${pagesShort(s.pages, true)}`);
    b.end('.');
  } else if (s.type === 'book' && s.edition && s.edition > 1) b.add(`${ordinal(s.edition)} ed.`).end('.');
  else if (s.type === 'report' && s.number) b.add(`Report ${s.number}`).end('.');
  else if (s.type === 'thesis') b.add(`${s.degree === 'masters' ? 'Master’s thesis' : 'PhD diss.'}${s.publisher ? `, ${s.publisher}` : ''}`).end('.');
  else if (s.type === 'web') {
    if (s.container) b.add(s.container).end('.');
    if (s.accessed) b.add(`Accessed ${mdy(s.accessed)}`).end('.');
  }
  if (where && ['book', 'chapter', 'conference', 'report'].includes(s.type)) b.add(where).end('.');
  const link = s.doi ? doiUrl(s.doi) : s.url;
  if (link) b.add(link).end('.');
  return b.done();
}

/** IEEE. */
function ieee(s: Source): Run[] {
  const b = refBuilder();
  const names = s.authors.map(initialsFirst);
  const authors = s.authors.length > 6 ? `${names[0]} et al.` : joinNames(names);
  const date = s.year ? `${s.month ? `${IEEE_MONTHS[s.month - 1]} ` : ''}${s.year}` : '';
  const doi = s.doi ? `doi: ${bareDoi(s.doi)}` : '';
  const pages = s.pages ? `${pageWord(s.pages)} ${pagesFull(s.pages)}` : '';
  const ed = s.edition && s.edition > 1 ? `${ordinal(s.edition)} ed.` : '';
  const where = [s.place, s.publisher].filter(Boolean).join(': ');
  const list = (...xs: string[]) => xs.filter(Boolean).join(', ');
  if (authors) b.add(`${authors}, `);
  if (s.type === 'book') {
    b.add(titleCase(s.title), true);
    if (ed) b.add(`, ${ed}`);
    b.end('.');
    b.add(list(where, s.year, doi)).end('.');
  } else {
    b.add(quote(s.title, ',')).add(' ');
    if (s.type === 'article') {
      if (s.container) b.add(s.container, true).add(', ');
      b.add(list(s.volume ? `vol. ${s.volume}` : '', s.issue ? `no. ${s.issue}` : '', pages, date, doi)).end('.');
    } else if (s.type === 'chapter') {
      b.add('in ');
      if (s.container) b.add(s.container, true);
      const eds = s.editors.length ? `${joinNames(s.editors.map(initialsFirst))}, ${s.editors.length > 1 ? 'Eds' : 'Ed'}.` : '';
      b.add(`${ed ? `, ${ed}` : ''}${eds ? `, ${eds}` : ''}`).end('.');
      b.add(list(where, s.year, pages, doi)).end('.');
    } else if (s.type === 'conference') {
      b.add('in ');
      if (s.container) b.add(s.container, true).add(', ');
      b.add(list(s.place, date, pages, doi)).end('.');
    } else if (s.type === 'thesis') b.add(list(s.degree === 'masters' ? 'M.S. thesis' : 'Ph.D. dissertation', s.publisher, s.place, s.year)).end('.');
    else if (s.type === 'report') b.add(list(s.publisher, s.place, s.number ? `Rep. ${s.number}` : '', date)).end('.');
    else {
      if (s.container) b.add(s.container).end('.');
      if (s.accessed) b.add(`Accessed: ${IEEE_MONTHS[s.accessed.m - 1]} ${s.accessed.d}, ${s.accessed.y}`).end('.');
    }
  }
  if (s.url && !s.doi) b.add(`[Online]. Available: ${s.url}`);
  return b.done();
}

/** Harvard, as Cite Them Right writes it. */
function harvard(s: Source): Run[] {
  const b = refBuilder();
  const names = s.authors.map((p) => familyFirst(p, false));
  const authors = names.length >= 4 ? `${names[0]} et al.` : joinNames(names, 'and', false);
  const quoted = ['article', 'chapter', 'conference'].includes(s.type);
  const title = () => (quoted ? b.add(`‘${s.title}’`).add(', ') : b.add(s.title, true).end('.'));
  if (authors) b.add(`${authors} (${s.year || 'no date'}) `);
  else b.add(`(${s.year || 'no date'}) `);
  title();
  const where = [s.place, s.publisher].filter(Boolean).join(': ');
  if (s.type === 'article') {
    if (s.container) b.add(s.container, true);
    const vol = `${s.volume}${s.issue ? `(${s.issue})` : ''}`;
    if (vol) b.add(`, ${vol}`);
    if (s.pages) b.add(`, ${pageWord(s.pages)} ${pagesFull(s.pages)}`);
    b.end('.');
  } else if (s.type === 'chapter' || s.type === 'conference') {
    b.add('in ');
    if (s.editors.length) b.add(`${joinNames(s.editors.map((p) => familyFirst(p, false)), 'and', false)} (${s.editors.length > 1 ? 'eds' : 'ed.'}) `);
    if (s.container) b.add(s.container, true);
    b.end('.');
    if (where || s.pages) b.add([where, s.pages ? `${pageWord(s.pages)} ${pagesFull(s.pages)}` : ''].filter(Boolean).join(', ')).end('.');
  } else if (s.type === 'book') {
    if (s.edition && s.edition > 1) b.add(`${ordinal(s.edition)} edn`).end('.');
    if (where) b.add(where).end('.');
  } else if (s.type === 'thesis') b.add(s.degree === 'masters' ? 'MA thesis' : 'PhD thesis').end('.').add(s.publisher).end('.');
  else if (s.type === 'report') {
    if (s.number) b.add(`Report ${s.number}`).end('.');
    if (where) b.add(where).end('.');
  }
  const link = s.doi ? doiUrl(s.doi) : s.url;
  if (link) {
    b.add(`Available at: ${link}`);
    if (!s.doi && s.accessed) b.add(` (Accessed: ${s.accessed.d} ${MONTHS[s.accessed.m - 1]} ${s.accessed.y})`);
    b.end('.');
  }
  return b.done();
}

const ascii = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** A BibTeX key as Google Scholar makes them: the first author's family name, the year, the title's first word. */
function bibKey(s: Source): string {
  const who = ascii(s.authors[0]?.family.split(' ').pop() ?? '') || 'anon';
  const word = s.title.split(/\s+/).map(ascii).find((w) => w && !MINOR.has(w)) ?? '';
  return `${who}${s.year.replace(/\D/g, '')}${word}`;
}

const bibEscape = (s: string) => s.replace(/([&%$#_])/g, '\\$1');

/** The title for BibTeX: in title case, with braces round the words that keep their capitals (names, acronyms). */
function bibTitle(t: string): string {
  const parts = t.split(/(\s+)/);
  const titled = titleCase(t).split(/(\s+)/);
  let start = true;
  return parts
    .map((p, i) => {
      if (!p.trim()) return p;
      const first = start;
      start = /[:?!.]$/.test(p);
      const keep = /\p{Lu}/u.test(p.slice(1)) || (!first && /^[^\p{L}]*\p{Lu}/u.test(p));
      return keep ? bibEscape(p).replace(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u, '$1{$2}$3') : bibEscape(titled[i] ?? p);
    })
    .join('');
}

const BIB_TYPE: Record<SourceType, string> = { article: 'article', book: 'book', chapter: 'incollection', conference: 'inproceedings', web: 'misc', thesis: 'phdthesis', report: 'techreport' };
const EDITIONS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

function bibtex(s: Source, key: string): string {
  const names = (ps: Person[]) => ps.map((p) => (p.whole ? `{${bibEscape(p.family)}}` : bibEscape(inverted(p)))).join(' and ');
  const f: [string, string][] = [];
  if (s.authors.length) f.push(['author', `{${names(s.authors)}}`]);
  if (s.title) f.push(['title', `{${bibTitle(s.title)}}`]);
  if (s.container) f.push([s.type === 'article' ? 'journal' : s.type === 'web' ? 'organization' : 'booktitle', `{${bibEscape(s.container)}}`]);
  if (s.editors.length) f.push(['editor', `{${names(s.editors)}}`]);
  if (s.edition && s.edition > 1) f.push(['edition', `{${EDITIONS[s.edition - 1] ?? ordinal(s.edition)}}`]);
  if (s.volume) f.push(['volume', `{${bibEscape(s.volume)}}`]);
  if (s.issue || (s.type === 'report' && s.number)) f.push(['number', `{${bibEscape(s.issue || s.number)}}`]);
  if (s.pages) f.push(['pages', `{${pagesFull(s.pages).replace('–', '--')}}`]);
  if (s.year) f.push(['year', `{${s.year}}`]);
  if (s.month) f.push(['month', BIB_MONTHS[s.month - 1]]);
  if (s.publisher) f.push([s.type === 'thesis' ? 'school' : s.type === 'report' ? 'institution' : 'publisher', `{${bibEscape(s.publisher)}}`]);
  if (s.place) f.push(['address', `{${bibEscape(s.place)}}`]);
  if (s.doi) f.push(['doi', `{${bareDoi(s.doi)}}`]);
  if (s.url) f.push(s.type === 'web' ? ['howpublished', `{\\url{${s.url}}}`] : ['url', `{${s.url}}`]);
  if (s.accessed) f.push(['note', `{Accessed: ${s.accessed.y}-${String(s.accessed.m).padStart(2, '0')}-${String(s.accessed.d).padStart(2, '0')}}`]);
  const w = Math.max(...f.map(([k]) => k.length));
  const type = s.type === 'thesis' && s.degree === 'masters' ? 'mastersthesis' : BIB_TYPE[s.type];
  return `@${type}{${key},\n${f.map(([k, v]) => `  ${k.padEnd(w)} = ${v}`).join(',\n')}\n}`;
}

type StyleId = 'apa' | 'mla' | 'chicago' | 'ieee' | 'harvard' | 'bibtex';
const STYLES: { id: StyleId; label: string; write?: (s: Source) => Run[] }[] = [
  { id: 'apa', label: 'APA 7', write: apa },
  { id: 'mla', label: 'MLA 9', write: mla },
  { id: 'chicago', label: 'Chicago', write: chicago },
  { id: 'ieee', label: 'IEEE', write: ieee },
  { id: 'harvard', label: 'Harvard', write: harvard },
  { id: 'bibtex', label: 'BibTeX' },
];

/** How a source is cited in the text, in a style: (Devlin et al., 2019), [1], \cite{devlin2019bert}. */
function inTextOf(style: StyleId, s: Source, n: number, key: string): string {
  const fam = s.authors.map((p) => p.family);
  const who = fam.length ? '' : `“${s.title.split(/\s+/).slice(0, 4).join(' ')}${s.title.split(/\s+/).length > 4 ? '…' : ''}”`;
  const year = s.year || 'n.d.';
  if (style === 'apa') return `(${who || (fam.length >= 3 ? `${fam[0]} et al.` : fam.join(' & '))}, ${year})`;
  if (style === 'mla') return `(${who || (fam.length >= 3 ? `${fam[0]} et al.` : fam.join(' and '))})`;
  if (style === 'chicago') return `(${who || (fam.length >= 4 ? `${fam[0]} et al.` : joinNames(fam))} ${year})`;
  if (style === 'harvard') return `(${who || (fam.length >= 4 ? `${fam[0]} et al.` : joinNames(fam, 'and', false))}, ${s.year || 'no date'})`;
  if (style === 'ieee') return `[${n}]`;
  return `\\cite{${key}}`;
}

const runsText = (runs: Run[]) => runs.map((r) => r.t).join('');
const htmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const runsHtml = (runs: Run[]) => runs.map((r) => (r.i ? `<i>${htmlEscape(r.t)}</i>` : htmlEscape(r.t))).join('');

// ---- a citation: the view --------------------------------------------------------------------------------------------------

/** Copies a reference with its italics (for a word processor), and as plain text for anywhere else. */
async function copyRich(html: string, text: string) {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    }
  } catch {}
  await copyText(text);
}

function RichCopy({ html, text, label }: { html: () => string; text: () => string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        void copyRich(html(), text());
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
    >
      {ok ? <Check size={14} className="text-ok" /> : <CopyIcon size={14} />}
    </button>
  );
}

function Citation({ data, done }: { data: Data; done: boolean }) {
  const given = arr(data.sources ?? data.references).filter(isObj);
  const one = isObj(data.source ?? data.reference) ? (data.source ?? data.reference) : str(data.title) && (data.authors || data.author) && !given.length ? data : null;
  const sources = (given.length ? given : one ? [one] : []).map(sourceOf).filter((s) => s.title || s.authors.length);
  const wanted = words(data.styles).map((w) => w.toLowerCase().replace(/[^a-z]/g, ''));
  const styles = STYLES.filter((s) => !wanted.length || wanted.some((w) => w.startsWith(s.id) || (w && s.id.startsWith(w))));
  const shown = styles.length ? styles : STYLES;
  const [pick, setPick] = useKept<string>('style', '');
  const style = shown.find((s) => s.id === pick) ?? shown[0];
  // Keys for BibTeX, told apart with a letter when two would be the same.
  const keys: string[] = [];
  for (const s of sources) {
    const k = bibKey(s);
    let key = k;
    for (let c = 0; keys.includes(key); c++) key = `${k}${String.fromCharCode(97 + c)}`;
    keys.push(key);
  }
  // A reference list in an author-date style goes by the authors' names; IEEE numbers them in the order given.
  const order = sources.map((_, i) => i);
  if (style.id !== 'ieee' && style.id !== 'bibtex' && sources.length > 1) {
    const by = (s: Source) => `${(s.authors[0]?.family ?? s.title).toLowerCase()} ${s.year}`;
    order.sort((x, y) => by(sources[x]).localeCompare(by(sources[y])));
  }
  const refs = order.map((i) => ({ i, runs: style.write ? style.write(sources[i]) : [], bib: style.id === 'bibtex' ? bibtex(sources[i], keys[i]) : '' }));
  const ieeeNo = (i: number) => (style.id === 'ieee' ? `[${i + 1}] ` : '');
  const allText = () => refs.map((r) => (style.id === 'bibtex' ? r.bib : `${ieeeNo(r.i)}${runsText(r.runs)}`)).join(style.id === 'bibtex' ? '\n\n' : '\n');
  const allHtml = () => refs.map((r) => `<p>${htmlEscape(ieeeNo(r.i))}${runsHtml(r.runs)}</p>`).join('');
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          done && sources.length > 1 ? (
            style.id === 'bibtex' ? (
              <Copy text={allText} label={tr('Copy all')} />
            ) : (
              <RichCopy html={allHtml} text={allText} label={tr('Copy all')} />
            )
          ) : undefined
        }
      />
      {sources.length > 0 && (
        <>
          {shown.length > 1 && <Seg size="sm" className="mb-3" options={shown.map((s) => ({ value: s.id, label: s.label }))} value={style.id} onChange={(v) => setPick(v)} />}
          <div className="space-y-2.5">
            {refs.map((r) => (
              <div key={r.i} className="rounded-xl border border-line bg-bg-1">
                {style.id === 'bibtex' ? (
                  <div className="flex items-start gap-1 py-2 pr-1.5 pl-3.5">
                    <pre className="m-0 min-w-0 flex-1 font-mono text-[12px] leading-[1.6] break-words whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{r.bib}</pre>
                    {done && <Copy text={r.bib} />}
                  </div>
                ) : (
                  <div className="flex items-start gap-1 py-2.5 pr-1.5 pl-3.5">
                    <p className={cx('m-0 min-w-0 flex-1 text-[14px] leading-relaxed break-words text-fg', style.id === 'ieee' ? 'flex gap-2' : 'pl-6 -indent-6')}>
                      {style.id === 'ieee' && <span className="shrink-0 text-fg-3 tabular-nums">[{r.i + 1}]</span>}
                      <span className="min-w-0">
                        {r.runs.map((x, k) =>
                          x.i ? (
                            <i key={k}>{x.t}</i>
                          ) : (
                            <Fragment key={k}>
                              {x.t.split(/(https?:\/\/[^\s]+?)(?=[.,]?(?:\s|$))/).map((part, j) =>
                                j % 2 ? (
                                  <a key={j} href={part} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
                                    {part}
                                  </a>
                                ) : (
                                  part
                                ),
                              )}
                            </Fragment>
                          ),
                        )}
                      </span>
                    </p>
                    {done && <RichCopy html={() => `${htmlEscape(ieeeNo(r.i))}${runsHtml(r.runs)}`} text={() => `${ieeeNo(r.i)}${runsText(r.runs)}`} label={tr('Copy')} />}
                  </div>
                )}
                <div className="flex min-w-0 items-center gap-2 border-t border-line/70 py-1 pr-1.5 pl-3.5 text-[12.5px]">
                  <span className="shrink-0 text-fg-3">{tr('In the text')}</span>
                  <code className="min-w-0 truncate font-mono text-[12px] text-fg-2">{inTextOf(style.id, sources[r.i], r.i + 1, keys[r.i])}</code>
                  {done && (
                    <span className="ml-auto">
                      <Copy text={inTextOf(style.id, sources[r.i], r.i + 1, keys[r.i])} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

export const WRITING_UIS: Record<string, AnswerUiView> = {
  email: Email,
  variants: Variants,
  'social-post': SocialPost,
  diff: Diff,
  citation: Citation,
};

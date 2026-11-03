// A run as its person sees it: where it stands (with the latest steps while it works), the structured
// result (short fields as a card, long text, lists, and tables, which on a phone become a card a row
// when they would not fit), and the agent's own reply. The owner's pages and the public page show the same.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Check, ChevronRight, CircleAlert, Clock, Copy, Download, ExternalLink, FileDown, Hand, PanelsTopLeft, Play, Square, Table2 } from 'lucide-react';
import type { AnswerColumn, AnswerField, AppRun, RunProgress } from '@shared/apps';
import { cellText, isActive, toCsv } from '@shared/apps';
import { mediaKind, mediaSrc, videoEmbed, type AppAsset, type MediaItem } from '@shared/app-media';
import { openLightbox, openVideo } from '../../components/Lightbox';
import { duration } from '../../lib/format';
import { Markdown } from '../../components/Markdown';
import { cx, Throbber } from '../../components/ui';
import { money } from './api';
import { LOCALE } from '../../i18n/locale';

const humanize = (k: string) => (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');

/** Files that show here: the app's own copies and pictures written out (this page loads nothing from other sites). */
const ownFile = (u: string) => u.startsWith('/app-media/') || /^data:image\//i.test(u);
const nameOfUrl = (u: string) => {
  try {
    return decodeURIComponent(new URL(u, location.href).pathname.split('/').pop() || u);
  } catch {
    return u;
  }
};

/**
 * Pictures, videos, sounds and files in an answer: pictures in a grid that opens large, videos and sounds to play, the
 * rest to download. What is on another site (a video on YouTube, a picture an agent linked to) opens there.
 */
export function MediaList({ items, assets }: { items: MediaItem[]; assets?: Record<string, Pick<AppAsset, 'sha'>> }) {
  const list = items.map((x) => ({ ...x, url: mediaSrc(x.src, assets), kind: x.kind ?? mediaKind(x.src) })).filter((x) => x.url);
  if (!list.length) return <div className="text-[13px] text-fg-3">Nothing here.</div>;
  const pics = list.filter((x) => x.kind === 'image' && ownFile(x.url));
  const rest = list.filter((x) => !pics.includes(x));
  return (
    <div className="space-y-3">
      {pics.length > 0 && (
        <div className={cx('grid gap-2', pics.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3')}>
          {pics.map((p, i) => (
            <figure key={`${p.url}:${i}`} className="m-0 min-w-0">
              <button type="button" className="block w-full cursor-zoom-in overflow-hidden rounded-xl bg-bg-2" onClick={() => openLightbox(pics.map((x) => ({ src: x.url, name: x.caption ?? x.name })), i)}>
                <img src={p.url} alt={p.caption ?? ''} loading="lazy" className={cx('block w-full object-cover', pics.length === 1 ? 'max-h-[70vh]' : 'aspect-[4/3]')} />
              </button>
              {p.caption && (
                <figcaption className="mt-1 text-[12.5px] leading-snug text-fg-3" translate="no">
                  {p.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
      {rest.map((x, i) => {
        const own = ownFile(x.url);
        const caption = x.caption && (
          <div className="mt-1 text-[12.5px] leading-snug text-fg-3" translate="no">
            {x.caption}
          </div>
        );
        if (own && x.kind === 'video')
          return (
            <div key={i}>
              <video controls playsInline preload="metadata" src={x.url} poster={x.poster ? mediaSrc(x.poster, assets) || undefined : undefined} className="block aspect-video w-full rounded-xl bg-black" />
              {caption}
            </div>
          );
        if (own && x.kind === 'audio')
          return (
            <div key={i}>
              <audio controls preload="metadata" src={x.url} className="block w-full" />
              {caption}
            </div>
          );
        const player = videoEmbed(x.url);
        const watch = x.kind === 'video' && !!player;
        if (watch && player)
          return (
            <button key={i} type="button" onClick={() => openVideo(player, x.caption ?? '')} className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-left text-[13.5px] hover:border-line-2 hover:bg-bg-1">
              <Play size={15} className="shrink-0 text-fg-3" />
              <span className="min-w-0 flex-1 truncate" translate="no">
                {x.caption || x.name || nameOfUrl(x.url)}
              </span>
              <span className="shrink-0 text-[12px] text-fg-3">Watch</span>
            </button>
          );
        return (
          <a key={i} href={x.url} target="_blank" rel="noopener noreferrer" {...(own ? { download: x.name ?? '' } : {})} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px] hover:border-line-2 hover:bg-bg-1">
            {own ? <FileDown size={15} className="shrink-0 text-fg-3" /> : watch || x.kind === 'video' ? <Play size={15} className="shrink-0 text-fg-3" /> : <ExternalLink size={15} className="shrink-0 text-fg-3" />}
            <span className="min-w-0 flex-1 truncate" translate="no">
              {x.caption || x.name || nameOfUrl(x.url)}
            </span>
            <span className="shrink-0 text-[12px] text-fg-3">{own ? 'Download' : watch ? 'Watch' : 'Open'}</span>
          </a>
        );
      })}
    </div>
  );
}

function Value({ v, type }: { v: unknown; type?: string }) {
  if (v === null || v === undefined || v === '') return <span className="text-fg-3">—</span>;
  if (type === 'image' && typeof v === 'string') {
    if (!ownFile(v)) return /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">{nameOfUrl(v)}</a> : <span className="text-fg-3">—</span>;
    return (
      <button type="button" className="block cursor-zoom-in" onClick={() => openLightbox([{ src: v }], 0)}>
        <img src={v} alt="" loading="lazy" className="h-14 w-14 rounded-lg bg-bg-2 object-cover" />
      </button>
    );
  }
  if (typeof v === 'boolean') return <span className={cx('inline-flex h-5 items-center rounded px-1.5 text-[12px] font-medium', v ? 'bg-ok/15 text-ok' : 'bg-bg-3 text-fg-2')}>{v ? 'Yes' : 'No'}</span>;
  if (type === 'url' || (typeof v === 'string' && /^https?:\/\/\S+$/.test(v))) {
    const s = String(v);
    let host = s;
    try {
      host = new URL(s).hostname.replace(/^www\./, '');
    } catch {}
    return (
      <a href={s} target="_blank" rel="noopener noreferrer" className="break-all text-accent hover:underline">
        {host}
      </a>
    );
  }
  if (type === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return <span>{d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>;
  }
  if (typeof v === 'number') return <span className="tnum">{v.toLocaleString()}</span>;
  return <span className="whitespace-pre-wrap">{cellText(v)}</span>;
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function SmallButton({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg"
    >
      {done ? <Check size={13} /> : icon}
      {children}
    </button>
  );
}

type Row = Record<string, unknown>;

const blank = (v: unknown) => cellText(v).trim() === '';

/** About how many characters a cell shows: a date as Value writes it, a link by its host. */
function shownChars(v: unknown, type: string): number {
  const s = cellText(v);
  if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(s)) return 17;
  if (type === 'url' || /^https?:\/\/\S+$/.test(s)) return s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].length;
  return s.length;
}

/** A column that reads on a line of a phone (numbers, dates, links, names, prices): one long cell does not change that. */
function isShort(c: AnswerColumn, rows: Row[]): boolean {
  if (c.type !== 'text') return true;
  const lens = rows.map((r) => shownChars(r[c.id], c.type)).filter((n) => n > 0);
  return lens.filter((n) => n <= 28).length >= lens.length * 0.8;
}

/** The width a column needs to read well in a table: its usual cell when short, room for a few words a line when not. */
function colWidth(c: AnswerColumn, rows: Row[]): number {
  if (!isShort(c, rows)) return 180;
  return Math.max(c.label.length, ...rows.map((r) => shownChars(r[c.id], c.type)).filter((n) => n <= 28)) * 7 + 20;
}

function useWidth(): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

/**
 * A table too wide for a phone, as a card a row: the first column (and the dates right after it) names
 * the row ("Day 1 · Fri, Mar 26, 2027"), short values sit beside their label, long text under it.
 */
function RowCards({ cols, rows }: { cols: AnswerColumn[]; rows: Row[] }) {
  let n = 1;
  while (n < cols.length && cols[n].type === 'date') n++;
  const [head, dates, rest] = [cols[0], cols.slice(1, n), cols.slice(n)];
  const inline = new Set(rest.filter((c) => isShort(c, rows)).map((c) => c.id));
  return (
    <div className="divide-y divide-line">
      {rows.map((r, i) => (
        <div key={i} className="py-3.5 first:pt-1.5 last:pb-0.5">
          <div className="text-[14.5px] leading-snug font-semibold">
            {(head.type === 'number' || head.type === 'yesno') && `${head.label} `}
            <Value v={r[head.id]} type={head.type} />
            {dates.map(
              (c) =>
                !blank(r[c.id]) && (
                  <span key={c.id} className="font-normal text-fg-2">
                    {' · '}
                    <Value v={r[c.id]} type={c.type} />
                  </span>
                ),
            )}
          </div>
          <dl className="mt-2 space-y-2.5">
            {rest.map((c) =>
              blank(r[c.id]) ? null : inline.has(c.id) ? (
                <div key={c.id} className="flex gap-3">
                  <dt className="w-24 shrink-0 pt-px text-[12.5px] text-fg-3">{c.label}</dt>
                  <dd className="min-w-0 flex-1 text-[14px] leading-snug">
                    <Value v={r[c.id]} type={c.type} />
                  </dd>
                </div>
              ) : (
                <div key={c.id}>
                  <dt className="text-[12.5px] text-fg-3">{c.label}</dt>
                  <dd className="mt-0.5 text-[14px] leading-relaxed">
                    <Value v={r[c.id]} type={c.type} />
                  </dd>
                </div>
              ),
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function ResultTable({ f, rows }: { f: AnswerField; rows: Row[] }) {
  const [ref, width] = useWidth();
  const cols: AnswerColumn[] = f.columns?.length ? f.columns : Object.keys(rows[0] ?? {}).map((id) => ({ id, label: humanize(id), type: 'text' as const }));
  if (!rows.length) return <div className="text-[13px] text-fg-3">Nothing here.</div>;
  // A phone (or a narrow pane) gets a card a row when the columns would not fit; a wider screen keeps the table.
  const cards = width > 0 && width < 640 && cols.reduce((sum, c) => sum + colWidth(c, rows), 0) > width;
  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1 pb-1">
      {cards ? (
        <RowCards cols={cols} rows={rows} />
      ) : (
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.id} className="border-b border-line px-2.5 py-2 text-left text-[12px] font-medium whitespace-nowrap text-fg-3 first:pl-0">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                {cols.map((c) => (
                  <td key={c.id} className={cx('border-b border-line px-2.5 py-2 leading-snug first:pl-0', c.type === 'number' && 'text-right', (c.type === 'number' || c.type === 'date') && 'whitespace-nowrap')}>
                    <Value v={r[c.id]} type={c.type} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const SHORT = new Set(['text', 'number', 'yesno', 'date', 'url']);

/** The answer fields: short ones together as a card, the rest each under its heading. */
export function ResultView({ answer, result, name, assets }: { answer: AnswerField[]; result: Record<string, unknown>; name?: string; assets?: Record<string, Pick<AppAsset, 'sha'>> }) {
  // Fields the recipe does not name (an agent's extra keys) are left out; a result from an older recipe shows by its keys.
  const fields: AnswerField[] = answer.length ? answer : Object.keys(result).map((id) => ({ id, label: humanize(id), type: Array.isArray(result[id]) ? (typeof (result[id] as unknown[])[0] === 'object' ? 'table' : 'list') : 'text' }));
  const short = fields.filter((f) => SHORT.has(f.type) && !(typeof result[f.id] === 'string' && (result[f.id] as string).length > 160));
  const long = fields.filter((f) => !short.includes(f));
  return (
    <div className="space-y-3">
      {short.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel px-4 py-1">
          {short.map((f) => (
            <div key={f.id} className="flex flex-col gap-0.5 border-b border-line py-2.5 last:border-0 sm:flex-row sm:gap-4">
              <div className="shrink-0 text-[12.5px] text-fg-3 sm:w-44 sm:pt-px">{f.label}</div>
              <div className="min-w-0 flex-1 text-[14px]">
                <Value v={result[f.id]} type={f.type} />
              </div>
            </div>
          ))}
        </div>
      )}
      {long.map((f) => {
        const v = result[f.id];
        const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
        return (
          <section key={f.id} className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3.5">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold">{f.label}</h3>
              {f.type === 'table' && rows.length > 0 && (
                <>
                  <SmallButton icon={<Copy size={13} />} onClick={() => copyText(toCsv([(f.columns ?? []).map((c) => c.label), ...rows.map((r) => (f.columns ?? []).map((c) => r[c.id]))]).replace(/\r\n/g, '\n'))}>
                    Copy
                  </SmallButton>
                  <SmallButton icon={<Download size={13} />} onClick={() => download(`${(name ?? 'result').replace(/[^\w-]+/g, '-')}-${f.id}.csv`, `﻿${toCsv([(f.columns ?? []).map((c) => c.label), ...rows.map((r) => (f.columns ?? []).map((c) => r[c.id]))])}`)}>
                    CSV
                  </SmallButton>
                </>
              )}
              {(f.type === 'markdown' || f.type === 'text') && typeof v === 'string' && v && (
                <SmallButton icon={<Copy size={13} />} onClick={() => copyText(v)}>
                  Copy
                </SmallButton>
              )}
            </div>
            {f.type === 'table' ? (
              <ResultTable f={f} rows={rows} />
            ) : f.type === 'media' ? (
              <MediaList items={Array.isArray(v) ? (v as MediaItem[]).map((x) => (typeof x === 'string' ? { src: x } : x)) : typeof v === 'string' && v ? [{ src: v }] : []} assets={assets} />
            ) : f.type === 'list' ? (
              Array.isArray(v) && v.length ? (
                <ul className="list-disc space-y-1 pl-5 text-[14px] leading-relaxed marker:text-fg-3">
                  {(v as unknown[]).map((x, i) => (
                    <li key={i}>{cellText(x)}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-fg-3">Nothing here.</div>
              )
            ) : typeof v === 'string' && v ? (
              <Markdown text={v} className="text-[14px]" />
            ) : (
              <Value v={v} type={f.type} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function Elapsed({ from }: { from: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tnum">{duration(Date.now() - from)}</span>;
}

/** Where a run stands, in a line, with its latest steps while it works; after a follow-up, how that one went. */
export function RunStatusCard({ run, progress, publicView, children, followUp }: { run: AppRun; progress?: RunProgress; publicView?: boolean; children?: ReactNode; followUp?: { updated: boolean } }) {
  const active = isActive(run.status);
  const took = run.endedAt && (run.startedAt ?? run.createdAt) ? duration(run.endedAt - (run.startedAt ?? run.createdAt)) : '';
  const head = (() => {
    switch (run.status) {
      case 'queued':
        return { icon: <Clock size={16} className="text-fg-3" />, text: 'Waiting its turn', tone: '' };
      case 'starting':
        return { icon: <Throbber className="text-[17px] text-fg-2" />, text: 'Starting…', tone: '' };
      case 'running':
        return {
          icon: <Throbber className="text-[17px] text-fg-2" />,
          text: (
            <>
              Working · <Elapsed from={run.startedAt ?? run.createdAt} />
            </>
          ),
          tone: '',
        };
      case 'waiting':
        return { icon: <Hand size={16} className="text-warn" />, text: progress?.waiting ?? 'Waiting for you', tone: 'text-warn' };
      case 'done':
        return { icon: <Check size={16} className="text-ok" strokeWidth={2.6} />, text: `${followUp ? (followUp.updated ? 'Updated' : 'Answered') : 'Done'}${took ? ` in ${took}` : ''}`, tone: '' };
      case 'stopped':
        return { icon: <Square size={13} className="text-fg-3" />, text: 'Stopped', tone: 'text-fg-2' };
      default:
        return { icon: <CircleAlert size={16} className="text-err" />, text: 'It did not finish', tone: 'text-err' };
    }
  })();
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex h-5 w-5 items-center justify-center">{head.icon}</span>
        <span className={cx('min-w-0 flex-1 text-[14px] font-medium', head.tone)}>{head.text}</span>
        {!publicView && run.costUsd != null && !active && <span className="tnum text-[12.5px] text-fg-3">{money(run.costUsd)}</span>}
        {children}
      </div>
      {run.error && (run.status === 'failed' || run.status === 'stopped' || run.status === 'done') && <div className={cx('mt-1.5 pl-8 text-[13px] leading-snug', run.status === 'done' ? 'text-fg-3' : 'text-err')}>{run.error}</div>}
      {active && progress && (progress.steps.length > 0 || progress.said) && (
        <div className="mt-2.5 space-y-1 border-t border-line pt-2.5 pl-8">
          {progress.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', s.status === 'running' ? 'bg-busy' : s.status === 'error' ? 'bg-err' : 'bg-fg-3/50')} />
              <span className={cx('min-w-0 truncate', s.status === 'running' ? 'shine text-fg' : 'text-fg-2')} translate={progress.own ? 'no' : undefined}>
                {s.title}
              </span>
            </div>
          ))}
          {progress.said && <div className="line-clamp-2 pt-1 text-[12.5px] leading-snug text-fg-3 italic">“{progress.said}”</div>}
        </div>
      )}
    </div>
  );
}

/** The agent's reply: open when it is all there is, folded under the result otherwise. */
export function ReplyBlock({ text, folded }: { text: string; folded: boolean }) {
  const [open, setOpen] = useState(!folded);
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3.5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold">{folded ? 'The agent’s reply' : 'Answer'}</h3>
        {open && (
          <span onClick={(e) => e.stopPropagation()}>
            <SmallButton icon={<Copy size={13} />} onClick={() => copyText(text)}>
              Copy
            </SmallButton>
          </span>
        )}
      </button>
      {open && <Markdown text={text} className="mt-2 text-[14px]" />}
    </section>
  );
}

/**
 * Everything about a run below its header: status, result, reply. Where follow-ups came after the task:
 * `reply`, what the agent said back to the task (the run's own reply is to the latest one), and `followUp`,
 * the latest of them.
 */
export function RunBody({
  run,
  progress,
  answer,
  publicView,
  name,
  statusExtra,
  reply,
  followUp,
  view,
  assets,
  noReply,
}: {
  run: AppRun;
  progress?: RunProgress;
  answer: AnswerField[];
  publicView?: boolean;
  name?: string;
  statusExtra?: ReactNode;
  reply?: string;
  followUp?: { updated: boolean };
  /** The app's view of its answer (View.tsx), shown in place of the plain card; Plain answer shows that instead. */
  view?: ReactNode;
  /** The app's own files, by name (asset:<name> in its answer). */
  assets?: Record<string, Pick<AppAsset, 'sha'>>;
  /** Leave out the agent's reply when there is a result (in a session, whose agent says what came of it). */
  noReply?: boolean;
}) {
  const hasResult = !!run.result && Object.keys(run.result).length > 0;
  const text = reply ?? run.reply;
  const [plain, setPlain] = useState(false);
  const inView = !!view && hasResult && !plain;
  return (
    <div className="space-y-3">
      <RunStatusCard run={run} progress={progress} publicView={publicView} followUp={followUp}>
        {statusExtra}
        {!!view && hasResult && (
          <button type="button" onClick={() => setPlain((p) => !p)} className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
            {plain ? <PanelsTopLeft size={13} /> : <Table2 size={13} />}
            {plain ? 'Its view' : 'Plain answer'}
          </button>
        )}
      </RunStatusCard>
      {hasResult && (inView ? view : <ResultView answer={answer} result={run.result!} name={name} assets={assets} />)}
      {text && !(noReply && hasResult) && (reply !== undefined || !isActive(run.status) || !hasResult) && <ReplyBlock key={`${run.id}-${hasResult}`} text={text} folded={hasResult} />}
    </div>
  );
}
